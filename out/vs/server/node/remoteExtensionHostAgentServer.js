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
import * as fs from "fs";
import * as net from "net";
import { createRequire } from "node:module";
import { performance } from "perf_hooks";
import { VSBuffer } from "../../base/common/buffer.js";
import { CharCode } from "../../base/common/charCode.js";
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from "../../base/common/errors.js";
import { isEqualOrParent } from "../../base/common/extpath.js";
import { Disposable, DisposableMap, DisposableStore } from "../../base/common/lifecycle.js";
import { connectionTokenQueryName, FileAccess, getServerProductSegment, Schemas } from "../../base/common/network.js";
import { dirname, join } from "../../base/common/path.js";
import * as perf from "../../base/common/performance.js";
import * as platform from "../../base/common/platform.js";
import { createRegExp, escapeRegExpCharacters } from "../../base/common/strings.js";
import { URI } from "../../base/common/uri.js";
import { generateUuid } from "../../base/common/uuid.js";
import { getOSReleaseInfo } from "../../base/node/osReleaseInfo.js";
import { findFreePort } from "../../base/node/ports.js";
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from "../../base/node/unc.js";
import { PersistentProtocol } from "../../base/parts/ipc/common/ipc.net.js";
import { NodeSocket, upgradeToISocket, WebSocketNodeSocket } from "../../base/parts/ipc/node/ipc.net.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../platform/log/common/log.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { ConnectionType } from "../../platform/remote/common/remoteAgentConnection.js";
import { ITelemetryService } from "../../platform/telemetry/common/telemetry.js";
import { ExtensionHostConnection } from "./extensionHostConnection.js";
import { ManagementConnection } from "./remoteExtensionManagement.js";
import { determineServerConnectionToken, requestHasValidConnectionToken as httpRequestHasValidConnectionToken, ServerConnectionTokenParseError, ServerConnectionTokenType } from "./serverConnectionToken.js";
import { IServerEnvironmentService } from "./serverEnvironmentService.js";
import { IServerLifetimeService } from "./serverLifetimeService.js";
import { setupServerServices } from "./serverServices.js";
import { CacheControl, serveError, serveFile, WebClientServer } from "./webClientServer.js";
const require2 = createRequire(import.meta.url);
function parseRequestUrl(requestUrl) {
  try {
    return requestUrl.startsWith("/") ? new URL(`http://localhost${requestUrl}`) : new URL(requestUrl);
  } catch {
    return void 0;
  }
}
let RemoteExtensionHostAgentServer = class extends Disposable {
  constructor(_socketServer, _connectionToken, _vsdaMod, hasWebClient, serverBasePath, _environmentService, _productService, _logService, _instantiationService, _serverLifetimeService) {
    super();
    this._socketServer = _socketServer;
    this._connectionToken = _connectionToken;
    this._vsdaMod = _vsdaMod;
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._serverLifetimeService = _serverLifetimeService;
    this._extHostLifetimeTokens = this._register(new DisposableMap());
    this._webEndpointOriginChecker = WebEndpointOriginChecker.create(this._productService);
    if (serverBasePath !== void 0 && serverBasePath.charCodeAt(serverBasePath.length - 1) === CharCode.Slash) {
      serverBasePath = serverBasePath.substring(0, serverBasePath.length - 1);
    }
    this._serverBasePath = serverBasePath;
    this._serverProductPath = `/${getServerProductSegment(_productService)}`;
    this._extHostConnections = /* @__PURE__ */ Object.create(null);
    this._managementConnections = /* @__PURE__ */ Object.create(null);
    this._allReconnectionTokens = /* @__PURE__ */ new Set();
    this._webClientServer = hasWebClient ? this._instantiationService.createInstance(WebClientServer, this._connectionToken, serverBasePath ?? "/", this._serverProductPath) : null;
    this._logService.info(`Extension host agent started.`);
    this._reconnectionGraceTime = this._environmentService.reconnectionGraceTime;
  }
  async handleRequest(req, res) {
    if (req.method !== "GET") {
      return serveError(req, res, 405, `Unsupported method ${req.method}`);
    }
    if (!req.url) {
      return serveError(req, res, 400, `Bad request.`);
    }
    const parsedUrl = parseRequestUrl(req.url);
    if (!parsedUrl) {
      return serveError(req, res, 400, `Bad request.`);
    }
    let pathname = parsedUrl.pathname;
    if (!pathname) {
      return serveError(req, res, 400, `Bad request.`);
    }
    if (this._serverBasePath !== void 0 && pathname.startsWith(this._serverBasePath)) {
      pathname = pathname.substring(this._serverBasePath.length) || "/";
    }
    if (pathname.startsWith(this._serverProductPath) && pathname.charCodeAt(this._serverProductPath.length) === CharCode.Slash) {
      pathname = pathname.substring(this._serverProductPath.length);
    }
    if (pathname === "/version") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return void res.end(this._productService.commit || "");
    }
    if (pathname === "/delay-shutdown") {
      this._serverLifetimeService.delay();
      res.writeHead(200);
      return void res.end("OK");
    }
    if (!httpRequestHasValidConnectionToken(this._connectionToken, req, parsedUrl.searchParams)) {
      return serveError(req, res, 403, `Forbidden.`);
    }
    if (pathname === "/vscode-remote-resource") {
      const desiredPaths = parsedUrl.searchParams.getAll("path");
      if (desiredPaths.length !== 1) {
        return serveError(req, res, 400, `Bad request.`);
      }
      const desiredPath = desiredPaths[0];
      let filePath;
      try {
        filePath = URI.from({ scheme: Schemas.file, path: desiredPath }).fsPath;
      } catch (err) {
        return serveError(req, res, 400, `Bad request.`);
      }
      const responseHeaders = /* @__PURE__ */ Object.create(null);
      if (this._environmentService.isBuilt) {
        if (isEqualOrParent(filePath, this._environmentService.builtinExtensionsPath, !platform.isLinux) || isEqualOrParent(filePath, this._environmentService.extensionsPath, !platform.isLinux)) {
          responseHeaders["Cache-Control"] = "public, max-age=31536000";
        }
      }
      responseHeaders["Vary"] = "Origin";
      const requestOrigin = req.headers["origin"];
      if (requestOrigin && this._webEndpointOriginChecker.matches(requestOrigin)) {
        responseHeaders["Access-Control-Allow-Origin"] = requestOrigin;
      }
      return serveFile(filePath, CacheControl.ETAG, this._logService, req, res, responseHeaders);
    }
    if (this._webClientServer) {
      this._webClientServer.handle(req, res, parsedUrl, pathname);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    return void res.end("Not found");
  }
  handleUpgrade(req, socket) {
    let reconnectionToken = generateUuid();
    let isReconnection = false;
    let skipWebSocketFrames = false;
    if (req.url) {
      const parsedUrl = parseRequestUrl(req.url);
      if (!parsedUrl) {
        this._logService.warn("WebSocket connection rejected: invalid request URL");
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        return;
      }
      const query = parsedUrl.searchParams;
      const reconnectionTokens = query.getAll("reconnectionToken");
      if (reconnectionTokens.length === 1) {
        reconnectionToken = reconnectionTokens[0];
      }
      if (query.getAll("reconnection").length === 1 && query.get("reconnection") === "true") {
        isReconnection = true;
      }
      if (query.getAll("skipWebSocketFrames").length === 1 && query.get("skipWebSocketFrames") === "true") {
        skipWebSocketFrames = true;
      }
    }
    const upgraded = upgradeToISocket(req, socket, {
      debugLabel: `server-connection-${reconnectionToken}`,
      skipWebSocketFrames,
      disableWebSocketCompression: this._environmentService.args["disable-websocket-compression"]
    });
    if (!upgraded) {
      return;
    }
    this._handleWebSocketConnection(upgraded, isReconnection, reconnectionToken);
  }
  handleServerError(err) {
    this._logService.error(`Error occurred in server`);
    this._logService.error(err);
  }
  // Eventually cleanup
  _getRemoteAddress(socket) {
    let _socket;
    if (socket instanceof NodeSocket) {
      _socket = socket.socket;
    } else {
      _socket = socket.socket.socket;
    }
    return _socket.remoteAddress || `<unknown>`;
  }
  async _rejectWebSocketConnection(logPrefix, protocol, reason) {
    const socket = protocol.getSocket();
    this._logService.error(`${logPrefix} ${reason}.`);
    const errMessage = {
      type: "error",
      reason
    };
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(errMessage)));
    protocol.dispose();
    await socket.drain();
    socket.dispose();
  }
  /**
   * NOTE: Avoid using await in this method!
   * The problem is that await introduces a process.nextTick due to the implicit Promise.then
   * This can lead to some bytes being received and interpreted and a control message being emitted before the next listener has a chance to be registered.
   */
  _handleWebSocketConnection(socket, isReconnection, reconnectionToken) {
    const remoteAddress = this._getRemoteAddress(socket);
    const logPrefix = `[${remoteAddress}][${reconnectionToken.substr(0, 8)}]`;
    const protocol = new PersistentProtocol({ socket });
    const validator = this._vsdaMod ? new this._vsdaMod.validator() : null;
    const signer = this._vsdaMod ? new this._vsdaMod.signer() : null;
    let State;
    ((State2) => {
      State2[State2["WaitingForAuth"] = 0] = "WaitingForAuth";
      State2[State2["WaitingForConnectionType"] = 1] = "WaitingForConnectionType";
      State2[State2["Done"] = 2] = "Done";
      State2[State2["Error"] = 3] = "Error";
    })(State || (State = {}));
    let state = 0 /* WaitingForAuth */;
    const rejectWebSocketConnection = (msg) => {
      state = 3 /* Error */;
      listener.dispose();
      this._rejectWebSocketConnection(logPrefix, protocol, msg);
    };
    const listener = protocol.onControlMessage((raw) => {
      if (state === 0 /* WaitingForAuth */) {
        let msg1;
        try {
          msg1 = JSON.parse(raw.toString());
        } catch (err) {
          return rejectWebSocketConnection(`Malformed first message`);
        }
        if (msg1.type !== "auth") {
          return rejectWebSocketConnection(`Invalid first message`);
        }
        if (this._connectionToken.type === ServerConnectionTokenType.Mandatory && !this._connectionToken.validate(msg1.auth)) {
          return rejectWebSocketConnection(`Unauthorized client refused: auth mismatch`);
        }
        let signedData = generateUuid();
        if (signer) {
          try {
            signedData = signer.sign(msg1.data);
          } catch (e) {
          }
        }
        let someText = generateUuid();
        if (validator) {
          try {
            someText = validator.createNewMessage(someText);
          } catch (e) {
          }
        }
        const signRequest = {
          type: "sign",
          data: someText,
          signedData
        };
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(signRequest)));
        state = 1 /* WaitingForConnectionType */;
      } else if (state === 1 /* WaitingForConnectionType */) {
        let msg2;
        try {
          msg2 = JSON.parse(raw.toString());
        } catch (err) {
          return rejectWebSocketConnection(`Malformed second message`);
        }
        if (msg2.type !== "connectionType") {
          return rejectWebSocketConnection(`Invalid second message`);
        }
        if (typeof msg2.signedData !== "string") {
          return rejectWebSocketConnection(`Invalid second message field type`);
        }
        const rendererCommit = msg2.commit;
        const myCommit = this._productService.commit;
        if (rendererCommit && myCommit) {
          if (rendererCommit !== myCommit) {
            return rejectWebSocketConnection(`Client refused: version mismatch`);
          }
        }
        let valid = false;
        if (!validator) {
          valid = true;
        } else if (this._connectionToken.validate(msg2.signedData)) {
          valid = true;
        } else {
          try {
            valid = validator.validate(msg2.signedData) === "ok";
          } catch (e) {
          }
        }
        if (!valid) {
          if (this._environmentService.isBuilt) {
            return rejectWebSocketConnection(`Unauthorized client refused`);
          } else {
            this._logService.error(`${logPrefix} Unauthorized client handshake failed but we proceed because of dev mode.`);
          }
        }
        for (const key in this._managementConnections) {
          const managementConnection = this._managementConnections[key];
          managementConnection.shortenReconnectionGraceTimeIfNecessary();
        }
        for (const key in this._extHostConnections) {
          const extHostConnection = this._extHostConnections[key];
          extHostConnection.shortenReconnectionGraceTimeIfNecessary();
        }
        state = 2 /* Done */;
        listener.dispose();
        this._handleConnectionType(remoteAddress, logPrefix, protocol, socket, isReconnection, reconnectionToken, msg2);
      }
    });
  }
  async _handleConnectionType(remoteAddress, _logPrefix, protocol, socket, isReconnection, reconnectionToken, msg) {
    const logPrefix = msg.desiredConnectionType === ConnectionType.Management ? `${_logPrefix}[ManagementConnection]` : msg.desiredConnectionType === ConnectionType.ExtensionHost ? `${_logPrefix}[ExtensionHostConnection]` : _logPrefix;
    if (msg.desiredConnectionType === ConnectionType.Management) {
      if (socket instanceof WebSocketNodeSocket) {
        socket.setRecordInflateBytes(false);
      }
      if (isReconnection) {
        if (!this._managementConnections[reconnectionToken]) {
          if (!this._allReconnectionTokens.has(reconnectionToken)) {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (never seen)`);
          } else {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (seen before)`);
          }
        }
        protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: "ok" })));
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        this._managementConnections[reconnectionToken].acceptReconnection(remoteAddress, socket, dataChunk);
      } else {
        if (this._managementConnections[reconnectionToken]) {
          return this._rejectWebSocketConnection(logPrefix, protocol, `Duplicate reconnection token`);
        }
        protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: "ok" })));
        const con = new ManagementConnection(this._logService, reconnectionToken, remoteAddress, protocol, this._reconnectionGraceTime);
        this._socketServer.acceptConnection(con.protocol, con.onClose);
        this._managementConnections[reconnectionToken] = con;
        this._allReconnectionTokens.add(reconnectionToken);
        con.onClose(() => {
          delete this._managementConnections[reconnectionToken];
        });
      }
    } else if (msg.desiredConnectionType === ConnectionType.ExtensionHost) {
      const startParams0 = msg.args || { language: "en" };
      const startParams = await this._updateWithFreeDebugPort(startParams0);
      if (startParams.port) {
        this._logService.trace(`${logPrefix} - startParams debug port ${startParams.port}`);
      }
      this._logService.trace(`${logPrefix} - startParams language: ${startParams.language}`);
      this._logService.trace(`${logPrefix} - startParams env: ${JSON.stringify(startParams.env)}`);
      if (isReconnection) {
        if (!this._extHostConnections[reconnectionToken]) {
          if (!this._allReconnectionTokens.has(reconnectionToken)) {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (never seen)`);
          } else {
            return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown reconnection token (seen before)`);
          }
        }
        protocol.sendPause();
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        this._extHostConnections[reconnectionToken].acceptReconnection(remoteAddress, socket, dataChunk);
      } else {
        if (this._extHostConnections[reconnectionToken]) {
          return this._rejectWebSocketConnection(logPrefix, protocol, `Duplicate reconnection token`);
        }
        protocol.sendPause();
        protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
        const dataChunk = protocol.readEntireBuffer();
        protocol.dispose();
        const con = this._instantiationService.createInstance(ExtensionHostConnection, reconnectionToken, remoteAddress, socket, dataChunk);
        this._extHostConnections[reconnectionToken] = con;
        this._allReconnectionTokens.add(reconnectionToken);
        this._extHostLifetimeTokens.set(reconnectionToken, this._serverLifetimeService.active(`ExtensionHost:${reconnectionToken.substring(0, 8)}`));
        con.onClose(() => {
          con.dispose();
          delete this._extHostConnections[reconnectionToken];
          this._extHostLifetimeTokens.deleteAndDispose(reconnectionToken);
        });
        con.start(startParams).catch((error) => {
          this._logService.error(`${logPrefix} Failed to start extension host connection:`, error);
        });
      }
    } else if (msg.desiredConnectionType === ConnectionType.Tunnel) {
      if (socket instanceof WebSocketNodeSocket) {
        socket.setRecordInflateBytes(false);
      }
      const tunnelStartParams = msg.args;
      this._createTunnel(protocol, tunnelStartParams);
    } else {
      return this._rejectWebSocketConnection(logPrefix, protocol, `Unknown initial data received`);
    }
  }
  async _createTunnel(protocol, tunnelStartParams) {
    let localSocket;
    try {
      localSocket = await this._connectTunnelSocket(tunnelStartParams.host, tunnelStartParams.port);
    } catch (err) {
      this._logService.error(`[remote-connection] Failed to connect tunnel to ${tunnelStartParams.host}:${tunnelStartParams.port}:`, err);
      const reason = err instanceof Error ? err.message : String(err);
      const errorMessage = { type: "error", reason };
      protocol.sendControl(VSBuffer.fromString(JSON.stringify(errorMessage)));
      const socket = protocol.getSocket();
      protocol.dispose();
      await socket.drain();
      socket.dispose();
      return;
    }
    const okMessage = { type: "ok" };
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(okMessage)));
    const remoteNodeSocket = protocol.getSocket();
    const remoteSocket = remoteNodeSocket.socket;
    const dataChunk = protocol.readEntireBuffer();
    protocol.dispose();
    remoteNodeSocket.dispose(false);
    if (dataChunk.byteLength > 0) {
      localSocket.write(dataChunk.buffer);
    }
    localSocket.on("end", () => remoteSocket.end());
    localSocket.on("close", () => remoteSocket.end());
    localSocket.on("error", () => remoteSocket.destroy());
    remoteSocket.on("end", () => localSocket.end());
    remoteSocket.on("close", () => localSocket.end());
    remoteSocket.on("error", () => localSocket.destroy());
    localSocket.pipe(remoteSocket);
    remoteSocket.pipe(localSocket);
  }
  _connectTunnelSocket(host, port) {
    return new Promise((c, e) => {
      const socket = net.createConnection(
        {
          host,
          port,
          autoSelectFamily: true
        },
        () => {
          socket.removeListener("error", e);
          socket.pause();
          c(socket);
        }
      );
      socket.once("error", e);
    });
  }
  _updateWithFreeDebugPort(startParams) {
    if (typeof startParams.port === "number") {
      return findFreePort(
        startParams.port,
        10,
        5e3
        /* try up to 5 seconds */
      ).then((freePort) => {
        startParams.port = freePort;
        return startParams;
      });
    }
    startParams.debugId = void 0;
    startParams.port = void 0;
    startParams.break = void 0;
    return Promise.resolve(startParams);
  }
};
RemoteExtensionHostAgentServer = __decorateClass([
  __decorateParam(5, IServerEnvironmentService),
  __decorateParam(6, IProductService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IServerLifetimeService)
], RemoteExtensionHostAgentServer);
async function createServer(address, args, REMOTE_DATA_FOLDER) {
  const connectionToken = await determineServerConnectionToken(args);
  if (connectionToken instanceof ServerConnectionTokenParseError) {
    console.warn(connectionToken.message);
    process.exit(1);
  }
  function initUnexpectedErrorHandler(handler) {
    setUnexpectedErrorHandler((err) => {
      if (isSigPipeError(err) && err.stack && /unexpectedErrorHandler/.test(err.stack)) {
        return;
      }
      handler(err);
    });
  }
  const unloggedErrors = [];
  initUnexpectedErrorHandler((error) => {
    unloggedErrors.push(error);
    console.error(error);
  });
  let didLogAboutSIGPIPE = false;
  process.on("SIGPIPE", () => {
    if (!didLogAboutSIGPIPE) {
      didLogAboutSIGPIPE = true;
      onUnexpectedError(new Error(`Unexpected SIGPIPE`));
    }
  });
  const disposables = new DisposableStore();
  const { socketServer, instantiationService } = await setupServerServices(connectionToken, args, REMOTE_DATA_FOLDER, disposables);
  instantiationService.invokeFunction((accessor) => {
    const logService = accessor.get(ILogService);
    unloggedErrors.forEach((error) => logService.error(error));
    unloggedErrors.length = 0;
    initUnexpectedErrorHandler((error) => logService.error(error));
  });
  instantiationService.invokeFunction((accessor) => {
    const configurationService = accessor.get(IConfigurationService);
    if (platform.isWindows) {
      if (configurationService.getValue("security.restrictUNCAccess") === false) {
        disableUNCAccessRestrictions();
      } else {
        addUNCHostToAllowlist(configurationService.getValue("security.allowedUNCHosts"));
      }
    }
  });
  instantiationService.invokeFunction((accessor) => {
    const logService = accessor.get(ILogService);
    if (platform.isWindows && process.env.HOMEDRIVE && process.env.HOMEPATH) {
      const homeDirModulesPath = join(process.env.HOMEDRIVE, "node_modules");
      const userDir = dirname(join(process.env.HOMEDRIVE, process.env.HOMEPATH));
      const userDirModulesPath = join(userDir, "node_modules");
      if (fs.existsSync(homeDirModulesPath) || fs.existsSync(userDirModulesPath)) {
        const message = `

*
* !!!! Server terminated due to presence of CVE-2020-1416 !!!!
*
* Please remove the following directories and re-try
* ${homeDirModulesPath}
* ${userDirModulesPath}
*
* For more information on the vulnerability https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2020-1416
*

`;
        logService.warn(message);
        console.warn(message);
        process.exit(0);
      }
    }
  });
  const vsdaMod = instantiationService.invokeFunction((accessor) => {
    const logService = accessor.get(ILogService);
    const hasVSDA = fs.existsSync(join(FileAccess.asFileUri("").fsPath, "../node_modules/vsda"));
    if (hasVSDA) {
      try {
        return require2("vsda");
      } catch (err) {
        logService.error(err);
      }
    }
    return null;
  });
  let serverBasePath = args["server-base-path"];
  if (serverBasePath && !serverBasePath.startsWith("/")) {
    serverBasePath = `/${serverBasePath}`;
  }
  const hasWebClient = fs.existsSync(FileAccess.asFileUri(`vs/code/browser/workbench/workbench.html`).fsPath);
  if (hasWebClient && address && typeof address !== "string") {
    const queryPart = connectionToken.type !== ServerConnectionTokenType.None ? `?${connectionTokenQueryName}=${connectionToken.value}` : "";
    console.log(`Web UI available at http://localhost${address.port === 80 ? "" : `:${address.port}`}${serverBasePath ?? ""}${queryPart}`);
  }
  const remoteExtensionHostAgentServer = instantiationService.createInstance(RemoteExtensionHostAgentServer, socketServer, connectionToken, vsdaMod, hasWebClient, serverBasePath);
  perf.mark("code/server/ready");
  const currentTime = performance.now();
  const vscodeServerStartTime = global.vscodeServerStartTime;
  const vscodeServerListenTime = global.vscodeServerListenTime;
  const vscodeServerCodeLoadedTime = global.vscodeServerCodeLoadedTime;
  instantiationService.invokeFunction(async (accessor) => {
    const telemetryService = accessor.get(ITelemetryService);
    telemetryService.publicLog2("serverStart", {
      startTime: vscodeServerStartTime,
      startedTime: vscodeServerListenTime,
      codeLoadedTime: vscodeServerCodeLoadedTime,
      readyTime: currentTime
    });
    if (platform.isLinux) {
      const logService = accessor.get(ILogService);
      const releaseInfo = await getOSReleaseInfo(logService.error.bind(logService));
      if (releaseInfo) {
        telemetryService.publicLog2("serverPlatformInfo", {
          platformId: releaseInfo.id,
          platformVersionId: releaseInfo.version_id,
          platformIdLike: releaseInfo.id_like
        });
      }
    }
  });
  if (args["print-startup-performance"]) {
    let output = "";
    output += `Start-up time: ${vscodeServerListenTime - vscodeServerStartTime}
`;
    output += `Code loading time: ${vscodeServerCodeLoadedTime - vscodeServerStartTime}
`;
    output += `Initialized time: ${currentTime - vscodeServerStartTime}
`;
    output += `
`;
    console.log(output);
  }
  return remoteExtensionHostAgentServer;
}
class WebEndpointOriginChecker {
  constructor(_originRegExp) {
    this._originRegExp = _originRegExp;
  }
  static create(productService) {
    const webEndpointUrlTemplate = productService.webEndpointUrlTemplate;
    const commit = productService.commit;
    const quality = productService.quality;
    if (!webEndpointUrlTemplate || !commit || !quality) {
      return new WebEndpointOriginChecker(null);
    }
    const uuid = generateUuid();
    const exampleUrl = new URL(
      webEndpointUrlTemplate.replace("{{uuid}}", uuid).replace("{{commit}}", commit).replace("{{quality}}", quality)
    );
    const exampleOrigin = exampleUrl.origin;
    const originRegExpSource = escapeRegExpCharacters(exampleOrigin).replace(uuid, "[a-zA-Z0-9\\-]+");
    try {
      const originRegExp = createRegExp(`^${originRegExpSource}$`, true, { matchCase: false });
      return new WebEndpointOriginChecker(originRegExp);
    } catch (err) {
      return new WebEndpointOriginChecker(null);
    }
  }
  matches(origin) {
    if (!this._originRegExp) {
      return false;
    }
    return this._originRegExp.test(origin);
  }
}
export {
  createServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXG5vZGVcXHJlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ25vZGU6bW9kdWxlJztcbmltcG9ydCB7IHBlcmZvcm1hbmNlIH0gZnJvbSAncGVyZl9ob29rcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IGlzU2lnUGlwZUVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25uZWN0aW9uVG9rZW5RdWVyeU5hbWUsIEZpbGVBY2Nlc3MsIGdldFNlcnZlclByb2R1Y3RTZWdtZW50LCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmIGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlZ0V4cCwgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZ2V0T1NSZWxlYXNlSW5mbyB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS9vc1JlbGVhc2VJbmZvLmpzJztcbmltcG9ydCB7IGZpbmRGcmVlUG9ydCB9IGZyb20gJy4uLy4uL2Jhc2Uvbm9kZS9wb3J0cy5qcyc7XG5pbXBvcnQgeyBhZGRVTkNIb3N0VG9BbGxvd2xpc3QsIGRpc2FibGVVTkNBY2Nlc3NSZXN0cmljdGlvbnMgfSBmcm9tICcuLi8uLi9iYXNlL25vZGUvdW5jLmpzJztcbmltcG9ydCB7IFBlcnNpc3RlbnRQcm90b2NvbCB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IE5vZGVTb2NrZXQsIHVwZ3JhZGVUb0lTb2NrZXQsIFdlYlNvY2tldE5vZGVTb2NrZXQgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29ubmVjdGlvblR5cGUsIENvbm5lY3Rpb25UeXBlUmVxdWVzdCwgRXJyb3JNZXNzYWdlLCBIYW5kc2hha2VNZXNzYWdlLCBJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zLCBJVHVubmVsQ29ubmVjdGlvblN0YXJ0UGFyYW1zLCBPS01lc3NhZ2UsIFNpZ25SZXF1ZXN0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RDb25uZWN0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VtZW50Q29ubmVjdGlvbiB9IGZyb20gJy4vcmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBkZXRlcm1pbmVTZXJ2ZXJDb25uZWN0aW9uVG9rZW4sIHJlcXVlc3RIYXNWYWxpZENvbm5lY3Rpb25Ub2tlbiBhcyBodHRwUmVxdWVzdEhhc1ZhbGlkQ29ubmVjdGlvblRva2VuLCBTZXJ2ZXJDb25uZWN0aW9uVG9rZW4sIFNlcnZlckNvbm5lY3Rpb25Ub2tlblBhcnNlRXJyb3IsIFNlcnZlckNvbm5lY3Rpb25Ub2tlblR5cGUgfSBmcm9tICcuL3NlcnZlckNvbm5lY3Rpb25Ub2tlbi5qcyc7XG5pbXBvcnQgeyBJU2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlLCBTZXJ2ZXJQYXJzZWRBcmdzIH0gZnJvbSAnLi9zZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlcnZlckxpZmV0aW1lU2VydmljZSB9IGZyb20gJy4vc2VydmVyTGlmZXRpbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNldHVwU2VydmVyU2VydmljZXMsIFNvY2tldFNlcnZlciB9IGZyb20gJy4vc2VydmVyU2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2FjaGVDb250cm9sLCBzZXJ2ZUVycm9yLCBzZXJ2ZUZpbGUsIFdlYkNsaWVudFNlcnZlciB9IGZyb20gJy4vd2ViQ2xpZW50U2VydmVyLmpzJztcbmNvbnN0IHJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7XG5cbmZ1bmN0aW9uIHBhcnNlUmVxdWVzdFVybChyZXF1ZXN0VXJsOiBzdHJpbmcpOiBVUkwgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdHJldHVybiByZXF1ZXN0VXJsLnN0YXJ0c1dpdGgoJy8nKVxuXHRcdFx0PyBuZXcgVVJMKGBodHRwOi8vbG9jYWxob3N0JHtyZXF1ZXN0VXJsfWApXG5cdFx0XHQ6IG5ldyBVUkwocmVxdWVzdFVybCk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZGVjbGFyZSBuYW1lc3BhY2UgdnNkYSB7XG5cdC8vIHRoZSBzaWduZXIgaXMgYSBuYXRpdmUgbW9kdWxlIHRoYXQgZm9yIGhpc3RvcmljYWwgcmVhc29ucyB1c2VzIGEgbG93ZXIgY2FzZSBjbGFzcyBuYW1lXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0ZXhwb3J0IGNsYXNzIHNpZ25lciB7XG5cdFx0c2lnbihhcmc6IHN0cmluZyk6IHN0cmluZztcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0ZXhwb3J0IGNsYXNzIHZhbGlkYXRvciB7XG5cdFx0Y3JlYXRlTmV3TWVzc2FnZShhcmc6IHN0cmluZyk6IHN0cmluZztcblx0XHR2YWxpZGF0ZShhcmc6IHN0cmluZyk6ICdvaycgfCAnZXJyb3InO1xuXHR9XG59XG5cbmNsYXNzIFJlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VydmVyQVBJIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29ubmVjdGlvbnM6IHsgW3JlY29ubmVjdGlvblRva2VuOiBzdHJpbmddOiBFeHRlbnNpb25Ib3N0Q29ubmVjdGlvbiB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYW5hZ2VtZW50Q29ubmVjdGlvbnM6IHsgW3JlY29ubmVjdGlvblRva2VuOiBzdHJpbmddOiBNYW5hZ2VtZW50Q29ubmVjdGlvbiB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxSZWNvbm5lY3Rpb25Ub2tlbnM6IFNldDxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0TGlmZXRpbWVUb2tlbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93ZWJDbGllbnRTZXJ2ZXI6IFdlYkNsaWVudFNlcnZlciB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dlYkVuZHBvaW50T3JpZ2luQ2hlY2tlcjogV2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3Rpb25HcmFjZVRpbWU6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJCYXNlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJQcm9kdWN0UGF0aDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldFNlcnZlcjogU29ja2V0U2VydmVyPFJlbW90ZUFnZW50Q29ubmVjdGlvbkNvbnRleHQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25Ub2tlbjogU2VydmVyQ29ubmVjdGlvblRva2VuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZzZGFNb2Q6IHR5cGVvZiB2c2RhIHwgbnVsbCxcblx0XHRoYXNXZWJDbGllbnQ6IGJvb2xlYW4sXG5cdFx0c2VydmVyQmFzZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVNlcnZlckVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXJ2ZXJMaWZldGltZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VydmVyTGlmZXRpbWVTZXJ2aWNlOiBJU2VydmVyTGlmZXRpbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dlYkVuZHBvaW50T3JpZ2luQ2hlY2tlciA9IFdlYkVuZHBvaW50T3JpZ2luQ2hlY2tlci5jcmVhdGUodGhpcy5fcHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0aWYgKHNlcnZlckJhc2VQYXRoICE9PSB1bmRlZmluZWQgJiYgc2VydmVyQmFzZVBhdGguY2hhckNvZGVBdChzZXJ2ZXJCYXNlUGF0aC5sZW5ndGggLSAxKSA9PT0gQ2hhckNvZGUuU2xhc2gpIHtcblx0XHRcdC8vIFJlbW92ZSB0cmFpbGluZyBzbGFzaCBmcm9tIGJhc2UgcGF0aFxuXHRcdFx0c2VydmVyQmFzZVBhdGggPSBzZXJ2ZXJCYXNlUGF0aC5zdWJzdHJpbmcoMCwgc2VydmVyQmFzZVBhdGgubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NlcnZlckJhc2VQYXRoID0gc2VydmVyQmFzZVBhdGg7IC8vIHVuZGVmaW5lZCBvciBzdGFydHMgd2l0aCBhIHNsYXNoXG5cdFx0dGhpcy5fc2VydmVyUHJvZHVjdFBhdGggPSBgLyR7Z2V0U2VydmVyUHJvZHVjdFNlZ21lbnQoX3Byb2R1Y3RTZXJ2aWNlKX1gOyAvLyBzdGFydHMgd2l0aCBhIHNsYXNoXG5cdFx0dGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX2FsbFJlY29ubmVjdGlvblRva2VucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX3dlYkNsaWVudFNlcnZlciA9IChcblx0XHRcdGhhc1dlYkNsaWVudFxuXHRcdFx0XHQ/IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdlYkNsaWVudFNlcnZlciwgdGhpcy5fY29ubmVjdGlvblRva2VuLCBzZXJ2ZXJCYXNlUGF0aCA/PyAnLycsIHRoaXMuX3NlcnZlclByb2R1Y3RQYXRoKVxuXHRcdFx0XHQ6IG51bGxcblx0XHQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uIGhvc3QgYWdlbnQgc3RhcnRlZC5gKTtcblx0XHR0aGlzLl9yZWNvbm5lY3Rpb25HcmFjZVRpbWUgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVjb25uZWN0aW9uR3JhY2VUaW1lO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZVJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSBzZXJ2ZSBHRVQgcmVxdWVzdHNcblx0XHRpZiAocmVxLm1ldGhvZCAhPT0gJ0dFVCcpIHtcblx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDUsIGBVbnN1cHBvcnRlZCBtZXRob2QgJHtyZXEubWV0aG9kfWApO1xuXHRcdH1cblxuXHRcdGlmICghcmVxLnVybCkge1xuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZFVybCA9IHBhcnNlUmVxdWVzdFVybChyZXEudXJsKTtcblx0XHRpZiAoIXBhcnNlZFVybCkge1xuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdH1cblx0XHRsZXQgcGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG5cblx0XHRpZiAoIXBhdGhuYW1lKSB7XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgNDAwLCBgQmFkIHJlcXVlc3QuYCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2VydmUgZnJvbSBib3RoICcvJyBhbmQgc2VydmVyQmFzZVBhdGhcblx0XHRpZiAodGhpcy5fc2VydmVyQmFzZVBhdGggIT09IHVuZGVmaW5lZCAmJiBwYXRobmFtZS5zdGFydHNXaXRoKHRoaXMuX3NlcnZlckJhc2VQYXRoKSkge1xuXHRcdFx0cGF0aG5hbWUgPSBwYXRobmFtZS5zdWJzdHJpbmcodGhpcy5fc2VydmVyQmFzZVBhdGgubGVuZ3RoKSB8fCAnLyc7XG5cdFx0fVxuXHRcdC8vIGZvciBub3cgYWNjZXB0IGFsbCBwYXRocywgd2l0aCBvciB3aXRob3V0IHNlcnZlciBwcm9kdWN0IHBhdGhcblx0XHRpZiAocGF0aG5hbWUuc3RhcnRzV2l0aCh0aGlzLl9zZXJ2ZXJQcm9kdWN0UGF0aCkgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCh0aGlzLl9zZXJ2ZXJQcm9kdWN0UGF0aC5sZW5ndGgpID09PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0cGF0aG5hbWUgPSBwYXRobmFtZS5zdWJzdHJpbmcodGhpcy5fc2VydmVyUHJvZHVjdFBhdGgubGVuZ3RoKTtcblx0XHR9XG5cblx0XHQvLyBWZXJzaW9uXG5cdFx0aWYgKHBhdGhuYW1lID09PSAnL3ZlcnNpb24nKSB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCh0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQgfHwgJycpO1xuXHRcdH1cblxuXHRcdC8vIERlbGF5IHNodXRkb3duXG5cdFx0aWYgKHBhdGhuYW1lID09PSAnL2RlbGF5LXNodXRkb3duJykge1xuXHRcdFx0dGhpcy5fc2VydmVyTGlmZXRpbWVTZXJ2aWNlLmRlbGF5KCk7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCk7XG5cdFx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKCdPSycpO1xuXHRcdH1cblxuXHRcdGlmICghaHR0cFJlcXVlc3RIYXNWYWxpZENvbm5lY3Rpb25Ub2tlbih0aGlzLl9jb25uZWN0aW9uVG9rZW4sIHJlcSwgcGFyc2VkVXJsLnNlYXJjaFBhcmFtcykpIHtcblx0XHRcdC8vIGludmFsaWQgY29ubmVjdGlvbiB0b2tlblxuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMywgYEZvcmJpZGRlbi5gKTtcblx0XHR9XG5cblx0XHRpZiAocGF0aG5hbWUgPT09ICcvdnNjb2RlLXJlbW90ZS1yZXNvdXJjZScpIHtcblx0XHRcdC8vIEhhbmRsZSBIVFRQIHJlcXVlc3RzIGZvciByZXNvdXJjZXMgcmVuZGVyZWQgaW4gdGhlIHJpY2ggY2xpZW50IChpbWFnZXMsIGZvbnRzLCBldGMuKVxuXHRcdFx0Ly8gVGhlc2UgcmVzb3VyY2VzIGNvdWxkIGJlIGZpbGVzIHNoaXBwZWQgd2l0aCBleHRlbnNpb25zIG9yIGV2ZW4gd29ya3NwYWNlIGZpbGVzLlxuXHRcdFx0Y29uc3QgZGVzaXJlZFBhdGhzID0gcGFyc2VkVXJsLnNlYXJjaFBhcmFtcy5nZXRBbGwoJ3BhdGgnKTtcblx0XHRcdGlmIChkZXNpcmVkUGF0aHMubGVuZ3RoICE9PSAxKSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDAsIGBCYWQgcmVxdWVzdC5gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlc2lyZWRQYXRoID0gZGVzaXJlZFBhdGhzWzBdO1xuXG5cdFx0XHRsZXQgZmlsZVBhdGg6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZpbGVQYXRoID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogZGVzaXJlZFBhdGggfSkuZnNQYXRoO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDAsIGBCYWQgcmVxdWVzdC5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VIZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KGZpbGVQYXRoLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYnVpbHRpbkV4dGVuc2lvbnNQYXRoLCAhcGxhdGZvcm0uaXNMaW51eClcblx0XHRcdFx0XHR8fCBpc0VxdWFsT3JQYXJlbnQoZmlsZVBhdGgsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25zUGF0aCwgIXBsYXRmb3JtLmlzTGludXgpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJlc3BvbnNlSGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ3B1YmxpYywgbWF4LWFnZT0zMTUzNjAwMCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQWxsb3cgY3Jvc3Mgb3JpZ2luIHJlcXVlc3RzIGZyb20gdGhlIHdlYiB3b3JrZXIgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdHJlc3BvbnNlSGVhZGVyc1snVmFyeSddID0gJ09yaWdpbic7XG5cdFx0XHRjb25zdCByZXF1ZXN0T3JpZ2luID0gcmVxLmhlYWRlcnNbJ29yaWdpbiddO1xuXHRcdFx0aWYgKHJlcXVlc3RPcmlnaW4gJiYgdGhpcy5fd2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyLm1hdGNoZXMocmVxdWVzdE9yaWdpbikpIHtcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzWydBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nXSA9IHJlcXVlc3RPcmlnaW47XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc2VydmVGaWxlKGZpbGVQYXRoLCBDYWNoZUNvbnRyb2wuRVRBRywgdGhpcy5fbG9nU2VydmljZSwgcmVxLCByZXMsIHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0fVxuXG5cdFx0Ly8gd29ya2JlbmNoIHdlYiBVSVxuXHRcdGlmICh0aGlzLl93ZWJDbGllbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMuX3dlYkNsaWVudFNlcnZlci5oYW5kbGUocmVxLCByZXMsIHBhcnNlZFVybCwgcGF0aG5hbWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcy53cml0ZUhlYWQoNDA0LCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCgnTm90IGZvdW5kJyk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlVXBncmFkZShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBzb2NrZXQ6IG5ldC5Tb2NrZXQpIHtcblx0XHRsZXQgcmVjb25uZWN0aW9uVG9rZW4gPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRsZXQgaXNSZWNvbm5lY3Rpb24gPSBmYWxzZTtcblx0XHRsZXQgc2tpcFdlYlNvY2tldEZyYW1lcyA9IGZhbHNlO1xuXG5cdFx0aWYgKHJlcS51cmwpIHtcblx0XHRcdGNvbnN0IHBhcnNlZFVybCA9IHBhcnNlUmVxdWVzdFVybChyZXEudXJsKTtcblx0XHRcdGlmICghcGFyc2VkVXJsKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignV2ViU29ja2V0IGNvbm5lY3Rpb24gcmVqZWN0ZWQ6IGludmFsaWQgcmVxdWVzdCBVUkwnKTtcblx0XHRcdFx0c29ja2V0LmVuZCgnSFRUUC8xLjEgNDAwIEJhZCBSZXF1ZXN0XFxyXFxuQ29ubmVjdGlvbjogY2xvc2VcXHJcXG5cXHJcXG4nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcXVlcnkgPSBwYXJzZWRVcmwuc2VhcmNoUGFyYW1zO1xuXHRcdFx0Y29uc3QgcmVjb25uZWN0aW9uVG9rZW5zID0gcXVlcnkuZ2V0QWxsKCdyZWNvbm5lY3Rpb25Ub2tlbicpO1xuXHRcdFx0aWYgKHJlY29ubmVjdGlvblRva2Vucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW4gPSByZWNvbm5lY3Rpb25Ub2tlbnNbMF07XG5cdFx0XHR9XG5cdFx0XHRpZiAocXVlcnkuZ2V0QWxsKCdyZWNvbm5lY3Rpb24nKS5sZW5ndGggPT09IDEgJiYgcXVlcnkuZ2V0KCdyZWNvbm5lY3Rpb24nKSA9PT0gJ3RydWUnKSB7XG5cdFx0XHRcdGlzUmVjb25uZWN0aW9uID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChxdWVyeS5nZXRBbGwoJ3NraXBXZWJTb2NrZXRGcmFtZXMnKS5sZW5ndGggPT09IDEgJiYgcXVlcnkuZ2V0KCdza2lwV2ViU29ja2V0RnJhbWVzJykgPT09ICd0cnVlJykge1xuXHRcdFx0XHRza2lwV2ViU29ja2V0RnJhbWVzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB1cGdyYWRlZCA9IHVwZ3JhZGVUb0lTb2NrZXQocmVxLCBzb2NrZXQsIHtcblx0XHRcdGRlYnVnTGFiZWw6IGBzZXJ2ZXItY29ubmVjdGlvbi0ke3JlY29ubmVjdGlvblRva2VufWAsXG5cdFx0XHRza2lwV2ViU29ja2V0RnJhbWVzLFxuXHRcdFx0ZGlzYWJsZVdlYlNvY2tldENvbXByZXNzaW9uOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZGlzYWJsZS13ZWJzb2NrZXQtY29tcHJlc3Npb24nXVxuXHRcdH0pO1xuXG5cdFx0aWYgKCF1cGdyYWRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhbmRsZVdlYlNvY2tldENvbm5lY3Rpb24odXBncmFkZWQsIGlzUmVjb25uZWN0aW9uLCByZWNvbm5lY3Rpb25Ub2tlbik7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlU2VydmVyRXJyb3IoZXJyOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIG9jY3VycmVkIGluIHNlcnZlcmApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0fVxuXG5cdC8vIEV2ZW50dWFsbHkgY2xlYW51cFxuXG5cdHByaXZhdGUgX2dldFJlbW90ZUFkZHJlc3Moc29ja2V0OiBOb2RlU29ja2V0IHwgV2ViU29ja2V0Tm9kZVNvY2tldCk6IHN0cmluZyB7XG5cdFx0bGV0IF9zb2NrZXQ6IG5ldC5Tb2NrZXQ7XG5cdFx0aWYgKHNvY2tldCBpbnN0YW5jZW9mIE5vZGVTb2NrZXQpIHtcblx0XHRcdF9zb2NrZXQgPSBzb2NrZXQuc29ja2V0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRfc29ja2V0ID0gc29ja2V0LnNvY2tldC5zb2NrZXQ7XG5cdFx0fVxuXHRcdHJldHVybiBfc29ja2V0LnJlbW90ZUFkZHJlc3MgfHwgYDx1bmtub3duPmA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeDogc3RyaW5nLCBwcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sLCByZWFzb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNvY2tldCA9IHByb3RvY29sLmdldFNvY2tldCgpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSAke3JlYXNvbn0uYCk7XG5cdFx0Y29uc3QgZXJyTWVzc2FnZTogRXJyb3JNZXNzYWdlID0ge1xuXHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdHJlYXNvbjogcmVhc29uXG5cdFx0fTtcblx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGVyck1lc3NhZ2UpKSk7XG5cdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHNvY2tldC5kcmFpbigpO1xuXHRcdHNvY2tldC5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogTk9URTogQXZvaWQgdXNpbmcgYXdhaXQgaW4gdGhpcyBtZXRob2QhXG5cdCAqIFRoZSBwcm9ibGVtIGlzIHRoYXQgYXdhaXQgaW50cm9kdWNlcyBhIHByb2Nlc3MubmV4dFRpY2sgZHVlIHRvIHRoZSBpbXBsaWNpdCBQcm9taXNlLnRoZW5cblx0ICogVGhpcyBjYW4gbGVhZCB0byBzb21lIGJ5dGVzIGJlaW5nIHJlY2VpdmVkIGFuZCBpbnRlcnByZXRlZCBhbmQgYSBjb250cm9sIG1lc3NhZ2UgYmVpbmcgZW1pdHRlZCBiZWZvcmUgdGhlIG5leHQgbGlzdGVuZXIgaGFzIGEgY2hhbmNlIHRvIGJlIHJlZ2lzdGVyZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVXZWJTb2NrZXRDb25uZWN0aW9uKHNvY2tldDogTm9kZVNvY2tldCB8IFdlYlNvY2tldE5vZGVTb2NrZXQsIGlzUmVjb25uZWN0aW9uOiBib29sZWFuLCByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVtb3RlQWRkcmVzcyA9IHRoaXMuX2dldFJlbW90ZUFkZHJlc3Moc29ja2V0KTtcblx0XHRjb25zdCBsb2dQcmVmaXggPSBgWyR7cmVtb3RlQWRkcmVzc31dWyR7cmVjb25uZWN0aW9uVG9rZW4uc3Vic3RyKDAsIDgpfV1gO1xuXHRcdGNvbnN0IHByb3RvY29sID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldCB9KTtcblxuXHRcdGNvbnN0IHZhbGlkYXRvciA9IHRoaXMuX3ZzZGFNb2QgPyBuZXcgdGhpcy5fdnNkYU1vZC52YWxpZGF0b3IoKSA6IG51bGw7XG5cdFx0Y29uc3Qgc2lnbmVyID0gdGhpcy5fdnNkYU1vZCA/IG5ldyB0aGlzLl92c2RhTW9kLnNpZ25lcigpIDogbnVsbDtcblxuXHRcdGNvbnN0IGVudW0gU3RhdGUge1xuXHRcdFx0V2FpdGluZ0ZvckF1dGgsXG5cdFx0XHRXYWl0aW5nRm9yQ29ubmVjdGlvblR5cGUsXG5cdFx0XHREb25lLFxuXHRcdFx0RXJyb3Jcblx0XHR9XG5cdFx0bGV0IHN0YXRlID0gU3RhdGUuV2FpdGluZ0ZvckF1dGg7XG5cblx0XHRjb25zdCByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uID0gKG1zZzogc3RyaW5nKSA9PiB7XG5cdFx0XHRzdGF0ZSA9IFN0YXRlLkVycm9yO1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcmVqZWN0V2ViU29ja2V0Q29ubmVjdGlvbihsb2dQcmVmaXgsIHByb3RvY29sLCBtc2cpO1xuXHRcdH07XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHByb3RvY29sLm9uQ29udHJvbE1lc3NhZ2UoKHJhdykgPT4ge1xuXHRcdFx0aWYgKHN0YXRlID09PSBTdGF0ZS5XYWl0aW5nRm9yQXV0aCkge1xuXHRcdFx0XHRsZXQgbXNnMTogSGFuZHNoYWtlTWVzc2FnZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRtc2cxID0gPEhhbmRzaGFrZU1lc3NhZ2U+SlNPTi5wYXJzZShyYXcudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJldHVybiByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGBNYWxmb3JtZWQgZmlyc3QgbWVzc2FnZWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtc2cxLnR5cGUgIT09ICdhdXRoJykge1xuXHRcdFx0XHRcdHJldHVybiByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGBJbnZhbGlkIGZpcnN0IG1lc3NhZ2VgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9jb25uZWN0aW9uVG9rZW4udHlwZSA9PT0gU2VydmVyQ29ubmVjdGlvblRva2VuVHlwZS5NYW5kYXRvcnkgJiYgIXRoaXMuX2Nvbm5lY3Rpb25Ub2tlbi52YWxpZGF0ZShtc2cxLmF1dGgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYFVuYXV0aG9yaXplZCBjbGllbnQgcmVmdXNlZDogYXV0aCBtaXNtYXRjaGApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2VuZCBgc2lnbmAgcmVxdWVzdFxuXHRcdFx0XHRsZXQgc2lnbmVkRGF0YSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0XHRpZiAoc2lnbmVyKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHNpZ25lZERhdGEgPSBzaWduZXIuc2lnbihtc2cxLmRhdGEpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IHNvbWVUZXh0ID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdGlmICh2YWxpZGF0b3IpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0c29tZVRleHQgPSB2YWxpZGF0b3IuY3JlYXRlTmV3TWVzc2FnZShzb21lVGV4dCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzaWduUmVxdWVzdDogU2lnblJlcXVlc3QgPSB7XG5cdFx0XHRcdFx0dHlwZTogJ3NpZ24nLFxuXHRcdFx0XHRcdGRhdGE6IHNvbWVUZXh0LFxuXHRcdFx0XHRcdHNpZ25lZERhdGE6IHNpZ25lZERhdGFcblx0XHRcdFx0fTtcblx0XHRcdFx0cHJvdG9jb2wuc2VuZENvbnRyb2woVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShzaWduUmVxdWVzdCkpKTtcblxuXHRcdFx0XHRzdGF0ZSA9IFN0YXRlLldhaXRpbmdGb3JDb25uZWN0aW9uVHlwZTtcblxuXHRcdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gU3RhdGUuV2FpdGluZ0ZvckNvbm5lY3Rpb25UeXBlKSB7XG5cblx0XHRcdFx0bGV0IG1zZzI6IEhhbmRzaGFrZU1lc3NhZ2U7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bXNnMiA9IDxIYW5kc2hha2VNZXNzYWdlPkpTT04ucGFyc2UocmF3LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0V2ViU29ja2V0Q29ubmVjdGlvbihgTWFsZm9ybWVkIHNlY29uZCBtZXNzYWdlYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1zZzIudHlwZSAhPT0gJ2Nvbm5lY3Rpb25UeXBlJykge1xuXHRcdFx0XHRcdHJldHVybiByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGBJbnZhbGlkIHNlY29uZCBtZXNzYWdlYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBtc2cyLnNpZ25lZERhdGEgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdFdlYlNvY2tldENvbm5lY3Rpb24oYEludmFsaWQgc2Vjb25kIG1lc3NhZ2UgZmllbGQgdHlwZWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVuZGVyZXJDb21taXQgPSBtc2cyLmNvbW1pdDtcblx0XHRcdFx0Y29uc3QgbXlDb21taXQgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5jb21taXQ7XG5cdFx0XHRcdGlmIChyZW5kZXJlckNvbW1pdCAmJiBteUNvbW1pdCkge1xuXHRcdFx0XHRcdC8vIFJ1bm5pbmcgaW4gdGhlIGJ1aWx0IHZlcnNpb24gd2hlcmUgY29tbWl0cyBhcmUgZGVmaW5lZFxuXHRcdFx0XHRcdGlmIChyZW5kZXJlckNvbW1pdCAhPT0gbXlDb21taXQpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGBDbGllbnQgcmVmdXNlZDogdmVyc2lvbiBtaXNtYXRjaGApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCB2YWxpZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoIXZhbGlkYXRvcikge1xuXHRcdFx0XHRcdHZhbGlkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jb25uZWN0aW9uVG9rZW4udmFsaWRhdGUobXNnMi5zaWduZWREYXRhKSkge1xuXHRcdFx0XHRcdC8vIHdlYiBjbGllbnRcblx0XHRcdFx0XHR2YWxpZCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHZhbGlkID0gdmFsaWRhdG9yLnZhbGlkYXRlKG1zZzIuc2lnbmVkRGF0YSkgPT09ICdvayc7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdmFsaWQpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGBVbmF1dGhvcml6ZWQgY2xpZW50IHJlZnVzZWRgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IFVuYXV0aG9yaXplZCBjbGllbnQgaGFuZHNoYWtlIGZhaWxlZCBidXQgd2UgcHJvY2VlZCBiZWNhdXNlIG9mIGRldiBtb2RlLmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdlIGhhdmUgcmVjZWl2ZWQgYSBuZXcgY29ubmVjdGlvbi5cblx0XHRcdFx0Ly8gVGhpcyBpbmRpY2F0ZXMgdGhhdCB0aGUgc2VydmVyIG93bmVyIGhhcyBjb25uZWN0aXZpdHkuXG5cdFx0XHRcdC8vIFRoZXJlZm9yZSB3ZSB3aWxsIHNob3J0ZW4gdGhlIHJlY29ubmVjdGlvbiBncmFjZSBwZXJpb2QgZm9yIGRpc2Nvbm5lY3RlZCBjb25uZWN0aW9ucyFcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gdGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWFuYWdlbWVudENvbm5lY3Rpb24gPSB0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbnNba2V5XTtcblx0XHRcdFx0XHRtYW5hZ2VtZW50Q29ubmVjdGlvbi5zaG9ydGVuUmVjb25uZWN0aW9uR3JhY2VUaW1lSWZOZWNlc3NhcnkoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiB0aGlzLl9leHRIb3N0Q29ubmVjdGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBleHRIb3N0Q29ubmVjdGlvbiA9IHRoaXMuX2V4dEhvc3RDb25uZWN0aW9uc1trZXldO1xuXHRcdFx0XHRcdGV4dEhvc3RDb25uZWN0aW9uLnNob3J0ZW5SZWNvbm5lY3Rpb25HcmFjZVRpbWVJZk5lY2Vzc2FyeSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3RhdGUgPSBTdGF0ZS5Eb25lO1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUNvbm5lY3Rpb25UeXBlKHJlbW90ZUFkZHJlc3MsIGxvZ1ByZWZpeCwgcHJvdG9jb2wsIHNvY2tldCwgaXNSZWNvbm5lY3Rpb24sIHJlY29ubmVjdGlvblRva2VuLCBtc2cyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNvbm5lY3Rpb25UeXBlKHJlbW90ZUFkZHJlc3M6IHN0cmluZywgX2xvZ1ByZWZpeDogc3RyaW5nLCBwcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sLCBzb2NrZXQ6IE5vZGVTb2NrZXQgfCBXZWJTb2NrZXROb2RlU29ja2V0LCBpc1JlY29ubmVjdGlvbjogYm9vbGVhbiwgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZywgbXNnOiBDb25uZWN0aW9uVHlwZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsb2dQcmVmaXggPSAoXG5cdFx0XHRtc2cuZGVzaXJlZENvbm5lY3Rpb25UeXBlID09PSBDb25uZWN0aW9uVHlwZS5NYW5hZ2VtZW50XG5cdFx0XHRcdD8gYCR7X2xvZ1ByZWZpeH1bTWFuYWdlbWVudENvbm5lY3Rpb25dYFxuXHRcdFx0XHQ6IG1zZy5kZXNpcmVkQ29ubmVjdGlvblR5cGUgPT09IENvbm5lY3Rpb25UeXBlLkV4dGVuc2lvbkhvc3Rcblx0XHRcdFx0XHQ/IGAke19sb2dQcmVmaXh9W0V4dGVuc2lvbkhvc3RDb25uZWN0aW9uXWBcblx0XHRcdFx0XHQ6IF9sb2dQcmVmaXhcblx0XHQpO1xuXG5cdFx0aWYgKG1zZy5kZXNpcmVkQ29ubmVjdGlvblR5cGUgPT09IENvbm5lY3Rpb25UeXBlLk1hbmFnZW1lbnQpIHtcblx0XHRcdC8vIFRoaXMgc2hvdWxkIGJlY29tZSBhIG1hbmFnZW1lbnQgY29ubmVjdGlvblxuXHRcdFx0aWYgKHNvY2tldCBpbnN0YW5jZW9mIFdlYlNvY2tldE5vZGVTb2NrZXQpIHtcblx0XHRcdFx0c29ja2V0LnNldFJlY29yZEluZmxhdGVCeXRlcyhmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1JlY29ubmVjdGlvbikge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGEgcmVjb25uZWN0aW9uXG5cdFx0XHRcdGlmICghdGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXSkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fYWxsUmVjb25uZWN0aW9uVG9rZW5zLmhhcyhyZWNvbm5lY3Rpb25Ub2tlbikpIHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgaXMgYW4gdW5rbm93biByZWNvbm5lY3Rpb24gdG9rZW5cblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeCwgcHJvdG9jb2wsIGBVbmtub3duIHJlY29ubmVjdGlvbiB0b2tlbiAobmV2ZXIgc2VlbilgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBhIGNvbm5lY3Rpb24gdGhhdCB3YXMgc2VlbiBpbiB0aGUgcGFzdCwgYnV0IGlzIG5vIGxvbmdlciB2YWxpZFxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYFVua25vd24gcmVjb25uZWN0aW9uIHRva2VuIChzZWVuIGJlZm9yZSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ29rJyB9KSkpO1xuXHRcdFx0XHRjb25zdCBkYXRhQ2h1bmsgPSBwcm90b2NvbC5yZWFkRW50aXJlQnVmZmVyKCk7XG5cdFx0XHRcdHByb3RvY29sLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXS5hY2NlcHRSZWNvbm5lY3Rpb24ocmVtb3RlQWRkcmVzcywgc29ja2V0LCBkYXRhQ2h1bmspO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGEgZnJlc2ggY29ubmVjdGlvblxuXHRcdFx0XHRpZiAodGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXSkge1xuXHRcdFx0XHRcdC8vIENhbm5vdCBoYXZlIHR3byBjb25jdXJyZW50IGNvbm5lY3Rpb25zIHVzaW5nIHRoZSBzYW1lIHJlY29ubmVjdGlvbiB0b2tlblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeCwgcHJvdG9jb2wsIGBEdXBsaWNhdGUgcmVjb25uZWN0aW9uIHRva2VuYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ29rJyB9KSkpO1xuXHRcdFx0XHRjb25zdCBjb24gPSBuZXcgTWFuYWdlbWVudENvbm5lY3Rpb24odGhpcy5fbG9nU2VydmljZSwgcmVjb25uZWN0aW9uVG9rZW4sIHJlbW90ZUFkZHJlc3MsIHByb3RvY29sLCB0aGlzLl9yZWNvbm5lY3Rpb25HcmFjZVRpbWUpO1xuXHRcdFx0XHR0aGlzLl9zb2NrZXRTZXJ2ZXIuYWNjZXB0Q29ubmVjdGlvbihjb24ucHJvdG9jb2wsIGNvbi5vbkNsb3NlKTtcblx0XHRcdFx0dGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXSA9IGNvbjtcblx0XHRcdFx0dGhpcy5fYWxsUmVjb25uZWN0aW9uVG9rZW5zLmFkZChyZWNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0XHRcdGNvbi5vbkNsb3NlKCgpID0+IHtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAobXNnLmRlc2lyZWRDb25uZWN0aW9uVHlwZSA9PT0gQ29ubmVjdGlvblR5cGUuRXh0ZW5zaW9uSG9zdCkge1xuXG5cdFx0XHQvLyBUaGlzIHNob3VsZCBiZWNvbWUgYW4gZXh0ZW5zaW9uIGhvc3QgY29ubmVjdGlvblxuXHRcdFx0Y29uc3Qgc3RhcnRQYXJhbXMwID0gPElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXM+bXNnLmFyZ3MgfHwgeyBsYW5ndWFnZTogJ2VuJyB9O1xuXHRcdFx0Y29uc3Qgc3RhcnRQYXJhbXMgPSBhd2FpdCB0aGlzLl91cGRhdGVXaXRoRnJlZURlYnVnUG9ydChzdGFydFBhcmFtczApO1xuXG5cdFx0XHRpZiAoc3RhcnRQYXJhbXMucG9ydCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gLSBzdGFydFBhcmFtcyBkZWJ1ZyBwb3J0ICR7c3RhcnRQYXJhbXMucG9ydH1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSAtIHN0YXJ0UGFyYW1zIGxhbmd1YWdlOiAke3N0YXJ0UGFyYW1zLmxhbmd1YWdlfWApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IC0gc3RhcnRQYXJhbXMgZW52OiAke0pTT04uc3RyaW5naWZ5KHN0YXJ0UGFyYW1zLmVudil9YCk7XG5cblx0XHRcdGlmIChpc1JlY29ubmVjdGlvbikge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGEgcmVjb25uZWN0aW9uXG5cdFx0XHRcdGlmICghdGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXSkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fYWxsUmVjb25uZWN0aW9uVG9rZW5zLmhhcyhyZWNvbm5lY3Rpb25Ub2tlbikpIHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgaXMgYW4gdW5rbm93biByZWNvbm5lY3Rpb24gdG9rZW5cblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeCwgcHJvdG9jb2wsIGBVbmtub3duIHJlY29ubmVjdGlvbiB0b2tlbiAobmV2ZXIgc2VlbilgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBhIGNvbm5lY3Rpb24gdGhhdCB3YXMgc2VlbiBpbiB0aGUgcGFzdCwgYnV0IGlzIG5vIGxvbmdlciB2YWxpZFxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlamVjdFdlYlNvY2tldENvbm5lY3Rpb24obG9nUHJlZml4LCBwcm90b2NvbCwgYFVua25vd24gcmVjb25uZWN0aW9uIHRva2VuIChzZWVuIGJlZm9yZSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm90b2NvbC5zZW5kUGF1c2UoKTtcblx0XHRcdFx0cHJvdG9jb2wuc2VuZENvbnRyb2woVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShzdGFydFBhcmFtcy5wb3J0ID8geyBkZWJ1Z1BvcnQ6IHN0YXJ0UGFyYW1zLnBvcnQgfSA6IHt9KSkpO1xuXHRcdFx0XHRjb25zdCBkYXRhQ2h1bmsgPSBwcm90b2NvbC5yZWFkRW50aXJlQnVmZmVyKCk7XG5cdFx0XHRcdHByb3RvY29sLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXS5hY2NlcHRSZWNvbm5lY3Rpb24ocmVtb3RlQWRkcmVzcywgc29ja2V0LCBkYXRhQ2h1bmspO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGEgZnJlc2ggY29ubmVjdGlvblxuXHRcdFx0XHRpZiAodGhpcy5fZXh0SG9zdENvbm5lY3Rpb25zW3JlY29ubmVjdGlvblRva2VuXSkge1xuXHRcdFx0XHRcdC8vIENhbm5vdCBoYXZlIHR3byBjb25jdXJyZW50IGNvbm5lY3Rpb25zIHVzaW5nIHRoZSBzYW1lIHJlY29ubmVjdGlvbiB0b2tlblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeCwgcHJvdG9jb2wsIGBEdXBsaWNhdGUgcmVjb25uZWN0aW9uIHRva2VuYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm90b2NvbC5zZW5kUGF1c2UoKTtcblx0XHRcdFx0cHJvdG9jb2wuc2VuZENvbnRyb2woVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShzdGFydFBhcmFtcy5wb3J0ID8geyBkZWJ1Z1BvcnQ6IHN0YXJ0UGFyYW1zLnBvcnQgfSA6IHt9KSkpO1xuXHRcdFx0XHRjb25zdCBkYXRhQ2h1bmsgPSBwcm90b2NvbC5yZWFkRW50aXJlQnVmZmVyKCk7XG5cdFx0XHRcdHByb3RvY29sLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29uc3QgY29uID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSG9zdENvbm5lY3Rpb24sIHJlY29ubmVjdGlvblRva2VuLCByZW1vdGVBZGRyZXNzLCBzb2NrZXQsIGRhdGFDaHVuayk7XG5cdFx0XHRcdHRoaXMuX2V4dEhvc3RDb25uZWN0aW9uc1tyZWNvbm5lY3Rpb25Ub2tlbl0gPSBjb247XG5cdFx0XHRcdHRoaXMuX2FsbFJlY29ubmVjdGlvblRva2Vucy5hZGQocmVjb25uZWN0aW9uVG9rZW4pO1xuXHRcdFx0XHR0aGlzLl9leHRIb3N0TGlmZXRpbWVUb2tlbnMuc2V0KHJlY29ubmVjdGlvblRva2VuLCB0aGlzLl9zZXJ2ZXJMaWZldGltZVNlcnZpY2UuYWN0aXZlKGBFeHRlbnNpb25Ib3N0OiR7cmVjb25uZWN0aW9uVG9rZW4uc3Vic3RyaW5nKDAsIDgpfWApKTtcblx0XHRcdFx0Y29uLm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX2V4dEhvc3RDb25uZWN0aW9uc1tyZWNvbm5lY3Rpb25Ub2tlbl07XG5cdFx0XHRcdFx0dGhpcy5fZXh0SG9zdExpZmV0aW1lVG9rZW5zLmRlbGV0ZUFuZERpc3Bvc2UocmVjb25uZWN0aW9uVG9rZW4pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uLnN0YXJ0KHN0YXJ0UGFyYW1zKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IEZhaWxlZCB0byBzdGFydCBleHRlbnNpb24gaG9zdCBjb25uZWN0aW9uOmAsIGVycm9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKG1zZy5kZXNpcmVkQ29ubmVjdGlvblR5cGUgPT09IENvbm5lY3Rpb25UeXBlLlR1bm5lbCkge1xuXHRcdFx0aWYgKHNvY2tldCBpbnN0YW5jZW9mIFdlYlNvY2tldE5vZGVTb2NrZXQpIHtcblx0XHRcdFx0c29ja2V0LnNldFJlY29yZEluZmxhdGVCeXRlcyhmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHR1bm5lbFN0YXJ0UGFyYW1zID0gPElUdW5uZWxDb25uZWN0aW9uU3RhcnRQYXJhbXM+bXNnLmFyZ3M7XG5cdFx0XHR0aGlzLl9jcmVhdGVUdW5uZWwocHJvdG9jb2wsIHR1bm5lbFN0YXJ0UGFyYW1zKTtcblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdHJldHVybiB0aGlzLl9yZWplY3RXZWJTb2NrZXRDb25uZWN0aW9uKGxvZ1ByZWZpeCwgcHJvdG9jb2wsIGBVbmtub3duIGluaXRpYWwgZGF0YSByZWNlaXZlZGApO1xuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlVHVubmVsKHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wsIHR1bm5lbFN0YXJ0UGFyYW1zOiBJVHVubmVsQ29ubmVjdGlvblN0YXJ0UGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGxvY2FsU29ja2V0OiBuZXQuU29ja2V0O1xuXHRcdHRyeSB7XG5cdFx0XHRsb2NhbFNvY2tldCA9IGF3YWl0IHRoaXMuX2Nvbm5lY3RUdW5uZWxTb2NrZXQodHVubmVsU3RhcnRQYXJhbXMuaG9zdCwgdHVubmVsU3RhcnRQYXJhbXMucG9ydCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbcmVtb3RlLWNvbm5lY3Rpb25dIEZhaWxlZCB0byBjb25uZWN0IHR1bm5lbCB0byAke3R1bm5lbFN0YXJ0UGFyYW1zLmhvc3R9OiR7dHVubmVsU3RhcnRQYXJhbXMucG9ydH06YCwgZXJyKTtcblx0XHRcdGNvbnN0IHJlYXNvbiA9IChlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpO1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlOiBFcnJvck1lc3NhZ2UgPSB7IHR5cGU6ICdlcnJvcicsIHJlYXNvbiB9O1xuXHRcdFx0cHJvdG9jb2wuc2VuZENvbnRyb2woVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShlcnJvck1lc3NhZ2UpKSk7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBwcm90b2NvbC5nZXRTb2NrZXQoKTtcblx0XHRcdHByb3RvY29sLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHNvY2tldC5kcmFpbigpO1xuXHRcdFx0c29ja2V0LmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBva01lc3NhZ2U6IE9LTWVzc2FnZSA9IHsgdHlwZTogJ29rJyB9O1xuXHRcdHByb3RvY29sLnNlbmRDb250cm9sKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkob2tNZXNzYWdlKSkpO1xuXG5cdFx0Y29uc3QgcmVtb3RlTm9kZVNvY2tldCA9IDxOb2RlU29ja2V0PnByb3RvY29sLmdldFNvY2tldCgpO1xuXHRcdGNvbnN0IHJlbW90ZVNvY2tldCA9IHJlbW90ZU5vZGVTb2NrZXQuc29ja2V0O1xuXHRcdGNvbnN0IGRhdGFDaHVuayA9IHByb3RvY29sLnJlYWRFbnRpcmVCdWZmZXIoKTtcblx0XHRwcm90b2NvbC5kaXNwb3NlKCk7XG5cdFx0cmVtb3RlTm9kZVNvY2tldC5kaXNwb3NlKGZhbHNlKTsgLy8gYGZhbHNlYCBwcmV2ZW50cyB0aGUgdW5kZXJseWluZyBzb2NrZXQgZnJvbSBiZWluZyBjbG9zZWRcblxuXHRcdGlmIChkYXRhQ2h1bmsuYnl0ZUxlbmd0aCA+IDApIHtcblx0XHRcdGxvY2FsU29ja2V0LndyaXRlKGRhdGFDaHVuay5idWZmZXIpO1xuXHRcdH1cblxuXHRcdGxvY2FsU29ja2V0Lm9uKCdlbmQnLCAoKSA9PiByZW1vdGVTb2NrZXQuZW5kKCkpO1xuXHRcdGxvY2FsU29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHJlbW90ZVNvY2tldC5lbmQoKSk7XG5cdFx0bG9jYWxTb2NrZXQub24oJ2Vycm9yJywgKCkgPT4gcmVtb3RlU29ja2V0LmRlc3Ryb3koKSk7XG5cdFx0cmVtb3RlU29ja2V0Lm9uKCdlbmQnLCAoKSA9PiBsb2NhbFNvY2tldC5lbmQoKSk7XG5cdFx0cmVtb3RlU29ja2V0Lm9uKCdjbG9zZScsICgpID0+IGxvY2FsU29ja2V0LmVuZCgpKTtcblx0XHRyZW1vdGVTb2NrZXQub24oJ2Vycm9yJywgKCkgPT4gbG9jYWxTb2NrZXQuZGVzdHJveSgpKTtcblxuXHRcdGxvY2FsU29ja2V0LnBpcGUocmVtb3RlU29ja2V0KTtcblx0XHRyZW1vdGVTb2NrZXQucGlwZShsb2NhbFNvY2tldCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25uZWN0VHVubmVsU29ja2V0KGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKTogUHJvbWlzZTxuZXQuU29ja2V0PiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPG5ldC5Tb2NrZXQ+KChjLCBlKSA9PiB7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGhvc3Q6IGhvc3QsXG5cdFx0XHRcdFx0cG9ydDogcG9ydCxcblx0XHRcdFx0XHRhdXRvU2VsZWN0RmFtaWx5OiB0cnVlXG5cdFx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0XHRzb2NrZXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgZSk7XG5cdFx0XHRcdFx0c29ja2V0LnBhdXNlKCk7XG5cdFx0XHRcdFx0Yyhzb2NrZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVdpdGhGcmVlRGVidWdQb3J0KHN0YXJ0UGFyYW1zOiBJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zKTogVGhlbmFibGU8SVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcz4ge1xuXHRcdGlmICh0eXBlb2Ygc3RhcnRQYXJhbXMucG9ydCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBmaW5kRnJlZVBvcnQoc3RhcnRQYXJhbXMucG9ydCwgMTAgLyogdHJ5IDEwIHBvcnRzICovLCA1MDAwIC8qIHRyeSB1cCB0byA1IHNlY29uZHMgKi8pLnRoZW4oZnJlZVBvcnQgPT4ge1xuXHRcdFx0XHRzdGFydFBhcmFtcy5wb3J0ID0gZnJlZVBvcnQ7XG5cdFx0XHRcdHJldHVybiBzdGFydFBhcmFtcztcblx0XHRcdH0pO1xuXHRcdH1cblx0XHQvLyBObyBwb3J0IGNsZWFyIGRlYnVnIGNvbmZpZ3VyYXRpb24uXG5cdFx0c3RhcnRQYXJhbXMuZGVidWdJZCA9IHVuZGVmaW5lZDtcblx0XHRzdGFydFBhcmFtcy5wb3J0ID0gdW5kZWZpbmVkO1xuXHRcdHN0YXJ0UGFyYW1zLmJyZWFrID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc3RhcnRQYXJhbXMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcnZlckFQSSB7XG5cdC8qKlxuXHQgKiBEbyBub3QgcmVtb3ZlISEuIENhbGxlZCBmcm9tIHNlcnZlci1tYWluLmpzXG5cdCAqL1xuXHRoYW5kbGVSZXF1ZXN0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IFByb21pc2U8dm9pZD47XG5cdC8qKlxuXHQgKiBEbyBub3QgcmVtb3ZlISEuIENhbGxlZCBmcm9tIHNlcnZlci1tYWluLmpzXG5cdCAqL1xuXHRoYW5kbGVVcGdyYWRlKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHNvY2tldDogbmV0LlNvY2tldCk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBEbyBub3QgcmVtb3ZlISEuIENhbGxlZCBmcm9tIHNlcnZlci1tYWluLmpzXG5cdCAqL1xuXHRoYW5kbGVTZXJ2ZXJFcnJvcihlcnI6IEVycm9yKTogdm9pZDtcblx0LyoqXG5cdCAqIERvIG5vdCByZW1vdmUhIS4gQ2FsbGVkIGZyb20gc2VydmVyLW1haW4uanNcblx0ICovXG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNlcnZlcihhZGRyZXNzOiBzdHJpbmcgfCBuZXQuQWRkcmVzc0luZm8gfCBudWxsLCBhcmdzOiBTZXJ2ZXJQYXJzZWRBcmdzLCBSRU1PVEVfREFUQV9GT0xERVI6IHN0cmluZyk6IFByb21pc2U8SVNlcnZlckFQST4ge1xuXG5cdGNvbnN0IGNvbm5lY3Rpb25Ub2tlbiA9IGF3YWl0IGRldGVybWluZVNlcnZlckNvbm5lY3Rpb25Ub2tlbihhcmdzKTtcblx0aWYgKGNvbm5lY3Rpb25Ub2tlbiBpbnN0YW5jZW9mIFNlcnZlckNvbm5lY3Rpb25Ub2tlblBhcnNlRXJyb3IpIHtcblx0XHRjb25zb2xlLndhcm4oY29ubmVjdGlvblRva2VuLm1lc3NhZ2UpO1xuXHRcdHByb2Nlc3MuZXhpdCgxKTtcblx0fVxuXG5cdC8vIHNldHRpbmcgdXAgZXJyb3IgaGFuZGxlcnMsIGZpcnN0IHdpdGggY29uc29sZS5lcnJvciwgdGhlbiwgb25jZSBhdmFpbGFibGUsIHVzaW5nIHRoZSBsb2cgc2VydmljZVxuXG5cdGZ1bmN0aW9uIGluaXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGhhbmRsZXI6IChlcnI6IGFueSkgPT4gdm9pZCkge1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoZXJyID0+IHtcblx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS1yZW1vdGUtcmVsZWFzZS9pc3N1ZXMvNjQ4MVxuXHRcdFx0Ly8gSW4gc29tZSBjaXJjdW1zdGFuY2VzLCBjb25zb2xlLmVycm9yIHdpbGwgdGhyb3cgYW4gYXN5bmNocm9ub3VzIGVycm9yLiBUaGlzIGFzeW5jaHJvbm91cyBlcnJvclxuXHRcdFx0Ly8gd2lsbCBlbmQgdXAgaGVyZSwgYW5kIHRoZW4gaXQgd2lsbCBiZSBsb2dnZWQgYWdhaW4sIHRodXMgY3JlYXRpbmcgYW4gZW5kbGVzcyBhc3luY2hyb25vdXMgbG9vcC5cblx0XHRcdC8vIEhlcmUgd2UgdHJ5IHRvIGJyZWFrIHRoZSBsb29wIGJ5IGlnbm9yaW5nIEVQSVBFIGVycm9ycyB0aGF0IGluY2x1ZGUgb3VyIG93biB1bmV4cGVjdGVkIGVycm9yIGhhbmRsZXIgaW4gdGhlIHN0YWNrLlxuXHRcdFx0aWYgKGlzU2lnUGlwZUVycm9yKGVycikgJiYgZXJyLnN0YWNrICYmIC91bmV4cGVjdGVkRXJyb3JIYW5kbGVyLy50ZXN0KGVyci5zdGFjaykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aGFuZGxlcihlcnIpO1xuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgdW5sb2dnZWRFcnJvcnM6IGFueVtdID0gW107XG5cdGluaXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKChlcnJvcjogYW55KSA9PiB7XG5cdFx0dW5sb2dnZWRFcnJvcnMucHVzaChlcnJvcik7XG5cdFx0Y29uc29sZS5lcnJvcihlcnJvcik7XG5cdH0pO1xuXHRsZXQgZGlkTG9nQWJvdXRTSUdQSVBFID0gZmFsc2U7XG5cdHByb2Nlc3Mub24oJ1NJR1BJUEUnLCAoKSA9PiB7XG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXJlbW90ZS1yZWxlYXNlL2lzc3Vlcy82NTQzXG5cdFx0Ly8gV2Ugd291bGQgbm9ybWFsbHkgaW5zdGFsbCBhIFNJR1BJUEUgbGlzdGVuZXIgaW4gYm9vdHN0cmFwLW5vZGUuanNcblx0XHQvLyBCdXQgaW4gY2VydGFpbiBzaXR1YXRpb25zLCB0aGUgY29uc29sZSBpdHNlbGYgY2FuIGJlIGluIGEgYnJva2VuIHBpcGUgc3RhdGVcblx0XHQvLyBzbyBsb2dnaW5nIFNJR1BJUEUgdG8gdGhlIGNvbnNvbGUgd2lsbCBjYXVzZSBhbiBpbmZpbml0ZSBhc3luYyBsb29wXG5cdFx0aWYgKCFkaWRMb2dBYm91dFNJR1BJUEUpIHtcblx0XHRcdGRpZExvZ0Fib3V0U0lHUElQRSA9IHRydWU7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgU0lHUElQRWApKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCB7IHNvY2tldFNlcnZlciwgaW5zdGFudGlhdGlvblNlcnZpY2UgfSA9IGF3YWl0IHNldHVwU2VydmVyU2VydmljZXMoY29ubmVjdGlvblRva2VuLCBhcmdzLCBSRU1PVEVfREFUQV9GT0xERVIsIGRpc3Bvc2FibGVzKTtcblxuXHQvLyBTZXQgdGhlIHVuZXhwZWN0ZWQgZXJyb3IgaGFuZGxlciBhZnRlciB0aGUgc2VydmljZXMgaGF2ZSBiZWVuIGluaXRpYWxpemVkLCB0byBhdm9pZCBoYXZpbmdcblx0Ly8gdGhlIHRlbGVtZXRyeSBzZXJ2aWNlIG92ZXJ3cml0ZSBvdXIgaGFuZGxlclxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHR1bmxvZ2dlZEVycm9ycy5mb3JFYWNoKGVycm9yID0+IGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHR1bmxvZ2dlZEVycm9ycy5sZW5ndGggPSAwO1xuXG5cdFx0aW5pdFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKGVycm9yOiBhbnkpID0+IGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0fSk7XG5cblx0Ly8gT24gV2luZG93cywgY29uZmlndXJlIHRoZSBVTkMgYWxsb3cgbGlzdCBiYXNlZCBvbiBzZXR0aW5nc1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdzZWN1cml0eS5yZXN0cmljdFVOQ0FjY2VzcycpID09PSBmYWxzZSkge1xuXHRcdFx0XHRkaXNhYmxlVU5DQWNjZXNzUmVzdHJpY3Rpb25zKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhZGRVTkNIb3N0VG9BbGxvd2xpc3QoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3NlY3VyaXR5LmFsbG93ZWRVTkNIb3N0cycpKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdC8vXG5cdC8vIE9uIFdpbmRvd3MsIGV4aXQgZWFybHkgd2l0aCB3YXJuaW5nIG1lc3NhZ2UgdG8gdXNlcnMgYWJvdXQgcG90ZW50aWFsIHNlY3VyaXR5IGlzc3VlXG5cdC8vIGlmIHRoZXJlIGlzIG5vZGVfbW9kdWxlcyBmb2xkZXIgdW5kZXIgaG9tZSBkcml2ZSBvciBVc2VycyBmb2xkZXIuXG5cdC8vXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cyAmJiBwcm9jZXNzLmVudi5IT01FRFJJVkUgJiYgcHJvY2Vzcy5lbnYuSE9NRVBBVEgpIHtcblx0XHRcdGNvbnN0IGhvbWVEaXJNb2R1bGVzUGF0aCA9IGpvaW4ocHJvY2Vzcy5lbnYuSE9NRURSSVZFLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0XHRjb25zdCB1c2VyRGlyID0gZGlybmFtZShqb2luKHByb2Nlc3MuZW52LkhPTUVEUklWRSwgcHJvY2Vzcy5lbnYuSE9NRVBBVEgpKTtcblx0XHRcdGNvbnN0IHVzZXJEaXJNb2R1bGVzUGF0aCA9IGpvaW4odXNlckRpciwgJ25vZGVfbW9kdWxlcycpO1xuXHRcdFx0aWYgKGZzLmV4aXN0c1N5bmMoaG9tZURpck1vZHVsZXNQYXRoKSB8fCBmcy5leGlzdHNTeW5jKHVzZXJEaXJNb2R1bGVzUGF0aCkpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBcblxuKlxuKiAhISEhIFNlcnZlciB0ZXJtaW5hdGVkIGR1ZSB0byBwcmVzZW5jZSBvZiBDVkUtMjAyMC0xNDE2ICEhISFcbipcbiogUGxlYXNlIHJlbW92ZSB0aGUgZm9sbG93aW5nIGRpcmVjdG9yaWVzIGFuZCByZS10cnlcbiogJHtob21lRGlyTW9kdWxlc1BhdGh9XG4qICR7dXNlckRpck1vZHVsZXNQYXRofVxuKlxuKiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiB0aGUgdnVsbmVyYWJpbGl0eSBodHRwczovL2N2ZS5taXRyZS5vcmcvY2dpLWJpbi9jdmVuYW1lLmNnaT9uYW1lPUNWRS0yMDIwLTE0MTZcbipcblxuYDtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKG1lc3NhZ2UpO1xuXHRcdFx0XHRjb25zb2xlLndhcm4obWVzc2FnZSk7XG5cdFx0XHRcdHByb2Nlc3MuZXhpdCgwKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IHZzZGFNb2QgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBoYXNWU0RBID0gZnMuZXhpc3RzU3luYyhqb2luKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCcnKS5mc1BhdGgsICcuLi9ub2RlX21vZHVsZXMvdnNkYScpKTtcblx0XHRpZiAoaGFzVlNEQSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHJlcXVpcmUoJ3ZzZGEnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9KTtcblxuXHRsZXQgc2VydmVyQmFzZVBhdGggPSBhcmdzWydzZXJ2ZXItYmFzZS1wYXRoJ107XG5cdGlmIChzZXJ2ZXJCYXNlUGF0aCAmJiAhc2VydmVyQmFzZVBhdGguc3RhcnRzV2l0aCgnLycpKSB7XG5cdFx0c2VydmVyQmFzZVBhdGggPSBgLyR7c2VydmVyQmFzZVBhdGh9YDtcblx0fVxuXG5cdGNvbnN0IGhhc1dlYkNsaWVudCA9IGZzLmV4aXN0c1N5bmMoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoYHZzL2NvZGUvYnJvd3Nlci93b3JrYmVuY2gvd29ya2JlbmNoLmh0bWxgKS5mc1BhdGgpO1xuXG5cdGlmIChoYXNXZWJDbGllbnQgJiYgYWRkcmVzcyAmJiB0eXBlb2YgYWRkcmVzcyAhPT0gJ3N0cmluZycpIHtcblx0XHQvLyBzaGlwcyB0aGUgd2ViIHVpIVxuXHRcdGNvbnN0IHF1ZXJ5UGFydCA9IChjb25uZWN0aW9uVG9rZW4udHlwZSAhPT0gU2VydmVyQ29ubmVjdGlvblRva2VuVHlwZS5Ob25lID8gYD8ke2Nvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZX09JHtjb25uZWN0aW9uVG9rZW4udmFsdWV9YCA6ICcnKTtcblx0XHRjb25zb2xlLmxvZyhgV2ViIFVJIGF2YWlsYWJsZSBhdCBodHRwOi8vbG9jYWxob3N0JHthZGRyZXNzLnBvcnQgPT09IDgwID8gJycgOiBgOiR7YWRkcmVzcy5wb3J0fWB9JHtzZXJ2ZXJCYXNlUGF0aCA/PyAnJ30ke3F1ZXJ5UGFydH1gKTtcblx0fVxuXG5cdGNvbnN0IHJlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudFNlcnZlciwgc29ja2V0U2VydmVyLCBjb25uZWN0aW9uVG9rZW4sIHZzZGFNb2QsIGhhc1dlYkNsaWVudCwgc2VydmVyQmFzZVBhdGgpO1xuXG5cdHBlcmYubWFyaygnY29kZS9zZXJ2ZXIvcmVhZHknKTtcblx0Y29uc3QgY3VycmVudFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGNvbnN0IHZzY29kZVNlcnZlclN0YXJ0VGltZTogbnVtYmVyID0gKDxhbnk+Z2xvYmFsKS52c2NvZGVTZXJ2ZXJTdGFydFRpbWU7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRjb25zdCB2c2NvZGVTZXJ2ZXJMaXN0ZW5UaW1lOiBudW1iZXIgPSAoPGFueT5nbG9iYWwpLnZzY29kZVNlcnZlckxpc3RlblRpbWU7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRjb25zdCB2c2NvZGVTZXJ2ZXJDb2RlTG9hZGVkVGltZTogbnVtYmVyID0gKDxhbnk+Z2xvYmFsKS52c2NvZGVTZXJ2ZXJDb2RlTG9hZGVkVGltZTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHR5cGUgU2VydmVyU3RhcnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0Y29tbWVudDogJ1RoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWQgdXAnO1xuXHRcdFx0c3RhcnRUaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHRpbWUgdGhlIHNlcnZlciBzdGFydGVkIGF0LicgfTtcblx0XHRcdHN0YXJ0ZWRUaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHRpbWUgdGhlIHNlcnZlciBiZWdhbiBsaXN0ZW5pbmcgZm9yIGNvbm5lY3Rpb25zLicgfTtcblx0XHRcdGNvZGVMb2FkZWRUaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHRpbWUgd2hpY2ggdGhlIGNvZGUgbG9hZGVkIG9uIHRoZSBzZXJ2ZXInIH07XG5cdFx0XHRyZWFkeVRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdGltZSB3aGVuIHRoZSBzZXJ2ZXIgd2FzIGNvbXBsZXRlbHkgcmVhZHknIH07XG5cdFx0fTtcblx0XHR0eXBlIFNlcnZlclN0YXJ0RXZlbnQgPSB7XG5cdFx0XHRzdGFydFRpbWU6IG51bWJlcjtcblx0XHRcdHN0YXJ0ZWRUaW1lOiBudW1iZXI7XG5cdFx0XHRjb2RlTG9hZGVkVGltZTogbnVtYmVyO1xuXHRcdFx0cmVhZHlUaW1lOiBudW1iZXI7XG5cdFx0fTtcblx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U2VydmVyU3RhcnRFdmVudCwgU2VydmVyU3RhcnRDbGFzc2lmaWNhdGlvbj4oJ3NlcnZlclN0YXJ0Jywge1xuXHRcdFx0c3RhcnRUaW1lOiB2c2NvZGVTZXJ2ZXJTdGFydFRpbWUsXG5cdFx0XHRzdGFydGVkVGltZTogdnNjb2RlU2VydmVyTGlzdGVuVGltZSxcblx0XHRcdGNvZGVMb2FkZWRUaW1lOiB2c2NvZGVTZXJ2ZXJDb2RlTG9hZGVkVGltZSxcblx0XHRcdHJlYWR5VGltZTogY3VycmVudFRpbWVcblx0XHR9KTtcblxuXHRcdGlmIChwbGF0Zm9ybS5pc0xpbnV4KSB7XG5cdFx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHJlbGVhc2VJbmZvID0gYXdhaXQgZ2V0T1NSZWxlYXNlSW5mbyhsb2dTZXJ2aWNlLmVycm9yLmJpbmQobG9nU2VydmljZSkpO1xuXHRcdFx0aWYgKHJlbGVhc2VJbmZvKSB7XG5cdFx0XHRcdHR5cGUgU2VydmVyUGxhdGZvcm1JbmZvQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0cGxhdGZvcm1JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0Egc3RyaW5nIGlkZW50aWZ5aW5nIHRoZSBvcGVyYXRpbmcgc3lzdGVtIHdpdGhvdXQgYW55IHZlcnNpb24gaW5mb3JtYXRpb24uJyB9O1xuXHRcdFx0XHRcdHBsYXRmb3JtVmVyc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQSBzdHJpbmcgaWRlbnRpZnlpbmcgdGhlIG9wZXJhdGluZyBzeXN0ZW0gdmVyc2lvbiBleGNsdWRpbmcgYW55IG5hbWUgaW5mb3JtYXRpb24gb3IgcmVsZWFzZSBjb2RlLicgfTtcblx0XHRcdFx0XHRwbGF0Zm9ybUlkTGlrZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0Egc3RyaW5nIGlkZW50aWZ5aW5nIHRoZSBvcGVyYXRpbmcgc3lzdGVtIHRoZSBjdXJyZW50IE9TIGRlcml2YXRlIGlzIGNsb3NlbHkgcmVsYXRlZCB0by4nIH07XG5cdFx0XHRcdFx0b3duZXI6ICdkZWVwYWsxNTU2Jztcblx0XHRcdFx0XHRjb21tZW50OiAnUHJvdmlkZXMgaW5zaWdodCBpbnRvIHRoZSBkaXN0cm8gaW5mb3JtYXRpb24gb24gTGludXguJztcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBTZXJ2ZXJQbGF0Zm9ybUluZm9FdmVudCA9IHtcblx0XHRcdFx0XHRwbGF0Zm9ybUlkOiBzdHJpbmc7XG5cdFx0XHRcdFx0cGxhdGZvcm1WZXJzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRwbGF0Zm9ybUlkTGlrZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U2VydmVyUGxhdGZvcm1JbmZvRXZlbnQsIFNlcnZlclBsYXRmb3JtSW5mb0NsYXNzaWZpY2F0aW9uPignc2VydmVyUGxhdGZvcm1JbmZvJywge1xuXHRcdFx0XHRcdHBsYXRmb3JtSWQ6IHJlbGVhc2VJbmZvLmlkLFxuXHRcdFx0XHRcdHBsYXRmb3JtVmVyc2lvbklkOiByZWxlYXNlSW5mby52ZXJzaW9uX2lkLFxuXHRcdFx0XHRcdHBsYXRmb3JtSWRMaWtlOiByZWxlYXNlSW5mby5pZF9saWtlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0aWYgKGFyZ3NbJ3ByaW50LXN0YXJ0dXAtcGVyZm9ybWFuY2UnXSkge1xuXHRcdGxldCBvdXRwdXQgPSAnJztcblx0XHRvdXRwdXQgKz0gYFN0YXJ0LXVwIHRpbWU6ICR7dnNjb2RlU2VydmVyTGlzdGVuVGltZSAtIHZzY29kZVNlcnZlclN0YXJ0VGltZX1cXG5gO1xuXHRcdG91dHB1dCArPSBgQ29kZSBsb2FkaW5nIHRpbWU6ICR7dnNjb2RlU2VydmVyQ29kZUxvYWRlZFRpbWUgLSB2c2NvZGVTZXJ2ZXJTdGFydFRpbWV9XFxuYDtcblx0XHRvdXRwdXQgKz0gYEluaXRpYWxpemVkIHRpbWU6ICR7Y3VycmVudFRpbWUgLSB2c2NvZGVTZXJ2ZXJTdGFydFRpbWV9XFxuYDtcblx0XHRvdXRwdXQgKz0gYFxcbmA7XG5cdFx0Y29uc29sZS5sb2cob3V0cHV0KTtcblx0fVxuXG5cdHJldHVybiByZW1vdGVFeHRlbnNpb25Ib3N0QWdlbnRTZXJ2ZXI7XG59XG5cbmNsYXNzIFdlYkVuZHBvaW50T3JpZ2luQ2hlY2tlciB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUocHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSk6IFdlYkVuZHBvaW50T3JpZ2luQ2hlY2tlciB7XG5cdFx0Y29uc3Qgd2ViRW5kcG9pbnRVcmxUZW1wbGF0ZSA9IHByb2R1Y3RTZXJ2aWNlLndlYkVuZHBvaW50VXJsVGVtcGxhdGU7XG5cdFx0Y29uc3QgY29tbWl0ID0gcHJvZHVjdFNlcnZpY2UuY29tbWl0O1xuXHRcdGNvbnN0IHF1YWxpdHkgPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5O1xuXHRcdGlmICghd2ViRW5kcG9pbnRVcmxUZW1wbGF0ZSB8fCAhY29tbWl0IHx8ICFxdWFsaXR5KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFdlYkVuZHBvaW50T3JpZ2luQ2hlY2tlcihudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCB1dWlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgZXhhbXBsZVVybCA9IG5ldyBVUkwoXG5cdFx0XHR3ZWJFbmRwb2ludFVybFRlbXBsYXRlXG5cdFx0XHRcdC5yZXBsYWNlKCd7e3V1aWR9fScsIHV1aWQpXG5cdFx0XHRcdC5yZXBsYWNlKCd7e2NvbW1pdH19JywgY29tbWl0KVxuXHRcdFx0XHQucmVwbGFjZSgne3txdWFsaXR5fX0nLCBxdWFsaXR5KVxuXHRcdCk7XG5cdFx0Y29uc3QgZXhhbXBsZU9yaWdpbiA9IGV4YW1wbGVVcmwub3JpZ2luO1xuXHRcdGNvbnN0IG9yaWdpblJlZ0V4cFNvdXJjZSA9IChcblx0XHRcdGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoZXhhbXBsZU9yaWdpbilcblx0XHRcdFx0LnJlcGxhY2UodXVpZCwgJ1thLXpBLVowLTlcXFxcLV0rJylcblx0XHQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvcmlnaW5SZWdFeHAgPSBjcmVhdGVSZWdFeHAoYF4ke29yaWdpblJlZ0V4cFNvdXJjZX0kYCwgdHJ1ZSwgeyBtYXRjaENhc2U6IGZhbHNlIH0pO1xuXHRcdFx0cmV0dXJuIG5ldyBXZWJFbmRwb2ludE9yaWdpbkNoZWNrZXIob3JpZ2luUmVnRXhwKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBuZXcgV2ViRW5kcG9pbnRPcmlnaW5DaGVja2VyKG51bGwpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpblJlZ0V4cDogUmVnRXhwIHwgbnVsbFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBtYXRjaGVzKG9yaWdpbjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9vcmlnaW5SZWdFeHApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX29yaWdpblJlZ0V4cC50ZXN0KG9yaWdpbik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBRXBCLFlBQVksU0FBUztBQUNyQixTQUFTLHFC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
