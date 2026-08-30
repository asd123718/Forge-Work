import { findFirstIdxMonotonousOrArrLen } from "./arraysFind.js";
import { CancellationError } from "./errors.js";
function tail(arr) {
  if (arr.length === 0) {
    throw new Error("Invalid tail call");
  }
  return [arr.slice(0, arr.length - 1), arr[arr.length - 1]];
}
function equals(one, other, itemEquals = (a, b) => a === b) {
  if (one === other) {
    return true;
  }
  if (!one || !other) {
    return false;
  }
  if (one.length !== other.length) {
    return false;
  }
  for (let i = 0, len = one.length; i < len; i++) {
    if (!itemEquals(one[i], other[i])) {
      return false;
    }
  }
  return true;
}
function removeFastWithoutKeepingOrder(array, index2) {
  const last = array.length - 1;
  if (index2 < last) {
    array[index2] = array[last];
  }
  array.pop();
}
function binarySearch(array, key, comparator) {
  return binarySearch2(array.length, (i) => comparator(array[i], key));
}
function binarySearch2(length, compareToKey) {
  let low = 0, high = length - 1;
  while (low <= high) {
    const mid = (low + high) / 2 | 0;
    const comp = compareToKey(mid);
    if (comp < 0) {
      low = mid + 1;
    } else if (comp > 0) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return -(low + 1);
}
function quickSelect(nth, data, compare) {
  nth = nth | 0;
  if (nth >= data.length) {
    throw new TypeError("invalid index");
  }
  const pivotValue = data[Math.floor(data.length * Math.random())];
  const lower = [];
  const higher = [];
  const pivots = [];
  for (const value of data) {
    const val = compare(value, pivotValue);
    if (val < 0) {
      lower.push(value);
    } else if (val > 0) {
      higher.push(value);
    } else {
      pivots.push(value);
    }
  }
  if (nth < lower.length) {
    return quickSelect(nth, lower, compare);
  } else if (nth < lower.length + pivots.length) {
    return pivots[0];
  } else {
    return quickSelect(nth - (lower.length + pivots.length), higher, compare);
  }
}
function groupBy(data, compare) {
  const result = [];
  let currentGroup = void 0;
  for (const element of data.slice(0).sort(compare)) {
    if (!currentGroup || compare(currentGroup[0], element) !== 0) {
      currentGroup = [element];
      result.push(currentGroup);
    } else {
      currentGroup.push(element);
    }
  }
  return result;
}
function* groupAdjacentBy(items, shouldBeGrouped) {
  let currentGroup;
  let last;
  for (const item of items) {
    if (last !== void 0 && shouldBeGrouped(last, item)) {
      currentGroup.push(item);
    } else {
      if (currentGroup) {
        yield currentGroup;
      }
      currentGroup = [item];
    }
    last = item;
  }
  if (currentGroup) {
    yield currentGroup;
  }
}
function forEachAdjacent(arr, f) {
  for (let i = 0; i <= arr.length; i++) {
    f(i === 0 ? void 0 : arr[i - 1], i === arr.length ? void 0 : arr[i]);
  }
}
function forEachWithNeighbors(arr, f) {
  for (let i = 0; i < arr.length; i++) {
    f(i === 0 ? void 0 : arr[i - 1], arr[i], i + 1 === arr.length ? void 0 : arr[i + 1]);
  }
}
function concatArrays(...arrays) {
  return [].concat(...arrays);
}
function sortedDiff(before, after, compare) {
  const result = [];
  function pushSplice(start, deleteCount, toInsert) {
    if (deleteCount === 0 && toInsert.length === 0) {
      return;
    }
    const latest = result[result.length - 1];
    if (latest && latest.start + latest.deleteCount === start) {
      latest.deleteCount += deleteCount;
      latest.toInsert.push(...toInsert);
    } else {
      result.push({ start, deleteCount, toInsert });
    }
  }
  let beforeIdx = 0;
  let afterIdx = 0;
  while (true) {
    if (beforeIdx === before.length) {
      pushSplice(beforeIdx, 0, after.slice(afterIdx));
      break;
    }
    if (afterIdx === after.length) {
      pushSplice(beforeIdx, before.length - beforeIdx, []);
      break;
    }
    const beforeElement = before[beforeIdx];
    const afterElement = after[afterIdx];
    const n = compare(beforeElement, afterElement);
    if (n === 0) {
      beforeIdx += 1;
      afterIdx += 1;
    } else if (n < 0) {
      pushSplice(beforeIdx, 1, []);
      beforeIdx += 1;
    } else if (n > 0) {
      pushSplice(beforeIdx, 0, [afterElement]);
      afterIdx += 1;
    }
  }
  return result;
}
function delta(before, after, compare) {
  const splices = sortedDiff(before, after, compare);
  const removed = [];
  const added = [];
  for (const splice2 of splices) {
    removed.push(...before.slice(splice2.start, splice2.start + splice2.deleteCount));
    added.push(...splice2.toInsert);
  }
  return { removed, added };
}
function top(array, compare, n) {
  if (n === 0) {
    return [];
  }
  const result = array.slice(0, n).sort(compare);
  topStep(array, compare, result, n, array.length);
  return result;
}
function topAsync(array, compare, n, batch, token) {
  if (n === 0) {
    return Promise.resolve([]);
  }
  return new Promise((resolve, reject) => {
    (async () => {
      const o = array.length;
      const result = array.slice(0, n).sort(compare);
      for (let i = n, m = Math.min(n + batch, o); i < o; i = m, m = Math.min(m + batch, o)) {
        if (i > n) {
          await new Promise((resolve2) => setTimeout(resolve2));
        }
        if (token && token.isCancellationRequested) {
          throw new CancellationError();
        }
        topStep(array, compare, result, i, m);
      }
      return result;
    })().then(resolve, reject);
  });
}
function topStep(array, compare, result, i, m) {
  for (const n = result.length; i < m; i++) {
    const element = array[i];
    if (compare(element, result[n - 1]) < 0) {
      result.pop();
      const j = findFirstIdxMonotonousOrArrLen(result, (e) => compare(element, e) < 0);
      result.splice(j, 0, element);
    }
  }
}
function coalesce(array) {
  return array.filter((e) => !!e);
}
function coalesceInPlace(array) {
  let to = 0;
  for (let i = 0; i < array.length; i++) {
    if (!!array[i]) {
      array[to] = array[i];
      to += 1;
    }
  }
  array.length = to;
}
function move(array, from, to) {
  array.splice(to, 0, array.splice(from, 1)[0]);
}
function isFalsyOrEmpty(obj) {
  return !Array.isArray(obj) || obj.length === 0;
}
function isNonEmptyArray(obj) {
  return Array.isArray(obj) && obj.length > 0;
}
function distinct(array, keyFn = (value) => value) {
  const seen = /* @__PURE__ */ new Set();
  return array.filter((element) => {
    const key = keyFn(element);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
function uniqueFilter(keyFn) {
  const seen = /* @__PURE__ */ new Set();
  return (element) => {
    const key = keyFn(element);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
}
function commonPrefixLength(one, other, equals2 = (a, b) => a === b) {
  let result = 0;
  for (let i = 0, len = Math.min(one.length, other.length); i < len && equals2(one[i], other[i]); i++) {
    result++;
  }
  return result;
}
function range(arg, to) {
  let from = typeof to === "number" ? arg : 0;
  if (typeof to === "number") {
    from = arg;
  } else {
    from = 0;
    to = arg;
  }
  const result = [];
  if (from <= to) {
    for (let i = from; i < to; i++) {
      result.push(i);
    }
  } else {
    for (let i = from; i > to; i--) {
      result.push(i);
    }
  }
  return result;
}
function index(array, indexer, mapper) {
  return array.reduce((r, t) => {
    r[indexer(t)] = mapper ? mapper(t) : t;
    return r;
  }, /* @__PURE__ */ Object.create(null));
}
function insert(array, element) {
  array.push(element);
  return () => remove(array, element);
}
function remove(array, element) {
  const index2 = array.indexOf(element);
  if (index2 > -1) {
    array.splice(index2, 1);
    return element;
  }
  return void 0;
}
function arrayInsert(target, insertIndex, insertArr) {
  const before = target.slice(0, insertIndex);
  const after = target.slice(insertIndex);
  return before.concat(insertArr, after);
}
function shuffle(array, _seed) {
  let rand;
  if (typeof _seed === "number") {
    let seed = _seed;
    rand = () => {
      const x = Math.sin(seed++) * 179426549;
      return x - Math.floor(x);
    };
  } else {
    rand = Math.random;
  }
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}
function pushToStart(arr, value) {
  const index2 = arr.indexOf(value);
  if (index2 > -1) {
    arr.splice(index2, 1);
    arr.unshift(value);
  }
}
function pushToEnd(arr, value) {
  const index2 = arr.indexOf(value);
  if (index2 > -1) {
    arr.splice(index2, 1);
    arr.push(value);
  }
}
function pushMany(arr, items) {
  for (const item of items) {
    arr.push(item);
  }
}
function mapArrayOrNot(items, fn) {
  return Array.isArray(items) ? items.map(fn) : fn(items);
}
function mapFilter(array, fn) {
  const result = [];
  for (const item of array) {
    const mapped = fn(item);
    if (mapped !== void 0) {
      result.push(mapped);
    }
  }
  return result;
}
function withoutDuplicates(array) {
  const s = new Set(array);
  return Array.from(s);
}
function asArray(x) {
  return Array.isArray(x) ? x : [x];
}
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function insertInto(array, start, newItems) {
  const startIdx = getActualStartIndex(array, start);
  const originalLength = array.length;
  const newItemsLength = newItems.length;
  array.length = originalLength + newItemsLength;
  for (let i = originalLength - 1; i >= startIdx; i--) {
    array[i + newItemsLength] = array[i];
  }
  for (let i = 0; i < newItemsLength; i++) {
    array[i + startIdx] = newItems[i];
  }
}
function splice(array, start, deleteCount, newItems) {
  const index2 = getActualStartIndex(array, start);
  let result = array.splice(index2, deleteCount);
  if (result === void 0) {
    result = [];
  }
  insertInto(array, index2, newItems);
  return result;
}
function getActualStartIndex(array, start) {
  return start < 0 ? Math.max(start + array.length, 0) : Math.min(start, array.length);
}
var CompareResult;
((CompareResult2) => {
  function isLessThan(result) {
    return result < 0;
  }
  CompareResult2.isLessThan = isLessThan;
  function isLessThanOrEqual(result) {
    return result <= 0;
  }
  CompareResult2.isLessThanOrEqual = isLessThanOrEqual;
  function isGreaterThan(result) {
    return result > 0;
  }
  CompareResult2.isGreaterThan = isGreaterThan;
  function isNeitherLessOrGreaterThan(result) {
    return result === 0;
  }
  CompareResult2.isNeitherLessOrGreaterThan = isNeitherLessOrGreaterThan;
  CompareResult2.greaterThan = 1;
  CompareResult2.lessThan = -1;
  CompareResult2.neitherLessOrGreaterThan = 0;
})(CompareResult || (CompareResult = {}));
function compareBy(selector, comparator) {
  return (a, b) => comparator(selector(a), selector(b));
}
function tieBreakComparators(...comparators) {
  return (item1, item2) => {
    for (const comparator of comparators) {
      const result = comparator(item1, item2);
      if (!CompareResult.isNeitherLessOrGreaterThan(result)) {
        return result;
      }
    }
    return CompareResult.neitherLessOrGreaterThan;
  };
}
const numberComparator = (a, b) => a - b;
const booleanComparator = (a, b) => numberComparator(a ? 1 : 0, b ? 1 : 0);
function reverseOrder(comparator) {
  return (a, b) => -comparator(a, b);
}
function compareUndefinedSmallest(comparator) {
  return (a, b) => {
    if (a === void 0) {
      return b === void 0 ? CompareResult.neitherLessOrGreaterThan : CompareResult.lessThan;
    } else if (b === void 0) {
      return CompareResult.greaterThan;
    }
    return comparator(a, b);
  };
}
class ArrayQueue {
  /**
   * Constructs a queue that is backed by the given array. Runtime is O(1).
  */
  constructor(items) {
    this.firstIdx = 0;
    this.items = items;
    this.lastIdx = this.items.length - 1;
  }
  get length() {
    return this.lastIdx - this.firstIdx + 1;
  }
  /**
   * Consumes elements from the beginning of the queue as long as the predicate returns true.
   * If no elements were consumed, `null` is returned. Has a runtime of O(result.length).
  */
  takeWhile(predicate) {
    let startIdx = this.firstIdx;
    while (startIdx <= this.lastIdx && predicate(this.items[startIdx])) {
      startIdx++;
    }
    const result = startIdx === this.firstIdx ? null : this.items.slice(this.firstIdx, startIdx);
    this.firstIdx = startIdx;
    return result;
  }
  /**
   * Consumes elements from the end of the queue as long as the predicate returns true.
   * If no elements were consumed, `null` is returned.
   * The result has the same order as the underlying array!
  */
  takeFromEndWhile(predicate) {
    let endIdx = this.lastIdx;
    while (endIdx >= this.firstIdx && predicate(this.items[endIdx])) {
      endIdx--;
    }
    const result = endIdx === this.lastIdx ? null : this.items.slice(endIdx + 1, this.lastIdx + 1);
    this.lastIdx = endIdx;
    return result;
  }
  peek() {
    if (this.length === 0) {
      return void 0;
    }
    return this.items[this.firstIdx];
  }
  peekLast() {
    if (this.length === 0) {
      return void 0;
    }
    return this.items[this.lastIdx];
  }
  dequeue() {
    const result = this.items[this.firstIdx];
    this.firstIdx++;
    return result;
  }
  removeLast() {
    const result = this.items[this.lastIdx];
    this.lastIdx--;
    return result;
  }
  takeCount(count) {
    const result = this.items.slice(this.firstIdx, this.firstIdx + count);
    this.firstIdx += count;
    return result;
  }
}
const _CallbackIterable = class _CallbackIterable {
  constructor(iterate) {
    this.iterate = iterate;
  }
  forEach(handler) {
    this.iterate((item) => {
      handler(item);
      return true;
    });
  }
  toArray() {
    const result = [];
    this.iterate((item) => {
      result.push(item);
      return true;
    });
    return result;
  }
  filter(predicate) {
    return new _CallbackIterable((cb) => this.iterate((item) => predicate(item) ? cb(item) : true));
  }
  map(mapFn) {
    return new _CallbackIterable((cb) => this.iterate((item) => cb(mapFn(item))));
  }
  some(predicate) {
    let result = false;
    this.iterate((item) => {
      result = predicate(item);
      return !result;
    });
    return result;
  }
  findFirst(predicate) {
    let result;
    this.iterate((item) => {
      if (predicate(item)) {
        result = item;
        return false;
      }
      return true;
    });
    return result;
  }
  findLast(predicate) {
    let result;
    this.iterate((item) => {
      if (predicate(item)) {
        result = item;
      }
      return true;
    });
    return result;
  }
  findLastMaxBy(comparator) {
    let result;
    let first = true;
    this.iterate((item) => {
      if (first || CompareResult.isGreaterThan(comparator(item, result))) {
        first = false;
        result = item;
      }
      return true;
    });
    return result;
  }
};
_CallbackIterable.empty = new _CallbackIterable((_callback) => {
});
let CallbackIterable = _CallbackIterable;
class Permutation {
  constructor(_indexMap) {
    this._indexMap = _indexMap;
  }
  /**
   * Returns a permutation that sorts the given array according to the given compare function.
   */
  static createSortPermutation(arr, compareFn) {
    const sortIndices = Array.from(arr.keys()).sort((index1, index2) => compareFn(arr[index1], arr[index2]));
    return new Permutation(sortIndices);
  }
  /**
   * Returns a new array with the elements of the given array re-arranged according to this permutation.
   */
  apply(arr) {
    return arr.map((_, index2) => arr[this._indexMap[index2]]);
  }
  /**
   * Returns a new permutation that undoes the re-arrangement of this permutation.
  */
  inverse() {
    const inverseIndexMap = this._indexMap.slice();
    for (let i = 0; i < this._indexMap.length; i++) {
      inverseIndexMap[this._indexMap[i]] = i;
    }
    return new Permutation(inverseIndexMap);
  }
}
async function findAsync(array, predicate) {
  const results = await Promise.all(array.map(
    async (element, index2) => ({ element, ok: await predicate(element, index2) })
  ));
  return results.find((r) => r.ok)?.element;
}
function sum(array) {
  return array.reduce((acc, value) => acc + value, 0);
}
function sumBy(array, selector) {
  return array.reduce((acc, value) => acc + selector(value), 0);
}
export {
  ArrayQueue,
  CallbackIterable,
  CompareResult,
  Permutation,
  arrayInsert,
  asArray,
  binarySearch,
  binarySearch2,
  booleanComparator,
  coalesce,
  coalesceInPlace,
  commonPrefixLength,
  compareBy,
  compareUndefinedSmallest,
  concatArrays,
  delta,
  distinct,
  equals,
  findAsync,
  forEachAdjacent,
  forEachWithNeighbors,
  getRandomElement,
  groupAdjacentBy,
  groupBy,
  index,
  insert,
  insertInto,
  isFalsyOrEmpty,
  isNonEmptyArray,
  mapArrayOrNot,
  mapFilter,
  move,
  numberComparator,
  pushMany,
  pushToEnd,
  pushToStart,
  quickSelect,
  range,
  remove,
  removeFastWithoutKeepingOrder,
  reverseOrder,
  shuffle,
  sortedDiff,
  splice,
  sum,
  sumBy,
  tail,
  tieBreakComparators,
  top,
  topAsync,
  uniqueFilter,
  withoutDuplicates
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGFycmF5cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbiB9IGZyb20gJy4vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSVNwbGljZSB9IGZyb20gJy4vc2VxdWVuY2UuanMnO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGxhc3QgZW50cnkgYW5kIHRoZSBpbml0aWFsIE4tMSBlbnRyaWVzIG9mIHRoZSBhcnJheSwgYXMgYSB0dXBsZSBvZiBbcmVzdCwgbGFzdF0uXG4gKlxuICogVGhlIGFycmF5IG11c3QgaGF2ZSBhdCBsZWFzdCBvbmUgZWxlbWVudC5cbiAqXG4gKiBAcGFyYW0gYXJyIFRoZSBpbnB1dCBhcnJheVxuICogQHJldHVybnMgQSB0dXBsZSBvZiBbcmVzdCwgbGFzdF0gd2hlcmUgcmVzdCBpcyBhbGwgYnV0IHRoZSBsYXN0IGVsZW1lbnQgYW5kIGxhc3QgaXMgdGhlIGxhc3QgZWxlbWVudFxuICogQHRocm93cyBFcnJvciBpZiB0aGUgYXJyYXkgaXMgZW1wdHlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRhaWw8VD4oYXJyOiBUW10pOiBbVFtdLCBUXSB7XG5cdGlmIChhcnIubGVuZ3RoID09PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRhaWwgY2FsbCcpO1xuXHR9XG5cblx0cmV0dXJuIFthcnIuc2xpY2UoMCwgYXJyLmxlbmd0aCAtIDEpLCBhcnJbYXJyLmxlbmd0aCAtIDFdXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVxdWFsczxUPihvbmU6IFJlYWRvbmx5QXJyYXk8VD4gfCB1bmRlZmluZWQsIG90aGVyOiBSZWFkb25seUFycmF5PFQ+IHwgdW5kZWZpbmVkLCBpdGVtRXF1YWxzOiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbiA9IChhLCBiKSA9PiBhID09PSBiKTogYm9vbGVhbiB7XG5cdGlmIChvbmUgPT09IG90aGVyKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoIW9uZSB8fCAhb3RoZXIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAob25lLmxlbmd0aCAhPT0gb3RoZXIubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG9uZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGlmICghaXRlbUVxdWFscyhvbmVbaV0sIG90aGVyW2ldKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIFJlbW92ZSB0aGUgZWxlbWVudCBhdCBgaW5kZXhgIGJ5IHJlcGxhY2luZyBpdCB3aXRoIHRoZSBsYXN0IGVsZW1lbnQuIFRoaXMgaXMgZmFzdGVyIHRoYW4gYHNwbGljZWBcbiAqIGJ1dCBjaGFuZ2VzIHRoZSBvcmRlciBvZiB0aGUgYXJyYXlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUZhc3RXaXRob3V0S2VlcGluZ09yZGVyPFQ+KGFycmF5OiBUW10sIGluZGV4OiBudW1iZXIpIHtcblx0Y29uc3QgbGFzdCA9IGFycmF5Lmxlbmd0aCAtIDE7XG5cdGlmIChpbmRleCA8IGxhc3QpIHtcblx0XHRhcnJheVtpbmRleF0gPSBhcnJheVtsYXN0XTtcblx0fVxuXHRhcnJheS5wb3AoKTtcbn1cblxuLyoqXG4gKiBQZXJmb3JtcyBhIGJpbmFyeSBzZWFyY2ggYWxnb3JpdGhtIG92ZXIgYSBzb3J0ZWQgYXJyYXkuXG4gKlxuICogQHBhcmFtIGFycmF5IFRoZSBhcnJheSBiZWluZyBzZWFyY2hlZC5cbiAqIEBwYXJhbSBrZXkgVGhlIHZhbHVlIHdlIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0gY29tcGFyYXRvciBBIGZ1bmN0aW9uIHRoYXQgdGFrZXMgdHdvIGFycmF5IGVsZW1lbnRzIGFuZCByZXR1cm5zIHplcm9cbiAqICAgaWYgdGhleSBhcmUgZXF1YWwsIGEgbmVnYXRpdmUgbnVtYmVyIGlmIHRoZSBmaXJzdCBlbGVtZW50IHByZWNlZGVzIHRoZVxuICogICBzZWNvbmQgb25lIGluIHRoZSBzb3J0aW5nIG9yZGVyLCBvciBhIHBvc2l0aXZlIG51bWJlciBpZiB0aGUgc2Vjb25kIGVsZW1lbnRcbiAqICAgcHJlY2VkZXMgdGhlIGZpcnN0IG9uZS5cbiAqIEByZXR1cm4gU2VlIHtAbGluayBiaW5hcnlTZWFyY2gyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gYmluYXJ5U2VhcmNoPFQ+KGFycmF5OiBSZWFkb25seUFycmF5PFQ+LCBrZXk6IFQsIGNvbXBhcmF0b3I6IChvcDE6IFQsIG9wMjogVCkgPT4gbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIGJpbmFyeVNlYXJjaDIoYXJyYXkubGVuZ3RoLCBpID0+IGNvbXBhcmF0b3IoYXJyYXlbaV0sIGtleSkpO1xufVxuXG4vKipcbiAqIFBlcmZvcm1zIGEgYmluYXJ5IHNlYXJjaCBhbGdvcml0aG0gb3ZlciBhIHNvcnRlZCBjb2xsZWN0aW9uLiBVc2VmdWwgZm9yIGNhc2VzXG4gKiB3aGVuIHdlIG5lZWQgdG8gcGVyZm9ybSBhIGJpbmFyeSBzZWFyY2ggb3ZlciBzb21ldGhpbmcgdGhhdCBpc24ndCBhY3R1YWxseSBhblxuICogYXJyYXksIGFuZCBjb252ZXJ0aW5nIGRhdGEgdG8gYW4gYXJyYXkgd291bGQgZGVmZWF0IHRoZSB1c2Ugb2YgYmluYXJ5IHNlYXJjaFxuICogaW4gdGhlIGZpcnN0IHBsYWNlLlxuICpcbiAqIEBwYXJhbSBsZW5ndGggVGhlIGNvbGxlY3Rpb24gbGVuZ3RoLlxuICogQHBhcmFtIGNvbXBhcmVUb0tleSBBIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYW4gaW5kZXggb2YgYW4gZWxlbWVudCBpbiB0aGVcbiAqICAgY29sbGVjdGlvbiBhbmQgcmV0dXJucyB6ZXJvIGlmIHRoZSB2YWx1ZSBhdCB0aGlzIGluZGV4IGlzIGVxdWFsIHRvIHRoZVxuICogICBzZWFyY2gga2V5LCBhIG5lZ2F0aXZlIG51bWJlciBpZiB0aGUgdmFsdWUgcHJlY2VkZXMgdGhlIHNlYXJjaCBrZXkgaW4gdGhlXG4gKiAgIHNvcnRpbmcgb3JkZXIsIG9yIGEgcG9zaXRpdmUgbnVtYmVyIGlmIHRoZSBzZWFyY2gga2V5IHByZWNlZGVzIHRoZSB2YWx1ZS5cbiAqIEByZXR1cm4gQSBub24tbmVnYXRpdmUgaW5kZXggb2YgYW4gZWxlbWVudCwgaWYgZm91bmQuIElmIG5vdCBmb3VuZCwgdGhlXG4gKiAgIHJlc3VsdCBpcyAtKG4rMSkgKG9yIH5uLCB1c2luZyBiaXR3aXNlIG5vdGF0aW9uKSwgd2hlcmUgbiBpcyB0aGUgaW5kZXhcbiAqICAgd2hlcmUgdGhlIGtleSBzaG91bGQgYmUgaW5zZXJ0ZWQgdG8gbWFpbnRhaW4gdGhlIHNvcnRpbmcgb3JkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5hcnlTZWFyY2gyKGxlbmd0aDogbnVtYmVyLCBjb21wYXJlVG9LZXk6IChpbmRleDogbnVtYmVyKSA9PiBudW1iZXIpOiBudW1iZXIge1xuXHRsZXQgbG93ID0gMCxcblx0XHRoaWdoID0gbGVuZ3RoIC0gMTtcblxuXHR3aGlsZSAobG93IDw9IGhpZ2gpIHtcblx0XHRjb25zdCBtaWQgPSAoKGxvdyArIGhpZ2gpIC8gMikgfCAwO1xuXHRcdGNvbnN0IGNvbXAgPSBjb21wYXJlVG9LZXkobWlkKTtcblx0XHRpZiAoY29tcCA8IDApIHtcblx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0fSBlbHNlIGlmIChjb21wID4gMCkge1xuXHRcdFx0aGlnaCA9IG1pZCAtIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBtaWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiAtKGxvdyArIDEpO1xufVxuXG50eXBlIENvbXBhcmU8VD4gPSAoYTogVCwgYjogVCkgPT4gbnVtYmVyO1xuXG4vKipcbiAqIEZpbmRzIHRoZSBudGggc21hbGxlc3QgZWxlbWVudCBpbiB0aGUgYXJyYXkgdXNpbmcgcXVpY2tzZWxlY3QgYWxnb3JpdGhtLlxuICogVGhlIGRhdGEgZG9lcyBub3QgbmVlZCB0byBiZSBzb3J0ZWQuXG4gKlxuICogQHBhcmFtIG50aCBUaGUgemVyby1iYXNlZCBpbmRleCBvZiB0aGUgZWxlbWVudCB0byBmaW5kICgwID0gc21hbGxlc3QsIDEgPSBzZWNvbmQgc21hbGxlc3QsIGV0Yy4pXG4gKiBAcGFyYW0gZGF0YSBUaGUgdW5zb3J0ZWQgYXJyYXlcbiAqIEBwYXJhbSBjb21wYXJlIEEgY29tcGFyYXRvciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgdGhlIHNvcnQgb3JkZXJcbiAqIEByZXR1cm5zIFRoZSBudGggc21hbGxlc3QgZWxlbWVudFxuICogQHRocm93cyBUeXBlRXJyb3IgaWYgbnRoIGlzID49IGRhdGEubGVuZ3RoXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBxdWlja1NlbGVjdDxUPihudGg6IG51bWJlciwgZGF0YTogVFtdLCBjb21wYXJlOiBDb21wYXJlPFQ+KTogVCB7XG5cblx0bnRoID0gbnRoIHwgMDtcblxuXHRpZiAobnRoID49IGRhdGEubGVuZ3RoKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignaW52YWxpZCBpbmRleCcpO1xuXHR9XG5cblx0Y29uc3QgcGl2b3RWYWx1ZSA9IGRhdGFbTWF0aC5mbG9vcihkYXRhLmxlbmd0aCAqIE1hdGgucmFuZG9tKCkpXTtcblx0Y29uc3QgbG93ZXI6IFRbXSA9IFtdO1xuXHRjb25zdCBoaWdoZXI6IFRbXSA9IFtdO1xuXHRjb25zdCBwaXZvdHM6IFRbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgdmFsdWUgb2YgZGF0YSkge1xuXHRcdGNvbnN0IHZhbCA9IGNvbXBhcmUodmFsdWUsIHBpdm90VmFsdWUpO1xuXHRcdGlmICh2YWwgPCAwKSB7XG5cdFx0XHRsb3dlci5wdXNoKHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKHZhbCA+IDApIHtcblx0XHRcdGhpZ2hlci5wdXNoKHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cGl2b3RzLnB1c2godmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdGlmIChudGggPCBsb3dlci5sZW5ndGgpIHtcblx0XHRyZXR1cm4gcXVpY2tTZWxlY3QobnRoLCBsb3dlciwgY29tcGFyZSk7XG5cdH0gZWxzZSBpZiAobnRoIDwgbG93ZXIubGVuZ3RoICsgcGl2b3RzLmxlbmd0aCkge1xuXHRcdHJldHVybiBwaXZvdHNbMF07XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHF1aWNrU2VsZWN0KG50aCAtIChsb3dlci5sZW5ndGggKyBwaXZvdHMubGVuZ3RoKSwgaGlnaGVyLCBjb21wYXJlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ3JvdXBCeTxUPihkYXRhOiBSZWFkb25seUFycmF5PFQ+LCBjb21wYXJlOiAoYTogVCwgYjogVCkgPT4gbnVtYmVyKTogVFtdW10ge1xuXHRjb25zdCByZXN1bHQ6IFRbXVtdID0gW107XG5cdGxldCBjdXJyZW50R3JvdXA6IFRbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGRhdGEuc2xpY2UoMCkuc29ydChjb21wYXJlKSkge1xuXHRcdGlmICghY3VycmVudEdyb3VwIHx8IGNvbXBhcmUoY3VycmVudEdyb3VwWzBdLCBlbGVtZW50KSAhPT0gMCkge1xuXHRcdFx0Y3VycmVudEdyb3VwID0gW2VsZW1lbnRdO1xuXHRcdFx0cmVzdWx0LnB1c2goY3VycmVudEdyb3VwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VycmVudEdyb3VwLnB1c2goZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogU3BsaXRzIHRoZSBnaXZlbiBpdGVtcyBpbnRvIGEgbGlzdCBvZiAobm9uLWVtcHR5KSBncm91cHMuXG4gKiBgc2hvdWxkQmVHcm91cGVkYCBpcyB1c2VkIHRvIGRlY2lkZSBpZiB0d28gY29uc2VjdXRpdmUgaXRlbXMgc2hvdWxkIGJlIGluIHRoZSBzYW1lIGdyb3VwLlxuICogVGhlIG9yZGVyIG9mIHRoZSBpdGVtcyBpcyBwcmVzZXJ2ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiogZ3JvdXBBZGphY2VudEJ5PFQ+KGl0ZW1zOiBJdGVyYWJsZTxUPiwgc2hvdWxkQmVHcm91cGVkOiAoaXRlbTE6IFQsIGl0ZW0yOiBUKSA9PiBib29sZWFuKTogSXRlcmFibGU8VFtdPiB7XG5cdGxldCBjdXJyZW50R3JvdXA6IFRbXSB8IHVuZGVmaW5lZDtcblx0bGV0IGxhc3Q6IFQgfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdGlmIChsYXN0ICE9PSB1bmRlZmluZWQgJiYgc2hvdWxkQmVHcm91cGVkKGxhc3QsIGl0ZW0pKSB7XG5cdFx0XHRjdXJyZW50R3JvdXAhLnB1c2goaXRlbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChjdXJyZW50R3JvdXApIHtcblx0XHRcdFx0eWllbGQgY3VycmVudEdyb3VwO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudEdyb3VwID0gW2l0ZW1dO1xuXHRcdH1cblx0XHRsYXN0ID0gaXRlbTtcblx0fVxuXHRpZiAoY3VycmVudEdyb3VwKSB7XG5cdFx0eWllbGQgY3VycmVudEdyb3VwO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JFYWNoQWRqYWNlbnQ8VD4oYXJyOiBUW10sIGY6IChpdGVtMTogVCB8IHVuZGVmaW5lZCwgaXRlbTI6IFQgfCB1bmRlZmluZWQpID0+IHZvaWQpOiB2b2lkIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gYXJyLmxlbmd0aDsgaSsrKSB7XG5cdFx0ZihpID09PSAwID8gdW5kZWZpbmVkIDogYXJyW2kgLSAxXSwgaSA9PT0gYXJyLmxlbmd0aCA/IHVuZGVmaW5lZCA6IGFycltpXSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvckVhY2hXaXRoTmVpZ2hib3JzPFQ+KGFycjogVFtdLCBmOiAoYmVmb3JlOiBUIHwgdW5kZWZpbmVkLCBlbGVtZW50OiBULCBhZnRlcjogVCB8IHVuZGVmaW5lZCkgPT4gdm9pZCk6IHZvaWQge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuXHRcdGYoaSA9PT0gMCA/IHVuZGVmaW5lZCA6IGFycltpIC0gMV0sIGFycltpXSwgaSArIDEgPT09IGFyci5sZW5ndGggPyB1bmRlZmluZWQgOiBhcnJbaSArIDFdKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uY2F0QXJyYXlzPFQgZXh0ZW5kcyBhbnlbXT4oLi4uYXJyYXlzOiBUKTogVFtudW1iZXJdW251bWJlcl1bXSB7XG5cdHJldHVybiBbXS5jb25jYXQoLi4uYXJyYXlzKTtcbn1cblxuaW50ZXJmYWNlIElNdXRhYmxlU3BsaWNlPFQ+IGV4dGVuZHMgSVNwbGljZTxUPiB7XG5cdHJlYWRvbmx5IHRvSW5zZXJ0OiBUW107XG5cdGRlbGV0ZUNvdW50OiBudW1iZXI7XG59XG5cbi8qKlxuICogRGlmZnMgdHdvICpzb3J0ZWQqIGFycmF5cyBhbmQgY29tcHV0ZXMgdGhlIHNwbGljZXMgd2hpY2ggYXBwbHkgdGhlIGRpZmYuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzb3J0ZWREaWZmPFQ+KGJlZm9yZTogUmVhZG9ubHlBcnJheTxUPiwgYWZ0ZXI6IFJlYWRvbmx5QXJyYXk8VD4sIGNvbXBhcmU6IChhOiBULCBiOiBUKSA9PiBudW1iZXIpOiBJU3BsaWNlPFQ+W10ge1xuXHRjb25zdCByZXN1bHQ6IElNdXRhYmxlU3BsaWNlPFQ+W10gPSBbXTtcblxuXHRmdW5jdGlvbiBwdXNoU3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIHRvSW5zZXJ0OiBUW10pOiB2b2lkIHtcblx0XHRpZiAoZGVsZXRlQ291bnQgPT09IDAgJiYgdG9JbnNlcnQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF0ZXN0ID0gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXTtcblxuXHRcdGlmIChsYXRlc3QgJiYgbGF0ZXN0LnN0YXJ0ICsgbGF0ZXN0LmRlbGV0ZUNvdW50ID09PSBzdGFydCkge1xuXHRcdFx0bGF0ZXN0LmRlbGV0ZUNvdW50ICs9IGRlbGV0ZUNvdW50O1xuXHRcdFx0bGF0ZXN0LnRvSW5zZXJ0LnB1c2goLi4udG9JbnNlcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHN0YXJ0LCBkZWxldGVDb3VudCwgdG9JbnNlcnQgfSk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGJlZm9yZUlkeCA9IDA7XG5cdGxldCBhZnRlcklkeCA9IDA7XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRpZiAoYmVmb3JlSWR4ID09PSBiZWZvcmUubGVuZ3RoKSB7XG5cdFx0XHRwdXNoU3BsaWNlKGJlZm9yZUlkeCwgMCwgYWZ0ZXIuc2xpY2UoYWZ0ZXJJZHgpKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpZiAoYWZ0ZXJJZHggPT09IGFmdGVyLmxlbmd0aCkge1xuXHRcdFx0cHVzaFNwbGljZShiZWZvcmVJZHgsIGJlZm9yZS5sZW5ndGggLSBiZWZvcmVJZHgsIFtdKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJlZm9yZUVsZW1lbnQgPSBiZWZvcmVbYmVmb3JlSWR4XTtcblx0XHRjb25zdCBhZnRlckVsZW1lbnQgPSBhZnRlclthZnRlcklkeF07XG5cdFx0Y29uc3QgbiA9IGNvbXBhcmUoYmVmb3JlRWxlbWVudCwgYWZ0ZXJFbGVtZW50KTtcblx0XHRpZiAobiA9PT0gMCkge1xuXHRcdFx0Ly8gZXF1YWxcblx0XHRcdGJlZm9yZUlkeCArPSAxO1xuXHRcdFx0YWZ0ZXJJZHggKz0gMTtcblx0XHR9IGVsc2UgaWYgKG4gPCAwKSB7XG5cdFx0XHQvLyBiZWZvcmVFbGVtZW50IGlzIHNtYWxsZXIgLT4gYmVmb3JlIGVsZW1lbnQgcmVtb3ZlZFxuXHRcdFx0cHVzaFNwbGljZShiZWZvcmVJZHgsIDEsIFtdKTtcblx0XHRcdGJlZm9yZUlkeCArPSAxO1xuXHRcdH0gZWxzZSBpZiAobiA+IDApIHtcblx0XHRcdC8vIGJlZm9yZUVsZW1lbnQgaXMgZ3JlYXRlciAtPiBhZnRlciBlbGVtZW50IGFkZGVkXG5cdFx0XHRwdXNoU3BsaWNlKGJlZm9yZUlkeCwgMCwgW2FmdGVyRWxlbWVudF0pO1xuXHRcdFx0YWZ0ZXJJZHggKz0gMTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFRha2VzIHR3byAqc29ydGVkKiBhcnJheXMgYW5kIGNvbXB1dGVzIHRoZWlyIGRlbHRhIChyZW1vdmVkLCBhZGRlZCBlbGVtZW50cykuXG4gKiBGaW5pc2hlcyBpbiBgTWF0aC5taW4oYmVmb3JlLmxlbmd0aCwgYWZ0ZXIubGVuZ3RoKWAgc3RlcHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWx0YTxUPihiZWZvcmU6IFJlYWRvbmx5QXJyYXk8VD4sIGFmdGVyOiBSZWFkb25seUFycmF5PFQ+LCBjb21wYXJlOiAoYTogVCwgYjogVCkgPT4gbnVtYmVyKTogeyByZW1vdmVkOiBUW107IGFkZGVkOiBUW10gfSB7XG5cdGNvbnN0IHNwbGljZXMgPSBzb3J0ZWREaWZmKGJlZm9yZSwgYWZ0ZXIsIGNvbXBhcmUpO1xuXHRjb25zdCByZW1vdmVkOiBUW10gPSBbXTtcblx0Y29uc3QgYWRkZWQ6IFRbXSA9IFtdO1xuXG5cdGZvciAoY29uc3Qgc3BsaWNlIG9mIHNwbGljZXMpIHtcblx0XHRyZW1vdmVkLnB1c2goLi4uYmVmb3JlLnNsaWNlKHNwbGljZS5zdGFydCwgc3BsaWNlLnN0YXJ0ICsgc3BsaWNlLmRlbGV0ZUNvdW50KSk7XG5cdFx0YWRkZWQucHVzaCguLi5zcGxpY2UudG9JbnNlcnQpO1xuXHR9XG5cblx0cmV0dXJuIHsgcmVtb3ZlZCwgYWRkZWQgfTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB0b3AgTiBlbGVtZW50cyBmcm9tIHRoZSBhcnJheS5cbiAqXG4gKiBGYXN0ZXIgdGhhbiBzb3J0aW5nIHRoZSBlbnRpcmUgYXJyYXkgd2hlbiB0aGUgYXJyYXkgaXMgYSBsb3QgbGFyZ2VyIHRoYW4gTi5cbiAqXG4gKiBAcGFyYW0gYXJyYXkgVGhlIHVuc29ydGVkIGFycmF5LlxuICogQHBhcmFtIGNvbXBhcmUgQSBzb3J0IGZ1bmN0aW9uIGZvciB0aGUgZWxlbWVudHMuXG4gKiBAcGFyYW0gbiBUaGUgbnVtYmVyIG9mIGVsZW1lbnRzIHRvIHJldHVybi5cbiAqIEByZXR1cm4gVGhlIGZpcnN0IG4gZWxlbWVudHMgZnJvbSBhcnJheSB3aGVuIHNvcnRlZCB3aXRoIGNvbXBhcmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b3A8VD4oYXJyYXk6IFJlYWRvbmx5QXJyYXk8VD4sIGNvbXBhcmU6IChhOiBULCBiOiBUKSA9PiBudW1iZXIsIG46IG51bWJlcik6IFRbXSB7XG5cdGlmIChuID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IGFycmF5LnNsaWNlKDAsIG4pLnNvcnQoY29tcGFyZSk7XG5cdHRvcFN0ZXAoYXJyYXksIGNvbXBhcmUsIHJlc3VsdCwgbiwgYXJyYXkubGVuZ3RoKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBBc3luY2hyb25vdXMgdmFyaWFudCBvZiBgdG9wKClgIGFsbG93aW5nIGZvciBzcGxpdHRpbmcgdXAgd29yayBpbiBiYXRjaGVzIGJldHdlZW4gd2hpY2ggdGhlIGV2ZW50IGxvb3AgY2FuIHJ1bi5cbiAqXG4gKiBSZXR1cm5zIHRoZSB0b3AgTiBlbGVtZW50cyBmcm9tIHRoZSBhcnJheS5cbiAqXG4gKiBGYXN0ZXIgdGhhbiBzb3J0aW5nIHRoZSBlbnRpcmUgYXJyYXkgd2hlbiB0aGUgYXJyYXkgaXMgYSBsb3QgbGFyZ2VyIHRoYW4gTi5cbiAqXG4gKiBAcGFyYW0gYXJyYXkgVGhlIHVuc29ydGVkIGFycmF5LlxuICogQHBhcmFtIGNvbXBhcmUgQSBzb3J0IGZ1bmN0aW9uIGZvciB0aGUgZWxlbWVudHMuXG4gKiBAcGFyYW0gbiBUaGUgbnVtYmVyIG9mIGVsZW1lbnRzIHRvIHJldHVybi5cbiAqIEBwYXJhbSBiYXRjaCBUaGUgbnVtYmVyIG9mIGVsZW1lbnRzIHRvIGV4YW1pbmUgYmVmb3JlIHlpZWxkaW5nIHRvIHRoZSBldmVudCBsb29wLlxuICogQHJldHVybiBUaGUgZmlyc3QgbiBlbGVtZW50cyBmcm9tIGFycmF5IHdoZW4gc29ydGVkIHdpdGggY29tcGFyZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvcEFzeW5jPFQ+KGFycmF5OiBUW10sIGNvbXBhcmU6IChhOiBULCBiOiBUKSA9PiBudW1iZXIsIG46IG51bWJlciwgYmF0Y2g6IG51bWJlciwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VFtdPiB7XG5cdGlmIChuID09PSAwKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdH1cblxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBvID0gYXJyYXkubGVuZ3RoO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXJyYXkuc2xpY2UoMCwgbikuc29ydChjb21wYXJlKTtcblx0XHRcdGZvciAobGV0IGkgPSBuLCBtID0gTWF0aC5taW4obiArIGJhdGNoLCBvKTsgaSA8IG87IGkgPSBtLCBtID0gTWF0aC5taW4obSArIGJhdGNoLCBvKSkge1xuXHRcdFx0XHRpZiAoaSA+IG4pIHtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSkpOyAvLyBhbnkgb3RoZXIgZGVsYXkgZnVuY3Rpb24gd291bGQgc3RhcnZlIEkvT1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b2tlbiAmJiB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRvcFN0ZXAoYXJyYXksIGNvbXBhcmUsIHJlc3VsdCwgaSwgbSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pKClcblx0XHRcdC50aGVuKHJlc29sdmUsIHJlamVjdCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiB0b3BTdGVwPFQ+KGFycmF5OiBSZWFkb25seUFycmF5PFQ+LCBjb21wYXJlOiAoYTogVCwgYjogVCkgPT4gbnVtYmVyLCByZXN1bHQ6IFRbXSwgaTogbnVtYmVyLCBtOiBudW1iZXIpOiB2b2lkIHtcblx0Zm9yIChjb25zdCBuID0gcmVzdWx0Lmxlbmd0aDsgaSA8IG07IGkrKykge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcnJheVtpXTtcblx0XHRpZiAoY29tcGFyZShlbGVtZW50LCByZXN1bHRbbiAtIDFdKSA8IDApIHtcblx0XHRcdHJlc3VsdC5wb3AoKTtcblx0XHRcdGNvbnN0IGogPSBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4ocmVzdWx0LCBlID0+IGNvbXBhcmUoZWxlbWVudCwgZSkgPCAwKTtcblx0XHRcdHJlc3VsdC5zcGxpY2UoaiwgMCwgZWxlbWVudCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQHJldHVybnMgTmV3IGFycmF5IHdpdGggYWxsIGZhbHN5IHZhbHVlcyByZW1vdmVkLiBUaGUgb3JpZ2luYWwgYXJyYXkgSVMgTk9UIG1vZGlmaWVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29hbGVzY2U8VD4oYXJyYXk6IFJlYWRvbmx5QXJyYXk8VCB8IHVuZGVmaW5lZCB8IG51bGw+KTogVFtdIHtcblx0cmV0dXJuIGFycmF5LmZpbHRlcigoZSk6IGUgaXMgVCA9PiAhIWUpO1xufVxuXG4vKipcbiAqIFJlbW92ZSBhbGwgZmFsc3kgdmFsdWVzIGZyb20gYGFycmF5YC4gVGhlIG9yaWdpbmFsIGFycmF5IElTIG1vZGlmaWVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29hbGVzY2VJblBsYWNlPFQ+KGFycmF5OiBBcnJheTxUIHwgdW5kZWZpbmVkIHwgbnVsbD4pOiBhc3NlcnRzIGFycmF5IGlzIEFycmF5PFQ+IHtcblx0bGV0IHRvID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuXHRcdGlmICghIWFycmF5W2ldKSB7XG5cdFx0XHRhcnJheVt0b10gPSBhcnJheVtpXTtcblx0XHRcdHRvICs9IDE7XG5cdFx0fVxuXHR9XG5cdGFycmF5Lmxlbmd0aCA9IHRvO1xufVxuXG4vKipcbiAqIEBkZXByZWNhdGVkIFVzZSBgQXJyYXkuY29weVdpdGhpbmAgaW5zdGVhZFxuICovXG5leHBvcnQgZnVuY3Rpb24gbW92ZShhcnJheTogdW5rbm93bltdLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiB2b2lkIHtcblx0YXJyYXkuc3BsaWNlKHRvLCAwLCBhcnJheS5zcGxpY2UoZnJvbSwgMSlbMF0pO1xufVxuXG4vKipcbiAqIEByZXR1cm5zIGZhbHNlIGlmIHRoZSBwcm92aWRlZCBvYmplY3QgaXMgYW4gYXJyYXkgYW5kIG5vdCBlbXB0eS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRmFsc3lPckVtcHR5KG9iajogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIUFycmF5LmlzQXJyYXkob2JqKSB8fCBvYmoubGVuZ3RoID09PSAwO1xufVxuXG4vKipcbiAqIEByZXR1cm5zIFRydWUgaWYgdGhlIHByb3ZpZGVkIG9iamVjdCBpcyBhbiBhcnJheSBhbmQgaGFzIGF0IGxlYXN0IG9uZSBlbGVtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNOb25FbXB0eUFycmF5PFQ+KG9iajogVFtdIHwgdW5kZWZpbmVkIHwgbnVsbCk6IG9iaiBpcyBUW107XG5leHBvcnQgZnVuY3Rpb24gaXNOb25FbXB0eUFycmF5PFQ+KG9iajogcmVhZG9ubHkgVFtdIHwgdW5kZWZpbmVkIHwgbnVsbCk6IG9iaiBpcyByZWFkb25seSBUW107XG5leHBvcnQgZnVuY3Rpb24gaXNOb25FbXB0eUFycmF5PFQ+KG9iajogVFtdIHwgcmVhZG9ubHkgVFtdIHwgdW5kZWZpbmVkIHwgbnVsbCk6IG9iaiBpcyBUW10gfCByZWFkb25seSBUW10ge1xuXHRyZXR1cm4gQXJyYXkuaXNBcnJheShvYmopICYmIG9iai5sZW5ndGggPiAwO1xufVxuXG4vKipcbiAqIFJlbW92ZXMgZHVwbGljYXRlcyBmcm9tIHRoZSBnaXZlbiBhcnJheS4gVGhlIG9wdGlvbmFsIGtleUZuIGFsbG93cyB0byBzcGVjaWZ5XG4gKiBob3cgZWxlbWVudHMgYXJlIGNoZWNrZWQgZm9yIGVxdWFsaXR5IGJ5IHJldHVybmluZyBhbiBhbHRlcm5hdGUgdmFsdWUgZm9yIGVhY2guXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXN0aW5jdDxUPihhcnJheTogUmVhZG9ubHlBcnJheTxUPiwga2V5Rm46ICh2YWx1ZTogVCkgPT4gdW5rbm93biA9IHZhbHVlID0+IHZhbHVlKTogVFtdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8YW55PigpO1xuXG5cdHJldHVybiBhcnJheS5maWx0ZXIoZWxlbWVudCA9PiB7XG5cdFx0Y29uc3Qga2V5ID0ga2V5Rm4oZWxlbWVudCk7XG5cdFx0aWYgKHNlZW4uaGFzKGtleSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bmlxdWVGaWx0ZXI8VCwgUj4oa2V5Rm46ICh0OiBUKSA9PiBSKTogKHQ6IFQpID0+IGJvb2xlYW4ge1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxSPigpO1xuXG5cdHJldHVybiBlbGVtZW50ID0+IHtcblx0XHRjb25zdCBrZXkgPSBrZXlGbihlbGVtZW50KTtcblxuXHRcdGlmIChzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbW1vblByZWZpeExlbmd0aDxUPihvbmU6IFJlYWRvbmx5QXJyYXk8VD4sIG90aGVyOiBSZWFkb25seUFycmF5PFQ+LCBlcXVhbHM6IChhOiBULCBiOiBUKSA9PiBib29sZWFuID0gKGEsIGIpID0+IGEgPT09IGIpOiBudW1iZXIge1xuXHRsZXQgcmVzdWx0ID0gMDtcblxuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gTWF0aC5taW4ob25lLmxlbmd0aCwgb3RoZXIubGVuZ3RoKTsgaSA8IGxlbiAmJiBlcXVhbHMob25lW2ldLCBvdGhlcltpXSk7IGkrKykge1xuXHRcdHJlc3VsdCsrO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJhbmdlKHRvOiBudW1iZXIpOiBudW1iZXJbXTtcbmV4cG9ydCBmdW5jdGlvbiByYW5nZShmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiBudW1iZXJbXTtcbmV4cG9ydCBmdW5jdGlvbiByYW5nZShhcmc6IG51bWJlciwgdG8/OiBudW1iZXIpOiBudW1iZXJbXSB7XG5cdGxldCBmcm9tID0gdHlwZW9mIHRvID09PSAnbnVtYmVyJyA/IGFyZyA6IDA7XG5cblx0aWYgKHR5cGVvZiB0byA9PT0gJ251bWJlcicpIHtcblx0XHRmcm9tID0gYXJnO1xuXHR9IGVsc2Uge1xuXHRcdGZyb20gPSAwO1xuXHRcdHRvID0gYXJnO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXG5cdGlmIChmcm9tIDw9IHRvKSB7XG5cdFx0Zm9yIChsZXQgaSA9IGZyb207IGkgPCB0bzsgaSsrKSB7XG5cdFx0XHRyZXN1bHQucHVzaChpKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChsZXQgaSA9IGZyb207IGkgPiB0bzsgaS0tKSB7XG5cdFx0XHRyZXN1bHQucHVzaChpKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5kZXg8VD4oYXJyYXk6IFJlYWRvbmx5QXJyYXk8VD4sIGluZGV4ZXI6ICh0OiBUKSA9PiBzdHJpbmcpOiB7IFtrZXk6IHN0cmluZ106IFQgfTtcbmV4cG9ydCBmdW5jdGlvbiBpbmRleDxULCBSPihhcnJheTogUmVhZG9ubHlBcnJheTxUPiwgaW5kZXhlcjogKHQ6IFQpID0+IHN0cmluZywgbWFwcGVyOiAodDogVCkgPT4gUik6IHsgW2tleTogc3RyaW5nXTogUiB9O1xuZXhwb3J0IGZ1bmN0aW9uIGluZGV4PFQsIFI+KGFycmF5OiBSZWFkb25seUFycmF5PFQ+LCBpbmRleGVyOiAodDogVCkgPT4gc3RyaW5nLCBtYXBwZXI/OiAodDogVCkgPT4gUik6IHsgW2tleTogc3RyaW5nXTogUiB9IHtcblx0cmV0dXJuIGFycmF5LnJlZHVjZSgociwgdCkgPT4ge1xuXHRcdHJbaW5kZXhlcih0KV0gPSBtYXBwZXIgPyBtYXBwZXIodCkgOiB0O1xuXHRcdHJldHVybiByO1xuXHR9LCBPYmplY3QuY3JlYXRlKG51bGwpKTtcbn1cblxuLyoqXG4gKiBJbnNlcnRzIGFuIGVsZW1lbnQgaW50byBhbiBhcnJheS4gUmV0dXJucyBhIGZ1bmN0aW9uIHdoaWNoLCB3aGVuXG4gKiBjYWxsZWQsIHdpbGwgcmVtb3ZlIHRoYXQgZWxlbWVudCBmcm9tIHRoZSBhcnJheS5cbiAqXG4gKiBAZGVwcmVjYXRlZCBJbiBhbG1vc3QgYWxsIGNhc2VzLCB1c2UgYSBgU2V0PFQ+YCBpbnN0ZWFkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0PFQ+KGFycmF5OiBUW10sIGVsZW1lbnQ6IFQpOiAoKSA9PiB2b2lkIHtcblx0YXJyYXkucHVzaChlbGVtZW50KTtcblxuXHRyZXR1cm4gKCkgPT4gcmVtb3ZlKGFycmF5LCBlbGVtZW50KTtcbn1cblxuLyoqXG4gKiBSZW1vdmVzIGFuIGVsZW1lbnQgZnJvbSBhbiBhcnJheSBpZiBpdCBjYW4gYmUgZm91bmQuXG4gKlxuICogQGRlcHJlY2F0ZWQgSW4gYWxtb3N0IGFsbCBjYXNlcywgdXNlIGEgYFNldDxUPmAgaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZTxUPihhcnJheTogVFtdLCBlbGVtZW50OiBUKTogVCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGluZGV4ID0gYXJyYXkuaW5kZXhPZihlbGVtZW50KTtcblx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRhcnJheS5zcGxpY2UoaW5kZXgsIDEpO1xuXG5cdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEluc2VydCBgaW5zZXJ0QXJyYCBpbnNpZGUgYHRhcmdldGAgYXQgYGluc2VydEluZGV4YC5cbiAqIFBsZWFzZSBkb24ndCB0b3VjaCB1bmxlc3MgeW91IHVuZGVyc3RhbmQgaHR0cHM6Ly9qc3BlcmYuY29tL2luc2VydGluZy1hbi1hcnJheS13aXRoaW4tYW4tYXJyYXlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFycmF5SW5zZXJ0PFQ+KHRhcmdldDogVFtdLCBpbnNlcnRJbmRleDogbnVtYmVyLCBpbnNlcnRBcnI6IFRbXSk6IFRbXSB7XG5cdGNvbnN0IGJlZm9yZSA9IHRhcmdldC5zbGljZSgwLCBpbnNlcnRJbmRleCk7XG5cdGNvbnN0IGFmdGVyID0gdGFyZ2V0LnNsaWNlKGluc2VydEluZGV4KTtcblx0cmV0dXJuIGJlZm9yZS5jb25jYXQoaW5zZXJ0QXJyLCBhZnRlcik7XG59XG5cbi8qKlxuICogVXNlcyBGaXNoZXItWWF0ZXMgc2h1ZmZsZSB0byBzaHVmZmxlIHRoZSBnaXZlbiBhcnJheVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2h1ZmZsZTxUPihhcnJheTogVFtdLCBfc2VlZD86IG51bWJlcik6IHZvaWQge1xuXHRsZXQgcmFuZDogKCkgPT4gbnVtYmVyO1xuXG5cdGlmICh0eXBlb2YgX3NlZWQgPT09ICdudW1iZXInKSB7XG5cdFx0bGV0IHNlZWQgPSBfc2VlZDtcblx0XHQvLyBTZWVkZWQgcmFuZG9tIG51bWJlciBnZW5lcmF0b3IgaW4gSlMuIE1vZGlmaWVkIGZyb206XG5cdFx0Ly8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNTIxMjk1L3NlZWRpbmctdGhlLXJhbmRvbS1udW1iZXItZ2VuZXJhdG9yLWluLWphdmFzY3JpcHRcblx0XHRyYW5kID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgeCA9IE1hdGguc2luKHNlZWQrKykgKiAxNzk0MjY1NDk7IC8vIHRocm93IGF3YXkgbW9zdCBzaWduaWZpY2FudCBkaWdpdHMgYW5kIHJlZHVjZSBhbnkgcG90ZW50aWFsIGJpYXNcblx0XHRcdHJldHVybiB4IC0gTWF0aC5mbG9vcih4KTtcblx0XHR9O1xuXHR9IGVsc2Uge1xuXHRcdHJhbmQgPSBNYXRoLnJhbmRvbTtcblx0fVxuXG5cdGZvciAobGV0IGkgPSBhcnJheS5sZW5ndGggLSAxOyBpID4gMDsgaSAtPSAxKSB7XG5cdFx0Y29uc3QgaiA9IE1hdGguZmxvb3IocmFuZCgpICogKGkgKyAxKSk7XG5cdFx0Y29uc3QgdGVtcCA9IGFycmF5W2ldO1xuXHRcdGFycmF5W2ldID0gYXJyYXlbal07XG5cdFx0YXJyYXlbal0gPSB0ZW1wO1xuXHR9XG59XG5cbi8qKlxuICogUHVzaGVzIGFuIGVsZW1lbnQgdG8gdGhlIHN0YXJ0IG9mIHRoZSBhcnJheSwgaWYgZm91bmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwdXNoVG9TdGFydDxUPihhcnI6IFRbXSwgdmFsdWU6IFQpOiB2b2lkIHtcblx0Y29uc3QgaW5kZXggPSBhcnIuaW5kZXhPZih2YWx1ZSk7XG5cblx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRhcnIuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRhcnIudW5zaGlmdCh2YWx1ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBQdXNoZXMgYW4gZWxlbWVudCB0byB0aGUgZW5kIG9mIHRoZSBhcnJheSwgaWYgZm91bmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwdXNoVG9FbmQ8VD4oYXJyOiBUW10sIHZhbHVlOiBUKTogdm9pZCB7XG5cdGNvbnN0IGluZGV4ID0gYXJyLmluZGV4T2YodmFsdWUpO1xuXG5cdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0YXJyLnNwbGljZShpbmRleCwgMSk7XG5cdFx0YXJyLnB1c2godmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwdXNoTWFueTxUPihhcnI6IFRbXSwgaXRlbXM6IFJlYWRvbmx5QXJyYXk8VD4pOiB2b2lkIHtcblx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0YXJyLnB1c2goaXRlbSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEFycmF5T3JOb3Q8VCwgVT4oaXRlbXM6IFQgfCBUW10sIGZuOiAoXzogVCkgPT4gVSk6IFUgfCBVW10ge1xuXHRyZXR1cm4gQXJyYXkuaXNBcnJheShpdGVtcykgP1xuXHRcdGl0ZW1zLm1hcChmbikgOlxuXHRcdGZuKGl0ZW1zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEZpbHRlcjxULCBVPihhcnJheTogUmVhZG9ubHlBcnJheTxUPiwgZm46ICh0OiBUKSA9PiBVIHwgdW5kZWZpbmVkKTogVVtdIHtcblx0Y29uc3QgcmVzdWx0OiBVW10gPSBbXTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIGFycmF5KSB7XG5cdFx0Y29uc3QgbWFwcGVkID0gZm4oaXRlbSk7XG5cdFx0aWYgKG1hcHBlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQucHVzaChtYXBwZWQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2l0aG91dER1cGxpY2F0ZXM8VD4oYXJyYXk6IFJlYWRvbmx5QXJyYXk8VD4pOiBUW10ge1xuXHRjb25zdCBzID0gbmV3IFNldChhcnJheSk7XG5cdHJldHVybiBBcnJheS5mcm9tKHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXNBcnJheTxUPih4OiBUIHwgVFtdKTogVFtdO1xuZXhwb3J0IGZ1bmN0aW9uIGFzQXJyYXk8VD4oeDogVCB8IHJlYWRvbmx5IFRbXSk6IHJlYWRvbmx5IFRbXTtcbmV4cG9ydCBmdW5jdGlvbiBhc0FycmF5PFQ+KHg6IFQgfCBUW10pOiBUW10ge1xuXHRyZXR1cm4gQXJyYXkuaXNBcnJheSh4KSA/IHggOiBbeF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSYW5kb21FbGVtZW50PFQ+KGFycjogVFtdKTogVCB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBhcnJbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXJyLmxlbmd0aCldO1xufVxuXG4vKipcbiAqIEluc2VydCB0aGUgbmV3IGl0ZW1zIGluIHRoZSBhcnJheS5cbiAqIEBwYXJhbSBhcnJheSBUaGUgb3JpZ2luYWwgYXJyYXkuXG4gKiBAcGFyYW0gc3RhcnQgVGhlIHplcm8tYmFzZWQgbG9jYXRpb24gaW4gdGhlIGFycmF5IGZyb20gd2hpY2ggdG8gc3RhcnQgaW5zZXJ0aW5nIGVsZW1lbnRzLlxuICogQHBhcmFtIG5ld0l0ZW1zIFRoZSBpdGVtcyB0byBiZSBpbnNlcnRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0SW50bzxUPihhcnJheTogVFtdLCBzdGFydDogbnVtYmVyLCBuZXdJdGVtczogVFtdKTogdm9pZCB7XG5cdGNvbnN0IHN0YXJ0SWR4ID0gZ2V0QWN0dWFsU3RhcnRJbmRleChhcnJheSwgc3RhcnQpO1xuXHRjb25zdCBvcmlnaW5hbExlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0Y29uc3QgbmV3SXRlbXNMZW5ndGggPSBuZXdJdGVtcy5sZW5ndGg7XG5cdGFycmF5Lmxlbmd0aCA9IG9yaWdpbmFsTGVuZ3RoICsgbmV3SXRlbXNMZW5ndGg7XG5cdC8vIE1vdmUgdGhlIGl0ZW1zIGFmdGVyIHRoZSBzdGFydCBpbmRleCwgc3RhcnQgZnJvbSB0aGUgZW5kIHNvIHRoYXQgd2UgZG9uJ3Qgb3ZlcndyaXRlIGFueSB2YWx1ZS5cblx0Zm9yIChsZXQgaSA9IG9yaWdpbmFsTGVuZ3RoIC0gMTsgaSA+PSBzdGFydElkeDsgaS0tKSB7XG5cdFx0YXJyYXlbaSArIG5ld0l0ZW1zTGVuZ3RoXSA9IGFycmF5W2ldO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuZXdJdGVtc0xlbmd0aDsgaSsrKSB7XG5cdFx0YXJyYXlbaSArIHN0YXJ0SWR4XSA9IG5ld0l0ZW1zW2ldO1xuXHR9XG59XG5cbi8qKlxuICogUmVtb3ZlcyBlbGVtZW50cyBmcm9tIGFuIGFycmF5IGFuZCBpbnNlcnRzIG5ldyBlbGVtZW50cyBpbiB0aGVpciBwbGFjZSwgcmV0dXJuaW5nIHRoZSBkZWxldGVkIGVsZW1lbnRzLiBBbHRlcm5hdGl2ZSB0byB0aGUgbmF0aXZlIEFycmF5LnNwbGljZSBtZXRob2QsIGl0XG4gKiBjYW4gb25seSBzdXBwb3J0IGxpbWl0ZWQgbnVtYmVyIG9mIGl0ZW1zIGR1ZSB0byB0aGUgbWF4aW11bSBjYWxsIHN0YWNrIHNpemUgbGltaXQuXG4gKiBAcGFyYW0gYXJyYXkgVGhlIG9yaWdpbmFsIGFycmF5LlxuICogQHBhcmFtIHN0YXJ0IFRoZSB6ZXJvLWJhc2VkIGxvY2F0aW9uIGluIHRoZSBhcnJheSBmcm9tIHdoaWNoIHRvIHN0YXJ0IHJlbW92aW5nIGVsZW1lbnRzLlxuICogQHBhcmFtIGRlbGV0ZUNvdW50IFRoZSBudW1iZXIgb2YgZWxlbWVudHMgdG8gcmVtb3ZlLlxuICogQHJldHVybnMgQW4gYXJyYXkgY29udGFpbmluZyB0aGUgZWxlbWVudHMgdGhhdCB3ZXJlIGRlbGV0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzcGxpY2U8VD4oYXJyYXk6IFRbXSwgc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgbmV3SXRlbXM6IFRbXSk6IFRbXSB7XG5cdGNvbnN0IGluZGV4ID0gZ2V0QWN0dWFsU3RhcnRJbmRleChhcnJheSwgc3RhcnQpO1xuXHRsZXQgcmVzdWx0ID0gYXJyYXkuc3BsaWNlKGluZGV4LCBkZWxldGVDb3VudCk7XG5cdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdC8vIHNlZSBodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9MjYxMTQwXG5cdFx0cmVzdWx0ID0gW107XG5cdH1cblx0aW5zZXJ0SW50byhhcnJheSwgaW5kZXgsIG5ld0l0ZW1zKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmUgdGhlIGFjdHVhbCBzdGFydCBpbmRleCAoc2FtZSBsb2dpYyBhcyB0aGUgbmF0aXZlIHNwbGljZSgpIG9yIHNsaWNlKCkpXG4gKiBJZiBncmVhdGVyIHRoYW4gdGhlIGxlbmd0aCBvZiB0aGUgYXJyYXksIHN0YXJ0IHdpbGwgYmUgc2V0IHRvIHRoZSBsZW5ndGggb2YgdGhlIGFycmF5LiBJbiB0aGlzIGNhc2UsIG5vIGVsZW1lbnQgd2lsbCBiZSBkZWxldGVkIGJ1dCB0aGUgbWV0aG9kIHdpbGwgYmVoYXZlIGFzIGFuIGFkZGluZyBmdW5jdGlvbiwgYWRkaW5nIGFzIG1hbnkgZWxlbWVudCBhcyBpdGVtW24qXSBwcm92aWRlZC5cbiAqIElmIG5lZ2F0aXZlLCBpdCB3aWxsIGJlZ2luIHRoYXQgbWFueSBlbGVtZW50cyBmcm9tIHRoZSBlbmQgb2YgdGhlIGFycmF5LiAoSW4gdGhpcyBjYXNlLCB0aGUgb3JpZ2luIC0xLCBtZWFuaW5nIC1uIGlzIHRoZSBpbmRleCBvZiB0aGUgbnRoIGxhc3QgZWxlbWVudCwgYW5kIGlzIHRoZXJlZm9yZSBlcXVpdmFsZW50IHRvIHRoZSBpbmRleCBvZiBhcnJheS5sZW5ndGggLSBuLikgSWYgYXJyYXkubGVuZ3RoICsgc3RhcnQgaXMgbGVzcyB0aGFuIDAsIGl0IHdpbGwgYmVnaW4gZnJvbSBpbmRleCAwLlxuICogQHBhcmFtIGFycmF5IFRoZSB0YXJnZXQgYXJyYXkuXG4gKiBAcGFyYW0gc3RhcnQgVGhlIG9wZXJhdGlvbiBpbmRleC5cbiAqL1xuZnVuY3Rpb24gZ2V0QWN0dWFsU3RhcnRJbmRleDxUPihhcnJheTogVFtdLCBzdGFydDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIHN0YXJ0IDwgMCA/IE1hdGgubWF4KHN0YXJ0ICsgYXJyYXkubGVuZ3RoLCAwKSA6IE1hdGgubWluKHN0YXJ0LCBhcnJheS5sZW5ndGgpO1xufVxuXG5cblxuLyoqXG4gKiBXaGVuIGNvbXBhcmluZyB0d28gdmFsdWVzLFxuICogYSBuZWdhdGl2ZSBudW1iZXIgaW5kaWNhdGVzIHRoYXQgdGhlIGZpcnN0IHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgc2Vjb25kLFxuICogYSBwb3NpdGl2ZSBudW1iZXIgaW5kaWNhdGVzIHRoYXQgdGhlIGZpcnN0IHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgc2Vjb25kLFxuICogYW5kIHplcm8gaW5kaWNhdGVzIHRoYXQgbmVpdGhlciBpcyB0aGUgY2FzZS5cbiovXG5leHBvcnQgdHlwZSBDb21wYXJlUmVzdWx0ID0gbnVtYmVyO1xuXG5leHBvcnQgbmFtZXNwYWNlIENvbXBhcmVSZXN1bHQge1xuXHRleHBvcnQgZnVuY3Rpb24gaXNMZXNzVGhhbihyZXN1bHQ6IENvbXBhcmVSZXN1bHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmVzdWx0IDwgMDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc0xlc3NUaGFuT3JFcXVhbChyZXN1bHQ6IENvbXBhcmVSZXN1bHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmVzdWx0IDw9IDA7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNHcmVhdGVyVGhhbihyZXN1bHQ6IENvbXBhcmVSZXN1bHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmVzdWx0ID4gMDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc05laXRoZXJMZXNzT3JHcmVhdGVyVGhhbihyZXN1bHQ6IENvbXBhcmVSZXN1bHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmVzdWx0ID09PSAwO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IGdyZWF0ZXJUaGFuID0gMTtcblx0ZXhwb3J0IGNvbnN0IGxlc3NUaGFuID0gLTE7XG5cdGV4cG9ydCBjb25zdCBuZWl0aGVyTGVzc09yR3JlYXRlclRoYW4gPSAwO1xufVxuXG4vKipcbiAqIEEgY29tcGFyYXRvciBgY2AgZGVmaW5lcyBhIHRvdGFsIG9yZGVyIGA8PWAgb24gYFRgIGFzIGZvbGxvd2luZzpcbiAqIGBjKGEsIGIpIDw9IDBgIGlmZiBgYWAgPD0gYGJgLlxuICogV2UgYWxzbyBoYXZlIGBjKGEsIGIpID09IDBgIGlmZiBgYyhiLCBhKSA9PSAwYC5cbiovXG5leHBvcnQgdHlwZSBDb21wYXJhdG9yPFQ+ID0gKGE6IFQsIGI6IFQpID0+IENvbXBhcmVSZXN1bHQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlQnk8VEl0ZW0sIFRDb21wYXJlQnk+KHNlbGVjdG9yOiAoaXRlbTogVEl0ZW0pID0+IFRDb21wYXJlQnksIGNvbXBhcmF0b3I6IENvbXBhcmF0b3I8VENvbXBhcmVCeT4pOiBDb21wYXJhdG9yPFRJdGVtPiB7XG5cdHJldHVybiAoYSwgYikgPT4gY29tcGFyYXRvcihzZWxlY3RvcihhKSwgc2VsZWN0b3IoYikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGllQnJlYWtDb21wYXJhdG9yczxUSXRlbT4oLi4uY29tcGFyYXRvcnM6IENvbXBhcmF0b3I8VEl0ZW0+W10pOiBDb21wYXJhdG9yPFRJdGVtPiB7XG5cdHJldHVybiAoaXRlbTEsIGl0ZW0yKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBjb21wYXJhdG9yIG9mIGNvbXBhcmF0b3JzKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wYXJhdG9yKGl0ZW0xLCBpdGVtMik7XG5cdFx0XHRpZiAoIUNvbXBhcmVSZXN1bHQuaXNOZWl0aGVyTGVzc09yR3JlYXRlclRoYW4ocmVzdWx0KSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gQ29tcGFyZVJlc3VsdC5uZWl0aGVyTGVzc09yR3JlYXRlclRoYW47XG5cdH07XG59XG5cbi8qKlxuICogVGhlIG5hdHVyYWwgb3JkZXIgb24gbnVtYmVycy5cbiovXG5leHBvcnQgY29uc3QgbnVtYmVyQ29tcGFyYXRvcjogQ29tcGFyYXRvcjxudW1iZXI+ID0gKGEsIGIpID0+IGEgLSBiO1xuXG5leHBvcnQgY29uc3QgYm9vbGVhbkNvbXBhcmF0b3I6IENvbXBhcmF0b3I8Ym9vbGVhbj4gPSAoYSwgYikgPT4gbnVtYmVyQ29tcGFyYXRvcihhID8gMSA6IDAsIGIgPyAxIDogMCk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXZlcnNlT3JkZXI8VEl0ZW0+KGNvbXBhcmF0b3I6IENvbXBhcmF0b3I8VEl0ZW0+KTogQ29tcGFyYXRvcjxUSXRlbT4ge1xuXHRyZXR1cm4gKGEsIGIpID0+IC1jb21wYXJhdG9yKGEsIGIpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcgY29tcGFyYXRvciB0aGF0IHRyZWF0cyBgdW5kZWZpbmVkYCBhcyB0aGUgc21hbGxlc3QgdmFsdWUuXG4gKiBBbGwgb3RoZXIgdmFsdWVzIGFyZSBjb21wYXJlZCB1c2luZyB0aGUgZ2l2ZW4gY29tcGFyYXRvci5cbiovXG5leHBvcnQgZnVuY3Rpb24gY29tcGFyZVVuZGVmaW5lZFNtYWxsZXN0PFQ+KGNvbXBhcmF0b3I6IENvbXBhcmF0b3I8VD4pOiBDb21wYXJhdG9yPFQgfCB1bmRlZmluZWQ+IHtcblx0cmV0dXJuIChhLCBiKSA9PiB7XG5cdFx0aWYgKGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGIgPT09IHVuZGVmaW5lZCA/IENvbXBhcmVSZXN1bHQubmVpdGhlckxlc3NPckdyZWF0ZXJUaGFuIDogQ29tcGFyZVJlc3VsdC5sZXNzVGhhbjtcblx0XHR9IGVsc2UgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIENvbXBhcmVSZXN1bHQuZ3JlYXRlclRoYW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBhcmF0b3IoYSwgYik7XG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBBcnJheVF1ZXVlPFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBpdGVtczogcmVhZG9ubHkgVFtdO1xuXHRwcml2YXRlIGZpcnN0SWR4ID0gMDtcblx0cHJpdmF0ZSBsYXN0SWR4OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIENvbnN0cnVjdHMgYSBxdWV1ZSB0aGF0IGlzIGJhY2tlZCBieSB0aGUgZ2l2ZW4gYXJyYXkuIFJ1bnRpbWUgaXMgTygxKS5cblx0Ki9cblx0Y29uc3RydWN0b3IoaXRlbXM6IHJlYWRvbmx5IFRbXSkge1xuXHRcdHRoaXMuaXRlbXMgPSBpdGVtcztcblx0XHR0aGlzLmxhc3RJZHggPSB0aGlzLml0ZW1zLmxlbmd0aCAtIDE7XG5cdH1cblxuXHRnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubGFzdElkeCAtIHRoaXMuZmlyc3RJZHggKyAxO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN1bWVzIGVsZW1lbnRzIGZyb20gdGhlIGJlZ2lubmluZyBvZiB0aGUgcXVldWUgYXMgbG9uZyBhcyB0aGUgcHJlZGljYXRlIHJldHVybnMgdHJ1ZS5cblx0ICogSWYgbm8gZWxlbWVudHMgd2VyZSBjb25zdW1lZCwgYG51bGxgIGlzIHJldHVybmVkLiBIYXMgYSBydW50aW1lIG9mIE8ocmVzdWx0Lmxlbmd0aCkuXG5cdCovXG5cdHRha2VXaGlsZShwcmVkaWNhdGU6ICh2YWx1ZTogVCkgPT4gYm9vbGVhbik6IFRbXSB8IG51bGwge1xuXHRcdC8vIFAoaykgOj0gayA8PSB0aGlzLmxhc3RJZHggJiYgcHJlZGljYXRlKHRoaXMuaXRlbXNba10pXG5cdFx0Ly8gRmluZCBzIDo9IG1pbiB7IGsgfCBrID49IHRoaXMuZmlyc3RJZHggJiYgIVAoaykgfSBhbmQgcmV0dXJuIHRoaXMuZGF0YVt0aGlzLmZpcnN0SWR4Li4ucylcblxuXHRcdGxldCBzdGFydElkeCA9IHRoaXMuZmlyc3RJZHg7XG5cdFx0d2hpbGUgKHN0YXJ0SWR4IDw9IHRoaXMubGFzdElkeCAmJiBwcmVkaWNhdGUodGhpcy5pdGVtc1tzdGFydElkeF0pKSB7XG5cdFx0XHRzdGFydElkeCsrO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBzdGFydElkeCA9PT0gdGhpcy5maXJzdElkeCA/IG51bGwgOiB0aGlzLml0ZW1zLnNsaWNlKHRoaXMuZmlyc3RJZHgsIHN0YXJ0SWR4KTtcblx0XHR0aGlzLmZpcnN0SWR4ID0gc3RhcnRJZHg7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdW1lcyBlbGVtZW50cyBmcm9tIHRoZSBlbmQgb2YgdGhlIHF1ZXVlIGFzIGxvbmcgYXMgdGhlIHByZWRpY2F0ZSByZXR1cm5zIHRydWUuXG5cdCAqIElmIG5vIGVsZW1lbnRzIHdlcmUgY29uc3VtZWQsIGBudWxsYCBpcyByZXR1cm5lZC5cblx0ICogVGhlIHJlc3VsdCBoYXMgdGhlIHNhbWUgb3JkZXIgYXMgdGhlIHVuZGVybHlpbmcgYXJyYXkhXG5cdCovXG5cdHRha2VGcm9tRW5kV2hpbGUocHJlZGljYXRlOiAodmFsdWU6IFQpID0+IGJvb2xlYW4pOiBUW10gfCBudWxsIHtcblx0XHQvLyBQKGspIDo9IHRoaXMuZmlyc3RJZHggPj0gayAmJiBwcmVkaWNhdGUodGhpcy5pdGVtc1trXSlcblx0XHQvLyBGaW5kIHMgOj0gbWF4IHsgayB8IGsgPD0gdGhpcy5sYXN0SWR4ICYmICFQKGspIH0gYW5kIHJldHVybiB0aGlzLmRhdGEocy4uLnRoaXMubGFzdElkeF1cblxuXHRcdGxldCBlbmRJZHggPSB0aGlzLmxhc3RJZHg7XG5cdFx0d2hpbGUgKGVuZElkeCA+PSB0aGlzLmZpcnN0SWR4ICYmIHByZWRpY2F0ZSh0aGlzLml0ZW1zW2VuZElkeF0pKSB7XG5cdFx0XHRlbmRJZHgtLTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gZW5kSWR4ID09PSB0aGlzLmxhc3RJZHggPyBudWxsIDogdGhpcy5pdGVtcy5zbGljZShlbmRJZHggKyAxLCB0aGlzLmxhc3RJZHggKyAxKTtcblx0XHR0aGlzLmxhc3RJZHggPSBlbmRJZHg7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHBlZWsoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pdGVtc1t0aGlzLmZpcnN0SWR4XTtcblx0fVxuXG5cdHBlZWtMYXN0KCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNbdGhpcy5sYXN0SWR4XTtcblx0fVxuXG5cdGRlcXVldWUoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5pdGVtc1t0aGlzLmZpcnN0SWR4XTtcblx0XHR0aGlzLmZpcnN0SWR4Kys7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHJlbW92ZUxhc3QoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5pdGVtc1t0aGlzLmxhc3RJZHhdO1xuXHRcdHRoaXMubGFzdElkeC0tO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHR0YWtlQ291bnQoY291bnQ6IG51bWJlcik6IFRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5pdGVtcy5zbGljZSh0aGlzLmZpcnN0SWR4LCB0aGlzLmZpcnN0SWR4ICsgY291bnQpO1xuXHRcdHRoaXMuZmlyc3RJZHggKz0gY291bnQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG4vKipcbiAqIFRoaXMgY2xhc3MgaXMgZmFzdGVyIHRoYW4gYW4gaXRlcmF0b3IgYW5kIGFycmF5IGZvciBsYXp5IGNvbXB1dGVkIGRhdGEuXG4qL1xuZXhwb3J0IGNsYXNzIENhbGxiYWNrSXRlcmFibGU8VD4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVtcHR5ID0gbmV3IENhbGxiYWNrSXRlcmFibGU8bmV2ZXI+KF9jYWxsYmFjayA9PiB7IH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8qKlxuXHRcdCAqIENhbGxzIHRoZSBjYWxsYmFjayBmb3IgZXZlcnkgaXRlbS5cblx0XHQgKiBTdG9wcyB3aGVuIHRoZSBjYWxsYmFjayByZXR1cm5zIGZhbHNlLlxuXHRcdCovXG5cdFx0cHVibGljIHJlYWRvbmx5IGl0ZXJhdGU6IChjYWxsYmFjazogKGl0ZW06IFQpID0+IGJvb2xlYW4pID0+IHZvaWRcblx0KSB7XG5cdH1cblxuXHRmb3JFYWNoKGhhbmRsZXI6IChpdGVtOiBUKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5pdGVyYXRlKGl0ZW0gPT4geyBoYW5kbGVyKGl0ZW0pOyByZXR1cm4gdHJ1ZTsgfSk7XG5cdH1cblxuXHR0b0FycmF5KCk6IFRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBUW10gPSBbXTtcblx0XHR0aGlzLml0ZXJhdGUoaXRlbSA9PiB7IHJlc3VsdC5wdXNoKGl0ZW0pOyByZXR1cm4gdHJ1ZTsgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZpbHRlcihwcmVkaWNhdGU6IChpdGVtOiBUKSA9PiBib29sZWFuKTogQ2FsbGJhY2tJdGVyYWJsZTxUPiB7XG5cdFx0cmV0dXJuIG5ldyBDYWxsYmFja0l0ZXJhYmxlKGNiID0+IHRoaXMuaXRlcmF0ZShpdGVtID0+IHByZWRpY2F0ZShpdGVtKSA/IGNiKGl0ZW0pIDogdHJ1ZSkpO1xuXHR9XG5cblx0bWFwPFRSZXN1bHQ+KG1hcEZuOiAoaXRlbTogVCkgPT4gVFJlc3VsdCk6IENhbGxiYWNrSXRlcmFibGU8VFJlc3VsdD4ge1xuXHRcdHJldHVybiBuZXcgQ2FsbGJhY2tJdGVyYWJsZTxUUmVzdWx0PihjYiA9PiB0aGlzLml0ZXJhdGUoaXRlbSA9PiBjYihtYXBGbihpdGVtKSkpKTtcblx0fVxuXG5cdHNvbWUocHJlZGljYXRlOiAoaXRlbTogVCkgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGxldCByZXN1bHQgPSBmYWxzZTtcblx0XHR0aGlzLml0ZXJhdGUoaXRlbSA9PiB7IHJlc3VsdCA9IHByZWRpY2F0ZShpdGVtKTsgcmV0dXJuICFyZXN1bHQ7IH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRmaW5kRmlyc3QocHJlZGljYXRlOiAoaXRlbTogVCkgPT4gYm9vbGVhbik6IFQgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IFQgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pdGVyYXRlKGl0ZW0gPT4ge1xuXHRcdFx0aWYgKHByZWRpY2F0ZShpdGVtKSkge1xuXHRcdFx0XHRyZXN1bHQgPSBpdGVtO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZmluZExhc3QocHJlZGljYXRlOiAoaXRlbTogVCkgPT4gYm9vbGVhbik6IFQgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IFQgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pdGVyYXRlKGl0ZW0gPT4ge1xuXHRcdFx0aWYgKHByZWRpY2F0ZShpdGVtKSkge1xuXHRcdFx0XHRyZXN1bHQgPSBpdGVtO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZpbmRMYXN0TWF4QnkoY29tcGFyYXRvcjogQ29tcGFyYXRvcjxUPik6IFQgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IFQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZpcnN0ID0gdHJ1ZTtcblx0XHR0aGlzLml0ZXJhdGUoaXRlbSA9PiB7XG5cdFx0XHRpZiAoZmlyc3QgfHwgQ29tcGFyZVJlc3VsdC5pc0dyZWF0ZXJUaGFuKGNvbXBhcmF0b3IoaXRlbSwgcmVzdWx0ISkpKSB7XG5cdFx0XHRcdGZpcnN0ID0gZmFsc2U7XG5cdFx0XHRcdHJlc3VsdCA9IGl0ZW07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHJlLWFycmFuZ2VtZW50IG9mIGl0ZW1zIGluIGFuIGFycmF5LlxuICovXG5leHBvcnQgY2xhc3MgUGVybXV0YXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9pbmRleE1hcDogcmVhZG9ubHkgbnVtYmVyW10pIHsgfVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgcGVybXV0YXRpb24gdGhhdCBzb3J0cyB0aGUgZ2l2ZW4gYXJyYXkgYWNjb3JkaW5nIHRvIHRoZSBnaXZlbiBjb21wYXJlIGZ1bmN0aW9uLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjcmVhdGVTb3J0UGVybXV0YXRpb248VD4oYXJyOiByZWFkb25seSBUW10sIGNvbXBhcmVGbjogKGE6IFQsIGI6IFQpID0+IG51bWJlcik6IFBlcm11dGF0aW9uIHtcblx0XHRjb25zdCBzb3J0SW5kaWNlcyA9IEFycmF5LmZyb20oYXJyLmtleXMoKSkuc29ydCgoaW5kZXgxLCBpbmRleDIpID0+IGNvbXBhcmVGbihhcnJbaW5kZXgxXSwgYXJyW2luZGV4Ml0pKTtcblx0XHRyZXR1cm4gbmV3IFBlcm11dGF0aW9uKHNvcnRJbmRpY2VzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgbmV3IGFycmF5IHdpdGggdGhlIGVsZW1lbnRzIG9mIHRoZSBnaXZlbiBhcnJheSByZS1hcnJhbmdlZCBhY2NvcmRpbmcgdG8gdGhpcyBwZXJtdXRhdGlvbi5cblx0ICovXG5cdGFwcGx5PFQ+KGFycjogcmVhZG9ubHkgVFtdKTogVFtdIHtcblx0XHRyZXR1cm4gYXJyLm1hcCgoXywgaW5kZXgpID0+IGFyclt0aGlzLl9pbmRleE1hcFtpbmRleF1dKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgbmV3IHBlcm11dGF0aW9uIHRoYXQgdW5kb2VzIHRoZSByZS1hcnJhbmdlbWVudCBvZiB0aGlzIHBlcm11dGF0aW9uLlxuXHQqL1xuXHRpbnZlcnNlKCk6IFBlcm11dGF0aW9uIHtcblx0XHRjb25zdCBpbnZlcnNlSW5kZXhNYXAgPSB0aGlzLl9pbmRleE1hcC5zbGljZSgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5faW5kZXhNYXAubGVuZ3RoOyBpKyspIHtcblx0XHRcdGludmVyc2VJbmRleE1hcFt0aGlzLl9pbmRleE1hcFtpXV0gPSBpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFBlcm11dGF0aW9uKGludmVyc2VJbmRleE1hcCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBc3luY2hyb25vdXMgdmFyaWFudCBvZiBgQXJyYXkuZmluZCgpYCwgcmV0dXJuaW5nIHRoZSBmaXJzdCBlbGVtZW50IGluXG4gKiB0aGUgYXJyYXkgZm9yIHdoaWNoIHRoZSBwcmVkaWNhdGUgcmV0dXJucyB0cnVlLlxuICpcbiAqIFRoaXMgaW1wbGVtZW50YXRpb24gZG9lcyBub3QgYmFpbCBlYXJseSBhbmQgd2FpdHMgZm9yIGFsbCBwcm9taXNlcyB0b1xuICogcmVzb2x2ZSBiZWZvcmUgcmV0dXJuaW5nLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZEFzeW5jPFQ+KGFycmF5OiByZWFkb25seSBUW10sIHByZWRpY2F0ZTogKGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIpID0+IFByb21pc2U8Ym9vbGVhbj4pOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGFycmF5Lm1hcChcblx0XHRhc3luYyAoZWxlbWVudCwgaW5kZXgpID0+ICh7IGVsZW1lbnQsIG9rOiBhd2FpdCBwcmVkaWNhdGUoZWxlbWVudCwgaW5kZXgpIH0pXG5cdCkpO1xuXG5cdHJldHVybiByZXN1bHRzLmZpbmQociA9PiByLm9rKT8uZWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN1bShhcnJheTogcmVhZG9ubHkgbnVtYmVyW10pOiBudW1iZXIge1xuXHRyZXR1cm4gYXJyYXkucmVkdWNlKChhY2MsIHZhbHVlKSA9PiBhY2MgKyB2YWx1ZSwgMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdW1CeTxUPihhcnJheTogcmVhZG9ubHkgVFtdLCBzZWxlY3RvcjogKHZhbHVlOiBUKSA9PiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gYXJyYXkucmVkdWNlKChhY2MsIHZhbHVlKSA9PiBhY2MgKyBzZWxlY3Rvcih2YWx1ZSksIDApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBUyx5QkFBeUI7QUFZM0IsU0FBUyxLQUFRLEtBQW9CO0FBQzNDLE1BQUksSUFBSSxXQUFXLEdBQUc7QUFDckIsVUFBTSxJQUFJLE1BQU0sbUJBQW1CO0FBQUEsRUFDcEM7QUFFQSxTQUFPLENBQUMsSUFBSSxNQUFNLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxJQUFJLElBQUksU0FBUyxDQUFDLENBQUM7QUFDMUQ7QUFFTyxTQUFTLE9BQVUsS0FBbUMsT0FBcUMsYUFBc0MsQ0FBQyxHQUFHLE1BQU0sTUFBTSxHQUFZO0FBQ25LLE1BQUksUUFBUSxPQUFPO0FBQ2xCLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxDQUFD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MEM7QUFDdkQsUUFBSTtBQUNKLFFBQUksUUFBUTtBQUNaLFNBQUssUUFBUSxVQUFRO0FBQ3BCLFVBQUksU0FBUyxjQUFjLGNBQWMsV0FBVyxNQUFNLE1BQU8sQ0FBQyxHQUFHO0FBQ3BFLGdCQUFRO0FBQ1IsaUJBQVM7QUFBQSxNQUNWO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF2RWEsa0JBQ1csUUFBUSxJQUFJLGtCQUF3QixlQUFhO0FBQUUsQ0FBQztBQURyRSxJQUFNLG1CQUFOO0FBNEVBLE1BQU0sWUFBWTtBQUFBLEVBQ3hCLFlBQTZCLFdBQThCO0FBQTlCO0FBQUEsRUFBZ0M7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUs3RCxPQUFjLHNCQUF5QixLQUFtQixXQUFnRDtBQUN6RyxVQUFNLGNBQWMsTUFBTSxLQUFLLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsV0FBVyxVQUFVLElBQUksTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLENBQUM7QUFDdkcsV0FBTyxJQUFJLFlBQVksV0FBVztBQUFBLEVBQ25DO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFTLEtBQXdCO0FBQ2hDLFdBQU8sSUFBSSxJQUFJLENBQUMsR0FBR0osV0FBVSxJQUFJLEtBQUssVUFBVUEsTUFBSyxDQUFDLENBQUM7QUFBQSxFQUN4RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBdUI7QUFDdEIsVUFBTSxrQkFBa0IsS0FBSyxVQUFVLE1BQU07QUFDN0MsYUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFVBQVUsUUFBUSxLQUFLO0FBQy9DLHNCQUFnQixLQUFLLFVBQVUsQ0FBQyxDQUFDLElBQUk7QUFBQSxJQUN0QztBQUNBLFdBQU8sSUFBSSxZQUFZLGVBQWU7QUFBQSxFQUN2QztBQUNEO0FBU0EsZUFBc0IsVUFBYSxPQUFxQixXQUFvRjtBQUMzSSxRQUFNLFVBQVUsTUFBTSxRQUFRLElBQUksTUFBTTtBQUFBLElBQ3ZDLE9BQU8sU0FBU0EsWUFBVyxFQUFFLFNBQVMsSUFBSSxNQUFNLFVBQVUsU0FBU0EsTUFBSyxFQUFFO0FBQUEsRUFDM0UsQ0FBQztBQUVELFNBQU8sUUFBUSxLQUFLLE9BQUssRUFBRSxFQUFFLEdBQUc7QUFDakM7QUFFTyxTQUFTLElBQUksT0FBa0M7QUFDckQsU0FBTyxNQUFNLE9BQU8sQ0FBQyxLQUFLLFVBQVUsTUFBTSxPQUFPLENBQUM7QUFDbkQ7QUFFTyxTQUFTLE1BQVMsT0FBcUIsVUFBd0M7QUFDckYsU0FBTyxNQUFNLE9BQU8sQ0FBQyxLQUFLLFVBQVUsTUFBTSxTQUFTLEtBQUssR0FBRyxDQUFDO0FBQzdEOyIsCiAgIm5hbWVzIjogWyJpbmRleCIsICJzcGxpY2UiLCAicmVzb2x2ZSIsICJlcXVhbHMiLCAiQ29tcGFyZVJlc3VsdCJdCn0K
