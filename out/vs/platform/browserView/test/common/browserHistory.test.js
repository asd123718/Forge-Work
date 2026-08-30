import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  BrowserFaviconsStore,
  BrowserHistoryEntriesStore,
  BrowserHistoryStore
} from "../../common/browserHistory.js";
suite("BrowserHistoryEntriesStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add assigns monotonic ids and exposes items oldest-first", () => {
    const store = new BrowserHistoryEntriesStore();
    const a = store.add("https://a/", "A", void 0, false);
    const b = store.add("https://b/", "B", "icon-b", true);
    const c = store.add("https://c/", "C", void 0, false);
    assert.deepStrictEqual([a.id, b.id, c.id], [1, 2, 3]);
    assert.deepStrictEqual(store.items.map((e) => ({ id: e.id, url: e.url, icon: e.icon, explicit: e.explicit })), [
      { id: 1, url: "https://a/", icon: void 0, explicit: void 0 },
      { id: 2, url: "https://b/", icon: "icon-b", explicit: true },
      { id: 3, url: "https://c/", icon: void 0, explicit: void 0 }
    ]);
    store.dispose();
  });
  test("explicit is omitted from the entry when false", () => {
    const store = new BrowserHistoryEntriesStore();
    const e = store.add("https://a/", "A", void 0, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(e, "explicit"), false);
    store.dispose();
  });
  test("update changes title and icon, returns whether anything changed", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "", void 0, false);
    assert.strictEqual(store.update(1, { title: "A" }), true);
    assert.strictEqual(store.update(1, { faviconHash: "icon-a" }), true);
    assert.strictEqual(store.update(1, { title: "A", faviconHash: "icon-a" }), false);
    assert.deepStrictEqual(store.items[0].title, "A");
    assert.deepStrictEqual(store.items[0].icon, "icon-a");
    store.dispose();
  });
  test("update ignores empty title", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "A", void 0, false);
    assert.strictEqual(store.update(1, { title: "" }), false);
    assert.strictEqual(store.items[0].title, "A");
    store.dispose();
  });
  test("update of an unknown id is a no-op", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "A", void 0, false);
    assert.strictEqual(store.update(999, { title: "X" }), false);
    store.dispose();
  });
  test("delete removes the targeted entry and leaves ids of others intact", () => {
    const store = new BrowserHistoryEntriesStore();
    const a = store.add("https://a/", "A", void 0, false);
    const b = store.add("https://b/", "B", void 0, false);
    const c = store.add("https://c/", "C", void 0, false);
    assert.strictEqual(store.delete(b.id), true);
    assert.strictEqual(store.delete(b.id), false);
    assert.deepStrictEqual(store.items.map((e) => e.id), [a.id, c.id]);
    store.dispose();
  });
  test("add beyond maxEntries evicts oldest", () => {
    const store = new BrowserHistoryEntriesStore(2);
    store.add("https://a/", "A", void 0, false);
    store.add("https://b/", "B", void 0, false);
    store.add("https://c/", "C", void 0, false);
    assert.deepStrictEqual(store.items.map((e) => e.url), ["https://b/", "https://c/"]);
    store.dispose();
  });
  test("onDidChange fires for add, update, delete, clear", () => {
    const store = new BrowserHistoryEntriesStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.add("https://a/", "A", void 0, false);
    store.update(1, { title: "A2" });
    store.delete(1);
    store.clear();
    store.clear();
    assert.strictEqual(count, 4);
    sub.dispose();
    store.dispose();
  });
  test("serialize then hydrate round-trips", () => {
    const a = new BrowserHistoryEntriesStore();
    a.add("https://a/", "A", "icon-a", true);
    a.add("https://b/", "B", void 0, false);
    const snapshot = a.serialize();
    const b = new BrowserHistoryEntriesStore();
    b.hydrate(snapshot);
    assert.deepStrictEqual(b.serialize(), snapshot);
    a.dispose();
    b.dispose();
  });
  test("hydrate seeds the id counter from the max restored id", () => {
    const store = new BrowserHistoryEntriesStore();
    store.hydrate({
      items: [
        { id: 7, url: "https://a/", time: 100, title: "A" },
        { id: 12, url: "https://b/", time: 200, title: "B" }
      ]
    });
    const next = store.add("https://c/", "C", void 0, false);
    assert.strictEqual(next.id, 13);
    store.dispose();
  });
});
suite("BrowserHistoryEntriesStore.hydrate backwards-compat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts data matching prior snapshot shapes", () => {
    const raw = {
      items: [
        { id: 1, url: "https://a/", time: 100, title: "A" },
        { id: 2, url: "https://b/", time: 200, title: "B", icon: "h1" },
        { id: 4, url: "https://c/", time: 300, title: "C", explicit: true }
      ]
    };
    const store = new BrowserHistoryEntriesStore();
    store.hydrate(raw);
    assert.deepStrictEqual(store.items, [
      { id: 1, url: "https://a/", time: 100, title: "A" },
      { id: 2, url: "https://b/", time: 200, title: "B", icon: "h1" },
      { id: 4, url: "https://c/", time: 300, title: "C", explicit: true }
    ]);
    assert.strictEqual(store.add("https://d/", "D", void 0, false).id, 5);
    store.dispose();
  });
  test("drops malformed entries and accepts the rest", () => {
    const raw = {
      items: [
        { id: 1, url: "https://a/", time: 100, title: "A" },
        { id: "bad", url: "https://b/", time: 200, title: "B" },
        null,
        { id: 2 },
        // missing required fields
        { id: 3, url: "https://c/", time: 300, title: "C", explicit: "yes" }
        // bad explicit
      ]
    };
    const store = new BrowserHistoryEntriesStore();
    store.hydrate(raw);
    assert.deepStrictEqual(store.items.map((e) => e.id), [1]);
    store.dispose();
  });
  test("undefined snapshot resets to an empty store", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "A", void 0, false);
    store.hydrate(void 0);
    assert.deepStrictEqual(store.items, []);
    assert.strictEqual(store.add("https://b/", "B", void 0, false).id, 1);
    store.dispose();
  });
});
suite("BrowserFaviconsStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("register dedups by content and returns the same hash", () => {
    const store = new BrowserFaviconsStore();
    const h1 = store.register("data:image/png;base64,AAA");
    const h2 = store.register("data:image/png;base64,AAA");
    const h3 = store.register("data:image/png;base64,BBB");
    assert.strictEqual(h1, h2);
    assert.notStrictEqual(h1, h3);
    assert.strictEqual(store.get(h1), "data:image/png;base64,AAA");
    assert.strictEqual(store.get(h3), "data:image/png;base64,BBB");
    store.dispose();
  });
  test("onDidChange fires only when a new favicon is added", () => {
    const store = new BrowserFaviconsStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.register("a");
    store.register("a");
    store.register("b");
    assert.strictEqual(count, 2);
    sub.dispose();
    store.dispose();
  });
  test("gc drops orphans and fires onDidChange only when something changes", () => {
    const store = new BrowserFaviconsStore();
    const h1 = store.register("a");
    const h2 = store.register("b");
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.gc(/* @__PURE__ */ new Set([h1]));
    assert.strictEqual(store.get(h2), void 0);
    assert.strictEqual(store.get(h1), "a");
    assert.strictEqual(count, 1);
    store.gc(/* @__PURE__ */ new Set([h1]));
    assert.strictEqual(count, 1);
    sub.dispose();
    store.dispose();
  });
  test("serialize then hydrate round-trips", () => {
    const a = new BrowserFaviconsStore();
    a.register("one");
    a.register("two");
    const snapshot = a.serialize();
    const b = new BrowserFaviconsStore();
    b.hydrate(snapshot);
    assert.deepStrictEqual(b.serialize(), snapshot);
    a.dispose();
    b.dispose();
  });
  test("hydrate accepts unknown-typed data matching the current snapshot shape", () => {
    const raw = {
      map: {
        abc: "data:image/png;base64,AAA",
        def: "data:image/png;base64,BBB",
        // non-string values dropped silently
        bad: 123
      }
    };
    const store = new BrowserFaviconsStore();
    store.hydrate(raw);
    assert.strictEqual(store.get("abc"), "data:image/png;base64,AAA");
    assert.strictEqual(store.get("def"), "data:image/png;base64,BBB");
    assert.strictEqual(store.get("bad"), void 0);
    store.dispose();
  });
});
suite("BrowserHistoryStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add returns a handle whose id matches the underlying entry", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "A");
    assert.strictEqual(handle.id, store.entries.items[0].id);
    store.dispose();
  });
  test("add is a no-op when max entries is 0", () => {
    const store = new BrowserHistoryStore(0);
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    assert.deepStrictEqual(store.entries.items, []);
    assert.deepStrictEqual(store.favicons.serialize().map, {});
    handle.update({ title: "B" });
    handle.delete();
    store.dispose();
  });
  test("handle.update propagates to entry and registers the favicon", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "");
    handle.update({ title: "A", favicon: "data:image/png;base64,XXX" });
    const entry = store.entries.items[0];
    assert.strictEqual(entry.title, "A");
    assert.notStrictEqual(entry.icon, void 0);
    assert.strictEqual(store.favicons.get(entry.icon), "data:image/png;base64,XXX");
    store.dispose();
  });
  test("handle.update with explicit `favicon: null` clears the entry icon", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    assert.notStrictEqual(store.entries.items[0].icon, void 0);
    handle.update({ favicon: null });
    assert.strictEqual(store.entries.items[0].icon, void 0);
    store.dispose();
  });
  test("handle.delete removes the entry and GCs the orphaned favicon", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    const iconHash = store.entries.items[0].icon;
    assert.strictEqual(store.favicons.get(iconHash), "data:image/png;base64,XXX");
    handle.delete();
    assert.deepStrictEqual(store.entries.items, []);
    assert.strictEqual(store.favicons.get(iconHash), void 0);
    store.dispose();
  });
  test("favicons referenced by other entries are kept on delete", () => {
    const store = new BrowserHistoryStore();
    const a = store.add("https://a/", "A", "data:image/png;base64,XXX");
    store.add("https://b/", "B", "data:image/png;base64,XXX");
    const iconHash = store.entries.items[0].icon;
    a.delete();
    assert.strictEqual(store.favicons.get(iconHash), "data:image/png;base64,XXX");
    store.dispose();
  });
  test("clear wipes entries and favicons together", () => {
    const store = new BrowserHistoryStore();
    store.add("https://a/", "A", "data:image/png;base64,XXX");
    store.add("https://b/", "B", "data:image/png;base64,YYY");
    store.clear();
    assert.deepStrictEqual(store.entries.items, []);
    assert.deepStrictEqual(store.favicons.serialize().map, {});
    store.dispose();
  });
  test("onDidChange fires for changes in either sub-store", () => {
    const store = new BrowserHistoryStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    const after1 = count;
    assert.ok(after1 >= 2);
    handle.update({ title: "A2" });
    assert.ok(count > after1);
    sub.dispose();
    store.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXHRlc3RcXGNvbW1vblxcYnJvd3Nlckhpc3RvcnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0QnJvd3NlckZhdmljb25zU3RvcmUsXG5cdEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlLFxuXHRCcm93c2VySGlzdG9yeVN0b3JlLFxuXHRJU2VyaWFsaXplZEJyb3dzZXJGYXZpY29uc1NuYXBzaG90LFxuXHRJU2VyaWFsaXplZEJyb3dzZXJIaXN0b3J5RW50cmllc1NuYXBzaG90LFxufSBmcm9tICcuLi8uLi9jb21tb24vYnJvd3Nlckhpc3RvcnkuanMnO1xuXG5zdWl0ZSgnQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWRkIGFzc2lnbnMgbW9ub3RvbmljIGlkcyBhbmQgZXhwb3NlcyBpdGVtcyBvbGRlc3QtZmlyc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRjb25zdCBhID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRjb25zdCBiID0gc3RvcmUuYWRkKCdodHRwczovL2IvJywgJ0InLCAnaWNvbi1iJywgdHJ1ZSk7XG5cdFx0Y29uc3QgYyA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9jLycsICdDJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFthLmlkLCBiLmlkLCBjLmlkXSwgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zLm1hcChlID0+ICh7IGlkOiBlLmlkLCB1cmw6IGUudXJsLCBpY29uOiBlLmljb24sIGV4cGxpY2l0OiBlLmV4cGxpY2l0IH0pKSwgW1xuXHRcdFx0eyBpZDogMSwgdXJsOiAnaHR0cHM6Ly9hLycsIGljb246IHVuZGVmaW5lZCwgZXhwbGljaXQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBpZDogMiwgdXJsOiAnaHR0cHM6Ly9iLycsIGljb246ICdpY29uLWInLCBleHBsaWNpdDogdHJ1ZSB9LFxuXHRcdFx0eyBpZDogMywgdXJsOiAnaHR0cHM6Ly9jLycsIGljb246IHVuZGVmaW5lZCwgZXhwbGljaXQ6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBpcyBvbWl0dGVkIGZyb20gdGhlIGVudHJ5IHdoZW4gZmFsc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRjb25zdCBlID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZSwgJ2V4cGxpY2l0JyksIGZhbHNlKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIGNoYW5nZXMgdGl0bGUgYW5kIGljb24sIHJldHVybnMgd2hldGhlciBhbnl0aGluZyBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2EvJywgJycsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS51cGRhdGUoMSwgeyB0aXRsZTogJ0EnIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUudXBkYXRlKDEsIHsgZmF2aWNvbkhhc2g6ICdpY29uLWEnIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUudXBkYXRlKDEsIHsgdGl0bGU6ICdBJywgZmF2aWNvbkhhc2g6ICdpY29uLWEnIH0pLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zWzBdLnRpdGxlLCAnQScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmUuaXRlbXNbMF0uaWNvbiwgJ2ljb24tYScpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgaWdub3JlcyBlbXB0eSB0aXRsZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnVwZGF0ZSgxLCB7IHRpdGxlOiAnJyB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5pdGVtc1swXS50aXRsZSwgJ0EnKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIG9mIGFuIHVua25vd24gaWQgaXMgYSBuby1vcCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnVwZGF0ZSg5OTksIHsgdGl0bGU6ICdYJyB9KSwgZmFsc2UpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgcmVtb3ZlcyB0aGUgdGFyZ2V0ZWQgZW50cnkgYW5kIGxlYXZlcyBpZHMgb2Ygb3RoZXJzIGludGFjdCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdGNvbnN0IGEgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGNvbnN0IGIgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYi8nLCAnQicsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGNvbnN0IGMgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYy8nLCAnQycsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmRlbGV0ZShiLmlkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmRlbGV0ZShiLmlkKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmUuaXRlbXMubWFwKGUgPT4gZS5pZCksIFthLmlkLCBjLmlkXSk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCBiZXlvbmQgbWF4RW50cmllcyBldmljdHMgb2xkZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKDIpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2IvJywgJ0InLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRzdG9yZS5hZGQoJ2h0dHBzOi8vYy8nLCAnQycsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5pdGVtcy5tYXAoZSA9PiBlLnVybCksIFsnaHR0cHM6Ly9iLycsICdodHRwczovL2MvJ10pO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZSBmaXJlcyBmb3IgYWRkLCB1cGRhdGUsIGRlbGV0ZSwgY2xlYXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGNvbnN0IHN1YiA9IHN0b3JlLm9uRGlkQ2hhbmdlKCgpID0+IGNvdW50KyspO1xuXG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRzdG9yZS51cGRhdGUoMSwgeyB0aXRsZTogJ0EyJyB9KTtcblx0XHRzdG9yZS5kZWxldGUoMSk7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0XHQvLyBjbGVhciBvbiBhbHJlYWR5LWVtcHR5IHN0b3JlIHNob3VsZCBiZSBhIG5vLW9wXG5cdFx0c3RvcmUuY2xlYXIoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgNCk7XG5cblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplIHRoZW4gaHlkcmF0ZSByb3VuZC10cmlwcycsICgpID0+IHtcblx0XHRjb25zdCBhID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0YS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsICdpY29uLWEnLCB0cnVlKTtcblx0XHRhLmFkZCgnaHR0cHM6Ly9iLycsICdCJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhLnNlcmlhbGl6ZSgpO1xuXG5cdFx0Y29uc3QgYiA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdGIuaHlkcmF0ZShzbmFwc2hvdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChiLnNlcmlhbGl6ZSgpLCBzbmFwc2hvdCk7XG5cblx0XHRhLmRpc3Bvc2UoKTtcblx0XHRiLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaHlkcmF0ZSBzZWVkcyB0aGUgaWQgY291bnRlciBmcm9tIHRoZSBtYXggcmVzdG9yZWQgaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRzdG9yZS5oeWRyYXRlKHtcblx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdHsgaWQ6IDcsIHVybDogJ2h0dHBzOi8vYS8nLCB0aW1lOiAxMDAsIHRpdGxlOiAnQScgfSxcblx0XHRcdFx0eyBpZDogMTIsIHVybDogJ2h0dHBzOi8vYi8nLCB0aW1lOiAyMDAsIHRpdGxlOiAnQicgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbmV4dCA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9jLycsICdDJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHQuaWQsIDEzKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Jyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlLmh5ZHJhdGUgYmFja3dhcmRzLWNvbXBhdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhY2NlcHRzIGRhdGEgbWF0Y2hpbmcgcHJpb3Igc25hcHNob3Qgc2hhcGVzJywgKCkgPT4ge1xuXHRcdC8vIFByZXRlbmQgdGhpcyBjYW1lIG9mZiBkaXNrOiB0eXBlZCBhcyBgdW5rbm93bmAsIGRlbGliZXJhdGVseSB1bnRydXN0ZWRcblx0XHQvLyBzbyB0aGUgdGVzdCBndWFyZHMgYWdhaW5zdCBhY2NpZGVudGFsIGZ1dHVyZSBjaGFuZ2VzIHRvIHJlcXVpcmVkIGZpZWxkcy5cblx0XHQvLyBJTVBPUlRBTlQ6IERvbid0IGNoYW5nZSB0aGUgc2hhcGUgb2YgdGhpcy4gSXQgZW5zdXJlcyBjb21wYXRpYmlsaXR5IHdpdGggdGhlIGVhcmxpZXN0IHZlcnNpb25zIG9mIHRoZSBoaXN0b3J5IGludGVyZmFjZS5cblx0XHQvLyAgICAgICAgICAgIFdoZW4gdXBkYXRpbmcgdGhlIGludGVyZmFjZSwgc2ltcGx5IGV4dGVuZCBvciBhZGQgYSB0ZXN0IGZvciB0aGUgbmV3IHNoYXBlLlxuXHRcdGNvbnN0IHJhdzogdW5rbm93biA9IHtcblx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdHsgaWQ6IDEsIHVybDogJ2h0dHBzOi8vYS8nLCB0aW1lOiAxMDAsIHRpdGxlOiAnQScgfSxcblx0XHRcdFx0eyBpZDogMiwgdXJsOiAnaHR0cHM6Ly9iLycsIHRpbWU6IDIwMCwgdGl0bGU6ICdCJywgaWNvbjogJ2gxJyB9LFxuXHRcdFx0XHR7IGlkOiA0LCB1cmw6ICdodHRwczovL2MvJywgdGltZTogMzAwLCB0aXRsZTogJ0MnLCBleHBsaWNpdDogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRzdG9yZS5oeWRyYXRlKHJhdyBhcyBJU2VyaWFsaXplZEJyb3dzZXJIaXN0b3J5RW50cmllc1NuYXBzaG90KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zLCBbXG5cdFx0XHR7IGlkOiAxLCB1cmw6ICdodHRwczovL2EvJywgdGltZTogMTAwLCB0aXRsZTogJ0EnIH0sXG5cdFx0XHR7IGlkOiAyLCB1cmw6ICdodHRwczovL2IvJywgdGltZTogMjAwLCB0aXRsZTogJ0InLCBpY29uOiAnaDEnIH0sXG5cdFx0XHR7IGlkOiA0LCB1cmw6ICdodHRwczovL2MvJywgdGltZTogMzAwLCB0aXRsZTogJ0MnLCBleHBsaWNpdDogdHJ1ZSB9LFxuXHRcdF0pO1xuXHRcdC8vIE5leHQgYWRkIG11c3Qgbm90IGNvbGxpZGUgd2l0aCByZXN0b3JlZCBpZHMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmFkZCgnaHR0cHM6Ly9kLycsICdEJywgdW5kZWZpbmVkLCBmYWxzZSkuaWQsIDUpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBtYWxmb3JtZWQgZW50cmllcyBhbmQgYWNjZXB0cyB0aGUgcmVzdCcsICgpID0+IHtcblx0XHRjb25zdCByYXc6IHVua25vd24gPSB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHR7IGlkOiAxLCB1cmw6ICdodHRwczovL2EvJywgdGltZTogMTAwLCB0aXRsZTogJ0EnIH0sXG5cdFx0XHRcdHsgaWQ6ICdiYWQnLCB1cmw6ICdodHRwczovL2IvJywgdGltZTogMjAwLCB0aXRsZTogJ0InIH0sXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdHsgaWQ6IDIgfSwgLy8gbWlzc2luZyByZXF1aXJlZCBmaWVsZHNcblx0XHRcdFx0eyBpZDogMywgdXJsOiAnaHR0cHM6Ly9jLycsIHRpbWU6IDMwMCwgdGl0bGU6ICdDJywgZXhwbGljaXQ6ICd5ZXMnIH0sIC8vIGJhZCBleHBsaWNpdFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRzdG9yZS5oeWRyYXRlKHJhdyBhcyBJU2VyaWFsaXplZEJyb3dzZXJIaXN0b3J5RW50cmllc1NuYXBzaG90KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zLm1hcChlID0+IGUuaWQpLCBbMV0pO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmRlZmluZWQgc25hcHNob3QgcmVzZXRzIHRvIGFuIGVtcHR5IHN0b3JlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdHN0b3JlLmh5ZHJhdGUodW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmFkZCgnaHR0cHM6Ly9iLycsICdCJywgdW5kZWZpbmVkLCBmYWxzZSkuaWQsIDEpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQnJvd3NlckZhdmljb25zU3RvcmUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVnaXN0ZXIgZGVkdXBzIGJ5IGNvbnRlbnQgYW5kIHJldHVybnMgdGhlIHNhbWUgaGFzaCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VyRmF2aWNvbnNTdG9yZSgpO1xuXHRcdGNvbnN0IGgxID0gc3RvcmUucmVnaXN0ZXIoJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxBQUEnKTtcblx0XHRjb25zdCBoMiA9IHN0b3JlLnJlZ2lzdGVyKCdkYXRhOmltYWdlL3BuZztiYXNlNjQsQUFBJyk7XG5cdFx0Y29uc3QgaDMgPSBzdG9yZS5yZWdpc3RlcignZGF0YTppbWFnZS9wbmc7YmFzZTY0LEJCQicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGgxLCBoMik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGgxLCBoMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmdldChoMSksICdkYXRhOmltYWdlL3BuZztiYXNlNjQsQUFBJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmdldChoMyksICdkYXRhOmltYWdlL3BuZztiYXNlNjQsQkJCJyk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlIGZpcmVzIG9ubHkgd2hlbiBhIG5ldyBmYXZpY29uIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJGYXZpY29uc1N0b3JlKCk7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRjb25zdCBzdWIgPSBzdG9yZS5vbkRpZENoYW5nZSgoKSA9PiBjb3VudCsrKTtcblxuXHRcdHN0b3JlLnJlZ2lzdGVyKCdhJyk7XG5cdFx0c3RvcmUucmVnaXN0ZXIoJ2EnKTsgLy8gZHVwbGljYXRlIFx1MjAxNCBubyBldmVudFxuXHRcdHN0b3JlLnJlZ2lzdGVyKCdiJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpO1xuXG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2djIGRyb3BzIG9ycGhhbnMgYW5kIGZpcmVzIG9uRGlkQ2hhbmdlIG9ubHkgd2hlbiBzb21ldGhpbmcgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VyRmF2aWNvbnNTdG9yZSgpO1xuXHRcdGNvbnN0IGgxID0gc3RvcmUucmVnaXN0ZXIoJ2EnKTtcblx0XHRjb25zdCBoMiA9IHN0b3JlLnJlZ2lzdGVyKCdiJyk7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRjb25zdCBzdWIgPSBzdG9yZS5vbkRpZENoYW5nZSgoKSA9PiBjb3VudCsrKTtcblxuXHRcdHN0b3JlLmdjKG5ldyBTZXQoW2gxXSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoaDIpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoaDEpLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cblx0XHQvLyBOb3RoaW5nIHRvIHJlbW92ZSBcdTIxOTIgbm8gZXZlbnQuXG5cdFx0c3RvcmUuZ2MobmV3IFNldChbaDFdKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAxKTtcblxuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemUgdGhlbiBoeWRyYXRlIHJvdW5kLXRyaXBzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBuZXcgQnJvd3NlckZhdmljb25zU3RvcmUoKTtcblx0XHRhLnJlZ2lzdGVyKCdvbmUnKTtcblx0XHRhLnJlZ2lzdGVyKCd0d28nKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IGEuc2VyaWFsaXplKCk7XG5cblx0XHRjb25zdCBiID0gbmV3IEJyb3dzZXJGYXZpY29uc1N0b3JlKCk7XG5cdFx0Yi5oeWRyYXRlKHNuYXBzaG90KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGIuc2VyaWFsaXplKCksIHNuYXBzaG90KTtcblxuXHRcdGEuZGlzcG9zZSgpO1xuXHRcdGIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoeWRyYXRlIGFjY2VwdHMgdW5rbm93bi10eXBlZCBkYXRhIG1hdGNoaW5nIHRoZSBjdXJyZW50IHNuYXBzaG90IHNoYXBlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhdzogdW5rbm93biA9IHtcblx0XHRcdG1hcDoge1xuXHRcdFx0XHRhYmM6ICdkYXRhOmltYWdlL3BuZztiYXNlNjQsQUFBJyxcblx0XHRcdFx0ZGVmOiAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEJCQicsXG5cdFx0XHRcdC8vIG5vbi1zdHJpbmcgdmFsdWVzIGRyb3BwZWQgc2lsZW50bHlcblx0XHRcdFx0YmFkOiAxMjMsXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VyRmF2aWNvbnNTdG9yZSgpO1xuXHRcdHN0b3JlLmh5ZHJhdGUocmF3IGFzIElTZXJpYWxpemVkQnJvd3NlckZhdmljb25zU25hcHNob3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoJ2FiYycpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEFBQScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoJ2RlZicpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEJCQicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoJ2JhZCcpLCB1bmRlZmluZWQpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQnJvd3Nlckhpc3RvcnlTdG9yZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhZGQgcmV0dXJucyBhIGhhbmRsZSB3aG9zZSBpZCBtYXRjaGVzIHRoZSB1bmRlcmx5aW5nIGVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5U3RvcmUoKTtcblx0XHRjb25zdCBoYW5kbGUgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZS5pZCwgc3RvcmUuZW50cmllcy5pdGVtc1swXS5pZCk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCBpcyBhIG5vLW9wIHdoZW4gbWF4IGVudHJpZXMgaXMgMCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKDApO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmUuZW50cmllcy5pdGVtcywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmUuZmF2aWNvbnMuc2VyaWFsaXplKCkubWFwLCB7fSk7XG5cdFx0Ly8gSGFuZGxlIHNob3VsZCBiZSBzYWZlbHkgY2FsbGFibGUuXG5cdFx0aGFuZGxlLnVwZGF0ZSh7IHRpdGxlOiAnQicgfSk7XG5cdFx0aGFuZGxlLmRlbGV0ZSgpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGUudXBkYXRlIHByb3BhZ2F0ZXMgdG8gZW50cnkgYW5kIHJlZ2lzdGVycyB0aGUgZmF2aWNvbicsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKCk7XG5cdFx0Y29uc3QgaGFuZGxlID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJycpO1xuXHRcdGhhbmRsZS51cGRhdGUoeyB0aXRsZTogJ0EnLCBmYXZpY29uOiAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcgfSk7XG5cblx0XHRjb25zdCBlbnRyeSA9IHN0b3JlLmVudHJpZXMuaXRlbXNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnRpdGxlLCAnQScpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChlbnRyeS5pY29uLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5mYXZpY29ucy5nZXQoZW50cnkuaWNvbiEpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGUudXBkYXRlIHdpdGggZXhwbGljaXQgYGZhdmljb246IG51bGxgIGNsZWFycyB0aGUgZW50cnkgaWNvbicsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKCk7XG5cdFx0Y29uc3QgaGFuZGxlID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdG9yZS5lbnRyaWVzLml0ZW1zWzBdLmljb24sIHVuZGVmaW5lZCk7XG5cblx0XHRoYW5kbGUudXBkYXRlKHsgZmF2aWNvbjogbnVsbCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZW50cmllcy5pdGVtc1swXS5pY29uLCB1bmRlZmluZWQpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGUuZGVsZXRlIHJlbW92ZXMgdGhlIGVudHJ5IGFuZCBHQ3MgdGhlIG9ycGhhbmVkIGZhdmljb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlTdG9yZSgpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnKTtcblx0XHRjb25zdCBpY29uSGFzaCA9IHN0b3JlLmVudHJpZXMuaXRlbXNbMF0uaWNvbiE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmZhdmljb25zLmdldChpY29uSGFzaCksICdkYXRhOmltYWdlL3BuZztiYXNlNjQsWFhYJyk7XG5cblx0XHRoYW5kbGUuZGVsZXRlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5lbnRyaWVzLml0ZW1zLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmZhdmljb25zLmdldChpY29uSGFzaCksIHVuZGVmaW5lZCk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zhdmljb25zIHJlZmVyZW5jZWQgYnkgb3RoZXIgZW50cmllcyBhcmUga2VwdCBvbiBkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlTdG9yZSgpO1xuXHRcdGNvbnN0IGEgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsICdkYXRhOmltYWdlL3BuZztiYXNlNjQsWFhYJyk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2IvJywgJ0InLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXHRcdGNvbnN0IGljb25IYXNoID0gc3RvcmUuZW50cmllcy5pdGVtc1swXS5pY29uITtcblxuXHRcdGEuZGVsZXRlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmZhdmljb25zLmdldChpY29uSGFzaCksICdkYXRhOmltYWdlL3BuZztiYXNlNjQsWFhYJyk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyIHdpcGVzIGVudHJpZXMgYW5kIGZhdmljb25zIHRvZ2V0aGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5U3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsICdkYXRhOmltYWdlL3BuZztiYXNlNjQsWFhYJyk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2IvJywgJ0InLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFlZWScpO1xuXG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLmVudHJpZXMuaXRlbXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLmZhdmljb25zLnNlcmlhbGl6ZSgpLm1hcCwge30pO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZSBmaXJlcyBmb3IgY2hhbmdlcyBpbiBlaXRoZXIgc3ViLXN0b3JlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5U3RvcmUoKTtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGNvbnN0IHN1YiA9IHN0b3JlLm9uRGlkQ2hhbmdlKCgpID0+IGNvdW50KyspO1xuXG5cdFx0Y29uc3QgaGFuZGxlID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXHRcdC8vIGFkZCBmaXJlZDogcmVnaXN0ZXIgZmF2aWNvbiAoKzEpLCBhZGQgZW50cnkgKCsxKSwgZmF2aWNvbiBHQyBtYXkgYWxzbyBmaXJlXG5cdFx0Y29uc3QgYWZ0ZXIxID0gY291bnQ7XG5cdFx0YXNzZXJ0Lm9rKGFmdGVyMSA+PSAyKTtcblxuXHRcdGhhbmRsZS51cGRhdGUoeyB0aXRsZTogJ0EyJyB9KTsgLy8gZW50cnkgY2hhbmdlIFx1MjE5MiBhdCBsZWFzdCBvbmUgbW9yZVxuXHRcdGFzc2VydC5vayhjb3VudCA+IGFmdGVyMSk7XG5cblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BR007QUFFUCxNQUFNLDhCQUE4QixNQUFNO0FBRXpDLDBDQUF3QztBQUV4QyxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sUUFBUSxJQUFJLDJCQUEyQjtBQUM3QyxVQUFNLElBQUksTUFBTSxJQUFJLGNBQWMsS0FBSyxRQUFXLEtBQUs7QUFDdkQsVUFBTSxJQUFJLE1BQU0sSUFBSSxjQUFjLEtBQUssVUFBVSxJQUFJO0FBQ3JELFVBQU0s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
