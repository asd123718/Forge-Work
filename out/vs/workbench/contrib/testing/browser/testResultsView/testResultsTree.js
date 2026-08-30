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
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action, ActionRunner, Separator } from "../../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { autorun } from "../../../../../base/common/observable.js";
import { count } from "../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isDefined } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { MenuEntryActionViewItem, fillInActionBarActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchCompressibleObjectTree } from "../../../../../platform/list/browser/listService.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { widgetClose } from "../../../../../platform/theme/common/iconRegistry.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { TestCommandId, Testing } from "../../common/constants.js";
import { ITestCoverageService } from "../../common/testCoverageService.js";
import { ITestExplorerFilterState } from "../../common/testExplorerFilterState.js";
import { TestId } from "../../common/testId.js";
import { ITestProfileService } from "../../common/testProfileService.js";
import { LiveTestResult, TestResultItemChangeReason, maxCountPriority } from "../../common/testResult.js";
import { ITestResultService } from "../../common/testResultService.js";
import { InternalTestItem, TestMessageType, TestResultState, TestRunProfileBitset, testResultStateToContextValues } from "../../common/testTypes.js";
import { TestingContextKeys } from "../../common/testingContextKeys.js";
import { cmpPriority, isFailedState } from "../../common/testingStates.js";
import { TestUriType, buildTestUri } from "../../common/testingUri.js";
import { getTestItemContextOverlay } from "../explorerProjections/testItemContextOverlay.js";
import * as icons from "../icons.js";
import { renderTestMessageAsText } from "../testMessageColorizer.js";
import { MessageSubject, TaskSubject, TestOutputSubject, getMessageArgs, mapFindTestMessage } from "./testResultsSubject.js";
function getTaskContext(resultId, task) {
  return { testRunName: task.name, controllerId: task.ctrlId, resultId, taskId: task.id };
}
class TestResultElement {
  constructor(value) {
    this.value = value;
    this.changeEmitter = new Emitter();
    this.onDidChange = this.changeEmitter.event;
    this.type = "result";
    this.id = value.id;
    this.context = value.id;
    this.label = value.name;
  }
  get icon() {
    return icons.testingStatesToIcons.get(
      this.value.completedAt === void 0 ? TestResultState.Running : maxCountPriority(this.value.counts)
    );
  }
}
const openCoverageLabel = localize("openTestCoverage", "View Test Coverage");
const closeCoverageLabel = localize("closeTestCoverage", "Close Test Coverage");
class CoverageElement {
  constructor(results, task, coverageService) {
    this.task = task;
    this.coverageService = coverageService;
    this.type = "coverage";
    this.id = `coverage-${results.id}/${task.id}`;
    this.onDidChange = Event.fromObservableLight(coverageService.selected);
  }
  get label() {
    return this.isOpen ? closeCoverageLabel : openCoverageLabel;
  }
  get icon() {
    return this.isOpen ? widgetClose : icons.testingCoverageReport;
  }
  get isOpen() {
    return this.coverageService.selected.get()?.fromTaskId === this.task.id;
  }
}
class OlderResultsElement {
  constructor(n) {
    this.n = n;
    this.type = "older";
    this.onDidChange = Event.None;
    this.label = n === 1 ? localize("oneOlderResult", "1 older result") : localize("nOlderResults", "{0} older results", n);
    this.id = `older-${this.n}`;
  }
}
class TestCaseElement {
  constructor(results, test, taskIndex) {
    this.results = results;
    this.test = test;
    this.taskIndex = taskIndex;
    this.type = "test";
    this.id = `${results.id}/${test.item.extId}`;
    const parentId = TestId.fromString(test.item.extId).parentId;
    if (parentId) {
      this.description = "";
      for (const part of parentId.idsToRoot()) {
        if (part.isRoot) {
          break;
        }
        const test2 = results.getStateById(part.toString());
        if (!test2) {
          break;
        }
        if (this.description.length) {
          this.description += " \u2039 ";
        }
        this.description += test2.item.label;
      }
    }
    this.context = new ActionSpreadArgs([
      {
        $mid: MarshalledId.TestItemContext,
        tests: [InternalTestItem.serialize(test)]
      },
      getTaskContext(results.id, results.tasks[this.taskIndex])
    ]);
  }
  get onDidChange() {
    if (!(this.results instanceof LiveTestResult)) {
      return Event.None;
    }
    return Event.filter(this.results.onChange, (e) => e.item.item.extId === this.test.item.extId && e.reason !== TestResultItemChangeReason.NewMessage);
  }
  get state() {
    return this.test.tasks[this.taskIndex].state;
  }
  get label() {
    return this.test.item.label;
  }
  get labelWithIcons() {
    return renderLabelWithIcons(this.label);
  }
  get icon() {
    return icons.testingStatesToIcons.get(this.state);
  }
  get outputSubject() {
    return new TestOutputSubject(this.results, this.taskIndex, this.test);
  }
}
class TaskElement {
  constructor(results, task, index) {
    this.results = results;
    this.task = task;
    this.index = index;
    this.changeEmitter = new Emitter();
    this.onDidChange = this.changeEmitter.event;
    this.type = "task";
    this.itemsCache = new CreationCache();
    this.id = `${results.id}/${index}`;
    this.task = results.tasks[index];
    this.context = getTaskContext(results.id, this.task);
    this.label = this.task.name;
  }
  get icon() {
    return this.results.tasks[this.index].running ? icons.testingStatesToIcons.get(TestResultState.Running) : void 0;
  }
}
class TestMessageElement {
  constructor(result, test, taskIndex, messageIndex) {
    this.result = result;
    this.test = test;
    this.taskIndex = taskIndex;
    this.messageIndex = messageIndex;
    this.type = "message";
    const m = this.message = test.tasks[taskIndex].messages[messageIndex];
    this.location = m.location;
    this.contextValue = m.type === TestMessageType.Error ? m.contextValue : void 0;
    this.uri = buildTestUri({
      type: TestUriType.ResultMessage,
      messageIndex,
      resultId: result.id,
      taskIndex,
      testExtId: test.item.extId
    });
    this.id = this.uri.toString();
    const asPlaintext = renderTestMessageAsText(m.message);
    const lines = count(asPlaintext.trimEnd(), "\n");
    this.label = firstLine(asPlaintext);
    if (lines > 0) {
      this.description = lines > 1 ? localize("messageMoreLinesN", "+ {0} more lines", lines) : localize("messageMoreLines1", "+ 1 more line");
    }
  }
  get onDidChange() {
    if (!(this.result instanceof LiveTestResult)) {
      return Event.None;
    }
    return Event.filter(this.result.onChange, (e) => e.item.item.extId === this.test.item.extId && e.reason !== TestResultItemChangeReason.NewMessage);
  }
  get context() {
    return new ActionSpreadArgs([
      getMessageArgs(this.test, this.message),
      getTaskContext(this.result.id, this.result.tasks[this.taskIndex])
    ]);
  }
  get outputSubject() {
    return new TestOutputSubject(this.result, this.taskIndex, this.test);
  }
}
let OutputPeekTree = class extends Disposable {
  constructor(container, onDidReveal, options, contextMenuService, results, instantiationService, explorerFilter, coverageService, progressService, telemetryService) {
    super();
    this.onDidReveal = onDidReveal;
    this.contextMenuService = contextMenuService;
    this.disposed = false;
    this.requestReveal = this._register(new Emitter());
    this.contextMenuActionRunner = this._register(new SpreadableActionRunner());
    this.onDidRequestReview = this.requestReveal.event;
    this.treeActions = instantiationService.createInstance(TreeActionsProvider, options.showRevealLocationOnMessages, this.requestReveal);
    const diffIdentityProvider = {
      getId(e) {
        return e.id;
      }
    };
    this.tree = this._register(instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "Test Output Peek",
      container,
      {
        getHeight: () => 22,
        getTemplateId: () => TestRunElementRenderer.ID
      },
      [instantiationService.createInstance(TestRunElementRenderer, this.treeActions)],
      {
        compressionEnabled: true,
        hideTwistiesOfChildlessElements: true,
        identityProvider: diffIdentityProvider,
        alwaysConsumeMouseWheel: false,
        sorter: {
          compare(a, b) {
            if (a instanceof TestCaseElement && b instanceof TestCaseElement) {
              return cmpPriority(a.state, b.state);
            }
            return 0;
          }
        },
        accessibilityProvider: {
          getAriaLabel(element) {
            return element.ariaLabel || element.label;
          },
          getWidgetAriaLabel() {
            return localize("testingPeekLabel", "Test Result Messages");
          }
        }
      }
    ));
    const cc = new CreationCache();
    const getTaskChildren = (taskElem) => {
      const { results: results2, index, itemsCache, task } = taskElem;
      const tests = Iterable.filter(results2.tests, (test) => test.tasks[index].state >= TestResultState.Running || test.tasks[index].messages.length > 0);
      let result = Iterable.map(tests, (test) => ({
        element: itemsCache.getOrCreate(test, () => new TestCaseElement(results2, test, index)),
        incompressible: true,
        children: getTestChildren(results2, test, index)
      }));
      if (task.coverage.get()) {
        result = Iterable.concat(
          Iterable.single({
            element: new CoverageElement(results2, task, coverageService),
            collapsible: true,
            incompressible: true
          }),
          result
        );
      }
      return result;
    };
    const getTestChildren = (result, test, taskIndex) => {
      return test.tasks[taskIndex].messages.map(
        (m, messageIndex) => m.type === TestMessageType.Error ? { element: cc.getOrCreate(m, () => new TestMessageElement(result, test, taskIndex, messageIndex)), incompressible: false } : void 0
      ).filter(isDefined);
    };
    const getResultChildren = (result) => {
      return result.tasks.map((task, taskIndex) => {
        const taskElem = cc.getOrCreate(task, () => new TaskElement(result, task, taskIndex));
        return {
          element: taskElem,
          incompressible: false,
          collapsible: true,
          children: getTaskChildren(taskElem)
        };
      });
    };
    const getRootChildren = () => {
      let children = [];
      const older = [];
      for (const result of results.results) {
        if (!children.length && result.tasks.length) {
          children = getResultChildren(result);
        } else if (children) {
          const element = cc.getOrCreate(result, () => new TestResultElement(result));
          older.push({
            element,
            incompressible: true,
            collapsible: true,
            collapsed: this.tree.hasElement(element) ? this.tree.isCollapsed(element) : true,
            children: getResultChildren(result)
          });
        }
      }
      if (!children.length) {
        return older;
      }
      if (older.length) {
        children.push({
          element: new OlderResultsElement(older.length),
          incompressible: true,
          collapsible: true,
          collapsed: true,
          children: older
        });
      }
      return children;
    };
    const taskChildrenToUpdate = /* @__PURE__ */ new Set();
    const taskChildrenUpdate = this._register(new RunOnceScheduler(() => {
      for (const taskNode of taskChildrenToUpdate) {
        if (this.tree.hasElement(taskNode)) {
          this.tree.setChildren(taskNode, getTaskChildren(taskNode), { diffIdentityProvider });
        }
      }
      taskChildrenToUpdate.clear();
    }, 300));
    const queueTaskChildrenUpdate = (taskNode) => {
      taskChildrenToUpdate.add(taskNode);
      if (!taskChildrenUpdate.isScheduled()) {
        taskChildrenUpdate.schedule();
      }
    };
    const attachToResults = (result) => {
      const disposable = new DisposableStore();
      disposable.add(result.onNewTask((i) => {
        this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });
        if (result.tasks.length === 1) {
          this.requestReveal.fire(new TaskSubject(result, 0));
        }
        const task = result.tasks[i];
        disposable.add(autorun((reader) => {
          task.coverage.read(reader);
          queueTaskChildrenUpdate(cc.get(task));
        }));
      }));
      disposable.add(result.onEndTask((index) => {
        cc.get(result.tasks[index])?.changeEmitter.fire();
      }));
      disposable.add(result.onChange((e) => {
        for (const [index, task] of result.tasks.entries()) {
          const taskNode = cc.get(task);
          if (!this.tree.hasElement(taskNode)) {
            continue;
          }
          const itemNode = taskNode.itemsCache.get(e.item);
          if (itemNode && this.tree.hasElement(itemNode)) {
            if (e.reason === TestResultItemChangeReason.NewMessage && e.message.type === TestMessageType.Error) {
              this.tree.setChildren(itemNode, getTestChildren(result, e.item, index), { diffIdentityProvider });
            }
            return;
          }
          queueTaskChildrenUpdate(taskNode);
        }
      }));
      disposable.add(result.onComplete(() => {
        cc.get(result)?.changeEmitter.fire();
        disposable.dispose();
      }));
    };
    this._register(results.onResultsChanged((e) => {
      if (this.disposed) {
        return;
      }
      if ("completed" in e) {
        cc.get(e.completed)?.changeEmitter.fire();
      } else if ("started" in e) {
        attachToResults(e.started);
      } else {
        this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });
      }
    }));
    const revealItem = (element, preserveFocus) => {
      this.tree.setFocus([element]);
      this.tree.setSelection([element]);
      if (!preserveFocus) {
        this.tree.domFocus();
      }
    };
    this._register(onDidReveal(async ({ subject, preserveFocus = false }) => {
      if (subject instanceof TaskSubject) {
        const resultItem = this.tree.getNode(null).children.find((c) => {
          if (c.element instanceof TaskElement) {
            return c.element.results.id === subject.result.id && c.element.index === subject.taskIndex;
          }
          if (c.element instanceof TestResultElement) {
            return c.element.id === subject.result.id;
          }
          return false;
        });
        if (resultItem) {
          revealItem(resultItem.element, preserveFocus);
        }
        return;
      }
      const revealElement = subject instanceof TestOutputSubject ? cc.get(subject.task)?.itemsCache.get(subject.test) : cc.get(subject.message);
      if (!revealElement || !this.tree.hasElement(revealElement)) {
        return;
      }
      const parents = [];
      for (let parent = this.tree.getParentElement(revealElement); parent; parent = this.tree.getParentElement(parent)) {
        parents.unshift(parent);
      }
      for (const parent of parents) {
        this.tree.expand(parent);
      }
      if (this.tree.getRelativeTop(revealElement) === null) {
        this.tree.reveal(revealElement, 0.5);
      }
      revealItem(revealElement, preserveFocus);
    }));
    this._register(this.tree.onDidOpen(async (e) => {
      if (e.element instanceof TestMessageElement) {
        this.requestReveal.fire(new MessageSubject(e.element.result, e.element.test, e.element.taskIndex, e.element.messageIndex));
      } else if (e.element instanceof TestCaseElement) {
        const t = e.element;
        const message = mapFindTestMessage(e.element.test, (_t, _m, mesasgeIndex, taskIndex) => new MessageSubject(t.results, t.test, taskIndex, mesasgeIndex));
        this.requestReveal.fire(message || new TestOutputSubject(t.results, 0, t.test));
      } else if (e.element instanceof CoverageElement) {
        const task = e.element.task;
        if (e.element.isOpen) {
          return coverageService.closeCoverage();
        }
        progressService.withProgress(
          { location: options.locationForProgress },
          () => coverageService.openCoverage(task, true)
        );
      }
    }));
    this._register(this.tree.onDidChangeSelection((evt) => {
      for (const element of evt.elements) {
        if (element && "test" in element) {
          explorerFilter.reveal.set(element.test.item.extId, void 0);
          break;
        }
      }
    }));
    this._register(explorerFilter.onDidSelectTestInExplorer((testId) => {
      if (this.tree.getSelection().some((e) => e && "test" in e && e.test.item.extId === testId)) {
        return;
      }
      for (const node of this.tree.getNode(null).children) {
        if (node.element instanceof TaskElement) {
          for (const testNode of node.children) {
            if (testNode.element instanceof TestCaseElement && testNode.element.test.item.extId === testId) {
              this.tree.setSelection([testNode.element]);
              if (this.tree.getRelativeTop(testNode.element) === null) {
                this.tree.reveal(testNode.element, 0.5);
              }
              break;
            }
          }
        }
      }
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.tree.onDidChangeCollapseState((e) => {
      if (e.node.element instanceof OlderResultsElement && !e.node.collapsed) {
        telemetryService.publicLog2("testing.expandOlderResults");
      }
    }));
    this.tree.setChildren(null, getRootChildren());
    for (const result of results.results) {
      if (!result.completedAt && result instanceof LiveTestResult) {
        attachToResults(result);
      }
    }
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  onContextMenu(evt) {
    if (!evt.element) {
      return;
    }
    const element = this.getRenderedElement(evt.element);
    const actions = this.treeActions.provideActionBar(element);
    this.contextMenuService.showContextMenu({
      getAnchor: () => evt.anchor,
      getActions: () => actions.secondary.length ? [...actions.primary, new Separator(), ...actions.secondary] : actions.primary,
      getActionsContext: () => element.context,
      actionRunner: this.contextMenuActionRunner
    });
  }
  getRenderedElement(element) {
    if (!(element instanceof TaskElement) && !(element instanceof TestMessageElement)) {
      return element;
    }
    try {
      const compressed = this.tree.getCompressedTreeNode(element);
      const chain = compressed.element?.elements;
      if (chain && chain.length >= 2 && chain[chain.length - 1] === element) {
        const parent = chain[chain.length - 2];
        if (parent) {
          return parent;
        }
      }
    } catch {
    }
    return element;
  }
  dispose() {
    super.dispose();
    this.disposed = true;
  }
};
OutputPeekTree = __decorateClass([
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, ITestResultService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITestExplorerFilterState),
  __decorateParam(7, ITestCoverageService),
  __decorateParam(8, IProgressService),
  __decorateParam(9, ITelemetryService)
], OutputPeekTree);
let TestRunElementRenderer = class {
  constructor(treeActions, instantiationService) {
    this.treeActions = treeActions;
    this.instantiationService = instantiationService;
    this.templateId = TestRunElementRenderer.ID;
  }
  /** @inheritdoc */
  renderCompressedElements(node, _index, templateData) {
    const chain = node.element.elements;
    const lastElement = chain[chain.length - 1];
    if ((lastElement instanceof TaskElement || lastElement instanceof TestMessageElement) && chain.length >= 2) {
      this.doRender(chain[chain.length - 2], templateData, lastElement);
    } else {
      this.doRender(lastElement, templateData);
    }
  }
  /** @inheritdoc */
  renderTemplate(container) {
    const templateDisposable = new DisposableStore();
    container.classList.add("testing-stdtree-container");
    const icon = dom.append(container, dom.$(".state"));
    const label = dom.append(container, dom.$(".label"));
    const actionBar = new ActionBar(container, {
      actionRunner: templateDisposable.add(new SpreadableActionRunner()),
      actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }) : void 0
    });
    const elementDisposable = new DisposableStore();
    templateDisposable.add(elementDisposable);
    templateDisposable.add(actionBar);
    return {
      icon,
      label,
      actionBar,
      elementDisposable,
      templateDisposable
    };
  }
  /** @inheritdoc */
  renderElement(element, _index, templateData) {
    this.doRender(element.element, templateData);
  }
  /** @inheritdoc */
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
  /** Called to render a new element */
  doRender(element, templateData, subjectElement) {
    templateData.elementDisposable.clear();
    templateData.elementDisposable.add(
      element.onDidChange(() => this.doRender(element, templateData, subjectElement))
    );
    this.doRenderInner(element, templateData, subjectElement);
  }
  /** Called, and may be re-called, to render or re-render an element */
  doRenderInner(element, templateData, subjectElement) {
    let { label, labelWithIcons, description } = element;
    if (subjectElement instanceof TestMessageElement) {
      description = subjectElement.label;
      if (element.description) {
        description = `${description} @ ${element.description}`;
      }
    }
    const descriptionElement = description ? dom.$("span.test-label-description", {}, description) : "";
    if (labelWithIcons) {
      dom.reset(templateData.label, ...labelWithIcons, descriptionElement);
    } else {
      dom.reset(templateData.label, label, descriptionElement);
    }
    const icon = element.icon;
    templateData.icon.className = `computed-state ${icon ? ThemeIcon.asClassName(icon) : ""}`;
    const actions = this.treeActions.provideActionBar(element);
    templateData.actionBar.clear();
    templateData.actionBar.context = element.context;
    templateData.actionBar.push(actions.primary, { icon: true, label: false });
  }
};
TestRunElementRenderer.ID = "testRunElementRenderer";
TestRunElementRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], TestRunElementRenderer);
let TreeActionsProvider = class {
  constructor(showRevealLocationOnMessages, requestReveal, contextKeyService, menuService, commandService, testProfileService, editorService) {
    this.showRevealLocationOnMessages = showRevealLocationOnMessages;
    this.requestReveal = requestReveal;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.commandService = commandService;
    this.testProfileService = testProfileService;
    this.editorService = editorService;
  }
  provideActionBar(element) {
    const test = element instanceof TestCaseElement ? element.test : void 0;
    const capabilities = test ? this.testProfileService.capabilitiesForTest(test.item) : 0;
    const contextKeys = [
      ["peek", Testing.OutputPeekContributionId],
      [TestingContextKeys.peekItemType.key, element.type]
    ];
    let id = MenuId.TestPeekElement;
    const primary = [];
    const secondary = [];
    if (element instanceof TaskElement) {
      primary.push(new Action(
        "testing.outputPeek.showResultOutput",
        localize("testing.showResultOutput", "Show Result Output"),
        ThemeIcon.asClassName(Codicon.terminal),
        void 0,
        () => this.requestReveal.fire(new TaskSubject(element.results, element.index))
      ));
      if (element.task.running) {
        primary.push(new Action(
          "testing.outputPeek.cancel",
          localize("testing.cancelRun", "Cancel Test Run"),
          ThemeIcon.asClassName(icons.testingCancelIcon),
          void 0,
          () => this.commandService.executeCommand(TestCommandId.CancelTestRunAction, element.results.id, element.task.id)
        ));
      } else {
        primary.push(new Action(
          "testing.outputPeek.rerun",
          localize("testing.reRunLastRun", "Rerun Last Run"),
          ThemeIcon.asClassName(icons.testingRerunIcon),
          void 0,
          () => this.commandService.executeCommand(TestCommandId.ReRunLastRun, element.results.id)
        ));
        const hasFailedTests = Iterable.some(element.results.tests, (test2) => isFailedState(test2.ownComputedState));
        if (hasFailedTests) {
          primary.push(new Action(
            "testing.outputPeek.rerunFailed",
            localize("testing.reRunFailedFromLastRun", "Rerun Failed Tests"),
            ThemeIcon.asClassName(icons.testingRerunIcon),
            void 0,
            () => this.commandService.executeCommand(TestCommandId.ReRunFailedFromLastRun, element.results.id)
          ));
        }
        primary.push(new Action(
          "testing.outputPeek.debug",
          localize("testing.debugLastRun", "Debug Last Run"),
          ThemeIcon.asClassName(icons.testingDebugIcon),
          void 0,
          () => this.commandService.executeCommand(TestCommandId.DebugLastRun, element.results.id)
        ));
        if (hasFailedTests) {
          primary.push(new Action(
            "testing.outputPeek.debugFailed",
            localize("testing.debugFailedFromLastRun", "Debug Failed Tests"),
            ThemeIcon.asClassName(icons.testingDebugIcon),
            void 0,
            () => this.commandService.executeCommand(TestCommandId.DebugFailedFromLastRun, element.results.id)
          ));
        }
      }
    }
    if (element instanceof TestResultElement) {
      if (element.value.tasks.length === 1) {
        primary.push(new Action(
          "testing.outputPeek.showResultOutput",
          localize("testing.showResultOutput", "Show Result Output"),
          ThemeIcon.asClassName(Codicon.terminal),
          void 0,
          () => this.requestReveal.fire(new TaskSubject(element.value, 0))
        ));
      }
      primary.push(new Action(
        "testing.outputPeek.reRunLastRun",
        localize("testing.reRunTest", "Rerun Test"),
        ThemeIcon.asClassName(icons.testingRunIcon),
        void 0,
        () => this.commandService.executeCommand("testing.reRunLastRun", element.value.id)
      ));
      const hasFailedTests = Iterable.some(element.value.tests, (test2) => isFailedState(test2.ownComputedState));
      if (hasFailedTests) {
        primary.push(new Action(
          "testing.outputPeek.rerunFailedResult",
          localize("testing.reRunFailedFromLastRun", "Rerun Failed Tests"),
          ThemeIcon.asClassName(icons.testingRerunIcon),
          void 0,
          () => this.commandService.executeCommand(TestCommandId.ReRunFailedFromLastRun, element.value.id)
        ));
      }
      if (capabilities & TestRunProfileBitset.Debug) {
        primary.push(new Action(
          "testing.outputPeek.debugLastRun",
          localize("testing.debugTest", "Debug Test"),
          ThemeIcon.asClassName(icons.testingDebugIcon),
          void 0,
          () => this.commandService.executeCommand("testing.debugLastRun", element.value.id)
        ));
        if (hasFailedTests) {
          primary.push(new Action(
            "testing.outputPeek.debugFailedResult",
            localize("testing.debugFailedFromLastRun", "Debug Failed Tests"),
            ThemeIcon.asClassName(icons.testingDebugIcon),
            void 0,
            () => this.commandService.executeCommand(TestCommandId.DebugFailedFromLastRun, element.value.id)
          ));
        }
      }
    }
    if (element instanceof TestCaseElement || element instanceof TestMessageElement) {
      contextKeys.push(
        [TestingContextKeys.testResultOutdated.key, element.test.retired],
        [TestingContextKeys.testResultState.key, testResultStateToContextValues[element.test.ownComputedState]],
        ...getTestItemContextOverlay(element.test, capabilities)
      );
      const { extId, uri } = element.test.item;
      if (uri) {
        primary.push(new Action(
          "testing.outputPeek.goToTest",
          localize("testing.goToTest", "Go to Test"),
          ThemeIcon.asClassName(Codicon.goToFile),
          void 0,
          () => this.commandService.executeCommand("vscode.revealTest", extId)
        ));
      }
      if (element.test.tasks[element.taskIndex].messages.some((m) => m.type === TestMessageType.Output)) {
        primary.push(new Action(
          "testing.outputPeek.showResultOutput",
          localize("testing.showResultOutput", "Show Result Output"),
          ThemeIcon.asClassName(Codicon.terminal),
          void 0,
          () => this.requestReveal.fire(element.outputSubject)
        ));
      }
      secondary.push(new Action(
        "testing.outputPeek.revealInExplorer",
        localize("testing.revealInExplorer", "Reveal in Test Explorer"),
        ThemeIcon.asClassName(Codicon.listTree),
        void 0,
        () => this.commandService.executeCommand("_revealTestInExplorer", extId)
      ));
      if (capabilities & TestRunProfileBitset.Run) {
        primary.push(new Action(
          "testing.outputPeek.runTest",
          localize("run test", "Run Test"),
          ThemeIcon.asClassName(icons.testingRunIcon),
          void 0,
          () => this.commandService.executeCommand("vscode.runTestsById", TestRunProfileBitset.Run, extId)
        ));
      }
      if (capabilities & TestRunProfileBitset.Debug) {
        primary.push(new Action(
          "testing.outputPeek.debugTest",
          localize("debug test", "Debug Test"),
          ThemeIcon.asClassName(icons.testingDebugIcon),
          void 0,
          () => this.commandService.executeCommand("vscode.runTestsById", TestRunProfileBitset.Debug, extId)
        ));
      }
    }
    if (element instanceof TestMessageElement) {
      id = MenuId.TestMessageContext;
      contextKeys.push([TestingContextKeys.testMessageContext.key, element.contextValue]);
      if (this.showRevealLocationOnMessages && element.location) {
        primary.push(new Action(
          "testing.outputPeek.goToError",
          localize("testing.goToError", "Go to Error"),
          ThemeIcon.asClassName(Codicon.debugStackframe),
          void 0,
          () => this.editorService.openEditor({
            resource: element.location.uri,
            options: {
              selection: element.location.range,
              preserveFocus: true
            }
          })
        ));
      }
    }
    const contextOverlay = this.contextKeyService.createOverlay(contextKeys);
    const result = { primary, secondary };
    const menu = this.menuService.getMenuActions(id, contextOverlay, { shouldForwardArgs: true });
    fillInActionBarActions(menu, result, "inline");
    return result;
  }
};
TreeActionsProvider = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, ITestProfileService),
  __decorateParam(6, IEditorService)
], TreeActionsProvider);
class CreationCache {
  constructor() {
    this.v = /* @__PURE__ */ new WeakMap();
  }
  get(key) {
    return this.v.get(key);
  }
  getOrCreate(ref, factory) {
    const existing = this.v.get(ref);
    if (existing) {
      return existing;
    }
    const fresh = factory();
    this.v.set(ref, fresh);
    return fresh;
  }
}
const firstLine = (str) => {
  const index = str.indexOf("\n");
  return index === -1 ? str : str.slice(0, index);
};
class ActionSpreadArgs {
  constructor(value) {
    this.value = value;
  }
}
class SpreadableActionRunner extends ActionRunner {
  async runAction(action, context) {
    if (context instanceof ActionSpreadArgs) {
      await action.run(...context.value);
    } else {
      await action.run(context);
    }
  }
}
export {
  OutputPeekTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RSZXN1bHRzVmlld1xcdGVzdFJlc3VsdHNUcmVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZUVsZW1lbnQsIElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgY291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGZpbGxJbkFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHdpZGdldENsb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZElkLCBUZXN0aW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJVGVzdENvdmVyYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0Q292ZXJhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IElUZXN0UHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0LCBJVGVzdFJ1blRhc2tSZXN1bHRzLCBMaXZlVGVzdFJlc3VsdCwgVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24sIG1heENvdW50UHJpb3JpdHkgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJpY2hMb2NhdGlvbiwgSVRlc3RJdGVtQ29udGV4dCwgSVRlc3RNZXNzYWdlLCBJbnRlcm5hbFRlc3RJdGVtLCBUZXN0TWVzc2FnZVR5cGUsIFRlc3RSZXN1bHRJdGVtLCBUZXN0UmVzdWx0U3RhdGUsIFRlc3RSdW5Qcm9maWxlQml0c2V0LCB0ZXN0UmVzdWx0U3RhdGVUb0NvbnRleHRWYWx1ZXMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RpbmdDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0aW5nQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgY21wUHJpb3JpdHksIGlzRmFpbGVkU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdGluZ1N0YXRlcy5qcyc7XG5pbXBvcnQgeyBUZXN0VXJpVHlwZSwgYnVpbGRUZXN0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RpbmdVcmkuanMnO1xuaW1wb3J0IHsgZ2V0VGVzdEl0ZW1Db250ZXh0T3ZlcmxheSB9IGZyb20gJy4uL2V4cGxvcmVyUHJvamVjdGlvbnMvdGVzdEl0ZW1Db250ZXh0T3ZlcmxheS5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuLi9pY29ucy5qcyc7XG5pbXBvcnQgeyByZW5kZXJUZXN0TWVzc2FnZUFzVGV4dCB9IGZyb20gJy4uL3Rlc3RNZXNzYWdlQ29sb3JpemVyLmpzJztcbmltcG9ydCB7IEluc3BlY3RTdWJqZWN0LCBNZXNzYWdlU3ViamVjdCwgVGFza1N1YmplY3QsIFRlc3RPdXRwdXRTdWJqZWN0LCBnZXRNZXNzYWdlQXJncywgbWFwRmluZFRlc3RNZXNzYWdlIH0gZnJvbSAnLi90ZXN0UmVzdWx0c1N1YmplY3QuanMnO1xuXG5cbmludGVyZmFjZSBJVHJlZUVsZW1lbnQge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGNvbnRleHQ6IHVua25vd247XG5cdGlkOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0bGFiZWxXaXRoSWNvbnM/OiByZWFkb25seSAoSFRNTFNwYW5FbGVtZW50IHwgc3RyaW5nKVtdO1xuXHRpY29uPzogVGhlbWVJY29uO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0YXJpYUxhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVRhc2tDb250ZXh0IHtcblx0dGVzdFJ1bk5hbWU6IHN0cmluZztcblx0Y29udHJvbGxlcklkOiBzdHJpbmc7XG5cdHJlc3VsdElkOiBzdHJpbmc7XG5cdHRhc2tJZDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBnZXRUYXNrQ29udGV4dChyZXN1bHRJZDogc3RyaW5nLCB0YXNrOiBJVGVzdFJ1blRhc2tSZXN1bHRzKTogSVRhc2tDb250ZXh0IHtcblx0cmV0dXJuIHsgdGVzdFJ1bk5hbWU6IHRhc2submFtZSwgY29udHJvbGxlcklkOiB0YXNrLmN0cmxJZCwgcmVzdWx0SWQsIHRhc2tJZDogdGFzay5pZCB9O1xufVxuXG5jbGFzcyBUZXN0UmVzdWx0RWxlbWVudCBpbXBsZW1lbnRzIElUcmVlRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSBjaGFuZ2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5jaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9ICdyZXN1bHQnO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29udGV4dDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cblx0cHVibGljIGdldCBpY29uKCkge1xuXHRcdHJldHVybiBpY29ucy50ZXN0aW5nU3RhdGVzVG9JY29ucy5nZXQoXG5cdFx0XHR0aGlzLnZhbHVlLmNvbXBsZXRlZEF0ID09PSB1bmRlZmluZWRcblx0XHRcdFx0PyBUZXN0UmVzdWx0U3RhdGUuUnVubmluZ1xuXHRcdFx0XHQ6IG1heENvdW50UHJpb3JpdHkodGhpcy52YWx1ZS5jb3VudHMpXG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB2YWx1ZTogSVRlc3RSZXN1bHQpIHtcblx0XHR0aGlzLmlkID0gdmFsdWUuaWQ7XG5cdFx0dGhpcy5jb250ZXh0ID0gdmFsdWUuaWQ7XG5cdFx0dGhpcy5sYWJlbCA9IHZhbHVlLm5hbWU7XG5cdH1cbn1cblxuY29uc3Qgb3BlbkNvdmVyYWdlTGFiZWwgPSBsb2NhbGl6ZSgnb3BlblRlc3RDb3ZlcmFnZScsICdWaWV3IFRlc3QgQ292ZXJhZ2UnKTtcbmNvbnN0IGNsb3NlQ292ZXJhZ2VMYWJlbCA9IGxvY2FsaXplKCdjbG9zZVRlc3RDb3ZlcmFnZScsICdDbG9zZSBUZXN0IENvdmVyYWdlJyk7XG5cbmNsYXNzIENvdmVyYWdlRWxlbWVudCBpbXBsZW1lbnRzIElUcmVlRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gJ2NvdmVyYWdlJztcblx0cHVibGljIHJlYWRvbmx5IGNvbnRleHQ6IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cblx0cHVibGljIGdldCBsYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5pc09wZW4gPyBjbG9zZUNvdmVyYWdlTGFiZWwgOiBvcGVuQ292ZXJhZ2VMYWJlbDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaWNvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5pc09wZW4gPyB3aWRnZXRDbG9zZSA6IGljb25zLnRlc3RpbmdDb3ZlcmFnZVJlcG9ydDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNPcGVuKCkge1xuXHRcdHJldHVybiB0aGlzLmNvdmVyYWdlU2VydmljZS5zZWxlY3RlZC5nZXQoKT8uZnJvbVRhc2tJZCA9PT0gdGhpcy50YXNrLmlkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzdWx0czogSVRlc3RSZXN1bHQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRhc2s6IElUZXN0UnVuVGFza1Jlc3VsdHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb3ZlcmFnZVNlcnZpY2U6IElUZXN0Q292ZXJhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmlkID0gYGNvdmVyYWdlLSR7cmVzdWx0cy5pZH0vJHt0YXNrLmlkfWA7XG5cdFx0dGhpcy5vbkRpZENoYW5nZSA9IEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHQoY292ZXJhZ2VTZXJ2aWNlLnNlbGVjdGVkKTtcblx0fVxufVxuXG5jbGFzcyBPbGRlclJlc3VsdHNFbGVtZW50IGltcGxlbWVudHMgSVRyZWVFbGVtZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSAnb2xkZXInO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29udGV4dDogdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0cHVibGljIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBuOiBudW1iZXIpIHtcblx0XHR0aGlzLmxhYmVsID0gbiA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnb25lT2xkZXJSZXN1bHQnLCAnMSBvbGRlciByZXN1bHQnKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbk9sZGVyUmVzdWx0cycsICd7MH0gb2xkZXIgcmVzdWx0cycsIG4pO1xuXHRcdHRoaXMuaWQgPSBgb2xkZXItJHt0aGlzLm59YDtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q2FzZUVsZW1lbnQgaW1wbGVtZW50cyBJVHJlZUVsZW1lbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9ICd0ZXN0Jztcblx0cHVibGljIHJlYWRvbmx5IGNvbnRleHQ6IEFjdGlvblNwcmVhZEFyZ3M8W0lUZXN0SXRlbUNvbnRleHQsIElUYXNrQ29udGV4dF0+O1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2UoKSB7XG5cdFx0aWYgKCEodGhpcy5yZXN1bHRzIGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gRXZlbnQuTm9uZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMucmVzdWx0cy5vbkNoYW5nZSwgZSA9PiBlLml0ZW0uaXRlbS5leHRJZCA9PT0gdGhpcy50ZXN0Lml0ZW0uZXh0SWQgJiYgZS5yZWFzb24gIT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk5ld01lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGF0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0LnRhc2tzW3RoaXMudGFza0luZGV4XS5zdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMudGVzdC5pdGVtLmxhYmVsO1xuXHR9XG5cblx0cHVibGljIGdldCBsYWJlbFdpdGhJY29ucygpIHtcblx0XHRyZXR1cm4gcmVuZGVyTGFiZWxXaXRoSWNvbnModGhpcy5sYWJlbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGljb24oKSB7XG5cdFx0cmV0dXJuIGljb25zLnRlc3RpbmdTdGF0ZXNUb0ljb25zLmdldCh0aGlzLnN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb3V0cHV0U3ViamVjdCgpIHtcblx0XHRyZXR1cm4gbmV3IFRlc3RPdXRwdXRTdWJqZWN0KHRoaXMucmVzdWx0cywgdGhpcy50YXNrSW5kZXgsIHRoaXMudGVzdCk7XG5cdH1cblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXN1bHRzOiBJVGVzdFJlc3VsdCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGVzdDogVGVzdFJlc3VsdEl0ZW0sXG5cdFx0cHVibGljIHJlYWRvbmx5IHRhc2tJbmRleDogbnVtYmVyLFxuXHQpIHtcblx0XHR0aGlzLmlkID0gYCR7cmVzdWx0cy5pZH0vJHt0ZXN0Lml0ZW0uZXh0SWR9YDtcblxuXHRcdGNvbnN0IHBhcmVudElkID0gVGVzdElkLmZyb21TdHJpbmcodGVzdC5pdGVtLmV4dElkKS5wYXJlbnRJZDtcblx0XHRpZiAocGFyZW50SWQpIHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb24gPSAnJztcblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJlbnRJZC5pZHNUb1Jvb3QoKSkge1xuXHRcdFx0XHRpZiAocGFydC5pc1Jvb3QpIHsgYnJlYWs7IH1cblx0XHRcdFx0Y29uc3QgdGVzdCA9IHJlc3VsdHMuZ2V0U3RhdGVCeUlkKHBhcnQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmICghdGVzdCkgeyBicmVhazsgfVxuXHRcdFx0XHRpZiAodGhpcy5kZXNjcmlwdGlvbi5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uICs9ICcgXFx1MjAzOSAnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvbiArPSB0ZXN0Lml0ZW0ubGFiZWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0ID0gbmV3IEFjdGlvblNwcmVhZEFyZ3MoW1xuXHRcdFx0e1xuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuVGVzdEl0ZW1Db250ZXh0LFxuXHRcdFx0XHR0ZXN0czogW0ludGVybmFsVGVzdEl0ZW0uc2VyaWFsaXplKHRlc3QpXSxcblx0XHRcdH0sXG5cdFx0XHRnZXRUYXNrQ29udGV4dChyZXN1bHRzLmlkLCByZXN1bHRzLnRhc2tzW3RoaXMudGFza0luZGV4XSlcblx0XHRdKTtcblx0fVxufVxuXG5jbGFzcyBUYXNrRWxlbWVudCBpbXBsZW1lbnRzIElUcmVlRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSBjaGFuZ2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5jaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9ICd0YXNrJztcblx0cHVibGljIHJlYWRvbmx5IGNvbnRleHQ6IElUYXNrQ29udGV4dDtcblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXRlbXNDYWNoZSA9IG5ldyBDcmVhdGlvbkNhY2hlPFRlc3RDYXNlRWxlbWVudD4oKTtcblxuXHRwdWJsaWMgZ2V0IGljb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMucmVzdWx0cy50YXNrc1t0aGlzLmluZGV4XS5ydW5uaW5nID8gaWNvbnMudGVzdGluZ1N0YXRlc1RvSWNvbnMuZ2V0KFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSByZXN1bHRzOiBJVGVzdFJlc3VsdCwgcHVibGljIHJlYWRvbmx5IHRhc2s6IElUZXN0UnVuVGFza1Jlc3VsdHMsIHB1YmxpYyByZWFkb25seSBpbmRleDogbnVtYmVyKSB7XG5cdFx0dGhpcy5pZCA9IGAke3Jlc3VsdHMuaWR9LyR7aW5kZXh9YDtcblx0XHR0aGlzLnRhc2sgPSByZXN1bHRzLnRhc2tzW2luZGV4XTtcblx0XHR0aGlzLmNvbnRleHQgPSBnZXRUYXNrQ29udGV4dChyZXN1bHRzLmlkLCB0aGlzLnRhc2spO1xuXHRcdHRoaXMubGFiZWwgPSB0aGlzLnRhc2submFtZTtcblx0fVxufVxuXG5jbGFzcyBUZXN0TWVzc2FnZUVsZW1lbnQgaW1wbGVtZW50cyBJVHJlZUVsZW1lbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9ICdtZXNzYWdlJztcblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkk7XG5cdHB1YmxpYyByZWFkb25seSBsb2NhdGlvbj86IElSaWNoTG9jYXRpb247XG5cdHB1YmxpYyByZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGNvbnRleHRWYWx1ZT86IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IG1lc3NhZ2U6IElUZXN0TWVzc2FnZTtcblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlKCkge1xuXHRcdGlmICghKHRoaXMucmVzdWx0IGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gRXZlbnQuTm9uZTtcblx0XHR9XG5cblx0XHQvLyByZXJlbmRlciB3aGVuIHRoZSB0ZXN0IGNhc2UgY2hhbmdlcyBzbyBpdCBnZXRzIHJldGlyZWQgZXZlbnRzXG5cdFx0cmV0dXJuIEV2ZW50LmZpbHRlcih0aGlzLnJlc3VsdC5vbkNoYW5nZSwgZSA9PiBlLml0ZW0uaXRlbS5leHRJZCA9PT0gdGhpcy50ZXN0Lml0ZW0uZXh0SWQgJiYgZS5yZWFzb24gIT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk5ld01lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldCBjb250ZXh0KCkge1xuXHRcdHJldHVybiBuZXcgQWN0aW9uU3ByZWFkQXJncyhbXG5cdFx0XHRnZXRNZXNzYWdlQXJncyh0aGlzLnRlc3QsIHRoaXMubWVzc2FnZSksXG5cdFx0XHRnZXRUYXNrQ29udGV4dCh0aGlzLnJlc3VsdC5pZCwgdGhpcy5yZXN1bHQudGFza3NbdGhpcy50YXNrSW5kZXhdKVxuXHRcdF0pO1xuXHR9XG5cblx0cHVibGljIGdldCBvdXRwdXRTdWJqZWN0KCkge1xuXHRcdHJldHVybiBuZXcgVGVzdE91dHB1dFN1YmplY3QodGhpcy5yZXN1bHQsIHRoaXMudGFza0luZGV4LCB0aGlzLnRlc3QpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3VsdDogSVRlc3RSZXN1bHQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRlc3Q6IFRlc3RSZXN1bHRJdGVtLFxuXHRcdHB1YmxpYyByZWFkb25seSB0YXNrSW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWVzc2FnZUluZGV4OiBudW1iZXIsXG5cdCkge1xuXHRcdGNvbnN0IG0gPSB0aGlzLm1lc3NhZ2UgPSB0ZXN0LnRhc2tzW3Rhc2tJbmRleF0ubWVzc2FnZXNbbWVzc2FnZUluZGV4XTtcblxuXHRcdHRoaXMubG9jYXRpb24gPSBtLmxvY2F0aW9uO1xuXHRcdHRoaXMuY29udGV4dFZhbHVlID0gbS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IgPyBtLmNvbnRleHRWYWx1ZSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLnVyaSA9IGJ1aWxkVGVzdFVyaSh7XG5cdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlLFxuXHRcdFx0bWVzc2FnZUluZGV4LFxuXHRcdFx0cmVzdWx0SWQ6IHJlc3VsdC5pZCxcblx0XHRcdHRhc2tJbmRleCxcblx0XHRcdHRlc3RFeHRJZDogdGVzdC5pdGVtLmV4dElkXG5cdFx0fSk7XG5cblx0XHR0aGlzLmlkID0gdGhpcy51cmkudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IGFzUGxhaW50ZXh0ID0gcmVuZGVyVGVzdE1lc3NhZ2VBc1RleHQobS5tZXNzYWdlKTtcblx0XHRjb25zdCBsaW5lcyA9IGNvdW50KGFzUGxhaW50ZXh0LnRyaW1FbmQoKSwgJ1xcbicpO1xuXHRcdHRoaXMubGFiZWwgPSBmaXJzdExpbmUoYXNQbGFpbnRleHQpO1xuXHRcdGlmIChsaW5lcyA+IDApIHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb24gPSBsaW5lcyA+IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbWVzc2FnZU1vcmVMaW5lc04nLCAnKyB7MH0gbW9yZSBsaW5lcycsIGxpbmVzKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtZXNzYWdlTW9yZUxpbmVzMScsICcrIDEgbW9yZSBsaW5lJyk7XG5cdFx0fVxuXHR9XG59XG5cbnR5cGUgVHJlZUVsZW1lbnQgPSBUZXN0UmVzdWx0RWxlbWVudCB8IFRlc3RDYXNlRWxlbWVudCB8IFRlc3RNZXNzYWdlRWxlbWVudCB8IFRhc2tFbGVtZW50IHwgQ292ZXJhZ2VFbGVtZW50IHwgT2xkZXJSZXN1bHRzRWxlbWVudDtcblxuZXhwb3J0IGNsYXNzIE91dHB1dFBlZWtUcmVlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlOiBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlQWN0aW9uczogVHJlZUFjdGlvbnNQcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSByZXF1ZXN0UmV2ZWFsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5zcGVjdFN1YmplY3Q+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51QWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNwcmVhZGFibGVBY3Rpb25SdW5uZXIoKSk7XG5cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUmVxdWVzdFJldmlldyA9IHRoaXMucmVxdWVzdFJldmVhbC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHJlYWRvbmx5IG9uRGlkUmV2ZWFsOiBFdmVudDx7IHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0OyBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuIH0+LFxuXHRcdG9wdGlvbnM6IHsgc2hvd1JldmVhbExvY2F0aW9uT25NZXNzYWdlczogYm9vbGVhbjsgbG9jYXRpb25Gb3JQcm9ncmVzczogc3RyaW5nIH0sXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSByZXN1bHRzOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUgZXhwbG9yZXJGaWx0ZXI6IElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSxcblx0XHRASVRlc3RDb3ZlcmFnZVNlcnZpY2UgY292ZXJhZ2VTZXJ2aWNlOiBJVGVzdENvdmVyYWdlU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy50cmVlQWN0aW9ucyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVBY3Rpb25zUHJvdmlkZXIsIG9wdGlvbnMuc2hvd1JldmVhbExvY2F0aW9uT25NZXNzYWdlcywgdGhpcy5yZXF1ZXN0UmV2ZWFsLCk7XG5cdFx0Y29uc3QgZGlmZklkZW50aXR5UHJvdmlkZXI6IElJZGVudGl0eVByb3ZpZGVyPFRyZWVFbGVtZW50PiA9IHtcblx0XHRcdGdldElkKGU6IFRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybiBlLmlkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWUsXG5cdFx0XHQnVGVzdCBPdXRwdXQgUGVlaycsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGdldEhlaWdodDogKCkgPT4gMjIsXG5cdFx0XHRcdGdldFRlbXBsYXRlSWQ6ICgpID0+IFRlc3RSdW5FbGVtZW50UmVuZGVyZXIuSUQsXG5cdFx0XHR9LFxuXHRcdFx0W2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5FbGVtZW50UmVuZGVyZXIsIHRoaXMudHJlZUFjdGlvbnMpXSxcblx0XHRcdHtcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRoaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzOiB0cnVlLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBkaWZmSWRlbnRpdHlQcm92aWRlcixcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRzb3J0ZXI6IHtcblx0XHRcdFx0XHRjb21wYXJlKGEsIGIpIHtcblx0XHRcdFx0XHRcdGlmIChhIGluc3RhbmNlb2YgVGVzdENhc2VFbGVtZW50ICYmIGIgaW5zdGFuY2VvZiBUZXN0Q2FzZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNtcFByaW9yaXR5KGEuc3RhdGUsIGIuc3RhdGUpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5hcmlhTGFiZWwgfHwgZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdGluZ1BlZWtMYWJlbCcsICdUZXN0IFJlc3VsdCBNZXNzYWdlcycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHQpKSBhcyBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPjtcblxuXHRcdGNvbnN0IGNjID0gbmV3IENyZWF0aW9uQ2FjaGU8VHJlZUVsZW1lbnQ+KCk7XG5cblx0XHRjb25zdCBnZXRUYXNrQ2hpbGRyZW4gPSAodGFza0VsZW06IFRhc2tFbGVtZW50KTogSXRlcmFibGU8SUNvbXByZXNzZWRUcmVlRWxlbWVudDxUcmVlRWxlbWVudD4+ID0+IHtcblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgaW5kZXgsIGl0ZW1zQ2FjaGUsIHRhc2sgfSA9IHRhc2tFbGVtO1xuXHRcdFx0Y29uc3QgdGVzdHMgPSBJdGVyYWJsZS5maWx0ZXIocmVzdWx0cy50ZXN0cywgdGVzdCA9PiB0ZXN0LnRhc2tzW2luZGV4XS5zdGF0ZSA+PSBUZXN0UmVzdWx0U3RhdGUuUnVubmluZyB8fCB0ZXN0LnRhc2tzW2luZGV4XS5tZXNzYWdlcy5sZW5ndGggPiAwKTtcblx0XHRcdGxldCByZXN1bHQ6IEl0ZXJhYmxlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VHJlZUVsZW1lbnQ+PiA9IEl0ZXJhYmxlLm1hcCh0ZXN0cywgdGVzdCA9PiAoe1xuXHRcdFx0XHRlbGVtZW50OiBpdGVtc0NhY2hlLmdldE9yQ3JlYXRlKHRlc3QsICgpID0+IG5ldyBUZXN0Q2FzZUVsZW1lbnQocmVzdWx0cywgdGVzdCwgaW5kZXgpKSxcblx0XHRcdFx0aW5jb21wcmVzc2libGU6IHRydWUsXG5cdFx0XHRcdGNoaWxkcmVuOiBnZXRUZXN0Q2hpbGRyZW4ocmVzdWx0cywgdGVzdCwgaW5kZXgpLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAodGFzay5jb3ZlcmFnZS5nZXQoKSkge1xuXHRcdFx0XHRyZXN1bHQgPSBJdGVyYWJsZS5jb25jYXQoXG5cdFx0XHRcdFx0SXRlcmFibGUuc2luZ2xlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VHJlZUVsZW1lbnQ+Pih7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiBuZXcgQ292ZXJhZ2VFbGVtZW50KHJlc3VsdHMsIHRhc2ssIGNvdmVyYWdlU2VydmljZSksXG5cdFx0XHRcdFx0XHRjb2xsYXBzaWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGluY29tcHJlc3NpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0VGVzdENoaWxkcmVuID0gKHJlc3VsdDogSVRlc3RSZXN1bHQsIHRlc3Q6IFRlc3RSZXN1bHRJdGVtLCB0YXNrSW5kZXg6IG51bWJlcik6IEl0ZXJhYmxlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VHJlZUVsZW1lbnQ+PiA9PiB7XG5cdFx0XHRyZXR1cm4gdGVzdC50YXNrc1t0YXNrSW5kZXhdLm1lc3NhZ2VzXG5cdFx0XHRcdC5tYXAoKG0sIG1lc3NhZ2VJbmRleCkgPT5cblx0XHRcdFx0XHRtLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvclxuXHRcdFx0XHRcdFx0PyB7IGVsZW1lbnQ6IGNjLmdldE9yQ3JlYXRlKG0sICgpID0+IG5ldyBUZXN0TWVzc2FnZUVsZW1lbnQocmVzdWx0LCB0ZXN0LCB0YXNrSW5kZXgsIG1lc3NhZ2VJbmRleCkpLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHRcdFx0KVxuXHRcdFx0XHQuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldFJlc3VsdENoaWxkcmVuID0gKHJlc3VsdDogSVRlc3RSZXN1bHQpOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFRyZWVFbGVtZW50PltdID0+IHtcblx0XHRcdHJldHVybiByZXN1bHQudGFza3MubWFwKCh0YXNrLCB0YXNrSW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGFza0VsZW0gPSBjYy5nZXRPckNyZWF0ZSh0YXNrLCAoKSA9PiBuZXcgVGFza0VsZW1lbnQocmVzdWx0LCB0YXNrLCB0YXNrSW5kZXgpKTtcblx0XHRcdFx0cmV0dXJuICh7XG5cdFx0XHRcdFx0ZWxlbWVudDogdGFza0VsZW0sXG5cdFx0XHRcdFx0aW5jb21wcmVzc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBnZXRUYXNrQ2hpbGRyZW4odGFza0VsZW0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBnZXRSb290Q2hpbGRyZW4gPSAoKTogSXRlcmFibGU8SUNvbXByZXNzZWRUcmVlRWxlbWVudDxUcmVlRWxlbWVudD4+ID0+IHtcblx0XHRcdGxldCBjaGlsZHJlbjogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxUcmVlRWxlbWVudD5bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBvbGRlciA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzLnJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKCFjaGlsZHJlbi5sZW5ndGggJiYgcmVzdWx0LnRhc2tzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuID0gZ2V0UmVzdWx0Q2hpbGRyZW4ocmVzdWx0KTtcblx0XHRcdFx0fSBlbHNlIGlmIChjaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBjYy5nZXRPckNyZWF0ZShyZXN1bHQsICgpID0+IG5ldyBUZXN0UmVzdWx0RWxlbWVudChyZXN1bHQpKTtcblx0XHRcdFx0XHRvbGRlci5wdXNoKHtcblx0XHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y29sbGFwc2VkOiB0aGlzLnRyZWUuaGFzRWxlbWVudChlbGVtZW50KSA/IHRoaXMudHJlZS5pc0NvbGxhcHNlZChlbGVtZW50KSA6IHRydWUsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogZ2V0UmVzdWx0Q2hpbGRyZW4ocmVzdWx0KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBvbGRlcjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9sZGVyLmxlbmd0aCkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50OiBuZXcgT2xkZXJSZXN1bHRzRWxlbWVudChvbGRlci5sZW5ndGgpLFxuXHRcdFx0XHRcdGluY29tcHJlc3NpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRjaGlsZHJlbjogb2xkZXIsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fTtcblxuXHRcdC8vIFF1ZXVlZCByZXN1bHQgdXBkYXRlcyB0byBwcmV2ZW50IHNwYW1taW5nIENQVSB3aGVuIGxvdHMgb2YgdGVzdHMgYXJlXG5cdFx0Ly8gY29tcGxldGluZyBhbmQgbWVzc2FnaW5nIHF1aWNrbHkgKCMxNDI1MTQpXG5cdFx0Y29uc3QgdGFza0NoaWxkcmVuVG9VcGRhdGUgPSBuZXcgU2V0PFRhc2tFbGVtZW50PigpO1xuXHRcdGNvbnN0IHRhc2tDaGlsZHJlblVwZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgdGFza05vZGUgb2YgdGFza0NoaWxkcmVuVG9VcGRhdGUpIHtcblx0XHRcdFx0aWYgKHRoaXMudHJlZS5oYXNFbGVtZW50KHRhc2tOb2RlKSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbih0YXNrTm9kZSwgZ2V0VGFza0NoaWxkcmVuKHRhc2tOb2RlKSwgeyBkaWZmSWRlbnRpdHlQcm92aWRlciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGFza0NoaWxkcmVuVG9VcGRhdGUuY2xlYXIoKTtcblx0XHR9LCAzMDApKTtcblxuXHRcdGNvbnN0IHF1ZXVlVGFza0NoaWxkcmVuVXBkYXRlID0gKHRhc2tOb2RlOiBUYXNrRWxlbWVudCkgPT4ge1xuXHRcdFx0dGFza0NoaWxkcmVuVG9VcGRhdGUuYWRkKHRhc2tOb2RlKTtcblx0XHRcdGlmICghdGFza0NoaWxkcmVuVXBkYXRlLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGFza0NoaWxkcmVuVXBkYXRlLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGF0dGFjaFRvUmVzdWx0cyA9IChyZXN1bHQ6IExpdmVUZXN0UmVzdWx0KSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQocmVzdWx0Lm9uTmV3VGFzayhpID0+IHtcblx0XHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIGdldFJvb3RDaGlsZHJlbigpLCB7IGRpZmZJZGVudGl0eVByb3ZpZGVyIH0pO1xuXG5cdFx0XHRcdGlmIChyZXN1bHQudGFza3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXF1ZXN0UmV2ZWFsLmZpcmUobmV3IFRhc2tTdWJqZWN0KHJlc3VsdCwgMCkpOyAvLyByZXZlYWwgdGhlIGZpcnN0IHRhc2sgaW4gbmV3IHJ1bnNcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG5vdGU6IHRhc2tzIGFyZSBib3VuZGVkIGFuZCB0aGVpciBsaWZldGltZSBpcyBlcXVpdmFsZW50IHRvIHRoYXQgb2Zcblx0XHRcdFx0Ly8gdGhlIHRlc3QgcmVzdWx0LCBzbyB0aGlzIGRvZXNuJ3QgbGVhayBpbmRlZmluaXRlbHkuXG5cdFx0XHRcdGNvbnN0IHRhc2sgPSByZXN1bHQudGFza3NbaV07XG5cdFx0XHRcdGRpc3Bvc2FibGUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHR0YXNrLmNvdmVyYWdlLnJlYWQocmVhZGVyKTsgLy8gYWRkIGl0IHRvIHRoZSBhdXRvcnVuXG5cdFx0XHRcdFx0cXVldWVUYXNrQ2hpbGRyZW5VcGRhdGUoY2MuZ2V0KHRhc2spIGFzIFRhc2tFbGVtZW50KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmFkZChyZXN1bHQub25FbmRUYXNrKGluZGV4ID0+IHtcblx0XHRcdFx0KGNjLmdldChyZXN1bHQudGFza3NbaW5kZXhdKSBhcyBUYXNrRWxlbWVudCB8IHVuZGVmaW5lZCk/LmNoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmFkZChyZXN1bHQub25DaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdC8vIHRyeSB1cGRhdGluZyB0aGUgaXRlbSBpbiBlYWNoIG9mIGl0cyB0YXNrc1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtpbmRleCwgdGFza10gb2YgcmVzdWx0LnRhc2tzLmVudHJpZXMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tOb2RlID0gY2MuZ2V0KHRhc2spIGFzIFRhc2tFbGVtZW50O1xuXHRcdFx0XHRcdGlmICghdGhpcy50cmVlLmhhc0VsZW1lbnQodGFza05vZGUpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBpdGVtTm9kZSA9IHRhc2tOb2RlLml0ZW1zQ2FjaGUuZ2V0KGUuaXRlbSk7XG5cdFx0XHRcdFx0aWYgKGl0ZW1Ob2RlICYmIHRoaXMudHJlZS5oYXNFbGVtZW50KGl0ZW1Ob2RlKSkge1xuXHRcdFx0XHRcdFx0aWYgKGUucmVhc29uID09PSBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5OZXdNZXNzYWdlICYmIGUubWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKGl0ZW1Ob2RlLCBnZXRUZXN0Q2hpbGRyZW4ocmVzdWx0LCBlLml0ZW0sIGluZGV4KSwgeyBkaWZmSWRlbnRpdHlQcm92aWRlciB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRxdWV1ZVRhc2tDaGlsZHJlblVwZGF0ZSh0YXNrTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5hZGQocmVzdWx0Lm9uQ29tcGxldGUoKCkgPT4ge1xuXHRcdFx0XHQoY2MuZ2V0KHJlc3VsdCkgYXMgVGVzdFJlc3VsdEVsZW1lbnQgfCB1bmRlZmluZWQpPy5jaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZChlID0+IHtcblx0XHRcdC8vIGxpdHRsZSBoYWNrIGhlcmU6IGEgcmVzdWx0IGNoYW5nZSBjYW4gY2F1c2UgdGhlIHBlZWsgdG8gYmUgZGlzcG9zZWQsXG5cdFx0XHQvLyBidXQgdGhpcyBsaXN0ZW5lciB3aWxsIHN0aWxsIGJlIHF1ZXVlZC4gRG9pbmcgc3R1ZmYgd2l0aCB0aGUgdHJlZVxuXHRcdFx0Ly8gd2lsbCBjYXVzZSBlcnJvcnMuXG5cdFx0XHRpZiAodGhpcy5kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICgnY29tcGxldGVkJyBpbiBlKSB7XG5cdFx0XHRcdChjYy5nZXQoZS5jb21wbGV0ZWQpIGFzIFRlc3RSZXN1bHRFbGVtZW50IHwgdW5kZWZpbmVkKT8uY2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCdzdGFydGVkJyBpbiBlKSB7XG5cdFx0XHRcdGF0dGFjaFRvUmVzdWx0cyhlLnN0YXJ0ZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIGdldFJvb3RDaGlsZHJlbigpLCB7IGRpZmZJZGVudGl0eVByb3ZpZGVyIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJldmVhbEl0ZW0gPSAoZWxlbWVudDogVHJlZUVsZW1lbnQsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pID0+IHtcblx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbZWxlbWVudF0pO1xuXHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbZWxlbWVudF0pO1xuXHRcdFx0aWYgKCFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFJldmVhbChhc3luYyAoeyBzdWJqZWN0LCBwcmVzZXJ2ZUZvY3VzID0gZmFsc2UgfSkgPT4ge1xuXHRcdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUYXNrU3ViamVjdCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHRJdGVtID0gdGhpcy50cmVlLmdldE5vZGUobnVsbCkuY2hpbGRyZW4uZmluZChjID0+IHtcblx0XHRcdFx0XHRpZiAoYy5lbGVtZW50IGluc3RhbmNlb2YgVGFza0VsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjLmVsZW1lbnQucmVzdWx0cy5pZCA9PT0gc3ViamVjdC5yZXN1bHQuaWQgJiYgYy5lbGVtZW50LmluZGV4ID09PSBzdWJqZWN0LnRhc2tJbmRleDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGMuZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RSZXN1bHRFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYy5lbGVtZW50LmlkID09PSBzdWJqZWN0LnJlc3VsdC5pZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAocmVzdWx0SXRlbSkge1xuXHRcdFx0XHRcdHJldmVhbEl0ZW0ocmVzdWx0SXRlbS5lbGVtZW50ISwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXZlYWxFbGVtZW50ID0gc3ViamVjdCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0XG5cdFx0XHRcdD8gY2MuZ2V0PFRhc2tFbGVtZW50PihzdWJqZWN0LnRhc2spPy5pdGVtc0NhY2hlLmdldChzdWJqZWN0LnRlc3QpXG5cdFx0XHRcdDogY2MuZ2V0KHN1YmplY3QubWVzc2FnZSk7XG5cdFx0XHRpZiAoIXJldmVhbEVsZW1lbnQgfHwgIXRoaXMudHJlZS5oYXNFbGVtZW50KHJldmVhbEVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50czogVHJlZUVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgcGFyZW50ID0gdGhpcy50cmVlLmdldFBhcmVudEVsZW1lbnQocmV2ZWFsRWxlbWVudCk7IHBhcmVudDsgcGFyZW50ID0gdGhpcy50cmVlLmdldFBhcmVudEVsZW1lbnQocGFyZW50KSkge1xuXHRcdFx0XHRwYXJlbnRzLnVuc2hpZnQocGFyZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBwYXJlbnQgb2YgcGFyZW50cykge1xuXHRcdFx0XHR0aGlzLnRyZWUuZXhwYW5kKHBhcmVudCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnRyZWUuZ2V0UmVsYXRpdmVUb3AocmV2ZWFsRWxlbWVudCkgPT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy50cmVlLnJldmVhbChyZXZlYWxFbGVtZW50LCAwLjUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXZlYWxJdGVtKHJldmVhbEVsZW1lbnQsIHByZXNlcnZlRm9jdXMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgVGVzdE1lc3NhZ2VFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMucmVxdWVzdFJldmVhbC5maXJlKG5ldyBNZXNzYWdlU3ViamVjdChlLmVsZW1lbnQucmVzdWx0LCBlLmVsZW1lbnQudGVzdCwgZS5lbGVtZW50LnRhc2tJbmRleCwgZS5lbGVtZW50Lm1lc3NhZ2VJbmRleCkpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0Q2FzZUVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgdCA9IGUuZWxlbWVudDtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG1hcEZpbmRUZXN0TWVzc2FnZShlLmVsZW1lbnQudGVzdCwgKF90LCBfbSwgbWVzYXNnZUluZGV4LCB0YXNrSW5kZXgpID0+XG5cdFx0XHRcdFx0bmV3IE1lc3NhZ2VTdWJqZWN0KHQucmVzdWx0cywgdC50ZXN0LCB0YXNrSW5kZXgsIG1lc2FzZ2VJbmRleCkpO1xuXHRcdFx0XHR0aGlzLnJlcXVlc3RSZXZlYWwuZmlyZShtZXNzYWdlIHx8IG5ldyBUZXN0T3V0cHV0U3ViamVjdCh0LnJlc3VsdHMsIDAsIHQudGVzdCkpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQgaW5zdGFuY2VvZiBDb3ZlcmFnZUVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgdGFzayA9IGUuZWxlbWVudC50YXNrO1xuXHRcdFx0XHRpZiAoZS5lbGVtZW50LmlzT3Blbikge1xuXHRcdFx0XHRcdHJldHVybiBjb3ZlcmFnZVNlcnZpY2UuY2xvc2VDb3ZlcmFnZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdFx0eyBsb2NhdGlvbjogb3B0aW9ucy5sb2NhdGlvbkZvclByb2dyZXNzIH0sXG5cdFx0XHRcdFx0KCkgPT4gY292ZXJhZ2VTZXJ2aWNlLm9wZW5Db3ZlcmFnZSh0YXNrLCB0cnVlKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihldnQgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGV2dC5lbGVtZW50cykge1xuXHRcdFx0XHRpZiAoZWxlbWVudCAmJiAndGVzdCcgaW4gZWxlbWVudCkge1xuXHRcdFx0XHRcdGV4cGxvcmVyRmlsdGVyLnJldmVhbC5zZXQoZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihleHBsb3JlckZpbHRlci5vbkRpZFNlbGVjdFRlc3RJbkV4cGxvcmVyKHRlc3RJZCA9PiB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmdldFNlbGVjdGlvbigpLnNvbWUoZSA9PiBlICYmICd0ZXN0JyBpbiBlICYmIGUudGVzdC5pdGVtLmV4dElkID09PSB0ZXN0SWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMudHJlZS5nZXROb2RlKG51bGwpLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmIChub2RlLmVsZW1lbnQgaW5zdGFuY2VvZiBUYXNrRWxlbWVudCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdGVzdE5vZGUgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0aWYgKHRlc3ROb2RlLmVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0Q2FzZUVsZW1lbnQgJiYgdGVzdE5vZGUuZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQgPT09IHRlc3RJZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFt0ZXN0Tm9kZS5lbGVtZW50XSk7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLnRyZWUuZ2V0UmVsYXRpdmVUb3AodGVzdE5vZGUuZWxlbWVudCkgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHRlc3ROb2RlLmVsZW1lbnQsIDAuNSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZShlID0+IHtcblx0XHRcdGlmIChlLm5vZGUuZWxlbWVudCBpbnN0YW5jZW9mIE9sZGVyUmVzdWx0c0VsZW1lbnQgJiYgIWUubm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCB7XG5cdFx0XHRcdFx0b3duZXI6ICdjb25ub3I0MzEyJztcblx0XHRcdFx0XHQvLyB3ZSdyZSBjb25zaWRlcmluZyByZW1vdmluZyBvciBkZXByb21vdGluZyB0aGlzIGZlYXR1cmUgYmVjYXVzZSB3ZSBkb24ndCB0aGluayBpdCdzIHVzZWQ6XG5cdFx0XHRcdFx0Y29tbWVudDogJ1JlY29yZHMgdGhhdCB0ZXN0IGhpc3Rvcnkgd2FzIHVzZWQnO1xuXHRcdFx0XHR9PigndGVzdGluZy5leHBhbmRPbGRlclJlc3VsdHMnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgZ2V0Um9vdENoaWxkcmVuKCkpO1xuXHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMucmVzdWx0cykge1xuXHRcdFx0aWYgKCFyZXN1bHQuY29tcGxldGVkQXQgJiYgcmVzdWx0IGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQpIHtcblx0XHRcdFx0YXR0YWNoVG9SZXN1bHRzKHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcikge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZXZ0OiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SVRyZWVFbGVtZW50IHwgbnVsbD4pIHtcblx0XHRpZiAoIWV2dC5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBhIHJvdyBpcyBjb21wcmVzc2VkIChlLmcuIGEgVGVzdENhc2VFbGVtZW50IGlzIHJlbmRlcmVkIGFsb25nXG5cdFx0Ly8gd2l0aCBpdHMgb25seSBUZXN0TWVzc2FnZUVsZW1lbnQgY2hpbGQpLCB0aGUgcmVuZGVyZXIgc2hvd3MgdGhlIGlubGluZVxuXHRcdC8vIGFjdGlvbiBiYXIgZm9yIHRoZSBwYXJlbnQgZWxlbWVudC4gTWlycm9yIHRoYXQgbG9naWMgaGVyZSBzbyB0aGVcblx0XHQvLyByaWdodC1jbGljayBtZW51IG9mZmVycyB0aGUgc2FtZSBhY3Rpb25zIGFzIHRoZSBpbmxpbmUgYWN0aW9uIGJhclxuXHRcdC8vIHNob3duIG9uIHRoZSB2aXNpYmxlIHJvdy5cblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5nZXRSZW5kZXJlZEVsZW1lbnQoZXZ0LmVsZW1lbnQpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLnRyZWVBY3Rpb25zLnByb3ZpZGVBY3Rpb25CYXIoZWxlbWVudCk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZ0LmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMuc2Vjb25kYXJ5Lmxlbmd0aFxuXHRcdFx0XHQ/IFsuLi5hY3Rpb25zLnByaW1hcnksIG5ldyBTZXBhcmF0b3IoKSwgLi4uYWN0aW9ucy5zZWNvbmRhcnldXG5cdFx0XHRcdDogYWN0aW9ucy5wcmltYXJ5LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGVsZW1lbnQuY29udGV4dCxcblx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5jb250ZXh0TWVudUFjdGlvblJ1bm5lcixcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVuZGVyZWRFbGVtZW50KGVsZW1lbnQ6IElUcmVlRWxlbWVudCk6IElUcmVlRWxlbWVudCB7XG5cdFx0Ly8gU2VlIFRlc3RSdW5FbGVtZW50UmVuZGVyZXIucmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzIGZvciB0aGUgbWF0Y2hpbmdcblx0XHQvLyBsb2dpYyB0aGF0IGRlY2lkZXMgd2hpY2ggZWxlbWVudCBnZXRzIHRoZSBpbmxpbmUgYWN0aW9uIGJhci5cblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgVGFza0VsZW1lbnQpICYmICEoZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RNZXNzYWdlRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb21wcmVzc2VkID0gdGhpcy50cmVlLmdldENvbXByZXNzZWRUcmVlTm9kZShlbGVtZW50IGFzIFRyZWVFbGVtZW50KTtcblx0XHRcdGNvbnN0IGNoYWluID0gY29tcHJlc3NlZC5lbGVtZW50Py5lbGVtZW50cztcblx0XHRcdGlmIChjaGFpbiAmJiBjaGFpbi5sZW5ndGggPj0gMiAmJiBjaGFpbltjaGFpbi5sZW5ndGggLSAxXSA9PT0gZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBwYXJlbnQgPSBjaGFpbltjaGFpbi5sZW5ndGggLSAyXTtcblx0XHRcdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0XHRcdHJldHVybiBwYXJlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGVsZW1lbnQgbWF5IG5vIGxvbmdlciBiZSBpbiB0aGUgdHJlZTsgZmFsbCB0aHJvdWdoXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFRlbXBsYXRlRGF0YSB7XG5cdGxhYmVsOiBIVE1MRWxlbWVudDtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRlbGVtZW50RGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xuXHR0ZW1wbGF0ZURpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgVGVzdFJ1bkVsZW1lbnRSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlLCBUZW1wbGF0ZURhdGE+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0UnVuRWxlbWVudFJlbmRlcmVyJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBUZXN0UnVuRWxlbWVudFJlbmRlcmVyLklEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHJlZUFjdGlvbnM6IFRyZWVBY3Rpb25zUHJvdmlkZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVRyZWVFbGVtZW50PiwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYWluID0gbm9kZS5lbGVtZW50LmVsZW1lbnRzO1xuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gY2hhaW5bY2hhaW4ubGVuZ3RoIC0gMV07XG5cdFx0aWYgKChsYXN0RWxlbWVudCBpbnN0YW5jZW9mIFRhc2tFbGVtZW50IHx8IGxhc3RFbGVtZW50IGluc3RhbmNlb2YgVGVzdE1lc3NhZ2VFbGVtZW50KSAmJiBjaGFpbi5sZW5ndGggPj0gMikge1xuXHRcdFx0dGhpcy5kb1JlbmRlcihjaGFpbltjaGFpbi5sZW5ndGggLSAyXSwgdGVtcGxhdGVEYXRhLCBsYXN0RWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9SZW5kZXIobGFzdEVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Rlc3Rpbmctc3RkdHJlZS1jb250YWluZXInKTtcblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc3RhdGUnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5sYWJlbCcpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoY29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IFNwcmVhZGFibGVBY3Rpb25SdW5uZXIoKSksXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PlxuXHRcdFx0XHRhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvblxuXHRcdFx0XHRcdD8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKGVsZW1lbnREaXNwb3NhYmxlKTtcblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKGFjdGlvbkJhcik7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWNvbixcblx0XHRcdGxhYmVsLFxuXHRcdFx0YWN0aW9uQmFyLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGUsXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGUsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5kb1JlbmRlcihlbGVtZW50LmVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqIENhbGxlZCB0byByZW5kZXIgYSBuZXcgZWxlbWVudCAqL1xuXHRwcml2YXRlIGRvUmVuZGVyKGVsZW1lbnQ6IElUcmVlRWxlbWVudCwgdGVtcGxhdGVEYXRhOiBUZW1wbGF0ZURhdGEsIHN1YmplY3RFbGVtZW50PzogSVRyZWVFbGVtZW50KSB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZChcblx0XHRcdGVsZW1lbnQub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5kb1JlbmRlcihlbGVtZW50LCB0ZW1wbGF0ZURhdGEsIHN1YmplY3RFbGVtZW50KSksXG5cdFx0KTtcblx0XHR0aGlzLmRvUmVuZGVySW5uZXIoZWxlbWVudCwgdGVtcGxhdGVEYXRhLCBzdWJqZWN0RWxlbWVudCk7XG5cdH1cblxuXHQvKiogQ2FsbGVkLCBhbmQgbWF5IGJlIHJlLWNhbGxlZCwgdG8gcmVuZGVyIG9yIHJlLXJlbmRlciBhbiBlbGVtZW50ICovXG5cdHByaXZhdGUgZG9SZW5kZXJJbm5lcihlbGVtZW50OiBJVHJlZUVsZW1lbnQsIHRlbXBsYXRlRGF0YTogVGVtcGxhdGVEYXRhLCBzdWJqZWN0RWxlbWVudDogSVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkKSB7XG5cdFx0bGV0IHsgbGFiZWwsIGxhYmVsV2l0aEljb25zLCBkZXNjcmlwdGlvbiB9ID0gZWxlbWVudDtcblx0XHRpZiAoc3ViamVjdEVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0TWVzc2FnZUVsZW1lbnQpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gc3ViamVjdEVsZW1lbnQubGFiZWw7XG5cdFx0XHRpZiAoZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IGAke2Rlc2NyaXB0aW9ufSBAICR7ZWxlbWVudC5kZXNjcmlwdGlvbn1gO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uRWxlbWVudCA9IGRlc2NyaXB0aW9uID8gZG9tLiQoJ3NwYW4udGVzdC1sYWJlbC1kZXNjcmlwdGlvbicsIHt9LCBkZXNjcmlwdGlvbikgOiAnJztcblx0XHRpZiAobGFiZWxXaXRoSWNvbnMpIHtcblx0XHRcdGRvbS5yZXNldCh0ZW1wbGF0ZURhdGEubGFiZWwsIC4uLmxhYmVsV2l0aEljb25zLCBkZXNjcmlwdGlvbkVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20ucmVzZXQodGVtcGxhdGVEYXRhLmxhYmVsLCBsYWJlbCwgZGVzY3JpcHRpb25FbGVtZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCBpY29uID0gZWxlbWVudC5pY29uO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IGBjb21wdXRlZC1zdGF0ZSAke2ljb24gPyBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbikgOiAnJ31gO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMudHJlZUFjdGlvbnMucHJvdmlkZUFjdGlvbkJhcihlbGVtZW50KTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gZWxlbWVudC5jb250ZXh0O1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChhY3Rpb25zLnByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG59XG5cbmNsYXNzIFRyZWVBY3Rpb25zUHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNob3dSZXZlYWxMb2NhdGlvbk9uTWVzc2FnZXM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXF1ZXN0UmV2ZWFsOiBFbWl0dGVyPEluc3BlY3RTdWJqZWN0Pixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RQcm9maWxlU2VydmljZTogSVRlc3RQcm9maWxlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7IH1cblxuXHRwdWJsaWMgcHJvdmlkZUFjdGlvbkJhcihlbGVtZW50OiBJVHJlZUVsZW1lbnQpIHtcblx0XHRjb25zdCB0ZXN0ID0gZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RDYXNlRWxlbWVudCA/IGVsZW1lbnQudGVzdCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSB0ZXN0ID8gdGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UuY2FwYWJpbGl0aWVzRm9yVGVzdCh0ZXN0Lml0ZW0pIDogMDtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlzOiBbc3RyaW5nLCB1bmtub3duXVtdID0gW1xuXHRcdFx0WydwZWVrJywgVGVzdGluZy5PdXRwdXRQZWVrQ29udHJpYnV0aW9uSWRdLFxuXHRcdFx0W1Rlc3RpbmdDb250ZXh0S2V5cy5wZWVrSXRlbVR5cGUua2V5LCBlbGVtZW50LnR5cGVdLFxuXHRcdF07XG5cblx0XHRsZXQgaWQgPSBNZW51SWQuVGVzdFBlZWtFbGVtZW50O1xuXHRcdGNvbnN0IHByaW1hcnk6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHNlY29uZGFyeTogSUFjdGlvbltdID0gW107XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRhc2tFbGVtZW50KSB7XG5cdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0J3Rlc3Rpbmcub3V0cHV0UGVlay5zaG93UmVzdWx0T3V0cHV0Jyxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3Rpbmcuc2hvd1Jlc3VsdE91dHB1dCcsIFwiU2hvdyBSZXN1bHQgT3V0cHV0XCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50ZXJtaW5hbCksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0KCkgPT4gdGhpcy5yZXF1ZXN0UmV2ZWFsLmZpcmUobmV3IFRhc2tTdWJqZWN0KGVsZW1lbnQucmVzdWx0cywgZWxlbWVudC5pbmRleCkpLFxuXHRcdFx0KSk7XG5cdFx0XHRpZiAoZWxlbWVudC50YXNrLnJ1bm5pbmcpIHtcblx0XHRcdFx0cHJpbWFyeS5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J3Rlc3Rpbmcub3V0cHV0UGVlay5jYW5jZWwnLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmNhbmNlbFJ1bicsICdDYW5jZWwgVGVzdCBSdW4nKSxcblx0XHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbnMudGVzdGluZ0NhbmNlbEljb24pLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlc3RDb21tYW5kSWQuQ2FuY2VsVGVzdFJ1bkFjdGlvbiwgZWxlbWVudC5yZXN1bHRzLmlkLCBlbGVtZW50LnRhc2suaWQpLFxuXHRcdFx0XHQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByaW1hcnkucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsucmVydW4nLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLnJlUnVuTGFzdFJ1bicsICdSZXJ1biBMYXN0IFJ1bicpLFxuXHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy50ZXN0aW5nUmVydW5JY29uKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXN0Q29tbWFuZElkLlJlUnVuTGFzdFJ1biwgZWxlbWVudC5yZXN1bHRzLmlkKSxcblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0Y29uc3QgaGFzRmFpbGVkVGVzdHMgPSBJdGVyYWJsZS5zb21lKGVsZW1lbnQucmVzdWx0cy50ZXN0cywgdGVzdCA9PiBpc0ZhaWxlZFN0YXRlKHRlc3Qub3duQ29tcHV0ZWRTdGF0ZSkpO1xuXHRcdFx0XHRpZiAoaGFzRmFpbGVkVGVzdHMpIHtcblx0XHRcdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsucmVydW5GYWlsZWQnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcucmVSdW5GYWlsZWRGcm9tTGFzdFJ1bicsICdSZXJ1biBGYWlsZWQgVGVzdHMnKSxcblx0XHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy50ZXN0aW5nUmVydW5JY29uKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5SZVJ1bkZhaWxlZEZyb21MYXN0UnVuLCBlbGVtZW50LnJlc3VsdHMuaWQpLFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJpbWFyeS5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J3Rlc3Rpbmcub3V0cHV0UGVlay5kZWJ1ZycsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGVidWdMYXN0UnVuJywgJ0RlYnVnIExhc3QgUnVuJyksXG5cdFx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLnRlc3RpbmdEZWJ1Z0ljb24pLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlc3RDb21tYW5kSWQuRGVidWdMYXN0UnVuLCBlbGVtZW50LnJlc3VsdHMuaWQpLFxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRpZiAoaGFzRmFpbGVkVGVzdHMpIHtcblx0XHRcdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsuZGVidWdGYWlsZWQnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGVidWdGYWlsZWRGcm9tTGFzdFJ1bicsICdEZWJ1ZyBGYWlsZWQgVGVzdHMnKSxcblx0XHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy50ZXN0aW5nRGVidWdJY29uKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5EZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuLCBlbGVtZW50LnJlc3VsdHMuaWQpLFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0UmVzdWx0RWxlbWVudCkge1xuXHRcdFx0Ly8gb25seSBzaG93IGlmIHRoZXJlIGFyZSBubyBjb2xsYXBzZWQgdGVzdCBub2RlcyB0aGF0IGhhdmUgbW9yZSBzcGVjaWZpYyBjaG9pY2VzXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZS50YXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cHJpbWFyeS5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J3Rlc3Rpbmcub3V0cHV0UGVlay5zaG93UmVzdWx0T3V0cHV0Jyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5zaG93UmVzdWx0T3V0cHV0JywgXCJTaG93IFJlc3VsdCBPdXRwdXRcIiksXG5cdFx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udGVybWluYWwpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLnJlcXVlc3RSZXZlYWwuZmlyZShuZXcgVGFza1N1YmplY3QoZWxlbWVudC52YWx1ZSwgMCkpLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblxuXHRcdFx0cHJpbWFyeS5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsucmVSdW5MYXN0UnVuJyxcblx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcucmVSdW5UZXN0JywgXCJSZXJ1biBUZXN0XCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbnMudGVzdGluZ1J1bkljb24pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3Rlc3RpbmcucmVSdW5MYXN0UnVuJywgZWxlbWVudC52YWx1ZS5pZCksXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgaGFzRmFpbGVkVGVzdHMgPSBJdGVyYWJsZS5zb21lKGVsZW1lbnQudmFsdWUudGVzdHMsIHRlc3QgPT4gaXNGYWlsZWRTdGF0ZSh0ZXN0Lm93bkNvbXB1dGVkU3RhdGUpKTtcblx0XHRcdGlmIChoYXNGYWlsZWRUZXN0cykge1xuXHRcdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHQndGVzdGluZy5vdXRwdXRQZWVrLnJlcnVuRmFpbGVkUmVzdWx0Jyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5yZVJ1bkZhaWxlZEZyb21MYXN0UnVuJywgJ1JlcnVuIEZhaWxlZCBUZXN0cycpLFxuXHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy50ZXN0aW5nUmVydW5JY29uKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXN0Q29tbWFuZElkLlJlUnVuRmFpbGVkRnJvbUxhc3RSdW4sIGVsZW1lbnQudmFsdWUuaWQpLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhcGFiaWxpdGllcyAmIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnKSB7XG5cdFx0XHRcdHByaW1hcnkucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsuZGVidWdMYXN0UnVuJyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5kZWJ1Z1Rlc3QnLCBcIkRlYnVnIFRlc3RcIiksXG5cdFx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLnRlc3RpbmdEZWJ1Z0ljb24pLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd0ZXN0aW5nLmRlYnVnTGFzdFJ1bicsIGVsZW1lbnQudmFsdWUuaWQpLFxuXHRcdFx0XHQpKTtcblxuXHRcdFx0XHRpZiAoaGFzRmFpbGVkVGVzdHMpIHtcblx0XHRcdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsuZGVidWdGYWlsZWRSZXN1bHQnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZGVidWdGYWlsZWRGcm9tTGFzdFJ1bicsICdEZWJ1ZyBGYWlsZWQgVGVzdHMnKSxcblx0XHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy50ZXN0aW5nRGVidWdJY29uKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5EZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuLCBlbGVtZW50LnZhbHVlLmlkKSxcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGVzdENhc2VFbGVtZW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0TWVzc2FnZUVsZW1lbnQpIHtcblx0XHRcdGNvbnRleHRLZXlzLnB1c2goXG5cdFx0XHRcdFtUZXN0aW5nQ29udGV4dEtleXMudGVzdFJlc3VsdE91dGRhdGVkLmtleSwgZWxlbWVudC50ZXN0LnJldGlyZWRdLFxuXHRcdFx0XHRbVGVzdGluZ0NvbnRleHRLZXlzLnRlc3RSZXN1bHRTdGF0ZS5rZXksIHRlc3RSZXN1bHRTdGF0ZVRvQ29udGV4dFZhbHVlc1tlbGVtZW50LnRlc3Qub3duQ29tcHV0ZWRTdGF0ZV1dLFxuXHRcdFx0XHQuLi5nZXRUZXN0SXRlbUNvbnRleHRPdmVybGF5KGVsZW1lbnQudGVzdCwgY2FwYWJpbGl0aWVzKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHsgZXh0SWQsIHVyaSB9ID0gZWxlbWVudC50ZXN0Lml0ZW07XG5cdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdHByaW1hcnkucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsuZ29Ub1Rlc3QnLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmdvVG9UZXN0JywgXCJHbyB0byBUZXN0XCIpLFxuXHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdvVG9GaWxlKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLnJldmVhbFRlc3QnLCBleHRJZCksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC50ZXN0LnRhc2tzW2VsZW1lbnQudGFza0luZGV4XS5tZXNzYWdlcy5zb21lKG0gPT4gbS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0KSkge1xuXHRcdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHQndGVzdGluZy5vdXRwdXRQZWVrLnNob3dSZXN1bHRPdXRwdXQnLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLnNob3dSZXN1bHRPdXRwdXQnLCBcIlNob3cgUmVzdWx0IE91dHB1dFwiKSxcblx0XHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50ZXJtaW5hbCksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdCgpID0+IHRoaXMucmVxdWVzdFJldmVhbC5maXJlKGVsZW1lbnQub3V0cHV0U3ViamVjdCksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZWNvbmRhcnkucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHQndGVzdGluZy5vdXRwdXRQZWVrLnJldmVhbEluRXhwbG9yZXInLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5yZXZlYWxJbkV4cGxvcmVyJywgXCJSZXZlYWwgaW4gVGVzdCBFeHBsb3JlclwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ubGlzdFRyZWUpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19yZXZlYWxUZXN0SW5FeHBsb3JlcicsIGV4dElkKSxcblx0XHRcdCkpO1xuXG5cdFx0XHRpZiAoY2FwYWJpbGl0aWVzICYgVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuKSB7XG5cdFx0XHRcdHByaW1hcnkucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsucnVuVGVzdCcsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3J1biB0ZXN0JywgJ1J1biBUZXN0JyksXG5cdFx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLnRlc3RpbmdSdW5JY29uKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLnJ1blRlc3RzQnlJZCcsIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgZXh0SWQpLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhcGFiaWxpdGllcyAmIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnKSB7XG5cdFx0XHRcdHByaW1hcnkucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCd0ZXN0aW5nLm91dHB1dFBlZWsuZGVidWdUZXN0Jyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZGVidWcgdGVzdCcsICdEZWJ1ZyBUZXN0JyksXG5cdFx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLnRlc3RpbmdEZWJ1Z0ljb24pLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUucnVuVGVzdHNCeUlkJywgVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsIGV4dElkKSxcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RNZXNzYWdlRWxlbWVudCkge1xuXHRcdFx0aWQgPSBNZW51SWQuVGVzdE1lc3NhZ2VDb250ZXh0O1xuXHRcdFx0Y29udGV4dEtleXMucHVzaChbVGVzdGluZ0NvbnRleHRLZXlzLnRlc3RNZXNzYWdlQ29udGV4dC5rZXksIGVsZW1lbnQuY29udGV4dFZhbHVlXSk7XG5cblx0XHRcdGlmICh0aGlzLnNob3dSZXZlYWxMb2NhdGlvbk9uTWVzc2FnZXMgJiYgZWxlbWVudC5sb2NhdGlvbikge1xuXHRcdFx0XHRwcmltYXJ5LnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHQndGVzdGluZy5vdXRwdXRQZWVrLmdvVG9FcnJvcicsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3Rlc3RpbmcuZ29Ub0Vycm9yJywgXCJHbyB0byBFcnJvclwiKSxcblx0XHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kZWJ1Z1N0YWNrZnJhbWUpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogZWxlbWVudC5sb2NhdGlvbiEudXJpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb246IGVsZW1lbnQubG9jYXRpb24hLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdGNvbnN0IGNvbnRleHRPdmVybGF5ID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGNvbnRleHRLZXlzKTtcblx0XHRjb25zdCByZXN1bHQgPSB7IHByaW1hcnksIHNlY29uZGFyeSB9O1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKGlkLCBjb250ZXh0T3ZlcmxheSwgeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKG1lbnUsIHJlc3VsdCwgJ2lubGluZScpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgQ3JlYXRpb25DYWNoZTxUPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdiA9IG5ldyBXZWFrTWFwPG9iamVjdCwgVD4oKTtcblxuXHRwdWJsaWMgZ2V0PFQyIGV4dGVuZHMgVCA9IFQ+KGtleTogb2JqZWN0KTogVDIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnYuZ2V0KGtleSkgYXMgVDIgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3JDcmVhdGU8VDIgZXh0ZW5kcyBUPihyZWY6IG9iamVjdCwgZmFjdG9yeTogKCkgPT4gVDIpOiBUMiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnYuZ2V0KHJlZik7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcgYXMgVDI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnJlc2ggPSBmYWN0b3J5KCk7XG5cdFx0dGhpcy52LnNldChyZWYsIGZyZXNoKTtcblx0XHRyZXR1cm4gZnJlc2g7XG5cdH1cbn1cblxuY29uc3QgZmlyc3RMaW5lID0gKHN0cjogc3RyaW5nKSA9PiB7XG5cdGNvbnN0IGluZGV4ID0gc3RyLmluZGV4T2YoJ1xcbicpO1xuXHRyZXR1cm4gaW5kZXggPT09IC0xID8gc3RyIDogc3RyLnNsaWNlKDAsIGluZGV4KTtcbn07XG5cblxuXG5jbGFzcyBBY3Rpb25TcHJlYWRBcmdzPFQgZXh0ZW5kcyB1bmtub3duW10+IHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHZhbHVlOiBUKSB7IH1cbn1cblxuY2xhc3MgU3ByZWFkYWJsZUFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0IGluc3RhbmNlb2YgQWN0aW9uU3ByZWFkQXJncykge1xuXHRcdFx0YXdhaXQgYWN0aW9uLnJ1biguLi5jb250ZXh0LnZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgYWN0aW9uLnJ1bihjb250ZXh0KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNEJBQTRCO0FBS3JDLFNBQVMsUUFBUSxjQUF1QixpQkFBaUI7QUFDekQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFh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QWE7QUFBQSxVQUMzQyxVQUFVLFlBQVksUUFBUSxlQUFlO0FBQUEsVUFDN0M7QUFBQSxVQUNBLE1BQU0sS0FBSyxjQUFjLFdBQVc7QUFBQSxZQUNuQyxVQUFVLFFBQVEsU0FBVTtBQUFBLFlBQzVCLFNBQVM7QUFBQSxjQUNSLFdBQVcsUUFBUSxTQUFVO0FBQUEsY0FDN0IsZUFBZTtBQUFBLFlBQ2hCO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFHQSxVQUFNLGlCQUFpQixLQUFLLGtCQUFrQixjQUFjLFdBQVc7QUFDdkUsVUFBTSxTQUFTLEVBQUUsU0FBUyxVQUFVO0FBQ3BDLFVBQU0sT0FBTyxLQUFLLFlBQVksZUFBZSxJQUFJLGdCQUFnQixFQUFFLG1CQUFtQixLQUFLLENBQUM7QUFDNUYsMkJBQXVCLE1BQU0sUUFBUSxRQUFRO0FBQzdDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUExTk0sc0JBQU47QUFBQSxFQUlHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUkc7QUE0Tk4sTUFBTSxjQUFpQjtBQUFBLEVBQXZCO0FBQ0MsU0FBaUIsSUFBSSxvQkFBSSxRQUFtQjtBQUFBO0FBQUEsRUFFckMsSUFBc0IsS0FBNkI7QUFDekQsV0FBTyxLQUFLLEVBQUUsSUFBSSxHQUFHO0FBQUEsRUFDdEI7QUFBQSxFQUVPLFlBQTBCLEtBQWEsU0FBdUI7QUFDcEUsVUFBTSxXQUFXLEtBQUssRUFBRSxJQUFJLEdBQUc7QUFDL0IsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsUUFBUTtBQUN0QixTQUFLLEVBQUUsSUFBSSxLQUFLLEtBQUs7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLE1BQU0sWUFBWSxDQUFDLFFBQWdCO0FBQ2xDLFFBQU0sUUFBUSxJQUFJLFFBQVEsSUFBSTtBQUM5QixTQUFPLFVBQVUsS0FBSyxNQUFNLElBQUksTUFBTSxHQUFHLEtBQUs7QUFDL0M7QUFJQSxNQUFNLGlCQUFzQztBQUFBLEVBQzNDLFlBQTRCLE9BQVU7QUFBVjtBQUFBLEVBQVk7QUFDekM7QUFFQSxNQUFNLCtCQUErQixhQUFhO0FBQUEsRUFDakQsTUFBeUIsVUFBVSxRQUFpQixTQUFrQztBQUNyRixRQUFJLG1CQUFtQixrQkFBa0I7QUFDeEMsWUFBTSxPQUFPLElBQUksR0FBRyxRQUFRLEtBQUs7QUFBQSxJQUNsQyxPQUFPO0FBQ04sWUFBTSxPQUFPLElBQUksT0FBTztBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJ0ZXN0IiwgInJlc3VsdHMiXQp9Cg==
