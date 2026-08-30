import { compareBy, numberComparator } from "./arrays.js";
import { groupBy } from "./collections.js";
import { SetMap, ResourceMap } from "./map.js";
import { createSingleCallFunction } from "./functional.js";
import { Iterable } from "./iterator.js";
import { BugIndicatingError, onUnexpectedError } from "./errors.js";
const TRACK_DISPOSABLES = false;
let disposableTracker = null;
class GCBasedDisposableTracker {
  constructor() {
    this._registry = new FinalizationRegistry((heldValue) => {
      console.warn(`[LEAKED DISPOSABLE] ${heldValue}`);
    });
  }
  trackDisposable(disposable) {
    const stack = new Error("CREATED via:").stack;
    this._registry.register(disposable, stack, disposable);
  }
  setParent(child, parent) {
    if (parent) {
      this._registry.unregister(child);
    } else {
      this.trackDisposable(child);
    }
  }
  markAsDisposed(disposable) {
    this._registry.unregister(disposable);
  }
  markAsSingleton(disposable) {
    this._registry.unregister(disposable);
  }
}
const _DisposableTracker = class _DisposableTracker {
  constructor() {
    this.livingDisposables = /* @__PURE__ */ new Map();
  }
  getDisposableData(d) {
    let val = this.livingDisposables.get(d);
    if (!val) {
      val = { parent: null, source: null, isSingleton: false, value: d, idx: _DisposableTracker.idx++ };
      this.livingDisposables.set(d, val);
    }
    return val;
  }
  trackDisposable(d) {
    const data = this.getDisposableData(d);
    if (!data.source) {
      data.source = new Error().stack;
    }
  }
  setParent(child, parent) {
    const data = this.getDisposableData(child);
    data.parent = parent;
  }
  markAsDisposed(x) {
    this.livingDisposables.delete(x);
  }
  markAsSingleton(disposable) {
    this.getDisposableData(disposable).isSingleton = true;
  }
  getRootParent(data, cache) {
    const cacheValue = cache.get(data);
    if (cacheValue) {
      return cacheValue;
    }
    const result = data.parent ? this.getRootParent(this.getDisposableData(data.parent), cache) : data;
    cache.set(data, result);
    return result;
  }
  getTrackedDisposables() {
    const rootParentCache = /* @__PURE__ */ new Map();
    const leaking = [...this.livingDisposables.entries()].filter(([, v]) => v.source !== null && !this.getRootParent(v, rootParentCache).isSingleton).flatMap(([k]) => k);
    return leaking;
  }
  computeLeakingDisposables(maxReported = 10, preComputedLeaks) {
    let uncoveredLeakingObjs;
    if (preComputedLeaks) {
      uncoveredLeakingObjs = preComputedLeaks;
    } else {
      const rootParentCache = /* @__PURE__ */ new Map();
      const leakingObjects = [...this.livingDisposables.values()].filter((info) => info.source !== null && !this.getRootParent(info, rootParentCache).isSingleton);
      if (leakingObjects.length === 0) {
        return;
      }
      const leakingObjsSet = new Set(leakingObjects.map((o) => o.value));
      uncoveredLeakingObjs = leakingObjects.filter((l) => {
        return !(l.parent && leakingObjsSet.has(l.parent));
      });
      if (uncoveredLeakingObjs.length === 0) {
        throw new Error("There are cyclic diposable chains!");
      }
    }
    if (!uncoveredLeakingObjs) {
      return void 0;
    }
    function getStackTracePath(leaking) {
      function removePrefix(array, linesToRemove) {
        while (array.length > 0 && linesToRemove.some((regexp) => typeof regexp === "string" ? regexp === array[0] : array[0].match(regexp))) {
          array.shift();
        }
      }
      const lines = leaking.source.split("\n").map((p) => p.trim().replace("at ", "")).filter((l) => l !== "");
      removePrefix(lines, ["Error", /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]);
      return lines.reverse();
    }
    const stackTraceStarts = new SetMap();
    for (const leaking of uncoveredLeakingObjs) {
      const stackTracePath = getStackTracePath(leaking);
      for (let i2 = 0; i2 <= stackTracePath.length; i2++) {
        stackTraceStarts.add(stackTracePath.slice(0, i2).join("\n"), leaking);
      }
    }
    uncoveredLeakingObjs.sort(compareBy((l) => l.idx, numberComparator));
    let message = "";
    let i = 0;
    for (const leaking of uncoveredLeakingObjs.slice(0, maxReported)) {
      i++;
      const stackTracePath = getStackTracePath(leaking);
      const stackTraceFormattedLines = [];
      for (let i2 = 0; i2 < stackTracePath.length; i2++) {
        let line = stackTracePath[i2];
        const starts = stackTraceStarts.get(stackTracePath.slice(0, i2 + 1).join("\n"));
        line = `(shared with ${starts.size}/${uncoveredLeakingObjs.length} leaks) at ${line}`;
        const prevStarts = stackTraceStarts.get(stackTracePath.slice(0, i2).join("\n"));
        const continuations = groupBy([...prevStarts].map((d) => getStackTracePath(d)[i2]), (v) => v);
        delete continuations[stackTracePath[i2]];
        for (const [cont, set] of Object.entries(continuations)) {
          if (set) {
            stackTraceFormattedLines.unshift(`    - stacktraces of ${set.length} other leaks continue with ${cont}`);
          }
        }
        stackTraceFormattedLines.unshift(line);
      }
      message += `


==================== Leaking disposable ${i}/${uncoveredLeakingObjs.length}: ${leaking.value.constructor.name} ====================
${stackTraceFormattedLines.join("\n")}
============================================================

`;
    }
    if (uncoveredLeakingObjs.length > maxReported) {
      message += `


... and ${uncoveredLeakingObjs.length - maxReported} more leaking disposables

`;
    }
    return { leaks: uncoveredLeakingObjs, details: message };
  }
};
_DisposableTracker.idx = 0;
let DisposableTracker = _DisposableTracker;
function setDisposableTracker(tracker) {
  disposableTracker = tracker;
}
if (TRACK_DISPOSABLES) {
  const __is_disposable_tracked__ = "__is_disposable_tracked__";
  setDisposableTracker(new class {
    trackDisposable(x) {
      const stack = new Error("Potentially leaked disposable").stack;
      setTimeout(() => {
        if (!x[__is_disposable_tracked__]) {
          console.log(stack);
        }
      }, 3e3);
    }
    setParent(child, parent) {
      if (child && child !== Disposable.None) {
        try {
          child[__is_disposable_tracked__] = true;
        } catch {
        }
      }
    }
    markAsDisposed(disposable) {
      if (disposable && disposable !== Disposable.None) {
        try {
          disposable[__is_disposable_tracked__] = true;
        } catch {
        }
      }
    }
    markAsSingleton(disposable) {
    }
  }());
}
function trackDisposable(x) {
  disposableTracker?.trackDisposable(x);
  return x;
}
function markAsDisposed(disposable) {
  disposableTracker?.markAsDisposed(disposable);
}
function setParentOfDisposable(child, parent) {
  disposableTracker?.setParent(child, parent);
}
function setParentOfDisposables(children, parent) {
  if (!disposableTracker) {
    return;
  }
  for (const child of children) {
    disposableTracker.setParent(child, parent);
  }
}
function markAsSingleton(singleton) {
  disposableTracker?.markAsSingleton(singleton);
  return singleton;
}
function isDisposable(thing) {
  return typeof thing === "object" && thing !== null && typeof thing.dispose === "function" && thing.dispose.length === 0;
}
function dispose(arg) {
  if (Iterable.is(arg)) {
    const errors = [];
    for (const d of arg) {
      if (d) {
        try {
          d.dispose();
        } catch (e) {
          errors.push(e);
        }
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    } else if (errors.length > 1) {
      throw new AggregateError(errors, "Encountered errors while disposing of store");
    }
    return Array.isArray(arg) ? [] : arg;
  } else if (arg) {
    arg.dispose();
    return arg;
  }
}
function disposeIfDisposable(disposables) {
  for (const d of disposables) {
    if (isDisposable(d)) {
      d.dispose();
    }
  }
  return [];
}
function combinedDisposable(...disposables) {
  const parent = toDisposable(() => dispose(disposables));
  setParentOfDisposables(disposables, parent);
  return parent;
}
class FunctionDisposable {
  constructor(fn) {
    this._isDisposed = false;
    this._fn = fn;
    trackDisposable(this);
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    if (!this._fn) {
      throw new Error(`Unbound disposable context: Need to use an arrow function to preserve the value of this`);
    }
    this._isDisposed = true;
    markAsDisposed(this);
    this._fn();
  }
}
function toDisposable(fn) {
  return new FunctionDisposable(fn);
}
const _DisposableStore = class _DisposableStore {
  constructor() {
    this._toDispose = /* @__PURE__ */ new Set();
    this._isDisposed = false;
    trackDisposable(this);
  }
  /**
   * Dispose of all registered disposables and mark this object as disposed.
   *
   * Any future disposables added to this object will be disposed of on `add`.
   */
  dispose() {
    if (this._isDisposed) {
      return;
    }
    markAsDisposed(this);
    this._isDisposed = true;
    this.clear();
  }
  /**
   * @return `true` if this object has been disposed of.
   */
  get isDisposed() {
    return this._isDisposed;
  }
  /**
   * Dispose of all registered disposables but do not mark this object as disposed.
   */
  clear() {
    if (this._toDispose.size === 0) {
      return;
    }
    try {
      dispose(this._toDispose);
    } finally {
      this._toDispose.clear();
    }
  }
  /**
   * Add a new {@link IDisposable disposable} to the collection.
   */
  add(o) {
    if (!o || o === Disposable.None) {
      return o;
    }
    if (o === this) {
      throw new Error("Cannot register a disposable on itself!");
    }
    setParentOfDisposable(o, this);
    if (this._isDisposed) {
      if (!_DisposableStore.DISABLE_DISPOSED_WARNING) {
        console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack);
      }
    } else {
      this._toDispose.add(o);
    }
    return o;
  }
  /**
   * Deletes a disposable from store and disposes of it. This will not throw or warn and proceed to dispose the
   * disposable even when the disposable is not part in the store.
   */
  delete(o) {
    if (!o) {
      return;
    }
    if (o === this) {
      throw new Error("Cannot dispose a disposable on itself!");
    }
    this._toDispose.delete(o);
    o.dispose();
  }
  /**
   * Deletes the value from the store, but does not dispose it.
   */
  deleteAndLeak(o) {
    if (!o) {
      return;
    }
    if (this._toDispose.delete(o)) {
      setParentOfDisposable(o, null);
    }
  }
  assertNotDisposed() {
    if (this._isDisposed) {
      onUnexpectedError(new BugIndicatingError("Object disposed"));
    }
  }
};
_DisposableStore.DISABLE_DISPOSED_WARNING = false;
let DisposableStore = _DisposableStore;
class Disposable {
  constructor() {
    this._store = new DisposableStore();
    trackDisposable(this);
    setParentOfDisposable(this._store, this);
  }
  dispose() {
    markAsDisposed(this);
    this._store.dispose();
  }
  /**
   * Adds `o` to the collection of disposables managed by this object.
   */
  _register(o) {
    if (o === this) {
      throw new Error("Cannot register a disposable on itself!");
    }
    return this._store.add(o);
  }
}
/**
 * A disposable that does nothing when it is disposed of.
 *
 * TODO: This should not be a static property.
 */
