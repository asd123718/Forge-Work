import { BaseObservable } from "./baseObservable.js";
import { BugIndicatingError, DisposableStore, assertFn, onBugIndicatingError } from "../commonFacade/deps.js";
import { getLogger } from "../logging/logging.js";
var DerivedState = /* @__PURE__ */ ((DerivedState2) => {
  DerivedState2[DerivedState2["initial"] = 0] = "initial";
  DerivedState2[DerivedState2["dependenciesMightHaveChanged"] = 1] = "dependenciesMightHaveChanged";
  DerivedState2[DerivedState2["stale"] = 2] = "stale";
  DerivedState2[DerivedState2["upToDate"] = 3] = "upToDate";
  return DerivedState2;
})(DerivedState || {});
function derivedStateToString(state) {
  switch (state) {
    case 0 /* initial */:
      return "initial";
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
class Derived extends BaseObservable {
  constructor(_debugNameData, _computeFn, _changeTracker, _handleLastObserverRemoved = void 0, _equalityComparator, debugLocation) {
    super(debugLocation);
    this._debugNameData = _debugNameData;
    this._computeFn = _computeFn;
    this._changeTracker = _changeTracker;
    this._handleLastObserverRemoved = _handleLastObserverRemoved;
    this._equalityComparator = _equalityComparator;
    this._state = 0 /* initial */;
    this._value = void 0;
    this._updateCount = 0;
    this._dependencies = /* @__PURE__ */ new Set();
    this._dependenciesToBeRemoved = /* @__PURE__ */ new Set();
    this._changeSummary = void 0;
    this._isUpdating = false;
    this._isComputing = false;
    this._didReportChange = false;
    this._isInBeforeUpdate = false;
    this._isReaderValid = false;
    this._store = void 0;
    this._delayedStore = void 0;
    this._removedObserverToCallEndUpdateOn = null;
    this._changeSummary = this._changeTracker?.createChangeSummary(void 0);
  }
  get debugName() {
    return this._debugNameData.getDebugName(this) ?? "(anonymous)";
  }
  onLastObserverRemoved() {
    this._state = 0 /* initial */;
    this._value = void 0;
    getLogger()?.handleDerivedCleared(this);
    for (const d of this._dependencies) {
      d.removeObserver(this);
    }
    this._dependencies.clear();
    if (this._store !== void 0) {
      this._store.dispose();
      this._store = void 0;
    }
    if (this._delayedStore !== void 0) {
      this._delayedStore.dispose();
      this._delayedStore = void 0;
    }
    this._handleLastObserverRemoved?.();
  }
  get() {
    const checkEnabled = false;
    if (this._isComputing && checkEnabled) {
      throw new BugIndicatingError("Cyclic deriveds are not supported yet!");
    }
    if (this._observers.size === 0) {
      let result;
      try {
        this._isReaderValid = true;
        let changeSummary = void 0;
        if (this._changeTracker) {
          changeSummary = this._changeTracker.createChangeSummary(void 0);
          this._changeTracker.beforeUpdate?.(this, changeSummary);
        }
        result = this._computeFn(this, changeSummary);
      } finally {
        this._isReaderValid = false;
      }
      this.onLastObserverRemoved();
      return result;
    } else {
      do {
        if (this._state === 1 /* dependenciesMightHaveChanged */) {
          for (const d of this._dependencies) {
            d.reportChanges();
            if (this._state === 2 /* stale */) {
              break;
            }
          }
        }
        if (this._state === 1 /* dependenciesMightHaveChanged */) {
          this._state = 3 /* upToDate */;
        }
        if (this._state !== 3 /* upToDate */) {
          this._recompute();
        }
      } while (this._state !== 3 /* upToDate */);
      return this._value;
    }
  }
  _recompute() {
    let didChange = false;
    this._isComputing = true;
    this._didReportChange = false;
    const emptySet = this._dependenciesToBeRemoved;
    this._dependenciesToBeRemoved = this._dependencies;
    this._dependencies = emptySet;
    try {
      const changeSummary = this._changeSummary;
      this._isReaderValid = true;
      if (this._changeTracker) {
        this._isInBeforeUpdate = true;
        this._changeTracker.beforeUpdate?.(this, changeSummary);
        this._isInBeforeUpdate = false;
        this._changeSummary = this._changeTracker?.createChangeSummary(changeSummary);
      }
      const hadValue = this._state !== 0 /* initial */;
      const oldValue = this._value;
      this._state = 3 /* upToDate */;
      const delayedStore = this._delayedStore;
      if (delayedStore !== void 0) {
        this._delayedStore = void 0;
      }
      try {
        if (this._store !== void 0) {
          this._store.dispose();
          this._store = void 0;
        }
        this._value = this._computeFn(this, changeSummary);
      } finally {
        this._isReaderValid = false;
        for (const o of this._dependenciesToBeRemoved) {
          o.removeObserver(this);
        }
        this._dependenciesToBeRemoved.clear();
        if (delayedStore !== void 0) {
          delayedStore.dispose();
        }
      }
      didChange = this._didReportChange || hadValue && !this._equalityComparator(oldValue, this._value);
      getLogger()?.handleObservableUpdated(this, {
        oldValue,
        newValue: this._value,
        change: void 0,
        didChange,
        hadValue
      });
    } catch (e) {
      onBugIndicatingError(e);
    }
    this._isComputing = false;
    if (!this._didReportChange && didChange) {
      for (const r of this._observers) {
        r.handleChange(this, void 0);
      }
    } else {
      this._didReportChange = false;
    }
  }
  toString() {
    return `LazyDerived<${this.debugName}>`;
  }
  // IObserver Implementation
  beginUpdate(_observable) {
    if (this._isUpdating) {
      throw new BugIndicatingError("Cyclic deriveds are not supported yet!");
    }
    this._updateCount++;
    this._isUpdating = true;
    try {
      const propagateBeginUpdate = this._updateCount === 1;
      if (this._state === 3 /* upToDate */) {
        this._state = 1 /* dependenciesMightHaveChanged */;
        if (!propagateBeginUpdate) {
          for (const r of this._observers) {
            r.handlePossibleChange(this);
          }
        }
      }
      if (propagateBeginUpdate) {
        for (const r of this._observers) {
          r.beginUpdate(this);
        }
      }
    } finally {
      this._isUpdating = false;
    }
  }
  endUpdate(_observable) {
    this._updateCount--;
    if (this._updateCount === 0) {
      const observers = [...this._observers];
      for (const r of observers) {
        r.endUpdate(this);
      }
      if (this._removedObserverToCallEndUpdateOn) {
        const observers2 = [...this._removedObserverToCallEndUpdateOn];
        this._removedObserverToCallEndUpdateOn = null;
        for (const r of observers2) {
          r.endUpdate(this);
        }
      }
    }
    assertFn(() => this._updateCount >= 0);
  }
  handlePossibleChange(observable) {
    if (this._state === 3 /* upToDate */ && this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable)) {
      this._state = 1 /* dependenciesMightHaveChanged */;
      for (const r of this._observers) {
        r.handlePossibleChange(this);
      }
    }
  }
  handleChange(observable, change) {
    if (this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable) || this._isInBeforeUpdate) {
      getLogger()?.handleDerivedDependencyChanged(this, observable, change);
      let shouldReact = false;
      try {
        shouldReact = this._changeTracker ? this._changeTracker.handleChange({
          changedObservable: observable,
          change,
          // eslint-disable-next-line local/code-no-any-casts
          didChange: (o) => o === observable
        }, this._changeSummary) : true;
      } catch (e) {
        onBugIndicatingError(e);
      }
      const wasUpToDate = this._state === 3 /* upToDate */;
      if (shouldReact && (this._state === 1 /* dependenciesMightHaveChanged */ || wasUpToDate)) {
        this._state = 2 /* stale */;
        if (wasUpToDate) {
          for (const r of this._observers) {
            r.handlePossibleChange(this);
          }
        }
      }
    }
  }
  // IReader Implementation
  _ensureReaderValid() {
    if (!this._isReaderValid) {
      throw new BugIndicatingError("The reader object cannot be used outside its compute function!");
    }
  }
  readObservable(observable) {
    this._ensureReaderValid();
    observable.addObserver(this);
    const value = observable.get();
    this._dependencies.add(observable);
    this._dependenciesToBeRemoved.delete(observable);
    return value;
  }
  reportChange(change) {
    this._ensureReaderValid();
    this._didReportChange = true;
    for (const r of this._observers) {
      r.handleChange(this, change);
    }
  }
  get store() {
    this._ensureReaderValid();
    if (this._store === void 0) {
      this._store = new DisposableStore();
    }
    return this._store;
  }
  get delayedStore() {
    this._ensureReaderValid();
    if (this._delayedStore === void 0) {
      this._delayedStore = new DisposableStore();
    }
    return this._delayedStore;
  }
  addObserver(observer) {
    const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCount > 0;
    super.addObserver(observer);
    if (shouldCallBeginUpdate) {
      if (!this._removedObserverToCallEndUpdateOn?.delete(observer)) {
        observer.beginUpdate(this);
      }
    }
  }
  removeObserver(observer) {
    if (this._observers.has(observer) && this._updateCount > 0) {
      if (!this._removedObserverToCallEndUpdateOn) {
        this._removedObserverToCallEndUpdateOn = /* @__PURE__ */ new Set();
      }
      this._removedObserverToCallEndUpdateOn.add(observer);
    }
    super.removeObserver(observer);
  }
  debugGetState() {
    return {
      state: this._state,
      stateStr: derivedStateToString(this._state),
      updateCount: this._updateCount,
      isComputing: this._isComputing,
      dependencies: this._dependencies,
      value: this._value
    };
  }
  debugSetValue(newValue) {
    this._value = newValue;
  }
  debugRecompute() {
    this.beginUpdate(this);
    try {
      if (!this._isComputing) {
        this._recompute();
      } else {
        this._state = 2 /* stale */;
      }
    } finally {
      this.endUpdate(this);
    }
  }
  setValue(newValue, tx, change) {
    this._value = newValue;
    const observers = this._observers;
    tx.updateObserver(this, this);
    for (const d of observers) {
      d.handleChange(this, change);
    }
  }
}
class DerivedWithSetter extends Derived {
  constructor(debugNameData, computeFn, changeTracker, handleLastObserverRemoved = void 0, equalityComparator, set, debugLocation) {
    super(
      debugNameData,
      computeFn,
      changeTracker,
      handleLastObserverRemoved,
      equalityComparator,
      debugLocation
    );
    this.set = set;
  }
}
export {
  Derived,
  DerivedState,
  DerivedWithSetter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxcb2JzZXJ2YWJsZXNcXGRlcml2ZWRJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSU9ic2VydmFibGUsIElPYnNlcnZhYmxlV2l0aENoYW5nZSwgSU9ic2VydmVyLCBJUmVhZGVyV2l0aFN0b3JlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIH0gZnJvbSAnLi4vYmFzZS5qcyc7XG5pbXBvcnQgeyBCYXNlT2JzZXJ2YWJsZSB9IGZyb20gJy4vYmFzZU9ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRGVidWdOYW1lRGF0YSB9IGZyb20gJy4uL2RlYnVnTmFtZS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIERpc3Bvc2FibGVTdG9yZSwgRXF1YWxpdHlDb21wYXJlciwgYXNzZXJ0Rm4sIG9uQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vY29tbW9uRmFjYWRlL2RlcHMuanMnO1xuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2luZy9sb2dnaW5nLmpzJztcbmltcG9ydCB7IElDaGFuZ2VUcmFja2VyIH0gZnJvbSAnLi4vY2hhbmdlVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0xvY2F0aW9uIH0gZnJvbSAnLi4vZGVidWdMb2NhdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlcml2ZWRSZWFkZXI8VENoYW5nZSA9IHZvaWQ+IGV4dGVuZHMgSVJlYWRlcldpdGhTdG9yZSB7XG5cdC8qKlxuXHQgKiBDYWxsIHRoaXMgdG8gcmVwb3J0IGEgY2hhbmdlIGRlbHRhIG9yIHRvIGZvcmNlIHJlcG9ydCBhIGNoYW5nZSwgZXZlbiBpZiB0aGUgbmV3IHZhbHVlIGlzIHRoZSBzYW1lIGFzIHRoZSBvbGQgdmFsdWUuXG5cdCovXG5cdHJlcG9ydENoYW5nZShjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBEZXJpdmVkU3RhdGUge1xuXHQvKiogSW5pdGlhbCBzdGF0ZSwgbm8gcHJldmlvdXMgdmFsdWUsIHJlY29tcHV0YXRpb24gbmVlZGVkICovXG5cdGluaXRpYWwgPSAwLFxuXG5cdC8qKlxuXHQgKiBBIGRlcGVuZGVuY3kgY291bGQgaGF2ZSBjaGFuZ2VkLlxuXHQgKiBXZSBuZWVkIHRvIGV4cGxpY2l0bHkgYXNrIHRoZW0gaWYgYXQgbGVhc3Qgb25lIGRlcGVuZGVuY3kgY2hhbmdlZC5cblx0ICovXG5cdGRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQgPSAxLFxuXG5cdC8qKlxuXHQgKiBBIGRlcGVuZGVuY3kgY2hhbmdlZCBhbmQgd2UgbmVlZCB0byByZWNvbXB1dGUuXG5cdCAqIEFmdGVyIHJlY29tcHV0YXRpb24sIHdlIG5lZWQgdG8gY2hlY2sgdGhlIHByZXZpb3VzIHZhbHVlIHRvIHNlZSBpZiB3ZSBjaGFuZ2VkIGFzIHdlbGwuXG5cdCAqL1xuXHRzdGFsZSA9IDIsXG5cblx0LyoqXG5cdCAqIE5vIGNoYW5nZSByZXBvcnRlZCwgb3VyIGNhY2hlZCB2YWx1ZSBpcyB1cCB0byBkYXRlLlxuXHQgKi9cblx0dXBUb0RhdGUgPSAzLFxufVxuXG5mdW5jdGlvbiBkZXJpdmVkU3RhdGVUb1N0cmluZyhzdGF0ZTogRGVyaXZlZFN0YXRlKTogc3RyaW5nIHtcblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgRGVyaXZlZFN0YXRlLmluaXRpYWw6IHJldHVybiAnaW5pdGlhbCc7XG5cdFx0Y2FzZSBEZXJpdmVkU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZDogcmV0dXJuICdkZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkJztcblx0XHRjYXNlIERlcml2ZWRTdGF0ZS5zdGFsZTogcmV0dXJuICdzdGFsZSc7XG5cdFx0Y2FzZSBEZXJpdmVkU3RhdGUudXBUb0RhdGU6IHJldHVybiAndXBUb0RhdGUnO1xuXHRcdGRlZmF1bHQ6IHJldHVybiAnPHVua25vd24+Jztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVyaXZlZDxULCBUQ2hhbmdlU3VtbWFyeSA9IGFueSwgVENoYW5nZSA9IHZvaWQ+IGV4dGVuZHMgQmFzZU9ic2VydmFibGU8VCwgVENoYW5nZT4gaW1wbGVtZW50cyBJRGVyaXZlZFJlYWRlcjxUQ2hhbmdlPiwgSU9ic2VydmVyIHtcblx0cHJpdmF0ZSBfc3RhdGUgPSBEZXJpdmVkU3RhdGUuaW5pdGlhbDtcblx0cHJpdmF0ZSBfdmFsdWU6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3VwZGF0ZUNvdW50ID0gMDtcblx0cHJpdmF0ZSBfZGVwZW5kZW5jaWVzID0gbmV3IFNldDxJT2JzZXJ2YWJsZTxhbnk+PigpO1xuXHRwcml2YXRlIF9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZCA9IG5ldyBTZXQ8SU9ic2VydmFibGU8YW55Pj4oKTtcblx0cHJpdmF0ZSBfY2hhbmdlU3VtbWFyeTogVENoYW5nZVN1bW1hcnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzVXBkYXRpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNDb21wdXRpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlkUmVwb3J0Q2hhbmdlID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzSW5CZWZvcmVVcGRhdGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNSZWFkZXJWYWxpZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWxheWVkU3RvcmU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVtb3ZlZE9ic2VydmVyVG9DYWxsRW5kVXBkYXRlT246IFNldDxJT2JzZXJ2ZXI+IHwgbnVsbCA9IG51bGw7XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCBkZWJ1Z05hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdOYW1lRGF0YS5nZXREZWJ1Z05hbWUodGhpcykgPz8gJyhhbm9ueW1vdXMpJztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBfZGVidWdOYW1lRGF0YTogRGVidWdOYW1lRGF0YSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgX2NvbXB1dGVGbjogKHJlYWRlcjogSURlcml2ZWRSZWFkZXI8VENoYW5nZT4sIGNoYW5nZVN1bW1hcnk6IFRDaGFuZ2VTdW1tYXJ5KSA9PiBULFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZVRyYWNrZXI6IElDaGFuZ2VUcmFja2VyPFRDaGFuZ2VTdW1tYXJ5PiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVMYXN0T2JzZXJ2ZXJSZW1vdmVkOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXF1YWxpdHlDb21wYXJhdG9yOiBFcXVhbGl0eUNvbXBhcmVyPFQ+LFxuXHRcdGRlYnVnTG9jYXRpb246IERlYnVnTG9jYXRpb24sXG5cdCkge1xuXHRcdHN1cGVyKGRlYnVnTG9jYXRpb24pO1xuXHRcdHRoaXMuX2NoYW5nZVN1bW1hcnkgPSB0aGlzLl9jaGFuZ2VUcmFja2VyPy5jcmVhdGVDaGFuZ2VTdW1tYXJ5KHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25MYXN0T2JzZXJ2ZXJSZW1vdmVkKCk6IHZvaWQge1xuXHRcdC8qKlxuXHRcdCAqIFdlIGFyZSBub3QgdHJhY2tpbmcgY2hhbmdlcyBhbnltb3JlLCB0aHVzIHdlIGhhdmUgdG8gYXNzdW1lXG5cdFx0ICogdGhhdCBvdXIgY2FjaGUgaXMgaW52YWxpZC5cblx0XHQgKi9cblx0XHR0aGlzLl9zdGF0ZSA9IERlcml2ZWRTdGF0ZS5pbml0aWFsO1xuXHRcdHRoaXMuX3ZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGdldExvZ2dlcigpPy5oYW5kbGVEZXJpdmVkQ2xlYXJlZCh0aGlzKTtcblx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5fZGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRkLnJlbW92ZU9ic2VydmVyKHRoaXMpO1xuXHRcdH1cblx0XHR0aGlzLl9kZXBlbmRlbmNpZXMuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLl9zdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9zdG9yZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RlbGF5ZWRTdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kZWxheWVkU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZGVsYXllZFN0b3JlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhbmRsZUxhc3RPYnNlcnZlclJlbW92ZWQ/LigpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCgpOiBUIHtcblx0XHRjb25zdCBjaGVja0VuYWJsZWQgPSBmYWxzZTsgLy8gVE9ETyBzZXQgdG8gdHJ1ZVxuXHRcdGlmICh0aGlzLl9pc0NvbXB1dGluZyAmJiBjaGVja0VuYWJsZWQpIHtcblx0XHRcdC8vIGludmVzdGlnYXRlIHdoeSB0aGlzIGZhaWxzIGluIHRoZSBkaWZmIGVkaXRvciFcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0N5Y2xpYyBkZXJpdmVkcyBhcmUgbm90IHN1cHBvcnRlZCB5ZXQhJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX29ic2VydmVycy5zaXplID09PSAwKSB7XG5cdFx0XHRsZXQgcmVzdWx0O1xuXHRcdFx0Ly8gV2l0aG91dCBvYnNlcnZlcnMsIHdlIGRvbid0IGtub3cgd2hlbiB0byBjbGVhbiB1cCBzdHVmZi5cblx0XHRcdC8vIFRodXMsIHdlIGRvbid0IGNhY2hlIGFueXRoaW5nIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtzLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5faXNSZWFkZXJWYWxpZCA9IHRydWU7XG5cdFx0XHRcdGxldCBjaGFuZ2VTdW1tYXJ5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5fY2hhbmdlVHJhY2tlcikge1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkgPSB0aGlzLl9jaGFuZ2VUcmFja2VyLmNyZWF0ZUNoYW5nZVN1bW1hcnkodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl9jaGFuZ2VUcmFja2VyLmJlZm9yZVVwZGF0ZT8uKHRoaXMsIGNoYW5nZVN1bW1hcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX2NvbXB1dGVGbih0aGlzLCBjaGFuZ2VTdW1tYXJ5ISk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc1JlYWRlclZhbGlkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHQvLyBDbGVhciBuZXcgZGVwZW5kZW5jaWVzXG5cdFx0XHR0aGlzLm9uTGFzdE9ic2VydmVyUmVtb3ZlZCgpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdC8vIFdlIG1pZ2h0IG5vdCBnZXQgYSBub3RpZmljYXRpb24gZm9yIGEgZGVwZW5kZW5jeSB0aGF0IGNoYW5nZWQgd2hpbGUgaXQgaXMgdXBkYXRpbmcsXG5cdFx0XHRcdC8vIHRodXMgd2UgYWxzbyBoYXZlIHRvIGFzayBhbGwgb3VyIGRlcGVkZW5jaWVzIGlmIHRoZXkgY2hhbmdlZCBpbiB0aGlzIGNhc2UuXG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5fZGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0XHQvKiogbWlnaHQgY2FsbCB7QGxpbmsgaGFuZGxlQ2hhbmdlfSBpbmRpcmVjdGx5LCB3aGljaCBjb3VsZCBtYWtlIHVzIHN0YWxlICovXG5cdFx0XHRcdFx0XHRkLnJlcG9ydENoYW5nZXMoKTtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlIGFzIERlcml2ZWRTdGF0ZSA9PT0gRGVyaXZlZFN0YXRlLnN0YWxlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoZSBvdGhlciBkZXBlbmRlbmNpZXMgd2lsbCByZWZyZXNoIG9uIGRlbWFuZCwgc28gZWFybHkgYnJlYWtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2UgY2FsbGVkIHJlcG9ydCBjaGFuZ2VzIG9mIGFsbCBkZXBlbmRlbmNpZXMuXG5cdFx0XHRcdC8vIElmIHdlIGFyZSBzdGlsbCBub3Qgc3RhbGUsIHdlIGNhbiBhc3N1bWUgdG8gYmUgdXAgdG8gZGF0ZSBhZ2Fpbi5cblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBEZXJpdmVkU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlID0gRGVyaXZlZFN0YXRlLnVwVG9EYXRlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlICE9PSBEZXJpdmVkU3RhdGUudXBUb0RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWNvbXB1dGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJbiBjYXNlIHJlY29tcHV0YXRpb24gY2hhbmdlZCBvbmUgb2Ygb3VyIGRlcGVuZGVuY2llcywgd2UgbmVlZCB0byByZWNvbXB1dGUgYWdhaW4uXG5cdFx0XHR9IHdoaWxlICh0aGlzLl9zdGF0ZSAhPT0gRGVyaXZlZFN0YXRlLnVwVG9EYXRlKTtcblx0XHRcdHJldHVybiB0aGlzLl92YWx1ZSE7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb21wdXRlKCkge1xuXHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblx0XHR0aGlzLl9pc0NvbXB1dGluZyA9IHRydWU7XG5cdFx0dGhpcy5fZGlkUmVwb3J0Q2hhbmdlID0gZmFsc2U7XG5cblx0XHRjb25zdCBlbXB0eVNldCA9IHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkO1xuXHRcdHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkID0gdGhpcy5fZGVwZW5kZW5jaWVzO1xuXHRcdHRoaXMuX2RlcGVuZGVuY2llcyA9IGVtcHR5U2V0O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNoYW5nZVN1bW1hcnkgPSB0aGlzLl9jaGFuZ2VTdW1tYXJ5ITtcblxuXHRcdFx0dGhpcy5faXNSZWFkZXJWYWxpZCA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy5fY2hhbmdlVHJhY2tlcikge1xuXHRcdFx0XHR0aGlzLl9pc0luQmVmb3JlVXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY2hhbmdlVHJhY2tlci5iZWZvcmVVcGRhdGU/Lih0aGlzLCBjaGFuZ2VTdW1tYXJ5KTtcblx0XHRcdFx0dGhpcy5faXNJbkJlZm9yZVVwZGF0ZSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlVHJhY2tlcj8uY3JlYXRlQ2hhbmdlU3VtbWFyeShjaGFuZ2VTdW1tYXJ5KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaGFkVmFsdWUgPSB0aGlzLl9zdGF0ZSAhPT0gRGVyaXZlZFN0YXRlLmluaXRpYWw7XG5cdFx0XHRjb25zdCBvbGRWYWx1ZSA9IHRoaXMuX3ZhbHVlO1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBEZXJpdmVkU3RhdGUudXBUb0RhdGU7XG5cblx0XHRcdGNvbnN0IGRlbGF5ZWRTdG9yZSA9IHRoaXMuX2RlbGF5ZWRTdG9yZTtcblx0XHRcdGlmIChkZWxheWVkU3RvcmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9kZWxheWVkU3RvcmUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RvcmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9zdG9yZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvKiogbWlnaHQgY2FsbCB7QGxpbmsgaGFuZGxlQ2hhbmdlfSBpbmRpcmVjdGx5LCB3aGljaCBjb3VsZCBpbnZhbGlkYXRlIHVzICovXG5cdFx0XHRcdHRoaXMuX3ZhbHVlID0gdGhpcy5fY29tcHV0ZUZuKHRoaXMsIGNoYW5nZVN1bW1hcnkpO1xuXG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc1JlYWRlclZhbGlkID0gZmFsc2U7XG5cdFx0XHRcdC8vIFdlIGRvbid0IHdhbnQgb3VyIG9ic2VydmVkIG9ic2VydmFibGVzIHRvIHRoaW5rIHRoYXQgdGhleSBhcmUgKG5vdCBldmVuIHRlbXBvcmFyaWx5KSBub3QgYmVpbmcgb2JzZXJ2ZWQuXG5cdFx0XHRcdC8vIFRodXMsIHdlIG9ubHkgdW5zdWJzY3JpYmUgZnJvbSBvYnNlcnZhYmxlcyB0aGF0IGFyZSBkZWZpbml0ZWx5IG5vdCByZWFkIGFueW1vcmUuXG5cdFx0XHRcdGZvciAoY29uc3QgbyBvZiB0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZCkge1xuXHRcdFx0XHRcdG8ucmVtb3ZlT2JzZXJ2ZXIodGhpcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuY2xlYXIoKTtcblxuXHRcdFx0XHRpZiAoZGVsYXllZFN0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWxheWVkU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGRpZENoYW5nZSA9IHRoaXMuX2RpZFJlcG9ydENoYW5nZSB8fCAoaGFkVmFsdWUgJiYgISh0aGlzLl9lcXVhbGl0eUNvbXBhcmF0b3Iob2xkVmFsdWUhLCB0aGlzLl92YWx1ZSkpKTtcblxuXHRcdFx0Z2V0TG9nZ2VyKCk/LmhhbmRsZU9ic2VydmFibGVVcGRhdGVkKHRoaXMsIHtcblx0XHRcdFx0b2xkVmFsdWUsXG5cdFx0XHRcdG5ld1ZhbHVlOiB0aGlzLl92YWx1ZSxcblx0XHRcdFx0Y2hhbmdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRpZENoYW5nZSxcblx0XHRcdFx0aGFkVmFsdWUsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvbkJ1Z0luZGljYXRpbmdFcnJvcihlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0NvbXB1dGluZyA9IGZhbHNlO1xuXG5cdFx0aWYgKCF0aGlzLl9kaWRSZXBvcnRDaGFuZ2UgJiYgZGlkQ2hhbmdlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdHIuaGFuZGxlQ2hhbmdlKHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RpZFJlcG9ydENoYW5nZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgTGF6eURlcml2ZWQ8JHt0aGlzLmRlYnVnTmFtZX0+YDtcblx0fVxuXG5cdC8vIElPYnNlcnZlciBJbXBsZW1lbnRhdGlvblxuXG5cdHB1YmxpYyBiZWdpblVwZGF0ZTxUPihfb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNVcGRhdGluZykge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ3ljbGljIGRlcml2ZWRzIGFyZSBub3Qgc3VwcG9ydGVkIHlldCEnKTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVDb3VudCsrO1xuXHRcdHRoaXMuX2lzVXBkYXRpbmcgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm9wYWdhdGVCZWdpblVwZGF0ZSA9IHRoaXMuX3VwZGF0ZUNvdW50ID09PSAxO1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBEZXJpdmVkU3RhdGUudXBUb0RhdGUpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGUgPSBEZXJpdmVkU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZDtcblx0XHRcdFx0Ly8gSWYgd2UgcHJvcGFnYXRlIGJlZ2luIHVwZGF0ZSwgdGhhdCB3aWxsIGFscmVhZHkgc2lnbmFsIGEgcG9zc2libGUgY2hhbmdlLlxuXHRcdFx0XHRpZiAoIXByb3BhZ2F0ZUJlZ2luVXBkYXRlKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0XHRcdFx0ci5oYW5kbGVQb3NzaWJsZUNoYW5nZSh0aGlzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwcm9wYWdhdGVCZWdpblVwZGF0ZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0ci5iZWdpblVwZGF0ZSh0aGlzKTsgLy8gVGhpcyBzaWduYWxzIGEgcG9zc2libGUgY2hhbmdlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNVcGRhdGluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBlbmRVcGRhdGU8VD4oX29ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+KTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlQ291bnQtLTtcblx0XHRpZiAodGhpcy5fdXBkYXRlQ291bnQgPT09IDApIHtcblx0XHRcdC8vIEVuZCB1cGRhdGUgY291bGQgY2hhbmdlIHRoZSBvYnNlcnZlciBsaXN0LlxuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXJzID0gWy4uLnRoaXMuX29ic2VydmVyc107XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2Ygb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdHIuZW5kVXBkYXRlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uKSB7XG5cdFx0XHRcdGNvbnN0IG9ic2VydmVycyA9IFsuLi50aGlzLl9yZW1vdmVkT2JzZXJ2ZXJUb0NhbGxFbmRVcGRhdGVPbl07XG5cdFx0XHRcdHRoaXMuX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uID0gbnVsbDtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIG9ic2VydmVycykge1xuXHRcdFx0XHRcdHIuZW5kVXBkYXRlKHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFzc2VydEZuKCgpID0+IHRoaXMuX3VwZGF0ZUNvdW50ID49IDApO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZVBvc3NpYmxlQ2hhbmdlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+KTogdm9pZCB7XG5cdFx0Ly8gSW4gYWxsIG90aGVyIHN0YXRlcywgb2JzZXJ2ZXJzIGFscmVhZHkga25vdyB0aGF0IHdlIG1pZ2h0IGhhdmUgY2hhbmdlZC5cblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IERlcml2ZWRTdGF0ZS51cFRvRGF0ZSAmJiB0aGlzLl9kZXBlbmRlbmNpZXMuaGFzKG9ic2VydmFibGUpICYmICF0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZC5oYXMob2JzZXJ2YWJsZSkpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdHIuaGFuZGxlUG9zc2libGVDaGFuZ2UodGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhbmRsZUNoYW5nZTxULCBUQ2hhbmdlPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8VCwgVENoYW5nZT4sIGNoYW5nZTogVENoYW5nZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZXBlbmRlbmNpZXMuaGFzKG9ic2VydmFibGUpICYmICF0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZC5oYXMob2JzZXJ2YWJsZSkgfHwgdGhpcy5faXNJbkJlZm9yZVVwZGF0ZSkge1xuXHRcdFx0Z2V0TG9nZ2VyKCk/LmhhbmRsZURlcml2ZWREZXBlbmRlbmN5Q2hhbmdlZCh0aGlzLCBvYnNlcnZhYmxlLCBjaGFuZ2UpO1xuXG5cdFx0XHRsZXQgc2hvdWxkUmVhY3QgPSBmYWxzZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNob3VsZFJlYWN0ID0gdGhpcy5fY2hhbmdlVHJhY2tlciA/IHRoaXMuX2NoYW5nZVRyYWNrZXIuaGFuZGxlQ2hhbmdlKHtcblx0XHRcdFx0XHRjaGFuZ2VkT2JzZXJ2YWJsZTogb2JzZXJ2YWJsZSxcblx0XHRcdFx0XHRjaGFuZ2UsXG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0ZGlkQ2hhbmdlOiAobyk6IHRoaXMgaXMgYW55ID0+IG8gPT09IG9ic2VydmFibGUgYXMgYW55LFxuXHRcdFx0XHR9LCB0aGlzLl9jaGFuZ2VTdW1tYXJ5ISkgOiB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRvbkJ1Z0luZGljYXRpbmdFcnJvcihlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2FzVXBUb0RhdGUgPSB0aGlzLl9zdGF0ZSA9PT0gRGVyaXZlZFN0YXRlLnVwVG9EYXRlO1xuXHRcdFx0aWYgKHNob3VsZFJlYWN0ICYmICh0aGlzLl9zdGF0ZSA9PT0gRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQgfHwgd2FzVXBUb0RhdGUpKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gRGVyaXZlZFN0YXRlLnN0YWxlO1xuXHRcdFx0XHRpZiAod2FzVXBUb0RhdGUpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0XHRyLmhhbmRsZVBvc3NpYmxlQ2hhbmdlKHRoaXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIElSZWFkZXIgSW1wbGVtZW50YXRpb25cblxuXHRwcml2YXRlIF9lbnN1cmVSZWFkZXJWYWxpZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzUmVhZGVyVmFsaWQpIHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVGhlIHJlYWRlciBvYmplY3QgY2Fubm90IGJlIHVzZWQgb3V0c2lkZSBpdHMgY29tcHV0ZSBmdW5jdGlvbiEnKTsgfVxuXHR9XG5cblx0cHVibGljIHJlYWRPYnNlcnZhYmxlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+KTogVCB7XG5cdFx0dGhpcy5fZW5zdXJlUmVhZGVyVmFsaWQoKTtcblxuXHRcdC8vIFN1YnNjcmliZSBiZWZvcmUgZ2V0dGluZyB0aGUgdmFsdWUgdG8gZW5hYmxlIGNhY2hpbmdcblx0XHRvYnNlcnZhYmxlLmFkZE9ic2VydmVyKHRoaXMpO1xuXHRcdC8qKiBUaGlzIG1pZ2h0IGNhbGwge0BsaW5rIGhhbmRsZUNoYW5nZX0gaW5kaXJlY3RseSwgd2hpY2ggY291bGQgaW52YWxpZGF0ZSB1cyAqL1xuXHRcdGNvbnN0IHZhbHVlID0gb2JzZXJ2YWJsZS5nZXQoKTtcblx0XHQvLyBXaGljaCBpcyB3aHkgd2Ugb25seSBhZGQgdGhlIG9ic2VydmFibGUgdG8gdGhlIGRlcGVuZGVuY2llcyBub3cuXG5cdFx0dGhpcy5fZGVwZW5kZW5jaWVzLmFkZChvYnNlcnZhYmxlKTtcblx0XHR0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZC5kZWxldGUob2JzZXJ2YWJsZSk7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIHJlcG9ydENoYW5nZShjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVSZWFkZXJWYWxpZCgpO1xuXG5cdFx0dGhpcy5fZGlkUmVwb3J0Q2hhbmdlID0gdHJ1ZTtcblx0XHQvLyBUT0RPIGFkZCBsb2dnaW5nXG5cdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0ci5oYW5kbGVDaGFuZ2UodGhpcywgY2hhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgc3RvcmUoKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0XHR0aGlzLl9lbnN1cmVSZWFkZXJWYWxpZCgpO1xuXG5cdFx0aWYgKHRoaXMuX3N0b3JlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc3RvcmU7XG5cdH1cblxuXHRnZXQgZGVsYXllZFN0b3JlKCk6IERpc3Bvc2FibGVTdG9yZSB7XG5cdFx0dGhpcy5fZW5zdXJlUmVhZGVyVmFsaWQoKTtcblxuXHRcdGlmICh0aGlzLl9kZWxheWVkU3RvcmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZGVsYXllZFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVsYXllZFN0b3JlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFkZE9ic2VydmVyKG9ic2VydmVyOiBJT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHRjb25zdCBzaG91bGRDYWxsQmVnaW5VcGRhdGUgPSAhdGhpcy5fb2JzZXJ2ZXJzLmhhcyhvYnNlcnZlcikgJiYgdGhpcy5fdXBkYXRlQ291bnQgPiAwO1xuXHRcdHN1cGVyLmFkZE9ic2VydmVyKG9ic2VydmVyKTtcblxuXHRcdGlmIChzaG91bGRDYWxsQmVnaW5VcGRhdGUpIHtcblx0XHRcdGlmICghdGhpcy5fcmVtb3ZlZE9ic2VydmVyVG9DYWxsRW5kVXBkYXRlT24/LmRlbGV0ZShvYnNlcnZlcikpIHtcblx0XHRcdFx0b2JzZXJ2ZXIuYmVnaW5VcGRhdGUodGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbW92ZU9ic2VydmVyKG9ic2VydmVyOiBJT2JzZXJ2ZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb2JzZXJ2ZXJzLmhhcyhvYnNlcnZlcikgJiYgdGhpcy5fdXBkYXRlQ291bnQgPiAwKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uID0gbmV3IFNldCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVtb3ZlZE9ic2VydmVyVG9DYWxsRW5kVXBkYXRlT24uYWRkKG9ic2VydmVyKTtcblx0XHR9XG5cdFx0c3VwZXIucmVtb3ZlT2JzZXJ2ZXIob2JzZXJ2ZXIpO1xuXHR9XG5cblx0cHVibGljIGRlYnVnR2V0U3RhdGUoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXRlOiB0aGlzLl9zdGF0ZSxcblx0XHRcdHN0YXRlU3RyOiBkZXJpdmVkU3RhdGVUb1N0cmluZyh0aGlzLl9zdGF0ZSksXG5cdFx0XHR1cGRhdGVDb3VudDogdGhpcy5fdXBkYXRlQ291bnQsXG5cdFx0XHRpc0NvbXB1dGluZzogdGhpcy5faXNDb21wdXRpbmcsXG5cdFx0XHRkZXBlbmRlbmNpZXM6IHRoaXMuX2RlcGVuZGVuY2llcyxcblx0XHRcdHZhbHVlOiB0aGlzLl92YWx1ZSxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGRlYnVnU2V0VmFsdWUobmV3VmFsdWU6IHVua25vd24pIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHR0aGlzLl92YWx1ZSA9IG5ld1ZhbHVlIGFzIGFueTtcblx0fVxuXG5cdHB1YmxpYyBkZWJ1Z1JlY29tcHV0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmJlZ2luVXBkYXRlKHRoaXMpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ29tcHV0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29tcHV0ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc3RhdGUgPSBEZXJpdmVkU3RhdGUuc3RhbGU7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuZW5kVXBkYXRlKHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRWYWx1ZShuZXdWYWx1ZTogVCwgdHg6IElUcmFuc2FjdGlvbiwgY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsdWUgPSBuZXdWYWx1ZTtcblx0XHRjb25zdCBvYnNlcnZlcnMgPSB0aGlzLl9vYnNlcnZlcnM7XG5cdFx0dHgudXBkYXRlT2JzZXJ2ZXIodGhpcywgdGhpcyk7XG5cdFx0Zm9yIChjb25zdCBkIG9mIG9ic2VydmVycykge1xuXHRcdFx0ZC5oYW5kbGVDaGFuZ2UodGhpcywgY2hhbmdlKTtcblx0XHR9XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgRGVyaXZlZFdpdGhTZXR0ZXI8VCwgVENoYW5nZVN1bW1hcnkgPSBhbnksIFRPdXRDaGFuZ2VzID0gYW55PiBleHRlbmRzIERlcml2ZWQ8VCwgVENoYW5nZVN1bW1hcnksIFRPdXRDaGFuZ2VzPiBpbXBsZW1lbnRzIElTZXR0YWJsZU9ic2VydmFibGU8VCwgVE91dENoYW5nZXM+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0ZGVidWdOYW1lRGF0YTogRGVidWdOYW1lRGF0YSxcblx0XHRjb21wdXRlRm46IChyZWFkZXI6IElEZXJpdmVkUmVhZGVyPFRPdXRDaGFuZ2VzPiwgY2hhbmdlU3VtbWFyeTogVENoYW5nZVN1bW1hcnkpID0+IFQsXG5cdFx0Y2hhbmdlVHJhY2tlcjogSUNoYW5nZVRyYWNrZXI8VENoYW5nZVN1bW1hcnk+IHwgdW5kZWZpbmVkLFxuXHRcdGhhbmRsZUxhc3RPYnNlcnZlclJlbW92ZWQ6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0XHRlcXVhbGl0eUNvbXBhcmF0b3I6IEVxdWFsaXR5Q29tcGFyZXI8VD4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNldDogKHZhbHVlOiBULCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkLCBjaGFuZ2U6IFRPdXRDaGFuZ2VzKSA9PiB2b2lkLFxuXHRcdGRlYnVnTG9jYXRpb246IERlYnVnTG9jYXRpb24sXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0ZGVidWdOYW1lRGF0YSxcblx0XHRcdGNvbXB1dGVGbixcblx0XHRcdGNoYW5nZVRyYWNrZXIsXG5cdFx0XHRoYW5kbGVMYXN0T2JzZXJ2ZXJSZW1vdmVkLFxuXHRcdFx0ZXF1YWxpdHlDb21wYXJhdG9yLFxuXHRcdFx0ZGVidWdMb2NhdGlvbixcblx0XHQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLG9CQUFvQixpQkFBbUMsVUFBVSw0QkFBNEI7QUFDdEcsU0FBUyxpQkFBaUI7QUFXbkIsSUFBVyxlQUFYLGtCQUFXQSxrQkFBWDtBQUVOLEVBQUFBLDRCQUFBLGFBQVUsS0FBVjtBQU1BLEVBQUFBLDRCQUFBLGtDQUErQixL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
