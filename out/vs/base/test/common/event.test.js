import assert from "assert";
import { stub } from "sinon";
import { timeout } from "../../common/async.js";
import { CancellationToken } from "../../common/cancellation.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../common/errors.js";
import { AsyncEmitter, DebounceEmitter, DynamicListEventMultiplexer, Emitter, Event, EventBufferer, EventMultiplexer, ListenerLeakError, ListenerRefusalError, MicrotaskEmitter, PauseableEmitter, Relay, createEventDeliveryQueue, setGlobalLeakWarningThreshold } from "../../common/event.js";
import { DisposableStore, isDisposable, setDisposableTracker, DisposableTracker } from "../../common/lifecycle.js";
import { observableValue, transaction } from "../../common/observable.js";
import { MicrotaskDelay } from "../../common/symbols.js";
import { runWithFakedTimers } from "./timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { tail } from "../../common/arrays.js";
var Samples;
((Samples2) => {
  class EventCounter {
    constructor() {
      this.count = 0;
    }
    reset() {
      this.count = 0;
    }
    onEvent() {
      this.count += 1;
    }
  }
  Samples2.EventCounter = EventCounter;
  class Document3 {
    constructor() {
      this._onDidChange = new Emitter();
      this.onDidChange = this._onDidChange.event;
    }
    setText(value) {
      this._onDidChange.fire(value);
    }
    dispose() {
      this._onDidChange.dispose();
    }
  }
  Samples2.Document3 = Document3;
})(Samples || (Samples = {}));
suite("Event utils dispose", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let tracker = new DisposableTracker();
  function assertDisposablesCount(expected) {
    if (Array.isArray(expected)) {
      const instances = new Set(expected);
      const actualInstances = tracker.getTrackedDisposables();
      assert.strictEqual(actualInstances.length, expected.length);
      for (const item of actualInstances) {
        assert.ok(instances.has(item));
      }
    } else {
      assert.strictEqual(tracker.getTrackedDisposables().length, expected);
    }
  }
  setup(() => {
    tracker = new DisposableTracker();
    setDisposableTracker(tracker);
  });
  teardown(function() {
    setDisposableTracker(null);
  });
  test("no leak with snapshot-utils", function() {
    const store = new DisposableStore();
    const emitter = ds.add(new Emitter());
    const evens = Event.filter(emitter.event, (n) => n % 2 === 0, store);
    assertDisposablesCount(1);
    let all = 0;
    const leaked = evens((n) => all += n);
    assert.ok(isDisposable(leaked));
    assertDisposablesCount(3);
    emitter.dispose();
    store.dispose();
    assertDisposablesCount([leaked]);
  });
  test("no leak with debounce-util", function() {
    const store = new DisposableStore();
    const emitter = ds.add(new Emitter());
    const debounced = Event.debounce(emitter.event, (l) => 0, void 0, void 0, void 0, void 0, store);
    assertDisposablesCount(1);
    let all = 0;
    const leaked = debounced((n) => all += n);
    assert.ok(isDisposable(leaked));
    assertDisposablesCount(3);
    emitter.dispose();
    store.dispose();
    assertDisposablesCount([leaked]);
  });
});
suite("Event", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  const counter = new Samples.EventCounter();
  setup(() => counter.reset());
  test("Emitter plain", function() {
    const doc = ds.add(new Samples.Document3());
    const subscription = doc.onDidChange(counter.onEvent, counter);
    doc.setText("far");
    doc.setText("boo");
    subscription.dispose();
    doc.setText("boo");
    assert.strictEqual(counter.count, 2);
  });
  test("Emitter duplicate functions", () => {
    const calls = [];
    const a = (v) => calls.push(`a${v}`);
    const b = (v) => calls.push(`b${v}`);
    const emitter = ds.add(new Emitter());
    ds.add(emitter.event(a));
    ds.add(emitter.event(b));
    const s2 = emitter.event(a);
    emitter.fire("1");
    assert.deepStrictEqual(calls, ["a1", "b1", "a1"]);
    s2.dispose();
    calls.length = 0;
    emitter.fire("2");
    assert.deepStrictEqual(calls, ["a2", "b2"]);
  });
  test("Emitter, dispose listener during emission", () => {
    for (let keepFirstMod = 1; keepFirstMod < 4; keepFirstMod++) {
      const emitter = ds.add(new Emitter());
      const calls = [];
      const disposables = Array.from({ length: 25 }, (_, n) => ds.add(emitter.event(() => {
        if (n % keepFirstMod === 0) {
          disposables[n].dispose();
        }
        calls.push(n);
      })));
      emitter.fire();
      assert.deepStrictEqual(calls, Array.from({ length: 25 }, (_, n) => n));
    }
  });
  test("Emitter, dispose emitter during emission", () => {
    const emitter = ds.add(new Emitter());
    const calls = [];
    const disposables = Array.from({ length: 25 }, (_, n) => ds.add(emitter.event(() => {
      if (n === 10) {
        emitter.dispose();
      }
      calls.push(n);
    })));
    emitter.fire();
    disposables.forEach((d) => d.dispose());
    assert.deepStrictEqual(calls, Array.from({ length: 11 }, (_, n) => n));
  });
  test("Emitter, shared delivery queue", () => {
    const deliveryQueue = createEventDeliveryQueue();
    const emitter1 = ds.add(new Emitter({ deliveryQueue }));
    const emitter2 = ds.add(new Emitter({ deliveryQueue }));
    const calls = [];
    ds.add(emitter1.event((d) => {
      calls.push(`${d}a`);
      if (d === 1) {
        emitter2.fire(2);
      }
    }));
    ds.add(emitter1.event((d) => {
      calls.push(`${d}b`);
    }));
    ds.add(emitter2.event((d) => {
      calls.push(`${d}c`);
      emitter1.dispose();
    }));
    ds.add(emitter2.event((d) => {
      calls.push(`${d}d`);
    }));
    emitter1.fire(1);
    assert.deepStrictEqual(calls, ["1a", "1b", "2c", "2d"]);
  });
  test("Emitter, handles removal during 3", () => {
    const fn1 = stub();
    const fn2 = stub();
    const emitter = ds.add(new Emitter());
    ds.add(emitter.event(fn1));
    const h = emitter.event(() => {
      h.dispose();
    });
    ds.add(emitter.event(fn2));
    emitter.fire("foo");
    assert.deepStrictEqual(fn2.args, [["foo"]]);
    assert.deepStrictEqual(fn1.args, [["foo"]]);
  });
  test("Emitter, handles removal during 2", () => {
    const fn1 = stub();
    const emitter = ds.add(new Emitter());
    ds.add(emitter.event(fn1));
    const h = emitter.event(() => {
      h.dispose();
    });
    emitter.fire("foo");
    assert.deepStrictEqual(fn1.args, [["foo"]]);
  });
  test("Emitter, bucket", function() {
    const bucket = [];
    const doc = ds.add(new Samples.Document3());
    const subscription = doc.onDidChange(counter.onEvent, counter, bucket);
    doc.setText("far");
    doc.setText("boo");
    while (bucket.length) {
      bucket.pop().dispose();
    }
    doc.setText("boo");
    subscription.dispose();
    doc.setText("boo");
    assert.strictEqual(counter.count, 2);
  });
  test("Emitter, store", function() {
    const bucket = ds.add(new DisposableStore());
    const doc = ds.add(new Samples.Document3());
    const subscription = doc.onDidChange(counter.onEvent, counter, bucket);
    doc.setText("far");
    doc.setText("boo");
    bucket.clear();
    doc.setText("boo");
    subscription.dispose();
    doc.setText("boo");
    assert.strictEqual(counter.count, 2);
  });
  test("onFirstAdd|onLastRemove", () => {
    let firstCount = 0;
    let lastCount = 0;
    const a = ds.add(new Emitter({
      onWillAddFirstListener() {
        firstCount += 1;
      },
      onDidRemoveLastListener() {
        lastCount += 1;
      }
    }));
    assert.strictEqual(firstCount, 0);
    assert.strictEqual(lastCount, 0);
    let subscription1 = ds.add(a.event(function() {
    }));
    const subscription2 = ds.add(a.event(function() {
    }));
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(lastCount, 0);
    subscription1.dispose();
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(lastCount, 0);
    subscription2.dispose();
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(lastCount, 1);
    subscription1 = ds.add(a.event(function() {
    }));
    assert.strictEqual(firstCount, 2);
    assert.strictEqual(lastCount, 1);
  });
  test("onDidAddListener", () => {
    let count = 0;
    const a = ds.add(new Emitter({
      onDidAddListener() {
        count += 1;
      }
    }));
    assert.strictEqual(count, 0);
    let subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 1);
    subscription.dispose();
    assert.strictEqual(count, 1);
    subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 2);
    subscription.dispose();
    assert.strictEqual(count, 2);
  });
  test("onWillRemoveListener", () => {
    let count = 0;
    const a = ds.add(new Emitter({
      onWillRemoveListener() {
        count += 1;
      }
    }));
    assert.strictEqual(count, 0);
    let subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 0);
    subscription.dispose();
    assert.strictEqual(count, 1);
    subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 1);
  });
  test("throwingListener", () => {
    const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => null);
    try {
      const a = ds.add(new Emitter());
      let hit = false;
      ds.add(a.event(function() {
        throw 9;
      }));
      ds.add(a.event(function() {
        hit = true;
      }));
      a.fire(void 0);
      assert.strictEqual(hit, true);
    } finally {
      setUnexpectedErrorHandler(origErrorHandler);
    }
  });
  test("throwingListener (custom handler)", () => {
    const allError = [];
    const a = ds.add(new Emitter({
      onListenerError(e) {
        allError.push(e);
      }
    }));
    let hit = false;
    ds.add(a.event(function() {
      throw 9;
    }));
    ds.add(a.event(function() {
      hit = true;
    }));
    a.fire(void 0);
    assert.strictEqual(hit, true);
    assert.deepStrictEqual(allError, [9]);
  });
  test("throw ListenerLeakError", () => {
    const store = new DisposableStore();
    const allError = [];
    const a = ds.add(new Emitter({
      onListenerError(e) {
        allError.push(e);
      },
      leakWarningThreshold: 3
    }));
    for (let i = 0; i < 11; i++) {
      a.event(() => {
      }, void 0, store);
    }
    assert.deepStrictEqual(allError.length, 5);
    const [start, rest] = tail(allError);
    assert.ok(rest instanceof ListenerRefusalError);
    for (const item of start) {
      assert.ok(item instanceof ListenerLeakError);
    }
    store.dispose();
  });
  test("Emitter leak warnings track only active listener stacks", () => {
    const consoleWarn = stub(console, "warn");
    const errors = [];
    class TestEmitter extends Emitter {
      setListenerCount(listenerCount) {
        this._size = listenerCount;
      }
    }
    const emitter = ds.add(new TestEmitter({
      leakWarningThreshold: 3,
      leakWarningName: "test",
      onListenerError: (error) => errors.push(error)
    }));
    const addStackAListener = () => emitter.event(() => {
    });
    const addStackBListener = () => emitter.event(() => {
    });
    const addStackCListener = () => emitter.event(() => {
    });
    try {
      emitter.setListenerCount(2);
      const stackAListeners = Array.from({ length: 3 }, () => addStackAListener());
      stackAListeners[0].dispose();
      const stackBListener = addStackBListener();
      const stackCListener = addStackCListener();
      stackAListeners.slice(1).forEach((listener) => listener.dispose());
      stackBListener.dispose();
      stackCListener.dispose();
      emitter.setListenerCount(10);
      emitter.event(() => {
      });
      assert.deepStrictEqual(errors.map((error) => ({
        name: error.name,
        details: error instanceof ListenerLeakError ? error.details : void 0,
        hasUnknownStack: error.stack === "UNKNOWN stack"
      })), [
        {
          name: "ListenerLeakError",
          details: "[test] potential listener LEAK detected, having 3 listeners already. MOST frequent listener (1):",
          hasUnknownStack: false
        },
        {
          name: "ListenerLeakError",
          details: "[test] potential listener LEAK detected, having 5 listeners already. MOST frequent listener (3):",
          hasUnknownStack: false
        },
        {
          name: "ListenerLeakError",
          details: "[test] potential listener LEAK detected, having 6 listeners already. MOST frequent listener (2):",
          hasUnknownStack: false
        },
        {
          name: "ListenerRefusalError",
          details: "[test] REFUSES to accept new listeners because it exceeded its threshold by far (10 vs 3). HINT: Stack shows most frequent listener (-1-times)",
          hasUnknownStack: true
        }
      ]);
    } finally {
      consoleWarn.restore();
    }
  });
  test("Emitter captures global leak warning configuration at construction", () => {
    const consoleWarn = stub(console, "warn");
    const errors = [];
    let restoreThreshold = setGlobalLeakWarningThreshold(3);
    try {
      const monitoredEmitter = ds.add(new Emitter({
        leakWarningName: "captured",
        onListenerError: (error) => errors.push(error)
      }));
      restoreThreshold.dispose();
      restoreThreshold = void 0;
      const unmonitoredEmitter = ds.add(new Emitter({
        onListenerError: (error) => errors.push(error)
      }));
      restoreThreshold = setGlobalLeakWarningThreshold(3);
      const listeners = ds.add(new DisposableStore());
      const monitorAllocation = [Object.hasOwn(monitoredEmitter, "_leakageMon")];
      for (let i = 0; i < 3; i++) {
        monitoredEmitter.event(() => {
        }, void 0, listeners);
        unmonitoredEmitter.event(() => {
        }, void 0, listeners);
        monitorAllocation.push(Object.hasOwn(monitoredEmitter, "_leakageMon"));
      }
      restoreThreshold.dispose();
      restoreThreshold = void 0;
      assert.deepStrictEqual({
        errors: errors.map((error) => error.message),
        monitorAllocation,
        unmonitoredEmitterHasMonitor: Object.hasOwn(unmonitoredEmitter, "_leakageMon")
      }, {
        errors: ["[captured] potential listener LEAK detected, dominated"],
        monitorAllocation: [false, false, true, true],
        unmonitoredEmitterHasMonitor: false
      });
    } finally {
      restoreThreshold?.dispose();
      consoleWarn.restore();
    }
  });
  test("reusing event function and context", function() {
    let counter2 = 0;
    function listener() {
      counter2 += 1;
    }
    const context = {};
    const emitter = ds.add(new Emitter());
    const reg1 = emitter.event(listener, context);
    const reg2 = emitter.event(listener, context);
    emitter.fire(void 0);
    assert.strictEqual(counter2, 2);
    reg1.dispose();
    emitter.fire(void 0);
    assert.strictEqual(counter2, 3);
    reg2.dispose();
    emitter.fire(void 0);
    assert.strictEqual(counter2, 3);
  });
  test("DebounceEmitter", async function() {
    return runWithFakedTimers({}, async function() {
      let callCount = 0;
      let sum = 0;
      const emitter = new DebounceEmitter({
        merge: (arr) => {
          callCount += 1;
          return arr.reduce((p2, c) => p2 + c);
        }
      });
      ds.add(emitter.event((e) => {
        sum = e;
      }));
      const p = Event.toPromise(emitter.event);
      emitter.fire(1);
      emitter.fire(2);
      await p;
      assert.strictEqual(callCount, 1);
      assert.strictEqual(sum, 3);
    });
  });
  suite("Event.toPromise", () => {
    class DisposableStoreWithSize extends DisposableStore {
      constructor() {
        super(...arguments);
        this.size = 0;
      }
      add(o) {
        this.size++;
        return super.add(o);
      }
      delete(o) {
        this.size--;
        return super.delete(o);
      }
    }
    test("resolves on first event", async () => {
      const emitter = ds.add(new Emitter());
      const promise = Event.toPromise(emitter.event);
      emitter.fire(42);
      const result = await promise;
      assert.strictEqual(result, 42);
    });
    test("disposes listener after resolution", async () => {
      const emitter = ds.add(new Emitter());
      const promise = Event.toPromise(emitter.event);
      emitter.fire(1);
      await promise;
      emitter.fire(2);
      assert.ok(true);
    });
    test("adds to DisposableStore", async () => {
      const emitter = ds.add(new Emitter());
      const store = ds.add(new DisposableStoreWithSize());
      const promise = Event.toPromise(emitter.event, store);
      assert.strictEqual(store.size, 1);
      emitter.fire(42);
      await promise;
      assert.strictEqual(store.size, 0);
    });
    test("adds to disposables array", async () => {
      const emitter = ds.add(new Emitter());
      const disposables = [];
      const promise = Event.toPromise(emitter.event, disposables);
      assert.strictEqual(disposables.length, 1);
      emitter.fire(42);
      await promise;
      assert.strictEqual(disposables.length, 0);
    });
    test("cancel removes from DisposableStore", () => {
      const emitter = ds.add(new Emitter());
      const store = ds.add(new DisposableStoreWithSize());
      const promise = Event.toPromise(emitter.event, store);
      assert.strictEqual(store.size, 1);
      promise.cancel();
      assert.strictEqual(store.size, 0);
    });
    test("cancel removes from disposables array", () => {
      const emitter = ds.add(new Emitter());
      const disposables = [];
      const promise = Event.toPromise(emitter.event, disposables);
      assert.strictEqual(disposables.length, 1);
      promise.cancel();
      assert.strictEqual(disposables.length, 0);
    });
    test("cancel does not resolve promise", async () => {
      const emitter = ds.add(new Emitter());
      const promise = Event.toPromise(emitter.event);
      promise.cancel();
      emitter.fire(42);
      let resolved = false;
      promise.then(() => resolved = true);
      await timeout(10);
      assert.strictEqual(resolved, false);
    });
  });
  test("Microtask Emitter", (done) => {
    let count = 0;
    assert.strictEqual(count, 0);
    const emitter = new MicrotaskEmitter();
    const listener = emitter.event(() => {
      count++;
    });
    emitter.fire();
    assert.strictEqual(count, 0);
    emitter.fire();
    assert.strictEqual(count, 0);
    setTimeout(() => {
      assert.strictEqual(count, 3);
      done();
    }, 0);
    queueMicrotask(() => {
      assert.strictEqual(count, 2);
      count++;
      listener.dispose();
    });
  });
  test("Emitter - In Order Delivery", function() {
    const a = ds.add(new Emitter());
    const listener2Events = [];
    ds.add(a.event(function listener1(event) {
      if (event === "e1") {
        a.fire("e2");
        assert.deepStrictEqual(listener2Events, ["e1", "e2"]);
      }
    }));
    ds.add(a.event(function listener2(event) {
      listener2Events.push(event);
    }));
    a.fire("e1");
    assert.deepStrictEqual(listener2Events, ["e1", "e2"]);
  });
  test("Emitter, - In Order Delivery 3x", function() {
    const a = ds.add(new Emitter());
    const listener2Events = [];
    ds.add(a.event(function listener1(event) {
      if (event === "e2") {
        a.fire("e3");
        assert.deepStrictEqual(listener2Events, ["e1", "e2", "e3"]);
      }
    }));
    ds.add(a.event(function listener1(event) {
      if (event === "e1") {
        a.fire("e2");
        assert.deepStrictEqual(listener2Events, ["e1", "e2", "e3"]);
      }
    }));
    ds.add(a.event(function listener2(event) {
      listener2Events.push(event);
    }));
    a.fire("e1");
    assert.deepStrictEqual(listener2Events, ["e1", "e2", "e3"]);
  });
});
suite("AsyncEmitter", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("event has waitUntil-function", async function() {
    const emitter = new AsyncEmitter();
    ds.add(emitter.event((e) => {
      assert.strictEqual(e.foo, true);
      assert.strictEqual(e.bar, 1);
      assert.strictEqual(typeof e.waitUntil, "function");
    }));
    emitter.fireAsync({ foo: true, bar: 1 }, CancellationToken.None);
    emitter.dispose();
  });
  test("sequential delivery", async function() {
    return runWithFakedTimers({}, async function() {
      let globalState = 0;
      const emitter = new AsyncEmitter();
      ds.add(emitter.event((e) => {
        e.waitUntil(timeout(10).then((_) => {
          assert.strictEqual(globalState, 0);
          globalState += 1;
        }));
      }));
      ds.add(emitter.event((e) => {
        e.waitUntil(timeout(1).then((_) => {
          assert.strictEqual(globalState, 1);
          globalState += 1;
        }));
      }));
      await emitter.fireAsync({ foo: true }, CancellationToken.None);
      assert.strictEqual(globalState, 2);
    });
  });
  test("sequential, in-order delivery", async function() {
    return runWithFakedTimers({}, async function() {
      const events = [];
      let done = false;
      const emitter = new AsyncEmitter();
      ds.add(emitter.event((e) => {
        e.waitUntil(timeout(10).then(async (_) => {
          if (e.foo === 1) {
            await emitter.fireAsync({ foo: 2 }, CancellationToken.None);
            assert.deepStrictEqual(events, [1, 2]);
            done = true;
          }
        }));
      }));
      ds.add(emitter.event((e) => {
        events.push(e.foo);
        e.waitUntil(timeout(7));
      }));
      await emitter.fireAsync({ foo: 1 }, CancellationToken.None);
      assert.ok(done);
    });
  });
  test("catch errors", async function() {
    const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => null);
    let globalState = 0;
    const emitter = new AsyncEmitter();
    ds.add(emitter.event((e) => {
      globalState += 1;
      e.waitUntil(new Promise((_r, reject) => reject(new Error())));
    }));
    ds.add(emitter.event((e) => {
      globalState += 1;
      e.waitUntil(timeout(10));
      e.waitUntil(timeout(20).then(() => globalState++));
    }));
    await emitter.fireAsync({ foo: true }, CancellationToken.None).then(() => {
      assert.strictEqual(globalState, 3);
    }).catch((e) => {
      console.log(e);
      assert.ok(false);
    });
    setUnexpectedErrorHandler(origErrorHandler);
  });
});
suite("PausableEmitter", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("basic", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
  });
  test("pause/resume - no merge", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.pause();
    emitter.fire(3);
    emitter.fire(4);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 3, 4]);
    emitter.fire(5);
    assert.deepStrictEqual(data, [1, 2, 3, 4, 5]);
  });
  test("pause/resume - merge", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter({ merge: (a) => a.reduce((p, c) => p + c, 0) }));
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.pause();
    emitter.fire(3);
    emitter.fire(4);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 7]);
    emitter.fire(5);
    assert.deepStrictEqual(data, [1, 2, 7, 5]);
  });
  test("double pause/resume", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.pause();
    emitter.pause();
    emitter.fire(3);
    emitter.fire(4);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 3, 4]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 3, 4]);
  });
  test("resume, no pause", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    emitter.fire(3);
    assert.deepStrictEqual(data, [1, 2, 3]);
  });
  test("nested pause", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    let once = true;
    ds.add(emitter.event((e) => {
      data.push(e);
      if (once) {
        emitter.pause();
        once = false;
      }
    }));
    ds.add(emitter.event((e) => {
      data.push(e);
    }));
    emitter.pause();
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, []);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 1]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 1, 2, 2]);
    emitter.fire(3);
    assert.deepStrictEqual(data, [1, 1, 2, 2, 3, 3]);
  });
  test("empty pause with merge", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter({ merge: (a) => a[0] }));
    ds.add(emitter.event((e) => data.push(1)));
    emitter.pause();
    emitter.resume();
    assert.deepStrictEqual(data, []);
  });
});
suite("Event utils - ensureNoDisposablesAreLeakedInTestSuite", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("fromObservable", function() {
    const obs = observableValue("test", 12);
    const event = Event.fromObservable(obs);
    const values = [];
    const d = event((n) => {
      values.push(n);
    });
    obs.set(3, void 0);
    obs.set(13, void 0);
    obs.set(3, void 0);
    obs.set(33, void 0);
    obs.set(1, void 0);
    transaction((tx) => {
      obs.set(334, tx);
      obs.set(99, tx);
    });
    assert.deepStrictEqual(values, [3, 13, 3, 33, 1, 99]);
    d.dispose();
  });
});
suite("Event utils", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("EventBufferer", () => {
    test("should not buffer when not wrapped", () => {
      const bufferer = new EventBufferer();
      const counter = new Samples.EventCounter();
      const emitter = ds.add(new Emitter());
      const event = bufferer.wrapEvent(emitter.event);
      const listener = event(counter.onEvent, counter);
      assert.strictEqual(counter.count, 0);
      emitter.fire();
      assert.strictEqual(counter.count, 1);
      emitter.fire();
      assert.strictEqual(counter.count, 2);
      emitter.fire();
      assert.strictEqual(counter.count, 3);
      listener.dispose();
    });
    test("should buffer when wrapped", () => {
      const bufferer = new EventBufferer();
      const counter = new Samples.EventCounter();
      const emitter = ds.add(new Emitter());
      const event = bufferer.wrapEvent(emitter.event);
      const listener = event(counter.onEvent, counter);
      assert.strictEqual(counter.count, 0);
      emitter.fire();
      assert.strictEqual(counter.count, 1);
      bufferer.bufferEvents(() => {
        emitter.fire();
        assert.strictEqual(counter.count, 1);
        emitter.fire();
        assert.strictEqual(counter.count, 1);
      });
      assert.strictEqual(counter.count, 3);
      emitter.fire();
      assert.strictEqual(counter.count, 4);
      listener.dispose();
    });
    test("once", () => {
      const emitter = ds.add(new Emitter());
      let counter1 = 0, counter2 = 0, counter3 = 0;
      const listener1 = emitter.event(() => counter1++);
      const listener2 = Event.once(emitter.event)(() => counter2++);
      const listener3 = Event.once(emitter.event)(() => counter3++);
      assert.strictEqual(counter1, 0);
      assert.strictEqual(counter2, 0);
      assert.strictEqual(counter3, 0);
      listener3.dispose();
      emitter.fire();
      assert.strictEqual(counter1, 1);
      assert.strictEqual(counter2, 1);
      assert.strictEqual(counter3, 0);
      emitter.fire();
      assert.strictEqual(counter1, 2);
      assert.strictEqual(counter2, 1);
      assert.strictEqual(counter3, 0);
      listener1.dispose();
      listener2.dispose();
    });
  });
  suite("buffer", () => {
    test("should buffer events", () => {
      const result = [];
      const emitter = ds.add(new Emitter());
      const event = emitter.event;
      const bufferedEvent = Event.buffer(event, "test");
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(result, []);
      const listener = bufferedEvent((num) => result.push(num));
      assert.deepStrictEqual(result, [1, 2, 3]);
      emitter.fire(4);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
      listener.dispose();
      emitter.fire(5);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("should buffer events on next tick", async () => {
      const result = [];
      const emitter = ds.add(new Emitter());
      const event = emitter.event;
      const bufferedEvent = Event.buffer(event, "test", true);
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(result, []);
      const listener = bufferedEvent((num) => result.push(num));
      assert.deepStrictEqual(result, []);
      await timeout(10);
      emitter.fire(4);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
      listener.dispose();
      emitter.fire(5);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("should fire initial buffer events", () => {
      const result = [];
      const emitter = ds.add(new Emitter());
      const event = emitter.event;
      const bufferedEvent = Event.buffer(event, "test", false, [-2, -1, 0]);
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(result, []);
      ds.add(bufferedEvent((num) => result.push(num)));
      assert.deepStrictEqual(result, [-2, -1, 0, 1, 2, 3]);
    });
  });
  suite("EventMultiplexer", () => {
    test("works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("multiplexer dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
      m.dispose();
      assert.deepStrictEqual(result, [0]);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("event dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
      e1.dispose();
      assert.deepStrictEqual(result, [0]);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("mutliplexer event dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      const l1 = m.add(e1.event);
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
      l1.dispose();
      assert.deepStrictEqual(result, [0]);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("hot start works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      const e3 = ds.add(new Emitter());
      ds.add(m.add(e3.event));
      e1.fire(1);
      e2.fire(2);
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("cold start works", () => {
      const result = [];
      const m = new EventMultiplexer();
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      const e3 = ds.add(new Emitter());
      ds.add(m.add(e3.event));
      ds.add(m.event((r) => result.push(r)));
      e1.fire(1);
      e2.fire(2);
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("late add works", () => {
      const result = [];
      const m = new EventMultiplexer();
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      ds.add(m.event((r) => result.push(r)));
      e1.fire(1);
      e2.fire(2);
      const e3 = ds.add(new Emitter());
      ds.add(m.add(e3.event));
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("add dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      ds.add(m.event((r) => result.push(r)));
      e1.fire(1);
      e2.fire(2);
      const e3 = ds.add(new Emitter());
      const l3 = m.add(e3.event);
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
      l3.dispose();
      e3.fire(4);
      assert.deepStrictEqual(result, [1, 2, 3]);
      e2.fire(4);
      e1.fire(5);
      assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
    });
  });
  suite("DynamicListEventMultiplexer", () => {
    let addEmitter;
    let removeEmitter;
    const recordedEvents = [];
    class TestItem {
      constructor() {
        this.onTestEventEmitter = ds.add(new Emitter());
        this.onTestEvent = this.onTestEventEmitter.event;
      }
    }
    let items;
    let m;
    setup(() => {
      addEmitter = ds.add(new Emitter());
      removeEmitter = ds.add(new Emitter());
      items = [new TestItem(), new TestItem()];
      for (const [i, item] of items.entries()) {
        ds.add(item.onTestEvent((e) => `${i}:${e}`));
      }
      m = new DynamicListEventMultiplexer(items, addEmitter.event, removeEmitter.event, (e) => e.onTestEvent);
      ds.add(m.event((e) => recordedEvents.push(e)));
      recordedEvents.length = 0;
    });
    teardown(() => m.dispose());
    test("should fire events for initial items", () => {
      items[0].onTestEventEmitter.fire(1);
      items[1].onTestEventEmitter.fire(2);
      items[0].onTestEventEmitter.fire(3);
      items[1].onTestEventEmitter.fire(4);
      assert.deepStrictEqual(recordedEvents, [1, 2, 3, 4]);
    });
    test("should fire events for added items", () => {
      const addedItem = new TestItem();
      addEmitter.fire(addedItem);
      addedItem.onTestEventEmitter.fire(1);
      items[0].onTestEventEmitter.fire(2);
      items[1].onTestEventEmitter.fire(3);
      addedItem.onTestEventEmitter.fire(4);
      assert.deepStrictEqual(recordedEvents, [1, 2, 3, 4]);
    });
    test("should not fire events for removed items", () => {
      removeEmitter.fire(items[0]);
      items[0].onTestEventEmitter.fire(1);
      items[1].onTestEventEmitter.fire(2);
      items[0].onTestEventEmitter.fire(3);
      items[1].onTestEventEmitter.fire(4);
      assert.deepStrictEqual(recordedEvents, [2, 4]);
    });
  });
  test("latch", () => {
    const emitter = ds.add(new Emitter());
    const event = Event.latch(emitter.event);
    const result = [];
    const listener = ds.add(event((num) => result.push(num)));
    assert.deepStrictEqual(result, []);
    emitter.fire(1);
    assert.deepStrictEqual(result, [1]);
    emitter.fire(2);
    assert.deepStrictEqual(result, [1, 2]);
    emitter.fire(2);
    assert.deepStrictEqual(result, [1, 2]);
    emitter.fire(1);
    assert.deepStrictEqual(result, [1, 2, 1]);
    emitter.fire(1);
    assert.deepStrictEqual(result, [1, 2, 1]);
    emitter.fire(3);
    assert.deepStrictEqual(result, [1, 2, 1, 3]);
    emitter.fire(3);
    assert.deepStrictEqual(result, [1, 2, 1, 3]);
    emitter.fire(3);
    assert.deepStrictEqual(result, [1, 2, 1, 3]);
    listener.dispose();
  });
  test("dispose is reentrant", () => {
    const emitter = ds.add(new Emitter({
      onDidRemoveLastListener: () => {
        emitter.dispose();
      }
    }));
    const listener = emitter.event(() => void 0);
    listener.dispose();
  });
  suite("Relay", () => {
    test("should input work", () => {
      const e1 = ds.add(new Emitter());
      const e2 = ds.add(new Emitter());
      const relay = new Relay();
      const result = [];
      const listener = (num) => result.push(num);
      const subscription = relay.event(listener);
      e1.fire(1);
      assert.deepStrictEqual(result, []);
      relay.input = e1.event;
      e1.fire(2);
      assert.deepStrictEqual(result, [2]);
      relay.input = e2.event;
      e1.fire(3);
      e2.fire(4);
      assert.deepStrictEqual(result, [2, 4]);
      subscription.dispose();
      e1.fire(5);
      e2.fire(6);
      assert.deepStrictEqual(result, [2, 4]);
    });
    test("should Relay dispose work", () => {
      const e1 = ds.add(new Emitter());
      const e2 = ds.add(new Emitter());
      const relay = new Relay();
      const result = [];
      const listener = (num) => result.push(num);
      ds.add(relay.event(listener));
      e1.fire(1);
      assert.deepStrictEqual(result, []);
      relay.input = e1.event;
      e1.fire(2);
      assert.deepStrictEqual(result, [2]);
      relay.input = e2.event;
      e1.fire(3);
      e2.fire(4);
      assert.deepStrictEqual(result, [2, 4]);
      relay.dispose();
      e1.fire(5);
      e2.fire(6);
      assert.deepStrictEqual(result, [2, 4]);
    });
  });
  suite("accumulate", () => {
    test("should not fire after a listener is disposed with undefined or []", async () => {
      const eventEmitter = ds.add(new Emitter());
      const event = eventEmitter.event;
      const accumulated = Event.accumulate(event, 0);
      const calls1 = [];
      const calls2 = [];
      const listener1 = ds.add(accumulated((e) => calls1.push(e)));
      ds.add(accumulated((e) => calls2.push(e)));
      eventEmitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls1, [[1]]);
      assert.deepStrictEqual(calls2, [[1]]);
      listener1.dispose();
      await timeout(1);
      assert.deepStrictEqual(calls1, [[1]]);
      assert.deepStrictEqual(calls2, [[1]], "should not fire after a listener is disposed with undefined or []");
    });
    test("should accumulate a single event", async () => {
      const eventEmitter = ds.add(new Emitter());
      const event = eventEmitter.event;
      const accumulated = Event.accumulate(event, 0);
      const results1 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(1);
      });
      assert.deepStrictEqual(results1, [1]);
      const results2 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(2);
      });
      assert.deepStrictEqual(results2, [2]);
    });
    test("should accumulate multiple events", async () => {
      const eventEmitter = ds.add(new Emitter());
      const event = eventEmitter.event;
      const accumulated = Event.accumulate(event, 0);
      const results1 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(1);
        eventEmitter.fire(2);
        eventEmitter.fire(3);
      });
      assert.deepStrictEqual(results1, [1, 2, 3]);
      const results2 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(4);
        eventEmitter.fire(5);
        eventEmitter.fire(6);
        eventEmitter.fire(7);
        eventEmitter.fire(8);
      });
      assert.deepStrictEqual(results2, [4, 5, 6, 7, 8]);
    });
  });
  suite("debounce", () => {
    test("simple", function(done) {
      const doc = ds.add(new Samples.Document3());
      const onDocDidChange = Event.debounce(doc.onDidChange, (prev, cur) => {
        if (!prev) {
          prev = [cur];
        } else if (prev.indexOf(cur) < 0) {
          prev.push(cur);
        }
        return prev;
      }, 10);
      let count = 0;
      ds.add(onDocDidChange((keys) => {
        count++;
        assert.ok(keys, "was not expecting keys.");
        if (count === 1) {
          doc.setText("4");
          assert.deepStrictEqual(keys, ["1", "2", "3"]);
        } else if (count === 2) {
          assert.deepStrictEqual(keys, ["4"]);
          done();
        }
      }));
      doc.setText("1");
      doc.setText("2");
      doc.setText("3");
    });
    test("microtask", function(done) {
      const doc = ds.add(new Samples.Document3());
      const onDocDidChange = Event.debounce(doc.onDidChange, (prev, cur) => {
        if (!prev) {
          prev = [cur];
        } else if (prev.indexOf(cur) < 0) {
          prev.push(cur);
        }
        return prev;
      }, MicrotaskDelay);
      let count = 0;
      ds.add(onDocDidChange((keys) => {
        count++;
        assert.ok(keys, "was not expecting keys.");
        if (count === 1) {
          doc.setText("4");
          assert.deepStrictEqual(keys, ["1", "2", "3"]);
        } else if (count === 2) {
          assert.deepStrictEqual(keys, ["4"]);
          done();
        }
      }));
      doc.setText("1");
      doc.setText("2");
      doc.setText("3");
    });
    test("leading", async function() {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(
        emitter.event,
        (l, e) => e,
        0,
        /*leading=*/
        true
      );
      let calls = 0;
      ds.add(debounced(() => {
        calls++;
      }));
      emitter.fire();
      await timeout(1);
      assert.strictEqual(calls, 1);
    });
    test("leading (2)", async function() {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(
        emitter.event,
        (l, e) => e,
        0,
        /*leading=*/
        true
      );
      let calls = 0;
      ds.add(debounced(() => {
        calls++;
      }));
      emitter.fire();
      emitter.fire();
      emitter.fire();
      await timeout(1);
      assert.strictEqual(calls, 2);
    });
    test("leading reset", async function() {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(
        emitter.event,
        (l, e) => l ? l + 1 : 1,
        0,
        /*leading=*/
        true
      );
      const calls = [];
      ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      emitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls, [1, 1]);
    });
    test("should not flush events when a listener is disposed", async () => {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0);
      const calls = [];
      const listener = ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      listener.dispose();
      emitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls, []);
    });
    test("flushOnListenerRemove - should flush events when a listener is disposed", async () => {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0, void 0, true);
      const calls = [];
      const listener = ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      listener.dispose();
      emitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls, [1], "should fire with the first event, not the second (after listener dispose)");
    });
    test("should flush events when the emitter is disposed", async () => {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0);
      const calls = [];
      ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      emitter.dispose();
      await timeout(1);
      assert.deepStrictEqual(calls, [1]);
    });
  });
  suite("throttle", () => {
    test("leading only", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          false
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1], "no trailing edge fire with trailing=false");
        emitter.fire(4);
        assert.deepStrictEqual(calls, [1, 1]);
      });
    });
    test("trailing only", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          false,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, []);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, []);
        await timeout(15);
        assert.deepStrictEqual(calls, [3]);
        emitter.fire(4);
        emitter.fire(5);
        assert.deepStrictEqual(calls, [3]);
        await timeout(15);
        assert.deepStrictEqual(calls, [3, 2]);
      });
    });
    test("both leading and trailing", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2]);
      });
    });
    test("only leading edge if no subsequent events", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1]);
      });
    });
    test("microtask delay", function(done) {
      const emitter = ds.add(new Emitter());
      const throttled = Event.throttle(emitter.event, (l, e) => l ? l + 1 : 1, MicrotaskDelay);
      const calls = [];
      ds.add(throttled((e) => calls.push(e)));
      emitter.fire(1);
      assert.deepStrictEqual(calls, [1]);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(calls, [1]);
      queueMicrotask(() => {
        assert.deepStrictEqual(calls, [1, 2]);
        done();
      });
    });
    test("merge function accumulates values", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (last, cur) => (last || 0) + cur,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 5]);
      });
    });
    test("rapid consecutive throttle periods", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => e,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        emitter.fire(2);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2]);
        emitter.fire(3);
        emitter.fire(4);
        assert.deepStrictEqual(calls, [1, 2, 3]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2, 3, 4]);
        emitter.fire(5);
        assert.deepStrictEqual(calls, [1, 2, 3, 4, 5]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2, 3, 4, 5]);
      });
    });
    test("default parameters", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(emitter.event, (l, e) => e);
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1], "should fire leading edge by default");
        emitter.fire(2);
        await timeout(110);
        assert.deepStrictEqual(calls, [1, 2], "should fire trailing edge by default");
      });
    });
    test("disposal cleans up", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(emitter.event, (l, e) => e, 10);
        const calls = [];
        const listener = throttled((e) => calls.push(e));
        emitter.fire(1);
        emitter.fire(2);
        assert.deepStrictEqual(calls, [1]);
        listener.dispose();
        await timeout(15);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
      });
    });
    test("no events during throttle with trailing=false", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          false
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        assert.deepStrictEqual(calls, [1, 1]);
      });
    });
    test("neither leading nor trailing", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => e,
          10,
          /*leading=*/
          false,
          /*trailing=*/
          false
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, []);
        await timeout(15);
        assert.deepStrictEqual(calls, [], "no events should fire with both leading and trailing false");
      });
    });
  });
  test("issue #230401", () => {
    let count = 0;
    const emitter = ds.add(new Emitter());
    const disposables = ds.add(new DisposableStore());
    ds.add(emitter.event(() => {
      count++;
      disposables.add(emitter.event(() => {
        count++;
      }));
      disposables.add(emitter.event(() => {
        count++;
      }));
      disposables.clear();
    }));
    ds.add(emitter.event(() => {
      count++;
    }));
    emitter.fire();
    assert.deepStrictEqual(count, 2);
  });
  suite("chain2", () => {
    let em;
    let calls;
    setup(() => {
      em = ds.add(new Emitter());
      calls = [];
    });
    test("maps", () => {
      const ev = Event.chain(em.event, ($) => $.map((v) => v * 2));
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      assert.deepStrictEqual(calls, [2, 4, 6]);
    });
    test("filters", () => {
      const ev = Event.chain(em.event, ($) => $.filter((v) => v % 2 === 0));
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      em.fire(4);
      assert.deepStrictEqual(calls, [2, 4]);
    });
    test("reduces", () => {
      const ev = Event.chain(em.event, ($) => $.reduce((acc, v) => acc + v, 0));
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      em.fire(4);
      assert.deepStrictEqual(calls, [1, 3, 6, 10]);
    });
    test("latches", () => {
      const ev = Event.chain(em.event, ($) => $.latch());
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(1);
      em.fire(2);
      em.fire(2);
      em.fire(3);
      em.fire(3);
      em.fire(1);
      assert.deepStrictEqual(calls, [1, 2, 3, 1]);
    });
    test("does everything", () => {
      const ev = Event.chain(
        em.event,
        ($) => $.filter((v) => v % 2 === 0).map((v) => v * 2).reduce((acc, v) => acc + v, 0).latch()
      );
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      em.fire(4);
      em.fire(0);
      assert.deepStrictEqual(calls, [4, 12]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGV2ZW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgc3R1YiB9IGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGVycm9ySGFuZGxlciwgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgQXN5bmNFbWl0dGVyLCBEZWJvdW5jZUVtaXR0ZXIsIER5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlciwgRW1pdHRlciwgRXZlbnQsIEV2ZW50QnVmZmVyZXIsIEV2ZW50TXVsdGlwbGV4ZXIsIElXYWl0VW50aWwsIExpc3RlbmVyTGVha0Vycm9yLCBMaXN0ZW5lclJlZnVzYWxFcnJvciwgTWljcm90YXNrRW1pdHRlciwgUGF1c2VhYmxlRW1pdHRlciwgUmVsYXksIGNyZWF0ZUV2ZW50RGVsaXZlcnlRdWV1ZSwgc2V0R2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGQgfSBmcm9tICcuLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgaXNEaXNwb3NhYmxlLCBzZXREaXNwb3NhYmxlVHJhY2tlciwgRGlzcG9zYWJsZVRyYWNrZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBNaWNyb3Rhc2tEZWxheSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zeW1ib2xzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IHRhaWwgfSBmcm9tICcuLi8uLi9jb21tb24vYXJyYXlzLmpzJztcblxubmFtZXNwYWNlIFNhbXBsZXMge1xuXG5cdGV4cG9ydCBjbGFzcyBFdmVudENvdW50ZXIge1xuXG5cdFx0Y291bnQgPSAwO1xuXG5cdFx0cmVzZXQoKSB7XG5cdFx0XHR0aGlzLmNvdW50ID0gMDtcblx0XHR9XG5cblx0XHRvbkV2ZW50KCkge1xuXHRcdFx0dGhpcy5jb3VudCArPSAxO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjbGFzcyBEb2N1bWVudDMge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cblx0XHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdFx0c2V0VGV4dCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0XHQvLy4uLlxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSgpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0fVxufVxuXG5zdWl0ZSgnRXZlbnQgdXRpbHMgZGlzcG9zZScsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB0cmFja2VyID0gbmV3IERpc3Bvc2FibGVUcmFja2VyKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RGlzcG9zYWJsZXNDb3VudChleHBlY3RlZDogbnVtYmVyIHwgQXJyYXk8SURpc3Bvc2FibGU+KSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZXhwZWN0ZWQpKSB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZXMgPSBuZXcgU2V0KGV4cGVjdGVkKTtcblx0XHRcdGNvbnN0IGFjdHVhbEluc3RhbmNlcyA9IHRyYWNrZXIuZ2V0VHJhY2tlZERpc3Bvc2FibGVzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsSW5zdGFuY2VzLmxlbmd0aCwgZXhwZWN0ZWQubGVuZ3RoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGFjdHVhbEluc3RhbmNlcykge1xuXHRcdFx0XHRhc3NlcnQub2soaW5zdGFuY2VzLmhhcyhpdGVtKSk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuZ2V0VHJhY2tlZERpc3Bvc2FibGVzKCkubGVuZ3RoLCBleHBlY3RlZCk7XG5cdFx0fVxuXG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dHJhY2tlciA9IG5ldyBEaXNwb3NhYmxlVHJhY2tlcigpO1xuXHRcdHNldERpc3Bvc2FibGVUcmFja2VyKHRyYWNrZXIpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0c2V0RGlzcG9zYWJsZVRyYWNrZXIobnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIGxlYWsgd2l0aCBzbmFwc2hvdC11dGlscycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRjb25zdCBldmVucyA9IEV2ZW50LmZpbHRlcihlbWl0dGVyLmV2ZW50LCBuID0+IG4gJSAyID09PSAwLCBzdG9yZSk7XG5cdFx0YXNzZXJ0RGlzcG9zYWJsZXNDb3VudCgxKTsgLy8gc25hcGhvdCBvbmx5IGxpc3RlbiB3aGVuIGBldmVuc2AgaXMgYmVpbmcgbGlzdGVuZWQgb25cblxuXHRcdGxldCBhbGwgPSAwO1xuXHRcdGNvbnN0IGxlYWtlZCA9IGV2ZW5zKG4gPT4gYWxsICs9IG4pO1xuXHRcdGFzc2VydC5vayhpc0Rpc3Bvc2FibGUobGVha2VkKSk7XG5cdFx0YXNzZXJ0RGlzcG9zYWJsZXNDb3VudCgzKTtcblxuXHRcdGVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnREaXNwb3NhYmxlc0NvdW50KFtsZWFrZWRdKTsgLy8gbGVha2VkIGlzIHN0aWxsIHRoZXJlXG5cdH0pO1xuXG5cdHRlc3QoJ25vIGxlYWsgd2l0aCBkZWJvdW5jZS11dGlsJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCkgPT4gMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0YXNzZXJ0RGlzcG9zYWJsZXNDb3VudCgxKTsgLy8gZGVib3VuY2Ugb25seSBsaXN0ZW5zIHdoZW4gYGRlYm91bmNlYCBpcyBiZWluZyBsaXN0ZW5lZCBvblxuXG5cdFx0bGV0IGFsbCA9IDA7XG5cdFx0Y29uc3QgbGVha2VkID0gZGVib3VuY2VkKG4gPT4gYWxsICs9IG4pO1xuXHRcdGFzc2VydC5vayhpc0Rpc3Bvc2FibGUobGVha2VkKSk7XG5cdFx0YXNzZXJ0RGlzcG9zYWJsZXNDb3VudCgzKTtcblxuXHRcdGVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydERpc3Bvc2FibGVzQ291bnQoW2xlYWtlZF0pOyAvLyBsZWFrZWQgaXMgc3RpbGwgdGhlcmVcblx0fSk7XG59KTtcblxuc3VpdGUoJ0V2ZW50JywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgY291bnRlciA9IG5ldyBTYW1wbGVzLkV2ZW50Q291bnRlcigpO1xuXG5cdHNldHVwKCgpID0+IGNvdW50ZXIucmVzZXQoKSk7XG5cblx0dGVzdCgnRW1pdHRlciBwbGFpbicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGRvYyA9IGRzLmFkZChuZXcgU2FtcGxlcy5Eb2N1bWVudDMoKSk7XG5cblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBkb2Mub25EaWRDaGFuZ2UoY291bnRlci5vbkV2ZW50LCBjb3VudGVyKTtcblxuXHRcdGRvYy5zZXRUZXh0KCdmYXInKTtcblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cblx0XHQvLyB1bmhvb2sgbGlzdGVuZXJcblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdGRvYy5zZXRUZXh0KCdib28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIgZHVwbGljYXRlIGZ1bmN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhID0gKHY6IHN0cmluZykgPT4gY2FsbHMucHVzaChgYSR7dn1gKTtcblx0XHRjb25zdCBiID0gKHY6IHN0cmluZykgPT4gY2FsbHMucHVzaChgYiR7dn1gKTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGEpKTtcblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChiKSk7XG5cdFx0Y29uc3QgczIgPSBlbWl0dGVyLmV2ZW50KGEpO1xuXG5cdFx0ZW1pdHRlci5maXJlKCcxJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydhMScsICdiMScsICdhMSddKTtcblxuXHRcdHMyLmRpc3Bvc2UoKTtcblx0XHRjYWxscy5sZW5ndGggPSAwO1xuXHRcdGVtaXR0ZXIuZmlyZSgnMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnYTInLCAnYjInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIsIGRpc3Bvc2UgbGlzdGVuZXIgZHVyaW5nIGVtaXNzaW9uJywgKCkgPT4ge1xuXHRcdGZvciAobGV0IGtlZXBGaXJzdE1vZCA9IDE7IGtlZXBGaXJzdE1vZCA8IDQ7IGtlZXBGaXJzdE1vZCsrKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDI1IH0sIChfLCBuKSA9PiBkcy5hZGQoZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdGlmIChuICUga2VlcEZpcnN0TW9kID09PSAwKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXNbbl0uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbGxzLnB1c2gobik7XG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIEFycmF5LmZyb20oeyBsZW5ndGg6IDI1IH0sIChfLCBuKSA9PiBuKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdFbWl0dGVyLCBkaXNwb3NlIGVtaXR0ZXIgZHVyaW5nIGVtaXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNSB9LCAoXywgbikgPT4gZHMuYWRkKGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKG4gPT09IDEwKSB7XG5cdFx0XHRcdGVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0Y2FsbHMucHVzaChuKTtcblx0XHR9KSkpO1xuXG5cdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuZm9yRWFjaChkID0+IGQuZGlzcG9zZSgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMSB9LCAoXywgbikgPT4gbikpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbWl0dGVyLCBzaGFyZWQgZGVsaXZlcnkgcXVldWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVsaXZlcnlRdWV1ZSA9IGNyZWF0ZUV2ZW50RGVsaXZlcnlRdWV1ZSgpO1xuXHRcdGNvbnN0IGVtaXR0ZXIxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oeyBkZWxpdmVyeVF1ZXVlIH0pKTtcblx0XHRjb25zdCBlbWl0dGVyMiA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KHsgZGVsaXZlcnlRdWV1ZSB9KSk7XG5cblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRkcy5hZGQoZW1pdHRlcjEuZXZlbnQoZCA9PiB7IGNhbGxzLnB1c2goYCR7ZH1hYCk7IGlmIChkID09PSAxKSB7IGVtaXR0ZXIyLmZpcmUoMik7IH0gfSkpO1xuXHRcdGRzLmFkZChlbWl0dGVyMS5ldmVudChkID0+IHsgY2FsbHMucHVzaChgJHtkfWJgKTsgfSkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIyLmV2ZW50KGQgPT4geyBjYWxscy5wdXNoKGAke2R9Y2ApOyBlbWl0dGVyMS5kaXNwb3NlKCk7IH0pKTtcblx0XHRkcy5hZGQoZW1pdHRlcjIuZXZlbnQoZCA9PiB7IGNhbGxzLnB1c2goYCR7ZH1kYCk7IH0pKTtcblxuXHRcdGVtaXR0ZXIxLmZpcmUoMSk7XG5cblx0XHQvLyAxLiBDaGVjayB0aGF0IDIgaXMgbm90IGRlbGl2ZXJlZCBiZWZvcmUgMSBmaW5pc2hlc1xuXHRcdC8vIDIuIENoZWNrIHRoYXQgMiBmaW5pc2hlcyBnZXR0aW5nIGRlbGl2ZXJlZCBldmVuIGlmIG9uZSBlbWl0dGVyIGlzIGRpc3Bvc2VkXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWycxYScsICcxYicsICcyYycsICcyZCddKTtcblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgaGFuZGxlcyByZW1vdmFsIGR1cmluZyAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZuMSA9IHN0dWIoKTtcblx0XHRjb25zdCBmbjIgPSBzdHViKCk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZm4xKSk7XG5cdFx0Y29uc3QgaCA9IGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0aC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZm4yKSk7XG5cdFx0ZW1pdHRlci5maXJlKCdmb28nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm4yLmFyZ3MsIFtbJ2ZvbyddXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmbjEuYXJncywgW1snZm9vJ11dKTtcblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgaGFuZGxlcyByZW1vdmFsIGR1cmluZyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZuMSA9IHN0dWIoKTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChmbjEpKTtcblx0XHRjb25zdCBoID0gZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRoLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0XHRlbWl0dGVyLmZpcmUoJ2ZvbycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmbjEuYXJncywgW1snZm9vJ11dKTtcblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgYnVja2V0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgYnVja2V0OiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0Y29uc3QgZG9jID0gZHMuYWRkKG5ldyBTYW1wbGVzLkRvY3VtZW50MygpKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBkb2Mub25EaWRDaGFuZ2UoY291bnRlci5vbkV2ZW50LCBjb3VudGVyLCBidWNrZXQpO1xuXG5cdFx0ZG9jLnNldFRleHQoJ2ZhcicpO1xuXHRcdGRvYy5zZXRUZXh0KCdib28nKTtcblxuXHRcdC8vIHVuaG9vayBsaXN0ZW5lclxuXHRcdHdoaWxlIChidWNrZXQubGVuZ3RoKSB7XG5cdFx0XHRidWNrZXQucG9wKCkhLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0ZG9jLnNldFRleHQoJ2JvbycpO1xuXG5cdFx0Ly8gbm9vcFxuXHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbWl0dGVyLCBzdG9yZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGJ1Y2tldCA9IGRzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGRvYyA9IGRzLmFkZChuZXcgU2FtcGxlcy5Eb2N1bWVudDMoKSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gZG9jLm9uRGlkQ2hhbmdlKGNvdW50ZXIub25FdmVudCwgY291bnRlciwgYnVja2V0KTtcblxuXHRcdGRvYy5zZXRUZXh0KCdmYXInKTtcblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cblx0XHQvLyB1bmhvb2sgbGlzdGVuZXJcblx0XHRidWNrZXQuY2xlYXIoKTtcblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cblx0XHQvLyBub29wXG5cdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGRvYy5zZXRUZXh0KCdib28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRmlyc3RBZGR8b25MYXN0UmVtb3ZlJywgKCkgPT4ge1xuXG5cdFx0bGV0IGZpcnN0Q291bnQgPSAwO1xuXHRcdGxldCBsYXN0Q291bnQgPSAwO1xuXHRcdGNvbnN0IGEgPSBkcy5hZGQobmV3IEVtaXR0ZXIoe1xuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcigpIHsgZmlyc3RDb3VudCArPSAxOyB9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXIoKSB7IGxhc3RDb3VudCArPSAxOyB9XG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0Q291bnQsIDApO1xuXG5cdFx0bGV0IHN1YnNjcmlwdGlvbjEgPSBkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7IH0pKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24yID0gZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkgeyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0Q291bnQsIDApO1xuXG5cdFx0c3Vic2NyaXB0aW9uMS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0Q291bnQsIDApO1xuXG5cdFx0c3Vic2NyaXB0aW9uMi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0Q291bnQsIDEpO1xuXG5cdFx0c3Vic2NyaXB0aW9uMSA9IGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHsgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRBZGRMaXN0ZW5lcicsICgpID0+IHtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGNvbnN0IGEgPSBkcy5hZGQobmV3IEVtaXR0ZXIoe1xuXHRcdFx0b25EaWRBZGRMaXN0ZW5lcigpIHsgY291bnQgKz0gMTsgfVxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cblx0XHRsZXQgc3Vic2NyaXB0aW9uID0gZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkgeyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblxuXHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblxuXHRcdHN1YnNjcmlwdGlvbiA9IGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHsgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMik7XG5cblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ29uV2lsbFJlbW92ZUxpc3RlbmVyJywgKCkgPT4ge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Y29uc3QgYSA9IGRzLmFkZChuZXcgRW1pdHRlcih7XG5cdFx0XHRvbldpbGxSZW1vdmVMaXN0ZW5lcigpIHsgY291bnQgKz0gMTsgfVxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cblx0XHRsZXQgc3Vic2NyaXB0aW9uID0gZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkgeyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblxuXHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblxuXHRcdHN1YnNjcmlwdGlvbiA9IGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHsgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rocm93aW5nTGlzdGVuZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IGVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiBudWxsKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhID0gZHMuYWRkKG5ldyBFbWl0dGVyPHVuZGVmaW5lZD4oKSk7XG5cdFx0XHRsZXQgaGl0ID0gZmFsc2U7XG5cdFx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby10aHJvdy1saXRlcmFsXG5cdFx0XHRcdHRocm93IDk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGhpdCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cdFx0XHRhLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXQsIHRydWUpO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd0aHJvd2luZ0xpc3RlbmVyIChjdXN0b20gaGFuZGxlciknLCAoKSA9PiB7XG5cblx0XHRjb25zdCBhbGxFcnJvcjogYW55W10gPSBbXTtcblxuXHRcdGNvbnN0IGEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dW5kZWZpbmVkPih7XG5cdFx0XHRvbkxpc3RlbmVyRXJyb3IoZSkgeyBhbGxFcnJvci5wdXNoKGUpOyB9XG5cdFx0fSkpO1xuXHRcdGxldCBoaXQgPSBmYWxzZTtcblx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdGhyb3ctbGl0ZXJhbFxuXHRcdFx0dGhyb3cgOTtcblx0XHR9KSk7XG5cdFx0ZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkge1xuXHRcdFx0aGl0ID0gdHJ1ZTtcblx0XHR9KSk7XG5cdFx0YS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGxFcnJvciwgWzldKTtcblxuXHR9KTtcblxuXHR0ZXN0KCd0aHJvdyBMaXN0ZW5lckxlYWtFcnJvcicsICgpID0+IHtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFsbEVycm9yOiBhbnlbXSA9IFtdO1xuXG5cdFx0Y29uc3QgYSA9IGRzLmFkZChuZXcgRW1pdHRlcjx1bmRlZmluZWQ+KHtcblx0XHRcdG9uTGlzdGVuZXJFcnJvcihlKSB7IGFsbEVycm9yLnB1c2goZSk7IH0sXG5cdFx0XHRsZWFrV2FybmluZ1RocmVzaG9sZDogMyxcblx0XHR9KSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDExOyBpKyspIHtcblx0XHRcdGEuZXZlbnQoKCkgPT4geyB9LCB1bmRlZmluZWQsIHN0b3JlKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFsbEVycm9yLmxlbmd0aCwgNSk7XG5cdFx0Y29uc3QgW3N0YXJ0LCByZXN0XSA9IHRhaWwoYWxsRXJyb3IpO1xuXHRcdGFzc2VydC5vayhyZXN0IGluc3RhbmNlb2YgTGlzdGVuZXJSZWZ1c2FsRXJyb3IpO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHN0YXJ0KSB7XG5cdFx0XHRhc3NlcnQub2soaXRlbSBpbnN0YW5jZW9mIExpc3RlbmVyTGVha0Vycm9yKTtcblx0XHR9XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIgbGVhayB3YXJuaW5ncyB0cmFjayBvbmx5IGFjdGl2ZSBsaXN0ZW5lciBzdGFja3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uc29sZVdhcm4gPSBzdHViKGNvbnNvbGUsICd3YXJuJyk7XG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0Y2xhc3MgVGVzdEVtaXR0ZXIgZXh0ZW5kcyBFbWl0dGVyPHZvaWQ+IHtcblx0XHRcdHNldExpc3RlbmVyQ291bnQobGlzdGVuZXJDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuX3NpemUgPSBsaXN0ZW5lckNvdW50O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBUZXN0RW1pdHRlcih7XG5cdFx0XHRsZWFrV2FybmluZ1RocmVzaG9sZDogMyxcblx0XHRcdGxlYWtXYXJuaW5nTmFtZTogJ3Rlc3QnLFxuXHRcdFx0b25MaXN0ZW5lckVycm9yOiBlcnJvciA9PiBlcnJvcnMucHVzaChlcnJvciksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWRkU3RhY2tBTGlzdGVuZXIgPSAoKSA9PiBlbWl0dGVyLmV2ZW50KCgpID0+IHsgfSk7XG5cdFx0Y29uc3QgYWRkU3RhY2tCTGlzdGVuZXIgPSAoKSA9PiBlbWl0dGVyLmV2ZW50KCgpID0+IHsgfSk7XG5cdFx0Y29uc3QgYWRkU3RhY2tDTGlzdGVuZXIgPSAoKSA9PiBlbWl0dGVyLmV2ZW50KCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0ZW1pdHRlci5zZXRMaXN0ZW5lckNvdW50KDIpO1xuXHRcdFx0Y29uc3Qgc3RhY2tBTGlzdGVuZXJzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMyB9LCAoKSA9PiBhZGRTdGFja0FMaXN0ZW5lcigpKTtcblx0XHRcdHN0YWNrQUxpc3RlbmVyc1swXS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCBzdGFja0JMaXN0ZW5lciA9IGFkZFN0YWNrQkxpc3RlbmVyKCk7XG5cdFx0XHRjb25zdCBzdGFja0NMaXN0ZW5lciA9IGFkZFN0YWNrQ0xpc3RlbmVyKCk7XG5cblx0XHRcdHN0YWNrQUxpc3RlbmVycy5zbGljZSgxKS5mb3JFYWNoKGxpc3RlbmVyID0+IGxpc3RlbmVyLmRpc3Bvc2UoKSk7XG5cdFx0XHRzdGFja0JMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRzdGFja0NMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRlbWl0dGVyLnNldExpc3RlbmVyQ291bnQoMTApO1xuXHRcdFx0ZW1pdHRlci5ldmVudCgoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9ycy5tYXAoZXJyb3IgPT4gKHtcblx0XHRcdFx0bmFtZTogZXJyb3IubmFtZSxcblx0XHRcdFx0ZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBMaXN0ZW5lckxlYWtFcnJvciA/IGVycm9yLmRldGFpbHMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGhhc1Vua25vd25TdGFjazogZXJyb3Iuc3RhY2sgPT09ICdVTktOT1dOIHN0YWNrJyxcblx0XHRcdH0pKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ0xpc3RlbmVyTGVha0Vycm9yJyxcblx0XHRcdFx0XHRkZXRhaWxzOiAnW3Rlc3RdIHBvdGVudGlhbCBsaXN0ZW5lciBMRUFLIGRldGVjdGVkLCBoYXZpbmcgMyBsaXN0ZW5lcnMgYWxyZWFkeS4gTU9TVCBmcmVxdWVudCBsaXN0ZW5lciAoMSk6Jyxcblx0XHRcdFx0XHRoYXNVbmtub3duU3RhY2s6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ0xpc3RlbmVyTGVha0Vycm9yJyxcblx0XHRcdFx0XHRkZXRhaWxzOiAnW3Rlc3RdIHBvdGVudGlhbCBsaXN0ZW5lciBMRUFLIGRldGVjdGVkLCBoYXZpbmcgNSBsaXN0ZW5lcnMgYWxyZWFkeS4gTU9TVCBmcmVxdWVudCBsaXN0ZW5lciAoMyk6Jyxcblx0XHRcdFx0XHRoYXNVbmtub3duU3RhY2s6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ0xpc3RlbmVyTGVha0Vycm9yJyxcblx0XHRcdFx0XHRkZXRhaWxzOiAnW3Rlc3RdIHBvdGVudGlhbCBsaXN0ZW5lciBMRUFLIGRldGVjdGVkLCBoYXZpbmcgNiBsaXN0ZW5lcnMgYWxyZWFkeS4gTU9TVCBmcmVxdWVudCBsaXN0ZW5lciAoMik6Jyxcblx0XHRcdFx0XHRoYXNVbmtub3duU3RhY2s6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ0xpc3RlbmVyUmVmdXNhbEVycm9yJyxcblx0XHRcdFx0XHRkZXRhaWxzOiAnW3Rlc3RdIFJFRlVTRVMgdG8gYWNjZXB0IG5ldyBsaXN0ZW5lcnMgYmVjYXVzZSBpdCBleGNlZWRlZCBpdHMgdGhyZXNob2xkIGJ5IGZhciAoMTAgdnMgMykuIEhJTlQ6IFN0YWNrIHNob3dzIG1vc3QgZnJlcXVlbnQgbGlzdGVuZXIgKC0xLXRpbWVzKScsXG5cdFx0XHRcdFx0aGFzVW5rbm93blN0YWNrOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbnNvbGVXYXJuLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIgY2FwdHVyZXMgZ2xvYmFsIGxlYWsgd2FybmluZyBjb25maWd1cmF0aW9uIGF0IGNvbnN0cnVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjb25zb2xlV2FybiA9IHN0dWIoY29uc29sZSwgJ3dhcm4nKTtcblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRsZXQgcmVzdG9yZVRocmVzaG9sZDogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQgPSBzZXRHbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZCgzKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9uaXRvcmVkRW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPih7XG5cdFx0XHRcdGxlYWtXYXJuaW5nTmFtZTogJ2NhcHR1cmVkJyxcblx0XHRcdFx0b25MaXN0ZW5lckVycm9yOiBlcnJvciA9PiBlcnJvcnMucHVzaChlcnJvciksXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXN0b3JlVGhyZXNob2xkLmRpc3Bvc2UoKTtcblx0XHRcdHJlc3RvcmVUaHJlc2hvbGQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHVubW9uaXRvcmVkRW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPih7XG5cdFx0XHRcdG9uTGlzdGVuZXJFcnJvcjogZXJyb3IgPT4gZXJyb3JzLnB1c2goZXJyb3IpLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmVzdG9yZVRocmVzaG9sZCA9IHNldEdsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkKDMpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXJzID0gZHMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHRjb25zdCBtb25pdG9yQWxsb2NhdGlvbiA9IFtPYmplY3QuaGFzT3duKG1vbml0b3JlZEVtaXR0ZXIsICdfbGVha2FnZU1vbicpXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG5cdFx0XHRcdG1vbml0b3JlZEVtaXR0ZXIuZXZlbnQoKCkgPT4geyB9LCB1bmRlZmluZWQsIGxpc3RlbmVycyk7XG5cdFx0XHRcdHVubW9uaXRvcmVkRW1pdHRlci5ldmVudCgoKSA9PiB7IH0sIHVuZGVmaW5lZCwgbGlzdGVuZXJzKTtcblx0XHRcdFx0bW9uaXRvckFsbG9jYXRpb24ucHVzaChPYmplY3QuaGFzT3duKG1vbml0b3JlZEVtaXR0ZXIsICdfbGVha2FnZU1vbicpKTtcblx0XHRcdH1cblx0XHRcdHJlc3RvcmVUaHJlc2hvbGQuZGlzcG9zZSgpO1xuXHRcdFx0cmVzdG9yZVRocmVzaG9sZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVycm9yczogZXJyb3JzLm1hcChlcnJvciA9PiBlcnJvci5tZXNzYWdlKSxcblx0XHRcdFx0bW9uaXRvckFsbG9jYXRpb24sXG5cdFx0XHRcdHVubW9uaXRvcmVkRW1pdHRlckhhc01vbml0b3I6IE9iamVjdC5oYXNPd24odW5tb25pdG9yZWRFbWl0dGVyLCAnX2xlYWthZ2VNb24nKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZXJyb3JzOiBbJ1tjYXB0dXJlZF0gcG90ZW50aWFsIGxpc3RlbmVyIExFQUsgZGV0ZWN0ZWQsIGRvbWluYXRlZCddLFxuXHRcdFx0XHRtb25pdG9yQWxsb2NhdGlvbjogW2ZhbHNlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRcdHVubW9uaXRvcmVkRW1pdHRlckhhc01vbml0b3I6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlc3RvcmVUaHJlc2hvbGQ/LmRpc3Bvc2UoKTtcblx0XHRcdGNvbnNvbGVXYXJuLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JldXNpbmcgZXZlbnQgZnVuY3Rpb24gYW5kIGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdGZ1bmN0aW9uIGxpc3RlbmVyKCkge1xuXHRcdFx0Y291bnRlciArPSAxO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZXh0ID0ge307XG5cblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHVuZGVmaW5lZD4oKSk7XG5cdFx0Y29uc3QgcmVnMSA9IGVtaXR0ZXIuZXZlbnQobGlzdGVuZXIsIGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlZzIgPSBlbWl0dGVyLmV2ZW50KGxpc3RlbmVyLCBjb250ZXh0KTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAyKTtcblxuXHRcdHJlZzEuZGlzcG9zZSgpO1xuXHRcdGVtaXR0ZXIuZmlyZSh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAzKTtcblxuXHRcdHJlZzIuZGlzcG9zZSgpO1xuXHRcdGVtaXR0ZXIuZmlyZSh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnRGVib3VuY2VFbWl0dGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRsZXQgc3VtID0gMDtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRGVib3VuY2VFbWl0dGVyPG51bWJlcj4oe1xuXHRcdFx0XHRtZXJnZTogYXJyID0+IHtcblx0XHRcdFx0XHRjYWxsQ291bnQgKz0gMTtcblx0XHRcdFx0XHRyZXR1cm4gYXJyLnJlZHVjZSgocCwgYykgPT4gcCArIGMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiB7IHN1bSA9IGU7IH0pKTtcblxuXHRcdFx0Y29uc3QgcCA9IEV2ZW50LnRvUHJvbWlzZShlbWl0dGVyLmV2ZW50KTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXG5cdFx0XHRhd2FpdCBwO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW0sIDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRXZlbnQudG9Qcm9taXNlJywgKCkgPT4ge1xuXHRcdGNsYXNzIERpc3Bvc2FibGVTdG9yZVdpdGhTaXplIGV4dGVuZHMgRGlzcG9zYWJsZVN0b3JlIHtcblx0XHRcdHB1YmxpYyBzaXplID0gMDtcblx0XHRcdHB1YmxpYyBvdmVycmlkZSBhZGQ8VCBleHRlbmRzIElEaXNwb3NhYmxlPihvOiBUKTogVCB7XG5cdFx0XHRcdHRoaXMuc2l6ZSsrO1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuYWRkKG8pO1xuXHRcdFx0fVxuXG5cdFx0XHRwdWJsaWMgb3ZlcnJpZGUgZGVsZXRlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4obzogVCk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLnNpemUtLTtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLmRlbGV0ZShvKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGVzdCgncmVzb2x2ZXMgb24gZmlyc3QgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoNDIpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgNDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZXMgbGlzdGVuZXIgYWZ0ZXIgcmVzb2x1dGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRcdC8vIExpc3RlbmVyIHNob3VsZCBiZSBkaXNwb3NlZCwgZmlyaW5nIGFnYWluIHNob3VsZCBub3QgYWZmZWN0IGFueXRoaW5nXG5cdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRhc3NlcnQub2sodHJ1ZSk7IC8vIE5vIGVycm9yc1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyB0byBEaXNwb3NhYmxlU3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IGRzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlV2l0aFNpemUoKSk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQsIHN0b3JlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnNpemUsIDEpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoNDIpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBzdG9yZSBhZnRlciByZXNvbHV0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuc2l6ZSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIHRvIGRpc3Bvc2FibGVzIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDQyKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRcdC8vIFNob3VsZCBiZSByZW1vdmVkIGZyb20gYXJyYXkgYWZ0ZXIgcmVzb2x1dGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2FibGVzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgcmVtb3ZlcyBmcm9tIERpc3Bvc2FibGVTdG9yZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gZHMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmVXaXRoU2l6ZSgpKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCwgc3RvcmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuc2l6ZSwgMSk7XG5cblx0XHRcdHByb21pc2UuY2FuY2VsKCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSByZW1vdmVkIGZyb20gc3RvcmUgYWZ0ZXIgY2FuY2VsbGF0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuc2l6ZSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgcmVtb3ZlcyBmcm9tIGRpc3Bvc2FibGVzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0cHJvbWlzZS5jYW5jZWwoKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBhcnJheSBhZnRlciBjYW5jZWxsYXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NhYmxlcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsIGRvZXMgbm90IHJlc29sdmUgcHJvbWlzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCk7XG5cblx0XHRcdHByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoNDIpO1xuXG5cdFx0XHQvLyBQcm9taXNlIHNob3VsZCBub3QgcmVzb2x2ZSBhZnRlciBjYW5jZWxsYXRpb25cblx0XHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0cHJvbWlzZS50aGVuKCgpID0+IHJlc29sdmVkID0gdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01pY3JvdGFzayBFbWl0dGVyJywgKGRvbmUpID0+IHtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBNaWNyb3Rhc2tFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBlbWl0dGVyLmV2ZW50KCgpID0+IHtcblx0XHRcdGNvdW50Kys7XG5cdFx0fSk7XG5cdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXHRcdC8vIFNob3VsZCB3YWl0IHVudGlsIHRoZSBldmVudCBsb29wIGVuZHMgYW5kIHRoZXJlZm9yZSBiZSB0aGUgbGFzdCB0aGluZyBjYWxsZWRcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMyk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSwgMCk7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAyKTtcblx0XHRcdGNvdW50Kys7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIgLSBJbiBPcmRlciBEZWxpdmVyeScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBhID0gZHMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgbGlzdGVuZXIyRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uIGxpc3RlbmVyMShldmVudCkge1xuXHRcdFx0aWYgKGV2ZW50ID09PSAnZTEnKSB7XG5cdFx0XHRcdGEuZmlyZSgnZTInKTtcblx0XHRcdFx0Ly8gYXNzZXJ0IHRoYXQgYWxsIGV2ZW50cyBhcmUgZGVsaXZlcmVkIGF0IHRoaXMgcG9pbnRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0ZW5lcjJFdmVudHMsIFsnZTEnLCAnZTInXSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uIGxpc3RlbmVyMihldmVudCkge1xuXHRcdFx0bGlzdGVuZXIyRXZlbnRzLnB1c2goZXZlbnQpO1xuXHRcdH0pKTtcblx0XHRhLmZpcmUoJ2UxJyk7XG5cblx0XHQvLyBhc3NlcnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBkZWxpdmVyZWQgaW4gb3JkZXJcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RlbmVyMkV2ZW50cywgWydlMScsICdlMiddKTtcblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgLSBJbiBPcmRlciBEZWxpdmVyeSAzeCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBhID0gZHMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgbGlzdGVuZXIyRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uIGxpc3RlbmVyMShldmVudCkge1xuXHRcdFx0aWYgKGV2ZW50ID09PSAnZTInKSB7XG5cdFx0XHRcdGEuZmlyZSgnZTMnKTtcblx0XHRcdFx0Ly8gYXNzZXJ0IHRoYXQgYWxsIGV2ZW50cyBhcmUgZGVsaXZlcmVkIGF0IHRoaXMgcG9pbnRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0ZW5lcjJFdmVudHMsIFsnZTEnLCAnZTInLCAnZTMnXSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uIGxpc3RlbmVyMShldmVudCkge1xuXHRcdFx0aWYgKGV2ZW50ID09PSAnZTEnKSB7XG5cdFx0XHRcdGEuZmlyZSgnZTInKTtcblx0XHRcdFx0Ly8gYXNzZXJ0IHRoYXQgYWxsIGV2ZW50cyBhcmUgZGVsaXZlcmVkIGF0IHRoaXMgcG9pbnRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0ZW5lcjJFdmVudHMsIFsnZTEnLCAnZTInLCAnZTMnXSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uIGxpc3RlbmVyMihldmVudCkge1xuXHRcdFx0bGlzdGVuZXIyRXZlbnRzLnB1c2goZXZlbnQpO1xuXHRcdH0pKTtcblx0XHRhLmZpcmUoJ2UxJyk7XG5cblx0XHQvLyBhc3NlcnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBkZWxpdmVyZWQgaW4gb3JkZXJcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RlbmVyMkV2ZW50cywgWydlMScsICdlMicsICdlMyddKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FzeW5jRW1pdHRlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2V2ZW50IGhhcyB3YWl0VW50aWwtZnVuY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRpbnRlcmZhY2UgRSBleHRlbmRzIElXYWl0VW50aWwge1xuXHRcdFx0Zm9vOiBib29sZWFuO1xuXHRcdFx0YmFyOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBBc3luY0VtaXR0ZXI8RT4oKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuZm9vLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmJhciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGUud2FpdFVudGlsLCAnZnVuY3Rpb24nKTtcblx0XHR9KSk7XG5cblx0XHRlbWl0dGVyLmZpcmVBc3luYyh7IGZvbzogdHJ1ZSwgYmFyOiAxLCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2VxdWVudGlhbCBkZWxpdmVyeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGludGVyZmFjZSBFIGV4dGVuZHMgSVdhaXRVbnRpbCB7XG5cdFx0XHRcdGZvbzogYm9vbGVhbjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGdsb2JhbFN0YXRlID0gMDtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgQXN5bmNFbWl0dGVyPEU+KCk7XG5cblx0XHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRlLndhaXRVbnRpbCh0aW1lb3V0KDEwKS50aGVuKF8gPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxTdGF0ZSwgMCk7XG5cdFx0XHRcdFx0Z2xvYmFsU3RhdGUgKz0gMTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdFx0ZS53YWl0VW50aWwodGltZW91dCgxKS50aGVuKF8gPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxTdGF0ZSwgMSk7XG5cdFx0XHRcdFx0Z2xvYmFsU3RhdGUgKz0gMTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBlbWl0dGVyLmZpcmVBc3luYyh7IGZvbzogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxTdGF0ZSwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcXVlbnRpYWwsIGluLW9yZGVyIGRlbGl2ZXJ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0aW50ZXJmYWNlIEUgZXh0ZW5kcyBJV2FpdFVudGlsIHtcblx0XHRcdFx0Zm9vOiBudW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBldmVudHM6IG51bWJlcltdID0gW107XG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBBc3luY0VtaXR0ZXI8RT4oKTtcblxuXHRcdFx0Ly8gZTFcblx0XHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRlLndhaXRVbnRpbCh0aW1lb3V0KDEwKS50aGVuKGFzeW5jIF8gPT4ge1xuXHRcdFx0XHRcdGlmIChlLmZvbyA9PT0gMSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgZW1pdHRlci5maXJlQXN5bmMoeyBmb286IDIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgWzEsIDJdKTtcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBlMlxuXHRcdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGUuZm9vKTtcblx0XHRcdFx0ZS53YWl0VW50aWwodGltZW91dCg3KSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IGVtaXR0ZXIuZmlyZUFzeW5jKHsgZm9vOiAxIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRvbmUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXRjaCBlcnJvcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IGVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiBudWxsKTtcblxuXHRcdGludGVyZmFjZSBFIGV4dGVuZHMgSVdhaXRVbnRpbCB7XG5cdFx0XHRmb286IGJvb2xlYW47XG5cdFx0fVxuXG5cdFx0bGV0IGdsb2JhbFN0YXRlID0gMDtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEFzeW5jRW1pdHRlcjxFPigpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRnbG9iYWxTdGF0ZSArPSAxO1xuXHRcdFx0ZS53YWl0VW50aWwobmV3IFByb21pc2UoKF9yLCByZWplY3QpID0+IHJlamVjdChuZXcgRXJyb3IoKSkpKTtcblx0XHR9KSk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdGdsb2JhbFN0YXRlICs9IDE7XG5cdFx0XHRlLndhaXRVbnRpbCh0aW1lb3V0KDEwKSk7XG5cdFx0XHRlLndhaXRVbnRpbCh0aW1lb3V0KDIwKS50aGVuKCgpID0+IGdsb2JhbFN0YXRlKyspKTsgLy8gbXVsdGlwbGUgYHdhaXRVbnRpbGAgYXJlIHN1cHBvcnRlZCBhbmQgYXdhaXRlZCBvblxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGVtaXR0ZXIuZmlyZUFzeW5jKHsgZm9vOiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2JhbFN0YXRlLCAzKTtcblx0XHR9KS5jYXRjaChlID0+IHtcblx0XHRcdGNvbnNvbGUubG9nKGUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQYXVzYWJsZUVtaXR0ZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdiYXNpYycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkYXRhOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IFBhdXNlYWJsZUVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4gZGF0YS5wdXNoKGUpKSk7XG5cdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdGVtaXR0ZXIuZmlyZSgyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblx0fSk7XG5cblx0dGVzdCgncGF1c2UvcmVzdW1lIC0gbm8gbWVyZ2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGF0YTogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBQYXVzZWFibGVFbWl0dGVyPG51bWJlcj4oKSk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IGRhdGEucHVzaChlKSkpO1xuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMl0pO1xuXG5cdFx0ZW1pdHRlci5wYXVzZSgpO1xuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRlbWl0dGVyLmZpcmUoNCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMl0pO1xuXG5cdFx0ZW1pdHRlci5yZXN1bWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyLCAzLCA0XSk7XG5cdFx0ZW1pdHRlci5maXJlKDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDIsIDMsIDQsIDVdKTtcblx0fSk7XG5cblx0dGVzdCgncGF1c2UvcmVzdW1lIC0gbWVyZ2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGF0YTogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBQYXVzZWFibGVFbWl0dGVyPG51bWJlcj4oeyBtZXJnZTogKGEpID0+IGEucmVkdWNlKChwLCBjKSA9PiBwICsgYywgMCkgfSkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiBkYXRhLnB1c2goZSkpKTtcblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIucGF1c2UoKTtcblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMiwgN10pO1xuXG5cdFx0ZW1pdHRlci5maXJlKDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDIsIDcsIDVdKTtcblx0fSk7XG5cblx0dGVzdCgnZG91YmxlIHBhdXNlL3Jlc3VtZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkYXRhOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IFBhdXNlYWJsZUVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4gZGF0YS5wdXNoKGUpKSk7XG5cdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLnBhdXNlKCk7XG5cdFx0ZW1pdHRlci5wYXVzZSgpO1xuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRlbWl0dGVyLmZpcmUoNCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMl0pO1xuXG5cdFx0ZW1pdHRlci5yZXN1bWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLnJlc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDIsIDMsIDRdKTtcblxuXHRcdGVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMiwgMywgNF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN1bWUsIG5vIHBhdXNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRhdGE6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgUGF1c2VhYmxlRW1pdHRlcjxudW1iZXI+KCkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiBkYXRhLnB1c2goZSkpKTtcblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDIsIDNdKTtcblx0fSk7XG5cblx0dGVzdCgnbmVzdGVkIHBhdXNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRhdGE6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgUGF1c2VhYmxlRW1pdHRlcjxudW1iZXI+KCkpO1xuXG5cdFx0bGV0IG9uY2UgPSB0cnVlO1xuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0ZGF0YS5wdXNoKGUpO1xuXG5cdFx0XHRpZiAob25jZSkge1xuXHRcdFx0XHRlbWl0dGVyLnBhdXNlKCk7XG5cdFx0XHRcdG9uY2UgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRkYXRhLnB1c2goZSk7XG5cdFx0fSkpO1xuXG5cdFx0ZW1pdHRlci5wYXVzZSgpO1xuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbXSk7XG5cblx0XHRlbWl0dGVyLnJlc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDFdKTsgLy8gcGF1c2VkIGFmdGVyIGZpcnN0IGV2ZW50XG5cblx0XHRlbWl0dGVyLnJlc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDEsIDIsIDJdKTsgLy8gcmVtYWluZyBldmVudCBkZWxpdmVyZWRcblxuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAxLCAyLCAyLCAzLCAzXSk7XG5cblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgcGF1c2Ugd2l0aCBtZXJnZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkYXRhOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IFBhdXNlYWJsZUVtaXR0ZXI8bnVtYmVyPih7IG1lcmdlOiBhID0+IGFbMF0gfSkpO1xuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4gZGF0YS5wdXNoKDEpKSk7XG5cblx0XHRlbWl0dGVyLnBhdXNlKCk7XG5cdFx0ZW1pdHRlci5yZXN1bWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFtdKTtcblx0fSk7XG5cbn0pO1xuXG5zdWl0ZSgnRXZlbnQgdXRpbHMgLSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUnLCBmdW5jdGlvbiAoKSB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Zyb21PYnNlcnZhYmxlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgb2JzID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgMTIpO1xuXHRcdGNvbnN0IGV2ZW50ID0gRXZlbnQuZnJvbU9ic2VydmFibGUob2JzKTtcblxuXHRcdGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBkID0gZXZlbnQobiA9PiB7IHZhbHVlcy5wdXNoKG4pOyB9KTtcblxuXHRcdG9icy5zZXQoMywgdW5kZWZpbmVkKTtcblx0XHRvYnMuc2V0KDEzLCB1bmRlZmluZWQpO1xuXHRcdG9icy5zZXQoMywgdW5kZWZpbmVkKTtcblx0XHRvYnMuc2V0KDMzLCB1bmRlZmluZWQpO1xuXHRcdG9icy5zZXQoMSwgdW5kZWZpbmVkKTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdG9icy5zZXQoMzM0LCB0eCk7XG5cdFx0XHRvYnMuc2V0KDk5LCB0eCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgKFszLCAxMywgMywgMzMsIDEsIDk5XSkpO1xuXHRcdGQuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnRXZlbnQgdXRpbHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnRXZlbnRCdWZmZXJlcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYnVmZmVyIHdoZW4gbm90IHdyYXBwZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidWZmZXJlciA9IG5ldyBFdmVudEJ1ZmZlcmVyKCk7XG5cdFx0XHRjb25zdCBjb3VudGVyID0gbmV3IFNhbXBsZXMuRXZlbnRDb3VudGVyKCk7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBidWZmZXJlci53cmFwRXZlbnQoZW1pdHRlci5ldmVudCk7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGV2ZW50KGNvdW50ZXIub25FdmVudCwgY291bnRlcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAwKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDEpO1xuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMik7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAzKTtcblxuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJ1ZmZlciB3aGVuIHdyYXBwZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidWZmZXJlciA9IG5ldyBFdmVudEJ1ZmZlcmVyKCk7XG5cdFx0XHRjb25zdCBjb3VudGVyID0gbmV3IFNhbXBsZXMuRXZlbnRDb3VudGVyKCk7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBidWZmZXJlci53cmFwRXZlbnQoZW1pdHRlci5ldmVudCk7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGV2ZW50KGNvdW50ZXIub25FdmVudCwgY291bnRlcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAwKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDEpO1xuXG5cdFx0XHRidWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDEpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDEpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAzKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDQpO1xuXG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRcdFx0bGV0IGNvdW50ZXIxID0gMCwgY291bnRlcjIgPSAwLCBjb3VudGVyMyA9IDA7XG5cblx0XHRcdGNvbnN0IGxpc3RlbmVyMSA9IGVtaXR0ZXIuZXZlbnQoKCkgPT4gY291bnRlcjErKyk7XG5cdFx0XHRjb25zdCBsaXN0ZW5lcjIgPSBFdmVudC5vbmNlKGVtaXR0ZXIuZXZlbnQpKCgpID0+IGNvdW50ZXIyKyspO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIzID0gRXZlbnQub25jZShlbWl0dGVyLmV2ZW50KSgoKSA9PiBjb3VudGVyMysrKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIxLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyMiwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcjMsIDApO1xuXG5cdFx0XHRsaXN0ZW5lcjMuZGlzcG9zZSgpO1xuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcjEsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyMywgMCk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIxLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyMiwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcjMsIDApO1xuXG5cdFx0XHRsaXN0ZW5lcjEuZGlzcG9zZSgpO1xuXHRcdFx0bGlzdGVuZXIyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1ZmZlcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Nob3VsZCBidWZmZXIgZXZlbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdFx0Y29uc3QgYnVmZmVyZWRFdmVudCA9IEV2ZW50LmJ1ZmZlcihldmVudCwgJ3Rlc3QnKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdIGFzIG51bWJlcltdKTtcblxuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBidWZmZXJlZEV2ZW50KG51bSA9PiByZXN1bHQucHVzaChudW0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgM10pO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDRdKTtcblxuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzLCA0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYnVmZmVyIGV2ZW50cyBvbiBuZXh0IHRpY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBldmVudCA9IGVtaXR0ZXIuZXZlbnQ7XG5cdFx0XHRjb25zdCBidWZmZXJlZEV2ZW50ID0gRXZlbnQuYnVmZmVyKGV2ZW50LCAndGVzdCcsIHRydWUpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10gYXMgbnVtYmVyW10pO1xuXG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGJ1ZmZlcmVkRXZlbnQobnVtID0+IHJlc3VsdC5wdXNoKG51bSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDRdKTtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSg1KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgMywgNF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgaW5pdGlhbCBidWZmZXIgZXZlbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdFx0Y29uc3QgYnVmZmVyZWRFdmVudCA9IEV2ZW50LmJ1ZmZlcihldmVudCwgJ3Rlc3QnLCBmYWxzZSwgWy0yLCAtMSwgMF0pO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10gYXMgbnVtYmVyW10pO1xuXG5cdFx0XHRkcy5hZGQoYnVmZmVyZWRFdmVudChudW0gPT4gcmVzdWx0LnB1c2gobnVtKSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFstMiwgLTEsIDAsIDEsIDIsIDNdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0V2ZW50TXVsdGlwbGV4ZXInLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cdFx0XHRkcy5hZGQobS5ldmVudChyID0+IHJlc3VsdC5wdXNoKHIpKSk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTEuZXZlbnQpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGV4ZXIgZGlzcG9zZSB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cdFx0XHRkcy5hZGQobS5ldmVudChyID0+IHJlc3VsdC5wdXNoKHIpKSk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTEuZXZlbnQpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXG5cdFx0XHRtLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXG5cdFx0XHRlMS5maXJlKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFswXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmVudCBkaXNwb3NlIHdvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbSA9IG5ldyBFdmVudE11bHRpcGxleGVyPG51bWJlcj4oKTtcblx0XHRcdGRzLmFkZChtLmV2ZW50KHIgPT4gcmVzdWx0LnB1c2gocikpKTtcblxuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMS5ldmVudCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXG5cdFx0XHRlMS5maXJlKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFswXSk7XG5cblx0XHRcdGUxLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXG5cdFx0XHRlMS5maXJlKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFswXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdXRsaXBsZXhlciBldmVudCBkaXNwb3NlIHdvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbSA9IG5ldyBFdmVudE11bHRpcGxleGVyPG51bWJlcj4oKTtcblx0XHRcdGRzLmFkZChtLmV2ZW50KHIgPT4gcmVzdWx0LnB1c2gocikpKTtcblxuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGwxID0gbS5hZGQoZTEuZXZlbnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXG5cdFx0XHRlMS5maXJlKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFswXSk7XG5cblx0XHRcdGwxLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXG5cdFx0XHRlMS5maXJlKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFswXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3Qgc3RhcnQgd29ya3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBtID0gbmV3IEV2ZW50TXVsdGlwbGV4ZXI8bnVtYmVyPigpO1xuXHRcdFx0ZHMuYWRkKG0uZXZlbnQociA9PiByZXN1bHQucHVzaChyKSkpO1xuXG5cdFx0XHRjb25zdCBlMSA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUxLmV2ZW50KSk7XG5cdFx0XHRjb25zdCBlMiA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUyLmV2ZW50KSk7XG5cdFx0XHRjb25zdCBlMyA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUzLmV2ZW50KSk7XG5cblx0XHRcdGUxLmZpcmUoMSk7XG5cdFx0XHRlMi5maXJlKDIpO1xuXHRcdFx0ZTMuZmlyZSgzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgM10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29sZCBzdGFydCB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTEuZXZlbnQpKTtcblx0XHRcdGNvbnN0IGUyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTIuZXZlbnQpKTtcblx0XHRcdGNvbnN0IGUzID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTMuZXZlbnQpKTtcblxuXHRcdFx0ZHMuYWRkKG0uZXZlbnQociA9PiByZXN1bHQucHVzaChyKSkpO1xuXG5cdFx0XHRlMS5maXJlKDEpO1xuXHRcdFx0ZTIuZmlyZSgyKTtcblx0XHRcdGUzLmZpcmUoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xhdGUgYWRkIHdvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbSA9IG5ldyBFdmVudE11bHRpcGxleGVyPG51bWJlcj4oKTtcblxuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMS5ldmVudCkpO1xuXHRcdFx0Y29uc3QgZTIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMi5ldmVudCkpO1xuXG5cdFx0XHRkcy5hZGQobS5ldmVudChyID0+IHJlc3VsdC5wdXNoKHIpKSk7XG5cblx0XHRcdGUxLmZpcmUoMSk7XG5cdFx0XHRlMi5maXJlKDIpO1xuXG5cdFx0XHRjb25zdCBlMyA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUzLmV2ZW50KSk7XG5cdFx0XHRlMy5maXJlKDMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZCBkaXNwb3NlIHdvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbSA9IG5ldyBFdmVudE11bHRpcGxleGVyPG51bWJlcj4oKTtcblxuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMS5ldmVudCkpO1xuXHRcdFx0Y29uc3QgZTIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMi5ldmVudCkpO1xuXG5cdFx0XHRkcy5hZGQobS5ldmVudChyID0+IHJlc3VsdC5wdXNoKHIpKSk7XG5cblx0XHRcdGUxLmZpcmUoMSk7XG5cdFx0XHRlMi5maXJlKDIpO1xuXG5cdFx0XHRjb25zdCBlMyA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgbDMgPSBtLmFkZChlMy5ldmVudCk7XG5cdFx0XHRlMy5maXJlKDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cblx0XHRcdGwzLmRpc3Bvc2UoKTtcblx0XHRcdGUzLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblxuXHRcdFx0ZTIuZmlyZSg0KTtcblx0XHRcdGUxLmZpcmUoNSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0R5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlcicsICgpID0+IHtcblx0XHRsZXQgYWRkRW1pdHRlcjogRW1pdHRlcjxUZXN0SXRlbT47XG5cdFx0bGV0IHJlbW92ZUVtaXR0ZXI6IEVtaXR0ZXI8VGVzdEl0ZW0+O1xuXHRcdGNvbnN0IHJlY29yZGVkRXZlbnRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNsYXNzIFRlc3RJdGVtIHtcblx0XHRcdHJlYWRvbmx5IG9uVGVzdEV2ZW50RW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0cmVhZG9ubHkgb25UZXN0RXZlbnQgPSB0aGlzLm9uVGVzdEV2ZW50RW1pdHRlci5ldmVudDtcblx0XHR9XG5cdFx0bGV0IGl0ZW1zOiBUZXN0SXRlbVtdO1xuXHRcdGxldCBtOiBEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXI8VGVzdEl0ZW0sIG51bWJlcj47XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0YWRkRW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxUZXN0SXRlbT4oKSk7XG5cdFx0XHRyZW1vdmVFbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPFRlc3RJdGVtPigpKTtcblx0XHRcdGl0ZW1zID0gW25ldyBUZXN0SXRlbSgpLCBuZXcgVGVzdEl0ZW0oKV07XG5cdFx0XHRmb3IgKGNvbnN0IFtpLCBpdGVtXSBvZiBpdGVtcy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0ZHMuYWRkKGl0ZW0ub25UZXN0RXZlbnQoZSA9PiBgJHtpfToke2V9YCkpO1xuXHRcdFx0fVxuXHRcdFx0bSA9IG5ldyBEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXIoaXRlbXMsIGFkZEVtaXR0ZXIuZXZlbnQsIHJlbW92ZUVtaXR0ZXIuZXZlbnQsIGUgPT4gZS5vblRlc3RFdmVudCk7XG5cdFx0XHRkcy5hZGQobS5ldmVudChlID0+IHJlY29yZGVkRXZlbnRzLnB1c2goZSkpKTtcblx0XHRcdHJlY29yZGVkRXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0fSk7XG5cdFx0dGVhcmRvd24oKCkgPT4gbS5kaXNwb3NlKCkpO1xuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIGV2ZW50cyBmb3IgaW5pdGlhbCBpdGVtcycsICgpID0+IHtcblx0XHRcdGl0ZW1zWzBdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDEpO1xuXHRcdFx0aXRlbXNbMV0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRpdGVtc1swXS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdGl0ZW1zWzFdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZEV2ZW50cywgWzEsIDIsIDMsIDRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBldmVudHMgZm9yIGFkZGVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWRkZWRJdGVtID0gbmV3IFRlc3RJdGVtKCk7XG5cdFx0XHRhZGRFbWl0dGVyLmZpcmUoYWRkZWRJdGVtKTtcblx0XHRcdGFkZGVkSXRlbS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGl0ZW1zWzBdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDIpO1xuXHRcdFx0aXRlbXNbMV0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRhZGRlZEl0ZW0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkRXZlbnRzLCBbMSwgMiwgMywgNF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZmlyZSBldmVudHMgZm9yIHJlbW92ZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRyZW1vdmVFbWl0dGVyLmZpcmUoaXRlbXNbMF0pO1xuXHRcdFx0aXRlbXNbMF0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRpdGVtc1sxXS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdGl0ZW1zWzBdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDMpO1xuXHRcdFx0aXRlbXNbMV0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkRXZlbnRzLCBbMiwgNF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0Y29uc3QgZXZlbnQgPSBFdmVudC5sYXRjaChlbWl0dGVyLmV2ZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IGRzLmFkZChldmVudChudW0gPT4gcmVzdWx0LnB1c2gobnVtKSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzFdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDFdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDFdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDEsIDNdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDEsIDNdKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDEsIDNdKTtcblxuXHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBpcyByZWVudHJhbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KHtcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gZW1pdHRlci5ldmVudCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTsgLy8gc2hvdWxkIG5vdCBjcmFzaFxuXHR9KTtcblxuXHRzdWl0ZSgnUmVsYXknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGlucHV0IHdvcmsnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlMSA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZTIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IHJlbGF5ID0gbmV3IFJlbGF5PG51bWJlcj4oKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSAobnVtOiBudW1iZXIpID0+IHJlc3VsdC5wdXNoKG51bSk7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSByZWxheS5ldmVudChsaXN0ZW5lcik7XG5cblx0XHRcdGUxLmZpcmUoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXG5cdFx0XHRyZWxheS5pbnB1dCA9IGUxLmV2ZW50O1xuXHRcdFx0ZTEuZmlyZSgyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMl0pO1xuXG5cdFx0XHRyZWxheS5pbnB1dCA9IGUyLmV2ZW50O1xuXHRcdFx0ZTEuZmlyZSgzKTtcblx0XHRcdGUyLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzIsIDRdKTtcblxuXHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdGUxLmZpcmUoNSk7XG5cdFx0XHRlMi5maXJlKDYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsyLCA0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgUmVsYXkgZGlzcG9zZSB3b3JrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGUyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCByZWxheSA9IG5ldyBSZWxheTxudW1iZXI+KCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gKG51bTogbnVtYmVyKSA9PiByZXN1bHQucHVzaChudW0pO1xuXHRcdFx0ZHMuYWRkKHJlbGF5LmV2ZW50KGxpc3RlbmVyKSk7XG5cblx0XHRcdGUxLmZpcmUoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXG5cdFx0XHRyZWxheS5pbnB1dCA9IGUxLmV2ZW50O1xuXHRcdFx0ZTEuZmlyZSgyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMl0pO1xuXG5cdFx0XHRyZWxheS5pbnB1dCA9IGUyLmV2ZW50O1xuXHRcdFx0ZTEuZmlyZSgzKTtcblx0XHRcdGUyLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzIsIDRdKTtcblxuXHRcdFx0cmVsYXkuZGlzcG9zZSgpO1xuXHRcdFx0ZTEuZmlyZSg1KTtcblx0XHRcdGUyLmZpcmUoNik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzIsIDRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FjY3VtdWxhdGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBmaXJlIGFmdGVyIGEgbGlzdGVuZXIgaXMgZGlzcG9zZWQgd2l0aCB1bmRlZmluZWQgb3IgW10nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gZXZlbnRFbWl0dGVyLmV2ZW50O1xuXHRcdFx0Y29uc3QgYWNjdW11bGF0ZWQgPSBFdmVudC5hY2N1bXVsYXRlKGV2ZW50LCAwKTtcblxuXHRcdFx0Y29uc3QgY2FsbHMxOiBudW1iZXJbXVtdID0gW107XG5cdFx0XHRjb25zdCBjYWxsczI6IG51bWJlcltdW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyMSA9IGRzLmFkZChhY2N1bXVsYXRlZCgoZSkgPT4gY2FsbHMxLnB1c2goZSkpKTtcblx0XHRcdGRzLmFkZChhY2N1bXVsYXRlZCgoZSkgPT4gY2FsbHMyLnB1c2goZSkpKTtcblxuXHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsczEsIFtbMV1dKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMyLCBbWzFdXSk7XG5cblx0XHRcdGxpc3RlbmVyMS5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsczEsIFtbMV1dKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMyLCBbWzFdXSwgJ3Nob3VsZCBub3QgZmlyZSBhZnRlciBhIGxpc3RlbmVyIGlzIGRpc3Bvc2VkIHdpdGggdW5kZWZpbmVkIG9yIFtdJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGFjY3VtdWxhdGUgYSBzaW5nbGUgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gZXZlbnRFbWl0dGVyLmV2ZW50O1xuXHRcdFx0Y29uc3QgYWNjdW11bGF0ZWQgPSBFdmVudC5hY2N1bXVsYXRlKGV2ZW50LCAwKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0czEgPSBhd2FpdCBuZXcgUHJvbWlzZTxudW1iZXJbXT4ociA9PiB7XG5cdFx0XHRcdGRzLmFkZChhY2N1bXVsYXRlZChyKSk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDEpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMxLCBbMV0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzMiA9IGF3YWl0IG5ldyBQcm9taXNlPG51bWJlcltdPihyID0+IHtcblx0XHRcdFx0ZHMuYWRkKGFjY3VtdWxhdGVkKHIpKTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoMik7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0czIsIFsyXSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGFjY3VtdWxhdGUgbXVsdGlwbGUgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRFbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBldmVudCA9IGV2ZW50RW1pdHRlci5ldmVudDtcblx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkID0gRXZlbnQuYWNjdW11bGF0ZShldmVudCwgMCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdHMxID0gYXdhaXQgbmV3IFByb21pc2U8bnVtYmVyW10+KHIgPT4ge1xuXHRcdFx0XHRkcy5hZGQoYWNjdW11bGF0ZWQocikpO1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDMpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMxLCBbMSwgMiwgM10pO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzMiA9IGF3YWl0IG5ldyBQcm9taXNlPG51bWJlcltdPihyID0+IHtcblx0XHRcdFx0ZHMuYWRkKGFjY3VtdWxhdGVkKHIpKTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoNCk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDUpO1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSg2KTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoNyk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDgpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMyLCBbNCwgNSwgNiwgNywgOF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGVib3VuY2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRcdGNvbnN0IGRvYyA9IGRzLmFkZChuZXcgU2FtcGxlcy5Eb2N1bWVudDMoKSk7XG5cblx0XHRcdGNvbnN0IG9uRG9jRGlkQ2hhbmdlID0gRXZlbnQuZGVib3VuY2UoZG9jLm9uRGlkQ2hhbmdlLCAocHJldjogc3RyaW5nW10gfCB1bmRlZmluZWQsIGN1cikgPT4ge1xuXHRcdFx0XHRpZiAoIXByZXYpIHtcblx0XHRcdFx0XHRwcmV2ID0gW2N1cl07XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJldi5pbmRleE9mKGN1cikgPCAwKSB7XG5cdFx0XHRcdFx0cHJldi5wdXNoKGN1cik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHByZXY7XG5cdFx0XHR9LCAxMCk7XG5cblx0XHRcdGxldCBjb3VudCA9IDA7XG5cblx0XHRcdGRzLmFkZChvbkRvY0RpZENoYW5nZShrZXlzID0+IHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0YXNzZXJ0Lm9rKGtleXMsICd3YXMgbm90IGV4cGVjdGluZyBrZXlzLicpO1xuXHRcdFx0XHRpZiAoY291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRkb2Muc2V0VGV4dCgnNCcpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoa2V5cywgWycxJywgJzInLCAnMyddKTtcblx0XHRcdFx0fSBlbHNlIGlmIChjb3VudCA9PT0gMikge1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoa2V5cywgWyc0J10pO1xuXHRcdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRkb2Muc2V0VGV4dCgnMScpO1xuXHRcdFx0ZG9jLnNldFRleHQoJzInKTtcblx0XHRcdGRvYy5zZXRUZXh0KCczJyk7XG5cdFx0fSk7XG5cblxuXHRcdHRlc3QoJ21pY3JvdGFzaycsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0XHRjb25zdCBkb2MgPSBkcy5hZGQobmV3IFNhbXBsZXMuRG9jdW1lbnQzKCkpO1xuXG5cdFx0XHRjb25zdCBvbkRvY0RpZENoYW5nZSA9IEV2ZW50LmRlYm91bmNlKGRvYy5vbkRpZENoYW5nZSwgKHByZXY6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBjdXIpID0+IHtcblx0XHRcdFx0aWYgKCFwcmV2KSB7XG5cdFx0XHRcdFx0cHJldiA9IFtjdXJdO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByZXYuaW5kZXhPZihjdXIpIDwgMCkge1xuXHRcdFx0XHRcdHByZXYucHVzaChjdXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwcmV2O1xuXHRcdFx0fSwgTWljcm90YXNrRGVsYXkpO1xuXG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXG5cdFx0XHRkcy5hZGQob25Eb2NEaWRDaGFuZ2Uoa2V5cyA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdGFzc2VydC5vayhrZXlzLCAnd2FzIG5vdCBleHBlY3Rpbmcga2V5cy4nKTtcblx0XHRcdFx0aWYgKGNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0ZG9jLnNldFRleHQoJzQnKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGtleXMsIFsnMScsICcyJywgJzMnXSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY291bnQgPT09IDIpIHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGtleXMsIFsnNCddKTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZG9jLnNldFRleHQoJzEnKTtcblx0XHRcdGRvYy5zZXRUZXh0KCcyJyk7XG5cdFx0XHRkb2Muc2V0VGV4dCgnMycpO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdsZWFkaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IGRlYm91bmNlZCA9IEV2ZW50LmRlYm91bmNlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBlLCAwLCAvKmxlYWRpbmc9Ki90cnVlKTtcblxuXHRcdFx0bGV0IGNhbGxzID0gMDtcblx0XHRcdGRzLmFkZChkZWJvdW5jZWQoKCkgPT4ge1xuXHRcdFx0XHRjYWxscysrO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBJZiB0aGUgc291cmNlIGV2ZW50IGlzIGZpcmVkIG9uY2UsIHRoZSBkZWJvdW5jZWQgKG9uIHRoZSBsZWFkaW5nIGVkZ2UpIGV2ZW50IHNob3VsZCBiZSBmaXJlZCBvbmx5IG9uY2Vcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYWRpbmcgKDIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IGRlYm91bmNlZCA9IEV2ZW50LmRlYm91bmNlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBlLCAwLCAvKmxlYWRpbmc9Ki90cnVlKTtcblxuXHRcdFx0bGV0IGNhbGxzID0gMDtcblx0XHRcdGRzLmFkZChkZWJvdW5jZWQoKCkgPT4ge1xuXHRcdFx0XHRjYWxscysrO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBJZiB0aGUgc291cmNlIGV2ZW50IGlzIGZpcmVkIG11bHRpcGxlIHRpbWVzLCB0aGUgZGVib3VuY2VkIChvbiB0aGUgbGVhZGluZyBlZGdlKSBldmVudCBzaG91bGQgYmUgZmlyZWQgdHdpY2Vcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhZGluZyByZXNldCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGRlYm91bmNlZCA9IEV2ZW50LmRlYm91bmNlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBsID8gbCArIDEgOiAxLCAwLCAvKmxlYWRpbmc9Ki90cnVlKTtcblxuXHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRkcy5hZGQoZGVib3VuY2VkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAxXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZsdXNoIGV2ZW50cyB3aGVuIGEgbGlzdGVuZXIgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMCk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkcy5hZGQoZGVib3VuY2VkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmx1c2hPbkxpc3RlbmVyUmVtb3ZlIC0gc2hvdWxkIGZsdXNoIGV2ZW50cyB3aGVuIGEgbGlzdGVuZXIgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGRzLmFkZChkZWJvdW5jZWQoKGUpID0+IGNhbGxzLnB1c2goZSkpKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0sICdzaG91bGQgZmlyZSB3aXRoIHRoZSBmaXJzdCBldmVudCwgbm90IHRoZSBzZWNvbmQgKGFmdGVyIGxpc3RlbmVyIGRpc3Bvc2UpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmx1c2ggZXZlbnRzIHdoZW4gdGhlIGVtaXR0ZXIgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMCk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0ZHMuYWRkKGRlYm91bmNlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0aHJvdHRsZScsICgpID0+IHtcblx0XHR0ZXN0KCdsZWFkaW5nIG9ubHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkID0gRXZlbnQudGhyb3R0bGUoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGwgPyBsICsgMSA6IDEsIDEwLCAvKmxlYWRpbmc9Ki90cnVlLCAvKnRyYWlsaW5nPSovZmFsc2UpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRkcy5hZGQodGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdFx0Ly8gRmlyc3QgZXZlbnQgZmlyZXMgaW1tZWRpYXRlbHlcblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdC8vIFN1YnNlcXVlbnQgZXZlbnRzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2QgYXJlIGlnbm9yZWRcblx0XHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhyb3R0bGUgcGVyaW9kIHRvIGVuZFxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdLCAnbm8gdHJhaWxpbmcgZWRnZSBmaXJlIHdpdGggdHJhaWxpbmc9ZmFsc2UnKTtcblxuXHRcdFx0XHQvLyBBZnRlciB0aHJvdHRsZSBwZXJpb2QsIG5leHQgZXZlbnQgZmlyZXMgaW1tZWRpYXRlbHlcblx0XHRcdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFpbGluZyBvbmx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBsID8gbCArIDEgOiAxLCAxMCwgLypsZWFkaW5nPSovZmFsc2UsIC8qdHJhaWxpbmc9Ki90cnVlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdC8vIEZpcnN0IGV2ZW50IGRvZXMgbm90IGZpcmUgaW1tZWRpYXRlbHlcblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cblx0XHRcdFx0Ly8gTXVsdGlwbGUgZXZlbnRzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblxuXHRcdFx0XHQvLyBXYWl0IGZvciB0aHJvdHRsZSBwZXJpb2QgLSBzaG91bGQgZmlyZSB3aXRoIGFjY3VtdWxhdGVkIHZhbHVlXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbM10pO1xuXG5cdFx0XHRcdC8vIE5ldyBldmVudHMgc3RhcnQgYSBuZXcgdGhyb3R0bGUgcGVyaW9kXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSg0KTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbM10pO1xuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMywgMl0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib3RoIGxlYWRpbmcgYW5kIHRyYWlsaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBsID8gbCArIDEgOiAxLCAxMCwgLypsZWFkaW5nPSovdHJ1ZSwgLyp0cmFpbGluZz0qL3RydWUpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRkcy5hZGQodGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdFx0Ly8gRmlyc3QgZXZlbnQgZmlyZXMgaW1tZWRpYXRlbHkgKGxlYWRpbmcpXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHQvLyBFdmVudHMgZHVyaW5nIHRocm90dGxlIHBlcmlvZCBhcmUgYWNjdW11bGF0ZWRcblx0XHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhyb3R0bGUgcGVyaW9kIC0gc2hvdWxkIGZpcmUgdHJhaWxpbmcgZWRnZSB3aXRoIGFjY3VtdWxhdGVkIHZhbHVlXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMl0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbmx5IGxlYWRpbmcgZWRnZSBpZiBubyBzdWJzZXF1ZW50IGV2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMTAsIC8qbGVhZGluZz0qL3RydWUsIC8qdHJhaWxpbmc9Ki90cnVlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdC8vIFNpbmdsZSBldmVudCBmaXJlcyBpbW1lZGlhdGVseSAobGVhZGluZylcblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdC8vIE5vIG1vcmUgZXZlbnRzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxNSk7XG5cdFx0XHRcdC8vIFNob3VsZCBub3QgZmlyZSB0cmFpbGluZyBlZGdlIHNpbmNlIHRoZXJlIHdlcmUgbm8gbW9yZSBldmVudHNcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWljcm90YXNrIGRlbGF5JywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBsID8gbCArIDEgOiAxLCBNaWNyb3Rhc2tEZWxheSk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHQvLyBGaXJzdCBldmVudCBmaXJlcyBpbW1lZGlhdGVseSAobGVhZGluZyBieSBkZWZhdWx0KVxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0Ly8gRXZlbnRzIGR1cmluZyBtaWNyb3Rhc2tcblx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdC8vIENoZWNrIGFmdGVyIG1pY3JvdGFza1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHQvLyBTaG91bGQgaGF2ZSBmaXJlZCB0cmFpbGluZyBlZGdlXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAyXSk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWVyZ2UgZnVuY3Rpb24gYWNjdW11bGF0ZXMgdmFsdWVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKFxuXHRcdFx0XHRcdGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0KGxhc3QsIGN1cikgPT4gKGxhc3QgfHwgMCkgKyBjdXIsXG5cdFx0XHRcdFx0MTAsXG5cdFx0XHRcdFx0LypsZWFkaW5nPSovdHJ1ZSxcblx0XHRcdFx0XHQvKnRyYWlsaW5nPSovdHJ1ZVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRkcy5hZGQodGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdFx0Ly8gRmlyc3QgZXZlbnQgZmlyZXMgaW1tZWRpYXRlbHkgd2l0aCB2YWx1ZSAxXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHQvLyBBY2N1bXVsYXRlIG1vcmUgdmFsdWVzOiAyICsgMyA9IDVcblx0XHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdFx0YXdhaXQgdGltZW91dCgxNSk7XG5cdFx0XHRcdC8vIFRyYWlsaW5nIGVkZ2UgZmlyZXMgd2l0aCBhY2N1bXVsYXRlZCBzdW1cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDVdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmFwaWQgY29uc2VjdXRpdmUgdGhyb3R0bGUgcGVyaW9kcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gZSwgMTAsIC8qbGVhZGluZz0qL3RydWUsIC8qdHJhaWxpbmc9Ki90cnVlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdC8vIFBlcmlvZCAxXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMl0pO1xuXG5cdFx0XHRcdC8vIFBlcmlvZCAyXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMiwgM10pO1xuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMiwgMywgNF0pO1xuXG5cdFx0XHRcdC8vIFBlcmlvZCAzXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSg1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDIsIDMsIDQsIDVdKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0Ly8gTm8gdHJhaWxpbmcgZmlyZSBzaW5jZSBvbmx5IG9uZSBldmVudFxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IHBhcmFtZXRlcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0Ly8gRGVmYXVsdDogZGVsYXk9MTAwLCBsZWFkaW5nPXRydWUsIHRyYWlsaW5nPXRydWVcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkID0gRXZlbnQudGhyb3R0bGUoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGUpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRkcy5hZGQodGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0sICdzaG91bGQgZmlyZSBsZWFkaW5nIGVkZ2UgYnkgZGVmYXVsdCcpO1xuXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMTApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMl0sICdzaG91bGQgZmlyZSB0cmFpbGluZyBlZGdlIGJ5IGRlZmF1bHQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zYWwgY2xlYW5zIHVwJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBlLCAxMCk7XG5cblx0XHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKTtcblxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdFx0Ly8gRXZlbnRzIGFmdGVyIGRpc3Bvc2FsIHNob3VsZCBub3QgZmlyZVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBldmVudHMgZHVyaW5nIHRocm90dGxlIHdpdGggdHJhaWxpbmc9ZmFsc2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkID0gRXZlbnQudGhyb3R0bGUoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGwgPyBsICsgMSA6IDEsIDEwLCAvKmxlYWRpbmc9Ki90cnVlLCAvKnRyYWlsaW5nPSovZmFsc2UpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRkcy5hZGQodGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdC8vIE5vIG1vcmUgZXZlbnRzXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdC8vIE5leHQgZXZlbnQgYWZ0ZXIgdGhyb3R0bGUgcGVyaW9kXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDFdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVpdGhlciBsZWFkaW5nIG5vciB0cmFpbGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gZSwgMTAsIC8qbGVhZGluZz0qL2ZhbHNlLCAvKnRyYWlsaW5nPSovZmFsc2UpO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRkcy5hZGQodGhyb3R0bGVkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSwgJ25vIGV2ZW50cyBzaG91bGQgZmlyZSB3aXRoIGJvdGggbGVhZGluZyBhbmQgdHJhaWxpbmcgZmFsc2UnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjMwNDAxJywgKCkgPT4ge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IGRzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KCgpID0+IHtcblx0XHRcdGNvdW50Kys7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pKTtcblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRjb3VudCsrO1xuXHRcdH0pKTtcblx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50LCAyKTtcblx0fSk7XG5cblx0c3VpdGUoJ2NoYWluMicsICgpID0+IHtcblx0XHRsZXQgZW06IEVtaXR0ZXI8bnVtYmVyPjtcblx0XHRsZXQgY2FsbHM6IG51bWJlcltdO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZW0gPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNhbGxzID0gW107XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSBFdmVudC5jaGFpbihlbS5ldmVudCwgJCA9PiAkLm1hcCh2ID0+IHYgKiAyKSk7XG5cdFx0XHRkcy5hZGQoZXYodiA9PiBjYWxscy5wdXNoKHYpKSk7XG5cdFx0XHRlbS5maXJlKDEpO1xuXHRcdFx0ZW0uZmlyZSgyKTtcblx0XHRcdGVtLmZpcmUoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMiwgNCwgNl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gRXZlbnQuY2hhaW4oZW0uZXZlbnQsICQgPT4gJC5maWx0ZXIodiA9PiB2ICUgMiA9PT0gMCkpO1xuXHRcdFx0ZHMuYWRkKGV2KHYgPT4gY2FsbHMucHVzaCh2KSkpO1xuXHRcdFx0ZW0uZmlyZSgxKTtcblx0XHRcdGVtLmZpcmUoMik7XG5cdFx0XHRlbS5maXJlKDMpO1xuXHRcdFx0ZW0uZmlyZSg0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsyLCA0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWR1Y2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSBFdmVudC5jaGFpbihlbS5ldmVudCwgJCA9PiAkLnJlZHVjZSgoYWNjLCB2KSA9PiBhY2MgKyB2LCAwKSk7XG5cdFx0XHRkcy5hZGQoZXYodiA9PiBjYWxscy5wdXNoKHYpKSk7XG5cdFx0XHRlbS5maXJlKDEpO1xuXHRcdFx0ZW0uZmlyZSgyKTtcblx0XHRcdGVtLmZpcmUoMyk7XG5cdFx0XHRlbS5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDMsIDYsIDEwXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXRjaGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSBFdmVudC5jaGFpbihlbS5ldmVudCwgJCA9PiAkLmxhdGNoKCkpO1xuXHRcdFx0ZHMuYWRkKGV2KHYgPT4gY2FsbHMucHVzaCh2KSkpO1xuXHRcdFx0ZW0uZmlyZSgxKTtcblx0XHRcdGVtLmZpcmUoMSk7XG5cdFx0XHRlbS5maXJlKDIpO1xuXHRcdFx0ZW0uZmlyZSgyKTtcblx0XHRcdGVtLmZpcmUoMyk7XG5cdFx0XHRlbS5maXJlKDMpO1xuXHRcdFx0ZW0uZmlyZSgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAyLCAzLCAxXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIGV2ZXJ5dGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldiA9IEV2ZW50LmNoYWluKGVtLmV2ZW50LCAkID0+ICRcblx0XHRcdFx0LmZpbHRlcih2ID0+IHYgJSAyID09PSAwKVxuXHRcdFx0XHQubWFwKHYgPT4gdiAqIDIpXG5cdFx0XHRcdC5yZWR1Y2UoKGFjYywgdikgPT4gYWNjICsgdiwgMClcblx0XHRcdFx0LmxhdGNoKClcblx0XHRcdCk7XG5cblx0XHRcdGRzLmFkZChldih2ID0+IGNhbGxzLnB1c2godikpKTtcblx0XHRcdGVtLmZpcmUoMSk7XG5cdFx0XHRlbS5maXJlKDIpO1xuXHRcdFx0ZW0uZmlyZSgzKTtcblx0XHRcdGVtLmZpcmUoNCk7XG5cdFx0XHRlbS5maXJlKDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzQsIDEyXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWMsaUNBQWlDO0FBQ3hELFNBQVMsY0FBYyxpQkFBaUIsNkJBQTZCLFNBQVMsT0FBTyxlQUFlLGtCQUE4QixtQkFBbUIsc0JBQXNCLGtCQUFrQixrQkFBa0IsT0FBTywwQkFBMEIscUNBQXFDO0FBQ3JSLFNBQVMsaUJBQThCLGNBQWMsc0JBQXNCLHlCQUF5QjtBQUNwRyxTQUFTLGlCQUFpQixtQkFBbUI7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxZQUFZO0FBRXJCLElBQVU7QUFBQSxDQUFWLENBQVVBLGFBQVY7QUFBQSxFQUVRLE1BQU0sYUFBYTtBQUFBLElBQW5CO0FBRU4sbUJBQVE7QUFBQTtBQUFBLElBRVIsUUFBUTtBQUNQLFdBQUssUUFBUTtBQUFBLElBQ2Q7QUFBQSxJQUVBLFVBQVU7QUFDVCxXQUFLLFNBQVM7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQVhPLEVBQUFBLFNBQU07QUFBQSxFQWFOLE1BQU0sVUFBVTtBQUFBLElBQWhCO0FBRU4sV0FBaUIsZUFBZSxJQUFJ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
