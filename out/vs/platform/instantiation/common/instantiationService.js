import { GlobalIdleValue } from "../../../base/common/async.js";
import { illegalState } from "../../../base/common/errors.js";
import { dispose, isDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { SyncDescriptor } from "./descriptors.js";
import { Graph } from "./graph.js";
import { IInstantiationService, _util } from "./instantiation.js";
import { ServiceCollection } from "./serviceCollection.js";
import { LinkedList } from "../../../base/common/linkedList.js";
const _enableAllTracing = false;
class CyclicDependencyError extends Error {
  constructor(graph) {
    super("cyclic dependency between services");
    this.message = graph.findCycleSlow() ?? `UNABLE to detect cycle, dumping graph: 
${graph.toString()}`;
  }
}
class InstantiationService {
  constructor(_services = new ServiceCollection(), _strict = false, _parent, _enableTracing = _enableAllTracing) {
    this._services = _services;
    this._strict = _strict;
    this._parent = _parent;
    this._enableTracing = _enableTracing;
    this._isDisposed = false;
    this._servicesToMaybeDispose = /* @__PURE__ */ new Set();
    this._children = /* @__PURE__ */ new Set();
    this._activeInstantiations = /* @__PURE__ */ new Set();
    this._services.set(IInstantiationService, this);
    this._globalGraph = _enableTracing ? _parent?._globalGraph ?? new Graph((e) => e) : void 0;
  }
  dispose() {
    if (!this._isDisposed) {
      this._isDisposed = true;
      dispose(this._children);
      this._children.clear();
      for (const candidate of this._servicesToMaybeDispose) {
        if (isDisposable(candidate)) {
          candidate.dispose();
        }
      }
      this._servicesToMaybeDispose.clear();
    }
  }
  _throwIfDisposed() {
    if (this._isDisposed) {
      throw new Error("InstantiationService has been disposed");
    }
  }
  createChild(services, store) {
    this._throwIfDisposed();
    const that = this;
    const result = new class extends InstantiationService {
      dispose() {
        that._children.delete(result);
        super.dispose();
      }
    }(services, this._strict, this, this._enableTracing);
    this._children.add(result);
    store?.add(result);
    return result;
  }
  invokeFunction(fn, ...args) {
    this._throwIfDisposed();
    const _trace = Trace.traceInvocation(this._enableTracing, fn);
    let _done = false;
    try {
      const accessor = {
        get: (id) => {
          if (_done) {
            throw illegalState("service accessor is only valid during the invocation of its target method");
          }
          const result = this._getOrCreateServiceInstance(id, _trace);
          if (!result) {
            this._throwIfStrict(`[invokeFunction] unknown service '${id}'`, false);
          }
          return result;
        }
      };
      return fn(accessor, ...args);
    } finally {
      _done = true;
      _trace.stop();
    }
  }
  createInstance(ctorOrDescriptor, ...rest) {
    this._throwIfDisposed();
    let _trace;
    let result;
    if (ctorOrDescriptor instanceof SyncDescriptor) {
      _trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor.ctor);
      result = this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest), _trace);
    } else {
      _trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor);
      result = this._createInstance(ctorOrDescriptor, rest, _trace);
    }
    _trace.stop();
    return result;
  }
  _createInstance(ctor, args = [], _trace) {
    const serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
    const serviceArgs = [];
    for (const dependency of serviceDependencies) {
      const service = this._getOrCreateServiceInstance(dependency.id, _trace);
      if (!service) {
        this._throwIfStrict(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`, false);
      }
      serviceArgs.push(service);
    }
    const firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;
    if (args.length !== firstServiceArgPos) {
      console.trace(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);
      const delta = firstServiceArgPos - args.length;
      if (delta > 0) {
        args = args.concat(new Array(delta));
      } else {
        args = args.slice(0, firstServiceArgPos);
      }
    }
    return Reflect.construct(ctor, args.concat(serviceArgs));
  }
  _setCreatedServiceInstance(id, instance) {
    if (this._services.get(id) instanceof SyncDescriptor) {
      this._services.set(id, instance);
    } else if (this._parent) {
      this._parent._setCreatedServiceInstance(id, instance);
    } else {
      throw new Error("illegalState - setting UNKNOWN service instance");
    }
  }
  _getServiceInstanceOrDescriptor(id) {
    const instanceOrDesc = this._services.get(id);
    if (!instanceOrDesc && this._parent) {
      return this._parent._getServiceInstanceOrDescriptor(id);
    } else {
      return instanceOrDesc;
    }
  }
  _getOrCreateServiceInstance(id, _trace) {
    if (this._globalGraph && this._globalGraphImplicitDependency) {
      this._globalGraph.insertEdge(this._globalGraphImplicitDependency, String(id));
    }
    const thing = this._getServiceInstanceOrDescriptor(id);
    if (thing instanceof SyncDescriptor) {
      return this._safeCreateAndCacheServiceInstance(id, thing, _trace.branch(id, true));
    } else {
      _trace.branch(id, false);
      return thing;
    }
  }
  _safeCreateAndCacheServiceInstance(id, desc, _trace) {
    if (this._activeInstantiations.has(id)) {
      throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
    }
    this._activeInstantiations.add(id);
    try {
      return this._createAndCacheServiceInstance(id, desc, _trace);
    } finally {
      this._activeInstantiations.delete(id);
    }
  }
  _createAndCacheServiceInstance(id, desc, _trace) {
    const graph = new Graph((data) => data.id.toString());
    let cycleCount = 0;
    const stack = [{ id, desc, _trace }];
    const seen = /* @__PURE__ */ new Set();
    while (stack.length) {
      const item = stack.pop();
      if (seen.has(String(item.id))) {
        continue;
      }
      seen.add(String(item.id));
      graph.lookupOrInsertNode(item);
      if (cycleCount++ > 1e3) {
        throw new CyclicDependencyError(graph);
      }
      for (const dependency of _util.getServiceDependencies(item.desc.ctor)) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
        if (!instanceOrDesc) {
          this._throwIfStrict(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`, true);
        }
        this._globalGraph?.insertEdge(String(item.id), String(dependency.id));
        if (instanceOrDesc instanceof SyncDescriptor) {
          const d = { id: dependency.id, desc: instanceOrDesc, _trace: item._trace.branch(dependency.id, true) };
          graph.insertEdge(item, d);
          stack.push(d);
        }
      }
    }
    while (true) {
      const roots = graph.roots();
      if (roots.length === 0) {
        if (!graph.isEmpty()) {
          throw new CyclicDependencyError(graph);
        }
        break;
      }
      for (const { data } of roots) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
        if (instanceOrDesc instanceof SyncDescriptor) {
          const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments, data.desc.supportsDelayedInstantiation, data._trace);
          this._setCreatedServiceInstance(data.id, instance);
        }
        graph.removeNode(data);
      }
    }
    return this._getServiceInstanceOrDescriptor(id);
  }
  _createServiceInstanceWithOwner(id, ctor, args = [], supportsDelayedInstantiation, _trace) {
    if (this._services.get(id) instanceof SyncDescriptor) {
      return this._createServiceInstance(id, ctor, args, supportsDelayedInstantiation, _trace, this._servicesToMaybeDispose);
    } else if (this._parent) {
      return this._parent._createServiceInstanceWithOwner(id, ctor, args, supportsDelayedInstantiation, _trace);
    } else {
      throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
    }
  }
  _createServiceInstance(id, ctor, args = [], supportsDelayedInstantiation, _trace, disposeBucket) {
    if (!supportsDelayedInstantiation) {
      const result = this._createInstance(ctor, args, _trace);
      disposeBucket.add(result);
      return result;
    } else {
      const child = new InstantiationService(void 0, this._strict, this, this._enableTracing);
      child._globalGraphImplicitDependency = String(id);
      const earlyListeners = /* @__PURE__ */ new Map();
      const idle = new GlobalIdleValue(() => {
        const result = child._createInstance(ctor, args, _trace);
        for (const [key, values] of earlyListeners) {
          const candidate = result[key];
          if (typeof candidate === "function") {
            for (const value of values) {
              value.disposable = candidate.apply(result, value.listener);
            }
          }
        }
        earlyListeners.clear();
        disposeBucket.add(result);
        return result;
      });
      return new Proxy(/* @__PURE__ */ Object.create(null), {
        get(target, key) {
          if (!idle.isInitialized) {
            if (typeof key === "string" && (key.startsWith("onDid") || key.startsWith("onWill"))) {
              let list = earlyListeners.get(key);
              if (!list) {
                list = new LinkedList();
                earlyListeners.set(key, list);
              }
              const event = (callback, thisArg, disposables) => {
                if (idle.isInitialized) {
                  return idle.value[key](callback, thisArg, disposables);
                } else {
                  const entry = { listener: [callback, thisArg, disposables], disposable: void 0 };
                  const rm = list.push(entry);
                  const result = toDisposable(() => {
                    rm();
                    entry.disposable?.dispose();
                  });
                  return result;
                }
              };
              return event;
            }
          }
          if (key in target) {
            return target[key];
          }
          const obj = idle.value;
          let prop = obj[key];
          if (typeof prop !== "function") {
            return prop;
          }
          prop = prop.bind(obj);
          target[key] = prop;
          return prop;
        },
        set(_target, p, value) {
          idle.value[p] = value;
          return true;
        },
        getPrototypeOf(_target) {
          return ctor.prototype;
        }
      });
    }
  }
  _throwIfStrict(msg, printWarning) {
    if (printWarning) {
      console.warn(msg);
    }
    if (this._strict) {
      throw new Error(msg);
    }
  }
}
var TraceType = /* @__PURE__ */ ((TraceType2) => {
  TraceType2[TraceType2["None"] = 0] = "None";
  TraceType2[TraceType2["Creation"] = 1] = "Creation";
  TraceType2[TraceType2["Invocation"] = 2] = "Invocation";
  TraceType2[TraceType2["Branch"] = 3] = "Branch";
  return TraceType2;
})(TraceType || {});
const _Trace = class _Trace {
  constructor(type, name) {
    this.type = type;
    this.name = name;
    this._start = Date.now();
    this._dep = [];
  }
  static traceInvocation(_enableTracing, ctor) {
    return !_enableTracing ? _Trace._None : new _Trace(2 /* Invocation */, ctor.name || new Error().stack.split("\n").slice(3, 4).join("\n"));
  }
  static traceCreation(_enableTracing, ctor) {
    return !_enableTracing ? _Trace._None : new _Trace(1 /* Creation */, ctor.name);
  }
  branch(id, first) {
    const child = new _Trace(3 /* Branch */, id.toString());
    this._dep.push([id, first, child]);
    return child;
  }
  stop() {
    const dur = Date.now() - this._start;
    _Trace._totals += dur;
    let causedCreation = false;
    function printChild(n, trace) {
      const res = [];
      const prefix = new Array(n + 1).join("	");
      for (const [id, first, child] of trace._dep) {
        if (first && child) {
          causedCreation = true;
          res.push(`${prefix}CREATES -> ${id}`);
          const nested = printChild(n + 1, child);
          if (nested) {
            res.push(nested);
          }
        } else {
          res.push(`${prefix}uses -> ${id}`);
        }
      }
      return res.join("\n");
    }
    const lines = [
      `${this.type === 1 /* Creation */ ? "CREATE" : "CALL"} ${this.name}`,
      `${printChild(1, this)}`,
      `DONE, took ${dur.toFixed(2)}ms (grand total ${_Trace._totals.toFixed(2)}ms)`
    ];
    if (dur > 2 || causedCreation) {
      _Trace.all.add(lines.join("\n"));
    }
  }
};
_Trace.all = /* @__PURE__ */ new Set();
_Trace._None = new class extends _Trace {
  constructor() {
    super(0 /* None */, null);
  }
  stop() {
  }
  branch() {
    return this;
  }
}();
_Trace._totals = 0;
let Trace = _Trace;
export {
  InstantiationService,
  Trace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcaW5zdGFudGlhdGlvblxcY29tbW9uXFxpbnN0YW50aWF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEdsb2JhbElkbGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaWxsZWdhbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yLCBTeW5jRGVzY3JpcHRvcjAgfSBmcm9tICcuL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEdyYXBoIH0gZnJvbSAnLi9ncmFwaC5qcyc7XG5pbXBvcnQgeyBHZXRMZWFkaW5nTm9uU2VydmljZUFyZ3MsIElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZUlkZW50aWZpZXIsIFNlcnZpY2VzQWNjZXNzb3IsIF91dGlsIH0gZnJvbSAnLi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5cbi8vIFRSQUNJTkdcbmNvbnN0IF9lbmFibGVBbGxUcmFjaW5nID0gZmFsc2Vcblx0Ly8gfHwgXCJUUlVFXCIgLy8gRE8gTk9UIENIRUNLIElOIVxuXHQ7XG5cbmNsYXNzIEN5Y2xpY0RlcGVuZGVuY3lFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoZ3JhcGg6IEdyYXBoPGFueT4pIHtcblx0XHRzdXBlcignY3ljbGljIGRlcGVuZGVuY3kgYmV0d2VlbiBzZXJ2aWNlcycpO1xuXHRcdHRoaXMubWVzc2FnZSA9IGdyYXBoLmZpbmRDeWNsZVNsb3coKSA/PyBgVU5BQkxFIHRvIGRldGVjdCBjeWNsZSwgZHVtcGluZyBncmFwaDogXFxuJHtncmFwaC50b1N0cmluZygpfWA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbnRpYXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBfZ2xvYmFsR3JhcGg/OiBHcmFwaDxzdHJpbmc+O1xuXHRwcml2YXRlIF9nbG9iYWxHcmFwaEltcGxpY2l0RGVwZW5kZW5jeT86IHN0cmluZztcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZpY2VzVG9NYXliZURpc3Bvc2UgPSBuZXcgU2V0PGFueT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hpbGRyZW4gPSBuZXcgU2V0PEluc3RhbnRpYXRpb25TZXJ2aWNlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZpY2VzOiBTZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0cmljdDogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudD86IEluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZVRyYWNpbmc6IGJvb2xlYW4gPSBfZW5hYmxlQWxsVHJhY2luZ1xuXHQpIHtcblxuXHRcdHRoaXMuX3NlcnZpY2VzLnNldChJSW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMpO1xuXHRcdHRoaXMuX2dsb2JhbEdyYXBoID0gX2VuYWJsZVRyYWNpbmcgPyBfcGFyZW50Py5fZ2xvYmFsR3JhcGggPz8gbmV3IEdyYXBoKGUgPT4gZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0XHQvLyBkaXNwb3NlIGFsbCBjaGlsZCBzZXJ2aWNlc1xuXHRcdFx0ZGlzcG9zZSh0aGlzLl9jaGlsZHJlbik7XG5cdFx0XHR0aGlzLl9jaGlsZHJlbi5jbGVhcigpO1xuXG5cdFx0XHQvLyBkaXNwb3NlIGFsbCBzZXJ2aWNlcyBjcmVhdGVkIGJ5IHRoaXMgc2VydmljZVxuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdGhpcy5fc2VydmljZXNUb01heWJlRGlzcG9zZSkge1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NhYmxlKGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0XHRjYW5kaWRhdGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXJ2aWNlc1RvTWF5YmVEaXNwb3NlLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdGhyb3dJZkRpc3Bvc2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0luc3RhbnRpYXRpb25TZXJ2aWNlIGhhcyBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0fVxuXHR9XG5cblx0Y3JlYXRlQ2hpbGQoc2VydmljZXM6IFNlcnZpY2VDb2xsZWN0aW9uLCBzdG9yZT86IERpc3Bvc2FibGVTdG9yZSk6IElJbnN0YW50aWF0aW9uU2VydmljZSB7XG5cdFx0dGhpcy5fdGhyb3dJZkRpc3Bvc2VkKCk7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBJbnN0YW50aWF0aW9uU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0XHR0aGF0Ll9jaGlsZHJlbi5kZWxldGUocmVzdWx0KTtcblx0XHRcdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0oc2VydmljZXMsIHRoaXMuX3N0cmljdCwgdGhpcywgdGhpcy5fZW5hYmxlVHJhY2luZyk7XG5cdFx0dGhpcy5fY2hpbGRyZW4uYWRkKHJlc3VsdCk7XG5cblx0XHRzdG9yZT8uYWRkKHJlc3VsdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGludm9rZUZ1bmN0aW9uPFIsIFRTIGV4dGVuZHMgYW55W10gPSBbXT4oZm46IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogVFMpID0+IFIsIC4uLmFyZ3M6IFRTKTogUiB7XG5cdFx0dGhpcy5fdGhyb3dJZkRpc3Bvc2VkKCk7XG5cblx0XHRjb25zdCBfdHJhY2UgPSBUcmFjZS50cmFjZUludm9jYXRpb24odGhpcy5fZW5hYmxlVHJhY2luZywgZm4pO1xuXHRcdGxldCBfZG9uZSA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciA9IHtcblx0XHRcdFx0Z2V0OiA8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+KSA9PiB7XG5cblx0XHRcdFx0XHRpZiAoX2RvbmUpIHtcblx0XHRcdFx0XHRcdHRocm93IGlsbGVnYWxTdGF0ZSgnc2VydmljZSBhY2Nlc3NvciBpcyBvbmx5IHZhbGlkIGR1cmluZyB0aGUgaW52b2NhdGlvbiBvZiBpdHMgdGFyZ2V0IG1ldGhvZCcpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2dldE9yQ3JlYXRlU2VydmljZUluc3RhbmNlKGlkLCBfdHJhY2UpO1xuXHRcdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90aHJvd0lmU3RyaWN0KGBbaW52b2tlRnVuY3Rpb25dIHVua25vd24gc2VydmljZSAnJHtpZH0nYCwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIGZuKGFjY2Vzc29yLCAuLi5hcmdzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0X2RvbmUgPSB0cnVlO1xuXHRcdFx0X3RyYWNlLnN0b3AoKTtcblx0XHR9XG5cdH1cblxuXHRjcmVhdGVJbnN0YW5jZTxUPihkZXNjcmlwdG9yOiBTeW5jRGVzY3JpcHRvcjA8VD4pOiBUO1xuXHRjcmVhdGVJbnN0YW5jZTxDdG9yIGV4dGVuZHMgbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gdW5rbm93biwgUiBleHRlbmRzIEluc3RhbmNlVHlwZTxDdG9yPj4oY3RvcjogQ3RvciwgLi4uYXJnczogR2V0TGVhZGluZ05vblNlcnZpY2VBcmdzPENvbnN0cnVjdG9yUGFyYW1ldGVyczxDdG9yPj4pOiBSO1xuXHRjcmVhdGVJbnN0YW5jZShjdG9yT3JEZXNjcmlwdG9yOiBhbnkgfCBTeW5jRGVzY3JpcHRvcjxhbnk+LCAuLi5yZXN0OiB1bmtub3duW10pOiB1bmtub3duIHtcblx0XHR0aGlzLl90aHJvd0lmRGlzcG9zZWQoKTtcblxuXHRcdGxldCBfdHJhY2U6IFRyYWNlO1xuXHRcdGxldCByZXN1bHQ6IHVua25vd247XG5cdFx0aWYgKGN0b3JPckRlc2NyaXB0b3IgaW5zdGFuY2VvZiBTeW5jRGVzY3JpcHRvcikge1xuXHRcdFx0X3RyYWNlID0gVHJhY2UudHJhY2VDcmVhdGlvbih0aGlzLl9lbmFibGVUcmFjaW5nLCBjdG9yT3JEZXNjcmlwdG9yLmN0b3IpO1xuXHRcdFx0cmVzdWx0ID0gdGhpcy5fY3JlYXRlSW5zdGFuY2UoY3Rvck9yRGVzY3JpcHRvci5jdG9yLCBjdG9yT3JEZXNjcmlwdG9yLnN0YXRpY0FyZ3VtZW50cy5jb25jYXQocmVzdCksIF90cmFjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdF90cmFjZSA9IFRyYWNlLnRyYWNlQ3JlYXRpb24odGhpcy5fZW5hYmxlVHJhY2luZywgY3Rvck9yRGVzY3JpcHRvcik7XG5cdFx0XHRyZXN1bHQgPSB0aGlzLl9jcmVhdGVJbnN0YW5jZShjdG9yT3JEZXNjcmlwdG9yLCByZXN0LCBfdHJhY2UpO1xuXHRcdH1cblx0XHRfdHJhY2Uuc3RvcCgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVJbnN0YW5jZTxUPihjdG9yOiBhbnksIGFyZ3M6IHVua25vd25bXSA9IFtdLCBfdHJhY2U6IFRyYWNlKTogVCB7XG5cblx0XHQvLyBhcmd1bWVudHMgZGVmaW5lZCBieSBzZXJ2aWNlIGRlY29yYXRvcnNcblx0XHRjb25zdCBzZXJ2aWNlRGVwZW5kZW5jaWVzID0gX3V0aWwuZ2V0U2VydmljZURlcGVuZGVuY2llcyhjdG9yKS5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG5cdFx0Y29uc3Qgc2VydmljZUFyZ3M6IHVua25vd25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGVwZW5kZW5jeSBvZiBzZXJ2aWNlRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gdGhpcy5fZ2V0T3JDcmVhdGVTZXJ2aWNlSW5zdGFuY2UoZGVwZW5kZW5jeS5pZCwgX3RyYWNlKTtcblx0XHRcdGlmICghc2VydmljZSkge1xuXHRcdFx0XHR0aGlzLl90aHJvd0lmU3RyaWN0KGBbY3JlYXRlSW5zdGFuY2VdICR7Y3Rvci5uYW1lfSBkZXBlbmRzIG9uIFVOS05PV04gc2VydmljZSAke2RlcGVuZGVuY3kuaWR9LmAsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHNlcnZpY2VBcmdzLnB1c2goc2VydmljZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlQXJnUG9zID0gc2VydmljZURlcGVuZGVuY2llcy5sZW5ndGggPiAwID8gc2VydmljZURlcGVuZGVuY2llc1swXS5pbmRleCA6IGFyZ3MubGVuZ3RoO1xuXG5cdFx0Ly8gY2hlY2sgZm9yIGFyZ3VtZW50IG1pc21hdGNoZXMsIGFkanVzdCBzdGF0aWMgYXJncyBpZiBuZWVkZWRcblx0XHRpZiAoYXJncy5sZW5ndGggIT09IGZpcnN0U2VydmljZUFyZ1Bvcykge1xuXHRcdFx0Y29uc29sZS50cmFjZShgW2NyZWF0ZUluc3RhbmNlXSBGaXJzdCBzZXJ2aWNlIGRlcGVuZGVuY3kgb2YgJHtjdG9yLm5hbWV9IGF0IHBvc2l0aW9uICR7Zmlyc3RTZXJ2aWNlQXJnUG9zICsgMX0gY29uZmxpY3RzIHdpdGggJHthcmdzLmxlbmd0aH0gc3RhdGljIGFyZ3VtZW50c2ApO1xuXG5cdFx0XHRjb25zdCBkZWx0YSA9IGZpcnN0U2VydmljZUFyZ1BvcyAtIGFyZ3MubGVuZ3RoO1xuXHRcdFx0aWYgKGRlbHRhID4gMCkge1xuXHRcdFx0XHRhcmdzID0gYXJncy5jb25jYXQobmV3IEFycmF5KGRlbHRhKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhcmdzID0gYXJncy5zbGljZSgwLCBmaXJzdFNlcnZpY2VBcmdQb3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG5vdyBjcmVhdGUgdGhlIGluc3RhbmNlXG5cdFx0cmV0dXJuIFJlZmxlY3QuY29uc3RydWN0PGFueSwgVD4oY3RvciwgYXJncy5jb25jYXQoc2VydmljZUFyZ3MpKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldENyZWF0ZWRTZXJ2aWNlSW5zdGFuY2U8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBpbnN0YW5jZTogVCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZXJ2aWNlcy5nZXQoaWQpIGluc3RhbmNlb2YgU3luY0Rlc2NyaXB0b3IpIHtcblx0XHRcdHRoaXMuX3NlcnZpY2VzLnNldChpZCwgaW5zdGFuY2UpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fcGFyZW50KSB7XG5cdFx0XHR0aGlzLl9wYXJlbnQuX3NldENyZWF0ZWRTZXJ2aWNlSW5zdGFuY2UoaWQsIGluc3RhbmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbGxlZ2FsU3RhdGUgLSBzZXR0aW5nIFVOS05PV04gc2VydmljZSBpbnN0YW5jZScpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFNlcnZpY2VJbnN0YW5jZU9yRGVzY3JpcHRvcjxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4pOiBUIHwgU3luY0Rlc2NyaXB0b3I8VD4ge1xuXHRcdGNvbnN0IGluc3RhbmNlT3JEZXNjID0gdGhpcy5fc2VydmljZXMuZ2V0KGlkKTtcblx0XHRpZiAoIWluc3RhbmNlT3JEZXNjICYmIHRoaXMuX3BhcmVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5fZ2V0U2VydmljZUluc3RhbmNlT3JEZXNjcmlwdG9yKGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGluc3RhbmNlT3JEZXNjO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0T3JDcmVhdGVTZXJ2aWNlSW5zdGFuY2U8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBfdHJhY2U6IFRyYWNlKTogVCB7XG5cdFx0aWYgKHRoaXMuX2dsb2JhbEdyYXBoICYmIHRoaXMuX2dsb2JhbEdyYXBoSW1wbGljaXREZXBlbmRlbmN5KSB7XG5cdFx0XHR0aGlzLl9nbG9iYWxHcmFwaC5pbnNlcnRFZGdlKHRoaXMuX2dsb2JhbEdyYXBoSW1wbGljaXREZXBlbmRlbmN5LCBTdHJpbmcoaWQpKTtcblx0XHR9XG5cdFx0Y29uc3QgdGhpbmcgPSB0aGlzLl9nZXRTZXJ2aWNlSW5zdGFuY2VPckRlc2NyaXB0b3IoaWQpO1xuXHRcdGlmICh0aGluZyBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2FmZUNyZWF0ZUFuZENhY2hlU2VydmljZUluc3RhbmNlKGlkLCB0aGluZywgX3RyYWNlLmJyYW5jaChpZCwgdHJ1ZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRfdHJhY2UuYnJhbmNoKGlkLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gdGhpbmc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlSW5zdGFudGlhdGlvbnMgPSBuZXcgU2V0PFNlcnZpY2VJZGVudGlmaWVyPGFueT4+KCk7XG5cblxuXHRwcml2YXRlIF9zYWZlQ3JlYXRlQW5kQ2FjaGVTZXJ2aWNlSW5zdGFuY2U8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBkZXNjOiBTeW5jRGVzY3JpcHRvcjxUPiwgX3RyYWNlOiBUcmFjZSk6IFQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmVJbnN0YW50aWF0aW9ucy5oYXMoaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGlsbGVnYWwgc3RhdGUgLSBSRUNVUlNJVkVMWSBpbnN0YW50aWF0aW5nIHNlcnZpY2UgJyR7aWR9J2ApO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVJbnN0YW50aWF0aW9ucy5hZGQoaWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQW5kQ2FjaGVTZXJ2aWNlSW5zdGFuY2UoaWQsIGRlc2MsIF90cmFjZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2FjdGl2ZUluc3RhbnRpYXRpb25zLmRlbGV0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQW5kQ2FjaGVTZXJ2aWNlSW5zdGFuY2U8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBkZXNjOiBTeW5jRGVzY3JpcHRvcjxUPiwgX3RyYWNlOiBUcmFjZSk6IFQge1xuXG5cdFx0dHlwZSBUcmlwbGUgPSB7IGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxhbnk+OyBkZXNjOiBTeW5jRGVzY3JpcHRvcjxhbnk+OyBfdHJhY2U6IFRyYWNlIH07XG5cdFx0Y29uc3QgZ3JhcGggPSBuZXcgR3JhcGg8VHJpcGxlPihkYXRhID0+IGRhdGEuaWQudG9TdHJpbmcoKSk7XG5cblx0XHRsZXQgY3ljbGVDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3RhY2sgPSBbeyBpZCwgZGVzYywgX3RyYWNlIH1dO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gc3RhY2sucG9wKCkhO1xuXG5cdFx0XHRpZiAoc2Vlbi5oYXMoU3RyaW5nKGl0ZW0uaWQpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHNlZW4uYWRkKFN0cmluZyhpdGVtLmlkKSk7XG5cblx0XHRcdGdyYXBoLmxvb2t1cE9ySW5zZXJ0Tm9kZShpdGVtKTtcblxuXHRcdFx0Ly8gYSB3ZWFrIGJ1dCB3b3JraW5nIGhldXJpc3RpYyBmb3IgY3ljbGUgY2hlY2tzXG5cdFx0XHRpZiAoY3ljbGVDb3VudCsrID4gMTAwMCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ3ljbGljRGVwZW5kZW5jeUVycm9yKGdyYXBoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY2hlY2sgYWxsIGRlcGVuZGVuY2llcyBmb3IgZXhpc3RlbmNlIGFuZCBpZiB0aGV5IG5lZWQgdG8gYmUgY3JlYXRlZCBmaXJzdFxuXHRcdFx0Zm9yIChjb25zdCBkZXBlbmRlbmN5IG9mIF91dGlsLmdldFNlcnZpY2VEZXBlbmRlbmNpZXMoaXRlbS5kZXNjLmN0b3IpKSB7XG5cblx0XHRcdFx0Y29uc3QgaW5zdGFuY2VPckRlc2MgPSB0aGlzLl9nZXRTZXJ2aWNlSW5zdGFuY2VPckRlc2NyaXB0b3IoZGVwZW5kZW5jeS5pZCk7XG5cdFx0XHRcdGlmICghaW5zdGFuY2VPckRlc2MpIHtcblx0XHRcdFx0XHR0aGlzLl90aHJvd0lmU3RyaWN0KGBbY3JlYXRlSW5zdGFuY2VdICR7aWR9IGRlcGVuZHMgb24gJHtkZXBlbmRlbmN5LmlkfSB3aGljaCBpcyBOT1QgcmVnaXN0ZXJlZC5gLCB0cnVlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHRha2Ugbm90ZSBvZiBhbGwgc2VydmljZSBkZXBlbmRlbmNpZXNcblx0XHRcdFx0dGhpcy5fZ2xvYmFsR3JhcGg/Lmluc2VydEVkZ2UoU3RyaW5nKGl0ZW0uaWQpLCBTdHJpbmcoZGVwZW5kZW5jeS5pZCkpO1xuXG5cdFx0XHRcdGlmIChpbnN0YW5jZU9yRGVzYyBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgZCA9IHsgaWQ6IGRlcGVuZGVuY3kuaWQsIGRlc2M6IGluc3RhbmNlT3JEZXNjLCBfdHJhY2U6IGl0ZW0uX3RyYWNlLmJyYW5jaChkZXBlbmRlbmN5LmlkLCB0cnVlKSB9O1xuXHRcdFx0XHRcdGdyYXBoLmluc2VydEVkZ2UoaXRlbSwgZCk7XG5cdFx0XHRcdFx0c3RhY2sucHVzaChkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCByb290cyA9IGdyYXBoLnJvb3RzKCk7XG5cblx0XHRcdC8vIGlmIHRoZXJlIGlzIG5vIG1vcmUgcm9vdHMgYnV0IHN0aWxsXG5cdFx0XHQvLyBub2RlcyBpbiB0aGUgZ3JhcGggd2UgaGF2ZSBhIGN5Y2xlXG5cdFx0XHRpZiAocm9vdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGlmICghZ3JhcGguaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEN5Y2xpY0RlcGVuZGVuY3lFcnJvcihncmFwaCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgeyBkYXRhIH0gb2Ygcm9vdHMpIHtcblx0XHRcdFx0Ly8gUmVwZWF0IHRoZSBjaGVjayBmb3IgdGhpcyBzdGlsbCBiZWluZyBhIHNlcnZpY2Ugc3luYyBkZXNjcmlwdG9yLiBUaGF0J3MgYmVjYXVzZVxuXHRcdFx0XHQvLyBpbnN0YW50aWF0aW5nIGEgZGVwZW5kZW5jeSBtaWdodCBoYXZlIHNpZGUtZWZmZWN0IGFuZCByZWN1cnNpdmVseSB0cmlnZ2VyIGluc3RhbnRpYXRpb25cblx0XHRcdFx0Ly8gc28gdGhhdCBzb21lIGRlcGVuZGVuY2llcyBhcmUgbm93IGZ1bGxmaWxsZWQgYWxyZWFkeS5cblx0XHRcdFx0Y29uc3QgaW5zdGFuY2VPckRlc2MgPSB0aGlzLl9nZXRTZXJ2aWNlSW5zdGFuY2VPckRlc2NyaXB0b3IoZGF0YS5pZCk7XG5cdFx0XHRcdGlmIChpbnN0YW5jZU9yRGVzYyBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0Ly8gY3JlYXRlIGluc3RhbmNlIGFuZCBvdmVyd3JpdGUgdGhlIHNlcnZpY2UgY29sbGVjdGlvbnNcblx0XHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX2NyZWF0ZVNlcnZpY2VJbnN0YW5jZVdpdGhPd25lcihkYXRhLmlkLCBkYXRhLmRlc2MuY3RvciwgZGF0YS5kZXNjLnN0YXRpY0FyZ3VtZW50cywgZGF0YS5kZXNjLnN1cHBvcnRzRGVsYXllZEluc3RhbnRpYXRpb24sIGRhdGEuX3RyYWNlKTtcblx0XHRcdFx0XHR0aGlzLl9zZXRDcmVhdGVkU2VydmljZUluc3RhbmNlKGRhdGEuaWQsIGluc3RhbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRncmFwaC5yZW1vdmVOb2RlKGRhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gPFQ+dGhpcy5fZ2V0U2VydmljZUluc3RhbmNlT3JEZXNjcmlwdG9yKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNlcnZpY2VJbnN0YW5jZVdpdGhPd25lcjxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGN0b3I6IGFueSwgYXJnczogdW5rbm93bltdID0gW10sIHN1cHBvcnRzRGVsYXllZEluc3RhbnRpYXRpb246IGJvb2xlYW4sIF90cmFjZTogVHJhY2UpOiBUIHtcblx0XHRpZiAodGhpcy5fc2VydmljZXMuZ2V0KGlkKSBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlU2VydmljZUluc3RhbmNlKGlkLCBjdG9yLCBhcmdzLCBzdXBwb3J0c0RlbGF5ZWRJbnN0YW50aWF0aW9uLCBfdHJhY2UsIHRoaXMuX3NlcnZpY2VzVG9NYXliZURpc3Bvc2UpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fcGFyZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyZW50Ll9jcmVhdGVTZXJ2aWNlSW5zdGFuY2VXaXRoT3duZXIoaWQsIGN0b3IsIGFyZ3MsIHN1cHBvcnRzRGVsYXllZEluc3RhbnRpYXRpb24sIF90cmFjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgaWxsZWdhbFN0YXRlIC0gY3JlYXRpbmcgVU5LTk9XTiBzZXJ2aWNlIGluc3RhbmNlICR7Y3Rvci5uYW1lfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNlcnZpY2VJbnN0YW5jZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGN0b3I6IGFueSwgYXJnczogdW5rbm93bltdID0gW10sIHN1cHBvcnRzRGVsYXllZEluc3RhbnRpYXRpb246IGJvb2xlYW4sIF90cmFjZTogVHJhY2UsIGRpc3Bvc2VCdWNrZXQ6IFNldDxhbnk+KTogVCB7XG5cdFx0aWYgKCFzdXBwb3J0c0RlbGF5ZWRJbnN0YW50aWF0aW9uKSB7XG5cdFx0XHQvLyBlYWdlciBpbnN0YW50aWF0aW9uXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jcmVhdGVJbnN0YW5jZTxUPihjdG9yLCBhcmdzLCBfdHJhY2UpO1xuXHRcdFx0ZGlzcG9zZUJ1Y2tldC5hZGQocmVzdWx0KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCB0aGlzLl9zdHJpY3QsIHRoaXMsIHRoaXMuX2VuYWJsZVRyYWNpbmcpO1xuXHRcdFx0Y2hpbGQuX2dsb2JhbEdyYXBoSW1wbGljaXREZXBlbmRlbmN5ID0gU3RyaW5nKGlkKTtcblxuXHRcdFx0dHlwZSBFYXJ5TGlzdGVuZXJEYXRhID0ge1xuXHRcdFx0XHRsaXN0ZW5lcjogUGFyYW1ldGVyczxFdmVudDxhbnk+Pjtcblx0XHRcdFx0ZGlzcG9zYWJsZT86IElEaXNwb3NhYmxlO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gUmV0dXJuIGEgcHJveHkgb2JqZWN0IHRoYXQncyBiYWNrZWQgYnkgYW4gaWRsZSB2YWx1ZS4gVGhhdFxuXHRcdFx0Ly8gc3RyYXRlZ3kgaXMgdG8gaW5zdGFudGlhdGUgc2VydmljZXMgaW4gb3VyIGlkbGUgdGltZSBvciB3aGVuIGFjdHVhbGx5XG5cdFx0XHQvLyBuZWVkZWQgYnV0IG5vdCB3aGVuIGluamVjdGVkIGludG8gYSBjb25zdW1lclxuXG5cdFx0XHQvLyByZXR1cm4gXCJlbXB0eSBldmVudHNcIiB3aGVuIHRoZSBzZXJ2aWNlIGlzbid0IGluc3RhbnRpYXRlZCB5ZXRcblx0XHRcdGNvbnN0IGVhcmx5TGlzdGVuZXJzID0gbmV3IE1hcDxzdHJpbmcsIExpbmtlZExpc3Q8RWFyeUxpc3RlbmVyRGF0YT4+KCk7XG5cblx0XHRcdGNvbnN0IGlkbGUgPSBuZXcgR2xvYmFsSWRsZVZhbHVlPGFueT4oKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBjaGlsZC5fY3JlYXRlSW5zdGFuY2U8VD4oY3RvciwgYXJncywgX3RyYWNlKTtcblxuXHRcdFx0XHQvLyBlYXJseSBsaXN0ZW5lcnMgdGhhdCB3ZSBrZXB0IGFyZSBub3cgYmVpbmcgc3Vic2NyaWJlZCB0b1xuXHRcdFx0XHQvLyB0aGUgcmVhbCBzZXJ2aWNlXG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVzXSBvZiBlYXJseUxpc3RlbmVycykge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IDxFdmVudDxhbnk+Pig8YW55PnJlc3VsdClba2V5XTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGNhbmRpZGF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRcdFx0dmFsdWUuZGlzcG9zYWJsZSA9IGNhbmRpZGF0ZS5hcHBseShyZXN1bHQsIHZhbHVlLmxpc3RlbmVyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWFybHlMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdFx0ZGlzcG9zZUJ1Y2tldC5hZGQocmVzdWx0KTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIDxUPm5ldyBQcm94eShPYmplY3QuY3JlYXRlKG51bGwpLCB7XG5cdFx0XHRcdGdldCh0YXJnZXQ6IGFueSwga2V5OiBQcm9wZXJ0eUtleSk6IHVua25vd24ge1xuXG5cdFx0XHRcdFx0aWYgKCFpZGxlLmlzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0XHRcdC8vIGxvb2tzIGxpa2UgYW4gZXZlbnRcblx0XHRcdFx0XHRcdGlmICh0eXBlb2Yga2V5ID09PSAnc3RyaW5nJyAmJiAoa2V5LnN0YXJ0c1dpdGgoJ29uRGlkJykgfHwga2V5LnN0YXJ0c1dpdGgoJ29uV2lsbCcpKSkge1xuXHRcdFx0XHRcdFx0XHRsZXQgbGlzdCA9IGVhcmx5TGlzdGVuZXJzLmdldChrZXkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0XHRcdFx0XHRsaXN0ID0gbmV3IExpbmtlZExpc3QoKTtcblx0XHRcdFx0XHRcdFx0XHRlYXJseUxpc3RlbmVycy5zZXQoa2V5LCBsaXN0KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBldmVudDogRXZlbnQ8YW55PiA9IChjYWxsYmFjaywgdGhpc0FyZywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaWRsZS5pc0luaXRpYWxpemVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gaWRsZS52YWx1ZVtrZXldKGNhbGxiYWNrLCB0aGlzQXJnLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGVudHJ5OiBFYXJ5TGlzdGVuZXJEYXRhID0geyBsaXN0ZW5lcjogW2NhbGxiYWNrLCB0aGlzQXJnLCBkaXNwb3NhYmxlc10sIGRpc3Bvc2FibGU6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgcm0gPSBsaXN0LnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cm0oKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZW50cnkuZGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGV2ZW50O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIHZhbHVlIGFscmVhZHkgZXhpc3RzXG5cdFx0XHRcdFx0aWYgKGtleSBpbiB0YXJnZXQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0YXJnZXRba2V5XTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBjcmVhdGUgdmFsdWVcblx0XHRcdFx0XHRjb25zdCBvYmogPSBpZGxlLnZhbHVlO1xuXHRcdFx0XHRcdGxldCBwcm9wID0gb2JqW2tleV07XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcHJvcDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJvcCA9IHByb3AuYmluZChvYmopO1xuXHRcdFx0XHRcdHRhcmdldFtrZXldID0gcHJvcDtcblx0XHRcdFx0XHRyZXR1cm4gcHJvcDtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0KF90YXJnZXQ6IFQsIHA6IFByb3BlcnR5S2V5LCB2YWx1ZTogYW55KTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0aWRsZS52YWx1ZVtwXSA9IHZhbHVlO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRQcm90b3R5cGVPZihfdGFyZ2V0OiBUKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGN0b3IucHJvdG90eXBlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90aHJvd0lmU3RyaWN0KG1zZzogc3RyaW5nLCBwcmludFdhcm5pbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAocHJpbnRXYXJuaW5nKSB7XG5cdFx0XHRjb25zb2xlLndhcm4obXNnKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0cmljdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKG1zZyk7XG5cdFx0fVxuXHR9XG59XG5cbi8vI3JlZ2lvbiAtLSB0cmFjaW5nIC0tLVxuXG5jb25zdCBlbnVtIFRyYWNlVHlwZSB7XG5cdE5vbmUgPSAwLFxuXHRDcmVhdGlvbiA9IDEsXG5cdEludm9jYXRpb24gPSAyLFxuXHRCcmFuY2ggPSAzLFxufVxuXG5leHBvcnQgY2xhc3MgVHJhY2Uge1xuXG5cdHN0YXRpYyBhbGwgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTm9uZSA9IG5ldyBjbGFzcyBleHRlbmRzIFRyYWNlIHtcblx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoVHJhY2VUeXBlLk5vbmUsIG51bGwpOyB9XG5cdFx0b3ZlcnJpZGUgc3RvcCgpIHsgfVxuXHRcdG92ZXJyaWRlIGJyYW5jaCgpIHsgcmV0dXJuIHRoaXM7IH1cblx0fTtcblxuXHRzdGF0aWMgdHJhY2VJbnZvY2F0aW9uKF9lbmFibGVUcmFjaW5nOiBib29sZWFuLCBjdG9yOiBhbnkpOiBUcmFjZSB7XG5cdFx0cmV0dXJuICFfZW5hYmxlVHJhY2luZyA/IFRyYWNlLl9Ob25lIDogbmV3IFRyYWNlKFRyYWNlVHlwZS5JbnZvY2F0aW9uLCBjdG9yLm5hbWUgfHwgbmV3IEVycm9yKCkuc3RhY2shLnNwbGl0KCdcXG4nKS5zbGljZSgzLCA0KS5qb2luKCdcXG4nKSk7XG5cdH1cblxuXHRzdGF0aWMgdHJhY2VDcmVhdGlvbihfZW5hYmxlVHJhY2luZzogYm9vbGVhbiwgY3RvcjogYW55KTogVHJhY2Uge1xuXHRcdHJldHVybiAhX2VuYWJsZVRyYWNpbmcgPyBUcmFjZS5fTm9uZSA6IG5ldyBUcmFjZShUcmFjZVR5cGUuQ3JlYXRpb24sIGN0b3IubmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfdG90YWxzOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydDogbnVtYmVyID0gRGF0ZS5ub3coKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVwOiBbU2VydmljZUlkZW50aWZpZXI8YW55PiwgYm9vbGVhbiwgVHJhY2U/XVtdID0gW107XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB0eXBlOiBUcmFjZVR5cGUsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nIHwgbnVsbFxuXHQpIHsgfVxuXG5cdGJyYW5jaChpZDogU2VydmljZUlkZW50aWZpZXI8YW55PiwgZmlyc3Q6IGJvb2xlYW4pOiBUcmFjZSB7XG5cdFx0Y29uc3QgY2hpbGQgPSBuZXcgVHJhY2UoVHJhY2VUeXBlLkJyYW5jaCwgaWQudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fZGVwLnB1c2goW2lkLCBmaXJzdCwgY2hpbGRdKTtcblx0XHRyZXR1cm4gY2hpbGQ7XG5cdH1cblxuXHRzdG9wKCkge1xuXHRcdGNvbnN0IGR1ciA9IERhdGUubm93KCkgLSB0aGlzLl9zdGFydDtcblx0XHRUcmFjZS5fdG90YWxzICs9IGR1cjtcblxuXHRcdGxldCBjYXVzZWRDcmVhdGlvbiA9IGZhbHNlO1xuXG5cdFx0ZnVuY3Rpb24gcHJpbnRDaGlsZChuOiBudW1iZXIsIHRyYWNlOiBUcmFjZSkge1xuXHRcdFx0Y29uc3QgcmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcHJlZml4ID0gbmV3IEFycmF5KG4gKyAxKS5qb2luKCdcXHQnKTtcblx0XHRcdGZvciAoY29uc3QgW2lkLCBmaXJzdCwgY2hpbGRdIG9mIHRyYWNlLl9kZXApIHtcblx0XHRcdFx0aWYgKGZpcnN0ICYmIGNoaWxkKSB7XG5cdFx0XHRcdFx0Y2F1c2VkQ3JlYXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdHJlcy5wdXNoKGAke3ByZWZpeH1DUkVBVEVTIC0+ICR7aWR9YCk7XG5cdFx0XHRcdFx0Y29uc3QgbmVzdGVkID0gcHJpbnRDaGlsZChuICsgMSwgY2hpbGQpO1xuXHRcdFx0XHRcdGlmIChuZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJlcy5wdXNoKG5lc3RlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlcy5wdXNoKGAke3ByZWZpeH11c2VzIC0+ICR7aWR9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXMuam9pbignXFxuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRgJHt0aGlzLnR5cGUgPT09IFRyYWNlVHlwZS5DcmVhdGlvbiA/ICdDUkVBVEUnIDogJ0NBTEwnfSAke3RoaXMubmFtZX1gLFxuXHRcdFx0YCR7cHJpbnRDaGlsZCgxLCB0aGlzKX1gLFxuXHRcdFx0YERPTkUsIHRvb2sgJHtkdXIudG9GaXhlZCgyKX1tcyAoZ3JhbmQgdG90YWwgJHtUcmFjZS5fdG90YWxzLnRvRml4ZWQoMil9bXMpYFxuXHRcdF07XG5cblx0XHRpZiAoZHVyID4gMiB8fCBjYXVzZWRDcmVhdGlvbikge1xuXHRcdFx0VHJhY2UuYWxsLmFkZChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBMEIsU0FBc0IsY0FBYyxvQkFBb0I7QUFDbEYsU0FBUyxzQkFBdUM7QUFDaEQsU0FBUyxhQUFhO0FBQ3RCLFNBQW1DLHVCQUE0RCxhQUFhO0FBQzVHLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBRzNCLE1BQU0sb0JBQW9CO0FBSTFCLE1BQU0sOEJBQThCLE1BQU07QUFBQSxFQUN6QyxZQUFZLE9BQW1CO0FBQzlCLFVBQU0sb0NBQW9DO0FBQzFDLFNBQUssVUFBVSxNQUFNLGNBQWMsS0FBSztBQUFBLEVBQTRDLE1BQU0sU0FBUyxDQUFDO0FBQUEsRUFDckc7QUFDRDtBQUVPLE1BQU0scUJBQXNEO0FBQUEsRUFXbEUsWUFDa0IsWUFBK0IsSUFBSSxrQkFBa0IsR0FDckQsVUFBbUIsT0FDbkIsU0FDQSxpQkFBMEIsbUJBQzFDO0FBSmdCO0FBQ0E7QUFDQTtBQUNBO0FBUmxCLFNBQVEsY0FBYztBQUN0QixTQUFpQiwwQkFBMEIsb0JBQUksSUFBUztBQUN4RCxTQUFpQixZQUFZ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dUI7QUFDekQsVUFBTSxRQUFRLElBQUksT0FBTSxnQkFBa0IsR0FBRyxTQUFTLENBQUM7QUFDdkQsU0FBSyxLQUFLLEtBQUssQ0FBQyxJQUFJLE9BQU8sS0FBSyxDQUFDO0FBQ2pDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFPO0FBQ04sVUFBTSxNQUFNLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFDOUIsV0FBTSxXQUFXO0FBRWpCLFFBQUksaUJBQWlCO0FBRXJCLGFBQVMsV0FBVyxHQUFXLE9BQWM7QUFDNUMsWUFBTSxNQUFnQixDQUFDO0FBQ3ZCLFlBQU0sU0FBUyxJQUFJLE1BQU0sSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFJO0FBQ3pDLGlCQUFXLENBQUMsSUFBSSxPQUFPLEtBQUssS0FBSyxNQUFNLE1BQU07QUFDNUMsWUFBSSxTQUFTLE9BQU87QUFDbkIsMkJBQWlCO0FBQ2pCLGNBQUksS0FBSyxHQUFHLE1BQU0sY0FBYyxFQUFFLEVBQUU7QUFDcEMsZ0JBQU0sU0FBUyxXQUFXLElBQUksR0FBRyxLQUFLO0FBQ3RDLGNBQUksUUFBUTtBQUNYLGdCQUFJLEtBQUssTUFBTTtBQUFBLFVBQ2hCO0FBQUEsUUFDRCxPQUFPO0FBQ04sY0FBSSxLQUFLLEdBQUcsTUFBTSxXQUFXLEVBQUUsRUFBRTtBQUFBLFFBQ2xDO0FBQUEsTUFDRDtBQUNBLGFBQU8sSUFBSSxLQUFLLElBQUk7QUFBQSxJQUNyQjtBQUVBLFVBQU0sUUFBUTtBQUFBLE1BQ2IsR0FBRyxLQUFLLFNBQVMsbUJBQXFCLFdBQVcsTUFBTSxJQUFJLEtBQUssSUFBSTtBQUFBLE1BQ3BFLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQztBQUFBLE1BQ3RCLGNBQWMsSUFBSSxRQUFRLENBQUMsQ0FBQyxtQkFBbUIsT0FBTSxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsSUFDeEU7QUFFQSxRQUFJLE1BQU0sS0FBSyxnQkFBZ0I7QUFDOUIsYUFBTSxJQUFJLElBQUksTUFBTSxLQUFLLElBQUksQ0FBQztBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUNEO0FBbkVhLE9BRUwsTUFBTSxvQkFBSSxJQUFZO0FBRmpCLE9BSVksUUFBUSxJQUFJLGNBQWMsT0FBTTtBQUFBLEVBQ3ZELGNBQWM7QUFBRSxVQUFNLGNBQWdCLElBQUk7QUFBQSxFQUFHO0FBQUEsRUFDcEMsT0FBTztBQUFBLEVBQUU7QUFBQSxFQUNULFNBQVM7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUNsQztBQVJZLE9Ba0JHLFVBQWtCO0FBbEIzQixJQUFNLFFBQU47IiwKICAibmFtZXMiOiBbIlRyYWNlVHlwZSJdCn0K
