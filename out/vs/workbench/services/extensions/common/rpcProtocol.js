var _a, _b;
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CharCode } from "../../../../base/common/charCode.js";
import * as errors from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { transformIncomingURIs } from "../../../../base/common/uriIpc.js";
import { CanceledLazyPromise, LazyPromise } from "./lazyPromise.js";
import { getStringIdentifierForProxy, ProxyIdentifier, SerializableObjectWithBuffers } from "./proxyIdentifier.js";
function safeStringify(obj, replacer) {
  try {
    return JSON.stringify(obj, replacer);
  } catch (err) {
    return "null";
  }
}
const refSymbolName = "$$ref$$";
const undefinedRef = { [refSymbolName]: -1 };
class StringifiedJsonWithBufferRefs {
  constructor(jsonString, referencedBuffers) {
    this.jsonString = jsonString;
    this.referencedBuffers = referencedBuffers;
  }
}
function stringifyJsonWithBufferRefs(obj, replacer = null, useSafeStringify = false) {
  const foundBuffers = [];
  const serialized = (useSafeStringify ? safeStringify : JSON.stringify)(obj, (key, value) => {
    if (typeof value === "undefined") {
      return undefinedRef;
    } else if (typeof value === "object") {
      if (value instanceof VSBuffer) {
        const bufferIndex = foundBuffers.push(value) - 1;
        return { [refSymbolName]: bufferIndex };
      }
      if (replacer) {
        return replacer(key, value);
      }
    }
    return value;
  });
  return {
    jsonString: serialized,
    referencedBuffers: foundBuffers
  };
}
function parseJsonAndRestoreBufferRefs(jsonString, buffers, uriTransformer) {
  return JSON.parse(jsonString, (_key, value) => {
    if (value) {
      const ref = value[refSymbolName];
      if (typeof ref === "number") {
        return buffers[ref];
      }
      if (uriTransformer && value.$mid === MarshalledId.Uri) {
        return uriTransformer.transformIncoming(value);
      }
    }
    return value;
  });
}
function stringify(obj, replacer) {
  return JSON.stringify(obj, replacer);
}
function createURIReplacer(transformer) {
  if (!transformer) {
    return null;
  }
  return (key, value) => {
    if (value && value.$mid === MarshalledId.Uri) {
      return transformer.transformOutgoing(value);
    }
    return value;
  };
}
var RequestInitiator = /* @__PURE__ */ ((RequestInitiator2) => {
  RequestInitiator2[RequestInitiator2["LocalSide"] = 0] = "LocalSide";
  RequestInitiator2[RequestInitiator2["OtherSide"] = 1] = "OtherSide";
  return RequestInitiator2;
})(RequestInitiator || {});
var ResponsiveState = /* @__PURE__ */ ((ResponsiveState2) => {
  ResponsiveState2[ResponsiveState2["Responsive"] = 0] = "Responsive";
  ResponsiveState2[ResponsiveState2["Unresponsive"] = 1] = "Unresponsive";
  return ResponsiveState2;
})(ResponsiveState || {});
const _RPCProtocolSymbol = /* @__PURE__ */ Symbol.for("rpcProtocol");
const _RPCProxySymbol = /* @__PURE__ */ Symbol.for("rpcProxy");
const _RPCProtocol = class _RPCProtocol extends (_b = Disposable, _a = _RPCProtocolSymbol, _b) {
  constructor(protocol, logger = null, transformer = null) {
    super();
    this[_a] = true;
    // 3s
    this._onDidChangeResponsiveState = this._register(new Emitter());
    this.onDidChangeResponsiveState = this._onDidChangeResponsiveState.event;
    this._protocol = protocol;
    this._logger = logger;
    this._uriTransformer = transformer;
    this._uriReplacer = createURIReplacer(this._uriTransformer);
    this._isDisposed = false;
    this._locals = [];
    this._proxies = [];
    for (let i = 0, len = ProxyIdentifier.count; i < len; i++) {
      this._locals[i] = null;
      this._proxies[i] = null;
    }
    this._lastMessageId = 0;
    this._cancelInvokedHandlers = /* @__PURE__ */ Object.create(null);
    this._pendingRPCReplies = {};
    this._responsiveState = 0 /* Responsive */;
    this._unacknowledgedCount = 0;
    this._unresponsiveTime = 0;
    this._asyncCheckUresponsive = this._register(new RunOnceScheduler(() => this._checkUnresponsive(), 1e3));
    this._register(this._protocol.onMessage((msg) => this._receiveOneMessage(msg)));
  }
  dispose() {
    this._isDisposed = true;
    Object.keys(this._pendingRPCReplies).forEach((msgId) => {
      const pending = this._pendingRPCReplies[msgId];
      delete this._pendingRPCReplies[msgId];
      pending.resolveErr(errors.canceled());
    });
    super.dispose();
  }
  drain() {
    if (typeof this._protocol.drain === "function") {
      return this._protocol.drain();
    }
    return Promise.resolve();
  }
  _onWillSendRequest(req) {
    if (this._unacknowledgedCount === 0) {
      this._unresponsiveTime = Date.now() + _RPCProtocol.UNRESPONSIVE_TIME;
    }
    this._unacknowledgedCount++;
    if (!this._asyncCheckUresponsive.isScheduled()) {
      this._asyncCheckUresponsive.schedule();
    }
  }
  _onDidReceiveAcknowledge(req) {
    this._unresponsiveTime = Date.now() + _RPCProtocol.UNRESPONSIVE_TIME;
    this._unacknowledgedCount--;
    if (this._unacknowledgedCount === 0) {
      this._asyncCheckUresponsive.cancel();
    }
    this._setResponsiveState(0 /* Responsive */);
  }
  _checkUnresponsive() {
    if (this._unacknowledgedCount === 0) {
      return;
    }
    if (Date.now() > this._unresponsiveTime) {
      this._setResponsiveState(1 /* Unresponsive */);
    } else {
      this._asyncCheckUresponsive.schedule();
    }
  }
  _setResponsiveState(newResponsiveState) {
    if (this._responsiveState === newResponsiveState) {
      return;
    }
    this._responsiveState = newResponsiveState;
    this._onDidChangeResponsiveState.fire(this._responsiveState);
  }
  get responsiveState() {
    return this._responsiveState;
  }
  transformIncomingURIs(obj) {
    if (!this._uriTransformer) {
      return obj;
    }
    return transformIncomingURIs(obj, this._uriTransformer);
  }
  getProxy(identifier) {
    const { nid: rpcId, sid } = identifier;
    if (!this._proxies[rpcId]) {
      this._proxies[rpcId] = this._createProxy(rpcId, sid);
    }
    return this._proxies[rpcId];
  }
  _createProxy(rpcId, debugName) {
    const handler = {
      get: (target, name) => {
        if (typeof name === "string" && !target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
          target[name] = (...myArgs) => {
            return this._remoteCall(rpcId, name, myArgs);
          };
        }
        if (name === _RPCProxySymbol) {
          return debugName;
        }
        return target[name];
      }
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), handler);
  }
  set(identifier, value) {
    this._locals[identifier.nid] = value;
    return value;
  }
  assertRegistered(identifiers) {
    for (let i = 0, len = identifiers.length; i < len; i++) {
      const identifier = identifiers[i];
      if (!this._locals[identifier.nid]) {
        throw new Error(`Missing proxy instance ${identifier.sid}`);
      }
    }
  }
  _receiveOneMessage(rawmsg) {
    if (this._isDisposed) {
      return;
    }
    const msgLength = rawmsg.byteLength;
    const buff = MessageBuffer.read(rawmsg, 0);
    const messageType = buff.readUInt8();
    const req = buff.readUInt32();
    switch (messageType) {
      case 1 /* RequestJSONArgs */:
      case 2 /* RequestJSONArgsWithCancellation */: {
        let { rpcId, method, args } = MessageIO.deserializeRequestJSONArgs(buff);
        if (this._uriTransformer) {
          args = transformIncomingURIs(args, this._uriTransformer);
        }
        this._receiveRequest(msgLength, req, rpcId, method, args, messageType === 2 /* RequestJSONArgsWithCancellation */);
        break;
      }
      case 3 /* RequestMixedArgs */:
      case 4 /* RequestMixedArgsWithCancellation */: {
        let { rpcId, method, args } = MessageIO.deserializeRequestMixedArgs(buff);
        if (this._uriTransformer) {
          args = transformIncomingURIs(args, this._uriTransformer);
        }
        this._receiveRequest(msgLength, req, rpcId, method, args, messageType === 4 /* RequestMixedArgsWithCancellation */);
        break;
      }
      case 5 /* Acknowledged */: {
        this._logger?.logIncoming(msgLength, req, 0 /* LocalSide */, `ack`);
        this._onDidReceiveAcknowledge(req);
        break;
      }
      case 6 /* Cancel */: {
        this._receiveCancel(msgLength, req);
        break;
      }
      case 7 /* ReplyOKEmpty */: {
        this._receiveReply(msgLength, req, void 0);
        break;
      }
      case 9 /* ReplyOKJSON */: {
        let value = MessageIO.deserializeReplyOKJSON(buff);
        if (this._uriTransformer) {
          value = transformIncomingURIs(value, this._uriTransformer);
        }
        this._receiveReply(msgLength, req, value);
        break;
      }
      case 10 /* ReplyOKJSONWithBuffers */: {
        const value = MessageIO.deserializeReplyOKJSONWithBuffers(buff, this._uriTransformer);
        this._receiveReply(msgLength, req, value);
        break;
      }
      case 8 /* ReplyOKVSBuffer */: {
        const value = MessageIO.deserializeReplyOKVSBuffer(buff);
        this._receiveReply(msgLength, req, value);
        break;
      }
      case 11 /* ReplyErrError */: {
        let err = MessageIO.deserializeReplyErrError(buff);
        if (this._uriTransformer) {
          err = transformIncomingURIs(err, this._uriTransformer);
        }
        this._receiveReplyErr(msgLength, req, err);
        break;
      }
      case 12 /* ReplyErrEmpty */: {
        this._receiveReplyErr(msgLength, req, void 0);
        break;
      }
      default:
        console.error(`received unexpected message`);
        console.error(rawmsg);
    }
  }
  _receiveRequest(msgLength, req, rpcId, method, args, usesCancellationToken) {
    this._logger?.logIncoming(msgLength, req, 1 /* OtherSide */, `receiveRequest ${getStringIdentifierForProxy(rpcId)}.${method}(`, args);
    const callId = String(req);
    let promise;
    let cancel;
    if (usesCancellationToken) {
      const cancellationTokenSource = new CancellationTokenSource();
      args.push(cancellationTokenSource.token);
      promise = this._invokeHandler(rpcId, method, args);
      cancel = () => cancellationTokenSource.cancel();
    } else {
      promise = this._invokeHandler(rpcId, method, args);
    }
    if (cancel) {
      this._cancelInvokedHandlers[callId] = cancel;
    }
    const msg = MessageIO.serializeAcknowledged(req);
    this._logger?.logOutgoing(msg.byteLength, req, 1 /* OtherSide */, `ack`);
    this._protocol.send(msg);
    promise.then((r) => {
      delete this._cancelInvokedHandlers[callId];
      const msg2 = MessageIO.serializeReplyOK(req, r, this._uriReplacer);
      this._logger?.logOutgoing(msg2.byteLength, req, 1 /* OtherSide */, `reply:`, r);
      this._protocol.send(msg2);
    }, (err) => {
      delete this._cancelInvokedHandlers[callId];
      const msg2 = MessageIO.serializeReplyErr(req, err);
      this._logger?.logOutgoing(msg2.byteLength, req, 1 /* OtherSide */, `replyErr:`, err);
      this._protocol.send(msg2);
    });
  }
  _receiveCancel(msgLength, req) {
    this._logger?.logIncoming(msgLength, req, 1 /* OtherSide */, `receiveCancel`);
    const callId = String(req);
    const cancel = this._cancelInvokedHandlers[callId];
    delete this._cancelInvokedHandlers[callId];
    cancel?.();
  }
  _receiveReply(msgLength, req, value) {
    this._logger?.logIncoming(msgLength, req, 0 /* LocalSide */, `receiveReply:`, value);
    const callId = String(req);
    if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
      return;
    }
    const pendingReply = this._pendingRPCReplies[callId];
    delete this._pendingRPCReplies[callId];
    pendingReply.resolveOk(value);
  }
  _receiveReplyErr(msgLength, req, value) {
    this._logger?.logIncoming(msgLength, req, 0 /* LocalSide */, `receiveReplyErr:`, value);
    const callId = String(req);
    if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
      return;
    }
    const pendingReply = this._pendingRPCReplies[callId];
    delete this._pendingRPCReplies[callId];
    let err = void 0;
    if (value) {
      if (value.$isError) {
        err = new Error();
        err.name = value.name;
        err.message = value.message;
        err.stack = value.stack;
      } else {
        err = value;
      }
    }
    pendingReply.resolveErr(err);
  }
  _invokeHandler(rpcId, methodName, args) {
    try {
      return Promise.resolve(this._doInvokeHandler(rpcId, methodName, args));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  _doInvokeHandler(rpcId, methodName, args) {
    const actor = this._locals[rpcId];
    if (!actor) {
      throw new Error("Unknown actor " + getStringIdentifierForProxy(rpcId));
    }
    const method = actor[methodName];
    if (typeof method !== "function") {
      throw new Error("Unknown method " + methodName + " on actor " + getStringIdentifierForProxy(rpcId));
    }
    return method.apply(actor, args);
  }
  _remoteCall(rpcId, methodName, args) {
    if (this._isDisposed) {
      return new CanceledLazyPromise();
    }
    let cancellationToken = null;
    if (args.length > 0 && CancellationToken.isCancellationToken(args[args.length - 1])) {
      cancellationToken = args.pop();
    }
    if (cancellationToken && cancellationToken.isCancellationRequested) {
      return Promise.reject(errors.canceled());
    }
    const serializedRequestArguments = MessageIO.serializeRequestArguments(args, this._uriReplacer);
    const req = ++this._lastMessageId;
    const callId = String(req);
    const result = new LazyPromise();
    const disposable = new DisposableStore();
    if (cancellationToken) {
      disposable.add(cancellationToken.onCancellationRequested(() => {
        const msg2 = MessageIO.serializeCancel(req);
        this._logger?.logOutgoing(msg2.byteLength, req, 0 /* LocalSide */, `cancel`);
        this._protocol.send(msg2);
      }));
    }
    this._pendingRPCReplies[callId] = new PendingRPCReply(result, disposable);
    this._onWillSendRequest(req);
    const msg = MessageIO.serializeRequest(req, rpcId, methodName, serializedRequestArguments, !!cancellationToken);
    this._logger?.logOutgoing(msg.byteLength, req, 0 /* LocalSide */, `request: ${getStringIdentifierForProxy(rpcId)}.${methodName}(`, args);
    this._protocol.send(msg);
    return result;
  }
};
_RPCProtocol.UNRESPONSIVE_TIME = 3 * 1e3;
let RPCProtocol = _RPCProtocol;
class PendingRPCReply {
  constructor(_promise, _disposable) {
    this._promise = _promise;
    this._disposable = _disposable;
  }
  resolveOk(value) {
    this._promise.resolveOk(value);
    this._disposable.dispose();
  }
  resolveErr(err) {
    this._promise.resolveErr(err);
    this._disposable.dispose();
  }
}
const _MessageBuffer = class _MessageBuffer {
  static alloc(type, req, messageSize) {
    const result = new _MessageBuffer(VSBuffer.alloc(
      messageSize + 1 + 4
      /* req */
    ), 0);
    result.writeUInt8(type);
    result.writeUInt32(req);
    return result;
  }
  static read(buff, offset) {
    return new _MessageBuffer(buff, offset);
  }
  get buffer() {
    return this._buff;
  }
  constructor(buff, offset) {
    this._buff = buff;
    this._offset = offset;
  }
  static sizeUInt8() {
    return 1;
  }
  writeUInt8(n) {
    this._buff.writeUInt8(n, this._offset);
    this._offset += 1;
  }
  readUInt8() {
    const n = this._buff.readUInt8(this._offset);
    this._offset += 1;
    return n;
  }
  writeUInt32(n) {
    this._buff.writeUInt32BE(n, this._offset);
    this._offset += 4;
  }
  readUInt32() {
    const n = this._buff.readUInt32BE(this._offset);
    this._offset += 4;
    return n;
  }
  static sizeShortString(str) {
    return 1 + str.byteLength;
  }
  writeShortString(str) {
    this._buff.writeUInt8(str.byteLength, this._offset);
    this._offset += 1;
    this._buff.set(str, this._offset);
    this._offset += str.byteLength;
  }
  readShortString() {
    const strByteLength = this._buff.readUInt8(this._offset);
    this._offset += 1;
    const strBuff = this._buff.slice(this._offset, this._offset + strByteLength);
    const str = strBuff.toString();
    this._offset += strByteLength;
    return str;
  }
  static sizeLongString(str) {
    return 4 + str.byteLength;
  }
  writeLongString(str) {
    this._buff.writeUInt32BE(str.byteLength, this._offset);
    this._offset += 4;
    this._buff.set(str, this._offset);
    this._offset += str.byteLength;
  }
  readLongString() {
    const strByteLength = this._buff.readUInt32BE(this._offset);
    this._offset += 4;
    const strBuff = this._buff.slice(this._offset, this._offset + strByteLength);
    const str = strBuff.toString();
    this._offset += strByteLength;
    return str;
  }
  writeBuffer(buff) {
    this._buff.writeUInt32BE(buff.byteLength, this._offset);
    this._offset += 4;
    this._buff.set(buff, this._offset);
    this._offset += buff.byteLength;
  }
  static sizeVSBuffer(buff) {
    return 4 + buff.byteLength;
  }
  writeVSBuffer(buff) {
    this._buff.writeUInt32BE(buff.byteLength, this._offset);
    this._offset += 4;
    this._buff.set(buff, this._offset);
    this._offset += buff.byteLength;
  }
  readVSBuffer() {
    const buffLength = this._buff.readUInt32BE(this._offset);
    this._offset += 4;
    const buff = this._buff.slice(this._offset, this._offset + buffLength);
    this._offset += buffLength;
    return buff;
  }
  static sizeMixedArray(arr) {
    let size = 0;
    size += 1;
    for (let i = 0, len = arr.length; i < len; i++) {
      const el = arr[i];
      size += 1;
      switch (el.type) {
        case 1 /* String */:
          size += this.sizeLongString(el.value);
          break;
        case 2 /* VSBuffer */:
          size += this.sizeVSBuffer(el.value);
          break;
        case 3 /* SerializedObjectWithBuffers */:
          size += this.sizeUInt32;
          size += this.sizeLongString(el.value);
          for (let i2 = 0; i2 < el.buffers.length; ++i2) {
            size += this.sizeVSBuffer(el.buffers[i2]);
          }
          break;
        case 4 /* Undefined */:
          break;
      }
    }
    return size;
  }
  writeMixedArray(arr) {
    this._buff.writeUInt8(arr.length, this._offset);
    this._offset += 1;
    for (let i = 0, len = arr.length; i < len; i++) {
      const el = arr[i];
      switch (el.type) {
        case 1 /* String */:
          this.writeUInt8(1 /* String */);
          this.writeLongString(el.value);
          break;
        case 2 /* VSBuffer */:
          this.writeUInt8(2 /* VSBuffer */);
          this.writeVSBuffer(el.value);
          break;
        case 3 /* SerializedObjectWithBuffers */:
          this.writeUInt8(3 /* SerializedObjectWithBuffers */);
          this.writeUInt32(el.buffers.length);
          this.writeLongString(el.value);
          for (let i2 = 0; i2 < el.buffers.length; ++i2) {
            this.writeBuffer(el.buffers[i2]);
          }
          break;
        case 4 /* Undefined */:
          this.writeUInt8(4 /* Undefined */);
          break;
      }
    }
  }
  readMixedArray() {
    const arrLen = this._buff.readUInt8(this._offset);
    this._offset += 1;
    const arr = new Array(arrLen);
    for (let i = 0; i < arrLen; i++) {
      const argType = this.readUInt8();
      switch (argType) {
        case 1 /* String */:
          arr[i] = this.readLongString();
          break;
        case 2 /* VSBuffer */:
          arr[i] = this.readVSBuffer();
          break;
        case 3 /* SerializedObjectWithBuffers */: {
          const bufferCount = this.readUInt32();
          const jsonString = this.readLongString();
          const buffers = [];
          for (let i2 = 0; i2 < bufferCount; ++i2) {
            buffers.push(this.readVSBuffer());
          }
          arr[i] = new SerializableObjectWithBuffers(parseJsonAndRestoreBufferRefs(jsonString, buffers, null));
          break;
        }
        case 4 /* Undefined */:
          arr[i] = void 0;
          break;
      }
    }
    return arr;
  }
};
_MessageBuffer.sizeUInt32 = 4;
let MessageBuffer = _MessageBuffer;
var SerializedRequestArgumentType = /* @__PURE__ */ ((SerializedRequestArgumentType2) => {
  SerializedRequestArgumentType2[SerializedRequestArgumentType2["Simple"] = 0] = "Simple";
  SerializedRequestArgumentType2[SerializedRequestArgumentType2["Mixed"] = 1] = "Mixed";
  return SerializedRequestArgumentType2;
})(SerializedRequestArgumentType || {});
class MessageIO {
  static _useMixedArgSerialization(arr) {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (arr[i] instanceof VSBuffer) {
        return true;
      }
      if (arr[i] instanceof SerializableObjectWithBuffers) {
        return true;
      }
      if (typeof arr[i] === "undefined") {
        return true;
      }
    }
    return false;
  }
  static serializeRequestArguments(args, replacer) {
    if (this._useMixedArgSerialization(args)) {
      const massagedArgs = [];
      for (let i = 0, len = args.length; i < len; i++) {
        const arg = args[i];
        if (arg instanceof VSBuffer) {
          massagedArgs[i] = { type: 2 /* VSBuffer */, value: arg };
        } else if (typeof arg === "undefined") {
          massagedArgs[i] = { type: 4 /* Undefined */ };
        } else if (arg instanceof SerializableObjectWithBuffers) {
          const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(arg.value, replacer);
          massagedArgs[i] = { type: 3 /* SerializedObjectWithBuffers */, value: VSBuffer.fromString(jsonString), buffers: referencedBuffers };
        } else {
          massagedArgs[i] = { type: 1 /* String */, value: VSBuffer.fromString(stringify(arg, replacer)) };
        }
      }
      return {
        type: 1 /* Mixed */,
        args: massagedArgs
      };
    }
    return {
      type: 0 /* Simple */,
      args: stringify(args, replacer)
    };
  }
  static serializeRequest(req, rpcId, method, serializedArgs, usesCancellationToken) {
    switch (serializedArgs.type) {
      case 0 /* Simple */:
        return this._requestJSONArgs(req, rpcId, method, serializedArgs.args, usesCancellationToken);
      case 1 /* Mixed */:
        return this._requestMixedArgs(req, rpcId, method, serializedArgs.args, usesCancellationToken);
    }
  }
  static _requestJSONArgs(req, rpcId, method, args, usesCancellationToken) {
    const methodBuff = VSBuffer.fromString(method);
    const argsBuff = VSBuffer.fromString(args);
    let len = 0;
    len += MessageBuffer.sizeUInt8();
    len += MessageBuffer.sizeShortString(methodBuff);
    len += MessageBuffer.sizeLongString(argsBuff);
    const result = MessageBuffer.alloc(usesCancellationToken ? 2 /* RequestJSONArgsWithCancellation */ : 1 /* RequestJSONArgs */, req, len);
    result.writeUInt8(rpcId);
    result.writeShortString(methodBuff);
    result.writeLongString(argsBuff);
    return result.buffer;
  }
  static deserializeRequestJSONArgs(buff) {
    const rpcId = buff.readUInt8();
    const method = buff.readShortString();
    const args = buff.readLongString();
    return {
      rpcId,
      method,
      args: JSON.parse(args)
    };
  }
  static _requestMixedArgs(req, rpcId, method, args, usesCancellationToken) {
    const methodBuff = VSBuffer.fromString(method);
    let len = 0;
    len += MessageBuffer.sizeUInt8();
    len += MessageBuffer.sizeShortString(methodBuff);
    len += MessageBuffer.sizeMixedArray(args);
    const result = MessageBuffer.alloc(usesCancellationToken ? 4 /* RequestMixedArgsWithCancellation */ : 3 /* RequestMixedArgs */, req, len);
    result.writeUInt8(rpcId);
    result.writeShortString(methodBuff);
    result.writeMixedArray(args);
    return result.buffer;
  }
  static deserializeRequestMixedArgs(buff) {
    const rpcId = buff.readUInt8();
    const method = buff.readShortString();
    const rawargs = buff.readMixedArray();
    const args = new Array(rawargs.length);
    for (let i = 0, len = rawargs.length; i < len; i++) {
      const rawarg = rawargs[i];
      if (typeof rawarg === "string") {
        args[i] = JSON.parse(rawarg);
      } else {
        args[i] = rawarg;
      }
    }
    return {
      rpcId,
      method,
      args
    };
  }
  static serializeAcknowledged(req) {
    return MessageBuffer.alloc(5 /* Acknowledged */, req, 0).buffer;
  }
  static serializeCancel(req) {
    return MessageBuffer.alloc(6 /* Cancel */, req, 0).buffer;
  }
  static serializeReplyOK(req, res, replacer) {
    if (typeof res === "undefined") {
      return this._serializeReplyOKEmpty(req);
    } else if (res instanceof VSBuffer) {
      return this._serializeReplyOKVSBuffer(req, res);
    } else if (res instanceof SerializableObjectWithBuffers) {
      const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(res.value, replacer, true);
      return this._serializeReplyOKJSONWithBuffers(req, jsonString, referencedBuffers);
    } else {
      return this._serializeReplyOKJSON(req, safeStringify(res, replacer));
    }
  }
  static _serializeReplyOKEmpty(req) {
    return MessageBuffer.alloc(7 /* ReplyOKEmpty */, req, 0).buffer;
  }
  static _serializeReplyOKVSBuffer(req, res) {
    let len = 0;
    len += MessageBuffer.sizeVSBuffer(res);
    const result = MessageBuffer.alloc(8 /* ReplyOKVSBuffer */, req, len);
    result.writeVSBuffer(res);
    return result.buffer;
  }
  static deserializeReplyOKVSBuffer(buff) {
    return buff.readVSBuffer();
  }
  static _serializeReplyOKJSON(req, res) {
    const resBuff = VSBuffer.fromString(res);
    let len = 0;
    len += MessageBuffer.sizeLongString(resBuff);
    const result = MessageBuffer.alloc(9 /* ReplyOKJSON */, req, len);
    result.writeLongString(resBuff);
    return result.buffer;
  }
  static _serializeReplyOKJSONWithBuffers(req, res, buffers) {
    const resBuff = VSBuffer.fromString(res);
    let len = 0;
    len += MessageBuffer.sizeUInt32;
    len += MessageBuffer.sizeLongString(resBuff);
    for (const buffer of buffers) {
      len += MessageBuffer.sizeVSBuffer(buffer);
    }
    const result = MessageBuffer.alloc(10 /* ReplyOKJSONWithBuffers */, req, len);
    result.writeUInt32(buffers.length);
    result.writeLongString(resBuff);
    for (const buffer of buffers) {
      result.writeBuffer(buffer);
    }
    return result.buffer;
  }
  static deserializeReplyOKJSON(buff) {
    const res = buff.readLongString();
    return JSON.parse(res);
  }
  static deserializeReplyOKJSONWithBuffers(buff, uriTransformer) {
    const bufferCount = buff.readUInt32();
    const res = buff.readLongString();
    const buffers = [];
    for (let i = 0; i < bufferCount; ++i) {
      buffers.push(buff.readVSBuffer());
    }
    return new SerializableObjectWithBuffers(parseJsonAndRestoreBufferRefs(res, buffers, uriTransformer));
  }
  static serializeReplyErr(req, err) {
    const errStr = err ? safeStringify(errors.transformErrorForSerialization(err), null) : void 0;
    if (typeof errStr !== "string") {
      return this._serializeReplyErrEmpty(req);
    }
    const errBuff = VSBuffer.fromString(errStr);
    let len = 0;
    len += MessageBuffer.sizeLongString(errBuff);
    const result = MessageBuffer.alloc(11 /* ReplyErrError */, req, len);
    result.writeLongString(errBuff);
    return result.buffer;
  }
  static deserializeReplyErrError(buff) {
    const err = buff.readLongString();
    return JSON.parse(err);
  }
  static _serializeReplyErrEmpty(req) {
    return MessageBuffer.alloc(12 /* ReplyErrEmpty */, req, 0).buffer;
  }
}
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["RequestJSONArgs"] = 1] = "RequestJSONArgs";
  MessageType2[MessageType2["RequestJSONArgsWithCancellation"] = 2] = "RequestJSONArgsWithCancellation";
  MessageType2[MessageType2["RequestMixedArgs"] = 3] = "RequestMixedArgs";
  MessageType2[MessageType2["RequestMixedArgsWithCancellation"] = 4] = "RequestMixedArgsWithCancellation";
  MessageType2[MessageType2["Acknowledged"] = 5] = "Acknowledged";
  MessageType2[MessageType2["Cancel"] = 6] = "Cancel";
  MessageType2[MessageType2["ReplyOKEmpty"] = 7] = "ReplyOKEmpty";
  MessageType2[MessageType2["ReplyOKVSBuffer"] = 8] = "ReplyOKVSBuffer";
  MessageType2[MessageType2["ReplyOKJSON"] = 9] = "ReplyOKJSON";
  MessageType2[MessageType2["ReplyOKJSONWithBuffers"] = 10] = "ReplyOKJSONWithBuffers";
  MessageType2[MessageType2["ReplyErrError"] = 11] = "ReplyErrError";
  MessageType2[MessageType2["ReplyErrEmpty"] = 12] = "ReplyErrEmpty";
  return MessageType2;
})(MessageType || {});
var ArgType = /* @__PURE__ */ ((ArgType2) => {
  ArgType2[ArgType2["String"] = 1] = "String";
  ArgType2[ArgType2["VSBuffer"] = 2] = "VSBuffer";
  ArgType2[ArgType2["SerializedObjectWithBuffers"] = 3] = "SerializedObjectWithBuffers";
  ArgType2[ArgType2["Undefined"] = 4] = "Undefined";
  return ArgType2;
})(ArgType || {});
export {
  RPCProtocol,
  RequestInitiator,
  ResponsiveState,
  parseJsonAndRestoreBufferRefs,
  stringifyJsonWithBufferRefs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXHJwY1Byb3RvY29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXIsIHRyYW5zZm9ybUluY29taW5nVVJJcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsZWRMYXp5UHJvbWlzZSwgTGF6eVByb21pc2UgfSBmcm9tICcuL2xhenlQcm9taXNlLmpzJztcbmltcG9ydCB7IGdldFN0cmluZ0lkZW50aWZpZXJGb3JQcm94eSwgSVJQQ1Byb3RvY29sLCBQcm94aWVkLCBQcm94eUlkZW50aWZpZXIsIFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi9wcm94eUlkZW50aWZpZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEpTT05TdHJpbmdpZnlSZXBsYWNlciB7XG5cdChrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueTtcbn1cblxuZnVuY3Rpb24gc2FmZVN0cmluZ2lmeShvYmo6IGFueSwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwpOiBzdHJpbmcge1xuXHR0cnkge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIDwoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IGFueT5yZXBsYWNlcik7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdHJldHVybiAnbnVsbCc7XG5cdH1cbn1cblxuY29uc3QgcmVmU3ltYm9sTmFtZSA9ICckJHJlZiQkJztcbmNvbnN0IHVuZGVmaW5lZFJlZiA9IHsgW3JlZlN5bWJvbE5hbWVdOiAtMSB9IGFzIGNvbnN0O1xuXG5jbGFzcyBTdHJpbmdpZmllZEpzb25XaXRoQnVmZmVyUmVmcyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBqc29uU3RyaW5nOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlZmVyZW5jZWRCdWZmZXJzOiByZWFkb25seSBWU0J1ZmZlcltdLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5naWZ5SnNvbldpdGhCdWZmZXJSZWZzPFQ+KG9iajogVCwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwgPSBudWxsLCB1c2VTYWZlU3RyaW5naWZ5ID0gZmFsc2UpOiBTdHJpbmdpZmllZEpzb25XaXRoQnVmZmVyUmVmcyB7XG5cdGNvbnN0IGZvdW5kQnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXHRjb25zdCBzZXJpYWxpemVkID0gKHVzZVNhZmVTdHJpbmdpZnkgPyBzYWZlU3RyaW5naWZ5IDogSlNPTi5zdHJpbmdpZnkpKG9iaiwgKGtleSwgdmFsdWUpID0+IHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZFJlZjsgLy8gSlNPTi5zdHJpbmdpZnkgbm9ybWFsbHkgY29udmVydHMgJ3VuZGVmaW5lZCcgdG8gJ251bGwnXG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRpZiAodmFsdWUgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0XHRjb25zdCBidWZmZXJJbmRleCA9IGZvdW5kQnVmZmVycy5wdXNoKHZhbHVlKSAtIDE7XG5cdFx0XHRcdHJldHVybiB7IFtyZWZTeW1ib2xOYW1lXTogYnVmZmVySW5kZXggfTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXBsYWNlcikge1xuXHRcdFx0XHRyZXR1cm4gcmVwbGFjZXIoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fSk7XG5cdHJldHVybiB7XG5cdFx0anNvblN0cmluZzogc2VyaWFsaXplZCxcblx0XHRyZWZlcmVuY2VkQnVmZmVyczogZm91bmRCdWZmZXJzXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUpzb25BbmRSZXN0b3JlQnVmZmVyUmVmcyhqc29uU3RyaW5nOiBzdHJpbmcsIGJ1ZmZlcnM6IHJlYWRvbmx5IFZTQnVmZmVyW10sIHVyaVRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogYW55IHtcblx0cmV0dXJuIEpTT04ucGFyc2UoanNvblN0cmluZywgKF9rZXksIHZhbHVlKSA9PiB7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRjb25zdCByZWYgPSB2YWx1ZVtyZWZTeW1ib2xOYW1lXTtcblx0XHRcdGlmICh0eXBlb2YgcmVmID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXR1cm4gYnVmZmVyc1tyZWZdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodXJpVHJhbnNmb3JtZXIgJiYgKDxNYXJzaGFsbGVkT2JqZWN0PnZhbHVlKS4kbWlkID09PSBNYXJzaGFsbGVkSWQuVXJpKSB7XG5cdFx0XHRcdHJldHVybiB1cmlUcmFuc2Zvcm1lci50cmFuc2Zvcm1JbmNvbWluZyh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fSk7XG59XG5cblxuZnVuY3Rpb24gc3RyaW5naWZ5KG9iajogYW55LCByZXBsYWNlcjogSlNPTlN0cmluZ2lmeVJlcGxhY2VyIHwgbnVsbCk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeShvYmosIDwoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IGFueT5yZXBsYWNlcik7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVVSSVJlcGxhY2VyKHRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogSlNPTlN0cmluZ2lmeVJlcGxhY2VyIHwgbnVsbCB7XG5cdGlmICghdHJhbnNmb3JtZXIpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRyZXR1cm4gKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYW55ID0+IHtcblx0XHRpZiAodmFsdWUgJiYgdmFsdWUuJG1pZCA9PT0gTWFyc2hhbGxlZElkLlVyaSkge1xuXHRcdFx0cmV0dXJuIHRyYW5zZm9ybWVyLnRyYW5zZm9ybU91dGdvaW5nKHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBSZXF1ZXN0SW5pdGlhdG9yIHtcblx0TG9jYWxTaWRlID0gMCxcblx0T3RoZXJTaWRlID0gMVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBSZXNwb25zaXZlU3RhdGUge1xuXHRSZXNwb25zaXZlID0gMCxcblx0VW5yZXNwb25zaXZlID0gMVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSUENQcm90b2NvbExvZ2dlciB7XG5cdGxvZ0luY29taW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZywgZGF0YT86IGFueSk6IHZvaWQ7XG5cdGxvZ091dGdvaW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZywgZGF0YT86IGFueSk6IHZvaWQ7XG59XG5cbmNvbnN0IF9SUENQcm90b2NvbFN5bWJvbCA9IFN5bWJvbC5mb3IoJ3JwY1Byb3RvY29sJyk7XG5jb25zdCBfUlBDUHJveHlTeW1ib2wgPSBTeW1ib2wuZm9yKCdycGNQcm94eScpO1xuXG5leHBvcnQgY2xhc3MgUlBDUHJvdG9jb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVJQQ1Byb3RvY29sIHtcblxuXHRbX1JQQ1Byb3RvY29sU3ltYm9sXSA9IHRydWU7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVU5SRVNQT05TSVZFX1RJTUUgPSAzICogMTAwMDsgLy8gM3NcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZTogRW1pdHRlcjxSZXNwb25zaXZlU3RhdGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVzcG9uc2l2ZVN0YXRlPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzcG9uc2l2ZVN0YXRlOiBFdmVudDxSZXNwb25zaXZlU3RhdGU+ID0gdGhpcy5fb25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElSUENQcm90b2NvbExvZ2dlciB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VyaVRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cmlSZXBsYWNlcjogSlNPTlN0cmluZ2lmeVJlcGxhY2VyIHwgbnVsbDtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxzOiBhbnlbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveGllczogYW55W107XG5cdHByaXZhdGUgX2xhc3RNZXNzYWdlSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FuY2VsSW52b2tlZEhhbmRsZXJzOiB7IFtyZXE6IHN0cmluZ106ICgpID0+IHZvaWQgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1JQQ1JlcGxpZXM6IHsgW21zZ0lkOiBzdHJpbmddOiBQZW5kaW5nUlBDUmVwbHkgfTtcblx0cHJpdmF0ZSBfcmVzcG9uc2l2ZVN0YXRlOiBSZXNwb25zaXZlU3RhdGU7XG5cdHByaXZhdGUgX3VuYWNrbm93bGVkZ2VkQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfdW5yZXNwb25zaXZlVGltZTogbnVtYmVyO1xuXHRwcml2YXRlIF9hc3luY0NoZWNrVXJlc3BvbnNpdmU6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBsb2dnZXI6IElSUENQcm90b2NvbExvZ2dlciB8IG51bGwgPSBudWxsLCB0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCA9IG51bGwpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG5cdFx0dGhpcy5fbG9nZ2VyID0gbG9nZ2VyO1xuXHRcdHRoaXMuX3VyaVRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXI7XG5cdFx0dGhpcy5fdXJpUmVwbGFjZXIgPSBjcmVhdGVVUklSZXBsYWNlcih0aGlzLl91cmlUcmFuc2Zvcm1lcik7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2xvY2FscyA9IFtdO1xuXHRcdHRoaXMuX3Byb3hpZXMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gUHJveHlJZGVudGlmaWVyLmNvdW50OyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHRoaXMuX2xvY2Fsc1tpXSA9IG51bGw7XG5cdFx0XHR0aGlzLl9wcm94aWVzW2ldID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdE1lc3NhZ2VJZCA9IDA7XG5cdFx0dGhpcy5fY2FuY2VsSW52b2tlZEhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9wZW5kaW5nUlBDUmVwbGllcyA9IHt9O1xuXHRcdHRoaXMuX3Jlc3BvbnNpdmVTdGF0ZSA9IFJlc3BvbnNpdmVTdGF0ZS5SZXNwb25zaXZlO1xuXHRcdHRoaXMuX3VuYWNrbm93bGVkZ2VkQ291bnQgPSAwO1xuXHRcdHRoaXMuX3VucmVzcG9uc2l2ZVRpbWUgPSAwO1xuXHRcdHRoaXMuX2FzeW5jQ2hlY2tVcmVzcG9uc2l2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX2NoZWNrVW5yZXNwb25zaXZlKCksIDEwMDApKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm90b2NvbC5vbk1lc3NhZ2UoKG1zZykgPT4gdGhpcy5fcmVjZWl2ZU9uZU1lc3NhZ2UobXNnKSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cblx0XHQvLyBSZWxlYXNlIGFsbCBvdXRzdGFuZGluZyBwcm9taXNlcyB3aXRoIGEgY2FuY2VsZWQgZXJyb3Jcblx0XHRPYmplY3Qua2V5cyh0aGlzLl9wZW5kaW5nUlBDUmVwbGllcykuZm9yRWFjaCgobXNnSWQpID0+IHtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nUlBDUmVwbGllc1ttc2dJZF07XG5cdFx0XHRkZWxldGUgdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXNbbXNnSWRdO1xuXHRcdFx0cGVuZGluZy5yZXNvbHZlRXJyKGVycm9ycy5jYW5jZWxlZCgpKTtcblx0XHR9KTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBkcmFpbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3RvY29sLmRyYWluID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvdG9jb2wuZHJhaW4oKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25XaWxsU2VuZFJlcXVlc3QocmVxOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdW5hY2tub3dsZWRnZWRDb3VudCA9PT0gMCkge1xuXHRcdFx0Ly8gU2luY2UgdGhpcyBpcyB0aGUgZmlyc3QgcmVxdWVzdCB3ZSBhcmUgc2VuZGluZyBpbiBhIHdoaWxlLFxuXHRcdFx0Ly8gbWFyayB0aGlzIG1vbWVudCBhcyB0aGUgc3RhcnQgZm9yIHRoZSBjb3VudGRvd24gdG8gdW5yZXNwb25zaXZlIHRpbWVcblx0XHRcdHRoaXMuX3VucmVzcG9uc2l2ZVRpbWUgPSBEYXRlLm5vdygpICsgUlBDUHJvdG9jb2wuVU5SRVNQT05TSVZFX1RJTUU7XG5cdFx0fVxuXHRcdHRoaXMuX3VuYWNrbm93bGVkZ2VkQ291bnQrKztcblx0XHRpZiAoIXRoaXMuX2FzeW5jQ2hlY2tVcmVzcG9uc2l2ZS5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLl9hc3luY0NoZWNrVXJlc3BvbnNpdmUuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZFJlY2VpdmVBY2tub3dsZWRnZShyZXE6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIFRoZSBuZXh0IHBvc3NpYmxlIHVucmVzcG9uc2l2ZSB0aW1lIGlzIG5vdyArIGRlbHRhLlxuXHRcdHRoaXMuX3VucmVzcG9uc2l2ZVRpbWUgPSBEYXRlLm5vdygpICsgUlBDUHJvdG9jb2wuVU5SRVNQT05TSVZFX1RJTUU7XG5cdFx0dGhpcy5fdW5hY2tub3dsZWRnZWRDb3VudC0tO1xuXHRcdGlmICh0aGlzLl91bmFja25vd2xlZGdlZENvdW50ID09PSAwKSB7XG5cdFx0XHQvLyBObyBtb3JlIG5lZWQgdG8gY2hlY2sgZm9yIHVucmVzcG9uc2l2ZVxuXHRcdFx0dGhpcy5fYXN5bmNDaGVja1VyZXNwb25zaXZlLmNhbmNlbCgpO1xuXHRcdH1cblx0XHQvLyBUaGUgZXh0IGhvc3QgaXMgcmVzcG9uc2l2ZSFcblx0XHR0aGlzLl9zZXRSZXNwb25zaXZlU3RhdGUoUmVzcG9uc2l2ZVN0YXRlLlJlc3BvbnNpdmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tVbnJlc3BvbnNpdmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3VuYWNrbm93bGVkZ2VkQ291bnQgPT09IDApIHtcblx0XHRcdC8vIE5vdCB3YWl0aW5nIGZvciBhbnl0aGluZyA9PiBjYW5ub3Qgc2F5IGlmIGl0IGlzIHJlc3BvbnNpdmUgb3Igbm90XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKERhdGUubm93KCkgPiB0aGlzLl91bnJlc3BvbnNpdmVUaW1lKSB7XG5cdFx0XHQvLyBVbnJlc3BvbnNpdmUhIVxuXHRcdFx0dGhpcy5fc2V0UmVzcG9uc2l2ZVN0YXRlKFJlc3BvbnNpdmVTdGF0ZS5VbnJlc3BvbnNpdmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOb3QgKHlldCkgdW5yZXNwb25zaXZlLCBiZSBzdXJlIHRvIGNoZWNrIGFnYWluIHNvb25cblx0XHRcdHRoaXMuX2FzeW5jQ2hlY2tVcmVzcG9uc2l2ZS5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldFJlc3BvbnNpdmVTdGF0ZShuZXdSZXNwb25zaXZlU3RhdGU6IFJlc3BvbnNpdmVTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZXNwb25zaXZlU3RhdGUgPT09IG5ld1Jlc3BvbnNpdmVTdGF0ZSkge1xuXHRcdFx0Ly8gbm8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3BvbnNpdmVTdGF0ZSA9IG5ld1Jlc3BvbnNpdmVTdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZS5maXJlKHRoaXMuX3Jlc3BvbnNpdmVTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlc3BvbnNpdmVTdGF0ZSgpOiBSZXNwb25zaXZlU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9yZXNwb25zaXZlU3RhdGU7XG5cdH1cblxuXHRwdWJsaWMgdHJhbnNmb3JtSW5jb21pbmdVUklzPFQ+KG9iajogVCk6IFQge1xuXHRcdGlmICghdGhpcy5fdXJpVHJhbnNmb3JtZXIpIHtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fVxuXHRcdHJldHVybiB0cmFuc2Zvcm1JbmNvbWluZ1VSSXMob2JqLCB0aGlzLl91cmlUcmFuc2Zvcm1lcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJveHk8VD4oaWRlbnRpZmllcjogUHJveHlJZGVudGlmaWVyPFQ+KTogUHJveGllZDxUPiB7XG5cdFx0Y29uc3QgeyBuaWQ6IHJwY0lkLCBzaWQgfSA9IGlkZW50aWZpZXI7XG5cdFx0aWYgKCF0aGlzLl9wcm94aWVzW3JwY0lkXSkge1xuXHRcdFx0dGhpcy5fcHJveGllc1tycGNJZF0gPSB0aGlzLl9jcmVhdGVQcm94eShycGNJZCwgc2lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3hpZXNbcnBjSWRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUHJveHk8VD4ocnBjSWQ6IG51bWJlciwgZGVidWdOYW1lOiBzdHJpbmcpOiBUIHtcblx0XHRjb25zdCBoYW5kbGVyID0ge1xuXHRcdFx0Z2V0OiAodGFyZ2V0OiBhbnksIG5hbWU6IFByb3BlcnR5S2V5KSA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbmFtZSA9PT0gJ3N0cmluZycgJiYgIXRhcmdldFtuYW1lXSAmJiBuYW1lLmNoYXJDb2RlQXQoMCkgPT09IENoYXJDb2RlLkRvbGxhclNpZ24pIHtcblx0XHRcdFx0XHR0YXJnZXRbbmFtZV0gPSAoLi4ubXlBcmdzOiBhbnlbXSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlbW90ZUNhbGwocnBjSWQsIG5hbWUsIG15QXJncyk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmFtZSA9PT0gX1JQQ1Byb3h5U3ltYm9sKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGRlYnVnTmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0W25hbWVdO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIG5ldyBQcm94eShPYmplY3QuY3JlYXRlKG51bGwpLCBoYW5kbGVyKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQ8VCwgUiBleHRlbmRzIFQ+KGlkZW50aWZpZXI6IFByb3h5SWRlbnRpZmllcjxUPiwgdmFsdWU6IFIpOiBSIHtcblx0XHR0aGlzLl9sb2NhbHNbaWRlbnRpZmllci5uaWRdID0gdmFsdWU7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGFzc2VydFJlZ2lzdGVyZWQoaWRlbnRpZmllcnM6IFByb3h5SWRlbnRpZmllcjxhbnk+W10pOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gaWRlbnRpZmllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSBpZGVudGlmaWVyc1tpXTtcblx0XHRcdGlmICghdGhpcy5fbG9jYWxzW2lkZW50aWZpZXIubmlkXSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgcHJveHkgaW5zdGFuY2UgJHtpZGVudGlmaWVyLnNpZH1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNlaXZlT25lTWVzc2FnZShyYXdtc2c6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtc2dMZW5ndGggPSByYXdtc2cuYnl0ZUxlbmd0aDtcblx0XHRjb25zdCBidWZmID0gTWVzc2FnZUJ1ZmZlci5yZWFkKHJhd21zZywgMCk7XG5cdFx0Y29uc3QgbWVzc2FnZVR5cGUgPSA8TWVzc2FnZVR5cGU+YnVmZi5yZWFkVUludDgoKTtcblx0XHRjb25zdCByZXEgPSBidWZmLnJlYWRVSW50MzIoKTtcblxuXHRcdHN3aXRjaCAobWVzc2FnZVR5cGUpIHtcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVxdWVzdEpTT05BcmdzOlxuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5SZXF1ZXN0SlNPTkFyZ3NXaXRoQ2FuY2VsbGF0aW9uOiB7XG5cdFx0XHRcdGxldCB7IHJwY0lkLCBtZXRob2QsIGFyZ3MgfSA9IE1lc3NhZ2VJTy5kZXNlcmlhbGl6ZVJlcXVlc3RKU09OQXJncyhidWZmKTtcblx0XHRcdFx0aWYgKHRoaXMuX3VyaVRyYW5zZm9ybWVyKSB7XG5cdFx0XHRcdFx0YXJncyA9IHRyYW5zZm9ybUluY29taW5nVVJJcyhhcmdzLCB0aGlzLl91cmlUcmFuc2Zvcm1lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVjZWl2ZVJlcXVlc3QobXNnTGVuZ3RoLCByZXEsIHJwY0lkLCBtZXRob2QsIGFyZ3MsIChtZXNzYWdlVHlwZSA9PT0gTWVzc2FnZVR5cGUuUmVxdWVzdEpTT05BcmdzV2l0aENhbmNlbGxhdGlvbikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVxdWVzdE1peGVkQXJnczpcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVxdWVzdE1peGVkQXJnc1dpdGhDYW5jZWxsYXRpb246IHtcblx0XHRcdFx0bGV0IHsgcnBjSWQsIG1ldGhvZCwgYXJncyB9ID0gTWVzc2FnZUlPLmRlc2VyaWFsaXplUmVxdWVzdE1peGVkQXJncyhidWZmKTtcblx0XHRcdFx0aWYgKHRoaXMuX3VyaVRyYW5zZm9ybWVyKSB7XG5cdFx0XHRcdFx0YXJncyA9IHRyYW5zZm9ybUluY29taW5nVVJJcyhhcmdzLCB0aGlzLl91cmlUcmFuc2Zvcm1lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVjZWl2ZVJlcXVlc3QobXNnTGVuZ3RoLCByZXEsIHJwY0lkLCBtZXRob2QsIGFyZ3MsIChtZXNzYWdlVHlwZSA9PT0gTWVzc2FnZVR5cGUuUmVxdWVzdE1peGVkQXJnc1dpdGhDYW5jZWxsYXRpb24pKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLkFja25vd2xlZGdlZDoge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXI/LmxvZ0luY29taW5nKG1zZ0xlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgYGFja2ApO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlY2VpdmVBY2tub3dsZWRnZShyZXEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuQ2FuY2VsOiB7XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVDYW5jZWwobXNnTGVuZ3RoLCByZXEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVwbHlPS0VtcHR5OiB7XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVSZXBseShtc2dMZW5ndGgsIHJlcSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcGx5T0tKU09OOiB7XG5cdFx0XHRcdGxldCB2YWx1ZSA9IE1lc3NhZ2VJTy5kZXNlcmlhbGl6ZVJlcGx5T0tKU09OKGJ1ZmYpO1xuXHRcdFx0XHRpZiAodGhpcy5fdXJpVHJhbnNmb3JtZXIpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IHRyYW5zZm9ybUluY29taW5nVVJJcyh2YWx1ZSwgdGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVSZXBseShtc2dMZW5ndGgsIHJlcSwgdmFsdWUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVwbHlPS0pTT05XaXRoQnVmZmVyczoge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IE1lc3NhZ2VJTy5kZXNlcmlhbGl6ZVJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMoYnVmZiwgdGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0XHR0aGlzLl9yZWNlaXZlUmVwbHkobXNnTGVuZ3RoLCByZXEsIHZhbHVlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcGx5T0tWU0J1ZmZlcjoge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IE1lc3NhZ2VJTy5kZXNlcmlhbGl6ZVJlcGx5T0tWU0J1ZmZlcihidWZmKTtcblx0XHRcdFx0dGhpcy5fcmVjZWl2ZVJlcGx5KG1zZ0xlbmd0aCwgcmVxLCB2YWx1ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5SZXBseUVyckVycm9yOiB7XG5cdFx0XHRcdGxldCBlcnIgPSBNZXNzYWdlSU8uZGVzZXJpYWxpemVSZXBseUVyckVycm9yKGJ1ZmYpO1xuXHRcdFx0XHRpZiAodGhpcy5fdXJpVHJhbnNmb3JtZXIpIHtcblx0XHRcdFx0XHRlcnIgPSB0cmFuc2Zvcm1JbmNvbWluZ1VSSXMoZXJyLCB0aGlzLl91cmlUcmFuc2Zvcm1lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVjZWl2ZVJlcGx5RXJyKG1zZ0xlbmd0aCwgcmVxLCBlcnIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVwbHlFcnJFbXB0eToge1xuXHRcdFx0XHR0aGlzLl9yZWNlaXZlUmVwbHlFcnIobXNnTGVuZ3RoLCByZXEsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgcmVjZWl2ZWQgdW5leHBlY3RlZCBtZXNzYWdlYCk7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IocmF3bXNnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNlaXZlUmVxdWVzdChtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIHJwY0lkOiBudW1iZXIsIG1ldGhvZDogc3RyaW5nLCBhcmdzOiBhbnlbXSwgdXNlc0NhbmNlbGxhdGlvblRva2VuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nZ2VyPy5sb2dJbmNvbWluZyhtc2dMZW5ndGgsIHJlcSwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIGByZWNlaXZlUmVxdWVzdCAke2dldFN0cmluZ0lkZW50aWZpZXJGb3JQcm94eShycGNJZCl9LiR7bWV0aG9kfShgLCBhcmdzKTtcblx0XHRjb25zdCBjYWxsSWQgPSBTdHJpbmcocmVxKTtcblxuXHRcdGxldCBwcm9taXNlOiBQcm9taXNlPGFueT47XG5cdFx0bGV0IGNhbmNlbDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh1c2VzQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRhcmdzLnB1c2goY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0cHJvbWlzZSA9IHRoaXMuX2ludm9rZUhhbmRsZXIocnBjSWQsIG1ldGhvZCwgYXJncyk7XG5cdFx0XHRjYW5jZWwgPSAoKSA9PiBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvbWlzZSA9IHRoaXMuX2ludm9rZUhhbmRsZXIocnBjSWQsIG1ldGhvZCwgYXJncyk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbmNlbCkge1xuXHRcdFx0dGhpcy5fY2FuY2VsSW52b2tlZEhhbmRsZXJzW2NhbGxJZF0gPSBjYW5jZWw7XG5cdFx0fVxuXG5cdFx0Ly8gQWNrbm93bGVkZ2UgdGhlIHJlcXVlc3Rcblx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplQWNrbm93bGVkZ2VkKHJlcSk7XG5cdFx0dGhpcy5fbG9nZ2VyPy5sb2dPdXRnb2luZyhtc2cuYnl0ZUxlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgYGFja2ApO1xuXHRcdHRoaXMuX3Byb3RvY29sLnNlbmQobXNnKTtcblxuXHRcdHByb21pc2UudGhlbigocikgPT4ge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2NhbmNlbEludm9rZWRIYW5kbGVyc1tjYWxsSWRdO1xuXHRcdFx0Y29uc3QgbXNnID0gTWVzc2FnZUlPLnNlcmlhbGl6ZVJlcGx5T0socmVxLCByLCB0aGlzLl91cmlSZXBsYWNlcik7XG5cdFx0XHR0aGlzLl9sb2dnZXI/LmxvZ091dGdvaW5nKG1zZy5ieXRlTGVuZ3RoLCByZXEsIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCBgcmVwbHk6YCwgcik7XG5cdFx0XHR0aGlzLl9wcm90b2NvbC5zZW5kKG1zZyk7XG5cdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2NhbmNlbEludm9rZWRIYW5kbGVyc1tjYWxsSWRdO1xuXHRcdFx0Y29uc3QgbXNnID0gTWVzc2FnZUlPLnNlcmlhbGl6ZVJlcGx5RXJyKHJlcSwgZXJyKTtcblx0XHRcdHRoaXMuX2xvZ2dlcj8ubG9nT3V0Z29pbmcobXNnLmJ5dGVMZW5ndGgsIHJlcSwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIGByZXBseUVycjpgLCBlcnIpO1xuXHRcdFx0dGhpcy5fcHJvdG9jb2wuc2VuZChtc2cpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjZWl2ZUNhbmNlbChtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXI/LmxvZ0luY29taW5nKG1zZ0xlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgYHJlY2VpdmVDYW5jZWxgKTtcblx0XHRjb25zdCBjYWxsSWQgPSBTdHJpbmcocmVxKTtcblx0XHRjb25zdCBjYW5jZWwgPSB0aGlzLl9jYW5jZWxJbnZva2VkSGFuZGxlcnNbY2FsbElkXTtcblx0XHRkZWxldGUgdGhpcy5fY2FuY2VsSW52b2tlZEhhbmRsZXJzW2NhbGxJZF07XG5cdFx0Y2FuY2VsPy4oKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY2VpdmVSZXBseShtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIHZhbHVlOiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXI/LmxvZ0luY29taW5nKG1zZ0xlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgYHJlY2VpdmVSZXBseTpgLCB2YWx1ZSk7XG5cdFx0Y29uc3QgY2FsbElkID0gU3RyaW5nKHJlcSk7XG5cdFx0aWYgKCF0aGlzLl9wZW5kaW5nUlBDUmVwbGllcy5oYXNPd25Qcm9wZXJ0eShjYWxsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlcGx5ID0gdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXNbY2FsbElkXTtcblx0XHRkZWxldGUgdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXNbY2FsbElkXTtcblxuXHRcdHBlbmRpbmdSZXBseS5yZXNvbHZlT2sodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjZWl2ZVJlcGx5RXJyKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgdmFsdWU6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlcj8ubG9nSW5jb21pbmcobXNnTGVuZ3RoLCByZXEsIFJlcXVlc3RJbml0aWF0b3IuTG9jYWxTaWRlLCBgcmVjZWl2ZVJlcGx5RXJyOmAsIHZhbHVlKTtcblxuXHRcdGNvbnN0IGNhbGxJZCA9IFN0cmluZyhyZXEpO1xuXHRcdGlmICghdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXMuaGFzT3duUHJvcGVydHkoY2FsbElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdSZXBseSA9IHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW2NhbGxJZF07XG5cdFx0ZGVsZXRlIHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW2NhbGxJZF07XG5cblx0XHRsZXQgZXJyOiBhbnkgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRpZiAodmFsdWUuJGlzRXJyb3IpIHtcblx0XHRcdFx0ZXJyID0gbmV3IEVycm9yKCk7XG5cdFx0XHRcdGVyci5uYW1lID0gdmFsdWUubmFtZTtcblx0XHRcdFx0ZXJyLm1lc3NhZ2UgPSB2YWx1ZS5tZXNzYWdlO1xuXHRcdFx0XHRlcnIuc3RhY2sgPSB2YWx1ZS5zdGFjaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVyciA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRwZW5kaW5nUmVwbHkucmVzb2x2ZUVycihlcnIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52b2tlSGFuZGxlcihycGNJZDogbnVtYmVyLCBtZXRob2ROYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9kb0ludm9rZUhhbmRsZXIocnBjSWQsIG1ldGhvZE5hbWUsIGFyZ3MpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvSW52b2tlSGFuZGxlcihycGNJZDogbnVtYmVyLCBtZXRob2ROYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdKTogYW55IHtcblx0XHRjb25zdCBhY3RvciA9IHRoaXMuX2xvY2Fsc1tycGNJZF07XG5cdFx0aWYgKCFhY3Rvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGFjdG9yICcgKyBnZXRTdHJpbmdJZGVudGlmaWVyRm9yUHJveHkocnBjSWQpKTtcblx0XHR9XG5cdFx0Y29uc3QgbWV0aG9kID0gYWN0b3JbbWV0aG9kTmFtZV07XG5cdFx0aWYgKHR5cGVvZiBtZXRob2QgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBtZXRob2QgJyArIG1ldGhvZE5hbWUgKyAnIG9uIGFjdG9yICcgKyBnZXRTdHJpbmdJZGVudGlmaWVyRm9yUHJveHkocnBjSWQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1ldGhvZC5hcHBseShhY3RvciwgYXJncyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdGVDYWxsKHJwY0lkOiBudW1iZXIsIG1ldGhvZE5hbWU6IHN0cmluZywgYXJnczogYW55W10pOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gbmV3IENhbmNlbGVkTGF6eVByb21pc2UoKTtcblx0XHR9XG5cdFx0bGV0IGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChhcmdzLmxlbmd0aCA+IDAgJiYgQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihhcmdzW2FyZ3MubGVuZ3RoIC0gMV0pKSB7XG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlbiA9IGFyZ3MucG9wKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuICYmIGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHQvLyBObyBuZWVkIHRvIGRvIGFueXRoaW5nLi4uXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3Q8YW55PihlcnJvcnMuY2FuY2VsZWQoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudHMgPSBNZXNzYWdlSU8uc2VyaWFsaXplUmVxdWVzdEFyZ3VtZW50cyhhcmdzLCB0aGlzLl91cmlSZXBsYWNlcik7XG5cblx0XHRjb25zdCByZXEgPSArK3RoaXMuX2xhc3RNZXNzYWdlSWQ7XG5cdFx0Y29uc3QgY2FsbElkID0gU3RyaW5nKHJlcSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IExhenlQcm9taXNlKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplQ2FuY2VsKHJlcSk7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlcj8ubG9nT3V0Z29pbmcobXNnLmJ5dGVMZW5ndGgsIHJlcSwgUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUsIGBjYW5jZWxgKTtcblx0XHRcdFx0dGhpcy5fcHJvdG9jb2wuc2VuZChtc2cpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW2NhbGxJZF0gPSBuZXcgUGVuZGluZ1JQQ1JlcGx5KHJlc3VsdCwgZGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5fb25XaWxsU2VuZFJlcXVlc3QocmVxKTtcblx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplUmVxdWVzdChyZXEsIHJwY0lkLCBtZXRob2ROYW1lLCBzZXJpYWxpemVkUmVxdWVzdEFyZ3VtZW50cywgISFjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0dGhpcy5fbG9nZ2VyPy5sb2dPdXRnb2luZyhtc2cuYnl0ZUxlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgYHJlcXVlc3Q6ICR7Z2V0U3RyaW5nSWRlbnRpZmllckZvclByb3h5KHJwY0lkKX0uJHttZXRob2ROYW1lfShgLCBhcmdzKTtcblx0XHR0aGlzLl9wcm90b2NvbC5zZW5kKG1zZyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBQZW5kaW5nUlBDUmVwbHkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9taXNlOiBMYXp5UHJvbWlzZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlOiBJRGlzcG9zYWJsZVxuXHQpIHsgfVxuXG5cdHB1YmxpYyByZXNvbHZlT2sodmFsdWU6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb21pc2UucmVzb2x2ZU9rKHZhbHVlKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlRXJyKGVycjogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvbWlzZS5yZXNvbHZlRXJyKGVycik7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWVzc2FnZUJ1ZmZlciB7XG5cblx0cHVibGljIHN0YXRpYyBhbGxvYyh0eXBlOiBNZXNzYWdlVHlwZSwgcmVxOiBudW1iZXIsIG1lc3NhZ2VTaXplOiBudW1iZXIpOiBNZXNzYWdlQnVmZmVyIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWVzc2FnZUJ1ZmZlcihWU0J1ZmZlci5hbGxvYyhtZXNzYWdlU2l6ZSArIDEgLyogdHlwZSAqLyArIDQgLyogcmVxICovKSwgMCk7XG5cdFx0cmVzdWx0LndyaXRlVUludDgodHlwZSk7XG5cdFx0cmVzdWx0LndyaXRlVUludDMyKHJlcSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZChidWZmOiBWU0J1ZmZlciwgb2Zmc2V0OiBudW1iZXIpOiBNZXNzYWdlQnVmZmVyIHtcblx0XHRyZXR1cm4gbmV3IE1lc3NhZ2VCdWZmZXIoYnVmZiwgb2Zmc2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2J1ZmY6IFZTQnVmZmVyO1xuXHRwcml2YXRlIF9vZmZzZXQ6IG51bWJlcjtcblxuXHRwdWJsaWMgZ2V0IGJ1ZmZlcigpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmY7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKGJ1ZmY6IFZTQnVmZmVyLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2J1ZmYgPSBidWZmO1xuXHRcdHRoaXMuX29mZnNldCA9IG9mZnNldDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2l6ZVVJbnQ4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHNpemVVSW50MzIgPSA0O1xuXG5cdHB1YmxpYyB3cml0ZVVJbnQ4KG46IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmYud3JpdGVVSW50OChuLCB0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0fVxuXG5cdHB1YmxpYyByZWFkVUludDgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBuID0gdGhpcy5fYnVmZi5yZWFkVUludDgodGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDE7XG5cdFx0cmV0dXJuIG47XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVVSW50MzIobjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYnVmZi53cml0ZVVJbnQzMkJFKG4sIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHR9XG5cblx0cHVibGljIHJlYWRVSW50MzIoKTogbnVtYmVyIHtcblx0XHRjb25zdCBuID0gdGhpcy5fYnVmZi5yZWFkVUludDMyQkUodGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDQ7XG5cdFx0cmV0dXJuIG47XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpemVTaG9ydFN0cmluZyhzdHI6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMSAvKiBzdHJpbmcgbGVuZ3RoICovICsgc3RyLmJ5dGVMZW5ndGggLyogYWN0dWFsIHN0cmluZyAqLztcblx0fVxuXG5cdHB1YmxpYyB3cml0ZVNob3J0U3RyaW5nKHN0cjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmLndyaXRlVUludDgoc3RyLmJ5dGVMZW5ndGgsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSAxO1xuXHRcdHRoaXMuX2J1ZmYuc2V0KHN0ciwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IHN0ci5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIHJlYWRTaG9ydFN0cmluZygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0ckJ5dGVMZW5ndGggPSB0aGlzLl9idWZmLnJlYWRVSW50OCh0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0XHRjb25zdCBzdHJCdWZmID0gdGhpcy5fYnVmZi5zbGljZSh0aGlzLl9vZmZzZXQsIHRoaXMuX29mZnNldCArIHN0ckJ5dGVMZW5ndGgpO1xuXHRcdGNvbnN0IHN0ciA9IHN0ckJ1ZmYudG9TdHJpbmcoKTsgdGhpcy5fb2Zmc2V0ICs9IHN0ckJ5dGVMZW5ndGg7XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2l6ZUxvbmdTdHJpbmcoc3RyOiBWU0J1ZmZlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIDQgLyogc3RyaW5nIGxlbmd0aCAqLyArIHN0ci5ieXRlTGVuZ3RoIC8qIGFjdHVhbCBzdHJpbmcgKi87XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVMb25nU3RyaW5nKHN0cjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmLndyaXRlVUludDMyQkUoc3RyLmJ5dGVMZW5ndGgsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHRcdHRoaXMuX2J1ZmYuc2V0KHN0ciwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IHN0ci5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIHJlYWRMb25nU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RyQnl0ZUxlbmd0aCA9IHRoaXMuX2J1ZmYucmVhZFVJbnQzMkJFKHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHRcdGNvbnN0IHN0ckJ1ZmYgPSB0aGlzLl9idWZmLnNsaWNlKHRoaXMuX29mZnNldCwgdGhpcy5fb2Zmc2V0ICsgc3RyQnl0ZUxlbmd0aCk7XG5cdFx0Y29uc3Qgc3RyID0gc3RyQnVmZi50b1N0cmluZygpOyB0aGlzLl9vZmZzZXQgKz0gc3RyQnl0ZUxlbmd0aDtcblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cblx0cHVibGljIHdyaXRlQnVmZmVyKGJ1ZmY6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYnVmZi53cml0ZVVJbnQzMkJFKGJ1ZmYuYnl0ZUxlbmd0aCwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDQ7XG5cdFx0dGhpcy5fYnVmZi5zZXQoYnVmZiwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IGJ1ZmYuYnl0ZUxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2l6ZVZTQnVmZmVyKGJ1ZmY6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gNCAvKiBidWZmZXIgbGVuZ3RoICovICsgYnVmZi5ieXRlTGVuZ3RoIC8qIGFjdHVhbCBidWZmZXIgKi87XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVWU0J1ZmZlcihidWZmOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmYud3JpdGVVSW50MzJCRShidWZmLmJ5dGVMZW5ndGgsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHRcdHRoaXMuX2J1ZmYuc2V0KGJ1ZmYsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSBidWZmLmJ5dGVMZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgcmVhZFZTQnVmZmVyKCk6IFZTQnVmZmVyIHtcblx0XHRjb25zdCBidWZmTGVuZ3RoID0gdGhpcy5fYnVmZi5yZWFkVUludDMyQkUodGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDQ7XG5cdFx0Y29uc3QgYnVmZiA9IHRoaXMuX2J1ZmYuc2xpY2UodGhpcy5fb2Zmc2V0LCB0aGlzLl9vZmZzZXQgKyBidWZmTGVuZ3RoKTsgdGhpcy5fb2Zmc2V0ICs9IGJ1ZmZMZW5ndGg7XG5cdFx0cmV0dXJuIGJ1ZmY7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpemVNaXhlZEFycmF5KGFycjogcmVhZG9ubHkgTWl4ZWRBcmdbXSk6IG51bWJlciB7XG5cdFx0bGV0IHNpemUgPSAwO1xuXHRcdHNpemUgKz0gMTsgLy8gYXJyIGxlbmd0aFxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsID0gYXJyW2ldO1xuXHRcdFx0c2l6ZSArPSAxOyAvLyBhcmcgdHlwZVxuXHRcdFx0c3dpdGNoIChlbC50eXBlKSB7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5TdHJpbmc6XG5cdFx0XHRcdFx0c2l6ZSArPSB0aGlzLnNpemVMb25nU3RyaW5nKGVsLnZhbHVlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBcmdUeXBlLlZTQnVmZmVyOlxuXHRcdFx0XHRcdHNpemUgKz0gdGhpcy5zaXplVlNCdWZmZXIoZWwudmFsdWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzOlxuXHRcdFx0XHRcdHNpemUgKz0gdGhpcy5zaXplVUludDMyOyAvLyBidWZmZXIgY291bnRcblx0XHRcdFx0XHRzaXplICs9IHRoaXMuc2l6ZUxvbmdTdHJpbmcoZWwudmFsdWUpO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWwuYnVmZmVycy5sZW5ndGg7ICsraSkge1xuXHRcdFx0XHRcdFx0c2l6ZSArPSB0aGlzLnNpemVWU0J1ZmZlcihlbC5idWZmZXJzW2ldKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5VbmRlZmluZWQ6XG5cdFx0XHRcdFx0Ly8gZW1wdHkuLi5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNpemU7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVNaXhlZEFycmF5KGFycjogcmVhZG9ubHkgTWl4ZWRBcmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmYud3JpdGVVSW50OChhcnIubGVuZ3RoLCB0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbCA9IGFycltpXTtcblx0XHRcdHN3aXRjaCAoZWwudHlwZSkge1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuU3RyaW5nOlxuXHRcdFx0XHRcdHRoaXMud3JpdGVVSW50OChBcmdUeXBlLlN0cmluZyk7XG5cdFx0XHRcdFx0dGhpcy53cml0ZUxvbmdTdHJpbmcoZWwudmFsdWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuVlNCdWZmZXI6XG5cdFx0XHRcdFx0dGhpcy53cml0ZVVJbnQ4KEFyZ1R5cGUuVlNCdWZmZXIpO1xuXHRcdFx0XHRcdHRoaXMud3JpdGVWU0J1ZmZlcihlbC52YWx1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5TZXJpYWxpemVkT2JqZWN0V2l0aEJ1ZmZlcnM6XG5cdFx0XHRcdFx0dGhpcy53cml0ZVVJbnQ4KEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzKTtcblx0XHRcdFx0XHR0aGlzLndyaXRlVUludDMyKGVsLmJ1ZmZlcnMubGVuZ3RoKTtcblx0XHRcdFx0XHR0aGlzLndyaXRlTG9uZ1N0cmluZyhlbC52YWx1ZSk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbC5idWZmZXJzLmxlbmd0aDsgKytpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLndyaXRlQnVmZmVyKGVsLmJ1ZmZlcnNbaV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBcmdUeXBlLlVuZGVmaW5lZDpcblx0XHRcdFx0XHR0aGlzLndyaXRlVUludDgoQXJnVHlwZS5VbmRlZmluZWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWFkTWl4ZWRBcnJheSgpOiBBcnJheTxzdHJpbmcgfCBWU0J1ZmZlciB8IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPGFueT4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcnJMZW4gPSB0aGlzLl9idWZmLnJlYWRVSW50OCh0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0XHRjb25zdCBhcnI6IEFycmF5PHN0cmluZyB8IFZTQnVmZmVyIHwgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8YW55PiB8IHVuZGVmaW5lZD4gPSBuZXcgQXJyYXkoYXJyTGVuKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFyckxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBhcmdUeXBlID0gPEFyZ1R5cGU+dGhpcy5yZWFkVUludDgoKTtcblx0XHRcdHN3aXRjaCAoYXJnVHlwZSkge1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuU3RyaW5nOlxuXHRcdFx0XHRcdGFycltpXSA9IHRoaXMucmVhZExvbmdTdHJpbmcoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBcmdUeXBlLlZTQnVmZmVyOlxuXHRcdFx0XHRcdGFycltpXSA9IHRoaXMucmVhZFZTQnVmZmVyKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5TZXJpYWxpemVkT2JqZWN0V2l0aEJ1ZmZlcnM6IHtcblx0XHRcdFx0XHRjb25zdCBidWZmZXJDb3VudCA9IHRoaXMucmVhZFVJbnQzMigpO1xuXHRcdFx0XHRcdGNvbnN0IGpzb25TdHJpbmcgPSB0aGlzLnJlYWRMb25nU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYnVmZmVyQ291bnQ7ICsraSkge1xuXHRcdFx0XHRcdFx0YnVmZmVycy5wdXNoKHRoaXMucmVhZFZTQnVmZmVyKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhcnJbaV0gPSBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMocGFyc2VKc29uQW5kUmVzdG9yZUJ1ZmZlclJlZnMoanNvblN0cmluZywgYnVmZmVycywgbnVsbCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5VbmRlZmluZWQ6XG5cdFx0XHRcdFx0YXJyW2ldID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYXJyO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUge1xuXHRTaW1wbGUsXG5cdE1peGVkLFxufVxuXG50eXBlIFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRzID1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRUeXBlLlNpbXBsZTsgYXJnczogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRUeXBlLk1peGVkOyBhcmdzOiBNaXhlZEFyZ1tdIH07XG5cblxuY2xhc3MgTWVzc2FnZUlPIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfdXNlTWl4ZWRBcmdTZXJpYWxpemF0aW9uKGFycjogYW55W10pOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoYXJyW2ldIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXJyW2ldIGluc3RhbmNlb2YgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGFycltpXSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2VyaWFsaXplUmVxdWVzdEFyZ3VtZW50cyhhcmdzOiBhbnlbXSwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwpOiBTZXJpYWxpemVkUmVxdWVzdEFyZ3VtZW50cyB7XG5cdFx0aWYgKHRoaXMuX3VzZU1peGVkQXJnU2VyaWFsaXphdGlvbihhcmdzKSkge1xuXHRcdFx0Y29uc3QgbWFzc2FnZWRBcmdzOiBNaXhlZEFyZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBhcmcgPSBhcmdzW2ldO1xuXHRcdFx0XHRpZiAoYXJnIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdFx0XHRtYXNzYWdlZEFyZ3NbaV0gPSB7IHR5cGU6IEFyZ1R5cGUuVlNCdWZmZXIsIHZhbHVlOiBhcmcgfTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdG1hc3NhZ2VkQXJnc1tpXSA9IHsgdHlwZTogQXJnVHlwZS5VbmRlZmluZWQgfTtcblx0XHRcdFx0fSBlbHNlIGlmIChhcmcgaW5zdGFuY2VvZiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycykge1xuXHRcdFx0XHRcdGNvbnN0IHsganNvblN0cmluZywgcmVmZXJlbmNlZEJ1ZmZlcnMgfSA9IHN0cmluZ2lmeUpzb25XaXRoQnVmZmVyUmVmcyhhcmcudmFsdWUsIHJlcGxhY2VyKTtcblx0XHRcdFx0XHRtYXNzYWdlZEFyZ3NbaV0gPSB7IHR5cGU6IEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhqc29uU3RyaW5nKSwgYnVmZmVyczogcmVmZXJlbmNlZEJ1ZmZlcnMgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtYXNzYWdlZEFyZ3NbaV0gPSB7IHR5cGU6IEFyZ1R5cGUuU3RyaW5nLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhzdHJpbmdpZnkoYXJnLCByZXBsYWNlcikpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRUeXBlLk1peGVkLFxuXHRcdFx0XHRhcmdzOiBtYXNzYWdlZEFyZ3MsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUuU2ltcGxlLFxuXHRcdFx0YXJnczogc3RyaW5naWZ5KGFyZ3MsIHJlcGxhY2VyKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNlcmlhbGl6ZVJlcXVlc3QocmVxOiBudW1iZXIsIHJwY0lkOiBudW1iZXIsIG1ldGhvZDogc3RyaW5nLCBzZXJpYWxpemVkQXJnczogU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudHMsIHVzZXNDYW5jZWxsYXRpb25Ub2tlbjogYm9vbGVhbik6IFZTQnVmZmVyIHtcblx0XHRzd2l0Y2ggKHNlcmlhbGl6ZWRBcmdzLnR5cGUpIHtcblx0XHRcdGNhc2UgU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUuU2ltcGxlOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdEpTT05BcmdzKHJlcSwgcnBjSWQsIG1ldGhvZCwgc2VyaWFsaXplZEFyZ3MuYXJncywgdXNlc0NhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdGNhc2UgU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUuTWl4ZWQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXF1ZXN0TWl4ZWRBcmdzKHJlcSwgcnBjSWQsIG1ldGhvZCwgc2VyaWFsaXplZEFyZ3MuYXJncywgdXNlc0NhbmNlbGxhdGlvblRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVxdWVzdEpTT05BcmdzKHJlcTogbnVtYmVyLCBycGNJZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgYXJnczogc3RyaW5nLCB1c2VzQ2FuY2VsbGF0aW9uVG9rZW46IGJvb2xlYW4pOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgbWV0aG9kQnVmZiA9IFZTQnVmZmVyLmZyb21TdHJpbmcobWV0aG9kKTtcblx0XHRjb25zdCBhcmdzQnVmZiA9IFZTQnVmZmVyLmZyb21TdHJpbmcoYXJncyk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVUludDgoKTtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplU2hvcnRTdHJpbmcobWV0aG9kQnVmZik7XG5cdFx0bGVuICs9IE1lc3NhZ2VCdWZmZXIuc2l6ZUxvbmdTdHJpbmcoYXJnc0J1ZmYpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gTWVzc2FnZUJ1ZmZlci5hbGxvYyh1c2VzQ2FuY2VsbGF0aW9uVG9rZW4gPyBNZXNzYWdlVHlwZS5SZXF1ZXN0SlNPTkFyZ3NXaXRoQ2FuY2VsbGF0aW9uIDogTWVzc2FnZVR5cGUuUmVxdWVzdEpTT05BcmdzLCByZXEsIGxlbik7XG5cdFx0cmVzdWx0LndyaXRlVUludDgocnBjSWQpO1xuXHRcdHJlc3VsdC53cml0ZVNob3J0U3RyaW5nKG1ldGhvZEJ1ZmYpO1xuXHRcdHJlc3VsdC53cml0ZUxvbmdTdHJpbmcoYXJnc0J1ZmYpO1xuXHRcdHJldHVybiByZXN1bHQuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZVJlcXVlc3RKU09OQXJncyhidWZmOiBNZXNzYWdlQnVmZmVyKTogeyBycGNJZDogbnVtYmVyOyBtZXRob2Q6IHN0cmluZzsgYXJnczogYW55W10gfSB7XG5cdFx0Y29uc3QgcnBjSWQgPSBidWZmLnJlYWRVSW50OCgpO1xuXHRcdGNvbnN0IG1ldGhvZCA9IGJ1ZmYucmVhZFNob3J0U3RyaW5nKCk7XG5cdFx0Y29uc3QgYXJncyA9IGJ1ZmYucmVhZExvbmdTdHJpbmcoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cnBjSWQ6IHJwY0lkLFxuXHRcdFx0bWV0aG9kOiBtZXRob2QsXG5cdFx0XHRhcmdzOiBKU09OLnBhcnNlKGFyZ3MpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZXF1ZXN0TWl4ZWRBcmdzKHJlcTogbnVtYmVyLCBycGNJZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgYXJnczogcmVhZG9ubHkgTWl4ZWRBcmdbXSwgdXNlc0NhbmNlbGxhdGlvblRva2VuOiBib29sZWFuKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IG1ldGhvZEJ1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKG1ldGhvZCk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVUludDgoKTtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplU2hvcnRTdHJpbmcobWV0aG9kQnVmZik7XG5cdFx0bGVuICs9IE1lc3NhZ2VCdWZmZXIuc2l6ZU1peGVkQXJyYXkoYXJncyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBNZXNzYWdlQnVmZmVyLmFsbG9jKHVzZXNDYW5jZWxsYXRpb25Ub2tlbiA/IE1lc3NhZ2VUeXBlLlJlcXVlc3RNaXhlZEFyZ3NXaXRoQ2FuY2VsbGF0aW9uIDogTWVzc2FnZVR5cGUuUmVxdWVzdE1peGVkQXJncywgcmVxLCBsZW4pO1xuXHRcdHJlc3VsdC53cml0ZVVJbnQ4KHJwY0lkKTtcblx0XHRyZXN1bHQud3JpdGVTaG9ydFN0cmluZyhtZXRob2RCdWZmKTtcblx0XHRyZXN1bHQud3JpdGVNaXhlZEFycmF5KGFyZ3MpO1xuXHRcdHJldHVybiByZXN1bHQuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZVJlcXVlc3RNaXhlZEFyZ3MoYnVmZjogTWVzc2FnZUJ1ZmZlcik6IHsgcnBjSWQ6IG51bWJlcjsgbWV0aG9kOiBzdHJpbmc7IGFyZ3M6IGFueVtdIH0ge1xuXHRcdGNvbnN0IHJwY0lkID0gYnVmZi5yZWFkVUludDgoKTtcblx0XHRjb25zdCBtZXRob2QgPSBidWZmLnJlYWRTaG9ydFN0cmluZygpO1xuXHRcdGNvbnN0IHJhd2FyZ3MgPSBidWZmLnJlYWRNaXhlZEFycmF5KCk7XG5cdFx0Y29uc3QgYXJnczogYW55W10gPSBuZXcgQXJyYXkocmF3YXJncy5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXdhcmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCByYXdhcmcgPSByYXdhcmdzW2ldO1xuXHRcdFx0aWYgKHR5cGVvZiByYXdhcmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFyZ3NbaV0gPSBKU09OLnBhcnNlKHJhd2FyZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhcmdzW2ldID0gcmF3YXJnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cnBjSWQ6IHJwY0lkLFxuXHRcdFx0bWV0aG9kOiBtZXRob2QsXG5cdFx0XHRhcmdzOiBhcmdzXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2VyaWFsaXplQWNrbm93bGVkZ2VkKHJlcTogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiBNZXNzYWdlQnVmZmVyLmFsbG9jKE1lc3NhZ2VUeXBlLkFja25vd2xlZGdlZCwgcmVxLCAwKS5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNlcmlhbGl6ZUNhbmNlbChyZXE6IG51bWJlcik6IFZTQnVmZmVyIHtcblx0XHRyZXR1cm4gTWVzc2FnZUJ1ZmZlci5hbGxvYyhNZXNzYWdlVHlwZS5DYW5jZWwsIHJlcSwgMCkuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzZXJpYWxpemVSZXBseU9LKHJlcTogbnVtYmVyLCByZXM6IGFueSwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwpOiBWU0J1ZmZlciB7XG5cdFx0aWYgKHR5cGVvZiByZXMgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VyaWFsaXplUmVwbHlPS0VtcHR5KHJlcSk7XG5cdFx0fSBlbHNlIGlmIChyZXMgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZVJlcGx5T0tWU0J1ZmZlcihyZXEsIHJlcyk7XG5cdFx0fSBlbHNlIGlmIChyZXMgaW5zdGFuY2VvZiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycykge1xuXHRcdFx0Y29uc3QgeyBqc29uU3RyaW5nLCByZWZlcmVuY2VkQnVmZmVycyB9ID0gc3RyaW5naWZ5SnNvbldpdGhCdWZmZXJSZWZzKHJlcy52YWx1ZSwgcmVwbGFjZXIsIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZVJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMocmVxLCBqc29uU3RyaW5nLCByZWZlcmVuY2VkQnVmZmVycyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVSZXBseU9LSlNPTihyZXEsIHNhZmVTdHJpbmdpZnkocmVzLCByZXBsYWNlcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVSZXBseU9LRW1wdHkocmVxOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlPS0VtcHR5LCByZXEsIDApLmJ1ZmZlcjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVSZXBseU9LVlNCdWZmZXIocmVxOiBudW1iZXIsIHJlczogVlNCdWZmZXIpOiBWU0J1ZmZlciB7XG5cdFx0bGV0IGxlbiA9IDA7XG5cdFx0bGVuICs9IE1lc3NhZ2VCdWZmZXIuc2l6ZVZTQnVmZmVyKHJlcyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBNZXNzYWdlQnVmZmVyLmFsbG9jKE1lc3NhZ2VUeXBlLlJlcGx5T0tWU0J1ZmZlciwgcmVxLCBsZW4pO1xuXHRcdHJlc3VsdC53cml0ZVZTQnVmZmVyKHJlcyk7XG5cdFx0cmV0dXJuIHJlc3VsdC5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlPS1ZTQnVmZmVyKGJ1ZmY6IE1lc3NhZ2VCdWZmZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIGJ1ZmYucmVhZFZTQnVmZmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VyaWFsaXplUmVwbHlPS0pTT04ocmVxOiBudW1iZXIsIHJlczogc3RyaW5nKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc0J1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlcyk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplTG9uZ1N0cmluZyhyZXNCdWZmKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlPS0pTT04sIHJlcSwgbGVuKTtcblx0XHRyZXN1bHQud3JpdGVMb25nU3RyaW5nKHJlc0J1ZmYpO1xuXHRcdHJldHVybiByZXN1bHQuYnVmZmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZVJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMocmVxOiBudW1iZXIsIHJlczogc3RyaW5nLCBidWZmZXJzOiByZWFkb25seSBWU0J1ZmZlcltdKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc0J1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlcyk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVUludDMyOyAvLyBidWZmZXIgY291bnRcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplTG9uZ1N0cmluZyhyZXNCdWZmKTtcblx0XHRmb3IgKGNvbnN0IGJ1ZmZlciBvZiBidWZmZXJzKSB7XG5cdFx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVlNCdWZmZXIoYnVmZmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBNZXNzYWdlQnVmZmVyLmFsbG9jKE1lc3NhZ2VUeXBlLlJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMsIHJlcSwgbGVuKTtcblx0XHRyZXN1bHQud3JpdGVVSW50MzIoYnVmZmVycy5sZW5ndGgpO1xuXHRcdHJlc3VsdC53cml0ZUxvbmdTdHJpbmcocmVzQnVmZik7XG5cdFx0Zm9yIChjb25zdCBidWZmZXIgb2YgYnVmZmVycykge1xuXHRcdFx0cmVzdWx0LndyaXRlQnVmZmVyKGJ1ZmZlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlPS0pTT04oYnVmZjogTWVzc2FnZUJ1ZmZlcik6IGFueSB7XG5cdFx0Y29uc3QgcmVzID0gYnVmZi5yZWFkTG9uZ1N0cmluZygpO1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHJlcyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlPS0pTT05XaXRoQnVmZmVycyhidWZmOiBNZXNzYWdlQnVmZmVyLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPGFueT4ge1xuXHRcdGNvbnN0IGJ1ZmZlckNvdW50ID0gYnVmZi5yZWFkVUludDMyKCk7XG5cdFx0Y29uc3QgcmVzID0gYnVmZi5yZWFkTG9uZ1N0cmluZygpO1xuXG5cdFx0Y29uc3QgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYnVmZmVyQ291bnQ7ICsraSkge1xuXHRcdFx0YnVmZmVycy5wdXNoKGJ1ZmYucmVhZFZTQnVmZmVyKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMocGFyc2VKc29uQW5kUmVzdG9yZUJ1ZmZlclJlZnMocmVzLCBidWZmZXJzLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzZXJpYWxpemVSZXBseUVycihyZXE6IG51bWJlciwgZXJyOiBhbnkpOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgZXJyU3RyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSAoZXJyID8gc2FmZVN0cmluZ2lmeShlcnJvcnMudHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uKGVyciksIG51bGwpIDogdW5kZWZpbmVkKTtcblx0XHRpZiAodHlwZW9mIGVyclN0ciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVSZXBseUVyckVtcHR5KHJlcSk7XG5cdFx0fVxuXHRcdGNvbnN0IGVyckJ1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGVyclN0cik7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplTG9uZ1N0cmluZyhlcnJCdWZmKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlFcnJFcnJvciwgcmVxLCBsZW4pO1xuXHRcdHJlc3VsdC53cml0ZUxvbmdTdHJpbmcoZXJyQnVmZik7XG5cdFx0cmV0dXJuIHJlc3VsdC5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlFcnJFcnJvcihidWZmOiBNZXNzYWdlQnVmZmVyKTogRXJyb3Ige1xuXHRcdGNvbnN0IGVyciA9IGJ1ZmYucmVhZExvbmdTdHJpbmcoKTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShlcnIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZVJlcGx5RXJyRW1wdHkocmVxOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlFcnJFbXB0eSwgcmVxLCAwKS5idWZmZXI7XG5cdH1cbn1cblxuY29uc3QgZW51bSBNZXNzYWdlVHlwZSB7XG5cdFJlcXVlc3RKU09OQXJncyA9IDEsXG5cdFJlcXVlc3RKU09OQXJnc1dpdGhDYW5jZWxsYXRpb24gPSAyLFxuXHRSZXF1ZXN0TWl4ZWRBcmdzID0gMyxcblx0UmVxdWVzdE1peGVkQXJnc1dpdGhDYW5jZWxsYXRpb24gPSA0LFxuXHRBY2tub3dsZWRnZWQgPSA1LFxuXHRDYW5jZWwgPSA2LFxuXHRSZXBseU9LRW1wdHkgPSA3LFxuXHRSZXBseU9LVlNCdWZmZXIgPSA4LFxuXHRSZXBseU9LSlNPTiA9IDksXG5cdFJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMgPSAxMCxcblx0UmVwbHlFcnJFcnJvciA9IDExLFxuXHRSZXBseUVyckVtcHR5ID0gMTIsXG59XG5cbmNvbnN0IGVudW0gQXJnVHlwZSB7XG5cdFN0cmluZyA9IDEsXG5cdFZTQnVmZmVyID0gMixcblx0U2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzID0gMyxcblx0VW5kZWZpbmVkID0gNCxcbn1cblxuXG50eXBlIE1peGVkQXJnID1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IEFyZ1R5cGUuU3RyaW5nOyByZWFkb25seSB2YWx1ZTogVlNCdWZmZXIgfVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogQXJnVHlwZS5WU0J1ZmZlcjsgcmVhZG9ubHkgdmFsdWU6IFZTQnVmZmVyIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzOyByZWFkb25seSB2YWx1ZTogVlNCdWZmZXI7IHJlYWRvbmx5IGJ1ZmZlcnM6IHJlYWRvbmx5IFZTQnVmZmVyW10gfVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogQXJnVHlwZS5VbmRlZmluZWQgfVxuXHQ7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFBQTtBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQW9DO0FBRXpELFNBQVMsb0JBQW9CO0FBQzdC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QU8sY0FBYyxNQUFNLHdCQUEyQixLQUFLLENBQUMsRUFBRTtBQUFBLEVBQy9EO0FBQ0Q7QUFFQSxJQUFXLGNBQVgsa0JBQVdDLGlCQUFYO0FBQ0MsRUFBQUEsMEJBQUEscUJBQWtCLEtBQWxCO0FBQ0EsRUFBQUEsMEJBQUEscUNBQWtDLEtBQWxDO0FBQ0EsRUFBQUEsMEJBQUEsc0JBQW1CLEtBQW5CO0FBQ0EsRUFBQUEsMEJBQUEsc0NBQW1DLEtBQW5DO0FBQ0EsRUFBQUEsMEJBQUEsa0JBQWUsS0FBZjtBQUNBLEVBQUFBLDBCQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLDBCQUFBLGtCQUFlLEtBQWY7QUFDQSxFQUFBQSwwQkFBQSxxQkFBa0IsS0FBbEI7QUFDQSxFQUFBQSwwQkFBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsMEJBQUEsNEJBQXlCLE1BQXpCO0FBQ0EsRUFBQUEsMEJBQUEsbUJBQWdCLE1BQWhCO0FBQ0EsRUFBQUEsMEJBQUEsbUJBQWdCLE1BQWhCO0FBWlUsU0FBQUE7QUFBQSxHQUFBO0FBZVgsSUFBVyxVQUFYLGtCQUFXQyxhQUFYO0FBQ0MsRUFBQUEsa0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsa0JBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsa0JBQUEsaUNBQThCLEtBQTlCO0FBQ0EsRUFBQUEsa0JBQUEsZUFBWSxLQUFaO0FBSlUsU0FBQUE7QUFBQSxHQUFBOyIsCiAgIm5hbWVzIjogWyJSZXF1ZXN0SW5pdGlhdG9yIiwgIlJlc3BvbnNpdmVTdGF0ZSIsICJtc2ciLCAiaSIsICJTZXJpYWxpemVkUmVxdWVzdEFyZ3VtZW50VHlwZSIsICJNZXNzYWdlVHlwZSIsICJBcmdUeXBlIl0KfQo=
