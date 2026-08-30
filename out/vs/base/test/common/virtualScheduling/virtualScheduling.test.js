import assert from "assert";
import { CancellationTokenSource } from "../../../common/cancellation.js";
import { DisposableStore } from "../../../common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../utils.js";
import {
  createTraceRoot,
  createVirtualTimeApi,
  drainMicrotasksEmbedding,
  nextMacrotask,
  pushGlobalTimeApi,
  realTimeApi,
  runWithFakedTimers,
  TraceContext,
  untilIdle,
  untilTime,
  untilToken,
  VirtualClock,
  VirtualTimeProcessor
} from "./index.js";
function traceInfo(t) {
  const labels = [];
  for (let c = t; c; c = c.parent) {
    labels.push(c.label);
  }
  return { labels, rootLabel: t.root.label, depth: t.depth };
}
function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const realSink = { afterMicrotaskClosure: (cb) => nextMacrotask(realTimeApi, cb) };
suite("virtualScheduling - Trace + TraceContext", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  test("Trace.describe builds causal chain from leaf to root", () => {
    const root = createTraceRoot("fixture");
    const t1 = root.child("setTimeout(100ms)");
    const t2 = t1.child("await continuation");
    assert.deepStrictEqual(traceInfo(t2), {
      labels: ["await continuation", "setTimeout(100ms)", "fixture"],
      rootLabel: "fixture",
      depth: 2
    });
  });
  test("runWithTrace installs and restores synchronously; supports nesting", () => {
    const a = createTraceRoot("a");
    const b = createTraceRoot("b");
    const observations = [];
    observations.push(TraceContext.instance.currentTrace().label);
    TraceContext.instance.runWithTrace(a, () => {
      observations.push(TraceContext.instance.currentTrace().label);
      TraceContext.instance.runWithTrace(b, () => {
        observations.push(TraceContext.instance.currentTrace().label);
      });
      observations.push(TraceContext.instance.currentTrace().label);
    });
    observations.push(TraceContext.instance.currentTrace().label);
    assert.deepStrictEqual(observations, ["<root>", "a", "b", "a", "<root>"]);
  });
  test("runAsHandler throws on sync re-entry", () => {
    const a = createTraceRoot("a");
    const b = createTraceRoot("b");
    assert.throws(
      () => TraceContext.instance.runAsHandler(
        a,
        () => TraceContext.instance.runAsHandler(b, () => {
        }, realSink),
        realSink
      ),
      /re-entrant/
    );
  });
  test("runAsHandler leaks trace across awaited microtasks", async () => {
    const root = createTraceRoot("fixture");
    const observed = [];
    await TraceContext.instance.runAsHandler(root, async () => {
      observed.push(TraceContext.instance.currentTrace().label);
      await Promise.resolve();
      observed.push(TraceContext.instance.currentTrace().label);
      await Promise.resolve().then(() => Promise.resolve());
      observed.push(TraceContext.instance.currentTrace().label);
    }, realSink);
    assert.deepStrictEqual(observed, ["fixture", "fixture", "fixture"]);
  });
});
suite("virtualScheduling - createVirtualTimeApi trace propagation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  test("virtual setTimeout: callback fires under trace child of schedule-time trace", async () => {
    await runWithFakedTimers({}, async () => {
      const root = createTraceRoot("root");
      const { promise, resolve } = deferred();
      TraceContext.instance.runAsHandler(root, () => {
        setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
      }, realSink);
      const observed = await promise;
      assert.deepStrictEqual(traceInfo(observed), {
        labels: ["setTimeout(0ms)", "root"],
        rootLabel: "root",
        depth: 1
      });
    });
  });
  test("virtual nested setTimeout preserves full causal chain", async () => {
    await runWithFakedTimers({}, async () => {
      const root = createTraceRoot("root");
      const { promise, resolve } = deferred();
      TraceContext.instance.runAsHandler(root, () => {
        setTimeout(() => {
          setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
        }, 0);
      }, realSink);
      const observed = await promise;
      assert.deepStrictEqual(traceInfo(observed), {
        labels: ["setTimeout(0ms)", "setTimeout(0ms)", "root"],
        rootLabel: "root",
        depth: 2
      });
    });
  });
  test("virtual setInterval: each tick gets a fresh child trace", async () => {
    await runWithFakedTimers({}, async () => {
      const root = createTraceRoot("root");
      const observed = [];
      const { promise, resolve } = deferred();
      TraceContext.instance.runAsHandler(root, () => {
        const id = setInterval(() => {
          observed.push(TraceContext.instance.currentTrace());
          if (observed.length === 3) {
            clearInterval(id);
            resolve();
          }
        }, 5);
      }, realSink);
      await promise;
      assert.deepStrictEqual(observed.map(traceInfo), [
        { labels: ["tick #1", "setInterval(5ms)", "root"], rootLabel: "root", depth: 2 },
        { labels: ["tick #2", "setInterval(5ms)", "root"], rootLabel: "root", depth: 2 },
        { labels: ["tick #3", "setInterval(5ms)", "root"], rootLabel: "root", depth: 2 }
      ]);
    });
  });
  test("concurrent runAsHandler via setTimeout(0): traces do not leak across handlers", async () => {
    await runWithFakedTimers({}, async () => {
      const a = createTraceRoot("a");
      const b = createTraceRoot("b");
      const { promise: doneA, resolve: resA } = deferred();
      const { promise: doneB, resolve: resB } = deferred();
      TraceContext.instance.runAsHandler(a, () => {
        setTimeout(() => resA(TraceContext.instance.currentTrace()), 0);
      }, realSink);
      TraceContext.instance.runAsHandler(b, () => {
        setTimeout(() => resB(TraceContext.instance.currentTrace()), 0);
      }, realSink);
      const [tA, tB] = await Promise.all([doneA, doneB]);
      assert.deepStrictEqual({
        aRoot: tA.root.label,
        aLabels: traceInfo(tA).labels,
        bRoot: tB.root.label,
        bLabels: traceInfo(tB).labels
      }, {
        aRoot: "a",
        aLabels: ["setTimeout(0ms)", "a"],
        bRoot: "b",
        bLabels: ["setTimeout(0ms)", "b"]
      });
    });
  });
});
suite("virtualScheduling - VirtualTimeProcessor termination policies", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  function makeProcessor(store, clock) {
    return store.add(new VirtualTimeProcessor(
      clock,
      drainMicrotasksEmbedding(realTimeApi),
      realTimeApi,
      { defaultMaxEvents: 50 }
    ));
  }
  test("untilIdle: resolves when queue drains", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const log = [];
    clock.schedule({ time: 5, source: { toString: () => "t1" }, run: () => log.push("a") });
    clock.schedule({ time: 10, source: { toString: () => "t2" }, run: () => log.push("b") });
    await p.run({ until: untilIdle });
    assert.deepStrictEqual(log, ["a", "b"]);
    store.dispose();
  });
  test("untilTime: resolves at deadline even when no events scheduled", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    await p.run({ until: untilTime(100) });
    assert.strictEqual(clock.now, 100);
    store.dispose();
  });
  test("untilTime: pre-scheduled events run before deadline", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const log = [];
    clock.schedule({ time: 50, source: { toString: () => "t" }, run: () => log.push("a") });
    await p.run({ until: untilTime(100) });
    assert.deepStrictEqual({ log, virtualNow: clock.now }, { log: ["a"], virtualNow: 100 });
    store.dispose();
  });
  test("untilTime: events strictly past the deadline are NOT executed", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const log = [];
    clock.schedule({ time: 50, source: { toString: () => "a" }, run: () => log.push("a") });
    clock.schedule({ time: 100, source: { toString: () => "b" }, run: () => log.push("b") });
    clock.schedule({ time: 101, source: { toString: () => "c" }, run: () => log.push("c") });
    await p.run({ until: untilTime(100) });
    assert.deepStrictEqual(log, ["a", "b"]);
    store.dispose();
  });
  test("untilToken: resolves only after token cancellation AND drain", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const cts = store.add(new CancellationTokenSource());
    const log = [];
    const runP = p.run({ until: untilToken(cts.token) });
    await Promise.resolve();
    clock.schedule({ time: 5, source: { toString: () => "t" }, run: () => log.push("a") });
    cts.cancel();
    await runP;
    assert.deepStrictEqual(log, ["a"]);
    store.dispose();
  });
  test("maxEvents: rejects when too many events are executed", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const tick = (n) => {
      clock.schedule({
        time: clock.now + 1,
        source: { toString: () => `t${n}` },
        run: () => tick(n + 1)
      });
    };
    tick(0);
    await assert.rejects(
      p.run({ until: untilIdle, maxEvents: 5 }),
      /exceeded maxEvents/
    );
    store.dispose();
  });
  test("disposal rejects all active runs", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const cts = store.add(new CancellationTokenSource());
    const runP = p.run({ until: untilToken(cts.token) });
    p.dispose();
    await assert.rejects(runP, /disposed/);
    store.dispose();
  });
});
suite("virtualScheduling - runWithFakedTimers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  test("drains queue after fn() resolves", async () => {
    const log = [];
    await runWithFakedTimers({}, async () => {
      setTimeout(() => log.push("a"), 100);
      setTimeout(() => log.push("b"), 50);
    });
    assert.deepStrictEqual(log, ["b", "a"]);
  });
  test("useFakeTimers=false bypasses virtual time", async () => {
    const before = globalThis.setTimeout;
    await runWithFakedTimers({ useFakeTimers: false }, async () => {
      assert.strictEqual(globalThis.setTimeout, before);
    });
  });
  test("promise chains awaited inside fn() resolve deterministically", async () => {
    const log = [];
    await runWithFakedTimers({}, async () => {
      await new Promise((resolve) => {
        setTimeout(async () => {
          log.push("1");
          await Promise.resolve();
          log.push("2");
          setTimeout(() => {
            log.push("3");
            resolve();
          }, 10);
        }, 5);
      });
    });
    assert.deepStrictEqual(log, ["1", "2", "3"]);
  });
});
suite("virtualScheduling - createVirtualTimeApi without processor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("virtual wall and monotonic clocks stay consistent", () => {
    const clock = new VirtualClock(12345);
    const api = createVirtualTimeApi(clock, { fakeRequestAnimationFrame: true });
    const originalPerformanceNow = performance.now;
    const originalPerformanceTimeOrigin = performance.timeOrigin;
    const restore = pushGlobalTimeApi(api);
    let animationFrameTime;
    let actual;
    try {
      requestAnimationFrame((time) => animationFrameTime = time);
      clock.runNext();
      actual = {
        dateNow: Date.now(),
        performanceNow: performance.now(),
        performanceTimeOrigin: performance.timeOrigin,
        animationFrameTime
      };
    } finally {
      restore.dispose();
    }
    assert.deepStrictEqual({
      actual,
      restoredPerformanceNow: performance.now === originalPerformanceNow,
      restoredPerformanceTimeOrigin: performance.timeOrigin
    }, {
      actual: {
        dateNow: 12361,
        performanceNow: 16,
        performanceTimeOrigin: 12345,
        animationFrameTime: 16
      },
      restoredPerformanceNow: true,
      restoredPerformanceTimeOrigin: originalPerformanceTimeOrigin
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHZpcnR1YWxTY2hlZHVsaW5nXFx2aXJ0dWFsU2NoZWR1bGluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0Y3JlYXRlVHJhY2VSb290LFxuXHRjcmVhdGVWaXJ0dWFsVGltZUFwaSxcblx0ZHJhaW5NaWNyb3Rhc2tzRW1iZWRkaW5nLFxuXHRuZXh0TWFjcm90YXNrLFxuXHRwdXNoR2xvYmFsVGltZUFwaSxcblx0cmVhbFRpbWVBcGksXG5cdHJ1bldpdGhGYWtlZFRpbWVycyxcblx0VHJhY2UsXG5cdFRyYWNlQ29udGV4dCxcblx0dW50aWxJZGxlLFxuXHR1bnRpbFRpbWUsXG5cdHVudGlsVG9rZW4sXG5cdFZpcnR1YWxDbG9jayxcblx0VmlydHVhbFRpbWVQcm9jZXNzb3IsXG59IGZyb20gJy4vaW5kZXguanMnO1xuXG5mdW5jdGlvbiB0cmFjZUluZm8odDogVHJhY2UpOiB7IGxhYmVsczogc3RyaW5nW107IHJvb3RMYWJlbDogc3RyaW5nOyBkZXB0aDogbnVtYmVyIH0ge1xuXHRjb25zdCBsYWJlbHM6IHN0cmluZ1tdID0gW107XG5cdGZvciAobGV0IGM6IFRyYWNlIHwgdW5kZWZpbmVkID0gdDsgYzsgYyA9IGMucGFyZW50KSB7IGxhYmVscy5wdXNoKGMubGFiZWwpOyB9XG5cdHJldHVybiB7IGxhYmVscywgcm9vdExhYmVsOiB0LnJvb3QubGFiZWwsIGRlcHRoOiB0LmRlcHRoIH07XG59XG5cbmZ1bmN0aW9uIGRlZmVycmVkPFQ+KCk6IHsgcHJvbWlzZTogUHJvbWlzZTxUPjsgcmVzb2x2ZTogKHY6IFQpID0+IHZvaWQgfSB7XG5cdGxldCByZXNvbHZlITogKHY6IFQpID0+IHZvaWQ7XG5cdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTxUPihyZXMgPT4geyByZXNvbHZlID0gcmVzOyB9KTtcblx0cmV0dXJuIHsgcHJvbWlzZSwgcmVzb2x2ZSB9O1xufVxuXG5jb25zdCByZWFsU2luayA9IHsgYWZ0ZXJNaWNyb3Rhc2tDbG9zdXJlOiAoY2I6ICgpID0+IHZvaWQpID0+IG5leHRNYWNyb3Rhc2socmVhbFRpbWVBcGksIGNiKSB9O1xuXG5zdWl0ZSgndmlydHVhbFNjaGVkdWxpbmcgLSBUcmFjZSArIFRyYWNlQ29udGV4dCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlYXJkb3duKCgpID0+IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5fcmVzZXRGb3JUZXN0aW5nKCkpO1xuXG5cdHRlc3QoJ1RyYWNlLmRlc2NyaWJlIGJ1aWxkcyBjYXVzYWwgY2hhaW4gZnJvbSBsZWFmIHRvIHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVRyYWNlUm9vdCgnZml4dHVyZScpO1xuXHRcdGNvbnN0IHQxID0gcm9vdC5jaGlsZCgnc2V0VGltZW91dCgxMDBtcyknKTtcblx0XHRjb25zdCB0MiA9IHQxLmNoaWxkKCdhd2FpdCBjb250aW51YXRpb24nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNlSW5mbyh0MiksIHtcblx0XHRcdGxhYmVsczogWydhd2FpdCBjb250aW51YXRpb24nLCAnc2V0VGltZW91dCgxMDBtcyknLCAnZml4dHVyZSddLFxuXHRcdFx0cm9vdExhYmVsOiAnZml4dHVyZScsXG5cdFx0XHRkZXB0aDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncnVuV2l0aFRyYWNlIGluc3RhbGxzIGFuZCByZXN0b3JlcyBzeW5jaHJvbm91c2x5OyBzdXBwb3J0cyBuZXN0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVUcmFjZVJvb3QoJ2EnKTtcblx0XHRjb25zdCBiID0gY3JlYXRlVHJhY2VSb290KCdiJyk7XG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdG9ic2VydmF0aW9ucy5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5sYWJlbCk7XG5cdFx0VHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bldpdGhUcmFjZShhLCAoKSA9PiB7XG5cdFx0XHRvYnNlcnZhdGlvbnMucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkubGFiZWwpO1xuXHRcdFx0VHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bldpdGhUcmFjZShiLCAoKSA9PiB7XG5cdFx0XHRcdG9ic2VydmF0aW9ucy5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5sYWJlbCk7XG5cdFx0XHR9KTtcblx0XHRcdG9ic2VydmF0aW9ucy5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5sYWJlbCk7XG5cdFx0fSk7XG5cdFx0b2JzZXJ2YXRpb25zLnB1c2goVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpLmxhYmVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9ic2VydmF0aW9ucywgWyc8cm9vdD4nLCAnYScsICdiJywgJ2EnLCAnPHJvb3Q+J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5Bc0hhbmRsZXIgdGhyb3dzIG9uIHN5bmMgcmUtZW50cnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IGNyZWF0ZVRyYWNlUm9vdCgnYScpO1xuXHRcdGNvbnN0IGIgPSBjcmVhdGVUcmFjZVJvb3QoJ2InKTtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gVHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihhLFxuXHRcdFx0XHQoKSA9PiBUcmFjZUNvbnRleHQuaW5zdGFuY2UucnVuQXNIYW5kbGVyKGIsICgpID0+IHsgfSwgcmVhbFNpbmspLFxuXHRcdFx0XHRyZWFsU2luayksXG5cdFx0XHQvcmUtZW50cmFudC8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncnVuQXNIYW5kbGVyIGxlYWtzIHRyYWNlIGFjcm9zcyBhd2FpdGVkIG1pY3JvdGFza3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVRyYWNlUm9vdCgnZml4dHVyZScpO1xuXHRcdGNvbnN0IG9ic2VydmVkOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0YXdhaXQgVHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihyb290LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRvYnNlcnZlZC5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5sYWJlbCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdG9ic2VydmVkLnB1c2goVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpLmxhYmVsKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCkpO1xuXHRcdFx0b2JzZXJ2ZWQucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkubGFiZWwpO1xuXHRcdH0sIHJlYWxTaW5rKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2JzZXJ2ZWQsIFsnZml4dHVyZScsICdmaXh0dXJlJywgJ2ZpeHR1cmUnXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCd2aXJ0dWFsU2NoZWR1bGluZyAtIGNyZWF0ZVZpcnR1YWxUaW1lQXBpIHRyYWNlIHByb3BhZ2F0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVhcmRvd24oKCkgPT4gVHJhY2VDb250ZXh0Lmluc3RhbmNlLl9yZXNldEZvclRlc3RpbmcoKSk7XG5cblx0dGVzdCgndmlydHVhbCBzZXRUaW1lb3V0OiBjYWxsYmFjayBmaXJlcyB1bmRlciB0cmFjZSBjaGlsZCBvZiBzY2hlZHVsZS10aW1lIHRyYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVRyYWNlUm9vdCgncm9vdCcpO1xuXHRcdFx0Y29uc3QgeyBwcm9taXNlLCByZXNvbHZlIH0gPSBkZWZlcnJlZDxUcmFjZT4oKTtcblx0XHRcdFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5Bc0hhbmRsZXIocm9vdCwgKCkgPT4ge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpKSwgMCk7XG5cdFx0XHR9LCByZWFsU2luayk7XG5cdFx0XHRjb25zdCBvYnNlcnZlZCA9IGF3YWl0IHByb21pc2U7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNlSW5mbyhvYnNlcnZlZCksIHtcblx0XHRcdFx0bGFiZWxzOiBbJ3NldFRpbWVvdXQoMG1zKScsICdyb290J10sXG5cdFx0XHRcdHJvb3RMYWJlbDogJ3Jvb3QnLFxuXHRcdFx0XHRkZXB0aDogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2aXJ0dWFsIG5lc3RlZCBzZXRUaW1lb3V0IHByZXNlcnZlcyBmdWxsIGNhdXNhbCBjaGFpbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVUcmFjZVJvb3QoJ3Jvb3QnKTtcblx0XHRcdGNvbnN0IHsgcHJvbWlzZSwgcmVzb2x2ZSB9ID0gZGVmZXJyZWQ8VHJhY2U+KCk7XG5cdFx0XHRUcmFjZUNvbnRleHQuaW5zdGFuY2UucnVuQXNIYW5kbGVyKHJvb3QsICgpID0+IHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiByZXNvbHZlKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKSksIDApO1xuXHRcdFx0XHR9LCAwKTtcblx0XHRcdH0sIHJlYWxTaW5rKTtcblx0XHRcdGNvbnN0IG9ic2VydmVkID0gYXdhaXQgcHJvbWlzZTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2VJbmZvKG9ic2VydmVkKSwge1xuXHRcdFx0XHRsYWJlbHM6IFsnc2V0VGltZW91dCgwbXMpJywgJ3NldFRpbWVvdXQoMG1zKScsICdyb290J10sXG5cdFx0XHRcdHJvb3RMYWJlbDogJ3Jvb3QnLFxuXHRcdFx0XHRkZXB0aDogMixcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2aXJ0dWFsIHNldEludGVydmFsOiBlYWNoIHRpY2sgZ2V0cyBhIGZyZXNoIGNoaWxkIHRyYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVRyYWNlUm9vdCgncm9vdCcpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZWQ6IFRyYWNlW10gPSBbXTtcblx0XHRcdGNvbnN0IHsgcHJvbWlzZSwgcmVzb2x2ZSB9ID0gZGVmZXJyZWQ8dm9pZD4oKTtcblx0XHRcdFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5Bc0hhbmRsZXIocm9vdCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0XHRvYnNlcnZlZC5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKSk7XG5cdFx0XHRcdFx0aWYgKG9ic2VydmVkLmxlbmd0aCA9PT0gMykgeyBjbGVhckludGVydmFsKGlkKTsgcmVzb2x2ZSgpOyB9XG5cdFx0XHRcdH0sIDUpO1xuXHRcdFx0fSwgcmVhbFNpbmspO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2JzZXJ2ZWQubWFwKHRyYWNlSW5mbyksIFtcblx0XHRcdFx0eyBsYWJlbHM6IFsndGljayAjMScsICdzZXRJbnRlcnZhbCg1bXMpJywgJ3Jvb3QnXSwgcm9vdExhYmVsOiAncm9vdCcsIGRlcHRoOiAyIH0sXG5cdFx0XHRcdHsgbGFiZWxzOiBbJ3RpY2sgIzInLCAnc2V0SW50ZXJ2YWwoNW1zKScsICdyb290J10sIHJvb3RMYWJlbDogJ3Jvb3QnLCBkZXB0aDogMiB9LFxuXHRcdFx0XHR7IGxhYmVsczogWyd0aWNrICMzJywgJ3NldEludGVydmFsKDVtcyknLCAncm9vdCddLCByb290TGFiZWw6ICdyb290JywgZGVwdGg6IDIgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IHJ1bkFzSGFuZGxlciB2aWEgc2V0VGltZW91dCgwKTogdHJhY2VzIGRvIG5vdCBsZWFrIGFjcm9zcyBoYW5kbGVycycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBjcmVhdGVUcmFjZVJvb3QoJ2EnKTtcblx0XHRcdGNvbnN0IGIgPSBjcmVhdGVUcmFjZVJvb3QoJ2InKTtcblx0XHRcdGNvbnN0IHsgcHJvbWlzZTogZG9uZUEsIHJlc29sdmU6IHJlc0EgfSA9IGRlZmVycmVkPFRyYWNlPigpO1xuXHRcdFx0Y29uc3QgeyBwcm9taXNlOiBkb25lQiwgcmVzb2x2ZTogcmVzQiB9ID0gZGVmZXJyZWQ8VHJhY2U+KCk7XG5cdFx0XHRUcmFjZUNvbnRleHQuaW5zdGFuY2UucnVuQXNIYW5kbGVyKGEsICgpID0+IHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiByZXNBKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKSksIDApO1xuXHRcdFx0fSwgcmVhbFNpbmspO1xuXHRcdFx0VHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihiLCAoKSA9PiB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcmVzQihUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkpLCAwKTtcblx0XHRcdH0sIHJlYWxTaW5rKTtcblx0XHRcdGNvbnN0IFt0QSwgdEJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2RvbmVBLCBkb25lQl0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFSb290OiB0QS5yb290LmxhYmVsLFxuXHRcdFx0XHRhTGFiZWxzOiB0cmFjZUluZm8odEEpLmxhYmVscyxcblx0XHRcdFx0YlJvb3Q6IHRCLnJvb3QubGFiZWwsXG5cdFx0XHRcdGJMYWJlbHM6IHRyYWNlSW5mbyh0QikubGFiZWxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhUm9vdDogJ2EnLFxuXHRcdFx0XHRhTGFiZWxzOiBbJ3NldFRpbWVvdXQoMG1zKScsICdhJ10sXG5cdFx0XHRcdGJSb290OiAnYicsXG5cdFx0XHRcdGJMYWJlbHM6IFsnc2V0VGltZW91dCgwbXMpJywgJ2InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndmlydHVhbFNjaGVkdWxpbmcgLSBWaXJ0dWFsVGltZVByb2Nlc3NvciB0ZXJtaW5hdGlvbiBwb2xpY2llcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlYXJkb3duKCgpID0+IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5fcmVzZXRGb3JUZXN0aW5nKCkpO1xuXG5cdGZ1bmN0aW9uIG1ha2VQcm9jZXNzb3Ioc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgY2xvY2s6IFZpcnR1YWxDbG9jayk6IFZpcnR1YWxUaW1lUHJvY2Vzc29yIHtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKG5ldyBWaXJ0dWFsVGltZVByb2Nlc3Nvcihcblx0XHRcdGNsb2NrLFxuXHRcdFx0ZHJhaW5NaWNyb3Rhc2tzRW1iZWRkaW5nKHJlYWxUaW1lQXBpKSxcblx0XHRcdHJlYWxUaW1lQXBpLFxuXHRcdFx0eyBkZWZhdWx0TWF4RXZlbnRzOiA1MCB9LFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgndW50aWxJZGxlOiByZXNvbHZlcyB3aGVuIHF1ZXVlIGRyYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBWaXJ0dWFsQ2xvY2soKTtcblx0XHRjb25zdCBwID0gbWFrZVByb2Nlc3NvcihzdG9yZSwgY2xvY2spO1xuXHRcdGNvbnN0IGxvZzogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNsb2NrLnNjaGVkdWxlKHsgdGltZTogNSwgc291cmNlOiB7IHRvU3RyaW5nOiAoKSA9PiAndDEnIH0sIHJ1bjogKCkgPT4gbG9nLnB1c2goJ2EnKSB9KTtcblx0XHRjbG9jay5zY2hlZHVsZSh7IHRpbWU6IDEwLCBzb3VyY2U6IHsgdG9TdHJpbmc6ICgpID0+ICd0MicgfSwgcnVuOiAoKSA9PiBsb2cucHVzaCgnYicpIH0pO1xuXG5cdFx0YXdhaXQgcC5ydW4oeyB1bnRpbDogdW50aWxJZGxlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLCBbJ2EnLCAnYiddKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VudGlsVGltZTogcmVzb2x2ZXMgYXQgZGVhZGxpbmUgZXZlbiB3aGVuIG5vIGV2ZW50cyBzY2hlZHVsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIGRlYWRsaW5lIGFsb25lIFx1MjAxNCB3aXRoIG5vIG90aGVyIGV2ZW50cyBxdWV1ZWQgXHUyMDE0IG11c3Qgc3RpbGwgZHJpdmVcblx0XHQvLyB2aXJ0dWFsIHRpbWUgdG8gdGhlIGRlYWRsaW5lLiBUaGUgcHJvY2Vzc29yIGluc2VydHMgYSBzZW50aW5lbFxuXHRcdC8vIGV2ZW50IGF0IHRoZSBkZWFkbGluZSB0byBndWFyYW50ZWUgdGhpcy5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBWaXJ0dWFsQ2xvY2soKTtcblx0XHRjb25zdCBwID0gbWFrZVByb2Nlc3NvcihzdG9yZSwgY2xvY2spO1xuXG5cdFx0YXdhaXQgcC5ydW4oeyB1bnRpbDogdW50aWxUaW1lKDEwMCkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb2NrLm5vdywgMTAwKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VudGlsVGltZTogcHJlLXNjaGVkdWxlZCBldmVudHMgcnVuIGJlZm9yZSBkZWFkbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBWaXJ0dWFsQ2xvY2soKTtcblx0XHRjb25zdCBwID0gbWFrZVByb2Nlc3NvcihzdG9yZSwgY2xvY2spO1xuXHRcdGNvbnN0IGxvZzogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNsb2NrLnNjaGVkdWxlKHsgdGltZTogNTAsIHNvdXJjZTogeyB0b1N0cmluZzogKCkgPT4gJ3QnIH0sIHJ1bjogKCkgPT4gbG9nLnB1c2goJ2EnKSB9KTtcblxuXHRcdGF3YWl0IHAucnVuKHsgdW50aWw6IHVudGlsVGltZSgxMDApIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBsb2csIHZpcnR1YWxOb3c6IGNsb2NrLm5vdyB9LCB7IGxvZzogWydhJ10sIHZpcnR1YWxOb3c6IDEwMCB9KTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VudGlsVGltZTogZXZlbnRzIHN0cmljdGx5IHBhc3QgdGhlIGRlYWRsaW5lIGFyZSBOT1QgZXhlY3V0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKCk7XG5cdFx0Y29uc3QgcCA9IG1ha2VQcm9jZXNzb3Ioc3RvcmUsIGNsb2NrKTtcblx0XHRjb25zdCBsb2c6IHN0cmluZ1tdID0gW107XG5cblx0XHRjbG9jay5zY2hlZHVsZSh7IHRpbWU6IDUwLCBzb3VyY2U6IHsgdG9TdHJpbmc6ICgpID0+ICdhJyB9LCBydW46ICgpID0+IGxvZy5wdXNoKCdhJykgfSk7XG5cdFx0Y2xvY2suc2NoZWR1bGUoeyB0aW1lOiAxMDAsIHNvdXJjZTogeyB0b1N0cmluZzogKCkgPT4gJ2InIH0sIHJ1bjogKCkgPT4gbG9nLnB1c2goJ2InKSB9KTtcblx0XHRjbG9jay5zY2hlZHVsZSh7IHRpbWU6IDEwMSwgc291cmNlOiB7IHRvU3RyaW5nOiAoKSA9PiAnYycgfSwgcnVuOiAoKSA9PiBsb2cucHVzaCgnYycpIH0pO1xuXG5cdFx0YXdhaXQgcC5ydW4oeyB1bnRpbDogdW50aWxUaW1lKDEwMCkgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2csIFsnYScsICdiJ10pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndW50aWxUb2tlbjogcmVzb2x2ZXMgb25seSBhZnRlciB0b2tlbiBjYW5jZWxsYXRpb24gQU5EIGRyYWluJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNsb2NrID0gbmV3IFZpcnR1YWxDbG9jaygpO1xuXHRcdGNvbnN0IHAgPSBtYWtlUHJvY2Vzc29yKHN0b3JlLCBjbG9jayk7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCBsb2c6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBydW5QID0gcC5ydW4oeyB1bnRpbDogdW50aWxUb2tlbihjdHMudG9rZW4pIH0pO1xuXG5cdFx0Ly8gV2hpbGUgcnVuIGlzIHBhcmtlZCAobm8gZXZlbnRzKSwgc2NoZWR1bGUgKyBjYW5jZWwuXG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y2xvY2suc2NoZWR1bGUoeyB0aW1lOiA1LCBzb3VyY2U6IHsgdG9TdHJpbmc6ICgpID0+ICd0JyB9LCBydW46ICgpID0+IGxvZy5wdXNoKCdhJykgfSk7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgcnVuUDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZywgWydhJ10pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWF4RXZlbnRzOiByZWplY3RzIHdoZW4gdG9vIG1hbnkgZXZlbnRzIGFyZSBleGVjdXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBWaXJ0dWFsQ2xvY2soKTtcblx0XHRjb25zdCBwID0gbWFrZVByb2Nlc3NvcihzdG9yZSwgY2xvY2spO1xuXG5cdFx0Ly8gU2VsZi1yZXNjaGVkdWxpbmcgdGltZXJcblx0XHRjb25zdCB0aWNrID0gKG46IG51bWJlcikgPT4ge1xuXHRcdFx0Y2xvY2suc2NoZWR1bGUoe1xuXHRcdFx0XHR0aW1lOiBjbG9jay5ub3cgKyAxLFxuXHRcdFx0XHRzb3VyY2U6IHsgdG9TdHJpbmc6ICgpID0+IGB0JHtufWAgfSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aWNrKG4gKyAxKSxcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0dGljaygwKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0cC5ydW4oeyB1bnRpbDogdW50aWxJZGxlLCBtYXhFdmVudHM6IDUgfSksXG5cdFx0XHQvZXhjZWVkZWQgbWF4RXZlbnRzLyxcblx0XHQpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zYWwgcmVqZWN0cyBhbGwgYWN0aXZlIHJ1bnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKCk7XG5cdFx0Y29uc3QgcCA9IG1ha2VQcm9jZXNzb3Ioc3RvcmUsIGNsb2NrKTtcblx0XHRjb25zdCBjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Y29uc3QgcnVuUCA9IHAucnVuKHsgdW50aWw6IHVudGlsVG9rZW4oY3RzLnRva2VuKSB9KTtcblx0XHRwLmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJ1blAsIC9kaXNwb3NlZC8pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3ZpcnR1YWxTY2hlZHVsaW5nIC0gcnVuV2l0aEZha2VkVGltZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVhcmRvd24oKCkgPT4gVHJhY2VDb250ZXh0Lmluc3RhbmNlLl9yZXNldEZvclRlc3RpbmcoKSk7XG5cblx0dGVzdCgnZHJhaW5zIHF1ZXVlIGFmdGVyIGZuKCkgcmVzb2x2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiBsb2cucHVzaCgnYScpLCAxMDApO1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiBsb2cucHVzaCgnYicpLCA1MCk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2csIFsnYicsICdhJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VGYWtlVGltZXJzPWZhbHNlIGJ5cGFzc2VzIHZpcnR1YWwgdGltZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiZWZvcmUgPSBnbG9iYWxUaGlzLnNldFRpbWVvdXQ7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogZmFsc2UgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2JhbFRoaXMuc2V0VGltZW91dCwgYmVmb3JlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbWlzZSBjaGFpbnMgYXdhaXRlZCBpbnNpZGUgZm4oKSByZXNvbHZlIGRldGVybWluaXN0aWNhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZzogc3RyaW5nW10gPSBbXTtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRsb2cucHVzaCgnMScpO1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRcdGxvZy5wdXNoKCcyJyk7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7IGxvZy5wdXNoKCczJyk7IHJlc29sdmUoKTsgfSwgMTApO1xuXHRcdFx0XHR9LCA1KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLCBbJzEnLCAnMicsICczJ10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndmlydHVhbFNjaGVkdWxpbmcgLSBjcmVhdGVWaXJ0dWFsVGltZUFwaSB3aXRob3V0IHByb2Nlc3NvcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndmlydHVhbCB3YWxsIGFuZCBtb25vdG9uaWMgY2xvY2tzIHN0YXkgY29uc2lzdGVudCcsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBWaXJ0dWFsQ2xvY2soMTIzNDUpO1xuXHRcdGNvbnN0IGFwaSA9IGNyZWF0ZVZpcnR1YWxUaW1lQXBpKGNsb2NrLCB7IGZha2VSZXF1ZXN0QW5pbWF0aW9uRnJhbWU6IHRydWUgfSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxQZXJmb3JtYW5jZU5vdyA9IHBlcmZvcm1hbmNlLm5vdztcblx0XHRjb25zdCBvcmlnaW5hbFBlcmZvcm1hbmNlVGltZU9yaWdpbiA9IHBlcmZvcm1hbmNlLnRpbWVPcmlnaW47XG5cdFx0Y29uc3QgcmVzdG9yZSA9IHB1c2hHbG9iYWxUaW1lQXBpKGFwaSk7XG5cdFx0bGV0IGFuaW1hdGlvbkZyYW1lVGltZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhY3R1YWw6IG9iamVjdDtcblx0XHR0cnkge1xuXHRcdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRpbWUgPT4gYW5pbWF0aW9uRnJhbWVUaW1lID0gdGltZSk7XG5cdFx0XHRjbG9jay5ydW5OZXh0KCk7XG5cdFx0XHRhY3R1YWwgPSB7XG5cdFx0XHRcdGRhdGVOb3c6IERhdGUubm93KCksXG5cdFx0XHRcdHBlcmZvcm1hbmNlTm93OiBwZXJmb3JtYW5jZS5ub3coKSxcblx0XHRcdFx0cGVyZm9ybWFuY2VUaW1lT3JpZ2luOiBwZXJmb3JtYW5jZS50aW1lT3JpZ2luLFxuXHRcdFx0XHRhbmltYXRpb25GcmFtZVRpbWUsXG5cdFx0XHR9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3R1YWwsXG5cdFx0XHRyZXN0b3JlZFBlcmZvcm1hbmNlTm93OiBwZXJmb3JtYW5jZS5ub3cgPT09IG9yaWdpbmFsUGVyZm9ybWFuY2VOb3csXG5cdFx0XHRyZXN0b3JlZFBlcmZvcm1hbmNlVGltZU9yaWdpbjogcGVyZm9ybWFuY2UudGltZU9yaWdpbixcblx0XHR9LCB7XG5cdFx0XHRhY3R1YWw6IHtcblx0XHRcdFx0ZGF0ZU5vdzogMTIzNjEsXG5cdFx0XHRcdHBlcmZvcm1hbmNlTm93OiAxNixcblx0XHRcdFx0cGVyZm9ybWFuY2VUaW1lT3JpZ2luOiAxMjM0NSxcblx0XHRcdFx0YW5pbWF0aW9uRnJhbWVUaW1lOiAxNixcblx0XHRcdH0sXG5cdFx0XHRyZXN0b3JlZFBlcmZvcm1hbmNlTm93OiB0cnVlLFxuXHRcdFx0cmVzdG9yZWRQZXJmb3JtYW5jZVRpbWVPcmlnaW46IG9yaWdpbmFsUGVyZm9ybWFuY2VUaW1lT3JpZ2luLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hEO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFB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
