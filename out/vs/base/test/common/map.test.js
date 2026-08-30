import assert from "assert";
import { BidirectionalMap, LinkedMap, LRUCache, mapsStrictEqualIgnoreOrder, MRUCache, NKeyMap, ResourceMap, SetMap, Touch } from "../../common/map.js";
import { extUriIgnorePathCase } from "../../common/resources.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Map", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("LinkedMap - Simple", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    assert.deepStrictEqual([...map.keys()], ["ak", "bk"]);
    assert.deepStrictEqual([...map.values()], ["av", "bv"]);
    assert.strictEqual(map.first, "av");
    assert.strictEqual(map.last, "bv");
  });
  test("LinkedMap - Touch Old one", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("ak", "av", Touch.AsOld);
    assert.deepStrictEqual([...map.keys()], ["ak"]);
    assert.deepStrictEqual([...map.values()], ["av"]);
  });
  test("LinkedMap - Touch New one", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("ak", "av", Touch.AsNew);
    assert.deepStrictEqual([...map.keys()], ["ak"]);
    assert.deepStrictEqual([...map.values()], ["av"]);
  });
  test("LinkedMap - Touch Old two", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("bk", "bv", Touch.AsOld);
    assert.deepStrictEqual([...map.keys()], ["bk", "ak"]);
    assert.deepStrictEqual([...map.values()], ["bv", "av"]);
  });
  test("LinkedMap - Touch New two", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ak", "av", Touch.AsNew);
    assert.deepStrictEqual([...map.keys()], ["bk", "ak"]);
    assert.deepStrictEqual([...map.values()], ["bv", "av"]);
  });
  test("LinkedMap - Touch Old from middle", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ck", "cv");
    map.set("bk", "bv", Touch.AsOld);
    assert.deepStrictEqual([...map.keys()], ["bk", "ak", "ck"]);
    assert.deepStrictEqual([...map.values()], ["bv", "av", "cv"]);
  });
  test("LinkedMap - Touch New from middle", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ck", "cv");
    map.set("bk", "bv", Touch.AsNew);
    assert.deepStrictEqual([...map.keys()], ["ak", "ck", "bk"]);
    assert.deepStrictEqual([...map.values()], ["av", "cv", "bv"]);
  });
  test("LinkedMap - basics", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    map.set("2", "2");
    map.set("3", true);
    const obj = /* @__PURE__ */ Object.create(null);
    map.set("4", obj);
    const date = Date.now();
    map.set("5", date);
    assert.strictEqual(map.size, 5);
    assert.strictEqual(map.get("1"), 1);
    assert.strictEqual(map.get("2"), "2");
    assert.strictEqual(map.get("3"), true);
    assert.strictEqual(map.get("4"), obj);
    assert.strictEqual(map.get("5"), date);
    assert.ok(!map.get("6"));
    map.delete("6");
    assert.strictEqual(map.size, 5);
    assert.strictEqual(map.delete("1"), true);
    assert.strictEqual(map.delete("2"), true);
    assert.strictEqual(map.delete("3"), true);
    assert.strictEqual(map.delete("4"), true);
    assert.strictEqual(map.delete("5"), true);
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get("5"));
    assert.ok(!map.get("4"));
    assert.ok(!map.get("3"));
    assert.ok(!map.get("2"));
    assert.ok(!map.get("1"));
    map.set("1", 1);
    map.set("2", "2");
    map.set("3", true);
    assert.ok(map.has("1"));
    assert.strictEqual(map.get("1"), 1);
    assert.strictEqual(map.get("2"), "2");
    assert.strictEqual(map.get("3"), true);
    map.clear();
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get("1"));
    assert.ok(!map.get("2"));
    assert.ok(!map.get("3"));
    assert.ok(!map.has("1"));
  });
  test("LinkedMap - Iterators", () => {
    const map = new LinkedMap();
    map.set(1, 1);
    map.set(2, 2);
    map.set(3, 3);
    for (const elem of map.keys()) {
      assert.ok(elem);
    }
    for (const elem of map.values()) {
      assert.ok(elem);
    }
    for (const elem of map.entries()) {
      assert.ok(elem);
    }
    {
      const keys = map.keys();
      const values = map.values();
      const entries = map.entries();
      map.get(1);
      keys.next();
      values.next();
      entries.next();
    }
    {
      const keys = map.keys();
      const values = map.values();
      const entries = map.entries();
      map.get(1, Touch.AsNew);
      let exceptions = 0;
      try {
        keys.next();
      } catch (err) {
        exceptions++;
      }
      try {
        values.next();
      } catch (err) {
        exceptions++;
      }
      try {
        entries.next();
      } catch (err) {
        exceptions++;
      }
      assert.strictEqual(exceptions, 3);
    }
  });
  test("LinkedMap - LRU Cache simple", () => {
    const cache = new LRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    cache.set(6, 6);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [2, 3, 4, 5, 6]);
    cache.set(7, 7);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [3, 4, 5, 6, 7]);
    const values = [];
    [3, 4, 5, 6, 7].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [3, 4, 5, 6, 7]);
  });
  test("LinkedMap - LRU Cache get", () => {
    const cache = new LRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 5]);
    cache.get(3);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    cache.peek(4);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    const values = [];
    [1, 2, 3, 4, 5].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 5]);
  });
  test("LinkedMap - LRU Cache limit", () => {
    const cache = new LRUCache(10);
    for (let i = 1; i <= 10; i++) {
      cache.set(i, i);
    }
    assert.strictEqual(cache.size, 10);
    cache.limit = 5;
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [6, 7, 8, 9, 10]);
    cache.limit = 20;
    assert.strictEqual(cache.size, 5);
    for (let i = 11; i <= 20; i++) {
      cache.set(i, i);
    }
    assert.deepStrictEqual(cache.size, 15);
    const values = [];
    for (let i = 6; i <= 20; i++) {
      values.push(cache.get(i));
      assert.strictEqual(cache.get(i), i);
    }
    assert.deepStrictEqual([...cache.values()], values);
  });
  test("LinkedMap - LRU Cache limit with ratio", () => {
    const cache = new LRUCache(10, 0.5);
    for (let i = 1; i <= 10; i++) {
      cache.set(i, i);
    }
    assert.strictEqual(cache.size, 10);
    cache.set(11, 11);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [7, 8, 9, 10, 11]);
    const values = [];
    [...cache.keys()].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [7, 8, 9, 10, 11]);
    assert.deepStrictEqual([...cache.values()], values);
  });
  test("LinkedMap - MRU Cache simple", () => {
    const cache = new MRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    cache.set(6, 6);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 6]);
    cache.set(7, 7);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 7]);
    const values = [];
    [1, 2, 3, 4, 7].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 7]);
  });
  test("LinkedMap - MRU Cache get", () => {
    const cache = new MRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 5]);
    cache.get(3);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    cache.peek(4);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    const values = [];
    [1, 2, 3, 4, 5].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 5]);
  });
  test("LinkedMap - MRU Cache limit with ratio", () => {
    const cache = new MRUCache(10, 0.5);
    for (let i = 1; i <= 10; i++) {
      cache.set(i, i);
    }
    assert.strictEqual(cache.size, 10);
    cache.set(11, 11);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 11]);
    const values = [];
    [...cache.keys()].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 11]);
    assert.deepStrictEqual([...cache.values()], values);
  });
  test("LinkedMap - toJSON / fromJSON", () => {
    let map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ck", "cv");
    const json = map.toJSON();
    map = new LinkedMap();
    map.fromJSON(json);
    let i = 0;
    map.forEach((value, key) => {
      if (i === 0) {
        assert.strictEqual(key, "ak");
        assert.strictEqual(value, "av");
      } else if (i === 1) {
        assert.strictEqual(key, "bk");
        assert.strictEqual(value, "bv");
      } else if (i === 2) {
        assert.strictEqual(key, "ck");
        assert.strictEqual(value, "cv");
      }
      i++;
    });
  });
  test("LinkedMap - delete Head and Tail", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    assert.strictEqual(map.size, 1);
    map.delete("1");
    assert.strictEqual(map.get("1"), void 0);
    assert.strictEqual(map.size, 0);
    assert.strictEqual([...map.keys()].length, 0);
  });
  test("LinkedMap - delete Head", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    map.set("2", 2);
    assert.strictEqual(map.size, 2);
    map.delete("1");
    assert.strictEqual(map.get("2"), 2);
    assert.strictEqual(map.size, 1);
    assert.strictEqual([...map.keys()].length, 1);
    assert.strictEqual([...map.keys()][0], "2");
  });
  test("LinkedMap - delete Tail", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    map.set("2", 2);
    assert.strictEqual(map.size, 2);
    map.delete("2");
    assert.strictEqual(map.get("1"), 1);
    assert.strictEqual(map.size, 1);
    assert.strictEqual([...map.keys()].length, 1);
    assert.strictEqual([...map.keys()][0], "1");
  });
  test("ResourceMap - basics", function() {
    const map = new ResourceMap();
    const resource1 = URI.parse("some://1");
    const resource2 = URI.parse("some://2");
    const resource3 = URI.parse("some://3");
    const resource4 = URI.parse("some://4");
    const resource5 = URI.parse("some://5");
    const resource6 = URI.parse("some://6");
    assert.strictEqual(map.size, 0);
    const res = map.set(resource1, 1);
    assert.ok(res === map);
    map.set(resource2, "2");
    map.set(resource3, true);
    const values = [...map.values()];
    assert.strictEqual(values[0], 1);
    assert.strictEqual(values[1], "2");
    assert.strictEqual(values[2], true);
    let counter = 0;
    map.forEach((value, key, mapObj) => {
      assert.strictEqual(value, values[counter++]);
      assert.ok(URI.isUri(key));
      assert.ok(map === mapObj);
    });
    const obj = /* @__PURE__ */ Object.create(null);
    map.set(resource4, obj);
    const date = Date.now();
    map.set(resource5, date);
    assert.strictEqual(map.size, 5);
    assert.strictEqual(map.get(resource1), 1);
    assert.strictEqual(map.get(resource2), "2");
    assert.strictEqual(map.get(resource3), true);
    assert.strictEqual(map.get(resource4), obj);
    assert.strictEqual(map.get(resource5), date);
    assert.ok(!map.get(resource6));
    map.delete(resource6);
    assert.strictEqual(map.size, 5);
    assert.ok(map.delete(resource1));
    assert.ok(map.delete(resource2));
    assert.ok(map.delete(resource3));
    assert.ok(map.delete(resource4));
    assert.ok(map.delete(resource5));
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get(resource5));
    assert.ok(!map.get(resource4));
    assert.ok(!map.get(resource3));
    assert.ok(!map.get(resource2));
    assert.ok(!map.get(resource1));
    map.set(resource1, 1);
    map.set(resource2, "2");
    map.set(resource3, true);
    assert.ok(map.has(resource1));
    assert.strictEqual(map.get(resource1), 1);
    assert.strictEqual(map.get(resource2), "2");
    assert.strictEqual(map.get(resource3), true);
    map.clear();
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get(resource1));
    assert.ok(!map.get(resource2));
    assert.ok(!map.get(resource3));
    assert.ok(!map.has(resource1));
    map.set(resource1, false);
    map.set(resource2, 0);
    assert.ok(map.has(resource1));
    assert.ok(map.has(resource2));
  });
  test("ResourceMap - files (do NOT ignorecase)", function() {
    const map = new ResourceMap();
    const fileA = URI.parse("file://some/filea");
    const fileB = URI.parse("some://some/other/fileb");
    const fileAUpper = URI.parse("file://SOME/FILEA");
    map.set(fileA, "true");
    assert.strictEqual(map.get(fileA), "true");
    assert.ok(!map.get(fileAUpper));
    assert.ok(!map.get(fileB));
    map.set(fileAUpper, "false");
    assert.strictEqual(map.get(fileAUpper), "false");
    assert.strictEqual(map.get(fileA), "true");
    const windowsFile = URI.file("c:\\test with %25\\c#code");
    const uncFile = URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json");
    map.set(windowsFile, "true");
    map.set(uncFile, "true");
    assert.strictEqual(map.get(windowsFile), "true");
    assert.strictEqual(map.get(uncFile), "true");
  });
  test("ResourceMap - files (ignorecase)", function() {
    const map = new ResourceMap((uri) => extUriIgnorePathCase.getComparisonKey(uri));
    const fileA = URI.parse("file://some/filea");
    const fileB = URI.parse("some://some/other/fileb");
    const fileAUpper = URI.parse("file://SOME/FILEA");
    map.set(fileA, "true");
    assert.strictEqual(map.get(fileA), "true");
    assert.strictEqual(map.get(fileAUpper), "true");
    assert.ok(!map.get(fileB));
    map.set(fileAUpper, "false");
    assert.strictEqual(map.get(fileAUpper), "false");
    assert.strictEqual(map.get(fileA), "false");
    const windowsFile = URI.file("c:\\test with %25\\c#code");
    const uncFile = URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json");
    map.set(windowsFile, "true");
    map.set(uncFile, "true");
    assert.strictEqual(map.get(windowsFile), "true");
    assert.strictEqual(map.get(uncFile), "true");
  });
  test("ResourceMap - files (ignorecase, BUT preservecase)", function() {
    const map = new ResourceMap((uri) => extUriIgnorePathCase.getComparisonKey(uri));
    const fileA = URI.parse("file://some/filea");
    const fileAUpper = URI.parse("file://SOME/FILEA");
    map.set(fileA, 1);
    assert.strictEqual(map.get(fileA), 1);
    assert.strictEqual(map.get(fileAUpper), 1);
    assert.deepStrictEqual(Array.from(map.keys()).map(String), [fileA].map(String));
    assert.deepStrictEqual(Array.from(map), [[fileA, 1]]);
    map.set(fileAUpper, 1);
    assert.strictEqual(map.get(fileA), 1);
    assert.strictEqual(map.get(fileAUpper), 1);
    assert.deepStrictEqual(Array.from(map.keys()).map(String), [fileAUpper].map(String));
    assert.deepStrictEqual(Array.from(map), [[fileAUpper, 1]]);
  });
  test("mapsStrictEqualIgnoreOrder", () => {
    const map1 = /* @__PURE__ */ new Map();
    const map2 = /* @__PURE__ */ new Map();
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), true);
    map1.set("foo", "bar");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), false);
    map2.set("foo", "bar");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), true);
    map2.set("bar", "foo");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), false);
    map1.set("bar", "foo");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), true);
  });
});
suite("BidirectionalMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should set and get values correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.get("one"), 1);
    assert.strictEqual(map.get("two"), 2);
    assert.strictEqual(map.get("three"), 3);
  });
  test("should get keys by value correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.getKey(1), "one");
    assert.strictEqual(map.getKey(2), "two");
    assert.strictEqual(map.getKey(3), "three");
  });
  test("should delete values correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.delete("one"), true);
    assert.strictEqual(map.get("one"), void 0);
    assert.strictEqual(map.getKey(1), void 0);
    assert.strictEqual(map.delete("two"), true);
    assert.strictEqual(map.get("two"), void 0);
    assert.strictEqual(map.getKey(2), void 0);
    assert.strictEqual(map.delete("three"), true);
    assert.strictEqual(map.get("three"), void 0);
    assert.strictEqual(map.getKey(3), void 0);
  });
  test("should handle non-existent keys correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.get("four"), void 0);
    assert.strictEqual(map.getKey(4), void 0);
    assert.strictEqual(map.delete("four"), false);
  });
  test("should not leave a stale reverse entry when a key value is updated", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("one", 2);
    assert.strictEqual(map.get("one"), 2);
    assert.strictEqual(map.getKey(2), "one");
    assert.strictEqual(map.getKey(1), void 0);
  });
  test("should handle forEach correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    const keys = [];
    const values = [];
    map.forEach((value, key) => {
      keys.push(key);
      values.push(value);
    });
    assert.deepStrictEqual(keys, ["one", "two", "three"]);
    assert.deepStrictEqual(values, [1, 2, 3]);
  });
  test("should handle clear correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    map.clear();
    assert.strictEqual(map.get("one"), void 0);
    assert.strictEqual(map.get("two"), void 0);
    assert.strictEqual(map.get("three"), void 0);
    assert.strictEqual(map.getKey(1), void 0);
    assert.strictEqual(map.getKey(2), void 0);
    assert.strictEqual(map.getKey(3), void 0);
  });
});
suite("SetMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add and get", () => {
    const setMap = new SetMap();
    setMap.add("a", 1);
    setMap.add("a", 2);
    setMap.add("b", 3);
    assert.deepStrictEqual([...setMap.get("a")], [1, 2]);
    assert.deepStrictEqual([...setMap.get("b")], [3]);
  });
  test("delete", () => {
    const setMap = new SetMap();
    setMap.add("a", 1);
    setMap.add("a", 2);
    setMap.add("b", 3);
    setMap.delete("a", 1);
    assert.deepStrictEqual([...setMap.get("a")], [2]);
    setMap.delete("a", 2);
    assert.deepStrictEqual([...setMap.get("a")], []);
  });
  test("forEach", () => {
    const setMap = new SetMap();
    setMap.add("a", 1);
    setMap.add("a", 2);
    setMap.add("b", 3);
    let sum = 0;
    setMap.forEach("a", (value) => sum += value);
    assert.strictEqual(sum, 3);
  });
  test("get empty set", () => {
    const setMap = new SetMap();
    assert.deepStrictEqual([...setMap.get("a")], []);
  });
});
suite("NKeyMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("set and get", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c", "d");
    map.set(2, "a", "c", "c", "d");
    map.set(3, "b", "e", "f", "g");
    assert.strictEqual(map.get("a", "b", "c", "d"), 1);
    assert.strictEqual(map.get("a", "c", "c", "d"), 2);
    assert.strictEqual(map.get("b", "e", "f", "g"), 3);
    assert.strictEqual(map.get("a", "b", "c", "a"), void 0);
  });
  test("clear", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c", "d");
    map.set(2, "a", "c", "c", "d");
    map.set(3, "b", "e", "f", "g");
    map.clear();
    assert.strictEqual(map.get("a", "b", "c", "d"), void 0);
    assert.strictEqual(map.get("a", "c", "c", "d"), void 0);
    assert.strictEqual(map.get("b", "e", "f", "g"), void 0);
  });
  test("values", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c", "d");
    map.set(2, "a", "c", "c", "d");
    map.set(3, "b", "e", "f", "g");
    assert.deepStrictEqual(Array.from(map.values()), [1, 2, 3]);
  });
  test("getAll", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "a", "b", "d");
    map.set(3, "a", "e", "f");
    map.set(4, "g", "h", "i");
    assert.deepStrictEqual(Array.from(map.getAll("a", "b")), [1, 2]);
    assert.deepStrictEqual(Array.from(map.getAll("a")), [1, 2, 3]);
    assert.deepStrictEqual(Array.from(map.getAll("missing")), []);
  });
  test("delete", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "a", "b", "d");
    map.set(3, "x", "y", "z");
    assert.strictEqual(map.delete("a", "b", "c"), true);
    assert.strictEqual(map.delete("a", "b", "c"), false);
    assert.deepStrictEqual(Array.from(map.values()), [2, 3]);
  });
  test("deleteAll", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "a", "b", "d");
    map.set(3, "a", "e", "f");
    map.set(4, "g", "h", "i");
    assert.strictEqual(map.deleteAll("a", "b"), true);
    assert.deepStrictEqual(Array.from(map.values()), [3, 4]);
    assert.strictEqual(map.deleteAll("missing"), false);
    assert.strictEqual(map.deleteAll(), true);
    assert.deepStrictEqual(Array.from(map.values()), []);
  });
  test("deleteAll cleans empty parent maps", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "x", "y", "z");
    assert.strictEqual(map.deleteAll("a", "b"), true);
    assert.strictEqual(map.deleteAll("a"), false);
    assert.deepStrictEqual(Array.from(map.values()), [2]);
  });
  test("toString", () => {
    const map = new NKeyMap();
    map.set(1, "f", "o", "o");
    map.set(2, "b", "a", "r");
    map.set(3, "b", "a", "z");
    map.set(3, "b", "o", "o");
    assert.strictEqual(map.toString(), [
      "f: ",
      "  o: ",
      "    o: 1",
      "b: ",
      "  a: ",
      "    r: 2",
      "    z: 3",
      "  o: ",
      "    o: 3",
      ""
    ].join("\n"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXG1hcC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQmlkaXJlY3Rpb25hbE1hcCwgTGlua2VkTWFwLCBMUlVDYWNoZSwgbWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXIsIE1SVUNhY2hlLCBOS2V5TWFwLCBSZXNvdXJjZU1hcCwgU2V0TWFwLCBUb3VjaCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZXh0VXJpSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdNYXAnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gU2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldLCBbJ2FrJywgJ2JrJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC52YWx1ZXMoKV0sIFsnYXYnLCAnYnYnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5maXJzdCwgJ2F2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5sYXN0LCAnYnYnKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gVG91Y2ggT2xkIG9uZScsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdG1hcC5zZXQoJ2FrJywgJ2F2Jyk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnLCBUb3VjaC5Bc09sZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0sIFsnYWsnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLnZhbHVlcygpXSwgWydhdiddKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gVG91Y2ggTmV3IG9uZScsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdG1hcC5zZXQoJ2FrJywgJ2F2Jyk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnLCBUb3VjaC5Bc05ldyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0sIFsnYWsnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLnZhbHVlcygpXSwgWydhdiddKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gVG91Y2ggT2xkIHR3bycsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdG1hcC5zZXQoJ2FrJywgJ2F2Jyk7XG5cdFx0bWFwLnNldCgnYmsnLCAnYnYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicsIFRvdWNoLkFzT2xkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXSwgWydiaycsICdhayddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tYXAudmFsdWVzKCldLCBbJ2J2JywgJ2F2J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBUb3VjaCBOZXcgdHdvJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicpO1xuXHRcdG1hcC5zZXQoJ2FrJywgJ2F2JywgVG91Y2guQXNOZXcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldLCBbJ2JrJywgJ2FrJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC52YWx1ZXMoKV0sIFsnYnYnLCAnYXYnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIFRvdWNoIE9sZCBmcm9tIG1pZGRsZScsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdG1hcC5zZXQoJ2FrJywgJ2F2Jyk7XG5cdFx0bWFwLnNldCgnYmsnLCAnYnYnKTtcblx0XHRtYXAuc2V0KCdjaycsICdjdicpO1xuXHRcdG1hcC5zZXQoJ2JrJywgJ2J2JywgVG91Y2guQXNPbGQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldLCBbJ2JrJywgJ2FrJywgJ2NrJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC52YWx1ZXMoKV0sIFsnYnYnLCAnYXYnLCAnY3YnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIFRvdWNoIE5ldyBmcm9tIG1pZGRsZScsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdG1hcC5zZXQoJ2FrJywgJ2F2Jyk7XG5cdFx0bWFwLnNldCgnYmsnLCAnYnYnKTtcblx0XHRtYXAuc2V0KCdjaycsICdjdicpO1xuXHRcdG1hcC5zZXQoJ2JrJywgJ2J2JywgVG91Y2guQXNOZXcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldLCBbJ2FrJywgJ2NrJywgJ2JrJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC52YWx1ZXMoKV0sIFsnYXYnLCAnY3YnLCAnYnYnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIGJhc2ljcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgYW55PigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAwKTtcblxuXHRcdG1hcC5zZXQoJzEnLCAxKTtcblx0XHRtYXAuc2V0KCcyJywgJzInKTtcblx0XHRtYXAuc2V0KCczJywgdHJ1ZSk7XG5cblx0XHRjb25zdCBvYmogPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdG1hcC5zZXQoJzQnLCBvYmopO1xuXG5cdFx0Y29uc3QgZGF0ZSA9IERhdGUubm93KCk7XG5cdFx0bWFwLnNldCgnNScsIGRhdGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMScpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMicpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCczJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCc0JyksIG9iaik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzUnKSwgZGF0ZSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KCc2JykpO1xuXG5cdFx0bWFwLmRlbGV0ZSgnNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJzEnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJzInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJzMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJzQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJzUnKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXHRcdGFzc2VydC5vayghbWFwLmdldCgnNScpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQoJzQnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KCczJykpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldCgnMicpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQoJzEnKSk7XG5cblx0XHRtYXAuc2V0KCcxJywgMSk7XG5cdFx0bWFwLnNldCgnMicsICcyJyk7XG5cdFx0bWFwLnNldCgnMycsIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKG1hcC5oYXMoJzEnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzEnKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzInKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMycpLCB0cnVlKTtcblxuXHRcdG1hcC5jbGVhcigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAwKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQoJzEnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KCcyJykpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldCgnMycpKTtcblx0XHRhc3NlcnQub2soIW1hcC5oYXMoJzEnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIEl0ZXJhdG9ycycsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPG51bWJlciwgYW55PigpO1xuXHRcdG1hcC5zZXQoMSwgMSk7XG5cdFx0bWFwLnNldCgyLCAyKTtcblx0XHRtYXAuc2V0KDMsIDMpO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtIG9mIG1hcC5rZXlzKCkpIHtcblx0XHRcdGFzc2VydC5vayhlbGVtKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVsZW0gb2YgbWFwLnZhbHVlcygpKSB7XG5cdFx0XHRhc3NlcnQub2soZWxlbSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlbGVtIG9mIG1hcC5lbnRyaWVzKCkpIHtcblx0XHRcdGFzc2VydC5vayhlbGVtKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBrZXlzID0gbWFwLmtleXMoKTtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IG1hcC52YWx1ZXMoKTtcblx0XHRcdGNvbnN0IGVudHJpZXMgPSBtYXAuZW50cmllcygpO1xuXHRcdFx0bWFwLmdldCgxKTtcblx0XHRcdGtleXMubmV4dCgpO1xuXHRcdFx0dmFsdWVzLm5leHQoKTtcblx0XHRcdGVudHJpZXMubmV4dCgpO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdGNvbnN0IGtleXMgPSBtYXAua2V5cygpO1xuXHRcdFx0Y29uc3QgdmFsdWVzID0gbWFwLnZhbHVlcygpO1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IG1hcC5lbnRyaWVzKCk7XG5cdFx0XHRtYXAuZ2V0KDEsIFRvdWNoLkFzTmV3KTtcblxuXHRcdFx0bGV0IGV4Y2VwdGlvbnM6IG51bWJlciA9IDA7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRrZXlzLm5leHQoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRleGNlcHRpb25zKys7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR2YWx1ZXMubmV4dCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGV4Y2VwdGlvbnMrKztcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVudHJpZXMubmV4dCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGV4Y2VwdGlvbnMrKztcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbnMsIDMpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gTFJVIENhY2hlIHNpbXBsZScsICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBMUlVDYWNoZTxudW1iZXIsIG51bWJlcj4oNSk7XG5cblx0XHRbMSwgMiwgMywgNCwgNV0uZm9yRWFjaCh2YWx1ZSA9PiBjYWNoZS5zZXQodmFsdWUsIHZhbHVlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDUpO1xuXHRcdGNhY2hlLnNldCg2LCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzIsIDMsIDQsIDUsIDZdKTtcblx0XHRjYWNoZS5zZXQoNywgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFszLCA0LCA1LCA2LCA3XSk7XG5cdFx0Y29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFszLCA0LCA1LCA2LCA3XS5mb3JFYWNoKGtleSA9PiB2YWx1ZXMucHVzaChjYWNoZS5nZXQoa2V5KSEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzMsIDQsIDUsIDYsIDddKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gTFJVIENhY2hlIGdldCcsICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBMUlVDYWNoZTxudW1iZXIsIG51bWJlcj4oNSk7XG5cblx0XHRbMSwgMiwgMywgNCwgNV0uZm9yRWFjaCh2YWx1ZSA9PiBjYWNoZS5zZXQodmFsdWUsIHZhbHVlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0Y2FjaGUuZ2V0KDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFsxLCAyLCA0LCA1LCAzXSk7XG5cdFx0Y2FjaGUucGVlayg0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMSwgMiwgNCwgNSwgM10pO1xuXHRcdGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcblx0XHRbMSwgMiwgMywgNCwgNV0uZm9yRWFjaChrZXkgPT4gdmFsdWVzLnB1c2goY2FjaGUuZ2V0KGtleSkhKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZXMsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIExSVSBDYWNoZSBsaW1pdCcsICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBMUlVDYWNoZTxudW1iZXIsIG51bWJlcj4oMTApO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gMTA7IGkrKykge1xuXHRcdFx0Y2FjaGUuc2V0KGksIGkpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgMTApO1xuXHRcdGNhY2hlLmxpbWl0ID0gNTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzYsIDcsIDgsIDksIDEwXSk7XG5cdFx0Y2FjaGUubGltaXQgPSAyMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0Zm9yIChsZXQgaSA9IDExOyBpIDw9IDIwOyBpKyspIHtcblx0XHRcdGNhY2hlLnNldChpLCBpKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWNoZS5zaXplLCAxNSk7XG5cdFx0Y29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSA2OyBpIDw9IDIwOyBpKyspIHtcblx0XHRcdHZhbHVlcy5wdXNoKGNhY2hlLmdldChpKSEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLmdldChpKSwgaSk7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLnZhbHVlcygpXSwgdmFsdWVzKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gTFJVIENhY2hlIGxpbWl0IHdpdGggcmF0aW8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgTFJVQ2FjaGU8bnVtYmVyLCBudW1iZXI+KDEwLCAwLjUpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gMTA7IGkrKykge1xuXHRcdFx0Y2FjaGUuc2V0KGksIGkpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgMTApO1xuXHRcdGNhY2hlLnNldCgxMSwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbNywgOCwgOSwgMTAsIDExXSk7XG5cdFx0Y29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFsuLi5jYWNoZS5rZXlzKCldLmZvckVhY2goa2V5ID0+IHZhbHVlcy5wdXNoKGNhY2hlLmdldChrZXkpISkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbNywgOCwgOSwgMTAsIDExXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUudmFsdWVzKCldLCB2YWx1ZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBNUlUgQ2FjaGUgc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IE1SVUNhY2hlPG51bWJlciwgbnVtYmVyPig1KTtcblxuXHRcdFsxLCAyLCAzLCA0LCA1XS5mb3JFYWNoKHZhbHVlID0+IGNhY2hlLnNldCh2YWx1ZSwgdmFsdWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0Y2FjaGUuc2V0KDYsIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMSwgMiwgMywgNCwgNl0pO1xuXHRcdGNhY2hlLnNldCg3LCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzEsIDIsIDMsIDQsIDddKTtcblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0WzEsIDIsIDMsIDQsIDddLmZvckVhY2goa2V5ID0+IHZhbHVlcy5wdXNoKGNhY2hlLmdldChrZXkpISkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbMSwgMiwgMywgNCwgN10pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBNUlUgQ2FjaGUgZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IE1SVUNhY2hlPG51bWJlciwgbnVtYmVyPig1KTtcblxuXHRcdFsxLCAyLCAzLCA0LCA1XS5mb3JFYWNoKHZhbHVlID0+IGNhY2hlLnNldCh2YWx1ZSwgdmFsdWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRjYWNoZS5nZXQoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzEsIDIsIDQsIDUsIDNdKTtcblx0XHRjYWNoZS5wZWVrKDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFsxLCAyLCA0LCA1LCAzXSk7XG5cdFx0Y29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFsxLCAyLCAzLCA0LCA1XS5mb3JFYWNoKGtleSA9PiB2YWx1ZXMucHVzaChjYWNoZS5nZXQoa2V5KSEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzEsIDIsIDMsIDQsIDVdKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gTVJVIENhY2hlIGxpbWl0IHdpdGggcmF0aW8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgTVJVQ2FjaGU8bnVtYmVyLCBudW1iZXI+KDEwLCAwLjUpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gMTA7IGkrKykge1xuXHRcdFx0Y2FjaGUuc2V0KGksIGkpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgMTApO1xuXHRcdGNhY2hlLnNldCgxMSwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMSwgMiwgMywgNCwgMTFdKTtcblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0Wy4uLmNhY2hlLmtleXMoKV0uZm9yRWFjaChrZXkgPT4gdmFsdWVzLnB1c2goY2FjaGUuZ2V0KGtleSkhKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZXMsIFsxLCAyLCAzLCA0LCAxMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLnZhbHVlcygpXSwgdmFsdWVzKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gdG9KU09OIC8gZnJvbUpTT04nLCAoKSA9PiB7XG5cdFx0bGV0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicpO1xuXHRcdG1hcC5zZXQoJ2NrJywgJ2N2Jyk7XG5cblx0XHRjb25zdCBqc29uID0gbWFwLnRvSlNPTigpO1xuXHRcdG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLmZyb21KU09OKGpzb24pO1xuXG5cdFx0bGV0IGkgPSAwO1xuXHRcdG1hcC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2V5LCAnYWsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAnYXYnKTtcblx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gMSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2V5LCAnYmsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAnYnYnKTtcblx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gMikge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2V5LCAnY2snKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAnY3YnKTtcblx0XHRcdH1cblx0XHRcdGkrKztcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gZGVsZXRlIEhlYWQgYW5kIFRhaWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cblx0XHRtYXAuc2V0KCcxJywgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAxKTtcblx0XHRtYXAuZGVsZXRlKCcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzEnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0ubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gZGVsZXRlIEhlYWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cblx0XHRtYXAuc2V0KCcxJywgMSk7XG5cdFx0bWFwLnNldCgnMicsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMik7XG5cdFx0bWFwLmRlbGV0ZSgnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCcyJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV1bMF0sICcyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIGRlbGV0ZSBUYWlsJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXG5cdFx0bWFwLnNldCgnMScsIDEpO1xuXHRcdG1hcC5zZXQoJzInLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDIpO1xuXHRcdG1hcC5kZWxldGUoJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMScpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldWzBdLCAnMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvdXJjZU1hcCAtIGJhc2ljcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgUmVzb3VyY2VNYXA8YW55PigpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLnBhcnNlKCdzb21lOi8vMScpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5wYXJzZSgnc29tZTovLzInKTtcblx0XHRjb25zdCByZXNvdXJjZTMgPSBVUkkucGFyc2UoJ3NvbWU6Ly8zJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2U0ID0gVVJJLnBhcnNlKCdzb21lOi8vNCcpO1xuXHRcdGNvbnN0IHJlc291cmNlNSA9IFVSSS5wYXJzZSgnc29tZTovLzUnKTtcblx0XHRjb25zdCByZXNvdXJjZTYgPSBVUkkucGFyc2UoJ3NvbWU6Ly82Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXG5cdFx0Y29uc3QgcmVzID0gbWFwLnNldChyZXNvdXJjZTEsIDEpO1xuXHRcdGFzc2VydC5vayhyZXMgPT09IG1hcCk7XG5cdFx0bWFwLnNldChyZXNvdXJjZTIsICcyJyk7XG5cdFx0bWFwLnNldChyZXNvdXJjZTMsIHRydWUpO1xuXG5cdFx0Y29uc3QgdmFsdWVzID0gWy4uLm1hcC52YWx1ZXMoKV07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlc1swXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlc1sxXSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzWzJdLCB0cnVlKTtcblxuXHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRtYXAuZm9yRWFjaCgodmFsdWUsIGtleSwgbWFwT2JqKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIHZhbHVlc1tjb3VudGVyKytdKTtcblx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkoa2V5KSk7XG5cdFx0XHRhc3NlcnQub2sobWFwID09PSBtYXBPYmopO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb2JqID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRtYXAuc2V0KHJlc291cmNlNCwgb2JqKTtcblxuXHRcdGNvbnN0IGRhdGUgPSBEYXRlLm5vdygpO1xuXHRcdG1hcC5zZXQocmVzb3VyY2U1LCBkYXRlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQocmVzb3VyY2UxKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQocmVzb3VyY2UyKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChyZXNvdXJjZTMpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChyZXNvdXJjZTQpLCBvYmopO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHJlc291cmNlNSksIGRhdGUpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldChyZXNvdXJjZTYpKTtcblxuXHRcdG1hcC5kZWxldGUocmVzb3VyY2U2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDUpO1xuXHRcdGFzc2VydC5vayhtYXAuZGVsZXRlKHJlc291cmNlMSkpO1xuXHRcdGFzc2VydC5vayhtYXAuZGVsZXRlKHJlc291cmNlMikpO1xuXHRcdGFzc2VydC5vayhtYXAuZGVsZXRlKHJlc291cmNlMykpO1xuXHRcdGFzc2VydC5vayhtYXAuZGVsZXRlKHJlc291cmNlNCkpO1xuXHRcdGFzc2VydC5vayhtYXAuZGVsZXRlKHJlc291cmNlNSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAwKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQocmVzb3VyY2U1KSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KHJlc291cmNlNCkpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldChyZXNvdXJjZTMpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQocmVzb3VyY2UyKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KHJlc291cmNlMSkpO1xuXG5cdFx0bWFwLnNldChyZXNvdXJjZTEsIDEpO1xuXHRcdG1hcC5zZXQocmVzb3VyY2UyLCAnMicpO1xuXHRcdG1hcC5zZXQocmVzb3VyY2UzLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayhtYXAuaGFzKHJlc291cmNlMSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHJlc291cmNlMSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHJlc291cmNlMiksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQocmVzb3VyY2UzKSwgdHJ1ZSk7XG5cblx0XHRtYXAuY2xlYXIoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KHJlc291cmNlMSkpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldChyZXNvdXJjZTIpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQocmVzb3VyY2UzKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuaGFzKHJlc291cmNlMSkpO1xuXG5cdFx0bWFwLnNldChyZXNvdXJjZTEsIGZhbHNlKTtcblx0XHRtYXAuc2V0KHJlc291cmNlMiwgMCk7XG5cblx0XHRhc3NlcnQub2sobWFwLmhhcyhyZXNvdXJjZTEpKTtcblx0XHRhc3NlcnQub2sobWFwLmhhcyhyZXNvdXJjZTIpKTtcblx0fSk7XG5cblx0dGVzdCgnUmVzb3VyY2VNYXAgLSBmaWxlcyAoZG8gTk9UIGlnbm9yZWNhc2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBSZXNvdXJjZU1hcDxhbnk+KCk7XG5cblx0XHRjb25zdCBmaWxlQSA9IFVSSS5wYXJzZSgnZmlsZTovL3NvbWUvZmlsZWEnKTtcblx0XHRjb25zdCBmaWxlQiA9IFVSSS5wYXJzZSgnc29tZTovL3NvbWUvb3RoZXIvZmlsZWInKTtcblx0XHRjb25zdCBmaWxlQVVwcGVyID0gVVJJLnBhcnNlKCdmaWxlOi8vU09NRS9GSUxFQScpO1xuXG5cdFx0bWFwLnNldChmaWxlQSwgJ3RydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChmaWxlQSksICd0cnVlJyk7XG5cblx0XHRhc3NlcnQub2soIW1hcC5nZXQoZmlsZUFVcHBlcikpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KGZpbGVCKSk7XG5cblx0XHRtYXAuc2V0KGZpbGVBVXBwZXIsICdmYWxzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBVXBwZXIpLCAnZmFsc2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBKSwgJ3RydWUnKTtcblxuXHRcdGNvbnN0IHdpbmRvd3NGaWxlID0gVVJJLmZpbGUoJ2M6XFxcXHRlc3Qgd2l0aCAlMjVcXFxcYyNjb2RlJyk7XG5cdFx0Y29uc3QgdW5jRmlsZSA9IFVSSS5maWxlKCdcXFxcXFxcXHNoXHUwMEU0cmVzXFxcXHBhdGhcXFxcYyNcXFxccGx1Z2luLmpzb24nKTtcblxuXHRcdG1hcC5zZXQod2luZG93c0ZpbGUsICd0cnVlJyk7XG5cdFx0bWFwLnNldCh1bmNGaWxlLCAndHJ1ZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQod2luZG93c0ZpbGUpLCAndHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHVuY0ZpbGUpLCAndHJ1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvdXJjZU1hcCAtIGZpbGVzIChpZ25vcmVjYXNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgUmVzb3VyY2VNYXA8YW55Pih1cmkgPT4gZXh0VXJpSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblxuXHRcdGNvbnN0IGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vc29tZS9maWxlYScpO1xuXHRcdGNvbnN0IGZpbGVCID0gVVJJLnBhcnNlKCdzb21lOi8vc29tZS9vdGhlci9maWxlYicpO1xuXHRcdGNvbnN0IGZpbGVBVXBwZXIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9TT01FL0ZJTEVBJyk7XG5cblx0XHRtYXAuc2V0KGZpbGVBLCAndHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBKSwgJ3RydWUnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBVXBwZXIpLCAndHJ1ZScpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KGZpbGVCKSk7XG5cblx0XHRtYXAuc2V0KGZpbGVBVXBwZXIsICdmYWxzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBVXBwZXIpLCAnZmFsc2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBKSwgJ2ZhbHNlJyk7XG5cblx0XHRjb25zdCB3aW5kb3dzRmlsZSA9IFVSSS5maWxlKCdjOlxcXFx0ZXN0IHdpdGggJTI1XFxcXGMjY29kZScpO1xuXHRcdGNvbnN0IHVuY0ZpbGUgPSBVUkkuZmlsZSgnXFxcXFxcXFxzaFx1MDBFNHJlc1xcXFxwYXRoXFxcXGMjXFxcXHBsdWdpbi5qc29uJyk7XG5cblx0XHRtYXAuc2V0KHdpbmRvd3NGaWxlLCAndHJ1ZScpO1xuXHRcdG1hcC5zZXQodW5jRmlsZSwgJ3RydWUnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHdpbmRvd3NGaWxlKSwgJ3RydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCh1bmNGaWxlKSwgJ3RydWUnKTtcblx0fSk7XG5cblx0dGVzdCgnUmVzb3VyY2VNYXAgLSBmaWxlcyAoaWdub3JlY2FzZSwgQlVUIHByZXNlcnZlY2FzZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IFJlc291cmNlTWFwPG51bWJlcj4odXJpID0+IGV4dFVyaUlnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cblx0XHRjb25zdCBmaWxlQSA9IFVSSS5wYXJzZSgnZmlsZTovL3NvbWUvZmlsZWEnKTtcblx0XHRjb25zdCBmaWxlQVVwcGVyID0gVVJJLnBhcnNlKCdmaWxlOi8vU09NRS9GSUxFQScpO1xuXG5cdFx0bWFwLnNldChmaWxlQSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUEpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChmaWxlQVVwcGVyKSwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC5rZXlzKCkpLm1hcChTdHJpbmcpLCBbZmlsZUFdLm1hcChTdHJpbmcpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwKSwgW1tmaWxlQSwgMV1dKTtcblxuXHRcdG1hcC5zZXQoZmlsZUFVcHBlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUEpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChmaWxlQVVwcGVyKSwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC5rZXlzKCkpLm1hcChTdHJpbmcpLCBbZmlsZUFVcHBlcl0ubWFwKFN0cmluZykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXApLCBbW2ZpbGVBVXBwZXIsIDFdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHNTdHJpY3RFcXVhbElnbm9yZU9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcDEgPSBuZXcgTWFwKCk7XG5cdFx0Y29uc3QgbWFwMiA9IG5ldyBNYXAoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlcihtYXAxLCBtYXAyKSwgdHJ1ZSk7XG5cblx0XHRtYXAxLnNldCgnZm9vJywgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlcihtYXAxLCBtYXAyKSwgZmFsc2UpO1xuXG5cdFx0bWFwMi5zZXQoJ2ZvbycsICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXIobWFwMSwgbWFwMiksIHRydWUpO1xuXG5cdFx0bWFwMi5zZXQoJ2JhcicsICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXIobWFwMSwgbWFwMiksIGZhbHNlKTtcblxuXHRcdG1hcDEuc2V0KCdiYXInLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcHNTdHJpY3RFcXVhbElnbm9yZU9yZGVyKG1hcDEsIG1hcDIpLCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0JpZGlyZWN0aW9uYWxNYXAnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3VsZCBzZXQgYW5kIGdldCB2YWx1ZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBCaWRpcmVjdGlvbmFsTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdG1hcC5zZXQoJ29uZScsIDEpO1xuXHRcdG1hcC5zZXQoJ3R3bycsIDIpO1xuXHRcdG1hcC5zZXQoJ3RocmVlJywgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnb25lJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCd0d28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ3RocmVlJyksIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZ2V0IGtleXMgYnkgdmFsdWUgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBCaWRpcmVjdGlvbmFsTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdG1hcC5zZXQoJ29uZScsIDEpO1xuXHRcdG1hcC5zZXQoJ3R3bycsIDIpO1xuXHRcdG1hcC5zZXQoJ3RocmVlJywgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgxKSwgJ29uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDIpLCAndHdvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoMyksICd0aHJlZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZGVsZXRlIHZhbHVlcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgndHdvJywgMik7XG5cdFx0bWFwLnNldCgndGhyZWUnLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlKCdvbmUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ29uZScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDEpLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJ3R3bycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgndHdvJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoMiksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgndGhyZWUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ3RocmVlJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoMyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbm9uLWV4aXN0ZW50IGtleXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBCaWRpcmVjdGlvbmFsTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdG1hcC5zZXQoJ29uZScsIDEpO1xuXHRcdG1hcC5zZXQoJ3R3bycsIDIpO1xuXHRcdG1hcC5zZXQoJ3RocmVlJywgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnZm91cicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDQpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlKCdmb3VyJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBsZWF2ZSBhIHN0YWxlIHJldmVyc2UgZW50cnkgd2hlbiBhIGtleSB2YWx1ZSBpcyB1cGRhdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBCaWRpcmVjdGlvbmFsTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdG1hcC5zZXQoJ29uZScsIDEpO1xuXHRcdG1hcC5zZXQoJ29uZScsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ29uZScpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgyKSwgJ29uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDEpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGZvckVhY2ggY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBCaWRpcmVjdGlvbmFsTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdG1hcC5zZXQoJ29uZScsIDEpO1xuXHRcdG1hcC5zZXQoJ3R3bycsIDIpO1xuXHRcdG1hcC5zZXQoJ3RocmVlJywgMyk7XG5cblx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcblx0XHRtYXAuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHR2YWx1ZXMucHVzaCh2YWx1ZSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGtleXMsIFsnb25lJywgJ3R3bycsICd0aHJlZSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzEsIDIsIDNdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjbGVhciBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgndHdvJywgMik7XG5cdFx0bWFwLnNldCgndGhyZWUnLCAzKTtcblxuXHRcdG1hcC5jbGVhcigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ29uZScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCd0d28nKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgndGhyZWUnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgxKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgyKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgzKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1NldE1hcCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhZGQgYW5kIGdldCcsICgpID0+IHtcblx0XHRjb25zdCBzZXRNYXAgPSBuZXcgU2V0TWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHNldE1hcC5hZGQoJ2EnLCAxKTtcblx0XHRzZXRNYXAuYWRkKCdhJywgMik7XG5cdFx0c2V0TWFwLmFkZCgnYicsIDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnNldE1hcC5nZXQoJ2EnKV0sIFsxLCAyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0TWFwLmdldCgnYicpXSwgWzNdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldE1hcCA9IG5ldyBTZXRNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0c2V0TWFwLmFkZCgnYScsIDEpO1xuXHRcdHNldE1hcC5hZGQoJ2EnLCAyKTtcblx0XHRzZXRNYXAuYWRkKCdiJywgMyk7XG5cdFx0c2V0TWFwLmRlbGV0ZSgnYScsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnNldE1hcC5nZXQoJ2EnKV0sIFsyXSk7XG5cdFx0c2V0TWFwLmRlbGV0ZSgnYScsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnNldE1hcC5nZXQoJ2EnKV0sIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yRWFjaCcsICgpID0+IHtcblx0XHRjb25zdCBzZXRNYXAgPSBuZXcgU2V0TWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHNldE1hcC5hZGQoJ2EnLCAxKTtcblx0XHRzZXRNYXAuYWRkKCdhJywgMik7XG5cdFx0c2V0TWFwLmFkZCgnYicsIDMpO1xuXHRcdGxldCBzdW0gPSAwO1xuXHRcdHNldE1hcC5mb3JFYWNoKCdhJywgdmFsdWUgPT4gc3VtICs9IHZhbHVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0IGVtcHR5IHNldCcsICgpID0+IHtcblx0XHRjb25zdCBzZXRNYXAgPSBuZXcgU2V0TWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnNldE1hcC5nZXQoJ2EnKV0sIFtdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ05LZXlNYXAnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NldCBhbmQgZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBOS2V5TWFwPG51bWJlciwgW3N0cmluZywgc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+KCk7XG5cdFx0bWFwLnNldCgxLCAnYScsICdiJywgJ2MnLCAnZCcpO1xuXHRcdG1hcC5zZXQoMiwgJ2EnLCAnYycsICdjJywgJ2QnKTtcblx0XHRtYXAuc2V0KDMsICdiJywgJ2UnLCAnZicsICdnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2EnLCAnYicsICdjJywgJ2QnKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2EnLCAnYycsICdjJywgJ2QnKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2InLCAnZScsICdmJywgJ2cnKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2EnLCAnYicsICdjJywgJ2EnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4oKTtcblx0XHRtYXAuc2V0KDEsICdhJywgJ2InLCAnYycsICdkJyk7XG5cdFx0bWFwLnNldCgyLCAnYScsICdjJywgJ2MnLCAnZCcpO1xuXHRcdG1hcC5zZXQoMywgJ2InLCAnZScsICdmJywgJ2cnKTtcblx0XHRtYXAuY2xlYXIoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnYScsICdiJywgJ2MnLCAnZCcpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCdhJywgJ2MnLCAnYycsICdkJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2InLCAnZScsICdmJywgJ2cnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBOS2V5TWFwPG51bWJlciwgW3N0cmluZywgc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+KCk7XG5cdFx0bWFwLnNldCgxLCAnYScsICdiJywgJ2MnLCAnZCcpO1xuXHRcdG1hcC5zZXQoMiwgJ2EnLCAnYycsICdjJywgJ2QnKTtcblx0XHRtYXAuc2V0KDMsICdiJywgJ2UnLCAnZicsICdnJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC52YWx1ZXMoKSksIFsxLCAyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFsbCcsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTktleU1hcDxudW1iZXIsIFtzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4oKTtcblx0XHRtYXAuc2V0KDEsICdhJywgJ2InLCAnYycpO1xuXHRcdG1hcC5zZXQoMiwgJ2EnLCAnYicsICdkJyk7XG5cdFx0bWFwLnNldCgzLCAnYScsICdlJywgJ2YnKTtcblx0XHRtYXAuc2V0KDQsICdnJywgJ2gnLCAnaScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXAuZ2V0QWxsKCdhJywgJ2InKSksIFsxLCAyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC5nZXRBbGwoJ2EnKSksIFsxLCAyLCAzXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC5nZXRBbGwoJ21pc3NpbmcnKSksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBOS2V5TWFwPG51bWJlciwgW3N0cmluZywgc3RyaW5nLCBzdHJpbmddPigpO1xuXHRcdG1hcC5zZXQoMSwgJ2EnLCAnYicsICdjJyk7XG5cdFx0bWFwLnNldCgyLCAnYScsICdiJywgJ2QnKTtcblx0XHRtYXAuc2V0KDMsICd4JywgJ3knLCAneicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlKCdhJywgJ2InLCAnYycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgnYScsICdiJywgJ2MnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXAudmFsdWVzKCkpLCBbMiwgM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBbGwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+KCk7XG5cdFx0bWFwLnNldCgxLCAnYScsICdiJywgJ2MnKTtcblx0XHRtYXAuc2V0KDIsICdhJywgJ2InLCAnZCcpO1xuXHRcdG1hcC5zZXQoMywgJ2EnLCAnZScsICdmJyk7XG5cdFx0bWFwLnNldCg0LCAnZycsICdoJywgJ2knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZUFsbCgnYScsICdiJyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXAudmFsdWVzKCkpLCBbMywgNF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlQWxsKCdtaXNzaW5nJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZUFsbCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLnZhbHVlcygpKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBbGwgY2xlYW5zIGVtcHR5IHBhcmVudCBtYXBzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBOS2V5TWFwPG51bWJlciwgW3N0cmluZywgc3RyaW5nLCBzdHJpbmddPigpO1xuXHRcdG1hcC5zZXQoMSwgJ2EnLCAnYicsICdjJyk7XG5cdFx0bWFwLnNldCgyLCAneCcsICd5JywgJ3onKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZUFsbCgnYScsICdiJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlQWxsKCdhJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLnZhbHVlcygpKSwgWzJdKTtcblx0fSk7XG5cblx0dGVzdCgndG9TdHJpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+KCk7XG5cdFx0bWFwLnNldCgxLCAnZicsICdvJywgJ28nKTtcblx0XHRtYXAuc2V0KDIsICdiJywgJ2EnLCAncicpO1xuXHRcdG1hcC5zZXQoMywgJ2InLCAnYScsICd6Jyk7XG5cdFx0bWFwLnNldCgzLCAnYicsICdvJywgJ28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnRvU3RyaW5nKCksIFtcblx0XHRcdCdmOiAnLFxuXHRcdFx0JyAgbzogJyxcblx0XHRcdCcgICAgbzogMScsXG5cdFx0XHQnYjogJyxcblx0XHRcdCcgIGE6ICcsXG5cdFx0XHQnICAgIHI6IDInLFxuXHRcdFx0JyAgICB6OiAzJyxcblx0XHRcdCcgIG86ICcsXG5cdFx0XHQnICAgIG86IDMnLFxuXHRcdFx0JycsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0IsV0FBVyxVQUFVLDRCQUE0QixVQUFVLFNBQVMsYUFBYSxRQUFRLGFBQWE7QUFDakksU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sT0FBTyxNQUFNO0FBRWxCLDBDQUF3QztBQUV4QyxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFVBQU0sTUFBTSxJQUFJLFVBQTBCO0FBQzFDLFFBQUksSUFBSSxNQUFNLElBQUk7QUFDbEIsUUFBSSxJQUFJLE1BQU0sSUFBSTtBQUNsQixXQUFPLGdCQUFnQixDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDO0FBQ3BELFdBQU8sZ0JBQWdCLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUM7QUFDdEQsV0FBTyxZQUFZLElBQUksT0FBTyxJQUFJO0FBQ2xDLFdBQU8sWUFBWSxJQUFJLE1BQU0sSUFBSTtBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLFVBQU0sTUFBTSxJQUFJLFVBQTBCO0FBQzFDLFFBQUksSUFBSSxNQUFNLElB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
