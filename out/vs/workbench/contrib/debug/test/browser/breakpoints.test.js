import assert from "assert";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { dispose } from "../../../../../base/common/lifecycle.js";
import { URI as uri } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { OverviewRulerLane } from "../../../../../editor/common/model.js";
import { LanguageService } from "../../../../../editor/common/services/languageService.js";
import { createTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { createBreakpointDecorations } from "../../browser/breakpointEditorContribution.js";
import { getBreakpointMessageAndIcon, getExpandedBodySize } from "../../browser/breakpointsView.js";
import { DataBreakpointSetType, IDebugService, State } from "../../common/debug.js";
import { Breakpoint, DebugModel } from "../../common/debugModel.js";
import { createTestSession } from "./callStack.test.js";
import { createMockDebugModel, mockUriIdentityService } from "./mockDebugModel.js";
import { MockDebugService, MockDebugStorage } from "../common/mockDebug.js";
import { MockLabelService } from "../../../../services/label/test/common/mockLabelService.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
function addBreakpointsAndCheckEvents(model, uri2, data) {
  let eventCount = 0;
  const toDispose = model.onDidChangeBreakpoints((e) => {
    assert.strictEqual(e?.sessionOnly, false);
    assert.strictEqual(e?.changed, void 0);
    assert.strictEqual(e?.removed, void 0);
    const added = e?.added;
    assert.notStrictEqual(added, void 0);
    assert.strictEqual(added.length, data.length);
    eventCount++;
    dispose(toDispose);
    for (let i = 0; i < data.length; i++) {
      assert.strictEqual(e.added[i] instanceof Breakpoint, true);
      assert.strictEqual(e.added[i].lineNumber, data[i].lineNumber);
    }
  });
  const bps = model.addBreakpoints(uri2, data);
  assert.strictEqual(eventCount, 1);
  return bps;
}
suite("Debug - Breakpoints", () => {
  let model;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    model = createMockDebugModel(disposables);
  });
  test("simple", () => {
    const modelUri = uri.file("/myfolder/myfile.js");
    addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
    assert.strictEqual(model.areBreakpointsActivated(), true);
    assert.strictEqual(model.getBreakpoints().length, 2);
    let eventCount = 0;
    const toDispose = model.onDidChangeBreakpoints((e) => {
      eventCount++;
      assert.strictEqual(e?.added, void 0);
      assert.strictEqual(e?.sessionOnly, false);
      assert.strictEqual(e?.removed?.length, 2);
      assert.strictEqual(e?.changed, void 0);
      dispose(toDispose);
    });
    model.removeBreakpoints(model.getBreakpoints());
    assert.strictEqual(eventCount, 1);
    assert.strictEqual(model.getBreakpoints().length, 0);
  });
  test("toggling", () => {
    const modelUri = uri.file("/myfolder/myfile.js");
    addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
    addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 12, enabled: true, condition: "fake condition" }]);
    assert.strictEqual(model.getBreakpoints().length, 3);
    const bp = model.getBreakpoints().pop();
    if (bp) {
      model.removeBreakpoints([bp]);
    }
    assert.strictEqual(model.getBreakpoints().length, 2);
    model.setBreakpointsActivated(false);
    assert.strictEqual(model.areBreakpointsActivated(), false);
    model.setBreakpointsActivated(true);
    assert.strictEqual(model.areBreakpointsActivated(), true);
  });
  test("two files", () => {
    const modelUri1 = uri.file("/myfolder/my file first.js");
    const modelUri2 = uri.file("/secondfolder/second/second file.js");
    addBreakpointsAndCheckEvents(model, modelUri1, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
    assert.strictEqual(getExpandedBodySize(model, void 0, 9), 44);
    addBreakpointsAndCheckEvents(model, modelUri2, [{ lineNumber: 1, enabled: true }, { lineNumber: 2, enabled: true }, { lineNumber: 3, enabled: false }]);
    assert.strictEqual(getExpandedBodySize(model, void 0, 9), 110);
    assert.strictEqual(model.getBreakpoints().length, 5);
    assert.strictEqual(model.getBreakpoints({ uri: modelUri1 }).length, 2);
    assert.strictEqual(model.getBreakpoints({ uri: modelUri2 }).length, 3);
    assert.strictEqual(model.getBreakpoints({ lineNumber: 5 }).length, 1);
    assert.strictEqual(model.getBreakpoints({ column: 5 }).length, 0);
    const bp = model.getBreakpoints()[0];
    const update = /* @__PURE__ */ new Map();
    update.set(bp.getId(), { lineNumber: 100 });
    let eventFired = false;
    const toDispose = model.onDidChangeBreakpoints((e) => {
      eventFired = true;
      assert.strictEqual(e?.added, void 0);
      assert.strictEqual(e?.removed, void 0);
      assert.strictEqual(e?.changed?.length, 1);
      dispose(toDispose);
    });
    model.updateBreakpoints(update);
    assert.strictEqual(eventFired, true);
    assert.strictEqual(bp.lineNumber, 100);
    assert.strictEqual(model.getBreakpoints({ enabledOnly: true }).length, 3);
    model.enableOrDisableAllBreakpoints(false);
    model.getBreakpoints().forEach((bp2) => {
      assert.strictEqual(bp2.enabled, false);
    });
    assert.strictEqual(model.getBreakpoints({ enabledOnly: true }).length, 0);
    model.setEnablement(bp, true);
    assert.strictEqual(bp.enabled, true);
    model.removeBreakpoints(model.getBreakpoints({ uri: modelUri1 }));
    assert.strictEqual(getExpandedBodySize(model, void 0, 9), 66);
    assert.strictEqual(model.getBreakpoints().length, 3);
  });
  test("conditions", () => {
    const modelUri1 = uri.file("/myfolder/my file first.js");
    addBreakpointsAndCheckEvents(model, modelUri1, [{ lineNumber: 5, condition: "i < 5", hitCondition: "17" }, { lineNumber: 10, condition: "j < 3" }]);
    const breakpoints = model.getBreakpoints();
    assert.strictEqual(breakpoints[0].condition, "i < 5");
    assert.strictEqual(breakpoints[0].hitCondition, "17");
    assert.strictEqual(breakpoints[1].condition, "j < 3");
    assert.strictEqual(!!breakpoints[1].hitCondition, false);
    assert.strictEqual(model.getBreakpoints().length, 2);
    model.removeBreakpoints(model.getBreakpoints());
    assert.strictEqual(model.getBreakpoints().length, 0);
  });
  test("function breakpoints", () => {
    model.addFunctionBreakpoint({ name: "foo" }, "1");
    model.addFunctionBreakpoint({ name: "bar" }, "2");
    model.updateFunctionBreakpoint("1", { name: "fooUpdated" });
    model.updateFunctionBreakpoint("2", { name: "barUpdated" });
    const functionBps = model.getFunctionBreakpoints();
    assert.strictEqual(functionBps[0].name, "fooUpdated");
    assert.strictEqual(functionBps[1].name, "barUpdated");
    model.removeFunctionBreakpoints();
    assert.strictEqual(model.getFunctionBreakpoints().length, 0);
  });
  test("multiple sessions", () => {
    const modelUri = uri.file("/myfolder/myfile.js");
    addBreakpointsAndCheckEvents(model, modelUri, [{ lineNumber: 5, enabled: true, condition: "x > 5" }, { lineNumber: 10, enabled: false }]);
    const breakpoints = model.getBreakpoints();
    const session = disposables.add(createTestSession(model));
    const data = /* @__PURE__ */ new Map();
    assert.strictEqual(breakpoints[0].lineNumber, 5);
    assert.strictEqual(breakpoints[1].lineNumber, 10);
    data.set(breakpoints[0].getId(), { verified: false, line: 10 });
    data.set(breakpoints[1].getId(), { verified: true, line: 50 });
    model.setBreakpointSessionData(session.getId(), {}, data);
    assert.strictEqual(breakpoints[0].lineNumber, 5);
    assert.strictEqual(breakpoints[1].lineNumber, 50);
    const session2 = disposables.add(createTestSession(model));
    const data2 = /* @__PURE__ */ new Map();
    data2.set(breakpoints[0].getId(), { verified: true, line: 100 });
    data2.set(breakpoints[1].getId(), { verified: true, line: 500 });
    model.setBreakpointSessionData(session2.getId(), {}, data2);
    assert.strictEqual(breakpoints[0].lineNumber, 100);
    assert.strictEqual(breakpoints[1].lineNumber, 10);
    model.setBreakpointSessionData(session.getId(), {}, void 0);
    assert.strictEqual(breakpoints[0].lineNumber, 100);
    assert.strictEqual(breakpoints[1].lineNumber, 500);
    assert.strictEqual(breakpoints[0].supported, false);
    const data3 = /* @__PURE__ */ new Map();
    data3.set(breakpoints[0].getId(), { verified: true, line: 500 });
    model.setBreakpointSessionData(session2.getId(), { supportsConditionalBreakpoints: true }, data2);
    assert.strictEqual(breakpoints[0].supported, true);
  });
  test("exception breakpoints", () => {
    let eventCount = 0;
    disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
    model.setExceptionBreakpointsForSession("session-id-1", [{ filter: "uncaught", label: "UNCAUGHT", default: true }]);
    assert.strictEqual(eventCount, 1);
    let exceptionBreakpoints = model.getExceptionBreakpointsForSession("session-id-1");
    assert.strictEqual(exceptionBreakpoints.length, 1);
    assert.strictEqual(exceptionBreakpoints[0].filter, "uncaught");
    assert.strictEqual(exceptionBreakpoints[0].enabled, true);
    model.setExceptionBreakpointsForSession("session-id-2", [{ filter: "uncaught", label: "UNCAUGHT" }, { filter: "caught", label: "CAUGHT" }]);
    assert.strictEqual(eventCount, 2);
    exceptionBreakpoints = model.getExceptionBreakpointsForSession("session-id-2");
    assert.strictEqual(exceptionBreakpoints.length, 2);
    assert.strictEqual(exceptionBreakpoints[0].filter, "uncaught");
    assert.strictEqual(exceptionBreakpoints[0].enabled, true);
    assert.strictEqual(exceptionBreakpoints[1].filter, "caught");
    assert.strictEqual(exceptionBreakpoints[1].label, "CAUGHT");
    assert.strictEqual(exceptionBreakpoints[1].enabled, false);
    model.setExceptionBreakpointsForSession("session-id-3", [{ filter: "all", label: "ALL" }]);
    assert.strictEqual(eventCount, 3);
    assert.strictEqual(model.getExceptionBreakpointsForSession("session-id-3").length, 1);
    exceptionBreakpoints = model.getExceptionBreakpoints();
    assert.strictEqual(exceptionBreakpoints[0].filter, "uncaught");
    assert.strictEqual(exceptionBreakpoints[0].enabled, true);
    assert.strictEqual(exceptionBreakpoints[1].filter, "caught");
    assert.strictEqual(exceptionBreakpoints[1].label, "CAUGHT");
    assert.strictEqual(exceptionBreakpoints[1].enabled, false);
    assert.strictEqual(exceptionBreakpoints[2].filter, "all");
    assert.strictEqual(exceptionBreakpoints[2].label, "ALL");
  });
  test("exception breakpoints multiple sessions", () => {
    let eventCount = 0;
    disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
    model.setExceptionBreakpointsForSession("session-id-4", [{ filter: "uncaught", label: "UNCAUGHT", default: true }, { filter: "caught", label: "CAUGHT" }]);
    model.setExceptionBreakpointFallbackSession("session-id-4");
    assert.strictEqual(eventCount, 1);
    let exceptionBreakpointsForSession = model.getExceptionBreakpointsForSession("session-id-4");
    assert.strictEqual(exceptionBreakpointsForSession.length, 2);
    assert.strictEqual(exceptionBreakpointsForSession[0].filter, "uncaught");
    assert.strictEqual(exceptionBreakpointsForSession[1].filter, "caught");
    model.setExceptionBreakpointsForSession("session-id-5", [{ filter: "all", label: "ALL" }, { filter: "caught", label: "CAUGHT" }]);
    assert.strictEqual(eventCount, 2);
    exceptionBreakpointsForSession = model.getExceptionBreakpointsForSession("session-id-5");
    let exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(void 0);
    assert.strictEqual(exceptionBreakpointsForSession.length, 2);
    assert.strictEqual(exceptionBreakpointsForSession[0].filter, "caught");
    assert.strictEqual(exceptionBreakpointsForSession[1].filter, "all");
    assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
    assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, "uncaught");
    assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, "caught");
    model.removeExceptionBreakpointsForSession("session-id-4");
    assert.strictEqual(eventCount, 2);
    exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(void 0);
    assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
    assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, "uncaught");
    assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, "caught");
    model.setExceptionBreakpointFallbackSession("session-id-5");
    assert.strictEqual(eventCount, 2);
    exceptionBreakpointsForUndefined = model.getExceptionBreakpointsForSession(void 0);
    assert.strictEqual(exceptionBreakpointsForUndefined.length, 2);
    assert.strictEqual(exceptionBreakpointsForUndefined[0].filter, "caught");
    assert.strictEqual(exceptionBreakpointsForUndefined[1].filter, "all");
    const exceptionBreakpoints = model.getExceptionBreakpoints();
    assert.strictEqual(exceptionBreakpoints.length, 3);
  });
  test("instruction breakpoints", () => {
    let eventCount = 0;
    disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
    model.addInstructionBreakpoint({ instructionReference: "0xCCCCFFFF", offset: 0, address: 0n, canPersist: false });
    assert.strictEqual(eventCount, 1);
    let instructionBreakpoints = model.getInstructionBreakpoints();
    assert.strictEqual(instructionBreakpoints.length, 1);
    assert.strictEqual(instructionBreakpoints[0].instructionReference, "0xCCCCFFFF");
    assert.strictEqual(instructionBreakpoints[0].offset, 0);
    model.addInstructionBreakpoint({ instructionReference: "0xCCCCEEEE", offset: 1, address: 0n, canPersist: false });
    assert.strictEqual(eventCount, 2);
    instructionBreakpoints = model.getInstructionBreakpoints();
    assert.strictEqual(instructionBreakpoints.length, 2);
    assert.strictEqual(instructionBreakpoints[0].instructionReference, "0xCCCCFFFF");
    assert.strictEqual(instructionBreakpoints[0].offset, 0);
    assert.strictEqual(instructionBreakpoints[1].instructionReference, "0xCCCCEEEE");
    assert.strictEqual(instructionBreakpoints[1].offset, 1);
  });
  test("data breakpoints", () => {
    let eventCount = 0;
    disposables.add(model.onDidChangeBreakpoints(() => eventCount++));
    model.addDataBreakpoint({ description: "label", src: { type: DataBreakpointSetType.Variable, dataId: "id" }, canPersist: true, accessTypes: ["read"], accessType: "read" }, "1");
    model.addDataBreakpoint({ description: "second", src: { type: DataBreakpointSetType.Variable, dataId: "secondId" }, canPersist: false, accessTypes: ["readWrite"], accessType: "readWrite" }, "2");
    model.updateDataBreakpoint("1", { condition: "aCondition" });
    model.updateDataBreakpoint("2", { hitCondition: "10" });
    const dataBreakpoints = model.getDataBreakpoints();
    assert.strictEqual(dataBreakpoints[0].canPersist, true);
    assert.deepStrictEqual(dataBreakpoints[0].src, { type: DataBreakpointSetType.Variable, dataId: "id" });
    assert.strictEqual(dataBreakpoints[0].accessType, "read");
    assert.strictEqual(dataBreakpoints[0].condition, "aCondition");
    assert.strictEqual(dataBreakpoints[1].canPersist, false);
    assert.strictEqual(dataBreakpoints[1].description, "second");
    assert.strictEqual(dataBreakpoints[1].accessType, "readWrite");
    assert.strictEqual(dataBreakpoints[1].hitCondition, "10");
    assert.strictEqual(eventCount, 4);
    model.removeDataBreakpoints(dataBreakpoints[0].getId());
    assert.strictEqual(eventCount, 5);
    assert.strictEqual(model.getDataBreakpoints().length, 1);
    model.removeDataBreakpoints();
    assert.strictEqual(model.getDataBreakpoints().length, 0);
    assert.strictEqual(eventCount, 6);
  });
  test("message and class name", () => {
    const modelUri = uri.file("/myfolder/my file first.js");
    addBreakpointsAndCheckEvents(model, modelUri, [
      { lineNumber: 5, enabled: true, condition: "x > 5" },
      { lineNumber: 10, enabled: false },
      { lineNumber: 12, enabled: true, logMessage: "hello" },
      { lineNumber: 15, enabled: true, hitCondition: "12" },
      { lineNumber: 500, enabled: true }
    ]);
    const breakpoints = model.getBreakpoints();
    const ls = new MockLabelService();
    let result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[0], ls, model);
    assert.strictEqual(result.message, "Condition: x > 5");
    assert.strictEqual(result.icon.id, "debug-breakpoint-conditional");
    result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[1], ls, model);
    assert.strictEqual(result.message, "Disabled Breakpoint");
    assert.strictEqual(result.icon.id, "debug-breakpoint-disabled");
    result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[2], ls, model);
    assert.strictEqual(result.message, "Log Message: hello");
    assert.strictEqual(result.icon.id, "debug-breakpoint-log");
    result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[3], ls, model);
    assert.strictEqual(result.message, "Hit Count: 12");
    assert.strictEqual(result.icon.id, "debug-breakpoint-conditional");
    result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[4], ls, model);
    assert.strictEqual(result.message, ls.getUriLabel(breakpoints[4].uri));
    assert.strictEqual(result.icon.id, "debug-breakpoint");
    result = getBreakpointMessageAndIcon(State.Stopped, false, breakpoints[2], ls, model);
    assert.strictEqual(result.message, "Disabled Logpoint");
    assert.strictEqual(result.icon.id, "debug-breakpoint-log-disabled");
    model.addDataBreakpoint({ description: "label", canPersist: true, accessTypes: ["read"], accessType: "read", src: { type: DataBreakpointSetType.Variable, dataId: "id" } });
    const dataBreakpoints = model.getDataBreakpoints();
    result = getBreakpointMessageAndIcon(State.Stopped, true, dataBreakpoints[0], ls, model);
    assert.strictEqual(result.message, "Data Breakpoint");
    assert.strictEqual(result.icon.id, "debug-breakpoint-data");
    const functionBreakpoint = model.addFunctionBreakpoint({ name: "foo" }, "1");
    result = getBreakpointMessageAndIcon(State.Stopped, true, functionBreakpoint, ls, model);
    assert.strictEqual(result.message, "Function Breakpoint");
    assert.strictEqual(result.icon.id, "debug-breakpoint-function");
    const data = /* @__PURE__ */ new Map();
    data.set(breakpoints[0].getId(), { verified: false, line: 10 });
    data.set(breakpoints[1].getId(), { verified: true, line: 50 });
    data.set(breakpoints[2].getId(), { verified: true, line: 50, message: "world" });
    data.set(functionBreakpoint.getId(), { verified: true });
    model.setBreakpointSessionData("mocksessionid", { supportsFunctionBreakpoints: false, supportsDataBreakpoints: true, supportsLogPoints: true }, data);
    result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[0], ls, model);
    assert.strictEqual(result.message, "Unverified Breakpoint");
    assert.strictEqual(result.icon.id, "debug-breakpoint-unverified");
    result = getBreakpointMessageAndIcon(State.Stopped, true, functionBreakpoint, ls, model);
    assert.strictEqual(result.message, "Function breakpoints not supported by this debug type");
    assert.strictEqual(result.icon.id, "debug-breakpoint-function-unverified");
    result = getBreakpointMessageAndIcon(State.Stopped, true, breakpoints[2], ls, model);
    assert.strictEqual(result.message, "Log Message: hello, world");
    assert.strictEqual(result.icon.id, "debug-breakpoint-log");
  });
  test("decorations", () => {
    const modelUri = uri.file("/myfolder/my file first.js");
    const languageId = "testMode";
    const textModel = createTextModel(
      ["this is line one", "this is line two", "    this is line three it has whitespace at start", "this is line four", "this is line five"].join("\n"),
      languageId
    );
    addBreakpointsAndCheckEvents(model, modelUri, [
      { lineNumber: 1, enabled: true, condition: "x > 5" },
      { lineNumber: 2, column: 4, enabled: false },
      { lineNumber: 3, enabled: true, logMessage: "hello" },
      { lineNumber: 500, enabled: true }
    ]);
    const breakpoints = model.getBreakpoints();
    const instantiationService = new TestInstantiationService();
    const debugService = new MockDebugService();
    debugService.getModel = () => model;
    instantiationService.stub(IDebugService, debugService);
    instantiationService.stub(ILabelService, new MockLabelService());
    instantiationService.stub(ILanguageService, disposables.add(new LanguageService()));
    let decorations = instantiationService.invokeFunction((accessor) => createBreakpointDecorations(accessor, textModel, breakpoints, State.Running, true, true));
    assert.strictEqual(decorations.length, 3);
    assert.deepStrictEqual(decorations[0].range, new Range(1, 1, 1, 2));
    assert.deepStrictEqual(decorations[1].range, new Range(2, 4, 2, 5));
    assert.deepStrictEqual(decorations[2].range, new Range(3, 5, 3, 6));
    assert.strictEqual(decorations[0].options.beforeContentClassName, void 0);
    assert.strictEqual(decorations[1].options.before?.inlineClassName, `debug-breakpoint-placeholder`);
    assert.strictEqual(decorations[0].options.overviewRuler?.position, OverviewRulerLane.Left);
    const expected = new MarkdownString(void 0, { isTrusted: true, supportThemeIcons: true }).appendCodeblock(languageId, "Condition: x > 5");
    assert.deepStrictEqual(decorations[0].options.glyphMarginHoverMessage, expected);
    decorations = instantiationService.invokeFunction((accessor) => createBreakpointDecorations(accessor, textModel, breakpoints, State.Running, true, false));
    assert.strictEqual(decorations[0].options.overviewRuler, null);
    textModel.dispose();
    instantiationService.dispose();
  });
  test("updates when storage changes", () => {
    const storage1 = disposables.add(new TestStorageService());
    const debugStorage1 = disposables.add(new MockDebugStorage(storage1));
    const model1 = disposables.add(new DebugModel(debugStorage1, { isDirty: (e) => false }, mockUriIdentityService, new NullLogService()));
    const modelUri = uri.file("/myfolder/my file first.js");
    const first = [
      { lineNumber: 1, enabled: true, condition: "x > 5" },
      { lineNumber: 2, column: 4, enabled: false }
    ];
    addBreakpointsAndCheckEvents(model1, modelUri, first);
    debugStorage1.storeBreakpoints(model1);
    const stored = storage1.get("debug.breakpoint", StorageScope.WORKSPACE);
    const storage2 = disposables.add(new TestStorageService());
    const model2 = disposables.add(new DebugModel(disposables.add(new MockDebugStorage(storage2)), { isDirty: (e) => false }, mockUriIdentityService, new NullLogService()));
    storage2.store(
      "debug.breakpoint",
      stored,
      StorageScope.WORKSPACE,
      StorageTarget.USER,
      /* external= */
      true
    );
    assert.deepStrictEqual(model2.getBreakpoints().map((b) => b.getId()), model1.getBreakpoints().map((b) => b.getId()));
    storage2.store(
      "debug.breakpoint",
      "[]",
      StorageScope.WORKSPACE,
      StorageTarget.USER,
      /* external= */
      false
    );
    assert.deepStrictEqual(model2.getBreakpoints().map((b) => b.getId()), model1.getBreakpoints().map((b) => b.getId()));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxicm93c2VyXFxicmVha3BvaW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJyZWFrcG9pbnREZWNvcmF0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24sIGdldEV4cGFuZGVkQm9keVNpemUgfSBmcm9tICcuLi8uLi9icm93c2VyL2JyZWFrcG9pbnRzVmlldy5qcyc7XG5pbXBvcnQgeyBEYXRhQnJlYWtwb2ludFNldFR5cGUsIElCcmVha3BvaW50RGF0YSwgSUJyZWFrcG9pbnRVcGRhdGVEYXRhLCBJRGVidWdTZXJ2aWNlLCBTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBCcmVha3BvaW50LCBEZWJ1Z01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdFNlc3Npb24gfSBmcm9tICcuL2NhbGxTdGFjay50ZXN0LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vY2tEZWJ1Z01vZGVsLCBtb2NrVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi9tb2NrRGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2NrRGVidWdTZXJ2aWNlLCBNb2NrRGVidWdTdG9yYWdlIH0gZnJvbSAnLi4vY29tbW9uL21vY2tEZWJ1Zy5qcyc7XG5pbXBvcnQgeyBNb2NrTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGFiZWwvdGVzdC9jb21tb24vbW9ja0xhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5mdW5jdGlvbiBhZGRCcmVha3BvaW50c0FuZENoZWNrRXZlbnRzKG1vZGVsOiBEZWJ1Z01vZGVsLCB1cmk6IHVyaSwgZGF0YTogSUJyZWFrcG9pbnREYXRhW10pIHtcblx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRjb25zdCB0b0Rpc3Bvc2UgPSBtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKGUgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlPy5zZXNzaW9uT25seSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlPy5jaGFuZ2VkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlPy5yZW1vdmVkLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGFkZGVkID0gZT8uYWRkZWQ7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFkZGVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRlZCEubGVuZ3RoLCBkYXRhLmxlbmd0aCk7XG5cdFx0ZXZlbnRDb3VudCsrO1xuXHRcdGRpc3Bvc2UodG9EaXNwb3NlKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkIVtpXSBpbnN0YW5jZW9mIEJyZWFrcG9pbnQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChlLmFkZGVkIVtpXSBhcyBCcmVha3BvaW50KS5saW5lTnVtYmVyLCBkYXRhW2ldLmxpbmVOdW1iZXIpO1xuXHRcdH1cblx0fSk7XG5cdGNvbnN0IGJwcyA9IG1vZGVsLmFkZEJyZWFrcG9pbnRzKHVyaSwgZGF0YSk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblx0cmV0dXJuIGJwcztcbn1cblxuc3VpdGUoJ0RlYnVnIC0gQnJlYWtwb2ludHMnLCAoKSA9PiB7XG5cdGxldCBtb2RlbDogRGVidWdNb2RlbDtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9kZWwgPSBjcmVhdGVNb2NrRGVidWdNb2RlbChkaXNwb3NhYmxlcyk7XG5cdH0pO1xuXG5cdC8vIEJyZWFrcG9pbnRzXG5cblx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsVXJpID0gdXJpLmZpbGUoJy9teWZvbGRlci9teWZpbGUuanMnKTtcblxuXHRcdGFkZEJyZWFrcG9pbnRzQW5kQ2hlY2tFdmVudHMobW9kZWwsIG1vZGVsVXJpLCBbeyBsaW5lTnVtYmVyOiA1LCBlbmFibGVkOiB0cnVlIH0sIHsgbGluZU51bWJlcjogMTAsIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEJyZWFrcG9pbnRzKCkubGVuZ3RoLCAyKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKGUgPT4ge1xuXHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGU/LmFkZGVkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGU/LnNlc3Npb25Pbmx5LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZT8ucmVtb3ZlZD8ubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlPy5jaGFuZ2VkLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRkaXNwb3NlKHRvRGlzcG9zZSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5yZW1vdmVCcmVha3BvaW50cyhtb2RlbC5nZXRCcmVha3BvaW50cygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEJyZWFrcG9pbnRzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgndG9nZ2xpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxVcmkgPSB1cmkuZmlsZSgnL215Zm9sZGVyL215ZmlsZS5qcycpO1xuXG5cdFx0YWRkQnJlYWtwb2ludHNBbmRDaGVja0V2ZW50cyhtb2RlbCwgbW9kZWxVcmksIFt7IGxpbmVOdW1iZXI6IDUsIGVuYWJsZWQ6IHRydWUgfSwgeyBsaW5lTnVtYmVyOiAxMCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdGFkZEJyZWFrcG9pbnRzQW5kQ2hlY2tFdmVudHMobW9kZWwsIG1vZGVsVXJpLCBbeyBsaW5lTnVtYmVyOiAxMiwgZW5hYmxlZDogdHJ1ZSwgY29uZGl0aW9uOiAnZmFrZSBjb25kaXRpb24nIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5sZW5ndGgsIDMpO1xuXHRcdGNvbnN0IGJwID0gbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5wb3AoKTtcblx0XHRpZiAoYnApIHtcblx0XHRcdG1vZGVsLnJlbW92ZUJyZWFrcG9pbnRzKFticF0pO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5sZW5ndGgsIDIpO1xuXG5cdFx0bW9kZWwuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQoZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBmYWxzZSk7XG5cdFx0bW9kZWwuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQodHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxVcmkxID0gdXJpLmZpbGUoJy9teWZvbGRlci9teSBmaWxlIGZpcnN0LmpzJyk7XG5cdFx0Y29uc3QgbW9kZWxVcmkyID0gdXJpLmZpbGUoJy9zZWNvbmRmb2xkZXIvc2Vjb25kL3NlY29uZCBmaWxlLmpzJyk7XG5cdFx0YWRkQnJlYWtwb2ludHNBbmRDaGVja0V2ZW50cyhtb2RlbCwgbW9kZWxVcmkxLCBbeyBsaW5lTnVtYmVyOiA1LCBlbmFibGVkOiB0cnVlIH0sIHsgbGluZU51bWJlcjogMTAsIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RXhwYW5kZWRCb2R5U2l6ZShtb2RlbCwgdW5kZWZpbmVkLCA5KSwgNDQpO1xuXG5cdFx0YWRkQnJlYWtwb2ludHNBbmRDaGVja0V2ZW50cyhtb2RlbCwgbW9kZWxVcmkyLCBbeyBsaW5lTnVtYmVyOiAxLCBlbmFibGVkOiB0cnVlIH0sIHsgbGluZU51bWJlcjogMiwgZW5hYmxlZDogdHJ1ZSB9LCB7IGxpbmVOdW1iZXI6IDMsIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RXhwYW5kZWRCb2R5U2l6ZShtb2RlbCwgdW5kZWZpbmVkLCA5KSwgMTEwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRCcmVha3BvaW50cygpLmxlbmd0aCwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEJyZWFrcG9pbnRzKHsgdXJpOiBtb2RlbFVyaTEgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QnJlYWtwb2ludHMoeyB1cmk6IG1vZGVsVXJpMiB9KS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRCcmVha3BvaW50cyh7IGxpbmVOdW1iZXI6IDUgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QnJlYWtwb2ludHMoeyBjb2x1bW46IDUgfSkubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IGJwID0gbW9kZWwuZ2V0QnJlYWtwb2ludHMoKVswXTtcblx0XHRjb25zdCB1cGRhdGUgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRVcGRhdGVEYXRhPigpO1xuXHRcdHVwZGF0ZS5zZXQoYnAuZ2V0SWQoKSwgeyBsaW5lTnVtYmVyOiAxMDAgfSk7XG5cdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKGUgPT4ge1xuXHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZT8uYWRkZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZT8ucmVtb3ZlZCwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlPy5jaGFuZ2VkPy5sZW5ndGgsIDEpO1xuXHRcdFx0ZGlzcG9zZSh0b0Rpc3Bvc2UpO1xuXHRcdH0pO1xuXHRcdG1vZGVsLnVwZGF0ZUJyZWFrcG9pbnRzKHVwZGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChicC5saW5lTnVtYmVyLCAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEJyZWFrcG9pbnRzKHsgZW5hYmxlZE9ubHk6IHRydWUgfSkubGVuZ3RoLCAzKTtcblx0XHRtb2RlbC5lbmFibGVPckRpc2FibGVBbGxCcmVha3BvaW50cyhmYWxzZSk7XG5cdFx0bW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5mb3JFYWNoKGJwID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChicC5lbmFibGVkLCBmYWxzZSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEJyZWFrcG9pbnRzKHsgZW5hYmxlZE9ubHk6IHRydWUgfSkubGVuZ3RoLCAwKTtcblxuXHRcdG1vZGVsLnNldEVuYWJsZW1lbnQoYnAsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChicC5lbmFibGVkLCB0cnVlKTtcblxuXHRcdG1vZGVsLnJlbW92ZUJyZWFrcG9pbnRzKG1vZGVsLmdldEJyZWFrcG9pbnRzKHsgdXJpOiBtb2RlbFVyaTEgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFeHBhbmRlZEJvZHlTaXplKG1vZGVsLCB1bmRlZmluZWQsIDkpLCA2Nik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5sZW5ndGgsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25kaXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsVXJpMSA9IHVyaS5maWxlKCcvbXlmb2xkZXIvbXkgZmlsZSBmaXJzdC5qcycpO1xuXHRcdGFkZEJyZWFrcG9pbnRzQW5kQ2hlY2tFdmVudHMobW9kZWwsIG1vZGVsVXJpMSwgW3sgbGluZU51bWJlcjogNSwgY29uZGl0aW9uOiAnaSA8IDUnLCBoaXRDb25kaXRpb246ICcxNycgfSwgeyBsaW5lTnVtYmVyOiAxMCwgY29uZGl0aW9uOiAnaiA8IDMnIH1dKTtcblx0XHRjb25zdCBicmVha3BvaW50cyA9IG1vZGVsLmdldEJyZWFrcG9pbnRzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMF0uY29uZGl0aW9uLCAnaSA8IDUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMF0uaGl0Q29uZGl0aW9uLCAnMTcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMV0uY29uZGl0aW9uLCAnaiA8IDMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoISFicmVha3BvaW50c1sxXS5oaXRDb25kaXRpb24sIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRCcmVha3BvaW50cygpLmxlbmd0aCwgMik7XG5cdFx0bW9kZWwucmVtb3ZlQnJlYWtwb2ludHMobW9kZWwuZ2V0QnJlYWtwb2ludHMoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEJyZWFrcG9pbnRzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZnVuY3Rpb24gYnJlYWtwb2ludHMnLCAoKSA9PiB7XG5cdFx0bW9kZWwuYWRkRnVuY3Rpb25CcmVha3BvaW50KHsgbmFtZTogJ2ZvbycgfSwgJzEnKTtcblx0XHRtb2RlbC5hZGRGdW5jdGlvbkJyZWFrcG9pbnQoeyBuYW1lOiAnYmFyJyB9LCAnMicpO1xuXHRcdG1vZGVsLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludCgnMScsIHsgbmFtZTogJ2Zvb1VwZGF0ZWQnIH0pO1xuXHRcdG1vZGVsLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludCgnMicsIHsgbmFtZTogJ2JhclVwZGF0ZWQnIH0pO1xuXG5cdFx0Y29uc3QgZnVuY3Rpb25CcHMgPSBtb2RlbC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZ1bmN0aW9uQnBzWzBdLm5hbWUsICdmb29VcGRhdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZ1bmN0aW9uQnBzWzFdLm5hbWUsICdiYXJVcGRhdGVkJyk7XG5cblx0XHRtb2RlbC5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbFVyaSA9IHVyaS5maWxlKCcvbXlmb2xkZXIvbXlmaWxlLmpzJyk7XG5cdFx0YWRkQnJlYWtwb2ludHNBbmRDaGVja0V2ZW50cyhtb2RlbCwgbW9kZWxVcmksIFt7IGxpbmVOdW1iZXI6IDUsIGVuYWJsZWQ6IHRydWUsIGNvbmRpdGlvbjogJ3ggPiA1JyB9LCB7IGxpbmVOdW1iZXI6IDEwLCBlbmFibGVkOiBmYWxzZSB9XSk7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHMgPSBtb2RlbC5nZXRCcmVha3BvaW50cygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFNlc3Npb24obW9kZWwpKTtcblx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludD4oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChicmVha3BvaW50c1swXS5saW5lTnVtYmVyLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMV0ubGluZU51bWJlciwgMTApO1xuXG5cdFx0ZGF0YS5zZXQoYnJlYWtwb2ludHNbMF0uZ2V0SWQoKSwgeyB2ZXJpZmllZDogZmFsc2UsIGxpbmU6IDEwIH0pO1xuXHRcdGRhdGEuc2V0KGJyZWFrcG9pbnRzWzFdLmdldElkKCksIHsgdmVyaWZpZWQ6IHRydWUsIGxpbmU6IDUwIH0pO1xuXHRcdG1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YShzZXNzaW9uLmdldElkKCksIHt9LCBkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMF0ubGluZU51bWJlciwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyZWFrcG9pbnRzWzFdLmxpbmVOdW1iZXIsIDUwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24yID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RTZXNzaW9uKG1vZGVsKSk7XG5cdFx0Y29uc3QgZGF0YTIgPSBuZXcgTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PigpO1xuXHRcdGRhdGEyLnNldChicmVha3BvaW50c1swXS5nZXRJZCgpLCB7IHZlcmlmaWVkOiB0cnVlLCBsaW5lOiAxMDAgfSk7XG5cdFx0ZGF0YTIuc2V0KGJyZWFrcG9pbnRzWzFdLmdldElkKCksIHsgdmVyaWZpZWQ6IHRydWUsIGxpbmU6IDUwMCB9KTtcblx0XHRtb2RlbC5zZXRCcmVha3BvaW50U2Vzc2lvbkRhdGEoc2Vzc2lvbjIuZ2V0SWQoKSwge30sIGRhdGEyKTtcblxuXHRcdC8vIEJyZWFrcG9pbnQgaXMgdmVyaWZpZWQgb25seSBvbmNlLCBzaG93IHRoYXQgbGluZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChicmVha3BvaW50c1swXS5saW5lTnVtYmVyLCAxMDApO1xuXHRcdC8vIEJyZWFrcG9pbnQgaXMgdmVyaWZpZWQgdHdvIHRpbWVzLCBzaG93IHRoZSBvcmlnaW5hbCBsaW5lXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyZWFrcG9pbnRzWzFdLmxpbmVOdW1iZXIsIDEwKTtcblxuXHRcdG1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YShzZXNzaW9uLmdldElkKCksIHt9LCB1bmRlZmluZWQpO1xuXHRcdC8vIE5vIG1vcmUgZG91YmxlIHNlc3Npb24gdmVyaWZpY2F0aW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyZWFrcG9pbnRzWzBdLmxpbmVOdW1iZXIsIDEwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyZWFrcG9pbnRzWzFdLmxpbmVOdW1iZXIsIDUwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMF0uc3VwcG9ydGVkLCBmYWxzZSk7XG5cdFx0Y29uc3QgZGF0YTMgPSBuZXcgTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PigpO1xuXHRcdGRhdGEzLnNldChicmVha3BvaW50c1swXS5nZXRJZCgpLCB7IHZlcmlmaWVkOiB0cnVlLCBsaW5lOiA1MDAgfSk7XG5cdFx0bW9kZWwuc2V0QnJlYWtwb2ludFNlc3Npb25EYXRhKHNlc3Npb24yLmdldElkKCksIHsgc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzOiB0cnVlIH0sIGRhdGEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJlYWtwb2ludHNbMF0uc3VwcG9ydGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjZXB0aW9uIGJyZWFrcG9pbnRzJywgKCkgPT4ge1xuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VCcmVha3BvaW50cygoKSA9PiBldmVudENvdW50KyspKTtcblx0XHRtb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtMScsIFt7IGZpbHRlcjogJ3VuY2F1Z2h0JywgbGFiZWw6ICdVTkNBVUdIVCcsIGRlZmF1bHQ6IHRydWUgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblx0XHRsZXQgZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c1swXS5maWx0ZXIsICd1bmNhdWdodCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c1swXS5lbmFibGVkLCB0cnVlKTtcblxuXHRcdG1vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbignc2Vzc2lvbi1pZC0yJywgW3sgZmlsdGVyOiAndW5jYXVnaHQnLCBsYWJlbDogJ1VOQ0FVR0hUJyB9LCB7IGZpbHRlcjogJ2NhdWdodCcsIGxhYmVsOiAnQ0FVR0hUJyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDIpO1xuXHRcdGV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKCdzZXNzaW9uLWlkLTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNbMF0uZmlsdGVyLCAndW5jYXVnaHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNbMF0uZW5hYmxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzWzFdLmZpbHRlciwgJ2NhdWdodCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c1sxXS5sYWJlbCwgJ0NBVUdIVCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c1sxXS5lbmFibGVkLCBmYWxzZSk7XG5cblx0XHRtb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtMycsIFt7IGZpbHRlcjogJ2FsbCcsIGxhYmVsOiAnQUxMJyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtMycpLmxlbmd0aCwgMSk7XG5cdFx0ZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c1swXS5maWx0ZXIsICd1bmNhdWdodCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c1swXS5lbmFibGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNbMV0uZmlsdGVyLCAnY2F1Z2h0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzWzFdLmxhYmVsLCAnQ0FVR0hUJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzWzFdLmVuYWJsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNbMl0uZmlsdGVyLCAnYWxsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzWzJdLmxhYmVsLCAnQUxMJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2VwdGlvbiBicmVha3BvaW50cyBtdWx0aXBsZSBzZXNzaW9ucycsICgpID0+IHtcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoKCkgPT4gZXZlbnRDb3VudCsrKSk7XG5cblx0XHRtb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtNCcsIFt7IGZpbHRlcjogJ3VuY2F1Z2h0JywgbGFiZWw6ICdVTkNBVUdIVCcsIGRlZmF1bHQ6IHRydWUgfSwgeyBmaWx0ZXI6ICdjYXVnaHQnLCBsYWJlbDogJ0NBVUdIVCcgfV0pO1xuXHRcdG1vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRGYWxsYmFja1Nlc3Npb24oJ3Nlc3Npb24taWQtNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblx0XHRsZXQgZXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uID0gbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKCdzZXNzaW9uLWlkLTQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvblswXS5maWx0ZXIsICd1bmNhdWdodCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb25bMV0uZmlsdGVyLCAnY2F1Z2h0Jyk7XG5cblx0XHRtb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtNScsIFt7IGZpbHRlcjogJ2FsbCcsIGxhYmVsOiAnQUxMJyB9LCB7IGZpbHRlcjogJ2NhdWdodCcsIGxhYmVsOiAnQ0FVR0hUJyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDIpO1xuXHRcdGV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbiA9IG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbignc2Vzc2lvbi1pZC01Jyk7XG5cdFx0bGV0IGV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yVW5kZWZpbmVkID0gbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbi5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb25bMF0uZmlsdGVyLCAnY2F1Z2h0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvblsxXS5maWx0ZXIsICdhbGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNGb3JVbmRlZmluZWQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNGb3JVbmRlZmluZWRbMF0uZmlsdGVyLCAndW5jYXVnaHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNGb3JVbmRlZmluZWRbMV0uZmlsdGVyLCAnY2F1Z2h0Jyk7XG5cblx0XHRtb2RlbC5yZW1vdmVFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oJ3Nlc3Npb24taWQtNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAyKTtcblx0XHRleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZCA9IG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbih1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZFswXS5maWx0ZXIsICd1bmNhdWdodCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZFsxXS5maWx0ZXIsICdjYXVnaHQnKTtcblxuXHRcdG1vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRGYWxsYmFja1Nlc3Npb24oJ3Nlc3Npb24taWQtNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAyKTtcblx0XHRleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZCA9IG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbih1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGNlcHRpb25CcmVha3BvaW50c0ZvclVuZGVmaW5lZFswXS5maWx0ZXIsICdjYXVnaHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9uQnJlYWtwb2ludHNGb3JVbmRlZmluZWRbMV0uZmlsdGVyLCAnYWxsJyk7XG5cblx0XHRjb25zdCBleGNlcHRpb25CcmVha3BvaW50cyA9IG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4Y2VwdGlvbkJyZWFrcG9pbnRzLmxlbmd0aCwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3RydWN0aW9uIGJyZWFrcG9pbnRzJywgKCkgPT4ge1xuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VCcmVha3BvaW50cygoKSA9PiBldmVudENvdW50KyspKTtcblx0XHQvL2FkZHJlc3M6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGNvbmRpdGlvbj86IHN0cmluZywgaGl0Q29uZGl0aW9uPzogc3RyaW5nXG5cdFx0bW9kZWwuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KHsgaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6ICcweENDQ0NGRkZGJywgb2Zmc2V0OiAwLCBhZGRyZXNzOiAwbiwgY2FuUGVyc2lzdDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdFx0bGV0IGluc3RydWN0aW9uQnJlYWtwb2ludHMgPSBtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RydWN0aW9uQnJlYWtwb2ludHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25CcmVha3BvaW50c1swXS5pbnN0cnVjdGlvblJlZmVyZW5jZSwgJzB4Q0NDQ0ZGRkYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25CcmVha3BvaW50c1swXS5vZmZzZXQsIDApO1xuXG5cdFx0bW9kZWwuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KHsgaW5zdHJ1Y3Rpb25SZWZlcmVuY2U6ICcweENDQ0NFRUVFJywgb2Zmc2V0OiAxLCBhZGRyZXNzOiAwbiwgY2FuUGVyc2lzdDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDIpO1xuXHRcdGluc3RydWN0aW9uQnJlYWtwb2ludHMgPSBtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RydWN0aW9uQnJlYWtwb2ludHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25CcmVha3BvaW50c1swXS5pbnN0cnVjdGlvblJlZmVyZW5jZSwgJzB4Q0NDQ0ZGRkYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25CcmVha3BvaW50c1swXS5vZmZzZXQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbkJyZWFrcG9pbnRzWzFdLmluc3RydWN0aW9uUmVmZXJlbmNlLCAnMHhDQ0NDRUVFRScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbkJyZWFrcG9pbnRzWzFdLm9mZnNldCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RhdGEgYnJlYWtwb2ludHMnLCAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IGV2ZW50Q291bnQrKykpO1xuXG5cdFx0bW9kZWwuYWRkRGF0YUJyZWFrcG9pbnQoeyBkZXNjcmlwdGlvbjogJ2xhYmVsJywgc3JjOiB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiAnaWQnIH0sIGNhblBlcnNpc3Q6IHRydWUsIGFjY2Vzc1R5cGVzOiBbJ3JlYWQnXSwgYWNjZXNzVHlwZTogJ3JlYWQnIH0sICcxJyk7XG5cdFx0bW9kZWwuYWRkRGF0YUJyZWFrcG9pbnQoeyBkZXNjcmlwdGlvbjogJ3NlY29uZCcsIHNyYzogeyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUsIGRhdGFJZDogJ3NlY29uZElkJyB9LCBjYW5QZXJzaXN0OiBmYWxzZSwgYWNjZXNzVHlwZXM6IFsncmVhZFdyaXRlJ10sIGFjY2Vzc1R5cGU6ICdyZWFkV3JpdGUnIH0sICcyJyk7XG5cdFx0bW9kZWwudXBkYXRlRGF0YUJyZWFrcG9pbnQoJzEnLCB7IGNvbmRpdGlvbjogJ2FDb25kaXRpb24nIH0pO1xuXHRcdG1vZGVsLnVwZGF0ZURhdGFCcmVha3BvaW50KCcyJywgeyBoaXRDb25kaXRpb246ICcxMCcgfSk7XG5cdFx0Y29uc3QgZGF0YUJyZWFrcG9pbnRzID0gbW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGFCcmVha3BvaW50c1swXS5jYW5QZXJzaXN0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGFCcmVha3BvaW50c1swXS5zcmMsIHsgdHlwZTogRGF0YUJyZWFrcG9pbnRTZXRUeXBlLlZhcmlhYmxlLCBkYXRhSWQ6ICdpZCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGFCcmVha3BvaW50c1swXS5hY2Nlc3NUeXBlLCAncmVhZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhQnJlYWtwb2ludHNbMF0uY29uZGl0aW9uLCAnYUNvbmRpdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhQnJlYWtwb2ludHNbMV0uY2FuUGVyc2lzdCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhQnJlYWtwb2ludHNbMV0uZGVzY3JpcHRpb24sICdzZWNvbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YUJyZWFrcG9pbnRzWzFdLmFjY2Vzc1R5cGUsICdyZWFkV3JpdGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YUJyZWFrcG9pbnRzWzFdLmhpdENvbmRpdGlvbiwgJzEwJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgNCk7XG5cblx0XHRtb2RlbC5yZW1vdmVEYXRhQnJlYWtwb2ludHMoZGF0YUJyZWFrcG9pbnRzWzBdLmdldElkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCkubGVuZ3RoLCAxKTtcblxuXHRcdG1vZGVsLnJlbW92ZURhdGFCcmVha3BvaW50cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXREYXRhQnJlYWtwb2ludHMoKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCA2KTtcblx0fSk7XG5cblx0dGVzdCgnbWVzc2FnZSBhbmQgY2xhc3MgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbFVyaSA9IHVyaS5maWxlKCcvbXlmb2xkZXIvbXkgZmlsZSBmaXJzdC5qcycpO1xuXHRcdGFkZEJyZWFrcG9pbnRzQW5kQ2hlY2tFdmVudHMobW9kZWwsIG1vZGVsVXJpLCBbXG5cdFx0XHR7IGxpbmVOdW1iZXI6IDUsIGVuYWJsZWQ6IHRydWUsIGNvbmRpdGlvbjogJ3ggPiA1JyB9LFxuXHRcdFx0eyBsaW5lTnVtYmVyOiAxMCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdHsgbGluZU51bWJlcjogMTIsIGVuYWJsZWQ6IHRydWUsIGxvZ01lc3NhZ2U6ICdoZWxsbycgfSxcblx0XHRcdHsgbGluZU51bWJlcjogMTUsIGVuYWJsZWQ6IHRydWUsIGhpdENvbmRpdGlvbjogJzEyJyB9LFxuXHRcdFx0eyBsaW5lTnVtYmVyOiA1MDAsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRdKTtcblx0XHRjb25zdCBicmVha3BvaW50cyA9IG1vZGVsLmdldEJyZWFrcG9pbnRzKCk7XG5cdFx0Y29uc3QgbHMgPSBuZXcgTW9ja0xhYmVsU2VydmljZSgpO1xuXG5cdFx0bGV0IHJlc3VsdCA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbihTdGF0ZS5TdG9wcGVkLCB0cnVlLCBicmVha3BvaW50c1swXSwgbHMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1lc3NhZ2UsICdDb25kaXRpb246IHggPiA1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pY29uLmlkLCAnZGVidWctYnJlYWtwb2ludC1jb25kaXRpb25hbCcpO1xuXG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGJyZWFrcG9pbnRzWzFdLCBscywgbW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWVzc2FnZSwgJ0Rpc2FibGVkIEJyZWFrcG9pbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmljb24uaWQsICdkZWJ1Zy1icmVha3BvaW50LWRpc2FibGVkJyk7XG5cblx0XHRyZXN1bHQgPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24oU3RhdGUuU3RvcHBlZCwgdHJ1ZSwgYnJlYWtwb2ludHNbMl0sIGxzLCBtb2RlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tZXNzYWdlLCAnTG9nIE1lc3NhZ2U6IGhlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pY29uLmlkLCAnZGVidWctYnJlYWtwb2ludC1sb2cnKTtcblxuXHRcdHJlc3VsdCA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbihTdGF0ZS5TdG9wcGVkLCB0cnVlLCBicmVha3BvaW50c1szXSwgbHMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1lc3NhZ2UsICdIaXQgQ291bnQ6IDEyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pY29uLmlkLCAnZGVidWctYnJlYWtwb2ludC1jb25kaXRpb25hbCcpO1xuXG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGJyZWFrcG9pbnRzWzRdLCBscywgbW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWVzc2FnZSwgbHMuZ2V0VXJpTGFiZWwoYnJlYWtwb2ludHNbNF0udXJpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pY29uLmlkLCAnZGVidWctYnJlYWtwb2ludCcpO1xuXG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIGZhbHNlLCBicmVha3BvaW50c1syXSwgbHMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1lc3NhZ2UsICdEaXNhYmxlZCBMb2dwb2ludCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaWNvbi5pZCwgJ2RlYnVnLWJyZWFrcG9pbnQtbG9nLWRpc2FibGVkJyk7XG5cblx0XHRtb2RlbC5hZGREYXRhQnJlYWtwb2ludCh7IGRlc2NyaXB0aW9uOiAnbGFiZWwnLCBjYW5QZXJzaXN0OiB0cnVlLCBhY2Nlc3NUeXBlczogWydyZWFkJ10sIGFjY2Vzc1R5cGU6ICdyZWFkJywgc3JjOiB7IHR5cGU6IERhdGFCcmVha3BvaW50U2V0VHlwZS5WYXJpYWJsZSwgZGF0YUlkOiAnaWQnIH0gfSk7XG5cdFx0Y29uc3QgZGF0YUJyZWFrcG9pbnRzID0gbW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCk7XG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGRhdGFCcmVha3BvaW50c1swXSwgbHMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1lc3NhZ2UsICdEYXRhIEJyZWFrcG9pbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmljb24uaWQsICdkZWJ1Zy1icmVha3BvaW50LWRhdGEnKTtcblxuXHRcdGNvbnN0IGZ1bmN0aW9uQnJlYWtwb2ludCA9IG1vZGVsLmFkZEZ1bmN0aW9uQnJlYWtwb2ludCh7IG5hbWU6ICdmb28nIH0sICcxJyk7XG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGZ1bmN0aW9uQnJlYWtwb2ludCwgbHMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1lc3NhZ2UsICdGdW5jdGlvbiBCcmVha3BvaW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pY29uLmlkLCAnZGVidWctYnJlYWtwb2ludC1mdW5jdGlvbicpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQ+KCk7XG5cdFx0ZGF0YS5zZXQoYnJlYWtwb2ludHNbMF0uZ2V0SWQoKSwgeyB2ZXJpZmllZDogZmFsc2UsIGxpbmU6IDEwIH0pO1xuXHRcdGRhdGEuc2V0KGJyZWFrcG9pbnRzWzFdLmdldElkKCksIHsgdmVyaWZpZWQ6IHRydWUsIGxpbmU6IDUwIH0pO1xuXHRcdGRhdGEuc2V0KGJyZWFrcG9pbnRzWzJdLmdldElkKCksIHsgdmVyaWZpZWQ6IHRydWUsIGxpbmU6IDUwLCBtZXNzYWdlOiAnd29ybGQnIH0pO1xuXHRcdGRhdGEuc2V0KGZ1bmN0aW9uQnJlYWtwb2ludC5nZXRJZCgpLCB7IHZlcmlmaWVkOiB0cnVlIH0pO1xuXHRcdG1vZGVsLnNldEJyZWFrcG9pbnRTZXNzaW9uRGF0YSgnbW9ja3Nlc3Npb25pZCcsIHsgc3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzOiBmYWxzZSwgc3VwcG9ydHNEYXRhQnJlYWtwb2ludHM6IHRydWUsIHN1cHBvcnRzTG9nUG9pbnRzOiB0cnVlIH0sIGRhdGEpO1xuXG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGJyZWFrcG9pbnRzWzBdLCBscywgbW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWVzc2FnZSwgJ1VudmVyaWZpZWQgQnJlYWtwb2ludCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaWNvbi5pZCwgJ2RlYnVnLWJyZWFrcG9pbnQtdW52ZXJpZmllZCcpO1xuXG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGZ1bmN0aW9uQnJlYWtwb2ludCwgbHMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1lc3NhZ2UsICdGdW5jdGlvbiBicmVha3BvaW50cyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgdHlwZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaWNvbi5pZCwgJ2RlYnVnLWJyZWFrcG9pbnQtZnVuY3Rpb24tdW52ZXJpZmllZCcpO1xuXG5cdFx0cmVzdWx0ID0gZ2V0QnJlYWtwb2ludE1lc3NhZ2VBbmRJY29uKFN0YXRlLlN0b3BwZWQsIHRydWUsIGJyZWFrcG9pbnRzWzJdLCBscywgbW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWVzc2FnZSwgJ0xvZyBNZXNzYWdlOiBoZWxsbywgd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmljb24uaWQsICdkZWJ1Zy1icmVha3BvaW50LWxvZycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbFVyaSA9IHVyaS5maWxlKCcvbXlmb2xkZXIvbXkgZmlsZSBmaXJzdC5qcycpO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGVzdE1vZGUnO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFsndGhpcyBpcyBsaW5lIG9uZScsICd0aGlzIGlzIGxpbmUgdHdvJywgJyAgICB0aGlzIGlzIGxpbmUgdGhyZWUgaXQgaGFzIHdoaXRlc3BhY2UgYXQgc3RhcnQnLCAndGhpcyBpcyBsaW5lIGZvdXInLCAndGhpcyBpcyBsaW5lIGZpdmUnXS5qb2luKCdcXG4nKSxcblx0XHRcdGxhbmd1YWdlSWRcblx0XHQpO1xuXHRcdGFkZEJyZWFrcG9pbnRzQW5kQ2hlY2tFdmVudHMobW9kZWwsIG1vZGVsVXJpLCBbXG5cdFx0XHR7IGxpbmVOdW1iZXI6IDEsIGVuYWJsZWQ6IHRydWUsIGNvbmRpdGlvbjogJ3ggPiA1JyB9LFxuXHRcdFx0eyBsaW5lTnVtYmVyOiAyLCBjb2x1bW46IDQsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IGxpbmVOdW1iZXI6IDMsIGVuYWJsZWQ6IHRydWUsIGxvZ01lc3NhZ2U6ICdoZWxsbycgfSxcblx0XHRcdHsgbGluZU51bWJlcjogNTAwLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHMgPSBtb2RlbC5nZXRCcmVha3BvaW50cygpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gbmV3IE1vY2tEZWJ1Z1NlcnZpY2UoKTtcblx0XHRkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwgPSAoKSA9PiBtb2RlbDtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEZWJ1Z1NlcnZpY2UsIGRlYnVnU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCBuZXcgTW9ja0xhYmVsU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpKTtcblx0XHRsZXQgZGVjb3JhdGlvbnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVCcmVha3BvaW50RGVjb3JhdGlvbnMoYWNjZXNzb3IsIHRleHRNb2RlbCwgYnJlYWtwb2ludHMsIFN0YXRlLlJ1bm5pbmcsIHRydWUsIHRydWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVjb3JhdGlvbnMubGVuZ3RoLCAzKTsgLy8gbGFzdCBicmVha3BvaW50IGZpbHRlcmVkIG91dCBzaW5jZSBpdCBoYXMgYSBsYXJnZSBsaW5lIG51bWJlclxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMF0ucmFuZ2UsIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvcmF0aW9uc1sxXS5yYW5nZSwgbmV3IFJhbmdlKDIsIDQsIDIsIDUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlY29yYXRpb25zWzJdLnJhbmdlLCBuZXcgUmFuZ2UoMywgNSwgMywgNikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWNvcmF0aW9uc1swXS5vcHRpb25zLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzFdLm9wdGlvbnMuYmVmb3JlPy5pbmxpbmVDbGFzc05hbWUsIGBkZWJ1Zy1icmVha3BvaW50LXBsYWNlaG9sZGVyYCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzBdLm9wdGlvbnMub3ZlcnZpZXdSdWxlcj8ucG9zaXRpb24sIE92ZXJ2aWV3UnVsZXJMYW5lLkxlZnQpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pLmFwcGVuZENvZGVibG9jayhsYW5ndWFnZUlkLCAnQ29uZGl0aW9uOiB4ID4gNScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb3JhdGlvbnNbMF0ub3B0aW9ucy5nbHlwaE1hcmdpbkhvdmVyTWVzc2FnZSwgZXhwZWN0ZWQpO1xuXG5cdFx0ZGVjb3JhdGlvbnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVCcmVha3BvaW50RGVjb3JhdGlvbnMoYWNjZXNzb3IsIHRleHRNb2RlbCwgYnJlYWtwb2ludHMsIFN0YXRlLlJ1bm5pbmcsIHRydWUsIGZhbHNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlY29yYXRpb25zWzBdLm9wdGlvbnMub3ZlcnZpZXdSdWxlciwgbnVsbCk7XG5cblx0XHR0ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB3aGVuIHN0b3JhZ2UgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlMSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGRlYnVnU3RvcmFnZTEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tEZWJ1Z1N0b3JhZ2Uoc3RvcmFnZTEpKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBtb2RlbDEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlYnVnTW9kZWwoZGVidWdTdG9yYWdlMSwgPGFueT57IGlzRGlydHk6IChlOiBhbnkpID0+IGZhbHNlIH0sIG1vY2tVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHQvLyAxLiBjcmVhdGUgYnJlYWtwb2ludHMgaW4gdGhlIGZpcnN0IG1vZGVsXG5cdFx0Y29uc3QgbW9kZWxVcmkgPSB1cmkuZmlsZSgnL215Zm9sZGVyL215IGZpbGUgZmlyc3QuanMnKTtcblx0XHRjb25zdCBmaXJzdCA9IFtcblx0XHRcdHsgbGluZU51bWJlcjogMSwgZW5hYmxlZDogdHJ1ZSwgY29uZGl0aW9uOiAneCA+IDUnIH0sXG5cdFx0XHR7IGxpbmVOdW1iZXI6IDIsIGNvbHVtbjogNCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRdO1xuXG5cdFx0YWRkQnJlYWtwb2ludHNBbmRDaGVja0V2ZW50cyhtb2RlbDEsIG1vZGVsVXJpLCBmaXJzdCk7XG5cdFx0ZGVidWdTdG9yYWdlMS5zdG9yZUJyZWFrcG9pbnRzKG1vZGVsMSk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gc3RvcmFnZTEuZ2V0KCdkZWJ1Zy5icmVha3BvaW50JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cblx0XHQvLyAyLiBoeWRyYXRlIGEgbmV3IG1vZGVsIGFuZCBlbnN1cmUgZXh0ZXJuYWwgYnJlYWtwb2ludHMgZ2V0IGFwcGxpZWRcblx0XHRjb25zdCBzdG9yYWdlMiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IG1vZGVsMiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVidWdNb2RlbChkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tEZWJ1Z1N0b3JhZ2Uoc3RvcmFnZTIpKSwgPGFueT57IGlzRGlydHk6IChlOiBhbnkpID0+IGZhbHNlIH0sIG1vY2tVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0c3RvcmFnZTIuc3RvcmUoJ2RlYnVnLmJyZWFrcG9pbnQnLCBzdG9yZWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUiwgLyogZXh0ZXJuYWw9ICovIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwyLmdldEJyZWFrcG9pbnRzKCkubWFwKGIgPT4gYi5nZXRJZCgpKSwgbW9kZWwxLmdldEJyZWFrcG9pbnRzKCkubWFwKGIgPT4gYi5nZXRJZCgpKSk7XG5cblx0XHQvLyAzLiBlbnN1cmUgbm9uLWV4dGVybmFsIGNoYW5nZXMgYXJlIGlnbm9yZWRcblx0XHRzdG9yYWdlMi5zdG9yZSgnZGVidWcuYnJlYWtwb2ludCcsICdbXScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUiwgLyogZXh0ZXJuYWw9ICovIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsMi5nZXRCcmVha3BvaW50cygpLm1hcChiID0+IGIuZ2V0SWQoKSksIG1vZGVsMS5nZXRCcmVha3BvaW50cygpLm1hcChiID0+IGIuZ2V0SWQoKSkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsc0JB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
