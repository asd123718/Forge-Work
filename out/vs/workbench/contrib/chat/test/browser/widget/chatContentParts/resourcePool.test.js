import assert from "assert";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { ResourcePool, KeyedResourcePool } from "../../../../browser/widget/chatContentParts/chatCollections.js";
class MockPoolItem {
  constructor() {
    this.isDisposed = false;
  }
  dispose() {
    this.isDisposed = true;
  }
}
suite("ResourcePool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let createCount;
  setup(() => {
    disposables = store.add(new DisposableStore());
    createCount = 0;
  });
  function createPool(options) {
    const pool = new ResourcePool(() => {
      createCount++;
      return new MockPoolItem();
    }, options);
    disposables.add(pool);
    return pool;
  }
  test("creates new items on get", () => {
    const pool = createPool();
    const a = pool.get();
    const b = pool.get();
    assert.notStrictEqual(a, b);
    assert.strictEqual(createCount, 2);
    assert.strictEqual(pool.inUse.size, 2);
  });
  test("reuses released items", () => {
    const pool = createPool();
    const a = pool.get();
    pool.release(a);
    const b = pool.get();
    assert.strictEqual(a, b);
    assert.strictEqual(createCount, 1);
  });
  test("clear disposes idle items but not in-use items", () => {
    const pool = createPool();
    const a = pool.get();
    const b = pool.get();
    pool.release(b);
    pool.clear();
    assert.ok(b.isDisposed, "idle item should be disposed");
    assert.ok(!a.isDisposed, "in-use item should not be disposed");
    assert.strictEqual(pool.inUse.size, 1);
  });
  test("dispose disposes all items including in-use", () => {
    const pool = createPool();
    const a = pool.get();
    const b = pool.get();
    pool.release(b);
    disposables.delete(pool);
    pool.dispose();
    assert.ok(a.isDisposed, "in-use item should be disposed");
    assert.ok(b.isDisposed, "idle item should be disposed");
  });
  test("trimming disposes excess idle items after delay", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });
    const a = pool.get();
    const b = pool.get();
    const c = pool.get();
    pool.release(a);
    pool.release(b);
    pool.release(c);
    assert.ok(!a.isDisposed);
    assert.ok(!b.isDisposed);
    assert.ok(!c.isDisposed);
    await timeout(100);
    const disposedCount = [a, b, c].filter((x) => x.isDisposed).length;
    assert.strictEqual(disposedCount, 2, "should dispose 2 excess items");
  }));
  test("trim timer is debounced on rapid releases", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 100 });
    const a = pool.get();
    pool.release(a);
    assert.ok(!a.isDisposed, "should not be disposed immediately");
    const b = pool.get();
    pool.release(b);
    await timeout(50);
    assert.ok(!a.isDisposed, "should not be disposed yet (timer was debounced)");
    await timeout(100);
    assert.ok(a.isDisposed, "should be disposed after debounce completes");
  }));
  test("no trimming when maxIdleSize is not set", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool();
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push(pool.get());
    }
    for (const item of items) {
      pool.release(item);
    }
    await timeout(50);
    assert.ok(items.every((i) => !i.isDisposed), "no items should be disposed without maxIdleSize");
  }));
});
suite("KeyedResourcePool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let createCount;
  setup(() => {
    disposables = store.add(new DisposableStore());
    createCount = 0;
  });
  function createPool(options) {
    const pool = new KeyedResourcePool(() => {
      createCount++;
      return new MockPoolItem();
    }, options);
    disposables.add(pool);
    return pool;
  }
  test("creates new items on get", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    assert.notStrictEqual(a, b);
    assert.strictEqual(createCount, 2);
    assert.strictEqual(pool.inUse.size, 2);
  });
  test("keyed get returns item previously released with same key", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(a, "key1");
    pool.release(b, "key2");
    const c = pool.get("key2");
    assert.strictEqual(c, b, "should return the item released with key2");
    const d = pool.get("key1");
    assert.strictEqual(d, a, "should return the item released with key1");
    assert.strictEqual(createCount, 2);
  });
  test("keyed get falls back to any idle item when key not found", () => {
    const pool = createPool();
    const a = pool.get("key1");
    pool.release(a, "key1");
    const b = pool.get("unknown-key");
    assert.strictEqual(b, a, "should return the idle item even with a different key");
  });
  test("multiple items can share the same key", () => {
    const pool = createPool();
    const a = pool.get("shared");
    const b = pool.get("shared");
    assert.notStrictEqual(a, b, "should create separate items");
    pool.release(a, "shared");
    pool.release(b, "shared");
    const c = pool.get("shared");
    assert.ok(c === a || c === b, "should return one of the keyed items");
  });
  test("key reassignment removes old key association", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(a, "key1");
    pool.release(b, "key2");
    const reused = pool.get("key1");
    assert.strictEqual(reused, a);
    pool.release(reused, "key2");
    const c = pool.get("key1");
    pool.release(c, "key1");
    const d = pool.get("key2");
    assert.ok(d === a || d === b);
  });
  test("clear disposes idle items and clears key map", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(a, "key1");
    pool.release(b, "key2");
    pool.clear();
    assert.ok(a.isDisposed);
    assert.ok(b.isDisposed);
    const c = pool.get("key1");
    assert.notStrictEqual(c, a, "should create new item after clear");
  });
  test("dispose disposes all items including in-use", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(b, "key2");
    disposables.delete(pool);
    pool.dispose();
    assert.ok(a.isDisposed);
    assert.ok(b.isDisposed);
  });
  test("trimming disposes excess idle items", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });
    const a = pool.get("a");
    const b = pool.get("b");
    const c = pool.get("c");
    pool.release(a, "a");
    pool.release(b, "b");
    pool.release(c, "c");
    await timeout(100);
    const disposedCount = [a, b, c].filter((x) => x.isDisposed).length;
    assert.strictEqual(disposedCount, 2, "should dispose 2 excess items");
  }));
  test("trimming cleans up key associations for disposed items", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 50 });
    const a = pool.get("key1");
    pool.release(a, "key1");
    await timeout(100);
    assert.ok(a.isDisposed);
    const b = pool.get("key1");
    assert.notStrictEqual(a, b, "should create new item since keyed item was trimmed");
    assert.strictEqual(createCount, 2);
  }));
  test("repeated key reassignment does not grow stale associations", () => {
    const pool = createPool();
    const item = pool.get("key-0");
    for (let i = 0; i < 100; i++) {
      pool.release(item, `key-${i}`);
      const reused = pool.get(`key-${i}`);
      assert.strictEqual(reused, item);
    }
    pool.release(item, "final-key");
    const result = pool.get("final-key");
    assert.strictEqual(result, item);
    assert.strictEqual(createCount, 1, "should have only created one item");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xccmVzb3VyY2VQb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVBvb2wsIEtleWVkUmVzb3VyY2VQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGVjdGlvbnMuanMnO1xuXG5jbGFzcyBNb2NrUG9vbEl0ZW0gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHR9XG59XG5cbnN1aXRlKCdSZXNvdXJjZVBvb2wnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgY3JlYXRlQ291bnQ6IG51bWJlcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjcmVhdGVDb3VudCA9IDA7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVBvb2wob3B0aW9ucz86IHsgbWF4SWRsZVNpemU/OiBudW1iZXI7IHRyaW1JZGxlRGVsYXk/OiBudW1iZXIgfSk6IFJlc291cmNlUG9vbDxNb2NrUG9vbEl0ZW0+IHtcblx0XHRjb25zdCBwb29sID0gbmV3IFJlc291cmNlUG9vbDxNb2NrUG9vbEl0ZW0+KCgpID0+IHtcblx0XHRcdGNyZWF0ZUNvdW50Kys7XG5cdFx0XHRyZXR1cm4gbmV3IE1vY2tQb29sSXRlbSgpO1xuXHRcdH0sIG9wdGlvbnMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwb29sKTtcblx0XHRyZXR1cm4gcG9vbDtcblx0fVxuXG5cdHRlc3QoJ2NyZWF0ZXMgbmV3IGl0ZW1zIG9uIGdldCcsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhLCBiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb29sLmluVXNlLnNpemUsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZXMgcmVsZWFzZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoKTtcblx0XHRwb29sLnJlbGVhc2UoYSk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEsIGIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyIGRpc3Bvc2VzIGlkbGUgaXRlbXMgYnV0IG5vdCBpbi11c2UgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoKTtcblx0XHRwb29sLnJlbGVhc2UoYik7XG5cblx0XHRwb29sLmNsZWFyKCk7XG5cblx0XHRhc3NlcnQub2soYi5pc0Rpc3Bvc2VkLCAnaWRsZSBpdGVtIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXHRcdGFzc2VydC5vayghYS5pc0Rpc3Bvc2VkLCAnaW4tdXNlIGl0ZW0gc2hvdWxkIG5vdCBiZSBkaXNwb3NlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb29sLmluVXNlLnNpemUsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGRpc3Bvc2VzIGFsbCBpdGVtcyBpbmNsdWRpbmcgaW4tdXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCk7XG5cdFx0cG9vbC5yZWxlYXNlKGIpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGVsZXRlKHBvb2wpO1xuXHRcdHBvb2wuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGEuaXNEaXNwb3NlZCwgJ2luLXVzZSBpdGVtIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXHRcdGFzc2VydC5vayhiLmlzRGlzcG9zZWQsICdpZGxlIGl0ZW0gc2hvdWxkIGJlIGRpc3Bvc2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaW1taW5nIGRpc3Bvc2VzIGV4Y2VzcyBpZGxlIGl0ZW1zIGFmdGVyIGRlbGF5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woeyBtYXhJZGxlU2l6ZTogMSwgdHJpbUlkbGVEZWxheTogNTAgfSk7XG5cblx0XHRjb25zdCBhID0gcG9vbC5nZXQoKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoKTtcblx0XHRjb25zdCBjID0gcG9vbC5nZXQoKTtcblx0XHRwb29sLnJlbGVhc2UoYSk7XG5cdFx0cG9vbC5yZWxlYXNlKGIpO1xuXHRcdHBvb2wucmVsZWFzZShjKTtcblxuXHRcdGFzc2VydC5vayghYS5pc0Rpc3Bvc2VkKTtcblx0XHRhc3NlcnQub2soIWIuaXNEaXNwb3NlZCk7XG5cdFx0YXNzZXJ0Lm9rKCFjLmlzRGlzcG9zZWQpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXG5cdFx0Y29uc3QgZGlzcG9zZWRDb3VudCA9IFthLCBiLCBjXS5maWx0ZXIoeCA9PiB4LmlzRGlzcG9zZWQpLmxlbmd0aDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRDb3VudCwgMiwgJ3Nob3VsZCBkaXNwb3NlIDIgZXhjZXNzIGl0ZW1zJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCd0cmltIHRpbWVyIGlzIGRlYm91bmNlZCBvbiByYXBpZCByZWxlYXNlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKHsgbWF4SWRsZVNpemU6IDAsIHRyaW1JZGxlRGVsYXk6IDEwMCB9KTtcblxuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgpO1xuXHRcdHBvb2wucmVsZWFzZShhKTtcblx0XHRhc3NlcnQub2soIWEuaXNEaXNwb3NlZCwgJ3Nob3VsZCBub3QgYmUgZGlzcG9zZWQgaW1tZWRpYXRlbHknKTtcblxuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgpO1xuXHRcdHBvb2wucmVsZWFzZShiKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXHRcdGFzc2VydC5vayghYS5pc0Rpc3Bvc2VkLCAnc2hvdWxkIG5vdCBiZSBkaXNwb3NlZCB5ZXQgKHRpbWVyIHdhcyBkZWJvdW5jZWQpJyk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cdFx0YXNzZXJ0Lm9rKGEuaXNEaXNwb3NlZCwgJ3Nob3VsZCBiZSBkaXNwb3NlZCBhZnRlciBkZWJvdW5jZSBjb21wbGV0ZXMnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25vIHRyaW1taW5nIHdoZW4gbWF4SWRsZVNpemUgaXMgbm90IHNldCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cblx0XHRjb25zdCBpdGVtcyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTA7IGkrKykge1xuXHRcdFx0aXRlbXMucHVzaChwb29sLmdldCgpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRwb29sLnJlbGVhc2UoaXRlbSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cdFx0YXNzZXJ0Lm9rKGl0ZW1zLmV2ZXJ5KGkgPT4gIWkuaXNEaXNwb3NlZCksICdubyBpdGVtcyBzaG91bGQgYmUgZGlzcG9zZWQgd2l0aG91dCBtYXhJZGxlU2l6ZScpO1xuXHR9KSk7XG59KTtcblxuc3VpdGUoJ0tleWVkUmVzb3VyY2VQb29sJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGNyZWF0ZUNvdW50OiBudW1iZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y3JlYXRlQ291bnQgPSAwO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQb29sKG9wdGlvbnM/OiB7IG1heElkbGVTaXplPzogbnVtYmVyOyB0cmltSWRsZURlbGF5PzogbnVtYmVyIH0pOiBLZXllZFJlc291cmNlUG9vbDxNb2NrUG9vbEl0ZW0+IHtcblx0XHRjb25zdCBwb29sID0gbmV3IEtleWVkUmVzb3VyY2VQb29sPE1vY2tQb29sSXRlbT4oKCkgPT4ge1xuXHRcdFx0Y3JlYXRlQ291bnQrKztcblx0XHRcdHJldHVybiBuZXcgTW9ja1Bvb2xJdGVtKCk7XG5cdFx0fSwgb3B0aW9ucyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBvb2wpO1xuXHRcdHJldHVybiBwb29sO1xuXHR9XG5cblx0dGVzdCgnY3JlYXRlcyBuZXcgaXRlbXMgb24gZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCdrZXkyJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGEsIGIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvb2wuaW5Vc2Uuc2l6ZSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleWVkIGdldCByZXR1cm5zIGl0ZW0gcHJldmlvdXNseSByZWxlYXNlZCB3aXRoIHNhbWUga2V5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCdrZXkyJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGEsICdrZXkxJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGIsICdrZXkyJyk7XG5cblx0XHRjb25zdCBjID0gcG9vbC5nZXQoJ2tleTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYywgYiwgJ3Nob3VsZCByZXR1cm4gdGhlIGl0ZW0gcmVsZWFzZWQgd2l0aCBrZXkyJyk7XG5cblx0XHRjb25zdCBkID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZCwgYSwgJ3Nob3VsZCByZXR1cm4gdGhlIGl0ZW0gcmVsZWFzZWQgd2l0aCBrZXkxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgna2V5ZWQgZ2V0IGZhbGxzIGJhY2sgdG8gYW55IGlkbGUgaXRlbSB3aGVuIGtleSBub3QgZm91bmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHRwb29sLnJlbGVhc2UoYSwgJ2tleTEnKTtcblxuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgndW5rbm93bi1rZXknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYiwgYSwgJ3Nob3VsZCByZXR1cm4gdGhlIGlkbGUgaXRlbSBldmVuIHdpdGggYSBkaWZmZXJlbnQga2V5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGl0ZW1zIGNhbiBzaGFyZSB0aGUgc2FtZSBrZXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoJ3NoYXJlZCcpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgnc2hhcmVkJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGEsIGIsICdzaG91bGQgY3JlYXRlIHNlcGFyYXRlIGl0ZW1zJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGEsICdzaGFyZWQnKTtcblx0XHRwb29sLnJlbGVhc2UoYiwgJ3NoYXJlZCcpO1xuXG5cdFx0Y29uc3QgYyA9IHBvb2wuZ2V0KCdzaGFyZWQnKTtcblx0XHRhc3NlcnQub2soYyA9PT0gYSB8fCBjID09PSBiLCAnc2hvdWxkIHJldHVybiBvbmUgb2YgdGhlIGtleWVkIGl0ZW1zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleSByZWFzc2lnbm1lbnQgcmVtb3ZlcyBvbGQga2V5IGFzc29jaWF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCdrZXkyJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGEsICdrZXkxJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGIsICdrZXkyJyk7XG5cblx0XHQvLyBSZXVzZSBhIHZpYSBrZXkxLCB0aGVuIHJlbGVhc2UgaXQgdW5kZXIga2V5MlxuXHRcdGNvbnN0IHJldXNlZCA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldXNlZCwgYSk7XG5cdFx0cG9vbC5yZWxlYXNlKHJldXNlZCwgJ2tleTInKTtcblxuXHRcdC8vIGtleTEgc2hvdWxkIG5vdCBmaW5kIGEgYW55bW9yZSBcdTIwMTQgb25seSBiIGlzIGFzc29jaWF0ZWQgd2l0aCBpdHMgb3JpZ2luYWwga2V5MlxuXHRcdC8vIEJ1dCBhIHdhcyByZWFzc2lnbmVkIHRvIGtleTIsIHNvIGtleTIgbm93IGhhcyBib3RoIGEgYW5kIGJcblx0XHRjb25zdCBjID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHQvLyBrZXkxIGhhcyBubyBhc3NvY2lhdGlvbnMsIGZhbGxzIGJhY2sgdG8gZ2VuZXJpYyBcdTIwMTQgZ2V0cyB3aGF0ZXZlciBpcyBvbiB0b3Bcblx0XHRwb29sLnJlbGVhc2UoYywgJ2tleTEnKTtcblxuXHRcdC8vIGtleTIgc2hvdWxkIHN0aWxsIGZpbmQgb25lIG9mIHthLCBifVxuXHRcdGNvbnN0IGQgPSBwb29sLmdldCgna2V5MicpO1xuXHRcdGFzc2VydC5vayhkID09PSBhIHx8IGQgPT09IGIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhciBkaXNwb3NlcyBpZGxlIGl0ZW1zIGFuZCBjbGVhcnMga2V5IG1hcCcsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgna2V5MicpO1xuXHRcdHBvb2wucmVsZWFzZShhLCAna2V5MScpO1xuXHRcdHBvb2wucmVsZWFzZShiLCAna2V5MicpO1xuXG5cdFx0cG9vbC5jbGVhcigpO1xuXG5cdFx0YXNzZXJ0Lm9rKGEuaXNEaXNwb3NlZCk7XG5cdFx0YXNzZXJ0Lm9rKGIuaXNEaXNwb3NlZCk7XG5cblx0XHRjb25zdCBjID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYywgYSwgJ3Nob3VsZCBjcmVhdGUgbmV3IGl0ZW0gYWZ0ZXIgY2xlYXInKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBkaXNwb3NlcyBhbGwgaXRlbXMgaW5jbHVkaW5nIGluLXVzZScsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgna2V5MicpO1xuXHRcdHBvb2wucmVsZWFzZShiLCAna2V5MicpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGVsZXRlKHBvb2wpO1xuXHRcdHBvb2wuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGEuaXNEaXNwb3NlZCk7XG5cdFx0YXNzZXJ0Lm9rKGIuaXNEaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaW1taW5nIGRpc3Bvc2VzIGV4Y2VzcyBpZGxlIGl0ZW1zJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woeyBtYXhJZGxlU2l6ZTogMSwgdHJpbUlkbGVEZWxheTogNTAgfSk7XG5cblx0XHRjb25zdCBhID0gcG9vbC5nZXQoJ2EnKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoJ2InKTtcblx0XHRjb25zdCBjID0gcG9vbC5nZXQoJ2MnKTtcblx0XHRwb29sLnJlbGVhc2UoYSwgJ2EnKTtcblx0XHRwb29sLnJlbGVhc2UoYiwgJ2InKTtcblx0XHRwb29sLnJlbGVhc2UoYywgJ2MnKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2VkQ291bnQgPSBbYSwgYiwgY10uZmlsdGVyKHggPT4geC5pc0Rpc3Bvc2VkKS5sZW5ndGg7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkQ291bnQsIDIsICdzaG91bGQgZGlzcG9zZSAyIGV4Y2VzcyBpdGVtcycpO1xuXHR9KSk7XG5cblx0dGVzdCgndHJpbW1pbmcgY2xlYW5zIHVwIGtleSBhc3NvY2lhdGlvbnMgZm9yIGRpc3Bvc2VkIGl0ZW1zJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woeyBtYXhJZGxlU2l6ZTogMCwgdHJpbUlkbGVEZWxheTogNTAgfSk7XG5cblx0XHRjb25zdCBhID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHRwb29sLnJlbGVhc2UoYSwgJ2tleTEnKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblxuXHRcdGFzc2VydC5vayhhLmlzRGlzcG9zZWQpO1xuXG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGEsIGIsICdzaG91bGQgY3JlYXRlIG5ldyBpdGVtIHNpbmNlIGtleWVkIGl0ZW0gd2FzIHRyaW1tZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDIpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVwZWF0ZWQga2V5IHJlYXNzaWdubWVudCBkb2VzIG5vdCBncm93IHN0YWxlIGFzc29jaWF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGl0ZW0gPSBwb29sLmdldCgna2V5LTAnKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdHBvb2wucmVsZWFzZShpdGVtLCBga2V5LSR7aX1gKTtcblx0XHRcdGNvbnN0IHJldXNlZCA9IHBvb2wuZ2V0KGBrZXktJHtpfWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldXNlZCwgaXRlbSk7XG5cdFx0fVxuXG5cdFx0cG9vbC5yZWxlYXNlKGl0ZW0sICdmaW5hbC1rZXknKTtcblx0XHRjb25zdCByZXN1bHQgPSBwb29sLmdldCgnZmluYWwta2V5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgaXRlbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUNvdW50LCAxLCAnc2hvdWxkIGhhdmUgb25seSBjcmVhdGVkIG9uZSBpdGVtJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUywr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
