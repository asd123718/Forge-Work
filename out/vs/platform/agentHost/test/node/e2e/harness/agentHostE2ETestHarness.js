import assert from "assert";
import { execSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "fs";
import { homedir, tmpdir, userInfo } from "os";
import { fileURLToPath } from "url";
import { timeout } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { removeAnsiEscapeCodes } from "../../../../../../base/common/strings.js";
import { URI } from "../../../../../../base/common/uri.js";
import {
  ResponsePartKind,
  ChatInputAnswerState,
  ChatInputAnswerValueKind,
  ChatInputQuestionKind,
  ChatInputResponseKind,
  ToolResultContentType,
  ToolCallConfirmationReason,
  ToolCallCancellationReason,
  buildDefaultChatUri,
  getInlineToolInput,
  MessageKind,
  ROOT_STATE_URI
} from "../../../../common/state/sessionState.js";
import { TerminalClaimKind } from "../../../../common/state/protocol/channels-terminal/state.js";
import {
  ActionType
} from "../../../../common/state/sessionActions.js";
import { AgentHostSessionReleaseGraceMsEnvVar } from "../../../../common/agentService.js";
import {
  fetchSessionWithChat,
  getActionEnvelope,
  getAgentHostE2ETestTimeout,
  isActionNotification,
  stopServer,
  TestProtocolClient
} from "../../serverIntegrationTestHelpers.js";
import { defaultAgentHostTarget } from "./agentHostTarget.js";
import { createProviderSession, dispatchTurn, dispatchTurnWithAttachments } from "../../providerIntegrationTestHelpers.js";
import { AgentHostUpdateSnapshotsEnvVar, AhpSnapshotScenario } from "./ahpSnapshot.js";
import { normalizeShellToolNameForCapture } from "./shellToolNames.js";
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === "1";
const RECORD = process.env["AGENT_HOST_REPLAY_RECORD"] === "1" || UPDATE_SNAPSHOTS;
const REPLAY_MODE = RECORD ? "record" : "replay";
const MAX_MODEL_BACKED_TESTS_PER_SHARED_SERVER = 25;
const MAX_TESTS_PER_SHARED_SERVER = 40;
const TEMP_DIR_CLEANUP_TIMEOUT_MS = 3e4;
const REPLAY_PLACEHOLDER_TOKEN = "replay-no-token";
function clearReadOnlyAttributes(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = join(dir, entry);
    try {
      const isDirectory = statSync(entryPath).isDirectory();
      chmodSync(entryPath, isDirectory ? 448 : 384);
      if (isDirectory) {
        clearReadOnlyAttributes(entryPath);
      }
    } catch {
    }
  }
}
function initTestGitRepo(cwd) {
  execSync("git init", { cwd });
  execSync('git config user.name "Agent Host Test"', { cwd });
  execSync('git config user.email "agent-host-test@example.com"', { cwd });
  execSync("git config gc.auto 0", { cwd });
}
async function removeTempDirs(tempDirs) {
  const pendingDirs = tempDirs.splice(0);
  const errors = /* @__PURE__ */ new Map();
  const deadline = Date.now() + TEMP_DIR_CLEANUP_TIMEOUT_MS;
  while (pendingDirs.length > 0) {
    for (let index = pendingDirs.length - 1; index >= 0; index--) {
      const dir = pendingDirs[index];
      try {
        rmSync(dir, { recursive: true, force: true });
        pendingDirs.splice(index, 1);
        errors.delete(dir);
      } catch (error) {
        errors.set(dir, error instanceof Error ? error : new Error(String(error)));
        clearReadOnlyAttributes(dir);
      }
    }
    if (pendingDirs.length === 0) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new AggregateError(
        Array.from(errors.values()),
        `Failed to remove Agent Host E2E temporary directories: ${pendingDirs.join(", ")}`
      );
    }
    await timeout(500);
  }
}
const CAPTURES_DIR = fileURLToPath(new URL("../../../../../../../../src/vs/platform/agentHost/test/node/e2e/captures/", import.meta.url));
const EMPTY_CAPTURE_PATH = join(CAPTURES_DIR, "empty.yaml");
function fixturePathFor(provider, testTitle) {
  const slug = testTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return join(CAPTURES_DIR, `${provider}-${slug}.yaml`);
}
const POSIX_COMMAND_EXCEPTIONS = /* @__PURE__ */ new Set([]);
const STALE_RECORDED_REQUEST_EXCEPTIONS = /* @__PURE__ */ new Set([
  // Re-recording anchors a side chat on a source turn, which hits the same
  // anchor-resolution defect that gates `supportsChatForkE2E`: Claude cannot
  // resolve a client-assigned turn id, so the fork silently degrades to an
  // injected context preamble. The capture predates that preamble and cannot
  // be refreshed until the defect is fixed. Claude only: the other providers
  // fork fine and their captures are current.
  "claude:side chat receives bounded source context without copied history"
]);
function captureKey(provider, testTitle) {
  return `${provider}:${testTitle}`;
}
function capiReplayFor(provider, testTitle, modelTraffic = "recorded") {
  const key = captureKey(provider, testTitle);
  const allowPosixCommands = POSIX_COMMAND_EXCEPTIONS.has(key);
  const allowStaleRecordedRequest = STALE_RECORDED_REQUEST_EXCEPTIONS.has(key);
  if (modelTraffic === "none") {
    return { fixturePath: EMPTY_CAPTURE_PATH, real: true, mode: "replay", allowPosixCommands, allowStaleRecordedRequest };
  }
  return { fixturePath: fixturePathFor(provider, testTitle), real: true, mode: REPLAY_MODE, allowPosixCommands, allowStaleRecordedRequest };
}
function resolveGitHubToken() {
  if (!RECORD) {
    return REPLAY_PLACEHOLDER_TOKEN;
  }
  const envToken = process.env["GITHUB_TOKEN"];
  if (envToken) {
    return envToken;
  }
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("No GITHUB_TOKEN set and `gh auth token` failed. Run `gh auth login` first.");
  }
}
async function createRealSession(c, config, clientId, trackingList, workingDirectory, beforeCreateSession) {
  const sessionUri = await createProviderSession(c, {
    provider: config.provider,
    scheme: config.scheme,
    githubToken: config.githubToken ?? resolveGitHubToken()
  }, clientId, trackingList, workingDirectory, beforeCreateSession);
  c.setAhpSnapshotNormalization({
    workingDirectory: workingDirectory.fsPath,
    homeDirectory: homedir(),
    userName: userInfo().username
  });
  c.clearAhpSnapshot();
  return sessionUri;
}
async function runAhpSnapshotTest(c, config, test, trackingList, tempDirs, options) {
  const scenario = AhpSnapshotScenario.load(test);
  const workingDirectory = mkdtempSync(join(tmpdir(), "ahp-snapshot-"));
  tempDirs.push(workingDirectory);
  const sessionUri = await createRealSession(c, config, scenario.clientId, trackingList, URI.file(workingDirectory));
  await scenario.run(c, sessionUri, options);
}
function getAcceptedAnswers(request) {
  if (!request.questions?.length) {
    return void 0;
  }
  return Object.fromEntries(request.questions.map((question) => {
    switch (question.kind) {
      case ChatInputQuestionKind.Text:
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: question.defaultValue ?? "interactive" }
        }];
      case ChatInputQuestionKind.Number:
      case ChatInputQuestionKind.Integer:
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Number, value: question.defaultValue ?? question.min ?? 1 }
        }];
      case ChatInputQuestionKind.Boolean:
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Boolean, value: question.defaultValue ?? true }
        }];
      case ChatInputQuestionKind.SingleSelect: {
        const preferredOption = question.options.find((option) => /exit_only/i.test(option.id)) ?? question.options.find((option) => /interactive/i.test(option.id) || /interactive/i.test(option.label)) ?? question.options.find((option) => option.recommended) ?? question.options[0];
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Selected, value: preferredOption.id }
        }];
      }
      case ChatInputQuestionKind.MultiSelect: {
        const preferredOptions = question.options.filter((option) => option.recommended);
        const selectedOptions = preferredOptions.length > 0 ? preferredOptions : question.options.slice(0, 1);
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.SelectedMany, value: selectedOptions.map((option) => option.id) }
        }];
      }
    }
  }));
}
function getMarkdownResponseText(c) {
  const markdownPartIds = /* @__PURE__ */ new Set();
  const pieces = [];
  for (const notification of c.receivedNotifications(
    (n) => isActionNotification(n, "chat/responsePart") || isActionNotification(n, "chat/delta")
  )) {
    const action = getActionEnvelope(notification).action;
    if (action.type === "chat/responsePart" && action.part.kind === ResponsePartKind.Markdown) {
      markdownPartIds.add(action.part.id);
      pieces.push(action.part.content);
    } else if (action.type === "chat/delta" && markdownPartIds.has(action.partId)) {
      pieces.push(action.content);
    }
  }
  return pieces.join("");
}
async function driveTurnToCompletion(c, session, turnId, text, clientSeq) {
  return driveTurn(c, session, turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq));
}
async function driveTurnWithAttachmentsToCompletion(c, session, turnId, text, attachments, clientSeq) {
  return driveTurn(c, session, turnId, clientSeq, () => dispatchTurnWithAttachments(c, session, turnId, text, attachments, clientSeq));
}
async function driveTurnWithModelToCompletion(c, session, turnId, text, model, clientSeq) {
  return driveTurn(c, session, turnId, clientSeq, () => c.dispatch({
    channel: buildDefaultChatUri(session),
    clientSeq,
    action: {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User }, model: { id: model } }
    }
  }));
}
async function driveTurnWithCancelledInputToCompletion(c, session, turnId, text, clientSeq) {
  return driveTurn(c, session, turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq), ChatInputResponseKind.Cancel);
}
async function driveTurnWithAnswersToCompletion(c, session, turnId, text, clientSeq, getAnswers) {
  return driveTurn(c, session, turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq), ChatInputResponseKind.Accept, getAnswers);
}
async function driveTurn(c, session, turnId, clientSeq, dispatch, inputResponse = ChatInputResponseKind.Accept, answerProvider = getAcceptedAnswers) {
  c.clearReceived();
  dispatch();
  const chat = buildDefaultChatUri(session);
  const seenNotifications = /* @__PURE__ */ new Set();
  let nextClientSeq = clientSeq + 1;
  let sawInputRequest = false;
  let sawPendingConfirmation = false;
  while (true) {
    const notification = await c.waitForNotification((n) => {
      if (seenNotifications.has(n) || !isActionNotification(n, "chat/toolCallReady") && !isActionNotification(n, "chat/inputRequested") && !isActionNotification(n, "chat/turnComplete") && !isActionNotification(n, "chat/error")) {
        return false;
      }
      if (getActionEnvelope(n).channel !== chat) {
        return false;
      }
      if (isActionNotification(n, "chat/inputRequested")) {
        return true;
      }
      return getActionEnvelope(n).action.turnId === turnId;
    }, 9e4);
    seenNotifications.add(notification);
    if (isActionNotification(notification, "chat/error")) {
      const action2 = getActionEnvelope(notification).action;
      throw new Error(`Session error while driving ${turnId}: ${action2.error.errorType}: ${action2.error.message}`);
    }
    if (isActionNotification(notification, "chat/toolCallReady")) {
      const action2 = getActionEnvelope(notification).action;
      if (!action2.confirmed) {
        sawPendingConfirmation = true;
        c.dispatch({
          channel: buildDefaultChatUri(session),
          clientSeq: nextClientSeq++,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: action2.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      }
      continue;
    }
    if (isActionNotification(notification, "chat/inputRequested")) {
      sawInputRequest = true;
      const action2 = getActionEnvelope(notification).action;
      c.dispatch({
        channel: buildDefaultChatUri(session),
        clientSeq: nextClientSeq++,
        action: {
          type: ActionType.ChatInputCompleted,
          requestId: action2.request.id,
          response: inputResponse,
          answers: inputResponse === ChatInputResponseKind.Accept ? answerProvider(action2.request) : void 0
        }
      });
      continue;
    }
    const action = getActionEnvelope(notification).action;
    assert.strictEqual(action.turnId, turnId);
    break;
  }
  return { sawInputRequest, sawPendingConfirmation, responseText: getMarkdownResponseText(c) };
}
function terminalResourceFromContent(content) {
  const terminalContent = content.find((c) => c.type === ToolResultContentType.Terminal);
  return terminalContent?.resource;
}
function textFromContent(content) {
  return content.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("");
}
function toolResultText(content) {
  if (!content) {
    return "";
  }
  const terminalTexts = [];
  for (const part of content) {
    if (part.type !== ToolResultContentType.Terminal) {
      continue;
    }
    if (part.result?.preview) {
      terminalTexts.push(part.result.preview);
    }
  }
  return [textFromContent(content), ...terminalTexts].filter((text) => text.length > 0).join("\n");
}
function normalizeToolResultText(value, workspace) {
  const withoutAnsi = removeAnsiEscapeCodes(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  let normalizedWorkspace = withoutAnsi;
  if (workspace) {
    normalizedWorkspace = normalizedWorkspace.replaceAll(realpathSync(workspace), "${workdir}").replaceAll(workspace, "${workdir}");
  }
  return normalizedWorkspace.replaceAll("\\", "/").trim();
}
function assertToolCallCompleteText(client, options) {
  const toolNames = new Set(options.toolNames.map(normalizeShellToolNameForCapture));
  const starts = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === options.channel && action.turnId === options.turnId && toolNames.has(normalizeShellToolNameForCapture(action.toolName)));
  const startedToolCallIds = new Set(starts.map(({ action }) => action.toolCallId));
  const completions = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === options.channel && action.turnId === options.turnId && startedToolCallIds.has(action.toolCallId));
  const observed = [];
  let matchingCompletion;
  for (const { action } of completions) {
    if (options.success !== void 0 && action.result.success !== options.success) {
      continue;
    }
    const text = normalizeToolResultText(toolResultText(action.result.content), options.workspace);
    observed.push({ toolCallId: action.toolCallId, success: action.result.success, text });
    if (options.expected.every((expected) => expected.test(text))) {
      matchingCompletion = action;
      break;
    }
  }
  assert.ok(matchingCompletion, `expected ${options.turnId} to complete ${options.toolNames.join("/")} with result text matching ${options.expected.map(String).join(", ")}; observed ${observed.map((value) => JSON.stringify(value)).join(", ")}`);
}
function terminalText(state) {
  return removeAnsiEscapeCodes(state.content.map((part) => part.type === "command" ? `${part.commandLine}
${part.output}` : part.value).join(""));
}
function findToolNameForCall(c, toolCallId) {
  return c.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((a) => a.toolCallId === toolCallId)?.toolName;
}
function startBackgroundApprovalLoop(c, options) {
  const errors = [];
  const approvedToolNames = /* @__PURE__ */ new Set();
  const observedToolNames = /* @__PURE__ */ new Set();
  const processedSeqs = /* @__PURE__ */ new Set();
  let active = true;
  let approvalSeq = options.approvalSeqStart;
  const loop = (async () => {
    while (active) {
      try {
        const ready = await c.waitForNotification((n) => {
          if (!isActionNotification(n, "chat/toolCallReady")) {
            return false;
          }
          return !processedSeqs.has(getActionEnvelope(n).serverSeq);
        }, 2e3);
        const envelope = getActionEnvelope(ready);
        processedSeqs.add(envelope.serverSeq);
        const action = envelope.action;
        if (action.confirmed) {
          continue;
        }
        const toolName = findToolNameForCall(c, action.toolCallId);
        if (toolName) {
          observedToolNames.add(toolName);
        }
        const matchingRule = options.allow.find((rule) => rule.toolName === toolName && (rule.matchInput?.(getInlineToolInput(action.toolInput)) ?? true));
        if (!matchingRule) {
          errors.push(`unexpected tool call: toolName=${toolName ?? "<unknown>"} input=${JSON.stringify(action.toolInput)}`);
          c.dispatch({
            channel: envelope.channel,
            clientSeq: ++approvalSeq,
            action: {
              type: ActionType.ChatToolCallConfirmed,
              turnId: action.turnId,
              toolCallId: action.toolCallId,
              approved: false,
              reason: ToolCallCancellationReason.Denied
            }
          });
          continue;
        }
        matchingRule.inspect?.({ action, errors });
        approvedToolNames.add(matchingRule.toolName);
        c.dispatch({
          channel: envelope.channel,
          clientSeq: ++approvalSeq,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId: action.turnId,
            toolCallId: action.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/timeout/i.test(msg)) {
          errors.push(`approval loop error: ${msg}`);
          active = false;
        }
      }
    }
  })();
  return {
    errors,
    approvedToolNames,
    observedToolNames,
    async stop() {
      active = false;
      await loop;
    }
  };
}
class AgentHostE2EServerLease {
  constructor(_config, startOptions = {}) {
    this._config = _config;
    /**
     * Number of **model-backed** tests served by the current shared server. A
     * single long-lived host caches one provider SDK/CLI subprocess and reuses it
     * across every test; after enough model-driven turns that subprocess can
     * accumulate state and eventually wedge a turn (turn starts, but no model
     * response arrives even though replay is instant). Recycling the server well
     * before that keeps each host instance within its reliable range while still
     * amortizing startup.
     */
    this._modelBackedTestsOnCurrentServer = 0;
    this._testsOnCurrentServer = 0;
    this._cleanupClientSeq = 1e6;
    const dataDir = mkdtempSync(join(tmpdir(), "vscode-agent-host-e2e-"));
    const codexHomeDir = join(dataDir, ".codex");
    mkdirSync(codexHomeDir);
    this._dataDir = dataDir;
    this._target = startOptions.target ?? defaultAgentHostTarget;
    this._startOptions = {
      claudeSdkRoot: startOptions.claudeSdkRoot,
      codexSdkRoot: startOptions.codexSdkRoot,
      codexHomeDir,
      homeDir: dataDir,
      userDataDir: join(dataDir, "user-data"),
      env: { [AgentHostSessionReleaseGraceMsEnvVar]: "0" }
    };
    this._shared = !RECORD;
  }
  /** Acquire a server + connected client for a test, returning both. */
  async acquire(testTitle, modelTraffic = "recorded") {
    const capiReplay = capiReplayFor(this._config.provider, testTitle, modelTraffic);
    this._currentCapiReplay = capiReplay;
    if (this._shared && this._server && (this._testsOnCurrentServer >= MAX_TESTS_PER_SHARED_SERVER || this._modelBackedTestsOnCurrentServer >= MAX_MODEL_BACKED_TESTS_PER_SHARED_SERVER)) {
      await this._recycleSharedServer();
    }
    if (this._shared && this._server) {
      const proxy = this._server.capiReplay;
      if (!proxy) {
        throw new Error("[agent-host-e2e] shared replay server has no capiReplay proxy to reset");
      }
      proxy.resetForReplay(capiReplay.fixturePath, capiReplay.allowStaleRecordedRequest);
    } else {
      this._server = await this._target.launch({ ...this._startOptions, capiReplay, logLevel: this._isCopilotProvider ? "trace" : void 0 });
      this._modelBackedTestsOnCurrentServer = 0;
      this._testsOnCurrentServer = 0;
    }
    this._testsOnCurrentServer++;
    if (modelTraffic === "recorded") {
      this._modelBackedTestsOnCurrentServer++;
    }
    this._client = new TestProtocolClient(
      this._server.port,
      () => this._server?.capiReplay?.takeReplayError(),
      (workingDirectory) => this._server?.capiReplay?.setWorkingDirectory(workingDirectory)
    );
    await this._client.connect();
    return { server: this._server, client: this._client };
  }
  /**
   * Restart the target while preserving its isolated home, user data, and the
   * replay proxy's consumed exchange sequence. Returns a connected,
   * uninitialized client for the caller to initialize with a new client id.
   */
  async restart() {
    const server = this._server;
    const proxy = server?.capiReplay;
    const capiReplay = this._currentCapiReplay;
    if (!server || !proxy || !capiReplay) {
      throw new Error("[agent-host-e2e] no replay-backed server to restart");
    }
    this._client?.close();
    this._client = void 0;
    await stopServer(server);
    this._server = void 0;
    try {
      this._server = await this._target.launch({
        ...this._startOptions,
        capiReplay,
        existingCapiReplay: proxy,
        logLevel: this._isCopilotProvider ? "trace" : void 0
      });
    } catch (error) {
      await proxy.close();
      throw error;
    }
    const client = new TestProtocolClient(
      this._server.port,
      () => this._server?.capiReplay?.takeReplayError(),
      (workingDirectory) => this._server?.capiReplay?.setWorkingDirectory(workingDirectory)
    );
    await client.connect();
    this._client = client;
    return client;
  }
  setRecordingModelResponse(response) {
    const proxy = this._server?.capiReplay;
    if (!proxy) {
      throw new Error("[agent-host-e2e] no replay-backed server");
    }
    proxy.setRecordingModelResponse(response);
  }
  /**
   * Open an additional connection to the current server.
   *
   * `reconnect` is only answerable on a transport that has not completed the
   * handshake, so a test that exercises connection recovery needs a second
   * socket it can close and re-establish without disturbing the shared
   * client. The caller owns the returned client and must close it.
   */
  async connectClient() {
    if (!this._server) {
      throw new Error("[agent-host-e2e] no server acquired yet");
    }
    const client = new TestProtocolClient(this._server.port);
    await client.connect();
    return client;
  }
  /** Stop the current shared server so the next {@link acquire} starts a fresh one. */
  async _recycleSharedServer() {
    try {
      await this._server?.capiReplay?.close();
    } finally {
      await stopServer(this._server);
      this._server = void 0;
      this._modelBackedTestsOnCurrentServer = 0;
      this._testsOnCurrentServer = 0;
    }
  }
  get observedModelRequestBodies() {
    return this._server?.capiReplay?.observedModelRequestBodies ?? [];
  }
  /** The bundled `@github/copilot` CLI is the only provider whose runtime logs we capture / run verbosely. */
  get _isCopilotProvider() {
    return this._config.provider === "copilotcli";
  }
  /**
   * Tail the most recent Copilot runtime (`@github/copilot` CLI) `process-*.log`
   * into the test output. This is the SDK/CLI's own diagnostics — the key signal
   * when a turn hangs or times out, which the AHP assertions alone don't explain.
   * The runtime writes these under `${COPILOT_HOME}/logs`, and the harness pins
   * `COPILOT_HOME` to `${homeDir}/.copilot` (see `startRealServer`), running it
   * at `trace`. Only the Copilot CLI provider is captured — Claude/Codex use their
   * own runtimes and log elsewhere. Best-effort: never throws (it runs in a
   * `teardown`, right before the failure is re-raised). Output goes to
   * `process.stdout` directly (not `console.*`): the integration harness overrides
   * `console.*` and fails the test on ANY unexpected console output during a test,
   * and `currentTest` is still set during `teardown`.
   */
  dumpRuntimeLogsOnFailure(label) {
    if (!this._isCopilotProvider) {
      return;
    }
    try {
      const logsDir = join(this._startOptions.homeDir, ".copilot", "logs");
      let entries;
      try {
        entries = readdirSync(logsDir);
      } catch {
        process.stdout.write(`[agent-host-e2e] no Copilot runtime logs for failed test "${label}" (CLI never spawned; ${logsDir} absent)
`);
        return;
      }
      const newest = entries.filter((name) => /^process-.*\.log$/.test(name)).map((name) => {
        const full = join(logsDir, name);
        try {
          return { full, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return void 0;
        }
      }).filter((v) => v !== void 0).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (!newest) {
        process.stdout.write(`[agent-host-e2e] no Copilot runtime process-*.log for failed test "${label}" under ${logsDir}
`);
        return;
      }
      const lines = readFileSync(newest.full, "utf8").split(/\r?\n/);
      const tail = lines.slice(-200);
      process.stdout.write(`[agent-host-e2e] --- Copilot runtime log for failed test "${label}" (${newest.full}; last ${tail.length} of ${lines.length} lines) ---
`);
      for (const ln of tail) {
        process.stdout.write(`[agent-host-e2e] # ${ln}
`);
      }
      process.stdout.write("[agent-host-e2e] --- end Copilot runtime log ---\n");
    } catch {
    }
  }
  /**
   * Release a test: dispose its sessions, disconnect the client, and verify the
   * replay traffic. A shared server is normally kept alive (with its cached SDK
   * client) for the next test; a per-test server is stopped.
   *
   * Pass `forceRestart` when the just-run test failed. A failed test can leave
   * a mid-turn session that wedges (or has already killed) the shared host, so
   * reusing it would cascade `ECONNREFUSED` / `createSession` timeouts into the
   * next, unrelated test. Restarting isolates the failure to the one test that
   * caused it. The strict cache-miss assertion is also skipped on restart: the
   * test already failed for its own reason, and a secondary cache-miss throw
   * would only obscure it.
   */
  async release(createdSessions, forceRestart = false) {
    const client = this._client;
    const cleanupErrors = [];
    if (client) {
      for (const session of createdSessions) {
        try {
          const state = await fetchSessionWithChat(client, session);
          if (state.activeTurn) {
            const chat = buildDefaultChatUri(session);
            const turnId = state.activeTurn.id;
            client.dispatch({
              channel: chat,
              clientSeq: this._cleanupClientSeq++,
              action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 }
            });
            await client.waitForNotification(
              (n) => isActionNotification(n, "chat/turnCancelled") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
              1e4
            );
          }
          const root = await client.call("subscribe", { channel: ROOT_STATE_URI });
          const terminals = root.snapshot.state.terminals ?? [];
          for (const terminal of terminals) {
            if (terminal.claim.kind === TerminalClaimKind.Session && terminal.claim.session === session) {
              await client.call("disposeTerminal", { channel: terminal.resource }, getAgentHostE2ETestTimeout(3e4, 9e4));
            }
          }
          await client.call("disposeSession", { channel: session }, getAgentHostE2ETestTimeout(3e4, 9e4));
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      client.close();
    }
    createdSessions.length = 0;
    this._client = void 0;
    const mustRestart = forceRestart || cleanupErrors.length > 0;
    if (this._shared && !mustRestart) {
      try {
        this._server?.capiReplay?.assertNoReplayMismatches();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        try {
          await this._server?.capiReplay?.close();
        } catch (stopError) {
          cleanupErrors.push(stopError instanceof Error ? stopError : new Error(String(stopError)));
        }
        try {
          await stopServer(this._server);
        } catch (stopError) {
          cleanupErrors.push(stopError instanceof Error ? stopError : new Error(String(stopError)));
        }
        this._server = void 0;
        this._modelBackedTestsOnCurrentServer = 0;
        this._testsOnCurrentServer = 0;
      }
    } else {
      try {
        if (forceRestart) {
          await this._server?.capiReplay?.close();
        } else {
          await this._server?.capiReplay?.stop();
        }
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
      } finally {
        try {
          await stopServer(this._server);
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
        this._server = void 0;
        this._modelBackedTestsOnCurrentServer = 0;
        this._testsOnCurrentServer = 0;
      }
    }
    if (cleanupErrors.length > 0) {
      if (forceRestart) {
        process.stdout.write(`[agent-host-e2e] cleanup reported ${cleanupErrors.length} secondary error(s) after the test failed:
`);
        for (const error of cleanupErrors) {
          process.stdout.write(`[agent-host-e2e] # ${error.message}
`);
        }
        return;
      }
      throw new AggregateError(cleanupErrors, `Failed to release Agent Host E2E test resources: ${cleanupErrors.map((error) => error.message).join("; ")}`);
    }
  }
  /** Tear down a shared server at the end of the suite (no-op for per-test). */
  async dispose() {
    const dataDir = this._dataDir;
    this._dataDir = void 0;
    try {
      if (this._server) {
        try {
          await this._server.capiReplay?.close();
        } finally {
          await stopServer(this._server);
          this._server = void 0;
        }
      }
    } finally {
      if (dataDir) {
        await removeTempDirs([dataDir]);
      }
    }
  }
}
export {
  AgentHostE2EServerLease,
  REPLAY_PLACEHOLDER_TOKEN,
  assertToolCallCompleteText,
  capiReplayFor,
  createRealSession,
  dispatchTurn,
  dispatchTurnWithAttachments,
  driveTurnToCompletion,
  driveTurnWithAnswersToCompletion,
  driveTurnWithAttachmentsToCompletion,
  driveTurnWithCancelledInputToCompletion,
  driveTurnWithModelToCompletion,
  findToolNameForCall,
  getAcceptedAnswers,
  getMarkdownResponseText,
  initTestGitRepo,
  removeTempDirs,
  resolveGitHubToken,
  runAhpSnapshotTest,
  startBackgroundApprovalLoop,
  terminalResourceFromContent,
  terminalText,
  textFromContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXGhhcm5lc3NcXGFnZW50SG9zdEUyRVRlc3RIYXJuZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBTaGFyZWQgZHJpdmVycyBhbmQgbGlmZWN5Y2xlIGhlbHBlcnMgZm9yIGJ1bmRsZWQtcHJvdmlkZXIgQWdlbnQgSG9zdCBFMkUgdGVzdHMuXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGNobW9kU3luYywgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgcmVhZGRpclN5bmMsIHJlYWRGaWxlU3luYywgcmVhbHBhdGhTeW5jLCBybVN5bmMsIHN0YXRTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgaG9tZWRpciwgdG1wZGlyLCB1c2VySW5mbyB9IGZyb20gJ29zJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7XG5cdFJlc3BvbnNlUGFydEtpbmQsIENoYXRJbnB1dEFuc3dlclN0YXRlLCBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsIENoYXRJbnB1dFF1ZXN0aW9uS2luZCxcblx0Q2hhdElucHV0UmVzcG9uc2VLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgYnVpbGREZWZhdWx0Q2hhdFVyaSxcblx0Z2V0SW5saW5lVG9vbElucHV0LCBNZXNzYWdlS2luZCwgUk9PVF9TVEFURV9VUkksIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgUm9vdFN0YXRlLCB0eXBlIFRlcm1pbmFsU3RhdGUsXG5cdHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsXG59IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtdGVybWluYWwvc3RhdGUuanMnO1xuaW1wb3J0IHtcblx0QWN0aW9uVHlwZSxcblx0dHlwZSBDaGF0SW5wdXRSZXF1ZXN0ZWRBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24sXG5cdHR5cGUgQ2hhdEVycm9yQWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uLFxufSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29waWxvdENsaUNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25SZWxlYXNlR3JhY2VNc0VudlZhciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FwaVJlcGxheU1vZGUsIHR5cGUgSUNhcGlSZXBsYXlSZXNwb25zZSB9IGZyb20gJy4vY2FwaVJlcGxheVByb3h5LmpzJztcbmltcG9ydCB7XG5cdGZldGNoU2Vzc2lvbldpdGhDaGF0LCBnZXRBY3Rpb25FbnZlbG9wZSwgZ2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQsIGlzQWN0aW9uTm90aWZpY2F0aW9uLCBJU2VydmVySGFuZGxlLCBzdG9wU2VydmVyLCBUZXN0UHJvdG9jb2xDbGllbnQsXG59IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEFnZW50SG9zdFRhcmdldCwgdHlwZSBJQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi9hZ2VudEhvc3RUYXJnZXQuanMnO1xuaW1wb3J0IHsgY3JlYXRlUHJvdmlkZXJTZXNzaW9uLCBkaXNwYXRjaFR1cm4sIGRpc3BhdGNoVHVybldpdGhBdHRhY2htZW50cyB9IGZyb20gJy4uLy4uL3Byb3ZpZGVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RVcGRhdGVTbmFwc2hvdHNFbnZWYXIsIEFocFNuYXBzaG90U2NlbmFyaW8sIHR5cGUgSUFocFNuYXBzaG90T3B0aW9ucyB9IGZyb20gJy4vYWhwU25hcHNob3QuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplU2hlbGxUb29sTmFtZUZvckNhcHR1cmUgfSBmcm9tICcuL3NoZWxsVG9vbE5hbWVzLmpzJztcblxuLy8gI3JlZ2lvbiBSZWNvcmQvcmVwbGF5XG5cbi8qKlxuICogYEFHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRD0xYCByZWNvcmRzIG9ubHkgTExNIGZpeHR1cmVzLCB3aGlsZVxuICogYEFHRU5UX0hPU1RfVVBEQVRFX1NOQVBTSE9UUz0xYCByZWNvcmRzIExMTSBmaXh0dXJlcyBhbmQgdXBkYXRlcyBBSFBcbiAqIHNuYXBzaG90cyBpbiB0aGUgc2FtZSBydW4uXG4gKi9cbmNvbnN0IFVQREFURV9TTkFQU0hPVFMgPSBwcm9jZXNzLmVudltBZ2VudEhvc3RVcGRhdGVTbmFwc2hvdHNFbnZWYXJdID09PSAnMSc7XG5jb25zdCBSRUNPUkQgPSBwcm9jZXNzLmVudlsnQUdFTlRfSE9TVF9SRVBMQVlfUkVDT1JEJ10gPT09ICcxJyB8fCBVUERBVEVfU05BUFNIT1RTO1xuY29uc3QgUkVQTEFZX01PREU6IENhcGlSZXBsYXlNb2RlID0gUkVDT1JEID8gJ3JlY29yZCcgOiAncmVwbGF5JztcblxuLyoqXG4gKiBVcHBlciBib3VuZCBvbiAqKm1vZGVsLWJhY2tlZCoqIHRlc3RzIHNlcnZlZCBieSBhIHNpbmdsZSBzaGFyZWQgcmVwbGF5IHNlcnZlclxuICogYmVmb3JlIGl0IGlzIHByb2FjdGl2ZWx5IHJlY3ljbGVkLiBUaGUgY2FjaGVkIHByb3ZpZGVyIFNESy9DTEkgc3VicHJvY2Vzc1xuICogZGVncmFkZXMgYXMgYSBmdW5jdGlvbiBvZiB0aGUgbW9kZWwtZHJpdmVuIHR1cm5zIGl0IGhhcyBydW4sIG5vdCBvZiBob3cgbWFueVxuICogdGVzdHMgY29ubmVjdGVkLCBzbyBob3N0LW9ubHkgdGVzdHMgZG8gbm90IGNvdW50IGFnYWluc3QgdGhpcyBidWRnZXQuXG4gKiBBbW9ydGl6ZXMgc3RhcnR1cCBhY3Jvc3MgbWFueSB0ZXN0cyB3aGlsZSBrZWVwaW5nIGVhY2ggY2FjaGVkIHByb3ZpZGVyXG4gKiBzdWJwcm9jZXNzIHdlbGwgd2l0aGluIHRoZSByYW5nZSB3aGVyZSBpdCBzdGF5cyBoZWFsdGh5LlxuICovXG5jb25zdCBNQVhfTU9ERUxfQkFDS0VEX1RFU1RTX1BFUl9TSEFSRURfU0VSVkVSID0gMjU7XG4vKiogQm91bmRzIGhvc3Qtb3duZWQgcmVzb3VyY2UgYWNjdW11bGF0aW9uIGV2ZW4gd2hlbiB0ZXN0cyBuZXZlciBjb250YWN0IGEgbW9kZWwuICovXG5jb25zdCBNQVhfVEVTVFNfUEVSX1NIQVJFRF9TRVJWRVIgPSA0MDtcbmNvbnN0IFRFTVBfRElSX0NMRUFOVVBfVElNRU9VVF9NUyA9IDMwXzAwMDtcbi8qKiBBIHN5bnRoZXRpYyB0b2tlbiB1c2VkIG9uIHJlcGxheSAobm8gcmVhbCBjcmVkZW50aWFsIG5lZWRlZCkuICovXG5leHBvcnQgY29uc3QgUkVQTEFZX1BMQUNFSE9MREVSX1RPS0VOID0gJ3JlcGxheS1uby10b2tlbic7XG5leHBvcnQgdHlwZSBBZ2VudEhvc3RFMkVNb2RlbFRyYWZmaWMgPSAncmVjb3JkZWQnIHwgJ25vbmUnO1xuXG4vKipcbiAqIENsZWFycyByZWFkLW9ubHkgYXR0cmlidXRlcyBhY3Jvc3MgYSBkaXJlY3RvcnkgdHJlZS5cbiAqXG4gKiBHaXQgbWFya3MgdGhlIGZpbGVzIHVuZGVyIGAuZ2l0L29iamVjdHNgIHJlYWQtb25seSwgYW5kIG9uIFdpbmRvd3MgYVxuICogcmVhZC1vbmx5IGZpbGUgY2Fubm90IGJlIGRlbGV0ZWQgXHUyMDE0IGBybVN5bmNgJ3MgYGZvcmNlYCBvcHRpb24gb25seSBzdXBwcmVzc2VzXG4gKiBgRU5PRU5UYCwgaXQgZG9lcyBub3Qgb3ZlcnJpZGUgdGhlIGF0dHJpYnV0ZS4gV2l0aG91dCB0aGlzLCBhbnkgdGVzdCB0aGF0XG4gKiBjcmVhdGVzIGEgZ2l0IHJlcG9zaXRvcnkgaW4gYSB0ZW1wIGRpcmVjdG9yeSBmYWlscyB0ZWFyZG93biBvbiBXaW5kb3dzIGFmdGVyXG4gKiBidXJuaW5nIHRoZSBmdWxsIGNsZWFudXAgdGltZW91dCwgZXZlbiB0aG91Z2ggdGhlIHRlc3QgaXRzZWxmIHBhc3NlZC5cbiAqXG4gKiBCZXN0LWVmZm9ydCB0aHJvdWdob3V0OiBlbnRyaWVzIGNhbiBkaXNhcHBlYXIgdW5kZXJuZWF0aCB1cyB3aGlsZSB0aGUgZmFpbGVkXG4gKiByZW1vdmFsIGlzIHN0aWxsIHVud2luZGluZywgYW5kIGEgZmFpbHVyZSBoZXJlIGp1c3QgbWVhbnMgdGhlIHJldHJ5IGZhaWxzIHRoZVxuICogc2FtZSB3YXkgaXQgYWxyZWFkeSBkaWQuXG4gKi9cbmZ1bmN0aW9uIGNsZWFyUmVhZE9ubHlBdHRyaWJ1dGVzKGRpcjogc3RyaW5nKTogdm9pZCB7XG5cdGxldCBlbnRyaWVzOiBzdHJpbmdbXTtcblx0dHJ5IHtcblx0XHRlbnRyaWVzID0gcmVhZGRpclN5bmMoZGlyKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdGNvbnN0IGVudHJ5UGF0aCA9IGpvaW4oZGlyLCBlbnRyeSk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIERpcmVjdG9yaWVzIG5lZWQgdGhlIGV4ZWN1dGUgYml0IHRvIHN0YXkgdHJhdmVyc2FibGUuXG5cdFx0XHRjb25zdCBpc0RpcmVjdG9yeSA9IHN0YXRTeW5jKGVudHJ5UGF0aCkuaXNEaXJlY3RvcnkoKTtcblx0XHRcdGNobW9kU3luYyhlbnRyeVBhdGgsIGlzRGlyZWN0b3J5ID8gMG83MDAgOiAwbzYwMCk7XG5cdFx0XHRpZiAoaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0Y2xlYXJSZWFkT25seUF0dHJpYnV0ZXMoZW50cnlQYXRoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEVudHJ5IHZhbmlzaGVkIG9yIGNhbm5vdCBiZSBjaGFuZ2VkOyB0aGUgcmV0cnkgd2lsbCByZXBvcnQgaXQuXG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZXMgYSBnaXQgcmVwb3NpdG9yeSBmb3IgYSB0ZXN0LCB3aXRoIGFuIGlkZW50aXR5IGFuZCBubyBiYWNrZ3JvdW5kXG4gKiBtYWludGVuYW5jZS5cbiAqXG4gKiBgZ2MuYXV0byAwYCBtYXR0ZXJzIG9uIFdpbmRvd3M6IGFuIGF1dG8tdHJpZ2dlcmVkIGBnaXQgZ2NgIHJ1bnMgaW4gdGhlXG4gKiBiYWNrZ3JvdW5kIGFuZCBjYW4gc3RpbGwgaG9sZCBoYW5kbGVzIHVuZGVyIGAuZ2l0YCB3aGVuIHRoZSB0ZXN0IGZpbmlzaGVzLFxuICogd2hpY2ggbWFrZXMgdGhlIHRlbXAtZGlyZWN0b3J5IGNsZWFudXAgZmFpbCBmb3IgYSByZWFzb24gdW5yZWxhdGVkIHRvIHRoZVxuICogYmVoYXZpb3IgdW5kZXIgdGVzdC4gVGVzdHMgaGVyZSBuZXZlciBjcmVhdGUgZW5vdWdoIG9iamVjdHMgdG8gbmVlZCBnYy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluaXRUZXN0R2l0UmVwbyhjd2Q6IHN0cmluZyk6IHZvaWQge1xuXHRleGVjU3luYygnZ2l0IGluaXQnLCB7IGN3ZCB9KTtcblx0ZXhlY1N5bmMoJ2dpdCBjb25maWcgdXNlci5uYW1lIFwiQWdlbnQgSG9zdCBUZXN0XCInLCB7IGN3ZCB9KTtcblx0ZXhlY1N5bmMoJ2dpdCBjb25maWcgdXNlci5lbWFpbCBcImFnZW50LWhvc3QtdGVzdEBleGFtcGxlLmNvbVwiJywgeyBjd2QgfSk7XG5cdGV4ZWNTeW5jKCdnaXQgY29uZmlnIGdjLmF1dG8gMCcsIHsgY3dkIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVtb3ZlVGVtcERpcnModGVtcERpcnM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHBlbmRpbmdEaXJzID0gdGVtcERpcnMuc3BsaWNlKDApO1xuXHRjb25zdCBlcnJvcnMgPSBuZXcgTWFwPHN0cmluZywgRXJyb3I+KCk7XG5cdGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIFRFTVBfRElSX0NMRUFOVVBfVElNRU9VVF9NUztcblx0d2hpbGUgKHBlbmRpbmdEaXJzLmxlbmd0aCA+IDApIHtcblx0XHRmb3IgKGxldCBpbmRleCA9IHBlbmRpbmdEaXJzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRcdGNvbnN0IGRpciA9IHBlbmRpbmdEaXJzW2luZGV4XTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJtU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0cGVuZGluZ0RpcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0ZXJyb3JzLmRlbGV0ZShkaXIpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZXJyb3JzLnNldChkaXIsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKSk7XG5cdFx0XHRcdC8vIEEgcmVhZC1vbmx5IGZpbGUgbmV2ZXIgYmVjb21lcyBkZWxldGFibGUgYnkgd2FpdGluZywgc28gY2xlYXIgdGhlXG5cdFx0XHRcdC8vIGF0dHJpYnV0ZXMgYmVmb3JlIHRoZSByZXRyeSByYXRoZXIgdGhhbiBzcGlubmluZyB1bnRpbCB0aGVcblx0XHRcdFx0Ly8gZGVhZGxpbmUuIEhhcm1sZXNzIHdoZW4gdGhlIHJlYWwgY2F1c2UgaXMgYSB0cmFuc2llbnQgbG9jay5cblx0XHRcdFx0Y2xlYXJSZWFkT25seUF0dHJpYnV0ZXMoZGlyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBlbmRpbmdEaXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoRGF0ZS5ub3coKSA+PSBkZWFkbGluZSkge1xuXHRcdFx0dGhyb3cgbmV3IEFnZ3JlZ2F0ZUVycm9yKFxuXHRcdFx0XHRBcnJheS5mcm9tKGVycm9ycy52YWx1ZXMoKSksXG5cdFx0XHRcdGBGYWlsZWQgdG8gcmVtb3ZlIEFnZW50IEhvc3QgRTJFIHRlbXBvcmFyeSBkaXJlY3RvcmllczogJHtwZW5kaW5nRGlycy5qb2luKCcsICcpfWAsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdH1cbn1cblxuLyoqXG4gKiBGaXh0dXJlcyBsaXZlIGluIHRoZSBzb3VyY2UgdHJlZSAoY29tbWl0dGVkKSB0aG91Z2ggdGhlIGNvbXBpbGVkIHRlc3QgcnVuc1xuICogZnJvbSBgb3V0L2AvYG91dC1idWlsZC9gIFx1MjAxNCByZXNvbHZlIHVwIHRvIHRoZSByZXBvIHJvb3QgYW5kIGludG8gYHNyYy8uLi5gLlxuICovXG5jb25zdCBDQVBUVVJFU19ESVIgPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3NyYy92cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL2UyZS9jYXB0dXJlcy8nLCBpbXBvcnQubWV0YS51cmwpKTtcbmNvbnN0IEVNUFRZX0NBUFRVUkVfUEFUSCA9IGpvaW4oQ0FQVFVSRVNfRElSLCAnZW1wdHkueWFtbCcpO1xuXG4vKiogUGVyLXRlc3QgZml4dHVyZSBwYXRoIGRlcml2ZWQgZnJvbSB0aGUgcHJvdmlkZXIgKyB0ZXN0IHRpdGxlLiAqL1xuZnVuY3Rpb24gZml4dHVyZVBhdGhGb3IocHJvdmlkZXI6IHN0cmluZywgdGVzdFRpdGxlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzbHVnID0gdGVzdFRpdGxlLnJlcGxhY2UoL1teYS16MC05XSsvZ2ksICctJykucmVwbGFjZSgvXi0rfC0rJC9nLCAnJykudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIGpvaW4oQ0FQVFVSRVNfRElSLCBgJHtwcm92aWRlcn0tJHtzbHVnfS55YW1sYCk7XG59XG5cbi8qKlxuICogVGVzdHMgd2hvc2UgcmVjb3JkZWQgY2FwdHVyZSBpcyBhbGxvd2VkIHRvIGNvbnRhaW4gUE9TSVgtb25seSBjb21tYW5kcy5cbiAqXG4gKiBLZXllZCBieSBwcm92aWRlciBhbmQgdGVzdCB0aXRsZSwgc2luY2UgYSBjYXB0dXJlIGV4aXN0cyBwZXIgcHJvdmlkZXIgYW5kIGFuXG4gKiBleGNlcHRpb24gbXVzdCBvbmx5IGV2ZXIgc2lsZW5jZSB0aGUgb25lIGl0IHdhcyB3cml0dGVuIGZvci4gRWFjaCBlbnRyeSBtdXN0XG4gKiBjb3JyZXNwb25kIHRvIGEgdGVzdCB0aGF0IGlzICphbHNvKiBzY29wZWQgYXdheSBmcm9tIFdpbmRvd3MgYXQgaXRzIGNhbGxcbiAqIHNpdGUsIHdpdGggdGhlIHJlYXNvbiBzdGF0ZWQgdGhlcmUuIFRoaXMgbGlzdCBleGlzdHMgc28gdGhlIGV4Y2VwdGlvbnMgYXJlXG4gKiBjb3VudGFibGUgaW4gb25lIHBsYWNlOyBhZGRpbmcgdG8gaXQgc2hvdWxkIGJlIHJhcmUgYW5kIGRlbGliZXJhdGUuIFNlZVxuICogYGhhcm5lc3MvcG9zaXhDb21tYW5kTGludC50c2AuXG4gKi9cbmNvbnN0IFBPU0lYX0NPTU1BTkRfRVhDRVBUSU9OUyA9IG5ldyBTZXQ8c3RyaW5nPihbXSk7XG5cbi8qKlxuICogQ2FwdHVyZXMgdGhhdCBhcmUgYWxsb3dlZCB0byBkaXNhZ3JlZSB3aXRoIHRoZSByZXF1ZXN0IHRoZSBob3N0IG5vdyBzZW5kcy5cbiAqXG4gKiBLZXllZCBieSBwcm92aWRlciBhbmQgdGVzdCB0aXRsZSBmb3IgdGhlIHNhbWUgcmVhc29uIGFzXG4gKiB7QGxpbmsgUE9TSVhfQ09NTUFORF9FWENFUFRJT05TfTogdGhlIHNhbWUgdGVzdCBydW5zIGFnYWluc3QgZXZlcnkgcHJvdmlkZXJcbiAqIHRoYXQgc3VwcG9ydHMgaXQsIGFuZCBlYWNoIGhhcyBpdHMgb3duIGNhcHR1cmUuIFRoZSBjYXB0dXJlIHN0b3BzIGJlaW5nIGFuXG4gKiBhc3NlcnRpb24gZm9yIGFuIGVudHJ5IGhlcmUsIHNvIG9uZSBpcyBvbmx5IGp1c3RpZmllZCB3aGVuIGl0ICpjYW5ub3QqIGJlXG4gKiByZWZyZXNoZWQsIGFuZCBpdCBtdXN0IGhhdmUgYSBgS05PV05fSVNTVUVTLm1kYCBlbnRyeSByZWNvcmRpbmcgd2h5LiBTZWVcbiAqIGBoYXJuZXNzL21vZGVsUmVxdWVzdFByb2plY3Rpb24udHNgLlxuICovXG5jb25zdCBTVEFMRV9SRUNPUkRFRF9SRVFVRVNUX0VYQ0VQVElPTlMgPSBuZXcgU2V0PHN0cmluZz4oW1xuXHQvLyBSZS1yZWNvcmRpbmcgYW5jaG9ycyBhIHNpZGUgY2hhdCBvbiBhIHNvdXJjZSB0dXJuLCB3aGljaCBoaXRzIHRoZSBzYW1lXG5cdC8vIGFuY2hvci1yZXNvbHV0aW9uIGRlZmVjdCB0aGF0IGdhdGVzIGBzdXBwb3J0c0NoYXRGb3JrRTJFYDogQ2xhdWRlIGNhbm5vdFxuXHQvLyByZXNvbHZlIGEgY2xpZW50LWFzc2lnbmVkIHR1cm4gaWQsIHNvIHRoZSBmb3JrIHNpbGVudGx5IGRlZ3JhZGVzIHRvIGFuXG5cdC8vIGluamVjdGVkIGNvbnRleHQgcHJlYW1ibGUuIFRoZSBjYXB0dXJlIHByZWRhdGVzIHRoYXQgcHJlYW1ibGUgYW5kIGNhbm5vdFxuXHQvLyBiZSByZWZyZXNoZWQgdW50aWwgdGhlIGRlZmVjdCBpcyBmaXhlZC4gQ2xhdWRlIG9ubHk6IHRoZSBvdGhlciBwcm92aWRlcnNcblx0Ly8gZm9yayBmaW5lIGFuZCB0aGVpciBjYXB0dXJlcyBhcmUgY3VycmVudC5cblx0J2NsYXVkZTpzaWRlIGNoYXQgcmVjZWl2ZXMgYm91bmRlZCBzb3VyY2UgY29udGV4dCB3aXRob3V0IGNvcGllZCBoaXN0b3J5Jyxcbl0pO1xuXG4vKiogSWRlbnRpZmllcyBvbmUgcHJvdmlkZXIncyBjYXB0dXJlIG9mIGEgdGVzdCwgbWF0Y2hpbmcgYGZpeHR1cmVQYXRoRm9yYC4gKi9cbmZ1bmN0aW9uIGNhcHR1cmVLZXkocHJvdmlkZXI6IHN0cmluZywgdGVzdFRpdGxlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7cHJvdmlkZXJ9OiR7dGVzdFRpdGxlfWA7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIGBjYXBpUmVwbGF5YCBvcHRpb24gZm9yIGEgdGVzdDogcmVwbGF5cyB0aGUgY29tbWl0dGVkIHBlci10ZXN0XG4gKiBmaXh0dXJlIGJ5IGRlZmF1bHQgKHRva2VubGVzcyksIG9yIHJlY29yZHMgaXQgYWdhaW5zdCByZWFsIENBUEkgd2hlblxuICogYEFHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRD0xYCBvciBgQUdFTlRfSE9TVF9VUERBVEVfU05BUFNIT1RTPTFgLiBUZXN0cyB0aGF0XG4gKiBkZWNsYXJlIG5vIG1vZGVsIHRyYWZmaWMgYWx3YXlzIHVzZSB0aGUgc3RyaWN0IHNoYXJlZCBlbXB0eSByZXBsYXkgZml4dHVyZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhcGlSZXBsYXlGb3IocHJvdmlkZXI6IHN0cmluZywgdGVzdFRpdGxlOiBzdHJpbmcsIG1vZGVsVHJhZmZpYzogQWdlbnRIb3N0RTJFTW9kZWxUcmFmZmljID0gJ3JlY29yZGVkJyk6IHsgZml4dHVyZVBhdGg6IHN0cmluZzsgcmVhbDogdHJ1ZTsgbW9kZTogQ2FwaVJlcGxheU1vZGU7IGFsbG93UG9zaXhDb21tYW5kczogYm9vbGVhbjsgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdDogYm9vbGVhbiB9IHtcblx0Y29uc3Qga2V5ID0gY2FwdHVyZUtleShwcm92aWRlciwgdGVzdFRpdGxlKTtcblx0Y29uc3QgYWxsb3dQb3NpeENvbW1hbmRzID0gUE9TSVhfQ09NTUFORF9FWENFUFRJT05TLmhhcyhrZXkpO1xuXHRjb25zdCBhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0ID0gU1RBTEVfUkVDT1JERURfUkVRVUVTVF9FWENFUFRJT05TLmhhcyhrZXkpO1xuXHRpZiAobW9kZWxUcmFmZmljID09PSAnbm9uZScpIHtcblx0XHRyZXR1cm4geyBmaXh0dXJlUGF0aDogRU1QVFlfQ0FQVFVSRV9QQVRILCByZWFsOiB0cnVlLCBtb2RlOiAncmVwbGF5JywgYWxsb3dQb3NpeENvbW1hbmRzLCBhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0IH07XG5cdH1cblx0cmV0dXJuIHsgZml4dHVyZVBhdGg6IGZpeHR1cmVQYXRoRm9yKHByb3ZpZGVyLCB0ZXN0VGl0bGUpLCByZWFsOiB0cnVlLCBtb2RlOiBSRVBMQVlfTU9ERSwgYWxsb3dQb3NpeENvbW1hbmRzLCBhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0IH07XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBUb2tlblxuXG4vKiogUmVzb2x2ZSBHaXRIdWIgdG9rZW4gZnJvbSBlbnYgb3IgYGdoIGF1dGggdG9rZW5gLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVHaXRIdWJUb2tlbigpOiBzdHJpbmcge1xuXHQvLyBSZXBsYXlpbmcgY29tbWl0dGVkIGZpeHR1cmVzIG5lZWRzIG5vIHJlYWwgY3JlZGVudGlhbDogdGhlIGNhcHR1cmUgcHJveHlcblx0Ly8gc2VydmVzIHJlY29yZGVkIHJlc3BvbnNlcyBhbmQgaWdub3JlcyBhdXRoLiBPbmx5IHJlY29yZGluZyB0YWxrcyB0byByZWFsXG5cdC8vIENBUEkgYW5kIHRodXMgbmVlZHMgYSByZWFsIHRva2VuLlxuXHRpZiAoIVJFQ09SRCkge1xuXHRcdHJldHVybiBSRVBMQVlfUExBQ0VIT0xERVJfVE9LRU47XG5cdH1cblx0Y29uc3QgZW52VG9rZW4gPSBwcm9jZXNzLmVudlsnR0lUSFVCX1RPS0VOJ107XG5cdGlmIChlbnZUb2tlbikge1xuXHRcdHJldHVybiBlbnZUb2tlbjtcblx0fVxuXHR0cnkge1xuXHRcdHJldHVybiBleGVjU3luYygnZ2ggYXV0aCB0b2tlbicsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSkudHJpbSgpO1xuXHR9IGNhdGNoIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIEdJVEhVQl9UT0tFTiBzZXQgYW5kIGBnaCBhdXRoIHRva2VuYCBmYWlsZWQuIFJ1biBgZ2ggYXV0aCBsb2dpbmAgZmlyc3QuJyk7XG5cdH1cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIFByb3ZpZGVyIGNvbmZpZ3VyYXRpb25cblxuLyoqXG4gKiBQZXItcHJvdmlkZXIga25vYnMgZm9yIHRoZSBzaGFyZWQgYWdlbnQgaG9zdCBlMmUgc3VpdGUuIExldHMgdXMgc2hhcmUgdGhlIGJ1bGsgb2ZcbiAqIHRoZSB0ZXN0IGJvZGllcyB3aGlsZSBwYXJhbWV0ZXJpemluZyB0aGluZ3MgdGhhdCBnZW51aW5lbHkgZGlmZmVyIGJldHdlZW5cbiAqIENvcGlsb3QgYW5kIENsYXVkZSAodG9vbCBuYW1lcywgVVJJIHNjaGVtZSwgc2VydmVyIHN0YXJ0dXAgb3B0aW9ucykuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnIHtcblx0LyoqIFN1aXRlIHRpdGxlIHNob3duIGluIHRoZSB0ZXN0IHJ1bm5lci4gKi9cblx0cmVhZG9ubHkgc3VpdGVUaXRsZTogc3RyaW5nO1xuXHQvKiogUHJvdmlkZXIgaWQgcGFzc2VkIHRvIGBjcmVhdGVTZXNzaW9uYC4gKi9cblx0cmVhZG9ubHkgcHJvdmlkZXI6IHN0cmluZztcblx0LyoqIFByb3ZpZGVyIGlkcyBleHBlY3RlZCBvbiBtb2RlbHMgYWR2ZXJ0aXNlZCBieSB0aGlzIGhhcm5lc3MuIERlZmF1bHRzIHRvIHtAbGluayBwcm92aWRlcn0uICovXG5cdHJlYWRvbmx5IG1vZGVsUHJvdmlkZXJzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKiBVUkkgc2NoZW1lIHVzZWQgd2hlbiBtaW50aW5nIHNlc3Npb24gVVJJcy4gKi9cblx0cmVhZG9ubHkgc2NoZW1lOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUb29sIG5hbWUgdXNlZCBieSB0aGUgcHJvdmlkZXIgZm9yIGFuIGludGVyYWN0aXZlIHNoZWxsIGNvbW1hbmQuIFVzZWRcblx0ICogYnkgdGhlIHNoZWxsLXBlcm1pc3Npb24gYW5kIGNkLXByZWZpeCB0ZXN0cy4gKGBiYXNoYCBmb3IgQ29waWxvdCxcblx0ICogYEJhc2hgIGZvciBDbGF1ZGUuKVxuXHQgKi9cblx0cmVhZG9ubHkgc2hlbGxUb29sTmFtZTogc3RyaW5nO1xuXHQvKiogSG93IGZpbGUtb3BlcmF0aW9uIHNjZW5hcmlvcyBzaG91bGQgZHJpdmUgdGhpcyBwcm92aWRlci4gKi9cblx0cmVhZG9ubHkgZmlsZU9wZXJhdGlvblN0cmF0ZWd5OiAnZmlsZVRvb2xzJyB8ICdzaGVsbCc7XG5cdC8qKlxuXHQgKiBUb29sIG5hbWVzIHRoZSBwcm92aWRlciB1c2VzIHRvIGRpc3BhdGNoIGEgc3ViYWdlbnQuIFRoZSBmaXJzdCBlbnRyeVxuXHQgKiBpcyB1c2VkIGluIHRoZSBzdWJhZ2VudC1yb3V0aW5nIHByb21wdDsgYWxsIGVudHJpZXMgYXJlIGV4ZW1wdGVkIGZyb21cblx0ICogdGhlIFwicGFyZW50IG11c3Qgbm90IGNvbnRhaW4gaW5uZXIgdG9vbCBjYWxsc1wiIGFzc2VydGlvbi4gKGBbJ3Rhc2snXWBcblx0ICogZm9yIENvcGlsb3Q7IENsYXVkZSBleHBvc2VzIGJvdGggYFRhc2tgIGFuZCBgQWdlbnRgIGFzIHN1YmFnZW50LWtpbmRcblx0ICogdG9vbHMgYW5kIHRoZSBtb2RlbCBtYXkgcGljayBlaXRoZXIuKVxuXHQgKi9cblx0cmVhZG9ubHkgc3ViYWdlbnRUb29sTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHQvKipcblx0ICogVG9vbCBuYW1lIHVzZWQgYnkgdGhlIHByb3ZpZGVyIHRvIGNvbmZpcm0gdGhlIHVzZXIgaXMgcmVhZHkgdG8gbGVhdmVcblx0ICogcGxhbiBtb2RlLiAoYGV4aXRfcGxhbl9tb2RlYCBmb3IgQ29waWxvdCwgYEV4aXRQbGFuTW9kZWAgZm9yIENsYXVkZS4pXG5cdCAqL1xuXHRyZWFkb25seSBleGl0UGxhbk1vZGVUb29sTmFtZTogc3RyaW5nO1xuXHQvKiogRmlsZS1jcmVhdGlvbiB0b29sIHRoYXQgZXhwb3NlcyBtb2RlbC1nZW5lcmF0ZWQgYXJndW1lbnQgZGVsdGFzLCB3aGVuIHN1cHBvcnRlZC4gKi9cblx0cmVhZG9ubHkgc3RyZWFtaW5nRmlsZUNyZWF0ZVRvb2xOYW1lPzogc3RyaW5nO1xuXHQvKiogQWx0ZXJuYXRlIG1vZGVsIHVzZWQgdG8gdmVyaWZ5IGEgY2xpZW50LXNlbGVjdGVkIG1vZGVsIHJlYWNoZXMgdGhlIHByb3ZpZGVyLiAqL1xuXHRyZWFkb25seSBtb2RlbFN3aXRjaFRhcmdldD86IHN0cmluZztcblx0LyoqIE1vZGVsIHVzZWQgdG8gc3dpdGNoIGFuIGFscmVhZHktcnVubmluZyBwcm92aWRlciBzZXNzaW9uIGEgc2Vjb25kIHRpbWUuICovXG5cdHJlYWRvbmx5IG1vZGVsU3dpdGNoUmV0dXJuVGFyZ2V0Pzogc3RyaW5nO1xuXHQvKiogUHJvdmlkZXItc3BlY2lmaWMgcHJvbXB0IHRoYXQgcmVsaWFibHkgdHJpZ2dlcnMgb25lIGludGVyYWN0aXZlIGlucHV0IHJlcXVlc3QuICovXG5cdHJlYWRvbmx5IGludGVyYWN0aXZlSW5wdXRQcm9tcHQ/OiBzdHJpbmc7XG5cdC8qKiBQcm92aWRlci1zcGVjaWZpYyBwcm9tcHQgdGhhdCBleHBlY3RzIGEgY2FuY2VsbGVkIGludGVyYWN0aXZlIGlucHV0IHJlcXVlc3QuICovXG5cdHJlYWRvbmx5IGNhbmNlbGxlZElucHV0UHJvbXB0Pzogc3RyaW5nO1xuXHQvKiogUHJvdmlkZXItc3BlY2lmaWMgcHJvbXB0IHRoYXQgdHJpZ2dlcnMgYSBmcmVlZm9ybSB0ZXh0IGlucHV0IHJlcXVlc3QuICovXG5cdHJlYWRvbmx5IHRleHRJbnB1dFByb21wdD86IHN0cmluZztcblx0LyoqIFByb3ZpZGVyLXNwZWNpZmljIHByb21wdCB0aGF0IHRyaWdnZXJzIGEgbXVsdGktc2VsZWN0IGlucHV0IHJlcXVlc3QuICovXG5cdHJlYWRvbmx5IG11bHRpU2VsZWN0SW5wdXRQcm9tcHQ/OiBzdHJpbmc7XG5cdC8qKiBQcm92aWRlciBzdXBwb3J0cyBhIHNlc3Npb24gd2l0aCBubyB3b3JraW5nIGRpcmVjdG9yeSB0aHJvdWdoIHRoZSBmdWxsIG1vZGVsIHBhdGguICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzV29ya3NwYWNlbGVzc0UyRT86IGJvb2xlYW47XG5cdC8qKiBQcm92aWRlciBleHBvc2VzIHJ1bnRpbWUgc2xhc2ggY29tbWFuZHMgdGhyb3VnaCBBSFAgY29tcGxldGlvbnMgYWZ0ZXIgbWF0ZXJpYWxpemF0aW9uLiAqL1xuXHRyZWFkb25seSBzdXBwb3J0c1J1bnRpbWVTbGFzaENvbW1hbmRzRTJFPzogYm9vbGVhbjtcblx0LyoqIFByb3ZpZGVyIHN1cHBvcnRzIHNoYXJlZCBkZWZhdWx0LWNoYXQgYXR0YWNobWVudCBzY2VuYXJpb3MuICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzQXR0YWNobWVudHNFMkU/OiBib29sZWFuO1xuXHQvKiogUHJvdmlkZXIgc3VwcG9ydHMgdHJ1bmNhdGluZyBhIG1hdGVyaWFsaXplZCBjb252ZXJzYXRpb24gYW5kIGNvbnRpbnVpbmcuICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzVHJ1bmNhdGVFMkU/OiBib29sZWFuO1xuXHQvKiogUHJvdmlkZXIgc3VwcG9ydHMgd29ya3RyZWUgaW5jbHVkZS1maWxlIG1hdGVyaWFsaXphdGlvbiBpbiBkZXRlcm1pbmlzdGljIHJlcGxheS4gKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNXb3JrdHJlZUluY2x1ZGVGaWxlc0UyRT86IGJvb2xlYW47XG5cdC8qKiBQcm92aWRlciBjYW4gZGV0ZXJtaW5pc3RpY2FsbHkgcmVwbGF5IGNhbmNlbGxhdGlvbiB3aGlsZSBwYXVzZWQgb24gaW5wdXQgb3IgYXBwcm92YWwuICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzUGF1c2VkVHVybkNhbmNlbGxhdGlvbkUyRT86IGJvb2xlYW47XG5cdC8qKiBQcm92aWRlcidzIGRlbmllZCBmaWxlLWNyZWF0aW9uIGZsb3cgbXV0YXRlcyB0aGUgd29ya3NwYWNlIGR1cmluZyByZXBsYXkgb24gTGludXguICovXG5cdHJlYWRvbmx5IGZpbGVUb29sRGVuaWFsUmVwbGF5VW5zdGFibGVPbkxpbnV4PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN1aXRlIHNob3VsZCBiZSBlbmFibGVkLiBSZXR1cm5pbmcgZmFsc2Ugc2tpcHMgdGhlIHN1aXRlXG5cdCAqIGVudGlyZWx5IChtaXJyb3JzIGBzdWl0ZS5za2lwKC4uLilgKS5cblx0ICovXG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBwYXRoIHRvIGEgbG9jYWxseSBpbnN0YWxsZWQgYEBhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNka2Bcblx0ICogcGFja2FnZS4gRm9yd2FyZGVkIHRvIHRoZSB0YXJnZXQncyBgbGF1bmNoYCBzbyB0aGUgYWdlbnQgaG9zdCByZWdpc3RlcnNcblx0ICogdGhlIENsYXVkZSBwcm92aWRlci5cblx0ICovXG5cdHJlYWRvbmx5IGNsYXVkZVNka1Jvb3Q/OiBzdHJpbmc7XG5cdC8qKiBPcHRpb25hbCBwYXRoIHRvIGEgbG9jYWxseSBpbnN0YWxsZWQgYGNvZGV4YCBiaW5hcnkuIEZvcndhcmRlZCB0byB0aGUgdGFyZ2V0J3MgYGxhdW5jaGAuICovXG5cdHJlYWRvbmx5IGNvZGV4U2RrUm9vdD86IHN0cmluZztcblx0LyoqXG5cdCAqIFByb3ZpZGVyIGltcGxlbWVudHMgYGNvbmZpZy5pc29sYXRpb246ICd3b3JrdHJlZSdgIGFuZCByZXNvbHZlcyB0aGVcblx0ICogd29ya2luZyBkaXJlY3RvcnkgdG8gYSBgLndvcmt0cmVlcy8uLi5gIHBhdGggb24gbWF0ZXJpYWxpemF0aW9uLiBOb3dcblx0ICogc2hhcmVkIGFjcm9zcyBhbGwgYWdlbnRzIChDb3BpbG90LCBDb2RleCwgQ2xhdWRlKSB2aWEgdGhlIGhvc3Qtb3duZWRcblx0ICogd29ya3RyZWUgaXNvbGF0aW9uIGNvbnRyb2xsZXIuXG5cdCAqL1xuXHRyZWFkb25seSBzdXBwb3J0c1dvcmt0cmVlSXNvbGF0aW9uOiBib29sZWFuO1xuXHQvKipcblx0ICogUHJvdmlkZXIgcm91dGVzIHNoZWxsIGNvbW1hbmRzIHRocm91Z2ggdGhlIGhvc3QtbWFuYWdlZCBjdXN0b20gdGVybWluYWxcblx0ICogdG9vbCAoZ2F0ZWQgYnkge0BsaW5rIENvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sfSksXG5cdCAqIHdoaWNoIGV4cG9zZXMgYSB0ZXJtaW5hbCByZXNvdXJjZSB3aG9zZSBgY3dkYCAvIGBwd2RgIG91dHB1dCBjYW4gYmVcblx0ICogYXNzZXJ0ZWQuIEN1cnJlbnRseSB0cnVlIG9ubHkgZm9yIENvcGlsb3QgXHUyMDE0IENvZGV4IGFuZCBDbGF1ZGUgcnVuIHNoZWxsXG5cdCAqIGNvbW1hbmRzIGluc2lkZSB0aGVpciBvd24gU0RLIHN1YnByb2Nlc3MgYW5kIG5ldmVyIHN1cmZhY2UgYSBob3N0XG5cdCAqIHRlcm1pbmFsIHJlc291cmNlLCBzbyB0aGUgd29ya3RyZWUgc3VpdGUgdmVyaWZpZXMgaXNvbGF0aW9uIHZpYSB0aGVcblx0ICogcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkgYWxvbmUgZm9yIHRoZW0uXG5cdCAqL1xuXHRyZWFkb25seSBzdXBwb3J0c0hvc3RUZXJtaW5hbFRvb2w6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBQcm92aWRlciBleHBvc2VzIGEgc3ViYWdlbnQgdG9vbCAoYHRhc2tgIC8gYFRhc2tgKSB0aGF0IHByb2R1Y2VzXG5cdCAqIGBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50YCBhbmQgcm91dGVzIGlubmVyIHRvb2wgY2FsbHMgdG8gYSBjaGlsZFxuXHQgKiBzZXNzaW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNTdWJhZ2VudHM6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSBwcm92aWRlciBzdXBwb3J0cyBjcmVhdGluZyBzaWRlIGNoYXRzIGZyb20gYSBzb3VyY2UgdHVybi4gKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNTaWRlQ2hhdHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHNoZWxsLWRlcGVuZGVudCByZXBsYXkgdGVzdHMgYXJlIHNraXBwZWQgb24gTGludXggYmVjYXVzZSB0aGlzXG5cdCAqIHByb3ZpZGVyIGNvbXBsZXRlcyByZWNvcmRlZCBzaGVsbC10b29sIHR1cm5zIHdpdGhvdXQgZW1pdHRpbmcgdG9vbC1jYWxsXG5cdCAqIG5vdGlmaWNhdGlvbnMgdGhlcmUuIFJlY29yZGluZyBhbmQgb3RoZXIgcGxhdGZvcm1zIGtlZXAgZnVsbCBjb3ZlcmFnZS5cblx0ICovXG5cdHJlYWRvbmx5IHNoZWxsVG9vbFJlcGxheVVuc3RhYmxlT25MaW51eD86IGJvb2xlYW47XG5cdC8qKiBQcm92aWRlciBpbnRlcm1pdHRlbnRseSBjb21wbGV0ZXMgc3VjY2Vzc2Z1bCBzaGVsbCBjYWxscyB3aXRob3V0IGV4cG9zaW5nIHJlc3VsdCB0ZXh0LiAqL1xuXHRyZWFkb25seSBzaGVsbFRvb2xSZXN1bHRUZXh0VW5yZWxpYWJsZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgdGhlIHN1YmFnZW50LXJlb3BlbiAoXCJyZXBsYXkgcGF0aFwiKSB0ZXN0IGlzIHNraXBwZWQgb24gV2luZG93cyBmb3Jcblx0ICogdGhpcyBwcm92aWRlciwgd2hpY2ggcmVidWlsZHMgdGhlIHJlb3BlbmVkIHRyYW5zY3JpcHQgZnJvbSB0aGUgYnVuZGxlZCBTREsnc1xuXHQgKiBvbi1kaXNrIGBzdWJhZ2VudHMvYWdlbnQtKi5qc29ubGAgZmlsZXMgXHUyMDE0IG5vdCByZWxpYWJseSB2aXNpYmxlIG9uIFdpbmRvd3Ncblx0ICogcmlnaHQgYWZ0ZXIgdGhlIHR1cm4sIHNvIHRoZSB0cmFuc2NyaXB0IGNhbiBjb21lIGJhY2sgZW1wdHkuIG1hY09TL0xpbnV4IGtlZXBcblx0ICogZnVsbCBjb3ZlcmFnZTsgcHJvdmlkZXJzIHRoYXQgcmVidWlsZCBmcm9tIHRoZSBpbi1wcm9jZXNzIGV2ZW50IGxvZyAoQ29waWxvdClcblx0ICogYXJlIHVuYWZmZWN0ZWQgYW5kIHN0YXkgZW5hYmxlZCBvbiBXaW5kb3dzLlxuXHQgKi9cblx0cmVhZG9ubHkgc3ViYWdlbnRSZXBsYXlVbnN0YWJsZU9uV2luZG93cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBwcm92aWRlcidzIHBsYW4tbW9kZSBmbG93IG1hdGNoZXMgdGhlIHNoYXJlZCB0ZXN0J3Ncblx0ICogZXhwZWN0YXRpb25zIChhdXRvLWFwcHJvdmUgc2Vzc2lvbi1zdGF0ZSB3cml0ZXM7IHJlYWNoIHRoZVxuXHQgKiBleGl0LXBsYW4tbW9kZSB0b29sIGFzIGFuIGBpbnB1dFJlcXVlc3RlZGApLiBDdXJyZW50bHkgdHJ1ZSBvbmx5IGZvclxuXHQgKiBDb3BpbG90IFx1MjAxNCBDbGF1ZGUncyBwbGFuLW1vZGUgcHJvbXB0IGNvbnZlbnRpb25zIGRpZmZlciBlbm91Z2ggdGhhdCB0aGVcblx0ICogc2hhcmVkIHRlc3QgcHJvbXB0IGRvZXNuJ3QgcmVsaWFibHkgZHJpdmUgaXQgdG8gYEV4aXRQbGFuTW9kZWAuXG5cdCAqL1xuXHRyZWFkb25seSBzdXBwb3J0c1BsYW5Nb2RlOiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgcHJvdmlkZXIgc3VwcG9ydHMgYWRkaXRpb25hbCBwZWVyIGNoYXRzIGFuZCBjaGF0IGZvcmtzLiAqL1xuXHRyZWFkb25seSBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIG1vZGVsLWJhY2tlZCBtdWx0aXBsZS1jaGF0IHBhcml0eSBzY2VuYXJpb3MgaGF2ZSBkZXRlcm1pbmlzdGljIGZpeHR1cmVzLiAqL1xuXHRyZWFkb25seSBzdXBwb3J0c011bHRpcGxlQ2hhdHNFMkU/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdXBwb3J0c0NoYXRGb3JrOiBib29sZWFuO1xuXHQvKiogV2hldGhlciBwcm92aWRlci1iYWNrZWQgZm9yayBjb250ZXh0IGNhbiBiZSB0ZXN0ZWQgZW5kLXRvLWVuZC4gKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNDaGF0Rm9ya0UyRTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIGdpdGh1YiB0b2tlbiB0byB1c2UuIElmIG5vdCBwcm92aWRlZCwgdGhlIHRlc3Qgd2lsbCBhdHRlbXB0IHRvIHJlc29sdmUgaXQgZnJvbSB0aGUgZW52aXJvbm1lbnQgb3IgYGdoIGF1dGggdG9rZW5gLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2l0aHViVG9rZW4/OiBzdHJpbmc7XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBTZXNzaW9uIGNyZWF0aW9uIC8gZGlzcGF0Y2hcblxuLyoqIENyZWF0ZSBhIHNlc3Npb24gZm9yIHRoZSBjb25maWd1cmVkIHByb3ZpZGVyLCBhdXRoZW50aWNhdGUsIHN1YnNjcmliZSwgYW5kIHJldHVybiB0aGUgc2Vzc2lvbiBVUkkuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlUmVhbFNlc3Npb24oXG5cdGM6IFRlc3RQcm90b2NvbENsaWVudCxcblx0Y29uZmlnOiBJQWdlbnRIb3N0RTJFUHJvdmlkZXJDb25maWcsXG5cdGNsaWVudElkOiBzdHJpbmcsXG5cdHRyYWNraW5nTGlzdDogc3RyaW5nW10sXG5cdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSxcblx0YmVmb3JlQ3JlYXRlU2Vzc2lvbj86ICgpID0+IFByb21pc2U8dm9pZD4sXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUHJvdmlkZXJTZXNzaW9uKGMsIHtcblx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdHNjaGVtZTogY29uZmlnLnNjaGVtZSxcblx0XHRnaXRodWJUb2tlbjogY29uZmlnLmdpdGh1YlRva2VuID8/IHJlc29sdmVHaXRIdWJUb2tlbigpLFxuXHR9LCBjbGllbnRJZCwgdHJhY2tpbmdMaXN0LCB3b3JraW5nRGlyZWN0b3J5LCBiZWZvcmVDcmVhdGVTZXNzaW9uKTtcblx0Yy5zZXRBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24oe1xuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdGhvbWVEaXJlY3Rvcnk6IGhvbWVkaXIoKSxcblx0XHR1c2VyTmFtZTogdXNlckluZm8oKS51c2VybmFtZSxcblx0fSk7XG5cdGMuY2xlYXJBaHBTbmFwc2hvdCgpO1xuXG5cdHJldHVybiBzZXNzaW9uVXJpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuQWhwU25hcHNob3RUZXN0KFxuXHRjOiBUZXN0UHJvdG9jb2xDbGllbnQsXG5cdGNvbmZpZzogSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnLFxuXHR0ZXN0OiBNb2NoYS5SdW5uYWJsZSxcblx0dHJhY2tpbmdMaXN0OiBzdHJpbmdbXSxcblx0dGVtcERpcnM6IHN0cmluZ1tdLFxuXHRvcHRpb25zPzogSUFocFNuYXBzaG90T3B0aW9ucyxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzY2VuYXJpbyA9IEFocFNuYXBzaG90U2NlbmFyaW8ubG9hZCh0ZXN0KTtcblx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtc25hcHNob3QtJykpO1xuXHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oYywgY29uZmlnLCBzY2VuYXJpby5jbGllbnRJZCwgdHJhY2tpbmdMaXN0LCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdGF3YWl0IHNjZW5hcmlvLnJ1bihjLCBzZXNzaW9uVXJpLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IHsgZGlzcGF0Y2hUdXJuLCBkaXNwYXRjaFR1cm5XaXRoQXR0YWNobWVudHMgfTtcblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIElucHV0IGFuc3dlciBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY2NlcHRlZEFuc3dlcnMocmVxdWVzdDogQ2hhdElucHV0UmVxdWVzdCk6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJlcXVlc3QucXVlc3Rpb25zPy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhyZXF1ZXN0LnF1ZXN0aW9ucy5tYXAocXVlc3Rpb24gPT4ge1xuXHRcdHN3aXRjaCAocXVlc3Rpb24ua2luZCkge1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dDpcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPz8gJ2ludGVyYWN0aXZlJyB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTnVtYmVyOlxuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuSW50ZWdlcjpcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLk51bWJlciwgdmFsdWU6IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA/PyBxdWVzdGlvbi5taW4gPz8gMSB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuQm9vbGVhbjpcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLkJvb2xlYW4sIHZhbHVlOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPz8gdHJ1ZSB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0OiB7XG5cdFx0XHRcdC8vIEZvciBwbGFuLW1vZGUgcmV2aWV3cywgcHJlZmVyIGFwcHJvdmluZyB0aGUgcGxhbiBXSVRIT1VUXG5cdFx0XHRcdC8vIGF1dG8tZXhlY3V0aW5nIGl0IChgZXhpdF9vbmx5YCkgc28gdGhlIHR1cm4gZW5kcyBpbnN0ZWFkIG9mXG5cdFx0XHRcdC8vIGNvbnRpbnVpbmcgdG8gaW1wbGVtZW50IGluLXR1cm4gXHUyMDE0IHdoaWNoIHdvdWxkIHN1cmZhY2Vcblx0XHRcdFx0Ly8gdG9vbC1jYWxsIGNvbmZpcm1hdGlvbnMgdGhlIHBsYW5uaW5nIHRlc3QgYXNzZXJ0cyBhZ2FpbnN0LlxuXHRcdFx0XHQvLyBGYWxsIGJhY2sgdG8gYW4gYGludGVyYWN0aXZlYCBvcHRpb24sIHRoZW4gdGhlIHJlY29tbWVuZGVkXG5cdFx0XHRcdC8vIG9wdGlvbiwgdGhlbiB0aGUgZmlyc3QuXG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZE9wdGlvbiA9IHF1ZXN0aW9uLm9wdGlvbnMuZmluZChvcHRpb24gPT4gL2V4aXRfb25seS9pLnRlc3Qob3B0aW9uLmlkKSlcblx0XHRcdFx0XHQ/PyBxdWVzdGlvbi5vcHRpb25zLmZpbmQob3B0aW9uID0+IC9pbnRlcmFjdGl2ZS9pLnRlc3Qob3B0aW9uLmlkKSB8fCAvaW50ZXJhY3RpdmUvaS50ZXN0KG9wdGlvbi5sYWJlbCkpXG5cdFx0XHRcdFx0Pz8gcXVlc3Rpb24ub3B0aW9ucy5maW5kKG9wdGlvbiA9PiBvcHRpb24ucmVjb21tZW5kZWQpXG5cdFx0XHRcdFx0Pz8gcXVlc3Rpb24ub3B0aW9uc1swXTtcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogcHJlZmVycmVkT3B0aW9uLmlkIH0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIENoYXRJbnB1dEFuc3dlcl07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENoYXRJbnB1dFF1ZXN0aW9uS2luZC5NdWx0aVNlbGVjdDoge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJyZWRPcHRpb25zID0gcXVlc3Rpb24ub3B0aW9ucy5maWx0ZXIob3B0aW9uID0+IG9wdGlvbi5yZWNvbW1lbmRlZCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkT3B0aW9ucyA9IHByZWZlcnJlZE9wdGlvbnMubGVuZ3RoID4gMCA/IHByZWZlcnJlZE9wdGlvbnMgOiBxdWVzdGlvbi5vcHRpb25zLnNsaWNlKDAsIDEpO1xuXHRcdFx0XHRyZXR1cm4gW3F1ZXN0aW9uLmlkLCB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogc2VsZWN0ZWRPcHRpb25zLm1hcChvcHRpb24gPT4gb3B0aW9uLmlkKSB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0fVxuXHRcdH1cblx0fSkpO1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gUmVzcG9uc2UgLyB0dXJuIGRyaXZlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1hcmtkb3duUmVzcG9uc2VUZXh0KGM6IFRlc3RQcm90b2NvbENsaWVudCk6IHN0cmluZyB7XG5cdGNvbnN0IG1hcmtkb3duUGFydElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBwaWVjZXM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3Qgbm90aWZpY2F0aW9uIG9mIGMucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT5cblx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9yZXNwb25zZVBhcnQnKSB8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9kZWx0YScpXG5cdCkpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbjtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09ICdjaGF0L3Jlc3BvbnNlUGFydCcgJiYgYWN0aW9uLnBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bikge1xuXHRcdFx0bWFya2Rvd25QYXJ0SWRzLmFkZChhY3Rpb24ucGFydC5pZCk7XG5cdFx0XHRwaWVjZXMucHVzaChhY3Rpb24ucGFydC5jb250ZW50KTtcblx0XHR9IGVsc2UgaWYgKGFjdGlvbi50eXBlID09PSAnY2hhdC9kZWx0YScgJiYgbWFya2Rvd25QYXJ0SWRzLmhhcyhhY3Rpb24ucGFydElkKSkge1xuXHRcdFx0cGllY2VzLnB1c2goYWN0aW9uLmNvbnRlbnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcGllY2VzLmpvaW4oJycpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEcml2ZW5UdXJuUmVzdWx0IHtcblx0c2F3SW5wdXRSZXF1ZXN0OiBib29sZWFuO1xuXHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiBib29sZWFuO1xuXHRyZXNwb25zZVRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVyblRvQ29tcGxldGlvbihjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiBQcm9taXNlPElEcml2ZW5UdXJuUmVzdWx0PiB7XG5cdHJldHVybiBkcml2ZVR1cm4oYywgc2Vzc2lvbiwgdHVybklkLCBjbGllbnRTZXEsICgpID0+IGRpc3BhdGNoVHVybihjLCBzZXNzaW9uLCB0dXJuSWQsIHRleHQsIGNsaWVudFNlcSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZHJpdmVUdXJuV2l0aEF0dGFjaG1lbnRzVG9Db21wbGV0aW9uKGM6IFRlc3RQcm90b2NvbENsaWVudCwgc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBhdHRhY2htZW50czogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgY2xpZW50U2VxOiBudW1iZXIpOiBQcm9taXNlPElEcml2ZW5UdXJuUmVzdWx0PiB7XG5cdHJldHVybiBkcml2ZVR1cm4oYywgc2Vzc2lvbiwgdHVybklkLCBjbGllbnRTZXEsICgpID0+IGRpc3BhdGNoVHVybldpdGhBdHRhY2htZW50cyhjLCBzZXNzaW9uLCB0dXJuSWQsIHRleHQsIGF0dGFjaG1lbnRzLCBjbGllbnRTZXEpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVybldpdGhNb2RlbFRvQ29tcGxldGlvbihjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgbW9kZWw6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiBQcm9taXNlPElEcml2ZW5UdXJuUmVzdWx0PiB7XG5cdHJldHVybiBkcml2ZVR1cm4oYywgc2Vzc2lvbiwgdHVybklkLCBjbGllbnRTZXEsICgpID0+IGMuZGlzcGF0Y2goe1xuXHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksXG5cdFx0Y2xpZW50U2VxLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogeyBpZDogbW9kZWwgfSB9LFxuXHRcdH0sXG5cdH0pKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVybldpdGhDYW5jZWxsZWRJbnB1dFRvQ29tcGxldGlvbihjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiBQcm9taXNlPElEcml2ZW5UdXJuUmVzdWx0PiB7XG5cdHJldHVybiBkcml2ZVR1cm4oYywgc2Vzc2lvbiwgdHVybklkLCBjbGllbnRTZXEsICgpID0+IGRpc3BhdGNoVHVybihjLCBzZXNzaW9uLCB0dXJuSWQsIHRleHQsIGNsaWVudFNlcSksIENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZHJpdmVUdXJuV2l0aEFuc3dlcnNUb0NvbXBsZXRpb24oYzogVGVzdFByb3RvY29sQ2xpZW50LCBzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyLCBnZXRBbnN3ZXJzOiAocmVxdWVzdDogQ2hhdElucHV0UmVxdWVzdCkgPT4gUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPik6IFByb21pc2U8SURyaXZlblR1cm5SZXN1bHQ+IHtcblx0cmV0dXJuIGRyaXZlVHVybihjLCBzZXNzaW9uLCB0dXJuSWQsIGNsaWVudFNlcSwgKCkgPT4gZGlzcGF0Y2hUdXJuKGMsIHNlc3Npb24sIHR1cm5JZCwgdGV4dCwgY2xpZW50U2VxKSwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgZ2V0QW5zd2Vycyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVybihjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyLCBkaXNwYXRjaDogKCkgPT4gdm9pZCwgaW5wdXRSZXNwb25zZSA9IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsIGFuc3dlclByb3ZpZGVyID0gZ2V0QWNjZXB0ZWRBbnN3ZXJzKTogUHJvbWlzZTxJRHJpdmVuVHVyblJlc3VsdD4ge1xuXHRjLmNsZWFyUmVjZWl2ZWQoKTtcblx0ZGlzcGF0Y2goKTtcblxuXHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblx0Y29uc3Qgc2Vlbk5vdGlmaWNhdGlvbnMgPSBuZXcgU2V0PG9iamVjdD4oKTtcblx0bGV0IG5leHRDbGllbnRTZXEgPSBjbGllbnRTZXEgKyAxO1xuXHRsZXQgc2F3SW5wdXRSZXF1ZXN0ID0gZmFsc2U7XG5cdGxldCBzYXdQZW5kaW5nQ29uZmlybWF0aW9uID0gZmFsc2U7XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjLndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoc2Vlbk5vdGlmaWNhdGlvbnMuaGFzKG4gYXMgb2JqZWN0KVxuXHRcdFx0XHR8fCAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKVxuXHRcdFx0XHRcdCYmICFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpXG5cdFx0XHRcdFx0JiYgIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdFx0JiYgIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJykpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZDtcblx0XHR9LCA5MF8wMDApO1xuXHRcdHNlZW5Ob3RpZmljYXRpb25zLmFkZChub3RpZmljYXRpb24gYXMgb2JqZWN0KTtcblxuXHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L2Vycm9yJykpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIENoYXRFcnJvckFjdGlvbjtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBlcnJvciB3aGlsZSBkcml2aW5nICR7dHVybklkfTogJHthY3Rpb24uZXJyb3IuZXJyb3JUeXBlfTogJHthY3Rpb24uZXJyb3IubWVzc2FnZX1gKTtcblx0XHR9XG5cblx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uO1xuXHRcdFx0aWYgKCFhY3Rpb24uY29uZmlybWVkKSB7XG5cdFx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb24gPSB0cnVlO1xuXHRcdFx0XHRjLmRpc3BhdGNoKHtcblx0XHRcdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pLFxuXHRcdFx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSsrLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiwgJ2NoYXQvaW5wdXRSZXF1ZXN0ZWQnKSkge1xuXHRcdFx0c2F3SW5wdXRSZXF1ZXN0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIENoYXRJbnB1dFJlcXVlc3RlZEFjdGlvbjtcblx0XHRcdGMuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pLFxuXHRcdFx0XHRjbGllbnRTZXE6IG5leHRDbGllbnRTZXErKyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRDb21wbGV0ZWQsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBhY3Rpb24ucmVxdWVzdC5pZCxcblx0XHRcdFx0XHRyZXNwb25zZTogaW5wdXRSZXNwb25zZSxcblx0XHRcdFx0XHRhbnN3ZXJzOiBpbnB1dFJlc3BvbnNlID09PSBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0ID8gYW5zd2VyUHJvdmlkZXIoYWN0aW9uLnJlcXVlc3QpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR1cm5JZCwgdHVybklkKTtcblx0XHRicmVhaztcblx0fVxuXG5cdHJldHVybiB7IHNhd0lucHV0UmVxdWVzdCwgc2F3UGVuZGluZ0NvbmZpcm1hdGlvbiwgcmVzcG9uc2VUZXh0OiBnZXRNYXJrZG93blJlc3BvbnNlVGV4dChjKSB9O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gQXBwcm92YWwtbG9vcCBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiB0ZXJtaW5hbFJlc291cmNlRnJvbUNvbnRlbnQoY29udGVudDogcmVhZG9ubHkgVG9vbFJlc3VsdENvbnRlbnRbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHRlcm1pbmFsQ29udGVudCA9IGNvbnRlbnQuZmluZChjID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsKTtcblx0cmV0dXJuIHRlcm1pbmFsQ29udGVudD8ucmVzb3VyY2U7XG59XG5cbi8qKiBDb25jYXRlbmF0ZXMgdGhlIHRleHQgb2YgYW55IHtAbGluayBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dH0gcGFydHMgaW4gYSB0b29sIHJlc3VsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0ZXh0RnJvbUNvbnRlbnQoY29udGVudDogcmVhZG9ubHkgVG9vbFJlc3VsdENvbnRlbnRbXSk6IHN0cmluZyB7XG5cdHJldHVybiBjb250ZW50XG5cdFx0LmZpbHRlcigoYyk6IGMgaXMgRXh0cmFjdDxUb29sUmVzdWx0Q29udGVudCwgeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCB9PiA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0KVxuXHRcdC5tYXAoYyA9PiBjLnRleHQpXG5cdFx0LmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiB0b29sUmVzdWx0VGV4dChjb250ZW50OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKCFjb250ZW50KSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IHRlcm1pbmFsVGV4dHM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgcGFydCBvZiBjb250ZW50KSB7XG5cdFx0aWYgKHBhcnQudHlwZSAhPT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHBhcnQucmVzdWx0Py5wcmV2aWV3KSB7XG5cdFx0XHR0ZXJtaW5hbFRleHRzLnB1c2gocGFydC5yZXN1bHQucHJldmlldyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBbdGV4dEZyb21Db250ZW50KGNvbnRlbnQpLCAuLi50ZXJtaW5hbFRleHRzXS5maWx0ZXIodGV4dCA9PiB0ZXh0Lmxlbmd0aCA+IDApLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVUb29sUmVzdWx0VGV4dCh2YWx1ZTogc3RyaW5nLCB3b3Jrc3BhY2U/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB3aXRob3V0QW5zaSA9IHJlbW92ZUFuc2lFc2NhcGVDb2Rlcyh2YWx1ZSkucmVwbGFjZUFsbCgnXFxyXFxuJywgJ1xcbicpLnJlcGxhY2VBbGwoJ1xccicsICdcXG4nKTtcblx0bGV0IG5vcm1hbGl6ZWRXb3Jrc3BhY2UgPSB3aXRob3V0QW5zaTtcblx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdG5vcm1hbGl6ZWRXb3Jrc3BhY2UgPSBub3JtYWxpemVkV29ya3NwYWNlXG5cdFx0XHQucmVwbGFjZUFsbChyZWFscGF0aFN5bmMod29ya3NwYWNlKSwgJyR7d29ya2Rpcn0nKVxuXHRcdFx0LnJlcGxhY2VBbGwod29ya3NwYWNlLCAnJHt3b3JrZGlyfScpO1xuXHR9XG5cdHJldHVybiBub3JtYWxpemVkV29ya3NwYWNlLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpLnRyaW0oKTtcbn1cblxuLyoqIEFzc2VydHMgZGV0ZXJtaW5pc3RpYyBjb250ZW50IGZyb20gYSBjb21wbGV0ZWQgdG9vbCBjYWxsIGluc3RlYWQgb2YgdHJ1c3RpbmcgcmVwbGF5ZWQgYXNzaXN0YW50IHByb3NlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0KFxuXHRjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudCxcblx0b3B0aW9uczogeyByZWFkb25seSBjaGFubmVsOiBzdHJpbmc7IHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nOyByZWFkb25seSB0b29sTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdOyByZWFkb25seSB3b3Jrc3BhY2U/OiBzdHJpbmc7IHJlYWRvbmx5IGV4cGVjdGVkOiByZWFkb25seSBSZWdFeHBbXTsgcmVhZG9ubHkgc3VjY2Vzcz86IGJvb2xlYW4gfSxcbik6IHZvaWQge1xuXHRjb25zdCB0b29sTmFtZXMgPSBuZXcgU2V0KG9wdGlvbnMudG9vbE5hbWVzLm1hcChub3JtYWxpemVTaGVsbFRvb2xOYW1lRm9yQ2FwdHVyZSkpO1xuXHRjb25zdCBzdGFydHMgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKVxuXHRcdC5tYXAobiA9PiAoeyBlbnZlbG9wZTogZ2V0QWN0aW9uRW52ZWxvcGUobiksIGFjdGlvbjogZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uIH0pKVxuXHRcdC5maWx0ZXIoKHsgZW52ZWxvcGUsIGFjdGlvbiB9KSA9PiBlbnZlbG9wZS5jaGFubmVsID09PSBvcHRpb25zLmNoYW5uZWwgJiYgYWN0aW9uLnR1cm5JZCA9PT0gb3B0aW9ucy50dXJuSWQgJiYgdG9vbE5hbWVzLmhhcyhub3JtYWxpemVTaGVsbFRvb2xOYW1lRm9yQ2FwdHVyZShhY3Rpb24udG9vbE5hbWUpKSk7XG5cdGNvbnN0IHN0YXJ0ZWRUb29sQ2FsbElkcyA9IG5ldyBTZXQoc3RhcnRzLm1hcCgoeyBhY3Rpb24gfSkgPT4gYWN0aW9uLnRvb2xDYWxsSWQpKTtcblx0Y29uc3QgY29tcGxldGlvbnMgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKVxuXHRcdC5tYXAobiA9PiAoeyBlbnZlbG9wZTogZ2V0QWN0aW9uRW52ZWxvcGUobiksIGFjdGlvbjogZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uIH0pKVxuXHRcdC5maWx0ZXIoKHsgZW52ZWxvcGUsIGFjdGlvbiB9KSA9PiBlbnZlbG9wZS5jaGFubmVsID09PSBvcHRpb25zLmNoYW5uZWwgJiYgYWN0aW9uLnR1cm5JZCA9PT0gb3B0aW9ucy50dXJuSWQgJiYgc3RhcnRlZFRvb2xDYWxsSWRzLmhhcyhhY3Rpb24udG9vbENhbGxJZCkpO1xuXHRjb25zdCBvYnNlcnZlZDogeyB0b29sQ2FsbElkOiBzdHJpbmc7IHN1Y2Nlc3M6IGJvb2xlYW47IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcblx0bGV0IG1hdGNoaW5nQ29tcGxldGlvbjogQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgeyBhY3Rpb24gfSBvZiBjb21wbGV0aW9ucykge1xuXHRcdGlmIChvcHRpb25zLnN1Y2Nlc3MgIT09IHVuZGVmaW5lZCAmJiBhY3Rpb24ucmVzdWx0LnN1Y2Nlc3MgIT09IG9wdGlvbnMuc3VjY2Vzcykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHRleHQgPSBub3JtYWxpemVUb29sUmVzdWx0VGV4dCh0b29sUmVzdWx0VGV4dChhY3Rpb24ucmVzdWx0LmNvbnRlbnQpLCBvcHRpb25zLndvcmtzcGFjZSk7XG5cdFx0b2JzZXJ2ZWQucHVzaCh7IHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBzdWNjZXNzOiBhY3Rpb24ucmVzdWx0LnN1Y2Nlc3MsIHRleHQgfSk7XG5cdFx0aWYgKG9wdGlvbnMuZXhwZWN0ZWQuZXZlcnkoZXhwZWN0ZWQgPT4gZXhwZWN0ZWQudGVzdCh0ZXh0KSkpIHtcblx0XHRcdG1hdGNoaW5nQ29tcGxldGlvbiA9IGFjdGlvbjtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXHRhc3NlcnQub2sobWF0Y2hpbmdDb21wbGV0aW9uLCBgZXhwZWN0ZWQgJHtvcHRpb25zLnR1cm5JZH0gdG8gY29tcGxldGUgJHtvcHRpb25zLnRvb2xOYW1lcy5qb2luKCcvJyl9IHdpdGggcmVzdWx0IHRleHQgbWF0Y2hpbmcgJHtvcHRpb25zLmV4cGVjdGVkLm1hcChTdHJpbmcpLmpvaW4oJywgJyl9OyBvYnNlcnZlZCAke29ic2VydmVkLm1hcCh2YWx1ZSA9PiBKU09OLnN0cmluZ2lmeSh2YWx1ZSkpLmpvaW4oJywgJyl9YCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0ZXJtaW5hbFRleHQoc3RhdGU6IFRlcm1pbmFsU3RhdGUpOiBzdHJpbmcge1xuXHRyZXR1cm4gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKHN0YXRlLmNvbnRlbnQubWFwKHBhcnQgPT4gcGFydC50eXBlID09PSAnY29tbWFuZCcgPyBgJHtwYXJ0LmNvbW1hbmRMaW5lfVxcbiR7cGFydC5vdXRwdXR9YCA6IHBhcnQudmFsdWUpLmpvaW4oJycpKTtcbn1cblxuLyoqIExvb2tzIHVwIHRoZSB0b29sTmFtZSBmb3IgYSB0b29sQ2FsbFJlYWR5IGJ5IGpvaW5pbmcgYWdhaW5zdCB0aGUgbWF0Y2hpbmcgdG9vbENhbGxTdGFydC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kVG9vbE5hbWVGb3JDYWxsKGM6IFRlc3RQcm90b2NvbENsaWVudCwgdG9vbENhbGxJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGMucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKVxuXHRcdC5tYXAobiA9PiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24pXG5cdFx0LmZpbmQoYSA9PiBhLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQpPy50b29sTmFtZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQXBwcm92YWxSdWxlIHtcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgbWF0Y2hJbnB1dD86ICh0b29sSW5wdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5zcGVjdD86IChpbmZvOiB7IGFjdGlvbjogQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247IGVycm9yczogc3RyaW5nW10gfSkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQmFja2dyb3VuZEFwcHJvdmFsTG9vcE9wdGlvbnMge1xuXHRyZWFkb25seSBhcHByb3ZhbFNlcVN0YXJ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFsbG93OiByZWFkb25seSBJQXBwcm92YWxSdWxlW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhY2tncm91bmRBcHByb3ZhbExvb3Age1xuXHRyZWFkb25seSBlcnJvcnM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBhcHByb3ZlZFRvb2xOYW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgb2JzZXJ2ZWRUb29sTmFtZXM6IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cdHN0b3AoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqXG4gKiBBdXRvLWFwcHJvdmVzIHBlbmRpbmcgdG9vbC1jYWxsIGNvbmZpcm1hdGlvbnMgdGhhdCBtYXRjaCB0aGUgc3VwcGxpZWRcbiAqIGFsbG93LWxpc3QuIEFueXRoaW5nIG91dHNpZGUgdGhlIGFsbG93LWxpc3QgaXMgZGVuaWVkIGFuZCByZWNvcmRlZCBhcyBhblxuICogZXJyb3Igc28gdGhlIHRlc3QgZmFpbHMgbG91ZGx5IGluc3RlYWQgb2Ygc2lsZW50bHkgYXBwcm92aW5nIG1vZGVsLWNob3NlblxuICogdG9vbCBjYWxscy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0QmFja2dyb3VuZEFwcHJvdmFsTG9vcChjOiBUZXN0UHJvdG9jb2xDbGllbnQsIG9wdGlvbnM6IElCYWNrZ3JvdW5kQXBwcm92YWxMb29wT3B0aW9ucyk6IElCYWNrZ3JvdW5kQXBwcm92YWxMb29wIHtcblx0Y29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBhcHByb3ZlZFRvb2xOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBvYnNlcnZlZFRvb2xOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBwcm9jZXNzZWRTZXFzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdGxldCBhY3RpdmUgPSB0cnVlO1xuXHRsZXQgYXBwcm92YWxTZXEgPSBvcHRpb25zLmFwcHJvdmFsU2VxU3RhcnQ7XG5cblx0Y29uc3QgbG9vcCA9IChhc3luYyAoKSA9PiB7XG5cdFx0d2hpbGUgKGFjdGl2ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVhZHkgPSBhd2FpdCBjLndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuICFwcm9jZXNzZWRTZXFzLmhhcyhnZXRBY3Rpb25FbnZlbG9wZShuKS5zZXJ2ZXJTZXEpO1xuXHRcdFx0XHR9LCAyXzAwMCk7XG5cdFx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUocmVhZHkpO1xuXHRcdFx0XHRwcm9jZXNzZWRTZXFzLmFkZChlbnZlbG9wZS5zZXJ2ZXJTZXEpO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRcdGlmIChhY3Rpb24uY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0b29sTmFtZSA9IGZpbmRUb29sTmFtZUZvckNhbGwoYywgYWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAodG9vbE5hbWUpIHtcblx0XHRcdFx0XHRvYnNlcnZlZFRvb2xOYW1lcy5hZGQodG9vbE5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nUnVsZSA9IG9wdGlvbnMuYWxsb3cuZmluZChydWxlID0+XG5cdFx0XHRcdFx0cnVsZS50b29sTmFtZSA9PT0gdG9vbE5hbWVcblx0XHRcdFx0XHQmJiAocnVsZS5tYXRjaElucHV0Py4oZ2V0SW5saW5lVG9vbElucHV0KGFjdGlvbi50b29sSW5wdXQpKSA/PyB0cnVlKSk7XG5cblx0XHRcdFx0aWYgKCFtYXRjaGluZ1J1bGUpIHtcblx0XHRcdFx0XHRlcnJvcnMucHVzaChgdW5leHBlY3RlZCB0b29sIGNhbGw6IHRvb2xOYW1lPSR7dG9vbE5hbWUgPz8gJzx1bmtub3duPid9IGlucHV0PSR7SlNPTi5zdHJpbmdpZnkoYWN0aW9uLnRvb2xJbnB1dCl9YCk7XG5cdFx0XHRcdFx0Yy5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0XHRjaGFubmVsOiBlbnZlbG9wZS5jaGFubmVsLFxuXHRcdFx0XHRcdFx0Y2xpZW50U2VxOiArK2FwcHJvdmFsU2VxLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGFjdGlvbi50dXJuSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hdGNoaW5nUnVsZS5pbnNwZWN0Py4oeyBhY3Rpb24sIGVycm9ycyB9KTtcblx0XHRcdFx0YXBwcm92ZWRUb29sTmFtZXMuYWRkKG1hdGNoaW5nUnVsZS50b29sTmFtZSk7XG5cblx0XHRcdFx0Yy5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogZW52ZWxvcGUuY2hhbm5lbCxcblx0XHRcdFx0XHRjbGllbnRTZXE6ICsrYXBwcm92YWxTZXEsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZDogYWN0aW9uLnR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuXHRcdFx0XHQvLyBFeHBlY3RlZDogdGhlIDItc2Vjb25kIHBvbGwncyBgVGltZW91dCB3YWl0aW5nIGZvciBub3RpZmljYXRpb25gLlxuXHRcdFx0XHQvLyBBbnl0aGluZyBlbHNlIChlLmcuICdDbGllbnQgY2xvc2VkJywgZXhjZXB0aW9uIGZyb21cblx0XHRcdFx0Ly8gYG1hdGNoaW5nUnVsZS5pbnNwZWN0YCkgaXMgYSByZWFsIGZhaWx1cmUgXHUyMDE0IHJlY29yZCBpdCBzbyB0aGVcblx0XHRcdFx0Ly8gdGVzdCBmYWlscyBkZXRlcm1pbmlzdGljYWxseS5cblx0XHRcdFx0aWYgKCEvdGltZW91dC9pLnRlc3QobXNnKSkge1xuXHRcdFx0XHRcdGVycm9ycy5wdXNoKGBhcHByb3ZhbCBsb29wIGVycm9yOiAke21zZ31gKTtcblx0XHRcdFx0XHRhY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSkoKTtcblxuXHRyZXR1cm4ge1xuXHRcdGVycm9ycywgYXBwcm92ZWRUb29sTmFtZXMsIG9ic2VydmVkVG9vbE5hbWVzLFxuXHRcdGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRhY3RpdmUgPSBmYWxzZTtcblx0XHRcdGF3YWl0IGxvb3A7XG5cdFx0fSxcblx0fTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIFNlcnZlciBsZWFzZVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGFnZW50IGhvc3Qgc2VydmVyICsgY29ubmVjdGVkIGNsaWVudCBsaWZlY3ljbGUgZm9yIG9uZSBlMmUgdGVzdCxcbiAqIGhpZGluZyB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHR3byBzdHJhdGVnaWVzOlxuICpcbiAqIC0gKipQZXItdGVzdCoqIChhbHdheXMgd2hpbGUgcmVjb3JkaW5nKTogc3RhcnQgYSBmcmVzaCBzZXJ2ZXIgKyBwcm94eSBmb3JcbiAqICAgZWFjaCB0ZXN0IGFuZCBraWxsIGl0IGluIHRlYXJkb3duLiBGdWxsIGlzb2xhdGlvbjsgZXZlcnkgdGVzdCBwYXlzIHNlcnZlclxuICogICBmb3JrICsgcHJvdmlkZXIgU0RLIGNsaWVudCBzdGFydHVwLlxuICogLSAqKlNoYXJlZCoqICh0aGUgZGVmYXVsdCBpbiByZXBsYXkpOiBzdGFydCB0aGUgc2VydmVyICsgcHJveHkgb25jZSwgdGhlbiBzd2FwXG4gKiAgIHRoZSBwZXItdGVzdCBmaXh0dXJlIHZpYSB7QGxpbmsgQ2FwaVJlcGxheVByb3h5LnJlc2V0Rm9yUmVwbGF5fSBhbmQgcmVjb25uZWN0XG4gKiAgIGEgZnJlc2ggY2xpZW50IGVhY2ggdGVzdC4gVGhlIGFnZW50IGhvc3QncyBjYWNoZWQgU0RLIGNsaWVudCAvIENMSSBzdWJwcm9jZXNzXG4gKiAgIGlzIHJldXNlZCwgc28gb25seSB0aGUgZmlyc3QgdGVzdCBwYXlzIHRoYXQgc3RhcnR1cC4gU2FmZSBhcyBsb25nIGFzIG5vIHRlc3RcbiAqICAgcmV0dXJucyBtaWQtdHVybjogb25lIHNlcnZlclxuICogICBzZXJ2ZXMgZXZlcnkgdGVzdCwgc28gYSB0dXJuIGxlZnQgaW4gZmxpZ2h0IHdvdWxkIGxlYWsgaXRzIGNvbnRpbnVhdGlvbiBpbnRvXG4gKiAgIHRoZSBuZXh0IHRlc3QncyBmaXh0dXJlIHdpbmRvdyBhcyBhIHN0cmljdCBjYWNoZSBtaXNzLlxuICpcbiAqIEJvdGggc3RyYXRlZ2llcyBkaXNwb3NlIGVhY2ggdGVzdCdzIHNlc3Npb25zIChhYm9ydC1maXJzdCwgdGhlblxuICogYGRpc3Bvc2VTZXNzaW9uYCkgYW5kIHZlcmlmeSB0aGUgcmVwbGF5IHRyYWZmaWM7IHRoZSBzaGFyZWQgc3RyYXRlZ3kgdmVyaWZpZXNcbiAqIHdpdGhvdXQgc3RvcHBpbmcgdGhlIHNlcnZlciBzbyB0aGUgbmV4dCB0ZXN0IGNhbiByZXVzZSBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEUyRVNlcnZlckxlYXNlIHtcblx0cHJpdmF0ZSBfc2VydmVyOiBJU2VydmVySGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hhcmVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9kYXRhRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgKiptb2RlbC1iYWNrZWQqKiB0ZXN0cyBzZXJ2ZWQgYnkgdGhlIGN1cnJlbnQgc2hhcmVkIHNlcnZlci4gQVxuXHQgKiBzaW5nbGUgbG9uZy1saXZlZCBob3N0IGNhY2hlcyBvbmUgcHJvdmlkZXIgU0RLL0NMSSBzdWJwcm9jZXNzIGFuZCByZXVzZXMgaXRcblx0ICogYWNyb3NzIGV2ZXJ5IHRlc3Q7IGFmdGVyIGVub3VnaCBtb2RlbC1kcml2ZW4gdHVybnMgdGhhdCBzdWJwcm9jZXNzIGNhblxuXHQgKiBhY2N1bXVsYXRlIHN0YXRlIGFuZCBldmVudHVhbGx5IHdlZGdlIGEgdHVybiAodHVybiBzdGFydHMsIGJ1dCBubyBtb2RlbFxuXHQgKiByZXNwb25zZSBhcnJpdmVzIGV2ZW4gdGhvdWdoIHJlcGxheSBpcyBpbnN0YW50KS4gUmVjeWNsaW5nIHRoZSBzZXJ2ZXIgd2VsbFxuXHQgKiBiZWZvcmUgdGhhdCBrZWVwcyBlYWNoIGhvc3QgaW5zdGFuY2Ugd2l0aGluIGl0cyByZWxpYWJsZSByYW5nZSB3aGlsZSBzdGlsbFxuXHQgKiBhbW9ydGl6aW5nIHN0YXJ0dXAuXG5cdCAqL1xuXHRwcml2YXRlIF9tb2RlbEJhY2tlZFRlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0cHJpdmF0ZSBfdGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPSAwO1xuXHRwcml2YXRlIF9jbGVhbnVwQ2xpZW50U2VxID0gMV8wMDBfMDAwO1xuXHRwcml2YXRlIF9jdXJyZW50Q2FwaVJlcGxheTogUmV0dXJuVHlwZTx0eXBlb2YgY2FwaVJlcGxheUZvcj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0T3B0aW9uczogeyByZWFkb25seSBjbGF1ZGVTZGtSb290Pzogc3RyaW5nOyByZWFkb25seSBjb2RleFNka1Jvb3Q/OiBzdHJpbmc7IHJlYWRvbmx5IGNvZGV4SG9tZURpcjogc3RyaW5nOyByZWFkb25seSBob21lRGlyOiBzdHJpbmc7IHJlYWRvbmx5IHVzZXJEYXRhRGlyOiBzdHJpbmc7IHJlYWRvbmx5IGVudjogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4gfTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0OiBJQWdlbnRIb3N0VGFyZ2V0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZzogSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnLFxuXHRcdHN0YXJ0T3B0aW9uczogeyByZWFkb25seSBjbGF1ZGVTZGtSb290Pzogc3RyaW5nOyByZWFkb25seSBjb2RleFNka1Jvb3Q/OiBzdHJpbmc7IHJlYWRvbmx5IHRhcmdldD86IElBZ2VudEhvc3RUYXJnZXQgfSA9IHt9LFxuXHQpIHtcblx0XHRjb25zdCBkYXRhRGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ3ZzY29kZS1hZ2VudC1ob3N0LWUyZS0nKSk7XG5cdFx0Y29uc3QgY29kZXhIb21lRGlyID0gam9pbihkYXRhRGlyLCAnLmNvZGV4Jyk7XG5cdFx0bWtkaXJTeW5jKGNvZGV4SG9tZURpcik7XG5cdFx0dGhpcy5fZGF0YURpciA9IGRhdGFEaXI7XG5cdFx0dGhpcy5fdGFyZ2V0ID0gc3RhcnRPcHRpb25zLnRhcmdldCA/PyBkZWZhdWx0QWdlbnRIb3N0VGFyZ2V0O1xuXHRcdHRoaXMuX3N0YXJ0T3B0aW9ucyA9IHtcblx0XHRcdGNsYXVkZVNka1Jvb3Q6IHN0YXJ0T3B0aW9ucy5jbGF1ZGVTZGtSb290LFxuXHRcdFx0Y29kZXhTZGtSb290OiBzdGFydE9wdGlvbnMuY29kZXhTZGtSb290LFxuXHRcdFx0Y29kZXhIb21lRGlyLFxuXHRcdFx0aG9tZURpcjogZGF0YURpcixcblx0XHRcdHVzZXJEYXRhRGlyOiBqb2luKGRhdGFEaXIsICd1c2VyLWRhdGEnKSxcblx0XHRcdGVudjogeyBbQWdlbnRIb3N0U2Vzc2lvblJlbGVhc2VHcmFjZU1zRW52VmFyXTogJzAnIH0sXG5cdFx0fTtcblx0XHQvLyBTZXJ2ZXIgcmV1c2UgaXMgYSByZXBsYXktb25seSBvcHRpbWl6YXRpb246IHJlY29yZGluZyB3cml0ZXMgb25lIGZpeHR1cmVcblx0XHQvLyBwZXIgcHJveHkgYW5kIHNvIG5lZWRzIGEgZnJlc2ggcHJveHkgKGhlbmNlIGEgZnJlc2ggc2VydmVyKSBwZXIgdGVzdC5cblx0XHQvLyBJbiByZXBsYXkgaXQgaXMgYWx3YXlzIHNhZmUgYmVjYXVzZSBldmVyeSB0ZXN0IGRyYWlucyBpdHMgdHVybnMsIHNvIHRoZVxuXHRcdC8vIHJldXNlZCBzZXJ2ZXIgY2FycmllcyBubyBpbi1mbGlnaHQgd29yayBhY3Jvc3MgdGVzdHMuXG5cdFx0dGhpcy5fc2hhcmVkID0gIVJFQ09SRDtcblx0fVxuXG5cdC8qKiBBY3F1aXJlIGEgc2VydmVyICsgY29ubmVjdGVkIGNsaWVudCBmb3IgYSB0ZXN0LCByZXR1cm5pbmcgYm90aC4gKi9cblx0YXN5bmMgYWNxdWlyZSh0ZXN0VGl0bGU6IHN0cmluZywgbW9kZWxUcmFmZmljOiBBZ2VudEhvc3RFMkVNb2RlbFRyYWZmaWMgPSAncmVjb3JkZWQnKTogUHJvbWlzZTx7IHNlcnZlcjogSVNlcnZlckhhbmRsZTsgY2xpZW50OiBUZXN0UHJvdG9jb2xDbGllbnQgfT4ge1xuXHRcdGNvbnN0IGNhcGlSZXBsYXkgPSBjYXBpUmVwbGF5Rm9yKHRoaXMuX2NvbmZpZy5wcm92aWRlciwgdGVzdFRpdGxlLCBtb2RlbFRyYWZmaWMpO1xuXHRcdHRoaXMuX2N1cnJlbnRDYXBpUmVwbGF5ID0gY2FwaVJlcGxheTtcblx0XHQvLyBCb3VuZCBib3RoIHByb3ZpZGVyLW1vZGVsIGxvYWQgYW5kIGhvc3Qtb3duZWQgcmVzb3VyY2UgYWNjdW11bGF0aW9uLlxuXHRcdGlmICh0aGlzLl9zaGFyZWQgJiYgdGhpcy5fc2VydmVyICYmIChcblx0XHRcdHRoaXMuX3Rlc3RzT25DdXJyZW50U2VydmVyID49IE1BWF9URVNUU19QRVJfU0hBUkVEX1NFUlZFUlxuXHRcdFx0fHwgdGhpcy5fbW9kZWxCYWNrZWRUZXN0c09uQ3VycmVudFNlcnZlciA+PSBNQVhfTU9ERUxfQkFDS0VEX1RFU1RTX1BFUl9TSEFSRURfU0VSVkVSXG5cdFx0KSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVjeWNsZVNoYXJlZFNlcnZlcigpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2hhcmVkICYmIHRoaXMuX3NlcnZlcikge1xuXHRcdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9zZXJ2ZXIuY2FwaVJlcGxheTtcblx0XHRcdGlmICghcHJveHkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbYWdlbnQtaG9zdC1lMmVdIHNoYXJlZCByZXBsYXkgc2VydmVyIGhhcyBubyBjYXBpUmVwbGF5IHByb3h5IHRvIHJlc2V0Jyk7XG5cdFx0XHR9XG5cdFx0XHRwcm94eS5yZXNldEZvclJlcGxheShjYXBpUmVwbGF5LmZpeHR1cmVQYXRoLCBjYXBpUmVwbGF5LmFsbG93U3RhbGVSZWNvcmRlZFJlcXVlc3QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBPbmx5IHRoZSBDb3BpbG90IENMSSBwcm92aWRlciB3cml0ZXMgdGhlIGBAZ2l0aHViL2NvcGlsb3RgIHJ1bnRpbWUgbG9ncyB3ZVxuXHRcdFx0Ly8gY2FwdHVyZSwgc28gb25seSBpdCBpcyBydW4gdmVyYm9zZWx5OyBDbGF1ZGUvQ29kZXggdXNlIHRoZWlyIG93biBydW50aW1lcy5cblx0XHRcdHRoaXMuX3NlcnZlciA9IGF3YWl0IHRoaXMuX3RhcmdldC5sYXVuY2goeyAuLi50aGlzLl9zdGFydE9wdGlvbnMsIGNhcGlSZXBsYXksIGxvZ0xldmVsOiB0aGlzLl9pc0NvcGlsb3RQcm92aWRlciA/ICd0cmFjZScgOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR0aGlzLl9tb2RlbEJhY2tlZFRlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHRcdHRoaXMuX3Rlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHR9XG5cdFx0dGhpcy5fdGVzdHNPbkN1cnJlbnRTZXJ2ZXIrKztcblx0XHRpZiAobW9kZWxUcmFmZmljID09PSAncmVjb3JkZWQnKSB7XG5cdFx0XHR0aGlzLl9tb2RlbEJhY2tlZFRlc3RzT25DdXJyZW50U2VydmVyKys7XG5cdFx0fVxuXHRcdHRoaXMuX2NsaWVudCA9IG5ldyBUZXN0UHJvdG9jb2xDbGllbnQoXG5cdFx0XHR0aGlzLl9zZXJ2ZXIucG9ydCxcblx0XHRcdCgpID0+IHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheT8udGFrZVJlcGxheUVycm9yKCksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5ID0+IHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheT8uc2V0V29ya2luZ0RpcmVjdG9yeSh3b3JraW5nRGlyZWN0b3J5KSxcblx0XHQpO1xuXHRcdGF3YWl0IHRoaXMuX2NsaWVudC5jb25uZWN0KCk7XG5cdFx0cmV0dXJuIHsgc2VydmVyOiB0aGlzLl9zZXJ2ZXIsIGNsaWVudDogdGhpcy5fY2xpZW50IH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzdGFydCB0aGUgdGFyZ2V0IHdoaWxlIHByZXNlcnZpbmcgaXRzIGlzb2xhdGVkIGhvbWUsIHVzZXIgZGF0YSwgYW5kIHRoZVxuXHQgKiByZXBsYXkgcHJveHkncyBjb25zdW1lZCBleGNoYW5nZSBzZXF1ZW5jZS4gUmV0dXJucyBhIGNvbm5lY3RlZCxcblx0ICogdW5pbml0aWFsaXplZCBjbGllbnQgZm9yIHRoZSBjYWxsZXIgdG8gaW5pdGlhbGl6ZSB3aXRoIGEgbmV3IGNsaWVudCBpZC5cblx0ICovXG5cdGFzeW5jIHJlc3RhcnQoKTogUHJvbWlzZTxUZXN0UHJvdG9jb2xDbGllbnQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXI7XG5cdFx0Y29uc3QgcHJveHkgPSBzZXJ2ZXI/LmNhcGlSZXBsYXk7XG5cdFx0Y29uc3QgY2FwaVJlcGxheSA9IHRoaXMuX2N1cnJlbnRDYXBpUmVwbGF5O1xuXHRcdGlmICghc2VydmVyIHx8ICFwcm94eSB8fCAhY2FwaVJlcGxheSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbYWdlbnQtaG9zdC1lMmVdIG5vIHJlcGxheS1iYWNrZWQgc2VydmVyIHRvIHJlc3RhcnQnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jbGllbnQ/LmNsb3NlKCk7XG5cdFx0dGhpcy5fY2xpZW50ID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHN0b3BTZXJ2ZXIoc2VydmVyKTtcblx0XHR0aGlzLl9zZXJ2ZXIgPSB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fc2VydmVyID0gYXdhaXQgdGhpcy5fdGFyZ2V0LmxhdW5jaCh7XG5cdFx0XHRcdC4uLnRoaXMuX3N0YXJ0T3B0aW9ucyxcblx0XHRcdFx0Y2FwaVJlcGxheSxcblx0XHRcdFx0ZXhpc3RpbmdDYXBpUmVwbGF5OiBwcm94eSxcblx0XHRcdFx0bG9nTGV2ZWw6IHRoaXMuX2lzQ29waWxvdFByb3ZpZGVyID8gJ3RyYWNlJyA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhd2FpdCBwcm94eS5jbG9zZSgpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RQcm90b2NvbENsaWVudChcblx0XHRcdHRoaXMuX3NlcnZlci5wb3J0LFxuXHRcdFx0KCkgPT4gdGhpcy5fc2VydmVyPy5jYXBpUmVwbGF5Py50YWtlUmVwbGF5RXJyb3IoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnkgPT4gdGhpcy5fc2VydmVyPy5jYXBpUmVwbGF5Py5zZXRXb3JraW5nRGlyZWN0b3J5KHdvcmtpbmdEaXJlY3RvcnkpLFxuXHRcdCk7XG5cdFx0YXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcblx0XHR0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG5cdFx0cmV0dXJuIGNsaWVudDtcblx0fVxuXG5cdHNldFJlY29yZGluZ01vZGVsUmVzcG9uc2UocmVzcG9uc2U6IElDYXBpUmVwbGF5UmVzcG9uc2UpOiB2b2lkIHtcblx0XHRjb25zdCBwcm94eSA9IHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thZ2VudC1ob3N0LWUyZV0gbm8gcmVwbGF5LWJhY2tlZCBzZXJ2ZXInKTtcblx0XHR9XG5cdFx0cHJveHkuc2V0UmVjb3JkaW5nTW9kZWxSZXNwb25zZShyZXNwb25zZSk7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiBhbiBhZGRpdGlvbmFsIGNvbm5lY3Rpb24gdG8gdGhlIGN1cnJlbnQgc2VydmVyLlxuXHQgKlxuXHQgKiBgcmVjb25uZWN0YCBpcyBvbmx5IGFuc3dlcmFibGUgb24gYSB0cmFuc3BvcnQgdGhhdCBoYXMgbm90IGNvbXBsZXRlZCB0aGVcblx0ICogaGFuZHNoYWtlLCBzbyBhIHRlc3QgdGhhdCBleGVyY2lzZXMgY29ubmVjdGlvbiByZWNvdmVyeSBuZWVkcyBhIHNlY29uZFxuXHQgKiBzb2NrZXQgaXQgY2FuIGNsb3NlIGFuZCByZS1lc3RhYmxpc2ggd2l0aG91dCBkaXN0dXJiaW5nIHRoZSBzaGFyZWRcblx0ICogY2xpZW50LiBUaGUgY2FsbGVyIG93bnMgdGhlIHJldHVybmVkIGNsaWVudCBhbmQgbXVzdCBjbG9zZSBpdC5cblx0ICovXG5cdGFzeW5jIGNvbm5lY3RDbGllbnQoKTogUHJvbWlzZTxUZXN0UHJvdG9jb2xDbGllbnQ+IHtcblx0XHRpZiAoIXRoaXMuX3NlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbYWdlbnQtaG9zdC1lMmVdIG5vIHNlcnZlciBhY3F1aXJlZCB5ZXQnKTtcblx0XHR9XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RQcm90b2NvbENsaWVudCh0aGlzLl9zZXJ2ZXIucG9ydCk7XG5cdFx0YXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcblx0XHRyZXR1cm4gY2xpZW50O1xuXHR9XG5cblx0LyoqIFN0b3AgdGhlIGN1cnJlbnQgc2hhcmVkIHNlcnZlciBzbyB0aGUgbmV4dCB7QGxpbmsgYWNxdWlyZX0gc3RhcnRzIGEgZnJlc2ggb25lLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWN5Y2xlU2hhcmVkU2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZXJ2ZXI/LmNhcGlSZXBsYXk/LmNsb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHN0b3BTZXJ2ZXIodGhpcy5fc2VydmVyKTtcblx0XHRcdHRoaXMuX3NlcnZlciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX21vZGVsQmFja2VkVGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPSAwO1xuXHRcdFx0dGhpcy5fdGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPSAwO1xuXHRcdH1cblx0fVxuXG5cdGdldCBvYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcygpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheT8ub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMgPz8gW107XG5cdH1cblxuXHQvKiogVGhlIGJ1bmRsZWQgYEBnaXRodWIvY29waWxvdGAgQ0xJIGlzIHRoZSBvbmx5IHByb3ZpZGVyIHdob3NlIHJ1bnRpbWUgbG9ncyB3ZSBjYXB0dXJlIC8gcnVuIHZlcmJvc2VseS4gKi9cblx0cHJpdmF0ZSBnZXQgX2lzQ29waWxvdFByb3ZpZGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJztcblx0fVxuXG5cdC8qKlxuXHQgKiBUYWlsIHRoZSBtb3N0IHJlY2VudCBDb3BpbG90IHJ1bnRpbWUgKGBAZ2l0aHViL2NvcGlsb3RgIENMSSkgYHByb2Nlc3MtKi5sb2dgXG5cdCAqIGludG8gdGhlIHRlc3Qgb3V0cHV0LiBUaGlzIGlzIHRoZSBTREsvQ0xJJ3Mgb3duIGRpYWdub3N0aWNzIFx1MjAxNCB0aGUga2V5IHNpZ25hbFxuXHQgKiB3aGVuIGEgdHVybiBoYW5ncyBvciB0aW1lcyBvdXQsIHdoaWNoIHRoZSBBSFAgYXNzZXJ0aW9ucyBhbG9uZSBkb24ndCBleHBsYWluLlxuXHQgKiBUaGUgcnVudGltZSB3cml0ZXMgdGhlc2UgdW5kZXIgYCR7Q09QSUxPVF9IT01FfS9sb2dzYCwgYW5kIHRoZSBoYXJuZXNzIHBpbnNcblx0ICogYENPUElMT1RfSE9NRWAgdG8gYCR7aG9tZURpcn0vLmNvcGlsb3RgIChzZWUgYHN0YXJ0UmVhbFNlcnZlcmApLCBydW5uaW5nIGl0XG5cdCAqIGF0IGB0cmFjZWAuIE9ubHkgdGhlIENvcGlsb3QgQ0xJIHByb3ZpZGVyIGlzIGNhcHR1cmVkIFx1MjAxNCBDbGF1ZGUvQ29kZXggdXNlIHRoZWlyXG5cdCAqIG93biBydW50aW1lcyBhbmQgbG9nIGVsc2V3aGVyZS4gQmVzdC1lZmZvcnQ6IG5ldmVyIHRocm93cyAoaXQgcnVucyBpbiBhXG5cdCAqIGB0ZWFyZG93bmAsIHJpZ2h0IGJlZm9yZSB0aGUgZmFpbHVyZSBpcyByZS1yYWlzZWQpLiBPdXRwdXQgZ29lcyB0b1xuXHQgKiBgcHJvY2Vzcy5zdGRvdXRgIGRpcmVjdGx5IChub3QgYGNvbnNvbGUuKmApOiB0aGUgaW50ZWdyYXRpb24gaGFybmVzcyBvdmVycmlkZXNcblx0ICogYGNvbnNvbGUuKmAgYW5kIGZhaWxzIHRoZSB0ZXN0IG9uIEFOWSB1bmV4cGVjdGVkIGNvbnNvbGUgb3V0cHV0IGR1cmluZyBhIHRlc3QsXG5cdCAqIGFuZCBgY3VycmVudFRlc3RgIGlzIHN0aWxsIHNldCBkdXJpbmcgYHRlYXJkb3duYC5cblx0ICovXG5cdGR1bXBSdW50aW1lTG9nc09uRmFpbHVyZShsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0NvcGlsb3RQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbG9nc0RpciA9IGpvaW4odGhpcy5fc3RhcnRPcHRpb25zLmhvbWVEaXIsICcuY29waWxvdCcsICdsb2dzJyk7XG5cdFx0XHRsZXQgZW50cmllczogc3RyaW5nW107XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRlbnRyaWVzID0gcmVhZGRpclN5bmMobG9nc0Rpcik7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gTm8gbG9nIGRpciBhdCBhbGwgXHUyMDE0IHRoZSBDTEkgbmV2ZXIgc3Bhd25lZC4gVGhhdCBpdHNlbGYgaXMgYSBzaWduYWwuXG5cdFx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKGBbYWdlbnQtaG9zdC1lMmVdIG5vIENvcGlsb3QgcnVudGltZSBsb2dzIGZvciBmYWlsZWQgdGVzdCBcIiR7bGFiZWx9XCIgKENMSSBuZXZlciBzcGF3bmVkOyAke2xvZ3NEaXJ9IGFic2VudClcXG5gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3ZXN0ID0gZW50cmllc1xuXHRcdFx0XHQuZmlsdGVyKG5hbWUgPT4gL15wcm9jZXNzLS4qXFwubG9nJC8udGVzdChuYW1lKSlcblx0XHRcdFx0Lm1hcChuYW1lID0+IHtcblx0XHRcdFx0XHRjb25zdCBmdWxsID0gam9pbihsb2dzRGlyLCBuYW1lKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZnVsbCwgbXRpbWVNczogc3RhdFN5bmMoZnVsbCkubXRpbWVNcyB9O1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5maWx0ZXIoKHYpOiB2IGlzIHsgZnVsbDogc3RyaW5nOyBtdGltZU1zOiBudW1iZXIgfSA9PiB2ICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLm10aW1lTXMgLSBhLm10aW1lTXMpWzBdO1xuXHRcdFx0aWYgKCFuZXdlc3QpIHtcblx0XHRcdFx0cHJvY2Vzcy5zdGRvdXQud3JpdGUoYFthZ2VudC1ob3N0LWUyZV0gbm8gQ29waWxvdCBydW50aW1lIHByb2Nlc3MtKi5sb2cgZm9yIGZhaWxlZCB0ZXN0IFwiJHtsYWJlbH1cIiB1bmRlciAke2xvZ3NEaXJ9XFxuYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVzID0gcmVhZEZpbGVTeW5jKG5ld2VzdC5mdWxsLCAndXRmOCcpLnNwbGl0KC9cXHI/XFxuLyk7XG5cdFx0XHRjb25zdCB0YWlsID0gbGluZXMuc2xpY2UoLTIwMCk7XG5cdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZShgW2FnZW50LWhvc3QtZTJlXSAtLS0gQ29waWxvdCBydW50aW1lIGxvZyBmb3IgZmFpbGVkIHRlc3QgXCIke2xhYmVsfVwiICgke25ld2VzdC5mdWxsfTsgbGFzdCAke3RhaWwubGVuZ3RofSBvZiAke2xpbmVzLmxlbmd0aH0gbGluZXMpIC0tLVxcbmApO1xuXHRcdFx0Zm9yIChjb25zdCBsbiBvZiB0YWlsKSB7XG5cdFx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKGBbYWdlbnQtaG9zdC1lMmVdICMgJHtsbn1cXG5gKTtcblx0XHRcdH1cblx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdbYWdlbnQtaG9zdC1lMmVdIC0tLSBlbmQgQ29waWxvdCBydW50aW1lIGxvZyAtLS1cXG4nKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5ldmVyIGxldCBkaWFnbm9zdGljcyBicmVhayB0ZWFyZG93blxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxlYXNlIGEgdGVzdDogZGlzcG9zZSBpdHMgc2Vzc2lvbnMsIGRpc2Nvbm5lY3QgdGhlIGNsaWVudCwgYW5kIHZlcmlmeSB0aGVcblx0ICogcmVwbGF5IHRyYWZmaWMuIEEgc2hhcmVkIHNlcnZlciBpcyBub3JtYWxseSBrZXB0IGFsaXZlICh3aXRoIGl0cyBjYWNoZWQgU0RLXG5cdCAqIGNsaWVudCkgZm9yIHRoZSBuZXh0IHRlc3Q7IGEgcGVyLXRlc3Qgc2VydmVyIGlzIHN0b3BwZWQuXG5cdCAqXG5cdCAqIFBhc3MgYGZvcmNlUmVzdGFydGAgd2hlbiB0aGUganVzdC1ydW4gdGVzdCBmYWlsZWQuIEEgZmFpbGVkIHRlc3QgY2FuIGxlYXZlXG5cdCAqIGEgbWlkLXR1cm4gc2Vzc2lvbiB0aGF0IHdlZGdlcyAob3IgaGFzIGFscmVhZHkga2lsbGVkKSB0aGUgc2hhcmVkIGhvc3QsIHNvXG5cdCAqIHJldXNpbmcgaXQgd291bGQgY2FzY2FkZSBgRUNPTk5SRUZVU0VEYCAvIGBjcmVhdGVTZXNzaW9uYCB0aW1lb3V0cyBpbnRvIHRoZVxuXHQgKiBuZXh0LCB1bnJlbGF0ZWQgdGVzdC4gUmVzdGFydGluZyBpc29sYXRlcyB0aGUgZmFpbHVyZSB0byB0aGUgb25lIHRlc3QgdGhhdFxuXHQgKiBjYXVzZWQgaXQuIFRoZSBzdHJpY3QgY2FjaGUtbWlzcyBhc3NlcnRpb24gaXMgYWxzbyBza2lwcGVkIG9uIHJlc3RhcnQ6IHRoZVxuXHQgKiB0ZXN0IGFscmVhZHkgZmFpbGVkIGZvciBpdHMgb3duIHJlYXNvbiwgYW5kIGEgc2Vjb25kYXJ5IGNhY2hlLW1pc3MgdGhyb3dcblx0ICogd291bGQgb25seSBvYnNjdXJlIGl0LlxuXHQgKi9cblx0YXN5bmMgcmVsZWFzZShjcmVhdGVkU2Vzc2lvbnM6IHN0cmluZ1tdLCBmb3JjZVJlc3RhcnQgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IHRoaXMuX2NsaWVudDtcblx0XHRjb25zdCBjbGVhbnVwRXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0aWYgKGNsaWVudCkge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNyZWF0ZWRTZXNzaW9ucykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uKTtcblx0XHRcdFx0XHRpZiAoc3RhdGUuYWN0aXZlVHVybikge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbik7XG5cdFx0XHRcdFx0XHRjb25zdCB0dXJuSWQgPSBzdGF0ZS5hY3RpdmVUdXJuLmlkO1xuXHRcdFx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRcdFx0Y2hhbm5lbDogY2hhdCxcblx0XHRcdFx0XHRcdFx0Y2xpZW50U2VxOiB0aGlzLl9jbGVhbnVwQ2xpZW50U2VxKyssXG5cdFx0XHRcdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQsIGR1cmF0aW9uOiAwIH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNhbmNlbGxlZCcpXG5cdFx0XHRcdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRcblx0XHRcdFx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0XHRcdFx0XHQxMF8wMDAsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByb290ID0gYXdhaXQgY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbHMgPSAocm9vdC5zbmFwc2hvdCEuc3RhdGUgYXMgUm9vdFN0YXRlKS50ZXJtaW5hbHMgPz8gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiB0ZXJtaW5hbHMpIHtcblx0XHRcdFx0XHRcdGlmICh0ZXJtaW5hbC5jbGFpbS5raW5kID09PSBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uICYmIHRlcm1pbmFsLmNsYWltLnNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2Rpc3Bvc2VUZXJtaW5hbCcsIHsgY2hhbm5lbDogdGVybWluYWwucmVzb3VyY2UgfSwgZ2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQoMzBfMDAwLCA5MF8wMDApKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2Rpc3Bvc2VTZXNzaW9uJywgeyBjaGFubmVsOiBzZXNzaW9uIH0sIGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0KDMwXzAwMCwgOTBfMDAwKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Y2xlYW51cEVycm9ycy5wdXNoKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0XHRjcmVhdGVkU2Vzc2lvbnMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9jbGllbnQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBtdXN0UmVzdGFydCA9IGZvcmNlUmVzdGFydCB8fCBjbGVhbnVwRXJyb3JzLmxlbmd0aCA+IDA7XG5cdFx0aWYgKHRoaXMuX3NoYXJlZCAmJiAhbXVzdFJlc3RhcnQpIHtcblx0XHRcdC8vIFN1cmZhY2UgdGhpcyB0ZXN0J3Mgc3RyaWN0IHJlcGxheSBmYWlsdXJlcyBidXQga2VlcCB0aGUgc2VydmVyIChhbmRcblx0XHRcdC8vIGl0cyBjYWNoZWQgU0RLIGNsaWVudCkgYWxpdmUgZm9yIHRoZSBuZXh0IHRlc3QuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9zZXJ2ZXI/LmNhcGlSZXBsYXk/LmFzc2VydE5vUmVwbGF5TWlzbWF0Y2hlcygpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2xlYW51cEVycm9ycy5wdXNoKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VydmVyPy5jYXBpUmVwbGF5Py5jbG9zZSgpO1xuXHRcdFx0XHR9IGNhdGNoIChzdG9wRXJyb3IpIHtcblx0XHRcdFx0XHRjbGVhbnVwRXJyb3JzLnB1c2goc3RvcEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBzdG9wRXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKHN0b3BFcnJvcikpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHN0b3BTZXJ2ZXIodGhpcy5fc2VydmVyKTtcblx0XHRcdFx0fSBjYXRjaCAoc3RvcEVycm9yKSB7XG5cdFx0XHRcdFx0Y2xlYW51cEVycm9ycy5wdXNoKHN0b3BFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gc3RvcEVycm9yIDogbmV3IEVycm9yKFN0cmluZyhzdG9wRXJyb3IpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2VydmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9tb2RlbEJhY2tlZFRlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHRcdFx0dGhpcy5fdGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPSAwO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBQZXItdGVzdCBzZXJ2ZXIsIG9yIGEgc2hhcmVkIHNlcnZlciBiZWluZyByZXN0YXJ0ZWQgYWZ0ZXIgYSBmYWlsdXJlLlxuXHRcdFx0Ly8gRmx1c2ggdGhlIHJlY29yZGluZyAvIHN1cmZhY2Ugc3RyaWN0IHJlcGxheSBjYWNoZS1taXNzZXMgKHVubGVzcyB0aGVcblx0XHRcdC8vIHRlc3QgYWxyZWFkeSBmYWlsZWQpIGJlZm9yZSB0aGUgcHJvY2VzcyBnb2VzIGF3YXkuIEtpbGwgZXZlbiBpZiB0aGVcblx0XHRcdC8vIHN0cmljdCBjaGVjayB0aHJvd3MuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZm9yY2VSZXN0YXJ0KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VydmVyPy5jYXBpUmVwbGF5Py5jbG9zZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheT8uc3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjbGVhbnVwRXJyb3JzLnB1c2goZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgc3RvcFNlcnZlcih0aGlzLl9zZXJ2ZXIpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGNsZWFudXBFcnJvcnMucHVzaChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NlcnZlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fbW9kZWxCYWNrZWRUZXN0c09uQ3VycmVudFNlcnZlciA9IDA7XG5cdFx0XHRcdHRoaXMuX3Rlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNsZWFudXBFcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKGZvcmNlUmVzdGFydCkge1xuXHRcdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZShgW2FnZW50LWhvc3QtZTJlXSBjbGVhbnVwIHJlcG9ydGVkICR7Y2xlYW51cEVycm9ycy5sZW5ndGh9IHNlY29uZGFyeSBlcnJvcihzKSBhZnRlciB0aGUgdGVzdCBmYWlsZWQ6XFxuYCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZXJyb3Igb2YgY2xlYW51cEVycm9ycykge1xuXHRcdFx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKGBbYWdlbnQtaG9zdC1lMmVdICMgJHtlcnJvci5tZXNzYWdlfVxcbmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBBZ2dyZWdhdGVFcnJvcihjbGVhbnVwRXJyb3JzLCBgRmFpbGVkIHRvIHJlbGVhc2UgQWdlbnQgSG9zdCBFMkUgdGVzdCByZXNvdXJjZXM6ICR7Y2xlYW51cEVycm9ycy5tYXAoZXJyb3IgPT4gZXJyb3IubWVzc2FnZSkuam9pbignOyAnKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKiogVGVhciBkb3duIGEgc2hhcmVkIHNlcnZlciBhdCB0aGUgZW5kIG9mIHRoZSBzdWl0ZSAobm8tb3AgZm9yIHBlci10ZXN0KS4gKi9cblx0YXN5bmMgZGlzcG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYXRhRGlyID0gdGhpcy5fZGF0YURpcjtcblx0XHR0aGlzLl9kYXRhRGlyID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fc2VydmVyKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VydmVyLmNhcGlSZXBsYXk/LmNsb3NlKCk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0YXdhaXQgc3RvcFNlcnZlcih0aGlzLl9zZXJ2ZXIpO1xuXHRcdFx0XHRcdHRoaXMuX3NlcnZlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoZGF0YURpcikge1xuXHRcdFx0XHRhd2FpdCByZW1vdmVUZW1wRGlycyhbZGF0YURpcl0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU2hhcmVkIHN1aXRlXG5cbi8qKlxuICogUmVnaXN0ZXJzIHRoZSBjcm9zcy1wcm92aWRlciBhZ2VudCBob3N0IGUyZSBzdWl0ZS4gVGhlIGJvZHkgaXMgaWRlbnRpY2FsIGZvclxuICogZXZlcnkgcHJvdmlkZXIgdGhhdCBzcGVha3MgdGhlIGFnZW50IGhvc3QgcHJvdG9jb2wgXHUyMDE0IHRoZSBvbmx5IGtub2JzIGFyZVxuICogdG9vbCBuYW1lcyBhbmQgVVJJIHNjaGVtZS5cbiAqL1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBU0EsT0FBTyxZQUFZO0FB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
