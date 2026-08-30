import assert from "assert";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { readToolCallMeta } from "../../../../common/meta/agentToolCallMeta.js";
import { MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildDefaultChatUri, getInlineToolInput } from "../../../../common/state/sessionState.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import {
  AgentHostE2EServerLease,
  assertToolCallCompleteText,
  createRealSession,
  dispatchTurn,
  driveTurnToCompletion,
  driveTurnWithAttachmentsToCompletion,
  removeTempDirs,
  resolveGitHubToken,
  runAhpSnapshotTest
} from "../harness/agentHostE2ETestHarness.js";
import { assertRecordedAhpSnapshot } from "../harness/ahpSnapshot.js";
import { defineAgentHostE2ETests } from "../suites/agentHostE2ESuites.js";
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { COPILOT_CONFIG } from "./copilotTestConfiguration.js";
const RECORD_ONLY = process.env["AGENT_HOST_REPLAY_RECORD"] === "1";
const RECORD = RECORD_ONLY || process.env["AGENT_HOST_UPDATE_SNAPSHOTS"] === "1";
const isWindows = process.platform === "win32";
defineAgentHostE2ETests(COPILOT_CONFIG);
suite("Agent Host E2E \u2014 Copilot (Copilot-specific)", function() {
  let client;
  let lease;
  const createdSessions = [];
  const tempDirs = [];
  suiteSetup(function() {
    lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
  });
  setup(async function() {
    this.timeout(6e4);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    ({ client } = await lease.acquire(this.currentTest?.title ?? "unknown"));
  });
  teardown(async function() {
    this.timeout(12e4);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    const failed = this.currentTest?.state === "failed";
    if (failed) {
      lease.dumpRuntimeLogsOnFailure(this.currentTest?.title ?? "unknown");
    }
    const errors = [];
    try {
      await lease.release(createdSessions, failed);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    try {
      await removeTempDirs(tempDirs);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to dispose Copilot-specific E2E test resources");
    }
  });
  test("client tool reaches ready after start and completes", async function() {
    this.timeout(18e4);
    await runAhpSnapshotTest(client, COPILOT_CONFIG, this.test, createdSessions, tempDirs, {
      ignoredActionTypes: [ActionType.ChatUsage]
    });
    const start = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((action) => action.toolName === "get_magic_word");
    const ready = start && client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallReady")).map((n) => getActionEnvelope(n).action).find((action) => action.toolCallId === start.toolCallId);
    const deltas = start && client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallDelta")).map((n) => getActionEnvelope(n).action).filter((action) => action.toolCallId === start.toolCallId);
    assert.deepStrictEqual({
      startContributor: start?.contributor,
      readyContributor: ready?.contributor,
      deltaCount: deltas?.length
    }, {
      startContributor: { kind: ToolCallContributorKind.Client, clientId: "copilot-client-tool" },
      readyContributor: { kind: ToolCallContributorKind.Client, clientId: "copilot-client-tool" },
      deltaCount: 0
    });
  });
  (isWindows ? test.skip : test)("request error survives a host restart", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-error-restart-"));
    tempDirs.push(workingDirectory);
    const clientId = "copilot-error-restart";
    const prompt = 'Reply exactly "unreachable".';
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
    const chatUri = buildDefaultChatUri(sessionUri);
    await driveTurnToCompletion(client, sessionUri, "turn-error-seed", 'Reply exactly "READY".', 1);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    if (RECORD) {
      lease.setRecordingModelResponse({
        status: 500,
        headers: {
          "content-type": "application/json",
          "x-request-id": "agent-host-e2e-error"
        },
        body: '{"type":"error","error":{"type":"api_error","message":"deterministic Agent Host E2E failure"}}'
      });
    }
    dispatchTurn(client, sessionUri, "turn-error-restart", prompt, 2);
    const liveNotification = await client.waitForNotification(
      (notification) => isActionNotification(notification, "chat/error") && getActionEnvelope(notification).channel === chatUri,
      9e4
    );
    const liveError = getActionEnvelope(liveNotification).action.error;
    client = await lease.restart();
    client.setWorkingDirectory(workingDirectory);
    await client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `${clientId}-reopened` }, 3e4);
    await client.call("authenticate", {
      channel: ROOT_STATE_URI,
      resource: "https://api.github.com",
      token: COPILOT_CONFIG.githubToken ?? resolveGitHubToken()
    }, 3e4);
    const reopened = await fetchSessionWithChat(client, sessionUri);
    const restoredTurn = reopened.turns.find((turn) => turn.message.text === prompt);
    assert.deepStrictEqual({
      state: restoredTurn?.state,
      error: restoredTurn?.error
    }, {
      state: TurnState.Error,
      error: liveError
    });
  });
  test("client tool disconnect before permission still completes the turn", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-client-tool-disconnect-"));
    tempDirs.push(workingDirectory);
    const clientId = "copilot-client-tool-disconnect";
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
    client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId,
          displayName: "Test Client",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const turnId = "turn-client-tool-disconnect";
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(client, sessionUri, turnId, "Call the get_magic_word tool and then report whether it succeeded.", 2);
    const toolStart = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallStart")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolName === "get_magic_word";
    }, 9e4);
    const toolCallId = getActionEnvelope(toolStart).action.toolCallId;
    client.notify("unsubscribe", { channel: sessionUri });
    const failedCompletion = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallComplete")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === toolCallId && !action.result.success;
    }, 3e4);
    const failedCompletionSeq = getActionEnvelope(failedCompletion).serverSeq;
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
    const staleReady = client.receivedNotifications((n) => {
      if (!isActionNotification(n, "chat/toolCallReady")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && envelope.serverSeq > failedCompletionSeq && action.turnId === turnId && action.toolCallId === toolCallId;
    });
    assert.deepStrictEqual(staleReady, []);
  });
  test("client tool result confirmation is required before the provider continues", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-client-tool-result-confirmation-"));
    tempDirs.push(workingDirectory);
    const clientId = "copilot-client-tool-result-confirmation";
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
    client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId,
          displayName: "Result Confirmation Client",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const chatUri = buildDefaultChatUri(sessionUri);
    const turnId = "turn-client-tool-result-confirmation";
    dispatchTurn(client, sessionUri, turnId, "Call get_magic_word exactly once, then reply with only its result.", 2);
    const started = await client.waitForNotification(
      (n) => isActionNotification(n, "chat/toolCallStart") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.toolName === "get_magic_word",
      9e4
    );
    const toolCallId = getActionEnvelope(started).action.toolCallId;
    const initialReady = await client.waitForNotification(
      (n) => isActionNotification(n, "chat/toolCallReady") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.toolCallId === toolCallId,
      3e4
    );
    client.dispatch({
      channel: chatUri,
      clientSeq: 3,
      action: {
        type: ActionType.ChatToolCallConfirmed,
        turnId,
        toolCallId,
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/toolCallConfirmed") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).serverSeq > getActionEnvelope(initialReady).serverSeq && getActionEnvelope(n).action.toolCallId === toolCallId,
      3e4
    );
    client.dispatch({
      channel: chatUri,
      clientSeq: 4,
      action: {
        type: ActionType.ChatToolCallComplete,
        turnId,
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Got the magic word",
          content: [{ type: ToolResultContentType.Text, text: "XYLOPHONE" }]
        },
        requiresResultConfirmation: true
      }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/toolCallComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.toolCallId === toolCallId,
      3e4
    );
    const paused = await fetchSessionWithChat(client, sessionUri);
    const pendingToolCall = paused.activeTurn?.responseParts.find(
      (part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolCallId
    );
    assert.deepStrictEqual({
      status: pendingToolCall?.kind === ResponsePartKind.ToolCall ? pendingToolCall.toolCall.status : void 0,
      modelRequestCount: lease.observedModelRequestBodies.length
    }, {
      status: ToolCallStatus.PendingResultConfirmation,
      modelRequestCount: 1
    });
    client.dispatch({
      channel: chatUri,
      clientSeq: 5,
      action: {
        type: ActionType.ChatToolCallResultConfirmed,
        turnId,
        toolCallId,
        approved: true
      }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
    const resultConfirmed = client.receivedNotifications(
      (n) => isActionNotification(n, "chat/toolCallResultConfirmed") && getActionEnvelope(n).channel === chatUri
    );
    assert.strictEqual(resultConfirmed.length, 1);
  });
  (RECORD_ONLY ? test : test.skip)("accepted steering followed by abort does not block the replacement turn", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-steering-abort-"));
    tempDirs.push(workingDirectory);
    const clientId = "copilot-steering-abort";
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
    const chatUri = buildDefaultChatUri(sessionUri);
    client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId,
          displayName: "Test Client",
          tools: [{
            name: "get_magic_word",
            description: "Returns a magic word. Call this tool when explicitly asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const initialTurnId = "turn-steering-abort-initial";
    dispatchTurn(client, sessionUri, initialTurnId, "Explain the history of source control in detail.", 2);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/responsePart") || isActionNotification(n, "chat/toolCallStart"),
      9e4
    );
    const steeringId = "steering-before-abort";
    client.dispatch({
      channel: chatUri,
      clientSeq: 3,
      action: {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: steeringId,
        message: {
          text: "Call get_magic_word exactly once, then report its result.",
          origin: { kind: MessageKind.User }
        }
      }
    });
    await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/pendingMessageRemoved")) {
        return false;
      }
      return getActionEnvelope(n).action.id === steeringId;
    }, 6e4);
    client.dispatch({
      channel: chatUri,
      clientSeq: 4,
      action: {
        type: ActionType.ChatTurnCancelled,
        turnId: initialTurnId,
        duration: 0
      }
    });
    const replacementTurnId = "turn-steering-abort-replacement";
    dispatchTurn(client, sessionUri, replacementTurnId, 'Reply with exactly "replacement-ok". Do not use tools.', 5);
    await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/turnComplete")) {
        return false;
      }
      return getActionEnvelope(n).action.turnId === replacementTurnId;
    }, 9e4);
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.deepStrictEqual({
      activeTurn: state.activeTurn,
      inputNeeded: state.inputNeeded,
      replacementState: state.turns.find((turn) => turn.id === replacementTurnId)?.state
    }, {
      activeTurn: void 0,
      inputNeeded: void 0,
      replacementState: "complete"
    });
  });
  suiteTeardown(async function() {
    this.timeout(12e4);
    await lease?.dispose();
  });
  test("usage reports include Copilot cost metadata", async function() {
    this.timeout(12e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-cost-report-"));
    tempDirs.push(workingDirectory);
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-usage", createdSessions, URI.file(workingDirectory));
    dispatchTurn(client, sessionUri, "turn-usage", 'Reply with exactly "usage-ok" and do not use tools.', 1);
    const usageNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/usage")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === "turn-usage";
    }, 9e4);
    const usageEnvelope = getActionEnvelope(usageNotif);
    const usageAction = usageEnvelope.action;
    assert.strictEqual(usageEnvelope.channel, buildDefaultChatUri(sessionUri));
    assert.strictEqual(usageAction.turnId, "turn-usage");
    assert.strictEqual(typeof usageAction.usage.model, "string");
    assert.ok(usageAction.usage.model);
    assert.ok(usageAction.usage.inputTokens === void 0 || usageAction.usage.inputTokens > 0);
    assert.ok(usageAction.usage.outputTokens === void 0 || usageAction.usage.outputTokens > 0);
    const cost = usageAction.usage._meta?.cost;
    if (typeof cost !== "number") {
      assert.fail(`expected usage._meta.cost to be numeric: ${JSON.stringify(usageAction.usage)}`);
    }
    assert.ok(cost > 0, `expected usage._meta.cost to be positive: ${JSON.stringify(usageAction.usage)}`);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri) && getActionEnvelope(n).action.turnId === "turn-usage",
      9e4
    );
    const state = await fetchSessionWithChat(client, sessionUri);
    const turn = state.turns.find((t) => t.id === "turn-usage");
    assert.strictEqual(turn?.usage?._meta?.cost, cost);
  });
  test("attaches a Python file and reads its function names", async function() {
    this.timeout(12e4);
    const workingDirectory = await mkdtemp(`${tmpdir()}/ahp-attachment-test-`);
    tempDirs.push(workingDirectory);
    const filePath = join(workingDirectory, "calculator.py");
    await writeFile(filePath, [
      "def add(a, b):",
      "	return a + b"
    ].join("\n"));
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-attachment", createdSessions, URI.file(workingDirectory));
    const prompt = "Read the attached Python file. What function names are defined in it? Reply with only the function names.";
    const attachments = [{
      type: MessageAttachmentKind.Resource,
      uri: URI.file(filePath).toString(),
      label: "calculator.py",
      displayKind: "document"
    }];
    const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, "turn-attachment", prompt, attachments, 1);
    assert.match(result.responseText, /\badd\b/i, `expected the model to identify the attached file function; got: ${JSON.stringify(result.responseText)}`);
    assertToolCallCompleteText(client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-attachment",
      toolNames: ["view"],
      workspace: workingDirectory,
      expected: [/def add\(a, b\):/, /return a \+ b/],
      success: true
    });
  });
  test("attaches a text blob and reads its function names", async function() {
    this.timeout(12e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-text-blob-"));
    tempDirs.push(workingDirectory);
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-blob-attachment", createdSessions, URI.file(workingDirectory));
    const prompt = "Read the attached Python text blob. What function names are defined in it? Reply with only the function names.";
    const attachments = [{
      type: MessageAttachmentKind.Simple,
      label: "calculator.py",
      displayKind: "document",
      modelRepresentation: [
        "def subtract(a, b):",
        "	return a - b"
      ].join("\n")
    }];
    const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, "turn-blob-attachment", prompt, attachments, 1);
    assert.match(result.responseText, /\bsubtract\b/i, `expected the model to identify the attached blob function; got: ${JSON.stringify(result.responseText)}`);
  });
  (isWindows ? test.skip : test)("shell read helper remains a non-terminal tool", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-read-shell-"));
    tempDirs.push(workingDirectory);
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-read-shell", createdSessions, URI.file(workingDirectory));
    const chatUri = buildDefaultChatUri(sessionUri);
    const turnId = "turn-read-shell";
    const command = `node -e "setTimeout(() => console.log('READ_SHELL_E2E_VALUE'), 3000)"`;
    const prompt = [
      `First use the shell tool exactly once to run \`${command}\` in async mode with shellId "read-shell-e2e" and initial_wait 1.`,
      'After that tool returns, use its matching read tool exactly once with shellId "read-shell-e2e" and delay 5 so the command finishes before the read returns.',
      'Then reply with exactly "READ_SHELL_E2E_DONE".'
    ].join(" ");
    const result = await driveTurnToCompletion(client, sessionUri, turnId, prompt, 1);
    assert.match(result.responseText, /READ_SHELL_E2E_DONE/);
    const start = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && /^read_(?:bash|powershell)$/.test(action.toolName));
    assert.ok(start, "expected a shell read helper tool call");
    const ready = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallReady")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.action.toolCallId);
    const complete = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.action.toolCallId);
    assert.ok(ready, "expected the shell read helper to become ready");
    assert.ok(complete, "expected the shell read helper to complete");
    const toolInput = getInlineToolInput(ready.action.toolInput);
    assert.deepStrictEqual({
      displayName: start.action.displayName,
      toolKinds: [
        readToolCallMeta(start.action).toolKind,
        readToolCallMeta(ready.action).toolKind,
        readToolCallMeta(complete.action).toolKind
      ],
      invocationMessage: ready.action.invocationMessage,
      toolInput: toolInput ? JSON.parse(toolInput) : void 0,
      success: complete.action.result.success,
      pastTenseMessage: complete.action.result.pastTenseMessage,
      contentTypes: complete.action.result.content?.map((content) => content.type)
    }, {
      displayName: "Read Terminal",
      toolKinds: [void 0, void 0, void 0],
      invocationMessage: "Reading Terminal",
      toolInput: { shellId: "read-shell-e2e", delay: 5 },
      success: true,
      pastTenseMessage: "Read Terminal",
      contentTypes: [ToolResultContentType.Text]
    });
    await assertRecordedAhpSnapshot(this.test, client, {
      profile: "protocol",
      ignoredActionTypes: [
        ActionType.ChatUsage,
        ActionType.ChatToolCallDelta,
        ActionType.SessionChatUpdated,
        ActionType.SessionTitleChanged,
        ActionType.SessionServerToolsChanged,
        ActionType.SessionReady,
        ActionType.SessionInputNeededSet,
        ActionType.SessionInputNeededRemoved,
        ActionType.SessionChangesetsChanged,
        ActionType.SessionMetaChanged
      ]
    });
  });
  (isWindows ? test.skip : test)("strips redundant `cd <workingDirectory> &&` prefix from shell tool calls", async function() {
    this.timeout(18e4);
    const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-cd-strip-test-`);
    tempDirs.push(workspaceDir);
    const expectedWorkingDirPath = workspaceDir;
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-cd-strip", createdSessions, URI.file(workspaceDir));
    client.clearReceived();
    const turnId = "turn-cd-strip";
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(
      client,
      sessionUri,
      turnId,
      `Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
      1
    );
    const toolStartNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallStart")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolName === COPILOT_CONFIG.shellToolName;
    }, 9e4);
    const toolStartAction = getActionEnvelope(toolStartNotif).action;
    const toolReadyNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallReady")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === toolStartAction.toolCallId && typeof action.toolInput === "string";
    }, 9e4);
    const toolReadyEnvelope = getActionEnvelope(toolReadyNotif);
    const toolReadyAction = toolReadyEnvelope.action;
    const toolInput = getInlineToolInput(toolReadyAction.toolInput);
    assert.ok(toolInput);
    const escapedWorkingDirPath = expectedWorkingDirPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const redundantWorkingDirCdPrefix = new RegExp(
      `^\\s*cd\\s+(?:"${escapedWorkingDirPath}"|'${escapedWorkingDirPath}'|${escapedWorkingDirPath})\\s*(?:&&|;)\\s*`
    );
    assert.ok(
      !redundantWorkingDirCdPrefix.test(toolInput),
      `toolInput should not contain a redundant cd-prefix targeting the working directory; got: ${JSON.stringify(toolInput)}`
    );
    assert.ok(
      toolInput.includes("strip-me-please"),
      `toolInput should retain the command marker after rewriting; got: ${JSON.stringify(toolInput)}`
    );
    if (!toolReadyAction.confirmed) {
      client.dispatch({
        channel: toolReadyEnvelope.channel,
        clientSeq: 2,
        action: {
          type: ActionType.ChatToolCallConfirmed,
          turnId,
          toolCallId: toolReadyAction.toolCallId,
          approved: true,
          confirmed: ToolCallConfirmationReason.UserAction
        }
      });
    }
    const seenSeqs = /* @__PURE__ */ new Set();
    seenSeqs.add(toolReadyEnvelope.serverSeq);
    let teardownSeq = 3;
    while (true) {
      const next = await client.waitForNotification(
        (n) => {
          if (isActionNotification(n, "chat/turnComplete") || isActionNotification(n, "chat/error")) {
            return true;
          }
          if (!isActionNotification(n, "chat/toolCallReady")) {
            return false;
          }
          const envelope2 = getActionEnvelope(n);
          const action2 = envelope2.action;
          return envelope2.channel === chatUri && action2.turnId === turnId && !seenSeqs.has(envelope2.serverSeq);
        },
        9e4
      );
      if (isActionNotification(next, "chat/error")) {
        const action2 = getActionEnvelope(next).action;
        throw new Error(`cd-strip turn failed: ${JSON.stringify(action2.error)}`);
      }
      if (isActionNotification(next, "chat/turnComplete")) {
        break;
      }
      const envelope = getActionEnvelope(next);
      seenSeqs.add(envelope.serverSeq);
      const action = envelope.action;
      if (!action.confirmed) {
        client.dispatch({
          channel: envelope.channel,
          clientSeq: ++teardownSeq,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: action.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      }
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHByb3ZpZGVyc1xcY29waWxvdEFnZW50SG9zdEUyRS5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIEFnZW50IGhvc3QgZW5kLXRvLWVuZCB0ZXN0cyAoQ29waWxvdCkuXG4gKlxuICogVGhlIGNyb3NzLXByb3ZpZGVyIHBvcnRpb24gbGl2ZXMgaW4ge0BsaW5rIGRlZmluZUFnZW50SG9zdEUyRVRlc3RzfTsgdGhpc1xuICogZmlsZSBsYXllcnMgb24gQ29waWxvdC1zcGVjaWZpYyBhc3NlcnRpb25zIChjb3N0IG1ldGFkYXRhLCBjZC1wcmVmaXhcbiAqIHN0cmlwcGluZykuXG4gKlxuICogVGhlc2UgcnVuIGJ5IGRlZmF1bHQgaW4gZGV0ZXJtaW5pc3RpYyByZXBsYXkgbW9kZSBhZ2FpbnN0IGNvbW1pdHRlZCBZQU1MXG4gKiBmaXh0dXJlcyAobm8gdG9rZW4sIG5vIG5ldHdvcmspLiBUbyByZS1yZWNvcmQgdGhlIGZpeHR1cmVzIGFnYWluc3QgcmVhbCBDQVBJLFxuICogc2V0IGBBR0VOVF9IT1NUX1JFUExBWV9SRUNPUkQ9MWA6XG4gKlxuICogICBBR0VOVF9IT1NUX1JFUExBWV9SRUNPUkQ9MSAuL3NjcmlwdHMvdGVzdC1pbnRlZ3JhdGlvbi5zaCAtLXJ1biBzcmMvdnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9lMmUvcHJvdmlkZXJzL2NvcGlsb3RBZ2VudEhvc3RFMkUuaW50ZWdyYXRpb25UZXN0LnRzXG4gKlxuICogUmVjb3JkaW5nIGF1dGg6IHRoZSB0b2tlbiBpcyBvYnRhaW5lZCBmcm9tIGBnaCBhdXRoIHRva2VuYCwgb3Igb3ZlcnJpZGUgd2l0aFxuICogYEdJVEhVQl9UT0tFTj1naHBfeHh4YC4gUmVwbGF5IG5lZWRzIG5vIGNyZWRlbnRpYWwuXG4gKlxuICogU0FGRVRZOiBSZWNvcmRpbmcgY3JlYXRlcyByZWFsIGFnZW50IHNlc3Npb25zIGJhY2tlZCBieSB0aGUgQ29waWxvdCBTREsuXG4gKiBQcm9tcHRzIGFyZSBrZXB0IHRvIHJlYWQtb25seSBxdWVzdGlvbnMsIHNhZmUgYGVjaG9gIGNvbW1hbmRzLCBhbmQgaXNvbGF0ZWRcbiAqIHRlbXAgZGlyZWN0b3JpZXMuXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkdGVtcCwgd3JpdGVGaWxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQXR0YWNobWVudEtpbmQsIE1lc3NhZ2VLaW5kLCBQZW5kaW5nTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFJPT1RfU1RBVEVfVVJJLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgZ2V0SW5saW5lVG9vbElucHV0LCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIENoYXRFcnJvckFjdGlvbiwgdHlwZSBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbiwgdHlwZSBDaGF0VG9vbENhbGxEZWx0YUFjdGlvbiwgdHlwZSBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbiwgdHlwZSBDaGF0VG9vbENhbGxTdGFydEFjdGlvbiwgdHlwZSBDaGF0VXNhZ2VBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7XG5cdEFnZW50SG9zdEUyRVNlcnZlckxlYXNlLCBhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dCwgY3JlYXRlUmVhbFNlc3Npb24sIGRpc3BhdGNoVHVybixcblx0ZHJpdmVUdXJuVG9Db21wbGV0aW9uLCBkcml2ZVR1cm5XaXRoQXR0YWNobWVudHNUb0NvbXBsZXRpb24sIHJlbW92ZVRlbXBEaXJzLCByZXNvbHZlR2l0SHViVG9rZW4sIHJ1bkFocFNuYXBzaG90VGVzdCxcbn0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90IH0gZnJvbSAnLi4vaGFybmVzcy9haHBTbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBkZWZpbmVBZ2VudEhvc3RFMkVUZXN0cyB9IGZyb20gJy4uL3N1aXRlcy9hZ2VudEhvc3RFMkVTdWl0ZXMuanMnO1xuaW1wb3J0IHsgZmV0Y2hTZXNzaW9uV2l0aENoYXQsIGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiwgVGVzdFByb3RvY29sQ2xpZW50IH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0NPTkZJRyB9IGZyb20gJy4vY29waWxvdFRlc3RDb25maWd1cmF0aW9uLmpzJztcblxuY29uc3QgUkVDT1JEX09OTFkgPSBwcm9jZXNzLmVudlsnQUdFTlRfSE9TVF9SRVBMQVlfUkVDT1JEJ10gPT09ICcxJztcbmNvbnN0IFJFQ09SRCA9IFJFQ09SRF9PTkxZIHx8IHByb2Nlc3MuZW52WydBR0VOVF9IT1NUX1VQREFURV9TTkFQU0hPVFMnXSA9PT0gJzEnO1xuY29uc3QgaXNXaW5kb3dzID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJztcblxuZGVmaW5lQWdlbnRIb3N0RTJFVGVzdHMoQ09QSUxPVF9DT05GSUcpO1xuXG5zdWl0ZSgnQWdlbnQgSG9zdCBFMkUgXHUyMDE0IENvcGlsb3QgKENvcGlsb3Qtc3BlY2lmaWMpJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudDtcblx0bGV0IGxlYXNlOiBBZ2VudEhvc3RFMkVTZXJ2ZXJMZWFzZSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgY3JlYXRlZFNlc3Npb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCB0ZW1wRGlyczogc3RyaW5nW10gPSBbXTtcblxuXHQvLyBUaGUgbGVhc2UgZnJvbnRzIHRoZSBzZXJ2ZXIgd2l0aCB0aGUgcmVjb3JkL3JlcGxheSBwcm94eTogdGhlc2UgdGVzdHNcblx0Ly8gcmVwbGF5IGNvbW1pdHRlZCBmaXh0dXJlcyBieSBkZWZhdWx0ICh0b2tlbmxlc3MpIGFuZCByZWNvcmQgYWdhaW5zdCByZWFsXG5cdC8vIENBUEkgd2l0aCBgQUdFTlRfSE9TVF9SRVBMQVlfUkVDT1JEPTFgLCBtaXJyb3JpbmcgdGhlIHNoYXJlZCBzdWl0ZS4gSW5cblx0Ly8gcmVwbGF5IHRoZSBsZWFzZSByZXVzZXMgb25lIHNlcnZlciBhY3Jvc3MgdGhlIHN1aXRlIGFuZCBzd2FwcyB0aGUgZml4dHVyZVxuXHQvLyBwZXIgdGVzdDsgd2hpbGUgcmVjb3JkaW5nIGl0IHN0YXJ0cyBhIGZyZXNoIHNlcnZlciBwZXIgdGVzdC5cblx0c3VpdGVTZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0bGVhc2UgPSBuZXcgQWdlbnRIb3N0RTJFU2VydmVyTGVhc2UoQ09QSUxPVF9DT05GSUcpO1xuXHR9KTtcblxuXHRzZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDYwXzAwMCk7XG5cdFx0aWYgKCFsZWFzZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IEUyRSBzZXJ2ZXIgbGVhc2Ugd2FzIG5vdCBpbml0aWFsaXplZC4nKTtcblx0XHR9XG5cdFx0KHsgY2xpZW50IH0gPSBhd2FpdCBsZWFzZS5hY3F1aXJlKHRoaXMuY3VycmVudFRlc3Q/LnRpdGxlID8/ICd1bmtub3duJykpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEyMF8wMDApO1xuXHRcdGlmICghbGVhc2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgSG9zdCBFMkUgc2VydmVyIGxlYXNlIHdhcyBub3QgaW5pdGlhbGl6ZWQuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGZhaWxlZCA9IHRoaXMuY3VycmVudFRlc3Q/LnN0YXRlID09PSAnZmFpbGVkJztcblx0XHRpZiAoZmFpbGVkKSB7XG5cdFx0XHRsZWFzZS5kdW1wUnVudGltZUxvZ3NPbkZhaWx1cmUodGhpcy5jdXJyZW50VGVzdD8udGl0bGUgPz8gJ3Vua25vd24nKTtcblx0XHR9XG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGxlYXNlLnJlbGVhc2UoY3JlYXRlZFNlc3Npb25zLCBmYWlsZWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVtb3ZlVGVtcERpcnModGVtcERpcnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlcnJvcnMucHVzaChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdH1cblx0XHRpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBBZ2dyZWdhdGVFcnJvcihlcnJvcnMsICdGYWlsZWQgdG8gZGlzcG9zZSBDb3BpbG90LXNwZWNpZmljIEUyRSB0ZXN0IHJlc291cmNlcycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgcmVhY2hlcyByZWFkeSBhZnRlciBzdGFydCBhbmQgY29tcGxldGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRhd2FpdCBydW5BaHBTbmFwc2hvdFRlc3QoY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgdGhpcy50ZXN0ISwgY3JlYXRlZFNlc3Npb25zLCB0ZW1wRGlycywge1xuXHRcdFx0aWdub3JlZEFjdGlvblR5cGVzOiBbQWN0aW9uVHlwZS5DaGF0VXNhZ2VdLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKVxuXHRcdFx0Lm1hcChuID0+IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbilcblx0XHRcdC5maW5kKGFjdGlvbiA9PiBhY3Rpb24udG9vbE5hbWUgPT09ICdnZXRfbWFnaWNfd29yZCcpO1xuXHRcdGNvbnN0IHJlYWR5ID0gc3RhcnQgJiYgY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSlcblx0XHRcdC5tYXAobiA9PiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24pXG5cdFx0XHQuZmluZChhY3Rpb24gPT4gYWN0aW9uLnRvb2xDYWxsSWQgPT09IHN0YXJ0LnRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IGRlbHRhcyA9IHN0YXJ0ICYmIGNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbERlbHRhJykpXG5cdFx0XHQubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbERlbHRhQWN0aW9uKVxuXHRcdFx0LmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLnRvb2xDYWxsSWQgPT09IHN0YXJ0LnRvb2xDYWxsSWQpO1xuXG5cdFx0Ly8gVGhlIEFIUCBzbmFwc2hvdCBwcm9qZWN0cyBjb250cmlidXRvciBtZXRhZGF0YSBvbmx5IG9uIFN0YXJ0LCBzbyBSZWFkeSBvd25lcnNoaXAgbmVlZHMgYW4gZXhwbGljaXQgYXNzZXJ0aW9uLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRDb250cmlidXRvcjogc3RhcnQ/LmNvbnRyaWJ1dG9yLFxuXHRcdFx0cmVhZHlDb250cmlidXRvcjogcmVhZHk/LmNvbnRyaWJ1dG9yLFxuXHRcdFx0ZGVsdGFDb3VudDogZGVsdGFzPy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRDb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY29waWxvdC1jbGllbnQtdG9vbCcgfSxcblx0XHRcdHJlYWR5Q29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NvcGlsb3QtY2xpZW50LXRvb2wnIH0sXG5cdFx0XHRkZWx0YUNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBXaW5kb3dzIHJlc3RvcmVzIHRoZSBmYWlsZWQgdHVybiBhcyBjYW5jZWxsZWQgYW5kIGRyb3BzIGl0cyBwZXJzaXN0ZWQgcmVxdWVzdCBlcnJvci5cblx0KGlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdyZXF1ZXN0IGVycm9yIHN1cnZpdmVzIGEgaG9zdCByZXN0YXJ0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29waWxvdC1lcnJvci1yZXN0YXJ0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IGNsaWVudElkID0gJ2NvcGlsb3QtZXJyb3ItcmVzdGFydCc7XG5cdFx0Y29uc3QgcHJvbXB0ID0gJ1JlcGx5IGV4YWN0bHkgXCJ1bnJlYWNoYWJsZVwiLic7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09QSUxPVF9DT05GSUcsIGNsaWVudElkLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWVycm9yLXNlZWQnLCAnUmVwbHkgZXhhY3RseSBcIlJFQURZXCIuJywgMSk7XG5cdFx0aWYgKCFsZWFzZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IEUyRSBzZXJ2ZXIgbGVhc2Ugd2FzIG5vdCBpbml0aWFsaXplZC4nKTtcblx0XHR9XG5cdFx0aWYgKFJFQ09SRCkge1xuXHRcdFx0bGVhc2Uuc2V0UmVjb3JkaW5nTW9kZWxSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNTAwLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHQneC1yZXF1ZXN0LWlkJzogJ2FnZW50LWhvc3QtZTJlLWVycm9yJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ym9keTogJ3tcInR5cGVcIjpcImVycm9yXCIsXCJlcnJvclwiOntcInR5cGVcIjpcImFwaV9lcnJvclwiLFwibWVzc2FnZVwiOlwiZGV0ZXJtaW5pc3RpYyBBZ2VudCBIb3N0IEUyRSBmYWlsdXJlXCJ9fScsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1lcnJvci1yZXN0YXJ0JywgcHJvbXB0LCAyKTtcblx0XHRjb25zdCBsaXZlTm90aWZpY2F0aW9uID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L2Vycm9yJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuY2hhbm5lbCA9PT0gY2hhdFVyaSxcblx0XHRcdDkwXzAwMCxcblx0XHQpO1xuXHRcdGNvbnN0IGxpdmVFcnJvciA9IChnZXRBY3Rpb25FbnZlbG9wZShsaXZlTm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdEVycm9yQWN0aW9uKS5lcnJvcjtcblxuXHRcdGNsaWVudCA9IGF3YWl0IGxlYXNlLnJlc3RhcnQoKTtcblx0XHRjbGllbnQuc2V0V29ya2luZ0RpcmVjdG9yeSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQ6IGAke2NsaWVudElkfS1yZW9wZW5lZGAgfSwgMzBfMDAwKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnYXV0aGVudGljYXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLFxuXHRcdFx0dG9rZW46IENPUElMT1RfQ09ORklHLmdpdGh1YlRva2VuID8/IHJlc29sdmVHaXRIdWJUb2tlbigpLFxuXHRcdH0sIDMwXzAwMCk7XG5cblx0XHRjb25zdCByZW9wZW5lZCA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVzdG9yZWRUdXJuID0gcmVvcGVuZWQudHVybnMuZmluZCh0dXJuID0+IHR1cm4ubWVzc2FnZS50ZXh0ID09PSBwcm9tcHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdGU6IHJlc3RvcmVkVHVybj8uc3RhdGUsXG5cdFx0XHRlcnJvcjogcmVzdG9yZWRUdXJuPy5lcnJvcixcblx0XHR9LCB7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkVycm9yLFxuXHRcdFx0ZXJyb3I6IGxpdmVFcnJvcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgZGlzY29ubmVjdCBiZWZvcmUgcGVybWlzc2lvbiBzdGlsbCBjb21wbGV0ZXMgdGhlIHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdjb3BpbG90LWNsaWVudC10b29sLWRpc2Nvbm5lY3QtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3QgY2xpZW50SWQgPSAnY29waWxvdC1jbGllbnQtdG9vbC1kaXNjb25uZWN0Jztcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgY2xpZW50SWQsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgQ2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdnZXRfbWFnaWNfd29yZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JldHVybnMgdGhlIHNlY3JldCBtYWdpYyB3b3JkLiBDYWxsIHRoaXMgd2hlbiBhc2tlZCBmb3IgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSwgcmVxdWlyZWQ6IFtdIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWNsaWVudC10b29sLWRpc2Nvbm5lY3QnO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ0NhbGwgdGhlIGdldF9tYWdpY193b3JkIHRvb2wgYW5kIHRoZW4gcmVwb3J0IHdoZXRoZXIgaXQgc3VjY2VlZGVkLicsIDIpO1xuXG5cdFx0Y29uc3QgdG9vbFN0YXJ0ID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG4pO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uO1xuXHRcdFx0cmV0dXJuIGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYXRVcmkgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sTmFtZSA9PT0gJ2dldF9tYWdpY193b3JkJztcblx0XHR9LCA5MF8wMDApO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUodG9vbFN0YXJ0KS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24pLnRvb2xDYWxsSWQ7XG5cblx0XHRjbGllbnQubm90aWZ5KCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblxuXHRcdGNvbnN0IGZhaWxlZENvbXBsZXRpb24gPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb247XG5cdFx0XHRyZXR1cm4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQgJiYgIWFjdGlvbi5yZXN1bHQuc3VjY2Vzcztcblx0XHR9LCAzMF8wMDApO1xuXHRcdGNvbnN0IGZhaWxlZENvbXBsZXRpb25TZXEgPSBnZXRBY3Rpb25FbnZlbG9wZShmYWlsZWRDb21wbGV0aW9uKS5zZXJ2ZXJTZXE7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0OTBfMDAwKTtcblxuXHRcdGNvbnN0IHN0YWxlUmVhZHkgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShuKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbjtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGVudmVsb3BlLnNlcnZlclNlcSA+IGZhaWxlZENvbXBsZXRpb25TZXEgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sQ2FsbElkID09PSB0b29sQ2FsbElkO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhbGVSZWFkeSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgdG9vbCByZXN1bHQgY29uZmlybWF0aW9uIGlzIHJlcXVpcmVkIGJlZm9yZSB0aGUgcHJvdmlkZXIgY29udGludWVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29waWxvdC1jbGllbnQtdG9vbC1yZXN1bHQtY29uZmlybWF0aW9uLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IGNsaWVudElkID0gJ2NvcGlsb3QtY2xpZW50LXRvb2wtcmVzdWx0LWNvbmZpcm1hdGlvbic7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09QSUxPVF9DT05GSUcsIGNsaWVudElkLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnUmVzdWx0IENvbmZpcm1hdGlvbiBDbGllbnQnLFxuXHRcdFx0XHRcdHRvb2xzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ2dldF9tYWdpY193b3JkJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV0dXJucyB0aGUgc2VjcmV0IG1hZ2ljIHdvcmQuIENhbGwgdGhpcyB3aGVuIGFza2VkIGZvciB0aGUgbWFnaWMgd29yZC4nLFxuXHRcdFx0XHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9LCByZXF1aXJlZDogW10gfSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY2xpZW50LXRvb2wtcmVzdWx0LWNvbmZpcm1hdGlvbic7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCAnQ2FsbCBnZXRfbWFnaWNfd29yZCBleGFjdGx5IG9uY2UsIHRoZW4gcmVwbHkgd2l0aCBvbmx5IGl0cyByZXN1bHQuJywgMik7XG5cdFx0Y29uc3Qgc3RhcnRlZCA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudG9vbE5hbWUgPT09ICdnZXRfbWFnaWNfd29yZCcsXG5cdFx0XHQ5MF8wMDAsXG5cdFx0KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gKGdldEFjdGlvbkVudmVsb3BlKHN0YXJ0ZWQpLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudG9vbENhbGxJZDtcblx0XHRjb25zdCBpbml0aWFsUmVhZHkgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24pLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQsXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogMyxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbmZpcm1lZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5zZXJ2ZXJTZXEgPiBnZXRBY3Rpb25FbnZlbG9wZShpbml0aWFsUmVhZHkpLnNlcnZlclNlcVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZyB9KS50b29sQ2FsbElkID09PSB0b29sQ2FsbElkLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRjbGllbnRTZXE6IDQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdHb3QgdGhlIG1hZ2ljIHdvcmQnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnWFlMT1BIT05FJyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZXNSZXN1bHRDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbikudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCxcblx0XHRcdDMwXzAwMCxcblx0XHQpO1xuXHRcdGNvbnN0IHBhdXNlZCA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcGVuZGluZ1Rvb2xDYWxsID0gcGF1c2VkLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChwYXJ0ID0+XG5cdFx0XHRwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHBlbmRpbmdUb29sQ2FsbD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBlbmRpbmdUb29sQ2FsbC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlbFJlcXVlc3RDb3VudDogbGVhc2UhLm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdSZXN1bHRDb25maXJtYXRpb24sXG5cdFx0XHRtb2RlbFJlcXVlc3RDb3VudDogMSxcblx0XHR9KTtcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogNSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlc3VsdENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdDkwXzAwMCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0Q29uZmlybWVkID0gY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlc3VsdENvbmZpcm1lZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdENvbmZpcm1lZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHQoUkVDT1JEX09OTFkgPyB0ZXN0IDogdGVzdC5za2lwKSgnYWNjZXB0ZWQgc3RlZXJpbmcgZm9sbG93ZWQgYnkgYWJvcnQgZG9lcyBub3QgYmxvY2sgdGhlIHJlcGxhY2VtZW50IHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdjb3BpbG90LXN0ZWVyaW5nLWFib3J0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IGNsaWVudElkID0gJ2NvcGlsb3Qtc3RlZXJpbmctYWJvcnQnO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPUElMT1RfQ09ORklHLCBjbGllbnRJZCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBDbGllbnQnLFxuXHRcdFx0XHRcdHRvb2xzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ2dldF9tYWdpY193b3JkJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV0dXJucyBhIG1hZ2ljIHdvcmQuIENhbGwgdGhpcyB0b29sIHdoZW4gZXhwbGljaXRseSBhc2tlZCBmb3IgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSwgcmVxdWlyZWQ6IFtdIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluaXRpYWxUdXJuSWQgPSAndHVybi1zdGVlcmluZy1hYm9ydC1pbml0aWFsJztcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uVXJpLCBpbml0aWFsVHVybklkLCAnRXhwbGFpbiB0aGUgaGlzdG9yeSBvZiBzb3VyY2UgY29udHJvbCBpbiBkZXRhaWwuJywgMik7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0JykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpLFxuXHRcdFx0OTBfMDAwKTtcblxuXHRcdGNvbnN0IHN0ZWVyaW5nSWQgPSAnc3RlZXJpbmctYmVmb3JlLWFib3J0Jztcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogMyxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogc3RlZXJpbmdJZCxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdDYWxsIGdldF9tYWdpY193b3JkIGV4YWN0bHkgb25jZSwgdGhlbiByZXBvcnQgaXRzIHJlc3VsdC4nLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9wZW5kaW5nTWVzc2FnZVJlbW92ZWQnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IGlkPzogc3RyaW5nIH0pLmlkID09PSBzdGVlcmluZ0lkO1xuXHRcdH0sIDYwXzAwMCk7XG5cblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogNCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHR0dXJuSWQ6IGluaXRpYWxUdXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCByZXBsYWNlbWVudFR1cm5JZCA9ICd0dXJuLXN0ZWVyaW5nLWFib3J0LXJlcGxhY2VtZW50Jztcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uVXJpLCByZXBsYWNlbWVudFR1cm5JZCwgJ1JlcGx5IHdpdGggZXhhY3RseSBcInJlcGxhY2VtZW50LW9rXCIuIERvIG5vdCB1c2UgdG9vbHMuJywgNSk7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSByZXBsYWNlbWVudFR1cm5JZDtcblx0XHR9LCA5MF8wMDApO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjbGllbnQsIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlVHVybjogc3RhdGUuYWN0aXZlVHVybixcblx0XHRcdGlucHV0TmVlZGVkOiBzdGF0ZS5pbnB1dE5lZWRlZCxcblx0XHRcdHJlcGxhY2VtZW50U3RhdGU6IHN0YXRlLnR1cm5zLmZpbmQodHVybiA9PiB0dXJuLmlkID09PSByZXBsYWNlbWVudFR1cm5JZCk/LnN0YXRlLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHRcdGlucHV0TmVlZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRyZXBsYWNlbWVudFN0YXRlOiAnY29tcGxldGUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0YXdhaXQgbGVhc2U/LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXNhZ2UgcmVwb3J0cyBpbmNsdWRlIENvcGlsb3QgY29zdCBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2NvcGlsb3QtY29zdC1yZXBvcnQtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgJ3JlYWwtc2RrLXVzYWdlJywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tdXNhZ2UnLCAnUmVwbHkgd2l0aCBleGFjdGx5IFwidXNhZ2Utb2tcIiBhbmQgZG8gbm90IHVzZSB0b29scy4nLCAxKTtcblxuXHRcdGNvbnN0IHVzYWdlTm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdXNhZ2UnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG4pO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRVc2FnZUFjdGlvbjtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpICYmIGFjdGlvbi50dXJuSWQgPT09ICd0dXJuLXVzYWdlJztcblx0XHR9LCA5MF8wMDApO1xuXHRcdGNvbnN0IHVzYWdlRW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZSh1c2FnZU5vdGlmKTtcblx0XHRjb25zdCB1c2FnZUFjdGlvbiA9IHVzYWdlRW52ZWxvcGUuYWN0aW9uIGFzIENoYXRVc2FnZUFjdGlvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VFbnZlbG9wZS5jaGFubmVsLCBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VBY3Rpb24udHVybklkLCAndHVybi11c2FnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgdXNhZ2VBY3Rpb24udXNhZ2UubW9kZWwsICdzdHJpbmcnKTtcblx0XHRhc3NlcnQub2sodXNhZ2VBY3Rpb24udXNhZ2UubW9kZWwpO1xuXHRcdGFzc2VydC5vayh1c2FnZUFjdGlvbi51c2FnZS5pbnB1dFRva2VucyA9PT0gdW5kZWZpbmVkIHx8IHVzYWdlQWN0aW9uLnVzYWdlLmlucHV0VG9rZW5zID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHVzYWdlQWN0aW9uLnVzYWdlLm91dHB1dFRva2VucyA9PT0gdW5kZWZpbmVkIHx8IHVzYWdlQWN0aW9uLnVzYWdlLm91dHB1dFRva2VucyA+IDApO1xuXG5cdFx0Y29uc3QgY29zdCA9IHVzYWdlQWN0aW9uLnVzYWdlLl9tZXRhPy5jb3N0O1xuXHRcdGlmICh0eXBlb2YgY29zdCAhPT0gJ251bWJlcicpIHtcblx0XHRcdGFzc2VydC5mYWlsKGBleHBlY3RlZCB1c2FnZS5fbWV0YS5jb3N0IHRvIGJlIG51bWVyaWM6ICR7SlNPTi5zdHJpbmdpZnkodXNhZ2VBY3Rpb24udXNhZ2UpfWApO1xuXHRcdH1cblx0XHRhc3NlcnQub2soY29zdCA+IDAsIGBleHBlY3RlZCB1c2FnZS5fbWV0YS5jb3N0IHRvIGJlIHBvc2l0aXZlOiAke0pTT04uc3RyaW5naWZ5KHVzYWdlQWN0aW9uLnVzYWdlKX1gKTtcblxuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi11c2FnZScsXG5cdFx0XHQ5MF8wMDApO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRjb25zdCB0dXJuID0gc3RhdGUudHVybnMuZmluZCh0ID0+IHQuaWQgPT09ICd0dXJuLXVzYWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm4/LnVzYWdlPy5fbWV0YT8uY29zdCwgY29zdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIGEgUHl0aG9uIGZpbGUgYW5kIHJlYWRzIGl0cyBmdW5jdGlvbiBuYW1lcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChgJHt0bXBkaXIoKX0vYWhwLWF0dGFjaG1lbnQtdGVzdC1gKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih3b3JraW5nRGlyZWN0b3J5LCAnY2FsY3VsYXRvci5weScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZShmaWxlUGF0aCwgW1xuXHRcdFx0J2RlZiBhZGQoYSwgYik6Jyxcblx0XHRcdCdcXHRyZXR1cm4gYSArIGInLFxuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09QSUxPVF9DT05GSUcsICdyZWFsLXNkay1hdHRhY2htZW50JywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gJ1JlYWQgdGhlIGF0dGFjaGVkIFB5dGhvbiBmaWxlLiBXaGF0IGZ1bmN0aW9uIG5hbWVzIGFyZSBkZWZpbmVkIGluIGl0PyBSZXBseSB3aXRoIG9ubHkgdGhlIGZ1bmN0aW9uIG5hbWVzLic7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShmaWxlUGF0aCkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiAnY2FsY3VsYXRvci5weScsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHR9XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVybldpdGhBdHRhY2htZW50c1RvQ29tcGxldGlvbihjbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWF0dGFjaG1lbnQnLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvXFxiYWRkXFxiL2ksIGBleHBlY3RlZCB0aGUgbW9kZWwgdG8gaWRlbnRpZnkgdGhlIGF0dGFjaGVkIGZpbGUgZnVuY3Rpb247IGdvdDogJHtKU09OLnN0cmluZ2lmeShyZXN1bHQucmVzcG9uc2VUZXh0KX1gKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWF0dGFjaG1lbnQnLFxuXHRcdFx0dG9vbE5hbWVzOiBbJ3ZpZXcnXSxcblx0XHRcdHdvcmtzcGFjZTogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdGV4cGVjdGVkOiBbL2RlZiBhZGRcXChhLCBiXFwpOi8sIC9yZXR1cm4gYSBcXCsgYi9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXR0YWNoZXMgYSB0ZXh0IGJsb2IgYW5kIHJlYWRzIGl0cyBmdW5jdGlvbiBuYW1lcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29waWxvdC10ZXh0LWJsb2ItJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgJ3JlYWwtc2RrLWJsb2ItYXR0YWNobWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IHByb21wdCA9ICdSZWFkIHRoZSBhdHRhY2hlZCBQeXRob24gdGV4dCBibG9iLiBXaGF0IGZ1bmN0aW9uIG5hbWVzIGFyZSBkZWZpbmVkIGluIGl0PyBSZXBseSB3aXRoIG9ubHkgdGhlIGZ1bmN0aW9uIG5hbWVzLic7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdGxhYmVsOiAnY2FsY3VsYXRvci5weScsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdG1vZGVsUmVwcmVzZW50YXRpb246IFtcblx0XHRcdFx0J2RlZiBzdWJ0cmFjdChhLCBiKTonLFxuXHRcdFx0XHQnXFx0cmV0dXJuIGEgLSBiJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0fV07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5XaXRoQXR0YWNobWVudHNUb0NvbXBsZXRpb24oY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1ibG9iLWF0dGFjaG1lbnQnLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvXFxic3VidHJhY3RcXGIvaSwgYGV4cGVjdGVkIHRoZSBtb2RlbCB0byBpZGVudGlmeSB0aGUgYXR0YWNoZWQgYmxvYiBmdW5jdGlvbjsgZ290OiAke0pTT04uc3RyaW5naWZ5KHJlc3VsdC5yZXNwb25zZVRleHQpfWApO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ3NoZWxsIHJlYWQgaGVscGVyIHJlbWFpbnMgYSBub24tdGVybWluYWwgdG9vbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29waWxvdC1yZWFkLXNoZWxsLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPUElMT1RfQ09ORklHLCAncmVhbC1zZGstcmVhZC1zaGVsbCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLXJlYWQtc2hlbGwnO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBgbm9kZSAtZSBcInNldFRpbWVvdXQoKCkgPT4gY29uc29sZS5sb2coJ1JFQURfU0hFTExfRTJFX1ZBTFVFJyksIDMwMDApXCJgO1xuXHRcdGNvbnN0IHByb21wdCA9IFtcblx0XHRcdGBGaXJzdCB1c2UgdGhlIHNoZWxsIHRvb2wgZXhhY3RseSBvbmNlIHRvIHJ1biBcXGAke2NvbW1hbmR9XFxgIGluIGFzeW5jIG1vZGUgd2l0aCBzaGVsbElkIFwicmVhZC1zaGVsbC1lMmVcIiBhbmQgaW5pdGlhbF93YWl0IDEuYCxcblx0XHRcdCdBZnRlciB0aGF0IHRvb2wgcmV0dXJucywgdXNlIGl0cyBtYXRjaGluZyByZWFkIHRvb2wgZXhhY3RseSBvbmNlIHdpdGggc2hlbGxJZCBcInJlYWQtc2hlbGwtZTJlXCIgYW5kIGRlbGF5IDUgc28gdGhlIGNvbW1hbmQgZmluaXNoZXMgYmVmb3JlIHRoZSByZWFkIHJldHVybnMuJyxcblx0XHRcdCdUaGVuIHJlcGx5IHdpdGggZXhhY3RseSBcIlJFQURfU0hFTExfRTJFX0RPTkVcIi4nLFxuXHRcdF0uam9pbignICcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCBwcm9tcHQsIDEpO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvUkVBRF9TSEVMTF9FMkVfRE9ORS8pO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKVxuXHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24gfSkpXG5cdFx0XHQuZmluZCgoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYXRVcmkgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIC9ecmVhZF8oPzpiYXNofHBvd2Vyc2hlbGwpJC8udGVzdChhY3Rpb24udG9vbE5hbWUpKTtcblx0XHRhc3NlcnQub2soc3RhcnQsICdleHBlY3RlZCBhIHNoZWxsIHJlYWQgaGVscGVyIHRvb2wgY2FsbCcpO1xuXG5cdFx0Y29uc3QgcmVhZHkgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKVxuXHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24gfSkpXG5cdFx0XHQuZmluZCgoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYXRVcmkgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sQ2FsbElkID09PSBzdGFydC5hY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0Y29uc3QgY29tcGxldGUgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKVxuXHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gfSkpXG5cdFx0XHQuZmluZCgoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYXRVcmkgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sQ2FsbElkID09PSBzdGFydC5hY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0YXNzZXJ0Lm9rKHJlYWR5LCAnZXhwZWN0ZWQgdGhlIHNoZWxsIHJlYWQgaGVscGVyIHRvIGJlY29tZSByZWFkeScpO1xuXHRcdGFzc2VydC5vayhjb21wbGV0ZSwgJ2V4cGVjdGVkIHRoZSBzaGVsbCByZWFkIGhlbHBlciB0byBjb21wbGV0ZScpO1xuXG5cdFx0Y29uc3QgdG9vbElucHV0ID0gZ2V0SW5saW5lVG9vbElucHV0KHJlYWR5LmFjdGlvbi50b29sSW5wdXQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGxheU5hbWU6IHN0YXJ0LmFjdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdHRvb2xLaW5kczogW1xuXHRcdFx0XHRyZWFkVG9vbENhbGxNZXRhKHN0YXJ0LmFjdGlvbikudG9vbEtpbmQsXG5cdFx0XHRcdHJlYWRUb29sQ2FsbE1ldGEocmVhZHkuYWN0aW9uKS50b29sS2luZCxcblx0XHRcdFx0cmVhZFRvb2xDYWxsTWV0YShjb21wbGV0ZS5hY3Rpb24pLnRvb2xLaW5kLFxuXHRcdFx0XSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiByZWFkeS5hY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHR0b29sSW5wdXQ6IHRvb2xJbnB1dCA/IEpTT04ucGFyc2UodG9vbElucHV0KSA6IHVuZGVmaW5lZCxcblx0XHRcdHN1Y2Nlc3M6IGNvbXBsZXRlLmFjdGlvbi5yZXN1bHQuc3VjY2Vzcyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGNvbXBsZXRlLmFjdGlvbi5yZXN1bHQucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdGNvbnRlbnRUeXBlczogY29tcGxldGUuYWN0aW9uLnJlc3VsdC5jb250ZW50Py5tYXAoY29udGVudCA9PiBjb250ZW50LnR5cGUpLFxuXHRcdH0sIHtcblx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCBUZXJtaW5hbCcsXG5cdFx0XHR0b29sS2luZHM6IFt1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBUZXJtaW5hbCcsXG5cdFx0XHR0b29sSW5wdXQ6IHsgc2hlbGxJZDogJ3JlYWQtc2hlbGwtZTJlJywgZGVsYXk6IDUgfSxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmVhZCBUZXJtaW5hbCcsXG5cdFx0XHRjb250ZW50VHlwZXM6IFtUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dF0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCh0aGlzLnRlc3QhLCBjbGllbnQsIHtcblx0XHRcdHByb2ZpbGU6ICdwcm90b2NvbCcsXG5cdFx0XHRpZ25vcmVkQWN0aW9uVHlwZXM6IFtcblx0XHRcdFx0QWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHRcdEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkLFxuXHRcdFx0XHRBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHRcdEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZCxcblx0XHRcdFx0QWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksXG5cdFx0XHRcdEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0LFxuXHRcdFx0XHRBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFJlbW92ZWQsXG5cdFx0XHRcdEFjdGlvblR5cGUuU2Vzc2lvbkNoYW5nZXNldHNDaGFuZ2VkLFxuXHRcdFx0XHRBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZCxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgnc3RyaXBzIHJlZHVuZGFudCBgY2QgPHdvcmtpbmdEaXJlY3Rvcnk+ICYmYCBwcmVmaXggZnJvbSBzaGVsbCB0b29sIGNhbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZURpciA9IGF3YWl0IG1rZHRlbXAoYCR7dG1wZGlyKCl9L2FocC1jZC1zdHJpcC10ZXN0LWApO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlRGlyKTtcblx0XHRjb25zdCBleHBlY3RlZFdvcmtpbmdEaXJQYXRoID0gd29ya3NwYWNlRGlyO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPUElMT1RfQ09ORklHLCAncmVhbC1zZGstY2Qtc3RyaXAnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZURpcikpO1xuXG5cdFx0Y2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1jZC1zdHJpcCc7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLFxuXHRcdFx0YFJ1biB0aGlzIGV4YWN0IHNoZWxsIGNvbW1hbmQsIGRvIG5vdCBtb2RpZnkgaXQ6IGNkICR7ZXhwZWN0ZWRXb3JraW5nRGlyUGF0aH0gJiYgZWNobyBzdHJpcC1tZS1wbGVhc2VgLFxuXHRcdFx0MSk7XG5cblx0XHRjb25zdCB0b29sU3RhcnROb3RpZiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShuKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbjtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiBhY3Rpb24udG9vbE5hbWUgPT09IENPUElMT1RfQ09ORklHLnNoZWxsVG9vbE5hbWU7XG5cdFx0fSwgOTBfMDAwKTtcblx0XHRjb25zdCB0b29sU3RhcnRBY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZSh0b29sU3RhcnROb3RpZikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uO1xuXG5cdFx0Y29uc3QgdG9vbFJlYWR5Tm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRyZXR1cm4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0XHQmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWRcblx0XHRcdFx0JiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHRvb2xTdGFydEFjdGlvbi50b29sQ2FsbElkXG5cdFx0XHRcdCYmIHR5cGVvZiBhY3Rpb24udG9vbElucHV0ID09PSAnc3RyaW5nJztcblx0XHR9LCA5MF8wMDApO1xuXG5cdFx0Y29uc3QgdG9vbFJlYWR5RW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZSh0b29sUmVhZHlOb3RpZik7XG5cdFx0Y29uc3QgdG9vbFJlYWR5QWN0aW9uID0gdG9vbFJlYWR5RW52ZWxvcGUuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uO1xuXHRcdGNvbnN0IHRvb2xJbnB1dCA9IGdldElubGluZVRvb2xJbnB1dCh0b29sUmVhZHlBY3Rpb24udG9vbElucHV0KTtcblx0XHRhc3NlcnQub2sodG9vbElucHV0KTtcblxuXHRcdGNvbnN0IGVzY2FwZWRXb3JraW5nRGlyUGF0aCA9IGV4cGVjdGVkV29ya2luZ0RpclBhdGgucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcblx0XHRjb25zdCByZWR1bmRhbnRXb3JraW5nRGlyQ2RQcmVmaXggPSBuZXcgUmVnRXhwKFxuXHRcdFx0YF5cXFxccypjZFxcXFxzKyg/OlwiJHtlc2NhcGVkV29ya2luZ0RpclBhdGh9XCJ8JyR7ZXNjYXBlZFdvcmtpbmdEaXJQYXRofSd8JHtlc2NhcGVkV29ya2luZ0RpclBhdGh9KVxcXFxzKig/OiYmfDspXFxcXHMqYCxcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFyZWR1bmRhbnRXb3JraW5nRGlyQ2RQcmVmaXgudGVzdCh0b29sSW5wdXQpLFxuXHRcdFx0YHRvb2xJbnB1dCBzaG91bGQgbm90IGNvbnRhaW4gYSByZWR1bmRhbnQgY2QtcHJlZml4IHRhcmdldGluZyB0aGUgd29ya2luZyBkaXJlY3Rvcnk7IGdvdDogJHtKU09OLnN0cmluZ2lmeSh0b29sSW5wdXQpfWAsXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHR0b29sSW5wdXQuaW5jbHVkZXMoJ3N0cmlwLW1lLXBsZWFzZScpLFxuXHRcdFx0YHRvb2xJbnB1dCBzaG91bGQgcmV0YWluIHRoZSBjb21tYW5kIG1hcmtlciBhZnRlciByZXdyaXRpbmc7IGdvdDogJHtKU09OLnN0cmluZ2lmeSh0b29sSW5wdXQpfWAsXG5cdFx0KTtcblxuXHRcdGlmICghdG9vbFJlYWR5QWN0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogdG9vbFJlYWR5RW52ZWxvcGUuY2hhbm5lbCxcblx0XHRcdFx0Y2xpZW50U2VxOiAyLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogdG9vbFJlYWR5QWN0aW9uLnRvb2xDYWxsSWQsIGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlZW5TZXFzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0c2VlblNlcXMuYWRkKHRvb2xSZWFkeUVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0bGV0IHRlYXJkb3duU2VxID0gMztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKFxuXHRcdFx0XHRuID0+IHtcblx0XHRcdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uO1xuXHRcdFx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiAhc2VlblNlcXMuaGFzKGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdDkwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obmV4dCwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuZXh0KS5hY3Rpb24gYXMgQ2hhdEVycm9yQWN0aW9uO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGNkLXN0cmlwIHR1cm4gZmFpbGVkOiAke0pTT04uc3RyaW5naWZ5KGFjdGlvbi5lcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obmV4dCwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG5leHQpO1xuXHRcdFx0c2VlblNlcXMuYWRkKGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRpZiAoIWFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRjaGFubmVsOiBlbnZlbG9wZS5jaGFubmVsLFxuXHRcdFx0XHRcdGNsaWVudFNlcTogKyt0ZWFyZG93blNlcSxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBMEJBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsaUJBQWlCO0FBQ25DLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCLGFBQWEsb0JBQW9CLGtCQUFrQixnQkFBZ0IsNEJBQTRCLHlCQUF5QixnQkFBZ0IsdUJBQXVCLFdBQVcscUJBQXFCLDBCQUFrRDtBQUNqUixTQUFTLGtCQUF5TDtBQUNsTSxTQUFTLHdCQUF3QjtBQUNqQztBQUFBLEVBQ0M7QUFBQSxF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
