import assert from "assert";
import * as arrays from "../../common/arrays.js";
import * as arraysFind from "../../common/arraysFind.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Arrays", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("removeFastWithoutKeepingOrder", () => {
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    arrays.removeFastWithoutKeepingOrder(array, 1);
    assert.deepStrictEqual(array, [1, 69, 5, 7, 55, 59, 60, 61, 64]);
    arrays.removeFastWithoutKeepingOrder(array, 0);
    assert.deepStrictEqual(array, [64, 69, 5, 7, 55, 59, 60, 61]);
    arrays.removeFastWithoutKeepingOrder(array, 7);
    assert.deepStrictEqual(array, [64, 69, 5, 7, 55, 59, 60]);
  });
  test("findFirst", () => {
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    let idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 0);
    assert.strictEqual(array[idx], 1);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e > 1);
    assert.strictEqual(array[idx], 4);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 8);
    assert.strictEqual(array[idx], 55);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 61);
    assert.strictEqual(array[idx], 61);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 69);
    assert.strictEqual(array[idx], 69);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 70);
    assert.strictEqual(idx, array.length);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen([], (e) => e >= 0);
    assert.strictEqual(array[idx], 1);
  });
  test("quickSelect", () => {
    function assertMedian(expexted, data, nth = Math.floor(data.length / 2)) {
      const compare = (a, b) => a - b;
      const actual1 = arrays.quickSelect(nth, data, compare);
      assert.strictEqual(actual1, expexted);
      const actual2 = data.slice().sort(compare)[nth];
      assert.strictEqual(actual2, expexted);
    }
    assertMedian(5, [9, 1, 0, 2, 3, 4, 6, 8, 7, 10, 5]);
    assertMedian(8, [9, 1, 0, 2, 3, 4, 6, 8, 7, 10, 5], 8);
    assertMedian(8, [13, 4, 8]);
    assertMedian(4, [13, 4, 8, 4, 4]);
    assertMedian(13, [13, 4, 8], 2);
  });
  test("sortedDiff", () => {
    function compare(a, b) {
      return a - b;
    }
    let d = arrays.sortedDiff([1, 2, 4], [], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 3, toInsert: [] }
    ]);
    d = arrays.sortedDiff([], [1, 2, 4], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 0, toInsert: [1, 2, 4] }
    ]);
    d = arrays.sortedDiff([1, 2, 4], [1, 2, 4], compare);
    assert.deepStrictEqual(d, []);
    d = arrays.sortedDiff([1, 2, 4], [2, 3, 4, 5], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 1, toInsert: [] },
      { start: 2, deleteCount: 0, toInsert: [3] },
      { start: 3, deleteCount: 0, toInsert: [5] }
    ]);
    d = arrays.sortedDiff([2, 3, 4, 5], [1, 2, 4], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 0, toInsert: [1] },
      { start: 1, deleteCount: 1, toInsert: [] },
      { start: 3, deleteCount: 1, toInsert: [] }
    ]);
    d = arrays.sortedDiff([1, 3, 5, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 2, toInsert: [] },
      { start: 3, deleteCount: 1, toInsert: [9, 11] }
    ]);
    d = arrays.sortedDiff([1, 3, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 3, toInsert: [5, 9, 11] }
    ]);
  });
  test("delta sorted arrays", function() {
    function compare(a, b) {
      return a - b;
    }
    let d = arrays.delta([1, 2, 4], [], compare);
    assert.deepStrictEqual(d.removed, [1, 2, 4]);
    assert.deepStrictEqual(d.added, []);
    d = arrays.delta([], [1, 2, 4], compare);
    assert.deepStrictEqual(d.removed, []);
    assert.deepStrictEqual(d.added, [1, 2, 4]);
    d = arrays.delta([1, 2, 4], [1, 2, 4], compare);
    assert.deepStrictEqual(d.removed, []);
    assert.deepStrictEqual(d.added, []);
    d = arrays.delta([1, 2, 4], [2, 3, 4, 5], compare);
    assert.deepStrictEqual(d.removed, [1]);
    assert.deepStrictEqual(d.added, [3, 5]);
    d = arrays.delta([2, 3, 4, 5], [1, 2, 4], compare);
    assert.deepStrictEqual(d.removed, [3, 5]);
    assert.deepStrictEqual(d.added, [1]);
    d = arrays.delta([1, 3, 5, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d.removed, [1, 3, 7]);
    assert.deepStrictEqual(d.added, [9, 11]);
    d = arrays.delta([1, 3, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d.removed, [1, 3, 7]);
    assert.deepStrictEqual(d.added, [5, 9, 11]);
  });
  test("binarySearch", () => {
    function compare(a, b) {
      return a - b;
    }
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    assert.strictEqual(arrays.binarySearch(array, 1, compare), 0);
    assert.strictEqual(arrays.binarySearch(array, 5, compare), 2);
    assert.strictEqual(arrays.binarySearch(array, 0, compare), ~0);
    assert.strictEqual(arrays.binarySearch(array, 6, compare), ~3);
    assert.strictEqual(arrays.binarySearch(array, 70, compare), ~10);
  });
  test("binarySearch2", () => {
    function compareTo(key) {
      return (index) => {
        return array[index] - key;
      };
    }
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    assert.strictEqual(arrays.binarySearch2(10, compareTo(1)), 0);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(5)), 2);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(0)), ~0);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(6)), ~3);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(70)), ~10);
    assert.strictEqual(arrays.binarySearch2(2, compareTo(5)), ~2);
  });
  test("distinct", () => {
    function compare(a) {
      return a;
    }
    assert.deepStrictEqual(arrays.distinct(["32", "4", "5"], compare), ["32", "4", "5"]);
    assert.deepStrictEqual(arrays.distinct(["32", "4", "5", "4"], compare), ["32", "4", "5"]);
    assert.deepStrictEqual(arrays.distinct(["32", "constructor", "5", "1"], compare), ["32", "constructor", "5", "1"]);
    assert.deepStrictEqual(arrays.distinct(["32", "constructor", "proto", "proto", "constructor"], compare), ["32", "constructor", "proto"]);
    assert.deepStrictEqual(arrays.distinct(["32", "4", "5", "32", "4", "5", "32", "4", "5", "5"], compare), ["32", "4", "5"]);
  });
  test("top", () => {
    const cmp = (a, b) => {
      assert.strictEqual(typeof a, "number", "typeof a");
      assert.strictEqual(typeof b, "number", "typeof b");
      return a - b;
    };
    assert.deepStrictEqual(arrays.top([], cmp, 1), []);
    assert.deepStrictEqual(arrays.top([1], cmp, 0), []);
    assert.deepStrictEqual(arrays.top([1, 2], cmp, 1), [1]);
    assert.deepStrictEqual(arrays.top([2, 1], cmp, 1), [1]);
    assert.deepStrictEqual(arrays.top([1, 3, 2], cmp, 2), [1, 2]);
    assert.deepStrictEqual(arrays.top([3, 2, 1], cmp, 3), [1, 2, 3]);
    assert.deepStrictEqual(arrays.top([4, 6, 2, 7, 8, 3, 5, 1], cmp, 3), [1, 2, 3]);
  });
  test("topAsync", async () => {
    const cmp = (a, b) => {
      assert.strictEqual(typeof a, "number", "typeof a");
      assert.strictEqual(typeof b, "number", "typeof b");
      return a - b;
    };
    await testTopAsync(cmp, 1);
    return testTopAsync(cmp, 2);
  });
  async function testTopAsync(cmp, m) {
    {
      const result = await arrays.topAsync([], cmp, 1, m);
      assert.deepStrictEqual(result, []);
    }
    {
      const result = await arrays.topAsync([1], cmp, 0, m);
      assert.deepStrictEqual(result, []);
    }
    {
      const result = await arrays.topAsync([1, 2], cmp, 1, m);
      assert.deepStrictEqual(result, [1]);
    }
    {
      const result = await arrays.topAsync([2, 1], cmp, 1, m);
      assert.deepStrictEqual(result, [1]);
    }
    {
      const result = await arrays.topAsync([1, 3, 2], cmp, 2, m);
      assert.deepStrictEqual(result, [1, 2]);
    }
    {
      const result = await arrays.topAsync([3, 2, 1], cmp, 3, m);
      assert.deepStrictEqual(result, [1, 2, 3]);
    }
    {
      const result = await arrays.topAsync([4, 6, 2, 7, 8, 3, 5, 1], cmp, 3, m);
      assert.deepStrictEqual(result, [1, 2, 3]);
    }
  }
  test("coalesce", () => {
    const a = arrays.coalesce([null, 1, null, 2, 3]);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    arrays.coalesce([null, 1, null, void 0, void 0, 2, 3]);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    let b = [];
    b[10] = 1;
    b[20] = 2;
    b[30] = 3;
    b = arrays.coalesce(b);
    assert.strictEqual(b.length, 3);
    assert.strictEqual(b[0], 1);
    assert.strictEqual(b[1], 2);
    assert.strictEqual(b[2], 3);
    let sparse = [];
    sparse[0] = 1;
    sparse[1] = 1;
    sparse[17] = 1;
    sparse[1e3] = 1;
    sparse[1001] = 1;
    assert.strictEqual(sparse.length, 1002);
    sparse = arrays.coalesce(sparse);
    assert.strictEqual(sparse.length, 5);
  });
  test("coalesce - inplace", function() {
    let a = [null, 1, null, 2, 3];
    arrays.coalesceInPlace(a);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    a = [null, 1, null, void 0, void 0, 2, 3];
    arrays.coalesceInPlace(a);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    const b = [];
    b[10] = 1;
    b[20] = 2;
    b[30] = 3;
    arrays.coalesceInPlace(b);
    assert.strictEqual(b.length, 3);
    assert.strictEqual(b[0], 1);
    assert.strictEqual(b[1], 2);
    assert.strictEqual(b[2], 3);
    const sparse = [];
    sparse[0] = 1;
    sparse[1] = 1;
    sparse[17] = 1;
    sparse[1e3] = 1;
    sparse[1001] = 1;
    assert.strictEqual(sparse.length, 1002);
    arrays.coalesceInPlace(sparse);
    assert.strictEqual(sparse.length, 5);
  });
  test("insert, remove", function() {
    const array = [];
    const remove = arrays.insert(array, "foo");
    assert.strictEqual(array[0], "foo");
    remove();
    assert.strictEqual(array.length, 0);
  });
  test("splice", function() {
    let array = [1, 2, 3, 4, 5];
    arrays.splice(array, -6, 3, [6, 7]);
    assert.strictEqual(array.length, 4);
    assert.strictEqual(array[0], 6);
    assert.strictEqual(array[1], 7);
    assert.strictEqual(array[2], 4);
    assert.strictEqual(array[3], 5);
    array = [1, 2, 3, 4, 5];
    arrays.splice(array, -3, 3, [6, 7]);
    assert.strictEqual(array.length, 4);
    assert.strictEqual(array[0], 1);
    assert.strictEqual(array[1], 2);
    assert.strictEqual(array[2], 6);
    assert.strictEqual(array[3], 7);
    array = [1, 2, 3, 4, 5];
    arrays.splice(array, 3, 3, [6, 7]);
    assert.strictEqual(array.length, 5);
    assert.strictEqual(array[0], 1);
    assert.strictEqual(array[1], 2);
    assert.strictEqual(array[2], 3);
    assert.strictEqual(array[3], 6);
    assert.strictEqual(array[4], 7);
    array = [1, 2, 3, 4, 5];
    arrays.splice(array, 6, 3, [6, 7]);
    assert.strictEqual(array.length, 7);
    assert.strictEqual(array[0], 1);
    assert.strictEqual(array[1], 2);
    assert.strictEqual(array[2], 3);
    assert.strictEqual(array[3], 4);
    assert.strictEqual(array[4], 5);
    assert.strictEqual(array[5], 6);
    assert.strictEqual(array[6], 7);
  });
  test("findMaxBy", () => {
    const array = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 2 }, { v: 2 }, { v: 5 }];
    assert.strictEqual(
      array.indexOf(arraysFind.findFirstMax(array, arrays.compareBy((v) => v.v, arrays.numberComparator))),
      1
    );
  });
  test("findLastMaxBy", () => {
    const array = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 2 }, { v: 2 }, { v: 5 }];
    assert.strictEqual(
      array.indexOf(arraysFind.findLastMax(array, arrays.compareBy((v) => v.v, arrays.numberComparator))),
      5
    );
  });
  test("findMinBy", () => {
    const array = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 2 }, { v: 2 }, { v: 5 }];
    assert.strictEqual(
      array.indexOf(arraysFind.findFirstMin(array, arrays.compareBy((v) => v.v, arrays.numberComparator))),
      2
    );
  });
  suite("ArrayQueue", () => {
    suite("takeWhile/takeFromEndWhile", () => {
      test("TakeWhile 1", () => {
        const queue1 = new arrays.ArrayQueue([9, 8, 1, 7, 6]);
        assert.deepStrictEqual(queue1.takeWhile((x) => x > 5), [9, 8]);
        assert.deepStrictEqual(queue1.takeWhile((x) => x < 7), [1]);
        assert.deepStrictEqual(queue1.takeWhile((x) => true), [7, 6]);
      });
      test("TakeFromEndWhile 1", () => {
        const queue1 = new arrays.ArrayQueue([9, 8, 1, 7, 6]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => x > 5), [7, 6]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => x < 2), [1]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => true), [9, 8]);
      });
      test("takeWhile and takeFromEndWhile mixed", () => {
        const queue1 = new arrays.ArrayQueue([1, 2, 3, 4, 5]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => x > 3), [4, 5]);
        assert.deepStrictEqual(queue1.takeWhile((x) => x > 0), [1, 2, 3]);
        const queue2 = new arrays.ArrayQueue([1, 2, 3, 4, 5]);
        assert.deepStrictEqual(queue2.takeWhile((x) => x < 3), [1, 2]);
        assert.deepStrictEqual(queue2.takeFromEndWhile((x) => x > 0), [3, 4, 5]);
      });
    });
    suite("takeWhile/takeFromEndWhile monotonous", () => {
      function testMonotonous(array3, predicate) {
        function normalize(arr) {
          if (arr.length === 0) {
            return null;
          }
          return arr;
        }
        const negatedPredicate = (a) => !predicate(a);
        {
          const queue1 = new arrays.ArrayQueue(array3);
          assert.deepStrictEqual(queue1.takeWhile(predicate), normalize(array3.filter(predicate)));
          assert.deepStrictEqual(queue1.length, array3.length - array3.filter(predicate).length);
          assert.deepStrictEqual(queue1.takeWhile(() => true), normalize(array3.filter(negatedPredicate)));
        }
        {
          const queue3 = new arrays.ArrayQueue(array3);
          assert.deepStrictEqual(queue3.takeFromEndWhile(negatedPredicate), normalize(array3.filter(negatedPredicate)));
          assert.deepStrictEqual(queue3.length, array3.length - array3.filter(negatedPredicate).length);
          assert.deepStrictEqual(queue3.takeFromEndWhile(() => true), normalize(array3.filter(predicate)));
        }
      }
      const array = [1, 1, 1, 2, 5, 5, 7, 8, 8];
      test("TakeWhile 1", () => testMonotonous(array, (value) => value <= 1));
      test("TakeWhile 2", () => testMonotonous(array, (value) => value < 5));
      test("TakeWhile 3", () => testMonotonous(array, (value) => value <= 5));
      test("TakeWhile 4", () => testMonotonous(array, (value) => true));
      test("TakeWhile 5", () => testMonotonous(array, (value) => false));
      const array2 = [1, 1, 1, 2, 5, 5, 7, 8, 8, 9, 9, 9, 9, 10, 10];
      test("TakeWhile 6", () => testMonotonous(array2, (value) => value < 10));
      test("TakeWhile 7", () => testMonotonous(array2, (value) => value < 7));
      test("TakeWhile 8", () => testMonotonous(array2, (value) => value < 5));
      test("TakeWhile Empty", () => testMonotonous([], (value) => value <= 5));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGFycmF5cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCAqIGFzIGFycmF5c0ZpbmQgZnJvbSAnLi4vLi4vY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdBcnJheXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVtb3ZlRmFzdFdpdGhvdXRLZWVwaW5nT3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJyYXkgPSBbMSwgNCwgNSwgNywgNTUsIDU5LCA2MCwgNjEsIDY0LCA2OV07XG5cdFx0YXJyYXlzLnJlbW92ZUZhc3RXaXRob3V0S2VlcGluZ09yZGVyKGFycmF5LCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5LCBbMSwgNjksIDUsIDcsIDU1LCA1OSwgNjAsIDYxLCA2NF0pO1xuXG5cdFx0YXJyYXlzLnJlbW92ZUZhc3RXaXRob3V0S2VlcGluZ09yZGVyKGFycmF5LCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5LCBbNjQsIDY5LCA1LCA3LCA1NSwgNTksIDYwLCA2MV0pO1xuXG5cdFx0YXJyYXlzLnJlbW92ZUZhc3RXaXRob3V0S2VlcGluZ09yZGVyKGFycmF5LCA3KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5LCBbNjQsIDY5LCA1LCA3LCA1NSwgNTksIDYwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRGaXJzdCcsICgpID0+IHtcblx0XHRjb25zdCBhcnJheSA9IFsxLCA0LCA1LCA3LCA1NSwgNTksIDYwLCA2MSwgNjQsIDY5XTtcblxuXHRcdGxldCBpZHggPSBhcnJheXNGaW5kLmZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihhcnJheSwgZSA9PiBlID49IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVtpZHhdLCAxKTtcblxuXHRcdGlkeCA9IGFycmF5c0ZpbmQuZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKGFycmF5LCBlID0+IGUgPiAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbaWR4XSwgNCk7XG5cblx0XHRpZHggPSBhcnJheXNGaW5kLmZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihhcnJheSwgZSA9PiBlID49IDgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVtpZHhdLCA1NSk7XG5cblx0XHRpZHggPSBhcnJheXNGaW5kLmZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihhcnJheSwgZSA9PiBlID49IDYxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbaWR4XSwgNjEpO1xuXG5cdFx0aWR4ID0gYXJyYXlzRmluZC5maW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oYXJyYXksIGUgPT4gZSA+PSA2OSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5W2lkeF0sIDY5KTtcblxuXHRcdGlkeCA9IGFycmF5c0ZpbmQuZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKGFycmF5LCBlID0+IGUgPj0gNzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZHgsIGFycmF5Lmxlbmd0aCk7XG5cblx0XHRpZHggPSBhcnJheXNGaW5kLmZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihbXSwgZSA9PiBlID49IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVtpZHhdLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncXVpY2tTZWxlY3QnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRNZWRpYW4oZXhwZXh0ZWQ6IG51bWJlciwgZGF0YTogbnVtYmVyW10sIG50aDogbnVtYmVyID0gTWF0aC5mbG9vcihkYXRhLmxlbmd0aCAvIDIpKSB7XG5cdFx0XHRjb25zdCBjb21wYXJlID0gKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhIC0gYjtcblx0XHRcdGNvbnN0IGFjdHVhbDEgPSBhcnJheXMucXVpY2tTZWxlY3QobnRoLCBkYXRhLCBjb21wYXJlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLCBleHBleHRlZCk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbDIgPSBkYXRhLnNsaWNlKCkuc29ydChjb21wYXJlKVtudGhdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIsIGV4cGV4dGVkKTtcblx0XHR9XG5cblx0XHRhc3NlcnRNZWRpYW4oNSwgWzksIDEsIDAsIDIsIDMsIDQsIDYsIDgsIDcsIDEwLCA1XSk7XG5cdFx0YXNzZXJ0TWVkaWFuKDgsIFs5LCAxLCAwLCAyLCAzLCA0LCA2LCA4LCA3LCAxMCwgNV0sIDgpO1xuXHRcdGFzc2VydE1lZGlhbig4LCBbMTMsIDQsIDhdKTtcblx0XHRhc3NlcnRNZWRpYW4oNCwgWzEzLCA0LCA4LCA0LCA0XSk7XG5cdFx0YXNzZXJ0TWVkaWFuKDEzLCBbMTMsIDQsIDhdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydGVkRGlmZicsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjb21wYXJlKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiBhIC0gYjtcblx0XHR9XG5cblx0XHRsZXQgZCA9IGFycmF5cy5zb3J0ZWREaWZmKFsxLCAyLCA0XSwgW10sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZCwgW1xuXHRcdFx0eyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDMsIHRvSW5zZXJ0OiBbXSB9XG5cdFx0XSk7XG5cblx0XHRkID0gYXJyYXlzLnNvcnRlZERpZmYoW10sIFsxLCAyLCA0XSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBkZWxldGVDb3VudDogMCwgdG9JbnNlcnQ6IFsxLCAyLCA0XSB9XG5cdFx0XSk7XG5cblx0XHRkID0gYXJyYXlzLnNvcnRlZERpZmYoWzEsIDIsIDRdLCBbMSwgMiwgNF0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZCwgW10pO1xuXG5cdFx0ZCA9IGFycmF5cy5zb3J0ZWREaWZmKFsxLCAyLCA0XSwgWzIsIDMsIDQsIDVdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAxLCB0b0luc2VydDogW10gfSxcblx0XHRcdHsgc3RhcnQ6IDIsIGRlbGV0ZUNvdW50OiAwLCB0b0luc2VydDogWzNdIH0sXG5cdFx0XHR7IHN0YXJ0OiAzLCBkZWxldGVDb3VudDogMCwgdG9JbnNlcnQ6IFs1XSB9LFxuXHRcdF0pO1xuXG5cdFx0ZCA9IGFycmF5cy5zb3J0ZWREaWZmKFsyLCAzLCA0LCA1XSwgWzEsIDIsIDRdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAwLCB0b0luc2VydDogWzFdIH0sXG5cdFx0XHR7IHN0YXJ0OiAxLCBkZWxldGVDb3VudDogMSwgdG9JbnNlcnQ6IFtdIH0sXG5cdFx0XHR7IHN0YXJ0OiAzLCBkZWxldGVDb3VudDogMSwgdG9JbnNlcnQ6IFtdIH0sXG5cdFx0XSk7XG5cblx0XHRkID0gYXJyYXlzLnNvcnRlZERpZmYoWzEsIDMsIDUsIDddLCBbNSwgOSwgMTFdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAyLCB0b0luc2VydDogW10gfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGRlbGV0ZUNvdW50OiAxLCB0b0luc2VydDogWzksIDExXSB9XG5cdFx0XSk7XG5cblx0XHRkID0gYXJyYXlzLnNvcnRlZERpZmYoWzEsIDMsIDddLCBbNSwgOSwgMTFdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAzLCB0b0luc2VydDogWzUsIDksIDExXSB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbHRhIHNvcnRlZCBhcnJheXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZnVuY3Rpb24gY29tcGFyZShhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRyZXR1cm4gYSAtIGI7XG5cdFx0fVxuXG5cdFx0bGV0IGQgPSBhcnJheXMuZGVsdGEoWzEsIDIsIDRdLCBbXSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLnJlbW92ZWQsIFsxLCAyLCA0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLmFkZGVkLCBbXSk7XG5cblx0XHRkID0gYXJyYXlzLmRlbHRhKFtdLCBbMSwgMiwgNF0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLmFkZGVkLCBbMSwgMiwgNF0pO1xuXG5cdFx0ZCA9IGFycmF5cy5kZWx0YShbMSwgMiwgNF0sIFsxLCAyLCA0XSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQuYWRkZWQsIFtdKTtcblxuXHRcdGQgPSBhcnJheXMuZGVsdGEoWzEsIDIsIDRdLCBbMiwgMywgNCwgNV0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5yZW1vdmVkLCBbMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5hZGRlZCwgWzMsIDVdKTtcblxuXHRcdGQgPSBhcnJheXMuZGVsdGEoWzIsIDMsIDQsIDVdLCBbMSwgMiwgNF0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5yZW1vdmVkLCBbMywgNV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5hZGRlZCwgWzFdKTtcblxuXHRcdGQgPSBhcnJheXMuZGVsdGEoWzEsIDMsIDUsIDddLCBbNSwgOSwgMTFdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQucmVtb3ZlZCwgWzEsIDMsIDddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQuYWRkZWQsIFs5LCAxMV0pO1xuXG5cdFx0ZCA9IGFycmF5cy5kZWx0YShbMSwgMywgN10sIFs1LCA5LCAxMV0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5yZW1vdmVkLCBbMSwgMywgN10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5hZGRlZCwgWzUsIDksIDExXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JpbmFyeVNlYXJjaCcsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjb21wYXJlKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiBhIC0gYjtcblx0XHR9XG5cdFx0Y29uc3QgYXJyYXkgPSBbMSwgNCwgNSwgNywgNTUsIDU5LCA2MCwgNjEsIDY0LCA2OV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlzLmJpbmFyeVNlYXJjaChhcnJheSwgMSwgY29tcGFyZSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoKGFycmF5LCA1LCBjb21wYXJlKSwgMik7XG5cblx0XHQvLyBpbnNlcnRpb24gcG9pbnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlzLmJpbmFyeVNlYXJjaChhcnJheSwgMCwgY29tcGFyZSksIH4wKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlzLmJpbmFyeVNlYXJjaChhcnJheSwgNiwgY29tcGFyZSksIH4zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlzLmJpbmFyeVNlYXJjaChhcnJheSwgNzAsIGNvbXBhcmUpLCB+MTApO1xuXHR9KTtcblxuXHR0ZXN0KCdiaW5hcnlTZWFyY2gyJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNvbXBhcmVUbyhrZXk6IG51bWJlcikge1xuXHRcdFx0cmV0dXJuIChpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHJldHVybiBhcnJheVtpbmRleF0gLSBrZXk7XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBhcnJheSA9IFsxLCA0LCA1LCA3LCA1NSwgNTksIDYwLCA2MSwgNjQsIDY5XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoMigxMCwgY29tcGFyZVRvKDEpKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2gyKDEwLCBjb21wYXJlVG8oNSkpLCAyKTtcblxuXHRcdC8vIGluc2VydGlvbiBwb2ludFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoMigxMCwgY29tcGFyZVRvKDApKSwgfjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoMigxMCwgY29tcGFyZVRvKDYpKSwgfjMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoMigxMCwgY29tcGFyZVRvKDcwKSksIH4xMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2gyKDIsIGNvbXBhcmVUbyg1KSksIH4yKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzdGluY3QnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY29tcGFyZShhOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIGE7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMuZGlzdGluY3QoWyczMicsICc0JywgJzUnXSwgY29tcGFyZSksIFsnMzInLCAnNCcsICc1J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLmRpc3RpbmN0KFsnMzInLCAnNCcsICc1JywgJzQnXSwgY29tcGFyZSksIFsnMzInLCAnNCcsICc1J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLmRpc3RpbmN0KFsnMzInLCAnY29uc3RydWN0b3InLCAnNScsICcxJ10sIGNvbXBhcmUpLCBbJzMyJywgJ2NvbnN0cnVjdG9yJywgJzUnLCAnMSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5cy5kaXN0aW5jdChbJzMyJywgJ2NvbnN0cnVjdG9yJywgJ3Byb3RvJywgJ3Byb3RvJywgJ2NvbnN0cnVjdG9yJ10sIGNvbXBhcmUpLCBbJzMyJywgJ2NvbnN0cnVjdG9yJywgJ3Byb3RvJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLmRpc3RpbmN0KFsnMzInLCAnNCcsICc1JywgJzMyJywgJzQnLCAnNScsICczMicsICc0JywgJzUnLCAnNSddLCBjb21wYXJlKSwgWyczMicsICc0JywgJzUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvcCcsICgpID0+IHtcblx0XHRjb25zdCBjbXAgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYSwgJ251bWJlcicsICd0eXBlb2YgYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBiLCAnbnVtYmVyJywgJ3R5cGVvZiBiJyk7XG5cdFx0XHRyZXR1cm4gYSAtIGI7XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLnRvcChbXSwgY21wLCAxKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLnRvcChbMV0sIGNtcCwgMCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5cy50b3AoWzEsIDJdLCBjbXAsIDEpLCBbMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLnRvcChbMiwgMV0sIGNtcCwgMSksIFsxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMudG9wKFsxLCAzLCAyXSwgY21wLCAyKSwgWzEsIDJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5cy50b3AoWzMsIDIsIDFdLCBjbXAsIDMpLCBbMSwgMiwgM10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLnRvcChbNCwgNiwgMiwgNywgOCwgMywgNSwgMV0sIGNtcCwgMyksIFsxLCAyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvcEFzeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNtcCA9IChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBhLCAnbnVtYmVyJywgJ3R5cGVvZiBhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGIsICdudW1iZXInLCAndHlwZW9mIGInKTtcblx0XHRcdHJldHVybiBhIC0gYjtcblx0XHR9O1xuXG5cdFx0YXdhaXQgdGVzdFRvcEFzeW5jKGNtcCwgMSk7XG5cdFx0cmV0dXJuIHRlc3RUb3BBc3luYyhjbXAsIDIpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0VG9wQXN5bmMoY21wOiBhbnksIG06IG51bWJlcikge1xuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFycmF5cy50b3BBc3luYyhbXSwgY21wLCAxLCBtKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFycmF5cy50b3BBc3luYyhbMV0sIGNtcCwgMCwgbSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhcnJheXMudG9wQXN5bmMoWzEsIDJdLCBjbXAsIDEsIG0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxXSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFycmF5cy50b3BBc3luYyhbMiwgMV0sIGNtcCwgMSwgbSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzFdKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXJyYXlzLnRvcEFzeW5jKFsxLCAzLCAyXSwgY21wLCAyLCBtKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMl0pO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhcnJheXMudG9wQXN5bmMoWzMsIDIsIDFdLCBjbXAsIDMsIG0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFycmF5cy50b3BBc3luYyhbNCwgNiwgMiwgNywgOCwgMywgNSwgMV0sIGNtcCwgMywgbSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdjb2FsZXNjZScsICgpID0+IHtcblx0XHRjb25zdCBhOiBBcnJheTxudW1iZXIgfCBudWxsPiA9IGFycmF5cy5jb2FsZXNjZShbbnVsbCwgMSwgbnVsbCwgMiwgM10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMF0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzFdLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVsyXSwgMyk7XG5cblx0XHRhcnJheXMuY29hbGVzY2UoW251bGwsIDEsIG51bGwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAyLCAzXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzJdLCAzKTtcblxuXHRcdGxldCBiOiBudW1iZXJbXSA9IFtdO1xuXHRcdGJbMTBdID0gMTtcblx0XHRiWzIwXSA9IDI7XG5cdFx0YlszMF0gPSAzO1xuXHRcdGIgPSBhcnJheXMuY29hbGVzY2UoYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYlswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiWzJdLCAzKTtcblxuXHRcdGxldCBzcGFyc2U6IG51bWJlcltdID0gW107XG5cdFx0c3BhcnNlWzBdID0gMTtcblx0XHRzcGFyc2VbMV0gPSAxO1xuXHRcdHNwYXJzZVsxN10gPSAxO1xuXHRcdHNwYXJzZVsxMDAwXSA9IDE7XG5cdFx0c3BhcnNlWzEwMDFdID0gMTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFyc2UubGVuZ3RoLCAxMDAyKTtcblxuXHRcdHNwYXJzZSA9IGFycmF5cy5jb2FsZXNjZShzcGFyc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFyc2UubGVuZ3RoLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnY29hbGVzY2UgLSBpbnBsYWNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBhOiBBcnJheTxudW1iZXIgfCBudWxsPiA9IFtudWxsLCAxLCBudWxsLCAyLCAzXTtcblx0XHRhcnJheXMuY29hbGVzY2VJblBsYWNlKGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMF0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzFdLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVsyXSwgMyk7XG5cblx0XHRhID0gW251bGwsIDEsIG51bGwsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIDIsIDNdO1xuXHRcdGFycmF5cy5jb2FsZXNjZUluUGxhY2UoYSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzJdLCAzKTtcblxuXHRcdGNvbnN0IGI6IG51bWJlcltdID0gW107XG5cdFx0YlsxMF0gPSAxO1xuXHRcdGJbMjBdID0gMjtcblx0XHRiWzMwXSA9IDM7XG5cdFx0YXJyYXlzLmNvYWxlc2NlSW5QbGFjZShiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiWzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYlsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJbMl0sIDMpO1xuXG5cdFx0Y29uc3Qgc3BhcnNlOiBudW1iZXJbXSA9IFtdO1xuXHRcdHNwYXJzZVswXSA9IDE7XG5cdFx0c3BhcnNlWzFdID0gMTtcblx0XHRzcGFyc2VbMTddID0gMTtcblx0XHRzcGFyc2VbMTAwMF0gPSAxO1xuXHRcdHNwYXJzZVsxMDAxXSA9IDE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhcnNlLmxlbmd0aCwgMTAwMik7XG5cblx0XHRhcnJheXMuY29hbGVzY2VJblBsYWNlKHNwYXJzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYXJzZS5sZW5ndGgsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQsIHJlbW92ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBhcnJheTogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZW1vdmUgPSBhcnJheXMuaW5zZXJ0KGFycmF5LCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzBdLCAnZm9vJyk7XG5cblx0XHRyZW1vdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc3BsaWNlJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIG5lZ2F0aXZlIHN0YXJ0IGluZGV4LCBhYnNvbHV0ZSB2YWx1ZSBncmVhdGVyIHRoYW4gdGhlIGxlbmd0aFxuXHRcdGxldCBhcnJheSA9IFsxLCAyLCAzLCA0LCA1XTtcblx0XHRhcnJheXMuc3BsaWNlKGFycmF5LCAtNiwgMywgWzYsIDddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXkubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMF0sIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVsxXSwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzJdLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbM10sIDUpO1xuXG5cdFx0Ly8gbmVnYXRpdmUgc3RhcnQgaW5kZXgsIGFic29sdXRlIHZhbHVlIGxlc3MgdGhhbiB0aGUgbGVuZ3RoXG5cdFx0YXJyYXkgPSBbMSwgMiwgMywgNCwgNV07XG5cdFx0YXJyYXlzLnNwbGljZShhcnJheSwgLTMsIDMsIFs2LCA3XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5Lmxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVsyXSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzNdLCA3KTtcblxuXHRcdC8vIFN0YXJ0IGluZGV4IGxlc3MgdGhhbiB0aGUgbGVuZ3RoXG5cdFx0YXJyYXkgPSBbMSwgMiwgMywgNCwgNV07XG5cdFx0YXJyYXlzLnNwbGljZShhcnJheSwgMywgMywgWzYsIDddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXkubGVuZ3RoLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMF0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzJdLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbM10sIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVs0XSwgNyk7XG5cblx0XHQvLyBTdGFydCBpbmRleCBncmVhdGVyIHRoYW4gdGhlIGxlbmd0aFxuXHRcdGFycmF5ID0gWzEsIDIsIDMsIDQsIDVdO1xuXHRcdGFycmF5cy5zcGxpY2UoYXJyYXksIDYsIDMsIFs2LCA3XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5Lmxlbmd0aCwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVsyXSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzNdLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbNF0sIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVs1XSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzZdLCA3KTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE1heEJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFycmF5ID0gW3sgdjogMyB9LCB7IHY6IDUgfSwgeyB2OiAyIH0sIHsgdjogMiB9LCB7IHY6IDIgfSwgeyB2OiA1IH1dO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXJyYXkuaW5kZXhPZihhcnJheXNGaW5kLmZpbmRGaXJzdE1heChhcnJheSwgYXJyYXlzLmNvbXBhcmVCeSh2ID0+IHYudiwgYXJyYXlzLm51bWJlckNvbXBhcmF0b3IpKSEpLFxuXHRcdFx0MVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRMYXN0TWF4QnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJyYXkgPSBbeyB2OiAzIH0sIHsgdjogNSB9LCB7IHY6IDIgfSwgeyB2OiAyIH0sIHsgdjogMiB9LCB7IHY6IDUgfV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhcnJheS5pbmRleE9mKGFycmF5c0ZpbmQuZmluZExhc3RNYXgoYXJyYXksIGFycmF5cy5jb21wYXJlQnkodiA9PiB2LnYsIGFycmF5cy5udW1iZXJDb21wYXJhdG9yKSkhKSxcblx0XHRcdDVcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTWluQnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJyYXkgPSBbeyB2OiAzIH0sIHsgdjogNSB9LCB7IHY6IDIgfSwgeyB2OiAyIH0sIHsgdjogMiB9LCB7IHY6IDUgfV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhcnJheS5pbmRleE9mKGFycmF5c0ZpbmQuZmluZEZpcnN0TWluKGFycmF5LCBhcnJheXMuY29tcGFyZUJ5KHYgPT4gdi52LCBhcnJheXMubnVtYmVyQ29tcGFyYXRvcikpISksXG5cdFx0XHQyXG5cdFx0KTtcblx0fSk7XG5cblxuXG5cdHN1aXRlKCdBcnJheVF1ZXVlJywgKCkgPT4ge1xuXHRcdHN1aXRlKCd0YWtlV2hpbGUvdGFrZUZyb21FbmRXaGlsZScsICgpID0+IHtcblx0XHRcdHRlc3QoJ1Rha2VXaGlsZSAxJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWV1ZTEgPSBuZXcgYXJyYXlzLkFycmF5UXVldWUoWzksIDgsIDEsIDcsIDZdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEudGFrZVdoaWxlKHggPT4geCA+IDUpLCBbOSwgOF0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMS50YWtlV2hpbGUoeCA9PiB4IDwgNyksIFsxXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VXaGlsZSh4ID0+IHRydWUpLCBbNywgNl0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ1Rha2VGcm9tRW5kV2hpbGUgMScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcXVldWUxID0gbmV3IGFycmF5cy5BcnJheVF1ZXVlKFs5LCA4LCAxLCA3LCA2XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VGcm9tRW5kV2hpbGUoeCA9PiB4ID4gNSksIFs3LCA2XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VGcm9tRW5kV2hpbGUoeCA9PiB4IDwgMiksIFsxXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VGcm9tRW5kV2hpbGUoeCA9PiB0cnVlKSwgWzksIDhdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCd0YWtlV2hpbGUgYW5kIHRha2VGcm9tRW5kV2hpbGUgbWl4ZWQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1ZXVlMSA9IG5ldyBhcnJheXMuQXJyYXlRdWV1ZShbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMS50YWtlRnJvbUVuZFdoaWxlKHggPT4geCA+IDMpLCBbNCwgNV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMS50YWtlV2hpbGUoeCA9PiB4ID4gMCksIFsxLCAyLCAzXSk7XG5cblx0XHRcdFx0Y29uc3QgcXVldWUyID0gbmV3IGFycmF5cy5BcnJheVF1ZXVlKFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUyLnRha2VXaGlsZSh4ID0+IHggPCAzKSwgWzEsIDJdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTIudGFrZUZyb21FbmRXaGlsZSh4ID0+IHggPiAwKSwgWzMsIDQsIDVdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3Rha2VXaGlsZS90YWtlRnJvbUVuZFdoaWxlIG1vbm90b25vdXMnLCAoKSA9PiB7XG5cdFx0XHRmdW5jdGlvbiB0ZXN0TW9ub3Rvbm91cyhhcnJheTogbnVtYmVyW10sIHByZWRpY2F0ZTogKGE6IG51bWJlcikgPT4gYm9vbGVhbikge1xuXHRcdFx0XHRmdW5jdGlvbiBub3JtYWxpemUoYXJyOiBudW1iZXJbXSk6IG51bWJlcltdIHwgbnVsbCB7XG5cdFx0XHRcdFx0aWYgKGFyci5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYXJyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmVnYXRlZFByZWRpY2F0ZSA9IChhOiBudW1iZXIpID0+ICFwcmVkaWNhdGUoYSk7XG5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IHF1ZXVlMSA9IG5ldyBhcnJheXMuQXJyYXlRdWV1ZShhcnJheSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEudGFrZVdoaWxlKHByZWRpY2F0ZSksIG5vcm1hbGl6ZShhcnJheS5maWx0ZXIocHJlZGljYXRlKSkpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLmxlbmd0aCwgYXJyYXkubGVuZ3RoIC0gYXJyYXkuZmlsdGVyKHByZWRpY2F0ZSkubGVuZ3RoKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMS50YWtlV2hpbGUoKCkgPT4gdHJ1ZSksIG5vcm1hbGl6ZShhcnJheS5maWx0ZXIobmVnYXRlZFByZWRpY2F0ZSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29uc3QgcXVldWUzID0gbmV3IGFycmF5cy5BcnJheVF1ZXVlKGFycmF5KTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMy50YWtlRnJvbUVuZFdoaWxlKG5lZ2F0ZWRQcmVkaWNhdGUpLCBub3JtYWxpemUoYXJyYXkuZmlsdGVyKG5lZ2F0ZWRQcmVkaWNhdGUpKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTMubGVuZ3RoLCBhcnJheS5sZW5ndGggLSBhcnJheS5maWx0ZXIobmVnYXRlZFByZWRpY2F0ZSkubGVuZ3RoKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMy50YWtlRnJvbUVuZFdoaWxlKCgpID0+IHRydWUpLCBub3JtYWxpemUoYXJyYXkuZmlsdGVyKHByZWRpY2F0ZSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhcnJheSA9IFsxLCAxLCAxLCAyLCA1LCA1LCA3LCA4LCA4XTtcblxuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIDEnLCAoKSA9PiB0ZXN0TW9ub3Rvbm91cyhhcnJheSwgdmFsdWUgPT4gdmFsdWUgPD0gMSkpO1xuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIDInLCAoKSA9PiB0ZXN0TW9ub3Rvbm91cyhhcnJheSwgdmFsdWUgPT4gdmFsdWUgPCA1KSk7XG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgMycsICgpID0+IHRlc3RNb25vdG9ub3VzKGFycmF5LCB2YWx1ZSA9PiB2YWx1ZSA8PSA1KSk7XG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgNCcsICgpID0+IHRlc3RNb25vdG9ub3VzKGFycmF5LCB2YWx1ZSA9PiB0cnVlKSk7XG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgNScsICgpID0+IHRlc3RNb25vdG9ub3VzKGFycmF5LCB2YWx1ZSA9PiBmYWxzZSkpO1xuXG5cdFx0XHRjb25zdCBhcnJheTIgPSBbMSwgMSwgMSwgMiwgNSwgNSwgNywgOCwgOCwgOSwgOSwgOSwgOSwgMTAsIDEwXTtcblxuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIDYnLCAoKSA9PiB0ZXN0TW9ub3Rvbm91cyhhcnJheTIsIHZhbHVlID0+IHZhbHVlIDwgMTApKTtcblx0XHRcdHRlc3QoJ1Rha2VXaGlsZSA3JywgKCkgPT4gdGVzdE1vbm90b25vdXMoYXJyYXkyLCB2YWx1ZSA9PiB2YWx1ZSA8IDcpKTtcblx0XHRcdHRlc3QoJ1Rha2VXaGlsZSA4JywgKCkgPT4gdGVzdE1vbm90b25vdXMoYXJyYXkyLCB2YWx1ZSA9PiB2YWx1ZSA8IDUpKTtcblxuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIEVtcHR5JywgKCkgPT4gdGVzdE1vbm90b25vdXMoW10sIHZhbHVlID0+IHZh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QUFVQSxPQUFNLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFDdEYsaUJBQU8sZ0JBQWdCLE9BQU8sUUFBUUEsT0FBTSxTQUFTQSxPQUFNLE9BQU8sU0FBUyxFQUFFLE1BQU07QUFDbkYsaUJBQU8sZ0JBQWdCLE9BQU8sVUFBVSxNQUFNLElBQUksR0FBRyxVQUFVQSxPQUFNLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUFBLFFBQy9GO0FBQ0E7QUFDQyxnQkFBTSxTQUFTLElBQUksT0FBTyxXQUFXQSxNQUFLO0FBQzFDLGlCQUFPLGdCQUFnQixPQUFPLGlCQUFpQixnQkFBZ0IsR0FBRyxVQUFVQSxPQUFNLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUMzRyxpQkFBTyxnQkFBZ0IsT0FBTyxRQUFRQSxPQUFNLFNBQVNBLE9BQU0sT0FBTyxnQkFBZ0IsRUFBRSxNQUFNO0FBQzFGLGlCQUFPLGdCQUFnQixPQUFPLGlCQUFpQixNQUFNLElBQUksR0FBRyxVQUFVQSxPQUFNLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFBQSxRQUMvRjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFFBQVEsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUV4QyxXQUFLLGVBQWUsTUFBTSxlQUFlLE9BQU8sV0FBUyxTQUFTLENBQUMsQ0FBQztBQUNwRSxXQUFLLGVBQWUsTUFBTSxlQUFlLE9BQU8sV0FBUyxRQUFRLENBQUMsQ0FBQztBQUNuRSxXQUFLLGVBQWUsTUFBTSxlQUFlLE9BQU8sV0FBUyxTQUFTLENBQUMsQ0FBQztBQUNwRSxXQUFLLGVBQWUsTUFBTSxlQUFlLE9BQU8sV0FBUyxJQUFJLENBQUM7QUFDOUQsV0FBSyxlQUFlLE1BQU0sZUFBZSxPQUFPLFdBQVMsS0FBSyxDQUFDO0FBRS9ELFlBQU0sU0FBUyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFBSSxFQUFFO0FBRTdELFdBQUssZUFBZSxNQUFNLGVBQWUsUUFBUSxXQUFTLFFBQVEsRUFBRSxDQUFDO0FBQ3JFLFdBQUssZUFBZSxNQUFNLGVBQWUsUUFBUSxXQUFTLFFBQVEsQ0FBQyxDQUFDO0FBQ3BFLFdBQUssZUFBZSxNQUFNLGVBQWUsUUFBUSxXQUFTLFFBQVEsQ0FBQyxDQUFDO0FBRXBFLFdBQUssbUJBQW1CLE1BQU0sZUFBZSxDQUFDLEdBQUcsV0FBUyxTQUFTLENBQUMsQ0FBQztBQUFBLElBQ3RFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJhcnJheSJdCn0K
