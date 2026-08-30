import { createCancelablePromise, promiseWithResolvers } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { isCancellationError, onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { RemoteAuthorities } from "../../../base/common/network.js";
import * as performance from "../../../base/common/performance.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { Client, PersistentProtocol, ProtocolConstants, SocketCloseEventType } from "../../../base/parts/ipc/common/ipc.net.js";
import { RemoteAuthorityResolverError } from "./remoteAuthorityResolver.js";
const RECONNECT_TIMEOUT = 30 * 1e3;
var ConnectionType = /* @__PURE__ */ ((ConnectionType2) => {
  ConnectionType2[ConnectionType2["Management"] = 1] = "Management";
  ConnectionType2[ConnectionType2["ExtensionHost"] = 2] = "ExtensionHost";
  ConnectionType2[ConnectionType2["Tunnel"] = 3] = "Tunnel";
  return ConnectionType2;
})(ConnectionType || {});
function connectionTypeToString(connectionType) {
  switch (connectionType) {
    case 1 /* Management */:
      return "Management";
    case 2 /* ExtensionHost */:
      return "ExtensionHost";
    case 3 /* Tunnel */:
      return "Tunnel";
  }
}
function createTimeoutCancellation(millis) {
  const source = new CancellationTokenSource();
  setTimeout(() => source.cancel(), millis);
  return source.token;
}
function combineTimeoutCancellation(a, b) {
  if (a.isCancellationRequested || b.isCancellationRequested) {
    return CancellationToken.Cancelled;
  }
  const source = new CancellationTokenSource();
  a.onCancellationRequested(() => source.cancel());
  b.onCancellationRequested(() => source.cancel());
  return source.token;
}
class PromiseWithTimeout {
  get didTimeout() {
    return this._state === "timedout";
  }
  constructor(timeoutCancellationToken) {
    this._state = "pending";
    this._disposables = new DisposableStore();
    ({ promise: this.promise, resolve: this._resolvePromise, reject: this._rejectPromise } = promiseWithResolvers());
    if (timeoutCancellationToken.isCancellationRequested) {
      this._timeout();
    } else {
      this._disposables.add(timeoutCancellationToken.onCancellationRequested(() => this._timeout()));
    }
  }
  registerDisposable(disposable) {
    if (this._state === "pending") {
      this._disposables.add(disposable);
    } else {
      disposable.dispose();
    }
  }
  _timeout() {
    if (this._state !== "pending") {
      return;
    }
    this._disposables.dispose();
    this._state = "timedout";
    this._rejectPromise(this._createTimeoutError());
  }
  _createTimeoutError() {
    const err = new Error("Time limit reached");
    err.code = "ETIMEDOUT";
    err.syscall = "connect";
    return err;
  }
  resolve(value) {
    if (this._state !== "pending") {
      return;
    }
    this._disposables.dispose();
    this._state = "resolved";
    this._resolvePromise(value);
  }
  reject(err) {
    if (this._state !== "pending") {
      return;
    }
    this._disposables.dispose();
    this._state = "rejected";
    this._rejectPromise(err);
  }
}
function readOneControlMessage(protocol, timeoutCancellationToken) {
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  result.registerDisposable(protocol.onControlMessage((raw) => {
    const msg = JSON.parse(raw.toString());
    const error = getErrorFromMessage(msg);
    if (error) {
      result.reject(error);
    } else {
      result.resolve(msg);
    }
  }));
  return result.promise;
}
function createSocket(logService, remoteSocketFactoryService, connectTo, path, query, debugConnectionType, debugLabel, timeoutCancellationToken) {
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  const sw = StopWatch.create(false);
  logService.info(`Creating a socket (${debugLabel})...`);
  performance.mark(`code/willCreateSocket/${debugConnectionType}`);
  remoteSocketFactoryService.connect(connectTo, path, query, debugLabel).then((socket) => {
    if (result.didTimeout) {
      performance.mark(`code/didCreateSocketError/${debugConnectionType}`);
      logService.info(`Creating a socket (${debugLabel}) finished after ${sw.elapsed()} ms, but this is too late and has timed out already.`);
      socket?.dispose();
    } else {
      performance.mark(`code/didCreateSocketOK/${debugConnectionType}`);
      logService.info(`Creating a socket (${debugLabel}) was successful after ${sw.elapsed()} ms.`);
      result.resolve(socket);
    }
  }, (err) => {
    performance.mark(`code/didCreateSocketError/${debugConnectionType}`);
    logService.info(`Creating a socket (${debugLabel}) returned an error after ${sw.elapsed()} ms.`);
    logService.error(err);
    result.reject(err);
  });
  return result.promise;
}
function raceWithTimeoutCancellation(promise, timeoutCancellationToken) {
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  promise.then(
    (res) => {
      if (!result.didTimeout) {
        result.resolve(res);
      }
    },
    (err) => {
      if (!result.didTimeout) {
        result.reject(err);
      }
    }
  );
  return result.promise;
}
async function connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken) {
  const logPrefix = connectLogPrefix(options, connectionType);
  options.logService.trace(`${logPrefix} 1/6. invoking socketFactory.connect().`);
  let socket;
  try {
    socket = await createSocket(options.logService, options.remoteSocketFactoryService, options.connectTo, RemoteAuthorities.getServerRootPath(), `reconnectionToken=${options.reconnectionToken}&reconnection=${options.reconnectionProtocol ? "true" : "false"}`, connectionTypeToString(connectionType), `renderer-${connectionTypeToString(connectionType)}-${options.reconnectionToken}`, timeoutCancellationToken);
  } catch (error) {
    options.logService.error(`${logPrefix} socketFactory.connect() failed or timed out. Error:`);
    options.logService.error(error);
    throw error;
  }
  options.logService.trace(`${logPrefix} 2/6. socketFactory.connect() was successful.`);
  let protocol;
  let ownsProtocol;
  if (options.reconnectionProtocol) {
    options.reconnectionProtocol.beginAcceptReconnection(socket, null);
    protocol = options.reconnectionProtocol;
    ownsProtocol = false;
  } else {
    protocol = new PersistentProtocol({ socket });
    ownsProtocol = true;
  }
  options.logService.trace(`${logPrefix} 3/6. sending AuthRequest control message.`);
  const message = await raceWithTimeoutCancellation(options.signService.createNewMessage(generateUuid()), timeoutCancellationToken);
  const authRequest = {
    type: "auth",
    auth: options.connectionToken || "00000000000000000000",
    data: message.data
  };
  protocol.sendControl(VSBuffer.fromString(JSON.stringify(authRequest)));
  try {
    const msg = await readOneControlMessage(protocol, combineTimeoutCancellation(timeoutCancellationToken, createTimeoutCancellation(1e4)));
    if (msg.type !== "sign" || typeof msg.data !== "string") {
      const error = new Error("Unexpected handshake message");
      error.code = "VSCODE_CONNECTION_ERROR";
      throw error;
    }
    options.logService.trace(`${logPrefix} 4/6. received SignRequest control message.`);
    const isValid = await raceWithTimeoutCancellation(options.signService.validate(message, msg.signedData), timeoutCancellationToken);
    if (!isValid) {
      const error = new Error("Refused to connect to unsupported server");
      error.code = "VSCODE_CONNECTION_ERROR";
      throw error;
    }
    const signed = await raceWithTimeoutCancellation(options.signService.sign(msg.data), timeoutCancellationToken);
    const connTypeRequest = {
      type: "connectionType",
      commit: options.commit,
      signedData: signed,
      desiredConnectionType: connectionType
    };
    if (args) {
      connTypeRequest.args = args;
    }
    options.logService.trace(`${logPrefix} 5/6. sending ConnectionTypeRequest control message.`);
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(connTypeRequest)));
    return { protocol, ownsProtocol };
  } catch (error) {
    if (error && error.code === "ETIMEDOUT") {
      options.logService.error(`${logPrefix} the handshake timed out. Error:`);
      options.logService.error(error);
    }
    if (error && error.code === "VSCODE_CONNECTION_ERROR") {
      options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
      options.logService.error(error);
    }
    if (ownsProtocol) {
      safeDisposeProtocolAndSocket(protocol);
    }
    throw error;
  }
}
async function connectToRemoteExtensionHostAgentAndReadOneMessage(options, connectionType, args, timeoutCancellationToken) {
  const startTime = Date.now();
  const logPrefix = connectLogPrefix(options, connectionType);
  const { protocol, ownsProtocol } = await connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken);
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  result.registerDisposable(protocol.onControlMessage((raw) => {
    const msg = JSON.parse(raw.toString());
    const error = getErrorFromMessage(msg);
    if (error) {
      options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
      options.logService.error(error);
      if (ownsProtocol) {
        safeDisposeProtocolAndSocket(protocol);
      }
      result.reject(error);
    } else {
      options.reconnectionProtocol?.endAcceptReconnection();
      options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
      result.resolve({ protocol, firstMessage: msg });
    }
  }));
  return result.promise;
}
async function doConnectRemoteAgentManagement(options, timeoutCancellationToken) {
  const { protocol } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 1 /* Management */, void 0, timeoutCancellationToken);
  return { protocol };
}
async function doConnectRemoteAgentExtensionHost(options, startArguments, timeoutCancellationToken) {
  const { protocol, firstMessage } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 2 /* ExtensionHost */, startArguments, timeoutCancellationToken);
  const debugPort = firstMessage && firstMessage.debugPort;
  return { protocol, debugPort };
}
async function doConnectRemoteAgentTunnel(options, startParams, timeoutCancellationToken) {
  const startTime = Date.now();
  const logPrefix = connectLogPrefix(options, 3 /* Tunnel */);
  const { protocol } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 3 /* Tunnel */, startParams, timeoutCancellationToken);
  options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
  return protocol;
}
async function resolveConnectionOptions(options, reconnectionToken, reconnectionProtocol) {
  const { connectTo, connectionToken } = await options.addressProvider.getAddress();
  return {
    commit: options.commit,
    quality: options.quality,
    connectTo,
    connectionToken,
    reconnectionToken,
    reconnectionProtocol,
    remoteSocketFactoryService: options.remoteSocketFactoryService,
    signService: options.signService,
    logService: options.logService
  };
}
async function connectRemoteAgentManagement(options, remoteAuthority, clientId) {
  return createInitialConnection(
    options,
    async (simpleOptions) => {
      const { protocol } = await doConnectRemoteAgentManagement(simpleOptions, CancellationToken.None);
      return new ManagementPersistentConnection(options, remoteAuthority, clientId, simpleOptions.reconnectionToken, protocol);
    }
  );
}
async function connectRemoteAgentExtensionHost(options, startArguments) {
  return createInitialConnection(
    options,
    async (simpleOptions) => {
      const { protocol, debugPort } = await doConnectRemoteAgentExtensionHost(simpleOptions, startArguments, CancellationToken.None);
      return new ExtensionHostPersistentConnection(options, startArguments, simpleOptions.reconnectionToken, protocol, debugPort);
    }
  );
}
async function createInitialConnection(options, connectionFactory) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      const reconnectionToken = generateUuid();
      const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
      const result = await connectionFactory(simpleOptions);
      return result;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        options.logService.error(`[remote-connection][attempt ${attempt}] An error occurred in initial connection! Will retry... Error:`);
        options.logService.error(err);
      } else {
        options.logService.error(`[remote-connection][attempt ${attempt}]  An error occurred in initial connection! It will be treated as a permanent error. Error:`);
        options.logService.error(err);
        PersistentConnection.triggerPermanentFailure(0, 0, RemoteAuthorityResolverError.isHandled(err));
        throw err;
      }
    }
  }
}
async function connectRemoteAgentTunnel(options, tunnelRemoteHost, tunnelRemotePort) {
  const simpleOptions = await resolveConnectionOptions(options, generateUuid(), null);
  const protocol = await doConnectRemoteAgentTunnel(simpleOptions, { host: tunnelRemoteHost, port: tunnelRemotePort }, CancellationToken.None);
  return protocol;
}
function sleep(seconds) {
  return createCancelablePromise((token) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, seconds * 1e3);
      token.onCancellationRequested(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  });
}
var PersistentConnectionEventType = /* @__PURE__ */ ((PersistentConnectionEventType2) => {
  PersistentConnectionEventType2[PersistentConnectionEventType2["ConnectionLost"] = 0] = "ConnectionLost";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ReconnectionWait"] = 1] = "ReconnectionWait";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ReconnectionRunning"] = 2] = "ReconnectionRunning";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ReconnectionPermanentFailure"] = 3] = "ReconnectionPermanentFailure";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ConnectionGain"] = 4] = "ConnectionGain";
  return PersistentConnectionEventType2;
})(PersistentConnectionEventType || {});
class ConnectionLostEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.type = 0 /* ConnectionLost */;
  }
}
class ReconnectionWaitEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, durationSeconds, cancellableTimer) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.durationSeconds = durationSeconds;
    this.cancellableTimer = cancellableTimer;
    this.type = 1 /* ReconnectionWait */;
  }
  skipWait() {
    this.cancellableTimer.cancel();
  }
}
class ReconnectionRunningEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, attempt) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.attempt = attempt;
    this.type = 2 /* ReconnectionRunning */;
  }
}
class ConnectionGainEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, attempt) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.attempt = attempt;
    this.type = 4 /* ConnectionGain */;
  }
}
class ReconnectionPermanentFailureEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, attempt, handled) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.attempt = attempt;
    this.handled = handled;
    this.type = 3 /* ReconnectionPermanentFailure */;
  }
}
const _PersistentConnection = class _PersistentConnection extends Disposable {
  constructor(_connectionType, _options, reconnectionToken, protocol, _reconnectionFailureIsFatal) {
    super();
    this._connectionType = _connectionType;
    this._options = _options;
    this.reconnectionToken = reconnectionToken;
    this.protocol = protocol;
    this._reconnectionFailureIsFatal = _reconnectionFailureIsFatal;
    this._onDidStateChange = this._register(new Emitter());
    this.onDidStateChange = this._onDidStateChange.event;
    this._permanentFailure = false;
    this._isReconnecting = false;
    this._isDisposed = false;
    this._reconnectionGraceTime = ProtocolConstants.ReconnectionGraceTime;
    this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, 0, 0));
    this._register(protocol.onSocketClose((e) => {
      const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
      if (!e) {
        this._options.logService.info(`${logPrefix} received socket close event.`);
      } else if (e.type === SocketCloseEventType.NodeSocketCloseEvent) {
        this._options.logService.info(`${logPrefix} received socket close event (hadError: ${e.hadError}).`);
        if (e.error) {
          this._options.logService.error(e.error);
        }
      } else {
        this._options.logService.info(`${logPrefix} received socket close event (wasClean: ${e.wasClean}, code: ${e.code}, reason: ${e.reason}).`);
        if (e.event) {
          this._options.logService.error(e.event);
        }
      }
      this._beginReconnecting();
    }));
    this._register(protocol.onSocketTimeout((e) => {
      const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
      this._options.logService.info(`${logPrefix} received socket timeout event (reason: ${e.reason}, unacknowledgedMsgCount: ${e.unacknowledgedMsgCount}, timeSinceOldestUnacknowledgedMsg: ${e.timeSinceOldestUnacknowledgedMsg}, timeSinceLastReceivedSomeData: ${e.timeSinceLastReceivedSomeData}).`);
      this._beginReconnecting();
    }));
    _PersistentConnection._instances.push(this);
    this._register(toDisposable(() => {
      const myIndex = _PersistentConnection._instances.indexOf(this);
      if (myIndex >= 0) {
        _PersistentConnection._instances.splice(myIndex, 1);
      }
    }));
    if (this._isPermanentFailure) {
      this._gotoPermanentFailure(_PersistentConnection._permanentFailureMillisSinceLastIncomingData, _PersistentConnection._permanentFailureAttempt, _PersistentConnection._permanentFailureHandled);
    }
  }
  static triggerPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
    this._permanentFailure = true;
    this._permanentFailureMillisSinceLastIncomingData = millisSinceLastIncomingData;
    this._permanentFailureAttempt = attempt;
    this._permanentFailureHandled = handled;
    this._instances.forEach((instance) => instance._gotoPermanentFailure(this._permanentFailureMillisSinceLastIncomingData, this._permanentFailureAttempt, this._permanentFailureHandled));
  }
  static debugTriggerReconnection() {
    this._instances.forEach((instance) => instance._beginReconnecting());
  }
  static debugPauseSocketWriting() {
    this._instances.forEach((instance) => instance._pauseSocketWriting());
  }
  get _isPermanentFailure() {
    return this._permanentFailure || _PersistentConnection._permanentFailure;
  }
  updateGraceTime(graceTime) {
    const sanitizedGrace = sanitizeGraceTime(graceTime, ProtocolConstants.ReconnectionGraceTime);
    const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, false);
    this._options.logService.trace(`${logPrefix} Applying reconnection grace time: ${sanitizedGrace}ms (${Math.floor(sanitizedGrace / 1e3)}s)`);
    this._reconnectionGraceTime = sanitizedGrace;
  }
  dispose() {
    super.dispose();
    this._isDisposed = true;
  }
  async _beginReconnecting() {
    if (this._isReconnecting) {
      return;
    }
    try {
      this._isReconnecting = true;
      await this._runReconnectingLoop();
    } finally {
      this._isReconnecting = false;
    }
  }
  async _runReconnectingLoop() {
    if (this._isPermanentFailure || this._isDisposed) {
      return;
    }
    const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
    this._options.logService.info(`${logPrefix} starting reconnecting loop. You can get more information with the trace log level.`);
    this._onDidStateChange.fire(new ConnectionLostEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData()));
    const TIMES = [0, 5, 5, 10, 10, 10, 10, 10, 30];
    const graceTime = this._reconnectionGraceTime;
    this._options.logService.info(`${logPrefix} starting reconnection with grace time: ${graceTime}ms (${Math.floor(graceTime / 1e3)}s)`);
    if (graceTime <= 0) {
      this._options.logService.error(`${logPrefix} reconnection grace time is set to 0ms, will not attempt to reconnect.`);
      this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), 0, false);
      return;
    }
    const loopStartTime = Date.now();
    let attempt = -1;
    do {
      attempt++;
      const waitTime = attempt < TIMES.length ? TIMES[attempt] : TIMES[TIMES.length - 1];
      try {
        if (waitTime > 0) {
          const sleepPromise = sleep(waitTime);
          this._onDidStateChange.fire(new ReconnectionWaitEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), waitTime, sleepPromise));
          this._options.logService.info(`${logPrefix} waiting for ${waitTime} seconds before reconnecting...`);
          try {
            await sleepPromise;
          } catch {
          }
        }
        if (this._isPermanentFailure) {
          this._options.logService.error(`${logPrefix} permanent failure occurred while running the reconnecting loop.`);
          break;
        }
        this._onDidStateChange.fire(new ReconnectionRunningEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
        this._options.logService.info(`${logPrefix} resolving connection...`);
        const simpleOptions = await resolveConnectionOptions(this._options, this.reconnectionToken, this.protocol);
        this._options.logService.info(`${logPrefix} connecting to ${simpleOptions.connectTo}...`);
        await this._reconnect(simpleOptions, createTimeoutCancellation(RECONNECT_TIMEOUT));
        this._options.logService.info(`${logPrefix} reconnected!`);
        this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
        break;
      } catch (err) {
        if (err.code === "VSCODE_CONNECTION_ERROR") {
          this._options.logService.error(`${logPrefix} A permanent error occurred in the reconnecting loop! Will give up now! Error:`);
          this._options.logService.error(err);
          this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
          break;
        }
        if (Date.now() - loopStartTime >= graceTime) {
          const graceSeconds = Math.round(graceTime / 1e3);
          this._options.logService.error(`${logPrefix} An error occurred while reconnecting, but it will be treated as a permanent error because the reconnection grace time (${graceSeconds}s) has expired! Will give up now! Error:`);
          this._options.logService.error(err);
          this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
          break;
        }
        if (RemoteAuthorityResolverError.isTemporarilyNotAvailable(err)) {
          this._options.logService.info(`${logPrefix} A temporarily not available error occurred while trying to reconnect, will try again...`);
          this._options.logService.trace(err);
          continue;
        }
        if ((err.code === "ETIMEDOUT" || err.code === "ENETUNREACH" || err.code === "ECONNREFUSED" || err.code === "ECONNRESET") && err.syscall === "connect") {
          this._options.logService.info(`${logPrefix} A network error occurred while trying to reconnect, will try again...`);
          this._options.logService.trace(err);
          continue;
        }
        if (isCancellationError(err)) {
          this._options.logService.info(`${logPrefix} A promise cancelation error occurred while trying to reconnect, will try again...`);
          this._options.logService.trace(err);
          continue;
        }
        if (err instanceof RemoteAuthorityResolverError) {
          this._options.logService.error(`${logPrefix} A RemoteAuthorityResolverError occurred while trying to reconnect. Will give up now! Error:`);
          this._options.logService.error(err);
          this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, RemoteAuthorityResolverError.isHandled(err));
          break;
        }
        this._options.logService.error(`${logPrefix} An unknown error occurred while trying to reconnect, since this is an unknown case, it will be treated as a permanent error! Will give up now! Error:`);
        this._options.logService.error(err);
        this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
        break;
      }
    } while (!this._isPermanentFailure && !this._isDisposed);
  }
  _onReconnectionPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
    if (this._reconnectionFailureIsFatal) {
      _PersistentConnection.triggerPermanentFailure(millisSinceLastIncomingData, attempt, handled);
    } else {
      this._gotoPermanentFailure(millisSinceLastIncomingData, attempt, handled);
    }
  }
  _gotoPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
    this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent(this.reconnectionToken, millisSinceLastIncomingData, attempt, handled));
    safeDisposeProtocolAndSocket(this.protocol);
  }
  _pauseSocketWriting() {
    this.protocol.pauseSocketWriting();
  }
};
_PersistentConnection._permanentFailure = false;
_PersistentConnection._permanentFailureMillisSinceLastIncomingData = 0;
_PersistentConnection._permanentFailureAttempt = 0;
_PersistentConnection._permanentFailureHandled = false;
_PersistentConnection._instances = [];
let PersistentConnection = _PersistentConnection;
class ManagementPersistentConnection extends PersistentConnection {
  constructor(options, remoteAuthority, clientId, reconnectionToken, protocol) {
    super(
      1 /* Management */,
      options,
      reconnectionToken,
      protocol,
      /*reconnectionFailureIsFatal*/
      true
    );
    this.client = this._register(new Client(protocol, {
      remoteAuthority,
      clientId
    }, options.ipcLogger));
  }
  async _reconnect(options, timeoutCancellationToken) {
    await doConnectRemoteAgentManagement(options, timeoutCancellationToken);
  }
}
class ExtensionHostPersistentConnection extends PersistentConnection {
  constructor(options, startArguments, reconnectionToken, protocol, debugPort) {
    super(
      2 /* ExtensionHost */,
      options,
      reconnectionToken,
      protocol,
      /*reconnectionFailureIsFatal*/
      false
    );
    this._startArguments = startArguments;
    this.debugPort = debugPort;
  }
  async _reconnect(options, timeoutCancellationToken) {
    await doConnectRemoteAgentExtensionHost(options, this._startArguments, timeoutCancellationToken);
  }
}
function safeDisposeProtocolAndSocket(protocol) {
  try {
    protocol.acceptDisconnect();
    const socket = protocol.getSocket();
    protocol.dispose();
    socket.dispose();
  } catch (err) {
    onUnexpectedError(err);
  }
}
function getErrorFromMessage(msg) {
  if (msg && msg.type === "error") {
    const error = new Error(`Connection error: ${msg.reason}`);
    error.code = "VSCODE_CONNECTION_ERROR";
    return error;
  }
  return null;
}
function sanitizeGraceTime(candidate, fallback) {
  if (typeof candidate !== "number" || !isFinite(candidate) || candidate < 0) {
    return fallback;
  }
  if (candidate > Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.floor(candidate);
}
function stringRightPad(str, len) {
  while (str.length < len) {
    str += " ";
  }
  return str;
}
function _commonLogPrefix(connectionType, reconnectionToken) {
  return `[remote-connection][${stringRightPad(connectionTypeToString(connectionType), 13)}][${reconnectionToken.substr(0, 5)}\u2026]`;
}
function commonLogPrefix(connectionType, reconnectionToken, isReconnect) {
  return `${_commonLogPrefix(connectionType, reconnectionToken)}[${isReconnect ? "reconnect" : "initial"}]`;
}
function connectLogPrefix(options, connectionType) {
  return `${commonLogPrefix(connectionType, options.reconnectionToken, !!options.reconnectionProtocol)}[${options.connectTo}]`;
}
function logElapsed(startTime) {
  return `${Date.now() - startTime} ms`;
}
export {
  ConnectionGainEvent,
  ConnectionLostEvent,
  ConnectionType,
  ExtensionHostPersistentConnection,
  ManagementPersistentConnection,
  PersistentConnection,
  PersistentConnectionEventType,
  ReconnectionPermanentFailureEvent,
  ReconnectionRunningEvent,
  ReconnectionWaitEvent,
  connectRemoteAgentExtensionHost,
  connectRemoteAgentManagement,
  connectRemoteAgentTunnel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlXFxjb21tb25cXHJlbW90ZUFnZW50Q29ubmVjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgcHJvbWlzZVdpdGhSZXNvbHZlcnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBdXRob3JpdGllcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGVyZm9ybWFuY2UgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUlQQ0xvZ2dlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgQ2xpZW50LCBJU29ja2V0LCBQZXJzaXN0ZW50UHJvdG9jb2wsIFByb3RvY29sQ29uc3RhbnRzLCBTb2NrZXRDbG9zZUV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dCB9IGZyb20gJy4vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLCBSZW1vdGVDb25uZWN0aW9uIH0gZnJvbSAnLi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UgfSBmcm9tICcuL3JlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaWduU2VydmljZSB9IGZyb20gJy4uLy4uL3NpZ24vY29tbW9uL3NpZ24uanMnO1xuXG5jb25zdCBSRUNPTk5FQ1RfVElNRU9VVCA9IDMwICogMTAwMCAvKiAzMHMgKi87XG5cbmV4cG9ydCBjb25zdCBlbnVtIENvbm5lY3Rpb25UeXBlIHtcblx0TWFuYWdlbWVudCA9IDEsXG5cdEV4dGVuc2lvbkhvc3QgPSAyLFxuXHRUdW5uZWwgPSAzLFxufVxuXG5mdW5jdGlvbiBjb25uZWN0aW9uVHlwZVRvU3RyaW5nKGNvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoY29ubmVjdGlvblR5cGUpIHtcblx0XHRjYXNlIENvbm5lY3Rpb25UeXBlLk1hbmFnZW1lbnQ6XG5cdFx0XHRyZXR1cm4gJ01hbmFnZW1lbnQnO1xuXHRcdGNhc2UgQ29ubmVjdGlvblR5cGUuRXh0ZW5zaW9uSG9zdDpcblx0XHRcdHJldHVybiAnRXh0ZW5zaW9uSG9zdCc7XG5cdFx0Y2FzZSBDb25uZWN0aW9uVHlwZS5UdW5uZWw6XG5cdFx0XHRyZXR1cm4gJ1R1bm5lbCc7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdXRoUmVxdWVzdCB7XG5cdHR5cGU6ICdhdXRoJztcblx0YXV0aDogc3RyaW5nO1xuXHRkYXRhOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2lnblJlcXVlc3Qge1xuXHR0eXBlOiAnc2lnbic7XG5cdGRhdGE6IHN0cmluZztcblx0c2lnbmVkRGF0YTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbm5lY3Rpb25UeXBlUmVxdWVzdCB7XG5cdHR5cGU6ICdjb25uZWN0aW9uVHlwZSc7XG5cdGNvbW1pdD86IHN0cmluZztcblx0c2lnbmVkRGF0YTogc3RyaW5nO1xuXHRkZXNpcmVkQ29ubmVjdGlvblR5cGU/OiBDb25uZWN0aW9uVHlwZTtcblx0YXJncz86IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFcnJvck1lc3NhZ2Uge1xuXHR0eXBlOiAnZXJyb3InO1xuXHRyZWFzb246IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBPS01lc3NhZ2Uge1xuXHR0eXBlOiAnb2snO1xufVxuXG5leHBvcnQgdHlwZSBIYW5kc2hha2VNZXNzYWdlID0gQXV0aFJlcXVlc3QgfCBTaWduUmVxdWVzdCB8IENvbm5lY3Rpb25UeXBlUmVxdWVzdCB8IEVycm9yTWVzc2FnZSB8IE9LTWVzc2FnZTtcblxuXG5pbnRlcmZhY2UgSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zPFQgZXh0ZW5kcyBSZW1vdGVDb25uZWN0aW9uID0gUmVtb3RlQ29ubmVjdGlvbj4ge1xuXHRjb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb25uZWN0VG86IFQ7XG5cdGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nO1xuXHRyZWNvbm5lY3Rpb25Qcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sIHwgbnVsbDtcblx0cmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2U6IElSZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZTtcblx0c2lnblNlcnZpY2U6IElTaWduU2VydmljZTtcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRpbWVvdXRDYW5jZWxsYXRpb24obWlsbGlzOiBudW1iZXIpOiBDYW5jZWxsYXRpb25Ub2tlbiB7XG5cdGNvbnN0IHNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRzZXRUaW1lb3V0KCgpID0+IHNvdXJjZS5jYW5jZWwoKSwgbWlsbGlzKTtcblx0cmV0dXJuIHNvdXJjZS50b2tlbjtcbn1cblxuZnVuY3Rpb24gY29tYmluZVRpbWVvdXRDYW5jZWxsYXRpb24oYTogQ2FuY2VsbGF0aW9uVG9rZW4sIGI6IENhbmNlbGxhdGlvblRva2VuKTogQ2FuY2VsbGF0aW9uVG9rZW4ge1xuXHRpZiAoYS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBiLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0cmV0dXJuIENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZDtcblx0fVxuXHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0YS5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBzb3VyY2UuY2FuY2VsKCkpO1xuXHRiLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHNvdXJjZS5jYW5jZWwoKSk7XG5cdHJldHVybiBzb3VyY2UudG9rZW47XG59XG5cbmNsYXNzIFByb21pc2VXaXRoVGltZW91dDxUPiB7XG5cblx0cHJpdmF0ZSBfc3RhdGU6ICdwZW5kaW5nJyB8ICdyZXNvbHZlZCcgfCAncmVqZWN0ZWQnIHwgJ3RpbWVkb3V0Jztcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHVibGljIHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8VD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVQcm9taXNlOiAodmFsdWU6IFQpID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlamVjdFByb21pc2U6IChlcnI6IGFueSkgPT4gdm9pZDtcblxuXHRwdWJsaWMgZ2V0IGRpZFRpbWVvdXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9zdGF0ZSA9PT0gJ3RpbWVkb3V0Jyk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcih0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0dGhpcy5fc3RhdGUgPSAncGVuZGluZyc7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQoeyBwcm9taXNlOiB0aGlzLnByb21pc2UsIHJlc29sdmU6IHRoaXMuX3Jlc29sdmVQcm9taXNlLCByZWplY3Q6IHRoaXMuX3JlamVjdFByb21pc2UgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPFQ+KCkpO1xuXG5cdFx0aWYgKHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5fdGltZW91dCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGltZW91dENhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHRoaXMuX3RpbWVvdXQoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckRpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09ICdwZW5kaW5nJykge1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90aW1lb3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdGF0ZSA9ICd0aW1lZG91dCc7XG5cdFx0dGhpcy5fcmVqZWN0UHJvbWlzZSh0aGlzLl9jcmVhdGVUaW1lb3V0RXJyb3IoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUaW1lb3V0RXJyb3IoKTogRXJyb3Ige1xuXHRcdGNvbnN0IGVycjogYW55ID0gbmV3IEVycm9yKCdUaW1lIGxpbWl0IHJlYWNoZWQnKTtcblx0XHRlcnIuY29kZSA9ICdFVElNRURPVVQnO1xuXHRcdGVyci5zeXNjYWxsID0gJ2Nvbm5lY3QnO1xuXHRcdHJldHVybiBlcnI7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZSh2YWx1ZTogVCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdGF0ZSA9ICdyZXNvbHZlZCc7XG5cdFx0dGhpcy5fcmVzb2x2ZVByb21pc2UodmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHJlamVjdChlcnI6IGFueSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdGF0ZSA9ICdyZWplY3RlZCc7XG5cdFx0dGhpcy5fcmVqZWN0UHJvbWlzZShlcnIpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRPbmVDb250cm9sTWVzc2FnZTxUPihwcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUPiB7XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9taXNlV2l0aFRpbWVvdXQ8VD4odGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0cmVzdWx0LnJlZ2lzdGVyRGlzcG9zYWJsZShwcm90b2NvbC5vbkNvbnRyb2xNZXNzYWdlKHJhdyA9PiB7XG5cdFx0Y29uc3QgbXNnOiBUID0gSlNPTi5wYXJzZShyYXcudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgZXJyb3IgPSBnZXRFcnJvckZyb21NZXNzYWdlKG1zZyk7XG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRyZXN1bHQucmVqZWN0KGVycm9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnJlc29sdmUobXNnKTtcblx0XHR9XG5cdH0pKTtcblx0cmV0dXJuIHJlc3VsdC5wcm9taXNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTb2NrZXQ8VCBleHRlbmRzIFJlbW90ZUNvbm5lY3Rpb24+KGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCByZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZTogSVJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlLCBjb25uZWN0VG86IFQsIHBhdGg6IHN0cmluZywgcXVlcnk6IHN0cmluZywgZGVidWdDb25uZWN0aW9uVHlwZTogc3RyaW5nLCBkZWJ1Z0xhYmVsOiBzdHJpbmcsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTb2NrZXQ+IHtcblx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2VXaXRoVGltZW91dDxJU29ja2V0Pih0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRsb2dTZXJ2aWNlLmluZm8oYENyZWF0aW5nIGEgc29ja2V0ICgke2RlYnVnTGFiZWx9KS4uLmApO1xuXHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL3dpbGxDcmVhdGVTb2NrZXQvJHtkZWJ1Z0Nvbm5lY3Rpb25UeXBlfWApO1xuXG5cdHJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlLmNvbm5lY3QoY29ubmVjdFRvLCBwYXRoLCBxdWVyeSwgZGVidWdMYWJlbCkudGhlbigoc29ja2V0KSA9PiB7XG5cdFx0aWYgKHJlc3VsdC5kaWRUaW1lb3V0KSB7XG5cdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2RpZENyZWF0ZVNvY2tldEVycm9yLyR7ZGVidWdDb25uZWN0aW9uVHlwZX1gKTtcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgQ3JlYXRpbmcgYSBzb2NrZXQgKCR7ZGVidWdMYWJlbH0pIGZpbmlzaGVkIGFmdGVyICR7c3cuZWxhcHNlZCgpfSBtcywgYnV0IHRoaXMgaXMgdG9vIGxhdGUgYW5kIGhhcyB0aW1lZCBvdXQgYWxyZWFkeS5gKTtcblx0XHRcdHNvY2tldD8uZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2RpZENyZWF0ZVNvY2tldE9LLyR7ZGVidWdDb25uZWN0aW9uVHlwZX1gKTtcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgQ3JlYXRpbmcgYSBzb2NrZXQgKCR7ZGVidWdMYWJlbH0pIHdhcyBzdWNjZXNzZnVsIGFmdGVyICR7c3cuZWxhcHNlZCgpfSBtcy5gKTtcblx0XHRcdHJlc3VsdC5yZXNvbHZlKHNvY2tldCk7XG5cdFx0fVxuXHR9LCAoZXJyKSA9PiB7XG5cdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9kaWRDcmVhdGVTb2NrZXRFcnJvci8ke2RlYnVnQ29ubmVjdGlvblR5cGV9YCk7XG5cdFx0bG9nU2VydmljZS5pbmZvKGBDcmVhdGluZyBhIHNvY2tldCAoJHtkZWJ1Z0xhYmVsfSkgcmV0dXJuZWQgYW4gZXJyb3IgYWZ0ZXIgJHtzdy5lbGFwc2VkKCl9IG1zLmApO1xuXHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRyZXN1bHQucmVqZWN0KGVycik7XG5cdH0pO1xuXG5cdHJldHVybiByZXN1bHQucHJvbWlzZTtcbn1cblxuZnVuY3Rpb24gcmFjZVdpdGhUaW1lb3V0Q2FuY2VsbGF0aW9uPFQ+KHByb21pc2U6IFByb21pc2U8VD4sIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2VXaXRoVGltZW91dDxUPih0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRwcm9taXNlLnRoZW4oXG5cdFx0KHJlcykgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQuZGlkVGltZW91dCkge1xuXHRcdFx0XHRyZXN1bHQucmVzb2x2ZShyZXMpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0KGVycikgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQuZGlkVGltZW91dCkge1xuXHRcdFx0XHRyZXN1bHQucmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHQpO1xuXHRyZXR1cm4gcmVzdWx0LnByb21pc2U7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RUb1JlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudDxUIGV4dGVuZHMgUmVtb3RlQ29ubmVjdGlvbj4ob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zPFQ+LCBjb25uZWN0aW9uVHlwZTogQ29ubmVjdGlvblR5cGUsIGFyZ3M6IGFueSB8IHVuZGVmaW5lZCwgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBwcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sOyBvd25zUHJvdG9jb2w6IGJvb2xlYW4gfT4ge1xuXHRjb25zdCBsb2dQcmVmaXggPSBjb25uZWN0TG9nUHJlZml4KG9wdGlvbnMsIGNvbm5lY3Rpb25UeXBlKTtcblxuXHRvcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSAxLzYuIGludm9raW5nIHNvY2tldEZhY3RvcnkuY29ubmVjdCgpLmApO1xuXG5cdGxldCBzb2NrZXQ6IElTb2NrZXQ7XG5cdHRyeSB7XG5cdFx0c29ja2V0ID0gYXdhaXQgY3JlYXRlU29ja2V0KG9wdGlvbnMubG9nU2VydmljZSwgb3B0aW9ucy5yZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZSwgb3B0aW9ucy5jb25uZWN0VG8sIFJlbW90ZUF1dGhvcml0aWVzLmdldFNlcnZlclJvb3RQYXRoKCksIGByZWNvbm5lY3Rpb25Ub2tlbj0ke29wdGlvbnMucmVjb25uZWN0aW9uVG9rZW59JnJlY29ubmVjdGlvbj0ke29wdGlvbnMucmVjb25uZWN0aW9uUHJvdG9jb2wgPyAndHJ1ZScgOiAnZmFsc2UnfWAsIGNvbm5lY3Rpb25UeXBlVG9TdHJpbmcoY29ubmVjdGlvblR5cGUpLCBgcmVuZGVyZXItJHtjb25uZWN0aW9uVHlwZVRvU3RyaW5nKGNvbm5lY3Rpb25UeXBlKX0tJHtvcHRpb25zLnJlY29ubmVjdGlvblRva2VufWAsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gc29ja2V0RmFjdG9yeS5jb25uZWN0KCkgZmFpbGVkIG9yIHRpbWVkIG91dC4gRXJyb3I6YCk7XG5cdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR0aHJvdyBlcnJvcjtcblx0fVxuXG5cdG9wdGlvbnMubG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IDIvNi4gc29ja2V0RmFjdG9yeS5jb25uZWN0KCkgd2FzIHN1Y2Nlc3NmdWwuYCk7XG5cblx0bGV0IHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2w7XG5cdGxldCBvd25zUHJvdG9jb2w6IGJvb2xlYW47XG5cdGlmIChvcHRpb25zLnJlY29ubmVjdGlvblByb3RvY29sKSB7XG5cdFx0b3B0aW9ucy5yZWNvbm5lY3Rpb25Qcm90b2NvbC5iZWdpbkFjY2VwdFJlY29ubmVjdGlvbihzb2NrZXQsIG51bGwpO1xuXHRcdHByb3RvY29sID0gb3B0aW9ucy5yZWNvbm5lY3Rpb25Qcm90b2NvbDtcblx0XHRvd25zUHJvdG9jb2wgPSBmYWxzZTtcblx0fSBlbHNlIHtcblx0XHRwcm90b2NvbCA9IG5ldyBQZXJzaXN0ZW50UHJvdG9jb2woeyBzb2NrZXQgfSk7XG5cdFx0b3duc1Byb3RvY29sID0gdHJ1ZTtcblx0fVxuXG5cdG9wdGlvbnMubG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IDMvNi4gc2VuZGluZyBBdXRoUmVxdWVzdCBjb250cm9sIG1lc3NhZ2UuYCk7XG5cdGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCByYWNlV2l0aFRpbWVvdXRDYW5jZWxsYXRpb24ob3B0aW9ucy5zaWduU2VydmljZS5jcmVhdGVOZXdNZXNzYWdlKGdlbmVyYXRlVXVpZCgpKSwgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblxuXHRjb25zdCBhdXRoUmVxdWVzdDogQXV0aFJlcXVlc3QgPSB7XG5cdFx0dHlwZTogJ2F1dGgnLFxuXHRcdGF1dGg6IG9wdGlvbnMuY29ubmVjdGlvblRva2VuIHx8ICcwMDAwMDAwMDAwMDAwMDAwMDAwMCcsXG5cdFx0ZGF0YTogbWVzc2FnZS5kYXRhXG5cdH07XG5cdHByb3RvY29sLnNlbmRDb250cm9sKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoYXV0aFJlcXVlc3QpKSk7XG5cblx0dHJ5IHtcblx0XHRjb25zdCBtc2cgPSBhd2FpdCByZWFkT25lQ29udHJvbE1lc3NhZ2U8SGFuZHNoYWtlTWVzc2FnZT4ocHJvdG9jb2wsIGNvbWJpbmVUaW1lb3V0Q2FuY2VsbGF0aW9uKHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbiwgY3JlYXRlVGltZW91dENhbmNlbGxhdGlvbigxMDAwMCkpKTtcblxuXHRcdGlmIChtc2cudHlwZSAhPT0gJ3NpZ24nIHx8IHR5cGVvZiBtc2cuZGF0YSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IGVycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgaGFuZHNoYWtlIG1lc3NhZ2UnKTtcblx0XHRcdGVycm9yLmNvZGUgPSAnVlNDT0RFX0NPTk5FQ1RJT05fRVJST1InO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gNC82LiByZWNlaXZlZCBTaWduUmVxdWVzdCBjb250cm9sIG1lc3NhZ2UuYCk7XG5cblx0XHRjb25zdCBpc1ZhbGlkID0gYXdhaXQgcmFjZVdpdGhUaW1lb3V0Q2FuY2VsbGF0aW9uKG9wdGlvbnMuc2lnblNlcnZpY2UudmFsaWRhdGUobWVzc2FnZSwgbXNnLnNpZ25lZERhdGEpLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdGlmICghaXNWYWxpZCkge1xuXHRcdFx0Y29uc3QgZXJyb3I6IGFueSA9IG5ldyBFcnJvcignUmVmdXNlZCB0byBjb25uZWN0IHRvIHVuc3VwcG9ydGVkIHNlcnZlcicpO1xuXHRcdFx0ZXJyb3IuY29kZSA9ICdWU0NPREVfQ09OTkVDVElPTl9FUlJPUic7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRjb25zdCBzaWduZWQgPSBhd2FpdCByYWNlV2l0aFRpbWVvdXRDYW5jZWxsYXRpb24ob3B0aW9ucy5zaWduU2VydmljZS5zaWduKG1zZy5kYXRhKSwgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0XHRjb25zdCBjb25uVHlwZVJlcXVlc3Q6IENvbm5lY3Rpb25UeXBlUmVxdWVzdCA9IHtcblx0XHRcdHR5cGU6ICdjb25uZWN0aW9uVHlwZScsXG5cdFx0XHRjb21taXQ6IG9wdGlvbnMuY29tbWl0LFxuXHRcdFx0c2lnbmVkRGF0YTogc2lnbmVkLFxuXHRcdFx0ZGVzaXJlZENvbm5lY3Rpb25UeXBlOiBjb25uZWN0aW9uVHlwZVxuXHRcdH07XG5cdFx0aWYgKGFyZ3MpIHtcblx0XHRcdGNvbm5UeXBlUmVxdWVzdC5hcmdzID0gYXJncztcblx0XHR9XG5cblx0XHRvcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSA1LzYuIHNlbmRpbmcgQ29ubmVjdGlvblR5cGVSZXF1ZXN0IGNvbnRyb2wgbWVzc2FnZS5gKTtcblx0XHRwcm90b2NvbC5zZW5kQ29udHJvbChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGNvbm5UeXBlUmVxdWVzdCkpKTtcblxuXHRcdHJldHVybiB7IHByb3RvY29sLCBvd25zUHJvdG9jb2wgfTtcblxuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSAnRVRJTUVET1VUJykge1xuXHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gdGhlIGhhbmRzaGFrZSB0aW1lZCBvdXQuIEVycm9yOmApO1xuXHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0aWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09ICdWU0NPREVfQ09OTkVDVElPTl9FUlJPUicpIHtcblx0XHRcdG9wdGlvbnMubG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IHJlY2VpdmVkIGVycm9yIGNvbnRyb2wgbWVzc2FnZSB3aGVuIG5lZ290aWF0aW5nIGNvbm5lY3Rpb24uIEVycm9yOmApO1xuXHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0aWYgKG93bnNQcm90b2NvbCkge1xuXHRcdFx0c2FmZURpc3Bvc2VQcm90b2NvbEFuZFNvY2tldChwcm90b2NvbCk7XG5cdFx0fVxuXHRcdHRocm93IGVycm9yO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTWFuYWdlbWVudENvbm5lY3Rpb25SZXN1bHQge1xuXHRwcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjb25uZWN0VG9SZW1vdGVFeHRlbnNpb25Ib3N0QWdlbnRBbmRSZWFkT25lTWVzc2FnZTxUPihvcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnMsIGNvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSwgYXJnczogYW55IHwgdW5kZWZpbmVkLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2w7IGZpcnN0TWVzc2FnZTogVCB9PiB7XG5cdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdGNvbnN0IGxvZ1ByZWZpeCA9IGNvbm5lY3RMb2dQcmVmaXgob3B0aW9ucywgY29ubmVjdGlvblR5cGUpO1xuXHRjb25zdCB7IHByb3RvY29sLCBvd25zUHJvdG9jb2wgfSA9IGF3YWl0IGNvbm5lY3RUb1JlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudChvcHRpb25zLCBjb25uZWN0aW9uVHlwZSwgYXJncywgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2VXaXRoVGltZW91dDx7IHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2w7IGZpcnN0TWVzc2FnZTogVCB9Pih0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRyZXN1bHQucmVnaXN0ZXJEaXNwb3NhYmxlKHByb3RvY29sLm9uQ29udHJvbE1lc3NhZ2UocmF3ID0+IHtcblx0XHRjb25zdCBtc2c6IFQgPSBKU09OLnBhcnNlKHJhdy50b1N0cmluZygpKTtcblx0XHRjb25zdCBlcnJvciA9IGdldEVycm9yRnJvbU1lc3NhZ2UobXNnKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdG9wdGlvbnMubG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IHJlY2VpdmVkIGVycm9yIGNvbnRyb2wgbWVzc2FnZSB3aGVuIG5lZ290aWF0aW5nIGNvbm5lY3Rpb24uIEVycm9yOmApO1xuXHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdGlmIChvd25zUHJvdG9jb2wpIHtcblx0XHRcdFx0c2FmZURpc3Bvc2VQcm90b2NvbEFuZFNvY2tldChwcm90b2NvbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucmVqZWN0KGVycm9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3B0aW9ucy5yZWNvbm5lY3Rpb25Qcm90b2NvbD8uZW5kQWNjZXB0UmVjb25uZWN0aW9uKCk7XG5cdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSA2LzYuIGhhbmRzaGFrZSBmaW5pc2hlZCwgY29ubmVjdGlvbiBpcyB1cCBhbmQgcnVubmluZyBhZnRlciAke2xvZ0VsYXBzZWQoc3RhcnRUaW1lKX0hYCk7XG5cdFx0XHRyZXN1bHQucmVzb2x2ZSh7IHByb3RvY29sLCBmaXJzdE1lc3NhZ2U6IG1zZyB9KTtcblx0XHR9XG5cdH0pKTtcblx0cmV0dXJuIHJlc3VsdC5wcm9taXNlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkb0Nvbm5lY3RSZW1vdGVBZ2VudE1hbmFnZW1lbnQob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWFuYWdlbWVudENvbm5lY3Rpb25SZXN1bHQ+IHtcblx0Y29uc3QgeyBwcm90b2NvbCB9ID0gYXdhaXQgY29ubmVjdFRvUmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50QW5kUmVhZE9uZU1lc3NhZ2Uob3B0aW9ucywgQ29ubmVjdGlvblR5cGUuTWFuYWdlbWVudCwgdW5kZWZpbmVkLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRyZXR1cm4geyBwcm90b2NvbCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMge1xuXHRsYW5ndWFnZTogc3RyaW5nO1xuXHRkZWJ1Z0lkPzogc3RyaW5nO1xuXHRicmVhaz86IGJvb2xlYW47XG5cdHBvcnQ/OiBudW1iZXIgfCBudWxsO1xuXHRlbnY/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfTtcbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25Ib3N0Q29ubmVjdGlvblJlc3VsdCB7XG5cdHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2w7XG5cdGRlYnVnUG9ydD86IG51bWJlcjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9Db25uZWN0UmVtb3RlQWdlbnRFeHRlbnNpb25Ib3N0KG9wdGlvbnM6IElTaW1wbGVDb25uZWN0aW9uT3B0aW9ucywgc3RhcnRBcmd1bWVudHM6IElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25Ib3N0Q29ubmVjdGlvblJlc3VsdD4ge1xuXHRjb25zdCB7IHByb3RvY29sLCBmaXJzdE1lc3NhZ2UgfSA9IGF3YWl0IGNvbm5lY3RUb1JlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudEFuZFJlYWRPbmVNZXNzYWdlPHsgZGVidWdQb3J0PzogbnVtYmVyIH0+KG9wdGlvbnMsIENvbm5lY3Rpb25UeXBlLkV4dGVuc2lvbkhvc3QsIHN0YXJ0QXJndW1lbnRzLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRjb25zdCBkZWJ1Z1BvcnQgPSBmaXJzdE1lc3NhZ2UgJiYgZmlyc3RNZXNzYWdlLmRlYnVnUG9ydDtcblx0cmV0dXJuIHsgcHJvdG9jb2wsIGRlYnVnUG9ydCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUdW5uZWxDb25uZWN0aW9uU3RhcnRQYXJhbXMge1xuXHRob3N0OiBzdHJpbmc7XG5cdHBvcnQ6IG51bWJlcjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9Db25uZWN0UmVtb3RlQWdlbnRUdW5uZWwob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCBzdGFydFBhcmFtczogSVR1bm5lbENvbm5lY3Rpb25TdGFydFBhcmFtcywgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UGVyc2lzdGVudFByb3RvY29sPiB7XG5cdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdGNvbnN0IGxvZ1ByZWZpeCA9IGNvbm5lY3RMb2dQcmVmaXgob3B0aW9ucywgQ29ubmVjdGlvblR5cGUuVHVubmVsKTtcblx0Y29uc3QgeyBwcm90b2NvbCB9ID0gYXdhaXQgY29ubmVjdFRvUmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50QW5kUmVhZE9uZU1lc3NhZ2Uob3B0aW9ucywgQ29ubmVjdGlvblR5cGUuVHVubmVsLCBzdGFydFBhcmFtcywgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0b3B0aW9ucy5sb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gNi82LiBoYW5kc2hha2UgZmluaXNoZWQsIGNvbm5lY3Rpb24gaXMgdXAgYW5kIHJ1bm5pbmcgYWZ0ZXIgJHtsb2dFbGFwc2VkKHN0YXJ0VGltZSl9IWApO1xuXHRyZXR1cm4gcHJvdG9jb2w7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbm5lY3Rpb25PcHRpb25zPFQgZXh0ZW5kcyBSZW1vdGVDb25uZWN0aW9uID0gUmVtb3RlQ29ubmVjdGlvbj4ge1xuXHRjb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRhZGRyZXNzUHJvdmlkZXI6IElBZGRyZXNzUHJvdmlkZXI8VD47XG5cdHJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlOiBJUmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2U7XG5cdHNpZ25TZXJ2aWNlOiBJU2lnblNlcnZpY2U7XG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRpcGNMb2dnZXI6IElJUENMb2dnZXIgfCBudWxsO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQ29ubmVjdGlvbk9wdGlvbnM8VCBleHRlbmRzIFJlbW90ZUNvbm5lY3Rpb24+KG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9uczxUPiwgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZywgcmVjb25uZWN0aW9uUHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCB8IG51bGwpOiBQcm9taXNlPElTaW1wbGVDb25uZWN0aW9uT3B0aW9uczxUPj4ge1xuXHRjb25zdCB7IGNvbm5lY3RUbywgY29ubmVjdGlvblRva2VuIH0gPSBhd2FpdCBvcHRpb25zLmFkZHJlc3NQcm92aWRlci5nZXRBZGRyZXNzKCk7XG5cdHJldHVybiB7XG5cdFx0Y29tbWl0OiBvcHRpb25zLmNvbW1pdCxcblx0XHRxdWFsaXR5OiBvcHRpb25zLnF1YWxpdHksXG5cdFx0Y29ubmVjdFRvLFxuXHRcdGNvbm5lY3Rpb25Ub2tlbjogY29ubmVjdGlvblRva2VuLFxuXHRcdHJlY29ubmVjdGlvblRva2VuOiByZWNvbm5lY3Rpb25Ub2tlbixcblx0XHRyZWNvbm5lY3Rpb25Qcm90b2NvbDogcmVjb25uZWN0aW9uUHJvdG9jb2wsXG5cdFx0cmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2U6IG9wdGlvbnMucmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UsXG5cdFx0c2lnblNlcnZpY2U6IG9wdGlvbnMuc2lnblNlcnZpY2UsXG5cdFx0bG9nU2VydmljZTogb3B0aW9ucy5sb2dTZXJ2aWNlXG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFkZHJlc3M8VCBleHRlbmRzIFJlbW90ZUNvbm5lY3Rpb24gPSBSZW1vdGVDb25uZWN0aW9uPiB7XG5cdGNvbm5lY3RUbzogVDtcblx0Y29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFkZHJlc3NQcm92aWRlcjxUIGV4dGVuZHMgUmVtb3RlQ29ubmVjdGlvbiA9IFJlbW90ZUNvbm5lY3Rpb24+IHtcblx0Z2V0QWRkcmVzcygpOiBQcm9taXNlPElBZGRyZXNzPFQ+Pjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RSZW1vdGVBZ2VudE1hbmFnZW1lbnQob3B0aW9uczogSUNvbm5lY3Rpb25PcHRpb25zLCByZW1vdGVBdXRob3JpdHk6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8TWFuYWdlbWVudFBlcnNpc3RlbnRDb25uZWN0aW9uPiB7XG5cdHJldHVybiBjcmVhdGVJbml0aWFsQ29ubmVjdGlvbihcblx0XHRvcHRpb25zLFxuXHRcdGFzeW5jIChzaW1wbGVPcHRpb25zKSA9PiB7XG5cdFx0XHRjb25zdCB7IHByb3RvY29sIH0gPSBhd2FpdCBkb0Nvbm5lY3RSZW1vdGVBZ2VudE1hbmFnZW1lbnQoc2ltcGxlT3B0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hbmFnZW1lbnRQZXJzaXN0ZW50Q29ubmVjdGlvbihvcHRpb25zLCByZW1vdGVBdXRob3JpdHksIGNsaWVudElkLCBzaW1wbGVPcHRpb25zLnJlY29ubmVjdGlvblRva2VuLCBwcm90b2NvbCk7XG5cdFx0fVxuXHQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29ubmVjdFJlbW90ZUFnZW50RXh0ZW5zaW9uSG9zdChvcHRpb25zOiBJQ29ubmVjdGlvbk9wdGlvbnMsIHN0YXJ0QXJndW1lbnRzOiBJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zKTogUHJvbWlzZTxFeHRlbnNpb25Ib3N0UGVyc2lzdGVudENvbm5lY3Rpb24+IHtcblx0cmV0dXJuIGNyZWF0ZUluaXRpYWxDb25uZWN0aW9uKFxuXHRcdG9wdGlvbnMsXG5cdFx0YXN5bmMgKHNpbXBsZU9wdGlvbnMpID0+IHtcblx0XHRcdGNvbnN0IHsgcHJvdG9jb2wsIGRlYnVnUG9ydCB9ID0gYXdhaXQgZG9Db25uZWN0UmVtb3RlQWdlbnRFeHRlbnNpb25Ib3N0KHNpbXBsZU9wdGlvbnMsIHN0YXJ0QXJndW1lbnRzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHJldHVybiBuZXcgRXh0ZW5zaW9uSG9zdFBlcnNpc3RlbnRDb25uZWN0aW9uKG9wdGlvbnMsIHN0YXJ0QXJndW1lbnRzLCBzaW1wbGVPcHRpb25zLnJlY29ubmVjdGlvblRva2VuLCBwcm90b2NvbCwgZGVidWdQb3J0KTtcblx0XHR9XG5cdCk7XG59XG5cbi8qKlxuICogV2lsbCBhdHRlbXB0IHRvIGNvbm5lY3QgNSB0aW1lcy4gSWYgaXQgZmFpbHMgNSBjb25zZWN1dGl2ZSB0aW1lcywgaXQgd2lsbCBnaXZlIHVwLlxuICovXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVJbml0aWFsQ29ubmVjdGlvbjxUIGV4dGVuZHMgUGVyc2lzdGVudENvbm5lY3Rpb24sIE8gZXh0ZW5kcyBSZW1vdGVDb25uZWN0aW9uPihvcHRpb25zOiBJQ29ubmVjdGlvbk9wdGlvbnM8Tz4sIGNvbm5lY3Rpb25GYWN0b3J5OiAoc2ltcGxlT3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zPE8+KSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdGNvbnN0IE1BWF9BVFRFTVBUUyA9IDU7XG5cblx0Zm9yIChsZXQgYXR0ZW1wdCA9IDE7IDsgYXR0ZW1wdCsrKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlY29ubmVjdGlvblRva2VuID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRjb25zdCBzaW1wbGVPcHRpb25zID0gYXdhaXQgcmVzb2x2ZUNvbm5lY3Rpb25PcHRpb25zKG9wdGlvbnMsIHJlY29ubmVjdGlvblRva2VuLCBudWxsKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb25GYWN0b3J5KHNpbXBsZU9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChhdHRlbXB0IDwgTUFYX0FUVEVNUFRTKSB7XG5cdFx0XHRcdG9wdGlvbnMubG9nU2VydmljZS5lcnJvcihgW3JlbW90ZS1jb25uZWN0aW9uXVthdHRlbXB0ICR7YXR0ZW1wdH1dIEFuIGVycm9yIG9jY3VycmVkIGluIGluaXRpYWwgY29ubmVjdGlvbiEgV2lsbCByZXRyeS4uLiBFcnJvcjpgKTtcblx0XHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYFtyZW1vdGUtY29ubmVjdGlvbl1bYXR0ZW1wdCAke2F0dGVtcHR9XSAgQW4gZXJyb3Igb2NjdXJyZWQgaW4gaW5pdGlhbCBjb25uZWN0aW9uISBJdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYSBwZXJtYW5lbnQgZXJyb3IuIEVycm9yOmApO1xuXHRcdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0UGVyc2lzdGVudENvbm5lY3Rpb24udHJpZ2dlclBlcm1hbmVudEZhaWx1cmUoMCwgMCwgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc0hhbmRsZWQoZXJyKSk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RSZW1vdGVBZ2VudFR1bm5lbChvcHRpb25zOiBJQ29ubmVjdGlvbk9wdGlvbnMsIHR1bm5lbFJlbW90ZUhvc3Q6IHN0cmluZywgdHVubmVsUmVtb3RlUG9ydDogbnVtYmVyKTogUHJvbWlzZTxQZXJzaXN0ZW50UHJvdG9jb2w+IHtcblx0Y29uc3Qgc2ltcGxlT3B0aW9ucyA9IGF3YWl0IHJlc29sdmVDb25uZWN0aW9uT3B0aW9ucyhvcHRpb25zLCBnZW5lcmF0ZVV1aWQoKSwgbnVsbCk7XG5cdGNvbnN0IHByb3RvY29sID0gYXdhaXQgZG9Db25uZWN0UmVtb3RlQWdlbnRUdW5uZWwoc2ltcGxlT3B0aW9ucywgeyBob3N0OiB0dW5uZWxSZW1vdGVIb3N0LCBwb3J0OiB0dW5uZWxSZW1vdGVQb3J0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRyZXR1cm4gcHJvdG9jb2w7XG59XG5cbmZ1bmN0aW9uIHNsZWVwKHNlY29uZHM6IG51bWJlcik6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHtcblx0cmV0dXJuIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQocmVzb2x2ZSwgc2Vjb25kcyAqIDEwMDApO1xuXHRcdFx0dG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUge1xuXHRDb25uZWN0aW9uTG9zdCxcblx0UmVjb25uZWN0aW9uV2FpdCxcblx0UmVjb25uZWN0aW9uUnVubmluZyxcblx0UmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZSxcblx0Q29ubmVjdGlvbkdhaW5cbn1cbmV4cG9ydCBjbGFzcyBDb25uZWN0aW9uTG9zdEV2ZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5Db25uZWN0aW9uTG9zdDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyXG5cdCkgeyB9XG59XG5leHBvcnQgY2xhc3MgUmVjb25uZWN0aW9uV2FpdEV2ZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5SZWNvbm5lY3Rpb25XYWl0O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGR1cmF0aW9uU2Vjb25kczogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FuY2VsbGFibGVUaW1lcjogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD5cblx0KSB7IH1cblxuXHRwdWJsaWMgc2tpcFdhaXQoKTogdm9pZCB7XG5cdFx0dGhpcy5jYW5jZWxsYWJsZVRpbWVyLmNhbmNlbCgpO1xuXHR9XG59XG5leHBvcnQgY2xhc3MgUmVjb25uZWN0aW9uUnVubmluZ0V2ZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5SZWNvbm5lY3Rpb25SdW5uaW5nO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGF0dGVtcHQ6IG51bWJlclxuXHQpIHsgfVxufVxuZXhwb3J0IGNsYXNzIENvbm5lY3Rpb25HYWluRXZlbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLkNvbm5lY3Rpb25HYWluO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGF0dGVtcHQ6IG51bWJlclxuXHQpIHsgfVxufVxuZXhwb3J0IGNsYXNzIFJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVFdmVudCB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBhdHRlbXB0OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGhhbmRsZWQ6IGJvb2xlYW5cblx0KSB7IH1cbn1cbmV4cG9ydCB0eXBlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnQgPSBDb25uZWN0aW9uR2FpbkV2ZW50IHwgQ29ubmVjdGlvbkxvc3RFdmVudCB8IFJlY29ubmVjdGlvbldhaXRFdmVudCB8IFJlY29ubmVjdGlvblJ1bm5pbmdFdmVudCB8IFJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVFdmVudDtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFBlcnNpc3RlbnRDb25uZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHN0YXRpYyB0cmlnZ2VyUGVybWFuZW50RmFpbHVyZShtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlciwgYXR0ZW1wdDogbnVtYmVyLCBoYW5kbGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVybWFuZW50RmFpbHVyZSA9IHRydWU7XG5cdFx0dGhpcy5fcGVybWFuZW50RmFpbHVyZU1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSA9IG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTtcblx0XHR0aGlzLl9wZXJtYW5lbnRGYWlsdXJlQXR0ZW1wdCA9IGF0dGVtcHQ7XG5cdFx0dGhpcy5fcGVybWFuZW50RmFpbHVyZUhhbmRsZWQgPSBoYW5kbGVkO1xuXHRcdHRoaXMuX2luc3RhbmNlcy5mb3JFYWNoKGluc3RhbmNlID0+IGluc3RhbmNlLl9nb3RvUGVybWFuZW50RmFpbHVyZSh0aGlzLl9wZXJtYW5lbnRGYWlsdXJlTWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLCB0aGlzLl9wZXJtYW5lbnRGYWlsdXJlQXR0ZW1wdCwgdGhpcy5fcGVybWFuZW50RmFpbHVyZUhhbmRsZWQpKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVidWdUcmlnZ2VyUmVjb25uZWN0aW9uKCkge1xuXHRcdHRoaXMuX2luc3RhbmNlcy5mb3JFYWNoKGluc3RhbmNlID0+IGluc3RhbmNlLl9iZWdpblJlY29ubmVjdGluZygpKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVidWdQYXVzZVNvY2tldFdyaXRpbmcoKSB7XG5cdFx0dGhpcy5faW5zdGFuY2VzLmZvckVhY2goaW5zdGFuY2UgPT4gaW5zdGFuY2UuX3BhdXNlU29ja2V0V3JpdGluZygpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9wZXJtYW5lbnRGYWlsdXJlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgc3RhdGljIF9wZXJtYW5lbnRGYWlsdXJlTWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHN0YXRpYyBfcGVybWFuZW50RmFpbHVyZUF0dGVtcHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc3RhdGljIF9wZXJtYW5lbnRGYWlsdXJlSGFuZGxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHN0YXRpYyBfaW5zdGFuY2VzOiBQZXJzaXN0ZW50Q29ubmVjdGlvbltdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGF0ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRTdGF0ZUNoYW5nZSA9IHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcGVybWFuZW50RmFpbHVyZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGdldCBfaXNQZXJtYW5lbnRGYWlsdXJlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wZXJtYW5lbnRGYWlsdXJlIHx8IFBlcnNpc3RlbnRDb25uZWN0aW9uLl9wZXJtYW5lbnRGYWlsdXJlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSZWNvbm5lY3Rpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9yZWNvbm5lY3Rpb25HcmFjZVRpbWU6IG51bWJlciA9IFByb3RvY29sQ29uc3RhbnRzLlJlY29ubmVjdGlvbkdyYWNlVGltZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uVHlwZTogQ29ubmVjdGlvblR5cGUsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vcHRpb25zOiBJQ29ubmVjdGlvbk9wdGlvbnMsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25uZWN0aW9uRmFpbHVyZUlzRmF0YWw6IGJvb2xlYW5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXG5cdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKG5ldyBDb25uZWN0aW9uR2FpbkV2ZW50KHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIDAsIDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb3RvY29sLm9uU29ja2V0Q2xvc2UoKGUpID0+IHtcblx0XHRcdGNvbnN0IGxvZ1ByZWZpeCA9IGNvbW1vbkxvZ1ByZWZpeCh0aGlzLl9jb25uZWN0aW9uVHlwZSwgdGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgdHJ1ZSk7XG5cdFx0XHRpZiAoIWUpIHtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSByZWNlaXZlZCBzb2NrZXQgY2xvc2UgZXZlbnQuYCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUudHlwZSA9PT0gU29ja2V0Q2xvc2VFdmVudFR5cGUuTm9kZVNvY2tldENsb3NlRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSByZWNlaXZlZCBzb2NrZXQgY2xvc2UgZXZlbnQgKGhhZEVycm9yOiAke2UuaGFkRXJyb3J9KS5gKTtcblx0XHRcdFx0aWYgKGUuZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZS5lcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gcmVjZWl2ZWQgc29ja2V0IGNsb3NlIGV2ZW50ICh3YXNDbGVhbjogJHtlLndhc0NsZWFufSwgY29kZTogJHtlLmNvZGV9LCByZWFzb246ICR7ZS5yZWFzb259KS5gKTtcblx0XHRcdFx0aWYgKGUuZXZlbnQpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZS5ldmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2JlZ2luUmVjb25uZWN0aW5nKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb3RvY29sLm9uU29ja2V0VGltZW91dCgoZSkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nUHJlZml4ID0gY29tbW9uTG9nUHJlZml4KHRoaXMuX2Nvbm5lY3Rpb25UeXBlLCB0aGlzLnJlY29ubmVjdGlvblRva2VuLCB0cnVlKTtcblx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gcmVjZWl2ZWQgc29ja2V0IHRpbWVvdXQgZXZlbnQgKHJlYXNvbjogJHtlLnJlYXNvbn0sIHVuYWNrbm93bGVkZ2VkTXNnQ291bnQ6ICR7ZS51bmFja25vd2xlZGdlZE1zZ0NvdW50fSwgdGltZVNpbmNlT2xkZXN0VW5hY2tub3dsZWRnZWRNc2c6ICR7ZS50aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZ30sIHRpbWVTaW5jZUxhc3RSZWNlaXZlZFNvbWVEYXRhOiAke2UudGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGF9KS5gKTtcblx0XHRcdHRoaXMuX2JlZ2luUmVjb25uZWN0aW5nKCk7XG5cdFx0fSkpO1xuXG5cdFx0UGVyc2lzdGVudENvbm5lY3Rpb24uX2luc3RhbmNlcy5wdXNoKHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBteUluZGV4ID0gUGVyc2lzdGVudENvbm5lY3Rpb24uX2luc3RhbmNlcy5pbmRleE9mKHRoaXMpO1xuXHRcdFx0aWYgKG15SW5kZXggPj0gMCkge1xuXHRcdFx0XHRQZXJzaXN0ZW50Q29ubmVjdGlvbi5faW5zdGFuY2VzLnNwbGljZShteUluZGV4LCAxKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5faXNQZXJtYW5lbnRGYWlsdXJlKSB7XG5cdFx0XHR0aGlzLl9nb3RvUGVybWFuZW50RmFpbHVyZShQZXJzaXN0ZW50Q29ubmVjdGlvbi5fcGVybWFuZW50RmFpbHVyZU1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSwgUGVyc2lzdGVudENvbm5lY3Rpb24uX3Blcm1hbmVudEZhaWx1cmVBdHRlbXB0LCBQZXJzaXN0ZW50Q29ubmVjdGlvbi5fcGVybWFuZW50RmFpbHVyZUhhbmRsZWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVHcmFjZVRpbWUoZ3JhY2VUaW1lOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBzYW5pdGl6ZWRHcmFjZSA9IHNhbml0aXplR3JhY2VUaW1lKGdyYWNlVGltZSwgUHJvdG9jb2xDb25zdGFudHMuUmVjb25uZWN0aW9uR3JhY2VUaW1lKTtcblx0XHRjb25zdCBsb2dQcmVmaXggPSBjb21tb25Mb2dQcmVmaXgodGhpcy5fY29ubmVjdGlvblR5cGUsIHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIGZhbHNlKTtcblx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSBBcHBseWluZyByZWNvbm5lY3Rpb24gZ3JhY2UgdGltZTogJHtzYW5pdGl6ZWRHcmFjZX1tcyAoJHtNYXRoLmZsb29yKHNhbml0aXplZEdyYWNlIC8gMTAwMCl9cylgKTtcblx0XHR0aGlzLl9yZWNvbm5lY3Rpb25HcmFjZVRpbWUgPSBzYW5pdGl6ZWRHcmFjZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2JlZ2luUmVjb25uZWN0aW5nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE9ubHkgaGF2ZSBvbmUgcmVjb25uZWN0aW9uIGxvb3AgYWN0aXZlIGF0IGEgdGltZS5cblx0XHRpZiAodGhpcy5faXNSZWNvbm5lY3RpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzUmVjb25uZWN0aW5nID0gdHJ1ZTtcblx0XHRcdGF3YWl0IHRoaXMuX3J1blJlY29ubmVjdGluZ0xvb3AoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNSZWNvbm5lY3RpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5SZWNvbm5lY3RpbmdMb29wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pc1Blcm1hbmVudEZhaWx1cmUgfHwgdGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0Ly8gbm8gbW9yZSBhdHRlbXB0cyFcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbG9nUHJlZml4ID0gY29tbW9uTG9nUHJlZml4KHRoaXMuX2Nvbm5lY3Rpb25UeXBlLCB0aGlzLnJlY29ubmVjdGlvblRva2VuLCB0cnVlKTtcblx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IHN0YXJ0aW5nIHJlY29ubmVjdGluZyBsb29wLiBZb3UgY2FuIGdldCBtb3JlIGluZm9ybWF0aW9uIHdpdGggdGhlIHRyYWNlIGxvZyBsZXZlbC5gKTtcblx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmZpcmUobmV3IENvbm5lY3Rpb25Mb3N0RXZlbnQodGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgdGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSkpO1xuXHRcdGNvbnN0IFRJTUVTID0gWzAsIDUsIDUsIDEwLCAxMCwgMTAsIDEwLCAxMCwgMzBdO1xuXHRcdGNvbnN0IGdyYWNlVGltZSA9IHRoaXMuX3JlY29ubmVjdGlvbkdyYWNlVGltZTtcblx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IHN0YXJ0aW5nIHJlY29ubmVjdGlvbiB3aXRoIGdyYWNlIHRpbWU6ICR7Z3JhY2VUaW1lfW1zICgke01hdGguZmxvb3IoZ3JhY2VUaW1lIC8gMTAwMCl9cylgKTtcblx0XHRpZiAoZ3JhY2VUaW1lIDw9IDApIHtcblx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IHJlY29ubmVjdGlvbiBncmFjZSB0aW1lIGlzIHNldCB0byAwbXMsIHdpbGwgbm90IGF0dGVtcHQgdG8gcmVjb25uZWN0LmApO1xuXHRcdFx0dGhpcy5fb25SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlKHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIDAsIGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbG9vcFN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0bGV0IGF0dGVtcHQgPSAtMTtcblx0XHRkbyB7XG5cdFx0XHRhdHRlbXB0Kys7XG5cdFx0XHRjb25zdCB3YWl0VGltZSA9IChhdHRlbXB0IDwgVElNRVMubGVuZ3RoID8gVElNRVNbYXR0ZW1wdF0gOiBUSU1FU1tUSU1FUy5sZW5ndGggLSAxXSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAod2FpdFRpbWUgPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2xlZXBQcm9taXNlID0gc2xlZXAod2FpdFRpbWUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShuZXcgUmVjb25uZWN0aW9uV2FpdEV2ZW50KHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIHdhaXRUaW1lLCBzbGVlcFByb21pc2UpKTtcblxuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gd2FpdGluZyBmb3IgJHt3YWl0VGltZX0gc2Vjb25kcyBiZWZvcmUgcmVjb25uZWN0aW5nLi4uYCk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHNsZWVwUHJvbWlzZTtcblx0XHRcdFx0XHR9IGNhdGNoIHsgfSAvLyBVc2VyIGNhbmNlbGVkIHRpbWVyXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5faXNQZXJtYW5lbnRGYWlsdXJlKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gcGVybWFuZW50IGZhaWx1cmUgb2NjdXJyZWQgd2hpbGUgcnVubmluZyB0aGUgcmVjb25uZWN0aW5nIGxvb3AuYCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBjb25uZWN0aW9uIHdhcyBsb3N0LCBsZXQncyB0cnkgdG8gcmUtZXN0YWJsaXNoIGl0XG5cdFx0XHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShuZXcgUmVjb25uZWN0aW9uUnVubmluZ0V2ZW50KHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIGF0dGVtcHQgKyAxKSk7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gcmVzb2x2aW5nIGNvbm5lY3Rpb24uLi5gKTtcblx0XHRcdFx0Y29uc3Qgc2ltcGxlT3B0aW9ucyA9IGF3YWl0IHJlc29sdmVDb25uZWN0aW9uT3B0aW9ucyh0aGlzLl9vcHRpb25zLCB0aGlzLnJlY29ubmVjdGlvblRva2VuLCB0aGlzLnByb3RvY29sKTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSBjb25uZWN0aW5nIHRvICR7c2ltcGxlT3B0aW9ucy5jb25uZWN0VG99Li4uYCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlY29ubmVjdChzaW1wbGVPcHRpb25zLCBjcmVhdGVUaW1lb3V0Q2FuY2VsbGF0aW9uKFJFQ09OTkVDVF9USU1FT1VUKSk7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gcmVjb25uZWN0ZWQhYCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShuZXcgQ29ubmVjdGlvbkdhaW5FdmVudCh0aGlzLnJlY29ubmVjdGlvblRva2VuLCB0aGlzLnByb3RvY29sLmdldE1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSgpLCBhdHRlbXB0ICsgMSkpO1xuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmIChlcnIuY29kZSA9PT0gJ1ZTQ09ERV9DT05ORUNUSU9OX0VSUk9SJykge1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IEEgcGVybWFuZW50IGVycm9yIG9jY3VycmVkIGluIHRoZSByZWNvbm5lY3RpbmcgbG9vcCEgV2lsbCBnaXZlIHVwIG5vdyEgRXJyb3I6YCk7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhpcy5fb25SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlKHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIGF0dGVtcHQgKyAxLCBmYWxzZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKERhdGUubm93KCkgLSBsb29wU3RhcnRUaW1lID49IGdyYWNlVGltZSkge1xuXHRcdFx0XHRcdGNvbnN0IGdyYWNlU2Vjb25kcyA9IE1hdGgucm91bmQoZ3JhY2VUaW1lIC8gMTAwMCk7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcmVjb25uZWN0aW5nLCBidXQgaXQgd2lsbCBiZSB0cmVhdGVkIGFzIGEgcGVybWFuZW50IGVycm9yIGJlY2F1c2UgdGhlIHJlY29ubmVjdGlvbiBncmFjZSB0aW1lICgke2dyYWNlU2Vjb25kc31zKSBoYXMgZXhwaXJlZCEgV2lsbCBnaXZlIHVwIG5vdyEgRXJyb3I6YCk7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhpcy5fb25SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlKHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIGF0dGVtcHQgKyAxLCBmYWxzZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IuaXNUZW1wb3JhcmlseU5vdEF2YWlsYWJsZShlcnIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSBBIHRlbXBvcmFyaWx5IG5vdCBhdmFpbGFibGUgZXJyb3Igb2NjdXJyZWQgd2hpbGUgdHJ5aW5nIHRvIHJlY29ubmVjdCwgd2lsbCB0cnkgYWdhaW4uLi5gKTtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoZXJyKTtcblx0XHRcdFx0XHQvLyB0cnkgYWdhaW4hXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChlcnIuY29kZSA9PT0gJ0VUSU1FRE9VVCcgfHwgZXJyLmNvZGUgPT09ICdFTkVUVU5SRUFDSCcgfHwgZXJyLmNvZGUgPT09ICdFQ09OTlJFRlVTRUQnIHx8IGVyci5jb2RlID09PSAnRUNPTk5SRVNFVCcpICYmIGVyci5zeXNjYWxsID09PSAnY29ubmVjdCcpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IEEgbmV0d29yayBlcnJvciBvY2N1cnJlZCB3aGlsZSB0cnlpbmcgdG8gcmVjb25uZWN0LCB3aWxsIHRyeSBhZ2Fpbi4uLmApO1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS50cmFjZShlcnIpO1xuXHRcdFx0XHRcdC8vIHRyeSBhZ2FpbiFcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSBBIHByb21pc2UgY2FuY2VsYXRpb24gZXJyb3Igb2NjdXJyZWQgd2hpbGUgdHJ5aW5nIHRvIHJlY29ubmVjdCwgd2lsbCB0cnkgYWdhaW4uLi5gKTtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoZXJyKTtcblx0XHRcdFx0XHQvLyB0cnkgYWdhaW4hXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSBBIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3Igb2NjdXJyZWQgd2hpbGUgdHJ5aW5nIHRvIHJlY29ubmVjdC4gV2lsbCBnaXZlIHVwIG5vdyEgRXJyb3I6YCk7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0dGhpcy5fb25SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlKHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIGF0dGVtcHQgKyAxLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLmlzSGFuZGxlZChlcnIpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSBBbiB1bmtub3duIGVycm9yIG9jY3VycmVkIHdoaWxlIHRyeWluZyB0byByZWNvbm5lY3QsIHNpbmNlIHRoaXMgaXMgYW4gdW5rbm93biBjYXNlLCBpdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYSBwZXJtYW5lbnQgZXJyb3IhIFdpbGwgZ2l2ZSB1cCBub3chIEVycm9yOmApO1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0dGhpcy5fb25SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlKHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIGF0dGVtcHQgKyAxLCBmYWxzZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKCF0aGlzLl9pc1Blcm1hbmVudEZhaWx1cmUgJiYgIXRoaXMuX2lzRGlzcG9zZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlKG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyLCBhdHRlbXB0OiBudW1iZXIsIGhhbmRsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVjb25uZWN0aW9uRmFpbHVyZUlzRmF0YWwpIHtcblx0XHRcdFBlcnNpc3RlbnRDb25uZWN0aW9uLnRyaWdnZXJQZXJtYW5lbnRGYWlsdXJlKG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSwgYXR0ZW1wdCwgaGFuZGxlZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2dvdG9QZXJtYW5lbnRGYWlsdXJlKG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSwgYXR0ZW1wdCwgaGFuZGxlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ290b1Blcm1hbmVudEZhaWx1cmUobWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIsIGF0dGVtcHQ6IG51bWJlciwgaGFuZGxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShuZXcgUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZUV2ZW50KHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSwgYXR0ZW1wdCwgaGFuZGxlZCkpO1xuXHRcdHNhZmVEaXNwb3NlUHJvdG9jb2xBbmRTb2NrZXQodGhpcy5wcm90b2NvbCk7XG5cdH1cblxuXHRwcml2YXRlIF9wYXVzZVNvY2tldFdyaXRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5wcm90b2NvbC5wYXVzZVNvY2tldFdyaXRpbmcoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfcmVjb25uZWN0KG9wdGlvbnM6IElTaW1wbGVDb25uZWN0aW9uT3B0aW9ucywgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VtZW50UGVyc2lzdGVudENvbm5lY3Rpb24gZXh0ZW5kcyBQZXJzaXN0ZW50Q29ubmVjdGlvbiB7XG5cblx0cHVibGljIHJlYWRvbmx5IGNsaWVudDogQ2xpZW50PFJlbW90ZUFnZW50Q29ubmVjdGlvbkNvbnRleHQ+O1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucywgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcsIHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcsIHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wpIHtcblx0XHRzdXBlcihDb25uZWN0aW9uVHlwZS5NYW5hZ2VtZW50LCBvcHRpb25zLCByZWNvbm5lY3Rpb25Ub2tlbiwgcHJvdG9jb2wsIC8qcmVjb25uZWN0aW9uRmFpbHVyZUlzRmF0YWwqL3RydWUpO1xuXHRcdHRoaXMuY2xpZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENsaWVudDxSZW1vdGVBZ2VudENvbm5lY3Rpb25Db250ZXh0Pihwcm90b2NvbCwge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksXG5cdFx0XHRjbGllbnRJZDogY2xpZW50SWRcblx0XHR9LCBvcHRpb25zLmlwY0xvZ2dlcikpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZWNvbm5lY3Qob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgZG9Db25uZWN0UmVtb3RlQWdlbnRNYW5hZ2VtZW50KG9wdGlvbnMsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkhvc3RQZXJzaXN0ZW50Q29ubmVjdGlvbiBleHRlbmRzIFBlcnNpc3RlbnRDb25uZWN0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydEFyZ3VtZW50czogSVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcztcblx0cHVibGljIHJlYWRvbmx5IGRlYnVnUG9ydDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucywgc3RhcnRBcmd1bWVudHM6IElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMsIHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcsIHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wsIGRlYnVnUG9ydDogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0c3VwZXIoQ29ubmVjdGlvblR5cGUuRXh0ZW5zaW9uSG9zdCwgb3B0aW9ucywgcmVjb25uZWN0aW9uVG9rZW4sIHByb3RvY29sLCAvKnJlY29ubmVjdGlvbkZhaWx1cmVJc0ZhdGFsKi9mYWxzZSk7XG5cdFx0dGhpcy5fc3RhcnRBcmd1bWVudHMgPSBzdGFydEFyZ3VtZW50cztcblx0XHR0aGlzLmRlYnVnUG9ydCA9IGRlYnVnUG9ydDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVjb25uZWN0KG9wdGlvbnM6IElTaW1wbGVDb25uZWN0aW9uT3B0aW9ucywgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGRvQ29ubmVjdFJlbW90ZUFnZW50RXh0ZW5zaW9uSG9zdChvcHRpb25zLCB0aGlzLl9zdGFydEFyZ3VtZW50cywgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzYWZlRGlzcG9zZVByb3RvY29sQW5kU29ja2V0KHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wpOiB2b2lkIHtcblx0dHJ5IHtcblx0XHRwcm90b2NvbC5hY2NlcHREaXNjb25uZWN0KCk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gcHJvdG9jb2wuZ2V0U29ja2V0KCk7XG5cdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdHNvY2tldC5kaXNwb3NlKCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RXJyb3JGcm9tTWVzc2FnZShtc2c6IGFueSk6IEVycm9yIHwgbnVsbCB7XG5cdGlmIChtc2cgJiYgbXNnLnR5cGUgPT09ICdlcnJvcicpIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgQ29ubmVjdGlvbiBlcnJvcjogJHttc2cucmVhc29ufWApO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdCg8YW55PmVycm9yKS5jb2RlID0gJ1ZTQ09ERV9DT05ORUNUSU9OX0VSUk9SJztcblx0XHRyZXR1cm4gZXJyb3I7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplR3JhY2VUaW1lKGNhbmRpZGF0ZTogbnVtYmVyLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyIHtcblx0aWYgKHR5cGVvZiBjYW5kaWRhdGUgIT09ICdudW1iZXInIHx8ICFpc0Zpbml0ZShjYW5kaWRhdGUpIHx8IGNhbmRpZGF0ZSA8IDApIHtcblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblx0aWYgKGNhbmRpZGF0ZSA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG5cdFx0cmV0dXJuIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHR9XG5cdHJldHVybiBNYXRoLmZsb29yKGNhbmRpZGF0ZSk7XG59XG5cbmZ1bmN0aW9uIHN0cmluZ1JpZ2h0UGFkKHN0cjogc3RyaW5nLCBsZW46IG51bWJlcik6IHN0cmluZyB7XG5cdHdoaWxlIChzdHIubGVuZ3RoIDwgbGVuKSB7XG5cdFx0c3RyICs9ICcgJztcblx0fVxuXHRyZXR1cm4gc3RyO1xufVxuXG5mdW5jdGlvbiBfY29tbW9uTG9nUHJlZml4KGNvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSwgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgW3JlbW90ZS1jb25uZWN0aW9uXVske3N0cmluZ1JpZ2h0UGFkKGNvbm5lY3Rpb25UeXBlVG9TdHJpbmcoY29ubmVjdGlvblR5cGUpLCAxMyl9XVske3JlY29ubmVjdGlvblRva2VuLnN1YnN0cigwLCA1KX1cdTIwMjZdYDtcbn1cblxuZnVuY3Rpb24gY29tbW9uTG9nUHJlZml4KGNvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSwgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZywgaXNSZWNvbm5lY3Q6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7X2NvbW1vbkxvZ1ByZWZpeChjb25uZWN0aW9uVHlwZSwgcmVjb25uZWN0aW9uVG9rZW4pfVske2lzUmVjb25uZWN0ID8gJ3JlY29ubmVjdCcgOiAnaW5pdGlhbCd9XWA7XG59XG5cbmZ1bmN0aW9uIGNvbm5lY3RMb2dQcmVmaXgob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCBjb25uZWN0aW9uVHlwZTogQ29ubmVjdGlvblR5cGUpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7Y29tbW9uTG9nUHJlZml4KGNvbm5lY3Rpb25UeXBlLCBvcHRpb25zLnJlY29ubmVjdGlvblRva2VuLCAhIW9wdGlvbnMucmVjb25uZWN0aW9uUHJvdG9jb2wpfVske29wdGlvbnMuY29ubmVjdFRvfV1gO1xufVxuXG5mdW5jdGlvbiBsb2dFbGFwc2VkKHN0YXJ0VGltZTogbnVtYmVyKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke0RhdGUubm93KCkgLSBzdGFydFRpbWV9IG1zYDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQTRCLHlCQUF5Qiw0QkFBNEI7QUFDakYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMscUJBQXFCLHlCQUF5QjtBQUN2RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyx5QkFBeUI7QUFDbEMsWUFBWSxpQkFBaUI7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxRQUFpQixvQkFBb0IsbUJBQW1CLDRCQUE0QjtBQUc3RixTQUFTLG9DQUFzRDtBQUkvRCxNQUFNLG9CQUFvQixLQUFLO0FBRXhCLElBQVcsaUJBQVgsa0JBQVdBLG9CQUFYO0FBQ04sRUFBQUEsZ0NBQUEsZ0JBQWEsS0FBYjtBQUNBLEVBQUFBLGdDQUFBLG1CQUFnQixLQUFoQjtBQUNBLEVBQUFBLGdDQUFBLFlBQVMsS0FBVDtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFNbEIsU0FBUyx1QkFBdUIsZ0JBQXdDO0FBQ3ZFLFVBQVEsZ0JBQWdCO0FBQUEsSUFDdkIsS0FBSztBQUNKLGFB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YyxZQUFZLENBQUMsU0FBUyxTQUFTLEtBQUssWUFBWSxHQUFHO0FBQzNFLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxZQUFZLE9BQU8sa0JBQWtCO0FBQ3hDLFdBQU8sT0FBTztBQUFBLEVBQ2Y7QUFDQSxTQUFPLEtBQUssTUFBTSxTQUFTO0FBQzVCO0FBRUEsU0FBUyxlQUFlLEtBQWEsS0FBcUI7QUFDekQsU0FBTyxJQUFJLFNBQVMsS0FBSztBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsaUJBQWlCLGdCQUFnQyxtQkFBbUM7QUFDNUYsU0FBTyx1QkFBdUIsZUFBZSx1QkFBdUIsY0FBYyxHQUFHLEVBQUUsQ0FBQyxLQUFLLGtCQUFrQixPQUFPLEdBQUcsQ0FBQyxDQUFDO0FBQzVIO0FBRUEsU0FBUyxnQkFBZ0IsZ0JBQWdDLG1CQUEyQixhQUE4QjtBQUNqSCxTQUFPLEdBQUcsaUJBQWlCLGdCQUFnQixpQkFBaUIsQ0FBQyxJQUFJLGNBQWMsY0FBYyxTQUFTO0FBQ3ZHO0FBRUEsU0FBUyxpQkFBaUIsU0FBbUMsZ0JBQXdDO0FBQ3BHLFNBQU8sR0FBRyxnQkFBZ0IsZ0JBQWdCLFFBQVEsbUJBQW1CLENBQUMsQ0FBQyxRQUFRLG9CQUFvQixDQUFDLElBQUksUUFBUSxTQUFTO0FBQzFIO0FBRUEsU0FBUyxXQUFXLFdBQTJCO0FBQzlDLFNBQU8sR0FBRyxLQUFLLElBQUksSUFBSSxTQUFTO0FBQ2pDOyIsCiAgIm5hbWVzIjogWyJDb25uZWN0aW9uVHlwZSIsICJQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZSJdCn0K
