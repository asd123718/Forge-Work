import assert from "assert";
import { execSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ActionType, NotificationType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import { CopilotCliConfigKey } from "../../../../common/copilotCliConfig.js";
import {
  dispatchTurn,
  driveTurnToCompletion,
  resolveGitHubToken,
  startBackgroundApprovalLoop,
  terminalResourceFromContent,
  terminalText,
  textFromContent,
  initTestGitRepo
} from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
function defineWorkspaceTests(context) {
  const PRINT_CWD_COMMAND = `node -e "console.log(process.cwd())"`;
  const { config, createdSessions, tempDirs, portableShellToolReplayEnabled, isWindows } = context;
  test("session is created with the correct working directory", async function() {
    this.timeout(12e4);
    const tempDir = mkdtempSync(`${tmpdir()}/ahp-test-`);
    tempDirs.push(tempDir);
    const workingDirUri = URI.file(tempDir).toString();
    context.client.setWorkingDirectory(tempDir);
    await context.client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-workdir-${config.provider}` }, 3e4);
    await context.client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: resolveGitHubToken() }, 3e4);
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", { channel: sessionUri, provider: config.provider, workingDirectories: [workingDirUri] }, 3e4);
    createdSessions.push(sessionUri);
    const subscribeResult = await context.client.call("subscribe", { channel: sessionUri }, 3e4);
    const sessionState = subscribeResult.snapshot.state;
    assert.strictEqual(
      sessionState.workingDirectories?.[0],
      workingDirUri,
      `subscribe snapshot summary should carry the requested working directory`
    );
  });
  (context.runKnownIssueTests && config.supportsWorktreeIncludeFilesE2E ? test : test.skip)("worktree materialization copies configured ignored files", async function() {
    this.timeout(18e4);
    const repository = mkdtempSync(`${tmpdir()}/ahp-wt-include-`);
    tempDirs.push(repository, `${repository}.worktrees`);
    initTestGitRepo(repository);
    writeFileSync(`${repository}/tracked.txt`, "tracked");
    writeFileSync(`${repository}/.gitignore`, ".env\nignored-dir/\n");
    writeFileSync(`${repository}/.env`, "SECRET=worktree-value\n");
    mkdirSync(`${repository}/ignored-dir`);
    writeFileSync(`${repository}/ignored-dir/config.json`, '{"included":true}\n');
    execSync("git add tracked.txt .gitignore", { cwd: repository });
    execSync('git commit -m "init"', { cwd: repository });
    const branch = execSync("git branch --show-current", { cwd: repository, encoding: "utf8" }).trim();
    context.client.setWorkingDirectory(repository);
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `worktree-include-${config.provider}`
    });
    await context.client.call("authenticate", {
      channel: ROOT_STATE_URI,
      resource: "https://api.github.com",
      token: resolveGitHubToken()
    });
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: [URI.file(repository).toString()],
      config: {
        isolation: "worktree",
        branch,
        worktreeIncludeFiles: [".env", "ignored-dir/**"]
      }
    });
    createdSessions.push(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    await driveTurnToCompletion(context.client, sessionUri, "turn-worktree-include", 'Reply exactly "materialized".', 1);
    const state = (await context.client.call("subscribe", { channel: sessionUri })).snapshot.state;
    const worktree = URI.parse(state.workingDirectories[0]).fsPath;
    assert.deepStrictEqual({
      env: readFileSync(`${worktree}/.env`, "utf8"),
      config: readFileSync(`${worktree}/ignored-dir/config.json`, "utf8")
    }, {
      env: "SECRET=worktree-value\n",
      config: '{"included":true}\n'
    });
  });
  (config.supportsWorktreeIsolation && !isWindows && portableShellToolReplayEnabled && !config.shellToolResultTextUnreliable ? test : test.skip)("worktree session uses the resolved worktree as working directory", async function() {
    this.timeout(12e4);
    const tempDir = mkdtempSync(`${tmpdir()}/ahp-wt-test-`);
    tempDirs.push(tempDir, `${tempDir}.worktrees`);
    initTestGitRepo(tempDir);
    execSync('git commit --allow-empty -m "init"', { cwd: tempDir });
    const defaultBranch = execSync("git branch --show-current", { cwd: tempDir, encoding: "utf-8" }).trim();
    const workingDirUri = URI.file(tempDir).toString();
    context.client.setWorkingDirectory(tempDir);
    await context.client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `real-sdk-worktree-${config.provider}` });
    await context.client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: resolveGitHubToken() });
    if (config.supportsHostTerminalTool) {
      context.client.dispatch({
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: { type: ActionType.RootConfigChanged, config: { [CopilotCliConfigKey.EnableCustomTerminalTool]: true } }
      });
    }
    const addedNotification = context.client.waitForNotification(
      (n) => n.method === NotificationType.SessionAdded,
      6e4
    );
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      workingDirectories: [workingDirUri],
      config: { isolation: "worktree", branch: defaultBranch }
    });
    createdSessions.push(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: `real-sdk-worktree-${config.provider}`,
          displayName: "Test Client",
          tools: [{
            name: "test_echo",
            description: "A harmless echo tool for testing",
            inputSchema: { type: "object", properties: { message: { type: "string" } } }
          }]
        }
      }
    });
    context.client.clearReceived();
    dispatchTurn(
      context.client,
      sessionUri,
      "turn-wt",
      "What is your current working directory? Reply with just the absolute path and nothing else.",
      2
    );
    const addedNotif = await addedNotification;
    const addedSummary = addedNotif.params.summary;
    const addedWorkingDirectory = addedSummary.workingDirectories?.[0];
    assert.ok(addedWorkingDirectory, "sessionAdded notification should have a workingDirectory");
    assert.ok(
      addedWorkingDirectory.includes(".worktrees"),
      `workingDirectory should be under the .worktrees folder, got: ${addedWorkingDirectory}`
    );
    const resolvedWorkingDirectoryPath = URI.parse(addedWorkingDirectory).fsPath;
    const canonicalWorkingDirectoryPath = realpathSync(resolvedWorkingDirectoryPath);
    const includesWorkingDirectoryPath = (text) => text.includes(resolvedWorkingDirectoryPath) || text.includes(canonicalWorkingDirectoryPath);
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") || isActionNotification(n, "chat/error"),
      9e4
    );
    const errors = context.client.receivedNotifications((n) => isActionNotification(n, "chat/error"));
    assert.strictEqual(
      errors.length,
      0,
      errors.length > 0 ? `Session error during turn (worktree path lost on resume): ${getActionEnvelope(errors[0]).action.error?.message}` : ""
    );
    const responseParts = context.client.receivedNotifications((n) => isActionNotification(n, "chat/responsePart"));
    assert.ok(responseParts.length > 0, "should have received at least one response part after session refresh");
    if (!config.supportsHostTerminalTool) {
      const approvalLoop2 = startBackgroundApprovalLoop(context.client, {
        approvalSeqStart: 100,
        allow: [{ toolName: config.shellToolName }]
      });
      try {
        context.client.clearReceived();
        dispatchTurn(context.client, addedSummary.resource, "turn-wt-terminal", `Run exactly this shell command, with no modifications, in the session current working directory: \`${PRINT_CWD_COMMAND}\`. Do not specify a working-directory override.`, 3);
        const pwdNotif = await context.client.waitForNotification((n) => {
          if (isActionNotification(n, "chat/toolCallContentChanged")) {
            const action = getActionEnvelope(n).action;
            return includesWorkingDirectoryPath(textFromContent(action.content));
          }
          if (isActionNotification(n, "chat/toolCallComplete")) {
            const action = getActionEnvelope(n).action;
            return includesWorkingDirectoryPath(textFromContent(action.result.content ?? []));
          }
          return false;
        }, 9e4);
        const pwdText = isActionNotification(pwdNotif, "chat/toolCallComplete") ? textFromContent(getActionEnvelope(pwdNotif).action.result.content ?? []) : textFromContent(getActionEnvelope(pwdNotif).action.content);
        assert.ok(
          includesWorkingDirectoryPath(pwdText),
          `pwd output should include the resolved worktree path ${resolvedWorkingDirectoryPath} (${canonicalWorkingDirectoryPath})`
        );
      } finally {
        await approvalLoop2.stop();
      }
      assert.deepStrictEqual(approvalLoop2.errors, [], "no unexpected tool calls should have been denied");
      await context.client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"), 9e4);
      return;
    }
    context.client.clearReceived();
    const approvalLoop = startBackgroundApprovalLoop(context.client, {
      approvalSeqStart: 100,
      allow: [{ toolName: config.shellToolName }]
    });
    try {
      dispatchTurn(context.client, addedSummary.resource, "turn-wt-terminal", `Run exactly this shell command, with no modifications: \`${PRINT_CWD_COMMAND}\``, 3);
      const toolStartNotif = await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "chat/toolCallStart")) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        return action.turnId === "turn-wt-terminal" && action.toolName === config.shellToolName;
      }, 6e4);
      const toolCallId = getActionEnvelope(toolStartNotif).action.toolCallId;
      const terminalContentNotif = await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "chat/toolCallContentChanged")) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        return action.turnId === "turn-wt-terminal" && action.toolCallId === toolCallId && terminalResourceFromContent(action.content) !== void 0;
      }, 6e4);
      const terminalContentAction = getActionEnvelope(terminalContentNotif).action;
      const terminalUri = terminalResourceFromContent(terminalContentAction.content);
      assert.ok(terminalUri, "shell tool should expose its terminal resource");
      const terminalSubscribeResult = await context.client.call("subscribe", { channel: terminalUri });
      const initialTerminalState = terminalSubscribeResult.snapshot.state;
      assert.ok(initialTerminalState.cwd, "terminal should report its working directory");
      assert.strictEqual(realpathSync(initialTerminalState.cwd), canonicalWorkingDirectoryPath, "terminal should be created in the resolved worktree directory");
      await context.client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"), 9e4);
      const terminalSnapshot = await context.client.call("subscribe", { channel: terminalUri });
      const terminalState = terminalSnapshot.snapshot.state;
      assert.ok(
        includesWorkingDirectoryPath(terminalText(terminalState)),
        `working directory output should include the resolved worktree path ${resolvedWorkingDirectoryPath} (${canonicalWorkingDirectoryPath})`
      );
    } finally {
      await approvalLoop.stop();
    }
    assert.deepStrictEqual(approvalLoop.errors, [], "no unexpected tool calls should have been denied");
  });
}
export {
  defineWorkspaceTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcd29ya3NwYWNlU3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgcmVhZEZpbGVTeW5jLCByZWFscGF0aFN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIE5vdGlmaWNhdGlvblR5cGUsIHR5cGUgSVRvb2xDYWxsQ29udGVudENoYW5nZWRBY3Rpb24sIHR5cGUgSVRvb2xDYWxsU3RhcnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQWRkZWRQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBST09UX1NUQVRFX1VSSSwgdHlwZSBTZXNzaW9uU3RhdGUsIHR5cGUgVGVybWluYWxTdGF0ZSwgdHlwZSBUb29sUmVzdWx0Q29udGVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ29waWxvdENsaUNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7XG5cdGRpc3BhdGNoVHVybixcblx0ZHJpdmVUdXJuVG9Db21wbGV0aW9uLFxuXHRyZXNvbHZlR2l0SHViVG9rZW4sXG5cdHN0YXJ0QmFja2dyb3VuZEFwcHJvdmFsTG9vcCxcblx0dGVybWluYWxSZXNvdXJjZUZyb21Db250ZW50LFxuXHR0ZXJtaW5hbFRleHQsXG5cdHRleHRGcm9tQ29udGVudCxcblx0aW5pdFRlc3RHaXRSZXBvLFxufSBmcm9tICcuLi9oYXJuZXNzL2FnZW50SG9zdEUyRVRlc3RIYXJuZXNzLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQgfSBmcm9tICcuL2UyZVRlc3RDb250ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZVdvcmtzcGFjZVRlc3RzKGNvbnRleHQ6IElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCk6IHZvaWQge1xuXHQvKipcblx0ICogUHJpbnRzIHRoZSBzaGVsbCdzIHdvcmtpbmcgZGlyZWN0b3J5LlxuXHQgKlxuXHQgKiBQaW5uZWQgbGlrZSBldmVyeSBvdGhlciBzaGVsbCBjb21tYW5kIGluIHRoZSBzdWl0ZS4gYG5vZGVgIGlzIGd1YXJhbnRlZWRcblx0ICogcHJlc2VudCBzaW5jZSB0aGUgc3VpdGUgcnVucyB1bmRlciBpdCwgYW5kIGBjb25zb2xlLmxvZ2Agd3JpdGVzIHRoZSByYXdcblx0ICogcGF0aCBcdTIwMTQgUG93ZXJTaGVsbCdzIGBwd2RgIHJldHVybnMgYSBgUGF0aEluZm9gIHRoZSBjb25zb2xlIHJlbmRlcnMgYXMgYVxuXHQgKiBmb3JtYXR0ZWQgdGFibGUsIHdoaWNoIGNhbiB3cmFwIGEgbG9uZyB0ZW1wIHBhdGguXG5cdCAqL1xuXHRjb25zdCBQUklOVF9DV0RfQ09NTUFORCA9IGBub2RlIC1lIFwiY29uc29sZS5sb2cocHJvY2Vzcy5jd2QoKSlcImA7XG5cdGNvbnN0IHsgY29uZmlnLCBjcmVhdGVkU2Vzc2lvbnMsIHRlbXBEaXJzLCBwb3J0YWJsZVNoZWxsVG9vbFJlcGxheUVuYWJsZWQsIGlzV2luZG93cyB9ID0gY29udGV4dDtcblx0dGVzdCgnc2Vzc2lvbiBpcyBjcmVhdGVkIHdpdGggdGhlIGNvcnJlY3Qgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEyMF8wMDApO1xuXG5cdFx0Y29uc3QgdGVtcERpciA9IG1rZHRlbXBTeW5jKGAke3RtcGRpcigpfS9haHAtdGVzdC1gKTtcblx0XHR0ZW1wRGlycy5wdXNoKHRlbXBEaXIpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJVcmkgPSBVUkkuZmlsZSh0ZW1wRGlyKS50b1N0cmluZygpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuc2V0V29ya2luZ0RpcmVjdG9yeSh0ZW1wRGlyKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbml0aWFsaXplJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgcHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLCBjbGllbnRJZDogYHJlYWwtc2RrLXdvcmtkaXItJHtjb25maWcucHJvdmlkZXJ9YCB9LCAzMF8wMDApO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiByZXNvbHZlR2l0SHViVG9rZW4oKSB9LCAzMF8wMDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBjb25maWcuc2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7IGNoYW5uZWw6IHNlc3Npb25VcmksIHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsIHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtpbmdEaXJVcmldIH0sIDMwXzAwMCk7XG5cdFx0Y3JlYXRlZFNlc3Npb25zLnB1c2goc2Vzc2lvblVyaSk7XG5cblx0XHRjb25zdCBzdWJzY3JpYmVSZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9LCAzMF8wMDApO1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHN1YnNjcmliZVJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uU3RhdGUud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0sIHdvcmtpbmdEaXJVcmksXG5cdFx0XHRgc3Vic2NyaWJlIHNuYXBzaG90IHN1bW1hcnkgc2hvdWxkIGNhcnJ5IHRoZSByZXF1ZXN0ZWQgd29ya2luZyBkaXJlY3RvcnlgKTtcblx0fSk7XG5cblx0KGNvbnRleHQucnVuS25vd25Jc3N1ZVRlc3RzICYmIGNvbmZpZy5zdXBwb3J0c1dvcmt0cmVlSW5jbHVkZUZpbGVzRTJFID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3dvcmt0cmVlIG1hdGVyaWFsaXphdGlvbiBjb3BpZXMgY29uZmlndXJlZCBpZ25vcmVkIGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gbWtkdGVtcFN5bmMoYCR7dG1wZGlyKCl9L2FocC13dC1pbmNsdWRlLWApO1xuXHRcdHRlbXBEaXJzLnB1c2gocmVwb3NpdG9yeSwgYCR7cmVwb3NpdG9yeX0ud29ya3RyZWVzYCk7XG5cdFx0aW5pdFRlc3RHaXRSZXBvKHJlcG9zaXRvcnkpO1xuXHRcdHdyaXRlRmlsZVN5bmMoYCR7cmVwb3NpdG9yeX0vdHJhY2tlZC50eHRgLCAndHJhY2tlZCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoYCR7cmVwb3NpdG9yeX0vLmdpdGlnbm9yZWAsICcuZW52XFxuaWdub3JlZC1kaXIvXFxuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhgJHtyZXBvc2l0b3J5fS8uZW52YCwgJ1NFQ1JFVD13b3JrdHJlZS12YWx1ZVxcbicpO1xuXHRcdG1rZGlyU3luYyhgJHtyZXBvc2l0b3J5fS9pZ25vcmVkLWRpcmApO1xuXHRcdHdyaXRlRmlsZVN5bmMoYCR7cmVwb3NpdG9yeX0vaWdub3JlZC1kaXIvY29uZmlnLmpzb25gLCAne1wiaW5jbHVkZWRcIjp0cnVlfVxcbicpO1xuXHRcdGV4ZWNTeW5jKCdnaXQgYWRkIHRyYWNrZWQudHh0IC5naXRpZ25vcmUnLCB7IGN3ZDogcmVwb3NpdG9yeSB9KTtcblx0XHRleGVjU3luYygnZ2l0IGNvbW1pdCAtbSBcImluaXRcIicsIHsgY3dkOiByZXBvc2l0b3J5IH0pO1xuXHRcdGNvbnN0IGJyYW5jaCA9IGV4ZWNTeW5jKCdnaXQgYnJhbmNoIC0tc2hvdy1jdXJyZW50JywgeyBjd2Q6IHJlcG9zaXRvcnksIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuXHRcdGNvbnRleHQuY2xpZW50LnNldFdvcmtpbmdEaXJlY3RvcnkocmVwb3NpdG9yeSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6IGB3b3JrdHJlZS1pbmNsdWRlLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnYXV0aGVudGljYXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLFxuXHRcdFx0dG9rZW46IHJlc29sdmVHaXRIdWJUb2tlbigpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogY29uZmlnLnNjaGVtZSwgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSkudG9TdHJpbmcoKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZShyZXBvc2l0b3J5KS50b1N0cmluZygpXSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRpc29sYXRpb246ICd3b3JrdHJlZScsXG5cdFx0XHRcdGJyYW5jaCxcblx0XHRcdFx0d29ya3RyZWVJbmNsdWRlRmlsZXM6IFsnLmVudicsICdpZ25vcmVkLWRpci8qKiddLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSB9KTtcblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXdvcmt0cmVlLWluY2x1ZGUnLCAnUmVwbHkgZXhhY3RseSBcIm1hdGVyaWFsaXplZFwiLicsIDEpO1xuXHRcdGNvbnN0IHN0YXRlID0gKGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pKS5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlO1xuXHRcdGNvbnN0IHdvcmt0cmVlID0gVVJJLnBhcnNlKHN0YXRlLndvcmtpbmdEaXJlY3RvcmllcyFbMF0pLmZzUGF0aDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW52OiByZWFkRmlsZVN5bmMoYCR7d29ya3RyZWV9Ly5lbnZgLCAndXRmOCcpLFxuXHRcdFx0Y29uZmlnOiByZWFkRmlsZVN5bmMoYCR7d29ya3RyZWV9L2lnbm9yZWQtZGlyL2NvbmZpZy5qc29uYCwgJ3V0ZjgnKSxcblx0XHR9LCB7XG5cdFx0XHRlbnY6ICdTRUNSRVQ9d29ya3RyZWUtdmFsdWVcXG4nLFxuXHRcdFx0Y29uZmlnOiAne1wiaW5jbHVkZWRcIjp0cnVlfVxcbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFNraXBwZWQgb24gV2luZG93cy4gVGhlIGNvbW1hbmQgYW5kIHRoZSB0b29sIG5hbWUgYXJlIHBvcnRhYmxlIG5vdywgYnV0IHRoZVxuXHQvLyBob3N0IHRlcm1pbmFsIGFzc2VydGlvbiBpcyBub3QsIGZvciBhIHJlYXNvbiBDSSBzdXJmYWNlZCB0aGF0IGlzIHNwZWNpZmljXG5cdC8vIHRvIHRoaXMgdGVzdCByYXRoZXIgdGhhbiB0byBjb21tYW5kIHBvcnRhYmlsaXR5OlxuXHQvL1xuXHQvLyAgLSBUaGUgaG9zdCB0ZXJtaW5hbCB0b29sIHN1cmZhY2VzIG5vIGBjaGF0L3Rvb2xDYWxsQ29udGVudENoYW5nZWRgIG9uXG5cdC8vICAgIFdpbmRvd3MsIHNvIHRoZSB0ZXJtaW5hbCByZXNvdXJjZSB0aGlzIHRlc3Qgc3Vic2NyaWJlcyB0byBuZXZlciBhcHBlYXJzLFxuXHQvLyAgICBldmVuIHRob3VnaCB0aGUgdG9vbCBjYWxsIGl0c2VsZiBjb21wbGV0ZXMuXG5cdC8vXG5cdC8vIFJlLWVuYWJsaW5nIG9uIFdpbmRvd3MgbmVlZHMgdGhlIG1pc3NpbmcgdGVybWluYWwgcmVzb3VyY2UgdW5kZXJzdG9vZC5cblx0KGNvbmZpZy5zdXBwb3J0c1dvcmt0cmVlSXNvbGF0aW9uICYmICFpc1dpbmRvd3MgJiYgcG9ydGFibGVTaGVsbFRvb2xSZXBsYXlFbmFibGVkICYmICFjb25maWcuc2hlbGxUb29sUmVzdWx0VGV4dFVucmVsaWFibGUgPyB0ZXN0IDogdGVzdC5za2lwKSgnd29ya3RyZWUgc2Vzc2lvbiB1c2VzIHRoZSByZXNvbHZlZCB3b3JrdHJlZSBhcyB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCB0ZW1wRGlyID0gbWtkdGVtcFN5bmMoYCR7dG1wZGlyKCl9L2FocC13dC10ZXN0LWApO1xuXHRcdHRlbXBEaXJzLnB1c2godGVtcERpciwgYCR7dGVtcERpcn0ud29ya3RyZWVzYCk7XG5cdFx0aW5pdFRlc3RHaXRSZXBvKHRlbXBEaXIpO1xuXHRcdGV4ZWNTeW5jKCdnaXQgY29tbWl0IC0tYWxsb3ctZW1wdHkgLW0gXCJpbml0XCInLCB7IGN3ZDogdGVtcERpciB9KTtcblx0XHRjb25zdCBkZWZhdWx0QnJhbmNoID0gZXhlY1N5bmMoJ2dpdCBicmFuY2ggLS1zaG93LWN1cnJlbnQnLCB7IGN3ZDogdGVtcERpciwgZW5jb2Rpbmc6ICd1dGYtOCcgfSkudHJpbSgpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJVcmkgPSBVUkkuZmlsZSh0ZW1wRGlyKS50b1N0cmluZygpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuc2V0V29ya2luZ0RpcmVjdG9yeSh0ZW1wRGlyKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbml0aWFsaXplJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgcHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLCBjbGllbnRJZDogYHJlYWwtc2RrLXdvcmt0cmVlLSR7Y29uZmlnLnByb3ZpZGVyfWAgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnYXV0aGVudGljYXRlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgdG9rZW46IHJlc29sdmVHaXRIdWJUb2tlbigpIH0pO1xuXG5cdFx0Ly8gVGhlIGhvc3QncyBjdXN0b20gdGVybWluYWwgdG9vbCBpcyBvcHQtaW4gKGRlZmF1bHQgb2ZmKSBhbmQgb25seVxuXHRcdC8vIENvcGlsb3Qgcm91dGVzIHNoZWxsIGNvbW1hbmRzIHRocm91Z2ggaXQuIFdoZW4gdGhlIHByb3ZpZGVyXG5cdFx0Ly8gc3VwcG9ydHMgaXQsIHRoaXMgdGVzdCBhZGRpdGlvbmFsbHkgYXNzZXJ0cyBvbiB0aGUgaG9zdC1tYW5hZ2VkXG5cdFx0Ly8gdGVybWluYWwncyBjd2QgLyBgcHdkYCBvdXRwdXQsIHNvIGVuYWJsZSBpdCBiZWZvcmUgdGhlIHNlc3Npb25cblx0XHQvLyBtYXRlcmlhbGl6ZXMgb24gdGhlIGZpcnN0IHR1cm4gZGlzcGF0Y2guIENvZGV4IC8gQ2xhdWRlIHJ1biBzaGVsbFxuXHRcdC8vIGNvbW1hbmRzIGluc2lkZSB0aGVpciBvd24gU0RLIHN1YnByb2Nlc3MgYW5kIG5ldmVyIHN1cmZhY2UgYSBob3N0XG5cdFx0Ly8gdGVybWluYWwgcmVzb3VyY2UsIHNvIHRoZXkgdmVyaWZ5IGlzb2xhdGlvbiB2aWEgdGhlIHJlc29sdmVkXG5cdFx0Ly8gd29ya2luZyBkaXJlY3RvcnkgYWxvbmUuXG5cdFx0aWYgKGNvbmZpZy5zdXBwb3J0c0hvc3RUZXJtaW5hbFRvb2wpIHtcblx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdGNsaWVudFNlcTogMCxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyBbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdOiB0cnVlIH0gfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGVkTm90aWZpY2F0aW9uID0gY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRuLm1ldGhvZCA9PT0gTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uQWRkZWQsXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IGNvbmZpZy5zY2hlbWUsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksIHByb3ZpZGVyOiBjb25maWcucHJvdmlkZXIsIHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtpbmdEaXJVcmldLFxuXHRcdFx0Y29uZmlnOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiBkZWZhdWx0QnJhbmNoIH0sXG5cdFx0fSk7XG5cdFx0Y3JlYXRlZFNlc3Npb25zLnB1c2goc2Vzc2lvblVyaSk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHQvLyBDb252ZXJzYXRpb24gY29udGVudHMgKHR1cm5zLCB0b29sIGNhbGxzLCBcdTIwMjYpIGxpdmUgb24gdGhlXG5cdFx0Ly8gc2Vzc2lvbidzIGRlZmF1bHQgY2hhdCBjaGFubmVsIGluIHRoZSBtdWx0aS1jaGF0IHByb3RvY29sO1xuXHRcdC8vIHN1YnNjcmliZSB0byBpdCBzbyBgY2hhdC8qYCBhY3Rpb24gbm90aWZpY2F0aW9ucyBhcmUgZGVsaXZlcmVkLlxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpIH0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiBgcmVhbC1zZGstd29ya3RyZWUtJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgQ2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICd0ZXN0X2VjaG8nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIGhhcm1sZXNzIGVjaG8gdG9vbCBmb3IgdGVzdGluZycsXG5cdFx0XHRcdFx0XHRpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBtZXNzYWdlOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSB9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXd0Jyxcblx0XHRcdCdXaGF0IGlzIHlvdXIgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeT8gUmVwbHkgd2l0aCBqdXN0IHRoZSBhYnNvbHV0ZSBwYXRoIGFuZCBub3RoaW5nIGVsc2UuJywgMik7XG5cblx0XHRjb25zdCBhZGRlZE5vdGlmID0gYXdhaXQgYWRkZWROb3RpZmljYXRpb247XG5cdFx0Y29uc3QgYWRkZWRTdW1tYXJ5ID0gKGFkZGVkTm90aWYucGFyYW1zIGFzIFNlc3Npb25BZGRlZFBhcmFtcykuc3VtbWFyeTtcblxuXHRcdGNvbnN0IGFkZGVkV29ya2luZ0RpcmVjdG9yeSA9IGFkZGVkU3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRhc3NlcnQub2soYWRkZWRXb3JraW5nRGlyZWN0b3J5LCAnc2Vzc2lvbkFkZGVkIG5vdGlmaWNhdGlvbiBzaG91bGQgaGF2ZSBhIHdvcmtpbmdEaXJlY3RvcnknKTtcblx0XHRhc3NlcnQub2soYWRkZWRXb3JraW5nRGlyZWN0b3J5LmluY2x1ZGVzKCcud29ya3RyZWVzJyksXG5cdFx0XHRgd29ya2luZ0RpcmVjdG9yeSBzaG91bGQgYmUgdW5kZXIgdGhlIC53b3JrdHJlZXMgZm9sZGVyLCBnb3Q6ICR7YWRkZWRXb3JraW5nRGlyZWN0b3J5fWApO1xuXHRcdGNvbnN0IHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeVBhdGggPSBVUkkucGFyc2UoYWRkZWRXb3JraW5nRGlyZWN0b3J5KS5mc1BhdGg7XG5cdFx0Y29uc3QgY2Fub25pY2FsV29ya2luZ0RpcmVjdG9yeVBhdGggPSByZWFscGF0aFN5bmMocmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5UGF0aCk7XG5cdFx0Y29uc3QgaW5jbHVkZXNXb3JraW5nRGlyZWN0b3J5UGF0aCA9ICh0ZXh0OiBzdHJpbmcpOiBib29sZWFuID0+XG5cdFx0XHR0ZXh0LmluY2x1ZGVzKHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeVBhdGgpIHx8IHRleHQuaW5jbHVkZXMoY2Fub25pY2FsV29ya2luZ0RpcmVjdG9yeVBhdGgpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihcblx0XHRcdG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSxcblx0XHRcdDkwXzAwMCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgZXJyb3JzID0gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDAsXG5cdFx0XHRlcnJvcnMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IGBTZXNzaW9uIGVycm9yIGR1cmluZyB0dXJuICh3b3JrdHJlZSBwYXRoIGxvc3Qgb24gcmVzdW1lKTogJHsoZ2V0QWN0aW9uRW52ZWxvcGUoZXJyb3JzWzBdKS5hY3Rpb24gYXMgeyBlcnJvcj86IHsgbWVzc2FnZT86IHN0cmluZyB9IH0pLmVycm9yPy5tZXNzYWdlfWBcblx0XHRcdFx0OiAnJyk7XG5cblx0XHRjb25zdCByZXNwb25zZVBhcnRzID0gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0JykpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZVBhcnRzLmxlbmd0aCA+IDAsICdzaG91bGQgaGF2ZSByZWNlaXZlZCBhdCBsZWFzdCBvbmUgcmVzcG9uc2UgcGFydCBhZnRlciBzZXNzaW9uIHJlZnJlc2gnKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgYWdlbnQncyBzaGVsbCBzdWJwcm9jZXNzIGFjdHVhbGx5IHJ1bnMgaW4gdGhlIHJlc29sdmVkXG5cdFx0Ly8gd29ya3RyZWUgYnkgYXNraW5nIGl0IHRvIHJ1biBgcHdkYC4gQ29waWxvdCByb3V0ZXMgc2hlbGwgY29tbWFuZHNcblx0XHQvLyB0aHJvdWdoIHRoZSBob3N0LW1hbmFnZWQgdGVybWluYWwgdG9vbCwgd2hpY2ggZXhwb3NlcyBhXG5cdFx0Ly8gc3Vic2NyaWJhYmxlIHRlcm1pbmFsIHJlc291cmNlIHdlIGNhbiBhc3NlcnQgYGN3ZGAgLyBvdXRwdXQgb24uXG5cdFx0Ly8gQ29kZXggLyBDbGF1ZGUgcnVuIHNoZWxsIGNvbW1hbmRzIGluc2lkZSB0aGVpciBvd24gU0RLIHN1YnByb2Nlc3Ncblx0XHQvLyBhbmQgc3VyZmFjZSB0aGUgb3V0cHV0IGFzIHBsYWluIHRleHQgaW4gdGhlIHRvb2wgcmVzdWx0IGluc3RlYWQsXG5cdFx0Ly8gc28gd2UgYXNzZXJ0IHRoZSB3b3JrdHJlZSBwYXRoIGFwcGVhcnMgaW4gdGhhdCB0ZXh0LlxuXHRcdGlmICghY29uZmlnLnN1cHBvcnRzSG9zdFRlcm1pbmFsVG9vbCkge1xuXHRcdFx0Ly8gVGhlIHNoZWxsIGNvbW1hbmQgbWF5IGVpdGhlciByZXF1aXJlIGEgaG9zdCBjb25maXJtYXRpb25cblx0XHRcdC8vIChgdG9vbENhbGxSZWFkeWAgd2l0aCBgY29uZmlybWVkPXVuZGVmaW5lZGApIG9yIGJlXG5cdFx0XHQvLyBhdXRvLWFwcHJvdmVkIGF0IHRoZSBTREsgbGF5ZXIgKENsYXVkZSdzIGRlZmF1bHQgcGVybWlzc2lvblxuXHRcdFx0Ly8gbW9kZSkuIEEgYmFja2dyb3VuZCBhcHByb3ZhbCBsb29wIGhhbmRsZXMgdGhlIGZvcm1lciB3aXRob3V0XG5cdFx0XHQvLyBibG9ja2luZyBvbiBpdCwgc28gdGhlIHdhaXQgYmVsb3cgb25seSBoYXMgdG8gb2JzZXJ2ZSB0aGVcblx0XHRcdC8vIHRvb2wncyB0ZXh0IG91dHB1dCBcdTIwMTQgd2hpY2ggY2FycmllcyB0aGUgYHB3ZGAgcmVzdWx0LlxuXHRcdFx0Y29uc3QgYXBwcm92YWxMb29wID0gc3RhcnRCYWNrZ3JvdW5kQXBwcm92YWxMb29wKGNvbnRleHQuY2xpZW50LCB7XG5cdFx0XHRcdGFwcHJvdmFsU2VxU3RhcnQ6IDEwMCxcblx0XHRcdFx0YWxsb3c6IFt7IHRvb2xOYW1lOiBjb25maWcuc2hlbGxUb29sTmFtZSB9XSxcblx0XHRcdH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIGFkZGVkU3VtbWFyeS5yZXNvdXJjZSwgJ3R1cm4td3QtdGVybWluYWwnLCBgUnVuIGV4YWN0bHkgdGhpcyBzaGVsbCBjb21tYW5kLCB3aXRoIG5vIG1vZGlmaWNhdGlvbnMsIGluIHRoZSBzZXNzaW9uIGN1cnJlbnQgd29ya2luZyBkaXJlY3Rvcnk6IFxcYCR7UFJJTlRfQ1dEX0NPTU1BTkR9XFxgLiBEbyBub3Qgc3BlY2lmeSBhIHdvcmtpbmctZGlyZWN0b3J5IG92ZXJyaWRlLmAsIDMpO1xuXG5cdFx0XHRcdC8vIFRoZSBgcHdkYCBvdXRwdXQgY2FuIGFycml2ZSBhcyBzdHJlYW1pbmcgcGFydGlhbCBjb250ZW50XG5cdFx0XHRcdC8vIChgdG9vbENhbGxDb250ZW50Q2hhbmdlZGApIG9yIGluIHRoZSBmaW5hbCB0b29sIHJlc3VsdFxuXHRcdFx0XHQvLyAoYHRvb2xDYWxsQ29tcGxldGVgKSwgZGVwZW5kaW5nIG9uIHRoZSBwcm92aWRlci4gQWNjZXB0XG5cdFx0XHRcdC8vIGVpdGhlciBhcyBsb25nIGFzIHRoZSB0ZXh0IGNhcnJpZXMgdGhlIHdvcmt0cmVlIHBhdGguXG5cdFx0XHRcdGNvbnN0IHB3ZE5vdGlmID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb250ZW50Q2hhbmdlZCcpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBjb250ZW50OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIH07XG5cdFx0XHRcdFx0XHRyZXR1cm4gaW5jbHVkZXNXb3JraW5nRGlyZWN0b3J5UGF0aCh0ZXh0RnJvbUNvbnRlbnQoYWN0aW9uLmNvbnRlbnQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIH0gfTtcblx0XHRcdFx0XHRcdHJldHVybiBpbmNsdWRlc1dvcmtpbmdEaXJlY3RvcnlQYXRoKHRleHRGcm9tQ29udGVudChhY3Rpb24ucmVzdWx0LmNvbnRlbnQgPz8gW10pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9LCA5MF8wMDApO1xuXHRcdFx0XHRjb25zdCBwd2RUZXh0ID0gaXNBY3Rpb25Ob3RpZmljYXRpb24ocHdkTm90aWYsICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKVxuXHRcdFx0XHRcdD8gdGV4dEZyb21Db250ZW50KChnZXRBY3Rpb25FbnZlbG9wZShwd2ROb3RpZikuYWN0aW9uIGFzIHsgcmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIH0gfSkucmVzdWx0LmNvbnRlbnQgPz8gW10pXG5cdFx0XHRcdFx0OiB0ZXh0RnJvbUNvbnRlbnQoKGdldEFjdGlvbkVudmVsb3BlKHB3ZE5vdGlmKS5hY3Rpb24gYXMgeyBjb250ZW50OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIH0pLmNvbnRlbnQpO1xuXHRcdFx0XHRhc3NlcnQub2soaW5jbHVkZXNXb3JraW5nRGlyZWN0b3J5UGF0aChwd2RUZXh0KSxcblx0XHRcdFx0XHRgcHdkIG91dHB1dCBzaG91bGQgaW5jbHVkZSB0aGUgcmVzb2x2ZWQgd29ya3RyZWUgcGF0aCAke3Jlc29sdmVkV29ya2luZ0RpcmVjdG9yeVBhdGh9ICgke2Nhbm9uaWNhbFdvcmtpbmdEaXJlY3RvcnlQYXRofSlgKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGFwcHJvdmFsTG9vcC5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcHJvdmFsTG9vcC5lcnJvcnMsIFtdLCAnbm8gdW5leHBlY3RlZCB0b29sIGNhbGxzIHNob3VsZCBoYXZlIGJlZW4gZGVuaWVkJyk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJyksIDkwXzAwMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IGFwcHJvdmFsTG9vcCA9IHN0YXJ0QmFja2dyb3VuZEFwcHJvdmFsTG9vcChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0YXBwcm92YWxTZXFTdGFydDogMTAwLFxuXHRcdFx0YWxsb3c6IFt7IHRvb2xOYW1lOiBjb25maWcuc2hlbGxUb29sTmFtZSB9XSxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBhZGRlZFN1bW1hcnkucmVzb3VyY2UsICd0dXJuLXd0LXRlcm1pbmFsJywgYFJ1biBleGFjdGx5IHRoaXMgc2hlbGwgY29tbWFuZCwgd2l0aCBubyBtb2RpZmljYXRpb25zOiBcXGAke1BSSU5UX0NXRF9DT01NQU5EfVxcYGAsIDMpO1xuXG5cdFx0XHRjb25zdCB0b29sU3RhcnROb3RpZiA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBJVG9vbENhbGxTdGFydEFjdGlvbjtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbi50dXJuSWQgPT09ICd0dXJuLXd0LXRlcm1pbmFsJyAmJiBhY3Rpb24udG9vbE5hbWUgPT09IGNvbmZpZy5zaGVsbFRvb2xOYW1lO1xuXHRcdFx0fSwgNjBfMDAwKTtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUodG9vbFN0YXJ0Tm90aWYpLmFjdGlvbiBhcyBJVG9vbENhbGxTdGFydEFjdGlvbikudG9vbENhbGxJZDtcblxuXHRcdFx0Y29uc3QgdGVybWluYWxDb250ZW50Tm90aWYgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29udGVudENoYW5nZWQnKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgSVRvb2xDYWxsQ29udGVudENoYW5nZWRBY3Rpb247XG5cdFx0XHRcdHJldHVybiBhY3Rpb24udHVybklkID09PSAndHVybi13dC10ZXJtaW5hbCdcblx0XHRcdFx0XHQmJiBhY3Rpb24udG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZFxuXHRcdFx0XHRcdCYmIHRlcm1pbmFsUmVzb3VyY2VGcm9tQ29udGVudChhY3Rpb24uY29udGVudCkgIT09IHVuZGVmaW5lZDtcblx0XHRcdH0sIDYwXzAwMCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENvbnRlbnRBY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZSh0ZXJtaW5hbENvbnRlbnROb3RpZikuYWN0aW9uIGFzIElUb29sQ2FsbENvbnRlbnRDaGFuZ2VkQWN0aW9uO1xuXHRcdFx0Y29uc3QgdGVybWluYWxVcmkgPSB0ZXJtaW5hbFJlc291cmNlRnJvbUNvbnRlbnQodGVybWluYWxDb250ZW50QWN0aW9uLmNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRlcm1pbmFsVXJpLCAnc2hlbGwgdG9vbCBzaG91bGQgZXhwb3NlIGl0cyB0ZXJtaW5hbCByZXNvdXJjZScpO1xuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbFN1YnNjcmliZVJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiB0ZXJtaW5hbFVyaSB9KTtcblx0XHRcdGNvbnN0IGluaXRpYWxUZXJtaW5hbFN0YXRlID0gdGVybWluYWxTdWJzY3JpYmVSZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIFRlcm1pbmFsU3RhdGU7XG5cdFx0XHRhc3NlcnQub2soaW5pdGlhbFRlcm1pbmFsU3RhdGUuY3dkLCAndGVybWluYWwgc2hvdWxkIHJlcG9ydCBpdHMgd29ya2luZyBkaXJlY3RvcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFscGF0aFN5bmMoaW5pdGlhbFRlcm1pbmFsU3RhdGUuY3dkKSwgY2Fub25pY2FsV29ya2luZ0RpcmVjdG9yeVBhdGgsICd0ZXJtaW5hbCBzaG91bGQgYmUgY3JlYXRlZCBpbiB0aGUgcmVzb2x2ZWQgd29ya3RyZWUgZGlyZWN0b3J5Jyk7XG5cblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKSwgOTBfMDAwKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsU25hcHNob3QgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogdGVybWluYWxVcmkgfSk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbFN0YXRlID0gdGVybWluYWxTbmFwc2hvdC5zbmFwc2hvdCEuc3RhdGUgYXMgVGVybWluYWxTdGF0ZTtcblx0XHRcdGFzc2VydC5vayhpbmNsdWRlc1dvcmtpbmdEaXJlY3RvcnlQYXRoKHRlcm1pbmFsVGV4dCh0ZXJtaW5hbFN0YXRlKSksXG5cdFx0XHRcdGB3b3JraW5nIGRpcmVjdG9yeSBvdXRwdXQgc2hvdWxkIGluY2x1ZGUgdGhlIHJlc29sdmVkIHdvcmt0cmVlIHBhdGggJHtyZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnlQYXRofSAoJHtjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5UGF0aH0pYCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGFwcHJvdmFsTG9vcC5zdG9wKCk7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwcm92YWxMb29wLmVycm9ycywgW10sICdubyB1bmV4cGVjdGVkIHRvb2wgY2FsbHMgc2hvdWxkIGhhdmUgYmVlbiBkZW5pZWQnKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7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
