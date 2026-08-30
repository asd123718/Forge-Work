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
import { getRandomElement } from "../../../common/arrays.js";
import { createCancelablePromise, timeout } from "../../../common/async.js";
import { VSBuffer } from "../../../common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../common/cancellation.js";
import { memoize } from "../../../common/decorators.js";
import { CancellationError, ErrorNoTelemetry } from "../../../common/errors.js";
import { Emitter, Event, EventMultiplexer, Relay } from "../../../common/event.js";
import { createSingleCallFunction } from "../../../common/functional.js";
import { DisposableStore, dispose, toDisposable } from "../../../common/lifecycle.js";
import { revive } from "../../../common/marshalling.js";
import * as strings from "../../../common/strings.js";
import { isFunction, isUndefinedOrNull } from "../../../common/types.js";
var RequestType = /* @__PURE__ */ ((RequestType2) => {
  RequestType2[RequestType2["Promise"] = 100] = "Promise";
  RequestType2[RequestType2["PromiseCancel"] = 101] = "PromiseCancel";
  RequestType2[RequestType2["EventListen"] = 102] = "EventListen";
  RequestType2[RequestType2["EventDispose"] = 103] = "EventDispose";
  return RequestType2;
})(RequestType || {});
function requestTypeToStr(type) {
  switch (type) {
    case 100 /* Promise */:
      return "req";
    case 101 /* PromiseCancel */:
      return "cancel";
    case 102 /* EventListen */:
      return "subscribe";
    case 103 /* EventDispose */:
      return "unsubscribe";
  }
}
var ResponseType = /* @__PURE__ */ ((ResponseType2) => {
  ResponseType2[ResponseType2["Initialize"] = 200] = "Initialize";
  ResponseType2[ResponseType2["PromiseSuccess"] = 201] = "PromiseSuccess";
  ResponseType2[ResponseType2["PromiseError"] = 202] = "PromiseError";
  ResponseType2[ResponseType2["PromiseErrorObj"] = 203] = "PromiseErrorObj";
  ResponseType2[ResponseType2["EventFire"] = 204] = "EventFire";
  return ResponseType2;
})(ResponseType || {});
function responseTypeToStr(type) {
  switch (type) {
    case 200 /* Initialize */:
      return `init`;
    case 201 /* PromiseSuccess */:
      return `reply:`;
    case 202 /* PromiseError */:
    case 203 /* PromiseErrorObj */:
      return `replyErr:`;
    case 204 /* EventFire */:
      return `event:`;
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Uninitialized"] = 0] = "Uninitialized";
  State2[State2["Idle"] = 1] = "Idle";
  return State2;
})(State || {});
function readIntVQL(reader) {
  let value = 0;
  for (let n = 0; ; n += 7) {
    const next = reader.read(1);
    value |= (next.buffer[0] & 127) << n;
    if (!(next.buffer[0] & 128)) {
      return value;
    }
  }
}
const vqlZero = createOneByteBuffer(0);
function writeInt32VQL(writer, value) {
  if (value === 0) {
    writer.write(vqlZero);
    return;
  }
  let len = 0;
  for (let v2 = value; v2 !== 0; v2 = v2 >>> 7) {
    len++;
  }
  const scratch = VSBuffer.alloc(len);
  for (let i = 0; value !== 0; i++) {
    scratch.buffer[i] = value & 127;
    value = value >>> 7;
    if (value > 0) {
      scratch.buffer[i] |= 128;
    }
  }
  writer.write(scratch);
}
class BufferReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.pos = 0;
  }
  read(bytes) {
    const result = this.buffer.slice(this.pos, this.pos + bytes);
    this.pos += result.byteLength;
    return result;
  }
}
class BufferWriter {
  constructor() {
    this.buffers = [];
  }
  get buffer() {
    return VSBuffer.concat(this.buffers);
  }
  write(buffer) {
    this.buffers.push(buffer);
  }
  dispose() {
    this.buffers.length = 0;
  }
}
var DataType = /* @__PURE__ */ ((DataType2) => {
  DataType2[DataType2["Undefined"] = 0] = "Undefined";
  DataType2[DataType2["String"] = 1] = "String";
  DataType2[DataType2["Buffer"] = 2] = "Buffer";
  DataType2[DataType2["VSBuffer"] = 3] = "VSBuffer";
  DataType2[DataType2["Array"] = 4] = "Array";
  DataType2[DataType2["Object"] = 5] = "Object";
  DataType2[DataType2["Int"] = 6] = "Int";
  return DataType2;
})(DataType || {});
function createOneByteBuffer(value) {
  const result = VSBuffer.alloc(1);
  result.writeUInt8(value, 0);
  return result;
}
const BufferPresets = {
  Undefined: createOneByteBuffer(0 /* Undefined */),
  String: createOneByteBuffer(1 /* String */),
  Buffer: createOneByteBuffer(2 /* Buffer */),
  VSBuffer: createOneByteBuffer(3 /* VSBuffer */),
  Array: createOneByteBuffer(4 /* Array */),
  Object: createOneByteBuffer(5 /* Object */),
  Uint: createOneByteBuffer(6 /* Int */)
};
function serialize(writer, data) {
  if (typeof data === "undefined") {
    writer.write(BufferPresets.Undefined);
  } else if (typeof data === "string") {
    const buffer = VSBuffer.fromString(data);
    writer.write(BufferPresets.String);
    writeInt32VQL(writer, buffer.byteLength);
    writer.write(buffer);
  } else if (VSBuffer.isNativeBuffer(data)) {
    const buffer = VSBuffer.wrap(data);
    writer.write(BufferPresets.Buffer);
    writeInt32VQL(writer, buffer.byteLength);
    writer.write(buffer);
  } else if (data instanceof VSBuffer) {
    writer.write(BufferPresets.VSBuffer);
    writeInt32VQL(writer, data.byteLength);
    writer.write(data);
  } else if (Array.isArray(data)) {
    writer.write(BufferPresets.Array);
    writeInt32VQL(writer, data.length);
    for (const el of data) {
      serialize(writer, el);
    }
  } else if (typeof data === "number" && (data | 0) === data) {
    writer.write(BufferPresets.Uint);
    writeInt32VQL(writer, data);
  } else {
    const buffer = VSBuffer.fromString(JSON.stringify(data));
    writer.write(BufferPresets.Object);
    writeInt32VQL(writer, buffer.byteLength);
    writer.write(buffer);
  }
}
function deserialize(reader) {
  const type = reader.read(1).readUInt8(0);
  switch (type) {
    case 0 /* Undefined */:
      return void 0;
    case 1 /* String */:
      return reader.read(readIntVQL(reader)).toString();
    case 2 /* Buffer */:
      return reader.read(readIntVQL(reader)).buffer;
    case 3 /* VSBuffer */:
      return reader.read(readIntVQL(reader));
    case 4 /* Array */: {
      const length = readIntVQL(reader);
      const result = [];
      for (let i = 0; i < length; i++) {
        result.push(deserialize(reader));
      }
      return result;
    }
    case 5 /* Object */:
      return JSON.parse(reader.read(readIntVQL(reader)).toString());
    case 6 /* Int */:
      return readIntVQL(reader);
  }
}
class ChannelServer {
  constructor(protocol, ctx, logger = null, timeoutDelay = 1e3) {
    this.protocol = protocol;
    this.ctx = ctx;
    this.logger = logger;
    this.timeoutDelay = timeoutDelay;
    this.channels = /* @__PURE__ */ new Map();
    this.activeRequests = /* @__PURE__ */ new Map();
    // Requests might come in for channels which are not yet registered.
    // They will timeout after `timeoutDelay`.
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.protocolListener = this.protocol.onMessage((msg) => this.onRawMessage(msg));
    this.sendResponse({ type: 200 /* Initialize */ });
  }
  registerChannel(channelName, channel) {
    this.channels.set(channelName, channel);
    setTimeout(() => this.flushPendingRequests(channelName), 0);
  }
  sendResponse(response) {
    switch (response.type) {
      case 200 /* Initialize */: {
        const msgLength = this.send([response.type]);
        this.logger?.logOutgoing(msgLength, 0, 1 /* OtherSide */, responseTypeToStr(response.type));
        return;
      }
      case 201 /* PromiseSuccess */:
      case 202 /* PromiseError */:
      case 204 /* EventFire */:
      case 203 /* PromiseErrorObj */: {
        const msgLength = this.send([response.type, response.id], response.data);
        this.logger?.logOutgoing(msgLength, response.id, 1 /* OtherSide */, responseTypeToStr(response.type), response.data);
        return;
      }
    }
  }
  send(header, body = void 0) {
    const writer = new BufferWriter();
    try {
      serialize(writer, header);
      serialize(writer, body);
      return this.sendBuffer(writer.buffer);
    } finally {
      writer.dispose();
    }
  }
  sendBuffer(message) {
    try {
      this.protocol.send(message);
      return message.byteLength;
    } catch (err) {
      return 0;
    }
  }
  onRawMessage(message) {
    const reader = new BufferReader(message);
    const header = deserialize(reader);
    const body = deserialize(reader);
    const type = header[0];
    switch (type) {
      case 100 /* Promise */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}: ${header[2]}.${header[3]}`, body);
        return this.onPromise({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
      case 102 /* EventListen */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}: ${header[2]}.${header[3]}`, body);
        return this.onEventListen({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
      case 101 /* PromiseCancel */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}`);
        return this.disposeActiveRequest({ type, id: header[1] });
      case 103 /* EventDispose */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}`);
        return this.disposeActiveRequest({ type, id: header[1] });
    }
  }
  onPromise(request) {
    const channel = this.channels.get(request.channelName);
    if (!channel) {
      this.collectPendingRequest(request);
      return;
    }
    const cancellationTokenSource = new CancellationTokenSource();
    let promise;
    try {
      promise = channel.call(this.ctx, request.name, request.arg, cancellationTokenSource.token);
    } catch (err) {
      promise = Promise.reject(err);
    }
    const id = request.id;
    promise.then((data) => {
      this.sendResponse({ id, data, type: 201 /* PromiseSuccess */ });
    }, (err) => {
      if (err instanceof Error) {
        this.sendResponse({
          id,
          data: {
            message: err.message,
            name: err.name,
            stack: err.stack ? err.stack.split("\n") : void 0
          },
          type: 202 /* PromiseError */
        });
      } else {
        this.sendResponse({ id, data: err, type: 203 /* PromiseErrorObj */ });
      }
    }).finally(() => {
      disposable.dispose();
      this.activeRequests.delete(request.id);
    });
    const disposable = toDisposable(() => cancellationTokenSource.cancel());
    this.activeRequests.set(request.id, disposable);
  }
  onEventListen(request) {
    const channel = this.channels.get(request.channelName);
    if (!channel) {
      this.collectPendingRequest(request);
      return;
    }
    const id = request.id;
    const event = channel.listen(this.ctx, request.name, request.arg);
    const disposable = event((data) => this.sendResponse({ id, data, type: 204 /* EventFire */ }));
    this.activeRequests.set(request.id, disposable);
  }
  disposeActiveRequest(request) {
    const disposable = this.activeRequests.get(request.id);
    if (disposable) {
      disposable.dispose();
      this.activeRequests.delete(request.id);
    }
  }
  collectPendingRequest(request) {
    let pendingRequests = this.pendingRequests.get(request.channelName);
    if (!pendingRequests) {
      pendingRequests = [];
      this.pendingRequests.set(request.channelName, pendingRequests);
    }
    const timer = setTimeout(() => {
      console.error(`Unknown channel: ${request.channelName}`);
      if (request.type === 100 /* Promise */) {
        this.sendResponse({
          id: request.id,
          data: { name: "Unknown channel", message: `Channel name '${request.channelName}' timed out after ${this.timeoutDelay}ms`, stack: void 0 },
          type: 202 /* PromiseError */
        });
      }
    }, this.timeoutDelay);
    pendingRequests.push({ request, timeoutTimer: timer });
  }
  flushPendingRequests(channelName) {
    const requests = this.pendingRequests.get(channelName);
    if (requests) {
      for (const request of requests) {
        clearTimeout(request.timeoutTimer);
        switch (request.request.type) {
          case 100 /* Promise */:
            this.onPromise(request.request);
            break;
          case 102 /* EventListen */:
            this.onEventListen(request.request);
            break;
        }
      }
      this.pendingRequests.delete(channelName);
    }
  }
  dispose() {
    if (this.protocolListener) {
      this.protocolListener.dispose();
      this.protocolListener = null;
    }
    dispose(this.activeRequests.values());
    this.activeRequests.clear();
  }
}
var RequestInitiator = /* @__PURE__ */ ((RequestInitiator2) => {
  RequestInitiator2[RequestInitiator2["LocalSide"] = 0] = "LocalSide";
  RequestInitiator2[RequestInitiator2["OtherSide"] = 1] = "OtherSide";
  return RequestInitiator2;
})(RequestInitiator || {});
class ChannelClient {
  constructor(protocol, logger = null) {
    this.protocol = protocol;
    this.isDisposed = false;
    this.state = 0 /* Uninitialized */;
    this.activeRequests = /* @__PURE__ */ new Set();
    this.handlers = /* @__PURE__ */ new Map();
    this.lastRequestId = 0;
    this._onDidInitialize = new Emitter();
    this.onDidInitialize = this._onDidInitialize.event;
    this.protocolListener = this.protocol.onMessage((msg) => this.onBuffer(msg));
    this.logger = logger;
  }
  getChannel(channelName) {
    const that = this;
    return {
      call(command, arg, cancellationToken) {
        if (that.isDisposed) {
          return Promise.reject(new CancellationError());
        }
        return that.requestPromise(channelName, command, arg, cancellationToken);
      },
      listen(event, arg) {
        if (that.isDisposed) {
          return Event.None;
        }
        return that.requestEvent(channelName, event, arg);
      }
    };
  }
  requestPromise(channelName, name, arg, cancellationToken = CancellationToken.None) {
    const id = this.lastRequestId++;
    const type = 100 /* Promise */;
    const request = { id, type, channelName, name, arg };
    if (cancellationToken.isCancellationRequested) {
      return Promise.reject(new CancellationError());
    }
    let disposable;
    let disposableWithRequestCancel;
    const result = new Promise((c, e) => {
      if (cancellationToken.isCancellationRequested) {
        return e(new CancellationError());
      }
      const doRequest = () => {
        const handler = (response) => {
          switch (response.type) {
            case 201 /* PromiseSuccess */:
              this.handlers.delete(id);
              c(response.data);
              break;
            case 202 /* PromiseError */: {
              this.handlers.delete(id);
              const error = new Error(response.data.message);
              error.stack = Array.isArray(response.data.stack) ? response.data.stack.join("\n") : response.data.stack;
              error.name = response.data.name;
              e(error);
              break;
            }
            case 203 /* PromiseErrorObj */:
              this.handlers.delete(id);
              e(response.data);
              break;
          }
        };
        this.handlers.set(id, handler);
        try {
          this.sendRequest(request);
        } catch (err) {
          this.handlers.delete(id);
          e(err);
        }
      };
      let uninitializedPromise = null;
      if (this.state === 1 /* Idle */) {
        doRequest();
      } else {
        uninitializedPromise = createCancelablePromise((_) => this.whenInitialized());
        uninitializedPromise.then(() => {
          uninitializedPromise = null;
          doRequest();
        }, () => {
        });
      }
      const cancel = () => {
        if (uninitializedPromise) {
          uninitializedPromise.cancel();
          uninitializedPromise = null;
        } else {
          this.sendRequest({ id, type: 101 /* PromiseCancel */ });
        }
        e(new CancellationError());
      };
      disposable = cancellationToken.onCancellationRequested(cancel);
      disposableWithRequestCancel = {
        dispose: createSingleCallFunction(() => {
          cancel();
          disposable.dispose();
        })
      };
      this.activeRequests.add(disposableWithRequestCancel);
    });
    return result.finally(() => {
      disposable?.dispose();
      this.activeRequests.delete(disposableWithRequestCancel);
    });
  }
  requestEvent(channelName, name, arg) {
    const id = this.lastRequestId++;
    const type = 102 /* EventListen */;
    const request = { id, type, channelName, name, arg };
    let uninitializedPromise = null;
    const emitter = new Emitter({
      onWillAddFirstListener: () => {
        const handler = (res) => emitter.fire(res.data);
        this.handlers.set(id, handler);
        const doRequest = () => {
          this.activeRequests.add(emitter);
          this.sendRequest(request);
        };
        if (this.state === 1 /* Idle */) {
          doRequest();
        } else {
          uninitializedPromise = createCancelablePromise((_) => this.whenInitialized());
          uninitializedPromise.then(() => {
            uninitializedPromise = null;
            doRequest();
          }, () => {
          });
        }
      },
      onDidRemoveLastListener: () => {
        if (uninitializedPromise) {
          uninitializedPromise.cancel();
          uninitializedPromise = null;
        } else {
          this.activeRequests.delete(emitter);
          this.sendRequest({ id, type: 103 /* EventDispose */ });
        }
        this.handlers.delete(id);
      }
    });
    return emitter.event;
  }
  sendRequest(request) {
    switch (request.type) {
      case 100 /* Promise */:
      case 102 /* EventListen */: {
        const msgLength = this.send([request.type, request.id, request.channelName, request.name], request.arg);
        this.logger?.logOutgoing(msgLength, request.id, 0 /* LocalSide */, `${requestTypeToStr(request.type)}: ${request.channelName}.${request.name}`, request.arg);
        return;
      }
      case 101 /* PromiseCancel */:
      case 103 /* EventDispose */: {
        const msgLength = this.send([request.type, request.id]);
        this.logger?.logOutgoing(msgLength, request.id, 0 /* LocalSide */, requestTypeToStr(request.type));
        return;
      }
    }
  }
  send(header, body = void 0) {
    const writer = new BufferWriter();
    try {
      serialize(writer, header);
      serialize(writer, body);
      return this.sendBuffer(writer.buffer);
    } finally {
      writer.dispose();
    }
  }
  sendBuffer(message) {
    try {
      this.protocol.send(message);
      return message.byteLength;
    } catch (err) {
      return 0;
    }
  }
  onBuffer(message) {
    const reader = new BufferReader(message);
    const header = deserialize(reader);
    const body = deserialize(reader);
    const type = header[0];
    switch (type) {
      case 200 /* Initialize */:
        this.logger?.logIncoming(message.byteLength, 0, 0 /* LocalSide */, responseTypeToStr(type));
        return this.onResponse({ type: header[0] });
      case 201 /* PromiseSuccess */:
      case 202 /* PromiseError */:
      case 204 /* EventFire */:
      case 203 /* PromiseErrorObj */:
        this.logger?.logIncoming(message.byteLength, header[1], 0 /* LocalSide */, responseTypeToStr(type), body);
        return this.onResponse({ type: header[0], id: header[1], data: body });
    }
  }
  onResponse(response) {
    if (response.type === 200 /* Initialize */) {
      this.state = 1 /* Idle */;
      this._onDidInitialize.fire();
      return;
    }
    const handler = this.handlers.get(response.id);
    handler?.(response);
  }
  get onDidInitializePromise() {
    return Event.toPromise(this.onDidInitialize);
  }
  whenInitialized() {
    if (this.state === 1 /* Idle */) {
      return Promise.resolve();
    } else {
      return this.onDidInitializePromise;
    }
  }
  dispose() {
    this.isDisposed = true;
    if (this.protocolListener) {
      this.protocolListener.dispose();
      this.protocolListener = null;
    }
    dispose(this.activeRequests.values());
    this.activeRequests.clear();
    this._onDidInitialize.dispose();
  }
}
__decorateClass([
  memoize
], ChannelClient.prototype, "onDidInitializePromise", 1);
class IPCServer {
  constructor(onDidClientConnect, ipcLogger, timeoutDelay) {
    this.channels = /* @__PURE__ */ new Map();
    this._connections = /* @__PURE__ */ new Set();
    this._onDidAddConnection = new Emitter();
    this.onDidAddConnection = this._onDidAddConnection.event;
    this._onDidRemoveConnection = new Emitter();
    this.onDidRemoveConnection = this._onDidRemoveConnection.event;
    this.disposables = new DisposableStore();
    this.disposables.add(onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
      const onFirstMessage = Event.once(protocol.onMessage);
      const connectionDisposables = new DisposableStore();
      const onFirstMessageDisposable = onFirstMessage((msg) => {
        const reader = new BufferReader(msg);
        const ctx = deserialize(reader);
        const channelServer = new ChannelServer(protocol, ctx, ipcLogger, timeoutDelay);
        const channelClient = new ChannelClient(protocol, ipcLogger);
        this.channels.forEach((channel, name) => channelServer.registerChannel(name, channel));
        const connection = { channelServer, channelClient, ctx };
        this._connections.add(connection);
        this._onDidAddConnection.fire(connection);
        connectionDisposables.add(onDidClientDisconnect(() => {
          channelServer.dispose();
          channelClient.dispose();
          this._connections.delete(connection);
          this._onDidRemoveConnection.fire(connection);
          this.disposables.delete(connectionDisposables);
          connectionDisposables.dispose();
        }));
      });
      connectionDisposables.add(onFirstMessageDisposable);
      this.disposables.add(connectionDisposables);
    }));
  }
  get connections() {
    const result = [];
    this._connections.forEach((ctx) => result.push(ctx));
    return result;
  }
  getChannel(channelName, routerOrClientFilter) {
    const that = this;
    return {
      call(command, arg, cancellationToken) {
        let connectionPromise;
        if (isFunction(routerOrClientFilter)) {
          const connection = getRandomElement(that.connections.filter(routerOrClientFilter));
          connectionPromise = connection ? Promise.resolve(connection) : Event.toPromise(Event.filter(that.onDidAddConnection, routerOrClientFilter));
        } else {
          connectionPromise = routerOrClientFilter.routeCall(that, command, arg);
        }
        const channelPromise = connectionPromise.then((connection) => connection.channelClient.getChannel(channelName));
        return getDelayedChannel(channelPromise).call(command, arg, cancellationToken);
      },
      listen(event, arg) {
        if (isFunction(routerOrClientFilter)) {
          return that.getMulticastEvent(channelName, routerOrClientFilter, event, arg);
        }
        const channelPromise = routerOrClientFilter.routeEvent(that, event, arg).then((connection) => connection.channelClient.getChannel(channelName));
        return getDelayedChannel(channelPromise).listen(event, arg);
      }
    };
  }
  getMulticastEvent(channelName, clientFilter, eventName, arg) {
    const that = this;
    let disposables;
    const emitter = new Emitter({
      onWillAddFirstListener: () => {
        disposables = new DisposableStore();
        const eventMultiplexer = new EventMultiplexer();
        const map = /* @__PURE__ */ new Map();
        const onDidAddConnection = (connection) => {
          const channel = connection.channelClient.getChannel(channelName);
          const event = channel.listen(eventName, arg);
          const disposable = eventMultiplexer.add(event);
          map.set(connection, disposable);
        };
        const onDidRemoveConnection = (connection) => {
          const disposable = map.get(connection);
          if (!disposable) {
            return;
          }
          disposable.dispose();
          map.delete(connection);
        };
        that.connections.filter(clientFilter).forEach(onDidAddConnection);
        Event.filter(that.onDidAddConnection, clientFilter)(onDidAddConnection, void 0, disposables);
        that.onDidRemoveConnection(onDidRemoveConnection, void 0, disposables);
        eventMultiplexer.event(emitter.fire, emitter, disposables);
        disposables.add(eventMultiplexer);
      },
      onDidRemoveLastListener: () => {
        disposables?.dispose();
        disposables = void 0;
      }
    });
    that.disposables.add(emitter);
    return emitter.event;
  }
  registerChannel(channelName, channel) {
    this.channels.set(channelName, channel);
    for (const connection of this._connections) {
      connection.channelServer.registerChannel(channelName, channel);
    }
  }
  dispose() {
    this.disposables.dispose();
    for (const connection of this._connections) {
      connection.channelClient.dispose();
      connection.channelServer.dispose();
    }
    this._connections.clear();
    this.channels.clear();
    this._onDidAddConnection.dispose();
    this._onDidRemoveConnection.dispose();
  }
}
class IPCClient {
  constructor(protocol, ctx, ipcLogger = null) {
    const writer = new BufferWriter();
    try {
      serialize(writer, ctx);
      protocol.send(writer.buffer);
    } finally {
      writer.dispose();
    }
    this.channelClient = new ChannelClient(protocol, ipcLogger);
    this.channelServer = new ChannelServer(protocol, ctx, ipcLogger);
  }
  getChannel(channelName) {
    return this.channelClient.getChannel(channelName);
  }
  registerChannel(channelName, channel) {
    this.channelServer.registerChannel(channelName, channel);
  }
  dispose() {
    this.channelClient.dispose();
    this.channelServer.dispose();
  }
}
function getDelayedChannel(promise) {
  return {
    call(command, arg, cancellationToken) {
      return promise.then((c) => c.call(command, arg, cancellationToken));
    },
    listen(event, arg) {
      const relay = new Relay();
      void promise.then(
        (c) => relay.input = c.listen(event, arg),
        () => relay.dispose()
      );
      return relay.event;
    }
  };
}
function getNextTickChannel(channel) {
  let didTick = false;
  return {
    call(command, arg, cancellationToken) {
      if (didTick) {
        return channel.call(command, arg, cancellationToken);
      }
      return timeout(0).then(() => didTick = true).then(() => channel.call(command, arg, cancellationToken));
    },
    listen(event, arg) {
      if (didTick) {
        return channel.listen(event, arg);
      }
      const relay = new Relay();
      timeout(0).then(() => didTick = true).then(() => relay.input = channel.listen(event, arg));
      return relay.event;
    }
  };
}
class StaticRouter {
  constructor(fn) {
    this.fn = fn;
  }
  routeCall(hub) {
    return this.route(hub);
  }
  routeEvent(hub) {
    return this.route(hub);
  }
  async route(hub) {
    for (const connection of hub.connections) {
      if (await Promise.resolve(this.fn(connection.ctx))) {
        return Promise.resolve(connection);
      }
    }
    await Event.toPromise(hub.onDidAddConnection);
    return await this.route(hub);
  }
}
var ProxyChannel;
((ProxyChannel2) => {
  function fromService(service, disposables, options) {
    const handler = service;
    const disableMarshalling = options?.disableMarshalling;
    const unbufferedEvents = options?.unbufferedEvents ? new Set(options.unbufferedEvents) : void 0;
    const mapEventNameToEvent = /* @__PURE__ */ new Map();
    for (const key in handler) {
      if (propertyIsEvent(key) && !unbufferedEvents?.has(key)) {
        mapEventNameToEvent.set(key, Event.buffer(handler[key], key, true, void 0, disposables));
      }
    }
    return new class {
      listen(_, event, arg) {
        const eventImpl = mapEventNameToEvent.get(event);
        if (eventImpl) {
          return eventImpl;
        }
        const target = handler[event];
        if (typeof target === "function") {
          if (propertyIsDynamicEvent(event)) {
            return target.call(handler, arg);
          }
          if (propertyIsEvent(event)) {
            if (unbufferedEvents?.has(event)) {
              return handler[event];
            }
            mapEventNameToEvent.set(event, Event.buffer(handler[event], event, true, void 0, disposables));
            return mapEventNameToEvent.get(event);
          }
        }
        throw new ErrorNoTelemetry(`Event not found: ${event}`);
      }
      call(_, command, args) {
        const target = handler[command];
        if (typeof target === "function") {
          if (!disableMarshalling && Array.isArray(args)) {
            for (let i = 0; i < args.length; i++) {
              args[i] = revive(args[i]);
            }
          }
          let res = target.apply(handler, args);
          if (!(res instanceof Promise)) {
            res = Promise.resolve(res);
          }
          return res;
        }
        throw new ErrorNoTelemetry(`Method not found: ${command}`);
      }
    }();
  }
  ProxyChannel2.fromService = fromService;
  function toService(channel, options) {
    const disableMarshalling = options?.disableMarshalling;
    return new Proxy({}, {
      get(_target, propKey) {
        if (typeof propKey === "string") {
          if (options?.properties?.has(propKey)) {
            return options.properties.get(propKey);
          }
          if (propKey === "then") {
            return void 0;
          }
          if (propertyIsDynamicEvent(propKey)) {
            return function(arg) {
              return channel.listen(propKey, arg);
            };
          }
          if (propertyIsEvent(propKey)) {
            return channel.listen(propKey);
          }
          return async function(...args) {
            let methodArgs;
            if (options && !isUndefinedOrNull(options.context)) {
              methodArgs = [options.context, ...args];
            } else {
              methodArgs = args;
            }
            const result = await channel.call(propKey, methodArgs);
            if (!disableMarshalling) {
              return revive(result);
            }
            return result;
          };
        }
        throw new ErrorNoTelemetry(`Property not found: ${String(propKey)}`);
      }
    });
  }
  ProxyChannel2.toService = toService;
  function propertyIsEvent(name) {
    return name[0] === "o" && name[1] === "n" && strings.isUpperAsciiLetter(name.charCodeAt(2));
  }
  function propertyIsDynamicEvent(name) {
    return /^onDynamic/.test(name) && strings.isUpperAsciiLetter(name.charCodeAt(9));
  }
})(ProxyChannel || (ProxyChannel = {}));
const colorTables = [
  ["#2977B1", "#FC802D", "#34A13A", "#D3282F", "#9366BA"],
  ["#8B564C", "#E177C0", "#7F7F7F", "#BBBE3D", "#2EBECD"]
];
function prettyWithoutArrays(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object" && typeof data.toString === "function") {
    const result = data.toString();
    if (result !== "[object Object]") {
      return result;
    }
  }
  return data;
}
function pretty(data) {
  if (Array.isArray(data)) {
    return data.map(prettyWithoutArrays);
  }
  return prettyWithoutArrays(data);
}
function logWithColors(direction, totalLength, msgLength, req, initiator, str, data) {
  data = pretty(data);
  const colorTable = colorTables[initiator];
  const color = colorTable[req % colorTable.length];
  let args = [`%c[${direction}]%c[${String(totalLength).padStart(7, " ")}]%c[len: ${String(msgLength).padStart(5, " ")}]%c${String(req).padStart(5, " ")} - ${str}`, "color: darkgreen", "color: grey", "color: grey", `color: ${color}`];
  if (/\($/.test(str)) {
    args = args.concat(data);
    args.push(")");
  } else {
    args.push(data);
  }
  console.log.apply(console, args);
}
class IPCLogger {
  constructor(_outgoingPrefix, _incomingPrefix) {
    this._outgoingPrefix = _outgoingPrefix;
    this._incomingPrefix = _incomingPrefix;
    this._totalIncoming = 0;
    this._totalOutgoing = 0;
  }
  logOutgoing(msgLength, requestId, initiator, str, data) {
    this._totalOutgoing += msgLength;
    logWithColors(this._outgoingPrefix, this._totalOutgoing, msgLength, requestId, initiator, str, data);
  }
  logIncoming(msgLength, requestId, initiator, str, data) {
    this._totalIncoming += msgLength;
    logWithColors(this._incomingPrefix, this._totalIncoming, msgLength, requestId, initiator, str, data);
  }
}
export {
  BufferReader,
  BufferWriter,
  ChannelClient,
  ChannelServer,
  IPCClient,
  IPCLogger,
  IPCServer,
  ProxyChannel,
  RequestInitiator,
  StaticRouter,
  deserialize,
  getDelayedChannel,
  getNextTickChannel,
  serialize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcaXBjXFxjb21tb25cXGlwYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFJhbmRvbUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIEVycm9yTm9UZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudE11bHRpcGxleGVyLCBSZWxheSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZnVuY3Rpb25hbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzRnVuY3Rpb24sIGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcblxuLyoqXG4gKiBBbiBgSUNoYW5uZWxgIGlzIGFuIGFic3RyYWN0aW9uIG92ZXIgYSBjb2xsZWN0aW9uIG9mIGNvbW1hbmRzLlxuICogWW91IGNhbiBgY2FsbGAgc2V2ZXJhbCBjb21tYW5kcyBvbiBhIGNoYW5uZWwsIGVhY2ggdGFraW5nIGF0XG4gKiBtb3N0IG9uZSBzaW5nbGUgYXJndW1lbnQuIEEgYGNhbGxgIGFsd2F5cyByZXR1cm5zIGEgcHJvbWlzZVxuICogd2l0aCBhdCBtb3N0IG9uZSBzaW5nbGUgcmV0dXJuIHZhbHVlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGFubmVsIHtcblx0Y2FsbDxUPihjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD47XG5cdGxpc3RlbjxUPihldmVudDogc3RyaW5nLCBhcmc/OiBhbnkpOiBFdmVudDxUPjtcbn1cblxuLyoqXG4gKiBBbiBgSVNlcnZlckNoYW5uZWxgIGlzIHRoZSBjb3VudGVyIHBhcnQgdG8gYElDaGFubmVsYCxcbiAqIG9uIHRoZSBzZXJ2ZXItc2lkZS4gWW91IHNob3VsZCBpbXBsZW1lbnQgdGhpcyBpbnRlcmZhY2VcbiAqIGlmIHlvdSdkIGxpa2UgdG8gaGFuZGxlIHJlbW90ZSBwcm9taXNlcyBvciBldmVudHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcnZlckNoYW5uZWw8VENvbnRleHQgPSBzdHJpbmc+IHtcblx0Y2FsbDxUPihjdHg6IFRDb250ZXh0LCBjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD47XG5cdGxpc3RlbjxUPihjdHg6IFRDb250ZXh0LCBldmVudDogc3RyaW5nLCBhcmc/OiBhbnkpOiBFdmVudDxUPjtcbn1cblxuY29uc3QgZW51bSBSZXF1ZXN0VHlwZSB7XG5cdFByb21pc2UgPSAxMDAsXG5cdFByb21pc2VDYW5jZWwgPSAxMDEsXG5cdEV2ZW50TGlzdGVuID0gMTAyLFxuXHRFdmVudERpc3Bvc2UgPSAxMDNcbn1cblxuZnVuY3Rpb24gcmVxdWVzdFR5cGVUb1N0cih0eXBlOiBSZXF1ZXN0VHlwZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgUmVxdWVzdFR5cGUuUHJvbWlzZTpcblx0XHRcdHJldHVybiAncmVxJztcblx0XHRjYXNlIFJlcXVlc3RUeXBlLlByb21pc2VDYW5jZWw6XG5cdFx0XHRyZXR1cm4gJ2NhbmNlbCc7XG5cdFx0Y2FzZSBSZXF1ZXN0VHlwZS5FdmVudExpc3Rlbjpcblx0XHRcdHJldHVybiAnc3Vic2NyaWJlJztcblx0XHRjYXNlIFJlcXVlc3RUeXBlLkV2ZW50RGlzcG9zZTpcblx0XHRcdHJldHVybiAndW5zdWJzY3JpYmUnO1xuXHR9XG59XG5cbnR5cGUgSVJhd1Byb21pc2VSZXF1ZXN0ID0geyB0eXBlOiBSZXF1ZXN0VHlwZS5Qcm9taXNlOyBpZDogbnVtYmVyOyBjaGFubmVsTmFtZTogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGFyZzogYW55IH07XG50eXBlIElSYXdQcm9taXNlQ2FuY2VsUmVxdWVzdCA9IHsgdHlwZTogUmVxdWVzdFR5cGUuUHJvbWlzZUNhbmNlbDsgaWQ6IG51bWJlciB9O1xudHlwZSBJUmF3RXZlbnRMaXN0ZW5SZXF1ZXN0ID0geyB0eXBlOiBSZXF1ZXN0VHlwZS5FdmVudExpc3RlbjsgaWQ6IG51bWJlcjsgY2hhbm5lbE5hbWU6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBhcmc6IGFueSB9O1xudHlwZSBJUmF3RXZlbnREaXNwb3NlUmVxdWVzdCA9IHsgdHlwZTogUmVxdWVzdFR5cGUuRXZlbnREaXNwb3NlOyBpZDogbnVtYmVyIH07XG50eXBlIElSYXdSZXF1ZXN0ID0gSVJhd1Byb21pc2VSZXF1ZXN0IHwgSVJhd1Byb21pc2VDYW5jZWxSZXF1ZXN0IHwgSVJhd0V2ZW50TGlzdGVuUmVxdWVzdCB8IElSYXdFdmVudERpc3Bvc2VSZXF1ZXN0O1xuXG5jb25zdCBlbnVtIFJlc3BvbnNlVHlwZSB7XG5cdEluaXRpYWxpemUgPSAyMDAsXG5cdFByb21pc2VTdWNjZXNzID0gMjAxLFxuXHRQcm9taXNlRXJyb3IgPSAyMDIsXG5cdFByb21pc2VFcnJvck9iaiA9IDIwMyxcblx0RXZlbnRGaXJlID0gMjA0XG59XG5cbmZ1bmN0aW9uIHJlc3BvbnNlVHlwZVRvU3RyKHR5cGU6IFJlc3BvbnNlVHlwZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgUmVzcG9uc2VUeXBlLkluaXRpYWxpemU6XG5cdFx0XHRyZXR1cm4gYGluaXRgO1xuXHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VTdWNjZXNzOlxuXHRcdFx0cmV0dXJuIGByZXBseTpgO1xuXHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvcjpcblx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3JPYmo6XG5cdFx0XHRyZXR1cm4gYHJlcGx5RXJyOmA7XG5cdFx0Y2FzZSBSZXNwb25zZVR5cGUuRXZlbnRGaXJlOlxuXHRcdFx0cmV0dXJuIGBldmVudDpgO1xuXHR9XG59XG5cbnR5cGUgSVJhd0luaXRpYWxpemVSZXNwb25zZSA9IHsgdHlwZTogUmVzcG9uc2VUeXBlLkluaXRpYWxpemUgfTtcbnR5cGUgSVJhd1Byb21pc2VTdWNjZXNzUmVzcG9uc2UgPSB7IHR5cGU6IFJlc3BvbnNlVHlwZS5Qcm9taXNlU3VjY2VzczsgaWQ6IG51bWJlcjsgZGF0YTogYW55IH07XG50eXBlIElSYXdQcm9taXNlRXJyb3JSZXNwb25zZSA9IHsgdHlwZTogUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvcjsgaWQ6IG51bWJlcjsgZGF0YTogeyBtZXNzYWdlOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgc3RhY2s6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIH0gfTtcbnR5cGUgSVJhd1Byb21pc2VFcnJvck9ialJlc3BvbnNlID0geyB0eXBlOiBSZXNwb25zZVR5cGUuUHJvbWlzZUVycm9yT2JqOyBpZDogbnVtYmVyOyBkYXRhOiBhbnkgfTtcbnR5cGUgSVJhd0V2ZW50RmlyZVJlc3BvbnNlID0geyB0eXBlOiBSZXNwb25zZVR5cGUuRXZlbnRGaXJlOyBpZDogbnVtYmVyOyBkYXRhOiBhbnkgfTtcbnR5cGUgSVJhd1Jlc3BvbnNlID0gSVJhd0luaXRpYWxpemVSZXNwb25zZSB8IElSYXdQcm9taXNlU3VjY2Vzc1Jlc3BvbnNlIHwgSVJhd1Byb21pc2VFcnJvclJlc3BvbnNlIHwgSVJhd1Byb21pc2VFcnJvck9ialJlc3BvbnNlIHwgSVJhd0V2ZW50RmlyZVJlc3BvbnNlO1xuXG5pbnRlcmZhY2UgSUhhbmRsZXIge1xuXHQocmVzcG9uc2U6IElSYXdSZXNwb25zZSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wge1xuXHRzZW5kKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkO1xuXHRyZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFZTQnVmZmVyPjtcblx0LyoqXG5cdCAqIFdhaXQgZm9yIHRoZSB3cml0ZSBidWZmZXIgKGlmIGFwcGxpY2FibGUpIHRvIGJlY29tZSBlbXB0eS5cblx0ICovXG5cdGRyYWluPygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5lbnVtIFN0YXRlIHtcblx0VW5pbml0aWFsaXplZCxcblx0SWRsZVxufVxuXG4vKipcbiAqIEFuIGBJQ2hhbm5lbFNlcnZlcmAgaG9zdHMgYSBjb2xsZWN0aW9uIG9mIGNoYW5uZWxzLiBZb3UgYXJlXG4gKiBhYmxlIHRvIHJlZ2lzdGVyIGNoYW5uZWxzIG9udG8gaXQsIHByb3ZpZGVkIGEgY2hhbm5lbCBuYW1lLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGFubmVsU2VydmVyPFRDb250ZXh0ID0gc3RyaW5nPiB7XG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4pOiB2b2lkO1xufVxuXG4vKipcbiAqIEFuIGBJQ2hhbm5lbENsaWVudGAgaGFzIGFjY2VzcyB0byBhIGNvbGxlY3Rpb24gb2YgY2hhbm5lbHMuIFlvdVxuICogYXJlIGFibGUgdG8gZ2V0IHRob3NlIGNoYW5uZWxzLCBnaXZlbiB0aGVpciBjaGFubmVsIG5hbWUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYW5uZWxDbGllbnQge1xuXHRnZXRDaGFubmVsPFQgZXh0ZW5kcyBJQ2hhbm5lbD4oY2hhbm5lbE5hbWU6IHN0cmluZyk6IFQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xpZW50PFRDb250ZXh0PiB7XG5cdHJlYWRvbmx5IGN0eDogVENvbnRleHQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbm5lY3Rpb25IdWI8VENvbnRleHQ+IHtcblx0cmVhZG9ubHkgY29ubmVjdGlvbnM6IENvbm5lY3Rpb248VENvbnRleHQ+W107XG5cdHJlYWRvbmx5IG9uRGlkQWRkQ29ubmVjdGlvbjogRXZlbnQ8Q29ubmVjdGlvbjxUQ29udGV4dD4+O1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUNvbm5lY3Rpb246IEV2ZW50PENvbm5lY3Rpb248VENvbnRleHQ+Pjtcbn1cblxuLyoqXG4gKiBBbiBgSUNsaWVudFJvdXRlcmAgaXMgcmVzcG9uc2libGUgZm9yIHJvdXRpbmcgY2FsbHMgdG8gc3BlY2lmaWNcbiAqIGNoYW5uZWxzLCBpbiBzY2VuYXJpb3MgaW4gd2hpY2ggdGhlcmUgYXJlIG11bHRpcGxlIHBvc3NpYmxlXG4gKiBjaGFubmVscyAoZWFjaCBmcm9tIGEgc2VwYXJhdGUgY2xpZW50KSB0byBwaWNrIGZyb20uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNsaWVudFJvdXRlcjxUQ29udGV4dCA9IHN0cmluZz4ge1xuXHRyb3V0ZUNhbGwoaHViOiBJQ29ubmVjdGlvbkh1YjxUQ29udGV4dD4sIGNvbW1hbmQ6IHN0cmluZywgYXJnPzogYW55LCBjYW5jZWxsYXRpb25Ub2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDbGllbnQ8VENvbnRleHQ+Pjtcblx0cm91dGVFdmVudChodWI6IElDb25uZWN0aW9uSHViPFRDb250ZXh0PiwgZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogUHJvbWlzZTxDbGllbnQ8VENvbnRleHQ+Pjtcbn1cblxuLyoqXG4gKiBTaW1pbGFyIHRvIHRoZSBgSUNoYW5uZWxDbGllbnRgLCB5b3UgY2FuIGdldCBjaGFubmVscyBmcm9tIHRoaXNcbiAqIGNvbGxlY3Rpb24gb2YgY2hhbm5lbHMuIFRoZSBkaWZmZXJlbmNlIGJlaW5nIHRoYXQgaW4gdGhlXG4gKiBgSVJvdXRpbmdDaGFubmVsQ2xpZW50YCwgdGhlcmUgYXJlIG11bHRpcGxlIGNsaWVudHMgcHJvdmlkaW5nXG4gKiB0aGUgc2FtZSBjaGFubmVsLiBZb3UnbGwgbmVlZCB0byBwYXNzIGluIGFuIGBJQ2xpZW50Um91dGVyYCBpblxuICogb3JkZXIgdG8gcGljayB0aGUgcmlnaHQgb25lLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSb3V0aW5nQ2hhbm5lbENsaWVudDxUQ29udGV4dCA9IHN0cmluZz4ge1xuXHRnZXRDaGFubmVsPFQgZXh0ZW5kcyBJQ2hhbm5lbD4oY2hhbm5lbE5hbWU6IHN0cmluZywgcm91dGVyPzogSUNsaWVudFJvdXRlcjxUQ29udGV4dD4pOiBUO1xufVxuXG5pbnRlcmZhY2UgSVJlYWRlciB7XG5cdHJlYWQoYnl0ZXM6IG51bWJlcik6IFZTQnVmZmVyO1xufVxuXG5pbnRlcmZhY2UgSVdyaXRlciB7XG5cdHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkO1xufVxuXG5cbi8qKlxuICogQHNlZSBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9WYXJpYWJsZS1sZW5ndGhfcXVhbnRpdHlcbiAqL1xuZnVuY3Rpb24gcmVhZEludFZRTChyZWFkZXI6IElSZWFkZXIpIHtcblx0bGV0IHZhbHVlID0gMDtcblx0Zm9yIChsZXQgbiA9IDA7IDsgbiArPSA3KSB7XG5cdFx0Y29uc3QgbmV4dCA9IHJlYWRlci5yZWFkKDEpO1xuXHRcdHZhbHVlIHw9IChuZXh0LmJ1ZmZlclswXSAmIDBiMDExMTExMTEpIDw8IG47XG5cdFx0aWYgKCEobmV4dC5idWZmZXJbMF0gJiAwYjEwMDAwMDAwKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCB2cWxaZXJvID0gY3JlYXRlT25lQnl0ZUJ1ZmZlcigwKTtcblxuLyoqXG4gKiBAc2VlIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1ZhcmlhYmxlLWxlbmd0aF9xdWFudGl0eVxuICovXG5mdW5jdGlvbiB3cml0ZUludDMyVlFMKHdyaXRlcjogSVdyaXRlciwgdmFsdWU6IG51bWJlcikge1xuXHRpZiAodmFsdWUgPT09IDApIHtcblx0XHR3cml0ZXIud3JpdGUodnFsWmVybyk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0bGV0IGxlbiA9IDA7XG5cdGZvciAobGV0IHYyID0gdmFsdWU7IHYyICE9PSAwOyB2MiA9IHYyID4+PiA3KSB7XG5cdFx0bGVuKys7XG5cdH1cblxuXHRjb25zdCBzY3JhdGNoID0gVlNCdWZmZXIuYWxsb2MobGVuKTtcblx0Zm9yIChsZXQgaSA9IDA7IHZhbHVlICE9PSAwOyBpKyspIHtcblx0XHRzY3JhdGNoLmJ1ZmZlcltpXSA9IHZhbHVlICYgMGIwMTExMTExMTtcblx0XHR2YWx1ZSA9IHZhbHVlID4+PiA3O1xuXHRcdGlmICh2YWx1ZSA+IDApIHtcblx0XHRcdHNjcmF0Y2guYnVmZmVyW2ldIHw9IDBiMTAwMDAwMDA7XG5cdFx0fVxuXHR9XG5cblx0d3JpdGVyLndyaXRlKHNjcmF0Y2gpO1xufVxuXG5leHBvcnQgY2xhc3MgQnVmZmVyUmVhZGVyIGltcGxlbWVudHMgSVJlYWRlciB7XG5cblx0cHJpdmF0ZSBwb3MgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgYnVmZmVyOiBWU0J1ZmZlcikgeyB9XG5cblx0cmVhZChieXRlczogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuYnVmZmVyLnNsaWNlKHRoaXMucG9zLCB0aGlzLnBvcyArIGJ5dGVzKTtcblx0XHR0aGlzLnBvcyArPSByZXN1bHQuYnl0ZUxlbmd0aDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdWZmZXJXcml0ZXIgaW1wbGVtZW50cyBJV3JpdGVyLCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBidWZmZXJzOiBWU0J1ZmZlcltdID0gW107XG5cblx0Z2V0IGJ1ZmZlcigpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIFZTQnVmZmVyLmNvbmNhdCh0aGlzLmJ1ZmZlcnMpO1xuXHR9XG5cblx0d3JpdGUoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMuYnVmZmVycy5wdXNoKGJ1ZmZlcik7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIFJlbGVhc2UgdGhlIGJ1ZmZlcnMgc28gYSB0aHJvd24gc2VyaWFsaXphdGlvbiBlcnJvcidzIHN0YWNrIGNhbid0IHBpbiB0aGVtLlxuXHRcdHRoaXMuYnVmZmVycy5sZW5ndGggPSAwO1xuXHR9XG59XG5cbmVudW0gRGF0YVR5cGUge1xuXHRVbmRlZmluZWQgPSAwLFxuXHRTdHJpbmcgPSAxLFxuXHRCdWZmZXIgPSAyLFxuXHRWU0J1ZmZlciA9IDMsXG5cdEFycmF5ID0gNCxcblx0T2JqZWN0ID0gNSxcblx0SW50ID0gNlxufVxuXG5mdW5jdGlvbiBjcmVhdGVPbmVCeXRlQnVmZmVyKHZhbHVlOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdGNvbnN0IHJlc3VsdCA9IFZTQnVmZmVyLmFsbG9jKDEpO1xuXHRyZXN1bHQud3JpdGVVSW50OCh2YWx1ZSwgMCk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IEJ1ZmZlclByZXNldHMgPSB7XG5cdFVuZGVmaW5lZDogY3JlYXRlT25lQnl0ZUJ1ZmZlcihEYXRhVHlwZS5VbmRlZmluZWQpLFxuXHRTdHJpbmc6IGNyZWF0ZU9uZUJ5dGVCdWZmZXIoRGF0YVR5cGUuU3RyaW5nKSxcblx0QnVmZmVyOiBjcmVhdGVPbmVCeXRlQnVmZmVyKERhdGFUeXBlLkJ1ZmZlciksXG5cdFZTQnVmZmVyOiBjcmVhdGVPbmVCeXRlQnVmZmVyKERhdGFUeXBlLlZTQnVmZmVyKSxcblx0QXJyYXk6IGNyZWF0ZU9uZUJ5dGVCdWZmZXIoRGF0YVR5cGUuQXJyYXkpLFxuXHRPYmplY3Q6IGNyZWF0ZU9uZUJ5dGVCdWZmZXIoRGF0YVR5cGUuT2JqZWN0KSxcblx0VWludDogY3JlYXRlT25lQnl0ZUJ1ZmZlcihEYXRhVHlwZS5JbnQpLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZSh3cml0ZXI6IElXcml0ZXIsIGRhdGE6IGFueSk6IHZvaWQge1xuXHRpZiAodHlwZW9mIGRhdGEgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0d3JpdGVyLndyaXRlKEJ1ZmZlclByZXNldHMuVW5kZWZpbmVkKTtcblx0fSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycpIHtcblx0XHRjb25zdCBidWZmZXIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGRhdGEpO1xuXHRcdHdyaXRlci53cml0ZShCdWZmZXJQcmVzZXRzLlN0cmluZyk7XG5cdFx0d3JpdGVJbnQzMlZRTCh3cml0ZXIsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHR3cml0ZXIud3JpdGUoYnVmZmVyKTtcblx0fSBlbHNlIGlmIChWU0J1ZmZlci5pc05hdGl2ZUJ1ZmZlcihkYXRhKSkge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLndyYXAoZGF0YSk7XG5cdFx0d3JpdGVyLndyaXRlKEJ1ZmZlclByZXNldHMuQnVmZmVyKTtcblx0XHR3cml0ZUludDMyVlFMKHdyaXRlciwgYnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdHdyaXRlci53cml0ZShidWZmZXIpO1xuXHR9IGVsc2UgaWYgKGRhdGEgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdHdyaXRlci53cml0ZShCdWZmZXJQcmVzZXRzLlZTQnVmZmVyKTtcblx0XHR3cml0ZUludDMyVlFMKHdyaXRlciwgZGF0YS5ieXRlTGVuZ3RoKTtcblx0XHR3cml0ZXIud3JpdGUoZGF0YSk7XG5cdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdHdyaXRlci53cml0ZShCdWZmZXJQcmVzZXRzLkFycmF5KTtcblx0XHR3cml0ZUludDMyVlFMKHdyaXRlciwgZGF0YS5sZW5ndGgpO1xuXG5cdFx0Zm9yIChjb25zdCBlbCBvZiBkYXRhKSB7XG5cdFx0XHRzZXJpYWxpemUod3JpdGVyLCBlbCk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnbnVtYmVyJyAmJiAoZGF0YSB8IDApID09PSBkYXRhKSB7XG5cdFx0Ly8gd3JpdGUgYSB2cWwgaWYgaXQncyBhIG51bWJlciB0aGF0IHdlIGNhbiBkbyBiaXR3aXNlIG9wZXJhdGlvbnMgb25cblx0XHR3cml0ZXIud3JpdGUoQnVmZmVyUHJlc2V0cy5VaW50KTtcblx0XHR3cml0ZUludDMyVlFMKHdyaXRlciwgZGF0YSk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShkYXRhKSk7XG5cdFx0d3JpdGVyLndyaXRlKEJ1ZmZlclByZXNldHMuT2JqZWN0KTtcblx0XHR3cml0ZUludDMyVlFMKHdyaXRlciwgYnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdHdyaXRlci53cml0ZShidWZmZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXNlcmlhbGl6ZShyZWFkZXI6IElSZWFkZXIpOiBhbnkge1xuXHRjb25zdCB0eXBlID0gcmVhZGVyLnJlYWQoMSkucmVhZFVJbnQ4KDApO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgRGF0YVR5cGUuVW5kZWZpbmVkOiByZXR1cm4gdW5kZWZpbmVkO1xuXHRcdGNhc2UgRGF0YVR5cGUuU3RyaW5nOiByZXR1cm4gcmVhZGVyLnJlYWQocmVhZEludFZRTChyZWFkZXIpKS50b1N0cmluZygpO1xuXHRcdGNhc2UgRGF0YVR5cGUuQnVmZmVyOiByZXR1cm4gcmVhZGVyLnJlYWQocmVhZEludFZRTChyZWFkZXIpKS5idWZmZXI7XG5cdFx0Y2FzZSBEYXRhVHlwZS5WU0J1ZmZlcjogcmV0dXJuIHJlYWRlci5yZWFkKHJlYWRJbnRWUUwocmVhZGVyKSk7XG5cdFx0Y2FzZSBEYXRhVHlwZS5BcnJheToge1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gcmVhZEludFZRTChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBhbnlbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGRlc2VyaWFsaXplKHJlYWRlcikpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRjYXNlIERhdGFUeXBlLk9iamVjdDogcmV0dXJuIEpTT04ucGFyc2UocmVhZGVyLnJlYWQocmVhZEludFZRTChyZWFkZXIpKS50b1N0cmluZygpKTtcblx0XHRjYXNlIERhdGFUeXBlLkludDogcmV0dXJuIHJlYWRJbnRWUUwocmVhZGVyKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUGVuZGluZ1JlcXVlc3Qge1xuXHRyZXF1ZXN0OiBJUmF3UHJvbWlzZVJlcXVlc3QgfCBJUmF3RXZlbnRMaXN0ZW5SZXF1ZXN0O1xuXHR0aW1lb3V0VGltZXI6IFRpbWVvdXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGFubmVsU2VydmVyPFRDb250ZXh0ID0gc3RyaW5nPiBpbXBsZW1lbnRzIElDaGFubmVsU2VydmVyPFRDb250ZXh0PiwgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgY2hhbm5lbHMgPSBuZXcgTWFwPHN0cmluZywgSVNlcnZlckNoYW5uZWw8VENvbnRleHQ+PigpO1xuXHRwcml2YXRlIGFjdGl2ZVJlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHByb3RvY29sTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgbnVsbDtcblxuXHQvLyBSZXF1ZXN0cyBtaWdodCBjb21lIGluIGZvciBjaGFubmVscyB3aGljaCBhcmUgbm90IHlldCByZWdpc3RlcmVkLlxuXHQvLyBUaGV5IHdpbGwgdGltZW91dCBhZnRlciBgdGltZW91dERlbGF5YC5cblx0cHJpdmF0ZSBwZW5kaW5nUmVxdWVzdHMgPSBuZXcgTWFwPHN0cmluZywgUGVuZGluZ1JlcXVlc3RbXT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCwgcHJpdmF0ZSBjdHg6IFRDb250ZXh0LCBwcml2YXRlIGxvZ2dlcjogSUlQQ0xvZ2dlciB8IG51bGwgPSBudWxsLCBwcml2YXRlIHRpbWVvdXREZWxheSA9IDEwMDApIHtcblx0XHR0aGlzLnByb3RvY29sTGlzdGVuZXIgPSB0aGlzLnByb3RvY29sLm9uTWVzc2FnZShtc2cgPT4gdGhpcy5vblJhd01lc3NhZ2UobXNnKSk7XG5cdFx0dGhpcy5zZW5kUmVzcG9uc2UoeyB0eXBlOiBSZXNwb25zZVR5cGUuSW5pdGlhbGl6ZSB9KTtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4pOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5uZWxzLnNldChjaGFubmVsTmFtZSwgY2hhbm5lbCk7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzI1MzFcblx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuZmx1c2hQZW5kaW5nUmVxdWVzdHMoY2hhbm5lbE5hbWUpLCAwKTtcblx0fVxuXG5cdHByaXZhdGUgc2VuZFJlc3BvbnNlKHJlc3BvbnNlOiBJUmF3UmVzcG9uc2UpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHJlc3BvbnNlLnR5cGUpIHtcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLkluaXRpYWxpemU6IHtcblx0XHRcdFx0Y29uc3QgbXNnTGVuZ3RoID0gdGhpcy5zZW5kKFtyZXNwb25zZS50eXBlXSk7XG5cdFx0XHRcdHRoaXMubG9nZ2VyPy5sb2dPdXRnb2luZyhtc2dMZW5ndGgsIDAsIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCByZXNwb25zZVR5cGVUb1N0cihyZXNwb25zZS50eXBlKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBSZXNwb25zZVR5cGUuUHJvbWlzZVN1Y2Nlc3M6XG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3I6XG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5FdmVudEZpcmU6XG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3JPYmo6IHtcblx0XHRcdFx0Y29uc3QgbXNnTGVuZ3RoID0gdGhpcy5zZW5kKFtyZXNwb25zZS50eXBlLCByZXNwb25zZS5pZF0sIHJlc3BvbnNlLmRhdGEpO1xuXHRcdFx0XHR0aGlzLmxvZ2dlcj8ubG9nT3V0Z29pbmcobXNnTGVuZ3RoLCByZXNwb25zZS5pZCwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIHJlc3BvbnNlVHlwZVRvU3RyKHJlc3BvbnNlLnR5cGUpLCByZXNwb25zZS5kYXRhKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2VuZChoZWFkZXI6IHVua25vd24sIGJvZHk6IGFueSA9IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgd3JpdGVyID0gbmV3IEJ1ZmZlcldyaXRlcigpO1xuXHRcdHRyeSB7XG5cdFx0XHRzZXJpYWxpemUod3JpdGVyLCBoZWFkZXIpO1xuXHRcdFx0c2VyaWFsaXplKHdyaXRlciwgYm9keSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kQnVmZmVyKHdyaXRlci5idWZmZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR3cml0ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2VuZEJ1ZmZlcihtZXNzYWdlOiBWU0J1ZmZlcik6IG51bWJlciB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMucHJvdG9jb2wuc2VuZChtZXNzYWdlKTtcblx0XHRcdHJldHVybiBtZXNzYWdlLmJ5dGVMZW5ndGg7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBub29wXG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUmF3TWVzc2FnZShtZXNzYWdlOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlYWRlciA9IG5ldyBCdWZmZXJSZWFkZXIobWVzc2FnZSk7XG5cdFx0Y29uc3QgaGVhZGVyID0gZGVzZXJpYWxpemUocmVhZGVyKTtcblx0XHRjb25zdCBib2R5ID0gZGVzZXJpYWxpemUocmVhZGVyKTtcblx0XHRjb25zdCB0eXBlID0gaGVhZGVyWzBdIGFzIFJlcXVlc3RUeXBlO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFJlcXVlc3RUeXBlLlByb21pc2U6XG5cdFx0XHRcdHRoaXMubG9nZ2VyPy5sb2dJbmNvbWluZyhtZXNzYWdlLmJ5dGVMZW5ndGgsIGhlYWRlclsxXSwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIGAke3JlcXVlc3RUeXBlVG9TdHIodHlwZSl9OiAke2hlYWRlclsyXX0uJHtoZWFkZXJbM119YCwgYm9keSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLm9uUHJvbWlzZSh7IHR5cGUsIGlkOiBoZWFkZXJbMV0sIGNoYW5uZWxOYW1lOiBoZWFkZXJbMl0sIG5hbWU6IGhlYWRlclszXSwgYXJnOiBib2R5IH0pO1xuXHRcdFx0Y2FzZSBSZXF1ZXN0VHlwZS5FdmVudExpc3Rlbjpcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ0luY29taW5nKG1lc3NhZ2UuYnl0ZUxlbmd0aCwgaGVhZGVyWzFdLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgYCR7cmVxdWVzdFR5cGVUb1N0cih0eXBlKX06ICR7aGVhZGVyWzJdfS4ke2hlYWRlclszXX1gLCBib2R5KTtcblx0XHRcdFx0cmV0dXJuIHRoaXMub25FdmVudExpc3Rlbih7IHR5cGUsIGlkOiBoZWFkZXJbMV0sIGNoYW5uZWxOYW1lOiBoZWFkZXJbMl0sIG5hbWU6IGhlYWRlclszXSwgYXJnOiBib2R5IH0pO1xuXHRcdFx0Y2FzZSBSZXF1ZXN0VHlwZS5Qcm9taXNlQ2FuY2VsOlxuXHRcdFx0XHR0aGlzLmxvZ2dlcj8ubG9nSW5jb21pbmcobWVzc2FnZS5ieXRlTGVuZ3RoLCBoZWFkZXJbMV0sIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCBgJHtyZXF1ZXN0VHlwZVRvU3RyKHR5cGUpfWApO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5kaXNwb3NlQWN0aXZlUmVxdWVzdCh7IHR5cGUsIGlkOiBoZWFkZXJbMV0gfSk7XG5cdFx0XHRjYXNlIFJlcXVlc3RUeXBlLkV2ZW50RGlzcG9zZTpcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ0luY29taW5nKG1lc3NhZ2UuYnl0ZUxlbmd0aCwgaGVhZGVyWzFdLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgYCR7cmVxdWVzdFR5cGVUb1N0cih0eXBlKX1gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZGlzcG9zZUFjdGl2ZVJlcXVlc3QoeyB0eXBlLCBpZDogaGVhZGVyWzFdIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Qcm9taXNlKHJlcXVlc3Q6IElSYXdQcm9taXNlUmVxdWVzdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmNoYW5uZWxzLmdldChyZXF1ZXN0LmNoYW5uZWxOYW1lKTtcblxuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0dGhpcy5jb2xsZWN0UGVuZGluZ1JlcXVlc3QocmVxdWVzdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTxhbnk+O1xuXG5cdFx0dHJ5IHtcblx0XHRcdHByb21pc2UgPSBjaGFubmVsLmNhbGwodGhpcy5jdHgsIHJlcXVlc3QubmFtZSwgcmVxdWVzdC5hcmcsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHByb21pc2UgPSBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkID0gcmVxdWVzdC5pZDtcblxuXHRcdHByb21pc2UudGhlbihkYXRhID0+IHtcblx0XHRcdHRoaXMuc2VuZFJlc3BvbnNlKHsgaWQsIGRhdGEsIHR5cGU6IFJlc3BvbnNlVHlwZS5Qcm9taXNlU3VjY2VzcyB9KTtcblx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHRoaXMuc2VuZFJlc3BvbnNlKHtcblx0XHRcdFx0XHRpZCwgZGF0YToge1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyLm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRuYW1lOiBlcnIubmFtZSxcblx0XHRcdFx0XHRcdHN0YWNrOiBlcnIuc3RhY2sgPyBlcnIuc3RhY2suc3BsaXQoJ1xcbicpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSwgdHlwZTogUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvclxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2VuZFJlc3BvbnNlKHsgaWQsIGRhdGE6IGVyciwgdHlwZTogUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvck9iaiB9KTtcblx0XHRcdH1cblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5kZWxldGUocmVxdWVzdC5pZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IGNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpKTtcblx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLnNldChyZXF1ZXN0LmlkLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgb25FdmVudExpc3RlbihyZXF1ZXN0OiBJUmF3RXZlbnRMaXN0ZW5SZXF1ZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuY2hhbm5lbHMuZ2V0KHJlcXVlc3QuY2hhbm5lbE5hbWUpO1xuXG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHR0aGlzLmNvbGxlY3RQZW5kaW5nUmVxdWVzdChyZXF1ZXN0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpZCA9IHJlcXVlc3QuaWQ7XG5cdFx0Y29uc3QgZXZlbnQgPSBjaGFubmVsLmxpc3Rlbih0aGlzLmN0eCwgcmVxdWVzdC5uYW1lLCByZXF1ZXN0LmFyZyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV2ZW50KGRhdGEgPT4gdGhpcy5zZW5kUmVzcG9uc2UoeyBpZCwgZGF0YSwgdHlwZTogUmVzcG9uc2VUeXBlLkV2ZW50RmlyZSB9KSk7XG5cblx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLnNldChyZXF1ZXN0LmlkLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUFjdGl2ZVJlcXVlc3QocmVxdWVzdDogSVJhd1JlcXVlc3QpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5hY3RpdmVSZXF1ZXN0cy5nZXQocmVxdWVzdC5pZCk7XG5cblx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLmRlbGV0ZShyZXF1ZXN0LmlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbGxlY3RQZW5kaW5nUmVxdWVzdChyZXF1ZXN0OiBJUmF3UHJvbWlzZVJlcXVlc3QgfCBJUmF3RXZlbnRMaXN0ZW5SZXF1ZXN0KTogdm9pZCB7XG5cdFx0bGV0IHBlbmRpbmdSZXF1ZXN0cyA9IHRoaXMucGVuZGluZ1JlcXVlc3RzLmdldChyZXF1ZXN0LmNoYW5uZWxOYW1lKTtcblxuXHRcdGlmICghcGVuZGluZ1JlcXVlc3RzKSB7XG5cdFx0XHRwZW5kaW5nUmVxdWVzdHMgPSBbXTtcblx0XHRcdHRoaXMucGVuZGluZ1JlcXVlc3RzLnNldChyZXF1ZXN0LmNoYW5uZWxOYW1lLCBwZW5kaW5nUmVxdWVzdHMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBVbmtub3duIGNoYW5uZWw6ICR7cmVxdWVzdC5jaGFubmVsTmFtZX1gKTtcblxuXHRcdFx0aWYgKHJlcXVlc3QudHlwZSA9PT0gUmVxdWVzdFR5cGUuUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLnNlbmRSZXNwb25zZSh7XG5cdFx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdFx0ZGF0YTogeyBuYW1lOiAnVW5rbm93biBjaGFubmVsJywgbWVzc2FnZTogYENoYW5uZWwgbmFtZSAnJHtyZXF1ZXN0LmNoYW5uZWxOYW1lfScgdGltZWQgb3V0IGFmdGVyICR7dGhpcy50aW1lb3V0RGVsYXl9bXNgLCBzdGFjazogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0dHlwZTogUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvclxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9LCB0aGlzLnRpbWVvdXREZWxheSk7XG5cblx0XHRwZW5kaW5nUmVxdWVzdHMucHVzaCh7IHJlcXVlc3QsIHRpbWVvdXRUaW1lcjogdGltZXIgfSk7XG5cdH1cblxuXHRwcml2YXRlIGZsdXNoUGVuZGluZ1JlcXVlc3RzKGNoYW5uZWxOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByZXF1ZXN0cyA9IHRoaXMucGVuZGluZ1JlcXVlc3RzLmdldChjaGFubmVsTmFtZSk7XG5cblx0XHRpZiAocmVxdWVzdHMpIHtcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiByZXF1ZXN0cykge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQocmVxdWVzdC50aW1lb3V0VGltZXIpO1xuXG5cdFx0XHRcdHN3aXRjaCAocmVxdWVzdC5yZXF1ZXN0LnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlIFJlcXVlc3RUeXBlLlByb21pc2U6IHRoaXMub25Qcm9taXNlKHJlcXVlc3QucmVxdWVzdCk7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW46IHRoaXMub25FdmVudExpc3RlbihyZXF1ZXN0LnJlcXVlc3QpOyBicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5kZWxldGUoY2hhbm5lbE5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnByb3RvY29sTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMucHJvdG9jb2xMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnByb3RvY29sTGlzdGVuZXIgPSBudWxsO1xuXHRcdH1cblx0XHRkaXNwb3NlKHRoaXMuYWN0aXZlUmVxdWVzdHMudmFsdWVzKCkpO1xuXHRcdHRoaXMuYWN0aXZlUmVxdWVzdHMuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBSZXF1ZXN0SW5pdGlhdG9yIHtcblx0TG9jYWxTaWRlID0gMCxcblx0T3RoZXJTaWRlID0gMVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJUENMb2dnZXIge1xuXHRsb2dJbmNvbWluZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkO1xuXHRsb2dPdXRnb2luZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhbm5lbENsaWVudCBpbXBsZW1lbnRzIElDaGFubmVsQ2xpZW50LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgc3RhdGU6IFN0YXRlID0gU3RhdGUuVW5pbml0aWFsaXplZDtcblx0cHJpdmF0ZSBhY3RpdmVSZXF1ZXN0cyA9IG5ldyBTZXQ8SURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgaGFuZGxlcnMgPSBuZXcgTWFwPG51bWJlciwgSUhhbmRsZXI+KCk7XG5cdHByaXZhdGUgbGFzdFJlcXVlc3RJZCA9IDA7XG5cdHByaXZhdGUgcHJvdG9jb2xMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCBudWxsO1xuXHRwcml2YXRlIGxvZ2dlcjogSUlQQ0xvZ2dlciB8IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWFsaXplID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRJbml0aWFsaXplID0gdGhpcy5fb25EaWRJbml0aWFsaXplLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBsb2dnZXI6IElJUENMb2dnZXIgfCBudWxsID0gbnVsbCkge1xuXHRcdHRoaXMucHJvdG9jb2xMaXN0ZW5lciA9IHRoaXMucHJvdG9jb2wub25NZXNzYWdlKG1zZyA9PiB0aGlzLm9uQnVmZmVyKG1zZykpO1xuXHRcdHRoaXMubG9nZ2VyID0gbG9nZ2VyO1xuXHR9XG5cblx0Z2V0Q2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KGNoYW5uZWxOYW1lOiBzdHJpbmcpOiBUIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2FsbChjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRpZiAodGhhdC5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhhdC5yZXF1ZXN0UHJvbWlzZShjaGFubmVsTmFtZSwgY29tbWFuZCwgYXJnLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0bGlzdGVuKGV2ZW50OiBzdHJpbmcsIGFyZzogYW55KSB7XG5cdFx0XHRcdGlmICh0aGF0LmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gRXZlbnQuTm9uZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhhdC5yZXF1ZXN0RXZlbnQoY2hhbm5lbE5hbWUsIGV2ZW50LCBhcmcpO1xuXHRcdFx0fVxuXHRcdH0gYXMgVDtcblx0fVxuXG5cdHByaXZhdGUgcmVxdWVzdFByb21pc2UoY2hhbm5lbE5hbWU6IHN0cmluZywgbmFtZTogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5sYXN0UmVxdWVzdElkKys7XG5cdFx0Y29uc3QgdHlwZSA9IFJlcXVlc3RUeXBlLlByb21pc2U7XG5cdFx0Y29uc3QgcmVxdWVzdDogSVJhd1JlcXVlc3QgPSB7IGlkLCB0eXBlLCBjaGFubmVsTmFtZSwgbmFtZSwgYXJnIH07XG5cblx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0fVxuXG5cdFx0bGV0IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRcdGxldCBkaXNwb3NhYmxlV2l0aFJlcXVlc3RDYW5jZWw6IElEaXNwb3NhYmxlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2UoKGMsIGUpID0+IHtcblx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gZShuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRvUmVxdWVzdCA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlcjogSUhhbmRsZXIgPSByZXNwb25zZSA9PiB7XG5cdFx0XHRcdFx0c3dpdGNoIChyZXNwb25zZS50eXBlKSB7XG5cdFx0XHRcdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlU3VjY2Vzczpcblx0XHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVycy5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdFx0XHRjKHJlc3BvbnNlLmRhdGEpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdFx0Y2FzZSBSZXNwb25zZVR5cGUuUHJvbWlzZUVycm9yOiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IocmVzcG9uc2UuZGF0YS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdFx0ZXJyb3Iuc3RhY2sgPSBBcnJheS5pc0FycmF5KHJlc3BvbnNlLmRhdGEuc3RhY2spID8gcmVzcG9uc2UuZGF0YS5zdGFjay5qb2luKCdcXG4nKSA6IHJlc3BvbnNlLmRhdGEuc3RhY2s7XG5cdFx0XHRcdFx0XHRcdGVycm9yLm5hbWUgPSByZXNwb25zZS5kYXRhLm5hbWU7XG5cdFx0XHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvck9iajpcblx0XHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVycy5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdFx0XHRlKHJlc3BvbnNlLmRhdGEpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dGhpcy5oYW5kbGVycy5zZXQoaWQsIGhhbmRsZXIpO1xuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5zZW5kUmVxdWVzdChyZXF1ZXN0KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gYHNlbmRSZXF1ZXN0YCBjYW4gdGhyb3cgc3luY2hyb25vdXNseSB3aGlsZSBzZXJpYWxpemluZyB0aGVcblx0XHRcdFx0XHQvLyByZXF1ZXN0IChlLmcuIGFuIG92ZXJzaXplZCBhcmd1bWVudCkuIFRoZSBoYW5kbGVyIHdhcyBqdXN0XG5cdFx0XHRcdFx0Ly8gcmVnaXN0ZXJlZCBidXQgbm8gcmVxdWVzdCB3ZW50IG91dCBhbmQgaXQncyBvbmx5IHJlbW92ZWQgb24gYVxuXHRcdFx0XHRcdC8vIHJlc3BvbnNlLCBzbyB3aXRob3V0IHRoaXMgaXQgd291bGQgbGVhayAoYWxvbmcgd2l0aCB0aGUgcmVqZWN0ZWRcblx0XHRcdFx0XHQvLyBwcm9taXNlIGFuZCBlcnJvciBpdCByZXRhaW5zKS4gQ2xlYW4gdXAgYW5kIHJlamVjdC5cblx0XHRcdFx0XHR0aGlzLmhhbmRsZXJzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdFx0ZShlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgdW5pbml0aWFsaXplZFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gU3RhdGUuSWRsZSkge1xuXHRcdFx0XHRkb1JlcXVlc3QoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoXyA9PiB0aGlzLndoZW5Jbml0aWFsaXplZCgpKTtcblx0XHRcdFx0dW5pbml0aWFsaXplZFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0dW5pbml0aWFsaXplZFByb21pc2UgPSBudWxsO1xuXHRcdFx0XHRcdGRvUmVxdWVzdCgpO1xuXHRcdFx0XHR9LCAoKSA9PiB7IH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjYW5jZWwgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh1bmluaXRpYWxpemVkUHJvbWlzZSkge1xuXHRcdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlID0gbnVsbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNlbmRSZXF1ZXN0KHsgaWQsIHR5cGU6IFJlcXVlc3RUeXBlLlByb21pc2VDYW5jZWwgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGUgPSBjYW5jZWxsYXRpb25Ub2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChjYW5jZWwpO1xuXHRcdFx0ZGlzcG9zYWJsZVdpdGhSZXF1ZXN0Q2FuY2VsID0ge1xuXHRcdFx0XHRkaXNwb3NlOiBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHRcdGNhbmNlbCgpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5hZGQoZGlzcG9zYWJsZVdpdGhSZXF1ZXN0Q2FuY2VsKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlPy5kaXNwb3NlKCk7IC8vIFNlZW4gYXMgdW5kZWZpbmVkIGluIHRlc3RzLlxuXHRcdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5kZWxldGUoZGlzcG9zYWJsZVdpdGhSZXF1ZXN0Q2FuY2VsKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVxdWVzdEV2ZW50KGNoYW5uZWxOYW1lOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8YW55PiB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLmxhc3RSZXF1ZXN0SWQrKztcblx0XHRjb25zdCB0eXBlID0gUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW47XG5cdFx0Y29uc3QgcmVxdWVzdDogSVJhd1JlcXVlc3QgPSB7IGlkLCB0eXBlLCBjaGFubmVsTmFtZSwgbmFtZSwgYXJnIH07XG5cblx0XHRsZXQgdW5pbml0aWFsaXplZFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8YW55Pih7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZXI6IElIYW5kbGVyID0gKHJlczogSVJhd1Jlc3BvbnNlKSA9PiBlbWl0dGVyLmZpcmUoKHJlcyBhcyBJUmF3RXZlbnRGaXJlUmVzcG9uc2UpLmRhdGEpO1xuXHRcdFx0XHR0aGlzLmhhbmRsZXJzLnNldChpZCwgaGFuZGxlcik7XG5cdFx0XHRcdGNvbnN0IGRvUmVxdWVzdCA9ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLmFkZChlbWl0dGVyKTtcblx0XHRcdFx0XHR0aGlzLnNlbmRSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gU3RhdGUuSWRsZSkge1xuXHRcdFx0XHRcdGRvUmVxdWVzdCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoXyA9PiB0aGlzLndoZW5Jbml0aWFsaXplZCgpKTtcblx0XHRcdFx0XHR1bmluaXRpYWxpemVkUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlID0gbnVsbDtcblx0XHRcdFx0XHRcdGRvUmVxdWVzdCgpO1xuXHRcdFx0XHRcdH0sICgpID0+IHsgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRpZiAodW5pbml0aWFsaXplZFByb21pc2UpIHtcblx0XHRcdFx0XHR1bmluaXRpYWxpemVkUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0XHR1bmluaXRpYWxpemVkUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5kZWxldGUoZW1pdHRlcik7XG5cdFx0XHRcdFx0dGhpcy5zZW5kUmVxdWVzdCh7IGlkLCB0eXBlOiBSZXF1ZXN0VHlwZS5FdmVudERpc3Bvc2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5oYW5kbGVycy5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRSZXF1ZXN0KHJlcXVlc3Q6IElSYXdSZXF1ZXN0KTogdm9pZCB7XG5cdFx0c3dpdGNoIChyZXF1ZXN0LnR5cGUpIHtcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuUHJvbWlzZTpcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW46IHtcblx0XHRcdFx0Y29uc3QgbXNnTGVuZ3RoID0gdGhpcy5zZW5kKFtyZXF1ZXN0LnR5cGUsIHJlcXVlc3QuaWQsIHJlcXVlc3QuY2hhbm5lbE5hbWUsIHJlcXVlc3QubmFtZV0sIHJlcXVlc3QuYXJnKTtcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ091dGdvaW5nKG1zZ0xlbmd0aCwgcmVxdWVzdC5pZCwgUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUsIGAke3JlcXVlc3RUeXBlVG9TdHIocmVxdWVzdC50eXBlKX06ICR7cmVxdWVzdC5jaGFubmVsTmFtZX0uJHtyZXF1ZXN0Lm5hbWV9YCwgcmVxdWVzdC5hcmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuUHJvbWlzZUNhbmNlbDpcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnREaXNwb3NlOiB7XG5cdFx0XHRcdGNvbnN0IG1zZ0xlbmd0aCA9IHRoaXMuc2VuZChbcmVxdWVzdC50eXBlLCByZXF1ZXN0LmlkXSk7XG5cdFx0XHRcdHRoaXMubG9nZ2VyPy5sb2dPdXRnb2luZyhtc2dMZW5ndGgsIHJlcXVlc3QuaWQsIFJlcXVlc3RJbml0aWF0b3IuTG9jYWxTaWRlLCByZXF1ZXN0VHlwZVRvU3RyKHJlcXVlc3QudHlwZSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZW5kKGhlYWRlcjogdW5rbm93biwgYm9keTogYW55ID0gdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0XHRjb25zdCB3cml0ZXIgPSBuZXcgQnVmZmVyV3JpdGVyKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHNlcmlhbGl6ZSh3cml0ZXIsIGhlYWRlcik7XG5cdFx0XHRzZXJpYWxpemUod3JpdGVyLCBib2R5KTtcblx0XHRcdHJldHVybiB0aGlzLnNlbmRCdWZmZXIod3JpdGVyLmJ1ZmZlcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHdyaXRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZW5kQnVmZmVyKG1lc3NhZ2U6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5wcm90b2NvbC5zZW5kKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIG1lc3NhZ2UuYnl0ZUxlbmd0aDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIG5vb3Bcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25CdWZmZXIobWVzc2FnZTogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRjb25zdCByZWFkZXIgPSBuZXcgQnVmZmVyUmVhZGVyKG1lc3NhZ2UpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRlc2VyaWFsaXplKHJlYWRlcik7XG5cdFx0Y29uc3QgYm9keSA9IGRlc2VyaWFsaXplKHJlYWRlcik7XG5cdFx0Y29uc3QgdHlwZTogUmVzcG9uc2VUeXBlID0gaGVhZGVyWzBdO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplOlxuXHRcdFx0XHR0aGlzLmxvZ2dlcj8ubG9nSW5jb21pbmcobWVzc2FnZS5ieXRlTGVuZ3RoLCAwLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgcmVzcG9uc2VUeXBlVG9TdHIodHlwZSkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vblJlc3BvbnNlKHsgdHlwZTogaGVhZGVyWzBdIH0pO1xuXG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlU3VjY2Vzczpcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvcjpcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLkV2ZW50RmlyZTpcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvck9iajpcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ0luY29taW5nKG1lc3NhZ2UuYnl0ZUxlbmd0aCwgaGVhZGVyWzFdLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgcmVzcG9uc2VUeXBlVG9TdHIodHlwZSksIGJvZHkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vblJlc3BvbnNlKHsgdHlwZTogaGVhZGVyWzBdLCBpZDogaGVhZGVyWzFdLCBkYXRhOiBib2R5IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25SZXNwb25zZShyZXNwb25zZTogSVJhd1Jlc3BvbnNlKTogdm9pZCB7XG5cdFx0aWYgKHJlc3BvbnNlLnR5cGUgPT09IFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplKSB7XG5cdFx0XHR0aGlzLnN0YXRlID0gU3RhdGUuSWRsZTtcblx0XHRcdHRoaXMuX29uRGlkSW5pdGlhbGl6ZS5maXJlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuaGFuZGxlcnMuZ2V0KHJlc3BvbnNlLmlkKTtcblxuXHRcdGhhbmRsZXI/LihyZXNwb25zZSk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25EaWRJbml0aWFsaXplUHJvbWlzZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gRXZlbnQudG9Qcm9taXNlKHRoaXMub25EaWRJbml0aWFsaXplKTtcblx0fVxuXG5cdHByaXZhdGUgd2hlbkluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0YXRlID09PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLm9uRGlkSW5pdGlhbGl6ZVByb21pc2U7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdGlmICh0aGlzLnByb3RvY29sTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMucHJvdG9jb2xMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnByb3RvY29sTGlzdGVuZXIgPSBudWxsO1xuXHRcdH1cblx0XHRkaXNwb3NlKHRoaXMuYWN0aXZlUmVxdWVzdHMudmFsdWVzKCkpO1xuXHRcdHRoaXMuYWN0aXZlUmVxdWVzdHMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZEluaXRpYWxpemUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xpZW50Q29ubmVjdGlvbkV2ZW50IHtcblx0cHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sO1xuXHRyZWFkb25seSBvbkRpZENsaWVudERpc2Nvbm5lY3Q6IEV2ZW50PHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdGlvbjxUQ29udGV4dD4gZXh0ZW5kcyBDbGllbnQ8VENvbnRleHQ+IHtcblx0cmVhZG9ubHkgY2hhbm5lbFNlcnZlcjogQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD47XG5cdHJlYWRvbmx5IGNoYW5uZWxDbGllbnQ6IENoYW5uZWxDbGllbnQ7XG59XG5cbi8qKlxuICogQW4gYElQQ1NlcnZlcmAgaXMgYm90aCBhIGNoYW5uZWwgc2VydmVyIGFuZCBhIHJvdXRpbmcgY2hhbm5lbFxuICogY2xpZW50LlxuICpcbiAqIEFzIHRoZSBvd25lciBvZiBhIHByb3RvY29sLCB5b3Ugc2hvdWxkIGV4dGVuZCBib3RoIHRoaXNcbiAqIGFuZCB0aGUgYElQQ0NsaWVudGAgY2xhc3NlcyB0byBnZXQgSVBDIGltcGxlbWVudGF0aW9uc1xuICogZm9yIHlvdXIgcHJvdG9jb2wuXG4gKi9cbmV4cG9ydCBjbGFzcyBJUENTZXJ2ZXI8VENvbnRleHQgPSBzdHJpbmc+IGltcGxlbWVudHMgSUNoYW5uZWxTZXJ2ZXI8VENvbnRleHQ+LCBJUm91dGluZ0NoYW5uZWxDbGllbnQ8VENvbnRleHQ+LCBJQ29ubmVjdGlvbkh1YjxUQ29udGV4dD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGNoYW5uZWxzID0gbmV3IE1hcDxzdHJpbmcsIElTZXJ2ZXJDaGFubmVsPFRDb250ZXh0Pj4oKTtcblx0cHJpdmF0ZSBfY29ubmVjdGlvbnMgPSBuZXcgU2V0PENvbm5lY3Rpb248VENvbnRleHQ+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkQ29ubmVjdGlvbiA9IG5ldyBFbWl0dGVyPENvbm5lY3Rpb248VENvbnRleHQ+PigpO1xuXHRyZWFkb25seSBvbkRpZEFkZENvbm5lY3Rpb246IEV2ZW50PENvbm5lY3Rpb248VENvbnRleHQ+PiA9IHRoaXMuX29uRGlkQWRkQ29ubmVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUNvbm5lY3Rpb24gPSBuZXcgRW1pdHRlcjxDb25uZWN0aW9uPFRDb250ZXh0Pj4oKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVDb25uZWN0aW9uOiBFdmVudDxDb25uZWN0aW9uPFRDb250ZXh0Pj4gPSB0aGlzLl9vbkRpZFJlbW92ZUNvbm5lY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRnZXQgY29ubmVjdGlvbnMoKTogQ29ubmVjdGlvbjxUQ29udGV4dD5bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBDb25uZWN0aW9uPFRDb250ZXh0PltdID0gW107XG5cdFx0dGhpcy5fY29ubmVjdGlvbnMuZm9yRWFjaChjdHggPT4gcmVzdWx0LnB1c2goY3R4KSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG9uRGlkQ2xpZW50Q29ubmVjdDogRXZlbnQ8Q2xpZW50Q29ubmVjdGlvbkV2ZW50PiwgaXBjTG9nZ2VyPzogSUlQQ0xvZ2dlciB8IG51bGwsIHRpbWVvdXREZWxheT86IG51bWJlcikge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uRGlkQ2xpZW50Q29ubmVjdCgoeyBwcm90b2NvbCwgb25EaWRDbGllbnREaXNjb25uZWN0IH0pID0+IHtcblx0XHRcdGNvbnN0IG9uRmlyc3RNZXNzYWdlID0gRXZlbnQub25jZShwcm90b2NvbC5vbk1lc3NhZ2UpO1xuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IG9uRmlyc3RNZXNzYWdlRGlzcG9zYWJsZSA9IG9uRmlyc3RNZXNzYWdlKG1zZyA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBCdWZmZXJSZWFkZXIobXNnKTtcblx0XHRcdFx0Y29uc3QgY3R4ID0gZGVzZXJpYWxpemUocmVhZGVyKSBhcyBUQ29udGV4dDtcblxuXHRcdFx0XHRjb25zdCBjaGFubmVsU2VydmVyID0gbmV3IENoYW5uZWxTZXJ2ZXIocHJvdG9jb2wsIGN0eCwgaXBjTG9nZ2VyLCB0aW1lb3V0RGVsYXkpO1xuXHRcdFx0XHRjb25zdCBjaGFubmVsQ2xpZW50ID0gbmV3IENoYW5uZWxDbGllbnQocHJvdG9jb2wsIGlwY0xvZ2dlcik7XG5cblx0XHRcdFx0dGhpcy5jaGFubmVscy5mb3JFYWNoKChjaGFubmVsLCBuYW1lKSA9PiBjaGFubmVsU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChuYW1lLCBjaGFubmVsKSk7XG5cblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbjogQ29ubmVjdGlvbjxUQ29udGV4dD4gPSB7IGNoYW5uZWxTZXJ2ZXIsIGNoYW5uZWxDbGllbnQsIGN0eCB9O1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5hZGQoY29ubmVjdGlvbik7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWRkQ29ubmVjdGlvbi5maXJlKGNvbm5lY3Rpb24pO1xuXG5cdFx0XHRcdGNvbm5lY3Rpb25EaXNwb3NhYmxlcy5hZGQob25EaWRDbGllbnREaXNjb25uZWN0KCgpID0+IHtcblx0XHRcdFx0XHRjaGFubmVsU2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRjaGFubmVsQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGUoY29ubmVjdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdmVDb25uZWN0aW9uLmZpcmUoY29ubmVjdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5kZWxldGUoY29ubmVjdGlvbkRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRjb25uZWN0aW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29ubmVjdGlvbkRpc3Bvc2FibGVzLmFkZChvbkZpcnN0TWVzc2FnZURpc3Bvc2FibGUpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY29ubmVjdGlvbkRpc3Bvc2FibGVzKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgY2hhbm5lbCBmcm9tIGEgcmVtb3RlIGNsaWVudC4gV2hlbiBwYXNzZWQgYSByb3V0ZXIsXG5cdCAqIG9uZSBjYW4gc3BlY2lmeSB3aGljaCBjbGllbnQgaXQgd2FudHMgdG8gY2FsbCBhbmQgbGlzdGVuIHRvL2Zyb20uXG5cdCAqIE90aGVyd2lzZSwgd2hlbiBjYWxsaW5nIHdpdGhvdXQgYSByb3V0ZXIsIGEgcmFuZG9tIGNsaWVudCB3aWxsXG5cdCAqIGJlIHNlbGVjdGVkIGFuZCB3aGVuIGxpc3RlbmluZyB3aXRob3V0IGEgcm91dGVyLCBldmVyeSBjbGllbnRcblx0ICogd2lsbCBiZSBsaXN0ZW5lZCB0by5cblx0ICovXG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nLCByb3V0ZXI6IElDbGllbnRSb3V0ZXI8VENvbnRleHQ+KTogVDtcblx0Z2V0Q2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KGNoYW5uZWxOYW1lOiBzdHJpbmcsIGNsaWVudEZpbHRlcjogKGNsaWVudDogQ2xpZW50PFRDb250ZXh0PikgPT4gYm9vbGVhbik6IFQ7XG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nLCByb3V0ZXJPckNsaWVudEZpbHRlcjogSUNsaWVudFJvdXRlcjxUQ29udGV4dD4gfCAoKGNsaWVudDogQ2xpZW50PFRDb250ZXh0PikgPT4gYm9vbGVhbikpOiBUIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2FsbChjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD4ge1xuXHRcdFx0XHRsZXQgY29ubmVjdGlvblByb21pc2U6IFByb21pc2U8Q2xpZW50PFRDb250ZXh0Pj47XG5cblx0XHRcdFx0aWYgKGlzRnVuY3Rpb24ocm91dGVyT3JDbGllbnRGaWx0ZXIpKSB7XG5cdFx0XHRcdFx0Ly8gd2hlbiBubyByb3V0ZXIgaXMgcHJvdmlkZWQsIHdlIGdvIHJhbmRvbSBjbGllbnQgcGlja2luZ1xuXHRcdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBnZXRSYW5kb21FbGVtZW50KHRoYXQuY29ubmVjdGlvbnMuZmlsdGVyKHJvdXRlck9yQ2xpZW50RmlsdGVyKSk7XG5cblx0XHRcdFx0XHRjb25uZWN0aW9uUHJvbWlzZSA9IGNvbm5lY3Rpb25cblx0XHRcdFx0XHRcdC8vIGlmIHdlIGZvdW5kIGEgY2xpZW50LCBsZXQncyBjYWxsIG9uIGl0XG5cdFx0XHRcdFx0XHQ/IFByb21pc2UucmVzb2x2ZShjb25uZWN0aW9uKVxuXHRcdFx0XHRcdFx0Ly8gZWxzZSwgbGV0J3Mgd2FpdCBmb3IgYSBjbGllbnQgdG8gY29tZSBhbG9uZ1xuXHRcdFx0XHRcdFx0OiBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRoYXQub25EaWRBZGRDb25uZWN0aW9uLCByb3V0ZXJPckNsaWVudEZpbHRlcikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbm5lY3Rpb25Qcm9taXNlID0gcm91dGVyT3JDbGllbnRGaWx0ZXIucm91dGVDYWxsKHRoYXQsIGNvbW1hbmQsIGFyZyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjaGFubmVsUHJvbWlzZSA9IGNvbm5lY3Rpb25Qcm9taXNlXG5cdFx0XHRcdFx0LnRoZW4oY29ubmVjdGlvbiA9PiAoY29ubmVjdGlvbiBhcyBDb25uZWN0aW9uPFRDb250ZXh0PikuY2hhbm5lbENsaWVudC5nZXRDaGFubmVsKGNoYW5uZWxOYW1lKSk7XG5cblx0XHRcdFx0cmV0dXJuIGdldERlbGF5ZWRDaGFubmVsKGNoYW5uZWxQcm9taXNlKVxuXHRcdFx0XHRcdC5jYWxsKGNvbW1hbmQsIGFyZywgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGxpc3RlbihldmVudDogc3RyaW5nLCBhcmc6IGFueSk6IEV2ZW50PFQ+IHtcblx0XHRcdFx0aWYgKGlzRnVuY3Rpb24ocm91dGVyT3JDbGllbnRGaWx0ZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuZ2V0TXVsdGljYXN0RXZlbnQoY2hhbm5lbE5hbWUsIHJvdXRlck9yQ2xpZW50RmlsdGVyLCBldmVudCwgYXJnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNoYW5uZWxQcm9taXNlID0gcm91dGVyT3JDbGllbnRGaWx0ZXIucm91dGVFdmVudCh0aGF0LCBldmVudCwgYXJnKVxuXHRcdFx0XHRcdC50aGVuKGNvbm5lY3Rpb24gPT4gKGNvbm5lY3Rpb24gYXMgQ29ubmVjdGlvbjxUQ29udGV4dD4pLmNoYW5uZWxDbGllbnQuZ2V0Q2hhbm5lbChjaGFubmVsTmFtZSkpO1xuXG5cdFx0XHRcdHJldHVybiBnZXREZWxheWVkQ2hhbm5lbChjaGFubmVsUHJvbWlzZSlcblx0XHRcdFx0XHQubGlzdGVuKGV2ZW50LCBhcmcpO1xuXHRcdFx0fVxuXHRcdH0gYXMgVDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TXVsdGljYXN0RXZlbnQ8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nLCBjbGllbnRGaWx0ZXI6IChjbGllbnQ6IENsaWVudDxUQ29udGV4dD4pID0+IGJvb2xlYW4sIGV2ZW50TmFtZTogc3RyaW5nLCBhcmc6IGFueSk6IEV2ZW50PFQ+IHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIENyZWF0ZSBhbiBlbWl0dGVyIHdoaWNoIGhvb2tzIHVwIHRvIGFsbCBjbGllbnRzXG5cdFx0Ly8gYXMgc29vbiBhcyBmaXJzdCBsaXN0ZW5lciBpcyBhZGRlZC4gSXQgYWxzb1xuXHRcdC8vIGRpc2Nvbm5lY3RzIGZyb20gYWxsIGNsaWVudHMgYXMgc29vbiBhcyB0aGUgbGFzdCBsaXN0ZW5lclxuXHRcdC8vIGlzIHJlbW92ZWQuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPFQ+KHtcblx0XHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdFx0Ly8gVGhlIGV2ZW50IG11bHRpcGxleGVyIGlzIHVzZWZ1bCBzaW5jZSB0aGUgYWN0aXZlXG5cdFx0XHRcdC8vIGNsaWVudCBsaXN0IGlzIGR5bmFtaWMuIFdlIG5lZWQgdG8gaG9vayB1cCBhbmQgZGlzY29ubmVjdGlvblxuXHRcdFx0XHQvLyB0by9mcm9tIGNsaWVudHMgYXMgdGhleSBjb21lIGFuZCBnby5cblx0XHRcdFx0Y29uc3QgZXZlbnRNdWx0aXBsZXhlciA9IG5ldyBFdmVudE11bHRpcGxleGVyPFQ+KCk7XG5cdFx0XHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8Q29ubmVjdGlvbjxUQ29udGV4dD4sIElEaXNwb3NhYmxlPigpO1xuXG5cdFx0XHRcdGNvbnN0IG9uRGlkQWRkQ29ubmVjdGlvbiA9IChjb25uZWN0aW9uOiBDb25uZWN0aW9uPFRDb250ZXh0PikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWwgPSBjb25uZWN0aW9uLmNoYW5uZWxDbGllbnQuZ2V0Q2hhbm5lbChjaGFubmVsTmFtZSk7XG5cdFx0XHRcdFx0Y29uc3QgZXZlbnQgPSBjaGFubmVsLmxpc3RlbjxUPihldmVudE5hbWUsIGFyZyk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV2ZW50TXVsdGlwbGV4ZXIuYWRkKGV2ZW50KTtcblxuXHRcdFx0XHRcdG1hcC5zZXQoY29ubmVjdGlvbiwgZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRSZW1vdmVDb25uZWN0aW9uID0gKGNvbm5lY3Rpb246IENvbm5lY3Rpb248VENvbnRleHQ+KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG1hcC5nZXQoY29ubmVjdGlvbik7XG5cblx0XHRcdFx0XHRpZiAoIWRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRtYXAuZGVsZXRlKGNvbm5lY3Rpb24pO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoYXQuY29ubmVjdGlvbnMuZmlsdGVyKGNsaWVudEZpbHRlcikuZm9yRWFjaChvbkRpZEFkZENvbm5lY3Rpb24pO1xuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhhdC5vbkRpZEFkZENvbm5lY3Rpb24sIGNsaWVudEZpbHRlcikob25EaWRBZGRDb25uZWN0aW9uLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0dGhhdC5vbkRpZFJlbW92ZUNvbm5lY3Rpb24ob25EaWRSZW1vdmVDb25uZWN0aW9uLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0ZXZlbnRNdWx0aXBsZXhlci5ldmVudChlbWl0dGVyLmZpcmUsIGVtaXR0ZXIsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXZlbnRNdWx0aXBsZXhlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXM/LmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhhdC5kaXNwb3NhYmxlcy5hZGQoZW1pdHRlcik7XG5cblx0XHRyZXR1cm4gZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4pOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5uZWxzLnNldChjaGFubmVsTmFtZSwgY2hhbm5lbCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbm5lY3Rpb24uY2hhbm5lbFNlcnZlci5yZWdpc3RlckNoYW5uZWwoY2hhbm5lbE5hbWUsIGNoYW5uZWwpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbm5lY3Rpb24uY2hhbm5lbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRjb25uZWN0aW9uLmNoYW5uZWxTZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5jaGFubmVscy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQWRkQ29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZW1vdmVDb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEFuIGBJUENDbGllbnRgIGlzIGJvdGggYSBjaGFubmVsIGNsaWVudCBhbmQgYSBjaGFubmVsIHNlcnZlci5cbiAqXG4gKiBBcyB0aGUgb3duZXIgb2YgYSBwcm90b2NvbCwgeW91IHNob3VsZCBleHRlbmQgYm90aCB0aGlzXG4gKiBhbmQgdGhlIGBJUENTZXJ2ZXJgIGNsYXNzZXMgdG8gZ2V0IElQQyBpbXBsZW1lbnRhdGlvbnNcbiAqIGZvciB5b3VyIHByb3RvY29sLlxuICovXG5leHBvcnQgY2xhc3MgSVBDQ2xpZW50PFRDb250ZXh0ID0gc3RyaW5nPiBpbXBsZW1lbnRzIElDaGFubmVsQ2xpZW50LCBJQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGNoYW5uZWxDbGllbnQ6IENoYW5uZWxDbGllbnQ7XG5cdHByaXZhdGUgY2hhbm5lbFNlcnZlcjogQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD47XG5cblx0Y29uc3RydWN0b3IocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBjdHg6IFRDb250ZXh0LCBpcGNMb2dnZXI6IElJUENMb2dnZXIgfCBudWxsID0gbnVsbCkge1xuXHRcdGNvbnN0IHdyaXRlciA9IG5ldyBCdWZmZXJXcml0ZXIoKTtcblx0XHR0cnkge1xuXHRcdFx0c2VyaWFsaXplKHdyaXRlciwgY3R4KTtcblx0XHRcdHByb3RvY29sLnNlbmQod3JpdGVyLmJ1ZmZlcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHdyaXRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGFubmVsQ2xpZW50ID0gbmV3IENoYW5uZWxDbGllbnQocHJvdG9jb2wsIGlwY0xvZ2dlcik7XG5cdFx0dGhpcy5jaGFubmVsU2VydmVyID0gbmV3IENoYW5uZWxTZXJ2ZXIocHJvdG9jb2wsIGN0eCwgaXBjTG9nZ2VyKTtcblx0fVxuXG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbENsaWVudC5nZXRDaGFubmVsKGNoYW5uZWxOYW1lKTtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4pOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5uZWxTZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKGNoYW5uZWxOYW1lLCBjaGFubmVsKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGFubmVsQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNoYW5uZWxTZXJ2ZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWxheWVkQ2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KHByb21pc2U6IFByb21pc2U8VD4pOiBUIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRyZXR1cm4ge1xuXHRcdGNhbGwoY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4oYyA9PiBjLmNhbGw8VD4oY29tbWFuZCwgYXJnLCBjYW5jZWxsYXRpb25Ub2tlbikpO1xuXHRcdH0sXG5cblx0XHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8VD4ge1xuXHRcdFx0Y29uc3QgcmVsYXkgPSBuZXcgUmVsYXk8YW55PigpO1xuXHRcdFx0dm9pZCBwcm9taXNlLnRoZW4oXG5cdFx0XHRcdGMgPT4gcmVsYXkuaW5wdXQgPSBjLmxpc3RlbihldmVudCwgYXJnKSxcblx0XHRcdFx0KCkgPT4gcmVsYXkuZGlzcG9zZSgpLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiByZWxheS5ldmVudDtcblx0XHR9XG5cdH0gYXMgVDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5leHRUaWNrQ2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KGNoYW5uZWw6IFQpOiBUIHtcblx0bGV0IGRpZFRpY2sgPSBmYWxzZTtcblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdHJldHVybiB7XG5cdFx0Y2FsbDxUPihjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD4ge1xuXHRcdFx0aWYgKGRpZFRpY2spIHtcblx0XHRcdFx0cmV0dXJuIGNoYW5uZWwuY2FsbChjb21tYW5kLCBhcmcsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRpbWVvdXQoMClcblx0XHRcdFx0LnRoZW4oKCkgPT4gZGlkVGljayA9IHRydWUpXG5cdFx0XHRcdC50aGVuKCgpID0+IGNoYW5uZWwuY2FsbDxUPihjb21tYW5kLCBhcmcsIGNhbmNlbGxhdGlvblRva2VuKSk7XG5cdFx0fSxcblx0XHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8VD4ge1xuXHRcdFx0aWYgKGRpZFRpY2spIHtcblx0XHRcdFx0cmV0dXJuIGNoYW5uZWwubGlzdGVuPFQ+KGV2ZW50LCBhcmcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZWxheSA9IG5ldyBSZWxheTxUPigpO1xuXG5cdFx0XHR0aW1lb3V0KDApXG5cdFx0XHRcdC50aGVuKCgpID0+IGRpZFRpY2sgPSB0cnVlKVxuXHRcdFx0XHQudGhlbigoKSA9PiByZWxheS5pbnB1dCA9IGNoYW5uZWwubGlzdGVuPFQ+KGV2ZW50LCBhcmcpKTtcblxuXHRcdFx0cmV0dXJuIHJlbGF5LmV2ZW50O1xuXHRcdH1cblx0fSBhcyBUO1xufVxuXG5leHBvcnQgY2xhc3MgU3RhdGljUm91dGVyPFRDb250ZXh0ID0gc3RyaW5nPiBpbXBsZW1lbnRzIElDbGllbnRSb3V0ZXI8VENvbnRleHQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGZuOiAoY3R4OiBUQ29udGV4dCkgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pIHsgfVxuXG5cdHJvdXRlQ2FsbChodWI6IElDb25uZWN0aW9uSHViPFRDb250ZXh0Pik6IFByb21pc2U8Q2xpZW50PFRDb250ZXh0Pj4ge1xuXHRcdHJldHVybiB0aGlzLnJvdXRlKGh1Yik7XG5cdH1cblxuXHRyb3V0ZUV2ZW50KGh1YjogSUNvbm5lY3Rpb25IdWI8VENvbnRleHQ+KTogUHJvbWlzZTxDbGllbnQ8VENvbnRleHQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMucm91dGUoaHViKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcm91dGUoaHViOiBJQ29ubmVjdGlvbkh1YjxUQ29udGV4dD4pOiBQcm9taXNlPENsaWVudDxUQ29udGV4dD4+IHtcblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgaHViLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRpZiAoYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuZm4oY29ubmVjdGlvbi5jdHgpKSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbm5lY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShodWIub25EaWRBZGRDb25uZWN0aW9uKTtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5yb3V0ZShodWIpO1xuXHR9XG59XG5cbi8qKlxuICogVXNlIFByb3h5Q2hhbm5lbHMgdG8gYXV0b21hdGljYWxseSB3cmFwcGluZyBhbmQgdW53cmFwcGluZ1xuICogc2VydmljZXMgdG8vZnJvbSBJUEMgY2hhbm5lbHMsIGluc3RlYWQgb2YgbWFudWFsbHkgd3JhcHBpbmdcbiAqIGVhY2ggc2VydmljZSBtZXRob2QgYW5kIGV2ZW50LlxuICpcbiAqIFJlc3RyaWN0aW9uczpcbiAqIC0gSWYgbWFyc2hhbGxpbmcgaXMgZW5hYmxlZCwgb25seSBgVVJJYCBhbmQgYFJlZ0V4cGAgaXMgY29udmVydGVkXG4gKiAgIGF1dG9tYXRpY2FsbHkgZm9yIHlvdVxuICogLSBFdmVudHMgbXVzdCBmb2xsb3cgdGhlIG5hbWluZyBjb252ZW50aW9uIGBvblVwcGVyQ2FzZWBcbiAqIC0gYENhbmNlbGxhdGlvblRva2VuYCBpcyBjdXJyZW50bHkgbm90IHN1cHBvcnRlZFxuICogLSBJZiBhIGNvbnRleHQgaXMgcHJvdmlkZWQsIHlvdSBjYW4gdXNlIGBBZGRGaXJzdFBhcmFtZXRlclRvRnVuY3Rpb25zYFxuICogICB1dGlsaXR5IHRvIHNpZ25hbCB0aGlzIGluIHRoZSByZWNlaXZpbmcgc2lkZSB0eXBlXG4gKi9cbmV4cG9ydCBuYW1lc3BhY2UgUHJveHlDaGFubmVsIHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElQcm94eU9wdGlvbnMge1xuXG5cdFx0LyoqXG5cdFx0ICogRGlzYWJsZXMgYXV0b21hdGljIG1hcnNoYWxsaW5nIG9mIGBVUklgLlxuXHRcdCAqIElmIG1hcnNoYWxsaW5nIGlzIGRpc2FibGVkLCBgVXJpQ29tcG9uZW50c2Bcblx0XHQgKiBtdXN0IGJlIHVzZWQgaW5zdGVhZC5cblx0XHQgKi9cblx0XHRkaXNhYmxlTWFyc2hhbGxpbmc/OiBib29sZWFuO1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJQ3JlYXRlU2VydmljZUNoYW5uZWxPcHRpb25zIGV4dGVuZHMgSVByb3h5T3B0aW9ucyB7XG5cblx0XHQvKipcblx0XHQgKiBFdmVudHMgdGhhdCBzaG91bGQgc3Vic2NyaWJlIGxhemlseSBhbmQgbm90IHJlcGxheSBlbWlzc2lvbnMgYmVmb3JlIHRoZSBmaXJzdCBJUEMgbGlzdGVuZXIuXG5cdFx0ICovXG5cdFx0dW5idWZmZXJlZEV2ZW50cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TZXJ2aWNlPFRDb250ZXh0PihzZXJ2aWNlOiB1bmtub3duLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBvcHRpb25zPzogSUNyZWF0ZVNlcnZpY2VDaGFubmVsT3B0aW9ucyk6IElTZXJ2ZXJDaGFubmVsPFRDb250ZXh0PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IHNlcnZpY2UgYXMgeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH07XG5cdFx0Y29uc3QgZGlzYWJsZU1hcnNoYWxsaW5nID0gb3B0aW9ucz8uZGlzYWJsZU1hcnNoYWxsaW5nO1xuXHRcdGNvbnN0IHVuYnVmZmVyZWRFdmVudHMgPSBvcHRpb25zPy51bmJ1ZmZlcmVkRXZlbnRzID8gbmV3IFNldChvcHRpb25zLnVuYnVmZmVyZWRFdmVudHMpIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQnVmZmVyIGFueSBldmVudCB0aGF0IHNob3VsZCBiZSBzdXBwb3J0ZWQgYnlcblx0XHQvLyBpdGVyYXRpbmcgb3ZlciBhbGwgcHJvcGVydHkga2V5cyBhbmQgZmluZGluZyB0aGVtXG5cdFx0Ly8gSG93ZXZlciwgdGhpcyB3aWxsIG5vdCB3b3JrIGZvciBzZXJ2aWNlcyB0aGF0XG5cdFx0Ly8gYXJlIGxhenkgYW5kIHVzZSBhIFByb3h5IHdpdGhpbi4gRm9yIHRoYXQgd2Vcblx0XHQvLyBzdGlsbCBuZWVkIHRvIGNoZWNrIGxhdGVyIChzZWUgYmVsb3cpLlxuXHRcdGNvbnN0IG1hcEV2ZW50TmFtZVRvRXZlbnQgPSBuZXcgTWFwPHN0cmluZywgRXZlbnQ8dW5rbm93bj4+KCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gaGFuZGxlcikge1xuXHRcdFx0aWYgKHByb3BlcnR5SXNFdmVudChrZXkpICYmICF1bmJ1ZmZlcmVkRXZlbnRzPy5oYXMoa2V5KSkge1xuXHRcdFx0XHRtYXBFdmVudE5hbWVUb0V2ZW50LnNldChrZXksIEV2ZW50LmJ1ZmZlcihoYW5kbGVyW2tleV0gYXMgRXZlbnQ8dW5rbm93bj4sIGtleSwgdHJ1ZSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgY2xhc3MgaW1wbGVtZW50cyBJU2VydmVyQ2hhbm5lbCB7XG5cblx0XHRcdGxpc3RlbjxUPihfOiB1bmtub3duLCBldmVudDogc3RyaW5nLCBhcmc6IGFueSk6IEV2ZW50PFQ+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnRJbXBsID0gbWFwRXZlbnROYW1lVG9FdmVudC5nZXQoZXZlbnQpO1xuXHRcdFx0XHRpZiAoZXZlbnRJbXBsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGV2ZW50SW1wbCBhcyBFdmVudDxUPjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGhhbmRsZXJbZXZlbnRdO1xuXHRcdFx0XHRpZiAodHlwZW9mIHRhcmdldCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eUlzRHluYW1pY0V2ZW50KGV2ZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRhcmdldC5jYWxsKGhhbmRsZXIsIGFyZyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5SXNFdmVudChldmVudCkpIHtcblx0XHRcdFx0XHRcdGlmICh1bmJ1ZmZlcmVkRXZlbnRzPy5oYXMoZXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBoYW5kbGVyW2V2ZW50XSBhcyBFdmVudDxUPjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0bWFwRXZlbnROYW1lVG9FdmVudC5zZXQoZXZlbnQsIEV2ZW50LmJ1ZmZlcihoYW5kbGVyW2V2ZW50XSBhcyBFdmVudDx1bmtub3duPiwgZXZlbnQsIHRydWUsIHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIG1hcEV2ZW50TmFtZVRvRXZlbnQuZ2V0KGV2ZW50KSBhcyBFdmVudDxUPjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeShgRXZlbnQgbm90IGZvdW5kOiAke2V2ZW50fWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjYWxsKF86IHVua25vd24sIGNvbW1hbmQ6IHN0cmluZywgYXJncz86IGFueVtdKTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gaGFuZGxlcltjb21tYW5kXTtcblx0XHRcdFx0aWYgKHR5cGVvZiB0YXJnZXQgPT09ICdmdW5jdGlvbicpIHtcblxuXHRcdFx0XHRcdC8vIFJldml2ZSB1bmxlc3MgbWFyc2hhbGxpbmcgZGlzYWJsZWRcblx0XHRcdFx0XHRpZiAoIWRpc2FibGVNYXJzaGFsbGluZyAmJiBBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0YXJnc1tpXSA9IHJldml2ZShhcmdzW2ldKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgcmVzID0gdGFyZ2V0LmFwcGx5KGhhbmRsZXIsIGFyZ3MpO1xuXHRcdFx0XHRcdGlmICghKHJlcyBpbnN0YW5jZW9mIFByb21pc2UpKSB7XG5cdFx0XHRcdFx0XHRyZXMgPSBQcm9taXNlLnJlc29sdmUocmVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlcztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBNZXRob2Qgbm90IGZvdW5kOiAke2NvbW1hbmR9YCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSUNyZWF0ZVByb3h5U2VydmljZU9wdGlvbnMgZXh0ZW5kcyBJUHJveHlPcHRpb25zIHtcblxuXHRcdC8qKlxuXHRcdCAqIElmIHByb3ZpZGVkLCB3aWxsIGFkZCB0aGUgdmFsdWUgb2YgYGNvbnRleHRgXG5cdFx0ICogdG8gZWFjaCBtZXRob2QgY2FsbCB0byB0aGUgdGFyZ2V0LlxuXHRcdCAqL1xuXHRcdGNvbnRleHQ/OiB1bmtub3duO1xuXG5cdFx0LyoqXG5cdFx0ICogSWYgcHJvdmlkZWQsIHdpbGwgbm90IHByb3h5IGFueSBvZiB0aGUgcHJvcGVydGllc1xuXHRcdCAqIHRoYXQgYXJlIHBhcnQgb2YgdGhlIE1hcCBidXQgcmF0aGVyIHJldHVybiB0aGF0IHZhbHVlLlxuXHRcdCAqL1xuXHRcdHByb3BlcnRpZXM/OiBNYXA8c3RyaW5nLCB1bmtub3duPjtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0b1NlcnZpY2U8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogSUNoYW5uZWwsIG9wdGlvbnM/OiBJQ3JlYXRlUHJveHlTZXJ2aWNlT3B0aW9ucyk6IFQge1xuXHRcdGNvbnN0IGRpc2FibGVNYXJzaGFsbGluZyA9IG9wdGlvbnM/LmRpc2FibGVNYXJzaGFsbGluZztcblxuXHRcdHJldHVybiBuZXcgUHJveHkoe30sIHtcblx0XHRcdGdldChfdGFyZ2V0OiBULCBwcm9wS2V5OiBQcm9wZXJ0eUtleSkge1xuXHRcdFx0XHRpZiAodHlwZW9mIHByb3BLZXkgPT09ICdzdHJpbmcnKSB7XG5cblx0XHRcdFx0XHQvLyBDaGVjayBmb3IgcHJlZGVmaW5lZCB2YWx1ZXNcblx0XHRcdFx0XHRpZiAob3B0aW9ucz8ucHJvcGVydGllcz8uaGFzKHByb3BLZXkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5wcm9wZXJ0aWVzLmdldChwcm9wS2V5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBBbnN3ZXJpbmcgYHRoZW5gIG1ha2VzIHRoaXMgcHJveHkgYSB0aGVuYWJsZSwgc28gYGF3YWl0YCB3b3VsZCBmb3J3YXJkIGl0IGFuZCBuZXZlciBzZXR0bGUuXG5cdFx0XHRcdFx0aWYgKHByb3BLZXkgPT09ICd0aGVuJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBEeW5hbWljIEV2ZW50XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5SXNEeW5hbWljRXZlbnQocHJvcEtleSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmdW5jdGlvbiAoYXJnOiB1bmtub3duKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjaGFubmVsLmxpc3Rlbihwcm9wS2V5LCBhcmcpO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBFdmVudFxuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eUlzRXZlbnQocHJvcEtleSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjaGFubmVsLmxpc3Rlbihwcm9wS2V5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBGdW5jdGlvblxuXHRcdFx0XHRcdHJldHVybiBhc3luYyBmdW5jdGlvbiAoLi4uYXJnczogdW5rbm93bltdKSB7XG5cblx0XHRcdFx0XHRcdC8vIEFkZCBjb250ZXh0IGlmIGFueVxuXHRcdFx0XHRcdFx0bGV0IG1ldGhvZEFyZ3M6IHVua25vd25bXTtcblx0XHRcdFx0XHRcdGlmIChvcHRpb25zICYmICFpc1VuZGVmaW5lZE9yTnVsbChvcHRpb25zLmNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHRcdG1ldGhvZEFyZ3MgPSBbb3B0aW9ucy5jb250ZXh0LCAuLi5hcmdzXTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1ldGhvZEFyZ3MgPSBhcmdzO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGFubmVsLmNhbGwocHJvcEtleSwgbWV0aG9kQXJncyk7XG5cblx0XHRcdFx0XHRcdC8vIFJldml2ZSB1bmxlc3MgbWFyc2hhbGxpbmcgZGlzYWJsZWRcblx0XHRcdFx0XHRcdGlmICghZGlzYWJsZU1hcnNoYWxsaW5nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZXZpdmUocmVzdWx0KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoYFByb3BlcnR5IG5vdCBmb3VuZDogJHtTdHJpbmcocHJvcEtleSl9YCk7XG5cdFx0XHR9XG5cdFx0fSkgYXMgVDtcblx0fVxuXG5cdGZ1bmN0aW9uIHByb3BlcnR5SXNFdmVudChuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHQvLyBBc3N1bWUgYSBwcm9wZXJ0eSBpcyBhbiBldmVudCBpZiBpdCBoYXMgYSBmb3JtIG9mIFwib25Tb21ldGhpbmdcIlxuXHRcdHJldHVybiBuYW1lWzBdID09PSAnbycgJiYgbmFtZVsxXSA9PT0gJ24nICYmIHN0cmluZ3MuaXNVcHBlckFzY2lpTGV0dGVyKG5hbWUuY2hhckNvZGVBdCgyKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBwcm9wZXJ0eUlzRHluYW1pY0V2ZW50KG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdC8vIEFzc3VtZSBhIHByb3BlcnR5IGlzIGEgZHluYW1pYyBldmVudCAoYSBtZXRob2QgdGhhdCByZXR1cm5zIGFuIGV2ZW50KSBpZiBpdCBoYXMgYSBmb3JtIG9mIFwib25EeW5hbWljU29tZXRoaW5nXCJcblx0XHRyZXR1cm4gL15vbkR5bmFtaWMvLnRlc3QobmFtZSkgJiYgc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIobmFtZS5jaGFyQ29kZUF0KDkpKTtcblx0fVxufVxuXG5jb25zdCBjb2xvclRhYmxlcyA9IFtcblx0WycjMjk3N0IxJywgJyNGQzgwMkQnLCAnIzM0QTEzQScsICcjRDMyODJGJywgJyM5MzY2QkEnXSxcblx0WycjOEI1NjRDJywgJyNFMTc3QzAnLCAnIzdGN0Y3RicsICcjQkJCRTNEJywgJyMyRUJFQ0QnXVxuXTtcblxuZnVuY3Rpb24gcHJldHR5V2l0aG91dEFycmF5cyhkYXRhOiB1bmtub3duKTogYW55IHtcblx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXHRpZiAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIGRhdGEudG9TdHJpbmcgPT09ICdmdW5jdGlvbicpIHtcblx0XHRjb25zdCByZXN1bHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHJlc3VsdCAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkYXRhO1xufVxuXG5mdW5jdGlvbiBwcmV0dHkoZGF0YTogdW5rbm93bik6IGFueSB7XG5cdGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0cmV0dXJuIGRhdGEubWFwKHByZXR0eVdpdGhvdXRBcnJheXMpO1xuXHR9XG5cdHJldHVybiBwcmV0dHlXaXRob3V0QXJyYXlzKGRhdGEpO1xufVxuXG5mdW5jdGlvbiBsb2dXaXRoQ29sb3JzKGRpcmVjdGlvbjogc3RyaW5nLCB0b3RhbExlbmd0aDogbnVtYmVyLCBtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE6IGFueSk6IHZvaWQge1xuXHRkYXRhID0gcHJldHR5KGRhdGEpO1xuXG5cdGNvbnN0IGNvbG9yVGFibGUgPSBjb2xvclRhYmxlc1tpbml0aWF0b3JdO1xuXHRjb25zdCBjb2xvciA9IGNvbG9yVGFibGVbcmVxICUgY29sb3JUYWJsZS5sZW5ndGhdO1xuXHRsZXQgYXJncyA9IFtgJWNbJHtkaXJlY3Rpb259XSVjWyR7U3RyaW5nKHRvdGFsTGVuZ3RoKS5wYWRTdGFydCg3LCAnICcpfV0lY1tsZW46ICR7U3RyaW5nKG1zZ0xlbmd0aCkucGFkU3RhcnQoNSwgJyAnKX1dJWMke1N0cmluZyhyZXEpLnBhZFN0YXJ0KDUsICcgJyl9IC0gJHtzdHJ9YCwgJ2NvbG9yOiBkYXJrZ3JlZW4nLCAnY29sb3I6IGdyZXknLCAnY29sb3I6IGdyZXknLCBgY29sb3I6ICR7Y29sb3J9YF07XG5cdGlmICgvXFwoJC8udGVzdChzdHIpKSB7XG5cdFx0YXJncyA9IGFyZ3MuY29uY2F0KGRhdGEpO1xuXHRcdGFyZ3MucHVzaCgnKScpO1xuXHR9IGVsc2Uge1xuXHRcdGFyZ3MucHVzaChkYXRhKTtcblx0fVxuXHRjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmdzIGFzIFtzdHJpbmcsIC4uLnN0cmluZ1tdXSk7XG59XG5cbmV4cG9ydCBjbGFzcyBJUENMb2dnZXIgaW1wbGVtZW50cyBJSVBDTG9nZ2VyIHtcblx0cHJpdmF0ZSBfdG90YWxJbmNvbWluZyA9IDA7XG5cdHByaXZhdGUgX3RvdGFsT3V0Z29pbmcgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX291dGdvaW5nUHJlZml4OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5jb21pbmdQcmVmaXg6IHN0cmluZyxcblx0KSB7IH1cblxuXHRwdWJsaWMgbG9nT3V0Z29pbmcobXNnTGVuZ3RoOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCBpbml0aWF0b3I6IFJlcXVlc3RJbml0aWF0b3IsIHN0cjogc3RyaW5nLCBkYXRhPzogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5fdG90YWxPdXRnb2luZyArPSBtc2dMZW5ndGg7XG5cdFx0bG9nV2l0aENvbG9ycyh0aGlzLl9vdXRnb2luZ1ByZWZpeCwgdGhpcy5fdG90YWxPdXRnb2luZywgbXNnTGVuZ3RoLCByZXF1ZXN0SWQsIGluaXRpYXRvciwgc3RyLCBkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBsb2dJbmNvbWluZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLl90b3RhbEluY29taW5nICs9IG1zZ0xlbmd0aDtcblx0XHRsb2dXaXRoQ29sb3JzKHRoaXMuX2luY29taW5nUHJlZml4LCB0aGlzLl90b3RhbEluY29taW5nLCBtc2dMZW5ndGgsIHJlcXVlc3RJZCwgaW5pdGlhdG9yLCBzdHIsIGRhdGEpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBNEIseUJBQXlCLGVBQWU7QUFDcEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyxTQUFTLE9BQU8sa0JBQWtCLGFBQWE7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsU0FBc0Isb0JBQW9CO0FBQ3BFLFNBQVMsY0FBYztBQUN2QixZQUFZLGFBQWE7QUFDekIsU0FBUyxZQUFZLHlCQUF5QjtBQXVCOUMsSUFBVyxjQUFYLGtCQUFXQSxpQkFBWDtBQUNDLEVBQUFBLDBCQUFBLGFBQVUsT0FBVjtBQUNBLEVBQUFBLDBCQUFBLG1CQUFnQixPQUFoQjtBQUNBLEVBQUFBLDBCQUFBLGlCQUFjLE9BQWQ7QUFDQSxFQUFBQSwwQkFBQSxrQkFBZSxPQUFmO0FBSlUsU0FBQUE7QUFBQSxHQUFBO0FBT1gsU0FBUyxpQkFBaUIsTUFBMkI7QUFDcEQsVUFBUSxNQUFNO0FBQUEsSUFDYixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLEVBQ1Q7QUFDRDtBQVFBLElBQVcsZUFBWCxrQkFBV0Msa0JBQVg7QUFDQyxFQUFBQSw0QkFBQSxnQkFBYSxPQUFiO0FBQ0EsRUFBQUEsNEJBQUEsb0JBQWlCLE9BQWpCO0FBQ0EsRUFBQUEsNEJBQUEsa0JBQWUsT0FBZjtBQUNBLEVBQUFBLDRCQUFBLHFCQUFrQixPQUFsQjtBQUNBLEVBQUFBLDRCQUFBLGVBQVksT0FBWjtBQUxVLFNBQUFBO0FBQUEsR0FBQTtBQVFYLFNBQVMsa0JBQWtCLE1BQTRCO0FBQ3RELFVBQVEsTUFBTTtBQUFBLElBQ2IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFzQkEsSUFBSyxRQUFMLGtCQUFLQyxXQUFMO0FBQ0MsRUFBQUEsY0FBQTtBQUNBLEVBQUFBLGNBQUE7QUFGSSxTQUFBQTtBQUFBLEdBQUE7QUFnRUwsU0FBUyxXQUFXLFFBQWlCO0FBQ3BDLE1BQUksUUFBUTtBQUNaLFdBQVMsSUFBSSxLQUFLLEtBQUssR0FBRztBQUN6QixVQUFNLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFDMUIsY0FBVSxLQUFLLE9BQU8sQ0FBQyxJQUFJLFFBQWU7QUFDMUMsUUFBSSxFQUFFLEtBQUssT0FBTyxDQUFDLElBQUksTUFBYTtBQUNuQyxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sVUFBVSxvQkFBb0IsQ0FBQztBQUtyQyxTQUFTLGNBQWMsUUFBaUIsT0FBZTtBQUN0RCxNQUFJLFVBQVUsR0FBRztBQUNoQixXQUFPLE1BQU0sT0FBTztBQUNwQjtBQUFBLEVBQ0Q7QUFFQSxNQUFJLE1BQU07QUFDVixXQUFTLEtBQUssT0FBTyxPQUFPLEdBQUcsS0FBSyxPQUFPLEdBQUc7QUFDN0M7QUFBQSxFQUNEO0FBRUEsUUFBTSxVQUFVLFNBQVMsTUFBTSxHQUFHO0FBQ2xDLFdBQVMsSUFBSSxHQUFHLFVBQVUsR0FBRyxLQUFLO0FBQ2pDLFlBQVEsT0FBTyxDQUFDLElBQUksUUFBUTtBQUM1QixZQUFRLFVBQVU7QUFDbEIsUUFBSSxRQUFRLEdBQUc7QUFDZCxjQUFRLE9BQU8sQ0FBQyxLQUFLO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBRUEsU0FBTyxNQUFNLE9BQU87QUFDckI7QUFFTyxNQUFNLGFBQWdDO0FBQUEsRUFJNUMsWUFBb0IsUUFBa0I7QUFBbEI7QUFGcEIsU0FBUSxNQUFNO0FBQUEsRUFFMEI7QUFBQSxFQUV4QyxLQUFLLE9BQXlCO0FBQzdCLFVBQU0sU0FBUyxLQUFLLE9BQU8sTUFBTSxLQUFLLEtBQUssS0FBSyxNQUFNLEtBQUs7QUFDM0QsU0FBSyxPQUFPLE9BQU87QUFDbkIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVPLE1BQU0sYUFBNkM7QUFBQSxFQUFuRDtBQUVOLFNBQVEsVUFBc0IsQ0FBQztBQUFBO0FBQUEsRUFFL0IsSUFBSSxTQUFtQjtBQUN0QixXQUFPLFNBQVMsT0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQztBQUFBLEVBRUEsTUFBTSxRQUF3QjtBQUM3QixTQUFLLFFBQVEsS0FBSyxNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUVBLFVBQWdCO0FBRWYsU0FBSyxRQUFRLFNBQVM7QUFBQSxFQUN2QjtBQUNEO0FBRUEsSUFBSyxXQUFMLGtCQUFLQyxjQUFMO0FBQ0MsRUFBQUEsb0JBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsb0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsb0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsb0JBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsb0JBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsb0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsb0JBQUEsU0FBTSxLQUFOO0FBUEksU0FBQUE7QUFBQSxHQUFBO0FBVUwsU0FBUyxvQkFBb0IsT0FBeUI7QUFDckQsUUFBTSxTQUFTLFNBQVMsTUFBTSxDQUFDO0FBQy9CLFNBQU8sV0FBVyxPQUFPLENBQUM7QUFDMUIsU0FBTztBQUNSO0FBRUEsTUFBTSxnQkFBZ0I7QUFBQSxFQUNyQixXQUFXLG9CQUFvQixpQkFBa0I7QUFBQSxFQUNqRCxRQUFRLG9CQUFvQixjQUFlO0FBQUEsRUFDM0MsUUFBUSxvQkFBb0IsY0FBZTtBQUFBLEVBQzNDLFVBQVUsb0JBQW9CLGdCQUFpQjtBQUFBLEVBQy9DLE9BQU8sb0JBQW9CLGFBQWM7QUFBQSxFQUN6QyxRQUFRLG9CQUFvQixjQUFlO0FBQUEsRUFDM0MsTUFBTSxvQkFBb0IsV0FBWTtBQUN2QztBQUVPLFNBQVMsVUFBVSxRQUFpQixNQUFpQjtBQUMzRCxNQUFJLE9BQU8sU0FBUyxhQUFhO0FBQ2hDLFdBQU8sTUFBTSxjQUFjLFNBQVM7QUFBQSxFQUNyQyxXQUFXLE9BQU8sU0FBUyxVQUFVO0FBQ3BDLFVBQU0sU0FBUyxTQUFTLFdBQVcsSUFBSTtBQUN2QyxXQUFPLE1BQU0sY0FBYyxNQUFNO0FBQ2pDLGtCQUFjLFFBQVEsT0FBTyxVQUFVO0FBQ3ZDLFdBQU8sTUFBTSxNQUFNO0FBQUEsRUFDcEIsV0FBVyxTQUFTLGVBQWUsSUFBSSxHQUFHO0FBQ3pDLFVBQU0sU0FBUyxTQUFTLEtBQUssSUFBSTtBQUNqQyxXQUFPLE1BQU0sY0FBYyxNQUFNO0FBQ2pDLGtCQUFjLFFBQVEsT0FBTyxVQUFVO0FBQ3ZDLFdBQU8sTUFBTSxNQUFNO0FBQUEsRUFDcEIsV0FBVyxnQkFBZ0IsVUFBVTtBQUNwQyxXQUFPLE1BQU0sY0FBYyxRQUFRO0FBQ25DLGtCQUFjLFFBQVEsS0FBSyxVQUFVO0FBQ3JDLFdBQU8sTUFBTSxJQUFJO0FBQUEsRUFDbEIsV0FBVyxNQUFNLFFBQVEsSUFBSSxHQUFHO0FBQy9CLFdBQU8sTUFBTSxjQUFjLEtBQUs7QUFDaEMsa0JBQWMsUUFBUSxLQUFLLE1BQU07QUFFakMsZUFBVyxNQUFNLE1BQU07QUFDdEIsZ0JBQVUsUUFBUSxFQUFFO0FBQUEsSUFDckI7QUFBQSxFQUNELFdBQVcsT0FBTyxTQUFTLGFBQWEsT0FBTyxPQUFPLE1BQU07QUFFM0QsV0FBTyxNQUFNLGNBQWMsSUFBSTtBQUMvQixrQkFBYyxRQUFRLElBQUk7QUFBQSxFQUMzQixPQUFPO0FBQ04sVUFBTSxTQUFTLFNBQVMsV0FBVyxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQ3ZELFdBQU8sTUFBTSxjQUFjLE1BQU07QUFDakMsa0JBQWMsUUFBUSxPQUFPLFVBQVU7QUFDdkMsV0FBTyxNQUFNLE1BQU07QUFBQSxFQUNwQjtBQUNEO0FBRU8sU0FBUyxZQUFZLFFBQXNCO0FBQ2pELFFBQU0sT0FBTyxPQUFPLEtBQUssQ0FBQyxFQUFFLFVBQVUsQ0FBQztBQUV2QyxVQUFRLE1BQU07QUFBQSxJQUNiLEtBQUs7QUFBb0IsYUFBTztBQUFBLElBQ2hDLEtBQUs7QUFBaUIsYUFBTyxPQUFPLEtBQUssV0FBVyxNQUFNLENBQUMsRUFBRSxTQUFTO0FBQUEsSUFDdEUsS0FBSztBQUFpQixhQUFPLE9BQU8sS0FBSyxXQUFXLE1BQU0sQ0FBQyxFQUFFO0FBQUEsSUFDN0QsS0FBSztBQUFtQixhQUFPLE9BQU8sS0FBSyxXQUFXLE1BQU0sQ0FBQztBQUFBLElBQzdELEtBQUssZUFBZ0I7QUFDcEIsWUFBTSxTQUFTLFdBQVcsTUFBTTtBQUNoQyxZQUFNLFNBQWdCLENBQUM7QUFFdkIsZUFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDaEMsZUFBTyxLQUFLLFlBQVksTUFBTSxDQUFDO0FBQUEsTUFDaEM7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUFBLElBQ0EsS0FBSztBQUFpQixhQUFPLEtBQUssTUFBTSxPQUFPLEtBQUssV0FBVyxNQUFNLENBQUMsRUFBRSxTQUFTLENBQUM7QUFBQSxJQUNsRixLQUFLO0FBQWMsYUFBTyxXQUFXLE1BQU07QUFBQSxFQUM1QztBQUNEO0FBT08sTUFBTSxjQUFrRjtBQUFBLEVBVTlGLFlBQW9CLFVBQTJDLEtBQXVCLFNBQTRCLE1BQWMsZUFBZSxLQUFNO0FBQWpJO0FBQTJDO0FBQXVCO0FBQTBDO0FBUmhJLFNBQVEsV0FBVyxvQkFBSSxJQUFzQztBQUM3RCxTQUFRLGlCQUFpQixvQkFBSSxJQUF5QjtBQUt0RDtBQUFBO0FBQUEsU0FBUSxrQkFBa0Isb0JBQUksSUFBOEI7QUFHM0QsU0FBSyxtQkFBbUIsS0FBSyxTQUFTLFVBQVUsU0FBTyxLQUFLLGFBQWEsR0FBRyxDQUFDO0FBQzdFLFNBQUssYUFBYSxFQUFFLE1BQU0scUJBQXdCLENBQUM7QUFBQSxFQUNwRDtBQUFBLEVBRUEsZ0JBQWdCLGFBQXFCLFNBQXlDO0FBQzdFLFNBQUssU0FBUyxJQUFJLGFBQWEsT0FBTztBQUd0QyxlQUFXLE1BQU0sS0FBSyxxQkFBcUIsV0FBVyxHQUFHLENBQUM7QUFBQSxFQUMzRDtBQUFBLEVBRVEsYUFBYSxVQUE4QjtBQUNsRCxZQUFRLFNBQVMsTUFBTTtBQUFBLE1BQ3RCLEtBQUssc0JBQXlCO0FBQzdCLGNBQU0sWUFBWSxLQUFLLEtBQUssQ0FBQyxTQUFTLElBQUksQ0FBQztBQUMzQyxhQUFLLFFBQVEsWUFBWSxXQUFXLEdBQUcsbUJBQTRCLGtCQUFrQixTQUFTLElBQUksQ0FBQztBQUNuRztBQUFBLE1BQ0Q7QUFBQSxNQUVBLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUssMkJBQThCO0FBQ2xDLGNBQU0sWUFBWSxLQUFLLEtBQUssQ0FBQyxTQUFTLE1BQU0sU0FBUyxFQUFFLEdBQUcsU0FBUyxJQUFJO0FBQ3ZFLGFBQUssUUFBUSxZQUFZLFdBQVcsU0FBUyxJQUFJLG1CQUE0QixrQkFBa0IsU0FBUyxJQUFJLEdBQUcsU0FBUyxJQUFJO0FBQzVIO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxLQUFLLFFBQWlCLE9BQVksUUFBbUI7QUFDNUQsVUFBTSxTQUFTLElBQUksYUFBYTtBQUNoQyxRQUFJO0FBQ0gsZ0JBQVUsUUFBUSxNQUFNO0FBQ3hCLGdCQUFVLFFBQVEsSUFBSTtBQUN0QixhQUFPLEtBQUssV0FBVyxPQUFPLE1BQU07QUFBQSxJQUNyQyxVQUFFO0FBQ0QsYUFBTyxRQUFRO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxXQUFXLFNBQTJCO0FBQzdDLFFBQUk7QUFDSCxXQUFLLFNBQVMsS0FBSyxPQUFPO0FBQzFCLGFBQU8sUUFBUTtBQUFBLElBQ2hCLFNBQVMsS0FBSztBQUViLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBYSxTQUF5QjtBQUM3QyxVQUFNLFNBQVMsSUFBSSxhQUFhLE9BQU87QUFDdkMsVUFBTSxTQUFTLFlBQVksTUFBTTtBQUNqQyxVQUFNLE9BQU8sWUFBWSxNQUFNO0FBQy9CLFVBQU0sT0FBTyxPQUFPLENBQUM7QUFFckIsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQ0osYUFBSyxRQUFRLFlBQVksUUFBUSxZQUFZLE9BQU8sQ0FBQyxHQUFHLG1CQUE0QixHQUFHLGlCQUFpQixJQUFJLENBQUMsS0FBSyxPQUFPLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLElBQUksSUFBSTtBQUNoSixlQUFPLEtBQUssVUFBVSxFQUFFLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxhQUFhLE9BQU8sQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsS0FBSyxLQUFLLENBQUM7QUFBQSxNQUNsRyxLQUFLO0FBQ0osYUFBSyxRQUFRLFlBQVksUUFBUSxZQUFZLE9BQU8sQ0FBQyxHQUFHLG1CQUE0QixHQUFHLGlCQUFpQixJQUFJLENBQUMsS0FBSyxPQUFPLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxDQUFDLElBQUksSUFBSTtBQUNoSixlQUFPLEtBQUssY0FBYyxFQUFFLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxhQUFhLE9BQU8sQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsS0FBSyxLQUFLLENBQUM7QUFBQSxNQUN0RyxLQUFLO0FBQ0osYUFBSyxRQUFRLFlBQVksUUFBUSxZQUFZLE9BQU8sQ0FBQyxHQUFHLG1CQUE0QixHQUFHLGlCQUFpQixJQUFJLENBQUMsRUFBRTtBQUMvRyxlQUFPLEtBQUsscUJBQXFCLEVBQUUsTUFBTSxJQUFJLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN6RCxLQUFLO0FBQ0osYUFBSyxRQUFRLFlBQVksUUFBUSxZQUFZLE9BQU8sQ0FBQyxHQUFHLG1CQUE0QixHQUFHLGlCQUFpQixJQUFJLENBQUMsRUFBRTtBQUMvRyxlQUFPLEtBQUsscUJBQXFCLEVBQUUsTUFBTSxJQUFJLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFVBQVUsU0FBbUM7QUFDcEQsVUFBTSxVQUFVLEtBQUssU0FBUyxJQUFJLFFBQVEsV0FBVztBQUVyRCxRQUFJLENBQUMsU0FBUztBQUNiLFdBQUssc0JBQXNCLE9BQU87QUFDbEM7QUFBQSxJQUNEO0FBRUEsVUFBTSwwQkFBMEIsSUFBSSx3QkFBd0I7QUFDNUQsUUFBSTtBQUVKLFFBQUk7QUFDSCxnQkFBVSxRQUFRLEtBQUssS0FBSyxLQUFLLFFBQVEsTUFBTSxRQUFRLEtBQUssd0JBQXdCLEtBQUs7QUFBQSxJQUMxRixTQUFTLEtBQUs7QUFDYixnQkFBVSxRQUFRLE9BQU8sR0FBRztBQUFBLElBQzdCO0FBRUEsVUFBTSxLQUFLLFFBQVE7QUFFbkIsWUFBUSxLQUFLLFVBQVE7QUFDcEIsV0FBSyxhQUFhLEVBQUUsSUFBSSxNQUFNLE1BQU0seUJBQTRCLENBQUM7QUFBQSxJQUNsRSxHQUFHLFNBQU87QUFDVCxVQUFJLGVBQWUsT0FBTztBQUN6QixhQUFLLGFBQWE7QUFBQSxVQUNqQjtBQUFBLFVBQUksTUFBTTtBQUFBLFlBQ1QsU0FBUyxJQUFJO0FBQUEsWUFDYixNQUFNLElBQUk7QUFBQSxZQUNWLE9BQU8sSUFBSSxRQUFRLElBQUksTUFBTSxNQUFNLElBQUksSUFBSTtBQUFBLFVBQzVDO0FBQUEsVUFBRyxNQUFNO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixPQUFPO0FBQ04sYUFBSyxhQUFhLEVBQUUsSUFBSSxNQUFNLEtBQUssTUFBTSwwQkFBNkIsQ0FBQztBQUFBLE1BQ3hFO0FBQUEsSUFDRCxDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ2hCLGlCQUFXLFFBQVE7QUFDbkIsV0FBSyxlQUFlLE9BQU8sUUFBUSxFQUFFO0FBQUEsSUFDdEMsQ0FBQztBQUVELFVBQU0sYUFBYSxhQUFhLE1BQU0sd0JBQXdCLE9BQU8sQ0FBQztBQUN0RSxTQUFLLGVBQWUsSUFBSSxRQUFRLElBQUksVUFBVTtBQUFBLEVBQy9DO0FBQUEsRUFFUSxjQUFjLFNBQXVDO0FBQzVELFVBQU0sVUFBVSxLQUFLLFNBQVMsSUFBSSxRQUFRLFdBQVc7QUFFckQsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLHNCQUFzQixPQUFPO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxRQUFRO0FBQ25CLFVBQU0sUUFBUSxRQUFRLE9BQU8sS0FBSyxLQUFLLFFBQVEsTUFBTSxRQUFRLEdBQUc7QUFDaEUsVUFBTSxhQUFhLE1BQU0sVUFBUSxLQUFLLGFBQWEsRUFBRSxJQUFJLE1BQU0sTUFBTSxvQkFBdUIsQ0FBQyxDQUFDO0FBRTlGLFNBQUssZUFBZSxJQUFJLFFBQVEsSUFBSSxVQUFVO0FBQUEsRUFDL0M7QUFBQSxFQUVRLHFCQUFxQixTQUE0QjtBQUN4RCxVQUFNLGFBQWEsS0FBSyxlQUFlLElBQUksUUFBUSxFQUFFO0FBRXJELFFBQUksWUFBWTtBQUNmLGlCQUFXLFFBQVE7QUFDbkIsV0FBSyxlQUFlLE9BQU8sUUFBUSxFQUFFO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0IsU0FBNEQ7QUFDekYsUUFBSSxrQkFBa0IsS0FBSyxnQkFBZ0IsSUFBSSxRQUFRLFdBQVc7QUFFbEUsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQix3QkFBa0IsQ0FBQztBQUNuQixXQUFLLGdCQUFnQixJQUFJLFFBQVEsYUFBYSxlQUFlO0FBQUEsSUFDOUQ7QUFFQSxVQUFNLFFBQVEsV0FBVyxNQUFNO0FBQzlCLGNBQVEsTUFBTSxvQkFBb0IsUUFBUSxXQUFXLEVBQUU7QUFFdkQsVUFBSSxRQUFRLFNBQVMsbUJBQXFCO0FBQ3pDLGFBQUssYUFBYTtBQUFBLFVBQ2pCLElBQUksUUFBUTtBQUFBLFVBQ1osTUFBTSxFQUFFLE1BQU0sbUJBQW1CLFNBQVMsaUJBQWlCLFFBQVEsV0FBVyxxQkFBcUIsS0FBSyxZQUFZLE1BQU0sT0FBTyxPQUFVO0FBQUEsVUFDM0ksTUFBTTtBQUFBLFFBQ1AsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELEdBQUcsS0FBSyxZQUFZO0FBRXBCLG9CQUFnQixLQUFLLEVBQUUsU0FBUyxjQUFjLE1BQU0sQ0FBQztBQUFBLEVBQ3REO0FBQUEsRUFFUSxxQkFBcUIsYUFBMkI7QUFDdkQsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLElBQUksV0FBVztBQUVyRCxRQUFJLFVBQVU7QUFDYixpQkFBVyxXQUFXLFVBQVU7QUFDL0IscUJBQWEsUUFBUSxZQUFZO0FBRWpDLGdCQUFRLFFBQVEsUUFBUSxNQUFNO0FBQUEsVUFDN0IsS0FBSztBQUFxQixpQkFBSyxVQUFVLFFBQVEsT0FBTztBQUFHO0FBQUEsVUFDM0QsS0FBSztBQUF5QixpQkFBSyxjQUFjLFFBQVEsT0FBTztBQUFHO0FBQUEsUUFDcEU7QUFBQSxNQUNEO0FBRUEsV0FBSyxnQkFBZ0IsT0FBTyxXQUFXO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixRQUFJLEtBQUssa0JBQWtCO0FBQzFCLFdBQUssaUJBQWlCLFFBQVE7QUFDOUIsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QjtBQUNBLFlBQVEsS0FBSyxlQUFlLE9BQU8sQ0FBQztBQUNwQyxTQUFLLGVBQWUsTUFBTTtBQUFBLEVBQzNCO0FBQ0Q7QUFFTyxJQUFXLG1CQUFYLGtCQUFXQyxzQkFBWDtBQUNOLEVBQUFBLG9DQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLG9DQUFBLGVBQVksS0FBWjtBQUZpQixTQUFBQTtBQUFBLEdBQUE7QUFVWCxNQUFNLGNBQXFEO0FBQUEsRUFhakUsWUFBb0IsVUFBbUMsU0FBNEIsTUFBTTtBQUFyRTtBQVhwQixTQUFRLGFBQWE7QUFDckIsU0FBUSxRQUFlO0FBQ3ZCLFNBQVEsaUJBQWlCLG9CQUFJLElBQWlCO0FBQzlDLFNBQVEsV0FBVyxvQkFBSSxJQUFzQjtBQUM3QyxTQUFRLGdCQUFnQjtBQUl4QixTQUFpQixtQkFBbUIsSUFBSSxRQUFjO0FBQ3RELFNBQVMsa0JBQWtCLEtBQUssaUJBQWlCO0FBR2hELFNBQUssbUJBQW1CLEtBQUssU0FBUyxVQUFVLFNBQU8sS0FBSyxTQUFTLEdBQUcsQ0FBQztBQUN6RSxTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxXQUErQixhQUF3QjtBQUN0RCxVQUFNLE9BQU87QUFHYixXQUFPO0FBQUEsTUFDTixLQUFLLFNBQWlCLEtBQVcsbUJBQXVDO0FBQ3ZFLFlBQUksS0FBSyxZQUFZO0FBQ3BCLGlCQUFPLFFBQVEsT0FBTyxJQUFJLGtCQUFrQixDQUFDO0FBQUEsUUFDOUM7QUFDQSxlQUFPLEtBQUssZUFBZSxhQUFhLFNBQVMsS0FBSyxpQkFBaUI7QUFBQSxNQUN4RTtBQUFBLE1BQ0EsT0FBTyxPQUFlLEtBQVU7QUFDL0IsWUFBSSxLQUFLLFlBQVk7QUFDcEIsaUJBQU8sTUFBTTtBQUFBLFFBQ2Q7QUFDQSxlQUFPLEtBQUssYUFBYSxhQUFhLE9BQU8sR0FBRztBQUFBLE1BQ2pEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsYUFBcUIsTUFBYyxLQUFXLG9CQUFvQixrQkFBa0IsTUFBd0I7QUFDbEksVUFBTSxLQUFLLEtBQUs7QUFDaEIsVUFBTSxPQUFPO0FBQ2IsVUFBTSxVQUF1QixFQUFFLElBQUksTUFBTSxhQUFhLE1BQU0sSUFBSTtBQUVoRSxRQUFJLGtCQUFrQix5QkFBeUI7QUFDOUMsYUFBTyxRQUFRLE9BQU8sSUFBSSxrQkFBa0IsQ0FBQztBQUFBLElBQzlDO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFFSixVQUFNLFNBQVMsSUFBSSxRQUFRLENBQUMsR0FBRyxNQUFNO0FBQ3BDLFVBQUksa0JBQWtCLHlCQUF5QjtBQUM5QyxlQUFPLEVBQUUsSUFBSSxrQkFBa0IsQ0FBQztBQUFBLE1BQ2pDO0FBRUEsWUFBTSxZQUFZLE1BQU07QUFDdkIsY0FBTSxVQUFvQixjQUFZO0FBQ3JDLGtCQUFRLFNBQVMsTUFBTTtBQUFBLFlBQ3RCLEtBQUs7QUFDSixtQkFBSyxTQUFTLE9BQU8sRUFBRTtBQUN2QixnQkFBRSxTQUFTLElBQUk7QUFDZjtBQUFBLFlBRUQsS0FBSyx3QkFBMkI7QUFDL0IsbUJBQUssU0FBUyxPQUFPLEVBQUU7QUFDdkIsb0JBQU0sUUFBUSxJQUFJLE1BQU0sU0FBUyxLQUFLLE9BQU87QUFDN0Msb0JBQU0sUUFBUSxNQUFNLFFBQVEsU0FBUyxLQUFLLEtBQUssSUFBSSxTQUFTLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxTQUFTLEtBQUs7QUFDbEcsb0JBQU0sT0FBTyxTQUFTLEtBQUs7QUFDM0IsZ0JBQUUsS0FBSztBQUNQO0FBQUEsWUFDRDtBQUFBLFlBQ0EsS0FBSztBQUNKLG1CQUFLLFNBQVMsT0FBTyxFQUFFO0FBQ3ZCLGdCQUFFLFNBQVMsSUFBSTtBQUNmO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFFQSxhQUFLLFNBQVMsSUFBSSxJQUFJLE9BQU87QUFFN0IsWUFBSTtBQUNILGVBQUssWUFBWSxPQUFPO0FBQUEsUUFDekIsU0FBUyxLQUFLO0FBTWIsZUFBSyxTQUFTLE9BQU8sRUFBRTtBQUN2QixZQUFFLEdBQUc7QUFBQSxRQUNOO0FBQUEsTUFDRDtBQUVBLFVBQUksdUJBQXVEO0FBQzNELFVBQUksS0FBSyxVQUFVLGNBQVk7QUFDOUIsa0JBQVU7QUFBQSxNQUNYLE9BQU87QUFDTiwrQkFBdUIsd0JBQXdCLE9BQUssS0FBSyxnQkFBZ0IsQ0FBQztBQUMxRSw2QkFBcUIsS0FBSyxNQUFNO0FBQy9CLGlDQUF1QjtBQUN2QixvQkFBVTtBQUFBLFFBQ1gsR0FBRyxNQUFNO0FBQUEsUUFBRSxDQUFDO0FBQUEsTUFDYjtBQUVBLFlBQU0sU0FBUyxNQUFNO0FBQ3BCLFlBQUksc0JBQXNCO0FBQ3pCLCtCQUFxQixPQUFPO0FBQzVCLGlDQUF1QjtBQUFBLFFBQ3hCLE9BQU87QUFDTixlQUFLLFlBQVksRUFBRSxJQUFJLE1BQU0sd0JBQTBCLENBQUM7QUFBQSxRQUN6RDtBQUVBLFVBQUUsSUFBSSxrQkFBa0IsQ0FBQztBQUFBLE1BQzFCO0FBRUEsbUJBQWEsa0JBQWtCLHdCQUF3QixNQUFNO0FBQzdELG9DQUE4QjtBQUFBLFFBQzdCLFNBQVMseUJBQXlCLE1BQU07QUFDdkMsaUJBQU87QUFDUCxxQkFBVyxRQUFRO0FBQUEsUUFDcEIsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxXQUFLLGVBQWUsSUFBSSwyQkFBMkI7QUFBQSxJQUNwRCxDQUFDO0FBRUQsV0FBTyxPQUFPLFFBQVEsTUFBTTtBQUMzQixrQkFBWSxRQUFRO0FBQ3BCLFdBQUssZUFBZSxPQUFPLDJCQUEyQjtBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxhQUFhLGFBQXFCLE1BQWMsS0FBdUI7QUFDOUUsVUFBTSxLQUFLLEtBQUs7QUFDaEIsVUFBTSxPQUFPO0FBQ2IsVUFBTSxVQUF1QixFQUFFLElBQUksTUFBTSxhQUFhLE1BQU0sSUFBSTtBQUVoRSxRQUFJLHVCQUF1RDtBQUUzRCxVQUFNLFVBQVUsSUFBSSxRQUFhO0FBQUEsTUFDaEMsd0JBQXdCLE1BQU07QUFDN0IsY0FBTSxVQUFvQixDQUFDLFFBQXNCLFFBQVEsS0FBTSxJQUE4QixJQUFJO0FBQ2pHLGFBQUssU0FBUyxJQUFJLElBQUksT0FBTztBQUM3QixjQUFNLFlBQVksTUFBTTtBQUN2QixlQUFLLGVBQWUsSUFBSSxPQUFPO0FBQy9CLGVBQUssWUFBWSxPQUFPO0FBQUEsUUFDekI7QUFDQSxZQUFJLEtBQUssVUFBVSxjQUFZO0FBQzlCLG9CQUFVO0FBQUEsUUFDWCxPQUFPO0FBQ04saUNBQXVCLHdCQUF3QixPQUFLLEtBQUssZ0JBQWdCLENBQUM7QUFDMUUsK0JBQXFCLEtBQUssTUFBTTtBQUMvQixtQ0FBdUI7QUFDdkIsc0JBQVU7QUFBQSxVQUNYLEdBQUcsTUFBTTtBQUFBLFVBQUUsQ0FBQztBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsTUFDQSx5QkFBeUIsTUFBTTtBQUM5QixZQUFJLHNCQUFzQjtBQUN6QiwrQkFBcUIsT0FBTztBQUM1QixpQ0FBdUI7QUFBQSxRQUN4QixPQUFPO0FBQ04sZUFBSyxlQUFlLE9BQU8sT0FBTztBQUNsQyxlQUFLLFlBQVksRUFBRSxJQUFJLE1BQU0sdUJBQXlCLENBQUM7QUFBQSxRQUN4RDtBQUNBLGFBQUssU0FBUyxPQUFPLEVBQUU7QUFBQSxNQUN4QjtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sUUFBUTtBQUFBLEVBQ2hCO0FBQUEsRUFFUSxZQUFZLFNBQTRCO0FBQy9DLFlBQVEsUUFBUSxNQUFNO0FBQUEsTUFDckIsS0FBSztBQUFBLE1BQ0wsS0FBSyx1QkFBeUI7QUFDN0IsY0FBTSxZQUFZLEtBQUssS0FBSyxDQUFDLFFBQVEsTUFBTSxRQUFRLElBQUksUUFBUSxhQUFhLFFBQVEsSUFBSSxHQUFHLFFBQVEsR0FBRztBQUN0RyxhQUFLLFFBQVEsWUFBWSxXQUFXLFFBQVEsSUFBSSxtQkFBNEIsR0FBRyxpQkFBaUIsUUFBUSxJQUFJLENBQUMsS0FBSyxRQUFRLFdBQVcsSUFBSSxRQUFRLElBQUksSUFBSSxRQUFRLEdBQUc7QUFDcEs7QUFBQSxNQUNEO0FBQUEsTUFFQSxLQUFLO0FBQUEsTUFDTCxLQUFLLHdCQUEwQjtBQUM5QixjQUFNLFlBQVksS0FBSyxLQUFLLENBQUMsUUFBUSxNQUFNLFFBQVEsRUFBRSxDQUFDO0FBQ3RELGFBQUssUUFBUSxZQUFZLFdBQVcsUUFBUSxJQUFJLG1CQUE0QixpQkFBaUIsUUFBUSxJQUFJLENBQUM7QUFDMUc7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLEtBQUssUUFBaUIsT0FBWSxRQUFtQjtBQUM1RCxVQUFNLFNBQVMsSUFBSSxhQUFhO0FBQ2hDLFFBQUk7QUFDSCxnQkFBVSxRQUFRLE1BQU07QUFDeEIsZ0JBQVUsUUFBUSxJQUFJO0FBQ3RCLGFBQU8sS0FBSyxXQUFXLE9BQU8sTUFBTTtBQUFBLElBQ3JDLFVBQUU7QUFDRCxhQUFPLFFBQVE7QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQVcsU0FBMkI7QUFDN0MsUUFBSTtBQUNILFdBQUssU0FBUyxLQUFLLE9BQU87QUFDMUIsYUFBTyxRQUFRO0FBQUEsSUFDaEIsU0FBUyxLQUFLO0FBRWIsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFUSxTQUFTLFNBQXlCO0FBQ3pDLFVBQU0sU0FBUyxJQUFJLGFBQWEsT0FBTztBQUN2QyxVQUFNLFNBQVMsWUFBWSxNQUFNO0FBQ2pDLFVBQU0sT0FBTyxZQUFZLE1BQU07QUFDL0IsVUFBTSxPQUFxQixPQUFPLENBQUM7QUFFbkMsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQ0osYUFBSyxRQUFRLFlBQVksUUFBUSxZQUFZLEdBQUcsbUJBQTRCLGtCQUFrQixJQUFJLENBQUM7QUFDbkcsZUFBTyxLQUFLLFdBQVcsRUFBRSxNQUFNLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUUzQyxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osYUFBSyxRQUFRLFlBQVksUUFBUSxZQUFZLE9BQU8sQ0FBQyxHQUFHLG1CQUE0QixrQkFBa0IsSUFBSSxHQUFHLElBQUk7QUFDakgsZUFBTyxLQUFLLFdBQVcsRUFBRSxNQUFNLE9BQU8sQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQVcsVUFBOEI7QUFDaEQsUUFBSSxTQUFTLFNBQVMsc0JBQXlCO0FBQzlDLFdBQUssUUFBUTtBQUNiLFdBQUssaUJBQWlCLEtBQUs7QUFDM0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLEtBQUssU0FBUyxJQUFJLFNBQVMsRUFBRTtBQUU3QyxjQUFVLFFBQVE7QUFBQSxFQUNuQjtBQUFBLEVBR0EsSUFBSSx5QkFBd0M7QUFDM0MsV0FBTyxNQUFNLFVBQVUsS0FBSyxlQUFlO0FBQUEsRUFDNUM7QUFBQSxFQUVRLGtCQUFpQztBQUN4QyxRQUFJLEtBQUssVUFBVSxjQUFZO0FBQzlCLGFBQU8sUUFBUSxRQUFRO0FBQUEsSUFDeEIsT0FBTztBQUNOLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYTtBQUNsQixRQUFJLEtBQUssa0JBQWtCO0FBQzFCLFdBQUssaUJBQWlCLFFBQVE7QUFDOUIsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QjtBQUNBLFlBQVEsS0FBSyxlQUFlLE9BQU8sQ0FBQztBQUNwQyxTQUFLLGVBQWUsTUFBTTtBQUMxQixTQUFLLGlCQUFpQixRQUFRO0FBQUEsRUFDL0I7QUFDRDtBQXRCSztBQUFBLEVBREg7QUFBQSxHQW5QVyxjQW9QUjtBQTBDRSxNQUFNLFVBQXlJO0FBQUEsRUFtQnJKLFlBQVksb0JBQWtELFdBQStCLGNBQXVCO0FBakJwSCxTQUFRLFdBQVcsb0JBQUksSUFBc0M7QUFDN0QsU0FBUSxlQUFlLG9CQUFJLElBQTBCO0FBRXJELFNBQWlCLHNCQUFzQixJQUFJLFFBQThCO0FBQ3pFLFNBQVMscUJBQWtELEtBQUssb0JBQW9CO0FBRXBGLFNBQWlCLHlCQUF5QixJQUFJLFFBQThCO0FBQzVFLFNBQVMsd0JBQXFELEtBQUssdUJBQXVCO0FBRTFGLFNBQWlCLGNBQWMsSUFBSSxnQkFBZ0I7QUFTbEQsU0FBSyxZQUFZLElBQUksbUJBQW1CLENBQUMsRUFBRSxVQUFVLHNCQUFzQixNQUFNO0FBQ2hGLFlBQU0saUJBQWlCLE1BQU0sS0FBSyxTQUFTLFNBQVM7QUFFcEQsWUFBTSx3QkFBd0IsSUFBSSxnQkFBZ0I7QUFFbEQsWUFBTSwyQkFBMkIsZUFBZSxTQUFPO0FBQ3RELGNBQU0sU0FBUyxJQUFJLGFBQWEsR0FBRztBQUNuQyxjQUFNLE1BQU0sWUFBWSxNQUFNO0FBRTlCLGNBQU0sZ0JBQWdCLElBQUksY0FBYyxVQUFVLEtBQUssV0FBVyxZQUFZO0FBQzlFLGNBQU0sZ0JBQWdCLElBQUksY0FBYyxVQUFVLFNBQVM7QUFFM0QsYUFBSyxTQUFTLFFBQVEsQ0FBQyxTQUFTLFNBQVMsY0FBYyxnQkFBZ0IsTUFBTSxPQUFPLENBQUM7QUFFckYsY0FBTSxhQUFtQyxFQUFFLGVBQWUsZUFBZSxJQUFJO0FBQzdFLGFBQUssYUFBYSxJQUFJLFVBQVU7QUFDaEMsYUFBSyxvQkFBb0IsS0FBSyxVQUFVO0FBRXhDLDhCQUFzQixJQUFJLHNCQUFzQixNQUFNO0FBQ3JELHdCQUFjLFFBQVE7QUFDdEIsd0JBQWMsUUFBUTtBQUN0QixlQUFLLGFBQWEsT0FBTyxVQUFVO0FBQ25DLGVBQUssdUJBQXVCLEtBQUssVUFBVTtBQUMzQyxlQUFLLFlBQVksT0FBTyxxQkFBcUI7QUFDN0MsZ0NBQXNCLFFBQVE7QUFBQSxRQUMvQixDQUFDLENBQUM7QUFBQSxNQUNILENBQUM7QUFFRCw0QkFBc0IsSUFBSSx3QkFBd0I7QUFDbEQsV0FBSyxZQUFZLElBQUkscUJBQXFCO0FBQUEsSUFDM0MsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBdENBLElBQUksY0FBc0M7QUFDekMsVUFBTSxTQUFpQyxDQUFDO0FBQ3hDLFNBQUssYUFBYSxRQUFRLFNBQU8sT0FBTyxLQUFLLEdBQUcsQ0FBQztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBNkNBLFdBQStCLGFBQXFCLHNCQUE0RjtBQUMvSSxVQUFNLE9BQU87QUFHYixXQUFPO0FBQUEsTUFDTixLQUFLLFNBQWlCLEtBQVcsbUJBQW1EO0FBQ25GLFlBQUk7QUFFSixZQUFJLFdBQVcsb0JBQW9CLEdBQUc7QUFFckMsZ0JBQU0sYUFBYSxpQkFBaUIsS0FBSyxZQUFZLE9BQU8sb0JBQW9CLENBQUM7QUFFakYsOEJBQW9CLGFBRWpCLFFBQVEsUUFBUSxVQUFVLElBRTFCLE1BQU0sVUFBVSxNQUFNLE9BQU8sS0FBSyxvQkFBb0Isb0JBQW9CLENBQUM7QUFBQSxRQUMvRSxPQUFPO0FBQ04sOEJBQW9CLHFCQUFxQixVQUFVLE1BQU0sU0FBUyxHQUFHO0FBQUEsUUFDdEU7QUFFQSxjQUFNLGlCQUFpQixrQkFDckIsS0FBSyxnQkFBZSxXQUFvQyxjQUFjLFdBQVcsV0FBVyxDQUFDO0FBRS9GLGVBQU8sa0JBQWtCLGNBQWMsRUFDckMsS0FBSyxTQUFTLEtBQUssaUJBQWlCO0FBQUEsTUFDdkM7QUFBQSxNQUNBLE9BQU8sT0FBZSxLQUFvQjtBQUN6QyxZQUFJLFdBQVcsb0JBQW9CLEdBQUc7QUFDckMsaUJBQU8sS0FBSyxrQkFBa0IsYUFBYSxzQkFBc0IsT0FBTyxHQUFHO0FBQUEsUUFDNUU7QUFFQSxjQUFNLGlCQUFpQixxQkFBcUIsV0FBVyxNQUFNLE9BQU8sR0FBRyxFQUNyRSxLQUFLLGdCQUFlLFdBQW9DLGNBQWMsV0FBVyxXQUFXLENBQUM7QUFFL0YsZUFBTyxrQkFBa0IsY0FBYyxFQUNyQyxPQUFPLE9BQU8sR0FBRztBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFzQyxhQUFxQixjQUFxRCxXQUFtQixLQUFvQjtBQUM5SixVQUFNLE9BQU87QUFDYixRQUFJO0FBTUosVUFBTSxVQUFVLElBQUksUUFBVztBQUFBLE1BQzlCLHdCQUF3QixNQUFNO0FBQzdCLHNCQUFjLElBQUksZ0JBQWdCO0FBS2xDLGNBQU0sbUJBQW1CLElBQUksaUJBQW9CO0FBQ2pELGNBQU0sTUFBTSxvQkFBSSxJQUF1QztBQUV2RCxjQUFNLHFCQUFxQixDQUFDLGVBQXFDO0FBQ2hFLGdCQUFNLFVBQVUsV0FBVyxjQUFjLFdBQVcsV0FBVztBQUMvRCxnQkFBTSxRQUFRLFFBQVEsT0FBVSxXQUFXLEdBQUc7QUFDOUMsZ0JBQU0sYUFBYSxpQkFBaUIsSUFBSSxLQUFLO0FBRTdDLGNBQUksSUFBSSxZQUFZLFVBQVU7QUFBQSxRQUMvQjtBQUVBLGNBQU0sd0JBQXdCLENBQUMsZUFBcUM7QUFDbkUsZ0JBQU0sYUFBYSxJQUFJLElBQUksVUFBVTtBQUVyQyxjQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLFVBQ0Q7QUFFQSxxQkFBVyxRQUFRO0FBQ25CLGNBQUksT0FBTyxVQUFVO0FBQUEsUUFDdEI7QUFFQSxhQUFLLFlBQVksT0FBTyxZQUFZLEVBQUUsUUFBUSxrQkFBa0I7QUFDaEUsY0FBTSxPQUFPLEtBQUssb0JBQW9CLFlBQVksRUFBRSxvQkFBb0IsUUFBVyxXQUFXO0FBQzlGLGFBQUssc0JBQXNCLHVCQUF1QixRQUFXLFdBQVc7QUFDeEUseUJBQWlCLE1BQU0sUUFBUSxNQUFNLFNBQVMsV0FBVztBQUV6RCxvQkFBWSxJQUFJLGdCQUFnQjtBQUFBLE1BQ2pDO0FBQUEsTUFDQSx5QkFBeUIsTUFBTTtBQUM5QixxQkFBYSxRQUFRO0FBQ3JCLHNCQUFjO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssWUFBWSxJQUFJLE9BQU87QUFFNUIsV0FBTyxRQUFRO0FBQUEsRUFDaEI7QUFBQSxFQUVBLGdCQUFnQixhQUFxQixTQUF5QztBQUM3RSxTQUFLLFNBQVMsSUFBSSxhQUFhLE9BQU87QUFFdEMsZUFBVyxjQUFjLEtBQUssY0FBYztBQUMzQyxpQkFBVyxjQUFjLGdCQUFnQixhQUFhLE9BQU87QUFBQSxJQUM5RDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxZQUFZLFFBQVE7QUFFekIsZUFBVyxjQUFjLEtBQUssY0FBYztBQUMzQyxpQkFBVyxjQUFjLFFBQVE7QUFDakMsaUJBQVcsY0FBYyxRQUFRO0FBQUEsSUFDbEM7QUFFQSxTQUFLLGFBQWEsTUFBTTtBQUN4QixTQUFLLFNBQVMsTUFBTTtBQUNwQixTQUFLLG9CQUFvQixRQUFRO0FBQ2pDLFNBQUssdUJBQXVCLFFBQVE7QUFBQSxFQUNyQztBQUNEO0FBU08sTUFBTSxVQUE4RjtBQUFBLEVBSzFHLFlBQVksVUFBbUMsS0FBZSxZQUErQixNQUFNO0FBQ2xHLFVBQU0sU0FBUyxJQUFJLGFBQWE7QUFDaEMsUUFBSTtBQUNILGdCQUFVLFFBQVEsR0FBRztBQUNyQixlQUFTLEtBQUssT0FBTyxNQUFNO0FBQUEsSUFDNUIsVUFBRTtBQUNELGFBQU8sUUFBUTtBQUFBLElBQ2hCO0FBRUEsU0FBSyxnQkFBZ0IsSUFBSSxjQUFjLFVBQVUsU0FBUztBQUMxRCxTQUFLLGdCQUFnQixJQUFJLGNBQWMsVUFBVSxLQUFLLFNBQVM7QUFBQSxFQUNoRTtBQUFBLEVBRUEsV0FBK0IsYUFBd0I7QUFDdEQsV0FBTyxLQUFLLGNBQWMsV0FBVyxXQUFXO0FBQUEsRUFDakQ7QUFBQSxFQUVBLGdCQUFnQixhQUFxQixTQUF5QztBQUM3RSxTQUFLLGNBQWMsZ0JBQWdCLGFBQWEsT0FBTztBQUFBLEVBQ3hEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssY0FBYyxRQUFRO0FBQzNCLFNBQUssY0FBYyxRQUFRO0FBQUEsRUFDNUI7QUFDRDtBQUVPLFNBQVMsa0JBQXNDLFNBQXdCO0FBRTdFLFNBQU87QUFBQSxJQUNOLEtBQUssU0FBaUIsS0FBVyxtQkFBbUQ7QUFDbkYsYUFBTyxRQUFRLEtBQUssT0FBSyxFQUFFLEtBQVEsU0FBUyxLQUFLLGlCQUFpQixDQUFDO0FBQUEsSUFDcEU7QUFBQSxJQUVBLE9BQVUsT0FBZSxLQUFxQjtBQUM3QyxZQUFNLFFBQVEsSUFBSSxNQUFXO0FBQzdCLFdBQUssUUFBUTtBQUFBLFFBQ1osT0FBSyxNQUFNLFFBQVEsRUFBRSxPQUFPLE9BQU8sR0FBRztBQUFBLFFBQ3RDLE1BQU0sTUFBTSxRQUFRO0FBQUEsTUFDckI7QUFDQSxhQUFPLE1BQU07QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUyxtQkFBdUMsU0FBZTtBQUNyRSxNQUFJLFVBQVU7QUFHZCxTQUFPO0FBQUEsSUFDTixLQUFRLFNBQWlCLEtBQVcsbUJBQW1EO0FBQ3RGLFVBQUksU0FBUztBQUNaLGVBQU8sUUFBUSxLQUFLLFNBQVMsS0FBSyxpQkFBaUI7QUFBQSxNQUNwRDtBQUVBLGFBQU8sUUFBUSxDQUFDLEVBQ2QsS0FBSyxNQUFNLFVBQVUsSUFBSSxFQUN6QixLQUFLLE1BQU0sUUFBUSxLQUFRLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQztBQUFBLElBQzlEO0FBQUEsSUFDQSxPQUFVLE9BQWUsS0FBcUI7QUFDN0MsVUFBSSxTQUFTO0FBQ1osZUFBTyxRQUFRLE9BQVUsT0FBTyxHQUFHO0FBQUEsTUFDcEM7QUFFQSxZQUFNLFFBQVEsSUFBSSxNQUFTO0FBRTNCLGNBQVEsQ0FBQyxFQUNQLEtBQUssTUFBTSxVQUFVLElBQUksRUFDekIsS0FBSyxNQUFNLE1BQU0sUUFBUSxRQUFRLE9BQVUsT0FBTyxHQUFHLENBQUM7QUFFeEQsYUFBTyxNQUFNO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sYUFBbUU7QUFBQSxFQUUvRSxZQUFvQixJQUFtRDtBQUFuRDtBQUFBLEVBQXFEO0FBQUEsRUFFekUsVUFBVSxLQUEwRDtBQUNuRSxXQUFPLEtBQUssTUFBTSxHQUFHO0FBQUEsRUFDdEI7QUFBQSxFQUVBLFdBQVcsS0FBMEQ7QUFDcEUsV0FBTyxLQUFLLE1BQU0sR0FBRztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxNQUFjLE1BQU0sS0FBMEQ7QUFDN0UsZUFBVyxjQUFjLElBQUksYUFBYTtBQUN6QyxVQUFJLE1BQU0sUUFBUSxRQUFRLEtBQUssR0FBRyxXQUFXLEdBQUcsQ0FBQyxHQUFHO0FBQ25ELGVBQU8sUUFBUSxRQUFRLFVBQVU7QUFBQSxNQUNsQztBQUFBLElBQ0Q7QUFFQSxVQUFNLE1BQU0sVUFBVSxJQUFJLGtCQUFrQjtBQUM1QyxXQUFPLE1BQU0sS0FBSyxNQUFNLEdBQUc7QUFBQSxFQUM1QjtBQUNEO0FBZU8sSUFBVTtBQUFBLENBQVYsQ0FBVUMsa0JBQVY7QUFvQkMsV0FBUyxZQUFzQixTQUFrQixhQUE4QixTQUFrRTtBQUN2SixVQUFNLFVBQVU7QUFDaEIsVUFBTSxxQkFBcUIsU0FBUztBQUNwQyxVQUFNLG1CQUFtQixTQUFTLG1CQUFtQixJQUFJLElBQUksUUFBUSxnQkFBZ0IsSUFBSTtBQU96RixVQUFNLHNCQUFzQixvQkFBSSxJQUE0QjtBQUM1RCxlQUFXLE9BQU8sU0FBUztBQUMxQixVQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxrQkFBa0IsSUFBSSxHQUFHLEdBQUc7QUFDeEQsNEJBQW9CLElBQUksS0FBSyxNQUFNLE9BQU8sUUFBUSxHQUFHLEdBQXFCLEtBQUssTUFBTSxRQUFXLFdBQVcsQ0FBQztBQUFBLE1BQzdHO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSSxNQUFnQztBQUFBLE1BRTFDLE9BQVUsR0FBWSxPQUFlLEtBQW9CO0FBQ3hELGNBQU0sWUFBWSxvQkFBb0IsSUFBSSxLQUFLO0FBQy9DLFlBQUksV0FBVztBQUNkLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sU0FBUyxRQUFRLEtBQUs7QUFDNUIsWUFBSSxPQUFPLFdBQVcsWUFBWTtBQUNqQyxjQUFJLHVCQUF1QixLQUFLLEdBQUc7QUFDbEMsbUJBQU8sT0FBTyxLQUFLLFNBQVMsR0FBRztBQUFBLFVBQ2hDO0FBRUEsY0FBSSxnQkFBZ0IsS0FBSyxHQUFHO0FBQzNCLGdCQUFJLGtCQUFrQixJQUFJLEtBQUssR0FBRztBQUNqQyxxQkFBTyxRQUFRLEtBQUs7QUFBQSxZQUNyQjtBQUVBLGdDQUFvQixJQUFJLE9BQU8sTUFBTSxPQUFPLFFBQVEsS0FBSyxHQUFxQixPQUFPLE1BQU0sUUFBVyxXQUFXLENBQUM7QUFFbEgsbUJBQU8sb0JBQW9CLElBQUksS0FBSztBQUFBLFVBQ3JDO0FBQUEsUUFDRDtBQUVBLGNBQU0sSUFBSSxpQkFBaUIsb0JBQW9CLEtBQUssRUFBRTtBQUFBLE1BQ3ZEO0FBQUEsTUFFQSxLQUFLLEdBQVksU0FBaUIsTUFBNEI7QUFDN0QsY0FBTSxTQUFTLFFBQVEsT0FBTztBQUM5QixZQUFJLE9BQU8sV0FBVyxZQUFZO0FBR2pDLGNBQUksQ0FBQyxzQkFBc0IsTUFBTSxRQUFRLElBQUksR0FBRztBQUMvQyxxQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNyQyxtQkFBSyxDQUFDLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQztBQUFBLFlBQ3pCO0FBQUEsVUFDRDtBQUVBLGNBQUksTUFBTSxPQUFPLE1BQU0sU0FBUyxJQUFJO0FBQ3BDLGNBQUksRUFBRSxlQUFlLFVBQVU7QUFDOUIsa0JBQU0sUUFBUSxRQUFRLEdBQUc7QUFBQSxVQUMxQjtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sSUFBSSxpQkFBaUIscUJBQXFCLE9BQU8sRUFBRTtBQUFBLE1BQzFEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFsRU8sRUFBQUEsY0FBUztBQW1GVCxXQUFTLFVBQTRCLFNBQW1CLFNBQXlDO0FBQ3ZHLFVBQU0scUJBQXFCLFNBQVM7QUFFcEMsV0FBTyxJQUFJLE1BQU0sQ0FBQyxHQUFHO0FBQUEsTUFDcEIsSUFBSSxTQUFZLFNBQXNCO0FBQ3JDLFlBQUksT0FBTyxZQUFZLFVBQVU7QUFHaEMsY0FBSSxTQUFTLFlBQVksSUFBSSxPQUFPLEdBQUc7QUFDdEMsbUJBQU8sUUFBUSxXQUFXLElBQUksT0FBTztBQUFBLFVBQ3RDO0FBR0EsY0FBSSxZQUFZLFFBQVE7QUFDdkIsbUJBQU87QUFBQSxVQUNSO0FBR0EsY0FBSSx1QkFBdUIsT0FBTyxHQUFHO0FBQ3BDLG1CQUFPLFNBQVUsS0FBYztBQUM5QixxQkFBTyxRQUFRLE9BQU8sU0FBUyxHQUFHO0FBQUEsWUFDbkM7QUFBQSxVQUNEO0FBR0EsY0FBSSxnQkFBZ0IsT0FBTyxHQUFHO0FBQzdCLG1CQUFPLFFBQVEsT0FBTyxPQUFPO0FBQUEsVUFDOUI7QUFHQSxpQkFBTyxrQkFBbUIsTUFBaUI7QUFHMUMsZ0JBQUk7QUFDSixnQkFBSSxXQUFXLENBQUMsa0JBQWtCLFFBQVEsT0FBTyxHQUFHO0FBQ25ELDJCQUFhLENBQUMsUUFBUSxTQUFTLEdBQUcsSUFBSTtBQUFBLFlBQ3ZDLE9BQU87QUFDTiwyQkFBYTtBQUFBLFlBQ2Q7QUFFQSxrQkFBTSxTQUFTLE1BQU0sUUFBUSxLQUFLLFNBQVMsVUFBVTtBQUdyRCxnQkFBSSxDQUFDLG9CQUFvQjtBQUN4QixxQkFBTyxPQUFPLE1BQU07QUFBQSxZQUNyQjtBQUVBLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFFQSxjQUFNLElBQUksaUJBQWlCLHVCQUF1QixPQUFPLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDcEU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBdERPLEVBQUFBLGNBQVM7QUF3RGhCLFdBQVMsZ0JBQWdCLE1BQXVCO0FBRS9DLFdBQU8sS0FBSyxDQUFDLE1BQU0sT0FBTyxLQUFLLENBQUMsTUFBTSxPQUFPLFFBQVEsbUJBQW1CLEtBQUssV0FBVyxDQUFDLENBQUM7QUFBQSxFQUMzRjtBQUVBLFdBQVMsdUJBQXVCLE1BQXVCO0FBRXRELFdBQU8sYUFBYSxLQUFLLElBQUksS0FBSyxRQUFRLG1CQUFtQixLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDaEY7QUFBQSxHQXZLZ0I7QUEwS2pCLE1BQU0sY0FBYztBQUFBLEVBQ25CLENBQUMsV0FBVyxXQUFXLFdBQVcsV0FBVyxTQUFTO0FBQUEsRUFDdEQsQ0FBQyxXQUFXLFdBQVcsV0FBVyxXQUFXLFNBQVM7QUFDdkQ7QUFFQSxTQUFTLG9CQUFvQixNQUFvQjtBQUNoRCxNQUFJLE1BQU0sUUFBUSxJQUFJLEdBQUc7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFFBQVEsT0FBTyxTQUFTLFlBQVksT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUM1RSxVQUFNLFNBQVMsS0FBSyxTQUFTO0FBQzdCLFFBQUksV0FBVyxtQkFBbUI7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxPQUFPLE1BQW9CO0FBQ25DLE1BQUksTUFBTSxRQUFRLElBQUksR0FBRztBQUN4QixXQUFPLEtBQUssSUFBSSxtQkFBbUI7QUFBQSxFQUNwQztBQUNBLFNBQU8sb0JBQW9CLElBQUk7QUFDaEM7QUFFQSxTQUFTLGNBQWMsV0FBbUIsYUFBcUIsV0FBbUIsS0FBYSxXQUE2QixLQUFhLE1BQWlCO0FBQ3pKLFNBQU8sT0FBTyxJQUFJO0FBRWxCLFFBQU0sYUFBYSxZQUFZLFNBQVM7QUFDeEMsUUFBTSxRQUFRLFdBQVcsTUFBTSxXQUFXLE1BQU07QUFDaEQsTUFBSSxPQUFPLENBQUMsTUFBTSxTQUFTLE9BQU8sT0FBTyxXQUFXLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQyxZQUFZLE9BQU8sU0FBUyxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxPQUFPLEdBQUcsRUFBRSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLG9CQUFvQixlQUFlLGVBQWUsVUFBVSxLQUFLLEVBQUU7QUFDdE8sTUFBSSxNQUFNLEtBQUssR0FBRyxHQUFHO0FBQ3BCLFdBQU8sS0FBSyxPQUFPLElBQUk7QUFDdkIsU0FBSyxLQUFLLEdBQUc7QUFBQSxFQUNkLE9BQU87QUFDTixTQUFLLEtBQUssSUFBSTtBQUFBLEVBQ2Y7QUFDQSxVQUFRLElBQUksTUFBTSxTQUFTLElBQTZCO0FBQ3pEO0FBRU8sTUFBTSxVQUFnQztBQUFBLEVBSTVDLFlBQ2tCLGlCQUNBLGlCQUNoQjtBQUZnQjtBQUNBO0FBTGxCLFNBQVEsaUJBQWlCO0FBQ3pCLFNBQVEsaUJBQWlCO0FBQUEsRUFLckI7QUFBQSxFQUVHLFlBQVksV0FBbUIsV0FBbUIsV0FBNkIsS0FBYSxNQUFrQjtBQUNwSCxTQUFLLGtCQUFrQjtBQUN2QixrQkFBYyxLQUFLLGlCQUFpQixLQUFLLGdCQUFnQixXQUFXLFdBQVcsV0FBVyxLQUFLLElBQUk7QUFBQSxFQUNwRztBQUFBLEVBRU8sWUFBWSxXQUFtQixXQUFtQixXQUE2QixLQUFhLE1BQWtCO0FBQ3BILFNBQUssa0JBQWtCO0FBQ3ZCLGtCQUFjLEtBQUssaUJBQWlCLEtBQUssZ0JBQWdCLFdBQVcsV0FBVyxXQUFXLEtBQUssSUFBSTtBQUFBLEVBQ3BHO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlJlcXVlc3RUeXBlIiwgIlJlc3BvbnNlVHlwZSIsICJTdGF0ZSIsICJEYXRhVHlwZSIsICJSZXF1ZXN0SW5pdGlhdG9yIiwgIlByb3h5Q2hhbm5lbCJdCn0K
