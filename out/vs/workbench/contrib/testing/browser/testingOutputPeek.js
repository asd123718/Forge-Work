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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Color } from "../../../../base/common/color.js";
import { Event } from "../../../../base/common/event.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, disposableObservableValue, observableValue } from "../../../../base/common/observable.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction2 } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IPeekViewService, PeekViewWidget, peekViewTitleForeground, peekViewTitleInfoForeground } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AutoOpenPeekViewWhen, TestingConfigKeys, getTestingConfiguration } from "../common/configuration.js";
import { Testing } from "../common/constants.js";
import { MutableObservableValue, staticObservableValue } from "../common/observableValue.js";
import { StoredValue } from "../common/storedValue.js";
import { TestResultItemChangeReason, resultItemParents } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService } from "../common/testService.js";
import { TestMessageType } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { isFailedState } from "../common/testingStates.js";
import { TestUriType, buildTestUri, parseTestUri } from "../common/testingUri.js";
import { renderTestMessageAsText } from "./testMessageColorizer.js";
import { MessageSubject, TaskSubject, TestOutputSubject, inspectSubjectHasStack, mapFindTestMessage } from "./testResultsView/testResultsSubject.js";
import { TestResultsViewContent } from "./testResultsView/testResultsViewContent.js";
import { testingMessagePeekBorder, testingPeekBorder, testingPeekHeaderBackground, testingPeekMessageHeaderBackground } from "./theme.js";
function* allMessages([result]) {
  if (!result) {
    return;
  }
  for (const test of result.tests) {
    for (let taskIndex = 0; taskIndex < test.tasks.length; taskIndex++) {
      const messages = test.tasks[taskIndex].messages;
      for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
        if (messages[messageIndex].type === TestMessageType.Error) {
          yield { result, test, taskIndex, messageIndex };
        }
      }
    }
  }
}
function messageItReferenceToUri({ result, test, taskIndex, messageIndex }) {
  return buildTestUri({
    type: TestUriType.ResultMessage,
    resultId: result.id,
    testExtId: test.item.extId,
    taskIndex,
    messageIndex
  });
}
let TestingPeekOpener = class extends Disposable {
  constructor(configuration, editorService, codeEditorService, testResults, testService, storageService, viewsService, commandService, notificationService) {
    super();
    this.configuration = configuration;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this.testResults = testResults;
    this.testService = testService;
    this.viewsService = viewsService;
    this.commandService = commandService;
    this.notificationService = notificationService;
    this._register(testResults.onTestChanged(this.openPeekOnFailure, this));
    this.historyVisible = this._register(MutableObservableValue.stored(new StoredValue({
      key: "testHistoryVisibleInPeek",
      scope: StorageScope.PROFILE,
      target: StorageTarget.USER
    }, storageService), false));
  }
  /** @inheritdoc */
  async open() {
    let uri;
    const active = this.editorService.activeTextEditorControl;
    if (isCodeEditor(active) && active.getModel()?.uri) {
      const modelUri = active.getModel()?.uri;
      if (modelUri) {
        uri = await this.getFileCandidateMessage(modelUri, active.getPosition());
      }
    }
    if (!uri) {
      uri = this.lastUri;
    }
    if (!uri) {
      uri = this.getAnyCandidateMessage();
    }
    if (!uri) {
      return false;
    }
    return this.showPeekFromUri(uri);
  }
  /** @inheritdoc */
  tryPeekFirstError(result, test, options) {
    const candidate = this.getFailedCandidateMessage(test);
    if (!candidate) {
      return false;
    }
    this.showPeekFromUri({
      type: TestUriType.ResultMessage,
      documentUri: candidate.location.uri,
      taskIndex: candidate.taskId,
      messageIndex: candidate.index,
      resultId: result.id,
      testExtId: test.item.extId
    }, void 0, { selection: candidate.location.range, selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport, ...options });
    return true;
  }
  /** @inheritdoc */
  peekUri(uri, options = {}) {
    const parsed = parseTestUri(uri);
    const result = parsed && this.testResults.getResult(parsed.resultId);
    if (!parsed || !result || !("testExtId" in parsed)) {
      return false;
    }
    if (!("messageIndex" in parsed)) {
      return false;
    }
    const message = result.getStateById(parsed.testExtId)?.tasks[parsed.taskIndex].messages[parsed.messageIndex];
    if (!message?.location) {
      return false;
    }
    this.showPeekFromUri({
      type: TestUriType.ResultMessage,
      documentUri: message.location.uri,
      taskIndex: parsed.taskIndex,
      messageIndex: parsed.messageIndex,
      resultId: result.id,
      testExtId: parsed.testExtId
    }, options.inEditor, { selection: message.location.range, ...options.options });
    return true;
  }
  /** @inheritdoc */
  closeAllPeeks() {
    for (const editor of this.codeEditorService.listCodeEditors()) {
      TestingOutputPeekController.get(editor)?.removePeek();
    }
  }
  openCurrentInEditor() {
    const current = this.getActiveControl();
    if (!current) {
      return;
    }
    const options = { pinned: false, revealIfOpened: true };
    if (current instanceof TaskSubject || current instanceof TestOutputSubject) {
      this.editorService.openEditor({ resource: current.outputUri, options });
      return;
    }
    if (current instanceof TestOutputSubject) {
      this.editorService.openEditor({ resource: current.outputUri, options });
      return;
    }
    const message = current.message;
    if (current.isDiffable) {
      this.editorService.openEditor({
        original: { resource: current.expectedUri },
        modified: { resource: current.actualUri },
        options
      });
    } else if (typeof message.message === "string") {
      this.editorService.openEditor({ resource: current.messageUri, options });
    } else {
      this.commandService.executeCommand("markdown.showPreview", current.messageUri).catch((err) => {
        this.notificationService.error(localize("testing.markdownPeekError", "Could not open markdown preview: {0}.\n\nPlease make sure the markdown extension is enabled.", err.message));
      });
    }
  }
  getActiveControl() {
    const editor = getPeekedEditorFromFocus(this.codeEditorService);
    const controller = editor && TestingOutputPeekController.get(editor);
    return controller?.subject.get() ?? this.viewsService.getActiveViewWithId(Testing.ResultsViewId)?.subject;
  }
  /** @inheritdoc */
  async showPeekFromUri(uri, editor, options) {
    if (isCodeEditor(editor)) {
      this.lastUri = uri;
      TestingOutputPeekController.get(editor)?.show(buildTestUri(this.lastUri));
      return true;
    }
    const pane = await this.editorService.openEditor({
      resource: uri.documentUri,
      options: { revealIfOpened: true, ...options }
    });
    const control = pane?.getControl();
    if (!isCodeEditor(control)) {
      return false;
    }
    this.lastUri = uri;
    TestingOutputPeekController.get(control)?.show(buildTestUri(this.lastUri));
    return true;
  }
  /**
   * Opens the peek view on a test failure, based on user preferences.
   */
  openPeekOnFailure(evt) {
    if (evt.reason !== TestResultItemChangeReason.OwnStateChange) {
      return;
    }
    const candidate = this.getFailedCandidateMessage(evt.item);
    if (!candidate) {
      return;
    }
    if (evt.result.request.continuous && !getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekViewDuringContinuousRun)) {
      return;
    }
    const editors = this.codeEditorService.listCodeEditors();
    const cfg = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekView);
    switch (cfg) {
      case AutoOpenPeekViewWhen.FailureVisible: {
        const visibleEditors = this.editorService.visibleTextEditorControls;
        const editorUris = new Set(visibleEditors.filter(isCodeEditor).map((e) => e.getModel()?.uri.toString()));
        if (!Iterable.some(resultItemParents(evt.result, evt.item), (i) => i.item.uri && editorUris.has(i.item.uri.toString()))) {
          return;
        }
        if (!editorUris.has(candidate.location.uri.toString())) {
          return;
        }
        break;
      }
      case AutoOpenPeekViewWhen.FailureAnywhere:
        break;
      //continue
      default:
        return;
    }
    const controllers = editors.map(TestingOutputPeekController.get);
    if (controllers.some((c) => c?.subject.get())) {
      return;
    }
    this.tryPeekFirstError(evt.result, evt.item);
  }
  /**
   * Gets the message closest to the given position from a test in the file.
   */
  async getFileCandidateMessage(uri, position) {
    let best;
    let bestDistance = Infinity;
    const demandedUriStr = uri.toString();
    for (const test of this.testService.collection.all) {
      const result = this.testResults.getStateById(test.item.extId);
      if (!result) {
        continue;
      }
      mapFindTestMessage(result[1], (_task, message, messageIndex, taskIndex) => {
        if (message.type !== TestMessageType.Error || !message.location || message.location.uri.toString() !== demandedUriStr) {
          return;
        }
        const distance = position ? Math.abs(position.lineNumber - message.location.range.startLineNumber) : 0;
        if (!best || distance <= bestDistance) {
          bestDistance = distance;
          best = {
            type: TestUriType.ResultMessage,
            testExtId: result[1].item.extId,
            resultId: result[0].id,
            taskIndex,
            messageIndex,
            documentUri: uri
          };
        }
      });
    }
    return best;
  }
  /**
   * Gets any possible still-relevant message from the results.
   */
  getAnyCandidateMessage() {
    const seen = /* @__PURE__ */ new Set();
    for (const result of this.testResults.results) {
      for (const test of result.tests) {
        if (seen.has(test.item.extId)) {
          continue;
        }
        seen.add(test.item.extId);
        const found = mapFindTestMessage(test, (task, message, messageIndex, taskIndex) => message.location && {
          type: TestUriType.ResultMessage,
          testExtId: test.item.extId,
          resultId: result.id,
          taskIndex,
          messageIndex,
          documentUri: message.location.uri
        });
        if (found) {
          return found;
        }
      }
    }
    return void 0;
  }
  /**
   * Gets the first failed message that can be displayed from the result.
   */
  getFailedCandidateMessage(test) {
    const fallbackLocation = test.item.uri && test.item.range ? { uri: test.item.uri, range: test.item.range } : void 0;
    let best;
    mapFindTestMessage(test, (task, message, messageIndex, taskId) => {
      const location = message.location || fallbackLocation;
      if (!isFailedState(task.state) || !location) {
        return;
      }
      if (best && message.type !== TestMessageType.Error) {
        return;
      }
      best = { taskId, index: messageIndex, message, location };
    });
    return best;
  }
};
TestingPeekOpener.ID = "workbench.contrib.testing.peekOpener";
TestingPeekOpener = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, ITestService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, INotificationService)
], TestingPeekOpener);
let TestingOutputPeekController = class extends Disposable {
  constructor(editor, codeEditorService, instantiationService, testResults, contextKeyService) {
    super();
    this.editor = editor;
    this.codeEditorService = codeEditorService;
    this.instantiationService = instantiationService;
    this.testResults = testResults;
    /**
     * Currently-shown peek view.
     */
    this.peek = this._register(disposableObservableValue("TestingOutputPeek", void 0));
    /**
     * Gets the currently display subject. Undefined if the peek is not open.
     */
    this.subject = derived((reader) => this.peek.read(reader)?.current.read(reader));
    this.visible = TestingContextKeys.isPeekVisible.bindTo(contextKeyService);
    this._register(editor.onDidChangeModel(() => this.peek.set(void 0, void 0)));
    this._register(testResults.onResultsChanged(this.closePeekOnCertainResultEvents, this));
    this._register(testResults.onTestChanged(this.closePeekOnTestChange, this));
  }
  /**
   * Gets the controller associated with the given code editor.
   */
  static get(editor) {
    return editor.getContribution(Testing.OutputPeekContributionId);
  }
  /**
   * Shows a peek for the message in the editor.
   */
  async show(uri) {
    const subject = this.retrieveTest(uri);
    if (subject) {
      this.showSubject(subject);
    }
  }
  /**
   * Shows a peek for the existing inspect subject.
   */
  async showSubject(subject) {
    if (!this.peek.get()) {
      const peek = this.instantiationService.createInstance(TestResultsPeek, this.editor);
      this.peek.set(peek, void 0);
      Event.once(peek.onDidClose)(() => {
        this.visible.set(false);
        this.peek.set(void 0, void 0);
      });
      this.visible.set(true);
      peek.create();
    }
    if (subject instanceof MessageSubject) {
      alert(renderTestMessageAsText(subject.message.message));
    }
    this.peek.get().setModel(subject);
  }
  async openAndShow(uri) {
    const subject = this.retrieveTest(uri);
    if (!subject) {
      return;
    }
    if (!subject.revealLocation || subject.revealLocation.uri.toString() === this.editor.getModel()?.uri.toString()) {
      return this.show(uri);
    }
    const otherEditor = await this.codeEditorService.openCodeEditor({
      resource: subject.revealLocation.uri,
      options: { pinned: false, revealIfOpened: true }
    }, this.editor);
    if (otherEditor) {
      TestingOutputPeekController.get(otherEditor)?.removePeek();
      return TestingOutputPeekController.get(otherEditor)?.show(uri);
    }
  }
  /**
   * Disposes the peek view, if any.
   */
  removePeek() {
    this.peek.set(void 0, void 0);
  }
  /**
   * Collapses all displayed stack frames.
   */
  collapseStack() {
    this.peek.get()?.collapseStack();
  }
  /**
   * Shows the next message in the peek, if possible.
   */
  next() {
    const subject = this.peek.get()?.current.get();
    if (!subject) {
      return;
    }
    let first;
    let found = false;
    for (const m of allMessages(this.testResults.results)) {
      first ??= m;
      if (subject instanceof TaskSubject && m.result.id === subject.result.id) {
        found = true;
      }
      if (found) {
        this.openAndShow(messageItReferenceToUri(m));
        return;
      }
      if (subject instanceof TestOutputSubject && subject.test.item.extId === m.test.item.extId && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
        found = true;
      }
      if (subject instanceof MessageSubject && subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
        found = true;
      }
    }
    if (first) {
      this.openAndShow(messageItReferenceToUri(first));
    }
  }
  /**
   * Shows the previous message in the peek, if possible.
   */
  previous() {
    const subject = this.subject.get();
    if (!subject) {
      return;
    }
    let previous;
    let previousLockedIn = false;
    let last;
    for (const m of allMessages(this.testResults.results)) {
      last = m;
      if (!previousLockedIn) {
        if (subject instanceof TaskSubject) {
          if (m.result.id === subject.result.id) {
            previousLockedIn = true;
          }
          continue;
        }
        if (subject instanceof TestOutputSubject) {
          if (m.test.item.extId === subject.test.item.extId && m.result.id === subject.result.id && m.taskIndex === subject.taskIndex) {
            previousLockedIn = true;
          }
          continue;
        }
        if (subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
          previousLockedIn = true;
          continue;
        }
        previous = m;
      }
    }
    const target = previous || last;
    if (target) {
      this.openAndShow(messageItReferenceToUri(target));
    }
  }
  /**
   * Removes the peek view if it's being displayed on the given test ID.
   */
  removeIfPeekingForTest(testId) {
    const c = this.subject.get();
    if (c && c instanceof MessageSubject && c.test.extId === testId) {
      this.peek.set(void 0, void 0);
    }
  }
  /**
   * If the test we're currently showing has its state change to something
   * else, then clear the peek.
   */
  closePeekOnTestChange(evt) {
    if (evt.reason !== TestResultItemChangeReason.OwnStateChange || evt.previousState === evt.item.ownComputedState) {
      return;
    }
    this.removeIfPeekingForTest(evt.item.item.extId);
  }
  closePeekOnCertainResultEvents(evt) {
    if ("started" in evt) {
      this.peek.set(void 0, void 0);
    }
    if ("removed" in evt && this.testResults.results.length === 0) {
      this.peek.set(void 0, void 0);
    }
  }
  retrieveTest(uri) {
    const parts = parseTestUri(uri);
    if (!parts) {
      return void 0;
    }
    const result = this.testResults.results.find((r) => r.id === parts.resultId);
    if (!result) {
      return;
    }
    if (parts.type === TestUriType.TaskOutput) {
      return new TaskSubject(result, parts.taskIndex);
    }
    if (parts.type === TestUriType.TestOutput) {
      const test2 = result.getStateById(parts.testExtId);
      if (!test2) {
        return;
      }
      return new TestOutputSubject(result, parts.taskIndex, test2);
    }
    const { testExtId, taskIndex, messageIndex } = parts;
    const test = result?.getStateById(testExtId);
    if (!test || !test.tasks[parts.taskIndex]) {
      return;
    }
    return new MessageSubject(result, test, taskIndex, messageIndex);
  }
};
TestingOutputPeekController = __decorateClass([
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, IContextKeyService)
], TestingOutputPeekController);
let TestResultsPeek = class extends PeekViewWidget {
  constructor(editor, themeService, peekViewService, testingPeek, contextKeyService, menuService, instantiationService, modelService, codeEditorService, uriIdentityService) {
    super(editor, { showFrame: true, frameWidth: 1, showArrow: true, isResizeable: true, isAccessible: true, className: "test-output-peek" }, instantiationService);
    this.themeService = themeService;
    this.testingPeek = testingPeek;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.modelService = modelService;
    this.codeEditorService = codeEditorService;
    this.uriIdentityService = uriIdentityService;
    this.current = observableValue("testPeekCurrent", void 0);
    this.resizeOnNextContentHeightUpdate = false;
    this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
    peekViewService.addExclusiveWidget(editor, this);
  }
  _getMaximumHeightInLines() {
    const defaultMaxHeight = super._getMaximumHeightInLines();
    const contentHeight = this.content?.contentHeight;
    if (!contentHeight) {
      return defaultMaxHeight;
    }
    if (this.testingPeek.historyVisible.value) {
      return defaultMaxHeight;
    }
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const basePeekOverhead = 41;
    return Math.min(defaultMaxHeight || Infinity, (contentHeight + basePeekOverhead) / lineHeight + 1);
  }
  applyTheme() {
    const theme = this.themeService.getColorTheme();
    const current = this.current.get();
    const isError = current instanceof MessageSubject && current.message.type === TestMessageType.Error;
    const borderColor = (isError ? theme.getColor(testingPeekBorder) : theme.getColor(testingMessagePeekBorder)) || Color.transparent;
    const headerBg = (isError ? theme.getColor(testingPeekHeaderBackground) : theme.getColor(testingPeekMessageHeaderBackground)) || Color.transparent;
    const editorBg = theme.getColor(editorBackground);
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: editorBg && headerBg ? headerBg.makeOpaque(editorBg) : headerBg,
      primaryHeadingColor: theme.getColor(peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
    });
  }
  _fillContainer(container) {
    if (!this.scopedContextKeyService) {
      this.scopedContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
      TestingContextKeys.isInPeek.bindTo(this.scopedContextKeyService).set(true);
      const instaService = this._disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
      this.content = this._disposables.add(instaService.createInstance(TestResultsViewContent, this.editor, { historyVisible: this.testingPeek.historyVisible, showRevealLocationOnMessages: false, locationForProgress: Testing.ResultsViewId }));
      this._disposables.add(this.content.onClose(() => {
        TestingOutputPeekController.get(this.editor)?.removePeek();
      }));
    }
    super._fillContainer(container);
  }
  _fillHead(container) {
    super._fillHead(container);
    const menuContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
    this._disposables.add(bindContextKey(
      TestingContextKeys.peekHasStack,
      menuContextKeyService,
      (reader) => inspectSubjectHasStack(this.current.read(reader))
    ));
    const menu = this.menuService.createMenu(MenuId.TestPeekTitle, menuContextKeyService);
    const actionBar = this._actionbarWidget;
    this._disposables.add(menu.onDidChange(() => {
      actions.length = 0;
      fillInActionBarActions(menu.getActions(), actions);
      while (actionBar.getAction(1)) {
        actionBar.pull(0);
      }
      actionBar.push(actions, { label: false, icon: true, index: 0 });
    }));
    const actions = [];
    fillInActionBarActions(menu.getActions(), actions);
    actionBar.push(actions, { label: false, icon: true, index: 0 });
  }
  _fillBody(containerElement) {
    this.content.fillBody(containerElement);
    const contentHeightSettleTimer = this._disposables.add(new RunOnceScheduler(() => {
      this.resizeOnNextContentHeightUpdate = false;
    }, 500));
    this._disposables.add(this.content.onDidChangeContentHeight((height) => {
      if (!this.resizeOnNextContentHeightUpdate || !height) {
        return;
      }
      const displayed = this._getMaximumHeightInLines();
      if (displayed) {
        this._relayout(Math.min(displayed, this.getVisibleEditorLines() / 2), true);
        if (!contentHeightSettleTimer.isScheduled()) {
          contentHeightSettleTimer.schedule();
        }
      }
    }));
    this._disposables.add(this.content.onDidRequestReveal((sub) => {
      TestingOutputPeekController.get(this.editor)?.show(sub instanceof MessageSubject ? sub.messageUri : sub.outputUri);
    }));
  }
  /**
   * Updates the test to be shown.
   */
  setModel(subject) {
    if (subject instanceof TaskSubject || subject instanceof TestOutputSubject) {
      this.current.set(subject, void 0);
      return this.showInPlace(subject);
    }
    const previous = this.current;
    const revealLocation = subject.revealLocation?.range.getStartPosition();
    if (!revealLocation && !previous) {
      return Promise.resolve();
    }
    this.current.set(subject, void 0);
    if (!revealLocation) {
      return this.showInPlace(subject);
    }
    this.resizeOnNextContentHeightUpdate = true;
    this.show(revealLocation, 10);
    this.editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(revealLocation), ScrollType.Smooth);
    return this.showInPlace(subject);
  }
  /**
   * Collapses all displayed stack frames.
   */
  collapseStack() {
    this.content.collapseStack();
  }
  getVisibleEditorLines() {
    return Math.round(this.editor.getDomNode().clientHeight / this.editor.getOption(EditorOption.lineHeight));
  }
  /**
   * Shows a message in-place without showing or changing the peek location.
   * This is mostly used if peeking a message without a location.
   */
  async showInPlace(subject) {
    if (subject instanceof MessageSubject) {
      const message = subject.message;
      this.setTitle(firstLine(renderTestMessageAsText(message.message)), stripIcons(subject.test.label));
    } else {
      this.setTitle(localize("testOutputTitle", "Test Output"));
    }
    this.applyTheme();
    await this.content.reveal({ subject, preserveFocus: false });
  }
  /** @override */
  _doLayoutBody(height, width) {
    super._doLayoutBody(height, width);
    this.content.onLayoutBody(height, width);
  }
  /** @override */
  _onWidth(width) {
    super._onWidth(width);
    if (this.dimension) {
      this.dimension = new dom.Dimension(width, this.dimension.height);
    }
    this.content.onWidth(width);
  }
};
TestResultsPeek = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IPeekViewService),
  __decorateParam(3, ITestingPeekOpener),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITextModelService),
  __decorateParam(8, ICodeEditorService),
  __decorateParam(9, IUriIdentityService)
], TestResultsPeek);
let TestResultsView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, resultService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.resultService = resultService;
    this.content = new Lazy(() => this._register(this.instantiationService.createInstance(TestResultsViewContent, void 0, {
      historyVisible: staticObservableValue(true),
      showRevealLocationOnMessages: true,
      locationForProgress: Testing.ExplorerViewId
    })));
  }
  get subject() {
    return this.content.rawValue?.current;
  }
  showLatestRun(preserveFocus = false) {
    const result = this.resultService.results.find((r) => r.tasks.length);
    if (!result) {
      return;
    }
    this.content.rawValue?.reveal({ preserveFocus, subject: new TaskSubject(result, 0) });
  }
  renderBody(container) {
    super.renderBody(container);
    if (this.isBodyVisible()) {
      this.renderContent(container);
    } else {
      this._register(Event.once(Event.filter(this.onDidChangeBodyVisibility, Boolean))(() => this.renderContent(container)));
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.content.rawValue?.onLayoutBody(height, width);
  }
  renderContent(container) {
    const content = this.content.value;
    content.fillBody(container);
    this._register(content.onDidRequestReveal((subject) => content.reveal({ preserveFocus: true, subject })));
    const [lastResult] = this.resultService.results;
    if (lastResult && lastResult.tasks.length) {
      content.reveal({ preserveFocus: true, subject: new TaskSubject(lastResult, 0) });
    }
  }
};
TestResultsView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ITestResultService)
], TestResultsView);
const firstLine = (str) => {
  const index = str.indexOf("\n");
  return index === -1 ? str : str.slice(0, index);
};
function getOuterEditorFromDiffEditor(codeEditorService) {
  const diffEditors = codeEditorService.listDiffEditors();
  for (const diffEditor of diffEditors) {
    if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
      return diffEditor.getParentEditor();
    }
  }
  return null;
}
class CloseTestPeek extends EditorAction2 {
  constructor() {
    super({
      id: "editor.closeTestPeek",
      title: localize2("close", "Close"),
      icon: Codicon.close,
      precondition: ContextKeyExpr.or(TestingContextKeys.isInPeek, TestingContextKeys.isPeekVisible),
      keybinding: {
        weight: KeybindingWeight.EditorContrib - 101,
        primary: KeyCode.Escape,
        when: ContextKeyExpr.not("config.editor.stablePeek")
      }
    });
  }
  runEditorCommand(accessor, editor) {
    const parent = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    TestingOutputPeekController.get(parent ?? editor)?.removePeek();
  }
}
const navWhen = ContextKeyExpr.and(
  EditorContextKeys.focus,
  TestingContextKeys.isPeekVisible
);
const getPeekedEditorFromFocus = (codeEditorService) => {
  const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
  return editor && getPeekedEditor(codeEditorService, editor);
};
const getPeekedEditor = (codeEditorService, editor) => {
  if (TestingOutputPeekController.get(editor)?.subject.get()) {
    return editor;
  }
  if (editor instanceof EmbeddedCodeEditorWidget) {
    return editor.getParentEditor();
  }
  const outer = getOuterEditorFromDiffEditor(codeEditorService);
  if (outer) {
    return outer;
  }
  return editor;
};
const _GoToNextMessageAction = class _GoToNextMessageAction extends Action2 {
  constructor() {
    super({
      id: _GoToNextMessageAction.ID,
      f1: true,
      title: localize2("testing.goToNextMessage", "Go to Next Test Failure"),
      metadata: {
        description: localize2("testing.goToNextMessage.description", "Shows the next failure message in your file")
      },
      icon: Codicon.arrowDown,
      category: Categories.Test,
      keybinding: {
        primary: KeyMod.Alt | KeyCode.F8,
        weight: KeybindingWeight.EditorContrib + 1,
        when: navWhen
      },
      menu: [{
        id: MenuId.TestPeekTitle,
        group: "navigation",
        order: 2
      }, {
        id: MenuId.CommandPalette,
        when: navWhen
      }]
    });
  }
  run(accessor) {
    const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    if (editor) {
      TestingOutputPeekController.get(editor)?.next();
    }
  }
};
_GoToNextMessageAction.ID = "testing.goToNextMessage";
let GoToNextMessageAction = _GoToNextMessageAction;
const _GoToPreviousMessageAction = class _GoToPreviousMessageAction extends Action2 {
  constructor() {
    super({
      id: _GoToPreviousMessageAction.ID,
      f1: true,
      title: localize2("testing.goToPreviousMessage", "Go to Previous Test Failure"),
      metadata: {
        description: localize2("testing.goToPreviousMessage.description", "Shows the previous failure message in your file")
      },
      icon: Codicon.arrowUp,
      category: Categories.Test,
      keybinding: {
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F8,
        weight: KeybindingWeight.EditorContrib + 1,
        when: navWhen
      },
      menu: [{
        id: MenuId.TestPeekTitle,
        group: "navigation",
        order: 1
      }, {
        id: MenuId.CommandPalette,
        when: navWhen
      }]
    });
  }
  run(accessor) {
    const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    if (editor) {
      TestingOutputPeekController.get(editor)?.previous();
    }
  }
};
_GoToPreviousMessageAction.ID = "testing.goToPreviousMessage";
let GoToPreviousMessageAction = _GoToPreviousMessageAction;
const _CollapsePeekStack = class _CollapsePeekStack extends Action2 {
  constructor() {
    super({
      id: _CollapsePeekStack.ID,
      title: localize2("testing.collapsePeekStack", "Collapse Stack Frames"),
      icon: Codicon.collapseAll,
      category: Categories.Test,
      menu: [{
        id: MenuId.TestPeekTitle,
        when: TestingContextKeys.peekHasStack,
        group: "navigation",
        order: 4
      }]
    });
  }
  run(accessor) {
    const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    if (editor) {
      TestingOutputPeekController.get(editor)?.collapseStack();
    }
  }
};
_CollapsePeekStack.ID = "testing.collapsePeekStack";
let CollapsePeekStack = _CollapsePeekStack;
const _OpenMessageInEditorAction = class _OpenMessageInEditorAction extends Action2 {
  constructor() {
    super({
      id: _OpenMessageInEditorAction.ID,
      f1: false,
      title: localize2("testing.openMessageInEditor", "Open in Editor"),
      icon: Codicon.goToFile,
      category: Categories.Test,
      menu: [{ id: MenuId.TestPeekTitle }]
    });
  }
  run(accessor) {
    accessor.get(ITestingPeekOpener).openCurrentInEditor();
  }
};
_OpenMessageInEditorAction.ID = "testing.openMessageInEditor";
let OpenMessageInEditorAction = _OpenMessageInEditorAction;
const _ToggleTestingPeekHistory = class _ToggleTestingPeekHistory extends Action2 {
  constructor() {
    super({
      id: _ToggleTestingPeekHistory.ID,
      f1: true,
      title: localize2("testing.toggleTestingPeekHistory", "Toggle Test History in Peek"),
      metadata: {
        description: localize2("testing.toggleTestingPeekHistory.description", "Shows or hides the history of test runs in the peek view")
      },
      icon: Codicon.history,
      category: Categories.Test,
      menu: [{
        id: MenuId.TestPeekTitle,
        group: "navigation",
        order: 3
      }],
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyCode.KeyH,
        when: TestingContextKeys.isPeekVisible.isEqualTo(true)
      }
    });
  }
  run(accessor) {
    const opener = accessor.get(ITestingPeekOpener);
    opener.historyVisible.value = !opener.historyVisible.value;
  }
};
_ToggleTestingPeekHistory.ID = "testing.toggleTestingPeekHistory";
let ToggleTestingPeekHistory = _ToggleTestingPeekHistory;
export {
  CloseTestPeek,
  CollapsePeekStack,
  GoToNextMessageAction,
  GoToPreviousMessageAction,
  OpenMessageInEditorAction,
  TestResultsView,
  TestingOutputPeekController,
  TestingPeekOpener,
  ToggleTestingPeekHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RpbmdPdXRwdXRQZWVrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvciwgSUVkaXRvckNvbnRyaWJ1dGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQZWVrVmlld1NlcnZpY2UsIFBlZWtWaWV3V2lkZ2V0LCBwZWVrVmlld1RpdGxlRm9yZWdyb3VuZCwgcGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgZmlsbEluQWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucywgVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0b09wZW5QZWVrVmlld1doZW4sIFRlc3RpbmdDb25maWdLZXlzLCBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RpbmcgfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IE11dGFibGVPYnNlcnZhYmxlVmFsdWUsIHN0YXRpY09ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uL2NvbW1vbi9vYnNlcnZhYmxlVmFsdWUuanMnO1xuaW1wb3J0IHsgU3RvcmVkVmFsdWUgfSBmcm9tICcuLi9jb21tb24vc3RvcmVkVmFsdWUuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHQsIFRlc3RSZXN1bHRJdGVtQ2hhbmdlLCBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbiwgcmVzdWx0SXRlbVBhcmVudHMgfSBmcm9tICcuLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UsIFJlc3VsdENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmljaExvY2F0aW9uLCBJVGVzdE1lc3NhZ2UsIFRlc3RNZXNzYWdlVHlwZSwgVGVzdFJlc3VsdEl0ZW0gfSBmcm9tICcuLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RpbmdDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSVNob3dSZXN1bHRPcHRpb25zLCBJVGVzdGluZ1BlZWtPcGVuZXIgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1BlZWtPcGVuZXIuanMnO1xuaW1wb3J0IHsgaXNGYWlsZWRTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IFBhcnNlZFRlc3RVcmksIFRlc3RVcmlUeXBlLCBidWlsZFRlc3RVcmksIHBhcnNlVGVzdFVyaSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nVXJpLmpzJztcbmltcG9ydCB7IHJlbmRlclRlc3RNZXNzYWdlQXNUZXh0IH0gZnJvbSAnLi90ZXN0TWVzc2FnZUNvbG9yaXplci5qcyc7XG5pbXBvcnQgeyBJbnNwZWN0U3ViamVjdCwgTWVzc2FnZVN1YmplY3QsIFRhc2tTdWJqZWN0LCBUZXN0T3V0cHV0U3ViamVjdCwgaW5zcGVjdFN1YmplY3RIYXNTdGFjaywgbWFwRmluZFRlc3RNZXNzYWdlIH0gZnJvbSAnLi90ZXN0UmVzdWx0c1ZpZXcvdGVzdFJlc3VsdHNTdWJqZWN0LmpzJztcbmltcG9ydCB7IFRlc3RSZXN1bHRzVmlld0NvbnRlbnQgfSBmcm9tICcuL3Rlc3RSZXN1bHRzVmlldy90ZXN0UmVzdWx0c1ZpZXdDb250ZW50LmpzJztcbmltcG9ydCB7IHRlc3RpbmdNZXNzYWdlUGVla0JvcmRlciwgdGVzdGluZ1BlZWtCb3JkZXIsIHRlc3RpbmdQZWVrSGVhZGVyQmFja2dyb3VuZCwgdGVzdGluZ1BlZWtNZXNzYWdlSGVhZGVyQmFja2dyb3VuZCB9IGZyb20gJy4vdGhlbWUuanMnO1xuXG5cbi8qKiBJdGVyYXRlcyB0aHJvdWdoIGV2ZXJ5IG1lc3NhZ2UgaW4gZXZlcnkgcmVzdWx0ICovXG5mdW5jdGlvbiogYWxsTWVzc2FnZXMoW3Jlc3VsdF06IHJlYWRvbmx5IElUZXN0UmVzdWx0W10pIHtcblx0aWYgKCFyZXN1bHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRmb3IgKGNvbnN0IHRlc3Qgb2YgcmVzdWx0LnRlc3RzKSB7XG5cdFx0Zm9yIChsZXQgdGFza0luZGV4ID0gMDsgdGFza0luZGV4IDwgdGVzdC50YXNrcy5sZW5ndGg7IHRhc2tJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlcyA9IHRlc3QudGFza3NbdGFza0luZGV4XS5tZXNzYWdlcztcblx0XHRcdGZvciAobGV0IG1lc3NhZ2VJbmRleCA9IDA7IG1lc3NhZ2VJbmRleCA8IG1lc3NhZ2VzLmxlbmd0aDsgbWVzc2FnZUluZGV4KyspIHtcblxuXHRcdFx0XHRpZiAobWVzc2FnZXNbbWVzc2FnZUluZGV4XS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IpIHtcblx0XHRcdFx0XHR5aWVsZCB7IHJlc3VsdCwgdGVzdCwgdGFza0luZGV4LCBtZXNzYWdlSW5kZXggfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSU1lc3NhZ2VJdGVyYXRlZFJlZmVyZW5jZSB7XG5cdG1lc3NhZ2VJbmRleDogbnVtYmVyO1xuXHR0YXNrSW5kZXg6IG51bWJlcjtcblx0cmVzdWx0OiBJVGVzdFJlc3VsdDtcblx0dGVzdDogVGVzdFJlc3VsdEl0ZW07XG59XG5cbmZ1bmN0aW9uIG1lc3NhZ2VJdFJlZmVyZW5jZVRvVXJpKHsgcmVzdWx0LCB0ZXN0LCB0YXNrSW5kZXgsIG1lc3NhZ2VJbmRleCB9OiBJTWVzc2FnZUl0ZXJhdGVkUmVmZXJlbmNlKSB7XG5cdHJldHVybiBidWlsZFRlc3RVcmkoe1xuXHRcdHR5cGU6IFRlc3RVcmlUeXBlLlJlc3VsdE1lc3NhZ2UsXG5cdFx0cmVzdWx0SWQ6IHJlc3VsdC5pZCxcblx0XHR0ZXN0RXh0SWQ6IHRlc3QuaXRlbS5leHRJZCxcblx0XHR0YXNrSW5kZXgsXG5cdFx0bWVzc2FnZUluZGV4LFxuXHR9KTtcbn1cblxudHlwZSBUZXN0VXJpV2l0aERvY3VtZW50ID0gUGFyc2VkVGVzdFVyaSAmIHsgZG9jdW1lbnRVcmk6IFVSSSB9O1xuXG5leHBvcnQgY2xhc3MgVGVzdGluZ1BlZWtPcGVuZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlc3RpbmdQZWVrT3BlbmVyIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi50ZXN0aW5nLnBlZWtPcGVuZXInO1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgbGFzdFVyaT86IFRlc3RVcmlXaXRoRG9jdW1lbnQ7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBoaXN0b3J5VmlzaWJsZTogTXV0YWJsZU9ic2VydmFibGVWYWx1ZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UmVzdWx0czogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0UmVzdWx0cy5vblRlc3RDaGFuZ2VkKHRoaXMub3BlblBlZWtPbkZhaWx1cmUsIHRoaXMpKTtcblx0XHR0aGlzLmhpc3RvcnlWaXNpYmxlID0gdGhpcy5fcmVnaXN0ZXIoTXV0YWJsZU9ic2VydmFibGVWYWx1ZS5zdG9yZWQobmV3IFN0b3JlZFZhbHVlPGJvb2xlYW4+KHtcblx0XHRcdGtleTogJ3Rlc3RIaXN0b3J5VmlzaWJsZUluUGVlaycsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHR9LCBzdG9yYWdlU2VydmljZSksIGZhbHNlKSk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGFzeW5jIG9wZW4oKSB7XG5cdFx0bGV0IHVyaTogVGVzdFVyaVdpdGhEb2N1bWVudCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmUpICYmIGFjdGl2ZS5nZXRNb2RlbCgpPy51cmkpIHtcblx0XHRcdGNvbnN0IG1vZGVsVXJpID0gYWN0aXZlLmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGlmIChtb2RlbFVyaSkge1xuXHRcdFx0XHR1cmkgPSBhd2FpdCB0aGlzLmdldEZpbGVDYW5kaWRhdGVNZXNzYWdlKG1vZGVsVXJpLCBhY3RpdmUuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHVyaSA9IHRoaXMubGFzdFVyaTtcblx0XHR9XG5cblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0dXJpID0gdGhpcy5nZXRBbnlDYW5kaWRhdGVNZXNzYWdlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zaG93UGVla0Zyb21VcmkodXJpKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgdHJ5UGVla0ZpcnN0RXJyb3IocmVzdWx0OiBJVGVzdFJlc3VsdCwgdGVzdDogVGVzdFJlc3VsdEl0ZW0sIG9wdGlvbnM/OiBQYXJ0aWFsPElUZXh0RWRpdG9yT3B0aW9ucz4pIHtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLmdldEZhaWxlZENhbmRpZGF0ZU1lc3NhZ2UodGVzdCk7XG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnNob3dQZWVrRnJvbVVyaSh7XG5cdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlLFxuXHRcdFx0ZG9jdW1lbnRVcmk6IGNhbmRpZGF0ZS5sb2NhdGlvbi51cmksXG5cdFx0XHR0YXNrSW5kZXg6IGNhbmRpZGF0ZS50YXNrSWQsXG5cdFx0XHRtZXNzYWdlSW5kZXg6IGNhbmRpZGF0ZS5pbmRleCxcblx0XHRcdHJlc3VsdElkOiByZXN1bHQuaWQsXG5cdFx0XHR0ZXN0RXh0SWQ6IHRlc3QuaXRlbS5leHRJZCxcblx0XHR9LCB1bmRlZmluZWQsIHsgc2VsZWN0aW9uOiBjYW5kaWRhdGUubG9jYXRpb24ucmFuZ2UsIHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLk5lYXJUb3BJZk91dHNpZGVWaWV3cG9ydCwgLi4ub3B0aW9ucyB9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcGVla1VyaSh1cmk6IFVSSSwgb3B0aW9uczogSVNob3dSZXN1bHRPcHRpb25zID0ge30pIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVRlc3RVcmkodXJpKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZWQgJiYgdGhpcy50ZXN0UmVzdWx0cy5nZXRSZXN1bHQocGFyc2VkLnJlc3VsdElkKTtcblx0XHRpZiAoIXBhcnNlZCB8fCAhcmVzdWx0IHx8ICEoJ3Rlc3RFeHRJZCcgaW4gcGFyc2VkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghKCdtZXNzYWdlSW5kZXgnIGluIHBhcnNlZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlID0gcmVzdWx0LmdldFN0YXRlQnlJZChwYXJzZWQudGVzdEV4dElkKT8udGFza3NbcGFyc2VkLnRhc2tJbmRleF0ubWVzc2FnZXNbcGFyc2VkLm1lc3NhZ2VJbmRleF07XG5cdFx0aWYgKCFtZXNzYWdlPy5sb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuc2hvd1BlZWtGcm9tVXJpKHtcblx0XHRcdHR5cGU6IFRlc3RVcmlUeXBlLlJlc3VsdE1lc3NhZ2UsXG5cdFx0XHRkb2N1bWVudFVyaTogbWVzc2FnZS5sb2NhdGlvbi51cmksXG5cdFx0XHR0YXNrSW5kZXg6IHBhcnNlZC50YXNrSW5kZXgsXG5cdFx0XHRtZXNzYWdlSW5kZXg6IHBhcnNlZC5tZXNzYWdlSW5kZXgsXG5cdFx0XHRyZXN1bHRJZDogcmVzdWx0LmlkLFxuXHRcdFx0dGVzdEV4dElkOiBwYXJzZWQudGVzdEV4dElkLFxuXHRcdH0sIG9wdGlvbnMuaW5FZGl0b3IsIHsgc2VsZWN0aW9uOiBtZXNzYWdlLmxvY2F0aW9uLnJhbmdlLCAuLi5vcHRpb25zLm9wdGlvbnMgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGNsb3NlQWxsUGVla3MoKSB7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKSkge1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpPy5yZW1vdmVQZWVrKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9wZW5DdXJyZW50SW5FZGl0b3IoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuZ2V0QWN0aXZlQ29udHJvbCgpO1xuXHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7IHBpbm5lZDogZmFsc2UsIHJldmVhbElmT3BlbmVkOiB0cnVlIH07XG5cdFx0aWYgKGN1cnJlbnQgaW5zdGFuY2VvZiBUYXNrU3ViamVjdCB8fCBjdXJyZW50IGluc3RhbmNlb2YgVGVzdE91dHB1dFN1YmplY3QpIHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGN1cnJlbnQub3V0cHV0VXJpLCBvcHRpb25zIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50IGluc3RhbmNlb2YgVGVzdE91dHB1dFN1YmplY3QpIHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGN1cnJlbnQub3V0cHV0VXJpLCBvcHRpb25zIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBjdXJyZW50Lm1lc3NhZ2U7XG5cdFx0aWYgKGN1cnJlbnQuaXNEaWZmYWJsZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogY3VycmVudC5leHBlY3RlZFVyaSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogY3VycmVudC5hY3R1YWxVcmkgfSxcblx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIG1lc3NhZ2UubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGN1cnJlbnQubWVzc2FnZVVyaSwgb3B0aW9ucyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnbWFya2Rvd24uc2hvd1ByZXZpZXcnLCBjdXJyZW50Lm1lc3NhZ2VVcmkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgndGVzdGluZy5tYXJrZG93blBlZWtFcnJvcicsICdDb3VsZCBub3Qgb3BlbiBtYXJrZG93biBwcmV2aWV3OiB7MH0uXFxuXFxuUGxlYXNlIG1ha2Ugc3VyZSB0aGUgbWFya2Rvd24gZXh0ZW5zaW9uIGlzIGVuYWJsZWQuJywgZXJyLm1lc3NhZ2UpKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ29udHJvbCgpOiBJbnNwZWN0U3ViamVjdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0UGVla2VkRWRpdG9yRnJvbUZvY3VzKHRoaXMuY29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3IgJiYgVGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdHJldHVybiBjb250cm9sbGVyPy5zdWJqZWN0LmdldCgpID8/IHRoaXMudmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8VGVzdFJlc3VsdHNWaWV3PihUZXN0aW5nLlJlc3VsdHNWaWV3SWQpPy5zdWJqZWN0O1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHByaXZhdGUgYXN5bmMgc2hvd1BlZWtGcm9tVXJpKHVyaTogVGVzdFVyaVdpdGhEb2N1bWVudCwgZWRpdG9yPzogSUVkaXRvciwgb3B0aW9ucz86IElUZXh0RWRpdG9yT3B0aW9ucykge1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoZWRpdG9yKSkge1xuXHRcdFx0dGhpcy5sYXN0VXJpID0gdXJpO1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpPy5zaG93KGJ1aWxkVGVzdFVyaSh0aGlzLmxhc3RVcmkpKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhbmUgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdXJpLmRvY3VtZW50VXJpLFxuXHRcdFx0b3B0aW9uczogeyByZXZlYWxJZk9wZW5lZDogdHJ1ZSwgLi4ub3B0aW9ucyB9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb250cm9sID0gcGFuZT8uZ2V0Q29udHJvbCgpO1xuXHRcdGlmICghaXNDb2RlRWRpdG9yKGNvbnRyb2wpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0VXJpID0gdXJpO1xuXHRcdFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQoY29udHJvbCk/LnNob3coYnVpbGRUZXN0VXJpKHRoaXMubGFzdFVyaSkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW5zIHRoZSBwZWVrIHZpZXcgb24gYSB0ZXN0IGZhaWx1cmUsIGJhc2VkIG9uIHVzZXIgcHJlZmVyZW5jZXMuXG5cdCAqL1xuXHRwcml2YXRlIG9wZW5QZWVrT25GYWlsdXJlKGV2dDogVGVzdFJlc3VsdEl0ZW1DaGFuZ2UpIHtcblx0XHRpZiAoZXZ0LnJlYXNvbiAhPT0gVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLmdldEZhaWxlZENhbmRpZGF0ZU1lc3NhZ2UoZXZ0Lml0ZW0pO1xuXHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGV2dC5yZXN1bHQucmVxdWVzdC5jb250aW51b3VzICYmICFnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb24sIFRlc3RpbmdDb25maWdLZXlzLkF1dG9PcGVuUGVla1ZpZXdEdXJpbmdDb250aW51b3VzUnVuKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpO1xuXHRcdGNvbnN0IGNmZyA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvbiwgVGVzdGluZ0NvbmZpZ0tleXMuQXV0b09wZW5QZWVrVmlldyk7XG5cblx0XHQvLyBkb24ndCBzaG93IHRoZSBwZWVrIGlmIHRoZSB1c2VyIGFza2VkIHRvIG9ubHkgYXV0by1vcGVuIHBlZWtzIGZvciB2aXNpYmxlIHRlc3RzLFxuXHRcdC8vIGFuZCB0aGlzIHRlc3QgaXMgbm90IGluIGFueSBvZiB0aGUgZWRpdG9ycycgbW9kZWxzLlxuXHRcdHN3aXRjaCAoY2ZnKSB7XG5cdFx0XHRjYXNlIEF1dG9PcGVuUGVla1ZpZXdXaGVuLkZhaWx1cmVWaXNpYmxlOiB7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVFZGl0b3JzID0gdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVUZXh0RWRpdG9yQ29udHJvbHM7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclVyaXMgPSBuZXcgU2V0KHZpc2libGVFZGl0b3JzLmZpbHRlcihpc0NvZGVFZGl0b3IpLm1hcChlID0+IGUuZ2V0TW9kZWwoKT8udXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0aWYgKCFJdGVyYWJsZS5zb21lKHJlc3VsdEl0ZW1QYXJlbnRzKGV2dC5yZXN1bHQsIGV2dC5pdGVtKSwgaSA9PiBpLml0ZW0udXJpICYmIGVkaXRvclVyaXMuaGFzKGkuaXRlbS51cmkudG9TdHJpbmcoKSkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEFsc28gY2hlY2sgdGhhdCB0aGUgbWVzc2FnZSBsb2NhdGlvbiBpdHNlbGYgaXMgaW4gYSB2aXNpYmxlXG5cdFx0XHRcdC8vIGRvY3VtZW50LiBUaGUgbWVzc2FnZSBtYXkgcG9pbnQgdG8gYSBkaWZmZXJlbnQgZmlsZSAoZS5nLiBhXG5cdFx0XHRcdC8vIHV0aWxpdHkpIHRoYW4gd2hlcmUgdGhlIHRlc3QgaXMgZGVmaW5lZCwgYW5kIG9wZW5pbmcgYSBub24tXG5cdFx0XHRcdC8vIHZpc2libGUgZmlsZSBqdXN0IHRvIHNob3cgYSBwZWVrIHdvdWxkIGJlIGRpc3J1cHRpdmUuXG5cdFx0XHRcdGlmICghZWRpdG9yVXJpcy5oYXMoY2FuZGlkYXRlLmxvY2F0aW9uLnVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhazsgLy9jb250aW51ZVxuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBdXRvT3BlblBlZWtWaWV3V2hlbi5GYWlsdXJlQW55d2hlcmU6XG5cdFx0XHRcdGJyZWFrOyAvL2NvbnRpbnVlXG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybjsgLy8gbmV2ZXIgc2hvd1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXJzID0gZWRpdG9ycy5tYXAoVGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldCk7XG5cdFx0aWYgKGNvbnRyb2xsZXJzLnNvbWUoYyA9PiBjPy5zdWJqZWN0LmdldCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJ5UGVla0ZpcnN0RXJyb3IoZXZ0LnJlc3VsdCwgZXZ0Lml0ZW0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIG1lc3NhZ2UgY2xvc2VzdCB0byB0aGUgZ2l2ZW4gcG9zaXRpb24gZnJvbSBhIHRlc3QgaW4gdGhlIGZpbGUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGdldEZpbGVDYW5kaWRhdGVNZXNzYWdlKHVyaTogVVJJLCBwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsKSB7XG5cdFx0bGV0IGJlc3Q6IFRlc3RVcmlXaXRoRG9jdW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGJlc3REaXN0YW5jZSA9IEluZmluaXR5O1xuXG5cdFx0Ly8gR2V0IGFsbCB0ZXN0cyBmb3IgdGhlIGRvY3VtZW50LiBJbiB0aG9zZSwgZmluZCBvbmUgdGhhdCBoYXMgYSB0ZXN0XG5cdFx0Ly8gbWVzc2FnZSBjbG9zZXN0IHRvIHRoZSBjdXJzb3IgcG9zaXRpb24uXG5cdFx0Y29uc3QgZGVtYW5kZWRVcmlTdHIgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLmFsbCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy50ZXN0UmVzdWx0cy5nZXRTdGF0ZUJ5SWQodGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXBGaW5kVGVzdE1lc3NhZ2UocmVzdWx0WzFdLCAoX3Rhc2ssIG1lc3NhZ2UsIG1lc3NhZ2VJbmRleCwgdGFza0luZGV4KSA9PiB7XG5cdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgIT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvciB8fCAhbWVzc2FnZS5sb2NhdGlvbiB8fCBtZXNzYWdlLmxvY2F0aW9uLnVyaS50b1N0cmluZygpICE9PSBkZW1hbmRlZFVyaVN0cikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRpc3RhbmNlID0gcG9zaXRpb24gPyBNYXRoLmFicyhwb3NpdGlvbi5saW5lTnVtYmVyIC0gbWVzc2FnZS5sb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIpIDogMDtcblx0XHRcdFx0aWYgKCFiZXN0IHx8IGRpc3RhbmNlIDw9IGJlc3REaXN0YW5jZSkge1xuXHRcdFx0XHRcdGJlc3REaXN0YW5jZSA9IGRpc3RhbmNlO1xuXHRcdFx0XHRcdGJlc3QgPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlLFxuXHRcdFx0XHRcdFx0dGVzdEV4dElkOiByZXN1bHRbMV0uaXRlbS5leHRJZCxcblx0XHRcdFx0XHRcdHJlc3VsdElkOiByZXN1bHRbMF0uaWQsXG5cdFx0XHRcdFx0XHR0YXNrSW5kZXgsXG5cdFx0XHRcdFx0XHRtZXNzYWdlSW5kZXgsXG5cdFx0XHRcdFx0XHRkb2N1bWVudFVyaTogdXJpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBiZXN0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgYW55IHBvc3NpYmxlIHN0aWxsLXJlbGV2YW50IG1lc3NhZ2UgZnJvbSB0aGUgcmVzdWx0cy5cblx0ICovXG5cdHByaXZhdGUgZ2V0QW55Q2FuZGlkYXRlTWVzc2FnZSgpIHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgdGhpcy50ZXN0UmVzdWx0cy5yZXN1bHRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgcmVzdWx0LnRlc3RzKSB7XG5cdFx0XHRcdGlmIChzZWVuLmhhcyh0ZXN0Lml0ZW0uZXh0SWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZWVuLmFkZCh0ZXN0Lml0ZW0uZXh0SWQpO1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IG1hcEZpbmRUZXN0TWVzc2FnZSh0ZXN0LCAodGFzaywgbWVzc2FnZSwgbWVzc2FnZUluZGV4LCB0YXNrSW5kZXgpID0+IChcblx0XHRcdFx0XHRtZXNzYWdlLmxvY2F0aW9uICYmIHtcblx0XHRcdFx0XHRcdHR5cGU6IFRlc3RVcmlUeXBlLlJlc3VsdE1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0ZXN0RXh0SWQ6IHRlc3QuaXRlbS5leHRJZCxcblx0XHRcdFx0XHRcdHJlc3VsdElkOiByZXN1bHQuaWQsXG5cdFx0XHRcdFx0XHR0YXNrSW5kZXgsXG5cdFx0XHRcdFx0XHRtZXNzYWdlSW5kZXgsXG5cdFx0XHRcdFx0XHRkb2N1bWVudFVyaTogbWVzc2FnZS5sb2NhdGlvbi51cmksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRpZiAoZm91bmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZm91bmQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGZpcnN0IGZhaWxlZCBtZXNzYWdlIHRoYXQgY2FuIGJlIGRpc3BsYXllZCBmcm9tIHRoZSByZXN1bHQuXG5cdCAqL1xuXHRwcml2YXRlIGdldEZhaWxlZENhbmRpZGF0ZU1lc3NhZ2UodGVzdDogVGVzdFJlc3VsdEl0ZW0pIHtcblx0XHRjb25zdCBmYWxsYmFja0xvY2F0aW9uID0gdGVzdC5pdGVtLnVyaSAmJiB0ZXN0Lml0ZW0ucmFuZ2Vcblx0XHRcdD8geyB1cmk6IHRlc3QuaXRlbS51cmksIHJhbmdlOiB0ZXN0Lml0ZW0ucmFuZ2UgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRsZXQgYmVzdDogeyB0YXNrSWQ6IG51bWJlcjsgaW5kZXg6IG51bWJlcjsgbWVzc2FnZTogSVRlc3RNZXNzYWdlOyBsb2NhdGlvbjogSVJpY2hMb2NhdGlvbiB9IHwgdW5kZWZpbmVkO1xuXHRcdG1hcEZpbmRUZXN0TWVzc2FnZSh0ZXN0LCAodGFzaywgbWVzc2FnZSwgbWVzc2FnZUluZGV4LCB0YXNrSWQpID0+IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gbWVzc2FnZS5sb2NhdGlvbiB8fCBmYWxsYmFja0xvY2F0aW9uO1xuXHRcdFx0aWYgKCFpc0ZhaWxlZFN0YXRlKHRhc2suc3RhdGUpIHx8ICFsb2NhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChiZXN0ICYmIG1lc3NhZ2UudHlwZSAhPT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YmVzdCA9IHsgdGFza0lkLCBpbmRleDogbWVzc2FnZUluZGV4LCBtZXNzYWdlLCBsb2NhdGlvbiB9O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGJlc3Q7XG5cdH1cbn1cblxuLyoqXG4gKiBBZGRzIG91dHB1dC9tZXNzYWdlIHBlZWsgZnVuY3Rpb25hbGl0eSB0byBjb2RlIGVkaXRvcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjb250cm9sbGVyIGFzc29jaWF0ZWQgd2l0aCB0aGUgZ2l2ZW4gY29kZSBlZGl0b3IuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogVGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyPihUZXN0aW5nLk91dHB1dFBlZWtDb250cmlidXRpb25JZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3VycmVudGx5LXNob3duIHBlZWsgdmlldy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgcGVlayA9IHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVPYnNlcnZhYmxlVmFsdWU8VGVzdFJlc3VsdHNQZWVrIHwgdW5kZWZpbmVkPignVGVzdGluZ091dHB1dFBlZWsnLCB1bmRlZmluZWQpKTtcblxuXHQvKipcblx0ICogQ29udGV4dCBrZXkgdXBkYXRlZCB3aGVuIHRoZSBwZWVrIGlzIHZpc2libGUvaGlkZGVuLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgY3VycmVudGx5IGRpc3BsYXkgc3ViamVjdC4gVW5kZWZpbmVkIGlmIHRoZSBwZWVrIGlzIG5vdCBvcGVuLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHN1YmplY3QgPSBkZXJpdmVkKHJlYWRlciA9PiB0aGlzLnBlZWsucmVhZChyZWFkZXIpPy5jdXJyZW50LnJlYWQocmVhZGVyKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UmVzdWx0czogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cblx0XHRzdXBlcigpO1xuXHRcdHRoaXMudmlzaWJsZSA9IFRlc3RpbmdDb250ZXh0S2V5cy5pc1BlZWtWaXNpYmxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5wZWVrLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0UmVzdWx0cy5vblJlc3VsdHNDaGFuZ2VkKHRoaXMuY2xvc2VQZWVrT25DZXJ0YWluUmVzdWx0RXZlbnRzLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVzdFJlc3VsdHMub25UZXN0Q2hhbmdlZCh0aGlzLmNsb3NlUGVla09uVGVzdENoYW5nZSwgdGhpcykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIGEgcGVlayBmb3IgdGhlIG1lc3NhZ2UgaW4gdGhlIGVkaXRvci5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBzaG93KHVyaTogVVJJKSB7XG5cdFx0Y29uc3Qgc3ViamVjdCA9IHRoaXMucmV0cmlldmVUZXN0KHVyaSk7XG5cdFx0aWYgKHN1YmplY3QpIHtcblx0XHRcdHRoaXMuc2hvd1N1YmplY3Qoc3ViamVjdCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIGEgcGVlayBmb3IgdGhlIGV4aXN0aW5nIGluc3BlY3Qgc3ViamVjdC5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBzaG93U3ViamVjdChzdWJqZWN0OiBJbnNwZWN0U3ViamVjdCkge1xuXHRcdGlmICghdGhpcy5wZWVrLmdldCgpKSB7XG5cdFx0XHRjb25zdCBwZWVrID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UmVzdWx0c1BlZWssIHRoaXMuZWRpdG9yKTtcblx0XHRcdHRoaXMucGVlay5zZXQocGVlaywgdW5kZWZpbmVkKTtcblx0XHRcdEV2ZW50Lm9uY2UocGVlay5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudmlzaWJsZS5zZXQoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLnBlZWsuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnZpc2libGUuc2V0KHRydWUpO1xuXHRcdFx0cGVlay5jcmVhdGUoKTtcblx0XHR9XG5cblx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0KSB7XG5cdFx0XHRhbGVydChyZW5kZXJUZXN0TWVzc2FnZUFzVGV4dChzdWJqZWN0Lm1lc3NhZ2UubWVzc2FnZSkpO1xuXHRcdH1cblxuXHRcdHRoaXMucGVlay5nZXQoKSEuc2V0TW9kZWwoc3ViamVjdCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgb3BlbkFuZFNob3codXJpOiBVUkkpIHtcblx0XHRjb25zdCBzdWJqZWN0ID0gdGhpcy5yZXRyaWV2ZVRlc3QodXJpKTtcblx0XHRpZiAoIXN1YmplY3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXN1YmplY3QucmV2ZWFsTG9jYXRpb24gfHwgc3ViamVjdC5yZXZlYWxMb2NhdGlvbi51cmkudG9TdHJpbmcoKSA9PT0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNob3codXJpKTtcblx0XHR9XG5cblx0XHRjb25zdCBvdGhlckVkaXRvciA9IGF3YWl0IHRoaXMuY29kZUVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHN1YmplY3QucmV2ZWFsTG9jYXRpb24udXJpLFxuXHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IGZhbHNlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSB9XG5cdFx0fSwgdGhpcy5lZGl0b3IpO1xuXG5cdFx0aWYgKG90aGVyRWRpdG9yKSB7XG5cdFx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KG90aGVyRWRpdG9yKT8ucmVtb3ZlUGVlaygpO1xuXHRcdFx0cmV0dXJuIFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQob3RoZXJFZGl0b3IpPy5zaG93KHVyaSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2VzIHRoZSBwZWVrIHZpZXcsIGlmIGFueS5cblx0ICovXG5cdHB1YmxpYyByZW1vdmVQZWVrKCkge1xuXHRcdHRoaXMucGVlay5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbGxhcHNlcyBhbGwgZGlzcGxheWVkIHN0YWNrIGZyYW1lcy5cblx0ICovXG5cdHB1YmxpYyBjb2xsYXBzZVN0YWNrKCkge1xuXHRcdHRoaXMucGVlay5nZXQoKT8uY29sbGFwc2VTdGFjaygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIHRoZSBuZXh0IG1lc3NhZ2UgaW4gdGhlIHBlZWssIGlmIHBvc3NpYmxlLlxuXHQgKi9cblx0cHVibGljIG5leHQoKSB7XG5cdFx0Y29uc3Qgc3ViamVjdCA9IHRoaXMucGVlay5nZXQoKT8uY3VycmVudC5nZXQoKTtcblx0XHRpZiAoIXN1YmplY3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZmlyc3Q6IElNZXNzYWdlSXRlcmF0ZWRSZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cblx0XHRsZXQgZm91bmQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IG0gb2YgYWxsTWVzc2FnZXModGhpcy50ZXN0UmVzdWx0cy5yZXN1bHRzKSkge1xuXHRcdFx0Zmlyc3QgPz89IG07XG5cdFx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIFRhc2tTdWJqZWN0ICYmIG0ucmVzdWx0LmlkID09PSBzdWJqZWN0LnJlc3VsdC5pZCkge1xuXHRcdFx0XHRmb3VuZCA9IHRydWU7IC8vIG9wZW4gdGhlIGZpcnN0IG1lc3NhZ2UgZm91bmQgaW4gdGhlIGN1cnJlbnQgcmVzdWx0XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHR0aGlzLm9wZW5BbmRTaG93KG1lc3NhZ2VJdFJlZmVyZW5jZVRvVXJpKG0pKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0ICYmIHN1YmplY3QudGVzdC5pdGVtLmV4dElkID09PSBtLnRlc3QuaXRlbS5leHRJZCAmJiBzdWJqZWN0LnRhc2tJbmRleCA9PT0gbS50YXNrSW5kZXggJiYgc3ViamVjdC5yZXN1bHQuaWQgPT09IG0ucmVzdWx0LmlkKSB7XG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCAmJiBzdWJqZWN0LnRlc3QuZXh0SWQgPT09IG0udGVzdC5pdGVtLmV4dElkICYmIHN1YmplY3QubWVzc2FnZUluZGV4ID09PSBtLm1lc3NhZ2VJbmRleCAmJiBzdWJqZWN0LnRhc2tJbmRleCA9PT0gbS50YXNrSW5kZXggJiYgc3ViamVjdC5yZXN1bHQuaWQgPT09IG0ucmVzdWx0LmlkKSB7XG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZmlyc3QpIHtcblx0XHRcdHRoaXMub3BlbkFuZFNob3cobWVzc2FnZUl0UmVmZXJlbmNlVG9VcmkoZmlyc3QpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgdGhlIHByZXZpb3VzIG1lc3NhZ2UgaW4gdGhlIHBlZWssIGlmIHBvc3NpYmxlLlxuXHQgKi9cblx0cHVibGljIHByZXZpb3VzKCkge1xuXHRcdGNvbnN0IHN1YmplY3QgPSB0aGlzLnN1YmplY3QuZ2V0KCk7XG5cdFx0aWYgKCFzdWJqZWN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHByZXZpb3VzOiBJTWVzc2FnZUl0ZXJhdGVkUmVmZXJlbmNlIHwgdW5kZWZpbmVkOyAvLyBwb2ludGVyIHRvIHRoZSBsYXN0IG1lc3NhZ2Vcblx0XHRsZXQgcHJldmlvdXNMb2NrZWRJbiA9IGZhbHNlOyAvLyB3aGV0aGVyIHRoZSBsYXN0IG1lc3NhZ2Ugd2FzIHZlcmlmaWVkIGFzIHByZXZpb3VzIHRvIHRoZSBjdXJyZW50IHN1YmplY3Rcblx0XHRsZXQgbGFzdDogSU1lc3NhZ2VJdGVyYXRlZFJlZmVyZW5jZSB8IHVuZGVmaW5lZDsgLy8gb3ZlcmFsbCBsYXN0IG1lc3NhZ2Vcblx0XHRmb3IgKGNvbnN0IG0gb2YgYWxsTWVzc2FnZXModGhpcy50ZXN0UmVzdWx0cy5yZXN1bHRzKSkge1xuXHRcdFx0bGFzdCA9IG07XG5cblx0XHRcdGlmICghcHJldmlvdXNMb2NrZWRJbikge1xuXHRcdFx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIFRhc2tTdWJqZWN0KSB7XG5cdFx0XHRcdFx0aWYgKG0ucmVzdWx0LmlkID09PSBzdWJqZWN0LnJlc3VsdC5pZCkge1xuXHRcdFx0XHRcdFx0cHJldmlvdXNMb2NrZWRJbiA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUZXN0T3V0cHV0U3ViamVjdCkge1xuXHRcdFx0XHRcdGlmIChtLnRlc3QuaXRlbS5leHRJZCA9PT0gc3ViamVjdC50ZXN0Lml0ZW0uZXh0SWQgJiYgbS5yZXN1bHQuaWQgPT09IHN1YmplY3QucmVzdWx0LmlkICYmIG0udGFza0luZGV4ID09PSBzdWJqZWN0LnRhc2tJbmRleCkge1xuXHRcdFx0XHRcdFx0cHJldmlvdXNMb2NrZWRJbiA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN1YmplY3QudGVzdC5leHRJZCA9PT0gbS50ZXN0Lml0ZW0uZXh0SWQgJiYgc3ViamVjdC5tZXNzYWdlSW5kZXggPT09IG0ubWVzc2FnZUluZGV4ICYmIHN1YmplY3QudGFza0luZGV4ID09PSBtLnRhc2tJbmRleCAmJiBzdWJqZWN0LnJlc3VsdC5pZCA9PT0gbS5yZXN1bHQuaWQpIHtcblx0XHRcdFx0XHRwcmV2aW91c0xvY2tlZEluID0gdHJ1ZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByZXZpb3VzID0gbTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBwcmV2aW91cyB8fCBsYXN0O1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHRoaXMub3BlbkFuZFNob3cobWVzc2FnZUl0UmVmZXJlbmNlVG9VcmkodGFyZ2V0KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgdGhlIHBlZWsgdmlldyBpZiBpdCdzIGJlaW5nIGRpc3BsYXllZCBvbiB0aGUgZ2l2ZW4gdGVzdCBJRC5cblx0ICovXG5cdHB1YmxpYyByZW1vdmVJZlBlZWtpbmdGb3JUZXN0KHRlc3RJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgYyA9IHRoaXMuc3ViamVjdC5nZXQoKTtcblx0XHRpZiAoYyAmJiBjIGluc3RhbmNlb2YgTWVzc2FnZVN1YmplY3QgJiYgYy50ZXN0LmV4dElkID09PSB0ZXN0SWQpIHtcblx0XHRcdHRoaXMucGVlay5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJZiB0aGUgdGVzdCB3ZSdyZSBjdXJyZW50bHkgc2hvd2luZyBoYXMgaXRzIHN0YXRlIGNoYW5nZSB0byBzb21ldGhpbmdcblx0ICogZWxzZSwgdGhlbiBjbGVhciB0aGUgcGVlay5cblx0ICovXG5cdHByaXZhdGUgY2xvc2VQZWVrT25UZXN0Q2hhbmdlKGV2dDogVGVzdFJlc3VsdEl0ZW1DaGFuZ2UpIHtcblx0XHRpZiAoZXZ0LnJlYXNvbiAhPT0gVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2UgfHwgZXZ0LnByZXZpb3VzU3RhdGUgPT09IGV2dC5pdGVtLm93bkNvbXB1dGVkU3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbW92ZUlmUGVla2luZ0ZvclRlc3QoZXZ0Lml0ZW0uaXRlbS5leHRJZCk7XG5cdH1cblxuXHRwcml2YXRlIGNsb3NlUGVla09uQ2VydGFpblJlc3VsdEV2ZW50cyhldnQ6IFJlc3VsdENoYW5nZUV2ZW50KSB7XG5cdFx0aWYgKCdzdGFydGVkJyBpbiBldnQpIHtcblx0XHRcdHRoaXMucGVlay5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpOyAvLyBjbG9zZSBwZWVrIHdoZW4gcnVucyBzdGFydFxuXHRcdH1cblxuXHRcdGlmICgncmVtb3ZlZCcgaW4gZXZ0ICYmIHRoaXMudGVzdFJlc3VsdHMucmVzdWx0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMucGVlay5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpOyAvLyBjbG9zZSB0aGUgcGVlayBpZiByZXN1bHRzIGFyZSBjbGVhcmVkXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXRyaWV2ZVRlc3QodXJpOiBVUkkpOiBJbnNwZWN0U3ViamVjdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGFydHMgPSBwYXJzZVRlc3RVcmkodXJpKTtcblx0XHRpZiAoIXBhcnRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMudGVzdFJlc3VsdHMucmVzdWx0cy5maW5kKHIgPT4gci5pZCA9PT0gcGFydHMucmVzdWx0SWQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnRzLnR5cGUgPT09IFRlc3RVcmlUeXBlLlRhc2tPdXRwdXQpIHtcblx0XHRcdHJldHVybiBuZXcgVGFza1N1YmplY3QocmVzdWx0LCBwYXJ0cy50YXNrSW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJ0cy50eXBlID09PSBUZXN0VXJpVHlwZS5UZXN0T3V0cHV0KSB7XG5cdFx0XHRjb25zdCB0ZXN0ID0gcmVzdWx0LmdldFN0YXRlQnlJZChwYXJ0cy50ZXN0RXh0SWQpO1xuXHRcdFx0aWYgKCF0ZXN0KSB7IHJldHVybjsgfVxuXHRcdFx0cmV0dXJuIG5ldyBUZXN0T3V0cHV0U3ViamVjdChyZXN1bHQsIHBhcnRzLnRhc2tJbmRleCwgdGVzdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0ZXN0RXh0SWQsIHRhc2tJbmRleCwgbWVzc2FnZUluZGV4IH0gPSBwYXJ0cztcblx0XHRjb25zdCB0ZXN0ID0gcmVzdWx0Py5nZXRTdGF0ZUJ5SWQodGVzdEV4dElkKTtcblx0XHRpZiAoIXRlc3QgfHwgIXRlc3QudGFza3NbcGFydHMudGFza0luZGV4XSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTWVzc2FnZVN1YmplY3QocmVzdWx0LCB0ZXN0LCB0YXNrSW5kZXgsIG1lc3NhZ2VJbmRleCk7XG5cdH1cbn1cblxuXG5jbGFzcyBUZXN0UmVzdWx0c1BlZWsgZXh0ZW5kcyBQZWVrVmlld1dpZGdldCB7XG5cdHB1YmxpYyByZWFkb25seSBjdXJyZW50ID0gb2JzZXJ2YWJsZVZhbHVlPEluc3BlY3RTdWJqZWN0IHwgdW5kZWZpbmVkPigndGVzdFBlZWtDdXJyZW50JywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZXNpemVPbk5leHRDb250ZW50SGVpZ2h0VXBkYXRlID0gZmFsc2U7XG5cdHByaXZhdGUgY29udGVudCE6IFRlc3RSZXN1bHRzVmlld0NvbnRlbnQ7XG5cdHByaXZhdGUgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UhOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgZGltZW5zaW9uPzogZG9tLkRpbWVuc2lvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJUGVla1ZpZXdTZXJ2aWNlIHBlZWtWaWV3U2VydmljZTogSVBlZWtWaWV3U2VydmljZSxcblx0XHRASVRlc3RpbmdQZWVrT3BlbmVyIHByaXZhdGUgcmVhZG9ubHkgdGVzdGluZ1BlZWs6IElUZXN0aW5nUGVla09wZW5lcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IHNob3dGcmFtZTogdHJ1ZSwgZnJhbWVXaWR0aDogMSwgc2hvd0Fycm93OiB0cnVlLCBpc1Jlc2l6ZWFibGU6IHRydWUsIGlzQWNjZXNzaWJsZTogdHJ1ZSwgY2xhc3NOYW1lOiAndGVzdC1vdXRwdXQtcGVlaycgfSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhpcy5hcHBseVRoZW1lLCB0aGlzKSk7XG5cdFx0cGVla1ZpZXdTZXJ2aWNlLmFkZEV4Y2x1c2l2ZVdpZGdldChlZGl0b3IsIHRoaXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRNYXhpbXVtSGVpZ2h0SW5MaW5lcygpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRlZmF1bHRNYXhIZWlnaHQgPSBzdXBlci5fZ2V0TWF4aW11bUhlaWdodEluTGluZXMoKTtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5jb250ZW50Py5jb250ZW50SGVpZ2h0O1xuXHRcdGlmICghY29udGVudEhlaWdodCkgeyAvLyB1bmRlZmluZWQgb3IgMFxuXHRcdFx0cmV0dXJuIGRlZmF1bHRNYXhIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudGVzdGluZ1BlZWsuaGlzdG9yeVZpc2libGUudmFsdWUpIHsgLy8gZG9uJ3QgY2FwIGhlaWdodCB3aXRoIHRoZSBoaXN0b3J5IHNwbGl0XG5cdFx0XHRyZXR1cm4gZGVmYXVsdE1heEhlaWdodDtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHQvLyA0MSBpcyBleHBlcmltZW50YWxseSBkZXRlcm1pbmVkIHRvIGJlIHRoZSBvdmVyaGVhZCBvZiB0aGUgcGVlayB2aWV3IGl0c2VsZlxuXHRcdC8vIHRvIGF2b2lkIHNob3dpbmcgc2Nyb2xsYmFycyBieSBkZWZhdWx0IGluIGl0cyBjb250ZW50LlxuXHRcdGNvbnN0IGJhc2VQZWVrT3ZlcmhlYWQgPSA0MTtcblxuXHRcdHJldHVybiBNYXRoLm1pbihkZWZhdWx0TWF4SGVpZ2h0IHx8IEluZmluaXR5LCAoY29udGVudEhlaWdodCArIGJhc2VQZWVrT3ZlcmhlYWQpIC8gbGluZUhlaWdodCArIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVRoZW1lKCkge1xuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLmN1cnJlbnQuZ2V0KCk7XG5cdFx0Y29uc3QgaXNFcnJvciA9IGN1cnJlbnQgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCAmJiBjdXJyZW50Lm1lc3NhZ2UudHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yO1xuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gKGlzRXJyb3IgPyB0aGVtZS5nZXRDb2xvcih0ZXN0aW5nUGVla0JvcmRlcikgOiB0aGVtZS5nZXRDb2xvcih0ZXN0aW5nTWVzc2FnZVBlZWtCb3JkZXIpKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0XHRjb25zdCBoZWFkZXJCZyA9IChpc0Vycm9yID8gdGhlbWUuZ2V0Q29sb3IodGVzdGluZ1BlZWtIZWFkZXJCYWNrZ3JvdW5kKSA6IHRoZW1lLmdldENvbG9yKHRlc3RpbmdQZWVrTWVzc2FnZUhlYWRlckJhY2tncm91bmQpKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0XHRjb25zdCBlZGl0b3JCZyA9IHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0YXJyb3dDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRmcmFtZUNvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdGhlYWRlckJhY2tncm91bmRDb2xvcjogZWRpdG9yQmcgJiYgaGVhZGVyQmcgPyBoZWFkZXJCZy5tYWtlT3BhcXVlKGVkaXRvckJnKSA6IGhlYWRlckJnLFxuXHRcdFx0cHJpbWFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUZvcmVncm91bmQpLFxuXHRcdFx0c2Vjb25kYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlld1RpdGxlSW5mb0ZvcmVncm91bmQpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2ZpbGxDb250YWluZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc0luUGVlay5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdFx0dGhpcy5jb250ZW50ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UmVzdWx0c1ZpZXdDb250ZW50LCB0aGlzLmVkaXRvciwgeyBoaXN0b3J5VmlzaWJsZTogdGhpcy50ZXN0aW5nUGVlay5oaXN0b3J5VmlzaWJsZSwgc2hvd1JldmVhbExvY2F0aW9uT25NZXNzYWdlczogZmFsc2UsIGxvY2F0aW9uRm9yUHJvZ3Jlc3M6IFRlc3RpbmcuUmVzdWx0c1ZpZXdJZCB9KSk7XG5cblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRlbnQub25DbG9zZSgoKSA9PiB7XG5cdFx0XHRcdFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQodGhpcy5lZGl0b3IpPy5yZW1vdmVQZWVrKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0c3VwZXIuX2ZpbGxDb250YWluZXIoY29udGFpbmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlsbEhlYWQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLl9maWxsSGVhZChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgbWVudUNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5wZWVrSGFzU3RhY2ssXG5cdFx0XHRtZW51Q29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gaW5zcGVjdFN1YmplY3RIYXNTdGFjayh0aGlzLmN1cnJlbnQucmVhZChyZWFkZXIpKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLlRlc3RQZWVrVGl0bGUsIG1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGhpcy5fYWN0aW9uYmFyV2lkZ2V0ITtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRhY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucygpLCBhY3Rpb25zKTtcblx0XHRcdHdoaWxlIChhY3Rpb25CYXIuZ2V0QWN0aW9uKDEpKSB7XG5cdFx0XHRcdGFjdGlvbkJhci5wdWxsKDApOyAvLyByZW1vdmUgYWxsIGJ1dCB0aGUgdmlldydzIGRlZmF1bHQgXCJjbG9zZVwiIGJ1dHRvblxuXHRcdFx0fVxuXHRcdFx0YWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUsIGluZGV4OiAwIH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGZpbGxJbkFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKCksIGFjdGlvbnMpO1xuXHRcdGFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlLCBpbmRleDogMCB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlsbEJvZHkoY29udGFpbmVyRWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRlbnQuZmlsbEJvZHkoY29udGFpbmVyRWxlbWVudCk7XG5cblx0XHQvLyBSZXNpemUgb24gaGVpZ2h0IHVwZGF0ZXMgZm9yIGEgc2hvcnQgdGltZSB0byBhbGxvdyBhbnkgaGVpZ2h0cyBtYWRlXG5cdFx0Ly8gYnkgZWRpdG9yIGNvbnRyaWJ1dGlvbnMgdG8gY29tZSBpbnRvIGVmZmVjdCBiZWZvcmUuXG5cdFx0Y29uc3QgY29udGVudEhlaWdodFNldHRsZVRpbWVyID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMucmVzaXplT25OZXh0Q29udGVudEhlaWdodFVwZGF0ZSA9IGZhbHNlO1xuXHRcdH0sIDUwMCkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGVudC5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoaGVpZ2h0ID0+IHtcblx0XHRcdGlmICghdGhpcy5yZXNpemVPbk5leHRDb250ZW50SGVpZ2h0VXBkYXRlIHx8ICFoZWlnaHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXNwbGF5ZWQgPSB0aGlzLl9nZXRNYXhpbXVtSGVpZ2h0SW5MaW5lcygpO1xuXHRcdFx0aWYgKGRpc3BsYXllZCkge1xuXHRcdFx0XHR0aGlzLl9yZWxheW91dChNYXRoLm1pbihkaXNwbGF5ZWQsIHRoaXMuZ2V0VmlzaWJsZUVkaXRvckxpbmVzKCkgLyAyKSwgdHJ1ZSk7XG5cdFx0XHRcdGlmICghY29udGVudEhlaWdodFNldHRsZVRpbWVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0XHRjb250ZW50SGVpZ2h0U2V0dGxlVGltZXIuc2NoZWR1bGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRlbnQub25EaWRSZXF1ZXN0UmV2ZWFsKHN1YiA9PiB7XG5cdFx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KHRoaXMuZWRpdG9yKT8uc2hvdyhzdWIgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdFxuXHRcdFx0XHQ/IHN1Yi5tZXNzYWdlVXJpXG5cdFx0XHRcdDogc3ViLm91dHB1dFVyaSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHRlc3QgdG8gYmUgc2hvd24uXG5cdCAqL1xuXHRwdWJsaWMgc2V0TW9kZWwoc3ViamVjdDogSW5zcGVjdFN1YmplY3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIFRhc2tTdWJqZWN0IHx8IHN1YmplY3QgaW5zdGFuY2VvZiBUZXN0T3V0cHV0U3ViamVjdCkge1xuXHRcdFx0dGhpcy5jdXJyZW50LnNldChzdWJqZWN0LCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2hvd0luUGxhY2Uoc3ViamVjdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLmN1cnJlbnQ7XG5cdFx0Y29uc3QgcmV2ZWFsTG9jYXRpb24gPSBzdWJqZWN0LnJldmVhbExvY2F0aW9uPy5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0aWYgKCFyZXZlYWxMb2NhdGlvbiAmJiAhcHJldmlvdXMpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnQuc2V0KHN1YmplY3QsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFyZXZlYWxMb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2hvd0luUGxhY2Uoc3ViamVjdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXNpemVPbk5leHRDb250ZW50SGVpZ2h0VXBkYXRlID0gdHJ1ZTtcblx0XHR0aGlzLnNob3cocmV2ZWFsTG9jYXRpb24sIDEwKTsgLy8gMTAgaXMganVzdCBhIHJhbmRvbSBudW1iZXIsIHdlIHJlc2l6ZSBvbmNlIGNvbnRlbnQgaXMgYXZhaWxhYmxlXG5cdFx0dGhpcy5lZGl0b3IucmV2ZWFsUmFuZ2VOZWFyVG9wSWZPdXRzaWRlVmlld3BvcnQoUmFuZ2UuZnJvbVBvc2l0aW9ucyhyZXZlYWxMb2NhdGlvbiksIFNjcm9sbFR5cGUuU21vb3RoKTtcblxuXHRcdHJldHVybiB0aGlzLnNob3dJblBsYWNlKHN1YmplY3QpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbGxhcHNlcyBhbGwgZGlzcGxheWVkIHN0YWNrIGZyYW1lcy5cblx0ICovXG5cdHB1YmxpYyBjb2xsYXBzZVN0YWNrKCkge1xuXHRcdHRoaXMuY29udGVudC5jb2xsYXBzZVN0YWNrKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpc2libGVFZGl0b3JMaW5lcygpIHtcblx0XHQvLyBub3RlIHRoYXQgd2UgZG9uJ3QgdXNlIHRoZSB2aWV3IHJhbmdlcyBiZWNhdXNlIHdlIGRvbid0IHdhbnQgdG8gZ2V0XG5cdFx0Ly8gdGhyb3duIG9mZiBieSBsYXJnZSB3cmFwcGluZyBsaW5lcy4gQmVpbmcgYXBwcm94aW1hdGUgaGVyZSBpcyBva2F5LlxuXHRcdHJldHVybiBNYXRoLnJvdW5kKHRoaXMuZWRpdG9yLmdldERvbU5vZGUoKSEuY2xpZW50SGVpZ2h0IC8gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgYSBtZXNzYWdlIGluLXBsYWNlIHdpdGhvdXQgc2hvd2luZyBvciBjaGFuZ2luZyB0aGUgcGVlayBsb2NhdGlvbi5cblx0ICogVGhpcyBpcyBtb3N0bHkgdXNlZCBpZiBwZWVraW5nIGEgbWVzc2FnZSB3aXRob3V0IGEgbG9jYXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc2hvd0luUGxhY2Uoc3ViamVjdDogSW5zcGVjdFN1YmplY3QpIHtcblx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0KSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gc3ViamVjdC5tZXNzYWdlO1xuXHRcdFx0dGhpcy5zZXRUaXRsZShmaXJzdExpbmUocmVuZGVyVGVzdE1lc3NhZ2VBc1RleHQobWVzc2FnZS5tZXNzYWdlKSksIHN0cmlwSWNvbnMoc3ViamVjdC50ZXN0LmxhYmVsKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0VGl0bGUobG9jYWxpemUoJ3Rlc3RPdXRwdXRUaXRsZScsICdUZXN0IE91dHB1dCcpKTtcblx0XHR9XG5cdFx0dGhpcy5hcHBseVRoZW1lKCk7XG5cdFx0YXdhaXQgdGhpcy5jb250ZW50LnJldmVhbCh7IHN1YmplY3QsIHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXHR9XG5cblx0LyoqIEBvdmVycmlkZSAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RvTGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcikge1xuXHRcdHN1cGVyLl9kb0xheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5jb250ZW50Lm9uTGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdC8qKiBAb3ZlcnJpZGUgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoOiBudW1iZXIpIHtcblx0XHRzdXBlci5fb25XaWR0aCh3aWR0aCk7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmRpbWVuc2lvbiA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCB0aGlzLmRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGVudC5vbldpZHRoKHdpZHRoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlc3VsdHNWaWV3IGV4dGVuZHMgVmlld1BhbmUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnQgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSZXN1bHRzVmlld0NvbnRlbnQsIHVuZGVmaW5lZCwge1xuXHRcdGhpc3RvcnlWaXNpYmxlOiBzdGF0aWNPYnNlcnZhYmxlVmFsdWUodHJ1ZSksXG5cdFx0c2hvd1JldmVhbExvY2F0aW9uT25NZXNzYWdlczogdHJ1ZSxcblx0XHRsb2NhdGlvbkZvclByb2dyZXNzOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHR9KSkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdFNlcnZpY2U6IElUZXN0UmVzdWx0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN1YmplY3QoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGVudC5yYXdWYWx1ZT8uY3VycmVudDtcblx0fVxuXG5cdHB1YmxpYyBzaG93TGF0ZXN0UnVuKHByZXNlcnZlRm9jdXMgPSBmYWxzZSkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMucmVzdWx0U2VydmljZS5yZXN1bHRzLmZpbmQociA9PiByLnRhc2tzLmxlbmd0aCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRlbnQucmF3VmFsdWU/LnJldmVhbCh7IHByZXNlcnZlRm9jdXMsIHN1YmplY3Q6IG5ldyBUYXNrU3ViamVjdChyZXN1bHQsIDApIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHQvLyBBdm9pZCByZW5kZXJpbmcgaW50byB0aGUgYm9keSB1bnRpbCBpdCdzIGF0dGFjaGVkIHRoZSBET00sIGFzIGl0IGNhblxuXHRcdC8vIHJlc3VsdCBpbiByZW5kZXJpbmcgaXNzdWVzIGluIHRoZSB0ZXJtaW5hbCAoIzE5NDE1Nilcblx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMucmVuZGVyQ29udGVudChjb250YWluZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKEV2ZW50LmZpbHRlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHksIEJvb2xlYW4pKSgoKSA9PiB0aGlzLnJlbmRlckNvbnRlbnQoY29udGFpbmVyKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLmNvbnRlbnQucmF3VmFsdWU/Lm9uTGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29udGVudChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMuY29udGVudC52YWx1ZTtcblx0XHRjb250ZW50LmZpbGxCb2R5KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGVudC5vbkRpZFJlcXVlc3RSZXZlYWwoc3ViamVjdCA9PiBjb250ZW50LnJldmVhbCh7IHByZXNlcnZlRm9jdXM6IHRydWUsIHN1YmplY3QgfSkpKTtcblxuXHRcdGNvbnN0IFtsYXN0UmVzdWx0XSA9IHRoaXMucmVzdWx0U2VydmljZS5yZXN1bHRzO1xuXHRcdGlmIChsYXN0UmVzdWx0ICYmIGxhc3RSZXN1bHQudGFza3MubGVuZ3RoKSB7XG5cdFx0XHRjb250ZW50LnJldmVhbCh7IHByZXNlcnZlRm9jdXM6IHRydWUsIHN1YmplY3Q6IG5ldyBUYXNrU3ViamVjdChsYXN0UmVzdWx0LCAwKSB9KTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgZmlyc3RMaW5lID0gKHN0cjogc3RyaW5nKSA9PiB7XG5cdGNvbnN0IGluZGV4ID0gc3RyLmluZGV4T2YoJ1xcbicpO1xuXHRyZXR1cm4gaW5kZXggPT09IC0xID8gc3RyIDogc3RyLnNsaWNlKDAsIGluZGV4KTtcbn07XG5cbmZ1bmN0aW9uIGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSk6IElDb2RlRWRpdG9yIHwgbnVsbCB7XG5cdGNvbnN0IGRpZmZFZGl0b3JzID0gY29kZUVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKCk7XG5cblx0Zm9yIChjb25zdCBkaWZmRWRpdG9yIG9mIGRpZmZFZGl0b3JzKSB7XG5cdFx0aWYgKGRpZmZFZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgZGlmZkVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldCkge1xuXHRcdFx0cmV0dXJuIGRpZmZFZGl0b3IuZ2V0UGFyZW50RWRpdG9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjbGFzcyBDbG9zZVRlc3RQZWVrIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmNsb3NlVGVzdFBlZWsnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2UnLCAnQ2xvc2UnKSxcblx0XHRcdGljb246IENvZGljb24uY2xvc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFRlc3RpbmdDb250ZXh0S2V5cy5pc0luUGVlaywgVGVzdGluZ0NvbnRleHRLZXlzLmlzUGVla1Zpc2libGUpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiAtIDEwMSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm5vdCgnY29uZmlnLmVkaXRvci5zdGFibGVQZWVrJylcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBwYXJlbnQgPSBnZXRQZWVrZWRFZGl0b3JGcm9tRm9jdXMoYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkpO1xuXHRcdFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQocGFyZW50ID8/IGVkaXRvcik/LnJlbW92ZVBlZWsoKTtcblx0fVxufVxuXG5cbmNvbnN0IG5hdldoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRUZXN0aW5nQ29udGV4dEtleXMuaXNQZWVrVmlzaWJsZSxcbik7XG5cbi8qKlxuICogR2V0cyB0aGUgYXBwcm9wcmlhdGUgZWRpdG9yIGZvciBwZWVraW5nIGJhc2VkIG9uIHRoZSBjdXJyZW50bHkgZm9jdXNlZCBlZGl0b3IuXG4gKi9cbmNvbnN0IGdldFBlZWtlZEVkaXRvckZyb21Gb2N1cyA9IChjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlKSA9PiB7XG5cdGNvbnN0IGVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkgfHwgY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRyZXR1cm4gZWRpdG9yICYmIGdldFBlZWtlZEVkaXRvcihjb2RlRWRpdG9yU2VydmljZSwgZWRpdG9yKTtcbn07XG5cbi8qKlxuICogR2V0cyB0aGUgZWRpdG9yIHdoZXJlIHRoZSBwZWVrIG1heSBiZSBzaG93biwgYnViYmxpbmcgdXB3YXJkcyBpZiB0aGUgZ2l2ZW5cbiAqIGVkaXRvciBpcyBlbWJlZGRlZCAoaS5lLiBpbnNpZGUgYSBwZWVrIGFscmVhZHkpLlxuICovXG5jb25zdCBnZXRQZWVrZWRFZGl0b3IgPSAoY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSwgZWRpdG9yOiBJQ29kZUVkaXRvcikgPT4ge1xuXHRpZiAoVGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpPy5zdWJqZWN0LmdldCgpKSB7XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldFBhcmVudEVkaXRvcigpO1xuXHR9XG5cblx0Y29uc3Qgb3V0ZXIgPSBnZXRPdXRlckVkaXRvckZyb21EaWZmRWRpdG9yKGNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0aWYgKG91dGVyKSB7XG5cdFx0cmV0dXJuIG91dGVyO1xuXHR9XG5cblx0cmV0dXJuIGVkaXRvcjtcbn07XG5cbmV4cG9ydCBjbGFzcyBHb1RvTmV4dE1lc3NhZ2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0aW5nLmdvVG9OZXh0TWVzc2FnZSc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHb1RvTmV4dE1lc3NhZ2VBY3Rpb24uSUQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub05leHRNZXNzYWdlJywgJ0dvIHRvIE5leHQgVGVzdCBGYWlsdXJlJyksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9OZXh0TWVzc2FnZS5kZXNjcmlwdGlvbicsICdTaG93cyB0aGUgbmV4dCBmYWlsdXJlIG1lc3NhZ2UgaW4geW91ciBmaWxlJylcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93RG93bixcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY4LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDEsXG5cdFx0XHRcdHdoZW46IG5hdldoZW4sXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0UGVla1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogbmF2V2hlblxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0UGVla2VkRWRpdG9yRnJvbUZvY3VzKGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpKTtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik/Lm5leHQoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdvVG9QcmV2aW91c01lc3NhZ2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0aW5nLmdvVG9QcmV2aW91c01lc3NhZ2UnO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR29Ub1ByZXZpb3VzTWVzc2FnZUFjdGlvbi5JRCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5nb1RvUHJldmlvdXNNZXNzYWdlJywgJ0dvIHRvIFByZXZpb3VzIFRlc3QgRmFpbHVyZScpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy5nb1RvUHJldmlvdXNNZXNzYWdlLmRlc2NyaXB0aW9uJywgJ1Nob3dzIHRoZSBwcmV2aW91cyBmYWlsdXJlIG1lc3NhZ2UgaW4geW91ciBmaWxlJylcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93VXAsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GOCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBuYXZXaGVuXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0UGVla1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogbmF2V2hlblxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0UGVla2VkRWRpdG9yRnJvbUZvY3VzKGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpKTtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnByZXZpb3VzKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xsYXBzZVBlZWtTdGFjayBleHRlbmRzIEFjdGlvbjIge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3Rlc3RpbmcuY29sbGFwc2VQZWVrU3RhY2snO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29sbGFwc2VQZWVrU3RhY2suSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNvbGxhcHNlUGVla1N0YWNrJywgJ0NvbGxhcHNlIFN0YWNrIEZyYW1lcycpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RQZWVrVGl0bGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5wZWVrSGFzU3RhY2ssXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0UGVla2VkRWRpdG9yRnJvbUZvY3VzKGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpKTtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LmNvbGxhcHNlU3RhY2soKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5NZXNzYWdlSW5FZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0aW5nLm9wZW5NZXNzYWdlSW5FZGl0b3InO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3Blbk1lc3NhZ2VJbkVkaXRvckFjdGlvbi5JRCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcub3Blbk1lc3NhZ2VJbkVkaXRvcicsICdPcGVuIGluIEVkaXRvcicpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nb1RvRmlsZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHRtZW51OiBbeyBpZDogTWVudUlkLlRlc3RQZWVrVGl0bGUgfV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElUZXN0aW5nUGVla09wZW5lcikub3BlbkN1cnJlbnRJbkVkaXRvcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVUZXN0aW5nUGVla0hpc3RvcnkgZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0aW5nLnRvZ2dsZVRlc3RpbmdQZWVrSGlzdG9yeSc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVUZXN0aW5nUGVla0hpc3RvcnkuSUQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcudG9nZ2xlVGVzdGluZ1BlZWtIaXN0b3J5JywgJ1RvZ2dsZSBUZXN0IEhpc3RvcnkgaW4gUGVlaycpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVUZXN0aW5nUGVla0hpc3RvcnkuZGVzY3JpcHRpb24nLCAnU2hvd3Mgb3IgaGlkZXMgdGhlIGhpc3Rvcnkgb2YgdGVzdCBydW5zIGluIHRoZSBwZWVrIHZpZXcnKVxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24uaGlzdG9yeSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RQZWVrVGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0fV0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlILFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaXNQZWVrVmlzaWJsZS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IG9wZW5lciA9IGFjY2Vzc29yLmdldChJVGVzdGluZ1BlZWtPcGVuZXIpO1xuXHRcdG9wZW5lci5oaXN0b3J5VmlzaWJsZS52YWx1ZSA9ICFvcGVuZXIuaGlzdG9yeVZpc2libGUudmFsdWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUV0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLDJCQUEyQix1QkFBdUI7QUFFcEUsU0FBc0Isb0JBQW9CO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsYUFBYTtBQUN0QixTQUF1QyxrQkFBa0I7QUFDekQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0IsZ0JBQWdCLHlCQUF5QixtQ0FBbUM7QUFDdkcsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFNBQVMsY0FBYyxjQUFjO0FBQzlDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQTZCLDBCQUEwQjtB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SSxVQUE0QjtBQUMvQyxVQUFNLFNBQVMseUJBQXlCLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQztBQUN4RSxRQUFJLFFBQVE7QUFDWCxrQ0FBNEIsSUFBSSxNQUFNLEdBQUcsY0FBYztBQUFBLElBQ3hEO0FBQUEsRUFDRDtBQUNEO0FBdkJhLG1CQUNXLEtBQUs7QUFEdEIsSUFBTSxvQkFBTjtBQXlCQSxNQUFNLDZCQUFOLE1BQU0sbUNBQWtDLFFBQVE7QUFBQSxFQUV0RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSwyQkFBMEI7QUFBQSxNQUM5QixJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsK0JBQStCLGdCQUFnQjtBQUFBLE1BQ2hFLE1BQU0sUUFBUTtBQUFBLE1BQ2QsVUFBVSxXQUFXO0FBQUEsTUFDckIsTUFBTSxDQUFDLEVBQUUsSUFBSSxPQUFPLGNBQWMsQ0FBQztBQUFBLElBQ3BDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFZ0IsSUFBSSxVQUE0QjtBQUMvQyxhQUFTLElBQUksa0JBQWtCLEVBQUUsb0JBQW9CO0FBQUEsRUFDdEQ7QUFDRDtBQWhCYSwyQkFDVyxLQUFLO0FBRHRCLElBQU0sNEJBQU47QUFrQkEsTUFBTSw0QkFBTixNQUFNLGtDQUFpQyxRQUFRO0FBQUEsRUFFckQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksMEJBQXlCO0FBQUEsTUFDN0IsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLG9DQUFvQyw2QkFBNkI7QUFBQSxNQUNsRixVQUFVO0FBQUEsUUFDVCxhQUFhLFVBQVUsZ0RBQWdELDBEQUEwRDtBQUFBLE1BQ2xJO0FBQUEsTUFDQSxNQUFNLFFBQVE7QUFBQSxNQUNkLFVBQVUsV0FBVztBQUFBLE1BQ3JCLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsTUFDRCxZQUFZO0FBQUEsUUFDWCxRQUFRLGlCQUFpQjtBQUFBLFFBQ3pCLFNBQVMsT0FBTyxNQUFNLFFBQVE7QUFBQSxRQUM5QixNQUFNLG1CQUFtQixjQUFjLFVBQVUsSUFBSTtBQUFBLE1BQ3REO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRWdCLElBQUksVUFBNEI7QUFDL0MsVUFBTSxTQUFTLFNBQVMsSUFBSSxrQkFBa0I7QUFDOUMsV0FBTyxlQUFlLFFBQVEsQ0FBQyxPQUFPLGVBQWU7QUFBQSxFQUN0RDtBQUNEO0FBN0JhLDBCQUNXLEtBQUs7QUFEdEIsSUFBTSwyQkFBTjsiLAogICJuYW1lcyI6IFsidGVzdCJdCn0K
