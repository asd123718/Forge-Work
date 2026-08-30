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
import * as dom from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Orientation, Sizing, SplitView } from "../../../../../base/browser/ui/splitview/splitview.js";
import { findAsync } from "../../../../../base/common/arrays.js";
import { Limiter } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event, Relay } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { FloatingClickMenu } from "../../../../../platform/actions/browser/floatingMenu.js";
import { createActionViewItem } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { CallStackFrame, CallStackWidget, CustomStackFrame } from "../../../debug/browser/callStackWidget.js";
import { TestCommandId } from "../../common/constants.js";
import { getTestingConfiguration, TestingConfigKeys, TestingResultsViewLayout } from "../../common/configuration.js";
import { capabilityContextKeys, ITestProfileService } from "../../common/testProfileService.js";
import { LiveTestResult } from "../../common/testResult.js";
import { ITestService } from "../../common/testService.js";
import { TestRunProfileBitset } from "../../common/testTypes.js";
import { TestingContextKeys } from "../../common/testingContextKeys.js";
import * as icons from "../icons.js";
import { DiffContentProvider, MarkdownTestMessagePeek, PlainTextMessagePeek, TerminalMessagePeek } from "./testResultsOutput.js";
import { equalsSubject, getSubjectTestItem, MessageSubject, TaskSubject, TestOutputSubject } from "./testResultsSubject.js";
import { OutputPeekTree } from "./testResultsTree.js";
import "./testResultsViewContent.css";
let MessageStackFrame = class extends CustomStackFrame {
  constructor(message, followup, subject, instantiationService, contextKeyService, profileService) {
    super();
    this.message = message;
    this.followup = followup;
    this.subject = subject;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.profileService = profileService;
    this.height = observableValue("MessageStackFrame.height", 100);
    this.icon = icons.testingViewIcon;
    this.label = subject instanceof MessageSubject ? subject.test.label : subject instanceof TestOutputSubject ? subject.test.item.label : subject.result.name;
  }
  render(container) {
    this.message.style.visibility = "visible";
    container.appendChild(this.message);
    return toDisposable(() => this.message.remove());
  }
  renderActions(container) {
    const store = new DisposableStore();
    container.appendChild(this.followup.domNode);
    store.add(toDisposable(() => this.followup.domNode.remove()));
    const test = getSubjectTestItem(this.subject);
    const capabilities = test && this.profileService.capabilitiesForTest(test);
    let contextKeyService;
    if (capabilities) {
      contextKeyService = this.contextKeyService.createOverlay(capabilityContextKeys(capabilities));
    } else {
      const profiles = this.profileService.getControllerProfiles(this.subject.controllerId);
      contextKeyService = this.contextKeyService.createOverlay([
        [TestingContextKeys.hasRunnableTests.key, profiles.some((p) => p.group & TestRunProfileBitset.Run)],
        [TestingContextKeys.hasDebuggableTests.key, profiles.some((p) => p.group & TestRunProfileBitset.Debug)]
      ]);
    }
    const instaService = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = store.add(instaService.createInstance(MenuWorkbenchToolBar, container, MenuId.TestCallStack, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options)
    }));
    toolbar.context = this.subject;
    store.add(toolbar);
    return store;
  }
};
MessageStackFrame = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, ITestProfileService)
], MessageStackFrame);
function runInLast(accessor, bitset, subject) {
  if (subject instanceof TaskSubject) {
    return accessor.get(ICommandService).executeCommand(
      bitset === TestRunProfileBitset.Debug ? TestCommandId.DebugLastRun : TestCommandId.ReRunLastRun,
      subject.result.id
    );
  }
  const testService = accessor.get(ITestService);
  const plainTest = subject instanceof MessageSubject ? subject.test : subject.test.item;
  const currentTest = testService.collection.getNodeById(plainTest.extId);
  if (!currentTest) {
    return;
  }
  return testService.runTests({
    group: bitset,
    tests: [currentTest]
  });
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "testing.callStack.run",
      title: localize("testing.callStack.run", "Rerun Test"),
      icon: icons.testingRunIcon,
      menu: {
        id: MenuId.TestCallStack,
        when: TestingContextKeys.hasRunnableTests,
        group: "navigation"
      }
    });
  }
  run(accessor, subject) {
    runInLast(accessor, TestRunProfileBitset.Run, subject);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "testing.callStack.debug",
      title: localize("testing.callStack.debug", "Debug Test"),
      icon: icons.testingDebugIcon,
      menu: {
        id: MenuId.TestCallStack,
        when: TestingContextKeys.hasDebuggableTests,
        group: "navigation"
      }
    });
  }
  run(accessor, subject) {
    runInLast(accessor, TestRunProfileBitset.Debug, subject);
  }
});
let TestResultsViewContent = class extends Disposable {
  constructor(editor, options, instantiationService, modelService, contextKeyService, uriIdentityService, configurationService) {
    super();
    this.editor = editor;
    this.options = options;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.contextKeyService = contextKeyService;
    this.uriIdentityService = uriIdentityService;
    this.configurationService = configurationService;
    this.didReveal = this._register(new Emitter());
    this.currentSubjectStore = this._register(new DisposableStore());
    this.onCloseEmitter = this._register(new Relay());
    this.contentProvidersUpdateLimiter = this._register(new Limiter(1));
    this.isTreeLeft = false;
    this.onClose = this.onCloseEmitter.event;
  }
  get uiState() {
    return {
      splitViewWidths: Array.from(
        { length: this.splitView.length },
        (_, i) => this.splitView.getViewSize(i)
      )
    };
  }
  get onDidChangeContentHeight() {
    return this.callStackWidget.onDidChangeContentHeight;
  }
  get contentHeight() {
    return this.callStackWidget?.contentHeight || 0;
  }
  get diffViewIndex() {
    return this.isTreeLeft ? 1 : 0;
  }
  get historyViewIndex() {
    return this.isTreeLeft ? 0 : 1;
  }
  swapViews() {
    const leftSize = this.splitView.getViewSize(0);
    const rightSize = this.splitView.getViewSize(1);
    const leftView = this.splitView.removeView(1);
    const rightView = this.splitView.removeView(0);
    this.splitView.addView(leftView, rightSize);
    this.splitView.addView(rightView, leftSize);
  }
  fillBody(containerElement) {
    const initialSpitWidth = TestResultsViewContent.lastSplitWidth;
    this.splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });
    const { historyVisible, showRevealLocationOnMessages } = this.options;
    const isInPeekView = this.editor !== void 0;
    const layout = getTestingConfiguration(this.configurationService, TestingConfigKeys.ResultsViewLayout);
    this.isTreeLeft = layout === TestingResultsViewLayout.TreeLeft;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.ResultsViewLayout)) {
        const newLayout = getTestingConfiguration(this.configurationService, TestingConfigKeys.ResultsViewLayout);
        const newIsTreeLeft = newLayout === TestingResultsViewLayout.TreeLeft;
        if (newIsTreeLeft !== this.isTreeLeft) {
          this.isTreeLeft = newIsTreeLeft;
          this.swapViews();
        }
      }
    }));
    const messageContainer = this.messageContainer = dom.$(".test-output-peek-message-container");
    this.stackContainer = dom.append(containerElement, dom.$(".test-output-call-stack-container"));
    this.callStackWidget = this._register(this.instantiationService.createInstance(CallStackWidget, this.stackContainer, this.editor));
    this.followupWidget = this._register(this.instantiationService.createInstance(FollowupActionWidget, this.editor));
    this.onCloseEmitter.input = this.followupWidget.onClose;
    this.contentProviders = [
      this._register(this.instantiationService.createInstance(DiffContentProvider, this.editor, messageContainer)),
      this._register(this.instantiationService.createInstance(MarkdownTestMessagePeek, messageContainer)),
      this._register(this.instantiationService.createInstance(TerminalMessagePeek, messageContainer, isInPeekView)),
      this._register(this.instantiationService.createInstance(PlainTextMessagePeek, this.editor, messageContainer))
    ];
    this.messageContextKeyService = this._register(this.contextKeyService.createScoped(containerElement));
    this.contextKeyTestMessage = TestingContextKeys.testMessageContext.bindTo(this.messageContextKeyService);
    this.contextKeyResultOutdated = TestingContextKeys.testResultOutdated.bindTo(this.messageContextKeyService);
    const treeContainer = dom.append(containerElement, dom.$(".test-output-peek-tree.testing-stdtree"));
    const tree = this._register(this.instantiationService.createInstance(
      OutputPeekTree,
      treeContainer,
      this.didReveal.event,
      { showRevealLocationOnMessages, locationForProgress: this.options.locationForProgress }
    ));
    this.onDidRequestReveal = tree.onDidRequestReview;
    const stackView = {
      onDidChange: Event.None,
      element: this.stackContainer,
      minimumSize: 200,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        TestResultsViewContent.lastSplitWidth = width;
        if (this.dimension) {
          this.callStackWidget?.layout(this.dimension.height, width);
          this.layoutContentWidgets(this.dimension, width);
        }
      }
    };
    const treeView = {
      onDidChange: Event.None,
      element: treeContainer,
      minimumSize: 100,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        if (this.dimension) {
          tree.layout(this.dimension.height, width);
        }
      }
    };
    this.splitView.addView(stackView, Sizing.Distribute);
    this.splitView.addView(treeView, Sizing.Distribute);
    if (this.isTreeLeft) {
      this.swapViews();
    }
    this.splitView.setViewVisible(this.historyViewIndex, historyVisible.value);
    this._register(historyVisible.onDidChange((visible) => {
      this.splitView.setViewVisible(this.historyViewIndex, visible);
    }));
    if (initialSpitWidth) {
      queueMicrotask(() => this.splitView.resizeView(this.diffViewIndex, initialSpitWidth));
    }
  }
  /**
   * Shows a message in-place without showing or changing the peek location.
   * This is mostly used if peeking a message without a location.
   */
  reveal(opts) {
    this.didReveal.fire(opts);
    if (this.current && equalsSubject(this.current, opts.subject)) {
      return Promise.resolve();
    }
    this.current = opts.subject;
    return this.contentProvidersUpdateLimiter.queue(async () => {
      this.currentSubjectStore.clear();
      const callFrames = this.getCallFrames(opts.subject) || [];
      const topFrame = await this.prepareTopFrame(opts.subject, callFrames);
      this.setCallStackFrames(topFrame, callFrames);
      this.followupWidget.show(opts.subject);
      this.populateFloatingClick(opts.subject);
    });
  }
  setCallStackFrames(messageFrame, stack) {
    this.callStackWidget.setFrames([messageFrame, ...stack.map((frame) => new CallStackFrame(
      frame.label,
      frame.uri,
      frame.position?.lineNumber,
      frame.position?.column
    ))]);
  }
  /**
   * Collapses all displayed stack frames.
   */
  collapseStack() {
    this.callStackWidget.collapseAll();
  }
  getCallFrames(subject) {
    if (!(subject instanceof MessageSubject)) {
      return void 0;
    }
    const frames = subject.stack;
    if (!frames?.length || !this.editor) {
      return frames;
    }
    const topFrame = frames[0];
    const peekLocation = subject.revealLocation;
    const isTopFrameSame = peekLocation && topFrame.position && topFrame.uri && topFrame.position.lineNumber === peekLocation.range.startLineNumber && topFrame.position.column === peekLocation.range.startColumn && this.uriIdentityService.extUri.isEqual(topFrame.uri, peekLocation.uri);
    return isTopFrameSame ? frames.slice(1) : frames;
  }
  async prepareTopFrame(subject, callFrames) {
    this.messageContainer.style.visibility = "hidden";
    this.stackContainer.appendChild(this.messageContainer);
    const topFrame = this.currentTopFrame = this.instantiationService.createInstance(MessageStackFrame, this.messageContainer, this.followupWidget, subject);
    const hasMultipleFrames = callFrames.length > 0;
    topFrame.showHeader.set(hasMultipleFrames, void 0);
    const provider = await findAsync(this.contentProviders, (p) => p.update(subject));
    if (provider) {
      const width = this.splitView.getViewSize(this.diffViewIndex);
      if (width !== -1 && this.dimension) {
        topFrame.height.set(provider.layout({ width, height: this.dimension?.height }, hasMultipleFrames), void 0);
      }
      if (provider.onScrolled) {
        this.currentSubjectStore.add(this.callStackWidget.onDidScroll((evt) => {
          provider.onScrolled(evt);
        }));
      }
      if (provider.onDidContentSizeChange) {
        this.currentSubjectStore.add(provider.onDidContentSizeChange(() => {
          const width2 = this.splitView.getViewSize(this.diffViewIndex);
          if (this.dimension && !this.isDoingLayoutUpdate && width2 !== -1) {
            this.isDoingLayoutUpdate = true;
            topFrame.height.set(provider.layout({ width: width2, height: this.dimension.height }, hasMultipleFrames), void 0);
            this.isDoingLayoutUpdate = false;
          }
        }));
      }
    }
    return topFrame;
  }
  layoutContentWidgets(dimension, width = this.splitView.getViewSize(this.diffViewIndex)) {
    this.isDoingLayoutUpdate = true;
    for (const provider of this.contentProviders) {
      const frameHeight = provider.layout({ height: dimension.height, width }, !!this.currentTopFrame?.showHeader.get());
      if (frameHeight) {
        this.currentTopFrame?.height.set(frameHeight, void 0);
      }
    }
    this.isDoingLayoutUpdate = false;
  }
  populateFloatingClick(subject) {
    if (!(subject instanceof MessageSubject)) {
      return;
    }
    this.currentSubjectStore.add(toDisposable(() => {
      this.contextKeyResultOutdated.reset();
      this.contextKeyTestMessage.reset();
    }));
    this.contextKeyTestMessage.set(subject.contextValue || "");
    if (subject.result instanceof LiveTestResult) {
      this.contextKeyResultOutdated.set(subject.result.getStateById(subject.test.extId)?.retired ?? false);
      this.currentSubjectStore.add(subject.result.onChange((ev) => {
        if (ev.item.item.extId === subject.test.extId) {
          this.contextKeyResultOutdated.set(ev.item.retired ?? false);
        }
      }));
    } else {
      this.contextKeyResultOutdated.set(true);
    }
    const instaService = this.currentSubjectStore.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.messageContextKeyService])));
    this.currentSubjectStore.add(instaService.createInstance(FloatingClickMenu, {
      container: this.messageContainer,
      menuId: MenuId.TestMessageContent,
      getActionArg: () => subject.context
    }));
  }
  onLayoutBody(height, width) {
    this.dimension = new dom.Dimension(width, height);
    this.splitView.layout(width);
  }
  onWidth(width) {
    this.splitView.layout(width);
  }
};
TestResultsViewContent = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IConfigurationService)
], TestResultsViewContent);
const FOLLOWUP_ANIMATION_MIN_TIME = 500;
let FollowupActionWidget = class extends Disposable {
  constructor(editor, testService, quickInput) {
    super();
    this.editor = editor;
    this.testService = testService;
    this.quickInput = quickInput;
    this.el = dom.h("div.testing-followup-action", []);
    this.visibleStore = this._register(new DisposableStore());
    this.onCloseEmitter = this._register(new Emitter());
    this.onClose = this.onCloseEmitter.event;
  }
  get domNode() {
    return this.el.root;
  }
  show(subject) {
    this.visibleStore.clear();
    if (subject instanceof MessageSubject) {
      this.showMessage(subject);
    }
  }
  async showMessage(subject) {
    const cts = this.visibleStore.add(new CancellationTokenSource());
    const start = Date.now();
    if (subject.result instanceof LiveTestResult && !subject.result.completedAt) {
      await new Promise((r) => Event.once(subject.result.onComplete)(r));
    }
    const followups = await this.testService.provideTestFollowups({
      extId: subject.test.extId,
      messageIndex: subject.messageIndex,
      resultId: subject.result.id,
      taskIndex: subject.taskIndex
    }, cts.token);
    if (!followups.followups.length || cts.token.isCancellationRequested) {
      followups.dispose();
      return;
    }
    this.visibleStore.add(followups);
    dom.clearNode(this.el.root);
    this.el.root.classList.toggle("animated", Date.now() - start > FOLLOWUP_ANIMATION_MIN_TIME);
    this.el.root.appendChild(this.makeFollowupLink(followups.followups[0]));
    if (followups.followups.length > 1) {
      this.el.root.appendChild(this.makeMoreLink(followups.followups));
    }
    this.visibleStore.add(toDisposable(() => {
      this.el.root.remove();
    }));
  }
  makeFollowupLink(first) {
    const link = this.makeLink(() => this.actionFollowup(link, first));
    dom.reset(link, ...renderLabelWithIcons(first.message));
    return link;
  }
  makeMoreLink(followups) {
    const link = this.makeLink(
      () => this.quickInput.pick(followups.map((f, i) => ({
        label: f.message,
        index: i
      }))).then((picked) => {
        if (picked?.length) {
          followups[picked[0].index].execute();
        }
      })
    );
    link.innerText = localize("testFollowup.more", "+{0} More...", followups.length - 1);
    return link;
  }
  makeLink(onClick) {
    const link = document.createElement("a");
    link.tabIndex = 0;
    this.visibleStore.add(dom.addDisposableListener(link, "click", onClick));
    this.visibleStore.add(dom.addDisposableListener(link, "keydown", (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
        onClick();
      }
    }));
    return link;
  }
  actionFollowup(link, fu) {
    if (link.ariaDisabled !== "true") {
      link.ariaDisabled = "true";
      fu.execute();
      if (this.editor) {
        this.onCloseEmitter.fire();
      }
    }
  }
};
FollowupActionWidget = __decorateClass([
  __decorateParam(1, ITestService),
  __decorateParam(2, IQuickInputService)
], FollowupActionWidget);
export {
  TestResultsViewContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RSZXN1bHRzVmlld1xcdGVzdFJlc3VsdHNWaWV3Q29udGVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uLCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IGZpbmRBc3luYyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBMaW1pdGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFJlbGF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEZsb2F0aW5nQ2xpY2tNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2Zsb2F0aW5nTWVudS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEFueVN0YWNrRnJhbWUsIENhbGxTdGFja0ZyYW1lLCBDYWxsU3RhY2tXaWRnZXQsIEN1c3RvbVN0YWNrRnJhbWUgfSBmcm9tICcuLi8uLi8uLi9kZWJ1Zy9icm93c2VyL2NhbGxTdGFja1dpZGdldC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbiwgVGVzdGluZ0NvbmZpZ0tleXMsIFRlc3RpbmdSZXN1bHRzVmlld0xheW91dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi9jb21tb24vb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IGNhcGFiaWxpdHlDb250ZXh0S2V5cywgSVRlc3RQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGl2ZVRlc3RSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdEZvbGxvd3VwLCBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RNZXNzYWdlU3RhY2tGcmFtZSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RpbmdDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0aW5nQ29udGV4dEtleXMuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi4vaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlmZkNvbnRlbnRQcm92aWRlciwgSVBlZWtPdXRwdXRSZW5kZXJlciwgTWFya2Rvd25UZXN0TWVzc2FnZVBlZWssIFBsYWluVGV4dE1lc3NhZ2VQZWVrLCBUZXJtaW5hbE1lc3NhZ2VQZWVrIH0gZnJvbSAnLi90ZXN0UmVzdWx0c091dHB1dC5qcyc7XG5pbXBvcnQgeyBlcXVhbHNTdWJqZWN0LCBnZXRTdWJqZWN0VGVzdEl0ZW0sIEluc3BlY3RTdWJqZWN0LCBNZXNzYWdlU3ViamVjdCwgVGFza1N1YmplY3QsIFRlc3RPdXRwdXRTdWJqZWN0IH0gZnJvbSAnLi90ZXN0UmVzdWx0c1N1YmplY3QuanMnO1xuaW1wb3J0IHsgT3V0cHV0UGVla1RyZWUgfSBmcm9tICcuL3Rlc3RSZXN1bHRzVHJlZS5qcyc7XG5pbXBvcnQgJy4vdGVzdFJlc3VsdHNWaWV3Q29udGVudC5jc3MnO1xuXG4vKiogVUkgc3RhdGUgdGhhdCBjYW4gYmUgc2F2ZWQvcmVzdG9yZWQsIHVzZWQgdG8gZ2l2ZSBhIG5pY2UgZXhwZXJpZW5jZSB3aGVuIHN3aXRjaGluZyBzdGFjayBmcmFtZXMgKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RSZXN1bHRzVmlld0NvbnRlbnRVaVN0YXRlIHtcblx0c3BsaXRWaWV3V2lkdGhzOiBudW1iZXJbXTtcbn1cblxuY2xhc3MgTWVzc2FnZVN0YWNrRnJhbWUgZXh0ZW5kcyBDdXN0b21TdGFja0ZyYW1lIHtcblx0cHVibGljIG92ZXJyaWRlIGhlaWdodCA9IG9ic2VydmFibGVWYWx1ZSgnTWVzc2FnZVN0YWNrRnJhbWUuaGVpZ2h0JywgMTAwKTtcblx0cHVibGljIG92ZXJyaWRlIGxhYmVsOiBzdHJpbmc7XG5cdHB1YmxpYyBvdmVycmlkZSBpY29uID0gaWNvbnMudGVzdGluZ1ZpZXdJY29uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZTogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmb2xsb3d1cDogRm9sbG93dXBBY3Rpb25XaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdWJqZWN0OiBJbnNwZWN0U3ViamVjdCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVTZXJ2aWNlOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5sYWJlbCA9IHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdFxuXHRcdFx0PyBzdWJqZWN0LnRlc3QubGFiZWxcblx0XHRcdDogc3ViamVjdCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0XG5cdFx0XHRcdD8gc3ViamVjdC50ZXN0Lml0ZW0ubGFiZWxcblx0XHRcdFx0OiBzdWJqZWN0LnJlc3VsdC5uYW1lO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMubWVzc2FnZS5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm1lc3NhZ2UpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5tZXNzYWdlLnJlbW92ZSgpKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSByZW5kZXJBY3Rpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5mb2xsb3d1cC5kb21Ob2RlKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuZm9sbG93dXAuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgdGVzdCA9IGdldFN1YmplY3RUZXN0SXRlbSh0aGlzLnN1YmplY3QpO1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHRlc3QgJiYgdGhpcy5wcm9maWxlU2VydmljZS5jYXBhYmlsaXRpZXNGb3JUZXN0KHRlc3QpO1xuXHRcdGxldCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdGlmIChjYXBhYmlsaXRpZXMpIHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGNhcGFiaWxpdHlDb250ZXh0S2V5cyhjYXBhYmlsaXRpZXMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcHJvZmlsZXMgPSB0aGlzLnByb2ZpbGVTZXJ2aWNlLmdldENvbnRyb2xsZXJQcm9maWxlcyh0aGlzLnN1YmplY3QuY29udHJvbGxlcklkKTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFx0W1Rlc3RpbmdDb250ZXh0S2V5cy5oYXNSdW5uYWJsZVRlc3RzLmtleSwgcHJvZmlsZXMuc29tZShwID0+IHAuZ3JvdXAgJiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4pXSxcblx0XHRcdFx0W1Rlc3RpbmdDb250ZXh0S2V5cy5oYXNEZWJ1Z2dhYmxlVGVzdHMua2V5LCBwcm9maWxlcy5zb21lKHAgPT4gcC5ncm91cCAmIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnKV0sXG5cdFx0XHRdKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBzdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHN0b3JlLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGNvbnRhaW5lciwgTWVudUlkLlRlc3RDYWxsU3RhY2ssIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdH0pKTtcblx0XHR0b29sYmFyLmNvbnRleHQgPSB0aGlzLnN1YmplY3Q7XG5cdFx0c3RvcmUuYWRkKHRvb2xiYXIpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJ1bkluTGFzdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYml0c2V0OiBUZXN0UnVuUHJvZmlsZUJpdHNldCwgc3ViamVjdDogSW5zcGVjdFN1YmplY3QpIHtcblx0Ly8gTGV0IHRoZSBmdWxsIGNvbW1hbmQgZG8gaXRzIHRoaW5nIGlmIHdlIHdhbnQgdG8gcnVuIHRoZSB3aG9sZSBzZXQgb2YgdGVzdHNcblx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUYXNrU3ViamVjdCkge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChcblx0XHRcdGJpdHNldCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcgPyBUZXN0Q29tbWFuZElkLkRlYnVnTGFzdFJ1biA6IFRlc3RDb21tYW5kSWQuUmVSdW5MYXN0UnVuLFxuXHRcdFx0c3ViamVjdC5yZXN1bHQuaWQsXG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdGNvbnN0IHBsYWluVGVzdCA9IHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCA/IHN1YmplY3QudGVzdCA6IHN1YmplY3QudGVzdC5pdGVtO1xuXHRjb25zdCBjdXJyZW50VGVzdCA9IHRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5SWQocGxhaW5UZXN0LmV4dElkKTtcblx0aWYgKCFjdXJyZW50VGVzdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiB0ZXN0U2VydmljZS5ydW5UZXN0cyh7XG5cdFx0Z3JvdXA6IGJpdHNldCxcblx0XHR0ZXN0czogW2N1cnJlbnRUZXN0XSxcblx0fSk7XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Rlc3RpbmcuY2FsbFN0YWNrLnJ1bicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Rlc3RpbmcuY2FsbFN0YWNrLnJ1bicsIFwiUmVydW4gVGVzdFwiKSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdSdW5JY29uLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RDYWxsU3RhY2ssXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNSdW5uYWJsZVRlc3RzLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc3ViamVjdDogSW5zcGVjdFN1YmplY3QpOiB2b2lkIHtcblx0XHRydW5Jbkxhc3QoYWNjZXNzb3IsIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgc3ViamVjdCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd0ZXN0aW5nLmNhbGxTdGFjay5kZWJ1ZycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Rlc3RpbmcuY2FsbFN0YWNrLmRlYnVnJywgXCJEZWJ1ZyBUZXN0XCIpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0RlYnVnSWNvbixcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0Q2FsbFN0YWNrLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzRGVidWdnYWJsZVRlc3RzLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc3ViamVjdDogSW5zcGVjdFN1YmplY3QpOiB2b2lkIHtcblx0XHRydW5Jbkxhc3QoYWNjZXNzb3IsIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLCBzdWJqZWN0KTtcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBUZXN0UmVzdWx0c1ZpZXdDb250ZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIGxhc3RTcGxpdFdpZHRoPzogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlkUmV2ZWFsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBzdWJqZWN0OiBJbnNwZWN0U3ViamVjdDsgcHJlc2VydmVGb2N1czogYm9vbGVhbiB9PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50U3ViamVjdFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkNsb3NlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZWxheTx2b2lkPigpKTtcblx0cHJpdmF0ZSBmb2xsb3d1cFdpZGdldCE6IEZvbGxvd3VwQWN0aW9uV2lkZ2V0O1xuXHRwcml2YXRlIG1lc3NhZ2VDb250ZXh0S2V5U2VydmljZSE6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSBjb250ZXh0S2V5VGVzdE1lc3NhZ2UhOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIGNvbnRleHRLZXlSZXN1bHRPdXRkYXRlZCE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHN0YWNrQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2FsbFN0YWNrV2lkZ2V0ITogQ2FsbFN0YWNrV2lkZ2V0O1xuXHRwcml2YXRlIGN1cnJlbnRUb3BGcmFtZT86IE1lc3NhZ2VTdGFja0ZyYW1lO1xuXHRwcml2YXRlIGlzRG9pbmdMYXlvdXRVcGRhdGU/OiBib29sZWFuO1xuXG5cdHByaXZhdGUgZGltZW5zaW9uPzogZG9tLkRpbWVuc2lvbjtcblx0cHJpdmF0ZSBzcGxpdFZpZXchOiBTcGxpdFZpZXc7XG5cdHByaXZhdGUgbWVzc2FnZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRlbnRQcm92aWRlcnMhOiBJUGVla091dHB1dFJlbmRlcmVyW107XG5cdHByaXZhdGUgY29udGVudFByb3ZpZGVyc1VwZGF0ZUxpbWl0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTGltaXRlcigxKSk7XG5cdHByaXZhdGUgaXNUcmVlTGVmdCA9IGZhbHNlOyAvLyBUcmFjayBsYXlvdXQgc2V0dGluZ1xuXG5cdHB1YmxpYyBjdXJyZW50PzogSW5zcGVjdFN1YmplY3Q7XG5cblx0LyoqIEZpcmVkIHdoZW4gYSB0cmVlIGl0ZW0gaXMgc2VsZWN0ZWQuIFBvcHVsYXRlZCBvbmx5IG9uIC5maWxsQm9keSgpICovXG5cdHB1YmxpYyBvbkRpZFJlcXVlc3RSZXZlYWwhOiBFdmVudDxJbnNwZWN0U3ViamVjdD47XG5cblx0cHVibGljIHJlYWRvbmx5IG9uQ2xvc2UgPSB0aGlzLm9uQ2xvc2VFbWl0dGVyLmV2ZW50O1xuXG5cdHB1YmxpYyBnZXQgdWlTdGF0ZSgpOiBJVGVzdFJlc3VsdHNWaWV3Q29udGVudFVpU3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzcGxpdFZpZXdXaWR0aHM6IEFycmF5LmZyb20oXG5cdFx0XHRcdHsgbGVuZ3RoOiB0aGlzLnNwbGl0Vmlldy5sZW5ndGggfSxcblx0XHRcdFx0KF8sIGkpID0+IHRoaXMuc3BsaXRWaWV3LmdldFZpZXdTaXplKGkpXG5cdFx0XHQpLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgpIHtcblx0XHRyZXR1cm4gdGhpcy5jYWxsU3RhY2tXaWRnZXQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIGdldCBjb250ZW50SGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLmNhbGxTdGFja1dpZGdldD8uY29udGVudEhlaWdodCB8fCAwO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZGlmZlZpZXdJbmRleCgpIHtcblx0XHRyZXR1cm4gdGhpcy5pc1RyZWVMZWZ0ID8gMSA6IDA7IC8vIENvbnRlbnQgdmlldyBpbmRleFxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaGlzdG9yeVZpZXdJbmRleCgpIHtcblx0XHRyZXR1cm4gdGhpcy5pc1RyZWVMZWZ0ID8gMCA6IDE7IC8vIFRyZWUgdmlldyBpbmRleFxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczoge1xuXHRcdFx0aGlzdG9yeVZpc2libGU6IElPYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj47XG5cdFx0XHRzaG93UmV2ZWFsTG9jYXRpb25Pbk1lc3NhZ2VzOiBib29sZWFuO1xuXHRcdFx0bG9jYXRpb25Gb3JQcm9ncmVzczogc3RyaW5nO1xuXHRcdH0sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBzd2FwVmlld3MoKSB7XG5cdFx0Y29uc3QgbGVmdFNpemUgPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKTtcblx0XHRjb25zdCByaWdodFNpemUgPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgxKTtcblx0XHRjb25zdCBsZWZ0VmlldyA9IHRoaXMuc3BsaXRWaWV3LnJlbW92ZVZpZXcoMSk7XG5cdFx0Y29uc3QgcmlnaHRWaWV3ID0gdGhpcy5zcGxpdFZpZXcucmVtb3ZlVmlldygwKTtcblxuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcobGVmdFZpZXcsIHJpZ2h0U2l6ZSk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyhyaWdodFZpZXcsIGxlZnRTaXplKTtcblx0fVxuXG5cdHB1YmxpYyBmaWxsQm9keShjb250YWluZXJFbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGluaXRpYWxTcGl0V2lkdGggPSBUZXN0UmVzdWx0c1ZpZXdDb250ZW50Lmxhc3RTcGxpdFdpZHRoO1xuXHRcdHRoaXMuc3BsaXRWaWV3ID0gbmV3IFNwbGl0Vmlldyhjb250YWluZXJFbGVtZW50LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0pO1xuXG5cdFx0Y29uc3QgeyBoaXN0b3J5VmlzaWJsZSwgc2hvd1JldmVhbExvY2F0aW9uT25NZXNzYWdlcyB9ID0gdGhpcy5vcHRpb25zO1xuXHRcdGNvbnN0IGlzSW5QZWVrVmlldyA9IHRoaXMuZWRpdG9yICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGF5b3V0ID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuUmVzdWx0c1ZpZXdMYXlvdXQpO1xuXHRcdHRoaXMuaXNUcmVlTGVmdCA9IGxheW91dCA9PT0gVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0LlRyZWVMZWZ0O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVzdGluZ0NvbmZpZ0tleXMuUmVzdWx0c1ZpZXdMYXlvdXQpKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0xheW91dCA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLlJlc3VsdHNWaWV3TGF5b3V0KTtcblx0XHRcdFx0Y29uc3QgbmV3SXNUcmVlTGVmdCA9IG5ld0xheW91dCA9PT0gVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0LlRyZWVMZWZ0O1xuXHRcdFx0XHRpZiAobmV3SXNUcmVlTGVmdCAhPT0gdGhpcy5pc1RyZWVMZWZ0KSB7XG5cdFx0XHRcdFx0dGhpcy5pc1RyZWVMZWZ0ID0gbmV3SXNUcmVlTGVmdDtcblx0XHRcdFx0XHR0aGlzLnN3YXBWaWV3cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRhaW5lciA9IHRoaXMubWVzc2FnZUNvbnRhaW5lciA9IGRvbS4kKCcudGVzdC1vdXRwdXQtcGVlay1tZXNzYWdlLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuc3RhY2tDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lckVsZW1lbnQsIGRvbS4kKCcudGVzdC1vdXRwdXQtY2FsbC1zdGFjay1jb250YWluZXInKSk7XG5cdFx0dGhpcy5jYWxsU3RhY2tXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhbGxTdGFja1dpZGdldCwgdGhpcy5zdGFja0NvbnRhaW5lciwgdGhpcy5lZGl0b3IpKTtcblx0XHR0aGlzLmZvbGxvd3VwV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb2xsb3d1cEFjdGlvbldpZGdldCwgdGhpcy5lZGl0b3IpKTtcblx0XHR0aGlzLm9uQ2xvc2VFbWl0dGVyLmlucHV0ID0gdGhpcy5mb2xsb3d1cFdpZGdldC5vbkNsb3NlO1xuXG5cdFx0dGhpcy5jb250ZW50UHJvdmlkZXJzID0gW1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmQ29udGVudFByb3ZpZGVyLCB0aGlzLmVkaXRvciwgbWVzc2FnZUNvbnRhaW5lcikpLFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZG93blRlc3RNZXNzYWdlUGVlaywgbWVzc2FnZUNvbnRhaW5lcikpLFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbE1lc3NhZ2VQZWVrLCBtZXNzYWdlQ29udGFpbmVyLCBpc0luUGVla1ZpZXcpKSxcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGxhaW5UZXh0TWVzc2FnZVBlZWssIHRoaXMuZWRpdG9yLCBtZXNzYWdlQ29udGFpbmVyKSksXG5cdFx0XTtcblxuXHRcdHRoaXMubWVzc2FnZUNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyRWxlbWVudCkpO1xuXHRcdHRoaXMuY29udGV4dEtleVRlc3RNZXNzYWdlID0gVGVzdGluZ0NvbnRleHRLZXlzLnRlc3RNZXNzYWdlQ29udGV4dC5iaW5kVG8odGhpcy5tZXNzYWdlQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY29udGV4dEtleVJlc3VsdE91dGRhdGVkID0gVGVzdGluZ0NvbnRleHRLZXlzLnRlc3RSZXN1bHRPdXRkYXRlZC5iaW5kVG8odGhpcy5tZXNzYWdlQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyRWxlbWVudCwgZG9tLiQoJy50ZXN0LW91dHB1dC1wZWVrLXRyZWUudGVzdGluZy1zdGR0cmVlJykpO1xuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0T3V0cHV0UGVla1RyZWUsXG5cdFx0XHR0cmVlQ29udGFpbmVyLFxuXHRcdFx0dGhpcy5kaWRSZXZlYWwuZXZlbnQsXG5cdFx0XHR7IHNob3dSZXZlYWxMb2NhdGlvbk9uTWVzc2FnZXMsIGxvY2F0aW9uRm9yUHJvZ3Jlc3M6IHRoaXMub3B0aW9ucy5sb2NhdGlvbkZvclByb2dyZXNzIH0sXG5cdFx0KSk7XG5cblx0XHR0aGlzLm9uRGlkUmVxdWVzdFJldmVhbCA9IHRyZWUub25EaWRSZXF1ZXN0UmV2aWV3O1xuXG5cdFx0Ly8gQWRkIHZpZXdzIGluIHRoZSBjb3JyZWN0IG9yZGVyIGJhc2VkIG9uIGxheW91dCBzZXR0aW5nXG5cdFx0Y29uc3Qgc3RhY2tWaWV3ID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0aGlzLnN0YWNrQ29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IDIwMCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuTUFYX1ZBTFVFLFxuXHRcdFx0bGF5b3V0OiAod2lkdGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRUZXN0UmVzdWx0c1ZpZXdDb250ZW50Lmxhc3RTcGxpdFdpZHRoID0gd2lkdGg7XG5cblx0XHRcdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5jYWxsU3RhY2tXaWRnZXQ/LmxheW91dCh0aGlzLmRpbWVuc2lvbi5oZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0XHR0aGlzLmxheW91dENvbnRlbnRXaWRnZXRzKHRoaXMuZGltZW5zaW9uLCB3aWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRyZWVWaWV3ID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0cmVlQ29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IDEwMCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuTUFYX1ZBTFVFLFxuXHRcdFx0bGF5b3V0OiAod2lkdGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0XHR0cmVlLmxheW91dCh0aGlzLmRpbWVuc2lvbi5oZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyhzdGFja1ZpZXcsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KHRyZWVWaWV3LCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0aWYgKHRoaXMuaXNUcmVlTGVmdCkge1xuXHRcdFx0dGhpcy5zd2FwVmlld3MoKTtcblx0XHR9XG5cblx0XHQvLyBDb25maWd1cmUgdmlzaWJpbGl0eSBmb3IgdGhlIHRyZWUgdmlld1xuXHRcdHRoaXMuc3BsaXRWaWV3LnNldFZpZXdWaXNpYmxlKHRoaXMuaGlzdG9yeVZpZXdJbmRleCwgaGlzdG9yeVZpc2libGUudmFsdWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhpc3RvcnlWaXNpYmxlLm9uRGlkQ2hhbmdlKHZpc2libGUgPT4ge1xuXHRcdFx0dGhpcy5zcGxpdFZpZXcuc2V0Vmlld1Zpc2libGUodGhpcy5oaXN0b3J5Vmlld0luZGV4LCB2aXNpYmxlKTtcblx0XHR9KSk7XG5cblx0XHRpZiAoaW5pdGlhbFNwaXRXaWR0aCkge1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5zcGxpdFZpZXcucmVzaXplVmlldyh0aGlzLmRpZmZWaWV3SW5kZXgsIGluaXRpYWxTcGl0V2lkdGgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgYSBtZXNzYWdlIGluLXBsYWNlIHdpdGhvdXQgc2hvd2luZyBvciBjaGFuZ2luZyB0aGUgcGVlayBsb2NhdGlvbi5cblx0ICogVGhpcyBpcyBtb3N0bHkgdXNlZCBpZiBwZWVraW5nIGEgbWVzc2FnZSB3aXRob3V0IGEgbG9jYXRpb24uXG5cdCAqL1xuXHRwdWJsaWMgcmV2ZWFsKG9wdHM6IHtcblx0XHRzdWJqZWN0OiBJbnNwZWN0U3ViamVjdDtcblx0XHRwcmVzZXJ2ZUZvY3VzOiBib29sZWFuO1xuXHR9KSB7XG5cdFx0dGhpcy5kaWRSZXZlYWwuZmlyZShvcHRzKTtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnQgJiYgZXF1YWxzU3ViamVjdCh0aGlzLmN1cnJlbnQsIG9wdHMuc3ViamVjdCkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnQgPSBvcHRzLnN1YmplY3Q7XG5cdFx0cmV0dXJuIHRoaXMuY29udGVudFByb3ZpZGVyc1VwZGF0ZUxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5jdXJyZW50U3ViamVjdFN0b3JlLmNsZWFyKCk7XG5cdFx0XHRjb25zdCBjYWxsRnJhbWVzID0gdGhpcy5nZXRDYWxsRnJhbWVzKG9wdHMuc3ViamVjdCkgfHwgW107XG5cdFx0XHRjb25zdCB0b3BGcmFtZSA9IGF3YWl0IHRoaXMucHJlcGFyZVRvcEZyYW1lKG9wdHMuc3ViamVjdCwgY2FsbEZyYW1lcyk7XG5cdFx0XHR0aGlzLnNldENhbGxTdGFja0ZyYW1lcyh0b3BGcmFtZSwgY2FsbEZyYW1lcyk7XG5cblx0XHRcdHRoaXMuZm9sbG93dXBXaWRnZXQuc2hvdyhvcHRzLnN1YmplY3QpO1xuXHRcdFx0dGhpcy5wb3B1bGF0ZUZsb2F0aW5nQ2xpY2sob3B0cy5zdWJqZWN0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q2FsbFN0YWNrRnJhbWVzKG1lc3NhZ2VGcmFtZTogQW55U3RhY2tGcmFtZSwgc3RhY2s6IElUZXN0TWVzc2FnZVN0YWNrRnJhbWVbXSkge1xuXHRcdHRoaXMuY2FsbFN0YWNrV2lkZ2V0LnNldEZyYW1lcyhbbWVzc2FnZUZyYW1lLCAuLi5zdGFjay5tYXAoZnJhbWUgPT4gbmV3IENhbGxTdGFja0ZyYW1lKFxuXHRcdFx0ZnJhbWUubGFiZWwsXG5cdFx0XHRmcmFtZS51cmksXG5cdFx0XHRmcmFtZS5wb3NpdGlvbj8ubGluZU51bWJlcixcblx0XHRcdGZyYW1lLnBvc2l0aW9uPy5jb2x1bW4sXG5cdFx0KSldKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZXMgYWxsIGRpc3BsYXllZCBzdGFjayBmcmFtZXMuXG5cdCAqL1xuXHRwdWJsaWMgY29sbGFwc2VTdGFjaygpIHtcblx0XHR0aGlzLmNhbGxTdGFja1dpZGdldC5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDYWxsRnJhbWVzKHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0KSB7XG5cdFx0aWYgKCEoc3ViamVjdCBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZnJhbWVzID0gc3ViamVjdC5zdGFjaztcblx0XHRpZiAoIWZyYW1lcz8ubGVuZ3RoIHx8ICF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuIGZyYW1lcztcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdGVzdCBleHRlbnNpb24ganVzdCBzZXRzIHRoZSB0b3AgZnJhbWUgYXMgdGhlIHNhbWUgbG9jYXRpb25cblx0XHQvLyB3aGVyZSB0aGUgbWVzc2FnZSBpcyBkaXNwbGF5ZWQsIGluIHRoZSBjYXNlIG9mIGEgcGVlayBpbiBhbiBlZGl0b3IsXG5cdFx0Ly8gZG9uJ3Qgc2hvdyBpdCBhZ2FpbiBiZWNhdXNlIGl0J3MganVzdCBhIGR1cGxpY2F0ZVxuXHRcdGNvbnN0IHRvcEZyYW1lID0gZnJhbWVzWzBdO1xuXHRcdGNvbnN0IHBlZWtMb2NhdGlvbiA9IHN1YmplY3QucmV2ZWFsTG9jYXRpb247XG5cdFx0Y29uc3QgaXNUb3BGcmFtZVNhbWUgPSBwZWVrTG9jYXRpb24gJiYgdG9wRnJhbWUucG9zaXRpb24gJiYgdG9wRnJhbWUudXJpXG5cdFx0XHQmJiB0b3BGcmFtZS5wb3NpdGlvbi5saW5lTnVtYmVyID09PSBwZWVrTG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyXG5cdFx0XHQmJiB0b3BGcmFtZS5wb3NpdGlvbi5jb2x1bW4gPT09IHBlZWtMb2NhdGlvbi5yYW5nZS5zdGFydENvbHVtblxuXHRcdFx0JiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodG9wRnJhbWUudXJpLCBwZWVrTG9jYXRpb24udXJpKTtcblxuXHRcdHJldHVybiBpc1RvcEZyYW1lU2FtZSA/IGZyYW1lcy5zbGljZSgxKSA6IGZyYW1lcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJlcGFyZVRvcEZyYW1lKHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0LCBjYWxsRnJhbWVzOiBJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lW10pIHtcblx0XHQvLyBlbnN1cmUgdGhlIG1lc3NhZ2VDb250YWluZXIgaXMgaW4gdGhlIERPTSBzbyByZW5kZXJlcnMgY2FuIGNhbGN1bGF0ZSB0aGVcblx0XHQvLyBkaW1lbnNpb25zIGJlZm9yZSBpdCdzIHJlbmRlcmVkIGluIHRoZSBsaXN0LlxuXHRcdHRoaXMubWVzc2FnZUNvbnRhaW5lci5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0dGhpcy5zdGFja0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm1lc3NhZ2VDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdG9wRnJhbWUgPSB0aGlzLmN1cnJlbnRUb3BGcmFtZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVzc2FnZVN0YWNrRnJhbWUsIHRoaXMubWVzc2FnZUNvbnRhaW5lciwgdGhpcy5mb2xsb3d1cFdpZGdldCwgc3ViamVjdCk7XG5cblx0XHRjb25zdCBoYXNNdWx0aXBsZUZyYW1lcyA9IGNhbGxGcmFtZXMubGVuZ3RoID4gMDtcblx0XHR0b3BGcmFtZS5zaG93SGVhZGVyLnNldChoYXNNdWx0aXBsZUZyYW1lcywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgZmluZEFzeW5jKHRoaXMuY29udGVudFByb3ZpZGVycywgcCA9PiBwLnVwZGF0ZShzdWJqZWN0KSk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuc3BsaXRWaWV3LmdldFZpZXdTaXplKHRoaXMuZGlmZlZpZXdJbmRleCk7XG5cdFx0XHRpZiAod2lkdGggIT09IC0xICYmIHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdHRvcEZyYW1lLmhlaWdodC5zZXQocHJvdmlkZXIubGF5b3V0KHsgd2lkdGgsIGhlaWdodDogdGhpcy5kaW1lbnNpb24/LmhlaWdodCB9LCBoYXNNdWx0aXBsZUZyYW1lcykhLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJvdmlkZXIub25TY3JvbGxlZCkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRTdWJqZWN0U3RvcmUuYWRkKHRoaXMuY2FsbFN0YWNrV2lkZ2V0Lm9uRGlkU2Nyb2xsKGV2dCA9PiB7XG5cdFx0XHRcdFx0cHJvdmlkZXIub25TY3JvbGxlZCEoZXZ0KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJvdmlkZXIub25EaWRDb250ZW50U2l6ZUNoYW5nZSkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRTdWJqZWN0U3RvcmUuYWRkKHByb3ZpZGVyLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdpZHRoID0gdGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUodGhpcy5kaWZmVmlld0luZGV4KTtcblx0XHRcdFx0XHRpZiAodGhpcy5kaW1lbnNpb24gJiYgIXRoaXMuaXNEb2luZ0xheW91dFVwZGF0ZSAmJiB3aWR0aCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdHRoaXMuaXNEb2luZ0xheW91dFVwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHR0b3BGcmFtZS5oZWlnaHQuc2V0KHByb3ZpZGVyLmxheW91dCh7IHdpZHRoLCBoZWlnaHQ6IHRoaXMuZGltZW5zaW9uLmhlaWdodCB9LCBoYXNNdWx0aXBsZUZyYW1lcykhLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5pc0RvaW5nTGF5b3V0VXBkYXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvcEZyYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRDb250ZW50V2lkZ2V0cyhkaW1lbnNpb246IGRvbS5EaW1lbnNpb24sIHdpZHRoID0gdGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUodGhpcy5kaWZmVmlld0luZGV4KSkge1xuXHRcdHRoaXMuaXNEb2luZ0xheW91dFVwZGF0ZSA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLmNvbnRlbnRQcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IGZyYW1lSGVpZ2h0ID0gcHJvdmlkZXIubGF5b3V0KHsgaGVpZ2h0OiBkaW1lbnNpb24uaGVpZ2h0LCB3aWR0aCB9LCAhIXRoaXMuY3VycmVudFRvcEZyYW1lPy5zaG93SGVhZGVyLmdldCgpKTtcblx0XHRcdGlmIChmcmFtZUhlaWdodCkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRUb3BGcmFtZT8uaGVpZ2h0LnNldChmcmFtZUhlaWdodCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5pc0RvaW5nTGF5b3V0VXBkYXRlID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHBvcHVsYXRlRmxvYXRpbmdDbGljayhzdWJqZWN0OiBJbnNwZWN0U3ViamVjdCkge1xuXHRcdGlmICghKHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRTdWJqZWN0U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlSZXN1bHRPdXRkYXRlZC5yZXNldCgpO1xuXHRcdFx0dGhpcy5jb250ZXh0S2V5VGVzdE1lc3NhZ2UucmVzZXQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlUZXN0TWVzc2FnZS5zZXQoc3ViamVjdC5jb250ZXh0VmFsdWUgfHwgJycpO1xuXHRcdGlmIChzdWJqZWN0LnJlc3VsdCBpbnN0YW5jZW9mIExpdmVUZXN0UmVzdWx0KSB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlSZXN1bHRPdXRkYXRlZC5zZXQoc3ViamVjdC5yZXN1bHQuZ2V0U3RhdGVCeUlkKHN1YmplY3QudGVzdC5leHRJZCk/LnJldGlyZWQgPz8gZmFsc2UpO1xuXHRcdFx0dGhpcy5jdXJyZW50U3ViamVjdFN0b3JlLmFkZChzdWJqZWN0LnJlc3VsdC5vbkNoYW5nZShldiA9PiB7XG5cdFx0XHRcdGlmIChldi5pdGVtLml0ZW0uZXh0SWQgPT09IHN1YmplY3QudGVzdC5leHRJZCkge1xuXHRcdFx0XHRcdHRoaXMuY29udGV4dEtleVJlc3VsdE91dGRhdGVkLnNldChldi5pdGVtLnJldGlyZWQgPz8gZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGV4dEtleVJlc3VsdE91dGRhdGVkLnNldCh0cnVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSB0aGlzLmN1cnJlbnRTdWJqZWN0U3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Vcblx0XHRcdC5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5tZXNzYWdlQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXG5cdFx0dGhpcy5jdXJyZW50U3ViamVjdFN0b3JlLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmxvYXRpbmdDbGlja01lbnUsIHtcblx0XHRcdGNvbnRhaW5lcjogdGhpcy5tZXNzYWdlQ29udGFpbmVyLFxuXHRcdFx0bWVudUlkOiBNZW51SWQuVGVzdE1lc3NhZ2VDb250ZW50LFxuXHRcdFx0Z2V0QWN0aW9uQXJnOiAoKSA9PiAoc3ViamVjdCBhcyBNZXNzYWdlU3ViamVjdCkuY29udGV4dCxcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb25MYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHR0aGlzLnNwbGl0Vmlldy5sYXlvdXQod2lkdGgpO1xuXHR9XG5cblx0cHVibGljIG9uV2lkdGgod2lkdGg6IG51bWJlcikge1xuXHRcdHRoaXMuc3BsaXRWaWV3LmxheW91dCh3aWR0aCk7XG5cdH1cblxuXG59XG5cbmNvbnN0IEZPTExPV1VQX0FOSU1BVElPTl9NSU5fVElNRSA9IDUwMDtcblxuY2xhc3MgRm9sbG93dXBBY3Rpb25XaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBlbCA9IGRvbS5oKCdkaXYudGVzdGluZy1mb2xsb3d1cC1hY3Rpb24nLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkNsb3NlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25DbG9zZSA9IHRoaXMub25DbG9zZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cHVibGljIGdldCBkb21Ob2RlKCkge1xuXHRcdHJldHVybiB0aGlzLmVsLnJvb3Q7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXQ6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93KHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0KSB7XG5cdFx0dGhpcy52aXNpYmxlU3RvcmUuY2xlYXIoKTtcblx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0KSB7XG5cdFx0XHR0aGlzLnNob3dNZXNzYWdlKHN1YmplY3QpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd01lc3NhZ2Uoc3ViamVjdDogTWVzc2FnZVN1YmplY3QpIHtcblx0XHRjb25zdCBjdHMgPSB0aGlzLnZpc2libGVTdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblxuXHRcdC8vIFdhaXQgZm9yIGNvbXBsZXRpb24gb3RoZXJ3aXNlIHJlc3VsdHMgd2lsbCBub3QgYmUgYXZhaWxhYmxlIHRvIHRoZSBleHQgaG9zdDpcblx0XHRpZiAoc3ViamVjdC5yZXN1bHQgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCAmJiAhc3ViamVjdC5yZXN1bHQuY29tcGxldGVkQXQpIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gRXZlbnQub25jZSgoc3ViamVjdC5yZXN1bHQgYXMgTGl2ZVRlc3RSZXN1bHQpLm9uQ29tcGxldGUpKHIpKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xsb3d1cHMgPSBhd2FpdCB0aGlzLnRlc3RTZXJ2aWNlLnByb3ZpZGVUZXN0Rm9sbG93dXBzKHtcblx0XHRcdGV4dElkOiBzdWJqZWN0LnRlc3QuZXh0SWQsXG5cdFx0XHRtZXNzYWdlSW5kZXg6IHN1YmplY3QubWVzc2FnZUluZGV4LFxuXHRcdFx0cmVzdWx0SWQ6IHN1YmplY3QucmVzdWx0LmlkLFxuXHRcdFx0dGFza0luZGV4OiBzdWJqZWN0LnRhc2tJbmRleCxcblx0XHR9LCBjdHMudG9rZW4pO1xuXG5cblx0XHRpZiAoIWZvbGxvd3Vwcy5mb2xsb3d1cHMubGVuZ3RoIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Zm9sbG93dXBzLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZpc2libGVTdG9yZS5hZGQoZm9sbG93dXBzKTtcblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5lbC5yb290KTtcblx0XHR0aGlzLmVsLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnYW5pbWF0ZWQnLCBEYXRlLm5vdygpIC0gc3RhcnQgPiBGT0xMT1dVUF9BTklNQVRJT05fTUlOX1RJTUUpO1xuXG5cdFx0dGhpcy5lbC5yb290LmFwcGVuZENoaWxkKHRoaXMubWFrZUZvbGxvd3VwTGluayhmb2xsb3d1cHMuZm9sbG93dXBzWzBdKSk7XG5cdFx0aWYgKGZvbGxvd3Vwcy5mb2xsb3d1cHMubGVuZ3RoID4gMSkge1xuXHRcdFx0dGhpcy5lbC5yb290LmFwcGVuZENoaWxkKHRoaXMubWFrZU1vcmVMaW5rKGZvbGxvd3Vwcy5mb2xsb3d1cHMpKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpc2libGVTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuZWwucm9vdC5yZW1vdmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG1ha2VGb2xsb3d1cExpbmsoZmlyc3Q6IElUZXN0Rm9sbG93dXApIHtcblx0XHRjb25zdCBsaW5rID0gdGhpcy5tYWtlTGluaygoKSA9PiB0aGlzLmFjdGlvbkZvbGxvd3VwKGxpbmssIGZpcnN0KSk7XG5cdFx0ZG9tLnJlc2V0KGxpbmssIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGZpcnN0Lm1lc3NhZ2UpKTtcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXG5cdHByaXZhdGUgbWFrZU1vcmVMaW5rKGZvbGxvd3VwczogSVRlc3RGb2xsb3d1cFtdKSB7XG5cdFx0Y29uc3QgbGluayA9IHRoaXMubWFrZUxpbmsoKCkgPT5cblx0XHRcdHRoaXMucXVpY2tJbnB1dC5waWNrKGZvbGxvd3Vwcy5tYXAoKGYsIGkpID0+ICh7XG5cdFx0XHRcdGxhYmVsOiBmLm1lc3NhZ2UsXG5cdFx0XHRcdGluZGV4OiBpXG5cdFx0XHR9KSkpLnRoZW4ocGlja2VkID0+IHtcblx0XHRcdFx0aWYgKHBpY2tlZD8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Zm9sbG93dXBzW3BpY2tlZFswXS5pbmRleF0uZXhlY3V0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRsaW5rLmlubmVyVGV4dCA9IGxvY2FsaXplKCd0ZXN0Rm9sbG93dXAubW9yZScsICcrezB9IE1vcmUuLi4nLCBmb2xsb3d1cHMubGVuZ3RoIC0gMSk7XG5cdFx0cmV0dXJuIGxpbms7XG5cdH1cblxuXHRwcml2YXRlIG1ha2VMaW5rKG9uQ2xpY2s6ICgpID0+IHZvaWQpIHtcblx0XHRjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRcdGxpbmsudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMudmlzaWJsZVN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssICdjbGljaycsIG9uQ2xpY2spKTtcblx0XHR0aGlzLnZpc2libGVTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0b25DbGljaygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBsaW5rO1xuXHR9XG5cblx0cHJpdmF0ZSBhY3Rpb25Gb2xsb3d1cChsaW5rOiBIVE1MQW5jaG9yRWxlbWVudCwgZnU6IElUZXN0Rm9sbG93dXApIHtcblx0XHRpZiAobGluay5hcmlhRGlzYWJsZWQgIT09ICd0cnVlJykge1xuXHRcdFx0bGluay5hcmlhRGlzYWJsZWQgPSAndHJ1ZSc7XG5cdFx0XHRmdS5leGVjdXRlKCk7XG5cblx0XHRcdGlmICh0aGlzLmVkaXRvcikge1xuXHRcdFx0XHR0aGlzLm9uQ2xvc2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNB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