Disposable.None = Object.freeze({ dispose() {
} });
class MutableDisposable {
  constructor() {
    this._isDisposed = false;
    trackDisposable(this);
  }
  /**
   * Get the currently held disposable value, or `undefined` if this MutableDisposable has been disposed
   */
  get value() {
    return this._isDisposed ? void 0 : this._value;
  }
  /**
   * Set a new disposable value.
   *
   * Behaviour:
   * - If the MutableDisposable has been disposed, the setter is a no-op.
   * - If the new value is strictly equal to the current value, the setter is a no-op.
   * - Otherwise the previous value (if any) is disposed and the new value is stored.
   *
   * Related helpers:
   * - clear() resets the value to `undefined` (and disposes the previous value).
   * - clearAndLeak() returns the old value without disposing it and removes its parent.
   */
  set value(value) {
    if (this._isDisposed || value === this._value) {
      return;
    }
    this._value?.dispose();
    if (value) {
      setParentOfDisposable(value, this);
    }
    this._value = value;
  }
  /**
   * Resets the stored value and disposed of the previously stored value.
   */
  clear() {
    this.value = void 0;
  }
  dispose() {
    this._isDisposed = true;
    markAsDisposed(this);
    this._value?.dispose();
    this._value = void 0;
  }
  /**
   * Clears the value, but does not dispose it.
   * The old value is returned.
  */
  clearAndLeak() {
    const oldValue = this._value;
    this._value = void 0;
    if (oldValue) {
      setParentOfDisposable(oldValue, null);
    }
    return oldValue;
  }
}
class MandatoryMutableDisposable {
  constructor(initialValue) {
    this._disposable = new MutableDisposable();
    this._isDisposed = false;
    this._disposable.value = initialValue;
  }
  get value() {
    return this._disposable.value;
  }
  set value(value) {
    if (this._isDisposed || value === this._disposable.value) {
      return;
    }
    this._disposable.value = value;
  }
  dispose() {
    this._isDisposed = true;
    this._disposable.dispose();
  }
}
class RefCountedDisposable {
  constructor(_disposable) {
    this._disposable = _disposable;
    this._counter = 1;
  }
  acquire() {
    this._counter++;
    return this;
  }
  release() {
    if (--this._counter === 0) {
      this._disposable.dispose();
    }
    return this;
  }
}
class ReferenceCollection {
  constructor() {
    this.references = /* @__PURE__ */ new Map();
  }
  acquire(key, ...args) {
    let reference = this.references.get(key);
    if (!reference) {
      reference = { counter: 0, object: this.createReferencedObject(key, ...args) };
      this.references.set(key, reference);
    }
    const { object } = reference;
    const dispose2 = createSingleCallFunction(() => {
      if (--reference.counter === 0) {
        this.destroyReferencedObject(key, reference.object);
        this.references.delete(key);
      }
    });
    reference.counter++;
    return { object, dispose: dispose2 };
  }
}
class AsyncReferenceCollection {
  constructor(referenceCollection) {
    this.referenceCollection = referenceCollection;
  }
  async acquire(key, ...args) {
    const ref = this.referenceCollection.acquire(key, ...args);
    try {
      const object = await ref.object;
      return {
        object,
        dispose: () => ref.dispose()
      };
    } catch (error) {
      ref.dispose();
      throw error;
    }
  }
}
class ImmortalReference {
  constructor(object) {
    this.object = object;
  }
  dispose() {
  }
}
function disposeOnReturn(fn) {
  const store = new DisposableStore();
  try {
    fn(store);
  } finally {
    store.dispose();
  }
}
class DisposableMap {
  constructor(store = /* @__PURE__ */ new Map()) {
    this._isDisposed = false;
    this._store = store;
    trackDisposable(this);
  }
  /**
   * Disposes of all stored values and mark this object as disposed.
   *
   * Trying to use this object after it has been disposed of is an error.
   */
  dispose() {
    markAsDisposed(this);
    this._isDisposed = true;
    this.clearAndDisposeAll();
  }
  /**
   * Disposes of all stored values and clear the map, but DO NOT mark this object as disposed.
   */
  clearAndDisposeAll() {
    if (!this._store.size) {
      return;
    }
    try {
      dispose(this._store.values());
    } finally {
      this._store.clear();
    }
  }
  has(key) {
    return this._store.has(key);
  }
  get size() {
    return this._store.size;
  }
  get(key) {
    return this._store.get(key);
  }
  set(key, value, skipDisposeOnOverwrite = false) {
    if (this._isDisposed) {
      console.warn(new Error("Trying to add a disposable to a DisposableMap that has already been disposed of. The added object will be leaked!").stack);
    }
    if (!skipDisposeOnOverwrite) {
      this._store.get(key)?.dispose();
    }
    this._store.set(key, value);
    setParentOfDisposable(value, this);
  }
  /**
   * Delete the value stored for `key` from this map and also dispose of it.
   */
  deleteAndDispose(key) {
    this._store.get(key)?.dispose();
    this._store.delete(key);
  }
  /**
   * Delete the value stored for `key` from this map but return it. The caller is
   * responsible for disposing of the value.
   */
  deleteAndLeak(key) {
    const value = this._store.get(key);
    if (value) {
      setParentOfDisposable(value, null);
    }
    this._store.delete(key);
    return value;
  }
  keys() {
    return this._store.keys();
  }
  values() {
    return this._store.values();
  }
  [Symbol.iterator]() {
    return this._store[Symbol.iterator]();
  }
}
class DisposableSet {
  constructor(store = /* @__PURE__ */ new Set()) {
    this._isDisposed = false;
    this._store = store;
    trackDisposable(this);
  }
  /**
   * Disposes of all stored values and mark this object as disposed.
   *
   * Trying to use this object after it has been disposed of is an error.
   */
  dispose() {
    markAsDisposed(this);
    this._isDisposed = true;
    this.clearAndDisposeAll();
  }
  /**
   * Disposes of all stored values and clear the set, but DO NOT mark this object as disposed.
   */
  clearAndDisposeAll() {
    if (!this._store.size) {
      return;
    }
    try {
      dispose(this._store.values());
    } finally {
      this._store.clear();
    }
  }
  has(value) {
    return this._store.has(value);
  }
  get size() {
    return this._store.size;
  }
  add(value) {
    if (this._isDisposed) {
      console.warn(new Error("Trying to add a disposable to a DisposableSet that has already been disposed of. The added object will be leaked!").stack);
    }
    this._store.add(value);
    setParentOfDisposable(value, this);
  }
  /**
   * Delete the value from this set and also dispose of it.
   */
  deleteAndDispose(value) {
    if (this._store.delete(value)) {
      value.dispose();
    }
  }
  /**
   * Delete the value from this set but return it. The caller is
   * responsible for disposing of the value.
   */
  deleteAndLeak(value) {
    if (this._store.delete(value)) {
      setParentOfDisposable(value, null);
      return value;
    }
    return void 0;
  }
  values() {
    return this._store.values();
  }
  [Symbol.iterator]() {
    return this._store[Symbol.iterator]();
  }
}
function thenIfNotDisposed(promise, then) {
  let disposed = false;
  promise.then((result) => {
    if (disposed) {
      return;
    }
    then(result);
  });
  return toDisposable(() => {
    disposed = true;
  });
}
function thenRegisterOrDispose(promise, store) {
  return promise.then((disposable) => {
    if (store.isDisposed) {
      disposable.dispose();
    } else {
      store.add(disposable);
    }
    return disposable;
  });
}
class DisposableResourceMap extends DisposableMap {
  constructor() {
    super(new ResourceMap());
  }
}
export {
  AsyncReferenceCollection,
  Disposable,
  DisposableMap,
  DisposableResourceMap,
  DisposableSet,
  DisposableStore,
  DisposableTracker,
  GCBasedDisposableTracker,
  ImmortalReference,
  MandatoryMutableDisposable,
  MutableDisposable,
  RefCountedDisposable,
  ReferenceCollection,
  combinedDisposable,
  dispose,
  disposeIfDisposable,
  disposeOnReturn,
  isDisposable,
  markAsDisposed,
  markAsSingleton,
  setDisposableTracker,
  thenIfNotDisposed,
  thenRegisterOrDispose,
  toDisposable,
  trackDisposable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGxpZmVjeWNsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvbXBhcmVCeSwgbnVtYmVyQ29tcGFyYXRvciB9IGZyb20gJy4vYXJyYXlzLmpzJztcbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IFNldE1hcCwgUmVzb3VyY2VNYXAgfSBmcm9tICcuL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuL3VyaS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuL2Vycm9ycy5qcyc7XG5cbi8vICNyZWdpb24gRGlzcG9zYWJsZSBUcmFja2luZ1xuXG4vKipcbiAqIEVuYWJsZXMgbG9nZ2luZyBvZiBwb3RlbnRpYWxseSBsZWFrZWQgZGlzcG9zYWJsZXMuXG4gKlxuICogQSBkaXNwb3NhYmxlIGlzIGNvbnNpZGVyZWQgbGVha2VkIGlmIGl0IGlzIG5vdCBkaXNwb3NlZCBvciBub3QgcmVnaXN0ZXJlZCBhcyB0aGUgY2hpbGQgb2ZcbiAqIGFub3RoZXIgZGlzcG9zYWJsZS4gVGhpcyB0cmFja2luZyBpcyB2ZXJ5IHNpbXBsZSBhbiBvbmx5IHdvcmtzIGZvciBjbGFzc2VzIHRoYXQgZWl0aGVyXG4gKiBleHRlbmQgRGlzcG9zYWJsZSBvciB1c2UgYSBEaXNwb3NhYmxlU3RvcmUuIFRoaXMgbWVhbnMgdGhlcmUgYXJlIGEgbG90IG9mIGZhbHNlIHBvc2l0aXZlcy5cbiAqL1xuY29uc3QgVFJBQ0tfRElTUE9TQUJMRVMgPSBmYWxzZTtcbmxldCBkaXNwb3NhYmxlVHJhY2tlcjogSURpc3Bvc2FibGVUcmFja2VyIHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpc3Bvc2FibGVUcmFja2VyIHtcblx0LyoqXG5cdCAqIElzIGNhbGxlZCBvbiBjb25zdHJ1Y3Rpb24gb2YgYSBkaXNwb3NhYmxlLlxuXHQqL1xuXHR0cmFja0Rpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBJcyBjYWxsZWQgd2hlbiBhIGRpc3Bvc2FibGUgaXMgcmVnaXN0ZXJlZCBhcyBjaGlsZCBvZiBhbm90aGVyIGRpc3Bvc2FibGUgKGUuZy4ge0BsaW5rIERpc3Bvc2FibGVTdG9yZX0pLlxuXHQgKiBJZiBwYXJlbnQgaXMgYG51bGxgLCB0aGUgZGlzcG9zYWJsZSBpcyByZW1vdmVkIGZyb20gaXRzIGZvcm1lciBwYXJlbnQuXG5cdCovXG5cdHNldFBhcmVudChjaGlsZDogSURpc3Bvc2FibGUsIHBhcmVudDogSURpc3Bvc2FibGUgfCBudWxsKTogdm9pZDtcblxuXHQvKipcblx0ICogSXMgY2FsbGVkIGFmdGVyIGEgZGlzcG9zYWJsZSBpcyBkaXNwb3NlZC5cblx0Ki9cblx0bWFya0FzRGlzcG9zZWQoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBJbmRpY2F0ZXMgdGhhdCB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgc2luZ2xldG9uIHdoaWNoIGRvZXMgbm90IG5lZWQgdG8gYmUgZGlzcG9zZWQuXG5cdCovXG5cdG1hcmtBc1NpbmdsZXRvbihkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBHQ0Jhc2VkRGlzcG9zYWJsZVRyYWNrZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZVRyYWNrZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJ5ID0gbmV3IEZpbmFsaXphdGlvblJlZ2lzdHJ5PHN0cmluZz4oaGVsZFZhbHVlID0+IHtcblx0XHRjb25zb2xlLndhcm4oYFtMRUFLRUQgRElTUE9TQUJMRV0gJHtoZWxkVmFsdWV9YCk7XG5cdH0pO1xuXG5cdHRyYWNrRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YWNrID0gbmV3IEVycm9yKCdDUkVBVEVEIHZpYTonKS5zdGFjayE7XG5cdFx0dGhpcy5fcmVnaXN0cnkucmVnaXN0ZXIoZGlzcG9zYWJsZSwgc3RhY2ssIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0c2V0UGFyZW50KGNoaWxkOiBJRGlzcG9zYWJsZSwgcGFyZW50OiBJRGlzcG9zYWJsZSB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RyeS51bnJlZ2lzdGVyKGNoaWxkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmFja0Rpc3Bvc2FibGUoY2hpbGQpO1xuXHRcdH1cblx0fVxuXG5cdG1hcmtBc0Rpc3Bvc2VkKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cnkudW5yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0fVxuXG5cdG1hcmtBc1NpbmdsZXRvbihkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJ5LnVucmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaXNwb3NhYmxlSW5mbyB7XG5cdHZhbHVlOiBJRGlzcG9zYWJsZTtcblx0c291cmNlOiBzdHJpbmcgfCBudWxsO1xuXHRwYXJlbnQ6IElEaXNwb3NhYmxlIHwgbnVsbDtcblx0aXNTaW5nbGV0b246IGJvb2xlYW47XG5cdGlkeDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZVRyYWNrZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZVRyYWNrZXIge1xuXHRwcml2YXRlIHN0YXRpYyBpZHggPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGl2aW5nRGlzcG9zYWJsZXMgPSBuZXcgTWFwPElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlSW5mbz4oKTtcblxuXHRwcml2YXRlIGdldERpc3Bvc2FibGVEYXRhKGQ6IElEaXNwb3NhYmxlKTogRGlzcG9zYWJsZUluZm8ge1xuXHRcdGxldCB2YWwgPSB0aGlzLmxpdmluZ0Rpc3Bvc2FibGVzLmdldChkKTtcblx0XHRpZiAoIXZhbCkge1xuXHRcdFx0dmFsID0geyBwYXJlbnQ6IG51bGwsIHNvdXJjZTogbnVsbCwgaXNTaW5nbGV0b246IGZhbHNlLCB2YWx1ZTogZCwgaWR4OiBEaXNwb3NhYmxlVHJhY2tlci5pZHgrKyB9O1xuXHRcdFx0dGhpcy5saXZpbmdEaXNwb3NhYmxlcy5zZXQoZCwgdmFsKTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbDtcblx0fVxuXG5cdHRyYWNrRGlzcG9zYWJsZShkOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdldERpc3Bvc2FibGVEYXRhKGQpO1xuXHRcdGlmICghZGF0YS5zb3VyY2UpIHtcblx0XHRcdGRhdGEuc291cmNlID1cblx0XHRcdFx0bmV3IEVycm9yKCkuc3RhY2shO1xuXHRcdH1cblx0fVxuXG5cdHNldFBhcmVudChjaGlsZDogSURpc3Bvc2FibGUsIHBhcmVudDogSURpc3Bvc2FibGUgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuZ2V0RGlzcG9zYWJsZURhdGEoY2hpbGQpO1xuXHRcdGRhdGEucGFyZW50ID0gcGFyZW50O1xuXHR9XG5cblx0bWFya0FzRGlzcG9zZWQoeDogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHR0aGlzLmxpdmluZ0Rpc3Bvc2FibGVzLmRlbGV0ZSh4KTtcblx0fVxuXG5cdG1hcmtBc1NpbmdsZXRvbihkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0RGlzcG9zYWJsZURhdGEoZGlzcG9zYWJsZSkuaXNTaW5nbGV0b24gPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSb290UGFyZW50KGRhdGE6IERpc3Bvc2FibGVJbmZvLCBjYWNoZTogTWFwPERpc3Bvc2FibGVJbmZvLCBEaXNwb3NhYmxlSW5mbz4pOiBEaXNwb3NhYmxlSW5mbyB7XG5cdFx0Y29uc3QgY2FjaGVWYWx1ZSA9IGNhY2hlLmdldChkYXRhKTtcblx0XHRpZiAoY2FjaGVWYWx1ZSkge1xuXHRcdFx0cmV0dXJuIGNhY2hlVmFsdWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZGF0YS5wYXJlbnQgPyB0aGlzLmdldFJvb3RQYXJlbnQodGhpcy5nZXREaXNwb3NhYmxlRGF0YShkYXRhLnBhcmVudCksIGNhY2hlKSA6IGRhdGE7XG5cdFx0Y2FjaGUuc2V0KGRhdGEsIHJlc3VsdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFRyYWNrZWREaXNwb3NhYmxlcygpOiBJRGlzcG9zYWJsZVtdIHtcblx0XHRjb25zdCByb290UGFyZW50Q2FjaGUgPSBuZXcgTWFwPERpc3Bvc2FibGVJbmZvLCBEaXNwb3NhYmxlSW5mbz4oKTtcblxuXHRcdGNvbnN0IGxlYWtpbmcgPSBbLi4udGhpcy5saXZpbmdEaXNwb3NhYmxlcy5lbnRyaWVzKCldXG5cdFx0XHQuZmlsdGVyKChbLCB2XSkgPT4gdi5zb3VyY2UgIT09IG51bGwgJiYgIXRoaXMuZ2V0Um9vdFBhcmVudCh2LCByb290UGFyZW50Q2FjaGUpLmlzU2luZ2xldG9uKVxuXHRcdFx0LmZsYXRNYXAoKFtrXSkgPT4gayk7XG5cblx0XHRyZXR1cm4gbGVha2luZztcblx0fVxuXG5cdGNvbXB1dGVMZWFraW5nRGlzcG9zYWJsZXMobWF4UmVwb3J0ZWQgPSAxMCwgcHJlQ29tcHV0ZWRMZWFrcz86IERpc3Bvc2FibGVJbmZvW10pOiB7IGxlYWtzOiBEaXNwb3NhYmxlSW5mb1tdOyBkZXRhaWxzOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHVuY292ZXJlZExlYWtpbmdPYmpzOiBEaXNwb3NhYmxlSW5mb1tdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcmVDb21wdXRlZExlYWtzKSB7XG5cdFx0XHR1bmNvdmVyZWRMZWFraW5nT2JqcyA9IHByZUNvbXB1dGVkTGVha3M7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJvb3RQYXJlbnRDYWNoZSA9IG5ldyBNYXA8RGlzcG9zYWJsZUluZm8sIERpc3Bvc2FibGVJbmZvPigpO1xuXG5cdFx0XHRjb25zdCBsZWFraW5nT2JqZWN0cyA9IFsuLi50aGlzLmxpdmluZ0Rpc3Bvc2FibGVzLnZhbHVlcygpXVxuXHRcdFx0XHQuZmlsdGVyKChpbmZvKSA9PiBpbmZvLnNvdXJjZSAhPT0gbnVsbCAmJiAhdGhpcy5nZXRSb290UGFyZW50KGluZm8sIHJvb3RQYXJlbnRDYWNoZSkuaXNTaW5nbGV0b24pO1xuXG5cdFx0XHRpZiAobGVha2luZ09iamVjdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxlYWtpbmdPYmpzU2V0ID0gbmV3IFNldChsZWFraW5nT2JqZWN0cy5tYXAobyA9PiBvLnZhbHVlKSk7XG5cblx0XHRcdC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IGFyZSBhIGNoaWxkIG9mIG90aGVyIGxlYWtpbmcgb2JqZWN0cy4gQXNzdW1lcyB0aGVyZSBhcmUgbm8gY3ljbGVzLlxuXHRcdFx0dW5jb3ZlcmVkTGVha2luZ09ianMgPSBsZWFraW5nT2JqZWN0cy5maWx0ZXIobCA9PiB7XG5cdFx0XHRcdHJldHVybiAhKGwucGFyZW50ICYmIGxlYWtpbmdPYmpzU2V0LmhhcyhsLnBhcmVudCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh1bmNvdmVyZWRMZWFraW5nT2Jqcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGVyZSBhcmUgY3ljbGljIGRpcG9zYWJsZSBjaGFpbnMhJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF1bmNvdmVyZWRMZWFraW5nT2Jqcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRTdGFja1RyYWNlUGF0aChsZWFraW5nOiBEaXNwb3NhYmxlSW5mbyk6IHN0cmluZ1tdIHtcblx0XHRcdGZ1bmN0aW9uIHJlbW92ZVByZWZpeChhcnJheTogc3RyaW5nW10sIGxpbmVzVG9SZW1vdmU6IChzdHJpbmcgfCBSZWdFeHApW10pIHtcblx0XHRcdFx0d2hpbGUgKGFycmF5Lmxlbmd0aCA+IDAgJiYgbGluZXNUb1JlbW92ZS5zb21lKHJlZ2V4cCA9PiB0eXBlb2YgcmVnZXhwID09PSAnc3RyaW5nJyA/IHJlZ2V4cCA9PT0gYXJyYXlbMF0gOiBhcnJheVswXS5tYXRjaChyZWdleHApKSkge1xuXHRcdFx0XHRcdGFycmF5LnNoaWZ0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZXMgPSBsZWFraW5nLnNvdXJjZSEuc3BsaXQoJ1xcbicpLm1hcChwID0+IHAudHJpbSgpLnJlcGxhY2UoJ2F0ICcsICcnKSkuZmlsdGVyKGwgPT4gbCAhPT0gJycpO1xuXHRcdFx0cmVtb3ZlUHJlZml4KGxpbmVzLCBbJ0Vycm9yJywgL150cmFja0Rpc3Bvc2FibGUgXFwoLipcXCkkLywgL15EaXNwb3NhYmxlVHJhY2tlci50cmFja0Rpc3Bvc2FibGUgXFwoLipcXCkkL10pO1xuXHRcdFx0cmV0dXJuIGxpbmVzLnJldmVyc2UoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFja1RyYWNlU3RhcnRzID0gbmV3IFNldE1hcDxzdHJpbmcsIERpc3Bvc2FibGVJbmZvPigpO1xuXHRcdGZvciAoY29uc3QgbGVha2luZyBvZiB1bmNvdmVyZWRMZWFraW5nT2Jqcykge1xuXHRcdFx0Y29uc3Qgc3RhY2tUcmFjZVBhdGggPSBnZXRTdGFja1RyYWNlUGF0aChsZWFraW5nKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDw9IHN0YWNrVHJhY2VQYXRoLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHN0YWNrVHJhY2VTdGFydHMuYWRkKHN0YWNrVHJhY2VQYXRoLnNsaWNlKDAsIGkpLmpvaW4oJ1xcbicpLCBsZWFraW5nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQdXQgZWFybGllciBsZWFrcyBmaXJzdFxuXHRcdHVuY292ZXJlZExlYWtpbmdPYmpzLnNvcnQoY29tcGFyZUJ5KGwgPT4gbC5pZHgsIG51bWJlckNvbXBhcmF0b3IpKTtcblxuXHRcdGxldCBtZXNzYWdlID0gJyc7XG5cblx0XHRsZXQgaSA9IDA7XG5cdFx0Zm9yIChjb25zdCBsZWFraW5nIG9mIHVuY292ZXJlZExlYWtpbmdPYmpzLnNsaWNlKDAsIG1heFJlcG9ydGVkKSkge1xuXHRcdFx0aSsrO1xuXHRcdFx0Y29uc3Qgc3RhY2tUcmFjZVBhdGggPSBnZXRTdGFja1RyYWNlUGF0aChsZWFraW5nKTtcblx0XHRcdGNvbnN0IHN0YWNrVHJhY2VGb3JtYXR0ZWRMaW5lcyA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0YWNrVHJhY2VQYXRoLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGxldCBsaW5lID0gc3RhY2tUcmFjZVBhdGhbaV07XG5cdFx0XHRcdGNvbnN0IHN0YXJ0cyA9IHN0YWNrVHJhY2VTdGFydHMuZ2V0KHN0YWNrVHJhY2VQYXRoLnNsaWNlKDAsIGkgKyAxKS5qb2luKCdcXG4nKSk7XG5cdFx0XHRcdGxpbmUgPSBgKHNoYXJlZCB3aXRoICR7c3RhcnRzLnNpemV9LyR7dW5jb3ZlcmVkTGVha2luZ09ianMubGVuZ3RofSBsZWFrcykgYXQgJHtsaW5lfWA7XG5cblx0XHRcdFx0Y29uc3QgcHJldlN0YXJ0cyA9IHN0YWNrVHJhY2VTdGFydHMuZ2V0KHN0YWNrVHJhY2VQYXRoLnNsaWNlKDAsIGkpLmpvaW4oJ1xcbicpKTtcblx0XHRcdFx0Y29uc3QgY29udGludWF0aW9ucyA9IGdyb3VwQnkoWy4uLnByZXZTdGFydHNdLm1hcChkID0+IGdldFN0YWNrVHJhY2VQYXRoKGQpW2ldKSwgdiA9PiB2KTtcblx0XHRcdFx0ZGVsZXRlIGNvbnRpbnVhdGlvbnNbc3RhY2tUcmFjZVBhdGhbaV1dO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtjb250LCBzZXRdIG9mIE9iamVjdC5lbnRyaWVzKGNvbnRpbnVhdGlvbnMpKSB7XG5cdFx0XHRcdFx0aWYgKHNldCkge1xuXHRcdFx0XHRcdFx0c3RhY2tUcmFjZUZvcm1hdHRlZExpbmVzLnVuc2hpZnQoYCAgICAtIHN0YWNrdHJhY2VzIG9mICR7c2V0Lmxlbmd0aH0gb3RoZXIgbGVha3MgY29udGludWUgd2l0aCAke2NvbnR9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3RhY2tUcmFjZUZvcm1hdHRlZExpbmVzLnVuc2hpZnQobGluZSk7XG5cdFx0XHR9XG5cblx0XHRcdG1lc3NhZ2UgKz0gYFxcblxcblxcbj09PT09PT09PT09PT09PT09PT09IExlYWtpbmcgZGlzcG9zYWJsZSAke2l9LyR7dW5jb3ZlcmVkTGVha2luZ09ianMubGVuZ3RofTogJHtsZWFraW5nLnZhbHVlLmNvbnN0cnVjdG9yLm5hbWV9ID09PT09PT09PT09PT09PT09PT09XFxuJHtzdGFja1RyYWNlRm9ybWF0dGVkTGluZXMuam9pbignXFxuJyl9XFxuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XFxuXFxuYDtcblx0XHR9XG5cblx0XHRpZiAodW5jb3ZlcmVkTGVha2luZ09ianMubGVuZ3RoID4gbWF4UmVwb3J0ZWQpIHtcblx0XHRcdG1lc3NhZ2UgKz0gYFxcblxcblxcbi4uLiBhbmQgJHt1bmNvdmVyZWRMZWFraW5nT2Jqcy5sZW5ndGggLSBtYXhSZXBvcnRlZH0gbW9yZSBsZWFraW5nIGRpc3Bvc2FibGVzXFxuXFxuYDtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBsZWFrczogdW5jb3ZlcmVkTGVha2luZ09ianMsIGRldGFpbHM6IG1lc3NhZ2UgfTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0RGlzcG9zYWJsZVRyYWNrZXIodHJhY2tlcjogSURpc3Bvc2FibGVUcmFja2VyIHwgbnVsbCk6IHZvaWQge1xuXHRkaXNwb3NhYmxlVHJhY2tlciA9IHRyYWNrZXI7XG59XG5cbmlmIChUUkFDS19ESVNQT1NBQkxFUykge1xuXHRjb25zdCBfX2lzX2Rpc3Bvc2FibGVfdHJhY2tlZF9fID0gJ19faXNfZGlzcG9zYWJsZV90cmFja2VkX18nO1xuXHRzZXREaXNwb3NhYmxlVHJhY2tlcihuZXcgY2xhc3MgaW1wbGVtZW50cyBJRGlzcG9zYWJsZVRyYWNrZXIge1xuXHRcdHRyYWNrRGlzcG9zYWJsZSh4OiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc3RhY2sgPSBuZXcgRXJyb3IoJ1BvdGVudGlhbGx5IGxlYWtlZCBkaXNwb3NhYmxlJykuc3RhY2shO1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRpZiAoISh4IGFzIGFueSlbX19pc19kaXNwb3NhYmxlX3RyYWNrZWRfX10pIHtcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhzdGFjayk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDMwMDApO1xuXHRcdH1cblxuXHRcdHNldFBhcmVudChjaGlsZDogSURpc3Bvc2FibGUsIHBhcmVudDogSURpc3Bvc2FibGUgfCBudWxsKTogdm9pZCB7XG5cdFx0XHRpZiAoY2hpbGQgJiYgY2hpbGQgIT09IERpc3Bvc2FibGUuTm9uZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdChjaGlsZCBhcyBhbnkpW19faXNfZGlzcG9zYWJsZV90cmFja2VkX19dID0gdHJ1ZTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bWFya0FzRGlzcG9zZWQoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHRcdGlmIChkaXNwb3NhYmxlICYmIGRpc3Bvc2FibGUgIT09IERpc3Bvc2FibGUuTm9uZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdChkaXNwb3NhYmxlIGFzIGFueSlbX19pc19kaXNwb3NhYmxlX3RyYWNrZWRfX10gPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBub29wXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0bWFya0FzU2luZ2xldG9uKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7IH1cblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFja0Rpc3Bvc2FibGU8VCBleHRlbmRzIElEaXNwb3NhYmxlPih4OiBUKTogVCB7XG5cdGRpc3Bvc2FibGVUcmFja2VyPy50cmFja0Rpc3Bvc2FibGUoeCk7XG5cdHJldHVybiB4O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFya0FzRGlzcG9zZWQoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0ZGlzcG9zYWJsZVRyYWNrZXI/Lm1hcmtBc0Rpc3Bvc2VkKGRpc3Bvc2FibGUpO1xufVxuXG5mdW5jdGlvbiBzZXRQYXJlbnRPZkRpc3Bvc2FibGUoY2hpbGQ6IElEaXNwb3NhYmxlLCBwYXJlbnQ6IElEaXNwb3NhYmxlIHwgbnVsbCk6IHZvaWQge1xuXHRkaXNwb3NhYmxlVHJhY2tlcj8uc2V0UGFyZW50KGNoaWxkLCBwYXJlbnQpO1xufVxuXG5mdW5jdGlvbiBzZXRQYXJlbnRPZkRpc3Bvc2FibGVzKGNoaWxkcmVuOiBJRGlzcG9zYWJsZVtdLCBwYXJlbnQ6IElEaXNwb3NhYmxlIHwgbnVsbCk6IHZvaWQge1xuXHRpZiAoIWRpc3Bvc2FibGVUcmFja2VyKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRkaXNwb3NhYmxlVHJhY2tlci5zZXRQYXJlbnQoY2hpbGQsIHBhcmVudCk7XG5cdH1cbn1cblxuLyoqXG4gKiBJbmRpY2F0ZXMgdGhhdCB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgc2luZ2xldG9uIHdoaWNoIGRvZXMgbm90IG5lZWQgdG8gYmUgZGlzcG9zZWQuXG4qL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcmtBc1NpbmdsZXRvbjxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KHNpbmdsZXRvbjogVCk6IFQge1xuXHRkaXNwb3NhYmxlVHJhY2tlcj8ubWFya0FzU2luZ2xldG9uKHNpbmdsZXRvbik7XG5cdHJldHVybiBzaW5nbGV0b247XG59XG5cbi8vICNlbmRyZWdpb25cblxuLyoqXG4gKiBBbiBvYmplY3QgdGhhdCBwZXJmb3JtcyBhIGNsZWFudXAgb3BlcmF0aW9uIHdoZW4gYC5kaXNwb3NlKClgIGlzIGNhbGxlZC5cbiAqXG4gKiBTb21lIGV4YW1wbGVzIG9mIGhvdyBkaXNwb3NhYmxlcyBhcmUgdXNlZDpcbiAqXG4gKiAtIEFuIGV2ZW50IGxpc3RlbmVyIHRoYXQgcmVtb3ZlcyBpdHNlbGYgd2hlbiBgLmRpc3Bvc2UoKWAgaXMgY2FsbGVkLlxuICogLSBBIHJlc291cmNlIHN1Y2ggYXMgYSBmaWxlIHN5c3RlbSB3YXRjaGVyIHRoYXQgY2xlYW5zIHVwIHRoZSByZXNvdXJjZSB3aGVuIGAuZGlzcG9zZSgpYCBpcyBjYWxsZWQuXG4gKiAtIFRoZSByZXR1cm4gdmFsdWUgZnJvbSByZWdpc3RlcmluZyBhIHByb3ZpZGVyLiBXaGVuIGAuZGlzcG9zZSgpYCBpcyBjYWxsZWQsIHRoZSBwcm92aWRlciBpcyB1bnJlZ2lzdGVyZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSURpc3Bvc2FibGUge1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYHRoaW5nYCBpcyB7QGxpbmsgSURpc3Bvc2FibGUgZGlzcG9zYWJsZX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0Rpc3Bvc2FibGU8RT4odGhpbmc6IEUpOiB0aGluZyBpcyBFICYgSURpc3Bvc2FibGUge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0cmV0dXJuIHR5cGVvZiB0aGluZyA9PT0gJ29iamVjdCcgJiYgdGhpbmcgIT09IG51bGwgJiYgdHlwZW9mICg8SURpc3Bvc2FibGU+PGFueT50aGluZykuZGlzcG9zZSA9PT0gJ2Z1bmN0aW9uJyAmJiAoPElEaXNwb3NhYmxlPjxhbnk+dGhpbmcpLmRpc3Bvc2UubGVuZ3RoID09PSAwO1xufVxuXG4vKipcbiAqIERpc3Bvc2VzIG9mIHRoZSB2YWx1ZShzKSBwYXNzZWQgaW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4oZGlzcG9zYWJsZTogVCk6IFQ7XG5leHBvcnQgZnVuY3Rpb24gZGlzcG9zZTxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KGRpc3Bvc2FibGU6IFQgfCB1bmRlZmluZWQpOiBUIHwgdW5kZWZpbmVkO1xuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2U8VCBleHRlbmRzIElEaXNwb3NhYmxlLCBBIGV4dGVuZHMgSXRlcmFibGU8VD4gPSBJdGVyYWJsZTxUPj4oZGlzcG9zYWJsZXM6IEEpOiBBO1xuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2U8VCBleHRlbmRzIElEaXNwb3NhYmxlPihkaXNwb3NhYmxlczogQXJyYXk8VD4pOiBBcnJheTxUPjtcbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4oZGlzcG9zYWJsZXM6IFJlYWRvbmx5QXJyYXk8VD4pOiBSZWFkb25seUFycmF5PFQ+O1xuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2U8VCBleHRlbmRzIElEaXNwb3NhYmxlPihhcmc6IFQgfCBJdGVyYWJsZTxUPiB8IHVuZGVmaW5lZCk6IGFueSB7XG5cdGlmIChJdGVyYWJsZS5pcyhhcmcpKSB7XG5cdFx0Y29uc3QgZXJyb3JzOiBhbnlbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBkIG9mIGFyZykge1xuXHRcdFx0aWYgKGQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGVycm9ycy5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVycm9ycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRocm93IGVycm9yc1swXTtcblx0XHR9IGVsc2UgaWYgKGVycm9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aHJvdyBuZXcgQWdncmVnYXRlRXJyb3IoZXJyb3JzLCAnRW5jb3VudGVyZWQgZXJyb3JzIHdoaWxlIGRpc3Bvc2luZyBvZiBzdG9yZScpO1xuXHRcdH1cblxuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KGFyZykgPyBbXSA6IGFyZztcblx0fSBlbHNlIGlmIChhcmcpIHtcblx0XHRhcmcuZGlzcG9zZSgpO1xuXHRcdHJldHVybiBhcmc7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2VJZkRpc3Bvc2FibGU8VCBleHRlbmRzIElEaXNwb3NhYmxlIHwgb2JqZWN0PihkaXNwb3NhYmxlczogQXJyYXk8VD4pOiBBcnJheTxUPiB7XG5cdGZvciAoY29uc3QgZCBvZiBkaXNwb3NhYmxlcykge1xuXHRcdGlmIChpc0Rpc3Bvc2FibGUoZCkpIHtcblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gW107XG59XG5cbi8qKlxuICogQ29tYmluZSBtdWx0aXBsZSBkaXNwb3NhYmxlIHZhbHVlcyBpbnRvIGEgc2luZ2xlIHtAbGluayBJRGlzcG9zYWJsZX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21iaW5lZERpc3Bvc2FibGUoLi4uZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHBhcmVudCA9IHRvRGlzcG9zYWJsZSgoKSA9PiBkaXNwb3NlKGRpc3Bvc2FibGVzKSk7XG5cdHNldFBhcmVudE9mRGlzcG9zYWJsZXMoZGlzcG9zYWJsZXMsIHBhcmVudCk7XG5cdHJldHVybiBwYXJlbnQ7XG59XG5cbmNsYXNzIEZ1bmN0aW9uRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfZm46ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoZm46ICgpID0+IHZvaWQpIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fZm4gPSBmbjtcblx0XHR0cmFja0Rpc3Bvc2FibGUodGhpcyk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZm4pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5ib3VuZCBkaXNwb3NhYmxlIGNvbnRleHQ6IE5lZWQgdG8gdXNlIGFuIGFycm93IGZ1bmN0aW9uIHRvIHByZXNlcnZlIHRoZSB2YWx1ZSBvZiB0aGlzYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdG1hcmtBc0Rpc3Bvc2VkKHRoaXMpO1xuXHRcdHRoaXMuX2ZuKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUdXJuIGEgZnVuY3Rpb24gdGhhdCBpbXBsZW1lbnRzIGRpc3Bvc2UgaW50byBhbiB7QGxpbmsgSURpc3Bvc2FibGV9LlxuICpcbiAqIEBwYXJhbSBmbiBDbGVhbiB1cCBmdW5jdGlvbiwgZ3VhcmFudGVlZCB0byBiZSBjYWxsZWQgb25seSAqKm9uY2UqKi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvRGlzcG9zYWJsZShmbjogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIG5ldyBGdW5jdGlvbkRpc3Bvc2FibGUoZm4pO1xufVxuXG4vKipcbiAqIE1hbmFnZXMgYSBjb2xsZWN0aW9uIG9mIGRpc3Bvc2FibGUgdmFsdWVzLlxuICpcbiAqIFRoaXMgaXMgdGhlIHByZWZlcnJlZCB3YXkgdG8gbWFuYWdlIG11bHRpcGxlIGRpc3Bvc2FibGVzLiBBIGBEaXNwb3NhYmxlU3RvcmVgIGlzIHNhZmVyIHRvIHdvcmsgd2l0aCB0aGFuIGFuXG4gKiBgSURpc3Bvc2FibGVbXWAgYXMgaXQgY29uc2lkZXJzIGVkZ2UgY2FzZXMsIHN1Y2ggYXMgcmVnaXN0ZXJpbmcgdGhlIHNhbWUgdmFsdWUgbXVsdGlwbGUgdGltZXMgb3IgYWRkaW5nIGFuIGl0ZW0gdG8gYVxuICogc3RvcmUgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkIG9mLlxuICovXG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZVN0b3JlIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyBESVNBQkxFX0RJU1BPU0VEX1dBUk5JTkcgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b0Rpc3Bvc2UgPSBuZXcgU2V0PElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dHJhY2tEaXNwb3NhYmxlKHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2Ugb2YgYWxsIHJlZ2lzdGVyZWQgZGlzcG9zYWJsZXMgYW5kIG1hcmsgdGhpcyBvYmplY3QgYXMgZGlzcG9zZWQuXG5cdCAqXG5cdCAqIEFueSBmdXR1cmUgZGlzcG9zYWJsZXMgYWRkZWQgdG8gdGhpcyBvYmplY3Qgd2lsbCBiZSBkaXNwb3NlZCBvZiBvbiBgYWRkYC5cblx0ICovXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bWFya0FzRGlzcG9zZWQodGhpcyk7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm4gYHRydWVgIGlmIHRoaXMgb2JqZWN0IGhhcyBiZWVuIGRpc3Bvc2VkIG9mLlxuXHQgKi9cblx0cHVibGljIGdldCBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0Rpc3Bvc2VkO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2Ugb2YgYWxsIHJlZ2lzdGVyZWQgZGlzcG9zYWJsZXMgYnV0IGRvIG5vdCBtYXJrIHRoaXMgb2JqZWN0IGFzIGRpc3Bvc2VkLlxuXHQgKi9cblx0cHVibGljIGNsZWFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90b0Rpc3Bvc2Uuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3RvRGlzcG9zZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3RvRGlzcG9zZS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBZGQgYSBuZXcge0BsaW5rIElEaXNwb3NhYmxlIGRpc3Bvc2FibGV9IHRvIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0cHVibGljIGFkZDxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KG86IFQpOiBUIHtcblx0XHRpZiAoIW8gfHwgbyA9PT0gRGlzcG9zYWJsZS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gbztcblx0XHR9XG5cdFx0aWYgKChvIGFzIHVua25vd24gYXMgRGlzcG9zYWJsZVN0b3JlKSA9PT0gdGhpcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVnaXN0ZXIgYSBkaXNwb3NhYmxlIG9uIGl0c2VsZiEnKTtcblx0XHR9XG5cblx0XHRzZXRQYXJlbnRPZkRpc3Bvc2FibGUobywgdGhpcyk7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdGlmICghRGlzcG9zYWJsZVN0b3JlLkRJU0FCTEVfRElTUE9TRURfV0FSTklORykge1xuXHRcdFx0XHRjb25zb2xlLndhcm4obmV3IEVycm9yKCdUcnlpbmcgdG8gYWRkIGEgZGlzcG9zYWJsZSB0byBhIERpc3Bvc2FibGVTdG9yZSB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gZGlzcG9zZWQgb2YuIFRoZSBhZGRlZCBvYmplY3Qgd2lsbCBiZSBsZWFrZWQhJykuc3RhY2spO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKG8pO1xuXHRcdH1cblxuXHRcdHJldHVybiBvO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZXMgYSBkaXNwb3NhYmxlIGZyb20gc3RvcmUgYW5kIGRpc3Bvc2VzIG9mIGl0LiBUaGlzIHdpbGwgbm90IHRocm93IG9yIHdhcm4gYW5kIHByb2NlZWQgdG8gZGlzcG9zZSB0aGVcblx0ICogZGlzcG9zYWJsZSBldmVuIHdoZW4gdGhlIGRpc3Bvc2FibGUgaXMgbm90IHBhcnQgaW4gdGhlIHN0b3JlLlxuXHQgKi9cblx0cHVibGljIGRlbGV0ZTxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KG86IFQpOiB2b2lkIHtcblx0XHRpZiAoIW8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKChvIGFzIHVua25vd24gYXMgRGlzcG9zYWJsZVN0b3JlKSA9PT0gdGhpcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZGlzcG9zZSBhIGRpc3Bvc2FibGUgb24gaXRzZWxmIScpO1xuXHRcdH1cblx0XHR0aGlzLl90b0Rpc3Bvc2UuZGVsZXRlKG8pO1xuXHRcdG8uZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZXMgdGhlIHZhbHVlIGZyb20gdGhlIHN0b3JlLCBidXQgZG9lcyBub3QgZGlzcG9zZSBpdC5cblx0ICovXG5cdHB1YmxpYyBkZWxldGVBbmRMZWFrPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4obzogVCk6IHZvaWQge1xuXHRcdGlmICghbykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdG9EaXNwb3NlLmRlbGV0ZShvKSkge1xuXHRcdFx0c2V0UGFyZW50T2ZEaXNwb3NhYmxlKG8sIG51bGwpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3NlcnROb3REaXNwb3NlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IobmV3IEJ1Z0luZGljYXRpbmdFcnJvcignT2JqZWN0IGRpc3Bvc2VkJykpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEFic3RyYWN0IGJhc2UgY2xhc3MgZm9yIGEge0BsaW5rIElEaXNwb3NhYmxlIGRpc3Bvc2FibGV9IG9iamVjdC5cbiAqXG4gKiBTdWJjbGFzc2VzIGNhbiB7QGxpbmtjb2RlIF9yZWdpc3Rlcn0gZGlzcG9zYWJsZXMgdGhhdCB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgY2xlYW5lZCB1cCB3aGVuIHRoaXMgb2JqZWN0IGlzIGRpc3Bvc2VkIG9mLlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQSBkaXNwb3NhYmxlIHRoYXQgZG9lcyBub3RoaW5nIHdoZW4gaXQgaXMgZGlzcG9zZWQgb2YuXG5cdCAqXG5cdCAqIFRPRE86IFRoaXMgc2hvdWxkIG5vdCBiZSBhIHN0YXRpYyBwcm9wZXJ0eS5cblx0ICovXG5cdHN0YXRpYyByZWFkb25seSBOb25lID0gT2JqZWN0LmZyZWV6ZTxJRGlzcG9zYWJsZT4oeyBkaXNwb3NlKCkgeyB9IH0pO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dHJhY2tEaXNwb3NhYmxlKHRoaXMpO1xuXHRcdHNldFBhcmVudE9mRGlzcG9zYWJsZSh0aGlzLl9zdG9yZSwgdGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRtYXJrQXNEaXNwb3NlZCh0aGlzKTtcblxuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGBvYCB0byB0aGUgY29sbGVjdGlvbiBvZiBkaXNwb3NhYmxlcyBtYW5hZ2VkIGJ5IHRoaXMgb2JqZWN0LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZWdpc3RlcjxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KG86IFQpOiBUIHtcblx0XHRpZiAoKG8gYXMgdW5rbm93biBhcyBEaXNwb3NhYmxlKSA9PT0gdGhpcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVnaXN0ZXIgYSBkaXNwb3NhYmxlIG9uIGl0c2VsZiEnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlLmFkZChvKTtcblx0fVxufVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBhIGRpc3Bvc2FibGUgdmFsdWUgdGhhdCBtYXkgYmUgY2hhbmdlZC5cbiAqXG4gKiBUaGlzIGVuc3VyZXMgdGhhdCB3aGVuIHRoZSBkaXNwb3NhYmxlIHZhbHVlIGlzIGNoYW5nZWQsIHRoZSBwcmV2aW91c2x5IGhlbGQgZGlzcG9zYWJsZSBpcyBkaXNwb3NlZCBvZi4gWW91IGNhblxuICogYWxzbyByZWdpc3RlciBhIGBNdXRhYmxlRGlzcG9zYWJsZWAgb24gYSBgRGlzcG9zYWJsZWAgdG8gZW5zdXJlIGl0IGlzIGF1dG9tYXRpY2FsbHkgY2xlYW5lZCB1cC5cbiAqL1xuZXhwb3J0IGNsYXNzIE11dGFibGVEaXNwb3NhYmxlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3ZhbHVlPzogVDtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRyYWNrRGlzcG9zYWJsZSh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnRseSBoZWxkIGRpc3Bvc2FibGUgdmFsdWUsIG9yIGB1bmRlZmluZWRgIGlmIHRoaXMgTXV0YWJsZURpc3Bvc2FibGUgaGFzIGJlZW4gZGlzcG9zZWRcblx0ICovXG5cdGdldCB2YWx1ZSgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faXNEaXNwb3NlZCA/IHVuZGVmaW5lZCA6IHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCBhIG5ldyBkaXNwb3NhYmxlIHZhbHVlLlxuXHQgKlxuXHQgKiBCZWhhdmlvdXI6XG5cdCAqIC0gSWYgdGhlIE11dGFibGVEaXNwb3NhYmxlIGhhcyBiZWVuIGRpc3Bvc2VkLCB0aGUgc2V0dGVyIGlzIGEgbm8tb3AuXG5cdCAqIC0gSWYgdGhlIG5ldyB2YWx1ZSBpcyBzdHJpY3RseSBlcXVhbCB0byB0aGUgY3VycmVudCB2YWx1ZSwgdGhlIHNldHRlciBpcyBhIG5vLW9wLlxuXHQgKiAtIE90aGVyd2lzZSB0aGUgcHJldmlvdXMgdmFsdWUgKGlmIGFueSkgaXMgZGlzcG9zZWQgYW5kIHRoZSBuZXcgdmFsdWUgaXMgc3RvcmVkLlxuXHQgKlxuXHQgKiBSZWxhdGVkIGhlbHBlcnM6XG5cdCAqIC0gY2xlYXIoKSByZXNldHMgdGhlIHZhbHVlIHRvIGB1bmRlZmluZWRgIChhbmQgZGlzcG9zZXMgdGhlIHByZXZpb3VzIHZhbHVlKS5cblx0ICogLSBjbGVhckFuZExlYWsoKSByZXR1cm5zIHRoZSBvbGQgdmFsdWUgd2l0aG91dCBkaXNwb3NpbmcgaXQgYW5kIHJlbW92ZXMgaXRzIHBhcmVudC5cblx0ICovXG5cdHNldCB2YWx1ZSh2YWx1ZTogVCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8IHZhbHVlID09PSB0aGlzLl92YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZhbHVlPy5kaXNwb3NlKCk7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRzZXRQYXJlbnRPZkRpc3Bvc2FibGUodmFsdWUsIHRoaXMpO1xuXHRcdH1cblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2V0cyB0aGUgc3RvcmVkIHZhbHVlIGFuZCBkaXNwb3NlZCBvZiB0aGUgcHJldmlvdXNseSBzdG9yZWQgdmFsdWUuXG5cdCAqL1xuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLnZhbHVlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRtYXJrQXNEaXNwb3NlZCh0aGlzKTtcblx0XHR0aGlzLl92YWx1ZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3ZhbHVlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgdmFsdWUsIGJ1dCBkb2VzIG5vdCBkaXNwb3NlIGl0LlxuXHQgKiBUaGUgb2xkIHZhbHVlIGlzIHJldHVybmVkLlxuXHQqL1xuXHRjbGVhckFuZExlYWsoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgb2xkVmFsdWUgPSB0aGlzLl92YWx1ZTtcblx0XHR0aGlzLl92YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAob2xkVmFsdWUpIHtcblx0XHRcdHNldFBhcmVudE9mRGlzcG9zYWJsZShvbGRWYWx1ZSwgbnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiBvbGRWYWx1ZTtcblx0fVxufVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBhIGRpc3Bvc2FibGUgdmFsdWUgdGhhdCBtYXkgYmUgY2hhbmdlZCBsaWtlIHtAbGluayBNdXRhYmxlRGlzcG9zYWJsZX0sIGJ1dCB0aGUgdmFsdWUgbXVzdFxuICogZXhpc3QgYW5kIGNhbm5vdCBiZSB1bmRlZmluZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBNYW5kYXRvcnlNdXRhYmxlRGlzcG9zYWJsZTxUIGV4dGVuZHMgSURpc3Bvc2FibGU+IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPFQ+KCk7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihpbml0aWFsVmFsdWU6IFQpIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlLnZhbHVlID0gaW5pdGlhbFZhbHVlO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCk6IFQge1xuXHRcdHJldHVybiB0aGlzLl9kaXNwb3NhYmxlLnZhbHVlITtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogVCkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8IHZhbHVlID09PSB0aGlzLl9kaXNwb3NhYmxlLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGUudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlZkNvdW50ZWREaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9jb3VudGVyOiBudW1iZXIgPSAxO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlLFxuXHQpIHsgfVxuXG5cdGFjcXVpcmUoKSB7XG5cdFx0dGhpcy5fY291bnRlcisrO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cmVsZWFzZSgpIHtcblx0XHRpZiAoLS10aGlzLl9jb3VudGVyID09PSAwKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVmZXJlbmNlPFQ+IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvYmplY3Q6IFQ7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBSZWZlcmVuY2VDb2xsZWN0aW9uPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlZmVyZW5jZXM6IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgb2JqZWN0OiBUOyBjb3VudGVyOiBudW1iZXIgfT4gPSBuZXcgTWFwKCk7XG5cblx0YWNxdWlyZShrZXk6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogSVJlZmVyZW5jZTxUPiB7XG5cdFx0bGV0IHJlZmVyZW5jZSA9IHRoaXMucmVmZXJlbmNlcy5nZXQoa2V5KTtcblxuXHRcdGlmICghcmVmZXJlbmNlKSB7XG5cdFx0XHRyZWZlcmVuY2UgPSB7IGNvdW50ZXI6IDAsIG9iamVjdDogdGhpcy5jcmVhdGVSZWZlcmVuY2VkT2JqZWN0KGtleSwgLi4uYXJncykgfTtcblx0XHRcdHRoaXMucmVmZXJlbmNlcy5zZXQoa2V5LCByZWZlcmVuY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgb2JqZWN0IH0gPSByZWZlcmVuY2U7XG5cdFx0Y29uc3QgZGlzcG9zZSA9IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbigoKSA9PiB7XG5cdFx0XHRpZiAoLS1yZWZlcmVuY2UuY291bnRlciA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmRlc3Ryb3lSZWZlcmVuY2VkT2JqZWN0KGtleSwgcmVmZXJlbmNlLm9iamVjdCk7XG5cdFx0XHRcdHRoaXMucmVmZXJlbmNlcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJlZmVyZW5jZS5jb3VudGVyKys7XG5cblx0XHRyZXR1cm4geyBvYmplY3QsIGRpc3Bvc2UgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBjcmVhdGVSZWZlcmVuY2VkT2JqZWN0KGtleTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBUO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZGVzdHJveVJlZmVyZW5jZWRPYmplY3Qoa2V5OiBzdHJpbmcsIG9iamVjdDogVCk6IHZvaWQ7XG59XG5cbi8qKlxuICogVW53cmFwcyBhIHJlZmVyZW5jZSBjb2xsZWN0aW9uIG9mIHByb21pc2VkIHZhbHVlcy4gTWFrZXMgc3VyZVxuICogcmVmZXJlbmNlcyBhcmUgZGlzcG9zZWQgd2hlbmV2ZXIgcHJvbWlzZXMgZ2V0IHJlamVjdGVkLlxuICovXG5leHBvcnQgY2xhc3MgQXN5bmNSZWZlcmVuY2VDb2xsZWN0aW9uPFQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlZmVyZW5jZUNvbGxlY3Rpb246IFJlZmVyZW5jZUNvbGxlY3Rpb248UHJvbWlzZTxUPj4pIHsgfVxuXG5cdGFzeW5jIGFjcXVpcmUoa2V5OiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8SVJlZmVyZW5jZTxUPj4ge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMucmVmZXJlbmNlQ29sbGVjdGlvbi5hY3F1aXJlKGtleSwgLi4uYXJncyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb2JqZWN0ID0gYXdhaXQgcmVmLm9iamVjdDtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b2JqZWN0LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiByZWYuZGlzcG9zZSgpXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbW1vcnRhbFJlZmVyZW5jZTxUPiBpbXBsZW1lbnRzIElSZWZlcmVuY2U8VD4ge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgb2JqZWN0OiBUKSB7IH1cblx0ZGlzcG9zZSgpOiB2b2lkIHsgLyogbm9vcCAqLyB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NlT25SZXR1cm4oZm46IChzdG9yZTogRGlzcG9zYWJsZVN0b3JlKSA9PiB2b2lkKTogdm9pZCB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0cnkge1xuXHRcdGZuKHN0b3JlKTtcblx0fSBmaW5hbGx5IHtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIG1hcCB0aGUgbWFuYWdlcyB0aGUgbGlmZWN5Y2xlIG9mIHRoZSB2YWx1ZXMgdGhhdCBpdCBzdG9yZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBEaXNwb3NhYmxlTWFwPEssIFYgZXh0ZW5kcyBJRGlzcG9zYWJsZSA9IElEaXNwb3NhYmxlPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yZTogTWFwPEssIFY+O1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3Ioc3RvcmU6IE1hcDxLLCBWPiA9IG5ldyBNYXA8SywgVj4oKSkge1xuXHRcdHRoaXMuX3N0b3JlID0gc3RvcmU7XG5cdFx0dHJhY2tEaXNwb3NhYmxlKHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2VzIG9mIGFsbCBzdG9yZWQgdmFsdWVzIGFuZCBtYXJrIHRoaXMgb2JqZWN0IGFzIGRpc3Bvc2VkLlxuXHQgKlxuXHQgKiBUcnlpbmcgdG8gdXNlIHRoaXMgb2JqZWN0IGFmdGVyIGl0IGhhcyBiZWVuIGRpc3Bvc2VkIG9mIGlzIGFuIGVycm9yLlxuXHQgKi9cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRtYXJrQXNEaXNwb3NlZCh0aGlzKTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2VzIG9mIGFsbCBzdG9yZWQgdmFsdWVzIGFuZCBjbGVhciB0aGUgbWFwLCBidXQgRE8gTk9UIG1hcmsgdGhpcyBvYmplY3QgYXMgZGlzcG9zZWQuXG5cdCAqL1xuXHRjbGVhckFuZERpc3Bvc2VBbGwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zdG9yZS5zaXplKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGRpc3Bvc2UodGhpcy5fc3RvcmUudmFsdWVzKCkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zdG9yZS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdGhhcyhrZXk6IEspOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmUuaGFzKGtleSk7XG5cdH1cblxuXHRnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yZS5zaXplO1xuXHR9XG5cblx0Z2V0KGtleTogSyk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yZS5nZXQoa2V5KTtcblx0fVxuXG5cdHNldChrZXk6IEssIHZhbHVlOiBWLCBza2lwRGlzcG9zZU9uT3ZlcndyaXRlID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0Y29uc29sZS53YXJuKG5ldyBFcnJvcignVHJ5aW5nIHRvIGFkZCBhIGRpc3Bvc2FibGUgdG8gYSBEaXNwb3NhYmxlTWFwIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBkaXNwb3NlZCBvZi4gVGhlIGFkZGVkIG9iamVjdCB3aWxsIGJlIGxlYWtlZCEnKS5zdGFjayk7XG5cdFx0fVxuXG5cdFx0aWYgKCFza2lwRGlzcG9zZU9uT3ZlcndyaXRlKSB7XG5cdFx0XHR0aGlzLl9zdG9yZS5nZXQoa2V5KT8uZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0b3JlLnNldChrZXksIHZhbHVlKTtcblx0XHRzZXRQYXJlbnRPZkRpc3Bvc2FibGUodmFsdWUsIHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZSB0aGUgdmFsdWUgc3RvcmVkIGZvciBga2V5YCBmcm9tIHRoaXMgbWFwIGFuZCBhbHNvIGRpc3Bvc2Ugb2YgaXQuXG5cdCAqL1xuXHRkZWxldGVBbmREaXNwb3NlKGtleTogSyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JlLmdldChrZXkpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3RvcmUuZGVsZXRlKGtleSk7XG5cdH1cblxuXHQvKipcblx0ICogRGVsZXRlIHRoZSB2YWx1ZSBzdG9yZWQgZm9yIGBrZXlgIGZyb20gdGhpcyBtYXAgYnV0IHJldHVybiBpdC4gVGhlIGNhbGxlciBpc1xuXHQgKiByZXNwb25zaWJsZSBmb3IgZGlzcG9zaW5nIG9mIHRoZSB2YWx1ZS5cblx0ICovXG5cdGRlbGV0ZUFuZExlYWsoa2V5OiBLKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9zdG9yZS5nZXQoa2V5KTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHNldFBhcmVudE9mRGlzcG9zYWJsZSh2YWx1ZSwgbnVsbCk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShrZXkpO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdGtleXMoKTogSXRlcmFibGVJdGVyYXRvcjxLPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlLmtleXMoKTtcblx0fVxuXG5cdHZhbHVlcygpOiBJdGVyYWJsZUl0ZXJhdG9yPFY+IHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmUudmFsdWVzKCk7XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFtLLCBWXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yZVtTeW1ib2wuaXRlcmF0b3JdKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHNldCB0aGF0IG1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiB0aGUgdmFsdWVzIHRoYXQgaXQgc3RvcmVzLlxuICovXG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZVNldDxWIGV4dGVuZHMgSURpc3Bvc2FibGUgPSBJRGlzcG9zYWJsZT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmU6IFNldDxWPjtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHN0b3JlOiBTZXQ8Vj4gPSBuZXcgU2V0PFY+KCkpIHtcblx0XHR0aGlzLl9zdG9yZSA9IHN0b3JlO1xuXHRcdHRyYWNrRGlzcG9zYWJsZSh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlcyBvZiBhbGwgc3RvcmVkIHZhbHVlcyBhbmQgbWFyayB0aGlzIG9iamVjdCBhcyBkaXNwb3NlZC5cblx0ICpcblx0ICogVHJ5aW5nIHRvIHVzZSB0aGlzIG9iamVjdCBhZnRlciBpdCBoYXMgYmVlbiBkaXNwb3NlZCBvZiBpcyBhbiBlcnJvci5cblx0ICovXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0bWFya0FzRGlzcG9zZWQodGhpcyk7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlcyBvZiBhbGwgc3RvcmVkIHZhbHVlcyBhbmQgY2xlYXIgdGhlIHNldCwgYnV0IERPIE5PVCBtYXJrIHRoaXMgb2JqZWN0IGFzIGRpc3Bvc2VkLlxuXHQgKi9cblx0Y2xlYXJBbmREaXNwb3NlQWxsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc3RvcmUuc2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3N0b3JlLnZhbHVlcygpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3RvcmUuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRoYXModmFsdWU6IFYpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmUuaGFzKHZhbHVlKTtcblx0fVxuXG5cdGdldCBzaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlLnNpemU7XG5cdH1cblxuXHRhZGQodmFsdWU6IFYpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0Y29uc29sZS53YXJuKG5ldyBFcnJvcignVHJ5aW5nIHRvIGFkZCBhIGRpc3Bvc2FibGUgdG8gYSBEaXNwb3NhYmxlU2V0IHRoYXQgaGFzIGFscmVhZHkgYmVlbiBkaXNwb3NlZCBvZi4gVGhlIGFkZGVkIG9iamVjdCB3aWxsIGJlIGxlYWtlZCEnKS5zdGFjayk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHZhbHVlKTtcblx0XHRzZXRQYXJlbnRPZkRpc3Bvc2FibGUodmFsdWUsIHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZSB0aGUgdmFsdWUgZnJvbSB0aGlzIHNldCBhbmQgYWxzbyBkaXNwb3NlIG9mIGl0LlxuXHQgKi9cblx0ZGVsZXRlQW5kRGlzcG9zZSh2YWx1ZTogVik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5kZWxldGUodmFsdWUpKSB7XG5cdFx0XHR2YWx1ZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZSB0aGUgdmFsdWUgZnJvbSB0aGlzIHNldCBidXQgcmV0dXJuIGl0LiBUaGUgY2FsbGVyIGlzXG5cdCAqIHJlc3BvbnNpYmxlIGZvciBkaXNwb3Npbmcgb2YgdGhlIHZhbHVlLlxuXHQgKi9cblx0ZGVsZXRlQW5kTGVhayh2YWx1ZTogVik6IFYgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5kZWxldGUodmFsdWUpKSB7XG5cdFx0XHRzZXRQYXJlbnRPZkRpc3Bvc2FibGUodmFsdWUsIG51bGwpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0dmFsdWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8Vj4ge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yZS52YWx1ZXMoKTtcblx0fVxuXG5cdFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhYmxlSXRlcmF0b3I8Vj4ge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yZVtTeW1ib2wuaXRlcmF0b3JdKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBDYWxsIGB0aGVuYCBvbiBhIFByb21pc2UsIHVubGVzcyB0aGUgcmV0dXJuZWQgZGlzcG9zYWJsZSBpcyBkaXNwb3NlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRoZW5JZk5vdERpc3Bvc2VkPFQ+KHByb21pc2U6IFByb21pc2U8VD4sIHRoZW46IChyZXN1bHQ6IFQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRwcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhlbihyZXN1bHQpO1xuXHR9KTtcblx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBDYWxsIGB0aGVuYCBvbiBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhIHtAbGluayBJRGlzcG9zYWJsZX0sIHRoZW4gZWl0aGVyIHJlZ2lzdGVyIHRoZVxuICogZGlzcG9zYWJsZSBvciByZWdpc3RlciBpdCB0byB0aGUge0BsaW5rIERpc3Bvc2FibGVTdG9yZX0sIGRlcGVuZGluZyBvbiB3aGV0aGVyIHRoZSBzdG9yZSBpc1xuICogZGlzcG9zZWQgb3Igbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdGhlblJlZ2lzdGVyT3JEaXNwb3NlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4ocHJvbWlzZTogUHJvbWlzZTxUPiwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8VD4ge1xuXHRyZXR1cm4gcHJvbWlzZS50aGVuKGRpc3Bvc2FibGUgPT4ge1xuXHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlzcG9zYWJsZTtcblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8ViBleHRlbmRzIElEaXNwb3NhYmxlID0gSURpc3Bvc2FibGU+IGV4dGVuZHMgRGlzcG9zYWJsZU1hcDxVUkksIFY+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIobmV3IFJlc291cmNlTWFwKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVcsd0JBQXdCO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFFBQVEsbUJBQW1CO0FBRXBDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLHlCQUF5QjtBQVd0RCxNQUFNLG9CQUFvQjtBQUMxQixJQUFJLG9CQUErQztBQXlCNUMsTUFBTSx5QkFBdUQ7QUFBQSxFQUE3RDtBQUVOLFNBQWlCLFlBQVksSUFBSSxxQkFBNkIsZUFBYTtBQUMxRSxjQUFRLEtBQUssdUJBQXVCLFNBQVMsRUFBRTtBQUFBLElBQ2hELENBQUM7QUFBQTtBQUFBLEVBRUQsZ0JBQWdCLFlBQStCO0FBQzlDLFVBQU0sUUFBUSxJQUFJLE1BQU0sY0FB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
