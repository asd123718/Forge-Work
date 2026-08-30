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
import * as net from "net";
import { VSBuffer } from "../../base/common/buffer.js";
import { Emitter, Event } from "../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { FileAccess } from "../../base/common/network.js";
import { delimiter, join } from "../../base/common/path.js";
import { isWindows } from "../../base/common/platform.js";
import { removeDangerousEnvVariables } from "../../base/common/processes.js";
import { createRandomIPCHandle, NodeSocket, WebSocketNodeSocket } from "../../base/parts/ipc/node/ipc.net.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { ILogService } from "../../platform/log/common/log.js";
import { getResolvedShellEnv } from "../../platform/shell/node/shellEnv.js";
import { IExtensionHostStatusService } from "./extensionHostStatusService.js";
import { getNLSConfiguration } from "./remoteLanguagePacks.js";
import { IServerEnvironmentService } from "./serverEnvironmentService.js";
import { IPCExtHostConnection, SocketExtHostConnection, writeExtHostConnection } from "../../workbench/services/extensions/common/extensionHostEnv.js";
async function buildUserEnvironment(startParamsEnv = {}, withUserShellEnvironment, language, environmentService, logService, configurationService) {
  const nlsConfig = await getNLSConfiguration(language, environmentService.userDataPath);
  let userShellEnv = {};
  if (withUserShellEnvironment) {
    try {
      userShellEnv = await getResolvedShellEnv(configurationService, logService, environmentService.args, process.env);
    } catch (error) {
      logService.error("ExtensionHostConnection#buildUserEnvironment resolving shell environment failed", error);
    }
  }
  const processEnv = process.env;
  const env = {
    ...processEnv,
    ...userShellEnv,
    ...startParamsEnv,
    VSCODE_ESM_ENTRYPOINT: "vs/workbench/api/node/extensionHostProcess",
    VSCODE_HANDLES_UNCAUGHT_ERRORS: "true",
    VSCODE_NLS_CONFIG: JSON.stringify(nlsConfig)
  };
  const binFolder = environmentService.isBuilt ? join(environmentService.appRoot, "bin") : join(environmentService.appRoot, "resources", "server", "bin-dev");
  const remoteCliBinFolder = join(binFolder, "remote-cli");
  let PATH = readCaseInsensitive(env, "PATH");
  if (PATH) {
    PATH = remoteCliBinFolder + delimiter + PATH;
  } else {
    PATH = remoteCliBinFolder;
  }
  setCaseInsensitive(env, "PATH", PATH);
  if (!environmentService.args["without-browser-env-var"]) {
    env.BROWSER = join(binFolder, "helpers", isWindows ? "browser.cmd" : "browser.sh");
  }
  env.VSCODE_RECONNECTION_GRACE_TIME = String(environmentService.reconnectionGraceTime);
  logService.trace(`[reconnection-grace-time] Setting VSCODE_RECONNECTION_GRACE_TIME env var for extension host: ${environmentService.reconnectionGraceTime}ms (${Math.floor(environmentService.reconnectionGraceTime / 1e3)}s)`);
  removeNulls(env);
  return env;
}
class ConnectionData {
  constructor(socket, initialDataChunk) {
    this.socket = socket;
    this.initialDataChunk = initialDataChunk;
  }
  socketDrain() {
    return this.socket.drain();
  }
  toIExtHostSocketMessage() {
    let skipWebSocketFrames;
    let permessageDeflate;
    let inflateBytes;
    if (this.socket instanceof NodeSocket) {
      skipWebSocketFrames = true;
      permessageDeflate = false;
      inflateBytes = VSBuffer.alloc(0);
    } else {
      skipWebSocketFrames = false;
      permessageDeflate = this.socket.permessageDeflate;
      inflateBytes = this.socket.recordedInflateBytes;
      this.socket.setRecordInflateBytes(false);
    }
    return {
      type: "VSCODE_EXTHOST_IPC_SOCKET",
      initialDataChunk: this.initialDataChunk.buffer.toString("base64"),
      skipWebSocketFrames,
      permessageDeflate,
      inflateBytes: inflateBytes.buffer.toString("base64")
    };
  }
}
let ExtensionHostConnection = class extends Disposable {
  constructor(_reconnectionToken, remoteAddress, socket, initialDataChunk, _environmentService, _logService, _extensionHostStatusService, _configurationService) {
    super();
    this._reconnectionToken = _reconnectionToken;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._extensionHostStatusService = _extensionHostStatusService;
    this._configurationService = _configurationService;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._canSendSocket = !isWindows || !this._environmentService.args["socket-path"];
    this._disposed = false;
    this._remoteAddress = remoteAddress;
    this._extensionHostProcess = null;
    this._connectionData = new ConnectionData(socket, initialDataChunk);
    if (!this._canSendSocket && socket instanceof WebSocketNodeSocket) {
      socket.setRecordInflateBytes(false);
    }
    this._log(`New connection established.`);
  }
  dispose() {
    this._cleanResources();
    super.dispose();
  }
  get _logPrefix() {
    return `[${this._remoteAddress}][${this._reconnectionToken.substr(0, 8)}][ExtensionHostConnection] `;
  }
  _log(_str) {
    this._logService.info(`${this._logPrefix}${_str}`);
  }
  _logError(_str) {
    this._logService.error(`${this._logPrefix}${_str}`);
  }
  async _pipeSockets(extHostSocket, connectionData) {
    const disposables = new DisposableStore();
    disposables.add(connectionData.socket);
    disposables.add(toDisposable(() => {
      if (!extHostSocket.destroyed && !extHostSocket.writableEnded) {
        extHostSocket.end();
      }
    }));
    const stopAndCleanup = () => {
      disposables.dispose();
    };
    disposables.add(connectionData.socket.onEnd(stopAndCleanup));
    disposables.add(connectionData.socket.onClose(stopAndCleanup));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "end")(stopAndCleanup));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "close")(stopAndCleanup));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "error")(stopAndCleanup));
    disposables.add(connectionData.socket.onData((e) => extHostSocket.write(e.buffer)));
    disposables.add(Event.fromNodeEventEmitter(extHostSocket, "data")((e) => {
      connectionData.socket.write(VSBuffer.wrap(e));
    }));
    if (connectionData.initialDataChunk.byteLength > 0) {
      extHostSocket.write(connectionData.initialDataChunk.buffer);
    }
  }
  async _sendSocketToExtensionHost(extensionHostProcess, connectionData) {
    await connectionData.socketDrain();
    const msg = connectionData.toIExtHostSocketMessage();
    let socket;
    if (connectionData.socket instanceof NodeSocket) {
      socket = connectionData.socket.socket;
    } else {
      socket = connectionData.socket.socket.socket;
    }
    extensionHostProcess.send(msg, socket);
  }
  shortenReconnectionGraceTimeIfNecessary() {
    if (!this._extensionHostProcess) {
      return;
    }
    const msg = {
      type: "VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME"
    };
    this._extensionHostProcess.send(msg);
  }
  acceptReconnection(remoteAddress, _socket, initialDataChunk) {
    this._remoteAddress = remoteAddress;
    this._log(`The client has reconnected.`);
    if (!this._canSendSocket && _socket instanceof WebSocketNodeSocket) {
      _socket.setRecordInflateBytes(false);
    }
    const connectionData = new ConnectionData(_socket, initialDataChunk);
    if (!this._extensionHostProcess) {
      this._connectionData = connectionData;
      return;
    }
    this._sendSocketToExtensionHost(this._extensionHostProcess, connectionData);
  }
  _cleanResources() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._connectionData) {
      this._connectionData.socket.end();
      this._connectionData = null;
    }
    if (this._extensionHostProcess) {
      this._extensionHostProcess.kill();
      this._extensionHostProcess = null;
    }
    this._onClose.fire(void 0);
  }
  async start(startParams) {
    try {
      let execArgv = process.execArgv ? process.execArgv.filter((a) => !/^--inspect(-brk)?=/.test(a)) : [];
      if (startParams.port && !process.pkg) {
        execArgv = [
          `--inspect${startParams.break ? "-brk" : ""}=${startParams.port}`,
          "--experimental-network-inspection"
        ];
      }
      this._log(`Starting extension host process...`);
      const env = await buildUserEnvironment(startParams.env, true, startParams.language, this._environmentService, this._logService, this._configurationService);
      removeDangerousEnvVariables(env);
      let extHostNamedPipeServer;
      if (this._canSendSocket) {
        writeExtHostConnection(new SocketExtHostConnection(), env);
        extHostNamedPipeServer = null;
      } else {
        const { namedPipeServer, pipeName } = await this._listenOnPipe();
        writeExtHostConnection(new IPCExtHostConnection(pipeName), env);
        extHostNamedPipeServer = namedPipeServer;
      }
      const opts = {
        env,
        execArgv,
        silent: true
      };
      opts.execArgv.unshift("--dns-result-order=ipv4first");
      const args = ["--type=extensionHost", `--transformURIs`];
      const useHostProxy = this._environmentService.args["use-host-proxy"];
      args.push(`--useHostProxy=${useHostProxy ? "true" : "false"}`);
      if (this._configurationService.getValue("extensions.supportNodeGlobalNavigator")) {
        args.push("--supportGlobalNavigator");
      }
      this._extensionHostProcess = cp.fork(FileAccess.asFileUri("bootstrap-fork").fsPath, args, opts);
      const pid = this._extensionHostProcess.pid;
      this._log(`<${pid}> Launched Extension Host Process.`);
      this._extensionHostProcess.stdout.setEncoding("utf8");
      this._extensionHostProcess.stderr.setEncoding("utf8");
      const onStdout = Event.fromNodeEventEmitter(this._extensionHostProcess.stdout, "data");
      const onStderr = Event.fromNodeEventEmitter(this._extensionHostProcess.stderr, "data");
      this._register(onStdout((e) => this._log(`<${pid}> ${e}`)));
      this._register(onStderr((e) => this._log(`<${pid}><stderr> ${e}`)));
      this._extensionHostProcess.on("error", (err) => {
        this._logError(`<${pid}> Extension Host Process had an error`);
        this._logService.error(err);
        this._cleanResources();
      });
      this._extensionHostProcess.on("exit", (code, signal) => {
        this._extensionHostStatusService.setExitInfo(this._reconnectionToken, { code, signal });
        this._log(`<${pid}> Extension Host Process exited with code: ${code}, signal: ${signal}.`);
        this._cleanResources();
      });
      if (extHostNamedPipeServer) {
        extHostNamedPipeServer.on("connection", (socket) => {
          extHostNamedPipeServer.close();
          this._pipeSockets(socket, this._connectionData);
        });
      } else {
        const messageListener = (msg) => {
          if (msg.type === "VSCODE_EXTHOST_IPC_READY") {
            this._extensionHostProcess.removeListener("message", messageListener);
            this._sendSocketToExtensionHost(this._extensionHostProcess, this._connectionData);
            this._connectionData = null;
          }
        };
        this._extensionHostProcess.on("message", messageListener);
      }
    } catch (error) {
      this._logError(`Failed to start extension host process`);
      this._logService.error(error);
      this._cleanResources();
    }
  }
  _listenOnPipe() {
    return new Promise((resolve, reject) => {
      const pipeName = createRandomIPCHandle();
      const namedPipeServer = net.createServer();
      namedPipeServer.on("error", reject);
      namedPipeServer.listen(pipeName, () => {
        namedPipeServer?.removeListener("error", reject);
        resolve({ pipeName, namedPipeServer });
      });
    });
  }
};
ExtensionHostConnection = __decorateClass([
  __decorateParam(4, IServerEnvironmentService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IExtensionHostStatusService),
  __decorateParam(7, IConfigurationService)
], ExtensionHostConnection);
function readCaseInsensitive(env, key) {
  const pathKeys = Object.keys(env).filter((k) => k.toLowerCase() === key.toLowerCase());
  const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
  return env[pathKey];
}
function setCaseInsensitive(env, key, value) {
  const pathKeys = Object.keys(env).filter((k) => k.toLowerCase() === key.toLowerCase());
  const pathKey = pathKeys.length > 0 ? pathKeys[0] : key;
  env[pathKey] = value;
}
function removeNulls(env) {
  for (const key of Object.keys(env)) {
    if (env[key] === null) {
      delete env[key];
    }
  }
}
export {
  ExtensionHostConnection,
  buildUserEnvironment
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXG5vZGVcXGV4dGVuc2lvbkhvc3RDb25uZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBqb2luIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByZW1vdmVEYW5nZXJvdXNFbnZWYXJpYWJsZXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmFuZG9tSVBDSGFuZGxlLCBOb2RlU29ja2V0LCBXZWJTb2NrZXROb2RlU29ja2V0IH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubmV0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgZ2V0UmVzb2x2ZWRTaGVsbEVudiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3NoZWxsL25vZGUvc2hlbGxFbnYuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0U3RhdHVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXROTFNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9yZW1vdGVMYW5ndWFnZVBhY2tzLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuL3NlcnZlckVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUENFeHRIb3N0Q29ubmVjdGlvbiwgU29ja2V0RXh0SG9zdENvbm5lY3Rpb24sIHdyaXRlRXh0SG9zdENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEVudi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJlYWR5TWVzc2FnZSwgSUV4dEhvc3RSZWR1Y2VHcmFjZVRpbWVNZXNzYWdlLCBJRXh0SG9zdFNvY2tldE1lc3NhZ2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdFByb3RvY29sLmpzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJ1aWxkVXNlckVudmlyb25tZW50KHN0YXJ0UGFyYW1zRW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfSA9IHt9LCB3aXRoVXNlclNoZWxsRW52aXJvbm1lbnQ6IGJvb2xlYW4sIGxhbmd1YWdlOiBzdHJpbmcsIGVudmlyb25tZW50U2VydmljZTogSVNlcnZlckVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+IHtcblx0Y29uc3QgbmxzQ29uZmlnID0gYXdhaXQgZ2V0TkxTQ29uZmlndXJhdGlvbihsYW5ndWFnZSwgZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCk7XG5cblx0bGV0IHVzZXJTaGVsbEVudjogdHlwZW9mIHByb2Nlc3MuZW52ID0ge307XG5cdGlmICh3aXRoVXNlclNoZWxsRW52aXJvbm1lbnQpIHtcblx0XHR0cnkge1xuXHRcdFx0dXNlclNoZWxsRW52ID0gYXdhaXQgZ2V0UmVzb2x2ZWRTaGVsbEVudihjb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3MsIHByb2Nlc3MuZW52KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb24jYnVpbGRVc2VyRW52aXJvbm1lbnQgcmVzb2x2aW5nIHNoZWxsIGVudmlyb25tZW50IGZhaWxlZCcsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBwcm9jZXNzRW52ID0gcHJvY2Vzcy5lbnY7XG5cblx0Y29uc3QgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdC4uLnByb2Nlc3NFbnYsXG5cdFx0Li4udXNlclNoZWxsRW52LFxuXHRcdC4uLnN0YXJ0UGFyYW1zRW52LFxuXHRcdFZTQ09ERV9FU01fRU5UUllQT0lOVDogJ3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRlbnNpb25Ib3N0UHJvY2VzcycsXG5cdFx0VlNDT0RFX0hBTkRMRVNfVU5DQVVHSFRfRVJST1JTOiAndHJ1ZScsXG5cdFx0VlNDT0RFX05MU19DT05GSUc6IEpTT04uc3RyaW5naWZ5KG5sc0NvbmZpZylcblx0fTtcblxuXHRjb25zdCBiaW5Gb2xkZXIgPSBlbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCA/IGpvaW4oZW52aXJvbm1lbnRTZXJ2aWNlLmFwcFJvb3QsICdiaW4nKSA6IGpvaW4oZW52aXJvbm1lbnRTZXJ2aWNlLmFwcFJvb3QsICdyZXNvdXJjZXMnLCAnc2VydmVyJywgJ2Jpbi1kZXYnKTtcblx0Y29uc3QgcmVtb3RlQ2xpQmluRm9sZGVyID0gam9pbihiaW5Gb2xkZXIsICdyZW1vdGUtY2xpJyk7IC8vIGNvbnRhaW5zIHRoZSBgY29kZWAgY29tbWFuZCB0aGF0IGNhbiB0YWxrIHRvIHRoZSByZW1vdGUgc2VydmVyXG5cblx0bGV0IFBBVEggPSByZWFkQ2FzZUluc2Vuc2l0aXZlKGVudiwgJ1BBVEgnKTtcblx0aWYgKFBBVEgpIHtcblx0XHRQQVRIID0gcmVtb3RlQ2xpQmluRm9sZGVyICsgZGVsaW1pdGVyICsgUEFUSDtcblx0fSBlbHNlIHtcblx0XHRQQVRIID0gcmVtb3RlQ2xpQmluRm9sZGVyO1xuXHR9XG5cdHNldENhc2VJbnNlbnNpdGl2ZShlbnYsICdQQVRIJywgUEFUSCk7XG5cblx0aWYgKCFlbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snd2l0aG91dC1icm93c2VyLWVudi12YXInXSkge1xuXHRcdGVudi5CUk9XU0VSID0gam9pbihiaW5Gb2xkZXIsICdoZWxwZXJzJywgaXNXaW5kb3dzID8gJ2Jyb3dzZXIuY21kJyA6ICdicm93c2VyLnNoJyk7IC8vIGEgY29tbWFuZCB0aGF0IG9wZW5zIGEgYnJvd3NlciBvbiB0aGUgbG9jYWwgbWFjaGluZVxuXHR9XG5cblx0ZW52LlZTQ09ERV9SRUNPTk5FQ1RJT05fR1JBQ0VfVElNRSA9IFN0cmluZyhlbnZpcm9ubWVudFNlcnZpY2UucmVjb25uZWN0aW9uR3JhY2VUaW1lKTtcblx0bG9nU2VydmljZS50cmFjZShgW3JlY29ubmVjdGlvbi1ncmFjZS10aW1lXSBTZXR0aW5nIFZTQ09ERV9SRUNPTk5FQ1RJT05fR1JBQ0VfVElNRSBlbnYgdmFyIGZvciBleHRlbnNpb24gaG9zdDogJHtlbnZpcm9ubWVudFNlcnZpY2UucmVjb25uZWN0aW9uR3JhY2VUaW1lfW1zICgke01hdGguZmxvb3IoZW52aXJvbm1lbnRTZXJ2aWNlLnJlY29ubmVjdGlvbkdyYWNlVGltZSAvIDEwMDApfXMpYCk7XG5cblx0cmVtb3ZlTnVsbHMoZW52KTtcblx0cmV0dXJuIGVudjtcbn1cblxuY2xhc3MgQ29ubmVjdGlvbkRhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc29ja2V0OiBOb2RlU29ja2V0IHwgV2ViU29ja2V0Tm9kZVNvY2tldCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5pdGlhbERhdGFDaHVuazogVlNCdWZmZXJcblx0KSB7IH1cblxuXHRwdWJsaWMgc29ja2V0RHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc29ja2V0LmRyYWluKCk7XG5cdH1cblxuXHRwdWJsaWMgdG9JRXh0SG9zdFNvY2tldE1lc3NhZ2UoKTogSUV4dEhvc3RTb2NrZXRNZXNzYWdlIHtcblxuXHRcdGxldCBza2lwV2ViU29ja2V0RnJhbWVzOiBib29sZWFuO1xuXHRcdGxldCBwZXJtZXNzYWdlRGVmbGF0ZTogYm9vbGVhbjtcblx0XHRsZXQgaW5mbGF0ZUJ5dGVzOiBWU0J1ZmZlcjtcblxuXHRcdGlmICh0aGlzLnNvY2tldCBpbnN0YW5jZW9mIE5vZGVTb2NrZXQpIHtcblx0XHRcdHNraXBXZWJTb2NrZXRGcmFtZXMgPSB0cnVlO1xuXHRcdFx0cGVybWVzc2FnZURlZmxhdGUgPSBmYWxzZTtcblx0XHRcdGluZmxhdGVCeXRlcyA9IFZTQnVmZmVyLmFsbG9jKDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRza2lwV2ViU29ja2V0RnJhbWVzID0gZmFsc2U7XG5cdFx0XHRwZXJtZXNzYWdlRGVmbGF0ZSA9IHRoaXMuc29ja2V0LnBlcm1lc3NhZ2VEZWZsYXRlO1xuXHRcdFx0aW5mbGF0ZUJ5dGVzID0gdGhpcy5zb2NrZXQucmVjb3JkZWRJbmZsYXRlQnl0ZXM7XG5cdFx0XHR0aGlzLnNvY2tldC5zZXRSZWNvcmRJbmZsYXRlQnl0ZXMoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnVlNDT0RFX0VYVEhPU1RfSVBDX1NPQ0tFVCcsXG5cdFx0XHRpbml0aWFsRGF0YUNodW5rOiAoPEJ1ZmZlcj50aGlzLmluaXRpYWxEYXRhQ2h1bmsuYnVmZmVyKS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHRza2lwV2ViU29ja2V0RnJhbWVzOiBza2lwV2ViU29ja2V0RnJhbWVzLFxuXHRcdFx0cGVybWVzc2FnZURlZmxhdGU6IHBlcm1lc3NhZ2VEZWZsYXRlLFxuXHRcdFx0aW5mbGF0ZUJ5dGVzOiAoPEJ1ZmZlcj5pbmZsYXRlQnl0ZXMuYnVmZmVyKS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9vbkNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ2xvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5TZW5kU29ja2V0OiBib29sZWFuO1xuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcmVtb3RlQWRkcmVzczogc3RyaW5nO1xuXHRwcml2YXRlIF9leHRlbnNpb25Ib3N0UHJvY2VzczogY3AuQ2hpbGRQcm9jZXNzIHwgbnVsbDtcblx0cHJpdmF0ZSBfY29ubmVjdGlvbkRhdGE6IENvbm5lY3Rpb25EYXRhIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHJlbW90ZUFkZHJlc3M6IHN0cmluZyxcblx0XHRzb2NrZXQ6IE5vZGVTb2NrZXQgfCBXZWJTb2NrZXROb2RlU29ja2V0LFxuXHRcdGluaXRpYWxEYXRhQ2h1bms6IFZTQnVmZmVyLFxuXHRcdEBJU2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVNlcnZlckVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25Ib3N0U3RhdHVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Ib3N0U3RhdHVzU2VydmljZTogSUV4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NhblNlbmRTb2NrZXQgPSAoIWlzV2luZG93cyB8fCAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3NvY2tldC1wYXRoJ10pO1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVtb3RlQWRkcmVzcyA9IHJlbW90ZUFkZHJlc3M7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MgPSBudWxsO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25EYXRhID0gbmV3IENvbm5lY3Rpb25EYXRhKHNvY2tldCwgaW5pdGlhbERhdGFDaHVuayk7XG5cdFx0aWYgKCF0aGlzLl9jYW5TZW5kU29ja2V0ICYmIHNvY2tldCBpbnN0YW5jZW9mIFdlYlNvY2tldE5vZGVTb2NrZXQpIHtcblx0XHRcdHNvY2tldC5zZXRSZWNvcmRJbmZsYXRlQnl0ZXMoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZyhgTmV3IGNvbm5lY3Rpb24gZXN0YWJsaXNoZWQuYCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFuUmVzb3VyY2VzKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2xvZ1ByZWZpeCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgWyR7dGhpcy5fcmVtb3RlQWRkcmVzc31dWyR7dGhpcy5fcmVjb25uZWN0aW9uVG9rZW4uc3Vic3RyKDAsIDgpfV1bRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb25dIGA7XG5cdH1cblxuXHRwcml2YXRlIF9sb2coX3N0cjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke3RoaXMuX2xvZ1ByZWZpeH0ke19zdHJ9YCk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dFcnJvcihfc3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke3RoaXMuX2xvZ1ByZWZpeH0ke19zdHJ9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9waXBlU29ja2V0cyhleHRIb3N0U29ja2V0OiBuZXQuU29ja2V0LCBjb25uZWN0aW9uRGF0YTogQ29ubmVjdGlvbkRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uZWN0aW9uRGF0YS5zb2NrZXQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFleHRIb3N0U29ja2V0LmRlc3Ryb3llZCAmJiAhZXh0SG9zdFNvY2tldC53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdGV4dEhvc3RTb2NrZXQuZW5kKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc3RvcEFuZENsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uZWN0aW9uRGF0YS5zb2NrZXQub25FbmQoc3RvcEFuZENsZWFudXApKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubmVjdGlvbkRhdGEuc29ja2V0Lm9uQ2xvc2Uoc3RvcEFuZENsZWFudXApKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjx2b2lkPihleHRIb3N0U29ja2V0LCAnZW5kJykoc3RvcEFuZENsZWFudXApKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8dm9pZD4oZXh0SG9zdFNvY2tldCwgJ2Nsb3NlJykoc3RvcEFuZENsZWFudXApKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8dm9pZD4oZXh0SG9zdFNvY2tldCwgJ2Vycm9yJykoc3RvcEFuZENsZWFudXApKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uZWN0aW9uRGF0YS5zb2NrZXQub25EYXRhKChlKSA9PiBleHRIb3N0U29ja2V0LndyaXRlKGUuYnVmZmVyKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxCdWZmZXI+KGV4dEhvc3RTb2NrZXQsICdkYXRhJykoKGUpID0+IHtcblx0XHRcdGNvbm5lY3Rpb25EYXRhLnNvY2tldC53cml0ZShWU0J1ZmZlci53cmFwKGUpKTtcblx0XHR9KSk7XG5cblx0XHRpZiAoY29ubmVjdGlvbkRhdGEuaW5pdGlhbERhdGFDaHVuay5ieXRlTGVuZ3RoID4gMCkge1xuXHRcdFx0ZXh0SG9zdFNvY2tldC53cml0ZShjb25uZWN0aW9uRGF0YS5pbml0aWFsRGF0YUNodW5rLmJ1ZmZlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZFNvY2tldFRvRXh0ZW5zaW9uSG9zdChleHRlbnNpb25Ib3N0UHJvY2VzczogY3AuQ2hpbGRQcm9jZXNzLCBjb25uZWN0aW9uRGF0YTogQ29ubmVjdGlvbkRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNYWtlIHN1cmUgYWxsIG91dHN0YW5kaW5nIHdyaXRlcyBoYXZlIGJlZW4gZHJhaW5lZCBiZWZvcmUgc2VuZGluZyB0aGUgc29ja2V0XG5cdFx0YXdhaXQgY29ubmVjdGlvbkRhdGEuc29ja2V0RHJhaW4oKTtcblx0XHRjb25zdCBtc2cgPSBjb25uZWN0aW9uRGF0YS50b0lFeHRIb3N0U29ja2V0TWVzc2FnZSgpO1xuXHRcdGxldCBzb2NrZXQ6IG5ldC5Tb2NrZXQ7XG5cdFx0aWYgKGNvbm5lY3Rpb25EYXRhLnNvY2tldCBpbnN0YW5jZW9mIE5vZGVTb2NrZXQpIHtcblx0XHRcdHNvY2tldCA9IGNvbm5lY3Rpb25EYXRhLnNvY2tldC5zb2NrZXQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvY2tldCA9IGNvbm5lY3Rpb25EYXRhLnNvY2tldC5zb2NrZXQuc29ja2V0O1xuXHRcdH1cblx0XHRleHRlbnNpb25Ib3N0UHJvY2Vzcy5zZW5kKG1zZywgc29ja2V0KTtcblx0fVxuXG5cdHB1YmxpYyBzaG9ydGVuUmVjb25uZWN0aW9uR3JhY2VUaW1lSWZOZWNlc3NhcnkoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtc2c6IElFeHRIb3N0UmVkdWNlR3JhY2VUaW1lTWVzc2FnZSA9IHtcblx0XHRcdHR5cGU6ICdWU0NPREVfRVhUSE9TVF9JUENfUkVEVUNFX0dSQUNFX1RJTUUnXG5cdFx0fTtcblx0XHR0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5zZW5kKG1zZyk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0UmVjb25uZWN0aW9uKHJlbW90ZUFkZHJlc3M6IHN0cmluZywgX3NvY2tldDogTm9kZVNvY2tldCB8IFdlYlNvY2tldE5vZGVTb2NrZXQsIGluaXRpYWxEYXRhQ2h1bms6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVtb3RlQWRkcmVzcyA9IHJlbW90ZUFkZHJlc3M7XG5cdFx0dGhpcy5fbG9nKGBUaGUgY2xpZW50IGhhcyByZWNvbm5lY3RlZC5gKTtcblx0XHRpZiAoIXRoaXMuX2NhblNlbmRTb2NrZXQgJiYgX3NvY2tldCBpbnN0YW5jZW9mIFdlYlNvY2tldE5vZGVTb2NrZXQpIHtcblx0XHRcdF9zb2NrZXQuc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKGZhbHNlKTtcblx0XHR9XG5cdFx0Y29uc3QgY29ubmVjdGlvbkRhdGEgPSBuZXcgQ29ubmVjdGlvbkRhdGEoX3NvY2tldCwgaW5pdGlhbERhdGFDaHVuayk7XG5cblx0XHRpZiAoIXRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzKSB7XG5cdFx0XHQvLyBUaGUgZXh0ZW5zaW9uIGhvc3QgZGlkbid0IGV2ZW4gc3RhcnQgdXAgeWV0XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uRGF0YSA9IGNvbm5lY3Rpb25EYXRhO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRTb2NrZXRUb0V4dGVuc2lvbkhvc3QodGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MsIGNvbm5lY3Rpb25EYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFuUmVzb3VyY2VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0Ly8gYWxyZWFkeSBjYWxsZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uRGF0YSkge1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvbkRhdGEuc29ja2V0LmVuZCgpO1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvbkRhdGEgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MpIHtcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLmtpbGwoKTtcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fb25DbG9zZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RhcnQoc3RhcnRQYXJhbXM6IElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0bGV0IGV4ZWNBcmd2OiBzdHJpbmdbXSA9IHByb2Nlc3MuZXhlY0FyZ3YgPyBwcm9jZXNzLmV4ZWNBcmd2LmZpbHRlcihhID0+ICEvXi0taW5zcGVjdCgtYnJrKT89Ly50ZXN0KGEpKSA6IFtdO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRpZiAoc3RhcnRQYXJhbXMucG9ydCAmJiAhKDxhbnk+cHJvY2VzcykucGtnKSB7XG5cdFx0XHRcdGV4ZWNBcmd2ID0gW1xuXHRcdFx0XHRcdGAtLWluc3BlY3Qke3N0YXJ0UGFyYW1zLmJyZWFrID8gJy1icmsnIDogJyd9PSR7c3RhcnRQYXJhbXMucG9ydH1gLFxuXHRcdFx0XHRcdCctLWV4cGVyaW1lbnRhbC1uZXR3b3JrLWluc3BlY3Rpb24nXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZyhgU3RhcnRpbmcgZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzcy4uLmApO1xuXG5cdFx0XHRjb25zdCBlbnYgPSBhd2FpdCBidWlsZFVzZXJFbnZpcm9ubWVudChzdGFydFBhcmFtcy5lbnYsIHRydWUsIHN0YXJ0UGFyYW1zLmxhbmd1YWdlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdHJlbW92ZURhbmdlcm91c0VudlZhcmlhYmxlcyhlbnYpO1xuXG5cdFx0XHRsZXQgZXh0SG9zdE5hbWVkUGlwZVNlcnZlcjogbmV0LlNlcnZlciB8IG51bGw7XG5cblx0XHRcdGlmICh0aGlzLl9jYW5TZW5kU29ja2V0KSB7XG5cdFx0XHRcdHdyaXRlRXh0SG9zdENvbm5lY3Rpb24obmV3IFNvY2tldEV4dEhvc3RDb25uZWN0aW9uKCksIGVudik7XG5cdFx0XHRcdGV4dEhvc3ROYW1lZFBpcGVTZXJ2ZXIgPSBudWxsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgeyBuYW1lZFBpcGVTZXJ2ZXIsIHBpcGVOYW1lIH0gPSBhd2FpdCB0aGlzLl9saXN0ZW5PblBpcGUoKTtcblx0XHRcdFx0d3JpdGVFeHRIb3N0Q29ubmVjdGlvbihuZXcgSVBDRXh0SG9zdENvbm5lY3Rpb24ocGlwZU5hbWUpLCBlbnYpO1xuXHRcdFx0XHRleHRIb3N0TmFtZWRQaXBlU2VydmVyID0gbmFtZWRQaXBlU2VydmVyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcHRzID0ge1xuXHRcdFx0XHRlbnYsXG5cdFx0XHRcdGV4ZWNBcmd2LFxuXHRcdFx0XHRzaWxlbnQ6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdC8vIFJlZnMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE4OTgwNVxuXHRcdFx0b3B0cy5leGVjQXJndi51bnNoaWZ0KCctLWRucy1yZXN1bHQtb3JkZXI9aXB2NGZpcnN0Jyk7XG5cblx0XHRcdC8vIFJ1biBFeHRlbnNpb24gSG9zdCBhcyBmb3JrIG9mIGN1cnJlbnQgcHJvY2Vzc1xuXHRcdFx0Y29uc3QgYXJncyA9IFsnLS10eXBlPWV4dGVuc2lvbkhvc3QnLCBgLS10cmFuc2Zvcm1VUklzYF07XG5cdFx0XHRjb25zdCB1c2VIb3N0UHJveHkgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sndXNlLWhvc3QtcHJveHknXTtcblx0XHRcdGFyZ3MucHVzaChgLS11c2VIb3N0UHJveHk9JHt1c2VIb3N0UHJveHkgPyAndHJ1ZScgOiAnZmFsc2UnfWApO1xuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdleHRlbnNpb25zLnN1cHBvcnROb2RlR2xvYmFsTmF2aWdhdG9yJykpIHtcblx0XHRcdFx0YXJncy5wdXNoKCctLXN1cHBvcnRHbG9iYWxOYXZpZ2F0b3InKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzID0gY3AuZm9yayhGaWxlQWNjZXNzLmFzRmlsZVVyaSgnYm9vdHN0cmFwLWZvcmsnKS5mc1BhdGgsIGFyZ3MsIG9wdHMpO1xuXHRcdFx0Y29uc3QgcGlkID0gdGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3MucGlkO1xuXHRcdFx0dGhpcy5fbG9nKGA8JHtwaWR9PiBMYXVuY2hlZCBFeHRlbnNpb24gSG9zdCBQcm9jZXNzLmApO1xuXG5cdFx0XHQvLyBDYXRjaCBhbGwgb3V0cHV0IGNvbWluZyBmcm9tIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzXG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5zdGRvdXQhLnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5zdGRlcnIhLnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cdFx0XHRjb25zdCBvblN0ZG91dCA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHN0cmluZz4odGhpcy5fZXh0ZW5zaW9uSG9zdFByb2Nlc3Muc3Rkb3V0ISwgJ2RhdGEnKTtcblx0XHRcdGNvbnN0IG9uU3RkZXJyID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8c3RyaW5nPih0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5zdGRlcnIhLCAnZGF0YScpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25TdGRvdXQoKGUpID0+IHRoaXMuX2xvZyhgPCR7cGlkfT4gJHtlfWApKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvblN0ZGVycigoZSkgPT4gdGhpcy5fbG9nKGA8JHtwaWR9PjxzdGRlcnI+ICR7ZX1gKSkpO1xuXG5cdFx0XHQvLyBMaWZlY3ljbGVcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLm9uKCdlcnJvcicsIChlcnIpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nRXJyb3IoYDwke3BpZH0+IEV4dGVuc2lvbiBIb3N0IFByb2Nlc3MgaGFkIGFuIGVycm9yYCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0dGhpcy5fY2xlYW5SZXNvdXJjZXMoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0UHJvY2Vzcy5vbignZXhpdCcsIChjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RTdGF0dXNTZXJ2aWNlLnNldEV4aXRJbmZvKHRoaXMuX3JlY29ubmVjdGlvblRva2VuLCB7IGNvZGUsIHNpZ25hbCB9KTtcblx0XHRcdFx0dGhpcy5fbG9nKGA8JHtwaWR9PiBFeHRlbnNpb24gSG9zdCBQcm9jZXNzIGV4aXRlZCB3aXRoIGNvZGU6ICR7Y29kZX0sIHNpZ25hbDogJHtzaWduYWx9LmApO1xuXHRcdFx0XHR0aGlzLl9jbGVhblJlc291cmNlcygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChleHRIb3N0TmFtZWRQaXBlU2VydmVyKSB7XG5cdFx0XHRcdGV4dEhvc3ROYW1lZFBpcGVTZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCAoc29ja2V0KSA9PiB7XG5cdFx0XHRcdFx0ZXh0SG9zdE5hbWVkUGlwZVNlcnZlci5jbG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX3BpcGVTb2NrZXRzKHNvY2tldCwgdGhpcy5fY29ubmVjdGlvbkRhdGEhKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlTGlzdGVuZXIgPSAobXNnOiBJRXh0SG9zdFJlYWR5TWVzc2FnZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChtc2cudHlwZSA9PT0gJ1ZTQ09ERV9FWFRIT1NUX0lQQ19SRUFEWScpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzIS5yZW1vdmVMaXN0ZW5lcignbWVzc2FnZScsIG1lc3NhZ2VMaXN0ZW5lcik7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZW5kU29ja2V0VG9FeHRlbnNpb25Ib3N0KHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzISwgdGhpcy5fY29ubmVjdGlvbkRhdGEhKTtcblx0XHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25EYXRhID0gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RQcm9jZXNzLm9uKCdtZXNzYWdlJywgbWVzc2FnZUxpc3RlbmVyKTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dFcnJvcihgRmFpbGVkIHRvIHN0YXJ0IGV4dGVuc2lvbiBob3N0IHByb2Nlc3NgKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0dGhpcy5fY2xlYW5SZXNvdXJjZXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9saXN0ZW5PblBpcGUoKTogUHJvbWlzZTx7IHBpcGVOYW1lOiBzdHJpbmc7IG5hbWVkUGlwZVNlcnZlcjogbmV0LlNlcnZlciB9PiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHsgcGlwZU5hbWU6IHN0cmluZzsgbmFtZWRQaXBlU2VydmVyOiBuZXQuU2VydmVyIH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHBpcGVOYW1lID0gY3JlYXRlUmFuZG9tSVBDSGFuZGxlKCk7XG5cblx0XHRcdGNvbnN0IG5hbWVkUGlwZVNlcnZlciA9IG5ldC5jcmVhdGVTZXJ2ZXIoKTtcblx0XHRcdG5hbWVkUGlwZVNlcnZlci5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdFx0bmFtZWRQaXBlU2VydmVyLmxpc3RlbihwaXBlTmFtZSwgKCkgPT4ge1xuXHRcdFx0XHRuYW1lZFBpcGVTZXJ2ZXI/LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRcdHJlc29sdmUoeyBwaXBlTmFtZSwgbmFtZWRQaXBlU2VydmVyIH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVhZENhc2VJbnNlbnNpdGl2ZShlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0sIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGF0aEtleXMgPSBPYmplY3Qua2V5cyhlbnYpLmZpbHRlcihrID0+IGsudG9Mb3dlckNhc2UoKSA9PT0ga2V5LnRvTG93ZXJDYXNlKCkpO1xuXHRjb25zdCBwYXRoS2V5ID0gcGF0aEtleXMubGVuZ3RoID4gMCA/IHBhdGhLZXlzWzBdIDoga2V5O1xuXHRyZXR1cm4gZW52W3BhdGhLZXldO1xufVxuXG5mdW5jdGlvbiBzZXRDYXNlSW5zZW5zaXRpdmUoZW52OiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSwga2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgcGF0aEtleXMgPSBPYmplY3Qua2V5cyhlbnYpLmZpbHRlcihrID0+IGsudG9Mb3dlckNhc2UoKSA9PT0ga2V5LnRvTG93ZXJDYXNlKCkpO1xuXHRjb25zdCBwYXRoS2V5ID0gcGF0aEtleXMubGVuZ3RoID4gMCA/IHBhdGhLZXlzWzBdIDoga2V5O1xuXHRlbnZbcGF0aEtleV0gPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlTnVsbHMoZW52OiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfCBudWxsIH0pOiB2b2lkIHtcblx0Ly8gRG9uJ3QgZGVsZXRlIHdoaWxlIGl0ZXJhdGluZyB0aGUgb2JqZWN0IGl0c2VsZlxuXHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhlbnYpKSB7XG5cdFx0aWYgKGVudltrZXldID09PSBudWxsKSB7XG5cdFx0XHRkZWxldGUgZW52W2tleV07XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLFlBQVk7QUFDaEMsU0FBOEIsaUJBQWlCO0FBQy9DLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsdUJBQXVCLFlBQVksMkJBQTJCO0FBQ3ZFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsc0JBQXNCLHlCQUF5Qiw4QkFBOEI7QUFHdEYsZUFBc0IscUJBQXFCLGlCQUFtRCxDQUFDLEdBQUcsMEJBQW1DLFVBQWtCLG9CQUErQyxZ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
