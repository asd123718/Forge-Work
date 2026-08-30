import { diffSets } from "./collections.js";
import { onUnexpectedError } from "./errors.js";
import { createSingleCallFunction } from "./functional.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, toDisposable } from "./lifecycle.js";
import { LinkedList } from "./linkedList.js";
import { env } from "./process.js";
import { StopWatch } from "./stopwatch.js";
const _enableDisposeWithListenerWarning = false;
const _enableSnapshotPotentialLeakWarning = false;
const _bufferLeakWarnCountThreshold = 100;
const _bufferLeakWarnTimeThreshold = 6e4;
function _isBufferLeakWarningEnabled() {
  return !!env["VSCODE_DEV"];
}
var Event;
((Event2) => {
  Event2.None = () => Disposable.None;
  function _addLeakageTraceLogic(options) {
    if (_enableSnapshotPotentialLeakWarning) {
      const { onDidAddListener: origListenerDidAdd } = options;
      const stack = Stacktrace.create();
      let count = 0;
      options.onDidAddListener = () => {
        if (++count === 2) {
          console.warn("snapshotted emitter LIKELY used public and SHOULD HAVE BEEN created with DisposableStore. snapshotted here");
          stack.print();
        }
        origListenerDidAdd?.();
      };
    }
  }
  function defer(event, flushOnListenerRemove, disposable) {
    return debounce(event, () => void 0, 0, void 0, flushOnListenerRemove ?? true, void 0, disposable);
  }
  Event2.defer = defer;
  function once(event) {
    return (listener, thisArgs = null, disposables) => {
      let didFire = false;
      let result = void 0;
      result = event((e) => {
        if (didFire) {
          return;
        } else if (result) {
          result.dispose();
        } else {
          didFire = true;
        }
        return listener.call(thisArgs, e);
      }, null, disposables);
      if (didFire) {
        result.dispose();
      }
      return result;
    };
  }
  Event2.once = once;
  function onceIf(event, condition) {
    return Event2.once(Event2.filter(event, condition));
  }
  Event2.onceIf = onceIf;
  function map(event, map2, disposable) {
    return snapshot((listener, thisArgs = null, disposables) => event((i) => listener.call(thisArgs, map2(i)), null, disposables), disposable);
  }
  Event2.map = map;
  function forEach(event, each, disposable) {
    return snapshot((listener, thisArgs = null, disposables) => event((i) => {
      each(i);
      listener.call(thisArgs, i);
    }, null, disposables), disposable);
  }
  Event2.forEach = forEach;
  function filter(event, filter2, disposable) {
    return snapshot((listener, thisArgs = null, disposables) => event((e) => filter2(e) && listener.call(thisArgs, e), null, disposables), disposable);
  }
  Event2.filter = filter;
  function signal(event) {
    return event;
  }
  Event2.signal = signal;
  function any(...events) {
    return (listener, thisArgs = null, disposables) => {
      const disposable = combinedDisposable(...events.map((event) => event((e) => listener.call(thisArgs, e))));
      return addAndReturnDisposable(disposable, disposables);
    };
  }
  Event2.any = any;
  function reduce(event, merge, initial, disposable) {
    let output = initial;
    return map(event, (e) => {
      output = merge(output, e);
      return output;
    }, disposable);
  }
  Event2.reduce = reduce;
  function snapshot(event, disposable) {
    let listener;
    const options = {
      onWillAddFirstListener() {
        listener = event(emitter.fire, emitter);
      },
      onDidRemoveLastListener() {
        listener?.dispose();
      }
    };
    if (!disposable) {
      _addLeakageTraceLogic(options);
    }
    const emitter = new Emitter(options);
    disposable?.add(emitter);
    return emitter.event;
  }
  function addAndReturnDisposable(d, store) {
    if (store instanceof Array) {
      store.push(d);
    } else if (store) {
      store.add(d);
    }
    return d;
  }
  function debounce(event, merge, delay = 100, leading = false, flushOnListenerRemove = false, leakWarningThreshold, disposable) {
    let subscription;
    let output = void 0;
    let handle = void 0;
    let numDebouncedCalls = 0;
    let doFire;
    const options = {
      leakWarningThreshold,
      onWillAddFirstListener() {
        subscription = event((cur) => {
          numDebouncedCalls++;
          output = merge(output, cur);
          if (leading && !handle) {
            emitter.fire(output);
            output = void 0;
          }
          doFire = () => {
            const _output = output;
            output = void 0;
            handle = void 0;
            if (!leading || numDebouncedCalls > 1) {
              emitter.fire(_output);
            }
            numDebouncedCalls = 0;
          };
          if (typeof delay === "number") {
            if (handle) {
              clearTimeout(handle);
            }
            handle = setTimeout(doFire, delay);
          } else {
            if (handle === void 0) {
              handle = null;
              queueMicrotask(doFire);
            }
          }
        });
      },
      onWillRemoveListener() {
        if (flushOnListenerRemove && numDebouncedCalls > 0) {
          doFire?.();
        }
      },
      onDidRemoveLastListener() {
        doFire = void 0;
        subscription.dispose();
      }
    };
    if (!disposable) {
      _addLeakageTraceLogic(options);
    }
    const emitter = new Emitter(options);
    disposable?.add(emitter);
    return emitter.event;
  }
  Event2.debounce = debounce;
  function accumulate(event, delay = 0, flushOnListenerRemove, disposable) {
    return Event2.debounce(event, (last, e) => {
      if (!last) {
        return [e];
      }
      last.push(e);
      return last;
    }, delay, void 0, flushOnListenerRemove ?? true, void 0, disposable);
  }
  Event2.accumulate = accumulate;
  function throttle(event, merge, delay = 100, leading = true, trailing = true, leakWarningThreshold, disposable) {
    let subscription;
    let output = void 0;
    let handle = void 0;
    let numThrottledCalls = 0;
    const options = {
      leakWarningThreshold,
      onWillAddFirstListener() {
        subscription = event((cur) => {
          numThrottledCalls++;
          output = merge(output, cur);
          if (handle === void 0) {
            if (leading) {
              emitter.fire(output);
              output = void 0;
              numThrottledCalls = 0;
            }
            if (typeof delay === "number") {
              handle = setTimeout(() => {
                if (trailing && numThrottledCalls > 0) {
                  emitter.fire(output);
                }
                output = void 0;
                handle = void 0;
                numThrottledCalls = 0;
              }, delay);
            } else {
              handle = 0;
              queueMicrotask(() => {
                if (trailing && numThrottledCalls > 0) {
                  emitter.fire(output);
                }
                output = void 0;
                handle = void 0;
                numThrottledCalls = 0;
              });
            }
          }
        });
      },
      onDidRemoveLastListener() {
        subscription.dispose();
      }
    };
    if (!disposable) {
      _addLeakageTraceLogic(options);
    }
    const emitter = new Emitter(options);
    disposable?.add(emitter);
    return emitter.event;
  }
  Event2.throttle = throttle;
  function latch(event, equals = (a, b) => a === b, disposable) {
    let firstCall = true;
    let cache;
    return filter(event, (value) => {
      const shouldEmit = firstCall || !equals(value, cache);
      firstCall = false;
      cache = value;
      return shouldEmit;
    }, disposable);
  }
  Event2.latch = latch;
  function split(event, isT, disposable) {
    return [
      Event2.filter(event, isT, disposable),
      Event2.filter(event, (e) => !isT(e), disposable)
    ];
  }
  Event2.split = split;
  function buffer(event, debugName, flushAfterTimeout = false, _buffer = [], disposable) {
    let buffer2 = _buffer.slice();
    let bufferLeakWarningData;
    if (_isBufferLeakWarningEnabled()) {
      bufferLeakWarningData = {
        stack: Stacktrace.create(),
        timerId: setTimeout(() => {
          if (buffer2 && buffer2.length > 0 && bufferLeakWarningData && !bufferLeakWarningData.warned) {
            bufferLeakWarningData.warned = true;
            console.warn(`[Event.buffer][${debugName}] potential LEAK detected: ${buffer2.length} events buffered for ${_bufferLeakWarnTimeThreshold / 1e3}s without being consumed. Buffered here:`);
            bufferLeakWarningData.stack.print();
          }
        }, _bufferLeakWarnTimeThreshold),
        warned: false
      };
      if (disposable) {
        disposable.add(toDisposable(() => clearTimeout(bufferLeakWarningData.timerId)));
      }
    }
    const clearLeakWarningTimer = () => {
      if (bufferLeakWarningData) {
        clearTimeout(bufferLeakWarningData.timerId);
      }
    };
    let listener = event((e) => {
      if (buffer2) {
        buffer2.push(e);
        if (_isBufferLeakWarningEnabled() && bufferLeakWarningData && !bufferLeakWarningData.warned && buffer2.length >= _bufferLeakWarnCountThreshold) {
          bufferLeakWarningData.warned = true;
          console.warn(`[Event.buffer][${debugName}] potential LEAK detected: ${buffer2.length} events buffered without being consumed. Buffered here:`);
          bufferLeakWarningData.stack.print();
        }
      } else {
        emitter.fire(e);
      }
    });
    if (disposable) {
      disposable.add(listener);
    }
    const flush = () => {
      buffer2?.forEach((e) => emitter.fire(e));
      buffer2 = null;
      clearLeakWarningTimer();
    };
    const emitter = new Emitter({
      onWillAddFirstListener() {
        if (!listener) {
          listener = event((e) => emitter.fire(e));
          if (disposable) {
            disposable.add(listener);
          }
        }
      },
      onDidAddFirstListener() {
        if (buffer2) {
          if (flushAfterTimeout) {
            setTimeout(flush);
          } else {
            flush();
          }
        }
      },
      onDidRemoveLastListener() {
        if (listener) {
          listener.dispose();
        }
        listener = null;
        clearLeakWarningTimer();
      }
    });
    if (disposable) {
      disposable.add(emitter);
    }
    return emitter.event;
  }
  Event2.buffer = buffer;
  function chain(event, sythensize) {
    const fn = (listener, thisArgs, disposables) => {
      const cs = sythensize(new ChainableSynthesis());
      return event(function(value) {
        const result = cs.evaluate(value);
        if (result !== HaltChainable) {
          listener.call(thisArgs, result);
        }
      }, void 0, disposables);
    };
    return fn;
  }
  Event2.chain = chain;
  const HaltChainable = /* @__PURE__ */ Symbol("HaltChainable");
  class ChainableSynthesis {
    constructor() {
      this.steps = [];
    }
    map(fn) {
      this.steps.push(fn);
      return this;
    }
    forEach(fn) {
      this.steps.push((v) => {
        fn(v);
        return v;
      });
      return this;
    }
    filter(fn) {
      this.steps.push((v) => fn(v) ? v : HaltChainable);
      return this;
    }
    reduce(merge, initial) {
      let last = initial;
      this.steps.push((v) => {
        last = merge(last, v);
        return last;
      });
      return this;
    }
    latch(equals = (a, b) => a === b) {
      let firstCall = true;
      let cache;
      this.steps.push((value) => {
        const shouldEmit = firstCall || !equals(value, cache);
        firstCall = false;
        cache = value;
        return shouldEmit ? value : HaltChainable;
      });
      return this;
    }
    evaluate(value) {
      for (const step of this.steps) {
        value = step(value);
        if (value === HaltChainable) {
          break;
        }
      }
      return value;
    }
  }
  function fromNodeEventEmitter(emitter, eventName, map2 = (id2) => id2) {
    const fn = (...args) => result.fire(map2(...args));
    const onFirstListenerAdd = () => emitter.on(eventName, fn);
    const onLastListenerRemove = () => emitter.removeListener(eventName, fn);
    const result = new Emitter({ onWillAddFirstListener: onFirstListenerAdd, onDidRemoveLastListener: onLastListenerRemove });
    return result.event;
  }
  Event2.fromNodeEventEmitter = fromNodeEventEmitter;
  function fromDOMEventEmitter(emitter, eventName, map2 = (id2) => id2) {
    const fn = (...args) => result.fire(map2(...args));
    const onFirstListenerAdd = () => emitter.addEventListener(eventName, fn);
    const onLastListenerRemove = () => emitter.removeEventListener(eventName, fn);
    const result = new Emitter({ onWillAddFirstListener: onFirstListenerAdd, onDidRemoveLastListener: onLastListenerRemove });
    return result.event;
  }
  Event2.fromDOMEventEmitter = fromDOMEventEmitter;
  function toPromise(event, disposables) {
    let cancelRef;
    let listener;
    const promise = new Promise((resolve) => {
      listener = once(event)(resolve);
      addToDisposables(listener, disposables);
      cancelRef = () => {
        disposeAndRemove(listener, disposables);
      };
    });
    promise.cancel = cancelRef;
    if (disposables) {
      promise.finally(() => disposeAndRemove(listener, disposables));
    }
    return promise;
  }
  Event2.toPromise = toPromise;
  function forward(from, to) {
    return from((e) => to.fire(e));
  }
  Event2.forward = forward;
  function runAndSubscribe(event, handler, initial) {
    handler(initial);
    return event((e) => handler(e));
  }
  Event2.runAndSubscribe = runAndSubscribe;
  class EmitterObserver {
    constructor(_observable, store) {
      this._observable = _observable;
      this._counter = 0;
      this._hasChanged = false;
      const options = {
        onWillAddFirstListener: () => {
          _observable.addObserver(this);
          this._observable.reportChanges();
        },
        onDidRemoveLastListener: () => {
          _observable.removeObserver(this);
        }
      };
      if (!store) {
        _addLeakageTraceLogic(options);
      }
      this.emitter = new Emitter(options);
      if (store) {
        store.add(this.emitter);
      }
    }
    beginUpdate(_observable) {
      this._counter++;
    }
    handlePossibleChange(_observable) {
    }
    handleChange(_observable, _change) {
      this._hasChanged = true;
    }
    endUpdate(_observable) {
      this._counter--;
      if (this._counter === 0) {
        this._observable.reportChanges();
        if (this._hasChanged) {
          this._hasChanged = false;
          this.emitter.fire(this._observable.get());
        }
      }
    }
  }
  function fromObservable(obs, store) {
    const observer = new EmitterObserver(obs, store);
    return observer.emitter.event;
  }
  Event2.fromObservable = fromObservable;
  function fromObservableLight(observable) {
    return (listener, thisArgs, disposables) => {
      let count = 0;
      let didChange = false;
      const observer = {
        beginUpdate() {
          count++;
        },
        endUpdate() {
          count--;
          if (count === 0) {
            observable.reportChanges();
            if (didChange) {
              didChange = false;
              listener.call(thisArgs);
            }
          }
        },
        handlePossibleChange() {
        },
        handleChange() {
          didChange = true;
        }
      };
      observable.addObserver(observer);
      observable.reportChanges();
      const disposable = {
        dispose() {
          observable.removeObserver(observer);
        }
      };
      addToDisposables(disposable, disposables);
      return disposable;
    };
  }
  Event2.fromObservableLight = fromObservableLight;
})(Event || (Event = {}));
const _EventProfiling = class _EventProfiling {
  constructor(name) {
    this.listenerCount = 0;
    this.invocationCount = 0;
    this.elapsedOverall = 0;
    this.durations = [];
    this.name = `${name}_${_EventProfiling._idPool++}`;
    _EventProfiling.all.add(this);
  }
  start(listenerCount) {
    this._stopWatch = new StopWatch();
    this.listenerCount = listenerCount;
  }
  stop() {
    if (this._stopWatch) {
      const elapsed = this._stopWatch.elapsed();
      this.durations.push(elapsed);
      this.elapsedOverall += elapsed;
      this.invocationCount += 1;
      this._stopWatch = void 0;
    }
  }
};
_EventProfiling.all = /* @__PURE__ */ new Set();
_EventProfiling._idPool = 0;
let EventProfiling = _EventProfiling;
let _globalLeakWarningThreshold = -1;
function setGlobalLeakWarningThreshold(n) {
  const oldValue = _globalLeakWarningThreshold;
  _globalLeakWarningThreshold = n;
  return {
    dispose() {
      _globalLeakWarningThreshold = oldValue;
    }
  };
}
let leakageMonitorId = 1;
function nextLeakageMonitorName() {
  return (leakageMonitorId++).toString(16).padStart(3, "0");
}
class LeakageMonitor {
  constructor(_errorHandler, threshold, name = nextLeakageMonitorName()) {
    this._errorHandler = _errorHandler;
    this.threshold = threshold;
    this.name = name;
    this._warnCountdown = 0;
  }
  dispose() {
    this._stacks?.clear();
  }
  check(stack, listenerCount) {
    const threshold = this.threshold;
    if (threshold <= 0 || listenerCount < threshold) {
      return void 0;
    }
    if (!this._stacks) {
      this._stacks = /* @__PURE__ */ new Map();
    }
    const stackKey = stack.value;
    const count = this._stacks.get(stackKey) || 0;
    this._stacks.set(stackKey, count + 1);
    this._warnCountdown -= 1;
    if (this._warnCountdown <= 0) {
      this._warnCountdown = threshold * 0.5;
      const [topStack, topCount] = this.getMostFrequentStack();
      const emitterName = /^[0-9a-f]+$/i.test(this.name) ? void 0 : this.name;
      const message = `[${this.name}] potential listener LEAK detected, having ${listenerCount} listeners already. MOST frequent listener (${topCount}):`;
      console.warn(message);
      console.warn(topStack);
      const kind = topCount / listenerCount > 0.3 ? "dominated" : "popular";
      const error = new ListenerLeakError(kind, message, topStack, listenerCount, emitterName);
      this._errorHandler(error);
    }
    return () => {
      const count2 = this._stacks.get(stackKey) || 0;
      if (count2 <= 1) {
        this._stacks.delete(stackKey);
      } else {
        this._stacks.set(stackKey, count2 - 1);
      }
    };
  }
  getMostFrequentStack() {
    if (!this._stacks) {
      return void 0;
    }
    let topStack;
    let topCount = 0;
    for (const [stack, count] of this._stacks) {
      if (!topStack || topCount < count) {
        topStack = [stack, count];
        topCount = count;
      }
    }
    return topStack;
  }
}
class Stacktrace {
  constructor(value) {
    this.value = value;
  }
  static create() {
    const err = new Error();
    return new Stacktrace(err.stack ?? "");
  }
  print() {
    console.warn(this.value.split("\n").slice(2).join("\n"));
  }
}
class ListenerLeakError extends Error {
  constructor(kind, details, stack, listenerCount, emitterName) {
    super(emitterName ? `[${emitterName}] potential listener LEAK detected, ${kind}` : `potential listener LEAK detected, ${kind}`);
    this.name = "ListenerLeakError";
    this.kind = kind;
    this.listenerCount = listenerCount;
    this.details = details;
    this.stack = stack;
  }
  static is(err) {
    return err instanceof ListenerLeakError || err instanceof Error && typeof err.kind === "string" && typeof err.listenerCount === "number";
  }
}
class ListenerRefusalError extends ListenerLeakError {
  constructor(kind, details, stack, listenerCount, emitterName) {
    super(kind, details, stack, listenerCount, emitterName);
    this.name = "ListenerRefusalError";
  }
}
let id = 0;
class UniqueContainer {
  constructor(value) {
    this.value = value;
    this.id = id++;
  }
}
const compactionThreshold = 2;
const forEachListener = (listeners, fn) => {
  if (listeners instanceof UniqueContainer) {
    fn(listeners);
  } else {
    for (let i = 0; i < listeners.length; i++) {
      const l = listeners[i];
      if (l) {
        fn(l);
      }
    }
  }
};
class Emitter {
  constructor(options) {
    this._size = 0;
    this._options = options;
    if (_globalLeakWarningThreshold > 0 || this._options?.leakWarningThreshold) {
      this._leakWarningThreshold = this._options?.leakWarningThreshold ?? _globalLeakWarningThreshold;
      this._leakWarningName = this._options?.leakWarningName ?? nextLeakageMonitorName();
      this._leakWarningErrorHandler = this._options?.onListenerError ?? onUnexpectedError;
    }
    this._perfMon = this._options?._profName ? new EventProfiling(this._options._profName) : void 0;
    this._deliveryQueue = this._options?.deliveryQueue;
  }
  _getLeakageMonitor() {
    if (this._leakWarningThreshold === void 0 || this._leakWarningName === void 0 || this._leakWarningErrorHandler === void 0) {
      return void 0;
    }
    return this._leakageMon ??= new LeakageMonitor(this._leakWarningErrorHandler, this._leakWarningThreshold, this._leakWarningName);
  }
  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      if (this._deliveryQueue?.current === this) {
        this._deliveryQueue.reset();
      }
      if (this._listeners) {
        if (_enableDisposeWithListenerWarning) {
          const listeners = this._listeners;
          queueMicrotask(() => {
            forEachListener(listeners, (l) => l.stack?.print());
          });
        }
        this._listeners = void 0;
        this._size = 0;
      }
      this._options?.onDidRemoveLastListener?.();
      this._leakageMon?.dispose();
    }
  }
  /**
   * For the public to allow to subscribe
   * to events from this Emitter
   */
  get event() {
    this._event ??= (callback, thisArgs, disposables) => {
      if (this._leakWarningThreshold !== void 0 && this._size > this._leakWarningThreshold ** 2) {
        const leakageMon = this._getLeakageMonitor();
        if (leakageMon) {
          const message = `[${leakageMon.name}] REFUSES to accept new listeners because it exceeded its threshold by far (${this._size} vs ${leakageMon.threshold})`;
          console.warn(message);
          const tuple = leakageMon.getMostFrequentStack() ?? ["UNKNOWN stack", -1];
          const kind = tuple[1] / this._size > 0.3 ? "dominated" : "popular";
          const error = new ListenerRefusalError(kind, `${message}. HINT: Stack shows most frequent listener (${tuple[1]}-times)`, tuple[0], this._size, this._options?.leakWarningName);
          const errorHandler = this._options?.onListenerError || onUnexpectedError;
          errorHandler(error);
          return Disposable.None;
        }
      }
      if (this._disposed) {
        return Disposable.None;
      }
      if (thisArgs) {
        callback = callback.bind(thisArgs);
      }
      const contained = new UniqueContainer(callback);
      let removeMonitor;
      let stack;
      if (this._leakWarningThreshold !== void 0 && this._size >= Math.ceil(this._leakWarningThreshold * 0.2)) {
        const leakageMon = this._getLeakageMonitor();
        if (leakageMon) {
          contained.stack = Stacktrace.create();
          removeMonitor = leakageMon.check(contained.stack, this._size + 1);
        }
      }
      if (_enableDisposeWithListenerWarning) {
        contained.stack = stack ?? Stacktrace.create();
      }
      if (!this._listeners) {
        this._options?.onWillAddFirstListener?.(this);
        this._listeners = contained;
        this._options?.onDidAddFirstListener?.(this);
      } else if (this._listeners instanceof UniqueContainer) {
        this._deliveryQueue ??= new EventDeliveryQueuePrivate();
        this._listeners = [this._listeners, contained];
      } else {
        this._listeners.push(contained);
      }
      this._options?.onDidAddListener?.(this);
      this._size++;
      const result = toDisposable(() => {
        removeMonitor?.();
        this._removeListener(contained);
      });
      addToDisposables(result, disposables);
      return result;
    };
    return this._event;
  }
  _removeListener(listener) {
    this._options?.onWillRemoveListener?.(this);
    if (!this._listeners) {
      return;
    }
    if (this._size === 1) {
      this._listeners = void 0;
      this._options?.onDidRemoveLastListener?.(this);
      this._size = 0;
      return;
    }
    const listeners = this._listeners;
    const index = listeners.indexOf(listener);
    if (index === -1) {
      console.log("disposed?", this._disposed);
      console.log("size?", this._size);
      console.log("arr?", JSON.stringify(this._listeners));
      throw new Error("Attempted to dispose unknown listener");
    }
    this._size--;
    listeners[index] = void 0;
    const adjustDeliveryQueue = this._deliveryQueue.current === this;
    if (this._size * compactionThreshold <= listeners.length) {
      let n = 0;
      for (let i = 0; i < listeners.length; i++) {
        if (listeners[i]) {
          listeners[n++] = listeners[i];
        } else if (adjustDeliveryQueue && n < this._deliveryQueue.end) {
          this._deliveryQueue.end--;
          if (n < this._deliveryQueue.i) {
            this._deliveryQueue.i--;
          }
        }
      }
      listeners.length = n;
    }
  }
  _deliver(listener, value) {
    if (!listener) {
      return;
    }
    const errorHandler = this._options?.onListenerError || onUnexpectedError;
    if (!errorHandler) {
      listener.value(value);
      return;
    }
    try {
      listener.value(value);
    } catch (e) {
      errorHandler(e);
    }
  }
  /** Delivers items in the queue. Assumes the queue is ready to go. */
  _deliverQueue(dq) {
    const listeners = dq.current._listeners;
    while (dq.i < dq.end) {
      this._deliver(listeners[dq.i++], dq.value);
    }
    dq.reset();
  }
  /**
   * To be kept private to fire an event to
   * subscribers
   */
  fire(event) {
    if (this._deliveryQueue?.current) {
      this._deliverQueue(this._deliveryQueue);
      this._perfMon?.stop();
    }
    this._perfMon?.start(this._size);
    if (!this._listeners) {
    } else if (this._listeners instanceof UniqueContainer) {
      this._deliver(this._listeners, event);
    } else {
      const dq = this._deliveryQueue;
      dq.enqueue(this, event, this._listeners.length);
      this._deliverQueue(dq);
    }
    this._perfMon?.stop();
  }
  hasListeners() {
    return this._size > 0;
  }
}
const createEventDeliveryQueue = () => new EventDeliveryQueuePrivate();
class EventDeliveryQueuePrivate {
  constructor() {
    /**
     * Index in current's listener list.
     */
    this.i = -1;
    /**
     * The last index in the listener's list to deliver.
     */
    this.end = 0;
  }
  enqueue(emitter, value, end) {
    this.i = 0;
    this.end = end;
    this.current = emitter;
    this.value = value;
  }
  reset() {
    this.i = this.end;
    this.current = void 0;
    this.value = void 0;
  }
}
class AsyncEmitter extends Emitter {
  async fireAsync(data, token, promiseJoin) {
    if (!this._listeners) {
      return;
    }
    if (!this._asyncDeliveryQueue) {
      this._asyncDeliveryQueue = new LinkedList();
    }
    forEachListener(this._listeners, (listener) => this._asyncDeliveryQueue.push([listener.value, data]));
    while (this._asyncDeliveryQueue.size > 0 && !token.isCancellationRequested) {
      const [listener, data2] = this._asyncDeliveryQueue.shift();
      const thenables = [];
      const event = {
        ...data2,
        token,
        waitUntil: (p) => {
          if (Object.isFrozen(thenables)) {
            throw new Error("waitUntil can NOT be called asynchronous");
          }
          if (promiseJoin) {
            p = promiseJoin(p, listener);
          }
          thenables.push(p);
        }
      };
      try {
        listener(event);
      } catch (e) {
        onUnexpectedError(e);
        continue;
      }
      Object.freeze(thenables);
      await Promise.allSettled(thenables).then((values) => {
        for (const value of values) {
          if (value.status === "rejected") {
            onUnexpectedError(value.reason);
          }
        }
      });
    }
  }
}
class PauseableEmitter extends Emitter {
  constructor(options) {
    super(options);
    this._isPaused = 0;
    this._eventQueue = new LinkedList();
    this._mergeFn = options?.merge;
  }
  get isPaused() {
    return this._isPaused !== 0;
  }
  pause() {
    this._isPaused++;
  }
  resume() {
    if (this._isPaused !== 0 && --this._isPaused === 0) {
      if (this._mergeFn) {
        if (this._eventQueue.size > 0) {
          const events = Array.from(this._eventQueue);
          this._eventQueue.clear();
          super.fire(this._mergeFn(events));
        }
      } else {
        while (!this._isPaused && this._eventQueue.size !== 0) {
          super.fire(this._eventQueue.shift());
        }
      }
    }
  }
  fire(event) {
    if (this._size) {
      if (this._isPaused !== 0) {
        this._eventQueue.push(event);
      } else {
        super.fire(event);
      }
    }
  }
}
class DebounceEmitter extends PauseableEmitter {
  constructor(options) {
    super(options);
    this._delay = options.delay ?? 100;
  }
  fire(event) {
    if (!this._handle) {
      this.pause();
      this._handle = setTimeout(() => {
        this._handle = void 0;
        this.resume();
      }, this._delay);
    }
    super.fire(event);
  }
}
class MicrotaskEmitter extends Emitter {
  constructor(options) {
    super(options);
    this._queuedEvents = [];
    this._mergeFn = options?.merge;
  }
  fire(event) {
    if (!this.hasListeners()) {
      return;
    }
    this._queuedEvents.push(event);
    if (this._queuedEvents.length === 1) {
      queueMicrotask(() => {
        if (this._mergeFn) {
          super.fire(this._mergeFn(this._queuedEvents));
        } else {
          this._queuedEvents.forEach((e) => super.fire(e));
        }
        this._queuedEvents = [];
      });
    }
  }
}
class EventMultiplexer {
  constructor() {
    this.hasListeners = false;
    this.events = [];
    this.emitter = new Emitter({
      onWillAddFirstListener: () => this.onFirstListenerAdd(),
      onDidRemoveLastListener: () => this.onLastListenerRemove()
    });
  }
  get event() {
    return this.emitter.event;
  }
  add(event) {
    const e = { event, listener: null };
    this.events.push(e);
    if (this.hasListeners) {
      this.hook(e);
    }
    const dispose = () => {
      if (this.hasListeners) {
        this.unhook(e);
      }
      const idx = this.events.indexOf(e);
      this.events.splice(idx, 1);
    };
    return toDisposable(createSingleCallFunction(dispose));
  }
  onFirstListenerAdd() {
    this.hasListeners = true;
    this.events.forEach((e) => this.hook(e));
  }
  onLastListenerRemove() {
    this.hasListeners = false;
    this.events.forEach((e) => this.unhook(e));
  }
  hook(e) {
    e.listener = e.event((r) => this.emitter.fire(r));
  }
  unhook(e) {
    e.listener?.dispose();
    e.listener = null;
  }
  dispose() {
    this.emitter.dispose();
    for (const e of this.events) {
      e.listener?.dispose();
    }
    this.events = [];
  }
}
class DynamicListEventMultiplexer {
  constructor(items, onAddItem, onRemoveItem, getEvent) {
    this._store = new DisposableStore();
    const multiplexer = this._store.add(new EventMultiplexer());
    const itemListeners = this._store.add(new DisposableMap());
    function addItem(instance) {
      itemListeners.set(instance, multiplexer.add(getEvent(instance)));
    }
    for (const instance of items) {
      addItem(instance);
    }
    this._store.add(onAddItem((instance) => {
      addItem(instance);
    }));
    this._store.add(onRemoveItem((instance) => {
      itemListeners.deleteAndDispose(instance);
    }));
    this.event = multiplexer.event;
  }
  dispose() {
    this._store.dispose();
  }
}
class EventBufferer {
  constructor() {
    this.data = [];
  }
  wrapEvent(event, reduce, initial) {
    return (listener, thisArgs, disposables) => {
      return event((i) => {
        const data = this.data[this.data.length - 1];
        if (!reduce) {
          if (data) {
            data.buffers.push(() => listener.call(thisArgs, i));
          } else {
            listener.call(thisArgs, i);
          }
          return;
        }
        const reduceData = data;
        if (!reduceData) {
          listener.call(thisArgs, reduce(initial, i));
          return;
        }
        reduceData.items ??= [];
        reduceData.items.push(i);
        if (reduceData.buffers.length === 0) {
          data.buffers.push(() => {
            reduceData.reducedResult ??= initial ? reduceData.items.reduce(reduce, initial) : reduceData.items.reduce(reduce);
            listener.call(thisArgs, reduceData.reducedResult);
          });
        }
      }, void 0, disposables);
    };
  }
  bufferEvents(fn) {
    const data = { buffers: new Array() };
    this.data.push(data);
    const r = fn();
    this.data.pop();
    data.buffers.forEach((flush) => flush());
    return r;
  }
}
class Relay {
  constructor() {
    this.listening = false;
    this.inputEvent = Event.None;
    this.inputEventListener = Disposable.None;
    this.emitter = new Emitter({
      onDidAddFirstListener: () => {
        this.listening = true;
        this.inputEventListener = this.inputEvent(this.emitter.fire, this.emitter);
      },
      onDidRemoveLastListener: () => {
        this.listening = false;
        this.inputEventListener.dispose();
      }
    });
    this.event = this.emitter.event;
  }
  set input(event) {
    this.inputEvent = event;
    if (this.listening) {
      this.inputEventListener.dispose();
      this.inputEventListener = event(this.emitter.fire, this.emitter);
    }
  }
  dispose() {
    this.inputEventListener.dispose();
    this.emitter.dispose();
  }
}
class ValueWithChangeEvent {
  constructor(_value) {
    this._value = _value;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  static const(value) {
    return new ConstValueWithChangeEvent(value);
  }
  get value() {
    return this._value;
  }
  set value(value) {
    if (value !== this._value) {
      this._value = value;
      this._onDidChange.fire(void 0);
    }
  }
}
class ConstValueWithChangeEvent {
  constructor(value) {
    this.value = value;
    this.onDidChange = Event.None;
  }
}
function trackSetChanges(getData, onDidChangeData, handleItem) {
  const map = new DisposableMap();
  let oldData = new Set(getData());
  for (const d of oldData) {
    map.set(d, handleItem(d));
  }
  const store = new DisposableStore();
  store.add(onDidChangeData(() => {
    const newData = getData();
    const diff = diffSets(oldData, newData);
    for (const r of diff.removed) {
      map.deleteAndDispose(r);
    }
    for (const a of diff.added) {
      map.set(a, handleItem(a));
    }
    oldData = new Set(newData);
  }));
  store.add(map);
  return store;
}
function addToDisposables(result, disposables) {
  if (disposables instanceof DisposableStore) {
    disposables.add(result);
  } else if (Array.isArray(disposables)) {
    disposables.push(result);
  }
}
function disposeAndRemove(result, disposables) {
  if (disposables instanceof DisposableStore) {
    disposables.delete(result);
  } else if (Array.isArray(disposables)) {
    const index = disposables.indexOf(result);
    if (index !== -1) {
      disposables.splice(index, 1);
    }
  }
  result.dispose();
}
export {
  AsyncEmitter,
  DebounceEmitter,
  DynamicListEventMultiplexer,
  Emitter,
  Event,
  EventBufferer,
  EventMultiplexer,
  EventProfiling,
  ListenerLeakError,
  ListenerRefusalError,
  MicrotaskEmitter,
  PauseableEmitter,
  Relay,
  ValueWithChangeEvent,
  createEventDeliveryQueue,
  setGlobalLeakWarningThreshold,
  trackSetChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGV2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZGlmZlNldHMgfSBmcm9tICcuL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJT2JzZXJ2ZXIgfSBmcm9tICcuL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW52IH0gZnJvbSAnLi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IE1pY3JvdGFza0RlbGF5IH0gZnJvbSAnLi9zeW1ib2xzLmpzJztcblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVW5jb21tZW50IHRoZSBuZXh0IGxpbmUgdG8gcHJpbnQgd2FybmluZ3Mgd2hlbmV2ZXIgYW4gZW1pdHRlciB3aXRoIGxpc3RlbmVycyBpcyBkaXNwb3NlZC4gVGhhdCBpcyBhIHNpZ24gb2YgY29kZSBzbWVsbC5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBfZW5hYmxlRGlzcG9zZVdpdGhMaXN0ZW5lcldhcm5pbmcgPSBmYWxzZVxuXHQvLyB8fCBCb29sZWFuKFwiVFJVRVwiKSAvLyBjYXVzZXMgYSBsaW50ZXIgd2FybmluZyBzbyB0aGF0IGl0IGNhbm5vdCBiZSBwdXNoZWRcblx0O1xuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBVbmNvbW1lbnQgdGhlIG5leHQgbGluZSB0byBwcmludCB3YXJuaW5ncyB3aGVuZXZlciBhIHNuYXBzaG90dGVkIGV2ZW50IGlzIHVzZWQgcmVwZWF0ZWRseSB3aXRob3V0IGNsZWFudXAuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0Mjg1MVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IF9lbmFibGVTbmFwc2hvdFBvdGVudGlhbExlYWtXYXJuaW5nID0gZmFsc2Vcblx0Ly8gfHwgQm9vbGVhbihcIlRSVUVcIikgLy8gY2F1c2VzIGEgbGludGVyIHdhcm5pbmcgc28gdGhhdCBpdCBjYW5ub3QgYmUgcHVzaGVkXG5cdDtcblxuXG5jb25zdCBfYnVmZmVyTGVha1dhcm5Db3VudFRocmVzaG9sZCA9IDEwMDtcbmNvbnN0IF9idWZmZXJMZWFrV2FyblRpbWVUaHJlc2hvbGQgPSA2MF8wMDA7IC8vIDEgbWludXRlXG5cbmZ1bmN0aW9uIF9pc0J1ZmZlckxlYWtXYXJuaW5nRW5hYmxlZCgpOiBib29sZWFuIHtcblx0cmV0dXJuICEhZW52WydWU0NPREVfREVWJ107XG59XG5cbi8qKlxuICogQW4gZXZlbnQgd2l0aCB6ZXJvIG9yIG9uZSBwYXJhbWV0ZXJzIHRoYXQgY2FuIGJlIHN1YnNjcmliZWQgdG8uIFRoZSBldmVudCBpcyBhIGZ1bmN0aW9uIGl0c2VsZi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFdmVudDxUPiB7XG5cdChsaXN0ZW5lcjogKGU6IFQpID0+IHVua25vd24sIHRoaXNBcmdzPzogYW55LCBkaXNwb3NhYmxlcz86IElEaXNwb3NhYmxlW10gfCBEaXNwb3NhYmxlU3RvcmUpOiBJRGlzcG9zYWJsZTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBFdmVudCB7XG5cdGV4cG9ydCBjb25zdCBOb25lOiBFdmVudDxhbnk+ID0gKCkgPT4gRGlzcG9zYWJsZS5Ob25lO1xuXG5cdGZ1bmN0aW9uIF9hZGRMZWFrYWdlVHJhY2VMb2dpYyhvcHRpb25zOiBFbWl0dGVyT3B0aW9ucykge1xuXHRcdGlmIChfZW5hYmxlU25hcHNob3RQb3RlbnRpYWxMZWFrV2FybmluZykge1xuXHRcdFx0Y29uc3QgeyBvbkRpZEFkZExpc3RlbmVyOiBvcmlnTGlzdGVuZXJEaWRBZGQgfSA9IG9wdGlvbnM7XG5cdFx0XHRjb25zdCBzdGFjayA9IFN0YWNrdHJhY2UuY3JlYXRlKCk7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0b3B0aW9ucy5vbkRpZEFkZExpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoKytjb3VudCA9PT0gMikge1xuXHRcdFx0XHRcdGNvbnNvbGUud2Fybignc25hcHNob3R0ZWQgZW1pdHRlciBMSUtFTFkgdXNlZCBwdWJsaWMgYW5kIFNIT1VMRCBIQVZFIEJFRU4gY3JlYXRlZCB3aXRoIERpc3Bvc2FibGVTdG9yZS4gc25hcHNob3R0ZWQgaGVyZScpO1xuXHRcdFx0XHRcdHN0YWNrLnByaW50KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3JpZ0xpc3RlbmVyRGlkQWRkPy4oKTtcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIGV2ZW50LCByZXR1cm5zIGFub3RoZXIgZXZlbnQgd2hpY2ggZGVib3VuY2VzIGNhbGxzIGFuZCBkZWZlcnMgdGhlIGxpc3RlbmVycyB0byBhIGxhdGVyIHRhc2sgdmlhIGEgc2hhcmVkXG5cdCAqIGBzZXRUaW1lb3V0YC4gVGhlIGV2ZW50IGlzIGNvbnZlcnRlZCBpbnRvIGEgc2lnbmFsIChgRXZlbnQ8dm9pZD5gKSB0byBhdm9pZCBhZGRpdGlvbmFsIG9iamVjdCBjcmVhdGlvbiBhcyBhXG5cdCAqIHJlc3VsdCBvZiBtZXJnaW5nIGV2ZW50cyBhbmQgdG8gdHJ5IHByZXZlbnQgcmFjZSBjb25kaXRpb25zIHRoYXQgY291bGQgYXJpc2Ugd2hlbiB1c2luZyByZWxhdGVkIGRlZmVycmVkIGFuZFxuXHQgKiBub24tZGVmZXJyZWQgZXZlbnRzLlxuXHQgKlxuXHQgKiBUaGlzIGlzIHVzZWZ1bCBmb3IgZGVmZXJyaW5nIG5vbi1jcml0aWNhbCB3b3JrIChlZy4gZ2VuZXJhbCBVSSB1cGRhdGVzKSB0byBlbnN1cmUgaXQgZG9lcyBub3QgYmxvY2sgY3JpdGljYWwgd29ya1xuXHQgKiAoZWcuIGxhdGVuY3kgb2Yga2V5cHJlc3MgdG8gdGV4dCByZW5kZXJlZCkuXG5cdCAqXG5cdCAqICpOT1RFKiB0aGF0IHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBgRXZlbnRgIGFuZCBpdCBNVVNUIGJlIGNhbGxlZCB3aXRoIGEgYERpc3Bvc2FibGVTdG9yZWAgd2hlbmV2ZXIgdGhlIHJldHVybmVkXG5cdCAqIGV2ZW50IGlzIGFjY2Vzc2libGUgdG8gXCJ0aGlyZCBwYXJ0aWVzXCIsIGUuZyB0aGUgZXZlbnQgaXMgYSBwdWJsaWMgcHJvcGVydHkuIE90aGVyd2lzZSBhIGxlYWtlZCBsaXN0ZW5lciBvbiB0aGVcblx0ICogcmV0dXJuZWQgZXZlbnQgY2F1c2VzIHRoaXMgdXRpbGl0eSB0byBsZWFrIGEgbGlzdGVuZXIgb24gdGhlIG9yaWdpbmFsIGV2ZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gZXZlbnQgVGhlIGV2ZW50IHNvdXJjZSBmb3IgdGhlIG5ldyBldmVudC5cblx0ICogQHBhcmFtIGZsdXNoT25MaXN0ZW5lclJlbW92ZSBXaGV0aGVyIHRvIGZpcmUgYWxsIGRlYm91bmNlZCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQuIElmIHRoaXMgaXMgbm90XG5cdCAqIHNwZWNpZmllZCwgc29tZSBldmVudHMgY291bGQgZ28gbWlzc2luZy4gVXNlIHRoaXMgaWYgaXQncyBpbXBvcnRhbnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBwcm9jZXNzZWQsIGV2ZW4gaWYgdGhlXG5cdCAqIGxpc3RlbmVyIGdldHMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWJvdW5jZWQgZXZlbnQgZmlyZXMuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZGVmZXIoZXZlbnQ6IEV2ZW50PHVua25vd24+LCBmbHVzaE9uTGlzdGVuZXJSZW1vdmU/OiBib29sZWFuLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiBkZWJvdW5jZTx1bmtub3duLCB2b2lkPihldmVudCwgKCkgPT4gdm9pZCAwLCAwLCB1bmRlZmluZWQsIGZsdXNoT25MaXN0ZW5lclJlbW92ZSA/PyB0cnVlLCB1bmRlZmluZWQsIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIGV2ZW50LCByZXR1cm5zIGFub3RoZXIgZXZlbnQgd2hpY2ggb25seSBmaXJlcyBvbmNlLlxuXHQgKlxuXHQgKiBAcGFyYW0gZXZlbnQgVGhlIGV2ZW50IHNvdXJjZSBmb3IgdGhlIG5ldyBldmVudC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBvbmNlPFQ+KGV2ZW50OiBFdmVudDxUPik6IEV2ZW50PFQ+IHtcblx0XHRyZXR1cm4gKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0Ly8gd2UgbmVlZCB0aGlzLCBpbiBjYXNlIHRoZSBldmVudCBmaXJlcyBkdXJpbmcgdGhlIGxpc3RlbmVyIGNhbGxcblx0XHRcdGxldCBkaWRGaXJlID0gZmFsc2U7XG5cdFx0XHRsZXQgcmVzdWx0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHJlc3VsdCA9IGV2ZW50KGUgPT4ge1xuXHRcdFx0XHRpZiAoZGlkRmlyZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXN1bHQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRpZEZpcmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGUpO1xuXHRcdFx0fSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRpZiAoZGlkRmlyZSkge1xuXHRcdFx0XHRyZXN1bHQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYW4gZXZlbnQsIHJldHVybnMgYW5vdGhlciBldmVudCB3aGljaCBvbmx5IGZpcmVzIG9uY2UsIGFuZCBvbmx5IHdoZW4gdGhlIGNvbmRpdGlvbiBpcyBtZXQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIG9uY2VJZjxUPihldmVudDogRXZlbnQ8VD4sIGNvbmRpdGlvbjogKGU6IFQpID0+IGJvb2xlYW4pOiBFdmVudDxUPiB7XG5cdFx0cmV0dXJuIEV2ZW50Lm9uY2UoRXZlbnQuZmlsdGVyKGV2ZW50LCBjb25kaXRpb24pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXBzIGFuIGV2ZW50IG9mIG9uZSB0eXBlIGludG8gYW4gZXZlbnQgb2YgYW5vdGhlciB0eXBlIHVzaW5nIGEgbWFwcGluZyBmdW5jdGlvbiwgc2ltaWxhciB0byBob3dcblx0ICogYEFycmF5LnByb3RvdHlwZS5tYXBgIHdvcmtzLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBtYXAgVGhlIG1hcHBpbmcgZnVuY3Rpb24uXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gbWFwPEksIE8+KGV2ZW50OiBFdmVudDxJPiwgbWFwOiAoaTogSSkgPT4gTywgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PE8+IHtcblx0XHRyZXR1cm4gc25hcHNob3QoKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4gZXZlbnQoaSA9PiBsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCBtYXAoaSkpLCBudWxsLCBkaXNwb3NhYmxlcyksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyYXBzIGFuIGV2ZW50IGluIGFub3RoZXIgZXZlbnQgdGhhdCBwZXJmb3JtcyBzb21lIGZ1bmN0aW9uIG9uIHRoZSBldmVudCBvYmplY3QgYmVmb3JlIGZpcmluZy5cblx0ICpcblx0ICogKk5PVEUqIHRoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGBFdmVudGAgYW5kIGl0IE1VU1QgYmUgY2FsbGVkIHdpdGggYSBgRGlzcG9zYWJsZVN0b3JlYCB3aGVuZXZlciB0aGUgcmV0dXJuZWRcblx0ICogZXZlbnQgaXMgYWNjZXNzaWJsZSB0byBcInRoaXJkIHBhcnRpZXNcIiwgZS5nIHRoZSBldmVudCBpcyBhIHB1YmxpYyBwcm9wZXJ0eS4gT3RoZXJ3aXNlIGEgbGVha2VkIGxpc3RlbmVyIG9uIHRoZVxuXHQgKiByZXR1cm5lZCBldmVudCBjYXVzZXMgdGhpcyB1dGlsaXR5IHRvIGxlYWsgYSBsaXN0ZW5lciBvbiB0aGUgb3JpZ2luYWwgZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gZWFjaCBUaGUgZnVuY3Rpb24gdG8gcGVyZm9ybSBvbiB0aGUgZXZlbnQgb2JqZWN0LlxuXHQgKiBAcGFyYW0gZGlzcG9zYWJsZSBBIGRpc3Bvc2FibGUgc3RvcmUgdG8gYWRkIHRoZSBuZXcgRXZlbnRFbWl0dGVyIHRvLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZvckVhY2g8ST4oZXZlbnQ6IEV2ZW50PEk+LCBlYWNoOiAoaTogSSkgPT4gdm9pZCwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PEk+IHtcblx0XHRyZXR1cm4gc25hcHNob3QoKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4gZXZlbnQoaSA9PiB7IGVhY2goaSk7IGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGkpOyB9LCBudWxsLCBkaXNwb3NhYmxlcyksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyYXBzIGFuIGV2ZW50IGluIGFub3RoZXIgZXZlbnQgdGhhdCBmaXJlcyBvbmx5IHdoZW4gc29tZSBjb25kaXRpb24gaXMgbWV0LlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBmaWx0ZXIgVGhlIGZpbHRlciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgdGhlIGNvbmRpdGlvbi4gVGhlIGV2ZW50IHdpbGwgZmlyZSBmb3IgdGhlIG9iamVjdCBpZiB0aGlzIGZ1bmN0aW9uXG5cdCAqIHJldHVybnMgdHJ1ZS5cblx0ICogQHBhcmFtIGRpc3Bvc2FibGUgQSBkaXNwb3NhYmxlIHN0b3JlIHRvIGFkZCB0aGUgbmV3IEV2ZW50RW1pdHRlciB0by5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWx0ZXI8VCwgVT4oZXZlbnQ6IEV2ZW50PFQgfCBVPiwgZmlsdGVyOiAoZTogVCB8IFUpID0+IGUgaXMgVCwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gZmlsdGVyPFQ+KGV2ZW50OiBFdmVudDxUPiwgZmlsdGVyOiAoZTogVCkgPT4gYm9vbGVhbiwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gZmlsdGVyPFQsIFI+KGV2ZW50OiBFdmVudDxUIHwgUj4sIGZpbHRlcjogKGU6IFQgfCBSKSA9PiBlIGlzIFIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxSPjtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbHRlcjxUPihldmVudDogRXZlbnQ8VD4sIGZpbHRlcjogKGU6IFQpID0+IGJvb2xlYW4sIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxUPiB7XG5cdFx0cmV0dXJuIHNuYXBzaG90KChsaXN0ZW5lciwgdGhpc0FyZ3MgPSBudWxsLCBkaXNwb3NhYmxlcz8pID0+IGV2ZW50KGUgPT4gZmlsdGVyKGUpICYmIGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGUpLCBudWxsLCBkaXNwb3NhYmxlcyksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIGV2ZW50LCByZXR1cm5zIHRoZSBzYW1lIGV2ZW50IGJ1dCB0eXBlZCBhcyBgRXZlbnQ8dm9pZD5gLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIHNpZ25hbDxUPihldmVudDogRXZlbnQ8VD4pOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIGV2ZW50IGFzIEV2ZW50PGFueT4gYXMgRXZlbnQ8dm9pZD47XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSBjb2xsZWN0aW9uIG9mIGV2ZW50cywgcmV0dXJucyBhIHNpbmdsZSBldmVudCB3aGljaCBlbWl0cyB3aGVuZXZlciBhbnkgb2YgdGhlIHByb3ZpZGVkIGV2ZW50cyBlbWl0LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGFueTxUPiguLi5ldmVudHM6IEV2ZW50PFQ+W10pOiBFdmVudDxUPjtcblx0ZXhwb3J0IGZ1bmN0aW9uIGFueSguLi5ldmVudHM6IEV2ZW50PGFueT5bXSk6IEV2ZW50PHZvaWQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gYW55PFQ+KC4uLmV2ZW50czogRXZlbnQ8VD5bXSk6IEV2ZW50PFQ+IHtcblx0XHRyZXR1cm4gKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZSguLi5ldmVudHMubWFwKGV2ZW50ID0+IGV2ZW50KGUgPT4gbGlzdGVuZXIuY2FsbCh0aGlzQXJncywgZSkpKSk7XG5cdFx0XHRyZXR1cm4gYWRkQW5kUmV0dXJuRGlzcG9zYWJsZShkaXNwb3NhYmxlLCBkaXNwb3NhYmxlcyk7XG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiByZWR1Y2U8SSwgTz4oZXZlbnQ6IEV2ZW50PEk+LCBtZXJnZTogKGxhc3Q6IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBJKSA9PiBPLCBpbml0aWFsPzogTywgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PE8+IHtcblx0XHRsZXQgb3V0cHV0OiBPIHwgdW5kZWZpbmVkID0gaW5pdGlhbDtcblxuXHRcdHJldHVybiBtYXA8SSwgTz4oZXZlbnQsIGUgPT4ge1xuXHRcdFx0b3V0cHV0ID0gbWVyZ2Uob3V0cHV0LCBlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSwgZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzbmFwc2hvdDxUPihldmVudDogRXZlbnQ8VD4sIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCk6IEV2ZW50PFQ+IHtcblx0XHRsZXQgbGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRW1pdHRlck9wdGlvbnMgfCB1bmRlZmluZWQgPSB7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyKCkge1xuXHRcdFx0XHRsaXN0ZW5lciA9IGV2ZW50KGVtaXR0ZXIuZmlyZSwgZW1pdHRlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXIoKSB7XG5cdFx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICghZGlzcG9zYWJsZSkge1xuXHRcdFx0X2FkZExlYWthZ2VUcmFjZUxvZ2ljKG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPihvcHRpb25zKTtcblxuXHRcdGRpc3Bvc2FibGU/LmFkZChlbWl0dGVyKTtcblxuXHRcdHJldHVybiBlbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgdGhlIElEaXNwb3NhYmxlIHRvIHRoZSBzdG9yZSBpZiBpdCdzIHNldCwgYW5kIHJldHVybnMgaXQuIFVzZWZ1bCB0b1xuXHQgKiBFdmVudCBmdW5jdGlvbiBpbXBsZW1lbnRhdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIGFkZEFuZFJldHVybkRpc3Bvc2FibGU8VCBleHRlbmRzIElEaXNwb3NhYmxlPihkOiBULCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgSURpc3Bvc2FibGVbXSB8IHVuZGVmaW5lZCk6IFQge1xuXHRcdGlmIChzdG9yZSBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRzdG9yZS5wdXNoKGQpO1xuXHRcdH0gZWxzZSBpZiAoc3RvcmUpIHtcblx0XHRcdHN0b3JlLmFkZChkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGQ7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYW4gZXZlbnQsIGNyZWF0ZXMgYSBuZXcgZW1pdHRlciB0aGF0IGV2ZW50IHRoYXQgd2lsbCBkZWJvdW5jZSBldmVudHMgYmFzZWQgb24ge0BsaW5rIGRlbGF5fSBhbmQgZ2l2ZSBhblxuXHQgKiBhcnJheSBldmVudCBvYmplY3Qgb2YgYWxsIGV2ZW50cyB0aGF0IGZpcmVkLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBvcmlnaW5hbCBldmVudCB0byBkZWJvdW5jZS5cblx0ICogQHBhcmFtIG1lcmdlIEEgZnVuY3Rpb24gdGhhdCByZWR1Y2VzIGFsbCBldmVudHMgaW50byBhIHNpbmdsZSBldmVudC5cblx0ICogQHBhcmFtIGRlbGF5IFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIGRlYm91bmNlLlxuXHQgKiBAcGFyYW0gbGVhZGluZyBXaGV0aGVyIHRvIGZpcmUgYSBsZWFkaW5nIGV2ZW50IHdpdGhvdXQgZGVib3VuY2luZy5cblx0ICogQHBhcmFtIGZsdXNoT25MaXN0ZW5lclJlbW92ZSBXaGV0aGVyIHRvIGZpcmUgYWxsIGRlYm91bmNlZCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQuIElmIHRoaXMgaXMgbm90XG5cdCAqIHNwZWNpZmllZCwgc29tZSBldmVudHMgY291bGQgZ28gbWlzc2luZy4gVXNlIHRoaXMgaWYgaXQncyBpbXBvcnRhbnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBwcm9jZXNzZWQsIGV2ZW4gaWYgdGhlXG5cdCAqIGxpc3RlbmVyIGdldHMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWJvdW5jZWQgZXZlbnQgZmlyZXMuXG5cdCAqIEBwYXJhbSBsZWFrV2FybmluZ1RocmVzaG9sZCBTZWUge0BsaW5rIEVtaXR0ZXJPcHRpb25zLmxlYWtXYXJuaW5nVGhyZXNob2xkfS5cblx0ICogQHBhcmFtIGRpc3Bvc2FibGUgQSBkaXNwb3NhYmxlIHN0b3JlIHRvIHJlZ2lzdGVyIHRoZSBkZWJvdW5jZSBlbWl0dGVyIHRvLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGRlYm91bmNlPFQ+KGV2ZW50OiBFdmVudDxUPiwgbWVyZ2U6IChsYXN0OiBUIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gVCwgZGVsYXk/OiBudW1iZXIgfCB0eXBlb2YgTWljcm90YXNrRGVsYXksIGxlYWRpbmc/OiBib29sZWFuLCBmbHVzaE9uTGlzdGVuZXJSZW1vdmU/OiBib29sZWFuLCBsZWFrV2FybmluZ1RocmVzaG9sZD86IG51bWJlciwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gZGVib3VuY2U8SSwgTz4oZXZlbnQ6IEV2ZW50PEk+LCBtZXJnZTogKGxhc3Q6IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBJKSA9PiBPLCBkZWxheT86IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSwgbGVhZGluZz86IGJvb2xlYW4sIGZsdXNoT25MaXN0ZW5lclJlbW92ZT86IGJvb2xlYW4sIGxlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8Tz47XG5cdGV4cG9ydCBmdW5jdGlvbiBkZWJvdW5jZTxJLCBPPihldmVudDogRXZlbnQ8ST4sIG1lcmdlOiAobGFzdDogTyB8IHVuZGVmaW5lZCwgZXZlbnQ6IEkpID0+IE8sIGRlbGF5OiBudW1iZXIgfCB0eXBlb2YgTWljcm90YXNrRGVsYXkgPSAxMDAsIGxlYWRpbmcgPSBmYWxzZSwgZmx1c2hPbkxpc3RlbmVyUmVtb3ZlID0gZmFsc2UsIGxlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8Tz4ge1xuXHRcdGxldCBzdWJzY3JpcHRpb246IElEaXNwb3NhYmxlO1xuXHRcdGxldCBvdXRwdXQ6IE8gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGhhbmRsZTogVGltZW91dCB8IHVuZGVmaW5lZCB8IG51bGwgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG51bURlYm91bmNlZENhbGxzID0gMDtcblx0XHRsZXQgZG9GaXJlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBvcHRpb25zOiBFbWl0dGVyT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHtcblx0XHRcdGxlYWtXYXJuaW5nVGhyZXNob2xkLFxuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0c3Vic2NyaXB0aW9uID0gZXZlbnQoY3VyID0+IHtcblx0XHRcdFx0XHRudW1EZWJvdW5jZWRDYWxscysrO1xuXHRcdFx0XHRcdG91dHB1dCA9IG1lcmdlKG91dHB1dCwgY3VyKTtcblxuXHRcdFx0XHRcdGlmIChsZWFkaW5nICYmICFoYW5kbGUpIHtcblx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShvdXRwdXQpO1xuXHRcdFx0XHRcdFx0b3V0cHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvRmlyZSA9ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IF9vdXRwdXQgPSBvdXRwdXQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoIWxlYWRpbmcgfHwgbnVtRGVib3VuY2VkQ2FsbHMgPiAxKSB7XG5cdFx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShfb3V0cHV0ISk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRudW1EZWJvdW5jZWRDYWxscyA9IDA7XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgZGVsYXkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRpZiAoaGFuZGxlKSB7XG5cdFx0XHRcdFx0XHRcdGNsZWFyVGltZW91dChoYW5kbGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aGFuZGxlID0gc2V0VGltZW91dChkb0ZpcmUsIGRlbGF5KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGhhbmRsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZSA9IG51bGw7XG5cdFx0XHRcdFx0XHRcdHF1ZXVlTWljcm90YXNrKGRvRmlyZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRvbldpbGxSZW1vdmVMaXN0ZW5lcigpIHtcblx0XHRcdFx0aWYgKGZsdXNoT25MaXN0ZW5lclJlbW92ZSAmJiBudW1EZWJvdW5jZWRDYWxscyA+IDApIHtcblx0XHRcdFx0XHRkb0ZpcmU/LigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXIoKSB7XG5cdFx0XHRcdGRvRmlyZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKCFkaXNwb3NhYmxlKSB7XG5cdFx0XHRfYWRkTGVha2FnZVRyYWNlTG9naWMob3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPE8+KG9wdGlvbnMpO1xuXG5cdFx0ZGlzcG9zYWJsZT8uYWRkKGVtaXR0ZXIpO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHQvKipcblx0ICogRGVib3VuY2VzIGFuIGV2ZW50LCBmaXJpbmcgYWZ0ZXIgc29tZSBkZWxheSAoZGVmYXVsdD0wKSB3aXRoIGFuIGFycmF5IG9mIGFsbCBldmVudCBvcmlnaW5hbCBvYmplY3RzLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBkZWxheSBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byBkZWJvdW5jZS5cblx0ICogQHBhcmFtIGZsdXNoT25MaXN0ZW5lclJlbW92ZSBXaGV0aGVyIHRvIGZpcmUgYWxsIGRlYm91bmNlZCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQuIElmIHRoaXMgaXMgbm90XG5cdCAqIHNwZWNpZmllZCwgc29tZSBldmVudHMgY291bGQgZ28gbWlzc2luZy4gVXNlIHRoaXMgaWYgaXQncyBpbXBvcnRhbnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBwcm9jZXNzZWQsIGV2ZW4gaWYgdGhlXG5cdCAqIGxpc3RlbmVyIGdldHMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWJvdW5jZWQgZXZlbnQgZmlyZXMuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gYWNjdW11bGF0ZTxUPihldmVudDogRXZlbnQ8VD4sIGRlbGF5OiBudW1iZXIgfCB0eXBlb2YgTWljcm90YXNrRGVsYXkgPSAwLCBmbHVzaE9uTGlzdGVuZXJSZW1vdmU/OiBib29sZWFuLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8VFtdPiB7XG5cdFx0cmV0dXJuIEV2ZW50LmRlYm91bmNlPFQsIFRbXT4oZXZlbnQsIChsYXN0LCBlKSA9PiB7XG5cdFx0XHRpZiAoIWxhc3QpIHtcblx0XHRcdFx0cmV0dXJuIFtlXTtcblx0XHRcdH1cblx0XHRcdGxhc3QucHVzaChlKTtcblx0XHRcdHJldHVybiBsYXN0O1xuXHRcdH0sIGRlbGF5LCB1bmRlZmluZWQsIGZsdXNoT25MaXN0ZW5lclJlbW92ZSA/PyB0cnVlLCB1bmRlZmluZWQsIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRocm90dGxlcyBhbiBldmVudCwgZW5zdXJpbmcgdGhlIGV2ZW50IGlzIGZpcmVkIGF0IG1vc3Qgb25jZSBkdXJpbmcgdGhlIHNwZWNpZmllZCBkZWxheSBwZXJpb2QuXG5cdCAqIFVubGlrZSBkZWJvdW5jZSwgdGhyb3R0bGUgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IG9uIHRoZSBsZWFkaW5nIGVkZ2UgYW5kL29yIGFmdGVyIHRoZSBkZWxheSBvbiB0aGUgdHJhaWxpbmcgZWRnZS5cblx0ICpcblx0ICogKk5PVEUqIHRoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGBFdmVudGAgYW5kIGl0IE1VU1QgYmUgY2FsbGVkIHdpdGggYSBgRGlzcG9zYWJsZVN0b3JlYCB3aGVuZXZlciB0aGUgcmV0dXJuZWRcblx0ICogZXZlbnQgaXMgYWNjZXNzaWJsZSB0byBcInRoaXJkIHBhcnRpZXNcIiwgZS5nIHRoZSBldmVudCBpcyBhIHB1YmxpYyBwcm9wZXJ0eS4gT3RoZXJ3aXNlIGEgbGVha2VkIGxpc3RlbmVyIG9uIHRoZVxuXHQgKiByZXR1cm5lZCBldmVudCBjYXVzZXMgdGhpcyB1dGlsaXR5IHRvIGxlYWsgYSBsaXN0ZW5lciBvbiB0aGUgb3JpZ2luYWwgZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gbWVyZ2UgQW4gYWNjdW11bGF0b3IgZnVuY3Rpb24gdGhhdCBtZXJnZXMgZXZlbnRzIGlmIG11bHRpcGxlIG9jY3VyIGR1cmluZyB0aGUgdGhyb3R0bGUgcGVyaW9kLlxuXHQgKiBAcGFyYW0gZGVsYXkgVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gdGhyb3R0bGUuXG5cdCAqIEBwYXJhbSBsZWFkaW5nIFdoZXRoZXIgdG8gZmlyZSBvbiB0aGUgbGVhZGluZyBlZGdlIChpbW1lZGlhdGVseSBvbiBmaXJzdCBldmVudCkuXG5cdCAqIEBwYXJhbSB0cmFpbGluZyBXaGV0aGVyIHRvIGZpcmUgb24gdGhlIHRyYWlsaW5nIGVkZ2UgKGFmdGVyIGRlbGF5IHdpdGggdGhlIGxhc3QgdmFsdWUpLlxuXHQgKiBAcGFyYW0gbGVha1dhcm5pbmdUaHJlc2hvbGQgU2VlIHtAbGluayBFbWl0dGVyT3B0aW9ucy5sZWFrV2FybmluZ1RocmVzaG9sZH0uXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byByZWdpc3RlciB0aGUgdGhyb3R0bGUgZW1pdHRlciB0by5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZTxUPihldmVudDogRXZlbnQ8VD4sIG1lcmdlOiAobGFzdDogVCB8IHVuZGVmaW5lZCwgZXZlbnQ6IFQpID0+IFQsIGRlbGF5PzogbnVtYmVyIHwgdHlwZW9mIE1pY3JvdGFza0RlbGF5LCBsZWFkaW5nPzogYm9vbGVhbiwgdHJhaWxpbmc/OiBib29sZWFuLCBsZWFrV2FybmluZ1RocmVzaG9sZD86IG51bWJlciwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gdGhyb3R0bGU8SSwgTz4oZXZlbnQ6IEV2ZW50PEk+LCBtZXJnZTogKGxhc3Q6IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBJKSA9PiBPLCBkZWxheT86IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSwgbGVhZGluZz86IGJvb2xlYW4sIHRyYWlsaW5nPzogYm9vbGVhbiwgbGVha1dhcm5pbmdUaHJlc2hvbGQ/OiBudW1iZXIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxPPjtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRocm90dGxlPEksIE8+KGV2ZW50OiBFdmVudDxJPiwgbWVyZ2U6IChsYXN0OiBPIHwgdW5kZWZpbmVkLCBldmVudDogSSkgPT4gTywgZGVsYXk6IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSA9IDEwMCwgbGVhZGluZyA9IHRydWUsIHRyYWlsaW5nID0gdHJ1ZSwgbGVha1dhcm5pbmdUaHJlc2hvbGQ/OiBudW1iZXIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxPPiB7XG5cdFx0bGV0IHN1YnNjcmlwdGlvbjogSURpc3Bvc2FibGU7XG5cdFx0bGV0IG91dHB1dDogTyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBudW1UaHJvdHRsZWRDYWxscyA9IDA7XG5cblx0XHRjb25zdCBvcHRpb25zOiBFbWl0dGVyT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHtcblx0XHRcdGxlYWtXYXJuaW5nVGhyZXNob2xkLFxuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0c3Vic2NyaXB0aW9uID0gZXZlbnQoY3VyID0+IHtcblx0XHRcdFx0XHRudW1UaHJvdHRsZWRDYWxscysrO1xuXHRcdFx0XHRcdG91dHB1dCA9IG1lcmdlKG91dHB1dCwgY3VyKTtcblxuXHRcdFx0XHRcdC8vIElmIG5vdCBjdXJyZW50bHkgdGhyb3R0bGluZywgZmlyZSBpbW1lZGlhdGVseSBpZiBsZWFkaW5nIGlzIGVuYWJsZWRcblx0XHRcdFx0XHRpZiAoaGFuZGxlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGlmIChsZWFkaW5nKSB7XG5cdFx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShvdXRwdXQpO1xuXHRcdFx0XHRcdFx0XHRvdXRwdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdG51bVRocm90dGxlZENhbGxzID0gMDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gU2V0IHVwIHRoZSB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZGVsYXkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEZpcmUgb24gdHJhaWxpbmcgZWRnZSBpZiB0aGVyZSB3ZXJlIGNhbGxzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0XHRcdFx0XHRpZiAodHJhaWxpbmcgJiYgbnVtVGhyb3R0bGVkQ2FsbHMgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlbWl0dGVyLmZpcmUob3V0cHV0ISk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdG91dHB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0bnVtVGhyb3R0bGVkQ2FsbHMgPSAwO1xuXHRcdFx0XHRcdFx0XHR9LCBkZWxheSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBVc2UgYSBzcGVjaWFsIG1hcmtlciB0byBpbmRpY2F0ZSBtaWNyb3Rhc2sgaXMgcGVuZGluZ1xuXHRcdFx0XHRcdFx0XHRoYW5kbGUgPSAwIGFzIHVua25vd24gYXMgVGltZW91dDtcblx0XHRcdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEZpcmUgb24gdHJhaWxpbmcgZWRnZSBpZiB0aGVyZSB3ZXJlIGNhbGxzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0XHRcdFx0XHRpZiAodHJhaWxpbmcgJiYgbnVtVGhyb3R0bGVkQ2FsbHMgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlbWl0dGVyLmZpcmUob3V0cHV0ISk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdG91dHB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0bnVtVGhyb3R0bGVkQ2FsbHMgPSAwO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gSWYgYWxyZWFkeSB0aHJvdHRsaW5nLCBqdXN0IGFjY3VtdWxhdGUgdGhlIHZhbHVlIGZvciB0cmFpbGluZyBlZGdlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyKCkge1xuXHRcdFx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoIWRpc3Bvc2FibGUpIHtcblx0XHRcdF9hZGRMZWFrYWdlVHJhY2VMb2dpYyhvcHRpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8Tz4ob3B0aW9ucyk7XG5cblx0XHRkaXNwb3NhYmxlPy5hZGQoZW1pdHRlcik7XG5cblx0XHRyZXR1cm4gZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaWx0ZXJzIGFuIGV2ZW50IHN1Y2ggdGhhdCBzb21lIGNvbmRpdGlvbiBpcyBfbm90XyBtZXQgbW9yZSB0aGFuIG9uY2UgaW4gYSByb3csIGVmZmVjdGl2ZWx5IGVuc3VyaW5nIGR1cGxpY2F0ZVxuXHQgKiBldmVudCBvYmplY3RzIGZyb20gZGlmZmVyZW50IHNvdXJjZXMgZG8gbm90IGZpcmUgdGhlIHNhbWUgZXZlbnQgb2JqZWN0LlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBlcXVhbHMgVGhlIGVxdWFsaXR5IGNvbmRpdGlvbi5cblx0ICogQHBhcmFtIGRpc3Bvc2FibGUgQSBkaXNwb3NhYmxlIHN0b3JlIHRvIGFkZCB0aGUgbmV3IEV2ZW50RW1pdHRlciB0by5cblx0ICpcblx0ICogQGV4YW1wbGVcblx0ICogYGBgXG5cdCAqIC8vIEZpcmUgb25seSBvbmUgdGltZSB3aGVuIGEgc2luZ2xlIHdpbmRvdyBpcyBvcGVuZWQgb3IgZm9jdXNlZFxuXHQgKiBFdmVudC5sYXRjaChFdmVudC5hbnkob25EaWRPcGVuV2luZG93LCBvbkRpZEZvY3VzV2luZG93KSlcblx0ICogYGBgXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gbGF0Y2g8VD4oZXZlbnQ6IEV2ZW50PFQ+LCBlcXVhbHM6IChhOiBULCBiOiBUKSA9PiBib29sZWFuID0gKGEsIGIpID0+IGEgPT09IGIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxUPiB7XG5cdFx0bGV0IGZpcnN0Q2FsbCA9IHRydWU7XG5cdFx0bGV0IGNhY2hlOiBUO1xuXG5cdFx0cmV0dXJuIGZpbHRlcihldmVudCwgdmFsdWUgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvdWxkRW1pdCA9IGZpcnN0Q2FsbCB8fCAhZXF1YWxzKHZhbHVlLCBjYWNoZSk7XG5cdFx0XHRmaXJzdENhbGwgPSBmYWxzZTtcblx0XHRcdGNhY2hlID0gdmFsdWU7XG5cdFx0XHRyZXR1cm4gc2hvdWxkRW1pdDtcblx0XHR9LCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTcGxpdHMgYW4gZXZlbnQgd2hvc2UgcGFyYW1ldGVyIGlzIGEgdW5pb24gdHlwZSBpbnRvIDIgc2VwYXJhdGUgZXZlbnRzIGZvciBlYWNoIHR5cGUgaW4gdGhlIHVuaW9uLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQGV4YW1wbGVcblx0ICogYGBgXG5cdCAqIGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50RW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCkuZXZlbnQ7XG5cdCAqIGNvbnN0IFtudW1iZXJFdmVudCwgdW5kZWZpbmVkRXZlbnRdID0gRXZlbnQuc3BsaXQoZXZlbnQsIGlzVW5kZWZpbmVkKTtcblx0ICogYGBgXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gaXNUIEEgZnVuY3Rpb24gdGhhdCBkZXRlcm1pbmVzIHdoYXQgZXZlbnQgaXMgb2YgdGhlIGZpcnN0IHR5cGUuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gc3BsaXQ8VCwgVT4oZXZlbnQ6IEV2ZW50PFQgfCBVPiwgaXNUOiAoZTogVCB8IFUpID0+IGUgaXMgVCwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IFtFdmVudDxUPiwgRXZlbnQ8VT5dIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0RXZlbnQuZmlsdGVyKGV2ZW50LCBpc1QsIGRpc3Bvc2FibGUpLFxuXHRcdFx0RXZlbnQuZmlsdGVyKGV2ZW50LCBlID0+ICFpc1QoZSksIGRpc3Bvc2FibGUpIGFzIEV2ZW50PFU+LFxuXHRcdF07XG5cdH1cblxuXHQvKipcblx0ICogQnVmZmVycyBhbiBldmVudCB1bnRpbCBpdCBoYXMgYSBsaXN0ZW5lciBhdHRhY2hlZC5cblx0ICpcblx0ICogKk5PVEUqIHRoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGBFdmVudGAgYW5kIGl0IE1VU1QgYmUgY2FsbGVkIHdpdGggYSBgRGlzcG9zYWJsZVN0b3JlYCB3aGVuZXZlciB0aGUgcmV0dXJuZWRcblx0ICogZXZlbnQgaXMgYWNjZXNzaWJsZSB0byBcInRoaXJkIHBhcnRpZXNcIiwgZS5nIHRoZSBldmVudCBpcyBhIHB1YmxpYyBwcm9wZXJ0eS4gT3RoZXJ3aXNlIGEgbGVha2VkIGxpc3RlbmVyIG9uIHRoZVxuXHQgKiByZXR1cm5lZCBldmVudCBjYXVzZXMgdGhpcyB1dGlsaXR5IHRvIGxlYWsgYSBsaXN0ZW5lciBvbiB0aGUgb3JpZ2luYWwgZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gZGVidWdOYW1lIEEgbmFtZSBmb3IgdGhpcyBidWZmZXIsIHVzZWQgaW4gbGVhayBkZXRlY3Rpb24gd2FybmluZ3MuXG5cdCAqIEBwYXJhbSBmbHVzaEFmdGVyVGltZW91dCBEZXRlcm1pbmVzIHdoZXRoZXIgdG8gZmx1c2ggdGhlIGJ1ZmZlciBhZnRlciBhIHRpbWVvdXQgaW1tZWRpYXRlbHkgb3IgYWZ0ZXIgYVxuXHQgKiBgc2V0VGltZW91dGAgd2hlbiB0aGUgZmlyc3QgZXZlbnQgbGlzdGVuZXIgaXMgYWRkZWQuXG5cdCAqIEBwYXJhbSBfYnVmZmVyIEludGVybmFsOiBBIHNvdXJjZSBldmVudCBhcnJheSB1c2VkIGZvciB0ZXN0cy5cblx0ICpcblx0ICogQGV4YW1wbGVcblx0ICogYGBgXG5cdCAqIC8vIFN0YXJ0IGFjY3VtdWxhdGluZyBldmVudHMsIHdoZW4gdGhlIGZpcnN0IGxpc3RlbmVyIGlzIGF0dGFjaGVkLCBmbHVzaFxuXHQgKiAvLyB0aGUgZXZlbnQgYWZ0ZXIgYSB0aW1lb3V0IHN1Y2ggdGhhdCBtdWx0aXBsZSBsaXN0ZW5lcnMgYXR0YWNoZWQgYmVmb3JlXG5cdCAqIC8vIHRoZSB0aW1lb3V0IHdvdWxkIHJlY2VpdmUgdGhlIGV2ZW50XG5cdCAqIHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuYnVmZmVyKHNlcnZpY2Uub25JbnN0YWxsRXh0ZW5zaW9uLCAnb25JbnN0YWxsRXh0ZW5zaW9uJywgdHJ1ZSk7XG5cdCAqIGBgYFxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGJ1ZmZlcjxUPihldmVudDogRXZlbnQ8VD4sIGRlYnVnTmFtZTogc3RyaW5nLCBmbHVzaEFmdGVyVGltZW91dCA9IGZhbHNlLCBfYnVmZmVyOiBUW10gPSBbXSwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+IHtcblx0XHRsZXQgYnVmZmVyOiBUW10gfCBudWxsID0gX2J1ZmZlci5zbGljZSgpO1xuXG5cdFx0Ly8gRGV2LW9ubHkgbGVhayBkZXRlY3Rpb246IHRyYWNrIHdoZW4gYnVmZmVyIHdhcyBjcmVhdGVkIGFuZCB3YXJuXG5cdFx0Ly8gaWYgZXZlbnRzIGFjY3VtdWxhdGUgd2l0aG91dCBldmVyIGJlaW5nIGNvbnN1bWVkLlxuXHRcdGxldCBidWZmZXJMZWFrV2FybmluZ0RhdGE6IHsgc3RhY2s6IFN0YWNrdHJhY2U7IHRpbWVySWQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+OyB3YXJuZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoX2lzQnVmZmVyTGVha1dhcm5pbmdFbmFibGVkKCkpIHtcblx0XHRcdGJ1ZmZlckxlYWtXYXJuaW5nRGF0YSA9IHtcblx0XHRcdFx0c3RhY2s6IFN0YWNrdHJhY2UuY3JlYXRlKCksXG5cdFx0XHRcdHRpbWVySWQ6IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChidWZmZXIgJiYgYnVmZmVyLmxlbmd0aCA+IDAgJiYgYnVmZmVyTGVha1dhcm5pbmdEYXRhICYmICFidWZmZXJMZWFrV2FybmluZ0RhdGEud2FybmVkKSB7XG5cdFx0XHRcdFx0XHRidWZmZXJMZWFrV2FybmluZ0RhdGEud2FybmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgW0V2ZW50LmJ1ZmZlcl1bJHtkZWJ1Z05hbWV9XSBwb3RlbnRpYWwgTEVBSyBkZXRlY3RlZDogJHtidWZmZXIubGVuZ3RofSBldmVudHMgYnVmZmVyZWQgZm9yICR7X2J1ZmZlckxlYWtXYXJuVGltZVRocmVzaG9sZCAvIDEwMDB9cyB3aXRob3V0IGJlaW5nIGNvbnN1bWVkLiBCdWZmZXJlZCBoZXJlOmApO1xuXHRcdFx0XHRcdFx0YnVmZmVyTGVha1dhcm5pbmdEYXRhLnN0YWNrLnByaW50KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBfYnVmZmVyTGVha1dhcm5UaW1lVGhyZXNob2xkKSxcblx0XHRcdFx0d2FybmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQoYnVmZmVyTGVha1dhcm5pbmdEYXRhIS50aW1lcklkKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNsZWFyTGVha1dhcm5pbmdUaW1lciA9ICgpID0+IHtcblx0XHRcdGlmIChidWZmZXJMZWFrV2FybmluZ0RhdGEpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KGJ1ZmZlckxlYWtXYXJuaW5nRGF0YS50aW1lcklkKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGwgPSBldmVudChlID0+IHtcblx0XHRcdGlmIChidWZmZXIpIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goZSk7XG5cdFx0XHRcdGlmIChfaXNCdWZmZXJMZWFrV2FybmluZ0VuYWJsZWQoKSAmJiBidWZmZXJMZWFrV2FybmluZ0RhdGEgJiYgIWJ1ZmZlckxlYWtXYXJuaW5nRGF0YS53YXJuZWQgJiYgYnVmZmVyLmxlbmd0aCA+PSBfYnVmZmVyTGVha1dhcm5Db3VudFRocmVzaG9sZCkge1xuXHRcdFx0XHRcdGJ1ZmZlckxlYWtXYXJuaW5nRGF0YS53YXJuZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgW0V2ZW50LmJ1ZmZlcl1bJHtkZWJ1Z05hbWV9XSBwb3RlbnRpYWwgTEVBSyBkZXRlY3RlZDogJHtidWZmZXIubGVuZ3RofSBldmVudHMgYnVmZmVyZWQgd2l0aG91dCBiZWluZyBjb25zdW1lZC4gQnVmZmVyZWQgaGVyZTpgKTtcblx0XHRcdFx0XHRidWZmZXJMZWFrV2FybmluZ0RhdGEuc3RhY2sucHJpbnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW1pdHRlci5maXJlKGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdGRpc3Bvc2FibGUuYWRkKGxpc3RlbmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBmbHVzaCA9ICgpID0+IHtcblx0XHRcdGJ1ZmZlcj8uZm9yRWFjaChlID0+IGVtaXR0ZXIuZmlyZShlKSk7XG5cdFx0XHRidWZmZXIgPSBudWxsO1xuXHRcdFx0Y2xlYXJMZWFrV2FybmluZ1RpbWVyKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPih7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyKCkge1xuXHRcdFx0XHRpZiAoIWxpc3RlbmVyKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIgPSBldmVudChlID0+IGVtaXR0ZXIuZmlyZShlKSk7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuYWRkKGxpc3RlbmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0aWYgKGJ1ZmZlcikge1xuXHRcdFx0XHRcdGlmIChmbHVzaEFmdGVyVGltZW91dCkge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dChmbHVzaCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZsdXNoKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0aWYgKGxpc3RlbmVyKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxpc3RlbmVyID0gbnVsbDtcblx0XHRcdFx0Y2xlYXJMZWFrV2FybmluZ1RpbWVyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoZW1pdHRlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblx0LyoqXG5cdCAqIFdyYXBzIHRoZSBldmVudCBpbiBhbiB7QGxpbmsgSUNoYWluYWJsZUV2ZW50fSwgYWxsb3dpbmcgYSBtb3JlIGZ1bmN0aW9uYWwgcHJvZ3JhbW1pbmcgc3R5bGUuXG5cdCAqXG5cdCAqIEBleGFtcGxlXG5cdCAqIGBgYFxuXHQgKiAvLyBOb3JtYWxcblx0ICogY29uc3Qgb25FbnRlclByZXNzTm9ybWFsID0gRXZlbnQuZmlsdGVyKFxuXHQgKiAgIEV2ZW50Lm1hcChvbktleVByZXNzLmV2ZW50LCBlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpLFxuXHQgKiAgIGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlclxuXHQgKiApLmV2ZW50O1xuXHQgKlxuXHQgKiAvLyBVc2luZyBjaGFpblxuXHQgKiBjb25zdCBvbkVudGVyUHJlc3NDaGFpbiA9IEV2ZW50LmNoYWluKG9uS2V5UHJlc3MuZXZlbnQsICQgPT4gJFxuXHQgKiAgIC5tYXAoZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKVxuXHQgKiAgIC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpXG5cdCAqICk7XG5cdCAqIGBgYFxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGNoYWluPFQsIFI+KGV2ZW50OiBFdmVudDxUPiwgc3l0aGVuc2l6ZTogKCQ6IElDaGFpbmFibGVTeXRoZW5zaXM8VD4pID0+IElDaGFpbmFibGVTeXRoZW5zaXM8Uj4pOiBFdmVudDxSPiB7XG5cdFx0Y29uc3QgZm46IEV2ZW50PFI+ID0gKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdGNvbnN0IGNzID0gc3l0aGVuc2l6ZShuZXcgQ2hhaW5hYmxlU3ludGhlc2lzKCkpIGFzIENoYWluYWJsZVN5bnRoZXNpcztcblx0XHRcdHJldHVybiBldmVudChmdW5jdGlvbiAodmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gY3MuZXZhbHVhdGUodmFsdWUpO1xuXHRcdFx0XHRpZiAocmVzdWx0ICE9PSBIYWx0Q2hhaW5hYmxlKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuY2FsbCh0aGlzQXJncywgcmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0fTtcblxuXHRcdHJldHVybiBmbjtcblx0fVxuXG5cdGNvbnN0IEhhbHRDaGFpbmFibGUgPSBTeW1ib2woJ0hhbHRDaGFpbmFibGUnKTtcblxuXHRjbGFzcyBDaGFpbmFibGVTeW50aGVzaXMgaW1wbGVtZW50cyBJQ2hhaW5hYmxlU3l0aGVuc2lzPGFueT4ge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RlcHM6ICgoaW5wdXQ6IGFueSkgPT4gdW5rbm93bilbXSA9IFtdO1xuXG5cdFx0bWFwPE8+KGZuOiAoaTogYW55KSA9PiBPKTogdGhpcyB7XG5cdFx0XHR0aGlzLnN0ZXBzLnB1c2goZm4pO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0Zm9yRWFjaChmbjogKGk6IGFueSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdFx0dGhpcy5zdGVwcy5wdXNoKHYgPT4ge1xuXHRcdFx0XHRmbih2KTtcblx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGZpbHRlcihmbjogKGU6IGFueSkgPT4gYm9vbGVhbik6IHRoaXMge1xuXHRcdFx0dGhpcy5zdGVwcy5wdXNoKHYgPT4gZm4odikgPyB2IDogSGFsdENoYWluYWJsZSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRyZWR1Y2U8Uj4obWVyZ2U6IChsYXN0OiBSIHwgdW5kZWZpbmVkLCBldmVudDogYW55KSA9PiBSLCBpbml0aWFsPzogUiB8IHVuZGVmaW5lZCk6IHRoaXMge1xuXHRcdFx0bGV0IGxhc3QgPSBpbml0aWFsO1xuXHRcdFx0dGhpcy5zdGVwcy5wdXNoKHYgPT4ge1xuXHRcdFx0XHRsYXN0ID0gbWVyZ2UobGFzdCwgdik7XG5cdFx0XHRcdHJldHVybiBsYXN0O1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRsYXRjaChlcXVhbHM6IChhOiBhbnksIGI6IGFueSkgPT4gYm9vbGVhbiA9IChhLCBiKSA9PiBhID09PSBiKTogQ2hhaW5hYmxlU3ludGhlc2lzIHtcblx0XHRcdGxldCBmaXJzdENhbGwgPSB0cnVlO1xuXHRcdFx0bGV0IGNhY2hlOiBhbnk7XG5cdFx0XHR0aGlzLnN0ZXBzLnB1c2godmFsdWUgPT4ge1xuXHRcdFx0XHRjb25zdCBzaG91bGRFbWl0ID0gZmlyc3RDYWxsIHx8ICFlcXVhbHModmFsdWUsIGNhY2hlKTtcblx0XHRcdFx0Zmlyc3RDYWxsID0gZmFsc2U7XG5cdFx0XHRcdGNhY2hlID0gdmFsdWU7XG5cdFx0XHRcdHJldHVybiBzaG91bGRFbWl0ID8gdmFsdWUgOiBIYWx0Q2hhaW5hYmxlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBldmFsdWF0ZSh2YWx1ZTogYW55KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHN0ZXAgb2YgdGhpcy5zdGVwcykge1xuXHRcdFx0XHR2YWx1ZSA9IHN0ZXAodmFsdWUpO1xuXHRcdFx0XHRpZiAodmFsdWUgPT09IEhhbHRDaGFpbmFibGUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJQ2hhaW5hYmxlU3l0aGVuc2lzPFQ+IHtcblx0XHRtYXA8Tz4oZm46IChpOiBUKSA9PiBPKTogSUNoYWluYWJsZVN5dGhlbnNpczxPPjtcblx0XHRmb3JFYWNoKGZuOiAoaTogVCkgPT4gdm9pZCk6IElDaGFpbmFibGVTeXRoZW5zaXM8VD47XG5cdFx0ZmlsdGVyPFIgZXh0ZW5kcyBUPihmbjogKGU6IFQpID0+IGUgaXMgUik6IElDaGFpbmFibGVTeXRoZW5zaXM8Uj47XG5cdFx0ZmlsdGVyKGZuOiAoZTogVCkgPT4gYm9vbGVhbik6IElDaGFpbmFibGVTeXRoZW5zaXM8VD47XG5cdFx0cmVkdWNlPFI+KG1lcmdlOiAobGFzdDogUiwgZXZlbnQ6IFQpID0+IFIsIGluaXRpYWw6IFIpOiBJQ2hhaW5hYmxlU3l0aGVuc2lzPFI+O1xuXHRcdHJlZHVjZTxSPihtZXJnZTogKGxhc3Q6IFIgfCB1bmRlZmluZWQsIGV2ZW50OiBUKSA9PiBSKTogSUNoYWluYWJsZVN5dGhlbnNpczxSPjtcblx0XHRsYXRjaChlcXVhbHM/OiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbik6IElDaGFpbmFibGVTeXRoZW5zaXM8VD47XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIE5vZGVFdmVudEVtaXR0ZXIge1xuXHRcdG9uKGV2ZW50OiBzdHJpbmcgfCBzeW1ib2wsIGxpc3RlbmVyOiBGdW5jdGlvbik6IHVua25vd247XG5cdFx0cmVtb3ZlTGlzdGVuZXIoZXZlbnQ6IHN0cmluZyB8IHN5bWJvbCwgbGlzdGVuZXI6IEZ1bmN0aW9uKTogdW5rbm93bjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIHtAbGluayBFdmVudH0gZnJvbSBhIG5vZGUgZXZlbnQgZW1pdHRlci5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tTm9kZUV2ZW50RW1pdHRlcjxUPihlbWl0dGVyOiBOb2RlRXZlbnRFbWl0dGVyLCBldmVudE5hbWU6IHN0cmluZywgbWFwOiAoLi4uYXJnczogYW55W10pID0+IFQgPSBpZCA9PiBpZCk6IEV2ZW50PFQ+IHtcblx0XHRjb25zdCBmbiA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IHJlc3VsdC5maXJlKG1hcCguLi5hcmdzKSk7XG5cdFx0Y29uc3Qgb25GaXJzdExpc3RlbmVyQWRkID0gKCkgPT4gZW1pdHRlci5vbihldmVudE5hbWUsIGZuKTtcblx0XHRjb25zdCBvbkxhc3RMaXN0ZW5lclJlbW92ZSA9ICgpID0+IGVtaXR0ZXIucmVtb3ZlTGlzdGVuZXIoZXZlbnROYW1lLCBmbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEVtaXR0ZXI8VD4oeyBvbldpbGxBZGRGaXJzdExpc3RlbmVyOiBvbkZpcnN0TGlzdGVuZXJBZGQsIG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiBvbkxhc3RMaXN0ZW5lclJlbW92ZSB9KTtcblxuXHRcdHJldHVybiByZXN1bHQuZXZlbnQ7XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIERPTUV2ZW50RW1pdHRlciB7XG5cdFx0YWRkRXZlbnRMaXN0ZW5lcihldmVudDogc3RyaW5nIHwgc3ltYm9sLCBsaXN0ZW5lcjogRnVuY3Rpb24pOiB2b2lkO1xuXHRcdHJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQ6IHN0cmluZyB8IHN5bWJvbCwgbGlzdGVuZXI6IEZ1bmN0aW9uKTogdm9pZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIHtAbGluayBFdmVudH0gZnJvbSBhIERPTSBldmVudCBlbWl0dGVyLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21ET01FdmVudEVtaXR0ZXI8VD4oZW1pdHRlcjogRE9NRXZlbnRFbWl0dGVyLCBldmVudE5hbWU6IHN0cmluZywgbWFwOiAoLi4uYXJnczogYW55W10pID0+IFQgPSBpZCA9PiBpZCk6IEV2ZW50PFQ+IHtcblx0XHRjb25zdCBmbiA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IHJlc3VsdC5maXJlKG1hcCguLi5hcmdzKSk7XG5cdFx0Y29uc3Qgb25GaXJzdExpc3RlbmVyQWRkID0gKCkgPT4gZW1pdHRlci5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZm4pO1xuXHRcdGNvbnN0IG9uTGFzdExpc3RlbmVyUmVtb3ZlID0gKCkgPT4gZW1pdHRlci5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZm4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBFbWl0dGVyPFQ+KHsgb25XaWxsQWRkRmlyc3RMaXN0ZW5lcjogb25GaXJzdExpc3RlbmVyQWRkLCBvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogb25MYXN0TGlzdGVuZXJSZW1vdmUgfSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0LmV2ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBwcm9taXNlIG91dCBvZiBhbiBldmVudCwgdXNpbmcgdGhlIHtAbGluayBFdmVudC5vbmNlfSBoZWxwZXIuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gdG9Qcm9taXNlPFQ+KGV2ZW50OiBFdmVudDxUPiwgZGlzcG9zYWJsZXM/OiBJRGlzcG9zYWJsZVtdIHwgRGlzcG9zYWJsZVN0b3JlKTogQ2FuY2VsYWJsZVByb21pc2U8VD4ge1xuXHRcdGxldCBjYW5jZWxSZWY6ICgpID0+IHZvaWQ7XG5cdFx0bGV0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0XHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcblx0XHRcdGxpc3RlbmVyID0gb25jZShldmVudCkocmVzb2x2ZSk7XG5cdFx0XHRhZGRUb0Rpc3Bvc2FibGVzKGxpc3RlbmVyLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRcdC8vIG5vdCByZXNvbHZlZCwgbWF0Y2hpbmcgdGhlIGJlaGF2aW9yIG9mIGEgbm9ybWFsIGRpc3Bvc2FsXG5cdFx0XHRjYW5jZWxSZWYgPSAoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2VBbmRSZW1vdmUobGlzdGVuZXIsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH07XG5cdFx0fSkgYXMgQ2FuY2VsYWJsZVByb21pc2U8VD47XG5cdFx0cHJvbWlzZS5jYW5jZWwgPSBjYW5jZWxSZWYhO1xuXG5cdFx0aWYgKGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRwcm9taXNlLmZpbmFsbHkoKCkgPT4gZGlzcG9zZUFuZFJlbW92ZShsaXN0ZW5lciwgZGlzcG9zYWJsZXMpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIGZ1bmN0aW9uIGZvciBmb3J3YXJkaW5nIGFuIGV2ZW50IHRvIGFub3RoZXIgZW1pdHRlciB3aGljaFxuXHQgKiBpbXByb3ZlcyByZWFkYWJpbGl0eS5cblx0ICpcblx0ICogVGhpcyBpcyBzaW1pbGFyIHRvIHtAbGluayBSZWxheX0gYnV0IGFsbG93cyBpbnN0YW50aWF0aW5nIGFuZCBmb3J3YXJkaW5nXG5cdCAqIG9uIGEgc2luZ2xlIGxpbmUgYW5kIGFsc28gYWxsb3dzIGZvciBtdWx0aXBsZSBzb3VyY2UgZXZlbnRzLlxuXHQgKiBAcGFyYW0gZnJvbSBUaGUgZXZlbnQgdG8gZm9yd2FyZC5cblx0ICogQHBhcmFtIHRvIFRoZSBlbWl0dGVyIHRvIGZvcndhcmQgdGhlIGV2ZW50IHRvLlxuXHQgKiBAZXhhbXBsZVxuXHQgKiBFdmVudC5mb3J3YXJkKGV2ZW50LCBlbWl0dGVyKTtcblx0ICogLy8gZXF1aXZhbGVudCB0b1xuXHQgKiBldmVudChlID0+IGVtaXR0ZXIuZmlyZShlKSk7XG5cdCAqIC8vIGVxdWl2YWxlbnQgdG9cblx0ICogZXZlbnQoZW1pdHRlci5maXJlLCBlbWl0dGVyKTtcblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBmb3J3YXJkPFQ+KGZyb206IEV2ZW50PFQ+LCB0bzogRW1pdHRlcjxUPik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gZnJvbShlID0+IHRvLmZpcmUoZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgYSBsaXN0ZW5lciB0byBhbiBldmVudCBhbmQgY2FsbHMgdGhlIGxpc3RlbmVyIGltbWVkaWF0ZWx5IHdpdGggdW5kZWZpbmVkIGFzIHRoZSBldmVudCBvYmplY3QuXG5cdCAqXG5cdCAqIEBleGFtcGxlXG5cdCAqIGBgYFxuXHQgKiAvLyBJbml0aWFsaXplIHRoZSBVSSBhbmQgdXBkYXRlIGl0IHdoZW4gZGF0YUNoYW5nZUV2ZW50IGZpcmVzXG5cdCAqIHJ1bkFuZFN1YnNjcmliZShkYXRhQ2hhbmdlRXZlbnQsICgpID0+IHRoaXMuX3VwZGF0ZVVJKCkpO1xuXHQgKiBgYGBcblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBydW5BbmRTdWJzY3JpYmU8VD4oZXZlbnQ6IEV2ZW50PFQ+LCBoYW5kbGVyOiAoZTogVCkgPT4gdW5rbm93biwgaW5pdGlhbDogVCk6IElEaXNwb3NhYmxlO1xuXHRleHBvcnQgZnVuY3Rpb24gcnVuQW5kU3Vic2NyaWJlPFQ+KGV2ZW50OiBFdmVudDxUPiwgaGFuZGxlcjogKGU6IFQgfCB1bmRlZmluZWQpID0+IHVua25vd24pOiBJRGlzcG9zYWJsZTtcblx0ZXhwb3J0IGZ1bmN0aW9uIHJ1bkFuZFN1YnNjcmliZTxUPihldmVudDogRXZlbnQ8VD4sIGhhbmRsZXI6IChlOiBUIHwgdW5kZWZpbmVkKSA9PiB1bmtub3duLCBpbml0aWFsPzogVCk6IElEaXNwb3NhYmxlIHtcblx0XHRoYW5kbGVyKGluaXRpYWwpO1xuXHRcdHJldHVybiBldmVudChlID0+IGhhbmRsZXIoZSkpO1xuXHR9XG5cblx0Y2xhc3MgRW1pdHRlck9ic2VydmVyPFQ+IGltcGxlbWVudHMgSU9ic2VydmVyIHtcblxuXHRcdHJlYWRvbmx5IGVtaXR0ZXI6IEVtaXR0ZXI8VD47XG5cblx0XHRwcml2YXRlIF9jb3VudGVyID0gMDtcblx0XHRwcml2YXRlIF9oYXNDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRjb25zdHJ1Y3RvcihyZWFkb25seSBfb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnM6IEVtaXR0ZXJPcHRpb25zID0ge1xuXHRcdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdFx0X29ic2VydmFibGUuYWRkT2JzZXJ2ZXIodGhpcyk7XG5cblx0XHRcdFx0XHQvLyBDb21tdW5pY2F0ZSB0byB0aGUgb2JzZXJ2YWJsZSB0aGF0IHdlIHJlY2VpdmVkIGl0cyBjdXJyZW50IHZhbHVlIGFuZCB3b3VsZCBsaWtlIHRvIGJlIG5vdGlmaWVkIGFib3V0IGZ1dHVyZSBjaGFuZ2VzLlxuXHRcdFx0XHRcdHRoaXMuX29ic2VydmFibGUucmVwb3J0Q2hhbmdlcygpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRcdF9vYnNlcnZhYmxlLnJlbW92ZU9ic2VydmVyKHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0aWYgKCFzdG9yZSkge1xuXHRcdFx0XHRfYWRkTGVha2FnZVRyYWNlTG9naWMob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPihvcHRpb25zKTtcblx0XHRcdGlmIChzdG9yZSkge1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5lbWl0dGVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRiZWdpblVwZGF0ZTxUPihfb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHRcdC8vIGFzc2VydChfb2JzZXJ2YWJsZSA9PT0gdGhpcy5vYnMpO1xuXHRcdFx0dGhpcy5fY291bnRlcisrO1xuXHRcdH1cblxuXHRcdGhhbmRsZVBvc3NpYmxlQ2hhbmdlPFQ+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdFx0Ly8gYXNzZXJ0KF9vYnNlcnZhYmxlID09PSB0aGlzLm9icyk7XG5cdFx0fVxuXG5cdFx0aGFuZGxlQ2hhbmdlPFQsIFRDaGFuZ2U+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8VCwgVENoYW5nZT4sIF9jaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHRcdC8vIGFzc2VydChfb2JzZXJ2YWJsZSA9PT0gdGhpcy5vYnMpO1xuXHRcdFx0dGhpcy5faGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0ZW5kVXBkYXRlPFQ+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdFx0Ly8gYXNzZXJ0KF9vYnNlcnZhYmxlID09PSB0aGlzLm9icyk7XG5cdFx0XHR0aGlzLl9jb3VudGVyLS07XG5cdFx0XHRpZiAodGhpcy5fY291bnRlciA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9vYnNlcnZhYmxlLnJlcG9ydENoYW5nZXMoKTtcblx0XHRcdFx0aWYgKHRoaXMuX2hhc0NoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9oYXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5lbWl0dGVyLmZpcmUodGhpcy5fb2JzZXJ2YWJsZS5nZXQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBldmVudCBlbWl0dGVyIHRoYXQgaXMgZmlyZWQgd2hlbiB0aGUgb2JzZXJ2YWJsZSBjaGFuZ2VzLlxuXHQgKiBFYWNoIGxpc3RlbmVycyBzdWJzY3JpYmVzIHRvIHRoZSBlbWl0dGVyLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21PYnNlcnZhYmxlPFQ+KG9iczogSU9ic2VydmFibGU8VD4sIHN0b3JlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8VD4ge1xuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IEVtaXR0ZXJPYnNlcnZlcihvYnMsIHN0b3JlKTtcblx0XHRyZXR1cm4gb2JzZXJ2ZXIuZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFYWNoIGxpc3RlbmVyIGlzIGF0dGFjaGVkIHRvIHRoZSBvYnNlcnZhYmxlIGRpcmVjdGx5LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21PYnNlcnZhYmxlTGlnaHQob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8dW5rbm93bj4pOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIChsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXI6IElPYnNlcnZlciA9IHtcblx0XHRcdFx0YmVnaW5VcGRhdGUoKSB7XG5cdFx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kVXBkYXRlKCkge1xuXHRcdFx0XHRcdGNvdW50LS07XG5cdFx0XHRcdFx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0XHRvYnNlcnZhYmxlLnJlcG9ydENoYW5nZXMoKTtcblx0XHRcdFx0XHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0ZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0aGFuZGxlUG9zc2libGVDaGFuZ2UoKSB7XG5cdFx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRoYW5kbGVDaGFuZ2UoKSB7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdG9ic2VydmFibGUuYWRkT2JzZXJ2ZXIob2JzZXJ2ZXIpO1xuXHRcdFx0b2JzZXJ2YWJsZS5yZXBvcnRDaGFuZ2VzKCk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0ge1xuXHRcdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRcdG9ic2VydmFibGUucmVtb3ZlT2JzZXJ2ZXIob2JzZXJ2ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRhZGRUb0Rpc3Bvc2FibGVzKGRpc3Bvc2FibGUsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVtaXR0ZXJPcHRpb25zIHtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmJlZm9yZSogdGhlIHZlcnkgZmlyc3QgbGlzdGVuZXIgaXMgYWRkZWRcblx0ICovXG5cdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI/OiBGdW5jdGlvbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmFmdGVyKiB0aGUgdmVyeSBmaXJzdCBsaXN0ZW5lciBpcyBhZGRlZFxuXHQgKi9cblx0b25EaWRBZGRGaXJzdExpc3RlbmVyPzogRnVuY3Rpb247XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBmdW5jdGlvbiB0aGF0J3MgY2FsbGVkIGFmdGVyIGEgbGlzdGVuZXIgaXMgYWRkZWRcblx0ICovXG5cdG9uRGlkQWRkTGlzdGVuZXI/OiBGdW5jdGlvbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmFmdGVyKiByZW1vdmUgdGhlIHZlcnkgbGFzdCBsaXN0ZW5lclxuXHQgKi9cblx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI/OiBGdW5jdGlvbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmJlZm9yZSogYSBsaXN0ZW5lciBpcyByZW1vdmVkXG5cdCAqL1xuXHRvbldpbGxSZW1vdmVMaXN0ZW5lcj86IEZ1bmN0aW9uO1xuXHQvKipcblx0ICogT3B0aW9uYWwgZnVuY3Rpb24gdGhhdCdzIGNhbGxlZCB3aGVuIGEgbGlzdGVuZXIgdGhyb3dzIGFuIGVycm9yLiBEZWZhdWx0cyB0b1xuXHQgKiB7QGxpbmsgb25VbmV4cGVjdGVkRXJyb3J9XG5cdCAqL1xuXHRvbkxpc3RlbmVyRXJyb3I/OiAoZTogYW55KSA9PiB2b2lkO1xuXHQvKipcblx0ICogTnVtYmVyIG9mIGxpc3RlbmVycyB0aGF0IGFyZSBhbGxvd2VkIGJlZm9yZSBhc3N1bWluZyBhIGxlYWsuIERlZmF1bHQgdG9cblx0ICogYSBnbG9iYWxseSBjb25maWd1cmVkIHZhbHVlXG5cdCAqXG5cdCAqIEBzZWUgc2V0R2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGRcblx0ICovXG5cdGxlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyO1xuXHQvKipcblx0ICogSHVtYW4tcmVhZGFibGUgbmFtZSBmb3IgdGhlIGVtaXR0ZXIsIGluY2x1ZGVkIGluIGxlYWsgd2FybmluZyBlcnJvclxuXHQgKiBtZXNzYWdlcyB0byBoZWxwIGlkZW50aWZ5IHdoaWNoIGVtaXR0ZXIgaXMgbGVha2luZyBpbiB0ZWxlbWV0cnkuXG5cdCAqL1xuXHRsZWFrV2FybmluZ05hbWU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBQYXNzIGluIGEgZGVsaXZlcnkgcXVldWUsIHdoaWNoIGlzIHVzZWZ1bCBmb3IgZW5zdXJpbmdcblx0ICogaW4gb3JkZXIgZXZlbnQgZGVsaXZlcnkgYWNyb3NzIG11bHRpcGxlIGVtaXR0ZXJzLlxuXHQgKi9cblx0ZGVsaXZlcnlRdWV1ZT86IEV2ZW50RGVsaXZlcnlRdWV1ZTtcblxuXHQvKiogT05MWSBlbmFibGUgdGhpcyBkdXJpbmcgZGV2ZWxvcG1lbnQgKi9cblx0X3Byb2ZOYW1lPzogc3RyaW5nO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBFdmVudFByb2ZpbGluZyB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGFsbCA9IG5ldyBTZXQ8RXZlbnRQcm9maWxpbmc+KCk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbCA9IDA7XG5cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRwdWJsaWMgbGlzdGVuZXJDb3VudDogbnVtYmVyID0gMDtcblx0cHVibGljIGludm9jYXRpb25Db3VudCA9IDA7XG5cdHB1YmxpYyBlbGFwc2VkT3ZlcmFsbCA9IDA7XG5cdHB1YmxpYyBkdXJhdGlvbnM6IG51bWJlcltdID0gW107XG5cblx0cHJpdmF0ZSBfc3RvcFdhdGNoPzogU3RvcFdhdGNoO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMubmFtZSA9IGAke25hbWV9XyR7RXZlbnRQcm9maWxpbmcuX2lkUG9vbCsrfWA7XG5cdFx0RXZlbnRQcm9maWxpbmcuYWxsLmFkZCh0aGlzKTtcblx0fVxuXG5cdHN0YXJ0KGxpc3RlbmVyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHR0aGlzLmxpc3RlbmVyQ291bnQgPSBsaXN0ZW5lckNvdW50O1xuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcFdhdGNoKSB7XG5cdFx0XHRjb25zdCBlbGFwc2VkID0gdGhpcy5fc3RvcFdhdGNoLmVsYXBzZWQoKTtcblx0XHRcdHRoaXMuZHVyYXRpb25zLnB1c2goZWxhcHNlZCk7XG5cdFx0XHR0aGlzLmVsYXBzZWRPdmVyYWxsICs9IGVsYXBzZWQ7XG5cdFx0XHR0aGlzLmludm9jYXRpb25Db3VudCArPSAxO1xuXHRcdFx0dGhpcy5fc3RvcFdhdGNoID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5sZXQgX2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkID0gLTE7XG5leHBvcnQgZnVuY3Rpb24gc2V0R2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGQobjogbnVtYmVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBvbGRWYWx1ZSA9IF9nbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZDtcblx0X2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkID0gbjtcblx0cmV0dXJuIHtcblx0XHRkaXNwb3NlKCkge1xuXHRcdFx0X2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkID0gb2xkVmFsdWU7XG5cdFx0fVxuXHR9O1xufVxuXG5sZXQgbGVha2FnZU1vbml0b3JJZCA9IDE7XG5cbmZ1bmN0aW9uIG5leHRMZWFrYWdlTW9uaXRvck5hbWUoKTogc3RyaW5nIHtcblx0cmV0dXJuIChsZWFrYWdlTW9uaXRvcklkKyspLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgzLCAnMCcpO1xufVxuXG5jbGFzcyBMZWFrYWdlTW9uaXRvciB7XG5cblx0cHJpdmF0ZSBfc3RhY2tzOiBNYXA8c3RyaW5nLCBudW1iZXI+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93YXJuQ291bnRkb3duOiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Vycm9ySGFuZGxlcjogKGVycjogRXJyb3IpID0+IHZvaWQsXG5cdFx0cmVhZG9ubHkgdGhyZXNob2xkOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nID0gbmV4dExlYWthZ2VNb25pdG9yTmFtZSgpXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFja3M/LmNsZWFyKCk7XG5cdH1cblxuXHRjaGVjayhzdGFjazogU3RhY2t0cmFjZSwgbGlzdGVuZXJDb3VudDogbnVtYmVyKTogdW5kZWZpbmVkIHwgKCgpID0+IHZvaWQpIHtcblxuXHRcdGNvbnN0IHRocmVzaG9sZCA9IHRoaXMudGhyZXNob2xkO1xuXHRcdGlmICh0aHJlc2hvbGQgPD0gMCB8fCBsaXN0ZW5lckNvdW50IDwgdGhyZXNob2xkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc3RhY2tzKSB7XG5cdFx0XHR0aGlzLl9zdGFja3MgPSBuZXcgTWFwKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YWNrS2V5ID0gc3RhY2sudmFsdWU7XG5cdFx0Y29uc3QgY291bnQgPSAodGhpcy5fc3RhY2tzLmdldChzdGFja0tleSkgfHwgMCk7XG5cdFx0dGhpcy5fc3RhY2tzLnNldChzdGFja0tleSwgY291bnQgKyAxKTtcblx0XHR0aGlzLl93YXJuQ291bnRkb3duIC09IDE7XG5cblx0XHRpZiAodGhpcy5fd2FybkNvdW50ZG93biA8PSAwKSB7XG5cdFx0XHQvLyBvbmx5IHdhcm4gb24gZmlyc3QgZXhjZWVkIGFuZCB0aGVuIGV2ZXJ5IHRpbWUgdGhlIGxpbWl0XG5cdFx0XHQvLyBpcyBleGNlZWRlZCBieSA1MCUgYWdhaW5cblx0XHRcdHRoaXMuX3dhcm5Db3VudGRvd24gPSB0aHJlc2hvbGQgKiAwLjU7XG5cblx0XHRcdGNvbnN0IFt0b3BTdGFjaywgdG9wQ291bnRdID0gdGhpcy5nZXRNb3N0RnJlcXVlbnRTdGFjaygpITtcblx0XHRcdGNvbnN0IGVtaXR0ZXJOYW1lID0gL15bMC05YS1mXSskL2kudGVzdCh0aGlzLm5hbWUpID8gdW5kZWZpbmVkIDogdGhpcy5uYW1lO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBbJHt0aGlzLm5hbWV9XSBwb3RlbnRpYWwgbGlzdGVuZXIgTEVBSyBkZXRlY3RlZCwgaGF2aW5nICR7bGlzdGVuZXJDb3VudH0gbGlzdGVuZXJzIGFscmVhZHkuIE1PU1QgZnJlcXVlbnQgbGlzdGVuZXIgKCR7dG9wQ291bnR9KTpgO1xuXHRcdFx0Y29uc29sZS53YXJuKG1lc3NhZ2UpO1xuXHRcdFx0Y29uc29sZS53YXJuKHRvcFN0YWNrKTtcblxuXHRcdFx0Y29uc3Qga2luZCA9IHRvcENvdW50IC8gbGlzdGVuZXJDb3VudCA+IDAuMyA/ICdkb21pbmF0ZWQnIDogJ3BvcHVsYXInO1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgTGlzdGVuZXJMZWFrRXJyb3Ioa2luZCwgbWVzc2FnZSwgdG9wU3RhY2ssIGxpc3RlbmVyQ291bnQsIGVtaXR0ZXJOYW1lKTtcblx0XHRcdHRoaXMuX2Vycm9ySGFuZGxlcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGNvbnN0IGNvdW50ID0gKHRoaXMuX3N0YWNrcyEuZ2V0KHN0YWNrS2V5KSB8fCAwKTtcblx0XHRcdGlmIChjb3VudCA8PSAxKSB7XG5cdFx0XHRcdHRoaXMuX3N0YWNrcyEuZGVsZXRlKHN0YWNrS2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3N0YWNrcyEuc2V0KHN0YWNrS2V5LCBjb3VudCAtIDEpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRnZXRNb3N0RnJlcXVlbnRTdGFjaygpOiBbc3RyaW5nLCBudW1iZXJdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3N0YWNrcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHRvcFN0YWNrOiBbc3RyaW5nLCBudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0b3BDb3VudDogbnVtYmVyID0gMDtcblx0XHRmb3IgKGNvbnN0IFtzdGFjaywgY291bnRdIG9mIHRoaXMuX3N0YWNrcykge1xuXHRcdFx0aWYgKCF0b3BTdGFjayB8fCB0b3BDb3VudCA8IGNvdW50KSB7XG5cdFx0XHRcdHRvcFN0YWNrID0gW3N0YWNrLCBjb3VudF07XG5cdFx0XHRcdHRvcENvdW50ID0gY291bnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0b3BTdGFjaztcblx0fVxufVxuXG5jbGFzcyBTdGFja3RyYWNlIHtcblxuXHRzdGF0aWMgY3JlYXRlKCkge1xuXHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcigpO1xuXHRcdHJldHVybiBuZXcgU3RhY2t0cmFjZShlcnIuc3RhY2sgPz8gJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihyZWFkb25seSB2YWx1ZTogc3RyaW5nKSB7IH1cblxuXHRwcmludCgpIHtcblx0XHRjb25zb2xlLndhcm4odGhpcy52YWx1ZS5zcGxpdCgnXFxuJykuc2xpY2UoMikuam9pbignXFxuJykpO1xuXHR9XG59XG5cbi8vIGVycm9yIHRoYXQgaXMgbG9nZ2VkIHdoZW4gZ29pbmcgb3ZlciB0aGUgY29uZmlndXJlZCBsaXN0ZW5lciB0aHJlc2hvbGRcbmV4cG9ydCBjbGFzcyBMaXN0ZW5lckxlYWtFcnJvciBleHRlbmRzIEVycm9yIHtcblx0cmVhZG9ubHkga2luZDogc3RyaW5nO1xuXHRyZWFkb25seSBsaXN0ZW5lckNvdW50OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgZGV0YWlsZWQgbWVzc2FnZSBpbmNsdWRpbmcgbGlzdGVuZXIgY291bnQgYW5kIG1vc3QgZnJlcXVlbnQgc3RhY2suXG5cdCAqIEF2YWlsYWJsZSBsb2NhbGx5IGZvciBkZWJ1Z2dpbmcgYnV0IGludGVudGlvbmFsbHkgbm90IHVzZWQgYXMgdGhlIGVycm9yXG5cdCAqIGBtZXNzYWdlYC4gV2hlbiBgZW1pdHRlck5hbWVgIGlzIHByb3ZpZGVkLCBlcnJvcnMgZ3JvdXAgYnkgZW1pdHRlciBuYW1lXG5cdCAqIGFuZCBraW5kIGluIHRlbGVtZXRyeTsgb3RoZXJ3aXNlIHRoZXkgZ3JvdXAgYnkga2luZCBhbG9uZS5cblx0ICovXG5cdHJlYWRvbmx5IGRldGFpbHM6IHN0cmluZztcblx0Y29uc3RydWN0b3Ioa2luZDogJ2RvbWluYXRlZCcgfCAncG9wdWxhcicsIGRldGFpbHM6IHN0cmluZywgc3RhY2s6IHN0cmluZywgbGlzdGVuZXJDb3VudDogbnVtYmVyLCBlbWl0dGVyTmFtZT86IHN0cmluZykge1xuXHRcdHN1cGVyKGVtaXR0ZXJOYW1lXG5cdFx0XHQ/IGBbJHtlbWl0dGVyTmFtZX1dIHBvdGVudGlhbCBsaXN0ZW5lciBMRUFLIGRldGVjdGVkLCAke2tpbmR9YFxuXHRcdFx0OiBgcG90ZW50aWFsIGxpc3RlbmVyIExFQUsgZGV0ZWN0ZWQsICR7a2luZH1gKTtcblx0XHR0aGlzLm5hbWUgPSAnTGlzdGVuZXJMZWFrRXJyb3InO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdFx0dGhpcy5saXN0ZW5lckNvdW50ID0gbGlzdGVuZXJDb3VudDtcblx0XHR0aGlzLmRldGFpbHMgPSBkZXRhaWxzO1xuXHRcdHRoaXMuc3RhY2sgPSBzdGFjaztcblx0fVxuXG5cdHN0YXRpYyBpcyhlcnI6IHVua25vd24pOiBlcnIgaXMgTGlzdGVuZXJMZWFrRXJyb3Ige1xuXHRcdHJldHVybiBlcnIgaW5zdGFuY2VvZiBMaXN0ZW5lckxlYWtFcnJvclxuXHRcdFx0fHwgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIHR5cGVvZiAoZXJyIGFzIEVycm9yICYgeyBraW5kOiB1bmtub3duOyBsaXN0ZW5lckNvdW50OiB1bmtub3duIH0pLmtpbmQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiAoZXJyIGFzIEVycm9yICYgeyBraW5kOiB1bmtub3duOyBsaXN0ZW5lckNvdW50OiB1bmtub3duIH0pLmxpc3RlbmVyQ291bnQgPT09ICdudW1iZXInKTtcblx0fVxufVxuXG4vLyBTRVZFUkUgZXJyb3IgdGhhdCBpcyBsb2dnZWQgd2hlbiBoYXZpbmcgZ29uZSB3YXkgb3ZlciB0aGUgY29uZmlndXJlZCBsaXN0ZW5lclxuLy8gdGhyZXNob2xkIHNvIHRoYXQgdGhlIGVtaXR0ZXIgcmVmdXNlcyB0byBhY2NlcHQgbW9yZSBsaXN0ZW5lcnNcbmV4cG9ydCBjbGFzcyBMaXN0ZW5lclJlZnVzYWxFcnJvciBleHRlbmRzIExpc3RlbmVyTGVha0Vycm9yIHtcblx0Y29uc3RydWN0b3Ioa2luZDogJ2RvbWluYXRlZCcgfCAncG9wdWxhcicsIGRldGFpbHM6IHN0cmluZywgc3RhY2s6IHN0cmluZywgbGlzdGVuZXJDb3VudDogbnVtYmVyLCBlbWl0dGVyTmFtZT86IHN0cmluZykge1xuXHRcdHN1cGVyKGtpbmQsIGRldGFpbHMsIHN0YWNrLCBsaXN0ZW5lckNvdW50LCBlbWl0dGVyTmFtZSk7XG5cdFx0dGhpcy5uYW1lID0gJ0xpc3RlbmVyUmVmdXNhbEVycm9yJztcblx0fVxufVxuXG5sZXQgaWQgPSAwO1xuY2xhc3MgVW5pcXVlQ29udGFpbmVyPFQ+IHtcblx0c3RhY2s/OiBTdGFja3RyYWNlO1xuXHRwdWJsaWMgaWQgPSBpZCsrO1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgdmFsdWU6IFQpIHsgfVxufVxuY29uc3QgY29tcGFjdGlvblRocmVzaG9sZCA9IDI7XG5cbnR5cGUgTGlzdGVuZXJDb250YWluZXI8VD4gPSBVbmlxdWVDb250YWluZXI8KGRhdGE6IFQpID0+IHZvaWQ+O1xudHlwZSBMaXN0ZW5lck9yTGlzdGVuZXJzPFQ+ID0gKExpc3RlbmVyQ29udGFpbmVyPFQ+IHwgdW5kZWZpbmVkKVtdIHwgTGlzdGVuZXJDb250YWluZXI8VD47XG5cbmNvbnN0IGZvckVhY2hMaXN0ZW5lciA9IDxUPihsaXN0ZW5lcnM6IExpc3RlbmVyT3JMaXN0ZW5lcnM8VD4sIGZuOiAoYzogTGlzdGVuZXJDb250YWluZXI8VD4pID0+IHZvaWQpID0+IHtcblx0aWYgKGxpc3RlbmVycyBpbnN0YW5jZW9mIFVuaXF1ZUNvbnRhaW5lcikge1xuXHRcdGZuKGxpc3RlbmVycyk7XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGwgPSBsaXN0ZW5lcnNbaV07XG5cdFx0XHRpZiAobCkge1xuXHRcdFx0XHRmbihsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogVGhlIEVtaXR0ZXIgY2FuIGJlIHVzZWQgdG8gZXhwb3NlIGFuIEV2ZW50IHRvIHRoZSBwdWJsaWNcbiAqIHRvIGZpcmUgaXQgZnJvbSB0aGUgaW5zaWRlcy5cbiAqIFNhbXBsZTpcblx0Y2xhc3MgRG9jdW1lbnQge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjwodmFsdWU6c3RyaW5nKT0+YW55PigpO1xuXG5cdFx0cHVibGljIG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0XHQvLyBnZXR0ZXItc3R5bGVcblx0XHQvLyBnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8KHZhbHVlOnN0cmluZyk9PmFueT4ge1xuXHRcdC8vIFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXHRcdC8vIH1cblxuXHRcdHByaXZhdGUgX2RvSXQoKSB7XG5cdFx0XHQvLy4uLlxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh2YWx1ZSk7XG5cdFx0fVxuXHR9XG4gKi9cbmV4cG9ydCBjbGFzcyBFbWl0dGVyPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zPzogRW1pdHRlck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sZWFrV2FybmluZ05hbWU/OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xlYWtXYXJuaW5nRXJyb3JIYW5kbGVyPzogKGVycjogRXJyb3IpID0+IHZvaWQ7XG5cdHByaXZhdGUgX2xlYWthZ2VNb24/OiBMZWFrYWdlTW9uaXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVyZk1vbj86IEV2ZW50UHJvZmlsaW5nO1xuXHRwcml2YXRlIF9kaXNwb3NlZD86IHRydWU7XG5cdHByaXZhdGUgX2V2ZW50PzogRXZlbnQ8VD47XG5cblx0LyoqXG5cdCAqIEEgbGlzdGVuZXIsIG9yIGxpc3Qgb2YgbGlzdGVuZXJzLiBBIHNpbmdsZSBsaXN0ZW5lciBpcyB0aGUgbW9zdCBjb21tb25cblx0ICogZm9yIGV2ZW50IGVtaXR0ZXJzICgjMTg1Nzg5KSwgc28gd2Ugb3B0aW1pemUgdGhhdCBzcGVjaWFsIGNhc2UgdG8gYXZvaWRcblx0ICogd3JhcHBpbmcgaXQgaW4gYW4gYXJyYXkgKGp1c3QgbGlrZSBOb2RlLmpzIGl0c2VsZi4pXG5cdCAqXG5cdCAqIEEgbGlzdCBvZiBsaXN0ZW5lcnMgbmV2ZXIgJ2Rvd25ncmFkZXMnIGJhY2sgdG8gYSBwbGFpbiBmdW5jdGlvbiBpZlxuXHQgKiBsaXN0ZW5lcnMgYXJlIHJlbW92ZWQsIGZvciB0d28gcmVhc29uczpcblx0ICpcblx0ICogIDEuIFRoYXQncyBjb21wbGljYXRlZCAoZXNwZWNpYWxseSB3aXRoIHRoZSBkZWxpdmVyeVF1ZXVlKVxuXHQgKiAgMi4gQSBsaXN0ZW5lciB3aXRoID4xIGxpc3RlbmVyIGlzIGxpa2VseSB0byBoYXZlID4xIGxpc3RlbmVyIGFnYWluIGF0XG5cdCAqICAgICBzb21lIHBvaW50LCBhbmQgc3dhcHBpbmcgYmV0d2VlbiBhcnJheXMgYW5kIGZ1bmN0aW9ucyBtYXlbY2l0YXRpb24gbmVlZGVkXVxuXHQgKiAgICAgaW50cm9kdWNlIHVubmVjZXNzYXJ5IHdvcmsgYW5kIGdhcmJhZ2UuXG5cdCAqXG5cdCAqIFRoZSBhcnJheSBsaXN0ZW5lcnMgY2FuIGJlICdzcGFyc2UnLCB0byBhdm9pZCByZWFsbG9jYXRpbmcgdGhlIGFycmF5XG5cdCAqIHdoZW5ldmVyIGFueSBsaXN0ZW5lciBpcyBhZGRlZCBvciByZW1vdmVkLiBJZiBtb3JlIHRoYW4gYDEgLyBjb21wYWN0aW9uVGhyZXNob2xkYFxuXHQgKiBvZiB0aGUgYXJyYXkgaXMgZW1wdHksIG9ubHkgdGhlbiBpcyBpdCByZXNpemVkLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9saXN0ZW5lcnM/OiBMaXN0ZW5lck9yTGlzdGVuZXJzPFQ+O1xuXG5cdC8qKlxuXHQgKiBBbHdheXMgdG8gYmUgZGVmaW5lZCBpZiBfbGlzdGVuZXJzIGlzIGFuIGFycmF5LiBJdCdzIG5vIGxvbmdlciBhIHRydWVcblx0ICogcXVldWUsIGJ1dCBob2xkcyB0aGUgZGlzcGF0Y2hpbmcgJ3N0YXRlJy4gSWYgYGZpcmUoKWAgaXMgY2FsbGVkIG9uIGFuXG5cdCAqIGVtaXR0ZXIsIGFueSB3b3JrIGxlZnQgaW4gdGhlIF9kZWxpdmVyeVF1ZXVlIGlzIGZpbmlzaGVkIGZpcnN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVsaXZlcnlRdWV1ZT86IEV2ZW50RGVsaXZlcnlRdWV1ZVByaXZhdGU7XG5cdHByb3RlY3RlZCBfc2l6ZSA9IDA7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9ucz86IEVtaXR0ZXJPcHRpb25zKSB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0aWYgKF9nbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZCA+IDAgfHwgdGhpcy5fb3B0aW9ucz8ubGVha1dhcm5pbmdUaHJlc2hvbGQpIHtcblx0XHRcdHRoaXMuX2xlYWtXYXJuaW5nVGhyZXNob2xkID0gdGhpcy5fb3B0aW9ucz8ubGVha1dhcm5pbmdUaHJlc2hvbGQgPz8gX2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkO1xuXHRcdFx0dGhpcy5fbGVha1dhcm5pbmdOYW1lID0gdGhpcy5fb3B0aW9ucz8ubGVha1dhcm5pbmdOYW1lID8/IG5leHRMZWFrYWdlTW9uaXRvck5hbWUoKTtcblx0XHRcdHRoaXMuX2xlYWtXYXJuaW5nRXJyb3JIYW5kbGVyID0gdGhpcy5fb3B0aW9ucz8ub25MaXN0ZW5lckVycm9yID8/IG9uVW5leHBlY3RlZEVycm9yO1xuXHRcdH1cblx0XHR0aGlzLl9wZXJmTW9uID0gdGhpcy5fb3B0aW9ucz8uX3Byb2ZOYW1lID8gbmV3IEV2ZW50UHJvZmlsaW5nKHRoaXMuX29wdGlvbnMuX3Byb2ZOYW1lKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kZWxpdmVyeVF1ZXVlID0gdGhpcy5fb3B0aW9ucz8uZGVsaXZlcnlRdWV1ZSBhcyBFdmVudERlbGl2ZXJ5UXVldWVQcml2YXRlIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGVha2FnZU1vbml0b3IoKTogTGVha2FnZU1vbml0b3IgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9sZWFrV2FybmluZ1RocmVzaG9sZCA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuX2xlYWtXYXJuaW5nTmFtZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuX2xlYWtXYXJuaW5nRXJyb3JIYW5kbGVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sZWFrYWdlTW9uID8/PSBuZXcgTGVha2FnZU1vbml0b3IodGhpcy5fbGVha1dhcm5pbmdFcnJvckhhbmRsZXIsIHRoaXMuX2xlYWtXYXJuaW5nVGhyZXNob2xkLCB0aGlzLl9sZWFrV2FybmluZ05hbWUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHRpZiAoIXRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cblx0XHRcdC8vIEl0IGlzIGJhZCB0byBoYXZlIGxpc3RlbmVycyBhdCB0aGUgdGltZSBvZiBkaXNwb3NpbmcgYW4gZW1pdHRlciwgaXQgaXMgd29yc3QgdG8gaGF2ZSBsaXN0ZW5lcnMga2VlcCB0aGUgZW1pdHRlclxuXHRcdFx0Ly8gYWxpdmUgdmlhIHRoZSByZWZlcmVuY2UgdGhhdCdzIGVtYmVkZGVkIGluIHRoZWlyIGRpc3Bvc2FibGVzLiBUaGVyZWZvcmUgd2UgbG9vcCBvdmVyIGFsbCByZW1haW5pbmcgbGlzdGVuZXJzIGFuZFxuXHRcdFx0Ly8gdW5zZXQgdGhlaXIgc3Vic2NyaXB0aW9ucy9kaXNwb3NhYmxlcy4gTG9vcGluZyBhbmQgYmxhbWluZyByZW1haW5pbmcgbGlzdGVuZXJzIGlzIGRvbmUgb24gbmV4dCB0aWNrIGJlY2F1c2UgdGhlXG5cdFx0XHQvLyB0aGUgZm9sbG93aW5nIHByb2dyYW1taW5nIHBhdHRlcm4gaXMgdmVyeSBwb3B1bGFyOlxuXHRcdFx0Ly9cblx0XHRcdC8vIGNvbnN0IHNvbWVNb2RlbCA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgTW9kZWxPYmplY3QoKSk7IC8vICgxKSBjcmVhdGUgYW5kIHJlZ2lzdGVyIG1vZGVsXG5cdFx0XHQvLyB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoc29tZU1vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHsgLi4uIH0pOyAvLyAoMikgc3Vic2NyaWJlIGFuZCByZWdpc3RlciBtb2RlbC1ldmVudCBsaXN0ZW5lclxuXHRcdFx0Ly8gLi4ubGF0ZXIuLi5cblx0XHRcdC8vIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTsgZGlzcG9zZXMgKDEpIHRoZW4gKDIpOiBkb24ndCB3YXJuIGFmdGVyICgxKSBidXQgYWZ0ZXIgdGhlIFwib3ZlcmFsbCBkaXNwb3NlXCIgaXMgZG9uZVxuXG5cdFx0XHRpZiAodGhpcy5fZGVsaXZlcnlRdWV1ZT8uY3VycmVudCA9PT0gdGhpcykge1xuXHRcdFx0XHR0aGlzLl9kZWxpdmVyeVF1ZXVlLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fbGlzdGVuZXJzKSB7XG5cdFx0XHRcdGlmIChfZW5hYmxlRGlzcG9zZVdpdGhMaXN0ZW5lcldhcm5pbmcpIHtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnM7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0Zm9yRWFjaExpc3RlbmVyKGxpc3RlbmVycywgbCA9PiBsLnN0YWNrPy5wcmludCgpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xpc3RlbmVycyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fc2l6ZSA9IDA7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vcHRpb25zPy5vbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcj8uKCk7XG5cdFx0XHR0aGlzLl9sZWFrYWdlTW9uPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvciB0aGUgcHVibGljIHRvIGFsbG93IHRvIHN1YnNjcmliZVxuXHQgKiB0byBldmVudHMgZnJvbSB0aGlzIEVtaXR0ZXJcblx0ICovXG5cdGdldCBldmVudCgpOiBFdmVudDxUPiB7XG5cdFx0dGhpcy5fZXZlbnQgPz89IChjYWxsYmFjazogKGU6IFQpID0+IHVua25vd24sIHRoaXNBcmdzPzogYW55LCBkaXNwb3NhYmxlcz86IElEaXNwb3NhYmxlW10gfCBEaXNwb3NhYmxlU3RvcmUpID0+IHtcblx0XHRcdGlmICh0aGlzLl9sZWFrV2FybmluZ1RocmVzaG9sZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3NpemUgPiB0aGlzLl9sZWFrV2FybmluZ1RocmVzaG9sZCAqKiAyKSB7XG5cdFx0XHRcdGNvbnN0IGxlYWthZ2VNb24gPSB0aGlzLl9nZXRMZWFrYWdlTW9uaXRvcigpO1xuXHRcdFx0XHRpZiAobGVha2FnZU1vbikge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBgWyR7bGVha2FnZU1vbi5uYW1lfV0gUkVGVVNFUyB0byBhY2NlcHQgbmV3IGxpc3RlbmVycyBiZWNhdXNlIGl0IGV4Y2VlZGVkIGl0cyB0aHJlc2hvbGQgYnkgZmFyICgke3RoaXMuX3NpemV9IHZzICR7bGVha2FnZU1vbi50aHJlc2hvbGR9KWA7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKG1lc3NhZ2UpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdHVwbGUgPSBsZWFrYWdlTW9uLmdldE1vc3RGcmVxdWVudFN0YWNrKCkgPz8gWydVTktOT1dOIHN0YWNrJywgLTFdO1xuXHRcdFx0XHRcdGNvbnN0IGtpbmQgPSB0dXBsZVsxXSAvIHRoaXMuX3NpemUgPiAwLjMgPyAnZG9taW5hdGVkJyA6ICdwb3B1bGFyJztcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IG5ldyBMaXN0ZW5lclJlZnVzYWxFcnJvcihraW5kLCBgJHttZXNzYWdlfS4gSElOVDogU3RhY2sgc2hvd3MgbW9zdCBmcmVxdWVudCBsaXN0ZW5lciAoJHt0dXBsZVsxXX0tdGltZXMpYCwgdHVwbGVbMF0sIHRoaXMuX3NpemUsIHRoaXMuX29wdGlvbnM/LmxlYWtXYXJuaW5nTmFtZSk7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JIYW5kbGVyID0gdGhpcy5fb3B0aW9ucz8ub25MaXN0ZW5lckVycm9yIHx8IG9uVW5leHBlY3RlZEVycm9yO1xuXHRcdFx0XHRcdGVycm9ySGFuZGxlcihlcnJvcik7XG5cblx0XHRcdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHQvLyB0b2RvOiBzaG91bGQgd2Ugd2FybiBpZiBhIGxpc3RlbmVyIGlzIGFkZGVkIHRvIGEgZGlzcG9zZWQgZW1pdHRlcj8gVGhpcyBoYXBwZW5zIG9mdGVuXG5cdFx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzQXJncykge1xuXHRcdFx0XHRjYWxsYmFjayA9IGNhbGxiYWNrLmJpbmQodGhpc0FyZ3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250YWluZWQgPSBuZXcgVW5pcXVlQ29udGFpbmVyKGNhbGxiYWNrKTtcblxuXHRcdFx0bGV0IHJlbW92ZU1vbml0b3I6IEZ1bmN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHN0YWNrOiBTdGFja3RyYWNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX2xlYWtXYXJuaW5nVGhyZXNob2xkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fc2l6ZSA+PSBNYXRoLmNlaWwodGhpcy5fbGVha1dhcm5pbmdUaHJlc2hvbGQgKiAwLjIpKSB7XG5cdFx0XHRcdGNvbnN0IGxlYWthZ2VNb24gPSB0aGlzLl9nZXRMZWFrYWdlTW9uaXRvcigpO1xuXHRcdFx0XHRpZiAobGVha2FnZU1vbikge1xuXHRcdFx0XHRcdC8vIGNoZWNrIGFuZCByZWNvcmQgdGhpcyBlbWl0dGVyIGZvciBwb3RlbnRpYWwgbGVha2FnZVxuXHRcdFx0XHRcdGNvbnRhaW5lZC5zdGFjayA9IFN0YWNrdHJhY2UuY3JlYXRlKCk7XG5cdFx0XHRcdFx0cmVtb3ZlTW9uaXRvciA9IGxlYWthZ2VNb24uY2hlY2soY29udGFpbmVkLnN0YWNrLCB0aGlzLl9zaXplICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKF9lbmFibGVEaXNwb3NlV2l0aExpc3RlbmVyV2FybmluZykge1xuXHRcdFx0XHRjb250YWluZWQuc3RhY2sgPSBzdGFjayA/PyBTdGFja3RyYWNlLmNyZWF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2xpc3RlbmVycykge1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zPy5vbldpbGxBZGRGaXJzdExpc3RlbmVyPy4odGhpcyk7XG5cdFx0XHRcdHRoaXMuX2xpc3RlbmVycyA9IGNvbnRhaW5lZDtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucz8ub25EaWRBZGRGaXJzdExpc3RlbmVyPy4odGhpcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2xpc3RlbmVycyBpbnN0YW5jZW9mIFVuaXF1ZUNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLl9kZWxpdmVyeVF1ZXVlID8/PSBuZXcgRXZlbnREZWxpdmVyeVF1ZXVlUHJpdmF0ZSgpO1xuXHRcdFx0XHR0aGlzLl9saXN0ZW5lcnMgPSBbdGhpcy5fbGlzdGVuZXJzLCBjb250YWluZWRdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbGlzdGVuZXJzLnB1c2goY29udGFpbmVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29wdGlvbnM/Lm9uRGlkQWRkTGlzdGVuZXI/Lih0aGlzKTtcblxuXHRcdFx0dGhpcy5fc2l6ZSsrO1xuXG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHJlbW92ZU1vbml0b3I/LigpO1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVMaXN0ZW5lcihjb250YWluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHRhZGRUb0Rpc3Bvc2FibGVzKHJlc3VsdCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRyZXR1cm4gdGhpcy5fZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcjogTGlzdGVuZXJDb250YWluZXI8VD4pIHtcblx0XHR0aGlzLl9vcHRpb25zPy5vbldpbGxSZW1vdmVMaXN0ZW5lcj8uKHRoaXMpO1xuXG5cdFx0aWYgKCF0aGlzLl9saXN0ZW5lcnMpIHtcblx0XHRcdHJldHVybjsgLy8gZXhwZWN0ZWQgaWYgYSBsaXN0ZW5lciBnZXRzIGRpc3Bvc2VkXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3NpemUgPT09IDEpIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVycyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29wdGlvbnM/Lm9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyPy4odGhpcyk7XG5cdFx0XHR0aGlzLl9zaXplID0gMDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBzaXplID4gMSB3aGljaCByZXF1aXJlcyB0aGF0IGxpc3RlbmVycyBiZSBhIGxpc3Q6XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzIGFzIChMaXN0ZW5lckNvbnRhaW5lcjxUPiB8IHVuZGVmaW5lZClbXTtcblxuXHRcdGNvbnN0IGluZGV4ID0gbGlzdGVuZXJzLmluZGV4T2YobGlzdGVuZXIpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdkaXNwb3NlZD8nLCB0aGlzLl9kaXNwb3NlZCk7XG5cdFx0XHRjb25zb2xlLmxvZygnc2l6ZT8nLCB0aGlzLl9zaXplKTtcblx0XHRcdGNvbnNvbGUubG9nKCdhcnI/JywgSlNPTi5zdHJpbmdpZnkodGhpcy5fbGlzdGVuZXJzKSk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F0dGVtcHRlZCB0byBkaXNwb3NlIHVua25vd24gbGlzdGVuZXInKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zaXplLS07XG5cdFx0bGlzdGVuZXJzW2luZGV4XSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGFkanVzdERlbGl2ZXJ5UXVldWUgPSB0aGlzLl9kZWxpdmVyeVF1ZXVlIS5jdXJyZW50ID09PSB0aGlzO1xuXHRcdGlmICh0aGlzLl9zaXplICogY29tcGFjdGlvblRocmVzaG9sZCA8PSBsaXN0ZW5lcnMubGVuZ3RoKSB7XG5cdFx0XHRsZXQgbiA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAobGlzdGVuZXJzW2ldKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXJzW24rK10gPSBsaXN0ZW5lcnNbaV07XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWRqdXN0RGVsaXZlcnlRdWV1ZSAmJiBuIDwgdGhpcy5fZGVsaXZlcnlRdWV1ZSEuZW5kKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVsaXZlcnlRdWV1ZSEuZW5kLS07XG5cdFx0XHRcdFx0aWYgKG4gPCB0aGlzLl9kZWxpdmVyeVF1ZXVlIS5pKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWxpdmVyeVF1ZXVlIS5pLS07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRsaXN0ZW5lcnMubGVuZ3RoID0gbjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZWxpdmVyKGxpc3RlbmVyOiB1bmRlZmluZWQgfCBVbmlxdWVDb250YWluZXI8KHZhbHVlOiBUKSA9PiB2b2lkPiwgdmFsdWU6IFQpIHtcblx0XHRpZiAoIWxpc3RlbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXJyb3JIYW5kbGVyID0gdGhpcy5fb3B0aW9ucz8ub25MaXN0ZW5lckVycm9yIHx8IG9uVW5leHBlY3RlZEVycm9yO1xuXHRcdGlmICghZXJyb3JIYW5kbGVyKSB7XG5cdFx0XHRsaXN0ZW5lci52YWx1ZSh2YWx1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGxpc3RlbmVyLnZhbHVlKHZhbHVlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvckhhbmRsZXIoZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIERlbGl2ZXJzIGl0ZW1zIGluIHRoZSBxdWV1ZS4gQXNzdW1lcyB0aGUgcXVldWUgaXMgcmVhZHkgdG8gZ28uICovXG5cdHByaXZhdGUgX2RlbGl2ZXJRdWV1ZShkcTogRXZlbnREZWxpdmVyeVF1ZXVlUHJpdmF0ZSkge1xuXHRcdGNvbnN0IGxpc3RlbmVycyA9IGRxLmN1cnJlbnQhLl9saXN0ZW5lcnMhIGFzIChMaXN0ZW5lckNvbnRhaW5lcjxUPiB8IHVuZGVmaW5lZClbXTtcblx0XHR3aGlsZSAoZHEuaSA8IGRxLmVuZCkge1xuXHRcdFx0Ly8gaW1wb3J0YW50OiBkcS5pIGlzIGluY3JlbWVudGVkIGJlZm9yZSBjYWxsaW5nIGRlbGl2ZXIoKSBiZWNhdXNlIGl0IG1pZ2h0IHJlZW50ZXIgZGVsaXZlclF1ZXVlKClcblx0XHRcdHRoaXMuX2RlbGl2ZXIobGlzdGVuZXJzW2RxLmkrK10sIGRxLnZhbHVlIGFzIFQpO1xuXHRcdH1cblx0XHRkcS5yZXNldCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRvIGJlIGtlcHQgcHJpdmF0ZSB0byBmaXJlIGFuIGV2ZW50IHRvXG5cdCAqIHN1YnNjcmliZXJzXG5cdCAqL1xuXHRmaXJlKGV2ZW50OiBUKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RlbGl2ZXJ5UXVldWU/LmN1cnJlbnQpIHtcblx0XHRcdHRoaXMuX2RlbGl2ZXJRdWV1ZSh0aGlzLl9kZWxpdmVyeVF1ZXVlKTtcblx0XHRcdHRoaXMuX3BlcmZNb24/LnN0b3AoKTsgLy8gbGFzdCBmaXJlKCkgd2lsbCBoYXZlIHN0YXJ0aW5nIHBlcmZtb24sIHN0b3AgaXQgYmVmb3JlIHN0YXJ0aW5nIHRoZSBuZXh0IGRpc3BhdGNoXG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVyZk1vbj8uc3RhcnQodGhpcy5fc2l6ZSk7XG5cblx0XHRpZiAoIXRoaXMuX2xpc3RlbmVycykge1xuXHRcdFx0Ly8gbm8tb3Bcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2xpc3RlbmVycyBpbnN0YW5jZW9mIFVuaXF1ZUNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fZGVsaXZlcih0aGlzLl9saXN0ZW5lcnMsIGV2ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZHEgPSB0aGlzLl9kZWxpdmVyeVF1ZXVlITtcblx0XHRcdGRxLmVucXVldWUodGhpcywgZXZlbnQsIHRoaXMuX2xpc3RlbmVycy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fZGVsaXZlclF1ZXVlKGRxKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wZXJmTW9uPy5zdG9wKCk7XG5cdH1cblxuXHRoYXNMaXN0ZW5lcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemUgPiAwO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnREZWxpdmVyeVF1ZXVlIHtcblx0X2lzRXZlbnREZWxpdmVyeVF1ZXVlOiB0cnVlO1xufVxuXG5leHBvcnQgY29uc3QgY3JlYXRlRXZlbnREZWxpdmVyeVF1ZXVlID0gKCk6IEV2ZW50RGVsaXZlcnlRdWV1ZSA9PiBuZXcgRXZlbnREZWxpdmVyeVF1ZXVlUHJpdmF0ZSgpO1xuXG5jbGFzcyBFdmVudERlbGl2ZXJ5UXVldWVQcml2YXRlIGltcGxlbWVudHMgRXZlbnREZWxpdmVyeVF1ZXVlIHtcblx0ZGVjbGFyZSBfaXNFdmVudERlbGl2ZXJ5UXVldWU6IHRydWU7XG5cblx0LyoqXG5cdCAqIEluZGV4IGluIGN1cnJlbnQncyBsaXN0ZW5lciBsaXN0LlxuXHQgKi9cblx0cHVibGljIGkgPSAtMTtcblxuXHQvKipcblx0ICogVGhlIGxhc3QgaW5kZXggaW4gdGhlIGxpc3RlbmVyJ3MgbGlzdCB0byBkZWxpdmVyLlxuXHQgKi9cblx0cHVibGljIGVuZCA9IDA7XG5cblx0LyoqXG5cdCAqIEVtaXR0ZXIgY3VycmVudGx5IGJlaW5nIGRpc3BhdGNoZWQgb24uIEVtaXR0ZXIuX2xpc3RlbmVycyBpcyBhbHdheXMgYW4gYXJyYXkuXG5cdCAqL1xuXHRwdWJsaWMgY3VycmVudD86IEVtaXR0ZXI8YW55Pjtcblx0LyoqXG5cdCAqIEN1cnJlbnRseSBlbWl0dGluZyB2YWx1ZS4gRGVmaW5lZCB3aGVuZXZlciBgY3VycmVudGAgaXMuXG5cdCAqL1xuXHRwdWJsaWMgdmFsdWU/OiB1bmtub3duO1xuXG5cdHB1YmxpYyBlbnF1ZXVlPFQ+KGVtaXR0ZXI6IEVtaXR0ZXI8VD4sIHZhbHVlOiBULCBlbmQ6IG51bWJlcikge1xuXHRcdHRoaXMuaSA9IDA7XG5cdFx0dGhpcy5lbmQgPSBlbmQ7XG5cdFx0dGhpcy5jdXJyZW50ID0gZW1pdHRlcjtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXQoKSB7XG5cdFx0dGhpcy5pID0gdGhpcy5lbmQ7IC8vIGZvcmNlIGFueSBjdXJyZW50IGVtaXNzaW9uIGxvb3AgdG8gc3RvcCwgbWFpbmx5IGZvciBkdXJpbmcgZGlzcG9zZVxuXHRcdHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnZhbHVlID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdhaXRVbnRpbCB7XG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbjtcblx0d2FpdFVudGlsKHRoZW5hYmxlOiBQcm9taXNlPHVua25vd24+KTogdm9pZDtcbn1cblxuZXhwb3J0IHR5cGUgSVdhaXRVbnRpbERhdGE8VD4gPSBPbWl0PE9taXQ8VCwgJ3dhaXRVbnRpbCc+LCAndG9rZW4nPjtcblxuZXhwb3J0IGNsYXNzIEFzeW5jRW1pdHRlcjxUIGV4dGVuZHMgSVdhaXRVbnRpbD4gZXh0ZW5kcyBFbWl0dGVyPFQ+IHtcblxuXHRwcml2YXRlIF9hc3luY0RlbGl2ZXJ5UXVldWU/OiBMaW5rZWRMaXN0PFsoZXY6IFQpID0+IHZvaWQsIElXYWl0VW50aWxEYXRhPFQ+XT47XG5cblx0YXN5bmMgZmlyZUFzeW5jKGRhdGE6IElXYWl0VW50aWxEYXRhPFQ+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHByb21pc2VKb2luPzogKHA6IFByb21pc2U8dW5rbm93bj4sIGxpc3RlbmVyOiBGdW5jdGlvbikgPT4gUHJvbWlzZTx1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fbGlzdGVuZXJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9hc3luY0RlbGl2ZXJ5UXVldWUpIHtcblx0XHRcdHRoaXMuX2FzeW5jRGVsaXZlcnlRdWV1ZSA9IG5ldyBMaW5rZWRMaXN0KCk7XG5cdFx0fVxuXG5cdFx0Zm9yRWFjaExpc3RlbmVyKHRoaXMuX2xpc3RlbmVycywgbGlzdGVuZXIgPT4gdGhpcy5fYXN5bmNEZWxpdmVyeVF1ZXVlIS5wdXNoKFtsaXN0ZW5lci52YWx1ZSwgZGF0YV0pKTtcblxuXHRcdHdoaWxlICh0aGlzLl9hc3luY0RlbGl2ZXJ5UXVldWUuc2l6ZSA+IDAgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cblx0XHRcdGNvbnN0IFtsaXN0ZW5lciwgZGF0YV0gPSB0aGlzLl9hc3luY0RlbGl2ZXJ5UXVldWUuc2hpZnQoKSE7XG5cdFx0XHRjb25zdCB0aGVuYWJsZXM6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRjb25zdCBldmVudCA9IDxUPntcblx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdHdhaXRVbnRpbDogKHA6IFByb21pc2U8dW5rbm93bj4pOiB2b2lkID0+IHtcblx0XHRcdFx0XHRpZiAoT2JqZWN0LmlzRnJvemVuKHRoZW5hYmxlcykpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignd2FpdFVudGlsIGNhbiBOT1QgYmUgY2FsbGVkIGFzeW5jaHJvbm91cycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocHJvbWlzZUpvaW4pIHtcblx0XHRcdFx0XHRcdHAgPSBwcm9taXNlSm9pbihwLCBsaXN0ZW5lcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoZW5hYmxlcy5wdXNoKHApO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsaXN0ZW5lcihldmVudCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZnJlZXplIHRoZW5hYmxlcy1jb2xsZWN0aW9uIHRvIGVuZm9yY2Ugc3luYy1jYWxscyB0b1xuXHRcdFx0Ly8gd2FpdCB1bnRpbCBhbmQgdGhlbiB3YWl0IGZvciBhbGwgdGhlbmFibGVzIHRvIHJlc29sdmVcblx0XHRcdE9iamVjdC5mcmVlemUodGhlbmFibGVzKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHRoZW5hYmxlcykudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGlmICh2YWx1ZS5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKHZhbHVlLnJlYXNvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgUGF1c2VhYmxlRW1pdHRlcjxUPiBleHRlbmRzIEVtaXR0ZXI8VD4ge1xuXG5cdHByaXZhdGUgX2lzUGF1c2VkID0gMDtcblx0cHJvdGVjdGVkIF9ldmVudFF1ZXVlID0gbmV3IExpbmtlZExpc3Q8VD4oKTtcblx0cHJpdmF0ZSBfbWVyZ2VGbj86IChpbnB1dDogVFtdKSA9PiBUO1xuXG5cdHB1YmxpYyBnZXQgaXNQYXVzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzUGF1c2VkICE9PSAwO1xuXHR9XG5cblx0Y29uc3RydWN0b3Iob3B0aW9ucz86IEVtaXR0ZXJPcHRpb25zICYgeyBtZXJnZT86IChpbnB1dDogVFtdKSA9PiBUIH0pIHtcblx0XHRzdXBlcihvcHRpb25zKTtcblx0XHR0aGlzLl9tZXJnZUZuID0gb3B0aW9ucz8ubWVyZ2U7XG5cdH1cblxuXHRwYXVzZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1BhdXNlZCsrO1xuXHR9XG5cblx0cmVzdW1lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1BhdXNlZCAhPT0gMCAmJiAtLXRoaXMuX2lzUGF1c2VkID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5fbWVyZ2VGbikge1xuXHRcdFx0XHQvLyB1c2UgdGhlIG1lcmdlIGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIHNpbmdsZSBjb21wb3NpdGVcblx0XHRcdFx0Ly8gZXZlbnQuIG1ha2UgYSBjb3B5IGluIGNhc2UgZmlyaW5nIHBhdXNlcyB0aGlzIGVtaXR0ZXJcblx0XHRcdFx0aWYgKHRoaXMuX2V2ZW50UXVldWUuc2l6ZSA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBldmVudHMgPSBBcnJheS5mcm9tKHRoaXMuX2V2ZW50UXVldWUpO1xuXHRcdFx0XHRcdHRoaXMuX2V2ZW50UXVldWUuY2xlYXIoKTtcblx0XHRcdFx0XHRzdXBlci5maXJlKHRoaXMuX21lcmdlRm4oZXZlbnRzKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gbm8gbWVyZ2luZywgZmlyZSBlYWNoIGV2ZW50IGluZGl2aWR1YWxseSBhbmQgdGVzdFxuXHRcdFx0XHQvLyB0aGF0IHRoaXMgZW1pdHRlciBpc24ndCBwYXVzZWQgaGFsZndheSB0aHJvdWdoXG5cdFx0XHRcdHdoaWxlICghdGhpcy5faXNQYXVzZWQgJiYgdGhpcy5fZXZlbnRRdWV1ZS5zaXplICE9PSAwKSB7XG5cdFx0XHRcdFx0c3VwZXIuZmlyZSh0aGlzLl9ldmVudFF1ZXVlLnNoaWZ0KCkhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZpcmUoZXZlbnQ6IFQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2l6ZSkge1xuXHRcdFx0aWYgKHRoaXMuX2lzUGF1c2VkICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2V2ZW50UXVldWUucHVzaChldmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdXBlci5maXJlKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYm91bmNlRW1pdHRlcjxUPiBleHRlbmRzIFBhdXNlYWJsZUVtaXR0ZXI8VD4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGF5OiBudW1iZXI7XG5cdHByaXZhdGUgX2hhbmRsZTogVGltZW91dCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBFbWl0dGVyT3B0aW9ucyAmIHsgbWVyZ2U6IChpbnB1dDogVFtdKSA9PiBUOyBkZWxheT86IG51bWJlciB9KSB7XG5cdFx0c3VwZXIob3B0aW9ucyk7XG5cdFx0dGhpcy5fZGVsYXkgPSBvcHRpb25zLmRlbGF5ID8/IDEwMDtcblx0fVxuXG5cdG92ZXJyaWRlIGZpcmUoZXZlbnQ6IFQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhbmRsZSkge1xuXHRcdFx0dGhpcy5wYXVzZSgpO1xuXHRcdFx0dGhpcy5faGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5yZXN1bWUoKTtcblx0XHRcdH0sIHRoaXMuX2RlbGF5KTtcblx0XHR9XG5cdFx0c3VwZXIuZmlyZShldmVudCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBbiBlbWl0dGVyIHdoaWNoIHF1ZXVlIGFsbCBldmVudHMgYW5kIHRoZW4gcHJvY2VzcyB0aGVtIGF0IHRoZVxuICogZW5kIG9mIHRoZSBldmVudCBsb29wLlxuICovXG5leHBvcnQgY2xhc3MgTWljcm90YXNrRW1pdHRlcjxUPiBleHRlbmRzIEVtaXR0ZXI8VD4ge1xuXHRwcml2YXRlIF9xdWV1ZWRFdmVudHM6IFRbXSA9IFtdO1xuXHRwcml2YXRlIF9tZXJnZUZuPzogKGlucHV0OiBUW10pID0+IFQ7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9ucz86IEVtaXR0ZXJPcHRpb25zICYgeyBtZXJnZT86IChpbnB1dDogVFtdKSA9PiBUIH0pIHtcblx0XHRzdXBlcihvcHRpb25zKTtcblx0XHR0aGlzLl9tZXJnZUZuID0gb3B0aW9ucz8ubWVyZ2U7XG5cdH1cblx0b3ZlcnJpZGUgZmlyZShldmVudDogVCk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLmhhc0xpc3RlbmVycygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcXVldWVkRXZlbnRzLnB1c2goZXZlbnQpO1xuXHRcdGlmICh0aGlzLl9xdWV1ZWRFdmVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9tZXJnZUZuKSB7XG5cdFx0XHRcdFx0c3VwZXIuZmlyZSh0aGlzLl9tZXJnZUZuKHRoaXMuX3F1ZXVlZEV2ZW50cykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3F1ZXVlZEV2ZW50cy5mb3JFYWNoKGUgPT4gc3VwZXIuZmlyZShlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcXVldWVkRXZlbnRzID0gW107XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBbiBldmVudCBlbWl0dGVyIHRoYXQgbXVsdGlwbGV4ZXMgbWFueSBldmVudHMgaW50byBhIHNpbmdsZSBldmVudC5cbiAqXG4gKiBAZXhhbXBsZSBMaXN0ZW4gdG8gdGhlIGBvbkRhdGFgIGV2ZW50IG9mIGFsbCBgVGhpbmdgcywgZHluYW1pY2FsbHkgYWRkaW5nIGFuZCByZW1vdmluZyBgVGhpbmdgc1xuICogdG8gdGhlIG11bHRpcGxleGVyIGFzIG5lZWRlZC5cbiAqXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBhbnl0aGluZ0RhdGFNdWx0aXBsZXhlciA9IG5ldyBFdmVudE11bHRpcGxleGVyPHsgZGF0YTogc3RyaW5nIH0+KCk7XG4gKlxuICogY29uc3QgdGhpbmdMaXN0ZW5lcnMgPSBEaXNwb3NhYmxlTWFwPFRoaW5nLCBJRGlzcG9zYWJsZT4oKTtcbiAqXG4gKiB0aGluZ1NlcnZpY2Uub25EaWRBZGRUaGluZyh0aGluZyA9PiB7XG4gKiAgIHRoaW5nTGlzdGVuZXJzLnNldCh0aGluZywgYW55dGhpbmdEYXRhTXVsdGlwbGV4ZXIuYWRkKHRoaW5nLm9uRGF0YSk7XG4gKiB9KTtcbiAqIHRoaW5nU2VydmljZS5vbkRpZFJlbW92ZVRoaW5nKHRoaW5nID0+IHtcbiAqICAgdGhpbmdMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZSh0aGluZyk7XG4gKiB9KTtcbiAqXG4gKiBhbnl0aGluZ0RhdGFNdWx0aXBsZXhlci5ldmVudChlID0+IHtcbiAqICAgY29uc29sZS5sb2coJ1NvbWV0aGluZyBmaXJlZCBkYXRhICcgKyBlLmRhdGEpXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgRXZlbnRNdWx0aXBsZXhlcjxUPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVtaXR0ZXI6IEVtaXR0ZXI8VD47XG5cdHByaXZhdGUgaGFzTGlzdGVuZXJzID0gZmFsc2U7XG5cdHByaXZhdGUgZXZlbnRzOiB7IGV2ZW50OiBFdmVudDxUPjsgbGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgbnVsbCB9W10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPih7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB0aGlzLm9uRmlyc3RMaXN0ZW5lckFkZCgpLFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHRoaXMub25MYXN0TGlzdGVuZXJSZW1vdmUoKVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IGV2ZW50KCk6IEV2ZW50PFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5lbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0YWRkKGV2ZW50OiBFdmVudDxUPik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBlID0geyBldmVudDogZXZlbnQsIGxpc3RlbmVyOiBudWxsIH07XG5cdFx0dGhpcy5ldmVudHMucHVzaChlKTtcblxuXHRcdGlmICh0aGlzLmhhc0xpc3RlbmVycykge1xuXHRcdFx0dGhpcy5ob29rKGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2UgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5oYXNMaXN0ZW5lcnMpIHtcblx0XHRcdFx0dGhpcy51bmhvb2soZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuZXZlbnRzLmluZGV4T2YoZSk7XG5cdFx0XHR0aGlzLmV2ZW50cy5zcGxpY2UoaWR4LCAxKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZShjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oZGlzcG9zZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZpcnN0TGlzdGVuZXJBZGQoKTogdm9pZCB7XG5cdFx0dGhpcy5oYXNMaXN0ZW5lcnMgPSB0cnVlO1xuXHRcdHRoaXMuZXZlbnRzLmZvckVhY2goZSA9PiB0aGlzLmhvb2soZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkxhc3RMaXN0ZW5lclJlbW92ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmhhc0xpc3RlbmVycyA9IGZhbHNlO1xuXHRcdHRoaXMuZXZlbnRzLmZvckVhY2goZSA9PiB0aGlzLnVuaG9vayhlKSk7XG5cdH1cblxuXHRwcml2YXRlIGhvb2soZTogeyBldmVudDogRXZlbnQ8VD47IGxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGwgfSk6IHZvaWQge1xuXHRcdGUubGlzdGVuZXIgPSBlLmV2ZW50KHIgPT4gdGhpcy5lbWl0dGVyLmZpcmUocikpO1xuXHR9XG5cblx0cHJpdmF0ZSB1bmhvb2soZTogeyBldmVudDogRXZlbnQ8VD47IGxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGwgfSk6IHZvaWQge1xuXHRcdGUubGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRlLmxpc3RlbmVyID0gbnVsbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5lbWl0dGVyLmRpc3Bvc2UoKTtcblxuXHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLmV2ZW50cykge1xuXHRcdFx0ZS5saXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLmV2ZW50cyA9IFtdO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUR5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlcjxURXZlbnRUeXBlPiBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZXZlbnQ6IEV2ZW50PFRFdmVudFR5cGU+O1xufVxuZXhwb3J0IGNsYXNzIER5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlcjxUSXRlbSwgVEV2ZW50VHlwZT4gaW1wbGVtZW50cyBJRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyPFRFdmVudFR5cGU+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cmVhZG9ubHkgZXZlbnQ6IEV2ZW50PFRFdmVudFR5cGU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGl0ZW1zOiBUSXRlbVtdLFxuXHRcdG9uQWRkSXRlbTogRXZlbnQ8VEl0ZW0+LFxuXHRcdG9uUmVtb3ZlSXRlbTogRXZlbnQ8VEl0ZW0+LFxuXHRcdGdldEV2ZW50OiAoaXRlbTogVEl0ZW0pID0+IEV2ZW50PFRFdmVudFR5cGU+XG5cdCkge1xuXHRcdGNvbnN0IG11bHRpcGxleGVyID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFdmVudE11bHRpcGxleGVyPFRFdmVudFR5cGU+KCkpO1xuXHRcdGNvbnN0IGl0ZW1MaXN0ZW5lcnMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVNYXA8VEl0ZW0sIElEaXNwb3NhYmxlPigpKTtcblxuXHRcdGZ1bmN0aW9uIGFkZEl0ZW0oaW5zdGFuY2U6IFRJdGVtKSB7XG5cdFx0XHRpdGVtTGlzdGVuZXJzLnNldChpbnN0YW5jZSwgbXVsdGlwbGV4ZXIuYWRkKGdldEV2ZW50KGluc3RhbmNlKSkpO1xuXHRcdH1cblxuXHRcdC8vIEV4aXN0aW5nIGl0ZW1zXG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBpdGVtcykge1xuXHRcdFx0YWRkSXRlbShpbnN0YW5jZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkZWQgaXRlbXNcblx0XHR0aGlzLl9zdG9yZS5hZGQob25BZGRJdGVtKGluc3RhbmNlID0+IHtcblx0XHRcdGFkZEl0ZW0oaW5zdGFuY2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlbW92ZWQgaXRlbXNcblx0XHR0aGlzLl9zdG9yZS5hZGQob25SZW1vdmVJdGVtKGluc3RhbmNlID0+IHtcblx0XHRcdGl0ZW1MaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShpbnN0YW5jZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5ldmVudCA9IG11bHRpcGxleGVyLmV2ZW50O1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgRXZlbnRCdWZmZXJlciBpcyB1c2VmdWwgaW4gc2l0dWF0aW9ucyBpbiB3aGljaCB5b3Ugd2FudFxuICogdG8gZGVsYXkgZmlyaW5nIHlvdXIgZXZlbnRzIGR1cmluZyBzb21lIGNvZGUuXG4gKiBZb3UgY2FuIHdyYXAgdGhhdCBjb2RlIGFuZCBiZSBzdXJlIHRoYXQgdGhlIGV2ZW50IHdpbGwgbm90XG4gKiBiZSBmaXJlZCBkdXJpbmcgdGhhdCB3cmFwLlxuICpcbiAqIGBgYFxuICogY29uc3QgZW1pdHRlcjogRW1pdHRlcjtcbiAqIGNvbnN0IGRlbGF5ZXIgPSBuZXcgRXZlbnREZWxheWVyKCk7XG4gKiBjb25zdCBkZWxheWVkRXZlbnQgPSBkZWxheWVyLndyYXBFdmVudChlbWl0dGVyLmV2ZW50KTtcbiAqXG4gKiBkZWxheWVkRXZlbnQoY29uc29sZS5sb2cpO1xuICpcbiAqIGRlbGF5ZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcbiAqICAgZW1pdHRlci5maXJlKCk7IC8vIGV2ZW50IHdpbGwgbm90IGJlIGZpcmVkIHlldFxuICogfSk7XG4gKlxuICogLy8gZXZlbnQgd2lsbCBvbmx5IGJlIGZpcmVkIGF0IHRoaXMgcG9pbnRcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgRXZlbnRCdWZmZXJlciB7XG5cblx0cHJpdmF0ZSBkYXRhOiB7IGJ1ZmZlcnM6IEZ1bmN0aW9uW10gfVtdID0gW107XG5cblx0d3JhcEV2ZW50PFQ+KGV2ZW50OiBFdmVudDxUPik6IEV2ZW50PFQ+O1xuXHR3cmFwRXZlbnQ8VD4oZXZlbnQ6IEV2ZW50PFQ+LCByZWR1Y2U6IChsYXN0OiBUIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gVCk6IEV2ZW50PFQ+O1xuXHR3cmFwRXZlbnQ8VCwgTz4oZXZlbnQ6IEV2ZW50PFQ+LCByZWR1Y2U6IChsYXN0OiBPIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gTywgaW5pdGlhbDogTyk6IEV2ZW50PE8+O1xuXHR3cmFwRXZlbnQ8VCwgTz4oZXZlbnQ6IEV2ZW50PFQ+LCByZWR1Y2U/OiAobGFzdDogVCB8IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBUKSA9PiBUIHwgTywgaW5pdGlhbD86IE8pOiBFdmVudDxPIHwgVD4ge1xuXHRcdHJldHVybiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiB7XG5cdFx0XHRyZXR1cm4gZXZlbnQoaSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmRhdGFbdGhpcy5kYXRhLmxlbmd0aCAtIDFdO1xuXG5cdFx0XHRcdC8vIE5vbi1yZWR1Y2Ugc2NlbmFyaW9cblx0XHRcdFx0aWYgKCFyZWR1Y2UpIHtcblx0XHRcdFx0XHQvLyBCdWZmZXJpbmcgY2FzZVxuXHRcdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0XHRkYXRhLmJ1ZmZlcnMucHVzaCgoKSA9PiBsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCBpKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE5vdCBidWZmZXJpbmcgY2FzZVxuXHRcdFx0XHRcdFx0bGlzdGVuZXIuY2FsbCh0aGlzQXJncywgaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlZHVjZSBzY2VuYXJpb1xuXHRcdFx0XHRjb25zdCByZWR1Y2VEYXRhID0gZGF0YSBhcyB0eXBlb2YgZGF0YSAmIHtcblx0XHRcdFx0XHQvKipcblx0XHRcdFx0XHQgKiBUaGUgYWNjdW11bGF0ZWQgaXRlbXMgdGhhdCB3aWxsIGJlIHJlZHVjZWQuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0aXRlbXM/OiBUW107XG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIHJlZHVjZWQgcmVzdWx0IGNhY2hlZCB0byBiZSBzaGFyZWQgd2l0aCBvdGhlciBsaXN0ZW5lcnMuXG5cdFx0XHRcdFx0ICovXG5cdFx0XHRcdFx0cmVkdWNlZFJlc3VsdD86IFQgfCBPO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIE5vdCBidWZmZXJpbmcgY2FzZVxuXHRcdFx0XHRpZiAoIXJlZHVjZURhdGEpIHtcblx0XHRcdFx0XHQvLyBUT0RPOiBJcyB0aGVyZSBhIHdheSB0byBjYWNoZSB0aGlzIHJlZHVjZSBjYWxsIGZvciBhbGwgbGlzdGVuZXJzP1xuXHRcdFx0XHRcdGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIHJlZHVjZShpbml0aWFsLCBpKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQnVmZmVyaW5nIGNhc2Vcblx0XHRcdFx0cmVkdWNlRGF0YS5pdGVtcyA/Pz0gW107XG5cdFx0XHRcdHJlZHVjZURhdGEuaXRlbXMucHVzaChpKTtcblx0XHRcdFx0aWYgKHJlZHVjZURhdGEuYnVmZmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBJbmNsdWRlIGEgc2luZ2xlIGJ1ZmZlcmVkIGZ1bmN0aW9uIHRoYXQgd2lsbCByZWR1Y2UgYWxsIGV2ZW50cyB3aGVuIHdlJ3JlIGRvbmUgYnVmZmVyaW5nIGV2ZW50c1xuXHRcdFx0XHRcdGRhdGEuYnVmZmVycy5wdXNoKCgpID0+IHtcblx0XHRcdFx0XHRcdC8vIGNhY2hlIHRoZSByZWR1Y2VkIHJlc3VsdCBzbyB0aGF0IHRoZSB2YWx1ZSBjYW4gYmUgc2hhcmVkIGFjcm9zcyBhbGwgbGlzdGVuZXJzXG5cdFx0XHRcdFx0XHRyZWR1Y2VEYXRhLnJlZHVjZWRSZXN1bHQgPz89IGluaXRpYWxcblx0XHRcdFx0XHRcdFx0PyByZWR1Y2VEYXRhLml0ZW1zIS5yZWR1Y2UocmVkdWNlIGFzIChsYXN0OiBPIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gTywgaW5pdGlhbClcblx0XHRcdFx0XHRcdFx0OiByZWR1Y2VEYXRhLml0ZW1zIS5yZWR1Y2UocmVkdWNlIGFzIChsYXN0OiBUIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gVCk7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCByZWR1Y2VEYXRhLnJlZHVjZWRSZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHR9O1xuXHR9XG5cblx0YnVmZmVyRXZlbnRzPFIgPSB2b2lkPihmbjogKCkgPT4gUik6IFIge1xuXHRcdGNvbnN0IGRhdGEgPSB7IGJ1ZmZlcnM6IG5ldyBBcnJheTxGdW5jdGlvbj4oKSB9O1xuXHRcdHRoaXMuZGF0YS5wdXNoKGRhdGEpO1xuXHRcdGNvbnN0IHIgPSBmbigpO1xuXHRcdHRoaXMuZGF0YS5wb3AoKTtcblx0XHRkYXRhLmJ1ZmZlcnMuZm9yRWFjaChmbHVzaCA9PiBmbHVzaCgpKTtcblx0XHRyZXR1cm4gcjtcblx0fVxufVxuXG4vKipcbiAqIEEgUmVsYXkgaXMgYW4gZXZlbnQgZm9yd2FyZGVyIHdoaWNoIGZ1bmN0aW9ucyBhcyBhIHJlcGx1Z2FiYmxlIGV2ZW50IHBpcGUuXG4gKiBPbmNlIGNyZWF0ZWQsIHlvdSBjYW4gY29ubmVjdCBhbiBpbnB1dCBldmVudCB0byBpdCBhbmQgaXQgd2lsbCBzaW1wbHkgZm9yd2FyZFxuICogZXZlbnRzIGZyb20gdGhhdCBpbnB1dCBldmVudCB0aHJvdWdoIGl0cyBvd24gYGV2ZW50YCBwcm9wZXJ0eS4gVGhlIGBpbnB1dGBcbiAqIGNhbiBiZSBjaGFuZ2VkIGF0IGFueSBwb2ludCBpbiB0aW1lLlxuICovXG5leHBvcnQgY2xhc3MgUmVsYXk8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBsaXN0ZW5pbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBpbnB1dEV2ZW50OiBFdmVudDxUPiA9IEV2ZW50Lk5vbmU7XG5cdHByaXZhdGUgaW5wdXRFdmVudExpc3RlbmVyOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPih7XG5cdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHR0aGlzLmxpc3RlbmluZyA9IHRydWU7XG5cdFx0XHR0aGlzLmlucHV0RXZlbnRMaXN0ZW5lciA9IHRoaXMuaW5wdXRFdmVudCh0aGlzLmVtaXR0ZXIuZmlyZSwgdGhpcy5lbWl0dGVyKTtcblx0XHR9LFxuXHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHR0aGlzLmxpc3RlbmluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pbnB1dEV2ZW50TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVhZG9ubHkgZXZlbnQ6IEV2ZW50PFQ+ID0gdGhpcy5lbWl0dGVyLmV2ZW50O1xuXG5cdHNldCBpbnB1dChldmVudDogRXZlbnQ8VD4pIHtcblx0XHR0aGlzLmlucHV0RXZlbnQgPSBldmVudDtcblxuXHRcdGlmICh0aGlzLmxpc3RlbmluZykge1xuXHRcdFx0dGhpcy5pbnB1dEV2ZW50TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5pbnB1dEV2ZW50TGlzdGVuZXIgPSBldmVudCh0aGlzLmVtaXR0ZXIuZmlyZSwgdGhpcy5lbWl0dGVyKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuaW5wdXRFdmVudExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVtaXR0ZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZhbHVlV2l0aENoYW5nZUV2ZW50PFQ+IHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXHRnZXQgdmFsdWUoKTogVDtcbn1cblxuZXhwb3J0IGNsYXNzIFZhbHVlV2l0aENoYW5nZUV2ZW50PFQ+IGltcGxlbWVudHMgSVZhbHVlV2l0aENoYW5nZUV2ZW50PFQ+IHtcblx0cHVibGljIHN0YXRpYyBjb25zdDxUPih2YWx1ZTogVCk6IElWYWx1ZVdpdGhDaGFuZ2VFdmVudDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBDb25zdFZhbHVlV2l0aENoYW5nZUV2ZW50KHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfdmFsdWU6IFQpIHsgfVxuXG5cdGdldCB2YWx1ZSgpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdH1cblxuXHRzZXQgdmFsdWUodmFsdWU6IFQpIHtcblx0XHRpZiAodmFsdWUgIT09IHRoaXMuX3ZhbHVlKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBDb25zdFZhbHVlV2l0aENoYW5nZUV2ZW50PFQ+IGltcGxlbWVudHMgSVZhbHVlV2l0aENoYW5nZUV2ZW50PFQ+IHtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdmFsdWU6IFQpIHsgfVxufVxuXG4vKipcbiAqIEBwYXJhbSBoYW5kbGVJdGVtIElzIGNhbGxlZCBmb3IgZWFjaCBpdGVtIGluIHRoZSBzZXQgKGJ1dCBvbmx5IHRoZSBmaXJzdCB0aW1lIHRoZSBpdGVtIGlzIHNlZW4gaW4gdGhlIHNldCkuXG4gKiBcdFRoZSByZXR1cm5lZCBkaXNwb3NhYmxlIGlzIGRpc3Bvc2VkIGlmIHRoZSBpdGVtIGlzIG5vIGxvbmdlciBpbiB0aGUgc2V0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHJhY2tTZXRDaGFuZ2VzPFQ+KGdldERhdGE6ICgpID0+IFJlYWRvbmx5U2V0PFQ+LCBvbkRpZENoYW5nZURhdGE6IEV2ZW50PHVua25vd24+LCBoYW5kbGVJdGVtOiAoZDogVCkgPT4gSURpc3Bvc2FibGUpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG1hcCA9IG5ldyBEaXNwb3NhYmxlTWFwPFQsIElEaXNwb3NhYmxlPigpO1xuXHRsZXQgb2xkRGF0YSA9IG5ldyBTZXQoZ2V0RGF0YSgpKTtcblx0Zm9yIChjb25zdCBkIG9mIG9sZERhdGEpIHtcblx0XHRtYXAuc2V0KGQsIGhhbmRsZUl0ZW0oZCkpO1xuXHR9XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHN0b3JlLmFkZChvbkRpZENoYW5nZURhdGEoKCkgPT4ge1xuXHRcdGNvbnN0IG5ld0RhdGEgPSBnZXREYXRhKCk7XG5cdFx0Y29uc3QgZGlmZiA9IGRpZmZTZXRzKG9sZERhdGEsIG5ld0RhdGEpO1xuXHRcdGZvciAoY29uc3QgciBvZiBkaWZmLnJlbW92ZWQpIHtcblx0XHRcdG1hcC5kZWxldGVBbmREaXNwb3NlKHIpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGEgb2YgZGlmZi5hZGRlZCkge1xuXHRcdFx0bWFwLnNldChhLCBoYW5kbGVJdGVtKGEpKTtcblx0XHR9XG5cdFx0b2xkRGF0YSA9IG5ldyBTZXQobmV3RGF0YSk7XG5cdH0pKTtcblx0c3RvcmUuYWRkKG1hcCk7XG5cdHJldHVybiBzdG9yZTtcbn1cblxuXG5mdW5jdGlvbiBhZGRUb0Rpc3Bvc2FibGVzKHJlc3VsdDogSURpc3Bvc2FibGUsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfCBJRGlzcG9zYWJsZVtdIHwgdW5kZWZpbmVkKSB7XG5cdGlmIChkaXNwb3NhYmxlcyBpbnN0YW5jZW9mIERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZXN1bHQpO1xuXHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGlzcG9zYWJsZXMpKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChyZXN1bHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGRpc3Bvc2VBbmRSZW1vdmUocmVzdWx0OiBJRGlzcG9zYWJsZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB8IElEaXNwb3NhYmxlW10gfCB1bmRlZmluZWQpIHtcblx0aWYgKGRpc3Bvc2FibGVzIGluc3RhbmNlb2YgRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0ZGlzcG9zYWJsZXMuZGVsZXRlKHJlc3VsdCk7XG5cdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkaXNwb3NhYmxlcykpIHtcblx0XHRjb25zdCBpbmRleCA9IGRpc3Bvc2FibGVzLmluZGV4T2YocmVzdWx0KTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0fVxuXHRyZXN1bHQuZGlzcG9zZSgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0IsWUFBWSxlQUFlLGlCQUE4QixvQkFBb0I7QUFDMUcsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUJBQWlCO0FBTzFCLE1BQU0sb0NBQW9DO0FBUzFDLE1BQU0sc0NBQXNDO0FBSzVDLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sK0JBQStCO0FBRXJDLFNBQVMsOEJBQXVDO0FBQy9DLFNBQU8sQ0FBQyxDQUFDLElBQUksWUFBWTtBQUMxQjtBQVNPLElBQVU7QUFBQSxDQUFWLENBQVVBLFdBQVY7QUFDQyxFQUFNQSxPQUFBLE9BQW1CLE1BQU0sV0FBVztBQUVqRCxXQUFTLHNCQUFzQixTQUF5QjtBQUN2RCxRQUFJLHFDQUFxQztBQUN4QyxZQUFNLEVBQUUsa0JBQWtCLG1CQUFtQixJQUFJO0FBQ2pELFlBQU0sUUFBUSxXQUFXLE9BQU87QUFDaEMsVUFBSSxRQUFRO0FBQ1osY0FBUSxtQkFBbUIsTUFBTTtBQUNoQyxZQUFJLEVBQUUsVUFBVSxHQUFHO0FBQ2xCLGtCQUFRLEtBQUssNEdBQTRHO0FBQ3pILGdCQUFNLE1BQU07QUFBQSxRQUNiO0FBQ0EsNkJBQXFCO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQXFCTyxXQUFTLE1BQU0sT0FBdUIsdUJBQWlDLFlBQTJDO0FBQ3hILFdBQU8sU0FBd0IsT0FBTyxNQUFNLFFBQVEsR0FBRyxRQUFXLHlCQUF5QixNQUFNLFFBQVcsVUFBVTtBQUFBLEVB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QUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksTUFBTSxPQUFVO0FBQ25CLFFBQUksVUFBVSxLQUFLLFFBQVE7QUFDMUIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxhQUFhLEtBQUssTUFBUztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSwwQkFBaUU7QUFBQSxFQUd0RSxZQUFxQixPQUFVO0FBQVY7QUFGckIsU0FBZ0IsY0FBMkIsTUFBTTtBQUFBLEVBRWhCO0FBQ2xDO0FBTU8sU0FBUyxnQkFBbUIsU0FBK0IsaUJBQWlDLFlBQWdEO0FBQ2xKLFFBQU0sTUFBTSxJQUFJLGNBQThCO0FBQzlDLE1BQUksVUFBVSxJQUFJLElBQUksUUFBUSxDQUFDO0FBQy9CLGFBQVcsS0FBSyxTQUFTO0FBQ3hCLFFBQUksSUFBSSxHQUFHLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDekI7QUFFQSxRQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsUUFBTSxJQUFJLGdCQUFnQixNQUFNO0FBQy9CLFVBQU0sVUFBVSxRQUFRO0FBQ3hCLFVBQU0sT0FBTyxTQUFTLFNBQVMsT0FBTztBQUN0QyxlQUFXLEtBQUssS0FBSyxTQUFTO0FBQzdCLFVBQUksaUJBQWlCLENBQUM7QUFBQSxJQUN2QjtBQUNBLGVBQVcsS0FBSyxLQUFLLE9BQU87QUFDM0IsVUFBSSxJQUFJLEdBQUcsV0FBVyxDQUFDLENBQUM7QUFBQSxJQUN6QjtBQUNBLGNBQVUsSUFBSSxJQUFJLE9BQU87QUFBQSxFQUMxQixDQUFDLENBQUM7QUFDRixRQUFNLElBQUksR0FBRztBQUNiLFNBQU87QUFDUjtBQUdBLFNBQVMsaUJBQWlCLFFBQXFCLGFBQTBEO0FBQ3hHLE1BQUksdUJBQXVCLGlCQUFpQjtBQUMzQyxnQkFBWSxJQUFJLE1BQU07QUFBQSxFQUN2QixXQUFXLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFDdEMsZ0JBQVksS0FBSyxNQUFNO0FBQUEsRUFDeEI7QUFDRDtBQUVBLFNBQVMsaUJBQWlCLFFBQXFCLGFBQTBEO0FBQ3hHLE1BQUksdUJBQXVCLGlCQUFpQjtBQUMzQyxnQkFBWSxPQUFPLE1BQU07QUFBQSxFQUMxQixXQUFXLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFDdEMsVUFBTSxRQUFRLFlBQVksUUFBUSxNQUFNO0FBQ3hDLFFBQUksVUFBVSxJQUFJO0FBQ2pCLGtCQUFZLE9BQU8sT0FBTyxDQUFDO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQ0EsU0FBTyxRQUFRO0FBQ2hCOyIsCiAgIm5hbWVzIjogWyJFdmVudCIsICJtYXAiLCAiZmlsdGVyIiwgImJ1ZmZlciIsICJpZCIsICJjb3VudCIsICJkYXRhIl0KfQo=
