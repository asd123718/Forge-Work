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
import { TestItemTreeElement, TestTreeErrorMessage, getChildrenForParent, testIdentityProvider } from "./index.js";
import { isCollapsedInSerializedTestTree } from "./testingViewState.js";
import { refreshComputedState } from "../../common/getComputedState.js";
import { TestId } from "../../common/testId.js";
import { TestResultItemChangeReason } from "../../common/testResult.js";
import { ITestResultService } from "../../common/testResultService.js";
import { ITestService } from "../../common/testService.js";
import { TestDiffOpType, TestItemExpandState, TestResultState, applyTestItemUpdate } from "../../common/testTypes.js";
const computedStateAccessor = {
  getOwnState: (i) => i instanceof TestItemTreeElement ? i.ownState : TestResultState.Unset,
  getCurrentComputedState: (i) => i.state,
  setComputedState: (i, s) => i.state = s,
  getCurrentComputedDuration: (i) => i.duration,
  getOwnDuration: (i) => i instanceof TestItemTreeElement ? i.ownDuration : void 0,
  setComputedDuration: (i, d) => i.duration = d,
  getChildren: (i) => Iterable.filter(
    i.children.values(),
    (t) => t instanceof TreeTestItemElement
  ),
  *getParents(i) {
    for (let parent = i.parent; parent; parent = parent.parent) {
      yield parent;
    }
  }
};
class TreeTestItemElement extends TestItemTreeElement {
  constructor(test, parent, addedOrRemoved) {
    super({ ...test, item: { ...test.item } }, parent);
    this.addedOrRemoved = addedOrRemoved;
    /**
     * Own, non-computed state.
     * @internal
     */
    this.ownState = TestResultState.Unset;
    this.updateErrorVisibility();
  }
  get description() {
    return this.test.item.description;
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
      this.addedOrRemoved(this);
      this.children.delete(this.errorChild);
      this.errorChild = void 0;
    }
    if (this.test.item.error && !this.errorChild) {
      this.errorChild = new TestTreeErrorMessage(this.test.item.error, this);
      this.children.add(this.errorChild);
      this.addedOrRemoved(this);
    }
  }
}
let TreeProjection = class extends Disposable {
  constructor(lastState, testService, results) {
    super();
    this.lastState = lastState;
    this.testService = testService;
    this.results = results;
    this.updateEmitter = this._register(new Emitter());
    this.changedParents = /* @__PURE__ */ new Set();
    this.resortedParents = /* @__PURE__ */ new Set();
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
      for (const inTree of [...this.items.values()].sort((a, b) => b.depth - a.depth)) {
        const lookup = this.results.getStateById(inTree.test.item.extId)?.[1];
        inTree.ownDuration = lookup?.ownDuration;
        refreshComputedState(computedStateAccessor, inTree, lookup?.ownComputedState ?? TestResultState.Unset).forEach((i) => i.fireChange());
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
      const refreshDuration = ev.reason === TestResultItemChangeReason.OwnStateChange && ev.previousOwnDuration !== result.ownDuration;
      const explicitComputed = item.children.size ? void 0 : result.computedState;
      item.retired = !!result.retired;
      item.ownState = result.ownComputedState;
      item.ownDuration = result.ownDuration;
      item.fireChange();
      refreshComputedState(computedStateAccessor, item, explicitComputed, refreshDuration).forEach((i) => i.fireChange());
    }));
    for (const test of testService.collection.all) {
      this.storeItem(this.createItem(test));
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
          const item = this.createItem(op.item);
          this.storeItem(item);
          break;
        }
        case TestDiffOpType.Update: {
          const patch = op.item;
          const existing = this.items.get(patch.extId);
          if (!existing) {
            break;
          }
          const needsParentUpdate = existing.test.expand === TestItemExpandState.NotExpandable && patch.expand;
          existing.update(patch);
          if (needsParentUpdate) {
            this.changedParents.add(existing.parent);
          } else {
            this.resortedParents.add(existing.parent);
          }
          break;
        }
        case TestDiffOpType.Remove: {
          const toRemove = this.items.get(op.itemId);
          if (!toRemove) {
            break;
          }
          const parent = toRemove.parent;
          const affectsRootElement = toRemove.depth === 1 && (parent?.children.size === 1 || !Iterable.some(this.rootsWithChildren, (_, i) => i === 1));
          this.changedParents.add(affectsRootElement ? null : parent);
          const queue = [[toRemove]];
          while (queue.length) {
            for (const item of queue.pop()) {
              if (item instanceof TreeTestItemElement) {
                queue.push(this.unstoreItem(item));
              }
            }
          }
          if (parent instanceof TreeTestItemElement) {
            refreshComputedState(computedStateAccessor, parent, void 0, !!parent.duration).forEach((i) => i.fireChange());
          }
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
    for (const parent of this.changedParents) {
      if (!parent || tree.hasElement(parent)) {
        tree.setChildren(parent, getChildrenForParent(this.lastState, this.rootsWithChildren, parent), { diffIdentityProvider: testIdentityProvider });
      }
    }
    for (const parent of this.resortedParents) {
      if (!parent || tree.hasElement(parent)) {
        tree.resort(parent, false);
      }
    }
    this.changedParents.clear();
    this.resortedParents.clear();
  }
  /**
   * @inheritdoc
   */
  expandElement(element, depth) {
    if (!(element instanceof TreeTestItemElement)) {
      return;
    }
    if (element.test.expand === TestItemExpandState.NotExpandable) {
      return;
    }
    this.testService.collection.expand(element.test.item.extId, depth);
  }
  createItem(item) {
    const parentId = TestId.parentId(item.item.extId);
    const parent = parentId ? this.items.get(parentId) : null;
    return new TreeTestItemElement(item, parent, (n) => this.changedParents.add(n));
  }
  unstoreItem(treeElement) {
    const parent = treeElement.parent;
    parent?.children.delete(treeElement);
    this.items.delete(treeElement.test.item.extId);
    return treeElement.children;
  }
  storeItem(treeElement) {
    treeElement.parent?.children.add(treeElement);
    this.items.set(treeElement.test.item.extId, treeElement);
    const affectsParent = treeElement.parent?.children.size === 1;
    const affectedParent = affectsParent ? treeElement.parent.parent : treeElement.parent;
    this.changedParents.add(affectedParent);
    if (affectedParent?.depth === 0) {
      this.changedParents.add(null);
    }
    if (treeElement.depth === 0 || isCollapsedInSerializedTestTree(this.lastState, treeElement.test.item.extId) === false) {
      this.expandElement(treeElement, 0);
    }
    const prevState = this.results.getStateById(treeElement.test.item.extId)?.[1];
    if (prevState) {
      treeElement.retired = !!prevState.retired;
      treeElement.ownState = prevState.computedState;
      treeElement.ownDuration = prevState.ownDuration;
      refreshComputedState(computedStateAccessor, treeElement, void 0, !!treeElement.ownDuration).forEach((i) => i.fireChange());
    }
  }
};
TreeProjection = __decorateClass([
  __decorateParam(1, ITestService),
  __decorateParam(2, ITestResultService)
], TreeProjection);
export {
  TreeProjection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXGV4cGxvcmVyUHJvamVjdGlvbnNcXHRyZWVQcm9qZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFRyZWVQcm9qZWN0aW9uLCBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCwgVGVzdEl0ZW1UcmVlRWxlbWVudCwgVGVzdFRyZWVFcnJvck1lc3NhZ2UsIGdldENoaWxkcmVuRm9yUGFyZW50LCB0ZXN0SWRlbnRpdHlQcm92aWRlciB9IGZyb20gJy4vaW5kZXguanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRUZXN0VHJlZUNvbGxhcHNlU3RhdGUsIGlzQ29sbGFwc2VkSW5TZXJpYWxpemVkVGVzdFRyZWUgfSBmcm9tICcuL3Rlc3RpbmdWaWV3U3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbXB1dGVkU3RhdGVBbmREdXJhdGlvbkFjY2Vzc29yLCByZWZyZXNoQ29tcHV0ZWRTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9nZXRDb21wdXRlZFN0YXRlLmpzJztcbmltcG9ydCB7IFRlc3RJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0SXRlbVVwZGF0ZSwgSW50ZXJuYWxUZXN0SXRlbSwgVGVzdERpZmZPcFR5cGUsIFRlc3RJdGVtRXhwYW5kU3RhdGUsIFRlc3RSZXN1bHRTdGF0ZSwgVGVzdHNEaWZmLCBhcHBseVRlc3RJdGVtVXBkYXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5cbmNvbnN0IGNvbXB1dGVkU3RhdGVBY2Nlc3NvcjogSUNvbXB1dGVkU3RhdGVBbmREdXJhdGlvbkFjY2Vzc29yPFRyZWVUZXN0SXRlbUVsZW1lbnQ+ID0ge1xuXHRnZXRPd25TdGF0ZTogaSA9PiBpIGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCA/IGkub3duU3RhdGUgOiBUZXN0UmVzdWx0U3RhdGUuVW5zZXQsXG5cdGdldEN1cnJlbnRDb21wdXRlZFN0YXRlOiBpID0+IGkuc3RhdGUsXG5cdHNldENvbXB1dGVkU3RhdGU6IChpLCBzKSA9PiBpLnN0YXRlID0gcyxcblxuXHRnZXRDdXJyZW50Q29tcHV0ZWREdXJhdGlvbjogaSA9PiBpLmR1cmF0aW9uLFxuXHRnZXRPd25EdXJhdGlvbjogaSA9PiBpIGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCA/IGkub3duRHVyYXRpb24gOiB1bmRlZmluZWQsXG5cdHNldENvbXB1dGVkRHVyYXRpb246IChpLCBkKSA9PiBpLmR1cmF0aW9uID0gZCxcblxuXHRnZXRDaGlsZHJlbjogaSA9PiBJdGVyYWJsZS5maWx0ZXIoXG5cdFx0aS5jaGlsZHJlbi52YWx1ZXMoKSxcblx0XHQodCk6IHQgaXMgVHJlZVRlc3RJdGVtRWxlbWVudCA9PiB0IGluc3RhbmNlb2YgVHJlZVRlc3RJdGVtRWxlbWVudCxcblx0KSxcblx0KmdldFBhcmVudHMoaSkge1xuXHRcdGZvciAobGV0IHBhcmVudCA9IGkucGFyZW50OyBwYXJlbnQ7IHBhcmVudCA9IHBhcmVudC5wYXJlbnQpIHtcblx0XHRcdHlpZWxkIHBhcmVudCBhcyBUcmVlVGVzdEl0ZW1FbGVtZW50O1xuXHRcdH1cblx0fSxcbn07XG5cbi8qKlxuICogVGVzdCB0cmVlIGVsZW1lbnQgZWxlbWVudCB0aGF0IGdyb3VwcyBiZSBoaWVyYXJjaHkuXG4gKi9cbmNsYXNzIFRyZWVUZXN0SXRlbUVsZW1lbnQgZXh0ZW5kcyBUZXN0SXRlbVRyZWVFbGVtZW50IHtcblx0LyoqXG5cdCAqIE93biwgbm9uLWNvbXB1dGVkIHN0YXRlLlxuXHQgKiBAaW50ZXJuYWxcblx0ICovXG5cdHB1YmxpYyBvd25TdGF0ZSA9IFRlc3RSZXN1bHRTdGF0ZS5VbnNldDtcblxuXHQvKipcblx0ICogT3duLCBub24tY29tcHV0ZWQgZHVyYXRpb24uXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0cHVibGljIG93bkR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCBkZXNjcmlwdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0Lml0ZW0uZGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIGVycm9yQ2hpbGQ/OiBUZXN0VHJlZUVycm9yTWVzc2FnZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0ZXN0OiBJbnRlcm5hbFRlc3RJdGVtLFxuXHRcdHBhcmVudDogbnVsbCB8IFRyZWVUZXN0SXRlbUVsZW1lbnQsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGFkZGVkT3JSZW1vdmVkOiAobjogVGVzdEl0ZW1UcmVlRWxlbWVudCkgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoeyAuLi50ZXN0LCBpdGVtOiB7IC4uLnRlc3QuaXRlbSB9IH0sIHBhcmVudCk7XG5cdFx0dGhpcy51cGRhdGVFcnJvclZpc2liaWxpdHkoKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGUocGF0Y2g6IElUZXN0SXRlbVVwZGF0ZSkge1xuXHRcdGFwcGx5VGVzdEl0ZW1VcGRhdGUodGhpcy50ZXN0LCBwYXRjaCk7XG5cdFx0dGhpcy51cGRhdGVFcnJvclZpc2liaWxpdHkocGF0Y2gpO1xuXHRcdHRoaXMuZmlyZUNoYW5nZSgpO1xuXHR9XG5cblx0cHVibGljIGZpcmVDaGFuZ2UoKSB7XG5cdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXJyb3JWaXNpYmlsaXR5KHBhdGNoPzogSVRlc3RJdGVtVXBkYXRlKSB7XG5cdFx0aWYgKHRoaXMuZXJyb3JDaGlsZCAmJiAoIXRoaXMudGVzdC5pdGVtLmVycm9yIHx8IHBhdGNoPy5pdGVtPy5lcnJvcikpIHtcblx0XHRcdHRoaXMuYWRkZWRPclJlbW92ZWQodGhpcyk7XG5cdFx0XHR0aGlzLmNoaWxkcmVuLmRlbGV0ZSh0aGlzLmVycm9yQ2hpbGQpO1xuXHRcdFx0dGhpcy5lcnJvckNoaWxkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy50ZXN0Lml0ZW0uZXJyb3IgJiYgIXRoaXMuZXJyb3JDaGlsZCkge1xuXHRcdFx0dGhpcy5lcnJvckNoaWxkID0gbmV3IFRlc3RUcmVlRXJyb3JNZXNzYWdlKHRoaXMudGVzdC5pdGVtLmVycm9yLCB0aGlzKTtcblx0XHRcdHRoaXMuY2hpbGRyZW4uYWRkKHRoaXMuZXJyb3JDaGlsZCk7XG5cdFx0XHR0aGlzLmFkZGVkT3JSZW1vdmVkKHRoaXMpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFByb2plY3Rpb24gdGhhdCBsaXN0cyB0ZXN0cyBpbiB0aGVpciB0cmFkaXRpb25hbCB0cmVlIHZpZXcuXG4gKi9cbmV4cG9ydCBjbGFzcyBUcmVlUHJvamVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVzdFRyZWVQcm9qZWN0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjaGFuZ2VkUGFyZW50cyA9IG5ldyBTZXQ8VGVzdEl0ZW1UcmVlRWxlbWVudCB8IG51bGw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzb3J0ZWRQYXJlbnRzID0gbmV3IFNldDxUZXN0SXRlbVRyZWVFbGVtZW50IHwgbnVsbD4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIFRyZWVUZXN0SXRlbUVsZW1lbnQ+KCk7XG5cblx0LyoqXG5cdCAqIEdldHMgcm9vdCBlbGVtZW50cyBvZiB0aGUgdHJlZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0IHJvb3RzV2l0aENoaWxkcmVuKCk6IEl0ZXJhYmxlPFRyZWVUZXN0SXRlbUVsZW1lbnQ+IHtcblx0XHRjb25zdCByb290c0l0ID0gSXRlcmFibGUubWFwKHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5yb290SXRlbXMsIHIgPT4gdGhpcy5pdGVtcy5nZXQoci5pdGVtLmV4dElkKSk7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLmZpbHRlcihyb290c0l0LCAocik6IHIgaXMgVHJlZVRlc3RJdGVtRWxlbWVudCA9PiAhIXI/LmNoaWxkcmVuLnNpemUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25VcGRhdGUgPSB0aGlzLnVwZGF0ZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhc3RTdGF0ZTogSVNlcmlhbGl6ZWRUZXN0VHJlZUNvbGxhcHNlU3RhdGUsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0U2VydmljZS5vbkRpZFByb2Nlc3NEaWZmKChkaWZmKSA9PiB0aGlzLmFwcGx5RGlmZihkaWZmKSkpO1xuXG5cdFx0Ly8gd2hlbiB0ZXN0IHJlc3VsdHMgYXJlIGNsZWFyZWQsIHJlY2FsY3VsYXRlIGFsbCBzdGF0ZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZCgoZXZ0KSA9PiB7XG5cdFx0XHRpZiAoISgncmVtb3ZlZCcgaW4gZXZ0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgaW5UcmVlIG9mIFsuLi50aGlzLml0ZW1zLnZhbHVlcygpXS5zb3J0KChhLCBiKSA9PiBiLmRlcHRoIC0gYS5kZXB0aCkpIHtcblx0XHRcdFx0Y29uc3QgbG9va3VwID0gdGhpcy5yZXN1bHRzLmdldFN0YXRlQnlJZChpblRyZWUudGVzdC5pdGVtLmV4dElkKT8uWzFdO1xuXHRcdFx0XHRpblRyZWUub3duRHVyYXRpb24gPSBsb29rdXA/Lm93bkR1cmF0aW9uO1xuXHRcdFx0XHRyZWZyZXNoQ29tcHV0ZWRTdGF0ZShjb21wdXRlZFN0YXRlQWNjZXNzb3IsIGluVHJlZSwgbG9va3VwPy5vd25Db21wdXRlZFN0YXRlID8/IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCkuZm9yRWFjaChpID0+IGkuZmlyZUNoYW5nZSgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyB3aGVuIHRlc3Qgc3RhdGVzIGNoYW5nZSwgcmVmbGVjdCBpbiB0aGUgdHJlZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdHMub25UZXN0Q2hhbmdlZChldiA9PiB7XG5cdFx0XHRpZiAoZXYucmVhc29uID09PSBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5OZXdNZXNzYWdlKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gbm8gZWZmZWN0IGluIHRoZSB0cmVlXG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXN1bHQgPSBldi5pdGVtO1xuXHRcdFx0Ly8gaWYgdGhlIHN0YXRlIGlzIHVuc2V0LCBvciB0aGUgbGF0ZXN0IHJ1biBpcyBub3QgbWFraW5nIHRoZSBjaGFuZ2UsXG5cdFx0XHQvLyBkb3VibGUgY2hlY2sgdGhhdCBpdCdzIHZhbGlkLiBSZXRpcmUgY2FsbHMgbWlnaHQgY2F1c2UgcHJldmlvdXNcblx0XHRcdC8vIGVtaXQgYSBzdGF0ZSBjaGFuZ2UgZm9yIGEgdGVzdCBydW4gdGhhdCdzIGFscmVhZHkgbG9uZyBjb21wbGV0ZWQuXG5cdFx0XHRpZiAocmVzdWx0Lm93bkNvbXB1dGVkU3RhdGUgPT09IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCB8fCBldi5yZXN1bHQgIT09IHJlc3VsdHMucmVzdWx0c1swXSkge1xuXHRcdFx0XHRjb25zdCBmYWxsYmFjayA9IHJlc3VsdHMuZ2V0U3RhdGVCeUlkKHJlc3VsdC5pdGVtLmV4dElkKTtcblx0XHRcdFx0aWYgKGZhbGxiYWNrKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gZmFsbGJhY2tbMV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXMuZ2V0KHJlc3VsdC5pdGVtLmV4dElkKTtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgcmVmcmVzaGluZyB0aGUgZHVyYXRpb24gaWYgd2UgY2FuIHRyaXZpYWxseSB0ZWxsIGl0IGRpZG4ndCBjaGFuZ2UuXG5cdFx0XHRjb25zdCByZWZyZXNoRHVyYXRpb24gPSBldi5yZWFzb24gPT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlICYmIGV2LnByZXZpb3VzT3duRHVyYXRpb24gIT09IHJlc3VsdC5vd25EdXJhdGlvbjtcblx0XHRcdC8vIEZvciBpdGVtcyB3aXRob3V0IGNoaWxkcmVuLCBhbHdheXMgdXNlIHRoZSBjb21wdXRlZCBzdGF0ZS4gVGhleSBhcmVcblx0XHRcdC8vIGVpdGhlciBsZWF2ZXMgKGZvciB3aGljaCBpdCdzIGZpbmUpIG9yIG5vZGVzIHdoZXJlIHdlIGhhdmVuJ3QgZXhwYW5kZWRcblx0XHRcdC8vIGNoaWxkcmVuIGFuZCBzaG91bGQgdHJ1c3Qgd2hhdGV2ZXIgdGhlIHJlc3VsdCBzZXJ2aWNlIGdpdmVzIHVzLlxuXHRcdFx0Y29uc3QgZXhwbGljaXRDb21wdXRlZCA9IGl0ZW0uY2hpbGRyZW4uc2l6ZSA/IHVuZGVmaW5lZCA6IHJlc3VsdC5jb21wdXRlZFN0YXRlO1xuXG5cdFx0XHRpdGVtLnJldGlyZWQgPSAhIXJlc3VsdC5yZXRpcmVkO1xuXHRcdFx0aXRlbS5vd25TdGF0ZSA9IHJlc3VsdC5vd25Db21wdXRlZFN0YXRlO1xuXHRcdFx0aXRlbS5vd25EdXJhdGlvbiA9IHJlc3VsdC5vd25EdXJhdGlvbjtcblx0XHRcdGl0ZW0uZmlyZUNoYW5nZSgpO1xuXG5cdFx0XHRyZWZyZXNoQ29tcHV0ZWRTdGF0ZShjb21wdXRlZFN0YXRlQWNjZXNzb3IsIGl0ZW0sIGV4cGxpY2l0Q29tcHV0ZWQsIHJlZnJlc2hEdXJhdGlvbikuZm9yRWFjaChpID0+IGkuZmlyZUNoYW5nZSgpKTtcblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGVzdFNlcnZpY2UuY29sbGVjdGlvbi5hbGwpIHtcblx0XHRcdHRoaXMuc3RvcmVJdGVtKHRoaXMuY3JlYXRlSXRlbSh0ZXN0KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0RWxlbWVudEJ5VGVzdElkKHRlc3RJZDogc3RyaW5nKTogVGVzdEl0ZW1UcmVlRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZ2V0KHRlc3RJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHByaXZhdGUgYXBwbHlEaWZmKGRpZmY6IFRlc3RzRGlmZikge1xuXHRcdGZvciAoY29uc3Qgb3Agb2YgZGlmZikge1xuXHRcdFx0c3dpdGNoIChvcC5vcCkge1xuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLkFkZDoge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmNyZWF0ZUl0ZW0ob3AuaXRlbSk7XG5cdFx0XHRcdFx0dGhpcy5zdG9yZUl0ZW0oaXRlbSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLlVwZGF0ZToge1xuXHRcdFx0XHRcdGNvbnN0IHBhdGNoID0gb3AuaXRlbTtcblx0XHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuaXRlbXMuZ2V0KHBhdGNoLmV4dElkKTtcblx0XHRcdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBwYXJlbnQgbmVlZHMgdG8gYmUgcmUtcmVuZGVyZWQgb24gYW4gZXhwYW5kIHVwZGF0ZSwgc28gdGhhdCBpdHNcblx0XHRcdFx0XHQvLyBjaGlsZHJlbiBhcmUgcmV3cml0dGVuLlxuXHRcdFx0XHRcdGNvbnN0IG5lZWRzUGFyZW50VXBkYXRlID0gZXhpc3RpbmcudGVzdC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSAmJiBwYXRjaC5leHBhbmQ7XG5cdFx0XHRcdFx0ZXhpc3RpbmcudXBkYXRlKHBhdGNoKTtcblx0XHRcdFx0XHRpZiAobmVlZHNQYXJlbnRVcGRhdGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2hhbmdlZFBhcmVudHMuYWRkKGV4aXN0aW5nLnBhcmVudCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucmVzb3J0ZWRQYXJlbnRzLmFkZChleGlzdGluZy5wYXJlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuUmVtb3ZlOiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9SZW1vdmUgPSB0aGlzLml0ZW1zLmdldChvcC5pdGVtSWQpO1xuXHRcdFx0XHRcdGlmICghdG9SZW1vdmUpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJlbW92aW5nIHRoZSBmaXJzdCBlbGVtZW50IHdpbGwgY2F1c2UgdGhlIHJvb3QgdG8gYmUgaGlkZGVuLlxuXHRcdFx0XHRcdC8vIENoYW5naW5nIGZpcnN0LWxldmVsIGVsZW1lbnRzIHdpbGwgbmVlZCB0aGUgcm9vdCB0byByZS1yZW5kZXIgaWZcblx0XHRcdFx0XHQvLyB0aGVyZSBhcmUgbm8gb3RoZXIgY29udHJvbGxlcnMgd2l0aCBpdGVtcy5cblx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSB0b1JlbW92ZS5wYXJlbnQ7XG5cdFx0XHRcdFx0Y29uc3QgYWZmZWN0c1Jvb3RFbGVtZW50ID0gdG9SZW1vdmUuZGVwdGggPT09IDEgJiYgKHBhcmVudD8uY2hpbGRyZW4uc2l6ZSA9PT0gMSB8fCAhSXRlcmFibGUuc29tZSh0aGlzLnJvb3RzV2l0aENoaWxkcmVuLCAoXywgaSkgPT4gaSA9PT0gMSkpO1xuXHRcdFx0XHRcdHRoaXMuY2hhbmdlZFBhcmVudHMuYWRkKGFmZmVjdHNSb290RWxlbWVudCA/IG51bGwgOiBwYXJlbnQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgcXVldWU6IEl0ZXJhYmxlPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PltdID0gW1t0b1JlbW92ZV1dO1xuXHRcdFx0XHRcdHdoaWxlIChxdWV1ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBxdWV1ZS5wb3AoKSEpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBUcmVlVGVzdEl0ZW1FbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0cXVldWUucHVzaCh0aGlzLnVuc3RvcmVJdGVtKGl0ZW0pKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChwYXJlbnQgaW5zdGFuY2VvZiBUcmVlVGVzdEl0ZW1FbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRyZWZyZXNoQ29tcHV0ZWRTdGF0ZShjb21wdXRlZFN0YXRlQWNjZXNzb3IsIHBhcmVudCwgdW5kZWZpbmVkLCAhIXBhcmVudC5kdXJhdGlvbikuZm9yRWFjaChpID0+IGkuZmlyZUNoYW5nZSgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGlmZi5sZW5ndGggIT09IDApIHtcblx0XHRcdHRoaXMudXBkYXRlRW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXBwbHlUbyh0cmVlOiBPYmplY3RUcmVlPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPikge1xuXHRcdGZvciAoY29uc3QgcGFyZW50IG9mIHRoaXMuY2hhbmdlZFBhcmVudHMpIHtcblx0XHRcdGlmICghcGFyZW50IHx8IHRyZWUuaGFzRWxlbWVudChwYXJlbnQpKSB7XG5cdFx0XHRcdHRyZWUuc2V0Q2hpbGRyZW4ocGFyZW50LCBnZXRDaGlsZHJlbkZvclBhcmVudCh0aGlzLmxhc3RTdGF0ZSwgdGhpcy5yb290c1dpdGhDaGlsZHJlbiwgcGFyZW50KSwgeyBkaWZmSWRlbnRpdHlQcm92aWRlcjogdGVzdElkZW50aXR5UHJvdmlkZXIgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwYXJlbnQgb2YgdGhpcy5yZXNvcnRlZFBhcmVudHMpIHtcblx0XHRcdGlmICghcGFyZW50IHx8IHRyZWUuaGFzRWxlbWVudChwYXJlbnQpKSB7XG5cdFx0XHRcdHRyZWUucmVzb3J0KHBhcmVudCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY2hhbmdlZFBhcmVudHMuY2xlYXIoKTtcblx0XHR0aGlzLnJlc29ydGVkUGFyZW50cy5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZXhwYW5kRWxlbWVudChlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50LCBkZXB0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIFRyZWVUZXN0SXRlbUVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQudGVzdC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5leHBhbmQoZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQsIGRlcHRoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSXRlbShpdGVtOiBJbnRlcm5hbFRlc3RJdGVtKTogVHJlZVRlc3RJdGVtRWxlbWVudCB7XG5cdFx0Y29uc3QgcGFyZW50SWQgPSBUZXN0SWQucGFyZW50SWQoaXRlbS5pdGVtLmV4dElkKTtcblx0XHRjb25zdCBwYXJlbnQgPSBwYXJlbnRJZCA/IHRoaXMuaXRlbXMuZ2V0KHBhcmVudElkKSEgOiBudWxsO1xuXHRcdHJldHVybiBuZXcgVHJlZVRlc3RJdGVtRWxlbWVudChpdGVtLCBwYXJlbnQsIG4gPT4gdGhpcy5jaGFuZ2VkUGFyZW50cy5hZGQobikpO1xuXHR9XG5cblx0cHJpdmF0ZSB1bnN0b3JlSXRlbSh0cmVlRWxlbWVudDogVHJlZVRlc3RJdGVtRWxlbWVudCkge1xuXHRcdGNvbnN0IHBhcmVudCA9IHRyZWVFbGVtZW50LnBhcmVudDtcblx0XHRwYXJlbnQ/LmNoaWxkcmVuLmRlbGV0ZSh0cmVlRWxlbWVudCk7XG5cdFx0dGhpcy5pdGVtcy5kZWxldGUodHJlZUVsZW1lbnQudGVzdC5pdGVtLmV4dElkKTtcblx0XHRyZXR1cm4gdHJlZUVsZW1lbnQuY2hpbGRyZW47XG5cdH1cblxuXHRwcml2YXRlIHN0b3JlSXRlbSh0cmVlRWxlbWVudDogVHJlZVRlc3RJdGVtRWxlbWVudCkge1xuXHRcdHRyZWVFbGVtZW50LnBhcmVudD8uY2hpbGRyZW4uYWRkKHRyZWVFbGVtZW50KTtcblx0XHR0aGlzLml0ZW1zLnNldCh0cmVlRWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQsIHRyZWVFbGVtZW50KTtcblxuXHRcdC8vIFRoZSBmaXJzdCBlbGVtZW50IHdpbGwgY2F1c2UgdGhlIHJvb3QgdG8gYmUgc2hvd24uIFRoZSBmaXJzdCBlbGVtZW50IG9mXG5cdFx0Ly8gYSBwYXJlbnQgbWF5IG5lZWQgdG8gcmUtcmVuZGVyIGl0IGZvciAjMjA0ODA1LlxuXHRcdGNvbnN0IGFmZmVjdHNQYXJlbnQgPSB0cmVlRWxlbWVudC5wYXJlbnQ/LmNoaWxkcmVuLnNpemUgPT09IDE7XG5cdFx0Y29uc3QgYWZmZWN0ZWRQYXJlbnQgPSBhZmZlY3RzUGFyZW50ID8gdHJlZUVsZW1lbnQucGFyZW50LnBhcmVudCA6IHRyZWVFbGVtZW50LnBhcmVudDtcblx0XHR0aGlzLmNoYW5nZWRQYXJlbnRzLmFkZChhZmZlY3RlZFBhcmVudCk7XG5cdFx0aWYgKGFmZmVjdGVkUGFyZW50Py5kZXB0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5jaGFuZ2VkUGFyZW50cy5hZGQobnVsbCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRyZWVFbGVtZW50LmRlcHRoID09PSAwIHx8IGlzQ29sbGFwc2VkSW5TZXJpYWxpemVkVGVzdFRyZWUodGhpcy5sYXN0U3RhdGUsIHRyZWVFbGVtZW50LnRlc3QuaXRlbS5leHRJZCkgPT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLmV4cGFuZEVsZW1lbnQodHJlZUVsZW1lbnQsIDApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZTdGF0ZSA9IHRoaXMucmVzdWx0cy5nZXRTdGF0ZUJ5SWQodHJlZUVsZW1lbnQudGVzdC5pdGVtLmV4dElkKT8uWzFdO1xuXHRcdGlmIChwcmV2U3RhdGUpIHtcblx0XHRcdHRyZWVFbGVtZW50LnJldGlyZWQgPSAhIXByZXZTdGF0ZS5yZXRpcmVkO1xuXHRcdFx0dHJlZUVsZW1lbnQub3duU3RhdGUgPSBwcmV2U3RhdGUuY29tcHV0ZWRTdGF0ZTtcblx0XHRcdHRyZWVFbGVtZW50Lm93bkR1cmF0aW9uID0gcHJldlN0YXRlLm93bkR1cmF0aW9uO1xuXG5cdFx0XHRyZWZyZXNoQ29tcHV0ZWRTdGF0ZShjb21wdXRlZFN0YXRlQWNjZXNzb3IsIHRyZWVFbGVtZW50LCB1bmRlZmluZWQsICEhdHJlZUVsZW1lbnQub3duRHVyYXRpb24pLmZvckVhY2goaSA9PiBpLmZpcmVDaGFuZ2UoKSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUV4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUF1RCxxQkFBcUIsc0JBQXNCLHNCQUFzQiw0QkFBNEI7QUFDcEosU0FBMkMsdUNBQXVDO0FBQ2xG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
