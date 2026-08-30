import assert from "assert";
import { toUint32 } from "../../../../base/common/uint.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ConstantTimePrefixSumComputer, PrefixSumComputer, PrefixSumIndexOfResult } from "../../../common/model/prefixSumComputer.js";
function toUint32Array(arr) {
  const len = arr.length;
  const r = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    r[i] = toUint32(arr[i]);
  }
  return r;
}
function createBoth(values) {
  const psc = new PrefixSumComputer(toUint32Array(values));
  const wrapped = {
    getTotalSum: () => psc.getTotalSum(),
    getPrefixSum: (count) => count === 0 ? 0 : psc.getPrefixSum(count - 1),
    getIndexOf: (sum) => psc.getIndexOf(sum),
    setValue: (index, value) => {
      psc.setValue(index, value);
    },
    insertValues: (insertIndex, insertArr) => {
      psc.insertValues(insertIndex, toUint32Array(insertArr));
    },
    removeValues: (start, deleteCount) => {
      psc.removeValues(start, deleteCount);
    }
  };
  const ct = new ConstantTimePrefixSumComputer([...values]);
  const wrappedCt = {
    getTotalSum: () => ct.getTotalSum(),
    getPrefixSum: (count) => ct.getPrefixSum(count),
    getIndexOf: (sum) => ct.getIndexOf(sum),
    setValue: (index, value) => {
      ct.setValue(index, value);
    },
    insertValues: (insertIndex, insertArr) => {
      ct.insertValues(insertIndex, insertArr);
    },
    removeValues: (start, deleteCount) => {
      ct.removeValues(start, deleteCount);
    }
  };
  return [wrapped, wrappedCt];
}
function forBoth(values, callback) {
  for (const psc of createBoth(values)) {
    callback(psc);
  }
}
suite("Editor ViewModel - PrefixSumComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("comprehensive setValue and getIndexOf", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 8);
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 4);
      assert.strictEqual(psc.getPrefixSum(4), 5);
      assert.strictEqual(psc.getPrefixSum(5), 8);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(7), new PrefixSumIndexOfResult(4, 2));
      assert.deepStrictEqual(psc.getIndexOf(8), new PrefixSumIndexOfResult(4, 3));
      psc.setValue(1, 2);
      assert.strictEqual(psc.getTotalSum(), 9);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
      assert.strictEqual(psc.getPrefixSum(3), 5);
      assert.strictEqual(psc.getPrefixSum(4), 6);
      assert.strictEqual(psc.getPrefixSum(5), 9);
      psc.setValue(1, 0);
      assert.strictEqual(psc.getTotalSum(), 7);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 3);
      assert.strictEqual(psc.getPrefixSum(4), 4);
      assert.strictEqual(psc.getPrefixSum(5), 7);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 2));
      psc.setValue(2, 0);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 1);
      assert.strictEqual(psc.getPrefixSum(4), 2);
      assert.strictEqual(psc.getPrefixSum(5), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(4, 2));
      psc.setValue(3, 0);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 1);
      assert.strictEqual(psc.getPrefixSum(4), 1);
      assert.strictEqual(psc.getPrefixSum(5), 4);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 2));
      psc.setValue(1, 1);
      psc.setValue(3, 1);
      psc.setValue(4, 1);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 2);
      assert.strictEqual(psc.getPrefixSum(4), 3);
      assert.strictEqual(psc.getPrefixSum(5), 4);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 0));
    });
  });
  test("getTotalSum with typical values", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => assert.strictEqual(psc.getTotalSum(), 8));
    forBoth([10], (psc) => assert.strictEqual(psc.getTotalSum(), 10));
    forBoth([5, 5, 5], (psc) => assert.strictEqual(psc.getTotalSum(), 15));
  });
  test("getTotalSum with all zeroes", () => {
    forBoth([0, 0, 0], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
    forBoth([0], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
  });
  test("getTotalSum with empty array", () => {
    forBoth([], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
  });
  test("getTotalSum with single element", () => {
    forBoth([0], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
    forBoth([1], (psc) => assert.strictEqual(psc.getTotalSum(), 1));
    forBoth([100], (psc) => assert.strictEqual(psc.getTotalSum(), 100));
  });
  test("getPrefixSum with typical values", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 4);
      assert.strictEqual(psc.getPrefixSum(4), 5);
      assert.strictEqual(psc.getPrefixSum(5), 8);
    });
  });
  test("getPrefixSum with all zeroes", () => {
    forBoth([0, 0, 0], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 0);
      assert.strictEqual(psc.getPrefixSum(2), 0);
      assert.strictEqual(psc.getPrefixSum(3), 0);
    });
  });
  test("getPrefixSum with single element", () => {
    forBoth([7], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 7);
    });
  });
  test("getPrefixSum with empty array", () => {
    forBoth([], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
    });
  });
  test("getPrefixSum with leading/trailing zeroes", () => {
    forBoth([0, 0, 3, 0, 0], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 0);
      assert.strictEqual(psc.getPrefixSum(2), 0);
      assert.strictEqual(psc.getPrefixSum(3), 3);
      assert.strictEqual(psc.getPrefixSum(4), 3);
      assert.strictEqual(psc.getPrefixSum(5), 3);
    });
  });
  test("getIndexOf with typical values", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(7), new PrefixSumIndexOfResult(4, 2));
      assert.deepStrictEqual(psc.getIndexOf(8), new PrefixSumIndexOfResult(4, 3));
    });
  });
  test("getIndexOf with all zeroes", () => {
    forBoth([0, 0, 0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("getIndexOf with single zero", () => {
    forBoth([0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
    });
  });
  test("getIndexOf with single element", () => {
    forBoth([5], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(0, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
    });
  });
  test("getIndexOf with leading zeroes", () => {
    forBoth([0, 0, 3], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 2));
    });
  });
  test("getIndexOf with trailing zeroes", () => {
    forBoth([3, 0, 0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(0, 1));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(0, 2));
    });
  });
  test("getIndexOf with interleaved zeroes", () => {
    forBoth([0, 1, 0, 2, 0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(3, 1));
    });
  });
  test("getIndexOf with all ones", () => {
    forBoth([1, 1, 1, 1, 1], (psc) => {
      for (let i = 0; i < 5; i++) {
        assert.deepStrictEqual(psc.getIndexOf(i), new PrefixSumIndexOfResult(i, 0));
      }
    });
  });
  test("getIndexOf with large value in single element", () => {
    forBoth([1e3], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(500), new PrefixSumIndexOfResult(0, 500));
      assert.deepStrictEqual(psc.getIndexOf(999), new PrefixSumIndexOfResult(0, 999));
    });
  });
  test("setValue no-op when value unchanged", () => {
    forBoth([1, 2, 3], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 6);
      psc.setValue(1, 2);
      assert.strictEqual(psc.getTotalSum(), 6);
    });
  });
  test("setValue increase", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(1, 5);
      assert.strictEqual(psc.getTotalSum(), 9);
      assert.strictEqual(psc.getPrefixSum(2), 6);
      assert.strictEqual(psc.getPrefixSum(3), 9);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 4));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue decrease", () => {
    forBoth([1, 5, 3], (psc) => {
      psc.setValue(1, 2);
      assert.strictEqual(psc.getTotalSum(), 6);
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 1));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue to zero", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(1, 0);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue from zero", () => {
    forBoth([0, 0, 0], (psc) => {
      psc.setValue(1, 3);
      assert.strictEqual(psc.getTotalSum(), 3);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 2));
    });
  });
  test("setValue on first element", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(0, 10);
      assert.strictEqual(psc.getTotalSum(), 15);
      assert.strictEqual(psc.getPrefixSum(1), 10);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(9), new PrefixSumIndexOfResult(0, 9));
      assert.deepStrictEqual(psc.getIndexOf(10), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("setValue on last element", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(2, 10);
      assert.strictEqual(psc.getTotalSum(), 13);
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(12), new PrefixSumIndexOfResult(2, 9));
    });
  });
  test("set all values to zero then restore", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(0, 0);
      psc.setValue(1, 0);
      psc.setValue(2, 0);
      assert.strictEqual(psc.getTotalSum(), 0);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
      psc.setValue(0, 4);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(0, 3));
    });
  });
  test("setValue multiple times on same index", () => {
    forBoth([1, 1, 1], (psc) => {
      psc.setValue(1, 5);
      psc.setValue(1, 2);
      psc.setValue(1, 10);
      assert.strictEqual(psc.getTotalSum(), 12);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(10), new PrefixSumIndexOfResult(1, 9));
      assert.deepStrictEqual(psc.getIndexOf(11), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("insertValues at beginning", () => {
    forBoth([3, 4], (psc) => {
      psc.insertValues(0, [1, 2]);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
      assert.strictEqual(psc.getPrefixSum(3), 6);
      assert.strictEqual(psc.getPrefixSum(4), 10);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("insertValues at end", () => {
    forBoth([1, 2], (psc) => {
      psc.insertValues(2, [3, 4]);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.strictEqual(psc.getPrefixSum(3), 6);
      assert.strictEqual(psc.getPrefixSum(4), 10);
    });
  });
  test("insertValues in the middle", () => {
    forBoth([1, 4], (psc) => {
      psc.insertValues(1, [2, 3]);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
      assert.strictEqual(psc.getPrefixSum(3), 6);
      assert.strictEqual(psc.getPrefixSum(4), 10);
    });
  });
  test("insertValues with zeroes", () => {
    forBoth([1, 2], (psc) => {
      psc.insertValues(1, [0, 0]);
      assert.strictEqual(psc.getTotalSum(), 3);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 1);
      assert.strictEqual(psc.getPrefixSum(4), 3);
    });
  });
  test("insertValues into all-zeroes", () => {
    forBoth([0, 0, 0], (psc) => {
      psc.insertValues(1, [2, 3]);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.strictEqual(psc.getPrefixSum(1), 0);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(2, 2));
    });
  });
  test("insertValues into empty computer", () => {
    forBoth([], (psc) => {
      psc.insertValues(0, [5, 3]);
      assert.strictEqual(psc.getTotalSum(), 8);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("removeValues from beginning", () => {
    forBoth([1, 2, 3, 4], (psc) => {
      psc.removeValues(0, 2);
      assert.strictEqual(psc.getTotalSum(), 7);
      assert.strictEqual(psc.getPrefixSum(1), 3);
      assert.strictEqual(psc.getPrefixSum(2), 7);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("removeValues from end", () => {
    forBoth([1, 2, 3, 4], (psc) => {
      psc.removeValues(2, 2);
      assert.strictEqual(psc.getTotalSum(), 3);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
    });
  });
  test("removeValues from the middle", () => {
    forBoth([1, 2, 3, 4], (psc) => {
      psc.removeValues(1, 2);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(1, 3));
    });
  });
  test("removeValues all", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.removeValues(0, 3);
      assert.strictEqual(psc.getTotalSum(), 0);
    });
  });
  test("removeValues single element", () => {
    forBoth([5, 10, 15], (psc) => {
      psc.removeValues(1, 1);
      assert.strictEqual(psc.getTotalSum(), 20);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(19), new PrefixSumIndexOfResult(1, 14));
    });
  });
  test("removeValues zero-valued elements", () => {
    forBoth([0, 0, 5, 0, 0], (psc) => {
      psc.removeValues(0, 2);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
    });
  });
  test("insert then remove", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.insertValues(1, [10, 20]);
      assert.strictEqual(psc.getTotalSum(), 36);
      psc.removeValues(1, 2);
      assert.strictEqual(psc.getTotalSum(), 6);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("remove then insert at same position", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.removeValues(1, 1);
      psc.insertValues(1, [5]);
      assert.strictEqual(psc.getTotalSum(), 9);
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 4));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue then insert then remove", () => {
    forBoth([1, 1, 1], (psc) => {
      psc.setValue(0, 5);
      psc.insertValues(1, [10]);
      psc.removeValues(3, 1);
      assert.strictEqual(psc.getTotalSum(), 16);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(14), new PrefixSumIndexOfResult(1, 9));
      assert.deepStrictEqual(psc.getIndexOf(15), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("multiple queries between mutations are consistent", () => {
    forBoth([2, 3, 5], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      psc.setValue(1, 0);
      assert.strictEqual(psc.getTotalSum(), 7);
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      psc.setValue(1, 3);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("large values", () => {
    forBoth([100, 200, 300], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 600);
      assert.strictEqual(psc.getPrefixSum(1), 100);
      assert.strictEqual(psc.getPrefixSum(2), 300);
      assert.strictEqual(psc.getPrefixSum(3), 600);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(99), new PrefixSumIndexOfResult(0, 99));
      assert.deepStrictEqual(psc.getIndexOf(100), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(299), new PrefixSumIndexOfResult(1, 199));
      assert.deepStrictEqual(psc.getIndexOf(300), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(599), new PrefixSumIndexOfResult(2, 299));
    });
  });
  test("many elements", () => {
    forBoth(new Array(100).fill(1), (psc) => {
      assert.strictEqual(psc.getTotalSum(), 100);
      assert.strictEqual(psc.getPrefixSum(50), 50);
      for (let i = 0; i < 100; i++) {
        assert.deepStrictEqual(psc.getIndexOf(i), new PrefixSumIndexOfResult(i, 0));
      }
    });
  });
  test("many elements all zeroes", () => {
    forBoth(new Array(100).fill(0), (psc) => {
      assert.strictEqual(psc.getTotalSum(), 0);
      for (let i = 0; i <= 100; i++) {
        assert.strictEqual(psc.getPrefixSum(i), 0);
      }
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(99, 0));
    });
  });
  test("setValue between queries re-validates correctly", () => {
    forBoth([1, 1, 1, 1, 1], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 5);
      psc.setValue(2, 10);
      assert.strictEqual(psc.getTotalSum(), 14);
      assert.strictEqual(psc.getPrefixSum(3), 12);
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(11), new PrefixSumIndexOfResult(2, 9));
      assert.deepStrictEqual(psc.getIndexOf(12), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(13), new PrefixSumIndexOfResult(4, 0));
      psc.setValue(0, 0);
      assert.strictEqual(psc.getTotalSum(), 13);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcdmlld01vZGVsXFxwcmVmaXhTdW1Db21wdXRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdG9VaW50MzIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRUaW1lUHJlZml4U3VtQ29tcHV0ZXIsIFByZWZpeFN1bUNvbXB1dGVyLCBQcmVmaXhTdW1JbmRleE9mUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3ByZWZpeFN1bUNvbXB1dGVyLmpzJztcblxuaW50ZXJmYWNlIElQcmVmaXhTdW1Db21wdXRlciB7XG5cdGdldFRvdGFsU3VtKCk6IG51bWJlcjtcblx0LyoqXG5cdCAqIFJldHVybnMgc3VtIG9mIGZpcnN0IGBjb3VudGAgdmFsdWVzOiBTVU0oMCA8PSBqIDwgY291bnQsIHZhbHVlc1tqXSkuXG5cdCAqL1xuXHRnZXRQcmVmaXhTdW0oY291bnQ6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0SW5kZXhPZihzdW06IG51bWJlcik6IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQ7XG5cdHNldFZhbHVlKGluZGV4OiBudW1iZXIsIHZhbHVlOiBudW1iZXIpOiB2b2lkO1xuXHRpbnNlcnRWYWx1ZXMoaW5zZXJ0SW5kZXg6IG51bWJlciwgaW5zZXJ0QXJyOiBudW1iZXJbXSk6IHZvaWQ7XG5cdHJlbW92ZVZhbHVlcyhzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gdG9VaW50MzJBcnJheShhcnI6IG51bWJlcltdKTogVWludDMyQXJyYXkge1xuXHRjb25zdCBsZW4gPSBhcnIubGVuZ3RoO1xuXHRjb25zdCByID0gbmV3IFVpbnQzMkFycmF5KGxlbik7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcblx0XHRyW2ldID0gdG9VaW50MzIoYXJyW2ldKTtcblx0fVxuXHRyZXR1cm4gcjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQm90aCh2YWx1ZXM6IG51bWJlcltdKTogSVByZWZpeFN1bUNvbXB1dGVyW10ge1xuXHRjb25zdCBwc2MgPSBuZXcgUHJlZml4U3VtQ29tcHV0ZXIodG9VaW50MzJBcnJheSh2YWx1ZXMpKTtcblx0Y29uc3Qgd3JhcHBlZDogSVByZWZpeFN1bUNvbXB1dGVyID0ge1xuXHRcdGdldFRvdGFsU3VtOiAoKSA9PiBwc2MuZ2V0VG90YWxTdW0oKSxcblx0XHRnZXRQcmVmaXhTdW06IChjb3VudDogbnVtYmVyKSA9PiBjb3VudCA9PT0gMCA/IDAgOiBwc2MuZ2V0UHJlZml4U3VtKGNvdW50IC0gMSksXG5cdFx0Z2V0SW5kZXhPZjogKHN1bTogbnVtYmVyKSA9PiBwc2MuZ2V0SW5kZXhPZihzdW0pLFxuXHRcdHNldFZhbHVlOiAoaW5kZXg6IG51bWJlciwgdmFsdWU6IG51bWJlcikgPT4geyBwc2Muc2V0VmFsdWUoaW5kZXgsIHZhbHVlKTsgfSxcblx0XHRpbnNlcnRWYWx1ZXM6IChpbnNlcnRJbmRleDogbnVtYmVyLCBpbnNlcnRBcnI6IG51bWJlcltdKSA9PiB7IHBzYy5pbnNlcnRWYWx1ZXMoaW5zZXJ0SW5kZXgsIHRvVWludDMyQXJyYXkoaW5zZXJ0QXJyKSk7IH0sXG5cdFx0cmVtb3ZlVmFsdWVzOiAoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlcikgPT4geyBwc2MucmVtb3ZlVmFsdWVzKHN0YXJ0LCBkZWxldGVDb3VudCk7IH0sXG5cdH07XG5cdGNvbnN0IGN0ID0gbmV3IENvbnN0YW50VGltZVByZWZpeFN1bUNvbXB1dGVyKFsuLi52YWx1ZXNdKTtcblx0Y29uc3Qgd3JhcHBlZEN0OiBJUHJlZml4U3VtQ29tcHV0ZXIgPSB7XG5cdFx0Z2V0VG90YWxTdW06ICgpID0+IGN0LmdldFRvdGFsU3VtKCksXG5cdFx0Z2V0UHJlZml4U3VtOiAoY291bnQ6IG51bWJlcikgPT4gY3QuZ2V0UHJlZml4U3VtKGNvdW50KSxcblx0XHRnZXRJbmRleE9mOiAoc3VtOiBudW1iZXIpID0+IGN0LmdldEluZGV4T2Yoc3VtKSxcblx0XHRzZXRWYWx1ZTogKGluZGV4OiBudW1iZXIsIHZhbHVlOiBudW1iZXIpID0+IHsgY3Quc2V0VmFsdWUoaW5kZXgsIHZhbHVlKTsgfSxcblx0XHRpbnNlcnRWYWx1ZXM6IChpbnNlcnRJbmRleDogbnVtYmVyLCBpbnNlcnRBcnI6IG51bWJlcltdKSA9PiB7IGN0Lmluc2VydFZhbHVlcyhpbnNlcnRJbmRleCwgaW5zZXJ0QXJyKTsgfSxcblx0XHRyZW1vdmVWYWx1ZXM6IChzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyKSA9PiB7IGN0LnJlbW92ZVZhbHVlcyhzdGFydCwgZGVsZXRlQ291bnQpOyB9LFxuXHR9O1xuXHRyZXR1cm4gW3dyYXBwZWQsIHdyYXBwZWRDdF07XG59XG5cbmZ1bmN0aW9uIGZvckJvdGgodmFsdWVzOiBudW1iZXJbXSwgY2FsbGJhY2s6IChwc2M6IElQcmVmaXhTdW1Db21wdXRlcikgPT4gdm9pZCk6IHZvaWQge1xuXHRmb3IgKGNvbnN0IHBzYyBvZiBjcmVhdGVCb3RoKHZhbHVlcykpIHtcblx0XHRjYWxsYmFjayhwc2MpO1xuXHR9XG59XG5cbnN1aXRlKCdFZGl0b3IgVmlld01vZGVsIC0gUHJlZml4U3VtQ29tcHV0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY29tcHJlaGVuc2l2ZSBzZXRWYWx1ZSBhbmQgZ2V0SW5kZXhPZicsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAyLCAxLCAzXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgOCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg1KSwgOCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgzLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDYpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDcpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAyKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDgpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAzKSk7XG5cblx0XHRcdC8vIFsxLCAyLCAyLCAxLCAzXVxuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDUpLCA5KTtcblxuXHRcdFx0Ly8gWzEsIDAsIDIsIDEsIDNdXG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNSksIDcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig1KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig2KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMikpO1xuXG5cdFx0XHQvLyBbMSwgMCwgMCwgMSwgM11cblx0XHRcdHBzYy5zZXRWYWx1ZSgyLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg1KSwgNSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgzLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAyKSk7XG5cblx0XHRcdC8vIFsxLCAwLCAwLCAwLCAzXVxuXHRcdFx0cHNjLnNldFZhbHVlKDMsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDUpLCA0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDIpKTtcblxuXHRcdFx0Ly8gWzEsIDEsIDAsIDEsIDFdXG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMSk7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMywgMSk7XG5cdFx0XHRwc2Muc2V0VmFsdWUoNCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNSksIDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gZ2V0VG90YWxTdW0gLS0tXG5cblx0dGVzdCgnZ2V0VG90YWxTdW0gd2l0aCB0eXBpY2FsIHZhbHVlcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAyLCAxLCAzXSwgcHNjID0+IGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgOCkpO1xuXHRcdGZvckJvdGgoWzEwXSwgcHNjID0+IGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTApKTtcblx0XHRmb3JCb3RoKFs1LCA1LCA1XSwgcHNjID0+IGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTUpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG90YWxTdW0gd2l0aCBhbGwgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDBdLCBwc2MgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKSk7XG5cdFx0Zm9yQm90aChbMF0sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDApKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG90YWxTdW0gd2l0aCBlbXB0eSBhcnJheScsICgpID0+IHtcblx0XHRmb3JCb3RoKFtdLCBwc2MgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvdGFsU3VtIHdpdGggc2luZ2xlIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMF0sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDApKTtcblx0XHRmb3JCb3RoKFsxXSwgcHNjID0+IGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMSkpO1xuXHRcdGZvckJvdGgoWzEwMF0sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwMCkpO1xuXHR9KTtcblxuXHQvLyAtLS0gZ2V0UHJlZml4U3VtIC0tLVxuXG5cdHRlc3QoJ2dldFByZWZpeFN1bSB3aXRoIHR5cGljYWwgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDEsIDIsIDEsIDNdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNSksIDgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQcmVmaXhTdW0gd2l0aCBhbGwgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQcmVmaXhTdW0gd2l0aCBzaW5nbGUgZWxlbWVudCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFs3XSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCA3KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UHJlZml4U3VtIHdpdGggZW1wdHkgYXJyYXknLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDApLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UHJlZml4U3VtIHdpdGggbGVhZGluZy90cmFpbGluZyB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMCwgMywgMCwgMF0sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg1KSwgMyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBnZXRJbmRleE9mIC0tLVxuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCB0eXBpY2FsIHZhbHVlcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAyLCAxLCAzXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDMsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDIpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoOCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDMpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5kZXhPZiB3aXRoIGFsbCB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMCwgMF0sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCBzaW5nbGUgemVybycsICgpID0+IHtcblx0XHRmb3JCb3RoKFswXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5kZXhPZiB3aXRoIHNpbmdsZSBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzVdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgNCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRJbmRleE9mIHdpdGggbGVhZGluZyB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMCwgM10sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCB0cmFpbGluZyB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMywgMCwgMF0sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCBpbnRlcmxlYXZlZCB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMSwgMCwgMiwgMF0sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgzLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgzLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCBhbGwgb25lcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAxLCAxLCAxXSwgcHNjID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoaSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KGksIDApKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5kZXhPZiB3aXRoIGxhcmdlIHZhbHVlIGluIHNpbmdsZSBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEwMDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig1MDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCA1MDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoOTk5KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgOTk5KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBzZXRWYWx1ZSAtLS1cblxuXHR0ZXN0KCdzZXRWYWx1ZSBuby1vcCB3aGVuIHZhbHVlIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNik7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDYpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBpbmNyZWFzZScsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgOSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgOSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCA0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDYpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIGRlY3JlYXNlJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDUsIDNdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA2KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgdG8gemVybycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIGZyb20gemVybycsICgpID0+IHtcblx0XHRmb3JCb3RoKFswLCAwLCAwXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIG9uIGZpcnN0IGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMCwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMTApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig5KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgOSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgb24gbGFzdCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDNdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnNldFZhbHVlKDIsIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDkpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0IGFsbCB2YWx1ZXMgdG8gemVybyB0aGVuIHJlc3RvcmUnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMCwgMCk7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMCk7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMiwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXG5cdFx0XHRwc2Muc2V0VmFsdWUoMCwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBtdWx0aXBsZSB0aW1lcyBvbiBzYW1lIGluZGV4JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDEsIDFdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDUpO1xuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDIpO1xuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBpbnNlcnRWYWx1ZXMgLS0tXG5cblx0dGVzdCgnaW5zZXJ0VmFsdWVzIGF0IGJlZ2lubmluZycsICgpID0+IHtcblx0XHRmb3JCb3RoKFszLCA0XSwgcHNjID0+IHtcblx0XHRcdHBzYy5pbnNlcnRWYWx1ZXMoMCwgWzEsIDJdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDEwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0VmFsdWVzIGF0IGVuZCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyXSwgcHNjID0+IHtcblx0XHRcdHBzYy5pbnNlcnRWYWx1ZXMoMiwgWzMsIDRdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDEwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0VmFsdWVzIGluIHRoZSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgNF0sIHBzYyA9PiB7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDEsIFsyLCAzXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCAxMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydFZhbHVlcyB3aXRoIHplcm9lcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyXSwgcHNjID0+IHtcblx0XHRcdHBzYy5pbnNlcnRWYWx1ZXMoMSwgWzAsIDBdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgMyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydFZhbHVlcyBpbnRvIGFsbC16ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMCwgMF0sIHBzYyA9PiB7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDEsIFsyLCAzXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnRWYWx1ZXMgaW50byBlbXB0eSBjb21wdXRlcicsICgpID0+IHtcblx0XHRmb3JCb3RoKFtdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLmluc2VydFZhbHVlcygwLCBbNSwgM10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDQpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlbW92ZVZhbHVlcyAtLS1cblxuXHR0ZXN0KCdyZW1vdmVWYWx1ZXMgZnJvbSBiZWdpbm5pbmcnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgMywgNF0sIHBzYyA9PiB7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDAsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA3KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCA3KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlVmFsdWVzIGZyb20gZW5kJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDMsIDRdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnJlbW92ZVZhbHVlcygyLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVZhbHVlcyBmcm9tIHRoZSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgMywgNF0sIHBzYyA9PiB7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDEsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCA1KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDMpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlVmFsdWVzIGFsbCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5yZW1vdmVWYWx1ZXMoMCwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVWYWx1ZXMgc2luZ2xlIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbNSwgMTAsIDE1XSwgcHNjID0+IHtcblx0XHRcdHBzYy5yZW1vdmVWYWx1ZXMoMSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDIwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTkpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAxNCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVWYWx1ZXMgemVyby12YWx1ZWQgZWxlbWVudHMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMCwgNSwgMCwgMF0sIHBzYyA9PiB7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDAsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA1KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGNvbWJpbmVkIG9wZXJhdGlvbnMgLS0tXG5cblx0dGVzdCgnaW5zZXJ0IHRoZW4gcmVtb3ZlJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDNdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLmluc2VydFZhbHVlcygxLCBbMTAsIDIwXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDM2KTtcblx0XHRcdHBzYy5yZW1vdmVWYWx1ZXMoMSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmUgdGhlbiBpbnNlcnQgYXQgc2FtZSBwb3NpdGlvbicsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5yZW1vdmVWYWx1ZXMoMSwgMSk7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDEsIFs1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig1KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgNCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig2KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSB0aGVuIGluc2VydCB0aGVuIHJlbW92ZScsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAxXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgwLCA1KTtcblx0XHRcdHBzYy5pbnNlcnRWYWx1ZXMoMSwgWzEwXSk7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDMsIDEpO1xuXHRcdFx0Ly8gWzUsIDEwLCAxXVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxNik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCA0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDE0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgOSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxNSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgcXVlcmllcyBiZXR3ZWVuIG11dGF0aW9ucyBhcmUgY29uc2lzdGVudCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsyLCAzLCA1XSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGVkZ2UgY2FzZXMgLS0tXG5cblx0dGVzdCgnbGFyZ2UgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEwMCwgMjAwLCAzMDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA2MDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMzAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA2MDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig5OSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDk5KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEwMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMjk5KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMTk5KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMwMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNTk5KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMjk5KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbnkgZWxlbWVudHMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChuZXcgQXJyYXkoMTAwKS5maWxsKDEpLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNTApLCA1MCk7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZihpKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoaSwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW55IGVsZW1lbnRzIGFsbCB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChuZXcgQXJyYXkoMTAwKS5maWxsKDApLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDw9IDEwMDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKGkpLCAwKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDk5LCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIGJldHdlZW4gcXVlcmllcyByZS12YWxpZGF0ZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDEsIDEsIDEsIDFdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA1KTtcblxuXHRcdFx0cHNjLnNldFZhbHVlKDIsIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDEyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCA5KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDApKTtcblxuXHRcdFx0cHNjLnNldFZhbHVlKDAsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwK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
