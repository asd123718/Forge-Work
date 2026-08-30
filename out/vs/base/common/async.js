import { CancellationTokenSource } from "./cancellation.js";
import { BugIndicatingError, CancellationError, isCancellationError } from "./errors.js";
import { Emitter, Event } from "./event.js";
import { Disposable, DisposableMap, isDisposable, MutableDisposable, toDisposable } from "./lifecycle.js";
import { extUri as defaultExtUri } from "./resources.js";
import { setTimeout0 } from "./platform.js";
import { MicrotaskDelay } from "./symbols.js";
import { Lazy } from "./lazy.js";
function isThenable(obj) {
  return !!obj && typeof obj.then === "function";
}
function createCancelablePromise(callback) {
  const source = new CancellationTokenSource();
  const thenable = callback(source.token);
  let isCancelled = false;
  const promise = new Promise((resolve, reject) => {
    const subscription = source.token.onCancellationRequested(() => {
      isCancelled = true;
      subscription.dispose();
      reject(new CancellationError());
    });
    Promise.resolve(thenable).then((value) => {
      subscription.dispose();
      source.dispose();
      if (!isCancelled) {
        resolve(value);
      } else if (isDisposable(value)) {
        value.dispose();
      }
    }, (err) => {
      subscription.dispose();
      source.dispose();
      reject(err);
    });
  });
  return new class {
    cancel() {
      source.cancel();
      source.dispose();
    }
    then(resolve, reject) {
      return promise.then(resolve, reject);
    }
    catch(reject) {
      return this.then(void 0, reject);
    }
    finally(onfinally) {
      return promise.finally(onfinally);
    }
  }();
}
function raceCancellation(promise, token, defaultValue) {
  return new Promise((resolve, reject) => {
    const ref = token.onCancellationRequested(() => {
      ref.dispose();
      resolve(defaultValue);
    });
    promise.then(resolve, reject).finally(() => ref.dispose());
  });
}
function raceCancellationError(promise, token) {
  return new Promise((resolve, reject) => {
    const ref = token.onCancellationRequested(() => {
      ref.dispose();
      reject(new CancellationError());
    });
    promise.then(resolve, reject).finally(() => ref.dispose());
  });
}
function rejectIfNotCanceled(err) {
  if (isCancellationError(err)) {
    return void 0;
  }
  return Promise.reject(err);
}
function notCancellablePromise(promise) {
  return new Promise((resolve, reject) => {
    promise.then(resolve, reject);
  });
}
function raceCancellablePromises(cancellablePromises) {
  let resolvedPromiseIndex = -1;
  const promises = cancellablePromises.map((promise2, index) => promise2.then((result) => {
    resolvedPromiseIndex = index;
    return result;
  }));
  const promise = Promise.race(promises);
  promise.cancel = () => {
    cancellablePromises.forEach((cancellablePromise, index) => {
      if (index !== resolvedPromiseIndex && cancellablePromise.cancel) {
        cancellablePromise.cancel();
      }
    });
  };
  const cancel = () => promise.cancel();
  promise.then(cancel, cancel);
  return promise;
}
function raceTimeout(promise, timeout2, onTimeout) {
  let promiseResolve = void 0;
  const timer = setTimeout(() => {
    promiseResolve?.(void 0);
    onTimeout?.();
  }, timeout2);
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => promiseResolve = resolve)
  ]);
}
function asPromise(callback) {
  return new Promise((resolve, reject) => {
    const item = callback();
    if (isThenable(item)) {
      item.then(resolve, reject);
    } else {
      resolve(item);
    }
  });
}
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
class Throttler {
  constructor() {
    this.activePromise = null;
    this.queuedPromise = null;
    this.queuedPromiseFactory = null;
    this.cancellationTokenSource = new CancellationTokenSource();
  }
  queue(promiseFactory) {
    if (this.cancellationTokenSource.token.isCancellationRequested) {
      return Promise.reject(new Error("Throttler is disposed"));
    }
    if (this.activePromise) {
      this.queuedPromiseFactory = promiseFactory;
      if (!this.queuedPromise) {
        const onComplete = () => {
          this.queuedPromise = null;
          if (this.cancellationTokenSource.token.isCancellationRequested) {
            return;
          }
          const result = this.queue(this.queuedPromiseFactory);
          this.queuedPromiseFactory = null;
          return result;
        };
        this.queuedPromise = new Promise((resolve) => {
          this.activePromise.then(onComplete, onComplete).then(resolve);
        });
      }
      return new Promise((resolve, reject) => {
        this.queuedPromise.then(resolve, reject);
      });
    }
    this.activePromise = promiseFactory(this.cancellationTokenSource.token);
    return new Promise((resolve, reject) => {
      this.activePromise.then((result) => {
        this.activePromise = null;
        resolve(result);
      }, (err) => {
        this.activePromise = null;
        reject(err);
      });
    });
  }
  dispose() {
    this.cancellationTokenSource.cancel();
  }
}
class Sequencer {
  constructor() {
    this.current = Promise.resolve(null);
  }
  queue(promiseTask) {
    return this.current = this.current.then(() => promiseTask(), () => promiseTask());
  }
}
class ThrottlerByKey {
  constructor() {
    this.throttlers = /* @__PURE__ */ new Map();
  }
  queue(key, task) {
    let entry = this.throttlers.get(key);
    if (!entry) {
      entry = { throttler: new Throttler(), count: 0 };
      this.throttlers.set(key, entry);
    }
    entry.count++;
    return entry.throttler.queue(task).finally(() => {
      if (--entry.count === 0) {
        entry.throttler.dispose();
        this.throttlers.delete(key);
      }
    });
  }
  dispose() {
    for (const { throttler } of this.throttlers.values()) {
      throttler.dispose();
    }
    this.throttlers.clear();
  }
}
class SequencerByKey {
  constructor() {
    this.promiseMap = /* @__PURE__ */ new Map();
  }
  queue(key, promiseTask) {
    const runningPromise = this.promiseMap.get(key) ?? Promise.resolve();
    const newPromise = runningPromise.catch(() => {
    }).then(promiseTask).finally(() => {
      if (this.promiseMap.get(key) === newPromise) {
        this.promiseMap.delete(key);
      }
    });
    this.promiseMap.set(key, newPromise);
    return newPromise;
  }
  peek(key) {
    return this.promiseMap.get(key) || void 0;
  }
  keys() {
    return this.promiseMap.keys();
  }
}
const timeoutDeferred = (timeout2, fn) => {
  let scheduled = true;
  const handle = setTimeout(() => {
    scheduled = false;
    fn();
  }, timeout2);
  return {
    isTriggered: () => scheduled,
    dispose: () => {
      clearTimeout(handle);
      scheduled = false;
    }
  };
};
const microtaskDeferred = (fn) => {
  let scheduled = true;
  queueMicrotask(() => {
    if (scheduled) {
      scheduled = false;
      fn();
    }
  });
  return {
    isTriggered: () => scheduled,
    dispose: () => {
      scheduled = false;
    }
  };
};
class Delayer {
  constructor(defaultDelay) {
    this.defaultDelay = defaultDelay;
    this.deferred = null;
    this.completionPromise = null;
    this.doResolve = null;
    this.doReject = null;
    this.task = null;
  }
  trigger(task, delay = this.defaultDelay) {
    this.task = task;
    this.cancelTimeout();
    if (!this.completionPromise) {
      this.completionPromise = new Promise((resolve, reject) => {
        this.doResolve = resolve;
        this.doReject = reject;
      }).then(() => {
        this.completionPromise = null;
        this.doResolve = null;
        if (this.task) {
          const task2 = this.task;
          this.task = null;
          return task2();
        }
        return void 0;
      });
    }
    const fn = () => {
      this.deferred = null;
      this.doResolve?.(null);
    };
    this.deferred = delay === MicrotaskDelay ? microtaskDeferred(fn) : timeoutDeferred(delay, fn);
    return this.completionPromise;
  }
  isTriggered() {
    return !!this.deferred?.isTriggered();
  }
  cancel() {
    this.cancelTimeout();
    if (this.completionPromise) {
      this.doReject?.(new CancellationError());
      this.completionPromise = null;
    }
  }
  cancelTimeout() {
    this.deferred?.dispose();
    this.deferred = null;
  }
  dispose() {
    this.cancel();
  }
}
class ThrottledDelayer {
  constructor(defaultDelay) {
    this.delayer = new Delayer(defaultDelay);
    this.throttler = new Throttler();
  }
  trigger(promiseFactory, delay) {
    return this.delayer.trigger(() => this.throttler.queue(promiseFactory), delay);
  }
  isTriggered() {
    return this.delayer.isTriggered();
  }
  cancel() {
    this.delayer.cancel();
  }
  dispose() {
    this.delayer.dispose();
    this.throttler.dispose();
  }
}
class Barrier {
  constructor() {
    this._isOpen = false;
    this._promise = new Promise((c, e) => {
      this._completePromise = c;
    });
  }
  isOpen() {
    return this._isOpen;
  }
  open() {
    this._isOpen = true;
    this._completePromise(true);
  }
  wait() {
    return this._promise;
  }
}
class AutoOpenBarrier extends Barrier {
  constructor(autoOpenTimeMs) {
    super();
    this._timeout = setTimeout(() => this.open(), autoOpenTimeMs);
  }
  open() {
    clearTimeout(this._timeout);
    super.open();
  }
}
function timeout(millis, token) {
  if (!token) {
    return createCancelablePromise((token2) => timeout(millis, token2));
  }
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      disposable.dispose();
      resolve();
    }, millis);
    const disposable = token.onCancellationRequested(() => {
      clearTimeout(handle);
      disposable.dispose();
      reject(new CancellationError());
    });
  });
}
function disposableTimeout(handler, timeout2 = 0, store) {
  const timer = setTimeout(() => {
    handler();
    if (store) {
      disposable.dispose();
    }
  }, timeout2);
  const disposable = toDisposable(() => {
    clearTimeout(timer);
    store?.delete(disposable);
  });
  store?.add(disposable);
  return disposable;
}
const MAX_TIMEOUT_DELAY = 2 ** 31 - 1;
function disposableLongTimeout(handler, timeout2, store) {
  const target = Date.now() + timeout2;
  let timer;
  const arm = () => {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      handler();
      if (store) {
        disposable.dispose();
      }
      return;
    }
    timer = setTimeout(arm, Math.min(remaining, MAX_TIMEOUT_DELAY));
  };
  const disposable = toDisposable(() => {
    clearTimeout(timer);
    store?.delete(disposable);
  });
  timer = setTimeout(arm, Math.min(Math.max(0, timeout2), MAX_TIMEOUT_DELAY));
  store?.add(disposable);
  return disposable;
}
function sequence(promiseFactories) {
  const results = [];
  let index = 0;
  const len = promiseFactories.length;
  function next() {
    return index < len ? promiseFactories[index++]() : null;
  }
  function thenHandler(result) {
    if (result !== void 0 && result !== null) {
      results.push(result);
    }
    const n = next();
    if (n) {
      return n.then(thenHandler);
    }
    return Promise.resolve(results);
  }
  return Promise.resolve(null).then(thenHandler);
}
function first(promiseFactories, shouldStop = (t) => !!t, defaultValue = null) {
  let index = 0;
  const len = promiseFactories.length;
  const loop = () => {
    if (index >= len) {
      return Promise.resolve(defaultValue);
    }
    const factory = promiseFactories[index++];
    const promise = Promise.resolve(factory());
    return promise.then((result) => {
      if (shouldStop(result)) {
        return Promise.resolve(result);
      }
      return loop();
    });
  };
  return loop();
}
function firstParallel(promiseList, shouldStop = (t) => !!t, defaultValue = null) {
  if (promiseList.length === 0) {
    return Promise.resolve(defaultValue);
  }
  let todo = promiseList.length;
  const finish = () => {
    todo = -1;
    for (const promise of promiseList) {
      promise.cancel?.();
    }
  };
  return new Promise((resolve, reject) => {
    for (const promise of promiseList) {
      promise.then((result) => {
        if (--todo >= 0 && shouldStop(result)) {
          finish();
          resolve(result);
        } else if (todo === 0) {
          resolve(defaultValue);
        }
      }).catch((err) => {
        if (--todo >= 0) {
          finish();
          reject(err);
        }
      });
    }
  });
}
class Limiter {
  constructor(maxDegreeOfParalellism) {
    this._size = 0;
    this._isDisposed = false;
    this.maxDegreeOfParalellism = maxDegreeOfParalellism;
    this.outstandingPromises = [];
    this.runningPromises = 0;
    this._onDrained = new Emitter();
  }
  /**
   *
   * @returns A promise that resolved when all work is done (onDrained) or when
   * there is nothing to do
   */
  whenIdle() {
    return this.size > 0 ? Event.toPromise(this.onDrained) : Promise.resolve();
  }
  get onDrained() {
    return this._onDrained.event;
  }
  get size() {
    return this._size;
  }
  queue(factory) {
    if (this._isDisposed) {
      throw new Error("Object has been disposed");
    }
    this._size++;
    return new Promise((c, e) => {
      this.outstandingPromises.push({ factory, c, e });
      this.consume();
    });
  }
  consume() {
    while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
      const iLimitedTask = this.outstandingPromises.shift();
      this.runningPromises++;
      const promise = iLimitedTask.factory();
      promise.then(iLimitedTask.c, iLimitedTask.e);
      promise.then(() => this.consumed(), () => this.consumed());
    }
  }
  consumed() {
    if (this._isDisposed) {
      return;
    }
    this.runningPromises--;
    if (--this._size === 0) {
      this._onDrained.fire();
    }
    if (this.outstandingPromises.length > 0) {
      this.consume();
    }
  }
  clear() {
    if (this._isDisposed) {
      throw new Error("Object has been disposed");
    }
    this.outstandingPromises.length = 0;
    this._size = this.runningPromises;
  }
  dispose() {
    this._isDisposed = true;
    this.outstandingPromises.length = 0;
    this._size = 0;
    this._onDrained.dispose();
  }
}
class Queue extends Limiter {
  constructor() {
    super(1);
  }
}
class LimitedQueue {
  constructor() {
    this.sequentializer = new TaskSequentializer();
    this.tasks = 0;
  }
  queue(factory) {
    if (!this.sequentializer.isRunning()) {
      return this.sequentializer.run(this.tasks++, factory());
    }
    return this.sequentializer.queue(() => {
      return this.sequentializer.run(this.tasks++, factory());
    });
  }
}
class ResourceQueue {
  constructor() {
    this.queues = /* @__PURE__ */ new Map();
    this.drainers = /* @__PURE__ */ new Set();
    this.drainListeners = void 0;
    this.drainListenerCount = 0;
  }
  async whenDrained() {
    if (this.isDrained()) {
      return;
    }
    const promise = new DeferredPromise();
    this.drainers.add(promise);
    return promise.p;
  }
  isDrained() {
    for (const [, queue] of this.queues) {
      if (queue.size > 0) {
        return false;
      }
    }
    return true;
  }
  queueSize(resource, extUri = defaultExtUri) {
    const key = extUri.getComparisonKey(resource);
    return this.queues.get(key)?.size ?? 0;
  }
  queueFor(resource, factory, extUri = defaultExtUri) {
    const key = extUri.getComparisonKey(resource);
    let queue = this.queues.get(key);
    if (!queue) {
      queue = new Queue();
      const drainListenerId = this.drainListenerCount++;
      const drainListener = Event.once(queue.onDrained)(() => {
        queue?.dispose();
        this.queues.delete(key);
        this.onDidQueueDrain();
        this.drainListeners?.deleteAndDispose(drainListenerId);
        if (this.drainListeners?.size === 0) {
          this.drainListeners.dispose();
          this.drainListeners = void 0;
        }
      });
      if (!this.drainListeners) {
        this.drainListeners = new DisposableMap();
      }
      this.drainListeners.set(drainListenerId, drainListener);
      this.queues.set(key, queue);
    }
    return queue.queue(factory);
  }
  onDidQueueDrain() {
    if (!this.isDrained()) {
      return;
    }
    this.releaseDrainers();
  }
  releaseDrainers() {
    for (const drainer of this.drainers) {
      drainer.complete();
    }
    this.drainers.clear();
  }
  dispose() {
    for (const [, queue] of this.queues) {
      queue.dispose();
    }
    this.queues.clear();
    this.releaseDrainers();
    this.drainListeners?.dispose();
  }
}
class TaskQueue {
  constructor() {
    this._runningTask = void 0;
    this._pendingTasks = [];
  }
  /**
   * Waits for the current and pending tasks to finish, then runs and awaits the given task.
   * If the task is skipped because of clearPending, the promise is rejected with a CancellationError.
  */
  schedule(task) {
    const deferred = new DeferredPromise();
    this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: false });
    this._runIfNotRunning();
    return deferred.p;
  }
  /**
   * Waits for the current and pending tasks to finish, then runs and awaits the given task.
   * If the task is skipped because of clearPending, the promise is resolved with undefined.
  */
  scheduleSkipIfCleared(task) {
    const deferred = new DeferredPromise();
    this._pendingTasks.push({ task, deferred, setUndefinedWhenCleared: true });
    this._runIfNotRunning();
    return deferred.p;
  }
  _runIfNotRunning() {
    if (this._runningTask === void 0) {
      this._processQueue();
    }
  }
  async _processQueue() {
    if (this._pendingTasks.length === 0) {
      return;
    }
    const next = this._pendingTasks.shift();
    if (!next) {
      return;
    }
    if (this._runningTask) {
      throw new BugIndicatingError();
    }
    this._runningTask = next.task;
    try {
      const result = await next.task();
      next.deferred.complete(result);
    } catch (e) {
      next.deferred.error(e);
    } finally {
      this._runningTask = void 0;
      this._processQueue();
    }
  }
  /**
   * Clears all pending tasks. Does not cancel the currently running task.
  */
  clearPending() {
    const tasks = this._pendingTasks;
    this._pendingTasks = [];
    for (const task of tasks) {
      if (task.setUndefinedWhenCleared) {
        task.deferred.complete(void 0);
      } else {
        task.deferred.error(new CancellationError());
      }
    }
  }
}
class TimeoutTimer {
  constructor(runner, timeout2) {
    this._isDisposed = false;
    this._token = void 0;
    if (typeof runner === "function" && typeof timeout2 === "number") {
      this.setIfNotSet(runner, timeout2);
    }
  }
  dispose() {
    this.cancel();
    this._isDisposed = true;
  }
  cancel() {
    if (this._token !== void 0) {
      clearTimeout(this._token);
      this._token = void 0;
    }
  }
  cancelAndSet(runner, timeout2) {
    if (this._isDisposed) {
      throw new BugIndicatingError(`Calling 'cancelAndSet' on a disposed TimeoutTimer`);
    }
    this.cancel();
    this._token = setTimeout(() => {
      this._token = void 0;
      runner();
    }, timeout2);
  }
  setIfNotSet(runner, timeout2) {
    if (this._isDisposed) {
      throw new BugIndicatingError(`Calling 'setIfNotSet' on a disposed TimeoutTimer`);
    }
    if (this._token !== void 0) {
      return;
    }
    this._token = setTimeout(() => {
      this._token = void 0;
      runner();
    }, timeout2);
  }
}
class IntervalTimer {
  constructor() {
    this.disposable = void 0;
    this.isDisposed = false;
  }
  cancel() {
    this.disposable?.dispose();
    this.disposable = void 0;
  }
  cancelAndSet(runner, interval, context = globalThis) {
    if (this.isDisposed) {
      throw new BugIndicatingError(`Calling 'cancelAndSet' on a disposed IntervalTimer`);
    }
    this.cancel();
    const handle = context.setInterval(() => {
      runner();
    }, interval);
    this.disposable = toDisposable(() => {
      context.clearInterval(handle);
      this.disposable = void 0;
    });
  }
  dispose() {
    this.cancel();
    this.isDisposed = true;
  }
}
class RunOnceScheduler {
  constructor(runner, delay) {
    this.timeoutToken = void 0;
    this.runner = runner;
    this.timeout = delay;
    this.timeoutHandler = this.onTimeout.bind(this);
  }
  /**
   * Dispose RunOnceScheduler
   */
  dispose() {
    this.cancel();
    this.runner = null;
  }
  /**
   * Cancel current scheduled runner (if any).
   */
  cancel() {
    if (this.isScheduled()) {
      clearTimeout(this.timeoutToken);
      this.timeoutToken = void 0;
    }
  }
  /**
   * Cancel previous runner (if any) & schedule a new runner.
   */
  schedule(delay = this.timeout) {
    this.cancel();
    this.timeoutToken = setTimeout(this.timeoutHandler, delay);
  }
  get delay() {
    return this.timeout;
  }
  set delay(value) {
    this.timeout = value;
  }
  /**
   * Returns true if scheduled.
   */
  isScheduled() {
    return this.timeoutToken !== void 0;
  }
  flush() {
    if (this.isScheduled()) {
      this.cancel();
      this.doRun();
    }
  }
  onTimeout() {
    this.timeoutToken = void 0;
    if (this.runner) {
      this.doRun();
    }
  }
  doRun() {
    this.runner?.();
  }
}
class ProcessTimeRunOnceScheduler {
  constructor(runner, delay) {
    if (delay % 1e3 !== 0) {
      console.warn(`ProcessTimeRunOnceScheduler resolution is 1s, ${delay}ms is not a multiple of 1000ms.`);
    }
    this.runner = runner;
    this.timeout = delay;
    this.counter = 0;
    this.intervalToken = void 0;
    this.intervalHandler = this.onInterval.bind(this);
  }
  dispose() {
    this.cancel();
    this.runner = null;
  }
  cancel() {
    if (this.isScheduled()) {
      clearInterval(this.intervalToken);
      this.intervalToken = void 0;
    }
  }
  /**
   * Cancel previous runner (if any) & schedule a new runner.
   */
  schedule(delay = this.timeout) {
    if (delay % 1e3 !== 0) {
      console.warn(`ProcessTimeRunOnceScheduler resolution is 1s, ${delay}ms is not a multiple of 1000ms.`);
    }
    this.cancel();
    this.counter = Math.ceil(delay / 1e3);
    this.intervalToken = setInterval(this.intervalHandler, 1e3);
  }
  /**
   * Returns true if scheduled.
   */
  isScheduled() {
    return this.intervalToken !== void 0;
  }
  onInterval() {
    this.counter--;
    if (this.counter > 0) {
      return;
    }
    clearInterval(this.intervalToken);
    this.intervalToken = void 0;
    this.runner?.();
  }
}
class RunOnceWorker extends RunOnceScheduler {
  constructor(runner, timeout2) {
    super(runner, timeout2);
    this.units = [];
  }
  work(unit) {
    this.units.push(unit);
    if (!this.isScheduled()) {
      this.schedule();
    }
  }
  doRun() {
    const units = this.units;
    this.units = [];
    this.runner?.(units);
  }
  dispose() {
    this.units = [];
    super.dispose();
  }
}
class ThrottledWorker extends Disposable {
  constructor(options, handler) {
    super();
    this.options = options;
    this.handler = handler;
    this.pendingWork = [];
    this.throttler = this._register(new MutableDisposable());
    this.disposed = false;
    this.lastExecutionTime = 0;
  }
  /**
   * The number of work units that are pending to be processed.
   */
  get pending() {
    return this.pendingWork.length;
  }
  /**
   * Add units to be worked on. Use `pending` to figure out
   * how many units are not yet processed after this method
   * was called.
   *
   * @returns whether the work was accepted or not. If the
   * worker is disposed, it will not accept any more work.
   * If the number of pending units would become larger
   * than `maxPendingWork`, more work will also not be accepted.
   */
  work(units) {
    if (this.disposed) {
      return false;
    }
    if (typeof this.options.maxBufferedWork === "number") {
      if (this.throttler.value) {
        if (this.pending + units.length > this.options.maxBufferedWork) {
          return false;
        }
      } else {
        if (this.pending + units.length - this.options.maxWorkChunkSize > this.options.maxBufferedWork) {
          return false;
        }
      }
    }
    for (const unit of units) {
      this.pendingWork.push(unit);
    }
    const timeSinceLastExecution = Date.now() - this.lastExecutionTime;
    if (!this.throttler.value && (!this.options.waitThrottleDelayBetweenWorkUnits || timeSinceLastExecution >= this.options.throttleDelay)) {
      this.doWork();
    } else if (!this.throttler.value && this.options.waitThrottleDelayBetweenWorkUnits) {
      this.scheduleThrottler(Math.max(this.options.throttleDelay - timeSinceLastExecution, 0));
    } else {
    }
    return true;
  }
  doWork() {
    this.lastExecutionTime = Date.now();
    this.handler(this.pendingWork.splice(0, this.options.maxWorkChunkSize));
    if (this.pendingWork.length > 0) {
      this.scheduleThrottler();
    }
  }
  scheduleThrottler(delay = this.options.throttleDelay) {
    this.throttler.value = new RunOnceScheduler(() => {
      this.throttler.clear();
      this.doWork();
    }, delay);
    this.throttler.value.schedule();
  }
  dispose() {
    super.dispose();
    this.pendingWork.length = 0;
    this.disposed = true;
  }
}
let runWhenGlobalIdle;
let _runWhenIdle;
(function() {
  const safeGlobal = globalThis;
  if (typeof safeGlobal.requestIdleCallback !== "function" || typeof safeGlobal.cancelIdleCallback !== "function") {
    _runWhenIdle = (_targetWindow, runner, timeout2) => {
      setTimeout0(() => {
        if (disposed) {
          return;
        }
        const end = Date.now() + 15;
        const deadline = {
          didTimeout: true,
          timeRemaining() {
            return Math.max(0, end - Date.now());
          }
        };
        runner(Object.freeze(deadline));
      });
      let disposed = false;
      return {
        dispose() {
          if (disposed) {
            return;
          }
          disposed = true;
        }
      };
    };
  } else {
    _runWhenIdle = (targetWindow, runner, timeout2) => {
      const handle = targetWindow.requestIdleCallback(runner, typeof timeout2 === "number" ? { timeout: timeout2 } : void 0);
      let disposed = false;
      return {
        dispose() {
          if (disposed) {
            return;
          }
          disposed = true;
          targetWindow.cancelIdleCallback(handle);
        }
      };
    };
  }
  runWhenGlobalIdle = (runner, timeout2) => _runWhenIdle(globalThis, runner, timeout2);
})();
function installFakeRunWhenIdle(fakeImpl) {
  const origRunWhenIdle = _runWhenIdle;
  const origRunWhenGlobalIdle = runWhenGlobalIdle;
  _runWhenIdle = fakeImpl;
  runWhenGlobalIdle = (runner, timeout2) => fakeImpl(globalThis, runner, timeout2);
  return toDisposable(() => {
    _runWhenIdle = origRunWhenIdle;
    runWhenGlobalIdle = origRunWhenGlobalIdle;
  });
}
class AbstractIdleValue {
  constructor(targetWindow, executor) {
    this._didRun = false;
    this._executor = () => {
      try {
        this._value = executor();
      } catch (err) {
        this._error = err;
      } finally {
        this._didRun = true;
      }
    };
    this._handle = _runWhenIdle(targetWindow, () => this._executor());
  }
  dispose() {
    this._handle.dispose();
  }
  get value() {
    if (!this._didRun) {
      this._handle.dispose();
      this._executor();
    }
    if (this._error) {
      throw this._error;
    }
    return this._value;
  }
  get isInitialized() {
    return this._didRun;
  }
}
class GlobalIdleValue extends AbstractIdleValue {
  constructor(executor) {
    super(globalThis, executor);
  }
}
async function retry(task, delay, retries) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      await timeout(delay);
    }
  }
  throw lastError;
}
class TaskSequentializer {
  isRunning(taskId) {
    if (typeof taskId === "number") {
      return this._running?.taskId === taskId;
    }
    return !!this._running;
  }
  get running() {
    return this._running?.promise;
  }
  cancelRunning() {
    this._running?.cancel();
  }
  run(taskId, promise, onCancel) {
    this._running = { taskId, cancel: () => onCancel?.(), promise };
    promise.then(() => this.doneRunning(taskId), () => this.doneRunning(taskId));
    return promise;
  }
  doneRunning(taskId) {
    if (this._running && taskId === this._running.taskId) {
      this._running = void 0;
      this.runQueued();
    }
  }
  runQueued() {
    if (this._queued) {
      const queued = this._queued;
      this._queued = void 0;
      queued.run().then(queued.promiseResolve, queued.promiseReject);
    }
  }
  /**
   * Note: the promise to schedule as next run MUST itself call `run`.
   *       Otherwise, this sequentializer will report `false` for `isRunning`
   *       even when this task is running. Missing this detail means that
   *       suddenly multiple tasks will run in parallel.
   */
  queue(run) {
    if (!this._queued) {
      const { promise, resolve: promiseResolve, reject: promiseReject } = promiseWithResolvers();
      this._queued = {
        run,
        promise,
        promiseResolve,
        promiseReject
      };
    } else {
      this._queued.run = run;
    }
    return this._queued.promise;
  }
  hasQueued() {
    return !!this._queued;
  }
  async join() {
    return this._queued?.promise ?? this._running?.promise;
  }
}
class IntervalCounter {
  constructor(interval, nowFn = () => Date.now()) {
    this.interval = interval;
    this.nowFn = nowFn;
    this.lastIncrementTime = 0;
    this.value = 0;
  }
  increment() {
    const now = this.nowFn();
    if (now - this.lastIncrementTime > this.interval) {
      this.lastIncrementTime = now;
      this.value = 0;
    }
    this.value++;
    return this.value;
  }
}
var DeferredOutcome = /* @__PURE__ */ ((DeferredOutcome2) => {
  DeferredOutcome2[DeferredOutcome2["Resolved"] = 0] = "Resolved";
  DeferredOutcome2[DeferredOutcome2["Rejected"] = 1] = "Rejected";
  return DeferredOutcome2;
})(DeferredOutcome || {});
class DeferredPromise {
  static fromPromise(promise) {
    const deferred = new DeferredPromise();
    deferred.settleWith(promise);
    return deferred;
  }
  get isRejected() {
    return this.outcome?.outcome === 1 /* Rejected */;
  }
  get isResolved() {
    return this.outcome?.outcome === 0 /* Resolved */;
  }
  get isSettled() {
    return !!this.outcome;
  }
  get value() {
    return this.outcome?.outcome === 0 /* Resolved */ ? this.outcome?.value : void 0;
  }
  constructor() {
    this.p = new Promise((c, e) => {
      this.completeCallback = c;
      this.errorCallback = e;
    });
  }
  complete(value) {
    if (this.isSettled) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.completeCallback(value);
      this.outcome = { outcome: 0 /* Resolved */, value };
      resolve();
    });
  }
  error(err) {
    if (this.isSettled) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.errorCallback(err);
      this.outcome = { outcome: 1 /* Rejected */, value: err };
      resolve();
    });
  }
  settleWith(promise) {
    return promise.then(
      (value) => this.complete(value),
      (error) => this.error(error)
    );
  }
  cancel() {
    return this.error(new CancellationError());
  }
}
var Promises;
((Promises2) => {
  async function settled(promises) {
    let firstError = void 0;
    const result = await Promise.all(promises.map((promise) => promise.then((value) => value, (error) => {
      if (!firstError) {
        firstError = error;
      }
      return void 0;
    })));
    if (typeof firstError !== "undefined") {
      throw firstError;
    }
    return result;
  }
  Promises2.settled = settled;
  function withAsyncBody(bodyFn) {
    return new Promise(async (resolve, reject) => {
      try {
        await bodyFn(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }
  Promises2.withAsyncBody = withAsyncBody;
})(Promises || (Promises = {}));
class StatefulPromise {
  constructor(promise) {
    this._value = void 0;
    this._error = void 0;
    this._isResolved = false;
    this.promise = promise.then(
      (value) => {
        this._value = value;
        this._isResolved = true;
        return value;
      },
      (error) => {
        this._error = error;
        this._isResolved = true;
        throw error;
      }
    );
  }
  get value() {
    return this._value;
  }
  get error() {
    return this._error;
  }
  get isResolved() {
    return this._isResolved;
  }
  /**
   * Returns the resolved value.
   * Throws if the promise is not resolved yet.
   */
  requireValue() {
    if (!this._isResolved) {
      throw new BugIndicatingError("Promise is not resolved yet");
    }
    if (this._error) {
      throw this._error;
    }
    return this._value;
  }
}
class LazyStatefulPromise {
  constructor(_compute) {
    this._compute = _compute;
    this._promise = new Lazy(() => new StatefulPromise(this._compute()));
  }
  /**
   * Returns the resolved value.
   * Throws if the promise is not resolved yet.
   */
  requireValue() {
    return this._promise.value.requireValue();
  }
  /**
   * Returns the promise (and triggers a computation of the promise if not yet done so).
   */
  getPromise() {
    return this._promise.value.promise;
  }
  /**
   * Reads the current value without triggering a computation of the promise.
   */
  get currentValue() {
    return this._promise.rawValue?.value;
  }
}
var AsyncIterableSourceState = /* @__PURE__ */ ((AsyncIterableSourceState2) => {
  AsyncIterableSourceState2[AsyncIterableSourceState2["Initial"] = 0] = "Initial";
  AsyncIterableSourceState2[AsyncIterableSourceState2["DoneOK"] = 1] = "DoneOK";
  AsyncIterableSourceState2[AsyncIterableSourceState2["DoneError"] = 2] = "DoneError";
  return AsyncIterableSourceState2;
})(AsyncIterableSourceState || {});
const _AsyncIterableObject = class _AsyncIterableObject {
  static fromArray(items) {
    return new _AsyncIterableObject((writer) => {
      writer.emitMany(items);
    });
  }
  static fromPromise(promise) {
    return new _AsyncIterableObject(async (emitter) => {
      emitter.emitMany(await promise);
    });
  }
  static fromPromisesResolveOrder(promises) {
    return new _AsyncIterableObject(async (emitter) => {
      await Promise.all(promises.map(async (p) => emitter.emitOne(await p)));
    });
  }
  static merge(iterables) {
    return new _AsyncIterableObject(async (emitter) => {
      await Promise.all(iterables.map(async (iterable) => {
        for await (const item of iterable) {
          emitter.emitOne(item);
        }
      }));
    });
  }
  constructor(executor, onReturn) {
    this._state = 0 /* Initial */;
    this._results = [];
    this._error = null;
    this._onReturn = onReturn;
    this._onStateChanged = new Emitter();
    queueMicrotask(async () => {
      const writer = {
        emitOne: (item) => this.emitOne(item),
        emitMany: (items) => this.emitMany(items),
        reject: (error) => this.reject(error)
      };
      try {
        await Promise.resolve(executor(writer));
        this.resolve();
      } catch (err) {
        this.reject(err);
      } finally {
        writer.emitOne = () => {
        };
        writer.emitMany = () => {
        };
        writer.reject = () => {
        };
      }
    });
  }
  [Symbol.asyncIterator]() {
    let i = 0;
    return {
      next: async () => {
        do {
          if (this._state === 2 /* DoneError */) {
            throw this._error;
          }
          if (i < this._results.length) {
            return { done: false, value: this._results[i++] };
          }
          if (this._state === 1 /* DoneOK */) {
            return { done: true, value: void 0 };
          }
          await Event.toPromise(this._onStateChanged.event);
        } while (true);
      },
      return: async () => {
        this._onReturn?.();
        return { done: true, value: void 0 };
      }
    };
  }
  static map(iterable, mapFn) {
    return new _AsyncIterableObject(async (emitter) => {
      for await (const item of iterable) {
        emitter.emitOne(mapFn(item));
      }
    });
  }
  map(mapFn) {
    return _AsyncIterableObject.map(this, mapFn);
  }
  static filter(iterable, filterFn) {
    return new _AsyncIterableObject(async (emitter) => {
      for await (const item of iterable) {
        if (filterFn(item)) {
          emitter.emitOne(item);
        }
      }
    });
  }
  filter(filterFn) {
    return _AsyncIterableObject.filter(this, filterFn);
  }
  static coalesce(iterable) {
    return _AsyncIterableObject.filter(iterable, (item) => !!item);
  }
  coalesce() {
    return _AsyncIterableObject.coalesce(this);
  }
  static async toPromise(iterable) {
    const result = [];
    for await (const item of iterable) {
      result.push(item);
    }
    return result;
  }
  toPromise() {
    return _AsyncIterableObject.toPromise(this);
  }
  /**
   * The value will be appended at the end.
   *
   * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
   */
  emitOne(value) {
    if (this._state !== 0 /* Initial */) {
      return;
    }
    this._results.push(value);
    this._onStateChanged.fire();
  }
  /**
   * The values will be appended at the end.
   *
   * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
   */
  emitMany(values) {
    if (this._state !== 0 /* Initial */) {
      return;
    }
    this._results = this._results.concat(values);
    this._onStateChanged.fire();
  }
  /**
   * Calling `resolve()` will mark the result array as complete.
   *
   * **NOTE** `resolve()` must be called, otherwise all consumers of this iterable will hang indefinitely, similar to a non-resolved promise.
   * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
   */
  resolve() {
    if (this._state !== 0 /* Initial */) {
      return;
    }
    this._state = 1 /* DoneOK */;
    this._onStateChanged.fire();
  }
  /**
   * Writing an error will permanently invalidate this iterable.
   * The current users will receive an error thrown, as will all future users.
   *
   * **NOTE** If `resolve()` or `reject()` have already been called, this method has no effect.
   */
  reject(error) {
    if (this._state !== 0 /* Initial */) {
      return;
    }
    this._state = 2 /* DoneError */;
    this._error = error;
    this._onStateChanged.fire();
  }
};
_AsyncIterableObject.EMPTY = _AsyncIterableObject.fromArray([]);
let AsyncIterableObject = _AsyncIterableObject;
function createCancelableAsyncIterableProducer(callback) {
  const source = new CancellationTokenSource();
  const innerIterable = callback(source.token);
  return new CancelableAsyncIterableProducer(source, async (emitter) => {
    const subscription = source.token.onCancellationRequested(() => {
      subscription.dispose();
      source.dispose();
      emitter.reject(new CancellationError());
    });
    try {
      for await (const item of innerIterable) {
        if (source.token.isCancellationRequested) {
          return;
        }
        emitter.emitOne(item);
      }
      subscription.dispose();
      source.dispose();
    } catch (err) {
      subscription.dispose();
      source.dispose();
      emitter.reject(err);
    }
  });
}
class AsyncIterableSource {
  /**
   *
   * @param onReturn A function that will be called when consuming the async iterable
   * has finished by the consumer, e.g the for-await-loop has be existed (break, return) early.
   * This is NOT called when resolving this source by its owner.
   */
  constructor(onReturn) {
    this._deferred = new DeferredPromise();
    this._asyncIterable = new AsyncIterableObject((emitter) => {
      if (earlyError) {
        emitter.reject(earlyError);
        return;
      }
      if (earlyItems) {
        emitter.emitMany(earlyItems);
      }
      this._errorFn = (error) => emitter.reject(error);
      this._emitOneFn = (item) => emitter.emitOne(item);
      this._emitManyFn = (items) => emitter.emitMany(items);
      return this._deferred.p;
    }, onReturn);
    let earlyError;
    let earlyItems;
    this._errorFn = (error) => {
      if (!earlyError) {
        earlyError = error;
      }
    };
    this._emitOneFn = (item) => {
      if (!earlyItems) {
        earlyItems = [];
      }
      earlyItems.push(item);
    };
    this._emitManyFn = (items) => {
      if (!earlyItems) {
        earlyItems = items.slice();
      } else {
        items.forEach((item) => earlyItems.push(item));
      }
    };
  }
  get asyncIterable() {
    return this._asyncIterable;
  }
  resolve() {
    this._deferred.complete();
  }
  reject(error) {
    this._errorFn(error);
    this._deferred.complete();
  }
  emitOne(item) {
    this._emitOneFn(item);
  }
  emitMany(items) {
    this._emitManyFn(items);
  }
}
function cancellableIterable(iterableOrIterator, token) {
  const iterator = Symbol.asyncIterator in iterableOrIterator ? iterableOrIterator[Symbol.asyncIterator]() : iterableOrIterator;
  return {
    async next() {
      if (token.isCancellationRequested) {
        return { done: true, value: void 0 };
      }
      const result = await raceCancellation(iterator.next(), token);
      return result || { done: true, value: void 0 };
    },
    throw: iterator.throw?.bind(iterator),
    return: iterator.return?.bind(iterator),
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
class ProducerConsumer {
  constructor() {
    this._unsatisfiedConsumers = [];
    this._unconsumedValues = [];
  }
  get hasFinalValue() {
    return !!this._finalValue;
  }
  produce(value) {
    this._ensureNoFinalValue();
    if (this._unsatisfiedConsumers.length > 0) {
      const deferred = this._unsatisfiedConsumers.shift();
      this._resolveOrRejectDeferred(deferred, value);
    } else {
      this._unconsumedValues.push(value);
    }
  }
  produceFinal(value) {
    this._ensureNoFinalValue();
    this._finalValue = value;
    for (const deferred of this._unsatisfiedConsumers) {
      this._resolveOrRejectDeferred(deferred, value);
    }
    this._unsatisfiedConsumers.length = 0;
  }
  _ensureNoFinalValue() {
    if (this._finalValue) {
      throw new BugIndicatingError("ProducerConsumer: cannot produce after final value has been set");
    }
  }
  _resolveOrRejectDeferred(deferred, value) {
    if (value.ok) {
      deferred.complete(value.value);
    } else {
      deferred.error(value.error);
    }
  }
  consume() {
    if (this._unconsumedValues.length > 0 || this._finalValue) {
      const value = this._unconsumedValues.length > 0 ? this._unconsumedValues.shift() : this._finalValue;
      if (value.ok) {
        return Promise.resolve(value.value);
      } else {
        return Promise.reject(value.error);
      }
    } else {
      const deferred = new DeferredPromise();
      this._unsatisfiedConsumers.push(deferred);
      return deferred.p;
    }
  }
}
const _AsyncIterableProducer = class _AsyncIterableProducer {
  constructor(executor, _onReturn) {
    this._onReturn = _onReturn;
    this._producerConsumer = new ProducerConsumer();
    this._iterator = {
      next: () => this._producerConsumer.consume(),
      return: () => {
        this._onReturn?.();
        return Promise.resolve({ done: true, value: void 0 });
      },
      throw: async (e) => {
        this._finishError(e);
        return { done: true, value: void 0 };
      }
    };
    queueMicrotask(async () => {
      const p = executor({
        emitOne: (value) => this._producerConsumer.produce({ ok: true, value: { done: false, value } }),
        emitMany: (values) => {
          for (const value of values) {
            this._producerConsumer.produce({ ok: true, value: { done: false, value } });
          }
        },
        reject: (error) => this._finishError(error)
      });
      if (!this._producerConsumer.hasFinalValue) {
        try {
          await p;
          this._finishOk();
        } catch (error) {
          this._finishError(error);
        }
      }
    });
  }
  static fromArray(items) {
    return new _AsyncIterableProducer((writer) => {
      writer.emitMany(items);
    });
  }
  static fromPromise(promise) {
    return new _AsyncIterableProducer(async (emitter) => {
      emitter.emitMany(await promise);
    });
  }
  static fromPromisesResolveOrder(promises) {
    return new _AsyncIterableProducer(async (emitter) => {
      await Promise.all(promises.map(async (p) => emitter.emitOne(await p)));
    });
  }
  static merge(iterables) {
    return new _AsyncIterableProducer(async (emitter) => {
      await Promise.all(iterables.map(async (iterable) => {
        for await (const item of iterable) {
          emitter.emitOne(item);
        }
      }));
    });
  }
  static map(iterable, mapFn) {
    return new _AsyncIterableProducer(async (emitter) => {
      for await (const item of iterable) {
        emitter.emitOne(mapFn(item));
      }
    });
  }
  static tee(iterable) {
    let emitter1;
    let emitter2;
    const defer = new DeferredPromise();
    const start = async () => {
      if (!emitter1 || !emitter2) {
        return;
      }
      try {
        for await (const item of iterable) {
          emitter1.emitOne(item);
          emitter2.emitOne(item);
        }
      } catch (err) {
        emitter1.reject(err);
        emitter2.reject(err);
      } finally {
        defer.complete();
      }
    };
    const p1 = new _AsyncIterableProducer(async (emitter) => {
      emitter1 = emitter;
      start();
      return defer.p;
    });
    const p2 = new _AsyncIterableProducer(async (emitter) => {
      emitter2 = emitter;
      start();
      return defer.p;
    });
    return [p1, p2];
  }
  map(mapFn) {
    return _AsyncIterableProducer.map(this, mapFn);
  }
  static coalesce(iterable) {
    return _AsyncIterableProducer.filter(iterable, (item) => !!item);
  }
  coalesce() {
    return _AsyncIterableProducer.coalesce(this);
  }
  static filter(iterable, filterFn) {
    return new _AsyncIterableProducer(async (emitter) => {
      for await (const item of iterable) {
        if (filterFn(item)) {
          emitter.emitOne(item);
        }
      }
    });
  }
  filter(filterFn) {
    return _AsyncIterableProducer.filter(this, filterFn);
  }
  _finishOk() {
    if (!this._producerConsumer.hasFinalValue) {
      this._producerConsumer.produceFinal({ ok: true, value: { done: true, value: void 0 } });
    }
  }
  _finishError(error) {
    if (!this._producerConsumer.hasFinalValue) {
      this._producerConsumer.produceFinal({ ok: false, error });
    }
  }
  [Symbol.asyncIterator]() {
    return this._iterator;
  }
};
_AsyncIterableProducer.EMPTY = _AsyncIterableProducer.fromArray([]);
let AsyncIterableProducer = _AsyncIterableProducer;
class CancelableAsyncIterableProducer extends AsyncIterableProducer {
  constructor(_source, executor) {
    super(executor);
    this._source = _source;
  }
  cancel() {
    this._source.cancel();
  }
}
const AsyncReaderEndOfStream = /* @__PURE__ */ Symbol("AsyncReaderEndOfStream");
class AsyncReader {
  constructor(_source) {
    this._source = _source;
    this._buffer = [];
    this._atEnd = false;
  }
  get endOfStream() {
    return this._buffer.length === 0 && this._atEnd;
  }
  async read() {
    if (this._buffer.length === 0 && !this._atEnd) {
      await this._extendBuffer();
    }
    if (this._buffer.length === 0) {
      return AsyncReaderEndOfStream;
    }
    return this._buffer.shift();
  }
  async readWhile(predicate, callback) {
    do {
      const piece = await this.peek();
      if (piece === AsyncReaderEndOfStream) {
        break;
      }
      if (!predicate(piece)) {
        break;
      }
      await this.read();
      await callback(piece);
    } while (true);
  }
  readBufferedOrThrow() {
    const value = this.peekBufferedOrThrow();
    this._buffer.shift();
    return value;
  }
  async consumeToEnd() {
    while (!this.endOfStream) {
      await this.read();
    }
  }
  async peek() {
    if (this._buffer.length === 0 && !this._atEnd) {
      await this._extendBuffer();
    }
    if (this._buffer.length === 0) {
      return AsyncReaderEndOfStream;
    }
    return this._buffer[0];
  }
  peekBufferedOrThrow() {
    if (this._buffer.length === 0) {
      if (this._atEnd) {
        return AsyncReaderEndOfStream;
      }
      throw new BugIndicatingError("No buffered elements");
    }
    return this._buffer[0];
  }
  async peekTimeout(timeoutMs) {
    if (this._buffer.length === 0 && !this._atEnd) {
      await raceTimeout(this._extendBuffer(), timeoutMs);
    }
    if (this._atEnd) {
      return AsyncReaderEndOfStream;
    }
    if (this._buffer.length === 0) {
      return void 0;
    }
    return this._buffer[0];
  }
  _extendBuffer() {
    if (this._atEnd) {
      return Promise.resolve();
    }
    if (!this._extendBufferPromise) {
      this._extendBufferPromise = (async () => {
        const { value, done } = await this._source.next();
        this._extendBufferPromise = void 0;
        if (done) {
          this._atEnd = true;
        } else {
          this._buffer.push(value);
        }
      })();
    }
    return this._extendBufferPromise;
  }
}
function createTimeout(ms, cb) {
  const t = setTimeout(cb, ms);
  return toDisposable(() => clearTimeout(t));
}
export {
  AbstractIdleValue,
  AsyncIterableObject,
  AsyncIterableProducer,
  AsyncIterableSource,
  AsyncReader,
  AsyncReaderEndOfStream,
  AutoOpenBarrier,
  Barrier,
  CancelableAsyncIterableProducer,
  DeferredPromise,
  Delayer,
  GlobalIdleValue,
  IntervalCounter,
  IntervalTimer,
  LazyStatefulPromise,
  LimitedQueue,
  Limiter,
  MAX_TIMEOUT_DELAY,
  ProcessTimeRunOnceScheduler,
  Promises,
  Queue,
  ResourceQueue,
  RunOnceScheduler,
  RunOnceWorker,
  Sequencer,
  SequencerByKey,
  StatefulPromise,
  TaskQueue,
  TaskSequentializer,
  ThrottledDelayer,
  ThrottledWorker,
  Throttler,
  ThrottlerByKey,
  TimeoutTimer,
  _runWhenIdle,
  asPromise,
  cancellableIterable,
  createCancelableAsyncIterableProducer,
  createCancelablePromise,
  createTimeout,
  disposableLongTimeout,
  disposableTimeout,
  first,
  firstParallel,
  installFakeRunWhenIdle,
  isThenable,
  notCancellablePromise,
  promiseWithResolvers,
  raceCancellablePromises,
  raceCancellation,
  raceCancellationError,
  raceTimeout,
  rejectIfNotCanceled,
  retry,
  runWhenGlobalIdle,
  sequence,
  timeout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGFzeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yLCBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmkgYXMgZGVmYXVsdEV4dFVyaSwgSUV4dFVyaSB9IGZyb20gJy4vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4vdXJpLmpzJztcbmltcG9ydCB7IHNldFRpbWVvdXQwIH0gZnJvbSAnLi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBNaWNyb3Rhc2tEZWxheSB9IGZyb20gJy4vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi9sYXp5LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzVGhlbmFibGU8VD4ob2JqOiB1bmtub3duKTogb2JqIGlzIFByb21pc2U8VD4ge1xuXHRyZXR1cm4gISFvYmogJiYgdHlwZW9mIChvYmogYXMgdW5rbm93biBhcyBQcm9taXNlPFQ+KS50aGVuID09PSAnZnVuY3Rpb24nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhbmNlbGFibGVQcm9taXNlPFQ+IGV4dGVuZHMgUHJvbWlzZTxUPiB7XG5cdGNhbmNlbCgpOiB2b2lkO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgY2FuIGJlIGNhbmNlbGxlZCB1c2luZyB0aGUgcHJvdmlkZWQgY2FuY2VsbGF0aW9uIHRva2VuLlxuICpcbiAqIEByZW1hcmtzIFdoZW4gY2FuY2VsbGF0aW9uIGlzIHJlcXVlc3RlZCwgdGhlIHByb21pc2Ugd2lsbCBiZSByZWplY3RlZCB3aXRoIGEge0BsaW5rIENhbmNlbGxhdGlvbkVycm9yfS5cbiAqIElmIHRoZSBwcm9taXNlIHJlc29sdmVzIHRvIGEgZGlzcG9zYWJsZSBvYmplY3QsIGl0IHdpbGwgYmUgYXV0b21hdGljYWxseSBkaXNwb3NlZCB3aGVuIGNhbmNlbGxhdGlvblxuICogaXMgcmVxdWVzdGVkLlxuICpcbiAqIEBwYXJhbSBjYWxsYmFjayBBIGZ1bmN0aW9uIHRoYXQgYWNjZXB0cyBhIGNhbmNlbGxhdGlvbiB0b2tlbiBhbmQgcmV0dXJucyBhIHByb21pc2VcbiAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IGNhbiBiZSBjYW5jZWxsZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlPFQ+KGNhbGxiYWNrOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPFQ+KTogQ2FuY2VsYWJsZVByb21pc2U8VD4ge1xuXHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRjb25zdCB0aGVuYWJsZSA9IGNhbGxiYWNrKHNvdXJjZS50b2tlbik7XG5cblx0bGV0IGlzQ2FuY2VsbGVkID0gZmFsc2U7XG5cblx0Y29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBzb3VyY2UudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0aXNDYW5jZWxsZWQgPSB0cnVlO1xuXHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0fSk7XG5cdFx0UHJvbWlzZS5yZXNvbHZlKHRoZW5hYmxlKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRzb3VyY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdHJlc29sdmUodmFsdWUpO1xuXG5cdFx0XHR9IGVsc2UgaWYgKGlzRGlzcG9zYWJsZSh2YWx1ZSkpIHtcblx0XHRcdFx0Ly8gcHJvbWlzZSBoYXMgYmVlbiBjYW5jZWxsZWQsIHJlc3VsdCBpcyBkaXNwb3NhYmxlIGFuZCB3aWxsXG5cdFx0XHRcdC8vIGJlIGNsZWFuZWQgdXBcblx0XHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdFx0c291cmNlLmRpc3Bvc2UoKTtcblx0XHRcdHJlamVjdChlcnIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRyZXR1cm4gPENhbmNlbGFibGVQcm9taXNlPFQ+Pm5ldyBjbGFzcyB7XG5cdFx0Y2FuY2VsKCkge1xuXHRcdFx0c291cmNlLmNhbmNlbCgpO1xuXHRcdFx0c291cmNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhlbjxUUmVzdWx0MSA9IFQsIFRSZXN1bHQyID0gbmV2ZXI+KHJlc29sdmU/OiAoKHZhbHVlOiBUKSA9PiBUUmVzdWx0MSB8IFByb21pc2U8VFJlc3VsdDE+KSB8IHVuZGVmaW5lZCB8IG51bGwsIHJlamVjdD86ICgocmVhc29uOiB1bmtub3duKSA9PiBUUmVzdWx0MiB8IFByb21pc2U8VFJlc3VsdDI+KSB8IHVuZGVmaW5lZCB8IG51bGwpOiBQcm9taXNlPFRSZXN1bHQxIHwgVFJlc3VsdDI+IHtcblx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcblx0XHR9XG5cdFx0Y2F0Y2g8VFJlc3VsdCA9IG5ldmVyPihyZWplY3Q/OiAoKHJlYXNvbjogdW5rbm93bikgPT4gVFJlc3VsdCB8IFByb21pc2U8VFJlc3VsdD4pIHwgdW5kZWZpbmVkIHwgbnVsbCk6IFByb21pc2U8VCB8IFRSZXN1bHQ+IHtcblx0XHRcdHJldHVybiB0aGlzLnRoZW4odW5kZWZpbmVkLCByZWplY3QpO1xuXHRcdH1cblx0XHRmaW5hbGx5KG9uZmluYWxseT86ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCB8IG51bGwpOiBQcm9taXNlPFQ+IHtcblx0XHRcdHJldHVybiBwcm9taXNlLmZpbmFsbHkob25maW5hbGx5KTtcblx0XHR9XG5cdH07XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIGB1bmRlZmluZWRgIGFzIHNvb24gYXMgdGhlIHBhc3NlZCB0b2tlbiBpcyBjYW5jZWxsZWQuXG4gKiBAc2VlIHtAbGluayByYWNlQ2FuY2VsbGF0aW9uRXJyb3J9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByYWNlQ2FuY2VsbGF0aW9uPFQ+KHByb21pc2U6IFByb21pc2U8VD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VCB8IHVuZGVmaW5lZD47XG5cbi8qKlxuICogUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIGBkZWZhdWx0VmFsdWVgIGFzIHNvb24gYXMgdGhlIHBhc3NlZCB0b2tlbiBpcyBjYW5jZWxsZWQuXG4gKiBAc2VlIHtAbGluayByYWNlQ2FuY2VsbGF0aW9uRXJyb3J9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByYWNlQ2FuY2VsbGF0aW9uPFQ+KHByb21pc2U6IFByb21pc2U8VD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZGVmYXVsdFZhbHVlOiBUKTogUHJvbWlzZTxUPjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJhY2VDYW5jZWxsYXRpb248VD4ocHJvbWlzZTogUHJvbWlzZTxUPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBkZWZhdWx0VmFsdWU/OiBUKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJlc29sdmUoZGVmYXVsdFZhbHVlKTtcblx0XHR9KTtcblx0XHRwcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KS5maW5hbGx5KCgpID0+IHJlZi5kaXNwb3NlKCkpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aCBhbiB7QENhbmNlbGxhdGlvbkVycm9yfSBhcyBzb29uIGFzIHRoZSBwYXNzZWQgdG9rZW4gaXMgY2FuY2VsbGVkLlxuICogQHNlZSB7QGxpbmsgcmFjZUNhbmNlbGxhdGlvbn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJhY2VDYW5jZWxsYXRpb25FcnJvcjxUPihwcm9taXNlOiBQcm9taXNlPFQ+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCByZWYgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0cmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHR9KTtcblx0XHRwcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KS5maW5hbGx5KCgpID0+IHJlZi5kaXNwb3NlKCkpO1xuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlamVjdElmTm90Q2FuY2VsZWQoZXJyOiB1bmtub3duKTogdW5kZWZpbmVkIHtcblx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycikgYXMgbmV2ZXI7XG59XG5cbi8qKlxuICogV3JhcHMgYSBjYW5jZWxsYWJsZSBwcm9taXNlIHN1Y2ggdGhhdCBpdCBpcyBubyBjYW5jZWxsYWJsZS4gQ2FuIGJlIHVzZWQgdG9cbiAqIGF2b2lkIGlzc3VlcyB3aXRoIHNoYXJlZCBwcm9taXNlcyB0aGF0IHdvdWxkIG5vcm1hbGx5IGJlIHJldHVybmVkIGFzXG4gKiBjYW5jZWxsYWJsZSB0byBjb25zdW1lcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3RDYW5jZWxsYWJsZVByb21pc2U8VD4ocHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRwcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcblx0fSk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhcyBzb29uIGFzIG9uZSBvZiB0aGUgcHJvbWlzZXMgcmVzb2x2ZXMgb3IgcmVqZWN0cyBhbmQgY2FuY2VscyByZW1haW5pbmcgcHJvbWlzZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJhY2VDYW5jZWxsYWJsZVByb21pc2VzPFQ+KGNhbmNlbGxhYmxlUHJvbWlzZXM6IChDYW5jZWxhYmxlUHJvbWlzZTxUPiB8IFByb21pc2U8VD4pW10pOiBDYW5jZWxhYmxlUHJvbWlzZTxUPiB7XG5cdGxldCByZXNvbHZlZFByb21pc2VJbmRleCA9IC0xO1xuXHRjb25zdCBwcm9taXNlcyA9IGNhbmNlbGxhYmxlUHJvbWlzZXMubWFwKChwcm9taXNlLCBpbmRleCkgPT4gcHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7IHJlc29sdmVkUHJvbWlzZUluZGV4ID0gaW5kZXg7IHJldHVybiByZXN1bHQ7IH0pKTtcblx0Y29uc3QgcHJvbWlzZSA9IFByb21pc2UucmFjZShwcm9taXNlcykgYXMgQ2FuY2VsYWJsZVByb21pc2U8VD47XG5cdHByb21pc2UuY2FuY2VsID0gKCkgPT4ge1xuXHRcdGNhbmNlbGxhYmxlUHJvbWlzZXMuZm9yRWFjaCgoY2FuY2VsbGFibGVQcm9taXNlLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKGluZGV4ICE9PSByZXNvbHZlZFByb21pc2VJbmRleCAmJiAoY2FuY2VsbGFibGVQcm9taXNlIGFzIENhbmNlbGFibGVQcm9taXNlPFQ+KS5jYW5jZWwpIHtcblx0XHRcdFx0KGNhbmNlbGxhYmxlUHJvbWlzZSBhcyBDYW5jZWxhYmxlUHJvbWlzZTxUPikuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH07XG5cdGNvbnN0IGNhbmNlbCA9ICgpID0+IHByb21pc2UuY2FuY2VsKCk7XG5cdHByb21pc2UudGhlbihjYW5jZWwsIGNhbmNlbCk7XG5cdHJldHVybiBwcm9taXNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmFjZVRpbWVvdXQ8VD4ocHJvbWlzZTogUHJvbWlzZTxUPiwgdGltZW91dDogbnVtYmVyLCBvblRpbWVvdXQ/OiAoKSA9PiB2b2lkKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdGxldCBwcm9taXNlUmVzb2x2ZTogKCh2YWx1ZTogVCB8IHVuZGVmaW5lZCkgPT4gdm9pZCkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRwcm9taXNlUmVzb2x2ZT8uKHVuZGVmaW5lZCk7XG5cdFx0b25UaW1lb3V0Py4oKTtcblx0fSwgdGltZW91dCk7XG5cblx0cmV0dXJuIFByb21pc2UucmFjZShbXG5cdFx0cHJvbWlzZS5maW5hbGx5KCgpID0+IGNsZWFyVGltZW91dCh0aW1lcikpLFxuXHRcdG5ldyBQcm9taXNlPFQgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4gcHJvbWlzZVJlc29sdmUgPSByZXNvbHZlKVxuXHRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzUHJvbWlzZTxUPihjYWxsYmFjazogKCkgPT4gVCB8IFRoZW5hYmxlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IGNhbGxiYWNrKCk7XG5cdFx0aWYgKGlzVGhlbmFibGU8VD4oaXRlbSkpIHtcblx0XHRcdGl0ZW0udGhlbihyZXNvbHZlLCByZWplY3QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvbHZlKGl0ZW0pO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbmQgcmV0dXJucyBhIG5ldyBwcm9taXNlLCBwbHVzIGl0cyBgcmVzb2x2ZWAgYW5kIGByZWplY3RgIGNhbGxiYWNrcy5cbiAqXG4gKiBSZXBsYWNlIHdpdGggc3RhbmRhcmRpemVkIFtgUHJvbWlzZS53aXRoUmVzb2x2ZXJzYF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvUHJvbWlzZS93aXRoUmVzb2x2ZXJzKSBvbmNlIGl0IGlzIHN1cHBvcnRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZVdpdGhSZXNvbHZlcnM8VD4oKTogeyBwcm9taXNlOiBQcm9taXNlPFQ+OyByZXNvbHZlOiAodmFsdWU6IFQgfCBQcm9taXNlTGlrZTxUPikgPT4gdm9pZDsgcmVqZWN0OiAoZXJyPzogYW55KSA9PiB2b2lkIH0ge1xuXHRsZXQgcmVzb2x2ZTogKHZhbHVlOiBUIHwgUHJvbWlzZUxpa2U8VD4pID0+IHZvaWQ7XG5cdGxldCByZWplY3Q6IChyZWFzb24/OiBhbnkpID0+IHZvaWQ7XG5cdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTxUPigocmVzLCByZWopID0+IHtcblx0XHRyZXNvbHZlID0gcmVzO1xuXHRcdHJlamVjdCA9IHJlajtcblx0fSk7XG5cdHJldHVybiB7IHByb21pc2UsIHJlc29sdmU6IHJlc29sdmUhLCByZWplY3Q6IHJlamVjdCEgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFzazxUPiB7XG5cdCgpOiBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDYW5jZWxsYWJsZVRhc2s8VD4ge1xuXHQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogVDtcbn1cblxuLyoqXG4gKiBBIGhlbHBlciB0byBwcmV2ZW50IGFjY3VtdWxhdGlvbiBvZiBzZXF1ZW50aWFsIGFzeW5jIHRhc2tzLlxuICpcbiAqIEltYWdpbmUgYSBtYWlsIG1hbiB3aXRoIHRoZSBzb2xlIHRhc2sgb2YgZGVsaXZlcmluZyBsZXR0ZXJzLiBBcyBzb29uIGFzXG4gKiBhIGxldHRlciBzdWJtaXR0ZWQgZm9yIGRlbGl2ZXJ5LCBoZSBkcml2ZXMgdG8gdGhlIGRlc3RpbmF0aW9uLCBkZWxpdmVycyBpdFxuICogYW5kIHJldHVybnMgdG8gaGlzIGJhc2UuIEltYWdpbmUgdGhhdCBkdXJpbmcgdGhlIHRyaXAsIE4gbW9yZSBsZXR0ZXJzIHdlcmUgc3VibWl0dGVkLlxuICogV2hlbiB0aGUgbWFpbCBtYW4gcmV0dXJucywgaGUgcGlja3MgdGhvc2UgTiBsZXR0ZXJzIGFuZCBkZWxpdmVycyB0aGVtIGFsbCBpbiBhXG4gKiBzaW5nbGUgdHJpcC4gRXZlbiB0aG91Z2ggTisxIHN1Ym1pc3Npb25zIG9jY3VycmVkLCBvbmx5IDIgZGVsaXZlcmllcyB3ZXJlIG1hZGUuXG4gKlxuICogVGhlIHRocm90dGxlciBpbXBsZW1lbnRzIHRoaXMgdmlhIHRoZSBxdWV1ZSgpIG1ldGhvZCwgYnkgcHJvdmlkaW5nIGl0IGEgdGFza1xuICogZmFjdG9yeS4gRm9sbG93aW5nIHRoZSBleGFtcGxlOlxuICpcbiAqIFx0XHRjb25zdCB0aHJvdHRsZXIgPSBuZXcgVGhyb3R0bGVyKCk7XG4gKiBcdFx0Y29uc3QgbGV0dGVycyA9IFtdO1xuICpcbiAqIFx0XHRmdW5jdGlvbiBkZWxpdmVyKCkge1xuICogXHRcdFx0Y29uc3QgbGV0dGVyc1RvRGVsaXZlciA9IGxldHRlcnM7XG4gKiBcdFx0XHRsZXR0ZXJzID0gW107XG4gKiBcdFx0XHRyZXR1cm4gbWFrZVRoZVRyaXAobGV0dGVyc1RvRGVsaXZlcik7XG4gKiBcdFx0fVxuICpcbiAqIFx0XHRmdW5jdGlvbiBvbkxldHRlclJlY2VpdmVkKGwpIHtcbiAqIFx0XHRcdGxldHRlcnMucHVzaChsKTtcbiAqIFx0XHRcdHRocm90dGxlci5xdWV1ZShkZWxpdmVyKTtcbiAqIFx0XHR9XG4gKi9cbmV4cG9ydCBjbGFzcyBUaHJvdHRsZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBhY3RpdmVQcm9taXNlOiBQcm9taXNlPGFueT4gfCBudWxsO1xuXHRwcml2YXRlIHF1ZXVlZFByb21pc2U6IFByb21pc2U8YW55PiB8IG51bGw7XG5cdHByaXZhdGUgcXVldWVkUHJvbWlzZUZhY3Rvcnk6IElDYW5jZWxsYWJsZVRhc2s8UHJvbWlzZTxhbnk+PiB8IG51bGw7XG5cdHByaXZhdGUgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuYWN0aXZlUHJvbWlzZSA9IG51bGw7XG5cdFx0dGhpcy5xdWV1ZWRQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLnF1ZXVlZFByb21pc2VGYWN0b3J5ID0gbnVsbDtcblxuXHRcdHRoaXMuY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0fVxuXG5cdHF1ZXVlPFQ+KHByb21pc2VGYWN0b3J5OiBJQ2FuY2VsbGFibGVUYXNrPFByb21pc2U8VD4+KTogUHJvbWlzZTxUPiB7XG5cdFx0aWYgKHRoaXMuY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1Rocm90dGxlciBpcyBkaXNwb3NlZCcpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3RpdmVQcm9taXNlKSB7XG5cdFx0XHR0aGlzLnF1ZXVlZFByb21pc2VGYWN0b3J5ID0gcHJvbWlzZUZhY3Rvcnk7XG5cblx0XHRcdGlmICghdGhpcy5xdWV1ZWRQcm9taXNlKSB7XG5cdFx0XHRcdGNvbnN0IG9uQ29tcGxldGUgPSAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5xdWV1ZWRQcm9taXNlID0gbnVsbDtcblxuXHRcdFx0XHRcdGlmICh0aGlzLmNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5xdWV1ZSh0aGlzLnF1ZXVlZFByb21pc2VGYWN0b3J5ISk7XG5cdFx0XHRcdFx0dGhpcy5xdWV1ZWRQcm9taXNlRmFjdG9yeSA9IG51bGw7XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMucXVldWVkUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlUHJvbWlzZSEudGhlbihvbkNvbXBsZXRlLCBvbkNvbXBsZXRlKS50aGVuKHJlc29sdmUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0dGhpcy5xdWV1ZWRQcm9taXNlIS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLmFjdGl2ZVByb21pc2UgPSBwcm9taXNlRmFjdG9yeSh0aGlzLmNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLmFjdGl2ZVByb21pc2UhLnRoZW4oKHJlc3VsdDogVCkgPT4ge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZVByb21pc2UgPSBudWxsO1xuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9LCAoZXJyOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlcXVlbmNlciB7XG5cblx0cHJpdmF0ZSBjdXJyZW50OiBQcm9taXNlPHVua25vd24+ID0gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXG5cdHF1ZXVlPFQ+KHByb21pc2VUYXNrOiBJVGFzazxQcm9taXNlPFQ+Pik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQgPSB0aGlzLmN1cnJlbnQudGhlbigoKSA9PiBwcm9taXNlVGFzaygpLCAoKSA9PiBwcm9taXNlVGFzaygpKTtcblx0fVxufVxuXG4vKipcbiAqIEEge0BsaW5rIFRocm90dGxlcn0gcGVyIGtleS4gQ2FsbHMgZm9yIHRoZSBzYW1lIGtleSBjb2FsZXNjZSAob25seSB0aGUgbW9zdFxuICogcmVjZW50bHkgcXVldWVkIHRhc2sgcnVucyBhZnRlciB0aGUgYWN0aXZlIG9uZSBzZXR0bGVzKTsgY2FsbHMgZm9yIGRpZmZlcmVudFxuICoga2V5cyBhcmUgaW5kZXBlbmRlbnQuIElkbGUga2V5cyBhcmUgY2xlYW5lZCB1cCBhdXRvbWF0aWNhbGx5LlxuICovXG5leHBvcnQgY2xhc3MgVGhyb3R0bGVyQnlLZXk8VEtleT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0aHJvdHRsZXJzID0gbmV3IE1hcDxUS2V5LCB7IHRocm90dGxlcjogVGhyb3R0bGVyOyBjb3VudDogbnVtYmVyIH0+KCk7XG5cblx0cXVldWU8VD4oa2V5OiBUS2V5LCB0YXNrOiBJVGFzazxQcm9taXNlPFQ+Pik6IFByb21pc2U8VD4ge1xuXHRcdGxldCBlbnRyeSA9IHRoaXMudGhyb3R0bGVycy5nZXQoa2V5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRlbnRyeSA9IHsgdGhyb3R0bGVyOiBuZXcgVGhyb3R0bGVyKCksIGNvdW50OiAwIH07XG5cdFx0XHR0aGlzLnRocm90dGxlcnMuc2V0KGtleSwgZW50cnkpO1xuXHRcdH1cblxuXHRcdGVudHJ5LmNvdW50Kys7XG5cdFx0cmV0dXJuIGVudHJ5LnRocm90dGxlci5xdWV1ZSh0YXNrKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICgtLWVudHJ5IS5jb3VudCA9PT0gMCkge1xuXHRcdFx0XHRlbnRyeSEudGhyb3R0bGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy50aHJvdHRsZXJzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHsgdGhyb3R0bGVyIH0gb2YgdGhpcy50aHJvdHRsZXJzLnZhbHVlcygpKSB7XG5cdFx0XHR0aHJvdHRsZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLnRocm90dGxlcnMuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VxdWVuY2VyQnlLZXk8VEtleT4ge1xuXG5cdHByaXZhdGUgcHJvbWlzZU1hcCA9IG5ldyBNYXA8VEtleSwgUHJvbWlzZTx1bmtub3duPj4oKTtcblxuXHRxdWV1ZTxUPihrZXk6IFRLZXksIHByb21pc2VUYXNrOiBJVGFzazxQcm9taXNlPFQ+Pik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IHJ1bm5pbmdQcm9taXNlID0gdGhpcy5wcm9taXNlTWFwLmdldChrZXkpID8/IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IG5ld1Byb21pc2UgPSBydW5uaW5nUHJvbWlzZVxuXHRcdFx0LmNhdGNoKCgpID0+IHsgfSlcblx0XHRcdC50aGVuKHByb21pc2VUYXNrKVxuXHRcdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5wcm9taXNlTWFwLmdldChrZXkpID09PSBuZXdQcm9taXNlKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9taXNlTWFwLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR0aGlzLnByb21pc2VNYXAuc2V0KGtleSwgbmV3UHJvbWlzZSk7XG5cdFx0cmV0dXJuIG5ld1Byb21pc2U7XG5cdH1cblxuXHRwZWVrKGtleTogVEtleSk6IFByb21pc2U8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByb21pc2VNYXAuZ2V0KGtleSkgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0a2V5cygpOiBJdGVyYWJsZUl0ZXJhdG9yPFRLZXk+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm9taXNlTWFwLmtleXMoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNjaGVkdWxlZExhdGVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRpc1RyaWdnZXJlZCgpOiBib29sZWFuO1xufVxuXG5jb25zdCB0aW1lb3V0RGVmZXJyZWQgPSAodGltZW91dDogbnVtYmVyLCBmbjogKCkgPT4gdm9pZCk6IElTY2hlZHVsZWRMYXRlciA9PiB7XG5cdGxldCBzY2hlZHVsZWQgPSB0cnVlO1xuXHRjb25zdCBoYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRzY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRmbigpO1xuXHR9LCB0aW1lb3V0KTtcblx0cmV0dXJuIHtcblx0XHRpc1RyaWdnZXJlZDogKCkgPT4gc2NoZWR1bGVkLFxuXHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dChoYW5kbGUpO1xuXHRcdFx0c2NoZWR1bGVkID0gZmFsc2U7XG5cdFx0fSxcblx0fTtcbn07XG5cbmNvbnN0IG1pY3JvdGFza0RlZmVycmVkID0gKGZuOiAoKSA9PiB2b2lkKTogSVNjaGVkdWxlZExhdGVyID0+IHtcblx0bGV0IHNjaGVkdWxlZCA9IHRydWU7XG5cdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRpZiAoc2NoZWR1bGVkKSB7XG5cdFx0XHRzY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRcdGZuKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4ge1xuXHRcdGlzVHJpZ2dlcmVkOiAoKSA9PiBzY2hlZHVsZWQsXG5cdFx0ZGlzcG9zZTogKCkgPT4geyBzY2hlZHVsZWQgPSBmYWxzZTsgfSxcblx0fTtcbn07XG5cbi8qKlxuICogQSBoZWxwZXIgdG8gZGVsYXkgKGRlYm91bmNlKSBleGVjdXRpb24gb2YgYSB0YXNrIHRoYXQgaXMgYmVpbmcgcmVxdWVzdGVkIG9mdGVuLlxuICpcbiAqIEZvbGxvd2luZyB0aGUgdGhyb3R0bGVyLCBub3cgaW1hZ2luZSB0aGUgbWFpbCBtYW4gd2FudHMgdG8gb3B0aW1pemUgdGhlIG51bWJlciBvZlxuICogdHJpcHMgcHJvYWN0aXZlbHkuIFRoZSB0cmlwIGl0c2VsZiBjYW4gYmUgbG9uZywgc28gaGUgZGVjaWRlcyBub3QgdG8gbWFrZSB0aGUgdHJpcFxuICogYXMgc29vbiBhcyBhIGxldHRlciBpcyBzdWJtaXR0ZWQuIEluc3RlYWQgaGUgd2FpdHMgYSB3aGlsZSwgaW4gY2FzZSBtb3JlXG4gKiBsZXR0ZXJzIGFyZSBzdWJtaXR0ZWQuIEFmdGVyIHNhaWQgd2FpdGluZyBwZXJpb2QsIGlmIG5vIGxldHRlcnMgd2VyZSBzdWJtaXR0ZWQsIGhlXG4gKiBkZWNpZGVzIHRvIG1ha2UgdGhlIHRyaXAuIEltYWdpbmUgdGhhdCBOIG1vcmUgbGV0dGVycyB3ZXJlIHN1Ym1pdHRlZCBhZnRlciB0aGUgZmlyc3RcbiAqIG9uZSwgYWxsIHdpdGhpbiBhIHNob3J0IHBlcmlvZCBvZiB0aW1lIGJldHdlZW4gZWFjaCBvdGhlci4gRXZlbiB0aG91Z2ggTisxXG4gKiBzdWJtaXNzaW9ucyBvY2N1cnJlZCwgb25seSAxIGRlbGl2ZXJ5IHdhcyBtYWRlLlxuICpcbiAqIFRoZSBkZWxheWVyIG9mZmVycyB0aGlzIGJlaGF2aW9yIHZpYSB0aGUgdHJpZ2dlcigpIG1ldGhvZCwgaW50byB3aGljaCBib3RoIHRoZSB0YXNrXG4gKiB0byBiZSBleGVjdXRlZCBhbmQgdGhlIHdhaXRpbmcgcGVyaW9kIChkZWxheSkgbXVzdCBiZSBwYXNzZWQgaW4gYXMgYXJndW1lbnRzLiBGb2xsb3dpbmdcbiAqIHRoZSBleGFtcGxlOlxuICpcbiAqIFx0XHRjb25zdCBkZWxheWVyID0gbmV3IERlbGF5ZXIoV0FJVElOR19QRVJJT0QpO1xuICogXHRcdGNvbnN0IGxldHRlcnMgPSBbXTtcbiAqXG4gKiBcdFx0ZnVuY3Rpb24gbGV0dGVyUmVjZWl2ZWQobCkge1xuICogXHRcdFx0bGV0dGVycy5wdXNoKGwpO1xuICogXHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHsgcmV0dXJuIG1ha2VUaGVUcmlwKCk7IH0pO1xuICogXHRcdH1cbiAqL1xuZXhwb3J0IGNsYXNzIERlbGF5ZXI8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBkZWZlcnJlZDogSVNjaGVkdWxlZExhdGVyIHwgbnVsbDtcblx0cHJpdmF0ZSBjb21wbGV0aW9uUHJvbWlzZTogUHJvbWlzZTxhbnk+IHwgbnVsbDtcblx0cHJpdmF0ZSBkb1Jlc29sdmU6ICgodmFsdWU/OiBhbnkgfCBQcm9taXNlPGFueT4pID0+IHZvaWQpIHwgbnVsbDtcblx0cHJpdmF0ZSBkb1JlamVjdDogKChlcnI6IHVua25vd24pID0+IHZvaWQpIHwgbnVsbDtcblx0cHJpdmF0ZSB0YXNrOiBJVGFzazxUIHwgUHJvbWlzZTxUPj4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBkZWZhdWx0RGVsYXk6IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSkge1xuXHRcdHRoaXMuZGVmZXJyZWQgPSBudWxsO1xuXHRcdHRoaXMuY29tcGxldGlvblByb21pc2UgPSBudWxsO1xuXHRcdHRoaXMuZG9SZXNvbHZlID0gbnVsbDtcblx0XHR0aGlzLmRvUmVqZWN0ID0gbnVsbDtcblx0XHR0aGlzLnRhc2sgPSBudWxsO1xuXHR9XG5cblx0dHJpZ2dlcih0YXNrOiBJVGFzazxUIHwgUHJvbWlzZTxUPj4sIGRlbGF5ID0gdGhpcy5kZWZhdWx0RGVsYXkpOiBQcm9taXNlPFQ+IHtcblx0XHR0aGlzLnRhc2sgPSB0YXNrO1xuXHRcdHRoaXMuY2FuY2VsVGltZW91dCgpO1xuXG5cdFx0aWYgKCF0aGlzLmNvbXBsZXRpb25Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLmNvbXBsZXRpb25Qcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRvUmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0XHRcdHRoaXMuZG9SZWplY3QgPSByZWplY3Q7XG5cdFx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5jb21wbGV0aW9uUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdHRoaXMuZG9SZXNvbHZlID0gbnVsbDtcblx0XHRcdFx0aWYgKHRoaXMudGFzaykge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2sgPSB0aGlzLnRhc2s7XG5cdFx0XHRcdFx0dGhpcy50YXNrID0gbnVsbDtcblx0XHRcdFx0XHRyZXR1cm4gdGFzaygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBmbiA9ICgpID0+IHtcblx0XHRcdHRoaXMuZGVmZXJyZWQgPSBudWxsO1xuXHRcdFx0dGhpcy5kb1Jlc29sdmU/LihudWxsKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5kZWZlcnJlZCA9IGRlbGF5ID09PSBNaWNyb3Rhc2tEZWxheSA/IG1pY3JvdGFza0RlZmVycmVkKGZuKSA6IHRpbWVvdXREZWZlcnJlZChkZWxheSwgZm4pO1xuXG5cdFx0cmV0dXJuIHRoaXMuY29tcGxldGlvblByb21pc2U7XG5cdH1cblxuXHRpc1RyaWdnZXJlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmRlZmVycmVkPy5pc1RyaWdnZXJlZCgpO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsVGltZW91dCgpO1xuXG5cdFx0aWYgKHRoaXMuY29tcGxldGlvblByb21pc2UpIHtcblx0XHRcdHRoaXMuZG9SZWplY3Q/LihuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR0aGlzLmNvbXBsZXRpb25Qcm9taXNlID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbFRpbWVvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5kZWZlcnJlZD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGVmZXJyZWQgPSBudWxsO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbCgpO1xuXHR9XG59XG5cbi8qKlxuICogQSBoZWxwZXIgdG8gZGVsYXkgZXhlY3V0aW9uIG9mIGEgdGFzayB0aGF0IGlzIGJlaW5nIHJlcXVlc3RlZCBvZnRlbiwgd2hpbGVcbiAqIHByZXZlbnRpbmcgYWNjdW11bGF0aW9uIG9mIGNvbnNlY3V0aXZlIGV4ZWN1dGlvbnMsIHdoaWxlIHRoZSB0YXNrIHJ1bnMuXG4gKlxuICogVGhlIG1haWwgbWFuIGlzIGNsZXZlciBhbmQgd2FpdHMgZm9yIGEgY2VydGFpbiBhbW91bnQgb2YgdGltZSwgYmVmb3JlIGdvaW5nXG4gKiBvdXQgdG8gZGVsaXZlciBsZXR0ZXJzLiBXaGlsZSB0aGUgbWFpbCBtYW4gaXMgZ29pbmcgb3V0LCBtb3JlIGxldHRlcnMgYXJyaXZlXG4gKiBhbmQgY2FuIG9ubHkgYmUgZGVsaXZlcmVkIG9uY2UgaGUgaXMgYmFjay4gT25jZSBoZSBpcyBiYWNrIHRoZSBtYWlsIG1hbiB3aWxsXG4gKiBkbyBvbmUgbW9yZSB0cmlwIHRvIGRlbGl2ZXIgdGhlIGxldHRlcnMgdGhhdCBoYXZlIGFjY3VtdWxhdGVkIHdoaWxlIGhlIHdhcyBvdXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUaHJvdHRsZWREZWxheWVyPFQ+IHtcblxuXHRwcml2YXRlIGRlbGF5ZXI6IERlbGF5ZXI8UHJvbWlzZTxUPj47XG5cdHByaXZhdGUgdGhyb3R0bGVyOiBUaHJvdHRsZXI7XG5cblx0Y29uc3RydWN0b3IoZGVmYXVsdERlbGF5OiBudW1iZXIpIHtcblx0XHR0aGlzLmRlbGF5ZXIgPSBuZXcgRGVsYXllcihkZWZhdWx0RGVsYXkpO1xuXHRcdHRoaXMudGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXHR9XG5cblx0dHJpZ2dlcihwcm9taXNlRmFjdG9yeTogSUNhbmNlbGxhYmxlVGFzazxQcm9taXNlPFQ+PiwgZGVsYXk/OiBudW1iZXIpOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5kZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy50aHJvdHRsZXIucXVldWUocHJvbWlzZUZhY3RvcnkpLCBkZWxheSkgYXMgdW5rbm93biBhcyBQcm9taXNlPFQ+O1xuXHR9XG5cblx0aXNUcmlnZ2VyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGVsYXllci5pc1RyaWdnZXJlZCgpO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuZGVsYXllci5jYW5jZWwoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kZWxheWVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnRocm90dGxlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGJhcnJpZXIgdGhhdCBpcyBpbml0aWFsbHkgY2xvc2VkIGFuZCB0aGVuIGJlY29tZXMgb3BlbmVkIHBlcm1hbmVudGx5LlxuICovXG5leHBvcnQgY2xhc3MgQmFycmllciB7XG5cdHByaXZhdGUgX2lzT3BlbjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcHJvbWlzZTogUHJvbWlzZTxib29sZWFuPjtcblx0cHJpdmF0ZSBfY29tcGxldGVQcm9taXNlITogKHY6IGJvb2xlYW4pID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5faXNPcGVuID0gZmFsc2U7XG5cdFx0dGhpcy5fcHJvbWlzZSA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KChjLCBlKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21wbGV0ZVByb21pc2UgPSBjO1xuXHRcdH0pO1xuXHR9XG5cblx0aXNPcGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc09wZW47XG5cdH1cblxuXHRvcGVuKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzT3BlbiA9IHRydWU7XG5cdFx0dGhpcy5fY29tcGxldGVQcm9taXNlKHRydWUpO1xuXHR9XG5cblx0d2FpdCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvbWlzZTtcblx0fVxufVxuXG4vKipcbiAqIEEgYmFycmllciB0aGF0IGlzIGluaXRpYWxseSBjbG9zZWQgYW5kIHRoZW4gYmVjb21lcyBvcGVuZWQgcGVybWFuZW50bHkgYWZ0ZXIgYSBjZXJ0YWluIHBlcmlvZCBvZlxuICogdGltZSBvciB3aGVuIG9wZW4gaXMgY2FsbGVkIGV4cGxpY2l0bHlcbiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9PcGVuQmFycmllciBleHRlbmRzIEJhcnJpZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVvdXQ6IFRpbWVvdXQ7XG5cblx0Y29uc3RydWN0b3IoYXV0b09wZW5UaW1lTXM6IG51bWJlcikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5vcGVuKCksIGF1dG9PcGVuVGltZU1zKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9wZW4oKTogdm9pZCB7XG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVvdXQpO1xuXHRcdHN1cGVyLm9wZW4oKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdGltZW91dChtaWxsaXM6IG51bWJlcik6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIHRpbWVvdXQobWlsbGlzOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD47XG5leHBvcnQgZnVuY3Rpb24gdGltZW91dChtaWxsaXM6IG51bWJlciwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgUHJvbWlzZTx2b2lkPiB7XG5cdGlmICghdG9rZW4pIHtcblx0XHRyZXR1cm4gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGltZW91dChtaWxsaXMsIHRva2VuKSk7XG5cdH1cblxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSwgbWlsbGlzKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KGhhbmRsZSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSB0aW1lb3V0IHRoYXQgY2FuIGJlIGRpc3Bvc2VkIHVzaW5nIGl0cyByZXR1cm5lZCB2YWx1ZS5cbiAqIEBwYXJhbSBoYW5kbGVyIFRoZSB0aW1lb3V0IGhhbmRsZXIuXG4gKiBAcGFyYW0gdGltZW91dCBBbiBvcHRpb25hbCB0aW1lb3V0IGluIG1pbGxpc2Vjb25kcy5cbiAqIEBwYXJhbSBzdG9yZSBBbiBvcHRpb25hbCB7QGxpbmsgRGlzcG9zYWJsZVN0b3JlfSB0aGF0IHdpbGwgaGF2ZSB0aGUgdGltZW91dCBkaXNwb3NhYmxlIG1hbmFnZWQgYXV0b21hdGljYWxseS5cbiAqXG4gKiBAZXhhbXBsZVxuICogY29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlO1xuICogLy8gQ2FsbCB0aGUgdGltZW91dCBhZnRlciAxMDAwbXMgYXQgd2hpY2ggcG9pbnQgaXQgd2lsbCBiZSBhdXRvbWF0aWNhbGx5XG4gKiAvLyBldmljdGVkIGZyb20gdGhlIHN0b3JlLlxuICogY29uc3QgdGltZW91dERpc3Bvc2FibGUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7fSwgMTAwMCwgc3RvcmUpO1xuICpcbiAqIGlmIChmb28pIHtcbiAqICAgLy8gQ2FuY2VsIHRoZSB0aW1lb3V0IGFuZCBldmljdCBpdCBmcm9tIHN0b3JlLlxuICogICB0aW1lb3V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG4gKiB9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXNwb3NhYmxlVGltZW91dChoYW5kbGVyOiAoKSA9PiB2b2lkLCB0aW1lb3V0ID0gMCwgc3RvcmU/OiBEaXNwb3NhYmxlU3RvcmUpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0aGFuZGxlcigpO1xuXHRcdGlmIChzdG9yZSkge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9LCB0aW1lb3V0KTtcblx0Y29uc3QgZGlzcG9zYWJsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRzdG9yZT8uZGVsZXRlKGRpc3Bvc2FibGUpO1xuXHR9KTtcblx0c3RvcmU/LmFkZChkaXNwb3NhYmxlKTtcblx0cmV0dXJuIGRpc3Bvc2FibGU7XG59XG5cbi8qKlxuICogVGhlIGxhcmdlc3QgZGVsYXkgKGluIG1pbGxpc2Vjb25kcykgYSBzaW5nbGUgYHNldFRpbWVvdXRgIGNhbiByZXByZXNlbnQuXG4gKiBMYXJnZXIgdmFsdWVzIG92ZXJmbG93IGl0cyBpbnRlcm5hbCAzMi1iaXQgc2lnbmVkIGludGVnZXIgYW5kIGZpcmUgKGFsbW9zdClcbiAqIGltbWVkaWF0ZWx5IGluc3RlYWQgb2Ygd2FpdGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9USU1FT1VUX0RFTEFZID0gMiAqKiAzMSAtIDE7IC8vIH4yNC44IGRheXNcblxuLyoqXG4gKiBMaWtlIHtAbGluayBkaXNwb3NhYmxlVGltZW91dH0sIGJ1dCBzdXBwb3J0cyBkZWxheXMgbGFyZ2VyIHRoYW5cbiAqIHtAbGluayBNQVhfVElNRU9VVF9ERUxBWX0gKH4yNC44IGRheXMpLCB3aGljaCBhIHNpbmdsZSBgc2V0VGltZW91dGAgY2Fubm90XG4gKiByZXByZXNlbnQuIFRoZSB3YWl0IGlzIHNwbGl0IGludG8gY2h1bmtzIGFuZCByZS1hcm1lZCB1bnRpbCB0aGUgdGFyZ2V0IHRpbWUgaXNcbiAqIHJlYWNoZWQsIHNvIHRoZSBoYW5kbGVyIGZpcmVzIGF0IGFwcHJveGltYXRlbHkgYERhdGUubm93KCkgKyB0aW1lb3V0YC5cbiAqXG4gKiBOb3RlOiBsaWtlIGBzZXRUaW1lb3V0YCwgZmlyaW5nIGlzIGJlc3QtZWZmb3J0IGFuZCBtYXkgZHJpZnQgYWNyb3NzIHN5c3RlbVxuICogc2xlZXAgb3Igd2FsbC1jbG9jayBjaGFuZ2VzOyBkbyBub3QgcmVseSBvbiBpdCBmb3IgcHJlY2lzZSBzY2hlZHVsaW5nLlxuICpcbiAqIEBwYXJhbSBoYW5kbGVyIFRoZSB0aW1lb3V0IGhhbmRsZXIuXG4gKiBAcGFyYW0gdGltZW91dCBUaGUgdGltZW91dCBpbiBtaWxsaXNlY29uZHMuIE1heSBleGNlZWQge0BsaW5rIE1BWF9USU1FT1VUX0RFTEFZfS5cbiAqIEBwYXJhbSBzdG9yZSBBbiBvcHRpb25hbCB7QGxpbmsgRGlzcG9zYWJsZVN0b3JlfSB0aGF0IHdpbGwgaGF2ZSB0aGUgdGltZW91dCBkaXNwb3NhYmxlIG1hbmFnZWQgYXV0b21hdGljYWxseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRpc3Bvc2FibGVMb25nVGltZW91dChoYW5kbGVyOiAoKSA9PiB2b2lkLCB0aW1lb3V0OiBudW1iZXIsIHN0b3JlPzogRGlzcG9zYWJsZVN0b3JlKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCB0YXJnZXQgPSBEYXRlLm5vdygpICsgdGltZW91dDtcblx0bGV0IHRpbWVyOiBUaW1lb3V0O1xuXG5cdGNvbnN0IGFybSA9ICgpID0+IHtcblx0XHRjb25zdCByZW1haW5pbmcgPSB0YXJnZXQgLSBEYXRlLm5vdygpO1xuXHRcdGlmIChyZW1haW5pbmcgPD0gMCkge1xuXHRcdFx0aGFuZGxlcigpO1xuXHRcdFx0aWYgKHN0b3JlKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aW1lciA9IHNldFRpbWVvdXQoYXJtLCBNYXRoLm1pbihyZW1haW5pbmcsIE1BWF9USU1FT1VUX0RFTEFZKSk7XG5cdH07XG5cblx0Y29uc3QgZGlzcG9zYWJsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRzdG9yZT8uZGVsZXRlKGRpc3Bvc2FibGUpO1xuXHR9KTtcblxuXHR0aW1lciA9IHNldFRpbWVvdXQoYXJtLCBNYXRoLm1pbihNYXRoLm1heCgwLCB0aW1lb3V0KSwgTUFYX1RJTUVPVVRfREVMQVkpKTtcblx0c3RvcmU/LmFkZChkaXNwb3NhYmxlKTtcblx0cmV0dXJuIGRpc3Bvc2FibGU7XG59XG5cbi8qKlxuICogUnVucyB0aGUgcHJvdmlkZWQgbGlzdCBvZiBwcm9taXNlIGZhY3RvcmllcyBpbiBzZXF1ZW50aWFsIG9yZGVyLiBUaGUgcmV0dXJuZWRcbiAqIHByb21pc2Ugd2lsbCBjb21wbGV0ZSB0byBhbiBhcnJheSBvZiByZXN1bHRzIGZyb20gZWFjaCBwcm9taXNlLlxuICovXG5cbmV4cG9ydCBmdW5jdGlvbiBzZXF1ZW5jZTxUPihwcm9taXNlRmFjdG9yaWVzOiBJVGFzazxQcm9taXNlPFQ+PltdKTogUHJvbWlzZTxUW10+IHtcblx0Y29uc3QgcmVzdWx0czogVFtdID0gW107XG5cdGxldCBpbmRleCA9IDA7XG5cdGNvbnN0IGxlbiA9IHByb21pc2VGYWN0b3JpZXMubGVuZ3RoO1xuXG5cdGZ1bmN0aW9uIG5leHQoKTogUHJvbWlzZTxUPiB8IG51bGwge1xuXHRcdHJldHVybiBpbmRleCA8IGxlbiA/IHByb21pc2VGYWN0b3JpZXNbaW5kZXgrK10oKSA6IG51bGw7XG5cdH1cblxuXHRmdW5jdGlvbiB0aGVuSGFuZGxlcihyZXN1bHQ6IHVua25vd24pOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCAmJiByZXN1bHQgIT09IG51bGwpIHtcblx0XHRcdHJlc3VsdHMucHVzaChyZXN1bHQgYXMgVCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbiA9IG5leHQoKTtcblx0XHRpZiAobikge1xuXHRcdFx0cmV0dXJuIG4udGhlbih0aGVuSGFuZGxlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHRzKTtcblx0fVxuXG5cdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCkudGhlbih0aGVuSGFuZGxlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaXJzdDxUPihwcm9taXNlRmFjdG9yaWVzOiBJVGFzazxQcm9taXNlPFQ+PltdLCBzaG91bGRTdG9wOiAodDogVCkgPT4gYm9vbGVhbiA9IHQgPT4gISF0LCBkZWZhdWx0VmFsdWU6IFQgfCBudWxsID0gbnVsbCk6IFByb21pc2U8VCB8IG51bGw+IHtcblx0bGV0IGluZGV4ID0gMDtcblx0Y29uc3QgbGVuID0gcHJvbWlzZUZhY3Rvcmllcy5sZW5ndGg7XG5cblx0Y29uc3QgbG9vcDogKCkgPT4gUHJvbWlzZTxUIHwgbnVsbD4gPSAoKSA9PiB7XG5cdFx0aWYgKGluZGV4ID49IGxlbikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkZWZhdWx0VmFsdWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhY3RvcnkgPSBwcm9taXNlRmFjdG9yaWVzW2luZGV4KytdO1xuXHRcdGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFjdG9yeSgpKTtcblxuXHRcdHJldHVybiBwcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChzaG91bGRTdG9wKHJlc3VsdCkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbG9vcCgpO1xuXHRcdH0pO1xuXHR9O1xuXG5cdHJldHVybiBsb29wKCk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIHRoZSBmaXJzdCBwcm9taXNlIHRoYXQgbWF0Y2hlcyB0aGUgXCJzaG91bGRTdG9wXCIsXG4gKiBydW5uaW5nIGFsbCBwcm9taXNlcyBpbiBwYXJhbGxlbC4gU3VwcG9ydHMgY2FuY2VsYWJsZSBwcm9taXNlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpcnN0UGFyYWxsZWw8VD4ocHJvbWlzZUxpc3Q6IFByb21pc2U8VD5bXSwgc2hvdWxkU3RvcD86ICh0OiBUKSA9PiBib29sZWFuLCBkZWZhdWx0VmFsdWU/OiBUIHwgbnVsbCk6IFByb21pc2U8VCB8IG51bGw+O1xuZXhwb3J0IGZ1bmN0aW9uIGZpcnN0UGFyYWxsZWw8VCwgUiBleHRlbmRzIFQ+KHByb21pc2VMaXN0OiBQcm9taXNlPFQ+W10sIHNob3VsZFN0b3A6ICh0OiBUKSA9PiB0IGlzIFIsIGRlZmF1bHRWYWx1ZT86IFIgfCBudWxsKTogUHJvbWlzZTxSIHwgbnVsbD47XG5leHBvcnQgZnVuY3Rpb24gZmlyc3RQYXJhbGxlbDxUPihwcm9taXNlTGlzdDogUHJvbWlzZTxUPltdLCBzaG91bGRTdG9wOiAodDogVCkgPT4gYm9vbGVhbiA9IHQgPT4gISF0LCBkZWZhdWx0VmFsdWU6IFQgfCBudWxsID0gbnVsbCkge1xuXHRpZiAocHJvbWlzZUxpc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkZWZhdWx0VmFsdWUpO1xuXHR9XG5cblx0bGV0IHRvZG8gPSBwcm9taXNlTGlzdC5sZW5ndGg7XG5cdGNvbnN0IGZpbmlzaCA9ICgpID0+IHtcblx0XHR0b2RvID0gLTE7XG5cdFx0Zm9yIChjb25zdCBwcm9taXNlIG9mIHByb21pc2VMaXN0KSB7XG5cdFx0XHQocHJvbWlzZSBhcyBQYXJ0aWFsPENhbmNlbGFibGVQcm9taXNlPFQ+PikuY2FuY2VsPy4oKTtcblx0XHR9XG5cdH07XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPFQgfCBudWxsPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Zm9yIChjb25zdCBwcm9taXNlIG9mIHByb21pc2VMaXN0KSB7XG5cdFx0XHRwcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0aWYgKC0tdG9kbyA+PSAwICYmIHNob3VsZFN0b3AocmVzdWx0KSkge1xuXHRcdFx0XHRcdGZpbmlzaCgpO1xuXHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0fSBlbHNlIGlmICh0b2RvID09PSAwKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShkZWZhdWx0VmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdFx0XHQuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRpZiAoLS10b2RvID49IDApIHtcblx0XHRcdFx0XHRcdGZpbmlzaCgpO1xuXHRcdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgSUxpbWl0ZWRUYXNrRmFjdG9yeTxUPiB7XG5cdGZhY3Rvcnk6IElUYXNrPFByb21pc2U8VD4+O1xuXHRjOiAodmFsdWU6IFQgfCBQcm9taXNlPFQ+KSA9PiB2b2lkO1xuXHRlOiAoZXJyb3I/OiB1bmtub3duKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaW1pdGVyPFQ+IHtcblxuXHRyZWFkb25seSBzaXplOiBudW1iZXI7XG5cblx0cXVldWUoZmFjdG9yeTogSVRhc2s8UHJvbWlzZTxUPj4pOiBQcm9taXNlPFQ+O1xuXG5cdGNsZWFyKCk6IHZvaWQ7XG59XG5cbi8qKlxuICogQSBoZWxwZXIgdG8gcXVldWUgTiBwcm9taXNlcyBhbmQgcnVuIHRoZW0gYWxsIHdpdGggYSBtYXggZGVncmVlIG9mIHBhcmFsbGVsaXNtLiBUaGUgaGVscGVyXG4gKiBlbnN1cmVzIHRoYXQgYXQgYW55IHRpbWUgbm8gbW9yZSB0aGFuIE0gcHJvbWlzZXMgYXJlIHJ1bm5pbmcgYXQgdGhlIHNhbWUgdGltZS5cbiAqL1xuZXhwb3J0IGNsYXNzIExpbWl0ZXI8VD4gaW1wbGVtZW50cyBJTGltaXRlcjxUPiB7XG5cblx0cHJpdmF0ZSBfc2l6ZSA9IDA7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBydW5uaW5nUHJvbWlzZXM6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBtYXhEZWdyZWVPZlBhcmFsZWxsaXNtOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgb3V0c3RhbmRpbmdQcm9taXNlczogSUxpbWl0ZWRUYXNrRmFjdG9yeTxUPltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRyYWluZWQ6IEVtaXR0ZXI8dm9pZD47XG5cblx0Y29uc3RydWN0b3IobWF4RGVncmVlT2ZQYXJhbGVsbGlzbTogbnVtYmVyKSB7XG5cdFx0dGhpcy5tYXhEZWdyZWVPZlBhcmFsZWxsaXNtID0gbWF4RGVncmVlT2ZQYXJhbGVsbGlzbTtcblx0XHR0aGlzLm91dHN0YW5kaW5nUHJvbWlzZXMgPSBbXTtcblx0XHR0aGlzLnJ1bm5pbmdQcm9taXNlcyA9IDA7XG5cdFx0dGhpcy5fb25EcmFpbmVkID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlZCB3aGVuIGFsbCB3b3JrIGlzIGRvbmUgKG9uRHJhaW5lZCkgb3Igd2hlblxuXHQgKiB0aGVyZSBpcyBub3RoaW5nIHRvIGRvXG5cdCAqL1xuXHR3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zaXplID4gMFxuXHRcdFx0PyBFdmVudC50b1Byb21pc2UodGhpcy5vbkRyYWluZWQpXG5cdFx0XHQ6IFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0Z2V0IG9uRHJhaW5lZCgpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRHJhaW5lZC5ldmVudDtcblx0fVxuXG5cdGdldCBzaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemU7XG5cdH1cblxuXHRxdWV1ZShmYWN0b3J5OiBJVGFzazxQcm9taXNlPFQ+Pik6IFByb21pc2U8VD4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ09iamVjdCBoYXMgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdH1cblx0XHR0aGlzLl9zaXplKys7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VD4oKGMsIGUpID0+IHtcblx0XHRcdHRoaXMub3V0c3RhbmRpbmdQcm9taXNlcy5wdXNoKHsgZmFjdG9yeSwgYywgZSB9KTtcblx0XHRcdHRoaXMuY29uc3VtZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdW1lKCk6IHZvaWQge1xuXHRcdHdoaWxlICh0aGlzLm91dHN0YW5kaW5nUHJvbWlzZXMubGVuZ3RoICYmIHRoaXMucnVubmluZ1Byb21pc2VzIDwgdGhpcy5tYXhEZWdyZWVPZlBhcmFsZWxsaXNtKSB7XG5cdFx0XHRjb25zdCBpTGltaXRlZFRhc2sgPSB0aGlzLm91dHN0YW5kaW5nUHJvbWlzZXMuc2hpZnQoKSE7XG5cdFx0XHR0aGlzLnJ1bm5pbmdQcm9taXNlcysrO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gaUxpbWl0ZWRUYXNrLmZhY3RvcnkoKTtcblx0XHRcdHByb21pc2UudGhlbihpTGltaXRlZFRhc2suYywgaUxpbWl0ZWRUYXNrLmUpO1xuXHRcdFx0cHJvbWlzZS50aGVuKCgpID0+IHRoaXMuY29uc3VtZWQoKSwgKCkgPT4gdGhpcy5jb25zdW1lZCgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbnN1bWVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucnVubmluZ1Byb21pc2VzLS07XG5cdFx0aWYgKC0tdGhpcy5fc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb25EcmFpbmVkLmZpcmUoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vdXRzdGFuZGluZ1Byb21pc2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuY29uc3VtZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ09iamVjdCBoYXMgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdH1cblx0XHR0aGlzLm91dHN0YW5kaW5nUHJvbWlzZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9zaXplID0gdGhpcy5ydW5uaW5nUHJvbWlzZXM7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMub3V0c3RhbmRpbmdQcm9taXNlcy5sZW5ndGggPSAwOyAvLyBzdG9wIGZ1cnRoZXIgcHJvY2Vzc2luZ1xuXHRcdHRoaXMuX3NpemUgPSAwO1xuXHRcdHRoaXMuX29uRHJhaW5lZC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHF1ZXVlIGlzIGhhbmRsZXMgb25lIHByb21pc2UgYXQgYSB0aW1lIGFuZCBndWFyYW50ZWVzIHRoYXQgYXQgYW55IHRpbWUgb25seSBvbmUgcHJvbWlzZSBpcyBleGVjdXRpbmcuXG4gKi9cbmV4cG9ydCBjbGFzcyBRdWV1ZTxUPiBleHRlbmRzIExpbWl0ZXI8VD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKDEpO1xuXHR9XG59XG5cbi8qKlxuICogU2FtZSBhcyBgUXVldWVgLCBlbnN1cmVzIHRoYXQgb25seSAxIHRhc2sgaXMgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgdGltZS4gVGhlIGRpZmZlcmVuY2UgdG8gYFF1ZXVlYCBpcyB0aGF0XG4gKiB0aGVyZSBpcyBvbmx5IDEgdGFzayBhYm91dCB0byBiZSBzY2hlZHVsZWQgbmV4dC4gQXMgc3VjaCwgY2FsbGluZyBgcXVldWVgIHdoaWxlIGEgdGFzayBpcyBleGVjdXRpbmcgd2lsbFxuICogcmVwbGFjZSB0aGUgY3VycmVudGx5IHF1ZXVlZCB0YXNrIHVudGlsIGl0IGV4ZWN1dGVzLlxuICpcbiAqIEFzIHN1Y2gsIHRoZSByZXR1cm5lZCBwcm9taXNlIG1heSBub3QgYmUgZnJvbSB0aGUgZmFjdG9yeSB0aGF0IGlzIHBhc3NlZCBpbiBidXQgZnJvbSB0aGUgbmV4dCBmYWN0b3J5IHRoYXRcbiAqIGlzIHJ1bm5pbmcgYWZ0ZXIgaGF2aW5nIGNhbGxlZCBgcXVldWVgLlxuICovXG5leHBvcnQgY2xhc3MgTGltaXRlZFF1ZXVlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlcXVlbnRpYWxpemVyID0gbmV3IFRhc2tTZXF1ZW50aWFsaXplcigpO1xuXG5cdHByaXZhdGUgdGFza3MgPSAwO1xuXG5cdHF1ZXVlKGZhY3Rvcnk6IElUYXNrPFByb21pc2U8dm9pZD4+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXF1ZW50aWFsaXplci5ydW4odGhpcy50YXNrcysrLCBmYWN0b3J5KCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNlcXVlbnRpYWxpemVyLnF1ZXVlKCgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLnNlcXVlbnRpYWxpemVyLnJ1bih0aGlzLnRhc2tzKyssIGZhY3RvcnkoKSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGhlbHBlciB0byBvcmdhbml6ZSBxdWV1ZXMgcGVyIHJlc291cmNlLiBUaGUgUmVzb3VyY2VRdWV1ZSBtYWtlcyBzdXJlIHRvIG1hbmFnZSBxdWV1ZXMgcGVyIHJlc291cmNlXG4gKiBieSBkaXNwb3NpbmcgdGhlbSBvbmNlIHRoZSBxdWV1ZSBpcyBlbXB0eS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlc291cmNlUXVldWUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBxdWV1ZXMgPSBuZXcgTWFwPHN0cmluZywgUXVldWU8dm9pZD4+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkcmFpbmVycyA9IG5ldyBTZXQ8RGVmZXJyZWRQcm9taXNlPHZvaWQ+PigpO1xuXG5cdHByaXZhdGUgZHJhaW5MaXN0ZW5lcnM6IERpc3Bvc2FibGVNYXA8bnVtYmVyPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkcmFpbkxpc3RlbmVyQ291bnQgPSAwO1xuXG5cdGFzeW5jIHdoZW5EcmFpbmVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlzRHJhaW5lZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHR0aGlzLmRyYWluZXJzLmFkZChwcm9taXNlKTtcblxuXHRcdHJldHVybiBwcm9taXNlLnA7XG5cdH1cblxuXHRwcml2YXRlIGlzRHJhaW5lZCgpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IFssIHF1ZXVlXSBvZiB0aGlzLnF1ZXVlcykge1xuXHRcdFx0aWYgKHF1ZXVlLnNpemUgPiAwKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHF1ZXVlU2l6ZShyZXNvdXJjZTogVVJJLCBleHRVcmk6IElFeHRVcmkgPSBkZWZhdWx0RXh0VXJpKTogbnVtYmVyIHtcblx0XHRjb25zdCBrZXkgPSBleHRVcmkuZ2V0Q29tcGFyaXNvbktleShyZXNvdXJjZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5xdWV1ZXMuZ2V0KGtleSk/LnNpemUgPz8gMDtcblx0fVxuXG5cdHF1ZXVlRm9yKHJlc291cmNlOiBVUkksIGZhY3Rvcnk6IElUYXNrPFByb21pc2U8dm9pZD4+LCBleHRVcmk6IElFeHRVcmkgPSBkZWZhdWx0RXh0VXJpKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5ID0gZXh0VXJpLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXG5cdFx0bGV0IHF1ZXVlID0gdGhpcy5xdWV1ZXMuZ2V0KGtleSk7XG5cdFx0aWYgKCFxdWV1ZSkge1xuXHRcdFx0cXVldWUgPSBuZXcgUXVldWU8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGRyYWluTGlzdGVuZXJJZCA9IHRoaXMuZHJhaW5MaXN0ZW5lckNvdW50Kys7XG5cdFx0XHRjb25zdCBkcmFpbkxpc3RlbmVyID0gRXZlbnQub25jZShxdWV1ZS5vbkRyYWluZWQpKCgpID0+IHtcblx0XHRcdFx0cXVldWU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5xdWV1ZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHRoaXMub25EaWRRdWV1ZURyYWluKCk7XG5cblx0XHRcdFx0dGhpcy5kcmFpbkxpc3RlbmVycz8uZGVsZXRlQW5kRGlzcG9zZShkcmFpbkxpc3RlbmVySWQpO1xuXG5cdFx0XHRcdGlmICh0aGlzLmRyYWluTGlzdGVuZXJzPy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5kcmFpbkxpc3RlbmVycy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5kcmFpbkxpc3RlbmVycyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghdGhpcy5kcmFpbkxpc3RlbmVycykge1xuXHRcdFx0XHR0aGlzLmRyYWluTGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVNYXAoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZHJhaW5MaXN0ZW5lcnMuc2V0KGRyYWluTGlzdGVuZXJJZCwgZHJhaW5MaXN0ZW5lcik7XG5cblx0XHRcdHRoaXMucXVldWVzLnNldChrZXksIHF1ZXVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcXVldWUucXVldWUoZmFjdG9yeSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUXVldWVEcmFpbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNEcmFpbmVkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGRvbmUgeWV0XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWxlYXNlRHJhaW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVsZWFzZURyYWluZXJzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZHJhaW5lciBvZiB0aGlzLmRyYWluZXJzKSB7XG5cdFx0XHRkcmFpbmVyLmNvbXBsZXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kcmFpbmVycy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFssIHF1ZXVlXSBvZiB0aGlzLnF1ZXVlcykge1xuXHRcdFx0cXVldWUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMucXVldWVzLmNsZWFyKCk7XG5cblx0XHQvLyBFdmVuIHRob3VnaCB3ZSBtaWdodCBzdGlsbCBoYXZlIHBlbmRpbmdcblx0XHQvLyB0YXNrcyBxdWV1ZWQsIGFmdGVyIHRoZSBxdWV1ZXMgaGF2ZSBiZWVuXG5cdFx0Ly8gZGlzcG9zZWQsIHdlIGNhbiBubyBsb25nZXIgdHJhY2sgdGhlbSwgc29cblx0XHQvLyB3ZSByZWxlYXNlIGRyYWluZXJzIHRvIHByZXZlbnQgaGFuZ2luZ1xuXHRcdC8vIHByb21pc2VzIHdoZW4gdGhlIHJlc291cmNlIHF1ZXVlIGlzIGJlaW5nXG5cdFx0Ly8gZGlzcG9zZWQuXG5cdFx0dGhpcy5yZWxlYXNlRHJhaW5lcnMoKTtcblxuXHRcdHRoaXMuZHJhaW5MaXN0ZW5lcnM/LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBUYXNrPFQgPSB2b2lkPiA9ICgpID0+IChQcm9taXNlPFQ+IHwgVCk7XG5cbi8qKlxuICogV3JhcCBhIHR5cGUgaW4gYW4gb3B0aW9uYWwgcHJvbWlzZS4gVGhpcyBjYW4gYmUgdXNlZnVsIHRvIGF2b2lkIHRoZSBydW50aW1lXG4gKiBvdmVyaGVhZCBvZiBjcmVhdGluZyBhIHByb21pc2UuXG4gKi9cbmV4cG9ydCB0eXBlIE1heWJlUHJvbWlzZTxUPiA9IFByb21pc2U8VD4gfCBUO1xuXG4vKipcbiAqIFByb2Nlc3NlcyB0YXNrcyBpbiB0aGUgb3JkZXIgdGhleSB3ZXJlIHNjaGVkdWxlZC5cbiovXG5leHBvcnQgY2xhc3MgVGFza1F1ZXVlIHtcblx0cHJpdmF0ZSBfcnVubmluZ1Rhc2s6IFRhc2s8YW55PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVuZGluZ1Rhc2tzOiB7IHRhc2s6IFRhc2s8YW55PjsgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTxhbnk+OyBzZXRVbmRlZmluZWRXaGVuQ2xlYXJlZDogYm9vbGVhbiB9W10gPSBbXTtcblxuXHQvKipcblx0ICogV2FpdHMgZm9yIHRoZSBjdXJyZW50IGFuZCBwZW5kaW5nIHRhc2tzIHRvIGZpbmlzaCwgdGhlbiBydW5zIGFuZCBhd2FpdHMgdGhlIGdpdmVuIHRhc2suXG5cdCAqIElmIHRoZSB0YXNrIGlzIHNraXBwZWQgYmVjYXVzZSBvZiBjbGVhclBlbmRpbmcsIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIHdpdGggYSBDYW5jZWxsYXRpb25FcnJvci5cblx0Ki9cblx0cHVibGljIHNjaGVkdWxlPFQ+KHRhc2s6IFRhc2s8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8VD4oKTtcblx0XHR0aGlzLl9wZW5kaW5nVGFza3MucHVzaCh7IHRhc2ssIGRlZmVycmVkLCBzZXRVbmRlZmluZWRXaGVuQ2xlYXJlZDogZmFsc2UgfSk7XG5cdFx0dGhpcy5fcnVuSWZOb3RSdW5uaW5nKCk7XG5cdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdH1cblxuXHQvKipcblx0ICogV2FpdHMgZm9yIHRoZSBjdXJyZW50IGFuZCBwZW5kaW5nIHRhc2tzIHRvIGZpbmlzaCwgdGhlbiBydW5zIGFuZCBhd2FpdHMgdGhlIGdpdmVuIHRhc2suXG5cdCAqIElmIHRoZSB0YXNrIGlzIHNraXBwZWQgYmVjYXVzZSBvZiBjbGVhclBlbmRpbmcsIHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdW5kZWZpbmVkLlxuXHQqL1xuXHRwdWJsaWMgc2NoZWR1bGVTa2lwSWZDbGVhcmVkPFQ+KHRhc2s6IFRhc2s8VD4pOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8VD4oKTtcblx0XHR0aGlzLl9wZW5kaW5nVGFza3MucHVzaCh7IHRhc2ssIGRlZmVycmVkLCBzZXRVbmRlZmluZWRXaGVuQ2xlYXJlZDogdHJ1ZSB9KTtcblx0XHR0aGlzLl9ydW5JZk5vdFJ1bm5pbmcoKTtcblx0XHRyZXR1cm4gZGVmZXJyZWQucDtcblx0fVxuXG5cdHByaXZhdGUgX3J1bklmTm90UnVubmluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcnVubmluZ1Rhc2sgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvY2Vzc1F1ZXVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nVGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuX3BlbmRpbmdUYXNrcy5zaGlmdCgpO1xuXHRcdGlmICghbmV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9ydW5uaW5nVGFzaykge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3J1bm5pbmdUYXNrID0gbmV4dC50YXNrO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5leHQudGFzaygpO1xuXHRcdFx0bmV4dC5kZWZlcnJlZC5jb21wbGV0ZShyZXN1bHQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG5leHQuZGVmZXJyZWQuZXJyb3IoZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3J1bm5pbmdUYXNrID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyBhbGwgcGVuZGluZyB0YXNrcy4gRG9lcyBub3QgY2FuY2VsIHRoZSBjdXJyZW50bHkgcnVubmluZyB0YXNrLlxuXHQqL1xuXHRwdWJsaWMgY2xlYXJQZW5kaW5nKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRhc2tzID0gdGhpcy5fcGVuZGluZ1Rhc2tzO1xuXHRcdHRoaXMuX3BlbmRpbmdUYXNrcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0aWYgKHRhc2suc2V0VW5kZWZpbmVkV2hlbkNsZWFyZWQpIHtcblx0XHRcdFx0dGFzay5kZWZlcnJlZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGFzay5kZWZlcnJlZC5lcnJvcihuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUaW1lb3V0VGltZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3Rva2VuOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoKTtcblx0Y29uc3RydWN0b3IocnVubmVyOiAoKSA9PiB2b2lkLCB0aW1lb3V0OiBudW1iZXIpO1xuXHRjb25zdHJ1Y3RvcihydW5uZXI/OiAoKSA9PiB2b2lkLCB0aW1lb3V0PzogbnVtYmVyKSB7XG5cdFx0dGhpcy5fdG9rZW4gPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodHlwZW9mIHJ1bm5lciA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgdGltZW91dCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuc2V0SWZOb3RTZXQocnVubmVyLCB0aW1lb3V0KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdH1cblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Rva2VuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl90b2tlbik7XG5cdFx0XHR0aGlzLl90b2tlbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRjYW5jZWxBbmRTZXQocnVubmVyOiAoKSA9PiB2b2lkLCB0aW1lb3V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcihgQ2FsbGluZyAnY2FuY2VsQW5kU2V0JyBvbiBhIGRpc3Bvc2VkIFRpbWVvdXRUaW1lcmApO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0dGhpcy5fdG9rZW4gPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3Rva2VuID0gdW5kZWZpbmVkO1xuXHRcdFx0cnVubmVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdH1cblxuXHRzZXRJZk5vdFNldChydW5uZXI6ICgpID0+IHZvaWQsIHRpbWVvdXQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBDYWxsaW5nICdzZXRJZk5vdFNldCcgb24gYSBkaXNwb3NlZCBUaW1lb3V0VGltZXJgKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdG9rZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gdGltZXIgaXMgYWxyZWFkeSBzZXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdG9rZW4gPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3Rva2VuID0gdW5kZWZpbmVkO1xuXHRcdFx0cnVubmVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEludGVydmFsVGltZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNhbmNlbEFuZFNldChydW5uZXI6ICgpID0+IHZvaWQsIGludGVydmFsOiBudW1iZXIsIGNvbnRleHQgPSBnbG9iYWxUaGlzKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcihgQ2FsbGluZyAnY2FuY2VsQW5kU2V0JyBvbiBhIGRpc3Bvc2VkIEludGVydmFsVGltZXJgKTtcblx0XHR9XG5cblx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IGNvbnRleHQuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0cnVubmVyKCk7XG5cdFx0fSwgaW50ZXJ2YWwpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnRleHQuY2xlYXJJbnRlcnZhbChoYW5kbGUpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdHRoaXMuaXNEaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1bk9uY2VTY2hlZHVsZXI8UnVubmVyIGV4dGVuZHMgKC4uLmFyZ3M6IGFueVtdKSA9PiBhbnkgPSAoKSA9PiBhbnk+IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCBydW5uZXI6IFJ1bm5lciB8IG51bGw7XG5cblx0cHJpdmF0ZSB0aW1lb3V0VG9rZW46IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGltZW91dDogbnVtYmVyO1xuXHRwcml2YXRlIHRpbWVvdXRIYW5kbGVyOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKHJ1bm5lcjogUnVubmVyLCBkZWxheTogbnVtYmVyKSB7XG5cdFx0dGhpcy50aW1lb3V0VG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5ydW5uZXIgPSBydW5uZXI7XG5cdFx0dGhpcy50aW1lb3V0ID0gZGVsYXk7XG5cdFx0dGhpcy50aW1lb3V0SGFuZGxlciA9IHRoaXMub25UaW1lb3V0LmJpbmQodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZSBSdW5PbmNlU2NoZWR1bGVyXG5cdCAqL1xuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0dGhpcy5ydW5uZXIgPSBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbCBjdXJyZW50IHNjaGVkdWxlZCBydW5uZXIgKGlmIGFueSkuXG5cdCAqL1xuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMudGltZW91dFRva2VuKTtcblx0XHRcdHRoaXMudGltZW91dFRva2VuID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgcHJldmlvdXMgcnVubmVyIChpZiBhbnkpICYgc2NoZWR1bGUgYSBuZXcgcnVubmVyLlxuXHQgKi9cblx0c2NoZWR1bGUoZGVsYXkgPSB0aGlzLnRpbWVvdXQpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdHRoaXMudGltZW91dFRva2VuID0gc2V0VGltZW91dCh0aGlzLnRpbWVvdXRIYW5kbGVyLCBkZWxheSk7XG5cdH1cblxuXHRnZXQgZGVsYXkoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50aW1lb3V0O1xuXHR9XG5cblx0c2V0IGRlbGF5KHZhbHVlOiBudW1iZXIpIHtcblx0XHR0aGlzLnRpbWVvdXQgPSB2YWx1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgc2NoZWR1bGVkLlxuXHQgKi9cblx0aXNTY2hlZHVsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudGltZW91dFRva2VuICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRmbHVzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5kb1J1bigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25UaW1lb3V0KCkge1xuXHRcdHRoaXMudGltZW91dFRva2VuID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnJ1bm5lcikge1xuXHRcdFx0dGhpcy5kb1J1bigpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBkb1J1bigpOiB2b2lkIHtcblx0XHR0aGlzLnJ1bm5lcj8uKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBTYW1lIGFzIGBSdW5PbmNlU2NoZWR1bGVyYCwgYnV0IGRvZXNuJ3QgY291bnQgdGhlIHRpbWUgc3BlbnQgaW4gc2xlZXAgbW9kZS5cbiAqID4gKipOT1RFKio6IE9ubHkgb2ZmZXJzIDFzIHJlc29sdXRpb24uXG4gKlxuICogV2hlbiBjYWxsaW5nIGBzZXRUaW1lb3V0YCB3aXRoIDNocnMsIGFuZCBwdXR0aW5nIHRoZSBjb21wdXRlciBpbW1lZGlhdGVseSB0byBzbGVlcFxuICogZm9yIDhocnMsIGBzZXRUaW1lb3V0YCB3aWxsIGZpcmUgKiphcyBzb29uIGFzIHRoZSBjb21wdXRlciB3YWtlcyBmcm9tIHNsZWVwKiouIEJ1dFxuICogdGhpcyBzY2hlZHVsZXIgd2lsbCBleGVjdXRlIDNocnMgKiphZnRlciB3YWtpbmcgdGhlIGNvbXB1dGVyIGZyb20gc2xlZXAqKi5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb2Nlc3NUaW1lUnVuT25jZVNjaGVkdWxlciB7XG5cblx0cHJpdmF0ZSBydW5uZXI6ICgoKSA9PiB2b2lkKSB8IG51bGw7XG5cdHByaXZhdGUgdGltZW91dDogbnVtYmVyO1xuXG5cdHByaXZhdGUgY291bnRlcjogbnVtYmVyO1xuXHRwcml2YXRlIGludGVydmFsVG9rZW46IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW50ZXJ2YWxIYW5kbGVyOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKHJ1bm5lcjogKCkgPT4gdm9pZCwgZGVsYXk6IG51bWJlcikge1xuXHRcdGlmIChkZWxheSAlIDEwMDAgIT09IDApIHtcblx0XHRcdGNvbnNvbGUud2FybihgUHJvY2Vzc1RpbWVSdW5PbmNlU2NoZWR1bGVyIHJlc29sdXRpb24gaXMgMXMsICR7ZGVsYXl9bXMgaXMgbm90IGEgbXVsdGlwbGUgb2YgMTAwMG1zLmApO1xuXHRcdH1cblx0XHR0aGlzLnJ1bm5lciA9IHJ1bm5lcjtcblx0XHR0aGlzLnRpbWVvdXQgPSBkZWxheTtcblx0XHR0aGlzLmNvdW50ZXIgPSAwO1xuXHRcdHRoaXMuaW50ZXJ2YWxUb2tlbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmludGVydmFsSGFuZGxlciA9IHRoaXMub25JbnRlcnZhbC5iaW5kKHRoaXMpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdHRoaXMucnVubmVyID0gbnVsbDtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRjbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWxUb2tlbik7XG5cdFx0XHR0aGlzLmludGVydmFsVG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbCBwcmV2aW91cyBydW5uZXIgKGlmIGFueSkgJiBzY2hlZHVsZSBhIG5ldyBydW5uZXIuXG5cdCAqL1xuXHRzY2hlZHVsZShkZWxheSA9IHRoaXMudGltZW91dCk6IHZvaWQge1xuXHRcdGlmIChkZWxheSAlIDEwMDAgIT09IDApIHtcblx0XHRcdGNvbnNvbGUud2FybihgUHJvY2Vzc1RpbWVSdW5PbmNlU2NoZWR1bGVyIHJlc29sdXRpb24gaXMgMXMsICR7ZGVsYXl9bXMgaXMgbm90IGEgbXVsdGlwbGUgb2YgMTAwMG1zLmApO1xuXHRcdH1cblx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdHRoaXMuY291bnRlciA9IE1hdGguY2VpbChkZWxheSAvIDEwMDApO1xuXHRcdHRoaXMuaW50ZXJ2YWxUb2tlbiA9IHNldEludGVydmFsKHRoaXMuaW50ZXJ2YWxIYW5kbGVyLCAxMDAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgc2NoZWR1bGVkLlxuXHQgKi9cblx0aXNTY2hlZHVsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW50ZXJ2YWxUb2tlbiAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkludGVydmFsKCkge1xuXHRcdHRoaXMuY291bnRlci0tO1xuXHRcdGlmICh0aGlzLmNvdW50ZXIgPiAwKSB7XG5cdFx0XHQvLyBzdGlsbCBuZWVkIHRvIHdhaXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB0aW1lIGVsYXBzZWRcblx0XHRjbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWxUb2tlbik7XG5cdFx0dGhpcy5pbnRlcnZhbFRva2VuID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMucnVubmVyPy4oKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUnVuT25jZVdvcmtlcjxUPiBleHRlbmRzIFJ1bk9uY2VTY2hlZHVsZXI8KHVuaXRzOiBUW10pID0+IHZvaWQ+IHtcblxuXHRwcml2YXRlIHVuaXRzOiBUW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihydW5uZXI6ICh1bml0czogVFtdKSA9PiB2b2lkLCB0aW1lb3V0OiBudW1iZXIpIHtcblx0XHRzdXBlcihydW5uZXIsIHRpbWVvdXQpO1xuXHR9XG5cblx0d29yayh1bml0OiBUKTogdm9pZCB7XG5cdFx0dGhpcy51bml0cy5wdXNoKHVuaXQpO1xuXG5cdFx0aWYgKCF0aGlzLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHRoaXMuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZG9SdW4oKTogdm9pZCB7XG5cdFx0Y29uc3QgdW5pdHMgPSB0aGlzLnVuaXRzO1xuXHRcdHRoaXMudW5pdHMgPSBbXTtcblxuXHRcdHRoaXMucnVubmVyPy4odW5pdHMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnVuaXRzID0gW107XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGhyb3R0bGVkV29ya2VyT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIG1heGltdW0gb2YgdW5pdHMgdGhlIHdvcmtlciB3aWxsIHBhc3Mgb250byBoYW5kbGVyIGF0IG9uY2Vcblx0ICovXG5cdG1heFdvcmtDaHVua1NpemU6IG51bWJlcjtcblxuXHQvKipcblx0ICogbWF4aW11bSBvZiB1bml0cyB0aGUgd29ya2VyIHdpbGwga2VlcCBpbiBtZW1vcnkgZm9yIHByb2Nlc3Npbmdcblx0ICovXG5cdG1heEJ1ZmZlcmVkV29yazogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBkZWxheSBiZWZvcmUgcHJvY2Vzc2luZyB0aGUgbmV4dCByb3VuZCBvZiBjaHVua3Mgd2hlbiBjaHVuayBzaXplIGV4Y2VlZHMgbGltaXRzXG5cdCAqL1xuXHR0aHJvdHRsZURlbGF5OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFdoZW4gZW5hYmxlZCB3aWxsIGd1YXJhbnRlZSB0aGF0IHR3byBkaXN0aW5jdCBjYWxscyB0byBgd29yaygpYCBhcmUgbm90IGV4ZWN1dGVkXG5cdCAqIHdpdGhvdXQgdGhyb3R0bGUgZGVsYXkgYmV0d2VlbiB0aGVtLlxuXHQgKiBPdGhlcndpc2UgaWYgdGhlIHdvcmtlciBpc24ndCBjdXJyZW50bHkgdGhyb3R0bGluZyBpdCB3aWxsIGV4ZWN1dGUgd29yayBpbW1lZGlhdGVseS5cblx0ICovXG5cdHdhaXRUaHJvdHRsZURlbGF5QmV0d2VlbldvcmtVbml0cz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogVGhlIGBUaHJvdHRsZWRXb3JrZXJgIHdpbGwgYWNjZXB0IHVuaXRzIG9mIHdvcmsgYFRgXG4gKiB0byBoYW5kbGUuIFRoZSBjb250cmFjdCBpczpcbiAqICogdGhlcmUgaXMgYSBtYXhpbXVtIG9mIHVuaXRzIHRoZSB3b3JrZXIgY2FuIGhhbmRsZSBhdCBvbmNlICh2aWEgYG1heFdvcmtDaHVua1NpemVgKVxuICogKiB0aGVyZSBpcyBhIG1heGltdW0gb2YgdW5pdHMgdGhlIHdvcmtlciB3aWxsIGtlZXAgaW4gbWVtb3J5IGZvciBwcm9jZXNzaW5nICh2aWEgYG1heEJ1ZmZlcmVkV29ya2ApXG4gKiAqIGFmdGVyIGhhdmluZyBoYW5kbGVkIGBtYXhXb3JrQ2h1bmtTaXplYCB1bml0cywgdGhlIHdvcmtlciBuZWVkcyB0byByZXN0ICh2aWEgYHRocm90dGxlRGVsYXlgKVxuICovXG5leHBvcnQgY2xhc3MgVGhyb3R0bGVkV29ya2VyPFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nV29yazogVFtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSB0aHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8UnVuT25jZVNjaGVkdWxlcj4oKSk7XG5cdHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBsYXN0RXhlY3V0aW9uVGltZSA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBvcHRpb25zOiBJVGhyb3R0bGVkV29ya2VyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhhbmRsZXI6ICh1bml0czogVFtdKSA9PiB2b2lkXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiB3b3JrIHVuaXRzIHRoYXQgYXJlIHBlbmRpbmcgdG8gYmUgcHJvY2Vzc2VkLlxuXHQgKi9cblx0Z2V0IHBlbmRpbmcoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucGVuZGluZ1dvcmsubGVuZ3RoOyB9XG5cblx0LyoqXG5cdCAqIEFkZCB1bml0cyB0byBiZSB3b3JrZWQgb24uIFVzZSBgcGVuZGluZ2AgdG8gZmlndXJlIG91dFxuXHQgKiBob3cgbWFueSB1bml0cyBhcmUgbm90IHlldCBwcm9jZXNzZWQgYWZ0ZXIgdGhpcyBtZXRob2Rcblx0ICogd2FzIGNhbGxlZC5cblx0ICpcblx0ICogQHJldHVybnMgd2hldGhlciB0aGUgd29yayB3YXMgYWNjZXB0ZWQgb3Igbm90LiBJZiB0aGVcblx0ICogd29ya2VyIGlzIGRpc3Bvc2VkLCBpdCB3aWxsIG5vdCBhY2NlcHQgYW55IG1vcmUgd29yay5cblx0ICogSWYgdGhlIG51bWJlciBvZiBwZW5kaW5nIHVuaXRzIHdvdWxkIGJlY29tZSBsYXJnZXJcblx0ICogdGhhbiBgbWF4UGVuZGluZ1dvcmtgLCBtb3JlIHdvcmsgd2lsbCBhbHNvIG5vdCBiZSBhY2NlcHRlZC5cblx0ICovXG5cdHdvcmsodW5pdHM6IHJlYWRvbmx5IFRbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdvcmsgbm90IGFjY2VwdGVkOiBkaXNwb3NlZFxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciByZWFjaGluZyBtYXhpbXVtIG9mIHBlbmRpbmcgd29ya1xuXHRcdGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLm1heEJ1ZmZlcmVkV29yayA9PT0gJ251bWJlcicpIHtcblxuXHRcdFx0Ly8gVGhyb3R0bGVkOiBzaW1wbGUgY2hlY2sgaWYgcGVuZGluZyArIHVuaXRzIGV4Y2VlZHMgbWF4IHBlbmRpbmdcblx0XHRcdGlmICh0aGlzLnRocm90dGxlci52YWx1ZSkge1xuXHRcdFx0XHRpZiAodGhpcy5wZW5kaW5nICsgdW5pdHMubGVuZ3RoID4gdGhpcy5vcHRpb25zLm1heEJ1ZmZlcmVkV29yaykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gd29yayBub3QgYWNjZXB0ZWQ6IHRvbyBtdWNoIHBlbmRpbmcgd29ya1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVudGhyb3R0bGVkOiBzYW1lIGFzIHRocm90dGxlZCwgYnV0IGFjY291bnQgZm9yIG1heCBjaHVuayBnZXR0aW5nXG5cdFx0XHQvLyB3b3JrZWQgb24gZGlyZWN0bHkgd2l0aG91dCBiZWluZyBwZW5kaW5nXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMucGVuZGluZyArIHVuaXRzLmxlbmd0aCAtIHRoaXMub3B0aW9ucy5tYXhXb3JrQ2h1bmtTaXplID4gdGhpcy5vcHRpb25zLm1heEJ1ZmZlcmVkV29yaykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gd29yayBub3QgYWNjZXB0ZWQ6IHRvbyBtdWNoIHBlbmRpbmcgd29ya1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRvIHBlbmRpbmcgdW5pdHMgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IHVuaXQgb2YgdW5pdHMpIHtcblx0XHRcdHRoaXMucGVuZGluZ1dvcmsucHVzaCh1bml0KTtcblx0XHR9XG5cblx0XHRjb25zdCB0aW1lU2luY2VMYXN0RXhlY3V0aW9uID0gRGF0ZS5ub3coKSAtIHRoaXMubGFzdEV4ZWN1dGlvblRpbWU7XG5cblx0XHRpZiAoIXRoaXMudGhyb3R0bGVyLnZhbHVlICYmICghdGhpcy5vcHRpb25zLndhaXRUaHJvdHRsZURlbGF5QmV0d2VlbldvcmtVbml0cyB8fCB0aW1lU2luY2VMYXN0RXhlY3V0aW9uID49IHRoaXMub3B0aW9ucy50aHJvdHRsZURlbGF5KSkge1xuXHRcdFx0Ly8gV29yayBkaXJlY3RseSBpZiB3ZSBhcmUgbm90IHRocm90dGxpbmcgYW5kIHdlIGFyZSBub3Rcblx0XHRcdC8vIGVuZm9yY2VkIHRvIHRocm90dGxlIGJldHdlZW4gYHdvcmsoKWAgY2FsbHMuXG5cdFx0XHR0aGlzLmRvV29yaygpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMudGhyb3R0bGVyLnZhbHVlICYmIHRoaXMub3B0aW9ucy53YWl0VGhyb3R0bGVEZWxheUJldHdlZW5Xb3JrVW5pdHMpIHtcblx0XHRcdC8vIE90aGVyd2lzZSwgc2NoZWR1bGUgdGhlIHRocm90dGxlciB0byB3b3JrLlxuXHRcdFx0dGhpcy5zY2hlZHVsZVRocm90dGxlcihNYXRoLm1heCh0aGlzLm9wdGlvbnMudGhyb3R0bGVEZWxheSAtIHRpbWVTaW5jZUxhc3RFeGVjdXRpb24sIDApKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBvdXIgd29yayB3aWxsIGJlIHBpY2tlZCB1cCBieSB0aGUgcnVubmluZyB0aHJvdHRsZXJcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTsgLy8gd29yayBhY2NlcHRlZFxuXHR9XG5cblx0cHJpdmF0ZSBkb1dvcmsoKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0RXhlY3V0aW9uVGltZSA9IERhdGUubm93KCk7XG5cblx0XHQvLyBFeHRyYWN0IGNodW5rIHRvIGhhbmRsZSBhbmQgaGFuZGxlIGl0XG5cdFx0dGhpcy5oYW5kbGVyKHRoaXMucGVuZGluZ1dvcmsuc3BsaWNlKDAsIHRoaXMub3B0aW9ucy5tYXhXb3JrQ2h1bmtTaXplKSk7XG5cblx0XHQvLyBJZiB3ZSBoYXZlIHJlbWFpbmluZyB3b3JrLCBzY2hlZHVsZSBpdCBhZnRlciBhIGRlbGF5XG5cdFx0aWYgKHRoaXMucGVuZGluZ1dvcmsubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5zY2hlZHVsZVRocm90dGxlcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVUaHJvdHRsZXIoZGVsYXkgPSB0aGlzLm9wdGlvbnMudGhyb3R0bGVEZWxheSk6IHZvaWQge1xuXHRcdHRoaXMudGhyb3R0bGVyLnZhbHVlID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy50aHJvdHRsZXIuY2xlYXIoKTtcblxuXHRcdFx0dGhpcy5kb1dvcmsoKTtcblx0XHR9LCBkZWxheSk7XG5cdFx0dGhpcy50aHJvdHRsZXIudmFsdWUuc2NoZWR1bGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5wZW5kaW5nV29yay5sZW5ndGggPSAwO1xuXHRcdHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiAtLSBydW4gb24gaWRsZSB0cmlja3MgLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgSWRsZURlYWRsaW5lIHtcblx0cmVhZG9ubHkgZGlkVGltZW91dDogYm9vbGVhbjtcblx0dGltZVJlbWFpbmluZygpOiBudW1iZXI7XG59XG5cbnR5cGUgSWRsZUFwaSA9IFBpY2s8dHlwZW9mIGdsb2JhbFRoaXMsICdyZXF1ZXN0SWRsZUNhbGxiYWNrJyB8ICdjYW5jZWxJZGxlQ2FsbGJhY2snPjtcblxuXG4vKipcbiAqIEV4ZWN1dGUgdGhlIGNhbGxiYWNrIHRoZSBuZXh0IHRpbWUgdGhlIGJyb3dzZXIgaXMgaWRsZSwgcmV0dXJuaW5nIGFuXG4gKiB7QGxpbmsgSURpc3Bvc2FibGV9IHRoYXQgd2lsbCBjYW5jZWwgdGhlIGNhbGxiYWNrIHdoZW4gZGlzcG9zZWQuIFRoaXMgd3JhcHNcbiAqIFtyZXF1ZXN0SWRsZUNhbGxiYWNrXSBzbyBpdCB3aWxsIGZhbGxiYWNrIHRvIFtzZXRUaW1lb3V0XSBpZiB0aGUgZW52aXJvbm1lbnRcbiAqIGRvZXNuJ3Qgc3VwcG9ydCBpdC5cbiAqXG4gKiBAcGFyYW0gY2FsbGJhY2sgVGhlIGNhbGxiYWNrIHRvIHJ1biB3aGVuIGlkbGUsIHRoaXMgaW5jbHVkZXMgYW5cbiAqIFtJZGxlRGVhZGxpbmVdIHRoYXQgcHJvdmlkZXMgdGhlIHRpbWUgYWxsb3RlZCBmb3IgdGhlIGlkbGUgY2FsbGJhY2sgYnkgdGhlXG4gKiBicm93c2VyLiBOb3QgcmVzcGVjdGluZyB0aGlzIGRlYWRsaW5lIHdpbGwgcmVzdWx0IGluIGEgZGVncmFkZWQgdXNlclxuICogZXhwZXJpZW5jZS5cbiAqIEBwYXJhbSB0aW1lb3V0IEEgdGltZW91dCBhdCB3aGljaCBwb2ludCB0byBxdWV1ZSBubyBsb25nZXIgd2FpdCBmb3IgYW4gaWRsZVxuICogY2FsbGJhY2sgYnV0IHF1ZXVlIGl0IG9uIHRoZSByZWd1bGFyIGV2ZW50IGxvb3AgKGxpa2Ugc2V0VGltZW91dCkuIFR5cGljYWxseVxuICogdGhpcyBzaG91bGQgbm90IGJlIHVzZWQuXG4gKlxuICogW0lkbGVEZWFkbGluZV06IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JZGxlRGVhZGxpbmVcbiAqIFtyZXF1ZXN0SWRsZUNhbGxiYWNrXTogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1dpbmRvdy9yZXF1ZXN0SWRsZUNhbGxiYWNrXG4gKiBbc2V0VGltZW91dF06IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XaW5kb3cvc2V0VGltZW91dFxuICpcbiAqICoqTm90ZSoqIHRoYXQgdGhlcmUgaXMgYGRvbS50cyNydW5XaGVuV2luZG93SWRsZWAgd2hpY2ggaXMgYmV0dGVyIHN1aXRlZCB3aGVuIHJ1bm5pbmcgaW5zaWRlIGEgYnJvd3NlclxuICogY29udGV4dFxuICovXG5leHBvcnQgbGV0IHJ1bldoZW5HbG9iYWxJZGxlOiAoY2FsbGJhY2s6IChpZGxlOiBJZGxlRGVhZGxpbmUpID0+IHZvaWQsIHRpbWVvdXQ/OiBudW1iZXIpID0+IElEaXNwb3NhYmxlO1xuXG5leHBvcnQgbGV0IF9ydW5XaGVuSWRsZTogKHRhcmdldFdpbmRvdzogSWRsZUFwaSwgY2FsbGJhY2s6IChpZGxlOiBJZGxlRGVhZGxpbmUpID0+IHZvaWQsIHRpbWVvdXQ/OiBudW1iZXIpID0+IElEaXNwb3NhYmxlO1xuXG4oZnVuY3Rpb24gKCkge1xuXHRjb25zdCBzYWZlR2xvYmFsOiBhbnkgPSBnbG9iYWxUaGlzO1xuXHRpZiAodHlwZW9mIHNhZmVHbG9iYWwucmVxdWVzdElkbGVDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2Ygc2FmZUdsb2JhbC5jYW5jZWxJZGxlQ2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcblx0XHRfcnVuV2hlbklkbGUgPSAoX3RhcmdldFdpbmRvdywgcnVubmVyLCB0aW1lb3V0PykgPT4ge1xuXHRcdFx0c2V0VGltZW91dDAoKCkgPT4ge1xuXHRcdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW5kID0gRGF0ZS5ub3coKSArIDE1OyAvLyBvbmUgZnJhbWUgYXQgNjRmcHNcblx0XHRcdFx0Y29uc3QgZGVhZGxpbmU6IElkbGVEZWFkbGluZSA9IHtcblx0XHRcdFx0XHRkaWRUaW1lb3V0OiB0cnVlLFxuXHRcdFx0XHRcdHRpbWVSZW1haW5pbmcoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgZW5kIC0gRGF0ZS5ub3coKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRydW5uZXIoT2JqZWN0LmZyZWV6ZShkZWFkbGluZSkpO1xuXHRcdFx0fSk7XG5cdFx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9O1xuXHR9IGVsc2Uge1xuXHRcdF9ydW5XaGVuSWRsZSA9ICh0YXJnZXRXaW5kb3c6IHR5cGVvZiBzYWZlR2xvYmFsLCBydW5uZXIsIHRpbWVvdXQ/KSA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGU6IG51bWJlciA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0SWRsZUNhbGxiYWNrKHJ1bm5lciwgdHlwZW9mIHRpbWVvdXQgPT09ICdudW1iZXInID8geyB0aW1lb3V0IH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGFyZ2V0V2luZG93LmNhbmNlbElkbGVDYWxsYmFjayhoYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH07XG5cdH1cblx0cnVuV2hlbkdsb2JhbElkbGUgPSAocnVubmVyLCB0aW1lb3V0KSA9PiBfcnVuV2hlbklkbGUoZ2xvYmFsVGhpcywgcnVubmVyLCB0aW1lb3V0KTtcbn0pKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnN0YWxsRmFrZVJ1bldoZW5JZGxlKGZha2VJbXBsOiB0eXBlb2YgX3J1bldoZW5JZGxlKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBvcmlnUnVuV2hlbklkbGUgPSBfcnVuV2hlbklkbGU7XG5cdGNvbnN0IG9yaWdSdW5XaGVuR2xvYmFsSWRsZSA9IHJ1bldoZW5HbG9iYWxJZGxlO1xuXHRfcnVuV2hlbklkbGUgPSBmYWtlSW1wbDtcblx0cnVuV2hlbkdsb2JhbElkbGUgPSAocnVubmVyLCB0aW1lb3V0KSA9PiBmYWtlSW1wbChnbG9iYWxUaGlzLCBydW5uZXIsIHRpbWVvdXQpO1xuXHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRfcnVuV2hlbklkbGUgPSBvcmlnUnVuV2hlbklkbGU7XG5cdFx0cnVuV2hlbkdsb2JhbElkbGUgPSBvcmlnUnVuV2hlbkdsb2JhbElkbGU7XG5cdH0pO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RJZGxlVmFsdWU8VD4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4ZWN1dG9yOiAoKSA9PiB2b2lkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IElEaXNwb3NhYmxlO1xuXG5cdHByaXZhdGUgX2RpZFJ1bjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF92YWx1ZT86IFQ7XG5cdHByaXZhdGUgX2Vycm9yOiB1bmtub3duO1xuXG5cdGNvbnN0cnVjdG9yKHRhcmdldFdpbmRvdzogSWRsZUFwaSwgZXhlY3V0b3I6ICgpID0+IFQpIHtcblx0XHR0aGlzLl9leGVjdXRvciA9ICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3ZhbHVlID0gZXhlY3V0b3IoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9lcnJvciA9IGVycjtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX2RpZFJ1biA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9oYW5kbGUgPSBfcnVuV2hlbklkbGUodGFyZ2V0V2luZG93LCAoKSA9PiB0aGlzLl9leGVjdXRvcigpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faGFuZGxlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCB2YWx1ZSgpOiBUIHtcblx0XHRpZiAoIXRoaXMuX2RpZFJ1bikge1xuXHRcdFx0dGhpcy5faGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2V4ZWN1dG9yKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9lcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5fZXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl92YWx1ZSE7XG5cdH1cblxuXHRnZXQgaXNJbml0aWFsaXplZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlkUnVuO1xuXHR9XG59XG5cbi8qKlxuICogQW4gYElkbGVWYWx1ZWAgdGhhdCBhbHdheXMgdXNlcyB0aGUgY3VycmVudCB3aW5kb3cgKHdoaWNoIG1pZ2h0IGJlIHRocm90dGxlZCBvciBpbmFjdGl2ZSlcbiAqXG4gKiAqKk5vdGUqKiB0aGF0IHRoZXJlIGlzIGBkb20udHMjV2luZG93SWRsZVZhbHVlYCB3aGljaCBpcyBiZXR0ZXIgc3VpdGVkIHdoZW4gcnVubmluZyBpbnNpZGUgYSBicm93c2VyXG4gKiBjb250ZXh0XG4gKi9cbmV4cG9ydCBjbGFzcyBHbG9iYWxJZGxlVmFsdWU8VD4gZXh0ZW5kcyBBYnN0cmFjdElkbGVWYWx1ZTxUPiB7XG5cblx0Y29uc3RydWN0b3IoZXhlY3V0b3I6ICgpID0+IFQpIHtcblx0XHRzdXBlcihnbG9iYWxUaGlzLCBleGVjdXRvcik7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXRyeTxUPih0YXNrOiBJVGFzazxQcm9taXNlPFQ+PiwgZGVsYXk6IG51bWJlciwgcmV0cmllczogbnVtYmVyKTogUHJvbWlzZTxUPiB7XG5cdGxldCBsYXN0RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgcmV0cmllczsgaSsrKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0YXNrKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxhc3RFcnJvciA9IGVycm9yO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KGRlbGF5KTtcblx0XHR9XG5cdH1cblxuXHR0aHJvdyBsYXN0RXJyb3I7XG59XG5cbi8vI3JlZ2lvbiBUYXNrIFNlcXVlbnRpYWxpemVyXG5cbmludGVyZmFjZSBJUnVubmluZ1Rhc2sge1xuXHRyZWFkb25seSB0YXNrSWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY2FuY2VsOiAoKSA9PiB2b2lkO1xuXHRyZWFkb25seSBwcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSVF1ZXVlZFRhc2sge1xuXHRyZWFkb25seSBwcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWFkb25seSBwcm9taXNlUmVzb2x2ZTogKCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgcHJvbWlzZVJlamVjdDogKGVycm9yOiBFcnJvcikgPT4gdm9pZDtcblx0cnVuOiBJVGFzazxQcm9taXNlPHZvaWQ+Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza1NlcXVlbnRpYWxpemVyV2l0aFJ1bm5pbmdUYXNrIHtcblx0cmVhZG9ubHkgcnVubmluZzogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza1NlcXVlbnRpYWxpemVyV2l0aFF1ZXVlZFRhc2sge1xuXHRyZWFkb25seSBxdWV1ZWQ6IElRdWV1ZWRUYXNrO1xufVxuXG4vKipcbiAqIEBkZXByZWNhdGVkIHVzZSBgTGltaXRlZFF1ZXVlYCBpbnN0ZWFkIGZvciBhbiBlYXNpZXIgdG8gdXNlIEFQSVxuICovXG5leHBvcnQgY2xhc3MgVGFza1NlcXVlbnRpYWxpemVyIHtcblxuXHRwcml2YXRlIF9ydW5uaW5nPzogSVJ1bm5pbmdUYXNrO1xuXHRwcml2YXRlIF9xdWV1ZWQ/OiBJUXVldWVkVGFzaztcblxuXHRpc1J1bm5pbmcodGFza0lkPzogbnVtYmVyKTogdGhpcyBpcyBJVGFza1NlcXVlbnRpYWxpemVyV2l0aFJ1bm5pbmdUYXNrIHtcblx0XHRpZiAodHlwZW9mIHRhc2tJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ydW5uaW5nPy50YXNrSWQgPT09IHRhc2tJZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gISF0aGlzLl9ydW5uaW5nO1xuXHR9XG5cblx0Z2V0IHJ1bm5pbmcoKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3J1bm5pbmc/LnByb21pc2U7XG5cdH1cblxuXHRjYW5jZWxSdW5uaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3J1bm5pbmc/LmNhbmNlbCgpO1xuXHR9XG5cblx0cnVuKHRhc2tJZDogbnVtYmVyLCBwcm9taXNlOiBQcm9taXNlPHZvaWQ+LCBvbkNhbmNlbD86ICgpID0+IHZvaWQsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcnVubmluZyA9IHsgdGFza0lkLCBjYW5jZWw6ICgpID0+IG9uQ2FuY2VsPy4oKSwgcHJvbWlzZSB9O1xuXG5cdFx0cHJvbWlzZS50aGVuKCgpID0+IHRoaXMuZG9uZVJ1bm5pbmcodGFza0lkKSwgKCkgPT4gdGhpcy5kb25lUnVubmluZyh0YXNrSWQpKTtcblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBkb25lUnVubmluZyh0YXNrSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ydW5uaW5nICYmIHRhc2tJZCA9PT0gdGhpcy5fcnVubmluZy50YXNrSWQpIHtcblxuXHRcdFx0Ly8gb25seSBzZXQgcnVubmluZyB0byBkb25lIGlmIHRoZSBwcm9taXNlIGZpbmlzaGVkIHRoYXQgaXMgYXNzb2NpYXRlZCB3aXRoIHRoYXQgdGFza0lkXG5cdFx0XHR0aGlzLl9ydW5uaW5nID0gdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBzY2hlZHVsZSB0aGUgcXVldWVkIHRhc2sgbm93IHRoYXQgd2UgYXJlIGZyZWUgaWYgd2UgaGF2ZSBhbnlcblx0XHRcdHRoaXMucnVuUXVldWVkKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBydW5RdWV1ZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3F1ZXVlZCkge1xuXHRcdFx0Y29uc3QgcXVldWVkID0gdGhpcy5fcXVldWVkO1xuXHRcdFx0dGhpcy5fcXVldWVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBSdW4gcXVldWVkIHRhc2sgYW5kIGNvbXBsZXRlIG9uIHRoZSBhc3NvY2lhdGVkIHByb21pc2Vcblx0XHRcdHF1ZXVlZC5ydW4oKS50aGVuKHF1ZXVlZC5wcm9taXNlUmVzb2x2ZSwgcXVldWVkLnByb21pc2VSZWplY3QpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RlOiB0aGUgcHJvbWlzZSB0byBzY2hlZHVsZSBhcyBuZXh0IHJ1biBNVVNUIGl0c2VsZiBjYWxsIGBydW5gLlxuXHQgKiAgICAgICBPdGhlcndpc2UsIHRoaXMgc2VxdWVudGlhbGl6ZXIgd2lsbCByZXBvcnQgYGZhbHNlYCBmb3IgYGlzUnVubmluZ2Bcblx0ICogICAgICAgZXZlbiB3aGVuIHRoaXMgdGFzayBpcyBydW5uaW5nLiBNaXNzaW5nIHRoaXMgZGV0YWlsIG1lYW5zIHRoYXRcblx0ICogICAgICAgc3VkZGVubHkgbXVsdGlwbGUgdGFza3Mgd2lsbCBydW4gaW4gcGFyYWxsZWwuXG5cdCAqL1xuXHRxdWV1ZShydW46IElUYXNrPFByb21pc2U8dm9pZD4+KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyB0aGlzIGlzIG91ciBmaXJzdCBxdWV1ZWQgdGFzaywgc28gd2UgY3JlYXRlIGFzc29jaWF0ZWQgcHJvbWlzZSB3aXRoIGl0XG5cdFx0Ly8gc28gdGhhdCB3ZSBjYW4gcmV0dXJuIGEgcHJvbWlzZSB0aGF0IGNvbXBsZXRlcyB3aGVuIHRoZSB0YXNrIGhhc1xuXHRcdC8vIGNvbXBsZXRlZC5cblx0XHRpZiAoIXRoaXMuX3F1ZXVlZCkge1xuXHRcdFx0Y29uc3QgeyBwcm9taXNlLCByZXNvbHZlOiBwcm9taXNlUmVzb2x2ZSwgcmVqZWN0OiBwcm9taXNlUmVqZWN0IH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczx2b2lkPigpO1xuXHRcdFx0dGhpcy5fcXVldWVkID0ge1xuXHRcdFx0XHRydW4sXG5cdFx0XHRcdHByb21pc2UsXG5cdFx0XHRcdHByb21pc2VSZXNvbHZlLFxuXHRcdFx0XHRwcm9taXNlUmVqZWN0XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIHdlIGhhdmUgYSBwcmV2aW91cyBxdWV1ZWQgdGFzaywganVzdCBvdmVyd3JpdGUgaXRcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuX3F1ZXVlZC5ydW4gPSBydW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3F1ZXVlZC5wcm9taXNlO1xuXHR9XG5cblx0aGFzUXVldWVkKCk6IHRoaXMgaXMgSVRhc2tTZXF1ZW50aWFsaXplcldpdGhRdWV1ZWRUYXNrIHtcblx0XHRyZXR1cm4gISF0aGlzLl9xdWV1ZWQ7XG5cdH1cblxuXHRhc3luYyBqb2luKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9xdWV1ZWQ/LnByb21pc2UgPz8gdGhpcy5fcnVubmluZz8ucHJvbWlzZTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uXG5cbi8qKlxuICogVGhlIGBJbnRlcnZhbENvdW50ZXJgIGFsbG93cyB0byBjb3VudCB0aGUgbnVtYmVyXG4gKiBvZiBjYWxscyB0byBgaW5jcmVtZW50KClgIG92ZXIgYSBkdXJhdGlvbiBvZlxuICogYGludGVydmFsYC4gVGhpcyB1dGlsaXR5IGNhbiBiZSB1c2VkIHRvIGNvbmRpdGlvbmFsbHlcbiAqIHRocm90dGxlIGEgZnJlcXVlbnQgdGFzayB3aGVuIGEgY2VydGFpbiB0aHJlc2hvbGRcbiAqIGlzIHJlYWNoZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBJbnRlcnZhbENvdW50ZXIge1xuXG5cdHByaXZhdGUgbGFzdEluY3JlbWVudFRpbWUgPSAwO1xuXG5cdHByaXZhdGUgdmFsdWUgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgaW50ZXJ2YWw6IG51bWJlciwgcHJpdmF0ZSByZWFkb25seSBub3dGbiA9ICgpID0+IERhdGUubm93KCkpIHsgfVxuXG5cdGluY3JlbWVudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IG5vdyA9IHRoaXMubm93Rm4oKTtcblxuXHRcdC8vIFdlIGFyZSBvdXRzaWRlIG9mIHRoZSByYW5nZSBvZiBgaW50ZXJ2YWxgIGFuZCBhcyBzdWNoXG5cdFx0Ly8gc3RhcnQgY291bnRpbmcgZnJvbSAwIGFuZCByZW1lbWJlciB0aGUgdGltZVxuXHRcdGlmIChub3cgLSB0aGlzLmxhc3RJbmNyZW1lbnRUaW1lID4gdGhpcy5pbnRlcnZhbCkge1xuXHRcdFx0dGhpcy5sYXN0SW5jcmVtZW50VGltZSA9IG5vdztcblx0XHRcdHRoaXMudmFsdWUgPSAwO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUrKztcblxuXHRcdHJldHVybiB0aGlzLnZhbHVlO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb25cblxuZXhwb3J0IHR5cGUgVmFsdWVDYWxsYmFjazxUID0gdW5rbm93bj4gPSAodmFsdWU6IFQgfCBQcm9taXNlPFQ+KSA9PiB2b2lkO1xuXG5jb25zdCBlbnVtIERlZmVycmVkT3V0Y29tZSB7XG5cdFJlc29sdmVkLFxuXHRSZWplY3RlZFxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBwcm9taXNlIHdob3NlIHJlc29sdXRpb24gb3IgcmVqZWN0aW9uIGNhbiBiZSBjb250cm9sbGVkIGltcGVyYXRpdmVseS5cbiAqL1xuZXhwb3J0IGNsYXNzIERlZmVycmVkUHJvbWlzZTxUPiB7XG5cblx0cHVibGljIHN0YXRpYyBmcm9tUHJvbWlzZTxUPihwcm9taXNlOiBQcm9taXNlPFQ+KTogRGVmZXJyZWRQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8VD4oKTtcblx0XHRkZWZlcnJlZC5zZXR0bGVXaXRoKHByb21pc2UpO1xuXHRcdHJldHVybiBkZWZlcnJlZDtcblx0fVxuXG5cdHByaXZhdGUgY29tcGxldGVDYWxsYmFjayE6IFZhbHVlQ2FsbGJhY2s8VD47XG5cdHByaXZhdGUgZXJyb3JDYWxsYmFjayE6IChlcnI6IHVua25vd24pID0+IHZvaWQ7XG5cdHByaXZhdGUgb3V0Y29tZT86IHsgb3V0Y29tZTogRGVmZXJyZWRPdXRjb21lLlJlamVjdGVkOyB2YWx1ZTogdW5rbm93biB9IHwgeyBvdXRjb21lOiBEZWZlcnJlZE91dGNvbWUuUmVzb2x2ZWQ7IHZhbHVlOiBUIH07XG5cblx0cHVibGljIGdldCBpc1JlamVjdGVkKCkge1xuXHRcdHJldHVybiB0aGlzLm91dGNvbWU/Lm91dGNvbWUgPT09IERlZmVycmVkT3V0Y29tZS5SZWplY3RlZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNSZXNvbHZlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5vdXRjb21lPy5vdXRjb21lID09PSBEZWZlcnJlZE91dGNvbWUuUmVzb2x2ZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzU2V0dGxlZCgpIHtcblx0XHRyZXR1cm4gISF0aGlzLm91dGNvbWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLm91dGNvbWU/Lm91dGNvbWUgPT09IERlZmVycmVkT3V0Y29tZS5SZXNvbHZlZCA/IHRoaXMub3V0Y29tZT8udmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgcDogUHJvbWlzZTxUPjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnAgPSBuZXcgUHJvbWlzZTxUPigoYywgZSkgPT4ge1xuXHRcdFx0dGhpcy5jb21wbGV0ZUNhbGxiYWNrID0gYztcblx0XHRcdHRoaXMuZXJyb3JDYWxsYmFjayA9IGU7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcGxldGUodmFsdWU6IFQpIHtcblx0XHRpZiAodGhpcy5pc1NldHRsZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHR0aGlzLmNvbXBsZXRlQ2FsbGJhY2sodmFsdWUpO1xuXHRcdFx0dGhpcy5vdXRjb21lID0geyBvdXRjb21lOiBEZWZlcnJlZE91dGNvbWUuUmVzb2x2ZWQsIHZhbHVlIH07XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZXJyb3IoZXJyOiB1bmtub3duKSB7XG5cdFx0aWYgKHRoaXMuaXNTZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0dGhpcy5lcnJvckNhbGxiYWNrKGVycik7XG5cdFx0XHR0aGlzLm91dGNvbWUgPSB7IG91dGNvbWU6IERlZmVycmVkT3V0Y29tZS5SZWplY3RlZCwgdmFsdWU6IGVyciB9O1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHNldHRsZVdpdGgocHJvbWlzZTogUHJvbWlzZTxUPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBwcm9taXNlLnRoZW4oXG5cdFx0XHR2YWx1ZSA9PiB0aGlzLmNvbXBsZXRlKHZhbHVlKSxcblx0XHRcdGVycm9yID0+IHRoaXMuZXJyb3IoZXJyb3IpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBjYW5jZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZXJyb3IobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUHJvbWlzZXNcblxuZXhwb3J0IG5hbWVzcGFjZSBQcm9taXNlcyB7XG5cblx0LyoqXG5cdCAqIEEgZHJvcC1pbiByZXBsYWNlbWVudCBmb3IgYFByb21pc2UuYWxsYCB3aXRoIHRoZSBvbmx5IGRpZmZlcmVuY2Vcblx0ICogdGhhdCB0aGUgbWV0aG9kIGF3YWl0cyBldmVyeSBwcm9taXNlIHRvIGVpdGhlciBmdWxmaWxsIG9yIHJlamVjdC5cblx0ICpcblx0ICogU2ltaWxhciB0byBgUHJvbWlzZS5hbGxgLCBvbmx5IHRoZSBmaXJzdCBlcnJvciB3aWxsIGJlIHJldHVybmVkXG5cdCAqIGlmIGFueS5cblx0ICovXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXR0bGVkPFQ+KHByb21pc2VzOiBQcm9taXNlPFQ+W10pOiBQcm9taXNlPFRbXT4ge1xuXHRcdGxldCBmaXJzdEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzLm1hcChwcm9taXNlID0+IHByb21pc2UudGhlbih2YWx1ZSA9PiB2YWx1ZSwgZXJyb3IgPT4ge1xuXHRcdFx0aWYgKCFmaXJzdEVycm9yKSB7XG5cdFx0XHRcdGZpcnN0RXJyb3IgPSBlcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gZG8gbm90IHJldGhyb3cgc28gdGhhdCBvdGhlciBwcm9taXNlcyBjYW4gc2V0dGxlXG5cdFx0fSkpKTtcblxuXHRcdGlmICh0eXBlb2YgZmlyc3RFcnJvciAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRocm93IGZpcnN0RXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdCBhcyB1bmtub3duIGFzIFRbXTsgLy8gY2FzdCBpcyBuZWVkZWQgYW5kIHByb3RlY3RlZCBieSB0aGUgYHRocm93YCBhYm92ZVxuXHR9XG5cblx0LyoqXG5cdCAqIEEgaGVscGVyIHRvIGNyZWF0ZSBhIG5ldyBgUHJvbWlzZTxUPmAgd2l0aCBhIGJvZHkgdGhhdCBpcyBhIHByb21pc2Vcblx0ICogaXRzZWxmLiBCeSBkZWZhdWx0LCBhbiBlcnJvciB0aGF0IHJhaXNlcyBmcm9tIHRoZSBhc3luYyBib2R5IHdpbGxcblx0ICogZW5kIHVwIGFzIGEgdW5oYW5kbGVkIHJlamVjdGlvbiwgc28gdGhpcyB1dGlsaXR5IHByb3Blcmx5IGF3YWl0cyB0aGVcblx0ICogYm9keSBhbmQgcmVqZWN0cyB0aGUgcHJvbWlzZSBhcyBhIG5vcm1hbCBwcm9taXNlIGRvZXMgd2l0aG91dCBhc3luY1xuXHQgKiBib2R5LlxuXHQgKlxuXHQgKiBUaGlzIG1ldGhvZCBzaG91bGQgb25seSBiZSB1c2VkIGluIHJhcmUgY2FzZXMgd2hlcmUgb3RoZXJ3aXNlIGBhc3luY2Bcblx0ICogY2Fubm90IGJlIHVzZWQgKGUuZy4gd2hlbiBjYWxsYmFja3MgYXJlIGludm9sdmVkIHRoYXQgcmVxdWlyZSB0aGlzKS5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiB3aXRoQXN5bmNCb2R5PFQsIEUgPSBFcnJvcj4oYm9keUZuOiAocmVzb2x2ZTogKHZhbHVlOiBUKSA9PiB1bmtub3duLCByZWplY3Q6IChlcnJvcjogRSkgPT4gdW5rbm93bikgPT4gUHJvbWlzZTx1bmtub3duPik6IFByb21pc2U8VD4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1hc3luYy1wcm9taXNlLWV4ZWN1dG9yXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFQ+KGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGJvZHlGbihyZXNvbHZlLCByZWplY3QpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhdGVmdWxQcm9taXNlPFQ+IHtcblx0cHJpdmF0ZSBfdmFsdWU6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCB2YWx1ZSgpOiBUIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3ZhbHVlOyB9XG5cblx0cHJpdmF0ZSBfZXJyb3I6IHVua25vd24gPSB1bmRlZmluZWQ7XG5cdGdldCBlcnJvcigpOiB1bmtub3duIHsgcmV0dXJuIHRoaXMuX2Vycm9yOyB9XG5cblx0cHJpdmF0ZSBfaXNSZXNvbHZlZCA9IGZhbHNlO1xuXHRnZXQgaXNSZXNvbHZlZCgpIHsgcmV0dXJuIHRoaXMuX2lzUmVzb2x2ZWQ7IH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxUPjtcblxuXHRjb25zdHJ1Y3Rvcihwcm9taXNlOiBQcm9taXNlPFQ+KSB7XG5cdFx0dGhpcy5wcm9taXNlID0gcHJvbWlzZS50aGVuKFxuXHRcdFx0dmFsdWUgPT4ge1xuXHRcdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHR0aGlzLl9pc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fSxcblx0XHRcdGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5fZXJyb3IgPSBlcnJvcjtcblx0XHRcdFx0dGhpcy5faXNSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVzb2x2ZWQgdmFsdWUuXG5cdCAqIFRocm93cyBpZiB0aGUgcHJvbWlzZSBpcyBub3QgcmVzb2x2ZWQgeWV0LlxuXHQgKi9cblx0cHVibGljIHJlcXVpcmVWYWx1ZSgpOiBUIHtcblx0XHRpZiAoIXRoaXMuX2lzUmVzb2x2ZWQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1Byb21pc2UgaXMgbm90IHJlc29sdmVkIHlldCcpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuX2Vycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdmFsdWUhO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMYXp5U3RhdGVmdWxQcm9taXNlPFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbWlzZSA9IG5ldyBMYXp5KCgpID0+IG5ldyBTdGF0ZWZ1bFByb21pc2UodGhpcy5fY29tcHV0ZSgpKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tcHV0ZTogKCkgPT4gUHJvbWlzZTxUPixcblx0KSB7IH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVzb2x2ZWQgdmFsdWUuXG5cdCAqIFRocm93cyBpZiB0aGUgcHJvbWlzZSBpcyBub3QgcmVzb2x2ZWQgeWV0LlxuXHQgKi9cblx0cHVibGljIHJlcXVpcmVWYWx1ZSgpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvbWlzZS52YWx1ZS5yZXF1aXJlVmFsdWUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwcm9taXNlIChhbmQgdHJpZ2dlcnMgYSBjb21wdXRhdGlvbiBvZiB0aGUgcHJvbWlzZSBpZiBub3QgeWV0IGRvbmUgc28pLlxuXHQgKi9cblx0cHVibGljIGdldFByb21pc2UoKTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb21pc2UudmFsdWUucHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgY3VycmVudCB2YWx1ZSB3aXRob3V0IHRyaWdnZXJpbmcgYSBjb21wdXRhdGlvbiBvZiB0aGUgcHJvbWlzZS5cblx0ICovXG5cdHB1YmxpYyBnZXQgY3VycmVudFZhbHVlKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcm9taXNlLnJhd1ZhbHVlPy52YWx1ZTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uXG5cbmNvbnN0IGVudW0gQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlIHtcblx0SW5pdGlhbCxcblx0RG9uZU9LLFxuXHREb25lRXJyb3IsXG59XG5cbi8qKlxuICogQW4gb2JqZWN0IHRoYXQgYWxsb3dzIHRvIGVtaXQgYXN5bmMgdmFsdWVzIGFzeW5jaHJvbm91c2x5IG9yIGJyaW5nIHRoZSBpdGVyYWJsZSB0byBhbiBlcnJvciBzdGF0ZSB1c2luZyBgcmVqZWN0KClgLlxuICogVGhpcyBlbWl0dGVyIGlzIHZhbGlkIG9ubHkgZm9yIHRoZSBkdXJhdGlvbiBvZiB0aGUgZXhlY3V0b3IgKHVudGlsIHRoZSBwcm9taXNlIHJldHVybmVkIGJ5IHRoZSBleGVjdXRvciBzZXR0bGVzKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBc3luY0l0ZXJhYmxlRW1pdHRlcjxUPiB7XG5cdC8qKlxuXHQgKiBUaGUgdmFsdWUgd2lsbCBiZSBhcHBlbmRlZCBhdCB0aGUgZW5kLlxuXHQgKlxuXHQgKiAqKk5PVEUqKiBJZiBgcmVqZWN0KClgIGhhcyBhbHJlYWR5IGJlZW4gY2FsbGVkLCB0aGlzIG1ldGhvZCBoYXMgbm8gZWZmZWN0LlxuXHQgKi9cblx0ZW1pdE9uZSh2YWx1ZTogVCk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBUaGUgdmFsdWVzIHdpbGwgYmUgYXBwZW5kZWQgYXQgdGhlIGVuZC5cblx0ICpcblx0ICogKipOT1RFKiogSWYgYHJlamVjdCgpYCBoYXMgYWxyZWFkeSBiZWVuIGNhbGxlZCwgdGhpcyBtZXRob2QgaGFzIG5vIGVmZmVjdC5cblx0ICovXG5cdGVtaXRNYW55KHZhbHVlczogVFtdKTogdm9pZDtcblx0LyoqXG5cdCAqIFdyaXRpbmcgYW4gZXJyb3Igd2lsbCBwZXJtYW5lbnRseSBpbnZhbGlkYXRlIHRoaXMgaXRlcmFibGUuXG5cdCAqIFRoZSBjdXJyZW50IHVzZXJzIHdpbGwgcmVjZWl2ZSBhbiBlcnJvciB0aHJvd24sIGFzIHdpbGwgYWxsIGZ1dHVyZSB1c2Vycy5cblx0ICpcblx0ICogKipOT1RFKiogSWYgYHJlamVjdCgpYCBoYXZlIGFscmVhZHkgYmVlbiBjYWxsZWQsIHRoaXMgbWV0aG9kIGhhcyBubyBlZmZlY3QuXG5cdCAqL1xuXHRyZWplY3QoZXJyb3I6IEVycm9yKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBbiBleGVjdXRvciBmb3IgdGhlIGBBc3luY0l0ZXJhYmxlT2JqZWN0YCB0aGF0IGhhcyBhY2Nlc3MgdG8gYW4gZW1pdHRlci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBc3luY0l0ZXJhYmxlRXhlY3V0b3I8VD4ge1xuXHQvKipcblx0ICogQHBhcmFtIGVtaXR0ZXIgQW4gb2JqZWN0IHRoYXQgYWxsb3dzIHRvIGVtaXQgYXN5bmMgdmFsdWVzIHZhbGlkIG9ubHkgZm9yIHRoZSBkdXJhdGlvbiBvZiB0aGUgZXhlY3V0b3IuXG5cdCAqL1xuXHQoZW1pdHRlcjogQXN5bmNJdGVyYWJsZUVtaXR0ZXI8VD4pOiB1bmtub3duIHwgUHJvbWlzZTx1bmtub3duPjtcbn1cblxuLyoqXG4gKiBBIHJpY2ggaW1wbGVtZW50YXRpb24gZm9yIGFuIGBBc3luY0l0ZXJhYmxlPFQ+YC5cbiAqL1xuZXhwb3J0IGNsYXNzIEFzeW5jSXRlcmFibGVPYmplY3Q8VD4gaW1wbGVtZW50cyBBc3luY0l0ZXJhYmxlPFQ+IHtcblxuXHRwdWJsaWMgc3RhdGljIGZyb21BcnJheTxUPihpdGVtczogVFtdKTogQXN5bmNJdGVyYWJsZU9iamVjdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlT2JqZWN0PFQ+KCh3cml0ZXIpID0+IHtcblx0XHRcdHdyaXRlci5lbWl0TWFueShpdGVtcyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21Qcm9taXNlPFQ+KHByb21pc2U6IFByb21pc2U8VFtdPik6IEFzeW5jSXRlcmFibGVPYmplY3Q8VD4ge1xuXHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZU9iamVjdDxUPihhc3luYyAoZW1pdHRlcikgPT4ge1xuXHRcdFx0ZW1pdHRlci5lbWl0TWFueShhd2FpdCBwcm9taXNlKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVByb21pc2VzUmVzb2x2ZU9yZGVyPFQ+KHByb21pc2VzOiBQcm9taXNlPFQ+W10pOiBBc3luY0l0ZXJhYmxlT2JqZWN0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVPYmplY3Q8VD4oYXN5bmMgKGVtaXR0ZXIpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzLm1hcChhc3luYyAocCkgPT4gZW1pdHRlci5lbWl0T25lKGF3YWl0IHApKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1lcmdlPFQ+KGl0ZXJhYmxlczogQXN5bmNJdGVyYWJsZTxUPltdKTogQXN5bmNJdGVyYWJsZU9iamVjdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlT2JqZWN0KGFzeW5jIChlbWl0dGVyKSA9PiB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpdGVyYWJsZXMubWFwKGFzeW5jIChpdGVyYWJsZSkgPT4ge1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcmFibGUpIHtcblx0XHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgRU1QVFkgPSBBc3luY0l0ZXJhYmxlT2JqZWN0LmZyb21BcnJheTxhbnk+KFtdKTtcblxuXHRwcml2YXRlIF9zdGF0ZTogQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlO1xuXHRwcml2YXRlIF9yZXN1bHRzOiBUW107XG5cdHByaXZhdGUgX2Vycm9yOiBFcnJvciB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUmV0dXJuPzogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU3RhdGVDaGFuZ2VkOiBFbWl0dGVyPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKGV4ZWN1dG9yOiBBc3luY0l0ZXJhYmxlRXhlY3V0b3I8VD4sIG9uUmV0dXJuPzogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHtcblx0XHR0aGlzLl9zdGF0ZSA9IEFzeW5jSXRlcmFibGVTb3VyY2VTdGF0ZS5Jbml0aWFsO1xuXHRcdHRoaXMuX3Jlc3VsdHMgPSBbXTtcblx0XHR0aGlzLl9lcnJvciA9IG51bGw7XG5cdFx0dGhpcy5fb25SZXR1cm4gPSBvblJldHVybjtcblx0XHR0aGlzLl9vblN0YXRlQ2hhbmdlZCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0XHRxdWV1ZU1pY3JvdGFzayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cml0ZXI6IEFzeW5jSXRlcmFibGVFbWl0dGVyPFQ+ID0ge1xuXHRcdFx0XHRlbWl0T25lOiAoaXRlbSkgPT4gdGhpcy5lbWl0T25lKGl0ZW0pLFxuXHRcdFx0XHRlbWl0TWFueTogKGl0ZW1zKSA9PiB0aGlzLmVtaXRNYW55KGl0ZW1zKSxcblx0XHRcdFx0cmVqZWN0OiAoZXJyb3IpID0+IHRoaXMucmVqZWN0KGVycm9yKVxuXHRcdFx0fTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZShleGVjdXRvcih3cml0ZXIpKTtcblx0XHRcdFx0dGhpcy5yZXNvbHZlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5yZWplY3QoZXJyKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdC8vIFRoZSBleGVjdXRvciBoYXMgc2V0dGxlZDsgZW1pdHRpbmcgYWZ0ZXJ3YXJkcyBtdXN0IGJlIGEgbm8tb3AgcGVyIHRoZVxuXHRcdFx0XHQvLyBkb2N1bWVudGVkIFwibm8gZWZmZWN0IGFmdGVyIHJlc29sdmUoKS9yZWplY3QoKVwiIGNvbnRyYWN0IChzZWUgZW1pdE9uZSkuXG5cdFx0XHRcdHdyaXRlci5lbWl0T25lID0gKCkgPT4geyB9O1xuXHRcdFx0XHR3cml0ZXIuZW1pdE1hbnkgPSAoKSA9PiB7IH07XG5cdFx0XHRcdHdyaXRlci5yZWplY3QgPSAoKSA9PiB7IH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk6IEFzeW5jSXRlcmF0b3I8VCwgdW5kZWZpbmVkLCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgaSA9IDA7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5leHQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlLkRvbmVFcnJvcikge1xuXHRcdFx0XHRcdFx0dGhyb3cgdGhpcy5fZXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpIDwgdGhpcy5fcmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGRvbmU6IGZhbHNlLCB2YWx1ZTogdGhpcy5fcmVzdWx0c1tpKytdIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlLkRvbmVPSykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5fb25TdGF0ZUNoYW5nZWQuZXZlbnQpO1xuXHRcdFx0XHR9IHdoaWxlICh0cnVlKTtcblx0XHRcdH0sXG5cdFx0XHRyZXR1cm46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5fb25SZXR1cm4/LigpO1xuXHRcdFx0XHRyZXR1cm4geyBkb25lOiB0cnVlLCB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbWFwPFQsIFI+KGl0ZXJhYmxlOiBBc3luY0l0ZXJhYmxlPFQ+LCBtYXBGbjogKGl0ZW06IFQpID0+IFIpOiBBc3luY0l0ZXJhYmxlT2JqZWN0PFI+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVPYmplY3Q8Uj4oYXN5bmMgKGVtaXR0ZXIpID0+IHtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyYWJsZSkge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUobWFwRm4oaXRlbSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG1hcDxSPihtYXBGbjogKGl0ZW06IFQpID0+IFIpOiBBc3luY0l0ZXJhYmxlT2JqZWN0PFI+IHtcblx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZU9iamVjdC5tYXAodGhpcywgbWFwRm4pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmaWx0ZXI8VD4oaXRlcmFibGU6IEFzeW5jSXRlcmFibGU8VD4sIGZpbHRlckZuOiAoaXRlbTogVCkgPT4gYm9vbGVhbik6IEFzeW5jSXRlcmFibGVPYmplY3Q8VD4ge1xuXHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZU9iamVjdDxUPihhc3luYyAoZW1pdHRlcikgPT4ge1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXJhYmxlKSB7XG5cdFx0XHRcdGlmIChmaWx0ZXJGbihpdGVtKSkge1xuXHRcdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZShpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGZpbHRlcjxUMiBleHRlbmRzIFQ+KGZpbHRlckZuOiAoaXRlbTogVCkgPT4gaXRlbSBpcyBUMik6IEFzeW5jSXRlcmFibGVPYmplY3Q8VDI+O1xuXHRwdWJsaWMgZmlsdGVyKGZpbHRlckZuOiAoaXRlbTogVCkgPT4gYm9vbGVhbik6IEFzeW5jSXRlcmFibGVPYmplY3Q8VD47XG5cdHB1YmxpYyBmaWx0ZXIoZmlsdGVyRm46IChpdGVtOiBUKSA9PiBib29sZWFuKTogQXN5bmNJdGVyYWJsZU9iamVjdDxUPiB7XG5cdFx0cmV0dXJuIEFzeW5jSXRlcmFibGVPYmplY3QuZmlsdGVyKHRoaXMsIGZpbHRlckZuKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29hbGVzY2U8VD4oaXRlcmFibGU6IEFzeW5jSXRlcmFibGU8VCB8IHVuZGVmaW5lZCB8IG51bGw+KTogQXN5bmNJdGVyYWJsZU9iamVjdDxUPiB7XG5cdFx0cmV0dXJuIDxBc3luY0l0ZXJhYmxlT2JqZWN0PFQ+PkFzeW5jSXRlcmFibGVPYmplY3QuZmlsdGVyKGl0ZXJhYmxlLCBpdGVtID0+ICEhaXRlbSk7XG5cdH1cblxuXHRwdWJsaWMgY29hbGVzY2UoKTogQXN5bmNJdGVyYWJsZU9iamVjdDxOb25OdWxsYWJsZTxUPj4ge1xuXHRcdHJldHVybiBBc3luY0l0ZXJhYmxlT2JqZWN0LmNvYWxlc2NlKHRoaXMpIGFzIEFzeW5jSXRlcmFibGVPYmplY3Q8Tm9uTnVsbGFibGU8VD4+O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBhc3luYyB0b1Byb21pc2U8VD4oaXRlcmFibGU6IEFzeW5jSXRlcmFibGU8VD4pOiBQcm9taXNlPFRbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogVFtdID0gW107XG5cdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXJhYmxlKSB7XG5cdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyB0b1Byb21pc2UoKTogUHJvbWlzZTxUW10+IHtcblx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZU9iamVjdC50b1Byb21pc2UodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHZhbHVlIHdpbGwgYmUgYXBwZW5kZWQgYXQgdGhlIGVuZC5cblx0ICpcblx0ICogKipOT1RFKiogSWYgYHJlc29sdmUoKWAgb3IgYHJlamVjdCgpYCBoYXZlIGFscmVhZHkgYmVlbiBjYWxsZWQsIHRoaXMgbWV0aG9kIGhhcyBubyBlZmZlY3QuXG5cdCAqL1xuXHRwcml2YXRlIGVtaXRPbmUodmFsdWU6IFQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IEFzeW5jSXRlcmFibGVTb3VyY2VTdGF0ZS5Jbml0aWFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGl0IGlzIGltcG9ydGFudCB0byBhZGQgbmV3IHZhbHVlcyBhdCB0aGUgZW5kLFxuXHRcdC8vIGFzIHdlIG1heSBoYXZlIGl0ZXJhdG9ycyBhbHJlYWR5IHJ1bm5pbmcgb24gdGhlIGFycmF5XG5cdFx0dGhpcy5fcmVzdWx0cy5wdXNoKHZhbHVlKTtcblx0XHR0aGlzLl9vblN0YXRlQ2hhbmdlZC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHZhbHVlcyB3aWxsIGJlIGFwcGVuZGVkIGF0IHRoZSBlbmQuXG5cdCAqXG5cdCAqICoqTk9URSoqIElmIGByZXNvbHZlKClgIG9yIGByZWplY3QoKWAgaGF2ZSBhbHJlYWR5IGJlZW4gY2FsbGVkLCB0aGlzIG1ldGhvZCBoYXMgbm8gZWZmZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSBlbWl0TWFueSh2YWx1ZXM6IFRbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlLkluaXRpYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gaXQgaXMgaW1wb3J0YW50IHRvIGFkZCBuZXcgdmFsdWVzIGF0IHRoZSBlbmQsXG5cdFx0Ly8gYXMgd2UgbWF5IGhhdmUgaXRlcmF0b3JzIGFscmVhZHkgcnVubmluZyBvbiB0aGUgYXJyYXlcblx0XHR0aGlzLl9yZXN1bHRzID0gdGhpcy5fcmVzdWx0cy5jb25jYXQodmFsdWVzKTtcblx0XHR0aGlzLl9vblN0YXRlQ2hhbmdlZC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGluZyBgcmVzb2x2ZSgpYCB3aWxsIG1hcmsgdGhlIHJlc3VsdCBhcnJheSBhcyBjb21wbGV0ZS5cblx0ICpcblx0ICogKipOT1RFKiogYHJlc29sdmUoKWAgbXVzdCBiZSBjYWxsZWQsIG90aGVyd2lzZSBhbGwgY29uc3VtZXJzIG9mIHRoaXMgaXRlcmFibGUgd2lsbCBoYW5nIGluZGVmaW5pdGVseSwgc2ltaWxhciB0byBhIG5vbi1yZXNvbHZlZCBwcm9taXNlLlxuXHQgKiAqKk5PVEUqKiBJZiBgcmVzb2x2ZSgpYCBvciBgcmVqZWN0KClgIGhhdmUgYWxyZWFkeSBiZWVuIGNhbGxlZCwgdGhpcyBtZXRob2QgaGFzIG5vIGVmZmVjdC5cblx0ICovXG5cdHByaXZhdGUgcmVzb2x2ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IEFzeW5jSXRlcmFibGVTb3VyY2VTdGF0ZS5Jbml0aWFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlID0gQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlLkRvbmVPSztcblx0XHR0aGlzLl9vblN0YXRlQ2hhbmdlZC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogV3JpdGluZyBhbiBlcnJvciB3aWxsIHBlcm1hbmVudGx5IGludmFsaWRhdGUgdGhpcyBpdGVyYWJsZS5cblx0ICogVGhlIGN1cnJlbnQgdXNlcnMgd2lsbCByZWNlaXZlIGFuIGVycm9yIHRocm93biwgYXMgd2lsbCBhbGwgZnV0dXJlIHVzZXJzLlxuXHQgKlxuXHQgKiAqKk5PVEUqKiBJZiBgcmVzb2x2ZSgpYCBvciBgcmVqZWN0KClgIGhhdmUgYWxyZWFkeSBiZWVuIGNhbGxlZCwgdGhpcyBtZXRob2QgaGFzIG5vIGVmZmVjdC5cblx0ICovXG5cdHByaXZhdGUgcmVqZWN0KGVycm9yOiBFcnJvcikge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gQXN5bmNJdGVyYWJsZVNvdXJjZVN0YXRlLkluaXRpYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUgPSBBc3luY0l0ZXJhYmxlU291cmNlU3RhdGUuRG9uZUVycm9yO1xuXHRcdHRoaXMuX2Vycm9yID0gZXJyb3I7XG5cdFx0dGhpcy5fb25TdGF0ZUNoYW5nZWQuZmlyZSgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNhbmNlbGFibGVBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4oY2FsbGJhY2s6ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IEFzeW5jSXRlcmFibGU8VD4pOiBDYW5jZWxhYmxlQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQ+IHtcblx0Y29uc3Qgc291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdGNvbnN0IGlubmVySXRlcmFibGUgPSBjYWxsYmFjayhzb3VyY2UudG9rZW4pO1xuXG5cdHJldHVybiBuZXcgQ2FuY2VsYWJsZUFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPihzb3VyY2UsIGFzeW5jIChlbWl0dGVyKSA9PiB7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gc291cmNlLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRzb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0ZW1pdHRlci5yZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaW5uZXJJdGVyYWJsZSkge1xuXHRcdFx0XHRpZiAoc291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0Ly8gY2FuY2VsZWQgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZShpdGVtKTtcblx0XHRcdH1cblx0XHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRzb3VyY2UuZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdHNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0XHRlbWl0dGVyLnJlamVjdChlcnIpO1xuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBBc3luY0l0ZXJhYmxlU291cmNlPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXN5bmNJdGVyYWJsZTogQXN5bmNJdGVyYWJsZU9iamVjdDxUPjtcblxuXHRwcml2YXRlIF9lcnJvckZuOiAoZXJyb3I6IEVycm9yKSA9PiB2b2lkO1xuXHRwcml2YXRlIF9lbWl0T25lRm46IChpdGVtOiBUKSA9PiB2b2lkO1xuXHRwcml2YXRlIF9lbWl0TWFueUZuOiAoaXRlbTogVFtdKSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKlxuXHQgKiBAcGFyYW0gb25SZXR1cm4gQSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgY2FsbGVkIHdoZW4gY29uc3VtaW5nIHRoZSBhc3luYyBpdGVyYWJsZVxuXHQgKiBoYXMgZmluaXNoZWQgYnkgdGhlIGNvbnN1bWVyLCBlLmcgdGhlIGZvci1hd2FpdC1sb29wIGhhcyBiZSBleGlzdGVkIChicmVhaywgcmV0dXJuKSBlYXJseS5cblx0ICogVGhpcyBpcyBOT1QgY2FsbGVkIHdoZW4gcmVzb2x2aW5nIHRoaXMgc291cmNlIGJ5IGl0cyBvd25lci5cblx0ICovXG5cdGNvbnN0cnVjdG9yKG9uUmV0dXJuPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQpIHtcblx0XHR0aGlzLl9hc3luY0l0ZXJhYmxlID0gbmV3IEFzeW5jSXRlcmFibGVPYmplY3QoZW1pdHRlciA9PiB7XG5cblx0XHRcdGlmIChlYXJseUVycm9yKSB7XG5cdFx0XHRcdGVtaXR0ZXIucmVqZWN0KGVhcmx5RXJyb3IpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWFybHlJdGVtcykge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KGVhcmx5SXRlbXMpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZXJyb3JGbiA9IChlcnJvcjogRXJyb3IpID0+IGVtaXR0ZXIucmVqZWN0KGVycm9yKTtcblx0XHRcdHRoaXMuX2VtaXRPbmVGbiA9IChpdGVtOiBUKSA9PiBlbWl0dGVyLmVtaXRPbmUoaXRlbSk7XG5cdFx0XHR0aGlzLl9lbWl0TWFueUZuID0gKGl0ZW1zOiBUW10pID0+IGVtaXR0ZXIuZW1pdE1hbnkoaXRlbXMpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlZmVycmVkLnA7XG5cdFx0fSwgb25SZXR1cm4pO1xuXG5cdFx0bGV0IGVhcmx5RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBlYXJseUl0ZW1zOiBUW10gfCB1bmRlZmluZWQ7XG5cblxuXHRcdHRoaXMuX2Vycm9yRm4gPSAoZXJyb3I6IEVycm9yKSA9PiB7XG5cdFx0XHRpZiAoIWVhcmx5RXJyb3IpIHtcblx0XHRcdFx0ZWFybHlFcnJvciA9IGVycm9yO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fZW1pdE9uZUZuID0gKGl0ZW06IFQpID0+IHtcblx0XHRcdGlmICghZWFybHlJdGVtcykge1xuXHRcdFx0XHRlYXJseUl0ZW1zID0gW107XG5cdFx0XHR9XG5cdFx0XHRlYXJseUl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fTtcblx0XHR0aGlzLl9lbWl0TWFueUZuID0gKGl0ZW1zOiBUW10pID0+IHtcblx0XHRcdGlmICghZWFybHlJdGVtcykge1xuXHRcdFx0XHRlYXJseUl0ZW1zID0gaXRlbXMuc2xpY2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGl0ZW1zLmZvckVhY2goaXRlbSA9PiBlYXJseUl0ZW1zIS5wdXNoKGl0ZW0pKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Z2V0IGFzeW5jSXRlcmFibGUoKTogQXN5bmNJdGVyYWJsZU9iamVjdDxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FzeW5jSXRlcmFibGU7XG5cdH1cblxuXHRyZXNvbHZlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RlZmVycmVkLmNvbXBsZXRlKCk7XG5cdH1cblxuXHRyZWplY3QoZXJyb3I6IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5fZXJyb3JGbihlcnJvcik7XG5cdFx0dGhpcy5fZGVmZXJyZWQuY29tcGxldGUoKTtcblx0fVxuXG5cdGVtaXRPbmUoaXRlbTogVCk6IHZvaWQge1xuXHRcdHRoaXMuX2VtaXRPbmVGbihpdGVtKTtcblx0fVxuXG5cdGVtaXRNYW55KGl0ZW1zOiBUW10pIHtcblx0XHR0aGlzLl9lbWl0TWFueUZuKGl0ZW1zKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2FuY2VsbGFibGVJdGVyYWJsZTxUPihpdGVyYWJsZU9ySXRlcmF0b3I6IEFzeW5jSXRlcmF0b3I8VD4gfCBBc3luY0l0ZXJhYmxlPFQ+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8VD4ge1xuXHRjb25zdCBpdGVyYXRvciA9IFN5bWJvbC5hc3luY0l0ZXJhdG9yIGluIGl0ZXJhYmxlT3JJdGVyYXRvciA/IGl0ZXJhYmxlT3JJdGVyYXRvcltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKSA6IGl0ZXJhYmxlT3JJdGVyYXRvcjtcblxuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIG5leHQoKTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxUPj4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oaXRlcmF0b3IubmV4dCgpLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gcmVzdWx0IHx8IHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdH0sXG5cdFx0dGhyb3c6IGl0ZXJhdG9yLnRocm93Py5iaW5kKGl0ZXJhdG9yKSxcblx0XHRyZXR1cm46IGl0ZXJhdG9yLnJldHVybj8uYmluZChpdGVyYXRvciksXG5cdFx0W1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0fTtcbn1cblxudHlwZSBQcm9kdWNlckNvbnN1bWVyVmFsdWU8VD4gPSB7XG5cdG9rOiB0cnVlO1xuXHR2YWx1ZTogVDtcbn0gfCB7XG5cdG9rOiBmYWxzZTtcblx0ZXJyb3I6IEVycm9yO1xufTtcblxuY2xhc3MgUHJvZHVjZXJDb25zdW1lcjxUPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Vuc2F0aXNmaWVkQ29uc3VtZXJzOiBEZWZlcnJlZFByb21pc2U8VD5bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmNvbnN1bWVkVmFsdWVzOiBQcm9kdWNlckNvbnN1bWVyVmFsdWU8VD5bXSA9IFtdO1xuXHRwcml2YXRlIF9maW5hbFZhbHVlOiBQcm9kdWNlckNvbnN1bWVyVmFsdWU8VD4gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIGdldCBoYXNGaW5hbFZhbHVlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2ZpbmFsVmFsdWU7XG5cdH1cblxuXHRwcm9kdWNlKHZhbHVlOiBQcm9kdWNlckNvbnN1bWVyVmFsdWU8VD4pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVOb0ZpbmFsVmFsdWUoKTtcblx0XHRpZiAodGhpcy5fdW5zYXRpc2ZpZWRDb25zdW1lcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSB0aGlzLl91bnNhdGlzZmllZENvbnN1bWVycy5zaGlmdCgpITtcblx0XHRcdHRoaXMuX3Jlc29sdmVPclJlamVjdERlZmVycmVkKGRlZmVycmVkLCB2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3VuY29uc3VtZWRWYWx1ZXMucHVzaCh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvZHVjZUZpbmFsKHZhbHVlOiBQcm9kdWNlckNvbnN1bWVyVmFsdWU8VD4pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVOb0ZpbmFsVmFsdWUoKTtcblx0XHR0aGlzLl9maW5hbFZhbHVlID0gdmFsdWU7XG5cdFx0Zm9yIChjb25zdCBkZWZlcnJlZCBvZiB0aGlzLl91bnNhdGlzZmllZENvbnN1bWVycykge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZU9yUmVqZWN0RGVmZXJyZWQoZGVmZXJyZWQsIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5fdW5zYXRpc2ZpZWRDb25zdW1lcnMubGVuZ3RoID0gMDtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZU5vRmluYWxWYWx1ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZmluYWxWYWx1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignUHJvZHVjZXJDb25zdW1lcjogY2Fubm90IHByb2R1Y2UgYWZ0ZXIgZmluYWwgdmFsdWUgaGFzIGJlZW4gc2V0Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZU9yUmVqZWN0RGVmZXJyZWQoZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTxUPiwgdmFsdWU6IFByb2R1Y2VyQ29uc3VtZXJWYWx1ZTxUPik6IHZvaWQge1xuXHRcdGlmICh2YWx1ZS5vaykge1xuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUodmFsdWUudmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWZlcnJlZC5lcnJvcih2YWx1ZS5lcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3VtZSgpOiBQcm9taXNlPFQ+IHtcblx0XHRpZiAodGhpcy5fdW5jb25zdW1lZFZhbHVlcy5sZW5ndGggPiAwIHx8IHRoaXMuX2ZpbmFsVmFsdWUpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fdW5jb25zdW1lZFZhbHVlcy5sZW5ndGggPiAwID8gdGhpcy5fdW5jb25zdW1lZFZhbHVlcy5zaGlmdCgpISA6IHRoaXMuX2ZpbmFsVmFsdWUhO1xuXHRcdFx0aWYgKHZhbHVlLm9rKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodmFsdWUudmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHZhbHVlLmVycm9yKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFQ+KCk7XG5cdFx0XHR0aGlzLl91bnNhdGlzZmllZENvbnN1bWVycy5wdXNoKGRlZmVycmVkKTtcblx0XHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEltcG9ydGFudCBkaWZmZXJlbmNlIHRvIEFzeW5jSXRlcmFibGVPYmplY3Q6XG4gKiBJZiBpdCBpcyBpdGVyYXRlZCB0d28gdGltZXMsIHRoZSBzZWNvbmQgaXRlcmF0b3Igd2lsbCBub3Qgc2VlIHRoZSB2YWx1ZXMgZW1pdHRlZCBieSB0aGUgZmlyc3QgaXRlcmF0b3IuXG4gKi9cbmV4cG9ydCBjbGFzcyBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4gaW1wbGVtZW50cyBBc3luY0l0ZXJhYmxlPFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZHVjZXJDb25zdW1lciA9IG5ldyBQcm9kdWNlckNvbnN1bWVyPEl0ZXJhdG9yUmVzdWx0PFQ+PigpO1xuXG5cdGNvbnN0cnVjdG9yKGV4ZWN1dG9yOiBBc3luY0l0ZXJhYmxlRXhlY3V0b3I8VD4sIHByaXZhdGUgcmVhZG9ubHkgX29uUmV0dXJuPzogKCkgPT4gdm9pZCkge1xuXHRcdHF1ZXVlTWljcm90YXNrKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHAgPSBleGVjdXRvcih7XG5cdFx0XHRcdGVtaXRPbmU6IHZhbHVlID0+IHRoaXMuX3Byb2R1Y2VyQ29uc3VtZXIucHJvZHVjZSh7IG9rOiB0cnVlLCB2YWx1ZTogeyBkb25lOiBmYWxzZSwgdmFsdWU6IHZhbHVlIH0gfSksXG5cdFx0XHRcdGVtaXRNYW55OiB2YWx1ZXMgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wcm9kdWNlckNvbnN1bWVyLnByb2R1Y2UoeyBvazogdHJ1ZSwgdmFsdWU6IHsgZG9uZTogZmFsc2UsIHZhbHVlOiB2YWx1ZSB9IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0cmVqZWN0OiBlcnJvciA9PiB0aGlzLl9maW5pc2hFcnJvcihlcnJvciksXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCF0aGlzLl9wcm9kdWNlckNvbnN1bWVyLmhhc0ZpbmFsVmFsdWUpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBwO1xuXHRcdFx0XHRcdHRoaXMuX2ZpbmlzaE9rKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmluaXNoRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21BcnJheTxUPihpdGVtczogVFtdKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPigod3JpdGVyKSA9PiB7XG5cdFx0XHR3cml0ZXIuZW1pdE1hbnkoaXRlbXMpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tUHJvbWlzZTxUPihwcm9taXNlOiBQcm9taXNlPFRbXT4pOiBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4ge1xuXHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQ+KGFzeW5jIChlbWl0dGVyKSA9PiB7XG5cdFx0XHRlbWl0dGVyLmVtaXRNYW55KGF3YWl0IHByb21pc2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tUHJvbWlzZXNSZXNvbHZlT3JkZXI8VD4ocHJvbWlzZXM6IFByb21pc2U8VD5bXSk6IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4oYXN5bmMgKGVtaXR0ZXIpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzLm1hcChhc3luYyAocCkgPT4gZW1pdHRlci5lbWl0T25lKGF3YWl0IHApKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1lcmdlPFQ+KGl0ZXJhYmxlczogQXN5bmNJdGVyYWJsZTxUPltdKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcihhc3luYyAoZW1pdHRlcikgPT4ge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaXRlcmFibGVzLm1hcChhc3luYyAoaXRlcmFibGUpID0+IHtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXJhYmxlKSB7XG5cdFx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIEVNUFRZID0gQXN5bmNJdGVyYWJsZVByb2R1Y2VyLmZyb21BcnJheTxhbnk+KFtdKTtcblxuXHRwdWJsaWMgc3RhdGljIG1hcDxULCBSPihpdGVyYWJsZTogQXN5bmNJdGVyYWJsZTxUPiwgbWFwRm46IChpdGVtOiBUKSA9PiBSKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFI+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxSPihhc3luYyAoZW1pdHRlcikgPT4ge1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXJhYmxlKSB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZShtYXBGbihpdGVtKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHRlZTxUPihpdGVyYWJsZTogQXN5bmNJdGVyYWJsZTxUPik6IFtBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4sIEFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPl0ge1xuXHRcdGxldCBlbWl0dGVyMTogQXN5bmNJdGVyYWJsZUVtaXR0ZXI8VD4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGVtaXR0ZXIyOiBBc3luY0l0ZXJhYmxlRW1pdHRlcjxUPiB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGRlZmVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIWVtaXR0ZXIxIHx8ICFlbWl0dGVyMikge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vdCB5ZXQgcmVhZHlcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyYWJsZSkge1xuXHRcdFx0XHRcdGVtaXR0ZXIxLmVtaXRPbmUoaXRlbSk7XG5cdFx0XHRcdFx0ZW1pdHRlcjIuZW1pdE9uZShpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGVtaXR0ZXIxLnJlamVjdChlcnIpO1xuXHRcdFx0XHRlbWl0dGVyMi5yZWplY3QoZXJyKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRlZmVyLmNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHAxID0gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPihhc3luYyAoZW1pdHRlcikgPT4ge1xuXHRcdFx0ZW1pdHRlcjEgPSBlbWl0dGVyO1xuXHRcdFx0c3RhcnQoKTtcblx0XHRcdHJldHVybiBkZWZlci5wO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHAyID0gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPihhc3luYyAoZW1pdHRlcikgPT4ge1xuXHRcdFx0ZW1pdHRlcjIgPSBlbWl0dGVyO1xuXHRcdFx0c3RhcnQoKTtcblx0XHRcdHJldHVybiBkZWZlci5wO1xuXHRcdH0pO1xuXHRcdHJldHVybiBbcDEsIHAyXTtcblx0fVxuXG5cdHB1YmxpYyBtYXA8Uj4obWFwRm46IChpdGVtOiBUKSA9PiBSKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFI+IHtcblx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZVByb2R1Y2VyLm1hcCh0aGlzLCBtYXBGbik7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNvYWxlc2NlPFQ+KGl0ZXJhYmxlOiBBc3luY0l0ZXJhYmxlPFQgfCB1bmRlZmluZWQgfCBudWxsPik6IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxUPiB7XG5cdFx0cmV0dXJuIDxBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4+QXN5bmNJdGVyYWJsZVByb2R1Y2VyLmZpbHRlcihpdGVyYWJsZSwgaXRlbSA9PiAhIWl0ZW0pO1xuXHR9XG5cblx0cHVibGljIGNvYWxlc2NlKCk6IEFzeW5jSXRlcmFibGVQcm9kdWNlcjxOb25OdWxsYWJsZTxUPj4ge1xuXHRcdHJldHVybiBBc3luY0l0ZXJhYmxlUHJvZHVjZXIuY29hbGVzY2UodGhpcykgYXMgQXN5bmNJdGVyYWJsZVByb2R1Y2VyPE5vbk51bGxhYmxlPFQ+Pjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZmlsdGVyPFQ+KGl0ZXJhYmxlOiBBc3luY0l0ZXJhYmxlPFQ+LCBmaWx0ZXJGbjogKGl0ZW06IFQpID0+IGJvb2xlYW4pOiBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4ge1xuXHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQ+KGFzeW5jIChlbWl0dGVyKSA9PiB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcmFibGUpIHtcblx0XHRcdFx0aWYgKGZpbHRlckZuKGl0ZW0pKSB7XG5cdFx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZmlsdGVyPFQyIGV4dGVuZHMgVD4oZmlsdGVyRm46IChpdGVtOiBUKSA9PiBpdGVtIGlzIFQyKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQyPjtcblx0cHVibGljIGZpbHRlcihmaWx0ZXJGbjogKGl0ZW06IFQpID0+IGJvb2xlYW4pOiBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD47XG5cdHB1YmxpYyBmaWx0ZXIoZmlsdGVyRm46IChpdGVtOiBUKSA9PiBib29sZWFuKTogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFQ+IHtcblx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZVByb2R1Y2VyLmZpbHRlcih0aGlzLCBmaWx0ZXJGbik7XG5cdH1cblxuXHRwcml2YXRlIF9maW5pc2hPaygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Byb2R1Y2VyQ29uc3VtZXIuaGFzRmluYWxWYWx1ZSkge1xuXHRcdFx0dGhpcy5fcHJvZHVjZXJDb25zdW1lci5wcm9kdWNlRmluYWwoeyBvazogdHJ1ZSwgdmFsdWU6IHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaEVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcHJvZHVjZXJDb25zdW1lci5oYXNGaW5hbFZhbHVlKSB7XG5cdFx0XHR0aGlzLl9wcm9kdWNlckNvbnN1bWVyLnByb2R1Y2VGaW5hbCh7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yIH0pO1xuXHRcdH1cblx0XHQvLyBXYXJuaW5nOiB0aGlzIGNhbiBjYXVzZSB0byBkcm9wcGVkIGVycm9ycy5cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZXJhdG9yOiBBc3luY0l0ZXJhdG9yPFQsIHZvaWQsIHZvaWQ+ID0ge1xuXHRcdG5leHQ6ICgpID0+IHRoaXMuX3Byb2R1Y2VyQ29uc3VtZXIuY29uc3VtZSgpLFxuXHRcdHJldHVybjogKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25SZXR1cm4/LigpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfSk7XG5cdFx0fSxcblx0XHR0aHJvdzogYXN5bmMgKGUpID0+IHtcblx0XHRcdHRoaXMuX2ZpbmlzaEVycm9yKGUpO1xuXHRcdFx0cmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdH0sXG5cdH07XG5cblx0W1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpOiBBc3luY0l0ZXJhdG9yPFQsIHZvaWQsIHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5faXRlcmF0b3I7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENhbmNlbGFibGVBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4gZXh0ZW5kcyBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlLFxuXHRcdGV4ZWN1dG9yOiBBc3luY0l0ZXJhYmxlRXhlY3V0b3I8VD5cblx0KSB7XG5cdFx0c3VwZXIoZXhlY3V0b3IpO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NvdXJjZS5jYW5jZWwoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGNvbnN0IEFzeW5jUmVhZGVyRW5kT2ZTdHJlYW0gPSBTeW1ib2woJ0FzeW5jUmVhZGVyRW5kT2ZTdHJlYW0nKTtcblxuZXhwb3J0IGNsYXNzIEFzeW5jUmVhZGVyPFQ+IHtcblx0cHJpdmF0ZSBfYnVmZmVyOiBUW10gPSBbXTtcblx0cHJpdmF0ZSBfYXRFbmQgPSBmYWxzZTtcblxuXHRwdWJsaWMgZ2V0IGVuZE9mU3RyZWFtKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYnVmZmVyLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl9hdEVuZDsgfVxuXHRwcml2YXRlIF9leHRlbmRCdWZmZXJQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NvdXJjZTogQXN5bmNJdGVyYXRvcjxUPlxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZWFkKCk6IFByb21pc2U8VCB8IHR5cGVvZiBBc3luY1JlYWRlckVuZE9mU3RyZWFtPiB7XG5cdFx0aWYgKHRoaXMuX2J1ZmZlci5sZW5ndGggPT09IDAgJiYgIXRoaXMuX2F0RW5kKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9leHRlbmRCdWZmZXIoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2J1ZmZlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBBc3luY1JlYWRlckVuZE9mU3RyZWFtO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLnNoaWZ0KCkhO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlYWRXaGlsZShwcmVkaWNhdGU6ICh2YWx1ZTogVCkgPT4gYm9vbGVhbiwgY2FsbGJhY2s6IChlbGVtZW50OiBUKSA9PiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZG8ge1xuXHRcdFx0Y29uc3QgcGllY2UgPSBhd2FpdCB0aGlzLnBlZWsoKTtcblx0XHRcdGlmIChwaWVjZSA9PT0gQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICghcHJlZGljYXRlKHBpZWNlKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMucmVhZCgpOyAvLyBjb25zdW1lXG5cdFx0XHRhd2FpdCBjYWxsYmFjayhwaWVjZSk7XG5cdFx0fSB3aGlsZSAodHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZEJ1ZmZlcmVkT3JUaHJvdygpOiBUIHwgdHlwZW9mIEFzeW5jUmVhZGVyRW5kT2ZTdHJlYW0ge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5wZWVrQnVmZmVyZWRPclRocm93KCk7XG5cdFx0dGhpcy5fYnVmZmVyLnNoaWZ0KCk7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbnN1bWVUb0VuZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAoIXRoaXMuZW5kT2ZTdHJlYW0pIHtcblx0XHRcdGF3YWl0IHRoaXMucmVhZCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwZWVrKCk6IFByb21pc2U8VCB8IHR5cGVvZiBBc3luY1JlYWRlckVuZE9mU3RyZWFtPiB7XG5cdFx0aWYgKHRoaXMuX2J1ZmZlci5sZW5ndGggPT09IDAgJiYgIXRoaXMuX2F0RW5kKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9leHRlbmRCdWZmZXIoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2J1ZmZlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBBc3luY1JlYWRlckVuZE9mU3RyZWFtO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyWzBdO1xuXHR9XG5cblx0cHVibGljIHBlZWtCdWZmZXJlZE9yVGhyb3coKTogVCB8IHR5cGVvZiBBc3luY1JlYWRlckVuZE9mU3RyZWFtIHtcblx0XHRpZiAodGhpcy5fYnVmZmVyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX2F0RW5kKSB7XG5cdFx0XHRcdHJldHVybiBBc3luY1JlYWRlckVuZE9mU3RyZWFtO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignTm8gYnVmZmVyZWQgZWxlbWVudHMnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyWzBdO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHBlZWtUaW1lb3V0KHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTxUIHwgdHlwZW9mIEFzeW5jUmVhZGVyRW5kT2ZTdHJlYW0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5fYnVmZmVyLmxlbmd0aCA9PT0gMCAmJiAhdGhpcy5fYXRFbmQpIHtcblx0XHRcdGF3YWl0IHJhY2VUaW1lb3V0KHRoaXMuX2V4dGVuZEJ1ZmZlcigpLCB0aW1lb3V0TXMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYXRFbmQpIHtcblx0XHRcdHJldHVybiBBc3luY1JlYWRlckVuZE9mU3RyZWFtO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYnVmZmVyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlclswXTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dGVuZEJ1ZmZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fYXRFbmQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2V4dGVuZEJ1ZmZlclByb21pc2UpIHtcblx0XHRcdHRoaXMuX2V4dGVuZEJ1ZmZlclByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHZhbHVlLCBkb25lIH0gPSBhd2FpdCB0aGlzLl9zb3VyY2UubmV4dCgpO1xuXHRcdFx0XHR0aGlzLl9leHRlbmRCdWZmZXJQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdHRoaXMuX2F0RW5kID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9idWZmZXIucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuZEJ1ZmZlclByb21pc2U7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRpbWVvdXQobXM6IG51bWJlciwgY2I6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHQgPSBzZXRUaW1lb3V0KGNiLCBtcyk7XG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkg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TSxLQUFLLGNBQWM7QUFBQSxJQUMxQjtBQUNBLFFBQUksS0FBSyxRQUFRLFdBQVcsR0FBRztBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxRQUFRLENBQUM7QUFBQSxFQUN0QjtBQUFBLEVBRU8sc0JBQXlEO0FBQy9ELFFBQUksS0FBSyxRQUFRLFdBQVcsR0FBRztBQUM5QixVQUFJLEtBQUssUUFBUTtBQUNoQixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sSUFBSSxtQkFBbUIsc0JBQXNCO0FBQUEsSUFDcEQ7QUFFQSxXQUFPLEtBQUssUUFBUSxDQUFDO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE1BQWEsWUFBWSxXQUEyRTtBQUNuRyxRQUFJLEtBQUssUUFBUSxXQUFXLEtBQUssQ0FBQyxLQUFLLFFBQVE7QUFDOUMsWUFBTSxZQUFZLEtBQUssY0FBYyxHQUFHLFNBQVM7QUFBQSxJQUNsRDtBQUNBLFFBQUksS0FBSyxRQUFRO0FBQ2hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLFFBQVEsV0FBVyxHQUFHO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFFBQVEsQ0FBQztBQUFBLEVBQ3RCO0FBQUEsRUFFUSxnQkFBK0I7QUFDdEMsUUFBSSxLQUFLLFFBQVE7QUFDaEIsYUFBTyxRQUFRLFFBQVE7QUFBQSxJQUN4QjtBQUVBLFFBQUksQ0FBQyxLQUFLLHNCQUFzQjtBQUMvQixXQUFLLHdCQUF3QixZQUFZO0FBQ3hDLGNBQU0sRUFBRSxPQUFPLEtBQUssSUFBSSxNQUFNLEtBQUssUUFBUSxLQUFLO0FBQ2hELGFBQUssdUJBQXVCO0FBQzVCLFlBQUksTUFBTTtBQUNULGVBQUssU0FBUztBQUFBLFFBQ2YsT0FBTztBQUNOLGVBQUssUUFBUSxLQUFLLEtBQUs7QUFBQSxRQUN4QjtBQUFBLE1BQ0QsR0FBRztBQUFBLElBQ0o7QUFFQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFTyxTQUFTLGNBQWMsSUFBWSxJQUE2QjtBQUN0RSxRQUFNLElBQUksV0FBVyxJQUFJLEVBQUU7QUFDM0IsU0FBTyxhQUFhLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFDMUM7IiwKICAibmFtZXMiOiBbInByb21pc2UiLCAidGltZW91dCIsICJ0YXNrIiwgInRva2VuIiwgIkRlZmVycmVkT3V0Y29tZSIsICJQcm9taXNlcyIsICJBc3luY0l0ZXJhYmxlU291cmNlU3RhdGUiXQp9Cg==
