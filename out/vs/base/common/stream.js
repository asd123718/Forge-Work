import { onUnexpectedError } from "./errors.js";
import { DisposableStore, toDisposable } from "./lifecycle.js";
function isReadable(obj) {
  const candidate = obj;
  if (!candidate) {
    return false;
  }
  return typeof candidate.read === "function";
}
function isReadableStream(obj) {
  const candidate = obj;
  if (!candidate) {
    return false;
  }
  return [candidate.on, candidate.pause, candidate.resume, candidate.destroy].every((fn) => typeof fn === "function");
}
function isReadableBufferedStream(obj) {
  const candidate = obj;
  if (!candidate) {
    return false;
  }
  return isReadableStream(candidate.stream) && Array.isArray(candidate.buffer) && typeof candidate.ended === "boolean";
}
function newWriteableStream(reducer, options) {
  return new WriteableStreamImpl(reducer, options);
}
class WriteableStreamImpl {
  /**
   * @param reducer a function that reduces the buffered data into a single object;
   * 				  because some objects can be complex and non-reducible, we also
   * 				  allow passing the explicit `null` value to skip the reduce step
   * @param options stream options
   */
  constructor(reducer, options) {
    this.reducer = reducer;
    this.options = options;
    this.state = {
      flowing: false,
      ended: false,
      destroyed: false
    };
    this.buffer = {
      data: [],
      error: []
    };
    this.listeners = {
      data: [],
      error: [],
      end: []
    };
    this.pendingWritePromises = [];
  }
  pause() {
    if (this.state.destroyed) {
      return;
    }
    this.state.flowing = false;
  }
  resume() {
    if (this.state.destroyed) {
      return;
    }
    if (!this.state.flowing) {
      this.state.flowing = true;
      this.flowData();
      this.flowErrors();
      this.flowEnd();
    }
  }
  write(data) {
    if (this.state.destroyed) {
      return;
    }
    if (this.state.flowing) {
      this.emitData(data);
    } else {
      this.buffer.data.push(data);
      if (typeof this.options?.highWaterMark === "number" && this.buffer.data.length > this.options.highWaterMark) {
        return new Promise((resolve) => this.pendingWritePromises.push(resolve));
      }
    }
  }
  error(error) {
    if (this.state.destroyed) {
      return;
    }
    if (this.state.flowing) {
      this.emitError(error);
    } else {
      this.buffer.error.push(error);
    }
  }
  end(result) {
    if (this.state.destroyed) {
      return;
    }
    if (typeof result !== "undefined") {
      this.write(result);
    }
    if (this.state.flowing) {
      this.emitEnd();
      this.destroy();
    } else {
      this.state.ended = true;
    }
  }
  emitData(data) {
    this.listeners.data.slice(0).forEach((listener) => listener(data));
  }
  emitError(error) {
    if (this.listeners.error.length === 0) {
      onUnexpectedError(error);
    } else {
      this.listeners.error.slice(0).forEach((listener) => listener(error));
    }
  }
  emitEnd() {
    this.listeners.end.slice(0).forEach((listener) => listener());
  }
  on(event, callback) {
    if (this.state.destroyed) {
      return;
    }
    switch (event) {
      case "data":
        this.listeners.data.push(callback);
        this.resume();
        break;
      case "end":
        this.listeners.end.push(callback);
        if (this.state.flowing && this.flowEnd()) {
          this.destroy();
        }
        break;
      case "error":
        this.listeners.error.push(callback);
        if (this.state.flowing) {
          this.flowErrors();
        }
        break;
    }
  }
  removeListener(event, callback) {
    if (this.state.destroyed) {
      return;
    }
    let listeners = void 0;
    switch (event) {
      case "data":
        listeners = this.listeners.data;
        break;
      case "end":
        listeners = this.listeners.end;
        break;
      case "error":
        listeners = this.listeners.error;
        break;
    }
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  }
  flowData() {
    if (this.buffer.data.length === 0) {
      return;
    }
    if (typeof this.reducer === "function") {
      const fullDataBuffer = this.reducer(this.buffer.data);
      this.emitData(fullDataBuffer);
    } else {
      for (const data of this.buffer.data) {
        this.emitData(data);
      }
    }
    this.buffer.data.length = 0;
    const pendingWritePromises = [...this.pendingWritePromises];
    this.pendingWritePromises.length = 0;
    pendingWritePromises.forEach((pendingWritePromise) => pendingWritePromise());
  }
  flowErrors() {
    if (this.listeners.error.length > 0) {
      for (const error of this.buffer.error) {
        this.emitError(error);
      }
      this.buffer.error.length = 0;
    }
  }
  flowEnd() {
    if (this.state.ended) {
      this.emitEnd();
      return this.listeners.end.length > 0;
    }
    return false;
  }
  destroy() {
    if (!this.state.destroyed) {
      this.state.destroyed = true;
      this.state.ended = true;
      this.buffer.data.length = 0;
      this.buffer.error.length = 0;
      this.listeners.data.length = 0;
      this.listeners.error.length = 0;
      this.listeners.end.length = 0;
      this.pendingWritePromises.length = 0;
    }
  }
}
function consumeReadable(readable, reducer) {
  const chunks = [];
  let chunk;
  while ((chunk = readable.read()) !== null) {
    chunks.push(chunk);
  }
  return reducer(chunks);
}
function peekReadable(readable, reducer, maxChunks) {
  const chunks = [];
  let chunk = void 0;
  while ((chunk = readable.read()) !== null && chunks.length < maxChunks) {
    chunks.push(chunk);
  }
  if (chunk === null && chunks.length > 0) {
    return reducer(chunks);
  }
  return {
    read: () => {
      if (chunks.length > 0) {
        return chunks.shift();
      }
      if (typeof chunk !== "undefined") {
        const lastReadChunk = chunk;
        chunk = void 0;
        return lastReadChunk;
      }
      return readable.read();
    }
  };
}
function consumeStream(stream, reducer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    listenStream(stream, {
      onData: (chunk) => {
        if (reducer) {
          chunks.push(chunk);
        }
      },
      onError: (error) => {
        if (reducer) {
          reject(error);
        } else {
          resolve(void 0);
        }
      },
      onEnd: () => {
        if (reducer) {
          resolve(reducer(chunks));
        } else {
          resolve(void 0);
        }
      }
    });
  });
}
function listenStream(stream, listener, token) {
  stream.on("error", (error) => {
    if (!token?.isCancellationRequested) {
      listener.onError(error);
    }
  });
  stream.on("end", () => {
    if (!token?.isCancellationRequested) {
      listener.onEnd();
    }
  });
  stream.on("data", (data) => {
    if (!token?.isCancellationRequested) {
      listener.onData(data);
    }
  });
}
function peekStream(stream, maxChunks) {
  return new Promise((resolve, reject) => {
    const streamListeners = new DisposableStore();
    const buffer = [];
    const dataListener = (chunk) => {
      buffer.push(chunk);
      if (buffer.length > maxChunks) {
        streamListeners.dispose();
        stream.pause();
        return resolve({ stream, buffer, ended: false });
      }
    };
    const errorListener = (error) => {
      streamListeners.dispose();
      return reject(error);
    };
    const endListener = () => {
      streamListeners.dispose();
      return resolve({ stream, buffer, ended: true });
    };
    streamListeners.add(toDisposable(() => stream.removeListener("error", errorListener)));
    stream.on("error", errorListener);
    streamListeners.add(toDisposable(() => stream.removeListener("end", endListener)));
    stream.on("end", endListener);
    streamListeners.add(toDisposable(() => stream.removeListener("data", dataListener)));
    stream.on("data", dataListener);
  });
}
function toStream(t, reducer) {
  const stream = newWriteableStream(reducer);
  stream.end(t);
  return stream;
}
function emptyStream() {
  const stream = newWriteableStream(() => {
    throw new Error("not supported");
  });
  stream.end();
  return stream;
}
function toReadable(t) {
  let consumed = false;
  return {
    read: () => {
      if (consumed) {
        return null;
      }
      consumed = true;
      return t;
    }
  };
}
function transform(stream, transformer, reducer) {
  const target = newWriteableStream(reducer);
  listenStream(stream, {
    onData: (data) => target.write(transformer.data(data)),
    onError: (error) => target.error(transformer.error ? transformer.error(error) : error),
    onEnd: () => target.end()
  });
  return target;
}
function prefixedReadable(prefix, readable, reducer) {
  let prefixHandled = false;
  return {
    read: () => {
      const chunk = readable.read();
      if (!prefixHandled) {
        prefixHandled = true;
        if (chunk !== null) {
          return reducer([prefix, chunk]);
        }
        return prefix;
      }
      return chunk;
    }
  };
}
function prefixedStream(prefix, stream, reducer) {
  let prefixHandled = false;
  const target = newWriteableStream(reducer);
  listenStream(stream, {
    onData: (data) => {
      if (!prefixHandled) {
        prefixHandled = true;
        return target.write(reducer([prefix, data]));
      }
      return target.write(data);
    },
    onError: (error) => target.error(error),
    onEnd: () => {
      if (!prefixHandled) {
        prefixHandled = true;
        target.write(prefix);
      }
      target.end();
    }
  });
  return target;
}
export {
  consumeReadable,
  consumeStream,
  emptyStream,
  isReadable,
  isReadableBufferedStream,
  isReadableStream,
  listenStream,
  newWriteableStream,
  peekReadable,
  peekStream,
  prefixedReadable,
  prefixedStream,
  toReadable,
  toStream,
  transform
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHN0cmVhbS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4vbGlmZWN5Y2xlLmpzJztcblxuLyoqXG4gKiBUaGUgcGF5bG9hZCB0aGF0IGZsb3dzIGluIHJlYWRhYmxlIHN0cmVhbSBldmVudHMuXG4gKi9cbmV4cG9ydCB0eXBlIFJlYWRhYmxlU3RyZWFtRXZlbnRQYXlsb2FkPFQ+ID0gVCB8IEVycm9yIHwgJ2VuZCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhZGFibGVTdHJlYW1FdmVudHM8VD4ge1xuXG5cdC8qKlxuXHQgKiBUaGUgJ2RhdGEnIGV2ZW50IGlzIGVtaXR0ZWQgd2hlbmV2ZXIgdGhlIHN0cmVhbSBpc1xuXHQgKiByZWxpbnF1aXNoaW5nIG93bmVyc2hpcCBvZiBhIGNodW5rIG9mIGRhdGEgdG8gYSBjb25zdW1lci5cblx0ICpcblx0ICogTk9URTogUExFQVNFIFVOREVSU1RBTkQgVEhBVCBBRERJTkcgQSBEQVRBIExJU1RFTkVSIENBTlxuXHQgKiBUVVJOIFRIRSBTVFJFQU0gSU5UTyBGTE9XSU5HIE1PREUuIElUIElTIFRIRVJFRk9SIFRIRVxuXHQgKiBMQVNUIExJU1RFTkVSIFRIQVQgU0hPVUxEIEJFIEFEREVEIEFORCBOT1QgVEhFIEZJUlNUXG5cdCAqXG5cdCAqIFVzZSBgbGlzdGVuU3RyZWFtYCBhcyBhIGhlbHBlciBtZXRob2QgdG8gbGlzdGVuIHRvXG5cdCAqIHN0cmVhbSBldmVudHMgaW4gdGhlIHJpZ2h0IG9yZGVyLlxuXHQgKi9cblx0b24oZXZlbnQ6ICdkYXRhJywgY2FsbGJhY2s6IChkYXRhOiBUKSA9PiB2b2lkKTogdm9pZDtcblxuXHQvKipcblx0ICogRW1pdHRlZCB3aGVuIGFueSBlcnJvciBvY2N1cnMuXG5cdCAqL1xuXHRvbihldmVudDogJ2Vycm9yJywgY2FsbGJhY2s6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogdm9pZDtcblxuXHQvKipcblx0ICogVGhlICdlbmQnIGV2ZW50IGlzIGVtaXR0ZWQgd2hlbiB0aGVyZSBpcyBubyBtb3JlIGRhdGFcblx0ICogdG8gYmUgY29uc3VtZWQgZnJvbSB0aGUgc3RyZWFtLiBUaGUgJ2VuZCcgZXZlbnQgd2lsbFxuXHQgKiBub3QgYmUgZW1pdHRlZCB1bmxlc3MgdGhlIGRhdGEgaXMgY29tcGxldGVseSBjb25zdW1lZC5cblx0ICovXG5cdG9uKGV2ZW50OiAnZW5kJywgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkO1xufVxuXG4vKipcbiAqIEEgaW50ZXJmYWNlIHRoYXQgZW11bGF0ZXMgdGhlIEFQSSBzaGFwZSBvZiBhIG5vZGUuanMgcmVhZGFibGVcbiAqIHN0cmVhbSBmb3IgdXNlIGluIG5hdGl2ZSBhbmQgd2ViIGVudmlyb25tZW50cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZWFkYWJsZVN0cmVhbTxUPiBleHRlbmRzIFJlYWRhYmxlU3RyZWFtRXZlbnRzPFQ+IHtcblxuXHQvKipcblx0ICogU3RvcHMgZW1pdHRpbmcgYW55IGV2ZW50cyB1bnRpbCByZXN1bWUoKSBpcyBjYWxsZWQuXG5cdCAqL1xuXHRwYXVzZSgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBTdGFydHMgZW1pdHRpbmcgZXZlbnRzIGFnYWluIGFmdGVyIHBhdXNlKCkgd2FzIGNhbGxlZC5cblx0ICovXG5cdHJlc3VtZSgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXN0cm95cyB0aGUgc3RyZWFtIGFuZCBzdG9wcyBlbWl0dGluZyBhbnkgZXZlbnQuXG5cdCAqL1xuXHRkZXN0cm95KCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byByZW1vdmUgYSBsaXN0ZW5lciB0aGF0IHdhcyBwcmV2aW91c2x5IGFkZGVkLlxuXHQgKi9cblx0cmVtb3ZlTGlzdGVuZXIoZXZlbnQ6IHN0cmluZywgY2FsbGJhY2s6IEZ1bmN0aW9uKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBIGludGVyZmFjZSB0aGF0IGVtdWxhdGVzIHRoZSBBUEkgc2hhcGUgb2YgYSBub2RlLmpzIHJlYWRhYmxlXG4gKiBmb3IgdXNlIGluIG5hdGl2ZSBhbmQgd2ViIGVudmlyb25tZW50cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZWFkYWJsZTxUPiB7XG5cblx0LyoqXG5cdCAqIFJlYWQgZGF0YSBmcm9tIHRoZSB1bmRlcmx5aW5nIHNvdXJjZS4gV2lsbCByZXR1cm5cblx0ICogbnVsbCB0byBpbmRpY2F0ZSB0aGF0IG5vIG1vcmUgZGF0YSBjYW4gYmUgcmVhZC5cblx0ICovXG5cdHJlYWQoKTogVCB8IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1JlYWRhYmxlPFQ+KG9iajogdW5rbm93bik6IG9iaiBpcyBSZWFkYWJsZTxUPiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IG9iaiBhcyBSZWFkYWJsZTxUPiB8IHVuZGVmaW5lZDtcblx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHlwZW9mIGNhbmRpZGF0ZS5yZWFkID09PSAnZnVuY3Rpb24nO1xufVxuXG4vKipcbiAqIEEgaW50ZXJmYWNlIHRoYXQgZW11bGF0ZXMgdGhlIEFQSSBzaGFwZSBvZiBhIG5vZGUuanMgd3JpdGVhYmxlXG4gKiBzdHJlYW0gZm9yIHVzZSBpbiBuYXRpdmUgYW5kIHdlYiBlbnZpcm9ubWVudHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgV3JpdGVhYmxlU3RyZWFtPFQ+IGV4dGVuZHMgUmVhZGFibGVTdHJlYW08VD4ge1xuXG5cdC8qKlxuXHQgKiBXcml0aW5nIGRhdGEgdG8gdGhlIHN0cmVhbSB3aWxsIHRyaWdnZXIgdGhlIG9uKCdkYXRhJylcblx0ICogZXZlbnQgbGlzdGVuZXIgaWYgdGhlIHN0cmVhbSBpcyBmbG93aW5nIGFuZCBidWZmZXIgdGhlXG5cdCAqIGRhdGEgb3RoZXJ3aXNlIHVudGlsIHRoZSBzdHJlYW0gaXMgZmxvd2luZy5cblx0ICpcblx0ICogSWYgYSBgaGlnaFdhdGVyTWFya2AgaXMgY29uZmlndXJlZCBhbmQgd3JpdGluZyB0byB0aGVcblx0ICogc3RyZWFtIHJlYWNoZXMgdGhpcyBtYXJrLCBhIHByb21pc2Ugd2lsbCBiZSByZXR1cm5lZFxuXHQgKiB0aGF0IHNob3VsZCBiZSBhd2FpdGVkIG9uIGJlZm9yZSB3cml0aW5nIG1vcmUgZGF0YS5cblx0ICogT3RoZXJ3aXNlIHRoZXJlIGlzIGEgcmlzayBvZiBidWZmZXJpbmcgYSBsYXJnZSBudW1iZXJcblx0ICogb2YgZGF0YSBjaHVua3Mgd2l0aG91dCBjb25zdW1lci5cblx0ICovXG5cdHdyaXRlKGRhdGE6IFQpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogU2lnbmFscyBhbiBlcnJvciB0byB0aGUgY29uc3VtZXIgb2YgdGhlIHN0cmVhbSB2aWEgdGhlXG5cdCAqIG9uKCdlcnJvcicpIGhhbmRsZXIgaWYgdGhlIHN0cmVhbSBpcyBmbG93aW5nLlxuXHQgKlxuXHQgKiBOT1RFOiBjYWxsIGBlbmRgIHRvIHNpZ25hbCB0aGF0IHRoZSBzdHJlYW0gaGFzIGVuZGVkLFxuXHQgKiB0aGlzIERPRVMgTk9UIGhhcHBlbiBhdXRvbWF0aWNhbGx5IGZyb20gYGVycm9yYC5cblx0ICovXG5cdGVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFNpZ25hbHMgdGhlIGVuZCBvZiB0aGUgc3RyZWFtIHRvIHRoZSBjb25zdW1lci4gSWYgdGhlXG5cdCAqIHJlc3VsdCBpcyBwcm92aWRlZCwgd2lsbCB0cmlnZ2VyIHRoZSBvbignZGF0YScpIGV2ZW50XG5cdCAqIGxpc3RlbmVyIGlmIHRoZSBzdHJlYW0gaXMgZmxvd2luZyBhbmQgYnVmZmVyIHRoZSBkYXRhXG5cdCAqIG90aGVyd2lzZSB1bnRpbCB0aGUgc3RyZWFtIGlzIGZsb3dpbmcuXG5cdCAqL1xuXHRlbmQocmVzdWx0PzogVCk6IHZvaWQ7XG59XG5cbi8qKlxuICogQSBzdHJlYW0gdGhhdCBoYXMgYSBidWZmZXIgYWxyZWFkeSByZWFkLiBSZXR1cm5zIHRoZSBvcmlnaW5hbCBzdHJlYW1cbiAqIHRoYXQgd2FzIHJlYWQgYXMgd2VsbCBhcyB0aGUgY2h1bmtzIHRoYXQgZ290IHJlYWQuXG4gKlxuICogVGhlIGBlbmRlZGAgZmxhZyBpbmRpY2F0ZXMgaWYgdGhlIHN0cmVhbSBoYXMgYmVlbiBmdWxseSBjb25zdW1lZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZWFkYWJsZUJ1ZmZlcmVkU3RyZWFtPFQ+IHtcblxuXHQvKipcblx0ICogVGhlIG9yaWdpbmFsIHN0cmVhbSB0aGF0IGlzIGJlaW5nIHJlYWQuXG5cdCAqL1xuXHRzdHJlYW06IFJlYWRhYmxlU3RyZWFtPFQ+O1xuXG5cdC8qKlxuXHQgKiBBbiBhcnJheSBvZiBjaHVua3MgYWxyZWFkeSByZWFkIGZyb20gdGhpcyBzdHJlYW0uXG5cdCAqL1xuXHRidWZmZXI6IFRbXTtcblxuXHQvKipcblx0ICogU2lnbmFscyBpZiB0aGUgc3RyZWFtIGhhcyBlbmRlZCBvciBub3QuIElmIG5vdCwgY29uc3VtZXJzXG5cdCAqIHNob3VsZCBjb250aW51ZSB0byByZWFkIGZyb20gdGhlIHN0cmVhbSB1bnRpbCBjb25zdW1lZC5cblx0ICovXG5cdGVuZGVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNSZWFkYWJsZVN0cmVhbTxUPihvYmo6IHVua25vd24pOiBvYmogaXMgUmVhZGFibGVTdHJlYW08VD4ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgUmVhZGFibGVTdHJlYW08VD4gfCB1bmRlZmluZWQ7XG5cdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIFtjYW5kaWRhdGUub24sIGNhbmRpZGF0ZS5wYXVzZSwgY2FuZGlkYXRlLnJlc3VtZSwgY2FuZGlkYXRlLmRlc3Ryb3ldLmV2ZXJ5KGZuID0+IHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1JlYWRhYmxlQnVmZmVyZWRTdHJlYW08VD4ob2JqOiB1bmtub3duKTogb2JqIGlzIFJlYWRhYmxlQnVmZmVyZWRTdHJlYW08VD4ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgUmVhZGFibGVCdWZmZXJlZFN0cmVhbTxUPiB8IHVuZGVmaW5lZDtcblx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gaXNSZWFkYWJsZVN0cmVhbShjYW5kaWRhdGUuc3RyZWFtKSAmJiBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5idWZmZXIpICYmIHR5cGVvZiBjYW5kaWRhdGUuZW5kZWQgPT09ICdib29sZWFuJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVkdWNlcjxULCBSID0gVD4ge1xuXHQoZGF0YTogVFtdKTogUjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGF0YVRyYW5zZm9ybWVyPE9yaWdpbmFsLCBUcmFuc2Zvcm1lZD4ge1xuXHQoZGF0YTogT3JpZ2luYWwpOiBUcmFuc2Zvcm1lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXJyb3JUcmFuc2Zvcm1lciB7XG5cdChlcnJvcjogRXJyb3IpOiBFcnJvcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVHJhbnNmb3JtZXI8T3JpZ2luYWwsIFRyYW5zZm9ybWVkPiB7XG5cdGRhdGE6IElEYXRhVHJhbnNmb3JtZXI8T3JpZ2luYWwsIFRyYW5zZm9ybWVkPjtcblx0ZXJyb3I/OiBJRXJyb3JUcmFuc2Zvcm1lcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5ld1dyaXRlYWJsZVN0cmVhbTxUPihyZWR1Y2VyOiBJUmVkdWNlcjxUPiB8IG51bGwsIG9wdGlvbnM/OiBXcml0ZWFibGVTdHJlYW1PcHRpb25zKTogV3JpdGVhYmxlU3RyZWFtPFQ+IHtcblx0cmV0dXJuIG5ldyBXcml0ZWFibGVTdHJlYW1JbXBsPFQ+KHJlZHVjZXIsIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdyaXRlYWJsZVN0cmVhbU9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIG9iamVjdHMgdG8gYnVmZmVyIGJlZm9yZSBXcml0ZWFibGVTdHJlYW0jd3JpdGUoKVxuXHQgKiBzaWduYWxzIGJhY2sgdGhhdCB0aGUgYnVmZmVyIGlzIGZ1bGwuIENhbiBiZSB1c2VkIHRvIHJlZHVjZVxuXHQgKiB0aGUgbWVtb3J5IHByZXNzdXJlIHdoZW4gdGhlIHN0cmVhbSBpcyBub3QgZmxvd2luZy5cblx0ICovXG5cdGhpZ2hXYXRlck1hcms/OiBudW1iZXI7XG59XG5cbmNsYXNzIFdyaXRlYWJsZVN0cmVhbUltcGw8VD4gaW1wbGVtZW50cyBXcml0ZWFibGVTdHJlYW08VD4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdGUgPSB7XG5cdFx0Zmxvd2luZzogZmFsc2UsXG5cdFx0ZW5kZWQ6IGZhbHNlLFxuXHRcdGRlc3Ryb3llZDogZmFsc2Vcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGJ1ZmZlciA9IHtcblx0XHRkYXRhOiBbXSBhcyBUW10sXG5cdFx0ZXJyb3I6IFtdIGFzIEVycm9yW11cblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxpc3RlbmVycyA9IHtcblx0XHRkYXRhOiBbXSBhcyB7IChkYXRhOiBUKTogdm9pZCB9W10sXG5cdFx0ZXJyb3I6IFtdIGFzIHsgKGVycm9yOiBFcnJvcik6IHZvaWQgfVtdLFxuXHRcdGVuZDogW10gYXMgeyAoKTogdm9pZCB9W11cblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBlbmRpbmdXcml0ZVByb21pc2VzOiBGdW5jdGlvbltdID0gW107XG5cblx0LyoqXG5cdCAqIEBwYXJhbSByZWR1Y2VyIGEgZnVuY3Rpb24gdGhhdCByZWR1Y2VzIHRoZSBidWZmZXJlZCBkYXRhIGludG8gYSBzaW5nbGUgb2JqZWN0O1xuXHQgKiBcdFx0XHRcdCAgYmVjYXVzZSBzb21lIG9iamVjdHMgY2FuIGJlIGNvbXBsZXggYW5kIG5vbi1yZWR1Y2libGUsIHdlIGFsc29cblx0ICogXHRcdFx0XHQgIGFsbG93IHBhc3NpbmcgdGhlIGV4cGxpY2l0IGBudWxsYCB2YWx1ZSB0byBza2lwIHRoZSByZWR1Y2Ugc3RlcFxuXHQgKiBAcGFyYW0gb3B0aW9ucyBzdHJlYW0gb3B0aW9uc1xuXHQgKi9cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWR1Y2VyOiBJUmVkdWNlcjxUPiB8IG51bGwsIHByaXZhdGUgb3B0aW9ucz86IFdyaXRlYWJsZVN0cmVhbU9wdGlvbnMpIHsgfVxuXG5cdHBhdXNlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlLmRlc3Ryb3llZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUuZmxvd2luZyA9IGZhbHNlO1xuXHR9XG5cblx0cmVzdW1lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlLmRlc3Ryb3llZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zdGF0ZS5mbG93aW5nKSB7XG5cdFx0XHR0aGlzLnN0YXRlLmZsb3dpbmcgPSB0cnVlO1xuXG5cdFx0XHQvLyBlbWl0IGJ1ZmZlcmVkIGV2ZW50c1xuXHRcdFx0dGhpcy5mbG93RGF0YSgpO1xuXHRcdFx0dGhpcy5mbG93RXJyb3JzKCk7XG5cdFx0XHR0aGlzLmZsb3dFbmQoKTtcblx0XHR9XG5cdH1cblxuXHR3cml0ZShkYXRhOiBUKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0YXRlLmRlc3Ryb3llZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGZsb3dpbmc6IGRpcmVjdGx5IHNlbmQgdGhlIGRhdGEgdG8gbGlzdGVuZXJzXG5cdFx0aWYgKHRoaXMuc3RhdGUuZmxvd2luZykge1xuXHRcdFx0dGhpcy5lbWl0RGF0YShkYXRhKTtcblx0XHR9XG5cblx0XHQvLyBub3QgeWV0IGZsb3dpbmc6IGJ1ZmZlciBkYXRhIHVudGlsIGZsb3dpbmdcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuYnVmZmVyLmRhdGEucHVzaChkYXRhKTtcblxuXHRcdFx0Ly8gaGlnaFdhdGVyTWFyazogaWYgY29uZmlndXJlZCwgc2lnbmFsIGJhY2sgd2hlbiBidWZmZXIgcmVhY2hlZCBsaW1pdHNcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5vcHRpb25zPy5oaWdoV2F0ZXJNYXJrID09PSAnbnVtYmVyJyAmJiB0aGlzLmJ1ZmZlci5kYXRhLmxlbmd0aCA+IHRoaXMub3B0aW9ucy5oaWdoV2F0ZXJNYXJrKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMucGVuZGluZ1dyaXRlUHJvbWlzZXMucHVzaChyZXNvbHZlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZXJyb3IoZXJyb3I6IEVycm9yKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUuZGVzdHJveWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZmxvd2luZzogZGlyZWN0bHkgc2VuZCB0aGUgZXJyb3IgdG8gbGlzdGVuZXJzXG5cdFx0aWYgKHRoaXMuc3RhdGUuZmxvd2luZykge1xuXHRcdFx0dGhpcy5lbWl0RXJyb3IoZXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIG5vdCB5ZXQgZmxvd2luZzogYnVmZmVyIGVycm9ycyB1bnRpbCBmbG93aW5nXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmJ1ZmZlci5lcnJvci5wdXNoKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRlbmQocmVzdWx0PzogVCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlLmRlc3Ryb3llZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGVuZCB3aXRoIGRhdGEgaWYgcHJvdmlkZWRcblx0XHRpZiAodHlwZW9mIHJlc3VsdCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMud3JpdGUocmVzdWx0KTtcblx0XHR9XG5cblx0XHQvLyBmbG93aW5nOiBzZW5kIGVuZCBldmVudCB0byBsaXN0ZW5lcnNcblx0XHRpZiAodGhpcy5zdGF0ZS5mbG93aW5nKSB7XG5cdFx0XHR0aGlzLmVtaXRFbmQoKTtcblxuXHRcdFx0dGhpcy5kZXN0cm95KCk7XG5cdFx0fVxuXG5cdFx0Ly8gbm90IHlldCBmbG93aW5nOiByZW1lbWJlciBzdGF0ZVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5zdGF0ZS5lbmRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbWl0RGF0YShkYXRhOiBUKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0ZW5lcnMuZGF0YS5zbGljZSgwKS5mb3JFYWNoKGxpc3RlbmVyID0+IGxpc3RlbmVyKGRhdGEpKTsgLy8gc2xpY2UgdG8gYXZvaWQgbGlzdGVuZXIgbXV0YXRpb24gZnJvbSBkZWxpdmVyaW5nIGV2ZW50XG5cdH1cblxuXHRwcml2YXRlIGVtaXRFcnJvcihlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saXN0ZW5lcnMuZXJyb3IubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7IC8vIG5vYm9keSBsaXN0ZW5lZCB0byB0aGlzIGVycm9yIHNvIHdlIGxvZyBpdCBhcyB1bmV4cGVjdGVkXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGlzdGVuZXJzLmVycm9yLnNsaWNlKDApLmZvckVhY2gobGlzdGVuZXIgPT4gbGlzdGVuZXIoZXJyb3IpKTsgLy8gc2xpY2UgdG8gYXZvaWQgbGlzdGVuZXIgbXV0YXRpb24gZnJvbSBkZWxpdmVyaW5nIGV2ZW50XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbWl0RW5kKCk6IHZvaWQge1xuXHRcdHRoaXMubGlzdGVuZXJzLmVuZC5zbGljZSgwKS5mb3JFYWNoKGxpc3RlbmVyID0+IGxpc3RlbmVyKCkpOyAvLyBzbGljZSB0byBhdm9pZCBsaXN0ZW5lciBtdXRhdGlvbiBmcm9tIGRlbGl2ZXJpbmcgZXZlbnRcblx0fVxuXG5cdG9uKGV2ZW50OiAnZGF0YScsIGNhbGxiYWNrOiAoZGF0YTogVCkgPT4gdm9pZCk6IHZvaWQ7XG5cdG9uKGV2ZW50OiAnZXJyb3InLCBjYWxsYmFjazogKGVycjogRXJyb3IpID0+IHZvaWQpOiB2b2lkO1xuXHRvbihldmVudDogJ2VuZCcsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZDtcblx0b24oZXZlbnQ6ICdkYXRhJyB8ICdlcnJvcicgfCAnZW5kJywgY2FsbGJhY2s6ICgoZGF0YTogVCkgPT4gdm9pZCkgfCAoKGVycjogRXJyb3IpID0+IHZvaWQpIHwgKCgpID0+IHZvaWQpKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUuZGVzdHJveWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChldmVudCkge1xuXHRcdFx0Y2FzZSAnZGF0YSc6XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmRhdGEucHVzaChjYWxsYmFjayBhcyAoZGF0YTogVCkgPT4gdm9pZCk7XG5cblx0XHRcdFx0Ly8gc3dpdGNoIGludG8gZmxvd2luZyBtb2RlIGFzIHNvb24gYXMgdGhlIGZpcnN0ICdkYXRhJ1xuXHRcdFx0XHQvLyBsaXN0ZW5lciBpcyBhZGRlZCBhbmQgd2UgYXJlIG5vdCB5ZXQgaW4gZmxvd2luZyBtb2RlXG5cdFx0XHRcdHRoaXMucmVzdW1lKCk7XG5cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2VuZCc6XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmVuZC5wdXNoKGNhbGxiYWNrIGFzICgpID0+IHZvaWQpO1xuXG5cdFx0XHRcdC8vIGVtaXQgJ2VuZCcgZXZlbnQgZGlyZWN0bHkgaWYgd2UgYXJlIGZsb3dpbmdcblx0XHRcdFx0Ly8gYW5kIHRoZSBlbmQgaGFzIGFscmVhZHkgYmVlbiByZWFjaGVkXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIGZpbmlzaCgpIHdoZW4gaXQgd2VudCB0aHJvdWdoXG5cdFx0XHRcdGlmICh0aGlzLnN0YXRlLmZsb3dpbmcgJiYgdGhpcy5mbG93RW5kKCkpIHtcblx0XHRcdFx0XHR0aGlzLmRlc3Ryb3koKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmVycm9yLnB1c2goY2FsbGJhY2sgYXMgKGVycjogRXJyb3IpID0+IHZvaWQpO1xuXG5cdFx0XHRcdC8vIGVtaXQgYnVmZmVyZWQgJ2Vycm9yJyBldmVudHMgdW5sZXNzIGRvbmUgYWxyZWFkeVxuXHRcdFx0XHQvLyBub3cgdGhhdCB3ZSBrbm93IHRoYXQgd2UgaGF2ZSBhdCBsZWFzdCBvbmUgbGlzdGVuZXJcblx0XHRcdFx0aWYgKHRoaXMuc3RhdGUuZmxvd2luZykge1xuXHRcdFx0XHRcdHRoaXMuZmxvd0Vycm9ycygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlTGlzdGVuZXIoZXZlbnQ6IHN0cmluZywgY2FsbGJhY2s6IEZ1bmN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUuZGVzdHJveWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGxpc3RlbmVyczogdW5rbm93bltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0c3dpdGNoIChldmVudCkge1xuXHRcdFx0Y2FzZSAnZGF0YSc6XG5cdFx0XHRcdGxpc3RlbmVycyA9IHRoaXMubGlzdGVuZXJzLmRhdGE7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdlbmQnOlxuXHRcdFx0XHRsaXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVycy5lbmQ7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdGxpc3RlbmVycyA9IHRoaXMubGlzdGVuZXJzLmVycm9yO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAobGlzdGVuZXJzKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IGxpc3RlbmVycy5pbmRleE9mKGNhbGxiYWNrKTtcblx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdGxpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmxvd0RhdGEoKTogdm9pZCB7XG5cdFx0Ly8gaWYgYnVmZmVyIGlzIGVtcHR5LCBub3RoaW5nIHRvIGRvXG5cdFx0aWYgKHRoaXMuYnVmZmVyLmRhdGEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gaWYgYnVmZmVyIGRhdGEgY2FuIGJlIHJlZHVjZWQgaW50byBhIHNpbmdsZSBvYmplY3QsXG5cdFx0Ly8gZW1pdCB0aGUgcmVkdWNlZCBkYXRhXG5cdFx0aWYgKHR5cGVvZiB0aGlzLnJlZHVjZXIgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGNvbnN0IGZ1bGxEYXRhQnVmZmVyID0gdGhpcy5yZWR1Y2VyKHRoaXMuYnVmZmVyLmRhdGEpO1xuXG5cdFx0XHR0aGlzLmVtaXREYXRhKGZ1bGxEYXRhQnVmZmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gb3RoZXJ3aXNlIGVtaXQgZWFjaCBidWZmZXJlZCBkYXRhIGluc3RhbmNlIGluZGl2aWR1YWxseVxuXHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIHRoaXMuYnVmZmVyLmRhdGEpIHtcblx0XHRcdFx0dGhpcy5lbWl0RGF0YShkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmJ1ZmZlci5kYXRhLmxlbmd0aCA9IDA7XG5cblx0XHQvLyB3aGVuIHRoZSBidWZmZXIgaXMgZW1wdHksIHJlc29sdmUgYWxsIHBlbmRpbmcgd3JpdGVyc1xuXHRcdGNvbnN0IHBlbmRpbmdXcml0ZVByb21pc2VzID0gWy4uLnRoaXMucGVuZGluZ1dyaXRlUHJvbWlzZXNdO1xuXHRcdHRoaXMucGVuZGluZ1dyaXRlUHJvbWlzZXMubGVuZ3RoID0gMDtcblx0XHRwZW5kaW5nV3JpdGVQcm9taXNlcy5mb3JFYWNoKHBlbmRpbmdXcml0ZVByb21pc2UgPT4gcGVuZGluZ1dyaXRlUHJvbWlzZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgZmxvd0Vycm9ycygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saXN0ZW5lcnMuZXJyb3IubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBlcnJvciBvZiB0aGlzLmJ1ZmZlci5lcnJvcikge1xuXHRcdFx0XHR0aGlzLmVtaXRFcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYnVmZmVyLmVycm9yLmxlbmd0aCA9IDA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmbG93RW5kKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnN0YXRlLmVuZGVkKSB7XG5cdFx0XHR0aGlzLmVtaXRFbmQoKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMubGlzdGVuZXJzLmVuZC5sZW5ndGggPiAwO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGRlc3Ryb3koKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnN0YXRlLmRlc3Ryb3llZCkge1xuXHRcdFx0dGhpcy5zdGF0ZS5kZXN0cm95ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5zdGF0ZS5lbmRlZCA9IHRydWU7XG5cblx0XHRcdHRoaXMuYnVmZmVyLmRhdGEubGVuZ3RoID0gMDtcblx0XHRcdHRoaXMuYnVmZmVyLmVycm9yLmxlbmd0aCA9IDA7XG5cblx0XHRcdHRoaXMubGlzdGVuZXJzLmRhdGEubGVuZ3RoID0gMDtcblx0XHRcdHRoaXMubGlzdGVuZXJzLmVycm9yLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLmxpc3RlbmVycy5lbmQubGVuZ3RoID0gMDtcblxuXHRcdFx0dGhpcy5wZW5kaW5nV3JpdGVQcm9taXNlcy5sZW5ndGggPSAwO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEhlbHBlciB0byBmdWxseSByZWFkIGEgVCByZWFkYWJsZSBpbnRvIGEgVC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVSZWFkYWJsZTxUPihyZWFkYWJsZTogUmVhZGFibGU8VD4sIHJlZHVjZXI6IElSZWR1Y2VyPFQ+KTogVCB7XG5cdGNvbnN0IGNodW5rczogVFtdID0gW107XG5cblx0bGV0IGNodW5rOiBUIHwgbnVsbDtcblx0d2hpbGUgKChjaHVuayA9IHJlYWRhYmxlLnJlYWQoKSkgIT09IG51bGwpIHtcblx0XHRjaHVua3MucHVzaChjaHVuayk7XG5cdH1cblxuXHRyZXR1cm4gcmVkdWNlcihjaHVua3MpO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byByZWFkIGEgVCByZWFkYWJsZSB1cCB0byBhIG1heGltdW0gb2YgY2h1bmtzLiBJZiB0aGUgbGltaXQgaXNcbiAqIHJlYWNoZWQsIHdpbGwgcmV0dXJuIGEgcmVhZGFibGUgaW5zdGVhZCB0byBlbnN1cmUgYWxsIGRhdGEgY2FuIHN0aWxsXG4gKiBiZSByZWFkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGVla1JlYWRhYmxlPFQ+KHJlYWRhYmxlOiBSZWFkYWJsZTxUPiwgcmVkdWNlcjogSVJlZHVjZXI8VD4sIG1heENodW5rczogbnVtYmVyKTogVCB8IFJlYWRhYmxlPFQ+IHtcblx0Y29uc3QgY2h1bmtzOiBUW10gPSBbXTtcblxuXHRsZXQgY2h1bms6IFQgfCBudWxsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHR3aGlsZSAoKGNodW5rID0gcmVhZGFibGUucmVhZCgpKSAhPT0gbnVsbCAmJiBjaHVua3MubGVuZ3RoIDwgbWF4Q2h1bmtzKSB7XG5cdFx0Y2h1bmtzLnB1c2goY2h1bmspO1xuXHR9XG5cblx0Ly8gSWYgdGhlIGxhc3QgY2h1bmsgaXMgbnVsbCwgaXQgbWVhbnMgd2UgcmVhY2hlZCB0aGUgZW5kIG9mXG5cdC8vIHRoZSByZWFkYWJsZSBhbmQgcmV0dXJuIGFsbCB0aGUgZGF0YSBhdCBvbmNlXG5cdGlmIChjaHVuayA9PT0gbnVsbCAmJiBjaHVua3MubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiByZWR1Y2VyKGNodW5rcyk7XG5cdH1cblxuXHQvLyBPdGhlcndpc2UsIHdlIHN0aWxsIGhhdmUgYSBjaHVuaywgaXQgbWVhbnMgd2UgcmVhY2hlZCB0aGUgbWF4Q2h1bmtzXG5cdC8vIHZhbHVlIGFuZCBhcyBzdWNoIHdlIHJldHVybiBhIG5ldyBSZWFkYWJsZSB0aGF0IGZpcnN0IHJldHVybnNcblx0Ly8gdGhlIGV4aXN0aW5nIHJlYWQgY2h1bmtzIGFuZCB0aGVuIGNvbnRpbnVlcyB3aXRoIHJlYWRpbmcgZnJvbVxuXHQvLyB0aGUgdW5kZXJseWluZyByZWFkYWJsZS5cblx0cmV0dXJuIHtcblx0XHRyZWFkOiAoKSA9PiB7XG5cblx0XHRcdC8vIEZpcnN0IGNvbnN1bWUgY2h1bmtzIGZyb20gb3VyIGFycmF5XG5cdFx0XHRpZiAoY2h1bmtzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIGNodW5rcy5zaGlmdCgpITtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlbiBlbnN1cmUgdG8gcmV0dXJuIG91ciBsYXN0IHJlYWQgY2h1bmtcblx0XHRcdGlmICh0eXBlb2YgY2h1bmsgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RSZWFkQ2h1bmsgPSBjaHVuaztcblxuXHRcdFx0XHQvLyBleHBsaWNpdGx5IHVzZSB1bmRlZmluZWQgaGVyZSB0byBpbmRpY2F0ZSB0aGF0IHdlIGNvbnN1bWVkXG5cdFx0XHRcdC8vIHRoZSBjaHVuaywgd2hpY2ggY291bGQgaGF2ZSBlaXRoZXIgYmVlbiBudWxsIG9yIHZhbHVlZC5cblx0XHRcdFx0Y2h1bmsgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0cmV0dXJuIGxhc3RSZWFkQ2h1bms7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbmFsbHkgZGVsZWdhdGUgYmFjayB0byB0aGUgUmVhZGFibGVcblx0XHRcdHJldHVybiByZWFkYWJsZS5yZWFkKCk7XG5cdFx0fVxuXHR9O1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBmdWxseSByZWFkIGEgVCBzdHJlYW0gaW50byBhIFQgb3IgY29uc3VtaW5nXG4gKiBhIHN0cmVhbSBmdWxseSwgYXdhaXRpbmcgYWxsIHRoZSBldmVudHMgd2l0aG91dCBjYXJpbmdcbiAqIGFib3V0IHRoZSBkYXRhLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZVN0cmVhbTxULCBSID0gVD4oc3RyZWFtOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxUPiwgcmVkdWNlcjogSVJlZHVjZXI8VCwgUj4pOiBQcm9taXNlPFI+O1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVTdHJlYW0oc3RyZWFtOiBSZWFkYWJsZVN0cmVhbUV2ZW50czx1bmtub3duPik6IFByb21pc2U8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lU3RyZWFtPFQsIFIgPSBUPihzdHJlYW06IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFQ+LCByZWR1Y2VyPzogSVJlZHVjZXI8VCwgUj4pOiBQcm9taXNlPFIgfCB1bmRlZmluZWQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBjaHVua3M6IFRbXSA9IFtdO1xuXG5cdFx0bGlzdGVuU3RyZWFtKHN0cmVhbSwge1xuXHRcdFx0b25EYXRhOiBjaHVuayA9PiB7XG5cdFx0XHRcdGlmIChyZWR1Y2VyKSB7XG5cdFx0XHRcdFx0Y2h1bmtzLnB1c2goY2h1bmspO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25FcnJvcjogZXJyb3IgPT4ge1xuXHRcdFx0XHRpZiAocmVkdWNlcikge1xuXHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25FbmQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKHJlZHVjZXIpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHJlZHVjZXIoY2h1bmtzKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdHJlYW1MaXN0ZW5lcjxUPiB7XG5cblx0LyoqXG5cdCAqIFRoZSAnZGF0YScgZXZlbnQgaXMgZW1pdHRlZCB3aGVuZXZlciB0aGUgc3RyZWFtIGlzXG5cdCAqIHJlbGlucXVpc2hpbmcgb3duZXJzaGlwIG9mIGEgY2h1bmsgb2YgZGF0YSB0byBhIGNvbnN1bWVyLlxuXHQgKi9cblx0b25EYXRhKGRhdGE6IFQpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBFbWl0dGVkIHdoZW4gYW55IGVycm9yIG9jY3Vycy5cblx0ICovXG5cdG9uRXJyb3IoZXJyOiBFcnJvcik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFRoZSAnZW5kJyBldmVudCBpcyBlbWl0dGVkIHdoZW4gdGhlcmUgaXMgbm8gbW9yZSBkYXRhXG5cdCAqIHRvIGJlIGNvbnN1bWVkIGZyb20gdGhlIHN0cmVhbS4gVGhlICdlbmQnIGV2ZW50IHdpbGxcblx0ICogbm90IGJlIGVtaXR0ZWQgdW5sZXNzIHRoZSBkYXRhIGlzIGNvbXBsZXRlbHkgY29uc3VtZWQuXG5cdCAqL1xuXHRvbkVuZCgpOiB2b2lkO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBsaXN0ZW4gdG8gYWxsIGV2ZW50cyBvZiBhIFQgc3RyZWFtIGluIHByb3BlciBvcmRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxpc3RlblN0cmVhbTxUPihzdHJlYW06IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFQ+LCBsaXN0ZW5lcjogSVN0cmVhbUxpc3RlbmVyPFQ+LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogdm9pZCB7XG5cblx0c3RyZWFtLm9uKCdlcnJvcicsIGVycm9yID0+IHtcblx0XHRpZiAoIXRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0bGlzdGVuZXIub25FcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9KTtcblxuXHRzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcblx0XHRpZiAoIXRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0bGlzdGVuZXIub25FbmQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEFkZGluZyB0aGUgYGRhdGFgIGxpc3RlbmVyIHdpbGwgdHVybiB0aGUgc3RyZWFtXG5cdC8vIGludG8gZmxvd2luZyBtb2RlLiBBcyBzdWNoIGl0IGlzIGltcG9ydGFudCB0b1xuXHQvLyBhZGQgdGhpcyBsaXN0ZW5lciBsYXN0IChETyBOT1QgQ0hBTkdFISlcblx0c3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG5cdFx0aWYgKCF0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGxpc3RlbmVyLm9uRGF0YShkYXRhKTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBwZWVrIHVwIHRvIGBtYXhDaHVua3NgIGludG8gYSBzdHJlYW0uIFRoZSByZXR1cm4gdHlwZSBzaWduYWxzIGlmXG4gKiB0aGUgc3RyZWFtIGhhcyBlbmRlZCBvciBub3QuIElmIG5vdCwgY2FsbGVyIG5lZWRzIHRvIGFkZCBhIGBkYXRhYCBsaXN0ZW5lclxuICogdG8gY29udGludWUgcmVhZGluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBlZWtTdHJlYW08VD4oc3RyZWFtOiBSZWFkYWJsZVN0cmVhbTxUPiwgbWF4Q2h1bmtzOiBudW1iZXIpOiBQcm9taXNlPFJlYWRhYmxlQnVmZmVyZWRTdHJlYW08VD4+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBzdHJlYW1MaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYnVmZmVyOiBUW10gPSBbXTtcblxuXHRcdC8vIERhdGEgTGlzdGVuZXJcblx0XHRjb25zdCBkYXRhTGlzdGVuZXIgPSAoY2h1bms6IFQpID0+IHtcblxuXHRcdFx0Ly8gQWRkIHRvIGJ1ZmZlclxuXHRcdFx0YnVmZmVyLnB1c2goY2h1bmspO1xuXG5cdFx0XHQvLyBXZSByZWFjaGVkIG1heENodW5rcyBhbmQgdGh1cyBuZWVkIHRvIHJldHVyblxuXHRcdFx0aWYgKGJ1ZmZlci5sZW5ndGggPiBtYXhDaHVua3MpIHtcblxuXHRcdFx0XHQvLyBEaXNwb3NlIGFueSBsaXN0ZW5lcnMgYW5kIGVuc3VyZSB0byBwYXVzZSB0aGVcblx0XHRcdFx0Ly8gc3RyZWFtIHNvIHRoYXQgaXQgY2FuIGJlIGNvbnN1bWVkIGFnYWluIGJ5IGNhbGxlclxuXHRcdFx0XHRzdHJlYW1MaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRzdHJlYW0ucGF1c2UoKTtcblxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh7IHN0cmVhbSwgYnVmZmVyLCBlbmRlZDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEVycm9yIExpc3RlbmVyXG5cdFx0Y29uc3QgZXJyb3JMaXN0ZW5lciA9IChlcnJvcjogRXJyb3IpID0+IHtcblx0XHRcdHN0cmVhbUxpc3RlbmVycy5kaXNwb3NlKCk7XG5cblx0XHRcdHJldHVybiByZWplY3QoZXJyb3IpO1xuXHRcdH07XG5cblx0XHQvLyBFbmQgTGlzdGVuZXJcblx0XHRjb25zdCBlbmRMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdHN0cmVhbUxpc3RlbmVycy5kaXNwb3NlKCk7XG5cblx0XHRcdHJldHVybiByZXNvbHZlKHsgc3RyZWFtLCBidWZmZXIsIGVuZGVkOiB0cnVlIH0pO1xuXHRcdH07XG5cblx0XHRzdHJlYW1MaXN0ZW5lcnMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgZXJyb3JMaXN0ZW5lcikpKTtcblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgZXJyb3JMaXN0ZW5lcik7XG5cblx0XHRzdHJlYW1MaXN0ZW5lcnMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIGVuZExpc3RlbmVyKSkpO1xuXHRcdHN0cmVhbS5vbignZW5kJywgZW5kTGlzdGVuZXIpO1xuXG5cdFx0Ly8gSW1wb3J0YW50OiBsZWF2ZSB0aGUgYGRhdGFgIGxpc3RlbmVyIGxhc3QgYmVjYXVzZVxuXHRcdC8vIHRoaXMgY2FuIHR1cm4gdGhlIHN0cmVhbSBpbnRvIGZsb3dpbmcgbW9kZSBhbmQgd2Vcblx0XHQvLyB3YW50IGBlcnJvcmAgZXZlbnRzIHRvIGJlIHJlY2VpdmVkIGFzIHdlbGwuXG5cdFx0c3RyZWFtTGlzdGVuZXJzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdkYXRhJywgZGF0YUxpc3RlbmVyKSkpO1xuXHRcdHN0cmVhbS5vbignZGF0YScsIGRhdGFMaXN0ZW5lcik7XG5cdH0pO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBjcmVhdGUgYSByZWFkYWJsZSBzdHJlYW0gZnJvbSBhbiBleGlzdGluZyBULlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9TdHJlYW08VD4odDogVCwgcmVkdWNlcjogSVJlZHVjZXI8VD4pOiBSZWFkYWJsZVN0cmVhbTxUPiB7XG5cdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxUPihyZWR1Y2VyKTtcblxuXHRzdHJlYW0uZW5kKHQpO1xuXG5cdHJldHVybiBzdHJlYW07XG59XG5cbi8qKlxuICogSGVscGVyIHRvIGNyZWF0ZSBhbiBlbXB0eSBzdHJlYW1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVtcHR5U3RyZWFtKCk6IFJlYWRhYmxlU3RyZWFtPG5ldmVyPiB7XG5cdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxuZXZlcj4oKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBzdXBwb3J0ZWQnKTsgfSk7XG5cdHN0cmVhbS5lbmQoKTtcblxuXHRyZXR1cm4gc3RyZWFtO1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBjb252ZXJ0IGEgVCBpbnRvIGEgUmVhZGFibGU8VD4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1JlYWRhYmxlPFQ+KHQ6IFQpOiBSZWFkYWJsZTxUPiB7XG5cdGxldCBjb25zdW1lZCA9IGZhbHNlO1xuXG5cdHJldHVybiB7XG5cdFx0cmVhZDogKCkgPT4ge1xuXHRcdFx0aWYgKGNvbnN1bWVkKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdW1lZCA9IHRydWU7XG5cblx0XHRcdHJldHVybiB0O1xuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBIZWxwZXIgdG8gdHJhbnNmb3JtIGEgcmVhZGFibGUgc3RyZWFtIGludG8gYW5vdGhlciBzdHJlYW0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zvcm08T3JpZ2luYWwsIFRyYW5zZm9ybWVkPihzdHJlYW06IFJlYWRhYmxlU3RyZWFtRXZlbnRzPE9yaWdpbmFsPiwgdHJhbnNmb3JtZXI6IElUcmFuc2Zvcm1lcjxPcmlnaW5hbCwgVHJhbnNmb3JtZWQ+LCByZWR1Y2VyOiBJUmVkdWNlcjxUcmFuc2Zvcm1lZD4pOiBSZWFkYWJsZVN0cmVhbTxUcmFuc2Zvcm1lZD4ge1xuXHRjb25zdCB0YXJnZXQgPSBuZXdXcml0ZWFibGVTdHJlYW08VHJhbnNmb3JtZWQ+KHJlZHVjZXIpO1xuXG5cdGxpc3RlblN0cmVhbShzdHJlYW0sIHtcblx0XHRvbkRhdGE6IGRhdGEgPT4gdGFyZ2V0LndyaXRlKHRyYW5zZm9ybWVyLmRhdGEoZGF0YSkpLFxuXHRcdG9uRXJyb3I6IGVycm9yID0+IHRhcmdldC5lcnJvcih0cmFuc2Zvcm1lci5lcnJvciA/IHRyYW5zZm9ybWVyLmVycm9yKGVycm9yKSA6IGVycm9yKSxcblx0XHRvbkVuZDogKCkgPT4gdGFyZ2V0LmVuZCgpXG5cdH0pO1xuXG5cdHJldHVybiB0YXJnZXQ7XG59XG5cbi8qKlxuICogSGVscGVyIHRvIHRha2UgYW4gZXhpc3RpbmcgcmVhZGFibGUgdGhhdCB3aWxsXG4gKiBoYXZlIGEgcHJlZml4IGluamVjdGVkIHRvIHRoZSBiZWdpbm5pbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVmaXhlZFJlYWRhYmxlPFQ+KHByZWZpeDogVCwgcmVhZGFibGU6IFJlYWRhYmxlPFQ+LCByZWR1Y2VyOiBJUmVkdWNlcjxUPik6IFJlYWRhYmxlPFQ+IHtcblx0bGV0IHByZWZpeEhhbmRsZWQgPSBmYWxzZTtcblxuXHRyZXR1cm4ge1xuXHRcdHJlYWQ6ICgpID0+IHtcblx0XHRcdGNvbnN0IGNodW5rID0gcmVhZGFibGUucmVhZCgpO1xuXG5cdFx0XHQvLyBIYW5kbGUgcHJlZml4IG9ubHkgb25jZVxuXHRcdFx0aWYgKCFwcmVmaXhIYW5kbGVkKSB7XG5cdFx0XHRcdHByZWZpeEhhbmRsZWQgPSB0cnVlO1xuXG5cdFx0XHRcdC8vIElmIHdlIGhhdmUgYWxzbyBhIHJlYWQtcmVzdWx0LCBtYWtlXG5cdFx0XHRcdC8vIHN1cmUgdG8gcmVkdWNlIGl0IHRvIGEgc2luZ2xlIHJlc3VsdFxuXHRcdFx0XHRpZiAoY2h1bmsgIT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVkdWNlcihbcHJlZml4LCBjaHVua10pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3RoZXJ3aXNlLCBqdXN0IHJldHVybiBwcmVmaXggZGlyZWN0bHlcblx0XHRcdFx0cmV0dXJuIHByZWZpeDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNodW5rO1xuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBIZWxwZXIgdG8gdGFrZSBhbiBleGlzdGluZyBzdHJlYW0gdGhhdCB3aWxsXG4gKiBoYXZlIGEgcHJlZml4IGluamVjdGVkIHRvIHRoZSBiZWdpbm5pbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVmaXhlZFN0cmVhbTxUPihwcmVmaXg6IFQsIHN0cmVhbTogUmVhZGFibGVTdHJlYW08VD4sIHJlZHVjZXI6IElSZWR1Y2VyPFQ+KTogUmVhZGFibGVTdHJlYW08VD4ge1xuXHRsZXQgcHJlZml4SGFuZGxlZCA9IGZhbHNlO1xuXG5cdGNvbnN0IHRhcmdldCA9IG5ld1dyaXRlYWJsZVN0cmVhbTxUPihyZWR1Y2VyKTtcblxuXHRsaXN0ZW5TdHJlYW0oc3RyZWFtLCB7XG5cdFx0b25EYXRhOiBkYXRhID0+IHtcblxuXHRcdFx0Ly8gSGFuZGxlIHByZWZpeCBvbmx5IG9uY2Vcblx0XHRcdGlmICghcHJlZml4SGFuZGxlZCkge1xuXHRcdFx0XHRwcmVmaXhIYW5kbGVkID0gdHJ1ZTtcblxuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0LndyaXRlKHJlZHVjZXIoW3ByZWZpeCwgZGF0YV0pKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRhcmdldC53cml0ZShkYXRhKTtcblx0XHR9LFxuXHRcdG9uRXJyb3I6IGVycm9yID0+IHRhcmdldC5lcnJvcihlcnJvciksXG5cdFx0b25FbmQ6ICgpID0+IHtcblxuXHRcdFx0Ly8gSGFuZGxlIHByZWZpeCBvbmx5IG9uY2Vcblx0XHRcdGlmICghcHJlZml4SGFuZGxlZCkge1xuXHRcdFx0XHRwcmVmaXhIYW5kbGVkID0gdHJ1ZTtcblxuXHRcdFx0XHR0YXJnZXQud3JpdGUocHJlZml4KTtcblx0XHRcdH1cblxuXHRcdFx0dGFyZ2V0LmVuZCgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIHRhcmdldDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQTJFdkMsU0FBUyxXQUFjLEtBQWtDO0FBQy9ELFFBQU0sWUFBWTtBQUNsQixNQUFJLENBQUMsV0FBVztBQUNmLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxPQUFPLFVBQVUsU0FBUztBQUNsQztBQWdFTyxTQUFTLGlCQUFvQixLQUF3QztBQUMzRSxRQUFNLFlBQVk7QUFDbEIsTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sQ0FBQyxVQUFVLElBQUksVUFBVSxPQUFPLFVBQVUsUUFBUSxVQUFVLE9BQU8sRUFBRSxNQUFNLFFBQU0sT0FBTyxPQUFPLFVBQVU7QUFDakg7QUFFTyxTQUFTLHlCQUE0QixLQUFnRDtBQUMzRixRQUFNLFlBQVk7QUFDbEIsTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8saUJBQWlCLFVBQVUsTUFBTSxLQUFLLE1BQU0sUUFBUSxVQUFVLE1BQU0sS0FBSyxPQUFPLFVBQVUsVUFBVTtBQUM1RztBQW1CTyxTQUFTLG1CQUFzQixTQUE2QixTQUFzRDtBQUN4SCxTQUFPLElBQUksb0JBQXVCLFNBQVMsT0FBTztBQUNuRDtBQVlBLE1BQU0sb0JBQXFEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEyQjFELFlBQW9CLFNBQXFDLFNBQWtDO0FBQXZFO0FBQXFDO0FBekJ6RCxTQUFpQixRQUFRO0FBQUEsTUFDeEIsU0FBUztBQUFBLE1BQ1QsT0FBTztBQUFBLE1BQ1AsV0FBVztBQUFBLElBQ1o7QUFFQSxTQUFpQixTQUFTO0FBQUEsTUFDekIsTUFBTSxDQUFDO0FBQUEsTUFDUCxPQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsU0FB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
