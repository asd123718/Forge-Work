import { DeferredPromise } from "./async.js";
import { CancellationToken, CancellationTokenSource } from "./cancellation.js";
import { CancellationError } from "./errors.js";
import { Disposable, toDisposable } from "./lifecycle.js";
import { hasKey } from "./types.js";
class JsonRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
const _JsonRpcProtocol = class _JsonRpcProtocol extends Disposable {
  constructor(_send, _handlers) {
    super();
    this._send = _send;
    this._handlers = _handlers;
    this._nextRequestId = 1;
    this._pendingRequests = /* @__PURE__ */ new Map();
  }
  sendNotification(notification) {
    this._send({
      jsonrpc: "2.0",
      ...notification
    });
  }
  sendRequest(request, token = CancellationToken.None, onCancel) {
    if (this._store.isDisposed) {
      return Promise.reject(new CancellationError());
    }
    const id = this._nextRequestId++;
    const promise = new DeferredPromise();
    const cts = new CancellationTokenSource();
    this._pendingRequests.set(id, { promise, cts });
    const cancelListener = token.onCancellationRequested(() => {
      if (!promise.isSettled) {
        this._pendingRequests.delete(id);
        cts.cancel();
        onCancel?.(id);
        promise.cancel();
      }
      cancelListener.dispose();
    });
    this._send({
      jsonrpc: "2.0",
      id,
      ...request
    });
    return promise.p.finally(() => {
      cancelListener.dispose();
      this._pendingRequests.delete(id);
      cts.dispose(true);
    });
  }
  /**
   * Handles one or more incoming JSON-RPC messages.
   *
   * Returns an array of JSON-RPC response objects generated for any incoming
   * requests in the message(s). Notifications and responses to our own
   * outgoing requests do not produce return values. For batch inputs, the
   * returned responses are in the same order as the corresponding requests.
   *
   * Note: responses are also emitted via the `_send` callback, so callers
   * that rely on the return value should not re-send them.
   */
  async handleMessage(message) {
    if (Array.isArray(message)) {
      const replies = [];
      for (const single of message) {
        const reply2 = await this._handleMessage(single);
        if (reply2) {
          replies.push(reply2);
        }
      }
      return replies;
    }
    const reply = await this._handleMessage(message);
    return reply ? [reply] : [];
  }
  cancelPendingRequest(id) {
    const request = this._pendingRequests.get(id);
    if (request) {
      this._pendingRequests.delete(id);
      request.cts.cancel();
      request.promise.cancel();
      request.cts.dispose(true);
    }
  }
  cancelAllRequests() {
    for (const [id, pending] of this._pendingRequests) {
      this._pendingRequests.delete(id);
      pending.cts.cancel();
      pending.promise.cancel();
      pending.cts.dispose(true);
    }
  }
  async _handleMessage(message) {
    if (isJsonRpcResponse(message)) {
      if (hasKey(message, { result: true })) {
        this._handleResult(message);
      } else {
        this._handleError(message);
      }
      return void 0;
    }
    if (isJsonRpcRequest(message)) {
      return this._handleRequest(message);
    }
    if (isJsonRpcNotification(message)) {
      this._handlers.handleNotification?.(message);
    }
    return void 0;
  }
  _handleResult(response) {
    const request = this._pendingRequests.get(response.id);
    if (request) {
      this._pendingRequests.delete(response.id);
      request.promise.complete(response.result);
      request.cts.dispose(true);
    }
  }
  _handleError(response) {
    if (response.id === void 0) {
      return;
    }
    const request = this._pendingRequests.get(response.id);
    if (request) {
      this._pendingRequests.delete(response.id);
      request.promise.error(new JsonRpcError(response.error.code, response.error.message, response.error.data));
      request.cts.dispose(true);
    }
  }
  async _handleRequest(request) {
    if (!this._handlers.handleRequest) {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: _JsonRpcProtocol.MethodNotFound,
          message: `Method not found: ${request.method}`
        }
      };
      this._send(response);
      return response;
    }
    const cts = new CancellationTokenSource();
    this._register(toDisposable(() => cts.dispose(true)));
    try {
      const resultOrThenable = this._handlers.handleRequest(request, cts.token);
      const result = isThenable(resultOrThenable) ? await resultOrThenable : resultOrThenable;
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result
      };
      this._send(response);
      return response;
    } catch (error) {
      let response;
      if (error instanceof JsonRpcError) {
        response = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: error.code,
            message: error.message,
            data: error.data
          }
        };
      } else {
        response = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: _JsonRpcProtocol.InternalError,
            message: error instanceof Error ? error.message : "Internal error"
          }
        };
      }
      this._send(response);
      return response;
    } finally {
      cts.dispose(true);
    }
  }
  dispose() {
    this.cancelAllRequests();
    super.dispose();
  }
  static createParseError(message, data) {
    return {
      jsonrpc: "2.0",
      error: {
        code: _JsonRpcProtocol.ParseError,
        message,
        data
      }
    };
  }
};
_JsonRpcProtocol.ParseError = -32700;
_JsonRpcProtocol.MethodNotFound = -32601;
_JsonRpcProtocol.InternalError = -32603;
let JsonRpcProtocol = _JsonRpcProtocol;
function isJsonRpcRequest(message) {
  return "method" in message && "id" in message && (typeof message.id === "string" || typeof message.id === "number");
}
function isJsonRpcResponse(message) {
  return hasKey(message, { id: true, result: true }) || hasKey(message, { id: true, error: true });
}
function isJsonRpcNotification(message) {
  return hasKey(message, { method: true }) && !hasKey(message, { id: true });
}
function isThenable(value) {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}
export {
  JsonRpcError,
  JsonRpcProtocol,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGpzb25ScGNQcm90b2NvbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuL3R5cGVzLmpzJztcblxuZXhwb3J0IHR5cGUgSnNvblJwY0lkID0gc3RyaW5nIHwgbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIElKc29uUnBjRXJyb3Ige1xuXHRjb2RlOiBudW1iZXI7XG5cdG1lc3NhZ2U6IHN0cmluZztcblx0ZGF0YT86IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUpzb25ScGNSZXF1ZXN0IHtcblx0anNvbnJwYzogJzIuMCc7XG5cdGlkOiBKc29uUnBjSWQ7XG5cdG1ldGhvZDogc3RyaW5nO1xuXHRwYXJhbXM/OiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElKc29uUnBjTm90aWZpY2F0aW9uIHtcblx0anNvbnJwYzogJzIuMCc7XG5cdG1ldGhvZDogc3RyaW5nO1xuXHRwYXJhbXM/OiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlIHtcblx0anNvbnJwYzogJzIuMCc7XG5cdGlkOiBKc29uUnBjSWQ7XG5cdHJlc3VsdDogdW5rbm93bjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSnNvblJwY0Vycm9yUmVzcG9uc2Uge1xuXHRqc29ucnBjOiAnMi4wJztcblx0aWQ/OiBKc29uUnBjSWQ7XG5cdGVycm9yOiBJSnNvblJwY0Vycm9yO1xufVxuXG5leHBvcnQgdHlwZSBKc29uUnBjTWVzc2FnZSA9IElKc29uUnBjUmVxdWVzdCB8IElKc29uUnBjTm90aWZpY2F0aW9uIHwgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2UgfCBJSnNvblJwY0Vycm9yUmVzcG9uc2U7XG5leHBvcnQgdHlwZSBKc29uUnBjUmVzcG9uc2UgPSBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSB8IElKc29uUnBjRXJyb3JSZXNwb25zZTtcblxuaW50ZXJmYWNlIElQZW5kaW5nUmVxdWVzdCB7XG5cdHByb21pc2U6IERlZmVycmVkUHJvbWlzZTx1bmtub3duPjtcblx0Y3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSnNvblJwY1Byb3RvY29sSGFuZGxlcnMge1xuXHRoYW5kbGVSZXF1ZXN0PyhyZXF1ZXN0OiBJSnNvblJwY1JlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dW5rbm93bj4gfCB1bmtub3duO1xuXHRoYW5kbGVOb3RpZmljYXRpb24/KG5vdGlmaWNhdGlvbjogSUpzb25ScGNOb3RpZmljYXRpb24pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgSnNvblJwY0Vycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29kZTogbnVtYmVyLFxuXHRcdG1lc3NhZ2U6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGF0YT86IHVua25vd24sXG5cdCkge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHR9XG59XG5cbi8qKlxuICogR2VuZXJpYyBKU09OLVJQQyAyLjAgcHJvdG9jb2wgaGVscGVyLlxuICovXG5leHBvcnQgY2xhc3MgSnNvblJwY1Byb3RvY29sIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBhcnNlRXJyb3IgPSAtMzI3MDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1ldGhvZE5vdEZvdW5kID0gLTMyNjAxO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJbnRlcm5hbEVycm9yID0gLTMyNjAzO1xuXG5cdHByaXZhdGUgX25leHRSZXF1ZXN0SWQgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmVxdWVzdHMgPSBuZXcgTWFwPEpzb25ScGNJZCwgSVBlbmRpbmdSZXF1ZXN0PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbmQ6IChtZXNzYWdlOiBKc29uUnBjTWVzc2FnZSkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVyczogSUpzb25ScGNQcm90b2NvbEhhbmRsZXJzLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHVibGljIHNlbmROb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBPbWl0PElKc29uUnBjTm90aWZpY2F0aW9uLCAnanNvbnJwYyc+KTogdm9pZCB7XG5cdFx0dGhpcy5fc2VuZCh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdC4uLm5vdGlmaWNhdGlvbixcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzZW5kUmVxdWVzdDxUID0gdW5rbm93bj4ocmVxdWVzdDogT21pdDxJSnNvblJwY1JlcXVlc3QsICdqc29ucnBjJyB8ICdpZCc+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBvbkNhbmNlbD86IChpZDogSnNvblJwY0lkKSA9PiB2b2lkKTogUHJvbWlzZTxUPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9uZXh0UmVxdWVzdElkKys7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dW5rbm93bj4oKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuc2V0KGlkLCB7IHByb21pc2UsIGN0cyB9KTtcblxuXHRcdGNvbnN0IGNhbmNlbExpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0aWYgKCFwcm9taXNlLmlzU2V0dGxlZCkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKGlkKTtcblx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRvbkNhbmNlbD8uKGlkKTtcblx0XHRcdFx0cHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHRcdGNhbmNlbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NlbmQoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZCxcblx0XHRcdC4uLnJlcXVlc3QsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcHJvbWlzZS5wLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Y2FuY2VsTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShpZCk7XG5cdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR9KSBhcyBQcm9taXNlPFQ+O1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgb25lIG9yIG1vcmUgaW5jb21pbmcgSlNPTi1SUEMgbWVzc2FnZXMuXG5cdCAqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgSlNPTi1SUEMgcmVzcG9uc2Ugb2JqZWN0cyBnZW5lcmF0ZWQgZm9yIGFueSBpbmNvbWluZ1xuXHQgKiByZXF1ZXN0cyBpbiB0aGUgbWVzc2FnZShzKS4gTm90aWZpY2F0aW9ucyBhbmQgcmVzcG9uc2VzIHRvIG91ciBvd25cblx0ICogb3V0Z29pbmcgcmVxdWVzdHMgZG8gbm90IHByb2R1Y2UgcmV0dXJuIHZhbHVlcy4gRm9yIGJhdGNoIGlucHV0cywgdGhlXG5cdCAqIHJldHVybmVkIHJlc3BvbnNlcyBhcmUgaW4gdGhlIHNhbWUgb3JkZXIgYXMgdGhlIGNvcnJlc3BvbmRpbmcgcmVxdWVzdHMuXG5cdCAqXG5cdCAqIE5vdGU6IHJlc3BvbnNlcyBhcmUgYWxzbyBlbWl0dGVkIHZpYSB0aGUgYF9zZW5kYCBjYWxsYmFjaywgc28gY2FsbGVyc1xuXHQgKiB0aGF0IHJlbHkgb24gdGhlIHJldHVybiB2YWx1ZSBzaG91bGQgbm90IHJlLXNlbmQgdGhlbS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBoYW5kbGVNZXNzYWdlKG1lc3NhZ2U6IEpzb25ScGNNZXNzYWdlIHwgSnNvblJwY01lc3NhZ2VbXSk6IFByb21pc2U8SnNvblJwY1Jlc3BvbnNlW10+IHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShtZXNzYWdlKSkge1xuXHRcdFx0Y29uc3QgcmVwbGllczogSnNvblJwY1Jlc3BvbnNlW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc2luZ2xlIG9mIG1lc3NhZ2UpIHtcblx0XHRcdFx0Y29uc3QgcmVwbHkgPSBhd2FpdCB0aGlzLl9oYW5kbGVNZXNzYWdlKHNpbmdsZSk7XG5cdFx0XHRcdGlmIChyZXBseSkge1xuXHRcdFx0XHRcdHJlcGxpZXMucHVzaChyZXBseSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXBsaWVzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcGx5ID0gYXdhaXQgdGhpcy5faGFuZGxlTWVzc2FnZShtZXNzYWdlKTtcblx0XHRyZXR1cm4gcmVwbHkgPyBbcmVwbHldIDogW107XG5cdH1cblxuXHRwdWJsaWMgY2FuY2VsUGVuZGluZ1JlcXVlc3QoaWQ6IEpzb25ScGNJZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KGlkKTtcblx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShpZCk7XG5cdFx0XHRyZXF1ZXN0LmN0cy5jYW5jZWwoKTtcblx0XHRcdHJlcXVlc3QucHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdHJlcXVlc3QuY3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNhbmNlbEFsbFJlcXVlc3RzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nUmVxdWVzdHMpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5kZWxldGUoaWQpO1xuXHRcdFx0cGVuZGluZy5jdHMuY2FuY2VsKCk7XG5cdFx0XHRwZW5kaW5nLnByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRwZW5kaW5nLmN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZU1lc3NhZ2UobWVzc2FnZTogSnNvblJwY01lc3NhZ2UpOiBQcm9taXNlPEpzb25ScGNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc0pzb25ScGNSZXNwb25zZShtZXNzYWdlKSkge1xuXHRcdFx0aWYgKGhhc0tleShtZXNzYWdlLCB7IHJlc3VsdDogdHJ1ZSB9KSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVSZXN1bHQobWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVFcnJvcihtZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlzSnNvblJwY1JlcXVlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVSZXF1ZXN0KG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGlmIChpc0pzb25ScGNOb3RpZmljYXRpb24obWVzc2FnZSkpIHtcblx0XHRcdHRoaXMuX2hhbmRsZXJzLmhhbmRsZU5vdGlmaWNhdGlvbj8uKG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZXN1bHQocmVzcG9uc2U6IElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5nZXQocmVzcG9uc2UuaWQpO1xuXHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlc3BvbnNlLmlkKTtcblx0XHRcdHJlcXVlc3QucHJvbWlzZS5jb21wbGV0ZShyZXNwb25zZS5yZXN1bHQpO1xuXHRcdFx0cmVxdWVzdC5jdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVFcnJvcihyZXNwb25zZTogSUpzb25ScGNFcnJvclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0aWYgKHJlc3BvbnNlLmlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChyZXNwb25zZS5pZCk7XG5cdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5kZWxldGUocmVzcG9uc2UuaWQpO1xuXHRcdFx0cmVxdWVzdC5wcm9taXNlLmVycm9yKG5ldyBKc29uUnBjRXJyb3IocmVzcG9uc2UuZXJyb3IuY29kZSwgcmVzcG9uc2UuZXJyb3IubWVzc2FnZSwgcmVzcG9uc2UuZXJyb3IuZGF0YSkpO1xuXHRcdFx0cmVxdWVzdC5jdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVSZXF1ZXN0KHJlcXVlc3Q6IElKc29uUnBjUmVxdWVzdCk6IFByb21pc2U8SnNvblJwY1Jlc3BvbnNlPiB7XG5cdFx0aWYgKCF0aGlzLl9oYW5kbGVycy5oYW5kbGVSZXF1ZXN0KSB7XG5cdFx0XHRjb25zdCByZXNwb25zZTogSUpzb25ScGNFcnJvclJlc3BvbnNlID0ge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0Y29kZTogSnNvblJwY1Byb3RvY29sLk1ldGhvZE5vdEZvdW5kLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGBNZXRob2Qgbm90IGZvdW5kOiAke3JlcXVlc3QubWV0aG9kfWAsXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZW5kKHJlc3BvbnNlKTtcblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRPclRoZW5hYmxlID0gdGhpcy5faGFuZGxlcnMuaGFuZGxlUmVxdWVzdChyZXF1ZXN0LCBjdHMudG9rZW4pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gaXNUaGVuYWJsZShyZXN1bHRPclRoZW5hYmxlKSA/IGF3YWl0IHJlc3VsdE9yVGhlbmFibGUgOiByZXN1bHRPclRoZW5hYmxlO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2U6IElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlID0ge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZW5kKHJlc3BvbnNlKTtcblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bGV0IHJlc3BvbnNlOiBJSnNvblJwY0Vycm9yUmVzcG9uc2U7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBKc29uUnBjRXJyb3IpIHtcblx0XHRcdFx0cmVzcG9uc2UgPSB7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdGNvZGU6IGVycm9yLmNvZGUsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBlcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0ZGF0YTogZXJyb3IuZGF0YSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNwb25zZSA9IHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0XHRpZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0Y29kZTogSnNvblJwY1Byb3RvY29sLkludGVybmFsRXJyb3IsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdJbnRlcm5hbCBlcnJvcicsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2VuZChyZXNwb25zZSk7XG5cdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsQWxsUmVxdWVzdHMoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZVBhcnNlRXJyb3IobWVzc2FnZTogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IElKc29uUnBjRXJyb3JSZXNwb25zZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0Y29kZTogSnNvblJwY1Byb3RvY29sLlBhcnNlRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGRhdGEsXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNKc29uUnBjUmVxdWVzdChtZXNzYWdlOiBKc29uUnBjTWVzc2FnZSk6IG1lc3NhZ2UgaXMgSUpzb25ScGNSZXF1ZXN0IHtcblx0cmV0dXJuICdtZXRob2QnIGluIG1lc3NhZ2UgJiYgJ2lkJyBpbiBtZXNzYWdlICYmICh0eXBlb2YgbWVzc2FnZS5pZCA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIG1lc3NhZ2UuaWQgPT09ICdudW1iZXInKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSnNvblJwY1Jlc3BvbnNlKG1lc3NhZ2U6IEpzb25ScGNNZXNzYWdlKTogbWVzc2FnZSBpcyBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSB8IElKc29uUnBjRXJyb3JSZXNwb25zZSB7XG5cdHJldHVybiBoYXNLZXkobWVzc2FnZSwgeyBpZDogdHJ1ZSwgcmVzdWx0OiB0cnVlIH0pIHx8IGhhc0tleShtZXNzYWdlLCB7IGlkOiB0cnVlLCBlcnJvcjogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSnNvblJwY05vdGlmaWNhdGlvbihtZXNzYWdlOiBKc29uUnBjTWVzc2FnZSk6IG1lc3NhZ2UgaXMgSUpzb25ScGNOb3RpZmljYXRpb24ge1xuXHRyZXR1cm4gaGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmICFoYXNLZXkobWVzc2FnZSwgeyBpZDogdHJ1ZSB9KTtcbn1cblxuXG5mdW5jdGlvbiBpc1RoZW5hYmxlPFQ+KHZhbHVlOiBUIHwgUHJvbWlzZTxUPik6IHZhbHVlIGlzIFByb21pc2U8VD4ge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAndGhlbicgaW4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlLnRoZW4gPT09ICdmdW5jdGlvbic7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLGNBQWM7QUFnRGhCLE1BQU0scUJBQXFCLE1BQU07QUFBQSxFQUN2QyxZQUNpQixNQUNoQixTQUNnQixNQUNmO0FBQ0QsVUFBTSxPQUFPO0FBSkc7QUFFQTtBQUFBLEVBR2pCO0FBQ0Q7QUFLTyxNQUFNLG1CQUFOLE1BQU0seUJBQXdCLFdBQVc7QUFBQSxFQVEvQyxZQUNrQixPQUNBLFdBQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFMbEIsU0FBUSxpQkFBaUI7QUFDekIsU0FBaUIsbUJBQW1CLG9CQUFJLElBQWdDO0FBQUEsRUFPeEU7QUFBQSxFQUVPLGlCQUFpQixjQUEyRDtBQUNsRixTQUFLLE1BQU07QUFBQSxNQUNWLFNBQVM7QUFBQSxNQUNULEdBQUc7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxZQUF5QixTQUFrRCxRQUEyQixrQkFBa0IsTUFBTSxVQUFnRDtBQUNwTCxRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCLGFBQU8sUUFBUSxPQUFPLElBQUks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QUNOLE1BQU0sTUFBTTtBQUFBLFlBQ1osU0FBUyxNQUFNO0FBQUEsWUFDZixNQUFNLE1BQU07QUFBQSxVQUNiO0FBQUEsUUFDRDtBQUFBLE1BQ0QsT0FBTztBQUNOLG1CQUFXO0FBQUEsVUFDVixTQUFTO0FBQUEsVUFDVCxJQUFJLFFBQVE7QUFBQSxVQUNaLE9BQU87QUFBQSxZQUNOLE1BQU0saUJBQWdCO0FBQUEsWUFDdEIsU0FBUyxpQkFBaUIsUUFBUSxNQUFNLFVBQVU7QUFBQSxVQUNuRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsV0FBSyxNQUFNLFFBQVE7QUFDbkIsYUFBTztBQUFBLElBQ1IsVUFBRTtBQUNELFVBQUksUUFBUSxJQUFJO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFZ0IsVUFBZ0I7QUFDL0IsU0FBSyxrQkFBa0I7QUFDdkIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRUEsT0FBYyxpQkFBaUIsU0FBaUIsTUFBdUM7QUFDdEYsV0FBTztBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTztBQUFBLFFBQ04sTUFBTSxpQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXZOYSxpQkFDWSxhQUFhO0FBRHpCLGlCQUVZLGlCQUFpQjtBQUY3QixpQkFHWSxnQkFBZ0I7QUFIbEMsSUFBTSxrQkFBTjtBQXlOQSxTQUFTLGlCQUFpQixTQUFxRDtBQUNyRixTQUFPLFlBQVksV0FBVyxRQUFRLFlBQVksT0FBTyxRQUFRLE9BQU8sWUFBWSxPQUFPLFFBQVEsT0FBTztBQUMzRztBQUVPLFNBQVMsa0JBQWtCLFNBQXFGO0FBQ3RILFNBQU8sT0FBTyxTQUFTLEVBQUUsSUFBSSxNQUFNLFFBQVEsS0FBSyxDQUFDLEtBQUssT0FBTyxTQUFTLEVBQUUsSUFBSSxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQ2hHO0FBRU8sU0FBUyxzQkFBc0IsU0FBMEQ7QUFDL0YsU0FBTyxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxTQUFTLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFDMUU7QUFHQSxTQUFTLFdBQWMsT0FBNEM7QUFDbEUsU0FBTyxPQUFPLFVBQVUsWUFBWSxVQUFVLFFBQVEsVUFBVSxTQUFTLE9BQU8sTUFBTSxTQUFTO0FBQ2hHOyIsCiAgIm5hbWVzIjogWyJyZXBseSJdCn0K
