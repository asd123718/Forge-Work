import { URI } from "../../../../base/common/uri.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { localize } from "../../../../nls.js";
import { TestId } from "./testId.js";
var TestResultState = /* @__PURE__ */ ((TestResultState2) => {
  TestResultState2[TestResultState2["Unset"] = 0] = "Unset";
  TestResultState2[TestResultState2["Queued"] = 1] = "Queued";
  TestResultState2[TestResultState2["Running"] = 2] = "Running";
  TestResultState2[TestResultState2["Passed"] = 3] = "Passed";
  TestResultState2[TestResultState2["Failed"] = 4] = "Failed";
  TestResultState2[TestResultState2["Skipped"] = 5] = "Skipped";
  TestResultState2[TestResultState2["Errored"] = 6] = "Errored";
  return TestResultState2;
})(TestResultState || {});
const testResultStateToContextValues = {
  [0 /* Unset */]: "unset",
  [1 /* Queued */]: "queued",
  [2 /* Running */]: "running",
  [3 /* Passed */]: "passed",
  [4 /* Failed */]: "failed",
  [5 /* Skipped */]: "skipped",
  [6 /* Errored */]: "errored"
};
var ExtTestRunProfileKind = /* @__PURE__ */ ((ExtTestRunProfileKind2) => {
  ExtTestRunProfileKind2[ExtTestRunProfileKind2["Run"] = 1] = "Run";
  ExtTestRunProfileKind2[ExtTestRunProfileKind2["Debug"] = 2] = "Debug";
  ExtTestRunProfileKind2[ExtTestRunProfileKind2["Coverage"] = 3] = "Coverage";
  return ExtTestRunProfileKind2;
})(ExtTestRunProfileKind || {});
var TestControllerCapability = /* @__PURE__ */ ((TestControllerCapability2) => {
  TestControllerCapability2[TestControllerCapability2["Refresh"] = 2] = "Refresh";
  TestControllerCapability2[TestControllerCapability2["CodeRelatedToTest"] = 4] = "CodeRelatedToTest";
  TestControllerCapability2[TestControllerCapability2["TestRelatedToCode"] = 8] = "TestRelatedToCode";
  return TestControllerCapability2;
})(TestControllerCapability || {});
var TestRunProfileBitset = /* @__PURE__ */ ((TestRunProfileBitset2) => {
  TestRunProfileBitset2[TestRunProfileBitset2["Run"] = 2] = "Run";
  TestRunProfileBitset2[TestRunProfileBitset2["Debug"] = 4] = "Debug";
  TestRunProfileBitset2[TestRunProfileBitset2["Coverage"] = 8] = "Coverage";
  TestRunProfileBitset2[TestRunProfileBitset2["HasNonDefaultProfile"] = 16] = "HasNonDefaultProfile";
  TestRunProfileBitset2[TestRunProfileBitset2["HasConfigurable"] = 32] = "HasConfigurable";
  TestRunProfileBitset2[TestRunProfileBitset2["SupportsContinuousRun"] = 64] = "SupportsContinuousRun";
  return TestRunProfileBitset2;
})(TestRunProfileBitset || {});
const testProfileBitset = {
  [2 /* Run */]: localize("testing.runProfileBitset.run", "Run"),
  [4 /* Debug */]: localize("testing.runProfileBitset.debug", "Debug"),
  [8 /* Coverage */]: localize("testing.runProfileBitset.coverage", "Coverage")
};
const testRunProfileBitsetList = [
  2 /* Run */,
  4 /* Debug */,
  8 /* Coverage */,
  16 /* HasNonDefaultProfile */,
  32 /* HasConfigurable */,
  64 /* SupportsContinuousRun */
];
const isStartControllerTests = (t) => "runId" in t;
var IRichLocation;
((IRichLocation2) => {
  IRichLocation2.serialize = (location) => ({
    range: location.range.toJSON(),
    uri: location.uri.toJSON()
  });
  IRichLocation2.deserialize = (uriIdentity, location) => ({
    range: Range.lift(location.range),
    uri: uriIdentity.asCanonicalUri(URI.revive(location.uri))
  });
})(IRichLocation || (IRichLocation = {}));
var TestMessageType = /* @__PURE__ */ ((TestMessageType2) => {
  TestMessageType2[TestMessageType2["Error"] = 0] = "Error";
  TestMessageType2[TestMessageType2["Output"] = 1] = "Output";
  return TestMessageType2;
})(TestMessageType || {});
var ITestMessageStackFrame;
((ITestMessageStackFrame2) => {
  ITestMessageStackFrame2.serialize = (stack) => ({
    label: stack.label,
    uri: stack.uri?.toJSON(),
    position: stack.position?.toJSON()
  });
  ITestMessageStackFrame2.deserialize = (uriIdentity, stack) => ({
    label: stack.label,
    uri: stack.uri ? uriIdentity.asCanonicalUri(URI.revive(stack.uri)) : void 0,
    position: stack.position ? Position.lift(stack.position) : void 0
  });
})(ITestMessageStackFrame || (ITestMessageStackFrame = {}));
var ITestErrorMessage;
((ITestErrorMessage2) => {
  ITestErrorMessage2.serialize = (message) => ({
    message: message.message,
    type: 0 /* Error */,
    expected: message.expected,
    actual: message.actual,
    contextValue: message.contextValue,
    location: message.location && IRichLocation.serialize(message.location),
    stackTrace: message.stackTrace?.map(ITestMessageStackFrame.serialize)
  });
  ITestErrorMessage2.deserialize = (uriIdentity, message) => ({
    message: message.message,
    type: 0 /* Error */,
    expected: message.expected,
    actual: message.actual,
    contextValue: message.contextValue,
    location: message.location && IRichLocation.deserialize(uriIdentity, message.location),
    stackTrace: message.stackTrace && message.stackTrace.map((s) => ITestMessageStackFrame.deserialize(uriIdentity, s))
  });
})(ITestErrorMessage || (ITestErrorMessage = {}));
const getMarkId = (marker, start) => `${start ? "s" : "e"}${marker}`;
var ITestOutputMessage;
((ITestOutputMessage2) => {
  ITestOutputMessage2.serialize = (message) => ({
    message: message.message,
    type: 1 /* Output */,
    offset: message.offset,
    length: message.length,
    location: message.location && IRichLocation.serialize(message.location)
  });
  ITestOutputMessage2.deserialize = (uriIdentity, message) => ({
    message: message.message,
    type: 1 /* Output */,
    offset: message.offset,
    length: message.length,
    location: message.location && IRichLocation.deserialize(uriIdentity, message.location)
  });
})(ITestOutputMessage || (ITestOutputMessage = {}));
var ITestMessage;
((ITestMessage2) => {
  ITestMessage2.serialize = (message) => message.type === 0 /* Error */ ? ITestErrorMessage.serialize(message) : ITestOutputMessage.serialize(message);
  ITestMessage2.deserialize = (uriIdentity, message) => message.type === 0 /* Error */ ? ITestErrorMessage.deserialize(uriIdentity, message) : ITestOutputMessage.deserialize(uriIdentity, message);
  ITestMessage2.isDiffable = (message) => message.type === 0 /* Error */ && message.actual !== void 0 && message.expected !== void 0;
})(ITestMessage || (ITestMessage = {}));
var ITestTaskState;
((ITestTaskState2) => {
  ITestTaskState2.serializeWithoutMessages = (state) => ({
    state: state.state,
    duration: state.duration,
    messages: []
  });
  ITestTaskState2.serialize = (state) => ({
    state: state.state,
    duration: state.duration,
    messages: state.messages.map(ITestMessage.serialize)
  });
  ITestTaskState2.deserialize = (uriIdentity, state) => ({
    state: state.state,
    duration: state.duration,
    messages: state.messages.map((m) => ITestMessage.deserialize(uriIdentity, m))
  });
})(ITestTaskState || (ITestTaskState = {}));
const testTagDelimiter = "\0";
const namespaceTestTag = (ctrlId, tagId) => ctrlId + testTagDelimiter + tagId;
const denamespaceTestTag = (namespaced) => {
  const index = namespaced.indexOf(testTagDelimiter);
  return { ctrlId: namespaced.slice(0, index), tagId: namespaced.slice(index + 1) };
};
var ITestItem;
((ITestItem2) => {
  ITestItem2.serialize = (item) => ({
    extId: item.extId,
    label: item.label,
    tags: item.tags,
    busy: item.busy,
    children: void 0,
    uri: item.uri?.toJSON(),
    range: item.range?.toJSON() || null,
    description: item.description,
    error: item.error,
    sortText: item.sortText
  });
  ITestItem2.deserialize = (uriIdentity, serialized) => ({
    extId: serialized.extId,
    label: serialized.label,
    tags: serialized.tags,
    busy: serialized.busy,
    children: void 0,
    uri: serialized.uri ? uriIdentity.asCanonicalUri(URI.revive(serialized.uri)) : void 0,
    range: serialized.range ? Range.lift(serialized.range) : null,
    description: serialized.description,
    error: serialized.error,
    sortText: serialized.sortText
  });
})(ITestItem || (ITestItem = {}));
var TestItemExpandState = /* @__PURE__ */ ((TestItemExpandState2) => {
  TestItemExpandState2[TestItemExpandState2["NotExpandable"] = 0] = "NotExpandable";
  TestItemExpandState2[TestItemExpandState2["Expandable"] = 1] = "Expandable";
  TestItemExpandState2[TestItemExpandState2["BusyExpanding"] = 2] = "BusyExpanding";
  TestItemExpandState2[TestItemExpandState2["Expanded"] = 3] = "Expanded";
  return TestItemExpandState2;
})(TestItemExpandState || {});
var InternalTestItem;
((InternalTestItem2) => {
  InternalTestItem2.serialize = (item) => ({
    expand: item.expand,
    item: ITestItem.serialize(item.item)
  });
  InternalTestItem2.deserialize = (uriIdentity, serialized) => ({
    // the `controllerId` is derived from the test.item.extId. It's redundant
    // in the non-serialized InternalTestItem too, but there just because it's
    // checked against in many hot paths.
    controllerId: TestId.root(serialized.item.extId),
    expand: serialized.expand,
    item: ITestItem.deserialize(uriIdentity, serialized.item)
  });
})(InternalTestItem || (InternalTestItem = {}));
var ITestItemUpdate;
((ITestItemUpdate2) => {
  ITestItemUpdate2.serialize = (u) => {
    let item;
    if (u.item) {
      item = {};
      if (u.item.label !== void 0) {
        item.label = u.item.label;
      }
      if (u.item.tags !== void 0) {
        item.tags = u.item.tags;
      }
      if (u.item.busy !== void 0) {
        item.busy = u.item.busy;
      }
      if (u.item.uri !== void 0) {
        item.uri = u.item.uri?.toJSON();
      }
      if (u.item.range !== void 0) {
        item.range = u.item.range?.toJSON();
      }
      if (u.item.description !== void 0) {
        item.description = u.item.description;
      }
      if (u.item.error !== void 0) {
        item.error = u.item.error;
      }
      if (u.item.sortText !== void 0) {
        item.sortText = u.item.sortText;
      }
    }
    return { extId: u.extId, expand: u.expand, item };
  };
  ITestItemUpdate2.deserialize = (u) => {
    let item;
    if (u.item) {
      item = {};
      if (u.item.label !== void 0) {
        item.label = u.item.label;
      }
      if (u.item.tags !== void 0) {
        item.tags = u.item.tags;
      }
      if (u.item.busy !== void 0) {
        item.busy = u.item.busy;
      }
      if (u.item.range !== void 0) {
        item.range = u.item.range ? Range.lift(u.item.range) : null;
      }
      if (u.item.description !== void 0) {
        item.description = u.item.description;
      }
      if (u.item.error !== void 0) {
        item.error = u.item.error;
      }
      if (u.item.sortText !== void 0) {
        item.sortText = u.item.sortText;
      }
    }
    return { extId: u.extId, expand: u.expand, item };
  };
})(ITestItemUpdate || (ITestItemUpdate = {}));
const applyTestItemUpdate = (internal, patch) => {
  if (patch.expand !== void 0) {
    internal.expand = patch.expand;
  }
  if (patch.item !== void 0) {
    internal.item = internal.item ? Object.assign(internal.item, patch.item) : patch.item;
  }
};
var TestResultItem;
((TestResultItem2) => {
  TestResultItem2.serializeWithoutMessages = (original) => ({
    ...InternalTestItem.serialize(original),
    ownComputedState: original.ownComputedState,
    computedState: original.computedState,
    tasks: original.tasks.map(ITestTaskState.serializeWithoutMessages)
  });
  TestResultItem2.serialize = (original) => ({
    ...InternalTestItem.serialize(original),
    ownComputedState: original.ownComputedState,
    computedState: original.computedState,
    tasks: original.tasks.map(ITestTaskState.serialize)
  });
  TestResultItem2.deserialize = (uriIdentity, serialized) => ({
    ...InternalTestItem.deserialize(uriIdentity, serialized),
    ownComputedState: serialized.ownComputedState,
    computedState: serialized.computedState,
    tasks: serialized.tasks.map((m) => ITestTaskState.deserialize(uriIdentity, m)),
    retired: true
  });
})(TestResultItem || (TestResultItem = {}));
var ICoverageCount;
((ICoverageCount2) => {
  ICoverageCount2.empty = () => ({ covered: 0, total: 0 });
  ICoverageCount2.sum = (target, src) => {
    target.covered += src.covered;
    target.total += src.total;
  };
})(ICoverageCount || (ICoverageCount = {}));
var IFileCoverage;
((IFileCoverage2) => {
  IFileCoverage2.serialize = (original) => ({
    id: original.id,
    statement: original.statement,
    branch: original.branch,
    declaration: original.declaration,
    testIds: original.testIds,
    uri: original.uri.toJSON()
  });
  IFileCoverage2.deserialize = (uriIdentity, serialized) => ({
    id: serialized.id,
    statement: serialized.statement,
    branch: serialized.branch,
    declaration: serialized.declaration,
    testIds: serialized.testIds,
    uri: uriIdentity.asCanonicalUri(URI.revive(serialized.uri))
  });
  IFileCoverage2.empty = (id, uri) => ({
    id,
    uri,
    statement: ICoverageCount.empty()
  });
})(IFileCoverage || (IFileCoverage = {}));
function serializeThingWithLocation(serialized) {
  return {
    ...serialized,
    location: serialized.location?.toJSON()
  };
}
function deserializeThingWithLocation(serialized) {
  serialized.location = serialized.location ? Position.isIPosition(serialized.location) ? Position.lift(serialized.location) : Range.lift(serialized.location) : void 0;
  return serialized;
}
const KEEP_N_LAST_COVERAGE_REPORTS = 3;
var DetailType = /* @__PURE__ */ ((DetailType2) => {
  DetailType2[DetailType2["Declaration"] = 0] = "Declaration";
  DetailType2[DetailType2["Statement"] = 1] = "Statement";
  DetailType2[DetailType2["Branch"] = 2] = "Branch";
  return DetailType2;
})(DetailType || {});
var CoverageDetails;
((CoverageDetails2) => {
  CoverageDetails2.serialize = (original) => original.type === 0 /* Declaration */ ? IDeclarationCoverage.serialize(original) : IStatementCoverage.serialize(original);
  CoverageDetails2.deserialize = (serialized) => serialized.type === 0 /* Declaration */ ? IDeclarationCoverage.deserialize(serialized) : IStatementCoverage.deserialize(serialized);
})(CoverageDetails || (CoverageDetails = {}));
var IBranchCoverage;
((IBranchCoverage2) => {
  IBranchCoverage2.serialize = serializeThingWithLocation;
  IBranchCoverage2.deserialize = deserializeThingWithLocation;
})(IBranchCoverage || (IBranchCoverage = {}));
var IDeclarationCoverage;
((IDeclarationCoverage2) => {
  IDeclarationCoverage2.serialize = serializeThingWithLocation;
  IDeclarationCoverage2.deserialize = deserializeThingWithLocation;
})(IDeclarationCoverage || (IDeclarationCoverage = {}));
var IStatementCoverage;
((IStatementCoverage2) => {
  IStatementCoverage2.serialize = (original) => ({
    ...serializeThingWithLocation(original),
    branches: original.branches?.map(IBranchCoverage.serialize)
  });
  IStatementCoverage2.deserialize = (serialized) => ({
    ...deserializeThingWithLocation(serialized),
    branches: serialized.branches?.map(IBranchCoverage.deserialize)
  });
})(IStatementCoverage || (IStatementCoverage = {}));
var TestDiffOpType = /* @__PURE__ */ ((TestDiffOpType2) => {
  TestDiffOpType2[TestDiffOpType2["Add"] = 0] = "Add";
  TestDiffOpType2[TestDiffOpType2["Update"] = 1] = "Update";
  TestDiffOpType2[TestDiffOpType2["DocumentSynced"] = 2] = "DocumentSynced";
  TestDiffOpType2[TestDiffOpType2["Remove"] = 3] = "Remove";
  TestDiffOpType2[TestDiffOpType2["IncrementPendingExtHosts"] = 4] = "IncrementPendingExtHosts";
  TestDiffOpType2[TestDiffOpType2["Retire"] = 5] = "Retire";
  TestDiffOpType2[TestDiffOpType2["AddTag"] = 6] = "AddTag";
  TestDiffOpType2[TestDiffOpType2["RemoveTag"] = 7] = "RemoveTag";
  return TestDiffOpType2;
})(TestDiffOpType || {});
var TestsDiffOp;
((TestsDiffOp2) => {
  TestsDiffOp2.deserialize = (uriIdentity, u) => {
    if (u.op === 0 /* Add */) {
      return { op: u.op, item: InternalTestItem.deserialize(uriIdentity, u.item) };
    } else if (u.op === 1 /* Update */) {
      return { op: u.op, item: ITestItemUpdate.deserialize(u.item) };
    } else if (u.op === 2 /* DocumentSynced */) {
      return { op: u.op, uri: uriIdentity.asCanonicalUri(URI.revive(u.uri)), docv: u.docv };
    } else {
      return u;
    }
  };
  TestsDiffOp2.serialize = (u) => {
    if (u.op === 0 /* Add */) {
      return { op: u.op, item: InternalTestItem.serialize(u.item) };
    } else if (u.op === 1 /* Update */) {
      return { op: u.op, item: ITestItemUpdate.serialize(u.item) };
    } else {
      return u;
    }
  };
})(TestsDiffOp || (TestsDiffOp = {}));
class AbstractIncrementalTestCollection {
  constructor(uriIdentity) {
    this.uriIdentity = uriIdentity;
    this._tags = /* @__PURE__ */ new Map();
    /**
     * Map of item IDs to test item objects.
     */
    this.items = /* @__PURE__ */ new Map();
    /**
     * ID of test root items.
     */
    this.roots = /* @__PURE__ */ new Set();
    /**
     * Number of 'busy' controllers.
     */
    this.busyControllerCount = 0;
    /**
     * Number of pending roots.
     */
    this.pendingRootCount = 0;
    /**
     * Known test tags.
     */
    this.tags = this._tags;
  }
  /**
   * Applies the diff to the collection.
   */
  apply(diff) {
    const changes = this.createChangeCollector();
    for (const op of diff) {
      switch (op.op) {
        case 0 /* Add */:
          this.add(InternalTestItem.deserialize(this.uriIdentity, op.item), changes);
          break;
        case 1 /* Update */:
          this.update(ITestItemUpdate.deserialize(op.item), changes);
          break;
        case 3 /* Remove */:
          this.remove(op.itemId, changes);
          break;
        case 5 /* Retire */:
          this.retireTest(op.itemId);
          break;
        case 4 /* IncrementPendingExtHosts */:
          this.updatePendingRoots(op.amount);
          break;
        case 6 /* AddTag */:
          this._tags.set(op.tag.id, op.tag);
          break;
        case 7 /* RemoveTag */:
          this._tags.delete(op.id);
          break;
      }
    }
    changes.complete?.();
  }
  add(item, changes) {
    const parentId = TestId.parentId(item.item.extId)?.toString();
    let created;
    if (!parentId) {
      created = this.createItem(item);
      this.roots.add(created);
      this.items.set(item.item.extId, created);
    } else if (this.items.has(parentId)) {
      const parent = this.items.get(parentId);
      parent.children.add(item.item.extId);
      created = this.createItem(item, parent);
      this.items.set(item.item.extId, created);
    } else {
      console.error(`Test with unknown parent ID: ${JSON.stringify(item)}`);
      return;
    }
    changes.add?.(created);
    if (item.expand === 2 /* BusyExpanding */) {
      this.busyControllerCount++;
    }
    return created;
  }
  update(patch, changes) {
    const existing = this.items.get(patch.extId);
    if (!existing) {
      return;
    }
    if (patch.expand !== void 0) {
      if (existing.expand === 2 /* BusyExpanding */) {
        this.busyControllerCount--;
      }
      if (patch.expand === 2 /* BusyExpanding */) {
        this.busyControllerCount++;
      }
    }
    applyTestItemUpdate(existing, patch);
    changes.update?.(existing);
    return existing;
  }
  remove(itemId, changes) {
    const toRemove = this.items.get(itemId);
    if (!toRemove) {
      return;
    }
    const parentId = TestId.parentId(toRemove.item.extId)?.toString();
    if (parentId) {
      const parent = this.items.get(parentId);
      parent.children.delete(toRemove.item.extId);
    } else {
      this.roots.delete(toRemove);
    }
    const queue = [[itemId]];
    while (queue.length) {
      for (const itemId2 of queue.pop()) {
        const existing = this.items.get(itemId2);
        if (existing) {
          queue.push(existing.children);
          this.items.delete(itemId2);
          changes.remove?.(existing, existing !== toRemove);
          if (existing.expand === 2 /* BusyExpanding */) {
            this.busyControllerCount--;
          }
        }
      }
    }
  }
  /**
   * Called when the extension signals a test result should be retired.
   */
  retireTest(testId) {
  }
  /**
   * Updates the number of test root sources who are yet to report. When
   * the total pending test roots reaches 0, the roots for all controllers
   * will exist in the collection.
   */
  updatePendingRoots(delta) {
    this.pendingRootCount += delta;
  }
  /**
   * Called before a diff is applied to create a new change collector.
   */
  createChangeCollector() {
    return {};
  }
}
export {
  AbstractIncrementalTestCollection,
  CoverageDetails,
  DetailType,
  ExtTestRunProfileKind,
  IBranchCoverage,
  ICoverageCount,
  IDeclarationCoverage,
  IFileCoverage,
  IRichLocation,
  IStatementCoverage,
  ITestErrorMessage,
  ITestItem,
  ITestItemUpdate,
  ITestMessage,
  ITestMessageStackFrame,
  ITestOutputMessage,
  ITestTaskState,
  InternalTestItem,
  KEEP_N_LAST_COVERAGE_REPORTS,
  TestControllerCapability,
  TestDiffOpType,
  TestItemExpandState,
  TestMessageType,
  TestResultItem,
  TestResultState,
  TestRunProfileBitset,
  TestsDiffOp,
  applyTestItemUpdate,
  denamespaceTestTag,
  getMarkId,
  isStartControllerTests,
  namespaceTestTag,
  testProfileBitset,
  testResultStateToContextValues,
  testRunProfileBitsetList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdFR5cGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuL3Rlc3RJZC5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RSZXN1bHRTdGF0ZSB7XG5cdFVuc2V0ID0gMCxcblx0UXVldWVkID0gMSxcblx0UnVubmluZyA9IDIsXG5cdFBhc3NlZCA9IDMsXG5cdEZhaWxlZCA9IDQsXG5cdFNraXBwZWQgPSA1LFxuXHRFcnJvcmVkID0gNlxufVxuXG5leHBvcnQgY29uc3QgdGVzdFJlc3VsdFN0YXRlVG9Db250ZXh0VmFsdWVzOiB7IFtLIGluIFRlc3RSZXN1bHRTdGF0ZV06IHN0cmluZyB9ID0ge1xuXHRbVGVzdFJlc3VsdFN0YXRlLlVuc2V0XTogJ3Vuc2V0Jyxcblx0W1Rlc3RSZXN1bHRTdGF0ZS5RdWV1ZWRdOiAncXVldWVkJyxcblx0W1Rlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nXTogJ3J1bm5pbmcnLFxuXHRbVGVzdFJlc3VsdFN0YXRlLlBhc3NlZF06ICdwYXNzZWQnLFxuXHRbVGVzdFJlc3VsdFN0YXRlLkZhaWxlZF06ICdmYWlsZWQnLFxuXHRbVGVzdFJlc3VsdFN0YXRlLlNraXBwZWRdOiAnc2tpcHBlZCcsXG5cdFtUZXN0UmVzdWx0U3RhdGUuRXJyb3JlZF06ICdlcnJvcmVkJyxcbn07XG5cbi8qKiBub3RlOiBrZWVwIGluIHN5bmMgd2l0aCBUZXN0UnVuUHJvZmlsZUtpbmQgaW4gdnNjb2RlLmQudHMgKi9cbmV4cG9ydCBjb25zdCBlbnVtIEV4dFRlc3RSdW5Qcm9maWxlS2luZCB7XG5cdFJ1biA9IDEsXG5cdERlYnVnID0gMixcblx0Q292ZXJhZ2UgPSAzLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkge1xuXHRSZWZyZXNoID0gMSA8PCAxLFxuXHRDb2RlUmVsYXRlZFRvVGVzdCA9IDEgPDwgMixcblx0VGVzdFJlbGF0ZWRUb0NvZGUgPSAxIDw8IDMsXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RSdW5Qcm9maWxlQml0c2V0IHtcblx0UnVuID0gMSA8PCAxLFxuXHREZWJ1ZyA9IDEgPDwgMixcblx0Q292ZXJhZ2UgPSAxIDw8IDMsXG5cdEhhc05vbkRlZmF1bHRQcm9maWxlID0gMSA8PCA0LFxuXHRIYXNDb25maWd1cmFibGUgPSAxIDw8IDUsXG5cdFN1cHBvcnRzQ29udGludW91c1J1biA9IDEgPDwgNixcbn1cblxuZXhwb3J0IGNvbnN0IHRlc3RQcm9maWxlQml0c2V0ID0ge1xuXHRbVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuXTogbG9jYWxpemUoJ3Rlc3RpbmcucnVuUHJvZmlsZUJpdHNldC5ydW4nLCAnUnVuJyksXG5cdFtUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Z106IGxvY2FsaXplKCd0ZXN0aW5nLnJ1blByb2ZpbGVCaXRzZXQuZGVidWcnLCAnRGVidWcnKSxcblx0W1Rlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlXTogbG9jYWxpemUoJ3Rlc3RpbmcucnVuUHJvZmlsZUJpdHNldC5jb3ZlcmFnZScsICdDb3ZlcmFnZScpLFxufTtcblxuLyoqXG4gKiBMaXN0IG9mIGFsbCB0ZXN0IHJ1biBwcm9maWxlIGJpdHNldCB2YWx1ZXMuXG4gKi9cbmV4cG9ydCBjb25zdCB0ZXN0UnVuUHJvZmlsZUJpdHNldExpc3QgPSBbXG5cdFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bixcblx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsXG5cdFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlLFxuXHRUZXN0UnVuUHJvZmlsZUJpdHNldC5IYXNOb25EZWZhdWx0UHJvZmlsZSxcblx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuSGFzQ29uZmlndXJhYmxlLFxuXHRUZXN0UnVuUHJvZmlsZUJpdHNldC5TdXBwb3J0c0NvbnRpbnVvdXNSdW4sXG5dO1xuXG4vKipcbiAqIERUTyBmb3IgYSBjb250cm9sbGVyJ3MgcnVuIHByb2ZpbGVzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0UnVuUHJvZmlsZSB7XG5cdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXHRwcm9maWxlSWQ6IG51bWJlcjtcblx0bGFiZWw6IHN0cmluZztcblx0Z3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0O1xuXHRpc0RlZmF1bHQ6IGJvb2xlYW47XG5cdHRhZzogc3RyaW5nIHwgbnVsbDtcblx0aGFzQ29uZmlndXJhdGlvbkhhbmRsZXI6IGJvb2xlYW47XG5cdHN1cHBvcnRzQ29udGludW91c1J1bjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJ1blByb2ZpbGVSZWZlcmVuY2Uge1xuXHRjb250cm9sbGVySWQ6IHN0cmluZztcblx0cHJvZmlsZUlkOiBudW1iZXI7XG5cdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldDtcbn1cblxuLyoqXG4gKiBBIGZ1bGx5LXJlc29sdmVkIHJlcXVlc3QgdG8gcnVuIHRlc3RzLCBwYXNzc2VkIGJldHdlZW4gdGhlIG1haW4gdGhyZWFkXG4gKiBhbmQgZXh0ZW5zaW9uIGhvc3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCB7XG5cdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldDtcblx0dGFyZ2V0czoge1xuXHRcdHRlc3RJZHM6IHN0cmluZ1tdO1xuXHRcdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXHRcdHByb2ZpbGVJZDogbnVtYmVyO1xuXHR9W107XG5cdGV4Y2x1ZGU/OiBzdHJpbmdbXTtcblx0LyoqIFdoZXRoZXIgdGhpcyBpcyBhIGNvbnRpbnVvdXMgdGVzdCBydW4gKi9cblx0Y29udGludW91cz86IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoaXMgd2FzIHRyaWdnZWQgYnkgYSB1c2VyIGFjdGlvbiBpbiBVSS4gRGVmYXVsdD10cnVlICovXG5cdHByZXNlcnZlRm9jdXM/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlcXVlc3QgdG8gdGhlIG1haW4gdGhyZWFkIHRvIHJ1biBhIHNldCBvZiB0ZXN0cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFeHRlbnNpb25SdW5UZXN0c1JlcXVlc3Qge1xuXHRpZDogc3RyaW5nO1xuXHRpbmNsdWRlOiBzdHJpbmdbXTtcblx0ZXhjbHVkZTogc3RyaW5nW107XG5cdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXHRwcm9maWxlPzogeyBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQ7IGlkOiBudW1iZXIgfTtcblx0cGVyc2lzdDogYm9vbGVhbjtcblx0cHJlc2VydmVGb2N1czogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdGhpcyBpcyBhIHJlc3VsdCBvZiBhIGNvbnRpbnVvdXMgdGVzdCBydW4gcmVxdWVzdCAqL1xuXHRjb250aW51b3VzOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlcXVlc3QgcGFyYW1ldGVycyBhIGNvbnRyb2xsZXIgcnVuIGhhbmRsZXIuIFRoaXMgaXMgZGlmZmVyZW50IHRoYW5cbiAqIHtAbGluayBJU3RhcnRDb250cm9sbGVyVGVzdHN9LiBUaGUgbGF0dGVyIGlzIHVzZWQgdG8gYXNrIGZvciBvbmUgb3IgbW9yZSB0ZXN0XG4gKiBydW5zIHRyYWNrZWQgZGlyZWN0bHkgYnkgdGhlIHJlbmRlcmVyLlxuICpcbiAqIFRoaXMgYWxvbmUgY2FuIGJlIHVzZWQgdG8gc3RhcnQgYW4gYXV0b3J1biwgd2l0aG91dCBhIHNwZWNpZmljIGFzc29jaWF0ZWQgcnVuSWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNhbGxQcm9maWxlUnVuSGFuZGxlciB7XG5cdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXHRwcm9maWxlSWQ6IG51bWJlcjtcblx0ZXhjbHVkZUV4dElkczogc3RyaW5nW107XG5cdHRlc3RJZHM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY29uc3QgaXNTdGFydENvbnRyb2xsZXJUZXN0cyA9ICh0OiBJQ2FsbFByb2ZpbGVSdW5IYW5kbGVyIHwgSVN0YXJ0Q29udHJvbGxlclRlc3RzKTogdCBpcyBJU3RhcnRDb250cm9sbGVyVGVzdHMgPT4gKCdydW5JZCcgYXMga2V5b2YgSVN0YXJ0Q29udHJvbGxlclRlc3RzKSBpbiB0O1xuXG4vKipcbiAqIFJlcXVlc3QgZnJvbSB0aGUgbWFpbiB0aHJlYWQgdG8gcnVuIHRlc3RzIGZvciBhIHNpbmdsZSBjb250cm9sbGVyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTdGFydENvbnRyb2xsZXJUZXN0cyBleHRlbmRzIElDYWxsUHJvZmlsZVJ1bkhhbmRsZXIge1xuXHRydW5JZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGFydENvbnRyb2xsZXJUZXN0c1Jlc3VsdCB7XG5cdGVycm9yPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIExvY2F0aW9uIHdpdGggYSBmdWxseS1pbnN0YW50aWF0ZWQgUmFuZ2UgYW5kIFVSSS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUmljaExvY2F0aW9uIHtcblx0cmFuZ2U6IFJhbmdlO1xuXHR1cmk6IFVSSTtcbn1cblxuLyoqIFN1YnNldCBvZiB0aGUgSVVyaUlkZW50aXR5U2VydmljZSAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIge1xuXHQvKiogQGxpbmsgaW1wb3J0KCd2cy9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHknKS5JVXJpSWRlbnRpdHlTZXJ2aWNlICovXG5cdGFzQ2Fub25pY2FsVXJpKHVyaTogVVJJKTogVVJJO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElSaWNoTG9jYXRpb24ge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZSB7XG5cdFx0cmFuZ2U6IElSYW5nZTtcblx0XHR1cmk6IFVyaUNvbXBvbmVudHM7XG5cdH1cblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKGxvY2F0aW9uOiBSZWFkb25seTxJUmljaExvY2F0aW9uPik6IFNlcmlhbGl6ZSA9PiAoe1xuXHRcdHJhbmdlOiBsb2NhdGlvbi5yYW5nZS50b0pTT04oKSxcblx0XHR1cmk6IGxvY2F0aW9uLnVyaS50b0pTT04oKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIGxvY2F0aW9uOiBTZXJpYWxpemUpOiBJUmljaExvY2F0aW9uID0+ICh7XG5cdFx0cmFuZ2U6IFJhbmdlLmxpZnQobG9jYXRpb24ucmFuZ2UpLFxuXHRcdHVyaTogdXJpSWRlbnRpdHkuYXNDYW5vbmljYWxVcmkoVVJJLnJldml2ZShsb2NhdGlvbi51cmkpKSxcblx0fSk7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RNZXNzYWdlVHlwZSB7XG5cdEVycm9yLFxuXHRPdXRwdXRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lIHtcblx0bGFiZWw6IHN0cmluZztcblx0dXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdHVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZDtcblx0XHRwb3NpdGlvbjogSVBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChzdGFjazogUmVhZG9ubHk8SVRlc3RNZXNzYWdlU3RhY2tGcmFtZT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0bGFiZWw6IHN0YWNrLmxhYmVsLFxuXHRcdHVyaTogc3RhY2sudXJpPy50b0pTT04oKSxcblx0XHRwb3NpdGlvbjogc3RhY2sucG9zaXRpb24/LnRvSlNPTigpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgc3RhY2s6IFNlcmlhbGl6ZWQpOiBJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lID0+ICh7XG5cdFx0bGFiZWw6IHN0YWNrLmxhYmVsLFxuXHRcdHVyaTogc3RhY2sudXJpID8gdXJpSWRlbnRpdHkuYXNDYW5vbmljYWxVcmkoVVJJLnJldml2ZShzdGFjay51cmkpKSA6IHVuZGVmaW5lZCxcblx0XHRwb3NpdGlvbjogc3RhY2sucG9zaXRpb24gPyBQb3NpdGlvbi5saWZ0KHN0YWNrLnBvc2l0aW9uKSA6IHVuZGVmaW5lZCxcblx0fSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RFcnJvck1lc3NhZ2Uge1xuXHRtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcjtcblx0ZXhwZWN0ZWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0YWN0dWFsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsb2NhdGlvbjogSVJpY2hMb2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0c3RhY2tUcmFjZTogdW5kZWZpbmVkIHwgSVRlc3RNZXNzYWdlU3RhY2tGcmFtZVtdO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElUZXN0RXJyb3JNZXNzYWdlIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHRtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLkVycm9yO1xuXHRcdGV4cGVjdGVkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0YWN0dWFsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bG9jYXRpb246IElSaWNoTG9jYXRpb24uU2VyaWFsaXplIHwgdW5kZWZpbmVkO1xuXHRcdHN0YWNrVHJhY2U6IHVuZGVmaW5lZCB8IElUZXN0TWVzc2FnZVN0YWNrRnJhbWUuU2VyaWFsaXplZFtdO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChtZXNzYWdlOiBSZWFkb25seTxJVGVzdEVycm9yTWVzc2FnZT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0bWVzc2FnZTogbWVzc2FnZS5tZXNzYWdlLFxuXHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcixcblx0XHRleHBlY3RlZDogbWVzc2FnZS5leHBlY3RlZCxcblx0XHRhY3R1YWw6IG1lc3NhZ2UuYWN0dWFsLFxuXHRcdGNvbnRleHRWYWx1ZTogbWVzc2FnZS5jb250ZXh0VmFsdWUsXG5cdFx0bG9jYXRpb246IG1lc3NhZ2UubG9jYXRpb24gJiYgSVJpY2hMb2NhdGlvbi5zZXJpYWxpemUobWVzc2FnZS5sb2NhdGlvbiksXG5cdFx0c3RhY2tUcmFjZTogbWVzc2FnZS5zdGFja1RyYWNlPy5tYXAoSVRlc3RNZXNzYWdlU3RhY2tGcmFtZS5zZXJpYWxpemUpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgbWVzc2FnZTogU2VyaWFsaXplZCk6IElUZXN0RXJyb3JNZXNzYWdlID0+ICh7XG5cdFx0bWVzc2FnZTogbWVzc2FnZS5tZXNzYWdlLFxuXHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcixcblx0XHRleHBlY3RlZDogbWVzc2FnZS5leHBlY3RlZCxcblx0XHRhY3R1YWw6IG1lc3NhZ2UuYWN0dWFsLFxuXHRcdGNvbnRleHRWYWx1ZTogbWVzc2FnZS5jb250ZXh0VmFsdWUsXG5cdFx0bG9jYXRpb246IG1lc3NhZ2UubG9jYXRpb24gJiYgSVJpY2hMb2NhdGlvbi5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgbWVzc2FnZS5sb2NhdGlvbiksXG5cdFx0c3RhY2tUcmFjZTogbWVzc2FnZS5zdGFja1RyYWNlICYmIG1lc3NhZ2Uuc3RhY2tUcmFjZS5tYXAocyA9PiBJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lLmRlc2VyaWFsaXplKHVyaUlkZW50aXR5LCBzKSksXG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0T3V0cHV0TWVzc2FnZSB7XG5cdG1lc3NhZ2U6IHN0cmluZztcblx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLk91dHB1dDtcblx0b2Zmc2V0OiBudW1iZXI7XG5cdGxlbmd0aDogbnVtYmVyO1xuXHRtYXJrZXI/OiBudW1iZXI7XG5cdGxvY2F0aW9uOiBJUmljaExvY2F0aW9uIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEdldHMgdGhlIFRUWSBtYXJrZXIgSUQgZm9yIGVpdGhlciBzdGFydGluZyBvciBlbmRpbmdcbiAqIGFuIElUZXN0T3V0cHV0TWVzc2FnZS5tYXJrZXIgb2YgdGhlIGdpdmVuIElELlxuICovXG5leHBvcnQgY29uc3QgZ2V0TWFya0lkID0gKG1hcmtlcjogbnVtYmVyLCBzdGFydDogYm9vbGVhbikgPT4gYCR7c3RhcnQgPyAncycgOiAnZSd9JHttYXJrZXJ9YDtcblxuZXhwb3J0IG5hbWVzcGFjZSBJVGVzdE91dHB1dE1lc3NhZ2Uge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWQge1xuXHRcdG1lc3NhZ2U6IHN0cmluZztcblx0XHRvZmZzZXQ6IG51bWJlcjtcblx0XHRsZW5ndGg6IG51bWJlcjtcblx0XHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0O1xuXHRcdGxvY2F0aW9uOiBJUmljaExvY2F0aW9uLlNlcmlhbGl6ZSB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAobWVzc2FnZTogUmVhZG9ubHk8SVRlc3RPdXRwdXRNZXNzYWdlPik6IFNlcmlhbGl6ZWQgPT4gKHtcblx0XHRtZXNzYWdlOiBtZXNzYWdlLm1lc3NhZ2UsXG5cdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLk91dHB1dCxcblx0XHRvZmZzZXQ6IG1lc3NhZ2Uub2Zmc2V0LFxuXHRcdGxlbmd0aDogbWVzc2FnZS5sZW5ndGgsXG5cdFx0bG9jYXRpb246IG1lc3NhZ2UubG9jYXRpb24gJiYgSVJpY2hMb2NhdGlvbi5zZXJpYWxpemUobWVzc2FnZS5sb2NhdGlvbiksXG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBkZXNlcmlhbGl6ZSA9ICh1cmlJZGVudGl0eTogSVRlc3RVcmlDYW5vbmljYWxpemVyLCBtZXNzYWdlOiBTZXJpYWxpemVkKTogSVRlc3RPdXRwdXRNZXNzYWdlID0+ICh7XG5cdFx0bWVzc2FnZTogbWVzc2FnZS5tZXNzYWdlLFxuXHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQsXG5cdFx0b2Zmc2V0OiBtZXNzYWdlLm9mZnNldCxcblx0XHRsZW5ndGg6IG1lc3NhZ2UubGVuZ3RoLFxuXHRcdGxvY2F0aW9uOiBtZXNzYWdlLmxvY2F0aW9uICYmIElSaWNoTG9jYXRpb24uZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIG1lc3NhZ2UubG9jYXRpb24pLFxuXHR9KTtcbn1cblxuZXhwb3J0IHR5cGUgSVRlc3RNZXNzYWdlID0gSVRlc3RFcnJvck1lc3NhZ2UgfCBJVGVzdE91dHB1dE1lc3NhZ2U7XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRlc3RNZXNzYWdlIHtcblx0ZXhwb3J0IHR5cGUgU2VyaWFsaXplZCA9IElUZXN0RXJyb3JNZXNzYWdlLlNlcmlhbGl6ZWQgfCBJVGVzdE91dHB1dE1lc3NhZ2UuU2VyaWFsaXplZDtcblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKG1lc3NhZ2U6IFJlYWRvbmx5PElUZXN0TWVzc2FnZT4pOiBTZXJpYWxpemVkID0+XG5cdFx0bWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IgPyBJVGVzdEVycm9yTWVzc2FnZS5zZXJpYWxpemUobWVzc2FnZSkgOiBJVGVzdE91dHB1dE1lc3NhZ2Uuc2VyaWFsaXplKG1lc3NhZ2UpO1xuXG5cdGV4cG9ydCBjb25zdCBkZXNlcmlhbGl6ZSA9ICh1cmlJZGVudGl0eTogSVRlc3RVcmlDYW5vbmljYWxpemVyLCBtZXNzYWdlOiBTZXJpYWxpemVkKTogSVRlc3RNZXNzYWdlID0+XG5cdFx0bWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IgPyBJVGVzdEVycm9yTWVzc2FnZS5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgbWVzc2FnZSkgOiBJVGVzdE91dHB1dE1lc3NhZ2UuZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIG1lc3NhZ2UpO1xuXG5cdGV4cG9ydCBjb25zdCBpc0RpZmZhYmxlID0gKG1lc3NhZ2U6IElUZXN0TWVzc2FnZSk6IG1lc3NhZ2UgaXMgSVRlc3RFcnJvck1lc3NhZ2UgJiB7IGFjdHVhbDogc3RyaW5nOyBleHBlY3RlZDogc3RyaW5nIH0gPT5cblx0XHRtZXNzYWdlLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvciAmJiBtZXNzYWdlLmFjdHVhbCAhPT0gdW5kZWZpbmVkICYmIG1lc3NhZ2UuZXhwZWN0ZWQgIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFRhc2tTdGF0ZSB7XG5cdHN0YXRlOiBUZXN0UmVzdWx0U3RhdGU7XG5cdGR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdG1lc3NhZ2VzOiBJVGVzdE1lc3NhZ2VbXTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJVGVzdFRhc2tTdGF0ZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0c3RhdGU6IFRlc3RSZXN1bHRTdGF0ZTtcblx0XHRkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdG1lc3NhZ2VzOiBJVGVzdE1lc3NhZ2UuU2VyaWFsaXplZFtdO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZVdpdGhvdXRNZXNzYWdlcyA9IChzdGF0ZTogSVRlc3RUYXNrU3RhdGUpOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0c3RhdGU6IHN0YXRlLnN0YXRlLFxuXHRcdGR1cmF0aW9uOiBzdGF0ZS5kdXJhdGlvbixcblx0XHRtZXNzYWdlczogW10sXG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAoc3RhdGU6IFJlYWRvbmx5PElUZXN0VGFza1N0YXRlPik6IFNlcmlhbGl6ZWQgPT4gKHtcblx0XHRzdGF0ZTogc3RhdGUuc3RhdGUsXG5cdFx0ZHVyYXRpb246IHN0YXRlLmR1cmF0aW9uLFxuXHRcdG1lc3NhZ2VzOiBzdGF0ZS5tZXNzYWdlcy5tYXAoSVRlc3RNZXNzYWdlLnNlcmlhbGl6ZSksXG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBkZXNlcmlhbGl6ZSA9ICh1cmlJZGVudGl0eTogSVRlc3RVcmlDYW5vbmljYWxpemVyLCBzdGF0ZTogU2VyaWFsaXplZCk6IElUZXN0VGFza1N0YXRlID0+ICh7XG5cdFx0c3RhdGU6IHN0YXRlLnN0YXRlLFxuXHRcdGR1cmF0aW9uOiBzdGF0ZS5kdXJhdGlvbixcblx0XHRtZXNzYWdlczogc3RhdGUubWVzc2FnZXMubWFwKG0gPT4gSVRlc3RNZXNzYWdlLmRlc2VyaWFsaXplKHVyaUlkZW50aXR5LCBtKSksXG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0UnVuVGFzayB7XG5cdGlkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0cnVubmluZzogYm9vbGVhbjtcblx0Y3RybElkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RUYWcge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5jb25zdCB0ZXN0VGFnRGVsaW1pdGVyID0gJ1xcMCc7XG5cbmV4cG9ydCBjb25zdCBuYW1lc3BhY2VUZXN0VGFnID1cblx0KGN0cmxJZDogc3RyaW5nLCB0YWdJZDogc3RyaW5nKSA9PiBjdHJsSWQgKyB0ZXN0VGFnRGVsaW1pdGVyICsgdGFnSWQ7XG5cbmV4cG9ydCBjb25zdCBkZW5hbWVzcGFjZVRlc3RUYWcgPSAobmFtZXNwYWNlZDogc3RyaW5nKSA9PiB7XG5cdGNvbnN0IGluZGV4ID0gbmFtZXNwYWNlZC5pbmRleE9mKHRlc3RUYWdEZWxpbWl0ZXIpO1xuXHRyZXR1cm4geyBjdHJsSWQ6IG5hbWVzcGFjZWQuc2xpY2UoMCwgaW5kZXgpLCB0YWdJZDogbmFtZXNwYWNlZC5zbGljZShpbmRleCArIDEpIH07XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0VGFnRGlzcGxheUluZm8ge1xuXHRpZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoZSBUZXN0SXRlbSBmcm9tIC5kLnRzLCBhcyBhIHBsYWluIG9iamVjdCB3aXRob3V0IGNoaWxkcmVuLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbSB7XG5cdC8qKiBJRCBvZiB0aGUgdGVzdCBnaXZlbiBieSB0aGUgdGVzdCBjb250cm9sbGVyICovXG5cdGV4dElkOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHRhZ3M6IHN0cmluZ1tdO1xuXHRidXN5OiBib29sZWFuO1xuXHRjaGlsZHJlbj86IG5ldmVyO1xuXHR1cmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cmFuZ2U6IFJhbmdlIHwgbnVsbDtcblx0ZGVzY3JpcHRpb246IHN0cmluZyB8IG51bGw7XG5cdGVycm9yOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBudWxsO1xuXHRzb3J0VGV4dDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJVGVzdEl0ZW0ge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWQge1xuXHRcdGV4dElkOiBzdHJpbmc7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHR0YWdzOiBzdHJpbmdbXTtcblx0XHRidXN5OiBib29sZWFuO1xuXHRcdGNoaWxkcmVuPzogbmV2ZXI7XG5cdFx0dXJpOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkO1xuXHRcdHJhbmdlOiBJUmFuZ2UgfCBudWxsO1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmcgfCBudWxsO1xuXHRcdGVycm9yOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBudWxsO1xuXHRcdHNvcnRUZXh0OiBzdHJpbmcgfCBudWxsO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChpdGVtOiBSZWFkb25seTxJVGVzdEl0ZW0+KTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdGV4dElkOiBpdGVtLmV4dElkLFxuXHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdHRhZ3M6IGl0ZW0udGFncyxcblx0XHRidXN5OiBpdGVtLmJ1c3ksXG5cdFx0Y2hpbGRyZW46IHVuZGVmaW5lZCxcblx0XHR1cmk6IGl0ZW0udXJpPy50b0pTT04oKSxcblx0XHRyYW5nZTogaXRlbS5yYW5nZT8udG9KU09OKCkgfHwgbnVsbCxcblx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRlcnJvcjogaXRlbS5lcnJvcixcblx0XHRzb3J0VGV4dDogaXRlbS5zb3J0VGV4dFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgc2VyaWFsaXplZDogU2VyaWFsaXplZCk6IElUZXN0SXRlbSA9PiAoe1xuXHRcdGV4dElkOiBzZXJpYWxpemVkLmV4dElkLFxuXHRcdGxhYmVsOiBzZXJpYWxpemVkLmxhYmVsLFxuXHRcdHRhZ3M6IHNlcmlhbGl6ZWQudGFncyxcblx0XHRidXN5OiBzZXJpYWxpemVkLmJ1c3ksXG5cdFx0Y2hpbGRyZW46IHVuZGVmaW5lZCxcblx0XHR1cmk6IHNlcmlhbGl6ZWQudXJpID8gdXJpSWRlbnRpdHkuYXNDYW5vbmljYWxVcmkoVVJJLnJldml2ZShzZXJpYWxpemVkLnVyaSkpIDogdW5kZWZpbmVkLFxuXHRcdHJhbmdlOiBzZXJpYWxpemVkLnJhbmdlID8gUmFuZ2UubGlmdChzZXJpYWxpemVkLnJhbmdlKSA6IG51bGwsXG5cdFx0ZGVzY3JpcHRpb246IHNlcmlhbGl6ZWQuZGVzY3JpcHRpb24sXG5cdFx0ZXJyb3I6IHNlcmlhbGl6ZWQuZXJyb3IsXG5cdFx0c29ydFRleHQ6IHNlcmlhbGl6ZWQuc29ydFRleHRcblx0fSk7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RJdGVtRXhwYW5kU3RhdGUge1xuXHROb3RFeHBhbmRhYmxlLFxuXHRFeHBhbmRhYmxlLFxuXHRCdXN5RXhwYW5kaW5nLFxuXHRFeHBhbmRlZCxcbn1cblxuLyoqXG4gKiBUZXN0SXRlbS1saWtlIHNoYXBlLCBidXQgd2l0aCBhbiBJRCBhbmQgY2hpbGRyZW4gYXMgc3RyaW5ncy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJbnRlcm5hbFRlc3RJdGVtIHtcblx0LyoqIENvbnRyb2xsZXIgSUQgZnJvbSB3aGVuY2UgdGhpcyB0ZXN0IGNhbWUgKi9cblx0Y29udHJvbGxlcklkOiBzdHJpbmc7XG5cdC8qKiBFeHBhbmRhYmlsaXR5IHN0YXRlICovXG5cdGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZTtcblx0LyoqIFJhdyB0ZXN0IGl0ZW0gcHJvcGVydGllcyAqL1xuXHRpdGVtOiBJVGVzdEl0ZW07XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW50ZXJuYWxUZXN0SXRlbSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0ZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlO1xuXHRcdGl0ZW06IElUZXN0SXRlbS5TZXJpYWxpemVkO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChpdGVtOiBSZWFkb25seTxJbnRlcm5hbFRlc3RJdGVtPik6IFNlcmlhbGl6ZWQgPT4gKHtcblx0XHRleHBhbmQ6IGl0ZW0uZXhwYW5kLFxuXHRcdGl0ZW06IElUZXN0SXRlbS5zZXJpYWxpemUoaXRlbS5pdGVtKVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgc2VyaWFsaXplZDogU2VyaWFsaXplZCk6IEludGVybmFsVGVzdEl0ZW0gPT4gKHtcblx0XHQvLyB0aGUgYGNvbnRyb2xsZXJJZGAgaXMgZGVyaXZlZCBmcm9tIHRoZSB0ZXN0Lml0ZW0uZXh0SWQuIEl0J3MgcmVkdW5kYW50XG5cdFx0Ly8gaW4gdGhlIG5vbi1zZXJpYWxpemVkIEludGVybmFsVGVzdEl0ZW0gdG9vLCBidXQgdGhlcmUganVzdCBiZWNhdXNlIGl0J3Ncblx0XHQvLyBjaGVja2VkIGFnYWluc3QgaW4gbWFueSBob3QgcGF0aHMuXG5cdFx0Y29udHJvbGxlcklkOiBUZXN0SWQucm9vdChzZXJpYWxpemVkLml0ZW0uZXh0SWQpLFxuXHRcdGV4cGFuZDogc2VyaWFsaXplZC5leHBhbmQsXG5cdFx0aXRlbTogSVRlc3RJdGVtLmRlc2VyaWFsaXplKHVyaUlkZW50aXR5LCBzZXJpYWxpemVkLml0ZW0pXG5cdH0pO1xufVxuXG4vKipcbiAqIEEgcGFydGlhbCB1cGRhdGUgbWFkZSB0byBhbiBleGlzdGluZyBJbnRlcm5hbFRlc3RJdGVtLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbVVwZGF0ZSB7XG5cdGV4dElkOiBzdHJpbmc7XG5cdGV4cGFuZD86IFRlc3RJdGVtRXhwYW5kU3RhdGU7XG5cdGl0ZW0/OiBQYXJ0aWFsPElUZXN0SXRlbT47XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRlc3RJdGVtVXBkYXRlIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHRleHRJZDogc3RyaW5nO1xuXHRcdGV4cGFuZD86IFRlc3RJdGVtRXhwYW5kU3RhdGU7XG5cdFx0aXRlbT86IFBhcnRpYWw8SVRlc3RJdGVtLlNlcmlhbGl6ZWQ+O1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9ICh1OiBSZWFkb25seTxJVGVzdEl0ZW1VcGRhdGU+KTogU2VyaWFsaXplZCA9PiB7XG5cdFx0bGV0IGl0ZW06IFBhcnRpYWw8SVRlc3RJdGVtLlNlcmlhbGl6ZWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGlmICh1Lml0ZW0pIHtcblx0XHRcdGl0ZW0gPSB7fTtcblx0XHRcdGlmICh1Lml0ZW0ubGFiZWwgIT09IHVuZGVmaW5lZCkgeyBpdGVtLmxhYmVsID0gdS5pdGVtLmxhYmVsOyB9XG5cdFx0XHRpZiAodS5pdGVtLnRhZ3MgIT09IHVuZGVmaW5lZCkgeyBpdGVtLnRhZ3MgPSB1Lml0ZW0udGFnczsgfVxuXHRcdFx0aWYgKHUuaXRlbS5idXN5ICE9PSB1bmRlZmluZWQpIHsgaXRlbS5idXN5ID0gdS5pdGVtLmJ1c3k7IH1cblx0XHRcdGlmICh1Lml0ZW0udXJpICE9PSB1bmRlZmluZWQpIHsgaXRlbS51cmkgPSB1Lml0ZW0udXJpPy50b0pTT04oKTsgfVxuXHRcdFx0aWYgKHUuaXRlbS5yYW5nZSAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0ucmFuZ2UgPSB1Lml0ZW0ucmFuZ2U/LnRvSlNPTigpOyB9XG5cdFx0XHRpZiAodS5pdGVtLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQpIHsgaXRlbS5kZXNjcmlwdGlvbiA9IHUuaXRlbS5kZXNjcmlwdGlvbjsgfVxuXHRcdFx0aWYgKHUuaXRlbS5lcnJvciAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0uZXJyb3IgPSB1Lml0ZW0uZXJyb3I7IH1cblx0XHRcdGlmICh1Lml0ZW0uc29ydFRleHQgIT09IHVuZGVmaW5lZCkgeyBpdGVtLnNvcnRUZXh0ID0gdS5pdGVtLnNvcnRUZXh0OyB9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZXh0SWQ6IHUuZXh0SWQsIGV4cGFuZDogdS5leHBhbmQsIGl0ZW0gfTtcblx0fTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodTogU2VyaWFsaXplZCk6IElUZXN0SXRlbVVwZGF0ZSA9PiB7XG5cdFx0bGV0IGl0ZW06IFBhcnRpYWw8SVRlc3RJdGVtPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodS5pdGVtKSB7XG5cdFx0XHRpdGVtID0ge307XG5cdFx0XHRpZiAodS5pdGVtLmxhYmVsICE9PSB1bmRlZmluZWQpIHsgaXRlbS5sYWJlbCA9IHUuaXRlbS5sYWJlbDsgfVxuXHRcdFx0aWYgKHUuaXRlbS50YWdzICE9PSB1bmRlZmluZWQpIHsgaXRlbS50YWdzID0gdS5pdGVtLnRhZ3M7IH1cblx0XHRcdGlmICh1Lml0ZW0uYnVzeSAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0uYnVzeSA9IHUuaXRlbS5idXN5OyB9XG5cdFx0XHRpZiAodS5pdGVtLnJhbmdlICE9PSB1bmRlZmluZWQpIHsgaXRlbS5yYW5nZSA9IHUuaXRlbS5yYW5nZSA/IFJhbmdlLmxpZnQodS5pdGVtLnJhbmdlKSA6IG51bGw7IH1cblx0XHRcdGlmICh1Lml0ZW0uZGVzY3JpcHRpb24gIT09IHVuZGVmaW5lZCkgeyBpdGVtLmRlc2NyaXB0aW9uID0gdS5pdGVtLmRlc2NyaXB0aW9uOyB9XG5cdFx0XHRpZiAodS5pdGVtLmVycm9yICE9PSB1bmRlZmluZWQpIHsgaXRlbS5lcnJvciA9IHUuaXRlbS5lcnJvcjsgfVxuXHRcdFx0aWYgKHUuaXRlbS5zb3J0VGV4dCAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0uc29ydFRleHQgPSB1Lml0ZW0uc29ydFRleHQ7IH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBleHRJZDogdS5leHRJZCwgZXhwYW5kOiB1LmV4cGFuZCwgaXRlbSB9O1xuXHR9O1xuXG59XG5cbmV4cG9ydCBjb25zdCBhcHBseVRlc3RJdGVtVXBkYXRlID0gKGludGVybmFsOiBJbnRlcm5hbFRlc3RJdGVtIHwgSVRlc3RJdGVtVXBkYXRlLCBwYXRjaDogSVRlc3RJdGVtVXBkYXRlKSA9PiB7XG5cdGlmIChwYXRjaC5leHBhbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGludGVybmFsLmV4cGFuZCA9IHBhdGNoLmV4cGFuZDtcblx0fVxuXHRpZiAocGF0Y2guaXRlbSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0aW50ZXJuYWwuaXRlbSA9IGludGVybmFsLml0ZW0gPyBPYmplY3QuYXNzaWduKGludGVybmFsLml0ZW0sIHBhdGNoLml0ZW0pIDogcGF0Y2guaXRlbTtcblx0fVxufTtcblxuLyoqIFJlcXVlc3QgdG8gYW4gZXh0IGhvc3QgdG8gZ2V0IGZvbGxvd3VwIG1lc3NhZ2VzIGZvciBhIHRlc3QgZmFpbHVyZS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVGVzdE1lc3NhZ2VGb2xsb3d1cFJlcXVlc3Qge1xuXHRyZXN1bHRJZDogc3RyaW5nO1xuXHRleHRJZDogc3RyaW5nO1xuXHR0YXNrSW5kZXg6IG51bWJlcjtcblx0bWVzc2FnZUluZGV4OiBudW1iZXI7XG59XG5cbi8qKiBSZXF1ZXN0IHRvIGFuIGV4dCBob3N0IHRvIGdldCBmb2xsb3d1cCBtZXNzYWdlcyBmb3IgYSB0ZXN0IGZhaWx1cmUuICovXG5leHBvcnQgaW50ZXJmYWNlIFRlc3RNZXNzYWdlRm9sbG93dXBSZXNwb25zZSB7XG5cdGlkOiBudW1iZXI7XG5cdHRpdGxlOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVGVzdCByZXN1bHQgaXRlbSB1c2VkIGluIHRoZSBtYWluIHRocmVhZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUZXN0UmVzdWx0SXRlbSBleHRlbmRzIEludGVybmFsVGVzdEl0ZW0ge1xuXHQvKiogU3RhdGUgb2YgdGhpcyB0ZXN0IGluIHZhcmlvdXMgdGFza3MgKi9cblx0dGFza3M6IElUZXN0VGFza1N0YXRlW107XG5cdC8qKiBTdGF0ZSBvZiB0aGlzIHRlc3QgYXMgYSBjb21wdXRhdGlvbiBvZiBpdHMgdGFza3MgKi9cblx0b3duQ29tcHV0ZWRTdGF0ZTogVGVzdFJlc3VsdFN0YXRlO1xuXHQvKiogQ29tcHV0ZWQgc3RhdGUgYmFzZWQgb24gY2hpbGRyZW4gKi9cblx0Y29tcHV0ZWRTdGF0ZTogVGVzdFJlc3VsdFN0YXRlO1xuXHQvKiogTWF4IGR1cmF0aW9uIG9mIHRoZSBpdGVtJ3MgdGFza3MgKGlmIHJ1biBkaXJlY3RseSkgKi9cblx0b3duRHVyYXRpb24/OiBudW1iZXI7XG5cdC8qKiBXaGV0aGVyIHRoaXMgdGVzdCBpdGVtIGlzIG91dGRhdGVkICovXG5cdHJldGlyZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlc3RSZXN1bHRJdGVtIHtcblx0LyoqXG5cdCAqIFNlcmlhbGl6ZWQgdmVyc2lvbiBvZiB0aGUgVGVzdFJlc3VsdEl0ZW0uIE5vdGUgdGhhdCAncmV0aXJlZCcgaXMgbm90XG5cdCAqIGluY2x1ZGVkIHNpbmNlIGFsbCBoeWRyYXRlZCBpdGVtcyBhcmUgYXV0b21hdGljYWxseSByZXRpcmVkLlxuXHQgKi9cblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIGV4dGVuZHMgSW50ZXJuYWxUZXN0SXRlbS5TZXJpYWxpemVkIHtcblx0XHR0YXNrczogSVRlc3RUYXNrU3RhdGUuU2VyaWFsaXplZFtdO1xuXHRcdG93bkNvbXB1dGVkU3RhdGU6IFRlc3RSZXN1bHRTdGF0ZTtcblx0XHRjb21wdXRlZFN0YXRlOiBUZXN0UmVzdWx0U3RhdGU7XG5cdH1cblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplV2l0aG91dE1lc3NhZ2VzID0gKG9yaWdpbmFsOiBUZXN0UmVzdWx0SXRlbSk6IFNlcmlhbGl6ZWQgPT4gKHtcblx0XHQuLi5JbnRlcm5hbFRlc3RJdGVtLnNlcmlhbGl6ZShvcmlnaW5hbCksXG5cdFx0b3duQ29tcHV0ZWRTdGF0ZTogb3JpZ2luYWwub3duQ29tcHV0ZWRTdGF0ZSxcblx0XHRjb21wdXRlZFN0YXRlOiBvcmlnaW5hbC5jb21wdXRlZFN0YXRlLFxuXHRcdHRhc2tzOiBvcmlnaW5hbC50YXNrcy5tYXAoSVRlc3RUYXNrU3RhdGUuc2VyaWFsaXplV2l0aG91dE1lc3NhZ2VzKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChvcmlnaW5hbDogUmVhZG9ubHk8VGVzdFJlc3VsdEl0ZW0+KTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdC4uLkludGVybmFsVGVzdEl0ZW0uc2VyaWFsaXplKG9yaWdpbmFsKSxcblx0XHRvd25Db21wdXRlZFN0YXRlOiBvcmlnaW5hbC5vd25Db21wdXRlZFN0YXRlLFxuXHRcdGNvbXB1dGVkU3RhdGU6IG9yaWdpbmFsLmNvbXB1dGVkU3RhdGUsXG5cdFx0dGFza3M6IG9yaWdpbmFsLnRhc2tzLm1hcChJVGVzdFRhc2tTdGF0ZS5zZXJpYWxpemUpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgc2VyaWFsaXplZDogU2VyaWFsaXplZCk6IFRlc3RSZXN1bHRJdGVtID0+ICh7XG5cdFx0Li4uSW50ZXJuYWxUZXN0SXRlbS5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgc2VyaWFsaXplZCksXG5cdFx0b3duQ29tcHV0ZWRTdGF0ZTogc2VyaWFsaXplZC5vd25Db21wdXRlZFN0YXRlLFxuXHRcdGNvbXB1dGVkU3RhdGU6IHNlcmlhbGl6ZWQuY29tcHV0ZWRTdGF0ZSxcblx0XHR0YXNrczogc2VyaWFsaXplZC50YXNrcy5tYXAobSA9PiBJVGVzdFRhc2tTdGF0ZS5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgbSkpLFxuXHRcdHJldGlyZWQ6IHRydWUsXG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkVGVzdFJlc3VsdHMge1xuXHQvKiogSUQgb2YgdGhlc2UgdGVzdCByZXN1bHRzICovXG5cdGlkOiBzdHJpbmc7XG5cdC8qKiBUaW1lIHRoZSByZXN1bHRzIHdlcmUgY29tcGVsdGVkICovXG5cdGNvbXBsZXRlZEF0OiBudW1iZXI7XG5cdC8qKiBTdWJzZXQgb2YgdGVzdCByZXN1bHQgaXRlbXMgKi9cblx0aXRlbXM6IFRlc3RSZXN1bHRJdGVtLlNlcmlhbGl6ZWRbXTtcblx0LyoqIFRhc2tzIGludm9sdmVkIGluIHRoZSBydW4uICovXG5cdHRhc2tzOiB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDsgY3RybElkOiBzdHJpbmc7IGhhc0NvdmVyYWdlOiBib29sZWFuIH1bXTtcblx0LyoqIEh1bWFuLXJlYWRhYmxlIG5hbWUgb2YgdGhlIHRlc3QgcnVuLiAqL1xuXHRuYW1lOiBzdHJpbmc7XG5cdC8qKiBUZXN0IHRyaWdnZXIgaW5mb3JtYXRvbiAqL1xuXHRyZXF1ZXN0OiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0Q292ZXJhZ2Uge1xuXHRmaWxlczogSUZpbGVDb3ZlcmFnZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb3ZlcmFnZUNvdW50IHtcblx0Y292ZXJlZDogbnVtYmVyO1xuXHR0b3RhbDogbnVtYmVyO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElDb3ZlcmFnZUNvdW50IHtcblx0ZXhwb3J0IGNvbnN0IGVtcHR5ID0gKCk6IElDb3ZlcmFnZUNvdW50ID0+ICh7IGNvdmVyZWQ6IDAsIHRvdGFsOiAwIH0pO1xuXHRleHBvcnQgY29uc3Qgc3VtID0gKHRhcmdldDogSUNvdmVyYWdlQ291bnQsIHNyYzogUmVhZG9ubHk8SUNvdmVyYWdlQ291bnQ+KSA9PiB7XG5cdFx0dGFyZ2V0LmNvdmVyZWQgKz0gc3JjLmNvdmVyZWQ7XG5cdFx0dGFyZ2V0LnRvdGFsICs9IHNyYy50b3RhbDtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZUNvdmVyYWdlIHtcblx0aWQ6IHN0cmluZztcblx0dXJpOiBVUkk7XG5cdHRlc3RJZHM/OiBzdHJpbmdbXTtcblx0c3RhdGVtZW50OiBJQ292ZXJhZ2VDb3VudDtcblx0YnJhbmNoPzogSUNvdmVyYWdlQ291bnQ7XG5cdGRlY2xhcmF0aW9uPzogSUNvdmVyYWdlQ291bnQ7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSUZpbGVDb3ZlcmFnZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0aWQ6IHN0cmluZztcblx0XHR1cmk6IFVyaUNvbXBvbmVudHM7XG5cdFx0dGVzdElkczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0c3RhdGVtZW50OiBJQ292ZXJhZ2VDb3VudDtcblx0XHRicmFuY2g/OiBJQ292ZXJhZ2VDb3VudDtcblx0XHRkZWNsYXJhdGlvbj86IElDb3ZlcmFnZUNvdW50O1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChvcmlnaW5hbDogUmVhZG9ubHk8SUZpbGVDb3ZlcmFnZT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0aWQ6IG9yaWdpbmFsLmlkLFxuXHRcdHN0YXRlbWVudDogb3JpZ2luYWwuc3RhdGVtZW50LFxuXHRcdGJyYW5jaDogb3JpZ2luYWwuYnJhbmNoLFxuXHRcdGRlY2xhcmF0aW9uOiBvcmlnaW5hbC5kZWNsYXJhdGlvbixcblx0XHR0ZXN0SWRzOiBvcmlnaW5hbC50ZXN0SWRzLFxuXHRcdHVyaTogb3JpZ2luYWwudXJpLnRvSlNPTigpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgc2VyaWFsaXplZDogU2VyaWFsaXplZCk6IElGaWxlQ292ZXJhZ2UgPT4gKHtcblx0XHRpZDogc2VyaWFsaXplZC5pZCxcblx0XHRzdGF0ZW1lbnQ6IHNlcmlhbGl6ZWQuc3RhdGVtZW50LFxuXHRcdGJyYW5jaDogc2VyaWFsaXplZC5icmFuY2gsXG5cdFx0ZGVjbGFyYXRpb246IHNlcmlhbGl6ZWQuZGVjbGFyYXRpb24sXG5cdFx0dGVzdElkczogc2VyaWFsaXplZC50ZXN0SWRzLFxuXHRcdHVyaTogdXJpSWRlbnRpdHkuYXNDYW5vbmljYWxVcmkoVVJJLnJldml2ZShzZXJpYWxpemVkLnVyaSkpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZW1wdHkgPSAoaWQ6IHN0cmluZywgdXJpOiBVUkkpOiBJRmlsZUNvdmVyYWdlID0+ICh7XG5cdFx0aWQsXG5cdFx0dXJpLFxuXHRcdHN0YXRlbWVudDogSUNvdmVyYWdlQ291bnQuZW1wdHkoKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uPFQgZXh0ZW5kcyB7IGxvY2F0aW9uPzogUmFuZ2UgfCBQb3NpdGlvbiB9PihzZXJpYWxpemVkOiBUKTogVCAmIHsgbG9jYXRpb24/OiBJUmFuZ2UgfCBJUG9zaXRpb24gfSB7XG5cdHJldHVybiB7XG5cdFx0Li4uc2VyaWFsaXplZCxcblx0XHRsb2NhdGlvbjogc2VyaWFsaXplZC5sb2NhdGlvbj8udG9KU09OKCksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplVGhpbmdXaXRoTG9jYXRpb248VCBleHRlbmRzIHsgbG9jYXRpb24/OiBJUmFuZ2UgfCBJUG9zaXRpb24gfT4oc2VyaWFsaXplZDogVCk6IFQgJiB7IGxvY2F0aW9uPzogUmFuZ2UgfCBQb3NpdGlvbiB9IHtcblx0c2VyaWFsaXplZC5sb2NhdGlvbiA9IHNlcmlhbGl6ZWQubG9jYXRpb24gPyAoUG9zaXRpb24uaXNJUG9zaXRpb24oc2VyaWFsaXplZC5sb2NhdGlvbikgPyBQb3NpdGlvbi5saWZ0KHNlcmlhbGl6ZWQubG9jYXRpb24pIDogUmFuZ2UubGlmdChzZXJpYWxpemVkLmxvY2F0aW9uKSkgOiB1bmRlZmluZWQ7XG5cdHJldHVybiBzZXJpYWxpemVkIGFzIFQgJiB7IGxvY2F0aW9uPzogUmFuZ2UgfCBQb3NpdGlvbiB9O1xufVxuXG4vKiogTnVtYmVyIG9mIHJlY2VudCBydW5zIGluIHdoaWNoIGNvdmVyYWdlIHJlcG9ydHMgc2hvdWxkIGJlIHJldGFpbmVkLiAqL1xuZXhwb3J0IGNvbnN0IEtFRVBfTl9MQVNUX0NPVkVSQUdFX1JFUE9SVFMgPSAzO1xuXG5leHBvcnQgY29uc3QgZW51bSBEZXRhaWxUeXBlIHtcblx0RGVjbGFyYXRpb24sXG5cdFN0YXRlbWVudCxcblx0QnJhbmNoLFxufVxuXG5leHBvcnQgdHlwZSBDb3ZlcmFnZURldGFpbHMgPSBJRGVjbGFyYXRpb25Db3ZlcmFnZSB8IElTdGF0ZW1lbnRDb3ZlcmFnZTtcblxuZXhwb3J0IG5hbWVzcGFjZSBDb3ZlcmFnZURldGFpbHMge1xuXHRleHBvcnQgdHlwZSBTZXJpYWxpemVkID0gSURlY2xhcmF0aW9uQ292ZXJhZ2UuU2VyaWFsaXplZCB8IElTdGF0ZW1lbnRDb3ZlcmFnZS5TZXJpYWxpemVkO1xuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAob3JpZ2luYWw6IFJlYWRvbmx5PENvdmVyYWdlRGV0YWlscz4pOiBTZXJpYWxpemVkID0+XG5cdFx0b3JpZ2luYWwudHlwZSA9PT0gRGV0YWlsVHlwZS5EZWNsYXJhdGlvbiA/IElEZWNsYXJhdGlvbkNvdmVyYWdlLnNlcmlhbGl6ZShvcmlnaW5hbCkgOiBJU3RhdGVtZW50Q292ZXJhZ2Uuc2VyaWFsaXplKG9yaWdpbmFsKTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAoc2VyaWFsaXplZDogU2VyaWFsaXplZCk6IENvdmVyYWdlRGV0YWlscyA9PlxuXHRcdHNlcmlhbGl6ZWQudHlwZSA9PT0gRGV0YWlsVHlwZS5EZWNsYXJhdGlvbiA/IElEZWNsYXJhdGlvbkNvdmVyYWdlLmRlc2VyaWFsaXplKHNlcmlhbGl6ZWQpIDogSVN0YXRlbWVudENvdmVyYWdlLmRlc2VyaWFsaXplKHNlcmlhbGl6ZWQpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCcmFuY2hDb3ZlcmFnZSB7XG5cdGNvdW50OiBudW1iZXIgfCBib29sZWFuO1xuXHRsYWJlbD86IHN0cmluZztcblx0bG9jYXRpb24/OiBSYW5nZSB8IFBvc2l0aW9uO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElCcmFuY2hDb3ZlcmFnZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0Y291bnQ6IG51bWJlciB8IGJvb2xlYW47XG5cdFx0bGFiZWw/OiBzdHJpbmc7XG5cdFx0bG9jYXRpb24/OiBJUmFuZ2UgfCBJUG9zaXRpb247XG5cdH1cblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplOiAob3JpZ2luYWw6IElCcmFuY2hDb3ZlcmFnZSkgPT4gU2VyaWFsaXplZCA9IHNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uO1xuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemU6IChvcmlnaW5hbDogU2VyaWFsaXplZCkgPT4gSUJyYW5jaENvdmVyYWdlID0gZGVzZXJpYWxpemVUaGluZ1dpdGhMb2NhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGVjbGFyYXRpb25Db3ZlcmFnZSB7XG5cdHR5cGU6IERldGFpbFR5cGUuRGVjbGFyYXRpb247XG5cdG5hbWU6IHN0cmluZztcblx0Y291bnQ6IG51bWJlciB8IGJvb2xlYW47XG5cdGxvY2F0aW9uOiBSYW5nZSB8IFBvc2l0aW9uO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElEZWNsYXJhdGlvbkNvdmVyYWdlIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHR0eXBlOiBEZXRhaWxUeXBlLkRlY2xhcmF0aW9uO1xuXHRcdG5hbWU6IHN0cmluZztcblx0XHRjb3VudDogbnVtYmVyIHwgYm9vbGVhbjtcblx0XHRsb2NhdGlvbjogSVJhbmdlIHwgSVBvc2l0aW9uO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZTogKG9yaWdpbmFsOiBJRGVjbGFyYXRpb25Db3ZlcmFnZSkgPT4gU2VyaWFsaXplZCA9IHNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uO1xuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemU6IChvcmlnaW5hbDogU2VyaWFsaXplZCkgPT4gSURlY2xhcmF0aW9uQ292ZXJhZ2UgPSBkZXNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGF0ZW1lbnRDb3ZlcmFnZSB7XG5cdHR5cGU6IERldGFpbFR5cGUuU3RhdGVtZW50O1xuXHRjb3VudDogbnVtYmVyIHwgYm9vbGVhbjtcblx0bG9jYXRpb246IFJhbmdlIHwgUG9zaXRpb247XG5cdGJyYW5jaGVzPzogSUJyYW5jaENvdmVyYWdlW107XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVN0YXRlbWVudENvdmVyYWdlIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHR0eXBlOiBEZXRhaWxUeXBlLlN0YXRlbWVudDtcblx0XHRjb3VudDogbnVtYmVyIHwgYm9vbGVhbjtcblx0XHRsb2NhdGlvbjogSVJhbmdlIHwgSVBvc2l0aW9uO1xuXHRcdGJyYW5jaGVzPzogSUJyYW5jaENvdmVyYWdlLlNlcmlhbGl6ZWRbXTtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAob3JpZ2luYWw6IFJlYWRvbmx5PElTdGF0ZW1lbnRDb3ZlcmFnZT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0Li4uc2VyaWFsaXplVGhpbmdXaXRoTG9jYXRpb24ob3JpZ2luYWwpLFxuXHRcdGJyYW5jaGVzOiBvcmlnaW5hbC5icmFuY2hlcz8ubWFwKElCcmFuY2hDb3ZlcmFnZS5zZXJpYWxpemUpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAoc2VyaWFsaXplZDogU2VyaWFsaXplZCk6IElTdGF0ZW1lbnRDb3ZlcmFnZSA9PiAoe1xuXHRcdC4uLmRlc2VyaWFsaXplVGhpbmdXaXRoTG9jYXRpb24oc2VyaWFsaXplZCksXG5cdFx0YnJhbmNoZXM6IHNlcmlhbGl6ZWQuYnJhbmNoZXM/Lm1hcChJQnJhbmNoQ292ZXJhZ2UuZGVzZXJpYWxpemUpLFxuXHR9KTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdERpZmZPcFR5cGUge1xuXHQvKiogQWRkcyBhIG5ldyB0ZXN0ICh3aXRoIGNoaWxkcmVuKSAqL1xuXHRBZGQsXG5cdC8qKiBTaGFsbG93LXVwZGF0ZXMgYW4gZXhpc3RpbmcgdGVzdCAqL1xuXHRVcGRhdGUsXG5cdC8qKiBSYW5nZXMgb2Ygc29tZSB0ZXN0cyBpbiBhIGRvY3VtZW50IHdlcmUgc3luY2VkLCBzbyBpdCBzaG91bGQgYmUgY29uc2lkZXJlZCB1cC10by1kYXRlICovXG5cdERvY3VtZW50U3luY2VkLFxuXHQvKiogUmVtb3ZlcyBhIHRlc3QgKGFuZCBhbGwgaXRzIGNoaWxkcmVuKSAqL1xuXHRSZW1vdmUsXG5cdC8qKiBDaGFuZ2VzIHRoZSBudW1iZXIgb2YgY29udHJvbGxlcnMgd2hvIGFyZSB5ZXQgdG8gcHVibGlzaCB0aGVpciBjb2xsZWN0aW9uIHJvb3RzLiAqL1xuXHRJbmNyZW1lbnRQZW5kaW5nRXh0SG9zdHMsXG5cdC8qKiBSZXRpcmVzIGEgdGVzdC9yZXN1bHQgKi9cblx0UmV0aXJlLFxuXHQvKiogQWRkIGEgbmV3IHRlc3QgdGFnICovXG5cdEFkZFRhZyxcblx0LyoqIFJlbW92ZSBhIHRlc3QgdGFnICovXG5cdFJlbW92ZVRhZyxcbn1cblxuZXhwb3J0IHR5cGUgVGVzdHNEaWZmT3AgPVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLkFkZDsgaXRlbTogSW50ZXJuYWxUZXN0SXRlbSB9XG5cdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlOyBpdGVtOiBJVGVzdEl0ZW1VcGRhdGUgfVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZTsgaXRlbUlkOiBzdHJpbmcgfVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLlJldGlyZTsgaXRlbUlkOiBzdHJpbmcgfVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLkluY3JlbWVudFBlbmRpbmdFeHRIb3N0czsgYW1vdW50OiBudW1iZXIgfVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLkFkZFRhZzsgdGFnOiBJVGVzdFRhZ0Rpc3BsYXlJbmZvIH1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmVUYWc7IGlkOiBzdHJpbmcgfVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLkRvY3VtZW50U3luY2VkOyB1cmk6IFVSSTsgZG9jdj86IG51bWJlciB9O1xuXG5leHBvcnQgbmFtZXNwYWNlIFRlc3RzRGlmZk9wIHtcblx0ZXhwb3J0IHR5cGUgU2VyaWFsaXplZCA9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQ7IGl0ZW06IEludGVybmFsVGVzdEl0ZW0uU2VyaWFsaXplZCB9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGU7IGl0ZW06IElUZXN0SXRlbVVwZGF0ZS5TZXJpYWxpemVkIH1cblx0XHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZTsgaXRlbUlkOiBzdHJpbmcgfVxuXHRcdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuUmV0aXJlOyBpdGVtSWQ6IHN0cmluZyB9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5JbmNyZW1lbnRQZW5kaW5nRXh0SG9zdHM7IGFtb3VudDogbnVtYmVyIH1cblx0XHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLkFkZFRhZzsgdGFnOiBJVGVzdFRhZ0Rpc3BsYXlJbmZvIH1cblx0XHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZVRhZzsgaWQ6IHN0cmluZyB9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZDsgdXJpOiBVcmlDb21wb25lbnRzOyBkb2N2PzogbnVtYmVyIH07XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIHU6IFNlcmlhbGl6ZWQpOiBUZXN0c0RpZmZPcCA9PiB7XG5cdFx0aWYgKHUub3AgPT09IFRlc3REaWZmT3BUeXBlLkFkZCkge1xuXHRcdFx0cmV0dXJuIHsgb3A6IHUub3AsIGl0ZW06IEludGVybmFsVGVzdEl0ZW0uZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIHUuaXRlbSkgfTtcblx0XHR9IGVsc2UgaWYgKHUub3AgPT09IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIHsgb3A6IHUub3AsIGl0ZW06IElUZXN0SXRlbVVwZGF0ZS5kZXNlcmlhbGl6ZSh1Lml0ZW0pIH07XG5cdFx0fSBlbHNlIGlmICh1Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCkge1xuXHRcdFx0cmV0dXJuIHsgb3A6IHUub3AsIHVyaTogdXJpSWRlbnRpdHkuYXNDYW5vbmljYWxVcmkoVVJJLnJldml2ZSh1LnVyaSkpLCBkb2N2OiB1LmRvY3YgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHU7XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAodTogUmVhZG9ubHk8VGVzdHNEaWZmT3A+KTogU2VyaWFsaXplZCA9PiB7XG5cdFx0aWYgKHUub3AgPT09IFRlc3REaWZmT3BUeXBlLkFkZCkge1xuXHRcdFx0cmV0dXJuIHsgb3A6IHUub3AsIGl0ZW06IEludGVybmFsVGVzdEl0ZW0uc2VyaWFsaXplKHUuaXRlbSkgfTtcblx0XHR9IGVsc2UgaWYgKHUub3AgPT09IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIHsgb3A6IHUub3AsIGl0ZW06IElUZXN0SXRlbVVwZGF0ZS5zZXJpYWxpemUodS5pdGVtKSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdTtcblx0XHR9XG5cdH07XG59XG5cbi8qKlxuICogQ29udGV4dCBmb3IgYWN0aW9ucyB0YWtlbiBpbiB0aGUgdGVzdCBleHBsb3JlciB2aWV3LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbUNvbnRleHQge1xuXHQvKiogTWFyc2hhbGxpbmcgbWFya2VyICovXG5cdCRtaWQ6IE1hcnNoYWxsZWRJZC5UZXN0SXRlbUNvbnRleHQ7XG5cdC8qKiBUZXN0cyBhbmQgcGFyZW50cyBmcm9tIHRoZSByb290IHRvIHRoZSBjdXJyZW50IGl0ZW1zICovXG5cdHRlc3RzOiBJbnRlcm5hbFRlc3RJdGVtLlNlcmlhbGl6ZWRbXTtcbn1cblxuLyoqXG4gKiBDb250ZXh0IGZvciBhY3Rpb25zIHRha2VuIGluIHRoZSB0ZXN0IGV4cGxvcmVyIHZpZXcuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RNZXNzYWdlTWVudUFyZ3Mge1xuXHQvKiogTWFyc2hhbGxpbmcgbWFya2VyICovXG5cdCRtaWQ6IE1hcnNoYWxsZWRJZC5UZXN0TWVzc2FnZU1lbnVBcmdzO1xuXHQvKiogVGVzdHMgZXh0IElEICovXG5cdHRlc3Q6IEludGVybmFsVGVzdEl0ZW0uU2VyaWFsaXplZDtcblx0LyoqIFNlcmlhbGl6ZWQgdGVzdCBtZXNzYWdlICovXG5cdG1lc3NhZ2U6IElUZXN0TWVzc2FnZS5TZXJpYWxpemVkO1xufVxuXG4vKipcbiAqIFJlcXVlc3QgZnJvbSB0aGUgZXh0IGhvc3Qgb3IgbWFpbiB0aHJlYWQgdG8gaW5kaWNhdGUgdGhhdCB0ZXN0cyBoYXZlXG4gKiBjaGFuZ2VkLiBJdCdzIGFzc3VtZWQgdGhhdCBhbnkgaXRlbSB1cHNlcnRlZCAqbXVzdCogaGF2ZSBpdHMgY2hpbGRyZW5cbiAqIHByZXZpb3VzbHkgYWxzbyB1cHNlcnRlZCwgb3IgdXBzZXJ0ZWQgYXMgcGFydCBvZiB0aGUgc2FtZSBvcGVyYXRpb24uXG4gKiBDaGlsZHJlbiB0aGF0IG5vIGxvbmdlciBleGlzdCBpbiBhbiB1cHNlcnRlZCBpdGVtIHdpbGwgYmUgcmVtb3ZlZC5cbiAqL1xuZXhwb3J0IHR5cGUgVGVzdHNEaWZmID0gVGVzdHNEaWZmT3BbXTtcblxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgaW50ZXJmYWNlIEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtIGV4dGVuZHMgSW50ZXJuYWxUZXN0SXRlbSB7XG5cdGNoaWxkcmVuOiBTZXQ8c3RyaW5nPjtcbn1cblxuLyoqXG4gKiBUaGUgSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3IgaXMgdXNlZCBpbiB0aGUgSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvblxuICogYW5kIGNhbGxlZCB3aXRoIGRpZmYgY2hhbmdlcyBhcyB0aGV5J3JlIGFwcGxpZWQuIFRoaXMgaXMgdXNlZCBpbiB0aGVcbiAqIGV4dCBob3N0IHRvIGNyZWF0ZSBhIGNvaGVzaXZlIGNoYW5nZSBldmVudCBmcm9tIGEgZGlmZi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxUPiB7XG5cdC8qKlxuXHQgKiBBIG5vZGUgd2FzIGFkZGVkLlxuXHQgKi9cblx0YWRkPyhub2RlOiBUKTogdm9pZDtcblxuXHQvKipcblx0ICogQSBub2RlIGluIHRoZSBjb2xsZWN0aW9uIHdhcyB1cGRhdGVkLlxuXHQgKi9cblx0dXBkYXRlPyhub2RlOiBUKTogdm9pZDtcblxuXHQvKipcblx0ICogQSBub2RlIHdhcyByZW1vdmVkLlxuXHQgKi9cblx0cmVtb3ZlPyhub2RlOiBULCBpc05lc3RlZE9wZXJhdGlvbjogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBkaWZmIGhhcyBiZWVuIGFwcGxpZWQuXG5cdCAqL1xuXHRjb21wbGV0ZT8oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBNYWludGFpbnMgdGVzdHMgaW4gdGhpcyBleHRlbnNpb24gaG9zdCBzZW50IGZyb20gdGhlIG1haW4gdGhyZWFkLlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uPFQgZXh0ZW5kcyBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YWdzID0gbmV3IE1hcDxzdHJpbmcsIElUZXN0VGFnRGlzcGxheUluZm8+KCk7XG5cblx0LyoqXG5cdCAqIE1hcCBvZiBpdGVtIElEcyB0byB0ZXN0IGl0ZW0gb2JqZWN0cy5cblx0ICovXG5cdHByb3RlY3RlZCByZWFkb25seSBpdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBUPigpO1xuXG5cdC8qKlxuXHQgKiBJRCBvZiB0ZXN0IHJvb3QgaXRlbXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgcm9vdHMgPSBuZXcgU2V0PFQ+KCk7XG5cblx0LyoqXG5cdCAqIE51bWJlciBvZiAnYnVzeScgY29udHJvbGxlcnMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYnVzeUNvbnRyb2xsZXJDb3VudCA9IDA7XG5cblx0LyoqXG5cdCAqIE51bWJlciBvZiBwZW5kaW5nIHJvb3RzLlxuXHQgKi9cblx0cHJvdGVjdGVkIHBlbmRpbmdSb290Q291bnQgPSAwO1xuXG5cdC8qKlxuXHQgKiBLbm93biB0ZXN0IHRhZ3MuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgdGFnczogUmVhZG9ubHlNYXA8c3RyaW5nLCBJVGVzdFRhZ0Rpc3BsYXlJbmZvPiA9IHRoaXMuX3RhZ3M7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eTogSVRlc3RVcmlDYW5vbmljYWxpemVyKSB7IH1cblxuXHQvKipcblx0ICogQXBwbGllcyB0aGUgZGlmZiB0byB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBhcHBseShkaWZmOiBUZXN0c0RpZmYpIHtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5jcmVhdGVDaGFuZ2VDb2xsZWN0b3IoKTtcblxuXHRcdGZvciAoY29uc3Qgb3Agb2YgZGlmZikge1xuXHRcdFx0c3dpdGNoIChvcC5vcCkge1xuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLkFkZDpcblx0XHRcdFx0XHR0aGlzLmFkZChJbnRlcm5hbFRlc3RJdGVtLmRlc2VyaWFsaXplKHRoaXMudXJpSWRlbnRpdHksIG9wLml0ZW0pLCBjaGFuZ2VzKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLlVwZGF0ZTpcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZShJVGVzdEl0ZW1VcGRhdGUuZGVzZXJpYWxpemUob3AuaXRlbSksIGNoYW5nZXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuUmVtb3ZlOlxuXHRcdFx0XHRcdHRoaXMucmVtb3ZlKG9wLml0ZW1JZCwgY2hhbmdlcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5SZXRpcmU6XG5cdFx0XHRcdFx0dGhpcy5yZXRpcmVUZXN0KG9wLml0ZW1JZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5JbmNyZW1lbnRQZW5kaW5nRXh0SG9zdHM6XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVQZW5kaW5nUm9vdHMob3AuYW1vdW50KTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLkFkZFRhZzpcblx0XHRcdFx0XHR0aGlzLl90YWdzLnNldChvcC50YWcuaWQsIG9wLnRhZyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5SZW1vdmVUYWc6XG5cdFx0XHRcdFx0dGhpcy5fdGFncy5kZWxldGUob3AuaWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNoYW5nZXMuY29tcGxldGU/LigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFkZChpdGVtOiBJbnRlcm5hbFRlc3RJdGVtLCBjaGFuZ2VzOiBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxUPlxuXHQpIHtcblx0XHRjb25zdCBwYXJlbnRJZCA9IFRlc3RJZC5wYXJlbnRJZChpdGVtLml0ZW0uZXh0SWQpPy50b1N0cmluZygpO1xuXHRcdGxldCBjcmVhdGVkOiBUO1xuXHRcdGlmICghcGFyZW50SWQpIHtcblx0XHRcdGNyZWF0ZWQgPSB0aGlzLmNyZWF0ZUl0ZW0oaXRlbSk7XG5cdFx0XHR0aGlzLnJvb3RzLmFkZChjcmVhdGVkKTtcblx0XHRcdHRoaXMuaXRlbXMuc2V0KGl0ZW0uaXRlbS5leHRJZCwgY3JlYXRlZCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLml0ZW1zLmhhcyhwYXJlbnRJZCkpIHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMuaXRlbXMuZ2V0KHBhcmVudElkKSE7XG5cdFx0XHRwYXJlbnQuY2hpbGRyZW4uYWRkKGl0ZW0uaXRlbS5leHRJZCk7XG5cdFx0XHRjcmVhdGVkID0gdGhpcy5jcmVhdGVJdGVtKGl0ZW0sIHBhcmVudCk7XG5cdFx0XHR0aGlzLml0ZW1zLnNldChpdGVtLml0ZW0uZXh0SWQsIGNyZWF0ZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBUZXN0IHdpdGggdW5rbm93biBwYXJlbnQgSUQ6ICR7SlNPTi5zdHJpbmdpZnkoaXRlbSl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2hhbmdlcy5hZGQ/LihjcmVhdGVkKTtcblx0XHRpZiAoaXRlbS5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZykge1xuXHRcdFx0dGhpcy5idXN5Q29udHJvbGxlckNvdW50Kys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlKHBhdGNoOiBJVGVzdEl0ZW1VcGRhdGUsIGNoYW5nZXM6IEluY3JlbWVudGFsQ2hhbmdlQ29sbGVjdG9yPFQ+XG5cdCkge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5pdGVtcy5nZXQocGF0Y2guZXh0SWQpO1xuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGF0Y2guZXhwYW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChleGlzdGluZy5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZykge1xuXHRcdFx0XHR0aGlzLmJ1c3lDb250cm9sbGVyQ291bnQtLTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXRjaC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZykge1xuXHRcdFx0XHR0aGlzLmJ1c3lDb250cm9sbGVyQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhcHBseVRlc3RJdGVtVXBkYXRlKGV4aXN0aW5nLCBwYXRjaCk7XG5cdFx0Y2hhbmdlcy51cGRhdGU/LihleGlzdGluZyk7XG5cdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbW92ZShpdGVtSWQ6IHN0cmluZywgY2hhbmdlczogSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3I8VD4pIHtcblx0XHRjb25zdCB0b1JlbW92ZSA9IHRoaXMuaXRlbXMuZ2V0KGl0ZW1JZCk7XG5cdFx0aWYgKCF0b1JlbW92ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudElkID0gVGVzdElkLnBhcmVudElkKHRvUmVtb3ZlLml0ZW0uZXh0SWQpPy50b1N0cmluZygpO1xuXHRcdGlmIChwYXJlbnRJZCkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5pdGVtcy5nZXQocGFyZW50SWQpITtcblx0XHRcdHBhcmVudC5jaGlsZHJlbi5kZWxldGUodG9SZW1vdmUuaXRlbS5leHRJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucm9vdHMuZGVsZXRlKHRvUmVtb3ZlKTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWV1ZTogSXRlcmFibGU8c3RyaW5nPltdID0gW1tpdGVtSWRdXTtcblx0XHR3aGlsZSAocXVldWUubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW1JZCBvZiBxdWV1ZS5wb3AoKSEpIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLml0ZW1zLmdldChpdGVtSWQpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRxdWV1ZS5wdXNoKGV4aXN0aW5nLmNoaWxkcmVuKTtcblx0XHRcdFx0XHR0aGlzLml0ZW1zLmRlbGV0ZShpdGVtSWQpO1xuXHRcdFx0XHRcdGNoYW5nZXMucmVtb3ZlPy4oZXhpc3RpbmcsIGV4aXN0aW5nICE9PSB0b1JlbW92ZSk7XG5cblx0XHRcdFx0XHRpZiAoZXhpc3RpbmcuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmcpIHtcblx0XHRcdFx0XHRcdHRoaXMuYnVzeUNvbnRyb2xsZXJDb3VudC0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgZXh0ZW5zaW9uIHNpZ25hbHMgYSB0ZXN0IHJlc3VsdCBzaG91bGQgYmUgcmV0aXJlZC5cblx0ICovXG5cdHByb3RlY3RlZCByZXRpcmVUZXN0KHRlc3RJZDogc3RyaW5nKSB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBudW1iZXIgb2YgdGVzdCByb290IHNvdXJjZXMgd2hvIGFyZSB5ZXQgdG8gcmVwb3J0LiBXaGVuXG5cdCAqIHRoZSB0b3RhbCBwZW5kaW5nIHRlc3Qgcm9vdHMgcmVhY2hlcyAwLCB0aGUgcm9vdHMgZm9yIGFsbCBjb250cm9sbGVyc1xuXHQgKiB3aWxsIGV4aXN0IGluIHRoZSBjb2xsZWN0aW9uLlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZVBlbmRpbmdSb290cyhkZWx0YTogbnVtYmVyKSB7XG5cdFx0dGhpcy5wZW5kaW5nUm9vdENvdW50ICs9IGRlbHRhO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBiZWZvcmUgYSBkaWZmIGlzIGFwcGxpZWQgdG8gY3JlYXRlIGEgbmV3IGNoYW5nZSBjb2xsZWN0b3IuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgY3JlYXRlQ2hhbmdlQ29sbGVjdG9yKCk6IEluY3JlbWVudGFsQ2hhbmdlQ29sbGVjdG9yPFQ+IHtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBpdGVtIGZvciB0aGUgY29sbGVjdGlvbiBmcm9tIHRoZSBpbnRlcm5hbCB0ZXN0IGl0ZW0uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgY3JlYXRlSXRlbShpbnRlcm5hbDogSW50ZXJuYWxUZXN0SXRlbSwgcGFyZW50PzogVCk6IFQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLFdBQTBCO0FBQ25DLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFpQixhQUFhO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUVoQixJQUFXLGtCQUFYLGtCQUFXQSxxQkFBWDtBQUNOLEVBQUFBLGtDQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLGtDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLGtDQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLGtDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLGtDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLGtDQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLGtDQUFBLGFBQVUsS0FBVjtBQVBp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QUFDYixnQkFBTSxLQUFLLFNBQVMsUUFBUTtBQUM1QixlQUFLLE1BQU0sT0FBT0EsT0FBTTtBQUN4QixrQkFBUSxTQUFTLFVBQVUsYUFBYSxRQUFRO0FBRWhELGNBQUksU0FBUyxXQUFXLHVCQUFtQztBQUMxRCxpQkFBSztBQUFBLFVBQ047QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLVSxXQUFXLFFBQWdCO0FBQUEsRUFFckM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPTyxtQkFBbUIsT0FBZTtBQUN4QyxTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLVSx3QkFBdUQ7QUFDaEUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQU1EOyIsCiAgIm5hbWVzIjogWyJUZXN0UmVzdWx0U3RhdGUiLCAiRXh0VGVzdFJ1blByb2ZpbGVLaW5kIiwgIlRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eSIsICJUZXN0UnVuUHJvZmlsZUJpdHNldCIsICJJUmljaExvY2F0aW9uIiwgIlRlc3RNZXNzYWdlVHlwZSIsICJJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lIiwgIklUZXN0RXJyb3JNZXNzYWdlIiwgIklUZXN0T3V0cHV0TWVzc2FnZSIsICJJVGVzdE1lc3NhZ2UiLCAiSVRlc3RUYXNrU3RhdGUiLCAiSVRlc3RJdGVtIiwgIlRlc3RJdGVtRXhwYW5kU3RhdGUiLCAiSW50ZXJuYWxUZXN0SXRlbSIsICJJVGVzdEl0ZW1VcGRhdGUiLCAiVGVzdFJlc3VsdEl0ZW0iLCAiSUNvdmVyYWdlQ291bnQiLCAiSUZpbGVDb3ZlcmFnZSIsICJEZXRhaWxUeXBlIiwgIkNvdmVyYWdlRGV0YWlscyIsICJJQnJhbmNoQ292ZXJhZ2UiLCAiSURlY2xhcmF0aW9uQ292ZXJhZ2UiLCAiSVN0YXRlbWVudENvdmVyYWdlIiwgIlRlc3REaWZmT3BUeXBlIiwgIlRlc3RzRGlmZk9wIiwgIml0ZW1JZCJdCn0K
