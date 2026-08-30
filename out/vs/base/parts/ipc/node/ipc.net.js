import { createHash } from "crypto";
import { createConnection, createServer } from "net";
import { tmpdir } from "os";
import { createDeflateRaw, createInflateRaw } from "zlib";
import { VSBuffer } from "../../../common/buffer.js";
import { onUnexpectedError } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { Disposable } from "../../../common/lifecycle.js";
import { join } from "../../../common/path.js";
import { Platform, platform } from "../../../common/platform.js";
import { generateUuid } from "../../../common/uuid.js";
import { IPCServer } from "../common/ipc.js";
import { ChunkStream, Client, Protocol, SocketCloseEventType, SocketDiagnostics, SocketDiagnosticsEventType } from "../common/ipc.net.js";
function upgradeToISocket(req, socket, {
  debugLabel,
  skipWebSocketFrames = false,
  disableWebSocketCompression = false,
  enableMessageSplitting = true
}) {
  if (req.headers.upgrade === void 0 || req.headers.upgrade.toLowerCase() !== "websocket") {
    socket.end("HTTP/1.1 400 Bad Request");
    return;
  }
  const requestNonce = req.headers["sec-websocket-key"];
  const hash = createHash("sha1");
  hash.update(requestNonce + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
  const responseNonce = hash.digest("base64");
  const responseHeaders = [
    `HTTP/1.1 101 Switching Protocols`,
    `Upgrade: websocket`,
    `Connection: Upgrade`,
    `Sec-WebSocket-Accept: ${responseNonce}`
  ];
  let permessageDeflate = false;
  if (!skipWebSocketFrames && !disableWebSocketCompression && req.headers["sec-websocket-extensions"]) {
    const websocketExtensionOptions = Array.isArray(req.headers["sec-websocket-extensions"]) ? req.headers["sec-websocket-extensions"] : [req.headers["sec-websocket-extensions"]];
    for (const websocketExtensionOption of websocketExtensionOptions) {
      if (/\b((server_max_window_bits)|(server_no_context_takeover)|(client_no_context_takeover))\b/.test(websocketExtensionOption)) {
        continue;
      }
      if (/\b(permessage-deflate)\b/.test(websocketExtensionOption)) {
        permessageDeflate = true;
        responseHeaders.push(`Sec-WebSocket-Extensions: permessage-deflate`);
        break;
      }
      if (/\b(x-webkit-deflate-frame)\b/.test(websocketExtensionOption)) {
        permessageDeflate = true;
        responseHeaders.push(`Sec-WebSocket-Extensions: x-webkit-deflate-frame`);
        break;
      }
    }
  }
  socket.write(responseHeaders.join("\r\n") + "\r\n\r\n");
  socket.setTimeout(0);
  socket.setNoDelay(true);
  if (skipWebSocketFrames) {
    return new NodeSocket(socket, debugLabel);
  } else {
    return new WebSocketNodeSocket(new NodeSocket(socket, debugLabel), permessageDeflate, null, true, enableMessageSplitting);
  }
}
const socketEndTimeoutMs = 3e4;
class NodeSocket {
  constructor(socket, debugLabel = "") {
    this._canWrite = true;
    this.debugLabel = debugLabel;
    this.socket = socket;
    this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: "NodeSocket" });
    this._errorListener = (err) => {
      this.traceSocketEvent(SocketDiagnosticsEventType.Error, { code: err?.code, message: err?.message });
      if (err) {
        if (err.code === "EPIPE") {
          return;
        }
        onUnexpectedError(err);
      }
    };
    this.socket.on("error", this._errorListener);
    this._closeListener = (hadError) => {
      this.traceSocketEvent(SocketDiagnosticsEventType.Close, { hadError });
      this._canWrite = false;
      if (this._endTimeoutHandle) {
        clearTimeout(this._endTimeoutHandle);
      }
    };
    this.socket.on("close", this._closeListener);
    this._endListener = () => {
      this.traceSocketEvent(SocketDiagnosticsEventType.NodeEndReceived);
      this._canWrite = false;
      this._endTimeoutHandle = setTimeout(() => socket.destroy(), socketEndTimeoutMs);
    };
    this.socket.on("end", this._endListener);
  }
  traceSocketEvent(type, data) {
    SocketDiagnostics.traceSocketEvent(this.socket, this.debugLabel, type, data);
  }
  dispose(destroySocket = true) {
    if (this._endTimeoutHandle) {
      clearTimeout(this._endTimeoutHandle);
      this._endTimeoutHandle = void 0;
    }
    this.socket.off("error", this._errorListener);
    this.socket.off("close", this._closeListener);
    this.socket.off("end", this._endListener);
    if (destroySocket) {
      this.socket.destroy();
    }
  }
  onData(_listener) {
    const listener = (buff) => {
      this.traceSocketEvent(SocketDiagnosticsEventType.Read, buff);
      _listener(VSBuffer.wrap(buff));
    };
    this.socket.on("data", listener);
    return {
      dispose: () => this.socket.off("data", listener)
    };
  }
  onClose(listener) {
    const adapter = (hadError) => {
      listener({
        type: SocketCloseEventType.NodeSocketCloseEvent,
        hadError,
        error: void 0
      });
    };
    this.socket.on("close", adapter);
    return {
      dispose: () => this.socket.off("close", adapter)
    };
  }
  onEnd(listener) {
    const adapter = () => {
      listener();
    };
    this.socket.on("end", adapter);
    return {
      dispose: () => this.socket.off("end", adapter)
    };
  }
  write(buffer) {
    if (this.socket.destroyed || !this._canWrite) {
      return;
    }
    try {
      this.traceSocketEvent(SocketDiagnosticsEventType.Write, buffer);
      this.socket.write(buffer.buffer, (err) => {
        if (err) {
          if (err.code === "EPIPE") {
            return;
          }
          onUnexpectedError(err);
        }
      });
    } catch (err) {
      if (err.code === "EPIPE") {
        return;
      }
      onUnexpectedError(err);
    }
  }
  end() {
    this.traceSocketEvent(SocketDiagnosticsEventType.NodeEndSent);
    this.socket.end();
  }
  drain() {
    this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainBegin);
    return new Promise((resolve, reject) => {
      if (this.socket.bufferSize === 0) {
        this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainEnd);
        resolve();
        return;
      }
      const finished = () => {
        this.socket.off("close", finished);
        this.socket.off("end", finished);
        this.socket.off("error", finished);
        this.socket.off("timeout", finished);
        this.socket.off("drain", finished);
        this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainEnd);
        resolve();
      };
      this.socket.on("close", finished);
      this.socket.on("end", finished);
      this.socket.on("error", finished);
      this.socket.on("timeout", finished);
      this.socket.on("drain", finished);
    });
  }
}
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MinHeaderByteSize"] = 2] = "MinHeaderByteSize";
  Constants2[Constants2["MaxWebSocketMessageLength"] = 262144] = "MaxWebSocketMessageLength";
  return Constants2;
})(Constants || {});
var ReadState = /* @__PURE__ */ ((ReadState2) => {
  ReadState2[ReadState2["PeekHeader"] = 1] = "PeekHeader";
  ReadState2[ReadState2["ReadHeader"] = 2] = "ReadHeader";
  ReadState2[ReadState2["ReadBody"] = 3] = "ReadBody";
  ReadState2[ReadState2["Fin"] = 4] = "Fin";
  return ReadState2;
})(ReadState || {});
class WebSocketNodeSocket extends Disposable {
  /**
   * Create a socket which can communicate using WebSocket frames.
   *
   * **NOTE**: When using the permessage-deflate WebSocket extension, if parts of inflating was done
   *  in a different zlib instance, we need to pass all those bytes into zlib, otherwise the inflate
   *  might hit an inflated portion referencing a distance too far back.
   *
   * @param socket The underlying socket
   * @param permessageDeflate Use the permessage-deflate WebSocket extension
   * @param inflateBytes "Seed" zlib inflate with these bytes.
   * @param recordInflateBytes Record all bytes sent to inflate
   */
  constructor(socket, permessageDeflate, inflateBytes, recordInflateBytes, enableMessageSplitting = true) {
    super();
    this._onData = this._register(new Emitter());
    this._onClose = this._register(new Emitter());
    this._isEnded = false;
    this._state = {
      state: 1 /* PeekHeader */,
      readLen: 2 /* MinHeaderByteSize */,
      fin: 0,
      compressed: false,
      firstFrameOfMessage: true,
      mask: 0,
      opcode: 0
    };
    this.socket = socket;
    this._maxSocketMessageLength = enableMessageSplitting ? 262144 /* MaxWebSocketMessageLength */ : Infinity;
    this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: "WebSocketNodeSocket", permessageDeflate, inflateBytesLength: inflateBytes?.byteLength || 0, recordInflateBytes });
    this._flowManager = this._register(new WebSocketFlowManager(
      this,
      permessageDeflate,
      inflateBytes,
      recordInflateBytes,
      this._onData,
      (data, options) => this._write(data, options)
    ));
    this._register(this._flowManager.onError((err) => {
      console.error(err);
      onUnexpectedError(err);
      this._onClose.fire({
        type: SocketCloseEventType.NodeSocketCloseEvent,
        hadError: true,
        error: err
      });
    }));
    this._incomingData = new ChunkStream();
    this._register(this.socket.onData((data) => this._acceptChunk(data)));
    this._register(this.socket.onClose(async (e) => {
      if (this._flowManager.isProcessingReadQueue()) {
        await Event.toPromise(this._flowManager.onDidFinishProcessingReadQueue);
      }
      this._onClose.fire(e);
    }));
  }
  get permessageDeflate() {
    return this._flowManager.permessageDeflate;
  }
  get recordedInflateBytes() {
    return this._flowManager.recordedInflateBytes;
  }
  setRecordInflateBytes(record) {
    this._flowManager.setRecordInflateBytes(record);
  }
  traceSocketEvent(type, data) {
    this.socket.traceSocketEvent(type, data);
  }
  dispose() {
    if (this._flowManager.isProcessingWriteQueue()) {
      this._register(this._flowManager.onDidFinishProcessingWriteQueue(() => {
        this.dispose();
      }));
    } else {
      this.socket.dispose();
      super.dispose();
    }
  }
  onData(listener) {
    return this._onData.event(listener);
  }
  onClose(listener) {
    return this._onClose.event(listener);
  }
  onEnd(listener) {
    return this.socket.onEnd(listener);
  }
  write(buffer) {
    let start = 0;
    while (start < buffer.byteLength) {
      this._flowManager.writeMessage(buffer.slice(start, Math.min(start + this._maxSocketMessageLength, buffer.byteLength)), {
        compressed: true,
        opcode: 2
        /* Binary frame */
      });
      start += this._maxSocketMessageLength;
    }
  }
  _write(buffer, { compressed, opcode }) {
    if (this._isEnded) {
      return;
    }
    this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketWrite, buffer);
    let headerLen = 2 /* MinHeaderByteSize */;
    if (buffer.byteLength < 126) {
      headerLen += 0;
    } else if (buffer.byteLength < 2 ** 16) {
      headerLen += 2;
    } else {
      headerLen += 8;
    }
    const header = VSBuffer.alloc(headerLen);
    const compressedFlag = compressed ? 64 : 0;
    const opcodeFlag = opcode & 15;
    header.writeUInt8(128 | compressedFlag | opcodeFlag, 0);
    if (buffer.byteLength < 126) {
      header.writeUInt8(buffer.byteLength, 1);
    } else if (buffer.byteLength < 2 ** 16) {
      header.writeUInt8(126, 1);
      let offset = 1;
      header.writeUInt8(buffer.byteLength >>> 8 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 0 & 255, ++offset);
    } else {
      header.writeUInt8(127, 1);
      let offset = 1;
      header.writeUInt8(0, ++offset);
      header.writeUInt8(0, ++offset);
      header.writeUInt8(0, ++offset);
      header.writeUInt8(0, ++offset);
      header.writeUInt8(buffer.byteLength >>> 24 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 16 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 8 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 0 & 255, ++offset);
    }
    this.socket.write(VSBuffer.concat([header, buffer]));
  }
  end() {
    this._isEnded = true;
    this.socket.end();
  }
  _acceptChunk(data) {
    if (data.byteLength === 0) {
      return;
    }
    this._incomingData.acceptChunk(data);
    while (this._incomingData.byteLength >= this._state.readLen) {
      if (this._state.state === 1 /* PeekHeader */) {
        const peekHeader = this._incomingData.peek(this._state.readLen);
        const firstByte = peekHeader.readUInt8(0);
        const finBit = (firstByte & 128) >>> 7;
        const rsv1Bit = (firstByte & 64) >>> 6;
        const opcode = firstByte & 15;
        const secondByte = peekHeader.readUInt8(1);
        const hasMask = (secondByte & 128) >>> 7;
        const len = secondByte & 127;
        this._state.state = 2 /* ReadHeader */;
        this._state.readLen = 2 /* MinHeaderByteSize */ + (hasMask ? 4 : 0) + (len === 126 ? 2 : 0) + (len === 127 ? 8 : 0);
        this._state.fin = finBit;
        if (this._state.firstFrameOfMessage) {
          this._state.compressed = Boolean(rsv1Bit);
        }
        this._state.firstFrameOfMessage = Boolean(finBit);
        this._state.mask = 0;
        this._state.opcode = opcode;
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader, { headerSize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, opcode: this._state.opcode });
      } else if (this._state.state === 2 /* ReadHeader */) {
        const header = this._incomingData.read(this._state.readLen);
        const secondByte = header.readUInt8(1);
        const hasMask = (secondByte & 128) >>> 7;
        let len = secondByte & 127;
        let offset = 1;
        if (len === 126) {
          len = header.readUInt8(++offset) * 2 ** 8 + header.readUInt8(++offset);
        } else if (len === 127) {
          len = header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 2 ** 24 + header.readUInt8(++offset) * 2 ** 16 + header.readUInt8(++offset) * 2 ** 8 + header.readUInt8(++offset);
        }
        let mask = 0;
        if (hasMask) {
          mask = header.readUInt8(++offset) * 2 ** 24 + header.readUInt8(++offset) * 2 ** 16 + header.readUInt8(++offset) * 2 ** 8 + header.readUInt8(++offset);
        }
        this._state.state = 3 /* ReadBody */;
        this._state.readLen = len;
        this._state.mask = mask;
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader, { bodySize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, mask: this._state.mask, opcode: this._state.opcode });
      } else if (this._state.state === 3 /* ReadBody */) {
        const body = this._incomingData.read(this._state.readLen);
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketReadData, body);
        unmask(body, this._state.mask);
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketUnmaskedData, body);
        this._state.state = 1 /* PeekHeader */;
        this._state.readLen = 2 /* MinHeaderByteSize */;
        this._state.mask = 0;
        if (this._state.opcode <= 2) {
          this._flowManager.acceptFrame(body, this._state.compressed, !!this._state.fin);
        } else if (this._state.opcode === 9) {
          this._flowManager.writeMessage(body, {
            compressed: false,
            opcode: 10
            /* Pong frame */
          });
        }
      }
    }
  }
  async drain() {
    this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketDrainBegin);
    if (this._flowManager.isProcessingWriteQueue()) {
      await Event.toPromise(this._flowManager.onDidFinishProcessingWriteQueue);
    }
    await this.socket.drain();
    this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketDrainEnd);
  }
}
class WebSocketFlowManager extends Disposable {
  constructor(_tracer, permessageDeflate, inflateBytes, recordInflateBytes, _onData, _writeFn) {
    super();
    this._tracer = _tracer;
    this._onData = _onData;
    this._writeFn = _writeFn;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._writeQueue = [];
    this._readQueue = [];
    this._onDidFinishProcessingReadQueue = this._register(new Emitter());
    this.onDidFinishProcessingReadQueue = this._onDidFinishProcessingReadQueue.event;
    this._onDidFinishProcessingWriteQueue = this._register(new Emitter());
    this.onDidFinishProcessingWriteQueue = this._onDidFinishProcessingWriteQueue.event;
    this._isProcessingWriteQueue = false;
    this._isProcessingReadQueue = false;
    if (permessageDeflate) {
      this._zlibInflateStream = this._register(new ZlibInflateStream(this._tracer, recordInflateBytes, inflateBytes, { windowBits: 15 }));
      this._zlibDeflateStream = this._register(new ZlibDeflateStream(this._tracer, { windowBits: 15 }));
      this._register(this._zlibInflateStream.onError((err) => this._onError.fire(err)));
      this._register(this._zlibDeflateStream.onError((err) => this._onError.fire(err)));
    } else {
      this._zlibInflateStream = null;
      this._zlibDeflateStream = null;
    }
  }
  get permessageDeflate() {
    return Boolean(this._zlibInflateStream && this._zlibDeflateStream);
  }
  get recordedInflateBytes() {
    if (this._zlibInflateStream) {
      return this._zlibInflateStream.recordedInflateBytes;
    }
    return VSBuffer.alloc(0);
  }
  setRecordInflateBytes(record) {
    this._zlibInflateStream?.setRecordInflateBytes(record);
  }
  writeMessage(data, options) {
    this._writeQueue.push({ data, options });
    this._processWriteQueue();
  }
  async _processWriteQueue() {
    if (this._isProcessingWriteQueue) {
      return;
    }
    this._isProcessingWriteQueue = true;
    while (this._writeQueue.length > 0) {
      const { data, options } = this._writeQueue.shift();
      if (this._zlibDeflateStream && options.compressed) {
        const compressedData = await this._deflateMessage(this._zlibDeflateStream, data);
        this._writeFn(compressedData, options);
      } else {
        this._writeFn(data, { ...options, compressed: false });
      }
    }
    this._isProcessingWriteQueue = false;
    this._onDidFinishProcessingWriteQueue.fire();
  }
  isProcessingWriteQueue() {
    return this._isProcessingWriteQueue;
  }
  /**
   * Subsequent calls should wait for the previous `_deflateBuffer` call to complete.
   */
  _deflateMessage(zlibDeflateStream, buffer) {
    return new Promise((resolve, reject) => {
      zlibDeflateStream.write(buffer);
      zlibDeflateStream.flush((data) => resolve(data));
    });
  }
  acceptFrame(data, isCompressed, isLastFrameOfMessage) {
    this._readQueue.push({ data, isCompressed, isLastFrameOfMessage });
    this._processReadQueue();
  }
  async _processReadQueue() {
    if (this._isProcessingReadQueue) {
      return;
    }
    this._isProcessingReadQueue = true;
    while (this._readQueue.length > 0) {
      const frameInfo = this._readQueue.shift();
      if (this._zlibInflateStream && frameInfo.isCompressed) {
        const data = await this._inflateFrame(this._zlibInflateStream, frameInfo.data, frameInfo.isLastFrameOfMessage);
        this._onData.fire(data);
      } else {
        this._onData.fire(frameInfo.data);
      }
    }
    this._isProcessingReadQueue = false;
    this._onDidFinishProcessingReadQueue.fire();
  }
  isProcessingReadQueue() {
    return this._isProcessingReadQueue;
  }
  /**
   * Subsequent calls should wait for the previous `transformRead` call to complete.
   */
  _inflateFrame(zlibInflateStream, buffer, isLastFrameOfMessage) {
    return new Promise((resolve, reject) => {
      zlibInflateStream.write(buffer);
      if (isLastFrameOfMessage) {
        zlibInflateStream.write(VSBuffer.fromByteArray([0, 0, 255, 255]));
      }
      zlibInflateStream.flush((data) => resolve(data));
    });
  }
}
class ZlibInflateStream extends Disposable {
  constructor(_tracer, recordInflateBytes, inflateBytes, options) {
    super();
    this._tracer = _tracer;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._recordedInflateBytes = [];
    this._pendingInflateData = [];
    this._recordInflateBytes = recordInflateBytes;
    this._zlibInflate = createInflateRaw(options);
    this._zlibInflate.on("error", (err) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateError, { message: err?.message, code: err?.code });
      this._onError.fire(err);
    });
    this._zlibInflate.on("data", (data) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateData, data);
      this._pendingInflateData.push(VSBuffer.wrap(data));
    });
    if (inflateBytes) {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateInitialWrite, inflateBytes.buffer);
      this._zlibInflate.write(inflateBytes.buffer);
      this._zlibInflate.flush(() => {
        this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateInitialFlushFired);
        this._pendingInflateData.length = 0;
      });
    }
  }
  get recordedInflateBytes() {
    if (this._recordInflateBytes) {
      return VSBuffer.concat(this._recordedInflateBytes);
    }
    return VSBuffer.alloc(0);
  }
  write(buffer) {
    if (this._recordInflateBytes) {
      this._recordedInflateBytes.push(buffer.clone());
    }
    this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateWrite, buffer);
    this._zlibInflate.write(buffer.buffer);
  }
  setRecordInflateBytes(record) {
    this._recordInflateBytes = record;
    if (!record) {
      this._recordedInflateBytes.length = 0;
    }
  }
  flush(callback) {
    this._zlibInflate.flush(() => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateFlushFired);
      const data = VSBuffer.concat(this._pendingInflateData);
      this._pendingInflateData.length = 0;
      callback(data);
    });
  }
  dispose() {
    this._recordedInflateBytes.length = 0;
    this._pendingInflateData.length = 0;
    try {
      this._zlibInflate.close();
    } catch {
    }
    super.dispose();
  }
}
class ZlibDeflateStream extends Disposable {
  constructor(_tracer, options) {
    super();
    this._tracer = _tracer;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._pendingDeflateData = [];
    this._zlibDeflate = createDeflateRaw({
      windowBits: 15
    });
    this._zlibDeflate.on("error", (err) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateError, { message: err?.message, code: err?.code });
      this._onError.fire(err);
    });
    this._zlibDeflate.on("data", (data) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateData, data);
      this._pendingDeflateData.push(VSBuffer.wrap(data));
    });
  }
  write(buffer) {
    this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateWrite, buffer.buffer);
    this._zlibDeflate.write(buffer.buffer);
  }
  flush(callback) {
    this._zlibDeflate.flush(
      /*Z_SYNC_FLUSH*/
      2,
      () => {
        this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateFlushFired);
        let data = VSBuffer.concat(this._pendingDeflateData);
        this._pendingDeflateData.length = 0;
        data = data.slice(0, data.byteLength - 4);
        callback(data);
      }
    );
  }
  dispose() {
    this._pendingDeflateData.length = 0;
    try {
      this._zlibDeflate.close();
    } catch {
    }
    super.dispose();
  }
}
function unmask(buffer, mask) {
  if (mask === 0) {
    return;
  }
  const cnt = buffer.byteLength >>> 2;
  for (let i = 0; i < cnt; i++) {
    const v = buffer.readUInt32BE(i * 4);
    buffer.writeUInt32BE(v ^ mask, i * 4);
  }
  const offset = cnt * 4;
  const bytesLeft = buffer.byteLength - offset;
  const m3 = mask >>> 24 & 255;
  const m2 = mask >>> 16 & 255;
  const m1 = mask >>> 8 & 255;
  if (bytesLeft >= 1) {
    buffer.writeUInt8(buffer.readUInt8(offset) ^ m3, offset);
  }
  if (bytesLeft >= 2) {
    buffer.writeUInt8(buffer.readUInt8(offset + 1) ^ m2, offset + 1);
  }
  if (bytesLeft >= 3) {
    buffer.writeUInt8(buffer.readUInt8(offset + 2) ^ m1, offset + 2);
  }
}
const XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
const safeIpcPathLengths = {
  [Platform.Linux]: 107,
  [Platform.Mac]: 103
};
function createRandomIPCHandle() {
  const randomSuffix = generateUuid();
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
  }
  const basePath = process.platform !== "darwin" && XDG_RUNTIME_DIR ? XDG_RUNTIME_DIR : tmpdir();
  const limit = safeIpcPathLengths[platform];
  let suffix = randomSuffix;
  if (typeof limit === "number") {
    const available = Math.max(0, limit - 1 - join(basePath, `vscode-ipc-.sock`).length);
    if (available < suffix.length) {
      suffix = suffix.slice(0, available);
    }
  }
  return join(basePath, `vscode-ipc-${suffix}.sock`);
}
function createStaticIPCHandle(directoryPath, type, version) {
  const scope = createHash("sha256").update(directoryPath).digest("hex");
  const scopeForSocket = scope.substr(0, 8);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${scopeForSocket}-${version}-${type}-sock`;
  }
  const versionForSocket = version.substr(0, 4);
  const typeForSocket = type.substr(0, 6);
  let result;
  if (process.platform !== "darwin" && XDG_RUNTIME_DIR && !process.env["VSCODE_PORTABLE"]) {
    result = join(XDG_RUNTIME_DIR, `vscode-${scopeForSocket}-${versionForSocket}-${typeForSocket}.sock`);
  } else {
    result = join(directoryPath, `${versionForSocket}-${typeForSocket}.sock`);
  }
  validateIPCHandleLength(result);
  return result;
}
function validateIPCHandleLength(handle) {
  const limit = safeIpcPathLengths[platform];
  if (typeof limit === "number" && handle.length >= limit) {
    console.warn(`WARNING: IPC handle "${handle}" is longer than ${limit} chars, try a shorter --user-data-dir`);
  }
}
class Server extends IPCServer {
  static toClientConnectionEvent(server) {
    const onConnection = Event.fromNodeEventEmitter(server, "connection");
    return Event.map(onConnection, (socket) => ({
      protocol: new Protocol(new NodeSocket(socket, "ipc-server-connection")),
      onDidClientDisconnect: Event.once(Event.fromNodeEventEmitter(socket, "close"))
    }));
  }
  constructor(server) {
    super(Server.toClientConnectionEvent(server));
    this.server = server;
  }
  dispose() {
    super.dispose();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
function serve(hook) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(hook, () => {
      server.removeListener("error", reject);
      resolve(new Server(server));
    });
  });
}
function connect(hook, clientId) {
  return new Promise((resolve, reject) => {
    let socket;
    const callbackHandler = () => {
      socket.removeListener("error", reject);
      resolve(Client.fromSocket(new NodeSocket(socket, `ipc-client${clientId}`), clientId));
    };
    if (typeof hook === "string") {
      socket = createConnection(hook, callbackHandler);
    } else {
      socket = createConnection(hook, callbackHandler);
    }
    socket.once("error", reject);
  });
}
export {
  NodeSocket,
  Server,
  WebSocketNodeSocket,
  XDG_RUNTIME_DIR,
  connect,
  createRandomIPCHandle,
  createStaticIPCHandle,
  serve,
  upgradeToISocket
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcaXBjXFxub2RlXFxpcGMubmV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgTmV0U2VydmVyLCBTb2NrZXQsIGNyZWF0ZUNvbm5lY3Rpb24sIGNyZWF0ZVNlcnZlciB9IGZyb20gJ25ldCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBEZWZsYXRlUmF3LCBJbmZsYXRlUmF3LCBabGliT3B0aW9ucywgY3JlYXRlRGVmbGF0ZVJhdywgY3JlYXRlSW5mbGF0ZVJhdyB9IGZyb20gJ3psaWInO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFBsYXRmb3JtLCBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBDbGllbnRDb25uZWN0aW9uRXZlbnQsIElQQ1NlcnZlciB9IGZyb20gJy4uL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgQ2h1bmtTdHJlYW0sIENsaWVudCwgSVNvY2tldCwgUHJvdG9jb2wsIFNvY2tldENsb3NlRXZlbnQsIFNvY2tldENsb3NlRXZlbnRUeXBlLCBTb2NrZXREaWFnbm9zdGljcywgU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUgfSBmcm9tICcuLi9jb21tb24vaXBjLm5ldC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGdyYWRlVG9JU29ja2V0KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHNvY2tldDogU29ja2V0LCB7XG5cdGRlYnVnTGFiZWwsXG5cdHNraXBXZWJTb2NrZXRGcmFtZXMgPSBmYWxzZSxcblx0ZGlzYWJsZVdlYlNvY2tldENvbXByZXNzaW9uID0gZmFsc2UsXG5cdGVuYWJsZU1lc3NhZ2VTcGxpdHRpbmcgPSB0cnVlLFxufToge1xuXHRkZWJ1Z0xhYmVsOiBzdHJpbmc7XG5cdHNraXBXZWJTb2NrZXRGcmFtZXM/OiBib29sZWFuO1xuXHRkaXNhYmxlV2ViU29ja2V0Q29tcHJlc3Npb24/OiBib29sZWFuO1xuXHRlbmFibGVNZXNzYWdlU3BsaXR0aW5nPzogYm9vbGVhbjtcbn0pOiBOb2RlU29ja2V0IHwgV2ViU29ja2V0Tm9kZVNvY2tldCB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZXEuaGVhZGVycy51cGdyYWRlID09PSB1bmRlZmluZWQgfHwgcmVxLmhlYWRlcnMudXBncmFkZS50b0xvd2VyQ2FzZSgpICE9PSAnd2Vic29ja2V0Jykge1xuXHRcdHNvY2tldC5lbmQoJ0hUVFAvMS4xIDQwMCBCYWQgUmVxdWVzdCcpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2NDU1I3NlY3Rpb24tNFxuXHRjb25zdCByZXF1ZXN0Tm9uY2UgPSByZXEuaGVhZGVyc1snc2VjLXdlYnNvY2tldC1rZXknXTtcblx0Y29uc3QgaGFzaCA9IGNyZWF0ZUhhc2goJ3NoYTEnKTsvLyBDb2RlUUwgW1NNMDQ1MTRdIFNIQTEgbXVzdCBiZSB1c2VkIGhlcmUgdG8gcmVzcGVjdCB0aGUgV2ViU29ja2V0IHByb3RvY29sIHNwZWNpZmljYXRpb25cblx0aGFzaC51cGRhdGUocmVxdWVzdE5vbmNlICsgJzI1OEVBRkE1LUU5MTQtNDdEQS05NUNBLUM1QUIwREM4NUIxMScpO1xuXHRjb25zdCByZXNwb25zZU5vbmNlID0gaGFzaC5kaWdlc3QoJ2Jhc2U2NCcpO1xuXG5cdGNvbnN0IHJlc3BvbnNlSGVhZGVycyA9IFtcblx0XHRgSFRUUC8xLjEgMTAxIFN3aXRjaGluZyBQcm90b2NvbHNgLFxuXHRcdGBVcGdyYWRlOiB3ZWJzb2NrZXRgLFxuXHRcdGBDb25uZWN0aW9uOiBVcGdyYWRlYCxcblx0XHRgU2VjLVdlYlNvY2tldC1BY2NlcHQ6ICR7cmVzcG9uc2VOb25jZX1gXG5cdF07XG5cblx0Ly8gU2VlIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM3NjkyI3BhZ2UtMTJcblx0bGV0IHBlcm1lc3NhZ2VEZWZsYXRlID0gZmFsc2U7XG5cdGlmICghc2tpcFdlYlNvY2tldEZyYW1lcyAmJiAhZGlzYWJsZVdlYlNvY2tldENvbXByZXNzaW9uICYmIHJlcS5oZWFkZXJzWydzZWMtd2Vic29ja2V0LWV4dGVuc2lvbnMnXSkge1xuXHRcdGNvbnN0IHdlYnNvY2tldEV4dGVuc2lvbk9wdGlvbnMgPSBBcnJheS5pc0FycmF5KHJlcS5oZWFkZXJzWydzZWMtd2Vic29ja2V0LWV4dGVuc2lvbnMnXSkgPyByZXEuaGVhZGVyc1snc2VjLXdlYnNvY2tldC1leHRlbnNpb25zJ10gOiBbcmVxLmhlYWRlcnNbJ3NlYy13ZWJzb2NrZXQtZXh0ZW5zaW9ucyddXTtcblx0XHRmb3IgKGNvbnN0IHdlYnNvY2tldEV4dGVuc2lvbk9wdGlvbiBvZiB3ZWJzb2NrZXRFeHRlbnNpb25PcHRpb25zKSB7XG5cdFx0XHRpZiAoL1xcYigoc2VydmVyX21heF93aW5kb3dfYml0cyl8KHNlcnZlcl9ub19jb250ZXh0X3Rha2VvdmVyKXwoY2xpZW50X25vX2NvbnRleHRfdGFrZW92ZXIpKVxcYi8udGVzdCh3ZWJzb2NrZXRFeHRlbnNpb25PcHRpb24pKSB7XG5cdFx0XHRcdC8vIHNvcnJ5LCB0aGUgc2VydmVyIGRvZXMgbm90IHN1cHBvcnQgemxpYiBwYXJhbWV0ZXIgdHdlYWtzXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKC9cXGIocGVybWVzc2FnZS1kZWZsYXRlKVxcYi8udGVzdCh3ZWJzb2NrZXRFeHRlbnNpb25PcHRpb24pKSB7XG5cdFx0XHRcdHBlcm1lc3NhZ2VEZWZsYXRlID0gdHJ1ZTtcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzLnB1c2goYFNlYy1XZWJTb2NrZXQtRXh0ZW5zaW9uczogcGVybWVzc2FnZS1kZWZsYXRlYCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKC9cXGIoeC13ZWJraXQtZGVmbGF0ZS1mcmFtZSlcXGIvLnRlc3Qod2Vic29ja2V0RXh0ZW5zaW9uT3B0aW9uKSkge1xuXHRcdFx0XHRwZXJtZXNzYWdlRGVmbGF0ZSA9IHRydWU7XG5cdFx0XHRcdHJlc3BvbnNlSGVhZGVycy5wdXNoKGBTZWMtV2ViU29ja2V0LUV4dGVuc2lvbnM6IHgtd2Via2l0LWRlZmxhdGUtZnJhbWVgKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c29ja2V0LndyaXRlKHJlc3BvbnNlSGVhZGVycy5qb2luKCdcXHJcXG4nKSArICdcXHJcXG5cXHJcXG4nKTtcblxuXHQvLyBOZXZlciB0aW1lb3V0IHRoaXMgc29ja2V0IGR1ZSB0byBpbmFjdGl2aXR5IVxuXHRzb2NrZXQuc2V0VGltZW91dCgwKTtcblx0Ly8gRGlzYWJsZSBOYWdsZSdzIGFsZ29yaXRobVxuXHRzb2NrZXQuc2V0Tm9EZWxheSh0cnVlKTtcblx0Ly8gRmluYWxseSFcblxuXHRpZiAoc2tpcFdlYlNvY2tldEZyYW1lcykge1xuXHRcdHJldHVybiBuZXcgTm9kZVNvY2tldChzb2NrZXQsIGRlYnVnTGFiZWwpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBuZXcgV2ViU29ja2V0Tm9kZVNvY2tldChuZXcgTm9kZVNvY2tldChzb2NrZXQsIGRlYnVnTGFiZWwpLCBwZXJtZXNzYWdlRGVmbGF0ZSwgbnVsbCwgdHJ1ZSwgZW5hYmxlTWVzc2FnZVNwbGl0dGluZyk7XG5cdH1cbn1cblxuLyoqXG4gKiBNYXhpbXVtIHRpbWUgdG8gd2FpdCBmb3IgYSAnY2xvc2UnIGV2ZW50IHRvIGZpcmUgYWZ0ZXIgdGhlIHNvY2tldCBzdHJlYW1cbiAqIGVuZHMuIEZvciB1bml4IGRvbWFpbiBzb2NrZXRzLCB0aGUgY2xvc2UgZXZlbnQgbWF5IG5vdCBmaXJlIGNvbnNpc3RlbnRseVxuICogZHVlIHRvIHdoYXQgYXBwZWFycyB0byBiZSBhIE5vZGUuanMgYnVnLlxuICpcbiAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIxMTQ2MiNpc3N1ZWNvbW1lbnQtMjE1NTQ3MTk5NlxuICovXG5jb25zdCBzb2NrZXRFbmRUaW1lb3V0TXMgPSAzMF8wMDA7XG5cbmV4cG9ydCBjbGFzcyBOb2RlU29ja2V0IGltcGxlbWVudHMgSVNvY2tldCB7XG5cblx0cHVibGljIHJlYWRvbmx5IGRlYnVnTGFiZWw6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHNvY2tldDogU29ja2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lcnJvckxpc3RlbmVyOiAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlTGlzdGVuZXI6IChoYWRFcnJvcjogYm9vbGVhbikgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5kTGlzdGVuZXI6ICgpID0+IHZvaWQ7XG5cdHByaXZhdGUgX2VuZFRpbWVvdXRIYW5kbGU6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhbldyaXRlID0gdHJ1ZTtcblxuXHRwdWJsaWMgdHJhY2VTb2NrZXRFdmVudCh0eXBlOiBTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZSwgZGF0YT86IFZTQnVmZmVyIHwgVWludDhBcnJheSB8IEFycmF5QnVmZmVyIHwgQXJyYXlCdWZmZXJWaWV3IHwgdW5rbm93bik6IHZvaWQge1xuXHRcdFNvY2tldERpYWdub3N0aWNzLnRyYWNlU29ja2V0RXZlbnQodGhpcy5zb2NrZXQsIHRoaXMuZGVidWdMYWJlbCwgdHlwZSwgZGF0YSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihzb2NrZXQ6IFNvY2tldCwgZGVidWdMYWJlbCA9ICcnKSB7XG5cdFx0dGhpcy5kZWJ1Z0xhYmVsID0gZGVidWdMYWJlbDtcblx0XHR0aGlzLnNvY2tldCA9IHNvY2tldDtcblx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuQ3JlYXRlZCwgeyB0eXBlOiAnTm9kZVNvY2tldCcgfSk7XG5cdFx0dGhpcy5fZXJyb3JMaXN0ZW5lciA9IChlcnI6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbikgPT4ge1xuXHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLkVycm9yLCB7IGNvZGU6IGVycj8uY29kZSwgbWVzc2FnZTogZXJyPy5tZXNzYWdlIH0pO1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRpZiAoZXJyLmNvZGUgPT09ICdFUElQRScpIHtcblx0XHRcdFx0XHQvLyBBbiBFUElQRSBleGNlcHRpb24gYXQgdGhlIHdyb25nIHRpbWUgY2FuIGxlYWQgdG8gYSByZW5kZXJlciBwcm9jZXNzIGNyYXNoXG5cdFx0XHRcdFx0Ly8gc28gaWdub3JlIHRoZSBlcnJvciBzaW5jZSB0aGUgc29ja2V0IHdpbGwgZmlyZSB0aGUgY2xvc2UgZXZlbnQgc29vbiBhbnl3YXlzOlxuXHRcdFx0XHRcdC8vID4gaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9lcnJvcnMuaHRtbCNlcnJvcnNfY29tbW9uX3N5c3RlbV9lcnJvcnNcblx0XHRcdFx0XHQvLyA+IEVQSVBFIChCcm9rZW4gcGlwZSk6IEEgd3JpdGUgb24gYSBwaXBlLCBzb2NrZXQsIG9yIEZJRk8gZm9yIHdoaWNoIHRoZXJlIGlzIG5vXG5cdFx0XHRcdFx0Ly8gPiBwcm9jZXNzIHRvIHJlYWQgdGhlIGRhdGEuIENvbW1vbmx5IGVuY291bnRlcmVkIGF0IHRoZSBuZXQgYW5kIGh0dHAgbGF5ZXJzLFxuXHRcdFx0XHRcdC8vID4gaW5kaWNhdGl2ZSB0aGF0IHRoZSByZW1vdGUgc2lkZSBvZiB0aGUgc3RyZWFtIGJlaW5nIHdyaXR0ZW4gdG8gaGFzIGJlZW4gY2xvc2VkLlxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5zb2NrZXQub24oJ2Vycm9yJywgdGhpcy5fZXJyb3JMaXN0ZW5lcik7XG5cblx0XHR0aGlzLl9jbG9zZUxpc3RlbmVyID0gKGhhZEVycm9yOiBib29sZWFuKSA9PiB7XG5cdFx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuQ2xvc2UsIHsgaGFkRXJyb3IgfSk7XG5cdFx0XHR0aGlzLl9jYW5Xcml0ZSA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMuX2VuZFRpbWVvdXRIYW5kbGUpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2VuZFRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgdGhpcy5fY2xvc2VMaXN0ZW5lcik7XG5cblx0XHR0aGlzLl9lbmRMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Ob2RlRW5kUmVjZWl2ZWQpO1xuXHRcdFx0dGhpcy5fY2FuV3JpdGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2VuZFRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHNvY2tldC5kZXN0cm95KCksIHNvY2tldEVuZFRpbWVvdXRNcyk7XG5cdFx0fTtcblx0XHR0aGlzLnNvY2tldC5vbignZW5kJywgdGhpcy5fZW5kTGlzdGVuZXIpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoZGVzdHJveVNvY2tldCA9IHRydWUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZW5kVGltZW91dEhhbmRsZSkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2VuZFRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0dGhpcy5fZW5kVGltZW91dEhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5zb2NrZXQub2ZmKCdlcnJvcicsIHRoaXMuX2Vycm9yTGlzdGVuZXIpO1xuXHRcdHRoaXMuc29ja2V0Lm9mZignY2xvc2UnLCB0aGlzLl9jbG9zZUxpc3RlbmVyKTtcblx0XHR0aGlzLnNvY2tldC5vZmYoJ2VuZCcsIHRoaXMuX2VuZExpc3RlbmVyKTtcblx0XHRpZiAoZGVzdHJveVNvY2tldCkge1xuXHRcdFx0dGhpcy5zb2NrZXQuZGVzdHJveSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvbkRhdGEoX2xpc3RlbmVyOiAoZTogVlNCdWZmZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSAoYnVmZjogQnVmZmVyKSA9PiB7XG5cdFx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuUmVhZCwgYnVmZik7XG5cdFx0XHRfbGlzdGVuZXIoVlNCdWZmZXIud3JhcChidWZmKSk7XG5cdFx0fTtcblx0XHR0aGlzLnNvY2tldC5vbignZGF0YScsIGxpc3RlbmVyKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4gdGhpcy5zb2NrZXQub2ZmKCdkYXRhJywgbGlzdGVuZXIpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBvbkNsb3NlKGxpc3RlbmVyOiAoZTogU29ja2V0Q2xvc2VFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBhZGFwdGVyID0gKGhhZEVycm9yOiBib29sZWFuKSA9PiB7XG5cdFx0XHRsaXN0ZW5lcih7XG5cdFx0XHRcdHR5cGU6IFNvY2tldENsb3NlRXZlbnRUeXBlLk5vZGVTb2NrZXRDbG9zZUV2ZW50LFxuXHRcdFx0XHRoYWRFcnJvcjogaGFkRXJyb3IsXG5cdFx0XHRcdGVycm9yOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0dGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgYWRhcHRlcik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuc29ja2V0Lm9mZignY2xvc2UnLCBhZGFwdGVyKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb25FbmQobGlzdGVuZXI6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYWRhcHRlciA9ICgpID0+IHtcblx0XHRcdGxpc3RlbmVyKCk7XG5cdFx0fTtcblx0XHR0aGlzLnNvY2tldC5vbignZW5kJywgYWRhcHRlcik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuc29ja2V0Lm9mZignZW5kJywgYWRhcHRlcilcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHQvLyByZXR1cm4gZWFybHkgaWYgc29ja2V0IGhhcyBiZWVuIGRlc3Ryb3llZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRpZiAodGhpcy5zb2NrZXQuZGVzdHJveWVkIHx8ICF0aGlzLl9jYW5Xcml0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHdlIGlnbm9yZSB0aGUgcmV0dXJuZWQgdmFsdWUgZnJvbSBgd3JpdGVgIGJlY2F1c2Ugd2Ugd291bGQgaGF2ZSB0byBjYWNoZWQgdGhlIGRhdGFcblx0XHQvLyBhbnl3YXlzIGFuZCBub2RlanMgaXMgYWxyZWFkeSBkb2luZyB0aGF0IGZvciB1czpcblx0XHQvLyA+IGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvc3RyZWFtLmh0bWwjc3RyZWFtX3dyaXRhYmxlX3dyaXRlX2NodW5rX2VuY29kaW5nX2NhbGxiYWNrXG5cdFx0Ly8gPiBIb3dldmVyLCB0aGUgZmFsc2UgcmV0dXJuIHZhbHVlIGlzIG9ubHkgYWR2aXNvcnkgYW5kIHRoZSB3cml0YWJsZSBzdHJlYW0gd2lsbCB1bmNvbmRpdGlvbmFsbHlcblx0XHQvLyA+IGFjY2VwdCBhbmQgYnVmZmVyIGNodW5rIGV2ZW4gaWYgaXQgaGFzIG5vdCBiZWVuIGFsbG93ZWQgdG8gZHJhaW4uXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Xcml0ZSwgYnVmZmVyKTtcblx0XHRcdHRoaXMuc29ja2V0LndyaXRlKGJ1ZmZlci5idWZmZXIsIChlcnI6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbiB8IG51bGwgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGlmIChlcnIuY29kZSA9PT0gJ0VQSVBFJykge1xuXHRcdFx0XHRcdFx0Ly8gQW4gRVBJUEUgZXhjZXB0aW9uIGF0IHRoZSB3cm9uZyB0aW1lIGNhbiBsZWFkIHRvIGEgcmVuZGVyZXIgcHJvY2VzcyBjcmFzaFxuXHRcdFx0XHRcdFx0Ly8gc28gaWdub3JlIHRoZSBlcnJvciBzaW5jZSB0aGUgc29ja2V0IHdpbGwgZmlyZSB0aGUgY2xvc2UgZXZlbnQgc29vbiBhbnl3YXlzOlxuXHRcdFx0XHRcdFx0Ly8gPiBodHRwczovL25vZGVqcy5vcmcvYXBpL2Vycm9ycy5odG1sI2Vycm9yc19jb21tb25fc3lzdGVtX2Vycm9yc1xuXHRcdFx0XHRcdFx0Ly8gPiBFUElQRSAoQnJva2VuIHBpcGUpOiBBIHdyaXRlIG9uIGEgcGlwZSwgc29ja2V0LCBvciBGSUZPIGZvciB3aGljaCB0aGVyZSBpcyBub1xuXHRcdFx0XHRcdFx0Ly8gPiBwcm9jZXNzIHRvIHJlYWQgdGhlIGRhdGEuIENvbW1vbmx5IGVuY291bnRlcmVkIGF0IHRoZSBuZXQgYW5kIGh0dHAgbGF5ZXJzLFxuXHRcdFx0XHRcdFx0Ly8gPiBpbmRpY2F0aXZlIHRoYXQgdGhlIHJlbW90ZSBzaWRlIG9mIHRoZSBzdHJlYW0gYmVpbmcgd3JpdHRlbiB0byBoYXMgYmVlbiBjbG9zZWQuXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyci5jb2RlID09PSAnRVBJUEUnKSB7XG5cdFx0XHRcdC8vIEFuIEVQSVBFIGV4Y2VwdGlvbiBhdCB0aGUgd3JvbmcgdGltZSBjYW4gbGVhZCB0byBhIHJlbmRlcmVyIHByb2Nlc3MgY3Jhc2hcblx0XHRcdFx0Ly8gc28gaWdub3JlIHRoZSBlcnJvciBzaW5jZSB0aGUgc29ja2V0IHdpbGwgZmlyZSB0aGUgY2xvc2UgZXZlbnQgc29vbiBhbnl3YXlzOlxuXHRcdFx0XHQvLyA+IGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvZXJyb3JzLmh0bWwjZXJyb3JzX2NvbW1vbl9zeXN0ZW1fZXJyb3JzXG5cdFx0XHRcdC8vID4gRVBJUEUgKEJyb2tlbiBwaXBlKTogQSB3cml0ZSBvbiBhIHBpcGUsIHNvY2tldCwgb3IgRklGTyBmb3Igd2hpY2ggdGhlcmUgaXMgbm9cblx0XHRcdFx0Ly8gPiBwcm9jZXNzIHRvIHJlYWQgdGhlIGRhdGEuIENvbW1vbmx5IGVuY291bnRlcmVkIGF0IHRoZSBuZXQgYW5kIGh0dHAgbGF5ZXJzLFxuXHRcdFx0XHQvLyA+IGluZGljYXRpdmUgdGhhdCB0aGUgcmVtb3RlIHNpZGUgb2YgdGhlIHN0cmVhbSBiZWluZyB3cml0dGVuIHRvIGhhcyBiZWVuIGNsb3NlZC5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZW5kKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Ob2RlRW5kU2VudCk7XG5cdFx0dGhpcy5zb2NrZXQuZW5kKCk7XG5cdH1cblxuXHRwdWJsaWMgZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLk5vZGVEcmFpbkJlZ2luKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc29ja2V0LmJ1ZmZlclNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLk5vZGVEcmFpbkVuZCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZmluaXNoZWQgPSAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc29ja2V0Lm9mZignY2xvc2UnLCBmaW5pc2hlZCk7XG5cdFx0XHRcdHRoaXMuc29ja2V0Lm9mZignZW5kJywgZmluaXNoZWQpO1xuXHRcdFx0XHR0aGlzLnNvY2tldC5vZmYoJ2Vycm9yJywgZmluaXNoZWQpO1xuXHRcdFx0XHR0aGlzLnNvY2tldC5vZmYoJ3RpbWVvdXQnLCBmaW5pc2hlZCk7XG5cdFx0XHRcdHRoaXMuc29ja2V0Lm9mZignZHJhaW4nLCBmaW5pc2hlZCk7XG5cdFx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Ob2RlRHJhaW5FbmQpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgZmluaXNoZWQpO1xuXHRcdFx0dGhpcy5zb2NrZXQub24oJ2VuZCcsIGZpbmlzaGVkKTtcblx0XHRcdHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIGZpbmlzaGVkKTtcblx0XHRcdHRoaXMuc29ja2V0Lm9uKCd0aW1lb3V0JywgZmluaXNoZWQpO1xuXHRcdFx0dGhpcy5zb2NrZXQub24oJ2RyYWluJywgZmluaXNoZWQpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0TWluSGVhZGVyQnl0ZVNpemUgPSAyLFxuXHQvKipcblx0ICogSWYgd2UgbmVlZCB0byB3cml0ZSBhIGxhcmdlIGJ1ZmZlciwgd2Ugd2lsbCBzcGxpdCBpdCBpbnRvIDI1NktCIGNodW5rcyBhbmRcblx0ICogc2VuZCBlYWNoIGNodW5rIGFzIGEgd2Vic29ja2V0IG1lc3NhZ2UuIFRoaXMgaXMgdG8gcHJldmVudCB0aGF0IHRoZSBzZW5kaW5nXG5cdCAqIHNpZGUgaXMgc3R1Y2sgd2FpdGluZyBmb3IgdGhlIGVudGlyZSBidWZmZXIgdG8gYmUgY29tcHJlc3NlZCBiZWZvcmUgd3JpdGluZ1xuXHQgKiB0byB0aGUgdW5kZXJseWluZyBzb2NrZXQgb3IgdGhhdCB0aGUgcmVjZWl2aW5nIHNpZGUgaXMgc3R1Y2sgd2FpdGluZyBmb3IgdGhlXG5cdCAqIGVudGlyZSBtZXNzYWdlIHRvIGJlIHJlY2VpdmVkIGJlZm9yZSBwcm9jZXNzaW5nIHRoZSBieXRlcy5cblx0ICovXG5cdE1heFdlYlNvY2tldE1lc3NhZ2VMZW5ndGggPSAyNTYgKiAxMDI0IC8vIDI1NiBLQlxufVxuXG5jb25zdCBlbnVtIFJlYWRTdGF0ZSB7XG5cdFBlZWtIZWFkZXIgPSAxLFxuXHRSZWFkSGVhZGVyID0gMixcblx0UmVhZEJvZHkgPSAzLFxuXHRGaW4gPSA0XG59XG5cbmludGVyZmFjZSBJU29ja2V0VHJhY2VyIHtcblx0dHJhY2VTb2NrZXRFdmVudCh0eXBlOiBTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZSwgZGF0YT86IFZTQnVmZmVyIHwgVWludDhBcnJheSB8IEFycmF5QnVmZmVyIHwgQXJyYXlCdWZmZXJWaWV3IHwgdW5rbm93bik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBGcmFtZU9wdGlvbnMge1xuXHRjb21wcmVzc2VkOiBib29sZWFuO1xuXHRvcGNvZGU6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBTZWUgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY0NTUjc2VjdGlvbi01LjJcbiAqL1xuZXhwb3J0IGNsYXNzIFdlYlNvY2tldE5vZGVTb2NrZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNvY2tldCwgSVNvY2tldFRyYWNlciB7XG5cblx0cHVibGljIHJlYWRvbmx5IHNvY2tldDogTm9kZVNvY2tldDtcblx0cHJpdmF0ZSByZWFkb25seSBfZmxvd01hbmFnZXI6IFdlYlNvY2tldEZsb3dNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmNvbWluZ0RhdGE6IENodW5rU3RyZWFtO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxWU0J1ZmZlcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTb2NrZXRDbG9zZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWF4U29ja2V0TWVzc2FnZUxlbmd0aDogbnVtYmVyO1xuXHRwcml2YXRlIF9pc0VuZGVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSB7XG5cdFx0c3RhdGU6IFJlYWRTdGF0ZS5QZWVrSGVhZGVyLFxuXHRcdHJlYWRMZW46IENvbnN0YW50cy5NaW5IZWFkZXJCeXRlU2l6ZSxcblx0XHRmaW46IDAsXG5cdFx0Y29tcHJlc3NlZDogZmFsc2UsXG5cdFx0Zmlyc3RGcmFtZU9mTWVzc2FnZTogdHJ1ZSxcblx0XHRtYXNrOiAwLFxuXHRcdG9wY29kZTogMFxuXHR9O1xuXG5cdHB1YmxpYyBnZXQgcGVybWVzc2FnZURlZmxhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Zsb3dNYW5hZ2VyLnBlcm1lc3NhZ2VEZWZsYXRlO1xuXHR9XG5cblx0cHVibGljIGdldCByZWNvcmRlZEluZmxhdGVCeXRlcygpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2Zsb3dNYW5hZ2VyLnJlY29yZGVkSW5mbGF0ZUJ5dGVzO1xuXHR9XG5cblx0cHVibGljIHNldFJlY29yZEluZmxhdGVCeXRlcyhyZWNvcmQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9mbG93TWFuYWdlci5zZXRSZWNvcmRJbmZsYXRlQnl0ZXMocmVjb3JkKTtcblx0fVxuXG5cdHB1YmxpYyB0cmFjZVNvY2tldEV2ZW50KHR5cGU6IFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLCBkYXRhPzogVlNCdWZmZXIgfCBVaW50OEFycmF5IHwgQXJyYXlCdWZmZXIgfCBBcnJheUJ1ZmZlclZpZXcgfCB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5zb2NrZXQudHJhY2VTb2NrZXRFdmVudCh0eXBlLCBkYXRhKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBzb2NrZXQgd2hpY2ggY2FuIGNvbW11bmljYXRlIHVzaW5nIFdlYlNvY2tldCBmcmFtZXMuXG5cdCAqXG5cdCAqICoqTk9URSoqOiBXaGVuIHVzaW5nIHRoZSBwZXJtZXNzYWdlLWRlZmxhdGUgV2ViU29ja2V0IGV4dGVuc2lvbiwgaWYgcGFydHMgb2YgaW5mbGF0aW5nIHdhcyBkb25lXG5cdCAqICBpbiBhIGRpZmZlcmVudCB6bGliIGluc3RhbmNlLCB3ZSBuZWVkIHRvIHBhc3MgYWxsIHRob3NlIGJ5dGVzIGludG8gemxpYiwgb3RoZXJ3aXNlIHRoZSBpbmZsYXRlXG5cdCAqICBtaWdodCBoaXQgYW4gaW5mbGF0ZWQgcG9ydGlvbiByZWZlcmVuY2luZyBhIGRpc3RhbmNlIHRvbyBmYXIgYmFjay5cblx0ICpcblx0ICogQHBhcmFtIHNvY2tldCBUaGUgdW5kZXJseWluZyBzb2NrZXRcblx0ICogQHBhcmFtIHBlcm1lc3NhZ2VEZWZsYXRlIFVzZSB0aGUgcGVybWVzc2FnZS1kZWZsYXRlIFdlYlNvY2tldCBleHRlbnNpb25cblx0ICogQHBhcmFtIGluZmxhdGVCeXRlcyBcIlNlZWRcIiB6bGliIGluZmxhdGUgd2l0aCB0aGVzZSBieXRlcy5cblx0ICogQHBhcmFtIHJlY29yZEluZmxhdGVCeXRlcyBSZWNvcmQgYWxsIGJ5dGVzIHNlbnQgdG8gaW5mbGF0ZVxuXHQgKi9cblx0Y29uc3RydWN0b3Ioc29ja2V0OiBOb2RlU29ja2V0LCBwZXJtZXNzYWdlRGVmbGF0ZTogYm9vbGVhbiwgaW5mbGF0ZUJ5dGVzOiBWU0J1ZmZlciB8IG51bGwsIHJlY29yZEluZmxhdGVCeXRlczogYm9vbGVhbiwgZW5hYmxlTWVzc2FnZVNwbGl0dGluZyA9IHRydWUpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc29ja2V0ID0gc29ja2V0O1xuXHRcdHRoaXMuX21heFNvY2tldE1lc3NhZ2VMZW5ndGggPSBlbmFibGVNZXNzYWdlU3BsaXR0aW5nID8gQ29uc3RhbnRzLk1heFdlYlNvY2tldE1lc3NhZ2VMZW5ndGggOiBJbmZpbml0eTtcblx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuQ3JlYXRlZCwgeyB0eXBlOiAnV2ViU29ja2V0Tm9kZVNvY2tldCcsIHBlcm1lc3NhZ2VEZWZsYXRlLCBpbmZsYXRlQnl0ZXNMZW5ndGg6IGluZmxhdGVCeXRlcz8uYnl0ZUxlbmd0aCB8fCAwLCByZWNvcmRJbmZsYXRlQnl0ZXMgfSk7XG5cdFx0dGhpcy5fZmxvd01hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV2ViU29ja2V0Rmxvd01hbmFnZXIoXG5cdFx0XHR0aGlzLFxuXHRcdFx0cGVybWVzc2FnZURlZmxhdGUsXG5cdFx0XHRpbmZsYXRlQnl0ZXMsXG5cdFx0XHRyZWNvcmRJbmZsYXRlQnl0ZXMsXG5cdFx0XHR0aGlzLl9vbkRhdGEsXG5cdFx0XHQoZGF0YSwgb3B0aW9ucykgPT4gdGhpcy5fd3JpdGUoZGF0YSwgb3B0aW9ucylcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mbG93TWFuYWdlci5vbkVycm9yKChlcnIpID0+IHtcblx0XHRcdC8vIHpsaWIgZXJyb3JzIGFyZSBmYXRhbCwgc2luY2Ugd2UgaGF2ZSBubyBpZGVhIGhvdyB0byByZWNvdmVyXG5cdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0dGhpcy5fb25DbG9zZS5maXJlKHtcblx0XHRcdFx0dHlwZTogU29ja2V0Q2xvc2VFdmVudFR5cGUuTm9kZVNvY2tldENsb3NlRXZlbnQsXG5cdFx0XHRcdGhhZEVycm9yOiB0cnVlLFxuXHRcdFx0XHRlcnJvcjogZXJyXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5faW5jb21pbmdEYXRhID0gbmV3IENodW5rU3RyZWFtKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zb2NrZXQub25EYXRhKGRhdGEgPT4gdGhpcy5fYWNjZXB0Q2h1bmsoZGF0YSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNvY2tldC5vbkNsb3NlKGFzeW5jIChlKSA9PiB7XG5cdFx0XHQvLyBEZWxheSBzdXJmYWNpbmcgdGhlIGNsb3NlIGV2ZW50IHVudGlsIHRoZSBhc3luYyBpbmZsYXRpbmcgaXMgZG9uZVxuXHRcdFx0Ly8gYW5kIGFsbCBkYXRhIGhhcyBiZWVuIGVtaXR0ZWRcblx0XHRcdGlmICh0aGlzLl9mbG93TWFuYWdlci5pc1Byb2Nlc3NpbmdSZWFkUXVldWUoKSkge1xuXHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5fZmxvd01hbmFnZXIub25EaWRGaW5pc2hQcm9jZXNzaW5nUmVhZFF1ZXVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uQ2xvc2UuZmlyZShlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZmxvd01hbmFnZXIuaXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSgpKSB7XG5cdFx0XHQvLyBXYWl0IGZvciBhbnkgb3V0c3RhbmRpbmcgd3JpdGVzIHRvIGZpbmlzaCBiZWZvcmUgZGlzcG9zaW5nXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mbG93TWFuYWdlci5vbkRpZEZpbmlzaFByb2Nlc3NpbmdXcml0ZVF1ZXVlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc29ja2V0LmRpc3Bvc2UoKTtcblx0XHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb25EYXRhKGxpc3RlbmVyOiAoZTogVlNCdWZmZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGF0YS5ldmVudChsaXN0ZW5lcik7XG5cdH1cblxuXHRwdWJsaWMgb25DbG9zZShsaXN0ZW5lcjogKGU6IFNvY2tldENsb3NlRXZlbnQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX29uQ2xvc2UuZXZlbnQobGlzdGVuZXIpO1xuXHR9XG5cblx0cHVibGljIG9uRW5kKGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLnNvY2tldC5vbkVuZChsaXN0ZW5lcik7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGUoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdC8vIElmIHdlIHdyaXRlIG1hbnkgbG9naWNhbCBtZXNzYWdlcyAobGV0J3Mgc2F5IDEwMDAgbWVzc2FnZXMgb2YgMTAwS0IpIGR1cmluZyBhIHNpbmdsZSBwcm9jZXNzIHRpY2ssIHdlIGRvXG5cdFx0Ly8gdGhpcyB0aGluZyB3aGVyZSB3ZSBpbnN0YWxsIGEgcHJvY2Vzcy5uZXh0VGljayB0aW1lciBhbmQgZ3JvdXAgYWxsIG9mIHRoZW0gdG9nZXRoZXIgYW5kIHdlIHRoZW4gaXNzdWUgYVxuXHRcdC8vIHNpbmdsZSBXZWJTb2NrZXROb2RlU29ja2V0LndyaXRlIHdpdGggYSAxMDBNQiBidWZmZXIuXG5cdFx0Ly9cblx0XHQvLyBUaGUgZmlyc3QgcHJvYmxlbSBpcyB0aGF0IHRoZSBhY3R1YWwgd3JpdGluZyB0byB0aGUgdW5kZXJseWluZyBub2RlIHNvY2tldCB3aWxsIG9ubHkgaGFwcGVuIGFmdGVyIGFsbCBvZlxuXHRcdC8vIHRoZSAxMDBNQiBoYXZlIGJlZW4gZGVmbGF0ZWQgKGR1ZSB0byB3YWl0aW5nIG9uIHpsaWIgZmx1c2gpLiBUaGUgc2Vjb25kIHByb2JsZW0gaXMgb24gdGhlIHJlYWRpbmcgc2lkZSxcblx0XHQvLyB3aGVyZSB3ZSB3aWxsIGdldCBhIHNpbmdsZSBXZWJTb2NrZXROb2RlU29ja2V0Lm9uRGF0YSBldmVudCBmaXJlZCB3aGVuIGFsbCB0aGUgMTAwTUIgaGF2ZSBhcnJpdmVkLFxuXHRcdC8vIGRlbGF5aW5nIHByb2Nlc3NpbmcgdGhlIDEwMDAgcmVjZWl2ZWQgbWVzc2FnZXMgdW50aWwgYWxsIGhhdmUgYXJyaXZlZCwgaW5zdGVhZCBvZiBwcm9jZXNzaW5nIHRoZW0gYXMgZWFjaFxuXHRcdC8vIG9uZSBhcnJpdmVzLlxuXHRcdC8vXG5cdFx0Ly8gV2UgdGhlcmVmb3JlIHNwbGl0IHRoZSBidWZmZXIgaW50byBjaHVua3MsIGFuZCBpc3N1ZSBhIHdyaXRlIGZvciBlYWNoIGNodW5rLlxuXG5cdFx0bGV0IHN0YXJ0ID0gMDtcblx0XHR3aGlsZSAoc3RhcnQgPCBidWZmZXIuYnl0ZUxlbmd0aCkge1xuXHRcdFx0dGhpcy5fZmxvd01hbmFnZXIud3JpdGVNZXNzYWdlKGJ1ZmZlci5zbGljZShzdGFydCwgTWF0aC5taW4oc3RhcnQgKyB0aGlzLl9tYXhTb2NrZXRNZXNzYWdlTGVuZ3RoLCBidWZmZXIuYnl0ZUxlbmd0aCkpLCB7IGNvbXByZXNzZWQ6IHRydWUsIG9wY29kZTogMHgwMiAvKiBCaW5hcnkgZnJhbWUgKi8gfSk7XG5cdFx0XHRzdGFydCArPSB0aGlzLl9tYXhTb2NrZXRNZXNzYWdlTGVuZ3RoO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlKGJ1ZmZlcjogVlNCdWZmZXIsIHsgY29tcHJlc3NlZCwgb3Bjb2RlIH06IEZyYW1lT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0VuZGVkKSB7XG5cdFx0XHQvLyBBdm9pZCBFUlJfU1RSRUFNX1dSSVRFX0FGVEVSX0VORFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5XZWJTb2NrZXROb2RlU29ja2V0V3JpdGUsIGJ1ZmZlcik7XG5cdFx0bGV0IGhlYWRlckxlbiA9IENvbnN0YW50cy5NaW5IZWFkZXJCeXRlU2l6ZTtcblx0XHRpZiAoYnVmZmVyLmJ5dGVMZW5ndGggPCAxMjYpIHtcblx0XHRcdGhlYWRlckxlbiArPSAwO1xuXHRcdH0gZWxzZSBpZiAoYnVmZmVyLmJ5dGVMZW5ndGggPCAyICoqIDE2KSB7XG5cdFx0XHRoZWFkZXJMZW4gKz0gMjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aGVhZGVyTGVuICs9IDg7XG5cdFx0fVxuXHRcdGNvbnN0IGhlYWRlciA9IFZTQnVmZmVyLmFsbG9jKGhlYWRlckxlbik7XG5cblx0XHQvLyBUaGUgUlNWMSBiaXQgaW5kaWNhdGVzIGEgY29tcHJlc3NlZCBmcmFtZVxuXHRcdGNvbnN0IGNvbXByZXNzZWRGbGFnID0gY29tcHJlc3NlZCA/IDBiMDEwMDAwMDAgOiAwO1xuXHRcdGNvbnN0IG9wY29kZUZsYWcgPSBvcGNvZGUgJiAwYjAwMDAxMTExO1xuXHRcdGhlYWRlci53cml0ZVVJbnQ4KDBiMTAwMDAwMDAgfCBjb21wcmVzc2VkRmxhZyB8IG9wY29kZUZsYWcsIDApO1xuXHRcdGlmIChidWZmZXIuYnl0ZUxlbmd0aCA8IDEyNikge1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoYnVmZmVyLmJ5dGVMZW5ndGgsIDEpO1xuXHRcdH0gZWxzZSBpZiAoYnVmZmVyLmJ5dGVMZW5ndGggPCAyICoqIDE2KSB7XG5cdFx0XHRoZWFkZXIud3JpdGVVSW50OCgxMjYsIDEpO1xuXHRcdFx0bGV0IG9mZnNldCA9IDE7XG5cdFx0XHRoZWFkZXIud3JpdGVVSW50OCgoYnVmZmVyLmJ5dGVMZW5ndGggPj4+IDgpICYgMGIxMTExMTExMSwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoKGJ1ZmZlci5ieXRlTGVuZ3RoID4+PiAwKSAmIDBiMTExMTExMTEsICsrb2Zmc2V0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoMTI3LCAxKTtcblx0XHRcdGxldCBvZmZzZXQgPSAxO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoMCwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoMCwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoMCwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoMCwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoKGJ1ZmZlci5ieXRlTGVuZ3RoID4+PiAyNCkgJiAwYjExMTExMTExLCArK29mZnNldCk7XG5cdFx0XHRoZWFkZXIud3JpdGVVSW50OCgoYnVmZmVyLmJ5dGVMZW5ndGggPj4+IDE2KSAmIDBiMTExMTExMTEsICsrb2Zmc2V0KTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KChidWZmZXIuYnl0ZUxlbmd0aCA+Pj4gOCkgJiAwYjExMTExMTExLCArK29mZnNldCk7XG5cdFx0XHRoZWFkZXIud3JpdGVVSW50OCgoYnVmZmVyLmJ5dGVMZW5ndGggPj4+IDApICYgMGIxMTExMTExMSwgKytvZmZzZXQpO1xuXHRcdH1cblxuXHRcdHRoaXMuc29ja2V0LndyaXRlKFZTQnVmZmVyLmNvbmNhdChbaGVhZGVyLCBidWZmZXJdKSk7XG5cdH1cblxuXHRwdWJsaWMgZW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRW5kZWQgPSB0cnVlO1xuXHRcdHRoaXMuc29ja2V0LmVuZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXB0Q2h1bmsoZGF0YTogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRpZiAoZGF0YS5ieXRlTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5jb21pbmdEYXRhLmFjY2VwdENodW5rKGRhdGEpO1xuXG5cdFx0d2hpbGUgKHRoaXMuX2luY29taW5nRGF0YS5ieXRlTGVuZ3RoID49IHRoaXMuX3N0YXRlLnJlYWRMZW4pIHtcblxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLnN0YXRlID09PSBSZWFkU3RhdGUuUGVla0hlYWRlcikge1xuXHRcdFx0XHQvLyBwZWVrIHRvIHNlZSBpZiB3ZSBjYW4gcmVhZCB0aGUgZW50aXJlIGhlYWRlclxuXHRcdFx0XHRjb25zdCBwZWVrSGVhZGVyID0gdGhpcy5faW5jb21pbmdEYXRhLnBlZWsodGhpcy5fc3RhdGUucmVhZExlbik7XG5cdFx0XHRcdGNvbnN0IGZpcnN0Qnl0ZSA9IHBlZWtIZWFkZXIucmVhZFVJbnQ4KDApO1xuXHRcdFx0XHRjb25zdCBmaW5CaXQgPSAoZmlyc3RCeXRlICYgMGIxMDAwMDAwMCkgPj4+IDc7XG5cdFx0XHRcdGNvbnN0IHJzdjFCaXQgPSAoZmlyc3RCeXRlICYgMGIwMTAwMDAwMCkgPj4+IDY7XG5cdFx0XHRcdGNvbnN0IG9wY29kZSA9IChmaXJzdEJ5dGUgJiAwYjAwMDAxMTExKTtcblxuXHRcdFx0XHRjb25zdCBzZWNvbmRCeXRlID0gcGVla0hlYWRlci5yZWFkVUludDgoMSk7XG5cdFx0XHRcdGNvbnN0IGhhc01hc2sgPSAoc2Vjb25kQnl0ZSAmIDBiMTAwMDAwMDApID4+PiA3O1xuXHRcdFx0XHRjb25zdCBsZW4gPSAoc2Vjb25kQnl0ZSAmIDBiMDExMTExMTEpO1xuXG5cdFx0XHRcdHRoaXMuX3N0YXRlLnN0YXRlID0gUmVhZFN0YXRlLlJlYWRIZWFkZXI7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRMZW4gPSBDb25zdGFudHMuTWluSGVhZGVyQnl0ZVNpemUgKyAoaGFzTWFzayA/IDQgOiAwKSArIChsZW4gPT09IDEyNiA/IDIgOiAwKSArIChsZW4gPT09IDEyNyA/IDggOiAwKTtcblx0XHRcdFx0dGhpcy5fc3RhdGUuZmluID0gZmluQml0O1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUuZmlyc3RGcmFtZU9mTWVzc2FnZSkge1xuXHRcdFx0XHRcdC8vIGlmIHRoZSBmcmFtZSBpcyBjb21wcmVzc2VkLCB0aGUgUlNWMSBiaXQgaXMgc2V0IG9ubHkgZm9yIHRoZSBmaXJzdCBmcmFtZSBvZiB0aGUgbWVzc2FnZVxuXHRcdFx0XHRcdHRoaXMuX3N0YXRlLmNvbXByZXNzZWQgPSBCb29sZWFuKHJzdjFCaXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmZpcnN0RnJhbWVPZk1lc3NhZ2UgPSBCb29sZWFuKGZpbkJpdCk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLm1hc2sgPSAwO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5vcGNvZGUgPSBvcGNvZGU7XG5cblx0XHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLldlYlNvY2tldE5vZGVTb2NrZXRQZWVrZWRIZWFkZXIsIHsgaGVhZGVyU2l6ZTogdGhpcy5fc3RhdGUucmVhZExlbiwgY29tcHJlc3NlZDogdGhpcy5fc3RhdGUuY29tcHJlc3NlZCwgZmluOiB0aGlzLl9zdGF0ZS5maW4sIG9wY29kZTogdGhpcy5fc3RhdGUub3Bjb2RlIH0pO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlLnN0YXRlID09PSBSZWFkU3RhdGUuUmVhZEhlYWRlcikge1xuXHRcdFx0XHQvLyByZWFkIGVudGlyZSBoZWFkZXJcblx0XHRcdFx0Y29uc3QgaGVhZGVyID0gdGhpcy5faW5jb21pbmdEYXRhLnJlYWQodGhpcy5fc3RhdGUucmVhZExlbik7XG5cdFx0XHRcdGNvbnN0IHNlY29uZEJ5dGUgPSBoZWFkZXIucmVhZFVJbnQ4KDEpO1xuXHRcdFx0XHRjb25zdCBoYXNNYXNrID0gKHNlY29uZEJ5dGUgJiAwYjEwMDAwMDAwKSA+Pj4gNztcblx0XHRcdFx0bGV0IGxlbiA9IChzZWNvbmRCeXRlICYgMGIwMTExMTExMSk7XG5cblx0XHRcdFx0bGV0IG9mZnNldCA9IDE7XG5cdFx0XHRcdGlmIChsZW4gPT09IDEyNikge1xuXHRcdFx0XHRcdGxlbiA9IChcblx0XHRcdFx0XHRcdGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMiAqKiA4XG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSBlbHNlIGlmIChsZW4gPT09IDEyNykge1xuXHRcdFx0XHRcdGxlbiA9IChcblx0XHRcdFx0XHRcdGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDBcblx0XHRcdFx0XHRcdCsgaGVhZGVyLnJlYWRVSW50OCgrK29mZnNldCkgKiAwXG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDIgKiogMjRcblx0XHRcdFx0XHRcdCsgaGVhZGVyLnJlYWRVSW50OCgrK29mZnNldCkgKiAyICoqIDE2XG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMiAqKiA4XG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBtYXNrID0gMDtcblx0XHRcdFx0aWYgKGhhc01hc2spIHtcblx0XHRcdFx0XHRtYXNrID0gKFxuXHRcdFx0XHRcdFx0aGVhZGVyLnJlYWRVSW50OCgrK29mZnNldCkgKiAyICoqIDI0XG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMiAqKiAxNlxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDIgKiogOFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9zdGF0ZS5zdGF0ZSA9IFJlYWRTdGF0ZS5SZWFkQm9keTtcblx0XHRcdFx0dGhpcy5fc3RhdGUucmVhZExlbiA9IGxlbjtcblx0XHRcdFx0dGhpcy5fc3RhdGUubWFzayA9IG1hc2s7XG5cblx0XHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLldlYlNvY2tldE5vZGVTb2NrZXRQZWVrZWRIZWFkZXIsIHsgYm9keVNpemU6IHRoaXMuX3N0YXRlLnJlYWRMZW4sIGNvbXByZXNzZWQ6IHRoaXMuX3N0YXRlLmNvbXByZXNzZWQsIGZpbjogdGhpcy5fc3RhdGUuZmluLCBtYXNrOiB0aGlzLl9zdGF0ZS5tYXNrLCBvcGNvZGU6IHRoaXMuX3N0YXRlLm9wY29kZSB9KTtcblxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0ZS5zdGF0ZSA9PT0gUmVhZFN0YXRlLlJlYWRCb2R5KSB7XG5cdFx0XHRcdC8vIHJlYWQgYm9keVxuXG5cdFx0XHRcdGNvbnN0IGJvZHkgPSB0aGlzLl9pbmNvbWluZ0RhdGEucmVhZCh0aGlzLl9zdGF0ZS5yZWFkTGVuKTtcblx0XHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLldlYlNvY2tldE5vZGVTb2NrZXRSZWFkRGF0YSwgYm9keSk7XG5cblx0XHRcdFx0dW5tYXNrKGJvZHksIHRoaXMuX3N0YXRlLm1hc2spO1xuXHRcdFx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuV2ViU29ja2V0Tm9kZVNvY2tldFVubWFza2VkRGF0YSwgYm9keSk7XG5cblx0XHRcdFx0dGhpcy5fc3RhdGUuc3RhdGUgPSBSZWFkU3RhdGUuUGVla0hlYWRlcjtcblx0XHRcdFx0dGhpcy5fc3RhdGUucmVhZExlbiA9IENvbnN0YW50cy5NaW5IZWFkZXJCeXRlU2l6ZTtcblx0XHRcdFx0dGhpcy5fc3RhdGUubWFzayA9IDA7XG5cblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlLm9wY29kZSA8PSAweDAyIC8qIENvbnRpbnVhdGlvbiBmcmFtZSBvciBUZXh0IGZyYW1lIG9yIGJpbmFyeSBmcmFtZSAqLykge1xuXHRcdFx0XHRcdHRoaXMuX2Zsb3dNYW5hZ2VyLmFjY2VwdEZyYW1lKGJvZHksIHRoaXMuX3N0YXRlLmNvbXByZXNzZWQsICEhdGhpcy5fc3RhdGUuZmluKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0ZS5vcGNvZGUgPT09IDB4MDkgLyogUGluZyBmcmFtZSAqLykge1xuXHRcdFx0XHRcdC8vIFBpbmcgZnJhbWVzIGNvdWxkIGJlIHNlbmQgYnkgc29tZSBicm93c2VycyBlLmcuIEZpcmVmb3hcblx0XHRcdFx0XHR0aGlzLl9mbG93TWFuYWdlci53cml0ZU1lc3NhZ2UoYm9keSwgeyBjb21wcmVzc2VkOiBmYWxzZSwgb3Bjb2RlOiAweDBBIC8qIFBvbmcgZnJhbWUgKi8gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLldlYlNvY2tldE5vZGVTb2NrZXREcmFpbkJlZ2luKTtcblx0XHRpZiAodGhpcy5fZmxvd01hbmFnZXIuaXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSgpKSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5fZmxvd01hbmFnZXIub25EaWRGaW5pc2hQcm9jZXNzaW5nV3JpdGVRdWV1ZSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc29ja2V0LmRyYWluKCk7XG5cdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLldlYlNvY2tldE5vZGVTb2NrZXREcmFpbkVuZCk7XG5cdH1cbn1cblxuY2xhc3MgV2ViU29ja2V0Rmxvd01hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXJyb3I+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25FcnJvciA9IHRoaXMuX29uRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfemxpYkluZmxhdGVTdHJlYW06IFpsaWJJbmZsYXRlU3RyZWFtIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfemxpYkRlZmxhdGVTdHJlYW06IFpsaWJEZWZsYXRlU3RyZWFtIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfd3JpdGVRdWV1ZTogeyBkYXRhOiBWU0J1ZmZlcjsgb3B0aW9uczogRnJhbWVPcHRpb25zIH1bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWFkUXVldWU6IHsgZGF0YTogVlNCdWZmZXI7IGlzQ29tcHJlc3NlZDogYm9vbGVhbjsgaXNMYXN0RnJhbWVPZk1lc3NhZ2U6IGJvb2xlYW4gfVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaW5pc2hQcm9jZXNzaW5nUmVhZFF1ZXVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEZpbmlzaFByb2Nlc3NpbmdSZWFkUXVldWUgPSB0aGlzLl9vbkRpZEZpbmlzaFByb2Nlc3NpbmdSZWFkUXVldWUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaW5pc2hQcm9jZXNzaW5nV3JpdGVRdWV1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRGaW5pc2hQcm9jZXNzaW5nV3JpdGVRdWV1ZSA9IHRoaXMuX29uRGlkRmluaXNoUHJvY2Vzc2luZ1dyaXRlUXVldWUuZXZlbnQ7XG5cblx0cHVibGljIGdldCBwZXJtZXNzYWdlRGVmbGF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gQm9vbGVhbih0aGlzLl96bGliSW5mbGF0ZVN0cmVhbSAmJiB0aGlzLl96bGliRGVmbGF0ZVN0cmVhbSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlY29yZGVkSW5mbGF0ZUJ5dGVzKCk6IFZTQnVmZmVyIHtcblx0XHRpZiAodGhpcy5femxpYkluZmxhdGVTdHJlYW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl96bGliSW5mbGF0ZVN0cmVhbS5yZWNvcmRlZEluZmxhdGVCeXRlcztcblx0XHR9XG5cdFx0cmV0dXJuIFZTQnVmZmVyLmFsbG9jKDApO1xuXHR9XG5cblx0cHVibGljIHNldFJlY29yZEluZmxhdGVCeXRlcyhyZWNvcmQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl96bGliSW5mbGF0ZVN0cmVhbT8uc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKHJlY29yZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90cmFjZXI6IElTb2NrZXRUcmFjZXIsXG5cdFx0cGVybWVzc2FnZURlZmxhdGU6IGJvb2xlYW4sXG5cdFx0aW5mbGF0ZUJ5dGVzOiBWU0J1ZmZlciB8IG51bGwsXG5cdFx0cmVjb3JkSW5mbGF0ZUJ5dGVzOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGF0YTogRW1pdHRlcjxWU0J1ZmZlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd3JpdGVGbjogKGRhdGE6IFZTQnVmZmVyLCBvcHRpb25zOiBGcmFtZU9wdGlvbnMpID0+IHZvaWRcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAocGVybWVzc2FnZURlZmxhdGUpIHtcblx0XHRcdC8vIFNlZSBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNzY5MiNwYWdlLTE2XG5cdFx0XHQvLyBUbyBzaW1wbGlmeSBvdXIgbG9naWMsIHdlIGRvbid0IG5lZ290aWF0ZSB0aGUgd2luZG93IHNpemVcblx0XHRcdC8vIGFuZCBzaW1wbHkgZGVkaWNhdGUgKDJeMTUpIC8gMzJrYiBwZXIgd2ViIHNvY2tldFxuXHRcdFx0dGhpcy5femxpYkluZmxhdGVTdHJlYW0gPSB0aGlzLl9yZWdpc3RlcihuZXcgWmxpYkluZmxhdGVTdHJlYW0odGhpcy5fdHJhY2VyLCByZWNvcmRJbmZsYXRlQnl0ZXMsIGluZmxhdGVCeXRlcywgeyB3aW5kb3dCaXRzOiAxNSB9KSk7XG5cdFx0XHR0aGlzLl96bGliRGVmbGF0ZVN0cmVhbSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBabGliRGVmbGF0ZVN0cmVhbSh0aGlzLl90cmFjZXIsIHsgd2luZG93Qml0czogMTUgfSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5femxpYkluZmxhdGVTdHJlYW0ub25FcnJvcigoZXJyKSA9PiB0aGlzLl9vbkVycm9yLmZpcmUoZXJyKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5femxpYkRlZmxhdGVTdHJlYW0ub25FcnJvcigoZXJyKSA9PiB0aGlzLl9vbkVycm9yLmZpcmUoZXJyKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl96bGliSW5mbGF0ZVN0cmVhbSA9IG51bGw7XG5cdFx0XHR0aGlzLl96bGliRGVmbGF0ZVN0cmVhbSA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHdyaXRlTWVzc2FnZShkYXRhOiBWU0J1ZmZlciwgb3B0aW9uczogRnJhbWVPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fd3JpdGVRdWV1ZS5wdXNoKHsgZGF0YSwgb3B0aW9ucyB9KTtcblx0XHR0aGlzLl9wcm9jZXNzV3JpdGVRdWV1ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSA9IGZhbHNlO1xuXHRwcml2YXRlIGFzeW5jIF9wcm9jZXNzV3JpdGVRdWV1ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdXcml0ZVF1ZXVlID0gdHJ1ZTtcblx0XHR3aGlsZSAodGhpcy5fd3JpdGVRdWV1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCB7IGRhdGEsIG9wdGlvbnMgfSA9IHRoaXMuX3dyaXRlUXVldWUuc2hpZnQoKSE7XG5cdFx0XHRpZiAodGhpcy5femxpYkRlZmxhdGVTdHJlYW0gJiYgb3B0aW9ucy5jb21wcmVzc2VkKSB7XG5cdFx0XHRcdGNvbnN0IGNvbXByZXNzZWREYXRhID0gYXdhaXQgdGhpcy5fZGVmbGF0ZU1lc3NhZ2UodGhpcy5femxpYkRlZmxhdGVTdHJlYW0sIGRhdGEpO1xuXHRcdFx0XHR0aGlzLl93cml0ZUZuKGNvbXByZXNzZWREYXRhLCBvcHRpb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3dyaXRlRm4oZGF0YSwgeyAuLi5vcHRpb25zLCBjb21wcmVzc2VkOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX29uRGlkRmluaXNoUHJvY2Vzc2luZ1dyaXRlUXVldWUuZmlyZSgpO1xuXHR9XG5cblx0cHVibGljIGlzUHJvY2Vzc2luZ1dyaXRlUXVldWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9pc1Byb2Nlc3NpbmdXcml0ZVF1ZXVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJzZXF1ZW50IGNhbGxzIHNob3VsZCB3YWl0IGZvciB0aGUgcHJldmlvdXMgYF9kZWZsYXRlQnVmZmVyYCBjYWxsIHRvIGNvbXBsZXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVmbGF0ZU1lc3NhZ2UoemxpYkRlZmxhdGVTdHJlYW06IFpsaWJEZWZsYXRlU3RyZWFtLCBidWZmZXI6IFZTQnVmZmVyKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxWU0J1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0emxpYkRlZmxhdGVTdHJlYW0ud3JpdGUoYnVmZmVyKTtcblx0XHRcdHpsaWJEZWZsYXRlU3RyZWFtLmZsdXNoKGRhdGEgPT4gcmVzb2x2ZShkYXRhKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0RnJhbWUoZGF0YTogVlNCdWZmZXIsIGlzQ29tcHJlc3NlZDogYm9vbGVhbiwgaXNMYXN0RnJhbWVPZk1lc3NhZ2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWFkUXVldWUucHVzaCh7IGRhdGEsIGlzQ29tcHJlc3NlZCwgaXNMYXN0RnJhbWVPZk1lc3NhZ2UgfSk7XG5cdFx0dGhpcy5fcHJvY2Vzc1JlYWRRdWV1ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNQcm9jZXNzaW5nUmVhZFF1ZXVlID0gZmFsc2U7XG5cdHByaXZhdGUgYXN5bmMgX3Byb2Nlc3NSZWFkUXVldWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzUHJvY2Vzc2luZ1JlYWRRdWV1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdSZWFkUXVldWUgPSB0cnVlO1xuXHRcdHdoaWxlICh0aGlzLl9yZWFkUXVldWUubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZnJhbWVJbmZvID0gdGhpcy5fcmVhZFF1ZXVlLnNoaWZ0KCkhO1xuXHRcdFx0aWYgKHRoaXMuX3psaWJJbmZsYXRlU3RyZWFtICYmIGZyYW1lSW5mby5pc0NvbXByZXNzZWQpIHtcblx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZGF0YXRyYWNrZXIuaWV0Zi5vcmcvZG9jL2h0bWwvcmZjNzY5MiNzZWN0aW9uLTkuMlxuXHRcdFx0XHQvLyBFdmVuIGlmIHBlcm1lc3NhZ2VEZWZsYXRlIGlzIG5lZ290aWF0ZWQsIGl0IGlzIHBvc3NpYmxlXG5cdFx0XHRcdC8vIHRoYXQgdGhlIG90aGVyIHNpZGUgbWlnaHQgZGVjaWRlIHRvIHNlbmQgdW5jb21wcmVzc2VkIG1lc3NhZ2VzXG5cdFx0XHRcdC8vIFNvIG9ubHkgZGVjb21wcmVzcyBtZXNzYWdlcyB0aGF0IGhhdmUgdGhlIFJTViAxIGJpdCBzZXRcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMuX2luZmxhdGVGcmFtZSh0aGlzLl96bGliSW5mbGF0ZVN0cmVhbSwgZnJhbWVJbmZvLmRhdGEsIGZyYW1lSW5mby5pc0xhc3RGcmFtZU9mTWVzc2FnZSk7XG5cdFx0XHRcdHRoaXMuX29uRGF0YS5maXJlKGRhdGEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25EYXRhLmZpcmUoZnJhbWVJbmZvLmRhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdSZWFkUXVldWUgPSBmYWxzZTtcblx0XHR0aGlzLl9vbkRpZEZpbmlzaFByb2Nlc3NpbmdSZWFkUXVldWUuZmlyZSgpO1xuXHR9XG5cblx0cHVibGljIGlzUHJvY2Vzc2luZ1JlYWRRdWV1ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX2lzUHJvY2Vzc2luZ1JlYWRRdWV1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2VxdWVudCBjYWxscyBzaG91bGQgd2FpdCBmb3IgdGhlIHByZXZpb3VzIGB0cmFuc2Zvcm1SZWFkYCBjYWxsIHRvIGNvbXBsZXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5mbGF0ZUZyYW1lKHpsaWJJbmZsYXRlU3RyZWFtOiBabGliSW5mbGF0ZVN0cmVhbSwgYnVmZmVyOiBWU0J1ZmZlciwgaXNMYXN0RnJhbWVPZk1lc3NhZ2U6IGJvb2xlYW4pOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFZTQnVmZmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzc2OTIjc2VjdGlvbi03LjIuMlxuXHRcdFx0emxpYkluZmxhdGVTdHJlYW0ud3JpdGUoYnVmZmVyKTtcblx0XHRcdGlmIChpc0xhc3RGcmFtZU9mTWVzc2FnZSkge1xuXHRcdFx0XHR6bGliSW5mbGF0ZVN0cmVhbS53cml0ZShWU0J1ZmZlci5mcm9tQnl0ZUFycmF5KFsweDAwLCAweDAwLCAweGZmLCAweGZmXSkpO1xuXHRcdFx0fVxuXHRcdFx0emxpYkluZmxhdGVTdHJlYW0uZmx1c2goZGF0YSA9PiByZXNvbHZlKGRhdGEpKTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBabGliSW5mbGF0ZVN0cmVhbSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFcnJvcj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkVycm9yID0gdGhpcy5fb25FcnJvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF96bGliSW5mbGF0ZTogSW5mbGF0ZVJhdztcblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb3JkZWRJbmZsYXRlQnl0ZXM6IFZTQnVmZmVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0luZmxhdGVEYXRhOiBWU0J1ZmZlcltdID0gW107XG5cdHByaXZhdGUgX3JlY29yZEluZmxhdGVCeXRlczogYm9vbGVhbjtcblxuXHRwdWJsaWMgZ2V0IHJlY29yZGVkSW5mbGF0ZUJ5dGVzKCk6IFZTQnVmZmVyIHtcblx0XHRpZiAodGhpcy5fcmVjb3JkSW5mbGF0ZUJ5dGVzKSB7XG5cdFx0XHRyZXR1cm4gVlNCdWZmZXIuY29uY2F0KHRoaXMuX3JlY29yZGVkSW5mbGF0ZUJ5dGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFZTQnVmZmVyLmFsbG9jKDApO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhY2VyOiBJU29ja2V0VHJhY2VyLFxuXHRcdHJlY29yZEluZmxhdGVCeXRlczogYm9vbGVhbixcblx0XHRpbmZsYXRlQnl0ZXM6IFZTQnVmZmVyIHwgbnVsbCxcblx0XHRvcHRpb25zOiBabGliT3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlY29yZEluZmxhdGVCeXRlcyA9IHJlY29yZEluZmxhdGVCeXRlcztcblx0XHR0aGlzLl96bGliSW5mbGF0ZSA9IGNyZWF0ZUluZmxhdGVSYXcob3B0aW9ucyk7XG5cdFx0dGhpcy5femxpYkluZmxhdGUub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcblx0XHRcdHRoaXMuX3RyYWNlci50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLnpsaWJJbmZsYXRlRXJyb3IsIHsgbWVzc2FnZTogZXJyPy5tZXNzYWdlLCBjb2RlOiAoZXJyIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbik/LmNvZGUgfSk7XG5cdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUoZXJyKTtcblx0XHR9KTtcblx0XHR0aGlzLl96bGliSW5mbGF0ZS5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdHRoaXMuX3RyYWNlci50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLnpsaWJJbmZsYXRlRGF0YSwgZGF0YSk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nSW5mbGF0ZURhdGEucHVzaChWU0J1ZmZlci53cmFwKGRhdGEpKTtcblx0XHR9KTtcblx0XHRpZiAoaW5mbGF0ZUJ5dGVzKSB7XG5cdFx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliSW5mbGF0ZUluaXRpYWxXcml0ZSwgaW5mbGF0ZUJ5dGVzLmJ1ZmZlcik7XG5cdFx0XHR0aGlzLl96bGliSW5mbGF0ZS53cml0ZShpbmZsYXRlQnl0ZXMuYnVmZmVyKTtcblx0XHRcdHRoaXMuX3psaWJJbmZsYXRlLmZsdXNoKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkluZmxhdGVJbml0aWFsRmx1c2hGaXJlZCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdJbmZsYXRlRGF0YS5sZW5ndGggPSAwO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVjb3JkSW5mbGF0ZUJ5dGVzKSB7XG5cdFx0XHR0aGlzLl9yZWNvcmRlZEluZmxhdGVCeXRlcy5wdXNoKGJ1ZmZlci5jbG9uZSgpKTtcblx0XHR9XG5cdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkluZmxhdGVXcml0ZSwgYnVmZmVyKTtcblx0XHR0aGlzLl96bGliSW5mbGF0ZS53cml0ZShidWZmZXIuYnVmZmVyKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRSZWNvcmRJbmZsYXRlQnl0ZXMocmVjb3JkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb3JkSW5mbGF0ZUJ5dGVzID0gcmVjb3JkO1xuXHRcdGlmICghcmVjb3JkKSB7XG5cdFx0XHR0aGlzLl9yZWNvcmRlZEluZmxhdGVCeXRlcy5sZW5ndGggPSAwO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmbHVzaChjYWxsYmFjazogKGRhdGE6IFZTQnVmZmVyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5femxpYkluZmxhdGUuZmx1c2goKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkluZmxhdGVGbHVzaEZpcmVkKTtcblx0XHRcdGNvbnN0IGRhdGEgPSBWU0J1ZmZlci5jb25jYXQodGhpcy5fcGVuZGluZ0luZmxhdGVEYXRhKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdJbmZsYXRlRGF0YS5sZW5ndGggPSAwO1xuXHRcdFx0Y2FsbGJhY2soZGF0YSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNvcmRlZEluZmxhdGVCeXRlcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3BlbmRpbmdJbmZsYXRlRGF0YS5sZW5ndGggPSAwO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl96bGliSW5mbGF0ZS5jbG9zZSgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlIGVycm9ycyB3aGlsZSBkaXNwb3Npbmdcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFpsaWJEZWZsYXRlU3RyZWFtIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEVycm9yPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRXJyb3IgPSB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3psaWJEZWZsYXRlOiBEZWZsYXRlUmF3O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nRGVmbGF0ZURhdGE6IFZTQnVmZmVyW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90cmFjZXI6IElTb2NrZXRUcmFjZXIsXG5cdFx0b3B0aW9uczogWmxpYk9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3psaWJEZWZsYXRlID0gY3JlYXRlRGVmbGF0ZVJhdyh7XG5cdFx0XHR3aW5kb3dCaXRzOiAxNVxuXHRcdH0pO1xuXHRcdHRoaXMuX3psaWJEZWZsYXRlLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliRGVmbGF0ZUVycm9yLCB7IG1lc3NhZ2U6IGVycj8ubWVzc2FnZSwgY29kZTogKGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pPy5jb2RlIH0pO1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKGVycik7XG5cdFx0fSk7XG5cdFx0dGhpcy5femxpYkRlZmxhdGUub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliRGVmbGF0ZURhdGEsIGRhdGEpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0RlZmxhdGVEYXRhLnB1c2goVlNCdWZmZXIud3JhcChkYXRhKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGUoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMuX3RyYWNlci50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLnpsaWJEZWZsYXRlV3JpdGUsIGJ1ZmZlci5idWZmZXIpO1xuXHRcdHRoaXMuX3psaWJEZWZsYXRlLndyaXRlKDxCdWZmZXI+YnVmZmVyLmJ1ZmZlcik7XG5cdH1cblxuXHRwdWJsaWMgZmx1c2goY2FsbGJhY2s6IChkYXRhOiBWU0J1ZmZlcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdC8vIFNlZSBodHRwczovL3psaWIubmV0L21hbnVhbC5odG1sI0NvbnN0YW50c1xuXHRcdHRoaXMuX3psaWJEZWZsYXRlLmZsdXNoKC8qWl9TWU5DX0ZMVVNIKi8yLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliRGVmbGF0ZUZsdXNoRmlyZWQpO1xuXG5cdFx0XHRsZXQgZGF0YSA9IFZTQnVmZmVyLmNvbmNhdCh0aGlzLl9wZW5kaW5nRGVmbGF0ZURhdGEpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0RlZmxhdGVEYXRhLmxlbmd0aCA9IDA7XG5cblx0XHRcdC8vIFNlZSBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNzY5MiNzZWN0aW9uLTcuMi4xXG5cdFx0XHRkYXRhID0gZGF0YS5zbGljZSgwLCBkYXRhLmJ5dGVMZW5ndGggLSA0KTtcblxuXHRcdFx0Y2FsbGJhY2soZGF0YSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nRGVmbGF0ZURhdGEubGVuZ3RoID0gMDtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5femxpYkRlZmxhdGUuY2xvc2UoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZSBlcnJvcnMgd2hpbGUgZGlzcG9zaW5nXG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiB1bm1hc2soYnVmZmVyOiBWU0J1ZmZlciwgbWFzazogbnVtYmVyKTogdm9pZCB7XG5cdGlmIChtYXNrID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGNudCA9IGJ1ZmZlci5ieXRlTGVuZ3RoID4+PiAyO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGNudDsgaSsrKSB7XG5cdFx0Y29uc3QgdiA9IGJ1ZmZlci5yZWFkVUludDMyQkUoaSAqIDQpO1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQzMkJFKHYgXiBtYXNrLCBpICogNCk7XG5cdH1cblx0Y29uc3Qgb2Zmc2V0ID0gY250ICogNDtcblx0Y29uc3QgYnl0ZXNMZWZ0ID0gYnVmZmVyLmJ5dGVMZW5ndGggLSBvZmZzZXQ7XG5cdGNvbnN0IG0zID0gKG1hc2sgPj4+IDI0KSAmIDBiMTExMTExMTE7XG5cdGNvbnN0IG0yID0gKG1hc2sgPj4+IDE2KSAmIDBiMTExMTExMTE7XG5cdGNvbnN0IG0xID0gKG1hc2sgPj4+IDgpICYgMGIxMTExMTExMTtcblx0aWYgKGJ5dGVzTGVmdCA+PSAxKSB7XG5cdFx0YnVmZmVyLndyaXRlVUludDgoYnVmZmVyLnJlYWRVSW50OChvZmZzZXQpIF4gbTMsIG9mZnNldCk7XG5cdH1cblx0aWYgKGJ5dGVzTGVmdCA+PSAyKSB7XG5cdFx0YnVmZmVyLndyaXRlVUludDgoYnVmZmVyLnJlYWRVSW50OChvZmZzZXQgKyAxKSBeIG0yLCBvZmZzZXQgKyAxKTtcblx0fVxuXHRpZiAoYnl0ZXNMZWZ0ID49IDMpIHtcblx0XHRidWZmZXIud3JpdGVVSW50OChidWZmZXIucmVhZFVJbnQ4KG9mZnNldCArIDIpIF4gbTEsIG9mZnNldCArIDIpO1xuXHR9XG59XG5cbi8vIFJlYWQgdGhpcyBiZWZvcmUgdGhlcmUncyBhbnkgY2hhbmNlIGl0IGlzIG92ZXJ3cml0dGVuXG4vLyBSZWxhdGVkIHRvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMDYyNFxuZXhwb3J0IGNvbnN0IFhER19SVU5USU1FX0RJUiA9IHByb2Nlc3MuZW52WydYREdfUlVOVElNRV9ESVInXTtcblxuY29uc3Qgc2FmZUlwY1BhdGhMZW5ndGhzOiB7IFtwbGF0Zm9ybTogbnVtYmVyXTogbnVtYmVyIH0gPSB7XG5cdFtQbGF0Zm9ybS5MaW51eF06IDEwNyxcblx0W1BsYXRmb3JtLk1hY106IDEwM1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJhbmRvbUlQQ0hhbmRsZSgpOiBzdHJpbmcge1xuXHRjb25zdCByYW5kb21TdWZmaXggPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHQvLyBXaW5kb3dzOiB1c2UgbmFtZWQgcGlwZVxuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuXHRcdHJldHVybiBgXFxcXFxcXFwuXFxcXHBpcGVcXFxcdnNjb2RlLWlwYy0ke3JhbmRvbVN1ZmZpeH0tc29ja2A7XG5cdH1cblxuXHQvLyBNYWMgJiBVbml4OiBVc2Ugc29ja2V0IGZpbGVcblx0Ly8gVW5peDogUHJlZmVyIFhER19SVU5USU1FX0RJUiBvdmVyIHVzZXIgZGF0YSBwYXRoXG5cdGNvbnN0IGJhc2VQYXRoID0gcHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2RhcndpbicgJiYgWERHX1JVTlRJTUVfRElSID8gWERHX1JVTlRJTUVfRElSIDogdG1wZGlyKCk7XG5cblx0Ly8gQXMgb2YgTm9kZS5qcyAyNCwgc29ja2V0IHBhdGhzIHRoYXQgZXhjZWVkIHRoZVxuXHQvLyBwbGF0Zm9ybSBsaW1pdCBjYXVzZSBhbiBgRUlOVkFMYCBlcnJvciBhdCBiaW5kIHRpbWUgaW5zdGVhZCBvZiBiZWluZyBzaWxlbnRseVxuXHQvLyB0cnVuY2F0ZWQuIFRoZSBzdWZmaXggb25seSBuZWVkcyB0byBiZSB1bmlxdWUsIHNvIHRyaW0gaXQgKHdoaWxlIGtlZXBpbmcgZW5vdWdoXG5cdC8vIGVudHJvcHkpIHRvIG1ha2UgdGhlIHBhdGggZml0IHdpdGhpbiB0aGUgbGltaXQuXG5cdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvY29tbWl0Lzc1ODg0Njc4ZDdlN2VmMjI4YzhmOGY4MmI0YzA4NTI1OGM3MGE4MjNcblx0Y29uc3QgbGltaXQgPSBzYWZlSXBjUGF0aExlbmd0aHNbcGxhdGZvcm1dO1xuXHRsZXQgc3VmZml4ID0gcmFuZG9tU3VmZml4O1xuXHRpZiAodHlwZW9mIGxpbWl0ID09PSAnbnVtYmVyJykge1xuXHRcdGNvbnN0IGF2YWlsYWJsZSA9IE1hdGgubWF4KDAsIChsaW1pdCAtIDEpIC0gam9pbihiYXNlUGF0aCwgYHZzY29kZS1pcGMtLnNvY2tgKS5sZW5ndGgpO1xuXHRcdGlmIChhdmFpbGFibGUgPCBzdWZmaXgubGVuZ3RoKSB7XG5cdFx0XHRzdWZmaXggPSBzdWZmaXguc2xpY2UoMCwgYXZhaWxhYmxlKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gam9pbihiYXNlUGF0aCwgYHZzY29kZS1pcGMtJHtzdWZmaXh9LnNvY2tgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN0YXRpY0lQQ0hhbmRsZShkaXJlY3RvcnlQYXRoOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2NvcGUgPSBjcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoZGlyZWN0b3J5UGF0aCkuZGlnZXN0KCdoZXgnKTtcblx0Y29uc3Qgc2NvcGVGb3JTb2NrZXQgPSBzY29wZS5zdWJzdHIoMCwgOCk7XG5cblx0Ly8gV2luZG93czogdXNlIG5hbWVkIHBpcGVcblx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcblx0XHRyZXR1cm4gYFxcXFxcXFxcLlxcXFxwaXBlXFxcXCR7c2NvcGVGb3JTb2NrZXR9LSR7dmVyc2lvbn0tJHt0eXBlfS1zb2NrYDtcblx0fVxuXG5cdC8vIE1hYyAmIFVuaXg6IFVzZSBzb2NrZXQgZmlsZVxuXHQvLyBVbml4OiBQcmVmZXIgWERHX1JVTlRJTUVfRElSIG92ZXIgdXNlciBkYXRhIHBhdGgsIHVubGVzcyBwb3J0YWJsZVxuXHQvLyBUcmltIHRoZSB2ZXJzaW9uIGFuZCB0eXBlIHZhbHVlcyBmb3IgdGhlIHNvY2tldCB0byBwcmV2ZW50IHRvbyBsYXJnZVxuXHQvLyBmaWxlIG5hbWVzIGNhdXNpbmcgaXNzdWVzOiBodHRwczovL3VuaXguc3RhY2tleGNoYW5nZS5jb20vcS8zNjcwMDhcblxuXHRjb25zdCB2ZXJzaW9uRm9yU29ja2V0ID0gdmVyc2lvbi5zdWJzdHIoMCwgNCk7XG5cdGNvbnN0IHR5cGVGb3JTb2NrZXQgPSB0eXBlLnN1YnN0cigwLCA2KTtcblxuXHRsZXQgcmVzdWx0OiBzdHJpbmc7XG5cdGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnZGFyd2luJyAmJiBYREdfUlVOVElNRV9ESVIgJiYgIXByb2Nlc3MuZW52WydWU0NPREVfUE9SVEFCTEUnXSkge1xuXHRcdHJlc3VsdCA9IGpvaW4oWERHX1JVTlRJTUVfRElSLCBgdnNjb2RlLSR7c2NvcGVGb3JTb2NrZXR9LSR7dmVyc2lvbkZvclNvY2tldH0tJHt0eXBlRm9yU29ja2V0fS5zb2NrYCk7XG5cdH0gZWxzZSB7XG5cdFx0cmVzdWx0ID0gam9pbihkaXJlY3RvcnlQYXRoLCBgJHt2ZXJzaW9uRm9yU29ja2V0fS0ke3R5cGVGb3JTb2NrZXR9LnNvY2tgKTtcblx0fVxuXG5cdC8vIFZhbGlkYXRlIGxlbmd0aC4gVW5saWtlIGBjcmVhdGVSYW5kb21JUENIYW5kbGVgLCB0aGUgcGF0aCBoZXJlIG11c3QgYmUgZGVyaXZlZFxuXHQvLyBkZXRlcm1pbmlzdGljYWxseSBmcm9tIGBkaXJlY3RvcnlQYXRoYCBzbyB0aGF0IHRoZSBzZXJ2ZXIgYW5kIGl0cyBjbGllbnRzIGFncmVlXG5cdC8vIG9uIHRoZSBzYW1lIHNvY2tldC4gVGhlcmUgaXMgbm8gcmFuZG9tIGNvbXBvbmVudCB0byB0cmltLCBzbyBhbiBvdmVyLWxvbmdcblx0Ly8gYC0tdXNlci1kYXRhLWRpcmAgY2FuIHN0aWxsIHByb2R1Y2UgYSBwYXRoIHRoYXQgZXhjZWVkcyB0aGUgcGxhdGZvcm0gbGltaXQuXG5cdHZhbGlkYXRlSVBDSGFuZGxlTGVuZ3RoKHJlc3VsdCk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVJUENIYW5kbGVMZW5ndGgoaGFuZGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgbGltaXQgPSBzYWZlSXBjUGF0aExlbmd0aHNbcGxhdGZvcm1dO1xuXHRpZiAodHlwZW9mIGxpbWl0ID09PSAnbnVtYmVyJyAmJiBoYW5kbGUubGVuZ3RoID49IGxpbWl0KSB7XG5cdFx0Ly8gaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9uZXQuaHRtbCNuZXRfaWRlbnRpZnlpbmdfcGF0aHNfZm9yX2lwY19jb25uZWN0aW9uc1xuXHRcdGNvbnNvbGUud2FybihgV0FSTklORzogSVBDIGhhbmRsZSBcIiR7aGFuZGxlfVwiIGlzIGxvbmdlciB0aGFuICR7bGltaXR9IGNoYXJzLCB0cnkgYSBzaG9ydGVyIC0tdXNlci1kYXRhLWRpcmApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXJ2ZXIgZXh0ZW5kcyBJUENTZXJ2ZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHRvQ2xpZW50Q29ubmVjdGlvbkV2ZW50KHNlcnZlcjogTmV0U2VydmVyKTogRXZlbnQ8Q2xpZW50Q29ubmVjdGlvbkV2ZW50PiB7XG5cdFx0Y29uc3Qgb25Db25uZWN0aW9uID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8U29ja2V0PihzZXJ2ZXIsICdjb25uZWN0aW9uJyk7XG5cblx0XHRyZXR1cm4gRXZlbnQubWFwKG9uQ29ubmVjdGlvbiwgc29ja2V0ID0+ICh7XG5cdFx0XHRwcm90b2NvbDogbmV3IFByb3RvY29sKG5ldyBOb2RlU29ja2V0KHNvY2tldCwgJ2lwYy1zZXJ2ZXItY29ubmVjdGlvbicpKSxcblx0XHRcdG9uRGlkQ2xpZW50RGlzY29ubmVjdDogRXZlbnQub25jZShFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjx2b2lkPihzb2NrZXQsICdjbG9zZScpKVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc2VydmVyOiBOZXRTZXJ2ZXIgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHNlcnZlcjogTmV0U2VydmVyKSB7XG5cdFx0c3VwZXIoU2VydmVyLnRvQ2xpZW50Q29ubmVjdGlvbkV2ZW50KHNlcnZlcikpO1xuXHRcdHRoaXMuc2VydmVyID0gc2VydmVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0aWYgKHRoaXMuc2VydmVyKSB7XG5cdFx0XHR0aGlzLnNlcnZlci5jbG9zZSgpO1xuXHRcdFx0dGhpcy5zZXJ2ZXIgPSBudWxsO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VydmUocG9ydDogbnVtYmVyKTogUHJvbWlzZTxTZXJ2ZXI+O1xuZXhwb3J0IGZ1bmN0aW9uIHNlcnZlKG5hbWVkUGlwZTogc3RyaW5nKTogUHJvbWlzZTxTZXJ2ZXI+O1xuZXhwb3J0IGZ1bmN0aW9uIHNlcnZlKGhvb2s6IG51bWJlciB8IHN0cmluZyk6IFByb21pc2U8U2VydmVyPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxTZXJ2ZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoKTtcblxuXHRcdHNlcnZlci5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdHNlcnZlci5saXN0ZW4oaG9vaywgKCkgPT4ge1xuXHRcdFx0c2VydmVyLnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRyZXNvbHZlKG5ldyBTZXJ2ZXIoc2VydmVyKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdChvcHRpb25zOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0sIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPENsaWVudD47XG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdChuYW1lZFBpcGU6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8Q2xpZW50PjtcbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0KGhvb2s6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSB8IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8Q2xpZW50PiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxDbGllbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRsZXQgc29ja2V0OiBTb2NrZXQ7XG5cblx0XHRjb25zdCBjYWxsYmFja0hhbmRsZXIgPSAoKSA9PiB7XG5cdFx0XHRzb2NrZXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdHJlc29sdmUoQ2xpZW50LmZyb21Tb2NrZXQobmV3IE5vZGVTb2NrZXQoc29ja2V0LCBgaXBjLWNsaWVudCR7Y2xpZW50SWR9YCksIGNsaWVudElkKSk7XG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgaG9vayA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHNvY2tldCA9IGNyZWF0ZUNvbm5lY3Rpb24oaG9vaywgY2FsbGJhY2tIYW5kbGVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c29ja2V0ID0gY3JlYXRlQ29ubmVjdGlvbihob29rLCBjYWxsYmFja0hhbmRsZXIpO1xuXHRcdH1cblxuXHRcdHNvY2tldC5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFFM0IsU0FBc0Msa0JBQWtCLG9CQUFvQjtBQUM1RSxTQUFTLGNBQWM7QUFDdkIsU0FBOEMsa0JBQWtCLHdCQUF3QjtBQUN4RixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFnQyxpQkFBaUI7QUFDakQsU0FBUyxhQUFhLFFBQWlCLFVBQTRCLHNCQUFzQixtQkFBbUIsa0NBQWtDO0FBRXZJLFNBQVMsaUJBQWlCLEtBQTJCLFFBQWdCO0FBQUEsRUFDM0U7QUFBQSxFQUNBLHNCQUFzQjtBQUFBLEVBQ3RCLDhCQUE4QjtBQUFBLEVBQzlCLHlCQUF5QjtB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YUFBUyxLQUFLLGVBQWUsR0FBRyxnQkFBZ0IsSUFBSSxhQUFhLE9BQU87QUFBQSxFQUN6RTtBQU1BLDBCQUF3QixNQUFNO0FBRTlCLFNBQU87QUFDUjtBQUVBLFNBQVMsd0JBQXdCLFFBQXNCO0FBQ3RELFFBQU0sUUFBUSxtQkFBbUIsUUFBUTtBQUN6QyxNQUFJLE9BQU8sVUFBVSxZQUFZLE9BQU8sVUFBVSxPQUFPO0FBRXhELFlBQVEsS0FBSyx3QkFBd0IsTUFBTSxvQkFBb0IsS0FBSyx1Q0FBdUM7QUFBQSxFQUM1RztBQUNEO0FBRU8sTUFBTSxlQUFlLFVBQVU7QUFBQSxFQUVyQyxPQUFlLHdCQUF3QixRQUFpRDtBQUN2RixVQUFNLGVBQWUsTUFBTSxxQkFBNkIsUUFBUSxZQUFZO0FBRTVFLFdBQU8sTUFBTSxJQUFJLGNBQWMsYUFBVztBQUFBLE1BQ3pDLFVBQVUsSUFBSSxTQUFTLElBQUksV0FBVyxRQUFRLHVCQUF1QixDQUFDO0FBQUEsTUFDdEUsdUJBQXVCLE1BQU0sS0FBSyxNQUFNLHFCQUEyQixRQUFRLE9BQU8sQ0FBQztBQUFBLElBQ3BGLEVBQUU7QUFBQSxFQUNIO0FBQUEsRUFJQSxZQUFZLFFBQW1CO0FBQzlCLFVBQU0sT0FBTyx3QkFBd0IsTUFBTSxDQUFDO0FBQzVDLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFFBQUksS0FBSyxRQUFRO0FBQ2hCLFdBQUssT0FBTyxNQUFNO0FBQ2xCLFdBQUssU0FBUztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQ0Q7QUFJTyxTQUFTLE1BQU0sTUFBd0M7QUFDN0QsU0FBTyxJQUFJLFFBQWdCLENBQUMsU0FBUyxXQUFXO0FBQy9DLFVBQU0sU0FBUyxhQUFhO0FBRTVCLFdBQU8sR0FBRyxTQUFTLE1BQU07QUFDekIsV0FBTyxPQUFPLE1BQU0sTUFBTTtBQUN6QixhQUFPLGVBQWUsU0FBUyxNQUFNO0FBQ3JDLGNBQVEsSUFBSSxPQUFPLE1BQU0sQ0FBQztBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQUlPLFNBQVMsUUFBUSxNQUErQyxVQUFtQztBQUN6RyxTQUFPLElBQUksUUFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFDL0MsUUFBSTtBQUVKLFVBQU0sa0JBQWtCLE1BQU07QUFDN0IsYUFBTyxlQUFlLFNBQVMsTUFBTTtBQUNyQyxjQUFRLE9BQU8sV0FBVyxJQUFJLFdBQVcsUUFBUSxhQUFhLFFBQVEsRUFBRSxHQUFHLFFBQVEsQ0FBQztBQUFBLElBQ3JGO0FBRUEsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixlQUFTLGlCQUFpQixNQUFNLGVBQWU7QUFBQSxJQUNoRCxPQUFPO0FBQ04sZUFBUyxpQkFBaUIsTUFBTSxlQUFlO0FBQUEsSUFDaEQ7QUFFQSxXQUFPLEtBQUssU0FBUyxNQUFNO0FBQUEsRUFDNUIsQ0FBQztBQUNGOyIsCiAgIm5hbWVzIjogWyJDb25zdGFudHMiLCAiUmVhZFN0YXRlIl0KfQo=
