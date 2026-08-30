import assert from "assert";
import { execSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { SessionConfigKey } from "../../../../common/sessionConfigKeys.js";
import { buildDefaultChatUri, getInlineToolInput, ROOT_STATE_URI, ToolCallCancellationReason, ToolResultContentType } from "../../../../common/state/sessionState.js";
import { ContentEncoding } from "../../../../common/state/protocol/common/commands.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { assertToolCallCompleteText, createRealSession, dispatchTurn, driveTurnToCompletion, getMarkdownResponseText, initTestGitRepo } from "../harness/agentHostE2ETestHarness.js";
import { assertRecordedAhpSnapshot } from "../harness/ahpSnapshot.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
function stringOrMarkdownText(value) {
  return typeof value === "string" ? value : value?.markdown;
}
const PREFER_FILE_TOOLS = " Use your file tools; do not run a shell command.";
function fileReadToolNames(provider) {
  switch (provider) {
    case "claude":
      return ["Read"];
    case "copilotcli":
      return ["view"];
    default:
      return ["Read", "view", "shell"];
  }
}
function fileOperationPrompt(context, fileToolsPrompt, shellCommand, shellFollowup, strategy = context.config.fileOperationStrategy) {
  if (strategy === "fileTools") {
    return fileToolsPrompt;
  }
  return `Run exactly this shell command, with no modifications: \`${shellCommand}\`. ${shellFollowup}`;
}
function fileOperationTest(context, title, run, providerEnabled = true) {
  const enabled = providerEnabled && (context.config.fileOperationStrategy === "fileTools" || context.portableShellToolReplayEnabled);
  (enabled ? test : test.skip)(title, run);
}
function defineFileOperationsTests(context) {
  const { config, createdSessions, tempDirs, portableShellToolReplayEnabled, isWindows } = context;
  const shellResultTextAvailable = !config.shellToolResultTextUnreliable;
  const shellOutputOracleAvailable = shellResultTextAvailable && !(isWindows && config.provider === "copilotcli");
  const BEHAVIOR_SNAPSHOT = {
    profile: "behavior",
    // Codex occasionally omits command completion; direct filesystem and response assertions are the success oracle.
    omitToolCallSuccessForToolNames: config.provider === "codex" ? ["shell"] : []
  };
  if (config.streamingFileCreateToolName && config.provider !== "codex") {
    const fileToolDenialEnabled = !(context.isLinux && config.fileToolDenialReplayUnstableOnLinux);
    (fileToolDenialEnabled ? test : test.skip)("declining a file creation tool prevents the mutation and completes the turn", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-decline-create-"));
      tempDirs.push(workspace);
      const sessionUri = await createRealSession(context.client, config, `decline-create-${config.provider}`, createdSessions, URI.file(workspace));
      const chatUri = buildDefaultChatUri(sessionUri);
      const turnId = "turn-decline-create";
      dispatchTurn(
        context.client,
        sessionUri,
        turnId,
        'Create denied.txt containing exactly DENIED_CONTENT using your file creation tool. If permission is denied, reply exactly "denied".',
        1
      );
      const started = await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/toolCallStart") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId && getActionEnvelope(n).action.toolName === config.streamingFileCreateToolName,
        9e4
      );
      const toolCallId = getActionEnvelope(started).action.toolCallId;
      const readyNotification = await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/toolCallReady") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId && getActionEnvelope(n).action.toolCallId === toolCallId,
        9e4
      );
      const ready = getActionEnvelope(readyNotification).action;
      context.client.dispatch({
        channel: chatUri,
        clientSeq: 2,
        action: {
          type: ActionType.ChatToolCallConfirmed,
          turnId,
          toolCallId: ready.toolCallId,
          approved: false,
          reason: ToolCallCancellationReason.Denied
        }
      });
      let lastReadyServerSeq = getActionEnvelope(readyNotification).serverSeq;
      let clientSeq = 3;
      while (true) {
        const notification = await context.client.waitForNotification((n) => {
          if (getActionEnvelope(n).channel !== chatUri) {
            return false;
          }
          if (isActionNotification(n, "chat/turnComplete")) {
            return getActionEnvelope(n).action.turnId === turnId;
          }
          if (!isActionNotification(n, "chat/toolCallReady")) {
            return false;
          }
          const action = getActionEnvelope(n).action;
          return action.turnId === turnId && getActionEnvelope(n).serverSeq > lastReadyServerSeq;
        }, 9e4);
        if (isActionNotification(notification, "chat/turnComplete")) {
          break;
        }
        const repeatedReady = getActionEnvelope(notification).action;
        lastReadyServerSeq = getActionEnvelope(notification).serverSeq;
        context.client.dispatch({
          channel: chatUri,
          clientSeq: clientSeq++,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: repeatedReady.toolCallId,
            approved: false,
            reason: ToolCallCancellationReason.Denied
          }
        });
      }
      const malformedPermissionErrors = context.client.receivedNotifications(
        (n) => isActionNotification(n, "chat/toolCallComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.toolCallId === toolCallId
      ).map((n) => getActionEnvelope(n).action.result.error?.message).filter((message) => typeof message === "string" && message.includes("permission host returned malformed payload"));
      assert.deepStrictEqual({
        fileCreated: existsSync(join(workspace, "denied.txt")),
        responseEndsWithDenied: getMarkdownResponseText(context.client).trim().endsWith("denied"),
        malformedPermissionErrors
      }, {
        fileCreated: false,
        responseEndsWithDenied: true,
        malformedPermissionErrors: []
      });
    });
    (config.supportsPausedTurnCancellationE2E ? test : test.skip)("cancelling a turn paused for file-tool approval allows a replacement turn", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-cancel-file-approval-"));
      tempDirs.push(workspace);
      const sessionUri = await createRealSession(context.client, config, `cancel-file-approval-${config.provider}`, createdSessions, URI.file(workspace));
      const chatUri = buildDefaultChatUri(sessionUri);
      const turnId = "turn-cancel-file-approval";
      dispatchTurn(
        context.client,
        sessionUri,
        turnId,
        'Create cancelled.txt containing exactly CANCELLED_CONTENT using your file creation tool, then reply exactly "created".',
        1
      );
      const started = await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/toolCallStart") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId && getActionEnvelope(n).action.toolName === config.streamingFileCreateToolName,
        9e4
      );
      const toolCallId = getActionEnvelope(started).action.toolCallId;
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/toolCallReady") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId && getActionEnvelope(n).action.toolCallId === toolCallId,
        9e4
      );
      context.client.dispatch({
        channel: chatUri,
        clientSeq: 2,
        action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 }
      });
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/turnCancelled") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
        3e4
      );
      const replacement = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-after-file-approval-cancel",
        'Reply exactly "replacement".',
        3
      );
      assert.deepStrictEqual({
        fileExists: existsSync(join(workspace, "cancelled.txt")),
        replacement: replacement.responseText.trim()
      }, {
        fileExists: false,
        replacement: "replacement"
      });
    });
  }
  if (config.provider === "copilotcli") {
    test("auto-approve mode executes a file creation without prompting", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-auto-approve-create-"));
      tempDirs.push(workspace);
      const sessionUri = await createRealSession(context.client, config, "auto-approve-create", createdSessions, URI.file(workspace));
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: 1,
        action: {
          type: ActionType.SessionConfigChanged,
          config: { [SessionConfigKey.AutoApprove]: "autoApprove" }
        }
      });
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/configChanged") && getActionEnvelope(n).channel === sessionUri,
        3e4
      );
      const result = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-auto-approve-create",
        'Create approved.txt containing exactly APPROVED_CONTENT using your file creation tool, then reply exactly "created".',
        2
      );
      assert.deepStrictEqual({
        file: readFileSync(join(workspace, "approved.txt"), "utf8"),
        sawPendingConfirmation: result.sawPendingConfirmation,
        responseEndsWithCreated: result.responseText.trim().endsWith("created")
      }, {
        file: "APPROVED_CONTENT",
        sawPendingConfirmation: false,
        responseEndsWithCreated: true
      });
    });
  }
  fileOperationTest(context, "reads an existing text file", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-read-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "note.txt"), "ALPHA BETA GAMMA");
    const sessionUri = await createRealSession(context.client, config, `coverage-read-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      `Read note.txt and reply with its exact contents only.${config.provider === "copilotcli" ? PREFER_FILE_TOOLS : ""}`,
      `node -e "process.stdout.write(require('fs').readFileSync('note.txt','utf8'))"`,
      "Then reply with its exact output only."
    );
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-read", prompt, 1);
    assert.match(result.responseText, /ALPHA BETA GAMMA/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-read",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/ALPHA BETA GAMMA/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  }, shellResultTextAvailable);
  fileOperationTest(context, "reads a file from a nested directory", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-nested-read-"));
    tempDirs.push(workspace);
    mkdirSync(join(workspace, "nested"));
    writeFileSync(join(workspace, "nested", "value.txt"), "NESTED_VALUE_42");
    const sessionUri = await createRealSession(context.client, config, `coverage-nested-read-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      `Read nested/value.txt and reply with its exact contents only.${PREFER_FILE_TOOLS}`,
      `node -e "process.stdout.write(require('fs').readFileSync('nested/value.txt','utf8'))"`,
      "Then reply with its exact output only."
    );
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-nested-read", prompt, 1);
    assert.match(result.responseText, /NESTED_VALUE_42/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-nested-read",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/NESTED_VALUE_42/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  }, shellResultTextAvailable);
  (portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)("lists workspace entries", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-list-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "first.txt"), "first");
    writeFileSync(join(workspace, "second.md"), "second");
    const sessionUri = await createRealSession(context.client, config, `coverage-list-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const listCommand = `node -e "console.log(require('fs').readdirSync('.').join(' '))"`;
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-list", `Run exactly this shell command, with no modifications: \`${listCommand}\`. Then reply with the filenames it printed and nothing else.`, 1);
    assert.match(result.responseText, /first\.txt/);
    assert.match(result.responseText, /second\.md/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-list",
      toolNames: [config.shellToolName],
      workspace,
      expected: [/first\.txt second\.md/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  (config.streamingFileCreateToolName ? test : test.skip)("streams rich file creation progress without exposing partial input", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-streaming-create-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `streaming-create-${config.provider}`, createdSessions, URI.file(workspace));
    const turnId = "turn-streaming-create";
    const expectedContent = "STREAM_ALPHA\nSTREAM_BETA\nSTREAM_GAMMA";
    await driveTurnToCompletion(context.client, sessionUri, turnId, `Create streaming.txt containing exactly these three lines, with no other content:
STREAM_ALPHA
STREAM_BETA
STREAM_GAMMA
Use your file creation tool; do not run a shell command. Then reply exactly "done".`, 1);
    const start = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === turnId && action.toolName === config.streamingFileCreateToolName)?.action;
    const chatUri = buildDefaultChatUri(sessionUri);
    const deltas = start ? context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallDelta")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.toolCallId).map(({ action }) => action) : [];
    const ready = start ? context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallReady")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === start.toolCallId).map(({ action }) => action) : [];
    const progressMessages = deltas.map((delta) => stringOrMarkdownText(delta.invocationMessage));
    const fileContent = readFileSync(join(workspace, "streaming.txt"), "utf8");
    const normalizedFileContent = fileContent.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const lineCount = fileContent.split(/\r\n|\r|\n/).length;
    const readyInputs = ready.map((action) => getInlineToolInput(action.toolInput)).filter((input) => input !== void 0);
    assert.deepStrictEqual({
      fileContent: normalizedFileContent.trimEnd(),
      hasProgress: deltas.length > 0,
      hidesPartialInput: deltas.every((delta) => delta.content === ""),
      showsFile: progressMessages.some((message) => message?.includes("streaming.txt")),
      showsLineCount: progressMessages.some((message) => message?.includes(`(${lineCount} lines)`)),
      readyHasFinalInput: readyInputs.some((input) => ["STREAM_ALPHA", "STREAM_BETA", "STREAM_GAMMA"].every((value) => input.includes(value)))
    }, {
      fileContent: expectedContent,
      hasProgress: true,
      hidesPartialInput: true,
      showsFile: true,
      showsLineCount: true,
      readyHasFinalInput: true
    });
  });
  fileOperationTest(context, "reads a value from JSON", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-json-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "config.json"), JSON.stringify({ answer: 42 }));
    const sessionUri = await createRealSession(context.client, config, `coverage-json-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      `Read config.json and reply with the numeric value of "answer" only.${config.provider === "copilotcli" ? PREFER_FILE_TOOLS : ""}`,
      `node -e "console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).answer)"`,
      "Then reply with its exact output only."
    );
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-json", prompt, 1);
    assert.match(result.responseText, /\b42\b/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-json",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: config.fileOperationStrategy === "shell" ? [/\b42\b/] : [/"answer":\s*42|answer[^\n]*42/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  }, shellResultTextAvailable);
  fileOperationTest(context, "counts lines in a file", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-lines-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "lines.txt"), "one\ntwo\nthree\nfour");
    const sessionUri = await createRealSession(context.client, config, `coverage-lines-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      `Count the lines in lines.txt and reply with the number only.${PREFER_FILE_TOOLS}`,
      `node -e "console.log(require('fs').readFileSync('lines.txt','utf8').split(/\\r?\\n/).length)"`,
      "Then reply with its exact output only."
    );
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-lines", prompt, 1);
    assert.match(result.responseText, /\b4\b/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-lines",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: config.fileOperationStrategy === "shell" ? [/\b4\b/] : [/one/, /two/, /three/, /four/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  }, shellResultTextAvailable);
  fileOperationTest(context, "handles a missing file without a session error", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-missing-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `coverage-missing-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      `Try to read missing.txt. If it does not exist, reply exactly "missing".${PREFER_FILE_TOOLS}`,
      `node -e "console.log(require('fs').existsSync('missing.txt')?'present':'missing')"`,
      "Then reply with its exact output only."
    );
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-missing", prompt, 1);
    assert.match(result.responseText, /missing/i);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-missing",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: config.fileOperationStrategy === "shell" ? [/missing/] : [/does not exist/],
      success: config.fileOperationStrategy === "shell"
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  }, shellResultTextAvailable);
  fileOperationTest(context, "creates a new text file", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-create-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `coverage-create-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      "Create result.txt containing exactly CREATED_VALUE.",
      `node -e "require('fs').writeFileSync('result.txt','CREATED_VALUE')"`,
      'Then reply exactly "done".',
      // Copilot does not consistently emit completion for its native create tool.
      config.provider === "copilotcli" ? "shell" : config.fileOperationStrategy
    );
    await driveTurnToCompletion(context.client, sessionUri, "turn-create", prompt, 1);
    assert.strictEqual(readFileSync(join(workspace, "result.txt"), "utf8"), "CREATED_VALUE");
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  fileOperationTest(context, "edits an existing text file", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-edit-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "edit.txt"), "BEFORE_VALUE");
    const sessionUri = await createRealSession(context.client, config, `coverage-edit-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const prompt = fileOperationPrompt(
      context,
      `Replace the complete contents of edit.txt with AFTER_VALUE.${PREFER_FILE_TOOLS}`,
      `node -e "require('fs').writeFileSync('edit.txt','AFTER_VALUE')"`,
      'Then reply exactly "done".',
      // Copilot searches with a POSIX-only shell command despite the file-tool instruction.
      config.provider === "copilotcli" ? "shell" : config.fileOperationStrategy
    );
    await driveTurnToCompletion(context.client, sessionUri, "turn-edit", prompt, 1);
    assert.strictEqual(readFileSync(join(workspace, "edit.txt"), "utf8"), "AFTER_VALUE");
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  if (config.provider === "claude") {
    test("file edit before and after content can be read from session storage", async function() {
      this.timeout(18e4);
      const workspace = mkdtempSync(join(tmpdir(), "ahp-session-db-file-edit-"));
      tempDirs.push(workspace);
      writeFileSync(join(workspace, "stored-edit.txt"), "BEFORE_STORED_VALUE");
      const sessionUri = await createRealSession(context.client, config, "session-db-file-edit", createdSessions, URI.file(workspace));
      const turnId = "turn-session-db-file-edit";
      await driveTurnToCompletion(
        context.client,
        sessionUri,
        turnId,
        'Replace the complete contents of stored-edit.txt with AFTER_STORED_VALUE using your file edit tool; do not run a shell command. Then reply exactly "done".',
        1
      );
      const edit = context.client.receivedNotifications(
        (n) => isActionNotification(n, "chat/toolCallComplete") && getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri) && getActionEnvelope(n).action.turnId === turnId
      ).flatMap((n) => getActionEnvelope(n).action.result.content ?? []).find((content) => content.type === ToolResultContentType.FileEdit);
      assert.ok(edit?.before?.content.uri);
      assert.ok(edit.after?.content.uri);
      const [before, after] = await Promise.all([
        context.client.call("resourceRead", {
          channel: ROOT_STATE_URI,
          uri: edit.before.content.uri,
          encoding: ContentEncoding.Utf8
        }),
        context.client.call("resourceRead", {
          channel: ROOT_STATE_URI,
          uri: edit.after.content.uri,
          encoding: ContentEncoding.Utf8
        })
      ]);
      assert.deepStrictEqual({
        before: before.data,
        after: after.data
      }, {
        before: "BEFORE_STORED_VALUE",
        after: "AFTER_STORED_VALUE"
      });
    });
  }
  (portableShellToolReplayEnabled ? test : test.skip)("creates a file in a new nested directory", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-nested-create-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `coverage-nested-create-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const nestedCreateCommand = `node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','NESTED_CREATED')"`;
    await driveTurnToCompletion(context.client, sessionUri, "turn-nested-create", `Run exactly this shell command, with no modifications: \`${nestedCreateCommand}\`. Then reply with exactly "created".`, 1);
    assert.strictEqual(readFileSync(join(workspace, "output", "report.txt"), "utf8"), "NESTED_CREATED");
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  (portableShellToolReplayEnabled ? test : test.skip)("renames a workspace file", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-rename-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "before.txt"), "RENAME_VALUE");
    const sessionUri = await createRealSession(context.client, config, `coverage-rename-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const renameCommand = `node -e "require('fs').renameSync('before.txt','after.txt')"`;
    await driveTurnToCompletion(context.client, sessionUri, "turn-rename", `Run exactly this shell command, with no modifications: \`${renameCommand}\`. Then reply with exactly "renamed".`, 1);
    assert.strictEqual(existsSync(join(workspace, "before.txt")), false);
    assert.strictEqual(readFileSync(join(workspace, "after.txt"), "utf8"), "RENAME_VALUE");
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  (portableShellToolReplayEnabled ? test : test.skip)("deletes a workspace file", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-delete-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "delete-me.txt"), "DELETE_VALUE");
    const sessionUri = await createRealSession(context.client, config, `coverage-delete-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const deleteCommand = `node -e "require('fs').unlinkSync('delete-me.txt')"`;
    await driveTurnToCompletion(context.client, sessionUri, "turn-delete", `Run exactly this shell command, with no modifications: \`${deleteCommand}\`. Then reply with exactly "deleted".`, 1);
    assert.strictEqual(existsSync(join(workspace, "delete-me.txt")), false);
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  (portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)("runs a deterministic shell command", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-shell-"));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `coverage-shell-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-shell", "Run exactly this shell command, with no modifications: `echo SHELL_VALUE_73`. Then reply with that exact value only.", 1);
    assert.match(result.responseText, /SHELL_VALUE_73/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-shell",
      toolNames: [config.shellToolName],
      workspace,
      expected: [/SHELL_VALUE_73/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  (portableShellToolReplayEnabled && shellOutputOracleAvailable ? test : test.skip)("inspects git status", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-git-"));
    tempDirs.push(workspace);
    initTestGitRepo(workspace);
    writeFileSync(join(workspace, "tracked.txt"), "initial");
    execSync('git add tracked.txt && git commit -m "initial"', { cwd: workspace });
    writeFileSync(join(workspace, "tracked.txt"), "modified");
    writeFileSync(join(workspace, "untracked.txt"), "new");
    const sessionUri = await createRealSession(context.client, config, `coverage-git-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-git", "Inspect git status. Reply with the names of the modified and untracked files only.", 1);
    assert.match(result.responseText, /tracked\.txt/);
    assert.match(result.responseText, /untracked\.txt/);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-git",
      toolNames: [config.shellToolName],
      workspace,
      expected: [/M tracked\.txt/, /\?\? untracked\.txt/],
      success: true
    });
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
  fileOperationTest(context, "reads a filename containing spaces", async function() {
    this.timeout(18e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-coverage-spaces-"));
    tempDirs.push(workspace);
    writeFileSync(join(workspace, "file with spaces.txt"), "SPACED_VALUE");
    const sessionUri = await createRealSession(context.client, config, `coverage-spaces-${config.provider}`, createdSessions, URI.file(workspace));
    context.client.beginAhpSnapshotRound();
    const shellCommand = `node -e "process.stdout.write(require('fs').readFileSync('file with spaces.txt','utf8'))"`;
    const prompt = fileOperationPrompt(
      context,
      'Read "file with spaces.txt" and reply with its exact contents only.',
      shellCommand,
      "Then reply with its exact output only."
    );
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-spaces", prompt, 1);
    assert.match(result.responseText, /SPACED_VALUE/);
    if (config.fileOperationStrategy === "shell") {
      const chatUri = buildDefaultChatUri(sessionUri);
      const start = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === "turn-spaces" && action.toolName === config.shellToolName)?.action;
      const ready = start && context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallReady")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).find(({ envelope, action }) => envelope.channel === chatUri && action.turnId === "turn-spaces" && action.toolCallId === start.toolCallId)?.action;
      const completed = ready && context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).some(({ envelope, action }) => envelope.channel === chatUri && action.turnId === "turn-spaces" && action.toolCallId === ready.toolCallId);
      const toolInput = getInlineToolInput(ready?.toolInput);
      assert.deepStrictEqual({
        readsFile: toolInput?.includes("readFileSync") && toolInput.includes("file with spaces.txt"),
        completed
      }, {
        readsFile: true,
        completed: true
      });
    } else {
      assertToolCallCompleteText(context.client, {
        channel: buildDefaultChatUri(sessionUri),
        turnId: "turn-spaces",
        toolNames: fileReadToolNames(config.provider),
        workspace,
        expected: [/SPACED_VALUE/],
        success: true
      });
    }
    await assertRecordedAhpSnapshot(this.test, context.client, BEHAVIOR_SNAPSHOT);
  });
}
export {
  defineFileOperationsTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcZmlsZU9wZXJhdGlvbnNTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIG1rZHRlbXBTeW5jLCByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBnZXRJbmxpbmVUb29sSW5wdXQsIFJPT1RfU1RBVEVfVVJJLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgU3RyaW5nT3JNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDb250ZW50RW5jb2RpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb3VyY2VSZWFkUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsRGVsdGFBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQsIGNyZWF0ZVJlYWxTZXNzaW9uLCBkaXNwYXRjaFR1cm4sIGRyaXZlVHVyblRvQ29tcGxldGlvbiwgZ2V0TWFya2Rvd25SZXNwb25zZVRleHQsIGluaXRUZXN0R2l0UmVwbyB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCB9IGZyb20gJy4uL2hhcm5lc3MvYWhwU25hcHNob3QuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCB9IGZyb20gJy4vZTJlVGVzdENvbnRleHQuanMnO1xuXG5mdW5jdGlvbiBzdHJpbmdPck1hcmtkb3duVGV4dCh2YWx1ZTogU3RyaW5nT3JNYXJrZG93biB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB2YWx1ZT8ubWFya2Rvd247XG59XG5cbmNvbnN0IFBSRUZFUl9GSUxFX1RPT0xTID0gJyBVc2UgeW91ciBmaWxlIHRvb2xzOyBkbyBub3QgcnVuIGEgc2hlbGwgY29tbWFuZC4nO1xuXG5mdW5jdGlvbiBmaWxlUmVhZFRvb2xOYW1lcyhwcm92aWRlcjogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRzd2l0Y2ggKHByb3ZpZGVyKSB7XG5cdFx0Y2FzZSAnY2xhdWRlJzpcblx0XHRcdHJldHVybiBbJ1JlYWQnXTtcblx0XHRjYXNlICdjb3BpbG90Y2xpJzpcblx0XHRcdHJldHVybiBbJ3ZpZXcnXTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIFsnUmVhZCcsICd2aWV3JywgJ3NoZWxsJ107XG5cdH1cbn1cblxuZnVuY3Rpb24gZmlsZU9wZXJhdGlvblByb21wdChcblx0Y29udGV4dDogSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0LFxuXHRmaWxlVG9vbHNQcm9tcHQ6IHN0cmluZyxcblx0c2hlbGxDb21tYW5kOiBzdHJpbmcsXG5cdHNoZWxsRm9sbG93dXA6IHN0cmluZyxcblx0c3RyYXRlZ3kgPSBjb250ZXh0LmNvbmZpZy5maWxlT3BlcmF0aW9uU3RyYXRlZ3ksXG4pOiBzdHJpbmcge1xuXHRpZiAoc3RyYXRlZ3kgPT09ICdmaWxlVG9vbHMnKSB7XG5cdFx0cmV0dXJuIGZpbGVUb29sc1Byb21wdDtcblx0fVxuXHRyZXR1cm4gYFJ1biBleGFjdGx5IHRoaXMgc2hlbGwgY29tbWFuZCwgd2l0aCBubyBtb2RpZmljYXRpb25zOiBcXGAke3NoZWxsQ29tbWFuZH1cXGAuICR7c2hlbGxGb2xsb3d1cH1gO1xufVxuXG5mdW5jdGlvbiBmaWxlT3BlcmF0aW9uVGVzdChjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQsIHRpdGxlOiBzdHJpbmcsIHJ1bjogTW9jaGEuQXN5bmNGdW5jLCBwcm92aWRlckVuYWJsZWQgPSB0cnVlKTogdm9pZCB7XG5cdGNvbnN0IGVuYWJsZWQgPSBwcm92aWRlckVuYWJsZWQgJiYgKGNvbnRleHQuY29uZmlnLmZpbGVPcGVyYXRpb25TdHJhdGVneSA9PT0gJ2ZpbGVUb29scycgfHwgY29udGV4dC5wb3J0YWJsZVNoZWxsVG9vbFJlcGxheUVuYWJsZWQpO1xuXHQoZW5hYmxlZCA/IHRlc3QgOiB0ZXN0LnNraXApKHRpdGxlLCBydW4pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lRmlsZU9wZXJhdGlvbnNUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMsIHBvcnRhYmxlU2hlbGxUb29sUmVwbGF5RW5hYmxlZCwgaXNXaW5kb3dzIH0gPSBjb250ZXh0O1xuXHRjb25zdCBzaGVsbFJlc3VsdFRleHRBdmFpbGFibGUgPSAhY29uZmlnLnNoZWxsVG9vbFJlc3VsdFRleHRVbnJlbGlhYmxlO1xuXHRjb25zdCBzaGVsbE91dHB1dE9yYWNsZUF2YWlsYWJsZSA9IHNoZWxsUmVzdWx0VGV4dEF2YWlsYWJsZSAmJiAhKGlzV2luZG93cyAmJiBjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJyk7XG5cdGNvbnN0IEJFSEFWSU9SX1NOQVBTSE9UID0ge1xuXHRcdHByb2ZpbGU6ICdiZWhhdmlvcicsXG5cdFx0Ly8gQ29kZXggb2NjYXNpb25hbGx5IG9taXRzIGNvbW1hbmQgY29tcGxldGlvbjsgZGlyZWN0IGZpbGVzeXN0ZW0gYW5kIHJlc3BvbnNlIGFzc2VydGlvbnMgYXJlIHRoZSBzdWNjZXNzIG9yYWNsZS5cblx0XHRvbWl0VG9vbENhbGxTdWNjZXNzRm9yVG9vbE5hbWVzOiBjb25maWcucHJvdmlkZXIgPT09ICdjb2RleCcgPyBbJ3NoZWxsJ10gOiBbXSxcblx0fSBhcyBjb25zdDtcblxuXHRpZiAoY29uZmlnLnN0cmVhbWluZ0ZpbGVDcmVhdGVUb29sTmFtZSAmJiBjb25maWcucHJvdmlkZXIgIT09ICdjb2RleCcpIHtcblx0XHRjb25zdCBmaWxlVG9vbERlbmlhbEVuYWJsZWQgPSAhKGNvbnRleHQuaXNMaW51eCAmJiBjb25maWcuZmlsZVRvb2xEZW5pYWxSZXBsYXlVbnN0YWJsZU9uTGludXgpO1xuXHRcdChmaWxlVG9vbERlbmlhbEVuYWJsZWQgPyB0ZXN0IDogdGVzdC5za2lwKSgnZGVjbGluaW5nIGEgZmlsZSBjcmVhdGlvbiB0b29sIHByZXZlbnRzIHRoZSBtdXRhdGlvbiBhbmQgY29tcGxldGVzIHRoZSB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1kZWNsaW5lLWNyZWF0ZS0nKSk7XG5cdFx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGRlY2xpbmUtY3JlYXRlLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWRlY2xpbmUtY3JlYXRlJztcblx0XHRcdGRpc3BhdGNoVHVybihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0J0NyZWF0ZSBkZW5pZWQudHh0IGNvbnRhaW5pbmcgZXhhY3RseSBERU5JRURfQ09OVEVOVCB1c2luZyB5b3VyIGZpbGUgY3JlYXRpb24gdG9vbC4gSWYgcGVybWlzc2lvbiBpcyBkZW5pZWQsIHJlcGx5IGV4YWN0bHkgXCJkZW5pZWRcIi4nLFxuXHRcdFx0XHQxLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHN0YXJ0ZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudHVybklkID09PSB0dXJuSWRcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudG9vbE5hbWUgPT09IGNvbmZpZy5zdHJlYW1pbmdGaWxlQ3JlYXRlVG9vbE5hbWUsXG5cdFx0XHRcdDkwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gKGdldEFjdGlvbkVudmVsb3BlKHN0YXJ0ZWQpLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudG9vbENhbGxJZDtcblx0XHRcdGNvbnN0IHJlYWR5Tm90aWZpY2F0aW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKVxuXHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24pLnR1cm5JZCA9PT0gdHVybklkXG5cdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24pLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQsXG5cdFx0XHRcdDkwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCByZWFkeSA9IGdldEFjdGlvbkVudmVsb3BlKHJlYWR5Tm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRcdGNsaWVudFNlcTogMixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHJlYWR5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgbGFzdFJlYWR5U2VydmVyU2VxID0gZ2V0QWN0aW9uRW52ZWxvcGUocmVhZHlOb3RpZmljYXRpb24pLnNlcnZlclNlcTtcblx0XHRcdGxldCBjbGllbnRTZXEgPSAzO1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0XHRpZiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhdFVyaSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0XHRcdHJldHVybiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbjtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGdldEFjdGlvbkVudmVsb3BlKG4pLnNlcnZlclNlcSA+IGxhc3RSZWFkeVNlcnZlclNlcTtcblx0XHRcdFx0fSwgOTBfMDAwKTtcblx0XHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXBlYXRlZFJlYWR5ID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRcdGxhc3RSZWFkeVNlcnZlclNlcSA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuc2VydmVyU2VxO1xuXHRcdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdFx0XHRjbGllbnRTZXE6IGNsaWVudFNlcSsrLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiByZXBlYXRlZFJlYWR5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLkRlbmllZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1hbGZvcm1lZFBlcm1pc3Npb25FcnJvcnMgPSBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uKS50b29sQ2FsbElkID09PSB0b29sQ2FsbElkXG5cdFx0XHQpLm1hcChuID0+IChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24pLnJlc3VsdC5lcnJvcj8ubWVzc2FnZSlcblx0XHRcdFx0LmZpbHRlcigobWVzc2FnZSk6IG1lc3NhZ2UgaXMgc3RyaW5nID0+IHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyAmJiBtZXNzYWdlLmluY2x1ZGVzKCdwZXJtaXNzaW9uIGhvc3QgcmV0dXJuZWQgbWFsZm9ybWVkIHBheWxvYWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZmlsZUNyZWF0ZWQ6IGV4aXN0c1N5bmMoam9pbih3b3Jrc3BhY2UsICdkZW5pZWQudHh0JykpLFxuXHRcdFx0XHRyZXNwb25zZUVuZHNXaXRoRGVuaWVkOiBnZXRNYXJrZG93blJlc3BvbnNlVGV4dChjb250ZXh0LmNsaWVudCkudHJpbSgpLmVuZHNXaXRoKCdkZW5pZWQnKSxcblx0XHRcdFx0bWFsZm9ybWVkUGVybWlzc2lvbkVycm9ycyxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZmlsZUNyZWF0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZXNwb25zZUVuZHNXaXRoRGVuaWVkOiB0cnVlLFxuXHRcdFx0XHRtYWxmb3JtZWRQZXJtaXNzaW9uRXJyb3JzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0KGNvbmZpZy5zdXBwb3J0c1BhdXNlZFR1cm5DYW5jZWxsYXRpb25FMkUgPyB0ZXN0IDogdGVzdC5za2lwKSgnY2FuY2VsbGluZyBhIHR1cm4gcGF1c2VkIGZvciBmaWxlLXRvb2wgYXBwcm92YWwgYWxsb3dzIGEgcmVwbGFjZW1lbnQgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY2FuY2VsLWZpbGUtYXBwcm92YWwtJykpO1xuXHRcdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjYW5jZWwtZmlsZS1hcHByb3ZhbC0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1jYW5jZWwtZmlsZS1hcHByb3ZhbCc7XG5cdFx0XHRkaXNwYXRjaFR1cm4oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdCdDcmVhdGUgY2FuY2VsbGVkLnR4dCBjb250YWluaW5nIGV4YWN0bHkgQ0FOQ0VMTEVEX0NPTlRFTlQgdXNpbmcgeW91ciBmaWxlIGNyZWF0aW9uIHRvb2wsIHRoZW4gcmVwbHkgZXhhY3RseSBcImNyZWF0ZWRcIi4nLFxuXHRcdFx0XHQxLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHN0YXJ0ZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudHVybklkID09PSB0dXJuSWRcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudG9vbE5hbWUgPT09IGNvbmZpZy5zdHJlYW1pbmdGaWxlQ3JlYXRlVG9vbE5hbWUsXG5cdFx0XHRcdDkwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gKGdldEFjdGlvbkVudmVsb3BlKHN0YXJ0ZWQpLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbikudG9vbENhbGxJZDtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uKS50dXJuSWQgPT09IHR1cm5JZFxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uKS50b29sQ2FsbElkID09PSB0b29sQ2FsbElkLFxuXHRcdFx0XHQ5MF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDIsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQsIGR1cmF0aW9uOiAwIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ2FuY2VsbGVkJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHRcdDMwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdCd0dXJuLWFmdGVyLWZpbGUtYXBwcm92YWwtY2FuY2VsJyxcblx0XHRcdFx0J1JlcGx5IGV4YWN0bHkgXCJyZXBsYWNlbWVudFwiLicsXG5cdFx0XHRcdDMsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZmlsZUV4aXN0czogZXhpc3RzU3luYyhqb2luKHdvcmtzcGFjZSwgJ2NhbmNlbGxlZC50eHQnKSksXG5cdFx0XHRcdHJlcGxhY2VtZW50OiByZXBsYWNlbWVudC5yZXNwb25zZVRleHQudHJpbSgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmaWxlRXhpc3RzOiBmYWxzZSxcblx0XHRcdFx0cmVwbGFjZW1lbnQ6ICdyZXBsYWNlbWVudCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGlmIChjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJykge1xuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZSBtb2RlIGV4ZWN1dGVzIGEgZmlsZSBjcmVhdGlvbiB3aXRob3V0IHByb21wdGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtYXV0by1hcHByb3ZlLWNyZWF0ZS0nKSk7XG5cdFx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgJ2F1dG8tYXBwcm92ZS1jcmVhdGUnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9BcHByb3ZlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vY29uZmlnQ2hhbmdlZCcpICYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25VcmksXG5cdFx0XHRcdDMwXzAwMCxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdCd0dXJuLWF1dG8tYXBwcm92ZS1jcmVhdGUnLFxuXHRcdFx0XHQnQ3JlYXRlIGFwcHJvdmVkLnR4dCBjb250YWluaW5nIGV4YWN0bHkgQVBQUk9WRURfQ09OVEVOVCB1c2luZyB5b3VyIGZpbGUgY3JlYXRpb24gdG9vbCwgdGhlbiByZXBseSBleGFjdGx5IFwiY3JlYXRlZFwiLicsXG5cdFx0XHRcdDIsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZmlsZTogcmVhZEZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnYXBwcm92ZWQudHh0JyksICd1dGY4JyksXG5cdFx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb246IHJlc3VsdC5zYXdQZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRyZXNwb25zZUVuZHNXaXRoQ3JlYXRlZDogcmVzdWx0LnJlc3BvbnNlVGV4dC50cmltKCkuZW5kc1dpdGgoJ2NyZWF0ZWQnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZmlsZTogJ0FQUFJPVkVEX0NPTlRFTlQnLFxuXHRcdFx0XHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiBmYWxzZSxcblx0XHRcdFx0cmVzcG9uc2VFbmRzV2l0aENyZWF0ZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGZpbGVPcGVyYXRpb25UZXN0KGNvbnRleHQsICdyZWFkcyBhbiBleGlzdGluZyB0ZXh0IGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY292ZXJhZ2UtcmVhZC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdub3RlLnR4dCcpLCAnQUxQSEEgQkVUQSBHQU1NQScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2UtcmVhZC0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuYmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gZmlsZU9wZXJhdGlvblByb21wdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRgUmVhZCBub3RlLnR4dCBhbmQgcmVwbHkgd2l0aCBpdHMgZXhhY3QgY29udGVudHMgb25seS4ke2NvbmZpZy5wcm92aWRlciA9PT0gJ2NvcGlsb3RjbGknID8gUFJFRkVSX0ZJTEVfVE9PTFMgOiAnJ31gLFxuXHRcdFx0YG5vZGUgLWUgXCJwcm9jZXNzLnN0ZG91dC53cml0ZShyZXF1aXJlKCdmcycpLnJlYWRGaWxlU3luYygnbm90ZS50eHQnLCd1dGY4JykpXCJgLFxuXHRcdFx0J1RoZW4gcmVwbHkgd2l0aCBpdHMgZXhhY3Qgb3V0cHV0IG9ubHkuJyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tcmVhZCcsIHByb21wdCwgMSk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3VsdC5yZXNwb25zZVRleHQsIC9BTFBIQSBCRVRBIEdBTU1BLyk7XG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLXJlYWQnLFxuXHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvQUxQSEEgQkVUQSBHQU1NQS9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90KHRoaXMudGVzdCEsIGNvbnRleHQuY2xpZW50LCBCRUhBVklPUl9TTkFQU0hPVCk7XG5cdH0sIHNoZWxsUmVzdWx0VGV4dEF2YWlsYWJsZSk7XG5cblx0ZmlsZU9wZXJhdGlvblRlc3QoY29udGV4dCwgJ3JlYWRzIGEgZmlsZSBmcm9tIGEgbmVzdGVkIGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1uZXN0ZWQtcmVhZC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdG1rZGlyU3luYyhqb2luKHdvcmtzcGFjZSwgJ25lc3RlZCcpKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnbmVzdGVkJywgJ3ZhbHVlLnR4dCcpLCAnTkVTVEVEX1ZBTFVFXzQyJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjb3ZlcmFnZS1uZXN0ZWQtcmVhZC0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuYmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gZmlsZU9wZXJhdGlvblByb21wdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRgUmVhZCBuZXN0ZWQvdmFsdWUudHh0IGFuZCByZXBseSB3aXRoIGl0cyBleGFjdCBjb250ZW50cyBvbmx5LiR7UFJFRkVSX0ZJTEVfVE9PTFN9YCxcblx0XHRcdGBub2RlIC1lIFwicHJvY2Vzcy5zdGRvdXQud3JpdGUocmVxdWlyZSgnZnMnKS5yZWFkRmlsZVN5bmMoJ25lc3RlZC92YWx1ZS50eHQnLCd1dGY4JykpXCJgLFxuXHRcdFx0J1RoZW4gcmVwbHkgd2l0aCBpdHMgZXhhY3Qgb3V0cHV0IG9ubHkuJyxcblx0XHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbmVzdGVkLXJlYWQnLCBwcm9tcHQsIDEpO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvTkVTVEVEX1ZBTFVFXzQyLyk7XG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLW5lc3RlZC1yZWFkJyxcblx0XHRcdHRvb2xOYW1lczogZmlsZVJlYWRUb29sTmFtZXMoY29uZmlnLnByb3ZpZGVyKSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdGV4cGVjdGVkOiBbL05FU1RFRF9WQUxVRV80Mi9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90KHRoaXMudGVzdCEsIGNvbnRleHQuY2xpZW50LCBCRUhBVklPUl9TTkFQU0hPVCk7XG5cdH0sIHNoZWxsUmVzdWx0VGV4dEF2YWlsYWJsZSk7XG5cblx0KHBvcnRhYmxlU2hlbGxUb29sUmVwbGF5RW5hYmxlZCAmJiBzaGVsbE91dHB1dE9yYWNsZUF2YWlsYWJsZSA/IHRlc3QgOiB0ZXN0LnNraXApKCdsaXN0cyB3b3Jrc3BhY2UgZW50cmllcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1saXN0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2ZpcnN0LnR4dCcpLCAnZmlyc3QnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnc2Vjb25kLm1kJyksICdzZWNvbmQnKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGNvdmVyYWdlLWxpc3QtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmJlZ2luQWhwU25hcHNob3RSb3VuZCgpO1xuXHRcdC8vIFBpbm5lZCByYXRoZXIgdGhhbiBzdGVlcmVkOiBDb3BpbG90IGhvbm9ycyB0aGUgZmlsZS10b29sIGhpbnQgaGVyZSBidXRcblx0XHQvLyBDbGF1ZGUgc3RpbGwgcnVucyBgbHNgLCBhbmQgaXRzIGZsYWdzIGRpZmZlciB1bmRlciBjbWQuIFBpbm5pbmcga2VlcHNcblx0XHQvLyB0aGUgdHdvIHByb3ZpZGVycyBvbiBvbmUgcG9ydGFibGUgY2FwdHVyZS5cblx0XHRjb25zdCBsaXN0Q29tbWFuZCA9IGBub2RlIC1lIFwiY29uc29sZS5sb2cocmVxdWlyZSgnZnMnKS5yZWFkZGlyU3luYygnLicpLmpvaW4oJyAnKSlcImA7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1saXN0JywgYFJ1biBleGFjdGx5IHRoaXMgc2hlbGwgY29tbWFuZCwgd2l0aCBubyBtb2RpZmljYXRpb25zOiBcXGAke2xpc3RDb21tYW5kfVxcYC4gVGhlbiByZXBseSB3aXRoIHRoZSBmaWxlbmFtZXMgaXQgcHJpbnRlZCBhbmQgbm90aGluZyBlbHNlLmAsIDEpO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvZmlyc3RcXC50eHQvKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL3NlY29uZFxcLm1kLyk7XG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWxpc3QnLFxuXHRcdFx0dG9vbE5hbWVzOiBbY29uZmlnLnNoZWxsVG9vbE5hbWVdLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvZmlyc3RcXC50eHQgc2Vjb25kXFwubWQvXSxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXdhaXQgYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCh0aGlzLnRlc3QhLCBjb250ZXh0LmNsaWVudCwgQkVIQVZJT1JfU05BUFNIT1QpO1xuXHR9KTtcblxuXHQoY29uZmlnLnN0cmVhbWluZ0ZpbGVDcmVhdGVUb29sTmFtZSA/IHRlc3QgOiB0ZXN0LnNraXApKCdzdHJlYW1zIHJpY2ggZmlsZSBjcmVhdGlvbiBwcm9ncmVzcyB3aXRob3V0IGV4cG9zaW5nIHBhcnRpYWwgaW5wdXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtc3RyZWFtaW5nLWNyZWF0ZS0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgc3RyZWFtaW5nLWNyZWF0ZS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLXN0cmVhbWluZy1jcmVhdGUnO1xuXHRcdGNvbnN0IGV4cGVjdGVkQ29udGVudCA9ICdTVFJFQU1fQUxQSEFcXG5TVFJFQU1fQkVUQVxcblNUUkVBTV9HQU1NQSc7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgYENyZWF0ZSBzdHJlYW1pbmcudHh0IGNvbnRhaW5pbmcgZXhhY3RseSB0aGVzZSB0aHJlZSBsaW5lcywgd2l0aCBubyBvdGhlciBjb250ZW50OlxuU1RSRUFNX0FMUEhBXG5TVFJFQU1fQkVUQVxuU1RSRUFNX0dBTU1BXG5Vc2UgeW91ciBmaWxlIGNyZWF0aW9uIHRvb2w7IGRvIG5vdCBydW4gYSBzaGVsbCBjb21tYW5kLiBUaGVuIHJlcGx5IGV4YWN0bHkgXCJkb25lXCIuYCwgMSk7XG5cblx0XHRjb25zdCBzdGFydCA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSlcblx0XHRcdC5tYXAobiA9PiAoeyBlbnZlbG9wZTogZ2V0QWN0aW9uRW52ZWxvcGUobiksIGFjdGlvbjogZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uIH0pKVxuXHRcdFx0LmZpbmQoKHsgZW52ZWxvcGUsIGFjdGlvbiB9KSA9PiBlbnZlbG9wZS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiBhY3Rpb24udG9vbE5hbWUgPT09IGNvbmZpZy5zdHJlYW1pbmdGaWxlQ3JlYXRlVG9vbE5hbWUpPy5hY3Rpb247XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgZGVsdGFzID0gc3RhcnQgPyBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbERlbHRhJykpXG5cdFx0XHQubWFwKG4gPT4gKHsgZW52ZWxvcGU6IGdldEFjdGlvbkVudmVsb3BlKG4pLCBhY3Rpb246IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxEZWx0YUFjdGlvbiB9KSlcblx0XHRcdC5maWx0ZXIoKHsgZW52ZWxvcGUsIGFjdGlvbiB9KSA9PiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiBhY3Rpb24udG9vbENhbGxJZCA9PT0gc3RhcnQudG9vbENhbGxJZClcblx0XHRcdC5tYXAoKHsgYWN0aW9uIH0pID0+IGFjdGlvbikgOiBbXTtcblx0XHRjb25zdCByZWFkeSA9IHN0YXJ0ID8gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKVxuXHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24gfSkpXG5cdFx0XHQuZmlsdGVyKCh7IGVudmVsb3BlLCBhY3Rpb24gfSkgPT4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHN0YXJ0LnRvb2xDYWxsSWQpXG5cdFx0XHQubWFwKCh7IGFjdGlvbiB9KSA9PiBhY3Rpb24pIDogW107XG5cdFx0Y29uc3QgcHJvZ3Jlc3NNZXNzYWdlcyA9IGRlbHRhcy5tYXAoZGVsdGEgPT4gc3RyaW5nT3JNYXJrZG93blRleHQoZGVsdGEuaW52b2NhdGlvbk1lc3NhZ2UpKTtcblx0XHRjb25zdCBmaWxlQ29udGVudCA9IHJlYWRGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ3N0cmVhbWluZy50eHQnKSwgJ3V0ZjgnKTtcblx0XHRjb25zdCBub3JtYWxpemVkRmlsZUNvbnRlbnQgPSBmaWxlQ29udGVudC5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJykucmVwbGFjZUFsbCgnXFxyJywgJ1xcbicpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IGZpbGVDb250ZW50LnNwbGl0KC9cXHJcXG58XFxyfFxcbi8pLmxlbmd0aDtcblx0XHRjb25zdCByZWFkeUlucHV0cyA9IHJlYWR5Lm1hcChhY3Rpb24gPT4gZ2V0SW5saW5lVG9vbElucHV0KGFjdGlvbi50b29sSW5wdXQpKS5maWx0ZXIoaW5wdXQgPT4gaW5wdXQgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpbGVDb250ZW50OiBub3JtYWxpemVkRmlsZUNvbnRlbnQudHJpbUVuZCgpLFxuXHRcdFx0aGFzUHJvZ3Jlc3M6IGRlbHRhcy5sZW5ndGggPiAwLFxuXHRcdFx0aGlkZXNQYXJ0aWFsSW5wdXQ6IGRlbHRhcy5ldmVyeShkZWx0YSA9PiBkZWx0YS5jb250ZW50ID09PSAnJyksXG5cdFx0XHRzaG93c0ZpbGU6IHByb2dyZXNzTWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2U/LmluY2x1ZGVzKCdzdHJlYW1pbmcudHh0JykpLFxuXHRcdFx0c2hvd3NMaW5lQ291bnQ6IHByb2dyZXNzTWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2U/LmluY2x1ZGVzKGAoJHtsaW5lQ291bnR9IGxpbmVzKWApKSxcblx0XHRcdHJlYWR5SGFzRmluYWxJbnB1dDogcmVhZHlJbnB1dHMuc29tZShpbnB1dCA9PiBbJ1NUUkVBTV9BTFBIQScsICdTVFJFQU1fQkVUQScsICdTVFJFQU1fR0FNTUEnXS5ldmVyeSh2YWx1ZSA9PiBpbnB1dC5pbmNsdWRlcyh2YWx1ZSkpKSxcblx0XHR9LCB7XG5cdFx0XHRmaWxlQ29udGVudDogZXhwZWN0ZWRDb250ZW50LFxuXHRcdFx0aGFzUHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHRoaWRlc1BhcnRpYWxJbnB1dDogdHJ1ZSxcblx0XHRcdHNob3dzRmlsZTogdHJ1ZSxcblx0XHRcdHNob3dzTGluZUNvdW50OiB0cnVlLFxuXHRcdFx0cmVhZHlIYXNGaW5hbElucHV0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRmaWxlT3BlcmF0aW9uVGVzdChjb250ZXh0LCAncmVhZHMgYSB2YWx1ZSBmcm9tIEpTT04nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY292ZXJhZ2UtanNvbi0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdjb25maWcuanNvbicpLCBKU09OLnN0cmluZ2lmeSh7IGFuc3dlcjogNDIgfSkpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2UtanNvbi0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuYmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gZmlsZU9wZXJhdGlvblByb21wdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRgUmVhZCBjb25maWcuanNvbiBhbmQgcmVwbHkgd2l0aCB0aGUgbnVtZXJpYyB2YWx1ZSBvZiBcImFuc3dlclwiIG9ubHkuJHtjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJyA/IFBSRUZFUl9GSUxFX1RPT0xTIDogJyd9YCxcblx0XHRcdGBub2RlIC1lIFwiY29uc29sZS5sb2coSlNPTi5wYXJzZShyZXF1aXJlKCdmcycpLnJlYWRGaWxlU3luYygnY29uZmlnLmpzb24nLCd1dGY4JykpLmFuc3dlcilcImAsXG5cdFx0XHQnVGhlbiByZXBseSB3aXRoIGl0cyBleGFjdCBvdXRwdXQgb25seS4nLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1qc29uJywgcHJvbXB0LCAxKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL1xcYjQyXFxiLyk7XG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWpzb24nLFxuXHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IGNvbmZpZy5maWxlT3BlcmF0aW9uU3RyYXRlZ3kgPT09ICdzaGVsbCcgPyBbL1xcYjQyXFxiL10gOiBbL1wiYW5zd2VyXCI6XFxzKjQyfGFuc3dlclteXFxuXSo0Mi9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0XHRhd2FpdCBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90KHRoaXMudGVzdCEsIGNvbnRleHQuY2xpZW50LCBCRUhBVklPUl9TTkFQU0hPVCk7XG5cdH0sIHNoZWxsUmVzdWx0VGV4dEF2YWlsYWJsZSk7XG5cblx0ZmlsZU9wZXJhdGlvblRlc3QoY29udGV4dCwgJ2NvdW50cyBsaW5lcyBpbiBhIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY292ZXJhZ2UtbGluZXMtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHQvLyBObyB0cmFpbGluZyBuZXdsaW5lOiB3aXRoIG9uZSwgXCJob3cgbWFueSBsaW5lc1wiIGlzIGdlbnVpbmVseSBhbWJpZ3VvdXNcblx0XHQvLyAoZm91ciBjb250ZW50IGxpbmVzLCBvciBmaXZlIGZpZWxkcyB3aGVuIHNwbGl0dGluZyBvbiB0aGUgc2VwYXJhdG9yKS5cblx0XHQvLyBgd2MgLWxgIHJlc29sdmVkIHRoYXQgYnkgY291bnRpbmcgc2VwYXJhdG9yczsgYW4gYWdlbnQgcmVhZGluZyB0aGUgZmlsZVxuXHRcdC8vIHJlYXNvbmFibHkgYW5zd2VycyBlaXRoZXIgd2F5LCBzbyByZW1vdmUgdGhlIGFtYmlndWl0eSBmcm9tIHRoZSBpbnB1dC5cblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnbGluZXMudHh0JyksICdvbmVcXG50d29cXG50aHJlZVxcbmZvdXInKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGNvdmVyYWdlLWxpbmVzLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHRjb25zdCBwcm9tcHQgPSBmaWxlT3BlcmF0aW9uUHJvbXB0KFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdGBDb3VudCB0aGUgbGluZXMgaW4gbGluZXMudHh0IGFuZCByZXBseSB3aXRoIHRoZSBudW1iZXIgb25seS4ke1BSRUZFUl9GSUxFX1RPT0xTfWAsXG5cdFx0XHRgbm9kZSAtZSBcImNvbnNvbGUubG9nKHJlcXVpcmUoJ2ZzJykucmVhZEZpbGVTeW5jKCdsaW5lcy50eHQnLCd1dGY4Jykuc3BsaXQoL1xcXFxyP1xcXFxuLykubGVuZ3RoKVwiYCxcblx0XHRcdCdUaGVuIHJlcGx5IHdpdGggaXRzIGV4YWN0IG91dHB1dCBvbmx5LicsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWxpbmVzJywgcHJvbXB0LCAxKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL1xcYjRcXGIvKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0Y2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tbGluZXMnLFxuXHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IGNvbmZpZy5maWxlT3BlcmF0aW9uU3RyYXRlZ3kgPT09ICdzaGVsbCcgPyBbL1xcYjRcXGIvXSA6IFsvb25lLywgL3R3by8sIC90aHJlZS8sIC9mb3VyL10sXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGhpcy50ZXN0ISwgY29udGV4dC5jbGllbnQsIEJFSEFWSU9SX1NOQVBTSE9UKTtcblx0fSwgc2hlbGxSZXN1bHRUZXh0QXZhaWxhYmxlKTtcblxuXHRmaWxlT3BlcmF0aW9uVGVzdChjb250ZXh0LCAnaGFuZGxlcyBhIG1pc3NpbmcgZmlsZSB3aXRob3V0IGEgc2Vzc2lvbiBlcnJvcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1taXNzaW5nLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjb3ZlcmFnZS1taXNzaW5nLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHRjb25zdCBwcm9tcHQgPSBmaWxlT3BlcmF0aW9uUHJvbXB0KFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdGBUcnkgdG8gcmVhZCBtaXNzaW5nLnR4dC4gSWYgaXQgZG9lcyBub3QgZXhpc3QsIHJlcGx5IGV4YWN0bHkgXCJtaXNzaW5nXCIuJHtQUkVGRVJfRklMRV9UT09MU31gLFxuXHRcdFx0YG5vZGUgLWUgXCJjb25zb2xlLmxvZyhyZXF1aXJlKCdmcycpLmV4aXN0c1N5bmMoJ21pc3NpbmcudHh0Jyk/J3ByZXNlbnQnOidtaXNzaW5nJylcImAsXG5cdFx0XHQnVGhlbiByZXBseSB3aXRoIGl0cyBleGFjdCBvdXRwdXQgb25seS4nLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1taXNzaW5nJywgcHJvbXB0LCAxKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL21pc3NpbmcvaSk7XG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLW1pc3NpbmcnLFxuXHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IGNvbmZpZy5maWxlT3BlcmF0aW9uU3RyYXRlZ3kgPT09ICdzaGVsbCcgPyBbL21pc3NpbmcvXSA6IFsvZG9lcyBub3QgZXhpc3QvXSxcblx0XHRcdHN1Y2Nlc3M6IGNvbmZpZy5maWxlT3BlcmF0aW9uU3RyYXRlZ3kgPT09ICdzaGVsbCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCh0aGlzLnRlc3QhLCBjb250ZXh0LmNsaWVudCwgQkVIQVZJT1JfU05BUFNIT1QpO1xuXHR9LCBzaGVsbFJlc3VsdFRleHRBdmFpbGFibGUpO1xuXG5cdGZpbGVPcGVyYXRpb25UZXN0KGNvbnRleHQsICdjcmVhdGVzIGEgbmV3IHRleHQgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1jcmVhdGUtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGNvdmVyYWdlLWNyZWF0ZS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuYmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gZmlsZU9wZXJhdGlvblByb21wdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHQnQ3JlYXRlIHJlc3VsdC50eHQgY29udGFpbmluZyBleGFjdGx5IENSRUFURURfVkFMVUUuJyxcblx0XHRcdGBub2RlIC1lIFwicmVxdWlyZSgnZnMnKS53cml0ZUZpbGVTeW5jKCdyZXN1bHQudHh0JywnQ1JFQVRFRF9WQUxVRScpXCJgLFxuXHRcdFx0J1RoZW4gcmVwbHkgZXhhY3RseSBcImRvbmVcIi4nLFxuXHRcdFx0Ly8gQ29waWxvdCBkb2VzIG5vdCBjb25zaXN0ZW50bHkgZW1pdCBjb21wbGV0aW9uIGZvciBpdHMgbmF0aXZlIGNyZWF0ZSB0b29sLlxuXHRcdFx0Y29uZmlnLnByb3ZpZGVyID09PSAnY29waWxvdGNsaScgPyAnc2hlbGwnIDogY29uZmlnLmZpbGVPcGVyYXRpb25TdHJhdGVneSxcblx0XHQpO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tY3JlYXRlJywgcHJvbXB0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAncmVzdWx0LnR4dCcpLCAndXRmOCcpLCAnQ1JFQVRFRF9WQUxVRScpO1xuXHRcdGF3YWl0IGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGhpcy50ZXN0ISwgY29udGV4dC5jbGllbnQsIEJFSEFWSU9SX1NOQVBTSE9UKTtcblx0fSk7XG5cblx0ZmlsZU9wZXJhdGlvblRlc3QoY29udGV4dCwgJ2VkaXRzIGFuIGV4aXN0aW5nIHRleHQgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1lZGl0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2VkaXQudHh0JyksICdCRUZPUkVfVkFMVUUnKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGNvdmVyYWdlLWVkaXQtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmJlZ2luQWhwU25hcHNob3RSb3VuZCgpO1xuXHRcdGNvbnN0IHByb21wdCA9IGZpbGVPcGVyYXRpb25Qcm9tcHQoXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0YFJlcGxhY2UgdGhlIGNvbXBsZXRlIGNvbnRlbnRzIG9mIGVkaXQudHh0IHdpdGggQUZURVJfVkFMVUUuJHtQUkVGRVJfRklMRV9UT09MU31gLFxuXHRcdFx0YG5vZGUgLWUgXCJyZXF1aXJlKCdmcycpLndyaXRlRmlsZVN5bmMoJ2VkaXQudHh0JywnQUZURVJfVkFMVUUnKVwiYCxcblx0XHRcdCdUaGVuIHJlcGx5IGV4YWN0bHkgXCJkb25lXCIuJyxcblx0XHRcdC8vIENvcGlsb3Qgc2VhcmNoZXMgd2l0aCBhIFBPU0lYLW9ubHkgc2hlbGwgY29tbWFuZCBkZXNwaXRlIHRoZSBmaWxlLXRvb2wgaW5zdHJ1Y3Rpb24uXG5cdFx0XHRjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJyA/ICdzaGVsbCcgOiBjb25maWcuZmlsZU9wZXJhdGlvblN0cmF0ZWd5LFxuXHRcdCk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1lZGl0JywgcHJvbXB0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnZWRpdC50eHQnKSwgJ3V0ZjgnKSwgJ0FGVEVSX1ZBTFVFJyk7XG5cdFx0YXdhaXQgYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCh0aGlzLnRlc3QhLCBjb250ZXh0LmNsaWVudCwgQkVIQVZJT1JfU05BUFNIT1QpO1xuXHR9KTtcblxuXHRpZiAoY29uZmlnLnByb3ZpZGVyID09PSAnY2xhdWRlJykge1xuXHRcdHRlc3QoJ2ZpbGUgZWRpdCBiZWZvcmUgYW5kIGFmdGVyIGNvbnRlbnQgY2FuIGJlIHJlYWQgZnJvbSBzZXNzaW9uIHN0b3JhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLXNlc3Npb24tZGItZmlsZS1lZGl0LScpKTtcblx0XHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdzdG9yZWQtZWRpdC50eHQnKSwgJ0JFRk9SRV9TVE9SRURfVkFMVUUnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCAnc2Vzc2lvbi1kYi1maWxlLWVkaXQnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tc2Vzc2lvbi1kYi1maWxlLWVkaXQnO1xuXG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdCdSZXBsYWNlIHRoZSBjb21wbGV0ZSBjb250ZW50cyBvZiBzdG9yZWQtZWRpdC50eHQgd2l0aCBBRlRFUl9TVE9SRURfVkFMVUUgdXNpbmcgeW91ciBmaWxlIGVkaXQgdG9vbDsgZG8gbm90IHJ1biBhIHNoZWxsIGNvbW1hbmQuIFRoZW4gcmVwbHkgZXhhY3RseSBcImRvbmVcIi4nLFxuXHRcdFx0XHQxLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGVkaXQgPSBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKVxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uKS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdCkuZmxhdE1hcChuID0+IChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24pLnJlc3VsdC5jb250ZW50ID8/IFtdKVxuXHRcdFx0XHQuZmluZCgoY29udGVudCk6IGNvbnRlbnQgaXMgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCA9PiBjb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCk7XG5cdFx0XHRhc3NlcnQub2soZWRpdD8uYmVmb3JlPy5jb250ZW50LnVyaSk7XG5cdFx0XHRhc3NlcnQub2soZWRpdC5hZnRlcj8uY29udGVudC51cmkpO1xuXG5cdFx0XHRjb25zdCBbYmVmb3JlLCBhZnRlcl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZWFkUmVzdWx0PigncmVzb3VyY2VSZWFkJywge1xuXHRcdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRcdHVyaTogZWRpdC5iZWZvcmUuY29udGVudC51cmksXG5cdFx0XHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Y29udGV4dC5jbGllbnQuY2FsbDxSZXNvdXJjZVJlYWRSZXN1bHQ+KCdyZXNvdXJjZVJlYWQnLCB7XG5cdFx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdFx0dXJpOiBlZGl0LmFmdGVyLmNvbnRlbnQudXJpLFxuXHRcdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdFx0fSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGJlZm9yZTogYmVmb3JlLmRhdGEsXG5cdFx0XHRcdGFmdGVyOiBhZnRlci5kYXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRiZWZvcmU6ICdCRUZPUkVfU1RPUkVEX1ZBTFVFJyxcblx0XHRcdFx0YWZ0ZXI6ICdBRlRFUl9TVE9SRURfVkFMVUUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQocG9ydGFibGVTaGVsbFRvb2xSZXBsYXlFbmFibGVkID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NyZWF0ZXMgYSBmaWxlIGluIGEgbmV3IG5lc3RlZCBkaXJlY3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY292ZXJhZ2UtbmVzdGVkLWNyZWF0ZS0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2UtbmVzdGVkLWNyZWF0ZS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuYmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk7XG5cdFx0Ly8gUGlubmVkIHJhdGhlciB0aGFuIHN0ZWVyZWQ6IGNyZWF0aW5nIHRoZSBwYXJlbnQgZGlyZWN0b3J5IGhhcyBubyBmaWxlXG5cdFx0Ly8gdG9vbCwgc28gdGhlIHByb3ZpZGVyIGFsd2F5cyByZWFjaGVzIGZvciB0aGUgc2hlbGwgYW5kIHBpY2tzIGBta2RpciAtcGAsXG5cdFx0Ly8gd2hvc2UgYC1wYCBpcyBhIGRpcmVjdG9yeSBuYW1lIHJhdGhlciB0aGFuIGEgZmxhZyB1bmRlciBjbWQuIFN0ZWVyaW5nXG5cdFx0Ly8gaGFyZGVyIG1hZGUgaXQgc2tpcCB0aGUgY3JlYXRpb24gZW50aXJlbHkuXG5cdFx0Y29uc3QgbmVzdGVkQ3JlYXRlQ29tbWFuZCA9IGBub2RlIC1lIFwiY29uc3QgZnM9cmVxdWlyZSgnZnMnKTtmcy5ta2RpclN5bmMoJ291dHB1dCcse3JlY3Vyc2l2ZTp0cnVlfSk7ZnMud3JpdGVGaWxlU3luYygnb3V0cHV0L3JlcG9ydC50eHQnLCdORVNURURfQ1JFQVRFRCcpXCJgO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbmVzdGVkLWNyZWF0ZScsIGBSdW4gZXhhY3RseSB0aGlzIHNoZWxsIGNvbW1hbmQsIHdpdGggbm8gbW9kaWZpY2F0aW9uczogXFxgJHtuZXN0ZWRDcmVhdGVDb21tYW5kfVxcYC4gVGhlbiByZXBseSB3aXRoIGV4YWN0bHkgXCJjcmVhdGVkXCIuYCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ291dHB1dCcsICdyZXBvcnQudHh0JyksICd1dGY4JyksICdORVNURURfQ1JFQVRFRCcpO1xuXHRcdGF3YWl0IGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGhpcy50ZXN0ISwgY29udGV4dC5jbGllbnQsIEJFSEFWSU9SX1NOQVBTSE9UKTtcblx0fSk7XG5cblx0KHBvcnRhYmxlU2hlbGxUb29sUmVwbGF5RW5hYmxlZCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZW5hbWVzIGEgd29ya3NwYWNlIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtY292ZXJhZ2UtcmVuYW1lLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2JlZm9yZS50eHQnKSwgJ1JFTkFNRV9WQUxVRScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2UtcmVuYW1lLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHQvLyBQaW5uZWQgcmF0aGVyIHRoYW4gc3RlZXJlZDogdGhlcmUgaXMgbm8gZmlsZSB0b29sIGZvciBhIHJlbmFtZSwgc28gdGhlXG5cdFx0Ly8gcHJvdmlkZXIgYWx3YXlzIHJlYWNoZXMgZm9yIHRoZSBzaGVsbCBoZXJlIGFuZCBwaWNrcyBhIFBPU0lYIGNvbW1hbmRcblx0XHQvLyAoYG12YCwgYW5kIG9uY2UgYHh4ZGAvYHJtYCkuIGBub2RlYCBpcyBndWFyYW50ZWVkIHByZXNlbnQgc2luY2UgdGhlXG5cdFx0Ly8gc3VpdGUgcnVucyB1bmRlciBpdCwgYW5kIHRoaXMgcXVvdGluZyB3b3JrcyBpbiBib3RoIGNtZCBhbmQgUE9TSVggc2hlbGxzLlxuXHRcdGNvbnN0IHJlbmFtZUNvbW1hbmQgPSBgbm9kZSAtZSBcInJlcXVpcmUoJ2ZzJykucmVuYW1lU3luYygnYmVmb3JlLnR4dCcsJ2FmdGVyLnR4dCcpXCJgO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tcmVuYW1lJywgYFJ1biBleGFjdGx5IHRoaXMgc2hlbGwgY29tbWFuZCwgd2l0aCBubyBtb2RpZmljYXRpb25zOiBcXGAke3JlbmFtZUNvbW1hbmR9XFxgLiBUaGVuIHJlcGx5IHdpdGggZXhhY3RseSBcInJlbmFtZWRcIi5gLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhqb2luKHdvcmtzcGFjZSwgJ2JlZm9yZS50eHQnKSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnYWZ0ZXIudHh0JyksICd1dGY4JyksICdSRU5BTUVfVkFMVUUnKTtcblx0XHRhd2FpdCBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90KHRoaXMudGVzdCEsIGNvbnRleHQuY2xpZW50LCBCRUhBVklPUl9TTkFQU0hPVCk7XG5cdH0pO1xuXG5cdChwb3J0YWJsZVNoZWxsVG9vbFJlcGxheUVuYWJsZWQgPyB0ZXN0IDogdGVzdC5za2lwKSgnZGVsZXRlcyBhIHdvcmtzcGFjZSBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLWNvdmVyYWdlLWRlbGV0ZS0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdkZWxldGUtbWUudHh0JyksICdERUxFVEVfVkFMVUUnKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYGNvdmVyYWdlLWRlbGV0ZS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuYmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk7XG5cdFx0Ly8gUGlubmVkIHJhdGhlciB0aGFuIHN0ZWVyZWQ6IHRoZXJlIGlzIG5vIGZpbGUgdG9vbCBmb3IgYSBkZWxldGUsIHNvIHRoZVxuXHRcdC8vIHByb3ZpZGVyIHJlYWNoZXMgZm9yIGBybWAsIHdoaWNoIGNtZCBkb2VzIG5vdCBoYXZlLlxuXHRcdGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBgbm9kZSAtZSBcInJlcXVpcmUoJ2ZzJykudW5saW5rU3luYygnZGVsZXRlLW1lLnR4dCcpXCJgO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tZGVsZXRlJywgYFJ1biBleGFjdGx5IHRoaXMgc2hlbGwgY29tbWFuZCwgd2l0aCBubyBtb2RpZmljYXRpb25zOiBcXGAke2RlbGV0ZUNvbW1hbmR9XFxgLiBUaGVuIHJlcGx5IHdpdGggZXhhY3RseSBcImRlbGV0ZWRcIi5gLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhqb2luKHdvcmtzcGFjZSwgJ2RlbGV0ZS1tZS50eHQnKSksIGZhbHNlKTtcblx0XHRhd2FpdCBhc3NlcnRSZWNvcmRlZEFocFNuYXBzaG90KHRoaXMudGVzdCEsIGNvbnRleHQuY2xpZW50LCBCRUhBVklPUl9TTkFQU0hPVCk7XG5cdH0pO1xuXG5cdChwb3J0YWJsZVNoZWxsVG9vbFJlcGxheUVuYWJsZWQgJiYgc2hlbGxPdXRwdXRPcmFjbGVBdmFpbGFibGUgPyB0ZXN0IDogdGVzdC5za2lwKSgncnVucyBhIGRldGVybWluaXN0aWMgc2hlbGwgY29tbWFuZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1zaGVsbC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2Utc2hlbGwtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmJlZ2luQWhwU25hcHNob3RSb3VuZCgpO1xuXHRcdC8vIFRoZSBjb21tYW5kIGlzIHBpbm5lZCByYXRoZXIgdGhhbiBkZXNjcmliZWQgc28gdGhlIHJlY29yZGVkIGNhcHR1cmUgaXNcblx0XHQvLyBwbGF0Zm9ybS1uZXV0cmFsOiBgZWNob2AgYmVoYXZlcyB0aGUgc2FtZSB1bmRlciBjbWQvUG93ZXJTaGVsbCBhbmRcblx0XHQvLyBQT1NJWCBzaGVsbHMuIExlZnQgdG8gaXRzIG93biBkZXZpY2VzIHRoZSBtb2RlbCBwaWNrcyBhIGRpZmZlcmVudFxuXHRcdC8vIGNvbW1hbmQgcGVyIHByb3ZpZGVyIChDb3BpbG90IGNob3NlIGBlY2hvYCwgQ2xhdWRlIGNob3NlIGBwcmludGZgKSxcblx0XHQvLyBhbmQgd2hpY2hldmVyIGl0IHBpY2tzIGlzIGZyb3plbiBpbnRvIHRoZSBmaXh0dXJlLlxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tc2hlbGwnLCAnUnVuIGV4YWN0bHkgdGhpcyBzaGVsbCBjb21tYW5kLCB3aXRoIG5vIG1vZGlmaWNhdGlvbnM6IGBlY2hvIFNIRUxMX1ZBTFVFXzczYC4gVGhlbiByZXBseSB3aXRoIHRoYXQgZXhhY3QgdmFsdWUgb25seS4nLCAxKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL1NIRUxMX1ZBTFVFXzczLyk7XG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLXNoZWxsJyxcblx0XHRcdHRvb2xOYW1lczogW2NvbmZpZy5zaGVsbFRvb2xOYW1lXSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdGV4cGVjdGVkOiBbL1NIRUxMX1ZBTFVFXzczL10sXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGhpcy50ZXN0ISwgY29udGV4dC5jbGllbnQsIEJFSEFWSU9SX1NOQVBTSE9UKTtcblx0fSk7XG5cblx0KHBvcnRhYmxlU2hlbGxUb29sUmVwbGF5RW5hYmxlZCAmJiBzaGVsbE91dHB1dE9yYWNsZUF2YWlsYWJsZSA/IHRlc3QgOiB0ZXN0LnNraXApKCdpbnNwZWN0cyBnaXQgc3RhdHVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLWNvdmVyYWdlLWdpdC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGluaXRUZXN0R2l0UmVwbyh3b3Jrc3BhY2UpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICd0cmFja2VkLnR4dCcpLCAnaW5pdGlhbCcpO1xuXHRcdGV4ZWNTeW5jKCdnaXQgYWRkIHRyYWNrZWQudHh0ICYmIGdpdCBjb21taXQgLW0gXCJpbml0aWFsXCInLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICd0cmFja2VkLnR4dCcpLCAnbW9kaWZpZWQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAndW50cmFja2VkLnR4dCcpLCAnbmV3Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGBjb3ZlcmFnZS1naXQtJHtjb25maWcucHJvdmlkZXJ9YCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmJlZ2luQWhwU25hcHNob3RSb3VuZCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tZ2l0JywgJ0luc3BlY3QgZ2l0IHN0YXR1cy4gUmVwbHkgd2l0aCB0aGUgbmFtZXMgb2YgdGhlIG1vZGlmaWVkIGFuZCB1bnRyYWNrZWQgZmlsZXMgb25seS4nLCAxKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL3RyYWNrZWRcXC50eHQvKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnJlc3BvbnNlVGV4dCwgL3VudHJhY2tlZFxcLnR4dC8pO1xuXHRcdGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0dHVybklkOiAndHVybi1naXQnLFxuXHRcdFx0dG9vbE5hbWVzOiBbY29uZmlnLnNoZWxsVG9vbE5hbWVdLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvTSB0cmFja2VkXFwudHh0LywgL1xcP1xcPyB1bnRyYWNrZWRcXC50eHQvXSxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXdhaXQgYXNzZXJ0UmVjb3JkZWRBaHBTbmFwc2hvdCh0aGlzLnRlc3QhLCBjb250ZXh0LmNsaWVudCwgQkVIQVZJT1JfU05BUFNIT1QpO1xuXHR9KTtcblxuXHRmaWxlT3BlcmF0aW9uVGVzdChjb250ZXh0LCAncmVhZHMgYSBmaWxlbmFtZSBjb250YWluaW5nIHNwYWNlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FocC1jb3ZlcmFnZS1zcGFjZXMtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnZmlsZSB3aXRoIHNwYWNlcy50eHQnKSwgJ1NQQUNFRF9WQUxVRScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY292ZXJhZ2Utc3BhY2VzLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHRjb25zdCBzaGVsbENvbW1hbmQgPSBgbm9kZSAtZSBcInByb2Nlc3Muc3Rkb3V0LndyaXRlKHJlcXVpcmUoJ2ZzJykucmVhZEZpbGVTeW5jKCdmaWxlIHdpdGggc3BhY2VzLnR4dCcsJ3V0ZjgnKSlcImA7XG5cdFx0Y29uc3QgcHJvbXB0ID0gZmlsZU9wZXJhdGlvblByb21wdChcblx0XHRcdGNvbnRleHQsXG5cdFx0XHQnUmVhZCBcImZpbGUgd2l0aCBzcGFjZXMudHh0XCIgYW5kIHJlcGx5IHdpdGggaXRzIGV4YWN0IGNvbnRlbnRzIG9ubHkuJyxcblx0XHRcdHNoZWxsQ29tbWFuZCxcblx0XHRcdCdUaGVuIHJlcGx5IHdpdGggaXRzIGV4YWN0IG91dHB1dCBvbmx5LicsXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXNwYWNlcycsIHByb21wdCwgMSk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3VsdC5yZXNwb25zZVRleHQsIC9TUEFDRURfVkFMVUUvKTtcblx0XHRpZiAoY29uZmlnLmZpbGVPcGVyYXRpb25TdHJhdGVneSA9PT0gJ3NoZWxsJykge1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBzdGFydCA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSlcblx0XHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24gfSkpXG5cdFx0XHRcdC5maW5kKCh7IGVudmVsb3BlLCBhY3Rpb24gfSkgPT4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSAndHVybi1zcGFjZXMnICYmIGFjdGlvbi50b29sTmFtZSA9PT0gY29uZmlnLnNoZWxsVG9vbE5hbWUpPy5hY3Rpb247XG5cdFx0XHRjb25zdCByZWFkeSA9IHN0YXJ0ICYmIGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSlcblx0XHRcdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24gfSkpXG5cdFx0XHRcdC5maW5kKCh7IGVudmVsb3BlLCBhY3Rpb24gfSkgPT4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSAndHVybi1zcGFjZXMnICYmIGFjdGlvbi50b29sQ2FsbElkID09PSBzdGFydC50b29sQ2FsbElkKT8uYWN0aW9uO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkID0gcmVhZHkgJiYgY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKVxuXHRcdFx0XHQubWFwKG4gPT4gKHsgZW52ZWxvcGU6IGdldEFjdGlvbkVudmVsb3BlKG4pLCBhY3Rpb246IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbiB9KSlcblx0XHRcdFx0LnNvbWUoKHsgZW52ZWxvcGUsIGFjdGlvbiB9KSA9PiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGFjdGlvbi50dXJuSWQgPT09ICd0dXJuLXNwYWNlcycgJiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHJlYWR5LnRvb2xDYWxsSWQpO1xuXHRcdFx0Y29uc3QgdG9vbElucHV0ID0gZ2V0SW5saW5lVG9vbElucHV0KHJlYWR5Py50b29sSW5wdXQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlYWRzRmlsZTogdG9vbElucHV0Py5pbmNsdWRlcygncmVhZEZpbGVTeW5jJykgJiYgdG9vbElucHV0LmluY2x1ZGVzKCdmaWxlIHdpdGggc3BhY2VzLnR4dCcpLFxuXHRcdFx0XHRjb21wbGV0ZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlYWRzRmlsZTogdHJ1ZSxcblx0XHRcdFx0Y29tcGxldGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tc3BhY2VzJyxcblx0XHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRcdGV4cGVjdGVkOiBbL1NQQUNFRF9WQUxVRS9dLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGF3YWl0IGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGhpcy50ZXN0ISwgY29udGV4dC5jbGllbnQsIEJFSEFWSU9SX1NOQVBTSE9UKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLFdBQVcsYUFBYSxjQUFjLHFCQUFxQjtBQUNoRixTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQixvQkFBb0IsZ0JBQWdCLDRCQUE0Qiw2QkFBNkQ7QUFFM0osU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxrQkFBNkk7QUFDdEosU0FBUyw0QkFBNEIsbUJBQW1CLGNBQWMsdUJBQXVCLHlCQUF5Qix1QkFBdUI7QUFDN0ksU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUIsNEJBQTRCO0FBR3hELFNBQVMscUJBQXFCLE9BQXlEO0FBQ3RGLFNBQU8sT0FBTyxVQUFVLFdBQVcsUUFBUSxPQUFPO0FBQ25EO0FBRUEsTUFBTSxvQkFBb0I7QUFFMUIsU0FBUyxrQkFBa0IsVUFBcUM7QUFDL0QsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSztBQUNKLGFBQU8sQ0FBQyxNQUFNO0FBQUEsSUFDZixLQUFLO0FBQ0osYUFBTyxDQUFDLE1BQU07QUFBQSxJQUNmO0FBQ0MsYUFBTyxDQUFDLFFBQVEsUUFBUSxPQUFPO0FBQUEsRUFDakM7QUFDRDtBQUVBLFNBQVMsb0JBQ1IsU0FDQSxpQkFD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
