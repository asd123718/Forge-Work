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
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { Action, Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { equals } from "../../../../base/common/arrays.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { RunOnceScheduler, Throttler, timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { clamp } from "../../../../base/common/numbers.js";
import { autorun } from "../../../../base/common/observable.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { count, truncateMiddle } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Constants } from "../../../../base/common/uint.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ContentWidgetPositionPreference, MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { overviewRulerError, overviewRulerInfo } from "../../../../editor/common/core/editorColorRegistry.js";
import { Position } from "../../../../editor/common/core/position.js";
import { GlyphMarginLane, OverviewRulerLane, TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize } from "../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorLineNumberContextMenu, GutterActionsRegistry } from "../../codeEditor/browser/editorLineNumberMenu.js";
import { DefaultGutterClickAction, TestingConfigKeys, getTestingConfiguration } from "../common/configuration.js";
import { TestCommandId, Testing, labelForTestInState } from "../common/constants.js";
import { TestId } from "../common/testId.js";
import { ITestProfileService } from "../common/testProfileService.js";
import { LiveTestResult, TestResultItemChangeReason } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService, getContextForTestItem, simplifyTestsToExecute, testsInFile } from "../common/testService.js";
import { TestDiffOpType, TestMessageType, TestResultState, TestRunProfileBitset } from "../common/testTypes.js";
import { ITestingDecorationsService, TestDecorations } from "../common/testingDecorations.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { isFailedState, maxPriority } from "../common/testingStates.js";
import { TestUriType, buildTestUri, parseTestUri } from "../common/testingUri.js";
import { getTestItemContextOverlay } from "./explorerProjections/testItemContextOverlay.js";
import { testingDebugAllIcon, testingDebugIcon, testingRunAllIcon, testingRunIcon, testingStatesToIcons } from "./icons.js";
import { renderTestMessageAsText } from "./testMessageColorizer.js";
import { MessageSubject } from "./testResultsView/testResultsSubject.js";
import { TestingOutputPeekController } from "./testingOutputPeek.js";
const MAX_INLINE_MESSAGE_LENGTH = 128;
const MAX_TESTS_IN_SUBMENU = 30;
const GLYPH_MARGIN_LANE = GlyphMarginLane.Center;
function isOriginalInDiffEditor(codeEditorService, codeEditor) {
  const diffEditors = codeEditorService.listDiffEditors();
  for (const diffEditor of diffEditors) {
    if (diffEditor.getOriginalEditor() === codeEditor) {
      return true;
    }
  }
  return false;
}
class CachedDecorations {
  constructor() {
    this.runByIdKey = /* @__PURE__ */ new Map();
  }
  get size() {
    return this.runByIdKey.size;
  }
  /** Gets a test run decoration that contains exactly the given test IDs */
  getForExactTests(testIds) {
    const key = testIds.sort().join("\0\0");
    return this.runByIdKey.get(key);
  }
  /** Adds a new test run decroation */
  addTest(d) {
    const key = d.testIds.sort().join("\0\0");
    this.runByIdKey.set(key, d);
  }
  /** Finds an extension by VS Code event ID */
  getById(decorationId) {
    for (const d of this.runByIdKey.values()) {
      if (d.id === decorationId) {
        return d;
      }
    }
    return void 0;
  }
  /** Iterate over all decorations */
  *[Symbol.iterator]() {
    for (const d of this.runByIdKey.values()) {
      yield d;
    }
  }
}
let TestingDecorationService = class extends Disposable {
  constructor(codeEditorService, configurationService, testService, results, instantiationService, modelService) {
    super();
    this.configurationService = configurationService;
    this.testService = testService;
    this.results = results;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.generation = 0;
    this.changeEmitter = this._register(new Emitter());
    this.decorationCache = new ResourceMap();
    /**
     * List of messages that should be hidden because an editor changed their
     * underlying ranges. I think this is good enough, because:
     *  - Message decorations are never shown across reloads; this does not
     *    need to persist
     *  - Message instances are stable for any completed test results for
     *    the duration of the session.
     */
    this.invalidatedMessages = /* @__PURE__ */ new WeakSet();
    /** @inheritdoc */
    this.onDidChange = this.changeEmitter.event;
    this._register(codeEditorService.registerDecorationType("test-message-decoration", TestMessageDecoration.decorationId, {}, void 0));
    this._register(modelService.onModelRemoved((e) => this.decorationCache.delete(e.uri)));
    const debounceInvalidate = this._register(new RunOnceScheduler(() => this.invalidate(), 100));
    this._register(this.testService.onWillProcessDiff((diff) => {
      for (const entry of diff) {
        if (entry.op !== TestDiffOpType.DocumentSynced) {
          continue;
        }
        const rec = this.decorationCache.get(entry.uri);
        if (rec) {
          rec.rangeUpdateVersionId = entry.docv;
        }
      }
      if (!debounceInvalidate.isScheduled()) {
        debounceInvalidate.schedule();
      }
    }));
    this._register(Event.any(
      this.results.onResultsChanged,
      this.results.onTestChanged,
      this.testService.excluded.onTestExclusionsChanged,
      Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(TestingConfigKeys.GutterEnabled))
    )(() => {
      if (!debounceInvalidate.isScheduled()) {
        debounceInvalidate.schedule();
      }
    }));
    this._register(GutterActionsRegistry.registerGutterActionsGenerator((context, result) => {
      const model = context.editor.getModel();
      const testingDecorations = TestingDecorations.get(context.editor);
      if (!model || !testingDecorations?.currentUri) {
        return;
      }
      const currentDecorations = this.syncDecorations(testingDecorations.currentUri);
      if (!currentDecorations.size) {
        return;
      }
      const modelDecorations = model.getLinesDecorations(context.lineNumber, context.lineNumber);
      for (const { id } of modelDecorations) {
        const decoration = currentDecorations.getById(id);
        if (decoration) {
          const { object: actions } = decoration.getContextMenuActions();
          for (const action of actions) {
            result.push(action, "1_testing");
          }
        }
      }
    }));
  }
  /** @inheritdoc */
  invalidateResultMessage(message) {
    this.invalidatedMessages.add(message);
    this.invalidate();
  }
  /** @inheritdoc */
  syncDecorations(resource) {
    const model = this.modelService.getModel(resource);
    if (!model) {
      return new CachedDecorations();
    }
    const cached = this.decorationCache.get(resource);
    if (cached && cached.generation === this.generation && (cached.rangeUpdateVersionId === void 0 || cached.rangeUpdateVersionId !== model.getVersionId())) {
      return cached.value;
    }
    return this.applyDecorations(model);
  }
  /** @inheritdoc */
  getDecoratedTestPosition(resource, testId) {
    const model = this.modelService.getModel(resource);
    if (!model) {
      return void 0;
    }
    const decoration = Iterable.find(this.syncDecorations(resource), (v) => v instanceof RunTestDecoration && v.isForTest(testId));
    if (!decoration) {
      return void 0;
    }
    return model.getDecorationRange(decoration.id)?.getStartPosition();
  }
  invalidate() {
    this.generation++;
    this.changeEmitter.fire();
  }
  /**
   * Sets whether alternate actions are shown for the model.
   */
  updateDecorationsAlternateAction(resource, isAlt) {
    const model = this.modelService.getModel(resource);
    const cached = this.decorationCache.get(resource);
    if (!model || !cached || cached.isAlt === isAlt) {
      return;
    }
    cached.isAlt = isAlt;
    model.changeDecorations((accessor) => {
      for (const decoration of cached.value) {
        if (decoration instanceof RunTestDecoration && decoration.editorDecoration.alternate) {
          accessor.changeDecorationOptions(
            decoration.id,
            isAlt ? decoration.editorDecoration.alternate : decoration.editorDecoration.options
          );
        }
      }
    });
  }
  /**
   * Applies the current set of test decorations to the given text model.
   */
  applyDecorations(model) {
    const gutterEnabled = getTestingConfiguration(this.configurationService, TestingConfigKeys.GutterEnabled);
    const cached = this.decorationCache.get(model.uri);
    const testRangesUpdated = cached?.rangeUpdateVersionId === model.getVersionId();
    const lastDecorations = cached?.value ?? new CachedDecorations();
    const newDecorations = model.changeDecorations((accessor) => {
      const newDecorations2 = new CachedDecorations();
      const runDecorations = new TestDecorations();
      for (const test of this.testService.collection.getNodeByUrl(model.uri)) {
        if (!test.item.range) {
          continue;
        }
        const stateLookup = this.results.getStateById(test.item.extId);
        const line = test.item.range.startLineNumber;
        runDecorations.push({ line, id: "", test, resultItem: stateLookup?.[1] });
      }
      for (const [line, tests] of runDecorations.lines()) {
        const multi = tests.length > 1;
        let existing = lastDecorations.getForExactTests(tests.map((t) => t.test.item.extId));
        if (existing && testRangesUpdated && model.getDecorationRange(existing.id)?.startLineNumber !== line) {
          existing = void 0;
        }
        if (existing) {
          if (existing.replaceOptions(tests, gutterEnabled)) {
            accessor.changeDecorationOptions(existing.id, existing.editorDecoration.options);
          }
          newDecorations2.addTest(existing);
        } else {
          newDecorations2.addTest(multi ? this.instantiationService.createInstance(MultiRunTestDecoration, tests, gutterEnabled, model) : this.instantiationService.createInstance(RunSingleTestDecoration, tests[0].test, tests[0].resultItem, model, gutterEnabled));
        }
      }
      const saveFromRemoval = /* @__PURE__ */ new Set();
      for (const decoration of newDecorations2) {
        if (decoration.id === "") {
          decoration.id = accessor.addDecoration(decoration.editorDecoration.range, decoration.editorDecoration.options);
        } else {
          saveFromRemoval.add(decoration.id);
        }
      }
      for (const decoration of lastDecorations) {
        if (!saveFromRemoval.has(decoration.id)) {
          accessor.removeDecoration(decoration.id);
        }
      }
      this.decorationCache.set(model.uri, {
        generation: this.generation,
        rangeUpdateVersionId: cached?.rangeUpdateVersionId,
        value: newDecorations2
      });
      return newDecorations2;
    });
    return newDecorations || lastDecorations;
  }
};
TestingDecorationService = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IModelService)
], TestingDecorationService);
let TestingDecorations = class extends Disposable {
  constructor(editor, codeEditorService, testService, decorations, uriIdentityService, results, configurationService, instantiationService) {
    super();
    this.editor = editor;
    this.codeEditorService = codeEditorService;
    this.testService = testService;
    this.decorations = decorations;
    this.uriIdentityService = uriIdentityService;
    this.results = results;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.expectedWidget = this._register(new MutableDisposable());
    this.actualWidget = this._register(new MutableDisposable());
    this.errorContentWidgets = this._register(new DisposableMap());
    this.loggedMessageDecorations = /* @__PURE__ */ new Map();
    this._register(codeEditorService.registerDecorationType("test-message-decoration", TestMessageDecoration.decorationId, {}, void 0, editor));
    this.attachModel(editor.getModel()?.uri);
    this._register(decorations.onDidChange(() => {
      if (this._currentUri) {
        decorations.syncDecorations(this._currentUri);
      }
    }));
    const msgThrottler = this._register(new Throttler());
    this._register(this.results.onTestChanged((ev) => {
      if (ev.reason !== TestResultItemChangeReason.NewMessage) {
        return;
      }
      msgThrottler.queue(() => {
        this.applyResults();
        return timeout(100);
      });
    }));
    this._register(Event.any(
      this.results.onResultsChanged,
      editor.onDidChangeModel,
      this.testService.showInlineOutput.onDidChange
    )(() => this.applyResults()));
    const win = dom.getWindow(editor.getDomNode());
    this._register(dom.addDisposableListener(win, "keydown", (e) => {
      if (new StandardKeyboardEvent(e).keyCode === KeyCode.Alt && this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, true);
      }
    }));
    this._register(dom.addDisposableListener(win, "keyup", (e) => {
      if (new StandardKeyboardEvent(e).keyCode === KeyCode.Alt && this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, false);
      }
    }));
    this._register(dom.addDisposableListener(win, "blur", () => {
      if (this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, false);
      }
    }));
    this._register(this.editor.onKeyUp((e) => {
      if (e.keyCode === KeyCode.Alt && this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, false);
      }
    }));
    this._register(this.editor.onDidChangeModel((e) => this.attachModel(e.newModelUrl || void 0)));
    this._register(this.editor.onMouseDown((e) => {
      if (e.target.position && this.currentUri) {
        const modelDecorations = editor.getModel()?.getLineDecorations(e.target.position.lineNumber) ?? [];
        if (!modelDecorations.length) {
          return;
        }
        const cache = decorations.syncDecorations(this.currentUri);
        for (const { id } of modelDecorations) {
          if (cache.getById(id)?.click(e)) {
            e.event.stopPropagation();
            return;
          }
        }
      }
    }));
    this._register(Event.accumulate(this.editor.onDidChangeModelContent, 0, void 0, this._store)((evts) => {
      const model = editor.getModel();
      if (!this._currentUri || !model) {
        return;
      }
      let changed = false;
      for (const [message, deco] of this.loggedMessageDecorations) {
        const invalidate = evts.some((e) => e.changes.some(
          (c) => c.range.startLineNumber <= deco.line && c.range.endLineNumber >= deco.line || deco.resultItem?.item.range && deco.resultItem.item.range.startLineNumber <= c.range.startLineNumber && deco.resultItem.item.range.endLineNumber >= c.range.endLineNumber
        ));
        if (invalidate) {
          changed = true;
          TestingDecorations.invalidatedTests.add(deco.resultItem || message);
        }
      }
      if (changed) {
        this.applyResults();
      }
    }));
    const updateFontFamilyVar = () => {
      this.editor.getContainerDomNode().style.setProperty("--testMessageDecorationFontFamily", editor.getOption(EditorOption.fontFamily));
      this.editor.getContainerDomNode().style.setProperty("--testMessageDecorationFontSize", `${editor.getOption(EditorOption.fontSize)}px`);
    };
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontFamily)) {
        updateFontFamilyVar();
      }
    }));
    updateFontFamilyVar();
  }
  /**
   * Gets the decorations associated with the given code editor.
   */
  static get(editor) {
    return editor.getContribution(Testing.DecorationsContributionId);
  }
  get currentUri() {
    return this._currentUri;
  }
  attachModel(uri) {
    switch (uri && parseTestUri(uri)?.type) {
      case TestUriType.ResultExpectedOutput:
        this.expectedWidget.value = new ExpectedLensContentWidget(this.editor);
        this.actualWidget.clear();
        break;
      case TestUriType.ResultActualOutput:
        this.expectedWidget.clear();
        this.actualWidget.value = new ActualLensContentWidget(this.editor);
        break;
      default:
        this.expectedWidget.clear();
        this.actualWidget.clear();
    }
    if (isOriginalInDiffEditor(this.codeEditorService, this.editor)) {
      uri = void 0;
    }
    this._currentUri = uri;
    if (!uri) {
      return;
    }
    this.decorations.syncDecorations(uri);
    (async () => {
      for await (const _tests of testsInFile(this.testService, this.uriIdentityService, uri, false)) {
        if (this._currentUri !== uri) {
          break;
        }
      }
    })();
  }
  applyResults() {
    const model = this.editor.getModel();
    if (!model) {
      return this.clearResults();
    }
    const uriStr = model.uri.toString();
    const seenLines = /* @__PURE__ */ new Set();
    this.applyResultsContentWidgets(uriStr, seenLines);
    this.applyResultsLoggedMessages(uriStr, seenLines);
  }
  clearResults() {
    this.errorContentWidgets.clearAndDisposeAll();
  }
  isMessageInvalidated(message) {
    return TestingDecorations.invalidatedTests.has(message);
  }
  applyResultsContentWidgets(uriStr, seenLines) {
    const seen = /* @__PURE__ */ new Set();
    if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
      this.results.results.forEach((lastResult) => this.applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines));
    } else if (this.results.results.length) {
      this.applyContentWidgetsFromResult(this.results.results[0], uriStr, seen, seenLines);
    }
    for (const message of this.errorContentWidgets.keys()) {
      if (!seen.has(message)) {
        this.errorContentWidgets.deleteAndDispose(message);
      }
    }
  }
  applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines) {
    for (const test of lastResult.tests) {
      if (TestingDecorations.invalidatedTests.has(test)) {
        continue;
      }
      for (let taskId = 0; taskId < test.tasks.length; taskId++) {
        const state = test.tasks[taskId];
        for (let i = 0; i < state.messages.length; i++) {
          const m = state.messages[i];
          if (m.type !== TestMessageType.Error || this.isMessageInvalidated(m)) {
            continue;
          }
          const line = m.location?.uri.toString() === uriStr ? m.location.range.startLineNumber : m.stackTrace && mapFindFirst(m.stackTrace, (f) => f.position && f.uri?.toString() === uriStr ? f.position.lineNumber : void 0);
          if (line === void 0 || seenLines.has(line)) {
            continue;
          }
          const model = this.editor.getModel();
          if (model && (line < 1 || line > model.getLineCount())) {
            continue;
          }
          seenLines.add(line);
          let deco = this.errorContentWidgets.get(m);
          if (!deco) {
            const lineLength = model?.getLineLength(line) ?? 100;
            deco = this.instantiationService.createInstance(
              TestErrorContentWidget,
              this.editor,
              new Position(line, lineLength + 1),
              m,
              test,
              buildTestUri({
                type: TestUriType.ResultActualOutput,
                messageIndex: i,
                taskIndex: taskId,
                resultId: lastResult.id,
                testExtId: test.item.extId
              })
            );
            this.errorContentWidgets.set(m, deco);
          }
          seen.add(m);
        }
      }
    }
  }
  applyResultsLoggedMessages(uriStr, messageLines) {
    this.editor.changeDecorations((accessor) => {
      const seen = /* @__PURE__ */ new Set();
      if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
        this.results.results.forEach((r) => this.applyLoggedMessageFromResult(r, uriStr, seen, messageLines, accessor));
      } else if (this.results.results.length) {
        this.applyLoggedMessageFromResult(this.results.results[0], uriStr, seen, messageLines, accessor);
      }
      for (const [message, { id }] of this.loggedMessageDecorations) {
        if (!seen.has(message)) {
          accessor.removeDecoration(id);
        }
      }
    });
  }
  applyLoggedMessageFromResult(lastResult, uriStr, seen, messageLines, accessor) {
    if (!this.testService.showInlineOutput.value || !(lastResult instanceof LiveTestResult)) {
      return;
    }
    const tryAdd = (resultItem, m, uri) => {
      if (this.isMessageInvalidated(m) || m.location?.uri.toString() !== uriStr) {
        return;
      }
      seen.add(m);
      const line = m.location.range.startLineNumber;
      if (messageLines.has(line) || this.loggedMessageDecorations.has(m)) {
        return;
      }
      const deco = this.instantiationService.createInstance(TestMessageDecoration, m, uri, this.editor.getModel());
      messageLines.add(line);
      const id = accessor.addDecoration(
        deco.editorDecoration.range,
        deco.editorDecoration.options
      );
      this.loggedMessageDecorations.set(m, { id, line, resultItem });
    };
    for (const test of lastResult.tests) {
      if (TestingDecorations.invalidatedTests.has(test)) {
        continue;
      }
      for (let taskId = 0; taskId < test.tasks.length; taskId++) {
        const state = test.tasks[taskId];
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const m = state.messages[i];
          if (m.type === TestMessageType.Output) {
            tryAdd(test, m, buildTestUri({
              type: TestUriType.ResultActualOutput,
              messageIndex: i,
              taskIndex: taskId,
              resultId: lastResult.id,
              testExtId: test.item.extId
            }));
          }
        }
      }
    }
    for (const task of lastResult.tasks) {
      for (const m of task.otherMessages) {
        tryAdd(void 0, m);
      }
    }
  }
};
/**
 * Results invalidated by editor changes.
 */
