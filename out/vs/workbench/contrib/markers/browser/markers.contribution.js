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
import "./markersFileDecorations.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize, localize2 } from "../../../../nls.js";
import { Marker, RelatedInformation, ResourceMarkers } from "./markersModel.js";
import { MarkersView } from "./markersView.js";
import { MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { MarkersViewMode, Markers, MarkersContextKeys } from "../common/markers.js";
import Messages from "./messages.js";
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { Extensions as ViewContainerExtensions, ViewContainerLocation, WindowEnablement } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { getVisbileViewContextKey, FocusedViewContext } from "../../../common/contextkeys.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ViewAction } from "../../../browser/parts/views/viewPane.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { viewFilterSubmenu } from "../../../browser/parts/views/viewFilter.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { problemsConfigurationNodeBase } from "../../../common/configuration.js";
import { MarkerChatContextContribution } from "./markersChatContext.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { ProblemsAccessibilityHelp } from "./markersAccessibilityHelp.js";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: Markers.MARKER_OPEN_ACTION_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(MarkersContextKeys.MarkerFocusContextKey),
  primary: KeyCode.Enter,
  mac: {
    primary: KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
  },
  handler: (accessor, args) => {
    const markersView = accessor.get(IViewsService).getActiveViewWithId(Markers.MARKERS_VIEW_ID);
    markersView.openFileAtElement(markersView.getFocusElement(), false, false, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: Markers.MARKER_OPEN_SIDE_ACTION_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(MarkersContextKeys.MarkerFocusContextKey),
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  mac: {
    primary: KeyMod.WinCtrl | KeyCode.Enter
  },
  handler: (accessor, args) => {
    const markersView = accessor.get(IViewsService).getActiveViewWithId(Markers.MARKERS_VIEW_ID);
    markersView.openFileAtElement(markersView.getFocusElement(), false, true, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: Markers.MARKER_SHOW_PANEL_ID,
  weight: KeybindingWeight.WorkbenchContrib,
  when: void 0,
  primary: void 0,
  handler: async (accessor, args) => {
    await accessor.get(IViewsService).openView(Markers.MARKERS_VIEW_ID);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: Markers.MARKER_SHOW_QUICK_FIX,
  weight: KeybindingWeight.WorkbenchContrib,
  when: MarkersContextKeys.MarkerFocusContextKey,
  primary: KeyMod.CtrlCmd | KeyCode.Period,
  handler: (accessor, args) => {
    const markersView = accessor.get(IViewsService).getActiveViewWithId(Markers.MARKERS_VIEW_ID);
    const focusedElement = markersView.getFocusElement();
    if (focusedElement instanceof Marker) {
      markersView.showQuickFixes(focusedElement);
    }
  }
});
Registry.as(Extensions.Configuration).registerConfiguration({
  ...problemsConfigurationNodeBase,
  "properties": {
    "problems.autoReveal": {
      "description": Messages.PROBLEMS_PANEL_CONFIGURATION_AUTO_REVEAL,
      "type": "boolean",
      "default": true
    },
    "problems.defaultViewMode": {
      "description": Messages.PROBLEMS_PANEL_CONFIGURATION_VIEW_MODE,
      "type": "string",
      "default": "tree",
      "enum": ["table", "tree"]
    },
    "problems.showCurrentInStatus": {
      "description": Messages.PROBLEMS_PANEL_CONFIGURATION_SHOW_CURRENT_STATUS,
      "type": "boolean",
      "default": false
    },
    "problems.sortOrder": {
      "description": Messages.PROBLEMS_PANEL_CONFIGURATION_COMPARE_ORDER,
      "type": "string",
      "default": "severity",
      "enum": ["severity", "position"],
      "enumDescriptions": [
        Messages.PROBLEMS_PANEL_CONFIGURATION_COMPARE_ORDER_SEVERITY,
        Messages.PROBLEMS_PANEL_CONFIGURATION_COMPARE_ORDER_POSITION
      ]
    }
  }
});
const markersViewIcon = registerIcon("markers-view-icon", Codicon.warning, localize("markersViewIcon", "View icon of the markers view."));
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
  id: Markers.MARKERS_CONTAINER_ID,
  title: Messages.MARKERS_PANEL_TITLE_PROBLEMS,
  icon: markersViewIcon,
  hideIfEmpty: true,
  order: 0,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [Markers.MARKERS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
  storageId: Markers.MARKERS_VIEW_STORAGE_ID,
  windowEnablement: WindowEnablement.Both
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
  id: Markers.MARKERS_VIEW_ID,
  containerIcon: markersViewIcon,
  name: Messages.MARKERS_PANEL_TITLE_PROBLEMS,
  canToggleVisibility: true,
  canMoveView: true,
  ctorDescriptor: new SyncDescriptor(MarkersView),
  openCommandActionDescriptor: {
    id: "workbench.actions.view.problems",
    mnemonicTitle: localize({ key: "miMarker", comment: ["&& denotes a mnemonic"] }, "&&Problems"),
    keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM },
    order: 0
  },
  windowEnablement: WindowEnablement.Both
}], VIEW_CONTAINER);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.table.${Markers.MARKERS_VIEW_ID}.viewAsTree`,
      title: localize("viewAsTree", "View as Tree"),
      metadata: {
        description: localize2("viewAsTreeDescription", "Show the problems view as a tree.")
      },
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersViewModeContextKey.isEqualTo(MarkersViewMode.Table)),
        group: "navigation",
        order: 3
      },
      icon: Codicon.listTree,
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.setViewMode(MarkersViewMode.Tree);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.table.${Markers.MARKERS_VIEW_ID}.viewAsTable`,
      title: localize("viewAsTable", "View as Table"),
      metadata: {
        description: localize2("viewAsTableDescription", "Show the problems view as a table.")
      },
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersViewModeContextKey.isEqualTo(MarkersViewMode.Tree)),
        group: "navigation",
        order: 3
      },
      icon: Codicon.listFlat,
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.setViewMode(MarkersViewMode.Table);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleErrors`,
      title: localize("show errors", "Show Errors"),
      metadata: {
        description: localize2("toggleErrorsDescription", "Show or hide errors in the problems view.")
      },
      category: localize("problems", "Problems"),
      toggled: MarkersContextKeys.ShowErrorsFilterContextKey,
      menu: {
        id: viewFilterSubmenu,
        group: "1_filter",
        when: ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID),
        order: 1
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.filters.showErrors = !view.filters.showErrors;
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleWarnings`,
      title: localize("show warnings", "Show Warnings"),
      metadata: {
        description: localize2("toggleWarningsDescription", "Show or hide warnings in the problems view.")
      },
      category: localize("problems", "Problems"),
      toggled: MarkersContextKeys.ShowWarningsFilterContextKey,
      menu: {
        id: viewFilterSubmenu,
        group: "1_filter",
        when: ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID),
        order: 2
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.filters.showWarnings = !view.filters.showWarnings;
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleInfos`,
      title: localize("show infos", "Show Infos"),
      category: localize("problems", "Problems"),
      toggled: MarkersContextKeys.ShowInfoFilterContextKey,
      metadata: {
        description: localize2("toggleInfosDescription", "Show or hide infos in the problems view.")
      },
      menu: {
        id: viewFilterSubmenu,
        group: "1_filter",
        when: ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID),
        order: 3
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.filters.showInfos = !view.filters.showInfos;
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleActiveFile`,
      title: localize("show active file", "Show Active File Only"),
      metadata: {
        description: localize2("toggleActiveFileDescription", "Show or hide problems (errors, warnings, info) only from the active file in the problems view.")
      },
      category: localize("problems", "Problems"),
      toggled: MarkersContextKeys.ShowActiveFileFilterContextKey,
      menu: {
        id: viewFilterSubmenu,
        group: "2_filter",
        when: ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID),
        order: 1
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.filters.activeFile = !view.filters.activeFile;
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.${Markers.MARKERS_VIEW_ID}.toggleExcludedFiles`,
      title: localize("show excluded files", "Show Excluded Files"),
      metadata: {
        description: localize2("toggleExcludedFilesDescription", "Show or hide excluded files in the problems view.")
      },
      category: localize("problems", "Problems"),
      toggled: MarkersContextKeys.ShowExcludedFilesFilterContextKey.negate(),
      menu: {
        id: viewFilterSubmenu,
        group: "2_filter",
        when: ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID),
        order: 2
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    view.filters.excludedFiles = !view.filters.excludedFiles;
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.problems.focus",
      title: Messages.MARKERS_PANEL_SHOW_LABEL,
      category: Categories.View,
      f1: true
    });
  }
  async run(accessor) {
    accessor.get(IViewsService).openView(Markers.MARKERS_VIEW_ID, true);
  }
});
class MarkersViewAction extends ViewAction {
  getSelectedMarkers(markersView) {
    const selection = markersView.getFocusedSelectedElements() || markersView.getAllResourceMarkers();
    const markers = [];
    const addMarker = (marker) => {
      if (!markers.includes(marker)) {
        markers.push(marker);
      }
    };
    for (const selected of selection) {
      if (selected instanceof ResourceMarkers) {
        selected.markers.forEach(addMarker);
      } else if (selected instanceof Marker) {
        addMarker(selected);
      }
    }
    return markers;
  }
}
registerAction2(class extends MarkersViewAction {
  constructor() {
    const when = ContextKeyExpr.and(FocusedViewContext.isEqualTo(Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersTreeVisibilityContextKey, MarkersContextKeys.RelatedInformationFocusContextKey.toNegated());
    super({
      id: Markers.MARKER_COPY_ACTION_ID,
      title: localize2("copyMarker", "Copy"),
      menu: {
        id: MenuId.ProblemsPanelContext,
        when,
        group: "navigation"
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyC,
        when
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    const clipboardService = serviceAccessor.get(IClipboardService);
    const markers = this.getSelectedMarkers(markersView);
    if (markers.length) {
      await clipboardService.writeText(`[${markers}]`);
    }
  }
});
registerAction2(class extends MarkersViewAction {
  constructor() {
    super({
      id: Markers.MARKER_COPY_MESSAGE_ACTION_ID,
      title: localize2("copyMessage", "Copy Message"),
      menu: {
        id: MenuId.ProblemsPanelContext,
        when: MarkersContextKeys.MarkerFocusContextKey,
        group: "navigation"
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    const clipboardService = serviceAccessor.get(IClipboardService);
    const markers = this.getSelectedMarkers(markersView);
    if (markers.length) {
      await clipboardService.writeText(markers.map((m) => m.marker.message).join("\n"));
    }
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: Markers.RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID,
      title: localize2("copyMessage", "Copy Message"),
      menu: {
        id: MenuId.ProblemsPanelContext,
        when: MarkersContextKeys.RelatedInformationFocusContextKey,
        group: "navigation"
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    const clipboardService = serviceAccessor.get(IClipboardService);
    const element = markersView.getFocusElement();
    if (element instanceof RelatedInformation) {
      await clipboardService.writeText(element.raw.message);
    }
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: Markers.FOCUS_PROBLEMS_FROM_FILTER,
      title: localize("focusProblemsList", "Focus problems view"),
      keybinding: {
        when: MarkersContextKeys.MarkerViewFilterFocusContextKey,
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    markersView.focus();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: Markers.MARKERS_VIEW_FOCUS_FILTER,
      title: localize("focusProblemsFilter", "Focus problems filter"),
      keybinding: {
        when: FocusedViewContext.isEqualTo(Markers.MARKERS_VIEW_ID),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyF
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    markersView.focusFilter();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: Markers.MARKERS_VIEW_SHOW_MULTILINE_MESSAGE,
      title: localize2("show multiline", "Show message in multiple lines"),
      category: localize("problems", "Problems"),
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.has(getVisbileViewContextKey(Markers.MARKERS_VIEW_ID))
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    markersView.setMultiline(true);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: Markers.MARKERS_VIEW_SHOW_SINGLELINE_MESSAGE,
      title: localize2("show singleline", "Show message in single line"),
      category: localize("problems", "Problems"),
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.has(getVisbileViewContextKey(Markers.MARKERS_VIEW_ID))
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    markersView.setMultiline(false);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: Markers.MARKERS_VIEW_CLEAR_FILTER_TEXT,
      title: localize("clearFiltersText", "Clear filters text"),
      category: localize("problems", "Problems"),
      keybinding: {
        when: MarkersContextKeys.MarkerViewFilterFocusContextKey,
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.Escape
      },
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, markersView) {
    markersView.clearFilterText();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: `workbench.actions.treeView.${Markers.MARKERS_VIEW_ID}.collapseAll`,
      title: localize("collapseAll", "Collapse All"),
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", Markers.MARKERS_VIEW_ID), MarkersContextKeys.MarkersViewModeContextKey.isEqualTo(MarkersViewMode.Tree)),
        group: "navigation",
        order: 2
      },
      icon: Codicon.collapseAll,
      viewId: Markers.MARKERS_VIEW_ID
    });
  }
  async runInView(serviceAccessor, view) {
    return view.collapseAll();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: Markers.TOGGLE_MARKERS_VIEW_ACTION_ID,
      title: Messages.MARKERS_PANEL_TOGGLE_LABEL
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    if (viewsService.isViewVisible(Markers.MARKERS_VIEW_ID)) {
      viewsService.closeView(Markers.MARKERS_VIEW_ID);
    } else {
      viewsService.openView(Markers.MARKERS_VIEW_ID, true);
    }
  }
});
let MarkersStatusBarContributions = class extends Disposable {
  constructor(markerService, statusbarService, configurationService) {
    super();
    this.markerService = markerService;
    this.statusbarService = statusbarService;
    this.configurationService = configurationService;
    this.markersStatusItem = this._register(this.statusbarService.addEntry(
      this.getMarkersItem(),
      "status.problems",
      StatusbarAlignment.LEFT,
      50
      /* Medium Priority */
    ));
    const addStatusBarEntry = () => {
      this.markersStatusItemOff = this.statusbarService.addEntry(this.getMarkersItemTurnedOff(), "status.problemsVisibility", StatusbarAlignment.LEFT, 49);
    };
    let config = this.configurationService.getValue("problems.visibility");
    if (!config) {
      addStatusBarEntry();
    }
    this._register(this.markerService.onMarkerChanged(() => {
      this.markersStatusItem.update(this.getMarkersItem());
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("problems.visibility")) {
        this.markersStatusItem.update(this.getMarkersItem());
        config = this.configurationService.getValue("problems.visibility");
        if (!config && !this.markersStatusItemOff) {
          addStatusBarEntry();
        } else if (config && this.markersStatusItemOff) {
          this.markersStatusItemOff.dispose();
          this.markersStatusItemOff = void 0;
        }
      }
    }));
  }
  getMarkersItem() {
    const markersStatistics = this.markerService.getStatistics();
    const tooltip = this.getMarkersTooltip(markersStatistics);
    return {
      name: localize("status.problems", "Problems"),
      text: this.getMarkersText(markersStatistics),
      ariaLabel: tooltip,
      tooltip,
      command: "workbench.actions.view.toggleProblems"
    };
  }
  getMarkersItemTurnedOff() {
    this.statusbarService.updateEntryVisibility("status.problemsVisibility", true);
    const openSettingsCommand = "workbench.action.openSettings";
    const configureSettingsLabel = "@id:problems.visibility";
    const tooltip = localize("status.problemsVisibilityOff", "Problems are turned off. Click to open settings.");
    return {
      name: localize("status.problemsVisibility", "Problems Visibility"),
      text: "$(whole-word)",
      ariaLabel: tooltip,
      tooltip,
      kind: "warning",
      command: { title: openSettingsCommand, arguments: [configureSettingsLabel], id: openSettingsCommand }
    };
  }
  getMarkersTooltip(stats) {
    const errorTitle = (n) => localize("totalErrors", "Errors: {0}", n);
    const warningTitle = (n) => localize("totalWarnings", "Warnings: {0}", n);
    const infoTitle = (n) => localize("totalInfos", "Infos: {0}", n);
    const titles = [];
    if (stats.errors > 0) {
      titles.push(errorTitle(stats.errors));
    }
    if (stats.warnings > 0) {
      titles.push(warningTitle(stats.warnings));
    }
    if (stats.infos > 0) {
      titles.push(infoTitle(stats.infos));
    }
    if (titles.length === 0) {
      return localize("noProblems", "No Problems");
    }
    return titles.join(", ");
  }
  getMarkersText(stats) {
    const problemsText = [];
    problemsText.push("$(error) " + this.packNumber(stats.errors));
    problemsText.push("$(warning) " + this.packNumber(stats.warnings));
    if (stats.infos > 0) {
      problemsText.push("$(info) " + this.packNumber(stats.infos));
    }
    return problemsText.join(" ");
  }
  packNumber(n) {
    const manyProblems = localize("manyProblems", "10K+");
    return n > 9999 ? manyProblems : n > 999 ? n.toString().charAt(0) + "K" : n.toString();
  }
};
MarkersStatusBarContributions = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IConfigurationService)
], MarkersStatusBarContributions);
workbenchRegistry.registerWorkbenchContribution(MarkersStatusBarContributions, LifecyclePhase.Restored);
registerWorkbenchContribution2(MarkerChatContextContribution.ID, MarkerChatContextContribution, WorkbenchPhase.AfterRestored);
let ActivityUpdater = class extends Disposable {
  constructor(activityService, markerService) {
    super();
    this.activityService = activityService;
    this.markerService = markerService;
    this.activity = this._register(new MutableDisposable());
    this._register(this.markerService.onMarkerChanged(() => this.updateBadge()));
    this.updateBadge();
  }
  updateBadge() {
    const { errors, warnings, infos } = this.markerService.getStatistics();
    const total = errors + warnings + infos;
    if (total > 0) {
      const message = localize("totalProblems", "Total {0} Problems", total);
      this.activity.value = this.activityService.showViewActivity(Markers.MARKERS_VIEW_ID, { badge: new NumberBadge(total, () => message) });
    } else {
      this.activity.value = void 0;
    }
  }
};
ActivityUpdater = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IMarkerService)
], ActivityUpdater);
workbenchRegistry.registerWorkbenchContribution(ActivityUpdater, LifecyclePhase.Restored);
AccessibleViewRegistry.register(new ProblemsAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtlcnNcXGJyb3dzZXJcXG1hcmtlcnMuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21hcmtlcnNGaWxlRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1hcmtlciwgUmVsYXRlZEluZm9ybWF0aW9uLCBSZXNvdXJjZU1hcmtlcnMgfSBmcm9tICcuL21hcmtlcnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBNYXJrZXJzVmlldyB9IGZyb20gJy4vbWFya2Vyc1ZpZXcuanMnO1xuaW1wb3J0IHsgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IE1hcmtlcnNWaWV3TW9kZSwgTWFya2VycywgTWFya2Vyc0NvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IE1lc3NhZ2VzIGZyb20gJy4vbWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtlcnNWaWV3IH0gZnJvbSAnLi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50LCBJU3RhdHVzYmFyRW50cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIE1hcmtlclN0YXRpc3RpY3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXIsIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3c1JlZ2lzdHJ5LCBXaW5kb3dFbmFibGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFZpc2JpbGVWaWV3Q29udGV4dEtleSwgRm9jdXNlZFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFZpZXdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IHZpZXdGaWx0ZXJTdWJtZW51IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3RmlsdGVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgcHJvYmxlbXNDb25maWd1cmF0aW9uTm9kZUJhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZXJDaGF0Q29udGV4dENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vbWFya2Vyc0NoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQcm9ibGVtc0FjY2Vzc2liaWxpdHlIZWxwIH0gZnJvbSAnLi9tYXJrZXJzQWNjZXNzaWJpbGl0eUhlbHAuanMnO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IE1hcmtlcnMuTUFSS0VSX09QRU5fQUNUSU9OX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJGb2N1c0NvbnRleHRLZXkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3ddXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogYW55KSA9PiB7XG5cdFx0Y29uc3QgbWFya2Vyc1ZpZXcgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZDxNYXJrZXJzVmlldz4oTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpITtcblx0XHRtYXJrZXJzVmlldy5vcGVuRmlsZUF0RWxlbWVudChtYXJrZXJzVmlldy5nZXRGb2N1c0VsZW1lbnQoKSwgZmFsc2UsIGZhbHNlLCB0cnVlKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogTWFya2Vycy5NQVJLRVJfT1BFTl9TSURFX0FDVElPTl9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChNYXJrZXJzQ29udGV4dEtleXMuTWFya2VyRm9jdXNDb250ZXh0S2V5KSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRW50ZXJcblx0fSxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiBhbnkpID0+IHtcblx0XHRjb25zdCBtYXJrZXJzVmlldyA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3V2l0aElkPE1hcmtlcnNWaWV3PihNYXJrZXJzLk1BUktFUlNfVklFV19JRCkhO1xuXHRcdG1hcmtlcnNWaWV3Lm9wZW5GaWxlQXRFbGVtZW50KG1hcmtlcnNWaWV3LmdldEZvY3VzRWxlbWVudCgpLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IE1hcmtlcnMuTUFSS0VSX1NIT1dfUEFORUxfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiB1bmRlZmluZWQsXG5cdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzOiBhbnkpID0+IHtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkub3BlblZpZXcoTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBNYXJrZXJzLk1BUktFUl9TSE9XX1FVSUNLX0ZJWCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QZXJpb2QsXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnczogYW55KSA9PiB7XG5cdFx0Y29uc3QgbWFya2Vyc1ZpZXcgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZDxNYXJrZXJzVmlldz4oTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpITtcblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IG1hcmtlcnNWaWV3LmdldEZvY3VzRWxlbWVudCgpO1xuXHRcdGlmIChmb2N1c2VkRWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0bWFya2Vyc1ZpZXcuc2hvd1F1aWNrRml4ZXMoZm9jdXNlZEVsZW1lbnQpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vIGNvbmZpZ3VyYXRpb25cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4ucHJvYmxlbXNDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdCdwcm9ibGVtcy5hdXRvUmV2ZWFsJzoge1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogTWVzc2FnZXMuUFJPQkxFTVNfUEFORUxfQ09ORklHVVJBVElPTl9BVVRPX1JFVkVBTCxcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQncHJvYmxlbXMuZGVmYXVsdFZpZXdNb2RlJzoge1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogTWVzc2FnZXMuUFJPQkxFTVNfUEFORUxfQ09ORklHVVJBVElPTl9WSUVXX01PREUsXG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2RlZmF1bHQnOiAndHJlZScsXG5cdFx0XHQnZW51bSc6IFsndGFibGUnLCAndHJlZSddLFxuXHRcdH0sXG5cdFx0J3Byb2JsZW1zLnNob3dDdXJyZW50SW5TdGF0dXMnOiB7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiBNZXNzYWdlcy5QUk9CTEVNU19QQU5FTF9DT05GSUdVUkFUSU9OX1NIT1dfQ1VSUkVOVF9TVEFUVVMsXG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2Vcblx0XHR9LFxuXHRcdCdwcm9ibGVtcy5zb3J0T3JkZXInOiB7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiBNZXNzYWdlcy5QUk9CTEVNU19QQU5FTF9DT05GSUdVUkFUSU9OX0NPTVBBUkVfT1JERVIsXG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2RlZmF1bHQnOiAnc2V2ZXJpdHknLFxuXHRcdFx0J2VudW0nOiBbJ3NldmVyaXR5JywgJ3Bvc2l0aW9uJ10sXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0TWVzc2FnZXMuUFJPQkxFTVNfUEFORUxfQ09ORklHVVJBVElPTl9DT01QQVJFX09SREVSX1NFVkVSSVRZLFxuXHRcdFx0XHRNZXNzYWdlcy5QUk9CTEVNU19QQU5FTF9DT05GSUdVUkFUSU9OX0NPTVBBUkVfT1JERVJfUE9TSVRJT04sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdH1cbn0pO1xuXG5jb25zdCBtYXJrZXJzVmlld0ljb24gPSByZWdpc3Rlckljb24oJ21hcmtlcnMtdmlldy1pY29uJywgQ29kaWNvbi53YXJuaW5nLCBsb2NhbGl6ZSgnbWFya2Vyc1ZpZXdJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgbWFya2VycyB2aWV3LicpKTtcblxuLy8gbWFya2VycyB2aWV3IGNvbnRhaW5lclxuY29uc3QgVklFV19DT05UQUlORVI6IFZpZXdDb250YWluZXIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0aWQ6IE1hcmtlcnMuTUFSS0VSU19DT05UQUlORVJfSUQsXG5cdHRpdGxlOiBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX1RJVExFX1BST0JMRU1TLFxuXHRpY29uOiBtYXJrZXJzVmlld0ljb24sXG5cdGhpZGVJZkVtcHR5OiB0cnVlLFxuXHRvcmRlcjogMCxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihWaWV3UGFuZUNvbnRhaW5lciwgW01hcmtlcnMuTUFSS0VSU19DT05UQUlORVJfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dKSxcblx0c3RvcmFnZUlkOiBNYXJrZXJzLk1BUktFUlNfVklFV19TVE9SQUdFX0lELFxuXHR3aW5kb3dFbmFibGVtZW50OiBXaW5kb3dFbmFibGVtZW50LkJvdGhcbn0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgeyBkb05vdFJlZ2lzdGVyT3BlbkNvbW1hbmQ6IHRydWUgfSk7XG5cblJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdzKFt7XG5cdGlkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRCxcblx0Y29udGFpbmVySWNvbjogbWFya2Vyc1ZpZXdJY29uLFxuXHRuYW1lOiBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX1RJVExFX1BST0JMRU1TLFxuXHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihNYXJrZXJzVmlldyksXG5cdG9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcjoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbnMudmlldy5wcm9ibGVtcycsXG5cdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU1hcmtlcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByb2JsZW1zXCIpLFxuXHRcdGtleWJpbmRpbmdzOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlNIH0sXG5cdFx0b3JkZXI6IDAsXG5cdH0sXG5cdHdpbmRvd0VuYWJsZW1lbnQ6IFdpbmRvd0VuYWJsZW1lbnQuQm90aFxufV0sIFZJRVdfQ09OVEFJTkVSKTtcblxuLy8gd29ya2JlbmNoXG5jb25zdCB3b3JrYmVuY2hSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcblxuLy8gYWN0aW9uc1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxJTWFya2Vyc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy50YWJsZS4ke01hcmtlcnMuTUFSS0VSU19WSUVXX0lEfS52aWV3QXNUcmVlYCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndmlld0FzVHJlZScsIFwiVmlldyBhcyBUcmVlXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndmlld0FzVHJlZURlc2NyaXB0aW9uJywgXCJTaG93IHRoZSBwcm9ibGVtcyB2aWV3IGFzIGEgdHJlZS5cIilcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpLCBNYXJrZXJzQ29udGV4dEtleXMuTWFya2Vyc1ZpZXdNb2RlQ29udGV4dEtleS5pc0VxdWFsVG8oTWFya2Vyc1ZpZXdNb2RlLlRhYmxlKSksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0VHJlZSxcblx0XHRcdHZpZXdJZDogTWFya2Vycy5NQVJLRVJTX1ZJRVdfSURcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IElNYXJrZXJzVmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcuc2V0Vmlld01vZGUoTWFya2Vyc1ZpZXdNb2RlLlRyZWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxJTWFya2Vyc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy50YWJsZS4ke01hcmtlcnMuTUFSS0VSU19WSUVXX0lEfS52aWV3QXNUYWJsZWAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3ZpZXdBc1RhYmxlJywgXCJWaWV3IGFzIFRhYmxlXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndmlld0FzVGFibGVEZXNjcmlwdGlvbicsIFwiU2hvdyB0aGUgcHJvYmxlbXMgdmlldyBhcyBhIHRhYmxlLlwiKVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBNYXJrZXJzLk1BUktFUlNfVklFV19JRCksIE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJzVmlld01vZGVDb250ZXh0S2V5LmlzRXF1YWxUbyhNYXJrZXJzVmlld01vZGUuVHJlZSkpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24ubGlzdEZsYXQsXG5cdFx0XHR2aWV3SWQ6IE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoc2VydmljZUFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBJTWFya2Vyc1ZpZXcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR2aWV3LnNldFZpZXdNb2RlKE1hcmtlcnNWaWV3TW9kZS5UYWJsZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLiR7TWFya2Vycy5NQVJLRVJTX1ZJRVdfSUR9LnRvZ2dsZUVycm9yc2AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nob3cgZXJyb3JzJywgXCJTaG93IEVycm9yc1wiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3RvZ2dsZUVycm9yc0Rlc2NyaXB0aW9uJywgXCJTaG93IG9yIGhpZGUgZXJyb3JzIGluIHRoZSBwcm9ibGVtcyB2aWV3LlwiKVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZSgncHJvYmxlbXMnLCBcIlByb2JsZW1zXCIpLFxuXHRcdFx0dG9nZ2xlZDogTWFya2Vyc0NvbnRleHRLZXlzLlNob3dFcnJvcnNGaWx0ZXJDb250ZXh0S2V5LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9maWx0ZXInLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBNYXJrZXJzLk1BUktFUlNfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5maWx0ZXJzLnNob3dFcnJvcnMgPSAhdmlldy5maWx0ZXJzLnNob3dFcnJvcnM7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLiR7TWFya2Vycy5NQVJLRVJTX1ZJRVdfSUR9LnRvZ2dsZVdhcm5pbmdzYCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvdyB3YXJuaW5ncycsIFwiU2hvdyBXYXJuaW5nc1wiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3RvZ2dsZVdhcm5pbmdzRGVzY3JpcHRpb24nLCBcIlNob3cgb3IgaGlkZSB3YXJuaW5ncyBpbiB0aGUgcHJvYmxlbXMgdmlldy5cIilcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogbG9jYWxpemUoJ3Byb2JsZW1zJywgXCJQcm9ibGVtc1wiKSxcblx0XHRcdHRvZ2dsZWQ6IE1hcmtlcnNDb250ZXh0S2V5cy5TaG93V2FybmluZ3NGaWx0ZXJDb250ZXh0S2V5LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9maWx0ZXInLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBNYXJrZXJzLk1BUktFUlNfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5maWx0ZXJzLnNob3dXYXJuaW5ncyA9ICF2aWV3LmZpbHRlcnMuc2hvd1dhcm5pbmdzO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxJTWFya2Vyc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy4ke01hcmtlcnMuTUFSS0VSU19WSUVXX0lEfS50b2dnbGVJbmZvc2AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nob3cgaW5mb3MnLCBcIlNob3cgSW5mb3NcIiksXG5cdFx0XHRjYXRlZ29yeTogbG9jYWxpemUoJ3Byb2JsZW1zJywgXCJQcm9ibGVtc1wiKSxcblx0XHRcdHRvZ2dsZWQ6IE1hcmtlcnNDb250ZXh0S2V5cy5TaG93SW5mb0ZpbHRlckNvbnRleHRLZXksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCd0b2dnbGVJbmZvc0Rlc2NyaXB0aW9uJywgXCJTaG93IG9yIGhpZGUgaW5mb3MgaW4gdGhlIHByb2JsZW1zIHZpZXcuXCIpXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9maWx0ZXInLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBNYXJrZXJzLk1BUktFUlNfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5maWx0ZXJzLnNob3dJbmZvcyA9ICF2aWV3LmZpbHRlcnMuc2hvd0luZm9zO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxJTWFya2Vyc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy4ke01hcmtlcnMuTUFSS0VSU19WSUVXX0lEfS50b2dnbGVBY3RpdmVGaWxlYCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvdyBhY3RpdmUgZmlsZScsIFwiU2hvdyBBY3RpdmUgRmlsZSBPbmx5XCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndG9nZ2xlQWN0aXZlRmlsZURlc2NyaXB0aW9uJywgXCJTaG93IG9yIGhpZGUgcHJvYmxlbXMgKGVycm9ycywgd2FybmluZ3MsIGluZm8pIG9ubHkgZnJvbSB0aGUgYWN0aXZlIGZpbGUgaW4gdGhlIHByb2JsZW1zIHZpZXcuXCIpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplKCdwcm9ibGVtcycsIFwiUHJvYmxlbXNcIiksXG5cdFx0XHR0b2dnbGVkOiBNYXJrZXJzQ29udGV4dEtleXMuU2hvd0FjdGl2ZUZpbGVGaWx0ZXJDb250ZXh0S2V5LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9maWx0ZXInLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBNYXJrZXJzLk1BUktFUlNfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5maWx0ZXJzLmFjdGl2ZUZpbGUgPSAhdmlldy5maWx0ZXJzLmFjdGl2ZUZpbGU7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLiR7TWFya2Vycy5NQVJLRVJTX1ZJRVdfSUR9LnRvZ2dsZUV4Y2x1ZGVkRmlsZXNgLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93IGV4Y2x1ZGVkIGZpbGVzJywgXCJTaG93IEV4Y2x1ZGVkIEZpbGVzXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndG9nZ2xlRXhjbHVkZWRGaWxlc0Rlc2NyaXB0aW9uJywgXCJTaG93IG9yIGhpZGUgZXhjbHVkZWQgZmlsZXMgaW4gdGhlIHByb2JsZW1zIHZpZXcuXCIpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplKCdwcm9ibGVtcycsIFwiUHJvYmxlbXNcIiksXG5cdFx0XHR0b2dnbGVkOiBNYXJrZXJzQ29udGV4dEtleXMuU2hvd0V4Y2x1ZGVkRmlsZXNGaWx0ZXJDb250ZXh0S2V5Lm5lZ2F0ZSgpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9maWx0ZXInLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBNYXJrZXJzLk1BUktFUlNfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5maWx0ZXJzLmV4Y2x1ZGVkRmlsZXMgPSAhdmlldy5maWx0ZXJzLmV4Y2x1ZGVkRmlsZXM7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnByb2JsZW1zLmZvY3VzJyxcblx0XHRcdHRpdGxlOiBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX1NIT1dfTEFCRUwsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLm9wZW5WaWV3KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lELCB0cnVlKTtcblx0fVxufSk7XG5cbmFic3RyYWN0IGNsYXNzIE1hcmtlcnNWaWV3QWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxJTWFya2Vyc1ZpZXc+IHtcblxuXHRwcm90ZWN0ZWQgZ2V0U2VsZWN0ZWRNYXJrZXJzKG1hcmtlcnNWaWV3OiBJTWFya2Vyc1ZpZXcpOiBNYXJrZXJbXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbWFya2Vyc1ZpZXcuZ2V0Rm9jdXNlZFNlbGVjdGVkRWxlbWVudHMoKSB8fCBtYXJrZXJzVmlldy5nZXRBbGxSZXNvdXJjZU1hcmtlcnMoKTtcblx0XHRjb25zdCBtYXJrZXJzOiBNYXJrZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFkZE1hcmtlciA9IChtYXJrZXI6IE1hcmtlcikgPT4ge1xuXHRcdFx0aWYgKCFtYXJrZXJzLmluY2x1ZGVzKG1hcmtlcikpIHtcblx0XHRcdFx0bWFya2Vycy5wdXNoKG1hcmtlcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IHNlbGVjdGVkIG9mIHNlbGVjdGlvbikge1xuXHRcdFx0aWYgKHNlbGVjdGVkIGluc3RhbmNlb2YgUmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRcdHNlbGVjdGVkLm1hcmtlcnMuZm9yRWFjaChhZGRNYXJrZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZCBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0XHRhZGRNYXJrZXIoc2VsZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWFya2Vycztcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBNYXJrZXJzVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoRm9jdXNlZFZpZXdDb250ZXh0LmlzRXF1YWxUbyhNYXJrZXJzLk1BUktFUlNfVklFV19JRCksIE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJzVHJlZVZpc2liaWxpdHlDb250ZXh0S2V5LCBNYXJrZXJzQ29udGV4dEtleXMuUmVsYXRlZEluZm9ybWF0aW9uRm9jdXNDb250ZXh0S2V5LnRvTmVnYXRlZCgpKTtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5NQVJLRVJfQ09QWV9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb3B5TWFya2VyJywgJ0NvcHknKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Qcm9ibGVtc1BhbmVsQ29udGV4dCxcblx0XHRcdFx0d2hlbixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLFxuXHRcdFx0XHR3aGVuXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bkluVmlldyhzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1hcmtlcnNWaWV3OiBJTWFya2Vyc1ZpZXcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMuZ2V0U2VsZWN0ZWRNYXJrZXJzKG1hcmtlcnNWaWV3KTtcblx0XHRpZiAobWFya2Vycy5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGBbJHttYXJrZXJzfV1gKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBNYXJrZXJzVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNYXJrZXJzLk1BUktFUl9DT1BZX01FU1NBR0VfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY29weU1lc3NhZ2UnLCAnQ29weSBNZXNzYWdlJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuUHJvYmxlbXNQYW5lbENvbnRleHQsXG5cdFx0XHRcdHdoZW46IE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJGb2N1c0NvbnRleHRLZXksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH0sXG5cdFx0XHR2aWV3SWQ6IE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbWFya2Vyc1ZpZXc6IElNYXJrZXJzVmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1hcmtlcnMgPSB0aGlzLmdldFNlbGVjdGVkTWFya2VycyhtYXJrZXJzVmlldyk7XG5cdFx0aWYgKG1hcmtlcnMubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChtYXJrZXJzLm1hcChtID0+IG0ubWFya2VyLm1lc3NhZ2UpLmpvaW4oJ1xcbicpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5SRUxBVEVEX0lORk9STUFUSU9OX0NPUFlfTUVTU0FHRV9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb3B5TWVzc2FnZScsICdDb3B5IE1lc3NhZ2UnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Qcm9ibGVtc1BhbmVsQ29udGV4dCxcblx0XHRcdFx0d2hlbjogTWFya2Vyc0NvbnRleHRLZXlzLlJlbGF0ZWRJbmZvcm1hdGlvbkZvY3VzQ29udGV4dEtleSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fSxcblx0XHRcdHZpZXdJZDogTWFya2Vycy5NQVJLRVJTX1ZJRVdfSURcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW5JblZpZXcoc2VydmljZUFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtYXJrZXJzVmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBtYXJrZXJzVmlldy5nZXRGb2N1c0VsZW1lbnQoKTtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlbGF0ZWRJbmZvcm1hdGlvbikge1xuXHRcdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoZWxlbWVudC5yYXcubWVzc2FnZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxJTWFya2Vyc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1hcmtlcnMuRk9DVVNfUFJPQkxFTVNfRlJPTV9GSUxURVIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZvY3VzUHJvYmxlbXNMaXN0JywgXCJGb2N1cyBwcm9ibGVtcyB2aWV3XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBNYXJrZXJzQ29udGV4dEtleXMuTWFya2VyVmlld0ZpbHRlckZvY3VzQ29udGV4dEtleSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3dcblx0XHRcdH0sXG5cdFx0XHR2aWV3SWQ6IE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbWFya2Vyc1ZpZXc6IElNYXJrZXJzVmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdG1hcmtlcnNWaWV3LmZvY3VzKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5NQVJLRVJTX1ZJRVdfRk9DVVNfRklMVEVSLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmb2N1c1Byb2JsZW1zRmlsdGVyJywgXCJGb2N1cyBwcm9ibGVtcyBmaWx0ZXJcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEZvY3VzZWRWaWV3Q29udGV4dC5pc0VxdWFsVG8oTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUZcblx0XHRcdH0sXG5cdFx0XHR2aWV3SWQ6IE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbWFya2Vyc1ZpZXc6IElNYXJrZXJzVmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdG1hcmtlcnNWaWV3LmZvY3VzRmlsdGVyKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5NQVJLRVJTX1ZJRVdfU0hPV19NVUxUSUxJTkVfTUVTU0FHRSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3cgbXVsdGlsaW5lJywgXCJTaG93IG1lc3NhZ2UgaW4gbXVsdGlwbGUgbGluZXNcIiksXG5cdFx0XHRjYXRlZ29yeTogbG9jYWxpemUoJ3Byb2JsZW1zJywgXCJQcm9ibGVtc1wiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKGdldFZpc2JpbGVWaWV3Q29udGV4dEtleShNYXJrZXJzLk1BUktFUlNfVklFV19JRCkpXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bkluVmlldyhzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1hcmtlcnNWaWV3OiBJTWFya2Vyc1ZpZXcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRtYXJrZXJzVmlldy5zZXRNdWx0aWxpbmUodHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5NQVJLRVJTX1ZJRVdfU0hPV19TSU5HTEVMSU5FX01FU1NBR0UsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93IHNpbmdsZWxpbmUnLCBcIlNob3cgbWVzc2FnZSBpbiBzaW5nbGUgbGluZVwiKSxcblx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZSgncHJvYmxlbXMnLCBcIlByb2JsZW1zXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoZ2V0VmlzYmlsZVZpZXdDb250ZXh0S2V5KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEKSlcblx0XHRcdH0sXG5cdFx0XHR2aWV3SWQ6IE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbWFya2Vyc1ZpZXc6IElNYXJrZXJzVmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdG1hcmtlcnNWaWV3LnNldE11bHRpbGluZShmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPElNYXJrZXJzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5NQVJLRVJTX1ZJRVdfQ0xFQVJfRklMVEVSX1RFWFQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NsZWFyRmlsdGVyc1RleHQnLCBcIkNsZWFyIGZpbHRlcnMgdGV4dFwiKSxcblx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZSgncHJvYmxlbXMnLCBcIlByb2JsZW1zXCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBNYXJrZXJzQ29udGV4dEtleXMuTWFya2VyVmlld0ZpbHRlckZvY3VzQ29udGV4dEtleSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlXG5cdFx0XHR9LFxuXHRcdFx0dmlld0lkOiBNYXJrZXJzLk1BUktFUlNfVklFV19JRFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bkluVmlldyhzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1hcmtlcnNWaWV3OiBJTWFya2Vyc1ZpZXcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRtYXJrZXJzVmlldy5jbGVhckZpbHRlclRleHQoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248SU1hcmtlcnNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMudHJlZVZpZXcuJHtNYXJrZXJzLk1BUktFUlNfVklFV19JRH0uY29sbGFwc2VBbGxgLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb2xsYXBzZUFsbCcsIFwiQ29sbGFwc2UgQWxsXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEKSwgTWFya2Vyc0NvbnRleHRLZXlzLk1hcmtlcnNWaWV3TW9kZUNvbnRleHRLZXkuaXNFcXVhbFRvKE1hcmtlcnNWaWV3TW9kZS5UcmVlKSksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHR2aWV3SWQ6IE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogSU1hcmtlcnNWaWV3KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHZpZXcuY29sbGFwc2VBbGwoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWFya2Vycy5UT0dHTEVfTUFSS0VSU19WSUVXX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX1RPR0dMRV9MQUJFTCxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0aWYgKHZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEKSkge1xuXHRcdFx0dmlld3NTZXJ2aWNlLmNsb3NlVmlldyhNYXJrZXJzLk1BUktFUlNfVklFV19JRCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZpZXdzU2VydmljZS5vcGVuVmlldyhNYXJrZXJzLk1BUktFUlNfVklFV19JRCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuY2xhc3MgTWFya2Vyc1N0YXR1c0JhckNvbnRyaWJ1dGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSBtYXJrZXJzU3RhdHVzSXRlbTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3I7XG5cdHByaXZhdGUgbWFya2Vyc1N0YXR1c0l0ZW1PZmY6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5tYXJrZXJzU3RhdHVzSXRlbSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh0aGlzLmdldE1hcmtlcnNJdGVtKCksICdzdGF0dXMucHJvYmxlbXMnLCBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCwgNTAgLyogTWVkaXVtIFByaW9yaXR5ICovKSk7XG5cblx0XHRjb25zdCBhZGRTdGF0dXNCYXJFbnRyeSA9ICgpID0+IHtcblx0XHRcdHRoaXMubWFya2Vyc1N0YXR1c0l0ZW1PZmYgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkodGhpcy5nZXRNYXJrZXJzSXRlbVR1cm5lZE9mZigpLCAnc3RhdHVzLnByb2JsZW1zVmlzaWJpbGl0eScsIFN0YXR1c2JhckFsaWdubWVudC5MRUZULCA0OSk7XG5cdFx0fTtcblxuXHRcdC8vIEFkZCB0aGUgc3RhdHVzIGJhciBlbnRyeSBpZiB0aGUgcHJvYmxlbXMgaXMgbm90IHZpc2libGVcblx0XHRsZXQgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncHJvYmxlbXMudmlzaWJpbGl0eScpO1xuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRhZGRTdGF0dXNCYXJFbnRyeSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5tYXJrZXJzU3RhdHVzSXRlbS51cGRhdGUodGhpcy5nZXRNYXJrZXJzSXRlbSgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdwcm9ibGVtcy52aXNpYmlsaXR5JykpIHtcblx0XHRcdFx0dGhpcy5tYXJrZXJzU3RhdHVzSXRlbS51cGRhdGUodGhpcy5nZXRNYXJrZXJzSXRlbSgpKTtcblxuXHRcdFx0XHQvLyBVcGRhdGUgYmFzZWQgb24gd2hhdCBzZXR0aW5nIHdhcyBjaGFuZ2VkIHRvLlxuXHRcdFx0XHRjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdwcm9ibGVtcy52aXNpYmlsaXR5Jyk7XG5cdFx0XHRcdGlmICghY29uZmlnICYmICF0aGlzLm1hcmtlcnNTdGF0dXNJdGVtT2ZmKSB7XG5cdFx0XHRcdFx0YWRkU3RhdHVzQmFyRW50cnkoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChjb25maWcgJiYgdGhpcy5tYXJrZXJzU3RhdHVzSXRlbU9mZikge1xuXHRcdFx0XHRcdHRoaXMubWFya2Vyc1N0YXR1c0l0ZW1PZmYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMubWFya2Vyc1N0YXR1c0l0ZW1PZmYgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1hcmtlcnNJdGVtKCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0Y29uc3QgbWFya2Vyc1N0YXRpc3RpY3MgPSB0aGlzLm1hcmtlclNlcnZpY2UuZ2V0U3RhdGlzdGljcygpO1xuXHRcdGNvbnN0IHRvb2x0aXAgPSB0aGlzLmdldE1hcmtlcnNUb29sdGlwKG1hcmtlcnNTdGF0aXN0aWNzKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5wcm9ibGVtcycsIFwiUHJvYmxlbXNcIiksXG5cdFx0XHR0ZXh0OiB0aGlzLmdldE1hcmtlcnNUZXh0KG1hcmtlcnNTdGF0aXN0aWNzKSxcblx0XHRcdGFyaWFMYWJlbDogdG9vbHRpcCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRjb21tYW5kOiAnd29ya2JlbmNoLmFjdGlvbnMudmlldy50b2dnbGVQcm9ibGVtcydcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXJrZXJzSXRlbVR1cm5lZE9mZigpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdC8vIFVwZGF0ZSB0byB0cnVlLCBjb25maWcgY2hlY2tlZCBiZWZvcmUgYGdldE1hcmtlcnNJdGVtVHVybmVkT2ZmYCBpcyBjYWxsZWQuXG5cdFx0dGhpcy5zdGF0dXNiYXJTZXJ2aWNlLnVwZGF0ZUVudHJ5VmlzaWJpbGl0eSgnc3RhdHVzLnByb2JsZW1zVmlzaWJpbGl0eScsIHRydWUpO1xuXHRcdGNvbnN0IG9wZW5TZXR0aW5nc0NvbW1hbmQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZVNldHRpbmdzTGFiZWwgPSAnQGlkOnByb2JsZW1zLnZpc2liaWxpdHknO1xuXHRcdGNvbnN0IHRvb2x0aXAgPSBsb2NhbGl6ZSgnc3RhdHVzLnByb2JsZW1zVmlzaWJpbGl0eU9mZicsIFwiUHJvYmxlbXMgYXJlIHR1cm5lZCBvZmYuIENsaWNrIHRvIG9wZW4gc2V0dGluZ3MuXCIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLnByb2JsZW1zVmlzaWJpbGl0eScsIFwiUHJvYmxlbXMgVmlzaWJpbGl0eVwiKSxcblx0XHRcdHRleHQ6ICckKHdob2xlLXdvcmQpJyxcblx0XHRcdGFyaWFMYWJlbDogdG9vbHRpcCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRraW5kOiAnd2FybmluZycsXG5cdFx0XHRjb21tYW5kOiB7IHRpdGxlOiBvcGVuU2V0dGluZ3NDb21tYW5kLCBhcmd1bWVudHM6IFtjb25maWd1cmVTZXR0aW5nc0xhYmVsXSwgaWQ6IG9wZW5TZXR0aW5nc0NvbW1hbmQgfVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldE1hcmtlcnNUb29sdGlwKHN0YXRzOiBNYXJrZXJTdGF0aXN0aWNzKTogc3RyaW5nIHtcblx0XHRjb25zdCBlcnJvclRpdGxlID0gKG46IG51bWJlcikgPT4gbG9jYWxpemUoJ3RvdGFsRXJyb3JzJywgXCJFcnJvcnM6IHswfVwiLCBuKTtcblx0XHRjb25zdCB3YXJuaW5nVGl0bGUgPSAobjogbnVtYmVyKSA9PiBsb2NhbGl6ZSgndG90YWxXYXJuaW5ncycsIFwiV2FybmluZ3M6IHswfVwiLCBuKTtcblx0XHRjb25zdCBpbmZvVGl0bGUgPSAobjogbnVtYmVyKSA9PiBsb2NhbGl6ZSgndG90YWxJbmZvcycsIFwiSW5mb3M6IHswfVwiLCBuKTtcblxuXHRcdGNvbnN0IHRpdGxlczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGlmIChzdGF0cy5lcnJvcnMgPiAwKSB7XG5cdFx0XHR0aXRsZXMucHVzaChlcnJvclRpdGxlKHN0YXRzLmVycm9ycykpO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0cy53YXJuaW5ncyA+IDApIHtcblx0XHRcdHRpdGxlcy5wdXNoKHdhcm5pbmdUaXRsZShzdGF0cy53YXJuaW5ncykpO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0cy5pbmZvcyA+IDApIHtcblx0XHRcdHRpdGxlcy5wdXNoKGluZm9UaXRsZShzdGF0cy5pbmZvcykpO1xuXHRcdH1cblxuXHRcdGlmICh0aXRsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ25vUHJvYmxlbXMnLCBcIk5vIFByb2JsZW1zXCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aXRsZXMuam9pbignLCAnKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFya2Vyc1RleHQoc3RhdHM6IE1hcmtlclN0YXRpc3RpY3MpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHByb2JsZW1zVGV4dDogc3RyaW5nW10gPSBbXTtcblxuXHRcdC8vIEVycm9yc1xuXHRcdHByb2JsZW1zVGV4dC5wdXNoKCckKGVycm9yKSAnICsgdGhpcy5wYWNrTnVtYmVyKHN0YXRzLmVycm9ycykpO1xuXG5cdFx0Ly8gV2FybmluZ3Ncblx0XHRwcm9ibGVtc1RleHQucHVzaCgnJCh3YXJuaW5nKSAnICsgdGhpcy5wYWNrTnVtYmVyKHN0YXRzLndhcm5pbmdzKSk7XG5cblx0XHQvLyBJbmZvIChvbmx5IGlmIGFueSlcblx0XHRpZiAoc3RhdHMuaW5mb3MgPiAwKSB7XG5cdFx0XHRwcm9ibGVtc1RleHQucHVzaCgnJChpbmZvKSAnICsgdGhpcy5wYWNrTnVtYmVyKHN0YXRzLmluZm9zKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb2JsZW1zVGV4dC5qb2luKCcgJyk7XG5cdH1cblxuXHRwcml2YXRlIHBhY2tOdW1iZXIobjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBtYW55UHJvYmxlbXMgPSBsb2NhbGl6ZSgnbWFueVByb2JsZW1zJywgXCIxMEsrXCIpO1xuXHRcdHJldHVybiBuID4gOTk5OSA/IG1hbnlQcm9ibGVtcyA6IG4gPiA5OTkgPyBuLnRvU3RyaW5nKCkuY2hhckF0KDApICsgJ0snIDogbi50b1N0cmluZygpO1xuXHR9XG59XG5cbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE1hcmtlcnNTdGF0dXNCYXJDb250cmlidXRpb25zLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihNYXJrZXJDaGF0Q29udGV4dENvbnRyaWJ1dGlvbi5JRCwgTWFya2VyQ2hhdENvbnRleHRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG5jbGFzcyBBY3Rpdml0eVVwZGF0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKCgpID0+IHRoaXMudXBkYXRlQmFkZ2UoKSkpO1xuXHRcdHRoaXMudXBkYXRlQmFkZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQmFkZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBlcnJvcnMsIHdhcm5pbmdzLCBpbmZvcyB9ID0gdGhpcy5tYXJrZXJTZXJ2aWNlLmdldFN0YXRpc3RpY3MoKTtcblx0XHRjb25zdCB0b3RhbCA9IGVycm9ycyArIHdhcm5pbmdzICsgaW5mb3M7XG5cdFx0aWYgKHRvdGFsID4gMCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCd0b3RhbFByb2JsZW1zJywgJ1RvdGFsIHswfSBQcm9ibGVtcycsIHRvdGFsKTtcblx0XHRcdHRoaXMuYWN0aXZpdHkudmFsdWUgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93Vmlld0FjdGl2aXR5KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lELCB7IGJhZGdlOiBuZXcgTnVtYmVyQmFkZ2UodG90YWwsICgpID0+IG1lc3NhZ2UpIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGl2aXR5LnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihBY3Rpdml0eVVwZGF0ZXIsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuLy8gUmVnaXN0ZXIgQWNjZXNzaWJsZSBWaWV3IEhlbHBcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IFByb2JsZW1zQWNjZXNzaWJpbGl0eUhlbHAoKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUEwQztBQUNuRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFFBQVEsb0JBQW9CLHVCQUF1QjtBQUM1RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFFBQVEsaUJBQWlCLGVBQWU7QUFDakQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsU0FBUywwQkFBMEI7QUFDN0QsT0FBTyxjQUFjO0FBQ3JCLFNBQTBDLGNBQWMscUJBQTZDLGdDQUFnQyxzQkFBc0I7QUFFM0osU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUF5Qix5QkFBeUI7QUFDM0QsU0FBa0MsbUJBQW1CLDBCQUEyQztBQUNo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
