import { Emitter } from "../../../../base/common/event.js";
import { timeout } from "../../../../base/common/async.js";
import { localize } from "../../../../nls.js";
class AbstractDebugAdapter {
  constructor() {
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.pendingRequestTimers = /* @__PURE__ */ new Map();
    this.queue = [];
    this._onError = new Emitter();
    this._onExit = new Emitter();
    this.sequence = 1;
  }
  get onError() {
    return this._onError.event;
  }
  get onExit() {
    return this._onExit.event;
  }
  onMessage(callback) {
    if (this.messageCallback) {
      this._onError.fire(new Error(`attempt to set more than one 'Message' callback`));
    }
    this.messageCallback = callback;
  }
  onEvent(callback) {
    if (this.eventCallback) {
      this._onError.fire(new Error(`attempt to set more than one 'Event' callback`));
    }
    this.eventCallback = callback;
  }
  onRequest(callback) {
    if (this.requestCallback) {
      this._onError.fire(new Error(`attempt to set more than one 'Request' callback`));
    }
    this.requestCallback = callback;
  }
  sendResponse(response) {
    if (response.seq > 0) {
      this._onError.fire(new Error(`attempt to send more than one response for command ${response.command}`));
    } else {
      this.internalSend("response", response);
    }
  }
  sendRequest(command, args, clb, timeout2) {
    const request = {
      command
    };
    if (args && Object.keys(args).length > 0) {
      request.arguments = args;
    }
    this.internalSend("request", request);
    if (typeof timeout2 === "number") {
      const timer = setTimeout(() => {
        this.pendingRequestTimers.delete(request.seq);
        const clb2 = this.pendingRequests.get(request.seq);
        if (clb2) {
          this.pendingRequests.delete(request.seq);
          const err = {
            type: "response",
            seq: 0,
            request_seq: request.seq,
            success: false,
            command,
            message: localize("timeout", "Timeout after {0} ms for '{1}'", timeout2, command)
          };
          clb2(err);
        }
      }, timeout2);
      this.pendingRequestTimers.set(request.seq, timer);
    }
    if (clb) {
      this.pendingRequests.set(request.seq, clb);
    }
    return request.seq;
  }
  acceptMessage(message) {
    if (this.messageCallback) {
      this.messageCallback(message);
    } else {
      this.queue.push(message);
      if (this.queue.length === 1) {
        this.processQueue();
      }
    }
  }
  /**
   * Returns whether we should insert a timeout between processing messageA
   * and messageB. Artificially queueing protocol messages guarantees that any
   * microtasks for previous message finish before next message is processed.
   * This is essential ordering when using promises anywhere along the call path.
   *
   * For example, take the following, where `chooseAndSendGreeting` returns
   * a person name and then emits a greeting event:
   *
   * ```
   * let person: string;
   * adapter.onGreeting(() => console.log('hello', person));
   * person = await adapter.chooseAndSendGreeting();
   * ```
   *
   * Because the event is dispatched synchronously, it may fire before person
   * is assigned if they're processed in the same task. Inserting a task
   * boundary avoids this issue.
   */
  needsTaskBoundaryBetween(messageA, messageB) {
    return messageA.type !== "event" || messageB.type !== "event";
  }
  /**
   * Reads and dispatches items from the queue until it is empty.
   */
  async processQueue() {
    let message;
    while (this.queue.length) {
      if (!message || this.needsTaskBoundaryBetween(this.queue[0], message)) {
        await timeout(0);
      }
      message = this.queue.shift();
      if (!message) {
        return;
      }
      switch (message.type) {
        case "event":
          this.eventCallback?.(message);
          break;
        case "request":
          this.requestCallback?.(message);
          break;
        case "response": {
          const response = message;
          const clb = this.pendingRequests.get(response.request_seq);
          if (clb) {
            this.pendingRequests.delete(response.request_seq);
            this.clearPendingRequestTimer(response.request_seq);
            clb(response);
          }
          break;
        }
      }
    }
  }
  internalSend(typ, message) {
    message.type = typ;
    message.seq = this.sequence++;
    this.sendMessage(message);
  }
  async cancelPendingRequests() {
    if (this.pendingRequests.size === 0) {
      return Promise.resolve();
    }
    const pending = /* @__PURE__ */ new Map();
    this.pendingRequests.forEach((value, key) => pending.set(key, value));
    await timeout(500);
    pending.forEach((callback, request_seq) => {
      const err = {
        type: "response",
        seq: 0,
        request_seq,
        success: false,
        command: "canceled",
        message: "canceled"
      };
      callback(err);
      this.pendingRequests.delete(request_seq);
      this.clearPendingRequestTimer(request_seq);
    });
  }
  clearPendingRequestTimer(requestSeq) {
    clearTimeout(this.pendingRequestTimers.get(requestSeq));
    this.pendingRequestTimers.delete(requestSeq);
  }
  getPendingRequestIds() {
    return Array.from(this.pendingRequests.keys());
  }
  dispose() {
    for (const timer of this.pendingRequestTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingRequestTimers.clear();
    this._onError.dispose();
    this._onExit.dispose();
    this.queue = [];
  }
}
export {
  AbstractDebugAdapter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGFic3RyYWN0RGVidWdBZGFwdGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGVidWdBZGFwdGVyIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG4vKipcbiAqIEFic3RyYWN0IGltcGxlbWVudGF0aW9uIG9mIHRoZSBsb3cgbGV2ZWwgQVBJIGZvciBhIGRlYnVnIGFkYXB0ZXIuXG4gKiBNaXNzaW5nIGlzIGhvdyB0aGlzIEFQSSBjb21tdW5pY2F0ZXMgd2l0aCB0aGUgZGVidWcgYWRhcHRlci5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RGVidWdBZGFwdGVyIGltcGxlbWVudHMgSURlYnVnQWRhcHRlciB7XG5cdHByaXZhdGUgc2VxdWVuY2U6IG51bWJlcjtcblx0cHJpdmF0ZSBwZW5kaW5nUmVxdWVzdHMgPSBuZXcgTWFwPG51bWJlciwgKGU6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UpID0+IHZvaWQ+KCk7XG5cdHByaXZhdGUgcGVuZGluZ1JlcXVlc3RUaW1lcnMgPSBuZXcgTWFwPG51bWJlciwgVGltZW91dD4oKTtcblx0cHJpdmF0ZSByZXF1ZXN0Q2FsbGJhY2s6ICgocmVxdWVzdDogRGVidWdQcm90b2NvbC5SZXF1ZXN0KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBldmVudENhbGxiYWNrOiAoKHJlcXVlc3Q6IERlYnVnUHJvdG9jb2wuRXZlbnQpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1lc3NhZ2VDYWxsYmFjazogKChtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcXVldWU6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlW10gPSBbXTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkVycm9yID0gbmV3IEVtaXR0ZXI8RXJyb3I+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25FeGl0ID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgbnVsbD4oKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnNlcXVlbmNlID0gMTtcblx0fVxuXG5cdGFic3RyYWN0IHN0YXJ0U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGFic3RyYWN0IHN0b3BTZXNzaW9uKCk6IFByb21pc2U8dm9pZD47XG5cblx0YWJzdHJhY3Qgc2VuZE1lc3NhZ2UobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkO1xuXG5cdGdldCBvbkVycm9yKCk6IEV2ZW50PEVycm9yPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRXJyb3IuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25FeGl0KCk6IEV2ZW50PG51bWJlciB8IG51bGw+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25FeGl0LmV2ZW50O1xuXHR9XG5cblx0b25NZXNzYWdlKGNhbGxiYWNrOiAobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZXNzYWdlQ2FsbGJhY2spIHtcblx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoYGF0dGVtcHQgdG8gc2V0IG1vcmUgdGhhbiBvbmUgJ01lc3NhZ2UnIGNhbGxiYWNrYCkpO1xuXHRcdH1cblx0XHR0aGlzLm1lc3NhZ2VDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHR9XG5cblx0b25FdmVudChjYWxsYmFjazogKGV2ZW50OiBEZWJ1Z1Byb3RvY29sLkV2ZW50KSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXZlbnRDYWxsYmFjaykge1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKG5ldyBFcnJvcihgYXR0ZW1wdCB0byBzZXQgbW9yZSB0aGFuIG9uZSAnRXZlbnQnIGNhbGxiYWNrYCkpO1xuXHRcdH1cblx0XHR0aGlzLmV2ZW50Q2FsbGJhY2sgPSBjYWxsYmFjaztcblx0fVxuXG5cdG9uUmVxdWVzdChjYWxsYmFjazogKHJlcXVlc3Q6IERlYnVnUHJvdG9jb2wuUmVxdWVzdCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnJlcXVlc3RDYWxsYmFjaykge1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKG5ldyBFcnJvcihgYXR0ZW1wdCB0byBzZXQgbW9yZSB0aGFuIG9uZSAnUmVxdWVzdCcgY2FsbGJhY2tgKSk7XG5cdFx0fVxuXHRcdHRoaXMucmVxdWVzdENhbGxiYWNrID0gY2FsbGJhY2s7XG5cdH1cblxuXHRzZW5kUmVzcG9uc2UocmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UpOiB2b2lkIHtcblx0XHRpZiAocmVzcG9uc2Uuc2VxID4gMCkge1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKG5ldyBFcnJvcihgYXR0ZW1wdCB0byBzZW5kIG1vcmUgdGhhbiBvbmUgcmVzcG9uc2UgZm9yIGNvbW1hbmQgJHtyZXNwb25zZS5jb21tYW5kfWApKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnRlcm5hbFNlbmQoJ3Jlc3BvbnNlJywgcmVzcG9uc2UpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRSZXF1ZXN0KGNvbW1hbmQ6IHN0cmluZywgYXJnczogYW55LCBjbGI6IChyZXN1bHQ6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UpID0+IHZvaWQsIHRpbWVvdXQ/OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlcXVlc3Q6IGFueSA9IHtcblx0XHRcdGNvbW1hbmQ6IGNvbW1hbmRcblx0XHR9O1xuXHRcdGlmIChhcmdzICYmIE9iamVjdC5rZXlzKGFyZ3MpLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlcXVlc3QuYXJndW1lbnRzID0gYXJncztcblx0XHR9XG5cdFx0dGhpcy5pbnRlcm5hbFNlbmQoJ3JlcXVlc3QnLCByZXF1ZXN0KTtcblx0XHRpZiAodHlwZW9mIHRpbWVvdXQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0VGltZXJzLmRlbGV0ZShyZXF1ZXN0LnNlcSk7XG5cdFx0XHRcdGNvbnN0IGNsYiA9IHRoaXMucGVuZGluZ1JlcXVlc3RzLmdldChyZXF1ZXN0LnNlcSk7XG5cdFx0XHRcdGlmIChjbGIpIHtcblx0XHRcdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5kZWxldGUocmVxdWVzdC5zZXEpO1xuXHRcdFx0XHRcdGNvbnN0IGVycjogRGVidWdQcm90b2NvbC5SZXNwb25zZSA9IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdyZXNwb25zZScsXG5cdFx0XHRcdFx0XHRzZXE6IDAsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0X3NlcTogcmVxdWVzdC5zZXEsXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRcdGNvbW1hbmQsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndGltZW91dCcsIFwiVGltZW91dCBhZnRlciB7MH0gbXMgZm9yICd7MX0nXCIsIHRpbWVvdXQsIGNvbW1hbmQpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjbGIoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGltZW91dCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0VGltZXJzLnNldChyZXF1ZXN0LnNlcSwgdGltZXIpO1xuXHRcdH1cblx0XHRpZiAoY2xiKSB7XG5cdFx0XHQvLyBzdG9yZSBjYWxsYmFjayBmb3IgdGhpcyByZXF1ZXN0XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zZXQocmVxdWVzdC5zZXEsIGNsYik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcXVlc3Quc2VxO1xuXHR9XG5cblx0YWNjZXB0TWVzc2FnZShtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1lc3NhZ2VDYWxsYmFjaykge1xuXHRcdFx0dGhpcy5tZXNzYWdlQ2FsbGJhY2sobWVzc2FnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucXVldWUucHVzaChtZXNzYWdlKTtcblx0XHRcdGlmICh0aGlzLnF1ZXVlLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBmaXJzdCBpdGVtID0gbmVlZCB0byBzdGFydCBwcm9jZXNzaW5nIGxvb3Bcblx0XHRcdFx0dGhpcy5wcm9jZXNzUXVldWUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHdlIHNob3VsZCBpbnNlcnQgYSB0aW1lb3V0IGJldHdlZW4gcHJvY2Vzc2luZyBtZXNzYWdlQVxuXHQgKiBhbmQgbWVzc2FnZUIuIEFydGlmaWNpYWxseSBxdWV1ZWluZyBwcm90b2NvbCBtZXNzYWdlcyBndWFyYW50ZWVzIHRoYXQgYW55XG5cdCAqIG1pY3JvdGFza3MgZm9yIHByZXZpb3VzIG1lc3NhZ2UgZmluaXNoIGJlZm9yZSBuZXh0IG1lc3NhZ2UgaXMgcHJvY2Vzc2VkLlxuXHQgKiBUaGlzIGlzIGVzc2VudGlhbCBvcmRlcmluZyB3aGVuIHVzaW5nIHByb21pc2VzIGFueXdoZXJlIGFsb25nIHRoZSBjYWxsIHBhdGguXG5cdCAqXG5cdCAqIEZvciBleGFtcGxlLCB0YWtlIHRoZSBmb2xsb3dpbmcsIHdoZXJlIGBjaG9vc2VBbmRTZW5kR3JlZXRpbmdgIHJldHVybnNcblx0ICogYSBwZXJzb24gbmFtZSBhbmQgdGhlbiBlbWl0cyBhIGdyZWV0aW5nIGV2ZW50OlxuXHQgKlxuXHQgKiBgYGBcblx0ICogbGV0IHBlcnNvbjogc3RyaW5nO1xuXHQgKiBhZGFwdGVyLm9uR3JlZXRpbmcoKCkgPT4gY29uc29sZS5sb2coJ2hlbGxvJywgcGVyc29uKSk7XG5cdCAqIHBlcnNvbiA9IGF3YWl0IGFkYXB0ZXIuY2hvb3NlQW5kU2VuZEdyZWV0aW5nKCk7XG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBCZWNhdXNlIHRoZSBldmVudCBpcyBkaXNwYXRjaGVkIHN5bmNocm9ub3VzbHksIGl0IG1heSBmaXJlIGJlZm9yZSBwZXJzb25cblx0ICogaXMgYXNzaWduZWQgaWYgdGhleSdyZSBwcm9jZXNzZWQgaW4gdGhlIHNhbWUgdGFzay4gSW5zZXJ0aW5nIGEgdGFza1xuXHQgKiBib3VuZGFyeSBhdm9pZHMgdGhpcyBpc3N1ZS5cblx0ICovXG5cdHByb3RlY3RlZCBuZWVkc1Rhc2tCb3VuZGFyeUJldHdlZW4obWVzc2FnZUE6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlLCBtZXNzYWdlQjogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpIHtcblx0XHRyZXR1cm4gbWVzc2FnZUEudHlwZSAhPT0gJ2V2ZW50JyB8fCBtZXNzYWdlQi50eXBlICE9PSAnZXZlbnQnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIGFuZCBkaXNwYXRjaGVzIGl0ZW1zIGZyb20gdGhlIHF1ZXVlIHVudGlsIGl0IGlzIGVtcHR5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBwcm9jZXNzUXVldWUoKSB7XG5cdFx0bGV0IG1lc3NhZ2U6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlIHwgdW5kZWZpbmVkO1xuXHRcdHdoaWxlICh0aGlzLnF1ZXVlLmxlbmd0aCkge1xuXHRcdFx0aWYgKCFtZXNzYWdlIHx8IHRoaXMubmVlZHNUYXNrQm91bmRhcnlCZXR3ZWVuKHRoaXMucXVldWVbMF0sIG1lc3NhZ2UpKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHR9XG5cblx0XHRcdG1lc3NhZ2UgPSB0aGlzLnF1ZXVlLnNoaWZ0KCk7XG5cdFx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBtYXkgaGF2ZSBiZWVuIGRpc3Bvc2VkIG9mXG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG5cdFx0XHRcdGNhc2UgJ2V2ZW50Jzpcblx0XHRcdFx0XHR0aGlzLmV2ZW50Q2FsbGJhY2s/Lig8RGVidWdQcm90b2NvbC5FdmVudD5tZXNzYWdlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncmVxdWVzdCc6XG5cdFx0XHRcdFx0dGhpcy5yZXF1ZXN0Q2FsbGJhY2s/Lig8RGVidWdQcm90b2NvbC5SZXF1ZXN0Pm1lc3NhZ2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZXNwb25zZSc6IHtcblx0XHRcdFx0XHRjb25zdCByZXNwb25zZSA9IDxEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlPm1lc3NhZ2U7XG5cdFx0XHRcdFx0Y29uc3QgY2xiID0gdGhpcy5wZW5kaW5nUmVxdWVzdHMuZ2V0KHJlc3BvbnNlLnJlcXVlc3Rfc2VxKTtcblx0XHRcdFx0XHRpZiAoY2xiKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5kZWxldGUocmVzcG9uc2UucmVxdWVzdF9zZXEpO1xuXHRcdFx0XHRcdFx0dGhpcy5jbGVhclBlbmRpbmdSZXF1ZXN0VGltZXIocmVzcG9uc2UucmVxdWVzdF9zZXEpO1xuXHRcdFx0XHRcdFx0Y2xiKHJlc3BvbnNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGludGVybmFsU2VuZCh0eXA6ICdyZXF1ZXN0JyB8ICdyZXNwb25zZScgfCAnZXZlbnQnLCBtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdG1lc3NhZ2UudHlwZSA9IHR5cDtcblx0XHRtZXNzYWdlLnNlcSA9IHRoaXMuc2VxdWVuY2UrKztcblx0XHR0aGlzLnNlbmRNZXNzYWdlKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGNhbmNlbFBlbmRpbmdSZXF1ZXN0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5wZW5kaW5nUmVxdWVzdHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBuZXcgTWFwPG51bWJlciwgKGU6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UpID0+IHZvaWQ+KCk7XG5cdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gcGVuZGluZy5zZXQoa2V5LCB2YWx1ZSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRwZW5kaW5nLmZvckVhY2goKGNhbGxiYWNrLCByZXF1ZXN0X3NlcSkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlID0ge1xuXHRcdFx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0XHRzZXE6IDAsXG5cdFx0XHRcdHJlcXVlc3Rfc2VxLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0Y29tbWFuZDogJ2NhbmNlbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ2NhbmNlbGVkJ1xuXHRcdFx0fTtcblx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5kZWxldGUocmVxdWVzdF9zZXEpO1xuXHRcdFx0dGhpcy5jbGVhclBlbmRpbmdSZXF1ZXN0VGltZXIocmVxdWVzdF9zZXEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclBlbmRpbmdSZXF1ZXN0VGltZXIocmVxdWVzdFNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMucGVuZGluZ1JlcXVlc3RUaW1lcnMuZ2V0KHJlcXVlc3RTZXEpKTtcblx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0VGltZXJzLmRlbGV0ZShyZXF1ZXN0U2VxKTtcblx0fVxuXG5cdGdldFBlbmRpbmdSZXF1ZXN0SWRzKCk6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5rZXlzKCkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHRpbWVyIG9mIHRoaXMucGVuZGluZ1JlcXVlc3RUaW1lcnMudmFsdWVzKCkpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0fVxuXHRcdHRoaXMucGVuZGluZ1JlcXVlc3RUaW1lcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkVycm9yLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkV4aXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMucXVldWUgPSBbXTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFzQjtBQUUvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFNbEIsTUFBZSxxQkFBOEM7QUFBQSxFQVduRSxj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
