import { VSBuffer } from "../../../common/buffer.js";
import { Emitter } from "../../../common/event.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import { IPCClient } from "./ipc.js";
var SocketDiagnosticsEventType = /* @__PURE__ */ ((SocketDiagnosticsEventType2) => {
  SocketDiagnosticsEventType2["Created"] = "created";
  SocketDiagnosticsEventType2["Read"] = "read";
  SocketDiagnosticsEventType2["Write"] = "write";
  SocketDiagnosticsEventType2["Open"] = "open";
  SocketDiagnosticsEventType2["Error"] = "error";
  SocketDiagnosticsEventType2["Close"] = "close";
  SocketDiagnosticsEventType2["BrowserWebSocketBlobReceived"] = "browserWebSocketBlobReceived";
  SocketDiagnosticsEventType2["NodeEndReceived"] = "nodeEndReceived";
  SocketDiagnosticsEventType2["NodeEndSent"] = "nodeEndSent";
  SocketDiagnosticsEventType2["NodeDrainBegin"] = "nodeDrainBegin";
  SocketDiagnosticsEventType2["NodeDrainEnd"] = "nodeDrainEnd";
  SocketDiagnosticsEventType2["zlibInflateError"] = "zlibInflateError";
  SocketDiagnosticsEventType2["zlibInflateData"] = "zlibInflateData";
  SocketDiagnosticsEventType2["zlibInflateInitialWrite"] = "zlibInflateInitialWrite";
  SocketDiagnosticsEventType2["zlibInflateInitialFlushFired"] = "zlibInflateInitialFlushFired";
  SocketDiagnosticsEventType2["zlibInflateWrite"] = "zlibInflateWrite";
  SocketDiagnosticsEventType2["zlibInflateFlushFired"] = "zlibInflateFlushFired";
  SocketDiagnosticsEventType2["zlibDeflateError"] = "zlibDeflateError";
  SocketDiagnosticsEventType2["zlibDeflateData"] = "zlibDeflateData";
  SocketDiagnosticsEventType2["zlibDeflateWrite"] = "zlibDeflateWrite";
  SocketDiagnosticsEventType2["zlibDeflateFlushFired"] = "zlibDeflateFlushFired";
  SocketDiagnosticsEventType2["WebSocketNodeSocketWrite"] = "webSocketNodeSocketWrite";
  SocketDiagnosticsEventType2["WebSocketNodeSocketPeekedHeader"] = "webSocketNodeSocketPeekedHeader";
  SocketDiagnosticsEventType2["WebSocketNodeSocketReadHeader"] = "webSocketNodeSocketReadHeader";
  SocketDiagnosticsEventType2["WebSocketNodeSocketReadData"] = "webSocketNodeSocketReadData";
  SocketDiagnosticsEventType2["WebSocketNodeSocketUnmaskedData"] = "webSocketNodeSocketUnmaskedData";
  SocketDiagnosticsEventType2["WebSocketNodeSocketDrainBegin"] = "webSocketNodeSocketDrainBegin";
  SocketDiagnosticsEventType2["WebSocketNodeSocketDrainEnd"] = "webSocketNodeSocketDrainEnd";
  SocketDiagnosticsEventType2["ProtocolHeaderRead"] = "protocolHeaderRead";
  SocketDiagnosticsEventType2["ProtocolMessageRead"] = "protocolMessageRead";
  SocketDiagnosticsEventType2["ProtocolHeaderWrite"] = "protocolHeaderWrite";
  SocketDiagnosticsEventType2["ProtocolMessageWrite"] = "protocolMessageWrite";
  SocketDiagnosticsEventType2["ProtocolWrite"] = "protocolWrite";
  return SocketDiagnosticsEventType2;
})(SocketDiagnosticsEventType || {});
var SocketDiagnostics;
((SocketDiagnostics2) => {
  SocketDiagnostics2.enableDiagnostics = false;
  SocketDiagnostics2.records = [];
  const socketIds = /* @__PURE__ */ new WeakMap();
  let lastUsedSocketId = 0;
  function getSocketId(nativeObject, label) {
    if (!socketIds.has(nativeObject)) {
      const id = String(++lastUsedSocketId);
      socketIds.set(nativeObject, id);
    }
    return socketIds.get(nativeObject);
  }
  function traceSocketEvent(nativeObject, socketDebugLabel, type, data) {
    if (!SocketDiagnostics2.enableDiagnostics) {
      return;
    }
    const id = getSocketId(nativeObject, socketDebugLabel);
    if (data instanceof VSBuffer || data instanceof Uint8Array || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const copiedData = VSBuffer.alloc(data.byteLength);
      copiedData.set(data);
      SocketDiagnostics2.records.push({ timestamp: Date.now(), id, label: socketDebugLabel, type, buff: copiedData });
    } else {
      SocketDiagnostics2.records.push({ timestamp: Date.now(), id, label: socketDebugLabel, type, data });
    }
  }
  SocketDiagnostics2.traceSocketEvent = traceSocketEvent;
})(SocketDiagnostics || (SocketDiagnostics = {}));
var SocketCloseEventType = /* @__PURE__ */ ((SocketCloseEventType2) => {
  SocketCloseEventType2[SocketCloseEventType2["NodeSocketCloseEvent"] = 0] = "NodeSocketCloseEvent";
  SocketCloseEventType2[SocketCloseEventType2["WebSocketCloseEvent"] = 1] = "WebSocketCloseEvent";
  return SocketCloseEventType2;
})(SocketCloseEventType || {});
var SocketTimeoutReason = /* @__PURE__ */ ((SocketTimeoutReason2) => {
  SocketTimeoutReason2["UNACKNOWLEDGED_MESSAGE"] = "unacknowledgedMessage";
  SocketTimeoutReason2["KEEP_ALIVE"] = "keepAlive";
  return SocketTimeoutReason2;
})(SocketTimeoutReason || {});
let emptyBuffer = null;
function getEmptyBuffer() {
  if (!emptyBuffer) {
    emptyBuffer = VSBuffer.alloc(0);
  }
  return emptyBuffer;
}
class ChunkStream {
  get byteLength() {
    return this._totalLength;
  }
  constructor() {
    this._chunks = [];
    this._totalLength = 0;
  }
  acceptChunk(buff) {
    this._chunks.push(buff);
    this._totalLength += buff.byteLength;
  }
  read(byteCount) {
    return this._read(byteCount, true);
  }
  peek(byteCount) {
    return this._read(byteCount, false);
  }
  _read(byteCount, advance) {
    if (byteCount === 0) {
      return getEmptyBuffer();
    }
    if (byteCount > this._totalLength) {
      throw new Error(`Cannot read so many bytes!`);
    }
    if (this._chunks[0].byteLength === byteCount) {
      const result2 = this._chunks[0];
      if (advance) {
        this._chunks.shift();
        this._totalLength -= byteCount;
      }
      return result2;
    }
    if (this._chunks[0].byteLength > byteCount) {
      const result2 = this._chunks[0].slice(0, byteCount);
      if (advance) {
        this._chunks[0] = this._chunks[0].slice(byteCount);
        this._totalLength -= byteCount;
      }
      return result2;
    }
    const result = VSBuffer.alloc(byteCount);
    let resultOffset = 0;
    let chunkIndex = 0;
    while (byteCount > 0) {
      const chunk = this._chunks[chunkIndex];
      if (chunk.byteLength > byteCount) {
        const chunkPart = chunk.slice(0, byteCount);
        result.set(chunkPart, resultOffset);
        resultOffset += byteCount;
        if (advance) {
          this._chunks[chunkIndex] = chunk.slice(byteCount);
          this._totalLength -= byteCount;
        }
        byteCount -= byteCount;
      } else {
        result.set(chunk, resultOffset);
        resultOffset += chunk.byteLength;
        if (advance) {
          this._chunks.shift();
          this._totalLength -= chunk.byteLength;
        } else {
          chunkIndex++;
        }
        byteCount -= chunk.byteLength;
      }
    }
    return result;
  }
}
var ProtocolMessageType = /* @__PURE__ */ ((ProtocolMessageType2) => {
  ProtocolMessageType2[ProtocolMessageType2["None"] = 0] = "None";
  ProtocolMessageType2[ProtocolMessageType2["Regular"] = 1] = "Regular";
  ProtocolMessageType2[ProtocolMessageType2["Control"] = 2] = "Control";
  ProtocolMessageType2[ProtocolMessageType2["Ack"] = 3] = "Ack";
  ProtocolMessageType2[ProtocolMessageType2["Disconnect"] = 5] = "Disconnect";
  ProtocolMessageType2[ProtocolMessageType2["ReplayRequest"] = 6] = "ReplayRequest";
  ProtocolMessageType2[ProtocolMessageType2["Pause"] = 7] = "Pause";
  ProtocolMessageType2[ProtocolMessageType2["Resume"] = 8] = "Resume";
  ProtocolMessageType2[ProtocolMessageType2["KeepAlive"] = 9] = "KeepAlive";
  return ProtocolMessageType2;
})(ProtocolMessageType || {});
function protocolMessageTypeToString(messageType) {
  switch (messageType) {
    case 0 /* None */:
      return "None";
    case 1 /* Regular */:
      return "Regular";
    case 2 /* Control */:
      return "Control";
    case 3 /* Ack */:
      return "Ack";
    case 5 /* Disconnect */:
      return "Disconnect";
    case 6 /* ReplayRequest */:
      return "ReplayRequest";
    case 7 /* Pause */:
      return "PauseWriting";
    case 8 /* Resume */:
      return "ResumeWriting";
    case 9 /* KeepAlive */:
      return "KeepAlive";
  }
}
var ProtocolConstants = /* @__PURE__ */ ((ProtocolConstants2) => {
  ProtocolConstants2[ProtocolConstants2["HeaderLength"] = 13] = "HeaderLength";
  ProtocolConstants2[ProtocolConstants2["AcknowledgeTime"] = 2e3] = "AcknowledgeTime";
  ProtocolConstants2[ProtocolConstants2["TimeoutTime"] = 2e4] = "TimeoutTime";
  ProtocolConstants2[ProtocolConstants2["ReconnectionGraceTime"] = 108e5] = "ReconnectionGraceTime";
  ProtocolConstants2[ProtocolConstants2["ReconnectionShortGraceTime"] = 3e5] = "ReconnectionShortGraceTime";
  ProtocolConstants2[ProtocolConstants2["KeepAliveSendTime"] = 5e3] = "KeepAliveSendTime";
  return ProtocolConstants2;
})(ProtocolConstants || {});
class ProtocolMessage {
  constructor(type, id, ack, data) {
    this.type = type;
    this.id = id;
    this.ack = ack;
    this.data = data;
    this.writtenTime = 0;
  }
  get size() {
    return this.data.byteLength;
  }
}
class ProtocolReader extends Disposable {
  constructor(socket) {
    super();
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._state = {
      readHead: true,
      readLen: 13 /* HeaderLength */,
      messageType: 0 /* None */,
      id: 0,
      ack: 0
    };
    this._socket = socket;
    this._isDisposed = false;
    this._incomingData = new ChunkStream();
    this._register(this._socket.onData((data) => this.acceptChunk(data)));
    this.lastReadTime = Date.now();
  }
  acceptChunk(data) {
    if (!data || data.byteLength === 0) {
      return;
    }
    this.lastReadTime = Date.now();
    this._incomingData.acceptChunk(data);
    while (this._incomingData.byteLength >= this._state.readLen) {
      const buff = this._incomingData.read(this._state.readLen);
      if (this._state.readHead) {
        this._state.readHead = false;
        this._state.readLen = buff.readUInt32BE(9);
        this._state.messageType = buff.readUInt8(0);
        this._state.id = buff.readUInt32BE(1);
        this._state.ack = buff.readUInt32BE(5);
        this._socket.traceSocketEvent("protocolHeaderRead" /* ProtocolHeaderRead */, { messageType: protocolMessageTypeToString(this._state.messageType), id: this._state.id, ack: this._state.ack, messageSize: this._state.readLen });
      } else {
        const messageType = this._state.messageType;
        const id = this._state.id;
        const ack = this._state.ack;
        this._state.readHead = true;
        this._state.readLen = 13 /* HeaderLength */;
        this._state.messageType = 0 /* None */;
        this._state.id = 0;
        this._state.ack = 0;
        this._socket.traceSocketEvent("protocolMessageRead" /* ProtocolMessageRead */, buff);
        this._onMessage.fire(new ProtocolMessage(messageType, id, ack, buff));
        if (this._isDisposed) {
          break;
        }
      }
    }
  }
  readEntireBuffer() {
    return this._incomingData.read(this._incomingData.byteLength);
  }
  dispose() {
    this._isDisposed = true;
    super.dispose();
  }
}
class ProtocolWriter {
  constructor(socket) {
    this._writeNowTimeout = null;
    this._isDisposed = false;
    this._isPaused = false;
    this._socket = socket;
    this._data = [];
    this._totalLength = 0;
    this.lastWriteTime = 0;
  }
  dispose() {
    try {
      this.flush();
    } catch (err) {
    }
    this._isDisposed = true;
  }
  drain() {
    this.flush();
    return this._socket.drain();
  }
  flush() {
    this._writeNow();
  }
  pause() {
    this._isPaused = true;
  }
  resume() {
    this._isPaused = false;
    this._scheduleWriting();
  }
  write(msg) {
    if (this._isDisposed) {
      return;
    }
    msg.writtenTime = Date.now();
    this.lastWriteTime = Date.now();
    const header = VSBuffer.alloc(13 /* HeaderLength */);
    header.writeUInt8(msg.type, 0);
    header.writeUInt32BE(msg.id, 1);
    header.writeUInt32BE(msg.ack, 5);
    header.writeUInt32BE(msg.data.byteLength, 9);
    this._socket.traceSocketEvent("protocolHeaderWrite" /* ProtocolHeaderWrite */, { messageType: protocolMessageTypeToString(msg.type), id: msg.id, ack: msg.ack, messageSize: msg.data.byteLength });
    this._socket.traceSocketEvent("protocolMessageWrite" /* ProtocolMessageWrite */, msg.data);
    this._writeSoon(header, msg.data);
  }
  _bufferAdd(head, body) {
    const wasEmpty = this._totalLength === 0;
    this._data.push(head, body);
    this._totalLength += head.byteLength + body.byteLength;
    return wasEmpty;
  }
  _bufferTake() {
    const ret = VSBuffer.concat(this._data, this._totalLength);
    this._data.length = 0;
    this._totalLength = 0;
    return ret;
  }
  _writeSoon(header, data) {
    if (this._bufferAdd(header, data)) {
      this._scheduleWriting();
    }
  }
  _scheduleWriting() {
    if (this._writeNowTimeout) {
      return;
    }
    this._writeNowTimeout = setTimeout(() => {
      this._writeNowTimeout = null;
      this._writeNow();
    });
  }
  _writeNow() {
    if (this._totalLength === 0) {
      return;
    }
    if (this._isPaused) {
      return;
    }
    const data = this._bufferTake();
    this._socket.traceSocketEvent("protocolWrite" /* ProtocolWrite */, { byteLength: data.byteLength });
    this._socket.write(data);
  }
}
class Protocol extends Disposable {
  constructor(socket) {
    super();
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._socket = socket;
    this._socketWriter = this._register(new ProtocolWriter(this._socket));
    this._socketReader = this._register(new ProtocolReader(this._socket));
    this._register(this._socketReader.onMessage((msg) => {
      if (msg.type === 1 /* Regular */) {
        this._onMessage.fire(msg.data);
      }
    }));
    this._register(this._socket.onClose(() => this._onDidDispose.fire()));
  }
  drain() {
    return this._socketWriter.drain();
  }
  getSocket() {
    return this._socket;
  }
  sendDisconnect() {
  }
  send(buffer) {
    this._socketWriter.write(new ProtocolMessage(1 /* Regular */, 0, 0, buffer));
  }
}
class Client extends IPCClient {
  constructor(protocol, id, ipcLogger = null) {
    super(protocol, id, ipcLogger);
    this.protocol = protocol;
  }
  static fromSocket(socket, id) {
    return new Client(new Protocol(socket), id);
  }
  get onDidDispose() {
    return this.protocol.onDidDispose;
  }
  dispose() {
    super.dispose();
    const socket = this.protocol.getSocket();
    this.protocol.sendDisconnect();
    this.protocol.dispose();
    socket.end();
  }
}
class BufferedEmitter {
  constructor() {
    this._hasListeners = false;
    this._isDeliveringMessages = false;
    this._bufferedMessages = [];
    this._emitter = new Emitter({
      onWillAddFirstListener: () => {
        this._hasListeners = true;
        queueMicrotask(() => this._deliverMessages());
      },
      onDidRemoveLastListener: () => {
        this._hasListeners = false;
      }
    });
    this.event = this._emitter.event;
  }
  _deliverMessages() {
    if (this._isDeliveringMessages) {
      return;
    }
    this._isDeliveringMessages = true;
    while (this._hasListeners && this._bufferedMessages.length > 0) {
      this._emitter.fire(this._bufferedMessages.shift());
    }
    this._isDeliveringMessages = false;
  }
  fire(event) {
    if (this._hasListeners) {
      if (this._bufferedMessages.length > 0) {
        this._bufferedMessages.push(event);
      } else {
        this._emitter.fire(event);
      }
    } else {
      this._bufferedMessages.push(event);
    }
  }
  flushBuffer() {
    this._bufferedMessages = [];
  }
}
class QueueElement {
  constructor(data) {
    this.data = data;
    this.next = null;
  }
}
class Queue {
  constructor() {
    this._first = null;
    this._last = null;
  }
  length() {
    let result = 0;
    let current = this._first;
    while (current) {
      current = current.next;
      result++;
    }
    return result;
  }
  peek() {
    if (!this._first) {
      return null;
    }
    return this._first.data;
  }
  toArray() {
    const result = [];
    let resultLen = 0;
    let it = this._first;
    while (it) {
      result[resultLen++] = it.data;
      it = it.next;
    }
    return result;
  }
  pop() {
    if (!this._first) {
      return;
    }
    if (this._first === this._last) {
      this._first = null;
      this._last = null;
      return;
    }
    this._first = this._first.next;
  }
  push(item) {
    const element = new QueueElement(item);
    if (!this._first) {
      this._first = element;
      this._last = element;
      return;
    }
    this._last.next = element;
    this._last = element;
  }
}
const _LoadEstimator = class _LoadEstimator {
  static getInstance() {
    if (!_LoadEstimator._INSTANCE) {
      _LoadEstimator._INSTANCE = new _LoadEstimator();
    }
    return _LoadEstimator._INSTANCE;
  }
  constructor() {
    this.lastRuns = [];
    const now = Date.now();
    for (let i = 0; i < _LoadEstimator._HISTORY_LENGTH; i++) {
      this.lastRuns[i] = now - 1e3 * i;
    }
    setInterval(() => {
      for (let i = _LoadEstimator._HISTORY_LENGTH; i >= 1; i--) {
        this.lastRuns[i] = this.lastRuns[i - 1];
      }
      this.lastRuns[0] = Date.now();
    }, 1e3);
  }
  /**
   * returns an estimative number, from 0 (low load) to 1 (high load)
   */
  load() {
    const now = Date.now();
    const historyLimit = (1 + _LoadEstimator._HISTORY_LENGTH) * 1e3;
    let score = 0;
    for (let i = 0; i < _LoadEstimator._HISTORY_LENGTH; i++) {
      if (now - this.lastRuns[i] <= historyLimit) {
        score++;
      }
    }
    return 1 - score / _LoadEstimator._HISTORY_LENGTH;
  }
  hasHighLoad() {
    return this.load() >= 0.5;
  }
};
_LoadEstimator._HISTORY_LENGTH = 10;
_LoadEstimator._INSTANCE = null;
let LoadEstimator = _LoadEstimator;
class PersistentProtocol {
  constructor(opts) {
    this._onControlMessage = new BufferedEmitter();
    this.onControlMessage = this._onControlMessage.event;
    this._onMessage = new BufferedEmitter();
    this.onMessage = this._onMessage.event;
    this._onDidDispose = new BufferedEmitter();
    this.onDidDispose = this._onDidDispose.event;
    this._onSocketClose = new BufferedEmitter();
    this.onSocketClose = this._onSocketClose.event;
    this._onSocketTimeout = new BufferedEmitter();
    this.onSocketTimeout = this._onSocketTimeout.event;
    this._loadEstimator = opts.loadEstimator ?? LoadEstimator.getInstance();
    this._shouldSendKeepAlive = opts.sendKeepAlive ?? true;
    this._isReconnecting = false;
    this._outgoingUnackMsg = new Queue();
    this._outgoingMsgId = 0;
    this._outgoingAckId = 0;
    this._outgoingAckTimeout = null;
    this._incomingMsgId = 0;
    this._incomingAckId = 0;
    this._incomingMsgLastTime = 0;
    this._incomingAckTimeout = null;
    this._lastReplayRequestTime = 0;
    this._lastSocketTimeoutTime = Date.now();
    this._socketDisposables = new DisposableStore();
    this._socket = opts.socket;
    this._socketWriter = this._socketDisposables.add(new ProtocolWriter(this._socket));
    this._socketReader = this._socketDisposables.add(new ProtocolReader(this._socket));
    this._socketDisposables.add(this._socketReader.onMessage((msg) => this._receiveMessage(msg)));
    this._socketDisposables.add(this._socket.onClose((e) => this._onSocketClose.fire(e)));
    if (opts.initialChunk) {
      this._socketReader.acceptChunk(opts.initialChunk);
    }
    if (this._shouldSendKeepAlive) {
      this._keepAliveInterval = setInterval(() => {
        this._sendKeepAlive();
      }, 5e3 /* KeepAliveSendTime */);
    } else {
      this._keepAliveInterval = null;
    }
  }
  get unacknowledgedCount() {
    return this._outgoingMsgId - this._outgoingAckId;
  }
  dispose() {
    if (this._outgoingAckTimeout) {
      clearTimeout(this._outgoingAckTimeout);
      this._outgoingAckTimeout = null;
    }
    if (this._incomingAckTimeout) {
      clearTimeout(this._incomingAckTimeout);
      this._incomingAckTimeout = null;
    }
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
    this._socketDisposables.dispose();
  }
  drain() {
    return this._socketWriter.drain();
  }
  sendDisconnect() {
    if (!this._didSendDisconnect) {
      this._didSendDisconnect = true;
      const msg = new ProtocolMessage(5 /* Disconnect */, 0, 0, getEmptyBuffer());
      this._socketWriter.write(msg);
      this._socketWriter.flush();
    }
  }
  sendPause() {
    const msg = new ProtocolMessage(7 /* Pause */, 0, 0, getEmptyBuffer());
    this._socketWriter.write(msg);
  }
  sendResume() {
    const msg = new ProtocolMessage(8 /* Resume */, 0, 0, getEmptyBuffer());
    this._socketWriter.write(msg);
  }
  pauseSocketWriting() {
    this._socketWriter.pause();
  }
  getSocket() {
    return this._socket;
  }
  getMillisSinceLastIncomingData() {
    return Date.now() - this._socketReader.lastReadTime;
  }
  beginAcceptReconnection(socket, initialDataChunk) {
    this._isReconnecting = true;
    this._socketDisposables.dispose();
    this._socketDisposables = new DisposableStore();
    this._onControlMessage.flushBuffer();
    this._onSocketClose.flushBuffer();
    this._onSocketTimeout.flushBuffer();
    this._socket.dispose();
    this._lastReplayRequestTime = 0;
    this._lastSocketTimeoutTime = Date.now();
    this._socket = socket;
    this._socketWriter = this._socketDisposables.add(new ProtocolWriter(this._socket));
    this._socketReader = this._socketDisposables.add(new ProtocolReader(this._socket));
    this._socketDisposables.add(this._socketReader.onMessage((msg) => this._receiveMessage(msg)));
    this._socketDisposables.add(this._socket.onClose((e) => this._onSocketClose.fire(e)));
    this._socketReader.acceptChunk(initialDataChunk);
  }
  endAcceptReconnection() {
    this._isReconnecting = false;
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(3 /* Ack */, 0, this._incomingAckId, getEmptyBuffer());
    this._socketWriter.write(msg);
    const toSend = this._outgoingUnackMsg.toArray();
    for (let i = 0, len = toSend.length; i < len; i++) {
      this._socketWriter.write(toSend[i]);
    }
    this._recvAckCheck();
  }
  acceptDisconnect() {
    this._onDidDispose.fire();
  }
  _receiveMessage(msg) {
    if (msg.ack > this._outgoingAckId) {
      this._outgoingAckId = msg.ack;
      do {
        const first = this._outgoingUnackMsg.peek();
        if (first && first.id <= msg.ack) {
          this._outgoingUnackMsg.pop();
        } else {
          break;
        }
      } while (true);
    }
    switch (msg.type) {
      case 0 /* None */: {
        break;
      }
      case 1 /* Regular */: {
        if (msg.id > this._incomingMsgId) {
          if (msg.id !== this._incomingMsgId + 1) {
            const now = Date.now();
            if (now - this._lastReplayRequestTime > 1e4) {
              this._lastReplayRequestTime = now;
              this._socketWriter.write(new ProtocolMessage(6 /* ReplayRequest */, 0, 0, getEmptyBuffer()));
            }
          } else {
            this._incomingMsgId = msg.id;
            this._incomingMsgLastTime = Date.now();
            this._sendAckCheck();
            this._onMessage.fire(msg.data);
          }
        }
        break;
      }
      case 2 /* Control */: {
        this._onControlMessage.fire(msg.data);
        break;
      }
      case 3 /* Ack */: {
        break;
      }
      case 5 /* Disconnect */: {
        this._onDidDispose.fire();
        break;
      }
      case 6 /* ReplayRequest */: {
        const toSend = this._outgoingUnackMsg.toArray();
        for (let i = 0, len = toSend.length; i < len; i++) {
          this._socketWriter.write(toSend[i]);
        }
        this._recvAckCheck();
        break;
      }
      case 7 /* Pause */: {
        this._socketWriter.pause();
        break;
      }
      case 8 /* Resume */: {
        this._socketWriter.resume();
        break;
      }
      case 9 /* KeepAlive */: {
        break;
      }
    }
  }
  readEntireBuffer() {
    return this._socketReader.readEntireBuffer();
  }
  flush() {
    this._socketWriter.flush();
  }
  send(buffer) {
    const myId = ++this._outgoingMsgId;
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(1 /* Regular */, myId, this._incomingAckId, buffer);
    this._outgoingUnackMsg.push(msg);
    if (!this._isReconnecting) {
      this._socketWriter.write(msg);
      this._recvAckCheck();
    }
  }
  /**
   * Send a message which will not be part of the regular acknowledge flow.
   * Use this for early control messages which are repeated in case of reconnection.
   */
  sendControl(buffer) {
    const msg = new ProtocolMessage(2 /* Control */, 0, 0, buffer);
    this._socketWriter.write(msg);
  }
  _sendAckCheck() {
    if (this._incomingMsgId <= this._incomingAckId) {
      return;
    }
    if (this._incomingAckTimeout) {
      return;
    }
    const timeSinceLastIncomingMsg = Date.now() - this._incomingMsgLastTime;
    if (timeSinceLastIncomingMsg >= 2e3 /* AcknowledgeTime */) {
      this._sendAck();
      return;
    }
    this._incomingAckTimeout = setTimeout(() => {
      this._incomingAckTimeout = null;
      this._sendAckCheck();
    }, 2e3 /* AcknowledgeTime */ - timeSinceLastIncomingMsg + 5);
  }
  _recvAckCheck() {
    if (this._outgoingMsgId <= this._outgoingAckId) {
      return;
    }
    if (this._outgoingAckTimeout) {
      return;
    }
    if (this._isReconnecting) {
      return;
    }
    const oldestUnacknowledgedMsg = this._outgoingUnackMsg.peek();
    const timeSinceOldestUnacknowledgedMsg = Date.now() - oldestUnacknowledgedMsg.writtenTime;
    const timeSinceLastReceivedSomeData = Date.now() - this._socketReader.lastReadTime;
    const timeSinceLastTimeout = Date.now() - this._lastSocketTimeoutTime;
    if (timeSinceOldestUnacknowledgedMsg >= 2e4 /* TimeoutTime */ && timeSinceLastReceivedSomeData >= 2e4 /* TimeoutTime */ && timeSinceLastTimeout >= 2e4 /* TimeoutTime */) {
      if (!this._loadEstimator.hasHighLoad()) {
        this._lastSocketTimeoutTime = Date.now();
        this._onSocketTimeout.fire({
          reason: "unacknowledgedMessage" /* UNACKNOWLEDGED_MESSAGE */,
          unacknowledgedMsgCount: this._outgoingUnackMsg.length(),
          timeSinceOldestUnacknowledgedMsg,
          timeSinceLastReceivedSomeData
        });
        return;
      }
    }
    const minimumTimeUntilTimeout = Math.max(
      2e4 /* TimeoutTime */ - timeSinceOldestUnacknowledgedMsg,
      2e4 /* TimeoutTime */ - timeSinceLastReceivedSomeData,
      2e4 /* TimeoutTime */ - timeSinceLastTimeout,
      500
    );
    this._outgoingAckTimeout = setTimeout(() => {
      this._outgoingAckTimeout = null;
      this._recvAckCheck();
    }, minimumTimeUntilTimeout);
  }
  /**
   * Called after sending a keepalive. Both sides of this protocol send
   * keepalives every KeepAliveSendTime (5s), so receiving no data for
   * TimeoutTime (20s) means the connection is dead. This catches silent
   * connection deaths that _recvAckCheck cannot detect because there are
   * no unacknowledged regular messages.
   */
  _keepAliveTimeoutCheck() {
    if (this._isReconnecting) {
      return;
    }
    const now = Date.now();
    const timeSinceLastReceivedSomeData = now - this._socketReader.lastReadTime;
    const timeSinceLastTimeout = now - this._lastSocketTimeoutTime;
    if (timeSinceLastReceivedSomeData >= 2e4 /* TimeoutTime */ && timeSinceLastTimeout >= 2e4 /* TimeoutTime */) {
      if (!this._loadEstimator.hasHighLoad()) {
        this._lastSocketTimeoutTime = now;
        const unacknowledgedMsgCount = this._outgoingUnackMsg.length();
        const oldestUnacknowledgedMsg = this._outgoingUnackMsg.peek();
        this._onSocketTimeout.fire({
          reason: "keepAlive" /* KEEP_ALIVE */,
          unacknowledgedMsgCount,
          timeSinceOldestUnacknowledgedMsg: oldestUnacknowledgedMsg ? now - oldestUnacknowledgedMsg.writtenTime : void 0,
          timeSinceLastReceivedSomeData
        });
      }
    }
  }
  _sendAck() {
    if (this._incomingMsgId <= this._incomingAckId) {
      return;
    }
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(3 /* Ack */, 0, this._incomingAckId, getEmptyBuffer());
    this._socketWriter.write(msg);
  }
  _sendKeepAlive() {
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(9 /* KeepAlive */, 0, this._incomingAckId, getEmptyBuffer());
    this._socketWriter.write(msg);
    this._keepAliveTimeoutCheck();
  }
}
export {
  BufferedEmitter,
  ChunkStream,
  Client,
  LoadEstimator,
  PersistentProtocol,
  Protocol,
  ProtocolConstants,
  SocketCloseEventType,
  SocketDiagnostics,
  SocketDiagnosticsEventType,
  SocketTimeoutReason
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcaXBjXFxjb21tb25cXGlwYy5uZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUlQQ0xvZ2dlciwgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wsIElQQ0NsaWVudCB9IGZyb20gJy4vaXBjLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUge1xuXHRDcmVhdGVkID0gJ2NyZWF0ZWQnLFxuXHRSZWFkID0gJ3JlYWQnLFxuXHRXcml0ZSA9ICd3cml0ZScsXG5cdE9wZW4gPSAnb3BlbicsXG5cdEVycm9yID0gJ2Vycm9yJyxcblx0Q2xvc2UgPSAnY2xvc2UnLFxuXG5cdEJyb3dzZXJXZWJTb2NrZXRCbG9iUmVjZWl2ZWQgPSAnYnJvd3NlcldlYlNvY2tldEJsb2JSZWNlaXZlZCcsXG5cblx0Tm9kZUVuZFJlY2VpdmVkID0gJ25vZGVFbmRSZWNlaXZlZCcsXG5cdE5vZGVFbmRTZW50ID0gJ25vZGVFbmRTZW50Jyxcblx0Tm9kZURyYWluQmVnaW4gPSAnbm9kZURyYWluQmVnaW4nLFxuXHROb2RlRHJhaW5FbmQgPSAnbm9kZURyYWluRW5kJyxcblxuXHR6bGliSW5mbGF0ZUVycm9yID0gJ3psaWJJbmZsYXRlRXJyb3InLFxuXHR6bGliSW5mbGF0ZURhdGEgPSAnemxpYkluZmxhdGVEYXRhJyxcblx0emxpYkluZmxhdGVJbml0aWFsV3JpdGUgPSAnemxpYkluZmxhdGVJbml0aWFsV3JpdGUnLFxuXHR6bGliSW5mbGF0ZUluaXRpYWxGbHVzaEZpcmVkID0gJ3psaWJJbmZsYXRlSW5pdGlhbEZsdXNoRmlyZWQnLFxuXHR6bGliSW5mbGF0ZVdyaXRlID0gJ3psaWJJbmZsYXRlV3JpdGUnLFxuXHR6bGliSW5mbGF0ZUZsdXNoRmlyZWQgPSAnemxpYkluZmxhdGVGbHVzaEZpcmVkJyxcblx0emxpYkRlZmxhdGVFcnJvciA9ICd6bGliRGVmbGF0ZUVycm9yJyxcblx0emxpYkRlZmxhdGVEYXRhID0gJ3psaWJEZWZsYXRlRGF0YScsXG5cdHpsaWJEZWZsYXRlV3JpdGUgPSAnemxpYkRlZmxhdGVXcml0ZScsXG5cdHpsaWJEZWZsYXRlRmx1c2hGaXJlZCA9ICd6bGliRGVmbGF0ZUZsdXNoRmlyZWQnLFxuXG5cdFdlYlNvY2tldE5vZGVTb2NrZXRXcml0ZSA9ICd3ZWJTb2NrZXROb2RlU29ja2V0V3JpdGUnLFxuXHRXZWJTb2NrZXROb2RlU29ja2V0UGVla2VkSGVhZGVyID0gJ3dlYlNvY2tldE5vZGVTb2NrZXRQZWVrZWRIZWFkZXInLFxuXHRXZWJTb2NrZXROb2RlU29ja2V0UmVhZEhlYWRlciA9ICd3ZWJTb2NrZXROb2RlU29ja2V0UmVhZEhlYWRlcicsXG5cdFdlYlNvY2tldE5vZGVTb2NrZXRSZWFkRGF0YSA9ICd3ZWJTb2NrZXROb2RlU29ja2V0UmVhZERhdGEnLFxuXHRXZWJTb2NrZXROb2RlU29ja2V0VW5tYXNrZWREYXRhID0gJ3dlYlNvY2tldE5vZGVTb2NrZXRVbm1hc2tlZERhdGEnLFxuXHRXZWJTb2NrZXROb2RlU29ja2V0RHJhaW5CZWdpbiA9ICd3ZWJTb2NrZXROb2RlU29ja2V0RHJhaW5CZWdpbicsXG5cdFdlYlNvY2tldE5vZGVTb2NrZXREcmFpbkVuZCA9ICd3ZWJTb2NrZXROb2RlU29ja2V0RHJhaW5FbmQnLFxuXG5cdFByb3RvY29sSGVhZGVyUmVhZCA9ICdwcm90b2NvbEhlYWRlclJlYWQnLFxuXHRQcm90b2NvbE1lc3NhZ2VSZWFkID0gJ3Byb3RvY29sTWVzc2FnZVJlYWQnLFxuXHRQcm90b2NvbEhlYWRlcldyaXRlID0gJ3Byb3RvY29sSGVhZGVyV3JpdGUnLFxuXHRQcm90b2NvbE1lc3NhZ2VXcml0ZSA9ICdwcm90b2NvbE1lc3NhZ2VXcml0ZScsXG5cdFByb3RvY29sV3JpdGUgPSAncHJvdG9jb2xXcml0ZScsXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgU29ja2V0RGlhZ25vc3RpY3Mge1xuXG5cdGV4cG9ydCBjb25zdCBlbmFibGVEaWFnbm9zdGljcyA9IGZhbHNlO1xuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSVJlY29yZCB7XG5cdFx0dGltZXN0YW1wOiBudW1iZXI7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdHR5cGU6IFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlO1xuXHRcdGJ1ZmY/OiBWU0J1ZmZlcjtcblx0XHRkYXRhPzogYW55O1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHJlY29yZHM6IElSZWNvcmRbXSA9IFtdO1xuXHRjb25zdCBzb2NrZXRJZHMgPSBuZXcgV2Vha01hcDxhbnksIHN0cmluZz4oKTtcblx0bGV0IGxhc3RVc2VkU29ja2V0SWQgPSAwO1xuXG5cdGZ1bmN0aW9uIGdldFNvY2tldElkKG5hdGl2ZU9iamVjdDogdW5rbm93biwgbGFiZWw6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKCFzb2NrZXRJZHMuaGFzKG5hdGl2ZU9iamVjdCkpIHtcblx0XHRcdGNvbnN0IGlkID0gU3RyaW5nKCsrbGFzdFVzZWRTb2NrZXRJZCk7XG5cdFx0XHRzb2NrZXRJZHMuc2V0KG5hdGl2ZU9iamVjdCwgaWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gc29ja2V0SWRzLmdldChuYXRpdmVPYmplY3QpITtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0cmFjZVNvY2tldEV2ZW50KG5hdGl2ZU9iamVjdDogdW5rbm93biwgc29ja2V0RGVidWdMYWJlbDogc3RyaW5nLCB0eXBlOiBTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZSwgZGF0YT86IFZTQnVmZmVyIHwgVWludDhBcnJheSB8IEFycmF5QnVmZmVyIHwgQXJyYXlCdWZmZXJWaWV3IHwgYW55KTogdm9pZCB7XG5cdFx0aWYgKCFlbmFibGVEaWFnbm9zdGljcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9IGdldFNvY2tldElkKG5hdGl2ZU9iamVjdCwgc29ja2V0RGVidWdMYWJlbCk7XG5cblx0XHRpZiAoZGF0YSBpbnN0YW5jZW9mIFZTQnVmZmVyIHx8IGRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5IHx8IGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlciB8fCBBcnJheUJ1ZmZlci5pc1ZpZXcoZGF0YSkpIHtcblx0XHRcdGNvbnN0IGNvcGllZERhdGEgPSBWU0J1ZmZlci5hbGxvYyhkYXRhLmJ5dGVMZW5ndGgpO1xuXHRcdFx0Y29waWVkRGF0YS5zZXQoZGF0YSk7XG5cdFx0XHRyZWNvcmRzLnB1c2goeyB0aW1lc3RhbXA6IERhdGUubm93KCksIGlkLCBsYWJlbDogc29ja2V0RGVidWdMYWJlbCwgdHlwZSwgYnVmZjogY29waWVkRGF0YSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZGF0YSBpcyBhIGN1c3RvbSBvYmplY3Rcblx0XHRcdHJlY29yZHMucHVzaCh7IHRpbWVzdGFtcDogRGF0ZS5ub3coKSwgaWQsIGxhYmVsOiBzb2NrZXREZWJ1Z0xhYmVsLCB0eXBlLCBkYXRhOiBkYXRhIH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBTb2NrZXRDbG9zZUV2ZW50VHlwZSB7XG5cdE5vZGVTb2NrZXRDbG9zZUV2ZW50ID0gMCxcblx0V2ViU29ja2V0Q2xvc2VFdmVudCA9IDFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb2RlU29ja2V0Q2xvc2VFdmVudCB7XG5cdC8qKlxuXHQgKiBUaGUgdHlwZSBvZiB0aGUgZXZlbnRcblx0ICovXG5cdHJlYWRvbmx5IHR5cGU6IFNvY2tldENsb3NlRXZlbnRUeXBlLk5vZGVTb2NrZXRDbG9zZUV2ZW50O1xuXHQvKipcblx0ICogYHRydWVgIGlmIHRoZSBzb2NrZXQgaGFkIGEgdHJhbnNtaXNzaW9uIGVycm9yLlxuXHQgKi9cblx0cmVhZG9ubHkgaGFkRXJyb3I6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBVbmRlcmx5aW5nIGVycm9yLlxuXHQgKi9cblx0cmVhZG9ubHkgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdlYlNvY2tldENsb3NlRXZlbnQge1xuXHQvKipcblx0ICogVGhlIHR5cGUgb2YgdGhlIGV2ZW50XG5cdCAqL1xuXHRyZWFkb25seSB0eXBlOiBTb2NrZXRDbG9zZUV2ZW50VHlwZS5XZWJTb2NrZXRDbG9zZUV2ZW50O1xuXHQvKipcblx0ICogUmV0dXJucyB0aGUgV2ViU29ja2V0IGNvbm5lY3Rpb24gY2xvc2UgY29kZSBwcm92aWRlZCBieSB0aGUgc2VydmVyLlxuXHQgKi9cblx0cmVhZG9ubHkgY29kZTogbnVtYmVyO1xuXHQvKipcblx0ICogUmV0dXJucyB0aGUgV2ViU29ja2V0IGNvbm5lY3Rpb24gY2xvc2UgcmVhc29uIHByb3ZpZGVkIGJ5IHRoZSBzZXJ2ZXIuXG5cdCAqL1xuXHRyZWFkb25seSByZWFzb246IHN0cmluZztcblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgY29ubmVjdGlvbiBjbG9zZWQgY2xlYW5seTsgZmFsc2Ugb3RoZXJ3aXNlLlxuXHQgKi9cblx0cmVhZG9ubHkgd2FzQ2xlYW46IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBVbmRlcmx5aW5nIGV2ZW50LlxuXHQgKi9cblx0cmVhZG9ubHkgZXZlbnQ6IGFueSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IHR5cGUgU29ja2V0Q2xvc2VFdmVudCA9IE5vZGVTb2NrZXRDbG9zZUV2ZW50IHwgV2ViU29ja2V0Q2xvc2VFdmVudCB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGNvbnN0IGVudW0gU29ja2V0VGltZW91dFJlYXNvbiB7XG5cdFVOQUNLTk9XTEVER0VEX01FU1NBR0UgPSAndW5hY2tub3dsZWRnZWRNZXNzYWdlJyxcblx0S0VFUF9BTElWRSA9ICdrZWVwQWxpdmUnLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNvY2tldFRpbWVvdXRFdmVudCB7XG5cdHJlYWRvbmx5IHJlYXNvbjogU29ja2V0VGltZW91dFJlYXNvbjtcblx0cmVhZG9ubHkgdW5hY2tub3dsZWRnZWRNc2dDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSB0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZz86IG51bWJlcjtcblx0cmVhZG9ubHkgdGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU29ja2V0IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRvbkRhdGEobGlzdGVuZXI6IChlOiBWU0J1ZmZlcikgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHRvbkNsb3NlKGxpc3RlbmVyOiAoZTogU29ja2V0Q2xvc2VFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHRvbkVuZChsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlO1xuXHR3cml0ZShidWZmZXI6IFZTQnVmZmVyKTogdm9pZDtcblx0ZW5kKCk6IHZvaWQ7XG5cdGRyYWluKCk6IFByb21pc2U8dm9pZD47XG5cblx0dHJhY2VTb2NrZXRFdmVudCh0eXBlOiBTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZSwgZGF0YT86IFZTQnVmZmVyIHwgVWludDhBcnJheSB8IEFycmF5QnVmZmVyIHwgQXJyYXlCdWZmZXJWaWV3IHwgYW55KTogdm9pZDtcbn1cblxubGV0IGVtcHR5QnVmZmVyOiBWU0J1ZmZlciB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gZ2V0RW1wdHlCdWZmZXIoKTogVlNCdWZmZXIge1xuXHRpZiAoIWVtcHR5QnVmZmVyKSB7XG5cdFx0ZW1wdHlCdWZmZXIgPSBWU0J1ZmZlci5hbGxvYygwKTtcblx0fVxuXHRyZXR1cm4gZW1wdHlCdWZmZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDaHVua1N0cmVhbSB7XG5cblx0cHJpdmF0ZSBfY2h1bmtzOiBWU0J1ZmZlcltdO1xuXHRwcml2YXRlIF90b3RhbExlbmd0aDogbnVtYmVyO1xuXG5cdHB1YmxpYyBnZXQgYnl0ZUxlbmd0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdG90YWxMZW5ndGg7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9jaHVua3MgPSBbXTtcblx0XHR0aGlzLl90b3RhbExlbmd0aCA9IDA7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0Q2h1bmsoYnVmZjogVlNCdWZmZXIpIHtcblx0XHR0aGlzLl9jaHVua3MucHVzaChidWZmKTtcblx0XHR0aGlzLl90b3RhbExlbmd0aCArPSBidWZmLmJ5dGVMZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgcmVhZChieXRlQ291bnQ6IG51bWJlcik6IFZTQnVmZmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhZChieXRlQ291bnQsIHRydWUpO1xuXHR9XG5cblx0cHVibGljIHBlZWsoYnl0ZUNvdW50OiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWQoYnl0ZUNvdW50LCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkKGJ5dGVDb3VudDogbnVtYmVyLCBhZHZhbmNlOiBib29sZWFuKTogVlNCdWZmZXIge1xuXG5cdFx0aWYgKGJ5dGVDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGdldEVtcHR5QnVmZmVyKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGJ5dGVDb3VudCA+IHRoaXMuX3RvdGFsTGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZWFkIHNvIG1hbnkgYnl0ZXMhYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NodW5rc1swXS5ieXRlTGVuZ3RoID09PSBieXRlQ291bnQpIHtcblx0XHRcdC8vIHN1cGVyIGZhc3QgcGF0aCwgcHJlY2lzZWx5IGZpcnN0IGNodW5rIG11c3QgYmUgcmV0dXJuZWRcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NodW5rc1swXTtcblx0XHRcdGlmIChhZHZhbmNlKSB7XG5cdFx0XHRcdHRoaXMuX2NodW5rcy5zaGlmdCgpO1xuXHRcdFx0XHR0aGlzLl90b3RhbExlbmd0aCAtPSBieXRlQ291bnQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jaHVua3NbMF0uYnl0ZUxlbmd0aCA+IGJ5dGVDb3VudCkge1xuXHRcdFx0Ly8gZmFzdCBwYXRoLCB0aGUgcmVhZGluZyBpcyBlbnRpcmVseSB3aXRoaW4gdGhlIGZpcnN0IGNodW5rXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jaHVua3NbMF0uc2xpY2UoMCwgYnl0ZUNvdW50KTtcblx0XHRcdGlmIChhZHZhbmNlKSB7XG5cdFx0XHRcdHRoaXMuX2NodW5rc1swXSA9IHRoaXMuX2NodW5rc1swXS5zbGljZShieXRlQ291bnQpO1xuXHRcdFx0XHR0aGlzLl90b3RhbExlbmd0aCAtPSBieXRlQ291bnQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IFZTQnVmZmVyLmFsbG9jKGJ5dGVDb3VudCk7XG5cdFx0bGV0IHJlc3VsdE9mZnNldCA9IDA7XG5cdFx0bGV0IGNodW5rSW5kZXggPSAwO1xuXHRcdHdoaWxlIChieXRlQ291bnQgPiAwKSB7XG5cdFx0XHRjb25zdCBjaHVuayA9IHRoaXMuX2NodW5rc1tjaHVua0luZGV4XTtcblx0XHRcdGlmIChjaHVuay5ieXRlTGVuZ3RoID4gYnl0ZUNvdW50KSB7XG5cdFx0XHRcdC8vIHRoaXMgY2h1bmsgd2lsbCBzdXJ2aXZlXG5cdFx0XHRcdGNvbnN0IGNodW5rUGFydCA9IGNodW5rLnNsaWNlKDAsIGJ5dGVDb3VudCk7XG5cdFx0XHRcdHJlc3VsdC5zZXQoY2h1bmtQYXJ0LCByZXN1bHRPZmZzZXQpO1xuXHRcdFx0XHRyZXN1bHRPZmZzZXQgKz0gYnl0ZUNvdW50O1xuXG5cdFx0XHRcdGlmIChhZHZhbmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2h1bmtzW2NodW5rSW5kZXhdID0gY2h1bmsuc2xpY2UoYnl0ZUNvdW50KTtcblx0XHRcdFx0XHR0aGlzLl90b3RhbExlbmd0aCAtPSBieXRlQ291bnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRieXRlQ291bnQgLT0gYnl0ZUNvdW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gdGhpcyBjaHVuayB3aWxsIGJlIGVudGlyZWx5IHJlYWRcblx0XHRcdFx0cmVzdWx0LnNldChjaHVuaywgcmVzdWx0T2Zmc2V0KTtcblx0XHRcdFx0cmVzdWx0T2Zmc2V0ICs9IGNodW5rLmJ5dGVMZW5ndGg7XG5cblx0XHRcdFx0aWYgKGFkdmFuY2UpIHtcblx0XHRcdFx0XHR0aGlzLl9jaHVua3Muc2hpZnQoKTtcblx0XHRcdFx0XHR0aGlzLl90b3RhbExlbmd0aCAtPSBjaHVuay5ieXRlTGVuZ3RoO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNodW5rSW5kZXgrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJ5dGVDb3VudCAtPSBjaHVuay5ieXRlTGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNvbnN0IGVudW0gUHJvdG9jb2xNZXNzYWdlVHlwZSB7XG5cdE5vbmUgPSAwLFxuXHRSZWd1bGFyID0gMSxcblx0Q29udHJvbCA9IDIsXG5cdEFjayA9IDMsXG5cdERpc2Nvbm5lY3QgPSA1LFxuXHRSZXBsYXlSZXF1ZXN0ID0gNixcblx0UGF1c2UgPSA3LFxuXHRSZXN1bWUgPSA4LFxuXHRLZWVwQWxpdmUgPSA5XG59XG5cbmZ1bmN0aW9uIHByb3RvY29sTWVzc2FnZVR5cGVUb1N0cmluZyhtZXNzYWdlVHlwZTogUHJvdG9jb2xNZXNzYWdlVHlwZSkge1xuXHRzd2l0Y2ggKG1lc3NhZ2VUeXBlKSB7XG5cdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLk5vbmU6IHJldHVybiAnTm9uZSc7XG5cdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLlJlZ3VsYXI6IHJldHVybiAnUmVndWxhcic7XG5cdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLkNvbnRyb2w6IHJldHVybiAnQ29udHJvbCc7XG5cdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLkFjazogcmV0dXJuICdBY2snO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5EaXNjb25uZWN0OiByZXR1cm4gJ0Rpc2Nvbm5lY3QnO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5SZXBsYXlSZXF1ZXN0OiByZXR1cm4gJ1JlcGxheVJlcXVlc3QnO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5QYXVzZTogcmV0dXJuICdQYXVzZVdyaXRpbmcnO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5SZXN1bWU6IHJldHVybiAnUmVzdW1lV3JpdGluZyc7XG5cdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLktlZXBBbGl2ZTogcmV0dXJuICdLZWVwQWxpdmUnO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFByb3RvY29sQ29uc3RhbnRzIHtcblx0SGVhZGVyTGVuZ3RoID0gMTMsXG5cdC8qKlxuXHQgKiBTZW5kIGFuIEFja25vd2xlZGdlIG1lc3NhZ2UgYXQgbW9zdCAyIHNlY29uZHMgbGF0ZXIuLi5cblx0ICovXG5cdEFja25vd2xlZGdlVGltZSA9IDIwMDAsIC8vIDIgc2Vjb25kc1xuXHQvKipcblx0ICogSWYgdGhlcmUgaXMgYSBzZW50IG1lc3NhZ2UgdGhhdCBoYXMgYmVlbiB1bmFja25vd2xlZGdlZCBmb3IgMjAgc2Vjb25kcyxcblx0ICogYW5kIHdlIGRpZG4ndCBzZWUgYW55IGluY29taW5nIHNlcnZlciBkYXRhIGluIHRoZSBwYXN0IDIwIHNlY29uZHMsXG5cdCAqIHRoZW4gY29uc2lkZXIgdGhlIGNvbm5lY3Rpb24gaGFzIHRpbWVkIG91dC5cblx0ICovXG5cdFRpbWVvdXRUaW1lID0gMjAwMDAsIC8vIDIwIHNlY29uZHNcblx0LyoqXG5cdCAqIElmIHRoZXJlIGlzIG5vIHJlY29ubmVjdGlvbiB3aXRoaW4gdGhpcyB0aW1lLWZyYW1lLCBjb25zaWRlciB0aGUgY29ubmVjdGlvbiBwZXJtYW5lbnRseSBjbG9zZWQuLi5cblx0ICovXG5cdFJlY29ubmVjdGlvbkdyYWNlVGltZSA9IDMgKiA2MCAqIDYwICogMTAwMCwgLy8gM2hyc1xuXHQvKipcblx0ICogTWF4aW1hbCBncmFjZSB0aW1lIGJldHdlZW4gdGhlIGZpcnN0IGFuZCB0aGUgbGFzdCByZWNvbm5lY3Rpb24uLi5cblx0ICovXG5cdFJlY29ubmVjdGlvblNob3J0R3JhY2VUaW1lID0gNSAqIDYwICogMTAwMCwgLy8gNW1pblxuXHQvKipcblx0ICogU2VuZCBhIG1lc3NhZ2UgZXZlcnkgNSBzZWNvbmRzIHRvIGF2b2lkIHRoYXQgdGhlIGNvbm5lY3Rpb24gaXMgY2xvc2VkIGJ5IHRoZSBPUy5cblx0ICovXG5cdEtlZXBBbGl2ZVNlbmRUaW1lID0gNTAwMCwgLy8gNSBzZWNvbmRzXG59XG5cbmNsYXNzIFByb3RvY29sTWVzc2FnZSB7XG5cblx0cHVibGljIHdyaXR0ZW5UaW1lOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHR5cGU6IFByb3RvY29sTWVzc2FnZVR5cGUsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFjazogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBkYXRhOiBWU0J1ZmZlclxuXHQpIHtcblx0XHR0aGlzLndyaXR0ZW5UaW1lID0gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmRhdGEuYnl0ZUxlbmd0aDtcblx0fVxufVxuXG5jbGFzcyBQcm90b2NvbFJlYWRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldDogSVNvY2tldDtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5jb21pbmdEYXRhOiBDaHVua1N0cmVhbTtcblx0cHVibGljIGxhc3RSZWFkVGltZTogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb3RvY29sTWVzc2FnZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFByb3RvY29sTWVzc2FnZT4gPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSB7XG5cdFx0cmVhZEhlYWQ6IHRydWUsXG5cdFx0cmVhZExlbjogUHJvdG9jb2xDb25zdGFudHMuSGVhZGVyTGVuZ3RoLFxuXHRcdG1lc3NhZ2VUeXBlOiBQcm90b2NvbE1lc3NhZ2VUeXBlLk5vbmUsXG5cdFx0aWQ6IDAsXG5cdFx0YWNrOiAwXG5cdH07XG5cblx0Y29uc3RydWN0b3Ioc29ja2V0OiBJU29ja2V0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2luY29taW5nRGF0YSA9IG5ldyBDaHVua1N0cmVhbSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NvY2tldC5vbkRhdGEoZGF0YSA9PiB0aGlzLmFjY2VwdENodW5rKGRhdGEpKSk7XG5cdFx0dGhpcy5sYXN0UmVhZFRpbWUgPSBEYXRlLm5vdygpO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdENodW5rKGRhdGE6IFZTQnVmZmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghZGF0YSB8fCBkYXRhLmJ5dGVMZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxhc3RSZWFkVGltZSA9IERhdGUubm93KCk7XG5cblx0XHR0aGlzLl9pbmNvbWluZ0RhdGEuYWNjZXB0Q2h1bmsoZGF0YSk7XG5cblx0XHR3aGlsZSAodGhpcy5faW5jb21pbmdEYXRhLmJ5dGVMZW5ndGggPj0gdGhpcy5fc3RhdGUucmVhZExlbikge1xuXG5cdFx0XHRjb25zdCBidWZmID0gdGhpcy5faW5jb21pbmdEYXRhLnJlYWQodGhpcy5fc3RhdGUucmVhZExlbik7XG5cblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5yZWFkSGVhZCkge1xuXHRcdFx0XHQvLyBidWZmIGlzIHRoZSBoZWFkZXJcblxuXHRcdFx0XHQvLyBzYXZlIG5ldyBzdGF0ZSA9PiBuZXh0IHRpbWUgd2lsbCByZWFkIHRoZSBib2R5XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRIZWFkID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRMZW4gPSBidWZmLnJlYWRVSW50MzJCRSg5KTtcblx0XHRcdFx0dGhpcy5fc3RhdGUubWVzc2FnZVR5cGUgPSBidWZmLnJlYWRVSW50OCgwKTtcblx0XHRcdFx0dGhpcy5fc3RhdGUuaWQgPSBidWZmLnJlYWRVSW50MzJCRSgxKTtcblx0XHRcdFx0dGhpcy5fc3RhdGUuYWNrID0gYnVmZi5yZWFkVUludDMyQkUoNSk7XG5cblx0XHRcdFx0dGhpcy5fc29ja2V0LnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuUHJvdG9jb2xIZWFkZXJSZWFkLCB7IG1lc3NhZ2VUeXBlOiBwcm90b2NvbE1lc3NhZ2VUeXBlVG9TdHJpbmcodGhpcy5fc3RhdGUubWVzc2FnZVR5cGUpLCBpZDogdGhpcy5fc3RhdGUuaWQsIGFjazogdGhpcy5fc3RhdGUuYWNrLCBtZXNzYWdlU2l6ZTogdGhpcy5fc3RhdGUucmVhZExlbiB9KTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gYnVmZiBpcyB0aGUgYm9keVxuXHRcdFx0XHRjb25zdCBtZXNzYWdlVHlwZSA9IHRoaXMuX3N0YXRlLm1lc3NhZ2VUeXBlO1xuXHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX3N0YXRlLmlkO1xuXHRcdFx0XHRjb25zdCBhY2sgPSB0aGlzLl9zdGF0ZS5hY2s7XG5cblx0XHRcdFx0Ly8gc2F2ZSBuZXcgc3RhdGUgPT4gbmV4dCB0aW1lIHdpbGwgcmVhZCB0aGUgaGVhZGVyXG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRIZWFkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc3RhdGUucmVhZExlbiA9IFByb3RvY29sQ29uc3RhbnRzLkhlYWRlckxlbmd0aDtcblx0XHRcdFx0dGhpcy5fc3RhdGUubWVzc2FnZVR5cGUgPSBQcm90b2NvbE1lc3NhZ2VUeXBlLk5vbmU7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmlkID0gMDtcblx0XHRcdFx0dGhpcy5fc3RhdGUuYWNrID0gMDtcblxuXHRcdFx0XHR0aGlzLl9zb2NrZXQudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Qcm90b2NvbE1lc3NhZ2VSZWFkLCBidWZmKTtcblxuXHRcdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZShuZXcgUHJvdG9jb2xNZXNzYWdlKG1lc3NhZ2VUeXBlLCBpZCwgYWNrLCBidWZmKSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHQvLyBjaGVjayBpZiBhbiBldmVudCBsaXN0ZW5lciBsZWFkIHRvIG91ciBkaXNwb3NhbFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlYWRFbnRpcmVCdWZmZXIoKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbmNvbWluZ0RhdGEucmVhZCh0aGlzLl9pbmNvbWluZ0RhdGEuYnl0ZUxlbmd0aCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUHJvdG9jb2xXcml0ZXIge1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lzUGF1c2VkOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zb2NrZXQ6IElTb2NrZXQ7XG5cdHByaXZhdGUgX2RhdGE6IFZTQnVmZmVyW107XG5cdHByaXZhdGUgX3RvdGFsTGVuZ3RoOiBudW1iZXI7XG5cdHB1YmxpYyBsYXN0V3JpdGVUaW1lOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3Ioc29ja2V0OiBJU29ja2V0KSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2lzUGF1c2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fc29ja2V0ID0gc29ja2V0O1xuXHRcdHRoaXMuX2RhdGEgPSBbXTtcblx0XHR0aGlzLl90b3RhbExlbmd0aCA9IDA7XG5cdFx0dGhpcy5sYXN0V3JpdGVUaW1lID0gMDtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmZsdXNoKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBpZ25vcmUgZXJyb3IsIHNpbmNlIHRoZSBzb2NrZXQgY291bGQgYmUgYWxyZWFkeSBjbG9zZWRcblx0XHR9XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5mbHVzaCgpO1xuXHRcdHJldHVybiB0aGlzLl9zb2NrZXQuZHJhaW4oKTtcblx0fVxuXG5cdHB1YmxpYyBmbHVzaCgpOiB2b2lkIHtcblx0XHQvLyBmbHVzaFxuXHRcdHRoaXMuX3dyaXRlTm93KCk7XG5cdH1cblxuXHRwdWJsaWMgcGF1c2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNQYXVzZWQgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIHJlc3VtZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1BhdXNlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3NjaGVkdWxlV3JpdGluZygpO1xuXHR9XG5cblx0cHVibGljIHdyaXRlKG1zZzogUHJvdG9jb2xNZXNzYWdlKSB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdC8vIGlnbm9yZTogdGhlcmUgY291bGQgYmUgbGVmdC1vdmVyIHByb21pc2VzIHdoaWNoIGNvbXBsZXRlIGFuZCB0aGVuXG5cdFx0XHQvLyBkZWNpZGUgdG8gd3JpdGUgYSByZXNwb25zZSwgZXRjLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdG1zZy53cml0dGVuVGltZSA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5sYXN0V3JpdGVUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBoZWFkZXIgPSBWU0J1ZmZlci5hbGxvYyhQcm90b2NvbENvbnN0YW50cy5IZWFkZXJMZW5ndGgpO1xuXHRcdGhlYWRlci53cml0ZVVJbnQ4KG1zZy50eXBlLCAwKTtcblx0XHRoZWFkZXIud3JpdGVVSW50MzJCRShtc2cuaWQsIDEpO1xuXHRcdGhlYWRlci53cml0ZVVJbnQzMkJFKG1zZy5hY2ssIDUpO1xuXHRcdGhlYWRlci53cml0ZVVJbnQzMkJFKG1zZy5kYXRhLmJ5dGVMZW5ndGgsIDkpO1xuXG5cdFx0dGhpcy5fc29ja2V0LnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuUHJvdG9jb2xIZWFkZXJXcml0ZSwgeyBtZXNzYWdlVHlwZTogcHJvdG9jb2xNZXNzYWdlVHlwZVRvU3RyaW5nKG1zZy50eXBlKSwgaWQ6IG1zZy5pZCwgYWNrOiBtc2cuYWNrLCBtZXNzYWdlU2l6ZTogbXNnLmRhdGEuYnl0ZUxlbmd0aCB9KTtcblx0XHR0aGlzLl9zb2NrZXQudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Qcm90b2NvbE1lc3NhZ2VXcml0ZSwgbXNnLmRhdGEpO1xuXG5cdFx0dGhpcy5fd3JpdGVTb29uKGhlYWRlciwgbXNnLmRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVmZmVyQWRkKGhlYWQ6IFZTQnVmZmVyLCBib2R5OiBWU0J1ZmZlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdhc0VtcHR5ID0gdGhpcy5fdG90YWxMZW5ndGggPT09IDA7XG5cdFx0dGhpcy5fZGF0YS5wdXNoKGhlYWQsIGJvZHkpO1xuXHRcdHRoaXMuX3RvdGFsTGVuZ3RoICs9IGhlYWQuYnl0ZUxlbmd0aCArIGJvZHkuYnl0ZUxlbmd0aDtcblx0XHRyZXR1cm4gd2FzRW1wdHk7XG5cdH1cblxuXHRwcml2YXRlIF9idWZmZXJUYWtlKCk6IFZTQnVmZmVyIHtcblx0XHRjb25zdCByZXQgPSBWU0J1ZmZlci5jb25jYXQodGhpcy5fZGF0YSwgdGhpcy5fdG90YWxMZW5ndGgpO1xuXHRcdHRoaXMuX2RhdGEubGVuZ3RoID0gMDtcblx0XHR0aGlzLl90b3RhbExlbmd0aCA9IDA7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlU29vbihoZWFkZXI6IFZTQnVmZmVyLCBkYXRhOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9idWZmZXJBZGQoaGVhZGVyLCBkYXRhKSkge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVXcml0aW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd3JpdGVOb3dUaW1lb3V0OiBUaW1lb3V0IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3NjaGVkdWxlV3JpdGluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3JpdGVOb3dUaW1lb3V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3dyaXRlTm93VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fd3JpdGVOb3dUaW1lb3V0ID0gbnVsbDtcblx0XHRcdHRoaXMuX3dyaXRlTm93KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZU5vdygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdG90YWxMZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzUGF1c2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9idWZmZXJUYWtlKCk7XG5cdFx0dGhpcy5fc29ja2V0LnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuUHJvdG9jb2xXcml0ZSwgeyBieXRlTGVuZ3RoOiBkYXRhLmJ5dGVMZW5ndGggfSk7XG5cdFx0dGhpcy5fc29ja2V0LndyaXRlKGRhdGEpO1xuXHR9XG59XG5cbi8qKlxuICogQSBtZXNzYWdlIGhhcyB0aGUgZm9sbG93aW5nIGZvcm1hdDpcbiAqIGBgYFxuICogICAgIC8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLVxcXG4gKiAgICAgfCAgICAgICAgICAgICBIRUFERVIgICAgICAgICAgICB8ICAgICAgfFxuICogICAgIHwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfCBEQVRBIHxcbiAqICAgICB8IFRZUEUgfCBJRCB8IEFDSyB8IERBVEFfTEVOR1RIIHwgICAgICB8XG4gKiAgICAgXFwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS9cbiAqIGBgYFxuICogVGhlIGhlYWRlciBpcyA5IGJ5dGVzIGFuZCBjb25zaXN0cyBvZjpcbiAqICAtIFRZUEUgaXMgMSBieXRlIChQcm90b2NvbE1lc3NhZ2VUeXBlKSAtIHRoZSBtZXNzYWdlIHR5cGVcbiAqICAtIElEIGlzIDQgYnl0ZXMgKHUzMmJlKSAtIHRoZSBtZXNzYWdlIGlkIChjYW4gYmUgMCB0byBpbmRpY2F0ZSB0byBiZSBpZ25vcmVkKVxuICogIC0gQUNLIGlzIDQgYnl0ZXMgKHUzMmJlKSAtIHRoZSBhY2tub3dsZWRnZWQgbWVzc2FnZSBpZCAoY2FuIGJlIDAgdG8gaW5kaWNhdGUgdG8gYmUgaWdub3JlZClcbiAqICAtIERBVEFfTEVOR1RIIGlzIDQgYnl0ZXMgKHUzMmJlKSAtIHRoZSBsZW5ndGggaW4gYnl0ZXMgb2YgREFUQVxuICpcbiAqIE9ubHkgUmVndWxhciBtZXNzYWdlcyBhcmUgY291bnRlZCwgb3RoZXIgbWVzc2FnZXMgYXJlIG5vdCBjb3VudGVkLCBub3IgYWNrbm93bGVkZ2VkLlxuICovXG5leHBvcnQgY2xhc3MgUHJvdG9jb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wge1xuXG5cdHByaXZhdGUgX3NvY2tldDogSVNvY2tldDtcblx0cHJpdmF0ZSBfc29ja2V0V3JpdGVyOiBQcm90b2NvbFdyaXRlcjtcblx0cHJpdmF0ZSBfc29ja2V0UmVhZGVyOiBQcm90b2NvbFJlYWRlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxWU0J1ZmZlcj4oKSk7XG5cdHJlYWRvbmx5IG9uTWVzc2FnZTogRXZlbnQ8VlNCdWZmZXI+ID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHNvY2tldDogSVNvY2tldCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc29ja2V0ID0gc29ja2V0O1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm90b2NvbFdyaXRlcih0aGlzLl9zb2NrZXQpKTtcblx0XHR0aGlzLl9zb2NrZXRSZWFkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvdG9jb2xSZWFkZXIodGhpcy5fc29ja2V0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zb2NrZXRSZWFkZXIub25NZXNzYWdlKChtc2cpID0+IHtcblx0XHRcdGlmIChtc2cudHlwZSA9PT0gUHJvdG9jb2xNZXNzYWdlVHlwZS5SZWd1bGFyKSB7XG5cdFx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKG1zZy5kYXRhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zb2NrZXQub25DbG9zZSgoKSA9PiB0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpKSk7XG5cdH1cblxuXHRkcmFpbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc29ja2V0V3JpdGVyLmRyYWluKCk7XG5cdH1cblxuXHRnZXRTb2NrZXQoKTogSVNvY2tldCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvY2tldDtcblx0fVxuXG5cdHNlbmREaXNjb25uZWN0KCk6IHZvaWQge1xuXHRcdC8vIE5vdGhpbmcgdG8gZG8uLi5cblx0fVxuXG5cdHNlbmQoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuUmVndWxhciwgMCwgMCwgYnVmZmVyKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENsaWVudDxUQ29udGV4dCA9IHN0cmluZz4gZXh0ZW5kcyBJUENDbGllbnQ8VENvbnRleHQ+IHtcblxuXHRzdGF0aWMgZnJvbVNvY2tldDxUQ29udGV4dCA9IHN0cmluZz4oc29ja2V0OiBJU29ja2V0LCBpZDogVENvbnRleHQpOiBDbGllbnQ8VENvbnRleHQ+IHtcblx0XHRyZXR1cm4gbmV3IENsaWVudChuZXcgUHJvdG9jb2woc29ja2V0KSwgaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkRGlzcG9zZSgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLnByb3RvY29sLm9uRGlkRGlzcG9zZTsgfVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcHJvdG9jb2w6IFByb3RvY29sIHwgUGVyc2lzdGVudFByb3RvY29sLCBpZDogVENvbnRleHQsIGlwY0xvZ2dlcjogSUlQQ0xvZ2dlciB8IG51bGwgPSBudWxsKSB7XG5cdFx0c3VwZXIocHJvdG9jb2wsIGlkLCBpcGNMb2dnZXIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gdGhpcy5wcm90b2NvbC5nZXRTb2NrZXQoKTtcblx0XHQvLyBzaG91bGQgYmUgc2VudCBncmFjZWZ1bGx5IHdpdGggYSAuZmx1c2goKSwgYnV0IHRyeSB0byBzZW5kIGl0IG91dCBhcyBhXG5cdFx0Ly8gbGFzdCByZXNvcnQgaGVyZSBpZiBub3RoaW5nIGVsc2U6XG5cdFx0dGhpcy5wcm90b2NvbC5zZW5kRGlzY29ubmVjdCgpO1xuXHRcdHRoaXMucHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdHNvY2tldC5lbmQoKTtcblx0fVxufVxuXG4vKipcbiAqIFdpbGwgZW5zdXJlIG5vIG1lc3NhZ2VzIGFyZSBsb3N0IGlmIHRoZXJlIGFyZSBubyBldmVudCBsaXN0ZW5lcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBCdWZmZXJlZEVtaXR0ZXI8VD4ge1xuXHRwcml2YXRlIF9lbWl0dGVyOiBFbWl0dGVyPFQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgZXZlbnQ6IEV2ZW50PFQ+O1xuXG5cdHByaXZhdGUgX2hhc0xpc3RlbmVycyA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0RlbGl2ZXJpbmdNZXNzYWdlcyA9IGZhbHNlO1xuXHRwcml2YXRlIF9idWZmZXJlZE1lc3NhZ2VzOiBUW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9lbWl0dGVyID0gbmV3IEVtaXR0ZXI8VD4oe1xuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9oYXNMaXN0ZW5lcnMgPSB0cnVlO1xuXHRcdFx0XHQvLyBpdCBpcyBpbXBvcnRhbnQgdG8gZGVsaXZlciB0aGVzZSBtZXNzYWdlcyBhZnRlciB0aGlzIGNhbGwsIGJ1dCBiZWZvcmVcblx0XHRcdFx0Ly8gb3RoZXIgbWVzc2FnZXMgaGF2ZSBhIGNoYW5jZSB0byBiZSByZWNlaXZlZCAodG8gZ3VhcmFudGVlIGluIG9yZGVyIGRlbGl2ZXJ5KVxuXHRcdFx0XHQvLyB0aGF0J3Mgd2h5IHdlJ3JlIHVzaW5nIGhlcmUgcXVldWVNaWNyb3Rhc2sgYW5kIG5vdCBvdGhlciB0eXBlcyBvZiB0aW1lb3V0c1xuXHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB0aGlzLl9kZWxpdmVyTWVzc2FnZXMoKSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5faGFzTGlzdGVuZXJzID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmV2ZW50ID0gdGhpcy5fZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgX2RlbGl2ZXJNZXNzYWdlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEZWxpdmVyaW5nTWVzc2FnZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNEZWxpdmVyaW5nTWVzc2FnZXMgPSB0cnVlO1xuXHRcdHdoaWxlICh0aGlzLl9oYXNMaXN0ZW5lcnMgJiYgdGhpcy5fYnVmZmVyZWRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9lbWl0dGVyLmZpcmUodGhpcy5fYnVmZmVyZWRNZXNzYWdlcy5zaGlmdCgpISk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGVsaXZlcmluZ01lc3NhZ2VzID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZmlyZShldmVudDogVCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oYXNMaXN0ZW5lcnMpIHtcblx0XHRcdGlmICh0aGlzLl9idWZmZXJlZE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fYnVmZmVyZWRNZXNzYWdlcy5wdXNoKGV2ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2VtaXR0ZXIuZmlyZShldmVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2J1ZmZlcmVkTWVzc2FnZXMucHVzaChldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZsdXNoQnVmZmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmZlcmVkTWVzc2FnZXMgPSBbXTtcblx0fVxufVxuXG5jbGFzcyBRdWV1ZUVsZW1lbnQ8VD4ge1xuXHRwdWJsaWMgcmVhZG9ubHkgZGF0YTogVDtcblx0cHVibGljIG5leHQ6IFF1ZXVlRWxlbWVudDxUPiB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoZGF0YTogVCkge1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5uZXh0ID0gbnVsbDtcblx0fVxufVxuXG5jbGFzcyBRdWV1ZTxUPiB7XG5cblx0cHJpdmF0ZSBfZmlyc3Q6IFF1ZXVlRWxlbWVudDxUPiB8IG51bGw7XG5cdHByaXZhdGUgX2xhc3Q6IFF1ZXVlRWxlbWVudDxUPiB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fZmlyc3QgPSBudWxsO1xuXHRcdHRoaXMuX2xhc3QgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdGxldCByZXN1bHQgPSAwO1xuXHRcdGxldCBjdXJyZW50ID0gdGhpcy5fZmlyc3Q7XG5cdFx0d2hpbGUgKGN1cnJlbnQpIHtcblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm5leHQ7XG5cdFx0XHRyZXN1bHQrKztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBwZWVrKCk6IFQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2ZpcnN0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ZpcnN0LmRhdGE7XG5cdH1cblxuXHRwdWJsaWMgdG9BcnJheSgpOiBUW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVFtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0bGV0IGl0ID0gdGhpcy5fZmlyc3Q7XG5cdFx0d2hpbGUgKGl0KSB7XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gaXQuZGF0YTtcblx0XHRcdGl0ID0gaXQubmV4dDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBwb3AoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9maXJzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZmlyc3QgPT09IHRoaXMuX2xhc3QpIHtcblx0XHRcdHRoaXMuX2ZpcnN0ID0gbnVsbDtcblx0XHRcdHRoaXMuX2xhc3QgPSBudWxsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9maXJzdCA9IHRoaXMuX2ZpcnN0Lm5leHQ7XG5cdH1cblxuXHRwdWJsaWMgcHVzaChpdGVtOiBUKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5ldyBRdWV1ZUVsZW1lbnQoaXRlbSk7XG5cdFx0aWYgKCF0aGlzLl9maXJzdCkge1xuXHRcdFx0dGhpcy5fZmlyc3QgPSBlbGVtZW50O1xuXHRcdFx0dGhpcy5fbGFzdCA9IGVsZW1lbnQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3QhLm5leHQgPSBlbGVtZW50O1xuXHRcdHRoaXMuX2xhc3QgPSBlbGVtZW50O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMb2FkRXN0aW1hdG9yIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfSElTVE9SWV9MRU5HVEggPSAxMDtcblx0cHJpdmF0ZSBzdGF0aWMgX0lOU1RBTkNFOiBMb2FkRXN0aW1hdG9yIHwgbnVsbCA9IG51bGw7XG5cdHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogTG9hZEVzdGltYXRvciB7XG5cdFx0aWYgKCFMb2FkRXN0aW1hdG9yLl9JTlNUQU5DRSkge1xuXHRcdFx0TG9hZEVzdGltYXRvci5fSU5TVEFOQ0UgPSBuZXcgTG9hZEVzdGltYXRvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gTG9hZEVzdGltYXRvci5fSU5TVEFOQ0U7XG5cdH1cblxuXHRwcml2YXRlIGxhc3RSdW5zOiBudW1iZXJbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLmxhc3RSdW5zID0gW107XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IExvYWRFc3RpbWF0b3IuX0hJU1RPUllfTEVOR1RIOyBpKyspIHtcblx0XHRcdHRoaXMubGFzdFJ1bnNbaV0gPSBub3cgLSAxMDAwICogaTtcblx0XHR9XG5cdFx0c2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IExvYWRFc3RpbWF0b3IuX0hJU1RPUllfTEVOR1RIOyBpID49IDE7IGktLSkge1xuXHRcdFx0XHR0aGlzLmxhc3RSdW5zW2ldID0gdGhpcy5sYXN0UnVuc1tpIC0gMV07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxhc3RSdW5zWzBdID0gRGF0ZS5ub3coKTtcblx0XHR9LCAxMDAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiByZXR1cm5zIGFuIGVzdGltYXRpdmUgbnVtYmVyLCBmcm9tIDAgKGxvdyBsb2FkKSB0byAxIChoaWdoIGxvYWQpXG5cdCAqL1xuXHRwcml2YXRlIGxvYWQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IGhpc3RvcnlMaW1pdCA9ICgxICsgTG9hZEVzdGltYXRvci5fSElTVE9SWV9MRU5HVEgpICogMTAwMDtcblx0XHRsZXQgc2NvcmUgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTG9hZEVzdGltYXRvci5fSElTVE9SWV9MRU5HVEg7IGkrKykge1xuXHRcdFx0aWYgKG5vdyAtIHRoaXMubGFzdFJ1bnNbaV0gPD0gaGlzdG9yeUxpbWl0KSB7XG5cdFx0XHRcdHNjb3JlKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAxIC0gc2NvcmUgLyBMb2FkRXN0aW1hdG9yLl9ISVNUT1JZX0xFTkdUSDtcblx0fVxuXG5cdHB1YmxpYyBoYXNIaWdoTG9hZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5sb2FkKCkgPj0gMC41O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvYWRFc3RpbWF0b3Ige1xuXHRoYXNIaWdoTG9hZCgpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBlcnNpc3RlbnRQcm90b2NvbE9wdGlvbnMge1xuXHQvKipcblx0ICogVGhlIHNvY2tldCB0byB1c2UuXG5cdCAqL1xuXHRzb2NrZXQ6IElTb2NrZXQ7XG5cdC8qKlxuXHQgKiBUaGUgaW5pdGlhbCBjaHVuayBvZiBkYXRhIHRoYXQgaGFzIGFscmVhZHkgYmVlbiByZWNlaXZlZCBmcm9tIHRoZSBzb2NrZXQuXG5cdCAqL1xuXHRpbml0aWFsQ2h1bms/OiBWU0J1ZmZlciB8IG51bGw7XG5cdC8qKlxuXHQgKiBUaGUgQ1BVIGxvYWQgZXN0aW1hdG9yIHRvIHVzZS5cblx0ICovXG5cdGxvYWRFc3RpbWF0b3I/OiBJTG9hZEVzdGltYXRvcjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gc2VuZCBrZWVwIGFsaXZlIG1lc3NhZ2VzLiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2VuZEtlZXBBbGl2ZT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogU2FtZSBhcyBQcm90b2NvbCwgYnV0IHdpbGwgYWN0dWFsbHkgdHJhY2sgbWVzc2FnZXMgYW5kIGFja3MuXG4gKiBNb3Jlb3ZlciwgaXQgd2lsbCBlbnN1cmUgbm8gbWVzc2FnZXMgYXJlIGxvc3QgaWYgdGhlcmUgYXJlIG5vIGV2ZW50IGxpc3RlbmVycy5cbiAqL1xuZXhwb3J0IGNsYXNzIFBlcnNpc3RlbnRQcm90b2NvbCBpbXBsZW1lbnRzIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblxuXHRwcml2YXRlIF9pc1JlY29ubmVjdGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfZGlkU2VuZERpc2Nvbm5lY3Q/OiBib29sZWFuO1xuXG5cdHByaXZhdGUgX291dGdvaW5nVW5hY2tNc2c6IFF1ZXVlPFByb3RvY29sTWVzc2FnZT47XG5cdHByaXZhdGUgX291dGdvaW5nTXNnSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfb3V0Z29pbmdBY2tJZDogbnVtYmVyO1xuXHRwcml2YXRlIF9vdXRnb2luZ0Fja1RpbWVvdXQ6IFRpbWVvdXQgfCBudWxsO1xuXG5cdHByaXZhdGUgX2luY29taW5nTXNnSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfaW5jb21pbmdBY2tJZDogbnVtYmVyO1xuXHRwcml2YXRlIF9pbmNvbWluZ01zZ0xhc3RUaW1lOiBudW1iZXI7XG5cdHByaXZhdGUgX2luY29taW5nQWNrVGltZW91dDogVGltZW91dCB8IG51bGw7XG5cblx0cHJpdmF0ZSBfa2VlcEFsaXZlSW50ZXJ2YWw6IFRpbWVvdXQgfCBudWxsO1xuXG5cdHByaXZhdGUgX2xhc3RSZXBsYXlSZXF1ZXN0VGltZTogbnVtYmVyO1xuXHRwcml2YXRlIF9sYXN0U29ja2V0VGltZW91dFRpbWU6IG51bWJlcjtcblxuXHRwcml2YXRlIF9zb2NrZXQ6IElTb2NrZXQ7XG5cdHByaXZhdGUgX3NvY2tldFdyaXRlcjogUHJvdG9jb2xXcml0ZXI7XG5cdHByaXZhdGUgX3NvY2tldFJlYWRlcjogUHJvdG9jb2xSZWFkZXI7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLXBvdGVudGlhbGx5LXVuc2FmZS1kaXNwb3NhYmxlc1xuXHRwcml2YXRlIF9zb2NrZXREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRFc3RpbWF0b3I6IElMb2FkRXN0aW1hdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRTZW5kS2VlcEFsaXZlOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29udHJvbE1lc3NhZ2UgPSBuZXcgQnVmZmVyZWRFbWl0dGVyPFZTQnVmZmVyPigpO1xuXHRyZWFkb25seSBvbkNvbnRyb2xNZXNzYWdlOiBFdmVudDxWU0J1ZmZlcj4gPSB0aGlzLl9vbkNvbnRyb2xNZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IG5ldyBCdWZmZXJlZEVtaXR0ZXI8VlNCdWZmZXI+KCk7XG5cdHJlYWRvbmx5IG9uTWVzc2FnZTogRXZlbnQ8VlNCdWZmZXI+ID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IG5ldyBCdWZmZXJlZEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNvY2tldENsb3NlID0gbmV3IEJ1ZmZlcmVkRW1pdHRlcjxTb2NrZXRDbG9zZUV2ZW50PigpO1xuXHRyZWFkb25seSBvblNvY2tldENsb3NlOiBFdmVudDxTb2NrZXRDbG9zZUV2ZW50PiA9IHRoaXMuX29uU29ja2V0Q2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Tb2NrZXRUaW1lb3V0ID0gbmV3IEJ1ZmZlcmVkRW1pdHRlcjxTb2NrZXRUaW1lb3V0RXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uU29ja2V0VGltZW91dDogRXZlbnQ8U29ja2V0VGltZW91dEV2ZW50PiA9IHRoaXMuX29uU29ja2V0VGltZW91dC5ldmVudDtcblxuXHRwdWJsaWMgZ2V0IHVuYWNrbm93bGVkZ2VkQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fb3V0Z29pbmdNc2dJZCAtIHRoaXMuX291dGdvaW5nQWNrSWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihvcHRzOiBQZXJzaXN0ZW50UHJvdG9jb2xPcHRpb25zKSB7XG5cdFx0dGhpcy5fbG9hZEVzdGltYXRvciA9IG9wdHMubG9hZEVzdGltYXRvciA/PyBMb2FkRXN0aW1hdG9yLmdldEluc3RhbmNlKCk7XG5cdFx0dGhpcy5fc2hvdWxkU2VuZEtlZXBBbGl2ZSA9IG9wdHMuc2VuZEtlZXBBbGl2ZSA/PyB0cnVlO1xuXHRcdHRoaXMuX2lzUmVjb25uZWN0aW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fb3V0Z29pbmdVbmFja01zZyA9IG5ldyBRdWV1ZTxQcm90b2NvbE1lc3NhZ2U+KCk7XG5cdFx0dGhpcy5fb3V0Z29pbmdNc2dJZCA9IDA7XG5cdFx0dGhpcy5fb3V0Z29pbmdBY2tJZCA9IDA7XG5cdFx0dGhpcy5fb3V0Z29pbmdBY2tUaW1lb3V0ID0gbnVsbDtcblxuXHRcdHRoaXMuX2luY29taW5nTXNnSWQgPSAwO1xuXHRcdHRoaXMuX2luY29taW5nQWNrSWQgPSAwO1xuXHRcdHRoaXMuX2luY29taW5nTXNnTGFzdFRpbWUgPSAwO1xuXHRcdHRoaXMuX2luY29taW5nQWNrVGltZW91dCA9IG51bGw7XG5cblx0XHR0aGlzLl9sYXN0UmVwbGF5UmVxdWVzdFRpbWUgPSAwO1xuXHRcdHRoaXMuX2xhc3RTb2NrZXRUaW1lb3V0VGltZSA9IERhdGUubm93KCk7XG5cblx0XHR0aGlzLl9zb2NrZXREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9zb2NrZXQgPSBvcHRzLnNvY2tldDtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIgPSB0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sV3JpdGVyKHRoaXMuX3NvY2tldCkpO1xuXHRcdHRoaXMuX3NvY2tldFJlYWRlciA9IHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmFkZChuZXcgUHJvdG9jb2xSZWFkZXIodGhpcy5fc29ja2V0KSk7XG5cdFx0dGhpcy5fc29ja2V0RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NvY2tldFJlYWRlci5vbk1lc3NhZ2UobXNnID0+IHRoaXMuX3JlY2VpdmVNZXNzYWdlKG1zZykpKTtcblx0XHR0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5hZGQodGhpcy5fc29ja2V0Lm9uQ2xvc2UoZSA9PiB0aGlzLl9vblNvY2tldENsb3NlLmZpcmUoZSkpKTtcblxuXHRcdGlmIChvcHRzLmluaXRpYWxDaHVuaykge1xuXHRcdFx0dGhpcy5fc29ja2V0UmVhZGVyLmFjY2VwdENodW5rKG9wdHMuaW5pdGlhbENodW5rKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2hvdWxkU2VuZEtlZXBBbGl2ZSkge1xuXHRcdFx0dGhpcy5fa2VlcEFsaXZlSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3NlbmRLZWVwQWxpdmUoKTtcblx0XHRcdH0sIFByb3RvY29sQ29uc3RhbnRzLktlZXBBbGl2ZVNlbmRUaW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fa2VlcEFsaXZlSW50ZXJ2YWwgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX291dGdvaW5nQWNrVGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX291dGdvaW5nQWNrVGltZW91dCk7XG5cdFx0XHR0aGlzLl9vdXRnb2luZ0Fja1RpbWVvdXQgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faW5jb21pbmdBY2tUaW1lb3V0KSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5faW5jb21pbmdBY2tUaW1lb3V0KTtcblx0XHRcdHRoaXMuX2luY29taW5nQWNrVGltZW91dCA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9rZWVwQWxpdmVJbnRlcnZhbCkge1xuXHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLl9rZWVwQWxpdmVJbnRlcnZhbCk7XG5cdFx0XHR0aGlzLl9rZWVwQWxpdmVJbnRlcnZhbCA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRyYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zb2NrZXRXcml0ZXIuZHJhaW4oKTtcblx0fVxuXG5cdHNlbmREaXNjb25uZWN0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZGlkU2VuZERpc2Nvbm5lY3QpIHtcblx0XHRcdHRoaXMuX2RpZFNlbmREaXNjb25uZWN0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IG1zZyA9IG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5EaXNjb25uZWN0LCAwLCAwLCBnZXRFbXB0eUJ1ZmZlcigpKTtcblx0XHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShtc2cpO1xuXHRcdFx0dGhpcy5fc29ja2V0V3JpdGVyLmZsdXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFBhdXNlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1zZyA9IG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5QYXVzZSwgMCwgMCwgZ2V0RW1wdHlCdWZmZXIoKSk7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKG1zZyk7XG5cdH1cblxuXHRzZW5kUmVzdW1lKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1zZyA9IG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5SZXN1bWUsIDAsIDAsIGdldEVtcHR5QnVmZmVyKCkpO1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShtc2cpO1xuXHR9XG5cblx0cGF1c2VTb2NrZXRXcml0aW5nKCkge1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlci5wYXVzZSgpO1xuXHR9XG5cblx0cHVibGljIGdldFNvY2tldCgpOiBJU29ja2V0IHtcblx0XHRyZXR1cm4gdGhpcy5fc29ja2V0O1xuXHR9XG5cblx0cHVibGljIGdldE1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy5fc29ja2V0UmVhZGVyLmxhc3RSZWFkVGltZTtcblx0fVxuXG5cdHB1YmxpYyBiZWdpbkFjY2VwdFJlY29ubmVjdGlvbihzb2NrZXQ6IElTb2NrZXQsIGluaXRpYWxEYXRhQ2h1bms6IFZTQnVmZmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzUmVjb25uZWN0aW5nID0gdHJ1ZTtcblxuXHRcdHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zb2NrZXREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9vbkNvbnRyb2xNZXNzYWdlLmZsdXNoQnVmZmVyKCk7XG5cdFx0dGhpcy5fb25Tb2NrZXRDbG9zZS5mbHVzaEJ1ZmZlcigpO1xuXHRcdHRoaXMuX29uU29ja2V0VGltZW91dC5mbHVzaEJ1ZmZlcigpO1xuXHRcdHRoaXMuX3NvY2tldC5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9sYXN0UmVwbGF5UmVxdWVzdFRpbWUgPSAwO1xuXHRcdHRoaXMuX2xhc3RTb2NrZXRUaW1lb3V0VGltZSA9IERhdGUubm93KCk7XG5cblx0XHR0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyID0gdGhpcy5fc29ja2V0RGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFdyaXRlcih0aGlzLl9zb2NrZXQpKTtcblx0XHR0aGlzLl9zb2NrZXRSZWFkZXIgPSB0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sUmVhZGVyKHRoaXMuX3NvY2tldCkpO1xuXHRcdHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmFkZCh0aGlzLl9zb2NrZXRSZWFkZXIub25NZXNzYWdlKG1zZyA9PiB0aGlzLl9yZWNlaXZlTWVzc2FnZShtc2cpKSk7XG5cdFx0dGhpcy5fc29ja2V0RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NvY2tldC5vbkNsb3NlKGUgPT4gdGhpcy5fb25Tb2NrZXRDbG9zZS5maXJlKGUpKSk7XG5cblx0XHR0aGlzLl9zb2NrZXRSZWFkZXIuYWNjZXB0Q2h1bmsoaW5pdGlhbERhdGFDaHVuayk7XG5cdH1cblxuXHRwdWJsaWMgZW5kQWNjZXB0UmVjb25uZWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzUmVjb25uZWN0aW5nID0gZmFsc2U7XG5cblx0XHQvLyBBZnRlciBhIHJlY29ubmVjdGlvbiwgbGV0IHRoZSBvdGhlciBwYXJ0eSBrbm93IChhZ2Fpbikgd2hpY2ggbWVzc2FnZXMgaGF2ZSBiZWVuIHJlY2VpdmVkLlxuXHRcdC8vIChwZXJoYXBzIHRoZSBvdGhlciBwYXJ0eSBkaWRuJ3QgcmVjZWl2ZSBhIHByZXZpb3VzIEFDSylcblx0XHR0aGlzLl9pbmNvbWluZ0Fja0lkID0gdGhpcy5faW5jb21pbmdNc2dJZDtcblx0XHRjb25zdCBtc2cgPSBuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuQWNrLCAwLCB0aGlzLl9pbmNvbWluZ0Fja0lkLCBnZXRFbXB0eUJ1ZmZlcigpKTtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobXNnKTtcblxuXHRcdC8vIFNlbmQgYWdhaW4gYWxsIHVuYWNrbm93bGVkZ2VkIG1lc3NhZ2VzXG5cdFx0Y29uc3QgdG9TZW5kID0gdGhpcy5fb3V0Z29pbmdVbmFja01zZy50b0FycmF5KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRvU2VuZC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKHRvU2VuZFtpXSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlY3ZBY2tDaGVjaygpO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdERpc2Nvbm5lY3QoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY2VpdmVNZXNzYWdlKG1zZzogUHJvdG9jb2xNZXNzYWdlKTogdm9pZCB7XG5cdFx0aWYgKG1zZy5hY2sgPiB0aGlzLl9vdXRnb2luZ0Fja0lkKSB7XG5cdFx0XHR0aGlzLl9vdXRnb2luZ0Fja0lkID0gbXNnLmFjaztcblx0XHRcdGRvIHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSB0aGlzLl9vdXRnb2luZ1VuYWNrTXNnLnBlZWsoKTtcblx0XHRcdFx0aWYgKGZpcnN0ICYmIGZpcnN0LmlkIDw9IG1zZy5hY2spIHtcblx0XHRcdFx0XHQvLyB0aGlzIG1lc3NhZ2UgaGFzIGJlZW4gY29uZmlybWVkLCByZW1vdmUgaXRcblx0XHRcdFx0XHR0aGlzLl9vdXRnb2luZ1VuYWNrTXNnLnBvcCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlICh0cnVlKTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG1zZy50eXBlKSB7XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuTm9uZToge1xuXHRcdFx0XHQvLyBOL0Fcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUmVndWxhcjoge1xuXHRcdFx0XHRpZiAobXNnLmlkID4gdGhpcy5faW5jb21pbmdNc2dJZCkge1xuXHRcdFx0XHRcdGlmIChtc2cuaWQgIT09IHRoaXMuX2luY29taW5nTXNnSWQgKyAxKSB7XG5cdFx0XHRcdFx0XHQvLyBpbiBjYXNlIHdlIG1pc3NlZCBzb21lIG1lc3NhZ2VzIHdlIGFzayB0aGUgb3RoZXIgcGFydHkgdG8gcmVzZW5kIHRoZW1cblx0XHRcdFx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRcdFx0XHRpZiAobm93IC0gdGhpcy5fbGFzdFJlcGxheVJlcXVlc3RUaW1lID4gMTAwMDApIHtcblx0XHRcdFx0XHRcdFx0Ly8gc2VuZCBhIHJlcGxheSByZXF1ZXN0IGF0IG1vc3Qgb25jZSBldmVyeSAxMHNcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGFzdFJlcGxheVJlcXVlc3RUaW1lID0gbm93O1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobmV3IFByb3RvY29sTWVzc2FnZShQcm90b2NvbE1lc3NhZ2VUeXBlLlJlcGxheVJlcXVlc3QsIDAsIDAsIGdldEVtcHR5QnVmZmVyKCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5faW5jb21pbmdNc2dJZCA9IG1zZy5pZDtcblx0XHRcdFx0XHRcdHRoaXMuX2luY29taW5nTXNnTGFzdFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VuZEFja0NoZWNrKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZShtc2cuZGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLkNvbnRyb2w6IHtcblx0XHRcdFx0dGhpcy5fb25Db250cm9sTWVzc2FnZS5maXJlKG1zZy5kYXRhKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuQWNrOiB7XG5cdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG8sIC5hY2sgaXMgaGFuZGxlZCBhYm92ZSBhbHJlYWR5XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLkRpc2Nvbm5lY3Q6IHtcblx0XHRcdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUmVwbGF5UmVxdWVzdDoge1xuXHRcdFx0XHQvLyBTZW5kIGFnYWluIGFsbCB1bmFja25vd2xlZGdlZCBtZXNzYWdlc1xuXHRcdFx0XHRjb25zdCB0b1NlbmQgPSB0aGlzLl9vdXRnb2luZ1VuYWNrTXNnLnRvQXJyYXkoKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRvU2VuZC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZSh0b1NlbmRbaV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlY3ZBY2tDaGVjaygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5QYXVzZToge1xuXHRcdFx0XHR0aGlzLl9zb2NrZXRXcml0ZXIucGF1c2UoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUmVzdW1lOiB7XG5cdFx0XHRcdHRoaXMuX3NvY2tldFdyaXRlci5yZXN1bWUoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuS2VlcEFsaXZlOiB7XG5cdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVhZEVudGlyZUJ1ZmZlcigpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvY2tldFJlYWRlci5yZWFkRW50aXJlQnVmZmVyKCk7XG5cdH1cblxuXHRmbHVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIuZmx1c2goKTtcblx0fVxuXG5cdHNlbmQoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdGNvbnN0IG15SWQgPSArK3RoaXMuX291dGdvaW5nTXNnSWQ7XG5cdFx0dGhpcy5faW5jb21pbmdBY2tJZCA9IHRoaXMuX2luY29taW5nTXNnSWQ7XG5cdFx0Y29uc3QgbXNnID0gbmV3IFByb3RvY29sTWVzc2FnZShQcm90b2NvbE1lc3NhZ2VUeXBlLlJlZ3VsYXIsIG15SWQsIHRoaXMuX2luY29taW5nQWNrSWQsIGJ1ZmZlcik7XG5cdFx0dGhpcy5fb3V0Z29pbmdVbmFja01zZy5wdXNoKG1zZyk7XG5cdFx0aWYgKCF0aGlzLl9pc1JlY29ubmVjdGluZykge1xuXHRcdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKG1zZyk7XG5cdFx0XHR0aGlzLl9yZWN2QWNrQ2hlY2soKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBhIG1lc3NhZ2Ugd2hpY2ggd2lsbCBub3QgYmUgcGFydCBvZiB0aGUgcmVndWxhciBhY2tub3dsZWRnZSBmbG93LlxuXHQgKiBVc2UgdGhpcyBmb3IgZWFybHkgY29udHJvbCBtZXNzYWdlcyB3aGljaCBhcmUgcmVwZWF0ZWQgaW4gY2FzZSBvZiByZWNvbm5lY3Rpb24uXG5cdCAqL1xuXHRzZW5kQ29udHJvbChidWZmZXI6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgbXNnID0gbmV3IFByb3RvY29sTWVzc2FnZShQcm90b2NvbE1lc3NhZ2VUeXBlLkNvbnRyb2wsIDAsIDAsIGJ1ZmZlcik7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKG1zZyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kQWNrQ2hlY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luY29taW5nTXNnSWQgPD0gdGhpcy5faW5jb21pbmdBY2tJZCkge1xuXHRcdFx0Ly8gbm90aGluayB0byBhY2tub3dsZWRnZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pbmNvbWluZ0Fja1RpbWVvdXQpIHtcblx0XHRcdC8vIHRoZXJlIHdpbGwgYmUgYSBjaGVjayBpbiB0aGUgbmVhciBmdXR1cmVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0aW1lU2luY2VMYXN0SW5jb21pbmdNc2cgPSBEYXRlLm5vdygpIC0gdGhpcy5faW5jb21pbmdNc2dMYXN0VGltZTtcblx0XHRpZiAodGltZVNpbmNlTGFzdEluY29taW5nTXNnID49IFByb3RvY29sQ29uc3RhbnRzLkFja25vd2xlZGdlVGltZSkge1xuXHRcdFx0Ly8gc3VmZmljaWVudCB0aW1lIGhhcyBwYXNzZWQgc2luY2UgdGhpcyBtZXNzYWdlIGhhcyBiZWVuIHJlY2VpdmVkLFxuXHRcdFx0Ly8gYW5kIG5vIG1lc3NhZ2UgZnJvbSBvdXIgc2lkZSBuZWVkZWQgdG8gYmUgc2VudCBpbiB0aGUgbWVhbnRpbWUsXG5cdFx0XHQvLyBzbyB3ZSB3aWxsIHNlbmQgYSBtZXNzYWdlIGNvbnRhaW5pbmcgb25seSBhbiBhY2suXG5cdFx0XHR0aGlzLl9zZW5kQWNrKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5jb21pbmdBY2tUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pbmNvbWluZ0Fja1RpbWVvdXQgPSBudWxsO1xuXHRcdFx0dGhpcy5fc2VuZEFja0NoZWNrKCk7XG5cdFx0fSwgUHJvdG9jb2xDb25zdGFudHMuQWNrbm93bGVkZ2VUaW1lIC0gdGltZVNpbmNlTGFzdEluY29taW5nTXNnICsgNSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWN2QWNrQ2hlY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX291dGdvaW5nTXNnSWQgPD0gdGhpcy5fb3V0Z29pbmdBY2tJZCkge1xuXHRcdFx0Ly8gZXZlcnl0aGluZyBoYXMgYmVlbiBhY2tub3dsZWRnZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fb3V0Z29pbmdBY2tUaW1lb3V0KSB7XG5cdFx0XHQvLyB0aGVyZSB3aWxsIGJlIGEgY2hlY2sgaW4gdGhlIG5lYXIgZnV0dXJlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzUmVjb25uZWN0aW5nKSB7XG5cdFx0XHQvLyBkbyBub3QgY2F1c2UgYSB0aW1lb3V0IGR1cmluZyByZWNvbm5lY3Rpb24sXG5cdFx0XHQvLyBiZWNhdXNlIG1lc3NhZ2VzIHdpbGwgbm90IGJlIGFjdHVhbGx5IHdyaXR0ZW4gdW50aWwgYGVuZEFjY2VwdFJlY29ubmVjdGlvbmBcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRlc3RVbmFja25vd2xlZGdlZE1zZyA9IHRoaXMuX291dGdvaW5nVW5hY2tNc2cucGVlaygpITtcblx0XHRjb25zdCB0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZyA9IERhdGUubm93KCkgLSBvbGRlc3RVbmFja25vd2xlZGdlZE1zZy53cml0dGVuVGltZTtcblx0XHRjb25zdCB0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YSA9IERhdGUubm93KCkgLSB0aGlzLl9zb2NrZXRSZWFkZXIubGFzdFJlYWRUaW1lO1xuXHRcdGNvbnN0IHRpbWVTaW5jZUxhc3RUaW1lb3V0ID0gRGF0ZS5ub3coKSAtIHRoaXMuX2xhc3RTb2NrZXRUaW1lb3V0VGltZTtcblxuXHRcdGlmIChcblx0XHRcdHRpbWVTaW5jZU9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnID49IFByb3RvY29sQ29uc3RhbnRzLlRpbWVvdXRUaW1lXG5cdFx0XHQmJiB0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YSA+PSBQcm90b2NvbENvbnN0YW50cy5UaW1lb3V0VGltZVxuXHRcdFx0JiYgdGltZVNpbmNlTGFzdFRpbWVvdXQgPj0gUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWVcblx0XHQpIHtcblx0XHRcdC8vIEl0J3MgYmVlbiBhIGxvbmcgdGltZSBzaW5jZSBvdXIgc2VudCBtZXNzYWdlIHdhcyBhY2tub3dsZWRnZWRcblx0XHRcdC8vIGFuZCBhIGxvbmcgdGltZSBzaW5jZSB3ZSByZWNlaXZlZCBzb21lIGRhdGFcblxuXHRcdFx0Ly8gQnV0IHRoaXMgbWlnaHQgYmUgY2F1c2VkIGJ5IHRoZSBldmVudCBsb29wIGJlaW5nIGJ1c3kgYW5kIGZhaWxpbmcgdG8gcmVhZCBtZXNzYWdlc1xuXHRcdFx0aWYgKCF0aGlzLl9sb2FkRXN0aW1hdG9yLmhhc0hpZ2hMb2FkKCkpIHtcblx0XHRcdFx0Ly8gVHJhc2ggdGhlIHNvY2tldFxuXHRcdFx0XHR0aGlzLl9sYXN0U29ja2V0VGltZW91dFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHR0aGlzLl9vblNvY2tldFRpbWVvdXQuZmlyZSh7XG5cdFx0XHRcdFx0cmVhc29uOiBTb2NrZXRUaW1lb3V0UmVhc29uLlVOQUNLTk9XTEVER0VEX01FU1NBR0UsXG5cdFx0XHRcdFx0dW5hY2tub3dsZWRnZWRNc2dDb3VudDogdGhpcy5fb3V0Z29pbmdVbmFja01zZy5sZW5ndGgoKSxcblx0XHRcdFx0XHR0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZyxcblx0XHRcdFx0XHR0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1pbmltdW1UaW1lVW50aWxUaW1lb3V0ID0gTWF0aC5tYXgoXG5cdFx0XHRQcm90b2NvbENvbnN0YW50cy5UaW1lb3V0VGltZSAtIHRpbWVTaW5jZU9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnLFxuXHRcdFx0UHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWUgLSB0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YSxcblx0XHRcdFByb3RvY29sQ29uc3RhbnRzLlRpbWVvdXRUaW1lIC0gdGltZVNpbmNlTGFzdFRpbWVvdXQsXG5cdFx0XHQ1MDBcblx0XHQpO1xuXG5cdFx0dGhpcy5fb3V0Z29pbmdBY2tUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vdXRnb2luZ0Fja1RpbWVvdXQgPSBudWxsO1xuXHRcdFx0dGhpcy5fcmVjdkFja0NoZWNrKCk7XG5cdFx0fSwgbWluaW11bVRpbWVVbnRpbFRpbWVvdXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBhZnRlciBzZW5kaW5nIGEga2VlcGFsaXZlLiBCb3RoIHNpZGVzIG9mIHRoaXMgcHJvdG9jb2wgc2VuZFxuXHQgKiBrZWVwYWxpdmVzIGV2ZXJ5IEtlZXBBbGl2ZVNlbmRUaW1lICg1cyksIHNvIHJlY2VpdmluZyBubyBkYXRhIGZvclxuXHQgKiBUaW1lb3V0VGltZSAoMjBzKSBtZWFucyB0aGUgY29ubmVjdGlvbiBpcyBkZWFkLiBUaGlzIGNhdGNoZXMgc2lsZW50XG5cdCAqIGNvbm5lY3Rpb24gZGVhdGhzIHRoYXQgX3JlY3ZBY2tDaGVjayBjYW5ub3QgZGV0ZWN0IGJlY2F1c2UgdGhlcmUgYXJlXG5cdCAqIG5vIHVuYWNrbm93bGVkZ2VkIHJlZ3VsYXIgbWVzc2FnZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9rZWVwQWxpdmVUaW1lb3V0Q2hlY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCB0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YSA9IG5vdyAtIHRoaXMuX3NvY2tldFJlYWRlci5sYXN0UmVhZFRpbWU7XG5cdFx0Y29uc3QgdGltZVNpbmNlTGFzdFRpbWVvdXQgPSBub3cgLSB0aGlzLl9sYXN0U29ja2V0VGltZW91dFRpbWU7XG5cblx0XHRpZiAoXG5cdFx0XHR0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YSA+PSBQcm90b2NvbENvbnN0YW50cy5UaW1lb3V0VGltZVxuXHRcdFx0JiYgdGltZVNpbmNlTGFzdFRpbWVvdXQgPj0gUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWVcblx0XHQpIHtcblx0XHRcdC8vIEJ1dCB0aGlzIG1pZ2h0IGJlIGNhdXNlZCBieSB0aGUgZXZlbnQgbG9vcCBiZWluZyBidXN5IGFuZCBmYWlsaW5nIHRvIHJlYWQgbWVzc2FnZXNcblx0XHRcdGlmICghdGhpcy5fbG9hZEVzdGltYXRvci5oYXNIaWdoTG9hZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RTb2NrZXRUaW1lb3V0VGltZSA9IG5vdztcblx0XHRcdFx0Y29uc3QgdW5hY2tub3dsZWRnZWRNc2dDb3VudCA9IHRoaXMuX291dGdvaW5nVW5hY2tNc2cubGVuZ3RoKCk7XG5cdFx0XHRcdGNvbnN0IG9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnID0gdGhpcy5fb3V0Z29pbmdVbmFja01zZy5wZWVrKCk7XG5cdFx0XHRcdHRoaXMuX29uU29ja2V0VGltZW91dC5maXJlKHtcblx0XHRcdFx0XHRyZWFzb246IFNvY2tldFRpbWVvdXRSZWFzb24uS0VFUF9BTElWRSxcblx0XHRcdFx0XHR1bmFja25vd2xlZGdlZE1zZ0NvdW50LFxuXHRcdFx0XHRcdHRpbWVTaW5jZU9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnOiBvbGRlc3RVbmFja25vd2xlZGdlZE1zZyA/IG5vdyAtIG9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnLndyaXR0ZW5UaW1lIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRpbWVTaW5jZUxhc3RSZWNlaXZlZFNvbWVEYXRhXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NlbmRBY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luY29taW5nTXNnSWQgPD0gdGhpcy5faW5jb21pbmdBY2tJZCkge1xuXHRcdFx0Ly8gbm90aGluayB0byBhY2tub3dsZWRnZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2luY29taW5nQWNrSWQgPSB0aGlzLl9pbmNvbWluZ01zZ0lkO1xuXHRcdGNvbnN0IG1zZyA9IG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5BY2ssIDAsIHRoaXMuX2luY29taW5nQWNrSWQsIGdldEVtcHR5QnVmZmVyKCkpO1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShtc2cpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZEtlZXBBbGl2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pbmNvbWluZ0Fja0lkID0gdGhpcy5faW5jb21pbmdNc2dJZDtcblx0XHRjb25zdCBtc2cgPSBuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuS2VlcEFsaXZlLCAwLCB0aGlzLl9pbmNvbWluZ0Fja0lkLCBnZXRFbXB0eUJ1ZmZlcigpKTtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobXNnKTtcblx0XHR0aGlzLl9rZWVwQWxpdmVUaW1lb3V0Q2hlY2soKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQThDLGlCQUFpQjtBQUV4RCxJQUFXLDZCQUFYLGtCQUFXQSxnQ0FBWDtBQUNOLEVBQUFBLDRCQUFBLGFBQVU7QUFDVixFQUFBQSw0QkFBQSxVQUFPO0FBQ1AsRUFBQUEsNEJBQUEsV0FBUTtBQUNSLEVBQUFBLDRCQUFBLFVBQU87QUFDUCxFQUFBQSw0QkFBQSxXQUFRO0FBQ1IsRUFBQUEsNEJBQUEsV0FBUTtBQUVSLEVBQUFBLDRCQUFBLGtDQUErQjtBQUUvQixFQUFBQSw0QkFBQSxxQkFBa0I7QUFDbEIsRUFBQUEsNEJBQUEsaUJBQWM7QUFDZCxFQUFBQSw0QkFBQSxvQkFBaUI7QUFDakIsRUFBQUEsNEJBQUEsa0JBQWU7QUFFZixFQUFBQSw0QkFBQSxzQkFBbUI7QUFDbkIsRUFBQUEsNEJBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLDRCQUFBLDZCQUEwQjtB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S0FBSztBQUFBLE1BQ3BDLHdCQUFnQztBQUFBLE1BQ2hDLHdCQUFnQztBQUFBLE1BQ2hDLHdCQUFnQztBQUFBLE1BQ2hDO0FBQUEsSUFDRDtBQUVBLFNBQUssc0JBQXNCLFdBQVcsTUFBTTtBQUMzQyxXQUFLLHNCQUFzQjtBQUMzQixXQUFLLGNBQWM7QUFBQSxJQUNwQixHQUFHLHVCQUF1QjtBQUFBLEVBQzNCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLHlCQUErQjtBQUN0QyxRQUFJLEtBQUssaUJBQWlCO0FBQ3pCO0FBQUEsSUFDRDtBQUVBLFVBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsVUFBTSxnQ0FBZ0MsTUFBTSxLQUFLLGNBQWM7QUFDL0QsVUFBTSx1QkFBdUIsTUFBTSxLQUFLO0FBRXhDLFFBQ0MsaUNBQWlDLHlCQUM5Qix3QkFBd0IsdUJBQzFCO0FBRUQsVUFBSSxDQUFDLEtBQUssZUFBZSxZQUFZLEdBQUc7QUFDdkMsYUFBSyx5QkFBeUI7QUFDOUIsY0FBTSx5QkFBeUIsS0FBSyxrQkFBa0IsT0FBTztBQUM3RCxjQUFNLDBCQUEwQixLQUFLLGtCQUFrQixLQUFLO0FBQzVELGFBQUssaUJBQWlCLEtBQUs7QUFBQSxVQUMxQixRQUFRO0FBQUEsVUFDUjtBQUFBLFVBQ0Esa0NBQWtDLDBCQUEwQixNQUFNLHdCQUF3QixjQUFjO0FBQUEsVUFDeEc7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQWlCO0FBQ3hCLFFBQUksS0FBSyxrQkFBa0IsS0FBSyxnQkFBZ0I7QUFFL0M7QUFBQSxJQUNEO0FBRUEsU0FBSyxpQkFBaUIsS0FBSztBQUMzQixVQUFNLE1BQU0sSUFBSSxnQkFBZ0IsYUFBeUIsR0FBRyxLQUFLLGdCQUFnQixlQUFlLENBQUM7QUFDakcsU0FBSyxjQUFjLE1BQU0sR0FBRztBQUFBLEVBQzdCO0FBQUEsRUFFUSxpQkFBdUI7QUFDOUIsU0FBSyxpQkFBaUIsS0FBSztBQUMzQixVQUFNLE1BQU0sSUFBSSxnQkFBZ0IsbUJBQStCLEdBQUcsS0FBSyxnQkFBZ0IsZUFBZSxDQUFDO0FBQ3ZHLFNBQUssY0FBYyxNQUFNLEdBQUc7QUFDNUIsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUNEOyIsCiAgIm5hbWVzIjogWyJTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZSIsICJTb2NrZXREaWFnbm9zdGljcyIsICJTb2NrZXRDbG9zZUV2ZW50VHlwZSIsICJTb2NrZXRUaW1lb3V0UmVhc29uIiwgInJlc3VsdCIsICJQcm90b2NvbE1lc3NhZ2VUeXBlIiwgIlByb3RvY29sQ29uc3RhbnRzIl0KfQo=
