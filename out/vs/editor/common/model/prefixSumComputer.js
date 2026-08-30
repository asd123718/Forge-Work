import { arrayInsert } from "../../../base/common/arrays.js";
import { toUint32 } from "../../../base/common/uint.js";
class PrefixSumComputer {
  constructor(values) {
    this.values = values;
    this.prefixSum = new Uint32Array(values.length);
    this.prefixSumValidIndex = new Int32Array(1);
    this.prefixSumValidIndex[0] = -1;
  }
  getCount() {
    return this.values.length;
  }
  insertValues(insertIndex, insertValues) {
    insertIndex = toUint32(insertIndex);
    const oldValues = this.values;
    const oldPrefixSum = this.prefixSum;
    const insertValuesLen = insertValues.length;
    if (insertValuesLen === 0) {
      return false;
    }
    this.values = new Uint32Array(oldValues.length + insertValuesLen);
    this.values.set(oldValues.subarray(0, insertIndex), 0);
    this.values.set(oldValues.subarray(insertIndex), insertIndex + insertValuesLen);
    this.values.set(insertValues, insertIndex);
    if (insertIndex - 1 < this.prefixSumValidIndex[0]) {
      this.prefixSumValidIndex[0] = insertIndex - 1;
    }
    this.prefixSum = new Uint32Array(this.values.length);
    if (this.prefixSumValidIndex[0] >= 0) {
      this.prefixSum.set(oldPrefixSum.subarray(0, this.prefixSumValidIndex[0] + 1));
    }
    return true;
  }
  setValue(index, value) {
    index = toUint32(index);
    value = toUint32(value);
    if (this.values[index] === value) {
      return false;
    }
    this.values[index] = value;
    if (index - 1 < this.prefixSumValidIndex[0]) {
      this.prefixSumValidIndex[0] = index - 1;
    }
    return true;
  }
  removeValues(startIndex, count) {
    startIndex = toUint32(startIndex);
    count = toUint32(count);
    const oldValues = this.values;
    const oldPrefixSum = this.prefixSum;
    if (startIndex >= oldValues.length) {
      return false;
    }
    const maxCount = oldValues.length - startIndex;
    if (count >= maxCount) {
      count = maxCount;
    }
    if (count === 0) {
      return false;
    }
    this.values = new Uint32Array(oldValues.length - count);
    this.values.set(oldValues.subarray(0, startIndex), 0);
    this.values.set(oldValues.subarray(startIndex + count), startIndex);
    this.prefixSum = new Uint32Array(this.values.length);
    if (startIndex - 1 < this.prefixSumValidIndex[0]) {
      this.prefixSumValidIndex[0] = startIndex - 1;
    }
    if (this.prefixSumValidIndex[0] >= 0) {
      this.prefixSum.set(oldPrefixSum.subarray(0, this.prefixSumValidIndex[0] + 1));
    }
    return true;
  }
  getTotalSum() {
    if (this.values.length === 0) {
      return 0;
    }
    return this._getPrefixSum(this.values.length - 1);
  }
  /**
   * Returns the sum of the first `index + 1` many items.
   * @returns `SUM(0 <= j <= index, values[j])`.
   */
  getPrefixSum(index) {
    if (index < 0) {
      return 0;
    }
    index = toUint32(index);
    return this._getPrefixSum(index);
  }
  _getPrefixSum(index) {
    if (index <= this.prefixSumValidIndex[0]) {
      return this.prefixSum[index];
    }
    let startIndex = this.prefixSumValidIndex[0] + 1;
    if (startIndex === 0) {
      this.prefixSum[0] = this.values[0];
      startIndex++;
    }
    if (index >= this.values.length) {
      index = this.values.length - 1;
    }
    for (let i = startIndex; i <= index; i++) {
      this.prefixSum[i] = this.prefixSum[i - 1] + this.values[i];
    }
    this.prefixSumValidIndex[0] = Math.max(this.prefixSumValidIndex[0], index);
    return this.prefixSum[index];
  }
  getIndexOf(sum) {
    sum = Math.floor(sum);
    this.getTotalSum();
    let low = 0;
    let high = this.values.length - 1;
    let mid = 0;
    let midStop = 0;
    let midStart = 0;
    while (low <= high) {
      mid = low + (high - low) / 2 | 0;
      midStop = this.prefixSum[mid];
      midStart = midStop - this.values[mid];
      if (sum < midStart) {
        high = mid - 1;
      } else if (sum >= midStop) {
        low = mid + 1;
      } else {
        break;
      }
    }
    return new PrefixSumIndexOfResult(mid, sum - midStart);
  }
}
class ConstantTimePrefixSumComputer {
  constructor(values) {
    this._values = values;
    this._isValid = false;
    this._validEndIndex = -1;
    this._prefixSum = [];
    this._indexBySum = [];
  }
  /**
   * @returns SUM(0 <= j < values.length, values[j])
   */
  getTotalSum() {
    this._ensureValid();
    return this._indexBySum.length;
  }
  /**
   * Returns the sum of the first `count` many items.
   * @returns `SUM(0 <= j < count, values[j])`.
   */
  getPrefixSum(count) {
    this._ensureValid();
    if (count === 0) {
      return 0;
    }
    return this._prefixSum[count - 1];
  }
  /**
   * @returns `result`, such that `getPrefixSum(result.index) + result.remainder = sum`
   */
  getIndexOf(sum) {
    this._ensureValid();
    const idx = this._indexBySum[sum];
    if (idx === void 0) {
      const lastIdx = Math.max(0, this._values.length - 1);
      const lastPrefixSum = lastIdx > 0 ? this._prefixSum[lastIdx - 1] : 0;
      return new PrefixSumIndexOfResult(lastIdx, sum - lastPrefixSum);
    }
    const viewLinesAbove = idx > 0 ? this._prefixSum[idx - 1] : 0;
    return new PrefixSumIndexOfResult(idx, sum - viewLinesAbove);
  }
  removeValues(start, deleteCount) {
    this._values.splice(start, deleteCount);
    this._invalidate(start);
  }
  insertValues(insertIndex, insertArr) {
    this._values = arrayInsert(this._values, insertIndex, insertArr);
    this._invalidate(insertIndex);
  }
  _invalidate(index) {
    this._isValid = false;
    this._validEndIndex = Math.min(this._validEndIndex, index - 1);
  }
  _ensureValid() {
    if (this._isValid) {
      return;
    }
    for (let i = this._validEndIndex + 1, len = this._values.length; i < len; i++) {
      const value = this._values[i];
      const sumAbove = i > 0 ? this._prefixSum[i - 1] : 0;
      this._prefixSum[i] = sumAbove + value;
      for (let j = 0; j < value; j++) {
        this._indexBySum[sumAbove + j] = i;
      }
    }
    this._prefixSum.length = this._values.length;
    this._indexBySum.length = this._values.length > 0 ? this._prefixSum[this._values.length - 1] : 0;
    this._isValid = true;
    this._validEndIndex = this._values.length - 1;
  }
  setValue(index, value) {
    if (this._values[index] === value) {
      return;
    }
    this._values[index] = value;
    this._invalidate(index);
  }
}
class PrefixSumIndexOfResult {
  constructor(index, remainder) {
    this.index = index;
    this.remainder = remainder;
    this._prefixSumIndexOfResultBrand = void 0;
    this.index = index;
    this.remainder = remainder;
  }
}
export {
  ConstantTimePrefixSumComputer,
  PrefixSumComputer,
  PrefixSumIndexOfResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHByZWZpeFN1bUNvbXB1dGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXJyYXlJbnNlcnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdG9VaW50MzIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcblxuZXhwb3J0IGNsYXNzIFByZWZpeFN1bUNvbXB1dGVyIHtcblxuXHQvKipcblx0ICogdmFsdWVzW2ldIGlzIHRoZSB2YWx1ZSBhdCBpbmRleCBpXG5cdCAqL1xuXHRwcml2YXRlIHZhbHVlczogVWludDMyQXJyYXk7XG5cblx0LyoqXG5cdCAqIHByZWZpeFN1bVtpXSA9IFNVTShoZWlnaHRzW2pdKSwgMCA8PSBqIDw9IGlcblx0ICovXG5cdHByaXZhdGUgcHJlZml4U3VtOiBVaW50MzJBcnJheTtcblxuXHQvKipcblx0ICogcHJlZml4U3VtW2ldLCAwIDw9IGkgPD0gcHJlZml4U3VtVmFsaWRJbmRleCBjYW4gYmUgdHJ1c3RlZFxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBwcmVmaXhTdW1WYWxpZEluZGV4OiBJbnQzMkFycmF5O1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlczogVWludDMyQXJyYXkpIHtcblx0XHR0aGlzLnZhbHVlcyA9IHZhbHVlcztcblx0XHR0aGlzLnByZWZpeFN1bSA9IG5ldyBVaW50MzJBcnJheSh2YWx1ZXMubGVuZ3RoKTtcblx0XHR0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXggPSBuZXcgSW50MzJBcnJheSgxKTtcblx0XHR0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0gPSAtMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0VmFsdWVzKGluc2VydEluZGV4OiBudW1iZXIsIGluc2VydFZhbHVlczogVWludDMyQXJyYXkpOiBib29sZWFuIHtcblx0XHRpbnNlcnRJbmRleCA9IHRvVWludDMyKGluc2VydEluZGV4KTtcblx0XHRjb25zdCBvbGRWYWx1ZXMgPSB0aGlzLnZhbHVlcztcblx0XHRjb25zdCBvbGRQcmVmaXhTdW0gPSB0aGlzLnByZWZpeFN1bTtcblx0XHRjb25zdCBpbnNlcnRWYWx1ZXNMZW4gPSBpbnNlcnRWYWx1ZXMubGVuZ3RoO1xuXG5cdFx0aWYgKGluc2VydFZhbHVlc0xlbiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWVzID0gbmV3IFVpbnQzMkFycmF5KG9sZFZhbHVlcy5sZW5ndGggKyBpbnNlcnRWYWx1ZXNMZW4pO1xuXHRcdHRoaXMudmFsdWVzLnNldChvbGRWYWx1ZXMuc3ViYXJyYXkoMCwgaW5zZXJ0SW5kZXgpLCAwKTtcblx0XHR0aGlzLnZhbHVlcy5zZXQob2xkVmFsdWVzLnN1YmFycmF5KGluc2VydEluZGV4KSwgaW5zZXJ0SW5kZXggKyBpbnNlcnRWYWx1ZXNMZW4pO1xuXHRcdHRoaXMudmFsdWVzLnNldChpbnNlcnRWYWx1ZXMsIGluc2VydEluZGV4KTtcblxuXHRcdGlmIChpbnNlcnRJbmRleCAtIDEgPCB0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0pIHtcblx0XHRcdHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA9IGluc2VydEluZGV4IC0gMTtcblx0XHR9XG5cblx0XHR0aGlzLnByZWZpeFN1bSA9IG5ldyBVaW50MzJBcnJheSh0aGlzLnZhbHVlcy5sZW5ndGgpO1xuXHRcdGlmICh0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0gPj0gMCkge1xuXHRcdFx0dGhpcy5wcmVmaXhTdW0uc2V0KG9sZFByZWZpeFN1bS5zdWJhcnJheSgwLCB0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0gKyAxKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIHNldFZhbHVlKGluZGV4OiBudW1iZXIsIHZhbHVlOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpbmRleCA9IHRvVWludDMyKGluZGV4KTtcblx0XHR2YWx1ZSA9IHRvVWludDMyKHZhbHVlKTtcblxuXHRcdGlmICh0aGlzLnZhbHVlc1tpbmRleF0gPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMudmFsdWVzW2luZGV4XSA9IHZhbHVlO1xuXHRcdGlmIChpbmRleCAtIDEgPCB0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0pIHtcblx0XHRcdHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA9IGluZGV4IC0gMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVmFsdWVzKHN0YXJ0SW5kZXg6IG51bWJlciwgY291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHN0YXJ0SW5kZXggPSB0b1VpbnQzMihzdGFydEluZGV4KTtcblx0XHRjb3VudCA9IHRvVWludDMyKGNvdW50KTtcblxuXHRcdGNvbnN0IG9sZFZhbHVlcyA9IHRoaXMudmFsdWVzO1xuXHRcdGNvbnN0IG9sZFByZWZpeFN1bSA9IHRoaXMucHJlZml4U3VtO1xuXG5cdFx0aWYgKHN0YXJ0SW5kZXggPj0gb2xkVmFsdWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1heENvdW50ID0gb2xkVmFsdWVzLmxlbmd0aCAtIHN0YXJ0SW5kZXg7XG5cdFx0aWYgKGNvdW50ID49IG1heENvdW50KSB7XG5cdFx0XHRjb3VudCA9IG1heENvdW50O1xuXHRcdH1cblxuXHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWVzID0gbmV3IFVpbnQzMkFycmF5KG9sZFZhbHVlcy5sZW5ndGggLSBjb3VudCk7XG5cdFx0dGhpcy52YWx1ZXMuc2V0KG9sZFZhbHVlcy5zdWJhcnJheSgwLCBzdGFydEluZGV4KSwgMCk7XG5cdFx0dGhpcy52YWx1ZXMuc2V0KG9sZFZhbHVlcy5zdWJhcnJheShzdGFydEluZGV4ICsgY291bnQpLCBzdGFydEluZGV4KTtcblxuXHRcdHRoaXMucHJlZml4U3VtID0gbmV3IFVpbnQzMkFycmF5KHRoaXMudmFsdWVzLmxlbmd0aCk7XG5cdFx0aWYgKHN0YXJ0SW5kZXggLSAxIDwgdGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdKSB7XG5cdFx0XHR0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0gPSBzdGFydEluZGV4IC0gMTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA+PSAwKSB7XG5cdFx0XHR0aGlzLnByZWZpeFN1bS5zZXQob2xkUHJlZml4U3VtLnN1YmFycmF5KDAsIHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSArIDEpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG90YWxTdW0oKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy52YWx1ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldFByZWZpeFN1bSh0aGlzLnZhbHVlcy5sZW5ndGggLSAxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhlIGZpcnN0IGBpbmRleCArIDFgIG1hbnkgaXRlbXMuXG5cdCAqIEByZXR1cm5zIGBTVU0oMCA8PSBqIDw9IGluZGV4LCB2YWx1ZXNbal0pYC5cblx0ICovXG5cdHB1YmxpYyBnZXRQcmVmaXhTdW0oaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0aW5kZXggPSB0b1VpbnQzMihpbmRleCk7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFByZWZpeFN1bShpbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQcmVmaXhTdW0oaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGluZGV4IDw9IHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJlZml4U3VtW2luZGV4XTtcblx0XHR9XG5cblx0XHRsZXQgc3RhcnRJbmRleCA9IHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSArIDE7XG5cdFx0aWYgKHN0YXJ0SW5kZXggPT09IDApIHtcblx0XHRcdHRoaXMucHJlZml4U3VtWzBdID0gdGhpcy52YWx1ZXNbMF07XG5cdFx0XHRzdGFydEluZGV4Kys7XG5cdFx0fVxuXG5cdFx0aWYgKGluZGV4ID49IHRoaXMudmFsdWVzLmxlbmd0aCkge1xuXHRcdFx0aW5kZXggPSB0aGlzLnZhbHVlcy5sZW5ndGggLSAxO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDw9IGluZGV4OyBpKyspIHtcblx0XHRcdHRoaXMucHJlZml4U3VtW2ldID0gdGhpcy5wcmVmaXhTdW1baSAtIDFdICsgdGhpcy52YWx1ZXNbaV07XG5cdFx0fVxuXHRcdHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA9IE1hdGgubWF4KHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSwgaW5kZXgpO1xuXHRcdHJldHVybiB0aGlzLnByZWZpeFN1bVtpbmRleF07XG5cdH1cblxuXHRwdWJsaWMgZ2V0SW5kZXhPZihzdW06IG51bWJlcik6IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQge1xuXHRcdHN1bSA9IE1hdGguZmxvb3Ioc3VtKTtcblxuXHRcdC8vIENvbXB1dGUgYWxsIHN1bXMgKHRvIGdldCBhIGZ1bGx5IHZhbGlkIHByZWZpeFN1bSlcblx0XHR0aGlzLmdldFRvdGFsU3VtKCk7XG5cblx0XHRsZXQgbG93ID0gMDtcblx0XHRsZXQgaGlnaCA9IHRoaXMudmFsdWVzLmxlbmd0aCAtIDE7XG5cdFx0bGV0IG1pZCA9IDA7XG5cdFx0bGV0IG1pZFN0b3AgPSAwO1xuXHRcdGxldCBtaWRTdGFydCA9IDA7XG5cblx0XHR3aGlsZSAobG93IDw9IGhpZ2gpIHtcblx0XHRcdG1pZCA9IGxvdyArICgoaGlnaCAtIGxvdykgLyAyKSB8IDA7XG5cblx0XHRcdG1pZFN0b3AgPSB0aGlzLnByZWZpeFN1bVttaWRdO1xuXHRcdFx0bWlkU3RhcnQgPSBtaWRTdG9wIC0gdGhpcy52YWx1ZXNbbWlkXTtcblxuXHRcdFx0aWYgKHN1bSA8IG1pZFN0YXJ0KSB7XG5cdFx0XHRcdGhpZ2ggPSBtaWQgLSAxO1xuXHRcdFx0fSBlbHNlIGlmIChzdW0gPj0gbWlkU3RvcCkge1xuXHRcdFx0XHRsb3cgPSBtaWQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KG1pZCwgc3VtIC0gbWlkU3RhcnQpO1xuXHR9XG59XG5cbi8qKlxuICoge0BsaW5rIGdldEluZGV4T2Z9IGhhcyBhbiBhbW9ydGl6ZWQgcnVudGltZSBjb21wbGV4aXR5IG9mIE8oMSkuXG4gKlxuICogKHtAbGluayBQcmVmaXhTdW1Db21wdXRlci5nZXRJbmRleE9mfSBpcyBqdXN0ICBPKGxvZyBuKSlcbiovXG5leHBvcnQgY2xhc3MgQ29uc3RhbnRUaW1lUHJlZml4U3VtQ29tcHV0ZXIge1xuXHRwcml2YXRlIF92YWx1ZXM6IG51bWJlcltdO1xuXHRwcml2YXRlIF9pc1ZhbGlkOiBib29sZWFuO1xuXHRwcml2YXRlIF92YWxpZEVuZEluZGV4OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIF9wcmVmaXhTdW1baV0gPSBTVU0odmFsdWVzW2pdKSwgMCA8PSBqIDw9IGlcblx0ICovXG5cdHByaXZhdGUgX3ByZWZpeFN1bTogbnVtYmVyW107XG5cblx0LyoqXG5cdCAqIF9pbmRleEJ5U3VtW3N1bV0gPSBpZHggPT4gX3ByZWZpeFN1bVtpZHggLSAxXSA8PSBzdW0gPCBfcHJlZml4U3VtW2lkeF1cblx0Ki9cblx0cHJpdmF0ZSBfaW5kZXhCeVN1bTogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IodmFsdWVzOiBudW1iZXJbXSkge1xuXHRcdHRoaXMuX3ZhbHVlcyA9IHZhbHVlcztcblx0XHR0aGlzLl9pc1ZhbGlkID0gZmFsc2U7XG5cdFx0dGhpcy5fdmFsaWRFbmRJbmRleCA9IC0xO1xuXHRcdHRoaXMuX3ByZWZpeFN1bSA9IFtdO1xuXHRcdHRoaXMuX2luZGV4QnlTdW0gPSBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBTVU0oMCA8PSBqIDwgdmFsdWVzLmxlbmd0aCwgdmFsdWVzW2pdKVxuXHQgKi9cblx0cHVibGljIGdldFRvdGFsU3VtKCk6IG51bWJlciB7XG5cdFx0dGhpcy5fZW5zdXJlVmFsaWQoKTtcblx0XHRyZXR1cm4gdGhpcy5faW5kZXhCeVN1bS5sZW5ndGg7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgc3VtIG9mIHRoZSBmaXJzdCBgY291bnRgIG1hbnkgaXRlbXMuXG5cdCAqIEByZXR1cm5zIGBTVU0oMCA8PSBqIDwgY291bnQsIHZhbHVlc1tqXSlgLlxuXHQgKi9cblx0cHVibGljIGdldFByZWZpeFN1bShjb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9lbnN1cmVWYWxpZCgpO1xuXHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcmVmaXhTdW1bY291bnQgLSAxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBgcmVzdWx0YCwgc3VjaCB0aGF0IGBnZXRQcmVmaXhTdW0ocmVzdWx0LmluZGV4KSArIHJlc3VsdC5yZW1haW5kZXIgPSBzdW1gXG5cdCAqL1xuXHRwdWJsaWMgZ2V0SW5kZXhPZihzdW06IG51bWJlcik6IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQge1xuXHRcdHRoaXMuX2Vuc3VyZVZhbGlkKCk7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5faW5kZXhCeVN1bVtzdW1dO1xuXHRcdGlmIChpZHggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gc3VtIGRvZXMgbm90IGhhdmUgYSBkaXJlY3QgZW50cnkgaW4gX2luZGV4QnlTdW0gKGUuZy4gc3VtID49IGdldFRvdGFsU3VtKCkgb3IgdGhlIGFycmF5IGlzIGVtcHR5IC8gYWxsIHZhbHVlcyBhcmUgemVybylcblx0XHRcdGNvbnN0IGxhc3RJZHggPSBNYXRoLm1heCgwLCB0aGlzLl92YWx1ZXMubGVuZ3RoIC0gMSk7XG5cdFx0XHRjb25zdCBsYXN0UHJlZml4U3VtID0gbGFzdElkeCA+IDAgPyB0aGlzLl9wcmVmaXhTdW1bbGFzdElkeCAtIDFdIDogMDtcblx0XHRcdHJldHVybiBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdChsYXN0SWR4LCBzdW0gLSBsYXN0UHJlZml4U3VtKTtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld0xpbmVzQWJvdmUgPSBpZHggPiAwID8gdGhpcy5fcHJlZml4U3VtW2lkeCAtIDFdIDogMDtcblx0XHRyZXR1cm4gbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoaWR4LCBzdW0gLSB2aWV3TGluZXNBYm92ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVmFsdWVzKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZXMuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCk7XG5cdFx0dGhpcy5faW52YWxpZGF0ZShzdGFydCk7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0VmFsdWVzKGluc2VydEluZGV4OiBudW1iZXIsIGluc2VydEFycjogbnVtYmVyW10pOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZXMgPSBhcnJheUluc2VydCh0aGlzLl92YWx1ZXMsIGluc2VydEluZGV4LCBpbnNlcnRBcnIpO1xuXHRcdHRoaXMuX2ludmFsaWRhdGUoaW5zZXJ0SW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZShpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5faXNWYWxpZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3ZhbGlkRW5kSW5kZXggPSBNYXRoLm1pbih0aGlzLl92YWxpZEVuZEluZGV4LCBpbmRleCAtIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlVmFsaWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVmFsaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gdGhpcy5fdmFsaWRFbmRJbmRleCArIDEsIGxlbiA9IHRoaXMuX3ZhbHVlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl92YWx1ZXNbaV07XG5cdFx0XHRjb25zdCBzdW1BYm92ZSA9IGkgPiAwID8gdGhpcy5fcHJlZml4U3VtW2kgLSAxXSA6IDA7XG5cblx0XHRcdHRoaXMuX3ByZWZpeFN1bVtpXSA9IHN1bUFib3ZlICsgdmFsdWU7XG5cdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHZhbHVlOyBqKyspIHtcblx0XHRcdFx0dGhpcy5faW5kZXhCeVN1bVtzdW1BYm92ZSArIGpdID0gaTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB0cmltIHRoaW5nc1xuXHRcdHRoaXMuX3ByZWZpeFN1bS5sZW5ndGggPSB0aGlzLl92YWx1ZXMubGVuZ3RoO1xuXHRcdHRoaXMuX2luZGV4QnlTdW0ubGVuZ3RoID0gdGhpcy5fdmFsdWVzLmxlbmd0aCA+IDAgPyB0aGlzLl9wcmVmaXhTdW1bdGhpcy5fdmFsdWVzLmxlbmd0aCAtIDFdIDogMDtcblxuXHRcdC8vIG1hcmsgYXMgdmFsaWRcblx0XHR0aGlzLl9pc1ZhbGlkID0gdHJ1ZTtcblx0XHR0aGlzLl92YWxpZEVuZEluZGV4ID0gdGhpcy5fdmFsdWVzLmxlbmd0aCAtIDE7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUoaW5kZXg6IG51bWJlciwgdmFsdWU6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92YWx1ZXNbaW5kZXhdID09PSB2YWx1ZSkge1xuXHRcdFx0Ly8gbm8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ZhbHVlc1tpbmRleF0gPSB2YWx1ZTtcblx0XHR0aGlzLl9pbnZhbGlkYXRlKGluZGV4KTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0IHtcblx0X3ByZWZpeFN1bUluZGV4T2ZSZXN1bHRCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVtYWluZGVyOiBudW1iZXJcblx0KSB7XG5cdFx0dGhpcy5pbmRleCA9IGluZGV4O1xuXHRcdHRoaXMucmVtYWluZGVyID0gcmVtYWluZGVyO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUVsQixNQUFNLGtCQUFrQjtBQUFBLEVBaUI5QixZQUFZLFFB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
