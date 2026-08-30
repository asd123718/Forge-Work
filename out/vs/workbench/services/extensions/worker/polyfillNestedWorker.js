const _bootstrapFnSource = (function _bootstrapFn(workerUrl) {
  const listener = (event) => {
    globalThis.removeEventListener("message", listener);
    const port = event.data;
    Object.defineProperties(globalThis, {
      "postMessage": {
        value(data, transferOrOptions) {
          port.postMessage(data, transferOrOptions);
        }
      },
      "onmessage": {
        get() {
          return port.onmessage;
        },
        set(value) {
          port.onmessage = value;
        }
      }
      // todo onerror
    });
    port.addEventListener("message", (msg) => {
      globalThis.dispatchEvent(new MessageEvent("message", { data: msg.data, ports: msg.ports ? [...msg.ports] : void 0 }));
    });
    port.start();
    globalThis.Worker = class {
      constructor() {
        throw new TypeError("Nested workers from within nested worker are NOT supported.");
      }
    };
    importScripts(workerUrl);
  };
  globalThis.addEventListener("message", listener);
}).toString();
class NestedWorker extends EventTarget {
  constructor(nativePostMessage, stringOrUrl, options) {
    super();
    this.onmessage = null;
    this.onmessageerror = null;
    this.onerror = null;
    const bootstrap = `((${_bootstrapFnSource})('${stringOrUrl}'))`;
    const blob = new Blob([bootstrap], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const channel = new MessageChannel();
    const id = blobUrl;
    const msg = {
      type: "_newWorker",
      id,
      port: channel.port2,
      url: blobUrl,
      options
    };
    nativePostMessage(msg, [channel.port2]);
    this.postMessage = channel.port1.postMessage.bind(channel.port1);
    this.terminate = () => {
      const msg2 = {
        type: "_terminateWorker",
        id
      };
      nativePostMessage(msg2);
      URL.revokeObjectURL(blobUrl);
      channel.port1.close();
      channel.port2.close();
    };
    Object.defineProperties(this, {
      "onmessage": {
        get() {
          return channel.port1.onmessage;
        },
        set(value) {
          channel.port1.onmessage = value;
        }
      },
      "onmessageerror": {
        get() {
          return channel.port1.onmessageerror;
        },
        set(value) {
          channel.port1.onmessageerror = value;
        }
      }
      // todo onerror
    });
    channel.port1.addEventListener("messageerror", (evt) => {
      const msgEvent = new MessageEvent("messageerror", { data: evt.data });
      this.dispatchEvent(msgEvent);
    });
    channel.port1.addEventListener("message", (evt) => {
      const msgEvent = new MessageEvent("message", { data: evt.data });
      this.dispatchEvent(msgEvent);
    });
    channel.port1.start();
  }
}
export {
  NestedWorker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFx3b3JrZXJcXHBvbHlmaWxsTmVzdGVkV29ya2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTmV3V29ya2VyTWVzc2FnZSwgVGVybWluYXRlV29ya2VyTWVzc2FnZSB9IGZyb20gJy4uL2NvbW1vbi9wb2x5ZmlsbE5lc3RlZFdvcmtlci5wcm90b2NvbC5qcyc7XG5cbmRlY2xhcmUgZnVuY3Rpb24gcG9zdE1lc3NhZ2UoZGF0YTogYW55LCB0cmFuc2ZlcmFibGVzPzogVHJhbnNmZXJhYmxlW10pOiB2b2lkO1xuXG5kZWNsYXJlIHR5cGUgTWVzc2FnZUV2ZW50SGFuZGxlciA9ICgoZXY6IE1lc3NhZ2VFdmVudDxhbnk+KSA9PiBhbnkpIHwgbnVsbDtcblxuY29uc3QgX2Jvb3RzdHJhcEZuU291cmNlID0gKGZ1bmN0aW9uIF9ib290c3RyYXBGbih3b3JrZXJVcmw6IHN0cmluZykge1xuXG5cdGNvbnN0IGxpc3RlbmVyOiBFdmVudExpc3RlbmVyID0gKGV2ZW50OiBFdmVudCk6IHZvaWQgPT4ge1xuXHRcdC8vIHVuaW5zdGFsbCBoYW5kbGVyXG5cdFx0Z2xvYmFsVGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgbGlzdGVuZXIpO1xuXG5cdFx0Ly8gZ2V0IGRhdGFcblx0XHRjb25zdCBwb3J0ID0gPE1lc3NhZ2VQb3J0Pig8TWVzc2FnZUV2ZW50PmV2ZW50KS5kYXRhO1xuXG5cdFx0Ly8gcG9zdE1lc3NhZ2Vcblx0XHQvLyBvbm1lc3NhZ2Vcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydGllcyhnbG9iYWxUaGlzLCB7XG5cdFx0XHQncG9zdE1lc3NhZ2UnOiB7XG5cdFx0XHRcdHZhbHVlKGRhdGE6IGFueSwgdHJhbnNmZXJPck9wdGlvbnM/OiBhbnkpIHtcblx0XHRcdFx0XHRwb3J0LnBvc3RNZXNzYWdlKGRhdGEsIHRyYW5zZmVyT3JPcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdvbm1lc3NhZ2UnOiB7XG5cdFx0XHRcdGdldCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gcG9ydC5vbm1lc3NhZ2U7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldCh2YWx1ZTogTWVzc2FnZUV2ZW50SGFuZGxlcikge1xuXHRcdFx0XHRcdHBvcnQub25tZXNzYWdlID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIHRvZG8gb25lcnJvclxuXHRcdH0pO1xuXG5cdFx0cG9ydC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgbXNnID0+IHtcblx0XHRcdGdsb2JhbFRoaXMuZGlzcGF0Y2hFdmVudChuZXcgTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywgeyBkYXRhOiBtc2cuZGF0YSwgcG9ydHM6IG1zZy5wb3J0cyA/IFsuLi5tc2cucG9ydHNdIDogdW5kZWZpbmVkIH0pKTtcblx0XHR9KTtcblxuXHRcdHBvcnQuc3RhcnQoKTtcblxuXHRcdC8vIGZha2UgcmVjdXJzaXZlbHkgbmVzdGVkIHdvcmtlclxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGdsb2JhbFRoaXMuV29ya2VyID0gPGFueT5jbGFzcyB7IGNvbnN0cnVjdG9yKCkgeyB0aHJvdyBuZXcgVHlwZUVycm9yKCdOZXN0ZWQgd29ya2VycyBmcm9tIHdpdGhpbiBuZXN0ZWQgd29ya2VyIGFyZSBOT1Qgc3VwcG9ydGVkLicpOyB9IH07XG5cblx0XHQvLyBsb2FkIG1vZHVsZVxuXHRcdGltcG9ydFNjcmlwdHMod29ya2VyVXJsKTtcblx0fTtcblxuXHRnbG9iYWxUaGlzLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBsaXN0ZW5lcik7XG59KS50b1N0cmluZygpO1xuXG5cbmV4cG9ydCBjbGFzcyBOZXN0ZWRXb3JrZXIgZXh0ZW5kcyBFdmVudFRhcmdldCBpbXBsZW1lbnRzIFdvcmtlciB7XG5cblx0b25tZXNzYWdlOiAoKHRoaXM6IFdvcmtlciwgZXY6IE1lc3NhZ2VFdmVudDxhbnk+KSA9PiBhbnkpIHwgbnVsbCA9IG51bGw7XG5cdG9ubWVzc2FnZWVycm9yOiAoKHRoaXM6IFdvcmtlciwgZXY6IE1lc3NhZ2VFdmVudDxhbnk+KSA9PiBhbnkpIHwgbnVsbCA9IG51bGw7XG5cdG9uZXJyb3I6ICgodGhpczogQWJzdHJhY3RXb3JrZXIsIGV2OiBFcnJvckV2ZW50KSA9PiBhbnkpIHwgbnVsbCA9IG51bGw7XG5cblx0cmVhZG9ubHkgdGVybWluYXRlOiAoKSA9PiB2b2lkO1xuXHRyZWFkb25seSBwb3N0TWVzc2FnZTogKG1lc3NhZ2U6IGFueSwgb3B0aW9ucz86IGFueSkgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3RvcihuYXRpdmVQb3N0TWVzc2FnZTogdHlwZW9mIHBvc3RNZXNzYWdlLCBzdHJpbmdPclVybDogc3RyaW5nIHwgVVJMLCBvcHRpb25zPzogV29ya2VyT3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBjcmVhdGUgYm9vdHN0cmFwIHNjcmlwdFxuXHRcdGNvbnN0IGJvb3RzdHJhcCA9IGAoKCR7X2Jvb3RzdHJhcEZuU291cmNlfSkoJyR7c3RyaW5nT3JVcmx9JykpYDtcblx0XHRjb25zdCBibG9iID0gbmV3IEJsb2IoW2Jvb3RzdHJhcF0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnIH0pO1xuXHRcdGNvbnN0IGJsb2JVcmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuXG5cdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuXHRcdGNvbnN0IGlkID0gYmxvYlVybDsgLy8gd29ya3MgYmVjYXVzZSBibG9iIHVybCBpcyB1bmlxdWUsIG5lZWRzIElEIHBvb2wgb3RoZXJ3aXNlXG5cblx0XHRjb25zdCBtc2c6IE5ld1dvcmtlck1lc3NhZ2UgPSB7XG5cdFx0XHR0eXBlOiAnX25ld1dvcmtlcicsXG5cdFx0XHRpZCxcblx0XHRcdHBvcnQ6IGNoYW5uZWwucG9ydDIsXG5cdFx0XHR1cmw6IGJsb2JVcmwsXG5cdFx0XHRvcHRpb25zLFxuXHRcdH07XG5cdFx0bmF0aXZlUG9zdE1lc3NhZ2UobXNnLCBbY2hhbm5lbC5wb3J0Ml0pO1xuXG5cdFx0Ly8gd29ya2VyLWltcGw6IGZ1bmN0aW9uc1xuXHRcdHRoaXMucG9zdE1lc3NhZ2UgPSBjaGFubmVsLnBvcnQxLnBvc3RNZXNzYWdlLmJpbmQoY2hhbm5lbC5wb3J0MSk7XG5cdFx0dGhpcy50ZXJtaW5hdGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBtc2c6IFRlcm1pbmF0ZVdvcmtlck1lc3NhZ2UgPSB7XG5cdFx0XHRcdHR5cGU6ICdfdGVybWluYXRlV29ya2VyJyxcblx0XHRcdFx0aWRcblx0XHRcdH07XG5cdFx0XHRuYXRpdmVQb3N0TWVzc2FnZShtc2cpO1xuXHRcdFx0VVJMLnJldm9rZU9iamVjdFVSTChibG9iVXJsKTtcblxuXHRcdFx0Y2hhbm5lbC5wb3J0MS5jbG9zZSgpO1xuXHRcdFx0Y2hhbm5lbC5wb3J0Mi5jbG9zZSgpO1xuXHRcdH07XG5cblx0XHQvLyB3b3JrZXItaW1wbDogZXZlbnRzXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnRpZXModGhpcywge1xuXHRcdFx0J29ubWVzc2FnZSc6IHtcblx0XHRcdFx0Z2V0KCkge1xuXHRcdFx0XHRcdHJldHVybiBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0KHZhbHVlOiBNZXNzYWdlRXZlbnRIYW5kbGVyKSB7XG5cdFx0XHRcdFx0Y2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdvbm1lc3NhZ2VlcnJvcic6IHtcblx0XHRcdFx0Z2V0KCkge1xuXHRcdFx0XHRcdHJldHVybiBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZWVycm9yO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXQodmFsdWU6IE1lc3NhZ2VFdmVudEhhbmRsZXIpIHtcblx0XHRcdFx0XHRjaGFubmVsLnBvcnQxLm9ubWVzc2FnZWVycm9yID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQvLyB0b2RvIG9uZXJyb3Jcblx0XHR9KTtcblxuXHRcdGNoYW5uZWwucG9ydDEuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZWVycm9yJywgZXZ0ID0+IHtcblx0XHRcdGNvbnN0IG1zZ0V2ZW50ID0gbmV3IE1lc3NhZ2VFdmVudCgnbWVzc2FnZWVycm9yJywgeyBkYXRhOiBldnQuZGF0YSB9KTtcblx0XHRcdHRoaXMuZGlzcGF0Y2hFdmVudChtc2dFdmVudCk7XG5cdFx0fSk7XG5cblx0XHRjaGFubmVsLnBvcnQxLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBldnQgPT4ge1xuXHRcdFx0Y29uc3QgbXNnRXZlbnQgPSBuZXcgTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywgeyBkYXRhOiBldnQuZGF0YSB9KTtcblx0XHRcdHRoaXMuZGlzcGF0Y2hFdmVudChtc2dFdmVudCk7XG5cdFx0fSk7XG5cblx0XHRjaGFubmVsLnBvcnQxLnN0YXJ0KCk7XG5cdH1cbn1c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
