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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { DefaultKeyboardNavigationDelegate } from "../../../../base/browser/ui/list/listWidget.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { Action, ActionRunner, Separator, toAction } from "../../../../base/common/actions.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { RunOnceScheduler, disposableTimeout } from "../../../../base/common/async.js";
import { groupBy } from "../../../../base/common/collections.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { compareFileNames } from "../../../../base/common/comparers.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableFromEvent } from "../../../../base/common/observable.js";
import { fuzzyContains } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isDefined } from "../../../../base/common/types.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../nls.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { MenuEntryActionViewItem, createActionViewItem, getActionBarActions, getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { UnmanagedProgress } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { spinningLoading } from "../../../../platform/theme/common/iconRegistry.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IActivityService, IconBadge, NumberBadge } from "../../../services/activity/common/activity.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { TestingConfigKeys, TestingCountBadge, getTestingConfiguration } from "../common/configuration.js";
import { TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing, labelForTestInState } from "../common/constants.js";
import { StoredValue } from "../common/storedValue.js";
import { ITestExplorerFilterState, TestFilterTerm } from "../common/testExplorerFilterState.js";
import { TestId } from "../common/testId.js";
import { ITestProfileService, canUseProfileWithTest } from "../common/testProfileService.js";
import { LiveTestResult, TestResultItemChangeReason } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService, testCollectionIsEmpty } from "../common/testService.js";
import { TestControllerCapability, TestItemExpandState, TestResultState, TestRunProfileBitset, testProfileBitset, testResultStateToContextValues } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { ITestingContinuousRunService } from "../common/testingContinuousRunService.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { collectTestStateCounts, getTestProgressText } from "../common/testingProgressMessages.js";
import { cmpPriority, isFailedState, isStateWithResult, statesInOrder } from "../common/testingStates.js";
import { TestItemTreeElement, TestTreeErrorMessage } from "./explorerProjections/index.js";
import { ListProjection } from "./explorerProjections/listProjection.js";
import { getTestItemContextOverlay } from "./explorerProjections/testItemContextOverlay.js";
import { TestingObjectTree } from "./explorerProjections/testingObjectTree.js";
import { TreeProjection } from "./explorerProjections/treeProjection.js";
import * as icons from "./icons.js";
import "./media/testing.css";
import { DebugLastRun, ReRunLastRun } from "./testExplorerActions.js";
import { TestingExplorerFilter } from "./testingExplorerFilter.js";
var LastFocusState = /* @__PURE__ */ ((LastFocusState2) => {
  LastFocusState2[LastFocusState2["Input"] = 0] = "Input";
  LastFocusState2[LastFocusState2["Tree"] = 1] = "Tree";
  return LastFocusState2;
})(LastFocusState || {});
let TestingExplorerView = class extends ViewPane {
  constructor(options, contextMenuService, keybindingService, configurationService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, testService, hoverService, testProfileService, commandService, menuService, crService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.testService = testService;
    this.testProfileService = testProfileService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.crService = crService;
    this.filterActionBar = this._register(new MutableDisposable());
    this.discoveryProgress = this._register(new MutableDisposable());
    this.filter = this._register(new MutableDisposable());
    this.filterFocusListener = this._register(new MutableDisposable());
    this.dimensions = { width: 0, height: 0 };
    this.lastFocusState = 0 /* Input */;
    const relayout = this._register(new RunOnceScheduler(() => this.layoutBody(), 1));
    this._register(this.onDidChangeViewWelcomeState(() => {
      if (!this.shouldShowWelcome()) {
        relayout.schedule();
      }
    }));
    this._register(Event.any(crService.onDidChange, testProfileService.onDidChange)(() => {
      this.updateActions();
    }));
    this._register(testService.collection.onBusyProvidersChange((busy) => {
      this.updateDiscoveryProgress(busy);
    }));
    this._register(testProfileService.onDidChange(() => this.updateActions()));
  }
  get focusedTreeElements() {
    return this.viewModel.tree.getFocus().filter(isDefined);
  }
  shouldShowWelcome() {
    return this.viewModel?.welcomeExperience === 1 /* ForWorkspace */;
  }
  focus() {
    super.focus();
    if (this.lastFocusState === 1 /* Tree */) {
      this.viewModel.tree.domFocus();
    } else {
      this.filter.value?.focus();
    }
  }
  /**
   * Gets include/exclude items in the tree, based either on visible tests
   * or a use selection. If a profile is given, only tests in that profile
   * are collected. If a bitset is given, any test that can run in that
   * bitset is collected.
   */
  getTreeIncludeExclude(profileOrBitset, withinItems, filterToType = "visible") {
    const projection = this.viewModel.projection.value;
    if (!projection) {
      return { include: [], exclude: [] };
    }
    const include = /* @__PURE__ */ new Set();
    const exclude = [];
    const runnableWithProfileOrBitset = /* @__PURE__ */ new Map();
    const isRunnableWithProfileOrBitset = (item) => {
      let value = runnableWithProfileOrBitset.get(item);
      if (value === void 0) {
        value = typeof profileOrBitset === "number" ? !!this.testProfileService.getDefaultProfileForTest(profileOrBitset, item) : canUseProfileWithTest(profileOrBitset, item);
        runnableWithProfileOrBitset.set(item, value);
      }
      return value;
    };
    const attempt = (element, alreadyIncluded) => {
      if (!(element instanceof TestItemTreeElement) || !this.viewModel.tree.hasElement(element)) {
        return;
      }
      const inTree = this.viewModel.tree.getNode(element);
      if (!inTree.visible) {
        if (alreadyIncluded) {
          exclude.push(element.test);
        }
        return;
      }
      const visibleRunnableChildren = inTree.children.filter(
        (c) => c.visible && c.element instanceof TestItemTreeElement && isRunnableWithProfileOrBitset(c.element.test)
      ).length;
      if (
        // If it's not already included...
        !alreadyIncluded && isRunnableWithProfileOrBitset(element.test) && (visibleRunnableChildren === 0 || visibleRunnableChildren * 2 >= inTree.children.length) && visibleRunnableChildren !== 1
      ) {
        include.add(element.test);
        alreadyIncluded = true;
      }
      for (const child of element.children) {
        attempt(child, alreadyIncluded);
      }
    };
    if (filterToType === "selected") {
      const sel = this.viewModel.tree.getSelection().filter(isDefined);
      if (sel.length) {
        L:
          for (const node of sel) {
            if (node instanceof TestItemTreeElement) {
              for (let i = node; i; i = i.parent) {
                if (include.has(i.test)) {
                  continue L;
                }
              }
              include.add(node.test);
              node.children.forEach((c) => attempt(c, true));
            }
          }
        return { include: [...include], exclude };
      }
    }
    for (const root of withinItems || this.testService.collection.rootItems) {
      const element = projection.getElementByTestId(root.item.extId);
      if (!element) {
        continue;
      }
      if (typeof profileOrBitset === "object" && !canUseProfileWithTest(profileOrBitset, root)) {
        continue;
      }
      include.add(element.test);
      element.children.forEach((c) => attempt(c, true));
    }
    return { include: [...include], exclude };
  }
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "testingExplorerView",
      focusNotifiers: [this],
      focusNextWidget: () => {
        if (!this.viewModel.tree.isDOMFocused()) {
          this.viewModel.tree.domFocus();
        }
      },
      focusPreviousWidget: () => {
        if (this.viewModel.tree.isDOMFocused()) {
          this.filter.value?.focus();
        }
      }
    }));
  }
  /**
   * @override
   */
  renderBody(container) {
    super.renderBody(container);
    this.container = dom.append(container, dom.$(".test-explorer"));
    this.treeHeader = dom.append(this.container, dom.$(".test-explorer-header"));
    this.filterActionBar.value = this.createFilterActionBar();
    const messagesContainer = dom.append(this.treeHeader, dom.$(".result-summary-container"));
    this._register(this.instantiationService.createInstance(ResultSummaryView, messagesContainer));
    const listContainer = dom.append(this.container, dom.$(".test-explorer-tree"));
    this.viewModel = this.instantiationService.createInstance(TestingExplorerViewModel, listContainer, this.onDidChangeBodyVisibility);
    this._register(this.viewModel.tree.onDidFocus(() => this.lastFocusState = 1 /* Tree */));
    this._register(this.viewModel.onChangeWelcomeVisibility(() => this._onDidChangeViewWelcomeState.fire()));
    this._register(this.viewModel);
    this._onDidChangeViewWelcomeState.fire();
  }
  /** @override  */
  createActionViewItem(action, options) {
    switch (action.id) {
      case TestCommandId.FilterAction:
        this.filter.value = this.instantiationService.createInstance(TestingExplorerFilter, action, options);
        this.filterFocusListener.value = this.filter.value.onDidFocus(() => this.lastFocusState = 0 /* Input */);
        return this.filter.value;
      case TestCommandId.RunSelectedAction:
        return this.getRunGroupDropdown(TestRunProfileBitset.Run, action, options);
      case TestCommandId.DebugSelectedAction:
        return this.getRunGroupDropdown(TestRunProfileBitset.Debug, action, options);
      case TestCommandId.CoverageSelectedAction:
        return this.getRunGroupDropdown(TestRunProfileBitset.Coverage, action, options);
      case TestCommandId.StartContinousRun:
      case TestCommandId.StopContinousRun:
        return this.getContinuousRunDropdown(action, options);
      default:
        return super.createActionViewItem(action, options);
    }
  }
  /** @inheritdoc */
  getTestConfigGroupActions(group) {
    const profileActions = [];
    let participatingGroups = 0;
    let participatingProfiles = 0;
    let hasConfigurable = false;
    const defaults = this.testProfileService.getGroupDefaultProfiles(group);
    for (const { profiles, controller } of this.testProfileService.all()) {
      let hasAdded = false;
      for (const profile of profiles) {
        if (profile.group !== group) {
          continue;
        }
        if (!hasAdded) {
          hasAdded = true;
          participatingGroups++;
          profileActions.push(toAction({ id: `${controller.id}.$root`, label: controller.label.get(), enabled: false, checked: false, run: () => {
          } }));
        }
        hasConfigurable = hasConfigurable || profile.hasConfigurationHandler;
        participatingProfiles++;
        profileActions.push(toAction({
          id: `${controller.id}.${profile.profileId}`,
          label: defaults.includes(profile) ? localize("defaultTestProfile", "{0} (Default)", profile.label) : profile.label,
          run: () => {
            const { include, exclude } = this.getTreeIncludeExclude(profile);
            this.testService.runResolvedTests({
              exclude: exclude.map((e) => e.item.extId),
              group: profile.group,
              targets: [{
                profileId: profile.profileId,
                controllerId: profile.controllerId,
                testIds: include.map((i) => i.item.extId)
              }]
            });
          }
        }));
      }
    }
    const contextKeys = [];
    if (group === TestRunProfileBitset.Run) {
      contextKeys.push(["testing.profile.context.group", "run"]);
    }
    if (group === TestRunProfileBitset.Debug) {
      contextKeys.push(["testing.profile.context.group", "debug"]);
    }
    if (group === TestRunProfileBitset.Coverage) {
      contextKeys.push(["testing.profile.context.group", "coverage"]);
    }
    const key = this.contextKeyService.createOverlay(contextKeys);
    const menu = this.menuService.getMenuActions(MenuId.TestProfilesContext, key);
    const menuActions = getFlatContextMenuActions(menu);
    const postActions = [];
    if (participatingProfiles > 1) {
      postActions.push(toAction({
        id: "selectDefaultTestConfigurations",
        label: localize("selectDefaultConfigs", "Select Default Profile"),
        run: () => this.commandService.executeCommand(TestCommandId.SelectDefaultTestProfiles, group)
      }));
    }
    if (hasConfigurable) {
      postActions.push(toAction({
        id: "configureTestProfiles",
        label: localize("configureTestProfiles", "Configure Test Profiles"),
        run: () => this.commandService.executeCommand(TestCommandId.ConfigureTestProfilesAction, group)
      }));
    }
    return {
      numberOfProfiles: participatingProfiles,
      actions: menuActions.length > 0 ? Separator.join(profileActions, menuActions, postActions) : Separator.join(profileActions, postActions)
    };
  }
  /**
   * @override
   */
  saveState() {
    this.filter.value?.saveState();
    super.saveState();
  }
  getRunGroupDropdown(group, defaultAction, options) {
    const dropdownActions = this.getTestConfigGroupActions(group);
    if (dropdownActions.numberOfProfiles < 2) {
      return super.createActionViewItem(defaultAction, options);
    }
    const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
      id: defaultAction.id,
      title: defaultAction.label,
      icon: group === TestRunProfileBitset.Run ? icons.testingRunAllIcon : group === TestRunProfileBitset.Debug ? icons.testingDebugAllIcon : icons.testingCoverageAllIcon
    }, void 0, void 0, void 0, void 0);
    return this.instantiationService.createInstance(
      DropdownWithPrimaryActionViewItem,
      primaryAction,
      this.getDropdownAction(),
      dropdownActions.actions,
      "",
      options
    );
  }
  getDropdownAction() {
    return new Action("selectRunConfig", localize("testingSelectConfig", "Select Configuration..."), "codicon-chevron-down", true);
  }
  getContinuousRunDropdown(defaultAction, options) {
    const allProfiles = [...Iterable.flatMap(this.testProfileService.all(), (cr) => {
      if (this.testService.collection.getNodeById(cr.controller.id)?.children.size) {
        return Iterable.filter(cr.profiles, (p) => p.supportsContinuousRun);
      }
      return Iterable.empty();
    })];
    if (allProfiles.length <= 1) {
      return super.createActionViewItem(defaultAction, options);
    }
    const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
      id: defaultAction.id,
      title: defaultAction.label,
      icon: defaultAction.id === TestCommandId.StartContinousRun ? icons.testingTurnContinuousRunOn : icons.testingTurnContinuousRunOff
    }, void 0, void 0, void 0, void 0);
    const dropdownActions = [];
    const groups = groupBy(allProfiles, (p) => p.group);
    const crService = this.crService;
    for (const group of [TestRunProfileBitset.Run, TestRunProfileBitset.Debug, TestRunProfileBitset.Coverage]) {
      const profiles = groups[group];
      if (!profiles) {
        continue;
      }
      if (Object.keys(groups).length > 1) {
        dropdownActions.push({
          id: `${group}.label`,
          label: testProfileBitset[group],
          enabled: false,
          class: void 0,
          tooltip: testProfileBitset[group],
          run: () => {
          }
        });
      }
      for (const profile of profiles) {
        dropdownActions.push({
          id: `${group}.${profile.profileId}`,
          label: profile.label,
          enabled: true,
          class: void 0,
          tooltip: profile.label,
          checked: crService.isEnabledForProfile(profile),
          run: () => crService.isEnabledForProfile(profile) ? crService.stopProfile(profile) : crService.start([profile])
        });
      }
    }
    return this.instantiationService.createInstance(
      DropdownWithPrimaryActionViewItem,
      primaryAction,
      this.getDropdownAction(),
      dropdownActions,
      "",
      options
    );
  }
  createFilterActionBar() {
    const bar = new ActionBar(this.treeHeader, {
      actionViewItemProvider: (action, options) => this.createActionViewItem(action, options),
      triggerKeys: { keyDown: false, keys: [] }
    });
    bar.push(new Action(TestCommandId.FilterAction));
    bar.getContainer().classList.add("testing-filter-action-bar");
    return bar;
  }
  updateDiscoveryProgress(busy) {
    if (!busy && this.discoveryProgress) {
      this.discoveryProgress.clear();
    } else if (busy && !this.discoveryProgress.value) {
      this.discoveryProgress.value = this.instantiationService.createInstance(UnmanagedProgress, { location: this.getProgressLocation() });
    }
  }
  /**
   * @override
   */
  layoutBody(height = this.dimensions.height, width = this.dimensions.width) {
    super.layoutBody(height, width);
    this.dimensions.height = height;
    this.dimensions.width = width;
    this.container.style.height = `${height}px`;
    this.viewModel?.layout(height - this.treeHeader.clientHeight, width);
    this.filter.value?.layout(width);
  }
};
TestingExplorerView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITestService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, ITestProfileService),
  __decorateParam(12, ICommandService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, ITestingContinuousRunService)
], TestingExplorerView);
const SUMMARY_RENDER_INTERVAL = 200;
let ResultSummaryView = class extends Disposable {
  constructor(container, resultService, activityService, crService, configurationService, instantiationService, hoverService) {
    super();
    this.container = container;
    this.resultService = resultService;
    this.activityService = activityService;
    this.crService = crService;
    this.elementsWereAttached = false;
    this.badgeDisposable = this._register(new MutableDisposable());
    this.renderLoop = this._register(new RunOnceScheduler(() => this.render(), SUMMARY_RENDER_INTERVAL));
    this.elements = dom.h("div.result-summary", [
      dom.h("div@status"),
      dom.h("div@count"),
      dom.h("div@count"),
      dom.h("span"),
      dom.h("duration@duration"),
      dom.h("a@rerun")
    ]);
    this.badgeType = configurationService.getValue(TestingConfigKeys.CountBadge);
    this._register(resultService.onResultsChanged(this.render, this));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.CountBadge)) {
        this.badgeType = configurationService.getValue(TestingConfigKeys.CountBadge);
        this.render();
      }
    }));
    this.countHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.elements.count, ""));
    const ab = this._register(new ActionBar(this.elements.rerun, {
      actionViewItemProvider: (action, options) => createActionViewItem(instantiationService, action, options)
    }));
    ab.push(instantiationService.createInstance(
      MenuItemAction,
      { ...new ReRunLastRun().desc, icon: icons.testingRerunIcon },
      { ...new DebugLastRun().desc, icon: icons.testingDebugIcon },
      {},
      void 0,
      void 0
    ), { icon: true, label: false });
    this.render();
  }
  render() {
    const { results } = this.resultService;
    const { count, root, status, duration, rerun } = this.elements;
    if (!results.length) {
      if (this.elementsWereAttached) {
        root.remove();
        this.elementsWereAttached = false;
      }
      this.container.innerText = localize("noResults", "No test results yet.");
      this.badgeDisposable.clear();
      return;
    }
    const live = results.filter((r) => !r.completedAt);
    let counts;
    if (live.length) {
      status.className = ThemeIcon.asClassName(spinningLoading);
      counts = collectTestStateCounts(true, live);
      this.renderLoop.schedule();
      const last = live[live.length - 1];
      duration.textContent = formatDuration(Date.now() - last.startedAt);
      rerun.style.display = "none";
    } else {
      const last = results[0];
      const dominantState = mapFindFirst(statesInOrder, (s) => last.counts[s] > 0 ? s : void 0);
      status.className = ThemeIcon.asClassName(icons.testingStatesToIcons.get(dominantState ?? TestResultState.Unset));
      counts = collectTestStateCounts(false, [last]);
      duration.textContent = last instanceof LiveTestResult ? formatDuration(last.completedAt - last.startedAt) : "";
      rerun.style.display = "block";
    }
    count.textContent = `${counts.passed}/${counts.totalWillBeRun}`;
    this.countHover.update(getTestProgressText(counts));
    this.renderActivityBadge(counts, live.length > 0);
    if (!this.elementsWereAttached) {
      dom.clearNode(this.container);
      this.container.appendChild(root);
      this.elementsWereAttached = true;
    }
  }
  renderActivityBadge(countSummary, isRunning) {
    if (isRunning) {
      if (this.badgeDisposable.value && this.lastBadge instanceof IconBadge && this.lastBadge.icon === spinningLoading) {
        return;
      }
      this.lastBadge = new IconBadge(spinningLoading, () => localize("testingRunningBadge", "Tests are running"));
    } else if (countSummary && this.badgeType !== TestingCountBadge.Off && countSummary[this.badgeType] !== 0) {
      if (this.badgeDisposable.value && this.lastBadge instanceof NumberBadge && this.lastBadge.number === countSummary[this.badgeType]) {
        return;
      }
      this.lastBadge = new NumberBadge(countSummary[this.badgeType], (num) => this.getLocalizedBadgeString(this.badgeType, num));
    } else if (this.crService.isEnabled()) {
      if (this.badgeDisposable.value && this.lastBadge instanceof IconBadge && this.lastBadge.icon === icons.testingContinuousIsOn) {
        return;
      }
      this.lastBadge = new IconBadge(icons.testingContinuousIsOn, () => localize("testingContinuousBadge", "Tests are being watched for changes"));
    } else {
      if (!this.lastBadge) {
        return;
      }
      this.lastBadge = void 0;
    }
    this.badgeDisposable.value = this.lastBadge && this.activityService.showViewActivity(Testing.ExplorerViewId, { badge: this.lastBadge });
  }
  getLocalizedBadgeString(countBadgeType, count) {
    switch (countBadgeType) {
      case TestingCountBadge.Passed:
        return localize("testingCountBadgePassed", "{0} passed tests", count);
      case TestingCountBadge.Skipped:
        return localize("testingCountBadgeSkipped", "{0} skipped tests", count);
      default:
        return localize("testingCountBadgeFailed", "{0} failed tests", count);
    }
  }
};
ResultSummaryView = __decorateClass([
  __decorateParam(1, ITestResultService),
  __decorateParam(2, IActivityService),
  __decorateParam(3, ITestingContinuousRunService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IHoverService)
], ResultSummaryView);
var WelcomeExperience = /* @__PURE__ */ ((WelcomeExperience2) => {
  WelcomeExperience2[WelcomeExperience2["None"] = 0] = "None";
  WelcomeExperience2[WelcomeExperience2["ForWorkspace"] = 1] = "ForWorkspace";
  WelcomeExperience2[WelcomeExperience2["ForDocument"] = 2] = "ForDocument";
  return WelcomeExperience2;
})(WelcomeExperience || {});
let TestingExplorerViewModel = class extends Disposable {
  constructor(listContainer, onDidChangeVisibility, configurationService, editorService, editorGroupsService, menuService, contextMenuService, testService, filterState, instantiationService, storageService, contextKeyService, testResults, peekOpener, testProfileService, crService, commandService) {
    super();
    this.menuService = menuService;
    this.contextMenuService = contextMenuService;
    this.testService = testService;
    this.filterState = filterState;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.testResults = testResults;
    this.peekOpener = peekOpener;
    this.testProfileService = testProfileService;
    this.crService = crService;
    this.projection = this._register(new MutableDisposable());
    this.revealTimeout = this._register(new MutableDisposable());
    this.welcomeVisibilityEmitter = this._register(new Emitter());
    this.actionRunner = this._register(new TestExplorerActionRunner(() => this.tree.getSelection().filter(isDefined)));
    /**
     * Whether there's a reveal request which has not yet been delivered. This
     * can happen if the user asks to reveal before the test tree is loaded.
     * We check to see if the reveal request is present on each tree update,
     * and do it then if so.
     */
    this.hasPendingReveal = false;
    /**
     * Fires when the visibility of the placeholder state changes.
     */
    this.onChangeWelcomeVisibility = this.welcomeVisibilityEmitter.event;
    /**
     * Gets whether the welcome should be visible.
     */
    this.welcomeExperience = 0 /* None */;
    this.hasPendingReveal = !!filterState.reveal.get();
    this.noTestForDocumentWidget = this._register(instantiationService.createInstance(NoTestsForDocumentWidget, listContainer));
    this.lastViewState = this._register(new StoredValue({
      key: "testing.treeState",
      scope: StorageScope.WORKSPACE,
      target: StorageTarget.MACHINE
    }, this.storageService));
    this._viewMode = TestingContextKeys.viewMode.bindTo(contextKeyService);
    this._viewSorting = TestingContextKeys.viewSorting.bindTo(contextKeyService);
    this._viewMode.set(this.storageService.get("testing.viewMode", StorageScope.WORKSPACE, TestExplorerViewMode.Tree));
    this._viewSorting.set(this.storageService.get("testing.viewSorting", StorageScope.WORKSPACE, TestExplorerViewSorting.ByLocation));
    this.reevaluateWelcomeState();
    this.filter = this.instantiationService.createInstance(TestsFilter, testService.collection);
    this.tree = instantiationService.createInstance(
      TestingObjectTree,
      "Test Explorer List",
      listContainer,
      new ListDelegate(),
      [
        instantiationService.createInstance(TestItemRenderer, this.actionRunner),
        instantiationService.createInstance(ErrorRenderer)
      ],
      {
        identityProvider: instantiationService.createInstance(IdentityProvider),
        hideTwistiesOfChildlessElements: false,
        sorter: instantiationService.createInstance(TreeSorter, this),
        keyboardNavigationLabelProvider: instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
        accessibilityProvider: instantiationService.createInstance(ListAccessibilityProvider),
        filter: this.filter,
        findWidgetEnabled: false
      }
    );
    const collapseStateSaver = this._register(new RunOnceScheduler(() => {
      const state = this.tree.getOptimizedViewState(this.lastViewState.get({}));
      const projection = this.projection.value;
      if (projection) {
        projection.lastState = state;
      }
    }, 3e3));
    this._register(this.tree.onDidChangeCollapseState((evt) => {
      if (evt.node.element instanceof TestItemTreeElement) {
        if (!evt.node.collapsed) {
          this.projection.value?.expandElement(evt.node.element, evt.deep ? Infinity : 0);
        }
        collapseStateSaver.schedule();
      }
    }));
    this._register(this.crService.onDidChange((testId) => {
      if (testId) {
        const elem = this.projection.value?.getElementByTestId(testId);
        this.tree.resort(elem?.parent && this.tree.hasElement(elem.parent) ? elem.parent : null, false);
      }
    }));
    this._register(onDidChangeVisibility((visible) => {
      if (visible) {
        this.ensureProjection();
      }
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(Event.any(
      filterState.text.onDidChange,
      filterState.fuzzy.onDidChange,
      testService.excluded.onTestExclusionsChanged
    )(() => {
      if (!filterState.text.value) {
        return this.tree.refilter();
      }
      const items = this.filter.lastIncludedTests = /* @__PURE__ */ new Set();
      this.tree.refilter();
      this.filter.lastIncludedTests = void 0;
      for (const test of items) {
        this.tree.expandTo(test);
      }
    }));
    this._register(this.tree.onDidOpen((e) => {
      if (!(e.element instanceof TestItemTreeElement)) {
        return;
      }
      filterState.didSelectTestInExplorer(e.element.test.item.extId);
      if (!e.element.children.size && e.element.test.item.uri) {
        if (!this.tryPeekError(e.element)) {
          commandService.executeCommand("vscode.revealTest", e.element.test.item.extId, {
            openToSide: e.sideBySide,
            preserveFocus: true
          });
        }
      }
    }));
    this._register(this.tree);
    this._register(this.onChangeWelcomeVisibility((e) => {
      this.noTestForDocumentWidget.setVisible(e === 2 /* ForDocument */);
    }));
    this._register(dom.addStandardDisposableListener(this.tree.getHTMLElement(), "keydown", (evt) => {
      if (evt.equals(KeyCode.Enter)) {
        this.handleExecuteKeypress(evt);
      } else if (DefaultKeyboardNavigationDelegate.mightProducePrintableCharacter(evt)) {
        filterState.text.value = evt.browserEvent.key;
        filterState.focusInput();
      }
    }));
    this._register(autorun((reader) => {
      this.revealById(filterState.reveal.read(reader), void 0, false);
    }));
    this._register(onDidChangeVisibility((visible) => {
      if (visible) {
        filterState.focusInput();
      }
    }));
    let followRunningTests = getTestingConfiguration(configurationService, TestingConfigKeys.FollowRunningTest);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.FollowRunningTest)) {
        followRunningTests = getTestingConfiguration(configurationService, TestingConfigKeys.FollowRunningTest);
      }
    }));
    let alwaysRevealTestAfterStateChange = getTestingConfiguration(configurationService, TestingConfigKeys.AlwaysRevealTestOnStateChange);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.AlwaysRevealTestOnStateChange)) {
        alwaysRevealTestAfterStateChange = getTestingConfiguration(configurationService, TestingConfigKeys.AlwaysRevealTestOnStateChange);
      }
    }));
    this._register(testResults.onTestChanged((evt) => {
      if (!followRunningTests) {
        return;
      }
      if (evt.reason !== TestResultItemChangeReason.OwnStateChange) {
        return;
      }
      if (this.tree.selectionSize > 1) {
        return;
      }
      if (evt.item.ownComputedState !== TestResultState.Running && !(evt.previousState === TestResultState.Queued && isStateWithResult(evt.item.ownComputedState))) {
        return;
      }
      this.revealById(evt.item.item.extId, alwaysRevealTestAfterStateChange, false);
    }));
    this._register(testResults.onResultsChanged(() => {
      this.tree.resort(null);
    }));
    this._register(this.testProfileService.onDidChange(() => {
      this.tree.rerender();
    }));
    const allOpenEditorInputs = observableFromEvent(
      this,
      editorService.onDidEditorsChange,
      () => new Set(editorGroupsService.groups.flatMap((g) => g.editors).map((e) => e.resource).filter(isDefined))
    );
    const activeResource = observableFromEvent(this, editorService.onDidActiveEditorChange, () => {
      if (editorService.activeEditor instanceof DiffEditorInput) {
        return editorService.activeEditor.primary.resource;
      } else {
        return editorService.activeEditor?.resource;
      }
    });
    const filterText = observableFromEvent(this.filterState.text.onDidChange, () => this.filterState.text);
    this._register(autorun((reader) => {
      filterText.read(reader);
      if (this.filterState.isFilteringFor(TestFilterTerm.OpenedFiles)) {
        this.filter.filterToDocumentUri([...allOpenEditorInputs.read(reader)]);
      } else {
        this.filter.filterToDocumentUri([activeResource.read(reader)].filter(isDefined));
      }
      if (this.filterState.isFilteringFor(TestFilterTerm.CurrentDoc) || this.filterState.isFilteringFor(TestFilterTerm.OpenedFiles)) {
        this.tree.refilter();
      }
    }));
    this._register(this.storageService.onWillSaveState(({ reason }) => {
      if (reason === WillSaveStateReason.SHUTDOWN) {
        this.lastViewState.store(this.tree.getOptimizedViewState());
      }
    }));
  }
  get viewMode() {
    return this._viewMode.get() ?? TestExplorerViewMode.Tree;
  }
  set viewMode(newMode) {
    if (newMode === this._viewMode.get()) {
      return;
    }
    this._viewMode.set(newMode);
    this.updatePreferredProjection();
    this.storageService.store("testing.viewMode", newMode, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  get viewSorting() {
    return this._viewSorting.get() ?? TestExplorerViewSorting.ByStatus;
  }
  set viewSorting(newSorting) {
    if (newSorting === this._viewSorting.get()) {
      return;
    }
    this._viewSorting.set(newSorting);
    this.tree.resort(null);
    this.storageService.store("testing.viewSorting", newSorting, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  /**
   * Re-layout the tree.
   */
  layout(height, width) {
    this.tree.layout(height, width);
  }
  /**
   * Tries to reveal by extension ID. Queues the request if the extension
   * ID is not currently available.
   */
  revealById(id, expand = true, focus = true) {
    if (!id) {
      this.hasPendingReveal = false;
      return;
    }
    const projection = this.ensureProjection();
    let expandToLevel = 0;
    const idPath = [...TestId.fromString(id).idsFromRoot()];
    for (let i = idPath.length - 1; i >= expandToLevel; i--) {
      const element = projection.getElementByTestId(idPath[i].toString());
      if (!element || !this.tree.hasElement(element)) {
        continue;
      }
      if (i < idPath.length - 1) {
        if (expand) {
          this.tree.expand(element);
          expandToLevel = i + 1;
          i = idPath.length - 1;
          continue;
        }
      }
      let focusTarget = element;
      for (let n = element; n instanceof TestItemTreeElement; n = n.parent) {
        if (n.test && this.testService.excluded.contains(n.test)) {
          this.filterState.toggleFilteringFor(TestFilterTerm.Hidden, true);
          break;
        }
        if (!expand && (this.tree.hasElement(n) && this.tree.isCollapsed(n))) {
          focusTarget = n;
        }
      }
      this.filterState.reveal.set(void 0, void 0);
      this.hasPendingReveal = false;
      if (focus) {
        this.tree.domFocus();
      }
      if (this.tree.getRelativeTop(focusTarget) === null) {
        this.tree.reveal(focusTarget, 0.5);
      }
      this.revealTimeout.value = disposableTimeout(() => {
        this.tree.setFocus([focusTarget]);
        this.tree.setSelection([focusTarget]);
      }, 1);
      return;
    }
    this.hasPendingReveal = true;
  }
  /**
   * Collapse all items in the tree.
   */
  async collapseAll() {
    this.tree.collapseAll();
  }
  /**
   * Tries to peek the first test error, if the item is in a failed state.
   */
  tryPeekError(item) {
    const lookup = item.test && this.testResults.getStateById(item.test.item.extId);
    return lookup && lookup[1].tasks.some((s) => isFailedState(s.state)) ? this.peekOpener.tryPeekFirstError(lookup[0], lookup[1], { preserveFocus: true }) : false;
  }
  onContextMenu(evt) {
    const element = evt.element;
    if (!(element instanceof TestItemTreeElement)) {
      return;
    }
    const { actions } = getActionableElementActions(this.contextKeyService, this.menuService, this.testService, this.crService, this.testProfileService, element);
    this.contextMenuService.showContextMenu({
      getAnchor: () => evt.anchor,
      getActions: () => actions.secondary,
      getActionsContext: () => element,
      actionRunner: this.actionRunner
    });
  }
  handleExecuteKeypress(evt) {
    const focused = this.tree.getFocus();
    const selected = this.tree.getSelection();
    let targeted;
    if (focused.length === 1 && selected.includes(focused[0])) {
      evt.browserEvent?.preventDefault();
      targeted = selected;
    } else {
      targeted = focused;
    }
    const toRun = targeted.filter((e) => e instanceof TestItemTreeElement);
    if (toRun.length) {
      this.testService.runTests({
        group: TestRunProfileBitset.Run,
        tests: toRun.map((t) => t.test)
      });
    }
  }
  reevaluateWelcomeState() {
    const shouldShowWelcome = this.testService.collection.busyProviders === 0 && testCollectionIsEmpty(this.testService.collection);
    const welcomeExperience = shouldShowWelcome ? this.filterState.isFilteringFor(TestFilterTerm.CurrentDoc) ? 2 /* ForDocument */ : 1 /* ForWorkspace */ : 0 /* None */;
    if (welcomeExperience !== this.welcomeExperience) {
      this.welcomeExperience = welcomeExperience;
      this.welcomeVisibilityEmitter.fire(welcomeExperience);
    }
  }
  ensureProjection() {
    return this.projection.value ?? this.updatePreferredProjection();
  }
  updatePreferredProjection() {
    this.projection.clear();
    const lastState = this.lastViewState.get({});
    if (this._viewMode.get() === TestExplorerViewMode.List) {
      this.projection.value = this.instantiationService.createInstance(ListProjection, lastState);
    } else {
      this.projection.value = this.instantiationService.createInstance(TreeProjection, lastState);
    }
    const scheduler = this._register(new RunOnceScheduler(() => this.applyProjectionChanges(), 200));
    this.projection.value.onUpdate(() => {
      if (!scheduler.isScheduled()) {
        scheduler.schedule();
      }
    });
    this.applyProjectionChanges();
    return this.projection.value;
  }
  applyProjectionChanges() {
    this.reevaluateWelcomeState();
    this.projection.value?.applyTo(this.tree);
    this.tree.refilter();
    if (this.hasPendingReveal) {
      this.revealById(this.filterState.reveal.get());
    }
  }
  /**
   * Gets the selected tests from the tree.
   */
  getSelectedTests() {
    return this.tree.getSelection();
  }
};
TestingExplorerViewModel = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, ITestService),
  __decorateParam(8, ITestExplorerFilterState),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, ITestResultService),
  __decorateParam(13, ITestingPeekOpener),
  __decorateParam(14, ITestProfileService),
  __decorateParam(15, ITestingContinuousRunService),
  __decorateParam(16, ICommandService)
], TestingExplorerViewModel);
var FilterResult = /* @__PURE__ */ ((FilterResult2) => {
  FilterResult2[FilterResult2["Exclude"] = 0] = "Exclude";
  FilterResult2[FilterResult2["Inherit"] = 1] = "Inherit";
  FilterResult2[FilterResult2["Include"] = 2] = "Include";
  return FilterResult2;
})(FilterResult || {});
const hasNodeInOrParentOfUri = (collection, ident, testUri, fromNode) => {
  const queue = [fromNode ? [fromNode] : collection.rootIds];
  while (queue.length) {
    for (const id of queue.pop()) {
      const node = collection.getNodeById(id);
      if (!node) {
        continue;
      }
      if (!node.item.uri || !ident.extUri.isEqualOrParent(testUri, node.item.uri)) {
        continue;
      }
      if (node.item.range || node.expand === TestItemExpandState.Expandable) {
        return true;
      }
      queue.push(node.children);
    }
  }
  return false;
};
let TestsFilter = class {
  constructor(collection, state, testService, uriIdentityService) {
    this.collection = collection;
    this.state = state;
    this.testService = testService;
    this.uriIdentityService = uriIdentityService;
    this.documentUris = [];
  }
  /**
   * @inheritdoc
   */
  filter(element) {
    if (element instanceof TestTreeErrorMessage) {
      return TreeVisibility.Visible;
    }
    if (element.test && !this.state.isFilteringFor(TestFilterTerm.Hidden) && this.testService.excluded.contains(element.test)) {
      return TreeVisibility.Hidden;
    }
    switch (Math.min(this.testFilterText(element), this.testLocation(element), this.testState(element), this.testTags(element))) {
      case 0 /* Exclude */:
        return TreeVisibility.Hidden;
      case 2 /* Include */:
        this.lastIncludedTests?.add(element);
        return TreeVisibility.Visible;
      default:
        return TreeVisibility.Recurse;
    }
  }
  filterToDocumentUri(uris) {
    this.documentUris = [...uris];
  }
  testTags(element) {
    if (!this.state.includeTags.size && !this.state.excludeTags.size) {
      return 2 /* Include */;
    }
    return (this.state.includeTags.size ? element.test.item.tags.some((t) => this.state.includeTags.has(t)) : true) && element.test.item.tags.every((t) => !this.state.excludeTags.has(t)) ? 2 /* Include */ : 1 /* Inherit */;
  }
  testState(element) {
    if (this.state.isFilteringFor(TestFilterTerm.Failed)) {
      return isFailedState(element.state) ? 2 /* Include */ : 1 /* Inherit */;
    }
    if (this.state.isFilteringFor(TestFilterTerm.Executed)) {
      return element.state !== TestResultState.Unset ? 2 /* Include */ : 1 /* Inherit */;
    }
    return 2 /* Include */;
  }
  testLocation(element) {
    if (this.documentUris.length === 0) {
      return 2 /* Include */;
    }
    if (!this.state.isFilteringFor(TestFilterTerm.CurrentDoc) && !this.state.isFilteringFor(TestFilterTerm.OpenedFiles) || !(element instanceof TestItemTreeElement)) {
      return 2 /* Include */;
    }
    if (this.documentUris.some((uri) => hasNodeInOrParentOfUri(this.collection, this.uriIdentityService, uri, element.test.item.extId))) {
      return 2 /* Include */;
    }
    return 1 /* Inherit */;
  }
  testFilterText(element) {
    if (this.state.globList.length === 0) {
      return 2 /* Include */;
    }
    const fuzzy = this.state.fuzzy.value;
    for (let e = element; e; e = e.parent) {
      let included = this.state.globList[0].include === false ? 2 /* Include */ : 1 /* Inherit */;
      const data = e.test.item.label.toLowerCase();
      for (const { include, text } of this.state.globList) {
        if (fuzzy ? fuzzyContains(data, text) : data.includes(text)) {
          included = include ? 2 /* Include */ : 0 /* Exclude */;
        }
      }
      if (included !== 1 /* Inherit */) {
        return included;
      }
    }
    return 1 /* Inherit */;
  }
};
TestsFilter = __decorateClass([
  __decorateParam(1, ITestExplorerFilterState),
  __decorateParam(2, ITestService),
  __decorateParam(3, IUriIdentityService)
], TestsFilter);
class TreeSorter {
  constructor(viewModel) {
    this.viewModel = viewModel;
  }
  compare(a, b) {
    if (a instanceof TestTreeErrorMessage || b instanceof TestTreeErrorMessage) {
      return (a instanceof TestTreeErrorMessage ? -1 : 0) + (b instanceof TestTreeErrorMessage ? 1 : 0);
    }
    const durationDelta = (b.duration || 0) - (a.duration || 0);
    if (this.viewModel.viewSorting === TestExplorerViewSorting.ByDuration && durationDelta !== 0) {
      return durationDelta;
    }
    const stateDelta = cmpPriority(a.state, b.state);
    if (this.viewModel.viewSorting === TestExplorerViewSorting.ByStatus && stateDelta !== 0) {
      return stateDelta;
    }
    let inSameLocation = false;
    if (a instanceof TestItemTreeElement && b instanceof TestItemTreeElement && a.test.item.uri && b.test.item.uri && a.test.item.uri.toString() === b.test.item.uri.toString() && a.test.item.range && b.test.item.range) {
      inSameLocation = true;
      const delta = a.test.item.range.startLineNumber - b.test.item.range.startLineNumber;
      if (delta !== 0) {
        return delta;
      }
    }
    const sa = a.test.item.sortText;
    const sb = b.test.item.sortText;
    return inSameLocation && !sa && !sb ? 0 : compareFileNames(sa || a.test.item.label, sb || b.test.item.label);
  }
}
let NoTestsForDocumentWidget = class extends Disposable {
  constructor(container, filterState) {
    super();
    const el = this.el = dom.append(container, dom.$(".testing-no-test-placeholder"));
    const emptyParagraph = dom.append(el, dom.$("p"));
    emptyParagraph.innerText = localize("testingNoTest", "No tests were found in this file.");
    const buttonLabel = localize("testingFindExtension", "Show Workspace Tests");
    const button = this._register(new Button(el, { title: buttonLabel, ...defaultButtonStyles }));
    button.label = buttonLabel;
    this._register(button.onDidClick(() => filterState.toggleFilteringFor(TestFilterTerm.CurrentDoc, false)));
  }
  setVisible(isVisible) {
    this.el.classList.toggle("visible", isVisible);
  }
};
NoTestsForDocumentWidget = __decorateClass([
  __decorateParam(1, ITestExplorerFilterState)
], NoTestsForDocumentWidget);
class TestExplorerActionRunner extends ActionRunner {
  constructor(getSelectedTests) {
    super();
    this.getSelectedTests = getSelectedTests;
  }
  async runAction(action, context) {
    if (!(action instanceof MenuItemAction)) {
      return super.runAction(action, context);
    }
    const selection = this.getSelectedTests();
    const contextIsSelected = selection.some((s) => s === context);
    const actualContext = contextIsSelected ? selection : [context];
    const actionable = actualContext.filter((t) => t instanceof TestItemTreeElement);
    await action.run(...actionable);
  }
}
const getLabelForTestTreeElement = (element) => {
  let label = labelForTestInState(element.description || element.test.item.label, element.state);
  if (element instanceof TestItemTreeElement) {
    if (element.duration !== void 0) {
      label = localize({
        key: "testing.treeElementLabelDuration",
        comment: ["{0} is the original label in testing.treeElementLabel, {1} is a duration"]
      }, "{0}, in {1}", label, formatDuration(element.duration));
    }
    if (element.retired) {
      label = localize({
        key: "testing.treeElementLabelOutdated",
        comment: ["{0} is the original label in testing.treeElementLabel"]
      }, "{0}, outdated result", label);
    }
  }
  return label;
};
class ListAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("testExplorer", "Test Explorer");
  }
  getAriaLabel(element) {
    return element instanceof TestTreeErrorMessage ? element.description : getLabelForTestTreeElement(element);
  }
}
class TreeKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element instanceof TestTreeErrorMessage ? element.message : element.test.item.label;
  }
}
class ListDelegate {
  getHeight(element) {
    return element instanceof TestTreeErrorMessage ? 17 + 10 : 22;
  }
  getTemplateId(element) {
    if (element instanceof TestTreeErrorMessage) {
      return ErrorRenderer.ID;
    }
    return TestItemRenderer.ID;
  }
}
class IdentityProvider {
  getId(element) {
    return element.treeId;
  }
}
let ErrorRenderer = class {
  constructor(hoverService, markdownRendererService) {
    this.hoverService = hoverService;
    this.markdownRendererService = markdownRendererService;
  }
  get templateId() {
    return ErrorRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, dom.$(".error"));
    return { label, disposable: new DisposableStore() };
  }
  renderElement({ element }, _, data) {
    dom.clearNode(data.label);
    if (typeof element.message === "string") {
      data.label.innerText = element.message;
    } else {
      const result = this.markdownRendererService.render(element.message, void 0, document.createElement("span"));
      data.label.appendChild(result.element);
    }
    data.disposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.label, element.description));
  }
  disposeTemplate(data) {
    data.disposable.dispose();
  }
};
ErrorRenderer.ID = "error";
ErrorRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IMarkdownRendererService)
], ErrorRenderer);
let TestItemRenderer = class extends Disposable {
  constructor(actionRunner, menuService, testService, profiles, contextKeyService, instantiationService, crService, hoverService) {
    super();
    this.actionRunner = actionRunner;
    this.menuService = menuService;
    this.testService = testService;
    this.profiles = profiles;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.crService = crService;
    this.hoverService = hoverService;
    /**
     * @inheritdoc
     */
    this.templateId = TestItemRenderer.ID;
  }
  /**
   * @inheritdoc
   */
  renderTemplate(wrapper) {
    wrapper.classList.add("testing-stdtree-container");
    const icon = dom.append(wrapper, dom.$(".computed-state"));
    const label = dom.append(wrapper, dom.$(".label"));
    const disposable = new DisposableStore();
    dom.append(wrapper, dom.$(ThemeIcon.asCSSSelector(icons.testingHiddenIcon)));
    const actionBar = disposable.add(new ActionBar(wrapper, {
      actionRunner: this.actionRunner,
      actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }) : void 0
    }));
    disposable.add(this.profiles.onDidChange(() => {
      if (templateData.current) {
        this.fillActionBar(templateData.current, templateData);
      }
    }));
    disposable.add(this.crService.onDidChange((changed) => {
      const id = templateData.current?.test.item.extId;
      if (id && (!changed || changed === id || TestId.isChild(id, changed))) {
        this.fillActionBar(templateData.current, templateData);
      }
    }));
    const templateData = { wrapper, label, actionBar, icon, elementDisposable: new DisposableStore(), templateDisposable: disposable };
    return templateData;
  }
  /**
   * @inheritdoc
   */
  disposeTemplate(templateData) {
    templateData.templateDisposable.clear();
  }
  /**
   * @inheritdoc
   */
  disposeElement(_element, _, templateData) {
    templateData.elementDisposable.clear();
  }
  fillActionBar(element, data) {
    const { actions, contextOverlay } = getActionableElementActions(this.contextKeyService, this.menuService, this.testService, this.crService, this.profiles, element);
    const crSelf = !!contextOverlay.getContextKeyValue(TestingContextKeys.isContinuousModeOn.key);
    const crChild = !crSelf && this.crService.isEnabledForAChildOf(element.test.item.extId);
    data.actionBar.domNode.classList.toggle("testing-is-continuous-run", crSelf || crChild);
    data.actionBar.clear();
    data.actionBar.context = element;
    data.actionBar.push(actions.primary, { icon: true, label: false });
  }
  /**
   * @inheritdoc
   */
  renderElement(node, _depth, data) {
    data.elementDisposable.clear();
    data.current = node.element;
    data.elementDisposable.add(node.element.onChange(() => this._renderElement(node, data)));
    this._renderElement(node, data);
  }
  _renderElement(node, data) {
    this.fillActionBar(node.element, data);
    const testHidden = this.testService.excluded.contains(node.element.test);
    data.wrapper.classList.toggle("test-is-hidden", testHidden);
    const icon = icons.testingStatesToIcons.get(
      node.element.test.expand === TestItemExpandState.BusyExpanding || node.element.test.item.busy ? TestResultState.Running : node.element.state
    );
    data.icon.className = "computed-state " + (icon ? ThemeIcon.asClassName(icon) : "");
    if (node.element.retired) {
      data.icon.className += " retired";
    }
    data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.label, getLabelForTestTreeElement(node.element)));
    if (node.element.test.item.label.trim()) {
      dom.reset(data.label, ...renderLabelWithIcons(node.element.test.item.label));
    } else {
      data.label.textContent = String.fromCharCode(160);
    }
    let description = node.element.description;
    if (node.element.duration !== void 0) {
      description = description ? `${description}: ${formatDuration(node.element.duration)}` : formatDuration(node.element.duration);
    }
    if (description) {
      dom.append(data.label, dom.$("span.test-label-description", {}, description));
    }
  }
};
TestItemRenderer.ID = "testItem";
TestItemRenderer = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestProfileService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITestingContinuousRunService),
  __decorateParam(7, IHoverService)
], TestItemRenderer);
const formatDuration = (ms) => {
  if (ms < 10) {
    return `${ms.toFixed(1)}ms`;
  }
  if (ms < 1e3) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1e3).toFixed(1)}s`;
};
const getActionableElementActions = (contextKeyService, menuService, testService, crService, profiles, element) => {
  const test = element instanceof TestItemTreeElement ? element.test : void 0;
  const contextKeys = getTestItemContextOverlay(test, test ? profiles.capabilitiesForTest(test.item) : 0);
  contextKeys.push(["view", Testing.ExplorerViewId]);
  if (test) {
    const ctrl = testService.getTestController(test.controllerId);
    const supportsCr = !!ctrl && profiles.getControllerProfiles(ctrl.id).some((p) => p.supportsContinuousRun && canUseProfileWithTest(p, test));
    contextKeys.push([
      TestingContextKeys.canRefreshTests.key,
      ctrl && !!(ctrl.capabilities.get() & TestControllerCapability.Refresh) && TestId.isRoot(test.item.extId)
    ], [
      TestingContextKeys.testItemIsHidden.key,
      testService.excluded.contains(test)
    ], [
      TestingContextKeys.isContinuousModeOn.key,
      supportsCr && crService.isSpecificallyEnabledFor(test.item.extId)
    ], [
      TestingContextKeys.isParentRunningContinuously.key,
      supportsCr && crService.isEnabledForAParentOf(test.item.extId)
    ], [
      TestingContextKeys.supportsContinuousRun.key,
      supportsCr
    ], [
      TestingContextKeys.testResultOutdated.key,
      element.retired
    ], [
      TestingContextKeys.testResultState.key,
      testResultStateToContextValues[element.state]
    ]);
  }
  const contextOverlay = contextKeyService.createOverlay(contextKeys);
  const menu = menuService.getMenuActions(MenuId.TestItem, contextOverlay, {
    shouldForwardArgs: true
  });
  const actions = getActionBarActions(menu, "inline");
  return { actions, contextOverlay };
};
registerThemingParticipant((theme, collector) => {
  if (theme.type === "dark") {
    const foregroundColor = theme.getColor(foreground);
    if (foregroundColor) {
      const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.65));
      collector.addRule(`.test-explorer .test-explorer-messages { color: ${fgWithOpacity}; }`);
    }
  }
});
export {
  TestingExplorerView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RpbmdFeHBsb3JlclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciwgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0S2V5Ym9hcmROYXZpZ2F0aW9uRGVsZWdhdGUsIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRmlsdGVyLCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIsIElUcmVlU29ydGVyLCBUcmVlRmlsdGVyUmVzdWx0LCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIFNlcGFyYXRvciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IG1hcEZpbmRGaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29sb3IsIFJHQkEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBjb21wYXJlRmlsZU5hbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBmdXp6eUNvbnRhaW5zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvZHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBjcmVhdGVBY3Rpb25WaWV3SXRlbSwgZ2V0QWN0aW9uQmFyQWN0aW9ucywgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVubWFuYWdlZFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0LCBXaWxsU2F2ZVN0YXRlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBzcGlubmluZ0xvYWRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTmF2aWdhYmxlQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpZGdldE5hdmlnYXRpb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSwgSWNvbkJhZGdlLCBOdW1iZXJCYWRnZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nQ29uZmlnS2V5cywgVGVzdGluZ0NvdW50QmFkZ2UsIGdldFRlc3RpbmdDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbW1hbmRJZCwgVGVzdEV4cGxvcmVyVmlld01vZGUsIFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLCBUZXN0aW5nLCBsYWJlbEZvclRlc3RJblN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBTdG9yZWRWYWx1ZSB9IGZyb20gJy4uL2NvbW1vbi9zdG9yZWRWYWx1ZS5qcyc7XG5pbXBvcnQgeyBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUsIFRlc3RFeHBsb3JlckZpbHRlclN0YXRlLCBUZXN0RmlsdGVyVGVybSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IElUZXN0UHJvZmlsZVNlcnZpY2UsIGNhblVzZVByb2ZpbGVXaXRoVGVzdCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGl2ZVRlc3RSZXN1bHQsIFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24sIElUZXN0U2VydmljZSwgdGVzdENvbGxlY3Rpb25Jc0VtcHR5IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0UnVuUHJvZmlsZSwgSW50ZXJuYWxUZXN0SXRlbSwgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LCBUZXN0SXRlbUV4cGFuZFN0YXRlLCBUZXN0UmVzdWx0U3RhdGUsIFRlc3RSdW5Qcm9maWxlQml0c2V0LCB0ZXN0UHJvZmlsZUJpdHNldCwgdGVzdFJlc3VsdFN0YXRlVG9Db250ZXh0VmFsdWVzIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0aW5nUGVla09wZW5lciB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nUGVla09wZW5lci5qcyc7XG5pbXBvcnQgeyBDb3VudFN1bW1hcnksIGNvbGxlY3RUZXN0U3RhdGVDb3VudHMsIGdldFRlc3RQcm9ncmVzc1RleHQgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1Byb2dyZXNzTWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgY21wUHJpb3JpdHksIGlzRmFpbGVkU3RhdGUsIGlzU3RhdGVXaXRoUmVzdWx0LCBzdGF0ZXNJbk9yZGVyIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdTdGF0ZXMuanMnO1xuaW1wb3J0IHsgSVRlc3RUcmVlUHJvamVjdGlvbiwgVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIFRlc3RJdGVtVHJlZUVsZW1lbnQsIFRlc3RUcmVlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi9leHBsb3JlclByb2plY3Rpb25zL2luZGV4LmpzJztcbmltcG9ydCB7IExpc3RQcm9qZWN0aW9uIH0gZnJvbSAnLi9leHBsb3JlclByb2plY3Rpb25zL2xpc3RQcm9qZWN0aW9uLmpzJztcbmltcG9ydCB7IGdldFRlc3RJdGVtQ29udGV4dE92ZXJsYXkgfSBmcm9tICcuL2V4cGxvcmVyUHJvamVjdGlvbnMvdGVzdEl0ZW1Db250ZXh0T3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nT2JqZWN0VHJlZSB9IGZyb20gJy4vZXhwbG9yZXJQcm9qZWN0aW9ucy90ZXN0aW5nT2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZFRlc3RUcmVlQ29sbGFwc2VTdGF0ZSB9IGZyb20gJy4vZXhwbG9yZXJQcm9qZWN0aW9ucy90ZXN0aW5nVmlld1N0YXRlLmpzJztcbmltcG9ydCB7IFRyZWVQcm9qZWN0aW9uIH0gZnJvbSAnLi9leHBsb3JlclByb2plY3Rpb25zL3RyZWVQcm9qZWN0aW9uLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vaWNvbnMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Rlc3RpbmcuY3NzJztcbmltcG9ydCB7IERlYnVnTGFzdFJ1biwgUmVSdW5MYXN0UnVuIH0gZnJvbSAnLi90ZXN0RXhwbG9yZXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IFRlc3RpbmdFeHBsb3JlckZpbHRlciB9IGZyb20gJy4vdGVzdGluZ0V4cGxvcmVyRmlsdGVyLmpzJztcblxuY29uc3QgZW51bSBMYXN0Rm9jdXNTdGF0ZSB7XG5cdElucHV0LFxuXHRUcmVlLFxufVxuXG5leHBvcnQgY2xhc3MgVGVzdGluZ0V4cGxvcmVyVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblx0cHVibGljIHZpZXdNb2RlbCE6IFRlc3RpbmdFeHBsb3JlclZpZXdNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdHJlZUhlYWRlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc2NvdmVyeVByb2dyZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFVubWFuYWdlZFByb2dyZXNzPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8VGVzdGluZ0V4cGxvcmVyRmlsdGVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJGb2N1c0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpbWVuc2lvbnMgPSB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAgfTtcblx0cHJpdmF0ZSBsYXN0Rm9jdXNTdGF0ZSA9IExhc3RGb2N1c1N0YXRlLklucHV0O1xuXG5cdHB1YmxpYyBnZXQgZm9jdXNlZFRyZWVFbGVtZW50cygpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWwudHJlZS5nZXRGb2N1cygpLmZpbHRlcihpc0RlZmluZWQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RQcm9maWxlU2VydmljZTogSVRlc3RQcm9maWxlU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNyU2VydmljZTogSVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHRjb25zdCByZWxheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMubGF5b3V0Qm9keSgpLCAxKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNob3VsZFNob3dXZWxjb21lKCkpIHtcblx0XHRcdFx0cmVsYXlvdXQuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoY3JTZXJ2aWNlLm9uRGlkQ2hhbmdlLCB0ZXN0UHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2UpKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24ub25CdXN5UHJvdmlkZXJzQ2hhbmdlKGJ1c3kgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVEaXNjb3ZlcnlQcm9ncmVzcyhidXN5KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0UHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVBY3Rpb25zKCkpKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzaG91bGRTaG93V2VsY29tZSgpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LndlbGNvbWVFeHBlcmllbmNlID09PSBXZWxjb21lRXhwZXJpZW5jZS5Gb3JXb3Jrc3BhY2U7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZm9jdXMoKSB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRpZiAodGhpcy5sYXN0Rm9jdXNTdGF0ZSA9PT0gTGFzdEZvY3VzU3RhdGUuVHJlZSkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwudHJlZS5kb21Gb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZpbHRlci52YWx1ZT8uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBpbmNsdWRlL2V4Y2x1ZGUgaXRlbXMgaW4gdGhlIHRyZWUsIGJhc2VkIGVpdGhlciBvbiB2aXNpYmxlIHRlc3RzXG5cdCAqIG9yIGEgdXNlIHNlbGVjdGlvbi4gSWYgYSBwcm9maWxlIGlzIGdpdmVuLCBvbmx5IHRlc3RzIGluIHRoYXQgcHJvZmlsZVxuXHQgKiBhcmUgY29sbGVjdGVkLiBJZiBhIGJpdHNldCBpcyBnaXZlbiwgYW55IHRlc3QgdGhhdCBjYW4gcnVuIGluIHRoYXRcblx0ICogYml0c2V0IGlzIGNvbGxlY3RlZC5cblx0ICovXG5cdHB1YmxpYyBnZXRUcmVlSW5jbHVkZUV4Y2x1ZGUocHJvZmlsZU9yQml0c2V0OiBJVGVzdFJ1blByb2ZpbGUgfCBUZXN0UnVuUHJvZmlsZUJpdHNldCwgd2l0aGluSXRlbXM/OiBJbnRlcm5hbFRlc3RJdGVtW10sIGZpbHRlclRvVHlwZTogJ3Zpc2libGUnIHwgJ3NlbGVjdGVkJyA9ICd2aXNpYmxlJykge1xuXHRcdGNvbnN0IHByb2plY3Rpb24gPSB0aGlzLnZpZXdNb2RlbC5wcm9qZWN0aW9uLnZhbHVlO1xuXHRcdGlmICghcHJvamVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHsgaW5jbHVkZTogW10sIGV4Y2x1ZGU6IFtdIH07XG5cdFx0fVxuXG5cdFx0Ly8gVG8gY2FsY3VsYXRlIGluY2x1ZGVzIGFuZCBleGNsdWRlcywgd2UgaW5jbHVkZSB0aGUgZmlyc3QgY2hpbGRyZW4gdGhhdFxuXHRcdC8vIGhhdmUgYSBtYWpvcml0eSBvZiB0aGVpciBpdGVtcyBpbmNsdWRlZCB0b28sIGFuZCB0aGVuIGFwcGx5IGV4Y2x1c2lvbnMuXG5cdFx0Y29uc3QgaW5jbHVkZSA9IG5ldyBTZXQ8SW50ZXJuYWxUZXN0SXRlbT4oKTtcblx0XHRjb25zdCBleGNsdWRlOiBJbnRlcm5hbFRlc3RJdGVtW10gPSBbXTtcblxuXHRcdGNvbnN0IHJ1bm5hYmxlV2l0aFByb2ZpbGVPckJpdHNldCA9IG5ldyBNYXA8SW50ZXJuYWxUZXN0SXRlbSwgYm9vbGVhbj4oKTtcblx0XHRjb25zdCBpc1J1bm5hYmxlV2l0aFByb2ZpbGVPckJpdHNldCA9IChpdGVtOiBJbnRlcm5hbFRlc3RJdGVtKSA9PiB7XG5cdFx0XHRsZXQgdmFsdWUgPSBydW5uYWJsZVdpdGhQcm9maWxlT3JCaXRzZXQuZ2V0KGl0ZW0pO1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dmFsdWUgPSB0eXBlb2YgcHJvZmlsZU9yQml0c2V0ID09PSAnbnVtYmVyJ1xuXHRcdFx0XHRcdD8gISF0aGlzLnRlc3RQcm9maWxlU2VydmljZS5nZXREZWZhdWx0UHJvZmlsZUZvclRlc3QocHJvZmlsZU9yQml0c2V0LCBpdGVtKVxuXHRcdFx0XHRcdDogY2FuVXNlUHJvZmlsZVdpdGhUZXN0KHByb2ZpbGVPckJpdHNldCwgaXRlbSk7XG5cdFx0XHRcdHJ1bm5hYmxlV2l0aFByb2ZpbGVPckJpdHNldC5zZXQoaXRlbSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH07XG5cblxuXHRcdGNvbnN0IGF0dGVtcHQgPSAoZWxlbWVudDogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIGFscmVhZHlJbmNsdWRlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0Ly8gc2FuaXR5IGNoZWNrIGhhc0VsZW1lbnQgc2luY2UgdXBkYXRlcyBhcmUgZGVib3VuY2VkIGFuZCB0aGV5IG1heSBleGlzdFxuXHRcdFx0Ly8gYnV0IG5vdCBiZSByZW5kZXJlZCB5ZXRcblx0XHRcdGlmICghKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSB8fCAhdGhpcy52aWV3TW9kZWwudHJlZS5oYXNFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgdGhlIGN1cnJlbnQgbm9kZSBpcyBub3QgdmlzaWJsZSBvciBydW5uYWJsZSBpbiB0aGUgY3VycmVudCBwcm9maWxlLCBpdCdzIGV4Y2x1ZGVkXG5cdFx0XHRjb25zdCBpblRyZWUgPSB0aGlzLnZpZXdNb2RlbC50cmVlLmdldE5vZGUoZWxlbWVudCk7XG5cdFx0XHRpZiAoIWluVHJlZS52aXNpYmxlKSB7XG5cdFx0XHRcdGlmIChhbHJlYWR5SW5jbHVkZWQpIHsgZXhjbHVkZS5wdXNoKGVsZW1lbnQudGVzdCk7IH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IGNvdW50IHJlbGV2YW50IGNoaWxkcmVuIHdoZW4gZGVjaWRpbmcgd2hldGhlciB0byBpbmNsdWRlIHRoaXMgbm9kZSwgIzIyOTEyMFxuXHRcdFx0Y29uc3QgdmlzaWJsZVJ1bm5hYmxlQ2hpbGRyZW4gPSBpblRyZWUuY2hpbGRyZW4uZmlsdGVyKFxuXHRcdFx0XHRjID0+IGMudmlzaWJsZVxuXHRcdFx0XHRcdCYmIGMuZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnRcblx0XHRcdFx0XHQmJiBpc1J1bm5hYmxlV2l0aFByb2ZpbGVPckJpdHNldChjLmVsZW1lbnQudGVzdCksXG5cdFx0XHQpLmxlbmd0aDtcblxuXHRcdFx0Ly8gSWYgaXQncyBub3QgYWxyZWFkeSBpbmNsdWRlZCBidXQgbW9zdCBvZiBpdHMgY2hpbGRyZW4gYXJlLCB0aGVuIGFkZCBpdFxuXHRcdFx0Ly8gaWYgaXQgY2FuIGJlIHJ1biB1bmRlciB0aGUgY3VycmVudCBwcm9maWxlICh3aGVuIHNwZWNpZmllZClcblx0XHRcdGlmIChcblx0XHRcdFx0Ly8gSWYgaXQncyBub3QgYWxyZWFkeSBpbmNsdWRlZC4uLlxuXHRcdFx0XHQhYWxyZWFkeUluY2x1ZGVkXG5cdFx0XHRcdC8vIEFuZCBpdCBjYW4gYmUgcnVuIHVzaW5nIHRoZSBjdXJyZW50IHByb2ZpbGUgKGlmIGFueSlcblx0XHRcdFx0JiYgaXNSdW5uYWJsZVdpdGhQcm9maWxlT3JCaXRzZXQoZWxlbWVudC50ZXN0KVxuXHRcdFx0XHQvLyBBbmQgZWl0aGVyIGl0J3MgYSBsZWFmIG5vZGUgb3IgbW9zdCBjaGlsZHJlbiBhcmUgaW5jbHVkZWQsIHRoZW4gaW5jbHVkZSBpdC5cblx0XHRcdFx0JiYgKHZpc2libGVSdW5uYWJsZUNoaWxkcmVuID09PSAwIHx8IHZpc2libGVSdW5uYWJsZUNoaWxkcmVuICogMiA+PSBpblRyZWUuY2hpbGRyZW4ubGVuZ3RoKVxuXHRcdFx0XHQvLyBBbmQgbm90IGlmIHdlJ3JlIG9ubHkgc2hvd2luZyBhIHNpbmdsZSBvZiBpdHMgY2hpbGRyZW4sIHNpbmNlIGl0XG5cdFx0XHRcdC8vIHByb2JhYmx5IGZhbnMgb3V0IGxhdGVyLiAoV29yc2UgY2FzZSB3ZSdsbCBkaXJlY3RseSBpbmNsdWRlIGl0cyBzaW5nbGUgY2hpbGQpXG5cdFx0XHRcdCYmIHZpc2libGVSdW5uYWJsZUNoaWxkcmVuICE9PSAxXG5cdFx0XHQpIHtcblx0XHRcdFx0aW5jbHVkZS5hZGQoZWxlbWVudC50ZXN0KTtcblx0XHRcdFx0YWxyZWFkeUluY2x1ZGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVjdXJzZSBcdTI3Mjhcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0XHRhdHRlbXB0KGNoaWxkLCBhbHJlYWR5SW5jbHVkZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoZmlsdGVyVG9UeXBlID09PSAnc2VsZWN0ZWQnKSB7XG5cdFx0XHRjb25zdCBzZWwgPSB0aGlzLnZpZXdNb2RlbC50cmVlLmdldFNlbGVjdGlvbigpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdFx0aWYgKHNlbC5sZW5ndGgpIHtcblxuXHRcdFx0XHRMOlxuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygc2VsKSB7XG5cdFx0XHRcdFx0aWYgKG5vZGUgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHQvLyBhdm9pZCBhZGRpbmcgYW4gaXRlbSBpZiBpdHMgcGFyZW50IGlzIGFscmVhZHkgaW5jbHVkZWRcblx0XHRcdFx0XHRcdGZvciAobGV0IGk6IFRlc3RJdGVtVHJlZUVsZW1lbnQgfCBudWxsID0gbm9kZTsgaTsgaSA9IGkucGFyZW50KSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpbmNsdWRlLmhhcyhpLnRlc3QpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWUgTDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpbmNsdWRlLmFkZChub2RlLnRlc3QpO1xuXHRcdFx0XHRcdFx0bm9kZS5jaGlsZHJlbi5mb3JFYWNoKGMgPT4gYXR0ZW1wdChjLCB0cnVlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgaW5jbHVkZTogWy4uLmluY2x1ZGVdLCBleGNsdWRlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCByb290IG9mIHdpdGhpbkl0ZW1zIHx8IHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5yb290SXRlbXMpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBwcm9qZWN0aW9uLmdldEVsZW1lbnRCeVRlc3RJZChyb290Lml0ZW0uZXh0SWQpO1xuXHRcdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHByb2ZpbGVPckJpdHNldCA9PT0gJ29iamVjdCcgJiYgIWNhblVzZVByb2ZpbGVXaXRoVGVzdChwcm9maWxlT3JCaXRzZXQsIHJvb3QpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpbmNsdWRlLmFkZChlbGVtZW50LnRlc3QpO1xuXHRcdFx0ZWxlbWVudC5jaGlsZHJlbi5mb3JFYWNoKGMgPT4gYXR0ZW1wdChjLCB0cnVlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaW5jbHVkZTogWy4uLmluY2x1ZGVdLCBleGNsdWRlIH07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIoe1xuXHRcdFx0bmFtZTogJ3Rlc3RpbmdFeHBsb3JlclZpZXcnLFxuXHRcdFx0Zm9jdXNOb3RpZmllcnM6IFt0aGlzXSxcblx0XHRcdGZvY3VzTmV4dFdpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMudmlld01vZGVsLnRyZWUuaXNET01Gb2N1c2VkKCkpIHtcblx0XHRcdFx0XHR0aGlzLnZpZXdNb2RlbC50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRmb2N1c1ByZXZpb3VzV2lkZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbC50cmVlLmlzRE9NRm9jdXNlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5maWx0ZXIudmFsdWU/LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy50ZXN0LWV4cGxvcmVyJykpO1xuXHRcdHRoaXMudHJlZUhlYWRlciA9IGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsIGRvbS4kKCcudGVzdC1leHBsb3Jlci1oZWFkZXInKSk7XG5cdFx0dGhpcy5maWx0ZXJBY3Rpb25CYXIudmFsdWUgPSB0aGlzLmNyZWF0ZUZpbHRlckFjdGlvbkJhcigpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZXNDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMudHJlZUhlYWRlciwgZG9tLiQoJy5yZXN1bHQtc3VtbWFyeS1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXN1bHRTdW1tYXJ5VmlldywgbWVzc2FnZXNDb250YWluZXIpKTtcblxuXHRcdGNvbnN0IGxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBkb20uJCgnLnRlc3QtZXhwbG9yZXItdHJlZScpKTtcblx0XHR0aGlzLnZpZXdNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdGluZ0V4cGxvcmVyVmlld01vZGVsLCBsaXN0Q29udGFpbmVyLCB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld01vZGVsLnRyZWUub25EaWRGb2N1cygoKSA9PiB0aGlzLmxhc3RGb2N1c1N0YXRlID0gTGFzdEZvY3VzU3RhdGUuVHJlZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld01vZGVsLm9uQ2hhbmdlV2VsY29tZVZpc2liaWxpdHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld01vZGVsKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZmlyZSgpO1xuXHR9XG5cblx0LyoqIEBvdmVycmlkZSAgKi9cblx0cHVibGljIG92ZXJyaWRlIGNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChhY3Rpb24uaWQpIHtcblx0XHRcdGNhc2UgVGVzdENvbW1hbmRJZC5GaWx0ZXJBY3Rpb246XG5cdFx0XHRcdHRoaXMuZmlsdGVyLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0aW5nRXhwbG9yZXJGaWx0ZXIsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdHRoaXMuZmlsdGVyRm9jdXNMaXN0ZW5lci52YWx1ZSA9IHRoaXMuZmlsdGVyLnZhbHVlLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5sYXN0Rm9jdXNTdGF0ZSA9IExhc3RGb2N1c1N0YXRlLklucHV0KTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsdGVyLnZhbHVlO1xuXHRcdFx0Y2FzZSBUZXN0Q29tbWFuZElkLlJ1blNlbGVjdGVkQWN0aW9uOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRSdW5Hcm91cERyb3Bkb3duKFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdGNhc2UgVGVzdENvbW1hbmRJZC5EZWJ1Z1NlbGVjdGVkQWN0aW9uOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRSdW5Hcm91cERyb3Bkb3duKFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0Y2FzZSBUZXN0Q29tbWFuZElkLkNvdmVyYWdlU2VsZWN0ZWRBY3Rpb246XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFJ1bkdyb3VwRHJvcGRvd24oVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRjYXNlIFRlc3RDb21tYW5kSWQuU3RhcnRDb250aW5vdXNSdW46XG5cdFx0XHRjYXNlIFRlc3RDb21tYW5kSWQuU3RvcENvbnRpbm91c1J1bjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGludW91c1J1bkRyb3Bkb3duKGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gc3VwZXIuY3JlYXRlQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHJpdmF0ZSBnZXRUZXN0Q29uZmlnR3JvdXBBY3Rpb25zKGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldCkge1xuXHRcdGNvbnN0IHByb2ZpbGVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdGxldCBwYXJ0aWNpcGF0aW5nR3JvdXBzID0gMDtcblx0XHRsZXQgcGFydGljaXBhdGluZ1Byb2ZpbGVzID0gMDtcblx0XHRsZXQgaGFzQ29uZmlndXJhYmxlID0gZmFsc2U7XG5cdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLnRlc3RQcm9maWxlU2VydmljZS5nZXRHcm91cERlZmF1bHRQcm9maWxlcyhncm91cCk7XG5cdFx0Zm9yIChjb25zdCB7IHByb2ZpbGVzLCBjb250cm9sbGVyIH0gb2YgdGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UuYWxsKCkpIHtcblx0XHRcdGxldCBoYXNBZGRlZCA9IGZhbHNlO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRcdFx0aWYgKHByb2ZpbGUuZ3JvdXAgIT09IGdyb3VwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWhhc0FkZGVkKSB7XG5cdFx0XHRcdFx0aGFzQWRkZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHBhcnRpY2lwYXRpbmdHcm91cHMrKztcblx0XHRcdFx0XHRwcm9maWxlQWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6IGAke2NvbnRyb2xsZXIuaWR9LiRyb290YCwgbGFiZWw6IGNvbnRyb2xsZXIubGFiZWwuZ2V0KCksIGVuYWJsZWQ6IGZhbHNlLCBjaGVja2VkOiBmYWxzZSwgcnVuOiAoKSA9PiB7IH0gfSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFzQ29uZmlndXJhYmxlID0gaGFzQ29uZmlndXJhYmxlIHx8IHByb2ZpbGUuaGFzQ29uZmlndXJhdGlvbkhhbmRsZXI7XG5cdFx0XHRcdHBhcnRpY2lwYXRpbmdQcm9maWxlcysrO1xuXHRcdFx0XHRwcm9maWxlQWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogYCR7Y29udHJvbGxlci5pZH0uJHtwcm9maWxlLnByb2ZpbGVJZH1gLFxuXHRcdFx0XHRcdGxhYmVsOiBkZWZhdWx0cy5pbmNsdWRlcyhwcm9maWxlKSA/IGxvY2FsaXplKCdkZWZhdWx0VGVzdFByb2ZpbGUnLCAnezB9IChEZWZhdWx0KScsIHByb2ZpbGUubGFiZWwpIDogcHJvZmlsZS5sYWJlbCxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgaW5jbHVkZSwgZXhjbHVkZSB9ID0gdGhpcy5nZXRUcmVlSW5jbHVkZUV4Y2x1ZGUocHJvZmlsZSk7XG5cdFx0XHRcdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLnJ1blJlc29sdmVkVGVzdHMoe1xuXHRcdFx0XHRcdFx0XHRleGNsdWRlOiBleGNsdWRlLm1hcChlID0+IGUuaXRlbS5leHRJZCksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiBwcm9maWxlLmdyb3VwLFxuXHRcdFx0XHRcdFx0XHR0YXJnZXRzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdHByb2ZpbGVJZDogcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdFx0XHRcdFx0Y29udHJvbGxlcklkOiBwcm9maWxlLmNvbnRyb2xsZXJJZCxcblx0XHRcdFx0XHRcdFx0XHR0ZXN0SWRzOiBpbmNsdWRlLm1hcChpID0+IGkuaXRlbS5leHRJZCksXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dEtleXM6IFtzdHJpbmcsIHVua25vd25dW10gPSBbXTtcblx0XHQvLyBhbGxvdyBleHRlbnNpb24gYXV0aG9yIHRvIGRlZmluZSBjb250ZXh0IGZvciB3aGVuIHRvIHNob3cgdGhlIHRlc3QgbWVudSBhY3Rpb25zIGZvciBydW4gb3IgZGVidWcgbWVudXNcblx0XHRpZiAoZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bikge1xuXHRcdFx0Y29udGV4dEtleXMucHVzaChbJ3Rlc3RpbmcucHJvZmlsZS5jb250ZXh0Lmdyb3VwJywgJ3J1biddKTtcblx0XHR9XG5cdFx0aWYgKGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Zykge1xuXHRcdFx0Y29udGV4dEtleXMucHVzaChbJ3Rlc3RpbmcucHJvZmlsZS5jb250ZXh0Lmdyb3VwJywgJ2RlYnVnJ10pO1xuXHRcdH1cblx0XHRpZiAoZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlKSB7XG5cdFx0XHRjb250ZXh0S2V5cy5wdXNoKFsndGVzdGluZy5wcm9maWxlLmNvbnRleHQuZ3JvdXAnLCAnY292ZXJhZ2UnXSk7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShjb250ZXh0S2V5cyk7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLlRlc3RQcm9maWxlc0NvbnRleHQsIGtleSk7XG5cblx0XHQvLyBmaWxsIGlmIHRoZXJlIGFyZSBhbnkgYWN0aW9uc1xuXHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblxuXHRcdGNvbnN0IHBvc3RBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRpZiAocGFydGljaXBhdGluZ1Byb2ZpbGVzID4gMSkge1xuXHRcdFx0cG9zdEFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnc2VsZWN0RGVmYXVsdFRlc3RDb25maWd1cmF0aW9ucycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0RGVmYXVsdENvbmZpZ3MnLCAnU2VsZWN0IERlZmF1bHQgUHJvZmlsZScpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVRlc3RSdW5Qcm9maWxlPihUZXN0Q29tbWFuZElkLlNlbGVjdERlZmF1bHRUZXN0UHJvZmlsZXMsIGdyb3VwKSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAoaGFzQ29uZmlndXJhYmxlKSB7XG5cdFx0XHRwb3N0QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdjb25maWd1cmVUZXN0UHJvZmlsZXMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbmZpZ3VyZVRlc3RQcm9maWxlcycsICdDb25maWd1cmUgVGVzdCBQcm9maWxlcycpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVRlc3RSdW5Qcm9maWxlPihUZXN0Q29tbWFuZElkLkNvbmZpZ3VyZVRlc3RQcm9maWxlc0FjdGlvbiwgZ3JvdXApLFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIHNob3cgbWVudSBhY3Rpb25zIGlmIHRoZXJlIGFyZSBhbnkgb3RoZXJ3aXNlIGRvbid0XG5cdFx0cmV0dXJuIHtcblx0XHRcdG51bWJlck9mUHJvZmlsZXM6IHBhcnRpY2lwYXRpbmdQcm9maWxlcyxcblx0XHRcdGFjdGlvbnM6IG1lbnVBY3Rpb25zLmxlbmd0aCA+IDBcblx0XHRcdFx0PyBTZXBhcmF0b3Iuam9pbihwcm9maWxlQWN0aW9ucywgbWVudUFjdGlvbnMsIHBvc3RBY3Rpb25zKVxuXHRcdFx0XHQ6IFNlcGFyYXRvci5qb2luKHByb2ZpbGVBY3Rpb25zLCBwb3N0QWN0aW9ucyksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBzYXZlU3RhdGUoKSB7XG5cdFx0dGhpcy5maWx0ZXIudmFsdWU/LnNhdmVTdGF0ZSgpO1xuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSdW5Hcm91cERyb3Bkb3duKGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldCwgZGVmYXVsdEFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdGNvbnN0IGRyb3Bkb3duQWN0aW9ucyA9IHRoaXMuZ2V0VGVzdENvbmZpZ0dyb3VwQWN0aW9ucyhncm91cCk7XG5cdFx0aWYgKGRyb3Bkb3duQWN0aW9ucy5udW1iZXJPZlByb2ZpbGVzIDwgMikge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZUFjdGlvblZpZXdJdGVtKGRlZmF1bHRBY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVJdGVtQWN0aW9uLCB7XG5cdFx0XHRpZDogZGVmYXVsdEFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBkZWZhdWx0QWN0aW9uLmxhYmVsLFxuXHRcdFx0aWNvbjogZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1blxuXHRcdFx0XHQ/IGljb25zLnRlc3RpbmdSdW5BbGxJY29uXG5cdFx0XHRcdDogZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnXG5cdFx0XHRcdFx0PyBpY29ucy50ZXN0aW5nRGVidWdBbGxJY29uXG5cdFx0XHRcdFx0OiBpY29ucy50ZXN0aW5nQ292ZXJhZ2VBbGxJY29uLFxuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSxcblx0XHRcdHByaW1hcnlBY3Rpb24sIHRoaXMuZ2V0RHJvcGRvd25BY3Rpb24oKSwgZHJvcGRvd25BY3Rpb25zLmFjdGlvbnMsXG5cdFx0XHQnJyxcblx0XHRcdG9wdGlvbnNcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREcm9wZG93bkFjdGlvbigpIHtcblx0XHRyZXR1cm4gbmV3IEFjdGlvbignc2VsZWN0UnVuQ29uZmlnJywgbG9jYWxpemUoJ3Rlc3RpbmdTZWxlY3RDb25maWcnLCAnU2VsZWN0IENvbmZpZ3VyYXRpb24uLi4nKSwgJ2NvZGljb24tY2hldnJvbi1kb3duJywgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRpbnVvdXNSdW5Ecm9wZG93bihkZWZhdWx0QWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0Y29uc3QgYWxsUHJvZmlsZXMgPSBbLi4uSXRlcmFibGUuZmxhdE1hcCh0aGlzLnRlc3RQcm9maWxlU2VydmljZS5hbGwoKSwgKGNyKTogSXRlcmFibGU8SVRlc3RSdW5Qcm9maWxlPiA9PiB7XG5cdFx0XHRpZiAodGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLmdldE5vZGVCeUlkKGNyLmNvbnRyb2xsZXIuaWQpPy5jaGlsZHJlbi5zaXplKSB7XG5cdFx0XHRcdHJldHVybiBJdGVyYWJsZS5maWx0ZXIoY3IucHJvZmlsZXMsIHAgPT4gcC5zdXBwb3J0c0NvbnRpbnVvdXNSdW4pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEl0ZXJhYmxlLmVtcHR5KCk7XG5cdFx0fSldO1xuXG5cdFx0aWYgKGFsbFByb2ZpbGVzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuY3JlYXRlQWN0aW9uVmlld0l0ZW0oZGVmYXVsdEFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUl0ZW1BY3Rpb24sIHtcblx0XHRcdGlkOiBkZWZhdWx0QWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IGRlZmF1bHRBY3Rpb24ubGFiZWwsXG5cdFx0XHRpY29uOiBkZWZhdWx0QWN0aW9uLmlkID09PSBUZXN0Q29tbWFuZElkLlN0YXJ0Q29udGlub3VzUnVuID8gaWNvbnMudGVzdGluZ1R1cm5Db250aW51b3VzUnVuT24gOiBpY29ucy50ZXN0aW5nVHVybkNvbnRpbnVvdXNSdW5PZmYsXG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGRyb3Bkb3duQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBCeShhbGxQcm9maWxlcywgcCA9PiBwLmdyb3VwKTtcblx0XHRjb25zdCBjclNlcnZpY2UgPSB0aGlzLmNyU2VydmljZTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIFtUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLCBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZV0gYXMgY29uc3QpIHtcblx0XHRcdGNvbnN0IHByb2ZpbGVzID0gZ3JvdXBzW2dyb3VwXTtcblx0XHRcdGlmICghcHJvZmlsZXMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChPYmplY3Qua2V5cyhncm91cHMpLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0ZHJvcGRvd25BY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBgJHtncm91cH0ubGFiZWxgLFxuXHRcdFx0XHRcdGxhYmVsOiB0ZXN0UHJvZmlsZUJpdHNldFtncm91cF0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sdGlwOiB0ZXN0UHJvZmlsZUJpdHNldFtncm91cF0sXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRcdFx0ZHJvcGRvd25BY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBgJHtncm91cH0uJHtwcm9maWxlLnByb2ZpbGVJZH1gLFxuXHRcdFx0XHRcdGxhYmVsOiBwcm9maWxlLmxhYmVsLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sdGlwOiBwcm9maWxlLmxhYmVsLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGNyU2VydmljZS5pc0VuYWJsZWRGb3JQcm9maWxlKHByb2ZpbGUpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gY3JTZXJ2aWNlLmlzRW5hYmxlZEZvclByb2ZpbGUocHJvZmlsZSlcblx0XHRcdFx0XHRcdD8gY3JTZXJ2aWNlLnN0b3BQcm9maWxlKHByb2ZpbGUpXG5cdFx0XHRcdFx0XHQ6IGNyU2VydmljZS5zdGFydChbcHJvZmlsZV0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSxcblx0XHRcdHByaW1hcnlBY3Rpb24sIHRoaXMuZ2V0RHJvcGRvd25BY3Rpb24oKSwgZHJvcGRvd25BY3Rpb25zLFxuXHRcdFx0JycsXG5cdFx0XHRvcHRpb25zXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmlsdGVyQWN0aW9uQmFyKCkge1xuXHRcdGNvbnN0IGJhciA9IG5ldyBBY3Rpb25CYXIodGhpcy50cmVlSGVhZGVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHR0cmlnZ2VyS2V5czogeyBrZXlEb3duOiBmYWxzZSwga2V5czogW10gfSxcblx0XHR9KTtcblx0XHRiYXIucHVzaChuZXcgQWN0aW9uKFRlc3RDb21tYW5kSWQuRmlsdGVyQWN0aW9uKSk7XG5cdFx0YmFyLmdldENvbnRhaW5lcigpLmNsYXNzTGlzdC5hZGQoJ3Rlc3RpbmctZmlsdGVyLWFjdGlvbi1iYXInKTtcblx0XHRyZXR1cm4gYmFyO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEaXNjb3ZlcnlQcm9ncmVzcyhidXN5OiBudW1iZXIpIHtcblx0XHRpZiAoIWJ1c3kgJiYgdGhpcy5kaXNjb3ZlcnlQcm9ncmVzcykge1xuXHRcdFx0dGhpcy5kaXNjb3ZlcnlQcm9ncmVzcy5jbGVhcigpO1xuXHRcdH0gZWxzZSBpZiAoYnVzeSAmJiAhdGhpcy5kaXNjb3ZlcnlQcm9ncmVzcy52YWx1ZSkge1xuXHRcdFx0dGhpcy5kaXNjb3ZlcnlQcm9ncmVzcy52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5tYW5hZ2VkUHJvZ3Jlc3MsIHsgbG9jYXRpb246IHRoaXMuZ2V0UHJvZ3Jlc3NMb2NhdGlvbigpIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodCA9IHRoaXMuZGltZW5zaW9ucy5oZWlnaHQsIHdpZHRoID0gdGhpcy5kaW1lbnNpb25zLndpZHRoKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLmRpbWVuc2lvbnMuaGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMuZGltZW5zaW9ucy53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0dGhpcy52aWV3TW9kZWw/LmxheW91dChoZWlnaHQgLSB0aGlzLnRyZWVIZWFkZXIuY2xpZW50SGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5maWx0ZXIudmFsdWU/LmxheW91dCh3aWR0aCk7XG5cdH1cbn1cblxuY29uc3QgU1VNTUFSWV9SRU5ERVJfSU5URVJWQUwgPSAyMDA7XG5cbmNsYXNzIFJlc3VsdFN1bW1hcnlWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgZWxlbWVudHNXZXJlQXR0YWNoZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBiYWRnZVR5cGU6IFRlc3RpbmdDb3VudEJhZGdlO1xuXHRwcml2YXRlIGxhc3RCYWRnZT86IE51bWJlckJhZGdlIHwgSWNvbkJhZGdlO1xuXHRwcml2YXRlIGNvdW50SG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgYmFkZ2VEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckxvb3AgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnJlbmRlcigpLCBTVU1NQVJZX1JFTkRFUl9JTlRFUlZBTCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnRzID0gZG9tLmgoJ2Rpdi5yZXN1bHQtc3VtbWFyeScsIFtcblx0XHRkb20uaCgnZGl2QHN0YXR1cycpLFxuXHRcdGRvbS5oKCdkaXZAY291bnQnKSxcblx0XHRkb20uaCgnZGl2QGNvdW50JyksXG5cdFx0ZG9tLmgoJ3NwYW4nKSxcblx0XHRkb20uaCgnZHVyYXRpb25AZHVyYXRpb24nKSxcblx0XHRkb20uaCgnYUByZXJ1bicpLFxuXHRdKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdFNlcnZpY2U6IElUZXN0UmVzdWx0U2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNyU2VydmljZTogSVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuYmFkZ2VUeXBlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VGVzdGluZ0NvdW50QmFkZ2U+KFRlc3RpbmdDb25maWdLZXlzLkNvdW50QmFkZ2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdFNlcnZpY2Uub25SZXN1bHRzQ2hhbmdlZCh0aGlzLnJlbmRlciwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlc3RpbmdDb25maWdLZXlzLkNvdW50QmFkZ2UpKSB7XG5cdFx0XHRcdHRoaXMuYmFkZ2VUeXBlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVzdGluZ0NvbmZpZ0tleXMuQ291bnRCYWRnZSk7XG5cdFx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jb3VudEhvdmVyID0gdGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnRzLmNvdW50LCAnJykpO1xuXG5cdFx0Y29uc3QgYWIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudHMucmVydW4sIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IGNyZWF0ZUFjdGlvblZpZXdJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdH0pKTtcblx0XHRhYi5wdXNoKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVJdGVtQWN0aW9uLFxuXHRcdFx0eyAuLi5uZXcgUmVSdW5MYXN0UnVuKCkuZGVzYywgaWNvbjogaWNvbnMudGVzdGluZ1JlcnVuSWNvbiB9LFxuXHRcdFx0eyAuLi5uZXcgRGVidWdMYXN0UnVuKCkuZGVzYywgaWNvbjogaWNvbnMudGVzdGluZ0RlYnVnSWNvbiB9LFxuXHRcdFx0e30sXG5cdFx0XHR1bmRlZmluZWQsIHVuZGVmaW5lZFxuXHRcdCksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKCkge1xuXHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gdGhpcy5yZXN1bHRTZXJ2aWNlO1xuXHRcdGNvbnN0IHsgY291bnQsIHJvb3QsIHN0YXR1cywgZHVyYXRpb24sIHJlcnVuIH0gPSB0aGlzLmVsZW1lbnRzO1xuXHRcdGlmICghcmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdGlmICh0aGlzLmVsZW1lbnRzV2VyZUF0dGFjaGVkKSB7XG5cdFx0XHRcdHJvb3QucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudHNXZXJlQXR0YWNoZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9IGxvY2FsaXplKCdub1Jlc3VsdHMnLCAnTm8gdGVzdCByZXN1bHRzIHlldC4nKTtcblx0XHRcdHRoaXMuYmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGl2ZSA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIXIuY29tcGxldGVkQXQpIGFzIExpdmVUZXN0UmVzdWx0W107XG5cdFx0bGV0IGNvdW50czogQ291bnRTdW1tYXJ5O1xuXHRcdGlmIChsaXZlLmxlbmd0aCkge1xuXHRcdFx0c3RhdHVzLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzcGlubmluZ0xvYWRpbmcpO1xuXHRcdFx0Y291bnRzID0gY29sbGVjdFRlc3RTdGF0ZUNvdW50cyh0cnVlLCBsaXZlKTtcblx0XHRcdHRoaXMucmVuZGVyTG9vcC5zY2hlZHVsZSgpO1xuXG5cdFx0XHRjb25zdCBsYXN0ID0gbGl2ZVtsaXZlLmxlbmd0aCAtIDFdO1xuXHRcdFx0ZHVyYXRpb24udGV4dENvbnRlbnQgPSBmb3JtYXREdXJhdGlvbihEYXRlLm5vdygpIC0gbGFzdC5zdGFydGVkQXQpO1xuXHRcdFx0cmVydW4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbGFzdCA9IHJlc3VsdHNbMF07XG5cdFx0XHRjb25zdCBkb21pbmFudFN0YXRlID0gbWFwRmluZEZpcnN0KHN0YXRlc0luT3JkZXIsIHMgPT4gbGFzdC5jb3VudHNbc10gPiAwID8gcyA6IHVuZGVmaW5lZCk7XG5cdFx0XHRzdGF0dXMuY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLnRlc3RpbmdTdGF0ZXNUb0ljb25zLmdldChkb21pbmFudFN0YXRlID8/IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCkhKTtcblx0XHRcdGNvdW50cyA9IGNvbGxlY3RUZXN0U3RhdGVDb3VudHMoZmFsc2UsIFtsYXN0XSk7XG5cdFx0XHRkdXJhdGlvbi50ZXh0Q29udGVudCA9IGxhc3QgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCA/IGZvcm1hdER1cmF0aW9uKGxhc3QuY29tcGxldGVkQXQhIC0gbGFzdC5zdGFydGVkQXQpIDogJyc7XG5cdFx0XHRyZXJ1bi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR9XG5cblx0XHRjb3VudC50ZXh0Q29udGVudCA9IGAke2NvdW50cy5wYXNzZWR9LyR7Y291bnRzLnRvdGFsV2lsbEJlUnVufWA7XG5cdFx0dGhpcy5jb3VudEhvdmVyLnVwZGF0ZShnZXRUZXN0UHJvZ3Jlc3NUZXh0KGNvdW50cykpO1xuXHRcdHRoaXMucmVuZGVyQWN0aXZpdHlCYWRnZShjb3VudHMsIGxpdmUubGVuZ3RoID4gMCk7XG5cblx0XHRpZiAoIXRoaXMuZWxlbWVudHNXZXJlQXR0YWNoZWQpIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0XHR0aGlzLmVsZW1lbnRzV2VyZUF0dGFjaGVkID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFjdGl2aXR5QmFkZ2UoY291bnRTdW1tYXJ5OiBDb3VudFN1bW1hcnksIGlzUnVubmluZzogYm9vbGVhbikge1xuXHRcdGlmIChpc1J1bm5pbmcpIHtcblx0XHRcdGlmICh0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZSAmJiB0aGlzLmxhc3RCYWRnZSBpbnN0YW5jZW9mIEljb25CYWRnZSAmJiB0aGlzLmxhc3RCYWRnZS5pY29uID09PSBzcGlubmluZ0xvYWRpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxhc3RCYWRnZSA9IG5ldyBJY29uQmFkZ2Uoc3Bpbm5pbmdMb2FkaW5nLCAoKSA9PiBsb2NhbGl6ZSgndGVzdGluZ1J1bm5pbmdCYWRnZScsICdUZXN0cyBhcmUgcnVubmluZycpKTtcblx0XHR9IGVsc2UgaWYgKGNvdW50U3VtbWFyeSAmJiB0aGlzLmJhZGdlVHlwZSAhPT0gVGVzdGluZ0NvdW50QmFkZ2UuT2ZmICYmIGNvdW50U3VtbWFyeVt0aGlzLmJhZGdlVHlwZV0gIT09IDApIHtcblx0XHRcdGlmICh0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZSAmJiB0aGlzLmxhc3RCYWRnZSBpbnN0YW5jZW9mIE51bWJlckJhZGdlICYmIHRoaXMubGFzdEJhZGdlLm51bWJlciA9PT0gY291bnRTdW1tYXJ5W3RoaXMuYmFkZ2VUeXBlXSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubGFzdEJhZGdlID0gbmV3IE51bWJlckJhZGdlKGNvdW50U3VtbWFyeVt0aGlzLmJhZGdlVHlwZV0sIG51bSA9PiB0aGlzLmdldExvY2FsaXplZEJhZGdlU3RyaW5nKHRoaXMuYmFkZ2VUeXBlLCBudW0pKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY3JTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRpZiAodGhpcy5iYWRnZURpc3Bvc2FibGUudmFsdWUgJiYgdGhpcy5sYXN0QmFkZ2UgaW5zdGFuY2VvZiBJY29uQmFkZ2UgJiYgdGhpcy5sYXN0QmFkZ2UuaWNvbiA9PT0gaWNvbnMudGVzdGluZ0NvbnRpbnVvdXNJc09uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sYXN0QmFkZ2UgPSBuZXcgSWNvbkJhZGdlKGljb25zLnRlc3RpbmdDb250aW51b3VzSXNPbiwgKCkgPT4gbG9jYWxpemUoJ3Rlc3RpbmdDb250aW51b3VzQmFkZ2UnLCAnVGVzdHMgYXJlIGJlaW5nIHdhdGNoZWQgZm9yIGNoYW5nZXMnKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghdGhpcy5sYXN0QmFkZ2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxhc3RCYWRnZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMubGFzdEJhZGdlICYmIHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3QWN0aXZpdHkoVGVzdGluZy5FeHBsb3JlclZpZXdJZCwgeyBiYWRnZTogdGhpcy5sYXN0QmFkZ2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldExvY2FsaXplZEJhZGdlU3RyaW5nKGNvdW50QmFkZ2VUeXBlOiBUZXN0aW5nQ291bnRCYWRnZSwgY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChjb3VudEJhZGdlVHlwZSkge1xuXHRcdFx0Y2FzZSBUZXN0aW5nQ291bnRCYWRnZS5QYXNzZWQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdGluZ0NvdW50QmFkZ2VQYXNzZWQnLCAnezB9IHBhc3NlZCB0ZXN0cycsIGNvdW50KTtcblx0XHRcdGNhc2UgVGVzdGluZ0NvdW50QmFkZ2UuU2tpcHBlZDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0aW5nQ291bnRCYWRnZVNraXBwZWQnLCAnezB9IHNraXBwZWQgdGVzdHMnLCBjb3VudCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RpbmdDb3VudEJhZGdlRmFpbGVkJywgJ3swfSBmYWlsZWQgdGVzdHMnLCBjb3VudCk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGVudW0gV2VsY29tZUV4cGVyaWVuY2Uge1xuXHROb25lLFxuXHRGb3JXb3Jrc3BhY2UsXG5cdEZvckRvY3VtZW50LFxufVxuXG5jbGFzcyBUZXN0aW5nRXhwbG9yZXJWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHRyZWU6IFRlc3RpbmdPYmplY3RUcmVlPEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIGZpbHRlcjogVGVzdHNGaWx0ZXI7XG5cdHB1YmxpYyByZWFkb25seSBwcm9qZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElUZXN0VHJlZVByb2plY3Rpb24+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmV2ZWFsVGltZW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld01vZGU6IElDb250ZXh0S2V5PFRlc3RFeHBsb3JlclZpZXdNb2RlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld1NvcnRpbmc6IElDb250ZXh0S2V5PFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSB3ZWxjb21lVmlzaWJpbGl0eUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXZWxjb21lRXhwZXJpZW5jZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRlc3RFeHBsb3JlckFjdGlvblJ1bm5lcigoKSA9PiB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKGlzRGVmaW5lZCkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBsYXN0Vmlld1N0YXRlOiBTdG9yZWRWYWx1ZTxJU2VyaWFsaXplZFRlc3RUcmVlQ29sbGFwc2VTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgbm9UZXN0Rm9yRG9jdW1lbnRXaWRnZXQ6IE5vVGVzdHNGb3JEb2N1bWVudFdpZGdldDtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGVyZSdzIGEgcmV2ZWFsIHJlcXVlc3Qgd2hpY2ggaGFzIG5vdCB5ZXQgYmVlbiBkZWxpdmVyZWQuIFRoaXNcblx0ICogY2FuIGhhcHBlbiBpZiB0aGUgdXNlciBhc2tzIHRvIHJldmVhbCBiZWZvcmUgdGhlIHRlc3QgdHJlZSBpcyBsb2FkZWQuXG5cdCAqIFdlIGNoZWNrIHRvIHNlZSBpZiB0aGUgcmV2ZWFsIHJlcXVlc3QgaXMgcHJlc2VudCBvbiBlYWNoIHRyZWUgdXBkYXRlLFxuXHQgKiBhbmQgZG8gaXQgdGhlbiBpZiBzby5cblx0ICovXG5cdHByaXZhdGUgaGFzUGVuZGluZ1JldmVhbCA9IGZhbHNlO1xuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgcGxhY2Vob2xkZXIgc3RhdGUgY2hhbmdlcy5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBvbkNoYW5nZVdlbGNvbWVWaXNpYmlsaXR5ID0gdGhpcy53ZWxjb21lVmlzaWJpbGl0eUVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciB0aGUgd2VsY29tZSBzaG91bGQgYmUgdmlzaWJsZS5cblx0ICovXG5cdHB1YmxpYyB3ZWxjb21lRXhwZXJpZW5jZSA9IFdlbGNvbWVFeHBlcmllbmNlLk5vbmU7XG5cblx0cHVibGljIGdldCB2aWV3TW9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld01vZGUuZ2V0KCkgPz8gVGVzdEV4cGxvcmVyVmlld01vZGUuVHJlZTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdmlld01vZGUobmV3TW9kZTogVGVzdEV4cGxvcmVyVmlld01vZGUpIHtcblx0XHRpZiAobmV3TW9kZSA9PT0gdGhpcy5fdmlld01vZGUuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3TW9kZS5zZXQobmV3TW9kZSk7XG5cdFx0dGhpcy51cGRhdGVQcmVmZXJyZWRQcm9qZWN0aW9uKCk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSgndGVzdGluZy52aWV3TW9kZScsIG5ld01vZGUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXG5cdHB1YmxpYyBnZXQgdmlld1NvcnRpbmcoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdTb3J0aW5nLmdldCgpID8/IFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLkJ5U3RhdHVzO1xuXHR9XG5cblx0cHVibGljIHNldCB2aWV3U29ydGluZyhuZXdTb3J0aW5nOiBUZXN0RXhwbG9yZXJWaWV3U29ydGluZykge1xuXHRcdGlmIChuZXdTb3J0aW5nID09PSB0aGlzLl92aWV3U29ydGluZy5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXdTb3J0aW5nLnNldChuZXdTb3J0aW5nKTtcblx0XHR0aGlzLnRyZWUucmVzb3J0KG51bGwpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Rlc3Rpbmcudmlld1NvcnRpbmcnLCBuZXdTb3J0aW5nLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASVRlc3RFeHBsb3JlckZpbHRlclN0YXRlIHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyU3RhdGU6IFRlc3RFeHBsb3JlckZpbHRlclN0YXRlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UmVzdWx0czogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJVGVzdGluZ1BlZWtPcGVuZXIgcHJpdmF0ZSByZWFkb25seSBwZWVrT3BlbmVyOiBJVGVzdGluZ1BlZWtPcGVuZXIsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UHJvZmlsZVNlcnZpY2U6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjclNlcnZpY2U6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5oYXNQZW5kaW5nUmV2ZWFsID0gISFmaWx0ZXJTdGF0ZS5yZXZlYWwuZ2V0KCk7XG5cdFx0dGhpcy5ub1Rlc3RGb3JEb2N1bWVudFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vVGVzdHNGb3JEb2N1bWVudFdpZGdldCwgbGlzdENvbnRhaW5lcikpO1xuXHRcdHRoaXMubGFzdFZpZXdTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yZWRWYWx1ZTxJU2VyaWFsaXplZFRlc3RUcmVlQ29sbGFwc2VTdGF0ZT4oe1xuXHRcdFx0a2V5OiAndGVzdGluZy50cmVlU3RhdGUnLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuTUFDSElORSxcblx0XHR9LCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fdmlld01vZGUgPSBUZXN0aW5nQ29udGV4dEtleXMudmlld01vZGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl92aWV3U29ydGluZyA9IFRlc3RpbmdDb250ZXh0S2V5cy52aWV3U29ydGluZy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3ZpZXdNb2RlLnNldCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCgndGVzdGluZy52aWV3TW9kZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFRlc3RFeHBsb3JlclZpZXdNb2RlLlRyZWUpIGFzIFRlc3RFeHBsb3JlclZpZXdNb2RlKTtcblx0XHR0aGlzLl92aWV3U29ydGluZy5zZXQodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Rlc3Rpbmcudmlld1NvcnRpbmcnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBUZXN0RXhwbG9yZXJWaWV3U29ydGluZy5CeUxvY2F0aW9uKSBhcyBUZXN0RXhwbG9yZXJWaWV3U29ydGluZyk7XG5cblx0XHR0aGlzLnJlZXZhbHVhdGVXZWxjb21lU3RhdGUoKTtcblx0XHR0aGlzLmZpbHRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdHNGaWx0ZXIsIHRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24pO1xuXHRcdHRoaXMudHJlZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VGVzdGluZ09iamVjdFRyZWUsXG5cdFx0XHQnVGVzdCBFeHBsb3JlciBMaXN0Jyxcblx0XHRcdGxpc3RDb250YWluZXIsXG5cdFx0XHRuZXcgTGlzdERlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RJdGVtUmVuZGVyZXIsIHRoaXMuYWN0aW9uUnVubmVyKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXJyb3JSZW5kZXJlciksXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJZGVudGl0eVByb3ZpZGVyKSxcblx0XHRcdFx0aGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50czogZmFsc2UsXG5cdFx0XHRcdHNvcnRlcjogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVNvcnRlciwgdGhpcyksXG5cdFx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyKSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyKSxcblx0XHRcdFx0ZmlsdGVyOiB0aGlzLmZpbHRlcixcblx0XHRcdFx0ZmluZFdpZGdldEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0fSkgYXMgVGVzdGluZ09iamVjdFRyZWU8RnV6enlTY29yZT47XG5cblxuXHRcdC8vIHNhdmVzIHRoZSBjb2xsYXBzZSBzdGF0ZSBzbyB0aGF0IGlmIGl0ZW1zIGFyZSByZW1vdmVkIG9yIHJlZnJlc2hlZCwgdGhleVxuXHRcdC8vIHJldGFpbiB0aGUgc2FtZSBzdGF0ZSAoIzE3MDE2OSlcblx0XHRjb25zdCBjb2xsYXBzZVN0YXRlU2F2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHQvLyByZXVzZSB0aGUgbGFzdCB2aWV3IHN0YXRlIHRvIGF2b2lkIG1ha2luZyBhIGJ1bmNoIG9mIG9iamVjdCBnYXJiYWdlOlxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRyZWUuZ2V0T3B0aW1pemVkVmlld1N0YXRlKHRoaXMubGFzdFZpZXdTdGF0ZS5nZXQoe30pKTtcblx0XHRcdGNvbnN0IHByb2plY3Rpb24gPSB0aGlzLnByb2plY3Rpb24udmFsdWU7XG5cdFx0XHRpZiAocHJvamVjdGlvbikge1xuXHRcdFx0XHRwcm9qZWN0aW9uLmxhc3RTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0fVxuXHRcdH0sIDMwMDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoZXZ0ID0+IHtcblx0XHRcdGlmIChldnQubm9kZS5lbGVtZW50IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCkge1xuXHRcdFx0XHRpZiAoIWV2dC5ub2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdHRoaXMucHJvamVjdGlvbi52YWx1ZT8uZXhwYW5kRWxlbWVudChldnQubm9kZS5lbGVtZW50LCBldnQuZGVlcCA/IEluZmluaXR5IDogMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29sbGFwc2VTdGF0ZVNhdmVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jclNlcnZpY2Uub25EaWRDaGFuZ2UodGVzdElkID0+IHtcblx0XHRcdGlmICh0ZXN0SWQpIHtcblx0XHRcdFx0Ly8gYSBjb250aW51b3VzIHJ1biB0ZXN0IHdpbGwgc29ydCB0byB0aGUgdG9wOlxuXHRcdFx0XHRjb25zdCBlbGVtID0gdGhpcy5wcm9qZWN0aW9uLnZhbHVlPy5nZXRFbGVtZW50QnlUZXN0SWQodGVzdElkKTtcblx0XHRcdFx0dGhpcy50cmVlLnJlc29ydChlbGVtPy5wYXJlbnQgJiYgdGhpcy50cmVlLmhhc0VsZW1lbnQoZWxlbS5wYXJlbnQpID8gZWxlbS5wYXJlbnQgOiBudWxsLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VWaXNpYmlsaXR5KHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5lbnN1cmVQcm9qZWN0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdGZpbHRlclN0YXRlLnRleHQub25EaWRDaGFuZ2UsXG5cdFx0XHRmaWx0ZXJTdGF0ZS5mdXp6eS5vbkRpZENoYW5nZSxcblx0XHRcdHRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLm9uVGVzdEV4Y2x1c2lvbnNDaGFuZ2VkLFxuXHRcdCkoKCkgPT4ge1xuXHRcdFx0aWYgKCFmaWx0ZXJTdGF0ZS50ZXh0LnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmZpbHRlci5sYXN0SW5jbHVkZWRUZXN0cyA9IG5ldyBTZXQoKTtcblx0XHRcdHRoaXMudHJlZS5yZWZpbHRlcigpO1xuXHRcdFx0dGhpcy5maWx0ZXIubGFzdEluY2x1ZGVkVGVzdHMgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAoY29uc3QgdGVzdCBvZiBpdGVtcykge1xuXHRcdFx0XHR0aGlzLnRyZWUuZXhwYW5kVG8odGVzdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGlmICghKGUuZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZmlsdGVyU3RhdGUuZGlkU2VsZWN0VGVzdEluRXhwbG9yZXIoZS5lbGVtZW50LnRlc3QuaXRlbS5leHRJZCk7XG5cblx0XHRcdGlmICghZS5lbGVtZW50LmNoaWxkcmVuLnNpemUgJiYgZS5lbGVtZW50LnRlc3QuaXRlbS51cmkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLnRyeVBlZWtFcnJvcihlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5yZXZlYWxUZXN0JywgZS5lbGVtZW50LnRlc3QuaXRlbS5leHRJZCwge1xuXHRcdFx0XHRcdFx0b3BlblRvU2lkZTogZS5zaWRlQnlTaWRlLFxuXHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uQ2hhbmdlV2VsY29tZVZpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHR0aGlzLm5vVGVzdEZvckRvY3VtZW50V2lkZ2V0LnNldFZpc2libGUoZSA9PT0gV2VsY29tZUV4cGVyaWVuY2UuRm9yRG9jdW1lbnQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKSwgJ2tleWRvd24nLCBldnQgPT4ge1xuXHRcdFx0aWYgKGV2dC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVFeGVjdXRlS2V5cHJlc3MoZXZ0KTtcblx0XHRcdH0gZWxzZSBpZiAoRGVmYXVsdEtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlLm1pZ2h0UHJvZHVjZVByaW50YWJsZUNoYXJhY3RlcihldnQpKSB7XG5cdFx0XHRcdGZpbHRlclN0YXRlLnRleHQudmFsdWUgPSBldnQuYnJvd3NlckV2ZW50LmtleTtcblx0XHRcdFx0ZmlsdGVyU3RhdGUuZm9jdXNJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMucmV2ZWFsQnlJZChmaWx0ZXJTdGF0ZS5yZXZlYWwucmVhZChyZWFkZXIpLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRmaWx0ZXJTdGF0ZS5mb2N1c0lucHV0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGZvbGxvd1J1bm5pbmdUZXN0cyA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5Gb2xsb3dSdW5uaW5nVGVzdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVzdGluZ0NvbmZpZ0tleXMuRm9sbG93UnVubmluZ1Rlc3QpKSB7XG5cdFx0XHRcdGZvbGxvd1J1bm5pbmdUZXN0cyA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5Gb2xsb3dSdW5uaW5nVGVzdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGFsd2F5c1JldmVhbFRlc3RBZnRlclN0YXRlQ2hhbmdlID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLkFsd2F5c1JldmVhbFRlc3RPblN0YXRlQ2hhbmdlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXN0aW5nQ29uZmlnS2V5cy5BbHdheXNSZXZlYWxUZXN0T25TdGF0ZUNoYW5nZSkpIHtcblx0XHRcdFx0YWx3YXlzUmV2ZWFsVGVzdEFmdGVyU3RhdGVDaGFuZ2UgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuQWx3YXlzUmV2ZWFsVGVzdE9uU3RhdGVDaGFuZ2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlc3RSZXN1bHRzLm9uVGVzdENoYW5nZWQoZXZ0ID0+IHtcblx0XHRcdGlmICghZm9sbG93UnVubmluZ1Rlc3RzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2dC5yZWFzb24gIT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudHJlZS5zZWxlY3Rpb25TaXplID4gMSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvbid0IGNoYW5nZSBhIG11bHRpLXNlbGVjdGlvbiAjMTgwOTUwXG5cdFx0XHR9XG5cblx0XHRcdC8vIGZvbGxvdyBydW5uaW5nIHRlc3RzLCBvciB0ZXN0cyB3aG9zZSBzdGF0ZSBjaGFuZ2VkLiBUZXN0cyB0aGF0XG5cdFx0XHQvLyBjb21wbGV0ZSB2ZXJ5IGZhc3QgbWF5IG5vdCBlbnRlciB0aGUgcnVubmluZyBzdGF0ZSBhdCBhbGwuXG5cdFx0XHRpZiAoZXZ0Lml0ZW0ub3duQ29tcHV0ZWRTdGF0ZSAhPT0gVGVzdFJlc3VsdFN0YXRlLlJ1bm5pbmcgJiYgIShldnQucHJldmlvdXNTdGF0ZSA9PT0gVGVzdFJlc3VsdFN0YXRlLlF1ZXVlZCAmJiBpc1N0YXRlV2l0aFJlc3VsdChldnQuaXRlbS5vd25Db21wdXRlZFN0YXRlKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJldmVhbEJ5SWQoZXZ0Lml0ZW0uaXRlbS5leHRJZCwgYWx3YXlzUmV2ZWFsVGVzdEFmdGVyU3RhdGVDaGFuZ2UsIGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0UmVzdWx0cy5vblJlc3VsdHNDaGFuZ2VkKCgpID0+IHtcblx0XHRcdHRoaXMudHJlZS5yZXNvcnQobnVsbCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXN0UHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy50cmVlLnJlcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWxsT3BlbkVkaXRvcklucHV0cyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdGVkaXRvclNlcnZpY2Uub25EaWRFZGl0b3JzQ2hhbmdlLFxuXHRcdFx0KCkgPT4gbmV3IFNldChlZGl0b3JHcm91cHNTZXJ2aWNlLmdyb3Vwcy5mbGF0TWFwKGcgPT4gZy5lZGl0b3JzKS5tYXAoZSA9PiBlLnJlc291cmNlKS5maWx0ZXIoaXNEZWZpbmVkKSksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdGl2ZVJlc291cmNlID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLnByaW1hcnkucmVzb3VyY2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I/LnJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsdGVyVGV4dCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5maWx0ZXJTdGF0ZS50ZXh0Lm9uRGlkQ2hhbmdlLCAoKSA9PiB0aGlzLmZpbHRlclN0YXRlLnRleHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGZpbHRlclRleHQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMuZmlsdGVyU3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uT3BlbmVkRmlsZXMpKSB7XG5cdFx0XHRcdHRoaXMuZmlsdGVyLmZpbHRlclRvRG9jdW1lbnRVcmkoWy4uLmFsbE9wZW5FZGl0b3JJbnB1dHMucmVhZChyZWFkZXIpXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbHRlci5maWx0ZXJUb0RvY3VtZW50VXJpKFthY3RpdmVSZXNvdXJjZS5yZWFkKHJlYWRlcildLmZpbHRlcihpc0RlZmluZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZmlsdGVyU3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uQ3VycmVudERvYykgfHwgdGhpcy5maWx0ZXJTdGF0ZS5pc0ZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5PcGVuZWRGaWxlcykpIHtcblx0XHRcdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKHsgcmVhc29uLCB9KSA9PiB7XG5cdFx0XHRpZiAocmVhc29uID09PSBXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKSB7XG5cdFx0XHRcdHRoaXMubGFzdFZpZXdTdGF0ZS5zdG9yZSh0aGlzLnRyZWUuZ2V0T3B0aW1pemVkVmlld1N0YXRlKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1sYXlvdXQgdGhlIHRyZWUuXG5cdCAqL1xuXHRwdWJsaWMgbGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyaWVzIHRvIHJldmVhbCBieSBleHRlbnNpb24gSUQuIFF1ZXVlcyB0aGUgcmVxdWVzdCBpZiB0aGUgZXh0ZW5zaW9uXG5cdCAqIElEIGlzIG5vdCBjdXJyZW50bHkgYXZhaWxhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSByZXZlYWxCeUlkKGlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4cGFuZCA9IHRydWUsIGZvY3VzID0gdHJ1ZSkge1xuXHRcdGlmICghaWQpIHtcblx0XHRcdHRoaXMuaGFzUGVuZGluZ1JldmVhbCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2plY3Rpb24gPSB0aGlzLmVuc3VyZVByb2plY3Rpb24oKTtcblxuXHRcdC8vIElmIHRoZSBpdGVtIGl0c2VsZiBpcyB2aXNpYmxlIGluIHRoZSB0cmVlLCBzaG93IGl0LiBPdGhlcndpc2UsIGV4cGFuZFxuXHRcdC8vIGl0cyBjbG9zZXN0IHBhcmVudC5cblx0XHRsZXQgZXhwYW5kVG9MZXZlbCA9IDA7XG5cdFx0Y29uc3QgaWRQYXRoID0gWy4uLlRlc3RJZC5mcm9tU3RyaW5nKGlkKS5pZHNGcm9tUm9vdCgpXTtcblx0XHRmb3IgKGxldCBpID0gaWRQYXRoLmxlbmd0aCAtIDE7IGkgPj0gZXhwYW5kVG9MZXZlbDsgaS0tKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gcHJvamVjdGlvbi5nZXRFbGVtZW50QnlUZXN0SWQoaWRQYXRoW2ldLnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gU2tpcCBhbGwgZWxlbWVudHMgdGhhdCBhcmVuJ3QgaW4gdGhlIHRyZWUuXG5cdFx0XHRpZiAoIWVsZW1lbnQgfHwgIXRoaXMudHJlZS5oYXNFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGlzICdpZicgaXMgdHJ1ZSwgd2UncmUgYXQgdGhlIGNsb3Nlc3QtdmlzaWJsZSBwYXJlbnQgdG8gdGhlIG5vZGVcblx0XHRcdC8vIHdlIHdhbnQgdG8gZXhwYW5kLiBFeHBhbmQgdGhhdCwgYW5kIHRoZW4gc3RhcnQgdGhlIGxvb3AgYWdhaW4gYmVjYXVzZVxuXHRcdFx0Ly8gd2UgbWlnaHQgYWxyZWFkeSBoYXZlIGNoaWxkcmVuIGZvciBpdC5cblx0XHRcdGlmIChpIDwgaWRQYXRoLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0aWYgKGV4cGFuZCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5leHBhbmQoZWxlbWVudCk7XG5cdFx0XHRcdFx0ZXhwYW5kVG9MZXZlbCA9IGkgKyAxOyAvLyBhdm9pZCBhbiBpbmZpbml0ZSBsb29wIGlmIHRoZSB0ZXN0IGRvZXMgbm90IGV4aXN0XG5cdFx0XHRcdFx0aSA9IGlkUGF0aC5sZW5ndGggLSAxOyAvLyByZXN0YXJ0IHRoZSBsb29wIHNpbmNlIG5ldyBjaGlsZHJlbiBtYXkgbm93IGJlIHZpc2libGVcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UsIHdlJ3ZlIGFycml2ZWQhXG5cblx0XHRcdC8vIElmIHRoZSBub2RlIG9yIGFueSBvZiBpdHMgY2hpbGRyZW4gYXJlIGV4Y2x1ZGVkLCBmbGlwIG9uIHRoZSAnc2hvd1xuXHRcdFx0Ly8gZXhjbHVkZWQgdGVzdHMnIGNoZWNrYm94IGF1dG9tYXRpY2FsbHkuIElmIHdlIGRpZG4ndCBleHBhbmQsIHRoZW4gc2V0XG5cdFx0XHQvLyB0YXJnZXQgZm9jdXMgdGFyZ2V0IHRvIHRoZSBmaXJzdCBjb2xsYXBzZWQgZWxlbWVudC5cblxuXHRcdFx0bGV0IGZvY3VzVGFyZ2V0ID0gZWxlbWVudDtcblx0XHRcdGZvciAobGV0IG46IFRlc3RJdGVtVHJlZUVsZW1lbnQgfCBudWxsID0gZWxlbWVudDsgbiBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQ7IG4gPSBuLnBhcmVudCkge1xuXHRcdFx0XHRpZiAobi50ZXN0ICYmIHRoaXMudGVzdFNlcnZpY2UuZXhjbHVkZWQuY29udGFpbnMobi50ZXN0KSkge1xuXHRcdFx0XHRcdHRoaXMuZmlsdGVyU3RhdGUudG9nZ2xlRmlsdGVyaW5nRm9yKFRlc3RGaWx0ZXJUZXJtLkhpZGRlbiwgdHJ1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWV4cGFuZCAmJiAodGhpcy50cmVlLmhhc0VsZW1lbnQobikgJiYgdGhpcy50cmVlLmlzQ29sbGFwc2VkKG4pKSkge1xuXHRcdFx0XHRcdGZvY3VzVGFyZ2V0ID0gbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmZpbHRlclN0YXRlLnJldmVhbC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5oYXNQZW5kaW5nUmV2ZWFsID0gZmFsc2U7XG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnRyZWUuZ2V0UmVsYXRpdmVUb3AoZm9jdXNUYXJnZXQpID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwoZm9jdXNUYXJnZXQsIDAuNSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmV2ZWFsVGltZW91dC52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtmb2N1c1RhcmdldF0pO1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtmb2N1c1RhcmdldF0pO1xuXHRcdFx0fSwgMSk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBoZXJlLCB3ZSd2ZSBleHBhbmRlZCBhbGwgcGFyZW50cyB3ZSBjYW4uIFdhaXRpbmcgb24gZGF0YSB0byBjb21lXG5cdFx0Ly8gaW4gdG8gcG9zc2libHkgc2hvdyB0aGUgcmV2ZWFsZWQgdGVzdC5cblx0XHR0aGlzLmhhc1BlbmRpbmdSZXZlYWwgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbGxhcHNlIGFsbCBpdGVtcyBpbiB0aGUgdHJlZS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBjb2xsYXBzZUFsbCgpIHtcblx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmllcyB0byBwZWVrIHRoZSBmaXJzdCB0ZXN0IGVycm9yLCBpZiB0aGUgaXRlbSBpcyBpbiBhIGZhaWxlZCBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgdHJ5UGVla0Vycm9yKGl0ZW06IFRlc3RJdGVtVHJlZUVsZW1lbnQpIHtcblx0XHRjb25zdCBsb29rdXAgPSBpdGVtLnRlc3QgJiYgdGhpcy50ZXN0UmVzdWx0cy5nZXRTdGF0ZUJ5SWQoaXRlbS50ZXN0Lml0ZW0uZXh0SWQpO1xuXHRcdHJldHVybiBsb29rdXAgJiYgbG9va3VwWzFdLnRhc2tzLnNvbWUocyA9PiBpc0ZhaWxlZFN0YXRlKHMuc3RhdGUpKVxuXHRcdFx0PyB0aGlzLnBlZWtPcGVuZXIudHJ5UGVla0ZpcnN0RXJyb3IobG9va3VwWzBdLCBsb29rdXBbMV0sIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9KVxuXHRcdFx0OiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShldnQ6IElUcmVlQ29udGV4dE1lbnVFdmVudDxUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCB8IG51bGw+KSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGV2dC5lbGVtZW50O1xuXHRcdGlmICghKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgYWN0aW9ucyB9ID0gZ2V0QWN0aW9uYWJsZUVsZW1lbnRBY3Rpb25zKHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMubWVudVNlcnZpY2UsIHRoaXMudGVzdFNlcnZpY2UsIHRoaXMuY3JTZXJ2aWNlLCB0aGlzLnRlc3RQcm9maWxlU2VydmljZSwgZWxlbWVudCk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZ0LmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMuc2Vjb25kYXJ5LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGVsZW1lbnQsXG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuYWN0aW9uUnVubmVyLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVFeGVjdXRlS2V5cHJlc3MoZXZ0OiBJS2V5Ym9hcmRFdmVudCkge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRsZXQgdGFyZ2V0ZWQ6IChUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCB8IG51bGwpW107XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID09PSAxICYmIHNlbGVjdGVkLmluY2x1ZGVzKGZvY3VzZWRbMF0pKSB7XG5cdFx0XHRldnQuYnJvd3NlckV2ZW50Py5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGFyZ2V0ZWQgPSBzZWxlY3RlZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFyZ2V0ZWQgPSBmb2N1c2VkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvUnVuID0gdGFyZ2V0ZWRcblx0XHRcdC5maWx0ZXIoKGUpOiBlIGlzIFRlc3RJdGVtVHJlZUVsZW1lbnQgPT4gZSBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpO1xuXG5cdFx0aWYgKHRvUnVuLmxlbmd0aCkge1xuXHRcdFx0dGhpcy50ZXN0U2VydmljZS5ydW5UZXN0cyh7XG5cdFx0XHRcdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sXG5cdFx0XHRcdHRlc3RzOiB0b1J1bi5tYXAodCA9PiB0LnRlc3QpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWV2YWx1YXRlV2VsY29tZVN0YXRlKCkge1xuXHRcdGNvbnN0IHNob3VsZFNob3dXZWxjb21lID0gdGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLmJ1c3lQcm92aWRlcnMgPT09IDAgJiYgdGVzdENvbGxlY3Rpb25Jc0VtcHR5KHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbik7XG5cdFx0Y29uc3Qgd2VsY29tZUV4cGVyaWVuY2UgPSBzaG91bGRTaG93V2VsY29tZVxuXHRcdFx0PyAodGhpcy5maWx0ZXJTdGF0ZS5pc0ZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5DdXJyZW50RG9jKSA/IFdlbGNvbWVFeHBlcmllbmNlLkZvckRvY3VtZW50IDogV2VsY29tZUV4cGVyaWVuY2UuRm9yV29ya3NwYWNlKVxuXHRcdFx0OiBXZWxjb21lRXhwZXJpZW5jZS5Ob25lO1xuXG5cdFx0aWYgKHdlbGNvbWVFeHBlcmllbmNlICE9PSB0aGlzLndlbGNvbWVFeHBlcmllbmNlKSB7XG5cdFx0XHR0aGlzLndlbGNvbWVFeHBlcmllbmNlID0gd2VsY29tZUV4cGVyaWVuY2U7XG5cdFx0XHR0aGlzLndlbGNvbWVWaXNpYmlsaXR5RW1pdHRlci5maXJlKHdlbGNvbWVFeHBlcmllbmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZVByb2plY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdGlvbi52YWx1ZSA/PyB0aGlzLnVwZGF0ZVByZWZlcnJlZFByb2plY3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJlZmVycmVkUHJvamVjdGlvbigpIHtcblx0XHR0aGlzLnByb2plY3Rpb24uY2xlYXIoKTtcblxuXHRcdGNvbnN0IGxhc3RTdGF0ZSA9IHRoaXMubGFzdFZpZXdTdGF0ZS5nZXQoe30pO1xuXHRcdGlmICh0aGlzLl92aWV3TW9kZS5nZXQoKSA9PT0gVGVzdEV4cGxvcmVyVmlld01vZGUuTGlzdCkge1xuXHRcdFx0dGhpcy5wcm9qZWN0aW9uLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaXN0UHJvamVjdGlvbiwgbGFzdFN0YXRlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wcm9qZWN0aW9uLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlUHJvamVjdGlvbiwgbGFzdFN0YXRlKTtcblx0XHR9XG5cblx0XHRjb25zdCBzY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmFwcGx5UHJvamVjdGlvbkNoYW5nZXMoKSwgMjAwKSk7XG5cdFx0dGhpcy5wcm9qZWN0aW9uLnZhbHVlLm9uVXBkYXRlKCgpID0+IHtcblx0XHRcdGlmICghc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFwcGx5UHJvamVjdGlvbkNoYW5nZXMoKTtcblx0XHRyZXR1cm4gdGhpcy5wcm9qZWN0aW9uLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVByb2plY3Rpb25DaGFuZ2VzKCkge1xuXHRcdHRoaXMucmVldmFsdWF0ZVdlbGNvbWVTdGF0ZSgpO1xuXHRcdHRoaXMucHJvamVjdGlvbi52YWx1ZT8uYXBwbHlUbyh0aGlzLnRyZWUpO1xuXG5cdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cblx0XHRpZiAodGhpcy5oYXNQZW5kaW5nUmV2ZWFsKSB7XG5cdFx0XHR0aGlzLnJldmVhbEJ5SWQodGhpcy5maWx0ZXJTdGF0ZS5yZXZlYWwuZ2V0KCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBzZWxlY3RlZCB0ZXN0cyBmcm9tIHRoZSB0cmVlLlxuXHQgKi9cblx0cHVibGljIGdldFNlbGVjdGVkVGVzdHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0fVxufVxuXG5jb25zdCBlbnVtIEZpbHRlclJlc3VsdCB7XG5cdEV4Y2x1ZGUsXG5cdEluaGVyaXQsXG5cdEluY2x1ZGUsXG59XG5cbmNvbnN0IGhhc05vZGVJbk9yUGFyZW50T2ZVcmkgPSAoY29sbGVjdGlvbjogSU1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbiwgaWRlbnQ6IElVcmlJZGVudGl0eVNlcnZpY2UsIHRlc3RVcmk6IFVSSSwgZnJvbU5vZGU/OiBzdHJpbmcpID0+IHtcblx0Y29uc3QgcXVldWU6IEl0ZXJhYmxlPHN0cmluZz5bXSA9IFtmcm9tTm9kZSA/IFtmcm9tTm9kZV0gOiBjb2xsZWN0aW9uLnJvb3RJZHNdO1xuXHR3aGlsZSAocXVldWUubGVuZ3RoKSB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBxdWV1ZS5wb3AoKSEpIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBjb2xsZWN0aW9uLmdldE5vZGVCeUlkKGlkKTtcblx0XHRcdGlmICghbm9kZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFub2RlLml0ZW0udXJpIHx8ICFpZGVudC5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHRlc3RVcmksIG5vZGUuaXRlbS51cmkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IHNob3cgbm9kZXMgdGhhdCBjYW4gYmUgZXhwYW5kZWQgKGFuZCBtaWdodCBoYXZlIGEgY2hpbGQgd2l0aFxuXHRcdFx0Ly8gYSByYW5nZSkgb3Igb25lcyB0aGF0IGhhdmUgYSBwaHlzaWNhbCBsb2NhdGlvbi5cblx0XHRcdGlmIChub2RlLml0ZW0ucmFuZ2UgfHwgbm9kZS5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kYWJsZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cXVldWUucHVzaChub2RlLmNoaWxkcmVuKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG5jbGFzcyBUZXN0c0ZpbHRlciBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PiB7XG5cdHByaXZhdGUgZG9jdW1lbnRVcmlzOiBVUklbXSA9IFtdO1xuXG5cdHB1YmxpYyBsYXN0SW5jbHVkZWRUZXN0cz86IFNldDxUZXN0RXhwbG9yZXJUcmVlRWxlbWVudD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb2xsZWN0aW9uOiBJTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLFxuXHRcdEBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUgcHJpdmF0ZSByZWFkb25seSBzdGF0ZTogSVRlc3RFeHBsb3JlckZpbHRlclN0YXRlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGZpbHRlcihlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50KTogVHJlZUZpbHRlclJlc3VsdDx2b2lkPiB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0ZWxlbWVudC50ZXN0XG5cdFx0XHQmJiAhdGhpcy5zdGF0ZS5pc0ZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5IaWRkZW4pXG5cdFx0XHQmJiB0aGlzLnRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLmNvbnRhaW5zKGVsZW1lbnQudGVzdClcblx0XHQpIHtcblx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChNYXRoLm1pbih0aGlzLnRlc3RGaWx0ZXJUZXh0KGVsZW1lbnQpLCB0aGlzLnRlc3RMb2NhdGlvbihlbGVtZW50KSwgdGhpcy50ZXN0U3RhdGUoZWxlbWVudCksIHRoaXMudGVzdFRhZ3MoZWxlbWVudCkpKSB7XG5cdFx0XHRjYXNlIEZpbHRlclJlc3VsdC5FeGNsdWRlOlxuXHRcdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHRcdFx0Y2FzZSBGaWx0ZXJSZXN1bHQuSW5jbHVkZTpcblx0XHRcdFx0dGhpcy5sYXN0SW5jbHVkZWRUZXN0cz8uYWRkKGVsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuVmlzaWJsZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmaWx0ZXJUb0RvY3VtZW50VXJpKHVyaXM6IHJlYWRvbmx5IFVSSVtdKSB7XG5cdFx0dGhpcy5kb2N1bWVudFVyaXMgPSBbLi4udXJpc107XG5cdH1cblxuXHRwcml2YXRlIHRlc3RUYWdzKGVsZW1lbnQ6IFRlc3RJdGVtVHJlZUVsZW1lbnQpOiBGaWx0ZXJSZXN1bHQge1xuXHRcdGlmICghdGhpcy5zdGF0ZS5pbmNsdWRlVGFncy5zaXplICYmICF0aGlzLnN0YXRlLmV4Y2x1ZGVUYWdzLnNpemUpIHtcblx0XHRcdHJldHVybiBGaWx0ZXJSZXN1bHQuSW5jbHVkZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKHRoaXMuc3RhdGUuaW5jbHVkZVRhZ3Muc2l6ZSA/XG5cdFx0XHRlbGVtZW50LnRlc3QuaXRlbS50YWdzLnNvbWUodCA9PiB0aGlzLnN0YXRlLmluY2x1ZGVUYWdzLmhhcyh0KSkgOlxuXHRcdFx0dHJ1ZSkgJiYgZWxlbWVudC50ZXN0Lml0ZW0udGFncy5ldmVyeSh0ID0+ICF0aGlzLnN0YXRlLmV4Y2x1ZGVUYWdzLmhhcyh0KSlcblx0XHRcdD8gRmlsdGVyUmVzdWx0LkluY2x1ZGVcblx0XHRcdDogRmlsdGVyUmVzdWx0LkluaGVyaXQ7XG5cdH1cblxuXHRwcml2YXRlIHRlc3RTdGF0ZShlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50KTogRmlsdGVyUmVzdWx0IHtcblx0XHRpZiAodGhpcy5zdGF0ZS5pc0ZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5GYWlsZWQpKSB7XG5cdFx0XHRyZXR1cm4gaXNGYWlsZWRTdGF0ZShlbGVtZW50LnN0YXRlKSA/IEZpbHRlclJlc3VsdC5JbmNsdWRlIDogRmlsdGVyUmVzdWx0LkluaGVyaXQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uRXhlY3V0ZWQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5zdGF0ZSAhPT0gVGVzdFJlc3VsdFN0YXRlLlVuc2V0ID8gRmlsdGVyUmVzdWx0LkluY2x1ZGUgOiBGaWx0ZXJSZXN1bHQuSW5oZXJpdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluY2x1ZGU7XG5cdH1cblxuXHRwcml2YXRlIHRlc3RMb2NhdGlvbihlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50KTogRmlsdGVyUmVzdWx0IHtcblx0XHRpZiAodGhpcy5kb2N1bWVudFVyaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluY2x1ZGU7XG5cdFx0fVxuXG5cdFx0aWYgKCghdGhpcy5zdGF0ZS5pc0ZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5DdXJyZW50RG9jKSAmJiAhdGhpcy5zdGF0ZS5pc0ZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5PcGVuZWRGaWxlcykpIHx8ICEoZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluY2x1ZGU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZG9jdW1lbnRVcmlzLnNvbWUodXJpID0+IGhhc05vZGVJbk9yUGFyZW50T2ZVcmkodGhpcy5jb2xsZWN0aW9uLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdXJpLCBlbGVtZW50LnRlc3QuaXRlbS5leHRJZCkpKSB7XG5cdFx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluY2x1ZGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEZpbHRlclJlc3VsdC5Jbmhlcml0O1xuXHR9XG5cblx0cHJpdmF0ZSB0ZXN0RmlsdGVyVGV4dChlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUuZ2xvYkxpc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluY2x1ZGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnV6enkgPSB0aGlzLnN0YXRlLmZ1enp5LnZhbHVlO1xuXHRcdGZvciAobGV0IGU6IFRlc3RJdGVtVHJlZUVsZW1lbnQgfCBudWxsID0gZWxlbWVudDsgZTsgZSA9IGUucGFyZW50KSB7XG5cdFx0XHQvLyBzdGFydCBhcyBpbmNsdWRlZCBpZiB0aGUgZmlyc3QgZ2xvYiBpcyBhIG5lZ2F0aW9uXG5cdFx0XHRsZXQgaW5jbHVkZWQgPSB0aGlzLnN0YXRlLmdsb2JMaXN0WzBdLmluY2x1ZGUgPT09IGZhbHNlID8gRmlsdGVyUmVzdWx0LkluY2x1ZGUgOiBGaWx0ZXJSZXN1bHQuSW5oZXJpdDtcblx0XHRcdGNvbnN0IGRhdGEgPSBlLnRlc3QuaXRlbS5sYWJlbC50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHsgaW5jbHVkZSwgdGV4dCB9IG9mIHRoaXMuc3RhdGUuZ2xvYkxpc3QpIHtcblx0XHRcdFx0aWYgKGZ1enp5ID8gZnV6enlDb250YWlucyhkYXRhLCB0ZXh0KSA6IGRhdGEuaW5jbHVkZXModGV4dCkpIHtcblx0XHRcdFx0XHRpbmNsdWRlZCA9IGluY2x1ZGUgPyBGaWx0ZXJSZXN1bHQuSW5jbHVkZSA6IEZpbHRlclJlc3VsdC5FeGNsdWRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbmNsdWRlZCAhPT0gRmlsdGVyUmVzdWx0LkluaGVyaXQpIHtcblx0XHRcdFx0cmV0dXJuIGluY2x1ZGVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBGaWx0ZXJSZXN1bHQuSW5oZXJpdDtcblx0fVxufVxuXG5jbGFzcyBUcmVlU29ydGVyIGltcGxlbWVudHMgSVRyZWVTb3J0ZXI8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZWw6IFRlc3RpbmdFeHBsb3JlclZpZXdNb2RlbCxcblx0KSB7IH1cblxuXHRwdWJsaWMgY29tcGFyZShhOiBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCwgYjogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGlmIChhIGluc3RhbmNlb2YgVGVzdFRyZWVFcnJvck1lc3NhZ2UgfHwgYiBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm4gKGEgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSA/IC0xIDogMCkgKyAoYiBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlID8gMSA6IDApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGR1cmF0aW9uRGVsdGEgPSAoYi5kdXJhdGlvbiB8fCAwKSAtIChhLmR1cmF0aW9uIHx8IDApO1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC52aWV3U29ydGluZyA9PT0gVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlEdXJhdGlvbiAmJiBkdXJhdGlvbkRlbHRhICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gZHVyYXRpb25EZWx0YTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZURlbHRhID0gY21wUHJpb3JpdHkoYS5zdGF0ZSwgYi5zdGF0ZSk7XG5cdFx0aWYgKHRoaXMudmlld01vZGVsLnZpZXdTb3J0aW5nID09PSBUZXN0RXhwbG9yZXJWaWV3U29ydGluZy5CeVN0YXR1cyAmJiBzdGF0ZURlbHRhICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gc3RhdGVEZWx0YTtcblx0XHR9XG5cblx0XHRsZXQgaW5TYW1lTG9jYXRpb24gPSBmYWxzZTtcblx0XHRpZiAoYSBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQgJiYgYiBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQgJiYgYS50ZXN0Lml0ZW0udXJpICYmIGIudGVzdC5pdGVtLnVyaSAmJiBhLnRlc3QuaXRlbS51cmkudG9TdHJpbmcoKSA9PT0gYi50ZXN0Lml0ZW0udXJpLnRvU3RyaW5nKCkgJiYgYS50ZXN0Lml0ZW0ucmFuZ2UgJiYgYi50ZXN0Lml0ZW0ucmFuZ2UpIHtcblx0XHRcdGluU2FtZUxvY2F0aW9uID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgZGVsdGEgPSBhLnRlc3QuaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSBiLnRlc3QuaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRpZiAoZGVsdGEgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGRlbHRhO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNhID0gYS50ZXN0Lml0ZW0uc29ydFRleHQ7XG5cdFx0Y29uc3Qgc2IgPSBiLnRlc3QuaXRlbS5zb3J0VGV4dDtcblx0XHQvLyBJZiB0ZXN0cyBhcmUgaW4gdGhlIHNhbWUgbG9jYXRpb24gYW5kIHRoZXJlJ3Mgbm8gcHJlZmVycmVkIHNvcnRUZXh0LFxuXHRcdC8vIGtlZXAgdGhlIGV4dGVuc2lvbidzIGluc2VydGlvbiBvcmRlciAoIzE2MzQ0OSkuXG5cdFx0cmV0dXJuIGluU2FtZUxvY2F0aW9uICYmICFzYSAmJiAhc2Jcblx0XHRcdD8gMFxuXHRcdFx0OiBjb21wYXJlRmlsZU5hbWVzKHNhIHx8IGEudGVzdC5pdGVtLmxhYmVsLCBzYiB8fCBiLnRlc3QuaXRlbS5sYWJlbCk7XG5cdH1cbn1cblxuY2xhc3MgTm9UZXN0c0ZvckRvY3VtZW50V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWw6IEhUTUxFbGVtZW50O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUgZmlsdGVyU3RhdGU6IElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGVsID0gdGhpcy5lbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnRlc3Rpbmctbm8tdGVzdC1wbGFjZWhvbGRlcicpKTtcblx0XHRjb25zdCBlbXB0eVBhcmFncmFwaCA9IGRvbS5hcHBlbmQoZWwsIGRvbS4kKCdwJykpO1xuXHRcdGVtcHR5UGFyYWdyYXBoLmlubmVyVGV4dCA9IGxvY2FsaXplKCd0ZXN0aW5nTm9UZXN0JywgJ05vIHRlc3RzIHdlcmUgZm91bmQgaW4gdGhpcyBmaWxlLicpO1xuXHRcdGNvbnN0IGJ1dHRvbkxhYmVsID0gbG9jYWxpemUoJ3Rlc3RpbmdGaW5kRXh0ZW5zaW9uJywgJ1Nob3cgV29ya3NwYWNlIFRlc3RzJyk7XG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihlbCwgeyB0aXRsZTogYnV0dG9uTGFiZWwsIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSkpO1xuXHRcdGJ1dHRvbi5sYWJlbCA9IGJ1dHRvbkxhYmVsO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IGZpbHRlclN0YXRlLnRvZ2dsZUZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5DdXJyZW50RG9jLCBmYWxzZSkpKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWaXNpYmxlKGlzVmlzaWJsZTogYm9vbGVhbikge1xuXHRcdHRoaXMuZWwuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIGlzVmlzaWJsZSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEV4cGxvcmVyQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBnZXRTZWxlY3RlZFRlc3RzOiAoKSA9PiBSZWFkb25seUFycmF5PFRlc3RFeHBsb3JlclRyZWVFbGVtZW50Pikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dDogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdHJldHVybiBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGVkVGVzdHMoKTtcblx0XHRjb25zdCBjb250ZXh0SXNTZWxlY3RlZCA9IHNlbGVjdGlvbi5zb21lKHMgPT4gcyA9PT0gY29udGV4dCk7XG5cdFx0Y29uc3QgYWN0dWFsQ29udGV4dCA9IGNvbnRleHRJc1NlbGVjdGVkID8gc2VsZWN0aW9uIDogW2NvbnRleHRdO1xuXHRcdGNvbnN0IGFjdGlvbmFibGUgPSBhY3R1YWxDb250ZXh0LmZpbHRlcigodCk6IHQgaXMgVGVzdEl0ZW1UcmVlRWxlbWVudCA9PiB0IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCk7XG5cdFx0YXdhaXQgYWN0aW9uLnJ1biguLi5hY3Rpb25hYmxlKTtcblx0fVxufVxuXG5jb25zdCBnZXRMYWJlbEZvclRlc3RUcmVlRWxlbWVudCA9IChlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50KSA9PiB7XG5cdGxldCBsYWJlbCA9IGxhYmVsRm9yVGVzdEluU3RhdGUoZWxlbWVudC5kZXNjcmlwdGlvbiB8fCBlbGVtZW50LnRlc3QuaXRlbS5sYWJlbCwgZWxlbWVudC5zdGF0ZSk7XG5cblx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0aWYgKGVsZW1lbnQuZHVyYXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ3Rlc3RpbmcudHJlZUVsZW1lbnRMYWJlbER1cmF0aW9uJyxcblx0XHRcdFx0Y29tbWVudDogWyd7MH0gaXMgdGhlIG9yaWdpbmFsIGxhYmVsIGluIHRlc3RpbmcudHJlZUVsZW1lbnRMYWJlbCwgezF9IGlzIGEgZHVyYXRpb24nXSxcblx0XHRcdH0sICd7MH0sIGluIHsxfScsIGxhYmVsLCBmb3JtYXREdXJhdGlvbihlbGVtZW50LmR1cmF0aW9uKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQucmV0aXJlZCkge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ3Rlc3RpbmcudHJlZUVsZW1lbnRMYWJlbE91dGRhdGVkJyxcblx0XHRcdFx0Y29tbWVudDogWyd7MH0gaXMgdGhlIG9yaWdpbmFsIGxhYmVsIGluIHRlc3RpbmcudHJlZUVsZW1lbnRMYWJlbCddLFxuXHRcdFx0fSwgJ3swfSwgb3V0ZGF0ZWQgcmVzdWx0JywgbGFiZWwpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBsYWJlbDtcbn07XG5cbmNsYXNzIExpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUZXN0RXhwbG9yZXJUcmVlRWxlbWVudD4ge1xuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RFeHBsb3JlcicsIFwiVGVzdCBFeHBsb3JlclwiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZVxuXHRcdFx0PyBlbGVtZW50LmRlc2NyaXB0aW9uXG5cdFx0XHQ6IGdldExhYmVsRm9yVGVzdFRyZWVFbGVtZW50KGVsZW1lbnQpO1xuXHR9XG59XG5cbmNsYXNzIFRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIGltcGxlbWVudHMgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQ+IHtcblx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudDogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQpIHtcblx0XHRyZXR1cm4gZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlID8gZWxlbWVudC5tZXNzYWdlIDogZWxlbWVudC50ZXN0Lml0ZW0ubGFiZWw7XG5cdH1cbn1cblxuY2xhc3MgTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQ+IHtcblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSA/IDE3ICsgMTAgOiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQpIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm4gRXJyb3JSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHRyZXR1cm4gVGVzdEl0ZW1SZW5kZXJlci5JRDtcblx0fVxufVxuXG5jbGFzcyBJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQ+IHtcblx0cHVibGljIGdldElkKGVsZW1lbnQ6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQudHJlZUlkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRXJyb3JUZW1wbGF0ZURhdGEge1xuXHRsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgRXJyb3JSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8VGVzdFRyZWVFcnJvck1lc3NhZ2UsIEZ1enp5U2NvcmUsIElFcnJvclRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXJyb3InO1xuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gRXJyb3JSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRXJyb3JUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuZXJyb3InKSk7XG5cdFx0cmV0dXJuIHsgbGFiZWwsIGRpc3Bvc2FibGU6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudCh7IGVsZW1lbnQgfTogSVRyZWVOb2RlPFRlc3RUcmVlRXJyb3JNZXNzYWdlLCBGdXp6eVNjb3JlPiwgXzogbnVtYmVyLCBkYXRhOiBJRXJyb3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKGRhdGEubGFiZWwpO1xuXG5cdFx0aWYgKHR5cGVvZiBlbGVtZW50Lm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRkYXRhLmxhYmVsLmlubmVyVGV4dCA9IGVsZW1lbnQubWVzc2FnZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZWxlbWVudC5tZXNzYWdlLCB1bmRlZmluZWQsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSk7XG5cdFx0XHRkYXRhLmxhYmVsLmFwcGVuZENoaWxkKHJlc3VsdC5lbGVtZW50KTtcblx0XHR9XG5cdFx0ZGF0YS5kaXNwb3NhYmxlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5sYWJlbCwgZWxlbWVudC5kZXNjcmlwdGlvbikpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKGRhdGE6IElFcnJvclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSB7XG5cdGN1cnJlbnQ/OiBUZXN0SXRlbVRyZWVFbGVtZW50O1xuXHRsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdGljb246IEhUTUxFbGVtZW50O1xuXHR3cmFwcGVyOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGVsZW1lbnREaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBUZXN0SXRlbVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZVxuXHRpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8VGVzdEl0ZW1UcmVlRWxlbWVudCwgRnV6enlTY29yZSwgSVRlc3RFbGVtZW50VGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVzdEl0ZW0nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uUnVubmVyOiBUZXN0RXhwbG9yZXJBY3Rpb25SdW5uZXIsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZmlsZXM6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjclNlcnZpY2U6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gVGVzdEl0ZW1SZW5kZXJlci5JRDtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZW5kZXJUZW1wbGF0ZSh3cmFwcGVyOiBIVE1MRWxlbWVudCk6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSB7XG5cdFx0d3JhcHBlci5jbGFzc0xpc3QuYWRkKCd0ZXN0aW5nLXN0ZHRyZWUtY29udGFpbmVyJyk7XG5cblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZCh3cmFwcGVyLCBkb20uJCgnLmNvbXB1dGVkLXN0YXRlJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZCh3cmFwcGVyLCBkb20uJCgnLmxhYmVsJykpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkb20uYXBwZW5kKHdyYXBwZXIsIGRvbS4kKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLnRlc3RpbmdIaWRkZW5JY29uKSkpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGUuYWRkKG5ldyBBY3Rpb25CYXIod3JhcHBlciwge1xuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+XG5cdFx0XHRcdGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uXG5cdFx0XHRcdFx0PyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pXG5cdFx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlLmFkZCh0aGlzLnByb2ZpbGVzLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0ZW1wbGF0ZURhdGEuY3VycmVudCkge1xuXHRcdFx0XHR0aGlzLmZpbGxBY3Rpb25CYXIodGVtcGxhdGVEYXRhLmN1cnJlbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZS5hZGQodGhpcy5jclNlcnZpY2Uub25EaWRDaGFuZ2UoY2hhbmdlZCA9PiB7XG5cdFx0XHRjb25zdCBpZCA9IHRlbXBsYXRlRGF0YS5jdXJyZW50Py50ZXN0Lml0ZW0uZXh0SWQ7XG5cdFx0XHRpZiAoaWQgJiYgKCFjaGFuZ2VkIHx8IGNoYW5nZWQgPT09IGlkIHx8IFRlc3RJZC5pc0NoaWxkKGlkLCBjaGFuZ2VkKSkpIHtcblx0XHRcdFx0dGhpcy5maWxsQWN0aW9uQmFyKHRlbXBsYXRlRGF0YS5jdXJyZW50ISwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZURhdGE6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSA9IHsgd3JhcHBlciwgbGFiZWwsIGFjdGlvbkJhciwgaWNvbiwgZWxlbWVudERpc3Bvc2FibGU6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSwgdGVtcGxhdGVEaXNwb3NhYmxlOiBkaXNwb3NhYmxlIH07XG5cdFx0cmV0dXJuIHRlbXBsYXRlRGF0YTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRlc3RFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPFRlc3RJdGVtVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBfOiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRlc3RFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGZpbGxBY3Rpb25CYXIoZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCwgZGF0YTogSVRlc3RFbGVtZW50VGVtcGxhdGVEYXRhKSB7XG5cdFx0Y29uc3QgeyBhY3Rpb25zLCBjb250ZXh0T3ZlcmxheSB9ID0gZ2V0QWN0aW9uYWJsZUVsZW1lbnRBY3Rpb25zKHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMubWVudVNlcnZpY2UsIHRoaXMudGVzdFNlcnZpY2UsIHRoaXMuY3JTZXJ2aWNlLCB0aGlzLnByb2ZpbGVzLCBlbGVtZW50KTtcblx0XHRjb25zdCBjclNlbGYgPSAhIWNvbnRleHRPdmVybGF5LmdldENvbnRleHRLZXlWYWx1ZShUZXN0aW5nQ29udGV4dEtleXMuaXNDb250aW51b3VzTW9kZU9uLmtleSk7XG5cdFx0Y29uc3QgY3JDaGlsZCA9ICFjclNlbGYgJiYgdGhpcy5jclNlcnZpY2UuaXNFbmFibGVkRm9yQUNoaWxkT2YoZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgndGVzdGluZy1pcy1jb250aW51b3VzLXJ1bicsIGNyU2VsZiB8fCBjckNoaWxkKTtcblx0XHRkYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGRhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXHRcdGRhdGEuYWN0aW9uQmFyLnB1c2goYWN0aW9ucy5wcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFRlc3RJdGVtVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBfZGVwdGg6IG51bWJlciwgZGF0YTogSVRlc3RFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGRhdGEuY3VycmVudCA9IG5vZGUuZWxlbWVudDtcblxuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKG5vZGUuZWxlbWVudC5vbkNoYW5nZSgoKSA9PiB0aGlzLl9yZW5kZXJFbGVtZW50KG5vZGUsIGRhdGEpKSk7XG5cdFx0dGhpcy5fcmVuZGVyRWxlbWVudChub2RlLCBkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBfcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8VGVzdEl0ZW1UcmVlRWxlbWVudCwgRnV6enlTY29yZT4sIGRhdGE6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZmlsbEFjdGlvbkJhcihub2RlLmVsZW1lbnQsIGRhdGEpO1xuXG5cdFx0Y29uc3QgdGVzdEhpZGRlbiA9IHRoaXMudGVzdFNlcnZpY2UuZXhjbHVkZWQuY29udGFpbnMobm9kZS5lbGVtZW50LnRlc3QpO1xuXHRcdGRhdGEud3JhcHBlci5jbGFzc0xpc3QudG9nZ2xlKCd0ZXN0LWlzLWhpZGRlbicsIHRlc3RIaWRkZW4pO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGljb25zLnRlc3RpbmdTdGF0ZXNUb0ljb25zLmdldChcblx0XHRcdG5vZGUuZWxlbWVudC50ZXN0LmV4cGFuZCA9PT0gVGVzdEl0ZW1FeHBhbmRTdGF0ZS5CdXN5RXhwYW5kaW5nIHx8IG5vZGUuZWxlbWVudC50ZXN0Lml0ZW0uYnVzeVxuXHRcdFx0XHQ/IFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nXG5cdFx0XHRcdDogbm9kZS5lbGVtZW50LnN0YXRlKTtcblxuXHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSAnY29tcHV0ZWQtc3RhdGUgJyArIChpY29uID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pIDogJycpO1xuXHRcdGlmIChub2RlLmVsZW1lbnQucmV0aXJlZCkge1xuXHRcdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSArPSAnIHJldGlyZWQnO1xuXHRcdH1cblxuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBkYXRhLmxhYmVsLCBnZXRMYWJlbEZvclRlc3RUcmVlRWxlbWVudChub2RlLmVsZW1lbnQpKSk7XG5cdFx0aWYgKG5vZGUuZWxlbWVudC50ZXN0Lml0ZW0ubGFiZWwudHJpbSgpKSB7XG5cdFx0XHRkb20ucmVzZXQoZGF0YS5sYWJlbCwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMobm9kZS5lbGVtZW50LnRlc3QuaXRlbS5sYWJlbCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmxhYmVsLnRleHRDb250ZW50ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgweEEwKTsgLy8gJm5ic3A7XG5cdFx0fVxuXG5cdFx0bGV0IGRlc2NyaXB0aW9uID0gbm9kZS5lbGVtZW50LmRlc2NyaXB0aW9uO1xuXHRcdGlmIChub2RlLmVsZW1lbnQuZHVyYXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvblxuXHRcdFx0XHQ/IGAke2Rlc2NyaXB0aW9ufTogJHtmb3JtYXREdXJhdGlvbihub2RlLmVsZW1lbnQuZHVyYXRpb24pfWBcblx0XHRcdFx0OiBmb3JtYXREdXJhdGlvbihub2RlLmVsZW1lbnQuZHVyYXRpb24pO1xuXHRcdH1cblxuXHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0ZG9tLmFwcGVuZChkYXRhLmxhYmVsLCBkb20uJCgnc3Bhbi50ZXN0LWxhYmVsLWRlc2NyaXB0aW9uJywge30sIGRlc2NyaXB0aW9uKSk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGZvcm1hdER1cmF0aW9uID0gKG1zOiBudW1iZXIpID0+IHtcblx0aWYgKG1zIDwgMTApIHtcblx0XHRyZXR1cm4gYCR7bXMudG9GaXhlZCgxKX1tc2A7XG5cdH1cblxuXHRpZiAobXMgPCAxXzAwMCkge1xuXHRcdHJldHVybiBgJHttcy50b0ZpeGVkKDApfW1zYDtcblx0fVxuXG5cdHJldHVybiBgJHsobXMgLyAxMDAwKS50b0ZpeGVkKDEpfXNgO1xufTtcblxuY29uc3QgZ2V0QWN0aW9uYWJsZUVsZW1lbnRBY3Rpb25zID0gKFxuXHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHR0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRjclNlcnZpY2U6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UsXG5cdHByb2ZpbGVzOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHRlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50LFxuKSA9PiB7XG5cdGNvbnN0IHRlc3QgPSBlbGVtZW50IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCA/IGVsZW1lbnQudGVzdCA6IHVuZGVmaW5lZDtcblx0Y29uc3QgY29udGV4dEtleXM6IFtzdHJpbmcsIHVua25vd25dW10gPSBnZXRUZXN0SXRlbUNvbnRleHRPdmVybGF5KHRlc3QsIHRlc3QgPyBwcm9maWxlcy5jYXBhYmlsaXRpZXNGb3JUZXN0KHRlc3QuaXRlbSkgOiAwKTtcblx0Y29udGV4dEtleXMucHVzaChbJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkXSk7XG5cdGlmICh0ZXN0KSB7XG5cdFx0Y29uc3QgY3RybCA9IHRlc3RTZXJ2aWNlLmdldFRlc3RDb250cm9sbGVyKHRlc3QuY29udHJvbGxlcklkKTtcblx0XHRjb25zdCBzdXBwb3J0c0NyID0gISFjdHJsICYmIHByb2ZpbGVzLmdldENvbnRyb2xsZXJQcm9maWxlcyhjdHJsLmlkKS5zb21lKHAgPT5cblx0XHRcdHAuc3VwcG9ydHNDb250aW51b3VzUnVuICYmIGNhblVzZVByb2ZpbGVXaXRoVGVzdChwLCB0ZXN0KSk7XG5cdFx0Y29udGV4dEtleXMucHVzaChbXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY2FuUmVmcmVzaFRlc3RzLmtleSxcblx0XHRcdGN0cmwgJiYgISEoY3RybC5jYXBhYmlsaXRpZXMuZ2V0KCkgJiBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkuUmVmcmVzaCkgJiYgVGVzdElkLmlzUm9vdCh0ZXN0Lml0ZW0uZXh0SWQpLFxuXHRcdF0sIFtcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy50ZXN0SXRlbUlzSGlkZGVuLmtleSxcblx0XHRcdHRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLmNvbnRhaW5zKHRlc3QpXG5cdFx0XSwgW1xuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmlzQ29udGludW91c01vZGVPbi5rZXksXG5cdFx0XHRzdXBwb3J0c0NyICYmIGNyU2VydmljZS5pc1NwZWNpZmljYWxseUVuYWJsZWRGb3IodGVzdC5pdGVtLmV4dElkKVxuXHRcdF0sIFtcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc1BhcmVudFJ1bm5pbmdDb250aW51b3VzbHkua2V5LFxuXHRcdFx0c3VwcG9ydHNDciAmJiBjclNlcnZpY2UuaXNFbmFibGVkRm9yQVBhcmVudE9mKHRlc3QuaXRlbS5leHRJZClcblx0XHRdLCBbXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuc3VwcG9ydHNDb250aW51b3VzUnVuLmtleSxcblx0XHRcdHN1cHBvcnRzQ3IsXG5cdFx0XSwgW1xuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLnRlc3RSZXN1bHRPdXRkYXRlZC5rZXksXG5cdFx0XHRlbGVtZW50LnJldGlyZWQsXG5cdFx0XSwgW1xuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLnRlc3RSZXN1bHRTdGF0ZS5rZXksXG5cdFx0XHR0ZXN0UmVzdWx0U3RhdGVUb0NvbnRleHRWYWx1ZXNbZWxlbWVudC5zdGF0ZV0sXG5cdFx0XSk7XG5cdH1cblxuXHRjb25zdCBjb250ZXh0T3ZlcmxheSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY29udGV4dEtleXMpO1xuXHRjb25zdCBtZW51ID0gbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLlRlc3RJdGVtLCBjb250ZXh0T3ZlcmxheSwge1xuXHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHR9KTtcblxuXHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cblx0cmV0dXJuIHsgYWN0aW9ucywgY29udGV4dE92ZXJsYXkgfTtcbn07XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGlmICh0aGVtZS50eXBlID09PSAnZGFyaycpIHtcblx0XHRjb25zdCBmb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihmb3JlZ3JvdW5kKTtcblx0XHRpZiAoZm9yZWdyb3VuZENvbG9yKSB7XG5cdFx0XHRjb25zdCBmZ1dpdGhPcGFjaXR5ID0gbmV3IENvbG9yKG5ldyBSR0JBKGZvcmVncm91bmRDb2xvci5yZ2JhLnIsIGZvcmVncm91bmRDb2xvci5yZ2JhLmcsIGZvcmVncm91bmRDb2xvci5yZ2JhLmIsIDAuNjUpKTtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAudGVzdC1leHBsb3JlciAudGVzdC1leHBsb3Jlci1tZXNzYWdlcyB7IGNvbG9yOiAke2ZnV2l0aE9wYWNpdHl9OyB9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
