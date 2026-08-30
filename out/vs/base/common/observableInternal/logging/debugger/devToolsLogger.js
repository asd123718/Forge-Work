import { AutorunObserver, AutorunState } from "../../reactions/autorunImpl.js";
import { formatValue } from "../consoleObservableLogger.js";
import { registerDebugChannel } from "./debuggerRpc.js";
import { deepAssign, deepAssignDeleteNulls, Throttler } from "./utils.js";
import { isDefined } from "../../../types.js";
import { FromEventObservable } from "../../observables/observableFromEvent.js";
import { BugIndicatingError, onUnexpectedError } from "../../../errors.js";
import { Derived, DerivedState } from "../../observables/derivedImpl.js";
import { ObservableValue } from "../../observables/observableValue.js";
import { DebugLocation } from "../../debugLocation.js";
const _DevToolsLogger = class _DevToolsLogger {
  constructor() {
    this._declarationId = 0;
    this._instanceId = 0;
    this._declarations = /* @__PURE__ */ new Map();
    this._instanceInfos = /* @__PURE__ */ new WeakMap();
    this._aliveInstances = /* @__PURE__ */ new Map();
    this._activeTransactions = /* @__PURE__ */ new Set();
    this._channel = registerDebugChannel("observableDevTools", () => {
      return {
        notifications: {
          setDeclarationIdFilter: (declarationIds) => {
          },
          logObservableValue: (observableId) => {
            console.log("logObservableValue", observableId);
          },
          flushUpdates: () => {
            this._flushUpdates();
          },
          resetUpdates: () => {
            this._pendingChanges = null;
            this._channel.api.notifications.handleChange(this._fullState, true);
          }
        },
        requests: {
          getDeclarations: () => {
            const result = {};
            for (const decl of this._declarations.values()) {
              result[decl.id] = decl;
            }
            return { decls: result };
          },
          getSummarizedInstances: () => {
            return null;
          },
          getObservableValueInfo: (instanceId) => {
            const obs = this._aliveInstances.get(instanceId);
            return {
              observers: [...obs.debugGetObservers()].map((d) => this._formatObserver(d)).filter(isDefined)
            };
          },
          getDerivedInfo: (instanceId) => {
            const d = this._aliveInstances.get(instanceId);
            return {
              dependencies: [...d.debugGetState().dependencies].map((d2) => this._formatObservable(d2)).filter(isDefined),
              observers: [...d.debugGetObservers()].map((d2) => this._formatObserver(d2)).filter(isDefined)
            };
          },
          getAutorunInfo: (instanceId) => {
            const obs = this._aliveInstances.get(instanceId);
            return {
              dependencies: [...obs.debugGetState().dependencies].map((d) => this._formatObservable(d)).filter(isDefined)
            };
          },
          getTransactionState: () => {
            return this.getTransactionState();
          },
          setValue: (instanceId, jsonValue) => {
            const obs = this._aliveInstances.get(instanceId);
            if (obs instanceof Derived) {
              obs.debugSetValue(jsonValue);
            } else if (obs instanceof ObservableValue) {
              obs.debugSetValue(jsonValue);
            } else if (obs instanceof FromEventObservable) {
              obs.debugSetValue(jsonValue);
            } else {
              throw new BugIndicatingError("Observable is not supported");
            }
            const observers = [...obs.debugGetObservers()];
            for (const d of observers) {
              d.beginUpdate(obs);
            }
            for (const d of observers) {
              d.handleChange(obs, void 0);
            }
            for (const d of observers) {
              d.endUpdate(obs);
            }
          },
          getValue: (instanceId) => {
            const obs = this._aliveInstances.get(instanceId);
            if (obs instanceof Derived) {
              return formatValue(obs.debugGetState().value, 200);
            } else if (obs instanceof ObservableValue) {
              return formatValue(obs.debugGetState().value, 200);
            }
            return void 0;
          },
          logValue: (instanceId) => {
            const obs = this._aliveInstances.get(instanceId);
            if (obs && "get" in obs) {
              console.log("Logged Value:", obs.get());
            } else {
              throw new BugIndicatingError("Observable is not supported");
            }
          },
          rerun: (instanceId) => {
            const obs = this._aliveInstances.get(instanceId);
            if (obs instanceof Derived) {
              obs.debugRecompute();
            } else if (obs instanceof AutorunObserver) {
              obs.debugRerun();
            } else {
              throw new BugIndicatingError("Observable is not supported");
            }
          }
        }
      };
    });
    this._pendingChanges = null;
    this._changeThrottler = new Throttler();
    this._fullState = {};
    this._flushUpdates = () => {
      if (this._pendingChanges !== null) {
        this._channel.api.notifications.handleChange(this._pendingChanges, false);
        this._pendingChanges = null;
      }
    };
    DebugLocation.enable();
  }
  static getInstance() {
    if (_DevToolsLogger._instance === void 0) {
      _DevToolsLogger._instance = new _DevToolsLogger();
    }
    return _DevToolsLogger._instance;
  }
  getTransactionState() {
    const affected = [];
    const txs = [...this._activeTransactions];
    if (txs.length === 0) {
      return void 0;
    }
    const observerQueue = txs.flatMap((t) => t.debugGetUpdatingObservers() ?? []).map((o) => o.observer);
    const processedObservers = /* @__PURE__ */ new Set();
    while (observerQueue.length > 0) {
      const observer = observerQueue.shift();
      if (processedObservers.has(observer)) {
        continue;
      }
      processedObservers.add(observer);
      const state = this._getInfo(observer, (d) => {
        if (!processedObservers.has(d)) {
          observerQueue.push(d);
        }
      });
      if (state) {
        affected.push(state);
      }
    }
    return { names: txs.map((t) => t.getDebugName() ?? "tx"), affected };
  }
  _getObservableInfo(observable) {
    const info = this._instanceInfos.get(observable);
    if (!info) {
      onUnexpectedError(new BugIndicatingError("No info found"));
      return void 0;
    }
    return info;
  }
  _getAutorunInfo(autorun) {
    const info = this._instanceInfos.get(autorun);
    if (!info) {
      onUnexpectedError(new BugIndicatingError("No info found"));
      return void 0;
    }
    return info;
  }
  _getInfo(observer, queue) {
    if (observer instanceof Derived) {
      const observersToUpdate = [...observer.debugGetObservers()];
      for (const o of observersToUpdate) {
        queue(o);
      }
      const info = this._getObservableInfo(observer);
      if (!info) {
        return;
      }
      const observerState = observer.debugGetState();
      const base = { name: observer.debugName, instanceId: info.instanceId, updateCount: observerState.updateCount };
      const changedDependencies = [...info.changedObservables].map((o) => this._instanceInfos.get(o)?.instanceId).filter(isDefined);
      if (observerState.isComputing) {
        return { ...base, type: "observable/derived", state: "updating", changedDependencies, initialComputation: false };
      }
      switch (observerState.state) {
        case DerivedState.initial:
          return { ...base, type: "observable/derived", state: "noValue" };
        case DerivedState.upToDate:
          return { ...base, type: "observable/derived", state: "upToDate" };
        case DerivedState.stale:
          return { ...base, type: "observable/derived", state: "stale", changedDependencies };
        case DerivedState.dependenciesMightHaveChanged:
          return { ...base, type: "observable/derived", state: "possiblyStale" };
      }
    } else if (observer instanceof AutorunObserver) {
      const info = this._getAutorunInfo(observer);
      if (!info) {
        return void 0;
      }
      const base = { name: observer.debugName, instanceId: info.instanceId, updateCount: info.updateCount };
      const changedDependencies = [...info.changedObservables].map((o) => this._instanceInfos.get(o).instanceId);
      if (observer.debugGetState().isRunning) {
        return { ...base, type: "autorun", state: "updating", changedDependencies };
      }
      switch (observer.debugGetState().state) {
        case AutorunState.upToDate:
          return { ...base, type: "autorun", state: "upToDate" };
        case AutorunState.stale:
          return { ...base, type: "autorun", state: "stale", changedDependencies };
        case AutorunState.dependenciesMightHaveChanged:
          return { ...base, type: "autorun", state: "possiblyStale" };
      }
    }
    return void 0;
  }
  _formatObservable(obs) {
    const info = this._getObservableInfo(obs);
    if (!info) {
      return void 0;
    }
    return { name: obs.debugName, instanceId: info.instanceId };
  }
  _formatObserver(obs) {
    if (obs instanceof Derived) {
      return { name: obs.toString(), instanceId: this._getObservableInfo(obs)?.instanceId };
    }
    const autorunInfo = this._getAutorunInfo(obs);
    if (autorunInfo) {
      return { name: obs.toString(), instanceId: autorunInfo.instanceId };
    }
    return void 0;
  }
  _handleChange(update) {
    deepAssignDeleteNulls(this._fullState, update);
    if (this._pendingChanges === null) {
      this._pendingChanges = update;
    } else {
      deepAssign(this._pendingChanges, update);
    }
    this._changeThrottler.throttle(this._flushUpdates, 10);
  }
  _getDeclarationId(type, location) {
    if (!location) {
      return -1;
    }
    let decInfo = this._declarations.get(location.id);
    if (decInfo === void 0) {
      decInfo = {
        id: this._declarationId++,
        type,
        url: location.fileName,
        line: location.line,
        column: location.column
      };
      this._declarations.set(location.id, decInfo);
      this._handleChange({ decls: { [decInfo.id]: decInfo } });
    }
    return decInfo.id;
  }
  handleObservableCreated(observable, location) {
    const declarationId = this._getDeclarationId("observable/value", location);
    const info = {
      declarationId,
      instanceId: this._instanceId++,
      listenerCount: 0,
      lastValue: void 0,
      updateCount: 0,
      changedObservables: /* @__PURE__ */ new Set()
    };
    this._instanceInfos.set(observable, info);
  }
  handleOnListenerCountChanged(observable, newCount) {
    const info = this._getObservableInfo(observable);
    if (!info) {
      return;
    }
    if (info.listenerCount === 0 && newCount > 0) {
      const type = observable instanceof Derived ? "observable/derived" : "observable/value";
      this._aliveInstances.set(info.instanceId, observable);
      this._handleChange({
        instances: {
          [info.instanceId]: {
            instanceId: info.instanceId,
            declarationId: info.declarationId,
            formattedValue: info.lastValue,
            type,
            name: observable.debugName
          }
        }
      });
    } else if (info.listenerCount > 0 && newCount === 0) {
      this._handleChange({
        instances: { [info.instanceId]: null }
      });
      this._aliveInstances.delete(info.instanceId);
    }
    info.listenerCount = newCount;
  }
  handleObservableUpdated(observable, changeInfo) {
    if (observable instanceof Derived) {
      this._handleDerivedRecomputed(observable, changeInfo);
      return;
    }
    const info = this._getObservableInfo(observable);
    if (info) {
      if (changeInfo.didChange) {
        info.lastValue = formatValue(changeInfo.newValue, 30);
        if (info.listenerCount > 0) {
          this._handleChange({
            instances: { [info.instanceId]: { formattedValue: info.lastValue } }
          });
        }
      }
    }
  }
  handleAutorunCreated(autorun, location) {
    const declarationId = this._getDeclarationId("autorun", location);
    const info = {
      declarationId,
      instanceId: this._instanceId++,
      updateCount: 0,
      changedObservables: /* @__PURE__ */ new Set()
    };
    this._instanceInfos.set(autorun, info);
    this._aliveInstances.set(info.instanceId, autorun);
    if (info) {
      this._handleChange({
        instances: {
          [info.instanceId]: {
            instanceId: info.instanceId,
            declarationId: info.declarationId,
            runCount: 0,
            type: "autorun",
            name: autorun.debugName
          }
        }
      });
    }
  }
  handleAutorunDisposed(autorun) {
    const info = this._getAutorunInfo(autorun);
    if (!info) {
      return;
    }
    this._handleChange({
      instances: { [info.instanceId]: null }
    });
    this._instanceInfos.delete(autorun);
    this._aliveInstances.delete(info.instanceId);
  }
  handleAutorunDependencyChanged(autorun, observable, change) {
    const info = this._getAutorunInfo(autorun);
    if (!info) {
      return;
    }
    info.changedObservables.add(observable);
  }
  handleAutorunStarted(autorun) {
  }
  handleAutorunFinished(autorun) {
    const info = this._getAutorunInfo(autorun);
    if (!info) {
      return;
    }
    info.changedObservables.clear();
    info.updateCount++;
    this._handleChange({
      instances: { [info.instanceId]: { runCount: info.updateCount } }
    });
  }
  handleDerivedDependencyChanged(derived, observable, change) {
    const info = this._getObservableInfo(derived);
    if (info) {
      info.changedObservables.add(observable);
    }
  }
  _handleDerivedRecomputed(observable, changeInfo) {
    const info = this._getObservableInfo(observable);
    if (!info) {
      return;
    }
    const formattedValue = formatValue(changeInfo.newValue, 30);
    info.updateCount++;
    info.changedObservables.clear();
    info.lastValue = formattedValue;
    if (info.listenerCount > 0) {
      this._handleChange({
        instances: { [info.instanceId]: { formattedValue, recomputationCount: info.updateCount } }
      });
    }
  }
  handleDerivedCleared(observable) {
    const info = this._getObservableInfo(observable);
    if (!info) {
      return;
    }
    info.lastValue = void 0;
    info.changedObservables.clear();
    if (info.listenerCount > 0) {
      this._handleChange({
        instances: {
          [info.instanceId]: {
            formattedValue: void 0
          }
        }
      });
    }
  }
  handleBeginTransaction(transaction) {
    this._activeTransactions.add(transaction);
  }
  handleEndTransaction(transaction) {
    this._activeTransactions.delete(transaction);
  }
};
_DevToolsLogger._instance = void 0;
let DevToolsLogger = _DevToolsLogger;
export {
  DevToolsLogger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxcbG9nZ2luZ1xcZGVidWdnZXJcXGRldlRvb2xzTG9nZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQXV0b3J1bk9ic2VydmVyLCBBdXRvcnVuU3RhdGUgfSBmcm9tICcuLi8uLi9yZWFjdGlvbnMvYXV0b3J1bkltcGwuanMnO1xuaW1wb3J0IHsgVHJhbnNhY3Rpb25JbXBsIH0gZnJvbSAnLi4vLi4vdHJhbnNhY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNoYW5nZUluZm9ybWF0aW9uLCBJT2JzZXJ2YWJsZUxvZ2dlciB9IGZyb20gJy4uL2xvZ2dpbmcuanMnO1xuaW1wb3J0IHsgZm9ybWF0VmFsdWUgfSBmcm9tICcuLi9jb25zb2xlT2JzZXJ2YWJsZUxvZ2dlci5qcyc7XG5pbXBvcnQgeyBPYnNEZWJ1Z2dlckFwaSwgSU9ic0RlY2xhcmF0aW9uLCBPYnNJbnN0YW5jZUlkLCBPYnNTdGF0ZVVwZGF0ZSwgSVRyYW5zYWN0aW9uU3RhdGUsIE9ic2VydmVySW5zdGFuY2VTdGF0ZSB9IGZyb20gJy4vZGVidWdnZXJBcGkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJEZWJ1Z0NoYW5uZWwgfSBmcm9tICcuL2RlYnVnZ2VyUnBjLmpzJztcbmltcG9ydCB7IGRlZXBBc3NpZ24sIGRlZXBBc3NpZ25EZWxldGVOdWxscywgVGhyb3R0bGVyIH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi90eXBlcy5qcyc7XG5pbXBvcnQgeyBGcm9tRXZlbnRPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZUZyb21FdmVudC5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vZXJyb3JzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2ZXIgfSBmcm9tICcuLi8uLi9iYXNlLmpzJztcbmltcG9ydCB7IEJhc2VPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vb2JzZXJ2YWJsZXMvYmFzZU9ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRGVyaXZlZCwgRGVyaXZlZFN0YXRlIH0gZnJvbSAnLi4vLi4vb2JzZXJ2YWJsZXMvZGVyaXZlZEltcGwuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IERlYnVnTG9jYXRpb24gfSBmcm9tICcuLi8uLi9kZWJ1Z0xvY2F0aW9uLmpzJztcblxuaW50ZXJmYWNlIElJbnN0YW5jZUluZm8ge1xuXHRkZWNsYXJhdGlvbklkOiBudW1iZXI7XG5cdGluc3RhbmNlSWQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElPYnNlcnZhYmxlSW5mbyBleHRlbmRzIElJbnN0YW5jZUluZm8ge1xuXHRsaXN0ZW5lckNvdW50OiBudW1iZXI7XG5cdGxhc3RWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR1cGRhdGVDb3VudDogbnVtYmVyO1xuXHRjaGFuZ2VkT2JzZXJ2YWJsZXM6IFNldDxJT2JzZXJ2YWJsZTxhbnk+Pjtcbn1cblxuaW50ZXJmYWNlIElBdXRvcnVuSW5mbyBleHRlbmRzIElJbnN0YW5jZUluZm8ge1xuXHR1cGRhdGVDb3VudDogbnVtYmVyO1xuXHRjaGFuZ2VkT2JzZXJ2YWJsZXM6IFNldDxJT2JzZXJ2YWJsZTxhbnk+Pjtcbn1cblxuZXhwb3J0IGNsYXNzIERldlRvb2xzTG9nZ2VyIGltcGxlbWVudHMgSU9ic2VydmFibGVMb2dnZXIge1xuXHRwcml2YXRlIHN0YXRpYyBfaW5zdGFuY2U6IERldlRvb2xzTG9nZ2VyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IERldlRvb2xzTG9nZ2VyIHtcblx0XHRpZiAoRGV2VG9vbHNMb2dnZXIuX2luc3RhbmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdERldlRvb2xzTG9nZ2VyLl9pbnN0YW5jZSA9IG5ldyBEZXZUb29sc0xvZ2dlcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gRGV2VG9vbHNMb2dnZXIuX2luc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVjbGFyYXRpb25JZCA9IDA7XG5cdHByaXZhdGUgX2luc3RhbmNlSWQgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY2xhcmF0aW9ucyA9IG5ldyBNYXA8LyogZGVjbGFyYXRpb25JZCArIHR5cGUgKi9zdHJpbmcsIElPYnNEZWNsYXJhdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2VJbmZvcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgSU9ic2VydmFibGVJbmZvIHwgSUF1dG9ydW5JbmZvPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGl2ZUluc3RhbmNlcyA9IG5ldyBNYXA8T2JzSW5zdGFuY2VJZCwgSU9ic2VydmFibGU8YW55PiB8IEF1dG9ydW5PYnNlcnZlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlVHJhbnNhY3Rpb25zID0gbmV3IFNldDxUcmFuc2FjdGlvbkltcGw+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbm5lbCA9IHJlZ2lzdGVyRGVidWdDaGFubmVsPE9ic0RlYnVnZ2VyQXBpPignb2JzZXJ2YWJsZURldlRvb2xzJywgKCkgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRub3RpZmljYXRpb25zOiB7XG5cdFx0XHRcdHNldERlY2xhcmF0aW9uSWRGaWx0ZXI6IGRlY2xhcmF0aW9uSWRzID0+IHtcblxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2dPYnNlcnZhYmxlVmFsdWU6IChvYnNlcnZhYmxlSWQpID0+IHtcblx0XHRcdFx0XHRjb25zb2xlLmxvZygnbG9nT2JzZXJ2YWJsZVZhbHVlJywgb2JzZXJ2YWJsZUlkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Zmx1c2hVcGRhdGVzOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZmx1c2hVcGRhdGVzKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc2V0VXBkYXRlczogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzID0gbnVsbDtcblx0XHRcdFx0XHR0aGlzLl9jaGFubmVsLmFwaS5ub3RpZmljYXRpb25zLmhhbmRsZUNoYW5nZSh0aGlzLl9mdWxsU3RhdGUsIHRydWUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJlcXVlc3RzOiB7XG5cdFx0XHRcdGdldERlY2xhcmF0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgSU9ic0RlY2xhcmF0aW9uPiA9IHt9O1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGVjbCBvZiB0aGlzLl9kZWNsYXJhdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdFtkZWNsLmlkXSA9IGRlY2w7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IGRlY2xzOiByZXN1bHQgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0U3VtbWFyaXplZEluc3RhbmNlczogKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBudWxsITtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0T2JzZXJ2YWJsZVZhbHVlSW5mbzogaW5zdGFuY2VJZCA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JzID0gdGhpcy5fYWxpdmVJbnN0YW5jZXMuZ2V0KGluc3RhbmNlSWQpIGFzIEJhc2VPYnNlcnZhYmxlPGFueT47XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG9ic2VydmVyczogWy4uLm9icy5kZWJ1Z0dldE9ic2VydmVycygpXS5tYXAoZCA9PiB0aGlzLl9mb3JtYXRPYnNlcnZlcihkKSkuZmlsdGVyKGlzRGVmaW5lZCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0RGVyaXZlZEluZm86IGluc3RhbmNlSWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGQgPSB0aGlzLl9hbGl2ZUluc3RhbmNlcy5nZXQoaW5zdGFuY2VJZCkgYXMgRGVyaXZlZDxhbnk+O1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRkZXBlbmRlbmNpZXM6IFsuLi5kLmRlYnVnR2V0U3RhdGUoKS5kZXBlbmRlbmNpZXNdLm1hcChkID0+IHRoaXMuX2Zvcm1hdE9ic2VydmFibGUoZCkpLmZpbHRlcihpc0RlZmluZWQpLFxuXHRcdFx0XHRcdFx0b2JzZXJ2ZXJzOiBbLi4uZC5kZWJ1Z0dldE9ic2VydmVycygpXS5tYXAoZCA9PiB0aGlzLl9mb3JtYXRPYnNlcnZlcihkKSkuZmlsdGVyKGlzRGVmaW5lZCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0QXV0b3J1bkluZm86IGluc3RhbmNlSWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG9icyA9IHRoaXMuX2FsaXZlSW5zdGFuY2VzLmdldChpbnN0YW5jZUlkKSBhcyBBdXRvcnVuT2JzZXJ2ZXI7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGRlcGVuZGVuY2llczogWy4uLm9icy5kZWJ1Z0dldFN0YXRlKCkuZGVwZW5kZW5jaWVzXS5tYXAoZCA9PiB0aGlzLl9mb3JtYXRPYnNlcnZhYmxlKGQpKS5maWx0ZXIoaXNEZWZpbmVkKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRUcmFuc2FjdGlvblN0YXRlOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0VHJhbnNhY3Rpb25TdGF0ZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRWYWx1ZTogKGluc3RhbmNlSWQsIGpzb25WYWx1ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG9icyA9IHRoaXMuX2FsaXZlSW5zdGFuY2VzLmdldChpbnN0YW5jZUlkKSBhcyBCYXNlT2JzZXJ2YWJsZTxhbnk+O1xuXG5cdFx0XHRcdFx0aWYgKG9icyBpbnN0YW5jZW9mIERlcml2ZWQpIHtcblx0XHRcdFx0XHRcdG9icy5kZWJ1Z1NldFZhbHVlKGpzb25WYWx1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChvYnMgaW5zdGFuY2VvZiBPYnNlcnZhYmxlVmFsdWUpIHtcblx0XHRcdFx0XHRcdG9icy5kZWJ1Z1NldFZhbHVlKGpzb25WYWx1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChvYnMgaW5zdGFuY2VvZiBGcm9tRXZlbnRPYnNlcnZhYmxlKSB7XG5cdFx0XHRcdFx0XHRvYnMuZGVidWdTZXRWYWx1ZShqc29uVmFsdWUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdPYnNlcnZhYmxlIGlzIG5vdCBzdXBwb3J0ZWQnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBvYnNlcnZlcnMgPSBbLi4ub2JzLmRlYnVnR2V0T2JzZXJ2ZXJzKCldO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZCBvZiBvYnNlcnZlcnMpIHtcblx0XHRcdFx0XHRcdGQuYmVnaW5VcGRhdGUob2JzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIG9ic2VydmVycykge1xuXHRcdFx0XHRcdFx0ZC5oYW5kbGVDaGFuZ2Uob2JzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGQgb2Ygb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0XHRkLmVuZFVwZGF0ZShvYnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0VmFsdWU6IGluc3RhbmNlSWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG9icyA9IHRoaXMuX2FsaXZlSW5zdGFuY2VzLmdldChpbnN0YW5jZUlkKSBhcyBCYXNlT2JzZXJ2YWJsZTxhbnk+O1xuXHRcdFx0XHRcdGlmIChvYnMgaW5zdGFuY2VvZiBEZXJpdmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZm9ybWF0VmFsdWUob2JzLmRlYnVnR2V0U3RhdGUoKS52YWx1ZSwgMjAwKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKG9icyBpbnN0YW5jZW9mIE9ic2VydmFibGVWYWx1ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZvcm1hdFZhbHVlKG9icy5kZWJ1Z0dldFN0YXRlKCkudmFsdWUsIDIwMCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9nVmFsdWU6IChpbnN0YW5jZUlkKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JzID0gdGhpcy5fYWxpdmVJbnN0YW5jZXMuZ2V0KGluc3RhbmNlSWQpO1xuXHRcdFx0XHRcdGlmIChvYnMgJiYgJ2dldCcgaW4gb2JzKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZygnTG9nZ2VkIFZhbHVlOicsIG9icy5nZXQoKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ09ic2VydmFibGUgaXMgbm90IHN1cHBvcnRlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0cmVydW46IChpbnN0YW5jZUlkKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JzID0gdGhpcy5fYWxpdmVJbnN0YW5jZXMuZ2V0KGluc3RhbmNlSWQpO1xuXHRcdFx0XHRcdGlmIChvYnMgaW5zdGFuY2VvZiBEZXJpdmVkKSB7XG5cdFx0XHRcdFx0XHRvYnMuZGVidWdSZWNvbXB1dGUoKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKG9icyBpbnN0YW5jZW9mIEF1dG9ydW5PYnNlcnZlcikge1xuXHRcdFx0XHRcdFx0b2JzLmRlYnVnUmVydW4oKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignT2JzZXJ2YWJsZSBpcyBub3Qgc3VwcG9ydGVkJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH07XG5cdH0pO1xuXG5cdHByaXZhdGUgZ2V0VHJhbnNhY3Rpb25TdGF0ZSgpOiBJVHJhbnNhY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWZmZWN0ZWQ6IE9ic2VydmVySW5zdGFuY2VTdGF0ZVtdID0gW107XG5cdFx0Y29uc3QgdHhzID0gWy4uLnRoaXMuX2FjdGl2ZVRyYW5zYWN0aW9uc107XG5cdFx0aWYgKHR4cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG9ic2VydmVyUXVldWUgPSB0eHMuZmxhdE1hcCh0ID0+IHQuZGVidWdHZXRVcGRhdGluZ09ic2VydmVycygpID8/IFtdKS5tYXAobyA9PiBvLm9ic2VydmVyKTtcblx0XHRjb25zdCBwcm9jZXNzZWRPYnNlcnZlcnMgPSBuZXcgU2V0PElPYnNlcnZlcj4oKTtcblx0XHR3aGlsZSAob2JzZXJ2ZXJRdWV1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG9ic2VydmVyUXVldWUuc2hpZnQoKSE7XG5cdFx0XHRpZiAocHJvY2Vzc2VkT2JzZXJ2ZXJzLmhhcyhvYnNlcnZlcikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRwcm9jZXNzZWRPYnNlcnZlcnMuYWRkKG9ic2VydmVyKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9nZXRJbmZvKG9ic2VydmVyLCBkID0+IHtcblx0XHRcdFx0aWYgKCFwcm9jZXNzZWRPYnNlcnZlcnMuaGFzKGQpKSB7XG5cdFx0XHRcdFx0b2JzZXJ2ZXJRdWV1ZS5wdXNoKGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdGFmZmVjdGVkLnB1c2goc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IG5hbWVzOiB0eHMubWFwKHQgPT4gdC5nZXREZWJ1Z05hbWUoKSA/PyAndHgnKSwgYWZmZWN0ZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9ic2VydmFibGVJbmZvKG9ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4pOiBJT2JzZXJ2YWJsZUluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9pbnN0YW5jZUluZm9zLmdldChvYnNlcnZhYmxlKTtcblx0XHRpZiAoIWluZm8pIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ05vIGluZm8gZm91bmQnKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5mbyBhcyBJT2JzZXJ2YWJsZUluZm87XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdXRvcnVuSW5mbyhhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiBJQXV0b3J1bkluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9pbnN0YW5jZUluZm9zLmdldChhdXRvcnVuKTtcblx0XHRpZiAoIWluZm8pIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ05vIGluZm8gZm91bmQnKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5mbyBhcyBJQXV0b3J1bkluZm87XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbmZvKG9ic2VydmVyOiBJT2JzZXJ2ZXIsIHF1ZXVlOiAob2JzZXJ2ZXI6IElPYnNlcnZlcikgPT4gdm9pZCk6IE9ic2VydmVySW5zdGFuY2VTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG9ic2VydmVyIGluc3RhbmNlb2YgRGVyaXZlZCkge1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXJzVG9VcGRhdGUgPSBbLi4ub2JzZXJ2ZXIuZGVidWdHZXRPYnNlcnZlcnMoKV07XG5cdFx0XHRmb3IgKGNvbnN0IG8gb2Ygb2JzZXJ2ZXJzVG9VcGRhdGUpIHtcblx0XHRcdFx0cXVldWUobyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRPYnNlcnZhYmxlSW5mbyhvYnNlcnZlcik7XG5cdFx0XHRpZiAoIWluZm8pIHsgcmV0dXJuOyB9XG5cblx0XHRcdGNvbnN0IG9ic2VydmVyU3RhdGUgPSBvYnNlcnZlci5kZWJ1Z0dldFN0YXRlKCk7XG5cblx0XHRcdGNvbnN0IGJhc2UgPSB7IG5hbWU6IG9ic2VydmVyLmRlYnVnTmFtZSwgaW5zdGFuY2VJZDogaW5mby5pbnN0YW5jZUlkLCB1cGRhdGVDb3VudDogb2JzZXJ2ZXJTdGF0ZS51cGRhdGVDb3VudCB9O1xuXHRcdFx0Y29uc3QgY2hhbmdlZERlcGVuZGVuY2llcyA9IFsuLi5pbmZvLmNoYW5nZWRPYnNlcnZhYmxlc10ubWFwKG8gPT4gdGhpcy5faW5zdGFuY2VJbmZvcy5nZXQobyk/Lmluc3RhbmNlSWQpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdFx0aWYgKG9ic2VydmVyU3RhdGUuaXNDb21wdXRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgdHlwZTogJ29ic2VydmFibGUvZGVyaXZlZCcsIHN0YXRlOiAndXBkYXRpbmcnLCBjaGFuZ2VkRGVwZW5kZW5jaWVzLCBpbml0aWFsQ29tcHV0YXRpb246IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKG9ic2VydmVyU3RhdGUuc3RhdGUpIHtcblx0XHRcdFx0Y2FzZSBEZXJpdmVkU3RhdGUuaW5pdGlhbDpcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCB0eXBlOiAnb2JzZXJ2YWJsZS9kZXJpdmVkJywgc3RhdGU6ICdub1ZhbHVlJyB9O1xuXHRcdFx0XHRjYXNlIERlcml2ZWRTdGF0ZS51cFRvRGF0ZTpcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCB0eXBlOiAnb2JzZXJ2YWJsZS9kZXJpdmVkJywgc3RhdGU6ICd1cFRvRGF0ZScgfTtcblx0XHRcdFx0Y2FzZSBEZXJpdmVkU3RhdGUuc3RhbGU6XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgdHlwZTogJ29ic2VydmFibGUvZGVyaXZlZCcsIHN0YXRlOiAnc3RhbGUnLCBjaGFuZ2VkRGVwZW5kZW5jaWVzIH07XG5cdFx0XHRcdGNhc2UgRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQ6XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgdHlwZTogJ29ic2VydmFibGUvZGVyaXZlZCcsIHN0YXRlOiAncG9zc2libHlTdGFsZScgfTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKG9ic2VydmVyIGluc3RhbmNlb2YgQXV0b3J1bk9ic2VydmVyKSB7XG5cdFx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0QXV0b3J1bkluZm8ob2JzZXJ2ZXIpO1xuXHRcdFx0aWYgKCFpbmZvKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3QgYmFzZSA9IHsgbmFtZTogb2JzZXJ2ZXIuZGVidWdOYW1lLCBpbnN0YW5jZUlkOiBpbmZvLmluc3RhbmNlSWQsIHVwZGF0ZUNvdW50OiBpbmZvLnVwZGF0ZUNvdW50IH07XG5cdFx0XHRjb25zdCBjaGFuZ2VkRGVwZW5kZW5jaWVzID0gWy4uLmluZm8uY2hhbmdlZE9ic2VydmFibGVzXS5tYXAobyA9PiB0aGlzLl9pbnN0YW5jZUluZm9zLmdldChvKSEuaW5zdGFuY2VJZCk7XG5cdFx0XHRpZiAob2JzZXJ2ZXIuZGVidWdHZXRTdGF0ZSgpLmlzUnVubmluZykge1xuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCB0eXBlOiAnYXV0b3J1bicsIHN0YXRlOiAndXBkYXRpbmcnLCBjaGFuZ2VkRGVwZW5kZW5jaWVzIH07XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKG9ic2VydmVyLmRlYnVnR2V0U3RhdGUoKS5zdGF0ZSkge1xuXHRcdFx0XHRjYXNlIEF1dG9ydW5TdGF0ZS51cFRvRGF0ZTpcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCB0eXBlOiAnYXV0b3J1bicsIHN0YXRlOiAndXBUb0RhdGUnIH07XG5cdFx0XHRcdGNhc2UgQXV0b3J1blN0YXRlLnN0YWxlOlxuXHRcdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIHR5cGU6ICdhdXRvcnVuJywgc3RhdGU6ICdzdGFsZScsIGNoYW5nZWREZXBlbmRlbmNpZXMgfTtcblx0XHRcdFx0Y2FzZSBBdXRvcnVuU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZDpcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCB0eXBlOiAnYXV0b3J1bicsIHN0YXRlOiAncG9zc2libHlTdGFsZScgfTtcblx0XHRcdH1cblxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0T2JzZXJ2YWJsZShvYnM6IElPYnNlcnZhYmxlPGFueT4pOiB7IG5hbWU6IHN0cmluZzsgaW5zdGFuY2VJZDogT2JzSW5zdGFuY2VJZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0T2JzZXJ2YWJsZUluZm8ob2JzKTtcblx0XHRpZiAoIWluZm8pIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdHJldHVybiB7IG5hbWU6IG9icy5kZWJ1Z05hbWUsIGluc3RhbmNlSWQ6IGluZm8uaW5zdGFuY2VJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0T2JzZXJ2ZXIob2JzOiBJT2JzZXJ2ZXIpOiB7IG5hbWU6IHN0cmluZzsgaW5zdGFuY2VJZDogT2JzSW5zdGFuY2VJZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob2JzIGluc3RhbmNlb2YgRGVyaXZlZCkge1xuXHRcdFx0cmV0dXJuIHsgbmFtZTogb2JzLnRvU3RyaW5nKCksIGluc3RhbmNlSWQ6IHRoaXMuX2dldE9ic2VydmFibGVJbmZvKG9icyk/Lmluc3RhbmNlSWQhIH07XG5cdFx0fVxuXHRcdGNvbnN0IGF1dG9ydW5JbmZvID0gdGhpcy5fZ2V0QXV0b3J1bkluZm8ob2JzIGFzIEF1dG9ydW5PYnNlcnZlcik7XG5cdFx0aWYgKGF1dG9ydW5JbmZvKSB7XG5cdFx0XHRyZXR1cm4geyBuYW1lOiBvYnMudG9TdHJpbmcoKSwgaW5zdGFuY2VJZDogYXV0b3J1bkluZm8uaW5zdGFuY2VJZCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuXHRcdERlYnVnTG9jYXRpb24uZW5hYmxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wZW5kaW5nQ2hhbmdlczogT2JzU3RhdGVVcGRhdGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlVGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Z1bGxTdGF0ZSA9IHt9O1xuXG5cdHByaXZhdGUgX2hhbmRsZUNoYW5nZSh1cGRhdGU6IE9ic1N0YXRlVXBkYXRlKTogdm9pZCB7XG5cdFx0ZGVlcEFzc2lnbkRlbGV0ZU51bGxzKHRoaXMuX2Z1bGxTdGF0ZSwgdXBkYXRlKTtcblxuXHRcdGlmICh0aGlzLl9wZW5kaW5nQ2hhbmdlcyA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NoYW5nZXMgPSB1cGRhdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlZXBBc3NpZ24odGhpcy5fcGVuZGluZ0NoYW5nZXMsIHVwZGF0ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhbmdlVGhyb3R0bGVyLnRocm90dGxlKHRoaXMuX2ZsdXNoVXBkYXRlcywgMTApO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZmx1c2hVcGRhdGVzID0gKCkgPT4ge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nQ2hhbmdlcyAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fY2hhbm5lbC5hcGkubm90aWZpY2F0aW9ucy5oYW5kbGVDaGFuZ2UodGhpcy5fcGVuZGluZ0NoYW5nZXMsIGZhbHNlKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDaGFuZ2VzID0gbnVsbDtcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSBfZ2V0RGVjbGFyYXRpb25JZCh0eXBlOiBJT2JzRGVjbGFyYXRpb25bJ3R5cGUnXSwgbG9jYXRpb246IERlYnVnTG9jYXRpb24pOiBudW1iZXIge1xuXHRcdGlmICghbG9jYXRpb24pIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRsZXQgZGVjSW5mbyA9IHRoaXMuX2RlY2xhcmF0aW9ucy5nZXQobG9jYXRpb24uaWQpO1xuXHRcdGlmIChkZWNJbmZvID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlY0luZm8gPSB7XG5cdFx0XHRcdGlkOiB0aGlzLl9kZWNsYXJhdGlvbklkKyssXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdHVybDogbG9jYXRpb24uZmlsZU5hbWUsXG5cdFx0XHRcdGxpbmU6IGxvY2F0aW9uLmxpbmUsXG5cdFx0XHRcdGNvbHVtbjogbG9jYXRpb24uY29sdW1uLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2RlY2xhcmF0aW9ucy5zZXQobG9jYXRpb24uaWQsIGRlY0luZm8pO1xuXG5cdFx0XHR0aGlzLl9oYW5kbGVDaGFuZ2UoeyBkZWNsczogeyBbZGVjSW5mby5pZF06IGRlY0luZm8gfSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGRlY0luZm8uaWQ7XG5cdH1cblxuXHRoYW5kbGVPYnNlcnZhYmxlQ3JlYXRlZChvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxhbnk+LCBsb2NhdGlvbjogRGVidWdMb2NhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGRlY2xhcmF0aW9uSWQgPSB0aGlzLl9nZXREZWNsYXJhdGlvbklkKCdvYnNlcnZhYmxlL3ZhbHVlJywgbG9jYXRpb24pO1xuXG5cdFx0Y29uc3QgaW5mbzogSU9ic2VydmFibGVJbmZvID0ge1xuXHRcdFx0ZGVjbGFyYXRpb25JZCxcblx0XHRcdGluc3RhbmNlSWQ6IHRoaXMuX2luc3RhbmNlSWQrKyxcblx0XHRcdGxpc3RlbmVyQ291bnQ6IDAsXG5cdFx0XHRsYXN0VmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdHVwZGF0ZUNvdW50OiAwLFxuXHRcdFx0Y2hhbmdlZE9ic2VydmFibGVzOiBuZXcgU2V0KCksXG5cdFx0fTtcblx0XHR0aGlzLl9pbnN0YW5jZUluZm9zLnNldChvYnNlcnZhYmxlLCBpbmZvKTtcblx0fVxuXG5cdGhhbmRsZU9uTGlzdGVuZXJDb3VudENoYW5nZWQob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8YW55PiwgbmV3Q291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRPYnNlcnZhYmxlSW5mbyhvYnNlcnZhYmxlKTtcblx0XHRpZiAoIWluZm8pIHsgcmV0dXJuOyB9XG5cblx0XHRpZiAoaW5mby5saXN0ZW5lckNvdW50ID09PSAwICYmIG5ld0NvdW50ID4gMCkge1xuXHRcdFx0Y29uc3QgdHlwZTogSU9ic0RlY2xhcmF0aW9uWyd0eXBlJ10gPVxuXHRcdFx0XHRvYnNlcnZhYmxlIGluc3RhbmNlb2YgRGVyaXZlZCA/ICdvYnNlcnZhYmxlL2Rlcml2ZWQnIDogJ29ic2VydmFibGUvdmFsdWUnO1xuXHRcdFx0dGhpcy5fYWxpdmVJbnN0YW5jZXMuc2V0KGluZm8uaW5zdGFuY2VJZCwgb2JzZXJ2YWJsZSk7XG5cdFx0XHR0aGlzLl9oYW5kbGVDaGFuZ2Uoe1xuXHRcdFx0XHRpbnN0YW5jZXM6IHtcblx0XHRcdFx0XHRbaW5mby5pbnN0YW5jZUlkXToge1xuXHRcdFx0XHRcdFx0aW5zdGFuY2VJZDogaW5mby5pbnN0YW5jZUlkLFxuXHRcdFx0XHRcdFx0ZGVjbGFyYXRpb25JZDogaW5mby5kZWNsYXJhdGlvbklkLFxuXHRcdFx0XHRcdFx0Zm9ybWF0dGVkVmFsdWU6IGluZm8ubGFzdFZhbHVlLFxuXHRcdFx0XHRcdFx0dHlwZSxcblx0XHRcdFx0XHRcdG5hbWU6IG9ic2VydmFibGUuZGVidWdOYW1lLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChpbmZvLmxpc3RlbmVyQ291bnQgPiAwICYmIG5ld0NvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVDaGFuZ2Uoe1xuXHRcdFx0XHRpbnN0YW5jZXM6IHsgW2luZm8uaW5zdGFuY2VJZF06IG51bGwgfVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9hbGl2ZUluc3RhbmNlcy5kZWxldGUoaW5mby5pbnN0YW5jZUlkKTtcblx0XHR9XG5cdFx0aW5mby5saXN0ZW5lckNvdW50ID0gbmV3Q291bnQ7XG5cdH1cblxuXHRoYW5kbGVPYnNlcnZhYmxlVXBkYXRlZChvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxhbnk+LCBjaGFuZ2VJbmZvOiBJQ2hhbmdlSW5mb3JtYXRpb24pOiB2b2lkIHtcblx0XHRpZiAob2JzZXJ2YWJsZSBpbnN0YW5jZW9mIERlcml2ZWQpIHtcblx0XHRcdHRoaXMuX2hhbmRsZURlcml2ZWRSZWNvbXB1dGVkKG9ic2VydmFibGUsIGNoYW5nZUluZm8pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRPYnNlcnZhYmxlSW5mbyhvYnNlcnZhYmxlKTtcblx0XHRpZiAoaW5mbykge1xuXHRcdFx0aWYgKGNoYW5nZUluZm8uZGlkQ2hhbmdlKSB7XG5cdFx0XHRcdGluZm8ubGFzdFZhbHVlID0gZm9ybWF0VmFsdWUoY2hhbmdlSW5mby5uZXdWYWx1ZSwgMzApO1xuXHRcdFx0XHRpZiAoaW5mby5saXN0ZW5lckNvdW50ID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZUNoYW5nZSh7XG5cdFx0XHRcdFx0XHRpbnN0YW5jZXM6IHsgW2luZm8uaW5zdGFuY2VJZF06IHsgZm9ybWF0dGVkVmFsdWU6IGluZm8ubGFzdFZhbHVlIH0gfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlQXV0b3J1bkNyZWF0ZWQoYXV0b3J1bjogQXV0b3J1bk9ic2VydmVyLCBsb2NhdGlvbjogRGVidWdMb2NhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGRlY2xhcmF0aW9uSWQgPSB0aGlzLl9nZXREZWNsYXJhdGlvbklkKCdhdXRvcnVuJywgbG9jYXRpb24pO1xuXHRcdGNvbnN0IGluZm86IElBdXRvcnVuSW5mbyA9IHtcblx0XHRcdGRlY2xhcmF0aW9uSWQsXG5cdFx0XHRpbnN0YW5jZUlkOiB0aGlzLl9pbnN0YW5jZUlkKyssXG5cdFx0XHR1cGRhdGVDb3VudDogMCxcblx0XHRcdGNoYW5nZWRPYnNlcnZhYmxlczogbmV3IFNldCgpLFxuXHRcdH07XG5cdFx0dGhpcy5faW5zdGFuY2VJbmZvcy5zZXQoYXV0b3J1biwgaW5mbyk7XG5cdFx0dGhpcy5fYWxpdmVJbnN0YW5jZXMuc2V0KGluZm8uaW5zdGFuY2VJZCwgYXV0b3J1bik7XG5cdFx0aWYgKGluZm8pIHtcblx0XHRcdHRoaXMuX2hhbmRsZUNoYW5nZSh7XG5cdFx0XHRcdGluc3RhbmNlczoge1xuXHRcdFx0XHRcdFtpbmZvLmluc3RhbmNlSWRdOiB7XG5cdFx0XHRcdFx0XHRpbnN0YW5jZUlkOiBpbmZvLmluc3RhbmNlSWQsXG5cdFx0XHRcdFx0XHRkZWNsYXJhdGlvbklkOiBpbmZvLmRlY2xhcmF0aW9uSWQsXG5cdFx0XHRcdFx0XHRydW5Db3VudDogMCxcblx0XHRcdFx0XHRcdHR5cGU6ICdhdXRvcnVuJyxcblx0XHRcdFx0XHRcdG5hbWU6IGF1dG9ydW4uZGVidWdOYW1lLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cdGhhbmRsZUF1dG9ydW5EaXNwb3NlZChhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0QXV0b3J1bkluZm8oYXV0b3J1bik7XG5cdFx0aWYgKCFpbmZvKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5faGFuZGxlQ2hhbmdlKHtcblx0XHRcdGluc3RhbmNlczogeyBbaW5mby5pbnN0YW5jZUlkXTogbnVsbCB9XG5cdFx0fSk7XG5cdFx0dGhpcy5faW5zdGFuY2VJbmZvcy5kZWxldGUoYXV0b3J1bik7XG5cdFx0dGhpcy5fYWxpdmVJbnN0YW5jZXMuZGVsZXRlKGluZm8uaW5zdGFuY2VJZCk7XG5cdH1cblx0aGFuZGxlQXV0b3J1bkRlcGVuZGVuY3lDaGFuZ2VkKGF1dG9ydW46IEF1dG9ydW5PYnNlcnZlciwgb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8YW55PiwgY2hhbmdlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2dldEF1dG9ydW5JbmZvKGF1dG9ydW4pO1xuXHRcdGlmICghaW5mbykgeyByZXR1cm47IH1cblxuXHRcdGluZm8uY2hhbmdlZE9ic2VydmFibGVzLmFkZChvYnNlcnZhYmxlKTtcblx0fVxuXHRoYW5kbGVBdXRvcnVuU3RhcnRlZChhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiB2b2lkIHtcblxuXHR9XG5cdGhhbmRsZUF1dG9ydW5GaW5pc2hlZChhdXRvcnVuOiBBdXRvcnVuT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0QXV0b3J1bkluZm8oYXV0b3J1bik7XG5cdFx0aWYgKCFpbmZvKSB7IHJldHVybjsgfVxuXG5cdFx0aW5mby5jaGFuZ2VkT2JzZXJ2YWJsZXMuY2xlYXIoKTtcblx0XHRpbmZvLnVwZGF0ZUNvdW50Kys7XG5cdFx0dGhpcy5faGFuZGxlQ2hhbmdlKHtcblx0XHRcdGluc3RhbmNlczogeyBbaW5mby5pbnN0YW5jZUlkXTogeyBydW5Db3VudDogaW5mby51cGRhdGVDb3VudCB9IH1cblx0XHR9KTtcblx0fVxuXG5cdGhhbmRsZURlcml2ZWREZXBlbmRlbmN5Q2hhbmdlZChkZXJpdmVkOiBEZXJpdmVkPGFueT4sIG9ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4sIGNoYW5nZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRPYnNlcnZhYmxlSW5mbyhkZXJpdmVkKTtcblx0XHRpZiAoaW5mbykge1xuXHRcdFx0aW5mby5jaGFuZ2VkT2JzZXJ2YWJsZXMuYWRkKG9ic2VydmFibGUpO1xuXHRcdH1cblx0fVxuXHRfaGFuZGxlRGVyaXZlZFJlY29tcHV0ZWQob2JzZXJ2YWJsZTogRGVyaXZlZDxhbnk+LCBjaGFuZ2VJbmZvOiBJQ2hhbmdlSW5mb3JtYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0T2JzZXJ2YWJsZUluZm8ob2JzZXJ2YWJsZSk7XG5cdFx0aWYgKCFpbmZvKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgZm9ybWF0dGVkVmFsdWUgPSBmb3JtYXRWYWx1ZShjaGFuZ2VJbmZvLm5ld1ZhbHVlLCAzMCk7XG5cdFx0aW5mby51cGRhdGVDb3VudCsrO1xuXHRcdGluZm8uY2hhbmdlZE9ic2VydmFibGVzLmNsZWFyKCk7XG5cblx0XHRpbmZvLmxhc3RWYWx1ZSA9IGZvcm1hdHRlZFZhbHVlO1xuXHRcdGlmIChpbmZvLmxpc3RlbmVyQ291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVDaGFuZ2Uoe1xuXHRcdFx0XHRpbnN0YW5jZXM6IHsgW2luZm8uaW5zdGFuY2VJZF06IHsgZm9ybWF0dGVkVmFsdWU6IGZvcm1hdHRlZFZhbHVlLCByZWNvbXB1dGF0aW9uQ291bnQ6IGluZm8udXBkYXRlQ291bnQgfSB9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0aGFuZGxlRGVyaXZlZENsZWFyZWQob2JzZXJ2YWJsZTogRGVyaXZlZDxhbnk+KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2dldE9ic2VydmFibGVJbmZvKG9ic2VydmFibGUpO1xuXHRcdGlmICghaW5mbykgeyByZXR1cm47IH1cblxuXHRcdGluZm8ubGFzdFZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGluZm8uY2hhbmdlZE9ic2VydmFibGVzLmNsZWFyKCk7XG5cdFx0aWYgKGluZm8ubGlzdGVuZXJDb3VudCA+IDApIHtcblx0XHRcdHRoaXMuX2hhbmRsZUNoYW5nZSh7XG5cdFx0XHRcdGluc3RhbmNlczoge1xuXHRcdFx0XHRcdFtpbmZvLmluc3RhbmNlSWRdOiB7XG5cdFx0XHRcdFx0XHRmb3JtYXR0ZWRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cdGhhbmRsZUJlZ2luVHJhbnNhY3Rpb24odHJhbnNhY3Rpb246IFRyYW5zYWN0aW9uSW1wbCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVRyYW5zYWN0aW9ucy5hZGQodHJhbnNhY3Rpb24pO1xuXHR9XG5cdGhhbmRsZUVuZFRyYW5zYWN0aW9uKHRyYW5zYWN0aW9uOiBUcmFuc2FjdGlvbkltcGwpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVUcmFuc2FjdGlvbnMuZGVsZXRlKHRyYW5zYWN0aW9uKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsb0JBQW9CO0FBRzlDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsWUFBWSx1QkFBdUIsaUJBQWlCO0FBQzdELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CLHlCQUF5QjtBQUd0RCxT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
