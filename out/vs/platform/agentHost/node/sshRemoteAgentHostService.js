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
import { promises as fsp } from "fs";
import * as os from "os";
import * as cp from "child_process";
import { dirname, join, isAbsolute, basename } from "../../../base/common/path.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { raceTimeout } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import {
  SSHAuthMethod,
  computeSSHConnectionKey,
  SSHHostKeyDeniedError
} from "../common/sshRemoteAgentHost.js";
import {
  computeHostKeyFingerprint,
  matchKnownHosts,
  parseKnownHosts,
  readHostKeyType
} from "./sshKnownHosts.js";
import {
  isSameAgentHostEndpointIdentity
} from "../common/agentHostEndpointRegistry.js";
import {
  buildAgentHostBaseCommand,
  buildAgentHostSpawnCommand,
  buildAgentRelayCommand,
  buildCLIDownloadUrl,
  buildCleanupOldCLIsCommand,
  buildFindFallbackCLICommand,
  extractAgentHostWebSocketURL,
  filterLiveAgentHostEndpoints,
  getRemoteCLIBin,
  getRemoteCLIDataDir,
  getRemoteCLIInstallRoot,
  isValidFallbackCLIPath,
  redactToken,
  resolveRemotePlatform,
  runAgentEndpoints,
  shellEscape,
  waitForNewStandaloneEndpoint
} from "./sshRemoteAgentHostHelpers.js";
import { parseSSHConfigHostEntries, parseSSHGOutput, stripSSHComment } from "../common/sshConfigParsing.js";
import { removeAnsiEscapeCodes } from "../../../base/common/strings.js";
const LOG_PREFIX = "[SSHRemoteAgentHost]";
const RECONNECT_RELAY_TIMEOUT_MS = 6e4;
const HANDSHAKE_TIMEOUT_MS = 3e4;
const INTERACTIVE_TIMEOUT_MS = 3e5;
function describeAuthAttempt(attempt) {
  switch (attempt.type) {
    case "publickey":
      return `publickey ${attempt.keyPath}`;
    case "agent":
      return "agent";
    case "password":
      return "password";
    case "keyboard-interactive":
      return "keyboard-interactive";
  }
}
function toAuthMethod(attempt, kbiHandler, keyPassphraseHandler, callback) {
  switch (attempt.type) {
    case "publickey": {
      const { keyPath: _kp, encrypted: _encrypted, ...payload } = attempt;
      if (attempt.encrypted) {
        if (!keyPassphraseHandler) {
          return void 0;
        }
        keyPassphraseHandler(attempt.keyPath, (passphrase) => {
          if (passphrase === void 0) {
            callback(false);
            return;
          }
          callback({ ...payload, passphrase });
        });
        return void 0;
      }
      return payload;
    }
    case "agent":
    case "password":
      return attempt;
    case "keyboard-interactive": {
      if (!kbiHandler) {
        return void 0;
      }
      return {
        type: "keyboard-interactive",
        username: attempt.username,
        prompt: (name, instructions, _lang, prompts, finish) => {
          const normalized = prompts.map((p) => ({ prompt: p.prompt, echo: p.echo ?? true }));
          kbiHandler(name, instructions, normalized, (responses) => finish([...responses]));
        }
      };
    }
  }
}
function isMethodAllowedByServer(attempt, methodsLeft) {
  if (!methodsLeft) {
    return true;
  }
  const protocolMethod = attempt.type === "agent" ? "publickey" : attempt.type;
  return methodsLeft.includes(protocolMethod);
}
function makeAuthHandler(attempts, logService, kbiHandler, keyPassphraseHandler) {
  let index = 0;
  return (methodsLeft, _partialSuccess, callback) => {
    while (index < attempts.length) {
      const attempt = attempts[index++];
      if (!isMethodAllowedByServer(attempt, methodsLeft)) {
        logService.info(`${LOG_PREFIX} Skipping ${describeAuthAttempt(attempt)} \u2014 server only allows ${methodsLeft.join(", ")}`);
        continue;
      }
      const method = toAuthMethod(attempt, kbiHandler, keyPassphraseHandler, callback);
      if (!method) {
        if (attempt.type === "publickey" && attempt.encrypted && keyPassphraseHandler) {
          logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
          return;
        }
        logService.warn(`${LOG_PREFIX} ${describeAuthAttempt(attempt)} skipped: no prompt handler available`);
        continue;
      }
      logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
      callback(method);
      return;
    }
    logService.info(`${LOG_PREFIX} No more auth methods to try; giving up`);
    callback(false);
  };
}
function readSSHString(buffer, offset) {
  if (offset + 4 > buffer.length) {
    return void 0;
  }
  const length = buffer.readUInt32BE(offset);
  const valueOffset = offset + 4;
  const nextOffset = valueOffset + length;
  if (nextOffset > buffer.length) {
    return void 0;
  }
  return { value: buffer.toString("utf8", valueOffset, nextOffset), offset: nextOffset };
}
function isEncryptedPrivateKey(key) {
  const text = key.toString("utf8");
  if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) || /Proc-Type:\s*4,ENCRYPTED/i.test(text)) {
    return true;
  }
  const openSSHKey = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END OPENSSH PRIVATE KEY-----/.exec(text);
  if (!openSSHKey) {
    return false;
  }
  const data = Buffer.from(openSSHKey[1].replace(/\s+/g, ""), "base64");
  const magic = Buffer.from("openssh-key-v1\0", "utf8");
  if (data.length < magic.length || !data.subarray(0, magic.length).equals(magic)) {
    return false;
  }
  const cipher = readSSHString(data, magic.length);
  return !!cipher && cipher.value !== "none";
}
function sshExec(client, command, opts) {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (error, code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        if (code !== 0 && !opts?.ignoreExitCode) {
          reject(new Error(`SSH command failed (exit ${code}): ${command}
stderr: ${stderr}`));
        } else {
          resolve({ stdout, stderr, code: code ?? 0 });
        }
      };
      stream.on("data", (data) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      stream.on("error", (streamErr) => finish(streamErr, void 0));
      stream.on("close", (code) => finish(void 0, code));
    });
  });
}
function bindSshExec(client) {
  return (command, opts) => sshExec(client, command, opts);
}
function startRemoteAgentHost(client, logService, cliBin, cliDataDir, commandOverride) {
  return new Promise((resolve, reject) => {
    if (!commandOverride && (!cliBin || !cliDataDir)) {
      reject(new Error(`${LOG_PREFIX} startRemoteAgentHost requires either a cliBin+cliDataDir pair or a commandOverride`));
      return;
    }
    const baseCmd = commandOverride ?? buildAgentHostBaseCommand(cliBin, cliDataDir);
    const cmd = `bash -l -c ${shellEscape(`echo VSCODE_PID=$$ && exec ${baseCmd}`)}`;
    logService.info(`${LOG_PREFIX} Starting remote agent host: ${cmd}`);
    client.exec(cmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let resolved = false;
      let outputBuf = "";
      let pid;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.
output so far: ${redactToken(outputBuf)}`));
        }
      }, 6e4);
      const checkForOutput = () => {
        const clean = removeAnsiEscapeCodes(outputBuf);
        if (pid === void 0) {
          const pidMatch = clean.match(/VSCODE_PID=(\d+)/);
          if (pidMatch) {
            pid = parseInt(pidMatch[1], 10);
            logService.info(`${LOG_PREFIX} Remote agent host PID: ${pid}`);
          }
        }
        if (!resolved) {
          const match = extractAgentHostWebSocketURL(clean);
          if (match) {
            resolved = true;
            clearTimeout(timeout);
            logService.info(`${LOG_PREFIX} Remote agent host listening on port ${match.port}`);
            resolve({ port: match.port, connectionToken: match.token, pid, stream });
          }
        }
      };
      stream.stderr.on("data", (data) => {
        const text = data.toString();
        outputBuf += text;
        logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);
        checkForOutput();
      });
      stream.on("data", (data) => {
        const text = data.toString();
        outputBuf += text;
        logService.trace(`${LOG_PREFIX} remote stdout: ${redactToken(text.trimEnd())}`);
        checkForOutput();
      });
      stream.on("error", (streamErr) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(streamErr);
        }
      });
      stream.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`${LOG_PREFIX} Agent host process exited with code ${code} before becoming ready.
output: ${redactToken(outputBuf)}`));
        }
      });
    });
  });
}
function openForwardOutChannel(client, dstHost, dstPort) {
  return new Promise((resolve, reject) => {
    client.forwardOut("127.0.0.1", 0, dstHost, dstPort, (err, channel) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(channel);
    });
  });
}
function openRelayExecChannel(client, command, logService) {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      stream.stderr.on("data", (data) => {
        logService.trace(`${LOG_PREFIX} agent relay stderr: ${redactToken(data.toString().trimEnd())}`);
      });
      resolve(stream);
    });
  });
}
function createWebSocketOverChannel(nativeRequire, channel, urlHost, urlPort, connectionToken, logService, onMessage, onClose) {
  return new Promise((resolve, reject) => {
    const WS = nativeRequire("ws");
    let url = `ws://${urlHost}:${urlPort}`;
    if (connectionToken) {
      url += `?tkn=${encodeURIComponent(connectionToken)}`;
    }
    const ws = new WS(url, { createConnection: (() => channel) });
    ws.on("open", () => {
      logService.info(`${LOG_PREFIX} WebSocket relay connected to remote agent host`);
      resolve({
        send: (data) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(data);
          }
        },
        close: () => ws.close()
      });
    });
    ws.on("message", (data) => {
      if (Array.isArray(data)) {
        onMessage(Buffer.concat(data).toString());
      } else if (data instanceof ArrayBuffer) {
        onMessage(Buffer.from(new Uint8Array(data)).toString());
      } else {
        onMessage(data.toString());
      }
    });
    ws.on("close", onClose);
    ws.on("error", (wsErr) => {
      logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
      reject(wsErr);
    });
  });
}
async function createWebSocketRelayForEndpoint(nativeRequire, client, endpoint, relayCliBin, relayCliDataDir, relayInstanceId, relayUserDataPath, connectionToken, logService, onMessage, onClose) {
  let channel;
  let urlHost;
  let urlPort;
  if (endpoint.type === "tcp") {
    channel = await openForwardOutChannel(client, endpoint.host, endpoint.port);
    urlHost = endpoint.host;
    urlPort = endpoint.port;
  } else {
    const command = buildAgentRelayCommand(relayCliBin, relayCliDataDir, relayInstanceId, relayUserDataPath);
    logService.info(`${LOG_PREFIX} Opening agent relay channel: ${command}`);
    channel = await openRelayExecChannel(client, command, logService);
    urlHost = "127.0.0.1";
    urlPort = 1;
  }
  return createWebSocketOverChannel(nativeRequire, channel, urlHost, urlPort, connectionToken, logService, onMessage, onClose);
}
function sanitizeConfig(config) {
  const { password: _p, privateKeyPath: _k, ...sanitized } = config;
  return sanitized;
}
class SSHConnection extends Disposable {
  constructor(fullConfig, connectionId, address, name, connectionToken, endpoint, serverType, instanceId, lifecycle, cliBin, cliDataDir, userDataPath, sshClient, _relay, _remoteStream, _logService) {
    super();
    this.connectionId = connectionId;
    this.address = address;
    this.name = name;
    this.connectionToken = connectionToken;
    this.endpoint = endpoint;
    this.serverType = serverType;
    this.instanceId = instanceId;
    this.lifecycle = lifecycle;
    this.cliBin = cliBin;
    this.cliDataDir = cliDataDir;
    this.userDataPath = userDataPath;
    this.sshClient = sshClient;
    this._relay = _relay;
    this._remoteStream = _remoteStream;
    this._logService = _logService;
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._closed = false;
    this._sshClientDetached = false;
    this._sshCloseListener = () => {
      this._logService.info(`${LOG_PREFIX} SSH client closed for connection ${this.connectionId} (address ${this.address}); disposing connection`);
      this.dispose();
    };
    this._sshErrorListener = (err) => {
      this._logService.info(`${LOG_PREFIX} SSH client error for connection ${this.connectionId} (address ${this.address}): ${err instanceof Error ? err.message : String(err)}; disposing connection`);
      this.dispose();
    };
    this.config = sanitizeConfig(fullConfig);
    this._register(toDisposable(() => {
      if (this._closed) {
        return;
      }
      this._closed = true;
      this._relay.close();
      if (!this._sshClientDetached) {
        this._remoteStream?.close();
        sshClient.end();
      }
      this._onDidClose.fire();
    }));
    this._register(this._onDidClose);
    sshClient.on("close", this._sshCloseListener);
    sshClient.on("error", this._sshErrorListener);
  }
  /**
   * Detach the SSH client from this connection so that `dispose()`
   * only closes the WebSocket relay without ending the SSH session.
   * Also removes event listeners from the SSH client so the old
   * connection object is not retained by the shared client.
   */
  detachSshClient() {
    this._sshClientDetached = true;
    this.sshClient.removeListener("close", this._sshCloseListener);
    this.sshClient.removeListener("error", this._sshErrorListener);
  }
  relaySend(data) {
    this._relay.send(data);
  }
}
let SSHRemoteAgentHostMainService = class extends Disposable {
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
    this._onDidRequestKeyboardInteractive = this._register(new Emitter());
    this.onDidRequestKeyboardInteractive = this._onDidRequestKeyboardInteractive.event;
    this._onDidCancelKeyboardInteractive = this._register(new Emitter());
    this.onDidCancelKeyboardInteractive = this._onDidCancelKeyboardInteractive.event;
    this._onDidRequestEndpointSelection = this._register(new Emitter());
    this.onDidRequestEndpointSelection = this._onDidRequestEndpointSelection.event;
    this._onDidCancelEndpointSelection = this._register(new Emitter());
    this.onDidCancelEndpointSelection = this._onDidCancelEndpointSelection.event;
    this._onDidRequestHostKeyVerification = this._register(new Emitter());
    this.onDidRequestHostKeyVerification = this._onDidRequestHostKeyVerification.event;
    this._onDidCancelHostKeyVerification = this._register(new Emitter());
    this.onDidCancelHostKeyVerification = this._onDidCancelHostKeyVerification.event;
    this._onDidAnnounceHostKeys = this._register(new Emitter());
    this.onDidAnnounceHostKeys = this._onDidAnnounceHostKeys.event;
    /**
     * Pending keyboard-interactive prompts awaiting a response from the renderer.
     * Keyed by `requestId`. Each entry can either finish the ssh2 prompt with
     * responses or cancel the owning connect attempt when the user dismisses it.
     */
    this._pendingKbiRequests = /* @__PURE__ */ new Map();
    this._kbiRequestCounter = 0;
    /**
     * Pending endpoint-selection prompts awaiting a response from the
     * renderer. Keyed by `requestId`; resolved with the user's choice, or
     * `undefined` on cancellation (rejects the owning connect attempt).
     */
    this._pendingEndpointSelections = /* @__PURE__ */ new Map();
    this._endpointSelectionCounter = 0;
    /**
     * Pending host key verifications awaiting a verdict from the renderer,
     * keyed by `requestId`. Every entry must eventually be settled — leaving
     * one unanswered suspends the SSH handshake until the deadline elapses.
     *
     * `onUserDenied` lets the owning connect attempt distinguish "the renderer
     * refused this key" from any other handshake failure, so it can surface a
     * clean error instead of ssh2's internal wording.
     */
    this._pendingHostKeyRequests = /* @__PURE__ */ new Map();
    this._hostKeyRequestCounter = 0;
    this._connections = this._register(new DisposableMap());
    /**
     * Override hook for tests to shorten the relay-creation timeout used on
     * the `replaceRelay` reconnect path. See {@link RECONNECT_RELAY_TIMEOUT_MS}.
     */
    this.relayCreationTimeoutMs = RECONNECT_RELAY_TIMEOUT_MS;
  }
  /**
   * Lazily load a `require` function for native modules (`ssh2`, `ws`).
   * Uses a dynamic `import('node:module')` so the module is only resolved
   * when actually needed at runtime — not at file-load time. This matters
   * because tests override the methods that call this and never trigger
   * the import, avoiding issues with Electron's ESM loader which cannot
   * resolve `node:` specifiers.
   */
  async _getNativeRequire() {
    if (!this._nativeRequire) {
      const nodeModule = await import("node:module");
      this._nativeRequire = nodeModule.createRequire(import.meta.url);
    }
    return this._nativeRequire;
  }
  async connect(config, replaceRelay) {
    const connectionKey = computeSSHConnectionKey(config);
    const existing = this._connections.get(connectionKey);
    if (existing) {
      if (replaceRelay) {
        this._logService.info(`${LOG_PREFIX} Reconnecting relay for existing SSH tunnel ${connectionKey}`);
        const { sshClient: sshClient2, endpoint, connectionToken, serverType, instanceId, lifecycle, cliBin, cliDataDir, userDataPath } = existing;
        this._connections.deleteAndLeak(connectionKey);
        existing.detachSshClient();
        existing.dispose();
        const connectionId = connectionKey;
        try {
          let conn;
          const timeoutMs = this.relayCreationTimeoutMs;
          const relay = await raceTimeout(
            this._createWebSocketRelay(
              sshClient2,
              endpoint,
              cliBin,
              cliDataDir,
              instanceId,
              userDataPath,
              connectionToken,
              (data) => this._onDidRelayMessage.fire({ connectionId, data }),
              () => {
                conn?.dispose();
              }
            ),
            timeoutMs
          );
          if (!relay) {
            throw new Error(`SSH relay creation timed out after ${timeoutMs}ms (SSH client appears unresponsive)`);
          }
          conn = new SSHConnection(
            config,
            connectionId,
            connectionKey,
            config.name,
            connectionToken,
            endpoint,
            serverType,
            instanceId,
            lifecycle,
            cliBin,
            cliDataDir,
            userDataPath,
            sshClient2,
            relay,
            void 0,
            this._logService
          );
          Event.once(conn.onDidClose)(() => {
            if (this._connections.get(connectionKey) === conn) {
              this._connections.deleteAndDispose(connectionKey);
              this._onDidRelayClose.fire(connectionId);
              this._onDidCloseConnection.fire(connectionId);
              this._onDidChangeConnections.fire();
            }
          });
          this._connections.set(connectionKey, conn);
          return {
            connectionId: conn.connectionId,
            address: conn.address,
            name: conn.name,
            connectionToken: conn.connectionToken,
            config: conn.config,
            sshConfigHost: config.sshConfigHost,
            serverType: conn.serverType,
            instanceId: conn.instanceId,
            primary: true,
            lifecycle: conn.lifecycle
          };
        } catch (err) {
          sshClient2.end();
          this._onDidRelayClose.fire(connectionId);
          this._onDidCloseConnection.fire(connectionId);
          this._onDidChangeConnections.fire();
          throw err;
        }
      }
      return {
        connectionId: existing.connectionId,
        address: existing.address,
        name: existing.name,
        connectionToken: existing.connectionToken,
        config: existing.config,
        sshConfigHost: config.sshConfigHost,
        serverType: existing.serverType,
        instanceId: existing.instanceId,
        primary: true,
        lifecycle: existing.lifecycle
      };
    }
    this._logService.info(`${LOG_PREFIX} ${replaceRelay ? "Reconnecting" : "Connecting"} to ${connectionKey}`);
    const displayHost = config.sshConfigHost ?? `${config.username}@${config.host}`;
    let sshClient;
    try {
      const reportProgress = (message) => {
        this._onDidReportConnectProgress.fire({ connectionKey, message });
      };
      reportProgress(localize("sshProgressConnecting", "Establishing SSH connection..."));
      sshClient = await this._connectSSH(config, connectionKey);
      let endpoint;
      let connectionToken;
      let serverType;
      let instanceId;
      let lifecycle;
      let cliBin = "";
      let cliDataDir = "";
      let userDataPath = "";
      let agentStream;
      if (config.remoteAgentHostCommand) {
        this._logService.info(`${LOG_PREFIX} Using custom agent host command: ${config.remoteAgentHostCommand}; skipping endpoint discovery/selection`);
        reportProgress(localize("sshProgressStartingAgent", "Starting remote agent host..."));
        const result = await this._startRemoteAgentHost(sshClient, void 0, void 0, config.remoteAgentHostCommand);
        endpoint = { type: "tcp", host: "127.0.0.1", port: result.port };
        connectionToken = result.connectionToken;
        agentStream = result.stream;
        serverType = void 0;
        instanceId = "override";
        lifecycle = "managed";
      } else {
        const { stdout: unameS } = await sshExec(sshClient, "uname -s");
        const { stdout: unameM } = await sshExec(sshClient, "uname -m");
        const platform = resolveRemotePlatform(unameS, unameM);
        if (!platform) {
          throw new Error(`${LOG_PREFIX} Unsupported remote platform: ${unameS.trim()} ${unameM.trim()}`);
        }
        this._logService.info(`${LOG_PREFIX} Remote platform: ${platform.os}-${platform.arch}`);
        reportProgress(localize("sshProgressInstallingCLI", "Checking remote CLI installation..."));
        cliBin = await this._ensureCLIInstalled(sshClient, platform, reportProgress);
        cliDataDir = getRemoteCLIDataDir(this._serverDataFolderName);
        reportProgress(localize("sshProgressCheckingAgent", "Checking for existing agent hosts..."));
        const exec = bindSshExec(sshClient);
        const initial = await runAgentEndpoints(exec, cliBin, cliDataDir);
        userDataPath = initial.userDataPath;
        const live = await filterLiveAgentHostEndpoints(exec, initial.endpoints);
        const editors = live.filter((e) => e.type === "editor");
        const standalones = live.filter((e) => e.type === "standalone");
        const spawnDedicated = async () => {
          const spawnCommand = buildAgentHostSpawnCommand(cliBin, cliDataDir, userDataPath);
          reportProgress(localize("sshProgressStartingAgent", "Starting remote agent host..."));
          this._logService.info(`${LOG_PREFIX} Spawning dedicated standalone agent host: ${spawnCommand}`);
          exec(spawnCommand, { ignoreExitCode: true }).catch((err) => {
            this._logService.warn(`${LOG_PREFIX} Spawn command for dedicated agent host reported an error: ${err instanceof Error ? err.message : String(err)}`);
          });
          reportProgress(localize("sshProgressAwaitingAgent", "Waiting for the new agent host to register..."));
          return waitForNewStandaloneEndpoint(exec, cliBin, cliDataDir, userDataPath, live);
        };
        const selectDedicated = async () => {
          if (standalones.length === 0) {
            return { chosen: await spawnDedicated(), lifecycle: "managed" };
          }
          const [deterministic] = [...standalones].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
          return { chosen: deterministic, lifecycle: "external" };
        };
        const selectEndpoint = async () => {
          if (config.preferredAgentLocation === "editor") {
            if (editors.length > 0) {
              const [deterministic] = [...editors].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
              return { chosen: deterministic, lifecycle: "external" };
            }
            return selectDedicated();
          }
          if (config.preferredAgentLocation === "dedicated") {
            return selectDedicated();
          }
          if (config.userInitiated === false) {
            return selectDedicated();
          }
          if (editors.length === 0) {
            if (standalones.length === 0) {
              return { chosen: await spawnDedicated(), lifecycle: "managed" };
            }
            if (standalones.length === 1) {
              return { chosen: standalones[0], lifecycle: "external" };
            }
            reportProgress(localize("sshProgressAwaitingSelection", "Waiting for endpoint selection..."));
            const selection2 = await this._requestEndpointSelection(sshClient, connectionKey, displayHost, standalones);
            if (selection2.kind === "spawn") {
              return { chosen: await spawnDedicated(), lifecycle: "managed" };
            }
            const found2 = standalones.find((e) => isSameAgentHostEndpointIdentity(e, selection2));
            if (!found2) {
              throw new Error(`${LOG_PREFIX} Selected agent host endpoint is no longer available`);
            }
            return { chosen: found2, lifecycle: "external" };
          }
          reportProgress(localize("sshProgressAwaitingSelection", "Waiting for endpoint selection..."));
          const selection = await this._requestEndpointSelection(sshClient, connectionKey, displayHost, live);
          if (selection.kind === "spawn") {
            return { chosen: await spawnDedicated(), lifecycle: "managed" };
          }
          const found = live.find((e) => isSameAgentHostEndpointIdentity(e, selection));
          if (!found) {
            throw new Error(`${LOG_PREFIX} Selected agent host endpoint is no longer available`);
          }
          return { chosen: found, lifecycle: "external" };
        };
        const selected = await selectEndpoint();
        endpoint = selected.chosen.endpoint;
        connectionToken = selected.chosen.connectionToken;
        serverType = selected.chosen.type;
        instanceId = selected.chosen.instanceId;
        lifecycle = selected.lifecycle;
      }
      reportProgress(localize("sshProgressForwarding", "Connecting to remote agent host..."));
      const connectionId = connectionKey;
      let conn;
      let relay;
      try {
        relay = await this._createWebSocketRelay(
          sshClient,
          endpoint,
          cliBin,
          cliDataDir,
          instanceId,
          userDataPath,
          connectionToken,
          (data) => this._onDidRelayMessage.fire({ connectionId, data }),
          () => {
            conn?.dispose();
          }
        );
      } catch (relayErr) {
        const relayErrorMessage = relayErr instanceof Error ? relayErr.message : String(relayErr);
        this._logService.warn(`${LOG_PREFIX} Failed to connect to selected agent host endpoint: ${relayErrorMessage}`);
        if (!config.remoteAgentHostCommand && cliBin && cliDataDir) {
          try {
            await runAgentEndpoints(bindSshExec(sshClient), cliBin, cliDataDir, userDataPath);
          } catch (rereadErr) {
            this._logService.warn(`${LOG_PREFIX} Failed to reread agent host endpoints after relay failure: ${rereadErr instanceof Error ? rereadErr.message : String(rereadErr)}`);
          }
        }
        throw new Error(`${LOG_PREFIX} Failed to connect to the selected remote agent host: ${relayErrorMessage}. Please retry connecting.`);
      }
      const address = connectionKey;
      conn = new SSHConnection(
        config,
        connectionId,
        address,
        config.name,
        connectionToken,
        endpoint,
        serverType,
        instanceId,
        lifecycle,
        cliBin,
        cliDataDir,
        userDataPath,
        sshClient,
        relay,
        agentStream,
        this._logService
      );
      Event.once(conn.onDidClose)(() => {
        if (this._connections.get(connectionKey) === conn) {
          this._connections.deleteAndDispose(connectionKey);
          this._onDidRelayClose.fire(connectionId);
          this._onDidCloseConnection.fire(connectionId);
          this._onDidChangeConnections.fire();
        }
      });
      this._connections.set(connectionKey, conn);
      sshClient = void 0;
      this._onDidChangeConnections.fire();
      return {
        connectionId,
        address,
        name: config.name,
        connectionToken,
        config: conn.config,
        sshConfigHost: config.sshConfigHost,
        serverType,
        instanceId,
        primary: true,
        lifecycle
      };
    } catch (err) {
      sshClient?.end();
      if (!(err instanceof CancellationError)) {
        this._logService.error(`${LOG_PREFIX} Failed to connect to ${displayHost}`, err);
      }
      throw err;
    }
  }
  async disconnect(host) {
    for (const [key, conn] of this._connections) {
      if (key === host || conn.connectionId === host) {
        conn.dispose();
        return;
      }
    }
  }
  async relaySend(connectionId, message) {
    for (const conn of this._connections.values()) {
      if (conn.connectionId === connectionId) {
        conn.relaySend(message);
        return;
      }
    }
  }
  async reconnect(sshConfigHost, name, remoteAgentHostCommand, agentForward, userInitiated, preferredAgentLocation) {
    this._logService.info(`${LOG_PREFIX} Reconnecting via SSH config host: ${sshConfigHost} (userInitiated=${userInitiated ?? true})`);
    const resolved = await this.resolveSSHConfig(sshConfigHost);
    let privateKeyPath;
    if (resolved.identityFile.length > 0 && !SSHRemoteAgentHostMainService._isDefaultKeyPath(resolved.identityFile[0])) {
      privateKeyPath = resolved.identityFile[0];
    }
    this._logService.info(`${LOG_PREFIX} reconnect: identityFiles=${JSON.stringify(resolved.identityFile)}, explicit key=${privateKeyPath ?? "(none)"}`);
    return this.connect(
      {
        host: resolved.hostname,
        port: resolved.port !== 22 ? resolved.port : void 0,
        username: resolved.user ?? sshConfigHost,
        authMethod: SSHAuthMethod.Agent,
        privateKeyPath,
        identityAgent: resolved.identityAgent,
        name,
        sshConfigHost,
        remoteAgentHostCommand,
        agentForward: agentForward && resolved.forwardAgent ? true : void 0,
        userInitiated,
        preferredAgentLocation
      },
      /* replaceRelay */
      true
    );
  }
  async listSSHConfigHosts() {
    const configPath = join(os.homedir(), ".ssh", "config");
    try {
      const content = await fsp.readFile(configPath, "utf-8");
      return this._parseSSHConfigHosts(content, dirname(configPath));
    } catch {
      this._logService.info(`${LOG_PREFIX} Could not read SSH config at ${configPath}`);
      return [];
    }
  }
  async ensureUserSSHConfig() {
    const sshDir = join(os.homedir(), ".ssh");
    const configPath = join(sshDir, "config");
    const isPosix = process.platform !== "win32";
    try {
      await fsp.mkdir(sshDir, { recursive: true, mode: isPosix ? 448 : void 0 });
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} Failed to ensure ~/.ssh directory: ${err}`);
      throw err;
    }
    try {
      await fsp.access(configPath);
    } catch {
      try {
        const handle = await fsp.open(configPath, "a", isPosix ? 384 : void 0);
        await handle.close();
      } catch (err) {
        this._logService.warn(`${LOG_PREFIX} Failed to create ${configPath}: ${err}`);
        throw err;
      }
    }
    return URI.file(configPath);
  }
  async listSSHConfigFiles() {
    const isWindows = process.platform === "win32";
    const userConfigPath = join(os.homedir(), ".ssh", "config");
    const systemConfigPath = isWindows ? join(process.env["ProgramData"] ?? "C:\\ProgramData", "ssh", "ssh_config") : "/etc/ssh/ssh_config";
    const result = [URI.file(userConfigPath)];
    try {
      await fsp.access(systemConfigPath);
      result.push(URI.file(systemConfigPath));
    } catch {
    }
    return result;
  }
  async resolveSSHConfig(host) {
    return new Promise((resolve, reject) => {
      cp.execFile("ssh", ["-G", host], { timeout: 5e3 }, (err, stdout) => {
        if (err) {
          reject(new Error(`${LOG_PREFIX} ssh -G failed for ${host}: ${err.message}`));
          return;
        }
        const config = this._parseSSHGOutput(stdout);
        resolve(config);
      });
    });
  }
  async _parseSSHConfigHosts(content, configDir, visited) {
    const seen = visited ?? /* @__PURE__ */ new Set();
    const hosts = [];
    hosts.push(...parseSSHConfigHostEntries(content));
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const includeMatch = trimmed.match(/^Include\s+(.+)$/i);
      if (!includeMatch) {
        continue;
      }
      const rawValue = stripSSHComment(includeMatch[1]);
      const patterns = rawValue.split(/\s+/).filter(Boolean);
      for (const rawPattern of patterns) {
        const pattern = rawPattern.replace(/^~/, os.homedir());
        const resolvedPattern = isAbsolute(pattern) ? pattern : join(configDir, pattern);
        if (seen.has(resolvedPattern)) {
          continue;
        }
        seen.add(resolvedPattern);
        try {
          const stat = await fsp.stat(resolvedPattern);
          if (stat.isDirectory()) {
            const files = await fsp.readdir(resolvedPattern);
            for (const file of files) {
              try {
                const sub = await fsp.readFile(join(resolvedPattern, file), "utf-8");
                hosts.push(...await this._parseSSHConfigHosts(sub, resolvedPattern, seen));
              } catch {
              }
            }
          } else {
            const sub = await fsp.readFile(resolvedPattern, "utf-8");
            hosts.push(...await this._parseSSHConfigHosts(sub, dirname(resolvedPattern), seen));
          }
        } catch {
          const dir = dirname(resolvedPattern);
          const base = basename(resolvedPattern);
          if (base.includes("*")) {
            try {
              const files = await fsp.readdir(dir);
              for (const file of files) {
                const regex = new RegExp("^" + base.replace(/\*/g, ".*") + "$");
                if (regex.test(file)) {
                  try {
                    const sub = await fsp.readFile(join(dir, file), "utf-8");
                    hosts.push(...await this._parseSSHConfigHosts(sub, dir, seen));
                  } catch {
                  }
                }
              }
            } catch {
            }
          }
        }
      }
    }
    return hosts;
  }
  _parseSSHGOutput(stdout) {
    return parseSSHGOutput(stdout);
  }
  async _connectSSH(config, connectionKey) {
    const port = config.port ?? 22;
    const connectConfig = {
      host: config.host,
      port,
      username: config.username,
      // We enforce the handshake deadline ourselves so it can be stretched
      // while a prompt is outstanding; see INTERACTIVE_TIMEOUT_MS.
      readyTimeout: 0,
      keepaliveInterval: 15e3
    };
    const attempts = await this._buildAuthAttempts(config);
    this._logService.info(`${LOG_PREFIX} Built ${attempts.length} auth attempt(s): ${attempts.map((a) => describeAuthAttempt(a)).join(", ")}`);
    const displayHost = config.sshConfigHost ?? `${config.username}@${config.host}`;
    const liveKbiRequests = /* @__PURE__ */ new Set();
    let cancelConnectFromKbi;
    let armDeadline;
    const wrapPromptFinish = (finish) => (value) => {
      armDeadline?.(HANDSHAKE_TIMEOUT_MS);
      finish(value);
    };
    const kbiHandler = attempts.some((a) => a.type === "keyboard-interactive") ? (name, instructions, prompts, finish) => {
      armDeadline?.(INTERACTIVE_TIMEOUT_MS);
      const requestId = this._handleKeyboardInteractive(connectionKey ?? displayHost, displayHost, config.username, name, instructions, prompts, wrapPromptFinish(finish), () => cancelConnectFromKbi?.());
      liveKbiRequests.add(requestId);
    } : void 0;
    const keyPassphraseHandler = attempts.some((a) => a.type === "publickey" && a.encrypted) ? (keyPath, finish) => {
      armDeadline?.(INTERACTIVE_TIMEOUT_MS);
      const requestId = this._handleKeyboardInteractive(
        connectionKey ?? displayHost,
        displayHost,
        config.username,
        localize("sshKeyPassphraseName", "SSH Key Passphrase"),
        "",
        [{ prompt: localize("sshKeyPassphrasePrompt", "Enter passphrase for SSH key {0}.", keyPath), echo: false }],
        wrapPromptFinish((responses) => finish(responses[0])),
        () => cancelConnectFromKbi?.()
      );
      liveKbiRequests.add(requestId);
    } : void 0;
    connectConfig.authHandler = makeAuthHandler(attempts, this._logService, kbiHandler, keyPassphraseHandler);
    const cancelLiveKbiRequests = () => {
      for (const requestId of liveKbiRequests) {
        const pending = this._pendingKbiRequests.get(requestId);
        this._pendingKbiRequests.delete(requestId);
        this._onDidCancelKeyboardInteractive.fire(requestId);
        pending?.finish([]);
      }
      liveKbiRequests.clear();
    };
    if (config.agentForward) {
      const agentSock = this._getAgentSocket(config);
      if (agentSock) {
        connectConfig.agent = agentSock;
        connectConfig.agentForward = true;
        this._logService.info(`${LOG_PREFIX} SSH agent forwarding enabled`);
      } else {
        this._logService.warn(`${LOG_PREFIX} SSH agent forwarding requested, but no SSH agent endpoint is available; agent forwarding disabled`);
      }
    }
    const liveHostKeyRequests = /* @__PURE__ */ new Set();
    let hostKeyVerificationAborted = false;
    let hostKeyDenied = false;
    const cancelLiveHostKeyRequests = () => {
      hostKeyVerificationAborted = true;
      for (const requestId of liveHostKeyRequests) {
        const pending = this._pendingHostKeyRequests.get(requestId);
        this._pendingHostKeyRequests.delete(requestId);
        this._onDidCancelHostKeyVerification.fire(requestId);
        pending?.verify(false);
      }
      liveHostKeyRequests.clear();
    };
    connectConfig.hostVerifier = (key, verify) => {
      void this._verifyHostKey(
        connectionKey ?? displayHost,
        displayHost,
        config,
        port,
        key,
        verify,
        (requestId) => {
          liveHostKeyRequests.add(requestId);
          armDeadline?.(INTERACTIVE_TIMEOUT_MS);
          return () => {
            hostKeyDenied = true;
          };
        },
        () => hostKeyVerificationAborted,
        () => armDeadline?.(HANDSHAKE_TIMEOUT_MS)
      );
    };
    const client = await this._createSSHClient();
    return new Promise((resolve, reject) => {
      let settled = false;
      let deadlineTimer;
      const clearDeadline = () => {
        this._clearHandshakeDeadline(deadlineTimer);
        deadlineTimer = void 0;
      };
      armDeadline = (ms) => {
        if (settled) {
          return;
        }
        clearDeadline();
        deadlineTimer = this._armHandshakeDeadline(ms, () => {
          rejectConnect(new Error(`SSH handshake to ${config.host} timed out`), true);
        });
      };
      const resolveConnect = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearDeadline();
        this._logService.info(`${LOG_PREFIX} SSH connection established to ${config.host}`);
        cancelLiveKbiRequests();
        cancelLiveHostKeyRequests();
        resolve(client);
      };
      const rejectConnect = (err, endClient) => {
        if (settled) {
          return;
        }
        settled = true;
        clearDeadline();
        cancelLiveKbiRequests();
        cancelLiveHostKeyRequests();
        if (endClient) {
          client.end();
        }
        reject(err);
      };
      cancelConnectFromKbi = () => {
        this._logService.info(`${LOG_PREFIX} SSH keyboard-interactive prompt cancelled by user for ${displayHost}`);
        rejectConnect(new CancellationError(), true);
      };
      client.on("ready", () => {
        resolveConnect();
      });
      client.on("error", (err) => {
        this._logService.error(`${LOG_PREFIX} SSH connection error: ${err.message}`);
        rejectConnect(hostKeyDenied ? new SSHHostKeyDeniedError(displayHost) : err, false);
      });
      client.on("close", () => {
        rejectConnect(
          hostKeyDenied ? new SSHHostKeyDeniedError(displayHost) : new Error(`SSH connection to ${config.host} closed before the handshake completed`),
          false
        );
      });
      client.on("hostkeys", (keys) => {
        this._handleAnnouncedHostKeys(connectionKey ?? displayHost, config.host, port, keys);
      });
      armDeadline(HANDSHAKE_TIMEOUT_MS);
      client.connect(connectConfig);
    });
  }
  /**
   * Arm the handshake deadline. Overridable so tests can observe how the
   * window changes as prompts come and go without waiting on real timers.
   */
  _armHandshakeDeadline(ms, onExpired) {
    return setTimeout(onExpired, ms);
  }
  _clearHandshakeDeadline(timer) {
    if (timer) {
      clearTimeout(timer);
    }
  }
  async _createSSHClient() {
    const nativeRequire = await this._getNativeRequire();
    const ssh2Module = nativeRequire("ssh2");
    return new ssh2Module.Client();
  }
  /**
   * Build the ordered list of authentication attempts to feed to ssh2's
   * `authHandler`. In `Agent` mode we try the configured agent first (so a
   * loaded identity short-circuits before we ever touch an encrypted key
   * file), then any non-default explicit `IdentityFile`, then each readable
   * default identity in turn. A host that accepts `~/.ssh/id_rsa` still
   * works even if the agent doesn't have it loaded — without needing an
   * explicit `IdentityFile` entry in `~/.ssh/config`.
   */
  async _buildAuthAttempts(config) {
    const attempts = [];
    const username = config.username;
    switch (config.authMethod) {
      case SSHAuthMethod.Agent: {
        const agentSock = this._getAgentSocket(config);
        if (agentSock) {
          attempts.push({ type: "agent", username, agent: agentSock });
        }
        const explicitKeyPath = config.privateKeyPath;
        const explicitIsDefault = explicitKeyPath !== void 0 && SSHRemoteAgentHostMainService._isDefaultKeyPath(explicitKeyPath);
        if (explicitKeyPath && !explicitIsDefault) {
          const explicit = await this._readKeyFileIfExists(explicitKeyPath);
          if (explicit) {
            attempts.push({ type: "publickey", username, key: explicit, keyPath: explicitKeyPath, ...isEncryptedPrivateKey(explicit) ? { encrypted: true } : void 0 });
          }
        }
        for (const keyPath of SSHRemoteAgentHostMainService._defaultKeyPaths) {
          const contents = await this._readKeyFileIfExists(keyPath);
          if (contents) {
            attempts.push({ type: "publickey", username, key: contents, keyPath, ...isEncryptedPrivateKey(contents) ? { encrypted: true } : void 0 });
          }
        }
        attempts.push({ type: "keyboard-interactive", username });
        break;
      }
      case SSHAuthMethod.KeyFile: {
        if (!config.privateKeyPath) {
          throw new Error(localize("ssh.keyFileAuthRequiresPath", "Key file authentication requires a private key path."));
        }
        const explicit = await this._readKeyFileIfExists(config.privateKeyPath);
        if (!explicit) {
          throw new Error(localize("ssh.failedToReadPrivateKey", "Failed to read private key file: {0}", config.privateKeyPath));
        }
        attempts.push({ type: "publickey", username, key: explicit, keyPath: config.privateKeyPath, ...isEncryptedPrivateKey(explicit) ? { encrypted: true } : void 0 });
        break;
      }
      case SSHAuthMethod.Password: {
        if (config.password !== void 0) {
          attempts.push({ type: "password", username, password: config.password });
        }
        break;
      }
    }
    return attempts;
  }
  /**
   * Expand a leading `~` to the current user's home directory so that paths
   * coming back from `ssh -G` (always absolute) compare equal to our
   * `~`-prefixed defaults.
   */
  static _normalizeKeyPath(keyPath) {
    return keyPath.replace(/^~/, os.homedir());
  }
  static _isDefaultKeyPath(keyPath) {
    const normalized = SSHRemoteAgentHostMainService._normalizeKeyPath(keyPath);
    return SSHRemoteAgentHostMainService._defaultKeyPaths.some((p) => SSHRemoteAgentHostMainService._normalizeKeyPath(p) === normalized);
  }
  /** Test seam: returns the SSH agent socket path, or undefined when no agent is available. */
  _isAgentAvailable() {
    return process.env["SSH_AUTH_SOCK"];
  }
  _getAgentSocket(config) {
    if (config.identityAgent !== void 0) {
      return this._resolveIdentityAgent(config.identityAgent);
    }
    return this._isAgentAvailable();
  }
  _resolveIdentityAgent(identityAgent) {
    const trimmed = identityAgent.trim();
    if (!trimmed || trimmed.toLowerCase() === "none") {
      return void 0;
    }
    if (trimmed === "SSH_AUTH_SOCK") {
      return this._isAgentAvailable();
    }
    if (trimmed.startsWith("$")) {
      const envMatch = /^\$\{(?<braced>[A-Za-z_][A-Za-z0-9_]*)\}$|^\$(?<plain>[A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
      return envMatch?.groups ? process.env[envMatch.groups.braced ?? envMatch.groups.plain] || void 0 : void 0;
    }
    return trimmed.replace(/^~/, os.homedir());
  }
  /**
   * Forward a keyboard-interactive challenge from ssh2 to the renderer and
   * register the `finish` callback so {@link respondKeyboardInteractive} can
   * supply the user's responses when they arrive. Returns the generated
   * `requestId` so the caller can track in-flight prompts.
   */
  _handleKeyboardInteractive(connectionKey, displayHost, username, name, instructions, prompts, finish, cancelConnect) {
    const requestId = `kbi-${++this._kbiRequestCounter}`;
    let settled = false;
    const finishOnce = (responses) => {
      if (settled) {
        return;
      }
      settled = true;
      this._pendingKbiRequests.delete(requestId);
      finish(responses);
    };
    this._pendingKbiRequests.set(requestId, { finish: finishOnce, cancelConnect });
    this._logService.info(`${LOG_PREFIX} keyboard-interactive challenge from ${displayHost}: ${prompts.length} prompt(s)`);
    this._onDidRequestKeyboardInteractive.fire({
      requestId,
      connectionKey,
      displayHost,
      username,
      name,
      instructions,
      prompts: prompts.map((p) => ({ prompt: p.prompt, echo: p.echo }))
    });
    return requestId;
  }
  async respondKeyboardInteractive(requestId, responses) {
    const pending = this._pendingKbiRequests.get(requestId);
    if (!pending) {
      this._logService.warn(`${LOG_PREFIX} respondKeyboardInteractive: no pending request for ${requestId}`);
      return;
    }
    if (responses === void 0) {
      pending.cancelConnect();
      pending.finish([]);
      return;
    }
    pending.finish(responses);
  }
  /**
   * Read every `known_hosts` file that applies to `host` and return the
   * parsed entries. Overridable so tests can supply entries without touching
   * the developer's real SSH setup.
   *
   * Resolution deliberately goes through `ssh -G` rather than assuming
   * `~/.ssh/known_hosts`, so a user who has redirected `UserKnownHostsFile`
   * gets the files they actually configured. A failure here is not fatal: we
   * fall back to no entries, which downgrades to a trust prompt rather than
   * silently accepting an unverified key.
   */
  async _readKnownHostsEntries(host) {
    let resolved;
    try {
      resolved = await this.resolveSSHConfig(host);
    } catch (err) {
      this._logService.warn(`${LOG_PREFIX} Could not resolve SSH config for known_hosts lookup of ${host}: ${err}`);
    }
    const paths = [
      ...resolved?.userKnownHostsFiles ?? ["~/.ssh/known_hosts"],
      ...resolved?.globalKnownHostsFiles ?? []
    ];
    const entries = [];
    for (const path of paths) {
      const expanded = path.replace(/^~/, os.homedir());
      try {
        entries.push(...parseKnownHosts(await fsp.readFile(expanded, "utf-8")));
      } catch {
      }
    }
    return { entries, strictHostKeyChecking: resolved?.strictHostKeyChecking };
  }
  /**
   * Decide whether a presented host key should be trusted, by gathering the
   * evidence the renderer needs and asking it to apply policy.
   *
   * This process only collects facts — the fingerprint and what the user's
   * `known_hosts` files say. The renderer owns the decision because it holds
   * the trust store and the UI.
   */
  async _verifyHostKey(connectionKey, displayHost, config, port, key, verify, onRequest, isAborted, onPromptSettled) {
    let settled = false;
    let prompted = false;
    const verifyOnce = (permitted) => {
      if (settled) {
        return;
      }
      settled = true;
      if (prompted) {
        onPromptSettled();
      }
      verify(permitted);
    };
    try {
      const keyType = readHostKeyType(key);
      if (!keyType) {
        this._logService.error(`${LOG_PREFIX} Rejecting malformed host key from ${displayHost}`);
        verifyOnce(false);
        return;
      }
      const fingerprint = computeHostKeyFingerprint(key);
      const { entries, strictHostKeyChecking } = await this._readKnownHostsEntries(config.sshConfigHost ?? config.host);
      if (isAborted()) {
        this._logService.info(`${LOG_PREFIX} Abandoning host key verification for ${displayHost}: connect attempt already settled`);
        verifyOnce(false);
        return;
      }
      const knownHostsMatch = matchKnownHosts(entries, config.host, port, keyType, key);
      this._logService.info(`${LOG_PREFIX} Host key for ${displayHost}: ${keyType} ${fingerprint} (known_hosts: ${knownHostsMatch})`);
      const requestId = `hostkey-${++this._hostKeyRequestCounter}`;
      prompted = true;
      const onUserDenied = onRequest(requestId) ?? void 0;
      this._pendingHostKeyRequests.set(requestId, { verify: verifyOnce, onUserDenied });
      this._onDidRequestHostKeyVerification.fire({
        requestId,
        connectionKey,
        displayHost,
        host: config.host,
        port,
        keyType,
        fingerprint,
        knownHostsMatch,
        ...strictHostKeyChecking ? { strictHostKeyChecking } : void 0,
        userInitiated: config.userInitiated ?? true
      });
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Host key verification failed for ${displayHost}`, err);
      verifyOnce(false);
    }
  }
  async respondHostKeyVerification(requestId, trusted) {
    const pending = this._pendingHostKeyRequests.get(requestId);
    if (!pending) {
      this._logService.warn(`${LOG_PREFIX} respondHostKeyVerification: no pending request for ${requestId}`);
      return;
    }
    this._pendingHostKeyRequests.delete(requestId);
    this._logService.info(`${LOG_PREFIX} Host key ${trusted ? "accepted" : "rejected"} for request ${requestId}`);
    if (!trusted) {
      pending.onUserDenied?.();
    }
    pending.verify(trusted);
  }
  /**
   * Surface host keys announced over an authenticated connection. ssh2 has
   * already proven each key belongs to this server (it runs the
   * `hostkeys-prove-00@openssh.com` challenge and verifies the signatures
   * before emitting), so consumers may persist them without prompting.
   */
  _handleAnnouncedHostKeys(connectionKey, host, port, keys) {
    const announced = [];
    for (const key of keys) {
      try {
        const blob = key.getPublicSSH();
        const keyType = readHostKeyType(blob);
        if (keyType && keyType === key.type) {
          announced.push({ keyType, fingerprint: computeHostKeyFingerprint(blob) });
        }
      } catch (err) {
        this._logService.warn(`${LOG_PREFIX} Skipping unreadable announced host key for ${host}: ${err}`);
      }
    }
    if (!announced.length) {
      return;
    }
    this._logService.info(`${LOG_PREFIX} Server ${host} announced ${announced.length} proven host key(s)`);
    this._onDidAnnounceHostKeys.fire({ connectionKey, host, port, keys: announced });
  }
  /**
   * Ask the renderer to choose among live remote agent host endpoints (or
   * to spawn a new dedicated one), mirroring the keyboard-interactive
   * bridge in {@link _handleKeyboardInteractive}. Also settles (rejects)
   * with a {@link CancellationError} if `client` closes or errors while
   * the picker is still open, so a dropped SSH connection doesn't leave
   * the renderer's picker UI stuck waiting forever.
   */
  _requestEndpointSelection(client, connectionKey, displayHost, candidates) {
    const requestId = `endpoint-${++this._endpointSelectionCounter}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const onClientUnavailable = () => {
        if (settled) {
          return;
        }
        settled = true;
        this._pendingEndpointSelections.delete(requestId);
        client.removeListener("close", onClientUnavailable);
        client.removeListener("error", onClientUnavailable);
        this._onDidCancelEndpointSelection.fire(requestId);
        reject(new CancellationError());
      };
      client.on("close", onClientUnavailable);
      client.on("error", onClientUnavailable);
      this._pendingEndpointSelections.set(requestId, (selection) => {
        if (settled) {
          return;
        }
        settled = true;
        client.removeListener("close", onClientUnavailable);
        client.removeListener("error", onClientUnavailable);
        if (selection === void 0) {
          reject(new CancellationError());
        } else {
          resolve(selection);
        }
      });
      this._logService.info(`${LOG_PREFIX} Requesting endpoint selection for ${displayHost}: ${candidates.length} candidate(s)`);
      this._onDidRequestEndpointSelection.fire({
        requestId,
        connectionKey,
        displayHost,
        candidates: candidates.map((c) => ({ type: c.type, pid: c.pid, instanceId: c.instanceId, quality: c.quality, endpoint: c.endpoint }))
      });
    });
  }
  async respondEndpointSelection(requestId, selection) {
    const pending = this._pendingEndpointSelections.get(requestId);
    if (!pending) {
      this._logService.warn(`${LOG_PREFIX} respondEndpointSelection: no pending request for ${requestId}`);
      return;
    }
    this._pendingEndpointSelections.delete(requestId);
    pending(selection);
  }
  /**
   * Test seam: read a private key file from disk. Returns `undefined` if the
   * file doesn't exist; logs and returns `undefined` for any other read error
   * so a single broken key doesn't abort the whole auth flow.
   */
  async _readKeyFileIfExists(keyPath) {
    const resolved = keyPath.replace(/^~/, os.homedir());
    try {
      return await fsp.readFile(resolved);
    } catch (error) {
      const errorCode = error.code;
      if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
        return void 0;
      }
      this._logService.warn(`${LOG_PREFIX} Failed to read SSH key file ${resolved}`, error);
      return void 0;
    }
  }
  get _quality() {
    return this._productService.quality || "insider";
  }
  get _serverDataFolderName() {
    return this._productService.serverDataFolderName ?? ".vscode-server-oss";
  }
  get _commit() {
    return this._productService.commit;
  }
  _startRemoteAgentHost(client, cliBin, cliDataDir, commandOverride) {
    return startRemoteAgentHost(client, this._logService, cliBin, cliDataDir, commandOverride);
  }
  async _createWebSocketRelay(client, endpoint, relayCliBin, relayCliDataDir, relayInstanceId, relayUserDataPath, connectionToken, onMessage, onClose) {
    const nativeRequire = await this._getNativeRequire();
    return createWebSocketRelayForEndpoint(nativeRequire, client, endpoint, relayCliBin, relayCliDataDir, relayInstanceId, relayUserDataPath, connectionToken, this._logService, onMessage, onClose);
  }
  /**
   * Resolve which CLI binary to run on the remote.
   *
   * When the desktop has a `productService.commit` (release builds), we
   * pin to that commit: install at `~/<serverDataFolderName>/<archive>-<commit>`
   * (sharing the install root with Remote-SSH), reuse on file existence,
   * download from the commit-pinned URL on miss, and clean up older
   * commit-keyed CLIs (keep last 5). The agent host CLI does not
   * self-update on this path, so the desktop pushes freshness on every
   * fresh start — but tolerantly: if the download fails and any other
   * usable CLI is present (other commit-keyed or the legacy
   * `~/.vscode-cli{,-<quality>}/<archive>`), we fall back to the newest
   * one rather than refusing to connect.
   *
   * In dev/OSS builds with no commit, we keep a loose, non-pinned install
   * at `~/<serverDataFolderName>/<archive>`. Existing CLIs self-update
   * against the latest release before reuse.
   *
   * Returns the resolved CLI binary path to run.
   */
  async _ensureCLIInstalled(client, platform, reportProgress) {
    const commit = this._commit;
    if (!commit) {
      return this._ensureCLIInstalledLoose(client, platform, reportProgress);
    }
    return this._ensureCLIInstalledPinned(client, platform, reportProgress, commit);
  }
  /**
   * Commit-pinned install path. See {@link _ensureCLIInstalled}.
   */
  async _ensureCLIInstalledPinned(client, platform, reportProgress, commit) {
    const cliBin = getRemoteCLIBin(this._serverDataFolderName, this._quality, commit);
    const installRoot = getRemoteCLIInstallRoot(this._serverDataFolderName);
    const { code: existsCode } = await sshExec(client, `test -x ${cliBin}`, { ignoreExitCode: true });
    if (existsCode === 0) {
      this._logService.info(`${LOG_PREFIX} Reusing remote CLI at ${cliBin}`);
      const { code: touchCode } = await sshExec(client, `touch -- ${cliBin}`, { ignoreExitCode: true });
      if (touchCode === 0) {
        await sshExec(client, buildCleanupOldCLIsCommand(this._serverDataFolderName, this._quality), { ignoreExitCode: true });
      } else {
        this._logService.warn(`${LOG_PREFIX} Skipping CLI retention cleanup: touch exited ${touchCode}`);
      }
      return cliBin;
    }
    reportProgress(localize("sshProgressDownloadingCLI", "Installing VS Code CLI on remote..."));
    const url = buildCLIDownloadUrl(platform.os, platform.arch, this._quality, commit);
    const installCmd = [
      `mkdir -p ${installRoot}`,
      `tmpdir=$(mktemp -d ${installRoot}/.cli-install-XXXXXX)`,
      `(cd "$tmpdir" && curl -fsSL ${shellEscape(url)} | tar xz)`,
      // The archive contains exactly one file: the CLI binary, named per quality.
      `mv "$tmpdir"/* ${cliBin}`,
      `chmod +x ${cliBin}`,
      `rm -rf "$tmpdir"`
    ].join(" && ");
    try {
      await sshExec(client, installCmd);
      const { code: versionCode } = await sshExec(client, `${cliBin} --version`, { ignoreExitCode: true });
      if (versionCode !== 0) {
        throw new Error(`CLI at ${cliBin} failed --version check after install (exit code ${versionCode})`);
      }
      this._logService.info(`${LOG_PREFIX} Installed remote CLI at ${cliBin}`);
      await sshExec(client, buildCleanupOldCLIsCommand(this._serverDataFolderName, this._quality), { ignoreExitCode: true });
      return cliBin;
    } catch (installErr) {
      const installErrorMessage = installErr instanceof Error ? installErr.message : String(installErr);
      this._logService.warn(`${LOG_PREFIX} Could not install matching CLI for commit ${commit}: ${installErrorMessage}. Looking for a fallback CLI on the remote...`);
      const fallback = await this._findFallbackCLI(client);
      if (fallback) {
        this._logService.warn(`${LOG_PREFIX} Using fallback CLI at ${fallback} (does not match desktop commit ${commit}).`);
        return fallback;
      }
      throw installErr;
    }
  }
  /**
   * Loose dev-build install: no commit pin. See {@link _ensureCLIInstalled}.
   */
  async _ensureCLIInstalledLoose(client, platform, reportProgress) {
    const cliBin = getRemoteCLIBin(this._serverDataFolderName, this._quality);
    const installRoot = getRemoteCLIInstallRoot(this._serverDataFolderName);
    this._logService.warn(`${LOG_PREFIX} Desktop has no product commit; falling back to non-pinned CLI install at ${cliBin}.`);
    const updateExitCodeMarker = "__vscode_cli_update_exit_code__:";
    const { code, stdout } = await sshExec(client, `${cliBin} --version && (${cliBin} update; update_code=$?; echo ${updateExitCodeMarker}$update_code; true)`, { ignoreExitCode: true });
    if (code === 0) {
      const updateExitCodeLine = stdout.split("\n").find((line) => line.startsWith(updateExitCodeMarker));
      const updateExitCode = updateExitCodeLine === void 0 ? void 0 : Number.parseInt(updateExitCodeLine.slice(updateExitCodeMarker.length), 10);
      if (updateExitCode !== void 0 && updateExitCode !== 0) {
        this._logService.warn(`${LOG_PREFIX} Could not refresh the dev-build remote CLI at ${cliBin}; reusing the existing executable: update exited ${updateExitCode}`);
      }
      this._logService.info(`${LOG_PREFIX} Reusing remote CLI at ${cliBin} (dev build, latest-version refresh attempted)`);
      return cliBin;
    }
    reportProgress(localize("sshProgressDownloadingCLI", "Installing VS Code CLI on remote..."));
    const url = buildCLIDownloadUrl(platform.os, platform.arch, this._quality);
    const installCmd = [
      `mkdir -p ${installRoot}`,
      `curl -fsSL ${shellEscape(url)} | tar xz -C ${installRoot}`,
      `chmod +x ${cliBin}`
    ].join(" && ");
    await sshExec(client, installCmd);
    this._logService.info(`${LOG_PREFIX} Installed remote CLI at ${cliBin}`);
    return cliBin;
  }
  /**
   * List remote CLI candidates that could be used as a fallback when the
   * commit-pinned download fails, and return the newest one that passes
   * a `--version` check. Returns `undefined` if no candidate works.
   */
  async _findFallbackCLI(client) {
    const { stdout } = await sshExec(client, buildFindFallbackCLICommand(this._serverDataFolderName, this._quality), { ignoreExitCode: true });
    const rawCandidates = stdout.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
    const candidates = [];
    for (const candidate of rawCandidates) {
      if (isValidFallbackCLIPath(candidate, this._serverDataFolderName, this._quality)) {
        candidates.push(candidate);
      } else {
        this._logService.info(`${LOG_PREFIX} Ignoring fallback CLI candidate with unexpected path shape: ${candidate}`);
      }
    }
    for (const candidate of candidates) {
      const { code } = await sshExec(client, `${candidate} --version`, { ignoreExitCode: true });
      if (code === 0) {
        return candidate;
      }
      this._logService.info(`${LOG_PREFIX} Fallback CLI candidate ${candidate} failed --version check (exit ${code}); trying next.`);
    }
    return void 0;
  }
};
SSHRemoteAgentHostMainService._defaultKeyPaths = [
  "~/.ssh/id_ed25519",
  "~/.ssh/id_rsa",
  "~/.ssh/id_ecdsa",
  "~/.ssh/id_dsa",
  "~/.ssh/id_xmss"
];
SSHRemoteAgentHostMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProductService)
], SSHRemoteAgentHostMainService);
export {
  SSHRemoteAgentHostMainService,
  makeAuthHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgV2ViU29ja2V0IGZyb20gJ3dzJztcbmltcG9ydCB0eXBlIHsgQW55QXV0aE1ldGhvZCwgQXV0aGVudGljYXRpb25UeXBlLCBDb25uZWN0Q29uZmlnIH0gZnJvbSAnc3NoMic7XG5pbXBvcnQgeyBwcm9taXNlcyBhcyBmc3AgfSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIGlzQWJzb2x1dGUsIGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSxcblx0U1NIQXV0aE1ldGhvZCxcblx0Y29tcHV0ZVNTSENvbm5lY3Rpb25LZXksXG5cdHR5cGUgSVNTSEFnZW50SG9zdENvbmZpZyxcblx0dHlwZSBJU1NIQWdlbnRIb3N0Q29uZmlnU2FuaXRpemVkLFxuXHR0eXBlIElTU0hDb25uZWN0UHJvZ3Jlc3MsXG5cdHR5cGUgSVNTSENvbm5lY3RSZXN1bHQsXG5cdHR5cGUgSVNTSEVuZHBvaW50Q2FuZGlkYXRlLFxuXHR0eXBlIElTU0hFbmRwb2ludFNlbGVjdGlvbixcblx0dHlwZSBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0LFxuXHR0eXBlIElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdCxcblx0dHlwZSBJU1NISG9zdEtleXNBbm5vdW5jZW1lbnQsXG5cdHR5cGUgSVNTSEtleWJvYXJkSW50ZXJhY3RpdmVQcm9tcHQsXG5cdHR5cGUgSVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0LFxuXHR0eXBlIElTU0hSZXNvbHZlZENvbmZpZyxcblx0dHlwZSBTU0hBZ2VudEhvc3RMaWZlY3ljbGUsXG5cdHR5cGUgU1NIU3RyaWN0SG9zdEtleUNoZWNraW5nLFxuXHRTU0hIb3N0S2V5RGVuaWVkRXJyb3IsXG59IGZyb20gJy4uL2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHtcblx0Y29tcHV0ZUhvc3RLZXlGaW5nZXJwcmludCxcblx0bWF0Y2hLbm93bkhvc3RzLFxuXHRwYXJzZUtub3duSG9zdHMsXG5cdHJlYWRIb3N0S2V5VHlwZSxcblx0dHlwZSBJS25vd25Ib3N0c0VudHJ5LFxufSBmcm9tICcuL3NzaEtub3duSG9zdHMuanMnO1xuaW1wb3J0IHR5cGUgeyBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UgfSBmcm9tICcuLi9jb21tb24vcmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVJlbGF5TWVzc2FnZSB9IGZyb20gJy4uL2NvbW1vbi9yZWxheVRyYW5zcG9ydC5qcyc7XG5pbXBvcnQge1xuXHR0eXBlIEFnZW50SG9zdEVuZHBvaW50QWRkcmVzcyxcblx0dHlwZSBBZ2VudEhvc3RTZXJ2ZXJUeXBlLFxuXHR0eXBlIElBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhLFxuXHRpc1NhbWVBZ2VudEhvc3RFbmRwb2ludElkZW50aXR5LFxufSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0RW5kcG9pbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRidWlsZEFnZW50SG9zdEJhc2VDb21tYW5kLFxuXHRidWlsZEFnZW50SG9zdFNwYXduQ29tbWFuZCxcblx0YnVpbGRBZ2VudFJlbGF5Q29tbWFuZCxcblx0YnVpbGRDTElEb3dubG9hZFVybCxcblx0YnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQsXG5cdGJ1aWxkRmluZEZhbGxiYWNrQ0xJQ29tbWFuZCxcblx0ZXh0cmFjdEFnZW50SG9zdFdlYlNvY2tldFVSTCxcblx0ZmlsdGVyTGl2ZUFnZW50SG9zdEVuZHBvaW50cyxcblx0Z2V0UmVtb3RlQ0xJQmluLFxuXHRnZXRSZW1vdGVDTElEYXRhRGlyLFxuXHRnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCxcblx0aXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCxcblx0cmVkYWN0VG9rZW4sXG5cdHJlc29sdmVSZW1vdGVQbGF0Zm9ybSxcblx0cnVuQWdlbnRFbmRwb2ludHMsXG5cdHNoZWxsRXNjYXBlLFxuXHR3YWl0Rm9yTmV3U3RhbmRhbG9uZUVuZHBvaW50LFxufSBmcm9tICcuL3NzaFJlbW90ZUFnZW50SG9zdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgcGFyc2VTU0hDb25maWdIb3N0RW50cmllcywgcGFyc2VTU0hHT3V0cHV0LCBzdHJpcFNTSENvbW1lbnQgfSBmcm9tICcuLi9jb21tb24vc3NoQ29uZmlnUGFyc2luZy5qcyc7XG5pbXBvcnQgeyByZW1vdmVBbnNpRXNjYXBlQ29kZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcblxuLyoqIE1pbmltYWwgc3Vic2V0IG9mIHNzaDIuQ2xpZW50Q2hhbm5lbCB1c2VkIGJ5IHRoaXMgbW9kdWxlIChkdXBsZXggc3RyZWFtKS4gKi9cbmludGVyZmFjZSBTU0hDaGFubmVsIGV4dGVuZHMgTm9kZUpTLlJlYWRXcml0ZVN0cmVhbSB7XG5cdG9uKGV2ZW50OiAnZGF0YScsIGxpc3RlbmVyOiAoZGF0YTogQnVmZmVyKSA9PiB2b2lkKTogdGhpcztcblx0b24oZXZlbnQ6ICdjbG9zZScsIGxpc3RlbmVyOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkKTogdGhpcztcblx0b24oZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XG5cdG9uKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdGhpcztcblx0c3RkZXJyOiB7IG9uKGV2ZW50OiAnZGF0YScsIGxpc3RlbmVyOiAoZGF0YTogQnVmZmVyKSA9PiB2b2lkKTogdm9pZCB9O1xuXHRjbG9zZSgpOiB2b2lkO1xufVxuXG4vKiogTWluaW1hbCBzdWJzZXQgb2Ygc3NoMi5DbGllbnQgdXNlZCBieSB0aGlzIG1vZHVsZS4gKi9cbmludGVyZmFjZSBTU0hDbGllbnQge1xuXHRvbihldmVudDogJ3JlYWR5JywgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiBTU0hDbGllbnQ7XG5cdG9uKGV2ZW50OiAnZXJyb3InLCBsaXN0ZW5lcjogKGVycjogRXJyb3IpID0+IHZvaWQpOiBTU0hDbGllbnQ7XG5cdG9uKGV2ZW50OiAnY2xvc2UnLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IFNTSENsaWVudDtcblx0LyoqXG5cdCAqIE9wZW5TU0gncyBgVXBkYXRlSG9zdEtleXNgIGFubm91bmNlbWVudC4gc3NoMiB2ZXJpZmllcyB0aGVcblx0ICogYGhvc3RrZXlzLXByb3ZlLTAwQG9wZW5zc2guY29tYCBzaWduYXR1cmVzIGJlZm9yZSBlbWl0dGluZywgc28gdGhlc2Uga2V5c1xuXHQgKiBhcmUgcHJvdmVuIHRvIGJlbG9uZyB0byB0aGUgY29ubmVjdGVkIHNlcnZlci5cblx0ICovXG5cdG9uKGV2ZW50OiAnaG9zdGtleXMnLCBsaXN0ZW5lcjogKGtleXM6IHJlYWRvbmx5IHsgZ2V0UHVibGljU1NIKCk6IEJ1ZmZlcjsgdHlwZTogc3RyaW5nIH1bXSkgPT4gdm9pZCk6IFNTSENsaWVudDtcblx0cmVtb3ZlTGlzdGVuZXIoZXZlbnQ6ICdjbG9zZScsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogU1NIQ2xpZW50O1xuXHRyZW1vdmVMaXN0ZW5lcihldmVudDogJ2Vycm9yJywgbGlzdGVuZXI6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogU1NIQ2xpZW50O1xuXHRjb25uZWN0KGNvbmZpZzogQ29ubmVjdENvbmZpZyk6IHZvaWQ7XG5cdGV4ZWMoY29tbWFuZDogc3RyaW5nLCBjYWxsYmFjazogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIHN0cmVhbTogU1NIQ2hhbm5lbCkgPT4gdm9pZCk6IFNTSENsaWVudDtcblx0Zm9yd2FyZE91dChzcmNJUDogc3RyaW5nLCBzcmNQb3J0OiBudW1iZXIsIGRzdElQOiBzdHJpbmcsIGRzdFBvcnQ6IG51bWJlciwgY2FsbGJhY2s6IChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBjaGFubmVsOiBTU0hDaGFubmVsKSA9PiB2b2lkKTogU1NIQ2xpZW50O1xuXHRlbmQoKTogdm9pZDtcbn1cblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbU1NIUmVtb3RlQWdlbnRIb3N0XSc7XG5cbi8qKlxuICogTWF4aW11bSB0aW1lIHRvIHdhaXQgZm9yIHtAbGluayBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZS5fY3JlYXRlV2ViU29ja2V0UmVsYXl9XG4gKiB0byBzZXR0bGUgb24gdGhlIGByZXBsYWNlUmVsYXlgIHJlY29ubmVjdCBwYXRoIGJlZm9yZSBnaXZpbmcgdXAuIEEgc2lsZW50bHlcbiAqIGRlYWQgU1NIIGNsaWVudCAoVENQIGhhbGYtb3Blbiwgc3NoMiBrZWVwYWxpdmUgaGFzbid0IGZpcmVkIHlldCkgY2FuIGxlYXZlXG4gKiBgZm9yd2FyZE91dGAncyBjYWxsYmFjayB1bmZpcmVkLCBoYW5naW5nIHRoZSB3aG9sZSBgY29ubmVjdCgpYCBjYWxsLiBCb3VuZGluZ1xuICogdGhpcyBzdXJmYWNlcyBhIGNsZWFuIGZhaWx1cmUgc28gdGhlIHJlbmRlcmVyIGNhbiBjbGVhciBpdHMgcGVuZGluZy1yZWNvbm5lY3RcbiAqIGZsYWcgYW5kIHJldHJ5LCBhbmQgc28gdGhlIGRlYWQgU1NIIGNsaWVudCBnZXRzIGVuZGVkIChwdXJnaW5nIGl0IGZyb20gdGhlXG4gKiBzaGFyZWQtcHJvY2VzcyBgX2Nvbm5lY3Rpb25zYCBtYXApLlxuICpcbiAqIFRoZSB2YWx1ZSBpcyBqdXN0IHNsaWdodGx5IGxhcmdlciB0aGFuIHNzaDIncyBkZWZhdWx0IGtlZXBhbGl2ZSBmYWlsdXJlXG4gKiB3aW5kb3cgKGBrZWVwYWxpdmVJbnRlcnZhbCAqIGtlZXBhbGl2ZUNvdW50TWF4YCB+PSAxNXMgKiAzID0gNDVzKSBzbyB0aGF0IGluXG4gKiBwcmFjdGljZSB0aGUgU1NIIGNsaWVudCBpdHNlbGYgd2lsbCBzdXJmYWNlIGl0cyBvd24gYCdjbG9zZSdgIGZpcnN0IHdoZW5cbiAqIHRoZSBuZXR3b3JrIGlzIGhhcmQtZG93bi4gVGVzdHMgb3ZlcnJpZGUgdGhpcyB0byBhIG11Y2ggc21hbGxlciB2YWx1ZS5cbiAqL1xuY29uc3QgUkVDT05ORUNUX1JFTEFZX1RJTUVPVVRfTVMgPSA2MF8wMDA7XG5cbi8qKiBPcGFxdWUgaGFuZGxlIGZvciB0aGUgaGFuZHNoYWtlIGRlYWRsaW5lIHRpbWVyOyBzZWUgYF9hcm1IYW5kc2hha2VEZWFkbGluZWAuICovXG50eXBlIElIYW5kc2hha2VEZWFkbGluZUhhbmRsZSA9IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+O1xuXG4vKipcbiAqIERlYWRsaW5lIGZvciB0aGUgcGFydHMgb2YgdGhlIGhhbmRzaGFrZSB0aGF0IGludm9sdmUgbm8gaHVtYW46IFRDUCBjb25uZWN0LFxuICoga2V5IGV4Y2hhbmdlLCBhbmQgYXV0aGVudGljYXRpb24uIEtlcHQgc2hvcnQgc28gYW4gdW5yZWFjaGFibGUgb3Igc3RhbGxlZFxuICogc2VydmVyIGZhaWxzIHByb21wdGx5LlxuICovXG5jb25zdCBIQU5EU0hBS0VfVElNRU9VVF9NUyA9IDMwXzAwMDtcblxuLyoqXG4gKiBEZWFkbGluZSB0aGF0IGFwcGxpZXMgb25seSB3aGlsZSB3ZSBhcmUgd2FpdGluZyBvbiBhIHBlcnNvbiBcdTIwMTQgYSBob3N0IGtleVxuICogY29uZmlybWF0aW9uIG9yIGEga2V5Ym9hcmQtaW50ZXJhY3RpdmUgcHJvbXB0LlxuICpcbiAqIFdlIG1hbmFnZSB0aGUgaGFuZHNoYWtlIGRlYWRsaW5lIG91cnNlbHZlcyAoc3NoMidzIGByZWFkeVRpbWVvdXRgIGlzXG4gKiBkaXNhYmxlZCkgYmVjYXVzZSBzc2gyJ3MgdGltZXIgY292ZXJzIHRoZSB3aG9sZSBoYW5kc2hha2UgYW5kIGtlZXBzIHJ1bm5pbmdcbiAqIHdoaWxlIGBob3N0VmVyaWZpZXJgIGF3YWl0cyBhIHZlcmRpY3QuIExlYXZpbmcgaXQgYXJtZWQgd291bGQgYWJvcnQgdGhlXG4gKiBjb25uZWN0aW9uIG91dCBmcm9tIHVuZGVyIGEgdXNlciBkb2luZyBleGFjdGx5IHdoYXQgdGhlIGhvc3Qga2V5IGRpYWxvZyBhc2tzXG4gKiBcdTIwMTQgZ29pbmcgdG8gY29tcGFyZSBhIGZpbmdlcnByaW50IGFnYWluc3QgYW5vdGhlciBzb3VyY2UgXHUyMDE0IHdoaWxlIHNpbXBseVxuICogcmFpc2luZyBpdCBmb3IgdGhlIHdob2xlIGhhbmRzaGFrZSB3b3VsZCBtYWtlIGFuIHVucmVhY2hhYmxlIGhvc3QgdGFrZVxuICogbWludXRlcyB0byBmYWlsLiBTbyB0aGUgZGVhZGxpbmUgaXMgc2hvcnQgYnkgZGVmYXVsdCBhbmQgb25seSBzdHJldGNoZWQgZm9yXG4gKiB0aGUgaW50ZXJ2YWwgYSBwcm9tcHQgaXMgYWN0dWFsbHkgb3V0c3RhbmRpbmcuXG4gKi9cbmNvbnN0IElOVEVSQUNUSVZFX1RJTUVPVVRfTVMgPSAzMDBfMDAwO1xuXG4vKipcbiAqIE9uZSBlbnRyeSBpbiB0aGUgcXVldWUgb2YgYXV0aGVudGljYXRpb24gYXR0ZW1wdHMgaGFuZGVkIHRvIHNzaDInc1xuICogYGF1dGhIYW5kbGVyYC4gRWFjaCBhdHRlbXB0IGNvcnJlc3BvbmRzIHRvIG9uZSBvZiB0aGUgYXV0aCBtZXRob2Qgc2hhcGVzXG4gKiBkb2N1bWVudGVkIGF0IGh0dHBzOi8vd3d3Lm5wbWpzLmNvbS9wYWNrYWdlL3NzaDIjY2xpZW50LW1ldGhvZHMuXG4gKlxuICogYGtleVBhdGhgIGlzIGludGVybmFsLW9ubHkgbWV0YWRhdGEgZm9yIGxvZ2dpbmcgXHUyMDE0IGl0IGlzIHN0cmlwcGVkIGJlZm9yZSB0aGVcbiAqIGF0dGVtcHQgaXMgcmV0dXJuZWQgdG8gc3NoMi5cbiAqL1xuZXhwb3J0IHR5cGUgU1NIQXV0aEF0dGVtcHQgPVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogJ3B1YmxpY2tleSc7IHJlYWRvbmx5IHVzZXJuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGtleTogQnVmZmVyOyByZWFkb25seSBrZXlQYXRoOiBzdHJpbmc7IHJlYWRvbmx5IGVuY3J5cHRlZD86IGJvb2xlYW4gfVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogJ2FnZW50JzsgcmVhZG9ubHkgdXNlcm5hbWU6IHN0cmluZzsgcmVhZG9ubHkgYWdlbnQ6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSB0eXBlOiAncGFzc3dvcmQnOyByZWFkb25seSB1c2VybmFtZTogc3RyaW5nOyByZWFkb25seSBwYXNzd29yZDogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZSc7IHJlYWRvbmx5IHVzZXJuYW1lOiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gZGVzY3JpYmVBdXRoQXR0ZW1wdChhdHRlbXB0OiBTU0hBdXRoQXR0ZW1wdCk6IHN0cmluZyB7XG5cdHN3aXRjaCAoYXR0ZW1wdC50eXBlKSB7XG5cdFx0Y2FzZSAncHVibGlja2V5JzogcmV0dXJuIGBwdWJsaWNrZXkgJHthdHRlbXB0LmtleVBhdGh9YDtcblx0XHRjYXNlICdhZ2VudCc6IHJldHVybiAnYWdlbnQnO1xuXHRcdGNhc2UgJ3Bhc3N3b3JkJzogcmV0dXJuICdwYXNzd29yZCc7XG5cdFx0Y2FzZSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnOiByZXR1cm4gJ2tleWJvYXJkLWludGVyYWN0aXZlJztcblx0fVxufVxuXG4vKipcbiAqIENhbGxiYWNrIGludm9rZWQgd2hlbiB0aGUgU1NIIHNlcnZlciByZXF1ZXN0cyBrZXlib2FyZC1pbnRlcmFjdGl2ZVxuICogYXV0aGVudGljYXRpb24uIFRoZSBoYW5kbGVyIG11c3QgZXZlbnR1YWxseSBjYWxsIGBmaW5pc2hgIHdpdGggdGhlXG4gKiB1c2VyJ3MgcmVzcG9uc2VzIChvciBhbiBlbXB0eSBhcnJheSB0byBmYWlsIHRoaXMgYXR0ZW1wdCkuXG4gKi9cbmV4cG9ydCB0eXBlIFNTSEtleWJvYXJkSW50ZXJhY3RpdmVQcm9tcHRIYW5kbGVyID0gKFxuXHRuYW1lOiBzdHJpbmcsXG5cdGluc3RydWN0aW9uczogc3RyaW5nLFxuXHRwcm9tcHRzOiByZWFkb25seSBJU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVByb21wdFtdLFxuXHRmaW5pc2g6IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB2b2lkLFxuKSA9PiB2b2lkO1xuXG5leHBvcnQgdHlwZSBTU0hLZXlQYXNzcGhyYXNlUHJvbXB0SGFuZGxlciA9IChcblx0a2V5UGF0aDogc3RyaW5nLFxuXHRmaW5pc2g6IChwYXNzcGhyYXNlOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHZvaWQsXG4pID0+IHZvaWQ7XG5cbi8qKlxuICogVHJhbnNsYXRlIGEge0BsaW5rIFNTSEF1dGhBdHRlbXB0fSBpbnRvIHRoZSBwYXlsb2FkIHNoYXBlIHNzaDIgZXhwZWN0cyBpblxuICogaXRzIGBhdXRoSGFuZGxlcmAgY2FsbGJhY2suIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYXR0ZW1wdCBjYW5ub3QgYmVcbiAqIHJlYWxpemVkIChjdXJyZW50bHkgb25seSBga2V5Ym9hcmQtaW50ZXJhY3RpdmVgIHdpdGhvdXQgYSBwcm9tcHQgaGFuZGxlcikuXG4gKlxuICogVGhlIGtiaSBjYXNlIGlzIHRoZSBvbmUgcGxhY2Ugd2hlcmUgd2Ugc3RpbGwgbmVlZCBhIGNhbGxiYWNrLWJyaWRnZTogc3NoMlxuICogY2FsbHMgb3VyIGBwcm9tcHRgIHdpdGggYSBgZmluaXNoKHN0cmluZ1tdKWAgYW5kIHdlIGhhbmQgdGhlIHJlc3BvbnNlcyB0b1xuICogYGtiaUhhbmRsZXJgLiBJc29sYXRpbmcgdGhhdCBoZXJlIGtlZXBzIGl0IG91dCBvZiB0aGUgaXRlcmF0aW9uIGxvb3AgYmVsb3cuXG4gKi9cbmZ1bmN0aW9uIHRvQXV0aE1ldGhvZChcblx0YXR0ZW1wdDogU1NIQXV0aEF0dGVtcHQsXG5cdGtiaUhhbmRsZXI6IFNTSEtleWJvYXJkSW50ZXJhY3RpdmVQcm9tcHRIYW5kbGVyIHwgdW5kZWZpbmVkLFxuXHRrZXlQYXNzcGhyYXNlSGFuZGxlcjogU1NIS2V5UGFzc3BocmFzZVByb21wdEhhbmRsZXIgfCB1bmRlZmluZWQsXG5cdGNhbGxiYWNrOiAobmV4dDogQW55QXV0aE1ldGhvZCB8IGZhbHNlKSA9PiB2b2lkLFxuKTogQW55QXV0aE1ldGhvZCB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoYXR0ZW1wdC50eXBlKSB7XG5cdFx0Y2FzZSAncHVibGlja2V5Jzoge1xuXHRcdFx0Ly8gU3RyaXAgb3VyIGludGVybmFsIGBrZXlQYXRoYCBtZXRhZGF0YSBiZWZvcmUgaGFuZGluZyB0byBzc2gyLlxuXHRcdFx0Y29uc3QgeyBrZXlQYXRoOiBfa3AsIGVuY3J5cHRlZDogX2VuY3J5cHRlZCwgLi4ucGF5bG9hZCB9ID0gYXR0ZW1wdDtcblx0XHRcdGlmIChhdHRlbXB0LmVuY3J5cHRlZCkge1xuXHRcdFx0XHRpZiAoIWtleVBhc3NwaHJhc2VIYW5kbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRrZXlQYXNzcGhyYXNlSGFuZGxlcihhdHRlbXB0LmtleVBhdGgsIHBhc3NwaHJhc2UgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXNzcGhyYXNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKGZhbHNlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FsbGJhY2soeyAuLi5wYXlsb2FkLCBwYXNzcGhyYXNlIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXlsb2FkO1xuXHRcdH1cblx0XHRjYXNlICdhZ2VudCc6XG5cdFx0Y2FzZSAncGFzc3dvcmQnOlxuXHRcdFx0cmV0dXJuIGF0dGVtcHQ7XG5cdFx0Y2FzZSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnOiB7XG5cdFx0XHRpZiAoIWtiaUhhbmRsZXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsXG5cdFx0XHRcdHVzZXJuYW1lOiBhdHRlbXB0LnVzZXJuYW1lLFxuXHRcdFx0XHRwcm9tcHQ6IChuYW1lLCBpbnN0cnVjdGlvbnMsIF9sYW5nLCBwcm9tcHRzLCBmaW5pc2gpID0+IHtcblx0XHRcdFx0XHRjb25zdCBub3JtYWxpemVkID0gcHJvbXB0cy5tYXAocCA9PiAoeyBwcm9tcHQ6IHAucHJvbXB0LCBlY2hvOiBwLmVjaG8gPz8gdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0a2JpSGFuZGxlcihuYW1lLCBpbnN0cnVjdGlvbnMsIG5vcm1hbGl6ZWQsIHJlc3BvbnNlcyA9PiBmaW5pc2goWy4uLnJlc3BvbnNlc10pKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogYGFnZW50YCBpcyBhIHB1YmxpY2tleS1mbGF2b3JlZCBtZXRob2QgYXQgdGhlIFNTSCBwcm90b2NvbCBsZXZlbCBcdTIwMTQgc2VydmVyc1xuICogYWR2ZXJ0aXNlIGBwdWJsaWNrZXlgLCBub3QgYGFnZW50YCwgaW4gYG1ldGhvZHNMZWZ0YC4gUmV0dXJucyB0cnVlIHdoZW4gdGhlXG4gKiBzZXJ2ZXIgc3RpbGwgaGFzIHRoZSB1bmRlcmx5aW5nIHByb3RvY29sIG1ldGhvZCBvbiBvZmZlci5cbiAqL1xuZnVuY3Rpb24gaXNNZXRob2RBbGxvd2VkQnlTZXJ2ZXIoYXR0ZW1wdDogU1NIQXV0aEF0dGVtcHQsIG1ldGhvZHNMZWZ0OiBBdXRoZW50aWNhdGlvblR5cGVbXSB8IG51bGwpOiBib29sZWFuIHtcblx0aWYgKCFtZXRob2RzTGVmdCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IHByb3RvY29sTWV0aG9kOiBBdXRoZW50aWNhdGlvblR5cGUgPSBhdHRlbXB0LnR5cGUgPT09ICdhZ2VudCcgPyAncHVibGlja2V5JyA6IGF0dGVtcHQudHlwZTtcblx0cmV0dXJuIG1ldGhvZHNMZWZ0LmluY2x1ZGVzKHByb3RvY29sTWV0aG9kKTtcbn1cblxuLyoqXG4gKiBCdWlsZCBhbiBzc2gyIGBhdXRoSGFuZGxlcmAgY2FsbGJhY2sgdGhhdCB3YWxrcyB0aGUgZ2l2ZW4gYXR0ZW1wdHMgaW4gb3JkZXIsXG4gKiBmaWx0ZXJpbmcgYnkgdGhlIHNlcnZlci1hZHZlcnRpc2VkIGBtZXRob2RzTGVmdGAgd2hlbiBzc2gyIHByb3ZpZGVzIG9uZS5cbiAqIFJldHVybnMgYGZhbHNlYCB3aGVuIHRoZSBxdWV1ZSBpcyBleGhhdXN0ZWQsIHdoaWNoIGNhdXNlcyBzc2gyIHRvIHN1cmZhY2VcbiAqIGFuIGF1dGhlbnRpY2F0aW9uIGZhaWx1cmUgdG8gdGhlIGNhbGxlci5cbiAqXG4gKiBga2JpSGFuZGxlcmAgKHdoZW4gcHJvdmlkZWQpIGlzIGludm9rZWQgYnkgc3NoMiBpZiB0aGUgc2VydmVyIHBpY2tzIHRoZVxuICogYGtleWJvYXJkLWludGVyYWN0aXZlYCBhdHRlbXB0LCBhbmQgaXMgcmVzcG9uc2libGUgZm9yIGNvbGxlY3RpbmdcbiAqIHJlc3BvbnNlcyAoZS5nLiBieSBwcm9tcHRpbmcgdGhlIHVzZXIpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFrZUF1dGhIYW5kbGVyKFxuXHRhdHRlbXB0czogcmVhZG9ubHkgU1NIQXV0aEF0dGVtcHRbXSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdGtiaUhhbmRsZXI/OiBTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0SGFuZGxlcixcblx0a2V5UGFzc3BocmFzZUhhbmRsZXI/OiBTU0hLZXlQYXNzcGhyYXNlUHJvbXB0SGFuZGxlcixcbik6IChtZXRob2RzTGVmdDogQXV0aGVudGljYXRpb25UeXBlW10gfCBudWxsLCBwYXJ0aWFsU3VjY2VzczogYm9vbGVhbiwgY2FsbGJhY2s6IChuZXh0OiBBbnlBdXRoTWV0aG9kIHwgZmFsc2UpID0+IHZvaWQpID0+IHZvaWQge1xuXHRsZXQgaW5kZXggPSAwO1xuXHRyZXR1cm4gKG1ldGhvZHNMZWZ0LCBfcGFydGlhbFN1Y2Nlc3MsIGNhbGxiYWNrKSA9PiB7XG5cdFx0d2hpbGUgKGluZGV4IDwgYXR0ZW1wdHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhdHRlbXB0ID0gYXR0ZW1wdHNbaW5kZXgrK107XG5cdFx0XHRpZiAoIWlzTWV0aG9kQWxsb3dlZEJ5U2VydmVyKGF0dGVtcHQsIG1ldGhvZHNMZWZ0KSkge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gU2tpcHBpbmcgJHtkZXNjcmliZUF1dGhBdHRlbXB0KGF0dGVtcHQpfSBcdTIwMTQgc2VydmVyIG9ubHkgYWxsb3dzICR7bWV0aG9kc0xlZnQhLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWV0aG9kID0gdG9BdXRoTWV0aG9kKGF0dGVtcHQsIGtiaUhhbmRsZXIsIGtleVBhc3NwaHJhc2VIYW5kbGVyLCBjYWxsYmFjayk7XG5cdFx0XHRpZiAoIW1ldGhvZCkge1xuXHRcdFx0XHRpZiAoYXR0ZW1wdC50eXBlID09PSAncHVibGlja2V5JyAmJiBhdHRlbXB0LmVuY3J5cHRlZCAmJiBrZXlQYXNzcGhyYXNlSGFuZGxlcikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBUcnlpbmcgYXV0aDogJHtkZXNjcmliZUF1dGhBdHRlbXB0KGF0dGVtcHQpfWApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gJHtkZXNjcmliZUF1dGhBdHRlbXB0KGF0dGVtcHQpfSBza2lwcGVkOiBubyBwcm9tcHQgaGFuZGxlciBhdmFpbGFibGVgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVHJ5aW5nIGF1dGg6ICR7ZGVzY3JpYmVBdXRoQXR0ZW1wdChhdHRlbXB0KX1gKTtcblx0XHRcdGNhbGxiYWNrKG1ldGhvZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBObyBtb3JlIGF1dGggbWV0aG9kcyB0byB0cnk7IGdpdmluZyB1cGApO1xuXHRcdGNhbGxiYWNrKGZhbHNlKTtcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVhZFNTSFN0cmluZyhidWZmZXI6IEJ1ZmZlciwgb2Zmc2V0OiBudW1iZXIpOiB7IHZhbHVlOiBzdHJpbmc7IG9mZnNldDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRpZiAob2Zmc2V0ICsgNCA+IGJ1ZmZlci5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGxlbmd0aCA9IGJ1ZmZlci5yZWFkVUludDMyQkUob2Zmc2V0KTtcblx0Y29uc3QgdmFsdWVPZmZzZXQgPSBvZmZzZXQgKyA0O1xuXHRjb25zdCBuZXh0T2Zmc2V0ID0gdmFsdWVPZmZzZXQgKyBsZW5ndGg7XG5cdGlmIChuZXh0T2Zmc2V0ID4gYnVmZmVyLmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgdmFsdWU6IGJ1ZmZlci50b1N0cmluZygndXRmOCcsIHZhbHVlT2Zmc2V0LCBuZXh0T2Zmc2V0KSwgb2Zmc2V0OiBuZXh0T2Zmc2V0IH07XG59XG5cbmZ1bmN0aW9uIGlzRW5jcnlwdGVkUHJpdmF0ZUtleShrZXk6IEJ1ZmZlcik6IGJvb2xlYW4ge1xuXHRjb25zdCB0ZXh0ID0ga2V5LnRvU3RyaW5nKCd1dGY4Jyk7XG5cdGlmICgvLS0tLS1CRUdJTiBFTkNSWVBURUQgUFJJVkFURSBLRVktLS0tLS8udGVzdCh0ZXh0KSB8fCAvUHJvYy1UeXBlOlxccyo0LEVOQ1JZUFRFRC9pLnRlc3QodGV4dCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBvcGVuU1NIS2V5ID0gLy0tLS0tQkVHSU4gT1BFTlNTSCBQUklWQVRFIEtFWS0tLS0tKFtcXHNcXFNdKz8pLS0tLS1FTkQgT1BFTlNTSCBQUklWQVRFIEtFWS0tLS0tLy5leGVjKHRleHQpO1xuXHRpZiAoIW9wZW5TU0hLZXkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgZGF0YSA9IEJ1ZmZlci5mcm9tKG9wZW5TU0hLZXlbMV0ucmVwbGFjZSgvXFxzKy9nLCAnJyksICdiYXNlNjQnKTtcblx0Y29uc3QgbWFnaWMgPSBCdWZmZXIuZnJvbSgnb3BlbnNzaC1rZXktdjFcXDAnLCAndXRmOCcpO1xuXHRpZiAoZGF0YS5sZW5ndGggPCBtYWdpYy5sZW5ndGggfHwgIWRhdGEuc3ViYXJyYXkoMCwgbWFnaWMubGVuZ3RoKS5lcXVhbHMobWFnaWMpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGNpcGhlciA9IHJlYWRTU0hTdHJpbmcoZGF0YSwgbWFnaWMubGVuZ3RoKTtcblx0cmV0dXJuICEhY2lwaGVyICYmIGNpcGhlci52YWx1ZSAhPT0gJ25vbmUnO1xufVxuXG5mdW5jdGlvbiBzc2hFeGVjKGNsaWVudDogU1NIQ2xpZW50LCBjb21tYW5kOiBzdHJpbmcsIG9wdHM/OiB7IGlnbm9yZUV4aXRDb2RlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZzsgY29kZTogbnVtYmVyIH0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nOyBjb2RlOiBudW1iZXIgfT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNsaWVudC5leGVjKGNvbW1hbmQsIChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBzdHJlYW06IFNTSENoYW5uZWwpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHN0ZG91dCA9ICcnO1xuXHRcdFx0bGV0IHN0ZGVyciA9ICcnO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgZmluaXNoID0gKGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCwgY29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29kZSAhPT0gMCAmJiAhb3B0cz8uaWdub3JlRXhpdENvZGUpIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGBTU0ggY29tbWFuZCBmYWlsZWQgKGV4aXQgJHtjb2RlfSk6ICR7Y29tbWFuZH1cXG5zdGRlcnI6ICR7c3RkZXJyfWApKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgc3Rkb3V0LCBzdGRlcnIsIGNvZGU6IGNvZGUgPz8gMCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0c3RyZWFtLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4geyBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpOyB9KTtcblx0XHRcdHN0cmVhbS5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7IHN0ZGVyciArPSBkYXRhLnRvU3RyaW5nKCk7IH0pO1xuXHRcdFx0c3RyZWFtLm9uKCdlcnJvcicsIChzdHJlYW1FcnI6IEVycm9yKSA9PiBmaW5pc2goc3RyZWFtRXJyLCB1bmRlZmluZWQpKTtcblx0XHRcdHN0cmVhbS5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyKSA9PiBmaW5pc2godW5kZWZpbmVkLCBjb2RlKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKiogQ3JlYXRlIGEgYm91bmQgZXhlYyBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIFNTSCBjbGllbnQuICovXG5mdW5jdGlvbiBiaW5kU3NoRXhlYyhjbGllbnQ6IFNTSENsaWVudCk6IChjb21tYW5kOiBzdHJpbmcsIG9wdHM/OiB7IGlnbm9yZUV4aXRDb2RlPzogYm9vbGVhbiB9KSA9PiBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nOyBjb2RlOiBudW1iZXIgfT4ge1xuXHRyZXR1cm4gKGNvbW1hbmQsIG9wdHMpID0+IHNzaEV4ZWMoY2xpZW50LCBjb21tYW5kLCBvcHRzKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRSZW1vdGVBZ2VudEhvc3QoXG5cdGNsaWVudDogU1NIQ2xpZW50LFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0Y2xpQmluOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGNsaURhdGFEaXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0Y29tbWFuZE92ZXJyaWRlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx7IHBvcnQ6IG51bWJlcjsgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkOyBzdHJlYW06IFNTSENoYW5uZWwgfT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGlmICghY29tbWFuZE92ZXJyaWRlICYmICghY2xpQmluIHx8ICFjbGlEYXRhRGlyKSkge1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBzdGFydFJlbW90ZUFnZW50SG9zdCByZXF1aXJlcyBlaXRoZXIgYSBjbGlCaW4rY2xpRGF0YURpciBwYWlyIG9yIGEgY29tbWFuZE92ZXJyaWRlYCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYXNlQ21kID0gY29tbWFuZE92ZXJyaWRlID8/IGJ1aWxkQWdlbnRIb3N0QmFzZUNvbW1hbmQoY2xpQmluISwgY2xpRGF0YURpciEpO1xuXHRcdC8vIFdyYXAgaW4gYSBsb2dpbiBzaGVsbCBzbyB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIGluaGVyaXRzIHRoZVxuXHRcdC8vIHVzZXIncyBQQVRIIGFuZCBlbnZpcm9ubWVudCBmcm9tIH4vLmJhc2hfcHJvZmlsZSAvIH4vLmJhc2hyY1xuXHRcdC8vIChzc2gyIGV4ZWMgcnVucyBhIG5vbi1pbnRlcmFjdGl2ZSBub24tbG9naW4gc2hlbGwgYnkgZGVmYXVsdCkuXG5cdFx0Ly8gRWNobyB0aGUgUElEIHNvIHdlIGNhbiByZWNvcmQgaXQgZm9yIHByb2Nlc3MgcmV1c2UgZGV0ZWN0aW9uLlxuXHRcdGNvbnN0IGNtZCA9IGBiYXNoIC1sIC1jICR7c2hlbGxFc2NhcGUoYGVjaG8gVlNDT0RFX1BJRD0kJCAmJiBleGVjICR7YmFzZUNtZH1gKX1gO1xuXHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTdGFydGluZyByZW1vdGUgYWdlbnQgaG9zdDogJHtjbWR9YCk7XG5cblx0XHRjbGllbnQuZXhlYyhjbWQsIChlcnI6IEVycm9yIHwgdW5kZWZpbmVkLCBzdHJlYW06IFNTSENoYW5uZWwpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHRsZXQgb3V0cHV0QnVmID0gJyc7XG5cdFx0XHRsZXQgcGlkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGAke0xPR19QUkVGSVh9IFRpbWVkIG91dCB3YWl0aW5nIGZvciBhZ2VudCBob3N0IHRvIHN0YXJ0Llxcbm91dHB1dCBzbyBmYXI6ICR7cmVkYWN0VG9rZW4ob3V0cHV0QnVmKX1gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDYwXzAwMCk7XG5cblx0XHRcdGNvbnN0IGNoZWNrRm9yT3V0cHV0ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjbGVhbiA9IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhvdXRwdXRCdWYpO1xuXHRcdFx0XHRpZiAocGlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBwaWRNYXRjaCA9IGNsZWFuLm1hdGNoKC9WU0NPREVfUElEPShcXGQrKS8pO1xuXHRcdFx0XHRcdGlmIChwaWRNYXRjaCkge1xuXHRcdFx0XHRcdFx0cGlkID0gcGFyc2VJbnQocGlkTWF0Y2hbMV0sIDEwKTtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZW1vdGUgYWdlbnQgaG9zdCBQSUQ6ICR7cGlkfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IGV4dHJhY3RBZ2VudEhvc3RXZWJTb2NrZXRVUkwoY2xlYW4pO1xuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJlbW90ZSBhZ2VudCBob3N0IGxpc3RlbmluZyBvbiBwb3J0ICR7bWF0Y2gucG9ydH1gKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoeyBwb3J0OiBtYXRjaC5wb3J0LCBjb25uZWN0aW9uVG9rZW46IG1hdGNoLnRva2VuLCBwaWQsIHN0cmVhbSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHN0cmVhbS5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHRcdG91dHB1dEJ1ZiArPSB0ZXh0O1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IHJlbW90ZSBzdGRlcnI6ICR7cmVkYWN0VG9rZW4odGV4dC50cmltRW5kKCkpfWApO1xuXHRcdFx0XHRjaGVja0Zvck91dHB1dCgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN0cmVhbS5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGRhdGEudG9TdHJpbmcoKTtcblx0XHRcdFx0b3V0cHV0QnVmICs9IHRleHQ7XG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gcmVtb3RlIHN0ZG91dDogJHtyZWRhY3RUb2tlbih0ZXh0LnRyaW1FbmQoKSl9YCk7XG5cdFx0XHRcdGNoZWNrRm9yT3V0cHV0KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyZWFtLm9uKCdlcnJvcicsIChzdHJlYW1FcnI6IEVycm9yKSA9PiB7XG5cdFx0XHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0XHRcdHJlamVjdChzdHJlYW1FcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyZWFtLm9uKCdjbG9zZScsIChjb2RlOiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBBZ2VudCBob3N0IHByb2Nlc3MgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9IGJlZm9yZSBiZWNvbWluZyByZWFkeS5cXG5vdXRwdXQ6ICR7cmVkYWN0VG9rZW4ob3V0cHV0QnVmKX1gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBPcGVuIGFuIFNTSCBmb3J3YXJkZWQtb3V0IChgZGlyZWN0LXRjcGlwYCkgY2hhbm5lbCB0byBhIFRDUCBlbmRwb2ludCBvbiB0aGVcbiAqIHJlbW90ZSBob3N0IFx1MjAxNCB1c2VkIGZvciBgdGNwYC10eXBlZCBhZ2VudCBob3N0IGVuZHBvaW50cy5cbiAqL1xuZnVuY3Rpb24gb3BlbkZvcndhcmRPdXRDaGFubmVsKGNsaWVudDogU1NIQ2xpZW50LCBkc3RIb3N0OiBzdHJpbmcsIGRzdFBvcnQ6IG51bWJlcik6IFByb21pc2U8U1NIQ2hhbm5lbD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNsaWVudC5mb3J3YXJkT3V0KCcxMjcuMC4wLjEnLCAwLCBkc3RIb3N0LCBkc3RQb3J0LCAoZXJyOiBFcnJvciB8IHVuZGVmaW5lZCwgY2hhbm5lbDogU1NIQ2hhbm5lbCkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZShjaGFubmVsKTtcblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogT3BlbiBhIHJhdyBieXRlLXJlbGF5IGNoYW5uZWwgdG8gYSBgc29ja2V0YC10eXBlZCBhZ2VudCBob3N0IGVuZHBvaW50IGJ5XG4gKiBleGVjdXRpbmcgdGhlIHJlbW90ZSBDTEkncyBgYWdlbnQgcmVsYXkgPGluc3RhbmNlLWlkPmAgY29tbWFuZC4gUGVyIHRoZVxuICogQ0xJIGNvbnRyYWN0LCB0aGUgcHJvY2VzcyByZWxheXMgcmF3IGJ5dGVzIGJldHdlZW4gaXRzIHN0ZGluL3N0ZG91dCBhbmRcbiAqIHRoZSBleGFjdCBlbmRwb2ludCdzIGxpc3RlbmluZyBzb2NrZXQsIHNvIHRoZSBleGVjIHN0cmVhbSBpdHNlbGYgaXMgdGhlXG4gKiBkdXBsZXggY2hhbm5lbCBXZWJTb2NrZXQgZnJhbWluZyBydW5zIG92ZXIuXG4gKi9cbmZ1bmN0aW9uIG9wZW5SZWxheUV4ZWNDaGFubmVsKGNsaWVudDogU1NIQ2xpZW50LCBjb21tYW5kOiBzdHJpbmcsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogUHJvbWlzZTxTU0hDaGFubmVsPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y2xpZW50LmV4ZWMoY29tbWFuZCwgKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIHN0cmVhbTogU1NIQ2hhbm5lbCkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c3RyZWFtLnN0ZGVyci5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBhZ2VudCByZWxheSBzdGRlcnI6ICR7cmVkYWN0VG9rZW4oZGF0YS50b1N0cmluZygpLnRyaW1FbmQoKSl9YCk7XG5cdFx0XHR9KTtcblx0XHRcdHJlc29sdmUoc3RyZWFtKTtcblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogUnVuIFdlYlNvY2tldCBmcmFtaW5nICh2aWEgdGhlIGB3c2AgbGlicmFyeSkgb3ZlciBhbiBhbHJlYWR5LW9wZW4gZHVwbGV4XG4gKiBTU0ggY2hhbm5lbC4gU2hhcmVkIGJ5IGJvdGggYHRjcGAgKGZvcndhcmRPdXQpIGFuZCBgc29ja2V0YCAocmVsYXkgZXhlYylcbiAqIGVuZHBvaW50IGtpbmRzIHNvIHRoZXJlIGlzIGV4YWN0bHkgb25lIHBsYWNlIHRoYXQgc3BlYWtzIHRoZSBhZ2VudCBob3N0J3NcbiAqIFdlYlNvY2tldCBwcm90b2NvbC5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlV2ViU29ja2V0T3ZlckNoYW5uZWwoXG5cdG5hdGl2ZVJlcXVpcmU6IE5vZGVKUy5SZXF1aXJlLFxuXHRjaGFubmVsOiBTU0hDaGFubmVsLFxuXHR1cmxIb3N0OiBzdHJpbmcsXG5cdHVybFBvcnQ6IG51bWJlcixcblx0Y29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRvbk1lc3NhZ2U6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQsXG5cdG9uQ2xvc2U6ICgpID0+IHZvaWQsXG4pOiBQcm9taXNlPHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IFdTID0gbmF0aXZlUmVxdWlyZSgnd3MnKSBhcyB0eXBlb2YgV2ViU29ja2V0O1xuXHRcdGxldCB1cmwgPSBgd3M6Ly8ke3VybEhvc3R9OiR7dXJsUG9ydH1gO1xuXHRcdGlmIChjb25uZWN0aW9uVG9rZW4pIHtcblx0XHRcdHVybCArPSBgP3Rrbj0ke2VuY29kZVVSSUNvbXBvbmVudChjb25uZWN0aW9uVG9rZW4pfWA7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIFNTSCBjaGFubmVsIChvciByZWxheSBleGVjIHN0cmVhbSkgaXMgYSBkdXBsZXggc3RyZWFtIGNvbXBhdGlibGVcblx0XHQvLyB3aXRoIHdzJ3MgY3JlYXRlQ29ubmVjdGlvbiwgYnV0IG91ciBtaW5pbWFsIFNTSENoYW5uZWwgaW50ZXJmYWNlXG5cdFx0Ly8gZG9lc24ndCBjYXJyeSB0aGUgZnVsbCBOb2RlIER1cGxleCBzaGFwZS5cblx0XHRjb25zdCB3cyA9IG5ldyBXUyh1cmwsIHsgY3JlYXRlQ29ubmVjdGlvbjogKCgpID0+IGNoYW5uZWwpIGFzIHVua25vd24gYXMgV2ViU29ja2V0LkNsaWVudE9wdGlvbnNbJ2NyZWF0ZUNvbm5lY3Rpb24nXSB9KTtcblxuXHRcdHdzLm9uKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFdlYlNvY2tldCByZWxheSBjb25uZWN0ZWQgdG8gcmVtb3RlIGFnZW50IGhvc3RgKTtcblx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHdzLnJlYWR5U3RhdGUgPT09IHdzLk9QRU4pIHtcblx0XHRcdFx0XHRcdHdzLnNlbmQoZGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjbG9zZTogKCkgPT4gd3MuY2xvc2UoKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0d3Mub24oJ21lc3NhZ2UnLCAoZGF0YTogV2ViU29ja2V0LlJhd0RhdGEpID0+IHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0XHRcdG9uTWVzc2FnZShCdWZmZXIuY29uY2F0KGRhdGEpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSBlbHNlIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0b25NZXNzYWdlKEJ1ZmZlci5mcm9tKG5ldyBVaW50OEFycmF5KGRhdGEpKS50b1N0cmluZygpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9uTWVzc2FnZShkYXRhLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0d3Mub24oJ2Nsb3NlJywgb25DbG9zZSk7XG5cblx0XHR3cy5vbignZXJyb3InLCAod3NFcnI6IHVua25vd24pID0+IHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBXZWJTb2NrZXQgcmVsYXkgZXJyb3I6ICR7d3NFcnIgaW5zdGFuY2VvZiBFcnJvciA/IHdzRXJyLm1lc3NhZ2UgOiBTdHJpbmcod3NFcnIpfWApO1xuXHRcdFx0cmVqZWN0KHdzRXJyKTtcblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgV2ViU29ja2V0IHJlbGF5IHRvIGFuIGV4YWN0IGFnZW50IGhvc3QgZW5kcG9pbnQuIFN1cHBvcnRzIGJvdGhcbiAqIGB0Y3BgIGVuZHBvaW50cyAodmlhIFNTSCBgZm9yd2FyZE91dGApIGFuZCBgc29ja2V0YCBlbmRwb2ludHMgKHZpYSB0aGVcbiAqIHJlbW90ZSBDTEkncyBgYWdlbnQgcmVsYXlgIHJhdyBieXRlIHJlbGF5KTsgdGhlIFdlYlNvY2tldCBmcmFtaW5nIGl0c2VsZlxuICogcnVucyBpZGVudGljYWxseSBvdmVyIGVpdGhlciBjaGFubmVsIGtpbmQuIEtlZXBzIGEgc2luZ2xlIFNTSCBjbGllbnQgZm9yXG4gKiBib3RoIGRpc2NvdmVyeSBhbmQgdGhlIGRhdGEgY2hhbm5lbC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlV2ViU29ja2V0UmVsYXlGb3JFbmRwb2ludChcblx0bmF0aXZlUmVxdWlyZTogTm9kZUpTLlJlcXVpcmUsXG5cdGNsaWVudDogU1NIQ2xpZW50LFxuXHRlbmRwb2ludDogQWdlbnRIb3N0RW5kcG9pbnRBZGRyZXNzLFxuXHRyZWxheUNsaUJpbjogc3RyaW5nLFxuXHRyZWxheUNsaURhdGFEaXI6IHN0cmluZyxcblx0cmVsYXlJbnN0YW5jZUlkOiBzdHJpbmcsXG5cdHJlbGF5VXNlckRhdGFQYXRoOiBzdHJpbmcsXG5cdGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0b25NZXNzYWdlOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkLFxuXHRvbkNsb3NlOiAoKSA9PiB2b2lkLFxuKTogUHJvbWlzZTx7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0+IHtcblx0bGV0IGNoYW5uZWw6IFNTSENoYW5uZWw7XG5cdGxldCB1cmxIb3N0OiBzdHJpbmc7XG5cdGxldCB1cmxQb3J0OiBudW1iZXI7XG5cdGlmIChlbmRwb2ludC50eXBlID09PSAndGNwJykge1xuXHRcdGNoYW5uZWwgPSBhd2FpdCBvcGVuRm9yd2FyZE91dENoYW5uZWwoY2xpZW50LCBlbmRwb2ludC5ob3N0LCBlbmRwb2ludC5wb3J0KTtcblx0XHR1cmxIb3N0ID0gZW5kcG9pbnQuaG9zdDtcblx0XHR1cmxQb3J0ID0gZW5kcG9pbnQucG9ydDtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBjb21tYW5kID0gYnVpbGRBZ2VudFJlbGF5Q29tbWFuZChyZWxheUNsaUJpbiwgcmVsYXlDbGlEYXRhRGlyLCByZWxheUluc3RhbmNlSWQsIHJlbGF5VXNlckRhdGFQYXRoKTtcblx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gT3BlbmluZyBhZ2VudCByZWxheSBjaGFubmVsOiAke2NvbW1hbmR9YCk7XG5cdFx0Y2hhbm5lbCA9IGF3YWl0IG9wZW5SZWxheUV4ZWNDaGFubmVsKGNsaWVudCwgY29tbWFuZCwgbG9nU2VydmljZSk7XG5cdFx0Ly8gVGhlIHJlbGF5IGV4ZWMgc3RyZWFtIGJ5cGFzc2VzIHJlYWwgVENQIGRpYWxpbmcgZW50aXJlbHkgKHRoZVxuXHRcdC8vIGBjcmVhdGVDb25uZWN0aW9uYCBvdmVycmlkZSBhYm92ZSksIHNvIHRoaXMgaG9zdC9wb3J0IHBhaXIgaXMgbmV2ZXJcblx0XHQvLyBhY3R1YWxseSBkaWFsZWQgXHUyMDE0IGl0IG9ubHkgbmVlZHMgdG8gZm9ybSBhIHN5bnRhY3RpY2FsbHkgdmFsaWRcblx0XHQvLyBgd3M6Ly9gIFVSTCBmb3IgdGhlIGB3c2AgbGlicmFyeSB0byBwYXJzZS5cblx0XHR1cmxIb3N0ID0gJzEyNy4wLjAuMSc7XG5cdFx0dXJsUG9ydCA9IDE7XG5cdH1cblx0cmV0dXJuIGNyZWF0ZVdlYlNvY2tldE92ZXJDaGFubmVsKG5hdGl2ZVJlcXVpcmUsIGNoYW5uZWwsIHVybEhvc3QsIHVybFBvcnQsIGNvbm5lY3Rpb25Ub2tlbiwgbG9nU2VydmljZSwgb25NZXNzYWdlLCBvbkNsb3NlKTtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVDb25maWcoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogSVNTSEFnZW50SG9zdENvbmZpZ1Nhbml0aXplZCB7XG5cdGNvbnN0IHsgcGFzc3dvcmQ6IF9wLCBwcml2YXRlS2V5UGF0aDogX2ssIC4uLnNhbml0aXplZCB9ID0gY29uZmlnO1xuXHRyZXR1cm4gc2FuaXRpemVkO1xufVxuXG4vKipcbiAqIFN0YXRlIGZvciBhIHNpbmdsZSBhY3RpdmUgU1NIIHJlbGF5IGNvbm5lY3Rpb24uXG4gKiBJbW11dGFibGUgYW5kIGRpc3Bvc2Utb25jZSBcdTIwMTQgZm9sbG93cyB0aGUgc2FtZSBwYXR0ZXJuIGFzIFR1bm5lbENvbm5lY3Rpb24uXG4gKiBPbiByZWNvbm5lY3QsIHRoZSBvbGQgU1NIQ29ubmVjdGlvbiBpcyBkaXNwb3NlZCBhbmQgYSBmcmVzaCBvbmUgaXMgY3JlYXRlZDtcbiAqIHRoZSBTU0ggY2xpZW50IGNhbiBiZSBkZXRhY2hlZCBmaXJzdCBzbyBvbmx5IHRoZSBXZWJTb2NrZXQgcmVsYXkgaXMgdG9ybiBkb3duLlxuICovXG5jbGFzcyBTU0hDb25uZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRyZWFkb25seSBjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWdTYW5pdGl6ZWQ7XG5cdHByaXZhdGUgX2Nsb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9zc2hDbGllbnREZXRhY2hlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zc2hDbG9zZUxpc3RlbmVyID0gKCkgPT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTU0ggY2xpZW50IGNsb3NlZCBmb3IgY29ubmVjdGlvbiAke3RoaXMuY29ubmVjdGlvbklkfSAoYWRkcmVzcyAke3RoaXMuYWRkcmVzc30pOyBkaXNwb3NpbmcgY29ubmVjdGlvbmApO1xuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHR9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zc2hFcnJvckxpc3RlbmVyID0gKGVycj86IEVycm9yKSA9PiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNTSCBjbGllbnQgZXJyb3IgZm9yIGNvbm5lY3Rpb24gJHt0aGlzLmNvbm5lY3Rpb25JZH0gKGFkZHJlc3MgJHt0aGlzLmFkZHJlc3N9KTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9OyBkaXNwb3NpbmcgY29ubmVjdGlvbmApO1xuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGZ1bGxDb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcsXG5cdFx0cmVhZG9ubHkgY29ubmVjdGlvbklkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgYWRkcmVzczogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRyZWFkb25seSBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHQvKiogRXhhY3QgZW5kcG9pbnQgYWRkcmVzcyAoVENQIGhvc3QvcG9ydCBvciByZW1vdGUgc29ja2V0IHBhdGgpIHRoaXMgY29ubmVjdGlvbiBpcyBhdHRhY2hlZCB0by4gKi9cblx0XHRyZWFkb25seSBlbmRwb2ludDogQWdlbnRIb3N0RW5kcG9pbnRBZGRyZXNzLFxuXHRcdC8qKiBSZWdpc3RyeS1kaXNjb3ZlcmVkIHNlcnZlciB0eXBlLCB3aGVuIGtub3duICh1bnNldCBmb3IgdGhlIGByZW1vdGVBZ2VudEhvc3RDb21tYW5kYCBvdmVycmlkZSBwYXRoKS4gKi9cblx0XHRyZWFkb25seSBzZXJ2ZXJUeXBlOiBBZ2VudEhvc3RTZXJ2ZXJUeXBlIHwgdW5kZWZpbmVkLFxuXHRcdC8qKiBSZWdpc3RyeSBgaW5zdGFuY2VJZGAsIHdoZW4ga25vd24gKGAnb3ZlcnJpZGUnYCBzZW50aW5lbCBmb3IgdGhlIGByZW1vdGVBZ2VudEhvc3RDb21tYW5kYCBvdmVycmlkZSBwYXRoKS4gKi9cblx0XHRyZWFkb25seSBpbnN0YW5jZUlkOiBzdHJpbmcsXG5cdFx0LyoqIFdoZXRoZXIgdGhpcyBkZXNrdG9wIHNwYXduZWQgdGhlIGJhY2tpbmcgcHJvY2VzcyAoYG1hbmFnZWRgKSBvciBhdHRhY2hlZCB0byBvbmUgYWxyZWFkeSBydW5uaW5nIChgZXh0ZXJuYWxgKS4gKi9cblx0XHRyZWFkb25seSBsaWZlY3ljbGU6IFNTSEFnZW50SG9zdExpZmVjeWNsZSxcblx0XHQvKiogUmVzb2x2ZWQgcmVtb3RlIENMSSBiaW5hcnkgcGF0aDsgZW1wdHkgZm9yIHRoZSBgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZGAgb3ZlcnJpZGUgcGF0aCAobm90IGFwcGxpY2FibGUpLiAqL1xuXHRcdHJlYWRvbmx5IGNsaUJpbjogc3RyaW5nLFxuXHRcdC8qKiBSZXNvbHZlZCByZW1vdGUgQ0xJIGRhdGEgZGlyOyBlbXB0eSBmb3IgdGhlIGByZW1vdGVBZ2VudEhvc3RDb21tYW5kYCBvdmVycmlkZSBwYXRoIChub3QgYXBwbGljYWJsZSkuICovXG5cdFx0cmVhZG9ubHkgY2xpRGF0YURpcjogc3RyaW5nLFxuXHRcdC8qKiBSZW1vdGUgdXNlci1kYXRhIHBhdGggdGhlIGVuZHBvaW50IHJlZ2lzdHJ5IHdhcyByZXNvbHZlZCBhZ2FpbnN0OyBlbXB0eSBmb3IgdGhlIGByZW1vdGVBZ2VudEhvc3RDb21tYW5kYCBvdmVycmlkZSBwYXRoIChub3QgYXBwbGljYWJsZSkuICovXG5cdFx0cmVhZG9ubHkgdXNlckRhdGFQYXRoOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgc3NoQ2xpZW50OiBTU0hDbGllbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVsYXk6IHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVTdHJlYW06IFNTSENoYW5uZWwgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNvbmZpZyA9IHNhbml0aXplQ29uZmlnKGZ1bGxDb25maWcpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgY2xlYW51cCBmaXJzdCBzbyBpdCBmaXJlcyBfb25EaWRDbG9zZSAqYmVmb3JlKiB0aGUgRW1pdHRlciBpcyBkaXNwb3NlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2Nsb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbG9zZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcmVsYXkuY2xvc2UoKTtcblx0XHRcdGlmICghdGhpcy5fc3NoQ2xpZW50RGV0YWNoZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3RlU3RyZWFtPy5jbG9zZSgpO1xuXHRcdFx0XHRzc2hDbGllbnQuZW5kKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZENsb3NlKTtcblxuXHRcdHNzaENsaWVudC5vbignY2xvc2UnLCB0aGlzLl9zc2hDbG9zZUxpc3RlbmVyKTtcblx0XHRzc2hDbGllbnQub24oJ2Vycm9yJywgdGhpcy5fc3NoRXJyb3JMaXN0ZW5lcik7XG5cdH1cblxuXHQvKipcblx0ICogRGV0YWNoIHRoZSBTU0ggY2xpZW50IGZyb20gdGhpcyBjb25uZWN0aW9uIHNvIHRoYXQgYGRpc3Bvc2UoKWBcblx0ICogb25seSBjbG9zZXMgdGhlIFdlYlNvY2tldCByZWxheSB3aXRob3V0IGVuZGluZyB0aGUgU1NIIHNlc3Npb24uXG5cdCAqIEFsc28gcmVtb3ZlcyBldmVudCBsaXN0ZW5lcnMgZnJvbSB0aGUgU1NIIGNsaWVudCBzbyB0aGUgb2xkXG5cdCAqIGNvbm5lY3Rpb24gb2JqZWN0IGlzIG5vdCByZXRhaW5lZCBieSB0aGUgc2hhcmVkIGNsaWVudC5cblx0ICovXG5cdGRldGFjaFNzaENsaWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zc2hDbGllbnREZXRhY2hlZCA9IHRydWU7XG5cdFx0dGhpcy5zc2hDbGllbnQucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgdGhpcy5fc3NoQ2xvc2VMaXN0ZW5lcik7XG5cdFx0dGhpcy5zc2hDbGllbnQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgdGhpcy5fc3NoRXJyb3JMaXN0ZW5lcik7XG5cdH1cblxuXHRyZWxheVNlbmQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVsYXkuc2VuZChkYXRhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZUNvbm5lY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlQ29ubmVjdGlvbjogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNTSENvbm5lY3RQcm9ncmVzcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBFdmVudDxJU1NIQ29ubmVjdFByb2dyZXNzPiA9IHRoaXMuX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVsYXlNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlbGF5TWVzc2FnZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVsYXlNZXNzYWdlOiBFdmVudDxJUmVsYXlNZXNzYWdlPiA9IHRoaXMuX29uRGlkUmVsYXlNZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVsYXlDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVsYXlDbG9zZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkUmVsYXlDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RLZXlib2FyZEludGVyYWN0aXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZTogRXZlbnQ8SVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0PiA9IHRoaXMuX29uRGlkUmVxdWVzdEtleWJvYXJkSW50ZXJhY3RpdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uOiBFdmVudDxJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0PiA9IHRoaXMuX29uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2FuY2VsRW5kcG9pbnRTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENhbmNlbEVuZHBvaW50U2VsZWN0aW9uOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRDYW5jZWxFbmRwb2ludFNlbGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RIb3N0S2V5VmVyaWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbjogRXZlbnQ8SVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0PiA9IHRoaXMuX29uRGlkUmVxdWVzdEhvc3RLZXlWZXJpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQW5ub3VuY2VIb3N0S2V5cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTU0hIb3N0S2V5c0Fubm91bmNlbWVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQW5ub3VuY2VIb3N0S2V5czogRXZlbnQ8SVNTSEhvc3RLZXlzQW5ub3VuY2VtZW50PiA9IHRoaXMuX29uRGlkQW5ub3VuY2VIb3N0S2V5cy5ldmVudDtcblxuXHQvKipcblx0ICogUGVuZGluZyBrZXlib2FyZC1pbnRlcmFjdGl2ZSBwcm9tcHRzIGF3YWl0aW5nIGEgcmVzcG9uc2UgZnJvbSB0aGUgcmVuZGVyZXIuXG5cdCAqIEtleWVkIGJ5IGByZXF1ZXN0SWRgLiBFYWNoIGVudHJ5IGNhbiBlaXRoZXIgZmluaXNoIHRoZSBzc2gyIHByb21wdCB3aXRoXG5cdCAqIHJlc3BvbnNlcyBvciBjYW5jZWwgdGhlIG93bmluZyBjb25uZWN0IGF0dGVtcHQgd2hlbiB0aGUgdXNlciBkaXNtaXNzZXMgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nS2JpUmVxdWVzdHMgPSBuZXcgTWFwPHN0cmluZywgeyBmaW5pc2g6IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB2b2lkOyBjYW5jZWxDb25uZWN0OiAoKSA9PiB2b2lkIH0+KCk7XG5cdHByaXZhdGUgX2tiaVJlcXVlc3RDb3VudGVyID0gMDtcblxuXHQvKipcblx0ICogUGVuZGluZyBlbmRwb2ludC1zZWxlY3Rpb24gcHJvbXB0cyBhd2FpdGluZyBhIHJlc3BvbnNlIGZyb20gdGhlXG5cdCAqIHJlbmRlcmVyLiBLZXllZCBieSBgcmVxdWVzdElkYDsgcmVzb2x2ZWQgd2l0aCB0aGUgdXNlcidzIGNob2ljZSwgb3Jcblx0ICogYHVuZGVmaW5lZGAgb24gY2FuY2VsbGF0aW9uIChyZWplY3RzIHRoZSBvd25pbmcgY29ubmVjdCBhdHRlbXB0KS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdFbmRwb2ludFNlbGVjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgKHNlbGVjdGlvbjogSVNTSEVuZHBvaW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB2b2lkPigpO1xuXHRwcml2YXRlIF9lbmRwb2ludFNlbGVjdGlvbkNvdW50ZXIgPSAwO1xuXG5cdC8qKlxuXHQgKiBQZW5kaW5nIGhvc3Qga2V5IHZlcmlmaWNhdGlvbnMgYXdhaXRpbmcgYSB2ZXJkaWN0IGZyb20gdGhlIHJlbmRlcmVyLFxuXHQgKiBrZXllZCBieSBgcmVxdWVzdElkYC4gRXZlcnkgZW50cnkgbXVzdCBldmVudHVhbGx5IGJlIHNldHRsZWQgXHUyMDE0IGxlYXZpbmdcblx0ICogb25lIHVuYW5zd2VyZWQgc3VzcGVuZHMgdGhlIFNTSCBoYW5kc2hha2UgdW50aWwgdGhlIGRlYWRsaW5lIGVsYXBzZXMuXG5cdCAqXG5cdCAqIGBvblVzZXJEZW5pZWRgIGxldHMgdGhlIG93bmluZyBjb25uZWN0IGF0dGVtcHQgZGlzdGluZ3Vpc2ggXCJ0aGUgcmVuZGVyZXJcblx0ICogcmVmdXNlZCB0aGlzIGtleVwiIGZyb20gYW55IG90aGVyIGhhbmRzaGFrZSBmYWlsdXJlLCBzbyBpdCBjYW4gc3VyZmFjZSBhXG5cdCAqIGNsZWFuIGVycm9yIGluc3RlYWQgb2Ygc3NoMidzIGludGVybmFsIHdvcmRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nSG9zdEtleVJlcXVlc3RzID0gbmV3IE1hcDxzdHJpbmcsIHsgdmVyaWZ5OiAodHJ1c3RlZDogYm9vbGVhbikgPT4gdm9pZDsgb25Vc2VyRGVuaWVkPzogKCkgPT4gdm9pZCB9PigpO1xuXHRwcml2YXRlIF9ob3N0S2V5UmVxdWVzdENvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBTU0hDb25uZWN0aW9uPigpKTtcblxuXHRwcml2YXRlIF9uYXRpdmVSZXF1aXJlOiBOb2RlSlMuUmVxdWlyZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogT3ZlcnJpZGUgaG9vayBmb3IgdGVzdHMgdG8gc2hvcnRlbiB0aGUgcmVsYXktY3JlYXRpb24gdGltZW91dCB1c2VkIG9uXG5cdCAqIHRoZSBgcmVwbGFjZVJlbGF5YCByZWNvbm5lY3QgcGF0aC4gU2VlIHtAbGluayBSRUNPTk5FQ1RfUkVMQVlfVElNRU9VVF9NU30uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVsYXlDcmVhdGlvblRpbWVvdXRNczogbnVtYmVyID0gUkVDT05ORUNUX1JFTEFZX1RJTUVPVVRfTVM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXppbHkgbG9hZCBhIGByZXF1aXJlYCBmdW5jdGlvbiBmb3IgbmF0aXZlIG1vZHVsZXMgKGBzc2gyYCwgYHdzYCkuXG5cdCAqIFVzZXMgYSBkeW5hbWljIGBpbXBvcnQoJ25vZGU6bW9kdWxlJylgIHNvIHRoZSBtb2R1bGUgaXMgb25seSByZXNvbHZlZFxuXHQgKiB3aGVuIGFjdHVhbGx5IG5lZWRlZCBhdCBydW50aW1lIFx1MjAxNCBub3QgYXQgZmlsZS1sb2FkIHRpbWUuIFRoaXMgbWF0dGVyc1xuXHQgKiBiZWNhdXNlIHRlc3RzIG92ZXJyaWRlIHRoZSBtZXRob2RzIHRoYXQgY2FsbCB0aGlzIGFuZCBuZXZlciB0cmlnZ2VyXG5cdCAqIHRoZSBpbXBvcnQsIGF2b2lkaW5nIGlzc3VlcyB3aXRoIEVsZWN0cm9uJ3MgRVNNIGxvYWRlciB3aGljaCBjYW5ub3Rcblx0ICogcmVzb2x2ZSBgbm9kZTpgIHNwZWNpZmllcnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9nZXROYXRpdmVSZXF1aXJlKCk6IFByb21pc2U8Tm9kZUpTLlJlcXVpcmU+IHtcblx0XHRpZiAoIXRoaXMuX25hdGl2ZVJlcXVpcmUpIHtcblx0XHRcdGNvbnN0IG5vZGVNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ25vZGU6bW9kdWxlJyk7XG5cdFx0XHR0aGlzLl9uYXRpdmVSZXF1aXJlID0gbm9kZU1vZHVsZS5jcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9uYXRpdmVSZXF1aXJlO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdChjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcsIHJlcGxhY2VSZWxheT86IGJvb2xlYW4pOiBQcm9taXNlPElTU0hDb25uZWN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbktleSA9IGNvbXB1dGVTU0hDb25uZWN0aW9uS2V5KGNvbmZpZyk7XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uS2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGlmIChyZXBsYWNlUmVsYXkpIHtcblx0XHRcdFx0Ly8gVGVhciBkb3duIHRoZSBvbGQgcmVsYXkgYW5kIGNyZWF0ZSBhIGZyZXNoIG9uZSwgZm9sbG93aW5nXG5cdFx0XHRcdC8vIHRoZSBzYW1lIGRpc3Bvc2UtYW5kLXJlY3JlYXRlIHBhdHRlcm4gYXMgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UuXG5cdFx0XHRcdC8vIFRoZSBTU0ggY2xpZW50IGlzIGRldGFjaGVkIHNvIG9ubHkgdGhlIFdlYlNvY2tldCByZWxheSBpcyBjbG9zZWQuXG5cdFx0XHRcdC8vIFRoaXMgcmVjb25uZWN0IHBhdGggZGVsaWJlcmF0ZWx5IGRvZXMgTk9UIHJlcnVuIGVuZHBvaW50XG5cdFx0XHRcdC8vIGRpc2NvdmVyeS9zZWxlY3Rpb246IGl0IHJlYXR0YWNoZXMgdG8gdGhlIGV4YWN0IHNhbWUgZW5kcG9pbnRcblx0XHRcdFx0Ly8gdGhpcyBjb25uZWN0aW9uIHdhcyBhbHJlYWR5IHVzaW5nLCBzbyBhIGRyb3BwZWQgU1NIIHR1bm5lbCBjYW5cblx0XHRcdFx0Ly8gbmV2ZXIgc2lsZW50bHkgcHJvbW90ZSBhIGRpZmZlcmVudCBjYW5kaWRhdGUgb3Igc3Bhd24gYVxuXHRcdFx0XHQvLyBkdXBsaWNhdGUgc3RhbmRhbG9uZSAocmVxdWlyZW1lbnQgNykuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZWNvbm5lY3RpbmcgcmVsYXkgZm9yIGV4aXN0aW5nIFNTSCB0dW5uZWwgJHtjb25uZWN0aW9uS2V5fWApO1xuXHRcdFx0XHRjb25zdCB7IHNzaENsaWVudCwgZW5kcG9pbnQsIGNvbm5lY3Rpb25Ub2tlbiwgc2VydmVyVHlwZSwgaW5zdGFuY2VJZCwgbGlmZWN5Y2xlLCBjbGlCaW4sIGNsaURhdGFEaXIsIHVzZXJEYXRhUGF0aCB9ID0gZXhpc3Rpbmc7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIGZyb20gbWFwIGFuZCBkZXRhY2ggU1NIIGNsaWVudCBiZWZvcmUgZGlzcG9zaW5nIHNvXG5cdFx0XHRcdC8vIHRoZSBvbGQgcmVsYXkncyBjbG9zZSBoYW5kbGVyIChjb25uPy5kaXNwb3NlKCkpIGlzIGEgbm8tb3AuXG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZUFuZExlYWsoY29ubmVjdGlvbktleSk7XG5cdFx0XHRcdGV4aXN0aW5nLmRldGFjaFNzaENsaWVudCgpO1xuXHRcdFx0XHRleGlzdGluZy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0Ly8gQ3JlYXRlIGZyZXNoIHJlbGF5IGFuZCBjb25uZWN0aW9uLiBJZiByZWxheSBjcmVhdGlvbiBmYWlscyxcblx0XHRcdFx0Ly8gY2xlYW4gdXAgdGhlIGRldGFjaGVkIFNTSCBjbGllbnQgc28gaXQgZG9lc24ndCBsZWFrLlxuXHRcdFx0XHRjb25zdCBjb25uZWN0aW9uSWQgPSBjb25uZWN0aW9uS2V5O1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGxldCBjb25uOiBTU0hDb25uZWN0aW9uIHwgdW5kZWZpbmVkOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIHByZWZlci1jb25zdFxuXHRcdFx0XHRcdC8vIEJvdW5kIHRoZSByZWxheSBjcmVhdGlvbjogYSBzaWxlbnRseSBkZWFkIFNTSCBjbGllbnRcblx0XHRcdFx0XHQvLyAoVENQIGhhbGYtb3Blbiwgc3NoMiBrZWVwYWxpdmUgaGFzbid0IGZpcmVkIHlldCkgY2FuXG5cdFx0XHRcdFx0Ly8gbGVhdmUgZm9yd2FyZE91dCdzIGNhbGxiYWNrIHVuZmlyZWQsIGhhbmdpbmcgdGhlIHdob2xlXG5cdFx0XHRcdFx0Ly8gcHJvbWlzZSBjaGFpbi4gcmFjZVRpbWVvdXQgcmV0dXJucyB1bmRlZmluZWQgb24gdGltZW91dC5cblx0XHRcdFx0XHRjb25zdCB0aW1lb3V0TXMgPSB0aGlzLnJlbGF5Q3JlYXRpb25UaW1lb3V0TXM7XG5cdFx0XHRcdFx0Y29uc3QgcmVsYXkgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZVdlYlNvY2tldFJlbGF5KFxuXHRcdFx0XHRcdFx0XHRzc2hDbGllbnQsIGVuZHBvaW50LCBjbGlCaW4sIGNsaURhdGFEaXIsIGluc3RhbmNlSWQsIHVzZXJEYXRhUGF0aCwgY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdFx0XHQoZGF0YTogc3RyaW5nKSA9PiB0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5maXJlKHsgY29ubmVjdGlvbklkLCBkYXRhIH0pLFxuXHRcdFx0XHRcdFx0XHQoKSA9PiB7IGNvbm4/LmRpc3Bvc2UoKTsgfSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHR0aW1lb3V0TXMsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAoIXJlbGF5KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNTSCByZWxheSBjcmVhdGlvbiB0aW1lZCBvdXQgYWZ0ZXIgJHt0aW1lb3V0TXN9bXMgKFNTSCBjbGllbnQgYXBwZWFycyB1bnJlc3BvbnNpdmUpYCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29ubiA9IG5ldyBTU0hDb25uZWN0aW9uKFxuXHRcdFx0XHRcdFx0Y29uZmlnLCBjb25uZWN0aW9uSWQsIGNvbm5lY3Rpb25LZXksIGNvbmZpZy5uYW1lLFxuXHRcdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuLCBlbmRwb2ludCwgc2VydmVyVHlwZSwgaW5zdGFuY2VJZCwgbGlmZWN5Y2xlLCBjbGlCaW4sIGNsaURhdGFEaXIsIHVzZXJEYXRhUGF0aCxcblx0XHRcdFx0XHRcdHNzaENsaWVudCwgcmVsYXksIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdEV2ZW50Lm9uY2UoY29ubi5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25LZXkpID09PSBjb25uKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoY29ubmVjdGlvbktleSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkUmVsYXlDbG9zZS5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5zZXQoY29ubmVjdGlvbktleSwgY29ubik7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29ubmVjdGlvbklkOiBjb25uLmNvbm5lY3Rpb25JZCxcblx0XHRcdFx0XHRcdGFkZHJlc3M6IGNvbm4uYWRkcmVzcyxcblx0XHRcdFx0XHRcdG5hbWU6IGNvbm4ubmFtZSxcblx0XHRcdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogY29ubi5jb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdFx0XHRjb25maWc6IGNvbm4uY29uZmlnLFxuXHRcdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogY29uZmlnLnNzaENvbmZpZ0hvc3QsXG5cdFx0XHRcdFx0XHRzZXJ2ZXJUeXBlOiBjb25uLnNlcnZlclR5cGUsXG5cdFx0XHRcdFx0XHRpbnN0YW5jZUlkOiBjb25uLmluc3RhbmNlSWQsXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdFx0bGlmZWN5Y2xlOiBjb25uLmxpZmVjeWNsZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRzc2hDbGllbnQuZW5kKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWxheUNsb3NlLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbm5lY3Rpb25JZDogZXhpc3RpbmcuY29ubmVjdGlvbklkLFxuXHRcdFx0XHRhZGRyZXNzOiBleGlzdGluZy5hZGRyZXNzLFxuXHRcdFx0XHRuYW1lOiBleGlzdGluZy5uYW1lLFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW46IGV4aXN0aW5nLmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29uZmlnOiBleGlzdGluZy5jb25maWcsXG5cdFx0XHRcdHNzaENvbmZpZ0hvc3Q6IGNvbmZpZy5zc2hDb25maWdIb3N0LFxuXHRcdFx0XHRzZXJ2ZXJUeXBlOiBleGlzdGluZy5zZXJ2ZXJUeXBlLFxuXHRcdFx0XHRpbnN0YW5jZUlkOiBleGlzdGluZy5pbnN0YW5jZUlkLFxuXHRcdFx0XHRwcmltYXJ5OiB0cnVlLFxuXHRcdFx0XHRsaWZlY3ljbGU6IGV4aXN0aW5nLmxpZmVjeWNsZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9ICR7cmVwbGFjZVJlbGF5ID8gJ1JlY29ubmVjdGluZycgOiAnQ29ubmVjdGluZyd9IHRvICR7Y29ubmVjdGlvbktleX1gKTtcblx0XHRjb25zdCBkaXNwbGF5SG9zdCA9IGNvbmZpZy5zc2hDb25maWdIb3N0ID8/IGAke2NvbmZpZy51c2VybmFtZX1AJHtjb25maWcuaG9zdH1gO1xuXHRcdGxldCBzc2hDbGllbnQ6IFNTSENsaWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXBvcnRQcm9ncmVzcyA9IChtZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3MuZmlyZSh7IGNvbm5lY3Rpb25LZXksIG1lc3NhZ2UgfSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyAxLiBFc3RhYmxpc2ggU1NIIGNvbm5lY3Rpb25cblx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdzc2hQcm9ncmVzc0Nvbm5lY3RpbmcnLCBcIkVzdGFibGlzaGluZyBTU0ggY29ubmVjdGlvbi4uLlwiKSk7XG5cdFx0XHRzc2hDbGllbnQgPSBhd2FpdCB0aGlzLl9jb25uZWN0U1NIKGNvbmZpZywgY29ubmVjdGlvbktleSk7XG5cblx0XHRcdGxldCBlbmRwb2ludDogQWdlbnRIb3N0RW5kcG9pbnRBZGRyZXNzO1xuXHRcdFx0bGV0IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHNlcnZlclR5cGU6IEFnZW50SG9zdFNlcnZlclR5cGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaW5zdGFuY2VJZDogc3RyaW5nO1xuXHRcdFx0bGV0IGxpZmVjeWNsZTogU1NIQWdlbnRIb3N0TGlmZWN5Y2xlO1xuXHRcdFx0bGV0IGNsaUJpbiA9ICcnO1xuXHRcdFx0bGV0IGNsaURhdGFEaXIgPSAnJztcblx0XHRcdGxldCB1c2VyRGF0YVBhdGggPSAnJztcblx0XHRcdGxldCBhZ2VudFN0cmVhbTogU1NIQ2hhbm5lbCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKGNvbmZpZy5yZW1vdGVBZ2VudEhvc3RDb21tYW5kKSB7XG5cdFx0XHRcdC8vIERldiBvdmVycmlkZTogYSBjdXN0b20gY29tbWFuZCBieXBhc3NlcyB0aGUgc2hhcmVkIGVuZHBvaW50XG5cdFx0XHRcdC8vIHJlZ2lzdHJ5IGVudGlyZWx5IFx1MjAxNCB0aGVyZSBpcyBubyByZXNvbHZlZCBDTEkgYmluYXJ5IHRvIHJ1blxuXHRcdFx0XHQvLyBgYWdlbnQgZW5kcG9pbnRzYCB3aXRoLCBhbmQgdGhlIG92ZXJyaWRlIGNvbW1hbmQgbmVlZCBub3Rcblx0XHRcdFx0Ly8gZXZlbiBiZSBvdXIgQ0xJIFx1MjAxNCBzbyB0aGVyZSBpcyBub3RoaW5nIHRvIGRpc2NvdmVyIG9yIG9mZmVyIGFcblx0XHRcdFx0Ly8gcGlja2VyIG92ZXIuIEFsd2F5cyBzdGFydCBhIGZyZXNoIHByb2Nlc3MgKHJlcXVpcmVtZW50IDYpLlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVXNpbmcgY3VzdG9tIGFnZW50IGhvc3QgY29tbWFuZDogJHtjb25maWcucmVtb3RlQWdlbnRIb3N0Q29tbWFuZH07IHNraXBwaW5nIGVuZHBvaW50IGRpc2NvdmVyeS9zZWxlY3Rpb25gKTtcblx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzU3RhcnRpbmdBZ2VudCcsIFwiU3RhcnRpbmcgcmVtb3RlIGFnZW50IGhvc3QuLi5cIikpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9zdGFydFJlbW90ZUFnZW50SG9zdChzc2hDbGllbnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjb25maWcucmVtb3RlQWdlbnRIb3N0Q29tbWFuZCk7XG5cdFx0XHRcdGVuZHBvaW50ID0geyB0eXBlOiAndGNwJywgaG9zdDogJzEyNy4wLjAuMScsIHBvcnQ6IHJlc3VsdC5wb3J0IH07XG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbiA9IHJlc3VsdC5jb25uZWN0aW9uVG9rZW47XG5cdFx0XHRcdGFnZW50U3RyZWFtID0gcmVzdWx0LnN0cmVhbTtcblx0XHRcdFx0c2VydmVyVHlwZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aW5zdGFuY2VJZCA9ICdvdmVycmlkZSc7XG5cdFx0XHRcdGxpZmVjeWNsZSA9ICdtYW5hZ2VkJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIDIuIFJlc29sdmUgdGhlIHJlbW90ZSBDTEkgZmlyc3QgXHUyMDE0IGV2ZXJ5IHJlZ2lzdHJ5IGNvbW1hbmRcblx0XHRcdFx0Ly8gKGBhZ2VudCBlbmRwb2ludHNgL2BhZ2VudCBob3N0YC9gYWdlbnQgcmVsYXlgKSBuZWVkcyBpdC5cblx0XHRcdFx0Y29uc3QgeyBzdGRvdXQ6IHVuYW1lUyB9ID0gYXdhaXQgc3NoRXhlYyhzc2hDbGllbnQsICd1bmFtZSAtcycpO1xuXHRcdFx0XHRjb25zdCB7IHN0ZG91dDogdW5hbWVNIH0gPSBhd2FpdCBzc2hFeGVjKHNzaENsaWVudCwgJ3VuYW1lIC1tJyk7XG5cdFx0XHRcdGNvbnN0IHBsYXRmb3JtID0gcmVzb2x2ZVJlbW90ZVBsYXRmb3JtKHVuYW1lUywgdW5hbWVNKTtcblx0XHRcdFx0aWYgKCFwbGF0Zm9ybSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBVbnN1cHBvcnRlZCByZW1vdGUgcGxhdGZvcm06ICR7dW5hbWVTLnRyaW0oKX0gJHt1bmFtZU0udHJpbSgpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZW1vdGUgcGxhdGZvcm06ICR7cGxhdGZvcm0ub3N9LSR7cGxhdGZvcm0uYXJjaH1gKTtcblx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzSW5zdGFsbGluZ0NMSScsIFwiQ2hlY2tpbmcgcmVtb3RlIENMSSBpbnN0YWxsYXRpb24uLi5cIikpO1xuXHRcdFx0XHRjbGlCaW4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDTElJbnN0YWxsZWQoc3NoQ2xpZW50LCBwbGF0Zm9ybSwgcmVwb3J0UHJvZ3Jlc3MpO1xuXHRcdFx0XHRjbGlEYXRhRGlyID0gZ2V0UmVtb3RlQ0xJRGF0YURpcih0aGlzLl9zZXJ2ZXJEYXRhRm9sZGVyTmFtZSk7XG5cblx0XHRcdFx0Ly8gMy4gRGlzY292ZXIgZXZlcnkgbGl2ZSBlbmRwb2ludCBvbiB0aGUgcmVtb3RlIHZpYSB0aGUgc2hhcmVkIHJlZ2lzdHJ5LlxuXHRcdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnc3NoUHJvZ3Jlc3NDaGVja2luZ0FnZW50JywgXCJDaGVja2luZyBmb3IgZXhpc3RpbmcgYWdlbnQgaG9zdHMuLi5cIikpO1xuXHRcdFx0XHRjb25zdCBleGVjID0gYmluZFNzaEV4ZWMoc3NoQ2xpZW50KTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbCA9IGF3YWl0IHJ1bkFnZW50RW5kcG9pbnRzKGV4ZWMsIGNsaUJpbiwgY2xpRGF0YURpcik7XG5cdFx0XHRcdHVzZXJEYXRhUGF0aCA9IGluaXRpYWwudXNlckRhdGFQYXRoO1xuXHRcdFx0XHRjb25zdCBsaXZlID0gYXdhaXQgZmlsdGVyTGl2ZUFnZW50SG9zdEVuZHBvaW50cyhleGVjLCBpbml0aWFsLmVuZHBvaW50cyk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnMgPSBsaXZlLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ2VkaXRvcicpO1xuXHRcdFx0XHRjb25zdCBzdGFuZGFsb25lcyA9IGxpdmUuZmlsdGVyKGUgPT4gZS50eXBlID09PSAnc3RhbmRhbG9uZScpO1xuXG5cdFx0XHRcdGNvbnN0IHNwYXduRGVkaWNhdGVkID0gYXN5bmMgKCk6IFByb21pc2U8SUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGE+ID0+IHtcblx0XHRcdFx0XHRjb25zdCBzcGF3bkNvbW1hbmQgPSBidWlsZEFnZW50SG9zdFNwYXduQ29tbWFuZChjbGlCaW4sIGNsaURhdGFEaXIsIHVzZXJEYXRhUGF0aCk7XG5cdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzU3RhcnRpbmdBZ2VudCcsIFwiU3RhcnRpbmcgcmVtb3RlIGFnZW50IGhvc3QuLi5cIikpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTcGF3bmluZyBkZWRpY2F0ZWQgc3RhbmRhbG9uZSBhZ2VudCBob3N0OiAke3NwYXduQ29tbWFuZH1gKTtcblx0XHRcdFx0XHQvLyBGaXJlLWFuZC1mb3JnZXQ6IHRoZSBzcGF3bmVkIHByb2Nlc3MgaXMgc2VsZi1tYW5hZ2VkIHZpYVxuXHRcdFx0XHRcdC8vIC0taWRsZS10aW1lb3V0IGFuZCBvdXRsaXZlcyB0aGlzIGV4ZWMgY2hhbm5lbCwgc28gd2UgbXVzdFxuXHRcdFx0XHRcdC8vIG5vdCBhd2FpdCBpdHMgc3RyZWFtIGNsb3NpbmcgXHUyMDE0IG9ubHkgcG9sbCB0aGUgcmVnaXN0cnkgZm9yXG5cdFx0XHRcdFx0Ly8gdGhlIG5ldyBlbnRyeSBpdCBwdWJsaXNoZXMuXG5cdFx0XHRcdFx0ZXhlYyhzcGF3bkNvbW1hbmQsIHsgaWdub3JlRXhpdENvZGU6IHRydWUgfSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBTcGF3biBjb21tYW5kIGZvciBkZWRpY2F0ZWQgYWdlbnQgaG9zdCByZXBvcnRlZCBhbiBlcnJvcjogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzQXdhaXRpbmdBZ2VudCcsIFwiV2FpdGluZyBmb3IgdGhlIG5ldyBhZ2VudCBob3N0IHRvIHJlZ2lzdGVyLi4uXCIpKTtcblx0XHRcdFx0XHRyZXR1cm4gd2FpdEZvck5ld1N0YW5kYWxvbmVFbmRwb2ludChleGVjLCBjbGlCaW4sIGNsaURhdGFEaXIsIHVzZXJEYXRhUGF0aCwgbGl2ZSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gRGV0ZXJtaW5pc3RpYyBkZWRpY2F0ZWQgKHN0YW5kYWxvbmUpIHNlbGVjdGlvbjogcmV1c2UgYSBsaXZlXG5cdFx0XHRcdC8vIHN0YW5kYWxvbmUgKGxvd2VzdCBgaW5zdGFuY2VJZGAgZmlyc3QsIHNvIHJlcGVhdGVkIHNpbGVudFxuXHRcdFx0XHQvLyBhdHRlbXB0cyBhcmUgc3RhYmxlKSB3aGVuIG9uZSBleGlzdHMsIG9yIHNwYXduIGEgbmV3XG5cdFx0XHRcdC8vIGRlZGljYXRlZCBvbmUgb3RoZXJ3aXNlLiBTaGFyZWQgYnkgdGhlIHN0b3JlZC1wcmVmZXJlbmNlXG5cdFx0XHRcdC8vIHBhdGhzIGJlbG93IGFuZCB0aGUgc2lsZW50L2JhY2tncm91bmQgcmVjb25uZWN0IHBvbGljeSBcdTIwMTRcblx0XHRcdFx0Ly8gbmVpdGhlciBldmVyIG9wZW5zIHRoZSBwaWNrZXIuXG5cdFx0XHRcdGNvbnN0IHNlbGVjdERlZGljYXRlZCA9IGFzeW5jICgpOiBQcm9taXNlPHsgY2hvc2VuOiBJQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YTsgbGlmZWN5Y2xlOiBTU0hBZ2VudEhvc3RMaWZlY3ljbGUgfT4gPT4ge1xuXHRcdFx0XHRcdGlmIChzdGFuZGFsb25lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGNob3NlbjogYXdhaXQgc3Bhd25EZWRpY2F0ZWQoKSwgbGlmZWN5Y2xlOiAnbWFuYWdlZCcgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgW2RldGVybWluaXN0aWNdID0gWy4uLnN0YW5kYWxvbmVzXS5zb3J0KChhLCBiKSA9PiBhLmluc3RhbmNlSWQubG9jYWxlQ29tcGFyZShiLmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHRyZXR1cm4geyBjaG9zZW46IGRldGVybWluaXN0aWMsIGxpZmVjeWNsZTogJ2V4dGVybmFsJyB9O1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIFNlbGVjdGlvbiBwb2xpY3kgKHJlcXVpcmVtZW50IDIpOiB3aXRoIG5vIGVkaXRvciBlbnRyaWVzLFxuXHRcdFx0XHQvLyByZXVzZSBhIGxpdmUgc3RhbmRhbG9uZSBkZXRlcm1pbmlzdGljYWxseSB3aGVuIGV4YWN0bHkgb25lXG5cdFx0XHRcdC8vIGV4aXN0cywgb3RoZXJ3aXNlIHNwYXduICh6ZXJvKSBvciBwcm9tcHQgKG11bHRpcGxlKS4gV2l0aFxuXHRcdFx0XHQvLyBhbnkgZWRpdG9yIGVudHJ5IHByZXNlbnQsIGFsd2F5cyBwcm9tcHQgYW1vbmcgZXZlcnkgbGl2ZVxuXHRcdFx0XHQvLyBlbmRwb2ludCBwbHVzIFwic3Bhd25cIiwgc2luY2Ugc2lsZW50IHJldXNlIGNvdWxkIG90aGVyd2lzZVxuXHRcdFx0XHQvLyBzdGVhbCBhIHNlc3Npb24gb3V0IGZyb20gdW5kZXIgYW5vdGhlciBvcGVuIGVkaXRvciB3aW5kb3cuXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIEEgcmVuZGVyZXItc3VwcGxpZWQgYGNvbmZpZy5wcmVmZXJyZWRBZ2VudExvY2F0aW9uYCAodGhlXG5cdFx0XHRcdC8vIHN0b3JlZCBgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2VgIGNob2ljZVxuXHRcdFx0XHQvLyBmb3IgdGhpcyBob3N0LCB0aHJlYWRlZCBpbiBmcm9tIHRoZSByZW5kZXJlciBiZWZvcmUgdGhpc1xuXHRcdFx0XHQvLyBjb25uZWN0L3JlY29ubmVjdCBjYWxsKSBpcyBleHBsaWNpdCBjb25zZW50IGFuZCB0YWtlc1xuXHRcdFx0XHQvLyBwcmlvcml0eSBvdmVyIGV2ZXJ5dGhpbmcgYmVsb3csIGluY2x1ZGluZ1xuXHRcdFx0XHQvLyBgdXNlckluaXRpYXRlZGA6IGEgc3RvcmVkIGBlZGl0b3JgIHByZWZlcmVuY2UgbGV0cyBldmVuIGFcblx0XHRcdFx0Ly8gc2lsZW50L2JhY2tncm91bmQgcmVjb25uZWN0IGxhbmQgb24gYSBsaXZlIGBlZGl0b3JgLW93bmVkXG5cdFx0XHRcdC8vIGVuZHBvaW50IChmYWxsaW5nIGJhY2sgdG8gZGVkaWNhdGVkIHNlbGVjdGlvbiBcdTIwMTQgd2l0aG91dFxuXHRcdFx0XHQvLyBtdXRhdGluZyB0aGUgc3RvcmVkIHByZWZlcmVuY2UgXHUyMDE0IGlmIG5vbmUgaXMgbGl2ZSksIGFuZCBhXG5cdFx0XHRcdC8vIHN0b3JlZCBgZGVkaWNhdGVkYCBwcmVmZXJlbmNlIGFsd2F5cyBzZWxlY3RzIGRlZGljYXRlZC5cblx0XHRcdFx0Ly8gTmVpdGhlciBldmVyIGVtaXRzIGFuIGVuZHBvaW50LXNlbGVjdGlvbiByZXF1ZXN0LCBzaW5jZVxuXHRcdFx0XHQvLyB0aGUgY2hvaWNlIGlzIGFscmVhZHkga25vd24uXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIFdpdGhvdXQgYSBzdG9yZWQgcHJlZmVyZW5jZSwgdGhlIHByZXZpb3VzIGJlaGF2aW9yIGlzXG5cdFx0XHRcdC8vIHVuY2hhbmdlZDogYSBzaWxlbnQvYmFja2dyb3VuZCByZWNvbm5lY3QgKGBjb25maWcudXNlckluaXRpYXRlZFxuXHRcdFx0XHQvLyA9PT0gZmFsc2VgLCBlLmcuIHRoZSBzdGFydHVwL2F1dG8tcmVjb25uZWN0IHBhdGgpIG11c3Rcblx0XHRcdFx0Ly8gbmV2ZXIgb3BlbiB0aGUgcGlja2VyIGFuZCBtdXN0IG5ldmVyIHNpbGVudGx5IGF0dGFjaCB0b1xuXHRcdFx0XHQvLyBhbiBgZWRpdG9yYC1vd25lZCBlbmRwb2ludCBcdTIwMTQgaXQgZGV0ZXJtaW5pc3RpY2FsbHkgcmV1c2VzIGFcblx0XHRcdFx0Ly8gbGl2ZSBgc3RhbmRhbG9uZWAgd2hlbiBvbmUgZXhpc3RzLCBvciBzcGF3bnMgYSBuZXdcblx0XHRcdFx0Ly8gZGVkaWNhdGVkIG9uZSBvdGhlcndpc2UuIEEgdXNlci1pbml0aWF0ZWQgY29ubmVjdCB3aXRoIG5vXG5cdFx0XHRcdC8vIHN0b3JlZCBwcmVmZXJlbmNlIHN0aWxsIHNob3dzIHRoZSBwaWNrZXIgd2hlbiBhbiBlZGl0b3Jcblx0XHRcdFx0Ly8gZW50cnkgZXhpc3RzLCBnaXZpbmcgdGhlIHJlbmRlcmVyJ3MgcHJlZmVyZW5jZS1yZXNvbHV0aW9uXG5cdFx0XHRcdC8vIGZsb3cgKHNlZSBgX3Jlc29sdmVFbmRwb2ludFNlbGVjdGlvbmApIGEgY2hhbmNlIHRvIHByb21wdFxuXHRcdFx0XHQvLyBhbmQgcGVyc2lzdCBhIGZyZXNoIGNob2ljZS5cblx0XHRcdFx0Y29uc3Qgc2VsZWN0RW5kcG9pbnQgPSBhc3luYyAoKTogUHJvbWlzZTx7IGNob3NlbjogSUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGE7IGxpZmVjeWNsZTogU1NIQWdlbnRIb3N0TGlmZWN5Y2xlIH0+ID0+IHtcblx0XHRcdFx0XHRpZiAoY29uZmlnLnByZWZlcnJlZEFnZW50TG9jYXRpb24gPT09ICdlZGl0b3InKSB7XG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IFtkZXRlcm1pbmlzdGljXSA9IFsuLi5lZGl0b3JzXS5zb3J0KChhLCBiKSA9PiBhLmluc3RhbmNlSWQubG9jYWxlQ29tcGFyZShiLmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgY2hvc2VuOiBkZXRlcm1pbmlzdGljLCBsaWZlY3ljbGU6ICdleHRlcm5hbCcgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBzZWxlY3REZWRpY2F0ZWQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNvbmZpZy5wcmVmZXJyZWRBZ2VudExvY2F0aW9uID09PSAnZGVkaWNhdGVkJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNlbGVjdERlZGljYXRlZCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY29uZmlnLnVzZXJJbml0aWF0ZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc2VsZWN0RGVkaWNhdGVkKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlZGl0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0aWYgKHN0YW5kYWxvbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBjaG9zZW46IGF3YWl0IHNwYXduRGVkaWNhdGVkKCksIGxpZmVjeWNsZTogJ21hbmFnZWQnIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoc3RhbmRhbG9uZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGNob3Nlbjogc3RhbmRhbG9uZXNbMF0sIGxpZmVjeWNsZTogJ2V4dGVybmFsJyB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzQXdhaXRpbmdTZWxlY3Rpb24nLCBcIldhaXRpbmcgZm9yIGVuZHBvaW50IHNlbGVjdGlvbi4uLlwiKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCB0aGlzLl9yZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24oc3NoQ2xpZW50ISwgY29ubmVjdGlvbktleSwgZGlzcGxheUhvc3QsIHN0YW5kYWxvbmVzKTtcblx0XHRcdFx0XHRcdGlmIChzZWxlY3Rpb24ua2luZCA9PT0gJ3NwYXduJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBjaG9zZW46IGF3YWl0IHNwYXduRGVkaWNhdGVkKCksIGxpZmVjeWNsZTogJ21hbmFnZWQnIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBmb3VuZCA9IHN0YW5kYWxvbmVzLmZpbmQoZSA9PiBpc1NhbWVBZ2VudEhvc3RFbmRwb2ludElkZW50aXR5KGUsIHNlbGVjdGlvbikpO1xuXHRcdFx0XHRcdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gU2VsZWN0ZWQgYWdlbnQgaG9zdCBlbmRwb2ludCBpcyBubyBsb25nZXIgYXZhaWxhYmxlYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBjaG9zZW46IGZvdW5kLCBsaWZlY3ljbGU6ICdleHRlcm5hbCcgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3NzaFByb2dyZXNzQXdhaXRpbmdTZWxlY3Rpb24nLCBcIldhaXRpbmcgZm9yIGVuZHBvaW50IHNlbGVjdGlvbi4uLlwiKSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgdGhpcy5fcmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uKHNzaENsaWVudCEsIGNvbm5lY3Rpb25LZXksIGRpc3BsYXlIb3N0LCBsaXZlKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uLmtpbmQgPT09ICdzcGF3bicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGNob3NlbjogYXdhaXQgc3Bhd25EZWRpY2F0ZWQoKSwgbGlmZWN5Y2xlOiAnbWFuYWdlZCcgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZm91bmQgPSBsaXZlLmZpbmQoZSA9PiBpc1NhbWVBZ2VudEhvc3RFbmRwb2ludElkZW50aXR5KGUsIHNlbGVjdGlvbikpO1xuXHRcdFx0XHRcdGlmICghZm91bmQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBTZWxlY3RlZCBhZ2VudCBob3N0IGVuZHBvaW50IGlzIG5vIGxvbmdlciBhdmFpbGFibGVgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQm90aCBhIGNob3NlbiBlZGl0b3IgYW5kIGEgY2hvc2VuIChyZXVzZWQpIHN0YW5kYWxvbmVcblx0XHRcdFx0XHQvLyBiZWNvbWUgdGhpcyBkZXNrdG9wJ3MgcHJpbWFyeSwgZXh0ZXJuYWxseS1vd25lZFxuXHRcdFx0XHRcdC8vIGNvbm5lY3Rpb24gXHUyMDE0IG5laXRoZXIgaXMga2lsbGVkIG9yIHJlcGxhY2VkIChyZXF1aXJlbWVudCA1KS5cblx0XHRcdFx0XHRyZXR1cm4geyBjaG9zZW46IGZvdW5kLCBsaWZlY3ljbGU6ICdleHRlcm5hbCcgfTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHNlbGVjdEVuZHBvaW50KCk7XG5cdFx0XHRcdGVuZHBvaW50ID0gc2VsZWN0ZWQuY2hvc2VuLmVuZHBvaW50O1xuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW4gPSBzZWxlY3RlZC5jaG9zZW4uY29ubmVjdGlvblRva2VuO1xuXHRcdFx0XHRzZXJ2ZXJUeXBlID0gc2VsZWN0ZWQuY2hvc2VuLnR5cGU7XG5cdFx0XHRcdGluc3RhbmNlSWQgPSBzZWxlY3RlZC5jaG9zZW4uaW5zdGFuY2VJZDtcblx0XHRcdFx0bGlmZWN5Y2xlID0gc2VsZWN0ZWQubGlmZWN5Y2xlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyA0LiBDb25uZWN0IHRvIHRoZSBleGFjdCBzZWxlY3RlZC9zcGF3bmVkIGVuZHBvaW50IHZpYSBXZWJTb2NrZXQgcmVsYXkuXG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnc3NoUHJvZ3Jlc3NGb3J3YXJkaW5nJywgXCJDb25uZWN0aW5nIHRvIHJlbW90ZSBhZ2VudCBob3N0Li4uXCIpKTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JZCA9IGNvbm5lY3Rpb25LZXk7XG5cdFx0XHRsZXQgY29ubjogU1NIQ29ubmVjdGlvbiB8IHVuZGVmaW5lZDsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBwcmVmZXItY29uc3Rcblx0XHRcdGxldCByZWxheTogeyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVsYXkgPSBhd2FpdCB0aGlzLl9jcmVhdGVXZWJTb2NrZXRSZWxheShcblx0XHRcdFx0XHRzc2hDbGllbnQsIGVuZHBvaW50LCBjbGlCaW4sIGNsaURhdGFEaXIsIGluc3RhbmNlSWQsIHVzZXJEYXRhUGF0aCwgY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdChkYXRhOiBzdHJpbmcpID0+IHRoaXMuX29uRGlkUmVsYXlNZXNzYWdlLmZpcmUoeyBjb25uZWN0aW9uSWQsIGRhdGEgfSksXG5cdFx0XHRcdFx0KCkgPT4geyBjb25uPy5kaXNwb3NlKCk7IH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGNhdGNoIChyZWxheUVycikge1xuXHRcdFx0XHQvLyBOZXZlciBzaWxlbnRseSBwcm9tb3RlIGEgZGlmZmVyZW50IGNhbmRpZGF0ZSwgbm9yIGtpbGwvcmVwbGFjZVxuXHRcdFx0XHQvLyBhbiBlZGl0b3Igb3IgcmV1c2VkIHN0YW5kYWxvbmUsIG9uIGZhaWx1cmUgXHUyMDE0IHJlcmVhZCB0aGVcblx0XHRcdFx0Ly8gcmVnaXN0cnkgb25jZSAocHVyZWx5IGRpYWdub3N0aWMpIGFuZCBzdXJmYWNlIGEgY2xlYXIgZXJyb3Jcblx0XHRcdFx0Ly8gc28gdGhlIHVzZXIgY2FuIHJldHJ5IGNvbm5lY3RpbmcgYWdhaW5zdCBhIGZyZXNoIHBpY2tlclxuXHRcdFx0XHQvLyAocmVxdWlyZW1lbnQgNykuXG5cdFx0XHRcdGNvbnN0IHJlbGF5RXJyb3JNZXNzYWdlID0gcmVsYXlFcnIgaW5zdGFuY2VvZiBFcnJvciA/IHJlbGF5RXJyLm1lc3NhZ2UgOiBTdHJpbmcocmVsYXlFcnIpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGNvbm5lY3QgdG8gc2VsZWN0ZWQgYWdlbnQgaG9zdCBlbmRwb2ludDogJHtyZWxheUVycm9yTWVzc2FnZX1gKTtcblx0XHRcdFx0aWYgKCFjb25maWcucmVtb3RlQWdlbnRIb3N0Q29tbWFuZCAmJiBjbGlCaW4gJiYgY2xpRGF0YURpcikge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBydW5BZ2VudEVuZHBvaW50cyhiaW5kU3NoRXhlYyhzc2hDbGllbnQpLCBjbGlCaW4sIGNsaURhdGFEaXIsIHVzZXJEYXRhUGF0aCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAocmVyZWFkRXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIHJlcmVhZCBhZ2VudCBob3N0IGVuZHBvaW50cyBhZnRlciByZWxheSBmYWlsdXJlOiAke3JlcmVhZEVyciBpbnN0YW5jZW9mIEVycm9yID8gcmVyZWFkRXJyLm1lc3NhZ2UgOiBTdHJpbmcocmVyZWFkRXJyKX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBjb25uZWN0IHRvIHRoZSBzZWxlY3RlZCByZW1vdGUgYWdlbnQgaG9zdDogJHtyZWxheUVycm9yTWVzc2FnZX0uIFBsZWFzZSByZXRyeSBjb25uZWN0aW5nLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyA1LiBDcmVhdGUgY29ubmVjdGlvbiBvYmplY3Rcblx0XHRcdGNvbnN0IGFkZHJlc3MgPSBjb25uZWN0aW9uS2V5O1xuXHRcdFx0Y29ubiA9IG5ldyBTU0hDb25uZWN0aW9uKFxuXHRcdFx0XHRjb25maWcsXG5cdFx0XHRcdGNvbm5lY3Rpb25JZCxcblx0XHRcdFx0YWRkcmVzcyxcblx0XHRcdFx0Y29uZmlnLm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0ZW5kcG9pbnQsXG5cdFx0XHRcdHNlcnZlclR5cGUsXG5cdFx0XHRcdGluc3RhbmNlSWQsXG5cdFx0XHRcdGxpZmVjeWNsZSxcblx0XHRcdFx0Y2xpQmluLFxuXHRcdFx0XHRjbGlEYXRhRGlyLFxuXHRcdFx0XHR1c2VyRGF0YVBhdGgsXG5cdFx0XHRcdHNzaENsaWVudCxcblx0XHRcdFx0cmVsYXksXG5cdFx0XHRcdGFnZW50U3RyZWFtLFxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0KTtcblxuXHRcdFx0RXZlbnQub25jZShjb25uLm9uRGlkQ2xvc2UpKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uS2V5KSA9PT0gY29ubikge1xuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoY29ubmVjdGlvbktleSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWxheUNsb3NlLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5zZXQoY29ubmVjdGlvbktleSwgY29ubik7XG5cdFx0XHRzc2hDbGllbnQgPSB1bmRlZmluZWQ7IC8vIG93bmVyc2hpcCB0cmFuc2ZlcnJlZCB0byBTU0hDb25uZWN0aW9uXG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb25uZWN0aW9uSWQsXG5cdFx0XHRcdGFkZHJlc3MsXG5cdFx0XHRcdG5hbWU6IGNvbmZpZy5uYW1lLFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdGNvbmZpZzogY29ubi5jb25maWcsXG5cdFx0XHRcdHNzaENvbmZpZ0hvc3Q6IGNvbmZpZy5zc2hDb25maWdIb3N0LFxuXHRcdFx0XHRzZXJ2ZXJUeXBlLFxuXHRcdFx0XHRpbnN0YW5jZUlkLFxuXHRcdFx0XHRwcmltYXJ5OiB0cnVlLFxuXHRcdFx0XHRsaWZlY3ljbGUsXG5cdFx0XHR9O1xuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRzc2hDbGllbnQ/LmVuZCgpO1xuXHRcdFx0aWYgKCEoZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGNvbm5lY3QgdG8gJHtkaXNwbGF5SG9zdH1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cblx0YXN5bmMgZGlzY29ubmVjdChob3N0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGNvbm5dIG9mIHRoaXMuX2Nvbm5lY3Rpb25zKSB7XG5cdFx0XHRpZiAoa2V5ID09PSBob3N0IHx8IGNvbm4uY29ubmVjdGlvbklkID09PSBob3N0KSB7XG5cdFx0XHRcdGNvbm4uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVsYXlTZW5kKGNvbm5lY3Rpb25JZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGNvbm4gb2YgdGhpcy5fY29ubmVjdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChjb25uLmNvbm5lY3Rpb25JZCA9PT0gY29ubmVjdGlvbklkKSB7XG5cdFx0XHRcdGNvbm4ucmVsYXlTZW5kKG1lc3NhZ2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0KHNzaENvbmZpZ0hvc3Q6IHN0cmluZywgbmFtZTogc3RyaW5nLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kPzogc3RyaW5nLCBhZ2VudEZvcndhcmQ/OiBib29sZWFuLCB1c2VySW5pdGlhdGVkPzogYm9vbGVhbiwgcHJlZmVycmVkQWdlbnRMb2NhdGlvbj86IFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSk6IFByb21pc2U8SVNTSENvbm5lY3RSZXN1bHQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUmVjb25uZWN0aW5nIHZpYSBTU0ggY29uZmlnIGhvc3Q6ICR7c3NoQ29uZmlnSG9zdH0gKHVzZXJJbml0aWF0ZWQ9JHt1c2VySW5pdGlhdGVkID8/IHRydWV9KWApO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5yZXNvbHZlU1NIQ29uZmlnKHNzaENvbmZpZ0hvc3QpO1xuXG5cdFx0Ly8gQWx3YXlzIHVzZSBBZ2VudCBhdXRoIFx1MjAxNCB0aGUgYXV0aCBoYW5kbGVyIHdpbGwgd2FsayB0aHJvdWdoIHRoZSBTU0hcblx0XHQvLyBhZ2VudCBhbmQgYW55IGRlZmF1bHQgaWRlbnRpdGllcy4gSWYgdGhlIHVzZXIgcGlubmVkIGEgbm9uLWRlZmF1bHRcblx0XHQvLyBgSWRlbnRpdHlGaWxlYCBpbiB0aGVpciBzc2ggY29uZmlnLCBzdXJmYWNlIGl0IGFzIHRoZSBleHBsaWNpdCBrZXlcblx0XHQvLyBzbyBpdCBnZXRzIHRyaWVkIGZpcnN0LlxuXHRcdGxldCBwcml2YXRlS2V5UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXNvbHZlZC5pZGVudGl0eUZpbGUubGVuZ3RoID4gMCAmJiAhU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2lzRGVmYXVsdEtleVBhdGgocmVzb2x2ZWQuaWRlbnRpdHlGaWxlWzBdKSkge1xuXHRcdFx0cHJpdmF0ZUtleVBhdGggPSByZXNvbHZlZC5pZGVudGl0eUZpbGVbMF07XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSByZWNvbm5lY3Q6IGlkZW50aXR5RmlsZXM9JHtKU09OLnN0cmluZ2lmeShyZXNvbHZlZC5pZGVudGl0eUZpbGUpfSwgZXhwbGljaXQga2V5PSR7cHJpdmF0ZUtleVBhdGggPz8gJyhub25lKSd9YCk7XG5cblx0XHRyZXR1cm4gdGhpcy5jb25uZWN0KHtcblx0XHRcdGhvc3Q6IHJlc29sdmVkLmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogcmVzb2x2ZWQucG9ydCAhPT0gMjIgPyByZXNvbHZlZC5wb3J0IDogdW5kZWZpbmVkLFxuXHRcdFx0dXNlcm5hbWU6IHJlc29sdmVkLnVzZXIgPz8gc3NoQ29uZmlnSG9zdCxcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRwcml2YXRlS2V5UGF0aCxcblx0XHRcdGlkZW50aXR5QWdlbnQ6IHJlc29sdmVkLmlkZW50aXR5QWdlbnQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0c3NoQ29uZmlnSG9zdCxcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQsXG5cdFx0XHRhZ2VudEZvcndhcmQ6IGFnZW50Rm9yd2FyZCAmJiByZXNvbHZlZC5mb3J3YXJkQWdlbnQgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0dXNlckluaXRpYXRlZCxcblx0XHRcdHByZWZlcnJlZEFnZW50TG9jYXRpb24sXG5cdFx0fSwgLyogcmVwbGFjZVJlbGF5ICovIHRydWUpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNTSENvbmZpZ0hvc3RzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBjb25maWdQYXRoID0gam9pbihvcy5ob21lZGlyKCksICcuc3NoJywgJ2NvbmZpZycpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZnNwLnJlYWRGaWxlKGNvbmZpZ1BhdGgsICd1dGYtOCcpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcnNlU1NIQ29uZmlnSG9zdHMoY29udGVudCwgZGlybmFtZShjb25maWdQYXRoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gQ291bGQgbm90IHJlYWQgU1NIIGNvbmZpZyBhdCAke2NvbmZpZ1BhdGh9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZW5zdXJlVXNlclNTSENvbmZpZygpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHNzaERpciA9IGpvaW4ob3MuaG9tZWRpcigpLCAnLnNzaCcpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBqb2luKHNzaERpciwgJ2NvbmZpZycpO1xuXHRcdGNvbnN0IGlzUG9zaXggPSBwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmc3AubWtkaXIoc3NoRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgbW9kZTogaXNQb3NpeCA/IDBvNzAwIDogdW5kZWZpbmVkIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBlbnN1cmUgfi8uc3NoIGRpcmVjdG9yeTogJHtlcnJ9YCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmc3AuYWNjZXNzKGNvbmZpZ1BhdGgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgZnNwLm9wZW4oY29uZmlnUGF0aCwgJ2EnLCBpc1Bvc2l4ID8gMG82MDAgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRhd2FpdCBoYW5kbGUuY2xvc2UoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGNyZWF0ZSAke2NvbmZpZ1BhdGh9OiAke2Vycn1gKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVVJJLmZpbGUoY29uZmlnUGF0aCk7XG5cdH1cblxuXHRhc3luYyBsaXN0U1NIQ29uZmlnRmlsZXMoKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdGNvbnN0IGlzV2luZG93cyA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMic7XG5cdFx0Y29uc3QgdXNlckNvbmZpZ1BhdGggPSBqb2luKG9zLmhvbWVkaXIoKSwgJy5zc2gnLCAnY29uZmlnJyk7XG5cdFx0Y29uc3Qgc3lzdGVtQ29uZmlnUGF0aCA9IGlzV2luZG93c1xuXHRcdFx0PyBqb2luKHByb2Nlc3MuZW52WydQcm9ncmFtRGF0YSddID8/ICdDOlxcXFxQcm9ncmFtRGF0YScsICdzc2gnLCAnc3NoX2NvbmZpZycpXG5cdFx0XHQ6ICcvZXRjL3NzaC9zc2hfY29uZmlnJztcblxuXHRcdGNvbnN0IHJlc3VsdDogVVJJW10gPSBbVVJJLmZpbGUodXNlckNvbmZpZ1BhdGgpXTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnNwLmFjY2VzcyhzeXN0ZW1Db25maWdQYXRoKTtcblx0XHRcdHJlc3VsdC5wdXNoKFVSSS5maWxlKHN5c3RlbUNvbmZpZ1BhdGgpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIHN5c3RlbSBjb25maWcgZmlsZSBkb2VzIG5vdCBleGlzdCBcdTIwMTQgc2tpcFxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVNTSENvbmZpZyhob3N0OiBzdHJpbmcpOiBQcm9taXNlPElTU0hSZXNvbHZlZENvbmZpZz4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJU1NIUmVzb2x2ZWRDb25maWc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNwLmV4ZWNGaWxlKCdzc2gnLCBbJy1HJywgaG9zdF0sIHsgdGltZW91dDogNTAwMCB9LCAoZXJyLCBzdGRvdXQpID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gc3NoIC1HIGZhaWxlZCBmb3IgJHtob3N0fTogJHtlcnIubWVzc2FnZX1gKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3BhcnNlU1NIR091dHB1dChzdGRvdXQpO1xuXHRcdFx0XHRyZXNvbHZlKGNvbmZpZyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BhcnNlU1NIQ29uZmlnSG9zdHMoY29udGVudDogc3RyaW5nLCBjb25maWdEaXI6IHN0cmluZywgdmlzaXRlZD86IFNldDxzdHJpbmc+KTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IHNlZW4gPSB2aXNpdGVkID8/IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGhvc3RzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Ly8gRXh0cmFjdCBob3N0cyBmcm9tIHRoaXMgZmlsZSBkaXJlY3RseVxuXHRcdGhvc3RzLnB1c2goLi4ucGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb250ZW50KSk7XG5cblx0XHQvLyBGb2xsb3cgSW5jbHVkZSBkaXJlY3RpdmVzXG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGNvbnRlbnQuc3BsaXQoJ1xcbicpKSB7XG5cdFx0XHRjb25zdCB0cmltbWVkID0gbGluZS50cmltKCk7XG5cdFx0XHRpZiAoIXRyaW1tZWQgfHwgdHJpbW1lZC5zdGFydHNXaXRoKCcjJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmNsdWRlTWF0Y2ggPSB0cmltbWVkLm1hdGNoKC9eSW5jbHVkZVxccysoLispJC9pKTtcblx0XHRcdGlmICghaW5jbHVkZU1hdGNoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByYXdWYWx1ZSA9IHN0cmlwU1NIQ29tbWVudChpbmNsdWRlTWF0Y2hbMV0pO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSByYXdWYWx1ZS5zcGxpdCgvXFxzKy8pLmZpbHRlcihCb29sZWFuKTtcblxuXHRcdFx0Zm9yIChjb25zdCByYXdQYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XG5cdFx0XHRcdGNvbnN0IHBhdHRlcm4gPSByYXdQYXR0ZXJuLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRQYXR0ZXJuID0gaXNBYnNvbHV0ZShwYXR0ZXJuKSA/IHBhdHRlcm4gOiBqb2luKGNvbmZpZ0RpciwgcGF0dGVybik7XG5cblx0XHRcdFx0aWYgKHNlZW4uaGFzKHJlc29sdmVkUGF0dGVybikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWVuLmFkZChyZXNvbHZlZFBhdHRlcm4pO1xuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzcC5zdGF0KHJlc29sdmVkUGF0dGVybik7XG5cdFx0XHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCBmc3AucmVhZGRpcihyZXNvbHZlZFBhdHRlcm4pO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc3ViID0gYXdhaXQgZnNwLnJlYWRGaWxlKGpvaW4ocmVzb2x2ZWRQYXR0ZXJuLCBmaWxlKSwgJ3V0Zi04Jyk7XG5cdFx0XHRcdFx0XHRcdFx0aG9zdHMucHVzaCguLi5hd2FpdCB0aGlzLl9wYXJzZVNTSENvbmZpZ0hvc3RzKHN1YiwgcmVzb2x2ZWRQYXR0ZXJuLCBzZWVuKSk7XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggeyAvKiBza2lwIHVucmVhZGFibGUgZmlsZXMgKi8gfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdWIgPSBhd2FpdCBmc3AucmVhZEZpbGUocmVzb2x2ZWRQYXR0ZXJuLCAndXRmLTgnKTtcblx0XHRcdFx0XHRcdGhvc3RzLnB1c2goLi4uYXdhaXQgdGhpcy5fcGFyc2VTU0hDb25maWdIb3N0cyhzdWIsIGRpcm5hbWUocmVzb2x2ZWRQYXR0ZXJuKSwgc2VlbikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Y29uc3QgZGlyID0gZGlybmFtZShyZXNvbHZlZFBhdHRlcm4pO1xuXHRcdFx0XHRcdGNvbnN0IGJhc2UgPSBiYXNlbmFtZShyZXNvbHZlZFBhdHRlcm4pO1xuXHRcdFx0XHRcdGlmIChiYXNlLmluY2x1ZGVzKCcqJykpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgZnNwLnJlYWRkaXIoZGlyKTtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIGJhc2UucmVwbGFjZSgvXFwqL2csICcuKicpICsgJyQnKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocmVnZXgudGVzdChmaWxlKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc3ViID0gYXdhaXQgZnNwLnJlYWRGaWxlKGpvaW4oZGlyLCBmaWxlKSwgJ3V0Zi04Jyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGhvc3RzLnB1c2goLi4uYXdhaXQgdGhpcy5fcGFyc2VTU0hDb25maWdIb3N0cyhzdWIsIGRpciwgc2VlbikpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCB7IC8qIHNraXAgKi8gfVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBjYXRjaCB7IC8qIHNraXAgdW5yZWFkYWJsZSBkaXJzICovIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhvc3RzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VTU0hHT3V0cHV0KHN0ZG91dDogc3RyaW5nKTogSVNTSFJlc29sdmVkQ29uZmlnIHtcblx0XHRyZXR1cm4gcGFyc2VTU0hHT3V0cHV0KHN0ZG91dCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2Nvbm5lY3RTU0goXG5cdFx0Y29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnLFxuXHRcdGNvbm5lY3Rpb25LZXk/OiBzdHJpbmcsXG5cdCk6IFByb21pc2U8U1NIQ2xpZW50PiB7XG5cdFx0Y29uc3QgcG9ydCA9IGNvbmZpZy5wb3J0ID8/IDIyO1xuXHRcdGNvbnN0IGNvbm5lY3RDb25maWc6IENvbm5lY3RDb25maWcgPSB7XG5cdFx0XHRob3N0OiBjb25maWcuaG9zdCxcblx0XHRcdHBvcnQsXG5cdFx0XHR1c2VybmFtZTogY29uZmlnLnVzZXJuYW1lLFxuXHRcdFx0Ly8gV2UgZW5mb3JjZSB0aGUgaGFuZHNoYWtlIGRlYWRsaW5lIG91cnNlbHZlcyBzbyBpdCBjYW4gYmUgc3RyZXRjaGVkXG5cdFx0XHQvLyB3aGlsZSBhIHByb21wdCBpcyBvdXRzdGFuZGluZzsgc2VlIElOVEVSQUNUSVZFX1RJTUVPVVRfTVMuXG5cdFx0XHRyZWFkeVRpbWVvdXQ6IDAsXG5cdFx0XHRrZWVwYWxpdmVJbnRlcnZhbDogMTVfMDAwLFxuXHRcdH07XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHRoaXMuX2J1aWxkQXV0aEF0dGVtcHRzKGNvbmZpZyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IEJ1aWx0ICR7YXR0ZW1wdHMubGVuZ3RofSBhdXRoIGF0dGVtcHQocyk6ICR7YXR0ZW1wdHMubWFwKGEgPT4gZGVzY3JpYmVBdXRoQXR0ZW1wdChhKSkuam9pbignLCAnKX1gKTtcblx0XHRjb25zdCBkaXNwbGF5SG9zdCA9IGNvbmZpZy5zc2hDb25maWdIb3N0ID8/IGAke2NvbmZpZy51c2VybmFtZX1AJHtjb25maWcuaG9zdH1gO1xuXHRcdC8vIFRyYWNrIHJlcXVlc3RJZHMgd2UgY3JlYXRlZCBkdXJpbmcgdGhpcyBjb25uZWN0IHNvIHdlIGNhbiBmaXJlXG5cdFx0Ly8gb25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlIGZvciBhbnkgc3RpbGwtcGVuZGluZyBwcm9tcHRzIHdoZW5cblx0XHQvLyB0aGUgY29ubmVjdCBhdHRlbXB0IGZhaWxzIG9yIGNvbXBsZXRlcy5cblx0XHRjb25zdCBsaXZlS2JpUmVxdWVzdHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRsZXQgY2FuY2VsQ29ubmVjdEZyb21LYmk6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHQvLyBGb3J3YXJkIHJlZmVyZW5jZSBpbnRvIHRoZSBjb25uZWN0IHByb21pc2UgYmVsb3cuIERlY2xhcmVkIHVwIGhlcmUgc29cblx0XHQvLyBldmVyeSBodW1hbi1mYWNpbmcgcHJvbXB0IGNhbiB3aWRlbiB0aGUgaGFuZHNoYWtlIGRlYWRsaW5lIHdoaWxlIGl0XG5cdFx0Ly8gaXMgb3V0c3RhbmRpbmcuXG5cdFx0bGV0IGFybURlYWRsaW5lOiAoKG1zOiBudW1iZXIpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdC8vIE9uY2UgdGhlIHVzZXIgaGFzIGFuc3dlcmVkLCB0aGUgaHVtYW4gaXMgb3V0IG9mIHRoZSBsb29wIGFnYWluLCBzb1xuXHRcdC8vIHRoZSByZXN0IG9mIHRoZSBoYW5kc2hha2UgZ29lcyBiYWNrIHRvIHRoZSBuZXR3b3JrLXNpemVkIGRlYWRsaW5lLlxuXHRcdGNvbnN0IHdyYXBQcm9tcHRGaW5pc2ggPSA8VD4oZmluaXNoOiAodmFsdWU6IFQpID0+IHZvaWQpID0+ICh2YWx1ZTogVCkgPT4ge1xuXHRcdFx0YXJtRGVhZGxpbmU/LihIQU5EU0hBS0VfVElNRU9VVF9NUyk7XG5cdFx0XHRmaW5pc2godmFsdWUpO1xuXHRcdH07XG5cdFx0Y29uc3Qga2JpSGFuZGxlcjogU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVByb21wdEhhbmRsZXIgfCB1bmRlZmluZWQgPSBhdHRlbXB0cy5zb21lKGEgPT4gYS50eXBlID09PSAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnKVxuXHRcdFx0PyAobmFtZSwgaW5zdHJ1Y3Rpb25zLCBwcm9tcHRzLCBmaW5pc2gpID0+IHtcblx0XHRcdFx0Ly8gQSBodW1hbiBpcyBub3cgaW4gdGhlIGxvb3A7IGRvbid0IGhvbGQgdGhlbSB0byB0aGVcblx0XHRcdFx0Ly8gbmV0d29yay1zaXplZCBkZWFkbGluZSB3aGlsZSB0aGV5IGZpbmQgdGhlaXIgcGFzc3dvcmQuXG5cdFx0XHRcdGFybURlYWRsaW5lPy4oSU5URVJBQ1RJVkVfVElNRU9VVF9NUyk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRoaXMuX2hhbmRsZUtleWJvYXJkSW50ZXJhY3RpdmUoY29ubmVjdGlvbktleSA/PyBkaXNwbGF5SG9zdCwgZGlzcGxheUhvc3QsIGNvbmZpZy51c2VybmFtZSwgbmFtZSwgaW5zdHJ1Y3Rpb25zLCBwcm9tcHRzLCB3cmFwUHJvbXB0RmluaXNoKGZpbmlzaCksICgpID0+IGNhbmNlbENvbm5lY3RGcm9tS2JpPy4oKSk7XG5cdFx0XHRcdGxpdmVLYmlSZXF1ZXN0cy5hZGQocmVxdWVzdElkKTtcblx0XHRcdH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGtleVBhc3NwaHJhc2VIYW5kbGVyOiBTU0hLZXlQYXNzcGhyYXNlUHJvbXB0SGFuZGxlciB8IHVuZGVmaW5lZCA9IGF0dGVtcHRzLnNvbWUoYSA9PiBhLnR5cGUgPT09ICdwdWJsaWNrZXknICYmIGEuZW5jcnlwdGVkKVxuXHRcdFx0PyAoa2V5UGF0aCwgZmluaXNoKSA9PiB7XG5cdFx0XHRcdGFybURlYWRsaW5lPy4oSU5URVJBQ1RJVkVfVElNRU9VVF9NUyk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRoaXMuX2hhbmRsZUtleWJvYXJkSW50ZXJhY3RpdmUoXG5cdFx0XHRcdFx0Y29ubmVjdGlvbktleSA/PyBkaXNwbGF5SG9zdCxcblx0XHRcdFx0XHRkaXNwbGF5SG9zdCxcblx0XHRcdFx0XHRjb25maWcudXNlcm5hbWUsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3NzaEtleVBhc3NwaHJhc2VOYW1lJywgXCJTU0ggS2V5IFBhc3NwaHJhc2VcIiksXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0W3sgcHJvbXB0OiBsb2NhbGl6ZSgnc3NoS2V5UGFzc3BocmFzZVByb21wdCcsIFwiRW50ZXIgcGFzc3BocmFzZSBmb3IgU1NIIGtleSB7MH0uXCIsIGtleVBhdGgpLCBlY2hvOiBmYWxzZSB9XSxcblx0XHRcdFx0XHR3cmFwUHJvbXB0RmluaXNoKChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiBmaW5pc2gocmVzcG9uc2VzWzBdKSksXG5cdFx0XHRcdFx0KCkgPT4gY2FuY2VsQ29ubmVjdEZyb21LYmk/LigpLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRsaXZlS2JpUmVxdWVzdHMuYWRkKHJlcXVlc3RJZCk7XG5cdFx0XHR9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHQvLyBDYXN0OiB0aGUgc3NoMiBAdHlwZXMgZG9uJ3QgbW9kZWwgYGZhbHNlYCAoZ2l2ZS11cCkgZm9yIHRoZVxuXHRcdC8vIGNhbGxiYWNrIG5vciBgbnVsbGAgZm9yIHRoZSBmaXJzdCBpbnZvY2F0aW9uJ3MgYG1ldGhvZHNMZWZ0YCxcblx0XHQvLyBldmVuIHRob3VnaCB0aGUgcnVudGltZSBzdXBwb3J0cyBib3RoIHBlciB0aGUgc3NoMiBkb2NzLlxuXHRcdGNvbm5lY3RDb25maWcuYXV0aEhhbmRsZXIgPSBtYWtlQXV0aEhhbmRsZXIoYXR0ZW1wdHMsIHRoaXMuX2xvZ1NlcnZpY2UsIGtiaUhhbmRsZXIsIGtleVBhc3NwaHJhc2VIYW5kbGVyKSBhcyB1bmtub3duIGFzIENvbm5lY3RDb25maWdbJ2F1dGhIYW5kbGVyJ107XG5cblx0XHRjb25zdCBjYW5jZWxMaXZlS2JpUmVxdWVzdHMgPSAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiBsaXZlS2JpUmVxdWVzdHMpIHtcblx0XHRcdFx0Ly8gUHVsbCB0aGUgcGVuZGluZyBmaW5pc2ggY2FsbGJhY2sgKGlmIGFueSkgYW5kIGludm9rZSBpdCB3aXRoXG5cdFx0XHRcdC8vIGVtcHR5IHJlc3BvbnNlcyBzbyBzc2gyIHN0b3BzIHdhaXRpbmcgb24gdGhpcyBhdHRlbXB0IFx1MjAxNCB3aXRob3V0XG5cdFx0XHRcdC8vIHRoaXMsIHNzaDIgaGFuZ3MgdW50aWwgdGhlIGhhbmRzaGFrZSBkZWFkbGluZSBlbGFwc2VzIHdoZW4gYVxuXHRcdFx0XHQvLyBjb25uZWN0IGF0dGVtcHQgaXMgYWJvcnRlZCBtaWQtcHJvbXB0LiBUaGUgcmVuZGVyZXIgYWxzbyBnZXRzXG5cdFx0XHRcdC8vIG5vdGlmaWVkIHNvIGl0IGNhbiBkaXNtaXNzIGFueSBvcGVuIHF1aWNrLWlucHV0IFVJLlxuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0tiaVJlcXVlc3RzLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nS2JpUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZS5maXJlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHBlbmRpbmc/LmZpbmlzaChbXSk7XG5cdFx0XHR9XG5cdFx0XHRsaXZlS2JpUmVxdWVzdHMuY2xlYXIoKTtcblx0XHR9O1xuXG5cdFx0aWYgKGNvbmZpZy5hZ2VudEZvcndhcmQpIHtcblx0XHRcdGNvbnN0IGFnZW50U29jayA9IHRoaXMuX2dldEFnZW50U29ja2V0KGNvbmZpZyk7XG5cdFx0XHRpZiAoYWdlbnRTb2NrKSB7XG5cdFx0XHRcdC8vIHNzaDIgbmVlZHMgYGNvbm5lY3RDb25maWcuYWdlbnRgIHNldCBzbyBpdCBrbm93cyB3aGljaCBsb2NhbFxuXHRcdFx0XHQvLyBhZ2VudCBzb2NrZXQgdG8gZm9yd2FyZCB0by4gV2l0aG91dCBpdCwgYWdlbnQgZm9yd2FyZGluZyBpcyBhXG5cdFx0XHRcdC8vIG5vLW9wIGV2ZW4gaWYgYGFnZW50Rm9yd2FyZDogdHJ1ZWAgaXMgc2V0LlxuXHRcdFx0XHRjb25uZWN0Q29uZmlnLmFnZW50ID0gYWdlbnRTb2NrO1xuXHRcdFx0XHRjb25uZWN0Q29uZmlnLmFnZW50Rm9yd2FyZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTU0ggYWdlbnQgZm9yd2FyZGluZyBlbmFibGVkYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gU1NIIGFnZW50IGZvcndhcmRpbmcgcmVxdWVzdGVkLCBidXQgbm8gU1NIIGFnZW50IGVuZHBvaW50IGlzIGF2YWlsYWJsZTsgYWdlbnQgZm9yd2FyZGluZyBkaXNhYmxlZGApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZlcmlmeSB0aGUgc2VydmVyJ3MgaG9zdCBrZXkgZHVyaW5nIGtleSBleGNoYW5nZS4gV2l0aG91dCB0aGlzLCBzc2gyXG5cdFx0Ly8gYWNjZXB0cyBhbnkga2V5IGZyb20gYW55IHNlcnZlciAoXCJIb3N0IGFjY2VwdGVkIGJ5IGRlZmF1bHRcIiksIHdoaWNoXG5cdFx0Ly8gd291bGQgbGV0IGFuIG9uLXBhdGggYXR0YWNrZXIgaW1wZXJzb25hdGUgdGhlIHJlbW90ZSBhbmQgY29sbGVjdCB0aGVcblx0XHQvLyBwYXNzd29yZCB0eXBlZCBpbnRvIG91ciBvd24ga2V5Ym9hcmQtaW50ZXJhY3RpdmUgcHJvbXB0LiBob3N0VmVyaWZpZXJcblx0XHQvLyBydW5zIGJlZm9yZSBhdXRoZW50aWNhdGlvbiwgc28gZGVjbGluaW5nIGd1YXJhbnRlZXMgbm8gY3JlZGVudGlhbCBvclxuXHRcdC8vIGZvcndhcmRlZCBhZ2VudCBhY2Nlc3MgZXZlciByZWFjaGVzIGFuIHVudmVyaWZpZWQgc2VydmVyLlxuXHRcdC8vXG5cdFx0Ly8gTm90ZSB3ZSBkZWxpYmVyYXRlbHkgZG8gbm90IHNldCBgaG9zdEhhc2hgOiB0aGF0IHdvdWxkIG1ha2Ugc3NoMlxuXHRcdC8vIHByZS1oYXNoIHRoZSBrZXkgYW5kIGhhbmQgdXMgYSBoZXggZGlnZXN0LCBkaXNjYXJkaW5nIHRoZSByYXcgYmxvYiB3ZVxuXHRcdC8vIG5lZWQgdG8gY29tcGFyZSBhZ2FpbnN0IGBrbm93bl9ob3N0c2AgZW50cmllcy5cblx0XHRjb25zdCBsaXZlSG9zdEtleVJlcXVlc3RzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Ly8gU2V0IG9uY2UgdGhlIGNvbm5lY3QgYXR0ZW1wdCBzZXR0bGVzLCBzbyBhIHZlcmlmaWNhdGlvbiB0aGF0IGlzIHN0aWxsXG5cdFx0Ly8gZ2F0aGVyaW5nIGV2aWRlbmNlIGF0IHRoYXQgbW9tZW50IGNhbiBiYWlsIG91dCBpbnN0ZWFkIG9mIHJlZ2lzdGVyaW5nXG5cdFx0Ly8gaXRzZWxmIGFmdGVyIGNhbmNlbGxhdGlvbiBoYXMgYWxyZWFkeSBzd2VwdCB0aGUgc2V0LlxuXHRcdGxldCBob3N0S2V5VmVyaWZpY2F0aW9uQWJvcnRlZCA9IGZhbHNlO1xuXHRcdC8vIFNldCB3aGVuIHRoZSByZW5kZXJlciByZWZ1c2VzIGEgaG9zdCBrZXkgZm9yIHRoaXMgYXR0ZW1wdCwgc28gdGhlXG5cdFx0Ly8gcmVzdWx0aW5nIGhhbmRzaGFrZSBmYWlsdXJlIGNhbiBiZSByZXBvcnRlZCBhcyB3aGF0IGl0IGFjdHVhbGx5IGlzLlxuXHRcdGxldCBob3N0S2V5RGVuaWVkID0gZmFsc2U7XG5cdFx0Y29uc3QgY2FuY2VsTGl2ZUhvc3RLZXlSZXF1ZXN0cyA9ICgpID0+IHtcblx0XHRcdGhvc3RLZXlWZXJpZmljYXRpb25BYm9ydGVkID0gdHJ1ZTtcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdElkIG9mIGxpdmVIb3N0S2V5UmVxdWVzdHMpIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdIb3N0S2V5UmVxdWVzdHMuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdIb3N0S2V5UmVxdWVzdHMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsSG9zdEtleVZlcmlmaWNhdGlvbi5maXJlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdC8vIEZhaWwgY2xvc2VkOiBhbiBhYm9ydGVkIGNvbm5lY3QgbXVzdCBuZXZlciBsZWF2ZSBzc2gyIHdhaXRpbmdcblx0XHRcdFx0Ly8gb24gYSB2ZXJkaWN0IHVudGlsIHRoZSBkZWFkbGluZSBlbGFwc2VzLlxuXHRcdFx0XHRwZW5kaW5nPy52ZXJpZnkoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0bGl2ZUhvc3RLZXlSZXF1ZXN0cy5jbGVhcigpO1xuXHRcdH07XG5cdFx0Y29ubmVjdENvbmZpZy5ob3N0VmVyaWZpZXIgPSAoa2V5OiBCdWZmZXIsIHZlcmlmeTogKHBlcm1pdHRlZDogYm9vbGVhbikgPT4gdm9pZCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLl92ZXJpZnlIb3N0S2V5KFxuXHRcdFx0XHRjb25uZWN0aW9uS2V5ID8/IGRpc3BsYXlIb3N0LFxuXHRcdFx0XHRkaXNwbGF5SG9zdCxcblx0XHRcdFx0Y29uZmlnLFxuXHRcdFx0XHRwb3J0LFxuXHRcdFx0XHRrZXksXG5cdFx0XHRcdHZlcmlmeSxcblx0XHRcdFx0cmVxdWVzdElkID0+IHtcblx0XHRcdFx0XHRsaXZlSG9zdEtleVJlcXVlc3RzLmFkZChyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdC8vIEEgaHVtYW4gaXMgbm93IGluIHRoZSBsb29wOyBzdG9wIGhvbGRpbmcgdGhlbSB0byB0aGVcblx0XHRcdFx0XHQvLyBuZXR3b3JrLXNpemVkIGRlYWRsaW5lLlxuXHRcdFx0XHRcdGFybURlYWRsaW5lPy4oSU5URVJBQ1RJVkVfVElNRU9VVF9NUyk7XG5cdFx0XHRcdFx0cmV0dXJuICgpID0+IHsgaG9zdEtleURlbmllZCA9IHRydWU7IH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IGhvc3RLZXlWZXJpZmljYXRpb25BYm9ydGVkLFxuXHRcdFx0XHQoKSA9PiBhcm1EZWFkbGluZT8uKEhBTkRTSEFLRV9USU1FT1VUX01TKSxcblx0XHRcdCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2NyZWF0ZVNTSENsaWVudCgpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxTU0hDbGllbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0XHRsZXQgZGVhZGxpbmVUaW1lcjogSUhhbmRzaGFrZURlYWRsaW5lSGFuZGxlIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBjbGVhckRlYWRsaW5lID0gKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jbGVhckhhbmRzaGFrZURlYWRsaW5lKGRlYWRsaW5lVGltZXIpO1xuXHRcdFx0XHRkZWFkbGluZVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gUmVwbGFjZXMgc3NoMidzIGByZWFkeVRpbWVvdXRgIChkaXNhYmxlZCBhYm92ZSkgc28gdGhlIHdpbmRvdyBjYW5cblx0XHRcdC8vIGJlIHdpZGVuZWQgb25seSBmb3IgdGhlIGludGVydmFsIGEgcHJvbXB0IGlzIGFjdHVhbGx5IG91dHN0YW5kaW5nLlxuXHRcdFx0YXJtRGVhZGxpbmUgPSAobXM6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGVhckRlYWRsaW5lKCk7XG5cdFx0XHRcdGRlYWRsaW5lVGltZXIgPSB0aGlzLl9hcm1IYW5kc2hha2VEZWFkbGluZShtcywgKCkgPT4ge1xuXHRcdFx0XHRcdHJlamVjdENvbm5lY3QobmV3IEVycm9yKGBTU0ggaGFuZHNoYWtlIHRvICR7Y29uZmlnLmhvc3R9IHRpbWVkIG91dGApLCB0cnVlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXNvbHZlQ29ubmVjdCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHNldHRsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdGNsZWFyRGVhZGxpbmUoKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNTSCBjb25uZWN0aW9uIGVzdGFibGlzaGVkIHRvICR7Y29uZmlnLmhvc3R9YCk7XG5cdFx0XHRcdGNhbmNlbExpdmVLYmlSZXF1ZXN0cygpO1xuXHRcdFx0XHRjYW5jZWxMaXZlSG9zdEtleVJlcXVlc3RzKCk7XG5cdFx0XHRcdHJlc29sdmUoY2xpZW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlamVjdENvbm5lY3QgPSAoZXJyOiBFcnJvciwgZW5kQ2xpZW50OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRjbGVhckRlYWRsaW5lKCk7XG5cdFx0XHRcdGNhbmNlbExpdmVLYmlSZXF1ZXN0cygpO1xuXHRcdFx0XHRjYW5jZWxMaXZlSG9zdEtleVJlcXVlc3RzKCk7XG5cdFx0XHRcdGlmIChlbmRDbGllbnQpIHtcblx0XHRcdFx0XHRjbGllbnQuZW5kKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9O1xuXG5cdFx0XHRjYW5jZWxDb25uZWN0RnJvbUtiaSA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNTSCBrZXlib2FyZC1pbnRlcmFjdGl2ZSBwcm9tcHQgY2FuY2VsbGVkIGJ5IHVzZXIgZm9yICR7ZGlzcGxheUhvc3R9YCk7XG5cdFx0XHRcdHJlamVjdENvbm5lY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCksIHRydWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y2xpZW50Lm9uKCdyZWFkeScsICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZUNvbm5lY3QoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjbGllbnQub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSBTU0ggY29ubmVjdGlvbiBlcnJvcjogJHtlcnIubWVzc2FnZX1gKTtcblx0XHRcdFx0Ly8gc3NoMiByZXBvcnRzIGEgcmVmdXNlZCBob3N0IGtleSBhcyBcIkhvc3QgZGVuaWVkICh2ZXJpZmljYXRpb25cblx0XHRcdFx0Ly8gZmFpbGVkKVwiLCB3aGljaCBpcyBib3RoIGphcmdvbiBhbmQgcmVkdW5kYW50IFx1MjAxNCB0aGUgaG9zdCBrZXlcblx0XHRcdFx0Ly8gVUkgaGFzIGFscmVhZHkgdG9sZCB0aGUgdXNlciB3aGF0IGhhcHBlbmVkLlxuXHRcdFx0XHRyZWplY3RDb25uZWN0KGhvc3RLZXlEZW5pZWQgPyBuZXcgU1NISG9zdEtleURlbmllZEVycm9yKGRpc3BsYXlIb3N0KSA6IGVyciwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEEgc2VydmVyIGNhbiBkcm9wIHRoZSBjb25uZWN0aW9uIGNsZWFubHkgbWlkLWhhbmRzaGFrZSAoZm9yXG5cdFx0XHQvLyBleGFtcGxlIHNzaGQgcmVmdXNpbmcgYSBzZXNzaW9uIHVuZGVyIE1heFN0YXJ0dXBzKSwgaW4gd2hpY2ggY2FzZVxuXHRcdFx0Ly8gc3NoMiBlbWl0cyBvbmx5ICdlbmQnLydjbG9zZScgd2l0aCBubyAnZXJyb3InLiBXaXRob3V0IHRoaXMgdGhlXG5cdFx0XHQvLyBjb25uZWN0IHByb21pc2Ugd291bGQgbmV2ZXIgc2V0dGxlIGFuZCBhbnkgb3V0c3RhbmRpbmcgaG9zdCBrZXlcblx0XHRcdC8vIHByb21wdCB3b3VsZCBiZSBsZWZ0IG9uIHNjcmVlbiBmb3JldmVyLlxuXHRcdFx0Y2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdFx0cmVqZWN0Q29ubmVjdChcblx0XHRcdFx0XHRob3N0S2V5RGVuaWVkXG5cdFx0XHRcdFx0XHQ/IG5ldyBTU0hIb3N0S2V5RGVuaWVkRXJyb3IoZGlzcGxheUhvc3QpXG5cdFx0XHRcdFx0XHQ6IG5ldyBFcnJvcihgU1NIIGNvbm5lY3Rpb24gdG8gJHtjb25maWcuaG9zdH0gY2xvc2VkIGJlZm9yZSB0aGUgaGFuZHNoYWtlIGNvbXBsZXRlZGApLFxuXHRcdFx0XHRcdGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBIHNlcnZlciBtYXkgYW5ub3VuY2UgaXRzIGZ1bGwgaG9zdCBrZXkgc2V0IG92ZXIgdGhlXG5cdFx0XHQvLyBhbHJlYWR5LWF1dGhlbnRpY2F0ZWQgY2hhbm5lbCAoT3BlblNTSCdzIFVwZGF0ZUhvc3RLZXlzKS4gc3NoMlxuXHRcdFx0Ly8gY29tcGxldGVzIHRoZSBgaG9zdGtleXMtcHJvdmVgIGNoYWxsZW5nZSBhbmQgdmVyaWZpZXMgdGhlXG5cdFx0XHQvLyBzaWduYXR1cmVzIGJlZm9yZSBlbWl0dGluZywgc28gdGhlc2UgYXJlIHNhZmUgdG8gcGVyc2lzdCB3aXRob3V0XG5cdFx0XHQvLyBwcm9tcHRpbmcgXHUyMDE0IHRoaXMgaXMgd2hhdCBsZXRzIGEgbGVnaXRpbWF0ZSBrZXkgcm90YXRpb24gYmVcblx0XHRcdC8vIGxlYXJuZWQgc2lsZW50bHkgaW5zdGVhZCBvZiBzdXJmYWNpbmcgYXMgYSBzY2FyeSBtaXNtYXRjaCBsYXRlci5cblx0XHRcdGNsaWVudC5vbignaG9zdGtleXMnLCAoa2V5czogcmVhZG9ubHkgeyBnZXRQdWJsaWNTU0goKTogQnVmZmVyOyB0eXBlOiBzdHJpbmcgfVtdKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUFubm91bmNlZEhvc3RLZXlzKGNvbm5lY3Rpb25LZXkgPz8gZGlzcGxheUhvc3QsIGNvbmZpZy5ob3N0LCBwb3J0LCBrZXlzKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhcm1EZWFkbGluZShIQU5EU0hBS0VfVElNRU9VVF9NUyk7XG5cdFx0XHRjbGllbnQuY29ubmVjdChjb25uZWN0Q29uZmlnKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcm0gdGhlIGhhbmRzaGFrZSBkZWFkbGluZS4gT3ZlcnJpZGFibGUgc28gdGVzdHMgY2FuIG9ic2VydmUgaG93IHRoZVxuXHQgKiB3aW5kb3cgY2hhbmdlcyBhcyBwcm9tcHRzIGNvbWUgYW5kIGdvIHdpdGhvdXQgd2FpdGluZyBvbiByZWFsIHRpbWVycy5cblx0ICovXG5cdHByb3RlY3RlZCBfYXJtSGFuZHNoYWtlRGVhZGxpbmUobXM6IG51bWJlciwgb25FeHBpcmVkOiAoKSA9PiB2b2lkKTogSUhhbmRzaGFrZURlYWRsaW5lSGFuZGxlIHtcblx0XHRyZXR1cm4gc2V0VGltZW91dChvbkV4cGlyZWQsIG1zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfY2xlYXJIYW5kc2hha2VEZWFkbGluZSh0aW1lcjogSUhhbmRzaGFrZURlYWRsaW5lSGFuZGxlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfY3JlYXRlU1NIQ2xpZW50KCk6IFByb21pc2U8U1NIQ2xpZW50PiB7XG5cdFx0Y29uc3QgbmF0aXZlUmVxdWlyZSA9IGF3YWl0IHRoaXMuX2dldE5hdGl2ZVJlcXVpcmUoKTtcblx0XHRjb25zdCBzc2gyTW9kdWxlID0gbmF0aXZlUmVxdWlyZSgnc3NoMicpIGFzIHsgQ2xpZW50OiBuZXcgKCkgPT4gdW5rbm93biB9O1xuXHRcdHJldHVybiBuZXcgc3NoMk1vZHVsZS5DbGllbnQoKSBhcyBTU0hDbGllbnQ7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIG9yZGVyZWQgbGlzdCBvZiBhdXRoZW50aWNhdGlvbiBhdHRlbXB0cyB0byBmZWVkIHRvIHNzaDInc1xuXHQgKiBgYXV0aEhhbmRsZXJgLiBJbiBgQWdlbnRgIG1vZGUgd2UgdHJ5IHRoZSBjb25maWd1cmVkIGFnZW50IGZpcnN0IChzbyBhXG5cdCAqIGxvYWRlZCBpZGVudGl0eSBzaG9ydC1jaXJjdWl0cyBiZWZvcmUgd2UgZXZlciB0b3VjaCBhbiBlbmNyeXB0ZWQga2V5XG5cdCAqIGZpbGUpLCB0aGVuIGFueSBub24tZGVmYXVsdCBleHBsaWNpdCBgSWRlbnRpdHlGaWxlYCwgdGhlbiBlYWNoIHJlYWRhYmxlXG5cdCAqIGRlZmF1bHQgaWRlbnRpdHkgaW4gdHVybi4gQSBob3N0IHRoYXQgYWNjZXB0cyBgfi8uc3NoL2lkX3JzYWAgc3RpbGxcblx0ICogd29ya3MgZXZlbiBpZiB0aGUgYWdlbnQgZG9lc24ndCBoYXZlIGl0IGxvYWRlZCBcdTIwMTQgd2l0aG91dCBuZWVkaW5nIGFuXG5cdCAqIGV4cGxpY2l0IGBJZGVudGl0eUZpbGVgIGVudHJ5IGluIGB+Ly5zc2gvY29uZmlnYC5cblx0ICovXG5cdHByb3RlY3RlZCBhc3luYyBfYnVpbGRBdXRoQXR0ZW1wdHMoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogUHJvbWlzZTxTU0hBdXRoQXR0ZW1wdFtdPiB7XG5cdFx0Y29uc3QgYXR0ZW1wdHM6IFNTSEF1dGhBdHRlbXB0W10gPSBbXTtcblx0XHRjb25zdCB1c2VybmFtZSA9IGNvbmZpZy51c2VybmFtZTtcblxuXHRcdHN3aXRjaCAoY29uZmlnLmF1dGhNZXRob2QpIHtcblx0XHRcdGNhc2UgU1NIQXV0aE1ldGhvZC5BZ2VudDoge1xuXHRcdFx0XHQvLyBUcnkgdGhlIGFnZW50IGZpcnN0OiBpZiBpdCBoYXMgYW55IG9mIHRoZSBjb25maWd1cmVkIGlkZW50aXRpZXNcblx0XHRcdFx0Ly8gbG9hZGVkLCBhdXRoIHN1Y2NlZWRzIHdpdGhvdXQgZXZlciB0b3VjaGluZyBvbi1kaXNrIGtleXMuIFRoaXNcblx0XHRcdFx0Ly8gbWF0Y2hlcyBPcGVuU1NIJ3MgSWRlbnRpdHlBZ2VudCBzZW1hbnRpY3MgYW5kIGF2b2lkcyBhblxuXHRcdFx0XHQvLyB1bm5lY2Vzc2FyeSBwYXNzcGhyYXNlIHByb21wdCB3aGVuIGFuIGVuY3J5cHRlZCBrZXkgZmlsZSBpc1xuXHRcdFx0XHQvLyBjb25maWd1cmVkIGJ1dCB0aGUgYWdlbnQgYWxyZWFkeSBob2xkcyBpdHMgdW5sb2NrZWQgY29weS5cblx0XHRcdFx0Y29uc3QgYWdlbnRTb2NrID0gdGhpcy5fZ2V0QWdlbnRTb2NrZXQoY29uZmlnKTtcblx0XHRcdFx0aWYgKGFnZW50U29jaykge1xuXHRcdFx0XHRcdGF0dGVtcHRzLnB1c2goeyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZSwgYWdlbnQ6IGFnZW50U29jayB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBleHBsaWNpdEtleVBhdGggPSBjb25maWcucHJpdmF0ZUtleVBhdGg7XG5cdFx0XHRcdGNvbnN0IGV4cGxpY2l0SXNEZWZhdWx0ID0gZXhwbGljaXRLZXlQYXRoICE9PSB1bmRlZmluZWQgJiYgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2lzRGVmYXVsdEtleVBhdGgoZXhwbGljaXRLZXlQYXRoKTtcblx0XHRcdFx0aWYgKGV4cGxpY2l0S2V5UGF0aCAmJiAhZXhwbGljaXRJc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRjb25zdCBleHBsaWNpdCA9IGF3YWl0IHRoaXMuX3JlYWRLZXlGaWxlSWZFeGlzdHMoZXhwbGljaXRLZXlQYXRoKTtcblx0XHRcdFx0XHRpZiAoZXhwbGljaXQpIHtcblx0XHRcdFx0XHRcdGF0dGVtcHRzLnB1c2goeyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWUsIGtleTogZXhwbGljaXQsIGtleVBhdGg6IGV4cGxpY2l0S2V5UGF0aCwgLi4uKGlzRW5jcnlwdGVkUHJpdmF0ZUtleShleHBsaWNpdCkgPyB7IGVuY3J5cHRlZDogdHJ1ZSB9IDogdW5kZWZpbmVkKSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBrZXlQYXRoIG9mIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLl9kZWZhdWx0S2V5UGF0aHMpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX3JlYWRLZXlGaWxlSWZFeGlzdHMoa2V5UGF0aCk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnRzKSB7XG5cdFx0XHRcdFx0XHRhdHRlbXB0cy5wdXNoKHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lLCBrZXk6IGNvbnRlbnRzLCBrZXlQYXRoLCAuLi4oaXNFbmNyeXB0ZWRQcml2YXRlS2V5KGNvbnRlbnRzKSA/IHsgZW5jcnlwdGVkOiB0cnVlIH0gOiB1bmRlZmluZWQpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBGaW5hbCBmYWxsYmFjazoga2V5Ym9hcmQtaW50ZXJhY3RpdmUgKHR5cGljYWxseSBhIHBhc3N3b3JkIHByb21wdCkuXG5cdFx0XHRcdC8vIE9ubHkgbWVhbmluZ2Z1bCBpZiB0aGUgc2VydmVyIGFkdmVydGlzZXMgaXQ7IHRoZSBhdXRoIGhhbmRsZXJcblx0XHRcdFx0Ly8gd2lsbCBza2lwIGl0IG90aGVyd2lzZS4gVGhlIHByb21wdCBpcyBmb3J3YXJkZWQgdG8gdGhlIHJlbmRlcmVyXG5cdFx0XHRcdC8vIHZpYSB7QGxpbmsgb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZX0uXG5cdFx0XHRcdGF0dGVtcHRzLnB1c2goeyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFNTSEF1dGhNZXRob2QuS2V5RmlsZToge1xuXHRcdFx0XHQvLyBLZXlGaWxlIG1vZGUgaGFzIG5vIGZhbGxiYWNrcyBcdTIwMTQgZmFpbCBmYXN0IHdpdGggYSBjbGVhciBlcnJvciBpZlxuXHRcdFx0XHQvLyB0aGUga2V5IGlzIG1pc3Npbmcgb3IgdW5yZWFkYWJsZSwgcmF0aGVyIHRoYW4gbGV0dGluZyBpdCBzdXJmYWNlXG5cdFx0XHRcdC8vIGRvd25zdHJlYW0gYXMgYSBnZW5lcmljIGF1dGggZmFpbHVyZS5cblx0XHRcdFx0aWYgKCFjb25maWcucHJpdmF0ZUtleVBhdGgpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3NzaC5rZXlGaWxlQXV0aFJlcXVpcmVzUGF0aCcsIFwiS2V5IGZpbGUgYXV0aGVudGljYXRpb24gcmVxdWlyZXMgYSBwcml2YXRlIGtleSBwYXRoLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXhwbGljaXQgPSBhd2FpdCB0aGlzLl9yZWFkS2V5RmlsZUlmRXhpc3RzKGNvbmZpZy5wcml2YXRlS2V5UGF0aCk7XG5cdFx0XHRcdGlmICghZXhwbGljaXQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3NzaC5mYWlsZWRUb1JlYWRQcml2YXRlS2V5JywgXCJGYWlsZWQgdG8gcmVhZCBwcml2YXRlIGtleSBmaWxlOiB7MH1cIiwgY29uZmlnLnByaXZhdGVLZXlQYXRoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXR0ZW1wdHMucHVzaCh7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZSwga2V5OiBleHBsaWNpdCwga2V5UGF0aDogY29uZmlnLnByaXZhdGVLZXlQYXRoLCAuLi4oaXNFbmNyeXB0ZWRQcml2YXRlS2V5KGV4cGxpY2l0KSA/IHsgZW5jcnlwdGVkOiB0cnVlIH0gOiB1bmRlZmluZWQpIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgU1NIQXV0aE1ldGhvZC5QYXNzd29yZDoge1xuXHRcdFx0XHRpZiAoY29uZmlnLnBhc3N3b3JkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRhdHRlbXB0cy5wdXNoKHsgdHlwZTogJ3Bhc3N3b3JkJywgdXNlcm5hbWUsIHBhc3N3b3JkOiBjb25maWcucGFzc3dvcmQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF0dGVtcHRzO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2RlZmF1bHRLZXlQYXRocyA9IFtcblx0XHQnfi8uc3NoL2lkX2VkMjU1MTknLFxuXHRcdCd+Ly5zc2gvaWRfcnNhJyxcblx0XHQnfi8uc3NoL2lkX2VjZHNhJyxcblx0XHQnfi8uc3NoL2lkX2RzYScsXG5cdFx0J34vLnNzaC9pZF94bXNzJyxcblx0XTtcblxuXHQvKipcblx0ICogRXhwYW5kIGEgbGVhZGluZyBgfmAgdG8gdGhlIGN1cnJlbnQgdXNlcidzIGhvbWUgZGlyZWN0b3J5IHNvIHRoYXQgcGF0aHNcblx0ICogY29taW5nIGJhY2sgZnJvbSBgc3NoIC1HYCAoYWx3YXlzIGFic29sdXRlKSBjb21wYXJlIGVxdWFsIHRvIG91clxuXHQgKiBgfmAtcHJlZml4ZWQgZGVmYXVsdHMuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfbm9ybWFsaXplS2V5UGF0aChrZXlQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXlQYXRoLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc0RlZmF1bHRLZXlQYXRoKGtleVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZS5fbm9ybWFsaXplS2V5UGF0aChrZXlQYXRoKTtcblx0XHRyZXR1cm4gU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX2RlZmF1bHRLZXlQYXRocy5zb21lKHAgPT4gU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuX25vcm1hbGl6ZUtleVBhdGgocCkgPT09IG5vcm1hbGl6ZWQpO1xuXHR9XG5cblx0LyoqIFRlc3Qgc2VhbTogcmV0dXJucyB0aGUgU1NIIGFnZW50IHNvY2tldCBwYXRoLCBvciB1bmRlZmluZWQgd2hlbiBubyBhZ2VudCBpcyBhdmFpbGFibGUuICovXG5cdHByb3RlY3RlZCBfaXNBZ2VudEF2YWlsYWJsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwcm9jZXNzLmVudlsnU1NIX0FVVEhfU09DSyddO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBZ2VudFNvY2tldChjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChjb25maWcuaWRlbnRpdHlBZ2VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUlkZW50aXR5QWdlbnQoY29uZmlnLmlkZW50aXR5QWdlbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faXNBZ2VudEF2YWlsYWJsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUlkZW50aXR5QWdlbnQoaWRlbnRpdHlBZ2VudDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0cmltbWVkID0gaWRlbnRpdHlBZ2VudC50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkIHx8IHRyaW1tZWQudG9Mb3dlckNhc2UoKSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodHJpbW1lZCA9PT0gJ1NTSF9BVVRIX1NPQ0snKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXNBZ2VudEF2YWlsYWJsZSgpO1xuXHRcdH1cblx0XHRpZiAodHJpbW1lZC5zdGFydHNXaXRoKCckJykpIHtcblx0XHRcdGNvbnN0IGVudk1hdGNoID0gL15cXCRcXHsoPzxicmFjZWQ+W0EtWmEtel9dW0EtWmEtejAtOV9dKilcXH0kfF5cXCQoPzxwbGFpbj5bQS1aYS16X11bQS1aYS16MC05X10qKSQvLmV4ZWModHJpbW1lZCk7XG5cdFx0XHRyZXR1cm4gZW52TWF0Y2g/Lmdyb3VwcyA/IHByb2Nlc3MuZW52W2Vudk1hdGNoLmdyb3Vwcy5icmFjZWQgPz8gZW52TWF0Y2guZ3JvdXBzLnBsYWluXSB8fCB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cmltbWVkLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkIGEga2V5Ym9hcmQtaW50ZXJhY3RpdmUgY2hhbGxlbmdlIGZyb20gc3NoMiB0byB0aGUgcmVuZGVyZXIgYW5kXG5cdCAqIHJlZ2lzdGVyIHRoZSBgZmluaXNoYCBjYWxsYmFjayBzbyB7QGxpbmsgcmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmV9IGNhblxuXHQgKiBzdXBwbHkgdGhlIHVzZXIncyByZXNwb25zZXMgd2hlbiB0aGV5IGFycml2ZS4gUmV0dXJucyB0aGUgZ2VuZXJhdGVkXG5cdCAqIGByZXF1ZXN0SWRgIHNvIHRoZSBjYWxsZXIgY2FuIHRyYWNrIGluLWZsaWdodCBwcm9tcHRzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9oYW5kbGVLZXlib2FyZEludGVyYWN0aXZlKFxuXHRcdGNvbm5lY3Rpb25LZXk6IHN0cmluZyxcblx0XHRkaXNwbGF5SG9zdDogc3RyaW5nLFxuXHRcdHVzZXJuYW1lOiBzdHJpbmcsXG5cdFx0bmFtZTogc3RyaW5nLFxuXHRcdGluc3RydWN0aW9uczogc3RyaW5nLFxuXHRcdHByb21wdHM6IHJlYWRvbmx5IElTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0W10sXG5cdFx0ZmluaXNoOiAocmVzcG9uc2VzOiByZWFkb25seSBzdHJpbmdbXSkgPT4gdm9pZCxcblx0XHRjYW5jZWxDb25uZWN0OiAoKSA9PiB2b2lkLFxuXHQpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGBrYmktJHsrK3RoaXMuX2tiaVJlcXVlc3RDb3VudGVyfWA7XG5cdFx0Ly8gV3JhcCBmaW5pc2ggc28gaXQgY2FuIG9ubHkgZmlyZSBvbmNlIFx1MjAxNCBzc2gyIGlnbm9yZXMgZHVwbGljYXRlIGNhbGxzLFxuXHRcdC8vIGJ1dCB3ZSBhbHNvIHdhbnQgdG8gZW5zdXJlIHdlIGRyb3AgdGhlIHBlbmRpbmcgZW50cnkgZXhhY3RseSBvbmNlLlxuXHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZmluaXNoT25jZSA9IChyZXNwb25zZXM6IHJlYWRvbmx5IHN0cmluZ1tdKSA9PiB7XG5cdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3BlbmRpbmdLYmlSZXF1ZXN0cy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdGZpbmlzaChyZXNwb25zZXMpO1xuXHRcdH07XG5cdFx0dGhpcy5fcGVuZGluZ0tiaVJlcXVlc3RzLnNldChyZXF1ZXN0SWQsIHsgZmluaXNoOiBmaW5pc2hPbmNlLCBjYW5jZWxDb25uZWN0IH0pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBrZXlib2FyZC1pbnRlcmFjdGl2ZSBjaGFsbGVuZ2UgZnJvbSAke2Rpc3BsYXlIb3N0fTogJHtwcm9tcHRzLmxlbmd0aH0gcHJvbXB0KHMpYCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZS5maXJlKHtcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdGNvbm5lY3Rpb25LZXksXG5cdFx0XHRkaXNwbGF5SG9zdCxcblx0XHRcdHVzZXJuYW1lLFxuXHRcdFx0bmFtZSxcblx0XHRcdGluc3RydWN0aW9ucyxcblx0XHRcdHByb21wdHM6IHByb21wdHMubWFwKHAgPT4gKHsgcHJvbXB0OiBwLnByb21wdCwgZWNobzogcC5lY2hvIH0pKSxcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVxdWVzdElkO1xuXHR9XG5cblx0YXN5bmMgcmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdElkOiBzdHJpbmcsIHJlc3BvbnNlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0tiaVJlcXVlc3RzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IHJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlOiBubyBwZW5kaW5nIHJlcXVlc3QgZm9yICR7cmVxdWVzdElkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocmVzcG9uc2VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHBlbmRpbmcuY2FuY2VsQ29ubmVjdCgpO1xuXHRcdFx0cGVuZGluZy5maW5pc2goW10pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwZW5kaW5nLmZpbmlzaChyZXNwb25zZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWQgZXZlcnkgYGtub3duX2hvc3RzYCBmaWxlIHRoYXQgYXBwbGllcyB0byBgaG9zdGAgYW5kIHJldHVybiB0aGVcblx0ICogcGFyc2VkIGVudHJpZXMuIE92ZXJyaWRhYmxlIHNvIHRlc3RzIGNhbiBzdXBwbHkgZW50cmllcyB3aXRob3V0IHRvdWNoaW5nXG5cdCAqIHRoZSBkZXZlbG9wZXIncyByZWFsIFNTSCBzZXR1cC5cblx0ICpcblx0ICogUmVzb2x1dGlvbiBkZWxpYmVyYXRlbHkgZ29lcyB0aHJvdWdoIGBzc2ggLUdgIHJhdGhlciB0aGFuIGFzc3VtaW5nXG5cdCAqIGB+Ly5zc2gva25vd25faG9zdHNgLCBzbyBhIHVzZXIgd2hvIGhhcyByZWRpcmVjdGVkIGBVc2VyS25vd25Ib3N0c0ZpbGVgXG5cdCAqIGdldHMgdGhlIGZpbGVzIHRoZXkgYWN0dWFsbHkgY29uZmlndXJlZC4gQSBmYWlsdXJlIGhlcmUgaXMgbm90IGZhdGFsOiB3ZVxuXHQgKiBmYWxsIGJhY2sgdG8gbm8gZW50cmllcywgd2hpY2ggZG93bmdyYWRlcyB0byBhIHRydXN0IHByb21wdCByYXRoZXIgdGhhblxuXHQgKiBzaWxlbnRseSBhY2NlcHRpbmcgYW4gdW52ZXJpZmllZCBrZXkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYXN5bmMgX3JlYWRLbm93bkhvc3RzRW50cmllcyhob3N0OiBzdHJpbmcpOiBQcm9taXNlPHsgZW50cmllczogSUtub3duSG9zdHNFbnRyeVtdOyBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6IFNTSFN0cmljdEhvc3RLZXlDaGVja2luZyB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0bGV0IHJlc29sdmVkOiBJU1NIUmVzb2x2ZWRDb25maWcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc29sdmVkID0gYXdhaXQgdGhpcy5yZXNvbHZlU1NIQ29uZmlnKGhvc3QpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IENvdWxkIG5vdCByZXNvbHZlIFNTSCBjb25maWcgZm9yIGtub3duX2hvc3RzIGxvb2t1cCBvZiAke2hvc3R9OiAke2Vycn1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXRocyA9IFtcblx0XHRcdC4uLihyZXNvbHZlZD8udXNlcktub3duSG9zdHNGaWxlcyA/PyBbJ34vLnNzaC9rbm93bl9ob3N0cyddKSxcblx0XHRcdC4uLihyZXNvbHZlZD8uZ2xvYmFsS25vd25Ib3N0c0ZpbGVzID8/IFtdKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZW50cmllczogSUtub3duSG9zdHNFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG5cdFx0XHRjb25zdCBleHBhbmRlZCA9IHBhdGgucmVwbGFjZSgvXn4vLCBvcy5ob21lZGlyKCkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKC4uLnBhcnNlS25vd25Ib3N0cyhhd2FpdCBmc3AucmVhZEZpbGUoZXhwYW5kZWQsICd1dGYtOCcpKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gTWlzc2luZyBvciB1bnJlYWRhYmxlIGtub3duX2hvc3RzIGZpbGVzIGFyZSBub3JtYWwgKG1vc3Rcblx0XHRcdFx0Ly8gc3lzdGVtcyBoYXZlIG5vIGtub3duX2hvc3RzMiBhbmQgbm8gZ2xvYmFsIGZpbGUpLlxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBlbnRyaWVzLCBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6IHJlc29sdmVkPy5zdHJpY3RIb3N0S2V5Q2hlY2tpbmcgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZWNpZGUgd2hldGhlciBhIHByZXNlbnRlZCBob3N0IGtleSBzaG91bGQgYmUgdHJ1c3RlZCwgYnkgZ2F0aGVyaW5nIHRoZVxuXHQgKiBldmlkZW5jZSB0aGUgcmVuZGVyZXIgbmVlZHMgYW5kIGFza2luZyBpdCB0byBhcHBseSBwb2xpY3kuXG5cdCAqXG5cdCAqIFRoaXMgcHJvY2VzcyBvbmx5IGNvbGxlY3RzIGZhY3RzIFx1MjAxNCB0aGUgZmluZ2VycHJpbnQgYW5kIHdoYXQgdGhlIHVzZXInc1xuXHQgKiBga25vd25faG9zdHNgIGZpbGVzIHNheS4gVGhlIHJlbmRlcmVyIG93bnMgdGhlIGRlY2lzaW9uIGJlY2F1c2UgaXQgaG9sZHNcblx0ICogdGhlIHRydXN0IHN0b3JlIGFuZCB0aGUgVUkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF92ZXJpZnlIb3N0S2V5KFxuXHRcdGNvbm5lY3Rpb25LZXk6IHN0cmluZyxcblx0XHRkaXNwbGF5SG9zdDogc3RyaW5nLFxuXHRcdGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyxcblx0XHRwb3J0OiBudW1iZXIsXG5cdFx0a2V5OiBCdWZmZXIsXG5cdFx0dmVyaWZ5OiAocGVybWl0dGVkOiBib29sZWFuKSA9PiB2b2lkLFxuXHRcdG9uUmVxdWVzdDogKHJlcXVlc3RJZDogc3RyaW5nKSA9PiAoKCkgPT4gdm9pZCkgfCB2b2lkLFxuXHRcdGlzQWJvcnRlZDogKCkgPT4gYm9vbGVhbixcblx0XHRvblByb21wdFNldHRsZWQ6ICgpID0+IHZvaWQsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0bGV0IHByb21wdGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgdmVyaWZ5T25jZSA9IChwZXJtaXR0ZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0aWYgKHByb21wdGVkKSB7XG5cdFx0XHRcdC8vIFRoZSBodW1hbiBpcyBvdXQgb2YgdGhlIGxvb3A7IHJlc3RvcmUgdGhlIG5ldHdvcmsgZGVhZGxpbmUgc29cblx0XHRcdFx0Ly8gdGhlIHJlc3Qgb2YgdGhlIGhhbmRzaGFrZSBpcyBub3QgaGVsZCB0byB0aGUgbG9uZyB3aW5kb3cuXG5cdFx0XHRcdG9uUHJvbXB0U2V0dGxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0dmVyaWZ5KHBlcm1pdHRlZCk7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBrZXlUeXBlID0gcmVhZEhvc3RLZXlUeXBlKGtleSk7XG5cdFx0XHRpZiAoIWtleVR5cGUpIHtcblx0XHRcdFx0Ly8gQSBibG9iIHdob3NlIHNlbGYtZGVjbGFyZWQgYWxnb3JpdGhtIHdlIGNhbm5vdCByZWFkIGlzIG5vdFxuXHRcdFx0XHQvLyBzb21ldGhpbmcgd2UgY2FuIG1lYW5pbmdmdWxseSBzaG93IHRoZSB1c2VyIG9yIGNvbXBhcmUsIHNvXG5cdFx0XHRcdC8vIHJlZnVzZSByYXRoZXIgdGhhbiBwcm9tcHRpbmcgYWJvdXQgYW4gdW5pZGVudGlmaWFibGUga2V5LlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IFJlamVjdGluZyBtYWxmb3JtZWQgaG9zdCBrZXkgZnJvbSAke2Rpc3BsYXlIb3N0fWApO1xuXHRcdFx0XHR2ZXJpZnlPbmNlKGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaW5nZXJwcmludCA9IGNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQoa2V5KTtcblx0XHRcdGNvbnN0IHsgZW50cmllcywgc3RyaWN0SG9zdEtleUNoZWNraW5nIH0gPSBhd2FpdCB0aGlzLl9yZWFkS25vd25Ib3N0c0VudHJpZXMoY29uZmlnLnNzaENvbmZpZ0hvc3QgPz8gY29uZmlnLmhvc3QpO1xuXG5cdFx0XHQvLyBHYXRoZXJpbmcgZXZpZGVuY2UgaXMgYXN5bmNocm9ub3VzLCBzbyB0aGUgY29ubmVjdCBhdHRlbXB0IG1heVxuXHRcdFx0Ly8gaGF2ZSBmYWlsZWQgd2hpbGUgd2Ugd2VyZSByZWFkaW5nIGtub3duX2hvc3RzLiBSZWdpc3RlcmluZyBub3dcblx0XHRcdC8vIHdvdWxkIGxlYWsgYSBwZW5kaW5nIGVudHJ5IHRoYXQgbm90aGluZyB3aWxsIGV2ZXIgc2V0dGxlLCBhbmRcblx0XHRcdC8vIHdvdWxkIHByb21wdCB0aGUgdXNlciBhYm91dCBhIGNvbm5lY3Rpb24gdGhhdCBpcyBhbHJlYWR5IGdvbmUuXG5cdFx0XHRpZiAoaXNBYm9ydGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IEFiYW5kb25pbmcgaG9zdCBrZXkgdmVyaWZpY2F0aW9uIGZvciAke2Rpc3BsYXlIb3N0fTogY29ubmVjdCBhdHRlbXB0IGFscmVhZHkgc2V0dGxlZGApO1xuXHRcdFx0XHR2ZXJpZnlPbmNlKGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrbm93bkhvc3RzTWF0Y2ggPSBtYXRjaEtub3duSG9zdHMoZW50cmllcywgY29uZmlnLmhvc3QsIHBvcnQsIGtleVR5cGUsIGtleSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gSG9zdCBrZXkgZm9yICR7ZGlzcGxheUhvc3R9OiAke2tleVR5cGV9ICR7ZmluZ2VycHJpbnR9IChrbm93bl9ob3N0czogJHtrbm93bkhvc3RzTWF0Y2h9KWApO1xuXG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBgaG9zdGtleS0keysrdGhpcy5faG9zdEtleVJlcXVlc3RDb3VudGVyfWA7XG5cdFx0XHRwcm9tcHRlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBvblVzZXJEZW5pZWQgPSBvblJlcXVlc3QocmVxdWVzdElkKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wZW5kaW5nSG9zdEtleVJlcXVlc3RzLnNldChyZXF1ZXN0SWQsIHsgdmVyaWZ5OiB2ZXJpZnlPbmNlLCBvblVzZXJEZW5pZWQgfSk7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RIb3N0S2V5VmVyaWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRcdGNvbm5lY3Rpb25LZXksXG5cdFx0XHRcdGRpc3BsYXlIb3N0LFxuXHRcdFx0XHRob3N0OiBjb25maWcuaG9zdCxcblx0XHRcdFx0cG9ydCxcblx0XHRcdFx0a2V5VHlwZSxcblx0XHRcdFx0ZmluZ2VycHJpbnQsXG5cdFx0XHRcdGtub3duSG9zdHNNYXRjaCxcblx0XHRcdFx0Li4uKHN0cmljdEhvc3RLZXlDaGVja2luZyA/IHsgc3RyaWN0SG9zdEtleUNoZWNraW5nIH0gOiB1bmRlZmluZWQpLFxuXHRcdFx0XHR1c2VySW5pdGlhdGVkOiBjb25maWcudXNlckluaXRpYXRlZCA/PyB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBGYWlsIGNsb3NlZC4gQW55dGhpbmcgdW5leHBlY3RlZCB3aGlsZSBnYXRoZXJpbmcgZXZpZGVuY2UgbXVzdFxuXHRcdFx0Ly8gZGVueSByYXRoZXIgdGhhbiBhY2NlcHQsIG9yIGEgdHJhbnNpZW50IGVycm9yIGJlY29tZXMgYSB3YXkgdG9cblx0XHRcdC8vIGJ5cGFzcyB2ZXJpZmljYXRpb24gZW50aXJlbHkuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IEhvc3Qga2V5IHZlcmlmaWNhdGlvbiBmYWlsZWQgZm9yICR7ZGlzcGxheUhvc3R9YCwgZXJyKTtcblx0XHRcdHZlcmlmeU9uY2UoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc3BvbmRIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3RJZDogc3RyaW5nLCB0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdIb3N0S2V5UmVxdWVzdHMuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gcmVzcG9uZEhvc3RLZXlWZXJpZmljYXRpb246IG5vIHBlbmRpbmcgcmVxdWVzdCBmb3IgJHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdIb3N0S2V5UmVxdWVzdHMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IEhvc3Qga2V5ICR7dHJ1c3RlZCA/ICdhY2NlcHRlZCcgOiAncmVqZWN0ZWQnfSBmb3IgcmVxdWVzdCAke3JlcXVlc3RJZH1gKTtcblx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdC8vIExldCB0aGUgY29ubmVjdCBhdHRlbXB0IHJlcG9ydCB0aGlzIGFzIGEgaG9zdCBrZXkgcmVmdXNhbCByYXRoZXJcblx0XHRcdC8vIHRoYW4gc3VyZmFjaW5nIHNzaDIncyBcIkhvc3QgZGVuaWVkICh2ZXJpZmljYXRpb24gZmFpbGVkKVwiLlxuXHRcdFx0cGVuZGluZy5vblVzZXJEZW5pZWQ/LigpO1xuXHRcdH1cblx0XHRwZW5kaW5nLnZlcmlmeSh0cnVzdGVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIGhvc3Qga2V5cyBhbm5vdW5jZWQgb3ZlciBhbiBhdXRoZW50aWNhdGVkIGNvbm5lY3Rpb24uIHNzaDIgaGFzXG5cdCAqIGFscmVhZHkgcHJvdmVuIGVhY2gga2V5IGJlbG9uZ3MgdG8gdGhpcyBzZXJ2ZXIgKGl0IHJ1bnMgdGhlXG5cdCAqIGBob3N0a2V5cy1wcm92ZS0wMEBvcGVuc3NoLmNvbWAgY2hhbGxlbmdlIGFuZCB2ZXJpZmllcyB0aGUgc2lnbmF0dXJlc1xuXHQgKiBiZWZvcmUgZW1pdHRpbmcpLCBzbyBjb25zdW1lcnMgbWF5IHBlcnNpc3QgdGhlbSB3aXRob3V0IHByb21wdGluZy5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUFubm91bmNlZEhvc3RLZXlzKFxuXHRcdGNvbm5lY3Rpb25LZXk6IHN0cmluZyxcblx0XHRob3N0OiBzdHJpbmcsXG5cdFx0cG9ydDogbnVtYmVyLFxuXHRcdGtleXM6IHJlYWRvbmx5IHsgZ2V0UHVibGljU1NIKCk6IEJ1ZmZlcjsgdHlwZTogc3RyaW5nIH1bXSxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgYW5ub3VuY2VkOiB7IGtleVR5cGU6IHN0cmluZzsgZmluZ2VycHJpbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBibG9iID0ga2V5LmdldFB1YmxpY1NTSCgpO1xuXHRcdFx0XHRjb25zdCBrZXlUeXBlID0gcmVhZEhvc3RLZXlUeXBlKGJsb2IpO1xuXHRcdFx0XHQvLyBTa2lwIGFueXRoaW5nIHdob3NlIGJsb2IgZGlzYWdyZWVzIHdpdGggaXRzIGRlY2xhcmVkIHR5cGVcblx0XHRcdFx0Ly8gKG5vdGFibHkgY2VydGlmaWNhdGVzLCB3aGljaCBzc2gyIG1pc3BhcnNlcykgcmF0aGVyIHRoYW5cblx0XHRcdFx0Ly8gcGVyc2lzdGluZyB0cnVzdCBpbiBhIGtleSB3ZSBkaWQgbm90IGNvcnJlY3RseSB1bmRlcnN0YW5kLlxuXHRcdFx0XHRpZiAoa2V5VHlwZSAmJiBrZXlUeXBlID09PSBrZXkudHlwZSkge1xuXHRcdFx0XHRcdGFubm91bmNlZC5wdXNoKHsga2V5VHlwZSwgZmluZ2VycHJpbnQ6IGNvbXB1dGVIb3N0S2V5RmluZ2VycHJpbnQoYmxvYikgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gU2tpcHBpbmcgdW5yZWFkYWJsZSBhbm5vdW5jZWQgaG9zdCBrZXkgZm9yICR7aG9zdH06ICR7ZXJyfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWFubm91bmNlZC5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNlcnZlciAke2hvc3R9IGFubm91bmNlZCAke2Fubm91bmNlZC5sZW5ndGh9IHByb3ZlbiBob3N0IGtleShzKWApO1xuXHRcdHRoaXMuX29uRGlkQW5ub3VuY2VIb3N0S2V5cy5maXJlKHsgY29ubmVjdGlvbktleSwgaG9zdCwgcG9ydCwga2V5czogYW5ub3VuY2VkIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFzayB0aGUgcmVuZGVyZXIgdG8gY2hvb3NlIGFtb25nIGxpdmUgcmVtb3RlIGFnZW50IGhvc3QgZW5kcG9pbnRzIChvclxuXHQgKiB0byBzcGF3biBhIG5ldyBkZWRpY2F0ZWQgb25lKSwgbWlycm9yaW5nIHRoZSBrZXlib2FyZC1pbnRlcmFjdGl2ZVxuXHQgKiBicmlkZ2UgaW4ge0BsaW5rIF9oYW5kbGVLZXlib2FyZEludGVyYWN0aXZlfS4gQWxzbyBzZXR0bGVzIChyZWplY3RzKVxuXHQgKiB3aXRoIGEge0BsaW5rIENhbmNlbGxhdGlvbkVycm9yfSBpZiBgY2xpZW50YCBjbG9zZXMgb3IgZXJyb3JzIHdoaWxlXG5cdCAqIHRoZSBwaWNrZXIgaXMgc3RpbGwgb3Blbiwgc28gYSBkcm9wcGVkIFNTSCBjb25uZWN0aW9uIGRvZXNuJ3QgbGVhdmVcblx0ICogdGhlIHJlbmRlcmVyJ3MgcGlja2VyIFVJIHN0dWNrIHdhaXRpbmcgZm9yZXZlci5cblx0ICovXG5cdHByaXZhdGUgX3JlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihcblx0XHRjbGllbnQ6IFNTSENsaWVudCxcblx0XHRjb25uZWN0aW9uS2V5OiBzdHJpbmcsXG5cdFx0ZGlzcGxheUhvc3Q6IHN0cmluZyxcblx0XHRjYW5kaWRhdGVzOiByZWFkb25seSBJQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YVtdLFxuXHQpOiBQcm9taXNlPElTU0hFbmRwb2ludFNlbGVjdGlvbj4ge1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGBlbmRwb2ludC0keysrdGhpcy5fZW5kcG9pbnRTZWxlY3Rpb25Db3VudGVyfWA7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElTU0hFbmRwb2ludFNlbGVjdGlvbj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IG9uQ2xpZW50VW5hdmFpbGFibGUgPSAoKSA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRW5kcG9pbnRTZWxlY3Rpb25zLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHRjbGllbnQucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25DbGllbnRVbmF2YWlsYWJsZSk7XG5cdFx0XHRcdGNsaWVudC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbkNsaWVudFVuYXZhaWxhYmxlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDYW5jZWxFbmRwb2ludFNlbGVjdGlvbi5maXJlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR9O1xuXHRcdFx0Y2xpZW50Lm9uKCdjbG9zZScsIG9uQ2xpZW50VW5hdmFpbGFibGUpO1xuXHRcdFx0Y2xpZW50Lm9uKCdlcnJvcicsIG9uQ2xpZW50VW5hdmFpbGFibGUpO1xuXG5cdFx0XHR0aGlzLl9wZW5kaW5nRW5kcG9pbnRTZWxlY3Rpb25zLnNldChyZXF1ZXN0SWQsIHNlbGVjdGlvbiA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRjbGllbnQucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25DbGllbnRVbmF2YWlsYWJsZSk7XG5cdFx0XHRcdGNsaWVudC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbkNsaWVudFVuYXZhaWxhYmxlKTtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHNlbGVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUmVxdWVzdGluZyBlbmRwb2ludCBzZWxlY3Rpb24gZm9yICR7ZGlzcGxheUhvc3R9OiAke2NhbmRpZGF0ZXMubGVuZ3RofSBjYW5kaWRhdGUocylgKTtcblx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uLmZpcmUoe1xuXHRcdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRcdGNvbm5lY3Rpb25LZXksXG5cdFx0XHRcdGRpc3BsYXlIb3N0LFxuXHRcdFx0XHRjYW5kaWRhdGVzOiBjYW5kaWRhdGVzLm1hcCgoYyk6IElTU0hFbmRwb2ludENhbmRpZGF0ZSA9PiAoeyB0eXBlOiBjLnR5cGUsIHBpZDogYy5waWQsIGluc3RhbmNlSWQ6IGMuaW5zdGFuY2VJZCwgcXVhbGl0eTogYy5xdWFsaXR5LCBlbmRwb2ludDogYy5lbmRwb2ludCB9KSksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJlc3BvbmRFbmRwb2ludFNlbGVjdGlvbihyZXF1ZXN0SWQ6IHN0cmluZywgc2VsZWN0aW9uOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0VuZHBvaW50U2VsZWN0aW9ucy5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSByZXNwb25kRW5kcG9pbnRTZWxlY3Rpb246IG5vIHBlbmRpbmcgcmVxdWVzdCBmb3IgJHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdFbmRwb2ludFNlbGVjdGlvbnMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0cGVuZGluZyhzZWxlY3Rpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3Qgc2VhbTogcmVhZCBhIHByaXZhdGUga2V5IGZpbGUgZnJvbSBkaXNrLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZVxuXHQgKiBmaWxlIGRvZXNuJ3QgZXhpc3Q7IGxvZ3MgYW5kIHJldHVybnMgYHVuZGVmaW5lZGAgZm9yIGFueSBvdGhlciByZWFkIGVycm9yXG5cdCAqIHNvIGEgc2luZ2xlIGJyb2tlbiBrZXkgZG9lc24ndCBhYm9ydCB0aGUgd2hvbGUgYXV0aCBmbG93LlxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIF9yZWFkS2V5RmlsZUlmRXhpc3RzKGtleVBhdGg6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBrZXlQYXRoLnJlcGxhY2UoL15+Lywgb3MuaG9tZWRpcigpKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGZzcC5yZWFkRmlsZShyZXNvbHZlZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IGVycm9yQ29kZSA9IChlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGU7XG5cdFx0XHRpZiAoZXJyb3JDb2RlID09PSAnRU5PRU5UJyB8fCBlcnJvckNvZGUgPT09ICdFTk9URElSJykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byByZWFkIFNTSCBrZXkgZmlsZSAke3Jlc29sdmVkfWAsIGVycm9yKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX3F1YWxpdHkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSB8fCAnaW5zaWRlcic7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfc2VydmVyRGF0YUZvbGRlck5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZHVjdFNlcnZpY2Uuc2VydmVyRGF0YUZvbGRlck5hbWUgPz8gJy52c2NvZGUtc2VydmVyLW9zcyc7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfY29tbWl0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdDtcblx0fVxuXG5cdHByb3RlY3RlZCBfc3RhcnRSZW1vdGVBZ2VudEhvc3QoXG5cdFx0Y2xpZW50OiBTU0hDbGllbnQsIGNsaUJpbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBjbGlEYXRhRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbW1hbmRPdmVycmlkZT86IHN0cmluZyxcblx0KTogUHJvbWlzZTx7IHBvcnQ6IG51bWJlcjsgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkOyBzdHJlYW06IFNTSENoYW5uZWwgfT4ge1xuXHRcdHJldHVybiBzdGFydFJlbW90ZUFnZW50SG9zdChjbGllbnQsIHRoaXMuX2xvZ1NlcnZpY2UsIGNsaUJpbiwgY2xpRGF0YURpciwgY29tbWFuZE92ZXJyaWRlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfY3JlYXRlV2ViU29ja2V0UmVsYXkoXG5cdFx0Y2xpZW50OiBTU0hDbGllbnQsXG5cdFx0ZW5kcG9pbnQ6IEFnZW50SG9zdEVuZHBvaW50QWRkcmVzcyxcblx0XHRyZWxheUNsaUJpbjogc3RyaW5nLFxuXHRcdHJlbGF5Q2xpRGF0YURpcjogc3RyaW5nLFxuXHRcdHJlbGF5SW5zdGFuY2VJZDogc3RyaW5nLFxuXHRcdHJlbGF5VXNlckRhdGFQYXRoOiBzdHJpbmcsXG5cdFx0Y29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0b25NZXNzYWdlOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkLCBvbkNsb3NlOiAoKSA9PiB2b2lkLFxuXHQpOiBQcm9taXNlPHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfT4ge1xuXHRcdGNvbnN0IG5hdGl2ZVJlcXVpcmUgPSBhd2FpdCB0aGlzLl9nZXROYXRpdmVSZXF1aXJlKCk7XG5cdFx0cmV0dXJuIGNyZWF0ZVdlYlNvY2tldFJlbGF5Rm9yRW5kcG9pbnQobmF0aXZlUmVxdWlyZSwgY2xpZW50LCBlbmRwb2ludCwgcmVsYXlDbGlCaW4sIHJlbGF5Q2xpRGF0YURpciwgcmVsYXlJbnN0YW5jZUlkLCByZWxheVVzZXJEYXRhUGF0aCwgY29ubmVjdGlvblRva2VuLCB0aGlzLl9sb2dTZXJ2aWNlLCBvbk1lc3NhZ2UsIG9uQ2xvc2UpO1xuXHR9XG5cblxuXHQvKipcblx0ICogUmVzb2x2ZSB3aGljaCBDTEkgYmluYXJ5IHRvIHJ1biBvbiB0aGUgcmVtb3RlLlxuXHQgKlxuXHQgKiBXaGVuIHRoZSBkZXNrdG9wIGhhcyBhIGBwcm9kdWN0U2VydmljZS5jb21taXRgIChyZWxlYXNlIGJ1aWxkcyksIHdlXG5cdCAqIHBpbiB0byB0aGF0IGNvbW1pdDogaW5zdGFsbCBhdCBgfi88c2VydmVyRGF0YUZvbGRlck5hbWU+LzxhcmNoaXZlPi08Y29tbWl0PmBcblx0ICogKHNoYXJpbmcgdGhlIGluc3RhbGwgcm9vdCB3aXRoIFJlbW90ZS1TU0gpLCByZXVzZSBvbiBmaWxlIGV4aXN0ZW5jZSxcblx0ICogZG93bmxvYWQgZnJvbSB0aGUgY29tbWl0LXBpbm5lZCBVUkwgb24gbWlzcywgYW5kIGNsZWFuIHVwIG9sZGVyXG5cdCAqIGNvbW1pdC1rZXllZCBDTElzIChrZWVwIGxhc3QgNSkuIFRoZSBhZ2VudCBob3N0IENMSSBkb2VzIG5vdFxuXHQgKiBzZWxmLXVwZGF0ZSBvbiB0aGlzIHBhdGgsIHNvIHRoZSBkZXNrdG9wIHB1c2hlcyBmcmVzaG5lc3Mgb24gZXZlcnlcblx0ICogZnJlc2ggc3RhcnQgXHUyMDE0IGJ1dCB0b2xlcmFudGx5OiBpZiB0aGUgZG93bmxvYWQgZmFpbHMgYW5kIGFueSBvdGhlclxuXHQgKiB1c2FibGUgQ0xJIGlzIHByZXNlbnQgKG90aGVyIGNvbW1pdC1rZXllZCBvciB0aGUgbGVnYWN5XG5cdCAqIGB+Ly52c2NvZGUtY2xpeywtPHF1YWxpdHk+fS88YXJjaGl2ZT5gKSwgd2UgZmFsbCBiYWNrIHRvIHRoZSBuZXdlc3Rcblx0ICogb25lIHJhdGhlciB0aGFuIHJlZnVzaW5nIHRvIGNvbm5lY3QuXG5cdCAqXG5cdCAqIEluIGRldi9PU1MgYnVpbGRzIHdpdGggbm8gY29tbWl0LCB3ZSBrZWVwIGEgbG9vc2UsIG5vbi1waW5uZWQgaW5zdGFsbFxuXHQgKiBhdCBgfi88c2VydmVyRGF0YUZvbGRlck5hbWU+LzxhcmNoaXZlPmAuIEV4aXN0aW5nIENMSXMgc2VsZi11cGRhdGVcblx0ICogYWdhaW5zdCB0aGUgbGF0ZXN0IHJlbGVhc2UgYmVmb3JlIHJldXNlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSByZXNvbHZlZCBDTEkgYmluYXJ5IHBhdGggdG8gcnVuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ0xJSW5zdGFsbGVkKGNsaWVudDogU1NIQ2xpZW50LCBwbGF0Zm9ybTogeyBvczogc3RyaW5nOyBhcmNoOiBzdHJpbmcgfSwgcmVwb3J0UHJvZ3Jlc3M6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNvbW1pdCA9IHRoaXMuX2NvbW1pdDtcblx0XHRpZiAoIWNvbW1pdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZUNMSUluc3RhbGxlZExvb3NlKGNsaWVudCwgcGxhdGZvcm0sIHJlcG9ydFByb2dyZXNzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZUNMSUluc3RhbGxlZFBpbm5lZChjbGllbnQsIHBsYXRmb3JtLCByZXBvcnRQcm9ncmVzcywgY29tbWl0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21taXQtcGlubmVkIGluc3RhbGwgcGF0aC4gU2VlIHtAbGluayBfZW5zdXJlQ0xJSW5zdGFsbGVkfS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZUNMSUluc3RhbGxlZFBpbm5lZChjbGllbnQ6IFNTSENsaWVudCwgcGxhdGZvcm06IHsgb3M6IHN0cmluZzsgYXJjaDogc3RyaW5nIH0sIHJlcG9ydFByb2dyZXNzOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkLCBjb21taXQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2xpQmluID0gZ2V0UmVtb3RlQ0xJQmluKHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5LCBjb21taXQpO1xuXHRcdGNvbnN0IGluc3RhbGxSb290ID0gZ2V0UmVtb3RlQ0xJSW5zdGFsbFJvb3QodGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUpO1xuXG5cdFx0Ly8gUHJpbWFyeSByZXVzZSBjaGVjazogcHVyZSBmaWxlIGV4aXN0ZW5jZSBvbiB0aGUgY29tbWl0LWtleWVkIHBhdGguXG5cdFx0Ly8gTm8gYC0tdmVyc2lvbmAgcGFyc2luZyBcdTIwMTQgd2Uga25vdyB0aGUgZmlsZSBpcyBvdXJzIGFuZCBtYXRjaGVzIHRoZVxuXHRcdC8vIGRlc2t0b3AgY29tbWl0LlxuXHRcdGNvbnN0IHsgY29kZTogZXhpc3RzQ29kZSB9ID0gYXdhaXQgc3NoRXhlYyhjbGllbnQsIGB0ZXN0IC14ICR7Y2xpQmlufWAsIHsgaWdub3JlRXhpdENvZGU6IHRydWUgfSk7XG5cdFx0aWYgKGV4aXN0c0NvZGUgPT09IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZXVzaW5nIHJlbW90ZSBDTEkgYXQgJHtjbGlCaW59YCk7XG5cdFx0XHQvLyBCdW1wIG10aW1lIHNvIHRoZSByZXRlbnRpb24gcGFzcyBiZWxvdyBkb2Vzbid0IHBydW5lIHRoZVxuXHRcdFx0Ly8gYmluYXJ5IHdlIGp1c3QgZGVjaWRlZCB0byByZXVzZS4gV2l0aG91dCB0aGlzLCBhIHVzZXJcblx0XHRcdC8vIHJvdGF0aW5nIGJldHdlZW4gc2V2ZXJhbCBkZXNrdG9wIGJ1aWxkcyBjb3VsZCBzZWUgdGhlaXJcblx0XHRcdC8vIGN1cnJlbnRseS11c2VkIENMSSBmYWxsIG91dCBvZiB0aGUgNS1uZXdlc3Qgd2luZG93IGFuZFxuXHRcdFx0Ly8gZ2V0IGRlbGV0ZWQganVzdCBiZWZvcmUgdGhlIG5leHQgcmVjb25uZWN0LlxuXHRcdFx0Y29uc3QgeyBjb2RlOiB0b3VjaENvZGUgfSA9IGF3YWl0IHNzaEV4ZWMoY2xpZW50LCBgdG91Y2ggLS0gJHtjbGlCaW59YCwgeyBpZ25vcmVFeGl0Q29kZTogdHJ1ZSB9KTtcblx0XHRcdGlmICh0b3VjaENvZGUgPT09IDApIHtcblx0XHRcdFx0Ly8gTm93IHRoYXQgdGhlIGluLXVzZSBiaW5hcnkgaXMgdGhlIG5ld2VzdCBieSBtdGltZSwgcHJ1bmVcblx0XHRcdFx0Ly8gb2xkZXIgY29tbWl0LWtleWVkIGluc3RhbGxzLiBCZXN0LWVmZm9ydC5cblx0XHRcdFx0YXdhaXQgc3NoRXhlYyhjbGllbnQsIGJ1aWxkQ2xlYW51cE9sZENMSXNDb21tYW5kKHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5KSwgeyBpZ25vcmVFeGl0Q29kZTogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIElmIHdlIGNvdWxkbid0IHJlZnJlc2ggbXRpbWUsIHNraXAgdGhlIHJldGVudGlvbiBwYXNzIFx1MjAxNFxuXHRcdFx0XHQvLyBydW5uaW5nIGl0IG5vdyBjb3VsZCBwcnVuZSB0aGUgYmluYXJ5IHdlIGp1c3QgZGVjaWRlZFxuXHRcdFx0XHQvLyB0byByZXVzZS4gV2UnbGwgcmV0cnkgcmV0ZW50aW9uIG9uIHRoZSBuZXh0IHJlY29ubmVjdC5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IFNraXBwaW5nIENMSSByZXRlbnRpb24gY2xlYW51cDogdG91Y2ggZXhpdGVkICR7dG91Y2hDb2RlfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNsaUJpbjtcblx0XHR9XG5cblx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnc3NoUHJvZ3Jlc3NEb3dubG9hZGluZ0NMSScsIFwiSW5zdGFsbGluZyBWUyBDb2RlIENMSSBvbiByZW1vdGUuLi5cIikpO1xuXHRcdGNvbnN0IHVybCA9IGJ1aWxkQ0xJRG93bmxvYWRVcmwocGxhdGZvcm0ub3MsIHBsYXRmb3JtLmFyY2gsIHRoaXMuX3F1YWxpdHksIGNvbW1pdCk7XG5cblx0XHQvLyBFeHRyYWN0IGludG8gYSB0ZW1wIGRpciBpbnNpZGUgdGhlIGluc3RhbGwgcm9vdCBzbyB0aGUgZmluYWwgYG12YFxuXHRcdC8vIGlzIGEgc2FtZS1maWxlc3lzdGVtIGF0b21pYyByZW5hbWUuIENvbmN1cnJlbnQgU1NIIHNlc3Npb25zIHJhY2luZ1xuXHRcdC8vIGhlcmUgYm90aCBlbmQgdXAgd2l0aCBhIHZhbGlkIGJpbmFyeSBmb3IgdGhlIHNhbWUgY29tbWl0OyB0aGVcblx0XHQvLyB0cmFpbGluZyBgcm0gLXJmYCBvZiB0aGUgdG1wIGRpciBpcyBpZGVtcG90ZW50LlxuXHRcdGNvbnN0IGluc3RhbGxDbWQgPSBbXG5cdFx0XHRgbWtkaXIgLXAgJHtpbnN0YWxsUm9vdH1gLFxuXHRcdFx0YHRtcGRpcj0kKG1rdGVtcCAtZCAke2luc3RhbGxSb290fS8uY2xpLWluc3RhbGwtWFhYWFhYKWAsXG5cdFx0XHRgKGNkIFwiJHRtcGRpclwiICYmIGN1cmwgLWZzU0wgJHtzaGVsbEVzY2FwZSh1cmwpfSB8IHRhciB4eilgLFxuXHRcdFx0Ly8gVGhlIGFyY2hpdmUgY29udGFpbnMgZXhhY3RseSBvbmUgZmlsZTogdGhlIENMSSBiaW5hcnksIG5hbWVkIHBlciBxdWFsaXR5LlxuXHRcdFx0YG12IFwiJHRtcGRpclwiLyogJHtjbGlCaW59YCxcblx0XHRcdGBjaG1vZCAreCAke2NsaUJpbn1gLFxuXHRcdFx0YHJtIC1yZiBcIiR0bXBkaXJcImAsXG5cdFx0XS5qb2luKCcgJiYgJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3NoRXhlYyhjbGllbnQsIGluc3RhbGxDbWQpO1xuXHRcdFx0Ly8gVmFsaWRhdGUgdGhlIGluc3RhbGxlZCBiaW5hcnkgYWN0dWFsbHkgcnVucy4gSWYgdGhlIGFyY2hpdmUgd2FzXG5cdFx0XHQvLyBmb3IgdGhlIHdyb25nIHBsYXRmb3JtIC8gY29ycnVwdGVkLCB0aGlzIHN1cmZhY2VzIGltbWVkaWF0ZWx5LlxuXHRcdFx0Y29uc3QgeyBjb2RlOiB2ZXJzaW9uQ29kZSB9ID0gYXdhaXQgc3NoRXhlYyhjbGllbnQsIGAke2NsaUJpbn0gLS12ZXJzaW9uYCwgeyBpZ25vcmVFeGl0Q29kZTogdHJ1ZSB9KTtcblx0XHRcdGlmICh2ZXJzaW9uQ29kZSAhPT0gMCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENMSSBhdCAke2NsaUJpbn0gZmFpbGVkIC0tdmVyc2lvbiBjaGVjayBhZnRlciBpbnN0YWxsIChleGl0IGNvZGUgJHt2ZXJzaW9uQ29kZX0pYCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gSW5zdGFsbGVkIHJlbW90ZSBDTEkgYXQgJHtjbGlCaW59YCk7XG5cdFx0XHQvLyBQcnVuZSBvbGRlciBjb21taXQta2V5ZWQgaW5zdGFsbHMgbm93IHRoYXQgdGhlIG5ldyBiaW5hcnkgaXNcblx0XHRcdC8vIGluIHBsYWNlIGFuZCBpcyB0aGUgbmV3ZXN0IGJ5IG10aW1lLlxuXHRcdFx0YXdhaXQgc3NoRXhlYyhjbGllbnQsIGJ1aWxkQ2xlYW51cE9sZENMSXNDb21tYW5kKHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5KSwgeyBpZ25vcmVFeGl0Q29kZTogdHJ1ZSB9KTtcblx0XHRcdHJldHVybiBjbGlCaW47XG5cdFx0fSBjYXRjaCAoaW5zdGFsbEVycikge1xuXHRcdFx0Ly8gU29mdCBmYWxsYmFjayAoa2V5IGRpZmZlcmVuY2UgZnJvbSBSZW1vdGUtU1NIKTogaWYgdGhlXG5cdFx0XHQvLyBjb21taXQtcGlubmVkIGRvd25sb2FkIGZhaWxzIChvZmZsaW5lLCA0MDQsIGV0Yy4pIGJ1dCBhbm90aGVyXG5cdFx0XHQvLyB1c2FibGUgQ0xJIGlzIGFscmVhZHkgb24gdGhlIGJveCwgdXNlIHRoYXQgaW5zdGVhZCBvZiByZWZ1c2luZ1xuXHRcdFx0Ly8gdG8gY29ubmVjdC4gVGhlIGFnZW50IGhvc3QgaGFzIG5vIHN0cmljdCBjb21taXQtbG9jayB3aXRoIHRoZVxuXHRcdFx0Ly8gZGVza3RvcCBcdTIwMTQgdGhlIHByb3RvY29sIGhhbmRzaGFrZSB3aWxsIGNhdGNoIGdlbnVpbmVcblx0XHRcdC8vIGluY29tcGF0aWJpbGl0aWVzLlxuXHRcdFx0Y29uc3QgaW5zdGFsbEVycm9yTWVzc2FnZSA9IGluc3RhbGxFcnIgaW5zdGFuY2VvZiBFcnJvciA/IGluc3RhbGxFcnIubWVzc2FnZSA6IFN0cmluZyhpbnN0YWxsRXJyKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBDb3VsZCBub3QgaW5zdGFsbCBtYXRjaGluZyBDTEkgZm9yIGNvbW1pdCAke2NvbW1pdH06ICR7aW5zdGFsbEVycm9yTWVzc2FnZX0uIExvb2tpbmcgZm9yIGEgZmFsbGJhY2sgQ0xJIG9uIHRoZSByZW1vdGUuLi5gKTtcblx0XHRcdGNvbnN0IGZhbGxiYWNrID0gYXdhaXQgdGhpcy5fZmluZEZhbGxiYWNrQ0xJKGNsaWVudCk7XG5cdFx0XHRpZiAoZmFsbGJhY2spIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IFVzaW5nIGZhbGxiYWNrIENMSSBhdCAke2ZhbGxiYWNrfSAoZG9lcyBub3QgbWF0Y2ggZGVza3RvcCBjb21taXQgJHtjb21taXR9KS5gKTtcblx0XHRcdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgaW5zdGFsbEVycjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTG9vc2UgZGV2LWJ1aWxkIGluc3RhbGw6IG5vIGNvbW1pdCBwaW4uIFNlZSB7QGxpbmsgX2Vuc3VyZUNMSUluc3RhbGxlZH0uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVDTElJbnN0YWxsZWRMb29zZShjbGllbnQ6IFNTSENsaWVudCwgcGxhdGZvcm06IHsgb3M6IHN0cmluZzsgYXJjaDogc3RyaW5nIH0sIHJlcG9ydFByb2dyZXNzOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjbGlCaW4gPSBnZXRSZW1vdGVDTElCaW4odGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUsIHRoaXMuX3F1YWxpdHkpO1xuXHRcdGNvbnN0IGluc3RhbGxSb290ID0gZ2V0UmVtb3RlQ0xJSW5zdGFsbFJvb3QodGhpcy5fc2VydmVyRGF0YUZvbGRlck5hbWUpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBEZXNrdG9wIGhhcyBubyBwcm9kdWN0IGNvbW1pdDsgZmFsbGluZyBiYWNrIHRvIG5vbi1waW5uZWQgQ0xJIGluc3RhbGwgYXQgJHtjbGlCaW59LmApO1xuXG5cdFx0Y29uc3QgdXBkYXRlRXhpdENvZGVNYXJrZXIgPSAnX192c2NvZGVfY2xpX3VwZGF0ZV9leGl0X2NvZGVfXzonO1xuXHRcdGNvbnN0IHsgY29kZSwgc3Rkb3V0IH0gPSBhd2FpdCBzc2hFeGVjKGNsaWVudCwgYCR7Y2xpQmlufSAtLXZlcnNpb24gJiYgKCR7Y2xpQmlufSB1cGRhdGU7IHVwZGF0ZV9jb2RlPSQ/OyBlY2hvICR7dXBkYXRlRXhpdENvZGVNYXJrZXJ9JHVwZGF0ZV9jb2RlOyB0cnVlKWAsIHsgaWdub3JlRXhpdENvZGU6IHRydWUgfSk7XG5cdFx0aWYgKGNvZGUgPT09IDApIHtcblx0XHRcdGNvbnN0IHVwZGF0ZUV4aXRDb2RlTGluZSA9IHN0ZG91dC5zcGxpdCgnXFxuJykuZmluZChsaW5lID0+IGxpbmUuc3RhcnRzV2l0aCh1cGRhdGVFeGl0Q29kZU1hcmtlcikpO1xuXHRcdFx0Y29uc3QgdXBkYXRlRXhpdENvZGUgPSB1cGRhdGVFeGl0Q29kZUxpbmUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IE51bWJlci5wYXJzZUludCh1cGRhdGVFeGl0Q29kZUxpbmUuc2xpY2UodXBkYXRlRXhpdENvZGVNYXJrZXIubGVuZ3RoKSwgMTApO1xuXHRcdFx0aWYgKHVwZGF0ZUV4aXRDb2RlICE9PSB1bmRlZmluZWQgJiYgdXBkYXRlRXhpdENvZGUgIT09IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IENvdWxkIG5vdCByZWZyZXNoIHRoZSBkZXYtYnVpbGQgcmVtb3RlIENMSSBhdCAke2NsaUJpbn07IHJldXNpbmcgdGhlIGV4aXN0aW5nIGV4ZWN1dGFibGU6IHVwZGF0ZSBleGl0ZWQgJHt1cGRhdGVFeGl0Q29kZX1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZXVzaW5nIHJlbW90ZSBDTEkgYXQgJHtjbGlCaW59IChkZXYgYnVpbGQsIGxhdGVzdC12ZXJzaW9uIHJlZnJlc2ggYXR0ZW1wdGVkKWApO1xuXHRcdFx0cmV0dXJuIGNsaUJpbjtcblx0XHR9XG5cblx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnc3NoUHJvZ3Jlc3NEb3dubG9hZGluZ0NMSScsIFwiSW5zdGFsbGluZyBWUyBDb2RlIENMSSBvbiByZW1vdGUuLi5cIikpO1xuXHRcdGNvbnN0IHVybCA9IGJ1aWxkQ0xJRG93bmxvYWRVcmwocGxhdGZvcm0ub3MsIHBsYXRmb3JtLmFyY2gsIHRoaXMuX3F1YWxpdHkpO1xuXG5cdFx0Y29uc3QgaW5zdGFsbENtZCA9IFtcblx0XHRcdGBta2RpciAtcCAke2luc3RhbGxSb290fWAsXG5cdFx0XHRgY3VybCAtZnNTTCAke3NoZWxsRXNjYXBlKHVybCl9IHwgdGFyIHh6IC1DICR7aW5zdGFsbFJvb3R9YCxcblx0XHRcdGBjaG1vZCAreCAke2NsaUJpbn1gLFxuXHRcdF0uam9pbignICYmICcpO1xuXG5cdFx0YXdhaXQgc3NoRXhlYyhjbGllbnQsIGluc3RhbGxDbWQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBJbnN0YWxsZWQgcmVtb3RlIENMSSBhdCAke2NsaUJpbn1gKTtcblx0XHRyZXR1cm4gY2xpQmluO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgcmVtb3RlIENMSSBjYW5kaWRhdGVzIHRoYXQgY291bGQgYmUgdXNlZCBhcyBhIGZhbGxiYWNrIHdoZW4gdGhlXG5cdCAqIGNvbW1pdC1waW5uZWQgZG93bmxvYWQgZmFpbHMsIGFuZCByZXR1cm4gdGhlIG5ld2VzdCBvbmUgdGhhdCBwYXNzZXNcblx0ICogYSBgLS12ZXJzaW9uYCBjaGVjay4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBubyBjYW5kaWRhdGUgd29ya3MuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9maW5kRmFsbGJhY2tDTEkoY2xpZW50OiBTU0hDbGllbnQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCBzc2hFeGVjKGNsaWVudCwgYnVpbGRGaW5kRmFsbGJhY2tDTElDb21tYW5kKHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5KSwgeyBpZ25vcmVFeGl0Q29kZTogdHJ1ZSB9KTtcblx0XHRjb25zdCByYXdDYW5kaWRhdGVzID0gc3Rkb3V0LnNwbGl0KCdcXG4nKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKHMgPT4gcy5sZW5ndGggPiAwKTtcblx0XHQvLyBEZWZlbnNpdmUgdmFsaWRhdGlvbjogdGhlIGZpbmRlciBzaGVsbCBzbmlwcGV0IGVtaXRzIHBhdGhzIHdlXG5cdFx0Ly8gdHJ1c3QgYnkgY29uc3RydWN0aW9uLCBidXQgdGhlIG91dHB1dCBpcyBzdGlsbCBkYXRhIGNvbWluZyBiYWNrXG5cdFx0Ly8gb3ZlciBTU0ggdGhhdCB3ZSB0aGVuIGludGVycG9sYXRlIGludG8gYSBmb2xsb3ctdXAgY29tbWFuZFxuXHRcdC8vIChgPGNhbmRpZGF0ZT4gLS12ZXJzaW9uYCkuIEZpbHRlciB0byB0aGUgZXhhY3Qgc2hhcGVzIHdlIGV4cGVjdFxuXHRcdC8vIFx1MjAxNCBgPHJvb3Q+LzxhcmNoaXZlPi08NDAgaGV4PmAgb3IgYDxsZWdhY3lEaXI+LzxhcmNoaXZlPmAgXHUyMDE0IHNvIGFcblx0XHQvLyBtYWxpY2lvdXMgb3IganVuayBmaWxlIGluIHRoZSBpbnN0YWxsIHJvb3QgY2FuIG5ldmVyIGJlY29tZSBhXG5cdFx0Ly8gc2hlbGwgYXJndW1lbnQuXG5cdFx0Y29uc3QgY2FuZGlkYXRlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiByYXdDYW5kaWRhdGVzKSB7XG5cdFx0XHRpZiAoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aChjYW5kaWRhdGUsIHRoaXMuX3NlcnZlckRhdGFGb2xkZXJOYW1lLCB0aGlzLl9xdWFsaXR5KSkge1xuXHRcdFx0XHRjYW5kaWRhdGVzLnB1c2goY2FuZGlkYXRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBJZ25vcmluZyBmYWxsYmFjayBDTEkgY2FuZGlkYXRlIHdpdGggdW5leHBlY3RlZCBwYXRoIHNoYXBlOiAke2NhbmRpZGF0ZX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0Y29uc3QgeyBjb2RlIH0gPSBhd2FpdCBzc2hFeGVjKGNsaWVudCwgYCR7Y2FuZGlkYXRlfSAtLXZlcnNpb25gLCB7IGlnbm9yZUV4aXRDb2RlOiB0cnVlIH0pO1xuXHRcdFx0aWYgKGNvZGUgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBGYWxsYmFjayBDTEkgY2FuZGlkYXRlICR7Y2FuZGlkYXRlfSBmYWlsZWQgLS12ZXJzaW9uIGNoZWNrIChleGl0ICR7Y29kZX0pOyB0cnlpbmcgbmV4dC5gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLFlBQVksV0FBVztBQUNoQyxZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsU0FBUyxNQUFNLFlBQVksZ0JBQWdCO0FBQ3BELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxlQUFlLG9CQUFvQjtBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEM7QUFBQSxFQUVDO0FBQUEsRUFDQTtBQUFBLEVBZUE7QUFBQSxPQUNNO0FBQ1A7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQUdQO0FBQUEsRUFJQztBQUFBLE9BQ007QUFDUDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQLFNBQVMsMkJBQTJCLGlCQUFpQix1QkFBdUI7QUFDNUUsU0FBUyw2QkFBNkI7QUErQnRDLE1BQU0sYUFBYTtBQWdCbkIsTUFBTSw2QkFBNkI7QUFVbkMsTUFBTSx1QkFBdUI7QUFlN0IsTUFBTSx5QkFBeUI7QUFnQi9CLFNBQVMsb0JBQW9CLFNBQWlDO0FBQzdELFVBQVEsUUFBUSxNQUFNO0FBQUEsSUFDckIsS0FBSztBQUFh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Z0Q7QUFDbkgsYUFBTztBQUFBLElBQ1I7QUFFQSxtQkFBZSxTQUFTLDZCQUE2QixxQ0FBcUMsQ0FBQztBQUMzRixVQUFNLE1BQU0sb0JBQW9CLFNBQVMsSUFBSSxTQUFTLE1BQU0sS0FBSyxRQUFRO0FBRXpFLFVBQU0sYUFBYTtBQUFBLE1BQ2xCLFlBQVksV0FBVztBQUFBLE1BQ3ZCLGNBQWMsWUFBWSxHQUFHLENBQUMsZ0JBQWdCLFdBQVc7QUFBQSxNQUN6RCxZQUFZLE1BQU07QUFBQSxJQUNuQixFQUFFLEtBQUssTUFBTTtBQUViLFVBQU0sUUFBUSxRQUFRLFVBQVU7QUFDaEMsU0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLDRCQUE0QixNQUFNLEVBQUU7QUFDdkUsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxNQUFjLGlCQUFpQixRQUFnRDtBQUM5RSxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sUUFBUSxRQUFRLDRCQUE0QixLQUFLLHVCQUF1QixLQUFLLFFBQVEsR0FBRyxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDekksVUFBTSxnQkFBZ0IsT0FBTyxNQUFNLElBQUksRUFBRSxJQUFJLE9BQUssRUFBRSxLQUFLLENBQUMsRUFBRSxPQUFPLE9BQUssRUFBRSxTQUFTLENBQUM7QUFRcEYsVUFBTSxhQUF1QixDQUFDO0FBQzlCLGVBQVcsYUFBYSxlQUFlO0FBQ3RDLFVBQUksdUJBQXVCLFdBQVcsS0FBSyx1QkFBdUIsS0FBSyxRQUFRLEdBQUc7QUFDakYsbUJBQVcsS0FBSyxTQUFTO0FBQUEsTUFDMUIsT0FBTztBQUNOLGFBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSxnRUFBZ0UsU0FBUyxFQUFFO0FBQUEsTUFDL0c7QUFBQSxJQUNEO0FBQ0EsZUFBVyxhQUFhLFlBQVk7QUFDbkMsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLFFBQVEsUUFBUSxHQUFHLFNBQVMsY0FBYyxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDekYsVUFBSSxTQUFTLEdBQUc7QUFDZixlQUFPO0FBQUEsTUFDUjtBQUNBLFdBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSwyQkFBMkIsU0FBUyxpQ0FBaUMsSUFBSSxpQkFBaUI7QUFBQSxJQUM5SDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFuZ0RhLDhCQTA4QlksbUJBQW1CO0FBQUEsRUFDMUM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFoOUJZLGdDQUFOO0FBQUEsRUE4RUo7QUFBQSxFQUNBO0FBQUEsR0EvRVU7IiwKICAibmFtZXMiOiBbInNzaENsaWVudCIsICJzZWxlY3Rpb24iLCAiZm91bmQiXQp9Cg==
