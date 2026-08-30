var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Iterable } from "../../../../base/common/iterator.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { MutableObservableValue } from "./observableValue.js";
import { StoredValue } from "./storedValue.js";
let TestExclusions = class extends Disposable {
  constructor(storageService) {
    super();
    this.storageService = storageService;
    this.excluded = this._register(
      MutableObservableValue.stored(new StoredValue({
        key: "excludedTestItems",
        scope: StorageScope.WORKSPACE,
        target: StorageTarget.MACHINE,
        serialization: {
          deserialize: (v) => new Set(JSON.parse(v)),
          serialize: (v) => JSON.stringify([...v])
        }
      }, this.storageService), /* @__PURE__ */ new Set())
    );
    this.onTestExclusionsChanged = this.excluded.onDidChange;
  }
  /**
   * Gets whether there's any excluded tests.
   */
  get hasAny() {
    return this.excluded.value.size > 0;
  }
  /**
   * Gets all excluded tests.
   */
  get all() {
    return this.excluded.value;
  }
  /**
   * Sets whether a test is excluded.
   */
  toggle(test, exclude) {
    if (exclude !== true && this.excluded.value.has(test.item.extId)) {
      this.excluded.value = new Set(Iterable.filter(this.excluded.value, (e) => e !== test.item.extId));
    } else if (exclude !== false && !this.excluded.value.has(test.item.extId)) {
      this.excluded.value = /* @__PURE__ */ new Set([...this.excluded.value, test.item.extId]);
    }
  }
  /**
   * Gets whether a test is excluded.
   */
  contains(test) {
    return this.excluded.value.has(test.item.extId);
  }
  /**
   * Removes all test exclusions.
   */
  clear() {
    this.excluded.value = /* @__PURE__ */ new Set();
  }
};
TestExclusions = __decorateClass([
  __decorateParam(0, IStorageService)
], TestExclusions);
export {
  TestExclusions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdEV4Y2x1c2lvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTXV0YWJsZU9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4vb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IFN0b3JlZFZhbHVlIH0gZnJvbSAnLi9zdG9yZWRWYWx1ZS5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbFRlc3RJdGVtIH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVzdEV4Y2x1c2lvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBleGNsdWRlZDogTXV0YWJsZU9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+PjtcblxuXHRjb25zdHJ1Y3RvcihASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5leGNsdWRlZCA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0TXV0YWJsZU9ic2VydmFibGVWYWx1ZS5zdG9yZWQobmV3IFN0b3JlZFZhbHVlPFJlYWRvbmx5U2V0PHN0cmluZz4+KHtcblx0XHRcdFx0a2V5OiAnZXhjbHVkZWRUZXN0SXRlbXMnLFxuXHRcdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSxcblx0XHRcdFx0dGFyZ2V0OiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsXG5cdFx0XHRcdHNlcmlhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNlcmlhbGl6ZTogdiA9PiBuZXcgU2V0KEpTT04ucGFyc2UodikpLFxuXHRcdFx0XHRcdHNlcmlhbGl6ZTogdiA9PiBKU09OLnN0cmluZ2lmeShbLi4udl0pXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKSwgbmV3IFNldCgpKVxuXHRcdCk7XG5cdFx0dGhpcy5vblRlc3RFeGNsdXNpb25zQ2hhbmdlZCA9IHRoaXMuZXhjbHVkZWQub25EaWRDaGFuZ2U7XG5cdH1cblxuXHQvKipcblx0ICogRXZlbnQgdGhhdCBmaXJlcyB3aGVuIHRoZSBleGNsdWRlZCB0ZXN0cyBjaGFuZ2UuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25UZXN0RXhjbHVzaW9uc0NoYW5nZWQ6IEV2ZW50PHVua25vd24+O1xuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgdGhlcmUncyBhbnkgZXhjbHVkZWQgdGVzdHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGhhc0FueSgpIHtcblx0XHRyZXR1cm4gdGhpcy5leGNsdWRlZC52YWx1ZS5zaXplID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFsbCBleGNsdWRlZCB0ZXN0cy5cblx0ICovXG5cdHB1YmxpYyBnZXQgYWxsKCk6IEl0ZXJhYmxlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmV4Y2x1ZGVkLnZhbHVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgd2hldGhlciBhIHRlc3QgaXMgZXhjbHVkZWQuXG5cdCAqL1xuXHRwdWJsaWMgdG9nZ2xlKHRlc3Q6IEludGVybmFsVGVzdEl0ZW0sIGV4Y2x1ZGU/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGV4Y2x1ZGUgIT09IHRydWUgJiYgdGhpcy5leGNsdWRlZC52YWx1ZS5oYXModGVzdC5pdGVtLmV4dElkKSkge1xuXHRcdFx0dGhpcy5leGNsdWRlZC52YWx1ZSA9IG5ldyBTZXQoSXRlcmFibGUuZmlsdGVyKHRoaXMuZXhjbHVkZWQudmFsdWUsIGUgPT4gZSAhPT0gdGVzdC5pdGVtLmV4dElkKSk7XG5cdFx0fSBlbHNlIGlmIChleGNsdWRlICE9PSBmYWxzZSAmJiAhdGhpcy5leGNsdWRlZC52YWx1ZS5oYXModGVzdC5pdGVtLmV4dElkKSkge1xuXHRcdFx0dGhpcy5leGNsdWRlZC52YWx1ZSA9IG5ldyBTZXQoWy4uLnRoaXMuZXhjbHVkZWQudmFsdWUsIHRlc3QuaXRlbS5leHRJZF0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgYSB0ZXN0IGlzIGV4Y2x1ZGVkLlxuXHQgKi9cblx0cHVibGljIGNvbnRhaW5zKHRlc3Q6IEludGVybmFsVGVzdEl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5leGNsdWRlZC52YWx1ZS5oYXModGVzdC5pdGVtLmV4dElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGFsbCB0ZXN0IGV4Y2x1c2lvbnMuXG5cdCAqL1xuXHRwdWJsaWMgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5leGNsdWRlZC52YWx1ZSA9IG5ldyBTZXQoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUdyQixJQUFNLGlCQUFOLGNBQTZCLFdBQVc7QUFBQSxFQUc5QyxZQUE4QyxnQkFBaUM7QUFDOUUsVUFBTTtBQUR1QztBQUU3QyxTQUFLLFdBQVcsS0FBSztBQUFBLE1BQ3BCLHVCQUF1QixPQUFPLElBQUksWUFBaUM7QUFBQSxRQUNsRSxLQUFLO0FBQUEsUUFDTCxPQUFPLGFBQWE7QUFBQSxRQUNwQixRQUFRLGNBQWM7QUFBQSxRQUN0QixlQUFlO0FBQUEsVUFDZCxhQUFhLE9BQUssSUFBSSxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUM7QUFBQSxVQUN2QyxXQUFXLE9BQUssS0FBSyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUN0QztBQUFBLE1BQ0QsR0FBRyxLQUFLLGNBQWMsR0FBRyxvQkFBSSxJQUFJLENBQUM7QUFBQSxJQUNuQztBQUNBLFNBQUssMEJBQTBCLEtBQUssU0FBUztBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSxJQUFXLFNBQVM7QUFDbkIsV0FBTyxLQUFLLFNBQVMsTUFBTSxPQUFPO0FBQUEsRUFDbkM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQVcsTUFBd0I7QUFDbEMsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUN0QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sT0FBTyxNQUF3QixTQUF5QjtBQUM5RCxRQUFJLFlBQVksUUFBUSxLQUFLLFNBQVMsTUFBTSxJQUFJLEtBQUssS0FBSyxLQUFLLEdBQUc7QUFDakUsV0FBSyxTQUFTLFFBQVEsSUFBSSxJQUFJLFNBQVMsT0FBTyxLQUFLLFNBQVMsT0FBTyxPQUFLLE1BQU0sS0FBSyxLQUFLLEtBQUssQ0FBQztBQUFBLElBQy9GLFdBQVcsWUFBWSxTQUFTLENBQUMsS0FBSyxTQUFTLE1BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQzFFLFdBQUssU0FBUyxRQUFRLG9CQUFJLElBQUksQ0FBQyxHQUFHLEtBQUssU0FBUyxPQUFPLEtBQUssS0FBSyxLQUFLLENBQUM7QUFBQSxJQUN4RTtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFNBQVMsTUFBaUM7QUFDaEQsV0FBTyxLQUFLLFNBQVMsTUFBTSxJQUFJLEtBQUssS0FBSyxLQUFLO0FBQUEsRUFDL0M7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFFBQWM7QUFDcEIsU0FBSyxTQUFTLFFBQVEsb0JBQUksSUFBSTtBQUFBLEVBQy9CO0FBQ0Q7QUE5RGEsaUJBQU47QUFBQSxFQUdPO0FBQUEsR0FIRDsiLAogICJuYW1lcyI6IFtdCn0K
