var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as cp from "child_process";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../base/common/strings.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { redactToken, resolveRemotePlatform } from "./sshRemoteAgentHostHelpers.js";
import {
  composeAgentHostBootstrapScript,
  decodeWslOutput,
  extractAgentHostWebSocketURL,
  getWslExePath,
  isWSLSupported,
  parseRunningDistros,
  parseWslListVerbose,
  runWslCommand,
  validateDistroName
} from "./wslRemoteAgentHostHelpers.js";
const LOG_PREFIX = "[WSLRemoteAgentHost]";
const AGENT_HOST_READY_TIMEOUT_MS = 6e4;
const WEBSOCKET_OPEN_TIMEOUT_MS = 3e4;
const OUTPUT_BUFFER_LINES = 50;
let WSLRemoteAgentHostMainService = class extends Disposable {
  constructor(_logService, _productService) {
    super();
    this._logService = _logService;
    this._productService = _productService;
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._onDidCloseConnection = this._register(new Emitter());
    this.onDidCloseConnection = this._onDidCloseConnection.event;
    this._onDidReportConnectProgress = this._register(new Emitter());
    this.onDidReportConnectProgress = this._onDidReportConnectProgress.event;
    this._onDidRelayMessage = this._register(new Emitter());
    this.onDidRelayMessage = this._onDidRelayMessage.event;
    this._onDidRelayClose = this._register(new Emitter());
    this.onDidRelayClose = this._onDidRelayClose.event;
    this._connections = /* @__PURE__ */ new Map();
    this._distroToConnectionId = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => {
      for (const id of [...this._connections.keys()]) {
        this._closeConnection(id);
      }
    }));
  }
  get _quality() {
    return this._productService.quality || "insider";
  }
  get _serverDataFolderName() {
    const value = this._productService.serverDataFolderName;
    if (!value) {
      throw new Error(`${LOG_PREFIX} productService.serverDataFolderName is required`);
    }
    return value;
  }
  get _commit() {
    return this._productService.commit;
  }
  /** Lazily load `require` so the `ws` native module is only resolved at runtime. */
  async _getNativeRequire() {
    if (!this._nativeRequire) {
      const nodeModule = await import("node:module");
      this._nativeRequire = nodeModule.createRequire(import.meta.url);
    }
    return this._nativeRequire;
  }
  async isWSLAvailable() {
    return isWSLSupported();
  }
  async listDistros() {
    try {
      const [verbose, running] = await Promise.all([
        runWslCommand(["--list", "--verbose"]),
        runWslCommand(["--list", "--running", "--quiet"])
      ]);
      if (verbose.exitCode !== 0) {
        this._logService.info(`${LOG_PREFIX} wsl --list --verbose exited ${verbose.exitCode}: ${verbose.stderr.trim()}`);
        return [];
      }
      const parsed = parseWslListVerbose(verbose.stdout);
      if (running.exitCode !== 0) {
        return parsed;
      }
      const runningSet = new Set(parseRunningDistros(running.stdout));
      return parsed.map((d) => ({ ...d, isRunning: runningSet.has(d.name) }));
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} listDistros failed`, err);
      return [];
    }
  }
  async listRunningDistros() {
    try {
      const result = await runWslCommand(["--list", "--running", "--quiet"]);
      if (result.exitCode !== 0) {
        return [];
      }
      return parseRunningDistros(result.stdout);
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} listRunningDistros failed`, err);
      return [];
    }
  }
  async connect(config) {
    const distro = validateDistroName(config.distro);
    const existingId = this._distroToConnectionId.get(distro);
    if (existingId) {
      const existing = this._connections.get(existingId);
      if (existing) {
        return {
          connectionId: existing.connectionId,
          address: existing.address,
          distro: existing.distro,
          name: existing.name,
          connectionToken: existing.connectionToken
        };
      }
    }
    const connectionKey = `wsl:${distro}`;
    const reportProgress = (message) => {
      this._onDidReportConnectProgress.fire({ connectionKey, message });
    };
    reportProgress(localize("wslProgressDetectingPlatform", "Detecting platform in {0}...", distro));
    const { os: targetOs, arch: targetArch } = await this._resolvePlatform(distro);
    reportProgress(localize("wslProgressPreparingCLI", "Preparing CLI in {0}...", distro));
    const script = composeAgentHostBootstrapScript({
      serverDataFolderName: this._serverDataFolderName,
      quality: this._quality,
      commit: this._commit,
      os: targetOs,
      arch: targetArch,
      remoteAgentHostCommand: config.remoteAgentHostCommand
    });
    this._logService.info(`${LOG_PREFIX} Spawning agent host in WSL distro '${distro}'`);
    this._logService.trace(`${LOG_PREFIX} bootstrap script: ${script}`);
    const child = cp.spawn(getWslExePath(), ["-d", distro, "-e", "bash", "-lc", script], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let url;
    let urlResolve;
    let urlReject;
    const urlPromise = new Promise((res, rej) => {
      urlResolve = res;
      urlReject = rej;
    });
    const outputLines = [];
    const appendLine = (line) => {
      outputLines.push(redactToken(line));
      if (outputLines.length > OUTPUT_BUFFER_LINES) {
        outputLines.shift();
      }
    };
    const onStreamData = (data) => {
      const cleanText = removeAnsiEscapeCodes(decodeWslOutput(data));
      for (const rawLine of cleanText.split(/\r\n|\r|\n/)) {
        const line = rawLine.trimEnd();
        if (!line) {
          continue;
        }
        appendLine(line);
        this._logService.trace(`${LOG_PREFIX} [${distro}] ${redactToken(line)}`);
        if (!url) {
          const match = extractAgentHostWebSocketURL(line);
          if (match) {
            url = match.url;
            urlResolve?.({ url: match.url, token: match.token });
          }
        }
      }
    };
    child.stdout?.on("data", onStreamData);
    child.stderr?.on("data", onStreamData);
    const childExited = new Promise((res) => {
      child.once("exit", (code, signal) => res({ code, signal }));
    });
    const readyTimeoutHandle = setTimeout(() => {
      urlReject?.(new Error(`${LOG_PREFIX} Timed out waiting for agent host in '${distro}' to print its WebSocket URL after ${AGENT_HOST_READY_TIMEOUT_MS}ms.
Output: ${outputLines.join("\n")}`));
    }, AGENT_HOST_READY_TIMEOUT_MS);
    const earlyExitGuard = childExited.then(({ code, signal }) => {
      if (!url) {
        urlReject?.(new Error(`${LOG_PREFIX} Agent host in '${distro}' exited (code=${code}, signal=${signal}) before printing its WebSocket URL.
Output: ${outputLines.join("\n")}`));
      }
    });
    let resolvedUrl;
    try {
      resolvedUrl = await urlPromise;
    } catch (err) {
      clearTimeout(readyTimeoutHandle);
      this._killChild(child);
      await earlyExitGuard.catch(() => {
      });
      throw err;
    }
    clearTimeout(readyTimeoutHandle);
    reportProgress(localize("wslProgressConnecting", "Connecting to agent host in {0}...", distro));
    let ws;
    try {
      ws = await this._openWebSocket(resolvedUrl.url);
    } catch (err) {
      this._killChild(child);
      throw err;
    }
    const connectionId = generateUuid();
    const connection = {
      connectionId,
      distro,
      name: config.name,
      address: connectionKey,
      connectionToken: resolvedUrl.token,
      child,
      ws
    };
    ws.on("message", (data) => {
      let text;
      if (typeof data === "string") {
        text = data;
      } else if (Array.isArray(data)) {
        text = Buffer.concat(data).toString("utf8");
      } else if (data instanceof ArrayBuffer) {
        text = Buffer.from(new Uint8Array(data)).toString("utf8");
      } else {
        text = data.toString("utf8");
      }
      this._onDidRelayMessage.fire({ connectionId, data: text });
    });
    ws.on("close", () => {
      this._closeConnection(connectionId);
    });
    ws.on("error", (err) => {
      this._logService.warn(`${LOG_PREFIX} WebSocket error for ${connectionKey}: ${err instanceof Error ? err.message : String(err)}`);
    });
    this._connections.set(connectionId, connection);
    this._distroToConnectionId.set(distro, connectionId);
    this._onDidChangeConnections.fire();
    return {
      connectionId,
      address: connectionKey,
      distro,
      name: config.name,
      connectionToken: resolvedUrl.token
    };
  }
  async disconnect(distro) {
    const id = this._distroToConnectionId.get(distro);
    if (id) {
      this._closeConnection(id);
    }
  }
  async reconnect(distro, name, remoteAgentHostCommand) {
    const existingId = this._distroToConnectionId.get(distro);
    if (existingId) {
      this._closeConnection(existingId);
    }
    return this.connect({ distro, name, remoteAgentHostCommand });
  }
  async relaySend(connectionId, message) {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      this._logService.debug(`${LOG_PREFIX} relaySend: no connection ${connectionId}`);
      return;
    }
    try {
      conn.ws.send(message);
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} relaySend failed for ${connectionId}`, err);
    }
  }
  _closeConnection(connectionId) {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      return;
    }
    this._connections.delete(connectionId);
    if (this._distroToConnectionId.get(conn.distro) === connectionId) {
      this._distroToConnectionId.delete(conn.distro);
    }
    try {
      conn.ws.close();
    } catch {
    }
    this._killChild(conn.child);
    this._onDidRelayClose.fire(connectionId);
    this._onDidCloseConnection.fire(connectionId);
    this._onDidChangeConnections.fire();
  }
  _killChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      child.kill();
    } catch {
    }
    const escalate = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
        }
      }
    }, 2e3);
    escalate.unref();
    child.once("exit", () => clearTimeout(escalate));
  }
  async _resolvePlatform(distro) {
    const result = await runWslCommand(["-e", "uname", "-s", "-m"], { distro, timeout: 1e4 });
    if (result.exitCode !== 0) {
      throw new Error(`${LOG_PREFIX} Failed to detect platform in '${distro}' (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
    }
    const tokens = result.stdout.trim().split(/\s+/);
    if (tokens.length < 2) {
      throw new Error(`${LOG_PREFIX} Unexpected uname output from '${distro}': ${JSON.stringify(result.stdout)}`);
    }
    const resolved = resolveRemotePlatform(tokens[0], tokens.slice(1).join(" "));
    if (!resolved) {
      throw new Error(localize("wslUnsupportedPlatform", "Unsupported WSL distro platform: {0}", result.stdout.trim()));
    }
    return resolved;
  }
  async _openWebSocket(url) {
    const nativeRequire = await this._getNativeRequire();
    const WS = nativeRequire("ws");
    const deadline = Date.now() + WEBSOCKET_OPEN_TIMEOUT_MS;
    let lastError;
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`${LOG_PREFIX} Timed out opening WebSocket to ${redactToken(url)} after ${WEBSOCKET_OPEN_TIMEOUT_MS}ms${lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : ""}`);
      }
      try {
        return await this._tryOpenWebSocket(new WS(url), url, remaining);
      } catch (err) {
        lastError = err;
        if (!isConnectionRefused(err)) {
          throw err;
        }
        const delay = Math.min(100 + attempt * 100, 500);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  _tryOpenWebSocket(ws, url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        try {
          ws.close();
        } catch {
        }
        reject(new Error(`${LOG_PREFIX} Timed out opening WebSocket to ${redactToken(url)} after ${timeoutMs}ms`));
      }, timeoutMs);
      ws.once("open", () => {
        clearTimeout(timeoutHandle);
        resolve(ws);
      });
      ws.once("error", (err) => {
        clearTimeout(timeoutHandle);
        try {
          ws.close();
        } catch {
        }
        reject(err);
      });
    });
  }
};
WSLRemoteAgentHostMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProductService)
], WSLRemoteAgentHostMainService);
function isConnectionRefused(err) {
  if (!err || typeof err !== "object") {
    return false;
  }
  const code = err.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EADDRNOTAVAIL") {
    return true;
  }
  const errors = err.errors;
  if (Array.isArray(errors)) {
    return errors.some(isConnectionRefused);
  }
  return false;
}
export {
  WSLRemoteAgentHostMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFx3c2xSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgV2ViU29ja2V0IGZyb20gJ3dzJztcbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmVsYXlNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL3JlbGF5VHJhbnNwb3J0LmpzJztcbmltcG9ydCB7XG5cdElXU0xSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSxcblx0dHlwZSBJV1NMQWdlbnRIb3N0Q29uZmlnLFxuXHR0eXBlIElXU0xDb25uZWN0UHJvZ3Jlc3MsXG5cdHR5cGUgSVdTTENvbm5lY3RSZXN1bHQsXG5cdHR5cGUgSVdTTERpc3Rybyxcbn0gZnJvbSAnLi4vY29tbW9uL3dzbFJlbW90ZUFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyByZWRhY3RUb2tlbiwgcmVzb2x2ZVJlbW90ZVBsYXRmb3JtIH0gZnJvbSAnLi9zc2hSZW1vdGVBZ2VudEhvc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7XG5cdGNvbXBvc2VBZ2VudEhvc3RCb290c3RyYXBTY3JpcHQsXG5cdGRlY29kZVdzbE91dHB1dCxcblx0ZXh0cmFjdEFnZW50SG9zdFdlYlNvY2tldFVSTCxcblx0Z2V0V3NsRXhlUGF0aCxcblx0aXNXU0xTdXBwb3J0ZWQsXG5cdHBhcnNlUnVubmluZ0Rpc3Ryb3MsXG5cdHBhcnNlV3NsTGlzdFZlcmJvc2UsXG5cdHJ1bldzbENvbW1hbmQsXG5cdHZhbGlkYXRlRGlzdHJvTmFtZSxcbn0gZnJvbSAnLi93c2xSZW1vdGVBZ2VudEhvc3RIZWxwZXJzLmpzJztcblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbV1NMUmVtb3RlQWdlbnRIb3N0XSc7XG5cbi8qKiBNYXggdGltZSB0byB3YWl0IGZvciBgY29kZSBhZ2VudCBob3N0YCBpbnNpZGUgdGhlIGRpc3RybyB0byBwcmludCBpdHMgYHdzOi8vYCBVUkwuICovXG5jb25zdCBBR0VOVF9IT1NUX1JFQURZX1RJTUVPVVRfTVMgPSA2MF8wMDA7XG5cbi8qKiBNYXggdGltZSB0byB3YWl0IGZvciB0aGUgaG9zdC1zaWRlIFdlYlNvY2tldCB0byBjb21wbGV0ZSBpdHMgaGFuZHNoYWtlLiAqL1xuY29uc3QgV0VCU09DS0VUX09QRU5fVElNRU9VVF9NUyA9IDMwXzAwMDtcblxuLyoqIE1heCBzdGRvdXQvc3RkZXJyIGxpbmVzIGtlcHQgYnVmZmVyZWQgZm9yIGRpYWdub3N0aWMgY29udGV4dCBvbiBmYWlsdXJlLiAqL1xuY29uc3QgT1VUUFVUX0JVRkZFUl9MSU5FUyA9IDUwO1xuXG5pbnRlcmZhY2UgSVdTTENvbm5lY3Rpb24ge1xuXHRyZWFkb25seSBjb25uZWN0aW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZGlzdHJvOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYWRkcmVzczogc3RyaW5nO1xuXHRyZWFkb25seSBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hpbGQ6IGNwLkNoaWxkUHJvY2Vzcztcblx0cmVhZG9ubHkgd3M6IFdlYlNvY2tldDtcbn1cblxuZXhwb3J0IGNsYXNzIFdTTFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXU0xSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25uZWN0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2VDb25uZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZUNvbm5lY3Rpb246IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXU0xDb25uZWN0UHJvZ3Jlc3M+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzczogRXZlbnQ8SVdTTENvbm5lY3RQcm9ncmVzcz4gPSB0aGlzLl9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbGF5TWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSZWxheU1lc3NhZ2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbGF5TWVzc2FnZTogRXZlbnQ8SVJlbGF5TWVzc2FnZT4gPSB0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbGF5Q2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbGF5Q2xvc2U6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZFJlbGF5Q2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVdTTENvbm5lY3Rpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Ryb1RvQ29ubmVjdGlvbklkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRwcml2YXRlIF9uYXRpdmVSZXF1aXJlOiBOb2RlSlMuUmVxdWlyZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIFsuLi50aGlzLl9jb25uZWN0aW9ucy5rZXlzKCldKSB7XG5cdFx0XHRcdHRoaXMuX2Nsb3NlQ29ubmVjdGlvbihpZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX3F1YWxpdHkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSB8fCAnaW5zaWRlcic7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfc2VydmVyRGF0YUZvbGRlck5hbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnNlcnZlckRhdGFGb2xkZXJOYW1lO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBwcm9kdWN0U2VydmljZS5zZXJ2ZXJEYXRhRm9sZGVyTmFtZSBpcyByZXF1aXJlZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfY29tbWl0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdDtcblx0fVxuXG5cdC8qKiBMYXppbHkgbG9hZCBgcmVxdWlyZWAgc28gdGhlIGB3c2AgbmF0aXZlIG1vZHVsZSBpcyBvbmx5IHJlc29sdmVkIGF0IHJ1bnRpbWUuICovXG5cdHByaXZhdGUgYXN5bmMgX2dldE5hdGl2ZVJlcXVpcmUoKTogUHJvbWlzZTxOb2RlSlMuUmVxdWlyZT4ge1xuXHRcdGlmICghdGhpcy5fbmF0aXZlUmVxdWlyZSkge1xuXHRcdFx0Y29uc3Qgbm9kZU1vZHVsZSA9IGF3YWl0IGltcG9ydCgnbm9kZTptb2R1bGUnKTtcblx0XHRcdHRoaXMuX25hdGl2ZVJlcXVpcmUgPSBub2RlTW9kdWxlLmNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25hdGl2ZVJlcXVpcmU7XG5cdH1cblxuXHRhc3luYyBpc1dTTEF2YWlsYWJsZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gaXNXU0xTdXBwb3J0ZWQoKTtcblx0fVxuXG5cdGFzeW5jIGxpc3REaXN0cm9zKCk6IFByb21pc2U8SVdTTERpc3Ryb1tdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFJ1biBib3RoIHByb2JlcyBpbiBwYXJhbGxlbCBzbyB3ZSBjYW4gb3ZlcmxheSB0aGUgbG9jYWxlLWZyZWVcblx0XHRcdC8vIHJ1bm5pbmcgc2V0IG9uIHRoZSB2ZXJib3NlIHBhcnNlICh0aGUgYFNUQVRFYCBjb2x1bW4gZnJvbVxuXHRcdFx0Ly8gYC0tdmVyYm9zZWAgaXMgbG9jYWxpemVkIGJ5IFdpbmRvd3MgYW5kIHJlYWRzIFwiU3RvcHBlZFwiIGZvclxuXHRcdFx0Ly8gZXZlcnkgZGlzdHJvIG9uIG5vbi1FbmdsaXNoIGhvc3RzKS5cblx0XHRcdGNvbnN0IFt2ZXJib3NlLCBydW5uaW5nXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0cnVuV3NsQ29tbWFuZChbJy0tbGlzdCcsICctLXZlcmJvc2UnXSksXG5cdFx0XHRcdHJ1bldzbENvbW1hbmQoWyctLWxpc3QnLCAnLS1ydW5uaW5nJywgJy0tcXVpZXQnXSksXG5cdFx0XHRdKTtcblx0XHRcdGlmICh2ZXJib3NlLmV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSB3c2wgLS1saXN0IC0tdmVyYm9zZSBleGl0ZWQgJHt2ZXJib3NlLmV4aXRDb2RlfTogJHt2ZXJib3NlLnN0ZGVyci50cmltKCl9YCk7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlV3NsTGlzdFZlcmJvc2UodmVyYm9zZS5zdGRvdXQpO1xuXHRcdFx0aWYgKHJ1bm5pbmcuZXhpdENvZGUgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJ1bm5pbmdTZXQgPSBuZXcgU2V0KHBhcnNlUnVubmluZ0Rpc3Ryb3MocnVubmluZy5zdGRvdXQpKTtcblx0XHRcdHJldHVybiBwYXJzZWQubWFwKGQgPT4gKHsgLi4uZCwgaXNSdW5uaW5nOiBydW5uaW5nU2V0LmhhcyhkLm5hbWUpIH0pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBsaXN0RGlzdHJvcyBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGxpc3RSdW5uaW5nRGlzdHJvcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bldzbENvbW1hbmQoWyctLWxpc3QnLCAnLS1ydW5uaW5nJywgJy0tcXVpZXQnXSk7XG5cdFx0XHRpZiAocmVzdWx0LmV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJzZVJ1bm5pbmdEaXN0cm9zKHJlc3VsdC5zdGRvdXQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IGxpc3RSdW5uaW5nRGlzdHJvcyBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvbm5lY3QoY29uZmlnOiBJV1NMQWdlbnRIb3N0Q29uZmlnKTogUHJvbWlzZTxJV1NMQ29ubmVjdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGRpc3RybyA9IHZhbGlkYXRlRGlzdHJvTmFtZShjb25maWcuZGlzdHJvKTtcblxuXHRcdC8vIElkZW1wb3RlbnQ6IGEgc2Vjb25kIGBjb25uZWN0YCBmb3IgYW4gYWxyZWFkeS1saXZlIGRpc3RybyByZXR1cm5zXG5cdFx0Ly8gdGhlIGV4aXN0aW5nIGNvbm5lY3Rpb24gc28gdGhlIHJlbmRlcmVyLXNpZGUgYF9zZXR1cENvbm5lY3Rpb25gXG5cdFx0Ly8gcmV1c2VzIGl0cyBoYW5kbGUgKGl0IGRlZHVwZXMgYnkgYGNvbm5lY3Rpb25JZGApLiBQaWNraW5nXG5cdFx0Ly8gXCJXU0wuLi5cIiBcdTIxOTIgc2FtZSBkaXN0cm8gc2hvdWxkIGJlIGEgbm8tb3AsIG5vdCBhbiBlcnJvci5cblx0XHRjb25zdCBleGlzdGluZ0lkID0gdGhpcy5fZGlzdHJvVG9Db25uZWN0aW9uSWQuZ2V0KGRpc3Rybyk7XG5cdFx0aWYgKGV4aXN0aW5nSWQpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGV4aXN0aW5nSWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29ubmVjdGlvbklkOiBleGlzdGluZy5jb25uZWN0aW9uSWQsXG5cdFx0XHRcdFx0YWRkcmVzczogZXhpc3RpbmcuYWRkcmVzcyxcblx0XHRcdFx0XHRkaXN0cm86IGV4aXN0aW5nLmRpc3Rybyxcblx0XHRcdFx0XHRuYW1lOiBleGlzdGluZy5uYW1lLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogZXhpc3RpbmcuY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbm5lY3Rpb25LZXkgPSBgd3NsOiR7ZGlzdHJvfWA7XG5cdFx0Y29uc3QgcmVwb3J0UHJvZ3Jlc3MgPSAobWVzc2FnZTogc3RyaW5nKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcy5maXJlKHsgY29ubmVjdGlvbktleSwgbWVzc2FnZSB9KTtcblx0XHR9O1xuXG5cdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3dzbFByb2dyZXNzRGV0ZWN0aW5nUGxhdGZvcm0nLCBcIkRldGVjdGluZyBwbGF0Zm9ybSBpbiB7MH0uLi5cIiwgZGlzdHJvKSk7XG5cdFx0Y29uc3QgeyBvczogdGFyZ2V0T3MsIGFyY2g6IHRhcmdldEFyY2ggfSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVQbGF0Zm9ybShkaXN0cm8pO1xuXG5cdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3dzbFByb2dyZXNzUHJlcGFyaW5nQ0xJJywgXCJQcmVwYXJpbmcgQ0xJIGluIHswfS4uLlwiLCBkaXN0cm8pKTtcblx0XHRjb25zdCBzY3JpcHQgPSBjb21wb3NlQWdlbnRIb3N0Qm9vdHN0cmFwU2NyaXB0KHtcblx0XHRcdHNlcnZlckRhdGFGb2xkZXJOYW1lOiB0aGlzLl9zZXJ2ZXJEYXRhRm9sZGVyTmFtZSxcblx0XHRcdHF1YWxpdHk6IHRoaXMuX3F1YWxpdHksXG5cdFx0XHRjb21taXQ6IHRoaXMuX2NvbW1pdCxcblx0XHRcdG9zOiB0YXJnZXRPcyxcblx0XHRcdGFyY2g6IHRhcmdldEFyY2gsXG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiBjb25maWcucmVtb3RlQWdlbnRIb3N0Q29tbWFuZCxcblx0XHR9KTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTcGF3bmluZyBhZ2VudCBob3N0IGluIFdTTCBkaXN0cm8gJyR7ZGlzdHJvfSdgKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IGJvb3RzdHJhcCBzY3JpcHQ6ICR7c2NyaXB0fWApO1xuXG5cdFx0Ly8gYC1lIGJhc2ggLWxjIDxzY3JpcHQ+YCBydW5zIGEgbG9naW4gc2hlbGwgc28gdGhlIHVzZXIncyBQQVRIL3Byb2ZpbGVcblx0XHQvLyBpcyBzb3VyY2VkIGJlZm9yZSB0aGUgQ0xJIGxhdW5jaGVzLiBXZSBkZWxpYmVyYXRlbHkgZG8gTk9UIHNldFxuXHRcdC8vIGBXU0xfVVRGOGAgZm9yIHRoaXMgc3Bhd246IGl0IHdvdWxkIGZvcmNlIGB3c2wuZXhlYCB0byByZWNvZGUgdGhlXG5cdFx0Ly8gYWdlbnQgaG9zdCdzIHN0ZG91dC9zdGRlcnIsIHdoaWNoIGlzIGFscmVhZHkgdmFsaWQgVVRGLTggZnJvbSBhXG5cdFx0Ly8gTGludXggcHJvY2Vzcy4gS2VlcGluZyB0aGUgYnl0ZXMgdW50b3VjaGVkIGFsc28gYXZvaWRzIHN1cnByaXNpbmdcblx0XHQvLyB0aGUgVVJML1BJRCByZWdleC5cblx0XHRjb25zdCBjaGlsZCA9IGNwLnNwYXduKGdldFdzbEV4ZVBhdGgoKSwgWyctZCcsIGRpc3RybywgJy1lJywgJ2Jhc2gnLCAnLWxjJywgc2NyaXB0XSwge1xuXHRcdFx0d2luZG93c0hpZGU6IHRydWUsXG5cdFx0XHRzdGRpbzogWydpZ25vcmUnLCAncGlwZScsICdwaXBlJ10sXG5cdFx0fSk7XG5cblx0XHRsZXQgdXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHVybFJlc29sdmU6ICgodmFsdWU6IHsgdXJsOiBzdHJpbmc7IHRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQgfSkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHVybFJlamVjdDogKChlcnI6IEVycm9yKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB1cmxQcm9taXNlID0gbmV3IFByb21pc2U8eyB1cmw6IHN0cmluZzsgdG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCB9PigocmVzLCByZWopID0+IHtcblx0XHRcdHVybFJlc29sdmUgPSByZXM7XG5cdFx0XHR1cmxSZWplY3QgPSByZWo7XG5cdFx0fSk7XG5cblx0XHQvLyBCdWZmZXIgaG9sZHMgYWxyZWFkeS1yZWRhY3RlZCBsaW5lczogY29ubmVjdGlvbiB0b2tlbnMgbmV2ZXIgc2l0XG5cdFx0Ly8gaW4gc2hhcmVkLXByb2Nlc3MgbWVtb3J5IHVucmVkYWN0ZWQsIGV2ZW4gb24gdGhlIGRpYWdub3N0aWMgcGF0aC5cblx0XHRjb25zdCBvdXRwdXRMaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhcHBlbmRMaW5lID0gKGxpbmU6IHN0cmluZykgPT4ge1xuXHRcdFx0b3V0cHV0TGluZXMucHVzaChyZWRhY3RUb2tlbihsaW5lKSk7XG5cdFx0XHRpZiAob3V0cHV0TGluZXMubGVuZ3RoID4gT1VUUFVUX0JVRkZFUl9MSU5FUykge1xuXHRcdFx0XHRvdXRwdXRMaW5lcy5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBvblN0cmVhbURhdGEgPSAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHQvLyBgZGVjb2RlV3NsT3V0cHV0YCBoYW5kbGVzIGJvdGggVVRGLTggKHRoZSBhZ2VudCBob3N0J3Mgb3duXG5cdFx0XHQvLyBzdGRvdXQgd2hlbiBydW5uaW5nIHdpdGggYFdTTF9VVEY4YCB1bnNldCwgd2hpY2ggaXMgd2hhdCB3ZVxuXHRcdFx0Ly8gc3Bhd24gd2l0aCkgYW5kIFVURi0xNkxFICh3aGljaCBpcyBob3cgYHdzbC5leGVgJ3Mgb3duIGVycm9yXG5cdFx0XHQvLyBtZXNzYWdlcyBcdTIwMTQgXCJUaGVyZSBpcyBubyBkaXN0cmlidXRpb24gd2l0aCB0aGUgc3VwcGxpZWQgbmFtZVwiXG5cdFx0XHQvLyBldGMuIFx1MjAxNCBhcnJpdmUgb24gc3RkZXJyIHdpdGhvdXQgYFdTTF9VVEY4PTFgKS5cblx0XHRcdGNvbnN0IGNsZWFuVGV4dCA9IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhkZWNvZGVXc2xPdXRwdXQoZGF0YSkpO1xuXHRcdFx0Zm9yIChjb25zdCByYXdMaW5lIG9mIGNsZWFuVGV4dC5zcGxpdCgvXFxyXFxufFxccnxcXG4vKSkge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gcmF3TGluZS50cmltRW5kKCk7XG5cdFx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFwcGVuZExpbmUobGluZSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gWyR7ZGlzdHJvfV0gJHtyZWRhY3RUb2tlbihsaW5lKX1gKTtcblx0XHRcdFx0aWYgKCF1cmwpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IGV4dHJhY3RBZ2VudEhvc3RXZWJTb2NrZXRVUkwobGluZSk7XG5cdFx0XHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdFx0XHR1cmwgPSBtYXRjaC51cmw7XG5cdFx0XHRcdFx0XHR1cmxSZXNvbHZlPy4oeyB1cmw6IG1hdGNoLnVybCwgdG9rZW46IG1hdGNoLnRva2VuIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjaGlsZC5zdGRvdXQ/Lm9uKCdkYXRhJywgb25TdHJlYW1EYXRhKTtcblx0XHRjaGlsZC5zdGRlcnI/Lm9uKCdkYXRhJywgb25TdHJlYW1EYXRhKTtcblxuXHRcdGNvbnN0IGNoaWxkRXhpdGVkID0gbmV3IFByb21pc2U8eyBjb2RlOiBudW1iZXIgfCBudWxsOyBzaWduYWw6IE5vZGVKUy5TaWduYWxzIHwgbnVsbCB9PigocmVzKSA9PiB7XG5cdFx0XHRjaGlsZC5vbmNlKCdleGl0JywgKGNvZGUsIHNpZ25hbCkgPT4gcmVzKHsgY29kZSwgc2lnbmFsIH0pKTtcblx0XHR9KTtcblxuXHRcdC8vIFJhY2UgdGhlIFVSTCBwYXJzZSBhZ2FpbnN0IHRoZSBjaGlsZCBkeWluZyBhbmQgdGhlIGdsb2JhbCB0aW1lb3V0LlxuXHRcdC8vIGBvdXRwdXRMaW5lc2AgaXMgYWxyZWFkeSByZWRhY3RlZCBpbiBgYXBwZW5kTGluZWAgXHUyMDE0IG5vIGV4dHJhIHdyYXAgbmVlZGVkLlxuXHRcdGNvbnN0IHJlYWR5VGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dXJsUmVqZWN0Py4obmV3IEVycm9yKGAke0xPR19QUkVGSVh9IFRpbWVkIG91dCB3YWl0aW5nIGZvciBhZ2VudCBob3N0IGluICcke2Rpc3Ryb30nIHRvIHByaW50IGl0cyBXZWJTb2NrZXQgVVJMIGFmdGVyICR7QUdFTlRfSE9TVF9SRUFEWV9USU1FT1VUX01TfW1zLlxcbk91dHB1dDogJHtvdXRwdXRMaW5lcy5qb2luKCdcXG4nKX1gKSk7XG5cdFx0fSwgQUdFTlRfSE9TVF9SRUFEWV9USU1FT1VUX01TKTtcblxuXHRcdGNvbnN0IGVhcmx5RXhpdEd1YXJkID0gY2hpbGRFeGl0ZWQudGhlbigoeyBjb2RlLCBzaWduYWwgfSkgPT4ge1xuXHRcdFx0aWYgKCF1cmwpIHtcblx0XHRcdFx0dXJsUmVqZWN0Py4obmV3IEVycm9yKGAke0xPR19QUkVGSVh9IEFnZW50IGhvc3QgaW4gJyR7ZGlzdHJvfScgZXhpdGVkIChjb2RlPSR7Y29kZX0sIHNpZ25hbD0ke3NpZ25hbH0pIGJlZm9yZSBwcmludGluZyBpdHMgV2ViU29ja2V0IFVSTC5cXG5PdXRwdXQ6ICR7b3V0cHV0TGluZXMuam9pbignXFxuJyl9YCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHJlc29sdmVkVXJsOiB7IHVybDogc3RyaW5nOyB0b2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0dHJ5IHtcblx0XHRcdHJlc29sdmVkVXJsID0gYXdhaXQgdXJsUHJvbWlzZTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNsZWFyVGltZW91dChyZWFkeVRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0dGhpcy5fa2lsbENoaWxkKGNoaWxkKTtcblx0XHRcdGF3YWl0IGVhcmx5RXhpdEd1YXJkLmNhdGNoKCgpID0+IHsgLyogYWxyZWFkeSBzdXJmYWNlZCAqLyB9KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0Y2xlYXJUaW1lb3V0KHJlYWR5VGltZW91dEhhbmRsZSk7XG5cblx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnd3NsUHJvZ3Jlc3NDb25uZWN0aW5nJywgXCJDb25uZWN0aW5nIHRvIGFnZW50IGhvc3QgaW4gezB9Li4uXCIsIGRpc3RybykpO1xuXHRcdGxldCB3czogV2ViU29ja2V0O1xuXHRcdHRyeSB7XG5cdFx0XHR3cyA9IGF3YWl0IHRoaXMuX29wZW5XZWJTb2NrZXQocmVzb2x2ZWRVcmwudXJsKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2tpbGxDaGlsZChjaGlsZCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbjogSVdTTENvbm5lY3Rpb24gPSB7XG5cdFx0XHRjb25uZWN0aW9uSWQsXG5cdFx0XHRkaXN0cm8sXG5cdFx0XHRuYW1lOiBjb25maWcubmFtZSxcblx0XHRcdGFkZHJlc3M6IGNvbm5lY3Rpb25LZXksXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46IHJlc29sdmVkVXJsLnRva2VuLFxuXHRcdFx0Y2hpbGQsXG5cdFx0XHR3cyxcblx0XHR9O1xuXG5cdFx0d3Mub24oJ21lc3NhZ2UnLCBkYXRhID0+IHtcblx0XHRcdGxldCB0ZXh0OiBzdHJpbmc7XG5cdFx0XHRpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRleHQgPSBkYXRhO1xuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0XHRcdHRleHQgPSBCdWZmZXIuY29uY2F0KGRhdGEpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHR9IGVsc2UgaWYgKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuXHRcdFx0XHR0ZXh0ID0gQnVmZmVyLmZyb20obmV3IFVpbnQ4QXJyYXkoZGF0YSkpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZXh0ID0gKGRhdGEgYXMgQnVmZmVyKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZmlyZSh7IGNvbm5lY3Rpb25JZCwgZGF0YTogdGV4dCB9KTtcblx0XHR9KTtcblxuXHRcdHdzLm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdHRoaXMuX2Nsb3NlQ29ubmVjdGlvbihjb25uZWN0aW9uSWQpO1xuXHRcdH0pO1xuXG5cdFx0d3Mub24oJ2Vycm9yJywgKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IFdlYlNvY2tldCBlcnJvciBmb3IgJHtjb25uZWN0aW9uS2V5fTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jb25uZWN0aW9ucy5zZXQoY29ubmVjdGlvbklkLCBjb25uZWN0aW9uKTtcblx0XHR0aGlzLl9kaXN0cm9Ub0Nvbm5lY3Rpb25JZC5zZXQoZGlzdHJvLCBjb25uZWN0aW9uSWQpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29ubmVjdGlvbklkLFxuXHRcdFx0YWRkcmVzczogY29ubmVjdGlvbktleSxcblx0XHRcdGRpc3Rybyxcblx0XHRcdG5hbWU6IGNvbmZpZy5uYW1lLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiByZXNvbHZlZFVybC50b2tlbixcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZGlzY29ubmVjdChkaXN0cm86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5fZGlzdHJvVG9Db25uZWN0aW9uSWQuZ2V0KGRpc3Rybyk7XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHR0aGlzLl9jbG9zZUNvbm5lY3Rpb24oaWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlY29ubmVjdChkaXN0cm86IHN0cmluZywgbmFtZTogc3RyaW5nLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kPzogc3RyaW5nKTogUHJvbWlzZTxJV1NMQ29ubmVjdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nSWQgPSB0aGlzLl9kaXN0cm9Ub0Nvbm5lY3Rpb25JZC5nZXQoZGlzdHJvKTtcblx0XHRpZiAoZXhpc3RpbmdJZCkge1xuXHRcdFx0dGhpcy5fY2xvc2VDb25uZWN0aW9uKGV4aXN0aW5nSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb25uZWN0KHsgZGlzdHJvLCBuYW1lLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kIH0pO1xuXHR9XG5cblx0YXN5bmMgcmVsYXlTZW5kKGNvbm5lY3Rpb25JZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25JZCk7XG5cdFx0aWYgKCFjb25uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGAke0xPR19QUkVGSVh9IHJlbGF5U2VuZDogbm8gY29ubmVjdGlvbiAke2Nvbm5lY3Rpb25JZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbm4ud3Muc2VuZChtZXNzYWdlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSByZWxheVNlbmQgZmFpbGVkIGZvciAke2Nvbm5lY3Rpb25JZH1gLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Nsb3NlQ29ubmVjdGlvbihjb25uZWN0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRpZiAoIWNvbm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29ubmVjdGlvbnMuZGVsZXRlKGNvbm5lY3Rpb25JZCk7XG5cdFx0aWYgKHRoaXMuX2Rpc3Ryb1RvQ29ubmVjdGlvbklkLmdldChjb25uLmRpc3RybykgPT09IGNvbm5lY3Rpb25JZCkge1xuXHRcdFx0dGhpcy5fZGlzdHJvVG9Db25uZWN0aW9uSWQuZGVsZXRlKGNvbm4uZGlzdHJvKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbm4ud3MuY2xvc2UoKTtcblx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHR0aGlzLl9raWxsQ2hpbGQoY29ubi5jaGlsZCk7XG5cdFx0dGhpcy5fb25EaWRSZWxheUNsb3NlLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHR0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9raWxsQ2hpbGQoY2hpbGQ6IGNwLkNoaWxkUHJvY2Vzcyk6IHZvaWQge1xuXHRcdGlmIChjaGlsZC5leGl0Q29kZSAhPT0gbnVsbCB8fCBjaGlsZC5zaWduYWxDb2RlICE9PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjaGlsZC5raWxsKCk7XG5cdFx0fSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0Ly8gRXNjYWxhdGUgdG8gU0lHS0lMTCBpZiB0aGUgcHJvY2VzcyBpcyBzdGlsbCBhbGl2ZSBhZnRlciAycy4gVGhlXG5cdFx0Ly8gYHVucmVmYCBjYXN0IGF2b2lkcyB0aGUgZG9tL25vZGUgYHNldFRpbWVvdXRgIHR5cGluZyBjb2xsaXNpb24gaW5cblx0XHQvLyBzdHJpY3QgbW9kZSBcdTIwMTQgd2Ugb25seSBjYXJlIHRoYXQgZXNjYWxhdGlvbiBuZXZlciBibG9ja3MgcHJvY2VzcyBleGl0LlxuXHRcdGNvbnN0IGVzY2FsYXRlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoY2hpbGQuZXhpdENvZGUgPT09IG51bGwgJiYgY2hpbGQuc2lnbmFsQ29kZSA9PT0gbnVsbCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNoaWxkLmtpbGwoJ1NJR0tJTEwnKTtcblx0XHRcdFx0fSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0fSwgMl8wMDApIGFzIHVua25vd24gYXMgTm9kZUpTLlRpbWVvdXQ7XG5cdFx0ZXNjYWxhdGUudW5yZWYoKTtcblx0XHRjaGlsZC5vbmNlKCdleGl0JywgKCkgPT4gY2xlYXJUaW1lb3V0KGVzY2FsYXRlKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUGxhdGZvcm0oZGlzdHJvOiBzdHJpbmcpOiBQcm9taXNlPHsgb3M6IHN0cmluZzsgYXJjaDogc3RyaW5nIH0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Xc2xDb21tYW5kKFsnLWUnLCAndW5hbWUnLCAnLXMnLCAnLW0nXSwgeyBkaXN0cm8sIHRpbWVvdXQ6IDEwXzAwMCB9KTtcblx0XHRpZiAocmVzdWx0LmV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGRldGVjdCBwbGF0Zm9ybSBpbiAnJHtkaXN0cm99JyAoZXhpdCAke3Jlc3VsdC5leGl0Q29kZX0pOiAke3Jlc3VsdC5zdGRlcnIudHJpbSgpIHx8IHJlc3VsdC5zdGRvdXQudHJpbSgpfWApO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbnMgPSByZXN1bHQuc3Rkb3V0LnRyaW0oKS5zcGxpdCgvXFxzKy8pO1xuXHRcdGlmICh0b2tlbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke0xPR19QUkVGSVh9IFVuZXhwZWN0ZWQgdW5hbWUgb3V0cHV0IGZyb20gJyR7ZGlzdHJvfSc6ICR7SlNPTi5zdHJpbmdpZnkocmVzdWx0LnN0ZG91dCl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVJlbW90ZVBsYXRmb3JtKHRva2Vuc1swXSwgdG9rZW5zLnNsaWNlKDEpLmpvaW4oJyAnKSk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd3c2xVbnN1cHBvcnRlZFBsYXRmb3JtJywgXCJVbnN1cHBvcnRlZCBXU0wgZGlzdHJvIHBsYXRmb3JtOiB7MH1cIiwgcmVzdWx0LnN0ZG91dC50cmltKCkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc29sdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlbldlYlNvY2tldCh1cmw6IHN0cmluZyk6IFByb21pc2U8V2ViU29ja2V0PiB7XG5cdFx0Y29uc3QgbmF0aXZlUmVxdWlyZSA9IGF3YWl0IHRoaXMuX2dldE5hdGl2ZVJlcXVpcmUoKTtcblx0XHRjb25zdCBXUyA9IG5hdGl2ZVJlcXVpcmUoJ3dzJykgYXMgdHlwZW9mIFdlYlNvY2tldDtcblx0XHRjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyBXRUJTT0NLRVRfT1BFTl9USU1FT1VUX01TO1xuXHRcdGxldCBsYXN0RXJyb3I6IHVua25vd247XG5cdFx0Ly8gT24gdGhlIGZpcnN0IGNvbm5lY3QgdG8gYSBmcmVzaGx5LWJvb3RlZCBkaXN0cm8sIHRoZSBhZ2VudCBob3N0XG5cdFx0Ly8gcHJpbnRzIGl0cyBgd3M6Ly8xMjcuMC4wLjE6UE9SVGAgVVJMIHRoZSBtb21lbnQgaXQgYmluZHMgaW5zaWRlXG5cdFx0Ly8gV1NMIFx1MjAxNCBidXQgdGhlIFdpbmRvd3Mtc2lkZSBsb2NhbGhvc3QgZm9yd2FyZCAod3NscmVsYXkpIG5lZWRzIGFcblx0XHQvLyBicmllZiBtb21lbnQgbW9yZSB0byBzZXQgdXAgdGhlIHBvcnQgZm9yd2FyZGluZy4gV2Ugc2VlIHRoaXMgYXNcblx0XHQvLyBhbiBpbW1lZGlhdGUgRUNPTk5SRUZVU0VEICh3cmFwcGVkIGluIGFuIEFnZ3JlZ2F0ZUVycm9yIGJlY2F1c2Vcblx0XHQvLyBOb2RlIHRyaWVzIElQdjQgYW5kIElQdjYgaW4gcGFyYWxsZWwpLiBSZXRyeSB1bnRpbCB0aGUgb3ZlcmFsbFxuXHRcdC8vIGRlYWRsaW5lIGVsYXBzZXM7IG9uY2UgdGhlIGZvcndhcmQgaXMgdXAgdGhlIGZpcnN0IHN1Y2Nlc3NmdWxcblx0XHQvLyBgb3BlbmAgcmV0dXJucyBpbW1lZGlhdGVseS5cblx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMDsgOyBhdHRlbXB0KyspIHtcblx0XHRcdGNvbnN0IHJlbWFpbmluZyA9IGRlYWRsaW5lIC0gRGF0ZS5ub3coKTtcblx0XHRcdGlmIChyZW1haW5pbmcgPD0gMCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gVGltZWQgb3V0IG9wZW5pbmcgV2ViU29ja2V0IHRvICR7cmVkYWN0VG9rZW4odXJsKX0gYWZ0ZXIgJHtXRUJTT0NLRVRfT1BFTl9USU1FT1VUX01TfW1zJHtsYXN0RXJyb3IgPyBgOiAke2xhc3RFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gbGFzdEVycm9yLm1lc3NhZ2UgOiBTdHJpbmcobGFzdEVycm9yKX1gIDogJyd9YCk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fdHJ5T3BlbldlYlNvY2tldChuZXcgV1ModXJsKSwgdXJsLCByZW1haW5pbmcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxhc3RFcnJvciA9IGVycjtcblx0XHRcdFx0aWYgKCFpc0Nvbm5lY3Rpb25SZWZ1c2VkKGVycikpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTGluZWFyIGJhY2tvZmYgY2FwcGVkIGF0IDUwMG1zOyB0aGUgZm9yd2FyZCB1c3VhbGx5IGNvbWVzXG5cdFx0XHRcdC8vIHVwIHdpdGhpbiBhIGZldyBodW5kcmVkIG1zIGFmdGVyIHRoZSBVUkwgaXMgcHJpbnRlZC5cblx0XHRcdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbigxMDAgKyBhdHRlbXB0ICogMTAwLCA1MDApO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXMgPT4gc2V0VGltZW91dChyZXMsIGRlbGF5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdHJ5T3BlbldlYlNvY2tldCh3czogV2ViU29ja2V0LCB1cmw6IHN0cmluZywgdGltZW91dE1zOiBudW1iZXIpOiBQcm9taXNlPFdlYlNvY2tldD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxXZWJTb2NrZXQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR3cy5jbG9zZSgpO1xuXHRcdFx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBUaW1lZCBvdXQgb3BlbmluZyBXZWJTb2NrZXQgdG8gJHtyZWRhY3RUb2tlbih1cmwpfSBhZnRlciAke3RpbWVvdXRNc31tc2ApKTtcblx0XHRcdH0sIHRpbWVvdXRNcyk7XG5cdFx0XHR3cy5vbmNlKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG5cdFx0XHRcdHJlc29sdmUod3MpO1xuXHRcdFx0fSk7XG5cdFx0XHR3cy5vbmNlKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR3cy5jbG9zZSgpO1xuXHRcdFx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFRydWUgZm9yIHRoZSBgRUNPTk5SRUZVU0VEYCBzaGFwZXMgTm9kZSBzdXJmYWNlcyBmb3IgYHdzOi8vMTI3LjAuMC4xOlBPUlRgXG4gKiBiZWZvcmUgV1NMJ3MgbG9jYWxob3N0LWZvcndhcmRpbmcgcmVsYXkgaGFzIHdpcmVkIHVwIHRoZSBmb3J3YXJkLiBOb2RlIDE4K1xuICogd3JhcHMgdGhlIHBhcmFsbGVsIElQdjQvSVB2NiBhdHRlbXB0cyBpbiBhbiBgQWdncmVnYXRlRXJyb3JgLCBzbyB3ZSBoYXZlXG4gKiB0byBpbnNwZWN0IHRoZSBpbm5lciBlcnJvcnMgdG9vLlxuICovXG5mdW5jdGlvbiBpc0Nvbm5lY3Rpb25SZWZ1c2VkKGVycjogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRpZiAoIWVyciB8fCB0eXBlb2YgZXJyICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBjb2RlID0gKGVyciBhcyB7IGNvZGU/OiBzdHJpbmcgfSkuY29kZTtcblx0aWYgKGNvZGUgPT09ICdFQ09OTlJFRlVTRUQnIHx8IGNvZGUgPT09ICdFTk9URk9VTkQnIHx8IGNvZGUgPT09ICdFQUREUk5PVEFWQUlMJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IGVycm9ycyA9IChlcnIgYXMgeyBlcnJvcnM/OiB1bmtub3duW10gfSkuZXJyb3JzO1xuXHRpZiAoQXJyYXkuaXNBcnJheShlcnJvcnMpKSB7XG5cdFx0cmV0dXJuIGVycm9ycy5zb21lKGlzQ29ubmVjdGlvblJlZnVzZWQpO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQVNoQyxTQUFTLGFBQWEsNkJBQTZCO0FBQ25EO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtB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
