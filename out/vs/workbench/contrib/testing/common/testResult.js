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
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { language } from "../../../../base/common/platform.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { refreshComputedState } from "./getComputedState.js";
import { TestId } from "./testId.js";
import { makeEmptyCounts, maxPriority, statesInOrder, terminalStatePriorities } from "./testingStates.js";
import { getMarkId, TestItemExpandState, TestMessageType, TestResultItem, TestResultState } from "./testTypes.js";
const emptyRawOutput = {
  buffers: [],
  length: 0,
  onDidWriteData: Event.None,
  endPromise: Promise.resolve(),
  getRange: () => VSBuffer.alloc(0),
  getRangeIter: () => []
};
class TaskRawOutput {
  constructor() {
    this.writeDataEmitter = new Emitter();
    this.endDeferred = new DeferredPromise();
    this.offset = 0;
    /** @inheritdoc */
    this.onDidWriteData = this.writeDataEmitter.event;
    /** @inheritdoc */
    this.endPromise = this.endDeferred.p;
    /** @inheritdoc */
    this.buffers = [];
  }
  /** @inheritdoc */
  get length() {
    return this.offset;
  }
  /** @inheritdoc */
  getRange(start, length) {
    const buf = VSBuffer.alloc(length);
    let bufLastWrite = 0;
    for (const chunk of this.getRangeIter(start, length)) {
      buf.buffer.set(chunk.buffer, bufLastWrite);
      bufLastWrite += chunk.byteLength;
    }
    return bufLastWrite < length ? buf.slice(0, bufLastWrite) : buf;
  }
  /** @inheritdoc */
  *getRangeIter(start, length) {
    let soFar = 0;
    let internalLastRead = 0;
    for (const b of this.buffers) {
      if (internalLastRead + b.byteLength <= start) {
        internalLastRead += b.byteLength;
        continue;
      }
      const bstart = Math.max(0, start - internalLastRead);
      const bend = Math.min(b.byteLength, bstart + length - soFar);
      yield b.slice(bstart, bend);
      soFar += bend - bstart;
      internalLastRead += b.byteLength;
      if (soFar === length) {
        break;
      }
    }
  }
  /**
   * Appends data to the output, returning the byte range where the data can be found.
   */
  append(data, marker) {
    const offset = this.offset;
    let length = data.byteLength;
    if (marker === void 0) {
      this.push(data);
      return { offset, length };
    }
    let TrimBytes;
    ((TrimBytes2) => {
      TrimBytes2[TrimBytes2["CR"] = 13] = "CR";
      TrimBytes2[TrimBytes2["LF"] = 10] = "LF";
    })(TrimBytes || (TrimBytes = {}));
    const start = VSBuffer.fromString(getMarkCode(marker, true));
    const end = VSBuffer.fromString(getMarkCode(marker, false));
    length += start.byteLength + end.byteLength;
    this.push(start);
    let trimLen = data.byteLength;
    for (; trimLen > 0; trimLen--) {
      const last = data.buffer[trimLen - 1];
      if (last !== 13 /* CR */ && last !== 10 /* LF */) {
        break;
      }
    }
    this.push(data.slice(0, trimLen));
    this.push(end);
    this.push(data.slice(trimLen));
    return { offset, length };
  }
  push(data) {
    if (data.byteLength === 0) {
      return;
    }
    this.buffers.push(data);
    this.writeDataEmitter.fire(data);
    this.offset += data.byteLength;
  }
  /** Signals the output has ended. */
  end() {
    this.endDeferred.complete();
  }
}
const resultItemParents = function* (results, item) {
  for (const id of TestId.fromString(item.item.extId).idsToRoot()) {
    yield results.getStateById(id.toString());
  }
};
const maxCountPriority = (counts) => {
  for (const state of statesInOrder) {
    if (counts[state] > 0) {
      return state;
    }
  }
  return TestResultState.Unset;
};
const getMarkCode = (marker, start) => `\x1B]633;SetMark;Id=${getMarkId(marker, start)};Hidden\x07`;
const itemToNode = (controllerId, item, parent) => ({
  controllerId,
  expand: TestItemExpandState.NotExpandable,
  item: { ...item },
  children: [],
  tasks: [],
  ownComputedState: TestResultState.Unset,
  computedState: TestResultState.Unset
});
var TestResultItemChangeReason = /* @__PURE__ */ ((TestResultItemChangeReason2) => {
  TestResultItemChangeReason2[TestResultItemChangeReason2["ComputedStateChange"] = 0] = "ComputedStateChange";
  TestResultItemChangeReason2[TestResultItemChangeReason2["OwnStateChange"] = 1] = "OwnStateChange";
  TestResultItemChangeReason2[TestResultItemChangeReason2["NewMessage"] = 2] = "NewMessage";
  return TestResultItemChangeReason2;
})(TestResultItemChangeReason || {});
let LiveTestResult = class extends Disposable {
  constructor(id, persist, request, insertOrder, telemetry) {
    super();
    this.id = id;
    this.persist = persist;
    this.request = request;
    this.insertOrder = insertOrder;
    this.telemetry = telemetry;
    this.completeEmitter = this._register(new Emitter());
    this.newTaskEmitter = this._register(new Emitter());
    this.endTaskEmitter = this._register(new Emitter());
    this.changeEmitter = this._register(new Emitter());
    /** todo@connor4312: convert to a WellDefinedPrefixTree */
    this.testById = /* @__PURE__ */ new Map();
    this.testMarkerCounter = 0;
    this.startedAt = Date.now();
    this.onChange = this.changeEmitter.event;
    this.onComplete = this.completeEmitter.event;
    this.onNewTask = this.newTaskEmitter.event;
    this.onEndTask = this.endTaskEmitter.event;
    this.tasks = [];
    this.name = localize("runFinished", "Test run at {0}", (/* @__PURE__ */ new Date()).toLocaleString(language));
    /**
     * @inheritdoc
     */
    this.counts = makeEmptyCounts();
    this.computedStateAccessor = {
      getOwnState: (i) => i.ownComputedState,
      getCurrentComputedState: (i) => i.computedState,
      setComputedState: (i, s) => i.computedState = s,
      getChildren: (i) => i.children,
      getParents: (i) => {
        const { testById: testByExtId } = this;
        return (function* () {
          const parentId = TestId.fromString(i.item.extId).parentId;
          if (parentId) {
            for (const id of parentId.idsToRoot()) {
              yield testByExtId.get(id.toString());
            }
          }
        })();
      }
    };
    this.doSerialize = new Lazy(() => ({
      id: this.id,
      completedAt: this.completedAt,
      tasks: this.tasks.map((t) => ({ id: t.id, name: t.name, ctrlId: t.ctrlId, hasCoverage: !!t.coverage.get() })),
      name: this.name,
      request: this.request,
      items: [...this.testById.values()].map(TestResultItem.serializeWithoutMessages)
    }));
    this.doSerializeWithMessages = new Lazy(() => ({
      id: this.id,
      completedAt: this.completedAt,
      tasks: this.tasks.map((t) => ({ id: t.id, name: t.name, ctrlId: t.ctrlId, hasCoverage: !!t.coverage.get() })),
      name: this.name,
      request: this.request,
      items: [...this.testById.values()].map(TestResultItem.serialize)
    }));
  }
  /**
   * @inheritdoc
   */
  get completedAt() {
    return this._completedAt;
  }
  /**
   * @inheritdoc
   */
  get tests() {
    return this.testById.values();
  }
  /** Gets an included test item by ID. */
  getTestById(id) {
    return this.testById.get(id)?.item;
  }
  /**
   * @inheritdoc
   */
  getStateById(extTestId) {
    return this.testById.get(extTestId);
  }
  /**
   * Appends output that occurred during the test run.
   */
  appendOutput(output, taskId, location, testId) {
    const rawPreview = output.byteLength > 100 ? output.slice(0, 100).toString() + "\u2026" : output.toString();
    const preview = removeAnsiEscapeCodes(rawPreview);
    let marker;
    if (testId || location) {
      marker = this.testMarkerCounter++;
    }
    const index = this.mustGetTaskIndex(taskId);
    const task = this.tasks[index];
    const { offset, length } = task.output.append(output, marker);
    const message = {
      location,
      message: preview,
      offset,
      length,
      marker,
      type: TestMessageType.Output
    };
    const test = testId && this.testById.get(testId);
    if (test) {
      test.tasks[index].messages.push(message);
      this.changeEmitter.fire({ item: test, result: this, reason: 2 /* NewMessage */, message });
    } else {
      task.otherMessages.push(message);
    }
  }
  /**
   * Adds a new run task to the results.
   */
  addTask(task) {
    this.tasks.push({ ...task, coverage: observableValue(this, void 0), otherMessages: [], output: new TaskRawOutput() });
    for (const test of this.tests) {
      test.tasks.push({ duration: void 0, messages: [], state: TestResultState.Unset });
    }
    this.newTaskEmitter.fire(this.tasks.length - 1);
  }
  /**
   * Add the chain of tests to the run. The first test in the chain should
   * be either a test root, or a previously-known test.
   */
  addTestChainToRun(controllerId, chain) {
    let parent = this.testById.get(chain[0].extId);
    if (!parent) {
      parent = this.addTestToRun(controllerId, chain[0], null);
    }
    for (let i = 1; i < chain.length; i++) {
      parent = this.addTestToRun(controllerId, chain[i], parent.item.extId);
    }
    return void 0;
  }
  /**
   * Updates the state of the test by its internal ID.
   */
  updateState(testId, taskId, state, duration) {
    const entry = this.testById.get(testId);
    if (!entry) {
      return;
    }
    const index = this.mustGetTaskIndex(taskId);
    const oldTerminalStatePrio = terminalStatePriorities[entry.tasks[index].state];
    const newTerminalStatePrio = terminalStatePriorities[state];
    if (oldTerminalStatePrio !== void 0 && (newTerminalStatePrio === void 0 || newTerminalStatePrio < oldTerminalStatePrio)) {
      return;
    }
    this.fireUpdateAndRefresh(entry, index, state, duration);
  }
  /**
   * Appends a message for the test in the run.
   */
  appendMessage(testId, taskId, message) {
    const entry = this.testById.get(testId);
    if (!entry) {
      return;
    }
    entry.tasks[this.mustGetTaskIndex(taskId)].messages.push(message);
    this.changeEmitter.fire({ item: entry, result: this, reason: 2 /* NewMessage */, message });
  }
  /**
   * Marks the task in the test run complete.
   */
  markTaskComplete(taskId) {
    const index = this.mustGetTaskIndex(taskId);
    const task = this.tasks[index];
    task.running = false;
    task.output.end();
    this.setAllToState(
      TestResultState.Skipped,
      taskId,
      (t) => t.state === TestResultState.Queued || t.state === TestResultState.Running
    );
    this.endTaskEmitter.fire(index);
  }
  /**
   * Notifies the service that all tests are complete.
   */
  markComplete() {
    if (this._completedAt !== void 0) {
      throw new Error("cannot complete a test result multiple times");
    }
    for (const task of this.tasks) {
      if (task.running) {
        this.markTaskComplete(task.id);
      }
    }
    this._completedAt = Date.now();
    this.completeEmitter.fire();
    this.telemetry.publicLog2("test.outcomes", {
      failures: this.counts[TestResultState.Errored] + this.counts[TestResultState.Failed],
      passes: this.counts[TestResultState.Passed],
      controller: this.request.targets.map((t) => t.controllerId).join(",")
    });
  }
  /**
   * Marks the test and all of its children in the run as retired.
   */
  markRetired(testIds) {
    for (const [id, test] of this.testById) {
      if (!test.retired && (!testIds || testIds.hasKeyOrParent(TestId.fromString(id).path))) {
        test.retired = true;
        this.changeEmitter.fire({ reason: 0 /* ComputedStateChange */, item: test, result: this });
      }
    }
  }
  /**
   * @inheritdoc
   */
  toJSON() {
    return this.completedAt && this.persist ? this.doSerialize.value : void 0;
  }
  toJSONWithMessages() {
    return this.completedAt && this.persist ? this.doSerializeWithMessages.value : void 0;
  }
  /**
   * Updates all tests in the collection to the given state.
   */
  setAllToState(state, taskId, when) {
    const index = this.mustGetTaskIndex(taskId);
    for (const test of this.testById.values()) {
      if (when(test.tasks[index], test)) {
        this.fireUpdateAndRefresh(test, index, state);
      }
    }
  }
  fireUpdateAndRefresh(entry, taskIndex, newState, newOwnDuration) {
    const previousOwnComputed = entry.ownComputedState;
    const previousOwnDuration = entry.ownDuration;
    const changeEvent = {
      item: entry,
      result: this,
      reason: 1 /* OwnStateChange */,
      previousState: previousOwnComputed,
      previousOwnDuration
    };
    entry.tasks[taskIndex].state = newState;
    if (newOwnDuration !== void 0) {
      entry.tasks[taskIndex].duration = newOwnDuration;
      entry.ownDuration = Math.max(entry.ownDuration || 0, newOwnDuration);
    }
    const newOwnComputed = maxPriority(...entry.tasks.map((t) => t.state));
    if (newOwnComputed === previousOwnComputed) {
      if (newOwnDuration !== previousOwnDuration) {
        this.changeEmitter.fire(changeEvent);
      }
      return;
    }
    entry.ownComputedState = newOwnComputed;
    this.counts[previousOwnComputed]--;
    this.counts[newOwnComputed]++;
    refreshComputedState(this.computedStateAccessor, entry).forEach(
      (t) => this.changeEmitter.fire(t === entry ? changeEvent : {
        item: t,
        result: this,
        reason: 0 /* ComputedStateChange */
      })
    );
  }
  addTestToRun(controllerId, item, parent) {
    const node = itemToNode(controllerId, item, parent);
    this.testById.set(item.extId, node);
    this.counts[TestResultState.Unset]++;
    if (parent) {
      this.testById.get(parent)?.children.push(node);
    }
    if (this.tasks.length) {
      for (let i = 0; i < this.tasks.length; i++) {
        node.tasks.push({ duration: void 0, messages: [], state: TestResultState.Unset });
      }
    }
    return node;
  }
  mustGetTaskIndex(taskId) {
    const index = this.tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`Unknown task ${taskId} in updateState`);
    }
    return index;
  }
};
LiveTestResult = __decorateClass([
  __decorateParam(4, ITelemetryService)
], LiveTestResult);
class HydratedTestResult {
  constructor(identity, serialized, persist = true) {
    this.serialized = serialized;
    this.persist = persist;
    /**
     * @inheritdoc
     */
    this.counts = makeEmptyCounts();
    this.testById = /* @__PURE__ */ new Map();
    this.id = serialized.id;
    this.completedAt = serialized.completedAt;
    this.tasks = serialized.tasks.map((task, i) => ({
      id: task.id,
      name: task.name || localize("testUnnamedTask", "Unnamed Task"),
      ctrlId: task.ctrlId,
      running: false,
      coverage: observableValue(this, void 0),
      output: emptyRawOutput,
      otherMessages: []
    }));
    this.name = serialized.name;
    this.request = serialized.request;
    for (const item of serialized.items) {
      const de = TestResultItem.deserialize(identity, item);
      this.counts[de.ownComputedState]++;
      this.testById.set(item.item.extId, de);
    }
  }
  /**
   * @inheritdoc
   */
  get tests() {
    return this.testById.values();
  }
  /**
   * @inheritdoc
   */
  getStateById(extTestId) {
    return this.testById.get(extTestId);
  }
  /**
   * @inheritdoc
   */
  toJSON() {
    return this.persist ? this.serialized : void 0;
  }
  /**
   * @inheritdoc
   */
  toJSONWithMessages() {
    return this.toJSON();
  }
}
export {
  HydratedTestResult,
  LiveTestResult,
  TaskRawOutput,
  TestResultItemChangeReason,
  maxCountPriority,
  resultItemParents
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdFJlc3VsdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFdlbGxEZWZpbmVkUHJlZml4VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3ByZWZpeFRyZWUuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUNvbXB1dGVkU3RhdGVBY2Nlc3NvciwgcmVmcmVzaENvbXB1dGVkU3RhdGUgfSBmcm9tICcuL2dldENvbXB1dGVkU3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdENvdmVyYWdlIH0gZnJvbSAnLi90ZXN0Q292ZXJhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgbWFrZUVtcHR5Q291bnRzLCBtYXhQcmlvcml0eSwgc3RhdGVzSW5PcmRlciwgdGVybWluYWxTdGF0ZVByaW9yaXRpZXMsIFRlc3RTdGF0ZUNvdW50IH0gZnJvbSAnLi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IGdldE1hcmtJZCwgSVJpY2hMb2NhdGlvbiwgSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cywgSVRlc3RJdGVtLCBJVGVzdE1lc3NhZ2UsIElUZXN0T3V0cHV0TWVzc2FnZSwgSVRlc3RSdW5UYXNrLCBJVGVzdFRhc2tTdGF0ZSwgUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCwgVGVzdEl0ZW1FeHBhbmRTdGF0ZSwgVGVzdE1lc3NhZ2VUeXBlLCBUZXN0UmVzdWx0SXRlbSwgVGVzdFJlc3VsdFN0YXRlIH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0UnVuVGFza1Jlc3VsdHMgZXh0ZW5kcyBJVGVzdFJ1blRhc2sge1xuXHQvKipcblx0ICogQ29udGFpbnMgdGVzdCBjb3ZlcmFnZSBmb3IgdGhlIHJlc3VsdCwgaWYgaXQncyBhdmFpbGFibGUuXG5cdCAqL1xuXHRyZWFkb25seSBjb3ZlcmFnZTogSU9ic2VydmFibGU8VGVzdENvdmVyYWdlIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogTWVzc2FnZXMgZnJvbSB0aGUgdGFzayBub3QgYXNzb2NpYXRlZCB3aXRoIGFueSBzcGVjaWZpYyB0ZXN0LlxuXHQgKi9cblx0cmVhZG9ubHkgb3RoZXJNZXNzYWdlczogSVRlc3RPdXRwdXRNZXNzYWdlW107XG5cblx0LyoqXG5cdCAqIFRlc3QgcmVzdWx0cyBvdXRwdXQgZm9yIHRoZSB0YXNrLlxuXHQgKi9cblx0cmVhZG9ubHkgb3V0cHV0OiBJVGFza1Jhd091dHB1dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJlc3VsdCB7XG5cdC8qKlxuXHQgKiBDb3VudCBvZiB0aGUgbnVtYmVyIG9mIHRlc3RzIGluIGVhY2ggcnVuIHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgY291bnRzOiBSZWFkb25seTxUZXN0U3RhdGVDb3VudD47XG5cblx0LyoqXG5cdCAqIFVuaXF1ZSBJRCBvZiB0aGlzIHNldCBvZiB0ZXN0IHJlc3VsdHMuXG5cdCAqL1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBJZiB0aGUgdGVzdCBpcyBjb21wbGV0ZWQsIHRoZSB1bml4IG1pbGxpc2Vjb25kcyB0aW1lIGF0IHdoaWNoIGl0IHdhc1xuXHQgKiBjb21wbGV0ZWQuIElmIHVuZGVmaW5lZCwgdGhlIHRlc3QgaXMgc3RpbGwgcnVubmluZy5cblx0ICovXG5cdHJlYWRvbmx5IGNvbXBsZXRlZEF0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyB0ZXN0IHJlc3VsdCBpcyB0cmlnZ2VyZWQgZnJvbSBhbiBhdXRvIHJ1bi5cblx0ICovXG5cdHJlYWRvbmx5IHJlcXVlc3Q6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3Q7XG5cblx0LyoqXG5cdCAqIEh1bWFuLXJlYWRhYmxlIG5hbWUgb2YgdGhlIHRlc3QgcmVzdWx0LlxuXHQgKi9cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBHZXRzIGFsbCB0ZXN0cyBpbnZvbHZlZCBpbiB0aGUgcnVuLlxuXHQgKi9cblx0dGVzdHM6IEl0ZXJhYmxlSXRlcmF0b3I8VGVzdFJlc3VsdEl0ZW0+O1xuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIHRoaXMgcmVzdWx0J3Mgc3VidGFza3MuXG5cdCAqL1xuXHR0YXNrczogUmVhZG9ubHlBcnJheTxJVGVzdFJ1blRhc2tSZXN1bHRzPjtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgc3RhdGUgb2YgdGhlIHRlc3QgYnkgaXRzIGV4dGVuc2lvbi1hc3NpZ25lZCBJRC5cblx0ICovXG5cdGdldFN0YXRlQnlJZCh0ZXN0RXh0SWQ6IHN0cmluZyk6IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSB0ZXN0IHJlc3VsdC4gVXNlZCB0byBzYXZlIGFuZCByZXN0b3JlIHJlc3VsdHNcblx0ICogaW4gdGhlIHdvcmtzcGFjZS5cblx0ICovXG5cdHRvSlNPTigpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSB0ZXN0IHJlc3VsdCwgaW5jbHVkZXMgbWVzc2FnZXMuIFVzZWQgdG8gc2VuZCB0aGUgdGVzdCBzdGF0ZXMgdG8gdGhlIGV4dGVuc2lvbiBob3N0LlxuXHQgKi9cblx0dG9KU09OV2l0aE1lc3NhZ2VzKCk6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMgfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogT3V0cHV0IHR5cGUgZXhwb3NlZCBmcm9tIGxpdmUgdGVzdCByZXN1bHRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUmF3T3V0cHV0IHtcblx0cmVhZG9ubHkgb25EaWRXcml0ZURhdGE6IEV2ZW50PFZTQnVmZmVyPjtcblx0cmVhZG9ubHkgZW5kUHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgYnVmZmVyczogVlNCdWZmZXJbXTtcblx0cmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7XG5cblx0LyoqIEdldHMgYSBjb250aW51b3VzIGJ1ZmZlciBmb3IgdGhlIGRlc2lyZWQgcmFuZ2UgKi9cblx0Z2V0UmFuZ2Uoc3RhcnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBWU0J1ZmZlcjtcblx0LyoqIEdldHMgYW4gaXRlcmF0b3Igb2YgYnVmZmVycyBmb3IgdGhlIHJhbmdlOyBtYXkgYXZvaWQgYWxsb2NhdGlvbiBvZiBnZXRSYW5nZSgpICovXG5cdGdldFJhbmdlSXRlcihzdGFydDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IEl0ZXJhYmxlPFZTQnVmZmVyPjtcbn1cblxuY29uc3QgZW1wdHlSYXdPdXRwdXQ6IElUYXNrUmF3T3V0cHV0ID0ge1xuXHRidWZmZXJzOiBbXSxcblx0bGVuZ3RoOiAwLFxuXHRvbkRpZFdyaXRlRGF0YTogRXZlbnQuTm9uZSxcblx0ZW5kUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG5cdGdldFJhbmdlOiAoKSA9PiBWU0J1ZmZlci5hbGxvYygwKSxcblx0Z2V0UmFuZ2VJdGVyOiAoKSA9PiBbXSxcbn07XG5cbmV4cG9ydCBjbGFzcyBUYXNrUmF3T3V0cHV0IGltcGxlbWVudHMgSVRhc2tSYXdPdXRwdXQge1xuXHRwcml2YXRlIHJlYWRvbmx5IHdyaXRlRGF0YUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxWU0J1ZmZlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbmREZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSBvZmZzZXQgPSAwO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRXcml0ZURhdGEgPSB0aGlzLndyaXRlRGF0YUVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBlbmRQcm9taXNlID0gdGhpcy5lbmREZWZlcnJlZC5wO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZ2V0IGxlbmd0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5vZmZzZXQ7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0Z2V0UmFuZ2Uoc3RhcnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgYnVmID0gVlNCdWZmZXIuYWxsb2MobGVuZ3RoKTtcblx0XHRsZXQgYnVmTGFzdFdyaXRlID0gMDtcblx0XHRmb3IgKGNvbnN0IGNodW5rIG9mIHRoaXMuZ2V0UmFuZ2VJdGVyKHN0YXJ0LCBsZW5ndGgpKSB7XG5cdFx0XHRidWYuYnVmZmVyLnNldChjaHVuay5idWZmZXIsIGJ1Zkxhc3RXcml0ZSk7XG5cdFx0XHRidWZMYXN0V3JpdGUgKz0gY2h1bmsuYnl0ZUxlbmd0aDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYnVmTGFzdFdyaXRlIDwgbGVuZ3RoID8gYnVmLnNsaWNlKDAsIGJ1Zkxhc3RXcml0ZSkgOiBidWY7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0KmdldFJhbmdlSXRlcihzdGFydDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikge1xuXHRcdGxldCBzb0ZhciA9IDA7XG5cdFx0bGV0IGludGVybmFsTGFzdFJlYWQgPSAwO1xuXHRcdGZvciAoY29uc3QgYiBvZiB0aGlzLmJ1ZmZlcnMpIHtcblx0XHRcdGlmIChpbnRlcm5hbExhc3RSZWFkICsgYi5ieXRlTGVuZ3RoIDw9IHN0YXJ0KSB7XG5cdFx0XHRcdGludGVybmFsTGFzdFJlYWQgKz0gYi5ieXRlTGVuZ3RoO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnN0YXJ0ID0gTWF0aC5tYXgoMCwgc3RhcnQgLSBpbnRlcm5hbExhc3RSZWFkKTtcblx0XHRcdGNvbnN0IGJlbmQgPSBNYXRoLm1pbihiLmJ5dGVMZW5ndGgsIGJzdGFydCArIGxlbmd0aCAtIHNvRmFyKTtcblxuXHRcdFx0eWllbGQgYi5zbGljZShic3RhcnQsIGJlbmQpO1xuXHRcdFx0c29GYXIgKz0gYmVuZCAtIGJzdGFydDtcblx0XHRcdGludGVybmFsTGFzdFJlYWQgKz0gYi5ieXRlTGVuZ3RoO1xuXG5cdFx0XHRpZiAoc29GYXIgPT09IGxlbmd0aCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBkYXRhIHRvIHRoZSBvdXRwdXQsIHJldHVybmluZyB0aGUgYnl0ZSByYW5nZSB3aGVyZSB0aGUgZGF0YSBjYW4gYmUgZm91bmQuXG5cdCAqL1xuXHRwdWJsaWMgYXBwZW5kKGRhdGE6IFZTQnVmZmVyLCBtYXJrZXI/OiBudW1iZXIpIHtcblx0XHRjb25zdCBvZmZzZXQgPSB0aGlzLm9mZnNldDtcblx0XHRsZXQgbGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoO1xuXHRcdGlmIChtYXJrZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5wdXNoKGRhdGEpO1xuXHRcdFx0cmV0dXJuIHsgb2Zmc2V0LCBsZW5ndGggfTtcblx0XHR9XG5cblx0XHQvLyBCeXRlcyB0aGF0IHNob3VsZCBiZSAndHJpbW1lZCcgb2ZmIHRoZSBlbmQgb2YgZGF0YS4gVGhpcyBpcyBkb25lIGJlY2F1c2Vcblx0XHQvLyBzZWxlY3Rpb25zIGluIHRoZSB0ZXJtaW5hbCBhcmUgYmFzZWQgb24gdGhlIGVudGlyZSBsaW5lLCBhbmQgY29tbW9ubHlcblx0XHQvLyB0aGUgaW50ZXJlc3RpbmcgbWFya2VkIHJhbmdlIGhhcyBhIHRyYWlsaW5nIG5ldyBsaW5lLiBXZSBkb24ndCB3YW50IHRvXG5cdFx0Ly8gc2VsZWN0IHRoZSB0cmFpbGluZyBsaW5lICh3aGljaCBtaWdodCBoYXZlIG90aGVyIGRhdGEpXG5cdFx0Ly8gc28gd2UgcGxhY2UgdGhlIG1hcmtlciBiZWZvcmUgYWxsIHRyYWlsaW5nIHRyaW1ieXRlcy5cblx0XHRjb25zdCBlbnVtIFRyaW1CeXRlcyB7XG5cdFx0XHRDUiA9IDEzLFxuXHRcdFx0TEYgPSAxMCxcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IFZTQnVmZmVyLmZyb21TdHJpbmcoZ2V0TWFya0NvZGUobWFya2VyLCB0cnVlKSk7XG5cdFx0Y29uc3QgZW5kID0gVlNCdWZmZXIuZnJvbVN0cmluZyhnZXRNYXJrQ29kZShtYXJrZXIsIGZhbHNlKSk7XG5cdFx0bGVuZ3RoICs9IHN0YXJ0LmJ5dGVMZW5ndGggKyBlbmQuYnl0ZUxlbmd0aDtcblxuXHRcdHRoaXMucHVzaChzdGFydCk7XG5cdFx0bGV0IHRyaW1MZW4gPSBkYXRhLmJ5dGVMZW5ndGg7XG5cdFx0Zm9yICg7IHRyaW1MZW4gPiAwOyB0cmltTGVuLS0pIHtcblx0XHRcdGNvbnN0IGxhc3QgPSBkYXRhLmJ1ZmZlclt0cmltTGVuIC0gMV07XG5cdFx0XHRpZiAobGFzdCAhPT0gVHJpbUJ5dGVzLkNSICYmIGxhc3QgIT09IFRyaW1CeXRlcy5MRikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnB1c2goZGF0YS5zbGljZSgwLCB0cmltTGVuKSk7XG5cdFx0dGhpcy5wdXNoKGVuZCk7XG5cdFx0dGhpcy5wdXNoKGRhdGEuc2xpY2UodHJpbUxlbikpO1xuXG5cblx0XHRyZXR1cm4geyBvZmZzZXQsIGxlbmd0aCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBwdXNoKGRhdGE6IFZTQnVmZmVyKSB7XG5cdFx0aWYgKGRhdGEuYnl0ZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYnVmZmVycy5wdXNoKGRhdGEpO1xuXHRcdHRoaXMud3JpdGVEYXRhRW1pdHRlci5maXJlKGRhdGEpO1xuXHRcdHRoaXMub2Zmc2V0ICs9IGRhdGEuYnl0ZUxlbmd0aDtcblx0fVxuXG5cdC8qKiBTaWduYWxzIHRoZSBvdXRwdXQgaGFzIGVuZGVkLiAqL1xuXHRwdWJsaWMgZW5kKCkge1xuXHRcdHRoaXMuZW5kRGVmZXJyZWQuY29tcGxldGUoKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgcmVzdWx0SXRlbVBhcmVudHMgPSBmdW5jdGlvbiogKHJlc3VsdHM6IElUZXN0UmVzdWx0LCBpdGVtOiBUZXN0UmVzdWx0SXRlbSkge1xuXHRmb3IgKGNvbnN0IGlkIG9mIFRlc3RJZC5mcm9tU3RyaW5nKGl0ZW0uaXRlbS5leHRJZCkuaWRzVG9Sb290KCkpIHtcblx0XHR5aWVsZCByZXN1bHRzLmdldFN0YXRlQnlJZChpZC50b1N0cmluZygpKSE7XG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBtYXhDb3VudFByaW9yaXR5ID0gKGNvdW50czogUmVhZG9ubHk8VGVzdFN0YXRlQ291bnQ+KSA9PiB7XG5cdGZvciAoY29uc3Qgc3RhdGUgb2Ygc3RhdGVzSW5PcmRlcikge1xuXHRcdGlmIChjb3VudHNbc3RhdGVdID4gMCkge1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBUZXN0UmVzdWx0U3RhdGUuVW5zZXQ7XG59O1xuXG5jb25zdCBnZXRNYXJrQ29kZSA9IChtYXJrZXI6IG51bWJlciwgc3RhcnQ6IGJvb2xlYW4pID0+IGBcXHgxYl02MzM7U2V0TWFyaztJZD0ke2dldE1hcmtJZChtYXJrZXIsIHN0YXJ0KX07SGlkZGVuXFx4MDdgO1xuXG5pbnRlcmZhY2UgVGVzdFJlc3VsdEl0ZW1XaXRoQ2hpbGRyZW4gZXh0ZW5kcyBUZXN0UmVzdWx0SXRlbSB7XG5cdC8qKiBDaGlsZHJlbiBpbiB0aGUgcnVuICovXG5cdGNoaWxkcmVuOiBUZXN0UmVzdWx0SXRlbVdpdGhDaGlsZHJlbltdO1xufVxuXG5jb25zdCBpdGVtVG9Ob2RlID0gKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBpdGVtOiBJVGVzdEl0ZW0sIHBhcmVudDogc3RyaW5nIHwgbnVsbCk6IFRlc3RSZXN1bHRJdGVtV2l0aENoaWxkcmVuID0+ICh7XG5cdGNvbnRyb2xsZXJJZCxcblx0ZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsXG5cdGl0ZW06IHsgLi4uaXRlbSB9LFxuXHRjaGlsZHJlbjogW10sXG5cdHRhc2tzOiBbXSxcblx0b3duQ29tcHV0ZWRTdGF0ZTogVGVzdFJlc3VsdFN0YXRlLlVuc2V0LFxuXHRjb21wdXRlZFN0YXRlOiBUZXN0UmVzdWx0U3RhdGUuVW5zZXQsXG59KTtcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24ge1xuXHRDb21wdXRlZFN0YXRlQ2hhbmdlLFxuXHRPd25TdGF0ZUNoYW5nZSxcblx0TmV3TWVzc2FnZSxcbn1cblxuZXhwb3J0IHR5cGUgVGVzdFJlc3VsdEl0ZW1DaGFuZ2UgPSB7IGl0ZW06IFRlc3RSZXN1bHRJdGVtOyByZXN1bHQ6IElUZXN0UmVzdWx0IH0gJiAoXG5cdHwgeyByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLkNvbXB1dGVkU3RhdGVDaGFuZ2UgfVxuXHR8IHsgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Pd25TdGF0ZUNoYW5nZTsgcHJldmlvdXNTdGF0ZTogVGVzdFJlc3VsdFN0YXRlOyBwcmV2aW91c093bkR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQgfVxuXHR8IHsgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5OZXdNZXNzYWdlOyBtZXNzYWdlOiBJVGVzdE1lc3NhZ2UgfVxuKTtcblxuLyoqXG4gKiBSZXN1bHRzIG9mIGEgdGVzdC4gVGhlc2UgYXJlIGNyZWF0ZWQgd2hlbiB0aGUgdGVzdCBpbml0aWFsbHkgc3RhcnRlZCBydW5uaW5nXG4gKiBhbmQgbWFya2VkIGFzIFwiY29tcGxldGVcIiB3aGVuIHRoZSBydW4gZmluaXNoZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBMaXZlVGVzdFJlc3VsdCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVzdFJlc3VsdCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tcGxldGVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmV3VGFza0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVuZFRhc2tFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjaGFuZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGVzdFJlc3VsdEl0ZW1DaGFuZ2U+KCkpO1xuXHQvKiogdG9kb0Bjb25ub3I0MzEyOiBjb252ZXJ0IHRvIGEgV2VsbERlZmluZWRQcmVmaXhUcmVlICovXG5cdHByaXZhdGUgcmVhZG9ubHkgdGVzdEJ5SWQgPSBuZXcgTWFwPHN0cmluZywgVGVzdFJlc3VsdEl0ZW1XaXRoQ2hpbGRyZW4+KCk7XG5cdHByaXZhdGUgdGVzdE1hcmtlckNvdW50ZXIgPSAwO1xuXHRwcml2YXRlIF9jb21wbGV0ZWRBdD86IG51bWJlcjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQ2hhbmdlID0gdGhpcy5jaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db21wbGV0ZSA9IHRoaXMuY29tcGxldGVFbWl0dGVyLmV2ZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25OZXdUYXNrID0gdGhpcy5uZXdUYXNrRW1pdHRlci5ldmVudDtcblx0cHVibGljIHJlYWRvbmx5IG9uRW5kVGFzayA9IHRoaXMuZW5kVGFza0VtaXR0ZXIuZXZlbnQ7XG5cdHB1YmxpYyByZWFkb25seSB0YXNrczogKElUZXN0UnVuVGFza1Jlc3VsdHMgJiB7IG91dHB1dDogVGFza1Jhd091dHB1dCB9KVtdID0gW107XG5cdHB1YmxpYyByZWFkb25seSBuYW1lID0gbG9jYWxpemUoJ3J1bkZpbmlzaGVkJywgJ1Rlc3QgcnVuIGF0IHswfScsIG5ldyBEYXRlKCkudG9Mb2NhbGVTdHJpbmcobGFuZ3VhZ2UpKTtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXQgY29tcGxldGVkQXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXBsZXRlZEF0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgY291bnRzID0gbWFrZUVtcHR5Q291bnRzKCk7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHRlc3RzKCkge1xuXHRcdHJldHVybiB0aGlzLnRlc3RCeUlkLnZhbHVlcygpO1xuXHR9XG5cblx0LyoqIEdldHMgYW4gaW5jbHVkZWQgdGVzdCBpdGVtIGJ5IElELiAqL1xuXHRwdWJsaWMgZ2V0VGVzdEJ5SWQoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLnRlc3RCeUlkLmdldChpZCk/Lml0ZW07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXB1dGVkU3RhdGVBY2Nlc3NvcjogSUNvbXB1dGVkU3RhdGVBY2Nlc3NvcjxUZXN0UmVzdWx0SXRlbVdpdGhDaGlsZHJlbj4gPSB7XG5cdFx0Z2V0T3duU3RhdGU6IGkgPT4gaS5vd25Db21wdXRlZFN0YXRlLFxuXHRcdGdldEN1cnJlbnRDb21wdXRlZFN0YXRlOiBpID0+IGkuY29tcHV0ZWRTdGF0ZSxcblx0XHRzZXRDb21wdXRlZFN0YXRlOiAoaSwgcykgPT4gaS5jb21wdXRlZFN0YXRlID0gcyxcblx0XHRnZXRDaGlsZHJlbjogaSA9PiBpLmNoaWxkcmVuLFxuXHRcdGdldFBhcmVudHM6IGkgPT4ge1xuXHRcdFx0Y29uc3QgeyB0ZXN0QnlJZDogdGVzdEJ5RXh0SWQgfSA9IHRoaXM7XG5cdFx0XHRyZXR1cm4gKGZ1bmN0aW9uKiAoKSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudElkID0gVGVzdElkLmZyb21TdHJpbmcoaS5pdGVtLmV4dElkKS5wYXJlbnRJZDtcblx0XHRcdFx0aWYgKHBhcmVudElkKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiBwYXJlbnRJZC5pZHNUb1Jvb3QoKSkge1xuXHRcdFx0XHRcdFx0eWllbGQgdGVzdEJ5RXh0SWQuZ2V0KGlkLnRvU3RyaW5nKCkpITtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fSxcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcGVyc2lzdDogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVxdWVzdDogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5zZXJ0T3JkZXI6IG51bWJlcixcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnk6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0U3RhdGVCeUlkKGV4dFRlc3RJZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMudGVzdEJ5SWQuZ2V0KGV4dFRlc3RJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBvdXRwdXQgdGhhdCBvY2N1cnJlZCBkdXJpbmcgdGhlIHRlc3QgcnVuLlxuXHQgKi9cblx0cHVibGljIGFwcGVuZE91dHB1dChvdXRwdXQ6IFZTQnVmZmVyLCB0YXNrSWQ6IHN0cmluZywgbG9jYXRpb24/OiBJUmljaExvY2F0aW9uLCB0ZXN0SWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByYXdQcmV2aWV3ID0gb3V0cHV0LmJ5dGVMZW5ndGggPiAxMDAgPyBvdXRwdXQuc2xpY2UoMCwgMTAwKS50b1N0cmluZygpICsgJ1x1MjAyNicgOiBvdXRwdXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwcmV2aWV3ID0gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKHJhd1ByZXZpZXcpO1xuXHRcdGxldCBtYXJrZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIGN1cnJlbnRseSwgdGhlIFVJIG9ubHkgZXhwb3NlcyBqdW1wLXRvLW1lc3NhZ2UgZnJvbSB0ZXN0cyBvciBsb2NhdGlvbnMsXG5cdFx0Ly8gc28gbm8gbmVlZCB0byBtYXJrIG91dHB1dHMgdGhhdCBkb24ndCBjb21lIGZyb20gZWl0aGVyIG9mIHRob3NlLlxuXHRcdGlmICh0ZXN0SWQgfHwgbG9jYXRpb24pIHtcblx0XHRcdG1hcmtlciA9IHRoaXMudGVzdE1hcmtlckNvdW50ZXIrKztcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMubXVzdEdldFRhc2tJbmRleCh0YXNrSWQpO1xuXHRcdGNvbnN0IHRhc2sgPSB0aGlzLnRhc2tzW2luZGV4XTtcblxuXHRcdGNvbnN0IHsgb2Zmc2V0LCBsZW5ndGggfSA9IHRhc2sub3V0cHV0LmFwcGVuZChvdXRwdXQsIG1hcmtlcik7XG5cdFx0Y29uc3QgbWVzc2FnZTogSVRlc3RPdXRwdXRNZXNzYWdlID0ge1xuXHRcdFx0bG9jYXRpb24sXG5cdFx0XHRtZXNzYWdlOiBwcmV2aWV3LFxuXHRcdFx0b2Zmc2V0LFxuXHRcdFx0bGVuZ3RoLFxuXHRcdFx0bWFya2VyLFxuXHRcdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLk91dHB1dCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVzdCA9IHRlc3RJZCAmJiB0aGlzLnRlc3RCeUlkLmdldCh0ZXN0SWQpO1xuXHRcdGlmICh0ZXN0KSB7XG5cdFx0XHR0ZXN0LnRhc2tzW2luZGV4XS5tZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoeyBpdGVtOiB0ZXN0LCByZXN1bHQ6IHRoaXMsIHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uTmV3TWVzc2FnZSwgbWVzc2FnZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFzay5vdGhlck1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgYSBuZXcgcnVuIHRhc2sgdG8gdGhlIHJlc3VsdHMuXG5cdCAqL1xuXHRwdWJsaWMgYWRkVGFzayh0YXNrOiBJVGVzdFJ1blRhc2spIHtcblx0XHR0aGlzLnRhc2tzLnB1c2goeyAuLi50YXNrLCBjb3ZlcmFnZTogb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCksIG90aGVyTWVzc2FnZXM6IFtdLCBvdXRwdXQ6IG5ldyBUYXNrUmF3T3V0cHV0KCkgfSk7XG5cblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGhpcy50ZXN0cykge1xuXHRcdFx0dGVzdC50YXNrcy5wdXNoKHsgZHVyYXRpb246IHVuZGVmaW5lZCwgbWVzc2FnZXM6IFtdLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLlVuc2V0IH0pO1xuXHRcdH1cblxuXHRcdHRoaXMubmV3VGFza0VtaXR0ZXIuZmlyZSh0aGlzLnRhc2tzLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZCB0aGUgY2hhaW4gb2YgdGVzdHMgdG8gdGhlIHJ1bi4gVGhlIGZpcnN0IHRlc3QgaW4gdGhlIGNoYWluIHNob3VsZFxuXHQgKiBiZSBlaXRoZXIgYSB0ZXN0IHJvb3QsIG9yIGEgcHJldmlvdXNseS1rbm93biB0ZXN0LlxuXHQgKi9cblx0cHVibGljIGFkZFRlc3RDaGFpblRvUnVuKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBjaGFpbjogUmVhZG9ubHlBcnJheTxJVGVzdEl0ZW0+KSB7XG5cdFx0bGV0IHBhcmVudCA9IHRoaXMudGVzdEJ5SWQuZ2V0KGNoYWluWzBdLmV4dElkKTtcblx0XHRpZiAoIXBhcmVudCkgeyAvLyBtdXN0IGJlIGEgdGVzdCByb290XG5cdFx0XHRwYXJlbnQgPSB0aGlzLmFkZFRlc3RUb1J1bihjb250cm9sbGVySWQsIGNoYWluWzBdLCBudWxsKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGNoYWluLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRwYXJlbnQgPSB0aGlzLmFkZFRlc3RUb1J1bihjb250cm9sbGVySWQsIGNoYWluW2ldLCBwYXJlbnQuaXRlbS5leHRJZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBzdGF0ZSBvZiB0aGUgdGVzdCBieSBpdHMgaW50ZXJuYWwgSUQuXG5cdCAqL1xuXHRwdWJsaWMgdXBkYXRlU3RhdGUodGVzdElkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLCBkdXJhdGlvbj86IG51bWJlcikge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy50ZXN0QnlJZC5nZXQodGVzdElkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm11c3RHZXRUYXNrSW5kZXgodGFza0lkKTtcblxuXHRcdGNvbnN0IG9sZFRlcm1pbmFsU3RhdGVQcmlvID0gdGVybWluYWxTdGF0ZVByaW9yaXRpZXNbZW50cnkudGFza3NbaW5kZXhdLnN0YXRlXTtcblx0XHRjb25zdCBuZXdUZXJtaW5hbFN0YXRlUHJpbyA9IHRlcm1pbmFsU3RhdGVQcmlvcml0aWVzW3N0YXRlXTtcblxuXHRcdC8vIElnbm9yZSByZXF1ZXN0cyB0byBzZXQgdGhlIHN0YXRlIGZyb20gb25lIHRlcm1pbmFsIHN0YXRlIGJhY2sgdG8gYVxuXHRcdC8vIFwibG93ZXJcIiBvbmUsIGUuZy4gZnJvbSBmYWlsZWQgYmFjayB0byBwYXNzZWQ6XG5cdFx0aWYgKG9sZFRlcm1pbmFsU3RhdGVQcmlvICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdChuZXdUZXJtaW5hbFN0YXRlUHJpbyA9PT0gdW5kZWZpbmVkIHx8IG5ld1Rlcm1pbmFsU3RhdGVQcmlvIDwgb2xkVGVybWluYWxTdGF0ZVByaW8pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5maXJlVXBkYXRlQW5kUmVmcmVzaChlbnRyeSwgaW5kZXgsIHN0YXRlLCBkdXJhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBhIG1lc3NhZ2UgZm9yIHRoZSB0ZXN0IGluIHRoZSBydW4uXG5cdCAqL1xuXHRwdWJsaWMgYXBwZW5kTWVzc2FnZSh0ZXN0SWQ6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIG1lc3NhZ2U6IElUZXN0TWVzc2FnZSkge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy50ZXN0QnlJZC5nZXQodGVzdElkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZW50cnkudGFza3NbdGhpcy5tdXN0R2V0VGFza0luZGV4KHRhc2tJZCldLm1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoeyBpdGVtOiBlbnRyeSwgcmVzdWx0OiB0aGlzLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk5ld01lc3NhZ2UsIG1lc3NhZ2UgfSk7XG5cdH1cblxuXHQvKipcblx0ICogTWFya3MgdGhlIHRhc2sgaW4gdGhlIHRlc3QgcnVuIGNvbXBsZXRlLlxuXHQgKi9cblx0cHVibGljIG1hcmtUYXNrQ29tcGxldGUodGFza0lkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubXVzdEdldFRhc2tJbmRleCh0YXNrSWQpO1xuXHRcdGNvbnN0IHRhc2sgPSB0aGlzLnRhc2tzW2luZGV4XTtcblx0XHR0YXNrLnJ1bm5pbmcgPSBmYWxzZTtcblx0XHR0YXNrLm91dHB1dC5lbmQoKTtcblxuXHRcdHRoaXMuc2V0QWxsVG9TdGF0ZShcblx0XHRcdFRlc3RSZXN1bHRTdGF0ZS5Ta2lwcGVkLFxuXHRcdFx0dGFza0lkLFxuXHRcdFx0dCA9PiB0LnN0YXRlID09PSBUZXN0UmVzdWx0U3RhdGUuUXVldWVkIHx8IHQuc3RhdGUgPT09IFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nLFxuXHRcdCk7XG5cblx0XHR0aGlzLmVuZFRhc2tFbWl0dGVyLmZpcmUoaW5kZXgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vdGlmaWVzIHRoZSBzZXJ2aWNlIHRoYXQgYWxsIHRlc3RzIGFyZSBjb21wbGV0ZS5cblx0ICovXG5cdHB1YmxpYyBtYXJrQ29tcGxldGUoKSB7XG5cdFx0aWYgKHRoaXMuX2NvbXBsZXRlZEF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignY2Fubm90IGNvbXBsZXRlIGEgdGVzdCByZXN1bHQgbXVsdGlwbGUgdGltZXMnKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy50YXNrcykge1xuXHRcdFx0aWYgKHRhc2sucnVubmluZykge1xuXHRcdFx0XHR0aGlzLm1hcmtUYXNrQ29tcGxldGUodGFzay5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29tcGxldGVkQXQgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuY29tcGxldGVFbWl0dGVyLmZpcmUoKTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5LnB1YmxpY0xvZzI8XG5cdFx0XHR7IGZhaWx1cmVzOiBudW1iZXI7IHBhc3NlczogbnVtYmVyOyBjb250cm9sbGVyOiBzdHJpbmcgfSxcblx0XHRcdHtcblx0XHRcdFx0b3duZXI6ICdjb25ub3I0MzEyJztcblx0XHRcdFx0Y29tbWVudDogJ1Rlc3Qgb3V0Y29tZSBtZXRyaWNzLiBUaGlzIGhlbHBzIHVzIHVuZGVyc3RhbmQgbWFnbml0dWRlIG9mIGZlYXR1cmUgdXNlIGFuZCBob3cgdG8gYnVpbGQgZml4IHN1Z2dlc3Rpb25zLic7XG5cdFx0XHRcdGZhaWx1cmVzOiB7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgdGVzdCBmYWlsdXJlcyc7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnIH07XG5cdFx0XHRcdHBhc3NlczogeyBjb21tZW50OiAnTnVtYmVyIG9mIHRlc3QgZmFpbHVyZXMnOyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JyB9O1xuXHRcdFx0XHRjb250cm9sbGVyOiB7IGNvbW1lbnQ6ICdUaGUgdGVzdCBjb250cm9sbGVyIGJlaW5nIHVzZWQnOyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JyB9O1xuXHRcdFx0fVxuXHRcdD4oJ3Rlc3Qub3V0Y29tZXMnLCB7XG5cdFx0XHRmYWlsdXJlczogdGhpcy5jb3VudHNbVGVzdFJlc3VsdFN0YXRlLkVycm9yZWRdICsgdGhpcy5jb3VudHNbVGVzdFJlc3VsdFN0YXRlLkZhaWxlZF0sXG5cdFx0XHRwYXNzZXM6IHRoaXMuY291bnRzW1Rlc3RSZXN1bHRTdGF0ZS5QYXNzZWRdLFxuXHRcdFx0Y29udHJvbGxlcjogdGhpcy5yZXF1ZXN0LnRhcmdldHMubWFwKHQgPT4gdC5jb250cm9sbGVySWQpLmpvaW4oJywnKVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSB0ZXN0IGFuZCBhbGwgb2YgaXRzIGNoaWxkcmVuIGluIHRoZSBydW4gYXMgcmV0aXJlZC5cblx0ICovXG5cdHB1YmxpYyBtYXJrUmV0aXJlZCh0ZXN0SWRzOiBXZWxsRGVmaW5lZFByZWZpeFRyZWU8dW5kZWZpbmVkPiB8IHVuZGVmaW5lZCkge1xuXHRcdGZvciAoY29uc3QgW2lkLCB0ZXN0XSBvZiB0aGlzLnRlc3RCeUlkKSB7XG5cdFx0XHRpZiAoIXRlc3QucmV0aXJlZCAmJiAoIXRlc3RJZHMgfHwgdGVzdElkcy5oYXNLZXlPclBhcmVudChUZXN0SWQuZnJvbVN0cmluZyhpZCkucGF0aCkpKSB7XG5cdFx0XHRcdHRlc3QucmV0aXJlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuY2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Db21wdXRlZFN0YXRlQ2hhbmdlLCBpdGVtOiB0ZXN0LCByZXN1bHQ6IHRoaXMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgdG9KU09OKCk6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbXBsZXRlZEF0ICYmIHRoaXMucGVyc2lzdCA/IHRoaXMuZG9TZXJpYWxpemUudmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgdG9KU09OV2l0aE1lc3NhZ2VzKCk6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbXBsZXRlZEF0ICYmIHRoaXMucGVyc2lzdCA/IHRoaXMuZG9TZXJpYWxpemVXaXRoTWVzc2FnZXMudmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyBhbGwgdGVzdHMgaW4gdGhlIGNvbGxlY3Rpb24gdG8gdGhlIGdpdmVuIHN0YXRlLlxuXHQgKi9cblx0cHJvdGVjdGVkIHNldEFsbFRvU3RhdGUoc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZSwgdGFza0lkOiBzdHJpbmcsIHdoZW46ICh0YXNrOiBJVGVzdFRhc2tTdGF0ZSwgaXRlbTogVGVzdFJlc3VsdEl0ZW0pID0+IGJvb2xlYW4pIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubXVzdEdldFRhc2tJbmRleCh0YXNrSWQpO1xuXHRcdGZvciAoY29uc3QgdGVzdCBvZiB0aGlzLnRlc3RCeUlkLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAod2hlbih0ZXN0LnRhc2tzW2luZGV4XSwgdGVzdCkpIHtcblx0XHRcdFx0dGhpcy5maXJlVXBkYXRlQW5kUmVmcmVzaCh0ZXN0LCBpbmRleCwgc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmlyZVVwZGF0ZUFuZFJlZnJlc2goZW50cnk6IFRlc3RSZXN1bHRJdGVtLCB0YXNrSW5kZXg6IG51bWJlciwgbmV3U3RhdGU6IFRlc3RSZXN1bHRTdGF0ZSwgbmV3T3duRHVyYXRpb24/OiBudW1iZXIpIHtcblx0XHRjb25zdCBwcmV2aW91c093bkNvbXB1dGVkID0gZW50cnkub3duQ29tcHV0ZWRTdGF0ZTtcblx0XHRjb25zdCBwcmV2aW91c093bkR1cmF0aW9uID0gZW50cnkub3duRHVyYXRpb247XG5cdFx0Y29uc3QgY2hhbmdlRXZlbnQ6IFRlc3RSZXN1bHRJdGVtQ2hhbmdlID0ge1xuXHRcdFx0aXRlbTogZW50cnksXG5cdFx0XHRyZXN1bHQ6IHRoaXMsXG5cdFx0XHRyZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlLFxuXHRcdFx0cHJldmlvdXNTdGF0ZTogcHJldmlvdXNPd25Db21wdXRlZCxcblx0XHRcdHByZXZpb3VzT3duRHVyYXRpb246IHByZXZpb3VzT3duRHVyYXRpb24sXG5cdFx0fTtcblxuXHRcdGVudHJ5LnRhc2tzW3Rhc2tJbmRleF0uc3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRpZiAobmV3T3duRHVyYXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cnkudGFza3NbdGFza0luZGV4XS5kdXJhdGlvbiA9IG5ld093bkR1cmF0aW9uO1xuXHRcdFx0ZW50cnkub3duRHVyYXRpb24gPSBNYXRoLm1heChlbnRyeS5vd25EdXJhdGlvbiB8fCAwLCBuZXdPd25EdXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3T3duQ29tcHV0ZWQgPSBtYXhQcmlvcml0eSguLi5lbnRyeS50YXNrcy5tYXAodCA9PiB0LnN0YXRlKSk7XG5cdFx0aWYgKG5ld093bkNvbXB1dGVkID09PSBwcmV2aW91c093bkNvbXB1dGVkKSB7XG5cdFx0XHRpZiAobmV3T3duRHVyYXRpb24gIT09IHByZXZpb3VzT3duRHVyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoY2hhbmdlRXZlbnQpOyAvLyBmaXJlIG1hbnVhbGx5IHNpbmNlIHN0YXRlIGNoYW5nZSB3b24ndCBkbyBpdFxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVudHJ5Lm93bkNvbXB1dGVkU3RhdGUgPSBuZXdPd25Db21wdXRlZDtcblx0XHR0aGlzLmNvdW50c1twcmV2aW91c093bkNvbXB1dGVkXS0tO1xuXHRcdHRoaXMuY291bnRzW25ld093bkNvbXB1dGVkXSsrO1xuXHRcdHJlZnJlc2hDb21wdXRlZFN0YXRlKHRoaXMuY29tcHV0ZWRTdGF0ZUFjY2Vzc29yLCBlbnRyeSkuZm9yRWFjaCh0ID0+XG5cdFx0XHR0aGlzLmNoYW5nZUVtaXR0ZXIuZmlyZSh0ID09PSBlbnRyeSA/IGNoYW5nZUV2ZW50IDoge1xuXHRcdFx0XHRpdGVtOiB0LFxuXHRcdFx0XHRyZXN1bHQ6IHRoaXMsXG5cdFx0XHRcdHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uQ29tcHV0ZWRTdGF0ZUNoYW5nZSxcblx0XHRcdH0pLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFRlc3RUb1J1bihjb250cm9sbGVySWQ6IHN0cmluZywgaXRlbTogSVRlc3RJdGVtLCBwYXJlbnQ6IHN0cmluZyB8IG51bGwpIHtcblx0XHRjb25zdCBub2RlID0gaXRlbVRvTm9kZShjb250cm9sbGVySWQsIGl0ZW0sIHBhcmVudCk7XG5cdFx0dGhpcy50ZXN0QnlJZC5zZXQoaXRlbS5leHRJZCwgbm9kZSk7XG5cdFx0dGhpcy5jb3VudHNbVGVzdFJlc3VsdFN0YXRlLlVuc2V0XSsrO1xuXG5cdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0dGhpcy50ZXN0QnlJZC5nZXQocGFyZW50KT8uY2hpbGRyZW4ucHVzaChub2RlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50YXNrcy5sZW5ndGgpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy50YXNrcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRub2RlLnRhc2tzLnB1c2goeyBkdXJhdGlvbjogdW5kZWZpbmVkLCBtZXNzYWdlczogW10sIHN0YXRlOiBUZXN0UmVzdWx0U3RhdGUuVW5zZXQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRwcml2YXRlIG11c3RHZXRUYXNrSW5kZXgodGFza0lkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMudGFza3MuZmluZEluZGV4KHQgPT4gdC5pZCA9PT0gdGFza0lkKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdGFzayAke3Rhc2tJZH0gaW4gdXBkYXRlU3RhdGVgKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGRvU2VyaWFsaXplID0gbmV3IExhenkoKCk6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMgPT4gKHtcblx0XHRpZDogdGhpcy5pZCxcblx0XHRjb21wbGV0ZWRBdDogdGhpcy5jb21wbGV0ZWRBdCEsXG5cdFx0dGFza3M6IHRoaXMudGFza3MubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIG5hbWU6IHQubmFtZSwgY3RybElkOiB0LmN0cmxJZCwgaGFzQ292ZXJhZ2U6ICEhdC5jb3ZlcmFnZS5nZXQoKSB9KSksXG5cdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdHJlcXVlc3Q6IHRoaXMucmVxdWVzdCxcblx0XHRpdGVtczogWy4uLnRoaXMudGVzdEJ5SWQudmFsdWVzKCldLm1hcChUZXN0UmVzdWx0SXRlbS5zZXJpYWxpemVXaXRob3V0TWVzc2FnZXMpLFxuXHR9KSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkb1NlcmlhbGl6ZVdpdGhNZXNzYWdlcyA9IG5ldyBMYXp5KCgpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzID0+ICh7XG5cdFx0aWQ6IHRoaXMuaWQsXG5cdFx0Y29tcGxldGVkQXQ6IHRoaXMuY29tcGxldGVkQXQhLFxuXHRcdHRhc2tzOiB0aGlzLnRhc2tzLm1hcCh0ID0+ICh7IGlkOiB0LmlkLCBuYW1lOiB0Lm5hbWUsIGN0cmxJZDogdC5jdHJsSWQsIGhhc0NvdmVyYWdlOiAhIXQuY292ZXJhZ2UuZ2V0KCkgfSkpLFxuXHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRyZXF1ZXN0OiB0aGlzLnJlcXVlc3QsXG5cdFx0aXRlbXM6IFsuLi50aGlzLnRlc3RCeUlkLnZhbHVlcygpXS5tYXAoVGVzdFJlc3VsdEl0ZW0uc2VyaWFsaXplKSxcblx0fSkpO1xufVxuXG4vKipcbiAqIFRlc3QgcmVzdWx0cyBoeWRyYXRlZCBmcm9tIGEgcHJldmlvdXNseS1zZXJpYWxpemVkIHRlc3QgcnVuLlxuICovXG5leHBvcnQgY2xhc3MgSHlkcmF0ZWRUZXN0UmVzdWx0IGltcGxlbWVudHMgSVRlc3RSZXN1bHQge1xuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBjb3VudHMgPSBtYWtlRW1wdHlDb3VudHMoKTtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNvbXBsZXRlZEF0OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgdGFza3M6IElUZXN0UnVuVGFza1Jlc3VsdHNbXTtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXQgdGVzdHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMudGVzdEJ5SWQudmFsdWVzKCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVxdWVzdDogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRlc3RCeUlkID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RSZXN1bHRJdGVtPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkZW50aXR5OiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VyaWFsaXplZDogSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBlcnNpc3QgPSB0cnVlLFxuXHQpIHtcblx0XHR0aGlzLmlkID0gc2VyaWFsaXplZC5pZDtcblx0XHR0aGlzLmNvbXBsZXRlZEF0ID0gc2VyaWFsaXplZC5jb21wbGV0ZWRBdDtcblx0XHR0aGlzLnRhc2tzID0gc2VyaWFsaXplZC50YXNrcy5tYXAoKHRhc2ssIGkpID0+ICh7XG5cdFx0XHRpZDogdGFzay5pZCxcblx0XHRcdG5hbWU6IHRhc2submFtZSB8fCBsb2NhbGl6ZSgndGVzdFVubmFtZWRUYXNrJywgJ1VubmFtZWQgVGFzaycpLFxuXHRcdFx0Y3RybElkOiB0YXNrLmN0cmxJZCxcblx0XHRcdHJ1bm5pbmc6IGZhbHNlLFxuXHRcdFx0Y292ZXJhZ2U6IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpLFxuXHRcdFx0b3V0cHV0OiBlbXB0eVJhd091dHB1dCxcblx0XHRcdG90aGVyTWVzc2FnZXM6IFtdXG5cdFx0fSkpO1xuXHRcdHRoaXMubmFtZSA9IHNlcmlhbGl6ZWQubmFtZTtcblx0XHR0aGlzLnJlcXVlc3QgPSBzZXJpYWxpemVkLnJlcXVlc3Q7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygc2VyaWFsaXplZC5pdGVtcykge1xuXHRcdFx0Y29uc3QgZGUgPSBUZXN0UmVzdWx0SXRlbS5kZXNlcmlhbGl6ZShpZGVudGl0eSwgaXRlbSk7XG5cdFx0XHR0aGlzLmNvdW50c1tkZS5vd25Db21wdXRlZFN0YXRlXSsrO1xuXHRcdFx0dGhpcy50ZXN0QnlJZC5zZXQoaXRlbS5pdGVtLmV4dElkLCBkZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0U3RhdGVCeUlkKGV4dFRlc3RJZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMudGVzdEJ5SWQuZ2V0KGV4dFRlc3RJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyB0b0pTT04oKTogSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucGVyc2lzdCA/IHRoaXMuc2VyaWFsaXplZCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHRvSlNPTldpdGhNZXNzYWdlcygpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0pTT04oKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNkJBQTZC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SUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQkFBaUIsUUFBZ0I7QUFDeEMsVUFBTSxRQUFRLEtBQUssTUFBTSxVQUFVLE9BQUssRUFBRSxPQUFPLE1BQU07QUFDdkQsUUFBSSxVQUFVLElBQUk7QUFDakIsWUFBTSxJQUFJLE1BQU0sZ0JBQWdCLE1BQU0saUJBQWlCO0FBQUEsSUFDeEQ7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQW1CRDtBQTNWYSxpQkFBTjtBQUFBLEVBaUVKO0FBQUEsR0FqRVU7QUFnV04sTUFBTSxtQkFBMEM7QUFBQSxFQXdDdEQsWUFDQyxVQUNpQixZQUNBLFVBQVUsTUFDMUI7QUFGZ0I7QUFDQTtBQXZDbEI7QUFBQTtBQUFBO0FBQUEsU0FBZ0IsU0FBUyxnQkFBZ0I7QUFrQ3pDLFNBQWlCLFdBQVcsb0JBQUksSUFBNEI7QUFPM0QsU0FBSyxLQUFLLFdBQVc7QUFDckIsU0FBSyxjQUFjLFdBQVc7QUFDOUIsU0FBSyxRQUFRLFdBQVcsTUFBTSxJQUFJLENBQUMsTUFBTSxPQUFPO0FBQUEsTUFDL0MsSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNLEtBQUssUUFBUSxTQUFTLG1CQUFtQixjQUFjO0FBQUEsTUFDN0QsUUFBUSxLQUFLO0FBQUEsTUFDYixTQUFTO0FBQUEsTUFDVCxVQUFVLGdCQUFnQixNQUFNLE1BQVM7QUFBQSxNQUN6QyxRQUFRO0FBQUEsTUFDUixlQUFlLENBQUM7QUFBQSxJQUNqQixFQUFFO0FBQ0YsU0FBSyxPQUFPLFdBQVc7QUFDdkIsU0FBSyxVQUFVLFdBQVc7QUFFMUIsZUFBVyxRQUFRLFdBQVcsT0FBTztBQUNwQyxZQUFNLEtBQUssZUFBZSxZQUFZLFVBQVUsSUFBSTtBQUNwRCxXQUFLLE9BQU8sR0FBRyxnQkFBZ0I7QUFDL0IsV0FBSyxTQUFTLElBQUksS0FBSyxLQUFLLE9BQU8sRUFBRTtBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBeENBLElBQVcsUUFBUTtBQUNsQixXQUFPLEtBQUssU0FBUyxPQUFPO0FBQUEsRUFDN0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQTJDTyxhQUFhLFdBQW1CO0FBQ3RDLFdBQU8sS0FBSyxTQUFTLElBQUksU0FBUztBQUFBLEVBQ25DO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxTQUE2QztBQUNuRCxXQUFPLEtBQUssVUFBVSxLQUFLLGFBQWE7QUFBQSxFQUN6QztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08scUJBQXlEO0FBQy9ELFdBQU8sS0FBSyxPQUFPO0FBQUEsRUFDcEI7QUFDRDsiLAogICJuYW1lcyI6IFsiVHJpbUJ5dGVzIiwgIlRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uIl0KfQo=
