import assert from "assert";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { CompletionItemKind } from "../../../../common/state/protocol/commands.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, MessageAttachmentKind, MessageKind, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import {
  createRealSession,
  dispatchTurn,
  driveTurnWithCancelledInputToCompletion,
  driveTurnWithAttachmentsToCompletion,
  driveTurnToCompletion,
  driveTurnWithModelToCompletion,
  resolveGitHubToken
} from "../harness/agentHostE2ETestHarness.js";
import { assertRecordedAhpSnapshot } from "../harness/ahpSnapshot.js";
import { summarizeAnthropicRequest } from "../harness/capiWireCodec.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { providerHostOnlyTest } from "./e2eTestContext.js";
function defineCoreTests(context) {
  const { config, createdSessions, tempDirs } = context;
  const behaviorSnapshot = { profile: "behavior" };
  const modelSwitchTarget = config.modelSwitchTarget;
  const modelSwitchReturnTarget = config.modelSwitchReturnTarget;
  const interactiveInputPrompt = config.interactiveInputPrompt;
  const cancelledInputPrompt = config.cancelledInputPrompt;
  const textInputPrompt = config.textInputPrompt;
  const multiSelectInputPrompt = config.multiSelectInputPrompt;
  function observedModelRequest(body) {
    assert.ok(body, "Expected an observed model request");
    const request = summarizeAnthropicRequest(body);
    assert.ok(request, `Expected an Anthropic model request: ${body}`);
    return request;
  }
  function modelContentText(value) {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(modelContentText).join("");
    }
    if (isRecord(value)) {
      if (typeof value.text === "string") {
        return value.text;
      }
      return modelContentText(value.content);
    }
    return "";
  }
  function toolResultTexts(value) {
    if (Array.isArray(value)) {
      return value.flatMap(toolResultTexts);
    }
    if (!isRecord(value)) {
      return [];
    }
    return value.type === "tool_result" ? [modelContentText(value.content)] : [];
  }
  function observedToolResultTexts() {
    const request = observedModelRequest(context.observedModelRequestBodies.at(-1));
    return request.messages.flatMap((message) => toolResultTexts(message.content));
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  async function createSessionWithWorkingDirectories(prefix, workingDirectories) {
    const clientWorkspace = workingDirectories[0]?.fsPath ?? mkdtempSync(join(tmpdir(), "ahp-client-workspace-"));
    if (workingDirectories.length === 0) {
      tempDirs.push(clientWorkspace);
    }
    context.client.setWorkingDirectory(clientWorkspace);
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `${prefix}-${config.provider}`
    }, 3e4);
    await context.client.call("authenticate", {
      channel: ROOT_STATE_URI,
      resource: "https://api.github.com",
      token: config.githubToken ?? resolveGitHubToken()
    }, 3e4);
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: workingDirectories.map((directory) => directory.toString()),
      config: { isolation: "folder" }
    }, 3e4);
    createdSessions.push(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    context.client.clearReceived();
    return sessionUri;
  }
  async function createAdditionalSession(workingDirectory) {
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: [workingDirectory.toString()],
      config: { isolation: "folder" }
    }, 3e4);
    createdSessions.push(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    context.client.clearReceived();
    return sessionUri;
  }
  test("sends a simple message and receives a response", async function() {
    this.timeout(12e4);
    const workspaceDir = mkdtempSync(`${tmpdir()}/read-sdk-simple`);
    tempDirs.push(workspaceDir);
    const sessionUri = await createRealSession(context.client, config, `real-sdk-simple-${config.provider}`, createdSessions, URI.file(workspaceDir));
    dispatchTurn(context.client, sessionUri, "turn-1", 'Say exactly "hello" and nothing else', 1);
    const complete = await context.client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"), 9e4);
    const completeAction = getActionEnvelope(complete).action;
    assert.strictEqual(completeAction.turnId, "turn-1");
    const responseParts = context.client.receivedNotifications((n) => isActionNotification(n, "chat/responsePart"));
    assert.ok(responseParts.length > 0, "should have received at least one response part");
  });
  test("preserves a fenced multiline markdown response", async function() {
    this.timeout(12e4);
    const workspaceDir = mkdtempSync(join(tmpdir(), "ahp-markdown-response-"));
    tempDirs.push(workspaceDir);
    const sessionUri = await createRealSession(
      context.client,
      config,
      `markdown-response-${config.provider}`,
      createdSessions,
      URI.file(workspaceDir)
    );
    const expected = "```text\nALPHA\nBETA\n```";
    const result = await driveTurnToCompletion(
      context.client,
      sessionUri,
      "turn-markdown-response",
      `Reply with exactly this Markdown code block and nothing else:
${expected}`,
      1
    );
    assert.strictEqual(result.responseText, expected);
  });
  test("listModels returns well-shaped model entries after authenticate", async function() {
    this.timeout(6e4);
    await context.client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-list-models-${config.provider}` }, 3e4);
    const rootResult = await context.client.call("subscribe", { channel: ROOT_STATE_URI }, 3e4);
    const initial = rootResult.snapshot.state;
    const providerAgent = initial.agents.find((a) => a.provider === config.provider);
    assert.ok(providerAgent, `Expected ${config.provider} agent in root state, got: ${initial.agents.map((a) => a.provider).join(", ")}`);
    await context.client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: resolveGitHubToken() }, 3e4);
    let agent = providerAgent;
    if (agent.models.length === 0) {
      try {
        const notif = await context.client.waitForNotification((n) => {
          if (!isActionNotification(n, "root/agentsChanged")) {
            return false;
          }
          const action2 = getActionEnvelope(n).action;
          const a = action2.agents.find((a2) => a2.provider === config.provider);
          return !!a && a.models.length > 0;
        }, 3e4);
        const action = getActionEnvelope(notif).action;
        agent = action.agents.find((a) => a.provider === config.provider);
      } catch (err) {
        const seen = context.client.receivedNotifications((n) => isActionNotification(n, "root/agentsChanged")).map((n) => {
          const a = getActionEnvelope(n).action;
          const entry = a.agents.find((x) => x.provider === config.provider);
          return entry ? { modelCount: entry.models.length, modelIds: entry.models.map((m) => m.id) } : { missing: true };
        });
        throw new Error(`${config.provider}: timed out waiting for agentsChanged with non-empty models. Observed agentsChanged: ${JSON.stringify(seen)}. Original error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    assert.ok(agent.models.length > 0, "Expected at least one model from listModels");
    const expectedModelProviders = config.modelProviders ?? [config.provider];
    for (const model of agent.models) {
      assert.strictEqual(typeof model.id, "string", `model.id should be a string: ${JSON.stringify(model)}`);
      assert.ok(model.id.length > 0, `model.id should be non-empty: ${JSON.stringify(model)}`);
      assert.strictEqual(typeof model.name, "string", `model.name should be a string: ${JSON.stringify(model)}`);
      assert.ok(expectedModelProviders.includes(model.provider), `model.provider should be one of ${expectedModelProviders.join(", ")}: ${JSON.stringify(model)}`);
      assert.ok(
        model.maxContextWindow === void 0 || typeof model.maxContextWindow === "number" && model.maxContextWindow >= 0,
        `model.maxContextWindow should be undefined or a non-negative number: ${JSON.stringify(model)}`
      );
      assert.ok(
        model.supportsVision === void 0 || typeof model.supportsVision === "boolean",
        `model.supportsVision should be boolean or undefined: ${JSON.stringify(model)}`
      );
    }
  });
  test("retains context across consecutive turns", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-memory-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `coverage-memory-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const first = await driveTurnToCompletion(context.client, sessionUri, "turn-memory-1", 'Remember the code word ORCHID. Reply exactly "ready".', 1);
    assert.match(first.responseText, /ready/i);
    context.client.beginAhpSnapshotRound();
    const second = await driveTurnToCompletion(context.client, sessionUri, "turn-memory-2", "What code word did I ask you to remember? Reply with only the code word.", 10);
    assert.match(second.responseText, /ORCHID/i);
    await assertRecordedAhpSnapshot(this.test, context.client, behaviorSnapshot);
  });
  (modelSwitchTarget ? test : test.skip)("client-selected model is used for the turn", async function() {
    this.timeout(18e4);
    assert.ok(modelSwitchTarget);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-model-switch-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `model-switch-${config.provider}`, createdSessions, URI.file(workspace));
    const result = await driveTurnWithModelToCompletion(
      context.client,
      sessionUri,
      "turn-model-switch",
      'Reply exactly "model selected".',
      modelSwitchTarget,
      1
    );
    assert.deepStrictEqual({
      model: observedModelRequest(context.observedModelRequestBodies.at(-1)).model,
      response: result.responseText.trim()
    }, {
      model: modelSwitchTarget,
      response: "model selected"
    });
  });
  (interactiveInputPrompt ? test : test.skip)("provider input request is answered through AHP", async function() {
    this.timeout(18e4);
    assert.ok(interactiveInputPrompt);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-input-request-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `input-request-${config.provider}`, createdSessions, URI.file(workspace));
    const result = await driveTurnToCompletion(
      context.client,
      sessionUri,
      "turn-input-request",
      interactiveInputPrompt,
      1
    );
    assert.deepStrictEqual({
      sawInputRequest: result.sawInputRequest,
      forwardedAnswer: observedToolResultTexts().some((text) => text.includes("Apple"))
    }, {
      sawInputRequest: true,
      forwardedAnswer: true
    });
  });
  (modelSwitchTarget && modelSwitchReturnTarget ? test : test.skip)("model changes between turns retain provider context", async function() {
    this.timeout(18e4);
    assert.ok(modelSwitchTarget);
    assert.ok(modelSwitchReturnTarget);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-model-change-context-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `model-change-context-${config.provider}`, createdSessions, URI.file(workspace));
    const first = await driveTurnWithModelToCompletion(
      context.client,
      sessionUri,
      "turn-model-change-first",
      'Remember the exact code word MARIGOLD. Reply exactly "ready".',
      modelSwitchTarget,
      1
    );
    const second = await driveTurnWithModelToCompletion(
      context.client,
      sessionUri,
      "turn-model-change-second",
      "Reply with only the exact code word I asked you to remember.",
      modelSwitchReturnTarget,
      10
    );
    assert.deepStrictEqual({
      models: context.observedModelRequestBodies.slice(-2).map((body) => observedModelRequest(body).model),
      first: first.responseText.trim(),
      secondRemembersCodeWord: /MARIGOLD/i.test(second.responseText)
    }, {
      models: [modelSwitchTarget, modelSwitchReturnTarget],
      first: "ready",
      secondRemembersCodeWord: true
    });
  });
  (cancelledInputPrompt ? test : test.skip)("provider input request cancellation returns to the turn", async function() {
    this.timeout(18e4);
    assert.ok(cancelledInputPrompt);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-input-cancel-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `input-cancel-${config.provider}`, createdSessions, URI.file(workspace));
    const result = await driveTurnWithCancelledInputToCompletion(
      context.client,
      sessionUri,
      "turn-input-cancel",
      cancelledInputPrompt,
      1
    );
    assert.deepStrictEqual({
      sawInputRequest: result.sawInputRequest,
      responseEndsWithCancelled: result.responseText.trim().endsWith("cancelled")
    }, {
      sawInputRequest: true,
      responseEndsWithCancelled: true
    });
  });
  (interactiveInputPrompt && config.supportsPausedTurnCancellationE2E ? test : test.skip)("cancelling a turn paused for input allows a replacement turn", async function() {
    this.timeout(18e4);
    assert.ok(interactiveInputPrompt);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-cancel-input-turn-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `cancel-input-turn-${config.provider}`, createdSessions, URI.file(workspace));
    const chatUri = buildDefaultChatUri(sessionUri);
    const turnId = "turn-cancel-input";
    dispatchTurn(context.client, sessionUri, turnId, interactiveInputPrompt, 1);
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/inputRequested") && getActionEnvelope(n).channel === chatUri,
      9e4
    );
    context.client.dispatch({
      channel: chatUri,
      clientSeq: 2,
      action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnCancelled") && getActionEnvelope(n).channel === chatUri,
      3e4
    );
    const replacement = await driveTurnToCompletion(
      context.client,
      sessionUri,
      "turn-after-input-cancel",
      'Reply exactly "replacement".',
      3
    );
    assert.strictEqual(replacement.responseText.trim(), "replacement");
  });
  (textInputPrompt ? test : test.skip)("provider freeform input is answered through AHP", async function() {
    this.timeout(18e4);
    assert.ok(textInputPrompt);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-input-text-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `input-text-${config.provider}`, createdSessions, URI.file(workspace));
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-input-text", textInputPrompt, 1);
    assert.deepStrictEqual({
      sawInputRequest: result.sawInputRequest,
      forwardedAnswer: observedToolResultTexts().some((text) => text.includes("interactive"))
    }, {
      sawInputRequest: true,
      forwardedAnswer: true
    });
  });
  (multiSelectInputPrompt ? test : test.skip)("provider multi-select input is answered through AHP", async function() {
    this.timeout(18e4);
    assert.ok(multiSelectInputPrompt);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-input-multi-select-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `input-multi-select-${config.provider}`, createdSessions, URI.file(workspace));
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-input-multi-select", multiSelectInputPrompt, 1);
    const forwardedSelections = observedToolResultTexts();
    assert.deepStrictEqual({
      sawInputRequest: result.sawInputRequest,
      forwardedSelectionsContainRed: forwardedSelections.length > 0 && forwardedSelections.every((text) => text.includes("Red"))
    }, {
      sawInputRequest: true,
      forwardedSelectionsContainRed: true
    });
  });
  (config.supportsWorkspacelessE2E ? test : test.skip)("workspaceless session materializes and completes a turn", async function() {
    this.timeout(18e4);
    const sessionUri = await createSessionWithWorkingDirectories("workspaceless", []);
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-workspaceless", 'Reply exactly "workspaceless".', 1);
    const session = await context.client.call("subscribe", { channel: sessionUri });
    assert.deepStrictEqual({
      response: result.responseText.trim(),
      workingDirectoryCount: session.snapshot.state.workingDirectories?.length
    }, {
      response: "workspaceless",
      workingDirectoryCount: 1
    });
  });
  (config.supportsRuntimeSlashCommandsE2E ? test : test.skip)("materialized provider exposes runtime slash command completions", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-runtime-slash-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `runtime-slash-${config.provider}`, createdSessions, URI.file(workspace));
    await driveTurnToCompletion(context.client, sessionUri, "turn-runtime-slash", 'Reply exactly "ready".', 1);
    const completions = await context.client.call("completions", {
      channel: buildDefaultChatUri(sessionUri),
      kind: CompletionItemKind.UserMessage,
      text: "/",
      offset: 1
    });
    assert.ok(completions.items.some((item) => item.insertText.startsWith("/")));
  });
  if (config.supportsAttachmentsE2E) {
    test("default chat simple attachment reaches the provider request", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-simple-attachment-"));
      tempDirs.push(workspace);
      const sessionUri = await createRealSession(context.client, config, `simple-attachment-${config.provider}`, createdSessions, URI.file(workspace));
      const attachments = [{
        type: MessageAttachmentKind.Simple,
        label: "facts.txt",
        modelRepresentation: "ATTACHMENT_SIMPLE_VALUE"
      }];
      const result = await driveTurnWithAttachmentsToCompletion(
        context.client,
        sessionUri,
        "turn-simple-attachment",
        "Reply with only the value from the attachment.",
        attachments,
        1
      );
      assert.ok(result.responseText.includes("ATTACHMENT_SIMPLE_VALUE"));
    });
    test("default chat resource attachment reaches the provider request", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-resource-attachment-"));
      tempDirs.push(workspace);
      const file = join(workspace, "resource.txt");
      writeFileSync(file, "ATTACHMENT_RESOURCE_VALUE");
      const sessionUri = await createRealSession(context.client, config, `resource-attachment-${config.provider}`, createdSessions, URI.file(workspace));
      const attachments = [{
        type: MessageAttachmentKind.Resource,
        label: "resource.txt",
        uri: URI.file(file).toString()
      }];
      const result = await driveTurnWithAttachmentsToCompletion(
        context.client,
        sessionUri,
        "turn-resource-attachment",
        "Read the attached resource and reply with only its exact contents.",
        attachments,
        1
      );
      assert.ok(result.responseText.includes("ATTACHMENT_RESOURCE_VALUE"));
    });
    test("default chat embedded text attachment reaches the provider request", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-embedded-attachment-"));
      tempDirs.push(workspace);
      const sessionUri = await createRealSession(context.client, config, `embedded-attachment-${config.provider}`, createdSessions, URI.file(workspace));
      const attachments = [{
        type: MessageAttachmentKind.EmbeddedResource,
        label: "embedded.txt",
        contentType: "text/plain",
        data: Buffer.from("ATTACHMENT_EMBEDDED_VALUE").toString("base64")
      }];
      const result = await driveTurnWithAttachmentsToCompletion(
        context.client,
        sessionUri,
        "turn-embedded-attachment",
        "Read the embedded attachment and reply with only its exact contents.",
        attachments,
        1
      );
      assert.ok(result.responseText.includes("ATTACHMENT_EMBEDDED_VALUE"));
    });
    test("chat attachment pins the latest completed source turn", async function() {
      this.timeout(24e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-chat-attachment-latest-"));
      tempDirs.push(workspace);
      const source = await createRealSession(context.client, config, `chat-attachment-source-${config.provider}`, createdSessions, URI.file(workspace));
      await driveTurnToCompletion(
        context.client,
        source,
        "turn-chat-attachment-source",
        'Remember CHAT_ATTACHMENT_LATEST. Reply exactly "ready".',
        1
      );
      const target = await createAdditionalSession(URI.file(workspace));
      const attachments = [{
        type: MessageAttachmentKind.Chat,
        label: "Source conversation",
        resource: buildDefaultChatUri(source)
      }];
      const result = await driveTurnWithAttachmentsToCompletion(
        context.client,
        target,
        "turn-chat-attachment-target",
        "Reply with only the code word from the attached conversation.",
        attachments,
        10
      );
      assert.ok(result.responseText.includes("CHAT_ATTACHMENT_LATEST"));
    });
    test("chat attachment end turn excludes later source turns", async function() {
      this.timeout(24e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-chat-attachment-bounded-"));
      tempDirs.push(workspace);
      const source = await createRealSession(context.client, config, `chat-attachment-bounded-source-${config.provider}`, createdSessions, URI.file(workspace));
      await driveTurnToCompletion(
        context.client,
        source,
        "turn-chat-attachment-alpha",
        'Remember CHAT_ATTACHMENT_ALPHA. Reply exactly "ready".',
        1
      );
      await driveTurnToCompletion(
        context.client,
        source,
        "turn-chat-attachment-beta",
        'Now remember CHAT_ATTACHMENT_BETA too. Reply exactly "ready".',
        10
      );
      const target = await createAdditionalSession(URI.file(workspace));
      const attachments = [{
        type: MessageAttachmentKind.Chat,
        label: "Bounded source conversation",
        resource: buildDefaultChatUri(source),
        endTurn: "turn-chat-attachment-alpha"
      }];
      const result = await driveTurnWithAttachmentsToCompletion(
        context.client,
        target,
        "turn-chat-attachment-bounded-target",
        'Reply exactly "alpha only" if the attachment contains CHAT_ATTACHMENT_ALPHA but not CHAT_ATTACHMENT_BETA.',
        attachments,
        20
      );
      assert.strictEqual(result.responseText.trim(), "alpha only");
    });
  }
  if (config.supportsTruncateE2E) {
    test("truncating a materialized chat removes later context and allows continuation", async function() {
      this.timeout(24e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-truncate-"));
      tempDirs.push(workspace);
      const sessionUri = await createRealSession(context.client, config, `truncate-${config.provider}`, createdSessions, URI.file(workspace));
      await driveTurnToCompletion(context.client, sessionUri, "turn-truncate-first", 'Remember ALPHA. Reply exactly "ready".', 1);
      await driveTurnToCompletion(context.client, sessionUri, "turn-truncate-second", 'Now remember BETA too. Reply exactly "ready".', 10);
      const chatUri = buildDefaultChatUri(sessionUri);
      context.client.dispatch({
        channel: chatUri,
        clientSeq: 20,
        action: { type: ActionType.ChatTruncated, turnId: "turn-truncate-first" }
      });
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/truncated") && getActionEnvelope(n).channel === chatUri,
        3e4
      );
      const result = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-truncate-followup",
        'Reply with exactly "ALPHA only".',
        30
      );
      const state = await context.client.call("subscribe", { channel: chatUri });
      assert.deepStrictEqual({
        response: result.responseText.trim(),
        messages: state.snapshot.state.turns.map((turn) => turn.message.text)
      }, {
        response: "ALPHA only",
        messages: [
          'Remember ALPHA. Reply exactly "ready".',
          'Reply with exactly "ALPHA only".'
        ]
      });
    });
  }
  providerHostOnlyTest(context, "provider session config schema is exposed through AHP", async function() {
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `config-schema-${config.provider}`
    }, 3e4);
    const resolved = await context.client.call("resolveSessionConfig", {
      channel: ROOT_STATE_URI,
      provider: config.provider,
      workingDirectories: []
    }, 3e4);
    assert.deepStrictEqual({
      schemaType: resolved.schema.type,
      hasProperties: Object.keys(resolved.schema.properties ?? {}).length > 0,
      valuesType: typeof resolved.values
    }, {
      schemaType: "object",
      hasProperties: true,
      valuesType: "object"
    });
  });
  providerHostOnlyTest(context, "provider session config completions are deterministic", async function() {
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `config-completions-${config.provider}`
    }, 3e4);
    const result = await context.client.call("sessionConfigCompletions", {
      channel: ROOT_STATE_URI,
      provider: config.provider,
      property: "mode",
      query: "",
      workingDirectories: []
    }, 3e4);
    assert.ok(Array.isArray(result.items));
  });
  providerHostOnlyTest(context, "stale model selection fails the turn without contacting a model", async function() {
    const workspace = mkdtempSync(join(tmpdir(), "ahp-stale-model-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `stale-model-${config.provider}`, createdSessions, URI.file(workspace));
    const chatUri = buildDefaultChatUri(sessionUri);
    const turnId = "turn-stale-model";
    context.client.dispatch({
      channel: chatUri,
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "This turn must fail before contacting a model.",
          origin: { kind: MessageKind.User },
          model: { id: "e2e-model-that-does-not-exist" }
        }
      }
    });
    const failed = await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/error") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      3e4
    );
    const action = getActionEnvelope(failed).action;
    assert.deepStrictEqual({
      errorType: action.error.errorType,
      mentionsModel: /model/i.test(action.error.message)
    }, {
      errorType: config.provider === "copilotcli" ? "sendFailed" : config.provider === "claude" ? "success" : "modelSelectionFailed",
      mentionsModel: true
    });
  });
}
export {
  defineCoreTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcY29yZVN1aXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkdGVtcFN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQsIHR5cGUgQ29tcGxldGlvbnNSZXN1bHQsIHR5cGUgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIHR5cGUgU2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0LCBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgUm9vdEFnZW50c0NoYW5nZWRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBNZXNzYWdlS2luZCwgUk9PVF9TVEFURV9VUkksIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQge1xuXHRjcmVhdGVSZWFsU2Vzc2lvbixcblx0ZGlzcGF0Y2hUdXJuLFxuXHRkcml2ZVR1cm5XaXRoQ2FuY2VsbGVkSW5wdXRUb0NvbXBsZXRpb24sXG5cdGRyaXZlVHVybldpdGhBdHRhY2htZW50c1RvQ29tcGxldGlvbixcblx0ZHJpdmVUdXJuVG9Db21wbGV0aW9uLFxuXHRkcml2ZVR1cm5XaXRoTW9kZWxUb0NvbXBsZXRpb24sXG5cdHJlc29sdmVHaXRIdWJUb2tlbixcbn0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90IH0gZnJvbSAnLi4vaGFybmVzcy9haHBTbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBzdW1tYXJpemVBbnRocm9waWNSZXF1ZXN0LCB0eXBlIElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3QgfSBmcm9tICcuLi9oYXJuZXNzL2NhcGlXaXJlQ29kZWMuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBwcm92aWRlckhvc3RPbmx5VGVzdCwgdHlwZSBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQgfSBmcm9tICcuL2UyZVRlc3RDb250ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvcmVUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMgfSA9IGNvbnRleHQ7XG5cdGNvbnN0IGJlaGF2aW9yU25hcHNob3QgPSB7IHByb2ZpbGU6ICdiZWhhdmlvcicgfSBhcyBjb25zdDtcblx0Y29uc3QgbW9kZWxTd2l0Y2hUYXJnZXQgPSBjb25maWcubW9kZWxTd2l0Y2hUYXJnZXQ7XG5cdGNvbnN0IG1vZGVsU3dpdGNoUmV0dXJuVGFyZ2V0ID0gY29uZmlnLm1vZGVsU3dpdGNoUmV0dXJuVGFyZ2V0O1xuXHRjb25zdCBpbnRlcmFjdGl2ZUlucHV0UHJvbXB0ID0gY29uZmlnLmludGVyYWN0aXZlSW5wdXRQcm9tcHQ7XG5cdGNvbnN0IGNhbmNlbGxlZElucHV0UHJvbXB0ID0gY29uZmlnLmNhbmNlbGxlZElucHV0UHJvbXB0O1xuXHRjb25zdCB0ZXh0SW5wdXRQcm9tcHQgPSBjb25maWcudGV4dElucHV0UHJvbXB0O1xuXHRjb25zdCBtdWx0aVNlbGVjdElucHV0UHJvbXB0ID0gY29uZmlnLm11bHRpU2VsZWN0SW5wdXRQcm9tcHQ7XG5cblx0ZnVuY3Rpb24gb2JzZXJ2ZWRNb2RlbFJlcXVlc3QoYm9keTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB7XG5cdFx0YXNzZXJ0Lm9rKGJvZHksICdFeHBlY3RlZCBhbiBvYnNlcnZlZCBtb2RlbCByZXF1ZXN0Jyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHN1bW1hcml6ZUFudGhyb3BpY1JlcXVlc3QoYm9keSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3QsIGBFeHBlY3RlZCBhbiBBbnRocm9waWMgbW9kZWwgcmVxdWVzdDogJHtib2R5fWApO1xuXHRcdHJldHVybiByZXF1ZXN0O1xuXHR9XG5cblx0ZnVuY3Rpb24gbW9kZWxDb250ZW50VGV4dCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKG1vZGVsQ29udGVudFRleHQpLmpvaW4oJycpO1xuXHRcdH1cblx0XHRpZiAoaXNSZWNvcmQodmFsdWUpKSB7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlLnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZS50ZXh0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1vZGVsQ29udGVudFRleHQodmFsdWUuY29udGVudCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGZ1bmN0aW9uIHRvb2xSZXN1bHRUZXh0cyh2YWx1ZTogdW5rbm93bik6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5mbGF0TWFwKHRvb2xSZXN1bHRUZXh0cyk7XG5cdFx0fVxuXHRcdGlmICghaXNSZWNvcmQodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZS50eXBlID09PSAndG9vbF9yZXN1bHQnID8gW21vZGVsQ29udGVudFRleHQodmFsdWUuY29udGVudCldIDogW107XG5cdH1cblxuXHRmdW5jdGlvbiBvYnNlcnZlZFRvb2xSZXN1bHRUZXh0cygpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG9ic2VydmVkTW9kZWxSZXF1ZXN0KGNvbnRleHQub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuYXQoLTEpKTtcblx0XHRyZXR1cm4gcmVxdWVzdC5tZXNzYWdlcy5mbGF0TWFwKG1lc3NhZ2UgPT4gdG9vbFJlc3VsdFRleHRzKG1lc3NhZ2UuY29udGVudCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNSZWNvcmQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGw7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uV2l0aFdvcmtpbmdEaXJlY3RvcmllcyhwcmVmaXg6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2xpZW50V29ya3NwYWNlID0gd29ya2luZ0RpcmVjdG9yaWVzWzBdPy5mc1BhdGggPz8gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jbGllbnQtd29ya3NwYWNlLScpKTtcblx0XHRpZiAod29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGVtcERpcnMucHVzaChjbGllbnRXb3Jrc3BhY2UpO1xuXHRcdH1cblx0XHRjb250ZXh0LmNsaWVudC5zZXRXb3JraW5nRGlyZWN0b3J5KGNsaWVudFdvcmtzcGFjZSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6IGAke3ByZWZpeH0tJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHR9LCAzMF8wMDApO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRcdHRva2VuOiBjb25maWcuZ2l0aHViVG9rZW4gPz8gcmVzb2x2ZUdpdEh1YlRva2VuKCksXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IGNvbmZpZy5zY2hlbWUsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3JpZXMubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkudG9TdHJpbmcoKSksXG5cdFx0XHRjb25maWc6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdH0sIDMwXzAwMCk7XG5cdFx0Y3JlYXRlZFNlc3Npb25zLnB1c2goc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkgfSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdHJldHVybiBzZXNzaW9uVXJpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlQWRkaXRpb25hbFNlc3Npb24od29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IGNvbmZpZy5zY2hlbWUsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbd29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpXSxcblx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSB9KTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0cmV0dXJuIHNlc3Npb25Vcmk7XG5cdH1cblx0dGVzdCgnc2VuZHMgYSBzaW1wbGUgbWVzc2FnZSBhbmQgcmVjZWl2ZXMgYSByZXNwb25zZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VEaXIgPSBta2R0ZW1wU3luYyhgJHt0bXBkaXIoKX0vcmVhZC1zZGstc2ltcGxlYCk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2VEaXIpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGByZWFsLXNkay1zaW1wbGUtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2VEaXIpKTtcblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLTEnLCAnU2F5IGV4YWN0bHkgXCJoZWxsb1wiIGFuZCBub3RoaW5nIGVsc2UnLCAxKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRlID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpLCA5MF8wMDApO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUoY29tcGxldGUpLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlQWN0aW9uLnR1cm5JZCwgJ3R1cm4tMScpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VQYXJ0cyA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Jlc3BvbnNlUGFydCcpKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2VQYXJ0cy5sZW5ndGggPiAwLCAnc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYXQgbGVhc3Qgb25lIHJlc3BvbnNlIHBhcnQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGEgZmVuY2VkIG11bHRpbGluZSBtYXJrZG93biByZXNwb25zZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1tYXJrZG93bi1yZXNwb25zZS0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2VEaXIpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihcblx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0Y29uZmlnLFxuXHRcdFx0YG1hcmtkb3duLXJlc3BvbnNlLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnMsXG5cdFx0XHRVUkkuZmlsZSh3b3Jrc3BhY2VEaXIpLFxuXHRcdCk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSAnYGBgdGV4dFxcbkFMUEhBXFxuQkVUQVxcbmBgYCc7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHQndHVybi1tYXJrZG93bi1yZXNwb25zZScsXG5cdFx0XHRgUmVwbHkgd2l0aCBleGFjdGx5IHRoaXMgTWFya2Rvd24gY29kZSBibG9jayBhbmQgbm90aGluZyBlbHNlOlxcbiR7ZXhwZWN0ZWR9YCxcblx0XHRcdDEsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzcG9uc2VUZXh0LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RNb2RlbHMgcmV0dXJucyB3ZWxsLXNoYXBlZCBtb2RlbCBlbnRyaWVzIGFmdGVyIGF1dGhlbnRpY2F0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoNjBfMDAwKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sIGNsaWVudElkOiBgcmVhbC1zZGstbGlzdC1tb2RlbHMtJHtjb25maWcucHJvdmlkZXJ9YCB9LCAzMF8wMDApO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHRvIHJvb3Qgc3RhdGUgKmJlZm9yZSogYXV0aGVudGljYXRpbmcgc28gd2UgY2FuIG9ic2VydmVcblx0XHQvLyB0aGUgYWdlbnRzQ2hhbmdlZCBhY3Rpb24gdGhhdCBjYXJyaWVzIHRoZSBwb3B1bGF0ZWQgbW9kZWwgbGlzdC5cblx0XHRjb25zdCByb290UmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0sIDMwXzAwMCk7XG5cdFx0Y29uc3QgaW5pdGlhbCA9IHJvb3RSZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIFJvb3RTdGF0ZTtcblx0XHRjb25zdCBwcm92aWRlckFnZW50ID0gaW5pdGlhbC5hZ2VudHMuZmluZChhID0+IGEucHJvdmlkZXIgPT09IGNvbmZpZy5wcm92aWRlcik7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyQWdlbnQsIGBFeHBlY3RlZCAke2NvbmZpZy5wcm92aWRlcn0gYWdlbnQgaW4gcm9vdCBzdGF0ZSwgZ290OiAke2luaXRpYWwuYWdlbnRzLm1hcChhID0+IGEucHJvdmlkZXIpLmpvaW4oJywgJyl9YCk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdhdXRoZW50aWNhdGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCB0b2tlbjogcmVzb2x2ZUdpdEh1YlRva2VuKCkgfSwgMzBfMDAwKTtcblxuXHRcdC8vIE1vZGVscyBsb2FkIGFzeW5jaHJvbm91c2x5IGFmdGVyIHRoZSAqZmlyc3QqIGF1dGhlbnRpY2F0ZSBhZ2FpbnN0XG5cdFx0Ly8gdGhlIHNoYXJlZCBzZXJ2ZXIuIElmIGEgc2libGluZyB0ZXN0IGFscmVhZHkgYXV0aGVudGljYXRlZCwgdGhlXG5cdFx0Ly8gbGlzdCBpcyBpbiB0aGUgc3Vic2NyaWJlIHNuYXBzaG90IGFscmVhZHk7IG90aGVyd2lzZSB3YWl0IGZvciB0aGVcblx0XHQvLyBgYWdlbnRzQ2hhbmdlZGAgYWN0aW9uIHRoYXQgcG9wdWxhdGVzIHRoZW0uXG5cdFx0bGV0IGFnZW50ID0gcHJvdmlkZXJBZ2VudDtcblx0XHRpZiAoYWdlbnQubW9kZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgbm90aWYgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Jvb3QvYWdlbnRzQ2hhbmdlZCcpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBSb290QWdlbnRzQ2hhbmdlZEFjdGlvbjtcblx0XHRcdFx0XHRjb25zdCBhID0gYWN0aW9uLmFnZW50cy5maW5kKGEgPT4gYS5wcm92aWRlciA9PT0gY29uZmlnLnByb3ZpZGVyKTtcblx0XHRcdFx0XHRyZXR1cm4gISFhICYmIGEubW9kZWxzLmxlbmd0aCA+IDA7XG5cdFx0XHRcdH0sIDMwXzAwMCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmKS5hY3Rpb24gYXMgUm9vdEFnZW50c0NoYW5nZWRBY3Rpb247XG5cdFx0XHRcdGFnZW50ID0gYWN0aW9uLmFnZW50cy5maW5kKGEgPT4gYS5wcm92aWRlciA9PT0gY29uZmlnLnByb3ZpZGVyKSE7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Ly8gU3VyZmFjZSBldmVyeSBhZ2VudHNDaGFuZ2VkIHdlIGRpZCBzZWUgc28gZmFpbHVyZXMgcG9pbnRcblx0XHRcdFx0Ly8gYXQgdGhlIGFjdHVhbCBkYXRhIGluc3RlYWQgb2YgYSBiYXJlIHRpbWVvdXQuXG5cdFx0XHRcdGNvbnN0IHNlZW4gPSBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAncm9vdC9hZ2VudHNDaGFuZ2VkJykpXG5cdFx0XHRcdFx0Lm1hcChuID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGEgPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgUm9vdEFnZW50c0NoYW5nZWRBY3Rpb247XG5cdFx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IGEuYWdlbnRzLmZpbmQoeCA9PiB4LnByb3ZpZGVyID09PSBjb25maWcucHJvdmlkZXIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVudHJ5ID8geyBtb2RlbENvdW50OiBlbnRyeS5tb2RlbHMubGVuZ3RoLCBtb2RlbElkczogZW50cnkubW9kZWxzLm1hcChtID0+IG0uaWQpIH0gOiB7IG1pc3Npbmc6IHRydWUgfTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke2NvbmZpZy5wcm92aWRlcn06IHRpbWVkIG91dCB3YWl0aW5nIGZvciBhZ2VudHNDaGFuZ2VkIHdpdGggbm9uLWVtcHR5IG1vZGVscy4gT2JzZXJ2ZWQgYWdlbnRzQ2hhbmdlZDogJHtKU09OLnN0cmluZ2lmeShzZWVuKX0uIE9yaWdpbmFsIGVycm9yOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnQub2soYWdlbnQubW9kZWxzLmxlbmd0aCA+IDAsICdFeHBlY3RlZCBhdCBsZWFzdCBvbmUgbW9kZWwgZnJvbSBsaXN0TW9kZWxzJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRNb2RlbFByb3ZpZGVycyA9IGNvbmZpZy5tb2RlbFByb3ZpZGVycyA/PyBbY29uZmlnLnByb3ZpZGVyXTtcblxuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgYWdlbnQubW9kZWxzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIG1vZGVsLmlkLCAnc3RyaW5nJywgYG1vZGVsLmlkIHNob3VsZCBiZSBhIHN0cmluZzogJHtKU09OLnN0cmluZ2lmeShtb2RlbCl9YCk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuaWQubGVuZ3RoID4gMCwgYG1vZGVsLmlkIHNob3VsZCBiZSBub24tZW1wdHk6ICR7SlNPTi5zdHJpbmdpZnkobW9kZWwpfWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBtb2RlbC5uYW1lLCAnc3RyaW5nJywgYG1vZGVsLm5hbWUgc2hvdWxkIGJlIGEgc3RyaW5nOiAke0pTT04uc3RyaW5naWZ5KG1vZGVsKX1gKTtcblx0XHRcdGFzc2VydC5vayhleHBlY3RlZE1vZGVsUHJvdmlkZXJzLmluY2x1ZGVzKG1vZGVsLnByb3ZpZGVyKSwgYG1vZGVsLnByb3ZpZGVyIHNob3VsZCBiZSBvbmUgb2YgJHtleHBlY3RlZE1vZGVsUHJvdmlkZXJzLmpvaW4oJywgJyl9OiAke0pTT04uc3RyaW5naWZ5KG1vZGVsKX1gKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5tYXhDb250ZXh0V2luZG93ID09PSB1bmRlZmluZWQgfHwgKHR5cGVvZiBtb2RlbC5tYXhDb250ZXh0V2luZG93ID09PSAnbnVtYmVyJyAmJiBtb2RlbC5tYXhDb250ZXh0V2luZG93ID49IDApLFxuXHRcdFx0XHRgbW9kZWwubWF4Q29udGV4dFdpbmRvdyBzaG91bGQgYmUgdW5kZWZpbmVkIG9yIGEgbm9uLW5lZ2F0aXZlIG51bWJlcjogJHtKU09OLnN0cmluZ2lmeShtb2RlbCl9YCk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuc3VwcG9ydHNWaXNpb24gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgbW9kZWwuc3VwcG9ydHNWaXNpb24gPT09ICdib29sZWFuJyxcblx0XHRcdFx0YG1vZGVsLnN1cHBvcnRzVmlzaW9uIHNob3VsZCBiZSBib29sZWFuIG9yIHVuZGVmaW5lZDogJHtKU09OLnN0cmluZ2lmeShtb2RlbCl9YCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIGNvbnRleHQgYWNyb3NzIGNvbnNlY3V0aXZlIHR1cm5zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLWNvdmVyYWdlLW1lbW9yeS0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2UtbWVtb3J5LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbWVtb3J5LTEnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBPUkNISUQuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGFzc2VydC5tYXRjaChmaXJzdC5yZXNwb25zZVRleHQsIC9yZWFkeS9pKTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmJlZ2luQWhwU25hcHNob3RSb3VuZCgpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbWVtb3J5LTInLCAnV2hhdCBjb2RlIHdvcmQgZGlkIEkgYXNrIHlvdSB0byByZW1lbWJlcj8gUmVwbHkgd2l0aCBvbmx5IHRoZSBjb2RlIHdvcmQuJywgMTApO1xuXHRcdGFzc2VydC5tYXRjaChzZWNvbmQucmVzcG9uc2VUZXh0LCAvT1JDSElEL2kpO1xuXHRcdGF3YWl0IGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGhpcy50ZXN0ISwgY29udGV4dC5jbGllbnQsIGJlaGF2aW9yU25hcHNob3QpO1xuXHR9KTtcblxuXHQobW9kZWxTd2l0Y2hUYXJnZXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnY2xpZW50LXNlbGVjdGVkIG1vZGVsIGlzIHVzZWQgZm9yIHRoZSB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRhc3NlcnQub2sobW9kZWxTd2l0Y2hUYXJnZXQpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtbW9kZWwtc3dpdGNoLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBtb2RlbC1zd2l0Y2gtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVybldpdGhNb2RlbFRvQ29tcGxldGlvbihcblx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdCd0dXJuLW1vZGVsLXN3aXRjaCcsXG5cdFx0XHQnUmVwbHkgZXhhY3RseSBcIm1vZGVsIHNlbGVjdGVkXCIuJyxcblx0XHRcdG1vZGVsU3dpdGNoVGFyZ2V0LFxuXHRcdFx0MSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbDogb2JzZXJ2ZWRNb2RlbFJlcXVlc3QoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkpLm1vZGVsLFxuXHRcdFx0cmVzcG9uc2U6IHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLFxuXHRcdH0sIHtcblx0XHRcdG1vZGVsOiBtb2RlbFN3aXRjaFRhcmdldCxcblx0XHRcdHJlc3BvbnNlOiAnbW9kZWwgc2VsZWN0ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaW50ZXJhY3RpdmVJbnB1dFByb21wdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdwcm92aWRlciBpbnB1dCByZXF1ZXN0IGlzIGFuc3dlcmVkIHRocm91Z2ggQUhQJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRhc3NlcnQub2soaW50ZXJhY3RpdmVJbnB1dFByb21wdCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1pbnB1dC1yZXF1ZXN0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBpbnB1dC1yZXF1ZXN0LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHQndHVybi1pbnB1dC1yZXF1ZXN0Jyxcblx0XHRcdGludGVyYWN0aXZlSW5wdXRQcm9tcHQsXG5cdFx0XHQxLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhd0lucHV0UmVxdWVzdDogcmVzdWx0LnNhd0lucHV0UmVxdWVzdCxcblx0XHRcdGZvcndhcmRlZEFuc3dlcjogb2JzZXJ2ZWRUb29sUmVzdWx0VGV4dHMoKS5zb21lKHRleHQgPT4gdGV4dC5pbmNsdWRlcygnQXBwbGUnKSksXG5cdFx0fSwge1xuXHRcdFx0c2F3SW5wdXRSZXF1ZXN0OiB0cnVlLFxuXHRcdFx0Zm9yd2FyZGVkQW5zd2VyOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQobW9kZWxTd2l0Y2hUYXJnZXQgJiYgbW9kZWxTd2l0Y2hSZXR1cm5UYXJnZXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnbW9kZWwgY2hhbmdlcyBiZXR3ZWVuIHR1cm5zIHJldGFpbiBwcm92aWRlciBjb250ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRhc3NlcnQub2sobW9kZWxTd2l0Y2hUYXJnZXQpO1xuXHRcdGFzc2VydC5vayhtb2RlbFN3aXRjaFJldHVyblRhcmdldCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1tb2RlbC1jaGFuZ2UtY29udGV4dC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgbW9kZWwtY2hhbmdlLWNvbnRleHQtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgZHJpdmVUdXJuV2l0aE1vZGVsVG9Db21wbGV0aW9uKFxuXHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0J3R1cm4tbW9kZWwtY2hhbmdlLWZpcnN0Jyxcblx0XHRcdCdSZW1lbWJlciB0aGUgZXhhY3QgY29kZSB3b3JkIE1BUklHT0xELiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLFxuXHRcdFx0bW9kZWxTd2l0Y2hUYXJnZXQsXG5cdFx0XHQxLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgZHJpdmVUdXJuV2l0aE1vZGVsVG9Db21wbGV0aW9uKFxuXHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0J3R1cm4tbW9kZWwtY2hhbmdlLXNlY29uZCcsXG5cdFx0XHQnUmVwbHkgd2l0aCBvbmx5IHRoZSBleGFjdCBjb2RlIHdvcmQgSSBhc2tlZCB5b3UgdG8gcmVtZW1iZXIuJyxcblx0XHRcdG1vZGVsU3dpdGNoUmV0dXJuVGFyZ2V0LFxuXHRcdFx0MTAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZWxzOiBjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLnNsaWNlKC0yKS5tYXAoYm9keSA9PiBvYnNlcnZlZE1vZGVsUmVxdWVzdChib2R5KS5tb2RlbCksXG5cdFx0XHRmaXJzdDogZmlyc3QucmVzcG9uc2VUZXh0LnRyaW0oKSxcblx0XHRcdHNlY29uZFJlbWVtYmVyc0NvZGVXb3JkOiAvTUFSSUdPTEQvaS50ZXN0KHNlY29uZC5yZXNwb25zZVRleHQpLFxuXHRcdH0sIHtcblx0XHRcdG1vZGVsczogW21vZGVsU3dpdGNoVGFyZ2V0LCBtb2RlbFN3aXRjaFJldHVyblRhcmdldF0sXG5cdFx0XHRmaXJzdDogJ3JlYWR5Jyxcblx0XHRcdHNlY29uZFJlbWVtYmVyc0NvZGVXb3JkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoY2FuY2VsbGVkSW5wdXRQcm9tcHQgPyB0ZXN0IDogdGVzdC5za2lwKSgncHJvdmlkZXIgaW5wdXQgcmVxdWVzdCBjYW5jZWxsYXRpb24gcmV0dXJucyB0byB0aGUgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0YXNzZXJ0Lm9rKGNhbmNlbGxlZElucHV0UHJvbXB0KTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLWlucHV0LWNhbmNlbC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgaW5wdXQtY2FuY2VsLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5XaXRoQ2FuY2VsbGVkSW5wdXRUb0NvbXBsZXRpb24oXG5cdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHQndHVybi1pbnB1dC1jYW5jZWwnLFxuXHRcdFx0Y2FuY2VsbGVkSW5wdXRQcm9tcHQsXG5cdFx0XHQxLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhd0lucHV0UmVxdWVzdDogcmVzdWx0LnNhd0lucHV0UmVxdWVzdCxcblx0XHRcdHJlc3BvbnNlRW5kc1dpdGhDYW5jZWxsZWQ6IHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLmVuZHNXaXRoKCdjYW5jZWxsZWQnKSxcblx0XHR9LCB7XG5cdFx0XHRzYXdJbnB1dFJlcXVlc3Q6IHRydWUsXG5cdFx0XHRyZXNwb25zZUVuZHNXaXRoQ2FuY2VsbGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaW50ZXJhY3RpdmVJbnB1dFByb21wdCAmJiBjb25maWcuc3VwcG9ydHNQYXVzZWRUdXJuQ2FuY2VsbGF0aW9uRTJFID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NhbmNlbGxpbmcgYSB0dXJuIHBhdXNlZCBmb3IgaW5wdXQgYWxsb3dzIGEgcmVwbGFjZW1lbnQgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0YXNzZXJ0Lm9rKGludGVyYWN0aXZlSW5wdXRQcm9tcHQpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY2FuY2VsLWlucHV0LXR1cm4tJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGNhbmNlbC1pbnB1dC10dXJuLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY2FuY2VsLWlucHV0Jztcblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgaW50ZXJhY3RpdmVJbnB1dFByb21wdCwgMSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpLFxuXHRcdFx0OTBfMDAwLFxuXHRcdCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogMixcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQsIGR1cmF0aW9uOiAwIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ2FuY2VsbGVkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmksXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0XHRjb25zdCByZXBsYWNlbWVudCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdCd0dXJuLWFmdGVyLWlucHV0LWNhbmNlbCcsXG5cdFx0XHQnUmVwbHkgZXhhY3RseSBcInJlcGxhY2VtZW50XCIuJyxcblx0XHRcdDMsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBsYWNlbWVudC5yZXNwb25zZVRleHQudHJpbSgpLCAncmVwbGFjZW1lbnQnKTtcblx0fSk7XG5cblx0KHRleHRJbnB1dFByb21wdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdwcm92aWRlciBmcmVlZm9ybSBpbnB1dCBpcyBhbnN3ZXJlZCB0aHJvdWdoIEFIUCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0YXNzZXJ0Lm9rKHRleHRJbnB1dFByb21wdCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1pbnB1dC10ZXh0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBpbnB1dC10ZXh0LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWlucHV0LXRleHQnLCB0ZXh0SW5wdXRQcm9tcHQsIDEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYXdJbnB1dFJlcXVlc3Q6IHJlc3VsdC5zYXdJbnB1dFJlcXVlc3QsXG5cdFx0XHRmb3J3YXJkZWRBbnN3ZXI6IG9ic2VydmVkVG9vbFJlc3VsdFRleHRzKCkuc29tZSh0ZXh0ID0+IHRleHQuaW5jbHVkZXMoJ2ludGVyYWN0aXZlJykpLFxuXHRcdH0sIHtcblx0XHRcdHNhd0lucHV0UmVxdWVzdDogdHJ1ZSxcblx0XHRcdGZvcndhcmRlZEFuc3dlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0KG11bHRpU2VsZWN0SW5wdXRQcm9tcHQgPyB0ZXN0IDogdGVzdC5za2lwKSgncHJvdmlkZXIgbXVsdGktc2VsZWN0IGlucHV0IGlzIGFuc3dlcmVkIHRocm91Z2ggQUhQJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRhc3NlcnQub2sobXVsdGlTZWxlY3RJbnB1dFByb21wdCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1pbnB1dC1tdWx0aS1zZWxlY3QtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGlucHV0LW11bHRpLXNlbGVjdC0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1pbnB1dC1tdWx0aS1zZWxlY3QnLCBtdWx0aVNlbGVjdElucHV0UHJvbXB0LCAxKTtcblx0XHRjb25zdCBmb3J3YXJkZWRTZWxlY3Rpb25zID0gb2JzZXJ2ZWRUb29sUmVzdWx0VGV4dHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2F3SW5wdXRSZXF1ZXN0OiByZXN1bHQuc2F3SW5wdXRSZXF1ZXN0LFxuXHRcdFx0Zm9yd2FyZGVkU2VsZWN0aW9uc0NvbnRhaW5SZWQ6IGZvcndhcmRlZFNlbGVjdGlvbnMubGVuZ3RoID4gMCAmJiBmb3J3YXJkZWRTZWxlY3Rpb25zLmV2ZXJ5KHRleHQgPT4gdGV4dC5pbmNsdWRlcygnUmVkJykpLFxuXHRcdH0sIHtcblx0XHRcdHNhd0lucHV0UmVxdWVzdDogdHJ1ZSxcblx0XHRcdGZvcndhcmRlZFNlbGVjdGlvbnNDb250YWluUmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoY29uZmlnLnN1cHBvcnRzV29ya3NwYWNlbGVzc0UyRSA/IHRlc3QgOiB0ZXN0LnNraXApKCd3b3Jrc3BhY2VsZXNzIHNlc3Npb24gbWF0ZXJpYWxpemVzIGFuZCBjb21wbGV0ZXMgYSB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbldpdGhXb3JraW5nRGlyZWN0b3JpZXMoJ3dvcmtzcGFjZWxlc3MnLCBbXSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXdvcmtzcGFjZWxlc3MnLCAnUmVwbHkgZXhhY3RseSBcIndvcmtzcGFjZWxlc3NcIi4nLCAxKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3BvbnNlOiByZXN1bHQucmVzcG9uc2VUZXh0LnRyaW0oKSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnlDb3VudDogKHNlc3Npb24uc25hcHNob3QhLnN0YXRlIGFzIFNlc3Npb25TdGF0ZSkud29ya2luZ0RpcmVjdG9yaWVzPy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0cmVzcG9uc2U6ICd3b3Jrc3BhY2VsZXNzJyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnlDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0KGNvbmZpZy5zdXBwb3J0c1J1bnRpbWVTbGFzaENvbW1hbmRzRTJFID8gdGVzdCA6IHRlc3Quc2tpcCkoJ21hdGVyaWFsaXplZCBwcm92aWRlciBleHBvc2VzIHJ1bnRpbWUgc2xhc2ggY29tbWFuZCBjb21wbGV0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1ydW50aW1lLXNsYXNoLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBydW50aW1lLXNsYXNoLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1ydW50aW1lLXNsYXNoJywgJ1JlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPENvbXBsZXRpb25zUmVzdWx0PignY29tcGxldGlvbnMnLCB7XG5cdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLFxuXHRcdFx0dGV4dDogJy8nLFxuXHRcdFx0b2Zmc2V0OiAxLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb25zLml0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmluc2VydFRleHQuc3RhcnRzV2l0aCgnLycpKSk7XG5cdH0pO1xuXG5cdGlmIChjb25maWcuc3VwcG9ydHNBdHRhY2htZW50c0UyRSkge1xuXHRcdHRlc3QoJ2RlZmF1bHQgY2hhdCBzaW1wbGUgYXR0YWNobWVudCByZWFjaGVzIHRoZSBwcm92aWRlciByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1zaW1wbGUtYXR0YWNobWVudC0nKSk7XG5cdFx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYHNpbXBsZS1hdHRhY2htZW50LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdGxhYmVsOiAnZmFjdHMudHh0Jyxcblx0XHRcdFx0bW9kZWxSZXByZXNlbnRhdGlvbjogJ0FUVEFDSE1FTlRfU0lNUExFX1ZBTFVFJyxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5XaXRoQXR0YWNobWVudHNUb0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHQndHVybi1zaW1wbGUtYXR0YWNobWVudCcsXG5cdFx0XHRcdCdSZXBseSB3aXRoIG9ubHkgdGhlIHZhbHVlIGZyb20gdGhlIGF0dGFjaG1lbnQuJyxcblx0XHRcdFx0YXR0YWNobWVudHMsXG5cdFx0XHRcdDEsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnQVRUQUNITUVOVF9TSU1QTEVfVkFMVUUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IGNoYXQgcmVzb3VyY2UgYXR0YWNobWVudCByZWFjaGVzIHRoZSBwcm92aWRlciByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1yZXNvdXJjZS1hdHRhY2htZW50LScpKTtcblx0XHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdGNvbnN0IGZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ3Jlc291cmNlLnR4dCcpO1xuXHRcdFx0d3JpdGVGaWxlU3luYyhmaWxlLCAnQVRUQUNITUVOVF9SRVNPVVJDRV9WQUxVRScpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGByZXNvdXJjZS1hdHRhY2htZW50LSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6ICdyZXNvdXJjZS50eHQnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKGZpbGUpLnRvU3RyaW5nKCksXG5cdFx0XHR9XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuV2l0aEF0dGFjaG1lbnRzVG9Db21wbGV0aW9uKFxuXHRcdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdFx0J3R1cm4tcmVzb3VyY2UtYXR0YWNobWVudCcsXG5cdFx0XHRcdCdSZWFkIHRoZSBhdHRhY2hlZCByZXNvdXJjZSBhbmQgcmVwbHkgd2l0aCBvbmx5IGl0cyBleGFjdCBjb250ZW50cy4nLFxuXHRcdFx0XHRhdHRhY2htZW50cyxcblx0XHRcdFx0MSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdBVFRBQ0hNRU5UX1JFU09VUkNFX1ZBTFVFJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVmYXVsdCBjaGF0IGVtYmVkZGVkIHRleHQgYXR0YWNobWVudCByZWFjaGVzIHRoZSBwcm92aWRlciByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1lbWJlZGRlZC1hdHRhY2htZW50LScpKTtcblx0XHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgZW1iZWRkZWQtYXR0YWNobWVudC0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6ICdlbWJlZGRlZC50eHQnLFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuXHRcdFx0XHRkYXRhOiBCdWZmZXIuZnJvbSgnQVRUQUNITUVOVF9FTUJFRERFRF9WQUxVRScpLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5XaXRoQXR0YWNobWVudHNUb0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHQndHVybi1lbWJlZGRlZC1hdHRhY2htZW50Jyxcblx0XHRcdFx0J1JlYWQgdGhlIGVtYmVkZGVkIGF0dGFjaG1lbnQgYW5kIHJlcGx5IHdpdGggb25seSBpdHMgZXhhY3QgY29udGVudHMuJyxcblx0XHRcdFx0YXR0YWNobWVudHMsXG5cdFx0XHRcdDEsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnQVRUQUNITUVOVF9FTUJFRERFRF9WQUxVRScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NoYXQgYXR0YWNobWVudCBwaW5zIHRoZSBsYXRlc3QgY29tcGxldGVkIHNvdXJjZSB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDI0MF8wMDApO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jaGF0LWF0dGFjaG1lbnQtbGF0ZXN0LScpKTtcblx0XHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjaGF0LWF0dGFjaG1lbnQtc291cmNlLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdCd0dXJuLWNoYXQtYXR0YWNobWVudC1zb3VyY2UnLFxuXHRcdFx0XHQnUmVtZW1iZXIgQ0hBVF9BVFRBQ0hNRU5UX0xBVEVTVC4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJyxcblx0XHRcdFx0MSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCBjcmVhdGVBZGRpdGlvbmFsU2Vzc2lvbihVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzOiBNZXNzYWdlQXR0YWNobWVudFtdID0gW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdGxhYmVsOiAnU291cmNlIGNvbnZlcnNhdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZSksXG5cdFx0XHR9XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuV2l0aEF0dGFjaG1lbnRzVG9Db21wbGV0aW9uKFxuXHRcdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHQndHVybi1jaGF0LWF0dGFjaG1lbnQtdGFyZ2V0Jyxcblx0XHRcdFx0J1JlcGx5IHdpdGggb25seSB0aGUgY29kZSB3b3JkIGZyb20gdGhlIGF0dGFjaGVkIGNvbnZlcnNhdGlvbi4nLFxuXHRcdFx0XHRhdHRhY2htZW50cyxcblx0XHRcdFx0MTAsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnQ0hBVF9BVFRBQ0hNRU5UX0xBVEVTVCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NoYXQgYXR0YWNobWVudCBlbmQgdHVybiBleGNsdWRlcyBsYXRlciBzb3VyY2UgdHVybnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMjQwXzAwMCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLWNoYXQtYXR0YWNobWVudC1ib3VuZGVkLScpKTtcblx0XHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjaGF0LWF0dGFjaG1lbnQtYm91bmRlZC1zb3VyY2UtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0J3R1cm4tY2hhdC1hdHRhY2htZW50LWFscGhhJyxcblx0XHRcdFx0J1JlbWVtYmVyIENIQVRfQVRUQUNITUVOVF9BTFBIQS4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJyxcblx0XHRcdFx0MSxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdCd0dXJuLWNoYXQtYXR0YWNobWVudC1iZXRhJyxcblx0XHRcdFx0J05vdyByZW1lbWJlciBDSEFUX0FUVEFDSE1FTlRfQkVUQSB0b28uIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsXG5cdFx0XHRcdDEwLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IGNyZWF0ZUFkZGl0aW9uYWxTZXNzaW9uKFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCxcblx0XHRcdFx0bGFiZWw6ICdCb3VuZGVkIHNvdXJjZSBjb252ZXJzYXRpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogYnVpbGREZWZhdWx0Q2hhdFVyaShzb3VyY2UpLFxuXHRcdFx0XHRlbmRUdXJuOiAndHVybi1jaGF0LWF0dGFjaG1lbnQtYWxwaGEnLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVybldpdGhBdHRhY2htZW50c1RvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0J3R1cm4tY2hhdC1hdHRhY2htZW50LWJvdW5kZWQtdGFyZ2V0Jyxcblx0XHRcdFx0J1JlcGx5IGV4YWN0bHkgXCJhbHBoYSBvbmx5XCIgaWYgdGhlIGF0dGFjaG1lbnQgY29udGFpbnMgQ0hBVF9BVFRBQ0hNRU5UX0FMUEhBIGJ1dCBub3QgQ0hBVF9BVFRBQ0hNRU5UX0JFVEEuJyxcblx0XHRcdFx0YXR0YWNobWVudHMsXG5cdFx0XHRcdDIwLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLCAnYWxwaGEgb25seScpO1xuXHRcdH0pO1xuXHR9XG5cblx0aWYgKGNvbmZpZy5zdXBwb3J0c1RydW5jYXRlRTJFKSB7XG5cdFx0dGVzdCgndHJ1bmNhdGluZyBhIG1hdGVyaWFsaXplZCBjaGF0IHJlbW92ZXMgbGF0ZXIgY29udGV4dCBhbmQgYWxsb3dzIGNvbnRpbnVhdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgyNDBfMDAwKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtdHJ1bmNhdGUtJykpO1xuXHRcdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGB0cnVuY2F0ZS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi10cnVuY2F0ZS1maXJzdCcsICdSZW1lbWJlciBBTFBIQS4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMSk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXRydW5jYXRlLXNlY29uZCcsICdOb3cgcmVtZW1iZXIgQkVUQSB0b28uIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEwKTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDIwLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLCB0dXJuSWQ6ICd0dXJuLXRydW5jYXRlLWZpcnN0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHJ1bmNhdGVkJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaSxcblx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKFxuXHRcdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdFx0J3R1cm4tdHJ1bmNhdGUtZm9sbG93dXAnLFxuXHRcdFx0XHQnUmVwbHkgd2l0aCBleGFjdGx5IFwiQUxQSEEgb25seVwiLicsXG5cdFx0XHRcdDMwLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXNwb25zZTogcmVzdWx0LnJlc3BvbnNlVGV4dC50cmltKCksXG5cdFx0XHRcdG1lc3NhZ2VzOiAoc3RhdGUuc25hcHNob3QhLnN0YXRlIGFzIHsgcmVhZG9ubHkgdHVybnM6IHJlYWRvbmx5IHsgcmVhZG9ubHkgbWVzc2FnZTogeyByZWFkb25seSB0ZXh0OiBzdHJpbmcgfSB9W10gfSkudHVybnMubWFwKHR1cm4gPT4gdHVybi5tZXNzYWdlLnRleHQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNwb25zZTogJ0FMUEhBIG9ubHknLFxuXHRcdFx0XHRtZXNzYWdlczogW1xuXHRcdFx0XHRcdCdSZW1lbWJlciBBTFBIQS4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJyxcblx0XHRcdFx0XHQnUmVwbHkgd2l0aCBleGFjdGx5IFwiQUxQSEEgb25seVwiLicsXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3ZpZGVySG9zdE9ubHlUZXN0KGNvbnRleHQsICdwcm92aWRlciBzZXNzaW9uIGNvbmZpZyBzY2hlbWEgaXMgZXhwb3NlZCB0aHJvdWdoIEFIUCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRjbGllbnRJZDogYGNvbmZpZy1zY2hlbWEtJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHR9LCAzMF8wMDApO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oJ3Jlc29sdmVTZXNzaW9uQ29uZmlnJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbXSxcblx0XHR9LCAzMF8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzY2hlbWFUeXBlOiByZXNvbHZlZC5zY2hlbWEudHlwZSxcblx0XHRcdGhhc1Byb3BlcnRpZXM6IE9iamVjdC5rZXlzKHJlc29sdmVkLnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KS5sZW5ndGggPiAwLFxuXHRcdFx0dmFsdWVzVHlwZTogdHlwZW9mIHJlc29sdmVkLnZhbHVlcyxcblx0XHR9LCB7XG5cdFx0XHRzY2hlbWFUeXBlOiAnb2JqZWN0Jyxcblx0XHRcdGhhc1Byb3BlcnRpZXM6IHRydWUsXG5cdFx0XHR2YWx1ZXNUeXBlOiAnb2JqZWN0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0cHJvdmlkZXJIb3N0T25seVRlc3QoY29udGV4dCwgJ3Byb3ZpZGVyIHNlc3Npb24gY29uZmlnIGNvbXBsZXRpb25zIGFyZSBkZXRlcm1pbmlzdGljJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiBgY29uZmlnLWNvbXBsZXRpb25zLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdD4oJ3Nlc3Npb25Db25maWdDb21wbGV0aW9ucycsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdHByb3BlcnR5OiAnbW9kZScsXG5cdFx0XHRxdWVyeTogJycsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtdLFxuXHRcdH0sIDMwXzAwMCk7XG5cblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShyZXN1bHQuaXRlbXMpKTtcblx0fSk7XG5cblx0cHJvdmlkZXJIb3N0T25seVRlc3QoY29udGV4dCwgJ3N0YWxlIG1vZGVsIHNlbGVjdGlvbiBmYWlscyB0aGUgdHVybiB3aXRob3V0IGNvbnRhY3RpbmcgYSBtb2RlbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLXN0YWxlLW1vZGVsLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBzdGFsZS1tb2RlbC0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLXN0YWxlLW1vZGVsJztcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnVGhpcyB0dXJuIG11c3QgZmFpbCBiZWZvcmUgY29udGFjdGluZyBhIG1vZGVsLicsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRtb2RlbDogeyBpZDogJ2UyZS1tb2RlbC10aGF0LWRvZXMtbm90LWV4aXN0JyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZhaWxlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUoZmFpbGVkKS5hY3Rpb24gYXMgeyByZWFkb25seSBlcnJvcjogeyByZWFkb25seSBlcnJvclR5cGU6IHN0cmluZzsgcmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nIH0gfTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3JUeXBlOiBhY3Rpb24uZXJyb3IuZXJyb3JUeXBlLFxuXHRcdFx0bWVudGlvbnNNb2RlbDogL21vZGVsL2kudGVzdChhY3Rpb24uZXJyb3IubWVzc2FnZSksXG5cdFx0fSwge1xuXHRcdFx0ZXJyb3JUeXBlOiBjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJyA/ICdzZW5kRmFpbGVkJyA6IGNvbmZpZy5wcm92aWRlciA9PT0gJ2NsYXVkZScgPyAnc3VjY2VzcycgOiAnbW9kZWxTZWxlY3Rpb25GYWlsZWQnLFxuXHRcdFx0bWVudGlvbnNNb2RlbDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWEscUJBQXFCO0FBQzNDLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQXlJO0FBQ2xKLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsa0JBQWdEO0FBQ3pELFNBQVMscUJBQXFCLHVCQUF1QixhQUFhLHNCQUFpRTtBQUNuSTtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxpQ0FBaUU7QUFDMUUsU0FBUyxtQkFBbUIsNEJBQTRCO0FBQ3hELFNBQVMsNEJBQTJEO0FBRTdELFNBQVMsZ0JBQWdCLFNBQXlDO0FBQ3hFLFFBQU0sRUFBRSxRQUFRLGlCQUFpQixTQUFTLElBQUk7QUFDOUMsUUFBTSxtQkFBbUIsRUFBRSxTQUFTLFdBQVc7QUFDL0MsUUFBTSxvQkFBb0IsT0FBTztBQUNqQyxRQUFNLDBCQUEwQixPQUFPO0FBQ3ZDLFFBQU0seUJBQXlCLE9BQU87QUFDdEMsUUFBTSx1QkFBdUIsT0FBTztBQUNwQyxRQUFNLGtCQUFrQixPQUFPO0FBQy9CLFFBQU0seUJBQXlCLE9BQU87QUFFdEMsV0FBUyxxQkFBcUIsTUFBcUQ7QUFDbEYsV0FBTyxHQUFHLE1BQU0sb0NBQW9DO0FBQ3BELFVBQU0sVUFBVSwwQkFBMEIsSUFBSTtBQUM5QyxXQUFPLEdBQUcsU0FBUyx3Q0FBd0MsSUFBSSxFQUFFO0FBQ2pFLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxpQkFBaUIsT0FBd0I7QUFDakQsUUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixhQUFPO0FBQUEs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
