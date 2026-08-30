import { autorun } from "../reactions/autorun.js";
import { observableValue } from "../observables/observableValue.js";
import { DisposableStore, toDisposable } from "../commonFacade/deps.js";
import { derived, derivedOpts } from "../observables/derived.js";
import { observableFromEvent } from "../observables/observableFromEvent.js";
import { observableSignal } from "../observables/observableSignal.js";
import { _setKeepObserved, _setRecomputeInitiallyAndOnChange } from "../observables/baseObservable.js";
import { DebugLocation } from "../debugLocation.js";
function observableFromPromise(promise) {
  const observable = observableValue("promiseValue", {});
  promise.then((value) => {
    observable.set({ value }, void 0);
  });
  return observable;
}
function signalFromObservable(owner, observable) {
  return derivedOpts({
    owner,
    equalsFn: () => false
  }, (reader) => {
    observable.read(reader);
  });
}
function debouncedObservable(observable, debounceMs, debugLocation = DebugLocation.ofCaller()) {
  let hasValue = false;
  let lastValue;
  let timeout = void 0;
  return observableFromEvent(void 0, (cb) => {
    const d = autorun((reader) => {
      const value = observable.read(reader);
      if (!hasValue) {
        hasValue = true;
        lastValue = value;
      } else {
        if (timeout) {
          clearTimeout(timeout);
        }
        const debounceDuration = typeof debounceMs === "number" ? debounceMs : debounceMs(lastValue, value);
        if (debounceDuration === 0) {
          lastValue = value;
          cb();
          return;
        }
        timeout = setTimeout(() => {
          lastValue = value;
          cb();
        }, debounceDuration);
      }
    });
    return {
      dispose() {
        d.dispose();
        hasValue = false;
        lastValue = void 0;
      }
    };
  }, () => {
    if (hasValue) {
      return lastValue;
    } else {
      return observable.get();
    }
  }, debugLocation);
}
function throttledObservable(observable, throttleMs, debugLocation = DebugLocation.ofCaller()) {
  let hasValue = false;
  let lastValue;
  let timeout = void 0;
  return observableFromEvent(void 0, (cb) => {
    const d = autorun((reader) => {
      const value = observable.read(reader);
      if (!hasValue) {
        hasValue = true;
        lastValue = value;
      } else if (!timeout) {
        timeout = setTimeout(() => {
          timeout = void 0;
          lastValue = observable.read(void 0);
          cb();
        }, throttleMs);
      }
    });
    return {
      dispose() {
        d.dispose();
        if (timeout) {
          clearTimeout(timeout);
          timeout = void 0;
        }
        hasValue = false;
        lastValue = void 0;
      }
    };
  }, () => {
    if (hasValue) {
      return lastValue;
    } else {
      return observable.get();
    }
  }, debugLocation);
}
function debouncedObservable2(observable, debounceMs, debugLocation = DebugLocation.ofCaller()) {
  const s = observableSignal("handleTimeout");
  let currentValue = void 0;
  let timeout = void 0;
  const d = derivedOpts({
    owner: void 0,
    onLastObserverRemoved: () => {
      currentValue = void 0;
    }
  }, (reader) => {
    const val = observable.read(reader);
    s.read(reader);
    if (val !== currentValue) {
      const debounceDuration = typeof debounceMs === "number" ? debounceMs : debounceMs(currentValue, val);
      if (debounceDuration === 0) {
        currentValue = val;
        return val;
      }
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        currentValue = val;
        s.trigger(void 0);
      }, debounceDuration);
    }
    return currentValue;
  }, debugLocation);
  return d;
}
function wasEventTriggeredRecently(event, timeoutMs, disposableStore) {
  const observable = observableValue("triggeredRecently", false);
  let timeout = void 0;
  disposableStore.add(event(() => {
    observable.set(true, void 0);
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      observable.set(false, void 0);
    }, timeoutMs);
  }));
  return observable;
}
function keepObserved(observable) {
  const o = new KeepAliveObserver(false, void 0);
  observable.addObserver(o);
  return toDisposable(() => {
    observable.removeObserver(o);
  });
}
_setKeepObserved(keepObserved);
function recomputeInitiallyAndOnChange(observable, handleValue) {
  const o = new KeepAliveObserver(true, handleValue);
  observable.addObserver(o);
  try {
    o.beginUpdate(observable);
  } finally {
    o.endUpdate(observable);
  }
  return toDisposable(() => {
    observable.removeObserver(o);
  });
}
_setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange);
class KeepAliveObserver {
  constructor(_forceRecompute, _handleValue) {
    this._forceRecompute = _forceRecompute;
    this._handleValue = _handleValue;
    this._counter = 0;
  }
  beginUpdate(observable) {
    this._counter++;
  }
  endUpdate(observable) {
    if (this._counter === 1 && this._forceRecompute) {
      if (this._handleValue) {
        this._handleValue(observable.get());
      } else {
        observable.reportChanges();
      }
    }
    this._counter--;
  }
  handlePossibleChange(observable) {
  }
  handleChange(observable, change) {
  }
}
function derivedObservableWithCache(owner, computeFn) {
  let lastValue = void 0;
  const observable = derivedOpts({ owner, debugReferenceFn: computeFn }, (reader) => {
    lastValue = computeFn(reader, lastValue);
    return lastValue;
  });
  return observable;
}
function derivedObservableWithWritableCache(owner, computeFn) {
  let lastValue = void 0;
  const onChange = observableSignal("derivedObservableWithWritableCache");
  const observable = derived(owner, (reader) => {
    onChange.read(reader);
    lastValue = computeFn(reader, lastValue);
    return lastValue;
  });
  return Object.assign(observable, {
    clearCache: (tx) => {
      lastValue = void 0;
      onChange.trigger(tx);
    },
    setCache: (newValue, tx) => {
      lastValue = newValue;
      onChange.trigger(tx);
    }
  });
}
function mapObservableArrayCached(owner, items, map, keySelector) {
  let m = new ArrayMap(map, keySelector);
  const self = derivedOpts({
    debugReferenceFn: map,
    owner,
    onLastObserverRemoved: () => {
      m.dispose();
      m = new ArrayMap(map);
    }
  }, (reader) => {
    const i = items.read(reader);
    m.setItems(i);
    return m.getItems();
  });
  return self;
}
class ArrayMap {
  constructor(_map, _keySelector) {
    this._map = _map;
    this._keySelector = _keySelector;
    this._cache = /* @__PURE__ */ new Map();
    this._items = [];
  }
  dispose() {
    this._cache.forEach((entry) => entry.store.dispose());
    this._cache.clear();
  }
  setItems(items) {
    const newItems = [];
    const itemsToRemove = new Set(this._cache.keys());
    for (const item of items) {
      const key = this._keySelector ? this._keySelector(item) : item;
      let entry = this._cache.get(key);
      if (!entry) {
        const store = new DisposableStore();
        const out = this._map(item, store);
        entry = { out, store };
        this._cache.set(key, entry);
      } else {
        itemsToRemove.delete(key);
      }
      newItems.push(entry.out);
    }
    for (const item of itemsToRemove) {
      const entry = this._cache.get(item);
      entry.store.dispose();
      this._cache.delete(item);
    }
    this._items = newItems;
  }
  getItems() {
    return this._items;
  }
}
function isObservable(obj) {
  return !!obj && obj.read !== void 0 && obj.reportChanges !== void 0;
}
export {
  KeepAliveObserver,
  debouncedObservable,
  debouncedObservable2,
  derivedObservableWithCache,
  derivedObservableWithWritableCache,
  isObservable,
  keepObserved,
  mapObservableArrayCached,
  observableFromPromise,
  recomputeInitiallyAndOnChange,
  signalFromObservable,
  throttledObservable,
  wasEventTriggeredRecently
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9ic2VydmFibGVJbnRlcm5hbFxcdXRpbHNcXHV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uL3JlYWN0aW9ucy9hdXRvcnVuLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElPYnNlcnZlciwgSVJlYWRlciwgSVRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vYmFzZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi9vYnNlcnZhYmxlcy9vYnNlcnZhYmxlVmFsdWUuanMnO1xuaW1wb3J0IHsgRGVidWdPd25lciB9IGZyb20gJy4uL2RlYnVnTmFtZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIEV2ZW50LCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vY29tbW9uRmFjYWRlL2RlcHMuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgZGVyaXZlZE9wdHMgfSBmcm9tICcuLi9vYnNlcnZhYmxlcy9kZXJpdmVkLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi9vYnNlcnZhYmxlcy9vYnNlcnZhYmxlRnJvbUV2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVTaWduYWwgfSBmcm9tICcuLi9vYnNlcnZhYmxlcy9vYnNlcnZhYmxlU2lnbmFsLmpzJztcbmltcG9ydCB7IF9zZXRLZWVwT2JzZXJ2ZWQsIF9zZXRSZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSB9IGZyb20gJy4uL29ic2VydmFibGVzL2Jhc2VPYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IERlYnVnTG9jYXRpb24gfSBmcm9tICcuLi9kZWJ1Z0xvY2F0aW9uLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIG9ic2VydmFibGVGcm9tUHJvbWlzZTxUPihwcm9taXNlOiBQcm9taXNlPFQ+KTogSU9ic2VydmFibGU8eyB2YWx1ZT86IFQgfT4ge1xuXHRjb25zdCBvYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHsgdmFsdWU/OiBUIH0+KCdwcm9taXNlVmFsdWUnLCB7fSk7XG5cdHByb21pc2UudGhlbigodmFsdWUpID0+IHtcblx0XHRvYnNlcnZhYmxlLnNldCh7IHZhbHVlIH0sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXHRyZXR1cm4gb2JzZXJ2YWJsZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25hbEZyb21PYnNlcnZhYmxlPFQ+KG93bmVyOiBEZWJ1Z093bmVyIHwgdW5kZWZpbmVkLCBvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IElPYnNlcnZhYmxlPHZvaWQ+IHtcblx0cmV0dXJuIGRlcml2ZWRPcHRzKHtcblx0XHRvd25lcixcblx0XHRlcXVhbHNGbjogKCkgPT4gZmFsc2UsXG5cdH0sIHJlYWRlciA9PiB7XG5cdFx0b2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gb2JzZXJ2YWJsZSB0aGF0IGRlYm91bmNlcyB0aGUgaW5wdXQgb2JzZXJ2YWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlYm91bmNlZE9ic2VydmFibGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4sIGRlYm91bmNlTXM6IG51bWJlciB8ICgobGFzdFZhbHVlOiBUIHwgdW5kZWZpbmVkLCBuZXdWYWx1ZTogVCkgPT4gbnVtYmVyKSwgZGVidWdMb2NhdGlvbiA9IERlYnVnTG9jYXRpb24ub2ZDYWxsZXIoKSk6IElPYnNlcnZhYmxlPFQ+IHtcblx0bGV0IGhhc1ZhbHVlID0gZmFsc2U7XG5cdGxldCBsYXN0VmFsdWU6IFQgfCB1bmRlZmluZWQ7XG5cblx0bGV0IHRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQ8VCwgdm9pZD4odW5kZWZpbmVkLCBjYiA9PiB7XG5cdFx0Y29uc3QgZCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gb2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICghaGFzVmFsdWUpIHtcblx0XHRcdFx0aGFzVmFsdWUgPSB0cnVlO1xuXHRcdFx0XHRsYXN0VmFsdWUgPSB2YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aW1lb3V0KSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGRlYm91bmNlRHVyYXRpb24gPSB0eXBlb2YgZGVib3VuY2VNcyA9PT0gJ251bWJlcicgPyBkZWJvdW5jZU1zIDogZGVib3VuY2VNcyhsYXN0VmFsdWUsIHZhbHVlKTtcblx0XHRcdFx0aWYgKGRlYm91bmNlRHVyYXRpb24gPT09IDApIHtcblx0XHRcdFx0XHRsYXN0VmFsdWUgPSB2YWx1ZTtcblx0XHRcdFx0XHRjYigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0bGFzdFZhbHVlID0gdmFsdWU7XG5cdFx0XHRcdFx0Y2IoKTtcblx0XHRcdFx0fSwgZGVib3VuY2VEdXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRoYXNWYWx1ZSA9IGZhbHNlO1xuXHRcdFx0XHRsYXN0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH0sICgpID0+IHtcblx0XHRpZiAoaGFzVmFsdWUpIHtcblx0XHRcdHJldHVybiBsYXN0VmFsdWUhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZS5nZXQoKTtcblx0XHR9XG5cdH0sIGRlYnVnTG9jYXRpb24pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gb2JzZXJ2YWJsZSB0aGF0IHRocm90dGxlcyB0aGUgaW5wdXQgb2JzZXJ2YWJsZS5cbiAqIFVubGlrZSB7QGxpbmsgZGVib3VuY2VkT2JzZXJ2YWJsZX0sIHRoZSB0aW1lciBzdGFydHMgb24gdGhlIGZpcnN0IGNoYW5nZVxuICogYW5kIGlzIG5vdCByZXNldCBieSBzdWJzZXF1ZW50IGNoYW5nZXMsIHByZXZlbnRpbmcgc3RhcnZhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRocm90dGxlZE9ic2VydmFibGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4sIHRocm90dGxlTXM6IG51bWJlciwgZGVidWdMb2NhdGlvbiA9IERlYnVnTG9jYXRpb24ub2ZDYWxsZXIoKSk6IElPYnNlcnZhYmxlPFQ+IHtcblx0bGV0IGhhc1ZhbHVlID0gZmFsc2U7XG5cdGxldCBsYXN0VmFsdWU6IFQgfCB1bmRlZmluZWQ7XG5cblx0bGV0IHRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQ8VCwgdm9pZD4odW5kZWZpbmVkLCBjYiA9PiB7XG5cdFx0Y29uc3QgZCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gb2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICghaGFzVmFsdWUpIHtcblx0XHRcdFx0aGFzVmFsdWUgPSB0cnVlO1xuXHRcdFx0XHRsYXN0VmFsdWUgPSB2YWx1ZTtcblx0XHRcdH0gZWxzZSBpZiAoIXRpbWVvdXQpIHtcblx0XHRcdFx0Ly8gT25seSBzdGFydCBhIHRpbWVyIGlmIG9uZSBpc24ndCBhbHJlYWR5IHJ1bm5pbmdcblx0XHRcdFx0dGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bGFzdFZhbHVlID0gb2JzZXJ2YWJsZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0Y2IoKTtcblx0XHRcdFx0fSwgdGhyb3R0bGVNcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRpZiAodGltZW91dCkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0XHR0aW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhc1ZhbHVlID0gZmFsc2U7XG5cdFx0XHRcdGxhc3RWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fTtcblx0fSwgKCkgPT4ge1xuXHRcdGlmIChoYXNWYWx1ZSkge1xuXHRcdFx0cmV0dXJuIGxhc3RWYWx1ZSE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBvYnNlcnZhYmxlLmdldCgpO1xuXHRcdH1cblx0fSwgZGVidWdMb2NhdGlvbik7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBvYnNlcnZhYmxlIHRoYXQgZGVib3VuY2VzIHRoZSBpbnB1dCBvYnNlcnZhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVib3VuY2VkT2JzZXJ2YWJsZTI8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4sIGRlYm91bmNlTXM6IG51bWJlciB8ICgoY3VycmVudFZhbHVlOiBUIHwgdW5kZWZpbmVkLCBuZXdWYWx1ZTogVCkgPT4gbnVtYmVyKSwgZGVidWdMb2NhdGlvbiA9IERlYnVnTG9jYXRpb24ub2ZDYWxsZXIoKSk6IElPYnNlcnZhYmxlPFQ+IHtcblx0Y29uc3QgcyA9IG9ic2VydmFibGVTaWduYWwoJ2hhbmRsZVRpbWVvdXQnKTtcblxuXHRsZXQgY3VycmVudFZhbHVlOiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRsZXQgdGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdCBkID0gZGVyaXZlZE9wdHMoe1xuXHRcdG93bmVyOiB1bmRlZmluZWQsXG5cdFx0b25MYXN0T2JzZXJ2ZXJSZW1vdmVkOiAoKSA9PiB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9LCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHZhbCA9IG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdHMucmVhZChyZWFkZXIpO1xuXG5cdFx0aWYgKHZhbCAhPT0gY3VycmVudFZhbHVlKSB7XG5cdFx0XHRjb25zdCBkZWJvdW5jZUR1cmF0aW9uID0gdHlwZW9mIGRlYm91bmNlTXMgPT09ICdudW1iZXInID8gZGVib3VuY2VNcyA6IGRlYm91bmNlTXMoY3VycmVudFZhbHVlLCB2YWwpO1xuXG5cdFx0XHRpZiAoZGVib3VuY2VEdXJhdGlvbiA9PT0gMCkge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSB2YWw7XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdH1cblx0XHRcdHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gdmFsO1xuXHRcdFx0XHRzLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdH0sIGRlYm91bmNlRHVyYXRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyZW50VmFsdWUhO1xuXHR9LCBkZWJ1Z0xvY2F0aW9uKTtcblxuXHRyZXR1cm4gZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhc0V2ZW50VHJpZ2dlcmVkUmVjZW50bHkoZXZlbnQ6IEV2ZW50PGFueT4sIHRpbWVvdXRNczogbnVtYmVyLCBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHtcblx0Y29uc3Qgb2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndHJpZ2dlcmVkUmVjZW50bHknLCBmYWxzZSk7XG5cblx0bGV0IHRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0ZGlzcG9zYWJsZVN0b3JlLmFkZChldmVudCgoKSA9PiB7XG5cdFx0b2JzZXJ2YWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGlmICh0aW1lb3V0KSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0fVxuXHRcdHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdG9ic2VydmFibGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH0sIHRpbWVvdXRNcyk7XG5cdH0pKTtcblxuXHRyZXR1cm4gb2JzZXJ2YWJsZTtcbn1cblxuLyoqXG4gKiBUaGlzIG1ha2VzIHN1cmUgdGhlIG9ic2VydmFibGUgaXMgYmVpbmcgb2JzZXJ2ZWQgYW5kIGtlZXBzIGl0cyBjYWNoZSBhbGl2ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGtlZXBPYnNlcnZlZDxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbyA9IG5ldyBLZWVwQWxpdmVPYnNlcnZlcihmYWxzZSwgdW5kZWZpbmVkKTtcblx0b2JzZXJ2YWJsZS5hZGRPYnNlcnZlcihvKTtcblx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0b2JzZXJ2YWJsZS5yZW1vdmVPYnNlcnZlcihvKTtcblx0fSk7XG59XG5cbl9zZXRLZWVwT2JzZXJ2ZWQoa2VlcE9ic2VydmVkKTtcblxuLyoqXG4gKiBUaGlzIGNvbnZlcnRzIHRoZSBnaXZlbiBvYnNlcnZhYmxlIGludG8gYW4gYXV0b3J1bi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+LCBoYW5kbGVWYWx1ZT86ICh2YWx1ZTogVCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbyA9IG5ldyBLZWVwQWxpdmVPYnNlcnZlcih0cnVlLCBoYW5kbGVWYWx1ZSk7XG5cdG9ic2VydmFibGUuYWRkT2JzZXJ2ZXIobyk7XG5cdHRyeSB7XG5cdFx0by5iZWdpblVwZGF0ZShvYnNlcnZhYmxlKTtcblx0fSBmaW5hbGx5IHtcblx0XHRvLmVuZFVwZGF0ZShvYnNlcnZhYmxlKTtcblx0fVxuXG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdG9ic2VydmFibGUucmVtb3ZlT2JzZXJ2ZXIobyk7XG5cdH0pO1xufVxuXG5fc2V0UmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UocmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UpO1xuXG5leHBvcnQgY2xhc3MgS2VlcEFsaXZlT2JzZXJ2ZXIgaW1wbGVtZW50cyBJT2JzZXJ2ZXIge1xuXHRwcml2YXRlIF9jb3VudGVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mb3JjZVJlY29tcHV0ZTogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVWYWx1ZTogKCh2YWx1ZTogYW55KSA9PiB2b2lkKSB8IHVuZGVmaW5lZCxcblx0KSB7IH1cblxuXHRiZWdpblVwZGF0ZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdHRoaXMuX2NvdW50ZXIrKztcblx0fVxuXG5cdGVuZFVwZGF0ZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb3VudGVyID09PSAxICYmIHRoaXMuX2ZvcmNlUmVjb21wdXRlKSB7XG5cdFx0XHRpZiAodGhpcy5faGFuZGxlVmFsdWUpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlVmFsdWUob2JzZXJ2YWJsZS5nZXQoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvYnNlcnZhYmxlLnJlcG9ydENoYW5nZXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fY291bnRlci0tO1xuXHR9XG5cblx0aGFuZGxlUG9zc2libGVDaGFuZ2U8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHQvLyBOTyBPUFxuXHR9XG5cblx0aGFuZGxlQ2hhbmdlPFQsIFRDaGFuZ2U+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxULCBUQ2hhbmdlPiwgY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0Ly8gTk8gT1Bcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGU8VD4ob3duZXI6IERlYnVnT3duZXIsIGNvbXB1dGVGbjogKHJlYWRlcjogSVJlYWRlciwgbGFzdFZhbHVlOiBUIHwgdW5kZWZpbmVkKSA9PiBUKTogSU9ic2VydmFibGU8VD4ge1xuXHRsZXQgbGFzdFZhbHVlOiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRjb25zdCBvYnNlcnZhYmxlID0gZGVyaXZlZE9wdHMoeyBvd25lciwgZGVidWdSZWZlcmVuY2VGbjogY29tcHV0ZUZuIH0sIHJlYWRlciA9PiB7XG5cdFx0bGFzdFZhbHVlID0gY29tcHV0ZUZuKHJlYWRlciwgbGFzdFZhbHVlKTtcblx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHR9KTtcblx0cmV0dXJuIG9ic2VydmFibGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhXcml0YWJsZUNhY2hlPFQ+KG93bmVyOiBvYmplY3QsIGNvbXB1dGVGbjogKHJlYWRlcjogSVJlYWRlciwgbGFzdFZhbHVlOiBUIHwgdW5kZWZpbmVkKSA9PiBUKTogSU9ic2VydmFibGU8VD5cblx0JiB7IGNsZWFyQ2FjaGUodHJhbnNhY3Rpb246IElUcmFuc2FjdGlvbik6IHZvaWQ7IHNldENhY2hlKG5ld1ZhbHVlOiBUIHwgdW5kZWZpbmVkLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB9IHtcblx0bGV0IGxhc3RWYWx1ZTogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y29uc3Qgb25DaGFuZ2UgPSBvYnNlcnZhYmxlU2lnbmFsKCdkZXJpdmVkT2JzZXJ2YWJsZVdpdGhXcml0YWJsZUNhY2hlJyk7XG5cdGNvbnN0IG9ic2VydmFibGUgPSBkZXJpdmVkKG93bmVyLCByZWFkZXIgPT4ge1xuXHRcdG9uQ2hhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRsYXN0VmFsdWUgPSBjb21wdXRlRm4ocmVhZGVyLCBsYXN0VmFsdWUpO1xuXHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdH0pO1xuXHRyZXR1cm4gT2JqZWN0LmFzc2lnbihvYnNlcnZhYmxlLCB7XG5cdFx0Y2xlYXJDYWNoZTogKHR4OiBJVHJhbnNhY3Rpb24pID0+IHtcblx0XHRcdGxhc3RWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdG9uQ2hhbmdlLnRyaWdnZXIodHgpO1xuXHRcdH0sXG5cdFx0c2V0Q2FjaGU6IChuZXdWYWx1ZTogVCB8IHVuZGVmaW5lZCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0bGFzdFZhbHVlID0gbmV3VmFsdWU7XG5cdFx0XHRvbkNoYW5nZS50cmlnZ2VyKHR4KTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIFdoZW4gdGhlIGl0ZW1zIGFycmF5IGNoYW5nZXMsIHJlZmVyZW50aWFsIGVxdWFsIGl0ZW1zIGFyZSBub3QgbWFwcGVkIGFnYWluLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkPFRJbiwgVE91dCwgVEtleSA9IFRJbj4ob3duZXI6IERlYnVnT3duZXIsIGl0ZW1zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBUSW5bXT4sIG1hcDogKGlucHV0OiBUSW4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpID0+IFRPdXQsIGtleVNlbGVjdG9yPzogKGlucHV0OiBUSW4pID0+IFRLZXkpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBUT3V0W10+IHtcblx0bGV0IG0gPSBuZXcgQXJyYXlNYXAobWFwLCBrZXlTZWxlY3Rvcik7XG5cdGNvbnN0IHNlbGYgPSBkZXJpdmVkT3B0cyh7XG5cdFx0ZGVidWdSZWZlcmVuY2VGbjogbWFwLFxuXHRcdG93bmVyLFxuXHRcdG9uTGFzdE9ic2VydmVyUmVtb3ZlZDogKCkgPT4ge1xuXHRcdFx0bS5kaXNwb3NlKCk7XG5cdFx0XHRtID0gbmV3IEFycmF5TWFwKG1hcCk7XG5cdFx0fVxuXHR9LCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3QgaSA9IGl0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRtLnNldEl0ZW1zKGkpO1xuXHRcdHJldHVybiBtLmdldEl0ZW1zKCk7XG5cdH0pO1xuXHRyZXR1cm4gc2VsZjtcbn1cblxuY2xhc3MgQXJyYXlNYXA8VEluLCBUT3V0LCBUS2V5PiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTWFwPFRLZXksIHsgb3V0OiBUT3V0OyBzdG9yZTogRGlzcG9zYWJsZVN0b3JlIH0+KCk7XG5cdHByaXZhdGUgX2l0ZW1zOiBUT3V0W10gPSBbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFwOiAoaW5wdXQ6IFRJbiwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSkgPT4gVE91dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXlTZWxlY3Rvcj86IChpbnB1dDogVEluKSA9PiBUS2V5LFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlLmZvckVhY2goZW50cnkgPT4gZW50cnkuc3RvcmUuZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9jYWNoZS5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljIHNldEl0ZW1zKGl0ZW1zOiByZWFkb25seSBUSW5bXSk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0l0ZW1zOiBUT3V0W10gPSBbXTtcblx0XHRjb25zdCBpdGVtc1RvUmVtb3ZlID0gbmV3IFNldCh0aGlzLl9jYWNoZS5rZXlzKCkpO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXlTZWxlY3RvciA/IHRoaXMuX2tleVNlbGVjdG9yKGl0ZW0pIDogaXRlbSBhcyB1bmtub3duIGFzIFRLZXk7XG5cblx0XHRcdGxldCBlbnRyeSA9IHRoaXMuX2NhY2hlLmdldChrZXkpO1xuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3Qgb3V0ID0gdGhpcy5fbWFwKGl0ZW0sIHN0b3JlKTtcblx0XHRcdFx0ZW50cnkgPSB7IG91dCwgc3RvcmUgfTtcblx0XHRcdFx0dGhpcy5fY2FjaGUuc2V0KGtleSwgZW50cnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXRlbXNUb1JlbW92ZS5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHRcdG5ld0l0ZW1zLnB1c2goZW50cnkub3V0KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXNUb1JlbW92ZSkge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9jYWNoZS5nZXQoaXRlbSkhO1xuXHRcdFx0ZW50cnkuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGl0ZW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2l0ZW1zID0gbmV3SXRlbXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SXRlbXMoKTogVE91dFtdIHtcblx0XHRyZXR1cm4gdGhpcy5faXRlbXM7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzT2JzZXJ2YWJsZTxUPihvYmo6IHVua25vd24pOiBvYmogaXMgSU9ic2VydmFibGU8VD4ge1xuXHRyZXR1cm4gISFvYmogJiYgKDxJT2JzZXJ2YWJsZTxUPj5vYmopLnJlYWQgIT09IHVuZGVmaW5lZCAmJiAoPElPYnNlcnZhYmxlPFQ+Pm9iaikucmVwb3J0Q2hhbmdlcyAhPT0gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBRXhCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsaUJBQXFDLG9CQUFvQjtBQUNsRSxTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCLHlDQUF5QztBQUNwRSxTQUFTLHFCQUFxQjtBQUV2QixTQUFTLHNCQUF5QixTQUFpRDtBQUN6RixRQUFNLGFBQWEsZ0JBQStCLGdCQUFnQixDQUFDLENBQUM7QUFDcEUsVUFBUSxLQUFLLENBQUMsVUFBVTtBQUN2QixlQUFXLElBQUksRUFBRSxNQUFNLEdBQUcsTUFBUztBQUFBLEVBQ3BDLENBQUM7QUFDRCxTQUFPO0FBQ1I7QUFFTyxTQUFTLHFCQUF3QixPQUErQixZQUErQztBQUNySCxTQUFPLFlBQVk7QUFBQSxJQUNsQjtBQUFBLElBQ0EsVUFBVSxNQUFNO0FBQUEsRUFDakIsR0FBRyxZQUFVO0FBQ1osZUFBVyxLQUFLLE1BQU07QUFBQSxFQUN2QixDQUFDO0FBQ0Y7QUFLTyxTQUFTLG9CQUF1QixZQUE0QixZQUEwRSxnQkFBZ0IsY0FBYyxTQUFT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QUUsUUFBUTtBQUNWLFVBQUksSUFBSSxTQUFTLEdBQUc7QUFBQSxJQUNyQjtBQUFBLEVBQ0QsR0FBRyxDQUFDLFdBQVc7QUFDZCxVQUFNLElBQUksTUFBTSxLQUFLLE1BQU07QUFDM0IsTUFBRSxTQUFTLENBQUM7QUFDWixXQUFPLEVBQUUsU0FBUztBQUFBLEVBQ25CLENBQUM7QUFDRCxTQUFPO0FBQ1I7QUFFQSxNQUFNLFNBQWlEO0FBQUEsRUFHdEQsWUFDa0IsTUFDQSxjQUNoQjtBQUZnQjtBQUNBO0FBSmxCLFNBQWlCLFNBQVMsb0JBQUksSUFBaUQ7QUFDL0UsU0FBUSxTQUFpQixDQUFDO0FBQUEsRUFLMUI7QUFBQSxFQUVPLFVBQWdCO0FBQ3RCLFNBQUssT0FBTyxRQUFRLFdBQVMsTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNsRCxTQUFLLE9BQU8sTUFBTTtBQUFBLEVBQ25CO0FBQUEsRUFFTyxTQUFTLE9BQTZCO0FBQzVDLFVBQU0sV0FBbUIsQ0FBQztBQUMxQixVQUFNLGdCQUFnQixJQUFJLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQztBQUVoRCxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLE1BQU0sS0FBSyxlQUFlLEtBQUssYUFBYSxJQUFJLElBQUk7QUFFMUQsVUFBSSxRQUFRLEtBQUssT0FBTyxJQUFJLEdBQUc7QUFDL0IsVUFBSSxDQUFDLE9BQU87QUFDWCxjQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsY0FBTSxNQUFNLEtBQUssS0FBSyxNQUFNLEtBQUs7QUFDakMsZ0JBQVEsRUFBRSxLQUFLLE1BQU07QUFDckIsYUFBSyxPQUFPLElBQUksS0FBSyxLQUFLO0FBQUEsTUFDM0IsT0FBTztBQUNOLHNCQUFjLE9BQU8sR0FBRztBQUFBLE1BQ3pCO0FBQ0EsZUFBUyxLQUFLLE1BQU0sR0FBRztBQUFBLElBQ3hCO0FBRUEsZUFBVyxRQUFRLGVBQWU7QUFDakMsWUFBTSxRQUFRLEtBQUssT0FBTyxJQUFJLElBQUk7QUFDbEMsWUFBTSxNQUFNLFFBQVE7QUFDcEIsV0FBSyxPQUFPLE9BQU8sSUFBSTtBQUFBLElBQ3hCO0FBRUEsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRU8sV0FBbUI7QUFDekIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBRU8sU0FBUyxhQUFnQixLQUFxQztBQUNwRSxTQUFPLENBQUMsQ0FBQyxPQUF3QixJQUFLLFNBQVMsVUFBOEIsSUFBSyxrQkFBa0I7QUFDckc7IiwKICAibmFtZXMiOiBbXQp9Cg==
