import { assertFn, BugIndicatingError, DisposableStore, markAsDisposed, onBugIndicatingError, trackDisposable } from "../commonFacade/deps.js";
import { getLogger } from "../logging/logging.js";
var AutorunState = /* @__PURE__ */ ((AutorunState2) => {
  AutorunState2[AutorunState2["dependenciesMightHaveChanged"] = 1] = "dependenciesMightHaveChanged";
  AutorunState2[AutorunState2["stale"] = 2] = "stale";
  AutorunState2[AutorunState2["upToDate"] = 3] = "upToDate";
  return AutorunState2;
})(AutorunState || {});
function autorunStateToString(state) {
  switch (state) {
    case 1 /* dependenciesMightHaveChanged */:
      return "dependenciesMightHaveChanged";
    case 2 /* stale */:
      return "stale";
    case 3 /* upToDate */:
      return "upToDate";
    default:
      return "<unknown>";
  }
}
class AutorunObserver {
  constructor(_debugNameData, _runFn, _changeTracker, debugLocation) {
    this._debugNameData = _debugNameData;
    this._runFn = _runFn;
    this._changeTracker = _changeTracker;
    this._state = 2 /* stale */;
    this._updateCount = 0;
    this._disposed = false;
    this._dependencies = /* @__PURE__ */ new Set();
    this._dependenciesToBeRemoved = /* @__PURE__ */ new Set();
    this._isRunning = false;
    this._iteration = 0;
    this._store = void 0;
    this._delayedStore = void 0;
    this._changeSummary = this._changeTracker?.createChangeSummary(void 0);
    getLogger()?.handleAutorunCreated(this, debugLocation);
    this._run();
    trackDisposable(this);
  }
  get debugName() {
    return this._debugNameData.getDebugName(this) ?? "(anonymous)";
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (const o of this._dependencies) {
      o.removeObserver(this);
    }
    this._dependencies.clear();
    if (this._store !== void 0) {
      this._store.dispose();
    }
    if (this._delayedStore !== void 0) {
      this._delayedStore.dispose();
    }
    getLogger()?.handleAutorunDisposed(this);
    markAsDisposed(this);
  }
  _run() {
    const emptySet = this._dependenciesToBeRemoved;
    this._dependenciesToBeRemoved = this._dependencies;
    this._dependencies = emptySet;
    this._state = 3 /* upToDate */;
    try {
      if (!this._disposed) {
        getLogger()?.handleAutorunStarted(this);
        const changeSummary = this._changeSummary;
        const delayedStore = this._delayedStore;
        if (delayedStore !== void 0) {
          this._delayedStore = void 0;
        }
        try {
          this._isRunning = true;
          if (this._changeTracker) {
            this._changeTracker.beforeUpdate?.(this, changeSummary);
            this._changeSummary = this._changeTracker.createChangeSummary(changeSummary);
          }
          if (this._store !== void 0) {
            this._store.dispose();
            this._store = void 0;
          }
          this._runFn(this, changeSummary);
        } catch (e) {
          onBugIndicatingError(e);
        } finally {
          this._isRunning = false;
          if (delayedStore !== void 0) {
            delayedStore.dispose();
          }
        }
      }
    } finally {
      if (!this._disposed) {
        getLogger()?.handleAutorunFinished(this);
      }
      for (const o of this._dependenciesToBeRemoved) {
        o.removeObserver(this);
      }
      this._dependenciesToBeRemoved.clear();
    }
  }
  toString() {
    return `Autorun<${this.debugName}>`;
  }
  // IObserver implementation
  beginUpdate(_observable) {
    if (this._state === 3 /* upToDate */) {
      this._checkIterations();
      this._state = 1 /* dependenciesMightHaveChanged */;
    }
    this._updateCount++;
  }
  endUpdate(_observable) {
    try {
      if (this._updateCount === 1) {
        this._iteration = 1;
        do {
          if (this._checkIterations()) {
            return;
          }
          if (this._state === 1 /* dependenciesMightHaveChanged */) {
            this._state = 3 /* upToDate */;
            for (const d of this._dependencies) {
              d.reportChanges();
              if (this._state === 2 /* stale */) {
                break;
              }
            }
          }
          this._iteration++;
          if (this._state !== 3 /* upToDate */) {
            this._run();
          }
        } while (this._state !== 3 /* upToDate */);
      }
    } finally {
      this._updateCount--;
    }
    assertFn(() => this._updateCount >= 0);
  }
  handlePossibleChange(observable) {
    if (this._state === 3 /* upToDate */ && this._isDependency(observable)) {
      this._checkIterations();
      this._state = 1 /* dependenciesMightHaveChanged */;
    }
  }
  handleChange(observable, change) {
    if (this._isDependency(observable)) {
      getLogger()?.handleAutorunDependencyChanged(this, observable, change);
      try {
        const shouldReact = this._changeTracker ? this._changeTracker.handleChange({
          changedObservable: observable,
          change,
          // eslint-disable-next-line local/code-no-any-casts
          didChange: (o) => o === observable
        }, this._changeSummary) : true;
        if (shouldReact) {
          this._checkIterations();
          this._state = 2 /* stale */;
        }
      } catch (e) {
        onBugIndicatingError(e);
      }
    }
  }
  _isDependency(observable) {
    return this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable);
  }
  // IReader implementation
  _ensureNoRunning() {
    if (!this._isRunning) {
      throw new BugIndicatingError("The reader object cannot be used outside its compute function!");
    }
  }
  readObservable(observable) {
    this._ensureNoRunning();
    if (this._disposed) {
      return observable.get();
    }
    observable.addObserver(this);
    const value = observable.get();
    this._dependencies.add(observable);
    this._dependenciesToBeRemoved.delete(observable);
    return value;
  }
  get store() {
    this._ensureNoRunning();
    if (this._disposed) {
      throw new BugIndicatingError("Cannot access store after dispose");
    }
    if (this._store === void 0) {
      this._store = new DisposableStore();
    }
    return this._store;
  }
  get delayedStore() {
    this._ensureNoRunning();
    if (this._disposed) {
      throw new BugIndicatingError("Cannot access store after dispose");
    }
    if (this._delayedStore === void 0) {
      this._delayedStore = new DisposableStore();
    }
    return this._delayedStore;
  }
  debugGetState() {
    return {
      isRunning: this._isRunning,
      updateCount: this._updateCount,
      dependencies: this._dependencies,
      state: this._state,
      stateStr: autorunStateToString(this._state)
    };
  }
  debugRerun() {
    if (!this._isRunning) {
      this._run();
    } else {
      this._state = 2 /* stale */;
    }
  }
  _checkIterations() {
    if (this._iteration > 100) {
      onBugIndicatingError(new BugIndicatingError(`Autorun '${this.debugName}' is stuck in an infinite update loop.`));
      return true;
    }
    return false;
  }
}
export {
  AutorunObserver,
  AutorunState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxccmVhY3Rpb25zXFxhdXRvcnVuSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElPYnNlcnZlciwgSVJlYWRlcldpdGhTdG9yZSB9IGZyb20gJy4uL2Jhc2UuanMnO1xuaW1wb3J0IHsgRGVidWdOYW1lRGF0YSB9IGZyb20gJy4uL2RlYnVnTmFtZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRGbiwgQnVnSW5kaWNhdGluZ0Vycm9yLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBtYXJrQXNEaXNwb3NlZCwgb25CdWdJbmRpY2F0aW5nRXJyb3IsIHRyYWNrRGlzcG9zYWJsZSB9IGZyb20gJy4uL2NvbW1vbkZhY2FkZS9kZXBzLmpzJztcbmltcG9ydCB7IGdldExvZ2dlciB9IGZyb20gJy4uL2xvZ2dpbmcvbG9nZ2luZy5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlVHJhY2tlciB9IGZyb20gJy4uL2NoYW5nZVRyYWNrZXIuanMnO1xuaW1wb3J0IHsgRGVidWdMb2NhdGlvbiB9IGZyb20gJy4uL2RlYnVnTG9jYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBBdXRvcnVuU3RhdGUge1xuXHQvKipcblx0ICogQSBkZXBlbmRlbmN5IGNvdWxkIGhhdmUgY2hhbmdlZC5cblx0ICogV2UgbmVlZCB0byBleHBsaWNpdGx5IGFzayB0aGVtIGlmIGF0IGxlYXN0IG9uZSBkZXBlbmRlbmN5IGNoYW5nZWQuXG5cdCAqL1xuXHRkZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkID0gMSxcblxuXHQvKipcblx0ICogQSBkZXBlbmRlbmN5IGNoYW5nZWQgYW5kIHdlIG5lZWQgdG8gcmVjb21wdXRlLlxuXHQgKi9cblx0c3RhbGUgPSAyLFxuXHR1cFRvRGF0ZSA9IDMsXG59XG5cbmZ1bmN0aW9uIGF1dG9ydW5TdGF0ZVRvU3RyaW5nKHN0YXRlOiBBdXRvcnVuU3RhdGUpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSBBdXRvcnVuU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZDogcmV0dXJuICdkZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkJztcblx0XHRjYXNlIEF1dG9ydW5TdGF0ZS5zdGFsZTogcmV0dXJuICdzdGFsZSc7XG5cdFx0Y2FzZSBBdXRvcnVuU3RhdGUudXBUb0RhdGU6IHJldHVybiAndXBUb0RhdGUnO1xuXHRcdGRlZmF1bHQ6IHJldHVybiAnPHVua25vd24+Jztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXV0b3J1bk9ic2VydmVyPFRDaGFuZ2VTdW1tYXJ5ID0gYW55PiBpbXBsZW1lbnRzIElPYnNlcnZlciwgSVJlYWRlcldpdGhTdG9yZSwgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9zdGF0ZSA9IEF1dG9ydW5TdGF0ZS5zdGFsZTtcblx0cHJpdmF0ZSBfdXBkYXRlQ291bnQgPSAwO1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9kZXBlbmRlbmNpZXMgPSBuZXcgU2V0PElPYnNlcnZhYmxlPGFueT4+KCk7XG5cdHByaXZhdGUgX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkID0gbmV3IFNldDxJT2JzZXJ2YWJsZTxhbnk+PigpO1xuXHRwcml2YXRlIF9jaGFuZ2VTdW1tYXJ5OiBUQ2hhbmdlU3VtbWFyeSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNSdW5uaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2l0ZXJhdGlvbiA9IDA7XG5cblx0cHVibGljIGdldCBkZWJ1Z05hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdOYW1lRGF0YS5nZXREZWJ1Z05hbWUodGhpcykgPz8gJyhhbm9ueW1vdXMpJztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBfZGVidWdOYW1lRGF0YTogRGVidWdOYW1lRGF0YSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgX3J1bkZuOiAocmVhZGVyOiBJUmVhZGVyV2l0aFN0b3JlLCBjaGFuZ2VTdW1tYXJ5OiBUQ2hhbmdlU3VtbWFyeSkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VUcmFja2VyOiBJQ2hhbmdlVHJhY2tlcjxUQ2hhbmdlU3VtbWFyeT4gfCB1bmRlZmluZWQsXG5cdFx0ZGVidWdMb2NhdGlvbjogRGVidWdMb2NhdGlvblxuXHQpIHtcblx0XHR0aGlzLl9jaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlVHJhY2tlcj8uY3JlYXRlQ2hhbmdlU3VtbWFyeSh1bmRlZmluZWQpO1xuXHRcdGdldExvZ2dlcigpPy5oYW5kbGVBdXRvcnVuQ3JlYXRlZCh0aGlzLCBkZWJ1Z0xvY2F0aW9uKTtcblx0XHR0aGlzLl9ydW4oKTtcblxuXHRcdHRyYWNrRGlzcG9zYWJsZSh0aGlzKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBvIG9mIHRoaXMuX2RlcGVuZGVuY2llcykge1xuXHRcdFx0by5yZW1vdmVPYnNlcnZlcih0aGlzKTsgLy8gV2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHR9XG5cdFx0dGhpcy5fZGVwZW5kZW5jaWVzLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5fc3RvcmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVsYXllZFN0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2RlbGF5ZWRTdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Z2V0TG9nZ2VyKCk/LmhhbmRsZUF1dG9ydW5EaXNwb3NlZCh0aGlzKTtcblx0XHRtYXJrQXNEaXNwb3NlZCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX3J1bigpIHtcblx0XHRjb25zdCBlbXB0eVNldCA9IHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkO1xuXHRcdHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkID0gdGhpcy5fZGVwZW5kZW5jaWVzO1xuXHRcdHRoaXMuX2RlcGVuZGVuY2llcyA9IGVtcHR5U2V0O1xuXG5cdFx0dGhpcy5fc3RhdGUgPSBBdXRvcnVuU3RhdGUudXBUb0RhdGU7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRnZXRMb2dnZXIoKT8uaGFuZGxlQXV0b3J1blN0YXJ0ZWQodGhpcyk7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZVN1bW1hcnkgPSB0aGlzLl9jaGFuZ2VTdW1tYXJ5ITtcblx0XHRcdFx0Y29uc3QgZGVsYXllZFN0b3JlID0gdGhpcy5fZGVsYXllZFN0b3JlO1xuXHRcdFx0XHRpZiAoZGVsYXllZFN0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9kZWxheWVkU3RvcmUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLl9pc1J1bm5pbmcgPSB0cnVlO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jaGFuZ2VUcmFja2VyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jaGFuZ2VUcmFja2VyLmJlZm9yZVVwZGF0ZT8uKHRoaXMsIGNoYW5nZVN1bW1hcnkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2hhbmdlU3VtbWFyeSA9IHRoaXMuX2NoYW5nZVRyYWNrZXIuY3JlYXRlQ2hhbmdlU3VtbWFyeShjaGFuZ2VTdW1tYXJ5KTsgLy8gV2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX3J1bkZuKHRoaXMsIGNoYW5nZVN1bW1hcnkpOyAvLyBXYXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0b25CdWdJbmRpY2F0aW5nRXJyb3IoZSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5faXNSdW5uaW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKGRlbGF5ZWRTdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRkZWxheWVkU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoIXRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdGdldExvZ2dlcigpPy5oYW5kbGVBdXRvcnVuRmluaXNoZWQodGhpcyk7XG5cdFx0XHR9XG5cdFx0XHQvLyBXZSBkb24ndCB3YW50IG91ciBvYnNlcnZlZCBvYnNlcnZhYmxlcyB0byB0aGluayB0aGF0IHRoZXkgYXJlIChub3QgZXZlbiB0ZW1wb3JhcmlseSkgbm90IGJlaW5nIG9ic2VydmVkLlxuXHRcdFx0Ly8gVGh1cywgd2Ugb25seSB1bnN1YnNjcmliZSBmcm9tIG9ic2VydmFibGVzIHRoYXQgYXJlIGRlZmluaXRlbHkgbm90IHJlYWQgYW55bW9yZS5cblx0XHRcdGZvciAoY29uc3QgbyBvZiB0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZCkge1xuXHRcdFx0XHRvLnJlbW92ZU9ic2VydmVyKHRoaXMpOyAvLyBXYXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYEF1dG9ydW48JHt0aGlzLmRlYnVnTmFtZX0+YDtcblx0fVxuXG5cdC8vIElPYnNlcnZlciBpbXBsZW1lbnRhdGlvblxuXHRwdWJsaWMgYmVnaW5VcGRhdGUoX29ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IEF1dG9ydW5TdGF0ZS51cFRvRGF0ZSkge1xuXHRcdFx0dGhpcy5fY2hlY2tJdGVyYXRpb25zKCk7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IEF1dG9ydW5TdGF0ZS5kZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVDb3VudCsrO1xuXHR9XG5cblx0cHVibGljIGVuZFVwZGF0ZShfb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8YW55Pik6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0dGhpcy5faXRlcmF0aW9uID0gMTtcblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jaGVja0l0ZXJhdGlvbnMoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgPT09IEF1dG9ydW5TdGF0ZS5kZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IEF1dG9ydW5TdGF0ZS51cFRvRGF0ZTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZCBvZiB0aGlzLl9kZXBlbmRlbmNpZXMpIHtcblx0XHRcdFx0XHRcdFx0ZC5yZXBvcnRDaGFuZ2VzKCk7IC8vIFdhcm5pbmc6IGV4dGVybmFsIGNhbGwhXG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSBhcyBBdXRvcnVuU3RhdGUgPT09IEF1dG9ydW5TdGF0ZS5zdGFsZSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFRoZSBvdGhlciBkZXBlbmRlbmNpZXMgd2lsbCByZWZyZXNoIG9uIGRlbWFuZFxuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5faXRlcmF0aW9uKys7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlICE9PSBBdXRvcnVuU3RhdGUudXBUb0RhdGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3J1bigpOyAvLyBXYXJuaW5nOiBpbmRpcmVjdCBleHRlcm5hbCBjYWxsIVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSB3aGlsZSAodGhpcy5fc3RhdGUgIT09IEF1dG9ydW5TdGF0ZS51cFRvRGF0ZSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvdW50LS07XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Rm4oKCkgPT4gdGhpcy5fdXBkYXRlQ291bnQgPj0gMCk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlUG9zc2libGVDaGFuZ2Uob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8YW55Pik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gQXV0b3J1blN0YXRlLnVwVG9EYXRlICYmIHRoaXMuX2lzRGVwZW5kZW5jeShvYnNlcnZhYmxlKSkge1xuXHRcdFx0dGhpcy5fY2hlY2tJdGVyYXRpb25zKCk7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IEF1dG9ydW5TdGF0ZS5kZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVDaGFuZ2U8VCwgVENoYW5nZT4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGVXaXRoQ2hhbmdlPFQsIFRDaGFuZ2U+LCBjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEZXBlbmRlbmN5KG9ic2VydmFibGUpKSB7XG5cdFx0XHRnZXRMb2dnZXIoKT8uaGFuZGxlQXV0b3J1bkRlcGVuZGVuY3lDaGFuZ2VkKHRoaXMsIG9ic2VydmFibGUsIGNoYW5nZSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBXYXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdFx0XHRjb25zdCBzaG91bGRSZWFjdCA9IHRoaXMuX2NoYW5nZVRyYWNrZXIgPyB0aGlzLl9jaGFuZ2VUcmFja2VyLmhhbmRsZUNoYW5nZSh7XG5cdFx0XHRcdFx0Y2hhbmdlZE9ic2VydmFibGU6IG9ic2VydmFibGUsXG5cdFx0XHRcdFx0Y2hhbmdlLFxuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdGRpZENoYW5nZTogKG8pOiB0aGlzIGlzIGFueSA9PiBvID09PSBvYnNlcnZhYmxlIGFzIGFueSxcblx0XHRcdFx0fSwgdGhpcy5fY2hhbmdlU3VtbWFyeSEpIDogdHJ1ZTtcblx0XHRcdFx0aWYgKHNob3VsZFJlYWN0KSB7XG5cdFx0XHRcdFx0dGhpcy5fY2hlY2tJdGVyYXRpb25zKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBBdXRvcnVuU3RhdGUuc3RhbGU7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0b25CdWdJbmRpY2F0aW5nRXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNEZXBlbmRlbmN5KG9ic2VydmFibGU6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxhbnksIGFueT4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVwZW5kZW5jaWVzLmhhcyhvYnNlcnZhYmxlKSAmJiAhdGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuaGFzKG9ic2VydmFibGUpO1xuXHR9XG5cblx0Ly8gSVJlYWRlciBpbXBsZW1lbnRhdGlvblxuXG5cdHByaXZhdGUgX2Vuc3VyZU5vUnVubmluZygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzUnVubmluZykgeyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdUaGUgcmVhZGVyIG9iamVjdCBjYW5ub3QgYmUgdXNlZCBvdXRzaWRlIGl0cyBjb21wdXRlIGZ1bmN0aW9uIScpOyB9XG5cdH1cblxuXHRwdWJsaWMgcmVhZE9ic2VydmFibGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiBUIHtcblx0XHR0aGlzLl9lbnN1cmVOb1J1bm5pbmcoKTtcblxuXHRcdC8vIEluIGNhc2UgdGhlIHJ1biBhY3Rpb24gZGlzcG9zZXMgdGhlIGF1dG9ydW5cblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBvYnNlcnZhYmxlLmdldCgpOyAvLyB3YXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdH1cblxuXHRcdG9ic2VydmFibGUuYWRkT2JzZXJ2ZXIodGhpcyk7IC8vIHdhcm5pbmc6IGV4dGVybmFsIGNhbGwhXG5cdFx0Y29uc3QgdmFsdWUgPSBvYnNlcnZhYmxlLmdldCgpOyAvLyB3YXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdHRoaXMuX2RlcGVuZGVuY2llcy5hZGQob2JzZXJ2YWJsZSk7XG5cdFx0dGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuZGVsZXRlKG9ic2VydmFibGUpO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBzdG9yZSgpOiBEaXNwb3NhYmxlU3RvcmUge1xuXHRcdHRoaXMuX2Vuc3VyZU5vUnVubmluZygpO1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ2Fubm90IGFjY2VzcyBzdG9yZSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0b3JlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9kZWxheWVkU3RvcmU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IGRlbGF5ZWRTdG9yZSgpOiBEaXNwb3NhYmxlU3RvcmUge1xuXHRcdHRoaXMuX2Vuc3VyZU5vUnVubmluZygpO1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ2Fubm90IGFjY2VzcyBzdG9yZSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RlbGF5ZWRTdG9yZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kZWxheWVkU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kZWxheWVkU3RvcmU7XG5cdH1cblxuXHRwdWJsaWMgZGVidWdHZXRTdGF0ZSgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNSdW5uaW5nOiB0aGlzLl9pc1J1bm5pbmcsXG5cdFx0XHR1cGRhdGVDb3VudDogdGhpcy5fdXBkYXRlQ291bnQsXG5cdFx0XHRkZXBlbmRlbmNpZXM6IHRoaXMuX2RlcGVuZGVuY2llcyxcblx0XHRcdHN0YXRlOiB0aGlzLl9zdGF0ZSxcblx0XHRcdHN0YXRlU3RyOiBhdXRvcnVuU3RhdGVUb1N0cmluZyh0aGlzLl9zdGF0ZSksXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBkZWJ1Z1JlcnVuKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNSdW5uaW5nKSB7XG5cdFx0XHR0aGlzLl9ydW4oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBBdXRvcnVuU3RhdGUuc3RhbGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tJdGVyYXRpb25zKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9pdGVyYXRpb24gPiAxMDApIHtcblx0XHRcdG9uQnVnSW5kaWNhdGluZ0Vycm9yKG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoYEF1dG9ydW4gJyR7dGhpcy5kZWJ1Z05hbWV9JyBpcyBzdHVjayBpbiBhbiBpbmZpbml0ZSB1cGRhdGUgbG9vcC5gKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLFVBQVUsb0JBQW9CLGlCQUE4QixnQkFBZ0Isc0JBQXNCLHVCQUF1QjtBQUNsSSxTQUFTLGlCQUFpQjtBQUluQixJQUFXLGVBQVgsa0JBQVdBLGtCQUFYO0FBS04sRUFBQUEsNEJBQUEsa0NBQStCLEtBQS9CO0FBS0EsRUFBQUEsNEJBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsNEJBQUEsY0FBVyxLQUFYO0FBWGlCLFNBQUFBO0FBQUEsR0FBQTtBQWNsQixTQUFTLHFCQUFxQixPQUE2QjtBQUMxRCxVQUFRLE9BQU87QUFBQSxJQUNkLEtBQUs7QUFBMkMsYUFBTztBQUFBLElBQ3ZELEtBQUs7QUFBb0IsYUFBTztBQUFBLElBQ2hDLEtBQUs7QUFBdUIs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QztBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGNBQWMsWUFBc0Q7QUFDM0UsV0FBTyxLQUFLLGNBQWMsSUFBSSxVQUFVLEtBQUssQ0FBQyxLQUFLLHlCQUF5QixJQUFJLFVBQVU7QUFBQSxFQUMzRjtBQUFBO0FBQUEsRUFJUSxtQkFBeUI7QUFDaEMsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUFFLFlBQU0sSUFBSSxtQkFBbUIsZ0VBQWdFO0FBQUEsSUFBRztBQUFBLEVBQ3pIO0FBQUEsRUFFTyxlQUFrQixZQUErQjtBQUN2RCxTQUFLLGlCQUFpQjtBQUd0QixRQUFJLEtBQUssV0FBVztBQUNuQixhQUFPLFdBQVcsSUFBSTtBQUFBLElBQ3ZCO0FBRUEsZUFBVyxZQUFZLElBQUk7QUFDM0IsVUFBTSxRQUFRLFdBQVcsSUFBSTtBQUM3QixTQUFLLGNBQWMsSUFBSSxVQUFVO0FBQ2pDLFNBQUsseUJBQXlCLE9BQU8sVUFBVTtBQUMvQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBR0EsSUFBSSxRQUF5QjtBQUM1QixTQUFLLGlCQUFpQjtBQUN0QixRQUFJLEtBQUssV0FBVztBQUNuQixZQUFNLElBQUksbUJBQW1CLG1DQUFtQztBQUFBLElBQ2pFO0FBRUEsUUFBSSxLQUFLLFdBQVcsUUFBVztBQUM5QixXQUFLLFNBQVMsSUFBSSxnQkFBZ0I7QUFBQSxJQUNuQztBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUdBLElBQUksZUFBZ0M7QUFDbkMsU0FBSyxpQkFBaUI7QUFDdEIsUUFBSSxLQUFLLFdBQVc7QUFDbkIsWUFBTSxJQUFJLG1CQUFtQixtQ0FBbUM7QUFBQSxJQUNqRTtBQUVBLFFBQUksS0FBSyxrQkFBa0IsUUFBVztBQUNyQyxXQUFLLGdCQUFnQixJQUFJLGdCQUFnQjtBQUFBLElBQzFDO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sZ0JBQWdCO0FBQ3RCLFdBQU87QUFBQSxNQUNOLFdBQVcsS0FBSztBQUFBLE1BQ2hCLGFBQWEsS0FBSztBQUFBLE1BQ2xCLGNBQWMsS0FBSztBQUFBLE1BQ25CLE9BQU8sS0FBSztBQUFBLE1BQ1osVUFBVSxxQkFBcUIsS0FBSyxNQUFNO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUEsRUFFTyxhQUFtQjtBQUN6QixRQUFJLENBQUMsS0FBSyxZQUFZO0FBQ3JCLFdBQUssS0FBSztBQUFBLElBQ1gsT0FBTztBQUNOLFdBQUssU0FBUztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQkFBNEI7QUFDbkMsUUFBSSxLQUFLLGFBQWEsS0FBSztBQUMxQiwyQkFBcUIsSUFBSSxtQkFBbUIsWUFBWSxLQUFLLFNBQVMsd0NBQXdDLENBQUM7QUFDL0csYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogWyJBdXRvcnVuU3RhdGUiXQp9Cg==
