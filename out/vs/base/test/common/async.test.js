import assert from "assert";
import * as async from "../../common/async.js";
import * as MicrotaskDelay from "../../common/symbols.js";
import { CancellationTokenSource } from "../../common/cancellation.js";
import { isCancellationError } from "../../common/errors.js";
import { Event } from "../../common/event.js";
import { URI } from "../../common/uri.js";
import { runWithFakedTimers } from "./timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { DisposableStore } from "../../common/lifecycle.js";
import { Iterable } from "../../common/iterator.js";
import { isWeb } from "../../common/platform.js";
suite("Async", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("cancelablePromise", function() {
    test("set token, don't wait for inner promise", function() {
      let canceled = 0;
      const promise = async.createCancelablePromise((token) => {
        store.add(token.onCancellationRequested((_) => {
          canceled += 1;
        }));
        return new Promise((resolve) => {
        });
      });
      const result = promise.then((_) => assert.ok(false), (err) => {
        assert.strictEqual(canceled, 1);
        assert.ok(isCancellationError(err));
      });
      promise.cancel();
      promise.cancel();
      return result;
    });
    test("cancel despite inner promise being resolved", function() {
      let canceled = 0;
      const promise = async.createCancelablePromise((token) => {
        store.add(token.onCancellationRequested((_) => {
          canceled += 1;
        }));
        return Promise.resolve(1234);
      });
      const result = promise.then((_) => assert.ok(false), (err) => {
        assert.strictEqual(canceled, 1);
        assert.ok(isCancellationError(err));
      });
      promise.cancel();
      return result;
    });
    test("cancel disposes result", function() {
      const store2 = new DisposableStore();
      const promise = async.createCancelablePromise(async (token) => {
        return store2;
      });
      promise.then((_) => assert.ok(false), (err) => {
        assert.ok(isCancellationError(err));
        assert.ok(store2.isDisposed);
      });
      promise.cancel();
    });
    test("execution order (sync)", function() {
      const order = [];
      const cancellablePromise = async.createCancelablePromise((token) => {
        order.push("in callback");
        store.add(token.onCancellationRequested((_) => order.push("cancelled")));
        return Promise.resolve(1234);
      });
      order.push("afterCreate");
      const promise = cancellablePromise.then(void 0, (err) => null).then(() => order.push("finally"));
      cancellablePromise.cancel();
      order.push("afterCancel");
      return promise.then(() => assert.deepStrictEqual(order, ["in callback", "afterCreate", "cancelled", "afterCancel", "finally"]));
    });
    test("execution order (async)", function() {
      const order = [];
      const cancellablePromise = async.createCancelablePromise((token) => {
        order.push("in callback");
        store.add(token.onCancellationRequested((_) => order.push("cancelled")));
        return new Promise((c) => setTimeout(c.bind(1234), 0));
      });
      order.push("afterCreate");
      const promise = cancellablePromise.then(void 0, (err) => null).then(() => order.push("finally"));
      cancellablePromise.cancel();
      order.push("afterCancel");
      return promise.then(() => assert.deepStrictEqual(order, ["in callback", "afterCreate", "cancelled", "afterCancel", "finally"]));
    });
    test("execution order (async with late listener)", async function() {
      const order = [];
      const cancellablePromise = async.createCancelablePromise(async (token) => {
        order.push("in callback");
        await async.timeout(0);
        store.add(token.onCancellationRequested((_) => order.push("cancelled")));
        cancellablePromise.cancel();
        order.push("afterCancel");
      });
      order.push("afterCreate");
      const promise = cancellablePromise.then(void 0, (err) => null).then(() => order.push("finally"));
      return promise.then(() => assert.deepStrictEqual(order, ["in callback", "afterCreate", "cancelled", "afterCancel", "finally"]));
    });
    test("get inner result", async function() {
      const promise = async.createCancelablePromise((token) => {
        return async.timeout(12).then((_) => 1234);
      });
      const result = await promise;
      assert.strictEqual(result, 1234);
    });
  });
  suite("raceCancellablePromises", function() {
    test("preserves the result and cancels only the losing promises", async function() {
      let resolveWinner;
      let winnerCancellations = 0;
      let loserCancellations = 0;
      const winner = Object.assign(new Promise((resolve) => resolveWinner = resolve), { cancel: () => winnerCancellations++ });
      const loser = Object.assign(new Promise(() => {
      }), { cancel: () => loserCancellations++ });
      const race = async.raceCancellablePromises([winner, loser]);
      resolveWinner(42);
      assert.deepStrictEqual({
        result: await race,
        winnerCancellations,
        loserCancellations
      }, {
        result: 42,
        winnerCancellations: 0,
        loserCancellations: 1
      });
    });
    test("preserves the error, cancels all promises, and handles cleanup rejection", async function() {
      const expectedError = new Error("expected");
      let rejectingPromiseCancellations = 0;
      let pendingPromiseCancellations = 0;
      const unhandledRejections = [];
      const onUnhandledRejection = (reason) => unhandledRejections.push(reason);
      const onBrowserUnhandledRejection = (event) => onUnhandledRejection(event.reason);
      if (isWeb) {
        globalThis.addEventListener("unhandledrejection", onBrowserUnhandledRejection);
      } else {
        process.on("unhandledRejection", onUnhandledRejection);
      }
      const rejectingPromise = Object.assign(Promise.reject(expectedError), { cancel: () => rejectingPromiseCancellations++ });
      const pendingPromise = Object.assign(new Promise(() => {
      }), { cancel: () => pendingPromiseCancellations++ });
      try {
        let actualError;
        try {
          await async.raceCancellablePromises([rejectingPromise, pendingPromise]);
        } catch (error) {
          actualError = error;
        }
        await async.timeout(0);
        assert.deepStrictEqual({
          preservesError: actualError === expectedError,
          rejectingPromiseCancellations,
          pendingPromiseCancellations,
          unhandledRejections
        }, {
          preservesError: true,
          rejectingPromiseCancellations: 1,
          pendingPromiseCancellations: 1,
          unhandledRejections: []
        });
      } finally {
        if (isWeb) {
          globalThis.removeEventListener("unhandledrejection", onBrowserUnhandledRejection);
        } else {
          process.off("unhandledRejection", onUnhandledRejection);
        }
      }
    });
    test("explicit cancellation cancels all pending promises", async function() {
      const cancellationCounts = [0, 0];
      const promises = cancellationCounts.map((_, index) => async.createCancelablePromise((token) => {
        store.add(token.onCancellationRequested(() => cancellationCounts[index]++));
        return new Promise(() => {
        });
      }));
      const race = async.raceCancellablePromises(promises);
      race.cancel();
      let cancellationError;
      try {
        await race;
      } catch (error) {
        cancellationError = error;
      }
      assert.deepStrictEqual({
        isCancellationError: isCancellationError(cancellationError),
        cancellationCounts
      }, {
        isCancellationError: true,
        cancellationCounts: [1, 1]
      });
    });
  });
  suite("Throttler", function() {
    test("non async", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const throttler = new async.Throttler();
      return Promise.all([
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 1);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        })
      ]).then(() => assert.strictEqual(count, 2));
    });
    test("async", () => {
      let count = 0;
      const factory = () => async.timeout(0).then(() => ++count);
      const throttler = new async.Throttler();
      return Promise.all([
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 1);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        })
      ]).then(() => {
        return Promise.all([
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 3);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          })
        ]);
      });
    });
    test("last factory should be the one getting called", function() {
      const factoryFactory = (n) => () => {
        return async.timeout(0).then(() => n);
      };
      const throttler = new async.Throttler();
      const promises = [];
      promises.push(throttler.queue(factoryFactory(1)).then((n) => {
        assert.strictEqual(n, 1);
      }));
      promises.push(throttler.queue(factoryFactory(2)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      promises.push(throttler.queue(factoryFactory(3)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      return Promise.all(promises);
    });
    test("disposal after queueing", async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return async.timeout(0);
      };
      const throttler = new async.Throttler();
      const promises = [];
      promises.push(throttler.queue(factory));
      promises.push(throttler.queue(factory));
      throttler.dispose();
      await Promise.all(promises);
      assert.strictEqual(factoryCalls, 1);
    });
    test("disposal before queueing", async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return async.timeout(0);
      };
      const throttler = new async.Throttler();
      const promises = [];
      throttler.dispose();
      promises.push(throttler.queue(factory));
      try {
        await Promise.all(promises);
        assert.fail("should fail");
      } catch (err) {
        assert.strictEqual(factoryCalls, 0);
      }
    });
  });
  suite("Delayer", function() {
    test("simple", () => {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      return Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
    });
    test("microtask delay simple", () => {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(MicrotaskDelay.MicrotaskDelay);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      return Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
    });
    suite("ThrottledDelayer", () => {
      test("promise should resolve if disposed", async () => {
        const throttledDelayer = new async.ThrottledDelayer(100);
        const promise = throttledDelayer.trigger(async () => {
        }, 0);
        throttledDelayer.dispose();
        try {
          await promise;
          assert.fail("SHOULD NOT BE HERE");
        } catch (err) {
        }
      });
      test("trigger after dispose throws", async () => {
        const throttledDelayer = new async.ThrottledDelayer(100);
        throttledDelayer.dispose();
        await assert.rejects(() => throttledDelayer.trigger(async () => {
        }, 0));
      });
    });
    test("simple cancel", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      assert(!delayer.isTriggered());
      const p = delayer.trigger(factory).then(() => {
        assert(false);
      }, () => {
        assert(true, "yes, it was cancelled");
      });
      assert(delayer.isTriggered());
      delayer.cancel();
      assert(!delayer.isTriggered());
      return p;
    });
    test("simple cancel microtask", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(MicrotaskDelay.MicrotaskDelay);
      assert(!delayer.isTriggered());
      const p = delayer.trigger(factory).then(() => {
        assert(false);
      }, () => {
        assert(true, "yes, it was cancelled");
      });
      assert(delayer.isTriggered());
      delayer.cancel();
      assert(!delayer.isTriggered());
      return p;
    });
    test("cancel should cancel all calls to trigger", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factory).then(void 0, () => {
        assert(true, "yes, it was cancelled");
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then(void 0, () => {
        assert(true, "yes, it was cancelled");
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then(void 0, () => {
        assert(true, "yes, it was cancelled");
      }));
      assert(delayer.isTriggered());
      delayer.cancel();
      return Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
    });
    test("trigger, cancel, then trigger again", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      let promises = [];
      assert(!delayer.isTriggered());
      const p = delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
        promises.push(delayer.trigger(factory).then(void 0, () => {
          assert(true, "yes, it was cancelled");
        }));
        assert(delayer.isTriggered());
        promises.push(delayer.trigger(factory).then(void 0, () => {
          assert(true, "yes, it was cancelled");
        }));
        assert(delayer.isTriggered());
        delayer.cancel();
        const p2 = Promise.all(promises).then(() => {
          promises = [];
          assert(!delayer.isTriggered());
          promises.push(delayer.trigger(factory).then(() => {
            assert.strictEqual(result, 1);
            assert(!delayer.isTriggered());
          }));
          assert(delayer.isTriggered());
          promises.push(delayer.trigger(factory).then(() => {
            assert.strictEqual(result, 1);
            assert(!delayer.isTriggered());
          }));
          assert(delayer.isTriggered());
          const p3 = Promise.all(promises).then(() => {
            assert(!delayer.isTriggered());
          });
          assert(delayer.isTriggered());
          return p3;
        });
        return p2;
      });
      assert(delayer.isTriggered());
      return p;
    });
    test("last task should be the one getting called", function() {
      const factoryFactory = (n) => () => {
        return Promise.resolve(n);
      };
      const delayer = new async.Delayer(0);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factoryFactory(1)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      promises.push(delayer.trigger(factoryFactory(2)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      promises.push(delayer.trigger(factoryFactory(3)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      const p = Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
      assert(delayer.isTriggered());
      return p;
    });
  });
  suite("sequence", () => {
    test("simple", () => {
      const factoryFactory = (n) => () => {
        return Promise.resolve(n);
      };
      return async.sequence([
        factoryFactory(1),
        factoryFactory(2),
        factoryFactory(3),
        factoryFactory(4),
        factoryFactory(5)
      ]).then((result) => {
        assert.strictEqual(5, result.length);
        assert.strictEqual(1, result[0]);
        assert.strictEqual(2, result[1]);
        assert.strictEqual(3, result[2]);
        assert.strictEqual(4, result[3]);
        assert.strictEqual(5, result[4]);
      });
    });
  });
  suite("Limiter", () => {
    test("assert degree of paralellism", function() {
      let activePromises = 0;
      const factoryFactory = (n) => () => {
        activePromises++;
        assert(activePromises < 6);
        return async.timeout(0).then(() => {
          activePromises--;
          return n;
        });
      };
      const limiter = new async.Limiter(5);
      const promises = [];
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((n) => promises.push(limiter.queue(factoryFactory(n))));
      return Promise.all(promises).then((res) => {
        assert.strictEqual(10, res.length);
        assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
      });
    });
  });
  suite("Queue", () => {
    test("simple", function() {
      const queue = new async.Queue();
      let syncPromise = false;
      const f1 = () => Promise.resolve(true).then(() => syncPromise = true);
      let asyncPromise = false;
      const f2 = () => async.timeout(10).then(() => asyncPromise = true);
      assert.strictEqual(queue.size, 0);
      queue.queue(f1);
      assert.strictEqual(queue.size, 1);
      const p = queue.queue(f2);
      assert.strictEqual(queue.size, 2);
      return p.then(() => {
        assert.strictEqual(queue.size, 0);
        assert.ok(syncPromise);
        assert.ok(asyncPromise);
      });
    });
    test("stop processing on dispose", async function() {
      const queue = new async.Queue();
      let workCounter = 0;
      const task = async () => {
        await async.timeout(0);
        workCounter++;
        queue.dispose();
      };
      const p1 = queue.queue(task);
      queue.queue(task);
      queue.queue(task);
      assert.strictEqual(queue.size, 3);
      await p1;
      assert.strictEqual(workCounter, 1);
    });
    test("stop on clear", async function() {
      const queue = new async.Queue();
      let workCounter = 0;
      const task = async () => {
        await async.timeout(0);
        workCounter++;
        queue.clear();
        assert.strictEqual(queue.size, 1);
      };
      const p1 = queue.queue(task);
      queue.queue(task);
      queue.queue(task);
      assert.strictEqual(queue.size, 3);
      await p1;
      assert.strictEqual(workCounter, 1);
      assert.strictEqual(queue.size, 0);
      const p2 = queue.queue(task);
      await p2;
      assert.strictEqual(workCounter, 2);
    });
    test("clear and drain (1)", async function() {
      const queue = new async.Queue();
      let workCounter = 0;
      const task = async () => {
        await async.timeout(0);
        workCounter++;
        queue.clear();
      };
      const p0 = Event.toPromise(queue.onDrained);
      const p1 = queue.queue(task);
      await p1;
      await p0;
      assert.strictEqual(workCounter, 1);
      queue.dispose();
    });
    test("clear and drain (2)", async function() {
      const queue = new async.Queue();
      let didFire = false;
      const d = queue.onDrained(() => {
        didFire = true;
      });
      queue.clear();
      assert.strictEqual(didFire, false);
      d.dispose();
      queue.dispose();
    });
    test("drain timing", async function() {
      const queue = new async.Queue();
      const logicClock = new class {
        constructor() {
          this.time = 0;
        }
        tick() {
          return this.time++;
        }
      }();
      let didDrainTime = 0;
      let didFinishTime1 = 0;
      let didFinishTime2 = 0;
      const d = queue.onDrained(() => {
        didDrainTime = logicClock.tick();
      });
      const p1 = queue.queue(() => {
        didFinishTime1 = logicClock.tick();
        return Promise.resolve();
      });
      const p2 = queue.queue(async () => {
        await async.timeout(10);
        didFinishTime2 = logicClock.tick();
      });
      await Promise.all([p1, p2]);
      assert.strictEqual(didFinishTime1, 0);
      assert.strictEqual(didFinishTime2, 1);
      assert.strictEqual(didDrainTime, 2);
      d.dispose();
      queue.dispose();
    });
    test("drain event is send only once", async function() {
      const queue = new async.Queue();
      let drainCount = 0;
      const d = queue.onDrained(() => {
        drainCount++;
      });
      queue.queue(async () => {
      });
      queue.queue(async () => {
      });
      queue.queue(async () => {
      });
      queue.queue(async () => {
      });
      assert.strictEqual(drainCount, 0);
      assert.strictEqual(queue.size, 4);
      await queue.whenIdle();
      assert.strictEqual(drainCount, 1);
      d.dispose();
      queue.dispose();
    });
    test("order is kept", function() {
      return runWithFakedTimers({}, () => {
        const queue = new async.Queue();
        const res = [];
        const f1 = () => Promise.resolve(true).then(() => res.push(1));
        const f2 = () => async.timeout(10).then(() => res.push(2));
        const f3 = () => Promise.resolve(true).then(() => res.push(3));
        const f4 = () => async.timeout(20).then(() => res.push(4));
        const f5 = () => async.timeout(0).then(() => res.push(5));
        queue.queue(f1);
        queue.queue(f2);
        queue.queue(f3);
        queue.queue(f4);
        return queue.queue(f5).then(() => {
          assert.strictEqual(res[0], 1);
          assert.strictEqual(res[1], 2);
          assert.strictEqual(res[2], 3);
          assert.strictEqual(res[3], 4);
          assert.strictEqual(res[4], 5);
        });
      });
    });
    test("errors bubble individually but not cause stop", function() {
      const queue = new async.Queue();
      const res = [];
      let error = false;
      const f1 = () => Promise.resolve(true).then(() => res.push(1));
      const f2 = () => async.timeout(10).then(() => res.push(2));
      const f3 = () => Promise.resolve(true).then(() => Promise.reject(new Error("error")));
      const f4 = () => async.timeout(20).then(() => res.push(4));
      const f5 = () => async.timeout(0).then(() => res.push(5));
      queue.queue(f1);
      queue.queue(f2);
      queue.queue(f3).then(void 0, () => error = true);
      queue.queue(f4);
      return queue.queue(f5).then(() => {
        assert.strictEqual(res[0], 1);
        assert.strictEqual(res[1], 2);
        assert.ok(error);
        assert.strictEqual(res[2], 4);
        assert.strictEqual(res[3], 5);
      });
    });
    test("order is kept (chained)", function() {
      const queue = new async.Queue();
      const res = [];
      const f1 = () => Promise.resolve(true).then(() => res.push(1));
      const f2 = () => async.timeout(10).then(() => res.push(2));
      const f3 = () => Promise.resolve(true).then(() => res.push(3));
      const f4 = () => async.timeout(20).then(() => res.push(4));
      const f5 = () => async.timeout(0).then(() => res.push(5));
      return queue.queue(f1).then(() => {
        return queue.queue(f2).then(() => {
          return queue.queue(f3).then(() => {
            return queue.queue(f4).then(() => {
              return queue.queue(f5).then(() => {
                assert.strictEqual(res[0], 1);
                assert.strictEqual(res[1], 2);
                assert.strictEqual(res[2], 3);
                assert.strictEqual(res[3], 4);
                assert.strictEqual(res[4], 5);
              });
            });
          });
        });
      });
    });
    test("events", async function() {
      const queue = new async.Queue();
      let drained = false;
      const onDrained = Event.toPromise(queue.onDrained).then(() => drained = true);
      const res = [];
      const f1 = () => async.timeout(10).then(() => res.push(2));
      const f2 = () => async.timeout(20).then(() => res.push(4));
      const f3 = () => async.timeout(0).then(() => res.push(5));
      const q1 = queue.queue(f1);
      const q2 = queue.queue(f2);
      queue.queue(f3);
      q1.then(() => {
        assert.ok(!drained);
        q2.then(() => {
          assert.ok(!drained);
        });
      });
      await onDrained;
      assert.ok(drained);
    });
  });
  suite("ResourceQueue", () => {
    test("simple", async function() {
      const queue = new async.ResourceQueue();
      await queue.whenDrained();
      let done1 = false;
      queue.queueFor(URI.file("/some/path"), async () => {
        done1 = true;
      });
      await queue.whenDrained();
      assert.strictEqual(done1, true);
      let done2 = false;
      queue.queueFor(URI.file("/some/other/path"), async () => {
        done2 = true;
      });
      await queue.whenDrained();
      assert.strictEqual(done2, true);
      const w1 = new async.DeferredPromise();
      queue.queueFor(URI.file("/some/path"), () => w1.p);
      let drained = false;
      queue.whenDrained().then(() => drained = true);
      assert.strictEqual(drained, false);
      await w1.complete();
      await async.timeout(0);
      assert.strictEqual(drained, true);
      const w2 = new async.DeferredPromise();
      const w3 = new async.DeferredPromise();
      queue.queueFor(URI.file("/some/path"), () => w2.p);
      queue.queueFor(URI.file("/some/other/path"), () => w3.p);
      drained = false;
      queue.whenDrained().then(() => drained = true);
      queue.dispose();
      await async.timeout(0);
      assert.strictEqual(drained, true);
    });
  });
  suite("retry", () => {
    test("success case", async () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let counter = 0;
        const res = await async.retry(() => {
          counter++;
          if (counter < 2) {
            return Promise.reject(new Error("fail"));
          }
          return Promise.resolve(true);
        }, 10, 3);
        assert.strictEqual(res, true);
      });
    });
    test("error case", async () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        const expectedError = new Error("fail");
        try {
          await async.retry(() => {
            return Promise.reject(expectedError);
          }, 10, 3);
        } catch (error) {
          assert.strictEqual(error, error);
        }
      });
    });
  });
  suite("TaskSequentializer", () => {
    test("execution basics", async function() {
      const sequentializer = new async.TaskSequentializer();
      assert.ok(!sequentializer.isRunning());
      assert.ok(!sequentializer.hasQueued());
      assert.ok(!sequentializer.isRunning(2323));
      assert.ok(!sequentializer.running);
      await sequentializer.run(1, Promise.resolve());
      assert.ok(!sequentializer.isRunning());
      assert.ok(!sequentializer.isRunning(1));
      assert.ok(!sequentializer.running);
      assert.ok(!sequentializer.hasQueued());
      sequentializer.run(2, async.timeout(1));
      assert.ok(sequentializer.isRunning());
      assert.ok(sequentializer.isRunning(2));
      assert.ok(!sequentializer.hasQueued());
      assert.strictEqual(sequentializer.isRunning(1), false);
      assert.ok(sequentializer.running);
      await async.timeout(2);
      assert.strictEqual(sequentializer.isRunning(), false);
      assert.strictEqual(sequentializer.isRunning(2), false);
      assert.ok(!sequentializer.running);
    });
    test("executing and queued (finishes instantly)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let queuedDone = false;
      const res = sequentializer.queue(() => Promise.resolve(null).then(() => {
        queuedDone = true;
        return;
      }));
      assert.ok(sequentializer.hasQueued());
      await res;
      assert.ok(pendingDone);
      assert.ok(queuedDone);
      assert.ok(!sequentializer.hasQueued());
    });
    test("executing and queued (finishes after timeout)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let queuedDone = false;
      const res = sequentializer.queue(() => async.timeout(1).then(() => {
        queuedDone = true;
        return;
      }));
      await res;
      assert.ok(pendingDone);
      assert.ok(queuedDone);
      assert.ok(!sequentializer.hasQueued());
    });
    test("join (without executing or queued)", async function() {
      const sequentializer = new async.TaskSequentializer();
      await sequentializer.join();
      assert.ok(!sequentializer.hasQueued());
    });
    test("join (without queued)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      await sequentializer.join();
      assert.ok(pendingDone);
      assert.ok(!sequentializer.isRunning());
    });
    test("join (with executing and queued)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let queuedDone = false;
      sequentializer.queue(() => async.timeout(1).then(() => {
        queuedDone = true;
        return;
      }));
      await sequentializer.join();
      assert.ok(pendingDone);
      assert.ok(queuedDone);
      assert.ok(!sequentializer.isRunning());
      assert.ok(!sequentializer.hasQueued());
    });
    test("executing and multiple queued (last one wins)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let firstDone = false;
      const firstRes = sequentializer.queue(() => async.timeout(2).then(() => {
        firstDone = true;
        return;
      }));
      let secondDone = false;
      const secondRes = sequentializer.queue(() => async.timeout(3).then(() => {
        secondDone = true;
        return;
      }));
      let thirdDone = false;
      const thirdRes = sequentializer.queue(() => async.timeout(4).then(() => {
        thirdDone = true;
        return;
      }));
      await Promise.all([firstRes, secondRes, thirdRes]);
      assert.ok(pendingDone);
      assert.ok(!firstDone);
      assert.ok(!secondDone);
      assert.ok(thirdDone);
    });
    test("cancel executing", async function() {
      const sequentializer = new async.TaskSequentializer();
      const ctsTimeout = store.add(new CancellationTokenSource());
      let pendingCancelled = false;
      const timeout = async.timeout(1, ctsTimeout.token);
      sequentializer.run(1, timeout, () => pendingCancelled = true);
      sequentializer.cancelRunning();
      assert.ok(pendingCancelled);
      ctsTimeout.cancel();
    });
  });
  suite("disposableTimeout", () => {
    test("handler only success", async () => {
      let cb = false;
      const t = async.disposableTimeout(() => cb = true);
      await async.timeout(0);
      assert.strictEqual(cb, true);
      t.dispose();
    });
    test("handler only cancel", async () => {
      let cb = false;
      const t = async.disposableTimeout(() => cb = true);
      t.dispose();
      await async.timeout(0);
      assert.strictEqual(cb, false);
    });
    test("store managed success", async () => {
      let cb = false;
      const s = new DisposableStore();
      async.disposableTimeout(() => cb = true, 0, s);
      await async.timeout(0);
      assert.strictEqual(cb, true);
      s.dispose();
    });
    test("store managed cancel via disposable", async () => {
      let cb = false;
      const s = new DisposableStore();
      const t = async.disposableTimeout(() => cb = true, 0, s);
      t.dispose();
      await async.timeout(0);
      assert.strictEqual(cb, false);
      s.dispose();
    });
    test("store managed cancel via store", async () => {
      let cb = false;
      const s = new DisposableStore();
      async.disposableTimeout(() => cb = true, 0, s);
      s.dispose();
      await async.timeout(0);
      assert.strictEqual(cb, false);
    });
  });
  suite("disposableLongTimeout", () => {
    test("fires after a delay larger than the setTimeout maximum", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const t = async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY * 2 + 1e3);
        await async.timeout(async.MAX_TIMEOUT_DELAY * 2 + 2e3);
        assert.strictEqual(cb, true);
        t.dispose();
      });
    });
    test("does not fire after disposal mid-wait", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const t = async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY * 2);
        await async.timeout(async.MAX_TIMEOUT_DELAY);
        t.dispose();
        await async.timeout(async.MAX_TIMEOUT_DELAY * 2);
        assert.strictEqual(cb, false);
      });
    });
    test("store managed success evicts on fire", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const s = new DisposableStore();
        async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY + 500, s);
        await async.timeout(async.MAX_TIMEOUT_DELAY + 1e3);
        assert.strictEqual(cb, true);
        s.dispose();
      });
    });
    test("store managed cancel via store", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const s = new DisposableStore();
        async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY * 2, s);
        s.dispose();
        await async.timeout(async.MAX_TIMEOUT_DELAY * 2);
        assert.strictEqual(cb, false);
      });
    });
  });
  test("raceCancellation", async () => {
    const cts = store.add(new CancellationTokenSource());
    const ctsTimeout = store.add(new CancellationTokenSource());
    let triggered = false;
    const timeout = async.timeout(100, ctsTimeout.token);
    const p = async.raceCancellation(timeout.then(() => triggered = true), cts.token);
    cts.cancel();
    await p;
    assert.ok(!triggered);
    ctsTimeout.cancel();
  });
  test("raceTimeout", async () => {
    const cts = store.add(new CancellationTokenSource());
    let timedout = false;
    let triggered = false;
    const ctsTimeout1 = store.add(new CancellationTokenSource());
    const timeout1 = async.timeout(100, ctsTimeout1.token);
    const p1 = async.raceTimeout(timeout1.then(() => triggered = true), 1, () => timedout = true);
    cts.cancel();
    await p1;
    assert.ok(!triggered);
    assert.strictEqual(timedout, true);
    ctsTimeout1.cancel();
    timedout = false;
    const ctsTimeout2 = store.add(new CancellationTokenSource());
    const timeout2 = async.timeout(1, ctsTimeout2.token);
    const p2 = async.raceTimeout(timeout2.then(() => triggered = true), 100, () => timedout = true);
    cts.cancel();
    await p2;
    assert.ok(triggered);
    assert.strictEqual(timedout, false);
    ctsTimeout2.cancel();
  });
  test("SequencerByKey", async () => {
    const s = new async.SequencerByKey();
    const r1 = await s.queue("key1", () => Promise.resolve("hello"));
    assert.strictEqual(r1, "hello");
    await s.queue("key2", () => Promise.reject(new Error("failed"))).then(() => {
      throw new Error("should not be resolved");
    }, (err) => {
      assert.strictEqual(err.message, "failed");
    });
    const r3 = await s.queue("key2", () => Promise.resolve("hello"));
    assert.strictEqual(r3, "hello");
  });
  test("IntervalCounter", async () => {
    let now = 0;
    const counter = new async.IntervalCounter(5, () => now);
    assert.strictEqual(counter.increment(), 1);
    assert.strictEqual(counter.increment(), 2);
    assert.strictEqual(counter.increment(), 3);
    now = 10;
    assert.strictEqual(counter.increment(), 1);
    assert.strictEqual(counter.increment(), 2);
    assert.strictEqual(counter.increment(), 3);
  });
  suite("firstParallel", () => {
    test("simple", async () => {
      const a = await async.firstParallel([
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3)
      ], (v) => v === 2);
      assert.strictEqual(a, 2);
    });
    test("uses null default", async () => {
      assert.strictEqual(await async.firstParallel([Promise.resolve(1)], (v) => v === 2), null);
    });
    test("uses value default", async () => {
      assert.strictEqual(await async.firstParallel([Promise.resolve(1)], (v) => v === 2, 4), 4);
    });
    test("empty", async () => {
      assert.strictEqual(await async.firstParallel([], (v) => v === 2, 4), 4);
    });
    test("cancels", async () => {
      let ct1;
      const p1 = async.createCancelablePromise(async (ct) => {
        ct1 = ct;
        await async.timeout(200, ct);
        return 1;
      });
      let ct2;
      const p2 = async.createCancelablePromise(async (ct) => {
        ct2 = ct;
        await async.timeout(2, ct);
        return 2;
      });
      assert.strictEqual(await async.firstParallel([p1, p2], (v) => v === 2, 4), 2);
      assert.strictEqual(ct1.isCancellationRequested, true, "should cancel a");
      assert.strictEqual(ct2.isCancellationRequested, true, "should cancel b");
    });
    test("rejection handling", async () => {
      let ct1;
      const p1 = async.createCancelablePromise(async (ct) => {
        ct1 = ct;
        await async.timeout(200, ct);
        return 1;
      });
      let ct2;
      const p2 = async.createCancelablePromise(async (ct) => {
        ct2 = ct;
        await async.timeout(2, ct);
        throw new Error("oh no");
      });
      assert.strictEqual(await async.firstParallel([p1, p2], (v) => v === 2, 4).catch(() => "ok"), "ok");
      assert.strictEqual(ct1.isCancellationRequested, true, "should cancel a");
      assert.strictEqual(ct2.isCancellationRequested, true, "should cancel b");
    });
  });
  suite("DeferredPromise", () => {
    test("resolves", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isResolved, false);
      deferred.complete(42);
      assert.strictEqual(await deferred.p, 42);
      assert.strictEqual(deferred.isResolved, true);
    });
    test("rejects", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isRejected, false);
      const err = new Error("oh no!");
      deferred.error(err);
      assert.strictEqual(await deferred.p.catch((e) => e), err);
      assert.strictEqual(deferred.isRejected, true);
    });
    test("cancels", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isRejected, false);
      deferred.cancel();
      assert.strictEqual((await deferred.p.catch((e) => e)).name, "Canceled");
      assert.strictEqual(deferred.isRejected, true);
    });
    test("retains the original settled value", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isResolved, false);
      assert.strictEqual(deferred.value, void 0);
      deferred.complete(42);
      assert.strictEqual(await deferred.p, 42);
      assert.strictEqual(deferred.value, 42);
      assert.strictEqual(deferred.isResolved, true);
      deferred.complete(-1);
      assert.strictEqual(await deferred.p, 42);
      assert.strictEqual(deferred.value, 42);
      assert.strictEqual(deferred.isResolved, true);
    });
  });
  suite("Promises.settled", () => {
    test("resolves", async () => {
      const p1 = Promise.resolve(1);
      const p2 = async.timeout(1).then(() => 2);
      const p3 = async.timeout(2).then(() => 3);
      const result = await async.Promises.settled([p1, p2, p3]);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result[0], 1);
      assert.deepStrictEqual(result[1], 2);
      assert.deepStrictEqual(result[2], 3);
    });
    test("resolves in order", async () => {
      const p1 = async.timeout(2).then(() => 1);
      const p2 = async.timeout(1).then(() => 2);
      const p3 = Promise.resolve(3);
      const result = await async.Promises.settled([p1, p2, p3]);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result[0], 1);
      assert.deepStrictEqual(result[1], 2);
      assert.deepStrictEqual(result[2], 3);
    });
    test("rejects with first error but handles all promises (all errors)", async () => {
      const p1 = Promise.reject(1);
      let p2Handled = false;
      const p2Error = new Error("2");
      const p2 = async.timeout(1).then(() => {
        p2Handled = true;
        throw p2Error;
      });
      let p3Handled = false;
      const p3Error = new Error("3");
      const p3 = async.timeout(2).then(() => {
        p3Handled = true;
        throw p3Error;
      });
      let error = void 0;
      try {
        await async.Promises.settled([p1, p2, p3]);
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.notStrictEqual(error, p2Error);
      assert.notStrictEqual(error, p3Error);
      assert.ok(p2Handled);
      assert.ok(p3Handled);
    });
    test("rejects with first error but handles all promises (1 error)", async () => {
      const p1 = Promise.resolve(1);
      let p2Handled = false;
      const p2Error = new Error("2");
      const p2 = async.timeout(1).then(() => {
        p2Handled = true;
        throw p2Error;
      });
      let p3Handled = false;
      const p3 = async.timeout(2).then(() => {
        p3Handled = true;
        return 3;
      });
      let error = void 0;
      try {
        await async.Promises.settled([p1, p2, p3]);
      } catch (e) {
        error = e;
      }
      assert.strictEqual(error, p2Error);
      assert.ok(p2Handled);
      assert.ok(p3Handled);
    });
  });
  suite("Promises.withAsyncBody", () => {
    test("basics", async () => {
      const p1 = async.Promises.withAsyncBody(async (resolve, reject) => {
        resolve(1);
      });
      const p2 = async.Promises.withAsyncBody(async (resolve, reject) => {
        reject(new Error("error"));
      });
      const p3 = async.Promises.withAsyncBody(async (resolve, reject) => {
        throw new Error("error");
      });
      const r1 = await p1;
      assert.strictEqual(r1, 1);
      let e2 = void 0;
      try {
        await p2;
      } catch (error) {
        e2 = error;
      }
      assert.ok(e2 instanceof Error);
      let e3 = void 0;
      try {
        await p3;
      } catch (error) {
        e3 = error;
      }
      assert.ok(e3 instanceof Error);
    });
  });
  suite("ThrottledWorker", () => {
    function assertArrayEquals(actual, expected) {
      assert.strictEqual(actual.length, expected.length);
      for (let i = 0; i < actual.length; i++) {
        assert.strictEqual(actual[i], expected[i]);
      }
    }
    test("basics", async () => {
      let handled = [];
      let handledCallback;
      let handledPromise = new Promise((resolve) => handledCallback = resolve);
      let handledCounterToResolve = 1;
      let currentHandledCounter = 0;
      const handler = (units) => {
        handled.push(...units);
        currentHandledCounter++;
        if (currentHandledCounter === handledCounterToResolve) {
          handledCallback();
          handledPromise = new Promise((resolve) => handledCallback = resolve);
          currentHandledCounter = 0;
        }
      };
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: void 0,
        throttleDelay: 1
      }, handler));
      let worked = worker.work([1, 2, 3]);
      assertArrayEquals(handled, [1, 2, 3]);
      assert.strictEqual(worker.pending, 0);
      assert.strictEqual(worked, true);
      worker.work([4, 5]);
      worked = worker.work([6]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(worker.pending, 0);
      assert.strictEqual(worked, true);
      handled = [];
      handledCounterToResolve = 2;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 2);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7]);
      handled = [];
      handledCounterToResolve = 4;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 14);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      handled = [];
      handledCounterToResolve = 2;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 5);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      handled = [];
      handledCounterToResolve = 3;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 2);
      assert.strictEqual(worked, true);
      worker.work([8]);
      worked = worker.work([9, 10, 11]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 6);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.strictEqual(worker.pending, 0);
      handled = [];
      handledCounterToResolve = 2;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worked, true);
      worker.work([8]);
      worked = worker.work([9, 10]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
    test("do not accept too much work", async () => {
      const handled = [];
      const handler = (units) => handled.push(...units);
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: 5,
        throttleDelay: 1
      }, handler));
      let worked = worker.work([1, 2, 3]);
      assert.strictEqual(worked, true);
      worked = worker.work([1, 2, 3, 4, 5, 6]);
      assert.strictEqual(worked, true);
      assert.strictEqual(worker.pending, 1);
      worked = worker.work([7]);
      assert.strictEqual(worked, true);
      assert.strictEqual(worker.pending, 2);
      worked = worker.work([8, 9, 10, 11]);
      assert.strictEqual(worked, false);
      assert.strictEqual(worker.pending, 2);
    });
    test("do not accept too much work (account for max chunk size", async () => {
      const handled = [];
      const handler = (units) => handled.push(...units);
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: 5,
        throttleDelay: 1
      }, handler));
      let worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.strictEqual(worked, false);
      assert.strictEqual(worker.pending, 0);
      worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.strictEqual(worked, true);
      assert.strictEqual(worker.pending, 5);
    });
    test("disposed", async () => {
      const handled = [];
      const handler = (units) => handled.push(...units);
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: void 0,
        throttleDelay: 1
      }, handler));
      worker.dispose();
      const worked = worker.work([1, 2, 3]);
      assertArrayEquals(handled, []);
      assert.strictEqual(worker.pending, 0);
      assert.strictEqual(worked, false);
    });
  });
  suite("LimitedQueue", () => {
    test("basics (with long running task)", async () => {
      const limitedQueue = new async.LimitedQueue();
      let counter = 0;
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(limitedQueue.queue(async () => {
          counter = i;
          await async.timeout(1);
        }));
      }
      await Promise.all(promises);
      assert.strictEqual(counter, 4);
    });
    test("basics (with sync running task)", async () => {
      const limitedQueue = new async.LimitedQueue();
      let counter = 0;
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(limitedQueue.queue(async () => {
          counter = i;
        }));
      }
      await Promise.all(promises);
      assert.strictEqual(counter, 4);
    });
  });
  suite("AsyncIterableObject", function() {
    test("onReturn NOT called", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      for await (const item of iter) {
        assert.strictEqual(typeof item, "number");
      }
      assert.strictEqual(calledOnReturn, false);
    });
    test("onReturn called on break", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      for await (const item of iter) {
        assert.strictEqual(item, 1);
        break;
      }
      assert.strictEqual(calledOnReturn, true);
    });
    test("onReturn called on return", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      await (async function test2() {
        for await (const item of iter) {
          assert.strictEqual(item, 1);
          return;
        }
      })();
      assert.strictEqual(calledOnReturn, true);
    });
    test("onReturn called on throwing", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      try {
        for await (const item of iter) {
          assert.strictEqual(item, 1);
          throw new Error();
        }
      } catch (e) {
      }
      assert.strictEqual(calledOnReturn, true);
    });
  });
  suite("AsyncIterableSource", function() {
    test("onReturn is wired up", async function() {
      let calledOnReturn = false;
      const source = new async.AsyncIterableSource(() => {
        calledOnReturn = true;
      });
      source.emitOne(1);
      source.emitOne(2);
      source.emitOne(3);
      source.resolve();
      for await (const item of source.asyncIterable) {
        assert.strictEqual(item, 1);
        break;
      }
      assert.strictEqual(calledOnReturn, true);
    });
    test("onReturn is wired up 2", async function() {
      let calledOnReturn = false;
      const source = new async.AsyncIterableSource(() => {
        calledOnReturn = true;
      });
      source.emitOne(1);
      source.emitOne(2);
      source.emitOne(3);
      source.resolve();
      for await (const item of source.asyncIterable) {
        assert.strictEqual(typeof item, "number");
      }
      assert.strictEqual(calledOnReturn, false);
    });
    test("emitMany emits all items", async function() {
      const source = new async.AsyncIterableSource();
      const values = [10, 20, 30, 40];
      source.emitMany(values);
      source.resolve();
      const result = [];
      for await (const item of source.asyncIterable) {
        result.push(item);
      }
      assert.deepStrictEqual(result, values);
    });
  });
  suite("cancellableIterable", () => {
    let cts;
    setup(() => {
      cts = store.add(new CancellationTokenSource());
    });
    test("should iterate through all values when not canceled", async function() {
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          yield "a";
          yield "b";
          yield "c";
        }
      };
      const cancelableIterable = async.cancellableIterable(asyncIterable, cts.token);
      const result = await Iterable.asyncToArray(cancelableIterable);
      assert.deepStrictEqual(result, ["a", "b", "c"]);
    });
    test("should stop iteration immediately when cancelled before starting", async function() {
      const values = [];
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          values.push("iterator created");
          yield "a";
          values.push("after a");
          yield "b";
          values.push("after b");
          yield "c";
          values.push("after c");
        }
      };
      cts.cancel();
      const cancelableIterable = async.cancellableIterable(asyncIterable, cts.token);
      const result = await Iterable.asyncToArray(cancelableIterable);
      assert.deepStrictEqual(result, []);
      assert.deepStrictEqual(values, []);
    });
    test("should stop iteration when cancelled during iteration", async function() {
      const cts2 = new CancellationTokenSource();
      const deferredA = new async.DeferredPromise();
      const deferredB = new async.DeferredPromise();
      const deferredC = new async.DeferredPromise();
      const values = [];
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          values.push("a yielded");
          yield "a";
          await deferredA.p;
          values.push("b yielded");
          yield "b";
          await deferredB.p;
          values.push("c yielded");
          yield "c";
          await deferredC.p;
        }
      };
      for await (const value of async.cancellableIterable(asyncIterable, cts2.token)) {
        if (value === "a") {
          deferredA.complete();
        } else if (value === "b") {
          cts2.cancel();
          deferredB.complete();
        } else {
          throw new Error("Unexpected value");
        }
      }
      assert.deepStrictEqual(values, ["a yielded", "b yielded"]);
    });
    test("should handle return method correctly", async function() {
      let returnCalled = false;
      let n = 0;
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          try {
            yield "a";
            n++;
            yield "b";
            n++;
            yield "c";
            n++;
          } finally {
            returnCalled = true;
          }
        }
      };
      const originalIterable = asyncIterable[Symbol.asyncIterator]();
      originalIterable.return = async function() {
        returnCalled = true;
        return Promise.resolve({ done: true, value: void 0 });
      };
      const testIterable = {
        [Symbol.asyncIterator]: () => originalIterable
      };
      for await (const value of async.cancellableIterable(testIterable, cts.token)) {
        if (value === "b") {
          break;
        }
      }
      assert.strictEqual(returnCalled, true);
      assert.strictEqual(n < 2, true);
    });
  });
  suite("AsyncIterableProducer", () => {
    test("emitOne produces single values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        emitter.emitOne(3);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("emitMany produces multiple values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitMany([1, 2, 3]);
        emitter.emitMany([4, 5]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
    });
    test("mixed emitOne and emitMany", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitMany([2, 3]);
        emitter.emitOne(4);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("async executor with emitOne", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        await async.timeout(1);
        emitter.emitOne(2);
        await async.timeout(1);
        emitter.emitOne(3);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("async executor with emitMany", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitMany([1, 2]);
        await async.timeout(1);
        emitter.emitMany([3, 4]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("reject with error", async () => {
      const expectedError = new Error("test error");
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.reject(expectedError);
      });
      const result = [];
      let caughtError;
      try {
        for await (const item of producer) {
          result.push(item);
        }
      } catch (error) {
        caughtError = error;
      }
      assert.deepStrictEqual(result, [1]);
      assert.strictEqual(caughtError, expectedError);
    });
    test("async executor throws error", async () => {
      const expectedError = new Error("executor error");
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        throw expectedError;
      });
      const result = [];
      let caughtError;
      try {
        for await (const item of producer) {
          result.push(item);
        }
      } catch (error) {
        caughtError = error;
      }
      assert.deepStrictEqual(result, [1]);
      assert.strictEqual(caughtError, expectedError);
    });
    test("empty producer", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, []);
    });
    test("async executor resolves without emitting", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        await async.timeout(1);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, []);
    });
    test("multiple iterators on same producer", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitMany([1, 2, 3]);
      });
      const result1 = [];
      for await (const item of producer) {
        result1.push(item);
      }
      const result2 = [];
      for await (const item of producer) {
        result2.push(item);
      }
      assert.deepStrictEqual(result1, [1, 2, 3]);
      assert.deepStrictEqual(result2, []);
    });
    test("concurrent iteration", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        await async.timeout(1);
        emitter.emitOne(2);
        await async.timeout(1);
        emitter.emitOne(3);
      });
      const iterator1 = producer[Symbol.asyncIterator]();
      const iterator2 = producer[Symbol.asyncIterator]();
      const first1 = await iterator1.next();
      const first2 = await iterator2.next();
      const second1 = await iterator1.next();
      const second2 = await iterator2.next();
      assert.strictEqual(first1.value, 1);
      assert.strictEqual(first2.value, 2);
      assert.strictEqual(second1.value, 3);
      assert.strictEqual(second2.done, true);
    });
    test("executor with promise return value", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        return Promise.resolve();
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2]);
    });
    test("executor with non-promise return value", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        return "some value";
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2]);
    });
    test("emitMany with empty array", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitMany([]);
        emitter.emitOne(2);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2]);
    });
    test("reject immediately without emitting", async () => {
      const expectedError = new Error("immediate error");
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.reject(expectedError);
      });
      let caughtError;
      try {
        for await (const _item of producer) {
          assert.fail("Should not iterate when rejected immediately");
        }
      } catch (error) {
        caughtError = error;
      }
      assert.strictEqual(caughtError, expectedError);
    });
    test("string values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne("hello");
        emitter.emitMany(["world", "test"]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, ["hello", "world", "test"]);
    });
    test("object values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne({ id: 1, name: "first" });
        emitter.emitMany([
          { id: 2, name: "second" },
          { id: 3, name: "third" }
        ]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [
        { id: 1, name: "first" },
        { id: 2, name: "second" },
        { id: 3, name: "third" }
      ]);
    });
    test("tee - both iterators receive all values", async () => {
      async function* sourceGenerator() {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      }
      const [iter1, iter2] = async.AsyncIterableProducer.tee(sourceGenerator());
      const result1 = [];
      const result2 = [];
      await Promise.all([
        (async () => {
          for await (const item of iter1) {
            result1.push(item);
          }
        })(),
        (async () => {
          for await (const item of iter2) {
            result2.push(item);
          }
        })()
      ]);
      assert.deepStrictEqual(result1, [1, 2, 3, 4, 5]);
      assert.deepStrictEqual(result2, [1, 2, 3, 4, 5]);
    });
    test("tee - sequential consumption", async () => {
      const source = new async.AsyncIterableProducer((emitter) => {
        emitter.emitMany([1, 2, 3]);
      });
      const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
      const result1 = [];
      for await (const item of iter1) {
        result1.push(item);
      }
      const result2 = [];
      for await (const item of iter2) {
        result2.push(item);
      }
      assert.deepStrictEqual(result1, [1, 2, 3]);
      assert.deepStrictEqual(result2, [1, 2, 3]);
    });
    test.skip("tee - empty source", async () => {
      const source = new async.AsyncIterableProducer((emitter) => {
      });
      const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
      const result1 = [];
      const result2 = [];
      await Promise.all([
        (async () => {
          for await (const item of iter1) {
            result1.push(item);
          }
        })(),
        (async () => {
          for await (const item of iter2) {
            result2.push(item);
          }
        })()
      ]);
      assert.deepStrictEqual(result1, []);
      assert.deepStrictEqual(result2, []);
    });
    test.skip("tee - handles errors in source", async () => {
      const expectedError = new Error("source error");
      const source = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        throw expectedError;
      });
      const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
      let error1;
      let error2;
      const result1 = [];
      const result2 = [];
      await Promise.all([
        (async () => {
          try {
            for await (const item of iter1) {
              result1.push(item);
            }
          } catch (e) {
            error1 = e;
          }
        })(),
        (async () => {
          try {
            for await (const item of iter2) {
              result2.push(item);
            }
          } catch (e) {
            error2 = e;
          }
        })()
      ]);
      assert.deepStrictEqual(result1, [1, 2]);
      assert.deepStrictEqual(result2, [1, 2]);
      assert.strictEqual(error1, expectedError);
      assert.strictEqual(error2, expectedError);
    });
  });
  suite("AsyncReader", () => {
    async function* createAsyncIterator(values) {
      for (const value of values) {
        yield value;
      }
    }
    async function* createDelayedAsyncIterator(values, delayMs = 1) {
      for (const value of values) {
        await async.timeout(delayMs);
        yield value;
      }
    }
    test("read - basic functionality", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.read(), 2);
      assert.strictEqual(await reader.read(), 3);
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("read - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("endOfStream property", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2]));
      assert.strictEqual(reader.endOfStream, false);
      await reader.read();
      assert.strictEqual(reader.endOfStream, false);
      await reader.read();
      assert.strictEqual(reader.endOfStream, false);
      await reader.read();
      assert.strictEqual(reader.endOfStream, true);
    });
    test("peek - basic functionality", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      assert.strictEqual(await reader.peek(), 1);
      assert.strictEqual(await reader.peek(), 1);
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.peek(), 2);
      assert.strictEqual(await reader.read(), 2);
    });
    test("peek - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      assert.strictEqual(await reader.peek(), async.AsyncReaderEndOfStream);
    });
    test("readSyncOrThrow - throws when no data available", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1]));
      await reader.read();
      assert.throws(() => reader.readBufferedOrThrow());
    });
    test("readSyncOrThrow - returns end of stream when at end", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      await reader.read();
      assert.strictEqual(reader.readBufferedOrThrow(), async.AsyncReaderEndOfStream);
    });
    test("peekSyncOrThrow - with buffered data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      await reader.peek();
      assert.strictEqual(reader.peekBufferedOrThrow(), 1);
      assert.strictEqual(reader.peekBufferedOrThrow(), 1);
    });
    test("peekSyncOrThrow - throws when no data available", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1]));
      assert.throws(() => reader.peekBufferedOrThrow());
    });
    test("peekSyncOrThrow - returns end of stream when at end", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      await reader.peek();
      assert.strictEqual(reader.peekBufferedOrThrow(), async.AsyncReaderEndOfStream);
    });
    test("consumeToEnd - consumes all remaining data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5]));
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.read(), 2);
      await reader.consumeToEnd();
      assert.strictEqual(reader.endOfStream, true);
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("consumeToEnd - on empty reader", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      await reader.consumeToEnd();
      assert.strictEqual(reader.endOfStream, true);
    });
    test("readWhile - basic functionality", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5]));
      const collected = [];
      await reader.readWhile(
        (value) => value < 4,
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, [1, 2, 3]);
      assert.strictEqual(await reader.read(), 4);
    });
    test("readWhile - stops at end of stream", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      const collected = [];
      await reader.readWhile(
        (value) => value < 10,
        // Always true
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, [1, 2, 3]);
      assert.strictEqual(reader.endOfStream, true);
    });
    test("readWhile - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      const collected = [];
      await reader.readWhile(
        (value) => true,
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, []);
    });
    test("readWhile - predicate returns false immediately", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      const collected = [];
      await reader.readWhile(
        (value) => false,
        // Always false
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, []);
      assert.strictEqual(await reader.read(), 1);
    });
    test("peekTimeout - with immediate data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      const result = await reader.peekTimeout(100);
      assert.strictEqual(result, 1);
    });
    test("peekTimeout - with delayed data", async () => {
      const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 10));
      const result = await reader.peekTimeout(50);
      assert.strictEqual(result, 1);
    });
    test("peekTimeout - timeout occurs", async () => {
      return runWithFakedTimers({}, async () => {
        const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 50));
        const result = await reader.peekTimeout(10);
        assert.strictEqual(result, void 0);
        await reader.consumeToEnd();
      });
    });
    test("peekTimeout - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      const result = await reader.peekTimeout(10);
      assert.strictEqual(result, async.AsyncReaderEndOfStream);
    });
    test("peekTimeout - after consuming all data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1]));
      await reader.consumeToEnd();
      const result = await reader.peekTimeout(10);
      assert.strictEqual(result, async.AsyncReaderEndOfStream);
    });
    test("mixed operations - complex scenario", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      assert.strictEqual(await reader.peek(), 1);
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.read(), 2);
      assert.strictEqual(await reader.peek(), 3);
      const collected = [];
      await reader.readWhile(
        (value) => value <= 5,
        async (value) => collected.push(value)
      );
      assert.deepStrictEqual(collected, [3, 4, 5]);
      assert.strictEqual(await reader.peek(), 6);
      assert.strictEqual(reader.peekBufferedOrThrow(), 6);
      assert.strictEqual(reader.readBufferedOrThrow(), 6);
      await reader.consumeToEnd();
      assert.strictEqual(reader.endOfStream, true);
    });
    test("string values", async () => {
      const reader = new async.AsyncReader(createAsyncIterator(["hello", "world", "test"]));
      assert.strictEqual(await reader.read(), "hello");
      assert.strictEqual(await reader.peek(), "world");
      assert.strictEqual(await reader.read(), "world");
      assert.strictEqual(await reader.read(), "test");
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("object values", async () => {
      const objects = [
        { id: 1, name: "first" },
        { id: 2, name: "second" },
        { id: 3, name: "third" }
      ];
      const reader = new async.AsyncReader(createAsyncIterator(objects));
      assert.deepStrictEqual(await reader.read(), { id: 1, name: "first" });
      assert.deepStrictEqual(await reader.peek(), { id: 2, name: "second" });
      assert.deepStrictEqual(await reader.read(), { id: 2, name: "second" });
    });
    test("concurrent operations", async () => {
      const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 5));
      const peekPromise = reader.peek();
      const readPromise = reader.read();
      const [peekResult, readResult] = await Promise.all([peekPromise, readPromise]);
      assert.strictEqual(peekResult, 1);
      assert.strictEqual(readResult, 1);
      assert.strictEqual(await reader.read(), 2);
    });
    test("buffer management - single extend buffer call", async () => {
      let nextCallCount = 0;
      const mockIterator = {
        async next() {
          nextCallCount++;
          if (nextCallCount === 1) {
            await async.timeout(1);
            return { value: 1, done: false };
          }
          return { value: void 0, done: true };
        }
      };
      const reader = new async.AsyncReader(mockIterator);
      const promises = [
        reader.peek(),
        reader.peek(),
        reader.read()
      ];
      await Promise.all(promises);
      assert.strictEqual(nextCallCount, 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGFzeW5jLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBhc3luYyBmcm9tICcuLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0ICogYXMgTWljcm90YXNrRGVsYXkgZnJvbSAnLi4vLi4vY29tbW9uL3N5bWJvbHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5zdWl0ZSgnQXN5bmMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnY2FuY2VsYWJsZVByb21pc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnc2V0IHRva2VuLCBkb25cXCd0IHdhaXQgZm9yIGlubmVyIHByb21pc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY2FuY2VsZWQgPSAwO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKF8gPT4geyBjYW5jZWxlZCArPSAxOyB9KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgLypuZXZlciovIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwcm9taXNlLnRoZW4oXyA9PiBhc3NlcnQub2soZmFsc2UpLCBlcnIgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQub2soaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKTtcblx0XHRcdH0pO1xuXHRcdFx0cHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdHByb21pc2UuY2FuY2VsKCk7IC8vIGNhbmNlbCBvbmx5IG9uY2Vcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgZGVzcGl0ZSBpbm5lciBwcm9taXNlIGJlaW5nIHJlc29sdmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IGNhbmNlbGVkID0gMDtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBhc3luYy5jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChfID0+IHsgY2FuY2VsZWQgKz0gMTsgfSkpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKDEyMzQpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwcm9taXNlLnRoZW4oXyA9PiBhc3NlcnQub2soZmFsc2UpLCBlcnIgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQub2soaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKTtcblx0XHRcdH0pO1xuXHRcdFx0cHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgZGlzcG9zZXMgcmVzdWx0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdFx0fSk7XG5cdFx0XHRwcm9taXNlLnRoZW4oXyA9PiBhc3NlcnQub2soZmFsc2UpLCBlcnIgPT4ge1xuXG5cdFx0XHRcdGFzc2VydC5vayhpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpO1xuXHRcdFx0XHRhc3NlcnQub2soc3RvcmUuaXNEaXNwb3NlZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cHJvbWlzZS5jYW5jZWwoKTtcblx0XHR9KTtcblxuXHRcdC8vIENhbmNlbGxpbmcgYSBzeW5jIGNhbmNlbGFibGUgcHJvbWlzZSB3aWxsIGZpcmUgdGhlIGNhbmNlbGxlZCB0b2tlbi5cblx0XHQvLyBBbHNvLCBldmVyeSBgdGhlbmAgY2FsbGJhY2sgcnVucyBpbiBhbm90aGVyIGV4ZWN1dGlvbiBmcmFtZS5cblx0XHR0ZXN0KCdleGVjdXRpb24gb3JkZXIgKHN5bmMpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGNhbmNlbGxhYmxlUHJvbWlzZSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0b3JkZXIucHVzaCgnaW4gY2FsbGJhY2snKTtcblx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKF8gPT4gb3JkZXIucHVzaCgnY2FuY2VsbGVkJykpKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgxMjM0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRvcmRlci5wdXNoKCdhZnRlckNyZWF0ZScpO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gY2FuY2VsbGFibGVQcm9taXNlXG5cdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgZXJyID0+IG51bGwpXG5cdFx0XHRcdC50aGVuKCgpID0+IG9yZGVyLnB1c2goJ2ZpbmFsbHknKSk7XG5cblx0XHRcdGNhbmNlbGxhYmxlUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdG9yZGVyLnB1c2goJ2FmdGVyQ2FuY2VsJyk7XG5cblx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4oKCkgPT4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlciwgWydpbiBjYWxsYmFjaycsICdhZnRlckNyZWF0ZScsICdjYW5jZWxsZWQnLCAnYWZ0ZXJDYW5jZWwnLCAnZmluYWxseSddKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBDYW5jZWxsaW5nIGFuIGFzeW5jIGNhbmNlbGFibGUgcHJvbWlzZSBpcyBqdXN0IHRoZSBzYW1lIGFzIGEgc3luYyBjYW5jZWxsYWJsZSBwcm9taXNlLlxuXHRcdHRlc3QoJ2V4ZWN1dGlvbiBvcmRlciAoYXN5bmMpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGNhbmNlbGxhYmxlUHJvbWlzZSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0b3JkZXIucHVzaCgnaW4gY2FsbGJhY2snKTtcblx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKF8gPT4gb3JkZXIucHVzaCgnY2FuY2VsbGVkJykpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKGMgPT4gc2V0VGltZW91dChjLmJpbmQoMTIzNCksIDApKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRvcmRlci5wdXNoKCdhZnRlckNyZWF0ZScpO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gY2FuY2VsbGFibGVQcm9taXNlXG5cdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgZXJyID0+IG51bGwpXG5cdFx0XHRcdC50aGVuKCgpID0+IG9yZGVyLnB1c2goJ2ZpbmFsbHknKSk7XG5cblx0XHRcdGNhbmNlbGxhYmxlUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdG9yZGVyLnB1c2goJ2FmdGVyQ2FuY2VsJyk7XG5cblx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4oKCkgPT4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlciwgWydpbiBjYWxsYmFjaycsICdhZnRlckNyZWF0ZScsICdjYW5jZWxsZWQnLCAnYWZ0ZXJDYW5jZWwnLCAnZmluYWxseSddKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGVjdXRpb24gb3JkZXIgKGFzeW5jIHdpdGggbGF0ZSBsaXN0ZW5lciknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgY2FuY2VsbGFibGVQcm9taXNlID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRvcmRlci5wdXNoKCdpbiBjYWxsYmFjaycpO1xuXG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChfID0+IG9yZGVyLnB1c2goJ2NhbmNlbGxlZCcpKSk7XG5cdFx0XHRcdGNhbmNlbGxhYmxlUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0b3JkZXIucHVzaCgnYWZ0ZXJDYW5jZWwnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRvcmRlci5wdXNoKCdhZnRlckNyZWF0ZScpO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gY2FuY2VsbGFibGVQcm9taXNlXG5cdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgZXJyID0+IG51bGwpXG5cdFx0XHRcdC50aGVuKCgpID0+IG9yZGVyLnB1c2goJ2ZpbmFsbHknKSk7XG5cblx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4oKCkgPT4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlciwgWydpbiBjYWxsYmFjaycsICdhZnRlckNyZWF0ZScsICdjYW5jZWxsZWQnLCAnYWZ0ZXJDYW5jZWwnLCAnZmluYWxseSddKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXQgaW5uZXIgcmVzdWx0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0cmV0dXJuIGFzeW5jLnRpbWVvdXQoMTIpLnRoZW4oXyA9PiAxMjM0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9taXNlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMTIzNCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyYWNlQ2FuY2VsbGFibGVQcm9taXNlcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgdGhlIHJlc3VsdCBhbmQgY2FuY2VscyBvbmx5IHRoZSBsb3NpbmcgcHJvbWlzZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgcmVzb2x2ZVdpbm5lciE6ICh2YWx1ZTogbnVtYmVyKSA9PiB2b2lkO1xuXHRcdFx0bGV0IHdpbm5lckNhbmNlbGxhdGlvbnMgPSAwO1xuXHRcdFx0bGV0IGxvc2VyQ2FuY2VsbGF0aW9ucyA9IDA7XG5cdFx0XHRjb25zdCB3aW5uZXIgPSBPYmplY3QuYXNzaWduKG5ldyBQcm9taXNlPG51bWJlcj4ocmVzb2x2ZSA9PiByZXNvbHZlV2lubmVyID0gcmVzb2x2ZSksIHsgY2FuY2VsOiAoKSA9PiB3aW5uZXJDYW5jZWxsYXRpb25zKysgfSk7XG5cdFx0XHRjb25zdCBsb3NlciA9IE9iamVjdC5hc3NpZ24obmV3IFByb21pc2U8bnVtYmVyPigoKSA9PiB7IH0pLCB7IGNhbmNlbDogKCkgPT4gbG9zZXJDYW5jZWxsYXRpb25zKysgfSk7XG5cdFx0XHRjb25zdCByYWNlID0gYXN5bmMucmFjZUNhbmNlbGxhYmxlUHJvbWlzZXMoW3dpbm5lciwgbG9zZXJdKTtcblxuXHRcdFx0cmVzb2x2ZVdpbm5lcig0Mik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IGF3YWl0IHJhY2UsXG5cdFx0XHRcdHdpbm5lckNhbmNlbGxhdGlvbnMsXG5cdFx0XHRcdGxvc2VyQ2FuY2VsbGF0aW9uc1xuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IDQyLFxuXHRcdFx0XHR3aW5uZXJDYW5jZWxsYXRpb25zOiAwLFxuXHRcdFx0XHRsb3NlckNhbmNlbGxhdGlvbnM6IDFcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHRoZSBlcnJvciwgY2FuY2VscyBhbGwgcHJvbWlzZXMsIGFuZCBoYW5kbGVzIGNsZWFudXAgcmVqZWN0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRFcnJvciA9IG5ldyBFcnJvcignZXhwZWN0ZWQnKTtcblx0XHRcdGxldCByZWplY3RpbmdQcm9taXNlQ2FuY2VsbGF0aW9ucyA9IDA7XG5cdFx0XHRsZXQgcGVuZGluZ1Byb21pc2VDYW5jZWxsYXRpb25zID0gMDtcblx0XHRcdGNvbnN0IHVuaGFuZGxlZFJlamVjdGlvbnM6IHVua25vd25bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgb25VbmhhbmRsZWRSZWplY3Rpb24gPSAocmVhc29uOiB1bmtub3duKSA9PiB1bmhhbmRsZWRSZWplY3Rpb25zLnB1c2gocmVhc29uKTtcblx0XHRcdGNvbnN0IG9uQnJvd3NlclVuaGFuZGxlZFJlamVjdGlvbiA9IChldmVudDogUHJvbWlzZVJlamVjdGlvbkV2ZW50KSA9PiBvblVuaGFuZGxlZFJlamVjdGlvbihldmVudC5yZWFzb24pO1xuXHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdGdsb2JhbFRoaXMuYWRkRXZlbnRMaXN0ZW5lcigndW5oYW5kbGVkcmVqZWN0aW9uJywgb25Ccm93c2VyVW5oYW5kbGVkUmVqZWN0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIG9uVW5oYW5kbGVkUmVqZWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlamVjdGluZ1Byb21pc2UgPSBPYmplY3QuYXNzaWduKFByb21pc2UucmVqZWN0KGV4cGVjdGVkRXJyb3IpLCB7IGNhbmNlbDogKCkgPT4gcmVqZWN0aW5nUHJvbWlzZUNhbmNlbGxhdGlvbnMrKyB9KTtcblx0XHRcdGNvbnN0IHBlbmRpbmdQcm9taXNlID0gT2JqZWN0LmFzc2lnbihuZXcgUHJvbWlzZTx2b2lkPigoKSA9PiB7IH0pLCB7IGNhbmNlbDogKCkgPT4gcGVuZGluZ1Byb21pc2VDYW5jZWxsYXRpb25zKysgfSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCBhY3R1YWxFcnJvcjogdW5rbm93bjtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBhc3luYy5yYWNlQ2FuY2VsbGFibGVQcm9taXNlcyhbcmVqZWN0aW5nUHJvbWlzZSwgcGVuZGluZ1Byb21pc2VdKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRhY3R1YWxFcnJvciA9IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHByZXNlcnZlc0Vycm9yOiBhY3R1YWxFcnJvciA9PT0gZXhwZWN0ZWRFcnJvcixcblx0XHRcdFx0XHRyZWplY3RpbmdQcm9taXNlQ2FuY2VsbGF0aW9ucyxcblx0XHRcdFx0XHRwZW5kaW5nUHJvbWlzZUNhbmNlbGxhdGlvbnMsXG5cdFx0XHRcdFx0dW5oYW5kbGVkUmVqZWN0aW9uc1xuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0cHJlc2VydmVzRXJyb3I6IHRydWUsXG5cdFx0XHRcdFx0cmVqZWN0aW5nUHJvbWlzZUNhbmNlbGxhdGlvbnM6IDEsXG5cdFx0XHRcdFx0cGVuZGluZ1Byb21pc2VDYW5jZWxsYXRpb25zOiAxLFxuXHRcdFx0XHRcdHVuaGFuZGxlZFJlamVjdGlvbnM6IFtdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdFx0Z2xvYmFsVGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKCd1bmhhbmRsZWRyZWplY3Rpb24nLCBvbkJyb3dzZXJVbmhhbmRsZWRSZWplY3Rpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb2Nlc3Mub2ZmKCd1bmhhbmRsZWRSZWplY3Rpb24nLCBvblVuaGFuZGxlZFJlamVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cGxpY2l0IGNhbmNlbGxhdGlvbiBjYW5jZWxzIGFsbCBwZW5kaW5nIHByb21pc2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uQ291bnRzID0gWzAsIDBdO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBjYW5jZWxsYXRpb25Db3VudHMubWFwKChfLCBpbmRleCkgPT4gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY2FuY2VsbGF0aW9uQ291bnRzW2luZGV4XSsrKSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoKSA9PiB7IH0pO1xuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmFjZSA9IGFzeW5jLnJhY2VDYW5jZWxsYWJsZVByb21pc2VzKHByb21pc2VzKTtcblxuXHRcdFx0cmFjZS5jYW5jZWwoKTtcblx0XHRcdGxldCBjYW5jZWxsYXRpb25FcnJvcjogdW5rbm93bjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJhY2U7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjYW5jZWxsYXRpb25FcnJvciA9IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNDYW5jZWxsYXRpb25FcnJvcjogaXNDYW5jZWxsYXRpb25FcnJvcihjYW5jZWxsYXRpb25FcnJvciksXG5cdFx0XHRcdGNhbmNlbGxhdGlvbkNvdW50c1xuXHRcdFx0fSwge1xuXHRcdFx0XHRpc0NhbmNlbGxhdGlvbkVycm9yOiB0cnVlLFxuXHRcdFx0XHRjYW5jZWxsYXRpb25Db3VudHM6IFsxLCAxXVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaHJvdHRsZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnbm9uIGFzeW5jJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKytjb3VudCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0aHJvdHRsZXIgPSBuZXcgYXN5bmMuVGhyb3R0bGVyKCk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7IH0pLFxuXHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDIpOyB9KSxcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAyKTsgfSksXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMik7IH0pLFxuXHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDIpOyB9KVxuXHRcdFx0XSkudGhlbigoKSA9PiBhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FzeW5jJywgKCkgPT4ge1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAoKSA9PiBhc3luYy50aW1lb3V0KDApLnRoZW4oKCkgPT4gKytjb3VudCk7XG5cblx0XHRcdGNvbnN0IHRocm90dGxlciA9IG5ldyBhc3luYy5UaHJvdHRsZXIoKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgfSksXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMik7IH0pLFxuXHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDIpOyB9KSxcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAyKTsgfSksXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMik7IH0pXG5cdFx0XHRdKS50aGVuKCgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDMpOyB9KSxcblx0XHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDQpOyB9KSxcblx0XHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDQpOyB9KSxcblx0XHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDQpOyB9KSxcblx0XHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDQpOyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGFzdCBmYWN0b3J5IHNob3VsZCBiZSB0aGUgb25lIGdldHRpbmcgY2FsbGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZmFjdG9yeUZhY3RvcnkgPSAobjogbnVtYmVyKSA9PiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBhc3luYy50aW1lb3V0KDApLnRoZW4oKCkgPT4gbik7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0aHJvdHRsZXIgPSBuZXcgYXN5bmMuVGhyb3R0bGVyKCk7XG5cblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKHRocm90dGxlci5xdWV1ZShmYWN0b3J5RmFjdG9yeSgxKSkudGhlbigobikgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwobiwgMSk7IH0pKTtcblx0XHRcdHByb21pc2VzLnB1c2godGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnlGYWN0b3J5KDIpKS50aGVuKChuKSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChuLCAzKTsgfSkpO1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aHJvdHRsZXIucXVldWUoZmFjdG9yeUZhY3RvcnkoMykpLnRoZW4oKG4pID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKG4sIDMpOyB9KSk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NhbCBhZnRlciBxdWV1ZWluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBmYWN0b3J5Q2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZmFjdG9yeUNhbGxzKys7XG5cdFx0XHRcdHJldHVybiBhc3luYy50aW1lb3V0KDApO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdGhyb3R0bGVyID0gbmV3IGFzeW5jLlRocm90dGxlcigpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRcdHByb21pc2VzLnB1c2godGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpKTtcblx0XHRcdHByb21pc2VzLnB1c2godGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpKTtcblx0XHRcdHRocm90dGxlci5kaXNwb3NlKCk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWN0b3J5Q2FsbHMsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zYWwgYmVmb3JlIHF1ZXVlaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGZhY3RvcnlDYWxscyA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRmYWN0b3J5Q2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0aHJvdHRsZXIgPSBuZXcgYXN5bmMuVGhyb3R0bGVyKCk7XG5cdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuXHRcdFx0dGhyb3R0bGVyLmRpc3Bvc2UoKTtcblx0XHRcdHByb21pc2VzLnB1c2godGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIGZhaWwnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFjdG9yeUNhbGxzLCAwKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0RlbGF5ZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKytjb3VudCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWxheWVyID0gbmV3IGFzeW5jLkRlbGF5ZXIoMCk7XG5cdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuXHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7IGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTsgfSkpO1xuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgYXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpOyB9KSk7XG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpOyBhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7IH0pKTtcblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pY3JvdGFzayBkZWxheSBzaW1wbGUnLCAoKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgYXN5bmMuRGVsYXllcihNaWNyb3Rhc2tEZWxheS5NaWNyb3Rhc2tEZWxheSk7XG5cdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuXHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7IGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTsgfSkpO1xuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgYXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpOyB9KSk7XG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpOyBhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7IH0pKTtcblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdUaHJvdHRsZWREZWxheWVyJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncHJvbWlzZSBzaG91bGQgcmVzb2x2ZSBpZiBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkRGVsYXllciA9IG5ldyBhc3luYy5UaHJvdHRsZWREZWxheWVyPHZvaWQ+KDEwMCk7XG5cdFx0XHRcdGNvbnN0IHByb21pc2UgPSB0aHJvdHRsZWREZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4geyB9LCAwKTtcblx0XHRcdFx0dGhyb3R0bGVkRGVsYXllci5kaXNwb3NlKCk7XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCdTSE9VTEQgTk9UIEJFIEhFUkUnKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gT0tcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3RyaWdnZXIgYWZ0ZXIgZGlzcG9zZSB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZERlbGF5ZXIgPSBuZXcgYXN5bmMuVGhyb3R0bGVkRGVsYXllcjx2b2lkPigxMDApO1xuXHRcdFx0XHR0aHJvdHRsZWREZWxheWVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gdGhyb3R0bGVkRGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHsgfSwgMCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUgY2FuY2VsJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKytjb3VudCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWxheWVyID0gbmV3IGFzeW5jLkRlbGF5ZXIoMCk7XG5cblx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0Y29uc3QgcCA9IGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KGZhbHNlKTtcblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KHRydWUsICd5ZXMsIGl0IHdhcyBjYW5jZWxsZWQnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdGRlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHJldHVybiBwO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2ltcGxlIGNhbmNlbCBtaWNyb3Rhc2snLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgYXN5bmMuRGVsYXllcihNaWNyb3Rhc2tEZWxheS5NaWNyb3Rhc2tEZWxheSk7XG5cblx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0Y29uc3QgcCA9IGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KGZhbHNlKTtcblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KHRydWUsICd5ZXMsIGl0IHdhcyBjYW5jZWxsZWQnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdGRlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHJldHVybiBwO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsIHNob3VsZCBjYW5jZWwgYWxsIGNhbGxzIHRvIHRyaWdnZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgYXN5bmMuRGVsYXllcigwKTtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4odW5kZWZpbmVkLCAoKSA9PiB7IGFzc2VydCh0cnVlLCAneWVzLCBpdCB3YXMgY2FuY2VsbGVkJyk7IH0pKTtcblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKHVuZGVmaW5lZCwgKCkgPT4geyBhc3NlcnQodHJ1ZSwgJ3llcywgaXQgd2FzIGNhbmNlbGxlZCcpOyB9KSk7XG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbih1bmRlZmluZWQsICgpID0+IHsgYXNzZXJ0KHRydWUsICd5ZXMsIGl0IHdhcyBjYW5jZWxsZWQnKTsgfSkpO1xuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdGRlbGF5ZXIuY2FuY2VsKCk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpZ2dlciwgY2FuY2VsLCB0aGVuIHRyaWdnZXIgYWdhaW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgYXN5bmMuRGVsYXllcigwKTtcblx0XHRcdGxldCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuXHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRjb25zdCBwID0gZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTtcblx0XHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4odW5kZWZpbmVkLCAoKSA9PiB7IGFzc2VydCh0cnVlLCAneWVzLCBpdCB3YXMgY2FuY2VsbGVkJyk7IH0pKTtcblx0XHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbih1bmRlZmluZWQsICgpID0+IHsgYXNzZXJ0KHRydWUsICd5ZXMsIGl0IHdhcyBjYW5jZWxsZWQnKTsgfSkpO1xuXHRcdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0XHRkZWxheWVyLmNhbmNlbCgpO1xuXG5cdFx0XHRcdGNvbnN0IHAgPSBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0cHJvbWlzZXMgPSBbXTtcblxuXHRcdFx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgYXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpOyB9KSk7XG5cdFx0XHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKCgpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7IGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTsgfSkpO1xuXHRcdFx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgcCA9IFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHA7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBwO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRyZXR1cm4gcDtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xhc3QgdGFzayBzaG91bGQgYmUgdGhlIG9uZSBnZXR0aW5nIGNhbGxlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGZhY3RvcnlGYWN0b3J5ID0gKG46IG51bWJlcikgPT4gKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG4pO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVsYXllciA9IG5ldyBhc3luYy5EZWxheWVyKDApO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeUZhY3RvcnkoMSkpLnRoZW4oKG4pID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKG4sIDMpOyB9KSk7XG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5RmFjdG9yeSgyKSkudGhlbigobikgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwobiwgMyk7IH0pKTtcblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnlGYWN0b3J5KDMpKS50aGVuKChuKSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChuLCAzKTsgfSkpO1xuXG5cdFx0XHRjb25zdCBwID0gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHJldHVybiBwO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFjdG9yeUZhY3RvcnkgPSAobjogbnVtYmVyKSA9PiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobik7XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gYXN5bmMuc2VxdWVuY2UoW1xuXHRcdFx0XHRmYWN0b3J5RmFjdG9yeSgxKSxcblx0XHRcdFx0ZmFjdG9yeUZhY3RvcnkoMiksXG5cdFx0XHRcdGZhY3RvcnlGYWN0b3J5KDMpLFxuXHRcdFx0XHRmYWN0b3J5RmFjdG9yeSg0KSxcblx0XHRcdFx0ZmFjdG9yeUZhY3RvcnkoNSksXG5cdFx0XHRdKS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDUsIHJlc3VsdC5sZW5ndGgpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMSwgcmVzdWx0WzBdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIHJlc3VsdFsxXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgzLCByZXN1bHRbMl0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoNCwgcmVzdWx0WzNdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDUsIHJlc3VsdFs0XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0xpbWl0ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnYXNzZXJ0IGRlZ3JlZSBvZiBwYXJhbGVsbGlzbScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBhY3RpdmVQcm9taXNlcyA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5RmFjdG9yeSA9IChuOiBudW1iZXIpID0+ICgpID0+IHtcblx0XHRcdFx0YWN0aXZlUHJvbWlzZXMrKztcblx0XHRcdFx0YXNzZXJ0KGFjdGl2ZVByb21pc2VzIDwgNik7XG5cdFx0XHRcdHJldHVybiBhc3luYy50aW1lb3V0KDApLnRoZW4oKCkgPT4geyBhY3RpdmVQcm9taXNlcy0tOyByZXR1cm4gbjsgfSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBsaW1pdGVyID0gbmV3IGFzeW5jLkxpbWl0ZXIoNSk7XG5cblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXHRcdFx0WzAsIDEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDldLmZvckVhY2gobiA9PiBwcm9taXNlcy5wdXNoKGxpbWl0ZXIucXVldWUoZmFjdG9yeUZhY3RvcnkobikpKSk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigocmVzKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgxMCwgcmVzLmxlbmd0aCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWzAsIDEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDldLCByZXMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0c3VpdGUoJ1F1ZXVlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGxldCBzeW5jUHJvbWlzZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZjEgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSkudGhlbigoKSA9PiBzeW5jUHJvbWlzZSA9IHRydWUpO1xuXG5cdFx0XHRsZXQgYXN5bmNQcm9taXNlID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmMiA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMTApLnRoZW4oKCkgPT4gYXN5bmNQcm9taXNlID0gdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWV1ZS5zaXplLCAwKTtcblxuXHRcdFx0cXVldWUucXVldWUoZjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDEpO1xuXG5cdFx0XHRjb25zdCBwID0gcXVldWUucXVldWUoZjIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDIpO1xuXHRcdFx0cmV0dXJuIHAudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWV1ZS5zaXplLCAwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHN5bmNQcm9taXNlKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFzeW5jUHJvbWlzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3AgcHJvY2Vzc2luZyBvbiBkaXNwb3NlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcXVldWUgPSBuZXcgYXN5bmMuUXVldWUoKTtcblxuXHRcdFx0bGV0IHdvcmtDb3VudGVyID0gMDtcblx0XHRcdGNvbnN0IHRhc2sgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHRcdHdvcmtDb3VudGVyKys7XG5cdFx0XHRcdHF1ZXVlLmRpc3Bvc2UoKTsgLy8gRElTUE9TRSBIRVJFXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwMSA9IHF1ZXVlLnF1ZXVlKHRhc2spO1xuXHRcdFx0cXVldWUucXVldWUodGFzayk7XG5cdFx0XHRxdWV1ZS5xdWV1ZSh0YXNrKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWV1ZS5zaXplLCAzKTtcblxuXG5cdFx0XHRhd2FpdCBwMTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtDb3VudGVyLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3Agb24gY2xlYXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRsZXQgd29ya0NvdW50ZXIgPSAwO1xuXHRcdFx0Y29uc3QgdGFzayA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblx0XHRcdFx0d29ya0NvdW50ZXIrKztcblx0XHRcdFx0cXVldWUuY2xlYXIoKTsgLy8gQ0xFQVIgSEVSRVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVldWUuc2l6ZSwgMSk7IC8vIFRISVMgdGFzayBpcyBzdGlsbCBydW5uaW5nXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwMSA9IHF1ZXVlLnF1ZXVlKHRhc2spO1xuXHRcdFx0cXVldWUucXVldWUodGFzayk7XG5cdFx0XHRxdWV1ZS5xdWV1ZSh0YXNrKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWV1ZS5zaXplLCAzKTtcblxuXHRcdFx0YXdhaXQgcDE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya0NvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDApOyAvLyBoYXMgYmVlbiBjbGVhcmVkXG5cblxuXHRcdFx0Y29uc3QgcDIgPSBxdWV1ZS5xdWV1ZSh0YXNrKTtcblx0XHRcdGF3YWl0IHAyO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtDb3VudGVyLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsZWFyIGFuZCBkcmFpbiAoMSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRsZXQgd29ya0NvdW50ZXIgPSAwO1xuXHRcdFx0Y29uc3QgdGFzayA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblx0XHRcdFx0d29ya0NvdW50ZXIrKztcblx0XHRcdFx0cXVldWUuY2xlYXIoKTsgLy8gQ0xFQVIgSEVSRVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcDAgPSBFdmVudC50b1Byb21pc2UocXVldWUub25EcmFpbmVkKTtcblx0XHRcdGNvbnN0IHAxID0gcXVldWUucXVldWUodGFzayk7XG5cblx0XHRcdGF3YWl0IHAxO1xuXHRcdFx0YXdhaXQgcDA7IC8vIGV4cGVjdCBkcmFpbiB0byBmaXJlIGJlY2F1c2UgYSB0YXNrIHdhcyBydW5uaW5nXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya0NvdW50ZXIsIDEpO1xuXHRcdFx0cXVldWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xlYXIgYW5kIGRyYWluICgyKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGxldCBkaWRGaXJlID0gZmFsc2U7XG5cdFx0XHRjb25zdCBkID0gcXVldWUub25EcmFpbmVkKCgpID0+IHtcblx0XHRcdFx0ZGlkRmlyZSA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0cXVldWUuY2xlYXIoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZEZpcmUsIGZhbHNlKTsgLy8gbm8gd29yaywgbm8gZHJhaW4hXG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdHF1ZXVlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RyYWluIHRpbWluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGNvbnN0IGxvZ2ljQ2xvY2sgPSBuZXcgY2xhc3Mge1xuXHRcdFx0XHRwcml2YXRlIHRpbWUgPSAwO1xuXHRcdFx0XHR0aWNrKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnRpbWUrKztcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0bGV0IGRpZERyYWluVGltZSA9IDA7XG5cdFx0XHRsZXQgZGlkRmluaXNoVGltZTEgPSAwO1xuXHRcdFx0bGV0IGRpZEZpbmlzaFRpbWUyID0gMDtcblx0XHRcdGNvbnN0IGQgPSBxdWV1ZS5vbkRyYWluZWQoKCkgPT4ge1xuXHRcdFx0XHRkaWREcmFpblRpbWUgPSBsb2dpY0Nsb2NrLnRpY2soKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwMSA9IHF1ZXVlLnF1ZXVlKCgpID0+IHtcblx0XHRcdFx0Ly8gYXdhaXQgYXN5bmMudGltZW91dCgxMCk7XG5cdFx0XHRcdGRpZEZpbmlzaFRpbWUxID0gbG9naWNDbG9jay50aWNrKCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwMiA9IHF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxMCk7XG5cdFx0XHRcdGRpZEZpbmlzaFRpbWUyID0gbG9naWNDbG9jay50aWNrKCk7XG5cdFx0XHR9KTtcblxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbcDEsIHAyXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRGaW5pc2hUaW1lMSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkRmluaXNoVGltZTIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZERyYWluVGltZSwgMik7XG5cblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0cXVldWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJhaW4gZXZlbnQgaXMgc2VuZCBvbmx5IG9uY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRsZXQgZHJhaW5Db3VudCA9IDA7XG5cdFx0XHRjb25zdCBkID0gcXVldWUub25EcmFpbmVkKCgpID0+IHsgZHJhaW5Db3VudCsrOyB9KTtcblx0XHRcdHF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHsgfSk7XG5cdFx0XHRxdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB7IH0pO1xuXHRcdFx0cXVldWUucXVldWUoYXN5bmMgKCkgPT4geyB9KTtcblx0XHRcdHF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHsgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhaW5Db3VudCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVldWUuc2l6ZSwgNCk7XG5cblx0XHRcdGF3YWl0IHF1ZXVlLndoZW5JZGxlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkcmFpbkNvdW50LCAxKTtcblxuXHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRxdWV1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvcmRlciBpcyBrZXB0JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRcdGNvbnN0IHJlczogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBmMSA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IHJlcy5wdXNoKDEpKTtcblx0XHRcdFx0Y29uc3QgZjIgPSAoKSA9PiBhc3luYy50aW1lb3V0KDEwKS50aGVuKCgpID0+IHJlcy5wdXNoKDIpKTtcblx0XHRcdFx0Y29uc3QgZjMgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSkudGhlbigoKSA9PiByZXMucHVzaCgzKSk7XG5cdFx0XHRcdGNvbnN0IGY0ID0gKCkgPT4gYXN5bmMudGltZW91dCgyMCkudGhlbigoKSA9PiByZXMucHVzaCg0KSk7XG5cdFx0XHRcdGNvbnN0IGY1ID0gKCkgPT4gYXN5bmMudGltZW91dCgwKS50aGVuKCgpID0+IHJlcy5wdXNoKDUpKTtcblxuXHRcdFx0XHRxdWV1ZS5xdWV1ZShmMSk7XG5cdFx0XHRcdHF1ZXVlLnF1ZXVlKGYyKTtcblx0XHRcdFx0cXVldWUucXVldWUoZjMpO1xuXHRcdFx0XHRxdWV1ZS5xdWV1ZShmNCk7XG5cdFx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmNSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgMSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgMik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgMyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1szXSwgNCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1s0XSwgNSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlcnJvcnMgYnViYmxlIGluZGl2aWR1YWxseSBidXQgbm90IGNhdXNlIHN0b3AnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRjb25zdCByZXM6IG51bWJlcltdID0gW107XG5cdFx0XHRsZXQgZXJyb3IgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgZjEgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSkudGhlbigoKSA9PiByZXMucHVzaCgxKSk7XG5cdFx0XHRjb25zdCBmMiA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMTApLnRoZW4oKCkgPT4gcmVzLnB1c2goMikpO1xuXHRcdFx0Y29uc3QgZjMgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSkudGhlbigoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2Vycm9yJykpKTtcblx0XHRcdGNvbnN0IGY0ID0gKCkgPT4gYXN5bmMudGltZW91dCgyMCkudGhlbigoKSA9PiByZXMucHVzaCg0KSk7XG5cdFx0XHRjb25zdCBmNSA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMCkudGhlbigoKSA9PiByZXMucHVzaCg1KSk7XG5cblx0XHRcdHF1ZXVlLnF1ZXVlKGYxKTtcblx0XHRcdHF1ZXVlLnF1ZXVlKGYyKTtcblx0XHRcdHF1ZXVlLnF1ZXVlKGYzKS50aGVuKHVuZGVmaW5lZCwgKCkgPT4gZXJyb3IgPSB0cnVlKTtcblx0XHRcdHF1ZXVlLnF1ZXVlKGY0KTtcblx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmNSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCAyKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbM10sIDUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvcmRlciBpcyBrZXB0IChjaGFpbmVkKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGNvbnN0IHJlczogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgZjEgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSkudGhlbigoKSA9PiByZXMucHVzaCgxKSk7XG5cdFx0XHRjb25zdCBmMiA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMTApLnRoZW4oKCkgPT4gcmVzLnB1c2goMikpO1xuXHRcdFx0Y29uc3QgZjMgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodHJ1ZSkudGhlbigoKSA9PiByZXMucHVzaCgzKSk7XG5cdFx0XHRjb25zdCBmNCA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMjApLnRoZW4oKCkgPT4gcmVzLnB1c2goNCkpO1xuXHRcdFx0Y29uc3QgZjUgPSAoKSA9PiBhc3luYy50aW1lb3V0KDApLnRoZW4oKCkgPT4gcmVzLnB1c2goNSkpO1xuXG5cdFx0XHRyZXR1cm4gcXVldWUucXVldWUoZjEpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcXVldWUucXVldWUoZjIpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmMykudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcXVldWUucXVldWUoZjQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcXVldWUucXVldWUoZjUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMF0sIDEpO1xuXHRcdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIDIpO1xuXHRcdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMl0sIDMpO1xuXHRcdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbM10sIDQpO1xuXHRcdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbNF0sIDUpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZlbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcXVldWUgPSBuZXcgYXN5bmMuUXVldWUoKTtcblxuXHRcdFx0bGV0IGRyYWluZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IG9uRHJhaW5lZCA9IEV2ZW50LnRvUHJvbWlzZShxdWV1ZS5vbkRyYWluZWQpLnRoZW4oKCkgPT4gZHJhaW5lZCA9IHRydWUpO1xuXG5cdFx0XHRjb25zdCByZXM6IG51bWJlcltdID0gW107XG5cblx0XHRcdGNvbnN0IGYxID0gKCkgPT4gYXN5bmMudGltZW91dCgxMCkudGhlbigoKSA9PiByZXMucHVzaCgyKSk7XG5cdFx0XHRjb25zdCBmMiA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMjApLnRoZW4oKCkgPT4gcmVzLnB1c2goNCkpO1xuXHRcdFx0Y29uc3QgZjMgPSAoKSA9PiBhc3luYy50aW1lb3V0KDApLnRoZW4oKCkgPT4gcmVzLnB1c2goNSkpO1xuXG5cdFx0XHRjb25zdCBxMSA9IHF1ZXVlLnF1ZXVlKGYxKTtcblx0XHRcdGNvbnN0IHEyID0gcXVldWUucXVldWUoZjIpO1xuXHRcdFx0cXVldWUucXVldWUoZjMpO1xuXG5cdFx0XHRxMS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFkcmFpbmVkKTtcblx0XHRcdFx0cTIudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKCFkcmFpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgb25EcmFpbmVkO1xuXHRcdFx0YXNzZXJ0Lm9rKGRyYWluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmVzb3VyY2VRdWV1ZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaW1wbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5SZXNvdXJjZVF1ZXVlKCk7XG5cblx0XHRcdGF3YWl0IHF1ZXVlLndoZW5EcmFpbmVkKCk7IC8vIHJldHVybnMgaW1tZWRpYXRlbHkgc2luY2UgZW1wdHlcblxuXHRcdFx0bGV0IGRvbmUxID0gZmFsc2U7XG5cdFx0XHRxdWV1ZS5xdWV1ZUZvcihVUkkuZmlsZSgnL3NvbWUvcGF0aCcpLCBhc3luYyAoKSA9PiB7IGRvbmUxID0gdHJ1ZTsgfSk7XG5cdFx0XHRhd2FpdCBxdWV1ZS53aGVuRHJhaW5lZCgpOyAvLyByZXR1cm5zIGltbWVkaWF0ZWx5IHNpbmNlIG5vIHdvcmsgc2NoZWR1bGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9uZTEsIHRydWUpO1xuXG5cdFx0XHRsZXQgZG9uZTIgPSBmYWxzZTtcblx0XHRcdHF1ZXVlLnF1ZXVlRm9yKFVSSS5maWxlKCcvc29tZS9vdGhlci9wYXRoJyksIGFzeW5jICgpID0+IHsgZG9uZTIgPSB0cnVlOyB9KTtcblx0XHRcdGF3YWl0IHF1ZXVlLndoZW5EcmFpbmVkKCk7IC8vIHJldHVybnMgaW1tZWRpYXRlbHkgc2luY2Ugbm8gd29yayBzY2hlZHVsZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb25lMiwgdHJ1ZSk7XG5cblx0XHRcdC8vIHNjaGVkdWxlIHNvbWUgd29ya1xuXHRcdFx0Y29uc3QgdzEgPSBuZXcgYXN5bmMuRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRxdWV1ZS5xdWV1ZUZvcihVUkkuZmlsZSgnL3NvbWUvcGF0aCcpLCAoKSA9PiB3MS5wKTtcblxuXHRcdFx0bGV0IGRyYWluZWQgPSBmYWxzZTtcblx0XHRcdHF1ZXVlLndoZW5EcmFpbmVkKCkudGhlbigoKSA9PiBkcmFpbmVkID0gdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhaW5lZCwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgdzEuY29tcGxldGUoKTtcblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdC8vIHNjaGVkdWxlIHNvbWUgd29ya1xuXHRcdFx0Y29uc3QgdzIgPSBuZXcgYXN5bmMuRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCB3MyA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdHF1ZXVlLnF1ZXVlRm9yKFVSSS5maWxlKCcvc29tZS9wYXRoJyksICgpID0+IHcyLnApO1xuXHRcdFx0cXVldWUucXVldWVGb3IoVVJJLmZpbGUoJy9zb21lL290aGVyL3BhdGgnKSwgKCkgPT4gdzMucCk7XG5cblx0XHRcdGRyYWluZWQgPSBmYWxzZTtcblx0XHRcdHF1ZXVlLndoZW5EcmFpbmVkKCkudGhlbigoKSA9PiBkcmFpbmVkID0gdHJ1ZSk7XG5cblx0XHRcdHF1ZXVlLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJhaW5lZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXRyeScsICgpID0+IHtcblx0XHR0ZXN0KCdzdWNjZXNzIGNhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBhc3luYy5yZXRyeSgoKSA9PiB7XG5cdFx0XHRcdFx0Y291bnRlcisrO1xuXHRcdFx0XHRcdGlmIChjb3VudGVyIDwgMikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZmFpbCcpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0XHR9LCAxMCwgMyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Vycm9yIGNhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkRXJyb3IgPSBuZXcgRXJyb3IoJ2ZhaWwnKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBhc3luYy5yZXRyeSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHRcdFx0fSwgMTAsIDMpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Rhc2tTZXF1ZW50aWFsaXplcicsICgpID0+IHtcblx0XHR0ZXN0KCdleGVjdXRpb24gYmFzaWNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgc2VxdWVudGlhbGl6ZXIgPSBuZXcgYXN5bmMuVGFza1NlcXVlbnRpYWxpemVyKCk7XG5cblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5oYXNRdWV1ZWQoKSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmlzUnVubmluZygyMzIzKSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLnJ1bm5pbmcpO1xuXG5cdFx0XHQvLyBwZW5kaW5nIHJlbW92ZXMgaXRzZWxmIGFmdGVyIGRvbmVcblx0XHRcdGF3YWl0IHNlcXVlbnRpYWxpemVyLnJ1bigxLCBQcm9taXNlLnJlc29sdmUoKSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKDEpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIucnVubmluZyk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmhhc1F1ZXVlZCgpKTtcblxuXHRcdFx0Ly8gcGVuZGluZyByZW1vdmVzIGl0c2VsZiBhZnRlciBkb25lICh1c2UgYXN5bmMudGltZW91dClcblx0XHRcdHNlcXVlbnRpYWxpemVyLnJ1bigyLCBhc3luYy50aW1lb3V0KDEpKTtcblx0XHRcdGFzc2VydC5vayhzZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKDIpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaGFzUXVldWVkKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcXVlbnRpYWxpemVyLmlzUnVubmluZygxKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcXVlbnRpYWxpemVyLnJ1bm5pbmcpO1xuXG5cdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKDIpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLnJ1bm5pbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhlY3V0aW5nIGFuZCBxdWV1ZWQgKGZpbmlzaGVzIGluc3RhbnRseSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdEb25lID0gZmFsc2U7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5ydW4oMSwgYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IHsgcGVuZGluZ0RvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0Ly8gcXVldWVkIGZpbmlzaGVzIGluc3RhbnRseVxuXHRcdFx0bGV0IHF1ZXVlZERvbmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHJlcyA9IHNlcXVlbnRpYWxpemVyLnF1ZXVlKCgpID0+IFByb21pc2UucmVzb2x2ZShudWxsKS50aGVuKCgpID0+IHsgcXVldWVkRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHRhc3NlcnQub2soc2VxdWVudGlhbGl6ZXIuaGFzUXVldWVkKCkpO1xuXG5cdFx0XHRhd2FpdCByZXM7XG5cdFx0XHRhc3NlcnQub2socGVuZGluZ0RvbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHF1ZXVlZERvbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5oYXNRdWV1ZWQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGVjdXRpbmcgYW5kIHF1ZXVlZCAoZmluaXNoZXMgYWZ0ZXIgdGltZW91dCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdEb25lID0gZmFsc2U7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5ydW4oMSwgYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IHsgcGVuZGluZ0RvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0Ly8gcXVldWVkIGZpbmlzaGVzIGFmdGVyIGFzeW5jLnRpbWVvdXRcblx0XHRcdGxldCBxdWV1ZWREb25lID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZXMgPSBzZXF1ZW50aWFsaXplci5xdWV1ZSgoKSA9PiBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4geyBxdWV1ZWREb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdGF3YWl0IHJlcztcblx0XHRcdGFzc2VydC5vayhwZW5kaW5nRG9uZSk7XG5cdFx0XHRhc3NlcnQub2socXVldWVkRG9uZSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmhhc1F1ZXVlZCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2pvaW4gKHdpdGhvdXQgZXhlY3V0aW5nIG9yIHF1ZXVlZCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0YXdhaXQgc2VxdWVudGlhbGl6ZXIuam9pbigpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5oYXNRdWV1ZWQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdqb2luICh3aXRob3V0IHF1ZXVlZCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdEb25lID0gZmFsc2U7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5ydW4oMSwgYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IHsgcGVuZGluZ0RvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0YXdhaXQgc2VxdWVudGlhbGl6ZXIuam9pbigpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlbmRpbmdEb25lKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnam9pbiAod2l0aCBleGVjdXRpbmcgYW5kIHF1ZXVlZCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdEb25lID0gZmFsc2U7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5ydW4oMSwgYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IHsgcGVuZGluZ0RvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0Ly8gcXVldWVkIGZpbmlzaGVzIGFmdGVyIGFzeW5jLnRpbWVvdXRcblx0XHRcdGxldCBxdWV1ZWREb25lID0gZmFsc2U7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5xdWV1ZSgoKSA9PiBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4geyBxdWV1ZWREb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdGF3YWl0IHNlcXVlbnRpYWxpemVyLmpvaW4oKTtcblx0XHRcdGFzc2VydC5vayhwZW5kaW5nRG9uZSk7XG5cdFx0XHRhc3NlcnQub2socXVldWVkRG9uZSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaGFzUXVldWVkKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhlY3V0aW5nIGFuZCBtdWx0aXBsZSBxdWV1ZWQgKGxhc3Qgb25lIHdpbnMpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgc2VxdWVudGlhbGl6ZXIgPSBuZXcgYXN5bmMuVGFza1NlcXVlbnRpYWxpemVyKCk7XG5cblx0XHRcdGxldCBwZW5kaW5nRG9uZSA9IGZhbHNlO1xuXHRcdFx0c2VxdWVudGlhbGl6ZXIucnVuKDEsIGFzeW5jLnRpbWVvdXQoMSkudGhlbigoKSA9PiB7IHBlbmRpbmdEb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdC8vIHF1ZXVlZCBmaW5pc2hlcyBhZnRlciBhc3luYy50aW1lb3V0XG5cdFx0XHRsZXQgZmlyc3REb25lID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmaXJzdFJlcyA9IHNlcXVlbnRpYWxpemVyLnF1ZXVlKCgpID0+IGFzeW5jLnRpbWVvdXQoMikudGhlbigoKSA9PiB7IGZpcnN0RG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHRsZXQgc2Vjb25kRG9uZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2Vjb25kUmVzID0gc2VxdWVudGlhbGl6ZXIucXVldWUoKCkgPT4gYXN5bmMudGltZW91dCgzKS50aGVuKCgpID0+IHsgc2Vjb25kRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHRsZXQgdGhpcmREb25lID0gZmFsc2U7XG5cdFx0XHRjb25zdCB0aGlyZFJlcyA9IHNlcXVlbnRpYWxpemVyLnF1ZXVlKCgpID0+IGFzeW5jLnRpbWVvdXQoNCkudGhlbigoKSA9PiB7IHRoaXJkRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbZmlyc3RSZXMsIHNlY29uZFJlcywgdGhpcmRSZXNdKTtcblx0XHRcdGFzc2VydC5vayhwZW5kaW5nRG9uZSk7XG5cdFx0XHRhc3NlcnQub2soIWZpcnN0RG9uZSk7XG5cdFx0XHRhc3NlcnQub2soIXNlY29uZERvbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRoaXJkRG9uZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgZXhlY3V0aW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgc2VxdWVudGlhbGl6ZXIgPSBuZXcgYXN5bmMuVGFza1NlcXVlbnRpYWxpemVyKCk7XG5cdFx0XHRjb25zdCBjdHNUaW1lb3V0ID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdDYW5jZWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBhc3luYy50aW1lb3V0KDEsIGN0c1RpbWVvdXQudG9rZW4pO1xuXHRcdFx0c2VxdWVudGlhbGl6ZXIucnVuKDEsIHRpbWVvdXQsICgpID0+IHBlbmRpbmdDYW5jZWxsZWQgPSB0cnVlKTtcblx0XHRcdHNlcXVlbnRpYWxpemVyLmNhbmNlbFJ1bm5pbmcoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHBlbmRpbmdDYW5jZWxsZWQpO1xuXHRcdFx0Y3RzVGltZW91dC5jYW5jZWwoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rpc3Bvc2FibGVUaW1lb3V0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2hhbmRsZXIgb25seSBzdWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNiID0gZmFsc2U7XG5cdFx0XHRjb25zdCB0ID0gYXN5bmMuZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gY2IgPSB0cnVlKTtcblxuXHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNiLCB0cnVlKTtcblxuXHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVyIG9ubHkgY2FuY2VsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNiID0gZmFsc2U7XG5cdFx0XHRjb25zdCB0ID0gYXN5bmMuZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gY2IgPSB0cnVlKTtcblx0XHRcdHQuZGlzcG9zZSgpO1xuXG5cdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2IsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlIG1hbmFnZWQgc3VjY2VzcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGFzeW5jLmRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IGNiID0gdHJ1ZSwgMCwgcyk7XG5cblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYiwgdHJ1ZSk7XG5cblx0XHRcdHMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmUgbWFuYWdlZCBjYW5jZWwgdmlhIGRpc3Bvc2FibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCB0ID0gYXN5bmMuZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gY2IgPSB0cnVlLCAwLCBzKTtcblx0XHRcdHQuZGlzcG9zZSgpO1xuXG5cdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2IsIGZhbHNlKTtcblxuXHRcdFx0cy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9yZSBtYW5hZ2VkIGNhbmNlbCB2aWEgc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRhc3luYy5kaXNwb3NhYmxlVGltZW91dCgoKSA9PiBjYiA9IHRydWUsIDAsIHMpO1xuXHRcdFx0cy5kaXNwb3NlKCk7XG5cblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYiwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlzcG9zYWJsZUxvbmdUaW1lb3V0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ZpcmVzIGFmdGVyIGEgZGVsYXkgbGFyZ2VyIHRoYW4gdGhlIHNldFRpbWVvdXQgbWF4aW11bScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNiID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHQgPSBhc3luYy5kaXNwb3NhYmxlTG9uZ1RpbWVvdXQoKCkgPT4gY2IgPSB0cnVlLCBhc3luYy5NQVhfVElNRU9VVF9ERUxBWSAqIDIgKyAxMDAwKTtcblxuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICogMiArIDIwMDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYiwgdHJ1ZSk7XG5cdFx0XHRcdHQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBmaXJlIGFmdGVyIGRpc3Bvc2FsIG1pZC13YWl0JywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgdCA9IGFzeW5jLmRpc3Bvc2FibGVMb25nVGltZW91dCgoKSA9PiBjYiA9IHRydWUsIGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICogMik7XG5cblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dChhc3luYy5NQVhfVElNRU9VVF9ERUxBWSk7IC8vIGFkdmFuY2Ugb25lIGNodW5rLCB0aGVuIHJlLWFybWVkXG5cdFx0XHRcdHQuZGlzcG9zZSgpO1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICogMik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNiLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlIG1hbmFnZWQgc3VjY2VzcyBldmljdHMgb24gZmlyZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNiID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGFzeW5jLmRpc3Bvc2FibGVMb25nVGltZW91dCgoKSA9PiBjYiA9IHRydWUsIGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICsgNTAwLCBzKTtcblxuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICsgMTAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNiLCB0cnVlKTtcblx0XHRcdFx0cy5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlIG1hbmFnZWQgY2FuY2VsIHZpYSBzdG9yZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNiID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGFzeW5jLmRpc3Bvc2FibGVMb25nVGltZW91dCgoKSA9PiBjYiA9IHRydWUsIGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICogMiwgcyk7XG5cdFx0XHRcdHMuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKiAyKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2IsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyYWNlQ2FuY2VsbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgY3RzVGltZW91dCA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0XHRsZXQgdHJpZ2dlcmVkID0gZmFsc2U7XG5cdFx0Y29uc3QgdGltZW91dCA9IGFzeW5jLnRpbWVvdXQoMTAwLCBjdHNUaW1lb3V0LnRva2VuKTtcblx0XHRjb25zdCBwID0gYXN5bmMucmFjZUNhbmNlbGxhdGlvbih0aW1lb3V0LnRoZW4oKCkgPT4gdHJpZ2dlcmVkID0gdHJ1ZSksIGN0cy50b2tlbik7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgcDtcblxuXHRcdGFzc2VydC5vayghdHJpZ2dlcmVkKTtcblx0XHRjdHNUaW1lb3V0LmNhbmNlbCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYWNlVGltZW91dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Ly8gdGltZW91dCB3aW5zXG5cdFx0bGV0IHRpbWVkb3V0ID0gZmFsc2U7XG5cdFx0bGV0IHRyaWdnZXJlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY3RzVGltZW91dDEgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdGNvbnN0IHRpbWVvdXQxID0gYXN5bmMudGltZW91dCgxMDAsIGN0c1RpbWVvdXQxLnRva2VuKTtcblx0XHRjb25zdCBwMSA9IGFzeW5jLnJhY2VUaW1lb3V0KHRpbWVvdXQxLnRoZW4oKCkgPT4gdHJpZ2dlcmVkID0gdHJ1ZSksIDEsICgpID0+IHRpbWVkb3V0ID0gdHJ1ZSk7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgcDE7XG5cblx0XHRhc3NlcnQub2soIXRyaWdnZXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVkb3V0LCB0cnVlKTtcblx0XHRjdHNUaW1lb3V0MS5jYW5jZWwoKTtcblxuXHRcdC8vIHByb21pc2Ugd2luc1xuXHRcdHRpbWVkb3V0ID0gZmFsc2U7XG5cblx0XHRjb25zdCBjdHNUaW1lb3V0MiA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdGltZW91dDIgPSBhc3luYy50aW1lb3V0KDEsIGN0c1RpbWVvdXQyLnRva2VuKTtcblx0XHRjb25zdCBwMiA9IGFzeW5jLnJhY2VUaW1lb3V0KHRpbWVvdXQyLnRoZW4oKCkgPT4gdHJpZ2dlcmVkID0gdHJ1ZSksIDEwMCwgKCkgPT4gdGltZWRvdXQgPSB0cnVlKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBwMjtcblxuXHRcdGFzc2VydC5vayh0cmlnZ2VyZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lZG91dCwgZmFsc2UpO1xuXHRcdGN0c1RpbWVvdXQyLmNhbmNlbCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZXF1ZW5jZXJCeUtleScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzID0gbmV3IGFzeW5jLlNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHIxID0gYXdhaXQgcy5xdWV1ZSgna2V5MScsICgpID0+IFByb21pc2UucmVzb2x2ZSgnaGVsbG8nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLCAnaGVsbG8nKTtcblxuXHRcdGF3YWl0IHMucXVldWUoJ2tleTInLCAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2ZhaWxlZCcpKSkudGhlbigoKSA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Nob3VsZCBub3QgYmUgcmVzb2x2ZWQnKTtcblx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgZXJyb3Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIubWVzc2FnZSwgJ2ZhaWxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3RpbGwgd29ya3MgYWZ0ZXIgYSBxdWV1ZWQgcHJvbWlzZSBpcyByZWplY3RlZFxuXHRcdGNvbnN0IHIzID0gYXdhaXQgcy5xdWV1ZSgna2V5MicsICgpID0+IFByb21pc2UucmVzb2x2ZSgnaGVsbG8nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIzLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnSW50ZXJ2YWxDb3VudGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBub3cgPSAwO1xuXHRcdGNvbnN0IGNvdW50ZXIgPSBuZXcgYXN5bmMuSW50ZXJ2YWxDb3VudGVyKDUsICgpID0+IG5vdyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5pbmNyZW1lbnQoKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuaW5jcmVtZW50KCksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmluY3JlbWVudCgpLCAzKTtcblxuXHRcdG5vdyA9IDEwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuaW5jcmVtZW50KCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmluY3JlbWVudCgpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5pbmNyZW1lbnQoKSwgMyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaXJzdFBhcmFsbGVsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBhd2FpdCBhc3luYy5maXJzdFBhcmFsbGVsKFtcblx0XHRcdFx0UHJvbWlzZS5yZXNvbHZlKDEpLFxuXHRcdFx0XHRQcm9taXNlLnJlc29sdmUoMiksXG5cdFx0XHRcdFByb21pc2UucmVzb2x2ZSgzKSxcblx0XHRcdF0sIHYgPT4gdiA9PT0gMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIG51bGwgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhc3luYy5maXJzdFBhcmFsbGVsKFtQcm9taXNlLnJlc29sdmUoMSldLCB2ID0+IHYgPT09IDIpLCBudWxsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdmFsdWUgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhc3luYy5maXJzdFBhcmFsbGVsKFtQcm9taXNlLnJlc29sdmUoMSldLCB2ID0+IHYgPT09IDIsIDQpLCA0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGFzeW5jLmZpcnN0UGFyYWxsZWwoW10sIHYgPT4gdiA9PT0gMiwgNCksIDQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjdDE6IENhbmNlbGxhdGlvblRva2VuO1xuXHRcdFx0Y29uc3QgcDEgPSBhc3luYy5jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyAoY3QpID0+IHtcblx0XHRcdFx0Y3QxID0gY3Q7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMjAwLCBjdCk7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSk7XG5cdFx0XHRsZXQgY3QyOiBDYW5jZWxsYXRpb25Ub2tlbjtcblx0XHRcdGNvbnN0IHAyID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKGN0KSA9PiB7XG5cdFx0XHRcdGN0MiA9IGN0O1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDIsIGN0KTtcblx0XHRcdFx0cmV0dXJuIDI7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGFzeW5jLmZpcnN0UGFyYWxsZWwoW3AxLCBwMl0sIHYgPT4gdiA9PT0gMiwgNCksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN0MSEuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIHRydWUsICdzaG91bGQgY2FuY2VsIGEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdDIhLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlLCAnc2hvdWxkIGNhbmNlbCBiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3Rpb24gaGFuZGxpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY3QxOiBDYW5jZWxsYXRpb25Ub2tlbjtcblx0XHRcdGNvbnN0IHAxID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKGN0KSA9PiB7XG5cdFx0XHRcdGN0MSA9IGN0O1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDIwMCwgY3QpO1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH0pO1xuXHRcdFx0bGV0IGN0MjogQ2FuY2VsbGF0aW9uVG9rZW47XG5cdFx0XHRjb25zdCBwMiA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIChjdCkgPT4ge1xuXHRcdFx0XHRjdDIgPSBjdDtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgyLCBjdCk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignb2ggbm8nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYXN5bmMuZmlyc3RQYXJhbGxlbChbcDEsIHAyXSwgdiA9PiB2ID09PSAyLCA0KS5jYXRjaCgoKSA9PiAnb2snKSwgJ29rJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3QxIS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSwgJ3Nob3VsZCBjYW5jZWwgYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN0MiEuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIHRydWUsICdzaG91bGQgY2FuY2VsIGInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0RlZmVycmVkUHJvbWlzZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTxudW1iZXI+KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQuaXNSZXNvbHZlZCwgZmFsc2UpO1xuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoNDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRlZmVycmVkLnAsIDQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC5pc1Jlc29sdmVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8bnVtYmVyPigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLmlzUmVqZWN0ZWQsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignb2ggbm8hJyk7XG5cdFx0XHRkZWZlcnJlZC5lcnJvcihlcnIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRlZmVycmVkLnAuY2F0Y2goZSA9PiBlKSwgZXJyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC5pc1JlamVjdGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8bnVtYmVyPigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLmlzUmVqZWN0ZWQsIGZhbHNlKTtcblx0XHRcdGRlZmVycmVkLmNhbmNlbCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBkZWZlcnJlZC5wLmNhdGNoKGUgPT4gZSkpLm5hbWUsICdDYW5jZWxlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLmlzUmVqZWN0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0YWlucyB0aGUgb3JpZ2luYWwgc2V0dGxlZCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTxudW1iZXI+KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQuaXNSZXNvbHZlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLnZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSg0Mik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGVmZXJyZWQucCwgNDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLnZhbHVlLCA0Mik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQuaXNSZXNvbHZlZCwgdHJ1ZSk7XG5cblx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkZWZlcnJlZC5wLCA0Mik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQudmFsdWUsIDQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC5pc1Jlc29sdmVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Byb21pc2VzLnNldHRsZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVzb2x2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwMSA9IFByb21pc2UucmVzb2x2ZSgxKTtcblx0XHRcdGNvbnN0IHAyID0gYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IDIpO1xuXHRcdFx0Y29uc3QgcDMgPSBhc3luYy50aW1lb3V0KDIpLnRoZW4oKCkgPT4gMyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFzeW5jLlByb21pc2VzLnNldHRsZWQ8bnVtYmVyPihbcDEsIHAyLCBwM10pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsxXSwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsyXSwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHAxID0gYXN5bmMudGltZW91dCgyKS50aGVuKCgpID0+IDEpO1xuXHRcdFx0Y29uc3QgcDIgPSBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4gMik7XG5cdFx0XHRjb25zdCBwMyA9IFByb21pc2UucmVzb2x2ZSgzKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXN5bmMuUHJvbWlzZXMuc2V0dGxlZDxudW1iZXI+KFtwMSwgcDIsIHAzXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzFdLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzJdLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgd2l0aCBmaXJzdCBlcnJvciBidXQgaGFuZGxlcyBhbGwgcHJvbWlzZXMgKGFsbCBlcnJvcnMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcDEgPSBQcm9taXNlLnJlamVjdCgxKTtcblxuXHRcdFx0bGV0IHAySGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcDJFcnJvciA9IG5ldyBFcnJvcignMicpO1xuXHRcdFx0Y29uc3QgcDIgPSBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRwMkhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHR0aHJvdyBwMkVycm9yO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBwM0hhbmRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHAzRXJyb3IgPSBuZXcgRXJyb3IoJzMnKTtcblx0XHRcdGNvbnN0IHAzID0gYXN5bmMudGltZW91dCgyKS50aGVuKCgpID0+IHtcblx0XHRcdFx0cDNIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhyb3cgcDNFcnJvcjtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYXN5bmMuUHJvbWlzZXMuc2V0dGxlZDxudW1iZXI+KFtwMSwgcDIsIHAzXSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGVycm9yID0gZTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChlcnJvciwgcDJFcnJvcik7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZXJyb3IsIHAzRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKHAySGFuZGxlZCk7XG5cdFx0XHRhc3NlcnQub2socDNIYW5kbGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgd2l0aCBmaXJzdCBlcnJvciBidXQgaGFuZGxlcyBhbGwgcHJvbWlzZXMgKDEgZXJyb3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcDEgPSBQcm9taXNlLnJlc29sdmUoMSk7XG5cblx0XHRcdGxldCBwMkhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHAyRXJyb3IgPSBuZXcgRXJyb3IoJzInKTtcblx0XHRcdGNvbnN0IHAyID0gYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IHtcblx0XHRcdFx0cDJIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhyb3cgcDJFcnJvcjtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgcDNIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBwMyA9IGFzeW5jLnRpbWVvdXQoMikudGhlbigoKSA9PiB7XG5cdFx0XHRcdHAzSGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiAzO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhc3luYy5Qcm9taXNlcy5zZXR0bGVkPG51bWJlcj4oW3AxLCBwMiwgcDNdKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0ZXJyb3IgPSBlO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IsIHAyRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKHAySGFuZGxlZCk7XG5cdFx0XHRhc3NlcnQub2socDNIYW5kbGVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Byb21pc2VzLndpdGhBc3luY0JvZHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnYmFzaWNzJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBwMSA9IGFzeW5jLlByb21pc2VzLndpdGhBc3luY0JvZHkoYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKDEpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHAyID0gYXN5bmMuUHJvbWlzZXMud2l0aEFzeW5jQm9keShhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ2Vycm9yJykpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHAzID0gYXN5bmMuUHJvbWlzZXMud2l0aEFzeW5jQm9keShhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXJyb3InKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByMSA9IGF3YWl0IHAxO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLCAxKTtcblxuXHRcdFx0bGV0IGUyOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHAyO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZTIgPSBlcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0Lm9rKGUyIGluc3RhbmNlb2YgRXJyb3IpO1xuXG5cdFx0XHRsZXQgZTM6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcDM7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRlMyA9IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZTMgaW5zdGFuY2VvZiBFcnJvcik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaHJvdHRsZWRXb3JrZXInLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRBcnJheUVxdWFscyhhY3R1YWw6IHVua25vd25bXSwgZXhwZWN0ZWQ6IHVua25vd25bXSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sZW5ndGgsIGV4cGVjdGVkLmxlbmd0aCk7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYWN0dWFsLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbaV0sIGV4cGVjdGVkW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdiYXNpY3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgaGFuZGxlZDogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0bGV0IGhhbmRsZWRDYWxsYmFjazogRnVuY3Rpb247XG5cdFx0XHRsZXQgaGFuZGxlZFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGhhbmRsZWRDYWxsYmFjayA9IHJlc29sdmUpO1xuXHRcdFx0bGV0IGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlID0gMTtcblx0XHRcdGxldCBjdXJyZW50SGFuZGxlZENvdW50ZXIgPSAwO1xuXG5cdFx0XHRjb25zdCBoYW5kbGVyID0gKHVuaXRzOiByZWFkb25seSBudW1iZXJbXSkgPT4ge1xuXHRcdFx0XHRoYW5kbGVkLnB1c2goLi4udW5pdHMpO1xuXG5cdFx0XHRcdGN1cnJlbnRIYW5kbGVkQ291bnRlcisrO1xuXHRcdFx0XHRpZiAoY3VycmVudEhhbmRsZWRDb3VudGVyID09PSBoYW5kbGVkQ291bnRlclRvUmVzb2x2ZSkge1xuXHRcdFx0XHRcdGhhbmRsZWRDYWxsYmFjaygpO1xuXG5cdFx0XHRcdFx0aGFuZGxlZFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGhhbmRsZWRDYWxsYmFjayA9IHJlc29sdmUpO1xuXHRcdFx0XHRcdGN1cnJlbnRIYW5kbGVkQ291bnRlciA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHdvcmtlciA9IHN0b3JlLmFkZChuZXcgYXN5bmMuVGhyb3R0bGVkV29ya2VyPG51bWJlcj4oe1xuXHRcdFx0XHRtYXhXb3JrQ2h1bmtTaXplOiA1LFxuXHRcdFx0XHRtYXhCdWZmZXJlZFdvcms6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGhyb3R0bGVEZWxheTogMVxuXHRcdFx0fSwgaGFuZGxlcikpO1xuXG5cdFx0XHQvLyBXb3JrIGxlc3MgdGhhbiBjaHVuayBzaXplXG5cblx0XHRcdGxldCB3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgM10pO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgM10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXG5cdFx0XHR3b3JrZXIud29yayhbNCwgNV0pO1xuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzZdKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDUsIDZdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0Ly8gV29yayBtb3JlIHRoYW4gY2h1bmsgc2l6ZSAodmFyaWFudCAxKVxuXG5cdFx0XHRoYW5kbGVkID0gW107XG5cdFx0XHRoYW5kbGVkQ291bnRlclRvUmVzb2x2ZSA9IDI7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzLCA0LCA1LCA2LCA3XSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IGhhbmRsZWRQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgMywgNCwgNSwgNiwgN10pO1xuXG5cdFx0XHRoYW5kbGVkID0gW107XG5cdFx0XHRoYW5kbGVkQ291bnRlclRvUmVzb2x2ZSA9IDQ7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTEsIDEyLCAxMywgMTQsIDE1LCAxNiwgMTcsIDE4LCAxOV0pO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCAxNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlZFByb21pc2U7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTEsIDEyLCAxMywgMTQsIDE1LCAxNiwgMTcsIDE4LCAxOV0pO1xuXG5cdFx0XHQvLyBXb3JrIG1vcmUgdGhhbiBjaHVuayBzaXplICh2YXJpYW50IDIpXG5cblx0XHRcdGhhbmRsZWQgPSBbXTtcblx0XHRcdGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlID0gMjtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwXSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IGhhbmRsZWRQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdKTtcblxuXHRcdFx0Ly8gV29yayBtb3JlIHdoaWxlIHRocm90dGxlZCAodmFyaWFudCAxKVxuXG5cdFx0XHRoYW5kbGVkID0gW107XG5cdFx0XHRoYW5kbGVkQ291bnRlclRvUmVzb2x2ZSA9IDM7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzLCA0LCA1LCA2LCA3XSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdHdvcmtlci53b3JrKFs4XSk7XG5cdFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbOSwgMTAsIDExXSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IGhhbmRsZWRQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTAsIDExXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDApO1xuXG5cdFx0XHQvLyBXb3JrIG1vcmUgd2hpbGUgdGhyb3R0bGVkICh2YXJpYW50IDIpXG5cblx0XHRcdGhhbmRsZWQgPSBbXTtcblx0XHRcdGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlID0gMjtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDMsIDQsIDUsIDYsIDddKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXG5cdFx0XHR3b3JrZXIud29yayhbOF0pO1xuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzksIDEwXSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlZFByb21pc2U7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG8gbm90IGFjY2VwdCB0b28gbXVjaCB3b3JrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGhhbmRsZXIgPSAodW5pdHM6IHJlYWRvbmx5IG51bWJlcltdKSA9PiBoYW5kbGVkLnB1c2goLi4udW5pdHMpO1xuXG5cdFx0XHRjb25zdCB3b3JrZXIgPSBzdG9yZS5hZGQobmV3IGFzeW5jLlRocm90dGxlZFdvcmtlcjxudW1iZXI+KHtcblx0XHRcdFx0bWF4V29ya0NodW5rU2l6ZTogNSxcblx0XHRcdFx0bWF4QnVmZmVyZWRXb3JrOiA1LFxuXHRcdFx0XHR0aHJvdHRsZURlbGF5OiAxXG5cdFx0XHR9LCBoYW5kbGVyKSk7XG5cblx0XHRcdGxldCB3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgM10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzLCA0LCA1LCA2XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMSk7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFs3XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMik7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFs4LCA5LCAxMCwgMTFdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkbyBub3QgYWNjZXB0IHRvbyBtdWNoIHdvcmsgKGFjY291bnQgZm9yIG1heCBjaHVuayBzaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGhhbmRsZXIgPSAodW5pdHM6IHJlYWRvbmx5IG51bWJlcltdKSA9PiBoYW5kbGVkLnB1c2goLi4udW5pdHMpO1xuXG5cdFx0XHRjb25zdCB3b3JrZXIgPSBzdG9yZS5hZGQobmV3IGFzeW5jLlRocm90dGxlZFdvcmtlcjxudW1iZXI+KHtcblx0XHRcdFx0bWF4V29ya0NodW5rU2l6ZTogNSxcblx0XHRcdFx0bWF4QnVmZmVyZWRXb3JrOiA1LFxuXHRcdFx0XHR0aHJvdHRsZURlbGF5OiAxXG5cdFx0XHR9LCBoYW5kbGVyKSk7XG5cblx0XHRcdGxldCB3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTAsIDExXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDApO1xuXG5cdFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCA1KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFuZGxlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGhhbmRsZXIgPSAodW5pdHM6IHJlYWRvbmx5IG51bWJlcltdKSA9PiBoYW5kbGVkLnB1c2goLi4udW5pdHMpO1xuXG5cdFx0XHRjb25zdCB3b3JrZXIgPSBzdG9yZS5hZGQobmV3IGFzeW5jLlRocm90dGxlZFdvcmtlcjxudW1iZXI+KHtcblx0XHRcdFx0bWF4V29ya0NodW5rU2l6ZTogNSxcblx0XHRcdFx0bWF4QnVmZmVyZWRXb3JrOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRocm90dGxlRGVsYXk6IDFcblx0XHRcdH0sIGhhbmRsZXIpKTtcblx0XHRcdHdvcmtlci5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCB3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgM10pO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzAzNjZcblx0XHQvLyBcdHRlc3QoJ3dhaXRUaHJvdHRsZURlbGF5QmV0d2VlbldvcmtVbml0cyBvcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gXHRcdGNvbnN0IGhhbmRsZWQ6IG51bWJlcltdID0gW107XG5cdFx0Ly8gXHRcdGxldCBoYW5kbGVkQ2FsbGJhY2s6IEZ1bmN0aW9uO1xuXHRcdC8vIFx0XHRsZXQgaGFuZGxlZFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGhhbmRsZWRDYWxsYmFjayA9IHJlc29sdmUpO1xuXHRcdC8vIFx0XHRsZXQgY3VycmVudFRpbWUgPSAwO1xuXG5cdFx0Ly8gXHRcdGNvbnN0IGhhbmRsZXIgPSAodW5pdHM6IHJlYWRvbmx5IG51bWJlcltdKSA9PiB7XG5cdFx0Ly8gXHRcdFx0aGFuZGxlZC5wdXNoKC4uLnVuaXRzKTtcblx0XHQvLyBcdFx0XHRoYW5kbGVkQ2FsbGJhY2soKTtcblx0XHQvLyBcdFx0XHRoYW5kbGVkUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlZENhbGxiYWNrID0gcmVzb2x2ZSk7XG5cdFx0Ly8gXHRcdH07XG5cblx0XHQvLyBcdFx0Y29uc3Qgd29ya2VyID0gc3RvcmUuYWRkKG5ldyBhc3luYy5UaHJvdHRsZWRXb3JrZXI8bnVtYmVyPih7XG5cdFx0Ly8gXHRcdFx0bWF4V29ya0NodW5rU2l6ZTogNSxcblx0XHQvLyBcdFx0XHRtYXhCdWZmZXJlZFdvcms6IHVuZGVmaW5lZCxcblx0XHQvLyBcdFx0XHR0aHJvdHRsZURlbGF5OiA1LFxuXHRcdC8vIFx0XHRcdHdhaXRUaHJvdHRsZURlbGF5QmV0d2VlbldvcmtVbml0czogdHJ1ZVxuXHRcdC8vIFx0XHR9LCBoYW5kbGVyKSk7XG5cblx0XHQvLyBcdFx0Ly8gU2NoZWR1bGUgd29yaywgaXQgc2hvdWxkIGV4ZWN1dGUgaW1tZWRpYXRlbHlcblx0XHQvLyBcdFx0Y3VycmVudFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdC8vIFx0XHRsZXQgd29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDNdKTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cdFx0Ly8gXHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzXSk7XG5cdFx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChEYXRlLm5vdygpIC0gY3VycmVudFRpbWUgPCA1LCB0cnVlKTtcblxuXHRcdC8vIFx0XHQvLyBTY2hlZHVsZSB3b3JrIGFnYWluLCBpdCBzaG91bGQgd2FpdCBhdCBsZWFzdCB0aHJvdHRsZSBkZWxheSBiZWZvcmUgZXhlY3V0aW5nXG5cdFx0Ly8gXHRcdGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHQvLyBcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzQsIDVdKTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cdFx0Ly8gXHRcdC8vIFRocm90dGxlIGRlbGF5IGhhc24ndCByZXNldCBzbyB3ZSBzdGlsbCBtdXN0IHdhaXRcblx0XHQvLyBcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDNdKTtcblx0XHQvLyBcdFx0YXdhaXQgaGFuZGxlZFByb21pc2U7XG5cdFx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChEYXRlLm5vdygpIC0gY3VycmVudFRpbWUgPj0gNSwgdHJ1ZSk7XG5cdFx0Ly8gXHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0Ly8gXHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0xpbWl0ZWRRdWV1ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Jhc2ljcyAod2l0aCBsb25nIHJ1bm5pbmcgdGFzayknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaW1pdGVkUXVldWUgPSBuZXcgYXN5bmMuTGltaXRlZFF1ZXVlKCk7XG5cblx0XHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRcdGNvbnN0IHByb21pc2VzID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xuXHRcdFx0XHRwcm9taXNlcy5wdXNoKGxpbWl0ZWRRdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y291bnRlciA9IGk7XG5cdFx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cblx0XHRcdC8vIG9ubHkgdGhlIGxhc3QgdGFzayBleGVjdXRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmFzaWNzICh3aXRoIHN5bmMgcnVubmluZyB0YXNrKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbWl0ZWRRdWV1ZSA9IG5ldyBhc3luYy5MaW1pdGVkUXVldWUoKTtcblxuXHRcdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRcdHByb21pc2VzLnB1c2gobGltaXRlZFF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb3VudGVyID0gaTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cblx0XHRcdC8vIG9ubHkgdGhlIGxhc3QgdGFzayBleGVjdXRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIsIDQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQXN5bmNJdGVyYWJsZU9iamVjdCcsIGZ1bmN0aW9uICgpIHtcblxuXG5cdFx0dGVzdCgnb25SZXR1cm4gTk9UIGNhbGxlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0bGV0IGNhbGxlZE9uUmV0dXJuID0gZmFsc2U7XG5cdFx0XHRjb25zdCBpdGVyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVPYmplY3Q8bnVtYmVyPih3cml0ZXIgPT4ge1xuXHRcdFx0XHR3cml0ZXIuZW1pdE1hbnkoWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0Y2FsbGVkT25SZXR1cm4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgaXRlbSwgJ251bWJlcicpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkT25SZXR1cm4sIGZhbHNlKTtcblxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25SZXR1cm4gY2FsbGVkIG9uIGJyZWFrJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRsZXQgY2FsbGVkT25SZXR1cm4gPSBmYWxzZTtcblx0XHRcdGNvbnN0IGl0ZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZU9iamVjdDxudW1iZXI+KHdyaXRlciA9PiB7XG5cdFx0XHRcdHdyaXRlci5lbWl0TWFueShbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsZWRPblJldHVybiA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0sIDEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZE9uUmV0dXJuLCB0cnVlKTtcblxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25SZXR1cm4gY2FsbGVkIG9uIHJldHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0bGV0IGNhbGxlZE9uUmV0dXJuID0gZmFsc2U7XG5cdFx0XHRjb25zdCBpdGVyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVPYmplY3Q8bnVtYmVyPih3cml0ZXIgPT4ge1xuXHRcdFx0XHR3cml0ZXIuZW1pdE1hbnkoWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0Y2FsbGVkT25SZXR1cm4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IChhc3luYyBmdW5jdGlvbiB0ZXN0KCkge1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcikge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLCAxKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZE9uUmV0dXJuLCB0cnVlKTtcblxuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdvblJldHVybiBjYWxsZWQgb24gdGhyb3dpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGxldCBjYWxsZWRPblJldHVybiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgaXRlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlT2JqZWN0PG51bWJlcj4od3JpdGVyID0+IHtcblx0XHRcdFx0d3JpdGVyLmVtaXRNYW55KFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxlZE9uUmV0dXJuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcikge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLCAxKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWRPblJldHVybiwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBc3luY0l0ZXJhYmxlU291cmNlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0dGVzdCgnb25SZXR1cm4gaXMgd2lyZWQgdXAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY2FsbGVkT25SZXR1cm4gPSBmYWxzZTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlU291cmNlPG51bWJlcj4oKCkgPT4geyBjYWxsZWRPblJldHVybiA9IHRydWU7IH0pO1xuXG5cdFx0XHRzb3VyY2UuZW1pdE9uZSgxKTtcblx0XHRcdHNvdXJjZS5lbWl0T25lKDIpO1xuXHRcdFx0c291cmNlLmVtaXRPbmUoMyk7XG5cdFx0XHRzb3VyY2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2Ygc291cmNlLmFzeW5jSXRlcmFibGUpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0sIDEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZE9uUmV0dXJuLCB0cnVlKTtcblxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25SZXR1cm4gaXMgd2lyZWQgdXAgMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBjYWxsZWRPblJldHVybiA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVTb3VyY2U8bnVtYmVyPigoKSA9PiB7IGNhbGxlZE9uUmV0dXJuID0gdHJ1ZTsgfSk7XG5cblx0XHRcdHNvdXJjZS5lbWl0T25lKDEpO1xuXHRcdFx0c291cmNlLmVtaXRPbmUoMik7XG5cdFx0XHRzb3VyY2UuZW1pdE9uZSgzKTtcblx0XHRcdHNvdXJjZS5yZXNvbHZlKCk7XG5cblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBzb3VyY2UuYXN5bmNJdGVyYWJsZSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGl0ZW0sICdudW1iZXInKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZE9uUmV0dXJuLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbWl0TWFueSBlbWl0cyBhbGwgaXRlbXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVNvdXJjZTxudW1iZXI+KCk7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBbMTAsIDIwLCAzMCwgNDBdO1xuXHRcdFx0c291cmNlLmVtaXRNYW55KHZhbHVlcyk7XG5cdFx0XHRzb3VyY2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2Ygc291cmNlLmFzeW5jSXRlcmFibGUpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB2YWx1ZXMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2FuY2VsbGFibGVJdGVyYWJsZScsICgpID0+IHtcblx0XHRsZXQgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGl0ZXJhdGUgdGhyb3VnaCBhbGwgdmFsdWVzIHdoZW4gbm90IGNhbmNlbGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgYXN5bmNJdGVyYWJsZSA9IHtcblx0XHRcdFx0YXN5bmMgKltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKSB7XG5cdFx0XHRcdFx0eWllbGQgJ2EnO1xuXHRcdFx0XHRcdHlpZWxkICdiJztcblx0XHRcdFx0XHR5aWVsZCAnYyc7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNhbmNlbGFibGVJdGVyYWJsZSA9IGFzeW5jLmNhbmNlbGxhYmxlSXRlcmFibGUoYXN5bmNJdGVyYWJsZSwgY3RzLnRva2VuKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgSXRlcmFibGUuYXN5bmNUb0FycmF5KGNhbmNlbGFibGVJdGVyYWJsZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWydhJywgJ2InLCAnYyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdG9wIGl0ZXJhdGlvbiBpbW1lZGlhdGVseSB3aGVuIGNhbmNlbGxlZCBiZWZvcmUgc3RhcnRpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGFzeW5jSXRlcmFibGUgPSB7XG5cdFx0XHRcdGFzeW5jICpbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKCdpdGVyYXRvciBjcmVhdGVkJyk7XG5cdFx0XHRcdFx0eWllbGQgJ2EnO1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKCdhZnRlciBhJyk7XG5cdFx0XHRcdFx0eWllbGQgJ2InO1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKCdhZnRlciBiJyk7XG5cdFx0XHRcdFx0eWllbGQgJ2MnO1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKCdhZnRlciBjJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIENhbmNlbCBiZWZvcmUgaXRlcmF0aW9uIHN0YXJ0c1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0Y29uc3QgY2FuY2VsYWJsZUl0ZXJhYmxlID0gYXN5bmMuY2FuY2VsbGFibGVJdGVyYWJsZShhc3luY0l0ZXJhYmxlLCBjdHMudG9rZW4pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBJdGVyYWJsZS5hc3luY1RvQXJyYXkoY2FuY2VsYWJsZUl0ZXJhYmxlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0b3AgaXRlcmF0aW9uIHdoZW4gY2FuY2VsbGVkIGR1cmluZyBpdGVyYXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IGRlZmVycmVkQSA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGRlZmVycmVkQiA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGRlZmVycmVkQyA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRcdFx0Y29uc3QgdmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBhc3luY0l0ZXJhYmxlID0ge1xuXHRcdFx0XHRhc3luYyAqW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHtcblx0XHRcdFx0XHR2YWx1ZXMucHVzaCgnYSB5aWVsZGVkJyk7XG5cdFx0XHRcdFx0eWllbGQgJ2EnO1xuXHRcdFx0XHRcdGF3YWl0IGRlZmVycmVkQS5wO1xuXG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goJ2IgeWllbGRlZCcpO1xuXHRcdFx0XHRcdHlpZWxkICdiJztcblx0XHRcdFx0XHRhd2FpdCBkZWZlcnJlZEIucDtcblxuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKCdjIHlpZWxkZWQnKTtcblx0XHRcdFx0XHR5aWVsZCAnYyc7XG5cdFx0XHRcdFx0YXdhaXQgZGVmZXJyZWRDLnA7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGZvciBhd2FpdCAoY29uc3QgdmFsdWUgb2YgYXN5bmMuY2FuY2VsbGFibGVJdGVyYWJsZShhc3luY0l0ZXJhYmxlLCBjdHMudG9rZW4pKSB7XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ2EnKSB7XG5cdFx0XHRcdFx0ZGVmZXJyZWRBLmNvbXBsZXRlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICdiJykge1xuXHRcdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0XHRkZWZlcnJlZEIuY29tcGxldGUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdmFsdWUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWydhIHlpZWxkZWQnLCAnYiB5aWVsZGVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZXR1cm4gbWV0aG9kIGNvcnJlY3RseScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCByZXR1cm5DYWxsZWQgPSBmYWxzZTtcblx0XHRcdGxldCBuID0gMDtcblx0XHRcdGNvbnN0IGFzeW5jSXRlcmFibGUgPSB7XG5cdFx0XHRcdGFzeW5jICpbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR5aWVsZCAnYSc7IG4rKztcblx0XHRcdFx0XHRcdHlpZWxkICdiJzsgbisrO1xuXHRcdFx0XHRcdFx0eWllbGQgJ2MnOyBuKys7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHJldHVybkNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQWRkIGEgcmV0dXJuIG1ldGhvZCB0byB0aGUgaXRlcmF0b3Jcblx0XHRcdGNvbnN0IG9yaWdpbmFsSXRlcmFibGUgPSBhc3luY0l0ZXJhYmxlW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpO1xuXHRcdFx0b3JpZ2luYWxJdGVyYWJsZS5yZXR1cm4gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybkNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBkb25lOiB0cnVlLCB2YWx1ZTogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgdGVzdC1zcGVjaWZpYyBpdGVyYWJsZSB3aXRoIG91ciBtb2NrZWQgaXRlcmF0b3Jcblx0XHRcdGNvbnN0IHRlc3RJdGVyYWJsZSA9IHtcblx0XHRcdFx0W1N5bWJvbC5hc3luY0l0ZXJhdG9yXTogKCkgPT4gb3JpZ2luYWxJdGVyYWJsZVxuXHRcdFx0fTtcblxuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCB2YWx1ZSBvZiBhc3luYy5jYW5jZWxsYWJsZUl0ZXJhYmxlKHRlc3RJdGVyYWJsZSwgY3RzLnRva2VuKSkge1xuXHRcdFx0XHRpZiAodmFsdWUgPT09ICdiJykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXR1cm5DYWxsZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG4gPCAyLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHRzdWl0ZSgnQXN5bmNJdGVyYWJsZVByb2R1Y2VyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2VtaXRPbmUgcHJvZHVjZXMgc2luZ2xlIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgyKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbWl0TWFueSBwcm9kdWNlcyBtdWx0aXBsZSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbMSwgMiwgM10pO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KFs0LCA1XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21peGVkIGVtaXRPbmUgYW5kIGVtaXRNYW55JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbMiwgM10pO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoNCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FzeW5jIGV4ZWN1dG9yIHdpdGggZW1pdE9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgyKTtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3luYyBleGVjdXRvciB3aXRoIGVtaXRNYW55JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkoWzEsIDJdKTtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbMywgNF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzLCA0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3Qgd2l0aCBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkRXJyb3IgPSBuZXcgRXJyb3IoJ3Rlc3QgZXJyb3InKTtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIucmVqZWN0KGV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGxldCBjYXVnaHRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjYXVnaHRFcnJvciA9IGVycm9yIGFzIEVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzFdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXVnaHRFcnJvciwgZXhwZWN0ZWRFcnJvcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3luYyBleGVjdXRvciB0aHJvd3MgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZEVycm9yID0gbmV3IEVycm9yKCdleGVjdXRvciBlcnJvcicpO1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0dGhyb3cgZXhwZWN0ZWRFcnJvcjtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRsZXQgY2F1Z2h0RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2F1Z2h0RXJyb3IgPSBlcnJvciBhcyBFcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2F1Z2h0RXJyb3IsIGV4cGVjdGVkRXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgcHJvZHVjZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0Ly8gRG9uJ3QgZW1pdCBhbnl0aGluZ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FzeW5jIGV4ZWN1dG9yIHJlc29sdmVzIHdpdGhvdXQgZW1pdHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0Ly8gRG9uJ3QgZW1pdCBhbnl0aGluZ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGl0ZXJhdG9ycyBvbiBzYW1lIHByb2R1Y2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkoWzEsIDIsIDNdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBGaXJzdCBpdGVyYXRvciBzaG91bGQgY29uc3VtZSBhbGwgdmFsdWVzXG5cdFx0XHRjb25zdCByZXN1bHQxOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdDEucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2Vjb25kIGl0ZXJhdG9yIHNob3VsZCBub3Qgc2VlIGFueSB2YWx1ZXMgKGFscmVhZHkgY29uc3VtZWQpXG5cdFx0XHRjb25zdCByZXN1bHQyOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdDIucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLCBbMSwgMiwgM10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IGl0ZXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgyKTtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGl0ZXJhdG9yMSA9IHByb2R1Y2VyW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpO1xuXHRcdFx0Y29uc3QgaXRlcmF0b3IyID0gcHJvZHVjZXJbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG5cblx0XHRcdC8vIEJvdGggaXRlcmF0b3JzIHNoYXJlIHRoZSBzYW1lIHVuZGVybHlpbmcgcHJvZHVjZXJcblx0XHRcdGNvbnN0IGZpcnN0MSA9IGF3YWl0IGl0ZXJhdG9yMS5uZXh0KCk7XG5cdFx0XHRjb25zdCBmaXJzdDIgPSBhd2FpdCBpdGVyYXRvcjIubmV4dCgpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kMSA9IGF3YWl0IGl0ZXJhdG9yMS5uZXh0KCk7XG5cdFx0XHRjb25zdCBzZWNvbmQyID0gYXdhaXQgaXRlcmF0b3IyLm5leHQoKTtcblxuXHRcdFx0Ly8gU2luY2UgdGhleSBzaGFyZSB0aGUgc2FtZSBwcm9kdWNlciwgdmFsdWVzIGFyZSBjb25zdW1lZCBpbiBvcmRlclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0MS52YWx1ZSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QyLnZhbHVlLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQxLnZhbHVlLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQyLmRvbmUsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhlY3V0b3Igd2l0aCBwcm9taXNlIHJldHVybiB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgyKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGVjdXRvciB3aXRoIG5vbi1wcm9taXNlIHJldHVybiB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgyKTtcblx0XHRcdFx0cmV0dXJuICdzb21lIHZhbHVlJztcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1pdE1hbnkgd2l0aCBlbXB0eSBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkoW10pO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMik7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDJdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdCBpbW1lZGlhdGVseSB3aXRob3V0IGVtaXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRFcnJvciA9IG5ldyBFcnJvcignaW1tZWRpYXRlIGVycm9yJyk7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5yZWplY3QoZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9KTtcblxuXHRcdFx0bGV0IGNhdWdodEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgX2l0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIG5vdCBpdGVyYXRlIHdoZW4gcmVqZWN0ZWQgaW1tZWRpYXRlbHknKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2F1Z2h0RXJyb3IgPSBlcnJvciBhcyBFcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhdWdodEVycm9yLCBleHBlY3RlZEVycm9yKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZyB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8c3RyaW5nPihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKCdoZWxsbycpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KFsnd29ybGQnLCAndGVzdCddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbJ2hlbGxvJywgJ3dvcmxkJywgJ3Rlc3QnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvYmplY3QgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aW50ZXJmYWNlIFRlc3RPYmplY3Qge1xuXHRcdFx0XHRpZDogbnVtYmVyO1xuXHRcdFx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxUZXN0T2JqZWN0PihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKHsgaWQ6IDEsIG5hbWU6ICdmaXJzdCcgfSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkoW1xuXHRcdFx0XHRcdHsgaWQ6IDIsIG5hbWU6ICdzZWNvbmQnIH0sXG5cdFx0XHRcdFx0eyBpZDogMywgbmFtZTogJ3RoaXJkJyB9XG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogVGVzdE9iamVjdFtdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRcdHsgaWQ6IDEsIG5hbWU6ICdmaXJzdCcgfSxcblx0XHRcdFx0eyBpZDogMiwgbmFtZTogJ3NlY29uZCcgfSxcblx0XHRcdFx0eyBpZDogMywgbmFtZTogJ3RoaXJkJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RlZSAtIGJvdGggaXRlcmF0b3JzIHJlY2VpdmUgYWxsIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRPRE86IEltcGxlbWVudGF0aW9uIGJ1ZyAtIGV4ZWN1dG9ycyBkb24ndCBhd2FpdCBzdGFydCgpLCBjYXVzaW5nIHByb2R1Y2VycyB0byBmaW5hbGl6ZSBlYXJseVxuXHRcdFx0YXN5bmMgZnVuY3Rpb24qIHNvdXJjZUdlbmVyYXRvcigpIHtcblx0XHRcdFx0eWllbGQgMTtcblx0XHRcdFx0eWllbGQgMjtcblx0XHRcdFx0eWllbGQgMztcblx0XHRcdFx0eWllbGQgNDtcblx0XHRcdFx0eWllbGQgNTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2l0ZXIxLCBpdGVyMl0gPSBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXIudGVlKHNvdXJjZUdlbmVyYXRvcigpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MTogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc3VsdDI6IG51bWJlcltdID0gW107XG5cblx0XHRcdC8vIENvbnN1bWUgYm90aCBpdGVyYWJsZXMgY29uY3VycmVudGx5XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIxKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQxLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpLFxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyMikge1xuXHRcdFx0XHRcdFx0cmVzdWx0Mi5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MSwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MiwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RlZSAtIHNlcXVlbnRpYWwgY29uc3VtcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUT0RPOiBJbXBsZW1lbnRhdGlvbiBidWcgLSBleGVjdXRvcnMgZG9uJ3QgYXdhaXQgc3RhcnQoKSwgY2F1c2luZyBwcm9kdWNlcnMgdG8gZmluYWxpemUgZWFybHlcblx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbMSwgMiwgM10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IFtpdGVyMSwgaXRlcjJdID0gYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyLnRlZShzb3VyY2UpO1xuXG5cdFx0XHQvLyBDb25zdW1lIGZpcnN0IGl0ZXJhdG9yIGNvbXBsZXRlbHlcblx0XHRcdGNvbnN0IHJlc3VsdDE6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcjEpIHtcblx0XHRcdFx0cmVzdWx0MS5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGVuIGNvbnN1bWUgc2Vjb25kIGl0ZXJhdG9yXG5cdFx0XHRjb25zdCByZXN1bHQyOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIyKSB7XG5cdFx0XHRcdHJlc3VsdDIucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLCBbMSwgMiwgM10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCBbMSwgMiwgM10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCd0ZWUgLSBlbXB0eSBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUT0RPOiBJbXBsZW1lbnRhdGlvbiBidWcgLSBleGVjdXRvcnMgZG9uJ3QgYXdhaXQgc3RhcnQoKSwgY2F1c2luZyBwcm9kdWNlcnMgdG8gZmluYWxpemUgZWFybHlcblx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0Ly8gRW1pdCBub3RoaW5nXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgW2l0ZXIxLCBpdGVyMl0gPSBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXIudGVlKHNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDE6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCByZXN1bHQyOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIxKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQxLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpLFxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyMikge1xuXHRcdFx0XHRcdFx0cmVzdWx0Mi5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ3RlZSAtIGhhbmRsZXMgZXJyb3JzIGluIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRPRE86IEltcGxlbWVudGF0aW9uIGJ1ZyAtIGV4ZWN1dG9ycyBkb24ndCBhd2FpdCBzdGFydCgpLCBjYXVzaW5nIHByb2R1Y2VycyB0byBmaW5hbGl6ZSBlYXJseVxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRFcnJvciA9IG5ldyBFcnJvcignc291cmNlIGVycm9yJyk7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDIpO1xuXHRcdFx0XHR0aHJvdyBleHBlY3RlZEVycm9yO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IFtpdGVyMSwgaXRlcjJdID0gYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyLnRlZShzb3VyY2UpO1xuXG5cdFx0XHRsZXQgZXJyb3IxOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBlcnJvcjI6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzdWx0MTogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc3VsdDI6IG51bWJlcltdID0gW107XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIxKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdDEucHVzaChpdGVtKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRlcnJvcjEgPSBlIGFzIEVycm9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSxcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIyKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdDIucHVzaChpdGVtKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRlcnJvcjIgPSBlIGFzIEVycm9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIEJvdGggaXRlcmF0b3JzIHNob3VsZCBoYXZlIHJlY2VpdmVkIHRoZSBzYW1lIHZhbHVlcyBiZWZvcmUgZXJyb3Jcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MSwgWzEsIDJdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MiwgWzEsIDJdKTtcblxuXHRcdFx0Ly8gQm90aCBzaG91bGQgaGF2ZSByZWNlaXZlZCB0aGUgZXJyb3Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcjEsIGV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yMiwgZXhwZWN0ZWRFcnJvcik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBc3luY1JlYWRlcicsICgpID0+IHtcblx0XHRhc3luYyBmdW5jdGlvbiogY3JlYXRlQXN5bmNJdGVyYXRvcjxUPih2YWx1ZXM6IFRbXSk6IEFzeW5jSXRlcmF0b3I8VD4ge1xuXHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0eWllbGQgdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24qIGNyZWF0ZURlbGF5ZWRBc3luY0l0ZXJhdG9yPFQ+KHZhbHVlczogVFtdLCBkZWxheU1zOiBudW1iZXIgPSAxKTogQXN5bmNJdGVyYXRvcjxUPiB7XG5cdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KGRlbGF5TXMpO1xuXHRcdFx0XHR5aWVsZCB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdyZWFkIC0gYmFzaWMgZnVuY3Rpb25hbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxLCAyLCAzXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkIC0gZW1wdHkgaXRlcmF0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbmRPZlN0cmVhbSBwcm9wZXJ0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxLCAyXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLmVuZE9mU3RyZWFtLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkKCk7IC8vIDFcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIuZW5kT2ZTdHJlYW0sIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgcmVhZGVyLnJlYWQoKTsgLy8gMlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgZmFsc2UpO1xuXG5cdFx0XHRhd2FpdCByZWFkZXIucmVhZCgpOyAvLyBlbmRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIuZW5kT2ZTdHJlYW0sIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVlayAtIGJhc2ljIGZ1bmN0aW9uYWxpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMSwgMiwgM10pKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5wZWVrKCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5wZWVrKCksIDEpOyAvLyBTaG91bGQgcmV0dXJuIHNhbWUgdmFsdWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAxKTsgLy8gU2hvdWxkIGNvbnN1bWUgdGhlIHBlZWtlZCB2YWx1ZVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrIC0gZW1wdHkgaXRlcmF0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkU3luY09yVGhyb3cgLSB0aHJvd3Mgd2hlbiBubyBkYXRhIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxXSkpO1xuXG5cdFx0XHQvLyBSZWFkIHRoZSBvbmx5IGl0ZW1cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkKCk7XG5cblx0XHRcdC8vIFNob3VsZCB0aHJvdyBzaW5jZSBubyBtb3JlIGRhdGEgYW5kIG5vdCBhdCBlbmQgeWV0XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJlYWRlci5yZWFkQnVmZmVyZWRPclRocm93KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZFN5bmNPclRocm93IC0gcmV0dXJucyBlbmQgb2Ygc3RyZWFtIHdoZW4gYXQgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoW10pKTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBlbmQgZGV0ZWN0aW9uXG5cdFx0XHRhd2FpdCByZWFkZXIucmVhZCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLnJlYWRCdWZmZXJlZE9yVGhyb3coKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrU3luY09yVGhyb3cgLSB3aXRoIGJ1ZmZlcmVkIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMSwgMiwgM10pKTtcblxuXHRcdFx0Ly8gRmlyc3QgcGVlayB0byBwb3B1bGF0ZSBidWZmZXJcblx0XHRcdGF3YWl0IHJlYWRlci5wZWVrKCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBhYmxlIHRvIHBlZWsgc3luYyBub3dcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIucGVla0J1ZmZlcmVkT3JUaHJvdygpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIucGVla0J1ZmZlcmVkT3JUaHJvdygpLCAxKTsgLy8gU2hvdWxkIHJldHVybiBzYW1lIHZhbHVlXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrU3luY09yVGhyb3cgLSB0aHJvd3Mgd2hlbiBubyBkYXRhIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxXSkpO1xuXG5cdFx0XHQvLyBTaG91bGQgdGhyb3cgc2luY2UgYnVmZmVyIGlzIGVtcHR5IGFuZCB3ZSBoYXZlbid0IGxvYWRlZCBhbnl0aGluZ1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiByZWFkZXIucGVla0J1ZmZlcmVkT3JUaHJvdygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZWtTeW5jT3JUaHJvdyAtIHJldHVybnMgZW5kIG9mIHN0cmVhbSB3aGVuIGF0IGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFtdKSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgZW5kIGRldGVjdGlvblxuXHRcdFx0YXdhaXQgcmVhZGVyLnBlZWsoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5wZWVrQnVmZmVyZWRPclRocm93KCksIGFzeW5jLkFzeW5jUmVhZGVyRW5kT2ZTdHJlYW0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29uc3VtZVRvRW5kIC0gY29uc3VtZXMgYWxsIHJlbWFpbmluZyBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDMsIDQsIDVdKSk7XG5cblx0XHRcdC8vIFJlYWQgc29tZSBkYXRhIGZpcnN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMik7XG5cblx0XHRcdC8vIENvbnN1bWUgdGhlIHJlc3Rcblx0XHRcdGF3YWl0IHJlYWRlci5jb25zdW1lVG9FbmQoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25zdW1lVG9FbmQgLSBvbiBlbXB0eSByZWFkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbXSkpO1xuXG5cdFx0XHRhd2FpdCByZWFkZXIuY29uc3VtZVRvRW5kKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIuZW5kT2ZTdHJlYW0sIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZFdoaWxlIC0gYmFzaWMgZnVuY3Rpb25hbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxLCAyLCAzLCA0LCA1XSkpO1xuXHRcdFx0Y29uc3QgY29sbGVjdGVkOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHRhd2FpdCByZWFkZXIucmVhZFdoaWxlKFxuXHRcdFx0XHR2YWx1ZSA9PiB2YWx1ZSA8IDQsXG5cdFx0XHRcdGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0XHRjb2xsZWN0ZWQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdGVkLCBbMSwgMiwgM10pO1xuXG5cdFx0XHQvLyBOZXh0IHJlYWQgc2hvdWxkIHJldHVybiA0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgNCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkV2hpbGUgLSBzdG9wcyBhdCBlbmQgb2Ygc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdKSk7XG5cdFx0XHRjb25zdCBjb2xsZWN0ZWQ6IG51bWJlcltdID0gW107XG5cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkV2hpbGUoXG5cdFx0XHRcdHZhbHVlID0+IHZhbHVlIDwgMTAsIC8vIEFsd2F5cyB0cnVlXG5cdFx0XHRcdGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0XHRjb2xsZWN0ZWQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdGVkLCBbMSwgMiwgM10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkV2hpbGUgLSBlbXB0eSBpdGVyYXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFtdKSk7XG5cdFx0XHRjb25zdCBjb2xsZWN0ZWQ6IG51bWJlcltdID0gW107XG5cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkV2hpbGUoXG5cdFx0XHRcdHZhbHVlID0+IHRydWUsXG5cdFx0XHRcdGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0XHRjb2xsZWN0ZWQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdGVkLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkV2hpbGUgLSBwcmVkaWNhdGUgcmV0dXJucyBmYWxzZSBpbW1lZGlhdGVseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxLCAyLCAzXSkpO1xuXHRcdFx0Y29uc3QgY29sbGVjdGVkOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHRhd2FpdCByZWFkZXIucmVhZFdoaWxlKFxuXHRcdFx0XHR2YWx1ZSA9PiBmYWxzZSwgLy8gQWx3YXlzIGZhbHNlXG5cdFx0XHRcdGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0XHRjb2xsZWN0ZWQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdGVkLCBbXSk7XG5cblx0XHRcdC8vIEZpcnN0IGl0ZW0gc2hvdWxkIHN0aWxsIGJlIGF2YWlsYWJsZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVla1RpbWVvdXQgLSB3aXRoIGltbWVkaWF0ZSBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRlci5wZWVrVGltZW91dCgxMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrVGltZW91dCAtIHdpdGggZGVsYXllZCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZURlbGF5ZWRBc3luY0l0ZXJhdG9yKFsxLCAyLCAzXSwgMTApKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZGVyLnBlZWtUaW1lb3V0KDUwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVla1RpbWVvdXQgLSB0aW1lb3V0IG9jY3VycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZURlbGF5ZWRBc3luY0l0ZXJhdG9yKFsxLCAyLCAzXSwgNTApKTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkZXIucGVla1RpbWVvdXQoMTApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGF3YWl0IHJlYWRlci5jb25zdW1lVG9FbmQoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVla1RpbWVvdXQgLSBlbXB0eSBpdGVyYXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFtdKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRlci5wZWVrVGltZW91dCgxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZWtUaW1lb3V0IC0gYWZ0ZXIgY29uc3VtaW5nIGFsbCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzFdKSk7XG5cblx0XHRcdGF3YWl0IHJlYWRlci5jb25zdW1lVG9FbmQoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRlci5wZWVrVGltZW91dCgxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21peGVkIG9wZXJhdGlvbnMgLSBjb21wbGV4IHNjZW5hcmlvJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwXSkpO1xuXG5cdFx0XHQvLyBQZWVrIGZpcnN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgMSk7XG5cblx0XHRcdC8vIFJlYWQgc29tZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksIDIpO1xuXG5cdFx0XHQvLyBQZWVrIGFnYWluXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgMyk7XG5cblx0XHRcdC8vIFJlYWQgd2hpbGVcblx0XHRcdGNvbnN0IGNvbGxlY3RlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkV2hpbGUoXG5cdFx0XHRcdHZhbHVlID0+IHZhbHVlIDw9IDUsXG5cdFx0XHRcdGFzeW5jIHZhbHVlID0+IGNvbGxlY3RlZC5wdXNoKHZhbHVlKVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdGVkLCBbMywgNCwgNV0pO1xuXG5cdFx0XHQvLyBVc2Ugc3luYyBvcGVyYXRpb25zXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLnBlZWtCdWZmZXJlZE9yVGhyb3coKSwgNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLnJlYWRCdWZmZXJlZE9yVGhyb3coKSwgNik7XG5cblx0XHRcdC8vIENvbnN1bWUgcmVzdFxuXHRcdFx0YXdhaXQgcmVhZGVyLmNvbnN1bWVUb0VuZCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpbmcgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWydoZWxsbycsICd3b3JsZCcsICd0ZXN0J10pKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksICdoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5wZWVrKCksICd3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksICd3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksICd0ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvYmplY3QgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aW50ZXJmYWNlIFRlc3RPYmoge1xuXHRcdFx0XHRpZDogbnVtYmVyO1xuXHRcdFx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9iamVjdHM6IFRlc3RPYmpbXSA9IFtcblx0XHRcdFx0eyBpZDogMSwgbmFtZTogJ2ZpcnN0JyB9LFxuXHRcdFx0XHR7IGlkOiAyLCBuYW1lOiAnc2Vjb25kJyB9LFxuXHRcdFx0XHR7IGlkOiAzLCBuYW1lOiAndGhpcmQnIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKG9iamVjdHMpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCB7IGlkOiAxLCBuYW1lOiAnZmlyc3QnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucGVlaygpLCB7IGlkOiAyLCBuYW1lOiAnc2Vjb25kJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgeyBpZDogMiwgbmFtZTogJ3NlY29uZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IG9wZXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlRGVsYXllZEFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdLCA1KSk7XG5cblx0XHRcdC8vIFN0YXJ0IG11bHRpcGxlIG9wZXJhdGlvbnMgY29uY3VycmVudGx5XG5cdFx0XHRjb25zdCBwZWVrUHJvbWlzZSA9IHJlYWRlci5wZWVrKCk7XG5cdFx0XHRjb25zdCByZWFkUHJvbWlzZSA9IHJlYWRlci5yZWFkKCk7XG5cblx0XHRcdGNvbnN0IFtwZWVrUmVzdWx0LCByZWFkUmVzdWx0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtwZWVrUHJvbWlzZSwgcmVhZFByb21pc2VdKTtcblxuXHRcdFx0Ly8gQm90aCBzaG91bGQgcmV0dXJuIHRoZSBzYW1lIGZpcnN0IHZhbHVlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVla1Jlc3VsdCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZFJlc3VsdCwgMSk7XG5cblx0XHRcdC8vIE5leHQgcmVhZCBzaG91bGQgZ2V0IHRoZSBzZWNvbmQgdmFsdWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1ZmZlciBtYW5hZ2VtZW50IC0gc2luZ2xlIGV4dGVuZCBidWZmZXIgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBuZXh0Q2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IG1vY2tJdGVyYXRvcjogQXN5bmNJdGVyYXRvcjxudW1iZXI+ID0ge1xuXHRcdFx0XHRhc3luYyBuZXh0KCkge1xuXHRcdFx0XHRcdG5leHRDYWxsQ291bnQrKztcblx0XHRcdFx0XHRpZiAobmV4dENhbGxDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiAxLCBkb25lOiBmYWxzZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogdW5kZWZpbmVkLCBkb25lOiB0cnVlIH07XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihtb2NrSXRlcmF0b3IpO1xuXG5cdFx0XHQvLyBNdWx0aXBsZSBjb25jdXJyZW50IG9wZXJhdGlvbnMgc2hvdWxkIG9ubHkgdHJpZ2dlciBvbmUgZXh0ZW5kIGJ1ZmZlciBjYWxsXG5cdFx0XHRjb25zdCBwcm9taXNlcyA9IFtcblx0XHRcdFx0cmVhZGVyLnBlZWsoKSxcblx0XHRcdFx0cmVhZGVyLnBlZWsoKSxcblx0XHRcdFx0cmVhZGVyLnJlYWQoKVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBjYWxsZWQgbmV4dCgpIG9ubHkgb25jZSBkZXNwaXRlIG11bHRpcGxlIGNvbmN1cnJlbnQgb3BlcmF0aW9uc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHRDYWxsQ291bnQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixZQUFZLG9CQUFvQjtBQUNoQyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsTUFBTSxTQUFTLE1BQU07QUFFcEIsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxRQUFNLHFCQUFxQixXQUFZO0FBQ3RDLFNBQUssMkNBQTRDLFdBQVk7QUFDNUQsVUFBSSxXQUFXO0FBQ2YsWUFBTSxVQUFVLE1BQU0sd0JBQXdCLFdBQVM7QUFDdEQsY0FBTSxJQUFJLE1BQU0sd0JBQXdCLE9BQUs7QUFBRSxzQkFBWTtBQUFBLFFBQUcsQ0FBQyxDQUFDO0FBQ2hFLGVBQU8sSUFBSSxRQUFRLGFBQVc7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LEdBQUcsTUFBTSxzQkFBc0I7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyxpQkFBaUIsWUFBWTtBQU1qQyxZQUFNLFVBQXFCO0FBQUEsUUFDMUIsRUFBRSxJQUFJLEdBQUcsTUFBTSxRQUFRO0FBQUEsUUFDdkIsRUFBRSxJQUFJLEdBQUcsTUFBTSxTQUFTO0FBQUEsUUFDeEIsRUFBRSxJQUFJLEdBQUcsTUFBTSxRQUFRO0FBQUEsTUFDeEI7QUFFQSxZQUFNLFNBQVMsSUFBSSxNQUFNLFlBQVksb0JBQW9CLE9BQU8sQ0FBQztBQUVqRSxhQUFPLGdCQUFnQixNQUFNLE9BQU8sS0FBSyxHQUFHLEVBQUUsSUFBSSxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQ3BFLGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxLQUFLLEdBQUcsRUFBRSxJQUFJLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFDckUsYUFBTyxnQkFBZ0IsTUFBTSxPQUFPLEtBQUssR0FBRyxFQUFFLElBQUksR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUFBLElBQ3RFLENBQUM7QUFFRCxTQUFLLHlCQUF5QixZQUFZO0FBQ3pDLFlBQU0sU0FBUyxJQUFJLE1BQU0sWUFBWSwyQkFBMkIsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUc3RSxZQUFNLGNBQWMsT0FBTyxLQUFLO0FBQ2hDLFlBQU0sY0FBYyxPQUFPLEtBQUs7QUFFaEMsWUFBTSxDQUFDLFlBQVksVUFBVSxJQUFJLE1BQU0sUUFBUSxJQUFJLENBQUMsYUFBYSxXQUFXLENBQUM7QUFHN0UsYUFBTyxZQUFZLFlBQVksQ0FBQztBQUNoQyxhQUFPLFlBQVksWUFBWSxDQUFDO0FBR2hDLGFBQU8sWUFBWSxNQUFNLE9BQU8sS0FBSyxHQUFHLENBQUM7QUFBQSxJQUMxQyxDQUFDO0FBRUQsU0FBSyxpREFBaUQsWUFBWTtBQUNqRSxVQUFJLGdCQUFnQjtBQUNwQixZQUFNLGVBQXNDO0FBQUEsUUFDM0MsTUFBTSxPQUFPO0FBQ1o7QUFDQSxjQUFJLGtCQUFrQixHQUFHO0FBQ3hCLGtCQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ3JCLG1CQUFPLEVBQUUsT0FBTyxHQUFHLE1BQU0sTUFBTTtBQUFBLFVBQ2hDO0FBQ0EsaUJBQU8sRUFBRSxPQUFPLFFBQVcsTUFBTSxLQUFLO0FBQUEsUUFDdkM7QUFBQSxNQUNEO0FBRUEsWUFBTSxTQUFTLElBQUksTUFBTSxZQUFZLFlBQVk7QUFHakQsWUFBTSxXQUFXO0FBQUEsUUFDaEIsT0FBTyxLQUFLO0FBQUEsUUFDWixPQUFPLEtBQUs7QUFBQSxRQUNaLE9BQU8sS0FBSztBQUFBLE1BQ2I7QUFFQSxZQUFNLFFBQVEsSUFBSSxRQUFRO0FBRzFCLGFBQU8sWUFBWSxlQUFlLENBQUM7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsic3RvcmUiLCAicCIsICJ0ZXN0IiwgImN0cyJdCn0K
