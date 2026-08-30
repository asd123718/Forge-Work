import { fork } from "child_process";
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "fs/promises";
import { raceTimeout } from "../../../../base/common/async.js";
import { Schemas } from "../../../../base/common/network.js";
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { userInfo } from "os";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { CapiReplayProxy } from "./e2e/harness/capiReplayProxy.js";
import { dirname, join, resolve as resolvePath } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import {
  ContentEncoding,
  ResourceType,
  ResourceWriteMode
} from "../../common/state/protocol/commands.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { MessageKind, buildDefaultChatUri, mergeSessionWithDefaultChat, parseDefaultChatUri } from "../../common/state/sessionState.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentHostCodexAgentEnabledEnvVar } from "../../common/agentService.js";
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  ProtocolError
} from "../../common/state/sessionProtocol.js";
import { AhpSnapshotRecorder } from "./e2e/harness/ahpSnapshot.js";
import { recordAhpSurface } from "./ahpSurfaceCoverage.js";
import { isCI, isWindows } from "../../../../base/common/platform.js";
const AGENT_HOST_E2E_COVERAGE = process.env["AGENT_HOST_E2E_COVERAGE"] === "1";
function getProtocolOperationTimeout() {
  if (AGENT_HOST_E2E_COVERAGE) {
    return 3e4;
  }
  return isWindows ? 8e3 : 5e3;
}
class TestProtocolClient {
  constructor(port, _takeReplayError, _setWorkingDirectory) {
    this._takeReplayError = _takeReplayError;
    this._setWorkingDirectory = _setWorkingDirectory;
    this._ahpSnapshot = new AhpSnapshotRecorder();
    this._nextId = 1;
    this._pendingCalls = /* @__PURE__ */ new Map();
    this._notifications = [];
    this._notifWaiters = [];
    this._nextWatchId = 1;
    this._closed = false;
    /**
     * Reverse requests this client has served, in arrival order. Lets a test
     * assert that the host actually reached back to the client for filesystem
     * access rather than resolving a path locally. `uri` is absent when the
     * request carries no resource (rather than being recorded as an empty
     * string, which would be indistinguishable from a real one).
     */
    this._servedReverseRequests = [];
    this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this._ws.on("open", () => {
        this._ws.on("message", (data) => {
          const text = typeof data === "string" ? data : data.toString("utf-8");
          const msg = JSON.parse(text);
          this._ahpSnapshot.record("s2c", msg);
          this._handleMessage(msg);
        });
        resolve();
      });
      this._ws.on("error", reject);
    });
  }
  _handleMessage(msg) {
    if (isJsonRpcResponse(msg)) {
      const pending = this._pendingCalls.get(msg.id);
      if (pending) {
        this._pendingCalls.delete(msg.id);
        const errResp = msg;
        if (errResp.error) {
          pending.reject(new ProtocolError(errResp.error.code, errResp.error.message, errResp.error.data));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (isJsonRpcRequest(msg)) {
      recordAhpSurface("command", msg.method);
      void this._handleServerRequest(msg);
    } else if (isJsonRpcNotification(msg)) {
      const notif = msg;
      recordAhpSurface("notification", notif.method);
      if (notif.method === "action") {
        const envelope = notif.params;
        recordAhpSurface("action", envelope?.action?.type ?? "");
      }
      this._notifications.push(notif);
      this._flushNotificationWaiters();
    }
  }
  async _handleServerRequest(msg) {
    try {
      if (!this._isReverseRequestMethod(msg.method)) {
        throw new Error(`Unsupported reverse request method: ${msg.method}`);
      }
      const params = msg.params;
      this._servedReverseRequests.push({ method: msg.method, uri: params?.uri ?? params?.source });
      const result = await this._handleServerRequestMethod(msg.method, msg.params);
      const response = { jsonrpc: "2.0", id: msg.id, result };
      this._ahpSnapshot.record("c2s", response);
      this._ws.send(JSON.stringify(response));
    } catch (error) {
      const response = {
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error)
        }
      };
      this._ahpSnapshot.record("c2s", response);
      this._ws.send(JSON.stringify(response));
    }
  }
  _isReverseRequestMethod(method) {
    switch (method) {
      case "createResourceWatch":
      case "resourceRequest":
      case "resourceRead":
      case "resourceList":
      case "resourceResolve":
      case "resourceWrite":
      case "resourceMkdir":
      case "resourceDelete":
      case "resourceMove":
      case "resourceCopy":
        return true;
      default:
        return false;
    }
  }
  async _handleServerRequestMethod(method, params) {
    switch (method) {
      case "createResourceWatch":
        return this._createResourceWatch(params);
      case "resourceRequest":
        return {};
      case "resourceRead":
        return this._resourceRead(params);
      case "resourceList":
        return this._resourceList(params);
      case "resourceResolve":
        return this._resourceResolve(params);
      case "resourceWrite":
        return this._resourceWrite(params);
      case "resourceMkdir":
        return this._resourceMkdir(params);
      case "resourceDelete":
        return this._resourceDelete(params);
      case "resourceMove":
        return this._resourceMove(params);
      case "resourceCopy":
        return this._resourceCopy(params);
    }
  }
  _coerceUri(value) {
    return URI.parse(value);
  }
  _assertFileUri(uri) {
    if (uri.scheme !== Schemas.file) {
      throw new Error(`Unsupported URI scheme for test client filesystem: ${uri.toString()}`);
    }
    return uri.fsPath;
  }
  async _pathExists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async _resourceRead(params) {
    const uri = this._coerceUri(params.uri);
    const filePath = this._assertFileUri(uri);
    const encoding = params.encoding === ContentEncoding.Utf8 ? ContentEncoding.Utf8 : ContentEncoding.Base64;
    const content = await readFile(filePath);
    return {
      data: encoding === ContentEncoding.Utf8 ? content.toString("utf-8") : content.toString("base64"),
      encoding
    };
  }
  async _resourceList(params) {
    const uri = this._coerceUri(params.uri);
    const dirPath = this._assertFileUri(uri);
    const entries = await readdir(dirPath, { withFileTypes: true });
    return {
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file"
      }))
    };
  }
  async _resourceResolve(params) {
    const requested = this._coerceUri(params.uri);
    const requestedPath = this._assertFileUri(requested);
    const followSymlinks = params.followSymlinks ?? true;
    const lst = await lstat(requestedPath);
    if (lst.isSymbolicLink() && followSymlinks) {
      const resolvedPath = await realpath(requestedPath);
      const resolvedUri = URI.file(resolvedPath);
      const resolvedStat = await stat(resolvedPath);
      return {
        uri: resolvedUri.toString(),
        type: resolvedStat.isDirectory() ? ResourceType.Directory : ResourceType.File,
        size: resolvedStat.isDirectory() ? void 0 : resolvedStat.size,
        mtime: resolvedStat.mtime.toISOString(),
        ctime: resolvedStat.ctime.toISOString(),
        etag: `W/"${resolvedStat.size}-${Math.trunc(resolvedStat.mtimeMs)}"`
      };
    }
    const st = followSymlinks ? await stat(requestedPath) : lst;
    return {
      uri: requested.toString(),
      type: lst.isSymbolicLink() && !followSymlinks ? ResourceType.Symlink : st.isDirectory() ? ResourceType.Directory : ResourceType.File,
      size: st.isDirectory() ? void 0 : st.size,
      mtime: st.mtime.toISOString(),
      ctime: st.ctime.toISOString(),
      etag: `W/"${st.size}-${Math.trunc(st.mtimeMs)}"`
    };
  }
  async _resourceWrite(params) {
    const uri = this._coerceUri(params.uri);
    const filePath = this._assertFileUri(uri);
    const dataEncoding = params.encoding === ContentEncoding.Utf8 ? ContentEncoding.Utf8 : ContentEncoding.Base64;
    const incoming = Buffer.from(params.data, dataEncoding);
    const mode = params.mode ?? ResourceWriteMode.Truncate;
    const position = Math.max(0, params.position ?? 0);
    const createOnly = params.createOnly ?? false;
    await mkdir(dirname(filePath), { recursive: true });
    const exists = await this._pathExists(filePath);
    if (createOnly && exists) {
      throw new Error(`File already exists: ${filePath}`);
    }
    const existing = exists ? await readFile(filePath) : Buffer.alloc(0);
    const clampedStart = Math.min(position, existing.length);
    let next;
    switch (mode) {
      case ResourceWriteMode.Append: {
        const insertAt = Math.max(0, existing.length - Math.min(position, existing.length));
        next = Buffer.concat([existing.subarray(0, insertAt), incoming, existing.subarray(insertAt)]);
        break;
      }
      case ResourceWriteMode.Insert:
        next = Buffer.concat([existing.subarray(0, clampedStart), incoming, existing.subarray(clampedStart)]);
        break;
      case ResourceWriteMode.Truncate:
      default:
        next = Buffer.concat([existing.subarray(0, clampedStart), incoming]);
        break;
    }
    await writeFile(filePath, next);
    return {};
  }
  async _resourceMkdir(params) {
    const uri = this._coerceUri(params.uri);
    const dirPath = this._assertFileUri(uri);
    await mkdir(dirPath, { recursive: true });
    return {};
  }
  async _resourceDelete(params) {
    const uri = this._coerceUri(params.uri);
    const targetPath = this._assertFileUri(uri);
    await rm(targetPath, { recursive: params.recursive ?? false, force: false });
    return {};
  }
  async _resourceMove(params) {
    const source = this._assertFileUri(this._coerceUri(params.source));
    const destination = this._assertFileUri(this._coerceUri(params.destination));
    const failIfExists = params.failIfExists ?? false;
    if (failIfExists && await this._pathExists(destination)) {
      throw new Error(`Destination already exists: ${destination}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await rename(source, destination);
    return {};
  }
  async _resourceCopy(params) {
    const source = this._assertFileUri(this._coerceUri(params.source));
    const destination = this._assertFileUri(this._coerceUri(params.destination));
    const failIfExists = params.failIfExists ?? false;
    if (failIfExists && await this._pathExists(destination)) {
      throw new Error(`Destination already exists: ${destination}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: !failIfExists, errorOnExist: failIfExists });
    return {};
  }
  async _createResourceWatch(_params) {
    return { channel: `ahp-resource-watch:/mock-${this._nextWatchId++}` };
  }
  /** Send a JSON-RPC notification (fire-and-forget). */
  notify(method, params) {
    recordAhpSurface("command", method);
    if (method === "dispatchAction") {
      const dispatched = params;
      recordAhpSurface("action", dispatched?.action?.type ?? "");
    }
    const message = { jsonrpc: "2.0", method, params };
    this._ahpSnapshot.record("c2s", message);
    this._ws.send(JSON.stringify(message));
  }
  /**
   * Dispatch a strongly-typed protocol action (fire-and-forget write-ahead).
   *
   * Prefer this over the raw {@link notify} escape hatch: the action payload
   * is checked against the {@link StateAction} union at compile time, so a
   * malformed or incomplete action (e.g. an approval missing its required
   * `confirmed` field) is caught by the type-checker rather than silently
   * shipped over the wire and reduced into `undefined`.
   */
  dispatch(params) {
    this.notify("dispatchAction", params);
  }
  /** Send a JSON-RPC request and await the response. */
  call(method, params, timeoutMs = getProtocolOperationTimeout()) {
    recordAhpSurface("command", method);
    const id = this._nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    this._ahpSnapshot.record("c2s", message);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingCalls.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id}, ${timeoutMs}ms)`));
      }, timeoutMs);
      this._pendingCalls.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      try {
        this._ws.send(JSON.stringify(message));
      } catch (error) {
        this._pendingCalls.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  /** Wait for a server notification matching a predicate. */
  waitForNotification(predicate, timeoutMs = getProtocolOperationTimeout()) {
    const existing = this._notifications.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        dispose: () => clearTimeout(timer)
      };
      const timer = setTimeout(() => {
        this._removeNotificationWaiter(waiter);
        const received = this._notifications.map((n) => {
          const action = n.method === "action" ? n.params.action.type : void 0;
          return action ? `${n.method}:${action}` : n.method;
        }).join(", ");
        reject(new Error(`Timeout waiting for notification (${timeoutMs}ms). Received: ${received}`));
      }, timeoutMs);
      this._notifWaiters.push(waiter);
      this._flushNotificationWaiters();
    });
  }
  _flushNotificationWaiters() {
    for (let i = this._notifWaiters.length - 1; i >= 0; i--) {
      const waiter = this._notifWaiters[i];
      const match = this._notifications.find(waiter.predicate);
      if (match) {
        this._notifWaiters.splice(i, 1);
        waiter.dispose();
        waiter.resolve(match);
      }
    }
  }
  _removeNotificationWaiter(waiter) {
    const idx = this._notifWaiters.indexOf(waiter);
    if (idx >= 0) {
      this._notifWaiters.splice(idx, 1);
    }
  }
  /** Return all received notifications matching a predicate. */
  receivedNotifications(predicate) {
    return predicate ? this._notifications.filter(predicate) : [...this._notifications];
  }
  /** Send a raw string over the WebSocket without JSON serialization. */
  sendRaw(data) {
    this._ws.send(data);
  }
  /** Wait for the next raw message from the server. */
  waitForRawMessage(timeoutMs = getProtocolOperationTimeout()) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for raw message (${timeoutMs}ms)`));
      }, timeoutMs);
      const onMsg = (data) => {
        cleanup();
        const text = typeof data === "string" ? data : data.toString("utf-8");
        resolve(JSON.parse(text));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this._ws.removeListener("message", onMsg);
      };
      this._ws.on("message", onMsg);
    });
  }
  close() {
    if (this._closed) {
      return;
    }
    this._closed = true;
    for (const w of this._notifWaiters) {
      w.dispose();
      w.reject(new Error("Client closed"));
    }
    this._notifWaiters.length = 0;
    for (const [, p] of this._pendingCalls) {
      p.reject(new Error("Client closed"));
    }
    this._pendingCalls.clear();
    this._ws.close();
  }
  clearReceived() {
    this._notifications.length = 0;
  }
  /**
   * Reverse requests the host has sent to this client, in arrival order.
   * Separate from {@link clearReceived} so resetting notifications does not
   * silently discard this history.
   */
  get servedReverseRequests() {
    return this._servedReverseRequests;
  }
  clearServedReverseRequests() {
    this._servedReverseRequests.length = 0;
  }
  clearAhpSnapshot() {
    this._ahpSnapshot.clear();
  }
  setAhpSnapshotNormalization(normalization) {
    this._ahpSnapshot.setNormalization(normalization);
  }
  setWorkingDirectory(workingDirectory) {
    this._setWorkingDirectory?.(workingDirectory);
  }
  beginAhpSnapshotRound() {
    this._ahpSnapshot.beginRound();
  }
  serializeAhpSnapshot(options) {
    return this._ahpSnapshot.serialize(options);
  }
  takeReplayError() {
    return this._takeReplayError?.();
  }
}
const SERVER_SHUTDOWN_TIMEOUT_MS = isCI || isWindows || AGENT_HOST_E2E_COVERAGE ? 3e4 : 5e3;
async function stopServer(server) {
  const serverProcess = server?.process;
  if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
    return;
  }
  const serverExit = new Promise((resolve) => {
    const onExit = () => resolve();
    serverProcess.once("exit", onExit);
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      serverProcess.removeListener("exit", onExit);
      resolve();
    }
  });
  serverProcess.stdin?.end();
  if (!await raceTimeout(serverExit.then(() => true), SERVER_SHUTDOWN_TIMEOUT_MS)) {
    try {
      if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
        const killed = serverProcess.kill("SIGKILL");
        if (!killed && serverProcess.exitCode === null && serverProcess.signalCode === null) {
          throw new Error("Failed to terminate Agent Host test server");
        }
      }
    } catch (error) {
      if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
        throw error;
      }
    }
    await serverExit;
  }
}
function getAgentHostE2ETestTimeout(normalTimeoutMs, extendedTimeoutMs) {
  return AGENT_HOST_E2E_COVERAGE || isCI || isWindows ? extendedTimeoutMs : normalTimeoutMs;
}
function withAgentHostCoverage(environment) {
  const childEnvironment = { ...environment };
  if (AGENT_HOST_E2E_COVERAGE) {
    const coveragePath = resolvePath(process.cwd(), ".build", "agent-host-e2e-coverage", "raw");
    mkdirSync(coveragePath, { recursive: true });
    childEnvironment.NODE_V8_COVERAGE = coveragePath;
  } else {
    delete childEnvironment.NODE_V8_COVERAGE;
  }
  return childEnvironment;
}
function buildCopilotChatToken(mockUrl, copilotPlan = "free") {
  return Buffer.from(JSON.stringify({
    token: "smoketest-fake-token",
    expires_at: Math.floor(Date.now() / 1e3) + 3600,
    refresh_in: 1800,
    sku: copilotPlan === "pro" ? "individual_subscription_copilot" : "free_limited_copilot",
    individual: true,
    isNoAuthUser: true,
    copilot_plan: copilotPlan,
    organization_login_list: [],
    endpoints: { api: mockUrl, proxy: mockUrl }
  })).toString("base64");
}
async function startMockLlmServer(scenarios) {
  const mockServerPath = fileURLToPath(new URL("../../../../../../scripts/chat-simulation/common/mock-llm-server.ts", import.meta.url));
  const nodeRequire = createRequire(import.meta.url);
  const mockModule = nodeRequire(mockServerPath);
  mockModule.registerScenario("text-only", {
    type: "multi-turn",
    turns: [{ kind: "echo-last-message" }]
  });
  for (const scenario of scenarios ?? []) {
    mockModule.registerScenario(scenario.id, scenario.definition);
  }
  const messages = [];
  const serverHandle = await mockModule.startServer(0, { logger: (msg) => messages.push(msg), verbose: true, captureRequests: true });
  return { ...serverHandle, logMessages: messages };
}
async function startServer(options) {
  return new Promise((resolve, reject) => {
    const serverPath = fileURLToPath(new URL("../../node/agentHostServerMain.js", import.meta.url));
    const args = ["--enable-mock-agent", "--port", "0", "--without-connection-token"];
    if (options?.quiet ?? true) {
      args.push("--quiet");
    }
    if (options?.userDataDir) {
      args.push("--user-data-dir", options.userDataDir);
    }
    const child = fork(serverPath, args, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: withAgentHostCoverage({ ...process.env, ...options?.env })
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Server startup timed out"));
    }, options?.startupTimeoutMs ?? getAgentHostE2ETestTimeout(1e4, 45e3));
    child.stdout.on("data", (data) => {
      const text = data.toString();
      const match = text.match(/READY:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ process: child, port: parseInt(match[1], 10) });
      }
    });
    child.stderr.on("data", () => {
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited prematurely with code ${code}`));
    });
  });
}
async function startRealServer(options) {
  const realCapture = options?.capiReplay?.real === true;
  const mockLlmServer = options?.mockLlm || options?.capiReplay && !realCapture ? await startMockLlmServer(options?.mockScenarios) : void 0;
  let capiReplayProxy = options?.existingCapiReplay;
  if (capiReplayProxy && !options?.capiReplay) {
    throw new Error("Reusing a CAPI replay proxy requires its replay configuration");
  }
  if (options?.capiReplay && !capiReplayProxy) {
    capiReplayProxy = new CapiReplayProxy(realCapture ? {
      fixturePath: options.capiReplay.fixturePath,
      mode: options.capiReplay.mode,
      workDir: options.capiReplay.workDir,
      allowPosixCommands: options.capiReplay.allowPosixCommands,
      allowStaleRecordedRequest: options.capiReplay.allowStaleRecordedRequest,
      homeDir: options.homeDir,
      userName: userInfo().username,
      // Real hosts (consumer defaults); override for Enterprise/Business accounts.
      githubUpstreamUrl: process.env["AGENT_HOST_RECORD_GITHUB_URL"] || "https://api.github.com",
      capiUpstreamUrl: process.env["AGENT_HOST_RECORD_CAPI_URL"] || "https://api.githubcopilot.com"
    } : {
      fixturePath: options.capiReplay.fixturePath,
      mode: options.capiReplay.mode,
      workDir: options.capiReplay.workDir,
      allowPosixCommands: options.capiReplay.allowPosixCommands,
      allowStaleRecordedRequest: options.capiReplay.allowStaleRecordedRequest,
      homeDir: options.homeDir,
      userName: userInfo().username,
      upstreamUrl: mockLlmServer.url
    });
    await capiReplayProxy.start();
  }
  const capiUrl = capiReplayProxy?.url ?? mockLlmServer?.url;
  return new Promise((resolve, reject) => {
    const serverPath = fileURLToPath(new URL("../../node/agentHostServerMain.js", import.meta.url));
    const args = ["--port", "0", "--without-connection-token"];
    if (options?.claudeSdkRoot) {
      args.push("--claude-sdk-root", options.claudeSdkRoot);
    }
    if (options?.codexSdkRoot) {
      args.push("--codex-sdk-root", options.codexSdkRoot);
    }
    if (options?.userDataDir) {
      args.push("--user-data-dir", options.userDataDir);
    }
    if (options?.logLevel) {
      args.push("--log", options.logLevel);
    }
    const childEnv = withAgentHostCoverage({
      ...process.env,
      ...options?.env ?? {},
      ...options?.homeDir ? {
        HOME: options.homeDir,
        USERPROFILE: options.homeDir,
        APPDATA: join(options.homeDir, "AppData", "Roaming"),
        LOCALAPPDATA: join(options.homeDir, "AppData", "Local"),
        XDG_CONFIG_HOME: join(options.homeDir, ".config"),
        COPILOT_HOME: join(options.homeDir, ".copilot"),
        COPILOT_SKILLS_DIRS: void 0,
        CLAUDE_CONFIG_DIR: void 0,
        CODEX_HOME: void 0,
        ...isWindows && options.homeDir.match(/^[A-Za-z]:[\\/]/) ? {
          HOMEDRIVE: options.homeDir.slice(0, 2),
          HOMEPATH: options.homeDir.slice(2).replace(/\//g, "\\")
        } : {}
      } : {},
      ...options?.codexHomeDir ? { [AgentHostCodexAgentCodexHomeEnvVar]: options.codexHomeDir } : {},
      // Codex defaults to disabled; opt it in for the agent host e2e suite when a
      // codex SDK root is supplied so the provider actually registers.
      ...options?.codexSdkRoot ? { [AgentHostCodexAgentEnabledEnvVar]: String(options.codexAgentEnabled ?? true) } : {},
      // Fixtures use Codex's unified exec tool, so keep record and replay on the same shell protocol.
      ...options?.codexSdkRoot && options.capiReplay ? { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(["-c", "features.unified_exec=true"]) } : {},
      ...realCapture ? {
        // Real-CAPI capture/replay: route all CAPI + GitHub-API traffic through
        // the proxy. The real GitHub token flows via the `authenticate`
        // protocol call (record) or a placeholder (replay), not via env.
        COPILOT_API_URL: capiUrl,
        COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
        VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: capiUrl
      } : mockLlmServer ? {
        GITHUB_PAT: "smoketest-fake-pat",
        IS_SCENARIO_AUTOMATION: "1",
        // Agent host e2e Copilot tests run against responses-capable models
        // (e.g. gpt-5.3-codex) that are "pro"-gated in the mock /models
        // fixture, so mint a pro-plan token for this harness.
        VSCODE_COPILOT_CHAT_TOKEN: buildCopilotChatToken(capiUrl, "pro"),
        // Route the Copilot SDK's GitHub API calls (token refresh, model
        // discovery, etc.) at the mock/proxy instead of api.github.com,
        // which would 401 with the fake token.
        COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
        COPILOT_API_URL: capiUrl,
        GITHUB_COPILOT_API_TOKEN: "smoketest-fake-agent-host-token",
        // Route the agent host's shared CAPI client (used by the Codex /
        // agent-host harnesses for model discovery + requests) at the
        // mock/proxy instead of api.github.com, which would 401 with the
        // fake token.
        VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: capiUrl
      } : {}
    });
    let child;
    try {
      child = fork(serverPath, args, {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        env: childEnv
      });
    } catch (err) {
      void mockLlmServer?.close();
      void capiReplayProxy?.stop().catch(() => void 0);
      throw err;
    }
    let mockClosed = false;
    const closeMockServer = async () => {
      if (mockClosed || !mockLlmServer) {
        return;
      }
      mockClosed = true;
      await capiReplayProxy?.stop().catch(() => void 0);
      try {
        await mockLlmServer.close();
      } catch {
      }
    };
    child.on("exit", () => {
      void closeMockServer();
    });
    const timer = setTimeout(() => {
      child.kill();
      void closeMockServer();
      reject(new Error("Real server startup timed out"));
    }, 3e4);
    child.stdout.on("data", (data) => {
      const text = data.toString();
      const match = text.match(/READY:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ process: child, port: parseInt(match[1], 10), mockLlm: mockLlmServer, capiReplay: capiReplayProxy });
      }
    });
    child.stderr.on("data", () => {
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      void closeMockServer();
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      void closeMockServer();
      reject(new Error(`Real server exited prematurely with code ${code}`));
    });
  });
}
let sessionCounter = 0;
function nextSessionUri() {
  return URI.from({ scheme: "mock", path: `/test-session-${++sessionCounter}` }).toString();
}
function defaultChatChannel(sessionUri) {
  return buildDefaultChatUri(sessionUri);
}
function isActionNotification(n, actionType) {
  if (n.method !== "action") {
    return false;
  }
  const envelope = n.params;
  return envelope.action.type === actionType;
}
function getActionEnvelope(n) {
  return n.params;
}
async function createAndSubscribeSession(c, clientId, workingDirectory) {
  await c.call("initialize", { channel: "ahp-root://", protocolVersions: [PROTOCOL_VERSION], clientId });
  await c.call("createSession", { channel: nextSessionUri(), provider: "mock", workingDirectories: workingDirectory ? [workingDirectory] : void 0 });
  const notif = await c.waitForNotification(
    (n) => n.method === "root/sessionAdded"
  );
  const realSessionUri = notif.params.summary.resource;
  await c.call("subscribe", { channel: realSessionUri });
  await c.call("subscribe", { channel: buildDefaultChatUri(realSessionUri) });
  c.clearReceived();
  return realSessionUri;
}
function dispatchTurnStarted(c, session, turnId, text, clientSeq) {
  c.dispatch({
    channel: defaultChatChannel(session),
    clientSeq,
    action: {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User } }
    }
  });
}
async function fetchSessionWithChat(c, sessionUri) {
  const owningSession = parseDefaultChatUri(sessionUri) ?? sessionUri;
  const chatUri = parseDefaultChatUri(sessionUri) ? sessionUri : buildDefaultChatUri(sessionUri);
  const sessionSnap = await c.call("subscribe", { channel: owningSession });
  const chatSnap = await c.call("subscribe", { channel: chatUri });
  return mergeSessionWithDefaultChat(
    sessionSnap.snapshot.state,
    chatSnap.snapshot?.state
  );
}
export {
  TestProtocolClient,
  createAndSubscribeSession,
  defaultChatChannel,
  dispatchTurnStarted,
  fetchSessionWithChat,
  getActionEnvelope,
  getAgentHostE2ETestTimeout,
  isActionNotification,
  nextSessionUri,
  startRealServer,
  startServer,
  stopServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBmb3JrIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBjcCwgbHN0YXQsIG1rZGlyLCByZWFkRmlsZSwgcmVhZGRpciwgcmVhbHBhdGgsIHJlbmFtZSwgcm0sIHN0YXQsIHdyaXRlRmlsZSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ21vZHVsZSc7XG5pbXBvcnQgeyBta2RpclN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB1c2VySW5mbyB9IGZyb20gJ29zJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuaW1wb3J0IHsgV2ViU29ja2V0IH0gZnJvbSAnd3MnO1xuaW1wb3J0IHsgQ2FwaVJlcGxheVByb3h5LCB0eXBlIENhcGlSZXBsYXlNb2RlIH0gZnJvbSAnLi9lMmUvaGFybmVzcy9jYXBpUmVwbGF5UHJveHkuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiwgcmVzb2x2ZSBhcyByZXNvbHZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7XG5cdENvbnRlbnRFbmNvZGluZyxcblx0dHlwZSBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zLFxuXHR0eXBlIENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQsXG5cdFJlc291cmNlVHlwZSxcblx0UmVzb3VyY2VXcml0ZU1vZGUsXG5cdFN1YnNjcmliZVJlc3VsdCxcblx0dHlwZSBEaXNwYXRjaEFjdGlvblBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZUNvcHlQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VDb3B5UmVzdWx0LFxuXHR0eXBlIFJlc291cmNlRGVsZXRlUGFyYW1zLFxuXHR0eXBlIFJlc291cmNlRGVsZXRlUmVzdWx0LFxuXHR0eXBlIFJlc291cmNlTGlzdFBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZUxpc3RSZXN1bHQsXG5cdHR5cGUgUmVzb3VyY2VNa2RpclBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZU1rZGlyUmVzdWx0LFxuXHR0eXBlIFJlc291cmNlTW92ZVBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZU1vdmVSZXN1bHQsXG5cdHR5cGUgUmVzb3VyY2VSZWFkUGFyYW1zLFxuXHR0eXBlIFJlc291cmNlUmVhZFJlc3VsdCxcblx0dHlwZSBSZXNvdXJjZVJlcXVlc3RQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VSZXF1ZXN0UmVzdWx0LFxuXHR0eXBlIFJlc291cmNlUmVzb2x2ZVBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZVJlc29sdmVSZXN1bHQsXG5cdHR5cGUgUmVzb3VyY2VXcml0ZVBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZVdyaXRlUmVzdWx0LFxufSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBBY3Rpb25FbnZlbG9wZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25BZGRlZFBhcmFtcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBidWlsZERlZmF1bHRDaGF0VXJpLCBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIHBhcnNlRGVmYXVsdENoYXRVcmksIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCB0eXBlIFNlc3Npb25TdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4QWdlbnRCaW5hcnlBcmdzRW52VmFyLCBBZ2VudEhvc3RDb2RleEFnZW50Q29kZXhIb21lRW52VmFyLCBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZEVudlZhciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0aXNKc29uUnBjTm90aWZpY2F0aW9uLFxuXHRpc0pzb25ScGNSZXF1ZXN0LFxuXHRpc0pzb25ScGNSZXNwb25zZSxcblx0UHJvdG9jb2xFcnJvcixcblx0dHlwZSBBaHBOb3RpZmljYXRpb24sXG5cdHR5cGUgSnNvblJwY05vdGlmaWNhdGlvbixcblx0dHlwZSBKc29uUnBjUmVxdWVzdCxcblx0dHlwZSBKc29uUnBjRXJyb3JSZXNwb25zZSxcblx0dHlwZSBKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlLFxuXHR0eXBlIFByb3RvY29sTWVzc2FnZSxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBBaHBTbmFwc2hvdFJlY29yZGVyLCB0eXBlIElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24sIHR5cGUgSUFocFNuYXBzaG90T3B0aW9ucyB9IGZyb20gJy4vZTJlL2hhcm5lc3MvYWhwU25hcHNob3QuanMnO1xuaW1wb3J0IHsgcmVjb3JkQWhwU3VyZmFjZSB9IGZyb20gJy4vYWhwU3VyZmFjZUNvdmVyYWdlLmpzJztcbmltcG9ydCB7IGlzQ0ksIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuY29uc3QgQUdFTlRfSE9TVF9FMkVfQ09WRVJBR0UgPSBwcm9jZXNzLmVudlsnQUdFTlRfSE9TVF9FMkVfQ09WRVJBR0UnXSA9PT0gJzEnO1xuXG4vLyAtLS0tIEpTT04tUlBDIHRlc3QgY2xpZW50IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdDYWxsIHtcblx0cmVzb2x2ZTogKHJlc3VsdDogdW5rbm93bikgPT4gdm9pZDtcblx0cmVqZWN0OiAoZXJyOiBFcnJvcikgPT4gdm9pZDtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvdG9jb2xPcGVyYXRpb25UaW1lb3V0KCk6IG51bWJlciB7XG5cdGlmIChBR0VOVF9IT1NUX0UyRV9DT1ZFUkFHRSkge1xuXHRcdHJldHVybiAzMF8wMDA7XG5cdH1cblx0cmV0dXJuIGlzV2luZG93cyA/IDhfMDAwIDogNV8wMDA7XG59XG5cbnR5cGUgUmV2ZXJzZVJlcXVlc3RNZXRob2QgPVxuXHR8ICdjcmVhdGVSZXNvdXJjZVdhdGNoJ1xuXHR8ICdyZXNvdXJjZVJlcXVlc3QnXG5cdHwgJ3Jlc291cmNlUmVhZCdcblx0fCAncmVzb3VyY2VMaXN0J1xuXHR8ICdyZXNvdXJjZVJlc29sdmUnXG5cdHwgJ3Jlc291cmNlV3JpdGUnXG5cdHwgJ3Jlc291cmNlTWtkaXInXG5cdHwgJ3Jlc291cmNlRGVsZXRlJ1xuXHR8ICdyZXNvdXJjZU1vdmUnXG5cdHwgJ3Jlc291cmNlQ29weSc7XG5cbnR5cGUgUmV2ZXJzZVJlcXVlc3RQYXJhbXNCeU1ldGhvZCA9IHtcblx0Y3JlYXRlUmVzb3VyY2VXYXRjaDogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcztcblx0cmVzb3VyY2VSZXF1ZXN0OiBSZXNvdXJjZVJlcXVlc3RQYXJhbXM7XG5cdHJlc291cmNlUmVhZDogUmVzb3VyY2VSZWFkUGFyYW1zO1xuXHRyZXNvdXJjZUxpc3Q6IFJlc291cmNlTGlzdFBhcmFtcztcblx0cmVzb3VyY2VSZXNvbHZlOiBSZXNvdXJjZVJlc29sdmVQYXJhbXM7XG5cdHJlc291cmNlV3JpdGU6IFJlc291cmNlV3JpdGVQYXJhbXM7XG5cdHJlc291cmNlTWtkaXI6IFJlc291cmNlTWtkaXJQYXJhbXM7XG5cdHJlc291cmNlRGVsZXRlOiBSZXNvdXJjZURlbGV0ZVBhcmFtcztcblx0cmVzb3VyY2VNb3ZlOiBSZXNvdXJjZU1vdmVQYXJhbXM7XG5cdHJlc291cmNlQ29weTogUmVzb3VyY2VDb3B5UGFyYW1zO1xufTtcblxudHlwZSBSZXZlcnNlUmVxdWVzdFJlc3VsdEJ5TWV0aG9kID0ge1xuXHRjcmVhdGVSZXNvdXJjZVdhdGNoOiBDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0O1xuXHRyZXNvdXJjZVJlcXVlc3Q6IFJlc291cmNlUmVxdWVzdFJlc3VsdDtcblx0cmVzb3VyY2VSZWFkOiBSZXNvdXJjZVJlYWRSZXN1bHQ7XG5cdHJlc291cmNlTGlzdDogUmVzb3VyY2VMaXN0UmVzdWx0O1xuXHRyZXNvdXJjZVJlc29sdmU6IFJlc291cmNlUmVzb2x2ZVJlc3VsdDtcblx0cmVzb3VyY2VXcml0ZTogUmVzb3VyY2VXcml0ZVJlc3VsdDtcblx0cmVzb3VyY2VNa2RpcjogUmVzb3VyY2VNa2RpclJlc3VsdDtcblx0cmVzb3VyY2VEZWxldGU6IFJlc291cmNlRGVsZXRlUmVzdWx0O1xuXHRyZXNvdXJjZU1vdmU6IFJlc291cmNlTW92ZVJlc3VsdDtcblx0cmVzb3VyY2VDb3B5OiBSZXNvdXJjZUNvcHlSZXN1bHQ7XG59O1xuXG4vKiogQSByZXZlcnNlIHJlcXVlc3QgdGhlIGhvc3Qgc2VudCB0byB0aGUgY2xpZW50LCBhcyBvYnNlcnZlZCBvbiB0aGUgd2lyZS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcnZlZFJldmVyc2VSZXF1ZXN0IHtcblx0cmVhZG9ubHkgbWV0aG9kOiBSZXZlcnNlUmVxdWVzdE1ldGhvZDtcblx0LyoqIFRoZSByZXNvdXJjZSB0aGUgcmVxdWVzdCB0YXJnZXRzLCBvciBgdW5kZWZpbmVkYCBpZiBpdCBjYXJyaWVzIG5vbmUuICovXG5cdHJlYWRvbmx5IHVyaTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdFByb3RvY29sQ2xpZW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBfd3M6IFdlYlNvY2tldDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWhwU25hcHNob3QgPSBuZXcgQWhwU25hcHNob3RSZWNvcmRlcigpO1xuXHRwcml2YXRlIF9uZXh0SWQgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2FsbHMgPSBuZXcgTWFwPG51bWJlciwgSVBlbmRpbmdDYWxsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25zOiBBaHBOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RpZldhaXRlcnM6IHsgcHJlZGljYXRlOiAobjogQWhwTm90aWZpY2F0aW9uKSA9PiBib29sZWFuOyByZXNvbHZlOiAobjogQWhwTm90aWZpY2F0aW9uKSA9PiB2b2lkOyByZWplY3Q6IChlcnI6IEVycm9yKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH1bXSA9IFtdO1xuXHRwcml2YXRlIF9uZXh0V2F0Y2hJZCA9IDE7XG5cdHByaXZhdGUgX2Nsb3NlZCA9IGZhbHNlO1xuXHQvKipcblx0ICogUmV2ZXJzZSByZXF1ZXN0cyB0aGlzIGNsaWVudCBoYXMgc2VydmVkLCBpbiBhcnJpdmFsIG9yZGVyLiBMZXRzIGEgdGVzdFxuXHQgKiBhc3NlcnQgdGhhdCB0aGUgaG9zdCBhY3R1YWxseSByZWFjaGVkIGJhY2sgdG8gdGhlIGNsaWVudCBmb3IgZmlsZXN5c3RlbVxuXHQgKiBhY2Nlc3MgcmF0aGVyIHRoYW4gcmVzb2x2aW5nIGEgcGF0aCBsb2NhbGx5LiBgdXJpYCBpcyBhYnNlbnQgd2hlbiB0aGVcblx0ICogcmVxdWVzdCBjYXJyaWVzIG5vIHJlc291cmNlIChyYXRoZXIgdGhhbiBiZWluZyByZWNvcmRlZCBhcyBhbiBlbXB0eVxuXHQgKiBzdHJpbmcsIHdoaWNoIHdvdWxkIGJlIGluZGlzdGluZ3Vpc2hhYmxlIGZyb20gYSByZWFsIG9uZSkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZWRSZXZlcnNlUmVxdWVzdHM6IElTZXJ2ZWRSZXZlcnNlUmVxdWVzdFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cG9ydDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rha2VSZXBsYXlFcnJvcj86ICgpID0+IEVycm9yIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NldFdvcmtpbmdEaXJlY3Rvcnk/OiAod29ya2luZ0RpcmVjdG9yeTogc3RyaW5nKSA9PiB2b2lkLFxuXHQpIHtcblx0XHR0aGlzLl93cyA9IG5ldyBXZWJTb2NrZXQoYHdzOi8vMTI3LjAuMC4xOiR7cG9ydH1gKTtcblx0fVxuXG5cdGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMuX3dzLm9uKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl93cy5vbignbWVzc2FnZScsIChkYXRhOiBCdWZmZXIgfCBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gdHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnID8gZGF0YSA6IGRhdGEudG9TdHJpbmcoJ3V0Zi04Jyk7XG5cdFx0XHRcdFx0Y29uc3QgbXNnID0gSlNPTi5wYXJzZSh0ZXh0KSBhcyBQcm90b2NvbE1lc3NhZ2U7XG5cdFx0XHRcdFx0dGhpcy5fYWhwU25hcHNob3QucmVjb3JkKCdzMmMnLCBtc2cpO1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZU1lc3NhZ2UobXNnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fd3Mub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU1lc3NhZ2UobXNnOiBQcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRpZiAoaXNKc29uUnBjUmVzcG9uc2UobXNnKSkge1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDYWxscy5nZXQobXNnLmlkKTtcblx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDYWxscy5kZWxldGUobXNnLmlkKTtcblx0XHRcdFx0Y29uc3QgZXJyUmVzcCA9IG1zZyBhcyBKc29uUnBjRXJyb3JSZXNwb25zZTtcblx0XHRcdFx0aWYgKGVyclJlc3AuZXJyb3IpIHtcblx0XHRcdFx0XHRwZW5kaW5nLnJlamVjdChuZXcgUHJvdG9jb2xFcnJvcihlcnJSZXNwLmVycm9yLmNvZGUsIGVyclJlc3AuZXJyb3IubWVzc2FnZSwgZXJyUmVzcC5lcnJvci5kYXRhKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cGVuZGluZy5yZXNvbHZlKChtc2cgYXMgSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSkucmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNKc29uUnBjUmVxdWVzdChtc2cpKSB7XG5cdFx0XHRyZWNvcmRBaHBTdXJmYWNlKCdjb21tYW5kJywgbXNnLm1ldGhvZCk7XG5cdFx0XHR2b2lkIHRoaXMuX2hhbmRsZVNlcnZlclJlcXVlc3QobXNnKTtcblx0XHR9IGVsc2UgaWYgKGlzSnNvblJwY05vdGlmaWNhdGlvbihtc2cpKSB7XG5cdFx0XHRjb25zdCBub3RpZiA9IG1zZztcblx0XHRcdHJlY29yZEFocFN1cmZhY2UoJ25vdGlmaWNhdGlvbicsIG5vdGlmLm1ldGhvZCk7XG5cdFx0XHRpZiAobm90aWYubWV0aG9kID09PSAnYWN0aW9uJykge1xuXHRcdFx0XHRjb25zdCBlbnZlbG9wZSA9IG5vdGlmLnBhcmFtcyBhcyB1bmtub3duIGFzIEFjdGlvbkVudmVsb3BlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRyZWNvcmRBaHBTdXJmYWNlKCdhY3Rpb24nLCBlbnZlbG9wZT8uYWN0aW9uPy50eXBlID8/ICcnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvbnMucHVzaChub3RpZik7XG5cdFx0XHR0aGlzLl9mbHVzaE5vdGlmaWNhdGlvbldhaXRlcnMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0KG1zZzogSnNvblJwY1JlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1JldmVyc2VSZXF1ZXN0TWV0aG9kKG1zZy5tZXRob2QpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcmV2ZXJzZSByZXF1ZXN0IG1ldGhvZDogJHttc2cubWV0aG9kfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyYW1zID0gbXNnLnBhcmFtcyBhcyB7IHVyaT86IHN0cmluZzsgc291cmNlPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZXJ2ZWRSZXZlcnNlUmVxdWVzdHMucHVzaCh7IG1ldGhvZDogbXNnLm1ldGhvZCwgdXJpOiBwYXJhbXM/LnVyaSA/PyBwYXJhbXM/LnNvdXJjZSB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZVNlcnZlclJlcXVlc3RNZXRob2QobXNnLm1ldGhvZCwgbXNnLnBhcmFtcyBhcyBSZXZlcnNlUmVxdWVzdFBhcmFtc0J5TWV0aG9kW1JldmVyc2VSZXF1ZXN0TWV0aG9kXSk7XG5cdFx0XHRjb25zdCByZXNwb25zZTogSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSA9IHsganNvbnJwYzogJzIuMCcsIGlkOiBtc2cuaWQsIHJlc3VsdCB9O1xuXHRcdFx0dGhpcy5fYWhwU25hcHNob3QucmVjb3JkKCdjMnMnLCByZXNwb25zZSk7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlOiBKc29uUnBjRXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiBtc2cuaWQsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0Y29kZTogLTMyNjAzLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9haHBTbmFwc2hvdC5yZWNvcmQoJ2MycycsIHJlc3BvbnNlKTtcblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1JldmVyc2VSZXF1ZXN0TWV0aG9kKG1ldGhvZDogc3RyaW5nKTogbWV0aG9kIGlzIFJldmVyc2VSZXF1ZXN0TWV0aG9kIHtcblx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0Y2FzZSAnY3JlYXRlUmVzb3VyY2VXYXRjaCc6XG5cdFx0XHRjYXNlICdyZXNvdXJjZVJlcXVlc3QnOlxuXHRcdFx0Y2FzZSAncmVzb3VyY2VSZWFkJzpcblx0XHRcdGNhc2UgJ3Jlc291cmNlTGlzdCc6XG5cdFx0XHRjYXNlICdyZXNvdXJjZVJlc29sdmUnOlxuXHRcdFx0Y2FzZSAncmVzb3VyY2VXcml0ZSc6XG5cdFx0XHRjYXNlICdyZXNvdXJjZU1rZGlyJzpcblx0XHRcdGNhc2UgJ3Jlc291cmNlRGVsZXRlJzpcblx0XHRcdGNhc2UgJ3Jlc291cmNlTW92ZSc6XG5cdFx0XHRjYXNlICdyZXNvdXJjZUNvcHknOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlUmVxdWVzdCcsIHBhcmFtczogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlcXVlc3RSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCBwYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlUmVhZCcsIHBhcmFtczogUmVzb3VyY2VSZWFkUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlYWRSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlTGlzdCcsIHBhcmFtczogUmVzb3VyY2VMaXN0UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlUmVzb2x2ZScsIHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlV3JpdGUnLCBwYXJhbXM6IFJlc291cmNlV3JpdGVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlV3JpdGVSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlTWtkaXInLCBwYXJhbXM6IFJlc291cmNlTWtkaXJQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlTWtkaXJSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlRGVsZXRlJywgcGFyYW1zOiBSZXNvdXJjZURlbGV0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VEZWxldGVSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlTW92ZScsIHBhcmFtczogUmVzb3VyY2VNb3ZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1vdmVSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1ldGhvZDogJ3Jlc291cmNlQ29weScsIHBhcmFtczogUmVzb3VyY2VDb3B5UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZUNvcHlSZXN1bHQ+O1xuXHRwcml2YXRlIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKFxuXHRcdG1ldGhvZDogUmV2ZXJzZVJlcXVlc3RNZXRob2QsXG5cdFx0cGFyYW1zOiBSZXZlcnNlUmVxdWVzdFBhcmFtc0J5TWV0aG9kW1JldmVyc2VSZXF1ZXN0TWV0aG9kXSxcblx0KTogUHJvbWlzZTxSZXZlcnNlUmVxdWVzdFJlc3VsdEJ5TWV0aG9kW1JldmVyc2VSZXF1ZXN0TWV0aG9kXT47XG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVNlcnZlclJlcXVlc3RNZXRob2QoXG5cdFx0bWV0aG9kOiBSZXZlcnNlUmVxdWVzdE1ldGhvZCxcblx0XHRwYXJhbXM6IFJldmVyc2VSZXF1ZXN0UGFyYW1zQnlNZXRob2RbUmV2ZXJzZVJlcXVlc3RNZXRob2RdLFxuXHQpOiBQcm9taXNlPFJldmVyc2VSZXF1ZXN0UmVzdWx0QnlNZXRob2RbUmV2ZXJzZVJlcXVlc3RNZXRob2RdPiB7XG5cdFx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRcdGNhc2UgJ2NyZWF0ZVJlc291cmNlV2F0Y2gnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlUmVzb3VyY2VXYXRjaChwYXJhbXMgYXMgQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyk7XG5cdFx0XHRjYXNlICdyZXNvdXJjZVJlcXVlc3QnOlxuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRjYXNlICdyZXNvdXJjZVJlYWQnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VSZWFkKHBhcmFtcyBhcyBSZXNvdXJjZVJlYWRQYXJhbXMpO1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VMaXN0Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlTGlzdChwYXJhbXMgYXMgUmVzb3VyY2VMaXN0UGFyYW1zKTtcblx0XHRcdGNhc2UgJ3Jlc291cmNlUmVzb2x2ZSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVJlc29sdmUocGFyYW1zIGFzIFJlc291cmNlUmVzb2x2ZVBhcmFtcyk7XG5cdFx0XHRjYXNlICdyZXNvdXJjZVdyaXRlJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlV3JpdGUocGFyYW1zIGFzIFJlc291cmNlV3JpdGVQYXJhbXMpO1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VNa2Rpcic6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZU1rZGlyKHBhcmFtcyBhcyBSZXNvdXJjZU1rZGlyUGFyYW1zKTtcblx0XHRcdGNhc2UgJ3Jlc291cmNlRGVsZXRlJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlRGVsZXRlKHBhcmFtcyBhcyBSZXNvdXJjZURlbGV0ZVBhcmFtcyk7XG5cdFx0XHRjYXNlICdyZXNvdXJjZU1vdmUnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VNb3ZlKHBhcmFtcyBhcyBSZXNvdXJjZU1vdmVQYXJhbXMpO1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VDb3B5Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlQ29weShwYXJhbXMgYXMgUmVzb3VyY2VDb3B5UGFyYW1zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb2VyY2VVcmkodmFsdWU6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5wYXJzZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hc3NlcnRGaWxlVXJpKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRpZiAodXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIFVSSSBzY2hlbWUgZm9yIHRlc3QgY2xpZW50IGZpbGVzeXN0ZW06ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB1cmkuZnNQYXRoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGF0aEV4aXN0cyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3RhdChwYXRoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlUmVhZChwYXJhbXM6IFJlc291cmNlUmVhZFBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fY29lcmNlVXJpKHBhcmFtcy51cmkpO1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh1cmkpO1xuXHRcdGNvbnN0IGVuY29kaW5nID0gcGFyYW1zLmVuY29kaW5nID09PSBDb250ZW50RW5jb2RpbmcuVXRmOCA/IENvbnRlbnRFbmNvZGluZy5VdGY4IDogQ29udGVudEVuY29kaW5nLkJhc2U2NDtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEZpbGUoZmlsZVBhdGgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiBlbmNvZGluZyA9PT0gQ29udGVudEVuY29kaW5nLlV0ZjggPyBjb250ZW50LnRvU3RyaW5nKCd1dGYtOCcpIDogY29udGVudC50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHRlbmNvZGluZyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb3VyY2VMaXN0KHBhcmFtczogUmVzb3VyY2VMaXN0UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+IHtcblx0XHRjb25zdCB1cmkgPSB0aGlzLl9jb2VyY2VVcmkocGFyYW1zLnVyaSk7XG5cdFx0Y29uc3QgZGlyUGF0aCA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodXJpKTtcblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgcmVhZGRpcihkaXJQYXRoLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVudHJpZXM6IGVudHJpZXMubWFwKGVudHJ5ID0+ICh7XG5cdFx0XHRcdG5hbWU6IGVudHJ5Lm5hbWUsXG5cdFx0XHRcdHR5cGU6IGVudHJ5LmlzRGlyZWN0b3J5KCkgPyAnZGlyZWN0b3J5JyA6ICdmaWxlJyxcblx0XHRcdH0pKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb3VyY2VSZXNvbHZlKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRjb25zdCByZXF1ZXN0ZWQgPSB0aGlzLl9jb2VyY2VVcmkocGFyYW1zLnVyaSk7XG5cdFx0Y29uc3QgcmVxdWVzdGVkUGF0aCA9IHRoaXMuX2Fzc2VydEZpbGVVcmkocmVxdWVzdGVkKTtcblx0XHRjb25zdCBmb2xsb3dTeW1saW5rcyA9IHBhcmFtcy5mb2xsb3dTeW1saW5rcyA/PyB0cnVlO1xuXHRcdGNvbnN0IGxzdCA9IGF3YWl0IGxzdGF0KHJlcXVlc3RlZFBhdGgpO1xuXHRcdGlmIChsc3QuaXNTeW1ib2xpY0xpbmsoKSAmJiBmb2xsb3dTeW1saW5rcykge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRQYXRoID0gYXdhaXQgcmVhbHBhdGgocmVxdWVzdGVkUGF0aCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZFVyaSA9IFVSSS5maWxlKHJlc29sdmVkUGF0aCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZFN0YXQgPSBhd2FpdCBzdGF0KHJlc29sdmVkUGF0aCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IHJlc29sdmVkVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHR5cGU6IHJlc29sdmVkU3RhdC5pc0RpcmVjdG9yeSgpID8gUmVzb3VyY2VUeXBlLkRpcmVjdG9yeSA6IFJlc291cmNlVHlwZS5GaWxlLFxuXHRcdFx0XHRzaXplOiByZXNvbHZlZFN0YXQuaXNEaXJlY3RvcnkoKSA/IHVuZGVmaW5lZCA6IHJlc29sdmVkU3RhdC5zaXplLFxuXHRcdFx0XHRtdGltZTogcmVzb2x2ZWRTdGF0Lm10aW1lLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdGN0aW1lOiByZXNvbHZlZFN0YXQuY3RpbWUudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0ZXRhZzogYFcvXCIke3Jlc29sdmVkU3RhdC5zaXplfS0ke01hdGgudHJ1bmMocmVzb2x2ZWRTdGF0Lm10aW1lTXMpfVwiYCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IHN0ID0gZm9sbG93U3ltbGlua3MgPyBhd2FpdCBzdGF0KHJlcXVlc3RlZFBhdGgpIDogbHN0O1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHJlcXVlc3RlZC50b1N0cmluZygpLFxuXHRcdFx0dHlwZTogbHN0LmlzU3ltYm9saWNMaW5rKCkgJiYgIWZvbGxvd1N5bWxpbmtzID8gUmVzb3VyY2VUeXBlLlN5bWxpbmsgOiAoc3QuaXNEaXJlY3RvcnkoKSA/IFJlc291cmNlVHlwZS5EaXJlY3RvcnkgOiBSZXNvdXJjZVR5cGUuRmlsZSksXG5cdFx0XHRzaXplOiBzdC5pc0RpcmVjdG9yeSgpID8gdW5kZWZpbmVkIDogc3Quc2l6ZSxcblx0XHRcdG10aW1lOiBzdC5tdGltZS50b0lTT1N0cmluZygpLFxuXHRcdFx0Y3RpbWU6IHN0LmN0aW1lLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRldGFnOiBgVy9cIiR7c3Quc2l6ZX0tJHtNYXRoLnRydW5jKHN0Lm10aW1lTXMpfVwiYCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb3VyY2VXcml0ZShwYXJhbXM6IFJlc291cmNlV3JpdGVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlV3JpdGVSZXN1bHQ+IHtcblx0XHRjb25zdCB1cmkgPSB0aGlzLl9jb2VyY2VVcmkocGFyYW1zLnVyaSk7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSB0aGlzLl9hc3NlcnRGaWxlVXJpKHVyaSk7XG5cdFx0Y29uc3QgZGF0YUVuY29kaW5nID0gcGFyYW1zLmVuY29kaW5nID09PSBDb250ZW50RW5jb2RpbmcuVXRmOCA/IENvbnRlbnRFbmNvZGluZy5VdGY4IDogQ29udGVudEVuY29kaW5nLkJhc2U2NDtcblx0XHRjb25zdCBpbmNvbWluZyA9IEJ1ZmZlci5mcm9tKHBhcmFtcy5kYXRhLCBkYXRhRW5jb2RpbmcpO1xuXHRcdGNvbnN0IG1vZGUgPSBwYXJhbXMubW9kZSA/PyBSZXNvdXJjZVdyaXRlTW9kZS5UcnVuY2F0ZTtcblx0XHRjb25zdCBwb3NpdGlvbiA9IE1hdGgubWF4KDAsIHBhcmFtcy5wb3NpdGlvbiA/PyAwKTtcblx0XHRjb25zdCBjcmVhdGVPbmx5ID0gcGFyYW1zLmNyZWF0ZU9ubHkgPz8gZmFsc2U7XG5cblx0XHRhd2FpdCBta2RpcihkaXJuYW1lKGZpbGVQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5fcGF0aEV4aXN0cyhmaWxlUGF0aCk7XG5cdFx0aWYgKGNyZWF0ZU9ubHkgJiYgZXhpc3RzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZpbGUgYWxyZWFkeSBleGlzdHM6ICR7ZmlsZVBhdGh9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gZXhpc3RzID8gYXdhaXQgcmVhZEZpbGUoZmlsZVBhdGgpIDogQnVmZmVyLmFsbG9jKDApO1xuXHRcdGNvbnN0IGNsYW1wZWRTdGFydCA9IE1hdGgubWluKHBvc2l0aW9uLCBleGlzdGluZy5sZW5ndGgpO1xuXHRcdGxldCBuZXh0OiBCdWZmZXI7XG5cdFx0c3dpdGNoIChtb2RlKSB7XG5cdFx0XHRjYXNlIFJlc291cmNlV3JpdGVNb2RlLkFwcGVuZDoge1xuXHRcdFx0XHRjb25zdCBpbnNlcnRBdCA9IE1hdGgubWF4KDAsIGV4aXN0aW5nLmxlbmd0aCAtIE1hdGgubWluKHBvc2l0aW9uLCBleGlzdGluZy5sZW5ndGgpKTtcblx0XHRcdFx0bmV4dCA9IEJ1ZmZlci5jb25jYXQoW2V4aXN0aW5nLnN1YmFycmF5KDAsIGluc2VydEF0KSwgaW5jb21pbmcsIGV4aXN0aW5nLnN1YmFycmF5KGluc2VydEF0KV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUmVzb3VyY2VXcml0ZU1vZGUuSW5zZXJ0OlxuXHRcdFx0XHRuZXh0ID0gQnVmZmVyLmNvbmNhdChbZXhpc3Rpbmcuc3ViYXJyYXkoMCwgY2xhbXBlZFN0YXJ0KSwgaW5jb21pbmcsIGV4aXN0aW5nLnN1YmFycmF5KGNsYW1wZWRTdGFydCldKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJlc291cmNlV3JpdGVNb2RlLlRydW5jYXRlOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bmV4dCA9IEJ1ZmZlci5jb25jYXQoW2V4aXN0aW5nLnN1YmFycmF5KDAsIGNsYW1wZWRTdGFydCksIGluY29taW5nXSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRhd2FpdCB3cml0ZUZpbGUoZmlsZVBhdGgsIG5leHQpO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlTWtkaXIocGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fY29lcmNlVXJpKHBhcmFtcy51cmkpO1xuXHRcdGNvbnN0IGRpclBhdGggPSB0aGlzLl9hc3NlcnRGaWxlVXJpKHVyaSk7XG5cdFx0YXdhaXQgbWtkaXIoZGlyUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb3VyY2VEZWxldGUocGFyYW1zOiBSZXNvdXJjZURlbGV0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VEZWxldGVSZXN1bHQ+IHtcblx0XHRjb25zdCB1cmkgPSB0aGlzLl9jb2VyY2VVcmkocGFyYW1zLnVyaSk7XG5cdFx0Y29uc3QgdGFyZ2V0UGF0aCA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodXJpKTtcblx0XHRhd2FpdCBybSh0YXJnZXRQYXRoLCB7IHJlY3Vyc2l2ZTogcGFyYW1zLnJlY3Vyc2l2ZSA/PyBmYWxzZSwgZm9yY2U6IGZhbHNlIH0pO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlTW92ZShwYXJhbXM6IFJlc291cmNlTW92ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNb3ZlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh0aGlzLl9jb2VyY2VVcmkocGFyYW1zLnNvdXJjZSkpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh0aGlzLl9jb2VyY2VVcmkocGFyYW1zLmRlc3RpbmF0aW9uKSk7XG5cdFx0Y29uc3QgZmFpbElmRXhpc3RzID0gcGFyYW1zLmZhaWxJZkV4aXN0cyA/PyBmYWxzZTtcblx0XHRpZiAoZmFpbElmRXhpc3RzICYmIGF3YWl0IHRoaXMuX3BhdGhFeGlzdHMoZGVzdGluYXRpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYERlc3RpbmF0aW9uIGFscmVhZHkgZXhpc3RzOiAke2Rlc3RpbmF0aW9ufWApO1xuXHRcdH1cblx0XHRhd2FpdCBta2RpcihkaXJuYW1lKGRlc3RpbmF0aW9uKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgcmVuYW1lKHNvdXJjZSwgZGVzdGluYXRpb24pO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlQ29weShwYXJhbXM6IFJlc291cmNlQ29weVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VDb3B5UmVzdWx0PiB7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh0aGlzLl9jb2VyY2VVcmkocGFyYW1zLnNvdXJjZSkpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh0aGlzLl9jb2VyY2VVcmkocGFyYW1zLmRlc3RpbmF0aW9uKSk7XG5cdFx0Y29uc3QgZmFpbElmRXhpc3RzID0gcGFyYW1zLmZhaWxJZkV4aXN0cyA/PyBmYWxzZTtcblx0XHRpZiAoZmFpbElmRXhpc3RzICYmIGF3YWl0IHRoaXMuX3BhdGhFeGlzdHMoZGVzdGluYXRpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYERlc3RpbmF0aW9uIGFscmVhZHkgZXhpc3RzOiAke2Rlc3RpbmF0aW9ufWApO1xuXHRcdH1cblx0XHRhd2FpdCBta2RpcihkaXJuYW1lKGRlc3RpbmF0aW9uKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgY3Aoc291cmNlLCBkZXN0aW5hdGlvbiwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiAhZmFpbElmRXhpc3RzLCBlcnJvck9uRXhpc3Q6IGZhaWxJZkV4aXN0cyB9KTtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVSZXNvdXJjZVdhdGNoKF9wYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4geyBjaGFubmVsOiBgYWhwLXJlc291cmNlLXdhdGNoOi9tb2NrLSR7dGhpcy5fbmV4dFdhdGNoSWQrK31gIH07XG5cdH1cblxuXHQvKiogU2VuZCBhIEpTT04tUlBDIG5vdGlmaWNhdGlvbiAoZmlyZS1hbmQtZm9yZ2V0KS4gKi9cblx0bm90aWZ5KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0cmVjb3JkQWhwU3VyZmFjZSgnY29tbWFuZCcsIG1ldGhvZCk7XG5cdFx0aWYgKG1ldGhvZCA9PT0gJ2Rpc3BhdGNoQWN0aW9uJykge1xuXHRcdFx0Y29uc3QgZGlzcGF0Y2hlZCA9IHBhcmFtcyBhcyBEaXNwYXRjaEFjdGlvblBhcmFtcyB8IHVuZGVmaW5lZDtcblx0XHRcdHJlY29yZEFocFN1cmZhY2UoJ2FjdGlvbicsIGRpc3BhdGNoZWQ/LmFjdGlvbj8udHlwZSA/PyAnJyk7XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2U6IEpzb25ScGNOb3RpZmljYXRpb24gPSB7IGpzb25ycGM6ICcyLjAnLCBtZXRob2QsIHBhcmFtcyB9O1xuXHRcdHRoaXMuX2FocFNuYXBzaG90LnJlY29yZCgnYzJzJywgbWVzc2FnZSk7XG5cdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcGF0Y2ggYSBzdHJvbmdseS10eXBlZCBwcm90b2NvbCBhY3Rpb24gKGZpcmUtYW5kLWZvcmdldCB3cml0ZS1haGVhZCkuXG5cdCAqXG5cdCAqIFByZWZlciB0aGlzIG92ZXIgdGhlIHJhdyB7QGxpbmsgbm90aWZ5fSBlc2NhcGUgaGF0Y2g6IHRoZSBhY3Rpb24gcGF5bG9hZFxuXHQgKiBpcyBjaGVja2VkIGFnYWluc3QgdGhlIHtAbGluayBTdGF0ZUFjdGlvbn0gdW5pb24gYXQgY29tcGlsZSB0aW1lLCBzbyBhXG5cdCAqIG1hbGZvcm1lZCBvciBpbmNvbXBsZXRlIGFjdGlvbiAoZS5nLiBhbiBhcHByb3ZhbCBtaXNzaW5nIGl0cyByZXF1aXJlZFxuXHQgKiBgY29uZmlybWVkYCBmaWVsZCkgaXMgY2F1Z2h0IGJ5IHRoZSB0eXBlLWNoZWNrZXIgcmF0aGVyIHRoYW4gc2lsZW50bHlcblx0ICogc2hpcHBlZCBvdmVyIHRoZSB3aXJlIGFuZCByZWR1Y2VkIGludG8gYHVuZGVmaW5lZGAuXG5cdCAqL1xuXHRkaXNwYXRjaChwYXJhbXM6IERpc3BhdGNoQWN0aW9uUGFyYW1zKTogdm9pZCB7XG5cdFx0dGhpcy5ub3RpZnkoJ2Rpc3BhdGNoQWN0aW9uJywgcGFyYW1zKTtcblx0fVxuXG5cdC8qKiBTZW5kIGEgSlNPTi1SUEMgcmVxdWVzdCBhbmQgYXdhaXQgdGhlIHJlc3BvbnNlLiAqL1xuXHRjYWxsPFQ+KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM/OiB1bmtub3duLCB0aW1lb3V0TXMgPSBnZXRQcm90b2NvbE9wZXJhdGlvblRpbWVvdXQoKSk6IFByb21pc2U8VD4ge1xuXHRcdHJlY29yZEFocFN1cmZhY2UoJ2NvbW1hbmQnLCBtZXRob2QpO1xuXHRcdGNvbnN0IGlkID0gdGhpcy5fbmV4dElkKys7XG5cdFx0Y29uc3QgbWVzc2FnZTogSnNvblJwY1JlcXVlc3QgPSB7IGpzb25ycGM6ICcyLjAnLCBpZCwgbWV0aG9kLCBwYXJhbXMgfTtcblx0XHR0aGlzLl9haHBTbmFwc2hvdC5yZWNvcmQoJ2MycycsIG1lc3NhZ2UpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2FsbHMuZGVsZXRlKGlkKTtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCB3YWl0aW5nIGZvciByZXNwb25zZSB0byAke21ldGhvZH0gKGlkPSR7aWR9LCAke3RpbWVvdXRNc31tcylgKSk7XG5cdFx0XHR9LCB0aW1lb3V0TXMpO1xuXG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2FsbHMuc2V0KGlkLCB7XG5cdFx0XHRcdHJlc29sdmU6IHJlc3VsdCA9PiB7IGNsZWFyVGltZW91dCh0aW1lcik7IHJlc29sdmUocmVzdWx0IGFzIFQpOyB9LFxuXHRcdFx0XHRyZWplY3Q6IGVyciA9PiB7IGNsZWFyVGltZW91dCh0aW1lcik7IHJlamVjdChlcnIpOyB9LFxuXHRcdFx0fSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDYWxscy5kZWxldGUoaWQpO1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFdhaXQgZm9yIGEgc2VydmVyIG5vdGlmaWNhdGlvbiBtYXRjaGluZyBhIHByZWRpY2F0ZS4gKi9cblx0d2FpdEZvck5vdGlmaWNhdGlvbihwcmVkaWNhdGU6IChuOiBBaHBOb3RpZmljYXRpb24pID0+IGJvb2xlYW4sIHRpbWVvdXRNcyA9IGdldFByb3RvY29sT3BlcmF0aW9uVGltZW91dCgpKTogUHJvbWlzZTxBaHBOb3RpZmljYXRpb24+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX25vdGlmaWNhdGlvbnMuZmluZChwcmVkaWNhdGUpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShleGlzdGluZyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPEFocE5vdGlmaWNhdGlvbj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2FpdGVyID0ge1xuXHRcdFx0XHRwcmVkaWNhdGUsXG5cdFx0XHRcdHJlc29sdmUsXG5cdFx0XHRcdHJlamVjdCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVyKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVOb3RpZmljYXRpb25XYWl0ZXIod2FpdGVyKTtcblx0XHRcdFx0Y29uc3QgcmVjZWl2ZWQgPSB0aGlzLl9ub3RpZmljYXRpb25zLm1hcChuID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBuLm1ldGhvZCA9PT0gJ2FjdGlvbicgPyAobi5wYXJhbXMgYXMgQWN0aW9uRW52ZWxvcGUpLmFjdGlvbi50eXBlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldHVybiBhY3Rpb24gPyBgJHtuLm1ldGhvZH06JHthY3Rpb259YCA6IG4ubWV0aG9kO1xuXHRcdFx0XHR9KS5qb2luKCcsICcpO1xuXHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IHdhaXRpbmcgZm9yIG5vdGlmaWNhdGlvbiAoJHt0aW1lb3V0TXN9bXMpLiBSZWNlaXZlZDogJHtyZWNlaXZlZH1gKSk7XG5cdFx0XHR9LCB0aW1lb3V0TXMpO1xuXHRcdFx0dGhpcy5fbm90aWZXYWl0ZXJzLnB1c2god2FpdGVyKTtcblx0XHRcdHRoaXMuX2ZsdXNoTm90aWZpY2F0aW9uV2FpdGVycygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hOb3RpZmljYXRpb25XYWl0ZXJzKCk6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9ub3RpZldhaXRlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHdhaXRlciA9IHRoaXMuX25vdGlmV2FpdGVyc1tpXTtcblx0XHRcdGNvbnN0IG1hdGNoID0gdGhpcy5fbm90aWZpY2F0aW9ucy5maW5kKHdhaXRlci5wcmVkaWNhdGUpO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmV2FpdGVycy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdHdhaXRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHdhaXRlci5yZXNvbHZlKG1hdGNoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVOb3RpZmljYXRpb25XYWl0ZXIod2FpdGVyOiB7IHByZWRpY2F0ZTogKG46IEFocE5vdGlmaWNhdGlvbikgPT4gYm9vbGVhbjsgcmVzb2x2ZTogKG46IEFocE5vdGlmaWNhdGlvbikgPT4gdm9pZDsgcmVqZWN0OiAoZXJyOiBFcnJvcikgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9KTogdm9pZCB7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fbm90aWZXYWl0ZXJzLmluZGV4T2Yod2FpdGVyKTtcblx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdHRoaXMuX25vdGlmV2FpdGVycy5zcGxpY2UoaWR4LCAxKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmV0dXJuIGFsbCByZWNlaXZlZCBub3RpZmljYXRpb25zIG1hdGNoaW5nIGEgcHJlZGljYXRlLiAqL1xuXHRyZWNlaXZlZE5vdGlmaWNhdGlvbnMocHJlZGljYXRlPzogKG46IEFocE5vdGlmaWNhdGlvbikgPT4gYm9vbGVhbik6IEFocE5vdGlmaWNhdGlvbltdIHtcblx0XHRyZXR1cm4gcHJlZGljYXRlID8gdGhpcy5fbm90aWZpY2F0aW9ucy5maWx0ZXIocHJlZGljYXRlKSA6IFsuLi50aGlzLl9ub3RpZmljYXRpb25zXTtcblx0fVxuXG5cdC8qKiBTZW5kIGEgcmF3IHN0cmluZyBvdmVyIHRoZSBXZWJTb2NrZXQgd2l0aG91dCBKU09OIHNlcmlhbGl6YXRpb24uICovXG5cdHNlbmRSYXcoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fd3Muc2VuZChkYXRhKTtcblx0fVxuXG5cdC8qKiBXYWl0IGZvciB0aGUgbmV4dCByYXcgbWVzc2FnZSBmcm9tIHRoZSBzZXJ2ZXIuICovXG5cdHdhaXRGb3JSYXdNZXNzYWdlKHRpbWVvdXRNcyA9IGdldFByb3RvY29sT3BlcmF0aW9uVGltZW91dCgpKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCB3YWl0aW5nIGZvciByYXcgbWVzc2FnZSAoJHt0aW1lb3V0TXN9bXMpYCkpO1xuXHRcdFx0fSwgdGltZW91dE1zKTtcblx0XHRcdGNvbnN0IG9uTXNnID0gKGRhdGE6IEJ1ZmZlciB8IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSB0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycgPyBkYXRhIDogZGF0YS50b1N0cmluZygndXRmLTgnKTtcblx0XHRcdFx0cmVzb2x2ZShKU09OLnBhcnNlKHRleHQpKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHR0aGlzLl93cy5yZW1vdmVMaXN0ZW5lcignbWVzc2FnZScsIG9uTXNnKTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLl93cy5vbignbWVzc2FnZScsIG9uTXNnKTtcblx0XHR9KTtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jbG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY2xvc2VkID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IHcgb2YgdGhpcy5fbm90aWZXYWl0ZXJzKSB7XG5cdFx0XHR3LmRpc3Bvc2UoKTtcblx0XHRcdHcucmVqZWN0KG5ldyBFcnJvcignQ2xpZW50IGNsb3NlZCcpKTtcblx0XHR9XG5cdFx0dGhpcy5fbm90aWZXYWl0ZXJzLmxlbmd0aCA9IDA7XG5cdFx0Zm9yIChjb25zdCBbLCBwXSBvZiB0aGlzLl9wZW5kaW5nQ2FsbHMpIHtcblx0XHRcdHAucmVqZWN0KG5ldyBFcnJvcignQ2xpZW50IGNsb3NlZCcpKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NhbGxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fd3MuY2xvc2UoKTtcblx0fVxuXG5cdGNsZWFyUmVjZWl2ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90aWZpY2F0aW9ucy5sZW5ndGggPSAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldmVyc2UgcmVxdWVzdHMgdGhlIGhvc3QgaGFzIHNlbnQgdG8gdGhpcyBjbGllbnQsIGluIGFycml2YWwgb3JkZXIuXG5cdCAqIFNlcGFyYXRlIGZyb20ge0BsaW5rIGNsZWFyUmVjZWl2ZWR9IHNvIHJlc2V0dGluZyBub3RpZmljYXRpb25zIGRvZXMgbm90XG5cdCAqIHNpbGVudGx5IGRpc2NhcmQgdGhpcyBoaXN0b3J5LlxuXHQgKi9cblx0Z2V0IHNlcnZlZFJldmVyc2VSZXF1ZXN0cygpOiByZWFkb25seSBJU2VydmVkUmV2ZXJzZVJlcXVlc3RbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcnZlZFJldmVyc2VSZXF1ZXN0cztcblx0fVxuXG5cdGNsZWFyU2VydmVkUmV2ZXJzZVJlcXVlc3RzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlcnZlZFJldmVyc2VSZXF1ZXN0cy5sZW5ndGggPSAwO1xuXHR9XG5cblx0Y2xlYXJBaHBTbmFwc2hvdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9haHBTbmFwc2hvdC5jbGVhcigpO1xuXHR9XG5cblx0c2V0QWhwU25hcHNob3ROb3JtYWxpemF0aW9uKG5vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9haHBTbmFwc2hvdC5zZXROb3JtYWxpemF0aW9uKG5vcm1hbGl6YXRpb24pO1xuXHR9XG5cblx0c2V0V29ya2luZ0RpcmVjdG9yeSh3b3JraW5nRGlyZWN0b3J5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRXb3JraW5nRGlyZWN0b3J5Py4od29ya2luZ0RpcmVjdG9yeSk7XG5cdH1cblxuXHRiZWdpbkFocFNuYXBzaG90Um91bmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWhwU25hcHNob3QuYmVnaW5Sb3VuZCgpO1xuXHR9XG5cblx0c2VyaWFsaXplQWhwU25hcHNob3Qob3B0aW9ucz86IElBaHBTbmFwc2hvdE9wdGlvbnMpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9haHBTbmFwc2hvdC5zZXJpYWxpemUob3B0aW9ucyk7XG5cdH1cblxuXHR0YWtlUmVwbGF5RXJyb3IoKTogRXJyb3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90YWtlUmVwbGF5RXJyb3I/LigpO1xuXHR9XG59XG5cbi8vIC0tLS0gU2VydmVyIHByb2Nlc3MgbGlmZWN5Y2xlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcnZlckhhbmRsZSB7XG5cdHByb2Nlc3M6IENoaWxkUHJvY2Vzcztcblx0cG9ydDogbnVtYmVyO1xuXHQvKiogUHJlc2VudCB3aGVuIHRoZSBzZXJ2ZXIgd2FzIHN0YXJ0ZWQgd2l0aCBhIG1vY2sgTExNOyBleHBvc2VzIHJlcXVlc3QgY291bnQgZm9yIGFzc2VydGlvbnMuICovXG5cdG1vY2tMbG0/OiBJTW9ja0xsbVNlcnZlckhhbmRsZVdpdGhMb2c7XG5cdC8qKlxuXHQgKiBQcmVzZW50IHdoZW4gdGhlIHNlcnZlciB3YXMgc3RhcnRlZCB3aXRoIGBjYXBpUmVwbGF5YC4gU3RvcCBpdCAoaWRlYWxseSBpblxuXHQgKiBgc3VpdGVUZWFyZG93bmAsIGJlZm9yZSBraWxsaW5nIHRoZSBwcm9jZXNzKSB0byBmbHVzaCByZWNvcmRlZCBleGNoYW5nZXMgdG9cblx0ICogdGhlIGZpeHR1cmUgYW5kIHN1cmZhY2Ugc3RyaWN0LW1vZGUgY2FjaGUgbWlzc2VzLlxuXHQgKi9cblx0Y2FwaVJlcGxheT86IENhcGlSZXBsYXlQcm94eTtcbn1cblxuY29uc3QgU0VSVkVSX1NIVVRET1dOX1RJTUVPVVRfTVMgPSBpc0NJIHx8IGlzV2luZG93cyB8fCBBR0VOVF9IT1NUX0UyRV9DT1ZFUkFHRSA/IDMwXzAwMCA6IDVfMDAwO1xuXG4vKiogR3JhY2VmdWxseSBzdG9wIGFuIEFnZW50IEhvc3QgdGVzdCBzZXJ2ZXIsIGtpbGxpbmcgaXQgaWYgc2h1dGRvd24gc3RhbGxzLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN0b3BTZXJ2ZXIoc2VydmVyOiBJU2VydmVySGFuZGxlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHNlcnZlclByb2Nlc3MgPSBzZXJ2ZXI/LnByb2Nlc3M7XG5cdGlmICghc2VydmVyUHJvY2VzcyB8fCBzZXJ2ZXJQcm9jZXNzLmV4aXRDb2RlICE9PSBudWxsIHx8IHNlcnZlclByb2Nlc3Muc2lnbmFsQ29kZSAhPT0gbnVsbCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHNlcnZlckV4aXQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRjb25zdCBvbkV4aXQgPSAoKSA9PiByZXNvbHZlKCk7XG5cdFx0c2VydmVyUHJvY2Vzcy5vbmNlKCdleGl0Jywgb25FeGl0KTtcblx0XHRpZiAoc2VydmVyUHJvY2Vzcy5leGl0Q29kZSAhPT0gbnVsbCB8fCBzZXJ2ZXJQcm9jZXNzLnNpZ25hbENvZGUgIT09IG51bGwpIHtcblx0XHRcdHNlcnZlclByb2Nlc3MucmVtb3ZlTGlzdGVuZXIoJ2V4aXQnLCBvbkV4aXQpO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH1cblx0fSk7XG5cdHNlcnZlclByb2Nlc3Muc3RkaW4/LmVuZCgpO1xuXHRpZiAoIWF3YWl0IHJhY2VUaW1lb3V0KHNlcnZlckV4aXQudGhlbigoKSA9PiB0cnVlKSwgU0VSVkVSX1NIVVRET1dOX1RJTUVPVVRfTVMpKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChzZXJ2ZXJQcm9jZXNzLmV4aXRDb2RlID09PSBudWxsICYmIHNlcnZlclByb2Nlc3Muc2lnbmFsQ29kZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBraWxsZWQgPSBzZXJ2ZXJQcm9jZXNzLmtpbGwoJ1NJR0tJTEwnKTtcblx0XHRcdFx0aWYgKCFraWxsZWQgJiYgc2VydmVyUHJvY2Vzcy5leGl0Q29kZSA9PT0gbnVsbCAmJiBzZXJ2ZXJQcm9jZXNzLnNpZ25hbENvZGUgPT09IG51bGwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byB0ZXJtaW5hdGUgQWdlbnQgSG9zdCB0ZXN0IHNlcnZlcicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChzZXJ2ZXJQcm9jZXNzLmV4aXRDb2RlID09PSBudWxsICYmIHNlcnZlclByb2Nlc3Muc2lnbmFsQ29kZSA9PT0gbnVsbCkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgc2VydmVyRXhpdDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU1vY2tMbG1TZXJ2ZXJIYW5kbGUge1xuXHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0cmVxdWVzdENvdW50KCk6IG51bWJlcjtcblx0Z2V0UmVxdWVzdHM/KCk6IHJlYWRvbmx5IHVua25vd25bXTtcblx0Y2xvc2UoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuaW50ZXJmYWNlIElNb2NrTGxtU2VydmVySGFuZGxlV2l0aExvZyBleHRlbmRzIElNb2NrTGxtU2VydmVySGFuZGxlIHtcblx0bG9nTWVzc2FnZXM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgSU1vY2tMbG1TZXJ2ZXJNb2R1bGUge1xuXHRzdGFydFNlcnZlcihwb3J0OiBudW1iZXIsIG9wdGlvbnM/OiB7IGxvZ2dlcj86IChtc2c6IHN0cmluZykgPT4gdm9pZDsgdmVyYm9zZT86IGJvb2xlYW47IGNhcHR1cmVSZXF1ZXN0cz86IGJvb2xlYW4gfSk6IFByb21pc2U8SU1vY2tMbG1TZXJ2ZXJIYW5kbGU+O1xuXHRyZWdpc3RlclNjZW5hcmlvKGlkOiBzdHJpbmcsIGRlZmluaXRpb246IHVua25vd24pOiB2b2lkO1xufVxuXG4vKiogQSBtb2NrLUxMTSBzY2VuYXJpbyB0byByZWdpc3RlciBiZWZvcmUgcmVjb3JkaW5nIChzZWUgYG1vY2stbGxtLXNlcnZlci50c2ApLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTW9ja1NjZW5hcmlvIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZGVmaW5pdGlvbjogdW5rbm93bjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0KG5vcm1hbFRpbWVvdXRNczogbnVtYmVyLCBleHRlbmRlZFRpbWVvdXRNczogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIEFHRU5UX0hPU1RfRTJFX0NPVkVSQUdFIHx8IGlzQ0kgfHwgaXNXaW5kb3dzID8gZXh0ZW5kZWRUaW1lb3V0TXMgOiBub3JtYWxUaW1lb3V0TXM7XG59XG5cbmZ1bmN0aW9uIHdpdGhBZ2VudEhvc3RDb3ZlcmFnZShlbnZpcm9ubWVudDogTm9kZUpTLlByb2Nlc3NFbnYpOiBOb2RlSlMuUHJvY2Vzc0VudiB7XG5cdGNvbnN0IGNoaWxkRW52aXJvbm1lbnQgPSB7IC4uLmVudmlyb25tZW50IH07XG5cdGlmIChBR0VOVF9IT1NUX0UyRV9DT1ZFUkFHRSkge1xuXHRcdGNvbnN0IGNvdmVyYWdlUGF0aCA9IHJlc29sdmVQYXRoKHByb2Nlc3MuY3dkKCksICcuYnVpbGQnLCAnYWdlbnQtaG9zdC1lMmUtY292ZXJhZ2UnLCAncmF3Jyk7XG5cdFx0bWtkaXJTeW5jKGNvdmVyYWdlUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0Y2hpbGRFbnZpcm9ubWVudC5OT0RFX1Y4X0NPVkVSQUdFID0gY292ZXJhZ2VQYXRoO1xuXHR9IGVsc2Uge1xuXHRcdGRlbGV0ZSBjaGlsZEVudmlyb25tZW50Lk5PREVfVjhfQ09WRVJBR0U7XG5cdH1cblx0cmV0dXJuIGNoaWxkRW52aXJvbm1lbnQ7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkQ29waWxvdENoYXRUb2tlbihtb2NrVXJsOiBzdHJpbmcsIGNvcGlsb3RQbGFuOiAnZnJlZScgfCAncHJvJyA9ICdmcmVlJyk6IHN0cmluZyB7XG5cdHJldHVybiBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeSh7XG5cdFx0dG9rZW46ICdzbW9rZXRlc3QtZmFrZS10b2tlbicsXG5cdFx0ZXhwaXJlc19hdDogTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAzNjAwLFxuXHRcdHJlZnJlc2hfaW46IDE4MDAsXG5cdFx0c2t1OiBjb3BpbG90UGxhbiA9PT0gJ3BybycgPyAnaW5kaXZpZHVhbF9zdWJzY3JpcHRpb25fY29waWxvdCcgOiAnZnJlZV9saW1pdGVkX2NvcGlsb3QnLFxuXHRcdGluZGl2aWR1YWw6IHRydWUsXG5cdFx0aXNOb0F1dGhVc2VyOiB0cnVlLFxuXHRcdGNvcGlsb3RfcGxhbjogY29waWxvdFBsYW4sXG5cdFx0b3JnYW5pemF0aW9uX2xvZ2luX2xpc3Q6IFtdLFxuXHRcdGVuZHBvaW50czogeyBhcGk6IG1vY2tVcmwsIHByb3h5OiBtb2NrVXJsIH0sXG5cdH0pKS50b1N0cmluZygnYmFzZTY0Jyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0TW9ja0xsbVNlcnZlcihzY2VuYXJpb3M/OiByZWFkb25seSBJTW9ja1NjZW5hcmlvW10pOiBQcm9taXNlPElNb2NrTGxtU2VydmVySGFuZGxlV2l0aExvZz4ge1xuXHRjb25zdCBtb2NrU2VydmVyUGF0aCA9IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi4vLi4vLi4vLi4vLi4vLi4vc2NyaXB0cy9jaGF0LXNpbXVsYXRpb24vY29tbW9uL21vY2stbGxtLXNlcnZlci50cycsIGltcG9ydC5tZXRhLnVybCkpO1xuXHRjb25zdCBub2RlUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblx0Y29uc3QgbW9ja01vZHVsZSA9IG5vZGVSZXF1aXJlKG1vY2tTZXJ2ZXJQYXRoKSBhcyBJTW9ja0xsbVNlcnZlck1vZHVsZTtcblx0bW9ja01vZHVsZS5yZWdpc3RlclNjZW5hcmlvKCd0ZXh0LW9ubHknLCB7XG5cdFx0dHlwZTogJ211bHRpLXR1cm4nLFxuXHRcdHR1cm5zOiBbeyBraW5kOiAnZWNoby1sYXN0LW1lc3NhZ2UnIH1dLFxuXHR9KTtcblx0Zm9yIChjb25zdCBzY2VuYXJpbyBvZiBzY2VuYXJpb3MgPz8gW10pIHtcblx0XHRtb2NrTW9kdWxlLnJlZ2lzdGVyU2NlbmFyaW8oc2NlbmFyaW8uaWQsIHNjZW5hcmlvLmRlZmluaXRpb24pO1xuXHR9XG5cdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBzZXJ2ZXJIYW5kbGUgPSBhd2FpdCBtb2NrTW9kdWxlLnN0YXJ0U2VydmVyKDAsIHsgbG9nZ2VyOiBtc2cgPT4gbWVzc2FnZXMucHVzaChtc2cpLCB2ZXJib3NlOiB0cnVlLCBjYXB0dXJlUmVxdWVzdHM6IHRydWUgfSk7XG5cdHJldHVybiB7IC4uLnNlcnZlckhhbmRsZSwgbG9nTWVzc2FnZXM6IG1lc3NhZ2VzIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFNlcnZlcihvcHRpb25zPzogeyByZWFkb25seSBxdWlldD86IGJvb2xlYW47IHJlYWRvbmx5IHVzZXJEYXRhRGlyPzogc3RyaW5nOyByZWFkb25seSBlbnY/OiBOb2RlSlMuUHJvY2Vzc0VudjsgcmVhZG9ubHkgc3RhcnR1cFRpbWVvdXRNcz86IG51bWJlciB9KTogUHJvbWlzZTxJU2VydmVySGFuZGxlPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3Qgc2VydmVyUGF0aCA9IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi4vLi4vbm9kZS9hZ2VudEhvc3RTZXJ2ZXJNYWluLmpzJywgaW1wb3J0Lm1ldGEudXJsKSk7XG5cdFx0Y29uc3QgYXJncyA9IFsnLS1lbmFibGUtbW9jay1hZ2VudCcsICctLXBvcnQnLCAnMCcsICctLXdpdGhvdXQtY29ubmVjdGlvbi10b2tlbiddO1xuXHRcdGlmIChvcHRpb25zPy5xdWlldCA/PyB0cnVlKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tcXVpZXQnKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnM/LnVzZXJEYXRhRGlyKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tdXNlci1kYXRhLWRpcicsIG9wdGlvbnMudXNlckRhdGFEaXIpO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZCA9IGZvcmsoc2VydmVyUGF0aCwgYXJncywge1xuXHRcdFx0c3RkaW86IFsncGlwZScsICdwaXBlJywgJ3BpcGUnLCAnaXBjJ10sXG5cdFx0XHRlbnY6IHdpdGhBZ2VudEhvc3RDb3ZlcmFnZSh7IC4uLnByb2Nlc3MuZW52LCAuLi5vcHRpb25zPy5lbnYgfSksXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0Y2hpbGQua2lsbCgpO1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcignU2VydmVyIHN0YXJ0dXAgdGltZWQgb3V0JykpO1xuXHRcdH0sIG9wdGlvbnM/LnN0YXJ0dXBUaW1lb3V0TXMgPz8gZ2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQoMTBfMDAwLCA0NV8wMDApKTtcblxuXHRcdGNoaWxkLnN0ZG91dCEub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gZGF0YS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9SRUFEWTooXFxkKykvKTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHRyZXNvbHZlKHsgcHJvY2VzczogY2hpbGQsIHBvcnQ6IHBhcnNlSW50KG1hdGNoWzFdLCAxMCkgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjaGlsZC5zdGRlcnIhLm9uKCdkYXRhJywgKCkgPT4ge1xuXHRcdFx0Ly8gSW50ZW50aW9uYWxseSBzd2FsbG93ZWQgLSB0aGUgdGVzdCBydW5uZXIgZmFpbHMgaWYgY29uc29sZS5lcnJvciBpcyB1c2VkLlxuXHRcdH0pO1xuXG5cdFx0Y2hpbGQub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRyZWplY3QoZXJyKTtcblx0XHR9KTtcblxuXHRcdGNoaWxkLm9uKCdleGl0JywgY29kZSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgU2VydmVyIGV4aXRlZCBwcmVtYXR1cmVseSB3aXRoIGNvZGUgJHtjb2RlfWApKTtcblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogU3RhcnQgdGhlIGFnZW50IGhvc3Qgc2VydmVyIHdpdGggdGhlIENvcGlsb3QgU0RLIGFnZW50IHdpdGggZWl0aGVyIGEgcmVhbCBvciBtb2NrZWQgTExNLlxuICogVGhlIHNlcnZlciBpcyBzdGFydGVkIHdpdGggbG9nZ2luZyBlbmFibGVkIHNvIHRoZSBDb3BpbG90QWdlbnQgaXMgcmVnaXN0ZXJlZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN0YXJ0UmVhbFNlcnZlcihvcHRpb25zPzogeyByZWFkb25seSBjbGF1ZGVTZGtSb290Pzogc3RyaW5nOyByZWFkb25seSBjb2RleFNka1Jvb3Q/OiBzdHJpbmc7IHJlYWRvbmx5IGNvZGV4SG9tZURpcj86IHN0cmluZzsgcmVhZG9ubHkgY29kZXhBZ2VudEVuYWJsZWQ/OiBib29sZWFuOyByZWFkb25seSBtb2NrTGxtPzogYm9vbGVhbjsgcmVhZG9ubHkgaG9tZURpcj86IHN0cmluZzsgcmVhZG9ubHkgdXNlckRhdGFEaXI/OiBzdHJpbmc7IHJlYWRvbmx5IGxvZ0xldmVsPzogc3RyaW5nOyByZWFkb25seSBlbnY/OiBOb2RlSlMuUHJvY2Vzc0VudjsgcmVhZG9ubHkgY2FwaVJlcGxheT86IHsgcmVhZG9ubHkgZml4dHVyZVBhdGg6IHN0cmluZzsgcmVhZG9ubHkgbW9kZT86IENhcGlSZXBsYXlNb2RlOyByZWFkb25seSB3b3JrRGlyPzogc3RyaW5nOyByZWFkb25seSByZWFsPzogYm9vbGVhbjsgcmVhZG9ubHkgYWxsb3dQb3NpeENvbW1hbmRzPzogYm9vbGVhbjsgcmVhZG9ubHkgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdD86IGJvb2xlYW4gfTsgcmVhZG9ubHkgZXhpc3RpbmdDYXBpUmVwbGF5PzogQ2FwaVJlcGxheVByb3h5OyByZWFkb25seSBtb2NrU2NlbmFyaW9zPzogcmVhZG9ubHkgSU1vY2tTY2VuYXJpb1tdIH0pOiBQcm9taXNlPElTZXJ2ZXJIYW5kbGU+IHtcblx0Ly8gYGNhcGlSZXBsYXlgIHJlY29yZHMvcmVwbGF5cyBpbiBmcm9udCBvZiB0aGUgbW9jayBMTE0gc2VydmVyLCBzbyBpdCBpbXBsaWVzXG5cdC8vIGEgbW9jayB1cHN0cmVhbSBldmVuIHdoZW4gYG1vY2tMbG1gIHdhcyBub3QgZXhwbGljaXRseSByZXF1ZXN0ZWQgXHUyMDE0IHVubGVzc1xuXHQvLyBgcmVhbGAgaXMgc2V0LCBpbiB3aGljaCBjYXNlIHRoZSBwcm94eSBmb3J3YXJkcyB0byByZWFsIENBUEkvR2l0SHViLlxuXHRjb25zdCByZWFsQ2FwdHVyZSA9IG9wdGlvbnM/LmNhcGlSZXBsYXk/LnJlYWwgPT09IHRydWU7XG5cdGNvbnN0IG1vY2tMbG1TZXJ2ZXIgPSAob3B0aW9ucz8ubW9ja0xsbSB8fCAob3B0aW9ucz8uY2FwaVJlcGxheSAmJiAhcmVhbENhcHR1cmUpKSA/IGF3YWl0IHN0YXJ0TW9ja0xsbVNlcnZlcihvcHRpb25zPy5tb2NrU2NlbmFyaW9zKSA6IHVuZGVmaW5lZDtcblx0bGV0IGNhcGlSZXBsYXlQcm94eSA9IG9wdGlvbnM/LmV4aXN0aW5nQ2FwaVJlcGxheTtcblx0aWYgKGNhcGlSZXBsYXlQcm94eSAmJiAhb3B0aW9ucz8uY2FwaVJlcGxheSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignUmV1c2luZyBhIENBUEkgcmVwbGF5IHByb3h5IHJlcXVpcmVzIGl0cyByZXBsYXkgY29uZmlndXJhdGlvbicpO1xuXHR9XG5cdGlmIChvcHRpb25zPy5jYXBpUmVwbGF5ICYmICFjYXBpUmVwbGF5UHJveHkpIHtcblx0XHRjYXBpUmVwbGF5UHJveHkgPSBuZXcgQ2FwaVJlcGxheVByb3h5KHJlYWxDYXB0dXJlID8ge1xuXHRcdFx0Zml4dHVyZVBhdGg6IG9wdGlvbnMuY2FwaVJlcGxheS5maXh0dXJlUGF0aCxcblx0XHRcdG1vZGU6IG9wdGlvbnMuY2FwaVJlcGxheS5tb2RlLFxuXHRcdFx0d29ya0Rpcjogb3B0aW9ucy5jYXBpUmVwbGF5LndvcmtEaXIsXG5cdFx0XHRhbGxvd1Bvc2l4Q29tbWFuZHM6IG9wdGlvbnMuY2FwaVJlcGxheS5hbGxvd1Bvc2l4Q29tbWFuZHMsXG5cdFx0XHRhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0OiBvcHRpb25zLmNhcGlSZXBsYXkuYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCxcblx0XHRcdGhvbWVEaXI6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdHVzZXJOYW1lOiB1c2VySW5mbygpLnVzZXJuYW1lLFxuXHRcdFx0Ly8gUmVhbCBob3N0cyAoY29uc3VtZXIgZGVmYXVsdHMpOyBvdmVycmlkZSBmb3IgRW50ZXJwcmlzZS9CdXNpbmVzcyBhY2NvdW50cy5cblx0XHRcdGdpdGh1YlVwc3RyZWFtVXJsOiBwcm9jZXNzLmVudlsnQUdFTlRfSE9TVF9SRUNPUkRfR0lUSFVCX1VSTCddIHx8ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRcdGNhcGlVcHN0cmVhbVVybDogcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVDT1JEX0NBUElfVVJMJ10gfHwgJ2h0dHBzOi8vYXBpLmdpdGh1YmNvcGlsb3QuY29tJyxcblx0XHR9IDoge1xuXHRcdFx0Zml4dHVyZVBhdGg6IG9wdGlvbnMuY2FwaVJlcGxheS5maXh0dXJlUGF0aCxcblx0XHRcdG1vZGU6IG9wdGlvbnMuY2FwaVJlcGxheS5tb2RlLFxuXHRcdFx0d29ya0Rpcjogb3B0aW9ucy5jYXBpUmVwbGF5LndvcmtEaXIsXG5cdFx0XHRhbGxvd1Bvc2l4Q29tbWFuZHM6IG9wdGlvbnMuY2FwaVJlcGxheS5hbGxvd1Bvc2l4Q29tbWFuZHMsXG5cdFx0XHRhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0OiBvcHRpb25zLmNhcGlSZXBsYXkuYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCxcblx0XHRcdGhvbWVEaXI6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdHVzZXJOYW1lOiB1c2VySW5mbygpLnVzZXJuYW1lLFxuXHRcdFx0dXBzdHJlYW1Vcmw6IG1vY2tMbG1TZXJ2ZXIhLnVybCxcblx0XHR9KTtcblx0XHRhd2FpdCBjYXBpUmVwbGF5UHJveHkuc3RhcnQoKTtcblx0fVxuXHQvLyBUaGUgYWdlbnQgaG9zdCB0YWxrcyB0byB0aGUgcHJveHkgKHdoZW4gcmVwbGF5aW5nKSBvciBkaXJlY3RseSB0byB0aGUgbW9jay5cblx0Y29uc3QgY2FwaVVybCA9IGNhcGlSZXBsYXlQcm94eT8udXJsID8/IG1vY2tMbG1TZXJ2ZXI/LnVybDtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXJQYXRoID0gZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuLi8uLi9ub2RlL2FnZW50SG9zdFNlcnZlck1haW4uanMnLCBpbXBvcnQubWV0YS51cmwpKTtcblx0XHRjb25zdCBhcmdzID0gWyctLXBvcnQnLCAnMCcsICctLXdpdGhvdXQtY29ubmVjdGlvbi10b2tlbiddO1xuXHRcdGlmIChvcHRpb25zPy5jbGF1ZGVTZGtSb290KSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tY2xhdWRlLXNkay1yb290Jywgb3B0aW9ucy5jbGF1ZGVTZGtSb290KTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnM/LmNvZGV4U2RrUm9vdCkge1xuXHRcdFx0YXJncy5wdXNoKCctLWNvZGV4LXNkay1yb290Jywgb3B0aW9ucy5jb2RleFNka1Jvb3QpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8udXNlckRhdGFEaXIpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS11c2VyLWRhdGEtZGlyJywgb3B0aW9ucy51c2VyRGF0YURpcik7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5sb2dMZXZlbCkge1xuXHRcdFx0YXJncy5wdXNoKCctLWxvZycsIG9wdGlvbnMubG9nTGV2ZWwpO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZEVudiA9IHdpdGhBZ2VudEhvc3RDb3ZlcmFnZSh7XG5cdFx0XHQuLi5wcm9jZXNzLmVudixcblx0XHRcdC4uLihvcHRpb25zPy5lbnYgPz8ge30pLFxuXHRcdFx0Li4uKG9wdGlvbnM/LmhvbWVEaXIgPyB7XG5cdFx0XHRcdEhPTUU6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdFx0VVNFUlBST0ZJTEU6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdFx0QVBQREFUQTogam9pbihvcHRpb25zLmhvbWVEaXIsICdBcHBEYXRhJywgJ1JvYW1pbmcnKSxcblx0XHRcdFx0TE9DQUxBUFBEQVRBOiBqb2luKG9wdGlvbnMuaG9tZURpciwgJ0FwcERhdGEnLCAnTG9jYWwnKSxcblx0XHRcdFx0WERHX0NPTkZJR19IT01FOiBqb2luKG9wdGlvbnMuaG9tZURpciwgJy5jb25maWcnKSxcblx0XHRcdFx0Q09QSUxPVF9IT01FOiBqb2luKG9wdGlvbnMuaG9tZURpciwgJy5jb3BpbG90JyksXG5cdFx0XHRcdENPUElMT1RfU0tJTExTX0RJUlM6IHVuZGVmaW5lZCxcblx0XHRcdFx0Q0xBVURFX0NPTkZJR19ESVI6IHVuZGVmaW5lZCxcblx0XHRcdFx0Q09ERVhfSE9NRTogdW5kZWZpbmVkLFxuXHRcdFx0XHQuLi4oaXNXaW5kb3dzICYmIG9wdGlvbnMuaG9tZURpci5tYXRjaCgvXltBLVphLXpdOltcXFxcL10vKSA/IHtcblx0XHRcdFx0XHRIT01FRFJJVkU6IG9wdGlvbnMuaG9tZURpci5zbGljZSgwLCAyKSxcblx0XHRcdFx0XHRIT01FUEFUSDogb3B0aW9ucy5ob21lRGlyLnNsaWNlKDIpLnJlcGxhY2UoL1xcLy9nLCAnXFxcXCcpLFxuXHRcdFx0XHR9IDoge30pLFxuXHRcdFx0fSA6IHt9KSxcblx0XHRcdC4uLihvcHRpb25zPy5jb2RleEhvbWVEaXIgPyB7IFtBZ2VudEhvc3RDb2RleEFnZW50Q29kZXhIb21lRW52VmFyXTogb3B0aW9ucy5jb2RleEhvbWVEaXIgfSA6IHt9KSxcblx0XHRcdC8vIENvZGV4IGRlZmF1bHRzIHRvIGRpc2FibGVkOyBvcHQgaXQgaW4gZm9yIHRoZSBhZ2VudCBob3N0IGUyZSBzdWl0ZSB3aGVuIGFcblx0XHRcdC8vIGNvZGV4IFNESyByb290IGlzIHN1cHBsaWVkIHNvIHRoZSBwcm92aWRlciBhY3R1YWxseSByZWdpc3RlcnMuXG5cdFx0XHQuLi4ob3B0aW9ucz8uY29kZXhTZGtSb290ID8geyBbQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRFbnZWYXJdOiBTdHJpbmcob3B0aW9ucy5jb2RleEFnZW50RW5hYmxlZCA/PyB0cnVlKSB9IDoge30pLFxuXHRcdFx0Ly8gRml4dHVyZXMgdXNlIENvZGV4J3MgdW5pZmllZCBleGVjIHRvb2wsIHNvIGtlZXAgcmVjb3JkIGFuZCByZXBsYXkgb24gdGhlIHNhbWUgc2hlbGwgcHJvdG9jb2wuXG5cdFx0XHQuLi4ob3B0aW9ucz8uY29kZXhTZGtSb290ICYmIG9wdGlvbnMuY2FwaVJlcGxheSA/IHsgW0FnZW50SG9zdENvZGV4QWdlbnRCaW5hcnlBcmdzRW52VmFyXTogSlNPTi5zdHJpbmdpZnkoWyctYycsICdmZWF0dXJlcy51bmlmaWVkX2V4ZWM9dHJ1ZSddKSB9IDoge30pLFxuXHRcdFx0Li4uKHJlYWxDYXB0dXJlID8ge1xuXHRcdFx0XHQvLyBSZWFsLUNBUEkgY2FwdHVyZS9yZXBsYXk6IHJvdXRlIGFsbCBDQVBJICsgR2l0SHViLUFQSSB0cmFmZmljIHRocm91Z2hcblx0XHRcdFx0Ly8gdGhlIHByb3h5LiBUaGUgcmVhbCBHaXRIdWIgdG9rZW4gZmxvd3MgdmlhIHRoZSBgYXV0aGVudGljYXRlYFxuXHRcdFx0XHQvLyBwcm90b2NvbCBjYWxsIChyZWNvcmQpIG9yIGEgcGxhY2Vob2xkZXIgKHJlcGxheSksIG5vdCB2aWEgZW52LlxuXHRcdFx0XHRDT1BJTE9UX0FQSV9VUkw6IGNhcGlVcmwsXG5cdFx0XHRcdENPUElMT1RfREVCVUdfR0lUSFVCX0FQSV9VUkw6IGNhcGlVcmwsXG5cdFx0XHRcdFZTQ09ERV9BR0VOVF9IT1NUX0NBUElfVVJMX09WRVJSSURFOiBjYXBpVXJsLFxuXHRcdFx0fSA6IG1vY2tMbG1TZXJ2ZXIgPyB7XG5cdFx0XHRcdEdJVEhVQl9QQVQ6ICdzbW9rZXRlc3QtZmFrZS1wYXQnLFxuXHRcdFx0XHRJU19TQ0VOQVJJT19BVVRPTUFUSU9OOiAnMScsXG5cdFx0XHRcdC8vIEFnZW50IGhvc3QgZTJlIENvcGlsb3QgdGVzdHMgcnVuIGFnYWluc3QgcmVzcG9uc2VzLWNhcGFibGUgbW9kZWxzXG5cdFx0XHRcdC8vIChlLmcuIGdwdC01LjMtY29kZXgpIHRoYXQgYXJlIFwicHJvXCItZ2F0ZWQgaW4gdGhlIG1vY2sgL21vZGVsc1xuXHRcdFx0XHQvLyBmaXh0dXJlLCBzbyBtaW50IGEgcHJvLXBsYW4gdG9rZW4gZm9yIHRoaXMgaGFybmVzcy5cblx0XHRcdFx0VlNDT0RFX0NPUElMT1RfQ0hBVF9UT0tFTjogYnVpbGRDb3BpbG90Q2hhdFRva2VuKGNhcGlVcmwhLCAncHJvJyksXG5cdFx0XHRcdC8vIFJvdXRlIHRoZSBDb3BpbG90IFNESydzIEdpdEh1YiBBUEkgY2FsbHMgKHRva2VuIHJlZnJlc2gsIG1vZGVsXG5cdFx0XHRcdC8vIGRpc2NvdmVyeSwgZXRjLikgYXQgdGhlIG1vY2svcHJveHkgaW5zdGVhZCBvZiBhcGkuZ2l0aHViLmNvbSxcblx0XHRcdFx0Ly8gd2hpY2ggd291bGQgNDAxIHdpdGggdGhlIGZha2UgdG9rZW4uXG5cdFx0XHRcdENPUElMT1RfREVCVUdfR0lUSFVCX0FQSV9VUkw6IGNhcGlVcmwsXG5cdFx0XHRcdENPUElMT1RfQVBJX1VSTDogY2FwaVVybCxcblx0XHRcdFx0R0lUSFVCX0NPUElMT1RfQVBJX1RPS0VOOiAnc21va2V0ZXN0LWZha2UtYWdlbnQtaG9zdC10b2tlbicsXG5cdFx0XHRcdC8vIFJvdXRlIHRoZSBhZ2VudCBob3N0J3Mgc2hhcmVkIENBUEkgY2xpZW50ICh1c2VkIGJ5IHRoZSBDb2RleCAvXG5cdFx0XHRcdC8vIGFnZW50LWhvc3QgaGFybmVzc2VzIGZvciBtb2RlbCBkaXNjb3ZlcnkgKyByZXF1ZXN0cykgYXQgdGhlXG5cdFx0XHRcdC8vIG1vY2svcHJveHkgaW5zdGVhZCBvZiBhcGkuZ2l0aHViLmNvbSwgd2hpY2ggd291bGQgNDAxIHdpdGggdGhlXG5cdFx0XHRcdC8vIGZha2UgdG9rZW4uXG5cdFx0XHRcdFZTQ09ERV9BR0VOVF9IT1NUX0NBUElfVVJMX09WRVJSSURFOiBjYXBpVXJsLFxuXHRcdFx0fSA6IHt9KSxcblx0XHR9KTtcblx0XHRsZXQgY2hpbGQ6IENoaWxkUHJvY2Vzcztcblx0XHR0cnkge1xuXHRcdFx0Y2hpbGQgPSBmb3JrKHNlcnZlclBhdGgsIGFyZ3MsIHtcblx0XHRcdFx0c3RkaW86IFsncGlwZScsICdwaXBlJywgJ3BpcGUnLCAnaXBjJ10sXG5cdFx0XHRcdGVudjogY2hpbGRFbnYsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHZvaWQgbW9ja0xsbVNlcnZlcj8uY2xvc2UoKTtcblx0XHRcdHZvaWQgY2FwaVJlcGxheVByb3h5Py5zdG9wKCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0bGV0IG1vY2tDbG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBjbG9zZU1vY2tTZXJ2ZXIgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRpZiAobW9ja0Nsb3NlZCB8fCAhbW9ja0xsbVNlcnZlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRtb2NrQ2xvc2VkID0gdHJ1ZTtcblx0XHRcdC8vIEZsdXNoIGFueSByZWNvcmRpbmcgYmVmb3JlIGNsb3NpbmcgdGhlIHVwc3RyZWFtLiBTd2FsbG93IHN0cmljdFxuXHRcdFx0Ly8gY2FjaGUtbWlzcyBlcnJvcnMgaGVyZSBcdTIwMTQgdGVzdHMgdGhhdCB3YW50IHRoZW0gY2FsbCBgY2FwaVJlcGxheS5zdG9wKClgXG5cdFx0XHQvLyBleHBsaWNpdGx5IGluIHRlYXJkb3duLlxuXHRcdFx0YXdhaXQgY2FwaVJlcGxheVByb3h5Py5zdG9wKCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG1vY2tMbG1TZXJ2ZXIuY2xvc2UoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBiZXN0IGVmZm9ydFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y2hpbGQub24oJ2V4aXQnLCAoKSA9PiB7XG5cdFx0XHR2b2lkIGNsb3NlTW9ja1NlcnZlcigpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNoaWxkLmtpbGwoKTtcblx0XHRcdHZvaWQgY2xvc2VNb2NrU2VydmVyKCk7XG5cdFx0XHRyZWplY3QobmV3IEVycm9yKCdSZWFsIHNlcnZlciBzdGFydHVwIHRpbWVkIG91dCcpKTtcblx0XHR9LCAzMF8wMDApO1xuXG5cdFx0Y2hpbGQuc3Rkb3V0IS5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHRleHQubWF0Y2goL1JFQURZOihcXGQrKS8pO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdHJlc29sdmUoeyBwcm9jZXNzOiBjaGlsZCwgcG9ydDogcGFyc2VJbnQobWF0Y2hbMV0sIDEwKSwgbW9ja0xsbTogbW9ja0xsbVNlcnZlciwgY2FwaVJlcGxheTogY2FwaVJlcGxheVByb3h5IH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y2hpbGQuc3RkZXJyIS5vbignZGF0YScsICgpID0+IHtcblx0XHRcdC8vIEludGVudGlvbmFsbHkgc3dhbGxvd2VkIC0gdGhlIHRlc3QgcnVubmVyIGZhaWxzIGlmIGNvbnNvbGUuZXJyb3IgaXMgdXNlZC5cblx0XHRcdC8vIFNlcnZlciBsb2dzIGdvIHRvIHRoZSBhZ2VudCBob3N0J3MgbG9nZ2VyICh1bmRlclxuXHRcdFx0Ly8gYDx1c2VyRGF0YVBhdGg+L2xvZ3MvPHRpbWVzdGFtcD4vYWdlbnRob3N0LXNlcnZlci5sb2dgKTsgY2hlY2tcblx0XHRcdC8vIHRoZXJlIHdoZW4gaW52ZXN0aWdhdGluZyBhZ2VudCBob3N0IGUyZSB0ZXN0IGZhaWx1cmVzLlxuXHRcdH0pO1xuXG5cdFx0Y2hpbGQub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHR2b2lkIGNsb3NlTW9ja1NlcnZlcigpO1xuXHRcdFx0cmVqZWN0KGVycik7XG5cdFx0fSk7XG5cblx0XHRjaGlsZC5vbignZXhpdCcsIGNvZGUgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdHZvaWQgY2xvc2VNb2NrU2VydmVyKCk7XG5cdFx0XHRyZWplY3QobmV3IEVycm9yKGBSZWFsIHNlcnZlciBleGl0ZWQgcHJlbWF0dXJlbHkgd2l0aCBjb2RlICR7Y29kZX1gKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vLyAtLS0tIEhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5sZXQgc2Vzc2lvbkNvdW50ZXIgPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gbmV4dFNlc3Npb25VcmkoKTogc3RyaW5nIHtcblx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9jaycsIHBhdGg6IGAvdGVzdC1zZXNzaW9uLSR7KytzZXNzaW9uQ291bnRlcn1gIH0pLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0Q2hhdENoYW5uZWwoc2Vzc2lvblVyaTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuOiBBaHBOb3RpZmljYXRpb24sIGFjdGlvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAobi5tZXRob2QgIT09ICdhY3Rpb24nKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGVudmVsb3BlID0gbi5wYXJhbXMgYXMgdW5rbm93biBhcyBBY3Rpb25FbnZlbG9wZTtcblx0cmV0dXJuIGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBhY3Rpb25UeXBlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aW9uRW52ZWxvcGUobjogQWhwTm90aWZpY2F0aW9uKTogQWN0aW9uRW52ZWxvcGUge1xuXHRyZXR1cm4gbi5wYXJhbXMgYXMgdW5rbm93biBhcyBBY3Rpb25FbnZlbG9wZTtcbn1cblxuLyoqIFBlcmZvcm0gaGFuZHNoYWtlLCBjcmVhdGUgYSBzZXNzaW9uLCBzdWJzY3JpYmUsIGFuZCByZXR1cm4gaXRzIFVSSS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVBbmRTdWJzY3JpYmVTZXNzaW9uKGM6IFRlc3RQcm90b2NvbENsaWVudCwgY2xpZW50SWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGF3YWl0IGMuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgcHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLCBjbGllbnRJZCB9KTtcblxuXHRhd2FpdCBjLmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7IGNoYW5uZWw6IG5leHRTZXNzaW9uVXJpKCksIHByb3ZpZGVyOiAnbW9jaycsIHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCB9KTtcblxuXHRjb25zdCBub3RpZiA9IGF3YWl0IGMud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0bi5tZXRob2QgPT09ICdyb290L3Nlc3Npb25BZGRlZCdcblx0KTtcblx0Y29uc3QgcmVhbFNlc3Npb25VcmkgPSAobm90aWYucGFyYW1zIGFzIFNlc3Npb25BZGRlZFBhcmFtcykuc3VtbWFyeS5yZXNvdXJjZTtcblxuXHRhd2FpdCBjLmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiByZWFsU2Vzc2lvblVyaSB9KTtcblx0Ly8gVHVybnMgYW5kIG90aGVyIGNvbnZlcnNhdGlvbiBjb250ZW50cyBsaXZlIG9uIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdFxuXHQvLyBjaGF0IGNoYW5uZWwgaW4gdGhlIG11bHRpLWNoYXQgcHJvdG9jb2w7IHN1YnNjcmliZSB0byBpdCBhcyB3ZWxsIHNvXG5cdC8vIGBjaGF0LypgIGFjdGlvbiBub3RpZmljYXRpb25zIChyZXNwb25zZVBhcnQsIHR1cm5Db21wbGV0ZSwgXHUyMDI2KSBhcmVcblx0Ly8gZGVsaXZlcmVkIHRvIHRoaXMgY2xpZW50LlxuXHRhd2FpdCBjLmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHJlYWxTZXNzaW9uVXJpKSB9KTtcblx0Yy5jbGVhclJlY2VpdmVkKCk7XG5cblx0cmV0dXJuIHJlYWxTZXNzaW9uVXJpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGlzcGF0Y2hUdXJuU3RhcnRlZChjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiB2b2lkIHtcblx0Yy5kaXNwYXRjaCh7XG5cdFx0Y2hhbm5lbDogZGVmYXVsdENoYXRDaGFubmVsKHNlc3Npb24pLFxuXHRcdGNsaWVudFNlcSxcblx0XHRhY3Rpb246IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0sXG5cdH0pO1xufVxuXG4vKipcbiAqIFN1YnNjcmliZXMgdG8gYSBzZXNzaW9uIGNoYW5uZWwgYW5kIGl0cyBkZWZhdWx0IGNoYXQgY2hhbm5lbCBhbmQgcmV0dXJucyB0aGVcbiAqIG1lcmdlZCB7QGxpbmsgSVNlc3Npb25XaXRoRGVmYXVsdENoYXR9IHZpZXcuIEluIHRoZSBtdWx0aS1jaGF0IHByb3RvY29sIHRoZVxuICogY29udmVyc2F0aW9uIGNvbnRlbnRzICh0dXJucywgYWN0aXZlVHVybiwgcXVldWVkL3N0ZWVyaW5nIG1lc3NhZ2VzLCBpbnB1dFxuICogcmVxdWVzdHMpIGxpdmUgb24gdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgY2hhbm5lbCwgc28gcmVhZGluZyB0aGVtXG4gKiByZXF1aXJlcyBtZXJnaW5nIHRoZSBzZXNzaW9uIHNuYXBzaG90IHdpdGggaXRzIGRlZmF1bHQgY2hhdCBzbmFwc2hvdC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoU2Vzc2lvbldpdGhDaGF0KGM6IFRlc3RQcm90b2NvbENsaWVudCwgc2Vzc2lvblVyaTogc3RyaW5nKTogUHJvbWlzZTxJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdD4ge1xuXHRjb25zdCBvd25pbmdTZXNzaW9uID0gcGFyc2VEZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSA/PyBzZXNzaW9uVXJpO1xuXHRjb25zdCBjaGF0VXJpID0gcGFyc2VEZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSA/IHNlc3Npb25VcmkgOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRjb25zdCBzZXNzaW9uU25hcCA9IGF3YWl0IGMuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IG93bmluZ1Nlc3Npb24gfSk7XG5cdGNvbnN0IGNoYXRTbmFwID0gYXdhaXQgYy5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblx0cmV0dXJuIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdChcblx0XHRzZXNzaW9uU25hcC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlLFxuXHRcdGNoYXRTbmFwLnNuYXBzaG90Py5zdGF0ZSBhcyBDaGF0U3RhdGUgfCB1bmRlZmluZWQsXG5cdCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUF1QixZQUFZO0FBQ25DLFNBQVMsSUFBSSxPQUFPLE9BQU8sVUFBVSxTQUFTLFVBQVUsUUFBUSxJQUFJLE1BQU0saUJBQWlCO0FBQzNGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUE0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
