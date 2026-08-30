import { Barrier, isThenable, RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { assertNever } from "../../../../base/common/assert.js";
import { applyTestItemUpdate, namespaceTestTag, TestDiffOpType, TestItemExpandState } from "./testTypes.js";
import { TestId } from "./testId.js";
var TestItemEventOp = /* @__PURE__ */ ((TestItemEventOp2) => {
  TestItemEventOp2[TestItemEventOp2["Upsert"] = 0] = "Upsert";
  TestItemEventOp2[TestItemEventOp2["SetTags"] = 1] = "SetTags";
  TestItemEventOp2[TestItemEventOp2["UpdateCanResolveChildren"] = 2] = "UpdateCanResolveChildren";
  TestItemEventOp2[TestItemEventOp2["RemoveChild"] = 3] = "RemoveChild";
  TestItemEventOp2[TestItemEventOp2["SetProp"] = 4] = "SetProp";
  TestItemEventOp2[TestItemEventOp2["Bulk"] = 5] = "Bulk";
  TestItemEventOp2[TestItemEventOp2["DocumentSynced"] = 6] = "DocumentSynced";
  return TestItemEventOp2;
})(TestItemEventOp || {});
const strictEqualComparator = (a, b) => a === b;
const diffableProps = {
  range: (a, b) => {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.equalsRange(b);
  },
  busy: strictEqualComparator,
  label: strictEqualComparator,
  description: strictEqualComparator,
  error: strictEqualComparator,
  sortText: strictEqualComparator,
  tags: (a, b) => {
    if (a.length !== b.length) {
      return false;
    }
    if (a.some((t1) => !b.includes(t1))) {
      return false;
    }
    return true;
  }
};
const diffableEntries = Object.entries(diffableProps);
const diffTestItems = (a, b) => {
  let output;
  for (const [key, cmp] of diffableEntries) {
    if (!cmp(a[key], b[key])) {
      if (output) {
        output[key] = b[key];
      } else {
        output = { [key]: b[key] };
      }
    }
  }
  return output;
};
class TestItemCollection extends Disposable {
  constructor(options) {
    super();
    this.options = options;
    this.debounceSendDiff = this._register(new RunOnceScheduler(() => this.flushDiff(), 200));
    this.diffOpEmitter = this._register(new Emitter());
    this.tree = /* @__PURE__ */ new Map();
    this.tags = /* @__PURE__ */ new Map();
    this.diff = [];
    /**
     * Fires when an operation happens that should result in a diff.
     */
    this.onDidGenerateDiff = this.diffOpEmitter.event;
    this.root.canResolveChildren = true;
    this.upsertItem(this.root, void 0);
  }
  get root() {
    return this.options.root;
  }
  /**
   * Handler used for expanding test items.
   */
  set resolveHandler(handler) {
    this._resolveHandler = handler;
    for (const test of this.tree.values()) {
      this.updateExpandability(test);
    }
  }
  get resolveHandler() {
    return this._resolveHandler;
  }
  /**
   * Gets a diff of all changes that have been made, and clears the diff queue.
   */
  collectDiff() {
    const diff = this.diff;
    this.diff = [];
    return diff;
  }
  /**
   * Pushes a new diff entry onto the collected diff list.
   */
  pushDiff(diff) {
    switch (diff.op) {
      case TestDiffOpType.DocumentSynced: {
        for (const existing of this.diff) {
          if (existing.op === TestDiffOpType.DocumentSynced && existing.uri === diff.uri) {
            existing.docv = diff.docv;
            return;
          }
        }
        break;
      }
      case TestDiffOpType.Update: {
        const last = this.diff[this.diff.length - 1];
        if (last) {
          if (last.op === TestDiffOpType.Update && last.item.extId === diff.item.extId) {
            applyTestItemUpdate(last.item, diff.item);
            return;
          }
          if (last.op === TestDiffOpType.Add && last.item.item.extId === diff.item.extId) {
            applyTestItemUpdate(last.item, diff.item);
            return;
          }
        }
        break;
      }
    }
    this.diff.push(diff);
    if (!this.debounceSendDiff.isScheduled()) {
      this.debounceSendDiff.schedule();
    }
  }
  /**
   * Expands the test and the given number of `levels` of children. If levels
   * is < 0, then all children will be expanded. If it's 0, then only this
   * item will be expanded.
   */
  expand(testId, levels) {
    const internal = this.tree.get(testId);
    if (!internal) {
      return;
    }
    if (internal.expandLevels === void 0 || levels > internal.expandLevels) {
      internal.expandLevels = levels;
    }
    if (internal.expand === TestItemExpandState.Expandable) {
      const r = this.resolveChildren(internal);
      return !r.isOpen() ? r.wait().then(() => this.expandChildren(internal, levels - 1)) : this.expandChildren(internal, levels - 1);
    } else if (internal.expand === TestItemExpandState.Expanded) {
      return internal.resolveBarrier?.isOpen() === false ? internal.resolveBarrier.wait().then(() => this.expandChildren(internal, levels - 1)) : this.expandChildren(internal, levels - 1);
    }
  }
  dispose() {
    for (const item of this.tree.values()) {
      this.options.getApiFor(item.actual).listener = void 0;
    }
    this.tree.clear();
    this.diff = [];
    super.dispose();
  }
  onTestItemEvent(internal, evt) {
    switch (evt.op) {
      case 3 /* RemoveChild */:
        this.removeItem(TestId.joinToString(internal.fullId, evt.id));
        break;
      case 0 /* Upsert */:
        this.upsertItem(evt.item, internal);
        break;
      case 5 /* Bulk */:
        for (const op of evt.ops) {
          this.onTestItemEvent(internal, op);
        }
        break;
      case 1 /* SetTags */:
        this.diffTagRefs(evt.new, evt.old, internal.fullId.toString());
        break;
      case 2 /* UpdateCanResolveChildren */:
        this.updateExpandability(internal);
        break;
      case 4 /* SetProp */:
        this.pushDiff({
          op: TestDiffOpType.Update,
          item: {
            extId: internal.fullId.toString(),
            item: evt.update
          }
        });
        break;
      case 6 /* DocumentSynced */:
        this.documentSynced(internal.actual.uri);
        break;
      default:
        assertNever(evt);
    }
  }
  documentSynced(uri) {
    if (uri) {
      this.pushDiff({
        op: TestDiffOpType.DocumentSynced,
        uri,
        docv: this.options.getDocumentVersion(uri)
      });
    }
  }
  upsertItem(actual, parent) {
    const fullId = TestId.fromExtHostTestItem(actual, this.root.id, parent?.actual);
    const privateApi = this.options.getApiFor(actual);
    if (privateApi.parent && privateApi.parent !== parent?.actual) {
      this.options.getChildren(privateApi.parent).delete(actual.id);
    }
    let internal = this.tree.get(fullId.toString());
    if (!internal) {
      internal = {
        fullId,
        actual,
        expandLevels: parent?.expandLevels ? parent.expandLevels - 1 : void 0,
        expand: TestItemExpandState.NotExpandable
        // updated by `connectItemAndChildren`
      };
      actual.tags.forEach(this.incrementTagRefs, this);
      this.tree.set(internal.fullId.toString(), internal);
      this.setItemParent(actual, parent);
      this.pushDiff({
        op: TestDiffOpType.Add,
        item: {
          controllerId: this.options.controllerId,
          expand: internal.expand,
          item: this.options.toITestItem(actual)
        }
      });
      this.connectItemAndChildren(actual, internal, parent);
      return;
    }
    if (internal.actual === actual) {
      this.connectItem(actual, internal, parent);
      return;
    }
    if (internal.actual.uri?.toString() !== actual.uri?.toString()) {
      this.removeItem(fullId.toString());
      return this.upsertItem(actual, parent);
    }
    const oldChildren = this.options.getChildren(internal.actual);
    const oldActual = internal.actual;
    const update = diffTestItems(this.options.toITestItem(oldActual), this.options.toITestItem(actual));
    this.options.getApiFor(oldActual).listener = void 0;
    internal.actual = actual;
    internal.resolveBarrier = void 0;
    internal.expand = TestItemExpandState.NotExpandable;
    if (update) {
      if (update.hasOwnProperty("tags")) {
        this.diffTagRefs(actual.tags, oldActual.tags, fullId.toString());
        delete update.tags;
      }
      this.onTestItemEvent(internal, { op: 4 /* SetProp */, update });
    }
    this.connectItemAndChildren(actual, internal, parent);
    for (const [_, child] of oldChildren) {
      if (!this.options.getChildren(actual).get(child.id)) {
        this.removeItem(TestId.joinToString(fullId, child.id));
      }
    }
    const expandLevels = internal.expandLevels;
    if (expandLevels !== void 0) {
      queueMicrotask(() => {
        if (internal.expand === TestItemExpandState.Expandable) {
          internal.expandLevels = void 0;
          this.expand(fullId.toString(), expandLevels);
        }
      });
    }
    this.documentSynced(internal.actual.uri);
  }
  diffTagRefs(newTags, oldTags, extId) {
    const toDelete = new Set(oldTags.map((t) => t.id));
    for (const tag of newTags) {
      if (!toDelete.delete(tag.id)) {
        this.incrementTagRefs(tag);
      }
    }
    this.pushDiff({
      op: TestDiffOpType.Update,
      item: { extId, item: { tags: newTags.map((v) => namespaceTestTag(this.options.controllerId, v.id)) } }
    });
    toDelete.forEach(this.decrementTagRefs, this);
  }
  incrementTagRefs(tag) {
    const existing = this.tags.get(tag.id);
    if (existing) {
      existing.refCount++;
    } else {
      this.tags.set(tag.id, { refCount: 1 });
      this.pushDiff({
        op: TestDiffOpType.AddTag,
        tag: {
          id: namespaceTestTag(this.options.controllerId, tag.id)
        }
      });
    }
  }
  decrementTagRefs(tagId) {
    const existing = this.tags.get(tagId);
    if (existing && !--existing.refCount) {
      this.tags.delete(tagId);
      this.pushDiff({ op: TestDiffOpType.RemoveTag, id: namespaceTestTag(this.options.controllerId, tagId) });
    }
  }
  setItemParent(actual, parent) {
    this.options.getApiFor(actual).parent = parent && parent.actual !== this.root ? parent.actual : void 0;
  }
  connectItem(actual, internal, parent) {
    this.setItemParent(actual, parent);
    const api = this.options.getApiFor(actual);
    api.parent = parent?.actual;
    api.listener = (evt) => this.onTestItemEvent(internal, evt);
    this.updateExpandability(internal);
  }
  connectItemAndChildren(actual, internal, parent) {
    this.connectItem(actual, internal, parent);
    for (const [_, child] of this.options.getChildren(actual)) {
      this.upsertItem(child, internal);
    }
  }
  /**
   * Updates the `expand` state of the item. Should be called whenever the
   * resolved state of the item changes. Can automatically expand the item
   * if requested by a consumer.
   */
  updateExpandability(internal) {
    let newState;
    if (!this._resolveHandler) {
      newState = TestItemExpandState.NotExpandable;
    } else if (internal.resolveBarrier) {
      newState = internal.resolveBarrier.isOpen() ? TestItemExpandState.Expanded : TestItemExpandState.BusyExpanding;
    } else {
      newState = internal.actual.canResolveChildren ? TestItemExpandState.Expandable : TestItemExpandState.NotExpandable;
    }
    if (newState === internal.expand) {
      return;
    }
    internal.expand = newState;
    this.pushDiff({ op: TestDiffOpType.Update, item: { extId: internal.fullId.toString(), expand: newState } });
    if (newState === TestItemExpandState.Expandable && internal.expandLevels !== void 0) {
      this.resolveChildren(internal);
    }
  }
  /**
   * Expands all children of the item, "levels" deep. If levels is 0, only
   * the children will be expanded. If it's 1, the children and their children
   * will be expanded. If it's <0, it's a no-op.
   */
  expandChildren(internal, levels) {
    if (levels < 0) {
      return;
    }
    const expandRequests = [];
    for (const [_, child] of this.options.getChildren(internal.actual)) {
      const promise = this.expand(TestId.joinToString(internal.fullId, child.id), levels);
      if (isThenable(promise)) {
        expandRequests.push(promise);
      }
    }
    if (expandRequests.length) {
      return Promise.all(expandRequests).then(() => {
      });
    }
  }
  /**
   * Calls `discoverChildren` on the item, refreshing all its tests.
   */
  resolveChildren(internal) {
    if (internal.resolveBarrier) {
      return internal.resolveBarrier;
    }
    if (!this._resolveHandler) {
      const b = new Barrier();
      b.open();
      return b;
    }
    internal.expand = TestItemExpandState.BusyExpanding;
    this.pushExpandStateUpdate(internal);
    const barrier = internal.resolveBarrier = new Barrier();
    const applyError = (err) => {
      console.error(`Unhandled error in resolveHandler of test controller "${this.options.controllerId}"`, err);
    };
    let r;
    try {
      r = this._resolveHandler(internal.actual === this.root ? void 0 : internal.actual);
    } catch (err) {
      applyError(err);
    }
    if (isThenable(r)) {
      r.catch(applyError).then(() => {
        barrier.open();
        this.updateExpandability(internal);
      });
    } else {
      barrier.open();
      this.updateExpandability(internal);
    }
    return internal.resolveBarrier;
  }
  pushExpandStateUpdate(internal) {
    this.pushDiff({ op: TestDiffOpType.Update, item: { extId: internal.fullId.toString(), expand: internal.expand } });
  }
  removeItem(childId) {
    const childItem = this.tree.get(childId);
    if (!childItem) {
      throw new Error("attempting to remove non-existent child");
    }
    this.pushDiff({ op: TestDiffOpType.Remove, itemId: childId });
    const queue = [childItem];
    while (queue.length) {
      const item = queue.pop();
      if (!item) {
        continue;
      }
      this.options.getApiFor(item.actual).listener = void 0;
      for (const tag of item.actual.tags) {
        this.decrementTagRefs(tag.id);
      }
      this.tree.delete(item.fullId.toString());
      for (const [_, child] of this.options.getChildren(item.actual)) {
        queue.push(this.tree.get(TestId.joinToString(item.fullId, child.id)));
      }
    }
  }
  /**
   * Immediately emits any pending diffs on the collection.
   */
  flushDiff() {
    const diff = this.collectDiff();
    if (diff.length) {
      this.diffOpEmitter.fire(diff);
    }
  }
}
class DuplicateTestItemError extends Error {
  constructor(id) {
    super(`Attempted to insert a duplicate test item ID ${id}`);
  }
}
class InvalidTestItemError extends Error {
  constructor(id) {
    super(`TestItem with ID "${id}" is invalid. Make sure to create it from the createTestItem method.`);
  }
}
class MixedTestItemController extends Error {
  constructor(id, ctrlA, ctrlB) {
    super(`TestItem with ID "${id}" is from controller "${ctrlA}" and cannot be added as a child of an item from controller "${ctrlB}".`);
  }
}
const createTestItemChildren = (api, getApi, checkCtor) => {
  let mapped = /* @__PURE__ */ new Map();
  return {
    /** @inheritdoc */
    get size() {
      return mapped.size;
    },
    /** @inheritdoc */
    forEach(callback, thisArg) {
      for (const item of mapped.values()) {
        callback.call(thisArg, item, this);
      }
    },
    /** @inheritdoc */
    [Symbol.iterator]() {
      return mapped.entries();
    },
    /** @inheritdoc */
    replace(items) {
      const newMapped = /* @__PURE__ */ new Map();
      const toDelete = new Set(mapped.keys());
      const bulk = { op: 5 /* Bulk */, ops: [] };
      for (const item of items) {
        if (!(item instanceof checkCtor)) {
          throw new InvalidTestItemError(item.id);
        }
        const itemController = getApi(item).controllerId;
        if (itemController !== api.controllerId) {
          throw new MixedTestItemController(item.id, itemController, api.controllerId);
        }
        if (newMapped.has(item.id)) {
          throw new DuplicateTestItemError(item.id);
        }
        newMapped.set(item.id, item);
        toDelete.delete(item.id);
        bulk.ops.push({ op: 0 /* Upsert */, item });
      }
      for (const id of toDelete.keys()) {
        bulk.ops.push({ op: 3 /* RemoveChild */, id });
      }
      api.listener?.(bulk);
      mapped = newMapped;
    },
    /** @inheritdoc */
    add(item) {
      if (!(item instanceof checkCtor)) {
        throw new InvalidTestItemError(item.id);
      }
      mapped.set(item.id, item);
      api.listener?.({ op: 0 /* Upsert */, item });
    },
    /** @inheritdoc */
    delete(id) {
      if (mapped.delete(id)) {
        api.listener?.({ op: 3 /* RemoveChild */, id });
      }
    },
    /** @inheritdoc */
    get(itemId) {
      return mapped.get(itemId);
    },
    /** JSON serialization function. */
    toJSON() {
      return Array.from(mapped.values());
    }
  };
};
export {
  DuplicateTestItemError,
  InvalidTestItemError,
  MixedTestItemController,
  TestItemCollection,
  TestItemEventOp,
  createTestItemChildren
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdEl0ZW1Db2xsZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQmFycmllciwgaXNUaGVuYWJsZSwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IGFwcGx5VGVzdEl0ZW1VcGRhdGUsIElUZXN0SXRlbSwgSVRlc3RUYWcsIG5hbWVzcGFjZVRlc3RUYWcsIFRlc3REaWZmT3BUeXBlLCBUZXN0SXRlbUV4cGFuZFN0YXRlLCBUZXN0c0RpZmYsIFRlc3RzRGlmZk9wIH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5pbnRlcmZhY2UgQ29sbGVjdGlvbkl0ZW08VD4ge1xuXHRyZWFkb25seSBmdWxsSWQ6IFRlc3RJZDtcblx0YWN0dWFsOiBUO1xuXHRleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGU7XG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgbGV2ZWxzIG9mIGl0ZW1zIGJlbG93IHRoaXMgb25lIHRoYXQgYXJlIGV4cGFuZGVkLiBNYXkgYmUgaW5maW5pdGUuXG5cdCAqL1xuXHRleHBhbmRMZXZlbHM/OiBudW1iZXI7XG5cdHJlc29sdmVCYXJyaWVyPzogQmFycmllcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdEl0ZW1FdmVudE9wIHtcblx0VXBzZXJ0LFxuXHRTZXRUYWdzLFxuXHRVcGRhdGVDYW5SZXNvbHZlQ2hpbGRyZW4sXG5cdFJlbW92ZUNoaWxkLFxuXHRTZXRQcm9wLFxuXHRCdWxrLFxuXHREb2N1bWVudFN5bmNlZCxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1VcHNlcnRDaGlsZCB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuVXBzZXJ0O1xuXHRpdGVtOiBJVGVzdEl0ZW1MaWtlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbVVwZGF0ZUNhblJlc29sdmVDaGlsZHJlbiB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuVXBkYXRlQ2FuUmVzb2x2ZUNoaWxkcmVuO1xuXHRzdGF0ZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1TZXRUYWdzIHtcblx0b3A6IFRlc3RJdGVtRXZlbnRPcC5TZXRUYWdzO1xuXHRuZXc6IElUZXN0VGFnW107XG5cdG9sZDogSVRlc3RUYWdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1SZW1vdmVDaGlsZCB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuUmVtb3ZlQ2hpbGQ7XG5cdGlkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtU2V0UHJvcCB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuU2V0UHJvcDtcblx0dXBkYXRlOiBQYXJ0aWFsPElUZXN0SXRlbT47XG59XG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbUJ1bGtSZXBsYWNlIHtcblx0b3A6IFRlc3RJdGVtRXZlbnRPcC5CdWxrO1xuXHRvcHM6IChJVGVzdEl0ZW1VcHNlcnRDaGlsZCB8IElUZXN0SXRlbVJlbW92ZUNoaWxkKVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbURvY3VtZW50U3luY2VkIHtcblx0b3A6IFRlc3RJdGVtRXZlbnRPcC5Eb2N1bWVudFN5bmNlZDtcbn1cblxuZXhwb3J0IHR5cGUgRXh0SG9zdFRlc3RJdGVtRXZlbnQgPVxuXHR8IElUZXN0SXRlbVNldFRhZ3Ncblx0fCBJVGVzdEl0ZW1VcHNlcnRDaGlsZFxuXHR8IElUZXN0SXRlbVJlbW92ZUNoaWxkXG5cdHwgSVRlc3RJdGVtVXBkYXRlQ2FuUmVzb2x2ZUNoaWxkcmVuXG5cdHwgSVRlc3RJdGVtU2V0UHJvcFxuXHR8IElUZXN0SXRlbUJ1bGtSZXBsYWNlXG5cdHwgSVRlc3RJdGVtRG9jdW1lbnRTeW5jZWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtQXBpPFQ+IHtcblx0Y29udHJvbGxlcklkOiBzdHJpbmc7XG5cdHBhcmVudD86IFQ7XG5cdGxpc3RlbmVyPzogKGV2dDogRXh0SG9zdFRlc3RJdGVtRXZlbnQpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtQ29sbGVjdGlvbk9wdGlvbnM8VD4ge1xuXHQvKiogQ29udHJvbGxlciBJRCB0byB1c2UgdG8gcHJlZml4IHRoZXNlIHRlc3QgaXRlbXMuICovXG5cdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXG5cdC8qKiBHZXRzIHRoZSBkb2N1bWVudCB2ZXJzaW9uIGF0IHRoZSBnaXZlbiBVUkksIGlmIGl0J3Mgb3BlbiAqL1xuXHRnZXREb2N1bWVudFZlcnNpb24odXJpOiBVUkkgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqIEdldHMgQVBJIGZvciB0aGUgZ2l2ZW4gdGVzdCBpdGVtLCB1c2VkIHRvIGxpc3RlbiBmb3IgZXZlbnRzIGFuZCBzZXQgcGFyZW50cy4gKi9cblx0Z2V0QXBpRm9yKGl0ZW06IFQpOiBJVGVzdEl0ZW1BcGk8VD47XG5cblx0LyoqIENvbnZlcnRzIHRoZSBmdWxsIHRlc3QgaXRlbSB0byB0aGUgY29tbW9uIGludGVyZmFjZS4gKi9cblx0dG9JVGVzdEl0ZW0oaXRlbTogVCk6IElUZXN0SXRlbTtcblxuXHQvKiogR2V0cyBjaGlsZHJlbiBmb3IgdGhlIGl0ZW0uICovXG5cdGdldENoaWxkcmVuKGl0ZW06IFQpOiBJVGVzdENoaWxkcmVuTGlrZTxUPjtcblxuXHQvKiogUm9vdCB0byB1c2UgZm9yIHRoZSBuZXcgdGVzdCBjb2xsZWN0aW9uLiAqL1xuXHRyb290OiBUO1xufVxuXG5jb25zdCBzdHJpY3RFcXVhbENvbXBhcmF0b3IgPSA8VD4oYTogVCwgYjogVCkgPT4gYSA9PT0gYjtcbmNvbnN0IGRpZmZhYmxlUHJvcHM6IHsgW0sgaW4ga2V5b2YgSVRlc3RJdGVtXT86IChhOiBJVGVzdEl0ZW1bS10sIGI6IElUZXN0SXRlbVtLXSkgPT4gYm9vbGVhbiB9ID0ge1xuXHRyYW5nZTogKGEsIGIpID0+IHtcblx0XHRpZiAoYSA9PT0gYikgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdGlmICghYSB8fCAhYikgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRyZXR1cm4gYS5lcXVhbHNSYW5nZShiKTtcblx0fSxcblx0YnVzeTogc3RyaWN0RXF1YWxDb21wYXJhdG9yLFxuXHRsYWJlbDogc3RyaWN0RXF1YWxDb21wYXJhdG9yLFxuXHRkZXNjcmlwdGlvbjogc3RyaWN0RXF1YWxDb21wYXJhdG9yLFxuXHRlcnJvcjogc3RyaWN0RXF1YWxDb21wYXJhdG9yLFxuXHRzb3J0VGV4dDogc3RyaWN0RXF1YWxDb21wYXJhdG9yLFxuXHR0YWdzOiAoYSwgYikgPT4ge1xuXHRcdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoYS5zb21lKHQxID0+ICFiLmluY2x1ZGVzKHQxKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSxcbn07XG5cbmNvbnN0IGRpZmZhYmxlRW50cmllcyA9IE9iamVjdC5lbnRyaWVzKGRpZmZhYmxlUHJvcHMpIGFzIHJlYWRvbmx5IFtrZXlvZiBJVGVzdEl0ZW0sIChhOiB1bmtub3duLCBiOiB1bmtub3duKSA9PiBib29sZWFuXVtdO1xuXG5jb25zdCBkaWZmVGVzdEl0ZW1zID0gKGE6IElUZXN0SXRlbSwgYjogSVRlc3RJdGVtKSA9PiB7XG5cdGxldCBvdXRwdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRmb3IgKGNvbnN0IFtrZXksIGNtcF0gb2YgZGlmZmFibGVFbnRyaWVzKSB7XG5cdFx0aWYgKCFjbXAoYVtrZXldLCBiW2tleV0pKSB7XG5cdFx0XHRpZiAob3V0cHV0KSB7XG5cdFx0XHRcdG91dHB1dFtrZXldID0gYltrZXldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0ID0geyBba2V5XTogYltrZXldIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG91dHB1dCBhcyBQYXJ0aWFsPElUZXN0SXRlbT4gfCB1bmRlZmluZWQ7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0Q2hpbGRyZW5MaWtlPFQ+IGV4dGVuZHMgSXRlcmFibGU8W3N0cmluZywgVF0+IHtcblx0Z2V0KGlkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkO1xuXHRkZWxldGUoaWQ6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtTGlrZSB7XG5cdGlkOiBzdHJpbmc7XG5cdHRhZ3M6IHJlYWRvbmx5IElUZXN0VGFnW107XG5cdHVyaT86IFVSSTtcblx0Y2FuUmVzb2x2ZUNoaWxkcmVuOiBib29sZWFuO1xufVxuXG4vKipcbiAqIE1haW50YWlucyBhIGNvbGxlY3Rpb24gb2YgdGVzdCBpdGVtcyBmb3IgYSBzaW5nbGUgY29udHJvbGxlci5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlc3RJdGVtQ29sbGVjdGlvbjxUIGV4dGVuZHMgSVRlc3RJdGVtTGlrZT4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBkZWJvdW5jZVNlbmREaWZmID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5mbHVzaERpZmYoKSwgMjAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlmZk9wRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRlc3RzRGlmZj4oKSk7XG5cdHByaXZhdGUgX3Jlc29sdmVIYW5kbGVyPzogKGl0ZW06IFQgfCB1bmRlZmluZWQpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkO1xuXG5cdHB1YmxpYyBnZXQgcm9vdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLnJvb3Q7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdHJlZSA9IG5ldyBNYXA8LyogZnVsbCB0ZXN0IGlkICovc3RyaW5nLCBDb2xsZWN0aW9uSXRlbTxUPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0YWdzID0gbmV3IE1hcDxzdHJpbmcsIHsgbGFiZWw/OiBzdHJpbmc7IHJlZkNvdW50OiBudW1iZXIgfT4oKTtcblxuXHRwcm90ZWN0ZWQgZGlmZjogVGVzdHNEaWZmID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJVGVzdEl0ZW1Db2xsZWN0aW9uT3B0aW9uczxUPikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yb290LmNhblJlc29sdmVDaGlsZHJlbiA9IHRydWU7XG5cdFx0dGhpcy51cHNlcnRJdGVtKHRoaXMucm9vdCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVyIHVzZWQgZm9yIGV4cGFuZGluZyB0ZXN0IGl0ZW1zLlxuXHQgKi9cblx0cHVibGljIHNldCByZXNvbHZlSGFuZGxlcihoYW5kbGVyOiB1bmRlZmluZWQgfCAoKGl0ZW06IFQgfCB1bmRlZmluZWQpID0+IHZvaWQpKSB7XG5cdFx0dGhpcy5fcmVzb2x2ZUhhbmRsZXIgPSBoYW5kbGVyO1xuXHRcdGZvciAoY29uc3QgdGVzdCBvZiB0aGlzLnRyZWUudmFsdWVzKCkpIHtcblx0XHRcdHRoaXMudXBkYXRlRXhwYW5kYWJpbGl0eSh0ZXN0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlc29sdmVIYW5kbGVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlSGFuZGxlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFuIG9wZXJhdGlvbiBoYXBwZW5zIHRoYXQgc2hvdWxkIHJlc3VsdCBpbiBhIGRpZmYuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRHZW5lcmF0ZURpZmYgPSB0aGlzLmRpZmZPcEVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEdldHMgYSBkaWZmIG9mIGFsbCBjaGFuZ2VzIHRoYXQgaGF2ZSBiZWVuIG1hZGUsIGFuZCBjbGVhcnMgdGhlIGRpZmYgcXVldWUuXG5cdCAqL1xuXHRwdWJsaWMgY29sbGVjdERpZmYoKSB7XG5cdFx0Y29uc3QgZGlmZiA9IHRoaXMuZGlmZjtcblx0XHR0aGlzLmRpZmYgPSBbXTtcblx0XHRyZXR1cm4gZGlmZjtcblx0fVxuXG5cdC8qKlxuXHQgKiBQdXNoZXMgYSBuZXcgZGlmZiBlbnRyeSBvbnRvIHRoZSBjb2xsZWN0ZWQgZGlmZiBsaXN0LlxuXHQgKi9cblx0cHVibGljIHB1c2hEaWZmKGRpZmY6IFRlc3RzRGlmZk9wKSB7XG5cdFx0c3dpdGNoIChkaWZmLm9wKSB7XG5cdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLkRvY3VtZW50U3luY2VkOiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZXhpc3Rpbmcgb2YgdGhpcy5kaWZmKSB7XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nLm9wID09PSBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCAmJiBleGlzdGluZy51cmkgPT09IGRpZmYudXJpKSB7XG5cdFx0XHRcdFx0XHRleGlzdGluZy5kb2N2ID0gZGlmZi5kb2N2O1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5VcGRhdGU6IHtcblx0XHRcdFx0Ly8gVHJ5IHRvIG1lcmdlIHVwZGF0ZXMsIHNpbmNlIHRoZXkncmUgaW52b2tlZCBwZXItcHJvcGVydHlcblx0XHRcdFx0Y29uc3QgbGFzdCA9IHRoaXMuZGlmZlt0aGlzLmRpZmYubGVuZ3RoIC0gMV07XG5cdFx0XHRcdGlmIChsYXN0KSB7XG5cdFx0XHRcdFx0aWYgKGxhc3Qub3AgPT09IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSAmJiBsYXN0Lml0ZW0uZXh0SWQgPT09IGRpZmYuaXRlbS5leHRJZCkge1xuXHRcdFx0XHRcdFx0YXBwbHlUZXN0SXRlbVVwZGF0ZShsYXN0Lml0ZW0sIGRpZmYuaXRlbSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGxhc3Qub3AgPT09IFRlc3REaWZmT3BUeXBlLkFkZCAmJiBsYXN0Lml0ZW0uaXRlbS5leHRJZCA9PT0gZGlmZi5pdGVtLmV4dElkKSB7XG5cdFx0XHRcdFx0XHRhcHBseVRlc3RJdGVtVXBkYXRlKGxhc3QuaXRlbSwgZGlmZi5pdGVtKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5kaWZmLnB1c2goZGlmZik7XG5cblx0XHRpZiAoIXRoaXMuZGVib3VuY2VTZW5kRGlmZi5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLmRlYm91bmNlU2VuZERpZmYuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRXhwYW5kcyB0aGUgdGVzdCBhbmQgdGhlIGdpdmVuIG51bWJlciBvZiBgbGV2ZWxzYCBvZiBjaGlsZHJlbi4gSWYgbGV2ZWxzXG5cdCAqIGlzIDwgMCwgdGhlbiBhbGwgY2hpbGRyZW4gd2lsbCBiZSBleHBhbmRlZC4gSWYgaXQncyAwLCB0aGVuIG9ubHkgdGhpc1xuXHQgKiBpdGVtIHdpbGwgYmUgZXhwYW5kZWQuXG5cdCAqL1xuXHRwdWJsaWMgZXhwYW5kKHRlc3RJZDogc3RyaW5nLCBsZXZlbHM6IG51bWJlcik6IFByb21pc2U8dm9pZD4gfCB2b2lkIHtcblx0XHRjb25zdCBpbnRlcm5hbCA9IHRoaXMudHJlZS5nZXQodGVzdElkKTtcblx0XHRpZiAoIWludGVybmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGludGVybmFsLmV4cGFuZExldmVscyA9PT0gdW5kZWZpbmVkIHx8IGxldmVscyA+IGludGVybmFsLmV4cGFuZExldmVscykge1xuXHRcdFx0aW50ZXJuYWwuZXhwYW5kTGV2ZWxzID0gbGV2ZWxzO1xuXHRcdH1cblxuXHRcdC8vIHRyeSB0byBhdm9pZCBhd2FpdGluZyB0aGluZ3MgaWYgdGhlIHByb3ZpZGVyIHJldHVybnMgc3luY2hyb25vdXNseSBpblxuXHRcdC8vIG9yZGVyIHRvIGtlZXAgZXZlcnl0aGluZyBpbiBhIHNpbmdsZSBkaWZmIGFuZCBET00gdXBkYXRlLlxuXHRcdGlmIChpbnRlcm5hbC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kYWJsZSkge1xuXHRcdFx0Y29uc3QgciA9IHRoaXMucmVzb2x2ZUNoaWxkcmVuKGludGVybmFsKTtcblx0XHRcdHJldHVybiAhci5pc09wZW4oKVxuXHRcdFx0XHQ/IHIud2FpdCgpLnRoZW4oKCkgPT4gdGhpcy5leHBhbmRDaGlsZHJlbihpbnRlcm5hbCwgbGV2ZWxzIC0gMSkpXG5cdFx0XHRcdDogdGhpcy5leHBhbmRDaGlsZHJlbihpbnRlcm5hbCwgbGV2ZWxzIC0gMSk7XG5cdFx0fSBlbHNlIGlmIChpbnRlcm5hbC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kZWQpIHtcblx0XHRcdHJldHVybiBpbnRlcm5hbC5yZXNvbHZlQmFycmllcj8uaXNPcGVuKCkgPT09IGZhbHNlXG5cdFx0XHRcdD8gaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXIud2FpdCgpLnRoZW4oKCkgPT4gdGhpcy5leHBhbmRDaGlsZHJlbihpbnRlcm5hbCwgbGV2ZWxzIC0gMSkpXG5cdFx0XHRcdDogdGhpcy5leHBhbmRDaGlsZHJlbihpbnRlcm5hbCwgbGV2ZWxzIC0gMSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMudHJlZS52YWx1ZXMoKSkge1xuXHRcdFx0dGhpcy5vcHRpb25zLmdldEFwaUZvcihpdGVtLmFjdHVhbCkubGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmVlLmNsZWFyKCk7XG5cdFx0dGhpcy5kaWZmID0gW107XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRlc3RJdGVtRXZlbnQoaW50ZXJuYWw6IENvbGxlY3Rpb25JdGVtPFQ+LCBldnQ6IEV4dEhvc3RUZXN0SXRlbUV2ZW50KSB7XG5cdFx0c3dpdGNoIChldnQub3ApIHtcblx0XHRcdGNhc2UgVGVzdEl0ZW1FdmVudE9wLlJlbW92ZUNoaWxkOlxuXHRcdFx0XHR0aGlzLnJlbW92ZUl0ZW0oVGVzdElkLmpvaW5Ub1N0cmluZyhpbnRlcm5hbC5mdWxsSWQsIGV2dC5pZCkpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBUZXN0SXRlbUV2ZW50T3AuVXBzZXJ0OlxuXHRcdFx0XHR0aGlzLnVwc2VydEl0ZW0oZXZ0Lml0ZW0gYXMgVCwgaW50ZXJuYWwpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBUZXN0SXRlbUV2ZW50T3AuQnVsazpcblx0XHRcdFx0Zm9yIChjb25zdCBvcCBvZiBldnQub3BzKSB7XG5cdFx0XHRcdFx0dGhpcy5vblRlc3RJdGVtRXZlbnQoaW50ZXJuYWwsIG9wKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBUZXN0SXRlbUV2ZW50T3AuU2V0VGFnczpcblx0XHRcdFx0dGhpcy5kaWZmVGFnUmVmcyhldnQubmV3LCBldnQub2xkLCBpbnRlcm5hbC5mdWxsSWQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIFRlc3RJdGVtRXZlbnRPcC5VcGRhdGVDYW5SZXNvbHZlQ2hpbGRyZW46XG5cdFx0XHRcdHRoaXMudXBkYXRlRXhwYW5kYWJpbGl0eShpbnRlcm5hbCk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIFRlc3RJdGVtRXZlbnRPcC5TZXRQcm9wOlxuXHRcdFx0XHR0aGlzLnB1c2hEaWZmKHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRcdGV4dElkOiBpbnRlcm5hbC5mdWxsSWQudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGl0ZW06IGV2dC51cGRhdGUsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgVGVzdEl0ZW1FdmVudE9wLkRvY3VtZW50U3luY2VkOlxuXHRcdFx0XHR0aGlzLmRvY3VtZW50U3luY2VkKGludGVybmFsLmFjdHVhbC51cmkpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXNzZXJ0TmV2ZXIoZXZ0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvY3VtZW50U3luY2VkKHVyaTogVVJJIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0dGhpcy5wdXNoRGlmZih7XG5cdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRkb2N2OiB0aGlzLm9wdGlvbnMuZ2V0RG9jdW1lbnRWZXJzaW9uKHVyaSlcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBzZXJ0SXRlbShhY3R1YWw6IFQsIHBhcmVudDogQ29sbGVjdGlvbkl0ZW08VD4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBmdWxsSWQgPSBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbShhY3R1YWwsIHRoaXMucm9vdC5pZCwgcGFyZW50Py5hY3R1YWwpO1xuXG5cdFx0Ly8gSWYgdGhpcyB0ZXN0IGl0ZW0gZXhpc3RzIGVsc2V3aGVyZSBpbiB0aGUgdHJlZSBhbHJlYWR5IChleGlzdHMgYXQgYW5cblx0XHQvLyBvbGQgSUQgd2l0aCBhbiBleGlzdGluZyBwYXJlbnQpLCByZW1vdmUgdGhhdCBvbGQgaXRlbS5cblx0XHRjb25zdCBwcml2YXRlQXBpID0gdGhpcy5vcHRpb25zLmdldEFwaUZvcihhY3R1YWwpO1xuXHRcdGlmIChwcml2YXRlQXBpLnBhcmVudCAmJiBwcml2YXRlQXBpLnBhcmVudCAhPT0gcGFyZW50Py5hY3R1YWwpIHtcblx0XHRcdHRoaXMub3B0aW9ucy5nZXRDaGlsZHJlbihwcml2YXRlQXBpLnBhcmVudCkuZGVsZXRlKGFjdHVhbC5pZCk7XG5cdFx0fVxuXG5cdFx0bGV0IGludGVybmFsID0gdGhpcy50cmVlLmdldChmdWxsSWQudG9TdHJpbmcoKSk7XG5cdFx0Ly8gQ2FzZSAxOiBhIGJyYW5kIG5ldyBpdGVtXG5cdFx0aWYgKCFpbnRlcm5hbCkge1xuXHRcdFx0aW50ZXJuYWwgPSB7XG5cdFx0XHRcdGZ1bGxJZCxcblx0XHRcdFx0YWN0dWFsLFxuXHRcdFx0XHRleHBhbmRMZXZlbHM6IHBhcmVudD8uZXhwYW5kTGV2ZWxzIC8qIGludGVudGlvbmFsbHkgdW5kZWZpbmVkIG9yIDAgKi8gPyBwYXJlbnQuZXhwYW5kTGV2ZWxzIC0gMSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIC8vIHVwZGF0ZWQgYnkgYGNvbm5lY3RJdGVtQW5kQ2hpbGRyZW5gXG5cdFx0XHR9O1xuXG5cdFx0XHRhY3R1YWwudGFncy5mb3JFYWNoKHRoaXMuaW5jcmVtZW50VGFnUmVmcywgdGhpcyk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0KGludGVybmFsLmZ1bGxJZC50b1N0cmluZygpLCBpbnRlcm5hbCk7XG5cdFx0XHR0aGlzLnNldEl0ZW1QYXJlbnQoYWN0dWFsLCBwYXJlbnQpO1xuXHRcdFx0dGhpcy5wdXNoRGlmZih7XG5cdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdGl0ZW06IHtcblx0XHRcdFx0XHRjb250cm9sbGVySWQ6IHRoaXMub3B0aW9ucy5jb250cm9sbGVySWQsXG5cdFx0XHRcdFx0ZXhwYW5kOiBpbnRlcm5hbC5leHBhbmQsXG5cdFx0XHRcdFx0aXRlbTogdGhpcy5vcHRpb25zLnRvSVRlc3RJdGVtKGFjdHVhbCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5jb25uZWN0SXRlbUFuZENoaWxkcmVuKGFjdHVhbCwgaW50ZXJuYWwsIHBhcmVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2FzZSAyOiByZS1pbnNlcnRpb24gb2YgYW4gZXhpc3RpbmcgaXRlbSwgbm8tb3Bcblx0XHRpZiAoaW50ZXJuYWwuYWN0dWFsID09PSBhY3R1YWwpIHtcblx0XHRcdHRoaXMuY29ubmVjdEl0ZW0oYWN0dWFsLCBpbnRlcm5hbCwgcGFyZW50KTsgLy8gcmUtY29ubmVjdCBpbiBjYXNlIHRoZSBwYXJlbnQgY2hhbmdlZFxuXHRcdFx0cmV0dXJuOyAvLyBuby1vcFxuXHRcdH1cblxuXHRcdC8vIENhc2UgMzogdXBzZXJ0IG9mIGFuIGV4aXN0aW5nIGl0ZW0gYnkgSUQsIHdpdGggYSBuZXcgaW5zdGFuY2Vcblx0XHRpZiAoaW50ZXJuYWwuYWN0dWFsLnVyaT8udG9TdHJpbmcoKSAhPT0gYWN0dWFsLnVyaT8udG9TdHJpbmcoKSkge1xuXHRcdFx0Ly8gSWYgdGhlIGl0ZW0gaGFzIGEgbmV3IFVSSSwgcmUtaW5zZXJ0IGl0OyB3ZSBkb24ndCBzdXBwb3J0IHVwZGF0aW5nXG5cdFx0XHQvLyBVUklzIG9uIGV4aXN0aW5nIHRlc3QgaXRlbXMuXG5cdFx0XHR0aGlzLnJlbW92ZUl0ZW0oZnVsbElkLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIHRoaXMudXBzZXJ0SXRlbShhY3R1YWwsIHBhcmVudCk7XG5cdFx0fVxuXHRcdGNvbnN0IG9sZENoaWxkcmVuID0gdGhpcy5vcHRpb25zLmdldENoaWxkcmVuKGludGVybmFsLmFjdHVhbCk7XG5cdFx0Y29uc3Qgb2xkQWN0dWFsID0gaW50ZXJuYWwuYWN0dWFsO1xuXHRcdGNvbnN0IHVwZGF0ZSA9IGRpZmZUZXN0SXRlbXModGhpcy5vcHRpb25zLnRvSVRlc3RJdGVtKG9sZEFjdHVhbCksIHRoaXMub3B0aW9ucy50b0lUZXN0SXRlbShhY3R1YWwpKTtcblx0XHR0aGlzLm9wdGlvbnMuZ2V0QXBpRm9yKG9sZEFjdHVhbCkubGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRpbnRlcm5hbC5hY3R1YWwgPSBhY3R1YWw7XG5cdFx0aW50ZXJuYWwucmVzb2x2ZUJhcnJpZXIgPSB1bmRlZmluZWQ7XG5cdFx0aW50ZXJuYWwuZXhwYW5kID0gVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlOyAvLyB1cGRhdGVkIGJ5IGBjb25uZWN0SXRlbUFuZENoaWxkcmVuYFxuXG5cdFx0aWYgKHVwZGF0ZSkge1xuXHRcdFx0Ly8gdGFncyBhcmUgaGFuZGxlZCBpbiBhIHNwZWNpYWwgd2F5XG5cdFx0XHRpZiAodXBkYXRlLmhhc093blByb3BlcnR5KCd0YWdzJykpIHtcblx0XHRcdFx0dGhpcy5kaWZmVGFnUmVmcyhhY3R1YWwudGFncywgb2xkQWN0dWFsLnRhZ3MsIGZ1bGxJZC50b1N0cmluZygpKTtcblx0XHRcdFx0ZGVsZXRlIHVwZGF0ZS50YWdzO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5vblRlc3RJdGVtRXZlbnQoaW50ZXJuYWwsIHsgb3A6IFRlc3RJdGVtRXZlbnRPcC5TZXRQcm9wLCB1cGRhdGUgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25uZWN0SXRlbUFuZENoaWxkcmVuKGFjdHVhbCwgaW50ZXJuYWwsIHBhcmVudCk7XG5cblx0XHQvLyBSZW1vdmUgYW55IG9ycGhhbmVkIGNoaWxkcmVuLlxuXHRcdGZvciAoY29uc3QgW18sIGNoaWxkXSBvZiBvbGRDaGlsZHJlbikge1xuXHRcdFx0aWYgKCF0aGlzLm9wdGlvbnMuZ2V0Q2hpbGRyZW4oYWN0dWFsKS5nZXQoY2hpbGQuaWQpKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlSXRlbShUZXN0SWQuam9pblRvU3RyaW5nKGZ1bGxJZCwgY2hpbGQuaWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZS1leHBhbmQgdGhlIGVsZW1lbnQgaWYgaXQgd2FzIHByZXZpb3VzIGV4cGFuZGVkICgjMjA3NTc0KVxuXHRcdGNvbnN0IGV4cGFuZExldmVscyA9IGludGVybmFsLmV4cGFuZExldmVscztcblx0XHRpZiAoZXhwYW5kTGV2ZWxzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFdhaXQgdW50aWwgYSBtaWNyb3Rhc2sgdG8gYWxsb3cgdGhlIGV4dGVuc2lvbiB0byBmaW5pc2ggc2V0dGluZyB1cFxuXHRcdFx0Ly8gcHJvcGVydGllcyBvZiB0aGUgZWxlbWVudCBhbmQgY2hpbGRyZW4gYmVmb3JlIHdlIGFzayBpdCB0byBleHBhbmQuXG5cdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdGlmIChpbnRlcm5hbC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kYWJsZSkge1xuXHRcdFx0XHRcdGludGVybmFsLmV4cGFuZExldmVscyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmV4cGFuZChmdWxsSWQudG9TdHJpbmcoKSwgZXhwYW5kTGV2ZWxzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayByYW5nZXMgaW4gdGhlIGRvY3VtZW50IGFzIHN5bmNlZCAoIzE2MTMyMClcblx0XHR0aGlzLmRvY3VtZW50U3luY2VkKGludGVybmFsLmFjdHVhbC51cmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaWZmVGFnUmVmcyhuZXdUYWdzOiByZWFkb25seSBJVGVzdFRhZ1tdLCBvbGRUYWdzOiByZWFkb25seSBJVGVzdFRhZ1tdLCBleHRJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgdG9EZWxldGUgPSBuZXcgU2V0KG9sZFRhZ3MubWFwKHQgPT4gdC5pZCkpO1xuXHRcdGZvciAoY29uc3QgdGFnIG9mIG5ld1RhZ3MpIHtcblx0XHRcdGlmICghdG9EZWxldGUuZGVsZXRlKHRhZy5pZCkpIHtcblx0XHRcdFx0dGhpcy5pbmNyZW1lbnRUYWdSZWZzKHRhZyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5wdXNoRGlmZih7XG5cdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0aXRlbTogeyBleHRJZCwgaXRlbTogeyB0YWdzOiBuZXdUYWdzLm1hcCh2ID0+IG5hbWVzcGFjZVRlc3RUYWcodGhpcy5vcHRpb25zLmNvbnRyb2xsZXJJZCwgdi5pZCkpIH0gfVxuXHRcdH0pO1xuXG5cdFx0dG9EZWxldGUuZm9yRWFjaCh0aGlzLmRlY3JlbWVudFRhZ1JlZnMsIHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbmNyZW1lbnRUYWdSZWZzKHRhZzogSVRlc3RUYWcpIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMudGFncy5nZXQodGFnLmlkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLnJlZkNvdW50Kys7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGFncy5zZXQodGFnLmlkLCB7IHJlZkNvdW50OiAxIH0pO1xuXHRcdFx0dGhpcy5wdXNoRGlmZih7XG5cdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGRUYWcsIHRhZzoge1xuXHRcdFx0XHRcdGlkOiBuYW1lc3BhY2VUZXN0VGFnKHRoaXMub3B0aW9ucy5jb250cm9sbGVySWQsIHRhZy5pZCksXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGVjcmVtZW50VGFnUmVmcyh0YWdJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnRhZ3MuZ2V0KHRhZ0lkKTtcblx0XHRpZiAoZXhpc3RpbmcgJiYgIS0tZXhpc3RpbmcucmVmQ291bnQpIHtcblx0XHRcdHRoaXMudGFncy5kZWxldGUodGFnSWQpO1xuXHRcdFx0dGhpcy5wdXNoRGlmZih7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmVUYWcsIGlkOiBuYW1lc3BhY2VUZXN0VGFnKHRoaXMub3B0aW9ucy5jb250cm9sbGVySWQsIHRhZ0lkKSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEl0ZW1QYXJlbnQoYWN0dWFsOiBULCBwYXJlbnQ6IENvbGxlY3Rpb25JdGVtPFQ+IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5vcHRpb25zLmdldEFwaUZvcihhY3R1YWwpLnBhcmVudCA9IHBhcmVudCAmJiBwYXJlbnQuYWN0dWFsICE9PSB0aGlzLnJvb3QgPyBwYXJlbnQuYWN0dWFsIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25uZWN0SXRlbShhY3R1YWw6IFQsIGludGVybmFsOiBDb2xsZWN0aW9uSXRlbTxUPiwgcGFyZW50OiBDb2xsZWN0aW9uSXRlbTxUPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuc2V0SXRlbVBhcmVudChhY3R1YWwsIHBhcmVudCk7XG5cdFx0Y29uc3QgYXBpID0gdGhpcy5vcHRpb25zLmdldEFwaUZvcihhY3R1YWwpO1xuXHRcdGFwaS5wYXJlbnQgPSBwYXJlbnQ/LmFjdHVhbDtcblx0XHRhcGkubGlzdGVuZXIgPSBldnQgPT4gdGhpcy5vblRlc3RJdGVtRXZlbnQoaW50ZXJuYWwsIGV2dCk7XG5cdFx0dGhpcy51cGRhdGVFeHBhbmRhYmlsaXR5KGludGVybmFsKTtcblx0fVxuXG5cdHByaXZhdGUgY29ubmVjdEl0ZW1BbmRDaGlsZHJlbihhY3R1YWw6IFQsIGludGVybmFsOiBDb2xsZWN0aW9uSXRlbTxUPiwgcGFyZW50OiBDb2xsZWN0aW9uSXRlbTxUPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuY29ubmVjdEl0ZW0oYWN0dWFsLCBpbnRlcm5hbCwgcGFyZW50KTtcblxuXHRcdC8vIERpc2NvdmVyIGFueSBleGlzdGluZyBjaGlsZHJlbiB0aGF0IG1pZ2h0IGhhdmUgYWxyZWFkeSBiZWVuIGFkZGVkXG5cdFx0Zm9yIChjb25zdCBbXywgY2hpbGRdIG9mIHRoaXMub3B0aW9ucy5nZXRDaGlsZHJlbihhY3R1YWwpKSB7XG5cdFx0XHR0aGlzLnVwc2VydEl0ZW0oY2hpbGQsIGludGVybmFsKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgYGV4cGFuZGAgc3RhdGUgb2YgdGhlIGl0ZW0uIFNob3VsZCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlXG5cdCAqIHJlc29sdmVkIHN0YXRlIG9mIHRoZSBpdGVtIGNoYW5nZXMuIENhbiBhdXRvbWF0aWNhbGx5IGV4cGFuZCB0aGUgaXRlbVxuXHQgKiBpZiByZXF1ZXN0ZWQgYnkgYSBjb25zdW1lci5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlRXhwYW5kYWJpbGl0eShpbnRlcm5hbDogQ29sbGVjdGlvbkl0ZW08VD4pIHtcblx0XHRsZXQgbmV3U3RhdGU6IFRlc3RJdGVtRXhwYW5kU3RhdGU7XG5cdFx0aWYgKCF0aGlzLl9yZXNvbHZlSGFuZGxlcikge1xuXHRcdFx0bmV3U3RhdGUgPSBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGU7XG5cdFx0fSBlbHNlIGlmIChpbnRlcm5hbC5yZXNvbHZlQmFycmllcikge1xuXHRcdFx0bmV3U3RhdGUgPSBpbnRlcm5hbC5yZXNvbHZlQmFycmllci5pc09wZW4oKVxuXHRcdFx0XHQ/IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kZWRcblx0XHRcdFx0OiBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1N0YXRlID0gaW50ZXJuYWwuYWN0dWFsLmNhblJlc29sdmVDaGlsZHJlblxuXHRcdFx0XHQ/IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kYWJsZVxuXHRcdFx0XHQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZTtcblx0XHR9XG5cblx0XHRpZiAobmV3U3RhdGUgPT09IGludGVybmFsLmV4cGFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGludGVybmFsLmV4cGFuZCA9IG5ld1N0YXRlO1xuXHRcdHRoaXMucHVzaERpZmYoeyBvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLCBpdGVtOiB7IGV4dElkOiBpbnRlcm5hbC5mdWxsSWQudG9TdHJpbmcoKSwgZXhwYW5kOiBuZXdTdGF0ZSB9IH0pO1xuXG5cdFx0aWYgKG5ld1N0YXRlID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGUgJiYgaW50ZXJuYWwuZXhwYW5kTGV2ZWxzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucmVzb2x2ZUNoaWxkcmVuKGludGVybmFsKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRXhwYW5kcyBhbGwgY2hpbGRyZW4gb2YgdGhlIGl0ZW0sIFwibGV2ZWxzXCIgZGVlcC4gSWYgbGV2ZWxzIGlzIDAsIG9ubHlcblx0ICogdGhlIGNoaWxkcmVuIHdpbGwgYmUgZXhwYW5kZWQuIElmIGl0J3MgMSwgdGhlIGNoaWxkcmVuIGFuZCB0aGVpciBjaGlsZHJlblxuXHQgKiB3aWxsIGJlIGV4cGFuZGVkLiBJZiBpdCdzIDwwLCBpdCdzIGEgbm8tb3AuXG5cdCAqL1xuXHRwcml2YXRlIGV4cGFuZENoaWxkcmVuKGludGVybmFsOiBDb2xsZWN0aW9uSXRlbTxUPiwgbGV2ZWxzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0aWYgKGxldmVscyA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHBhbmRSZXF1ZXN0czogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbXywgY2hpbGRdIG9mIHRoaXMub3B0aW9ucy5nZXRDaGlsZHJlbihpbnRlcm5hbC5hY3R1YWwpKSB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5leHBhbmQoVGVzdElkLmpvaW5Ub1N0cmluZyhpbnRlcm5hbC5mdWxsSWQsIGNoaWxkLmlkKSwgbGV2ZWxzKTtcblx0XHRcdGlmIChpc1RoZW5hYmxlKHByb21pc2UpKSB7XG5cdFx0XHRcdGV4cGFuZFJlcXVlc3RzLnB1c2gocHJvbWlzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cGFuZFJlcXVlc3RzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKGV4cGFuZFJlcXVlc3RzKS50aGVuKCgpID0+IHsgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxzIGBkaXNjb3ZlckNoaWxkcmVuYCBvbiB0aGUgaXRlbSwgcmVmcmVzaGluZyBhbGwgaXRzIHRlc3RzLlxuXHQgKi9cblx0cHJpdmF0ZSByZXNvbHZlQ2hpbGRyZW4oaW50ZXJuYWw6IENvbGxlY3Rpb25JdGVtPFQ+KSB7XG5cdFx0aWYgKGludGVybmFsLnJlc29sdmVCYXJyaWVyKSB7XG5cdFx0XHRyZXR1cm4gaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXI7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9yZXNvbHZlSGFuZGxlcikge1xuXHRcdFx0Y29uc3QgYiA9IG5ldyBCYXJyaWVyKCk7XG5cdFx0XHRiLm9wZW4oKTtcblx0XHRcdHJldHVybiBiO1xuXHRcdH1cblxuXHRcdGludGVybmFsLmV4cGFuZCA9IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZztcblx0XHR0aGlzLnB1c2hFeHBhbmRTdGF0ZVVwZGF0ZShpbnRlcm5hbCk7XG5cblx0XHRjb25zdCBiYXJyaWVyID0gaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdGNvbnN0IGFwcGx5RXJyb3IgPSAoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVW5oYW5kbGVkIGVycm9yIGluIHJlc29sdmVIYW5kbGVyIG9mIHRlc3QgY29udHJvbGxlciBcIiR7dGhpcy5vcHRpb25zLmNvbnRyb2xsZXJJZH1cImAsIGVycik7XG5cdFx0fTtcblxuXHRcdGxldCByOiBUaGVuYWJsZTx2b2lkPiB8IHVuZGVmaW5lZCB8IHZvaWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHIgPSB0aGlzLl9yZXNvbHZlSGFuZGxlcihpbnRlcm5hbC5hY3R1YWwgPT09IHRoaXMucm9vdCA/IHVuZGVmaW5lZCA6IGludGVybmFsLmFjdHVhbCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhcHBseUVycm9yKGVycik7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVGhlbmFibGUocikpIHtcblx0XHRcdHIuY2F0Y2goYXBwbHlFcnJvcikudGhlbigoKSA9PiB7XG5cdFx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUV4cGFuZGFiaWxpdHkoaW50ZXJuYWwpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdFx0dGhpcy51cGRhdGVFeHBhbmRhYmlsaXR5KGludGVybmFsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXI7XG5cdH1cblxuXHRwcml2YXRlIHB1c2hFeHBhbmRTdGF0ZVVwZGF0ZShpbnRlcm5hbDogQ29sbGVjdGlvbkl0ZW08VD4pIHtcblx0XHR0aGlzLnB1c2hEaWZmKHsgb3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSwgaXRlbTogeyBleHRJZDogaW50ZXJuYWwuZnVsbElkLnRvU3RyaW5nKCksIGV4cGFuZDogaW50ZXJuYWwuZXhwYW5kIH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUl0ZW0oY2hpbGRJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgY2hpbGRJdGVtID0gdGhpcy50cmVlLmdldChjaGlsZElkKTtcblx0XHRpZiAoIWNoaWxkSXRlbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdhdHRlbXB0aW5nIHRvIHJlbW92ZSBub24tZXhpc3RlbnQgY2hpbGQnKTtcblx0XHR9XG5cblx0XHR0aGlzLnB1c2hEaWZmKHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZSwgaXRlbUlkOiBjaGlsZElkIH0pO1xuXG5cdFx0Y29uc3QgcXVldWU6IChDb2xsZWN0aW9uSXRlbTxUPiB8IHVuZGVmaW5lZClbXSA9IFtjaGlsZEl0ZW1dO1xuXHRcdHdoaWxlIChxdWV1ZS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBxdWV1ZS5wb3AoKTtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5vcHRpb25zLmdldEFwaUZvcihpdGVtLmFjdHVhbCkubGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAoY29uc3QgdGFnIG9mIGl0ZW0uYWN0dWFsLnRhZ3MpIHtcblx0XHRcdFx0dGhpcy5kZWNyZW1lbnRUYWdSZWZzKHRhZy5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJlZS5kZWxldGUoaXRlbS5mdWxsSWQudG9TdHJpbmcoKSk7XG5cdFx0XHRmb3IgKGNvbnN0IFtfLCBjaGlsZF0gb2YgdGhpcy5vcHRpb25zLmdldENoaWxkcmVuKGl0ZW0uYWN0dWFsKSkge1xuXHRcdFx0XHRxdWV1ZS5wdXNoKHRoaXMudHJlZS5nZXQoVGVzdElkLmpvaW5Ub1N0cmluZyhpdGVtLmZ1bGxJZCwgY2hpbGQuaWQpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEltbWVkaWF0ZWx5IGVtaXRzIGFueSBwZW5kaW5nIGRpZmZzIG9uIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0cHVibGljIGZsdXNoRGlmZigpIHtcblx0XHRjb25zdCBkaWZmID0gdGhpcy5jb2xsZWN0RGlmZigpO1xuXHRcdGlmIChkaWZmLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5kaWZmT3BFbWl0dGVyLmZpcmUoZGlmZik7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBJbXBsZW1lbnRhdGlvbiBvZiB2c2NvZGUuVGVzdEl0ZW1Db2xsZWN0aW9uICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbUNoaWxkcmVuPFQgZXh0ZW5kcyBJVGVzdEl0ZW1MaWtlPiBleHRlbmRzIEl0ZXJhYmxlPFtzdHJpbmcsIFRdPiB7XG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0cmVwbGFjZShpdGVtczogcmVhZG9ubHkgVFtdKTogdm9pZDtcblx0Zm9yRWFjaChjYWxsYmFjazogKGl0ZW06IFQsIGNvbGxlY3Rpb246IHRoaXMpID0+IHVua25vd24sIHRoaXNBcmc/OiB1bmtub3duKTogdm9pZDtcblx0YWRkKGl0ZW06IFQpOiB2b2lkO1xuXHRkZWxldGUoaXRlbUlkOiBzdHJpbmcpOiB2b2lkO1xuXHRnZXQoaXRlbUlkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkO1xuXG5cdHRvSlNPTigpOiByZWFkb25seSBUW107XG59XG5cbmV4cG9ydCBjbGFzcyBEdXBsaWNhdGVUZXN0SXRlbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nKSB7XG5cdFx0c3VwZXIoYEF0dGVtcHRlZCB0byBpbnNlcnQgYSBkdXBsaWNhdGUgdGVzdCBpdGVtIElEICR7aWR9YCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEludmFsaWRUZXN0SXRlbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nKSB7XG5cdFx0c3VwZXIoYFRlc3RJdGVtIHdpdGggSUQgXCIke2lkfVwiIGlzIGludmFsaWQuIE1ha2Ugc3VyZSB0byBjcmVhdGUgaXQgZnJvbSB0aGUgY3JlYXRlVGVzdEl0ZW0gbWV0aG9kLmApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNaXhlZFRlc3RJdGVtQ29udHJvbGxlciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgY3RybEE6IHN0cmluZywgY3RybEI6IHN0cmluZykge1xuXHRcdHN1cGVyKGBUZXN0SXRlbSB3aXRoIElEIFwiJHtpZH1cIiBpcyBmcm9tIGNvbnRyb2xsZXIgXCIke2N0cmxBfVwiIGFuZCBjYW5ub3QgYmUgYWRkZWQgYXMgYSBjaGlsZCBvZiBhbiBpdGVtIGZyb20gY29udHJvbGxlciBcIiR7Y3RybEJ9XCIuYCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGNyZWF0ZVRlc3RJdGVtQ2hpbGRyZW4gPSA8VCBleHRlbmRzIElUZXN0SXRlbUxpa2U+KGFwaTogSVRlc3RJdGVtQXBpPFQ+LCBnZXRBcGk6IChpdGVtOiBUKSA9PiBJVGVzdEl0ZW1BcGk8VD4sIGNoZWNrQ3RvcjogRnVuY3Rpb24pOiBJVGVzdEl0ZW1DaGlsZHJlbjxUPiA9PiB7XG5cdGxldCBtYXBwZWQgPSBuZXcgTWFwPHN0cmluZywgVD4oKTtcblxuXHRyZXR1cm4ge1xuXHRcdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRcdGdldCBzaXplKCkge1xuXHRcdFx0cmV0dXJuIG1hcHBlZC5zaXplO1xuXHRcdH0sXG5cblx0XHQvKiogQGluaGVyaXRkb2MgKi9cblx0XHRmb3JFYWNoKGNhbGxiYWNrOiAoaXRlbTogVCwgY29sbGVjdGlvbjogSVRlc3RJdGVtQ2hpbGRyZW48VD4pID0+IHVua25vd24sIHRoaXNBcmc/OiB1bmtub3duKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgbWFwcGVkLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNhbGxiYWNrLmNhbGwodGhpc0FyZywgaXRlbSwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRcdFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhYmxlSXRlcmF0b3I8W3N0cmluZywgVF0+IHtcblx0XHRcdHJldHVybiBtYXBwZWQuZW50cmllcygpO1xuXHRcdH0sXG5cblx0XHQvKiogQGluaGVyaXRkb2MgKi9cblx0XHRyZXBsYWNlKGl0ZW1zOiBJdGVyYWJsZTxUPikge1xuXHRcdFx0Y29uc3QgbmV3TWFwcGVkID0gbmV3IE1hcDxzdHJpbmcsIFQ+KCk7XG5cdFx0XHRjb25zdCB0b0RlbGV0ZSA9IG5ldyBTZXQobWFwcGVkLmtleXMoKSk7XG5cdFx0XHRjb25zdCBidWxrOiBJVGVzdEl0ZW1CdWxrUmVwbGFjZSA9IHsgb3A6IFRlc3RJdGVtRXZlbnRPcC5CdWxrLCBvcHM6IFtdIH07XG5cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRpZiAoIShpdGVtIGluc3RhbmNlb2YgY2hlY2tDdG9yKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBJbnZhbGlkVGVzdEl0ZW1FcnJvcigoaXRlbSBhcyBJVGVzdEl0ZW1MaWtlKS5pZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpdGVtQ29udHJvbGxlciA9IGdldEFwaShpdGVtKS5jb250cm9sbGVySWQ7XG5cdFx0XHRcdGlmIChpdGVtQ29udHJvbGxlciAhPT0gYXBpLmNvbnRyb2xsZXJJZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBNaXhlZFRlc3RJdGVtQ29udHJvbGxlcihpdGVtLmlkLCBpdGVtQ29udHJvbGxlciwgYXBpLmNvbnRyb2xsZXJJZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobmV3TWFwcGVkLmhhcyhpdGVtLmlkKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBEdXBsaWNhdGVUZXN0SXRlbUVycm9yKGl0ZW0uaWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmV3TWFwcGVkLnNldChpdGVtLmlkLCBpdGVtKTtcblx0XHRcdFx0dG9EZWxldGUuZGVsZXRlKGl0ZW0uaWQpO1xuXHRcdFx0XHRidWxrLm9wcy5wdXNoKHsgb3A6IFRlc3RJdGVtRXZlbnRPcC5VcHNlcnQsIGl0ZW0gfSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgaWQgb2YgdG9EZWxldGUua2V5cygpKSB7XG5cdFx0XHRcdGJ1bGsub3BzLnB1c2goeyBvcDogVGVzdEl0ZW1FdmVudE9wLlJlbW92ZUNoaWxkLCBpZCB9KTtcblx0XHRcdH1cblxuXHRcdFx0YXBpLmxpc3RlbmVyPy4oYnVsayk7XG5cblx0XHRcdC8vIGltcG9ydGFudCBtdXRhdGlvbnMgY29tZSBhZnRlciBmaXJpbmcsIHNvIGlmIGFuIGVycm9yIGhhcHBlbnMgbm9cblx0XHRcdC8vIGNoYW5nZXMgd2lsbCBiZSBcInNhdmVkXCI6XG5cdFx0XHRtYXBwZWQgPSBuZXdNYXBwZWQ7XG5cdFx0fSxcblxuXG5cdFx0LyoqIEBpbmhlcml0ZG9jICovXG5cdFx0YWRkKGl0ZW06IFQpIHtcblx0XHRcdGlmICghKGl0ZW0gaW5zdGFuY2VvZiBjaGVja0N0b3IpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBJbnZhbGlkVGVzdEl0ZW1FcnJvcigoaXRlbSBhcyBJVGVzdEl0ZW1MaWtlKS5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdG1hcHBlZC5zZXQoaXRlbS5pZCwgaXRlbSk7XG5cdFx0XHRhcGkubGlzdGVuZXI/Lih7IG9wOiBUZXN0SXRlbUV2ZW50T3AuVXBzZXJ0LCBpdGVtIH0pO1xuXHRcdH0sXG5cblx0XHQvKiogQGluaGVyaXRkb2MgKi9cblx0XHRkZWxldGUoaWQ6IHN0cmluZykge1xuXHRcdFx0aWYgKG1hcHBlZC5kZWxldGUoaWQpKSB7XG5cdFx0XHRcdGFwaS5saXN0ZW5lcj8uKHsgb3A6IFRlc3RJdGVtRXZlbnRPcC5SZW1vdmVDaGlsZCwgaWQgfSk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRcdGdldChpdGVtSWQ6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIG1hcHBlZC5nZXQoaXRlbUlkKTtcblx0XHR9LFxuXG5cdFx0LyoqIEpTT04gc2VyaWFsaXphdGlvbiBmdW5jdGlvbi4gKi9cblx0XHR0b0pTT04oKSB7XG5cdFx0XHRyZXR1cm4gQXJyYXkuZnJvbShtYXBwZWQudmFsdWVzKCkpO1xuXHRcdH0sXG5cdH07XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLFlBQVksd0JBQXdCO0FBQ3RELFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUEwQyxrQkFBa0IsZ0JBQWdCLDJCQUFtRDtBQUN4SSxTQUFTLGNBQWM7QUFpQmhCLElBQVcsa0JBQVgsa0JBQVdBLHFCQUFYO0FBQ04sRUFBQUEsa0NBQUE7QUFDQSxFQUFBQSxrQ0FBQTtBQUNBLEVBQUFBLGtDQUFBO0FBQ0EsRUFBQUEsa0NBQUE7QUFDQSxFQUFBQSxrQ0FBQTtBQUNBLEVBQUFBLGtDQUFBO0FBQ0EsRUFBQUEsa0NBQUE7QUFQaUIsU0FBQUE7QUFBQSxHQUFBO0FBK0VsQixNQUFNLHdCQUF3QixDQUFJLEdBQU0sTUFBUyxNQUFNO0FBQ3ZELE1BQU0sZ0JBQTRGO0FBQUEsRUFDakcsT0FBTyxDQUFDLEdBQUcsTUFBTTtBQUNoQixRQUFJLE1BQU0sR0FBRztBQUFFLGFBQU87QUFBQSxJQUFNO0FBQzVCLFFBQUksQ0FBQyxLQUFLLENBQUMsR0FBRztBQUFFLGFBQU87QUFBQSxJQUFPO0FBQzlCLFdBQU8sRUFBRSxZQUFZLENBQUM7QUFBQSxFQUN2QjtBQUFBLEVBQ0EsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFB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
