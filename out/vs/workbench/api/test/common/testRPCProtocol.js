import { isThenable } from "../../../../base/common/async.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { ExtensionHostKind } from "../../../services/extensions/common/extensionHostKind.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { parseJsonAndRestoreBufferRefs, stringifyJsonWithBufferRefs } from "../../../services/extensions/common/rpcProtocol.js";
function SingleProxyRPCProtocol(thing) {
  return {
    _serviceBrand: void 0,
    remoteAuthority: null,
    getProxy() {
      return thing;
    },
    set(identifier, value) {
      return value;
    },
    dispose: void 0,
    assertRegistered: void 0,
    drain: void 0,
    extensionHostKind: ExtensionHostKind.LocalProcess
  };
}
function AnyCallRPCProtocol(useCalls) {
  return SingleProxyRPCProtocol(new Proxy({}, {
    get(_target, prop) {
      if (useCalls && prop in useCalls) {
        return useCalls[prop];
      }
      return () => Promise.resolve(void 0);
    }
  }));
}
class TestRPCProtocol {
  constructor() {
    this.remoteAuthority = null;
    this.extensionHostKind = ExtensionHostKind.LocalProcess;
    this._callCountValue = 0;
    this._locals = /* @__PURE__ */ Object.create(null);
    this._proxies = /* @__PURE__ */ Object.create(null);
  }
  drain() {
    return Promise.resolve();
  }
  get _callCount() {
    return this._callCountValue;
  }
  set _callCount(value) {
    this._callCountValue = value;
    if (this._callCountValue === 0) {
      this._completeIdle?.();
      this._idle = void 0;
    }
  }
  sync() {
    return new Promise((c) => {
      setTimeout(c, 0);
    }).then(() => {
      if (this._callCount === 0) {
        return void 0;
      }
      if (!this._idle) {
        this._idle = new Promise((c, e) => {
          this._completeIdle = c;
        });
      }
      return this._idle;
    });
  }
  getProxy(identifier) {
    if (!this._proxies[identifier.sid]) {
      this._proxies[identifier.sid] = this._createProxy(identifier.sid);
    }
    return this._proxies[identifier.sid];
  }
  _createProxy(proxyId) {
    const handler = {
      get: (target, name) => {
        if (typeof name === "string" && !target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
          target[name] = (...myArgs) => {
            return this._remoteCall(proxyId, name, myArgs);
          };
        }
        return target[name];
      }
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), handler);
  }
  set(identifier, value) {
    this._locals[identifier.sid] = value;
    return value;
  }
  _remoteCall(proxyId, path, args) {
    this._callCount++;
    return new Promise((c) => {
      setTimeout(c, 0);
    }).then(() => {
      const instance = this._locals[proxyId];
      const wireArgs = simulateWireTransfer(args);
      let p;
      try {
        const result = instance[path].apply(instance, wireArgs);
        p = isThenable(result) ? result : Promise.resolve(result);
      } catch (err) {
        p = Promise.reject(err);
      }
      return p.then((result) => {
        this._callCount--;
        const wireResult = simulateWireTransfer(result);
        return wireResult;
      }, (err) => {
        this._callCount--;
        return Promise.reject(err);
      });
    });
  }
  dispose() {
  }
  assertRegistered(identifiers) {
    throw new Error("Not implemented!");
  }
}
function simulateWireTransfer(obj) {
  if (!obj) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(simulateWireTransfer);
  }
  if (obj instanceof SerializableObjectWithBuffers) {
    const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(obj);
    return parseJsonAndRestoreBufferRefs(jsonString, referencedBuffers, null);
  } else {
    return JSON.parse(JSON.stringify(obj));
  }
}
export {
  AnyCallRPCProtocol,
  SingleProxyRPCProtocol,
  TestRPCProtocol
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcY29tbW9uXFx0ZXN0UlBDUHJvdG9jb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1RoZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0S2luZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IFByb3hpZWQsIFByb3h5SWRlbnRpZmllciwgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgcGFyc2VKc29uQW5kUmVzdG9yZUJ1ZmZlclJlZnMsIHN0cmluZ2lmeUpzb25XaXRoQnVmZmVyUmVmcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3JwY1Byb3RvY29sLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIFNpbmdsZVByb3h5UlBDUHJvdG9jb2wodGhpbmc6IGFueSk6IElFeHRIb3N0Q29udGV4dCAmIElFeHRIb3N0UnBjU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdHJlbW90ZUF1dGhvcml0eTogbnVsbCEsXG5cdFx0Z2V0UHJveHk8VD4oKTogVCB7XG5cdFx0XHRyZXR1cm4gdGhpbmc7XG5cdFx0fSxcblx0XHRzZXQ8VCwgUiBleHRlbmRzIFQ+KGlkZW50aWZpZXI6IFByb3h5SWRlbnRpZmllcjxUPiwgdmFsdWU6IFIpOiBSIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9LFxuXHRcdGRpc3Bvc2U6IHVuZGVmaW5lZCEsXG5cdFx0YXNzZXJ0UmVnaXN0ZXJlZDogdW5kZWZpbmVkISxcblx0XHRkcmFpbjogdW5kZWZpbmVkISxcblx0XHRleHRlbnNpb25Ib3N0S2luZDogRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzXG5cdH07XG59XG5cbi8qKiBNYWtlcyBhIGZha2Uge0BsaW5rIFNpbmdsZVByb3h5UlBDUHJvdG9jb2x9IG9uIHdoaWNoIGFueSBtZXRob2QgY2FuIGJlIGNhbGxlZCAqL1xuZXhwb3J0IGZ1bmN0aW9uIEFueUNhbGxSUENQcm90b2NvbDxUPih1c2VDYWxscz86IHsgW0sgaW4ga2V5b2YgVF06IFRbS10gfSkge1xuXHRyZXR1cm4gU2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgUHJveHkoe30sIHtcblx0XHRnZXQoX3RhcmdldCwgcHJvcDogc3RyaW5nKSB7XG5cdFx0XHRpZiAodXNlQ2FsbHMgJiYgcHJvcCBpbiB1c2VDYWxscykge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0cmV0dXJuICh1c2VDYWxscyBhcyBhbnkpW3Byb3BdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICgpID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fSkpO1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJQQ1Byb3RvY29sIGltcGxlbWVudHMgSUV4dEhvc3RDb250ZXh0LCBJRXh0SG9zdFJwY1NlcnZpY2Uge1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZW1vdGVBdXRob3JpdHkgPSBudWxsITtcblx0cHVibGljIGV4dGVuc2lvbkhvc3RLaW5kID0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzO1xuXG5cdHByaXZhdGUgX2NhbGxDb3VudFZhbHVlOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9pZGxlPzogUHJvbWlzZTxhbnk+O1xuXHRwcml2YXRlIF9jb21wbGV0ZUlkbGU/OiBGdW5jdGlvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbHM6IHsgW2lkOiBzdHJpbmddOiBhbnkgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveGllczogeyBbaWQ6IHN0cmluZ106IGFueSB9O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2xvY2FscyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fcHJveGllcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRkcmFpbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfY2FsbENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbGxDb3VudFZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgX2NhbGxDb3VudCh2YWx1ZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fY2FsbENvdW50VmFsdWUgPSB2YWx1ZTtcblx0XHRpZiAodGhpcy5fY2FsbENvdW50VmFsdWUgPT09IDApIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRlSWRsZT8uKCk7XG5cdFx0XHR0aGlzLl9pZGxlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHN5bmMoKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8YW55PigoYykgPT4ge1xuXHRcdFx0c2V0VGltZW91dChjLCAwKTtcblx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jYWxsQ291bnQgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faWRsZSkge1xuXHRcdFx0XHR0aGlzLl9pZGxlID0gbmV3IFByb21pc2U8YW55PigoYywgZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlSWRsZSA9IGM7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2lkbGU7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJveHk8VD4oaWRlbnRpZmllcjogUHJveHlJZGVudGlmaWVyPFQ+KTogUHJveGllZDxUPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm94aWVzW2lkZW50aWZpZXIuc2lkXSkge1xuXHRcdFx0dGhpcy5fcHJveGllc1tpZGVudGlmaWVyLnNpZF0gPSB0aGlzLl9jcmVhdGVQcm94eShpZGVudGlmaWVyLnNpZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94aWVzW2lkZW50aWZpZXIuc2lkXTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVByb3h5PFQ+KHByb3h5SWQ6IHN0cmluZyk6IFQge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSB7XG5cdFx0XHRnZXQ6ICh0YXJnZXQ6IGFueSwgbmFtZTogUHJvcGVydHlLZXkpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJyAmJiAhdGFyZ2V0W25hbWVdICYmIG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gQ2hhckNvZGUuRG9sbGFyU2lnbikge1xuXHRcdFx0XHRcdHRhcmdldFtuYW1lXSA9ICguLi5teUFyZ3M6IGFueVtdKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlQ2FsbChwcm94eUlkLCBuYW1lLCBteUFyZ3MpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0W25hbWVdO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIG5ldyBQcm94eShPYmplY3QuY3JlYXRlKG51bGwpLCBoYW5kbGVyKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQ8VCwgUiBleHRlbmRzIFQ+KGlkZW50aWZpZXI6IFByb3h5SWRlbnRpZmllcjxUPiwgdmFsdWU6IFIpOiBSIHtcblx0XHR0aGlzLl9sb2NhbHNbaWRlbnRpZmllci5zaWRdID0gdmFsdWU7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yZW1vdGVDYWxsKHByb3h5SWQ6IHN0cmluZywgcGF0aDogc3RyaW5nLCBhcmdzOiBhbnlbXSk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhpcy5fY2FsbENvdW50Kys7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8YW55PigoYykgPT4ge1xuXHRcdFx0c2V0VGltZW91dChjLCAwKTtcblx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fbG9jYWxzW3Byb3h5SWRdO1xuXHRcdFx0Ly8gcHJldGVuZCB0aGUgYXJncyB3ZW50IG92ZXIgdGhlIHdpcmUuLi4gKGludm9rZSAudG9KU09OIG9uIG9iamVjdHMuLi4pXG5cdFx0XHRjb25zdCB3aXJlQXJncyA9IHNpbXVsYXRlV2lyZVRyYW5zZmVyKGFyZ3MpO1xuXHRcdFx0bGV0IHA6IFByb21pc2U8YW55Pjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9ICg8RnVuY3Rpb24+aW5zdGFuY2VbcGF0aF0pLmFwcGx5KGluc3RhbmNlLCB3aXJlQXJncyk7XG5cdFx0XHRcdHAgPSBpc1RoZW5hYmxlKHJlc3VsdCkgPyByZXN1bHQgOiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRwID0gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHAudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYWxsQ291bnQtLTtcblx0XHRcdFx0Ly8gcHJldGVuZCB0aGUgcmVzdWx0IHdlbnQgb3ZlciB0aGUgd2lyZS4uLiAoaW52b2tlIC50b0pTT04gb24gb2JqZWN0cy4uLilcblx0XHRcdFx0Y29uc3Qgd2lyZVJlc3VsdCA9IHNpbXVsYXRlV2lyZVRyYW5zZmVyKHJlc3VsdCk7XG5cdFx0XHRcdHJldHVybiB3aXJlUmVzdWx0O1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fY2FsbENvdW50LS07XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHsgfVxuXG5cdHB1YmxpYyBhc3NlcnRSZWdpc3RlcmVkKGlkZW50aWZpZXJzOiBQcm94eUlkZW50aWZpZXI8YW55PltdKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQhJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2ltdWxhdGVXaXJlVHJhbnNmZXI8VD4ob2JqOiBUKTogVCB7XG5cdGlmICghb2JqKSB7XG5cdFx0cmV0dXJuIG9iajtcblx0fVxuXG5cdGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZXR1cm4gb2JqLm1hcChzaW11bGF0ZVdpcmVUcmFuc2ZlcikgYXMgYW55O1xuXHR9XG5cblx0aWYgKG9iaiBpbnN0YW5jZW9mIFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKSB7XG5cdFx0Y29uc3QgeyBqc29uU3RyaW5nLCByZWZlcmVuY2VkQnVmZmVycyB9ID0gc3RyaW5naWZ5SnNvbldpdGhCdWZmZXJSZWZzKG9iaik7XG5cdFx0cmV0dXJuIHBhcnNlSnNvbkFuZFJlc3RvcmVCdWZmZXJSZWZzKGpzb25TdHJpbmcsIHJlZmVyZW5jZWRCdWZmZXJzLCBudWxsKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvYmopKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBbUMscUNBQXFDO0FBQ3hFLFNBQVMsK0JBQStCLG1DQUFtQztBQUVwRSxTQUFTLHVCQUF1QixPQUFrRDtBQUN4RixTQUFPO0FBQUEsSUFDTixlQUFlO0FBQUEsSUFDZixpQkFBaUI7QUFBQSxJQUNqQixXQUFpQjtBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUFBLElBQ0EsSUFBb0IsWUFBZ0MsT0FBYTtBQUNoRSxhQUFPO0FBQUEsSUFDUjtBQUFBLElBQ0EsU0FBUztBQUFBLElBQ1Qsa0JBQWtCO0FBQUEsSUFDbEIsT0FBTztBQUFBLElBQ1AsbUJBQW1CLGtCQUFrQjtBQUFBLEVBQ3RDO0FBQ0Q7QUFHTyxTQUFTLG1CQUFzQixVQUFxQztBQUMxRSxTQUFPLHVCQUF1QixJQUFJLE1BQU0sQ0FBQyxHQUFHO0FBQUEsSUFDM0MsSUFBSSxTQUFTLE1BQWM7QUFDMUIsVUFBSSxZQUFZLFFBQVEsVUFB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
