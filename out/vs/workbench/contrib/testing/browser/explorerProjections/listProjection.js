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
import { Emitter } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { flatTestItemDelimiter } from "./display.js";
import { TestItemTreeElement, TestTreeErrorMessage, getChildrenForParent, testIdentityProvider } from "./index.js";
import { isCollapsedInSerializedTestTree } from "./testingViewState.js";
import { TestId } from "../../common/testId.js";
import { TestResultItemChangeReason } from "../../common/testResult.js";
import { ITestResultService } from "../../common/testResultService.js";
import { ITestService } from "../../common/testService.js";
import { TestDiffOpType, TestItemExpandState, TestResultState, applyTestItemUpdate } from "../../common/testTypes.js";
class ListTestItemElement extends TestItemTreeElement {
  constructor(test, parent, chain) {
    super({ ...test, item: { ...test.item } }, parent);
    this.chain = chain;
    this.descriptionParts = [];
    this.updateErrorVisibility();
  }
  get description() {
    return this.chain.map((c) => c.item.label).join(flatTestItemDelimiter);
  }
  update(patch) {
    applyTestItemUpdate(this.test, patch);
    this.updateErrorVisibility(patch);
    this.fireChange();
  }
  fireChange() {
    this.changeEmitter.fire();
  }
  updateErrorVisibility(patch) {
    if (this.errorChild && (!this.test.item.error || patch?.item?.error)) {
      this.children.delete(this.errorChild);
      this.errorChild = void 0;
    }
    if (this.test.item.error && !this.errorChild) {
      this.errorChild = new TestTreeErrorMessage(this.test.item.error, this);
      this.children.add(this.errorChild);
    }
  }
}
let ListProjection = class extends Disposable {
  constructor(lastState, testService, results) {
    super();
    this.lastState = lastState;
    this.testService = testService;
    this.results = results;
    this.updateEmitter = this._register(new Emitter());
    this.items = /* @__PURE__ */ new Map();
    /**
     * @inheritdoc
     */
    this.onUpdate = this.updateEmitter.event;
    this._register(testService.onDidProcessDiff((diff) => this.applyDiff(diff)));
    this._register(results.onResultsChanged((evt) => {
      if (!("removed" in evt)) {
        return;
      }
      for (const inTree of this.items.values()) {
        const lookup = this.results.getStateById(inTree.test.item.extId)?.[1];
        inTree.duration = lookup?.ownDuration;
        inTree.state = lookup?.ownComputedState || TestResultState.Unset;
        inTree.fireChange();
      }
    }));
    this._register(results.onTestChanged((ev) => {
      if (ev.reason === TestResultItemChangeReason.NewMessage) {
        return;
      }
      let result = ev.item;
      if (result.ownComputedState === TestResultState.Unset || ev.result !== results.results[0]) {
        const fallback = results.getStateById(result.item.extId);
        if (fallback) {
          result = fallback[1];
        }
      }
      const item = this.items.get(result.item.extId);
      if (!item) {
        return;
      }
      item.retired = !!result.retired;
      item.state = result.computedState;
      item.duration = result.ownDuration;
      item.fireChange();
    }));
    for (const test of testService.collection.all) {
      this.storeItem(test);
    }
  }
  /**
   * Gets root elements of the tree.
   */
  get rootsWithChildren() {
    const rootsIt = Iterable.map(this.testService.collection.rootItems, (r) => this.items.get(r.item.extId));
    return Iterable.filter(rootsIt, (r) => !!r?.children.size);
  }
  /**
   * @inheritdoc
   */
  getElementByTestId(testId) {
    return this.items.get(testId);
  }
  /**
   * @inheritdoc
   */
  applyDiff(diff) {
    for (const op of diff) {
      switch (op.op) {
        case TestDiffOpType.Add: {
          this.storeItem(op.item);
          break;
        }
        case TestDiffOpType.Update: {
          this.items.get(op.item.extId)?.update(op.item);
          break;
        }
        case TestDiffOpType.Remove: {
          for (const [id, item] of this.items) {
            if (id === op.itemId || TestId.isChild(op.itemId, id)) {
              this.unstoreItem(item);
            }
          }
          break;
        }
      }
    }
    if (diff.length !== 0) {
      this.updateEmitter.fire();
    }
  }
  /**
   * @inheritdoc
   */
  applyTo(tree) {
    tree.setChildren(null, getChildrenForParent(this.lastState, this.rootsWithChildren, null), {
      diffIdentityProvider: testIdentityProvider,
      diffDepth: Infinity
    });
  }
  /**
   * @inheritdoc
   */
  expandElement(element, depth) {
    if (!(element instanceof ListTestItemElement)) {
      return;
    }
    if (element.test.expand === TestItemExpandState.NotExpandable) {
      return;
    }
    this.testService.collection.expand(element.test.item.extId, depth);
  }
  unstoreItem(treeElement) {
    this.items.delete(treeElement.test.item.extId);
    treeElement.parent?.children.delete(treeElement);
    const parentId = TestId.fromString(treeElement.test.item.extId).parentId;
    if (!parentId) {
      return;
    }
    for (const id of parentId.idsToRoot()) {
      const parentTest = this.testService.collection.getNodeById(id.toString());
      if (parentTest) {
        if (parentTest.children.size === 0 && !this.items.has(id.toString())) {
          this._storeItem(parentId, parentTest);
        }
        break;
      }
    }
  }
  _storeItem(testId, item) {
    const displayedParent = testId.isRoot ? null : this.items.get(item.controllerId);
    const chain = [...testId.idsFromRoot()].slice(1, -1).map((id) => this.testService.collection.getNodeById(id.toString()));
    const treeElement = new ListTestItemElement(item, displayedParent, chain);
    displayedParent?.children.add(treeElement);
    this.items.set(treeElement.test.item.extId, treeElement);
    if (treeElement.depth === 0 || isCollapsedInSerializedTestTree(this.lastState, treeElement.test.item.extId) === false) {
      this.expandElement(treeElement, Infinity);
    }
    const prevState = this.results.getStateById(treeElement.test.item.extId)?.[1];
    if (prevState) {
      treeElement.retired = !!prevState.retired;
      treeElement.state = prevState.computedState;
      treeElement.duration = prevState.ownDuration;
    }
  }
  storeItem(item) {
    const testId = TestId.fromString(item.item.extId);
    for (const parentId of testId.idsToRoot()) {
      if (!parentId.isRoot) {
        const prevParent = this.items.get(parentId.toString());
        if (prevParent) {
          this.unstoreItem(prevParent);
          break;
        }
      }
    }
    this._storeItem(testId, item);
  }
};
ListProjection = __decorateClass([
  __decorateParam(1, ITestService),
  __decorateParam(2, ITestResultService)
], ListProjection);
export {
  ListProjection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXGV4cGxvcmVyUHJvamVjdGlvbnNcXGxpc3RQcm9qZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBmbGF0VGVzdEl0ZW1EZWxpbWl0ZXIgfSBmcm9tICcuL2Rpc3BsYXkuanMnO1xuaW1wb3J0IHsgSVRlc3RUcmVlUHJvamVjdGlvbiwgVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIFRlc3RJdGVtVHJlZUVsZW1lbnQsIFRlc3RUcmVlRXJyb3JNZXNzYWdlLCBnZXRDaGlsZHJlbkZvclBhcmVudCwgdGVzdElkZW50aXR5UHJvdmlkZXIgfSBmcm9tICcuL2luZGV4LmpzJztcbmltcG9ydCB7IElTZXJpYWxpemVkVGVzdFRyZWVDb2xsYXBzZVN0YXRlLCBpc0NvbGxhcHNlZEluU2VyaWFsaXplZFRlc3RUcmVlIH0gZnJvbSAnLi90ZXN0aW5nVmlld1N0YXRlLmpzJztcbmltcG9ydCB7IFRlc3RJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0SXRlbVVwZGF0ZSwgSW50ZXJuYWxUZXN0SXRlbSwgVGVzdERpZmZPcFR5cGUsIFRlc3RJdGVtRXhwYW5kU3RhdGUsIFRlc3RSZXN1bHRTdGF0ZSwgVGVzdHNEaWZmLCBhcHBseVRlc3RJdGVtVXBkYXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5cbi8qKlxuICogVGVzdCB0cmVlIGVsZW1lbnQgZWxlbWVudCB0aGF0IGdyb3VwcyBiZSBoaWVyYXJjaHkuXG4gKi9cbmNsYXNzIExpc3RUZXN0SXRlbUVsZW1lbnQgZXh0ZW5kcyBUZXN0SXRlbVRyZWVFbGVtZW50IHtcblx0cHJpdmF0ZSBlcnJvckNoaWxkPzogVGVzdFRyZWVFcnJvck1lc3NhZ2U7XG5cblx0cHVibGljIGRlc2NyaXB0aW9uUGFydHM6IHN0cmluZ1tdID0gW107XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCBkZXNjcmlwdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGFpbi5tYXAoYyA9PiBjLml0ZW0ubGFiZWwpLmpvaW4oZmxhdFRlc3RJdGVtRGVsaW1pdGVyKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRlc3Q6IEludGVybmFsVGVzdEl0ZW0sXG5cdFx0cGFyZW50OiBudWxsIHwgTGlzdFRlc3RJdGVtRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYWluOiBJbnRlcm5hbFRlc3RJdGVtW10sXG5cdCkge1xuXHRcdHN1cGVyKHsgLi4udGVzdCwgaXRlbTogeyAuLi50ZXN0Lml0ZW0gfSB9LCBwYXJlbnQpO1xuXHRcdHRoaXMudXBkYXRlRXJyb3JWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlKHBhdGNoOiBJVGVzdEl0ZW1VcGRhdGUpIHtcblx0XHRhcHBseVRlc3RJdGVtVXBkYXRlKHRoaXMudGVzdCwgcGF0Y2gpO1xuXHRcdHRoaXMudXBkYXRlRXJyb3JWaXNpYmlsaXR5KHBhdGNoKTtcblx0XHR0aGlzLmZpcmVDaGFuZ2UoKTtcblx0fVxuXG5cdHB1YmxpYyBmaXJlQ2hhbmdlKCkge1xuXHRcdHRoaXMuY2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVycm9yVmlzaWJpbGl0eShwYXRjaD86IElUZXN0SXRlbVVwZGF0ZSkge1xuXHRcdGlmICh0aGlzLmVycm9yQ2hpbGQgJiYgKCF0aGlzLnRlc3QuaXRlbS5lcnJvciB8fCBwYXRjaD8uaXRlbT8uZXJyb3IpKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuLmRlbGV0ZSh0aGlzLmVycm9yQ2hpbGQpO1xuXHRcdFx0dGhpcy5lcnJvckNoaWxkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy50ZXN0Lml0ZW0uZXJyb3IgJiYgIXRoaXMuZXJyb3JDaGlsZCkge1xuXHRcdFx0dGhpcy5lcnJvckNoaWxkID0gbmV3IFRlc3RUcmVlRXJyb3JNZXNzYWdlKHRoaXMudGVzdC5pdGVtLmVycm9yLCB0aGlzKTtcblx0XHRcdHRoaXMuY2hpbGRyZW4uYWRkKHRoaXMuZXJyb3JDaGlsZCk7XG5cdFx0fVxuXHR9XG59XG5cblxuLyoqXG4gKiBQcm9qZWN0aW9uIHRoYXQgbGlzdHMgdGVzdHMgaW4gdGhlaXIgdHJhZGl0aW9uYWwgdHJlZSB2aWV3LlxuICovXG5leHBvcnQgY2xhc3MgTGlzdFByb2plY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlc3RUcmVlUHJvamVjdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIExpc3RUZXN0SXRlbUVsZW1lbnQ+KCk7XG5cblx0LyoqXG5cdCAqIEdldHMgcm9vdCBlbGVtZW50cyBvZiB0aGUgdHJlZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0IHJvb3RzV2l0aENoaWxkcmVuKCk6IEl0ZXJhYmxlPExpc3RUZXN0SXRlbUVsZW1lbnQ+IHtcblx0XHRjb25zdCByb290c0l0ID0gSXRlcmFibGUubWFwKHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5yb290SXRlbXMsIHIgPT4gdGhpcy5pdGVtcy5nZXQoci5pdGVtLmV4dElkKSk7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLmZpbHRlcihyb290c0l0LCAocik6IHIgaXMgTGlzdFRlc3RJdGVtRWxlbWVudCA9PiAhIXI/LmNoaWxkcmVuLnNpemUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25VcGRhdGUgPSB0aGlzLnVwZGF0ZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhc3RTdGF0ZTogSVNlcmlhbGl6ZWRUZXN0VHJlZUNvbGxhcHNlU3RhdGUsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0U2VydmljZS5vbkRpZFByb2Nlc3NEaWZmKChkaWZmKSA9PiB0aGlzLmFwcGx5RGlmZihkaWZmKSkpO1xuXG5cdFx0Ly8gd2hlbiB0ZXN0IHJlc3VsdHMgYXJlIGNsZWFyZWQsIHJlY2FsY3VsYXRlIGFsbCBzdGF0ZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZCgoZXZ0KSA9PiB7XG5cdFx0XHRpZiAoISgncmVtb3ZlZCcgaW4gZXZ0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgaW5UcmVlIG9mIHRoaXMuaXRlbXMudmFsdWVzKCkpIHtcblx0XHRcdFx0Ly8gU2ltcGxlIGxvZ2ljIGhlcmUsIGJlY2F1c2Ugd2Uga25vdyBpbiB0aGlzIHByb2plY3Rpb24gc3RhdGVzXG5cdFx0XHRcdC8vIGFyZSBuZXZlciBpbmhlcml0ZWQuXG5cdFx0XHRcdGNvbnN0IGxvb2t1cCA9IHRoaXMucmVzdWx0cy5nZXRTdGF0ZUJ5SWQoaW5UcmVlLnRlc3QuaXRlbS5leHRJZCk/LlsxXTtcblx0XHRcdFx0aW5UcmVlLmR1cmF0aW9uID0gbG9va3VwPy5vd25EdXJhdGlvbjtcblx0XHRcdFx0aW5UcmVlLnN0YXRlID0gbG9va3VwPy5vd25Db21wdXRlZFN0YXRlIHx8IFRlc3RSZXN1bHRTdGF0ZS5VbnNldDtcblx0XHRcdFx0aW5UcmVlLmZpcmVDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyB3aGVuIHRlc3Qgc3RhdGVzIGNoYW5nZSwgcmVmbGVjdCBpbiB0aGUgdHJlZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdHMub25UZXN0Q2hhbmdlZChldiA9PiB7XG5cdFx0XHRpZiAoZXYucmVhc29uID09PSBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5OZXdNZXNzYWdlKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gbm8gZWZmZWN0IGluIHRoZSB0cmVlXG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXN1bHQgPSBldi5pdGVtO1xuXHRcdFx0Ly8gaWYgdGhlIHN0YXRlIGlzIHVuc2V0LCBvciB0aGUgbGF0ZXN0IHJ1biBpcyBub3QgbWFraW5nIHRoZSBjaGFuZ2UsXG5cdFx0XHQvLyBkb3VibGUgY2hlY2sgdGhhdCBpdCdzIHZhbGlkLiBSZXRpcmUgY2FsbHMgbWlnaHQgY2F1c2UgcHJldmlvdXNcblx0XHRcdC8vIGVtaXQgYSBzdGF0ZSBjaGFuZ2UgZm9yIGEgdGVzdCBydW4gdGhhdCdzIGFscmVhZHkgbG9uZyBjb21wbGV0ZWQuXG5cdFx0XHRpZiAocmVzdWx0Lm93bkNvbXB1dGVkU3RhdGUgPT09IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCB8fCBldi5yZXN1bHQgIT09IHJlc3VsdHMucmVzdWx0c1swXSkge1xuXHRcdFx0XHRjb25zdCBmYWxsYmFjayA9IHJlc3VsdHMuZ2V0U3RhdGVCeUlkKHJlc3VsdC5pdGVtLmV4dElkKTtcblx0XHRcdFx0aWYgKGZhbGxiYWNrKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gZmFsbGJhY2tbMV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXMuZ2V0KHJlc3VsdC5pdGVtLmV4dElkKTtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW0ucmV0aXJlZCA9ICEhcmVzdWx0LnJldGlyZWQ7XG5cdFx0XHRpdGVtLnN0YXRlID0gcmVzdWx0LmNvbXB1dGVkU3RhdGU7XG5cdFx0XHRpdGVtLmR1cmF0aW9uID0gcmVzdWx0Lm93bkR1cmF0aW9uO1xuXHRcdFx0aXRlbS5maXJlQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24uYWxsKSB7XG5cdFx0XHR0aGlzLnN0b3JlSXRlbSh0ZXN0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXRFbGVtZW50QnlUZXN0SWQodGVzdElkOiBzdHJpbmcpOiBUZXN0SXRlbVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtcy5nZXQodGVzdElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHJpdmF0ZSBhcHBseURpZmYoZGlmZjogVGVzdHNEaWZmKSB7XG5cdFx0Zm9yIChjb25zdCBvcCBvZiBkaWZmKSB7XG5cdFx0XHRzd2l0Y2ggKG9wLm9wKSB7XG5cdFx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuQWRkOiB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yZUl0ZW0ob3AuaXRlbSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLlVwZGF0ZToge1xuXHRcdFx0XHRcdHRoaXMuaXRlbXMuZ2V0KG9wLml0ZW0uZXh0SWQpPy51cGRhdGUob3AuaXRlbSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLlJlbW92ZToge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW2lkLCBpdGVtXSBvZiB0aGlzLml0ZW1zKSB7XG5cdFx0XHRcdFx0XHRpZiAoaWQgPT09IG9wLml0ZW1JZCB8fCBUZXN0SWQuaXNDaGlsZChvcC5pdGVtSWQsIGlkKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVuc3RvcmVJdGVtKGl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkaWZmLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0dGhpcy51cGRhdGVFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhcHBseVRvKHRyZWU6IE9iamVjdFRyZWU8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+KSB7XG5cdFx0Ly8gV2UgZG9uJ3QgYm90aGVyIGRvaW5nIGEgdmVyeSBzcGVjaWZpYyB1cGRhdGUgbGlrZSB3ZSBkbyBpbiB0aGUgVHJlZVByb2plY3Rpb24uXG5cdFx0Ly8gSXQncyBhIGZsYXQgbGlzdCwgc28gY2hhbmNlcyBhcmUgd2UgbmVlZCB0byByZW5kZXIgZXZlcnl0aGluZyBhbnl3YXkuXG5cdFx0Ly8gTGV0IHRoZSBkaWZmSWRlbnRpdHlQcm92aWRlciBoYW5kbGUgdGhhdC5cblx0XHR0cmVlLnNldENoaWxkcmVuKG51bGwsIGdldENoaWxkcmVuRm9yUGFyZW50KHRoaXMubGFzdFN0YXRlLCB0aGlzLnJvb3RzV2l0aENoaWxkcmVuLCBudWxsKSwge1xuXHRcdFx0ZGlmZklkZW50aXR5UHJvdmlkZXI6IHRlc3RJZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0ZGlmZkRlcHRoOiBJbmZpbml0eVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZXhwYW5kRWxlbWVudChlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50LCBkZXB0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIExpc3RUZXN0SXRlbUVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQudGVzdC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5leHBhbmQoZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQsIGRlcHRoKTtcblx0fVxuXG5cdHByaXZhdGUgdW5zdG9yZUl0ZW0odHJlZUVsZW1lbnQ6IExpc3RUZXN0SXRlbUVsZW1lbnQpIHtcblx0XHR0aGlzLml0ZW1zLmRlbGV0ZSh0cmVlRWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQpO1xuXHRcdHRyZWVFbGVtZW50LnBhcmVudD8uY2hpbGRyZW4uZGVsZXRlKHRyZWVFbGVtZW50KTtcblxuXHRcdGNvbnN0IHBhcmVudElkID0gVGVzdElkLmZyb21TdHJpbmcodHJlZUVsZW1lbnQudGVzdC5pdGVtLmV4dElkKS5wYXJlbnRJZDtcblx0XHRpZiAoIXBhcmVudElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIHRoZSBwYXJlbnQgaWYgaXQncyBub3cgaXRzIG93biBsZWFmXG5cdFx0Zm9yIChjb25zdCBpZCBvZiBwYXJlbnRJZC5pZHNUb1Jvb3QoKSkge1xuXHRcdFx0Y29uc3QgcGFyZW50VGVzdCA9IHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5nZXROb2RlQnlJZChpZC50b1N0cmluZygpKTtcblx0XHRcdGlmIChwYXJlbnRUZXN0KSB7XG5cdFx0XHRcdGlmIChwYXJlbnRUZXN0LmNoaWxkcmVuLnNpemUgPT09IDAgJiYgIXRoaXMuaXRlbXMuaGFzKGlkLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmVJdGVtKHBhcmVudElkLCBwYXJlbnRUZXN0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZUl0ZW0odGVzdElkOiBUZXN0SWQsIGl0ZW06IEludGVybmFsVGVzdEl0ZW0pIHtcblx0XHRjb25zdCBkaXNwbGF5ZWRQYXJlbnQgPSB0ZXN0SWQuaXNSb290ID8gbnVsbCA6IHRoaXMuaXRlbXMuZ2V0KGl0ZW0uY29udHJvbGxlcklkKSE7XG5cdFx0Y29uc3QgY2hhaW4gPSBbLi4udGVzdElkLmlkc0Zyb21Sb290KCldLnNsaWNlKDEsIC0xKS5tYXAoaWQgPT4gdGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLmdldE5vZGVCeUlkKGlkLnRvU3RyaW5nKCkpISk7XG5cdFx0Y29uc3QgdHJlZUVsZW1lbnQgPSBuZXcgTGlzdFRlc3RJdGVtRWxlbWVudChpdGVtLCBkaXNwbGF5ZWRQYXJlbnQsIGNoYWluKTtcblx0XHRkaXNwbGF5ZWRQYXJlbnQ/LmNoaWxkcmVuLmFkZCh0cmVlRWxlbWVudCk7XG5cdFx0dGhpcy5pdGVtcy5zZXQodHJlZUVsZW1lbnQudGVzdC5pdGVtLmV4dElkLCB0cmVlRWxlbWVudCk7XG5cblx0XHRpZiAodHJlZUVsZW1lbnQuZGVwdGggPT09IDAgfHwgaXNDb2xsYXBzZWRJblNlcmlhbGl6ZWRUZXN0VHJlZSh0aGlzLmxhc3RTdGF0ZSwgdHJlZUVsZW1lbnQudGVzdC5pdGVtLmV4dElkKSA9PT0gZmFsc2UpIHtcblx0XHRcdHRoaXMuZXhwYW5kRWxlbWVudCh0cmVlRWxlbWVudCwgSW5maW5pdHkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZTdGF0ZSA9IHRoaXMucmVzdWx0cy5nZXRTdGF0ZUJ5SWQodHJlZUVsZW1lbnQudGVzdC5pdGVtLmV4dElkKT8uWzFdO1xuXHRcdGlmIChwcmV2U3RhdGUpIHtcblx0XHRcdHRyZWVFbGVtZW50LnJldGlyZWQgPSAhIXByZXZTdGF0ZS5yZXRpcmVkO1xuXHRcdFx0dHJlZUVsZW1lbnQuc3RhdGUgPSBwcmV2U3RhdGUuY29tcHV0ZWRTdGF0ZTtcblx0XHRcdHRyZWVFbGVtZW50LmR1cmF0aW9uID0gcHJldlN0YXRlLm93bkR1cmF0aW9uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RvcmVJdGVtKGl0ZW06IEludGVybmFsVGVzdEl0ZW0pIHtcblx0XHRjb25zdCB0ZXN0SWQgPSBUZXN0SWQuZnJvbVN0cmluZyhpdGVtLml0ZW0uZXh0SWQpO1xuXG5cdFx0Ly8gUmVtb3ZlIGFueSBub24tcm9vdCBwYXJlbnQgb2YgdGhpcyBpdGVtIHdoaWNoIGlzIG5vIGxvbmdlciBhIGxlYWYuXG5cdFx0Zm9yIChjb25zdCBwYXJlbnRJZCBvZiB0ZXN0SWQuaWRzVG9Sb290KCkpIHtcblx0XHRcdGlmICghcGFyZW50SWQuaXNSb290KSB7XG5cdFx0XHRcdGNvbnN0IHByZXZQYXJlbnQgPSB0aGlzLml0ZW1zLmdldChwYXJlbnRJZC50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKHByZXZQYXJlbnQpIHtcblx0XHRcdFx0XHR0aGlzLnVuc3RvcmVJdGVtKHByZXZQYXJlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RvcmVJdGVtKHRlc3RJZCwgaXRlbSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBRXhCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXVELHFCQUFxQixzQkFBc0Isc0JBQXNCLDRCQUE0QjtBQUNwSixTQUEyQyx1Q0FBdUM7QUFDbEYsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTRDLGdCQUFnQixxQkFBcUIsaUJBQTRCLDJCQUEyQjtBQUt4SSxNQUFNLDRCQUE0QixvQkFBb0I7QUFBQSxFQVNyRCxZQUNDLE1BQ0EsUUFDaUIsT0FDaEI7QUFDRCxVQUFNLEVBQUUsR0FBRyxNQUFNLE1BQU0sRUFBRSxHQUFHLEtBQUssS0FBSyxFQUFFLEdBQUcsTUFBTTtBQUZoQztBQVRsQixTQUFPLG1CQUE2QixDQUFDO0FBWXBDLFNBQUssc0JBQXNCO0FBQUEsRUFDNUI7QUFBQSxFQVhBLElBQW9CLGNBQWM7QUFDakMsV0FBTyxLQUFLLE1BQU0sSUFB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
