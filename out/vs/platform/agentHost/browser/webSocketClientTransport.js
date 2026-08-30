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
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { connectionTokenQueryName } from "../../../base/common/network.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { AhpJsonlLogger, getAhpLogByteLength } from "../common/ahpJsonlLogger.js";
import { AgentHostClientConnectionKind } from "../common/agentHostTelemetry.js";
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from "../common/transportConstants.js";
let WebSocketClientTransport = class extends Disposable {
  constructor(_address, _connectionToken, ahpLogOptions, instantiationService) {
    super();
    this._address = _address;
    this._connectionToken = _connectionToken;
    this.clientConnectionKind = AgentHostClientConnectionKind.DirectWebSocket;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._onOpen = this._register(new Emitter());
    this.onOpen = this._onOpen.event;
    this._malformedFrames = 0;
    /** Guards against firing onClose more than once. */
    this._closeFired = false;
    if (ahpLogOptions) {
      this._ahpLogger = this._register(instantiationService.createInstance(AhpJsonlLogger, ahpLogOptions));
    }
  }
  get isOpen() {
    return this._ws?.readyState === WebSocket.OPEN;
  }
  /**
   * Initiate the WebSocket connection. Resolves when the connection
   * is open, or rejects on error/timeout.
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this._store.isDisposed) {
        reject(new Error("Transport is disposed"));
        return;
      }
      let url = this._address.startsWith("ws://") || this._address.startsWith("wss://") ? this._address : `ws://${this._address}`;
      if (this._connectionToken) {
        const separator = url.includes("?") ? "&" : "?";
        url += `${separator}${connectionTokenQueryName}=${encodeURIComponent(this._connectionToken)}`;
      }
      const ws = new WebSocket(url);
      this._ws = ws;
      const onOpen = () => {
        cleanup();
        this._onOpen.fire();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`WebSocket connection failed: ${this._address}`));
      };
      const onClose = () => {
        cleanup();
        reject(new Error(`WebSocket closed before connection was established: ${this._address}`));
      };
      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          this._malformedFrames++;
          if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
            const dataType = event.data instanceof ArrayBuffer ? "ArrayBuffer" : event.data instanceof Blob ? "Blob" : typeof event.data;
            const byteLen = event.data instanceof ArrayBuffer ? event.data.byteLength : event.data instanceof Blob ? event.data.size : 0;
            console.warn(
              `[WebSocketClientTransport] Non-string frame #${this._malformedFrames} (type=${dataType}, bytes=${byteLen})`
            );
          }
          if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
            console.warn(
              `[WebSocketClientTransport] Malformed frame threshold exceeded; forcing close of ${this._address}.`
            );
            this._ws?.close(4002, "malformed-frames");
          }
          return;
        }
        const text = event.data;
        let message;
        try {
          message = JSON.parse(text);
        } catch (err) {
          this._malformedFrames++;
          if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
            const preview = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
            console.warn(
              `[WebSocketClientTransport] Malformed frame #${this._malformedFrames} (len=${text.length}): ${preview}`,
              err instanceof Error ? err.message : String(err)
            );
          }
          if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
            console.warn(
              `[WebSocketClientTransport] Malformed frame threshold exceeded; forcing close of ${this._address}.`
            );
            this._ws?.close(4002, "malformed-frames");
          }
          return;
        }
        this._ahpLogger?.log(message, "s2c", getAhpLogByteLength(text));
        this._onMessage.fire(message);
      });
      ws.addEventListener("close", () => {
        if (!this._closeFired) {
          this._closeFired = true;
          this._onClose.fire();
        }
      });
      ws.addEventListener("error", () => {
        if (!this._closeFired) {
          this._closeFired = true;
          this._onClose.fire();
        }
      });
    });
  }
  /**
   * Send a message to the remote end. Returns `true` if the message was
   * sent, `false` if it was dropped (socket not open). On failure, the
   * transport is force-closed so reconnection is triggered immediately
   * rather than silently losing messages.
   */
  send(message) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      const text = JSON.stringify(message);
      this._ahpLogger?.log(message, "c2s", getAhpLogByteLength(text));
      this._ws.send(text);
      return true;
    }
    console.warn(
      `[WebSocketClientTransport] Message dropped: readyState=${this._ws?.readyState ?? "no-socket"}`
    );
    this._ws?.close(4001, "send-on-dead-socket");
    if (!this._closeFired) {
      this._closeFired = true;
      this._onClose.fire();
    }
    return false;
  }
  dispose() {
    this._ws?.close();
    super.dispose();
  }
};
WebSocketClientTransport = __decorateClass([
  __decorateParam(3, IInstantiationService)
], WebSocketClientTransport);
export {
  WebSocketClientTransport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxicm93c2VyXFx3ZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBXZWJTb2NrZXQgY2xpZW50IHRyYW5zcG9ydCBmb3IgY29ubmVjdGluZyB0byByZW1vdGUgYWdlbnQgaG9zdCBwcm9jZXNzZXMuXG4vLyBVc2VzIHBsYWluIEpTT04gc2VyaWFsaXphdGlvbiBcdTIwMTQgVVJJcyBhcmUgc3RyaW5nLXR5cGVkIGluIHRoZSBwcm90b2NvbC5cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29ubmVjdGlvblRva2VuUXVlcnlOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEFocEpzb25sTG9nZ2VyLCBnZXRBaHBMb2dCeXRlTGVuZ3RoLCBJQWhwSnNvbmxMb2dnZXJPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2FocEpzb25sTG9nZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFocFNlcnZlck5vdGlmaWNhdGlvbiwgSnNvblJwY05vdGlmaWNhdGlvbiwgSnNvblJwY1JlcXVlc3QsIEpzb25ScGNSZXNwb25zZSwgUHJvdG9jb2xNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElDbGllbnRUcmFuc3BvcnQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBNQUxGT1JNRURfRlJBTUVTX0ZPUkNFX0NMT1NFX1RIUkVTSE9MRCwgTUFMRk9STUVEX0ZSQU1FU19MT0dfQ0FQIH0gZnJvbSAnLi4vY29tbW9uL3RyYW5zcG9ydENvbnN0YW50cy5qcyc7XG5cbi8vIC0tLS0gQ2xpZW50IHRyYW5zcG9ydCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQSBXZWJTb2NrZXQgY2xpZW50IHRyYW5zcG9ydCB0aGF0IGNvbm5lY3RzIHRvIGEgcmVtb3RlIGFnZW50IGhvc3Qgc2VydmVyLlxuICogVXNlcyB0aGUgbmF0aXZlIGJyb3dzZXIgV2ViU29ja2V0IEFQSSAoYXZhaWxhYmxlIGluIEVsZWN0cm9uIHJlbmRlcmVyKS5cbiAqIEltcGxlbWVudHMge0BsaW5rIElDbGllbnRUcmFuc3BvcnR9IHdpdGggSlNPTiBzZXJpYWxpemF0aW9uIGFuZCBVUkkgcmV2aXZhbC5cbiAqL1xuZXhwb3J0IGNsYXNzIFdlYlNvY2tldENsaWVudFRyYW5zcG9ydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2xpZW50VHJhbnNwb3J0IHtcblx0cmVhZG9ubHkgY2xpZW50Q29ubmVjdGlvbktpbmQgPSBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5EaXJlY3RXZWJTb2NrZXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UHJvdG9jb2xNZXNzYWdlPigpKTtcblx0cmVhZG9ubHkgb25NZXNzYWdlID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25DbG9zZSA9IHRoaXMuX29uQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25PcGVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uT3BlbiA9IHRoaXMuX29uT3Blbi5ldmVudDtcblxuXHRwcml2YXRlIF93czogV2ViU29ja2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tYWxmb3JtZWRGcmFtZXMgPSAwO1xuXG5cdC8qKiBHdWFyZHMgYWdhaW5zdCBmaXJpbmcgb25DbG9zZSBtb3JlIHRoYW4gb25jZS4gKi9cblx0cHJpdmF0ZSBfY2xvc2VGaXJlZCA9IGZhbHNlO1xuXG5cdGdldCBpc09wZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTjtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FocExvZ2dlcj86IEFocEpzb25sTG9nZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FkZHJlc3M6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRhaHBMb2dPcHRpb25zOiBJQWhwSnNvbmxMb2dnZXJPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Ly8gVE9ETzogQG9zb3J0ZWdhIHJlbW92ZSBjb25zb2xlLmxvZ3Ncblx0XHRzdXBlcigpO1xuXHRcdGlmIChhaHBMb2dPcHRpb25zKSB7XG5cdFx0XHR0aGlzLl9haHBMb2dnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBaHBKc29ubExvZ2dlciwgYWhwTG9nT3B0aW9ucykpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJbml0aWF0ZSB0aGUgV2ViU29ja2V0IGNvbm5lY3Rpb24uIFJlc29sdmVzIHdoZW4gdGhlIGNvbm5lY3Rpb25cblx0ICogaXMgb3Blbiwgb3IgcmVqZWN0cyBvbiBlcnJvci90aW1lb3V0LlxuXHQgKi9cblx0Y29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignVHJhbnNwb3J0IGlzIGRpc3Bvc2VkJykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCB1cmwgPSB0aGlzLl9hZGRyZXNzLnN0YXJ0c1dpdGgoJ3dzOi8vJykgfHwgdGhpcy5fYWRkcmVzcy5zdGFydHNXaXRoKCd3c3M6Ly8nKVxuXHRcdFx0XHQ/IHRoaXMuX2FkZHJlc3Ncblx0XHRcdFx0OiBgd3M6Ly8ke3RoaXMuX2FkZHJlc3N9YDtcblxuXHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25Ub2tlbikge1xuXHRcdFx0XHRjb25zdCBzZXBhcmF0b3IgPSB1cmwuaW5jbHVkZXMoJz8nKSA/ICcmJyA6ICc/Jztcblx0XHRcdFx0dXJsICs9IGAke3NlcGFyYXRvcn0ke2Nvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZX09JHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5fY29ubmVjdGlvblRva2VuKX1gO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3cyA9IG5ldyBXZWJTb2NrZXQodXJsKTtcblx0XHRcdHRoaXMuX3dzID0gd3M7XG5cblx0XHRcdGNvbnN0IG9uT3BlbiA9ICgpID0+IHtcblx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHR0aGlzLl9vbk9wZW4uZmlyZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBvbkVycm9yID0gKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYFdlYlNvY2tldCBjb25uZWN0aW9uIGZhaWxlZDogJHt0aGlzLl9hZGRyZXNzfWApKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG9uQ2xvc2UgPSAoKSA9PiB7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgV2ViU29ja2V0IGNsb3NlZCBiZWZvcmUgY29ubmVjdGlvbiB3YXMgZXN0YWJsaXNoZWQ6ICR7dGhpcy5fYWRkcmVzc31gKSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0XHR3cy5yZW1vdmVFdmVudExpc3RlbmVyKCdvcGVuJywgb25PcGVuKTtcblx0XHRcdFx0d3MucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKTtcblx0XHRcdFx0d3MucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xvc2UnLCBvbkNsb3NlKTtcblx0XHRcdH07XG5cblx0XHRcdHdzLmFkZEV2ZW50TGlzdGVuZXIoJ29wZW4nLCBvbk9wZW4pO1xuXHRcdFx0d3MuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKTtcblx0XHRcdHdzLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgb25DbG9zZSk7XG5cblx0XHRcdC8vIFdpcmUgdXAgbG9uZy1saXZlZCBsaXN0ZW5lcnMgYWZ0ZXIgY29ubmVjdGlvblxuXHRcdFx0d3MuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudDogTWVzc2FnZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZXZlbnQuZGF0YSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aGlzLl9tYWxmb3JtZWRGcmFtZXMrKztcblx0XHRcdFx0XHRpZiAodGhpcy5fbWFsZm9ybWVkRnJhbWVzIDw9IE1BTEZPUk1FRF9GUkFNRVNfTE9HX0NBUCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGF0YVR5cGUgPSBldmVudC5kYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIgPyAnQXJyYXlCdWZmZXInIDogZXZlbnQuZGF0YSBpbnN0YW5jZW9mIEJsb2IgPyAnQmxvYicgOiB0eXBlb2YgZXZlbnQuZGF0YTtcblx0XHRcdFx0XHRcdGNvbnN0IGJ5dGVMZW4gPSBldmVudC5kYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIgPyBldmVudC5kYXRhLmJ5dGVMZW5ndGggOiBldmVudC5kYXRhIGluc3RhbmNlb2YgQmxvYiA/IGV2ZW50LmRhdGEuc2l6ZSA6IDA7XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oXG5cdFx0XHRcdFx0XHRcdGBbV2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0XSBOb24tc3RyaW5nIGZyYW1lICMke3RoaXMuX21hbGZvcm1lZEZyYW1lc30gKHR5cGU9JHtkYXRhVHlwZX0sIGJ5dGVzPSR7Ynl0ZUxlbn0pYFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX21hbGZvcm1lZEZyYW1lcyA+IE1BTEZPUk1FRF9GUkFNRVNfRk9SQ0VfQ0xPU0VfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oXG5cdFx0XHRcdFx0XHRcdGBbV2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0XSBNYWxmb3JtZWQgZnJhbWUgdGhyZXNob2xkIGV4Y2VlZGVkOyBmb3JjaW5nIGNsb3NlIG9mICR7dGhpcy5fYWRkcmVzc30uYFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHRoaXMuX3dzPy5jbG9zZSg0MDAyLCAnbWFsZm9ybWVkLWZyYW1lcycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGV4dCA9IGV2ZW50LmRhdGE7XG5cdFx0XHRcdGxldCBtZXNzYWdlOiBQcm90b2NvbE1lc3NhZ2U7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IEpTT04ucGFyc2UodGV4dCkgYXMgUHJvdG9jb2xNZXNzYWdlO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9tYWxmb3JtZWRGcmFtZXMrKztcblx0XHRcdFx0XHRpZiAodGhpcy5fbWFsZm9ybWVkRnJhbWVzIDw9IE1BTEZPUk1FRF9GUkFNRVNfTE9HX0NBUCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJldmlldyA9IHRleHQubGVuZ3RoID4gODAgPyB0ZXh0LnNsaWNlKDAsIDgwKSArICdcdTIwMjYnIDogdGV4dDtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2Fybihcblx0XHRcdFx0XHRcdFx0YFtXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnRdIE1hbGZvcm1lZCBmcmFtZSAjJHt0aGlzLl9tYWxmb3JtZWRGcmFtZXN9IChsZW49JHt0ZXh0Lmxlbmd0aH0pOiAke3ByZXZpZXd9YCxcblx0XHRcdFx0XHRcdFx0ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5fbWFsZm9ybWVkRnJhbWVzID4gTUFMRk9STUVEX0ZSQU1FU19GT1JDRV9DTE9TRV9USFJFU0hPTEQpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2Fybihcblx0XHRcdFx0XHRcdFx0YFtXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnRdIE1hbGZvcm1lZCBmcmFtZSB0aHJlc2hvbGQgZXhjZWVkZWQ7IGZvcmNpbmcgY2xvc2Ugb2YgJHt0aGlzLl9hZGRyZXNzfS5gXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fd3M/LmNsb3NlKDQwMDIsICdtYWxmb3JtZWQtZnJhbWVzJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9haHBMb2dnZXI/LmxvZyhtZXNzYWdlLCAnczJjJywgZ2V0QWhwTG9nQnl0ZUxlbmd0aCh0ZXh0KSk7XG5cdFx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKG1lc3NhZ2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHdzLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2Nsb3NlRmlyZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9jbG9zZUZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9vbkNsb3NlLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHdzLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBFcnJvciBhbHdheXMgcHJlY2VkZXMgY2xvc2UgLSBjbG9zaW5nIGlzIGhhbmRsZWQgaW4gdGhlIGNsb3NlIGhhbmRsZXIuXG5cdFx0XHRcdC8vIE9ubHkgZmlyZSBpZiBjbG9zZSBoYXNuJ3QgYWxyZWFkeSBiZWVuIGZpcmVkIChlLmcuIGZyb20gc2VuZCBmYWlsdXJlKS5cblx0XHRcdFx0aWYgKCF0aGlzLl9jbG9zZUZpcmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xvc2VGaXJlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fb25DbG9zZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSBtZXNzYWdlIHRvIHRoZSByZW1vdGUgZW5kLiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgbWVzc2FnZSB3YXNcblx0ICogc2VudCwgYGZhbHNlYCBpZiBpdCB3YXMgZHJvcHBlZCAoc29ja2V0IG5vdCBvcGVuKS4gT24gZmFpbHVyZSwgdGhlXG5cdCAqIHRyYW5zcG9ydCBpcyBmb3JjZS1jbG9zZWQgc28gcmVjb25uZWN0aW9uIGlzIHRyaWdnZXJlZCBpbW1lZGlhdGVseVxuXHQgKiByYXRoZXIgdGhhbiBzaWxlbnRseSBsb3NpbmcgbWVzc2FnZXMuXG5cdCAqL1xuXHRzZW5kKG1lc3NhZ2U6IFByb3RvY29sTWVzc2FnZSB8IEFocFNlcnZlck5vdGlmaWNhdGlvbiB8IEpzb25ScGNOb3RpZmljYXRpb24gfCBKc29uUnBjUmVzcG9uc2UgfCBKc29uUnBjUmVxdWVzdCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdGNvbnN0IHRleHQgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlKTtcblx0XHRcdHRoaXMuX2FocExvZ2dlcj8ubG9nKG1lc3NhZ2UsICdjMnMnLCBnZXRBaHBMb2dCeXRlTGVuZ3RoKHRleHQpKTtcblx0XHRcdHRoaXMuX3dzLnNlbmQodGV4dCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc29sZS53YXJuKFxuXHRcdFx0YFtXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnRdIE1lc3NhZ2UgZHJvcHBlZDogcmVhZHlTdGF0ZT0ke3RoaXMuX3dzPy5yZWFkeVN0YXRlID8/ICduby1zb2NrZXQnfWBcblx0XHQpO1xuXHRcdC8vIEZvcmNlLWNsb3NlIGFuZCBmaXJlIG9uQ2xvc2UgZXhhY3RseSBvbmNlIHRvIHRyaWdnZXIgcmVjb25uZWN0aW9uXG5cdFx0dGhpcy5fd3M/LmNsb3NlKDQwMDEsICdzZW5kLW9uLWRlYWQtc29ja2V0Jyk7XG5cdFx0aWYgKCF0aGlzLl9jbG9zZUZpcmVkKSB7XG5cdFx0XHR0aGlzLl9jbG9zZUZpcmVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uQ2xvc2UuZmlyZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dzPy5jbG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFRQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0IsMkJBQW1EO0FBQzVFLFNBQVMscUNBQXFDO0FBRzlDLFNBQVMsd0NBQXdDLGdDQUFnQztBQVMxRSxJQUFNLDJCQUFOLGNBQXVDLFdBQXVDO0FBQUEsRUF3QnBGLFlBQ2tCLFVBQ0Esa0JBQ2pCLGVBQ3VCLHNCQUN0QjtBQUVELFVBQU07QUFOVztBQUNBO0FBekJsQixTQUFTLHVCQUF1Qiw4QkFBOEI7QUFFOUQsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUF5QixDQUFDO0FBQzNFLFNBQVMsWUFBWSxLQUFLLFdBQVc7QUFFckMsU0FBaUIsV0FBVyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDOUQsU0FBUyxVQUFVLEtBQUssU0FBUztBQUVqQyxTQUFpQixVQUFVLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM3RCxTQUFTLFNBQVMsS0FBSyxRQUFRO0FBRy9CLFNBQVEsbUJBQW1CO0FBRzNCO0FBQUEsU0FBUSxjQUFjO0FBZ0JyQixRQUFJLGVBQWU7QUFDbEIsV0FBSyxhQUFhLEtBQUssVUFBVSxxQkFBcUIsZUFBZSxnQkFBZ0IsYUFBYSxDQUFDO0FBQUEsSUFDcEc7QUFBQSxFQUNEO0FBQUEsRUFqQkEs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
