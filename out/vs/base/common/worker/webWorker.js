import { CharCode } from "../charCode.js";
import { onUnexpectedError, transformErrorForSerialization } from "../errors.js";
import { Emitter } from "../event.js";
import { Disposable } from "../lifecycle.js";
import { isWeb } from "../platform.js";
import * as strings from "../strings.js";
const DEFAULT_CHANNEL = "default";
const INITIALIZE = "$initialize";
let webWorkerWarningLogged = false;
function logOnceWebWorkerWarning(err) {
  if (!isWeb) {
    return;
  }
  if (!webWorkerWarningLogged) {
    webWorkerWarningLogged = true;
    console.warn("Could not create web worker(s). Falling back to loading web worker code in main thread, which might cause UI freezes. Please see https://github.com/microsoft/monaco-editor#faq");
  }
  console.warn(err.message);
}
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["Request"] = 0] = "Request";
  MessageType2[MessageType2["Reply"] = 1] = "Reply";
  MessageType2[MessageType2["SubscribeEvent"] = 2] = "SubscribeEvent";
  MessageType2[MessageType2["Event"] = 3] = "Event";
  MessageType2[MessageType2["UnsubscribeEvent"] = 4] = "UnsubscribeEvent";
  return MessageType2;
})(MessageType || {});
class RequestMessage {
  constructor(vsWorker, req, channel, method, args) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.channel = channel;
    this.method = method;
    this.args = args;
    this.type = 0 /* Request */;
  }
}
class ReplyMessage {
  constructor(vsWorker, seq, res, err) {
    this.vsWorker = vsWorker;
    this.seq = seq;
    this.res = res;
    this.err = err;
    this.type = 1 /* Reply */;
  }
}
class SubscribeEventMessage {
  constructor(vsWorker, req, channel, eventName, arg) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.channel = channel;
    this.eventName = eventName;
    this.arg = arg;
    this.type = 2 /* SubscribeEvent */;
  }
}
class EventMessage {
  constructor(vsWorker, req, event) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.event = event;
    this.type = 3 /* Event */;
  }
}
class UnsubscribeEventMessage {
  constructor(vsWorker, req) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.type = 4 /* UnsubscribeEvent */;
  }
}
class WebWorkerProtocol {
  constructor(handler) {
    this._workerId = -1;
    this._handler = handler;
    this._lastSentReq = 0;
    this._pendingReplies = /* @__PURE__ */ Object.create(null);
    this._pendingEmitters = /* @__PURE__ */ new Map();
    this._pendingEvents = /* @__PURE__ */ new Map();
  }
  setWorkerId(workerId) {
    this._workerId = workerId;
  }
  async sendMessage(channel, method, args) {
    const req = String(++this._lastSentReq);
    return new Promise((resolve, reject) => {
      this._pendingReplies[req] = {
        resolve,
        reject
      };
      this._send(new RequestMessage(this._workerId, req, channel, method, args));
    });
  }
  listen(channel, eventName, arg) {
    let req = null;
    const emitter = new Emitter({
      onWillAddFirstListener: () => {
        req = String(++this._lastSentReq);
        this._pendingEmitters.set(req, emitter);
        this._send(new SubscribeEventMessage(this._workerId, req, channel, eventName, arg));
      },
      onDidRemoveLastListener: () => {
        this._pendingEmitters.delete(req);
        this._send(new UnsubscribeEventMessage(this._workerId, req));
        req = null;
      }
    });
    return emitter.event;
  }
  handleMessage(message) {
    if (!message || !message.vsWorker) {
      return;
    }
    if (this._workerId !== -1 && message.vsWorker !== this._workerId) {
      return;
    }
    this._handleMessage(message);
  }
  createProxyToRemoteChannel(channel, sendMessageBarrier) {
    const handler = {
      get: (target, name) => {
        if (typeof name === "string" && !target[name]) {
          if (propertyIsDynamicEvent(name)) {
            target[name] = (arg) => {
              return this.listen(channel, name, arg);
            };
          } else if (propertyIsEvent(name)) {
            target[name] = this.listen(channel, name, void 0);
          } else if (name.charCodeAt(0) === CharCode.DollarSign) {
            target[name] = async (...myArgs) => {
              await sendMessageBarrier?.();
              return this.sendMessage(channel, name, myArgs);
            };
          }
        }
        return target[name];
      }
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), handler);
  }
  _handleMessage(msg) {
    switch (msg.type) {
      case 1 /* Reply */:
        return this._handleReplyMessage(msg);
      case 0 /* Request */:
        return this._handleRequestMessage(msg);
      case 2 /* SubscribeEvent */:
        return this._handleSubscribeEventMessage(msg);
      case 3 /* Event */:
        return this._handleEventMessage(msg);
      case 4 /* UnsubscribeEvent */:
        return this._handleUnsubscribeEventMessage(msg);
    }
  }
  _handleReplyMessage(replyMessage) {
    if (!this._pendingReplies[replyMessage.seq]) {
      console.warn("Got reply to unknown seq");
      return;
    }
    const reply = this._pendingReplies[replyMessage.seq];
    delete this._pendingReplies[replyMessage.seq];
    if (replyMessage.err) {
      let err = replyMessage.err;
      if (replyMessage.err.$isError) {
        const newErr = new Error();
        newErr.name = replyMessage.err.name;
        newErr.message = replyMessage.err.message;
        newErr.stack = replyMessage.err.stack;
        err = newErr;
      }
      reply.reject(err);
      return;
    }
    reply.resolve(replyMessage.res);
  }
  _handleRequestMessage(requestMessage) {
    const req = requestMessage.req;
    const result = this._handler.handleMessage(requestMessage.channel, requestMessage.method, requestMessage.args);
    result.then((r) => {
      this._send(new ReplyMessage(this._workerId, req, r, void 0));
    }, (e) => {
      if (e.detail instanceof Error) {
        e.detail = transformErrorForSerialization(e.detail);
      }
      this._send(new ReplyMessage(this._workerId, req, void 0, transformErrorForSerialization(e)));
    });
  }
  _handleSubscribeEventMessage(msg) {
    const req = msg.req;
    const disposable = this._handler.handleEvent(msg.channel, msg.eventName, msg.arg)((event) => {
      this._send(new EventMessage(this._workerId, req, event));
    });
    this._pendingEvents.set(req, disposable);
  }
  _handleEventMessage(msg) {
    const emitter = this._pendingEmitters.get(msg.req);
    if (emitter === void 0) {
      console.warn("Got event for unknown req");
      return;
    }
    emitter.fire(msg.event);
  }
  _handleUnsubscribeEventMessage(msg) {
    const event = this._pendingEvents.get(msg.req);
    if (event === void 0) {
      console.warn("Got unsubscribe for unknown req");
      return;
    }
    event.dispose();
    this._pendingEvents.delete(msg.req);
  }
  _send(msg) {
    const transfer = [];
    if (msg.type === 0 /* Request */) {
      for (let i = 0; i < msg.args.length; i++) {
        const arg = msg.args[i];
        if (arg instanceof ArrayBuffer) {
          transfer.push(arg);
        }
      }
    } else if (msg.type === 1 /* Reply */) {
      if (msg.res instanceof ArrayBuffer) {
        transfer.push(msg.res);
      }
    }
    this._handler.sendMessage(msg, transfer);
  }
}
class WebWorkerClient extends Disposable {
  constructor(worker) {
    super();
    this._localChannels = /* @__PURE__ */ new Map();
    this._remoteChannels = /* @__PURE__ */ new Map();
    this._worker = this._register(worker);
    this._register(this._worker.onMessage((msg) => {
      this._protocol.handleMessage(msg);
    }));
    this._register(this._worker.onError((err) => {
      logOnceWebWorkerWarning(err);
      onUnexpectedError(err);
    }));
    this._protocol = new WebWorkerProtocol({
      sendMessage: (msg, transfer) => {
        this._worker.postMessage(msg, transfer);
      },
      handleMessage: (channel, method, args) => {
        return this._handleMessage(channel, method, args);
      },
      handleEvent: (channel, eventName, arg) => {
        return this._handleEvent(channel, eventName, arg);
      }
    });
    this._protocol.setWorkerId(this._worker.getId());
    this._onModuleLoaded = this._protocol.sendMessage(DEFAULT_CHANNEL, INITIALIZE, [
      this._worker.getId()
    ]).then(() => {
    });
    this.proxy = this._protocol.createProxyToRemoteChannel(DEFAULT_CHANNEL, async () => {
      await this._onModuleLoaded;
    });
    this._onModuleLoaded.catch((e) => {
      this._onError("Worker failed to load ", e);
    });
  }
  _handleMessage(channelName, method, args) {
    const channel = this._localChannels.get(channelName);
    if (!channel) {
      return Promise.reject(new Error(`Missing channel ${channelName} on main thread`));
    }
    const fn = channel[method];
    if (typeof fn !== "function") {
      return Promise.reject(new Error(`Missing method ${method} on main thread channel ${channelName}`));
    }
    try {
      return Promise.resolve(fn.apply(channel, args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  _handleEvent(channelName, eventName, arg) {
    const channel = this._localChannels.get(channelName);
    if (!channel) {
      throw new Error(`Missing channel ${channelName} on main thread`);
    }
    if (propertyIsDynamicEvent(eventName)) {
      const fn = channel[eventName];
      if (typeof fn !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
      }
      const event = fn.call(channel, arg);
      if (typeof event !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
      }
      return event;
    }
    if (propertyIsEvent(eventName)) {
      const event = channel[eventName];
      if (typeof event !== "function") {
        throw new Error(`Missing event ${eventName} on main thread channel ${channelName}.`);
      }
      return event;
    }
    throw new Error(`Malformed event name ${eventName}`);
  }
  setChannel(channel, handler) {
    this._localChannels.set(channel, handler);
  }
  getChannel(channel) {
    let inst = this._remoteChannels.get(channel);
    if (inst === void 0) {
      inst = this._protocol.createProxyToRemoteChannel(channel, async () => {
        await this._onModuleLoaded;
      });
      this._remoteChannels.set(channel, inst);
    }
    return inst;
  }
  _onError(message, error) {
    console.error(message);
    console.info(error);
  }
}
function propertyIsEvent(name) {
  return name[0] === "o" && name[1] === "n" && strings.isUpperAsciiLetter(name.charCodeAt(2));
}
function propertyIsDynamicEvent(name) {
  return /^onDynamic/.test(name) && strings.isUpperAsciiLetter(name.charCodeAt(9));
}
class WebWorkerServer {
  constructor(postMessage, requestHandlerFactory) {
    this._localChannels = /* @__PURE__ */ new Map();
    this._remoteChannels = /* @__PURE__ */ new Map();
    this._protocol = new WebWorkerProtocol({
      sendMessage: (msg, transfer) => {
        postMessage(msg, transfer);
      },
      handleMessage: (channel, method, args) => this._handleMessage(channel, method, args),
      handleEvent: (channel, eventName, arg) => this._handleEvent(channel, eventName, arg)
    });
    this.requestHandler = requestHandlerFactory(this);
  }
  onmessage(msg) {
    this._protocol.handleMessage(msg);
  }
  _handleMessage(channel, method, args) {
    if (channel === DEFAULT_CHANNEL && method === INITIALIZE) {
      return this.initialize(args[0]);
    }
    const requestHandler = channel === DEFAULT_CHANNEL ? this.requestHandler : this._localChannels.get(channel);
    if (!requestHandler) {
      return Promise.reject(new Error(`Missing channel ${channel} on worker thread`));
    }
    const fn = requestHandler[method];
    if (typeof fn !== "function") {
      return Promise.reject(new Error(`Missing method ${method} on worker thread channel ${channel}`));
    }
    try {
      return Promise.resolve(fn.apply(requestHandler, args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  _handleEvent(channel, eventName, arg) {
    const requestHandler = channel === DEFAULT_CHANNEL ? this.requestHandler : this._localChannels.get(channel);
    if (!requestHandler) {
      throw new Error(`Missing channel ${channel} on worker thread`);
    }
    if (propertyIsDynamicEvent(eventName)) {
      const fn = requestHandler[eventName];
      if (typeof fn !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on request handler.`);
      }
      const event = fn.call(requestHandler, arg);
      if (typeof event !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on request handler.`);
      }
      return event;
    }
    if (propertyIsEvent(eventName)) {
      const event = requestHandler[eventName];
      if (typeof event !== "function") {
        throw new Error(`Missing event ${eventName} on request handler.`);
      }
      return event;
    }
    throw new Error(`Malformed event name ${eventName}`);
  }
  setChannel(channel, handler) {
    this._localChannels.set(channel, handler);
  }
  getChannel(channel) {
    let inst = this._remoteChannels.get(channel);
    if (inst === void 0) {
      inst = this._protocol.createProxyToRemoteChannel(channel);
      this._remoteChannels.set(channel, inst);
    }
    return inst;
  }
  async initialize(workerId) {
    this._protocol.setWorkerId(workerId);
  }
}
export {
  WebWorkerClient,
  WebWorkerServer,
  logOnceWebWorkerWarning
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHdvcmtlclxcd2ViV29ya2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciwgU2VyaWFsaXplZEVycm9yLCB0cmFuc2Zvcm1FcnJvckZvclNlcmlhbGl6YXRpb24gfSBmcm9tICcuLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vc3RyaW5ncy5qcyc7XG5cbmNvbnN0IERFRkFVTFRfQ0hBTk5FTCA9ICdkZWZhdWx0JztcbmNvbnN0IElOSVRJQUxJWkUgPSAnJGluaXRpYWxpemUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXZWJXb3JrZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGdldElkKCk6IG51bWJlcjtcblx0cmVhZG9ubHkgb25NZXNzYWdlOiBFdmVudDxNZXNzYWdlPjtcblx0cmVhZG9ubHkgb25FcnJvcjogRXZlbnQ8dW5rbm93bj47XG5cdHBvc3RNZXNzYWdlKG1lc3NhZ2U6IE1lc3NhZ2UsIHRyYW5zZmVyOiBBcnJheUJ1ZmZlcltdKTogdm9pZDtcbn1cblxubGV0IHdlYldvcmtlcldhcm5pbmdMb2dnZWQgPSBmYWxzZTtcbmV4cG9ydCBmdW5jdGlvbiBsb2dPbmNlV2ViV29ya2VyV2FybmluZyhlcnI6IHVua25vd24pOiB2b2lkIHtcblx0aWYgKCFpc1dlYikge1xuXHRcdC8vIHJ1bm5pbmcgdGVzdHNcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKCF3ZWJXb3JrZXJXYXJuaW5nTG9nZ2VkKSB7XG5cdFx0d2ViV29ya2VyV2FybmluZ0xvZ2dlZCA9IHRydWU7XG5cdFx0Y29uc29sZS53YXJuKCdDb3VsZCBub3QgY3JlYXRlIHdlYiB3b3JrZXIocykuIEZhbGxpbmcgYmFjayB0byBsb2FkaW5nIHdlYiB3b3JrZXIgY29kZSBpbiBtYWluIHRocmVhZCwgd2hpY2ggbWlnaHQgY2F1c2UgVUkgZnJlZXplcy4gUGxlYXNlIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjZmFxJyk7XG5cdH1cblx0Y29uc29sZS53YXJuKChlcnIgYXMgRXJyb3IpLm1lc3NhZ2UpO1xufVxuXG5jb25zdCBlbnVtIE1lc3NhZ2VUeXBlIHtcblx0UmVxdWVzdCxcblx0UmVwbHksXG5cdFN1YnNjcmliZUV2ZW50LFxuXHRFdmVudCxcblx0VW5zdWJzY3JpYmVFdmVudFxufVxuY2xhc3MgUmVxdWVzdE1lc3NhZ2Uge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IE1lc3NhZ2VUeXBlLlJlcXVlc3Q7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2c1dvcmtlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXE6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBtZXRob2Q6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXJnczogdW5rbm93bltdXG5cdCkgeyB9XG59XG5jbGFzcyBSZXBseU1lc3NhZ2Uge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IE1lc3NhZ2VUeXBlLlJlcGx5O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdnNXb3JrZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2VxOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlczogdW5rbm93bixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXJyOiB1bmtub3duIHwgU2VyaWFsaXplZEVycm9yXG5cdCkgeyB9XG59XG5jbGFzcyBTdWJzY3JpYmVFdmVudE1lc3NhZ2Uge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IE1lc3NhZ2VUeXBlLlN1YnNjcmliZUV2ZW50O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdnNXb3JrZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVxOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNoYW5uZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXZlbnROYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFyZzogdW5rbm93blxuXHQpIHsgfVxufVxuY2xhc3MgRXZlbnRNZXNzYWdlIHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBNZXNzYWdlVHlwZS5FdmVudDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHZzV29ya2VyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBldmVudDogdW5rbm93blxuXHQpIHsgfVxufVxuY2xhc3MgVW5zdWJzY3JpYmVFdmVudE1lc3NhZ2Uge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IE1lc3NhZ2VUeXBlLlVuc3Vic2NyaWJlRXZlbnQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2c1dvcmtlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXE6IHN0cmluZ1xuXHQpIHsgfVxufVxuZXhwb3J0IHR5cGUgTWVzc2FnZSA9IFJlcXVlc3RNZXNzYWdlIHwgUmVwbHlNZXNzYWdlIHwgU3Vic2NyaWJlRXZlbnRNZXNzYWdlIHwgRXZlbnRNZXNzYWdlIHwgVW5zdWJzY3JpYmVFdmVudE1lc3NhZ2U7XG5cbmludGVyZmFjZSBJTWVzc2FnZVJlcGx5IHtcblx0cmVzb2x2ZTogKHZhbHVlPzogdW5rbm93bikgPT4gdm9pZDtcblx0cmVqZWN0OiAoZXJyb3I/OiB1bmtub3duKSA9PiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSU1lc3NhZ2VIYW5kbGVyIHtcblx0c2VuZE1lc3NhZ2UobXNnOiB1bmtub3duLCB0cmFuc2Zlcj86IEFycmF5QnVmZmVyW10pOiB2b2lkO1xuXHRoYW5kbGVNZXNzYWdlKGNoYW5uZWw6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj47XG5cdGhhbmRsZUV2ZW50KGNoYW5uZWw6IHN0cmluZywgZXZlbnROYW1lOiBzdHJpbmcsIGFyZzogdW5rbm93bik6IEV2ZW50PHVua25vd24+O1xufVxuXG5jbGFzcyBXZWJXb3JrZXJQcm90b2NvbCB7XG5cblx0cHJpdmF0ZSBfd29ya2VySWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfbGFzdFNlbnRSZXE6IG51bWJlcjtcblx0cHJpdmF0ZSBfcGVuZGluZ1JlcGxpZXM6IHsgW3JlcTogc3RyaW5nXTogSU1lc3NhZ2VSZXBseSB9O1xuXHRwcml2YXRlIF9wZW5kaW5nRW1pdHRlcnM6IE1hcDxzdHJpbmcsIEVtaXR0ZXI8dW5rbm93bj4+O1xuXHRwcml2YXRlIF9wZW5kaW5nRXZlbnRzOiBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT47XG5cdHByaXZhdGUgX2hhbmRsZXI6IElNZXNzYWdlSGFuZGxlcjtcblxuXHRjb25zdHJ1Y3RvcihoYW5kbGVyOiBJTWVzc2FnZUhhbmRsZXIpIHtcblx0XHR0aGlzLl93b3JrZXJJZCA9IC0xO1xuXHRcdHRoaXMuX2hhbmRsZXIgPSBoYW5kbGVyO1xuXHRcdHRoaXMuX2xhc3RTZW50UmVxID0gMDtcblx0XHR0aGlzLl9wZW5kaW5nUmVwbGllcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fcGVuZGluZ0VtaXR0ZXJzID0gbmV3IE1hcDxzdHJpbmcsIEVtaXR0ZXI8dW5rbm93bj4+KCk7XG5cdFx0dGhpcy5fcGVuZGluZ0V2ZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRXb3JrZXJJZCh3b3JrZXJJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2VySWQgPSB3b3JrZXJJZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZW5kTWVzc2FnZShjaGFubmVsOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCByZXEgPSBTdHJpbmcoKyt0aGlzLl9sYXN0U2VudFJlcSk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHVua25vd24+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXBsaWVzW3JlcV0gPSB7XG5cdFx0XHRcdHJlc29sdmU6IHJlc29sdmUsXG5cdFx0XHRcdHJlamVjdDogcmVqZWN0XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc2VuZChuZXcgUmVxdWVzdE1lc3NhZ2UodGhpcy5fd29ya2VySWQsIHJlcSwgY2hhbm5lbCwgbWV0aG9kLCBhcmdzKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgbGlzdGVuKGNoYW5uZWw6IHN0cmluZywgZXZlbnROYW1lOiBzdHJpbmcsIGFyZzogdW5rbm93bik6IEV2ZW50PHVua25vd24+IHtcblx0XHRsZXQgcmVxOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dW5rbm93bj4oe1xuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRyZXEgPSBTdHJpbmcoKyt0aGlzLl9sYXN0U2VudFJlcSk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdFbWl0dGVycy5zZXQocmVxLCBlbWl0dGVyKTtcblx0XHRcdFx0dGhpcy5fc2VuZChuZXcgU3Vic2NyaWJlRXZlbnRNZXNzYWdlKHRoaXMuX3dvcmtlcklkLCByZXEsIGNoYW5uZWwsIGV2ZW50TmFtZSwgYXJnKSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0VtaXR0ZXJzLmRlbGV0ZShyZXEhKTtcblx0XHRcdFx0dGhpcy5fc2VuZChuZXcgVW5zdWJzY3JpYmVFdmVudE1lc3NhZ2UodGhpcy5fd29ya2VySWQsIHJlcSEpKTtcblx0XHRcdFx0cmVxID0gbnVsbDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVNZXNzYWdlKG1lc3NhZ2U6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoIW1lc3NhZ2UgfHwgIShtZXNzYWdlIGFzIE1lc3NhZ2UpLnZzV29ya2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl93b3JrZXJJZCAhPT0gLTEgJiYgKG1lc3NhZ2UgYXMgTWVzc2FnZSkudnNXb3JrZXIgIT09IHRoaXMuX3dvcmtlcklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hhbmRsZU1lc3NhZ2UobWVzc2FnZSBhcyBNZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVQcm94eVRvUmVtb3RlQ2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcsIHNlbmRNZXNzYWdlQmFycmllcj86ICgpID0+IFByb21pc2U8dm9pZD4pOiBUIHtcblx0XHRjb25zdCBoYW5kbGVyID0ge1xuXHRcdFx0Z2V0OiAodGFyZ2V0OiBSZWNvcmQ8UHJvcGVydHlLZXksIHVua25vd24+LCBuYW1lOiBQcm9wZXJ0eUtleSkgPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIG5hbWUgPT09ICdzdHJpbmcnICYmICF0YXJnZXRbbmFtZV0pIHtcblx0XHRcdFx0XHRpZiAocHJvcGVydHlJc0R5bmFtaWNFdmVudChuYW1lKSkgeyAvLyBvbkR5bmFtaWMuLi5cblx0XHRcdFx0XHRcdHRhcmdldFtuYW1lXSA9IChhcmc6IHVua25vd24pOiBFdmVudDx1bmtub3duPiA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmxpc3RlbihjaGFubmVsLCBuYW1lLCBhcmcpO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5SXNFdmVudChuYW1lKSkgeyAvLyBvbi4uLlxuXHRcdFx0XHRcdFx0dGFyZ2V0W25hbWVdID0gdGhpcy5saXN0ZW4oY2hhbm5lbCwgbmFtZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gQ2hhckNvZGUuRG9sbGFyU2lnbikgeyAvLyAkLi4uXG5cdFx0XHRcdFx0XHR0YXJnZXRbbmFtZV0gPSBhc3luYyAoLi4ubXlBcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgc2VuZE1lc3NhZ2VCYXJyaWVyPy4oKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2VuZE1lc3NhZ2UoY2hhbm5lbCwgbmFtZSwgbXlBcmdzKTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0YXJnZXRbbmFtZV07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXR1cm4gbmV3IFByb3h5KE9iamVjdC5jcmVhdGUobnVsbCksIGhhbmRsZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlTWVzc2FnZShtc2c6IE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKG1zZy50eXBlKSB7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcGx5OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlUmVwbHlNZXNzYWdlKG1zZyk7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcXVlc3Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVSZXF1ZXN0TWVzc2FnZShtc2cpO1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5TdWJzY3JpYmVFdmVudDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVN1YnNjcmliZUV2ZW50TWVzc2FnZShtc2cpO1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5FdmVudDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZUV2ZW50TWVzc2FnZShtc2cpO1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5VbnN1YnNjcmliZUV2ZW50OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlVW5zdWJzY3JpYmVFdmVudE1lc3NhZ2UobXNnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZXBseU1lc3NhZ2UocmVwbHlNZXNzYWdlOiBSZXBseU1lc3NhZ2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3BlbmRpbmdSZXBsaWVzW3JlcGx5TWVzc2FnZS5zZXFdKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0dvdCByZXBseSB0byB1bmtub3duIHNlcScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcGx5ID0gdGhpcy5fcGVuZGluZ1JlcGxpZXNbcmVwbHlNZXNzYWdlLnNlcV07XG5cdFx0ZGVsZXRlIHRoaXMuX3BlbmRpbmdSZXBsaWVzW3JlcGx5TWVzc2FnZS5zZXFdO1xuXG5cdFx0aWYgKHJlcGx5TWVzc2FnZS5lcnIpIHtcblx0XHRcdGxldCBlcnIgPSByZXBseU1lc3NhZ2UuZXJyO1xuXHRcdFx0aWYgKChyZXBseU1lc3NhZ2UuZXJyIGFzIFNlcmlhbGl6ZWRFcnJvcikuJGlzRXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgbmV3RXJyID0gbmV3IEVycm9yKCk7XG5cdFx0XHRcdG5ld0Vyci5uYW1lID0gKHJlcGx5TWVzc2FnZS5lcnIgYXMgU2VyaWFsaXplZEVycm9yKS5uYW1lO1xuXHRcdFx0XHRuZXdFcnIubWVzc2FnZSA9IChyZXBseU1lc3NhZ2UuZXJyIGFzIFNlcmlhbGl6ZWRFcnJvcikubWVzc2FnZTtcblx0XHRcdFx0bmV3RXJyLnN0YWNrID0gKHJlcGx5TWVzc2FnZS5lcnIgYXMgU2VyaWFsaXplZEVycm9yKS5zdGFjaztcblx0XHRcdFx0ZXJyID0gbmV3RXJyO1xuXHRcdFx0fVxuXHRcdFx0cmVwbHkucmVqZWN0KGVycik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmVwbHkucmVzb2x2ZShyZXBseU1lc3NhZ2UucmVzKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVJlcXVlc3RNZXNzYWdlKHJlcXVlc3RNZXNzYWdlOiBSZXF1ZXN0TWVzc2FnZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcSA9IHJlcXVlc3RNZXNzYWdlLnJlcTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9oYW5kbGVyLmhhbmRsZU1lc3NhZ2UocmVxdWVzdE1lc3NhZ2UuY2hhbm5lbCwgcmVxdWVzdE1lc3NhZ2UubWV0aG9kLCByZXF1ZXN0TWVzc2FnZS5hcmdzKTtcblx0XHRyZXN1bHQudGhlbigocikgPT4ge1xuXHRcdFx0dGhpcy5fc2VuZChuZXcgUmVwbHlNZXNzYWdlKHRoaXMuX3dvcmtlcklkLCByZXEsIHIsIHVuZGVmaW5lZCkpO1xuXHRcdH0sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5kZXRhaWwgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHQvLyBMb2FkaW5nIGVycm9ycyBoYXZlIGEgZGV0YWlsIHByb3BlcnR5IHRoYXQgcG9pbnRzIHRvIHRoZSBhY3R1YWwgZXJyb3Jcblx0XHRcdFx0ZS5kZXRhaWwgPSB0cmFuc2Zvcm1FcnJvckZvclNlcmlhbGl6YXRpb24oZS5kZXRhaWwpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2VuZChuZXcgUmVwbHlNZXNzYWdlKHRoaXMuX3dvcmtlcklkLCByZXEsIHVuZGVmaW5lZCwgdHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uKGUpKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTdWJzY3JpYmVFdmVudE1lc3NhZ2UobXNnOiBTdWJzY3JpYmVFdmVudE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCByZXEgPSBtc2cucmVxO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9oYW5kbGVyLmhhbmRsZUV2ZW50KG1zZy5jaGFubmVsLCBtc2cuZXZlbnROYW1lLCBtc2cuYXJnKSgoZXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX3NlbmQobmV3IEV2ZW50TWVzc2FnZSh0aGlzLl93b3JrZXJJZCwgcmVxLCBldmVudCkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3BlbmRpbmdFdmVudHMuc2V0KHJlcSwgZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVFdmVudE1lc3NhZ2UobXNnOiBFdmVudE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBlbWl0dGVyID0gdGhpcy5fcGVuZGluZ0VtaXR0ZXJzLmdldChtc2cucmVxKTtcblx0XHRpZiAoZW1pdHRlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0dvdCBldmVudCBmb3IgdW5rbm93biByZXEnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW1pdHRlci5maXJlKG1zZy5ldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVVbnN1YnNjcmliZUV2ZW50TWVzc2FnZShtc2c6IFVuc3Vic2NyaWJlRXZlbnRNZXNzYWdlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSB0aGlzLl9wZW5kaW5nRXZlbnRzLmdldChtc2cucmVxKTtcblx0XHRpZiAoZXZlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdHb3QgdW5zdWJzY3JpYmUgZm9yIHVua25vd24gcmVxJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGV2ZW50LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nRXZlbnRzLmRlbGV0ZShtc2cucmVxKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmQobXNnOiBNZXNzYWdlKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJhbnNmZXI6IEFycmF5QnVmZmVyW10gPSBbXTtcblx0XHRpZiAobXNnLnR5cGUgPT09IE1lc3NhZ2VUeXBlLlJlcXVlc3QpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbXNnLmFyZ3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgYXJnID0gbXNnLmFyZ3NbaV07XG5cdFx0XHRcdGlmIChhcmcgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRcdHRyYW5zZmVyLnB1c2goYXJnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IE1lc3NhZ2VUeXBlLlJlcGx5KSB7XG5cdFx0XHRpZiAobXNnLnJlcyBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdHRyYW5zZmVyLnB1c2gobXNnLnJlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2hhbmRsZXIuc2VuZE1lc3NhZ2UobXNnLCB0cmFuc2Zlcik7XG5cdH1cbn1cblxudHlwZSBQcm94aWVkTWV0aG9kTmFtZSA9IChgJCR7c3RyaW5nfWAgfCBgb24ke3N0cmluZ31gKTtcblxuZXhwb3J0IHR5cGUgUHJveGllZDxUPiA9IHsgW0sgaW4ga2V5b2YgVF06IFRbS10gZXh0ZW5kcyAoLi4uYXJnczogaW5mZXIgQSkgPT4gaW5mZXIgUlxuXHQ/IChcblx0XHRLIGV4dGVuZHMgUHJveGllZE1ldGhvZE5hbWVcblx0XHQ/ICguLi5hcmdzOiBBKSA9PiBQcm9taXNlPEF3YWl0ZWQ8Uj4+XG5cdFx0OiBuZXZlclxuXHQpXG5cdDogbmV2ZXJcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdlYldvcmtlckNsaWVudDxUUHJveHk+IHtcblx0cHJveHk6IFByb3hpZWQ8VFByb3h5Pjtcblx0ZGlzcG9zZSgpOiB2b2lkO1xuXHRzZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZywgaGFuZGxlcjogVCk6IHZvaWQ7XG5cdGdldENoYW5uZWw8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogc3RyaW5nKTogUHJveGllZDxUPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2ViV29ya2VyU2VydmVyIHtcblx0c2V0Q2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6IFQpOiB2b2lkO1xuXHRnZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZyk6IFByb3hpZWQ8VD47XG59XG5cbi8qKlxuICogTWFpbiB0aHJlYWQgc2lkZVxuICovXG5leHBvcnQgY2xhc3MgV2ViV29ya2VyQ2xpZW50PFcgZXh0ZW5kcyBvYmplY3Q+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXZWJXb3JrZXJDbGllbnQ8Vz4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtlcjogSVdlYldvcmtlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb2R1bGVMb2FkZWQ6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3RvY29sOiBXZWJXb3JrZXJQcm90b2NvbDtcblx0cHVibGljIHJlYWRvbmx5IHByb3h5OiBQcm94aWVkPFc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbENoYW5uZWxzOiBNYXA8c3RyaW5nLCBvYmplY3Q+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVDaGFubmVsczogTWFwPHN0cmluZywgb2JqZWN0PiA9IG5ldyBNYXAoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3b3JrZXI6IElXZWJXb3JrZXJcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3dvcmtlciA9IHRoaXMuX3JlZ2lzdGVyKHdvcmtlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya2VyLm9uTWVzc2FnZSgobXNnKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm90b2NvbC5oYW5kbGVNZXNzYWdlKG1zZyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtlci5vbkVycm9yKChlcnIpID0+IHtcblx0XHRcdGxvZ09uY2VXZWJXb3JrZXJXYXJuaW5nKGVycik7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3Byb3RvY29sID0gbmV3IFdlYldvcmtlclByb3RvY29sKHtcblx0XHRcdHNlbmRNZXNzYWdlOiAobXNnOiBNZXNzYWdlLCB0cmFuc2ZlcjogQXJyYXlCdWZmZXJbXSk6IHZvaWQgPT4ge1xuXHRcdFx0XHR0aGlzLl93b3JrZXIucG9zdE1lc3NhZ2UobXNnLCB0cmFuc2Zlcik7XG5cdFx0XHR9LFxuXHRcdFx0aGFuZGxlTWVzc2FnZTogKGNoYW5uZWw6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlTWVzc2FnZShjaGFubmVsLCBtZXRob2QsIGFyZ3MpO1xuXHRcdFx0fSxcblx0XHRcdGhhbmRsZUV2ZW50OiAoY2hhbm5lbDogc3RyaW5nLCBldmVudE5hbWU6IHN0cmluZywgYXJnOiB1bmtub3duKTogRXZlbnQ8dW5rbm93bj4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlRXZlbnQoY2hhbm5lbCwgZXZlbnROYW1lLCBhcmcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3Byb3RvY29sLnNldFdvcmtlcklkKHRoaXMuX3dvcmtlci5nZXRJZCgpKTtcblxuXHRcdC8vIFNlbmQgaW5pdGlhbGl6ZSBtZXNzYWdlXG5cdFx0dGhpcy5fb25Nb2R1bGVMb2FkZWQgPSB0aGlzLl9wcm90b2NvbC5zZW5kTWVzc2FnZShERUZBVUxUX0NIQU5ORUwsIElOSVRJQUxJWkUsIFtcblx0XHRcdHRoaXMuX3dvcmtlci5nZXRJZCgpLFxuXHRcdF0pLnRoZW4oKCkgPT4geyB9KTtcblxuXHRcdHRoaXMucHJveHkgPSB0aGlzLl9wcm90b2NvbC5jcmVhdGVQcm94eVRvUmVtb3RlQ2hhbm5lbChERUZBVUxUX0NIQU5ORUwsIGFzeW5jICgpID0+IHsgYXdhaXQgdGhpcy5fb25Nb2R1bGVMb2FkZWQ7IH0pO1xuXHRcdHRoaXMuX29uTW9kdWxlTG9hZGVkLmNhdGNoKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkVycm9yKCdXb3JrZXIgZmFpbGVkIHRvIGxvYWQgJywgZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVNZXNzYWdlKGNoYW5uZWxOYW1lOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBjaGFubmVsOiBvYmplY3QgfCB1bmRlZmluZWQgPSB0aGlzLl9sb2NhbENoYW5uZWxzLmdldChjaGFubmVsTmFtZSk7XG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBNaXNzaW5nIGNoYW5uZWwgJHtjaGFubmVsTmFtZX0gb24gbWFpbiB0aHJlYWRgKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm4gPSAoY2hhbm5lbCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbbWV0aG9kXTtcblx0XHRpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBNaXNzaW5nIG1ldGhvZCAke21ldGhvZH0gb24gbWFpbiB0aHJlYWQgY2hhbm5lbCAke2NoYW5uZWxOYW1lfWApKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmbi5hcHBseShjaGFubmVsLCBhcmdzKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUV2ZW50KGNoYW5uZWxOYW1lOiBzdHJpbmcsIGV2ZW50TmFtZTogc3RyaW5nLCBhcmc6IHVua25vd24pOiBFdmVudDx1bmtub3duPiB7XG5cdFx0Y29uc3QgY2hhbm5lbDogb2JqZWN0IHwgdW5kZWZpbmVkID0gdGhpcy5fbG9jYWxDaGFubmVscy5nZXQoY2hhbm5lbE5hbWUpO1xuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGNoYW5uZWwgJHtjaGFubmVsTmFtZX0gb24gbWFpbiB0aHJlYWRgKTtcblx0XHR9XG5cdFx0aWYgKHByb3BlcnR5SXNEeW5hbWljRXZlbnQoZXZlbnROYW1lKSkge1xuXHRcdFx0Y29uc3QgZm4gPSAoY2hhbm5lbCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbZXZlbnROYW1lXTtcblx0XHRcdGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGR5bmFtaWMgZXZlbnQgJHtldmVudE5hbWV9IG9uIG1haW4gdGhyZWFkIGNoYW5uZWwgJHtjaGFubmVsTmFtZX0uYCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBldmVudCA9IGZuLmNhbGwoY2hhbm5lbCwgYXJnKTtcblx0XHRcdGlmICh0eXBlb2YgZXZlbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGR5bmFtaWMgZXZlbnQgJHtldmVudE5hbWV9IG9uIG1haW4gdGhyZWFkIGNoYW5uZWwgJHtjaGFubmVsTmFtZX0uYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXZlbnQ7XG5cdFx0fVxuXHRcdGlmIChwcm9wZXJ0eUlzRXZlbnQoZXZlbnROYW1lKSkge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSAoY2hhbm5lbCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbZXZlbnROYW1lXTtcblx0XHRcdGlmICh0eXBlb2YgZXZlbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGV2ZW50ICR7ZXZlbnROYW1lfSBvbiBtYWluIHRocmVhZCBjaGFubmVsICR7Y2hhbm5lbE5hbWV9LmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV2ZW50IGFzIEV2ZW50PHVua25vd24+O1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYE1hbGZvcm1lZCBldmVudCBuYW1lICR7ZXZlbnROYW1lfWApO1xuXHR9XG5cblx0cHVibGljIHNldENoYW5uZWw8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogc3RyaW5nLCBoYW5kbGVyOiBUKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9jYWxDaGFubmVscy5zZXQoY2hhbm5lbCwgaGFuZGxlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcpOiBQcm94aWVkPFQ+IHtcblx0XHRsZXQgaW5zdCA9IHRoaXMuX3JlbW90ZUNoYW5uZWxzLmdldChjaGFubmVsKTtcblx0XHRpZiAoaW5zdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpbnN0ID0gdGhpcy5fcHJvdG9jb2wuY3JlYXRlUHJveHlUb1JlbW90ZUNoYW5uZWwoY2hhbm5lbCwgYXN5bmMgKCkgPT4geyBhd2FpdCB0aGlzLl9vbk1vZHVsZUxvYWRlZDsgfSk7XG5cdFx0XHR0aGlzLl9yZW1vdGVDaGFubmVscy5zZXQoY2hhbm5lbCwgaW5zdCk7XG5cdFx0fVxuXHRcdHJldHVybiBpbnN0IGFzIFByb3hpZWQ8VD47XG5cdH1cblxuXHRwcml2YXRlIF9vbkVycm9yKG1lc3NhZ2U6IHN0cmluZywgZXJyb3I/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc29sZS5lcnJvcihtZXNzYWdlKTtcblx0XHRjb25zb2xlLmluZm8oZXJyb3IpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHByb3BlcnR5SXNFdmVudChuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Ly8gQXNzdW1lIGEgcHJvcGVydHkgaXMgYW4gZXZlbnQgaWYgaXQgaGFzIGEgZm9ybSBvZiBcIm9uU29tZXRoaW5nXCJcblx0cmV0dXJuIG5hbWVbMF0gPT09ICdvJyAmJiBuYW1lWzFdID09PSAnbicgJiYgc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIobmFtZS5jaGFyQ29kZUF0KDIpKTtcbn1cblxuZnVuY3Rpb24gcHJvcGVydHlJc0R5bmFtaWNFdmVudChuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Ly8gQXNzdW1lIGEgcHJvcGVydHkgaXMgYSBkeW5hbWljIGV2ZW50IChhIG1ldGhvZCB0aGF0IHJldHVybnMgYW4gZXZlbnQpIGlmIGl0IGhhcyBhIGZvcm0gb2YgXCJvbkR5bmFtaWNTb21ldGhpbmdcIlxuXHRyZXR1cm4gL15vbkR5bmFtaWMvLnRlc3QobmFtZSkgJiYgc3RyaW5ncy5pc1VwcGVyQXNjaWlMZXR0ZXIobmFtZS5jaGFyQ29kZUF0KDkpKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXIge1xuXHRfcmVxdWVzdEhhbmRsZXJCcmFuZDogdm9pZDtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0W3Byb3A6IHN0cmluZ106IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXJGYWN0b3J5PFQgZXh0ZW5kcyBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXI+IHtcblx0KHdvcmtlclNlcnZlcjogSVdlYldvcmtlclNlcnZlcik6IFQ7XG59XG5cbi8qKlxuICogV29ya2VyIHNpZGVcbiAqL1xuZXhwb3J0IGNsYXNzIFdlYldvcmtlclNlcnZlcjxUIGV4dGVuZHMgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyPiBpbXBsZW1lbnRzIElXZWJXb3JrZXJTZXJ2ZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSByZXF1ZXN0SGFuZGxlcjogVDtcblx0cHJpdmF0ZSBfcHJvdG9jb2w6IFdlYldvcmtlclByb3RvY29sO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbENoYW5uZWxzOiBNYXA8c3RyaW5nLCBvYmplY3Q+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVDaGFubmVsczogTWFwPHN0cmluZywgb2JqZWN0PiA9IG5ldyBNYXAoKTtcblxuXHRjb25zdHJ1Y3Rvcihwb3N0TWVzc2FnZTogKG1zZzogTWVzc2FnZSwgdHJhbnNmZXI/OiBBcnJheUJ1ZmZlcltdKSA9PiB2b2lkLCByZXF1ZXN0SGFuZGxlckZhY3Rvcnk6IElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlckZhY3Rvcnk8VD4pIHtcblx0XHR0aGlzLl9wcm90b2NvbCA9IG5ldyBXZWJXb3JrZXJQcm90b2NvbCh7XG5cdFx0XHRzZW5kTWVzc2FnZTogKG1zZzogTWVzc2FnZSwgdHJhbnNmZXI6IEFycmF5QnVmZmVyW10pOiB2b2lkID0+IHtcblx0XHRcdFx0cG9zdE1lc3NhZ2UobXNnLCB0cmFuc2Zlcik7XG5cdFx0XHR9LFxuXHRcdFx0aGFuZGxlTWVzc2FnZTogKGNoYW5uZWw6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4gPT4gdGhpcy5faGFuZGxlTWVzc2FnZShjaGFubmVsLCBtZXRob2QsIGFyZ3MpLFxuXHRcdFx0aGFuZGxlRXZlbnQ6IChjaGFubmVsOiBzdHJpbmcsIGV2ZW50TmFtZTogc3RyaW5nLCBhcmc6IHVua25vd24pOiBFdmVudDx1bmtub3duPiA9PiB0aGlzLl9oYW5kbGVFdmVudChjaGFubmVsLCBldmVudE5hbWUsIGFyZylcblx0XHR9KTtcblx0XHR0aGlzLnJlcXVlc3RIYW5kbGVyID0gcmVxdWVzdEhhbmRsZXJGYWN0b3J5KHRoaXMpO1xuXHR9XG5cblx0cHVibGljIG9ubWVzc2FnZShtc2c6IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl9wcm90b2NvbC5oYW5kbGVNZXNzYWdlKG1zZyk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVNZXNzYWdlKGNoYW5uZWw6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGlmIChjaGFubmVsID09PSBERUZBVUxUX0NIQU5ORUwgJiYgbWV0aG9kID09PSBJTklUSUFMSVpFKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplKDxudW1iZXI+YXJnc1swXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdEhhbmRsZXI6IG9iamVjdCB8IG51bGwgfCB1bmRlZmluZWQgPSAoY2hhbm5lbCA9PT0gREVGQVVMVF9DSEFOTkVMID8gdGhpcy5yZXF1ZXN0SGFuZGxlciA6IHRoaXMuX2xvY2FsQ2hhbm5lbHMuZ2V0KGNoYW5uZWwpKTtcblx0XHRpZiAoIXJlcXVlc3RIYW5kbGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBNaXNzaW5nIGNoYW5uZWwgJHtjaGFubmVsfSBvbiB3b3JrZXIgdGhyZWFkYCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZuID0gKHJlcXVlc3RIYW5kbGVyIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVttZXRob2RdO1xuXHRcdGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYE1pc3NpbmcgbWV0aG9kICR7bWV0aG9kfSBvbiB3b3JrZXIgdGhyZWFkIGNoYW5uZWwgJHtjaGFubmVsfWApKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmbi5hcHBseShyZXF1ZXN0SGFuZGxlciwgYXJncykpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVFdmVudChjaGFubmVsOiBzdHJpbmcsIGV2ZW50TmFtZTogc3RyaW5nLCBhcmc6IHVua25vd24pOiBFdmVudDx1bmtub3duPiB7XG5cdFx0Y29uc3QgcmVxdWVzdEhhbmRsZXI6IG9iamVjdCB8IG51bGwgfCB1bmRlZmluZWQgPSAoY2hhbm5lbCA9PT0gREVGQVVMVF9DSEFOTkVMID8gdGhpcy5yZXF1ZXN0SGFuZGxlciA6IHRoaXMuX2xvY2FsQ2hhbm5lbHMuZ2V0KGNoYW5uZWwpKTtcblx0XHRpZiAoIXJlcXVlc3RIYW5kbGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgY2hhbm5lbCAke2NoYW5uZWx9IG9uIHdvcmtlciB0aHJlYWRgKTtcblx0XHR9XG5cdFx0aWYgKHByb3BlcnR5SXNEeW5hbWljRXZlbnQoZXZlbnROYW1lKSkge1xuXHRcdFx0Y29uc3QgZm4gPSAocmVxdWVzdEhhbmRsZXIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2V2ZW50TmFtZV07XG5cdFx0XHRpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBkeW5hbWljIGV2ZW50ICR7ZXZlbnROYW1lfSBvbiByZXF1ZXN0IGhhbmRsZXIuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gZm4uY2FsbChyZXF1ZXN0SGFuZGxlciwgYXJnKTtcblx0XHRcdGlmICh0eXBlb2YgZXZlbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGR5bmFtaWMgZXZlbnQgJHtldmVudE5hbWV9IG9uIHJlcXVlc3QgaGFuZGxlci5gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBldmVudDtcblx0XHR9XG5cdFx0aWYgKHByb3BlcnR5SXNFdmVudChldmVudE5hbWUpKSB7XG5cdFx0XHRjb25zdCBldmVudCA9IChyZXF1ZXN0SGFuZGxlciBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbZXZlbnROYW1lXTtcblx0XHRcdGlmICh0eXBlb2YgZXZlbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGV2ZW50ICR7ZXZlbnROYW1lfSBvbiByZXF1ZXN0IGhhbmRsZXIuYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXZlbnQgYXMgRXZlbnQ8dW5rbm93bj47XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgTWFsZm9ybWVkIGV2ZW50IG5hbWUgJHtldmVudE5hbWV9YCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6IFQpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2NhbENoYW5uZWxzLnNldChjaGFubmVsLCBoYW5kbGVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZyk6IFByb3hpZWQ8VD4ge1xuXHRcdGxldCBpbnN0ID0gdGhpcy5fcmVtb3RlQ2hhbm5lbHMuZ2V0KGNoYW5uZWwpO1xuXHRcdGlmIChpbnN0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGluc3QgPSB0aGlzLl9wcm90b2NvbC5jcmVhdGVQcm94eVRvUmVtb3RlQ2hhbm5lbChjaGFubmVsKTtcblx0XHRcdHRoaXMuX3JlbW90ZUNoYW5uZWxzLnNldChjaGFubmVsLCBpbnN0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3QgYXMgUHJveGllZDxUPjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSh3b3JrZXJJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcHJvdG9jb2wuc2V0V29ya2VySWQod29ya2VySWQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFvQyxzQ0FBc0M7QUFDbkYsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGFBQWE7QUFDdEIsWUFBWSxhQUFhO0FBRXpCLE1BQU0sa0JBQWtCO0FBQ3hCLE1BQU0sYUFBYTtBQVNuQixJQUFJLHlCQUF5QjtBQUN0QixTQUFTLHdCQUF3QixLQUFvQjtBQUMzRCxNQUFJLENBQUMsT0FBTztBQUVYO0FBQUEsRUFDRDtBQUNBLE1BQUksQ0FBQyx3QkFBd0I7QUFDNUIsNkJBQXlCO0FBQ3pCLFlBQVEsS0FBSyxpTEFBaUw7QUFBQSxFQUMvTDtBQUNBLFVBQVEsS0FBTSxJQUFjLE9BQU87QUFDcEM7QUFFQSxJQUFXLGNBQVgsa0JBQVdBLGlCQUFYO0FBQ0MsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUxVLFNBQUFBO0FBQUEsR0FBQTtBQU9YLE1BQU0sZUFBZTtBQUFBLEVBRXBCLFlBQ2lCLFVBQ0EsS0FDQSxTQUNBLFFBQ0EsTUFDZjtBQUxlO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFOakIsU0FBZ0IsT0FBTztBQUFBLEVBT25CO0FBQ0w7QUFDQSxNQUFNLGFBQWE7QUFBQSxFQUVsQixZQUNpQixVQUNBLEtBQ0EsS0FDQSxLQUNmO0FBSmU7QUFDQTtBQUNBO0FBQ0E7QUFMakIsU0FBZ0IsT0FB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TUFBTSxtQkFBbUIsT0FBTyxtQkFBbUIsQ0FBQztBQUFBLElBQy9FO0FBRUEsVUFBTSxLQUFNLGVBQTJDLE1BQU07QUFDN0QsUUFBSSxPQUFPLE9BQU8sWUFBWTtBQUM3QixhQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sa0JBQWtCLE1BQU0sNkJBQTZCLE9BQU8sRUFBRSxDQUFDO0FBQUEsSUFDaEc7QUFFQSxRQUFJO0FBQ0gsYUFBTyxRQUFRLFFBQVEsR0FBRyxNQUFNLGdCQUFnQixJQUFJLENBQUM7QUFBQSxJQUN0RCxTQUFTLEdBQUc7QUFDWCxhQUFPLFFBQVEsT0FBTyxDQUFDO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxhQUFhLFNBQWlCLFdBQW1CLEtBQThCO0FBQ3RGLFVBQU0saUJBQTZDLFlBQVksa0JBQWtCLEtBQUssaUJBQWlCLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDdEksUUFBSSxDQUFDLGdCQUFnQjtBQUNwQixZQUFNLElBQUksTUFBTSxtQkFBbUIsT0FBTyxtQkFBbUI7QUFBQSxJQUM5RDtBQUNBLFFBQUksdUJBQXVCLFNBQVMsR0FBRztBQUN0QyxZQUFNLEtBQU0sZUFBMkMsU0FBUztBQUNoRSxVQUFJLE9BQU8sT0FBTyxZQUFZO0FBQzdCLGNBQU0sSUFBSSxNQUFNLHlCQUF5QixTQUFTLHNCQUFzQjtBQUFBLE1BQ3pFO0FBRUEsWUFBTSxRQUFRLEdBQUcsS0FBSyxnQkFBZ0IsR0FBRztBQUN6QyxVQUFJLE9BQU8sVUFBVSxZQUFZO0FBQ2hDLGNBQU0sSUFBSSxNQUFNLHlCQUF5QixTQUFTLHNCQUFzQjtBQUFBLE1BQ3pFO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLGdCQUFnQixTQUFTLEdBQUc7QUFDL0IsWUFBTSxRQUFTLGVBQTJDLFNBQVM7QUFDbkUsVUFBSSxPQUFPLFVBQVUsWUFBWTtBQUNoQyxjQUFNLElBQUksTUFBTSxpQkFBaUIsU0FBUyxzQkFBc0I7QUFBQSxNQUNqRTtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxJQUFJLE1BQU0sd0JBQXdCLFNBQVMsRUFBRTtBQUFBLEVBQ3BEO0FBQUEsRUFFTyxXQUE2QixTQUFpQixTQUFrQjtBQUN0RSxTQUFLLGVBQWUsSUFBSSxTQUFTLE9BQU87QUFBQSxFQUN6QztBQUFBLEVBRU8sV0FBNkIsU0FBNkI7QUFDaEUsUUFBSSxPQUFPLEtBQUssZ0JBQWdCLElBQUksT0FBTztBQUMzQyxRQUFJLFNBQVMsUUFBVztBQUN2QixhQUFPLEtBQUssVUFBVSwyQkFBMkIsT0FBTztBQUN4RCxXQUFLLGdCQUFnQixJQUFJLFNBQVMsSUFBSTtBQUFBLElBQ3ZDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsV0FBVyxVQUFpQztBQUN6RCxTQUFLLFVBQVUsWUFBWSxRQUFRO0FBQUEsRUFDcEM7QUFDRDsiLAogICJuYW1lcyI6IFsiTWVzc2FnZVR5cGUiXQp9Cg==