TestingDecorations.invalidatedTests = /* @__PURE__ */ new WeakSet();
TestingDecorations = __decorateClass([
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestingDecorationsService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ITestResultService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IInstantiationService)
], TestingDecorations);
const collapseRange = (originalRange) => ({
  startLineNumber: originalRange.startLineNumber,
  endLineNumber: originalRange.startLineNumber,
  startColumn: originalRange.startColumn,
  endColumn: originalRange.startColumn
});
const createRunTestDecoration = (tests, states, visible, defaultGutterAction) => {
  const range = tests[0]?.item.range;
  if (!range) {
    throw new Error("Test decorations can only be created for tests with a range");
  }
  if (!visible) {
    return {
      range: collapseRange(range),
      options: { isWholeLine: true, description: "run-test-decoration" }
    };
  }
  let computedState = TestResultState.Unset;
  const hoverMessageParts = [];
  let testIdWithMessages;
  let retired = false;
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const resultItem = states[i];
    const state = resultItem?.computedState ?? TestResultState.Unset;
    if (hoverMessageParts.length < 10) {
      hoverMessageParts.push(labelForTestInState(test.item.label, state));
    }
    computedState = maxPriority(computedState, state);
    retired = retired || !!resultItem?.retired;
    if (!testIdWithMessages && resultItem?.tasks.some((t) => t.messages.length)) {
      testIdWithMessages = test.item.extId;
    }
  }
  const hasMultipleTests = tests.length > 1 || tests[0].children.size > 0;
  const primaryIcon = computedState === TestResultState.Unset ? hasMultipleTests ? testingRunAllIcon : testingRunIcon : testingStatesToIcons.get(computedState);
  const alternateIcon = defaultGutterAction === DefaultGutterClickAction.Debug ? hasMultipleTests ? testingRunAllIcon : testingRunIcon : hasMultipleTests ? testingDebugAllIcon : testingDebugIcon;
  let hoverMessage;
  let glyphMarginClassName = "testing-run-glyph";
  if (retired) {
    glyphMarginClassName += " retired";
  }
  const defaultOptions = {
    description: "run-test-decoration",
    showIfCollapsed: true,
    get hoverMessage() {
      if (!hoverMessage) {
        const building = hoverMessage = new MarkdownString("", true).appendText(hoverMessageParts.join(", ") + ".");
        if (testIdWithMessages) {
          const args = encodeURIComponent(JSON.stringify([testIdWithMessages]));
          building.appendMarkdown(` [${localize("peekTestOutout", "Peek Test Output")}](command:vscode.peekTestError?${args})`);
        }
      }
      return hoverMessage;
    },
    glyphMargin: { position: GLYPH_MARGIN_LANE },
    glyphMarginClassName: `${ThemeIcon.asClassName(primaryIcon)} ${glyphMarginClassName}`,
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    zIndex: 1e4,
    overviewRuler: isFailedState(computedState) ? { color: themeColorFromId(overviewRulerError), position: OverviewRulerLane.Center } : void 0
  };
  const alternateOptions = {
    ...defaultOptions,
    glyphMarginClassName: `${ThemeIcon.asClassName(alternateIcon)} ${glyphMarginClassName}`
  };
  return {
    range: collapseRange(range),
    options: defaultOptions,
    alternate: alternateOptions
  };
};
var LensContentWidgetVars = /* @__PURE__ */ ((LensContentWidgetVars2) => {
  LensContentWidgetVars2["FontFamily"] = "testingDiffLensFontFamily";
  LensContentWidgetVars2["FontFeatures"] = "testingDiffLensFontFeatures";
  return LensContentWidgetVars2;
})(LensContentWidgetVars || {});
class TitleLensContentWidget {
  constructor(editor) {
    this.editor = editor;
    /** @inheritdoc */
    this.allowEditorOverflow = false;
    /** @inheritdoc */
    this.suppressMouseDown = true;
    this._domNode = dom.$("span");
    queueMicrotask(() => {
      this.applyStyling();
      this.editor.addContentWidget(this);
    });
  }
  applyStyling() {
    let fontSize = this.editor.getOption(EditorOption.codeLensFontSize);
    let height;
    if (!fontSize || fontSize < 5) {
      fontSize = this.editor.getOption(EditorOption.fontSize) * 0.9 | 0;
      height = this.editor.getOption(EditorOption.lineHeight);
    } else {
      height = fontSize * Math.max(1.3, this.editor.getOption(EditorOption.lineHeight) / this.editor.getOption(EditorOption.fontSize)) | 0;
    }
    const editorFontInfo = this.editor.getOption(EditorOption.fontInfo);
    const node = this._domNode;
    node.classList.add("testing-diff-lens-widget");
    node.textContent = this.getText();
    node.style.lineHeight = `${height}px`;
    node.style.fontSize = `${fontSize}px`;
    node.style.fontFamily = `var(--${"testingDiffLensFontFamily" /* FontFamily */})`;
    node.style.fontFeatureSettings = `var(--${"testingDiffLensFontFeatures" /* FontFeatures */})`;
    const containerStyle = this.editor.getContainerDomNode().style;
    containerStyle.setProperty("testingDiffLensFontFamily" /* FontFamily */, this.editor.getOption(EditorOption.codeLensFontFamily) ?? "inherit");
    containerStyle.setProperty("testingDiffLensFontFeatures" /* FontFeatures */, editorFontInfo.fontFeatureSettings);
    this.editor.changeViewZones((accessor) => {
      if (this.viewZoneId) {
        accessor.removeZone(this.viewZoneId);
      }
      this.viewZoneId = accessor.addZone({
        afterLineNumber: 0,
        afterColumn: Constants.MAX_SAFE_SMALL_INTEGER,
        domNode: document.createElement("div"),
        heightInPx: 20
      });
    });
  }
  /** @inheritdoc */
  getDomNode() {
    return this._domNode;
  }
  /** @inheritdoc */
  dispose() {
    this.editor.changeViewZones((accessor) => {
      if (this.viewZoneId) {
        accessor.removeZone(this.viewZoneId);
      }
    });
    this.editor.removeContentWidget(this);
  }
  /** @inheritdoc */
  getPosition() {
    return {
      position: { column: 0, lineNumber: 0 },
      preference: [ContentWidgetPositionPreference.ABOVE]
    };
  }
}
class ExpectedLensContentWidget extends TitleLensContentWidget {
  getId() {
    return "expectedTestingLens";
  }
  getText() {
    return localize("expected.title", "Expected");
  }
}
class ActualLensContentWidget extends TitleLensContentWidget {
  getId() {
    return "actualTestingLens";
  }
  getText() {
    return localize("actual.title", "Actual");
  }
}
let RunTestDecoration = class {
  constructor(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService) {
    this.tests = tests;
    this.visible = visible;
    this.model = model;
    this.codeEditorService = codeEditorService;
    this.testService = testService;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.testProfileService = testProfileService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    /** @inheritdoc */
    this.id = "";
    this.displayedStates = tests.map((t) => t.resultItem?.computedState);
    this.editorDecoration = createRunTestDecoration(
      tests.map((t) => t.test),
      tests.map((t) => t.resultItem),
      visible,
      getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)
    );
    this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
  }
  get line() {
    return this.editorDecoration.range.startLineNumber;
  }
  get testIds() {
    return this.tests.map((t) => t.test.item.extId);
  }
  /** @inheritdoc */
  click(e) {
    if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.glyphMarginLane !== GLYPH_MARGIN_LANE || e.event.rightButton || isMacintosh && e.event.leftButton && e.event.ctrlKey) {
      return false;
    }
    const alternateAction = e.event.altKey;
    switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
      case DefaultGutterClickAction.ContextMenu:
        this.showContextMenu(e);
        break;
      case DefaultGutterClickAction.Debug:
        this.runWith(alternateAction ? TestRunProfileBitset.Run : TestRunProfileBitset.Debug);
        break;
      case DefaultGutterClickAction.Coverage:
        this.runWith(alternateAction ? TestRunProfileBitset.Debug : TestRunProfileBitset.Coverage);
        break;
      case DefaultGutterClickAction.Run:
      default:
        this.runWith(alternateAction ? TestRunProfileBitset.Debug : TestRunProfileBitset.Run);
        break;
    }
    return true;
  }
  /**
   * Updates the decoration to match the new set of tests.
   * @returns true if options were changed, false otherwise
   */
  replaceOptions(newTests, visible) {
    const displayedStates = newTests.map((t) => t.resultItem?.computedState);
    if (visible === this.visible && equals(this.displayedStates, displayedStates)) {
      return false;
    }
    this.tests = newTests;
    this.displayedStates = displayedStates;
    this.visible = visible;
    const { options, alternate } = createRunTestDecoration(
      newTests.map((t) => t.test),
      newTests.map((t) => t.resultItem),
      visible,
      getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)
    );
    this.editorDecoration.options = options;
    this.editorDecoration.alternate = alternate;
    this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
    return true;
  }
  /**
   * Gets whether this decoration serves as the run button for the given test ID.
   */
  isForTest(testId) {
    return this.tests.some((t) => t.test.item.extId === testId);
  }
  runWith(profile) {
    return this.testService.runTests({
      tests: simplifyTestsToExecute(this.testService.collection, this.tests.map(({ test }) => test)),
      group: profile
    });
  }
  showContextMenu(e) {
    const editor = this.codeEditorService.listCodeEditors().find((e2) => e2.getModel() === this.model);
    editor?.getContribution(EditorLineNumberContextMenu.ID)?.show(e);
  }
  getGutterLabel() {
    switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
      case DefaultGutterClickAction.ContextMenu:
        return localize("testing.gutterMsg.contextMenu", "Click for test options");
      case DefaultGutterClickAction.Debug:
        return localize("testing.gutterMsg.debug", "Click to debug tests, right click for more options");
      case DefaultGutterClickAction.Coverage:
        return localize("testing.gutterMsg.coverage", "Click to run tests with coverage, right click for more options");
      case DefaultGutterClickAction.Run:
      default:
        return localize("testing.gutterMsg.run", "Click to run tests, right click for more options");
    }
  }
  /**
   * Gets context menu actions relevant for a singel test.
   */
  getTestContextMenuActions(test, resultItem) {
    const testActions = [];
    const capabilities = this.testProfileService.capabilitiesForTest(test.item);
    [
      { bitset: TestRunProfileBitset.Run, label: localize("run test", "Run Test") },
      { bitset: TestRunProfileBitset.Debug, label: localize("debug test", "Debug Test") },
      { bitset: TestRunProfileBitset.Coverage, label: localize("coverage test", "Run with Coverage") }
    ].forEach(({ bitset, label }) => {
      if (capabilities & bitset) {
        testActions.push(new Action(
          `testing.gutter.${bitset}`,
          label,
          void 0,
          void 0,
          () => this.testService.runTests({ group: bitset, tests: [test] })
        ));
      }
    });
    if (capabilities & TestRunProfileBitset.HasNonDefaultProfile) {
      testActions.push(new Action("testing.runUsing", localize("testing.runUsing", "Execute Using Profile..."), void 0, void 0, async () => {
        const profile = await this.commandService.executeCommand("vscode.pickTestProfile", { onlyForTest: test });
        if (!profile) {
          return;
        }
        this.testService.runResolvedTests({
          group: profile.group,
          targets: [{
            profileId: profile.profileId,
            controllerId: profile.controllerId,
            testIds: [test.item.extId]
          }]
        });
      }));
    }
    if (resultItem && isFailedState(resultItem.computedState)) {
      testActions.push(new Action(
        "testing.gutter.peekFailure",
        localize("peek failure", "Peek Error"),
        void 0,
        void 0,
        () => this.commandService.executeCommand("vscode.peekTestError", test.item.extId)
      ));
    }
    if (resultItem?.computedState === TestResultState.Running) {
      testActions.push(new Action(
        "testing.gutter.cancel",
        localize("testing.cancelRun", "Cancel Test Run"),
        void 0,
        void 0,
        () => this.commandService.executeCommand(TestCommandId.CancelTestRunAction)
      ));
    }
    testActions.push(new Action(
      "testing.gutter.reveal",
      localize("reveal test", "Reveal in Test Explorer"),
      void 0,
      void 0,
      () => this.commandService.executeCommand("_revealTestInExplorer", test.item.extId)
    ));
    const contributed = this.getContributedTestActions(test, capabilities);
    return { object: Separator.join(testActions, contributed), dispose() {
      testActions.forEach((a) => a.dispose());
    } };
  }
  getContributedTestActions(test, capabilities) {
    const contextOverlay = this.contextKeyService.createOverlay(getTestItemContextOverlay(test, capabilities));
    const arg = getContextForTestItem(this.testService.collection, test.item.extId);
    const menu = this.menuService.getMenuActions(MenuId.TestItemGutter, contextOverlay, { shouldForwardArgs: true, arg });
    return getFlatContextMenuActions(menu);
  }
};
RunTestDecoration = __decorateClass([
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ITestService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITestProfileService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IMenuService)
], RunTestDecoration);
let MultiRunTestDecoration = class extends RunTestDecoration {
  constructor(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService, quickInputService) {
    super(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService);
    this.quickInputService = quickInputService;
  }
  getContextMenuActions() {
    const disposable = new DisposableStore();
    const allActions = [];
    [
      { bitset: TestRunProfileBitset.Run, label: localize("run all test", "Run All Tests") },
      { bitset: TestRunProfileBitset.Coverage, label: localize("run all test with coverage", "Run All Tests with Coverage") },
      { bitset: TestRunProfileBitset.Debug, label: localize("debug all test", "Debug All Tests") }
    ].forEach(({ bitset, label }, i) => {
      const canRun = this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test.item) & bitset);
      if (canRun) {
        allActions.push(new Action(`testing.gutter.run${i}`, label, void 0, void 0, () => this.runWith(bitset)));
      }
    });
    disposable.add(toDisposable(() => allActions.forEach((a) => a.dispose())));
    const testItems = this.tests.map((testItem) => ({
      currentLabel: testItem.test.item.label,
      testItem,
      parent: TestId.fromString(testItem.test.item.extId).parentId
    }));
    const getLabelConflicts = (tests) => {
      const labelCount = /* @__PURE__ */ new Map();
      for (const test of tests) {
        labelCount.set(test.currentLabel, (labelCount.get(test.currentLabel) || 0) + 1);
      }
      return tests.filter((e) => labelCount.get(e.currentLabel) > 1);
    };
    let conflicts, hasParent = true;
    while ((conflicts = getLabelConflicts(testItems)).length && hasParent) {
      for (const conflict of conflicts) {
        if (conflict.parent) {
          const parent = this.testService.collection.getNodeById(conflict.parent.toString());
          conflict.currentLabel = parent?.item.label + " > " + conflict.currentLabel;
          conflict.parent = conflict.parent.parentId;
        } else {
          hasParent = false;
        }
      }
    }
    testItems.sort((a, b) => {
      const ai = a.testItem.test.item;
      const bi = b.testItem.test.item;
      return (ai.sortText || ai.label).localeCompare(bi.sortText || bi.label);
    });
    let testSubmenus = testItems.map(({ currentLabel, testItem }) => {
      const actions = this.getTestContextMenuActions(testItem.test, testItem.resultItem);
      disposable.add(actions);
      let label = stripIcons(currentLabel);
      const lf = label.indexOf("\n");
      if (lf !== -1) {
        label = label.slice(0, lf);
      }
      return new SubmenuAction(testItem.test.item.extId, label, actions.object);
    });
    const overflow = testSubmenus.length - MAX_TESTS_IN_SUBMENU;
    if (overflow > 0) {
      testSubmenus = testSubmenus.slice(0, MAX_TESTS_IN_SUBMENU);
      testSubmenus.push(new Action(
        "testing.gutter.overflow",
        localize("testOverflowItems", "{0} more tests...", overflow),
        void 0,
        void 0,
        () => this.pickAndRun(testItems)
      ));
    }
    return { object: Separator.join(allActions, testSubmenus), dispose: () => disposable.dispose() };
  }
  async pickAndRun(testItems) {
    const doPick = (items, title) => new Promise((resolve) => {
      const disposables = new DisposableStore();
      const pick = disposables.add(this.quickInputService.createQuickPick());
      pick.placeholder = title;
      pick.items = items;
      disposables.add(pick.onDidHide(() => {
        resolve(void 0);
        disposables.dispose();
      }));
      disposables.add(pick.onDidAccept(() => {
        resolve(pick.selectedItems[0]);
        disposables.dispose();
      }));
      pick.show();
    });
    const item = await doPick(
      testItems.map(({ currentLabel, testItem }) => ({ label: currentLabel, test: testItem.test, result: testItem.resultItem })),
      localize("selectTestToRun", "Select a test to run")
    );
    if (!item) {
      return;
    }
    const actions = this.getTestContextMenuActions(item.test, item.result);
    try {
      (await doPick(actions.object, item.label))?.run();
    } finally {
      actions.dispose();
    }
  }
};
MultiRunTestDecoration = __decorateClass([
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ITestService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITestProfileService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IMenuService),
  __decorateParam(11, IQuickInputService)
], MultiRunTestDecoration);
let RunSingleTestDecoration = class extends RunTestDecoration {
  constructor(test, resultItem, model, visible, codeEditorService, testService, commandService, contextMenuService, configurationService, testProfiles, contextKeyService, menuService) {
    super([{ test, resultItem }], visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfiles, contextKeyService, menuService);
  }
  getContextMenuActions() {
    return this.getTestContextMenuActions(this.tests[0].test, this.tests[0].resultItem);
  }
};
RunSingleTestDecoration = __decorateClass([
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, ITestService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ITestProfileService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IMenuService)
], RunSingleTestDecoration);
const lineBreakRe = /\r?\n\s*/g;
let TestMessageDecoration = class {
  constructor(testMessage, messageUri, textModel, peekOpener, editorService) {
    this.testMessage = testMessage;
    this.messageUri = messageUri;
    this.peekOpener = peekOpener;
    this.id = "";
    this.contentIdClass = `test-message-inline-content-id${generateUuid()}`;
    const location = testMessage.location;
    this.line = clamp(location.range.startLineNumber, 0, textModel.getLineCount());
    const severity = testMessage.type;
    const message = testMessage.message;
    const options = editorService.resolveDecorationOptions(TestMessageDecoration.decorationId, true);
    const hoverText = renderTestMessageAsText(message);
    options.hoverMessage = new MarkdownString().appendText(hoverText);
    options.zIndex = 10;
    options.className = `testing-inline-message-severity-${severity}`;
    options.isWholeLine = true;
    options.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
    options.collapseOnReplaceEdit = true;
    let inlineText = renderTestMessageAsText(message).replace(lineBreakRe, " ");
    if (inlineText.length > MAX_INLINE_MESSAGE_LENGTH) {
      inlineText = inlineText.slice(0, MAX_INLINE_MESSAGE_LENGTH - 1) + "\u2026";
    }
    options.after = {
      content: inlineText,
      inlineClassName: `test-message-inline-content test-message-inline-content-s${severity} ${this.contentIdClass} ${messageUri ? "test-message-inline-content-clickable" : ""}`
    };
    options.showIfCollapsed = true;
    const rulerColor = severity === TestMessageType.Error ? overviewRulerError : overviewRulerInfo;
    if (rulerColor) {
      options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
    }
    const lineLength = textModel.getLineLength(this.line);
    const column = lineLength ? lineLength + 1 : location.range.endColumn;
    this.editorDecoration = {
      options,
      range: {
        startLineNumber: this.line,
        startColumn: column,
        endColumn: column,
        endLineNumber: this.line
      }
    };
  }
  click(e) {
    if (e.event.rightButton) {
      return false;
    }
    if (!this.messageUri) {
      return false;
    }
    if (e.target.element?.className.includes(this.contentIdClass)) {
      this.peekOpener.peekUri(this.messageUri);
    }
    return false;
  }
  getContextMenuActions() {
    return { object: [], dispose: () => {
    } };
  }
};
TestMessageDecoration.inlineClassName = "test-message-inline-content";
TestMessageDecoration.decorationId = `testmessage-${generateUuid()}`;
TestMessageDecoration = __decorateClass([
  __decorateParam(3, ITestingPeekOpener),
  __decorateParam(4, ICodeEditorService)
], TestMessageDecoration);
const ERROR_CONTENT_WIDGET_HEIGHT = 20;
let TestErrorContentWidget = class extends Disposable {
  constructor(editor, position, message, resultItem, uri, peekOpener) {
    super();
    this.editor = editor;
    this.position = position;
    this.message = message;
    this.resultItem = resultItem;
    this.peekOpener = peekOpener;
    this.id = generateUuid();
    /** @inheritdoc */
    this.allowEditorOverflow = false;
    this.node = dom.h("div.test-error-content-widget", [
      dom.h("div.inner@inner", [
        dom.h("div.arrow@arrow"),
        dom.h(`span${ThemeIcon.asCSSSelector(testingStatesToIcons.get(TestResultState.Failed))}`),
        dom.h("span.content@name")
      ])
    ]);
    const setMarginTop = () => {
      const lineHeight = editor.getLineHeightForPosition(position);
      this.node.root.style.marginTop = (lineHeight - ERROR_CONTENT_WIDGET_HEIGHT) / 2 + "px";
    };
    setMarginTop();
    this._register(editor.onDidChangeLineHeight((e) => {
      if (e.affects(position)) {
        setMarginTop();
      }
    }));
    this._register(editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.lineHeight)) {
        setMarginTop();
      }
    }));
    let text;
    if (message.expected !== void 0 && message.actual !== void 0) {
      text = `${truncateMiddle(message.actual.replace(/\s+/g, " "), 30)} != ${truncateMiddle(message.expected.replace(/\s+/g, " "), 30)}`;
    } else {
      const msg = renderAsPlaintext(message.message);
      const lf = msg.indexOf("\n");
      text = lf === -1 ? msg : msg.slice(0, lf);
    }
    this._register(dom.addDisposableListener(this.node.root, dom.EventType.CLICK, (e) => {
      this.peekOpener.peekUri(uri);
      e.preventDefault();
    }));
    const ctrl = TestingOutputPeekController.get(editor);
    if (ctrl) {
      this._register(autorun((reader) => {
        const subject = ctrl.subject.read(reader);
        const isCurrent = subject instanceof MessageSubject && subject.message === message;
        this.node.root.classList.toggle("is-current", isCurrent);
      }));
    }
    this.node.name.innerText = text || "Test Failed";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "10");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("viewBox", "0 0 15 10");
    const leftArrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftArrow.setAttribute("d", "M15 0 L10 0 L0 5 L10 10 L15 10 Z");
    svg.append(leftArrow);
    this.node.arrow.appendChild(svg);
    this._register(editor.onDidChangeModelContent((e) => {
      for (const c of e.changes) {
        if (c.range.startLineNumber > this.line) {
          continue;
        }
        if (c.range.startLineNumber <= this.line && c.range.endLineNumber >= this.line || resultItem.item.range && resultItem.item.range.startLineNumber <= c.range.startLineNumber && resultItem.item.range.endLineNumber >= c.range.endLineNumber) {
          TestingDecorations.invalidatedTests.add(this.resultItem);
          this.dispose();
        }
        const adjust = count(c.text, "\n") - (c.range.endLineNumber - c.range.startLineNumber);
        if (adjust !== 0) {
          this.position = this.position.delta(adjust);
          this.editor.layoutContentWidget(this);
        }
      }
    }));
    editor.addContentWidget(this);
    this._register(toDisposable(() => editor.removeContentWidget(this)));
  }
  get line() {
    return this.position.lineNumber;
  }
  getId() {
    return this.id;
  }
  getDomNode() {
    return this.node.root;
  }
  getPosition() {
    return {
      position: this.position,
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  afterRender(_position, coordinate) {
    if (coordinate) {
      const { verticalScrollbarWidth } = this.editor.getLayoutInfo();
      const scrollWidth = this.editor.getScrollWidth();
      this.node.inner.style.maxWidth = `${scrollWidth - verticalScrollbarWidth - coordinate.left - 20}px`;
    }
  }
};
TestErrorContentWidget = __decorateClass([
  __decorateParam(5, ITestingPeekOpener)
], TestErrorContentWidget);
export {
  TestingDecorationService,
  TestingDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RpbmdEZWNvcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBtYXBGaW5kRmlyc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIFRocm90dGxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjb3VudCwgdHJ1bmNhdGVNaWRkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiwgSUNvbnRlbnRXaWRnZXRSZW5kZXJlZENvb3JkaW5hdGUsIElFZGl0b3JNb3VzZUV2ZW50LCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgb3ZlcnZpZXdSdWxlckVycm9yLCBvdmVydmlld1J1bGVySW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5MYW5lLCBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBPdmVydmlld1J1bGVyTGFuZSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgRWRpdG9yTGluZU51bWJlckNvbnRleHRNZW51LCBHdXR0ZXJBY3Rpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvZWRpdG9yTGluZU51bWJlck1lbnUuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLCBUZXN0aW5nQ29uZmlnS2V5cywgZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZElkLCBUZXN0aW5nLCBsYWJlbEZvclRlc3RJblN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IElUZXN0UHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0LCBMaXZlVGVzdFJlc3VsdCwgVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24gfSBmcm9tICcuLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFJlc3VsdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RTZXJ2aWNlLCBnZXRDb250ZXh0Rm9yVGVzdEl0ZW0sIHNpbXBsaWZ5VGVzdHNUb0V4ZWN1dGUsIHRlc3RzSW5GaWxlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0RXJyb3JNZXNzYWdlLCBJVGVzdE1lc3NhZ2UsIElUZXN0UnVuUHJvZmlsZSwgSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0sIEludGVybmFsVGVzdEl0ZW0sIFRlc3REaWZmT3BUeXBlLCBUZXN0TWVzc2FnZVR5cGUsIFRlc3RSZXN1bHRJdGVtLCBUZXN0UmVzdWx0U3RhdGUsIFRlc3RSdW5Qcm9maWxlQml0c2V0IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJVGVzdERlY29yYXRpb24gYXMgSVB1YmxpY1Rlc3REZWNvcmF0aW9uLCBJVGVzdGluZ0RlY29yYXRpb25zU2VydmljZSwgVGVzdERlY29yYXRpb25zIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGVzdGluZ1BlZWtPcGVuZXIgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1BlZWtPcGVuZXIuanMnO1xuaW1wb3J0IHsgaXNGYWlsZWRTdGF0ZSwgbWF4UHJpb3JpdHkgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1N0YXRlcy5qcyc7XG5pbXBvcnQgeyBUZXN0VXJpVHlwZSwgYnVpbGRUZXN0VXJpLCBwYXJzZVRlc3RVcmkgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1VyaS5qcyc7XG5pbXBvcnQgeyBnZXRUZXN0SXRlbUNvbnRleHRPdmVybGF5IH0gZnJvbSAnLi9leHBsb3JlclByb2plY3Rpb25zL3Rlc3RJdGVtQ29udGV4dE92ZXJsYXkuanMnO1xuaW1wb3J0IHsgdGVzdGluZ0RlYnVnQWxsSWNvbiwgdGVzdGluZ0RlYnVnSWNvbiwgdGVzdGluZ1J1bkFsbEljb24sIHRlc3RpbmdSdW5JY29uLCB0ZXN0aW5nU3RhdGVzVG9JY29ucyB9IGZyb20gJy4vaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVuZGVyVGVzdE1lc3NhZ2VBc1RleHQgfSBmcm9tICcuL3Rlc3RNZXNzYWdlQ29sb3JpemVyLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VTdWJqZWN0IH0gZnJvbSAnLi90ZXN0UmVzdWx0c1ZpZXcvdGVzdFJlc3VsdHNTdWJqZWN0LmpzJztcbmltcG9ydCB7IFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlciB9IGZyb20gJy4vdGVzdGluZ091dHB1dFBlZWsuanMnO1xuXG5jb25zdCBNQVhfSU5MSU5FX01FU1NBR0VfTEVOR1RIID0gMTI4O1xuY29uc3QgTUFYX1RFU1RTX0lOX1NVQk1FTlUgPSAzMDtcbmNvbnN0IEdMWVBIX01BUkdJTl9MQU5FID0gR2x5cGhNYXJnaW5MYW5lLkNlbnRlcjtcblxuZnVuY3Rpb24gaXNPcmlnaW5hbEluRGlmZkVkaXRvcihjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcik6IGJvb2xlYW4ge1xuXHRjb25zdCBkaWZmRWRpdG9ycyA9IGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3REaWZmRWRpdG9ycygpO1xuXG5cdGZvciAoY29uc3QgZGlmZkVkaXRvciBvZiBkaWZmRWRpdG9ycykge1xuXHRcdGlmIChkaWZmRWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkgPT09IGNvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuaW50ZXJmYWNlIElUZXN0RGVjb3JhdGlvbiBleHRlbmRzIElQdWJsaWNUZXN0RGVjb3JhdGlvbiB7XG5cdGlkOiBzdHJpbmc7XG5cdGNsaWNrKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogYm9vbGVhbjtcbn1cblxuLyoqIFZhbHVlIGZvciBzYXZlZCBkZWNvcmF0aW9ucywgcHJvdmlkaW5nIGZhc3QgYWNjZXNzb3JzIGZvciB0aGUgaG90ICdzeW5jRGVjb3JhdGlvbnMnIHBhdGggKi9cbmNsYXNzIENhY2hlZERlY29yYXRpb25zIHtcblx0cHJpdmF0ZSByZWFkb25seSBydW5CeUlkS2V5ID0gbmV3IE1hcDxzdHJpbmcsIFJ1blRlc3REZWNvcmF0aW9uPigpO1xuXG5cdHB1YmxpYyBnZXQgc2l6ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5ydW5CeUlkS2V5LnNpemU7XG5cdH1cblxuXHQvKiogR2V0cyBhIHRlc3QgcnVuIGRlY29yYXRpb24gdGhhdCBjb250YWlucyBleGFjdGx5IHRoZSBnaXZlbiB0ZXN0IElEcyAqL1xuXHRwdWJsaWMgZ2V0Rm9yRXhhY3RUZXN0cyh0ZXN0SWRzOiBzdHJpbmdbXSkge1xuXHRcdGNvbnN0IGtleSA9IHRlc3RJZHMuc29ydCgpLmpvaW4oJ1xcMFxcMCcpO1xuXHRcdHJldHVybiB0aGlzLnJ1bkJ5SWRLZXkuZ2V0KGtleSk7XG5cdH1cblx0LyoqIEFkZHMgYSBuZXcgdGVzdCBydW4gZGVjcm9hdGlvbiAqL1xuXHRwdWJsaWMgYWRkVGVzdChkOiBSdW5UZXN0RGVjb3JhdGlvbikge1xuXHRcdGNvbnN0IGtleSA9IGQudGVzdElkcy5zb3J0KCkuam9pbignXFwwXFwwJyk7XG5cdFx0dGhpcy5ydW5CeUlkS2V5LnNldChrZXksIGQpO1xuXHR9XG5cblx0LyoqIEZpbmRzIGFuIGV4dGVuc2lvbiBieSBWUyBDb2RlIGV2ZW50IElEICovXG5cdHB1YmxpYyBnZXRCeUlkKGRlY29yYXRpb25JZDogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMucnVuQnlJZEtleS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGQuaWQgPT09IGRlY29yYXRpb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBJdGVyYXRlIG92ZXIgYWxsIGRlY29yYXRpb25zICovXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPElUZXN0RGVjb3JhdGlvbj4ge1xuXHRcdGZvciAoY29uc3QgZCBvZiB0aGlzLnJ1bkJ5SWRLZXkudmFsdWVzKCkpIHtcblx0XHRcdHlpZWxkIGQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0aW5nRGVjb3JhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlc3RpbmdEZWNvcmF0aW9uc1NlcnZpY2Uge1xuXHRkZWNsYXJlIHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBnZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBjaGFuZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbkNhY2hlID0gbmV3IFJlc291cmNlTWFwPHtcblx0XHQvKiogVGhlIGRvY3VtZW50IHZlcnNpb24gYXQgd2hpY2ggcmFuZ2VzIGhhdmUgYmVlbiB1cGRhdGVkLCByZXF1aXJpbmcgcmVyZW5kZXJpbmcgKi9cblx0XHRyYW5nZVVwZGF0ZVZlcnNpb25JZD86IG51bWJlcjtcblx0XHQvKiogQ291bnRlciBmb3IgdGhlIHJlc3VsdHMgcmVuZGVyZWQgaW4gdGhlIGRvY3VtZW50ICovXG5cdFx0Z2VuZXJhdGlvbjogbnVtYmVyO1xuXHRcdGlzQWx0PzogYm9vbGVhbjtcblx0XHR2YWx1ZTogQ2FjaGVkRGVjb3JhdGlvbnM7XG5cdH0+KCk7XG5cblx0LyoqXG5cdCAqIExpc3Qgb2YgbWVzc2FnZXMgdGhhdCBzaG91bGQgYmUgaGlkZGVuIGJlY2F1c2UgYW4gZWRpdG9yIGNoYW5nZWQgdGhlaXJcblx0ICogdW5kZXJseWluZyByYW5nZXMuIEkgdGhpbmsgdGhpcyBpcyBnb29kIGVub3VnaCwgYmVjYXVzZTpcblx0ICogIC0gTWVzc2FnZSBkZWNvcmF0aW9ucyBhcmUgbmV2ZXIgc2hvd24gYWNyb3NzIHJlbG9hZHM7IHRoaXMgZG9lcyBub3Rcblx0ICogICAgbmVlZCB0byBwZXJzaXN0XG5cdCAqICAtIE1lc3NhZ2UgaW5zdGFuY2VzIGFyZSBzdGFibGUgZm9yIGFueSBjb21wbGV0ZWQgdGVzdCByZXN1bHRzIGZvclxuXHQgKiAgICB0aGUgZHVyYXRpb24gb2YgdGhlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGludmFsaWRhdGVkTWVzc2FnZXMgPSBuZXcgV2Vha1NldDxJVGVzdE1lc3NhZ2U+KCk7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuY2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCd0ZXN0LW1lc3NhZ2UtZGVjb3JhdGlvbicsIFRlc3RNZXNzYWdlRGVjb3JhdGlvbi5kZWNvcmF0aW9uSWQsIHt9LCB1bmRlZmluZWQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsU2VydmljZS5vbk1vZGVsUmVtb3ZlZChlID0+IHRoaXMuZGVjb3JhdGlvbkNhY2hlLmRlbGV0ZShlLnVyaSkpKTtcblxuXHRcdGNvbnN0IGRlYm91bmNlSW52YWxpZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuaW52YWxpZGF0ZSgpLCAxMDApKTtcblxuXHRcdC8vIElmIHJhbmdlcyB3ZXJlIHVwZGF0ZWQgaW4gdGhlIGRvY3VtZW50LCBtYXJrIHRoYXQgd2Ugc2hvdWxkIGV4cGxpY2l0bHlcblx0XHQvLyBzeW5jIGRlY29yYXRpb25zIHRvIHRoZSBwdWJsaXNoZWQgbGluZXMsIHNpbmNlIHdlIGFzc3VtZSB0aGF0IGV2ZXJ5dGhpbmdcblx0XHQvLyBpcyB1cCB0byBkYXRlLiBUaGlzIHByZXZlbnRzIGlzc3VlcywgYXMgaW4gIzEzODYzMiwgIzEzODgzNSwgIzEzODkyMi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRlc3RTZXJ2aWNlLm9uV2lsbFByb2Nlc3NEaWZmKGRpZmYgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBkaWZmKSB7XG5cdFx0XHRcdGlmIChlbnRyeS5vcCAhPT0gVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlYyA9IHRoaXMuZGVjb3JhdGlvbkNhY2hlLmdldChlbnRyeS51cmkpO1xuXHRcdFx0XHRpZiAocmVjKSB7XG5cdFx0XHRcdFx0cmVjLnJhbmdlVXBkYXRlVmVyc2lvbklkID0gZW50cnkuZG9jdjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWRlYm91bmNlSW52YWxpZGF0ZS5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdGRlYm91bmNlSW52YWxpZGF0ZS5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdHRoaXMucmVzdWx0cy5vblJlc3VsdHNDaGFuZ2VkLFxuXHRcdFx0dGhpcy5yZXN1bHRzLm9uVGVzdENoYW5nZWQsXG5cdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLm9uVGVzdEV4Y2x1c2lvbnNDaGFuZ2VkLFxuXHRcdFx0RXZlbnQuZmlsdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlc3RpbmdDb25maWdLZXlzLkd1dHRlckVuYWJsZWQpKSxcblx0XHQpKCgpID0+IHtcblx0XHRcdGlmICghZGVib3VuY2VJbnZhbGlkYXRlLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0ZGVib3VuY2VJbnZhbGlkYXRlLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoR3V0dGVyQWN0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyR3V0dGVyQWN0aW9uc0dlbmVyYXRvcigoY29udGV4dCwgcmVzdWx0KSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvbnRleHQuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCB0ZXN0aW5nRGVjb3JhdGlvbnMgPSBUZXN0aW5nRGVjb3JhdGlvbnMuZ2V0KGNvbnRleHQuZWRpdG9yKTtcblx0XHRcdGlmICghbW9kZWwgfHwgIXRlc3RpbmdEZWNvcmF0aW9ucz8uY3VycmVudFVyaSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnREZWNvcmF0aW9ucyA9IHRoaXMuc3luY0RlY29yYXRpb25zKHRlc3RpbmdEZWNvcmF0aW9ucy5jdXJyZW50VXJpKTtcblx0XHRcdGlmICghY3VycmVudERlY29yYXRpb25zLnNpemUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbERlY29yYXRpb25zID0gbW9kZWwuZ2V0TGluZXNEZWNvcmF0aW9ucyhjb250ZXh0LmxpbmVOdW1iZXIsIGNvbnRleHQubGluZU51bWJlcik7XG5cdFx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiBtb2RlbERlY29yYXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGRlY29yYXRpb24gPSBjdXJyZW50RGVjb3JhdGlvbnMuZ2V0QnlJZChpZCk7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBvYmplY3Q6IGFjdGlvbnMgfSA9IGRlY29yYXRpb24uZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goYWN0aW9uLCAnMV90ZXN0aW5nJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBpbnZhbGlkYXRlUmVzdWx0TWVzc2FnZShtZXNzYWdlOiBJVGVzdE1lc3NhZ2UpIHtcblx0XHR0aGlzLmludmFsaWRhdGVkTWVzc2FnZXMuYWRkKG1lc3NhZ2UpO1xuXHRcdHRoaXMuaW52YWxpZGF0ZSgpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBzeW5jRGVjb3JhdGlvbnMocmVzb3VyY2U6IFVSSSk6IENhY2hlZERlY29yYXRpb25zIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbmV3IENhY2hlZERlY29yYXRpb25zKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5kZWNvcmF0aW9uQ2FjaGUuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoY2FjaGVkICYmIGNhY2hlZC5nZW5lcmF0aW9uID09PSB0aGlzLmdlbmVyYXRpb24gJiYgKGNhY2hlZC5yYW5nZVVwZGF0ZVZlcnNpb25JZCA9PT0gdW5kZWZpbmVkIHx8IGNhY2hlZC5yYW5nZVVwZGF0ZVZlcnNpb25JZCAhPT0gbW9kZWwuZ2V0VmVyc2lvbklkKCkpKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkLnZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmFwcGx5RGVjb3JhdGlvbnMobW9kZWwpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXREZWNvcmF0ZWRUZXN0UG9zaXRpb24ocmVzb3VyY2U6IFVSSSwgdGVzdElkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlY29yYXRpb24gPSBJdGVyYWJsZS5maW5kKHRoaXMuc3luY0RlY29yYXRpb25zKHJlc291cmNlKSwgdiA9PiB2IGluc3RhbmNlb2YgUnVuVGVzdERlY29yYXRpb24gJiYgdi5pc0ZvclRlc3QodGVzdElkKSk7XG5cdFx0aWYgKCFkZWNvcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIGRlY29yYXRpb24gaXMgY29sbGFwc2VkLCBzbyB0aGUgcmFuZ2UgaXMgbWVhbmluZ2xlc3M7IG9ubHkgcG9zaXRpb24gbWF0dGVycy5cblx0XHRyZXR1cm4gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb24uaWQpPy5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIGludmFsaWRhdGUoKSB7XG5cdFx0dGhpcy5nZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHdoZXRoZXIgYWx0ZXJuYXRlIGFjdGlvbnMgYXJlIHNob3duIGZvciB0aGUgbW9kZWwuXG5cdCAqL1xuXHRwdWJsaWMgdXBkYXRlRGVjb3JhdGlvbnNBbHRlcm5hdGVBY3Rpb24ocmVzb3VyY2U6IFVSSSwgaXNBbHQ6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmRlY29yYXRpb25DYWNoZS5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwgfHwgIWNhY2hlZCB8fCBjYWNoZWQuaXNBbHQgPT09IGlzQWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2FjaGVkLmlzQWx0ID0gaXNBbHQ7XG5cdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGNhY2hlZC52YWx1ZSkge1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbiBpbnN0YW5jZW9mIFJ1blRlc3REZWNvcmF0aW9uICYmIGRlY29yYXRpb24uZWRpdG9yRGVjb3JhdGlvbi5hbHRlcm5hdGUpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyhcblx0XHRcdFx0XHRcdGRlY29yYXRpb24uaWQsXG5cdFx0XHRcdFx0XHRpc0FsdCA/IGRlY29yYXRpb24uZWRpdG9yRGVjb3JhdGlvbi5hbHRlcm5hdGUgOiBkZWNvcmF0aW9uLmVkaXRvckRlY29yYXRpb24ub3B0aW9ucyxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyB0aGUgY3VycmVudCBzZXQgb2YgdGVzdCBkZWNvcmF0aW9ucyB0byB0aGUgZ2l2ZW4gdGV4dCBtb2RlbC5cblx0ICovXG5cdHByaXZhdGUgYXBwbHlEZWNvcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGNvbnN0IGd1dHRlckVuYWJsZWQgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5HdXR0ZXJFbmFibGVkKTtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmRlY29yYXRpb25DYWNoZS5nZXQobW9kZWwudXJpKTtcblx0XHRjb25zdCB0ZXN0UmFuZ2VzVXBkYXRlZCA9IGNhY2hlZD8ucmFuZ2VVcGRhdGVWZXJzaW9uSWQgPT09IG1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IGxhc3REZWNvcmF0aW9ucyA9IGNhY2hlZD8udmFsdWUgPz8gbmV3IENhY2hlZERlY29yYXRpb25zKCk7XG5cblx0XHRjb25zdCBuZXdEZWNvcmF0aW9ucyA9IG1vZGVsLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IG5ld0RlY29yYXRpb25zID0gbmV3IENhY2hlZERlY29yYXRpb25zKCk7XG5cdFx0XHRjb25zdCBydW5EZWNvcmF0aW9ucyA9IG5ldyBUZXN0RGVjb3JhdGlvbnM8eyBsaW5lOiBudW1iZXI7IGlkOiAnJzsgdGVzdDogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW07IHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLmdldE5vZGVCeVVybChtb2RlbC51cmkpKSB7XG5cdFx0XHRcdGlmICghdGVzdC5pdGVtLnJhbmdlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGF0ZUxvb2t1cCA9IHRoaXMucmVzdWx0cy5nZXRTdGF0ZUJ5SWQodGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdFx0Y29uc3QgbGluZSA9IHRlc3QuaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdHJ1bkRlY29yYXRpb25zLnB1c2goeyBsaW5lLCBpZDogJycsIHRlc3QsIHJlc3VsdEl0ZW06IHN0YXRlTG9va3VwPy5bMV0gfSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgW2xpbmUsIHRlc3RzXSBvZiBydW5EZWNvcmF0aW9ucy5saW5lcygpKSB7XG5cdFx0XHRcdGNvbnN0IG11bHRpID0gdGVzdHMubGVuZ3RoID4gMTtcblx0XHRcdFx0bGV0IGV4aXN0aW5nID0gbGFzdERlY29yYXRpb25zLmdldEZvckV4YWN0VGVzdHModGVzdHMubWFwKHQgPT4gdC50ZXN0Lml0ZW0uZXh0SWQpKTtcblxuXHRcdFx0XHQvLyBzZWUgY29tbWVudCBpbiB0aGUgY29uc3RydWN0b3IgZm9yIHdoYXQncyBnb2luZyBvbiBoZXJlXG5cdFx0XHRcdGlmIChleGlzdGluZyAmJiB0ZXN0UmFuZ2VzVXBkYXRlZCAmJiBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoZXhpc3RpbmcuaWQpPy5zdGFydExpbmVOdW1iZXIgIT09IGxpbmUpIHtcblx0XHRcdFx0XHRleGlzdGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdGlmIChleGlzdGluZy5yZXBsYWNlT3B0aW9ucyh0ZXN0cywgZ3V0dGVyRW5hYmxlZCkpIHtcblx0XHRcdFx0XHRcdGFjY2Vzc29yLmNoYW5nZURlY29yYXRpb25PcHRpb25zKGV4aXN0aW5nLmlkLCBleGlzdGluZy5lZGl0b3JEZWNvcmF0aW9uLm9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5hZGRUZXN0KGV4aXN0aW5nKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5hZGRUZXN0KG11bHRpXG5cdFx0XHRcdFx0XHQ/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTXVsdGlSdW5UZXN0RGVjb3JhdGlvbiwgdGVzdHMsIGd1dHRlckVuYWJsZWQsIG1vZGVsKVxuXHRcdFx0XHRcdFx0OiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJ1blNpbmdsZVRlc3REZWNvcmF0aW9uLCB0ZXN0c1swXS50ZXN0LCB0ZXN0c1swXS5yZXN1bHRJdGVtLCBtb2RlbCwgZ3V0dGVyRW5hYmxlZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNhdmVGcm9tUmVtb3ZhbCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIG5ld0RlY29yYXRpb25zKSB7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uLmlkID09PSAnJykge1xuXHRcdFx0XHRcdGRlY29yYXRpb24uaWQgPSBhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKGRlY29yYXRpb24uZWRpdG9yRGVjb3JhdGlvbi5yYW5nZSwgZGVjb3JhdGlvbi5lZGl0b3JEZWNvcmF0aW9uLm9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNhdmVGcm9tUmVtb3ZhbC5hZGQoZGVjb3JhdGlvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGxhc3REZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAoIXNhdmVGcm9tUmVtb3ZhbC5oYXMoZGVjb3JhdGlvbi5pZCkpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGRlY29yYXRpb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZGVjb3JhdGlvbkNhY2hlLnNldChtb2RlbC51cmksIHtcblx0XHRcdFx0Z2VuZXJhdGlvbjogdGhpcy5nZW5lcmF0aW9uLFxuXHRcdFx0XHRyYW5nZVVwZGF0ZVZlcnNpb25JZDogY2FjaGVkPy5yYW5nZVVwZGF0ZVZlcnNpb25JZCxcblx0XHRcdFx0dmFsdWU6IG5ld0RlY29yYXRpb25zLFxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBuZXdEZWNvcmF0aW9ucztcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXdEZWNvcmF0aW9ucyB8fCBsYXN0RGVjb3JhdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdEZWNvcmF0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0LyoqXG5cdCAqIFJlc3VsdHMgaW52YWxpZGF0ZWQgYnkgZWRpdG9yIGNoYW5nZXMuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGludmFsaWRhdGVkVGVzdHMgPSBuZXcgV2Vha1NldDxUZXN0UmVzdWx0SXRlbSB8IElUZXN0TWVzc2FnZT4oKTtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgZGVjb3JhdGlvbnMgYXNzb2NpYXRlZCB3aXRoIHRoZSBnaXZlbiBjb2RlIGVkaXRvci5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBUZXN0aW5nRGVjb3JhdGlvbnMgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxUZXN0aW5nRGVjb3JhdGlvbnM+KFRlc3RpbmcuRGVjb3JhdGlvbnNDb250cmlidXRpb25JZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRVcmkoKSB7IHJldHVybiB0aGlzLl9jdXJyZW50VXJpOyB9XG5cblx0cHJpdmF0ZSBfY3VycmVudFVyaT86IFVSSTtcblx0cHJpdmF0ZSByZWFkb25seSBleHBlY3RlZFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxFeHBlY3RlZExlbnNDb250ZW50V2lkZ2V0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3R1YWxXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8QWN0dWFsTGVuc0NvbnRlbnRXaWRnZXQ+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZXJyb3JDb250ZW50V2lkZ2V0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPElUZXN0TWVzc2FnZSwgVGVzdEVycm9yQ29udGVudFdpZGdldD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VkTWVzc2FnZURlY29yYXRpb25zID0gbmV3IE1hcDxJVGVzdE1lc3NhZ2UsIHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdGxpbmU6IG51bWJlcjtcblx0XHRyZXN1bHRJdGVtOiBUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZDtcblx0fT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0aW5nRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnM6IElUZXN0aW5nRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXN1bHRzOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCd0ZXN0LW1lc3NhZ2UtZGVjb3JhdGlvbicsIFRlc3RNZXNzYWdlRGVjb3JhdGlvbi5kZWNvcmF0aW9uSWQsIHt9LCB1bmRlZmluZWQsIGVkaXRvcikpO1xuXG5cdFx0dGhpcy5hdHRhY2hNb2RlbChlZGl0b3IuZ2V0TW9kZWwoKT8udXJpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWNvcmF0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFVyaSkge1xuXHRcdFx0XHRkZWNvcmF0aW9ucy5zeW5jRGVjb3JhdGlvbnModGhpcy5fY3VycmVudFVyaSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbXNnVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlc3VsdHMub25UZXN0Q2hhbmdlZChldiA9PiB7XG5cdFx0XHRpZiAoZXYucmVhc29uICE9PSBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5OZXdNZXNzYWdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bXNnVGhyb3R0bGVyLnF1ZXVlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5hcHBseVJlc3VsdHMoKTtcblx0XHRcdFx0cmV0dXJuIHRpbWVvdXQoMTAwKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdHRoaXMucmVzdWx0cy5vblJlc3VsdHNDaGFuZ2VkLFxuXHRcdFx0ZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsXG5cdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLnNob3dJbmxpbmVPdXRwdXQub25EaWRDaGFuZ2UsXG5cdFx0KSgoKSA9PiB0aGlzLmFwcGx5UmVzdWx0cygpKSk7XG5cblx0XHRjb25zdCB3aW4gPSBkb20uZ2V0V2luZG93KGVkaXRvci5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0aWYgKG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkua2V5Q29kZSA9PT0gS2V5Q29kZS5BbHQgJiYgdGhpcy5fY3VycmVudFVyaSkge1xuXHRcdFx0XHRkZWNvcmF0aW9ucy51cGRhdGVEZWNvcmF0aW9uc0FsdGVybmF0ZUFjdGlvbih0aGlzLl9jdXJyZW50VXJpLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW4sICdrZXl1cCcsIGUgPT4ge1xuXHRcdFx0aWYgKG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkua2V5Q29kZSA9PT0gS2V5Q29kZS5BbHQgJiYgdGhpcy5fY3VycmVudFVyaSkge1xuXHRcdFx0XHRkZWNvcmF0aW9ucy51cGRhdGVEZWNvcmF0aW9uc0FsdGVybmF0ZUFjdGlvbih0aGlzLl9jdXJyZW50VXJpLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luLCAnYmx1cicsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50VXJpKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zLnVwZGF0ZURlY29yYXRpb25zQWx0ZXJuYXRlQWN0aW9uKHRoaXMuX2N1cnJlbnRVcmksIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25LZXlVcChlID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuQWx0ICYmIHRoaXMuX2N1cnJlbnRVcmkpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMudXBkYXRlRGVjb3JhdGlvbnNBbHRlcm5hdGVBY3Rpb24odGhpcy5fY3VycmVudFVyaSEsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbChlID0+IHRoaXMuYXR0YWNoTW9kZWwoZS5uZXdNb2RlbFVybCB8fCB1bmRlZmluZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQucG9zaXRpb24gJiYgdGhpcy5jdXJyZW50VXJpKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsRGVjb3JhdGlvbnMgPSBlZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZURlY29yYXRpb25zKGUudGFyZ2V0LnBvc2l0aW9uLmxpbmVOdW1iZXIpID8/IFtdO1xuXHRcdFx0XHRpZiAoIW1vZGVsRGVjb3JhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2FjaGUgPSBkZWNvcmF0aW9ucy5zeW5jRGVjb3JhdGlvbnModGhpcy5jdXJyZW50VXJpKTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGlkIH0gb2YgbW9kZWxEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRcdGlmICgoY2FjaGUuZ2V0QnlJZChpZCkgYXMgSVRlc3REZWNvcmF0aW9uIHwgdW5kZWZpbmVkKT8uY2xpY2soZSkpIHtcblx0XHRcdFx0XHRcdGUuZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFjY3VtdWxhdGUodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQsIDAsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpKGV2dHMgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghdGhpcy5fY3VycmVudFVyaSB8fCAhbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBbbWVzc2FnZSwgZGVjb10gb2YgdGhpcy5sb2dnZWRNZXNzYWdlRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0Ly8gaW52YWxpZGF0ZSBkZWNvcmF0aW9ucyBpZiBlaXRoZXIgdGhlIGxpbmUgdGhleSdyZSBvbiB3YXMgY2hhbmdlZCxcblx0XHRcdFx0Ly8gb3IgaWYgdGhlIHJhbmdlIG9mIHRoZSB0ZXN0IHdhcyBjaGFuZ2VkLiBUaGUgcmFuZ2Ugb2YgdGhlIHRlc3QgaXNcblx0XHRcdFx0Ly8gbm90IGFsd2F5cyBwcmVzZW50LCBzbyBjaGVjayBiby5cblx0XHRcdFx0Y29uc3QgaW52YWxpZGF0ZSA9IGV2dHMuc29tZShlID0+IGUuY2hhbmdlcy5zb21lKGMgPT5cblx0XHRcdFx0XHRjLnJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSBkZWNvLmxpbmUgJiYgYy5yYW5nZS5lbmRMaW5lTnVtYmVyID49IGRlY28ubGluZVxuXHRcdFx0XHRcdHx8IChkZWNvLnJlc3VsdEl0ZW0/Lml0ZW0ucmFuZ2UgJiYgZGVjby5yZXN1bHRJdGVtLml0ZW0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDw9IGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGRlY28ucmVzdWx0SXRlbS5pdGVtLnJhbmdlLmVuZExpbmVOdW1iZXIgPj0gYy5yYW5nZS5lbmRMaW5lTnVtYmVyKVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRpZiAoaW52YWxpZGF0ZSkge1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFRlc3RpbmdEZWNvcmF0aW9ucy5pbnZhbGlkYXRlZFRlc3RzLmFkZChkZWNvLnJlc3VsdEl0ZW0gfHwgbWVzc2FnZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5hcHBseVJlc3VsdHMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVGb250RmFtaWx5VmFyID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLnN0eWxlLnNldFByb3BlcnR5KCctLXRlc3RNZXNzYWdlRGVjb3JhdGlvbkZvbnRGYW1pbHknLCBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250RmFtaWx5KSk7XG5cdFx0XHR0aGlzLmVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkuc3R5bGUuc2V0UHJvcGVydHkoJy0tdGVzdE1lc3NhZ2VEZWNvcmF0aW9uRm9udFNpemUnLCBgJHtlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSl9cHhgKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEZhbWlseSkpIHtcblx0XHRcdFx0dXBkYXRlRm9udEZhbWlseVZhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR1cGRhdGVGb250RmFtaWx5VmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGF0dGFjaE1vZGVsKHVyaT86IFVSSSkge1xuXHRcdHN3aXRjaCAodXJpICYmIHBhcnNlVGVzdFVyaSh1cmkpPy50eXBlKSB7XG5cdFx0XHRjYXNlIFRlc3RVcmlUeXBlLlJlc3VsdEV4cGVjdGVkT3V0cHV0OlxuXHRcdFx0XHR0aGlzLmV4cGVjdGVkV2lkZ2V0LnZhbHVlID0gbmV3IEV4cGVjdGVkTGVuc0NvbnRlbnRXaWRnZXQodGhpcy5lZGl0b3IpO1xuXHRcdFx0XHR0aGlzLmFjdHVhbFdpZGdldC5jbGVhcigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVGVzdFVyaVR5cGUuUmVzdWx0QWN0dWFsT3V0cHV0OlxuXHRcdFx0XHR0aGlzLmV4cGVjdGVkV2lkZ2V0LmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuYWN0dWFsV2lkZ2V0LnZhbHVlID0gbmV3IEFjdHVhbExlbnNDb250ZW50V2lkZ2V0KHRoaXMuZWRpdG9yKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLmV4cGVjdGVkV2lkZ2V0LmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuYWN0dWFsV2lkZ2V0LmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzT3JpZ2luYWxJbkRpZmZFZGl0b3IodGhpcy5jb2RlRWRpdG9yU2VydmljZSwgdGhpcy5lZGl0b3IpKSB7XG5cdFx0XHR1cmkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudFVyaSA9IHVyaTtcblxuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kZWNvcmF0aW9ucy5zeW5jRGVjb3JhdGlvbnModXJpKTtcblxuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IF90ZXN0cyBvZiB0ZXN0c0luRmlsZSh0aGlzLnRlc3RTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdXJpLCBmYWxzZSkpIHtcblx0XHRcdFx0Ly8gY29uc3VtZSB0aGUgaXRlcmF0b3Igc28gdGhhdCBhbGwgdGVzdHMgaW4gdGhlIGZpbGUgZ2V0IGV4cGFuZGVkLiBPclxuXHRcdFx0XHQvLyBhdCBsZWFzdCB1bnRpbCB0aGUgVVJJIGNoYW5nZXMuIElmIG5ldyBpdGVtcyBhcmUgcmVxdWVzdGVkLCBjaGFuZ2VzXG5cdFx0XHRcdC8vIHdpbGwgYmUgdHJpZ2dlZCBpbiB0aGUgYG9uRGlkUHJvY2Vzc0RpZmZgIGNhbGxiYWNrLlxuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFVyaSAhPT0gdXJpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVJlc3VsdHMoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLmNsZWFyUmVzdWx0cygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaVN0ciA9IG1vZGVsLnVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlZW5MaW5lcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdHRoaXMuYXBwbHlSZXN1bHRzQ29udGVudFdpZGdldHModXJpU3RyLCBzZWVuTGluZXMpO1xuXHRcdHRoaXMuYXBwbHlSZXN1bHRzTG9nZ2VkTWVzc2FnZXModXJpU3RyLCBzZWVuTGluZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclJlc3VsdHMoKSB7XG5cdFx0dGhpcy5lcnJvckNvbnRlbnRXaWRnZXRzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc01lc3NhZ2VJbnZhbGlkYXRlZChtZXNzYWdlOiBJVGVzdE1lc3NhZ2UpIHtcblx0XHRyZXR1cm4gVGVzdGluZ0RlY29yYXRpb25zLmludmFsaWRhdGVkVGVzdHMuaGFzKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVJlc3VsdHNDb250ZW50V2lkZ2V0cyh1cmlTdHI6IHN0cmluZywgc2VlbkxpbmVzOiBTZXQ8bnVtYmVyPikge1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PElUZXN0TWVzc2FnZT4oKTtcblx0XHRpZiAoZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuU2hvd0FsbE1lc3NhZ2VzKSkge1xuXHRcdFx0dGhpcy5yZXN1bHRzLnJlc3VsdHMuZm9yRWFjaChsYXN0UmVzdWx0ID0+IHRoaXMuYXBwbHlDb250ZW50V2lkZ2V0c0Zyb21SZXN1bHQobGFzdFJlc3VsdCwgdXJpU3RyLCBzZWVuLCBzZWVuTGluZXMpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMucmVzdWx0cy5yZXN1bHRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5hcHBseUNvbnRlbnRXaWRnZXRzRnJvbVJlc3VsdCh0aGlzLnJlc3VsdHMucmVzdWx0c1swXSwgdXJpU3RyLCBzZWVuLCBzZWVuTGluZXMpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiB0aGlzLmVycm9yQ29udGVudFdpZGdldHMua2V5cygpKSB7XG5cdFx0XHRpZiAoIXNlZW4uaGFzKG1lc3NhZ2UpKSB7XG5cdFx0XHRcdHRoaXMuZXJyb3JDb250ZW50V2lkZ2V0cy5kZWxldGVBbmREaXNwb3NlKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlDb250ZW50V2lkZ2V0c0Zyb21SZXN1bHQobGFzdFJlc3VsdDogSVRlc3RSZXN1bHQsIHVyaVN0cjogc3RyaW5nLCBzZWVuOiBTZXQ8SVRlc3RNZXNzYWdlPiwgc2VlbkxpbmVzOiBTZXQ8bnVtYmVyPikge1xuXHRcdGZvciAoY29uc3QgdGVzdCBvZiBsYXN0UmVzdWx0LnRlc3RzKSB7XG5cdFx0XHRpZiAoVGVzdGluZ0RlY29yYXRpb25zLmludmFsaWRhdGVkVGVzdHMuaGFzKHRlc3QpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgdGFza0lkID0gMDsgdGFza0lkIDwgdGVzdC50YXNrcy5sZW5ndGg7IHRhc2tJZCsrKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGVzdC50YXNrc1t0YXNrSWRdO1xuXHRcdFx0XHQvLyBwdXNoIGVycm9yIGRlY29yYXRpb25zIGZpcnN0IHNvIHRoZXkgdGFrZSBwcmVjZWRlbmNlIG92ZXIgbm9ybWFsIG91dHB1dFxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0YXRlLm1lc3NhZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbSA9IHN0YXRlLm1lc3NhZ2VzW2ldO1xuXHRcdFx0XHRcdGlmIChtLnR5cGUgIT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvciB8fCB0aGlzLmlzTWVzc2FnZUludmFsaWRhdGVkKG0pKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBsaW5lOiBudW1iZXIgfCB1bmRlZmluZWQgPSBtLmxvY2F0aW9uPy51cmkudG9TdHJpbmcoKSA9PT0gdXJpU3RyXG5cdFx0XHRcdFx0XHQ/IG0ubG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0XHQ6IG0uc3RhY2tUcmFjZSAmJiBtYXBGaW5kRmlyc3QobS5zdGFja1RyYWNlLCAoZikgPT4gZi5wb3NpdGlvbiAmJiBmLnVyaT8udG9TdHJpbmcoKSA9PT0gdXJpU3RyID8gZi5wb3NpdGlvbi5saW5lTnVtYmVyIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRpZiAobGluZSA9PT0gdW5kZWZpbmVkIHx8IHNlZW5MaW5lcy5oYXMobGluZSkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0XHRpZiAobW9kZWwgJiYgKGxpbmUgPCAxIHx8IGxpbmUgPiBtb2RlbC5nZXRMaW5lQ291bnQoKSkpIHtcblx0XHRcdFx0XHRcdC8vIFRoZSBtZXNzYWdlIGxvY2F0aW9uIHdhcyByZWNvcmRlZCBhZ2FpbnN0IGEgcHJldmlvdXMgZG9jdW1lbnRcblx0XHRcdFx0XHRcdC8vIHN0YXRlOyB0aGUgcmVmZXJlbmNlZCBsaW5lIG5vIGxvbmdlciBleGlzdHMgYWZ0ZXIgZWRpdHMuXG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzZWVuTGluZXMuYWRkKGxpbmUpO1xuXHRcdFx0XHRcdGxldCBkZWNvID0gdGhpcy5lcnJvckNvbnRlbnRXaWRnZXRzLmdldChtKTtcblx0XHRcdFx0XHRpZiAoIWRlY28pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBtb2RlbD8uZ2V0TGluZUxlbmd0aChsaW5lKSA/PyAxMDA7XG5cdFx0XHRcdFx0XHRkZWNvID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdFx0VGVzdEVycm9yQ29udGVudFdpZGdldCxcblx0XHRcdFx0XHRcdFx0dGhpcy5lZGl0b3IsXG5cdFx0XHRcdFx0XHRcdG5ldyBQb3NpdGlvbihsaW5lLCBsaW5lTGVuZ3RoICsgMSksXG5cdFx0XHRcdFx0XHRcdG0sXG5cdFx0XHRcdFx0XHRcdHRlc3QsXG5cdFx0XHRcdFx0XHRcdGJ1aWxkVGVzdFVyaSh7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogVGVzdFVyaVR5cGUuUmVzdWx0QWN0dWFsT3V0cHV0LFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2VJbmRleDogaSxcblx0XHRcdFx0XHRcdFx0XHR0YXNrSW5kZXg6IHRhc2tJZCxcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHRJZDogbGFzdFJlc3VsdC5pZCxcblx0XHRcdFx0XHRcdFx0XHR0ZXN0RXh0SWQ6IHRlc3QuaXRlbS5leHRJZCxcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR0aGlzLmVycm9yQ29udGVudFdpZGdldHMuc2V0KG0sIGRlY28pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZWVuLmFkZChtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlSZXN1bHRzTG9nZ2VkTWVzc2FnZXModXJpU3RyOiBzdHJpbmcsIG1lc3NhZ2VMaW5lczogU2V0PG51bWJlcj4pIHtcblx0XHR0aGlzLmVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxJVGVzdE1lc3NhZ2U+KCk7XG5cdFx0XHRpZiAoZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuU2hvd0FsbE1lc3NhZ2VzKSkge1xuXHRcdFx0XHR0aGlzLnJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHIgPT4gdGhpcy5hcHBseUxvZ2dlZE1lc3NhZ2VGcm9tUmVzdWx0KHIsIHVyaVN0ciwgc2VlbiwgbWVzc2FnZUxpbmVzLCBhY2Nlc3NvcikpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnJlc3VsdHMucmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5hcHBseUxvZ2dlZE1lc3NhZ2VGcm9tUmVzdWx0KHRoaXMucmVzdWx0cy5yZXN1bHRzWzBdLCB1cmlTdHIsIHNlZW4sIG1lc3NhZ2VMaW5lcywgYWNjZXNzb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IFttZXNzYWdlLCB7IGlkIH1dIG9mIHRoaXMubG9nZ2VkTWVzc2FnZURlY29yYXRpb25zKSB7XG5cdFx0XHRcdGlmICghc2Vlbi5oYXMobWVzc2FnZSkpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUxvZ2dlZE1lc3NhZ2VGcm9tUmVzdWx0KGxhc3RSZXN1bHQ6IElUZXN0UmVzdWx0LCB1cmlTdHI6IHN0cmluZywgc2VlbjogU2V0PElUZXN0TWVzc2FnZT4sIG1lc3NhZ2VMaW5lczogU2V0PG51bWJlcj4sIGFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yKSB7XG5cdFx0aWYgKCF0aGlzLnRlc3RTZXJ2aWNlLnNob3dJbmxpbmVPdXRwdXQudmFsdWUgfHwgIShsYXN0UmVzdWx0IGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJ5QWRkID0gKHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkLCBtOiBJVGVzdE1lc3NhZ2UsIHVyaT86IFVSSSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNNZXNzYWdlSW52YWxpZGF0ZWQobSkgfHwgbS5sb2NhdGlvbj8udXJpLnRvU3RyaW5nKCkgIT09IHVyaVN0cikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHNlZW4uYWRkKG0pO1xuXHRcdFx0Y29uc3QgbGluZSA9IG0ubG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKG1lc3NhZ2VMaW5lcy5oYXMobGluZSkgfHwgdGhpcy5sb2dnZWRNZXNzYWdlRGVjb3JhdGlvbnMuaGFzKG0pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVjbyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdE1lc3NhZ2VEZWNvcmF0aW9uLCBtLCB1cmksIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhKTtcblxuXHRcdFx0bWVzc2FnZUxpbmVzLmFkZChsaW5lKTtcblx0XHRcdGNvbnN0IGlkID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihcblx0XHRcdFx0ZGVjby5lZGl0b3JEZWNvcmF0aW9uLnJhbmdlLFxuXHRcdFx0XHRkZWNvLmVkaXRvckRlY29yYXRpb24ub3B0aW9ucyxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmxvZ2dlZE1lc3NhZ2VEZWNvcmF0aW9ucy5zZXQobSwgeyBpZCwgbGluZSwgcmVzdWx0SXRlbSB9KTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCB0ZXN0IG9mIGxhc3RSZXN1bHQudGVzdHMpIHtcblx0XHRcdGlmIChUZXN0aW5nRGVjb3JhdGlvbnMuaW52YWxpZGF0ZWRUZXN0cy5oYXModGVzdCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IHRhc2tJZCA9IDA7IHRhc2tJZCA8IHRlc3QudGFza3MubGVuZ3RoOyB0YXNrSWQrKykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRlc3QudGFza3NbdGFza0lkXTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHN0YXRlLm1lc3NhZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgbSA9IHN0YXRlLm1lc3NhZ2VzW2ldO1xuXHRcdFx0XHRcdGlmIChtLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQpIHtcblx0XHRcdFx0XHRcdHRyeUFkZCh0ZXN0LCBtLCBidWlsZFRlc3RVcmkoe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRBY3R1YWxPdXRwdXQsXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2VJbmRleDogaSxcblx0XHRcdFx0XHRcdFx0dGFza0luZGV4OiB0YXNrSWQsXG5cdFx0XHRcdFx0XHRcdHJlc3VsdElkOiBsYXN0UmVzdWx0LmlkLFxuXHRcdFx0XHRcdFx0XHR0ZXN0RXh0SWQ6IHRlc3QuaXRlbS5leHRJZCxcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgbGFzdFJlc3VsdC50YXNrcykge1xuXHRcdFx0Zm9yIChjb25zdCBtIG9mIHRhc2sub3RoZXJNZXNzYWdlcykge1xuXHRcdFx0XHR0cnlBZGQodW5kZWZpbmVkLCBtKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY29uc3QgY29sbGFwc2VSYW5nZSA9IChvcmlnaW5hbFJhbmdlOiBJUmFuZ2UpID0+ICh7XG5cdHN0YXJ0TGluZU51bWJlcjogb3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdGVuZExpbmVOdW1iZXI6IG9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRzdGFydENvbHVtbjogb3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbixcblx0ZW5kQ29sdW1uOiBvcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uLFxufSk7XG5cbmNvbnN0IGNyZWF0ZVJ1blRlc3REZWNvcmF0aW9uID0gKFxuXHR0ZXN0czogcmVhZG9ubHkgSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW1bXSxcblx0c3RhdGVzOiByZWFkb25seSAoVGVzdFJlc3VsdEl0ZW0gfCB1bmRlZmluZWQpW10sXG5cdHZpc2libGU6IGJvb2xlYW4sXG5cdGRlZmF1bHRHdXR0ZXJBY3Rpb246IERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbixcbik6IElNb2RlbERlbHRhRGVjb3JhdGlvbiAmIHsgYWx0ZXJuYXRlPzogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSA9PiB7XG5cdGNvbnN0IHJhbmdlID0gdGVzdHNbMF0/Lml0ZW0ucmFuZ2U7XG5cdGlmICghcmFuZ2UpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rlc3QgZGVjb3JhdGlvbnMgY2FuIG9ubHkgYmUgY3JlYXRlZCBmb3IgdGVzdHMgd2l0aCBhIHJhbmdlJyk7XG5cdH1cblxuXHRpZiAoIXZpc2libGUpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IGNvbGxhcHNlUmFuZ2UocmFuZ2UpLFxuXHRcdFx0b3B0aW9uczogeyBpc1dob2xlTGluZTogdHJ1ZSwgZGVzY3JpcHRpb246ICdydW4tdGVzdC1kZWNvcmF0aW9uJyB9LFxuXHRcdH07XG5cdH1cblxuXHRsZXQgY29tcHV0ZWRTdGF0ZSA9IFRlc3RSZXN1bHRTdGF0ZS5VbnNldDtcblx0Y29uc3QgaG92ZXJNZXNzYWdlUGFydHM6IHN0cmluZ1tdID0gW107XG5cdGxldCB0ZXN0SWRXaXRoTWVzc2FnZXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHJldGlyZWQgPSBmYWxzZTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0ZXN0cy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHRlc3QgPSB0ZXN0c1tpXTtcblx0XHRjb25zdCByZXN1bHRJdGVtID0gc3RhdGVzW2ldO1xuXHRcdGNvbnN0IHN0YXRlID0gcmVzdWx0SXRlbT8uY29tcHV0ZWRTdGF0ZSA/PyBUZXN0UmVzdWx0U3RhdGUuVW5zZXQ7XG5cdFx0aWYgKGhvdmVyTWVzc2FnZVBhcnRzLmxlbmd0aCA8IDEwKSB7XG5cdFx0XHRob3Zlck1lc3NhZ2VQYXJ0cy5wdXNoKGxhYmVsRm9yVGVzdEluU3RhdGUodGVzdC5pdGVtLmxhYmVsLCBzdGF0ZSkpO1xuXHRcdH1cblx0XHRjb21wdXRlZFN0YXRlID0gbWF4UHJpb3JpdHkoY29tcHV0ZWRTdGF0ZSwgc3RhdGUpO1xuXHRcdHJldGlyZWQgPSByZXRpcmVkIHx8ICEhcmVzdWx0SXRlbT8ucmV0aXJlZDtcblx0XHRpZiAoIXRlc3RJZFdpdGhNZXNzYWdlcyAmJiByZXN1bHRJdGVtPy50YXNrcy5zb21lKHQgPT4gdC5tZXNzYWdlcy5sZW5ndGgpKSB7XG5cdFx0XHR0ZXN0SWRXaXRoTWVzc2FnZXMgPSB0ZXN0Lml0ZW0uZXh0SWQ7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgaGFzTXVsdGlwbGVUZXN0cyA9IHRlc3RzLmxlbmd0aCA+IDEgfHwgdGVzdHNbMF0uY2hpbGRyZW4uc2l6ZSA+IDA7XG5cblx0Y29uc3QgcHJpbWFyeUljb24gPSBjb21wdXRlZFN0YXRlID09PSBUZXN0UmVzdWx0U3RhdGUuVW5zZXRcblx0XHQ/IChoYXNNdWx0aXBsZVRlc3RzID8gdGVzdGluZ1J1bkFsbEljb24gOiB0ZXN0aW5nUnVuSWNvbilcblx0XHQ6IHRlc3RpbmdTdGF0ZXNUb0ljb25zLmdldChjb21wdXRlZFN0YXRlKSE7XG5cblx0Y29uc3QgYWx0ZXJuYXRlSWNvbiA9IGRlZmF1bHRHdXR0ZXJBY3Rpb24gPT09IERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5EZWJ1Z1xuXHRcdD8gKGhhc011bHRpcGxlVGVzdHMgPyB0ZXN0aW5nUnVuQWxsSWNvbiA6IHRlc3RpbmdSdW5JY29uKVxuXHRcdDogKGhhc011bHRpcGxlVGVzdHMgPyB0ZXN0aW5nRGVidWdBbGxJY29uIDogdGVzdGluZ0RlYnVnSWNvbik7XG5cblx0bGV0IGhvdmVyTWVzc2FnZTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGxldCBnbHlwaE1hcmdpbkNsYXNzTmFtZSA9ICd0ZXN0aW5nLXJ1bi1nbHlwaCc7XG5cdGlmIChyZXRpcmVkKSB7XG5cdFx0Z2x5cGhNYXJnaW5DbGFzc05hbWUgKz0gJyByZXRpcmVkJztcblx0fVxuXG5cdGNvbnN0IGRlZmF1bHRPcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRkZXNjcmlwdGlvbjogJ3J1bi10ZXN0LWRlY29yYXRpb24nLFxuXHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRnZXQgaG92ZXJNZXNzYWdlKCkge1xuXHRcdFx0aWYgKCFob3Zlck1lc3NhZ2UpIHtcblx0XHRcdFx0Y29uc3QgYnVpbGRpbmcgPSBob3Zlck1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHRydWUpLmFwcGVuZFRleHQoaG92ZXJNZXNzYWdlUGFydHMuam9pbignLCAnKSArICcuJyk7XG5cdFx0XHRcdGlmICh0ZXN0SWRXaXRoTWVzc2FnZXMpIHtcblx0XHRcdFx0XHRjb25zdCBhcmdzID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KFt0ZXN0SWRXaXRoTWVzc2FnZXNdKSk7XG5cdFx0XHRcdFx0YnVpbGRpbmcuYXBwZW5kTWFya2Rvd24oYCBbJHtsb2NhbGl6ZSgncGVla1Rlc3RPdXRvdXQnLCAnUGVlayBUZXN0IE91dHB1dCcpfV0oY29tbWFuZDp2c2NvZGUucGVla1Rlc3RFcnJvcj8ke2FyZ3N9KWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBob3Zlck1lc3NhZ2U7XG5cdFx0fSxcblx0XHRnbHlwaE1hcmdpbjogeyBwb3NpdGlvbjogR0xZUEhfTUFSR0lOX0xBTkUgfSxcblx0XHRnbHlwaE1hcmdpbkNsYXNzTmFtZTogYCR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHByaW1hcnlJY29uKX0gJHtnbHlwaE1hcmdpbkNsYXNzTmFtZX1gLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdHpJbmRleDogMTAwMDAsXG5cdFx0b3ZlcnZpZXdSdWxlcjogaXNGYWlsZWRTdGF0ZShjb21wdXRlZFN0YXRlKSA/IHsgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlckVycm9yKSwgcG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlciB9IDogdW5kZWZpbmVkLFxuXHR9O1xuXG5cdGNvbnN0IGFsdGVybmF0ZU9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdC4uLmRlZmF1bHRPcHRpb25zLFxuXHRcdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoYWx0ZXJuYXRlSWNvbil9ICR7Z2x5cGhNYXJnaW5DbGFzc05hbWV9YCxcblx0fTtcblxuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiBjb2xsYXBzZVJhbmdlKHJhbmdlKSxcblx0XHRvcHRpb25zOiBkZWZhdWx0T3B0aW9ucyxcblx0XHRhbHRlcm5hdGU6IGFsdGVybmF0ZU9wdGlvbnMsXG5cdH07XG59O1xuXG5jb25zdCBlbnVtIExlbnNDb250ZW50V2lkZ2V0VmFycyB7XG5cdEZvbnRGYW1pbHkgPSAndGVzdGluZ0RpZmZMZW5zRm9udEZhbWlseScsXG5cdEZvbnRGZWF0dXJlcyA9ICd0ZXN0aW5nRGlmZkxlbnNGb250RmVhdHVyZXMnLFxufVxuXG5hYnN0cmFjdCBjbGFzcyBUaXRsZUxlbnNDb250ZW50V2lkZ2V0IHtcblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gZmFsc2U7XG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd24gPSB0cnVlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGUgPSBkb20uJCgnc3BhbicpO1xuXHRwcml2YXRlIHZpZXdab25lSWQ/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0dGhpcy5hcHBseVN0eWxpbmcoKTtcblx0XHRcdHRoaXMuZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5U3R5bGluZygpIHtcblx0XHRsZXQgZm9udFNpemUgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udFNpemUpO1xuXHRcdGxldCBoZWlnaHQ6IG51bWJlcjtcblx0XHRpZiAoIWZvbnRTaXplIHx8IGZvbnRTaXplIDwgNSkge1xuXHRcdFx0Zm9udFNpemUgPSAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSkgKiAuOSkgfCAwO1xuXHRcdFx0aGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aGVpZ2h0ID0gKGZvbnRTaXplICogTWF0aC5tYXgoMS4zLCB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpIC8gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSkpKSB8IDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yRm9udEluZm8gPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fZG9tTm9kZTtcblx0XHRub2RlLmNsYXNzTGlzdC5hZGQoJ3Rlc3RpbmctZGlmZi1sZW5zLXdpZGdldCcpO1xuXHRcdG5vZGUudGV4dENvbnRlbnQgPSB0aGlzLmdldFRleHQoKTtcblx0XHRub2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdG5vZGUuc3R5bGUuZm9udFNpemUgPSBgJHtmb250U2l6ZX1weGA7XG5cdFx0bm9kZS5zdHlsZS5mb250RmFtaWx5ID0gYHZhcigtLSR7TGVuc0NvbnRlbnRXaWRnZXRWYXJzLkZvbnRGYW1pbHl9KWA7XG5cdFx0bm9kZS5zdHlsZS5mb250RmVhdHVyZVNldHRpbmdzID0gYHZhcigtLSR7TGVuc0NvbnRlbnRXaWRnZXRWYXJzLkZvbnRGZWF0dXJlc30pYDtcblxuXHRcdGNvbnN0IGNvbnRhaW5lclN0eWxlID0gdGhpcy5lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLnN0eWxlO1xuXHRcdGNvbnRhaW5lclN0eWxlLnNldFByb3BlcnR5KExlbnNDb250ZW50V2lkZ2V0VmFycy5Gb250RmFtaWx5LCB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udEZhbWlseSkgPz8gJ2luaGVyaXQnKTtcblx0XHRjb250YWluZXJTdHlsZS5zZXRQcm9wZXJ0eShMZW5zQ29udGVudFdpZGdldFZhcnMuRm9udEZlYXR1cmVzLCBlZGl0b3JGb250SW5mby5mb250RmVhdHVyZVNldHRpbmdzKTtcblxuXHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3Wm9uZUlkKSB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcy52aWV3Wm9uZUlkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy52aWV3Wm9uZUlkID0gYWNjZXNzb3IuYWRkWm9uZSh7XG5cdFx0XHRcdGFmdGVyTGluZU51bWJlcjogMCxcblx0XHRcdFx0YWZ0ZXJDb2x1bW46IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgYWJzdHJhY3QgZ2V0SWQoKTogc3RyaW5nO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHR0aGlzLmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0aWYgKHRoaXMudmlld1pvbmVJZCkge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKHRoaXMudmlld1pvbmVJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmVkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHsgY29sdW1uOiAwLCBsaW5lTnVtYmVyOiAwIH0sXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRV0sXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRUZXh0KCk6IHN0cmluZztcbn1cblxuY2xhc3MgRXhwZWN0ZWRMZW5zQ29udGVudFdpZGdldCBleHRlbmRzIFRpdGxlTGVuc0NvbnRlbnRXaWRnZXQge1xuXHRwdWJsaWMgZ2V0SWQoKSB7XG5cdFx0cmV0dXJuICdleHBlY3RlZFRlc3RpbmdMZW5zJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUZXh0KCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnZXhwZWN0ZWQudGl0bGUnLCAnRXhwZWN0ZWQnKTtcblx0fVxufVxuXG5cbmNsYXNzIEFjdHVhbExlbnNDb250ZW50V2lkZ2V0IGV4dGVuZHMgVGl0bGVMZW5zQ29udGVudFdpZGdldCB7XG5cdHB1YmxpYyBnZXRJZCgpIHtcblx0XHRyZXR1cm4gJ2FjdHVhbFRlc3RpbmdMZW5zJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUZXh0KCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWN0dWFsLnRpdGxlJywgJ0FjdHVhbCcpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIFJ1blRlc3REZWNvcmF0aW9uIHtcblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBpZCA9ICcnO1xuXG5cdHB1YmxpYyBnZXQgbGluZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JEZWNvcmF0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGVzdElkcygpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0cy5tYXAodCA9PiB0LnRlc3QuaXRlbS5leHRJZCk7XG5cdH1cblxuXHRwdWJsaWMgZWRpdG9yRGVjb3JhdGlvbjogSU1vZGVsRGVsdGFEZWNvcmF0aW9uICYgeyBhbHRlcm5hdGU/OiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9O1xuXHRwdWJsaWMgZGlzcGxheWVkU3RhdGVzOiByZWFkb25seSAoVGVzdFJlc3VsdFN0YXRlIHwgdW5kZWZpbmVkKVtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCB0ZXN0czogcmVhZG9ubHkge1xuXHRcdFx0dGVzdDogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW07XG5cdFx0XHRyZXN1bHRJdGVtOiBUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZDtcblx0XHR9W10sXG5cdFx0cHJpdmF0ZSB2aXNpYmxlOiBib29sZWFuLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBtb2RlbDogSVRleHRNb2RlbCxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdFByb2ZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB0ZXN0UHJvZmlsZVNlcnZpY2U6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmRpc3BsYXllZFN0YXRlcyA9IHRlc3RzLm1hcCh0ID0+IHQucmVzdWx0SXRlbT8uY29tcHV0ZWRTdGF0ZSk7XG5cdFx0dGhpcy5lZGl0b3JEZWNvcmF0aW9uID0gY3JlYXRlUnVuVGVzdERlY29yYXRpb24oXG5cdFx0XHR0ZXN0cy5tYXAodCA9PiB0LnRlc3QpLFxuXHRcdFx0dGVzdHMubWFwKHQgPT4gdC5yZXN1bHRJdGVtKSxcblx0XHRcdHZpc2libGUsXG5cdFx0XHRnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5EZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24pLFxuXHRcdCk7XG5cdFx0dGhpcy5lZGl0b3JEZWNvcmF0aW9uLm9wdGlvbnMuZ2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHRoaXMuZ2V0R3V0dGVyTGFiZWwoKSk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGNsaWNrKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOXG5cdFx0XHR8fCBlLnRhcmdldC5kZXRhaWwuZ2x5cGhNYXJnaW5MYW5lICE9PSBHTFlQSF9NQVJHSU5fTEFORVxuXHRcdFx0Ly8gaGFuZGxlZCBieSBlZGl0b3IgZ3V0dGVyIGNvbnRleHQgbWVudVxuXHRcdFx0fHwgZS5ldmVudC5yaWdodEJ1dHRvblxuXHRcdFx0fHwgaXNNYWNpbnRvc2ggJiYgZS5ldmVudC5sZWZ0QnV0dG9uICYmIGUuZXZlbnQuY3RybEtleVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsdGVybmF0ZUFjdGlvbiA9IGUuZXZlbnQuYWx0S2V5O1xuXHRcdHN3aXRjaCAoZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uKSkge1xuXHRcdFx0Y2FzZSBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uQ29udGV4dE1lbnU6XG5cdFx0XHRcdHRoaXMuc2hvd0NvbnRleHRNZW51KGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkRlYnVnOlxuXHRcdFx0XHR0aGlzLnJ1bldpdGgoYWx0ZXJuYXRlQWN0aW9uID8gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuIDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkNvdmVyYWdlOlxuXHRcdFx0XHR0aGlzLnJ1bldpdGgoYWx0ZXJuYXRlQWN0aW9uID8gVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcgOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uUnVuOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5ydW5XaXRoKGFsdGVybmF0ZUFjdGlvbiA/IFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnIDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgZGVjb3JhdGlvbiB0byBtYXRjaCB0aGUgbmV3IHNldCBvZiB0ZXN0cy5cblx0ICogQHJldHVybnMgdHJ1ZSBpZiBvcHRpb25zIHdlcmUgY2hhbmdlZCwgZmFsc2Ugb3RoZXJ3aXNlXG5cdCAqL1xuXHRwdWJsaWMgcmVwbGFjZU9wdGlvbnMobmV3VGVzdHM6IHJlYWRvbmx5IHtcblx0XHR0ZXN0OiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbTtcblx0XHRyZXN1bHRJdGVtOiBUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZDtcblx0fVtdLCB2aXNpYmxlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGlzcGxheWVkU3RhdGVzID0gbmV3VGVzdHMubWFwKHQgPT4gdC5yZXN1bHRJdGVtPy5jb21wdXRlZFN0YXRlKTtcblx0XHRpZiAodmlzaWJsZSA9PT0gdGhpcy52aXNpYmxlICYmIGVxdWFscyh0aGlzLmRpc3BsYXllZFN0YXRlcywgZGlzcGxheWVkU3RhdGVzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudGVzdHMgPSBuZXdUZXN0cztcblx0XHR0aGlzLmRpc3BsYXllZFN0YXRlcyA9IGRpc3BsYXllZFN0YXRlcztcblx0XHR0aGlzLnZpc2libGUgPSB2aXNpYmxlO1xuXG5cdFx0Y29uc3QgeyBvcHRpb25zLCBhbHRlcm5hdGUgfSA9IGNyZWF0ZVJ1blRlc3REZWNvcmF0aW9uKFxuXHRcdFx0bmV3VGVzdHMubWFwKHQgPT4gdC50ZXN0KSxcblx0XHRcdG5ld1Rlc3RzLm1hcCh0ID0+IHQucmVzdWx0SXRlbSksXG5cdFx0XHR2aXNpYmxlLFxuXHRcdFx0Z2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uKVxuXHRcdCk7XG5cblx0XHR0aGlzLmVkaXRvckRlY29yYXRpb24ub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5lZGl0b3JEZWNvcmF0aW9uLmFsdGVybmF0ZSA9IGFsdGVybmF0ZTtcblx0XHR0aGlzLmVkaXRvckRlY29yYXRpb24ub3B0aW9ucy5nbHlwaE1hcmdpbkhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQodGhpcy5nZXRHdXR0ZXJMYWJlbCgpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgdGhpcyBkZWNvcmF0aW9uIHNlcnZlcyBhcyB0aGUgcnVuIGJ1dHRvbiBmb3IgdGhlIGdpdmVuIHRlc3QgSUQuXG5cdCAqL1xuXHRwdWJsaWMgaXNGb3JUZXN0KHRlc3RJZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMudGVzdHMuc29tZSh0ID0+IHQudGVzdC5pdGVtLmV4dElkID09PSB0ZXN0SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBkZWNvcmF0aW9uIGlzIGNsaWNrZWQgb24uXG5cdCAqL1xuXHRhYnN0cmFjdCBnZXRDb250ZXh0TWVudUFjdGlvbnMoKTogSVJlZmVyZW5jZTxJQWN0aW9uW10+O1xuXG5cdHByb3RlY3RlZCBydW5XaXRoKHByb2ZpbGU6IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0cmV0dXJuIHRoaXMudGVzdFNlcnZpY2UucnVuVGVzdHMoe1xuXHRcdFx0dGVzdHM6IHNpbXBsaWZ5VGVzdHNUb0V4ZWN1dGUodGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLCB0aGlzLnRlc3RzLm1hcCgoeyB0ZXN0IH0pID0+IHRlc3QpKSxcblx0XHRcdGdyb3VwOiBwcm9maWxlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q29udGV4dE1lbnUoZTogSUVkaXRvck1vdXNlRXZlbnQpIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpLmZpbmQoZSA9PiBlLmdldE1vZGVsKCkgPT09IHRoaXMubW9kZWwpO1xuXHRcdGVkaXRvcj8uZ2V0Q29udHJpYnV0aW9uPEVkaXRvckxpbmVOdW1iZXJDb250ZXh0TWVudT4oRWRpdG9yTGluZU51bWJlckNvbnRleHRNZW51LklEKT8uc2hvdyhlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0R3V0dGVyTGFiZWwoKSB7XG5cdFx0c3dpdGNoIChnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5EZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24pKSB7XG5cdFx0XHRjYXNlIERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5Db250ZXh0TWVudTpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0aW5nLmd1dHRlck1zZy5jb250ZXh0TWVudScsICdDbGljayBmb3IgdGVzdCBvcHRpb25zJyk7XG5cdFx0XHRjYXNlIERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5EZWJ1Zzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0aW5nLmd1dHRlck1zZy5kZWJ1ZycsICdDbGljayB0byBkZWJ1ZyB0ZXN0cywgcmlnaHQgY2xpY2sgZm9yIG1vcmUgb3B0aW9ucycpO1xuXHRcdFx0Y2FzZSBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uQ292ZXJhZ2U6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdGluZy5ndXR0ZXJNc2cuY292ZXJhZ2UnLCAnQ2xpY2sgdG8gcnVuIHRlc3RzIHdpdGggY292ZXJhZ2UsIHJpZ2h0IGNsaWNrIGZvciBtb3JlIG9wdGlvbnMnKTtcblx0XHRcdGNhc2UgRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLlJ1bjpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdGluZy5ndXR0ZXJNc2cucnVuJywgJ0NsaWNrIHRvIHJ1biB0ZXN0cywgcmlnaHQgY2xpY2sgZm9yIG1vcmUgb3B0aW9ucycpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGNvbnRleHQgbWVudSBhY3Rpb25zIHJlbGV2YW50IGZvciBhIHNpbmdlbCB0ZXN0LlxuXHQgKi9cblx0cHJvdGVjdGVkIGdldFRlc3RDb250ZXh0TWVudUFjdGlvbnModGVzdDogSW50ZXJuYWxUZXN0SXRlbSwgcmVzdWx0SXRlbT86IFRlc3RSZXN1bHRJdGVtKTogSVJlZmVyZW5jZTxJQWN0aW9uW10+IHtcblx0XHRjb25zdCB0ZXN0QWN0aW9uczogQWN0aW9uW10gPSBbXTtcblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSB0aGlzLnRlc3RQcm9maWxlU2VydmljZS5jYXBhYmlsaXRpZXNGb3JUZXN0KHRlc3QuaXRlbSk7XG5cblx0XHRbXG5cdFx0XHR7IGJpdHNldDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCBsYWJlbDogbG9jYWxpemUoJ3J1biB0ZXN0JywgJ1J1biBUZXN0JykgfSxcblx0XHRcdHsgYml0c2V0OiBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZywgbGFiZWw6IGxvY2FsaXplKCdkZWJ1ZyB0ZXN0JywgJ0RlYnVnIFRlc3QnKSB9LFxuXHRcdFx0eyBiaXRzZXQ6IFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlLCBsYWJlbDogbG9jYWxpemUoJ2NvdmVyYWdlIHRlc3QnLCAnUnVuIHdpdGggQ292ZXJhZ2UnKSB9LFxuXHRcdF0uZm9yRWFjaCgoeyBiaXRzZXQsIGxhYmVsIH0pID0+IHtcblx0XHRcdGlmIChjYXBhYmlsaXRpZXMgJiBiaXRzZXQpIHtcblx0XHRcdFx0dGVzdEFjdGlvbnMucHVzaChuZXcgQWN0aW9uKGB0ZXN0aW5nLmd1dHRlci4ke2JpdHNldH1gLCBsYWJlbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy50ZXN0U2VydmljZS5ydW5UZXN0cyh7IGdyb3VwOiBiaXRzZXQsIHRlc3RzOiBbdGVzdF0gfSkpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChjYXBhYmlsaXRpZXMgJiBUZXN0UnVuUHJvZmlsZUJpdHNldC5IYXNOb25EZWZhdWx0UHJvZmlsZSkge1xuXHRcdFx0dGVzdEFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCd0ZXN0aW5nLnJ1blVzaW5nJywgbG9jYWxpemUoJ3Rlc3RpbmcucnVuVXNpbmcnLCAnRXhlY3V0ZSBVc2luZyBQcm9maWxlLi4uJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGU6IElUZXN0UnVuUHJvZmlsZSB8IHVuZGVmaW5lZCA9IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5waWNrVGVzdFByb2ZpbGUnLCB7IG9ubHlGb3JUZXN0OiB0ZXN0IH0pO1xuXHRcdFx0XHRpZiAoIXByb2ZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLnJ1blJlc29sdmVkVGVzdHMoe1xuXHRcdFx0XHRcdGdyb3VwOiBwcm9maWxlLmdyb3VwLFxuXHRcdFx0XHRcdHRhcmdldHM6IFt7XG5cdFx0XHRcdFx0XHRwcm9maWxlSWQ6IHByb2ZpbGUucHJvZmlsZUlkLFxuXHRcdFx0XHRcdFx0Y29udHJvbGxlcklkOiBwcm9maWxlLmNvbnRyb2xsZXJJZCxcblx0XHRcdFx0XHRcdHRlc3RJZHM6IFt0ZXN0Lml0ZW0uZXh0SWRdXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3VsdEl0ZW0gJiYgaXNGYWlsZWRTdGF0ZShyZXN1bHRJdGVtLmNvbXB1dGVkU3RhdGUpKSB7XG5cdFx0XHR0ZXN0QWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ3Rlc3RpbmcuZ3V0dGVyLnBlZWtGYWlsdXJlJywgbG9jYWxpemUoJ3BlZWsgZmFpbHVyZScsICdQZWVrIEVycm9yJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUucGVla1Rlc3RFcnJvcicsIHRlc3QuaXRlbS5leHRJZCkpKTtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0SXRlbT8uY29tcHV0ZWRTdGF0ZSA9PT0gVGVzdFJlc3VsdFN0YXRlLlJ1bm5pbmcpIHtcblx0XHRcdHRlc3RBY3Rpb25zLnB1c2gobmV3IEFjdGlvbigndGVzdGluZy5ndXR0ZXIuY2FuY2VsJywgbG9jYWxpemUoJ3Rlc3RpbmcuY2FuY2VsUnVuJywgJ0NhbmNlbCBUZXN0IFJ1bicpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCxcblx0XHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXN0Q29tbWFuZElkLkNhbmNlbFRlc3RSdW5BY3Rpb24pKSk7XG5cdFx0fVxuXG5cdFx0dGVzdEFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCd0ZXN0aW5nLmd1dHRlci5yZXZlYWwnLCBsb2NhbGl6ZSgncmV2ZWFsIHRlc3QnLCAnUmV2ZWFsIGluIFRlc3QgRXhwbG9yZXInKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsXG5cdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfcmV2ZWFsVGVzdEluRXhwbG9yZXInLCB0ZXN0Lml0ZW0uZXh0SWQpKSk7XG5cblx0XHRjb25zdCBjb250cmlidXRlZCA9IHRoaXMuZ2V0Q29udHJpYnV0ZWRUZXN0QWN0aW9ucyh0ZXN0LCBjYXBhYmlsaXRpZXMpO1xuXHRcdHJldHVybiB7IG9iamVjdDogU2VwYXJhdG9yLmpvaW4odGVzdEFjdGlvbnMsIGNvbnRyaWJ1dGVkKSwgZGlzcG9zZSgpIHsgdGVzdEFjdGlvbnMuZm9yRWFjaChhID0+IGEuZGlzcG9zZSgpKTsgfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250cmlidXRlZFRlc3RBY3Rpb25zKHRlc3Q6IEludGVybmFsVGVzdEl0ZW0sIGNhcGFiaWxpdGllczogbnVtYmVyKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBjb250ZXh0T3ZlcmxheSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShnZXRUZXN0SXRlbUNvbnRleHRPdmVybGF5KHRlc3QsIGNhcGFiaWxpdGllcykpO1xuXG5cdFx0Y29uc3QgYXJnID0gZ2V0Q29udGV4dEZvclRlc3RJdGVtKHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbiwgdGVzdC5pdGVtLmV4dElkKTtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuVGVzdEl0ZW1HdXR0ZXIsIGNvbnRleHRPdmVybGF5LCB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCBhcmcgfSk7XG5cdFx0cmV0dXJuIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNdWx0aVJ1blRlc3Qge1xuXHRjdXJyZW50TGFiZWw6IHN0cmluZztcblx0cGFyZW50OiBUZXN0SWQgfCB1bmRlZmluZWQ7XG5cdHRlc3RJdGVtOiB7XG5cdFx0dGVzdDogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW07XG5cdFx0cmVzdWx0SXRlbTogVGVzdFJlc3VsdEl0ZW0gfCB1bmRlZmluZWQ7XG5cdH07XG59XG5cbmNsYXNzIE11bHRpUnVuVGVzdERlY29yYXRpb24gZXh0ZW5kcyBSdW5UZXN0RGVjb3JhdGlvbiBpbXBsZW1lbnRzIElUZXN0RGVjb3JhdGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRlc3RzOiByZWFkb25seSB7XG5cdFx0XHR0ZXN0OiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbTtcblx0XHRcdHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdH1bXSxcblx0XHR2aXNpYmxlOiBib29sZWFuLFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgdGVzdFByb2ZpbGVTZXJ2aWNlOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRlc3RzLCB2aXNpYmxlLCBtb2RlbCwgY29kZUVkaXRvclNlcnZpY2UsIHRlc3RTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGVzdFByb2ZpbGVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgbWVudVNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldENvbnRleHRNZW51QWN0aW9ucygpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFsbEFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cdFx0W1xuXHRcdFx0eyBiaXRzZXQ6IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgbGFiZWw6IGxvY2FsaXplKCdydW4gYWxsIHRlc3QnLCAnUnVuIEFsbCBUZXN0cycpIH0sXG5cdFx0XHR7IGJpdHNldDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UsIGxhYmVsOiBsb2NhbGl6ZSgncnVuIGFsbCB0ZXN0IHdpdGggY292ZXJhZ2UnLCAnUnVuIEFsbCBUZXN0cyB3aXRoIENvdmVyYWdlJykgfSxcblx0XHRcdHsgYml0c2V0OiBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZywgbGFiZWw6IGxvY2FsaXplKCdkZWJ1ZyBhbGwgdGVzdCcsICdEZWJ1ZyBBbGwgVGVzdHMnKSB9LFxuXHRcdF0uZm9yRWFjaCgoeyBiaXRzZXQsIGxhYmVsIH0sIGkpID0+IHtcblx0XHRcdGNvbnN0IGNhblJ1biA9IHRoaXMudGVzdHMuc29tZSgoeyB0ZXN0IH0pID0+IHRoaXMudGVzdFByb2ZpbGVTZXJ2aWNlLmNhcGFiaWxpdGllc0ZvclRlc3QodGVzdC5pdGVtKSAmIGJpdHNldCk7XG5cdFx0XHRpZiAoY2FuUnVuKSB7XG5cdFx0XHRcdGFsbEFjdGlvbnMucHVzaChuZXcgQWN0aW9uKGB0ZXN0aW5nLmd1dHRlci5ydW4ke2l9YCwgbGFiZWwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAoKSA9PiB0aGlzLnJ1bldpdGgoYml0c2V0KSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFsbEFjdGlvbnMuZm9yRWFjaChhID0+IGEuZGlzcG9zZSgpKSkpO1xuXG5cdFx0Y29uc3QgdGVzdEl0ZW1zID0gdGhpcy50ZXN0cy5tYXAoKHRlc3RJdGVtKTogSU11bHRpUnVuVGVzdCA9PiAoe1xuXHRcdFx0Y3VycmVudExhYmVsOiB0ZXN0SXRlbS50ZXN0Lml0ZW0ubGFiZWwsXG5cdFx0XHR0ZXN0SXRlbSxcblx0XHRcdHBhcmVudDogVGVzdElkLmZyb21TdHJpbmcodGVzdEl0ZW0udGVzdC5pdGVtLmV4dElkKS5wYXJlbnRJZCxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBnZXRMYWJlbENvbmZsaWN0cyA9ICh0ZXN0czogdHlwZW9mIHRlc3RJdGVtcykgPT4ge1xuXHRcdFx0Y29uc3QgbGFiZWxDb3VudCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGVzdHMpIHtcblx0XHRcdFx0bGFiZWxDb3VudC5zZXQodGVzdC5jdXJyZW50TGFiZWwsIChsYWJlbENvdW50LmdldCh0ZXN0LmN1cnJlbnRMYWJlbCkgfHwgMCkgKyAxKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRlc3RzLmZpbHRlcihlID0+IGxhYmVsQ291bnQuZ2V0KGUuY3VycmVudExhYmVsKSEgPiAxKTtcblx0XHR9O1xuXG5cdFx0bGV0IGNvbmZsaWN0cywgaGFzUGFyZW50ID0gdHJ1ZTtcblx0XHR3aGlsZSAoKGNvbmZsaWN0cyA9IGdldExhYmVsQ29uZmxpY3RzKHRlc3RJdGVtcykpLmxlbmd0aCAmJiBoYXNQYXJlbnQpIHtcblx0XHRcdGZvciAoY29uc3QgY29uZmxpY3Qgb2YgY29uZmxpY3RzKSB7XG5cdFx0XHRcdGlmIChjb25mbGljdC5wYXJlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLnRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5SWQoY29uZmxpY3QucGFyZW50LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGNvbmZsaWN0LmN1cnJlbnRMYWJlbCA9IHBhcmVudD8uaXRlbS5sYWJlbCArICcgPiAnICsgY29uZmxpY3QuY3VycmVudExhYmVsO1xuXHRcdFx0XHRcdGNvbmZsaWN0LnBhcmVudCA9IGNvbmZsaWN0LnBhcmVudC5wYXJlbnRJZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRoYXNQYXJlbnQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3RJdGVtcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBhaSA9IGEudGVzdEl0ZW0udGVzdC5pdGVtO1xuXHRcdFx0Y29uc3QgYmkgPSBiLnRlc3RJdGVtLnRlc3QuaXRlbTtcblx0XHRcdHJldHVybiAoYWkuc29ydFRleHQgfHwgYWkubGFiZWwpLmxvY2FsZUNvbXBhcmUoYmkuc29ydFRleHQgfHwgYmkubGFiZWwpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IHRlc3RTdWJtZW51czogSUFjdGlvbltdID0gdGVzdEl0ZW1zLm1hcCgoeyBjdXJyZW50TGFiZWwsIHRlc3RJdGVtIH0pID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldFRlc3RDb250ZXh0TWVudUFjdGlvbnModGVzdEl0ZW0udGVzdCwgdGVzdEl0ZW0ucmVzdWx0SXRlbSk7XG5cdFx0XHRkaXNwb3NhYmxlLmFkZChhY3Rpb25zKTtcblx0XHRcdGxldCBsYWJlbCA9IHN0cmlwSWNvbnMoY3VycmVudExhYmVsKTtcblx0XHRcdGNvbnN0IGxmID0gbGFiZWwuaW5kZXhPZignXFxuJyk7XG5cdFx0XHRpZiAobGYgIT09IC0xKSB7XG5cdFx0XHRcdGxhYmVsID0gbGFiZWwuc2xpY2UoMCwgbGYpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV3IFN1Ym1lbnVBY3Rpb24odGVzdEl0ZW0udGVzdC5pdGVtLmV4dElkLCBsYWJlbCwgYWN0aW9ucy5vYmplY3QpO1xuXHRcdH0pO1xuXG5cblx0XHRjb25zdCBvdmVyZmxvdyA9IHRlc3RTdWJtZW51cy5sZW5ndGggLSBNQVhfVEVTVFNfSU5fU1VCTUVOVTtcblx0XHRpZiAob3ZlcmZsb3cgPiAwKSB7XG5cdFx0XHR0ZXN0U3VibWVudXMgPSB0ZXN0U3VibWVudXMuc2xpY2UoMCwgTUFYX1RFU1RTX0lOX1NVQk1FTlUpO1xuXHRcdFx0dGVzdFN1Ym1lbnVzLnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0J3Rlc3RpbmcuZ3V0dGVyLm92ZXJmbG93Jyxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RPdmVyZmxvd0l0ZW1zJywgJ3swfSBtb3JlIHRlc3RzLi4uJywgb3ZlcmZsb3cpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0KCkgPT4gdGhpcy5waWNrQW5kUnVuKHRlc3RJdGVtcyksXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBvYmplY3Q6IFNlcGFyYXRvci5qb2luKGFsbEFjdGlvbnMsIHRlc3RTdWJtZW51cyksIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBpY2tBbmRSdW4odGVzdEl0ZW1zOiBJTXVsdGlSdW5UZXN0W10pIHtcblx0XHRjb25zdCBkb1BpY2sgPSA8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihpdGVtczogVFtdLCB0aXRsZTogc3RyaW5nKSA9PiBuZXcgUHJvbWlzZTxUIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxUPigpKTtcblx0XHRcdHBpY2sucGxhY2Vob2xkZXIgPSB0aXRsZTtcblx0XHRcdHBpY2suaXRlbXMgPSBpdGVtcztcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHBpY2suc2VsZWN0ZWRJdGVtc1swXSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHBpY2suc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbSA9IGF3YWl0IGRvUGljayhcblx0XHRcdHRlc3RJdGVtcy5tYXAoKHsgY3VycmVudExhYmVsLCB0ZXN0SXRlbSB9KSA9PiAoeyBsYWJlbDogY3VycmVudExhYmVsLCB0ZXN0OiB0ZXN0SXRlbS50ZXN0LCByZXN1bHQ6IHRlc3RJdGVtLnJlc3VsdEl0ZW0gfSkpLFxuXHRcdFx0bG9jYWxpemUoJ3NlbGVjdFRlc3RUb1J1bicsICdTZWxlY3QgYSB0ZXN0IHRvIHJ1bicpLFxuXHRcdCk7XG5cblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRUZXN0Q29udGV4dE1lbnVBY3Rpb25zKGl0ZW0udGVzdCwgaXRlbS5yZXN1bHQpO1xuXHRcdHRyeSB7XG5cdFx0XHQoYXdhaXQgZG9QaWNrKGFjdGlvbnMub2JqZWN0LCBpdGVtLmxhYmVsKSk/LnJ1bigpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY3Rpb25zLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUnVuU2luZ2xlVGVzdERlY29yYXRpb24gZXh0ZW5kcyBSdW5UZXN0RGVjb3JhdGlvbiBpbXBsZW1lbnRzIElUZXN0RGVjb3JhdGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRlc3Q6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtLFxuXHRcdHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkLFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHZpc2libGU6IGJvb2xlYW4sXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSB0ZXN0UHJvZmlsZXM6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoW3sgdGVzdCwgcmVzdWx0SXRlbSB9XSwgdmlzaWJsZSwgbW9kZWwsIGNvZGVFZGl0b3JTZXJ2aWNlLCB0ZXN0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRlc3RQcm9maWxlcywgY29udGV4dEtleVNlcnZpY2UsIG1lbnVTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldENvbnRleHRNZW51QWN0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUZXN0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMudGVzdHNbMF0udGVzdCwgdGhpcy50ZXN0c1swXS5yZXN1bHRJdGVtKTtcblx0fVxufVxuXG5jb25zdCBsaW5lQnJlYWtSZSA9IC9cXHI/XFxuXFxzKi9nO1xuXG5jbGFzcyBUZXN0TWVzc2FnZURlY29yYXRpb24gaW1wbGVtZW50cyBJVGVzdERlY29yYXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGlubGluZUNsYXNzTmFtZSA9ICd0ZXN0LW1lc3NhZ2UtaW5saW5lLWNvbnRlbnQnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRlY29yYXRpb25JZCA9IGB0ZXN0bWVzc2FnZS0ke2dlbmVyYXRlVXVpZCgpfWA7XG5cblx0cHVibGljIGlkID0gJyc7XG5cblx0cHVibGljIHJlYWRvbmx5IGVkaXRvckRlY29yYXRpb246IElNb2RlbERlbHRhRGVjb3JhdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IGxpbmU6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnRJZENsYXNzID0gYHRlc3QtbWVzc2FnZS1pbmxpbmUtY29udGVudC1pZCR7Z2VuZXJhdGVVdWlkKCl9YDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGVzdE1lc3NhZ2U6IElUZXN0TWVzc2FnZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHR0ZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0QElUZXN0aW5nUGVla09wZW5lciBwcml2YXRlIHJlYWRvbmx5IHBlZWtPcGVuZXI6IElUZXN0aW5nUGVla09wZW5lcixcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0ZXN0TWVzc2FnZS5sb2NhdGlvbiE7XG5cdFx0dGhpcy5saW5lID0gY2xhbXAobG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAwLCB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGNvbnN0IHNldmVyaXR5ID0gdGVzdE1lc3NhZ2UudHlwZTtcblx0XHRjb25zdCBtZXNzYWdlID0gdGVzdE1lc3NhZ2UubWVzc2FnZTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSBlZGl0b3JTZXJ2aWNlLnJlc29sdmVEZWNvcmF0aW9uT3B0aW9ucyhUZXN0TWVzc2FnZURlY29yYXRpb24uZGVjb3JhdGlvbklkLCB0cnVlKTtcblx0XHRjb25zdCBob3ZlclRleHQgPSByZW5kZXJUZXN0TWVzc2FnZUFzVGV4dChtZXNzYWdlKTtcblx0XHRvcHRpb25zLmhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoaG92ZXJUZXh0KTtcblx0XHRvcHRpb25zLnpJbmRleCA9IDEwOyAvLyB0b2RvOiBpbiBzcGl0ZSBvZiB0aGUgei1pbmRleCwgdGhpcyBhcHBlYXJzIGJlaGluZCBnaXRsZW5zXG5cdFx0b3B0aW9ucy5jbGFzc05hbWUgPSBgdGVzdGluZy1pbmxpbmUtbWVzc2FnZS1zZXZlcml0eS0ke3NldmVyaXR5fWA7XG5cdFx0b3B0aW9ucy5pc1dob2xlTGluZSA9IHRydWU7XG5cdFx0b3B0aW9ucy5zdGlja2luZXNzID0gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXM7XG5cdFx0b3B0aW9ucy5jb2xsYXBzZU9uUmVwbGFjZUVkaXQgPSB0cnVlO1xuXG5cdFx0bGV0IGlubGluZVRleHQgPSByZW5kZXJUZXN0TWVzc2FnZUFzVGV4dChtZXNzYWdlKS5yZXBsYWNlKGxpbmVCcmVha1JlLCAnICcpO1xuXHRcdGlmIChpbmxpbmVUZXh0Lmxlbmd0aCA+IE1BWF9JTkxJTkVfTUVTU0FHRV9MRU5HVEgpIHtcblx0XHRcdGlubGluZVRleHQgPSBpbmxpbmVUZXh0LnNsaWNlKDAsIE1BWF9JTkxJTkVfTUVTU0FHRV9MRU5HVEggLSAxKSArICdcdTIwMjYnO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMuYWZ0ZXIgPSB7XG5cdFx0XHRjb250ZW50OiBpbmxpbmVUZXh0LFxuXHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBgdGVzdC1tZXNzYWdlLWlubGluZS1jb250ZW50IHRlc3QtbWVzc2FnZS1pbmxpbmUtY29udGVudC1zJHtzZXZlcml0eX0gJHt0aGlzLmNvbnRlbnRJZENsYXNzfSAke21lc3NhZ2VVcmkgPyAndGVzdC1tZXNzYWdlLWlubGluZS1jb250ZW50LWNsaWNrYWJsZScgOiAnJ31gXG5cdFx0fTtcblx0XHRvcHRpb25zLnNob3dJZkNvbGxhcHNlZCA9IHRydWU7XG5cblx0XHRjb25zdCBydWxlckNvbG9yID0gc2V2ZXJpdHkgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvclxuXHRcdFx0PyBvdmVydmlld1J1bGVyRXJyb3Jcblx0XHRcdDogb3ZlcnZpZXdSdWxlckluZm87XG5cblx0XHRpZiAocnVsZXJDb2xvcikge1xuXHRcdFx0b3B0aW9ucy5vdmVydmlld1J1bGVyID0geyBjb2xvcjogdGhlbWVDb2xvckZyb21JZChydWxlckNvbG9yKSwgcG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLlJpZ2h0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IHRleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKHRoaXMubGluZSk7XG5cdFx0Y29uc3QgY29sdW1uID0gbGluZUxlbmd0aCA/IChsaW5lTGVuZ3RoICsgMSkgOiBsb2NhdGlvbi5yYW5nZS5lbmRDb2x1bW47XG5cdFx0dGhpcy5lZGl0b3JEZWNvcmF0aW9uID0ge1xuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogdGhpcy5saW5lLFxuXHRcdFx0XHRzdGFydENvbHVtbjogY29sdW1uLFxuXHRcdFx0XHRlbmRDb2x1bW46IGNvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogdGhpcy5saW5lLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRjbGljayhlOiBJRWRpdG9yTW91c2VFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLmV2ZW50LnJpZ2h0QnV0dG9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLm1lc3NhZ2VVcmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZS50YXJnZXQuZWxlbWVudD8uY2xhc3NOYW1lLmluY2x1ZGVzKHRoaXMuY29udGVudElkQ2xhc3MpKSB7XG5cdFx0XHR0aGlzLnBlZWtPcGVuZXIucGVla1VyaSh0aGlzLm1lc3NhZ2VVcmkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldENvbnRleHRNZW51QWN0aW9ucygpIHtcblx0XHRyZXR1cm4geyBvYmplY3Q6IFtdLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0fVxufVxuXG5jb25zdCBFUlJPUl9DT05URU5UX1dJREdFVF9IRUlHSFQgPSAyMDtcblxuY2xhc3MgVGVzdEVycm9yQ29udGVudFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3cgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG5vZGUgPSBkb20uaCgnZGl2LnRlc3QtZXJyb3ItY29udGVudC13aWRnZXQnLCBbXG5cdFx0ZG9tLmgoJ2Rpdi5pbm5lckBpbm5lcicsIFtcblx0XHRcdGRvbS5oKCdkaXYuYXJyb3dAYXJyb3cnKSxcblx0XHRcdGRvbS5oKGBzcGFuJHtUaGVtZUljb24uYXNDU1NTZWxlY3Rvcih0ZXN0aW5nU3RhdGVzVG9JY29ucy5nZXQoVGVzdFJlc3VsdFN0YXRlLkZhaWxlZCkhKX1gKSxcblx0XHRcdGRvbS5oKCdzcGFuLmNvbnRlbnRAbmFtZScpLFxuXHRcdF0pLFxuXHRdKTtcblxuXHRwdWJsaWMgZ2V0IGxpbmUoKSB7XG5cdFx0cmV0dXJuIHRoaXMucG9zaXRpb24ubGluZU51bWJlcjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHBvc2l0aW9uOiBQb3NpdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWVzc2FnZTogSVRlc3RFcnJvck1lc3NhZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtLFxuXHRcdHVyaTogVVJJLFxuXHRcdEBJVGVzdGluZ1BlZWtPcGVuZXIgcmVhZG9ubHkgcGVla09wZW5lcjogSVRlc3RpbmdQZWVrT3BlbmVyLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc2V0TWFyZ2luVG9wID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IGVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0dGhpcy5ub2RlLnJvb3Quc3R5bGUubWFyZ2luVG9wID0gKGxpbmVIZWlnaHQgLSBFUlJPUl9DT05URU5UX1dJREdFVF9IRUlHSFQpIC8gMiArICdweCc7XG5cdFx0fTtcblxuXHRcdHNldE1hcmdpblRvcCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUxpbmVIZWlnaHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRzZXRNYXJnaW5Ub3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodCkpIHtcblx0XHRcdFx0c2V0TWFyZ2luVG9wKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHRleHQ6IHN0cmluZztcblx0XHRpZiAobWVzc2FnZS5leHBlY3RlZCAhPT0gdW5kZWZpbmVkICYmIG1lc3NhZ2UuYWN0dWFsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRleHQgPSBgJHt0cnVuY2F0ZU1pZGRsZShtZXNzYWdlLmFjdHVhbC5yZXBsYWNlKC9cXHMrL2csICcgJyksIDMwKX0gIT0gJHt0cnVuY2F0ZU1pZGRsZShtZXNzYWdlLmV4cGVjdGVkLnJlcGxhY2UoL1xccysvZywgJyAnKSwgMzApfWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1zZyA9IHJlbmRlckFzUGxhaW50ZXh0KG1lc3NhZ2UubWVzc2FnZSk7XG5cdFx0XHRjb25zdCBsZiA9IG1zZy5pbmRleE9mKCdcXG4nKTtcblx0XHRcdHRleHQgPSBsZiA9PT0gLTEgPyBtc2cgOiBtc2cuc2xpY2UoMCwgbGYpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5ub2RlLnJvb3QsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0dGhpcy5wZWVrT3BlbmVyLnBlZWtVcmkodXJpKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjdHJsID0gVGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmIChjdHJsKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN1YmplY3QgPSBjdHJsLnN1YmplY3QucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBpc0N1cnJlbnQgPSBzdWJqZWN0IGluc3RhbmNlb2YgTWVzc2FnZVN1YmplY3QgJiYgc3ViamVjdC5tZXNzYWdlID09PSBtZXNzYWdlO1xuXHRcdFx0XHR0aGlzLm5vZGUucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1jdXJyZW50JywgaXNDdXJyZW50KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLm5vZGUubmFtZS5pbm5lclRleHQgPSB0ZXh0IHx8ICdUZXN0IEZhaWxlZCc7XG5cblx0XHRjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuXHRcdHN2Zy5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzE1Jyk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgJzEwJyk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgncHJlc2VydmVBc3BlY3RSYXRpbycsICdub25lJyk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgMTUgMTAnKTtcblxuXHRcdGNvbnN0IGxlZnRBcnJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuXHRcdGxlZnRBcnJvdy5zZXRBdHRyaWJ1dGUoJ2QnLCAnTTE1IDAgTDEwIDAgTDAgNSBMMTAgMTAgTDE1IDEwIFonKTtcblx0XHRzdmcuYXBwZW5kKGxlZnRBcnJvdyk7XG5cblx0XHR0aGlzLm5vZGUuYXJyb3cuYXBwZW5kQ2hpbGQoc3ZnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChlID0+IHtcblx0XHRcdGZvciAoY29uc3QgYyBvZiBlLmNoYW5nZXMpIHtcblx0XHRcdFx0aWYgKGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gdGhpcy5saW5lKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDw9IHRoaXMubGluZSAmJiBjLnJhbmdlLmVuZExpbmVOdW1iZXIgPj0gdGhpcy5saW5lXG5cdFx0XHRcdFx0fHwgKHJlc3VsdEl0ZW0uaXRlbS5yYW5nZSAmJiByZXN1bHRJdGVtLml0ZW0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDw9IGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIHJlc3VsdEl0ZW0uaXRlbS5yYW5nZS5lbmRMaW5lTnVtYmVyID49IGMucmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0VGVzdGluZ0RlY29yYXRpb25zLmludmFsaWRhdGVkVGVzdHMuYWRkKHRoaXMucmVzdWx0SXRlbSk7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7IC8vIHRvZG9cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFkanVzdCA9IGNvdW50KGMudGV4dCwgJ1xcbicpIC0gKGMucmFuZ2UuZW5kTGluZU51bWJlciAtIGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0aWYgKGFkanVzdCAhPT0gMCkge1xuXHRcdFx0XHRcdHRoaXMucG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uLmRlbHRhKGFkanVzdCk7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBlZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKSkpO1xuXHR9XG5cblx0cHVibGljIGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5yb290O1xuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHRoaXMucG9zaXRpb24sXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVF0sXG5cdFx0fTtcblx0fVxuXG5cdGFmdGVyUmVuZGVyKF9wb3NpdGlvbjogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB8IG51bGwsIGNvb3JkaW5hdGU6IElDb250ZW50V2lkZ2V0UmVuZGVyZWRDb29yZGluYXRlIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChjb29yZGluYXRlKSB7XG5cdFx0XHRjb25zdCB7IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggfSA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRcdGNvbnN0IHNjcm9sbFdpZHRoID0gdGhpcy5lZGl0b3IuZ2V0U2Nyb2xsV2lkdGgoKTtcblx0XHRcdHRoaXMubm9kZS5pbm5lci5zdHlsZS5tYXhXaWR0aCA9IGAke3Njcm9sbFdpZHRoIC0gdmVydGljYWxTY3JvbGxiYXJXaWR0aCAtIGNvb3JkaW5hdGUubGVmdCAtIDIwfXB4YDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsUUFBaUIsV0FBVyxxQkFBcUI7QUFDMUQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCLFdBQVcsZUFBZTtBQUNyRCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxlQUFlLGlCQUE2QixtQkFBbUIsb0JBQW9CO0FBQ3hHLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtB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b0IsSUFBSSxDQUFDLENBQUM7QUFBQSxFQUNwRTtBQUFBLEVBNUZBLElBQVcsT0FBTztBQUNqQixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUE0Rk8sUUFBZ0I7QUFDdEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sYUFBMEI7QUFDaEMsV0FBTyxLQUFLLEtBQUs7QUFBQSxFQUNsQjtBQUFBLEVBRU8sY0FBNkM7QUFDbkQsV0FBTztBQUFBLE1BQ04sVUFBVSxLQUFLO0FBQUEsTUFDZixZQUFZLENBQUMsZ0NBQWdDLEtBQUs7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFlBQVksV0FBbUQsWUFBMkQ7QUFDekgsUUFBSSxZQUFZO0FBQ2YsWUFBTSxFQUFFLHVCQUF1QixJQUFJLEtBQUssT0FBTyxjQUFjO0FBQzdELFlBQU0sY0FBYyxLQUFLLE9BQU8sZUFBZTtBQUMvQyxXQUFLLEtBQUssTUFBTSxNQUFNLFdBQVcsR0FBRyxjQUFjLHlCQUF5QixXQUFXLE9BQU8sRUFBRTtBQUFBLElBQ2hHO0FBQUEsRUFDRDtBQUNEO0FBbElNLHlCQUFOO0FBQUEsRUF3Qkc7QUFBQSxHQXhCRzsiLAogICJuYW1lcyI6IFsibmV3RGVjb3JhdGlvbnMiLCAiTGVuc0NvbnRlbnRXaWRnZXRWYXJzIiwgImUiXQp9Cg==
