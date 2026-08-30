import { distinct } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isDefined } from "../../../../base/common/types.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { SymbolNavigationAction } from "../../../../editor/contrib/gotoSymbol/browser/goToCommands.js";
import { ReferencesModel } from "../../../../editor/contrib/gotoSymbol/browser/referencesModel.js";
import { MessageController } from "../../../../editor/contrib/message/browser/messageController.js";
import { PeekContext } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, ContextKeyGreaterExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { widgetClose } from "../../../../platform/theme/common/iconRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ViewAction } from "../../../browser/parts/views/viewPane.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { TestItemTreeElement } from "./explorerProjections/index.js";
import * as icons from "./icons.js";
import { TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing, testConfigurationGroupNames } from "../common/constants.js";
import { getTestingConfiguration, TestingConfigKeys, TestingResultsViewLayout } from "../common/configuration.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { TestId } from "../common/testId.js";
import { ITestProfileService, canUseProfileWithTest } from "../common/testProfileService.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService, expandAndGetTestById, testsInFile, testsUnderUri } from "../common/testService.js";
import { ExtTestRunProfileKind, TestItemExpandState, TestRunProfileBitset } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { ITestingContinuousRunService } from "../common/testingContinuousRunService.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { isFailedState } from "../common/testingStates.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
const category = Categories.Test;
var ActionOrder = /* @__PURE__ */ ((ActionOrder2) => {
  ActionOrder2[ActionOrder2["Refresh"] = 10] = "Refresh";
  ActionOrder2[ActionOrder2["Run"] = 11] = "Run";
  ActionOrder2[ActionOrder2["Debug"] = 12] = "Debug";
  ActionOrder2[ActionOrder2["Coverage"] = 13] = "Coverage";
  ActionOrder2[ActionOrder2["RunContinuous"] = 14] = "RunContinuous";
  ActionOrder2[ActionOrder2["RunUsing"] = 15] = "RunUsing";
  ActionOrder2[ActionOrder2["Collapse"] = 16] = "Collapse";
  ActionOrder2[ActionOrder2["ClearResults"] = 17] = "ClearResults";
  ActionOrder2[ActionOrder2["DisplayMode"] = 18] = "DisplayMode";
  ActionOrder2[ActionOrder2["Sort"] = 19] = "Sort";
  ActionOrder2[ActionOrder2["GoToTest"] = 20] = "GoToTest";
  ActionOrder2[ActionOrder2["HideTest"] = 21] = "HideTest";
  ActionOrder2[ActionOrder2["ContinuousRunTest"] = 2147483647] = "ContinuousRunTest";
  return ActionOrder2;
})(ActionOrder || {});
const hasAnyTestProvider = ContextKeyGreaterExpr.create(TestingContextKeys.providerCount.key, 0);
const LABEL_RUN_TESTS = localize2("runSelectedTests", "Run Tests");
const LABEL_DEBUG_TESTS = localize2("debugSelectedTests", "Debug Tests");
const LABEL_COVERAGE_TESTS = localize2("coverageSelectedTests", "Run Tests with Coverage");
class HideTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.HideTestAction,
      title: localize2("hideTest", "Hide Test"),
      menu: {
        id: MenuId.TestItem,
        group: "builtin@2",
        when: TestingContextKeys.testItemIsHidden.isEqualTo(false)
      }
    });
  }
  run(accessor, ...elements) {
    const service = accessor.get(ITestService);
    for (const element of elements) {
      service.excluded.toggle(element.test, true);
    }
    return Promise.resolve();
  }
}
class UnhideTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.UnhideTestAction,
      title: localize2("unhideTest", "Unhide Test"),
      menu: {
        id: MenuId.TestItem,
        order: 21 /* HideTest */,
        when: TestingContextKeys.testItemIsHidden.isEqualTo(true)
      }
    });
  }
  run(accessor, ...elements) {
    const service = accessor.get(ITestService);
    for (const element of elements) {
      if (element instanceof TestItemTreeElement) {
        service.excluded.toggle(element.test, false);
      }
    }
    return Promise.resolve();
  }
}
class UnhideAllTestsAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.UnhideAllTestsAction,
      title: localize2("unhideAllTests", "Unhide All Tests")
    });
  }
  run(accessor) {
    const service = accessor.get(ITestService);
    service.excluded.clear();
    return Promise.resolve();
  }
}
const testItemInlineAndInContext = (order, when) => [
  {
    id: MenuId.TestItem,
    group: "inline",
    order,
    when
  },
  {
    id: MenuId.TestItem,
    group: "builtin@1",
    order,
    when
  }
];
class RunVisibleAction extends ViewAction {
  constructor(bitset, desc) {
    super({
      ...desc,
      viewId: Testing.ExplorerViewId
    });
    this.bitset = bitset;
  }
  /**
   * @override
   */
  runInView(accessor, view, ...elements) {
    const { include, exclude } = view.getTreeIncludeExclude(this.bitset, elements.map((e) => e.test));
    return accessor.get(ITestService).runTests({
      tests: include,
      exclude,
      group: this.bitset
    });
  }
}
class DebugAction extends RunVisibleAction {
  constructor() {
    super(TestRunProfileBitset.Debug, {
      id: TestCommandId.DebugAction,
      title: localize2("debug test", "Debug Test"),
      icon: icons.testingDebugIcon,
      menu: testItemInlineAndInContext(12 /* Debug */, TestingContextKeys.hasDebuggableTests.isEqualTo(true))
    });
  }
}
class CoverageAction extends RunVisibleAction {
  constructor() {
    super(TestRunProfileBitset.Coverage, {
      id: TestCommandId.RunWithCoverageAction,
      title: localize2("run with cover test", "Run Test with Coverage"),
      icon: icons.testingCoverageIcon,
      menu: testItemInlineAndInContext(13 /* Coverage */, TestingContextKeys.hasCoverableTests.isEqualTo(true))
    });
  }
}
class RunUsingProfileAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.RunUsingProfileAction,
      title: localize2("testing.runUsing", "Execute Using Profile..."),
      icon: icons.testingDebugIcon,
      menu: {
        id: MenuId.TestItem,
        order: 15 /* RunUsing */,
        group: "builtin@2",
        when: TestingContextKeys.hasNonDefaultProfile.isEqualTo(true)
      }
    });
  }
  async run(acessor, ...elements) {
    const commandService = acessor.get(ICommandService);
    const testService = acessor.get(ITestService);
    const profile = await commandService.executeCommand("vscode.pickTestProfile", {
      onlyForTest: elements[0].test
    });
    if (!profile) {
      return;
    }
    testService.runResolvedTests({
      group: profile.group,
      targets: [{
        profileId: profile.profileId,
        controllerId: profile.controllerId,
        testIds: elements.filter((t) => canUseProfileWithTest(profile, t.test)).map((t) => t.test.item.extId)
      }]
    });
  }
}
class RunAction extends RunVisibleAction {
  constructor() {
    super(TestRunProfileBitset.Run, {
      id: TestCommandId.RunAction,
      title: localize2("run test", "Run Test"),
      icon: icons.testingRunIcon,
      menu: testItemInlineAndInContext(11 /* Run */, TestingContextKeys.hasRunnableTests.isEqualTo(true))
    });
  }
}
class SelectDefaultTestProfiles extends Action2 {
  constructor() {
    super({
      id: TestCommandId.SelectDefaultTestProfiles,
      title: localize2("testing.selectDefaultTestProfiles", "Select Default Profile"),
      icon: icons.testingUpdateProfiles,
      category
    });
  }
  async run(acessor, onlyGroup) {
    const commands = acessor.get(ICommandService);
    const testProfileService = acessor.get(ITestProfileService);
    const profiles = await commands.executeCommand("vscode.pickMultipleTestProfiles", {
      showConfigureButtons: false,
      selected: testProfileService.getGroupDefaultProfiles(onlyGroup),
      onlyGroup
    });
    if (profiles?.length) {
      testProfileService.setGroupDefaultProfiles(onlyGroup, profiles);
    }
  }
}
class ContinuousRunTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ToggleContinousRunForTest,
      title: localize2("testing.toggleContinuousRunOn", "Turn on Continuous Run"),
      icon: icons.testingTurnContinuousRunOn,
      precondition: ContextKeyExpr.or(
        TestingContextKeys.isContinuousModeOn.isEqualTo(true),
        TestingContextKeys.isParentRunningContinuously.isEqualTo(false)
      ),
      toggled: {
        condition: TestingContextKeys.isContinuousModeOn.isEqualTo(true),
        icon: icons.testingContinuousIsOn,
        title: localize("testing.toggleContinuousRunOff", "Turn off Continuous Run")
      },
      menu: testItemInlineAndInContext(2147483647 /* ContinuousRunTest */, TestingContextKeys.supportsContinuousRun.isEqualTo(true))
    });
  }
  async run(accessor, ...elements) {
    const crService = accessor.get(ITestingContinuousRunService);
    for (const element of elements) {
      const id = element.test.item.extId;
      if (crService.isSpecificallyEnabledFor(id)) {
        crService.stop(id);
        continue;
      }
      crService.start(TestRunProfileBitset.Run, id);
    }
  }
}
class ContinuousRunUsingProfileTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ContinousRunUsingForTest,
      title: localize2("testing.startContinuousRunUsing", "Start Continous Run Using..."),
      icon: icons.testingDebugIcon,
      menu: [
        {
          id: MenuId.TestItem,
          order: 14 /* RunContinuous */,
          group: "builtin@2",
          when: ContextKeyExpr.and(
            TestingContextKeys.supportsContinuousRun.isEqualTo(true),
            TestingContextKeys.isContinuousModeOn.isEqualTo(false)
          )
        }
      ]
    });
  }
  async run(accessor, ...elements) {
    const crService = accessor.get(ITestingContinuousRunService);
    const profileService = accessor.get(ITestProfileService);
    const notificationService = accessor.get(INotificationService);
    const quickInputService = accessor.get(IQuickInputService);
    for (const element of elements) {
      const selected = await selectContinuousRunProfiles(
        crService,
        notificationService,
        quickInputService,
        [{ profiles: profileService.getControllerProfiles(element.test.controllerId) }]
      );
      if (selected.length) {
        crService.start(selected, element.test.item.extId);
      }
    }
  }
}
class ConfigureTestProfilesAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ConfigureTestProfilesAction,
      title: localize2("testing.configureProfile", "Configure Test Profiles"),
      icon: icons.testingUpdateProfiles,
      f1: true,
      category,
      menu: {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasConfigurableProfile.isEqualTo(true)
      }
    });
  }
  async run(acessor, onlyGroup) {
    const commands = acessor.get(ICommandService);
    const testProfileService = acessor.get(ITestProfileService);
    const profile = await commands.executeCommand("vscode.pickTestProfile", {
      placeholder: localize("configureProfile", "Select a profile to update"),
      showConfigureButtons: false,
      onlyConfigurable: true,
      onlyGroup
    });
    if (profile) {
      testProfileService.configure(profile.controllerId, profile.profileId);
    }
  }
}
const continuousMenus = (whenIsContinuousOn) => [
  {
    id: MenuId.ViewTitle,
    group: "navigation",
    order: 15 /* RunUsing */,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals("view", Testing.ExplorerViewId),
      TestingContextKeys.supportsContinuousRun.isEqualTo(true),
      TestingContextKeys.isContinuousModeOn.isEqualTo(whenIsContinuousOn)
    )
  },
  {
    id: MenuId.CommandPalette,
    when: TestingContextKeys.supportsContinuousRun.isEqualTo(true)
  }
];
class StopContinuousRunAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.StopContinousRun,
      title: localize2("testing.stopContinuous", "Stop Continuous Run"),
      category,
      icon: icons.testingTurnContinuousRunOff,
      menu: continuousMenus(true)
    });
  }
  run(accessor) {
    accessor.get(ITestingContinuousRunService).stop();
  }
}
function selectContinuousRunProfiles(crs, notificationService, quickInputService, profilesToPickFrom) {
  const items = [];
  for (const { controller, profiles } of profilesToPickFrom) {
    for (const profile of profiles) {
      if (profile.supportsContinuousRun) {
        items.push({
          label: profile.label || controller?.label.get() || "",
          description: controller?.label.get(),
          profile
        });
      }
    }
  }
  if (items.length === 0) {
    notificationService.info(localize("testing.noProfiles", "No test continuous run-enabled profiles were found"));
    return Promise.resolve([]);
  }
  if (items.length === 1) {
    return Promise.resolve([items[0].profile]);
  }
  const qpItems = [];
  const selectedItems = [];
  const lastRun = crs.lastRunProfileIds;
  items.sort((a, b) => a.profile.group - b.profile.group || a.profile.controllerId.localeCompare(b.profile.controllerId) || a.label.localeCompare(b.label));
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0 || items[i - 1].profile.group !== item.profile.group) {
      qpItems.push({ type: "separator", label: testConfigurationGroupNames[item.profile.group] });
    }
    qpItems.push(item);
    if (lastRun.has(item.profile.profileId)) {
      selectedItems.push(item);
    }
  }
  const disposables = new DisposableStore();
  const quickpick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
  quickpick.title = localize("testing.selectContinuousProfiles", "Select profiles to run when files change:");
  quickpick.canSelectMany = true;
  quickpick.items = qpItems;
  quickpick.selectedItems = selectedItems;
  quickpick.show();
  return new Promise((resolve) => {
    disposables.add(quickpick.onDidAccept(() => {
      resolve(quickpick.selectedItems.map((i) => i.profile));
      disposables.dispose();
    }));
    disposables.add(quickpick.onDidHide(() => {
      resolve([]);
      disposables.dispose();
    }));
  });
}
class StartContinuousRunAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.StartContinousRun,
      title: localize2("testing.startContinuous", "Start Continuous Run"),
      category,
      icon: icons.testingTurnContinuousRunOn,
      menu: continuousMenus(false)
    });
  }
  async run(accessor) {
    const crs = accessor.get(ITestingContinuousRunService);
    const profileService = accessor.get(ITestProfileService);
    const lastRunProfiles = [...profileService.all()].flatMap((p) => p.profiles.filter((p2) => crs.lastRunProfileIds.has(p2.profileId)));
    if (lastRunProfiles.length) {
      return crs.start(lastRunProfiles);
    }
    const selected = await selectContinuousRunProfiles(crs, accessor.get(INotificationService), accessor.get(IQuickInputService), accessor.get(ITestProfileService).all());
    if (selected.length) {
      crs.start(selected);
    }
  }
}
class ExecuteSelectedAction extends ViewAction {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.ViewTitle,
        order: group === TestRunProfileBitset.Run ? 11 /* Run */ : group === TestRunProfileBitset.Debug ? 12 /* Debug */ : 13 /* Coverage */,
        group: "navigation",
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", Testing.ExplorerViewId),
          TestingContextKeys.isRunning.isEqualTo(false),
          TestingContextKeys.capabilityToContextKey[group].isEqualTo(true)
        )
      }],
      category,
      viewId: Testing.ExplorerViewId
    });
    this.group = group;
  }
  /**
   * @override
   */
  runInView(accessor, view) {
    const { include, exclude } = view.getTreeIncludeExclude(this.group);
    return accessor.get(ITestService).runTests({ tests: include, exclude, group: this.group });
  }
}
class GetSelectedProfiles extends Action2 {
  constructor() {
    super({ id: TestCommandId.GetSelectedProfiles, title: localize2("getSelectedProfiles", "Get Selected Profiles") });
  }
  /**
   * @override
   */
  run(accessor) {
    const profiles = accessor.get(ITestProfileService);
    return [
      ...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Run),
      ...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Debug),
      ...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Coverage)
    ].map((p) => ({
      controllerId: p.controllerId,
      label: p.label,
      kind: p.group & TestRunProfileBitset.Coverage ? ExtTestRunProfileKind.Coverage : p.group & TestRunProfileBitset.Debug ? ExtTestRunProfileKind.Debug : ExtTestRunProfileKind.Run
    }));
  }
}
class GetExplorerSelection extends ViewAction {
  constructor() {
    super({ id: TestCommandId.GetExplorerSelection, title: localize2("getExplorerSelection", "Get Explorer Selection"), viewId: Testing.ExplorerViewId });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    const { include, exclude } = view.getTreeIncludeExclude(TestRunProfileBitset.Run, void 0, "selected");
    const mapper = (i) => i.item.extId;
    return { include: include.map(mapper), exclude: exclude.map(mapper) };
  }
}
class RunSelectedAction extends ExecuteSelectedAction {
  constructor() {
    super({
      id: TestCommandId.RunSelectedAction,
      title: LABEL_RUN_TESTS,
      icon: icons.testingRunAllIcon
    }, TestRunProfileBitset.Run);
  }
}
class DebugSelectedAction extends ExecuteSelectedAction {
  constructor() {
    super({
      id: TestCommandId.DebugSelectedAction,
      title: LABEL_DEBUG_TESTS,
      icon: icons.testingDebugAllIcon
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageSelectedAction extends ExecuteSelectedAction {
  constructor() {
    super({
      id: TestCommandId.CoverageSelectedAction,
      title: LABEL_COVERAGE_TESTS,
      icon: icons.testingCoverageAllIcon
    }, TestRunProfileBitset.Coverage);
  }
}
const showDiscoveringWhile = (progress, task) => {
  return progress.withProgress(
    {
      location: ProgressLocation.Window,
      title: localize("discoveringTests", "Discovering Tests")
    },
    () => task
  );
};
class RunOrDebugAllTestsAction extends Action2 {
  constructor(options, group, noTestsFoundError) {
    super({
      ...options,
      category,
      menu: [{
        id: MenuId.CommandPalette,
        when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true)
      }]
    });
    this.group = group;
    this.noTestsFoundError = noTestsFoundError;
  }
  async run(accessor) {
    const testService = accessor.get(ITestService);
    const notifications = accessor.get(INotificationService);
    const roots = [...testService.collection.rootItems].filter((r) => r.children.size || r.expand === TestItemExpandState.Expandable || r.expand === TestItemExpandState.BusyExpanding);
    if (!roots.length) {
      notifications.info(this.noTestsFoundError);
      return;
    }
    await testService.runTests({ tests: roots, group: this.group });
  }
}
class RunAllAction extends RunOrDebugAllTestsAction {
  constructor() {
    super(
      {
        id: TestCommandId.RunAllAction,
        title: localize2("runAllTests", "Run All Tests"),
        icon: icons.testingRunAllIcon,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyA)
        }
      },
      TestRunProfileBitset.Run,
      localize("noTestProvider", "No tests found in this workspace. You may need to install a test provider extension")
    );
  }
}
class DebugAllAction extends RunOrDebugAllTestsAction {
  constructor() {
    super(
      {
        id: TestCommandId.DebugAllAction,
        title: localize2("debugAllTests", "Debug All Tests"),
        icon: icons.testingDebugIcon,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyA)
        }
      },
      TestRunProfileBitset.Debug,
      localize("noDebugTestProvider", "No debuggable tests found in this workspace. You may need to install a test provider extension")
    );
  }
}
class CoverageAllAction extends RunOrDebugAllTestsAction {
  constructor() {
    super(
      {
        id: TestCommandId.RunAllWithCoverageAction,
        title: localize2("runAllWithCoverage", "Run All Tests with Coverage"),
        icon: icons.testingCoverageIcon,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA)
        }
      },
      TestRunProfileBitset.Coverage,
      localize("noCoverageTestProvider", "No tests with coverage runners found in this workspace. You may need to install a test provider extension")
    );
  }
}
class CancelTestRunAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CancelTestRunAction,
      title: localize2("testing.cancelRun", "Cancel Test Run"),
      icon: icons.testingCancelIcon,
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyX)
      },
      menu: [{
        id: MenuId.ViewTitle,
        order: 11 /* Run */,
        group: "navigation",
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", Testing.ExplorerViewId),
          ContextKeyExpr.equals(TestingContextKeys.isRunning.serialize(), true)
        )
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.isRunning
      }]
    });
  }
  /**
   * @override
   */
  async run(accessor, resultId, taskId) {
    const resultService = accessor.get(ITestResultService);
    const testService = accessor.get(ITestService);
    if (resultId) {
      testService.cancelTestRun(resultId, taskId);
    } else {
      for (const run of resultService.results) {
        if (!run.completedAt) {
          testService.cancelTestRun(run.id);
        }
      }
    }
  }
}
class TestingViewAsListAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingViewAsListAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.viewAsList", "View as List"),
      toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.List),
      menu: {
        id: MenuId.ViewTitle,
        order: 18 /* DisplayMode */,
        group: "viewAs",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewMode = TestExplorerViewMode.List;
  }
}
class TestingViewAsTreeAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingViewAsTreeAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.viewAsTree", "View as Tree"),
      toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.Tree),
      menu: {
        id: MenuId.ViewTitle,
        order: 18 /* DisplayMode */,
        group: "viewAs",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewMode = TestExplorerViewMode.Tree;
  }
}
class TestingSortByStatusAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingSortByStatusAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.sortByStatus", "Sort by Status"),
      toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByStatus),
      menu: {
        id: MenuId.ViewTitle,
        order: 19 /* Sort */,
        group: "sortBy",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewSorting = TestExplorerViewSorting.ByStatus;
  }
}
class TestingSortByLocationAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingSortByLocationAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.sortByLocation", "Sort by Location"),
      toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByLocation),
      menu: {
        id: MenuId.ViewTitle,
        order: 19 /* Sort */,
        group: "sortBy",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewSorting = TestExplorerViewSorting.ByLocation;
  }
}
class TestingSortByDurationAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingSortByDurationAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.sortByDuration", "Sort by Duration"),
      toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByDuration),
      menu: {
        id: MenuId.ViewTitle,
        order: 19 /* Sort */,
        group: "sortBy",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewSorting = TestExplorerViewSorting.ByDuration;
  }
}
class ShowMostRecentOutputAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ShowMostRecentOutputAction,
      title: localize2("testing.showMostRecentOutput", "Show Output"),
      category,
      icon: Codicon.terminal,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyO)
      },
      precondition: TestingContextKeys.hasAnyResults.isEqualTo(true),
      menu: [{
        id: MenuId.ViewTitle,
        order: 16 /* Collapse */,
        group: "navigation",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }]
    });
  }
  async run(accessor) {
    const viewService = accessor.get(IViewsService);
    const testView = await viewService.openView(Testing.ResultsViewId, true);
    testView?.showLatestRun();
  }
}
class CollapseAllAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.CollapseAllAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.collapseAll", "Collapse All Tests"),
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        order: 16 /* Collapse */,
        group: "displayAction",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.collapseAll();
  }
}
class ClearTestResultsAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ClearTestResultsAction,
      title: localize2("testing.clearResults", "Clear All Results"),
      category,
      icon: Codicon.clearAll,
      menu: [{
        id: MenuId.TestPeekTitle
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }, {
        id: MenuId.ViewTitle,
        order: 17 /* ClearResults */,
        group: "displayAction",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }, {
        id: MenuId.ViewTitle,
        order: 17 /* ClearResults */,
        group: "navigation",
        when: ContextKeyExpr.equals("view", Testing.ResultsViewId)
      }]
    });
  }
  /**
   * @override
   */
  run(accessor) {
    accessor.get(ITestResultService).clear();
  }
}
class GoToTest extends Action2 {
  constructor() {
    super({
      id: TestCommandId.GoToTest,
      title: localize2("testing.editFocusedTest", "Go to Test"),
      icon: Codicon.goToFile,
      menu: {
        id: MenuId.TestItem,
        group: "builtin@1",
        order: 20 /* GoToTest */,
        when: TestingContextKeys.testItemHasUri.isEqualTo(true)
      },
      keybinding: {
        weight: KeybindingWeight.EditorContrib - 10,
        when: FocusedViewContext.isEqualTo(Testing.ExplorerViewId),
        primary: KeyCode.Enter | KeyMod.Alt
      }
    });
  }
  async run(accessor, element, preserveFocus) {
    if (!element) {
      const view = accessor.get(IViewsService).getActiveViewWithId(Testing.ExplorerViewId);
      element = view?.focusedTreeElements[0];
    }
    if (element && element instanceof TestItemTreeElement) {
      accessor.get(ICommandService).executeCommand("vscode.revealTest", element.test.item.extId, preserveFocus);
    }
  }
}
async function getTestsAtCursor(testService, uriIdentityService, uri, position, filter) {
  let bestNodes = [];
  let bestRange;
  let bestNodesBefore = [];
  let bestRangeBefore;
  for await (const tests of testsInFile(testService, uriIdentityService, uri)) {
    for (const test of tests) {
      if (!test.item.range || filter?.(test) === false) {
        continue;
      }
      const irange = Range.lift(test.item.range);
      if (irange.containsPosition(position)) {
        if (bestRange && Range.equalsRange(test.item.range, bestRange)) {
          if (!bestNodes.some((b) => TestId.isChild(b.item.extId, test.item.extId))) {
            bestNodes.push(test);
          }
        } else {
          bestRange = irange;
          bestNodes = [test];
        }
      } else if (Position.isBefore(irange.getStartPosition(), position)) {
        if (!bestRangeBefore || bestRangeBefore.getStartPosition().isBefore(irange.getStartPosition())) {
          bestRangeBefore = irange;
          bestNodesBefore = [test];
        } else if (irange.equalsRange(bestRangeBefore) && !bestNodesBefore.some((b) => TestId.isChild(b.item.extId, test.item.extId))) {
          bestNodesBefore.push(test);
        }
      }
    }
  }
  return bestNodes.length ? bestNodes : bestNodesBefore;
}
var EditorContextOrder = /* @__PURE__ */ ((EditorContextOrder2) => {
  EditorContextOrder2[EditorContextOrder2["RunAtCursor"] = 0] = "RunAtCursor";
  EditorContextOrder2[EditorContextOrder2["DebugAtCursor"] = 1] = "DebugAtCursor";
  EditorContextOrder2[EditorContextOrder2["RunInFile"] = 2] = "RunInFile";
  EditorContextOrder2[EditorContextOrder2["DebugInFile"] = 3] = "DebugInFile";
  EditorContextOrder2[EditorContextOrder2["GoToRelated"] = 4] = "GoToRelated";
  EditorContextOrder2[EditorContextOrder2["PeekRelated"] = 5] = "PeekRelated";
  return EditorContextOrder2;
})(EditorContextOrder || {});
class ExecuteTestAtCursor extends Action2 {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.CommandPalette,
        when: hasAnyTestProvider
      }, {
        id: MenuId.EditorContext,
        group: "testing",
        order: group === TestRunProfileBitset.Run ? 0 /* RunAtCursor */ : 1 /* DebugAtCursor */,
        when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group])
      }]
    });
    this.group = group;
  }
  /**
   * @override
   */
  async run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    let editor = codeEditorService.getActiveCodeEditor();
    if (!activeEditorPane || !editor) {
      return;
    }
    if (editor instanceof EmbeddedCodeEditorWidget) {
      editor = editor.getParentEditor();
    }
    const position = editor?.getPosition();
    const model = editor?.getModel();
    if (!position || !model || !("uri" in model)) {
      return;
    }
    const testService = accessor.get(ITestService);
    const profileService = accessor.get(ITestProfileService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const progressService = accessor.get(IProgressService);
    const configurationService = accessor.get(IConfigurationService);
    const saveBeforeTest = getTestingConfiguration(configurationService, TestingConfigKeys.SaveBeforeTest);
    if (saveBeforeTest) {
      await editorService.save({ editor: activeEditorPane.input, groupId: activeEditorPane.group.id });
      await testService.syncTests();
    }
    const testsToRun = await showDiscoveringWhile(
      progressService,
      getTestsAtCursor(
        testService,
        uriIdentityService,
        model.uri,
        position,
        (test) => !!(profileService.capabilitiesForTest(test.item) & this.group)
      )
    );
    if (testsToRun.length) {
      await testService.runTests({ group: this.group, tests: testsToRun });
      return;
    }
    const relatedTests = await testService.getTestsRelatedToCode(model.uri, position);
    if (relatedTests.length) {
      await testService.runTests({ group: this.group, tests: relatedTests });
      return;
    }
    if (editor) {
      MessageController.get(editor)?.showMessage(localize("noTestsAtCursor", "No tests found here"), position);
    }
  }
}
class RunAtCursor extends ExecuteTestAtCursor {
  constructor() {
    super({
      id: TestCommandId.RunAtCursor,
      title: localize2("testing.runAtCursor", "Run Test at Cursor"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyC)
      }
    }, TestRunProfileBitset.Run);
  }
}
class DebugAtCursor extends ExecuteTestAtCursor {
  constructor() {
    super({
      id: TestCommandId.DebugAtCursor,
      title: localize2("testing.debugAtCursor", "Debug Test at Cursor"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyC)
      }
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageAtCursor extends ExecuteTestAtCursor {
  constructor() {
    super({
      id: TestCommandId.CoverageAtCursor,
      title: localize2("testing.coverageAtCursor", "Run Test at Cursor with Coverage"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
      }
    }, TestRunProfileBitset.Coverage);
  }
}
class ExecuteTestsUnderUriAction extends Action2 {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.ExplorerContext,
        when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
        group: "6.5_testing",
        order: (group === TestRunProfileBitset.Run ? 11 /* Run */ : 12 /* Debug */) + 0.1
      }]
    });
    this.group = group;
  }
  async run(accessor, uri) {
    const testService = accessor.get(ITestService);
    const notificationService = accessor.get(INotificationService);
    const tests = await Iterable.asyncToArray(testsUnderUri(
      testService,
      accessor.get(IUriIdentityService),
      uri
    ));
    if (!tests.length) {
      notificationService.notify({ message: localize("noTests", "No tests found in the selected file or folder"), severity: Severity.Info });
      return;
    }
    return testService.runTests({ tests, group: this.group });
  }
}
class RunTestsUnderUri extends ExecuteTestsUnderUriAction {
  constructor() {
    super({
      id: TestCommandId.RunByUri,
      title: LABEL_RUN_TESTS,
      category
    }, TestRunProfileBitset.Run);
  }
}
class DebugTestsUnderUri extends ExecuteTestsUnderUriAction {
  constructor() {
    super({
      id: TestCommandId.DebugByUri,
      title: LABEL_DEBUG_TESTS,
      category
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageTestsUnderUri extends ExecuteTestsUnderUriAction {
  constructor() {
    super({
      id: TestCommandId.CoverageByUri,
      title: LABEL_COVERAGE_TESTS,
      category
    }, TestRunProfileBitset.Coverage);
  }
}
class ExecuteTestsInCurrentFile extends Action2 {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.CommandPalette,
        when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true)
      }, {
        id: MenuId.EditorContext,
        group: "testing",
        order: group === TestRunProfileBitset.Run ? 2 /* RunInFile */ : 3 /* DebugInFile */,
        when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group])
      }]
    });
    this.group = group;
  }
  async _runByUris(accessor, files) {
    const uriIdentity = accessor.get(IUriIdentityService);
    const testService = accessor.get(ITestService);
    const discovered = [];
    for (const uri of files) {
      for await (const files2 of testsInFile(testService, uriIdentity, uri, void 0, true)) {
        for (const file of files2) {
          discovered.push(file);
        }
      }
    }
    if (discovered.length) {
      const r = await testService.runTests({ tests: discovered, group: this.group });
      return { completedAt: r.completedAt };
    }
    return { completedAt: void 0 };
  }
  /**
   * @override
   */
  run(accessor, files) {
    if (files?.length) {
      return this._runByUris(accessor, files);
    }
    const uriIdentity = accessor.get(IUriIdentityService);
    let editor = accessor.get(ICodeEditorService).getActiveCodeEditor();
    if (!editor) {
      return;
    }
    if (editor instanceof EmbeddedCodeEditorWidget) {
      editor = editor.getParentEditor();
    }
    const position = editor?.getPosition();
    const model = editor?.getModel();
    if (!position || !model || !("uri" in model)) {
      return;
    }
    const testService = accessor.get(ITestService);
    const queue = [testService.collection.rootIds];
    const discovered = [];
    while (queue.length) {
      for (const id of queue.pop()) {
        const node = testService.collection.getNodeById(id);
        if (uriIdentity.extUri.isEqual(node.item.uri, model.uri)) {
          discovered.push(node);
        } else {
          queue.push(node.children);
        }
      }
    }
    if (discovered.length) {
      return testService.runTests({
        tests: discovered,
        group: this.group
      });
    }
    if (editor) {
      MessageController.get(editor)?.showMessage(localize("noTestsInFile", "No tests found in this file"), position);
    }
    return void 0;
  }
}
class RunCurrentFile extends ExecuteTestsInCurrentFile {
  constructor() {
    super({
      id: TestCommandId.RunCurrentFile,
      title: localize2("testing.runCurrentFile", "Run Tests in Current File"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyF)
      }
    }, TestRunProfileBitset.Run);
  }
}
class DebugCurrentFile extends ExecuteTestsInCurrentFile {
  constructor() {
    super({
      id: TestCommandId.DebugCurrentFile,
      title: localize2("testing.debugCurrentFile", "Debug Tests in Current File"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyF)
      }
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageCurrentFile extends ExecuteTestsInCurrentFile {
  constructor() {
    super({
      id: TestCommandId.CoverageCurrentFile,
      title: localize2("testing.coverageCurrentFile", "Run Tests with Coverage in Current File"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF)
      }
    }, TestRunProfileBitset.Coverage);
  }
}
const discoverAndRunTests = async (collection, progress, ids, runTests) => {
  const todo = Promise.all(ids.map((p) => expandAndGetTestById(collection, p)));
  const tests = (await showDiscoveringWhile(progress, todo)).filter(isDefined);
  return tests.length ? await runTests(tests) : void 0;
};
class RunOrDebugExtsByPath extends Action2 {
  /**
   * @override
   */
  async run(accessor, ...args) {
    const testService = accessor.get(ITestService);
    await discoverAndRunTests(
      accessor.get(ITestService).collection,
      accessor.get(IProgressService),
      [...this.getTestExtIdsToRun(accessor, ...args)],
      (tests) => this.runTest(testService, tests)
    );
  }
}
class RunOrDebugFailedTests extends RunOrDebugExtsByPath {
  constructor(options) {
    super({
      ...options,
      menu: {
        id: MenuId.CommandPalette,
        when: hasAnyTestProvider
      }
    });
  }
  /**
   * @inheritdoc
   */
  getTestExtIdsToRun(accessor) {
    const { results } = accessor.get(ITestResultService);
    const ids = /* @__PURE__ */ new Set();
    for (let i = results.length - 1; i >= 0; i--) {
      const resultSet = results[i];
      for (const test of resultSet.tests) {
        if (isFailedState(test.ownComputedState)) {
          ids.add(test.item.extId);
        } else {
          ids.delete(test.item.extId);
        }
      }
    }
    return ids;
  }
}
class RunOrDebugLastRun extends Action2 {
  constructor(options) {
    super({
      ...options,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(
          hasAnyTestProvider,
          TestingContextKeys.hasAnyResults.isEqualTo(true)
        )
      }
    });
  }
  getLastTestRunRequest(accessor, runId) {
    const resultService = accessor.get(ITestResultService);
    const lastResult = runId ? resultService.results.find((r) => r.id === runId) : resultService.results[0];
    return lastResult?.request;
  }
  /** @inheritdoc */
  async run(accessor, runId) {
    const resultService = accessor.get(ITestResultService);
    const lastResult = runId ? resultService.results.find((r) => r.id === runId) : resultService.results[0];
    if (!lastResult) {
      return;
    }
    const req = lastResult.request;
    const testService = accessor.get(ITestService);
    const profileService = accessor.get(ITestProfileService);
    const profileExists = (t) => profileService.getControllerProfiles(t.controllerId).some((p) => p.profileId === t.profileId);
    await discoverAndRunTests(
      testService.collection,
      accessor.get(IProgressService),
      req.targets.flatMap((t) => t.testIds),
      (tests) => {
        if (this.getGroup() & req.group && req.targets.every(profileExists)) {
          return testService.runResolvedTests({
            targets: req.targets,
            group: req.group,
            exclude: req.exclude
          });
        } else {
          return testService.runTests({ tests, group: this.getGroup() });
        }
      }
    );
  }
}
class ReRunFailedTests extends RunOrDebugFailedTests {
  constructor() {
    super({
      id: TestCommandId.ReRunFailedTests,
      title: localize2("testing.reRunFailTests", "Rerun Failed Tests"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyE)
      }
    });
  }
  runTest(service, internalTests) {
    return service.runTests({
      group: TestRunProfileBitset.Run,
      tests: internalTests
    });
  }
}
class DebugFailedTests extends RunOrDebugFailedTests {
  constructor() {
    super({
      id: TestCommandId.DebugFailedTests,
      title: localize2("testing.debugFailTests", "Debug Failed Tests"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyE)
      }
    });
  }
  runTest(service, internalTests) {
    return service.runTests({
      group: TestRunProfileBitset.Debug,
      tests: internalTests
    });
  }
}
class ReRunLastRun extends RunOrDebugLastRun {
  constructor() {
    super({
      id: TestCommandId.ReRunLastRun,
      title: localize2("testing.reRunLastRun", "Rerun Last Run"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyL)
      }
    });
  }
  getGroup() {
    return TestRunProfileBitset.Run;
  }
}
class DebugLastRun extends RunOrDebugLastRun {
  constructor() {
    super({
      id: TestCommandId.DebugLastRun,
      title: localize2("testing.debugLastRun", "Debug Last Run"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyL)
      }
    });
  }
  getGroup() {
    return TestRunProfileBitset.Debug;
  }
}
class CoverageLastRun extends RunOrDebugLastRun {
  constructor() {
    super({
      id: TestCommandId.CoverageLastRun,
      title: localize2("testing.coverageLastRun", "Rerun Last Run with Coverage"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL)
      }
    });
  }
  getGroup() {
    return TestRunProfileBitset.Coverage;
  }
}
class RunOrDebugFailedFromLastRun extends Action2 {
  constructor(options) {
    super({
      ...options,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(
          hasAnyTestProvider,
          TestingContextKeys.hasAnyResults.isEqualTo(true)
        )
      }
    });
  }
  /** @inheritdoc */
  async run(accessor, runId) {
    const resultService = accessor.get(ITestResultService);
    const testService = accessor.get(ITestService);
    const progressService = accessor.get(IProgressService);
    const lastResult = runId ? resultService.results.find((r) => r.id === runId) : resultService.results[0];
    if (!lastResult) {
      return;
    }
    const failedTestIds = /* @__PURE__ */ new Set();
    for (const test of lastResult.tests) {
      if (isFailedState(test.ownComputedState)) {
        failedTestIds.add(test.item.extId);
      }
    }
    if (failedTestIds.size === 0) {
      return;
    }
    await discoverAndRunTests(
      testService.collection,
      progressService,
      Array.from(failedTestIds),
      (tests) => testService.runTests({ tests, group: this.getGroup() })
    );
  }
}
class ReRunFailedFromLastRun extends RunOrDebugFailedFromLastRun {
  constructor() {
    super({
      id: TestCommandId.ReRunFailedFromLastRun,
      title: localize2("testing.reRunFailedFromLastRun", "Rerun Failed Tests from Last Run"),
      category
    });
  }
  getGroup() {
    return TestRunProfileBitset.Run;
  }
}
class DebugFailedFromLastRun extends RunOrDebugFailedFromLastRun {
  constructor() {
    super({
      id: TestCommandId.DebugFailedFromLastRun,
      title: localize2("testing.debugFailedFromLastRun", "Debug Failed Tests from Last Run"),
      category
    });
  }
  getGroup() {
    return TestRunProfileBitset.Debug;
  }
}
class SearchForTestExtension extends Action2 {
  constructor() {
    super({
      id: TestCommandId.SearchForTestExtension,
      title: localize2("testing.searchForTestExtension", "Search for Test Extension")
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch('@category:"testing"');
  }
}
class OpenOutputPeek extends Action2 {
  constructor() {
    super({
      id: TestCommandId.OpenOutputPeek,
      title: localize2("testing.openOutputPeek", "Peek Output"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyM)
      },
      menu: {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }
    });
  }
  async run(accessor) {
    accessor.get(ITestingPeekOpener).open();
  }
}
class ToggleInlineTestOutput extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ToggleInlineTestOutput,
      title: localize2("testing.toggleInlineTestOutput", "Toggle Inline Test Output"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyI)
      },
      menu: {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }
    });
  }
  async run(accessor) {
    const testService = accessor.get(ITestService);
    testService.showInlineOutput.value = !testService.showInlineOutput.value;
  }
}
const refreshMenus = (whenIsRefreshing) => [
  {
    id: MenuId.TestItem,
    group: "inline",
    order: 10 /* Refresh */,
    when: ContextKeyExpr.and(
      TestingContextKeys.canRefreshTests.isEqualTo(true),
      TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing)
    )
  },
  {
    id: MenuId.ViewTitle,
    group: "navigation",
    order: 10 /* Refresh */,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals("view", Testing.ExplorerViewId),
      TestingContextKeys.canRefreshTests.isEqualTo(true),
      TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing)
    )
  },
  {
    id: MenuId.CommandPalette,
    when: TestingContextKeys.canRefreshTests.isEqualTo(true)
  }
];
class RefreshTestsAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.RefreshTestsAction,
      title: localize2("testing.refreshTests", "Refresh Tests"),
      category,
      icon: icons.testingRefreshTests,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyR),
        when: TestingContextKeys.canRefreshTests.isEqualTo(true)
      },
      menu: refreshMenus(false)
    });
  }
  async run(accessor, ...elements) {
    const testService = accessor.get(ITestService);
    const progressService = accessor.get(IProgressService);
    const controllerIds = distinct(elements.filter(isDefined).map((e) => e.test.controllerId));
    return progressService.withProgress({ location: Testing.ViewletId }, async () => {
      if (controllerIds.length) {
        await Promise.all(controllerIds.map((id) => testService.refreshTests(id)));
      } else {
        await testService.refreshTests();
      }
    });
  }
}
class CancelTestRefreshAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CancelTestRefreshAction,
      title: localize2("testing.cancelTestRefresh", "Cancel Test Refresh"),
      category,
      icon: icons.testingCancelRefreshTests,
      menu: refreshMenus(true)
    });
  }
  async run(accessor) {
    accessor.get(ITestService).cancelRefreshTests();
  }
}
class CleareCoverage extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageClear,
      title: localize2("testing.clearCoverage", "Clear Coverage"),
      icon: widgetClose,
      category,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 10 /* Refresh */,
        when: ContextKeyExpr.equals("view", Testing.CoverageViewId)
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.isTestCoverageOpen.isEqualTo(true)
      }]
    });
  }
  run(accessor) {
    accessor.get(ITestCoverageService).closeCoverage();
  }
}
class OpenCoverage extends Action2 {
  constructor() {
    super({
      id: TestCommandId.OpenCoverage,
      title: localize2("testing.openCoverage", "Open Coverage"),
      category,
      menu: [{
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }]
    });
  }
  run(accessor) {
    const results = accessor.get(ITestResultService).results;
    const task = results.length && results[0].tasks.find((r) => r.coverage);
    if (!task) {
      const notificationService = accessor.get(INotificationService);
      notificationService.info(localize("testing.noCoverage", "No coverage information available on the last test run."));
      return;
    }
    accessor.get(ITestCoverageService).openCoverage(task, true);
  }
}
class TestNavigationAction extends SymbolNavigationAction {
  runEditorCommand(accessor, editor, ...args) {
    this.testService = accessor.get(ITestService);
    this.uriIdentityService = accessor.get(IUriIdentityService);
    return super.runEditorCommand(accessor, editor, ...args);
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeTestsCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleTests || "peek";
  }
}
class GoToRelatedTestAction extends TestNavigationAction {
  async _getLocationModel(_languageFeaturesService, model, position, token) {
    const tests = await this.testService.getTestsRelatedToCode(model.uri, position, token);
    return new ReferencesModel(
      tests.map((t) => t.item.uri && { uri: t.item.uri, range: t.item.range || new Range(1, 1, 1, 1) }).filter(isDefined),
      localize("relatedTests", "Related Tests")
    );
  }
  _getNoResultFoundMessage() {
    return localize("noTestFound", "No related tests found.");
  }
}
class GoToRelatedTest extends GoToRelatedTestAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: TestCommandId.GoToRelatedTest,
      title: localize2("testing.goToRelatedTest", "Go to Related Test"),
      category,
      precondition: ContextKeyExpr.and(
        // todo@connor4312: make this more explicit based on cursor position
        ContextKeyExpr.not(TestingContextKeys.activeEditorHasTests.key),
        TestingContextKeys.canGoToRelatedTest
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 4 /* GoToRelated */
      }]
    });
  }
}
class PeekRelatedTest extends GoToRelatedTestAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: TestCommandId.PeekRelatedTest,
      title: localize2("testing.peekToRelatedTest", "Peek Related Test"),
      category,
      precondition: ContextKeyExpr.and(
        TestingContextKeys.canGoToRelatedTest,
        // todo@connor4312: make this more explicit based on cursor position
        ContextKeyExpr.not(TestingContextKeys.activeEditorHasTests.key),
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 5 /* PeekRelated */
      }]
    });
  }
}
class GoToRelatedCodeAction extends TestNavigationAction {
  async _getLocationModel(_languageFeaturesService, model, position, token) {
    const testsAtCursor = await getTestsAtCursor(this.testService, this.uriIdentityService, model.uri, position);
    const code = await Promise.all(testsAtCursor.map((t) => this.testService.getCodeRelatedToTest(t)));
    return new ReferencesModel(code.flat(), localize("relatedCode", "Related Code"));
  }
  _getNoResultFoundMessage() {
    return localize("noRelatedCode", "No related code found.");
  }
}
class GoToRelatedCode extends GoToRelatedCodeAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: TestCommandId.GoToRelatedCode,
      title: localize2("testing.goToRelatedCode", "Go to Related Code"),
      category,
      precondition: ContextKeyExpr.and(
        TestingContextKeys.activeEditorHasTests,
        TestingContextKeys.canGoToRelatedCode
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 4 /* GoToRelated */
      }]
    });
  }
}
class PeekRelatedCode extends GoToRelatedCodeAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: TestCommandId.PeekRelatedCode,
      title: localize2("testing.peekToRelatedCode", "Peek Related Code"),
      category,
      precondition: ContextKeyExpr.and(
        TestingContextKeys.activeEditorHasTests,
        TestingContextKeys.canGoToRelatedCode,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 5 /* PeekRelated */
      }]
    });
  }
}
class ToggleResultsViewLayoutAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ToggleResultsViewLayoutAction,
      title: localize2("testing.toggleResultsViewLayout", "Toggle Tree Position"),
      category,
      icon: Codicon.arrowSwap,
      menu: {
        id: MenuId.ViewTitle,
        order: 18 /* DisplayMode */,
        group: "navigation",
        when: ContextKeyExpr.equals("view", Testing.ResultsViewId)
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentLayout = getTestingConfiguration(configurationService, TestingConfigKeys.ResultsViewLayout);
    const newLayout = currentLayout === TestingResultsViewLayout.TreeLeft ? TestingResultsViewLayout.TreeRight : TestingResultsViewLayout.TreeLeft;
    await configurationService.updateValue(TestingConfigKeys.ResultsViewLayout, newLayout);
  }
}
const allTestActions = [
  CancelTestRefreshAction,
  CancelTestRunAction,
  CleareCoverage,
  ClearTestResultsAction,
  CollapseAllAction,
  ConfigureTestProfilesAction,
  ContinuousRunTestAction,
  ContinuousRunUsingProfileTestAction,
  CoverageAction,
  CoverageAllAction,
  CoverageAtCursor,
  CoverageCurrentFile,
  CoverageLastRun,
  CoverageSelectedAction,
  CoverageTestsUnderUri,
  DebugAction,
  DebugAllAction,
  DebugAtCursor,
  DebugCurrentFile,
  DebugFailedTests,
  DebugLastRun,
  DebugSelectedAction,
  DebugTestsUnderUri,
  GetExplorerSelection,
  GetSelectedProfiles,
  GoToRelatedCode,
  GoToRelatedTest,
  GoToTest,
  HideTestAction,
  OpenCoverage,
  OpenOutputPeek,
  PeekRelatedCode,
  PeekRelatedTest,
  RefreshTestsAction,
  ReRunFailedTests,
  ReRunLastRun,
  RunAction,
  RunAllAction,
  RunAtCursor,
  RunCurrentFile,
  RunSelectedAction,
  RunTestsUnderUri,
  RunUsingProfileAction,
  SearchForTestExtension,
  SelectDefaultTestProfiles,
  ShowMostRecentOutputAction,
  StartContinuousRunAction,
  StopContinuousRunAction,
  TestingSortByDurationAction,
  TestingSortByLocationAction,
  TestingSortByStatusAction,
  TestingViewAsListAction,
  TestingViewAsTreeAction,
  ToggleInlineTestOutput,
  ToggleResultsViewLayoutAction,
  UnhideAllTestsAction,
  UnhideTestAction,
  ReRunFailedFromLastRun,
  DebugFailedFromLastRun
];
export {
  CancelTestRefreshAction,
  CancelTestRunAction,
  ClearTestResultsAction,
  CleareCoverage,
  CollapseAllAction,
  ConfigureTestProfilesAction,
  ContinuousRunTestAction,
  ContinuousRunUsingProfileTestAction,
  CoverageAction,
  CoverageAllAction,
  CoverageAtCursor,
  CoverageCurrentFile,
  CoverageLastRun,
  CoverageSelectedAction,
  DebugAction,
  DebugAllAction,
  DebugAtCursor,
  DebugCurrentFile,
  DebugFailedFromLastRun,
  DebugFailedTests,
  DebugLastRun,
  DebugSelectedAction,
  GetExplorerSelection,
  GetSelectedProfiles,
  GoToTest,
  HideTestAction,
  OpenCoverage,
  OpenOutputPeek,
  ReRunFailedFromLastRun,
  ReRunFailedTests,
  ReRunLastRun,
  RefreshTestsAction,
  RunAction,
  RunAllAction,
  RunAtCursor,
  RunCurrentFile,
  RunSelectedAction,
  RunUsingProfileAction,
  SearchForTestExtension,
  SelectDefaultTestProfiles,
  ShowMostRecentOutputAction,
  TestingSortByDurationAction,
  TestingSortByLocationAction,
  TestingSortByStatusAction,
  TestingViewAsListAction,
  TestingViewAsTreeAction,
  ToggleInlineTestOutput,
  ToggleResultsViewLayoutAction,
  UnhideAllTestsAction,
  UnhideTestAction,
  allTestActions,
  discoverAndRunTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RFeHBsb3JlckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIEdvVG9Mb2NhdGlvblZhbHVlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFN5bWJvbE5hdmlnYXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvZ29Ub0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFJlZmVyZW5jZXNNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9yZWZlcmVuY2VzTW9kZWwuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9tZXNzYWdlL2Jyb3dzZXIvbWVzc2FnZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUGVla0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBDb250ZXh0S2V5R3JlYXRlckV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgd2lkZ2V0Q2xvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVmlld0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgRm9jdXNlZFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIFRlc3RJdGVtVHJlZUVsZW1lbnQgfSBmcm9tICcuL2V4cGxvcmVyUHJvamVjdGlvbnMvaW5kZXguanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9pY29ucy5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nRXhwbG9yZXJWaWV3IH0gZnJvbSAnLi90ZXN0aW5nRXhwbG9yZXJWaWV3LmpzJztcbmltcG9ydCB7IFRlc3RSZXN1bHRzVmlldyB9IGZyb20gJy4vdGVzdGluZ091dHB1dFBlZWsuanMnO1xuaW1wb3J0IHsgVGVzdENvbW1hbmRJZCwgVGVzdEV4cGxvcmVyVmlld01vZGUsIFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLCBUZXN0aW5nLCB0ZXN0Q29uZmlndXJhdGlvbkdyb3VwTmFtZXMgfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGdldFRlc3RpbmdDb25maWd1cmF0aW9uLCBUZXN0aW5nQ29uZmlnS2V5cywgVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0IH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlc3RDb3ZlcmFnZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdENvdmVyYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IElUZXN0UHJvZmlsZVNlcnZpY2UsIGNhblVzZVByb2ZpbGVXaXRoVGVzdCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFJlc3VsdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbiwgSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlciwgSVRlc3RTZXJ2aWNlLCBleHBhbmRBbmRHZXRUZXN0QnlJZCwgdGVzdHNJbkZpbGUsIHRlc3RzVW5kZXJVcmkgfSBmcm9tICcuLi9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0VGVzdFJ1blByb2ZpbGVLaW5kLCBJVGVzdFJ1blByb2ZpbGUsIEludGVybmFsVGVzdEl0ZW0sIFRlc3RJdGVtRXhwYW5kU3RhdGUsIFRlc3RSdW5Qcm9maWxlQml0c2V0IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0aW5nUGVla09wZW5lciB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nUGVla09wZW5lci5qcyc7XG5pbXBvcnQgeyBpc0ZhaWxlZFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdTdGF0ZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuXG5jb25zdCBjYXRlZ29yeSA9IENhdGVnb3JpZXMuVGVzdDtcblxuY29uc3QgZW51bSBBY3Rpb25PcmRlciB7XG5cdC8vIE5hdmlnYXRpb246XG5cdFJlZnJlc2ggPSAxMCxcblx0UnVuLFxuXHREZWJ1Zyxcblx0Q292ZXJhZ2UsXG5cdFJ1bkNvbnRpbnVvdXMsXG5cdFJ1blVzaW5nLFxuXG5cdC8vIFN1Ym1lbnU6XG5cdENvbGxhcHNlLFxuXHRDbGVhclJlc3VsdHMsXG5cdERpc3BsYXlNb2RlLFxuXHRTb3J0LFxuXHRHb1RvVGVzdCxcblx0SGlkZVRlc3QsXG5cdENvbnRpbnVvdXNSdW5UZXN0ID0gLTEgPj4+IDEsIC8vIG1heCBpbnQsIGFsd2F5cyBhdCB0aGUgZW5kIHRvIGF2b2lkIHNoaWZ0aW5nIG9uIGhvdmVyXG59XG5cbmNvbnN0IGhhc0FueVRlc3RQcm92aWRlciA9IENvbnRleHRLZXlHcmVhdGVyRXhwci5jcmVhdGUoVGVzdGluZ0NvbnRleHRLZXlzLnByb3ZpZGVyQ291bnQua2V5LCAwKTtcblxuY29uc3QgTEFCRUxfUlVOX1RFU1RTID0gbG9jYWxpemUyKCdydW5TZWxlY3RlZFRlc3RzJywgXCJSdW4gVGVzdHNcIik7XG5jb25zdCBMQUJFTF9ERUJVR19URVNUUyA9IGxvY2FsaXplMignZGVidWdTZWxlY3RlZFRlc3RzJywgXCJEZWJ1ZyBUZXN0c1wiKTtcbmNvbnN0IExBQkVMX0NPVkVSQUdFX1RFU1RTID0gbG9jYWxpemUyKCdjb3ZlcmFnZVNlbGVjdGVkVGVzdHMnLCBcIlJ1biBUZXN0cyB3aXRoIENvdmVyYWdlXCIpO1xuXG5leHBvcnQgY2xhc3MgSGlkZVRlc3RBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuSGlkZVRlc3RBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdoaWRlVGVzdCcsICdIaWRlIFRlc3QnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbSxcblx0XHRcdFx0Z3JvdXA6ICdidWlsdGluQDInLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMudGVzdEl0ZW1Jc0hpZGRlbi5pc0VxdWFsVG8oZmFsc2UpXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uZWxlbWVudHM6IFRlc3RJdGVtVHJlZUVsZW1lbnRbXSkge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdHNlcnZpY2UuZXhjbHVkZWQudG9nZ2xlKGVsZW1lbnQudGVzdCwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5oaWRlVGVzdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5VbmhpZGVUZXN0QWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndW5oaWRlVGVzdCcsICdVbmhpZGUgVGVzdCcpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuSGlkZVRlc3QsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy50ZXN0SXRlbUlzSGlkZGVuLmlzRXF1YWxUbyh0cnVlKVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmVsZW1lbnRzOiBJbnRlcm5hbFRlc3RJdGVtW10pIHtcblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0c2VydmljZS5leGNsdWRlZC50b2dnbGUoZWxlbWVudC50ZXN0LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5oaWRlQWxsVGVzdHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuVW5oaWRlQWxsVGVzdHNBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd1bmhpZGVBbGxUZXN0cycsICdVbmhpZGUgQWxsIFRlc3RzJyksXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdHNlcnZpY2UuZXhjbHVkZWQuY2xlYXIoKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuY29uc3QgdGVzdEl0ZW1JbmxpbmVBbmRJbkNvbnRleHQgPSAob3JkZXI6IEFjdGlvbk9yZGVyLCB3aGVuPzogQ29udGV4dEtleUV4cHJlc3Npb24pID0+IFtcblx0e1xuXHRcdGlkOiBNZW51SWQuVGVzdEl0ZW0sXG5cdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdG9yZGVyLFxuXHRcdHdoZW4sXG5cdH0sIHtcblx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdGdyb3VwOiAnYnVpbHRpbkAxJyxcblx0XHRvcmRlcixcblx0XHR3aGVuLFxuXHR9XG5dO1xuXG5hYnN0cmFjdCBjbGFzcyBSdW5WaXNpYmxlQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgYml0c2V0OiBUZXN0UnVuUHJvZmlsZUJpdHNldCwgZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPikge1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLmRlc2MsXG5cdFx0XHR2aWV3SWQ6IFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0aW5nRXhwbG9yZXJWaWV3LCAuLi5lbGVtZW50czogVGVzdEl0ZW1UcmVlRWxlbWVudFtdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgeyBpbmNsdWRlLCBleGNsdWRlIH0gPSB2aWV3LmdldFRyZWVJbmNsdWRlRXhjbHVkZSh0aGlzLmJpdHNldCwgZWxlbWVudHMubWFwKGUgPT4gZS50ZXN0KSk7XG5cdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpLnJ1blRlc3RzKHtcblx0XHRcdHRlc3RzOiBpbmNsdWRlLFxuXHRcdFx0ZXhjbHVkZSxcblx0XHRcdGdyb3VwOiB0aGlzLmJpdHNldCxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdBY3Rpb24gZXh0ZW5kcyBSdW5WaXNpYmxlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsIHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkRlYnVnQWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGVidWcgdGVzdCcsICdEZWJ1ZyBUZXN0JyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nRGVidWdJY29uLFxuXHRcdFx0bWVudTogdGVzdEl0ZW1JbmxpbmVBbmRJbkNvbnRleHQoQWN0aW9uT3JkZXIuRGVidWcsIFRlc3RpbmdDb250ZXh0S2V5cy5oYXNEZWJ1Z2dhYmxlVGVzdHMuaXNFcXVhbFRvKHRydWUpKSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VBY3Rpb24gZXh0ZW5kcyBSdW5WaXNpYmxlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UsIHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bldpdGhDb3ZlcmFnZUFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1biB3aXRoIGNvdmVyIHRlc3QnLCAnUnVuIFRlc3Qgd2l0aCBDb3ZlcmFnZScpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0NvdmVyYWdlSWNvbixcblx0XHRcdG1lbnU6IHRlc3RJdGVtSW5saW5lQW5kSW5Db250ZXh0KEFjdGlvbk9yZGVyLkNvdmVyYWdlLCBUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhYmxlVGVzdHMuaXNFcXVhbFRvKHRydWUpKSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUnVuVXNpbmdQcm9maWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1blVzaW5nUHJvZmlsZUFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcucnVuVXNpbmcnLCAnRXhlY3V0ZSBVc2luZyBQcm9maWxlLi4uJyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nRGVidWdJY29uLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuUnVuVXNpbmcsXG5cdFx0XHRcdGdyb3VwOiAnYnVpbHRpbkAyJyxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc05vbkRlZmF1bHRQcm9maWxlLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKGFjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmVsZW1lbnRzOiBUZXN0SXRlbVRyZWVFbGVtZW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2ZpbGU6IElUZXN0UnVuUHJvZmlsZSB8IHVuZGVmaW5lZCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUucGlja1Rlc3RQcm9maWxlJywge1xuXHRcdFx0b25seUZvclRlc3Q6IGVsZW1lbnRzWzBdLnRlc3QsXG5cdFx0fSk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVzdFNlcnZpY2UucnVuUmVzb2x2ZWRUZXN0cyh7XG5cdFx0XHRncm91cDogcHJvZmlsZS5ncm91cCxcblx0XHRcdHRhcmdldHM6IFt7XG5cdFx0XHRcdHByb2ZpbGVJZDogcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdGNvbnRyb2xsZXJJZDogcHJvZmlsZS5jb250cm9sbGVySWQsXG5cdFx0XHRcdHRlc3RJZHM6IGVsZW1lbnRzLmZpbHRlcih0ID0+IGNhblVzZVByb2ZpbGVXaXRoVGVzdChwcm9maWxlLCB0LnRlc3QpKS5tYXAodCA9PiB0LnRlc3QuaXRlbS5leHRJZClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1bkFjdGlvbiBleHRlbmRzIFJ1blZpc2libGVBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sIHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bkFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1biB0ZXN0JywgJ1J1biBUZXN0JyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nUnVuSWNvbixcblx0XHRcdG1lbnU6IHRlc3RJdGVtSW5saW5lQW5kSW5Db250ZXh0KEFjdGlvbk9yZGVyLlJ1biwgVGVzdGluZ0NvbnRleHRLZXlzLmhhc1J1bm5hYmxlVGVzdHMuaXNFcXVhbFRvKHRydWUpKSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0RGVmYXVsdFRlc3RQcm9maWxlcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5TZWxlY3REZWZhdWx0VGVzdFByb2ZpbGVzLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5zZWxlY3REZWZhdWx0VGVzdFByb2ZpbGVzJywgJ1NlbGVjdCBEZWZhdWx0IFByb2ZpbGUnKSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdVcGRhdGVQcm9maWxlcyxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvbmx5R3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBhY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlc3RQcm9maWxlU2VydmljZSA9IGFjZXNzb3IuZ2V0KElUZXN0UHJvZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2ZpbGVzID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8SVRlc3RSdW5Qcm9maWxlW10+KCd2c2NvZGUucGlja011bHRpcGxlVGVzdFByb2ZpbGVzJywge1xuXHRcdFx0c2hvd0NvbmZpZ3VyZUJ1dHRvbnM6IGZhbHNlLFxuXHRcdFx0c2VsZWN0ZWQ6IHRlc3RQcm9maWxlU2VydmljZS5nZXRHcm91cERlZmF1bHRQcm9maWxlcyhvbmx5R3JvdXApLFxuXHRcdFx0b25seUdyb3VwLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHByb2ZpbGVzPy5sZW5ndGgpIHtcblx0XHRcdHRlc3RQcm9maWxlU2VydmljZS5zZXRHcm91cERlZmF1bHRQcm9maWxlcyhvbmx5R3JvdXAsIHByb2ZpbGVzKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRpbnVvdXNSdW5UZXN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRvZ2dsZUNvbnRpbm91c1J1bkZvclRlc3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnRvZ2dsZUNvbnRpbnVvdXNSdW5PbicsICdUdXJuIG9uIENvbnRpbnVvdXMgUnVuJyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nVHVybkNvbnRpbnVvdXNSdW5Pbixcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc0NvbnRpbnVvdXNNb2RlT24uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNQYXJlbnRSdW5uaW5nQ29udGludW91c2x5LmlzRXF1YWxUbyhmYWxzZSlcblx0XHRcdCksXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzQ29udGludW91c01vZGVPbi5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdGljb246IGljb25zLnRlc3RpbmdDb250aW51b3VzSXNPbixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0ZXN0aW5nLnRvZ2dsZUNvbnRpbnVvdXNSdW5PZmYnLCAnVHVybiBvZmYgQ29udGludW91cyBSdW4nKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB0ZXN0SXRlbUlubGluZUFuZEluQ29udGV4dChBY3Rpb25PcmRlci5Db250aW51b3VzUnVuVGVzdCwgVGVzdGluZ0NvbnRleHRLZXlzLnN1cHBvcnRzQ29udGludW91c1J1bi5pc0VxdWFsVG8odHJ1ZSkpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uZWxlbWVudHM6IFRlc3RJdGVtVHJlZUVsZW1lbnRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNyU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdGNvbnN0IGlkID0gZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQ7XG5cdFx0XHRpZiAoY3JTZXJ2aWNlLmlzU3BlY2lmaWNhbGx5RW5hYmxlZEZvcihpZCkpIHtcblx0XHRcdFx0Y3JTZXJ2aWNlLnN0b3AoaWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y3JTZXJ2aWNlLnN0YXJ0KFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgaWQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGludW91c1J1blVzaW5nUHJvZmlsZVRlc3RBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ29udGlub3VzUnVuVXNpbmdGb3JUZXN0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5zdGFydENvbnRpbnVvdXNSdW5Vc2luZycsICdTdGFydCBDb250aW5vdXMgUnVuIFVzaW5nLi4uJyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nRGVidWdJY29uLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbSxcblx0XHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuUnVuQ29udGludW91cyxcblx0XHRcdFx0XHRncm91cDogJ2J1aWx0aW5AMicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLnN1cHBvcnRzQ29udGludW91c1J1bi5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNDb250aW51b3VzTW9kZU9uLmlzRXF1YWxUbyhmYWxzZSksXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uZWxlbWVudHM6IFRlc3RJdGVtVHJlZUVsZW1lbnRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNyU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFByb2ZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHNlbGVjdENvbnRpbnVvdXNSdW5Qcm9maWxlcyhjclNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdFx0XHRbeyBwcm9maWxlczogcHJvZmlsZVNlcnZpY2UuZ2V0Q29udHJvbGxlclByb2ZpbGVzKGVsZW1lbnQudGVzdC5jb250cm9sbGVySWQpIH1dKTtcblxuXHRcdFx0aWYgKHNlbGVjdGVkLmxlbmd0aCkge1xuXHRcdFx0XHRjclNlcnZpY2Uuc3RhcnQoc2VsZWN0ZWQsIGVsZW1lbnQudGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyZVRlc3RQcm9maWxlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db25maWd1cmVUZXN0UHJvZmlsZXNBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNvbmZpZ3VyZVByb2ZpbGUnLCBcIkNvbmZpZ3VyZSBUZXN0IFByb2ZpbGVzXCIpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1VwZGF0ZVByb2ZpbGVzLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc0NvbmZpZ3VyYWJsZVByb2ZpbGUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb25seUdyb3VwPzogVGVzdFJ1blByb2ZpbGVCaXRzZXQpIHtcblx0XHRjb25zdCBjb21tYW5kcyA9IGFjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdFByb2ZpbGVTZXJ2aWNlID0gYWNlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPElUZXN0UnVuUHJvZmlsZT4oJ3ZzY29kZS5waWNrVGVzdFByb2ZpbGUnLCB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2NvbmZpZ3VyZVByb2ZpbGUnLCAnU2VsZWN0IGEgcHJvZmlsZSB0byB1cGRhdGUnKSxcblx0XHRcdHNob3dDb25maWd1cmVCdXR0b25zOiBmYWxzZSxcblx0XHRcdG9ubHlDb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRvbmx5R3JvdXAsXG5cdFx0fSk7XG5cblx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0dGVzdFByb2ZpbGVTZXJ2aWNlLmNvbmZpZ3VyZShwcm9maWxlLmNvbnRyb2xsZXJJZCwgcHJvZmlsZS5wcm9maWxlSWQpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBjb250aW51b3VzTWVudXMgPSAod2hlbklzQ29udGludW91c09uOiBib29sZWFuKTogSUFjdGlvbjJPcHRpb25zWydtZW51J10gPT4gW1xuXHR7XG5cdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRvcmRlcjogQWN0aW9uT3JkZXIuUnVuVXNpbmcsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZCksXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuc3VwcG9ydHNDb250aW51b3VzUnVuLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc0NvbnRpbnVvdXNNb2RlT24uaXNFcXVhbFRvKHdoZW5Jc0NvbnRpbnVvdXNPbiksXG5cdFx0KSxcblx0fSxcblx0e1xuXHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLnN1cHBvcnRzQ29udGludW91c1J1bi5pc0VxdWFsVG8odHJ1ZSksXG5cdH0sXG5dO1xuXG5jbGFzcyBTdG9wQ29udGludW91c1J1bkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5TdG9wQ29udGlub3VzUnVuLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5zdG9wQ29udGludW91cycsICdTdG9wIENvbnRpbnVvdXMgUnVuJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdUdXJuQ29udGludW91c1J1bk9mZixcblx0XHRcdG1lbnU6IGNvbnRpbnVvdXNNZW51cyh0cnVlKSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlKS5zdG9wKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2VsZWN0Q29udGludW91c1J1blByb2ZpbGVzKFxuXHRjcnM6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UsXG5cdG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRwcm9maWxlc1RvUGlja0Zyb206IEl0ZXJhYmxlPFJlYWRvbmx5PHtcblx0XHRjb250cm9sbGVyPzogSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlcjtcblx0XHRwcm9maWxlczogSVRlc3RSdW5Qcm9maWxlW107XG5cdH0+Pixcbik6IFByb21pc2U8SVRlc3RSdW5Qcm9maWxlW10+IHtcblx0dHlwZSBJdGVtVHlwZSA9IElRdWlja1BpY2tJdGVtICYgeyBwcm9maWxlOiBJVGVzdFJ1blByb2ZpbGUgfTtcblxuXHRjb25zdCBpdGVtczogSXRlbVR5cGVbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHsgY29udHJvbGxlciwgcHJvZmlsZXMgfSBvZiBwcm9maWxlc1RvUGlja0Zyb20pIHtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRcdGlmIChwcm9maWxlLnN1cHBvcnRzQ29udGludW91c1J1bikge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogcHJvZmlsZS5sYWJlbCB8fCBjb250cm9sbGVyPy5sYWJlbC5nZXQoKSB8fCAnJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY29udHJvbGxlcj8ubGFiZWwuZ2V0KCksXG5cdFx0XHRcdFx0cHJvZmlsZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgndGVzdGluZy5ub1Byb2ZpbGVzJywgJ05vIHRlc3QgY29udGludW91cyBydW4tZW5hYmxlZCBwcm9maWxlcyB3ZXJlIGZvdW5kJykpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHR9XG5cblx0Ly8gc3BlY2lhbCBjYXNlOiBkb24ndCBib3RoZXIgdG8gcXVpY2sgYSBwaWNrcGljayBpZiB0aGVyZSdzIG9ubHkgYSBzaW5nbGUgcHJvZmlsZVxuXHRpZiAoaXRlbXMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbaXRlbXNbMF0ucHJvZmlsZV0pO1xuXHR9XG5cblx0Y29uc3QgcXBJdGVtczogKEl0ZW1UeXBlIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRjb25zdCBzZWxlY3RlZEl0ZW1zOiBJdGVtVHlwZVtdID0gW107XG5cdGNvbnN0IGxhc3RSdW4gPSBjcnMubGFzdFJ1blByb2ZpbGVJZHM7XG5cblx0aXRlbXMuc29ydCgoYSwgYikgPT4gYS5wcm9maWxlLmdyb3VwIC0gYi5wcm9maWxlLmdyb3VwXG5cdFx0fHwgYS5wcm9maWxlLmNvbnRyb2xsZXJJZC5sb2NhbGVDb21wYXJlKGIucHJvZmlsZS5jb250cm9sbGVySWQpXG5cdFx0fHwgYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xuXHRcdGlmIChpID09PSAwIHx8IGl0ZW1zW2kgLSAxXS5wcm9maWxlLmdyb3VwICE9PSBpdGVtLnByb2ZpbGUuZ3JvdXApIHtcblx0XHRcdHFwSXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogdGVzdENvbmZpZ3VyYXRpb25Hcm91cE5hbWVzW2l0ZW0ucHJvZmlsZS5ncm91cF0gfSk7XG5cdFx0fVxuXG5cdFx0cXBJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdGlmIChsYXN0UnVuLmhhcyhpdGVtLnByb2ZpbGUucHJvZmlsZUlkKSkge1xuXHRcdFx0c2VsZWN0ZWRJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBxdWlja3BpY2sgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtICYgeyBwcm9maWxlOiBJVGVzdFJ1blByb2ZpbGUgfT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0cXVpY2twaWNrLnRpdGxlID0gbG9jYWxpemUoJ3Rlc3Rpbmcuc2VsZWN0Q29udGludW91c1Byb2ZpbGVzJywgJ1NlbGVjdCBwcm9maWxlcyB0byBydW4gd2hlbiBmaWxlcyBjaGFuZ2U6Jyk7XG5cdHF1aWNrcGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0cXVpY2twaWNrLml0ZW1zID0gcXBJdGVtcztcblx0cXVpY2twaWNrLnNlbGVjdGVkSXRlbXMgPSBzZWxlY3RlZEl0ZW1zO1xuXHRxdWlja3BpY2suc2hvdygpO1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRyZXNvbHZlKHF1aWNrcGljay5zZWxlY3RlZEl0ZW1zLm1hcChpID0+IGkucHJvZmlsZSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHJlc29sdmUoW10pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0fSk7XG59XG5cbmNsYXNzIFN0YXJ0Q29udGludW91c1J1bkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5TdGFydENvbnRpbm91c1J1bixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc3RhcnRDb250aW51b3VzJywgXCJTdGFydCBDb250aW51b3VzIFJ1blwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1R1cm5Db250aW51b3VzUnVuT24sXG5cdFx0XHRtZW51OiBjb250aW51b3VzTWVudXMoZmFsc2UpLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNycyA9IGFjY2Vzc29yLmdldChJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFByb2ZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxhc3RSdW5Qcm9maWxlcyA9IFsuLi5wcm9maWxlU2VydmljZS5hbGwoKV0uZmxhdE1hcChwID0+IHAucHJvZmlsZXMuZmlsdGVyKHAgPT4gY3JzLmxhc3RSdW5Qcm9maWxlSWRzLmhhcyhwLnByb2ZpbGVJZCkpKTtcblx0XHRpZiAobGFzdFJ1blByb2ZpbGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGNycy5zdGFydChsYXN0UnVuUHJvZmlsZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgc2VsZWN0Q29udGludW91c1J1blByb2ZpbGVzKGNycywgYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSksIGFjY2Vzc29yLmdldChJVGVzdFByb2ZpbGVTZXJ2aWNlKS5hbGwoKSk7XG5cdFx0aWYgKHNlbGVjdGVkLmxlbmd0aCkge1xuXHRcdFx0Y3JzLnN0YXJ0KHNlbGVjdGVkKTtcblx0XHR9XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgRXhlY3V0ZVNlbGVjdGVkQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucywgcHJpdmF0ZSByZWFkb25seSBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuXG5cdFx0XHRcdFx0PyBBY3Rpb25PcmRlci5SdW5cblx0XHRcdFx0XHQ6IGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Z1xuXHRcdFx0XHRcdFx0PyBBY3Rpb25PcmRlci5EZWJ1Z1xuXHRcdFx0XHRcdFx0OiBBY3Rpb25PcmRlci5Db3ZlcmFnZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpLFxuXHRcdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc1J1bm5pbmcuaXNFcXVhbFRvKGZhbHNlKSxcblx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY2FwYWJpbGl0eVRvQ29udGV4dEtleVtncm91cF0uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHQpXG5cdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldyk6IFByb21pc2U8SVRlc3RSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IGluY2x1ZGUsIGV4Y2x1ZGUgfSA9IHZpZXcuZ2V0VHJlZUluY2x1ZGVFeGNsdWRlKHRoaXMuZ3JvdXApO1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKS5ydW5UZXN0cyh7IHRlc3RzOiBpbmNsdWRlLCBleGNsdWRlLCBncm91cDogdGhpcy5ncm91cCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2V0U2VsZWN0ZWRQcm9maWxlcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7IGlkOiBUZXN0Q29tbWFuZElkLkdldFNlbGVjdGVkUHJvZmlsZXMsIHRpdGxlOiBsb2NhbGl6ZTIoJ2dldFNlbGVjdGVkUHJvZmlsZXMnLCAnR2V0IFNlbGVjdGVkIFByb2ZpbGVzJykgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgcHJvZmlsZXMgPSBhY2Nlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLnByb2ZpbGVzLmdldEdyb3VwRGVmYXVsdFByb2ZpbGVzKFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biksXG5cdFx0XHQuLi5wcm9maWxlcy5nZXRHcm91cERlZmF1bHRQcm9maWxlcyhUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZyksXG5cdFx0XHQuLi5wcm9maWxlcy5nZXRHcm91cERlZmF1bHRQcm9maWxlcyhUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSksXG5cdFx0XS5tYXAocCA9PiAoe1xuXHRcdFx0Y29udHJvbGxlcklkOiBwLmNvbnRyb2xsZXJJZCxcblx0XHRcdGxhYmVsOiBwLmxhYmVsLFxuXHRcdFx0a2luZDogcC5ncm91cCAmIFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlXG5cdFx0XHRcdD8gRXh0VGVzdFJ1blByb2ZpbGVLaW5kLkNvdmVyYWdlXG5cdFx0XHRcdDogcC5ncm91cCAmIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnXG5cdFx0XHRcdFx0PyBFeHRUZXN0UnVuUHJvZmlsZUtpbmQuRGVidWdcblx0XHRcdFx0XHQ6IEV4dFRlc3RSdW5Qcm9maWxlS2luZC5SdW4sXG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHZXRFeHBsb3JlclNlbGVjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7IGlkOiBUZXN0Q29tbWFuZElkLkdldEV4cGxvcmVyU2VsZWN0aW9uLCB0aXRsZTogbG9jYWxpemUyKCdnZXRFeHBsb3JlclNlbGVjdGlvbicsICdHZXQgRXhwbG9yZXIgU2VsZWN0aW9uJyksIHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0aW5nRXhwbG9yZXJWaWV3KSB7XG5cdFx0Y29uc3QgeyBpbmNsdWRlLCBleGNsdWRlIH0gPSB2aWV3LmdldFRyZWVJbmNsdWRlRXhjbHVkZShUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sIHVuZGVmaW5lZCwgJ3NlbGVjdGVkJyk7XG5cdFx0Y29uc3QgbWFwcGVyID0gKGk6IEludGVybmFsVGVzdEl0ZW0pID0+IGkuaXRlbS5leHRJZDtcblx0XHRyZXR1cm4geyBpbmNsdWRlOiBpbmNsdWRlLm1hcChtYXBwZXIpLCBleGNsdWRlOiBleGNsdWRlLm1hcChtYXBwZXIpIH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1blNlbGVjdGVkQWN0aW9uIGV4dGVuZHMgRXhlY3V0ZVNlbGVjdGVkQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUnVuU2VsZWN0ZWRBY3Rpb24sXG5cdFx0XHR0aXRsZTogTEFCRUxfUlVOX1RFU1RTLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1J1bkFsbEljb24sXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdTZWxlY3RlZEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVTZWxlY3RlZEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkRlYnVnU2VsZWN0ZWRBY3Rpb24sXG5cdFx0XHR0aXRsZTogTEFCRUxfREVCVUdfVEVTVFMsXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nRGVidWdBbGxJY29uLFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VTZWxlY3RlZEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVTZWxlY3RlZEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlU2VsZWN0ZWRBY3Rpb24sXG5cdFx0XHR0aXRsZTogTEFCRUxfQ09WRVJBR0VfVEVTVFMsXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nQ292ZXJhZ2VBbGxJY29uLFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlKTtcblx0fVxufVxuXG5jb25zdCBzaG93RGlzY292ZXJpbmdXaGlsZSA9IDxSPihwcm9ncmVzczogSVByb2dyZXNzU2VydmljZSwgdGFzazogUHJvbWlzZTxSPik6IFByb21pc2U8Uj4gPT4ge1xuXHRyZXR1cm4gcHJvZ3Jlc3Mud2l0aFByb2dyZXNzKFxuXHRcdHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZGlzY292ZXJpbmdUZXN0cycsICdEaXNjb3ZlcmluZyBUZXN0cycpLFxuXHRcdH0sXG5cdFx0KCkgPT4gdGFzayxcblx0KTtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFJ1bk9yRGVidWdBbGxUZXN0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMsIHByaXZhdGUgcmVhZG9ubHkgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LCBwcml2YXRlIG5vVGVzdHNGb3VuZEVycm9yOiBzdHJpbmcpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuY2FwYWJpbGl0eVRvQ29udGV4dEtleVtncm91cF0uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgcm9vdHMgPSBbLi4udGVzdFNlcnZpY2UuY29sbGVjdGlvbi5yb290SXRlbXNdLmZpbHRlcihyID0+IHIuY2hpbGRyZW4uc2l6ZVxuXHRcdFx0fHwgci5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kYWJsZSB8fCByLmV4cGFuZCA9PT0gVGVzdEl0ZW1FeHBhbmRTdGF0ZS5CdXN5RXhwYW5kaW5nKTtcblx0XHRpZiAoIXJvb3RzLmxlbmd0aCkge1xuXHRcdFx0bm90aWZpY2F0aW9ucy5pbmZvKHRoaXMubm9UZXN0c0ZvdW5kRXJyb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgdGVzdHM6IHJvb3RzLCBncm91cDogdGhpcy5ncm91cCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUnVuQWxsQWN0aW9uIGV4dGVuZHMgUnVuT3JEZWJ1Z0FsbFRlc3RzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bkFsbEFjdGlvbixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncnVuQWxsVGVzdHMnLCAnUnVuIEFsbCBUZXN0cycpLFxuXHRcdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nUnVuQWxsSWNvbixcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleUNvZGUuS2V5QSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLFxuXHRcdFx0bG9jYWxpemUoJ25vVGVzdFByb3ZpZGVyJywgJ05vIHRlc3RzIGZvdW5kIGluIHRoaXMgd29ya3NwYWNlLiBZb3UgbWF5IG5lZWQgdG8gaW5zdGFsbCBhIHRlc3QgcHJvdmlkZXIgZXh0ZW5zaW9uJyksXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdBbGxBY3Rpb24gZXh0ZW5kcyBSdW5PckRlYnVnQWxsVGVzdHNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuRGVidWdBbGxBY3Rpb24sXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlYnVnQWxsVGVzdHMnLCAnRGVidWcgQWxsIFRlc3RzJyksXG5cdFx0XHRcdGljb246IGljb25zLnRlc3RpbmdEZWJ1Z0ljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsXG5cdFx0XHRsb2NhbGl6ZSgnbm9EZWJ1Z1Rlc3RQcm92aWRlcicsICdObyBkZWJ1Z2dhYmxlIHRlc3RzIGZvdW5kIGluIHRoaXMgd29ya3NwYWNlLiBZb3UgbWF5IG5lZWQgdG8gaW5zdGFsbCBhIHRlc3QgcHJvdmlkZXIgZXh0ZW5zaW9uJyksXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VBbGxBY3Rpb24gZXh0ZW5kcyBSdW5PckRlYnVnQWxsVGVzdHNBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUnVuQWxsV2l0aENvdmVyYWdlQWN0aW9uLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdydW5BbGxXaXRoQ292ZXJhZ2UnLCAnUnVuIEFsbCBUZXN0cyB3aXRoIENvdmVyYWdlJyksXG5cdFx0XHRcdGljb246IGljb25zLnRlc3RpbmdDb3ZlcmFnZUljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UsXG5cdFx0XHRsb2NhbGl6ZSgnbm9Db3ZlcmFnZVRlc3RQcm92aWRlcicsICdObyB0ZXN0cyB3aXRoIGNvdmVyYWdlIHJ1bm5lcnMgZm91bmQgaW4gdGhpcyB3b3Jrc3BhY2UuIFlvdSBtYXkgbmVlZCB0byBpbnN0YWxsIGEgdGVzdCBwcm92aWRlciBleHRlbnNpb24nKSxcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDYW5jZWxUZXN0UnVuQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNhbmNlbFRlc3RSdW5BY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNhbmNlbFJ1bicsICdDYW5jZWwgVGVzdCBSdW4nKSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdDYW5jZWxJY29uLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5SdW4sXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoVGVzdGluZ0NvbnRleHRLZXlzLmlzUnVubmluZy5zZXJpYWxpemUoKSwgdHJ1ZSksXG5cdFx0XHRcdClcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzUnVubmluZyxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXN1bHRJZD86IHN0cmluZywgdGFza0lkPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzdWx0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFJlc3VsdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0aWYgKHJlc3VsdElkKSB7XG5cdFx0XHR0ZXN0U2VydmljZS5jYW5jZWxUZXN0UnVuKHJlc3VsdElkLCB0YXNrSWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1biBvZiByZXN1bHRTZXJ2aWNlLnJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKCFydW4uY29tcGxldGVkQXQpIHtcblx0XHRcdFx0XHR0ZXN0U2VydmljZS5jYW5jZWxUZXN0UnVuKHJ1bi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdWaWV3QXNMaXN0QWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRlc3RpbmdWaWV3QXNMaXN0QWN0aW9uLFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy52aWV3QXNMaXN0JywgJ1ZpZXcgYXMgTGlzdCcpLFxuXHRcdFx0dG9nZ2xlZDogVGVzdGluZ0NvbnRleHRLZXlzLnZpZXdNb2RlLmlzRXF1YWxUbyhUZXN0RXhwbG9yZXJWaWV3TW9kZS5MaXN0KSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5EaXNwbGF5TW9kZSxcblx0XHRcdFx0Z3JvdXA6ICd2aWV3QXMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RpbmdFeHBsb3JlclZpZXcpIHtcblx0XHR2aWV3LnZpZXdNb2RlbC52aWV3TW9kZSA9IFRlc3RFeHBsb3JlclZpZXdNb2RlLkxpc3Q7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdWaWV3QXNUcmVlQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRlc3RpbmdWaWV3QXNUcmVlQWN0aW9uLFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy52aWV3QXNUcmVlJywgJ1ZpZXcgYXMgVHJlZScpLFxuXHRcdFx0dG9nZ2xlZDogVGVzdGluZ0NvbnRleHRLZXlzLnZpZXdNb2RlLmlzRXF1YWxUbyhUZXN0RXhwbG9yZXJWaWV3TW9kZS5UcmVlKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5EaXNwbGF5TW9kZSxcblx0XHRcdFx0Z3JvdXA6ICd2aWV3QXMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RpbmdFeHBsb3JlclZpZXcpIHtcblx0XHR2aWV3LnZpZXdNb2RlbC52aWV3TW9kZSA9IFRlc3RFeHBsb3JlclZpZXdNb2RlLlRyZWU7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgVGVzdGluZ1NvcnRCeVN0YXR1c0FjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5UZXN0aW5nU29ydEJ5U3RhdHVzQWN0aW9uLFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5zb3J0QnlTdGF0dXMnLCAnU29ydCBieSBTdGF0dXMnKSxcblx0XHRcdHRvZ2dsZWQ6IFRlc3RpbmdDb250ZXh0S2V5cy52aWV3U29ydGluZy5pc0VxdWFsVG8oVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlTdGF0dXMpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLlNvcnQsXG5cdFx0XHRcdGdyb3VwOiAnc29ydEJ5Jyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0aW5nRXhwbG9yZXJWaWV3KSB7XG5cdFx0dmlldy52aWV3TW9kZWwudmlld1NvcnRpbmcgPSBUZXN0RXhwbG9yZXJWaWV3U29ydGluZy5CeVN0YXR1cztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdGluZ1NvcnRCeUxvY2F0aW9uQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRlc3RpbmdTb3J0QnlMb2NhdGlvbkFjdGlvbixcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc29ydEJ5TG9jYXRpb24nLCAnU29ydCBieSBMb2NhdGlvbicpLFxuXHRcdFx0dG9nZ2xlZDogVGVzdGluZ0NvbnRleHRLZXlzLnZpZXdTb3J0aW5nLmlzRXF1YWxUbyhUZXN0RXhwbG9yZXJWaWV3U29ydGluZy5CeUxvY2F0aW9uKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5Tb3J0LFxuXHRcdFx0XHRncm91cDogJ3NvcnRCeScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldykge1xuXHRcdHZpZXcudmlld01vZGVsLnZpZXdTb3J0aW5nID0gVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlMb2NhdGlvbjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdGluZ1NvcnRCeUR1cmF0aW9uQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRlc3RpbmdTb3J0QnlEdXJhdGlvbkFjdGlvbixcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc29ydEJ5RHVyYXRpb24nLCAnU29ydCBieSBEdXJhdGlvbicpLFxuXHRcdFx0dG9nZ2xlZDogVGVzdGluZ0NvbnRleHRLZXlzLnZpZXdTb3J0aW5nLmlzRXF1YWxUbyhUZXN0RXhwbG9yZXJWaWV3U29ydGluZy5CeUR1cmF0aW9uKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5Tb3J0LFxuXHRcdFx0XHRncm91cDogJ3NvcnRCeScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldykge1xuXHRcdHZpZXcudmlld01vZGVsLnZpZXdTb3J0aW5nID0gVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlEdXJhdGlvbjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd01vc3RSZWNlbnRPdXRwdXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuU2hvd01vc3RSZWNlbnRPdXRwdXRBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnNob3dNb3N0UmVjZW50T3V0cHV0JywgJ1Nob3cgT3V0cHV0JyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5TyksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQW55UmVzdWx0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLkNvbGxhcHNlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc0FueVJlc3VsdHMuaXNFcXVhbFRvKHRydWUpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHRlc3RWaWV3ID0gYXdhaXQgdmlld1NlcnZpY2Uub3BlblZpZXc8VGVzdFJlc3VsdHNWaWV3PihUZXN0aW5nLlJlc3VsdHNWaWV3SWQsIHRydWUpO1xuXHRcdHRlc3RWaWV3Py5zaG93TGF0ZXN0UnVuKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbGxhcHNlQWxsQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0aW5nRXhwbG9yZXJWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvbGxhcHNlQWxsQWN0aW9uLFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb2xsYXBzZUFsbCcsICdDb2xsYXBzZSBBbGwgVGVzdHMnKSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuQ29sbGFwc2UsXG5cdFx0XHRcdGdyb3VwOiAnZGlzcGxheUFjdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldykge1xuXHRcdHZpZXcudmlld01vZGVsLmNvbGxhcHNlQWxsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENsZWFyVGVzdFJlc3VsdHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ2xlYXJUZXN0UmVzdWx0c0FjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY2xlYXJSZXN1bHRzJywgJ0NsZWFyIEFsbCBSZXN1bHRzJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uY2xlYXJBbGwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RQZWVrVGl0bGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5DbGVhclJlc3VsdHMsXG5cdFx0XHRcdGdyb3VwOiAnZGlzcGxheUFjdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuQ2xlYXJSZXN1bHRzLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLlJlc3VsdHNWaWV3SWQpXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVRlc3RSZXN1bHRTZXJ2aWNlKS5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHb1RvVGVzdCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Hb1RvVGVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZWRpdEZvY3VzZWRUZXN0JywgJ0dvIHRvIFRlc3QnKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVzdEl0ZW0sXG5cdFx0XHRcdGdyb3VwOiAnYnVpbHRpbkAxJyxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLkdvVG9UZXN0LFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMudGVzdEl0ZW1IYXNVcmkuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgLSAxMCxcblx0XHRcdFx0d2hlbjogRm9jdXNlZFZpZXdDb250ZXh0LmlzRXF1YWxUbyhUZXN0aW5nLkV4cGxvcmVyVmlld0lkKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlciB8IEtleU1vZC5BbHQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWxlbWVudD86IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50LCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikge1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgdmlldyA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3V2l0aElkPFRlc3RpbmdFeHBsb3JlclZpZXc+KFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpO1xuXHRcdFx0ZWxlbWVudCA9IHZpZXc/LmZvY3VzZWRUcmVlRWxlbWVudHNbMF07XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgJiYgZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpIHtcblx0XHRcdGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUucmV2ZWFsVGVzdCcsIGVsZW1lbnQudGVzdC5pdGVtLmV4dElkLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0VGVzdHNBdEN1cnNvcih0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsIHVyaTogVVJJLCBwb3NpdGlvbjogUG9zaXRpb24sIGZpbHRlcj86ICh0ZXN0OiBJbnRlcm5hbFRlc3RJdGVtKSA9PiBib29sZWFuKSB7XG5cdC8vIHRlc3RzSW5GaWxlIHdpbGwgZGVzY2VuZCBpbiB0aGUgdGVzdCB0cmVlLiBXZSBhc3N1bWUgdGhhdCBhcyB3ZSBnb1xuXHQvLyBkZWVwZXIsIHJhbmdlcyBnZXQgbW9yZSBzcGVjaWZpYy4gV2UnbGwgd2FudCB0byBydW4gYWxsIHRlc3RzIHdob3NlXG5cdC8vIHJhbmdlIGlzIGVxdWFsIHRvIHRoZSBtb3N0IHNwZWNpZmljIHJhbmdlIHdlIGZpbmQgKHNlZSAjMTMzNTE5KVxuXHQvL1xuXHQvLyBJZiB3ZSBkb24ndCBmaW5kIGFueSB0ZXN0IHdob3NlIHJhbmdlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiwgd2UgcGlja1xuXHQvLyB0aGUgY2xvc2VzdCBvbmUgYmVmb3JlIHRoZSBwb3NpdGlvbi4gQWdhaW4sIGlmIHdlIGZpbmQgc2V2ZXJhbCB0ZXN0c1xuXHQvLyB3aG9zZSByYW5nZSBpcyBlcXVhbCB0byB0aGUgY2xvc2VzdCBvbmUsIHdlIHJ1biB0aGVtIGFsbC5cblxuXHRsZXQgYmVzdE5vZGVzOiBJbnRlcm5hbFRlc3RJdGVtW10gPSBbXTtcblx0bGV0IGJlc3RSYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cblx0bGV0IGJlc3ROb2Rlc0JlZm9yZTogSW50ZXJuYWxUZXN0SXRlbVtdID0gW107XG5cdGxldCBiZXN0UmFuZ2VCZWZvcmU6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdGZvciBhd2FpdCAoY29uc3QgdGVzdHMgb2YgdGVzdHNJbkZpbGUodGVzdFNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgdXJpKSkge1xuXHRcdGZvciAoY29uc3QgdGVzdCBvZiB0ZXN0cykge1xuXHRcdFx0aWYgKCF0ZXN0Lml0ZW0ucmFuZ2UgfHwgZmlsdGVyPy4odGVzdCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpcmFuZ2UgPSBSYW5nZS5saWZ0KHRlc3QuaXRlbS5yYW5nZSk7XG5cdFx0XHRpZiAoaXJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdGlmIChiZXN0UmFuZ2UgJiYgUmFuZ2UuZXF1YWxzUmFuZ2UodGVzdC5pdGVtLnJhbmdlLCBiZXN0UmFuZ2UpKSB7XG5cdFx0XHRcdFx0Ly8gY2hlY2sgdGhhdCBhIHBhcmVudCBpc24ndCBhbHJlYWR5IGluY2x1ZGVkICgjMTgwNzYwKVxuXHRcdFx0XHRcdGlmICghYmVzdE5vZGVzLnNvbWUoYiA9PiBUZXN0SWQuaXNDaGlsZChiLml0ZW0uZXh0SWQsIHRlc3QuaXRlbS5leHRJZCkpKSB7XG5cdFx0XHRcdFx0XHRiZXN0Tm9kZXMucHVzaCh0ZXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YmVzdFJhbmdlID0gaXJhbmdlO1xuXHRcdFx0XHRcdGJlc3ROb2RlcyA9IFt0ZXN0XTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChQb3NpdGlvbi5pc0JlZm9yZShpcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCBwb3NpdGlvbikpIHtcblx0XHRcdFx0aWYgKCFiZXN0UmFuZ2VCZWZvcmUgfHwgYmVzdFJhbmdlQmVmb3JlLmdldFN0YXJ0UG9zaXRpb24oKS5pc0JlZm9yZShpcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSkge1xuXHRcdFx0XHRcdGJlc3RSYW5nZUJlZm9yZSA9IGlyYW5nZTtcblx0XHRcdFx0XHRiZXN0Tm9kZXNCZWZvcmUgPSBbdGVzdF07XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXJhbmdlLmVxdWFsc1JhbmdlKGJlc3RSYW5nZUJlZm9yZSkgJiYgIWJlc3ROb2Rlc0JlZm9yZS5zb21lKGIgPT4gVGVzdElkLmlzQ2hpbGQoYi5pdGVtLmV4dElkLCB0ZXN0Lml0ZW0uZXh0SWQpKSkge1xuXHRcdFx0XHRcdGJlc3ROb2Rlc0JlZm9yZS5wdXNoKHRlc3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGJlc3ROb2Rlcy5sZW5ndGggPyBiZXN0Tm9kZXMgOiBiZXN0Tm9kZXNCZWZvcmU7XG59XG5cbmNvbnN0IGVudW0gRWRpdG9yQ29udGV4dE9yZGVyIHtcblx0UnVuQXRDdXJzb3IsXG5cdERlYnVnQXRDdXJzb3IsXG5cdFJ1bkluRmlsZSxcblx0RGVidWdJbkZpbGUsXG5cdEdvVG9SZWxhdGVkLFxuXHRQZWVrUmVsYXRlZCxcbn1cblxuYWJzdHJhY3QgY2xhc3MgRXhlY3V0ZVRlc3RBdEN1cnNvciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMsIHByb3RlY3RlZCByZWFkb25seSBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogaGFzQW55VGVzdFByb3ZpZGVyLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAndGVzdGluZycsXG5cdFx0XHRcdG9yZGVyOiBncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuID8gRWRpdG9yQ29udGV4dE9yZGVyLlJ1bkF0Q3Vyc29yIDogRWRpdG9yQ29udGV4dE9yZGVyLkRlYnVnQXRDdXJzb3IsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXN0aW5nQ29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMsIFRlc3RpbmdDb250ZXh0S2V5cy5jYXBhYmlsaXR5VG9Db250ZXh0S2V5W2dyb3VwXSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRsZXQgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yUGFuZSB8fCAhZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0ZWRpdG9yID0gZWRpdG9yLmdldFBhcmVudEVkaXRvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yPy5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yPy5nZXRNb2RlbCgpO1xuXHRcdGlmICghcG9zaXRpb24gfHwgIW1vZGVsIHx8ICEoJ3VyaScgaW4gbW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFByb2ZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9ncmVzc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBzYXZlQmVmb3JlVGVzdCA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5TYXZlQmVmb3JlVGVzdCk7XG5cdFx0aWYgKHNhdmVCZWZvcmVUZXN0KSB7XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnNhdmUoeyBlZGl0b3I6IGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQsIGdyb3VwSWQ6IGFjdGl2ZUVkaXRvclBhbmUuZ3JvdXAuaWQgfSk7XG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5zeW5jVGVzdHMoKTtcblx0XHR9XG5cblxuXHRcdC8vIHRlc3RzSW5GaWxlIHdpbGwgZGVzY2VuZCBpbiB0aGUgdGVzdCB0cmVlLiBXZSBhc3N1bWUgdGhhdCBhcyB3ZSBnb1xuXHRcdC8vIGRlZXBlciwgcmFuZ2VzIGdldCBtb3JlIHNwZWNpZmljLiBXZSdsbCB3YW50IHRvIHJ1biBhbGwgdGVzdHMgd2hvc2Vcblx0XHQvLyByYW5nZSBpcyBlcXVhbCB0byB0aGUgbW9zdCBzcGVjaWZpYyByYW5nZSB3ZSBmaW5kIChzZWUgIzEzMzUxOSlcblx0XHQvL1xuXHRcdC8vIElmIHdlIGRvbid0IGZpbmQgYW55IHRlc3Qgd2hvc2UgcmFuZ2UgY29udGFpbnMgdGhlIHBvc2l0aW9uLCB3ZSBwaWNrXG5cdFx0Ly8gdGhlIGNsb3Nlc3Qgb25lIGJlZm9yZSB0aGUgcG9zaXRpb24uIEFnYWluLCBpZiB3ZSBmaW5kIHNldmVyYWwgdGVzdHNcblx0XHQvLyB3aG9zZSByYW5nZSBpcyBlcXVhbCB0byB0aGUgY2xvc2VzdCBvbmUsIHdlIHJ1biB0aGVtIGFsbC5cblx0XHRjb25zdCB0ZXN0c1RvUnVuID0gYXdhaXQgc2hvd0Rpc2NvdmVyaW5nV2hpbGUocHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdFx0Z2V0VGVzdHNBdEN1cnNvcihcblx0XHRcdFx0dGVzdFNlcnZpY2UsXG5cdFx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0XHRwb3NpdGlvbixcblx0XHRcdFx0dGVzdCA9PiAhIShwcm9maWxlU2VydmljZS5jYXBhYmlsaXRpZXNGb3JUZXN0KHRlc3QuaXRlbSkgJiB0aGlzLmdyb3VwKVxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHRpZiAodGVzdHNUb1J1bi5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgZ3JvdXA6IHRoaXMuZ3JvdXAsIHRlc3RzOiB0ZXN0c1RvUnVuIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbGF0ZWRUZXN0cyA9IGF3YWl0IHRlc3RTZXJ2aWNlLmdldFRlc3RzUmVsYXRlZFRvQ29kZShtb2RlbC51cmksIHBvc2l0aW9uKTtcblx0XHRpZiAocmVsYXRlZFRlc3RzLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGVzdFNlcnZpY2UucnVuVGVzdHMoeyBncm91cDogdGhpcy5ncm91cCwgdGVzdHM6IHJlbGF0ZWRUZXN0cyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc2hvd01lc3NhZ2UobG9jYWxpemUoJ25vVGVzdHNBdEN1cnNvcicsIFwiTm8gdGVzdHMgZm91bmQgaGVyZVwiKSwgcG9zaXRpb24pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUnVuQXRDdXJzb3IgZXh0ZW5kcyBFeGVjdXRlVGVzdEF0Q3Vyc29yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUnVuQXRDdXJzb3IsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnJ1bkF0Q3Vyc29yJywgJ1J1biBUZXN0IGF0IEN1cnNvcicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleUNvZGUuS2V5QyksXG5cdFx0XHR9LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnQXRDdXJzb3IgZXh0ZW5kcyBFeGVjdXRlVGVzdEF0Q3Vyc29yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuRGVidWdBdEN1cnNvcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZGVidWdBdEN1cnNvcicsICdEZWJ1ZyBUZXN0IGF0IEN1cnNvcicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDKSxcblx0XHRcdH0sXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZUF0Q3Vyc29yIGV4dGVuZHMgRXhlY3V0ZVRlc3RBdEN1cnNvciB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlQXRDdXJzb3IsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNvdmVyYWdlQXRDdXJzb3InLCAnUnVuIFRlc3QgYXQgQ3Vyc29yIHdpdGggQ292ZXJhZ2UnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QyksXG5cdFx0XHR9LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBFeGVjdXRlVGVzdHNVbmRlclVyaUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMsIHByb3RlY3RlZCByZWFkb25seSBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5jYXBhYmlsaXR5VG9Db250ZXh0S2V5W2dyb3VwXS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdGdyb3VwOiAnNi41X3Rlc3RpbmcnLFxuXHRcdFx0XHRvcmRlcjogKGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4gPyBBY3Rpb25PcmRlci5SdW4gOiBBY3Rpb25PcmRlci5EZWJ1ZykgKyAwLjEsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHVyaTogVVJJKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXN0cyA9IGF3YWl0IEl0ZXJhYmxlLmFzeW5jVG9BcnJheSh0ZXN0c1VuZGVyVXJpKFxuXHRcdFx0dGVzdFNlcnZpY2UsXG5cdFx0XHRhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSksXG5cdFx0XHR1cmlcblx0XHQpKTtcblxuXHRcdGlmICghdGVzdHMubGVuZ3RoKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7IG1lc3NhZ2U6IGxvY2FsaXplKCdub1Rlc3RzJywgJ05vIHRlc3RzIGZvdW5kIGluIHRoZSBzZWxlY3RlZCBmaWxlIG9yIGZvbGRlcicpLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGVzdFNlcnZpY2UucnVuVGVzdHMoeyB0ZXN0cywgZ3JvdXA6IHRoaXMuZ3JvdXAgfSk7XG5cdH1cbn1cblxuY2xhc3MgUnVuVGVzdHNVbmRlclVyaSBleHRlbmRzIEV4ZWN1dGVUZXN0c1VuZGVyVXJpQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUnVuQnlVcmksXG5cdFx0XHR0aXRsZTogTEFCRUxfUlVOX1RFU1RTLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuKTtcblx0fVxufVxuXG5jbGFzcyBEZWJ1Z1Rlc3RzVW5kZXJVcmkgZXh0ZW5kcyBFeGVjdXRlVGVzdHNVbmRlclVyaUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkRlYnVnQnlVcmksXG5cdFx0XHR0aXRsZTogTEFCRUxfREVCVUdfVEVTVFMsXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9LCBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Zyk7XG5cdH1cbn1cblxuY2xhc3MgQ292ZXJhZ2VUZXN0c1VuZGVyVXJpIGV4dGVuZHMgRXhlY3V0ZVRlc3RzVW5kZXJVcmlBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUJ5VXJpLFxuXHRcdFx0dGl0bGU6IExBQkVMX0NPVkVSQUdFX1RFU1RTLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEV4ZWN1dGVUZXN0c0luQ3VycmVudEZpbGUgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUFjdGlvbjJPcHRpb25zLCBwcm90ZWN0ZWQgcmVhZG9ubHkgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5jYXBhYmlsaXR5VG9Db250ZXh0S2V5W2dyb3VwXS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd0ZXN0aW5nJyxcblx0XHRcdFx0b3JkZXI6IGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4gPyBFZGl0b3JDb250ZXh0T3JkZXIuUnVuSW5GaWxlIDogRWRpdG9yQ29udGV4dE9yZGVyLkRlYnVnSW5GaWxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVzdGluZ0NvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzLCBUZXN0aW5nQ29udGV4dEtleXMuY2FwYWJpbGl0eVRvQ29udGV4dEtleVtncm91cF0pLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5CeVVyaXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZpbGVzOiBVUklbXSk6IFByb21pc2U8eyBjb21wbGV0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCB1cmlJZGVudGl0eSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpc2NvdmVyZWQ6IEludGVybmFsVGVzdEl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIGZpbGVzKSB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGZpbGVzIG9mIHRlc3RzSW5GaWxlKHRlc3RTZXJ2aWNlLCB1cmlJZGVudGl0eSwgdXJpLCB1bmRlZmluZWQsIHRydWUpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdGRpc2NvdmVyZWQucHVzaChmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkaXNjb3ZlcmVkLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgciA9IGF3YWl0IHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgdGVzdHM6IGRpc2NvdmVyZWQsIGdyb3VwOiB0aGlzLmdyb3VwIH0pO1xuXHRcdFx0cmV0dXJuIHsgY29tcGxldGVkQXQ6IHIuY29tcGxldGVkQXQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBjb21wbGV0ZWRBdDogdW5kZWZpbmVkIH07XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmaWxlcz86IFVSSVtdKSB7XG5cdFx0aWYgKGZpbGVzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ydW5CeVVyaXMoYWNjZXNzb3IsIGZpbGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmlJZGVudGl0eSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRsZXQgZWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdGVkaXRvciA9IGVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKTtcblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3I/LmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0aWYgKCFwb3NpdGlvbiB8fCAhbW9kZWwgfHwgISgndXJpJyBpbiBtb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIHRoZSBlbnRpcmUgY29sbGVjdGlvbiBhbmQgcnVuIGFueSB0ZXN0cyB0aGF0IGFyZSBpbiB0aGVcblx0XHQvLyB1cmkuIFNlZSAjMTM4MDA3LlxuXHRcdGNvbnN0IHF1ZXVlID0gW3Rlc3RTZXJ2aWNlLmNvbGxlY3Rpb24ucm9vdElkc107XG5cdFx0Y29uc3QgZGlzY292ZXJlZDogSW50ZXJuYWxUZXN0SXRlbVtdID0gW107XG5cdFx0d2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBxdWV1ZS5wb3AoKSEpIHtcblx0XHRcdFx0Y29uc3Qgbm9kZSA9IHRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5SWQoaWQpITtcblx0XHRcdFx0aWYgKHVyaUlkZW50aXR5LmV4dFVyaS5pc0VxdWFsKG5vZGUuaXRlbS51cmksIG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0XHRkaXNjb3ZlcmVkLnB1c2gobm9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cXVldWUucHVzaChub2RlLmNoaWxkcmVuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkaXNjb3ZlcmVkLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHtcblx0XHRcdFx0dGVzdHM6IGRpc2NvdmVyZWQsXG5cdFx0XHRcdGdyb3VwOiB0aGlzLmdyb3VwLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnNob3dNZXNzYWdlKGxvY2FsaXplKCdub1Rlc3RzSW5GaWxlJywgXCJObyB0ZXN0cyBmb3VuZCBpbiB0aGlzIGZpbGVcIiksIHBvc2l0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSdW5DdXJyZW50RmlsZSBleHRlbmRzIEV4ZWN1dGVUZXN0c0luQ3VycmVudEZpbGUge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bkN1cnJlbnRGaWxlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5ydW5DdXJyZW50RmlsZScsICdSdW4gVGVzdHMgaW4gQ3VycmVudCBGaWxlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5Q29kZS5LZXlGKSxcblx0XHRcdH0sXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdDdXJyZW50RmlsZSBleHRlbmRzIEV4ZWN1dGVUZXN0c0luQ3VycmVudEZpbGUge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5EZWJ1Z0N1cnJlbnRGaWxlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5kZWJ1Z0N1cnJlbnRGaWxlJywgJ0RlYnVnIFRlc3RzIGluIEN1cnJlbnQgRmlsZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlGKSxcblx0XHRcdH0sXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZUN1cnJlbnRGaWxlIGV4dGVuZHMgRXhlY3V0ZVRlc3RzSW5DdXJyZW50RmlsZSB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlQ3VycmVudEZpbGUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNvdmVyYWdlQ3VycmVudEZpbGUnLCAnUnVuIFRlc3RzIHdpdGggQ292ZXJhZ2UgaW4gQ3VycmVudCBGaWxlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUYpLFxuXHRcdFx0fSxcblx0XHR9LCBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGRpc2NvdmVyQW5kUnVuVGVzdHMgPSBhc3luYyAoXG5cdGNvbGxlY3Rpb246IElNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24sXG5cdHByb2dyZXNzOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRpZHM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPixcblx0cnVuVGVzdHM6ICh0ZXN0czogUmVhZG9ubHlBcnJheTxJbnRlcm5hbFRlc3RJdGVtPikgPT4gUHJvbWlzZTxJVGVzdFJlc3VsdD4sXG4pOiBQcm9taXNlPElUZXN0UmVzdWx0IHwgdW5kZWZpbmVkPiA9PiB7XG5cdGNvbnN0IHRvZG8gPSBQcm9taXNlLmFsbChpZHMubWFwKHAgPT4gZXhwYW5kQW5kR2V0VGVzdEJ5SWQoY29sbGVjdGlvbiwgcCkpKTtcblx0Y29uc3QgdGVzdHMgPSAoYXdhaXQgc2hvd0Rpc2NvdmVyaW5nV2hpbGUocHJvZ3Jlc3MsIHRvZG8pKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0cmV0dXJuIHRlc3RzLmxlbmd0aCA/IGF3YWl0IHJ1blRlc3RzKHRlc3RzKSA6IHVuZGVmaW5lZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFJ1bk9yRGVidWdFeHRzQnlQYXRoIGV4dGVuZHMgQWN0aW9uMiB7XG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0YXdhaXQgZGlzY292ZXJBbmRSdW5UZXN0cyhcblx0XHRcdGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpLmNvbGxlY3Rpb24sXG5cdFx0XHRhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSksXG5cdFx0XHRbLi4udGhpcy5nZXRUZXN0RXh0SWRzVG9SdW4oYWNjZXNzb3IsIC4uLmFyZ3MpXSxcblx0XHRcdHRlc3RzID0+IHRoaXMucnVuVGVzdCh0ZXN0U2VydmljZSwgdGVzdHMpLFxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0VGVzdEV4dElkc1RvUnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBJdGVyYWJsZTxzdHJpbmc+O1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBydW5UZXN0KHNlcnZpY2U6IElUZXN0U2VydmljZSwgbm9kZTogcmVhZG9ubHkgSW50ZXJuYWxUZXN0SXRlbVtdKTogUHJvbWlzZTxJVGVzdFJlc3VsdD47XG59XG5cbmFic3RyYWN0IGNsYXNzIFJ1bk9yRGVidWdGYWlsZWRUZXN0cyBleHRlbmRzIFJ1bk9yRGVidWdFeHRzQnlQYXRoIHtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUFjdGlvbjJPcHRpb25zKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogaGFzQW55VGVzdFByb3ZpZGVyLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHByb3RlY3RlZCBnZXRUZXN0RXh0SWRzVG9SdW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGFjY2Vzc29yLmdldChJVGVzdFJlc3VsdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAobGV0IGkgPSByZXN1bHRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCByZXN1bHRTZXQgPSByZXN1bHRzW2ldO1xuXHRcdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHJlc3VsdFNldC50ZXN0cykge1xuXHRcdFx0XHRpZiAoaXNGYWlsZWRTdGF0ZSh0ZXN0Lm93bkNvbXB1dGVkU3RhdGUpKSB7XG5cdFx0XHRcdFx0aWRzLmFkZCh0ZXN0Lml0ZW0uZXh0SWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlkcy5kZWxldGUodGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpZHM7XG5cdH1cbn1cblxuXG5hYnN0cmFjdCBjbGFzcyBSdW5PckRlYnVnTGFzdFJ1biBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0aGFzQW55VGVzdFByb3ZpZGVyLFxuXHRcdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0R3JvdXAoKTogVGVzdFJ1blByb2ZpbGVCaXRzZXQ7XG5cblx0cHJvdGVjdGVkIGdldExhc3RUZXN0UnVuUmVxdWVzdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcnVuSWQ/OiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXN1bHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0UmVzdWx0U2VydmljZSk7XG5cdFx0Y29uc3QgbGFzdFJlc3VsdCA9IHJ1bklkID8gcmVzdWx0U2VydmljZS5yZXN1bHRzLmZpbmQociA9PiByLmlkID09PSBydW5JZCkgOiByZXN1bHRTZXJ2aWNlLnJlc3VsdHNbMF07XG5cdFx0cmV0dXJuIGxhc3RSZXN1bHQ/LnJlcXVlc3Q7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcnVuSWQ/OiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXN1bHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0UmVzdWx0U2VydmljZSk7XG5cdFx0Y29uc3QgbGFzdFJlc3VsdCA9IHJ1bklkID8gcmVzdWx0U2VydmljZS5yZXN1bHRzLmZpbmQociA9PiByLmlkID09PSBydW5JZCkgOiByZXN1bHRTZXJ2aWNlLnJlc3VsdHNbMF07XG5cdFx0aWYgKCFsYXN0UmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxID0gbGFzdFJlc3VsdC5yZXF1ZXN0O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZmlsZUV4aXN0cyA9ICh0OiB7IGNvbnRyb2xsZXJJZDogc3RyaW5nOyBwcm9maWxlSWQ6IG51bWJlciB9KSA9PlxuXHRcdFx0cHJvZmlsZVNlcnZpY2UuZ2V0Q29udHJvbGxlclByb2ZpbGVzKHQuY29udHJvbGxlcklkKS5zb21lKHAgPT4gcC5wcm9maWxlSWQgPT09IHQucHJvZmlsZUlkKTtcblxuXHRcdGF3YWl0IGRpc2NvdmVyQW5kUnVuVGVzdHMoXG5cdFx0XHR0ZXN0U2VydmljZS5jb2xsZWN0aW9uLFxuXHRcdFx0YWNjZXNzb3IuZ2V0KElQcm9ncmVzc1NlcnZpY2UpLFxuXHRcdFx0cmVxLnRhcmdldHMuZmxhdE1hcCh0ID0+IHQudGVzdElkcyksXG5cdFx0XHR0ZXN0cyA9PiB7XG5cdFx0XHRcdC8vIElmIHdlJ3JlIHJlcXVlc3RpbmcgYSByZS1ydW4gaW4gdGhlIHNhbWUgZ3JvdXAgYW5kIGhhdmUgdGhlIHNhbWUgcHJvZmlsZXNcblx0XHRcdFx0Ly8gYXMgd2VyZSB1c2VkIGJlZm9yZSwgdGhlbiB1c2UgdGhvc2UgZXhhY3RseS4gT3RoZXJ3aXNlIGd1ZXNzIG5haXZlbHkuXG5cdFx0XHRcdGlmICh0aGlzLmdldEdyb3VwKCkgJiByZXEuZ3JvdXAgJiYgcmVxLnRhcmdldHMuZXZlcnkocHJvZmlsZUV4aXN0cykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGVzdFNlcnZpY2UucnVuUmVzb2x2ZWRUZXN0cyh7XG5cdFx0XHRcdFx0XHR0YXJnZXRzOiByZXEudGFyZ2V0cyxcblx0XHRcdFx0XHRcdGdyb3VwOiByZXEuZ3JvdXAsXG5cdFx0XHRcdFx0XHRleGNsdWRlOiByZXEuZXhjbHVkZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdGVzdFNlcnZpY2UucnVuVGVzdHMoeyB0ZXN0cywgZ3JvdXA6IHRoaXMuZ2V0R3JvdXAoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZVJ1bkZhaWxlZFRlc3RzIGV4dGVuZHMgUnVuT3JEZWJ1Z0ZhaWxlZFRlc3RzIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUmVSdW5GYWlsZWRUZXN0cyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcucmVSdW5GYWlsVGVzdHMnLCAnUmVydW4gRmFpbGVkIFRlc3RzJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleUNvZGUuS2V5RSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJ1blRlc3Qoc2VydmljZTogSVRlc3RTZXJ2aWNlLCBpbnRlcm5hbFRlc3RzOiBJbnRlcm5hbFRlc3RJdGVtW10pOiBQcm9taXNlPElUZXN0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHNlcnZpY2UucnVuVGVzdHMoe1xuXHRcdFx0Z3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bixcblx0XHRcdHRlc3RzOiBpbnRlcm5hbFRlc3RzLFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z0ZhaWxlZFRlc3RzIGV4dGVuZHMgUnVuT3JEZWJ1Z0ZhaWxlZFRlc3RzIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuRGVidWdGYWlsZWRUZXN0cyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZGVidWdGYWlsVGVzdHMnLCAnRGVidWcgRmFpbGVkIFRlc3RzJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlFKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcnVuVGVzdChzZXJ2aWNlOiBJVGVzdFNlcnZpY2UsIGludGVybmFsVGVzdHM6IEludGVybmFsVGVzdEl0ZW1bXSk6IFByb21pc2U8SVRlc3RSZXN1bHQ+IHtcblx0XHRyZXR1cm4gc2VydmljZS5ydW5UZXN0cyh7XG5cdFx0XHRncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsXG5cdFx0XHR0ZXN0czogaW50ZXJuYWxUZXN0cyxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVSdW5MYXN0UnVuIGV4dGVuZHMgUnVuT3JEZWJ1Z0xhc3RSdW4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SZVJ1bkxhc3RSdW4sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnJlUnVuTGFzdFJ1bicsICdSZXJ1biBMYXN0IFJ1bicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlDb2RlLktleUwpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRHcm91cCgpOiBUZXN0UnVuUHJvZmlsZUJpdHNldCB7XG5cdFx0cmV0dXJuIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdMYXN0UnVuIGV4dGVuZHMgUnVuT3JEZWJ1Z0xhc3RSdW4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5EZWJ1Z0xhc3RSdW4sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmRlYnVnTGFzdFJ1bicsICdEZWJ1ZyBMYXN0IFJ1bicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5TCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEdyb3VwKCk6IFRlc3RSdW5Qcm9maWxlQml0c2V0IHtcblx0XHRyZXR1cm4gVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWc7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlTGFzdFJ1biBleHRlbmRzIFJ1bk9yRGVidWdMYXN0UnVuIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VMYXN0UnVuLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb3ZlcmFnZUxhc3RSdW4nLCAnUmVydW4gTGFzdCBSdW4gd2l0aCBDb3ZlcmFnZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5TCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEdyb3VwKCk6IFRlc3RSdW5Qcm9maWxlQml0c2V0IHtcblx0XHRyZXR1cm4gVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2U7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgUnVuT3JEZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucykge1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRoYXNBbnlUZXN0UHJvdmlkZXIsXG5cdFx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmhhc0FueVJlc3VsdHMuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRHcm91cCgpOiBUZXN0UnVuUHJvZmlsZUJpdHNldDtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcnVuSWQ/OiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXN1bHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0UmVzdWx0U2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cblx0XHRjb25zdCBsYXN0UmVzdWx0ID0gcnVuSWQgPyByZXN1bHRTZXJ2aWNlLnJlc3VsdHMuZmluZChyID0+IHIuaWQgPT09IHJ1bklkKSA6IHJlc3VsdFNlcnZpY2UucmVzdWx0c1swXTtcblx0XHRpZiAoIWxhc3RSZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmYWlsZWRUZXN0SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCB0ZXN0IG9mIGxhc3RSZXN1bHQudGVzdHMpIHtcblx0XHRcdGlmIChpc0ZhaWxlZFN0YXRlKHRlc3Qub3duQ29tcHV0ZWRTdGF0ZSkpIHtcblx0XHRcdFx0ZmFpbGVkVGVzdElkcy5hZGQodGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZmFpbGVkVGVzdElkcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgZGlzY292ZXJBbmRSdW5UZXN0cyhcblx0XHRcdHRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24sXG5cdFx0XHRwcm9ncmVzc1NlcnZpY2UsXG5cdFx0XHRBcnJheS5mcm9tKGZhaWxlZFRlc3RJZHMpLFxuXHRcdFx0dGVzdHMgPT4gdGVzdFNlcnZpY2UucnVuVGVzdHMoeyB0ZXN0cywgZ3JvdXA6IHRoaXMuZ2V0R3JvdXAoKSB9KSxcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZVJ1bkZhaWxlZEZyb21MYXN0UnVuIGV4dGVuZHMgUnVuT3JEZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUmVSdW5GYWlsZWRGcm9tTGFzdFJ1bixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcucmVSdW5GYWlsZWRGcm9tTGFzdFJ1bicsICdSZXJ1biBGYWlsZWQgVGVzdHMgZnJvbSBMYXN0IFJ1bicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0R3JvdXAoKTogVGVzdFJ1blByb2ZpbGVCaXRzZXQge1xuXHRcdHJldHVybiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnRmFpbGVkRnJvbUxhc3RSdW4gZXh0ZW5kcyBSdW5PckRlYnVnRmFpbGVkRnJvbUxhc3RSdW4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5EZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5kZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuJywgJ0RlYnVnIEZhaWxlZCBUZXN0cyBmcm9tIExhc3QgUnVuJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRHcm91cCgpOiBUZXN0UnVuUHJvZmlsZUJpdHNldCB7XG5cdFx0cmV0dXJuIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hGb3JUZXN0RXh0ZW5zaW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlNlYXJjaEZvclRlc3RFeHRlbnNpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnNlYXJjaEZvclRlc3RFeHRlbnNpb24nLCAnU2VhcmNoIGZvciBUZXN0IEV4dGVuc2lvbicpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLm9wZW5TZWFyY2goJ0BjYXRlZ29yeTpcInRlc3RpbmdcIicpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuT3V0cHV0UGVlayBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5PcGVuT3V0cHV0UGVlayxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcub3Blbk91dHB1dFBlZWsnLCAnUGVlayBPdXRwdXQnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU0pLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc0FueVJlc3VsdHMuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVRlc3RpbmdQZWVrT3BlbmVyKS5vcGVuKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUlubGluZVRlc3RPdXRwdXQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuVG9nZ2xlSW5saW5lVGVzdE91dHB1dCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcudG9nZ2xlSW5saW5lVGVzdE91dHB1dCcsICdUb2dnbGUgSW5saW5lIFRlc3QgT3V0cHV0JyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHR0ZXN0U2VydmljZS5zaG93SW5saW5lT3V0cHV0LnZhbHVlID0gIXRlc3RTZXJ2aWNlLnNob3dJbmxpbmVPdXRwdXQudmFsdWU7XG5cdH1cbn1cblxuY29uc3QgcmVmcmVzaE1lbnVzID0gKHdoZW5Jc1JlZnJlc2hpbmc6IGJvb2xlYW4pOiBJQWN0aW9uMk9wdGlvbnNbJ21lbnUnXSA9PiBbXG5cdHtcblx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRvcmRlcjogQWN0aW9uT3JkZXIuUmVmcmVzaCxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY2FuUmVmcmVzaFRlc3RzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc1JlZnJlc2hpbmdUZXN0cy5pc0VxdWFsVG8od2hlbklzUmVmcmVzaGluZyksXG5cdFx0KSxcblx0fSxcblx0e1xuXHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXI6IEFjdGlvbk9yZGVyLlJlZnJlc2gsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZCksXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY2FuUmVmcmVzaFRlc3RzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc1JlZnJlc2hpbmdUZXN0cy5pc0VxdWFsVG8od2hlbklzUmVmcmVzaGluZyksXG5cdFx0KSxcblx0fSxcblx0e1xuXHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmNhblJlZnJlc2hUZXN0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdH0sXG5dO1xuXG5leHBvcnQgY2xhc3MgUmVmcmVzaFRlc3RzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJlZnJlc2hUZXN0c0FjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcucmVmcmVzaFRlc3RzJywgJ1JlZnJlc2ggVGVzdHMnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1JlZnJlc2hUZXN0cyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlSKSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmNhblJlZnJlc2hUZXN0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogcmVmcmVzaE1lbnVzKGZhbHNlKSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmVsZW1lbnRzOiBUZXN0SXRlbVRyZWVFbGVtZW50W10pIHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZ3Jlc3NTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXJJZHMgPSBkaXN0aW5jdChlbGVtZW50cy5maWx0ZXIoaXNEZWZpbmVkKS5tYXAoZSA9PiBlLnRlc3QuY29udHJvbGxlcklkKSk7XG5cdFx0cmV0dXJuIHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogVGVzdGluZy5WaWV3bGV0SWQgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGNvbnRyb2xsZXJJZHMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGNvbnRyb2xsZXJJZHMubWFwKGlkID0+IHRlc3RTZXJ2aWNlLnJlZnJlc2hUZXN0cyhpZCkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnJlZnJlc2hUZXN0cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDYW5jZWxUZXN0UmVmcmVzaEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5DYW5jZWxUZXN0UmVmcmVzaEFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY2FuY2VsVGVzdFJlZnJlc2gnLCAnQ2FuY2VsIFRlc3QgUmVmcmVzaCcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nQ2FuY2VsUmVmcmVzaFRlc3RzLFxuXHRcdFx0bWVudTogcmVmcmVzaE1lbnVzKHRydWUpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpLmNhbmNlbFJlZnJlc2hUZXN0cygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbGVhcmVDb3ZlcmFnZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUNsZWFyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jbGVhckNvdmVyYWdlJywgJ0NsZWFyIENvdmVyYWdlJyksXG5cdFx0XHRpY29uOiB3aWRnZXRDbG9zZSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5SZWZyZXNoLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkNvdmVyYWdlVmlld0lkKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaXNUZXN0Q292ZXJhZ2VPcGVuLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElUZXN0Q292ZXJhZ2VTZXJ2aWNlKS5jbG9zZUNvdmVyYWdlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Db3ZlcmFnZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5PcGVuQ292ZXJhZ2UsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLm9wZW5Db3ZlcmFnZScsICdPcGVuIENvdmVyYWdlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGFjY2Vzc29yLmdldChJVGVzdFJlc3VsdFNlcnZpY2UpLnJlc3VsdHM7XG5cdFx0Y29uc3QgdGFzayA9IHJlc3VsdHMubGVuZ3RoICYmIHJlc3VsdHNbMF0udGFza3MuZmluZChyID0+IHIuY292ZXJhZ2UpO1xuXHRcdGlmICghdGFzaykge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3Rlc3Rpbmcubm9Db3ZlcmFnZScsICdObyBjb3ZlcmFnZSBpbmZvcm1hdGlvbiBhdmFpbGFibGUgb24gdGhlIGxhc3QgdGVzdCBydW4uJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFjY2Vzc29yLmdldChJVGVzdENvdmVyYWdlU2VydmljZSkub3BlbkNvdmVyYWdlKHRhc2ssIHRydWUpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIFRlc3ROYXZpZ2F0aW9uQWN0aW9uIGV4dGVuZHMgU3ltYm9sTmF2aWdhdGlvbkFjdGlvbiB7XG5cdHByb3RlY3RlZCB0ZXN0U2VydmljZSE6IElUZXN0U2VydmljZTsgLy8gbGl0dGxlIGhhY2suLi5cblx0cHJvdGVjdGVkIHVyaUlkZW50aXR5U2VydmljZSE6IElVcmlJZGVudGl0eVNlcnZpY2U7XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0dGhpcy50ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdHJldHVybiBzdXBlci5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBlZGl0b3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRBbHRlcm5hdGl2ZUNvbW1hbmQoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikuYWx0ZXJuYXRpdmVUZXN0c0NvbW1hbmQ7XG5cdH1cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRHb1RvUHJlZmVyZW5jZShlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogR29Ub0xvY2F0aW9uVmFsdWVzIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uKS5tdWx0aXBsZVRlc3RzIHx8ICdwZWVrJztcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBHb1RvUmVsYXRlZFRlc3RBY3Rpb24gZXh0ZW5kcyBUZXN0TmF2aWdhdGlvbkFjdGlvbiB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZ2V0TG9jYXRpb25Nb2RlbChfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IHVua25vd24sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVmZXJlbmNlc01vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdGVzdHMgPSBhd2FpdCB0aGlzLnRlc3RTZXJ2aWNlLmdldFRlc3RzUmVsYXRlZFRvQ29kZShtb2RlbC51cmksIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwoXG5cdFx0XHR0ZXN0cy5tYXAodCA9PiB0Lml0ZW0udXJpICYmICh7IHVyaTogdC5pdGVtLnVyaSwgcmFuZ2U6IHQuaXRlbS5yYW5nZSB8fCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSkpLmZpbHRlcihpc0RlZmluZWQpLFxuXHRcdFx0bG9jYWxpemUoJ3JlbGF0ZWRUZXN0cycsICdSZWxhdGVkIFRlc3RzJyksXG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0Tm9SZXN1bHRGb3VuZE1lc3NhZ2UoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ25vVGVzdEZvdW5kJywgJ05vIHJlbGF0ZWQgdGVzdHMgZm91bmQuJyk7XG5cdH1cbn1cblxuY2xhc3MgR29Ub1JlbGF0ZWRUZXN0IGV4dGVuZHMgR29Ub1JlbGF0ZWRUZXN0QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkdvVG9SZWxhdGVkVGVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub1JlbGF0ZWRUZXN0JywgJ0dvIHRvIFJlbGF0ZWQgVGVzdCcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiBtYWtlIHRoaXMgbW9yZSBleHBsaWNpdCBiYXNlZCBvbiBjdXJzb3IgcG9zaXRpb25cblx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KFRlc3RpbmdDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNUZXN0cy5rZXkpLCBUZXN0aW5nQ29udGV4dEtleXMuY2FuR29Ub1JlbGF0ZWRUZXN0LFxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd0ZXN0aW5nJyxcblx0XHRcdFx0b3JkZXI6IEVkaXRvckNvbnRleHRPcmRlci5Hb1RvUmVsYXRlZCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgUGVla1JlbGF0ZWRUZXN0IGV4dGVuZHMgR29Ub1JlbGF0ZWRUZXN0QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiB0cnVlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUGVla1JlbGF0ZWRUZXN0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5wZWVrVG9SZWxhdGVkVGVzdCcsICdQZWVrIFJlbGF0ZWQgVGVzdCcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmNhbkdvVG9SZWxhdGVkVGVzdCxcblx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiBtYWtlIHRoaXMgbW9yZSBleHBsaWNpdCBiYXNlZCBvbiBjdXJzb3IgcG9zaXRpb25cblx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KFRlc3RpbmdDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNUZXN0cy5rZXkpLFxuXHRcdFx0XHRQZWVrQ29udGV4dC5ub3RJblBlZWtFZGl0b3IsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd0ZXN0aW5nJyxcblx0XHRcdFx0b3JkZXI6IEVkaXRvckNvbnRleHRPcmRlci5QZWVrUmVsYXRlZCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgR29Ub1JlbGF0ZWRDb2RlQWN0aW9uIGV4dGVuZHMgVGVzdE5hdmlnYXRpb25BY3Rpb24ge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiB1bmtub3duLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRlc3RzQXRDdXJzb3IgPSBhd2FpdCBnZXRUZXN0c0F0Q3Vyc29yKHRoaXMudGVzdFNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCBtb2RlbC51cmksIHBvc2l0aW9uKTtcblx0XHRjb25zdCBjb2RlID0gYXdhaXQgUHJvbWlzZS5hbGwodGVzdHNBdEN1cnNvci5tYXAodCA9PiB0aGlzLnRlc3RTZXJ2aWNlLmdldENvZGVSZWxhdGVkVG9UZXN0KHQpKSk7XG5cdFx0cmV0dXJuIG5ldyBSZWZlcmVuY2VzTW9kZWwoY29kZS5mbGF0KCksIGxvY2FsaXplKCdyZWxhdGVkQ29kZScsICdSZWxhdGVkIENvZGUnKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdub1JlbGF0ZWRDb2RlJywgJ05vIHJlbGF0ZWQgY29kZSBmb3VuZC4nKTtcblx0fVxufVxuXG5jbGFzcyBHb1RvUmVsYXRlZENvZGUgZXh0ZW5kcyBHb1RvUmVsYXRlZENvZGVBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IGZhbHNlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuR29Ub1JlbGF0ZWRDb2RlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5nb1RvUmVsYXRlZENvZGUnLCAnR28gdG8gUmVsYXRlZCBDb2RlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMsXG5cdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5jYW5Hb1RvUmVsYXRlZENvZGUsXG5cdFx0XHQpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3Rlc3RpbmcnLFxuXHRcdFx0XHRvcmRlcjogRWRpdG9yQ29udGV4dE9yZGVyLkdvVG9SZWxhdGVkLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBQZWVrUmVsYXRlZENvZGUgZXh0ZW5kcyBHb1RvUmVsYXRlZENvZGVBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRvcGVuVG9TaWRlOiBmYWxzZSxcblx0XHRcdG9wZW5JblBlZWs6IHRydWUsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5QZWVrUmVsYXRlZENvZGUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnBlZWtUb1JlbGF0ZWRDb2RlJywgJ1BlZWsgUmVsYXRlZCBDb2RlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMsXG5cdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5jYW5Hb1RvUmVsYXRlZENvZGUsXG5cdFx0XHRcdFBlZWtDb250ZXh0Lm5vdEluUGVla0VkaXRvcixcblx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLnRvTmVnYXRlZCgpXG5cdFx0XHQpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3Rlc3RpbmcnLFxuXHRcdFx0XHRvcmRlcjogRWRpdG9yQ29udGV4dE9yZGVyLlBlZWtSZWxhdGVkLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlUmVzdWx0c1ZpZXdMYXlvdXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuVG9nZ2xlUmVzdWx0c1ZpZXdMYXlvdXRBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnRvZ2dsZVJlc3VsdHNWaWV3TGF5b3V0JywgJ1RvZ2dsZSBUcmVlIFBvc2l0aW9uJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dTd2FwLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLkRpc3BsYXlNb2RlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLlJlc3VsdHNWaWV3SWQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjdXJyZW50TGF5b3V0ID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLlJlc3VsdHNWaWV3TGF5b3V0KTtcblx0XHRjb25zdCBuZXdMYXlvdXQgPSBjdXJyZW50TGF5b3V0ID09PSBUZXN0aW5nUmVzdWx0c1ZpZXdMYXlvdXQuVHJlZUxlZnQgPyBUZXN0aW5nUmVzdWx0c1ZpZXdMYXlvdXQuVHJlZVJpZ2h0IDogVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0LlRyZWVMZWZ0O1xuXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGVzdGluZ0NvbmZpZ0tleXMuUmVzdWx0c1ZpZXdMYXlvdXQsIG5ld0xheW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGFsbFRlc3RBY3Rpb25zID0gW1xuXHRDYW5jZWxUZXN0UmVmcmVzaEFjdGlvbixcblx0Q2FuY2VsVGVzdFJ1bkFjdGlvbixcblx0Q2xlYXJlQ292ZXJhZ2UsXG5cdENsZWFyVGVzdFJlc3VsdHNBY3Rpb24sXG5cdENvbGxhcHNlQWxsQWN0aW9uLFxuXHRDb25maWd1cmVUZXN0UHJvZmlsZXNBY3Rpb24sXG5cdENvbnRpbnVvdXNSdW5UZXN0QWN0aW9uLFxuXHRDb250aW51b3VzUnVuVXNpbmdQcm9maWxlVGVzdEFjdGlvbixcblx0Q292ZXJhZ2VBY3Rpb24sXG5cdENvdmVyYWdlQWxsQWN0aW9uLFxuXHRDb3ZlcmFnZUF0Q3Vyc29yLFxuXHRDb3ZlcmFnZUN1cnJlbnRGaWxlLFxuXHRDb3ZlcmFnZUxhc3RSdW4sXG5cdENvdmVyYWdlU2VsZWN0ZWRBY3Rpb24sXG5cdENvdmVyYWdlVGVzdHNVbmRlclVyaSxcblx0RGVidWdBY3Rpb24sXG5cdERlYnVnQWxsQWN0aW9uLFxuXHREZWJ1Z0F0Q3Vyc29yLFxuXHREZWJ1Z0N1cnJlbnRGaWxlLFxuXHREZWJ1Z0ZhaWxlZFRlc3RzLFxuXHREZWJ1Z0xhc3RSdW4sXG5cdERlYnVnU2VsZWN0ZWRBY3Rpb24sXG5cdERlYnVnVGVzdHNVbmRlclVyaSxcblx0R2V0RXhwbG9yZXJTZWxlY3Rpb24sXG5cdEdldFNlbGVjdGVkUHJvZmlsZXMsXG5cdEdvVG9SZWxhdGVkQ29kZSxcblx0R29Ub1JlbGF0ZWRUZXN0LFxuXHRHb1RvVGVzdCxcblx0SGlkZVRlc3RBY3Rpb24sXG5cdE9wZW5Db3ZlcmFnZSxcblx0T3Blbk91dHB1dFBlZWssXG5cdFBlZWtSZWxhdGVkQ29kZSxcblx0UGVla1JlbGF0ZWRUZXN0LFxuXHRSZWZyZXNoVGVzdHNBY3Rpb24sXG5cdFJlUnVuRmFpbGVkVGVzdHMsXG5cdFJlUnVuTGFzdFJ1bixcblx0UnVuQWN0aW9uLFxuXHRSdW5BbGxBY3Rpb24sXG5cdFJ1bkF0Q3Vyc29yLFxuXHRSdW5DdXJyZW50RmlsZSxcblx0UnVuU2VsZWN0ZWRBY3Rpb24sXG5cdFJ1blRlc3RzVW5kZXJVcmksXG5cdFJ1blVzaW5nUHJvZmlsZUFjdGlvbixcblx0U2VhcmNoRm9yVGVzdEV4dGVuc2lvbixcblx0U2VsZWN0RGVmYXVsdFRlc3RQcm9maWxlcyxcblx0U2hvd01vc3RSZWNlbnRPdXRwdXRBY3Rpb24sXG5cdFN0YXJ0Q29udGludW91c1J1bkFjdGlvbixcblx0U3RvcENvbnRpbnVvdXNSdW5BY3Rpb24sXG5cdFRlc3RpbmdTb3J0QnlEdXJhdGlvbkFjdGlvbixcblx0VGVzdGluZ1NvcnRCeUxvY2F0aW9uQWN0aW9uLFxuXHRUZXN0aW5nU29ydEJ5U3RhdHVzQWN0aW9uLFxuXHRUZXN0aW5nVmlld0FzTGlzdEFjdGlvbixcblx0VGVzdGluZ1ZpZXdBc1RyZWVBY3Rpb24sXG5cdFRvZ2dsZUlubGluZVRlc3RPdXRwdXQsXG5cdFRvZ2dsZVJlc3VsdHNWaWV3TGF5b3V0QWN0aW9uLFxuXHRVbmhpZGVBbGxUZXN0c0FjdGlvbixcblx0VW5oaWRlVGVzdEFjdGlvbixcblx0UmVSdW5GYWlsZWRGcm9tTGFzdFJ1bixcblx0RGVidWdGYWlsZWRGcm9tTGFzdFJ1bixcbl07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQjtBQUcxQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUF3QztBQUNqRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQTBCLGNBQWM7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBc0MsNkJBQTZCO0FBRTVFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUywwQkFBK0Q7QUFDeEUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FB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LE1BQ2xCLE9BQU8sVUFBVSxtQ0FBbUMsc0JBQXNCO0FBQUEsTUFDMUU7QUFBQSxNQUNBLE1BQU0sUUFBUTtBQUFBLE1BQ2QsTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsT0FBTyxRQUFRLFFBQVEsYUFBYTtBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBc0IsSUFBSSxVQUE0QjtBQUNyRCxVQUFNLHVCQUF1QixTQUFTLElBQUkscUJBQXFCO0FBQy9ELFVBQU0sZ0JBQWdCLHdCQUF3QixzQkFBc0Isa0JBQWtCLGlCQUFpQjtBQUN2RyxVQUFNLFlBQVksa0JBQWtCLHlCQUF5QixXQUFXLHlCQUF5QixZQUFZLHlCQUF5QjtBQUV0SSxVQUFNLHFCQUFxQixZQUFZLGtCQUFrQixtQkFBbUIsU0FBUztBQUFBLEVBQ3RGO0FBQ0Q7QUFFTyxNQUFNLGlCQUFpQjtBQUFBLEVBQzdCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEOyIsCiAgIm5hbWVzIjogWyJBY3Rpb25PcmRlciIsICJwIiwgIkVkaXRvckNvbnRleHRPcmRlciIsICJmaWxlcyJdCn0K
