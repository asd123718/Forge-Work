import assert from "assert";
import { Emitter } from "../../common/event.js";
import { DisposableSet, DisposableStore, dispose, markAsSingleton, ReferenceCollection, thenIfNotDisposed, toDisposable } from "../../common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite, throwIfDisposablesAreLeaked } from "./utils.js";
class Disposable {
  constructor() {
    this.isDisposed = false;
  }
  dispose() {
    this.isDisposed = true;
  }
}
suite("Lifecycle", () => {
  test("dispose single disposable", () => {
    const disposable = new Disposable();
    assert(!disposable.isDisposed);
    dispose(disposable);
    assert(disposable.isDisposed);
  });
  test("dispose disposable array", () => {
    const disposable = new Disposable();
    const disposable2 = new Disposable();
    assert(!disposable.isDisposed);
    assert(!disposable2.isDisposed);
    dispose([disposable, disposable2]);
    assert(disposable.isDisposed);
    assert(disposable2.isDisposed);
  });
  test("dispose disposables", () => {
    const disposable = new Disposable();
    const disposable2 = new Disposable();
    assert(!disposable.isDisposed);
    assert(!disposable2.isDisposed);
    dispose(disposable);
    dispose(disposable2);
    assert(disposable.isDisposed);
    assert(disposable2.isDisposed);
  });
  test("dispose array should dispose all if a child throws on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    let thrownError;
    try {
      dispose([
        toDisposable(() => {
          disposedValues.add(1);
        }),
        toDisposable(() => {
          throw new Error("I am error");
        }),
        toDisposable(() => {
          disposedValues.add(3);
        })
      ]);
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(thrownError.message, "I am error");
  });
  test("dispose array should rethrow composite error if multiple entries throw on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    let thrownError;
    try {
      dispose([
        toDisposable(() => {
          disposedValues.add(1);
        }),
        toDisposable(() => {
          throw new Error("I am error 1");
        }),
        toDisposable(() => {
          throw new Error("I am error 2");
        }),
        toDisposable(() => {
          disposedValues.add(4);
        })
      ]);
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(4));
    assert.ok(thrownError instanceof AggregateError);
    assert.strictEqual(thrownError.errors.length, 2);
    assert.strictEqual(thrownError.errors[0].message, "I am error 1");
    assert.strictEqual(thrownError.errors[1].message, "I am error 2");
  });
  test("Action bar has broken accessibility #100273", function() {
    const array = [{ dispose() {
    } }, { dispose() {
    } }];
    const array2 = dispose(array);
    assert.strictEqual(array.length, 2);
    assert.strictEqual(array2.length, 0);
    assert.ok(array !== array2);
    const set = /* @__PURE__ */ new Set([{ dispose() {
    } }, { dispose() {
    } }]);
    const setValues = set.values();
    const setValues2 = dispose(setValues);
    assert.ok(setValues === setValues2);
  });
});
suite("DisposableStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("dispose should call all child disposes even if a child throws on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const store = new DisposableStore();
    store.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    store.add(toDisposable(() => {
      throw new Error("I am error");
    }));
    store.add(toDisposable(() => {
      disposedValues.add(3);
    }));
    let thrownError;
    try {
      store.dispose();
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(thrownError.message, "I am error");
  });
  test("dispose should throw composite error if multiple children throw on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const store = new DisposableStore();
    store.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    store.add(toDisposable(() => {
      throw new Error("I am error 1");
    }));
    store.add(toDisposable(() => {
      throw new Error("I am error 2");
    }));
    store.add(toDisposable(() => {
      disposedValues.add(4);
    }));
    let thrownError;
    try {
      store.dispose();
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(4));
    assert.ok(thrownError instanceof AggregateError);
    assert.strictEqual(thrownError.errors.length, 2);
    assert.strictEqual(thrownError.errors[0].message, "I am error 1");
    assert.strictEqual(thrownError.errors[1].message, "I am error 2");
  });
  test("delete should evict and dispose of the disposables", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const disposables = [
      toDisposable(() => {
        disposedValues.add(1);
      }),
      toDisposable(() => {
        disposedValues.add(2);
      })
    ];
    const store = new DisposableStore();
    store.add(disposables[0]);
    store.add(disposables[1]);
    store.delete(disposables[0]);
    assert.ok(disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    store.dispose();
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(2));
  });
  test("deleteAndLeak should evict and not dispose of the disposables", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const disposables = [
      toDisposable(() => {
        disposedValues.add(1);
      }),
      toDisposable(() => {
        disposedValues.add(2);
      })
    ];
    const store = new DisposableStore();
    store.add(disposables[0]);
    store.add(disposables[1]);
    store.deleteAndLeak(disposables[0]);
    assert.ok(!disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    store.dispose();
    assert.ok(!disposedValues.has(1));
    assert.ok(disposedValues.has(2));
    disposables[0].dispose();
  });
});
suite("DisposableSet", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("dispose should dispose all values and mark as disposed", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    set.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    set.add(toDisposable(() => {
      disposedValues.add(2);
    }));
    set.add(toDisposable(() => {
      disposedValues.add(3);
    }));
    assert.strictEqual(set.size, 3);
    set.dispose();
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(2));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(set.size, 0);
  });
  test("dispose should call all child disposes even if a child throws on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    set.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    set.add(toDisposable(() => {
      throw new Error("I am error");
    }));
    set.add(toDisposable(() => {
      disposedValues.add(3);
    }));
    let thrownError;
    try {
      set.dispose();
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(thrownError.message, "I am error");
  });
  test("clearAndDisposeAll should dispose values but not mark as disposed", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
      disposedValues.add(1);
    });
    set.add(d1);
    set.clearAndDisposeAll();
    assert.ok(disposedValues.has(1));
    assert.strictEqual(set.size, 0);
    const d2 = toDisposable(() => {
      disposedValues.add(2);
    });
    set.add(d2);
    assert.strictEqual(set.size, 1);
    set.dispose();
    assert.ok(disposedValues.has(2));
  });
  test("has should return true if value exists", () => {
    const set = new DisposableSet();
    const d = toDisposable(() => {
    });
    set.add(d);
    const other = toDisposable(() => {
    });
    assert.ok(set.has(d));
    assert.ok(!set.has(other));
    set.dispose();
    other.dispose();
  });
  test("deleteAndDispose should remove and dispose the value", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
      disposedValues.add(1);
    });
    const d2 = toDisposable(() => {
      disposedValues.add(2);
    });
    set.add(d1);
    set.add(d2);
    set.deleteAndDispose(d1);
    assert.ok(disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    assert.strictEqual(set.size, 1);
    assert.ok(!set.has(d1));
    assert.ok(set.has(d2));
    set.dispose();
    assert.ok(disposedValues.has(2));
  });
  test("deleteAndLeak should remove but not dispose the value", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
      disposedValues.add(1);
    });
    const d2 = toDisposable(() => {
      disposedValues.add(2);
    });
    set.add(d1);
    set.add(d2);
    const leaked = set.deleteAndLeak(d1);
    assert.strictEqual(leaked, d1);
    assert.ok(!disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    assert.strictEqual(set.size, 1);
    set.dispose();
    assert.ok(!disposedValues.has(1));
    assert.ok(disposedValues.has(2));
    d1.dispose();
  });
  test("deleteAndLeak should return undefined if value not in set", () => {
    const set = new DisposableSet();
    const d = toDisposable(() => {
    });
    const leaked = set.deleteAndLeak(d);
    assert.strictEqual(leaked, void 0);
    set.dispose();
    d.dispose();
  });
  test("values should iterate over all values", () => {
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
    });
    const d2 = toDisposable(() => {
    });
    set.add(d1);
    set.add(d2);
    const values = [...set.values()];
    assert.strictEqual(values.length, 2);
    assert.ok(values.includes(d1));
    assert.ok(values.includes(d2));
    set.dispose();
  });
  test("Symbol.iterator should allow for-of iteration", () => {
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
    });
    const d2 = toDisposable(() => {
    });
    set.add(d1);
    set.add(d2);
    const values = [];
    for (const v of set) {
      values.push(v);
    }
    assert.strictEqual(values.length, 2);
    assert.ok(values.includes(d1));
    assert.ok(values.includes(d2));
    set.dispose();
  });
});
suite("Reference Collection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class Collection extends ReferenceCollection {
    constructor() {
      super(...arguments);
      this._count = 0;
    }
    get count() {
      return this._count;
    }
    createReferencedObject(key) {
      this._count++;
      return key.length;
    }
    destroyReferencedObject(key, object) {
      this._count--;
    }
  }
  test("simple", () => {
    const collection = new Collection();
    const ref1 = collection.acquire("test");
    assert(ref1);
    assert.strictEqual(ref1.object, 4);
    assert.strictEqual(collection.count, 1);
    ref1.dispose();
    assert.strictEqual(collection.count, 0);
    const ref2 = collection.acquire("test");
    const ref3 = collection.acquire("test");
    assert.strictEqual(ref2.object, ref3.object);
    assert.strictEqual(collection.count, 1);
    const ref4 = collection.acquire("monkey");
    assert.strictEqual(ref4.object, 6);
    assert.strictEqual(collection.count, 2);
    ref2.dispose();
    assert.strictEqual(collection.count, 2);
    ref3.dispose();
    assert.strictEqual(collection.count, 1);
    ref4.dispose();
    assert.strictEqual(collection.count, 0);
  });
});
function assertThrows(fn, test2) {
  try {
    fn();
    assert.fail("Expected function to throw, but it did not.");
  } catch (e) {
    assert.ok(test2(e));
  }
}
suite("No Leakage Utilities", () => {
  suite("throwIfDisposablesAreLeaked", () => {
    test("throws if an event subscription is not cleaned up", () => {
      const eventEmitter = new Emitter();
      assertThrows(() => {
        throwIfDisposablesAreLeaked(() => {
          eventEmitter.event(() => {
          });
        }, false);
      }, (e) => e.message.indexOf("undisposed disposables") !== -1);
    });
    test("throws if a disposable is not disposed", () => {
      assertThrows(() => {
        throwIfDisposablesAreLeaked(() => {
          new DisposableStore();
        }, false);
      }, (e) => e.message.indexOf("undisposed disposables") !== -1);
    });
    test("does not throw if all event subscriptions are cleaned up", () => {
      const eventEmitter = new Emitter();
      throwIfDisposablesAreLeaked(() => {
        eventEmitter.event(() => {
        }).dispose();
      });
    });
    test("does not throw if all disposables are disposed", () => {
      toDisposable(() => {
      });
      throwIfDisposablesAreLeaked(() => {
        markAsSingleton(toDisposable(() => {
        }));
        const disposableStore = new DisposableStore();
        disposableStore.add(toDisposable(() => {
        }));
        markAsSingleton(disposableStore);
        toDisposable(() => {
        }).dispose();
      });
    });
  });
  suite("ensureNoDisposablesAreLeakedInTest", () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test("Basic Test", () => {
      toDisposable(() => {
      }).dispose();
    });
  });
  suite("thenIfNotDisposed", () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test("normal case", async () => {
      let called = false;
      store.add(thenIfNotDisposed(Promise.resolve(123), (result) => {
        assert.strictEqual(result, 123);
        called = true;
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(called, true);
    });
    test("disposed before promise resolves", async () => {
      let called = false;
      const disposable = thenIfNotDisposed(Promise.resolve(123), () => {
        called = true;
      });
      disposable.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(called, false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGxpZmVjeWNsZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU2V0LCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBtYXJrQXNTaW5nbGV0b24sIFJlZmVyZW5jZUNvbGxlY3Rpb24sIHRoZW5JZk5vdERpc3Bvc2VkLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSwgdGhyb3dJZkRpc3Bvc2FibGVzQXJlTGVha2VkIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbmNsYXNzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0ZGlzcG9zZSgpIHsgdGhpcy5pc0Rpc3Bvc2VkID0gdHJ1ZTsgfVxufVxuXG4vLyBMZWFrcyBhcmUgYWxsb3dlZCBoZXJlIHNpbmNlIHdlIHRlc3QgbGlmZWN5Y2xlIHN0dWZmOlxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtZW5zdXJlLW5vLWRpc3Bvc2FibGVzLWxlYWstaW4tdGVzdFxuc3VpdGUoJ0xpZmVjeWNsZScsICgpID0+IHtcblx0dGVzdCgnZGlzcG9zZSBzaW5nbGUgZGlzcG9zYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGUoKTtcblxuXHRcdGFzc2VydCghZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKTtcblxuXHRcdGRpc3Bvc2UoZGlzcG9zYWJsZSk7XG5cblx0XHRhc3NlcnQoZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBkaXNwb3NhYmxlIGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZSgpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUyID0gbmV3IERpc3Bvc2FibGUoKTtcblxuXHRcdGFzc2VydCghZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKTtcblx0XHRhc3NlcnQoIWRpc3Bvc2FibGUyLmlzRGlzcG9zZWQpO1xuXG5cdFx0ZGlzcG9zZShbZGlzcG9zYWJsZSwgZGlzcG9zYWJsZTJdKTtcblxuXHRcdGFzc2VydChkaXNwb3NhYmxlLmlzRGlzcG9zZWQpO1xuXHRcdGFzc2VydChkaXNwb3NhYmxlMi5pc0Rpc3Bvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBkaXNwb3NhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGUoKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlMiA9IG5ldyBEaXNwb3NhYmxlKCk7XG5cblx0XHRhc3NlcnQoIWRpc3Bvc2FibGUuaXNEaXNwb3NlZCk7XG5cdFx0YXNzZXJ0KCFkaXNwb3NhYmxlMi5pc0Rpc3Bvc2VkKTtcblxuXHRcdGRpc3Bvc2UoZGlzcG9zYWJsZSk7XG5cdFx0ZGlzcG9zZShkaXNwb3NhYmxlMik7XG5cblx0XHRhc3NlcnQoZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKTtcblx0XHRhc3NlcnQoZGlzcG9zYWJsZTIuaXNEaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgYXJyYXkgc2hvdWxkIGRpc3Bvc2UgYWxsIGlmIGEgY2hpbGQgdGhyb3dzIG9uIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGxldCB0aHJvd25FcnJvcjogYW55O1xuXHRcdHRyeSB7XG5cdFx0XHRkaXNwb3NlKFtcblx0XHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSxcblx0XHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdJIGFtIGVycm9yJyk7IH0pLFxuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMyk7IH0pLFxuXHRcdFx0XSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3duRXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJvd25FcnJvci5tZXNzYWdlLCAnSSBhbSBlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGFycmF5IHNob3VsZCByZXRocm93IGNvbXBvc2l0ZSBlcnJvciBpZiBtdWx0aXBsZSBlbnRyaWVzIHRocm93IG9uIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGxldCB0aHJvd25FcnJvcjogYW55O1xuXHRcdHRyeSB7XG5cdFx0XHRkaXNwb3NlKFtcblx0XHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSxcblx0XHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdJIGFtIGVycm9yIDEnKTsgfSksXG5cdFx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSSBhbSBlcnJvciAyJyk7IH0pLFxuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoNCk7IH0pLFxuXHRcdFx0XSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3duRXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoNCkpO1xuXHRcdGFzc2VydC5vayh0aHJvd25FcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRocm93bkVycm9yIGFzIEFnZ3JlZ2F0ZUVycm9yKS5lcnJvcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRocm93bkVycm9yIGFzIEFnZ3JlZ2F0ZUVycm9yKS5lcnJvcnNbMF0ubWVzc2FnZSwgJ0kgYW0gZXJyb3IgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodGhyb3duRXJyb3IgYXMgQWdncmVnYXRlRXJyb3IpLmVycm9yc1sxXS5tZXNzYWdlLCAnSSBhbSBlcnJvciAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FjdGlvbiBiYXIgaGFzIGJyb2tlbiBhY2Nlc3NpYmlsaXR5ICMxMDAyNzMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgYXJyYXkgPSBbeyBkaXNwb3NlKCkgeyB9IH0sIHsgZGlzcG9zZSgpIHsgfSB9XTtcblx0XHRjb25zdCBhcnJheTIgPSBkaXNwb3NlKGFycmF5KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheTIubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soYXJyYXkgIT09IGFycmF5Mik7XG5cblx0XHRjb25zdCBzZXQgPSBuZXcgU2V0PElEaXNwb3NhYmxlPihbeyBkaXNwb3NlKCkgeyB9IH0sIHsgZGlzcG9zZSgpIHsgfSB9XSk7XG5cdFx0Y29uc3Qgc2V0VmFsdWVzID0gc2V0LnZhbHVlcygpO1xuXHRcdGNvbnN0IHNldFZhbHVlczIgPSBkaXNwb3NlKHNldFZhbHVlcyk7XG5cdFx0YXNzZXJ0Lm9rKHNldFZhbHVlcyA9PT0gc2V0VmFsdWVzMik7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdEaXNwb3NhYmxlU3RvcmUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc3Bvc2Ugc2hvdWxkIGNhbGwgYWxsIGNoaWxkIGRpc3Bvc2VzIGV2ZW4gaWYgYSBjaGlsZCB0aHJvd3Mgb24gZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgxKTsgfSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0kgYW0gZXJyb3InKTsgfSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMyk7IH0pKTtcblxuXHRcdGxldCB0aHJvd25FcnJvcjogYW55O1xuXHRcdHRyeSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3duRXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJvd25FcnJvci5tZXNzYWdlLCAnSSBhbSBlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIHNob3VsZCB0aHJvdyBjb21wb3NpdGUgZXJyb3IgaWYgbXVsdGlwbGUgY2hpbGRyZW4gdGhyb3cgb24gZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgxKTsgfSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0kgYW0gZXJyb3IgMScpOyB9KSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSSBhbSBlcnJvciAyJyk7IH0pKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDQpOyB9KSk7XG5cblx0XHRsZXQgdGhyb3duRXJyb3I6IGFueTtcblx0XHR0cnkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRocm93bkVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDQpKTtcblx0XHRhc3NlcnQub2sodGhyb3duRXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0aHJvd25FcnJvciBhcyBBZ2dyZWdhdGVFcnJvcikuZXJyb3JzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0aHJvd25FcnJvciBhcyBBZ2dyZWdhdGVFcnJvcikuZXJyb3JzWzBdLm1lc3NhZ2UsICdJIGFtIGVycm9yIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRocm93bkVycm9yIGFzIEFnZ3JlZ2F0ZUVycm9yKS5lcnJvcnNbMV0ubWVzc2FnZSwgJ0kgYW0gZXJyb3IgMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgc2hvdWxkIGV2aWN0IGFuZCBkaXNwb3NlIG9mIHRoZSBkaXNwb3NhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW1xuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSxcblx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgyKTsgfSlcblx0XHRdO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVzWzBdKTtcblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZXNbMV0pO1xuXG5cdFx0c3RvcmUuZGVsZXRlKGRpc3Bvc2FibGVzWzBdKTtcblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBbmRMZWFrIHNob3VsZCBldmljdCBhbmQgbm90IGRpc3Bvc2Ugb2YgdGhlIGRpc3Bvc2FibGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2VkVmFsdWVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pLFxuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDIpOyB9KVxuXHRcdF07XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZXNbMF0pO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlc1sxXSk7XG5cblx0XHRzdG9yZS5kZWxldGVBbmRMZWFrKGRpc3Bvc2FibGVzWzBdKTtcblxuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soIWRpc3Bvc2VkVmFsdWVzLmhhcygyKSk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQub2soIWRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygyKSk7XG5cblx0XHRkaXNwb3NhYmxlc1swXS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdEaXNwb3NhYmxlU2V0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkaXNwb3NlIHNob3VsZCBkaXNwb3NlIGFsbCB2YWx1ZXMgYW5kIG1hcmsgYXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdHNldC5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSk7XG5cdFx0c2V0LmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMik7IH0pKTtcblx0XHRzZXQuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgzKTsgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC5zaXplLCAzKTtcblxuXHRcdHNldC5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LnNpemUsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIHNob3VsZCBjYWxsIGFsbCBjaGlsZCBkaXNwb3NlcyBldmVuIGlmIGEgY2hpbGQgdGhyb3dzIG9uIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdHNldC5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSk7XG5cdFx0c2V0LmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0kgYW0gZXJyb3InKTsgfSkpO1xuXHRcdHNldC5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDMpOyB9KSk7XG5cblx0XHRsZXQgdGhyb3duRXJyb3I6IGFueTtcblx0XHR0cnkge1xuXHRcdFx0c2V0LmRpc3Bvc2UoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvd25FcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocm93bkVycm9yLm1lc3NhZ2UsICdJIGFtIGVycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyQW5kRGlzcG9zZUFsbCBzaG91bGQgZGlzcG9zZSB2YWx1ZXMgYnV0IG5vdCBtYXJrIGFzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2VkVmFsdWVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0XHRjb25zdCBzZXQgPSBuZXcgRGlzcG9zYWJsZVNldDxJRGlzcG9zYWJsZT4oKTtcblx0XHRjb25zdCBkMSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgxKTsgfSk7XG5cdFx0c2V0LmFkZChkMSk7XG5cblx0XHRzZXQuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LnNpemUsIDApO1xuXG5cdFx0Ly8gQ2FuIHN0aWxsIGFkZCBuZXcgdmFsdWVzXG5cdFx0Y29uc3QgZDIgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMik7IH0pO1xuXHRcdHNldC5hZGQoZDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuc2l6ZSwgMSk7XG5cblx0XHRzZXQuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXMgc2hvdWxkIHJldHVybiB0cnVlIGlmIHZhbHVlIGV4aXN0cycsICgpID0+IHtcblx0XHRjb25zdCBzZXQgPSBuZXcgRGlzcG9zYWJsZVNldDxJRGlzcG9zYWJsZT4oKTtcblx0XHRjb25zdCBkID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0c2V0LmFkZChkKTtcblxuXHRcdGNvbnN0IG90aGVyID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0YXNzZXJ0Lm9rKHNldC5oYXMoZCkpO1xuXHRcdGFzc2VydC5vayghc2V0LmhhcyhvdGhlcikpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblx0XHRvdGhlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUFuZERpc3Bvc2Ugc2hvdWxkIHJlbW92ZSBhbmQgZGlzcG9zZSB0aGUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdGNvbnN0IGQxID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KTtcblx0XHRjb25zdCBkMiA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgyKTsgfSk7XG5cdFx0c2V0LmFkZChkMSk7XG5cdFx0c2V0LmFkZChkMik7XG5cblx0XHRzZXQuZGVsZXRlQW5kRGlzcG9zZShkMSk7XG5cblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soIWRpc3Bvc2VkVmFsdWVzLmhhcygyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC5zaXplLCAxKTtcblx0XHRhc3NlcnQub2soIXNldC5oYXMoZDEpKTtcblx0XHRhc3NlcnQub2soc2V0LmhhcyhkMikpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQW5kTGVhayBzaG91bGQgcmVtb3ZlIGJ1dCBub3QgZGlzcG9zZSB0aGUgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdGNvbnN0IGQxID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KTtcblx0XHRjb25zdCBkMiA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgyKTsgfSk7XG5cdFx0c2V0LmFkZChkMSk7XG5cdFx0c2V0LmFkZChkMik7XG5cblx0XHRjb25zdCBsZWFrZWQgPSBzZXQuZGVsZXRlQW5kTGVhayhkMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVha2VkLCBkMSk7XG5cdFx0YXNzZXJ0Lm9rKCFkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LnNpemUsIDEpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblxuXHRcdC8vIENhbGxlciBpcyByZXNwb25zaWJsZSBmb3IgZGlzcG9zaW5nXG5cdFx0ZDEuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBbmRMZWFrIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkIGlmIHZhbHVlIG5vdCBpbiBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IERpc3Bvc2FibGVTZXQ8SURpc3Bvc2FibGU+KCk7XG5cdFx0Y29uc3QgZCA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXG5cdFx0Y29uc3QgbGVha2VkID0gc2V0LmRlbGV0ZUFuZExlYWsoZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVha2VkLCB1bmRlZmluZWQpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblx0XHRkLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndmFsdWVzIHNob3VsZCBpdGVyYXRlIG92ZXIgYWxsIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXQgPSBuZXcgRGlzcG9zYWJsZVNldDxJRGlzcG9zYWJsZT4oKTtcblx0XHRjb25zdCBkMSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHRcdGNvbnN0IGQyID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0c2V0LmFkZChkMSk7XG5cdFx0c2V0LmFkZChkMik7XG5cblx0XHRjb25zdCB2YWx1ZXMgPSBbLi4uc2V0LnZhbHVlcygpXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlcy5pbmNsdWRlcyhkMSkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZXMuaW5jbHVkZXMoZDIpKTtcblxuXHRcdHNldC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N5bWJvbC5pdGVyYXRvciBzaG91bGQgYWxsb3cgZm9yLW9mIGl0ZXJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXQgPSBuZXcgRGlzcG9zYWJsZVNldDxJRGlzcG9zYWJsZT4oKTtcblx0XHRjb25zdCBkMSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHRcdGNvbnN0IGQyID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0c2V0LmFkZChkMSk7XG5cdFx0c2V0LmFkZChkMik7XG5cblx0XHRjb25zdCB2YWx1ZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHYgb2Ygc2V0KSB7XG5cdFx0XHR2YWx1ZXMucHVzaCh2KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlcy5pbmNsdWRlcyhkMSkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZXMuaW5jbHVkZXMoZDIpKTtcblxuXHRcdHNldC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdSZWZlcmVuY2UgQ29sbGVjdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgQ29sbGVjdGlvbiBleHRlbmRzIFJlZmVyZW5jZUNvbGxlY3Rpb248bnVtYmVyPiB7XG5cdFx0cHJpdmF0ZSBfY291bnQgPSAwO1xuXHRcdGdldCBjb3VudCgpIHsgcmV0dXJuIHRoaXMuX2NvdW50OyB9XG5cdFx0cHJvdGVjdGVkIGNyZWF0ZVJlZmVyZW5jZWRPYmplY3Qoa2V5OiBzdHJpbmcpOiBudW1iZXIgeyB0aGlzLl9jb3VudCsrOyByZXR1cm4ga2V5Lmxlbmd0aDsgfVxuXHRcdHByb3RlY3RlZCBkZXN0cm95UmVmZXJlbmNlZE9iamVjdChrZXk6IHN0cmluZywgb2JqZWN0OiBudW1iZXIpOiB2b2lkIHsgdGhpcy5fY291bnQtLTsgfVxuXHR9XG5cblx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgQ29sbGVjdGlvbigpO1xuXG5cdFx0Y29uc3QgcmVmMSA9IGNvbGxlY3Rpb24uYWNxdWlyZSgndGVzdCcpO1xuXHRcdGFzc2VydChyZWYxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmMS5vYmplY3QsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmNvdW50LCAxKTtcblx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5jb3VudCwgMCk7XG5cblx0XHRjb25zdCByZWYyID0gY29sbGVjdGlvbi5hY3F1aXJlKCd0ZXN0Jyk7XG5cdFx0Y29uc3QgcmVmMyA9IGNvbGxlY3Rpb24uYWNxdWlyZSgndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWYyLm9iamVjdCwgcmVmMy5vYmplY3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IHJlZjQgPSBjb2xsZWN0aW9uLmFjcXVpcmUoJ21vbmtleScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWY0Lm9iamVjdCwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24uY291bnQsIDIpO1xuXG5cdFx0cmVmMi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24uY291bnQsIDIpO1xuXG5cdFx0cmVmMy5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24uY291bnQsIDEpO1xuXG5cdFx0cmVmNC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24uY291bnQsIDApO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBhc3NlcnRUaHJvd3MoZm46ICgpID0+IHZvaWQsIHRlc3Q6IChlcnJvcjogYW55KSA9PiB2b2lkKSB7XG5cdHRyeSB7XG5cdFx0Zm4oKTtcblx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgZnVuY3Rpb24gdG8gdGhyb3csIGJ1dCBpdCBkaWQgbm90LicpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0YXNzZXJ0Lm9rKHRlc3QoZSkpO1xuXHR9XG59XG5cbnN1aXRlKCdObyBMZWFrYWdlIFV0aWxpdGllcycsICgpID0+IHtcblx0c3VpdGUoJ3Rocm93SWZEaXNwb3NhYmxlc0FyZUxlYWtlZCcsICgpID0+IHtcblx0XHR0ZXN0KCd0aHJvd3MgaWYgYW4gZXZlbnQgc3Vic2NyaXB0aW9uIGlzIG5vdCBjbGVhbmVkIHVwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRFbWl0dGVyID0gbmV3IEVtaXR0ZXIoKTtcblxuXHRcdFx0YXNzZXJ0VGhyb3dzKCgpID0+IHtcblx0XHRcdFx0dGhyb3dJZkRpc3Bvc2FibGVzQXJlTGVha2VkKCgpID0+IHtcblx0XHRcdFx0XHRldmVudEVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LCBmYWxzZSk7XG5cdFx0XHR9LCBlID0+IGUubWVzc2FnZS5pbmRleE9mKCd1bmRpc3Bvc2VkIGRpc3Bvc2FibGVzJykgIT09IC0xKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBpZiBhIGRpc3Bvc2FibGUgaXMgbm90IGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0VGhyb3dzKCgpID0+IHtcblx0XHRcdFx0dGhyb3dJZkRpc3Bvc2FibGVzQXJlTGVha2VkKCgpID0+IHtcblx0XHRcdFx0XHRuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdH0sIGZhbHNlKTtcblx0XHRcdH0sIGUgPT4gZS5tZXNzYWdlLmluZGV4T2YoJ3VuZGlzcG9zZWQgZGlzcG9zYWJsZXMnKSAhPT0gLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgdGhyb3cgaWYgYWxsIGV2ZW50IHN1YnNjcmlwdGlvbnMgYXJlIGNsZWFuZWQgdXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpO1xuXHRcdFx0dGhyb3dJZkRpc3Bvc2FibGVzQXJlTGVha2VkKCgpID0+IHtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmV2ZW50KCgpID0+IHtcblx0XHRcdFx0XHQvLyBub29wXG5cdFx0XHRcdH0pLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgdGhyb3cgaWYgYWxsIGRpc3Bvc2FibGVzIGFyZSBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRcdC8vIFRoaXMgZGlzcG9zYWJsZSBpcyByZXBvcnRlZCBiZWZvcmUgdGhlIHRlc3QgYW5kIG5vdCB0cmFja2VkLlxuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cblx0XHRcdHRocm93SWZEaXNwb3NhYmxlc0FyZUxlYWtlZCgoKSA9PiB7XG5cdFx0XHRcdC8vIFRoaXMgZGlzcG9zYWJsZSBpcyBtYXJrZWQgYXMgc2luZ2xldG9uXG5cdFx0XHRcdG1hcmtBc1NpbmdsZXRvbih0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSk7XG5cblx0XHRcdFx0Ly8gVGhlc2UgZGlzcG9zYWJsZXMgYXJlIGFsc28gbWFya2VkIGFzIHNpbmdsZXRvblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgfSkpO1xuXHRcdFx0XHRtYXJrQXNTaW5nbGV0b24oZGlzcG9zYWJsZVN0b3JlKTtcblxuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Vuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3QnLCAoKSA9PiB7XG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdCYXNpYyBUZXN0JywgKCkgPT4ge1xuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgfSkuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndGhlbklmTm90RGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ25vcm1hbCBjYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0c3RvcmUuYWRkKHRoZW5JZk5vdERpc3Bvc2VkKFByb21pc2UucmVzb2x2ZSgxMjMpLCAocmVzdWx0OiBudW1iZXIpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMTIzKTtcblx0XHRcdFx0Y2FsbGVkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZWQgYmVmb3JlIHByb21pc2UgcmVzb2x2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhlbklmTm90RGlzcG9zZWQoUHJvbWlzZS5yZXNvbHZlKDEyMyksICgpID0+IHtcblx0XHRcdFx0Y2FsbGVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZSxpQkFBaUIsU0FBc0IsaUJBQWlCLHFCQUFxQixtQkFBbUIsb0JBQW9CO0FBQzVJLFNBQVMseUNBQXlDLG1DQUFtQztBQUVyRixNQUFNLFdBQWtDO0FBQUEsRUFBeEM7QUFDQyxzQkFBYTtBQUFBO0FBQUEsRUFDYixVQUFVO0FBQUUsU0FBSyxhQUFhO0FBQUEsRUFBTTtBQUNyQztBQUlBLE1BQU0sYUFBYSxNQUFNO0FBQ3hCLE9BQUssNkJBQTZCLE1BQU07QUFDdkMsVUFBTSxhQUFhLElBQUksV0FBVztBQUVsQyxXQUFPLENBQUMsV0FBVyxVQUFVO0FBRTdCLFlBQVEsVUFBVTtBQUVsQixXQUFPLFdBQVcsVUFBVTtBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLDRCQUE0QixNQUFNO0FBQ3RD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
