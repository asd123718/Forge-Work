import minimist from "minimist";
import * as net from "net";
import { ProcessTimeRunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { PendingMigrationError, isCancellationError, isSigPipeError, onUnexpectedError, onUnexpectedExternalError } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import * as performance from "../../../base/common/performance.js";
import { Promises } from "../../../base/node/pfs.js";
import { BufferedEmitter, PersistentProtocol, ProtocolConstants } from "../../../base/parts/ipc/common/ipc.net.js";
import { NodeSocket, WebSocketNodeSocket } from "../../../base/parts/ipc/node/ipc.net.js";
import { boolean } from "../../../editor/common/config/editorOptions.js";
import product from "../../../platform/product/common/product.js";
import { ExtensionHostMain } from "../common/extensionHostMain.js";
import { createURITransformer } from "../../../base/common/uriTransformer.js";
import { ExtHostConnectionType, readExtHostConnection } from "../../services/extensions/common/extensionHostEnv.js";
import { ExtensionHostExitCode, MessageType, createMessageOfType, isMessageOfType } from "../../services/extensions/common/extensionHostProtocol.js";
import "../common/extHost.common.services.js";
import "./extHost.node.services.js";
import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
if (process.env.VSCODE_DEV) {
  const warningListeners = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.code === "ExperimentalWarning" || warning.name === "ExperimentalWarning" || warning.name === "DeprecationWarning") {
      console.debug(warning);
      return;
    }
    warningListeners[0](warning);
  });
}
(function removeInspectPort() {
  for (let i = 0; i < process.execArgv.length; i++) {
    if (process.execArgv[i] === "--inspect-port=0") {
      process.execArgv.splice(i, 1);
      i--;
    }
  }
})();
const args = minimist(process.argv.slice(2), {
  boolean: [
    "transformURIs",
    "skipWorkspaceStorageLock",
    "supportGlobalNavigator"
  ],
  string: [
    "useHostProxy"
    // 'true' | 'false' | undefined
  ]
});
(function() {
  const Module = require2("module");
  const originalLoad = Module._load;
  Module._load = function(request) {
    if (request === "natives") {
      throw new Error('Either the extension or an NPM dependency is using the [unsupported "natives" node module](https://go.microsoft.com/fwlink/?linkid=871887).');
    }
    return originalLoad.apply(this, arguments);
  };
})();
const nativeExit = process.exit.bind(process);
const nativeOn = process.on.bind(process);
function patchProcess(allowExit) {
  process.exit = function(code) {
    if (allowExit) {
      nativeExit(code);
    } else {
      const err = new Error("An extension called process.exit() and this was prevented.");
      console.warn(err.stack);
    }
  };
  process.crash = function() {
    const err = new Error("An extension called process.crash() and this was prevented.");
    console.warn(err.stack);
  };
  process.env["ELECTRON_RUN_AS_NODE"] = "1";
  process.on = function(event, listener) {
    if (event === "uncaughtException") {
      const actualListener = listener;
      listener = function(...args2) {
        try {
          return actualListener.apply(void 0, args2);
        } catch {
        }
      };
    }
    nativeOn(event, listener);
  };
}
if (!args.supportGlobalNavigator) {
  Object.defineProperty(globalThis, "navigator", {
    get: () => {
      onUnexpectedExternalError(new PendingMigrationError("navigator is now a global in nodejs, please see https://aka.ms/vscode-extensions/navigator for additional info on this error."));
      return void 0;
    }
  });
}
let onTerminate = function(reason) {
  nativeExit();
};
function readReconnectionValue(envKey, fallback) {
  const raw = process.env[envKey];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    console.log(`[reconnection-grace-time] Extension host: env var ${envKey} not set, using default: ${fallback}ms (${Math.floor(fallback / 1e3)}s)`);
    return fallback;
  }
  const parsed = Number(raw);
  if (!isFinite(parsed) || parsed < 0) {
    console.log(`[reconnection-grace-time] Extension host: env var ${envKey} invalid value '${raw}', using default: ${fallback}ms (${Math.floor(fallback / 1e3)}s)`);
    return fallback;
  }
  const millis = Math.floor(parsed);
  const result = millis > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : millis;
  console.log(`[reconnection-grace-time] Extension host: read ${envKey}=${raw}ms (${Math.floor(result / 1e3)}s)`);
  return result;
}
function _createExtHostProtocol() {
  const extHostConnection = readExtHostConnection(process.env);
  if (extHostConnection.type === ExtHostConnectionType.MessagePort) {
    return new Promise((resolve, reject) => {
      const withPorts = (ports) => {
        const port = ports[0];
        const onMessage = new BufferedEmitter();
        port.on("message", (e) => onMessage.fire(VSBuffer.wrap(e.data)));
        port.on("close", () => {
          onTerminate("renderer closed the MessagePort");
        });
        port.start();
        resolve({
          onMessage: onMessage.event,
          send: (message) => port.postMessage(message.buffer)
        });
      };
      process.parentPort.on("message", (e) => withPorts(e.ports));
    });
  } else if (extHostConnection.type === ExtHostConnectionType.Socket) {
    return new Promise((resolve, reject) => {
      let protocol = null;
      const timer = setTimeout(() => {
        onTerminate("VSCODE_EXTHOST_IPC_SOCKET timeout");
      }, 6e4);
      const reconnectionGraceTime = readReconnectionValue("VSCODE_RECONNECTION_GRACE_TIME", ProtocolConstants.ReconnectionGraceTime);
      const reconnectionShortGraceTime = reconnectionGraceTime > 0 ? Math.min(ProtocolConstants.ReconnectionShortGraceTime, reconnectionGraceTime) : 0;
      const disconnectRunner1 = new ProcessTimeRunOnceScheduler(() => onTerminate("renderer disconnected for too long (1)"), reconnectionGraceTime);
      const disconnectRunner2 = new ProcessTimeRunOnceScheduler(() => onTerminate("renderer disconnected for too long (2)"), reconnectionShortGraceTime);
      process.on("message", (msg, handle) => {
        if (msg && msg.type === "VSCODE_EXTHOST_IPC_SOCKET") {
          handle.setNoDelay(true);
          const initialDataChunk = VSBuffer.wrap(Buffer.from(msg.initialDataChunk, "base64"));
          let socket;
          if (msg.skipWebSocketFrames) {
            socket = new NodeSocket(handle, "extHost-socket");
          } else {
            const inflateBytes = VSBuffer.wrap(Buffer.from(msg.inflateBytes, "base64"));
            socket = new WebSocketNodeSocket(new NodeSocket(handle, "extHost-socket"), msg.permessageDeflate, inflateBytes, false);
          }
          if (protocol) {
            disconnectRunner1.cancel();
            disconnectRunner2.cancel();
            protocol.beginAcceptReconnection(socket, initialDataChunk);
            protocol.endAcceptReconnection();
            protocol.sendResume();
          } else {
            clearTimeout(timer);
            protocol = new PersistentProtocol({ socket, initialChunk: initialDataChunk });
            protocol.sendResume();
            Event.once(protocol.onDidDispose)(() => onTerminate("renderer disconnected"));
            resolve(protocol);
            protocol.onSocketClose(() => {
              disconnectRunner1.schedule();
            });
          }
        }
        if (msg && msg.type === "VSCODE_EXTHOST_IPC_REDUCE_GRACE_TIME") {
          if (disconnectRunner2.isScheduled()) {
            return;
          }
          if (disconnectRunner1.isScheduled()) {
            disconnectRunner2.schedule();
          }
        }
      });
      const req = { type: "VSCODE_EXTHOST_IPC_READY" };
      process.send?.(req);
    });
  } else {
    const pipeName = extHostConnection.pipeName;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(pipeName, () => {
        socket.removeListener("error", reject);
        const protocol = new PersistentProtocol({ socket: new NodeSocket(socket, "extHost-renderer") });
        protocol.sendResume();
        resolve(protocol);
      });
      socket.once("error", reject);
      socket.on("close", () => {
        onTerminate("renderer closed the socket");
      });
    });
  }
}
async function createExtHostProtocol() {
  const protocol = await _createExtHostProtocol();
  return new class {
    constructor() {
      this._onMessage = new BufferedEmitter();
      this.onMessage = this._onMessage.event;
      this._terminating = false;
      this._protocolListener = protocol.onMessage((msg) => {
        if (isMessageOfType(msg, MessageType.Terminate)) {
          this._terminating = true;
          this._protocolListener.dispose();
          onTerminate("received terminate message from renderer");
        } else {
          this._onMessage.fire(msg);
        }
      });
    }
    send(msg) {
      if (!this._terminating) {
        protocol.send(msg);
      }
    }
    async drain() {
      if (protocol.drain) {
        return protocol.drain();
      }
    }
  }();
}
function connectToRenderer(protocol) {
  return new Promise((c) => {
    const first = protocol.onMessage((raw) => {
      first.dispose();
      const initData = JSON.parse(raw.toString());
      const rendererCommit = initData.commit;
      const myCommit = product.commit;
      if (rendererCommit && myCommit) {
        if (rendererCommit !== myCommit) {
          nativeExit(ExtensionHostExitCode.VersionMismatch);
        }
      }
      if (initData.parentPid) {
        let epermErrors = 0;
        setInterval(function() {
          try {
            process.kill(initData.parentPid, 0);
            epermErrors = 0;
          } catch (e) {
            if (e && e.code === "EPERM") {
              epermErrors++;
              if (epermErrors >= 3) {
                onTerminate(`parent process ${initData.parentPid} does not exist anymore (3 x EPERM): ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
              }
            } else {
              onTerminate(`parent process ${initData.parentPid} does not exist anymore: ${e.message} (code: ${e.code}) (errno: ${e.errno})`);
            }
          }
        }, 1e3);
        let watchdog;
        try {
          watchdog = require2("@vscode/native-watchdog");
          watchdog.start(initData.parentPid);
        } catch (err) {
          onUnexpectedError(err);
        }
      }
      protocol.send(createMessageOfType(MessageType.Initialized));
      c({ protocol, initData });
    });
    protocol.send(createMessageOfType(MessageType.Ready));
  });
}
async function startExtensionHostProcess() {
  const unhandledPromises = [];
  process.on("unhandledRejection", (reason, promise) => {
    unhandledPromises.push(promise);
    setTimeout(() => {
      const idx = unhandledPromises.indexOf(promise);
      if (idx >= 0) {
        promise.catch((e) => {
          unhandledPromises.splice(idx, 1);
          if (!isCancellationError(e)) {
            console.warn(`rejected promise not handled within 1 second: ${e}`);
            if (e && e.stack) {
              console.warn(`stack trace: ${e.stack}`);
            }
            if (reason) {
              onUnexpectedError(reason);
            }
          }
        });
      }
    }, 1e3);
  });
  process.on("rejectionHandled", (promise) => {
    const idx = unhandledPromises.indexOf(promise);
    if (idx >= 0) {
      unhandledPromises.splice(idx, 1);
    }
  });
  process.on("uncaughtException", function(err) {
    if (!isSigPipeError(err)) {
      onUnexpectedError(err);
    }
  });
  performance.mark(`code/extHost/willConnectToRenderer`);
  const protocol = await createExtHostProtocol();
  performance.mark(`code/extHost/didConnectToRenderer`);
  const renderer = await connectToRenderer(protocol);
  performance.mark(`code/extHost/didWaitForInitData`);
  const { initData } = renderer;
  patchProcess(!!initData.environment.extensionTestsLocationURI);
  initData.environment.useHostProxy = args.useHostProxy !== void 0 ? args.useHostProxy !== "false" : void 0;
  initData.environment.skipWorkspaceStorageLock = boolean(args.skipWorkspaceStorageLock, false);
  const hostUtils = new class NodeHost {
    constructor() {
      this.pid = process.pid;
    }
    exit(code) {
      nativeExit(code);
    }
    fsExists(path) {
      return Promises.exists(path);
    }
    fsRealpath(path) {
      return Promises.realpath(path);
    }
  }();
  let uriTransformer = null;
  if (initData.remote.authority && args.transformURIs) {
    uriTransformer = createURITransformer(initData.remote.authority);
  }
  const extensionHostMain = new ExtensionHostMain(
    renderer.protocol,
    initData,
    hostUtils,
    uriTransformer
  );
  onTerminate = (reason) => extensionHostMain.terminate(reason);
}
startExtensionHostProcess().catch((err) => console.log(err));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcbm9kZVxcZXh0ZW5zaW9uSG9zdFByb2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgbWluaW1pc3QgZnJvbSAnbWluaW1pc3QnO1xuaW1wb3J0ICogYXMgbmF0aXZlV2F0Y2hkb2cgZnJvbSAnQHZzY29kZS9uYXRpdmUtd2F0Y2hkb2cnO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgeyBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nTWlncmF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IsIGlzU2lnUGlwZUVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIHBlcmZvcm1hbmNlIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IElVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IEJ1ZmZlcmVkRW1pdHRlciwgUGVyc2lzdGVudFByb3RvY29sLCBQcm90b2NvbENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IE5vZGVTb2NrZXQsIFdlYlNvY2tldE5vZGVTb2NrZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHR5cGUgeyBNZXNzYWdlUG9ydE1haW4sIE1lc3NhZ2VFdmVudCBhcyBVdGlsaXR5TWVzc2FnZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L25vZGUvZWxlY3Ryb25UeXBlcy5qcyc7XG5pbXBvcnQgeyBib29sZWFuIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RNYWluLCBJRXhpdEZuIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RNYWluLmpzJztcbmltcG9ydCB7IElIb3N0VXRpbHMgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVVJJVHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlUcmFuc2Zvcm1lci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29ubmVjdGlvblR5cGUsIHJlYWRFeHRIb3N0Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RFbnYuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEV4aXRDb2RlLCBJRXh0SG9zdFJlYWR5TWVzc2FnZSwgSUV4dEhvc3RSZWR1Y2VHcmFjZVRpbWVNZXNzYWdlLCBJRXh0SG9zdFNvY2tldE1lc3NhZ2UsIElFeHRlbnNpb25Ib3N0SW5pdERhdGEsIE1lc3NhZ2VUeXBlLCBjcmVhdGVNZXNzYWdlT2ZUeXBlLCBpc01lc3NhZ2VPZlR5cGUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICcuLi9jb21tb24vZXh0SG9zdC5jb21tb24uc2VydmljZXMuanMnO1xuaW1wb3J0ICcuL2V4dEhvc3Qubm9kZS5zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbm9kZTptb2R1bGUnO1xuY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblxuaW50ZXJmYWNlIFBhcnNlZEV4dEhvc3RBcmdzIHtcblx0dHJhbnNmb3JtVVJJcz86IGJvb2xlYW47XG5cdHNraXBXb3Jrc3BhY2VTdG9yYWdlTG9jaz86IGJvb2xlYW47XG5cdHN1cHBvcnRHbG9iYWxOYXZpZ2F0b3I/OiBib29sZWFuOyAvLyBlbmFibGUgZ2xvYmFsIG5hdmlnYXRvciBvYmplY3QgaW4gbm9kZWpzXG5cdHVzZUhvc3RQcm94eT86ICd0cnVlJyB8ICdmYWxzZSc7IC8vIHVzZSBhIHN0cmluZywgYXMgdW5kZWZpbmVkIGlzIGFsc28gYSB2YWxpZCB2YWx1ZVxufVxuXG4vLyBzaWxlbmNlIGV4cGVyaW1lbnRhbCB3YXJuaW5ncyB3aGVuIGluIGRldmVsb3BtZW50XG5pZiAocHJvY2Vzcy5lbnYuVlNDT0RFX0RFVikge1xuXHRjb25zdCB3YXJuaW5nTGlzdGVuZXJzID0gcHJvY2Vzcy5saXN0ZW5lcnMoJ3dhcm5pbmcnKTtcblx0cHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3dhcm5pbmcnKTtcblx0cHJvY2Vzcy5vbignd2FybmluZycsICh3YXJuaW5nOiBhbnkpID0+IHtcblx0XHRpZiAod2FybmluZy5jb2RlID09PSAnRXhwZXJpbWVudGFsV2FybmluZycgfHwgd2FybmluZy5uYW1lID09PSAnRXhwZXJpbWVudGFsV2FybmluZycgfHwgd2FybmluZy5uYW1lID09PSAnRGVwcmVjYXRpb25XYXJuaW5nJykge1xuXHRcdFx0Y29uc29sZS5kZWJ1Zyh3YXJuaW5nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3YXJuaW5nTGlzdGVuZXJzWzBdKHdhcm5pbmcpO1xuXHR9KTtcbn1cblxuLy8gd29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzg1NDkwXG4vLyByZW1vdmUgLS1pbnNwZWN0LXBvcnQ9MCBhZnRlciBzdGFydCBzbyB0aGF0IGl0IGRvZXNuJ3QgdHJpZ2dlciBMU1AgZGVidWdnaW5nXG4oZnVuY3Rpb24gcmVtb3ZlSW5zcGVjdFBvcnQoKSB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcHJvY2Vzcy5leGVjQXJndi5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChwcm9jZXNzLmV4ZWNBcmd2W2ldID09PSAnLS1pbnNwZWN0LXBvcnQ9MCcpIHtcblx0XHRcdHByb2Nlc3MuZXhlY0FyZ3Yuc3BsaWNlKGksIDEpO1xuXHRcdFx0aS0tO1xuXHRcdH1cblx0fVxufSkoKTtcblxuY29uc3QgYXJncyA9IG1pbmltaXN0KHByb2Nlc3MuYXJndi5zbGljZSgyKSwge1xuXHRib29sZWFuOiBbXG5cdFx0J3RyYW5zZm9ybVVSSXMnLFxuXHRcdCdza2lwV29ya3NwYWNlU3RvcmFnZUxvY2snLFxuXHRcdCdzdXBwb3J0R2xvYmFsTmF2aWdhdG9yJyxcblx0XSxcblx0c3RyaW5nOiBbXG5cdFx0J3VzZUhvc3RQcm94eScgLy8gJ3RydWUnIHwgJ2ZhbHNlJyB8IHVuZGVmaW5lZFxuXHRdXG59KSBhcyBQYXJzZWRFeHRIb3N0QXJncztcblxuLy8gV2l0aCBFbGVjdHJvbiAyLnggYW5kIG5vZGUuanMgOC54IHRoZSBcIm5hdGl2ZXNcIiBtb2R1bGVcbi8vIGNhbiBjYXVzZSBhIG5hdGl2ZSBjcmFzaCAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMTk4OTEgYW5kXG4vLyBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzEwOTA1KS4gVG8gcHJldmVudCB0aGlzIGZyb21cbi8vIGhhcHBlbmluZyB3ZSBlc3NlbnRpYWxseSBibG9ja2xpc3QgdGhpcyBtb2R1bGUgZnJvbSBnZXR0aW5nIGxvYWRlZCBpbiBhbnlcbi8vIGV4dGVuc2lvbiBieSBwYXRjaGluZyB0aGUgbm9kZSByZXF1aXJlKCkgZnVuY3Rpb24uXG4oZnVuY3Rpb24gKCkge1xuXHRjb25zdCBNb2R1bGUgPSByZXF1aXJlKCdtb2R1bGUnKTtcblx0Y29uc3Qgb3JpZ2luYWxMb2FkID0gTW9kdWxlLl9sb2FkO1xuXG5cdE1vZHVsZS5fbG9hZCA9IGZ1bmN0aW9uIChyZXF1ZXN0OiBzdHJpbmcpIHtcblx0XHRpZiAocmVxdWVzdCA9PT0gJ25hdGl2ZXMnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VpdGhlciB0aGUgZXh0ZW5zaW9uIG9yIGFuIE5QTSBkZXBlbmRlbmN5IGlzIHVzaW5nIHRoZSBbdW5zdXBwb3J0ZWQgXCJuYXRpdmVzXCIgbm9kZSBtb2R1bGVdKGh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD04NzE4ODcpLicpO1xuXHRcdH1cblxuXHRcdHJldHVybiBvcmlnaW5hbExvYWQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fTtcbn0pKCk7XG5cbi8vIGN1c3RvbSBwcm9jZXNzLmV4aXQgbG9naWMuLi5cbmNvbnN0IG5hdGl2ZUV4aXQ6IElFeGl0Rm4gPSBwcm9jZXNzLmV4aXQuYmluZChwcm9jZXNzKTtcbmNvbnN0IG5hdGl2ZU9uID0gcHJvY2Vzcy5vbi5iaW5kKHByb2Nlc3MpO1xuZnVuY3Rpb24gcGF0Y2hQcm9jZXNzKGFsbG93RXhpdDogYm9vbGVhbikge1xuXHRwcm9jZXNzLmV4aXQgPSBmdW5jdGlvbiAoY29kZT86IG51bWJlcikge1xuXHRcdGlmIChhbGxvd0V4aXQpIHtcblx0XHRcdG5hdGl2ZUV4aXQoY29kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQW4gZXh0ZW5zaW9uIGNhbGxlZCBwcm9jZXNzLmV4aXQoKSBhbmQgdGhpcyB3YXMgcHJldmVudGVkLicpO1xuXHRcdFx0Y29uc29sZS53YXJuKGVyci5zdGFjayk7XG5cdFx0fVxuXHR9IGFzIChjb2RlPzogbnVtYmVyKSA9PiBuZXZlcjtcblxuXHQvLyBvdmVycmlkZSBFbGVjdHJvbidzIHByb2Nlc3MuY3Jhc2goKSBtZXRob2Rcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdChwcm9jZXNzIGFzIGFueSAvKiBieXBhc3MgbGF5ZXIgY2hlY2tlciAqLykuY3Jhc2ggPSBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdBbiBleHRlbnNpb24gY2FsbGVkIHByb2Nlc3MuY3Jhc2goKSBhbmQgdGhpcyB3YXMgcHJldmVudGVkLicpO1xuXHRcdGNvbnNvbGUud2FybihlcnIuc3RhY2spO1xuXHR9O1xuXG5cdC8vIFNldCBFTEVDVFJPTl9SVU5fQVNfTk9ERSBlbnZpcm9ubWVudCB2YXJpYWJsZSBmb3IgZXh0ZW5zaW9ucyB0aGF0IHVzZVxuXHQvLyBjaGlsZF9wcm9jZXNzLnNwYXduIHdpdGggcHJvY2Vzcy5leGVjUGF0aCBhbmQgZXhwZWN0IHRvIHJ1biBhcyBub2RlIHByb2Nlc3Ncblx0Ly8gb24gdGhlIGRlc2t0b3AuXG5cdC8vIFJlZnMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE1MTAxMiNpc3N1ZWNvbW1lbnQtMTE1NjU5MzIyOFxuXHRwcm9jZXNzLmVudlsnRUxFQ1RST05fUlVOX0FTX05PREUnXSA9ICcxJztcblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0cHJvY2Vzcy5vbiA9IDxhbnk+ZnVuY3Rpb24gKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKSB7XG5cdFx0aWYgKGV2ZW50ID09PSAndW5jYXVnaHRFeGNlcHRpb24nKSB7XG5cdFx0XHRjb25zdCBhY3R1YWxMaXN0ZW5lciA9IGxpc3RlbmVyO1xuXHRcdFx0bGlzdGVuZXIgPSBmdW5jdGlvbiAoLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdHVhbExpc3RlbmVyLmFwcGx5KHVuZGVmaW5lZCwgYXJncyk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIERPIE5PVCBIQU5ETEUgTk9SIFBSSU5UIHRoZSBlcnJvciBoZXJlIGJlY2F1c2UgdGhpcyBjYW4gYW5kIHdpbGwgbGVhZCB0b1xuXHRcdFx0XHRcdC8vIG1vcmUgZXJyb3JzIHdoaWNoIHdpbGwgY2F1c2UgZXJyb3IgaGFuZGxpbmcgdG8gYmUgcmVlbnRyYW50IGFuZCBldmVudHVhbGx5XG5cdFx0XHRcdFx0Ly8gb3ZlcmZsb3dpbmcgdGhlIHN0YWNrLiBEbyBub3QgYmUgc2FkLCB3ZSBkbyBoYW5kbGUgYW5kIGFubm90YXRlIHVuY2F1Z2h0XG5cdFx0XHRcdFx0Ly8gZXJyb3JzIHByb3Blcmx5IGluICdleHRlbnNpb25Ib3N0TWFpbidcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0bmF0aXZlT24oZXZlbnQsIGxpc3RlbmVyKTtcblx0fTtcblxufVxuXG4vLyBOb2RlSlMgc2luY2UgdjIxIGRlZmluZXMgbmF2aWdhdG9yIGFzIGEgZ2xvYmFsIG9iamVjdC4gVGhpcyB3aWxsIGxpa2VseSBzdXJwcmlzZSBtYW55IGV4dGVuc2lvbnMgYW5kIHBvdGVudGlhbGx5IGJyZWFrIHRoZW1cbi8vIGJlY2F1c2UgYG5hdmlnYXRvcmAgaGFzIGhpc3RvcmljYWxseSBvZnRlbiBiZWVuIHVzZWQgdG8gY2hlY2sgaWYgcnVubmluZyBpbiBhIGJyb3dzZXIgKHZzIHJ1bm5pbmcgaW5zaWRlIE5vZGVKUylcbmlmICghYXJncy5zdXBwb3J0R2xvYmFsTmF2aWdhdG9yKSB7XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShnbG9iYWxUaGlzLCAnbmF2aWdhdG9yJywge1xuXHRcdGdldDogKCkgPT4ge1xuXHRcdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihuZXcgUGVuZGluZ01pZ3JhdGlvbkVycm9yKCduYXZpZ2F0b3IgaXMgbm93IGEgZ2xvYmFsIGluIG5vZGVqcywgcGxlYXNlIHNlZSBodHRwczovL2FrYS5tcy92c2NvZGUtZXh0ZW5zaW9ucy9uYXZpZ2F0b3IgZm9yIGFkZGl0aW9uYWwgaW5mbyBvbiB0aGlzIGVycm9yLicpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KTtcbn1cblxuXG5pbnRlcmZhY2UgSVJlbmRlcmVyQ29ubmVjdGlvbiB7XG5cdHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbDtcblx0aW5pdERhdGE6IElFeHRlbnNpb25Ib3N0SW5pdERhdGE7XG59XG5cbi8vIFRoaXMgY2FsbHMgZXhpdCBkaXJlY3RseSBpbiBjYXNlIHRoZSBpbml0aWFsaXphdGlvbiBpcyBub3QgZmluaXNoZWQgYW5kIHdlIG5lZWQgdG8gZXhpdFxuLy8gT3RoZXJ3aXNlLCBpZiBpbml0aWFsaXphdGlvbiBjb21wbGV0ZWQgd2UgZ28gdG8gZXh0ZW5zaW9uSG9zdE1haW4udGVybWluYXRlKClcbmxldCBvblRlcm1pbmF0ZSA9IGZ1bmN0aW9uIChyZWFzb246IHN0cmluZykge1xuXHRuYXRpdmVFeGl0KCk7XG59O1xuXG5mdW5jdGlvbiByZWFkUmVjb25uZWN0aW9uVmFsdWUoZW52S2V5OiBzdHJpbmcsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCByYXcgPSBwcm9jZXNzLmVudltlbnZLZXldO1xuXHRpZiAodHlwZW9mIHJhdyAhPT0gJ3N0cmluZycgfHwgcmF3LnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRjb25zb2xlLmxvZyhgW3JlY29ubmVjdGlvbi1ncmFjZS10aW1lXSBFeHRlbnNpb24gaG9zdDogZW52IHZhciAke2VudktleX0gbm90IHNldCwgdXNpbmcgZGVmYXVsdDogJHtmYWxsYmFja31tcyAoJHtNYXRoLmZsb29yKGZhbGxiYWNrIC8gMTAwMCl9cylgKTtcblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblx0Y29uc3QgcGFyc2VkID0gTnVtYmVyKHJhdyk7XG5cdGlmICghaXNGaW5pdGUocGFyc2VkKSB8fCBwYXJzZWQgPCAwKSB7XG5cdFx0Y29uc29sZS5sb2coYFtyZWNvbm5lY3Rpb24tZ3JhY2UtdGltZV0gRXh0ZW5zaW9uIGhvc3Q6IGVudiB2YXIgJHtlbnZLZXl9IGludmFsaWQgdmFsdWUgJyR7cmF3fScsIHVzaW5nIGRlZmF1bHQ6ICR7ZmFsbGJhY2t9bXMgKCR7TWF0aC5mbG9vcihmYWxsYmFjayAvIDEwMDApfXMpYCk7XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9XG5cdGNvbnN0IG1pbGxpcyA9IE1hdGguZmxvb3IocGFyc2VkKTtcblx0Y29uc3QgcmVzdWx0ID0gbWlsbGlzID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgPyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA6IG1pbGxpcztcblx0Y29uc29sZS5sb2coYFtyZWNvbm5lY3Rpb24tZ3JhY2UtdGltZV0gRXh0ZW5zaW9uIGhvc3Q6IHJlYWQgJHtlbnZLZXl9PSR7cmF3fW1zICgke01hdGguZmxvb3IocmVzdWx0IC8gMTAwMCl9cylgKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gX2NyZWF0ZUV4dEhvc3RQcm90b2NvbCgpOiBQcm9taXNlPElNZXNzYWdlUGFzc2luZ1Byb3RvY29sPiB7XG5cdGNvbnN0IGV4dEhvc3RDb25uZWN0aW9uID0gcmVhZEV4dEhvc3RDb25uZWN0aW9uKHByb2Nlc3MuZW52KTtcblxuXHRpZiAoZXh0SG9zdENvbm5lY3Rpb24udHlwZSA9PT0gRXh0SG9zdENvbm5lY3Rpb25UeXBlLk1lc3NhZ2VQb3J0KSB7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0Y29uc3Qgd2l0aFBvcnRzID0gKHBvcnRzOiBNZXNzYWdlUG9ydE1haW5bXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBwb3J0ID0gcG9ydHNbMF07XG5cdFx0XHRcdGNvbnN0IG9uTWVzc2FnZSA9IG5ldyBCdWZmZXJlZEVtaXR0ZXI8VlNCdWZmZXI+KCk7XG5cdFx0XHRcdHBvcnQub24oJ21lc3NhZ2UnLCAoZSkgPT4gb25NZXNzYWdlLmZpcmUoVlNCdWZmZXIud3JhcChlLmRhdGEgYXMgVWludDhBcnJheSkpKTtcblx0XHRcdFx0cG9ydC5vbignY2xvc2UnLCAoKSA9PiB7XG5cdFx0XHRcdFx0b25UZXJtaW5hdGUoJ3JlbmRlcmVyIGNsb3NlZCB0aGUgTWVzc2FnZVBvcnQnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHBvcnQuc3RhcnQoKTtcblxuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRvbk1lc3NhZ2U6IG9uTWVzc2FnZS5ldmVudCxcblx0XHRcdFx0XHRzZW5kOiBtZXNzYWdlID0+IHBvcnQucG9zdE1lc3NhZ2UobWVzc2FnZS5idWZmZXIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0KHByb2Nlc3MgYXMgdW5rbm93biBhcyB7IHBhcmVudFBvcnQ6IHsgb246IChldmVudDogJ21lc3NhZ2UnLCBsaXN0ZW5lcjogKG1lc3NhZ2VFdmVudDogVXRpbGl0eU1lc3NhZ2VFdmVudCkgPT4gdm9pZCkgPT4gdm9pZCB9IH0pLnBhcmVudFBvcnQub24oJ21lc3NhZ2UnLCAoZTogVXRpbGl0eU1lc3NhZ2VFdmVudCkgPT4gd2l0aFBvcnRzKGUucG9ydHMpKTtcblx0XHR9KTtcblxuXHR9IGVsc2UgaWYgKGV4dEhvc3RDb25uZWN0aW9uLnR5cGUgPT09IEV4dEhvc3RDb25uZWN0aW9uVHlwZS5Tb2NrZXQpIHtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxQZXJzaXN0ZW50UHJvdG9jb2w+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0bGV0IHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0b25UZXJtaW5hdGUoJ1ZTQ09ERV9FWFRIT1NUX0lQQ19TT0NLRVQgdGltZW91dCcpO1xuXHRcdFx0fSwgNjAwMDApO1xuXG5cdFx0XHRjb25zdCByZWNvbm5lY3Rpb25HcmFjZVRpbWUgPSByZWFkUmVjb25uZWN0aW9uVmFsdWUoJ1ZTQ09ERV9SRUNPTk5FQ1RJT05fR1JBQ0VfVElNRScsIFByb3RvY29sQ29uc3RhbnRzLlJlY29ubmVjdGlvbkdyYWNlVGltZSk7XG5cdFx0XHRjb25zdCByZWNvbm5lY3Rpb25TaG9ydEdyYWNlVGltZSA9IHJlY29ubmVjdGlvbkdyYWNlVGltZSA+IDAgPyBNYXRoLm1pbihQcm90b2NvbENvbnN0YW50cy5SZWNvbm5lY3Rpb25TaG9ydEdyYWNlVGltZSwgcmVjb25uZWN0aW9uR3JhY2VUaW1lKSA6IDA7XG5cdFx0XHRjb25zdCBkaXNjb25uZWN0UnVubmVyMSA9IG5ldyBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gb25UZXJtaW5hdGUoJ3JlbmRlcmVyIGRpc2Nvbm5lY3RlZCBmb3IgdG9vIGxvbmcgKDEpJyksIHJlY29ubmVjdGlvbkdyYWNlVGltZSk7XG5cdFx0XHRjb25zdCBkaXNjb25uZWN0UnVubmVyMiA9IG5ldyBQcm9jZXNzVGltZVJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gb25UZXJtaW5hdGUoJ3JlbmRlcmVyIGRpc2Nvbm5lY3RlZCBmb3IgdG9vIGxvbmcgKDIpJyksIHJlY29ubmVjdGlvblNob3J0R3JhY2VUaW1lKTtcblxuXHRcdFx0cHJvY2Vzcy5vbignbWVzc2FnZScsIChtc2c6IElFeHRIb3N0U29ja2V0TWVzc2FnZSB8IElFeHRIb3N0UmVkdWNlR3JhY2VUaW1lTWVzc2FnZSwgaGFuZGxlOiBuZXQuU29ja2V0KSA9PiB7XG5cdFx0XHRcdGlmIChtc2cgJiYgbXNnLnR5cGUgPT09ICdWU0NPREVfRVhUSE9TVF9JUENfU09DS0VUJykge1xuXHRcdFx0XHRcdC8vIERpc2FibGUgTmFnbGUncyBhbGdvcml0aG0uIFdlIGFsc28gZG8gdGhpcyBvbiB0aGUgc2VydmVyIHByb2Nlc3MsXG5cdFx0XHRcdFx0Ly8gYnV0IG5vZGVqcyBkb2Vzbid0IGRvY3VtZW50IGlmIHRoaXMgb3B0aW9uIGlzIHRyYW5zZmVycmVkIHdpdGggdGhlIHNvY2tldFxuXHRcdFx0XHRcdGhhbmRsZS5zZXROb0RlbGF5KHRydWUpO1xuXG5cdFx0XHRcdFx0Y29uc3QgaW5pdGlhbERhdGFDaHVuayA9IFZTQnVmZmVyLndyYXAoQnVmZmVyLmZyb20obXNnLmluaXRpYWxEYXRhQ2h1bmssICdiYXNlNjQnKSk7XG5cdFx0XHRcdFx0bGV0IHNvY2tldDogTm9kZVNvY2tldCB8IFdlYlNvY2tldE5vZGVTb2NrZXQ7XG5cdFx0XHRcdFx0aWYgKG1zZy5za2lwV2ViU29ja2V0RnJhbWVzKSB7XG5cdFx0XHRcdFx0XHRzb2NrZXQgPSBuZXcgTm9kZVNvY2tldChoYW5kbGUsICdleHRIb3N0LXNvY2tldCcpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmZsYXRlQnl0ZXMgPSBWU0J1ZmZlci53cmFwKEJ1ZmZlci5mcm9tKG1zZy5pbmZsYXRlQnl0ZXMsICdiYXNlNjQnKSk7XG5cdFx0XHRcdFx0XHRzb2NrZXQgPSBuZXcgV2ViU29ja2V0Tm9kZVNvY2tldChuZXcgTm9kZVNvY2tldChoYW5kbGUsICdleHRIb3N0LXNvY2tldCcpLCBtc2cucGVybWVzc2FnZURlZmxhdGUsIGluZmxhdGVCeXRlcywgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocHJvdG9jb2wpIHtcblx0XHRcdFx0XHRcdC8vIHJlY29ubmVjdGlvbiBjYXNlXG5cdFx0XHRcdFx0XHRkaXNjb25uZWN0UnVubmVyMS5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdGRpc2Nvbm5lY3RSdW5uZXIyLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0cHJvdG9jb2wuYmVnaW5BY2NlcHRSZWNvbm5lY3Rpb24oc29ja2V0LCBpbml0aWFsRGF0YUNodW5rKTtcblx0XHRcdFx0XHRcdHByb3RvY29sLmVuZEFjY2VwdFJlY29ubmVjdGlvbigpO1xuXHRcdFx0XHRcdFx0cHJvdG9jb2wuc2VuZFJlc3VtZSgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHRcdFx0cHJvdG9jb2wgPSBuZXcgUGVyc2lzdGVudFByb3RvY29sKHsgc29ja2V0LCBpbml0aWFsQ2h1bms6IGluaXRpYWxEYXRhQ2h1bmsgfSk7XG5cdFx0XHRcdFx0XHRwcm90b2NvbC5zZW5kUmVzdW1lKCk7XG5cdFx0XHRcdFx0XHRFdmVudC5vbmNlKHByb3RvY29sLm9uRGlkRGlzcG9zZSkoKCkgPT4gb25UZXJtaW5hdGUoJ3JlbmRlcmVyIGRpc2Nvbm5lY3RlZCcpKTtcblx0XHRcdFx0XHRcdHJlc29sdmUocHJvdG9jb2wpO1xuXG5cdFx0XHRcdFx0XHQvLyBXYWl0IGZvciByaWNoIGNsaWVudCB0byByZWNvbm5lY3Rcblx0XHRcdFx0XHRcdHByb3RvY29sLm9uU29ja2V0Q2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGUgc29ja2V0IGhhcyBjbG9zZWQsIGxldCdzIGdpdmUgdGhlIHJlbmRlcmVyIGEgY2VydGFpbiBhbW91bnQgb2YgdGltZSB0byByZWNvbm5lY3Rcblx0XHRcdFx0XHRcdFx0ZGlzY29ubmVjdFJ1bm5lcjEuc2NoZWR1bGUoKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobXNnICYmIG1zZy50eXBlID09PSAnVlNDT0RFX0VYVEhPU1RfSVBDX1JFRFVDRV9HUkFDRV9USU1FJykge1xuXHRcdFx0XHRcdGlmIChkaXNjb25uZWN0UnVubmVyMi5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0XHQvLyB3ZSBhcmUgZGlzY29ubmVjdGVkIGFuZCBhbHJlYWR5IHJ1bm5pbmcgdGhlIHNob3J0IHJlY29ubmVjdGlvbiB0aW1lclxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGlzY29ubmVjdFJ1bm5lcjEuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRcdFx0Ly8gd2UgYXJlIGRpc2Nvbm5lY3RlZCBhbmQgcnVubmluZyB0aGUgbG9uZyByZWNvbm5lY3Rpb24gdGltZXJcblx0XHRcdFx0XHRcdGRpc2Nvbm5lY3RSdW5uZXIyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTm93IHRoYXQgd2UgaGF2ZSBtYW5hZ2VkIHRvIGluc3RhbGwgYSBtZXNzYWdlIGxpc3RlbmVyLCBhc2sgdGhlIG90aGVyIHNpZGUgdG8gc2VuZCB1cyB0aGUgc29ja2V0XG5cdFx0XHRjb25zdCByZXE6IElFeHRIb3N0UmVhZHlNZXNzYWdlID0geyB0eXBlOiAnVlNDT0RFX0VYVEhPU1RfSVBDX1JFQURZJyB9O1xuXHRcdFx0cHJvY2Vzcy5zZW5kPy4ocmVxKTtcblx0XHR9KTtcblxuXHR9IGVsc2Uge1xuXG5cdFx0Y29uc3QgcGlwZU5hbWUgPSBleHRIb3N0Q29ubmVjdGlvbi5waXBlTmFtZTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxQZXJzaXN0ZW50UHJvdG9jb2w+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0Y29uc3Qgc29ja2V0ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24ocGlwZU5hbWUsICgpID0+IHtcblx0XHRcdFx0c29ja2V0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRcdGNvbnN0IHByb3RvY29sID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldDogbmV3IE5vZGVTb2NrZXQoc29ja2V0LCAnZXh0SG9zdC1yZW5kZXJlcicpIH0pO1xuXHRcdFx0XHRwcm90b2NvbC5zZW5kUmVzdW1lKCk7XG5cdFx0XHRcdHJlc29sdmUocHJvdG9jb2wpO1xuXHRcdFx0fSk7XG5cdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXG5cdFx0XHRzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuXHRcdFx0XHRvblRlcm1pbmF0ZSgncmVuZGVyZXIgY2xvc2VkIHRoZSBzb2NrZXQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUV4dEhvc3RQcm90b2NvbCgpOiBQcm9taXNlPElNZXNzYWdlUGFzc2luZ1Byb3RvY29sPiB7XG5cblx0Y29uc3QgcHJvdG9jb2wgPSBhd2FpdCBfY3JlYXRlRXh0SG9zdFByb3RvY29sKCk7XG5cblx0cmV0dXJuIG5ldyBjbGFzcyBpbXBsZW1lbnRzIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IG5ldyBCdWZmZXJlZEVtaXR0ZXI8VlNCdWZmZXI+KCk7XG5cdFx0cmVhZG9ubHkgb25NZXNzYWdlOiBFdmVudDxWU0J1ZmZlcj4gPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0XHRwcml2YXRlIF90ZXJtaW5hdGluZzogYm9vbGVhbjtcblx0XHRwcml2YXRlIF9wcm90b2NvbExpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0dGhpcy5fdGVybWluYXRpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3Byb3RvY29sTGlzdGVuZXIgPSBwcm90b2NvbC5vbk1lc3NhZ2UoKG1zZykgPT4ge1xuXHRcdFx0XHRpZiAoaXNNZXNzYWdlT2ZUeXBlKG1zZywgTWVzc2FnZVR5cGUuVGVybWluYXRlKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmF0aW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9wcm90b2NvbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRvblRlcm1pbmF0ZSgncmVjZWl2ZWQgdGVybWluYXRlIG1lc3NhZ2UgZnJvbSByZW5kZXJlcicpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKG1zZyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHNlbmQobXNnOiBhbnkpOiB2b2lkIHtcblx0XHRcdGlmICghdGhpcy5fdGVybWluYXRpbmcpIHtcblx0XHRcdFx0cHJvdG9jb2wuc2VuZChtc2cpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzeW5jIGRyYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0aWYgKHByb3RvY29sLmRyYWluKSB7XG5cdFx0XHRcdHJldHVybiBwcm90b2NvbC5kcmFpbigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gY29ubmVjdFRvUmVuZGVyZXIocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sKTogUHJvbWlzZTxJUmVuZGVyZXJDb25uZWN0aW9uPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxJUmVuZGVyZXJDb25uZWN0aW9uPigoYykgPT4ge1xuXG5cdFx0Ly8gTGlzdGVuIGluaXQgZGF0YSBtZXNzYWdlXG5cdFx0Y29uc3QgZmlyc3QgPSBwcm90b2NvbC5vbk1lc3NhZ2UocmF3ID0+IHtcblx0XHRcdGZpcnN0LmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgaW5pdERhdGEgPSA8SUV4dGVuc2lvbkhvc3RJbml0RGF0YT5KU09OLnBhcnNlKHJhdy50b1N0cmluZygpKTtcblxuXHRcdFx0Y29uc3QgcmVuZGVyZXJDb21taXQgPSBpbml0RGF0YS5jb21taXQ7XG5cdFx0XHRjb25zdCBteUNvbW1pdCA9IHByb2R1Y3QuY29tbWl0O1xuXG5cdFx0XHRpZiAocmVuZGVyZXJDb21taXQgJiYgbXlDb21taXQpIHtcblx0XHRcdFx0Ly8gUnVubmluZyBpbiB0aGUgYnVpbHQgdmVyc2lvbiB3aGVyZSBjb21taXRzIGFyZSBkZWZpbmVkXG5cdFx0XHRcdGlmIChyZW5kZXJlckNvbW1pdCAhPT0gbXlDb21taXQpIHtcblx0XHRcdFx0XHRuYXRpdmVFeGl0KEV4dGVuc2lvbkhvc3RFeGl0Q29kZS5WZXJzaW9uTWlzbWF0Y2gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbml0RGF0YS5wYXJlbnRQaWQpIHtcblx0XHRcdFx0Ly8gS2lsbCBvbmVzZWxmIGlmIG9uZSdzIHBhcmVudCBkaWVzLiBNdWNoIGRyYW1hLlxuXHRcdFx0XHRsZXQgZXBlcm1FcnJvcnMgPSAwO1xuXHRcdFx0XHRzZXRJbnRlcnZhbChmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHByb2Nlc3Mua2lsbChpbml0RGF0YS5wYXJlbnRQaWQsIDApOyAvLyB0aHJvd3MgYW4gZXhjZXB0aW9uIGlmIHRoZSBtYWluIHByb2Nlc3MgZG9lc24ndCBleGlzdCBhbnltb3JlLlxuXHRcdFx0XHRcdFx0ZXBlcm1FcnJvcnMgPSAwO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGlmIChlICYmIGUuY29kZSA9PT0gJ0VQRVJNJykge1xuXHRcdFx0XHRcdFx0XHQvLyBFdmVuIGlmIHRoZSBwYXJlbnQgcHJvY2VzcyBpcyBzdGlsbCBhbGl2ZSxcblx0XHRcdFx0XHRcdFx0Ly8gc29tZSBhbnRpdmlydXMgc29mdHdhcmUgY2FuIGxlYWQgdG8gYW4gRVBFUk0gZXJyb3IgdG8gYmUgdGhyb3duIGhlcmUuXG5cdFx0XHRcdFx0XHRcdC8vIExldCdzIHRlcm1pbmF0ZSBvbmx5IGlmIHdlIGdldCAzIGNvbnNlY3V0aXZlIEVQRVJNIGVycm9ycy5cblx0XHRcdFx0XHRcdFx0ZXBlcm1FcnJvcnMrKztcblx0XHRcdFx0XHRcdFx0aWYgKGVwZXJtRXJyb3JzID49IDMpIHtcblx0XHRcdFx0XHRcdFx0XHRvblRlcm1pbmF0ZShgcGFyZW50IHByb2Nlc3MgJHtpbml0RGF0YS5wYXJlbnRQaWR9IGRvZXMgbm90IGV4aXN0IGFueW1vcmUgKDMgeCBFUEVSTSk6ICR7ZS5tZXNzYWdlfSAoY29kZTogJHtlLmNvZGV9KSAoZXJybm86ICR7ZS5lcnJub30pYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG9uVGVybWluYXRlKGBwYXJlbnQgcHJvY2VzcyAke2luaXREYXRhLnBhcmVudFBpZH0gZG9lcyBub3QgZXhpc3QgYW55bW9yZTogJHtlLm1lc3NhZ2V9IChjb2RlOiAke2UuY29kZX0pIChlcnJubzogJHtlLmVycm5vfSlgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDEwMDApO1xuXG5cdFx0XHRcdC8vIEluIGNlcnRhaW4gY2FzZXMsIHRoZSBldmVudCBsb29wIGNhbiBiZWNvbWUgYnVzeSBhbmQgbmV2ZXIgeWllbGRcblx0XHRcdFx0Ly8gZS5nLiB3aGlsZS10cnVlIG9yIHByb2Nlc3MubmV4dFRpY2sgZW5kbGVzcyBsb29wc1xuXHRcdFx0XHQvLyBTbyBhbHNvIHVzZSB0aGUgbmF0aXZlIG5vZGUgbW9kdWxlIHRvIGRvIGl0IGZyb20gYSBzZXBhcmF0ZSB0aHJlYWRcblx0XHRcdFx0bGV0IHdhdGNoZG9nOiB0eXBlb2YgbmF0aXZlV2F0Y2hkb2c7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0d2F0Y2hkb2cgPSByZXF1aXJlKCdAdnNjb2RlL25hdGl2ZS13YXRjaGRvZycpO1xuXHRcdFx0XHRcdHdhdGNoZG9nLnN0YXJ0KGluaXREYXRhLnBhcmVudFBpZCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdC8vIG5vIHByb2JsZW0uLi5cblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRlbGwgdGhlIG91dHNpZGUgdGhhdCB3ZSBhcmUgaW5pdGlhbGl6ZWRcblx0XHRcdHByb3RvY29sLnNlbmQoY3JlYXRlTWVzc2FnZU9mVHlwZShNZXNzYWdlVHlwZS5Jbml0aWFsaXplZCkpO1xuXG5cdFx0XHRjKHsgcHJvdG9jb2wsIGluaXREYXRhIH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVGVsbCB0aGUgb3V0c2lkZSB0aGF0IHdlIGFyZSByZWFkeSB0byByZWNlaXZlIG1lc3NhZ2VzXG5cdFx0cHJvdG9jb2wuc2VuZChjcmVhdGVNZXNzYWdlT2ZUeXBlKE1lc3NhZ2VUeXBlLlJlYWR5KSk7XG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzdGFydEV4dGVuc2lvbkhvc3RQcm9jZXNzKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdC8vIFByaW50IGEgY29uc29sZSBtZXNzYWdlIHdoZW4gcmVqZWN0aW9uIGlzbid0IGhhbmRsZWQgd2l0aGluIE4gc2Vjb25kcy4gRm9yIGRldGFpbHM6XG5cdC8vIHNlZSBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX2V2ZW50X3VuaGFuZGxlZHJlamVjdGlvblxuXHQvLyBhbmQgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19ldmVudF9yZWplY3Rpb25oYW5kbGVkXG5cdGNvbnN0IHVuaGFuZGxlZFByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXHRwcm9jZXNzLm9uKCd1bmhhbmRsZWRSZWplY3Rpb24nLCAocmVhc29uOiBhbnksIHByb21pc2U6IFByb21pc2U8YW55PikgPT4ge1xuXHRcdHVuaGFuZGxlZFByb21pc2VzLnB1c2gocHJvbWlzZSk7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRjb25zdCBpZHggPSB1bmhhbmRsZWRQcm9taXNlcy5pbmRleE9mKHByb21pc2UpO1xuXHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdHByb21pc2UuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdFx0dW5oYW5kbGVkUHJvbWlzZXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oYHJlamVjdGVkIHByb21pc2Ugbm90IGhhbmRsZWQgd2l0aGluIDEgc2Vjb25kOiAke2V9YCk7XG5cdFx0XHRcdFx0XHRpZiAoZSAmJiBlLnN0YWNrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUud2Fybihgc3RhY2sgdHJhY2U6ICR7ZS5zdGFja31gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChyZWFzb24pIHtcblx0XHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IocmVhc29uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sIDEwMDApO1xuXHR9KTtcblxuXHRwcm9jZXNzLm9uKCdyZWplY3Rpb25IYW5kbGVkJywgKHByb21pc2U6IFByb21pc2U8YW55PikgPT4ge1xuXHRcdGNvbnN0IGlkeCA9IHVuaGFuZGxlZFByb21pc2VzLmluZGV4T2YocHJvbWlzZSk7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHR1bmhhbmRsZWRQcm9taXNlcy5zcGxpY2UoaWR4LCAxKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFByaW50IGEgY29uc29sZSBtZXNzYWdlIHdoZW4gYW4gZXhjZXB0aW9uIGlzbid0IGhhbmRsZWQuXG5cdHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZnVuY3Rpb24gKGVycjogRXJyb3IpIHtcblx0XHRpZiAoIWlzU2lnUGlwZUVycm9yKGVycikpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXHR9KTtcblxuXHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2V4dEhvc3Qvd2lsbENvbm5lY3RUb1JlbmRlcmVyYCk7XG5cdGNvbnN0IHByb3RvY29sID0gYXdhaXQgY3JlYXRlRXh0SG9zdFByb3RvY29sKCk7XG5cdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC9kaWRDb25uZWN0VG9SZW5kZXJlcmApO1xuXHRjb25zdCByZW5kZXJlciA9IGF3YWl0IGNvbm5lY3RUb1JlbmRlcmVyKHByb3RvY29sKTtcblx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L2RpZFdhaXRGb3JJbml0RGF0YWApO1xuXHRjb25zdCB7IGluaXREYXRhIH0gPSByZW5kZXJlcjtcblx0Ly8gc2V0dXAgdGhpbmdzXG5cdHBhdGNoUHJvY2VzcyghIWluaXREYXRhLmVudmlyb25tZW50LmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpOyAvLyB0byBzdXBwb3J0IG90aGVyIHRlc3QgZnJhbWV3b3JrcyBsaWtlIEphc21pbiB0aGF0IHVzZSBwcm9jZXNzLmV4aXQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zNzcwOClcblx0aW5pdERhdGEuZW52aXJvbm1lbnQudXNlSG9zdFByb3h5ID0gYXJncy51c2VIb3N0UHJveHkgIT09IHVuZGVmaW5lZCA/IGFyZ3MudXNlSG9zdFByb3h5ICE9PSAnZmFsc2UnIDogdW5kZWZpbmVkO1xuXHRpbml0RGF0YS5lbnZpcm9ubWVudC5za2lwV29ya3NwYWNlU3RvcmFnZUxvY2sgPSBib29sZWFuKGFyZ3Muc2tpcFdvcmtzcGFjZVN0b3JhZ2VMb2NrLCBmYWxzZSk7XG5cblx0Ly8gaG9zdCBhYnN0cmFjdGlvblxuXHRjb25zdCBob3N0VXRpbHMgPSBuZXcgY2xhc3MgTm9kZUhvc3QgaW1wbGVtZW50cyBJSG9zdFV0aWxzIHtcblx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRwdWJsaWMgcmVhZG9ubHkgcGlkID0gcHJvY2Vzcy5waWQ7XG5cdFx0ZXhpdChjb2RlOiBudW1iZXIpIHsgbmF0aXZlRXhpdChjb2RlKTsgfVxuXHRcdGZzRXhpc3RzKHBhdGg6IHN0cmluZykgeyByZXR1cm4gUHJvbWlzZXMuZXhpc3RzKHBhdGgpOyB9XG5cdFx0ZnNSZWFscGF0aChwYXRoOiBzdHJpbmcpIHsgcmV0dXJuIFByb21pc2VzLnJlYWxwYXRoKHBhdGgpOyB9XG5cdH07XG5cblx0Ly8gQXR0ZW1wdCB0byBsb2FkIHVyaSB0cmFuc2Zvcm1lclxuXHRsZXQgdXJpVHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwgPSBudWxsO1xuXHRpZiAoaW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSAmJiBhcmdzLnRyYW5zZm9ybVVSSXMpIHtcblx0XHR1cmlUcmFuc2Zvcm1lciA9IGNyZWF0ZVVSSVRyYW5zZm9ybWVyKGluaXREYXRhLnJlbW90ZS5hdXRob3JpdHkpO1xuXHR9XG5cblx0Y29uc3QgZXh0ZW5zaW9uSG9zdE1haW4gPSBuZXcgRXh0ZW5zaW9uSG9zdE1haW4oXG5cdFx0cmVuZGVyZXIucHJvdG9jb2wsXG5cdFx0aW5pdERhdGEsXG5cdFx0aG9zdFV0aWxzLFxuXHRcdHVyaVRyYW5zZm9ybWVyXG5cdCk7XG5cblx0Ly8gcmV3cml0ZSBvblRlcm1pbmF0ZS1mdW5jdGlvbiB0byBiZSBhIHByb3BlciBzaHV0ZG93blxuXHRvblRlcm1pbmF0ZSA9IChyZWFzb246IHN0cmluZykgPT4gZXh0ZW5zaW9uSG9zdE1haW4udGVybWluYXRlKHJlYXNvbik7XG59XG5cbnN0YXJ0RXh0ZW5zaW9uSG9zdFByb2Nlc3MoKS5jYXRjaCgoZXJyKSA9PiBjb25zb2xlLmxvZyhlcnIpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sY0FBYztBQUVyQixZQUFZLFNBQVM7QUFDckIsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUIscUJBQXFCLGdCQUFnQixtQkFBbUIsaUNBQWlDO0FBQ3pILFNBQVMsYUFBYTtBQUN0QixZQUFZLGlCQUFpQjtBQUU3QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGlCQUFpQixvQkFBb0IseUJBQXlCO0FBQ3ZFLFNBQVMsWUFBWSwyQkFBMkI7QUFFaEQsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sYUFBYTtBQUNwQixTQUFTLHlCQUFrQztBQUUzQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1Qiw2QkFBNkI7QUFDN0QsU0FBUyx1QkFBNEgsYUFBYSxxQkFBcUIsdUJBQXVCO0FBRTlMLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsTUFBTUEsV0FBVSxjQUFjLFlBQVksR0FBRztBQVU3QyxJQUFJLFFBQVEsSUFBSSxZQUFZO0FBQzNCLFFBQU0sbUJBQW1CLFFBQVEsVUFBVSxTQUFTO0FBQ3BELFVBQVEsbUJBQW1CLFNBQVM7QUFDcEMsVUFBUSxHQUFHLFdBQVcsQ0FBQyxZQUFpQjtBQUN2QyxRQUFJLFFBQVEsU0FBUyx5QkFBeUIsUUFBUSxTQUFTLHlCQUF5QixRQUFRLFNBQVMsc0JBQXNCO0FBQzlILGNBQVEsTUFBTSxPQUFPO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLHFCQUFpQixDQUFDLEVBQUUsT0FBTztBQUFBLEVBQzVCLENBQUM7QUFDRjtBQUFBLENBSUMs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
