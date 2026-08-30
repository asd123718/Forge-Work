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
import "./media/scm.css";
import { $, append, h, reset } from "../../../../base/browser/dom.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { createMatches } from "../../../../base/common/filters.js";
import { combinedDisposable, Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, waitForState, constObservable, latestChangedValue, observableFromEvent, runOnChange, observableSignal } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { asCssVariable, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane, ViewPaneShowActions } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { renderSCMHistoryItemGraph, toISCMHistoryItemViewModelArray, SWIMLANE_WIDTH, renderSCMHistoryGraphPlaceholder, historyItemHoverLabelForeground, historyItemHoverDefaultLabelBackground, getHistoryItemIndex, toHistoryItemHoverContent } from "./scmHistory.js";
import { getHistoryItemEditorTitle, getProviderKey, isSCMHistoryItemChangeNode, isSCMHistoryItemChangeViewModelTreeElement, isSCMHistoryItemLoadMoreTreeElement, isSCMHistoryItemViewModelTreeElement, isSCMRepository } from "./util.js";
import { SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from "../common/history.js";
import { HISTORY_VIEW_PANE_ID, ISCMService, ISCMViewService, ViewMode } from "../common/scm.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { Action2, IMenuService, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Sequencer, Throttler } from "../../../../base/common/async.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { delta, groupBy } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { ContextKeys } from "./scmViewPane.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { clamp } from "../../../../base/common/numbers.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { compare } from "../../../../base/common/strings.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { groupBy as groupBy2 } from "../../../../base/common/collections.js";
import { getActionBarActions, getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { basename } from "../../../../base/common/path.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ScmHistoryItemResolver } from "../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { URI } from "../../../../base/common/uri.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { CodeDataTransfers } from "../../../../platform/dnd/browser/dnd.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
const PICK_REPOSITORY_ACTION_ID = "workbench.scm.action.graph.pickRepository";
const PICK_HISTORY_ITEM_REFS_ACTION_ID = "workbench.scm.action.graph.pickHistoryItemRefs";
class SCMRepositoryActionViewItem extends ActionViewItem {
  constructor(_repository, action, options) {
    super(null, action, { ...options, icon: false, label: true });
    this._repository = _repository;
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.classList.add("scm-graph-repository-picker");
      const icon = $(".icon");
      const iconClassNameArray = ThemeIcon.isThemeIcon(this._repository.provider.iconPath) ? ThemeIcon.asClassNameArray(this._repository.provider.iconPath) : ThemeIcon.asClassNameArray(Codicon.repo);
      icon.classList.add(...iconClassNameArray);
      const name = $(".name");
      name.textContent = this._repository.provider.name;
      reset(this.label, icon, name);
    }
  }
  getTooltip() {
    return this._repository.provider.name;
  }
}
class SCMHistoryItemRefsActionViewItem extends ActionViewItem {
  constructor(_repository, _historyItemsFilter, action, options) {
    super(null, action, { ...options, icon: false, label: true });
    this._repository = _repository;
    this._historyItemsFilter = _historyItemsFilter;
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.classList.add("scm-graph-history-item-picker");
      const icon = $(".icon");
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitBranch));
      const name = $(".name");
      if (this._historyItemsFilter === "all") {
        name.textContent = localize("all", "All");
      } else if (this._historyItemsFilter === "auto") {
        name.textContent = localize("auto", "Auto");
      } else if (this._historyItemsFilter.length === 1) {
        name.textContent = this._historyItemsFilter[0].name;
      } else {
        name.textContent = localize("items", "{0} Items", this._historyItemsFilter.length);
      }
      reset(this.label, icon, name);
    }
  }
  getTooltip() {
    if (this._historyItemsFilter === "all") {
      return localize("allHistoryItemRefs", "All history item references");
    } else if (this._historyItemsFilter === "auto") {
      const historyProvider = this._repository.provider.historyProvider.get();
      return [
        historyProvider?.historyItemRef.get()?.name,
        historyProvider?.historyItemRemoteRef.get()?.name,
        historyProvider?.historyItemBaseRef.get()?.name
      ].filter((ref) => !!ref).join(", ");
    } else if (this._historyItemsFilter.length === 1) {
      return this._historyItemsFilter[0].name;
    } else {
      return this._historyItemsFilter.map((ref) => ref.name).join(", ");
    }
  }
}
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: PICK_REPOSITORY_ACTION_ID,
      title: localize("repositoryPicker", "Repository Picker"),
      viewId: HISTORY_VIEW_PANE_ID,
      f1: false,
      menu: {
        id: MenuId.SCMHistoryTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.has("scm.providerCount"),
          ContextKeyExpr.greater("scm.providerCount", 1),
          ContextKeyExpr.equals("config.scm.repositories.selectionMode", "multiple")
        ),
        group: "navigation",
        order: 0
      }
    });
  }
  async runInView(_, view) {
    view.pickRepository();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: PICK_HISTORY_ITEM_REFS_ACTION_ID,
      title: localize("referencePicker", "History Item Reference Picker"),
      icon: Codicon.gitBranch,
      viewId: HISTORY_VIEW_PANE_ID,
      precondition: ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
      f1: false,
      menu: {
        id: MenuId.SCMHistoryTitle,
        group: "navigation",
        order: 1
      }
    });
  }
  async runInView(_, view) {
    view.pickHistoryItemRef();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.revealCurrentHistoryItem",
      title: localize("goToCurrentHistoryItem", "Go to Current History Item"),
      icon: Codicon.target,
      viewId: HISTORY_VIEW_PANE_ID,
      precondition: ContextKeyExpr.and(
        ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
        ContextKeys.SCMCurrentHistoryItemRefInFilter.isEqualTo(true)
      ),
      f1: false,
      menu: {
        id: MenuId.SCMHistoryTitle,
        group: "navigation",
        order: 2
      }
    });
  }
  async runInView(_, view) {
    view.revealCurrentHistoryItem();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.refresh",
      title: localize("refreshGraph", "Refresh"),
      viewId: HISTORY_VIEW_PANE_ID,
      f1: false,
      icon: Codicon.refresh,
      menu: {
        id: MenuId.SCMHistoryTitle,
        group: "navigation",
        order: 1e3
      }
    });
  }
  async runInView(_, view) {
    view.refresh();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.setListViewMode",
      title: localize("setListViewMode", "View as List"),
      viewId: HISTORY_VIEW_PANE_ID,
      toggled: ContextKeys.SCMHistoryViewMode.isEqualTo(ViewMode.List),
      menu: { id: MenuId.SCMHistoryTitle, group: "9_viewmode", order: 1 },
      f1: false
    });
  }
  async runInView(_, view) {
    view.setViewMode(ViewMode.List);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.setTreeViewMode",
      title: localize("setTreeViewMode", "View as Tree"),
      viewId: HISTORY_VIEW_PANE_ID,
      toggled: ContextKeys.SCMHistoryViewMode.isEqualTo(ViewMode.Tree),
      menu: { id: MenuId.SCMHistoryTitle, group: "9_viewmode", order: 2 },
      f1: false
    });
  }
  async runInView(_, view) {
    view.setViewMode(ViewMode.Tree);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.scm.action.graph.viewChanges",
      title: localize("openChanges", "Open Changes"),
      icon: Codicon.diffMultiple,
      f1: false,
      menu: [
        {
          id: MenuId.SCMHistoryItemContext,
          group: "inline",
          order: 1
        },
        {
          id: MenuId.SCMHistoryItemContext,
          group: "0_view",
          order: 1
        }
      ]
    });
  }
  async run(accessor, provider, ...historyItems) {
    const commandService = accessor.get(ICommandService);
    const historyProvider = provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
    if (!provider || !historyProvider || !historyItemRef || historyItems.length === 0) {
      return;
    }
    const historyItem = historyItems[0];
    let title, historyItemId, historyItemParentId;
    if (historyItemRemoteRef && (historyItem.id === SCMIncomingHistoryItemId || historyItem.id === SCMOutgoingHistoryItemId)) {
      const mergeBase = await historyProvider.resolveHistoryItemRefsCommonAncestor([
        historyItemRef.name,
        historyItemRemoteRef.name
      ]);
      if (mergeBase && historyItem.id === SCMIncomingHistoryItemId) {
        title = `${historyItem.subject} - ${historyItemRef.name} \u2194 ${historyItemRemoteRef.name}`;
        historyItemId = historyItemRemoteRef.id;
        historyItemParentId = mergeBase;
      } else if (mergeBase && historyItem.id === SCMOutgoingHistoryItemId) {
        title = `${historyItem.subject} - ${historyItemRemoteRef.name} \u2194 ${historyItemRef.name}`;
        historyItemId = historyItemRef.id;
        historyItemParentId = mergeBase;
      }
    } else {
      title = getHistoryItemEditorTitle(historyItem);
      historyItemId = historyItem.id;
      if (historyItem.parentIds.length > 0) {
        if (historyItem.parentIds[0] === SCMIncomingHistoryItemId && historyItemRemoteRef) {
          historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
            historyItemRef.name,
            historyItemRemoteRef.name
          ]);
        } else {
          historyItemParentId = historyItem.parentIds[0];
        }
      }
    }
    if (!title || !historyItemId || !historyItemParentId) {
      return;
    }
    const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItemId, historyItemParentId, "");
    commandService.executeCommand("_workbench.openMultiDiffEditor", { title, multiDiffSourceUri });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.scm.action.graph.openFile",
      title: localize("openFile", "Open File"),
      icon: Codicon.goToFile,
      f1: false,
      menu: [
        {
          id: MenuId.SCMHistoryItemChangeContext,
          group: "inline",
          order: 1
        },
        {
          id: MenuId.SCMHistoryItemChangeContext,
          group: "0_view",
          order: 1
        }
      ]
    });
  }
  async run(accessor, historyItem, historyItemChange) {
    const editorService = accessor.get(IEditorService);
    if (!historyItem || !historyItemChange.modifiedUri) {
      return;
    }
    let version;
    if (historyItem.id === SCMIncomingHistoryItemId) {
      version = localize("incomingChanges", "Incoming Changes");
    } else if (historyItem.id === SCMOutgoingHistoryItemId) {
      version = localize("outgoingChanges", "Outgoing Changes");
    } else {
      version = historyItem.displayId ?? historyItem.id;
    }
    const name = basename(historyItemChange.modifiedUri.fsPath);
    await editorService.openEditor({ resource: historyItemChange.modifiedUri, label: `${name} (${version})` });
  }
});
class ListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId(element) {
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      return HistoryItemRenderer.TEMPLATE_ID;
    } else if (isSCMHistoryItemChangeViewModelTreeElement(element) || isSCMHistoryItemChangeNode(element)) {
      return HistoryItemChangeRenderer.TEMPLATE_ID;
    } else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
      return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
    } else {
      throw new Error("Unknown element");
    }
  }
}
let HistoryItemRenderer = class {
  constructor(_viewContainerLocation, _commandService, _configurationService, _contextKeyService, _contextMenuService, _hoverService, _keybindingService, _markdownRendererService, _menuService, _telemetryService) {
    this._viewContainerLocation = _viewContainerLocation;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._markdownRendererService = _markdownRendererService;
    this._menuService = _menuService;
    this._telemetryService = _telemetryService;
    this._badgesConfig = observableConfigValue("scm.graph.badges", "filter", this._configurationService);
  }
  get templateId() {
    return HistoryItemRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".history-item"));
    const graphContainer = append(element, $(".graph-container"));
    const iconLabel = new IconLabel(element, {
      supportIcons: true,
      supportHighlights: true,
      supportDescriptionHighlights: true
    });
    const labelContainer = append(element, $(".label-container"));
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, void 0, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    return { element, graphContainer, label: iconLabel, labelContainer, actionBar, elementDisposables: new DisposableStore(), disposables: combinedDisposable(iconLabel, actionBar) };
  }
  renderElement(node, index, templateData) {
    const provider = node.element.repository.provider;
    const historyItemViewModel = node.element.historyItemViewModel;
    const historyItem = historyItemViewModel.historyItem;
    const { content, disposables } = toHistoryItemHoverContent(this._markdownRendererService, historyItem, true);
    const { hoverOptions, hoverLifecycleOptions } = this._getHoverOptions();
    const historyItemHover = this._hoverService.setupDelayedHover(templateData.element, { ...hoverOptions, content }, hoverLifecycleOptions);
    templateData.elementDisposables.add(historyItemHover);
    templateData.elementDisposables.add(disposables);
    templateData.graphContainer.textContent = "";
    templateData.graphContainer.classList.toggle("current", historyItemViewModel.kind === "HEAD");
    templateData.graphContainer.classList.toggle("incoming-changes", historyItemViewModel.kind === "incoming-changes");
    templateData.graphContainer.classList.toggle("outgoing-changes", historyItemViewModel.kind === "outgoing-changes");
    templateData.graphContainer.appendChild(renderSCMHistoryItemGraph(historyItemViewModel));
    const historyItemRef = provider.historyProvider.get()?.historyItemRef?.get();
    const extraClasses = historyItemRef?.revision === historyItem.id ? ["history-item-current"] : [];
    const [matches, descriptionMatches] = this._processMatches(historyItemViewModel, node.filterData);
    templateData.label.setLabel(historyItem.subject, historyItem.author, { matches, descriptionMatches, extraClasses });
    this._renderBadges(historyItem, templateData);
    const actions = this._menuService.getMenuActions(
      MenuId.SCMHistoryItemContext,
      this._contextKeyService,
      { arg: provider, shouldForwardArgs: true }
    );
    templateData.actionBar.context = historyItem;
    templateData.actionBar.setActions(getActionBarActions(actions, "inline").primary);
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible");
  }
  _renderBadges(historyItem, templateData) {
    templateData.elementDisposables.add(autorun((reader) => {
      const labelConfig = this._badgesConfig.read(reader);
      templateData.labelContainer.replaceChildren();
      const references = historyItem.references ? historyItem.references.slice(0) : [];
      if (references.length > 0 && references[0].color) {
        this._renderBadge([references[0]], true, templateData);
        references.splice(0, 1);
      }
      const historyItemRefsByColor = groupBy2(references, (ref) => ref.color ? ref.color : "");
      for (const [key, historyItemRefs] of Object.entries(historyItemRefsByColor)) {
        if (key === "" && labelConfig !== "all") {
          continue;
        }
        if (!historyItemRefs) {
          continue;
        }
        const historyItemRefByIconId = groupBy2(historyItemRefs, (ref) => ThemeIcon.isThemeIcon(ref.icon) ? ref.icon.id : "");
        for (const [key2, historyItemRefs2] of Object.entries(historyItemRefByIconId)) {
          if (key2 === "" || !historyItemRefs2) {
            continue;
          }
          this._renderBadge(historyItemRefs2, false, templateData);
        }
      }
    }));
  }
  _renderBadge(historyItemRefs, showDescription, templateData) {
    if (historyItemRefs.length === 0 || !ThemeIcon.isThemeIcon(historyItemRefs[0].icon)) {
      return;
    }
    const elements = h("div.label", {
      style: {
        color: historyItemRefs[0].color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(foreground),
        backgroundColor: historyItemRefs[0].color ? asCssVariable(historyItemRefs[0].color) : asCssVariable(historyItemHoverDefaultLabelBackground)
      }
    }, [
      h("div.count@count", {
        style: {
          display: historyItemRefs.length > 1 ? "" : "none"
        }
      }),
      h("div.icon@icon"),
      h("div.description@description", {
        style: {
          display: showDescription ? "" : "none"
        }
      })
    ]);
    elements.count.textContent = historyItemRefs.length > 1 ? historyItemRefs.length.toString() : "";
    elements.icon.classList.add(...ThemeIcon.asClassNameArray(historyItemRefs[0].icon));
    elements.description.textContent = showDescription ? historyItemRefs[0].name : "";
    append(templateData.labelContainer, elements.root);
  }
  _getHoverOptions() {
    if (this._viewContainerLocation === ViewContainerLocation.Panel) {
      return {
        hoverOptions: {
          additionalClasses: ["history-item-hover"],
          appearance: {
            compact: true
          },
          position: {
            hoverPosition: HoverPosition.RIGHT
          },
          style: HoverStyle.Mouse
        },
        hoverLifecycleOptions: void 0
      };
    }
    return {
      hoverOptions: {
        additionalClasses: ["history-item-hover"],
        appearance: {
          compact: true,
          showPointer: true
        },
        position: {
          hoverPosition: HoverPosition.RIGHT
        },
        style: HoverStyle.Pointer
      },
      hoverLifecycleOptions: {
        groupId: "scm-history-item"
      }
    };
  }
  _processMatches(historyItemViewModel, filterData) {
    if (!filterData) {
      return [void 0, void 0];
    }
    return [
      historyItemViewModel.historyItem.message === filterData.label ? createMatches(filterData.score) : void 0,
      historyItemViewModel.historyItem.author === filterData.label ? createMatches(filterData.score) : void 0
    ];
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
};
HistoryItemRenderer.TEMPLATE_ID = "history-item";
HistoryItemRenderer = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IMarkdownRendererService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, ITelemetryService)
], HistoryItemRenderer);
let HistoryItemChangeRenderer = class {
  constructor(viewMode, resourceLabels, _commandService, _contextKeyService, _contextMenuService, _keybindingService, _labelService, _menuService, _telemetryService) {
    this.viewMode = viewMode;
    this.resourceLabels = resourceLabels;
    this._commandService = _commandService;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._labelService = _labelService;
    this._menuService = _menuService;
    this._telemetryService = _telemetryService;
  }
  get templateId() {
    return HistoryItemChangeRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const rowElement = container.parentElement;
    const element = append(container, $(".history-item-change"));
    const graphPlaceholder = append(element, $(".graph-placeholder"));
    const labelContainer = append(element, $(".label-container"));
    const resourceLabel = this.resourceLabels.create(labelContainer, {
      supportDescriptionHighlights: true,
      supportHighlights: true
    });
    const disposables = new DisposableStore();
    const actionsContainer = append(resourceLabel.element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, void 0, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    disposables.add(actionBar);
    return { rowElement, element, graphPlaceholder, resourceLabel, actionBar, disposables };
  }
  renderElement(elementOrNode, index, templateData, details) {
    const historyItemViewModel = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemViewModel : elementOrNode.element.context.historyItemViewModel;
    const historyItemChange = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemChange : elementOrNode.element;
    const graphColumns = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.graphColumns : elementOrNode.element.context.historyItemViewModel.outputSwimlanes;
    this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);
    const hidePath = this.viewMode() === ViewMode.Tree;
    const fileKind = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? FileKind.FILE : FileKind.FOLDER;
    templateData.resourceLabel.setFile(historyItemChange.uri, { fileDecorations: { colors: false, badges: true }, fileKind, hidePath });
    if (fileKind === FileKind.FILE) {
      const actions = this._menuService.getMenuActions(
        MenuId.SCMHistoryItemChangeContext,
        this._contextKeyService,
        { arg: historyItemViewModel.historyItem, shouldForwardArgs: true }
      );
      templateData.actionBar.context = historyItemChange;
      templateData.actionBar.setActions(getActionBarActions(actions, "inline").primary);
    } else {
      templateData.actionBar.context = void 0;
      templateData.actionBar.setActions([]);
    }
  }
  renderCompressedElements(node, index, templateData, details) {
    const compressed = node.element;
    const historyItemViewModel = compressed.elements[0].context.historyItemViewModel;
    const graphColumns = compressed.elements[0].context.historyItemViewModel.outputSwimlanes;
    this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);
    const label = compressed.elements.map((e) => e.name);
    const folder = compressed.elements[compressed.elements.length - 1];
    templateData.resourceLabel.setResource({ resource: folder.uri, name: label }, {
      fileDecorations: { colors: false, badges: true },
      fileKind: FileKind.FOLDER,
      separator: this._labelService.getSeparator(folder.uri.scheme)
    });
    templateData.actionBar.context = void 0;
    templateData.actionBar.setActions([]);
  }
  _renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns) {
    const graphPlaceholderSvgWidth = SWIMLANE_WIDTH * (graphColumns.length + 1);
    const marginLeft = graphPlaceholderSvgWidth - 16;
    templateData.rowElement.style.marginLeft = `${marginLeft}px`;
    templateData.graphPlaceholder.textContent = "";
    templateData.graphPlaceholder.style.left = `${-1 * marginLeft}px`;
    templateData.graphPlaceholder.style.width = `${graphPlaceholderSvgWidth}px`;
    templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(graphColumns, getHistoryItemIndex(historyItemViewModel)));
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
HistoryItemChangeRenderer.TEMPLATE_ID = "history-item-change";
HistoryItemChangeRenderer = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, ITelemetryService)
], HistoryItemChangeRenderer);
let HistoryItemLoadMoreRenderer = class {
  constructor(_isLoadingMore, _loadMoreCallback, _configurationService) {
    this._isLoadingMore = _isLoadingMore;
    this._loadMoreCallback = _loadMoreCallback;
    this._configurationService = _configurationService;
  }
  get templateId() {
    return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".history-item-load-more"));
    const graphPlaceholder = append(element, $(".graph-placeholder"));
    const historyItemPlaceholderContainer = append(element, $(".history-item-placeholder"));
    const historyItemPlaceholderLabel = new IconLabel(historyItemPlaceholderContainer, { supportIcons: true });
    return { element, graphPlaceholder, historyItemPlaceholderContainer, historyItemPlaceholderLabel, elementDisposables: new DisposableStore(), disposables: historyItemPlaceholderLabel };
  }
  renderElement(element, index, templateData) {
    templateData.graphPlaceholder.textContent = "";
    templateData.graphPlaceholder.style.width = `${SWIMLANE_WIDTH * (element.element.graphColumns.length + 1)}px`;
    templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(element.element.graphColumns));
    const pageOnScroll = this._configurationService.getValue("scm.graph.pageOnScroll") === true;
    templateData.historyItemPlaceholderContainer.classList.toggle("shimmer", pageOnScroll);
    if (pageOnScroll) {
      templateData.historyItemPlaceholderLabel.setLabel("");
      this._loadMoreCallback();
    } else {
      templateData.elementDisposables.add(autorun((reader) => {
        const isLoadingMore = this._isLoadingMore.read(reader);
        const icon = `$(${isLoadingMore ? "loading~spin" : "fold-down"})`;
        templateData.historyItemPlaceholderLabel.setLabel(localize("loadMore", "{0} Load More...", icon));
      }));
    }
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
};
HistoryItemLoadMoreRenderer.TEMPLATE_ID = "historyItemLoadMore";
HistoryItemLoadMoreRenderer = __decorateClass([
  __decorateParam(2, IConfigurationService)
], HistoryItemLoadMoreRenderer);
let SCMHistoryViewPaneActionRunner = class extends ActionRunner {
  constructor(_progressService) {
    super();
    this._progressService = _progressService;
  }
  runAction(action, context) {
    return this._progressService.withProgress(
      { location: HISTORY_VIEW_PANE_ID },
      async () => await super.runAction(action, context)
    );
  }
};
SCMHistoryViewPaneActionRunner = __decorateClass([
  __decorateParam(0, IProgressService)
], SCMHistoryViewPaneActionRunner);
class SCMHistoryTreeAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("scm history", "Source Control History");
  }
  getAriaLabel(element) {
    if (isSCMRepository(element)) {
      return `${element.provider.name} ${element.provider.label}`;
    } else if (isSCMHistoryItemViewModelTreeElement(element)) {
      const historyItem = element.historyItemViewModel.historyItem;
      return `${stripIcons(historyItem.message).trim()}${historyItem.author ? `, ${historyItem.author}` : ""}`;
    } else {
      return "";
    }
  }
}
class SCMHistoryTreeIdentityProvider {
  getId(element) {
    if (isSCMRepository(element)) {
      const provider = element.provider;
      return `repo:${provider.id}`;
    } else if (isSCMHistoryItemViewModelTreeElement(element)) {
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      return `historyItem:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(",")}`;
    } else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      return `historyItemChange:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(",")}/${element.historyItemChange.uri.fsPath}`;
    } else if (isSCMHistoryItemChangeNode(element)) {
      const provider = element.context.repository.provider;
      const historyItem = element.context.historyItemViewModel.historyItem;
      return `historyItemChangeFolder:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(",")}/${element.uri.fsPath}`;
    } else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
      const provider = element.repository.provider;
      return `historyItemLoadMore:${provider.id}`;
    } else {
      throw new Error("Invalid tree element");
    }
  }
}
class SCMHistoryTreeKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    if (isSCMRepository(element)) {
      return void 0;
    } else if (isSCMHistoryItemViewModelTreeElement(element)) {
      return [element.historyItemViewModel.historyItem.message, element.historyItemViewModel.historyItem.author];
    } else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
      return "";
    } else {
      throw new Error("Invalid tree element");
    }
  }
  getCompressedNodeKeyboardNavigationLabel(elements) {
    const folders = elements;
    return folders.map((e) => e.name).join("/");
  }
}
class SCMHistoryTreeCompressionDelegate {
  isIncompressible(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.childrenCount === 0 || !element.parent || !element.parent.parent;
    }
    return true;
  }
}
class SCMHistoryTreeDataSource extends Disposable {
  constructor(viewMode) {
    super();
    this.viewMode = viewMode;
  }
  async getChildren(inputOrElement) {
    const children = [];
    if (inputOrElement instanceof SCMHistoryViewModel) {
      const historyItems = await inputOrElement.getHistoryItems();
      children.push(...historyItems);
      const repository = inputOrElement.repository.get();
      const lastHistoryItem = historyItems.at(-1);
      if (repository && lastHistoryItem && lastHistoryItem.historyItemViewModel.outputSwimlanes.length > 0) {
        children.push({
          repository,
          graphColumns: lastHistoryItem.historyItemViewModel.outputSwimlanes,
          type: "historyItemLoadMore"
        });
      }
    } else if (isSCMHistoryItemViewModelTreeElement(inputOrElement)) {
      const historyProvider = inputOrElement.repository.provider.historyProvider.get();
      const historyItemViewModel = inputOrElement.historyItemViewModel;
      const historyItem = historyItemViewModel.historyItem;
      let historyItemId, historyItemParentId;
      if (historyItemViewModel.kind === "incoming-changes" || historyItemViewModel.kind === "outgoing-changes") {
        const historyItemRef = historyProvider?.historyItemRef.get();
        const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
        if (!historyProvider || !historyItemRef || !historyItemRemoteRef) {
          return [];
        }
        historyItemId = historyItemViewModel.kind === "incoming-changes" ? historyItemRemoteRef.id : historyItemRef.id;
        historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
          historyItemRef.name,
          historyItemRemoteRef.name
        ]);
      } else {
        historyItemId = historyItem.id;
        if (historyItem.parentIds.length > 0) {
          if (historyItem.parentIds[0] === SCMIncomingHistoryItemId) {
            const historyItemRef = historyProvider?.historyItemRef.get();
            const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
            if (!historyProvider || !historyItemRef || !historyItemRemoteRef) {
              return [];
            }
            historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
              historyItemRef.name,
              historyItemRemoteRef.name
            ]);
          } else {
            historyItemParentId = historyItem.parentIds[0];
          }
        }
      }
      const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId) ?? [];
      if (this.viewMode() === ViewMode.List) {
        children.push(...historyItemChanges.map((change) => ({
          repository: inputOrElement.repository,
          historyItemViewModel: inputOrElement.historyItemViewModel,
          historyItemChange: change,
          graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
          type: "historyItemChangeViewModel"
        })));
      } else if (this.viewMode() === ViewMode.Tree) {
        const rootUri = inputOrElement.repository.provider.rootUri ?? URI.file("/");
        const historyItemChangesTree = new ResourceTree(inputOrElement, rootUri);
        for (const change of historyItemChanges) {
          historyItemChangesTree.add(change.uri, {
            repository: inputOrElement.repository,
            historyItemViewModel: inputOrElement.historyItemViewModel,
            historyItemChange: change,
            graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
            type: "historyItemChangeViewModel"
          });
        }
        for (const node of historyItemChangesTree.root.children) {
          children.push(node.element ?? node);
        }
      }
    } else if (ResourceTree.isResourceNode(inputOrElement) && isSCMHistoryItemChangeNode(inputOrElement)) {
      for (const node of inputOrElement.children) {
        children.push(node.element && node.childrenCount === 0 ? node.element : node);
      }
    }
    return children;
  }
  hasChildren(inputOrElement) {
    return inputOrElement instanceof SCMHistoryViewModel || isSCMHistoryItemViewModelTreeElement(inputOrElement) || isSCMHistoryItemChangeNode(inputOrElement) && inputOrElement.childrenCount > 0;
  }
}
class SCMHistoryTreeDragAndDrop {
  getDragURI(element) {
    const uri = this._getTreeElementUri(element);
    return uri ? uri.toString() : null;
  }
  onDragStart(data, originalEvent) {
    if (!originalEvent.dataTransfer) {
      return;
    }
    const historyItems = this._getDragAndDropData(data);
    if (historyItems.length === 0) {
      return;
    }
    originalEvent.dataTransfer.setData(CodeDataTransfers.SCM_HISTORY_ITEM, JSON.stringify(historyItems));
  }
  getDragLabel(elements, originalEvent) {
    if (elements.length === 1) {
      const element = elements[0];
      return this._getTreeElementLabel(element);
    }
    return String(elements.length);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return false;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
  }
  _getDragAndDropData(data) {
    const historyItems = [];
    for (const element of [...data.context ?? [], ...data.elements]) {
      if (!isSCMHistoryItemViewModelTreeElement(element)) {
        continue;
      }
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      const attachmentName = `$(${Codicon.repo.id})\xA0${provider.name}\xA0$(${Codicon.gitCommit.id})\xA0${historyItem.displayId ?? historyItem.id}`;
      const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : void 0;
      historyItems.push({
        name: attachmentName,
        resource: ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId),
        historyItem
      });
    }
    return historyItems;
  }
  _getTreeElementLabel(element) {
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      const historyItem = element.historyItemViewModel.historyItem;
      return historyItem.displayId ?? historyItem.id;
    }
    return void 0;
  }
  _getTreeElementUri(element) {
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : void 0;
      return ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId);
    }
    return void 0;
  }
  dispose() {
  }
}
let SCMHistoryViewModel = class extends Disposable {
  constructor(_configurationService, _contextKeyService, _extensionService, _scmService, _scmViewService, _storageService) {
    super();
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._extensionService = _extensionService;
    this._scmService = _scmService;
    this._scmViewService = _scmViewService;
    this._storageService = _storageService;
    this._selectedRepository = observableValue(this, "auto");
    this.onDidChangeHistoryItemsFilter = observableSignal(this);
    this.isViewModelEmpty = observableValue(this, false);
    this._repositoryState = /* @__PURE__ */ new Map();
    this._repositoryFilterState = /* @__PURE__ */ new Map();
    this._repositoryFilterState = this._loadHistoryItemsFilterState();
    this.viewMode = observableValue(this, this._getViewMode());
    this._extensionService.onWillStop(this._saveHistoryItemsFilterState, this, this._store);
    this._storageService.onWillSaveState(this._saveHistoryItemsFilterState, this, this._store);
    this._scmHistoryItemCountCtx = ContextKeys.SCMHistoryItemCount.bindTo(this._contextKeyService);
    this._scmHistoryViewModeCtx = ContextKeys.SCMHistoryViewMode.bindTo(this._contextKeyService);
    this._scmHistoryViewModeCtx.set(this.viewMode.get());
    const firstRepository = this._scmService.repositoryCount > 0 ? constObservable(Iterable.first(this._scmService.repositories)) : observableFromEvent(
      this,
      Event.once(this._scmService.onDidAddRepository),
      (repository) => repository
    );
    const graphRepository = derived((reader) => {
      const selectedRepository = this._selectedRepository.read(reader);
      if (selectedRepository !== "auto") {
        return selectedRepository;
      }
      return this._scmViewService.activeRepository.read(reader)?.repository;
    });
    this.repository = latestChangedValue(this, [firstRepository, graphRepository]);
    const closedRepository = observableFromEvent(
      this,
      this._scmService.onDidRemoveRepository,
      (repository) => repository
    );
    this._register(autorun((reader) => {
      const repository = closedRepository.read(reader);
      if (!repository) {
        return;
      }
      if (this.repository.read(void 0) === repository) {
        this._selectedRepository.set(Iterable.first(this._scmService.repositories) ?? "auto", void 0);
      }
      this._repositoryState.delete(repository);
    }));
  }
  clearRepositoryState() {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    this._repositoryState.delete(repository);
  }
  getHistoryItemsFilter() {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    const filterState = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? "auto";
    if (filterState === "all" || filterState === "auto") {
      return filterState;
    }
    const repositoryState = this._repositoryState.get(repository);
    return repositoryState?.historyItemsFilter;
  }
  getCurrentHistoryItemTreeElement() {
    const repository = this.repository.get();
    if (!repository) {
      return void 0;
    }
    const state = this._repositoryState.get(repository);
    if (!state) {
      return void 0;
    }
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    return state.viewModels.find((viewModel) => viewModel.historyItemViewModel.historyItem.id === historyItemRef?.revision);
  }
  loadMore(cursor) {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    const state = this._repositoryState.get(repository);
    if (!state) {
      return;
    }
    this._repositoryState.set(repository, { ...state, loadMore: cursor ?? true });
  }
  async getHistoryItems() {
    const repository = this.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
    if (!repository || !historyProvider) {
      this._scmHistoryItemCountCtx.set(0);
      this.isViewModelEmpty.set(true, void 0);
      return [];
    }
    let state = this._repositoryState.get(repository);
    if (!state || state.loadMore !== false) {
      const historyItems = state?.viewModels.filter((vm) => vm.historyItemViewModel.kind !== "incoming-changes" && vm.historyItemViewModel.kind !== "outgoing-changes").map((vm) => vm.historyItemViewModel.historyItem) ?? [];
      const historyItemRefs = state?.historyItemsFilter ?? await this._resolveHistoryItemFilter(repository, historyProvider);
      const limit = clamp(this._configurationService.getValue("scm.graph.pageSize"), 1, 1e3);
      const historyItemRefIds = historyItemRefs.map((ref) => ref.revision ?? ref.id);
      do {
        historyItems.push(...await historyProvider.provideHistoryItems({
          historyItemRefs: historyItemRefIds,
          limit,
          skip: historyItems.length
        }) ?? []);
      } while (typeof state?.loadMore === "string" && !historyItems.find((item) => item.id === state?.loadMore));
      const mergeBase = historyItemRef && historyItemRemoteRef && state?.mergeBase === void 0 ? await historyProvider.resolveHistoryItemRefsCommonAncestor([
        historyItemRef.name,
        historyItemRemoteRef.name
      ]) : state?.mergeBase;
      const colorMap = this._getGraphColorMap(historyItemRefs);
      const addIncomingChangesNode = this._scmViewService.graphShowIncomingChangesConfig.get() && historyItemRefs.some((ref) => ref.id === historyItemRemoteRef?.id);
      const addOutgoingChangesNode = this._scmViewService.graphShowOutgoingChangesConfig.get() && historyItemRefs.some((ref) => ref.id === historyItemRef?.id);
      const viewModels = toISCMHistoryItemViewModelArray(
        historyItems,
        colorMap,
        historyProvider.historyItemRef.get(),
        historyProvider.historyItemRemoteRef.get(),
        historyProvider.historyItemBaseRef.get(),
        addIncomingChangesNode,
        addOutgoingChangesNode,
        mergeBase
      ).map((historyItemViewModel) => ({
        repository,
        historyItemViewModel,
        type: "historyItemViewModel"
      }));
      state = { historyItemsFilter: historyItemRefs, viewModels, mergeBase, loadMore: false };
      this._repositoryState.set(repository, state);
      this._scmHistoryItemCountCtx.set(viewModels.length);
      this.isViewModelEmpty.set(viewModels.length === 0, void 0);
    }
    return state.viewModels;
  }
  setRepository(repository) {
    this._selectedRepository.set(repository, void 0);
  }
  setHistoryItemsFilter(filter) {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    if (filter !== "auto") {
      this._repositoryFilterState.set(getProviderKey(repository.provider), filter);
    } else {
      this._repositoryFilterState.delete(getProviderKey(repository.provider));
    }
    this._saveHistoryItemsFilterState();
    this.onDidChangeHistoryItemsFilter.trigger(void 0);
  }
  setViewMode(viewMode) {
    if (viewMode === this.viewMode.get()) {
      return;
    }
    this.viewMode.set(viewMode, void 0);
    this._scmHistoryViewModeCtx.set(viewMode);
    this._storageService.store("scm.graphView.viewMode", viewMode, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  _getViewMode() {
    let mode = this._configurationService.getValue("scm.defaultViewMode") === "list" ? ViewMode.List : ViewMode.Tree;
    const storageMode = this._storageService.get("scm.graphView.viewMode", StorageScope.WORKSPACE);
    if (typeof storageMode === "string") {
      mode = storageMode;
    }
    return mode;
  }
  _getGraphColorMap(historyItemRefs) {
    const repository = this.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
    const historyItemBaseRef = historyProvider?.historyItemBaseRef.get();
    const colorMap = /* @__PURE__ */ new Map();
    if (historyItemRef) {
      colorMap.set(historyItemRef.id, historyItemRef.color);
      if (historyItemRemoteRef) {
        colorMap.set(historyItemRemoteRef.id, historyItemRemoteRef.color);
      }
      if (historyItemBaseRef) {
        colorMap.set(historyItemBaseRef.id, historyItemBaseRef.color);
      }
    }
    for (const ref of historyItemRefs) {
      if (!colorMap.has(ref.id)) {
        colorMap.set(ref.id, void 0);
      }
    }
    return colorMap;
  }
  async _resolveHistoryItemFilter(repository, historyProvider) {
    const historyItemRefs = [];
    const historyItemsFilter = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? "auto";
    switch (historyItemsFilter) {
      case "all":
        historyItemRefs.push(...await historyProvider.provideHistoryItemRefs() ?? []);
        break;
      case "auto":
        historyItemRefs.push(...[
          historyProvider.historyItemRef.get(),
          historyProvider.historyItemRemoteRef.get(),
          historyProvider.historyItemBaseRef.get()
        ].filter((ref) => !!ref));
        break;
      default: {
        const refs = (await historyProvider.provideHistoryItemRefs(historyItemsFilter) ?? []).filter((ref) => historyItemsFilter.some((filter) => filter === ref.id));
        if (refs.length === 0) {
          historyItemRefs.push(...[
            historyProvider.historyItemRef.get(),
            historyProvider.historyItemRemoteRef.get(),
            historyProvider.historyItemBaseRef.get()
          ].filter((ref) => !!ref));
          this._repositoryFilterState.delete(getProviderKey(repository.provider));
        } else {
          historyItemRefs.push(...refs);
          this._repositoryFilterState.set(getProviderKey(repository.provider), refs.map((ref) => ref.id));
        }
        this._saveHistoryItemsFilterState();
        break;
      }
    }
    return historyItemRefs;
  }
  _loadHistoryItemsFilterState() {
    try {
      const filterData = this._storageService.get("scm.graphView.referencesFilter", StorageScope.WORKSPACE);
      if (filterData) {
        return new Map(JSON.parse(filterData));
      }
    } catch {
    }
    return /* @__PURE__ */ new Map();
  }
  _saveHistoryItemsFilterState() {
    const filter = Array.from(this._repositoryFilterState.entries());
    this._storageService.store("scm.graphView.referencesFilter", JSON.stringify(filter), StorageScope.WORKSPACE, StorageTarget.USER);
  }
  dispose() {
    this._repositoryState.clear();
    super.dispose();
  }
};
SCMHistoryViewModel = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, ISCMService),
  __decorateParam(4, ISCMViewService),
  __decorateParam(5, IStorageService)
], SCMHistoryViewModel);
let RepositoryPicker = class {
  constructor(_quickInputService, _scmViewService) {
    this._quickInputService = _quickInputService;
    this._scmViewService = _scmViewService;
    this._autoQuickPickItem = {
      label: localize("auto", "Auto"),
      description: localize("activeRepository", "Show the source control graph for the active repository"),
      repository: "auto"
    };
  }
  async pickRepository() {
    const picks = [
      this._autoQuickPickItem,
      { type: "separator" }
    ];
    picks.push(...this._scmViewService.repositories.map((r) => ({
      label: r.provider.name,
      description: r.provider.rootUri?.fsPath,
      iconClass: ThemeIcon.isThemeIcon(r.provider.iconPath) ? ThemeIcon.asClassName(r.provider.iconPath) : ThemeIcon.asClassName(Codicon.repo),
      repository: r
    })));
    return this._quickInputService.pick(picks, {
      placeHolder: localize("scmGraphRepository", "Select the repository to view, type to filter all repositories")
    });
  }
};
RepositoryPicker = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, ISCMViewService)
], RepositoryPicker);
let HistoryItemRefPicker = class extends Disposable {
  constructor(_historyProvider, _historyItemsFilter, _quickInputService) {
    super();
    this._historyProvider = _historyProvider;
    this._historyItemsFilter = _historyItemsFilter;
    this._quickInputService = _quickInputService;
    this._allQuickPickItem = {
      id: "all",
      label: localize("all", "All"),
      description: localize("allHistoryItemRefs", "All history item references"),
      historyItemRef: "all"
    };
    this._autoQuickPickItem = {
      id: "auto",
      label: localize("auto", "Auto"),
      description: localize("currentHistoryItemRef", "Current history item reference(s)"),
      historyItemRef: "auto"
    };
  }
  async pickHistoryItemRef() {
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    this._store.add(quickPick);
    quickPick.placeholder = localize("scmGraphHistoryItemRef", "Select one/more history item references to view, type to filter");
    quickPick.canSelectMany = true;
    quickPick.hideCheckAll = true;
    quickPick.busy = true;
    quickPick.show();
    const items = await this._createQuickPickItems();
    let selectedItems = [];
    if (this._historyItemsFilter === "all") {
      selectedItems.push(this._allQuickPickItem);
    } else if (this._historyItemsFilter === "auto") {
      selectedItems.push(this._autoQuickPickItem);
    } else {
      let index = 0;
      while (index < items.length) {
        if (items[index].type === "separator") {
          index++;
          continue;
        }
        if (this._historyItemsFilter.some((ref) => ref.id === items[index].id)) {
          const item = items.splice(index, 1);
          selectedItems.push(...item);
        } else {
          index++;
        }
      }
      items.splice(2, 0, { type: "separator" }, ...selectedItems);
    }
    quickPick.items = items;
    quickPick.selectedItems = selectedItems;
    quickPick.busy = false;
    return new Promise((resolve) => {
      this._store.add(quickPick.onDidChangeSelection((items2) => {
        const { added } = delta(selectedItems, items2, (a, b) => compare(a.id ?? "", b.id ?? ""));
        if (added.length > 0) {
          if (added[0].historyItemRef === "all" || added[0].historyItemRef === "auto") {
            quickPick.selectedItems = [added[0]];
          } else {
            quickPick.selectedItems = [...quickPick.selectedItems.filter((i) => i.historyItemRef !== "all" && i.historyItemRef !== "auto")];
          }
        }
        selectedItems = [...quickPick.selectedItems];
      }));
      this._store.add(quickPick.onDidAccept(() => {
        if (selectedItems.length === 0) {
          resolve(void 0);
        } else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === "all") {
          resolve("all");
        } else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === "auto") {
          resolve("auto");
        } else {
          resolve(selectedItems.map((item) => item.historyItemRef.id));
        }
        quickPick.hide();
      }));
      this._store.add(quickPick.onDidHide(() => {
        resolve(void 0);
        this.dispose();
      }));
    });
  }
  async _createQuickPickItems() {
    const picks = [
      this._allQuickPickItem,
      this._autoQuickPickItem
    ];
    const historyItemRefs = await this._historyProvider.provideHistoryItemRefs() ?? [];
    const historyItemRefsByCategory = groupBy(historyItemRefs, (a, b) => compare(a.category ?? "", b.category ?? ""));
    for (const refs of historyItemRefsByCategory) {
      if (refs.length === 0) {
        continue;
      }
      picks.push({ type: "separator", label: refs[0].category });
      picks.push(...refs.map((ref) => {
        return {
          id: ref.id,
          label: ref.name,
          description: ref.description,
          iconClass: ThemeIcon.isThemeIcon(ref.icon) ? ThemeIcon.asClassName(ref.icon) : void 0,
          historyItemRef: ref
        };
      }));
    }
    return picks;
  }
};
HistoryItemRefPicker = __decorateClass([
  __decorateParam(2, IQuickInputService)
], HistoryItemRefPicker);
let SCMHistoryViewPane = class extends ViewPane {
  constructor(options, _editorService, _instantiationService, _menuService, _progressService, _scmViewService, configurationService, contextMenuService, keybindingService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, hoverService) {
    super({
      ...options,
      titleMenuId: MenuId.SCMHistoryTitle,
      showActions: ViewPaneShowActions.WhenExpanded
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._menuService = _menuService;
    this._progressService = _progressService;
    this._scmViewService = _scmViewService;
    this._repositoryIsLoadingMore = observableValue(this, false);
    this._repositoryOutdated = observableValue(this, false);
    this._visibilityDisposables = new DisposableStore();
    this._treeOperationSequencer = new Sequencer();
    this._treeLoadMoreSequencer = new Sequencer();
    this._refreshThrottler = new Throttler();
    this._updateChildrenThrottler = new Throttler();
    this._contextMenuDisposables = new MutableDisposable();
    this._scmProviderCtx = ContextKeys.SCMProvider.bindTo(this.scopedContextKeyService);
    this._scmCurrentHistoryItemRefHasRemote = ContextKeys.SCMCurrentHistoryItemRefHasRemote.bindTo(this.scopedContextKeyService);
    this._scmCurrentHistoryItemRefHasBase = ContextKeys.SCMCurrentHistoryItemRefHasBase.bindTo(this.scopedContextKeyService);
    this._scmCurrentHistoryItemRefInFilter = ContextKeys.SCMCurrentHistoryItemRefInFilter.bindTo(this.scopedContextKeyService);
    this._actionRunner = this.instantiationService.createInstance(SCMHistoryViewPaneActionRunner);
    this._register(this._actionRunner);
    this._register(this._refreshThrottler);
    this._register(this._updateChildrenThrottler);
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.title);
    const element = h("div.scm-graph-view-badge-container", [
      h("div.scm-graph-view-badge.monaco-count-badge.long@badge")
    ]);
    element.badge.textContent = "Outdated";
    container.appendChild(element.root);
    this._register(autorun((reader) => {
      const outdated = this._repositoryOutdated.read(reader);
      element.root.style.display = outdated ? "" : "none";
      if (outdated) {
        reader.store.add(this.hoverService.setupDelayedHover(element.root, {
          appearance: {
            compact: true,
            showPointer: true
          },
          content: new MarkdownString(localize("scmGraphViewOutdated", "Please refresh the graph using the refresh action ({0}).", "$(refresh)"), { supportThemeIcons: true }),
          position: {
            hoverPosition: HoverPosition.BELOW
          }
        }));
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    this._treeContainer = append(container, $(".scm-view.scm-history-view.show-file-icons"));
    this._treeContainer.classList.add("file-icon-themable-tree");
    this._createTree(this._treeContainer);
    this.onDidChangeBodyVisibility(async (visible) => {
      if (!visible) {
        this._visibilityDisposables.clear();
        return;
      }
      this._treeViewModel = this.instantiationService.createInstance(SCMHistoryViewModel);
      this._visibilityDisposables.add(this._treeViewModel);
      const firstRepositoryInitialized = derived(this, (reader) => {
        const repository = this._treeViewModel.repository.read(reader);
        const historyProvider = repository?.provider.historyProvider.read(reader);
        const historyItemRef = historyProvider?.historyItemRef.read(reader);
        return historyItemRef !== void 0 ? true : void 0;
      });
      await waitForState(firstRepositoryInitialized);
      await this._progressService.withProgress({ location: this.id }, async () => {
        await this._treeOperationSequencer.queue(async () => {
          await this._tree.setInput(this._treeViewModel);
          this._tree.scrollTop = 0;
        });
      });
      this._visibilityDisposables.add(autorun((reader) => {
        this._treeViewModel.isViewModelEmpty.read(reader);
        this._onDidChangeViewWelcomeState.fire();
      }));
      this._visibilityDisposables.add(runOnChange(this._scmViewService.graphShowIncomingChangesConfig, async () => {
        await this.refresh();
      }));
      this._visibilityDisposables.add(runOnChange(this._scmViewService.graphShowOutgoingChangesConfig, async () => {
        await this.refresh();
      }));
      let isFirstRun = true;
      this._visibilityDisposables.add(autorun((reader) => {
        const repository = this._treeViewModel.repository.read(reader);
        const historyProvider = repository?.provider.historyProvider.read(reader);
        if (!repository || !historyProvider) {
          return;
        }
        const historyItemRefId = derived((reader2) => {
          return historyProvider.historyItemRef.read(reader2)?.id;
        });
        reader.store.add(runOnChange(historyItemRefId, async (historyItemRefIdValue) => {
          await this.refresh();
          this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefIdValue));
        }));
        reader.store.add(runOnChange(historyProvider.historyItemRefChanges, (changes) => {
          if (changes.silent) {
            if (this._tree.scrollTop === 0) {
              this.refresh();
              return;
            }
            this._repositoryOutdated.set(true, void 0);
            return;
          }
          this.refresh();
        }));
        reader.store.add(runOnChange(this._treeViewModel.onDidChangeHistoryItemsFilter, async () => {
          await this.refresh();
          this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.read(void 0)));
        }));
        reader.store.add(autorun((reader2) => {
          this._scmCurrentHistoryItemRefHasRemote.set(!!historyProvider.historyItemRemoteRef.read(reader2));
        }));
        reader.store.add(autorun((reader2) => {
          this._scmCurrentHistoryItemRefHasBase.set(!!historyProvider.historyItemBaseRef.read(reader2));
        }));
        reader.store.add(runOnChange(this._treeViewModel.viewMode, async () => {
          await this._updateChildren();
        }));
        this._scmProviderCtx.set(repository.provider.providerId);
        this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.read(void 0)));
        if (!isFirstRun) {
          this.refresh();
        }
        isFirstRun = false;
      }));
      const fileIconThemeObs = observableFromEvent(
        this.themeService.onDidFileIconThemeChange,
        () => this.themeService.getFileIconTheme()
      );
      this._visibilityDisposables.add(autorun((reader) => {
        const fileIconTheme = fileIconThemeObs.read(reader);
        const viewMode = this._treeViewModel.viewMode.read(reader);
        this._updateIndentStyles(fileIconTheme, viewMode);
      }));
    }, this, this._store);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this._tree.layout(height, width);
  }
  getActionRunner() {
    return this._actionRunner;
  }
  getActionsContext() {
    return this._treeViewModel?.repository.get()?.provider;
  }
  createActionViewItem(action, options) {
    if (action.id === PICK_REPOSITORY_ACTION_ID) {
      const repository = this._treeViewModel?.repository.get();
      if (repository) {
        return new SCMRepositoryActionViewItem(repository, action, options);
      }
    } else if (action.id === PICK_HISTORY_ITEM_REFS_ACTION_ID) {
      const repository = this._treeViewModel?.repository.get();
      const historyItemsFilter = this._treeViewModel?.getHistoryItemsFilter();
      if (repository && historyItemsFilter) {
        return new SCMHistoryItemRefsActionViewItem(repository, historyItemsFilter, action, options);
      }
    }
    return super.createActionViewItem(action, options);
  }
  focus() {
    super.focus();
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    this._tree.focusFirst(fakeKeyboardEvent);
    this._tree.domFocus();
  }
  shouldShowWelcome() {
    return this._treeViewModel?.isViewModelEmpty.get() === true;
  }
  async refresh() {
    return this._refreshThrottler.queue((token) => this._refresh(token));
  }
  async _refresh(token) {
    if (token.isCancellationRequested) {
      return;
    }
    this._treeViewModel.clearRepositoryState();
    await this._updateChildren();
    if (token.isCancellationRequested) {
      return;
    }
    this.updateActions();
    this._repositoryOutdated.set(false, void 0);
    this._tree.scrollTop = 0;
  }
  async pickRepository() {
    const picker = this._instantiationService.createInstance(RepositoryPicker);
    const result = await picker.pickRepository();
    if (result) {
      this._treeViewModel.setRepository(result.repository);
    }
  }
  async pickHistoryItemRef() {
    const repository = this._treeViewModel.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemsFilter = this._treeViewModel.getHistoryItemsFilter();
    if (!historyProvider || !historyItemsFilter) {
      return;
    }
    const picker = this._instantiationService.createInstance(HistoryItemRefPicker, historyProvider, historyItemsFilter);
    const result = await picker.pickHistoryItemRef();
    if (result) {
      this._treeViewModel.setHistoryItemsFilter(result);
    }
  }
  async revealCurrentHistoryItem() {
    const repository = this._treeViewModel.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    if (!repository || !historyItemRef?.id || !historyItemRef?.revision) {
      return;
    }
    if (!this._isCurrentHistoryItemInFilter(historyItemRef.id)) {
      return;
    }
    const revealTreeNode = () => {
      const historyItemTreeElement = this._treeViewModel.getCurrentHistoryItemTreeElement();
      if (historyItemTreeElement && this._tree.hasNode(historyItemTreeElement)) {
        this._tree.reveal(historyItemTreeElement, 0.5);
        this._tree.setSelection([historyItemTreeElement]);
        this._tree.setFocus([historyItemTreeElement]);
        return true;
      }
      return false;
    };
    if (revealTreeNode()) {
      return;
    }
    await this._loadMore(historyItemRef.revision);
    revealTreeNode();
  }
  setViewMode(viewMode) {
    this._treeViewModel.setViewMode(viewMode);
  }
  _createTree(container) {
    this._treeIdentityProvider = new SCMHistoryTreeIdentityProvider();
    const resourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this._register(resourceLabels);
    this._treeDataSource = this.instantiationService.createInstance(SCMHistoryTreeDataSource, () => this._treeViewModel.viewMode.get());
    this._register(this._treeDataSource);
    const compressionEnabled = observableConfigValue("scm.compactFolders", true, this.configurationService);
    this._tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SCM History Tree",
      container,
      new ListDelegate(),
      new SCMHistoryTreeCompressionDelegate(),
      [
        this.instantiationService.createInstance(HistoryItemRenderer, this.viewDescriptorService.getViewLocationById(this.id)),
        this.instantiationService.createInstance(HistoryItemChangeRenderer, () => this._treeViewModel.viewMode.get(), resourceLabels),
        this.instantiationService.createInstance(HistoryItemLoadMoreRenderer, this._repositoryIsLoadingMore, () => this._loadMore())
      ],
      this._treeDataSource,
      {
        accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
        identityProvider: this._treeIdentityProvider,
        collapseByDefault: (e) => !isSCMHistoryItemChangeNode(e),
        compressionEnabled: compressionEnabled.get(),
        dnd: new SCMHistoryTreeDragAndDrop(),
        keyboardNavigationLabelProvider: new SCMHistoryTreeKeyboardNavigationLabelProvider(),
        horizontalScrolling: false,
        multipleSelectionSupport: false,
        twistieAdditionalCssClass: (e) => {
          return isSCMHistoryItemViewModelTreeElement(e) || isSCMHistoryItemLoadMoreTreeElement(e) ? "force-no-twistie" : void 0;
        }
      }
    );
    this._register(this._tree);
    this._tree.onDidOpen(this._onDidOpen, this, this._store);
    this._tree.onContextMenu(this._onContextMenu, this, this._store);
  }
  _isCurrentHistoryItemInFilter(historyItemRefId) {
    if (!historyItemRefId) {
      return false;
    }
    const historyItemFilter = this._treeViewModel.getHistoryItemsFilter();
    if (historyItemFilter === "all" || historyItemFilter === "auto") {
      return true;
    }
    return Array.isArray(historyItemFilter) && !!historyItemFilter.find((ref) => ref.id === historyItemRefId);
  }
  async _onDidOpen(e) {
    if (!e.element) {
      return;
    } else if (isSCMHistoryItemChangeViewModelTreeElement(e.element)) {
      const historyItemChange = e.element.historyItemChange;
      const historyItem = e.element.historyItemViewModel.historyItem;
      const historyItemDisplayId = historyItem.id === SCMIncomingHistoryItemId ? localize("incomingChanges", "Incoming Changes") : historyItem.id === SCMOutgoingHistoryItemId ? localize("outgoingChanges", "Outgoing Changes") : historyItem.displayId ?? historyItem.id;
      const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : void 0;
      const historyItemParentDisplayId = historyItemParentId && historyItem.displayId ? historyItemParentId.substring(0, historyItem.displayId.length) : historyItemParentId;
      if (historyItemChange.originalUri && historyItemChange.modifiedUri) {
        const originalUriTitle = `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`;
        const modifiedUriTitle = `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`;
        const title = `${originalUriTitle} \u2194 ${modifiedUriTitle}`;
        await this._editorService.openEditor({
          label: title,
          original: { resource: historyItemChange.originalUri },
          modified: { resource: historyItemChange.modifiedUri },
          options: e.editorOptions
        });
      } else if (historyItemChange.modifiedUri) {
        await this._editorService.openEditor({
          label: `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`,
          resource: historyItemChange.modifiedUri,
          options: e.editorOptions
        });
      } else if (historyItemChange.originalUri) {
        await this._editorService.openEditor({
          label: `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`,
          resource: historyItemChange.originalUri,
          options: e.editorOptions
        });
      }
    } else if (isSCMHistoryItemLoadMoreTreeElement(e.element)) {
      const pageOnScroll = this.configurationService.getValue("scm.graph.pageOnScroll") === true;
      if (!pageOnScroll) {
        this._loadMore();
        this._tree.setSelection([]);
      }
    }
  }
  _onContextMenu(e) {
    const element = e.element;
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      if (element.historyItemViewModel.kind === "incoming-changes" || element.historyItemViewModel.kind === "outgoing-changes") {
        return;
      }
      this._contextMenuDisposables.value = new DisposableStore();
      const historyProvider = element.repository.provider.historyProvider.get();
      const historyItemRef = historyProvider?.historyItemRef.get();
      const historyItem = element.historyItemViewModel.historyItem;
      const historyItemRefMenuItems = MenuRegistry.getMenuItems(MenuId.SCMHistoryItemRefContext).filter((item) => isIMenuItem(item));
      if (historyItemRefMenuItems.length > 0 && element.historyItemViewModel.historyItem.references?.length) {
        const historyItemRefActions = /* @__PURE__ */ new Map();
        for (const ref of element.historyItemViewModel.historyItem.references) {
          const contextKeyService2 = this.scopedContextKeyService.createOverlay([
            ["scmHistoryItemRef", ref.id]
          ]);
          const menuActions2 = this._menuService.getMenuActions(
            MenuId.SCMHistoryItemRefContext,
            contextKeyService2
          );
          for (const action of menuActions2.flatMap((a) => a[1])) {
            if (!historyItemRefActions.has(action.id)) {
              historyItemRefActions.set(action.id, []);
            }
            historyItemRefActions.get(action.id).push(ref);
          }
        }
        for (const historyItemRefMenuItem of historyItemRefMenuItems) {
          const actionId = historyItemRefMenuItem.command.id;
          if (!historyItemRefActions.has(actionId)) {
            continue;
          }
          this._contextMenuDisposables.value.add(MenuRegistry.appendMenuItem(MenuId.SCMHistoryItemContext, {
            title: historyItemRefMenuItem.command.title,
            submenu: MenuId.for(actionId),
            group: historyItemRefMenuItem?.group,
            order: historyItemRefMenuItem?.order
          }));
          for (const historyItemRef2 of historyItemRefActions.get(actionId) ?? []) {
            this._contextMenuDisposables.value.add(registerAction2(class extends Action2 {
              constructor() {
                super({
                  id: `${actionId}.${historyItemRef2.id}`,
                  title: historyItemRef2.name,
                  menu: {
                    id: MenuId.for(actionId),
                    group: historyItemRef2.category
                  }
                });
              }
              run(accessor, ...args) {
                const commandService = accessor.get(ICommandService);
                commandService.executeCommand(actionId, ...args, historyItemRef2.id);
              }
            }));
          }
        }
      }
      const contextKeyService = this.scopedContextKeyService.createOverlay([
        ["scmHistoryItemHasCurrentHistoryItemRef", historyItem.references?.find((ref) => ref.id === historyItemRef?.id) !== void 0]
      ]);
      const menuActions = this._menuService.getMenuActions(
        MenuId.SCMHistoryItemContext,
        contextKeyService,
        {
          arg: element.repository.provider,
          shouldForwardArgs: true
        }
      ).filter((group) => group[0] !== "inline");
      this.contextMenuService.showContextMenu({
        contextKeyService: this.scopedContextKeyService,
        getAnchor: () => e.anchor,
        getActions: () => getFlatContextMenuActions(menuActions),
        getActionsContext: () => element.historyItemViewModel.historyItem
      });
    } else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
      const menuActions = this._menuService.getMenuActions(
        MenuId.SCMHistoryItemChangeContext,
        this.scopedContextKeyService,
        {
          arg: element.historyItemViewModel.historyItem,
          shouldForwardArgs: true
        }
      ).filter((group) => group[0] !== "inline");
      this.contextMenuService.showContextMenu({
        contextKeyService: this.scopedContextKeyService,
        getAnchor: () => e.anchor,
        getActions: () => getFlatContextMenuActions(menuActions),
        getActionsContext: () => element.historyItemChange
      });
    }
  }
  async _loadMore(cursor) {
    return this._treeLoadMoreSequencer.queue(async () => {
      if (this._repositoryIsLoadingMore.get()) {
        return;
      }
      this._repositoryIsLoadingMore.set(true, void 0);
      this._treeViewModel.loadMore(cursor);
      await this._updateChildren();
      this._repositoryIsLoadingMore.set(false, void 0);
    });
  }
  _updateChildren() {
    return this._updateChildrenThrottler.queue(
      () => this._treeOperationSequencer.queue(
        async () => {
          await this._progressService.withProgress(
            { location: this.id, delay: 100 },
            async () => {
              await this._tree.updateChildren(void 0, void 0, void 0, {
                // diffIdentityProvider: this._treeIdentityProvider
              });
            }
          );
        }
      )
    );
  }
  _updateIndentStyles(theme, viewMode) {
    this._treeContainer.classList.toggle("list-view-mode", viewMode === ViewMode.List);
    this._treeContainer.classList.toggle("tree-view-mode", viewMode === ViewMode.Tree);
    this._treeContainer.classList.toggle("align-icons-and-twisties", viewMode === ViewMode.List && theme.hasFileIcons || theme.hasFileIcons && !theme.hasFolderIcons);
    this._treeContainer.classList.toggle("hide-arrows", viewMode === ViewMode.Tree && theme.hidesExplorerArrows === true);
  }
  dispose() {
    this._contextMenuDisposables.dispose();
    this._visibilityDisposables.dispose();
    super.dispose();
  }
};
SCMHistoryViewPane = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, ISCMViewService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService)
], SCMHistoryViewPane);
export {
  SCMHistoryViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtSGlzdG9yeVZpZXdQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3NjbS5jc3MnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBoLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSwgSURlbGF5ZWRIb3Zlck9wdGlvbnMsIElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBMYWJlbEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVNvdXJjZSwgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZURyYWdBbmREcm9wLCBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzLCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMsIEZ1enp5U2NvcmUsIElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB3YWl0Rm9yU3RhdGUsIGNvbnN0T2JzZXJ2YWJsZSwgbGF0ZXN0Q2hhbmdlZFZhbHVlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBydW5PbkNoYW5nZSwgb2JzZXJ2YWJsZVNpZ25hbCwgSVNldHRhYmxlT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJT3BlbkV2ZW50LCBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgQ29sb3JJZGVudGlmaWVyLCBmb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUZpbGVJY29uVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIFZpZXdBY3Rpb24sIFZpZXdQYW5lLCBWaWV3UGFuZVNob3dBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgcmVuZGVyU0NNSGlzdG9yeUl0ZW1HcmFwaCwgdG9JU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxBcnJheSwgU1dJTUxBTkVfV0lEVEgsIHJlbmRlclNDTUhpc3RvcnlHcmFwaFBsYWNlaG9sZGVyLCBoaXN0b3J5SXRlbUhvdmVyTGFiZWxGb3JlZ3JvdW5kLCBoaXN0b3J5SXRlbUhvdmVyRGVmYXVsdExhYmVsQmFja2dyb3VuZCwgZ2V0SGlzdG9yeUl0ZW1JbmRleCwgdG9IaXN0b3J5SXRlbUhvdmVyQ29udGVudCB9IGZyb20gJy4vc2NtSGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBnZXRIaXN0b3J5SXRlbUVkaXRvclRpdGxlLCBnZXRQcm92aWRlcktleSwgaXNTQ01IaXN0b3J5SXRlbUNoYW5nZU5vZGUsIGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgaXNTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQsIGlzU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudCwgaXNTQ01SZXBvc2l0b3J5IH0gZnJvbSAnLi91dGlsLmpzJztcbmltcG9ydCB7IElTQ01IaXN0b3J5SXRlbSwgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlLCBJU0NNSGlzdG9yeUl0ZW1HcmFwaE5vZGUsIElTQ01IaXN0b3J5SXRlbVJlZiwgSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsLCBJU0NNSGlzdG9yeVByb3ZpZGVyLCBTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50LCBTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQsIFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQsIFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCwgU0NNT3V0Z29pbmdIaXN0b3J5SXRlbUlkIH0gZnJvbSAnLi4vY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSElTVE9SWV9WSUVXX1BBTkVfSUQsIElTQ01Qcm92aWRlciwgSVNDTVJlcG9zaXRvcnksIElTQ01TZXJ2aWNlLCBJU0NNVmlld1NlcnZpY2UsIFZpZXdNb2RlIH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgc3RyaXBJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudVNlcnZpY2UsIGlzSU1lbnVJdGVtLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIElBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGRlbHRhLCBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlzIH0gZnJvbSAnLi9zY21WaWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZ3JvdXBCeSBhcyBncm91cEJ5MiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMsIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjbUhpc3RvcnlJdGVtUmVzb2x2ZXIgfSBmcm9tICcuLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9zY21NdWx0aURpZmZTb3VyY2VSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VOb2RlLCBSZXNvdXJjZVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZVRyZWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzaWJsZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEsIExpc3RWaWV3VGFyZ2V0U2VjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgQ29kZURhdGFUcmFuc2ZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgU0NNSGlzdG9yeUl0ZW1UcmFuc2ZlckRhdGEgfSBmcm9tICcuL3NjbUhpc3RvcnlDaGF0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5cbmNvbnN0IFBJQ0tfUkVQT1NJVE9SWV9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGgucGlja1JlcG9zaXRvcnknO1xuY29uc3QgUElDS19ISVNUT1JZX0lURU1fUkVGU19BQ1RJT05fSUQgPSAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGgucGlja0hpc3RvcnlJdGVtUmVmcyc7XG5cbnR5cGUgVHJlZUVsZW1lbnQgPSBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50IHwgU0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50IHwgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD47XG5cbmNsYXNzIFNDTVJlcG9zaXRvcnlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnksIGFjdGlvbjogSUFjdGlvbiwgb3B0aW9ucz86IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMubGFiZWwgJiYgdGhpcy5sYWJlbCkge1xuXHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdzY20tZ3JhcGgtcmVwb3NpdG9yeS1waWNrZXInKTtcblxuXHRcdFx0Y29uc3QgaWNvbiA9ICQoJy5pY29uJyk7XG5cdFx0XHRjb25zdCBpY29uQ2xhc3NOYW1lQXJyYXkgPSBUaGVtZUljb24uaXNUaGVtZUljb24odGhpcy5fcmVwb3NpdG9yeS5wcm92aWRlci5pY29uUGF0aClcblx0XHRcdFx0PyBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheSh0aGlzLl9yZXBvc2l0b3J5LnByb3ZpZGVyLmljb25QYXRoKVxuXHRcdFx0XHQ6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ucmVwbyk7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uaWNvbkNsYXNzTmFtZUFycmF5KTtcblxuXHRcdFx0Y29uc3QgbmFtZSA9ICQoJy5uYW1lJyk7XG5cdFx0XHRuYW1lLnRleHRDb250ZW50ID0gdGhpcy5fcmVwb3NpdG9yeS5wcm92aWRlci5uYW1lO1xuXG5cblx0XHRcdHJlc2V0KHRoaXMubGFiZWwsIGljb24sIG5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcnkucHJvdmlkZXIubmFtZTtcblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5SXRlbVJlZnNBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeUl0ZW1zRmlsdGVyOiAnYWxsJyB8ICdhdXRvJyB8IElTQ01IaXN0b3J5SXRlbVJlZltdLFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zPzogSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMubGFiZWwgJiYgdGhpcy5sYWJlbCkge1xuXHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdzY20tZ3JhcGgtaGlzdG9yeS1pdGVtLXBpY2tlcicpO1xuXG5cdFx0XHRjb25zdCBpY29uID0gJCgnLmljb24nKTtcblx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmdpdEJyYW5jaCkpO1xuXG5cdFx0XHRjb25zdCBuYW1lID0gJCgnLm5hbWUnKTtcblx0XHRcdGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIgPT09ICdhbGwnKSB7XG5cdFx0XHRcdG5hbWUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWxsJywgXCJBbGxcIik7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2hpc3RvcnlJdGVtc0ZpbHRlciA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdG5hbWUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYXV0bycsIFwiQXV0b1wiKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRuYW1lLnRleHRDb250ZW50ID0gdGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyWzBdLm5hbWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuYW1lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2l0ZW1zJywgXCJ7MH0gSXRlbXNcIiwgdGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyLmxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc2V0KHRoaXMubGFiZWwsIGljb24sIG5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2hpc3RvcnlJdGVtc0ZpbHRlciA9PT0gJ2FsbCcpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWxsSGlzdG9yeUl0ZW1SZWZzJywgXCJBbGwgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZXNcIik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIgPT09ICdhdXRvJykge1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gdGhpcy5fcmVwb3NpdG9yeS5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZWYuZ2V0KCk/Lm5hbWUsXG5cdFx0XHRcdGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCk/Lm5hbWUsXG5cdFx0XHRcdGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1CYXNlUmVmLmdldCgpPy5uYW1lXG5cdFx0XHRdLmZpbHRlcihyZWYgPT4gISFyZWYpLmpvaW4oJywgJyk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyWzBdLm5hbWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIubWFwKHJlZiA9PiByZWYubmFtZSkuam9pbignLCAnKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01IaXN0b3J5Vmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFBJQ0tfUkVQT1NJVE9SWV9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlcG9zaXRvcnlQaWNrZXInLCBcIlJlcG9zaXRvcnkgUGlja2VyXCIpLFxuXHRcdFx0dmlld0lkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ3NjbS5wcm92aWRlckNvdW50JyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZ3JlYXRlcignc2NtLnByb3ZpZGVyQ291bnQnLCAxKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5zY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUnLCAnbXVsdGlwbGUnKSksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNSGlzdG9yeVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5waWNrUmVwb3NpdG9yeSgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01IaXN0b3J5Vmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFBJQ0tfSElTVE9SWV9JVEVNX1JFRlNfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZWZlcmVuY2VQaWNrZXInLCBcIkhpc3RvcnkgSXRlbSBSZWZlcmVuY2UgUGlja2VyXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5naXRCcmFuY2gsXG5cdFx0XHR2aWV3SWQ6IEhJU1RPUllfVklFV19QQU5FX0lELFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5cy5TQ01IaXN0b3J5SXRlbUNvdW50Lm5vdEVxdWFsc1RvKDApLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01IaXN0b3J5Vmlld1BhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR2aWV3LnBpY2tIaXN0b3J5SXRlbVJlZigpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01IaXN0b3J5Vmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5ncmFwaC5yZXZlYWxDdXJyZW50SGlzdG9yeUl0ZW0nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnb1RvQ3VycmVudEhpc3RvcnlJdGVtJywgXCJHbyB0byBDdXJyZW50IEhpc3RvcnkgSXRlbVwiKSxcblx0XHRcdGljb246IENvZGljb24udGFyZ2V0LFxuXHRcdFx0dmlld0lkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5cy5TQ01IaXN0b3J5SXRlbUNvdW50Lm5vdEVxdWFsc1RvKDApLFxuXHRcdFx0XHRDb250ZXh0S2V5cy5TQ01DdXJyZW50SGlzdG9yeUl0ZW1SZWZJbkZpbHRlci5pc0VxdWFsVG8odHJ1ZSkpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01IaXN0b3J5Vmlld1BhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR2aWV3LnJldmVhbEN1cnJlbnRIaXN0b3J5SXRlbSgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01IaXN0b3J5Vmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5ncmFwaC5yZWZyZXNoJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVmcmVzaEdyYXBoJywgXCJSZWZyZXNoXCIpLFxuXHRcdFx0dmlld0lkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMDAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNSGlzdG9yeVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5yZWZyZXNoKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPFNDTUhpc3RvcnlWaWV3UGFuZT4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmdyYXBoLnNldExpc3RWaWV3TW9kZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldExpc3RWaWV3TW9kZScsIFwiVmlldyBhcyBMaXN0XCIpLFxuXHRcdFx0dmlld0lkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlzLlNDTUhpc3RvcnlWaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuTGlzdCksXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51SWQuU0NNSGlzdG9yeVRpdGxlLCBncm91cDogJzlfdmlld21vZGUnLCBvcmRlcjogMSB9LFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNSGlzdG9yeVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5zZXRWaWV3TW9kZShWaWV3TW9kZS5MaXN0KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248U0NNSGlzdG9yeVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGguc2V0VHJlZVZpZXdNb2RlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2V0VHJlZVZpZXdNb2RlJywgXCJWaWV3IGFzIFRyZWVcIiksXG5cdFx0XHR2aWV3SWQ6IEhJU1RPUllfVklFV19QQU5FX0lELFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleXMuU0NNSGlzdG9yeVZpZXdNb2RlLmlzRXF1YWxUbyhWaWV3TW9kZS5UcmVlKSxcblx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVJZC5TQ01IaXN0b3J5VGl0bGUsIGdyb3VwOiAnOV92aWV3bW9kZScsIG9yZGVyOiAyIH0sXG5cdFx0XHRmMTogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01IaXN0b3J5Vmlld1BhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR2aWV3LnNldFZpZXdNb2RlKFZpZXdNb2RlLlRyZWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGgudmlld0NoYW5nZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdvcGVuQ2hhbmdlcycsIFwiT3BlbiBDaGFuZ2VzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kaWZmTXVsdGlwbGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlJdGVtQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ2lubGluZScsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeUl0ZW1Db250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnMF92aWV3Jyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHByb3ZpZGVyOiBJU0NNUHJvdmlkZXIsIC4uLmhpc3RvcnlJdGVtczogSVNDTUhpc3RvcnlJdGVtW10pIHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZWYuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpO1xuXG5cdFx0aWYgKCFwcm92aWRlciB8fCAhaGlzdG9yeVByb3ZpZGVyIHx8ICFoaXN0b3J5SXRlbVJlZiB8fCBoaXN0b3J5SXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBoaXN0b3J5SXRlbXNbMF07XG5cdFx0bGV0IHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGhpc3RvcnlJdGVtSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaGlzdG9yeUl0ZW1QYXJlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGhpc3RvcnlJdGVtUmVtb3RlUmVmICYmIChoaXN0b3J5SXRlbS5pZCA9PT0gU0NNSW5jb21pbmdIaXN0b3J5SXRlbUlkIHx8IGhpc3RvcnlJdGVtLmlkID09PSBTQ01PdXRnb2luZ0hpc3RvcnlJdGVtSWQpKSB7XG5cdFx0XHQvLyBJbmNvbWluZy9PdXRnb2luZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbVxuXHRcdFx0Y29uc3QgbWVyZ2VCYXNlID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyLnJlc29sdmVIaXN0b3J5SXRlbVJlZnNDb21tb25BbmNlc3RvcihbXG5cdFx0XHRcdGhpc3RvcnlJdGVtUmVmLm5hbWUsXG5cdFx0XHRcdGhpc3RvcnlJdGVtUmVtb3RlUmVmLm5hbWVcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAobWVyZ2VCYXNlICYmIGhpc3RvcnlJdGVtLmlkID09PSBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRcdFx0Ly8gSW5jb21pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW1cblx0XHRcdFx0dGl0bGUgPSBgJHtoaXN0b3J5SXRlbS5zdWJqZWN0fSAtICR7aGlzdG9yeUl0ZW1SZWYubmFtZX0gXFx1MjE5NCAke2hpc3RvcnlJdGVtUmVtb3RlUmVmLm5hbWV9YDtcblx0XHRcdFx0aGlzdG9yeUl0ZW1JZCA9IGhpc3RvcnlJdGVtUmVtb3RlUmVmLmlkO1xuXHRcdFx0XHRoaXN0b3J5SXRlbVBhcmVudElkID0gbWVyZ2VCYXNlO1xuXHRcdFx0fSBlbHNlIGlmIChtZXJnZUJhc2UgJiYgaGlzdG9yeUl0ZW0uaWQgPT09IFNDTU91dGdvaW5nSGlzdG9yeUl0ZW1JZCkge1xuXHRcdFx0XHQvLyBPdXRnb2luZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbVxuXHRcdFx0XHR0aXRsZSA9IGAke2hpc3RvcnlJdGVtLnN1YmplY3R9IC0gJHtoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lfSBcXHUyMTk0ICR7aGlzdG9yeUl0ZW1SZWYubmFtZX1gO1xuXHRcdFx0XHRoaXN0b3J5SXRlbUlkID0gaGlzdG9yeUl0ZW1SZWYuaWQ7XG5cdFx0XHRcdGhpc3RvcnlJdGVtUGFyZW50SWQgPSBtZXJnZUJhc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRpdGxlID0gZ2V0SGlzdG9yeUl0ZW1FZGl0b3JUaXRsZShoaXN0b3J5SXRlbSk7XG5cdFx0XHRoaXN0b3J5SXRlbUlkID0gaGlzdG9yeUl0ZW0uaWQ7XG5cblx0XHRcdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyBIaXN0b3J5IGl0ZW0gcmlnaHQgYWJvdmUgdGhlIGluY29taW5nIGNoYW5nZXMgaGlzdG9yeSBpdGVtXG5cdFx0XHRcdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHNbMF0gPT09IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCAmJiBoaXN0b3J5SXRlbVJlbW90ZVJlZikge1xuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUGFyZW50SWQgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtUmVmc0NvbW1vbkFuY2VzdG9yKFtcblx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVmLm5hbWUsXG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1QYXJlbnRJZCA9IGhpc3RvcnlJdGVtLnBhcmVudElkc1swXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGl0bGUgfHwgIWhpc3RvcnlJdGVtSWQgfHwgIWhpc3RvcnlJdGVtUGFyZW50SWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtdWx0aURpZmZTb3VyY2VVcmkgPSBTY21IaXN0b3J5SXRlbVJlc29sdmVyLmdldE11bHRpRGlmZlNvdXJjZVVyaShwcm92aWRlciwgaGlzdG9yeUl0ZW1JZCwgaGlzdG9yeUl0ZW1QYXJlbnRJZCwgJycpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfd29ya2JlbmNoLm9wZW5NdWx0aURpZmZFZGl0b3InLCB7IHRpdGxlLCBtdWx0aURpZmZTb3VyY2VVcmkgfSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5ncmFwaC5vcGVuRmlsZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ29wZW5GaWxlJywgXCJPcGVuIEZpbGVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNoYW5nZUNvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlJdGVtQ2hhbmdlQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzBfdmlldycsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoaXN0b3J5SXRlbTogSVNDTUhpc3RvcnlJdGVtLCBoaXN0b3J5SXRlbUNoYW5nZTogSVNDTUhpc3RvcnlJdGVtQ2hhbmdlKSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRpZiAoIWhpc3RvcnlJdGVtIHx8ICFoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB2ZXJzaW9uOiBzdHJpbmc7XG5cdFx0aWYgKGhpc3RvcnlJdGVtLmlkID09PSBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRcdHZlcnNpb24gPSBsb2NhbGl6ZSgnaW5jb21pbmdDaGFuZ2VzJywgXCJJbmNvbWluZyBDaGFuZ2VzXCIpO1xuXHRcdH0gZWxzZSBpZiAoaGlzdG9yeUl0ZW0uaWQgPT09IFNDTU91dGdvaW5nSGlzdG9yeUl0ZW1JZCkge1xuXHRcdFx0dmVyc2lvbiA9IGxvY2FsaXplKCdvdXRnb2luZ0NoYW5nZXMnLCBcIk91dGdvaW5nIENoYW5nZXNcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZlcnNpb24gPSBoaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gaGlzdG9yeUl0ZW0uaWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lKGhpc3RvcnlJdGVtQ2hhbmdlLm1vZGlmaWVkVXJpLmZzUGF0aCk7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGhpc3RvcnlJdGVtQ2hhbmdlLm1vZGlmaWVkVXJpLCBsYWJlbDogYCR7bmFtZX0gKCR7dmVyc2lvbn0pYCB9KTtcblx0fVxufSk7XG5cbmNsYXNzIExpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFRyZWVFbGVtZW50PiB7XG5cblx0Z2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEhpc3RvcnlJdGVtUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkgfHwgaXNTQ01IaXN0b3J5SXRlbUNoYW5nZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBIaXN0b3J5SXRlbUNoYW5nZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBIaXN0b3J5SXRlbUxvYWRNb3JlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbGVtZW50Jyk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBIaXN0b3J5SXRlbVRlbXBsYXRlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBJY29uTGFiZWw7XG5cdHJlYWRvbmx5IGdyYXBoQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBsYWJlbENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIEhpc3RvcnlJdGVtUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQsIExhYmVsRnV6enlTY29yZSwgSGlzdG9yeUl0ZW1UZW1wbGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdoaXN0b3J5LWl0ZW0nO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gSGlzdG9yeUl0ZW1SZW5kZXJlci5URU1QTEFURV9JRDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhZGdlc0NvbmZpZzogSU9ic2VydmFibGU8J2FsbCcgfCAnZmlsdGVyJz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfCBudWxsLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2JhZGdlc0NvbmZpZyA9IG9ic2VydmFibGVDb25maWdWYWx1ZTwnYWxsJyB8ICdmaWx0ZXInPignc2NtLmdyYXBoLmJhZGdlcycsICdmaWx0ZXInLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSGlzdG9yeUl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5oaXN0b3J5LWl0ZW0nKSk7XG5cdFx0Y29uc3QgZ3JhcGhDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmdyYXBoLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBpY29uTGFiZWwgPSBuZXcgSWNvbkxhYmVsKGVsZW1lbnQsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSwgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnREZXNjcmlwdGlvbkhpZ2hsaWdodHM6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxhYmVsQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5sYWJlbC1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBXb3JrYmVuY2hUb29sQmFyKGFjdGlvbnNDb250YWluZXIsIHVuZGVmaW5lZCwgdGhpcy5fbWVudVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb21tYW5kU2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRyZXR1cm4geyBlbGVtZW50LCBncmFwaENvbnRhaW5lciwgbGFiZWw6IGljb25MYWJlbCwgbGFiZWxDb250YWluZXIsIGFjdGlvbkJhciwgZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksIGRpc3Bvc2FibGVzOiBjb21iaW5lZERpc3Bvc2FibGUoaWNvbkxhYmVsLCBhY3Rpb25CYXIpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50LCBMYWJlbEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5vZGUuZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtVmlld01vZGVsID0gbm9kZS5lbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cblx0XHRjb25zdCB7IGNvbnRlbnQsIGRpc3Bvc2FibGVzIH0gPSB0b0hpc3RvcnlJdGVtSG92ZXJDb250ZW50KHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBoaXN0b3J5SXRlbSwgdHJ1ZSk7XG5cdFx0Y29uc3QgeyBob3Zlck9wdGlvbnMsIGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyB9ID0gdGhpcy5fZ2V0SG92ZXJPcHRpb25zKCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1Ib3ZlciA9IHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZURhdGEuZWxlbWVudCwgeyAuLi5ob3Zlck9wdGlvbnMsIGNvbnRlbnQgfSwgaG92ZXJMaWZlY3ljbGVPcHRpb25zKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChoaXN0b3J5SXRlbUhvdmVyKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlcyk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhDb250YWluZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY3VycmVudCcsIGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdIRUFEJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2luY29taW5nLWNoYW5nZXMnLCBoaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kID09PSAnaW5jb21pbmctY2hhbmdlcycpO1xuXHRcdHRlbXBsYXRlRGF0YS5ncmFwaENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdXRnb2luZy1jaGFuZ2VzJywgaGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ291dGdvaW5nLWNoYW5nZXMnKTtcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyU0NNSGlzdG9yeUl0ZW1HcmFwaChoaXN0b3J5SXRlbVZpZXdNb2RlbCkpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBwcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk/Lmhpc3RvcnlJdGVtUmVmPy5nZXQoKTtcblx0XHRjb25zdCBleHRyYUNsYXNzZXMgPSBoaXN0b3J5SXRlbVJlZj8ucmV2aXNpb24gPT09IGhpc3RvcnlJdGVtLmlkID8gWydoaXN0b3J5LWl0ZW0tY3VycmVudCddIDogW107XG5cdFx0Y29uc3QgW21hdGNoZXMsIGRlc2NyaXB0aW9uTWF0Y2hlc10gPSB0aGlzLl9wcm9jZXNzTWF0Y2hlcyhoaXN0b3J5SXRlbVZpZXdNb2RlbCwgbm9kZS5maWx0ZXJEYXRhKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwoaGlzdG9yeUl0ZW0uc3ViamVjdCwgaGlzdG9yeUl0ZW0uYXV0aG9yLCB7IG1hdGNoZXMsIGRlc2NyaXB0aW9uTWF0Y2hlcywgZXh0cmFDbGFzc2VzIH0pO1xuXG5cdFx0dGhpcy5fcmVuZGVyQmFkZ2VzKGhpc3RvcnlJdGVtLCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKFxuXHRcdFx0TWVudUlkLlNDTUhpc3RvcnlJdGVtQ29udGV4dCxcblx0XHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0eyBhcmc6IHByb3ZpZGVyLCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBoaXN0b3J5SXRlbTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoZ2V0QWN0aW9uQmFyQWN0aW9ucyhhY3Rpb25zLCAnaW5saW5lJykucHJpbWFyeSk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD4sIExhYmVsRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSGlzdG9yeUl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlJyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJCYWRnZXMoaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbSwgdGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGFiZWxDb25maWcgPSB0aGlzLl9iYWRnZXNDb25maWcucmVhZChyZWFkZXIpO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWxDb250YWluZXIucmVwbGFjZUNoaWxkcmVuKCk7XG5cblx0XHRcdGNvbnN0IHJlZmVyZW5jZXMgPSBoaXN0b3J5SXRlbS5yZWZlcmVuY2VzID9cblx0XHRcdFx0aGlzdG9yeUl0ZW0ucmVmZXJlbmNlcy5zbGljZSgwKSA6IFtdO1xuXG5cdFx0XHQvLyBJZiB0aGUgZmlyc3QgcmVmZXJlbmNlIGlzIGNvbG9yZWQsIHdlIHJlbmRlciBpdFxuXHRcdFx0Ly8gc2VwYXJhdGVseSBzaW5jZSB3ZSBoYXZlIHRvIHNob3cgdGhlIGRlc2NyaXB0aW9uXG5cdFx0XHQvLyBmb3IgdGhlIGZpcnN0IGNvbG9yZWQgcmVmZXJlbmNlLlxuXHRcdFx0aWYgKHJlZmVyZW5jZXMubGVuZ3RoID4gMCAmJiByZWZlcmVuY2VzWzBdLmNvbG9yKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckJhZGdlKFtyZWZlcmVuY2VzWzBdXSwgdHJ1ZSwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdFx0XHQvLyBSZW1vdmUgdGhlIHJlbmRlcmVkIHJlZmVyZW5jZSBmcm9tIHRoZSBjb2xsZWN0aW9uXG5cdFx0XHRcdHJlZmVyZW5jZXMuc3BsaWNlKDAsIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBHcm91cCBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlcyBieSBjb2xvclxuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWZzQnlDb2xvciA9IGdyb3VwQnkyKHJlZmVyZW5jZXMsIHJlZiA9PiByZWYuY29sb3IgPyByZWYuY29sb3IgOiAnJyk7XG5cblx0XHRcdGZvciAoY29uc3QgW2tleSwgaGlzdG9yeUl0ZW1SZWZzXSBvZiBPYmplY3QuZW50cmllcyhoaXN0b3J5SXRlbVJlZnNCeUNvbG9yKSkge1xuXHRcdFx0XHQvLyBJZiBuZWVkZWQgc2tpcCBiYWRnZXMgd2l0aG91dCBhIGNvbG9yXG5cdFx0XHRcdGlmIChrZXkgPT09ICcnICYmIGxhYmVsQ29uZmlnICE9PSAnYWxsJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFoaXN0b3J5SXRlbVJlZnMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdyb3VwIGhpc3RvcnkgaXRlbSByZWZlcmVuY2VzIGJ5IGljb25cblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWZCeUljb25JZCA9IGdyb3VwQnkyKGhpc3RvcnlJdGVtUmVmcywgcmVmID0+IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihyZWYuaWNvbikgPyByZWYuaWNvbi5pZCA6ICcnKTtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCBoaXN0b3J5SXRlbVJlZnNdIG9mIE9iamVjdC5lbnRyaWVzKGhpc3RvcnlJdGVtUmVmQnlJY29uSWQpKSB7XG5cdFx0XHRcdFx0Ly8gU2tpcCBiYWRnZXMgd2l0aG91dCBhbiBpY29uXG5cdFx0XHRcdFx0aWYgKGtleSA9PT0gJycgfHwgIWhpc3RvcnlJdGVtUmVmcykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyQmFkZ2UoaGlzdG9yeUl0ZW1SZWZzLCBmYWxzZSwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckJhZGdlKGhpc3RvcnlJdGVtUmVmczogSVNDTUhpc3RvcnlJdGVtUmVmW10sIHNob3dEZXNjcmlwdGlvbjogYm9vbGVhbiwgdGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKGhpc3RvcnlJdGVtUmVmcy5sZW5ndGggPT09IDAgfHwgIVRoZW1lSWNvbi5pc1RoZW1lSWNvbihoaXN0b3J5SXRlbVJlZnNbMF0uaWNvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IGgoJ2Rpdi5sYWJlbCcsIHtcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdGNvbG9yOiBoaXN0b3J5SXRlbVJlZnNbMF0uY29sb3IgPyBhc0Nzc1ZhcmlhYmxlKGhpc3RvcnlJdGVtSG92ZXJMYWJlbEZvcmVncm91bmQpIDogYXNDc3NWYXJpYWJsZShmb3JlZ3JvdW5kKSxcblx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBoaXN0b3J5SXRlbVJlZnNbMF0uY29sb3IgPyBhc0Nzc1ZhcmlhYmxlKGhpc3RvcnlJdGVtUmVmc1swXS5jb2xvcikgOiBhc0Nzc1ZhcmlhYmxlKGhpc3RvcnlJdGVtSG92ZXJEZWZhdWx0TGFiZWxCYWNrZ3JvdW5kKVxuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdGgoJ2Rpdi5jb3VudEBjb3VudCcsIHtcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRkaXNwbGF5OiBoaXN0b3J5SXRlbVJlZnMubGVuZ3RoID4gMSA/ICcnIDogJ25vbmUnXG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0aCgnZGl2Lmljb25AaWNvbicpLFxuXHRcdFx0aCgnZGl2LmRlc2NyaXB0aW9uQGRlc2NyaXB0aW9uJywge1xuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdGRpc3BsYXk6IHNob3dEZXNjcmlwdGlvbiA/ICcnIDogJ25vbmUnXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0XSk7XG5cblx0XHRlbGVtZW50cy5jb3VudC50ZXh0Q29udGVudCA9IGhpc3RvcnlJdGVtUmVmcy5sZW5ndGggPiAxID8gaGlzdG9yeUl0ZW1SZWZzLmxlbmd0aC50b1N0cmluZygpIDogJyc7XG5cdFx0ZWxlbWVudHMuaWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGhpc3RvcnlJdGVtUmVmc1swXS5pY29uKSk7XG5cdFx0ZWxlbWVudHMuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBzaG93RGVzY3JpcHRpb24gPyBoaXN0b3J5SXRlbVJlZnNbMF0ubmFtZSA6ICcnO1xuXG5cdFx0YXBwZW5kKHRlbXBsYXRlRGF0YS5sYWJlbENvbnRhaW5lciwgZWxlbWVudHMucm9vdCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIb3Zlck9wdGlvbnMoKToge1xuXHRcdGhvdmVyT3B0aW9uczogUGFydGlhbDxJRGVsYXllZEhvdmVyT3B0aW9ucz47XG5cdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zOiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHR9IHtcblx0XHQvLyBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3IGluIHRoZSBwYW5lbFxuXHRcdGlmICh0aGlzLl92aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aG92ZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0YWRkaXRpb25hbENsYXNzZXM6IFsnaGlzdG9yeS1pdGVtLWhvdmVyJ10sXG5cdFx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdFx0Y29tcGFjdDogdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uUklHSFRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLk1vdXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9uczogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRob3Zlck9wdGlvbnM6IHtcblx0XHRcdFx0YWRkaXRpb25hbENsYXNzZXM6IFsnaGlzdG9yeS1pdGVtLWhvdmVyJ10sXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHRcdHNob3dQb2ludGVyOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyXG5cdFx0XHR9LFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zOiB7XG5cdFx0XHRcdGdyb3VwSWQ6ICdzY20taGlzdG9yeS1pdGVtJ1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9wcm9jZXNzTWF0Y2hlcyhoaXN0b3J5SXRlbVZpZXdNb2RlbDogSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsLCBmaWx0ZXJEYXRhOiBMYWJlbEZ1enp5U2NvcmUgfCB1bmRlZmluZWQpOiBbSU1hdGNoW10gfCB1bmRlZmluZWQsIElNYXRjaFtdIHwgdW5kZWZpbmVkXSB7XG5cdFx0aWYgKCFmaWx0ZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm4gW3VuZGVmaW5lZCwgdW5kZWZpbmVkXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0aGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0ubWVzc2FnZSA9PT0gZmlsdGVyRGF0YS5sYWJlbCA/IGNyZWF0ZU1hdGNoZXMoZmlsdGVyRGF0YS5zY29yZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRoaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbS5hdXRob3IgPT09IGZpbHRlckRhdGEubGFiZWwgPyBjcmVhdGVNYXRjaGVzKGZpbHRlckRhdGEuc2NvcmUpIDogdW5kZWZpbmVkXG5cdFx0XTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50LCBMYWJlbEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSGlzdG9yeUl0ZW1DaGFuZ2VUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IHJvd0VsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZ3JhcGhQbGFjZWhvbGRlcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHJlc291cmNlTGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IFdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZTtcbn1cblxuY2xhc3MgSGlzdG9yeUl0ZW1DaGFuZ2VSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD4sIHZvaWQsIEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2hpc3RvcnktaXRlbS1jaGFuZ2UnO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gSGlzdG9yeUl0ZW1DaGFuZ2VSZW5kZXJlci5URU1QTEFURV9JRDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGU6ICgpID0+IFZpZXdNb2RlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSGlzdG9yeUl0ZW1DaGFuZ2VUZW1wbGF0ZSB7XG5cdFx0Y29uc3Qgcm93RWxlbWVudCA9IGNvbnRhaW5lci5wYXJlbnRFbGVtZW50ISBhcyBIVE1MRWxlbWVudDtcblx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmhpc3RvcnktaXRlbS1jaGFuZ2UnKSk7XG5cdFx0Y29uc3QgZ3JhcGhQbGFjZWhvbGRlciA9IGFwcGVuZChlbGVtZW50LCAkKCcuZ3JhcGgtcGxhY2Vob2xkZXInKSk7XG5cblx0XHRjb25zdCBsYWJlbENvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcubGFiZWwtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHJlc291cmNlTGFiZWwgPSB0aGlzLnJlc291cmNlTGFiZWxzLmNyZWF0ZShsYWJlbENvbnRhaW5lciwge1xuXHRcdFx0c3VwcG9ydERlc2NyaXB0aW9uSGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQocmVzb3VyY2VMYWJlbC5lbGVtZW50LCAkKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgV29ya2JlbmNoVG9vbEJhcihhY3Rpb25zQ29udGFpbmVyLCB1bmRlZmluZWQsIHRoaXMuX21lbnVTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb25CYXIpO1xuXG5cdFx0cmV0dXJuIHsgcm93RWxlbWVudCwgZWxlbWVudCwgZ3JhcGhQbGFjZWhvbGRlciwgcmVzb3VyY2VMYWJlbCwgYWN0aW9uQmFyLCBkaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50T3JOb2RlOiBJVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGUsIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1WaWV3TW9kZWwgPSBpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudE9yTm9kZS5lbGVtZW50KSA/IGVsZW1lbnRPck5vZGUuZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbCA6IGVsZW1lbnRPck5vZGUuZWxlbWVudC5jb250ZXh0Lmhpc3RvcnlJdGVtVmlld01vZGVsO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtQ2hhbmdlID0gaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnRPck5vZGUuZWxlbWVudCkgPyBlbGVtZW50T3JOb2RlLmVsZW1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2UgOiBlbGVtZW50T3JOb2RlLmVsZW1lbnQ7XG5cdFx0Y29uc3QgZ3JhcGhDb2x1bW5zID0gaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnRPck5vZGUuZWxlbWVudCkgPyBlbGVtZW50T3JOb2RlLmVsZW1lbnQuZ3JhcGhDb2x1bW5zIDogZWxlbWVudE9yTm9kZS5lbGVtZW50LmNvbnRleHQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwub3V0cHV0U3dpbWxhbmVzO1xuXG5cdFx0dGhpcy5fcmVuZGVyR3JhcGhQbGFjZWhvbGRlcih0ZW1wbGF0ZURhdGEsIGhpc3RvcnlJdGVtVmlld01vZGVsLCBncmFwaENvbHVtbnMpO1xuXG5cdFx0Y29uc3QgaGlkZVBhdGggPSB0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLlRyZWU7XG5cdFx0Y29uc3QgZmlsZUtpbmQgPSBpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudE9yTm9kZS5lbGVtZW50KSA/IEZpbGVLaW5kLkZJTEUgOiBGaWxlS2luZC5GT0xERVI7XG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0RmlsZShoaXN0b3J5SXRlbUNoYW5nZS51cmksIHsgZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogZmFsc2UsIGJhZGdlczogdHJ1ZSB9LCBmaWxlS2luZCwgaGlkZVBhdGggfSk7XG5cblx0XHRpZiAoZmlsZUtpbmQgPT09IEZpbGVLaW5kLkZJTEUpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhcblx0XHRcdFx0TWVudUlkLlNDTUhpc3RvcnlJdGVtQ2hhbmdlQ29udGV4dCxcblx0XHRcdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdHsgYXJnOiBoaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbSwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IGhpc3RvcnlJdGVtQ2hhbmdlO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKGdldEFjdGlvbkJhckFjdGlvbnMoYWN0aW9ucywgJ2lubGluZScpLnByaW1hcnkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50IHwgSVJlc291cmNlTm9kZTxTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50LCBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50Pj4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGUsIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZCA9IG5vZGUuZWxlbWVudCBhcyBJQ29tcHJlc3NlZFRyZWVOb2RlPElSZXNvdXJjZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD4+O1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtVmlld01vZGVsID0gY29tcHJlc3NlZC5lbGVtZW50c1swXS5jb250ZXh0Lmhpc3RvcnlJdGVtVmlld01vZGVsO1xuXHRcdGNvbnN0IGdyYXBoQ29sdW1ucyA9IGNvbXByZXNzZWQuZWxlbWVudHNbMF0uY29udGV4dC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5vdXRwdXRTd2ltbGFuZXM7XG5cblx0XHR0aGlzLl9yZW5kZXJHcmFwaFBsYWNlaG9sZGVyKHRlbXBsYXRlRGF0YSwgaGlzdG9yeUl0ZW1WaWV3TW9kZWwsIGdyYXBoQ29sdW1ucyk7XG5cblx0XHRjb25zdCBsYWJlbCA9IGNvbXByZXNzZWQuZWxlbWVudHMubWFwKGUgPT4gZS5uYW1lKTtcblx0XHRjb25zdCBmb2xkZXIgPSBjb21wcmVzc2VkLmVsZW1lbnRzW2NvbXByZXNzZWQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0UmVzb3VyY2UoeyByZXNvdXJjZTogZm9sZGVyLnVyaSwgbmFtZTogbGFiZWwgfSwge1xuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogZmFsc2UsIGJhZGdlczogdHJ1ZSB9LFxuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZPTERFUixcblx0XHRcdHNlcGFyYXRvcjogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcihmb2xkZXIudXJpLnNjaGVtZSlcblx0XHR9KTtcblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyR3JhcGhQbGFjZWhvbGRlcih0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGUsIGhpc3RvcnlJdGVtVmlld01vZGVsOiBJU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWwsIGdyYXBoQ29sdW1uczogSVNDTUhpc3RvcnlJdGVtR3JhcGhOb2RlW10pOiB2b2lkIHtcblx0XHRjb25zdCBncmFwaFBsYWNlaG9sZGVyU3ZnV2lkdGggPSBTV0lNTEFORV9XSURUSCAqIChncmFwaENvbHVtbnMubGVuZ3RoICsgMSk7XG5cdFx0Y29uc3QgbWFyZ2luTGVmdCA9IGdyYXBoUGxhY2Vob2xkZXJTdmdXaWR0aCAtIDE2IC8qIC5tb25hY28tdGwtaW5kZW50IGxlZnQgKi87XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0VsZW1lbnQuc3R5bGUubWFyZ2luTGVmdCA9IGAke21hcmdpbkxlZnR9cHhgO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoUGxhY2Vob2xkZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhQbGFjZWhvbGRlci5zdHlsZS5sZWZ0ID0gYCR7LTEgKiBtYXJnaW5MZWZ0fXB4YDtcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhQbGFjZWhvbGRlci5zdHlsZS53aWR0aCA9IGAke2dyYXBoUGxhY2Vob2xkZXJTdmdXaWR0aH1weGA7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoUGxhY2Vob2xkZXIuYXBwZW5kQ2hpbGQocmVuZGVyU0NNSGlzdG9yeUdyYXBoUGxhY2Vob2xkZXIoZ3JhcGhDb2x1bW5zLCBnZXRIaXN0b3J5SXRlbUluZGV4KGhpc3RvcnlJdGVtVmlld01vZGVsKSkpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSGlzdG9yeUl0ZW1DaGFuZ2VUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIExvYWRNb3JlVGVtcGxhdGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZ3JhcGhQbGFjZWhvbGRlcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGhpc3RvcnlJdGVtUGxhY2Vob2xkZXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBoaXN0b3J5SXRlbVBsYWNlaG9sZGVyTGFiZWw6IEljb25MYWJlbDtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZTtcbn1cblxuY2xhc3MgSGlzdG9yeUl0ZW1Mb2FkTW9yZVJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQsIHZvaWQsIExvYWRNb3JlVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnaGlzdG9yeUl0ZW1Mb2FkTW9yZSc7XG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBIaXN0b3J5SXRlbUxvYWRNb3JlUmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pc0xvYWRpbmdNb3JlOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkTW9yZUNhbGxiYWNrOiAoKSA9PiB2b2lkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBMb2FkTW9yZVRlbXBsYXRlIHtcblx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmhpc3RvcnktaXRlbS1sb2FkLW1vcmUnKSk7XG5cdFx0Y29uc3QgZ3JhcGhQbGFjZWhvbGRlciA9IGFwcGVuZChlbGVtZW50LCAkKCcuZ3JhcGgtcGxhY2Vob2xkZXInKSk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckNvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcuaGlzdG9yeS1pdGVtLXBsYWNlaG9sZGVyJykpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUGxhY2Vob2xkZXJMYWJlbCA9IG5ldyBJY29uTGFiZWwoaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckNvbnRhaW5lciwgeyBzdXBwb3J0SWNvbnM6IHRydWUgfSk7XG5cblx0XHRyZXR1cm4geyBlbGVtZW50LCBncmFwaFBsYWNlaG9sZGVyLCBoaXN0b3J5SXRlbVBsYWNlaG9sZGVyQ29udGFpbmVyLCBoaXN0b3J5SXRlbVBsYWNlaG9sZGVyTGFiZWwsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCBkaXNwb3NhYmxlczogaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IExvYWRNb3JlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhQbGFjZWhvbGRlci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5ncmFwaFBsYWNlaG9sZGVyLnN0eWxlLndpZHRoID0gYCR7U1dJTUxBTkVfV0lEVEggKiAoZWxlbWVudC5lbGVtZW50LmdyYXBoQ29sdW1ucy5sZW5ndGggKyAxKX1weGA7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoUGxhY2Vob2xkZXIuYXBwZW5kQ2hpbGQocmVuZGVyU0NNSGlzdG9yeUdyYXBoUGxhY2Vob2xkZXIoZWxlbWVudC5lbGVtZW50LmdyYXBoQ29sdW1ucykpO1xuXG5cdFx0Y29uc3QgcGFnZU9uU2Nyb2xsID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3NjbS5ncmFwaC5wYWdlT25TY3JvbGwnKSA9PT0gdHJ1ZTtcblx0XHR0ZW1wbGF0ZURhdGEuaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaGltbWVyJywgcGFnZU9uU2Nyb2xsKTtcblxuXHRcdGlmIChwYWdlT25TY3JvbGwpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5oaXN0b3J5SXRlbVBsYWNlaG9sZGVyTGFiZWwuc2V0TGFiZWwoJycpO1xuXHRcdFx0dGhpcy5fbG9hZE1vcmVDYWxsYmFjaygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzTG9hZGluZ01vcmUgPSB0aGlzLl9pc0xvYWRpbmdNb3JlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaWNvbiA9IGAkKCR7aXNMb2FkaW5nTW9yZSA/ICdsb2FkaW5nfnNwaW4nIDogJ2ZvbGQtZG93bid9KWA7XG5cblx0XHRcdFx0dGVtcGxhdGVEYXRhLmhpc3RvcnlJdGVtUGxhY2Vob2xkZXJMYWJlbC5zZXRMYWJlbChsb2NhbGl6ZSgnbG9hZE1vcmUnLCBcInswfSBMb2FkIE1vcmUuLi5cIiwgaWNvbikpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBMb2FkTW9yZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgaGFwcGVuIHNpbmNlIG5vZGUgaXMgaW5jb21wcmVzc2libGUnKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IExvYWRNb3JlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBMb2FkTW9yZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5Vmlld1BhbmVBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXHRjb25zdHJ1Y3RvcihASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogSElTVE9SWV9WSUVXX1BBTkVfSUQgfSxcblx0XHRcdGFzeW5jICgpID0+IGF3YWl0IHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIGNvbnRleHQpKTtcblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5VHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzY20gaGlzdG9yeScsIFwiU291cmNlIENvbnRyb2wgSGlzdG9yeVwiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGAke2VsZW1lbnQucHJvdmlkZXIubmFtZX0gJHtlbGVtZW50LnByb3ZpZGVyLmxhYmVsfWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblx0XHRcdHJldHVybiBgJHtzdHJpcEljb25zKGhpc3RvcnlJdGVtLm1lc3NhZ2UpLnRyaW0oKX0ke2hpc3RvcnlJdGVtLmF1dGhvciA/IGAsICR7aGlzdG9yeUl0ZW0uYXV0aG9yfWAgOiAnJ31gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNDTUhpc3RvcnlUcmVlSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cblx0Z2V0SWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5wcm92aWRlcjtcblx0XHRcdHJldHVybiBgcmVwbzoke3Byb3ZpZGVyLmlkfWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXHRcdFx0cmV0dXJuIGBoaXN0b3J5SXRlbToke3Byb3ZpZGVyLmlkfS8ke2hpc3RvcnlJdGVtLmlkfS8ke2hpc3RvcnlJdGVtLnBhcmVudElkcy5qb2luKCcsJyl9YDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdFx0XHRyZXR1cm4gYGhpc3RvcnlJdGVtQ2hhbmdlOiR7cHJvdmlkZXIuaWR9LyR7aGlzdG9yeUl0ZW0uaWR9LyR7aGlzdG9yeUl0ZW0ucGFyZW50SWRzLmpvaW4oJywnKX0vJHtlbGVtZW50Lmhpc3RvcnlJdGVtQ2hhbmdlLnVyaS5mc1BhdGh9YDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQuY29udGV4dC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBlbGVtZW50LmNvbnRleHQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdFx0XHRyZXR1cm4gYGhpc3RvcnlJdGVtQ2hhbmdlRm9sZGVyOiR7cHJvdmlkZXIuaWR9LyR7aGlzdG9yeUl0ZW0uaWR9LyR7aGlzdG9yeUl0ZW0ucGFyZW50SWRzLmpvaW4oJywnKX0vJHtlbGVtZW50LnVyaS5mc1BhdGh9YDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdHJldHVybiBgaGlzdG9yeUl0ZW1Mb2FkTW9yZToke3Byb3ZpZGVyLmlkfWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmVlIGVsZW1lbnQnKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU0NNSGlzdG9yeVRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8VHJlZUVsZW1lbnQ+IHtcblx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudDogVHJlZUVsZW1lbnQpOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHwgeyB0b1N0cmluZygpOiBzdHJpbmcgfVtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBGb3IgYSBoaXN0b3J5IGl0ZW0gd2Ugd2FudCB0byBtYXRjaCBib3RoIHRoZSBtZXNzYWdlIGFuZFxuXHRcdFx0Ly8gdGhlIGF1dGhvci4gQSBtYXRjaCBpbiB0aGUgbWVzc2FnZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXJcblx0XHRcdC8vIGEgbWF0Y2ggaW4gdGhlIGF1dGhvci5cblx0XHRcdHJldHVybiBbZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbS5tZXNzYWdlLCBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtLmF1dGhvcl07XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtTG9hZE1vcmVUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Ly8gV2UgZG9uJ3Qgd2FudCB0byBtYXRjaCB0aGUgbG9hZCBtb3JlIGVsZW1lbnRcblx0XHRcdHJldHVybiAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRyZWUgZWxlbWVudCcpO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudHM6IFRyZWVFbGVtZW50W10pOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb2xkZXJzID0gZWxlbWVudHMgYXMgSVJlc291cmNlTm9kZTxTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50LCBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50PltdO1xuXHRcdHJldHVybiBmb2xkZXJzLm1hcChlID0+IGUubmFtZSkuam9pbignLycpO1xuXHR9XG59XG5cbmNsYXNzIFNDTUhpc3RvcnlUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSBpbXBsZW1lbnRzIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxUcmVlRWxlbWVudD4ge1xuXG5cdGlzSW5jb21wcmVzc2libGUoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5jaGlsZHJlbkNvdW50ID09PSAwIHx8ICFlbGVtZW50LnBhcmVudCB8fCAhZWxlbWVudC5wYXJlbnQucGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIFNDTUhpc3RvcnlUcmVlRGF0YVNvdXJjZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPFNDTUhpc3RvcnlWaWV3TW9kZWwsIFRyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGU6ICgpID0+IFZpZXdNb2RlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBTQ01IaXN0b3J5Vmlld01vZGVsIHwgVHJlZUVsZW1lbnQpOiBQcm9taXNlPEl0ZXJhYmxlPFRyZWVFbGVtZW50Pj4ge1xuXHRcdGNvbnN0IGNoaWxkcmVuOiBUcmVlRWxlbWVudFtdID0gW107XG5cblx0XHRpZiAoaW5wdXRPckVsZW1lbnQgaW5zdGFuY2VvZiBTQ01IaXN0b3J5Vmlld01vZGVsKSB7XG5cdFx0XHQvLyBIaXN0b3J5IGl0ZW1zXG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbXMgPSBhd2FpdCBpbnB1dE9yRWxlbWVudC5nZXRIaXN0b3J5SXRlbXMoKTtcblx0XHRcdGNoaWxkcmVuLnB1c2goLi4uaGlzdG9yeUl0ZW1zKTtcblxuXHRcdFx0Ly8gTG9hZCBNb3JlIGVsZW1lbnRcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBpbnB1dE9yRWxlbWVudC5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdFx0Y29uc3QgbGFzdEhpc3RvcnlJdGVtID0gaGlzdG9yeUl0ZW1zLmF0KC0xKTtcblx0XHRcdGlmIChyZXBvc2l0b3J5ICYmIGxhc3RIaXN0b3J5SXRlbSAmJiBsYXN0SGlzdG9yeUl0ZW0uaGlzdG9yeUl0ZW1WaWV3TW9kZWwub3V0cHV0U3dpbWxhbmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0cmVwb3NpdG9yeSxcblx0XHRcdFx0XHRncmFwaENvbHVtbnM6IGxhc3RIaXN0b3J5SXRlbS5oaXN0b3J5SXRlbVZpZXdNb2RlbC5vdXRwdXRTd2ltbGFuZXMsXG5cdFx0XHRcdFx0dHlwZTogJ2hpc3RvcnlJdGVtTG9hZE1vcmUnXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFNDTUhpc3RvcnlJdGVtTG9hZE1vcmVUcmVlRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHQvLyBIaXN0b3J5IGl0ZW0gY2hhbmdlc1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gaW5wdXRPckVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbVZpZXdNb2RlbCA9IGlucHV0T3JFbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBoaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblxuXHRcdFx0bGV0IGhpc3RvcnlJdGVtSWQ6IHN0cmluZywgaGlzdG9yeUl0ZW1QYXJlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdpbmNvbWluZy1jaGFuZ2VzJyB8fFxuXHRcdFx0XHRoaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kID09PSAnb3V0Z29pbmctY2hhbmdlcydcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBJbmNvbWluZy9PdXRnb2luZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbVxuXHRcdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZWYuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKTtcblxuXHRcdFx0XHRpZiAoIWhpc3RvcnlQcm92aWRlciB8fCAhaGlzdG9yeUl0ZW1SZWYgfHwgIWhpc3RvcnlJdGVtUmVtb3RlUmVmKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGlzdG9yeUl0ZW1JZCA9IGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdpbmNvbWluZy1jaGFuZ2VzJ1xuXHRcdFx0XHRcdD8gaGlzdG9yeUl0ZW1SZW1vdGVSZWYuaWRcblx0XHRcdFx0XHQ6IGhpc3RvcnlJdGVtUmVmLmlkO1xuXG5cdFx0XHRcdGhpc3RvcnlJdGVtUGFyZW50SWQgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtUmVmc0NvbW1vbkFuY2VzdG9yKFtcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlZi5uYW1lLFxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVtb3RlUmVmLm5hbWVdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEhpc3RvcnkgaXRlbVxuXHRcdFx0XHRoaXN0b3J5SXRlbUlkID0gaGlzdG9yeUl0ZW0uaWQ7XG5cblx0XHRcdFx0aWYgKGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Ly8gSGlzdG9yeSBpdGVtIHJpZ2h0IGFib3ZlIHRoZSBpbmNvbWluZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbVxuXHRcdFx0XHRcdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHNbMF0gPT09IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIWhpc3RvcnlQcm92aWRlciB8fCAhaGlzdG9yeUl0ZW1SZWYgfHwgIWhpc3RvcnlJdGVtUmVtb3RlUmVmKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1QYXJlbnRJZCA9IGF3YWl0IGhpc3RvcnlQcm92aWRlci5yZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3IoW1xuXHRcdFx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlZi5uYW1lLFxuXHRcdFx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lXSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtUGFyZW50SWQgPSBoaXN0b3J5SXRlbS5wYXJlbnRJZHNbMF07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtQ2hhbmdlcyA9IGF3YWl0IGhpc3RvcnlQcm92aWRlcj8ucHJvdmlkZUhpc3RvcnlJdGVtQ2hhbmdlcyhoaXN0b3J5SXRlbUlkLCBoaXN0b3J5SXRlbVBhcmVudElkKSA/PyBbXTtcblxuXHRcdFx0aWYgKHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuTGlzdCkge1xuXHRcdFx0XHQvLyBMaXN0XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goLi4uaGlzdG9yeUl0ZW1DaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0XHRyZXBvc2l0b3J5OiBpbnB1dE9yRWxlbWVudC5yZXBvc2l0b3J5LFxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtVmlld01vZGVsOiBpbnB1dE9yRWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbCxcblx0XHRcdFx0XHRoaXN0b3J5SXRlbUNoYW5nZTogY2hhbmdlLFxuXHRcdFx0XHRcdGdyYXBoQ29sdW1uczogaW5wdXRPckVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwub3V0cHV0U3dpbWxhbmVzLFxuXHRcdFx0XHRcdHR5cGU6ICdoaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbCdcblx0XHRcdFx0fSBzYXRpc2ZpZXMgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCkpKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy52aWV3TW9kZSgpID09PSBWaWV3TW9kZS5UcmVlKSB7XG5cdFx0XHRcdC8vIFRyZWVcblx0XHRcdFx0Y29uc3Qgcm9vdFVyaSA9IGlucHV0T3JFbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSA/PyBVUkkuZmlsZSgnLycpO1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5SXRlbUNoYW5nZXNUcmVlID0gbmV3IFJlc291cmNlVHJlZTxTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50LCBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50PihpbnB1dE9yRWxlbWVudCwgcm9vdFVyaSk7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGhpc3RvcnlJdGVtQ2hhbmdlcykge1xuXHRcdFx0XHRcdGhpc3RvcnlJdGVtQ2hhbmdlc1RyZWUuYWRkKGNoYW5nZS51cmksIHtcblx0XHRcdFx0XHRcdHJlcG9zaXRvcnk6IGlucHV0T3JFbGVtZW50LnJlcG9zaXRvcnksXG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbVZpZXdNb2RlbDogaW5wdXRPckVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwsXG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbUNoYW5nZTogY2hhbmdlLFxuXHRcdFx0XHRcdFx0Z3JhcGhDb2x1bW5zOiBpbnB1dE9yRWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5vdXRwdXRTd2ltbGFuZXMsXG5cdFx0XHRcdFx0XHR0eXBlOiAnaGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWwnXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGhpc3RvcnlJdGVtQ2hhbmdlc1RyZWUucm9vdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2gobm9kZS5lbGVtZW50ID8/IG5vZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoaW5wdXRPckVsZW1lbnQpICYmIGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VOb2RlKGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Ly8gVHJlZVxuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGlucHV0T3JFbGVtZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gobm9kZS5lbGVtZW50ICYmIG5vZGUuY2hpbGRyZW5Db3VudCA9PT0gMCA/IG5vZGUuZWxlbWVudCA6IG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZHJlbjtcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBTQ01IaXN0b3J5Vmlld01vZGVsIHwgVHJlZUVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaW5wdXRPckVsZW1lbnQgaW5zdGFuY2VvZiBTQ01IaXN0b3J5Vmlld01vZGVsIHx8XG5cdFx0XHRpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoaW5wdXRPckVsZW1lbnQpIHx8XG5cdFx0XHQoaXNTQ01IaXN0b3J5SXRlbUNoYW5nZU5vZGUoaW5wdXRPckVsZW1lbnQpICYmIGlucHV0T3JFbGVtZW50LmNoaWxkcmVuQ291bnQgPiAwKTtcblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5VHJlZURyYWdBbmREcm9wIGltcGxlbWVudHMgSVRyZWVEcmFnQW5kRHJvcDxUcmVlRWxlbWVudD4ge1xuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fZ2V0VHJlZUVsZW1lbnRVcmkoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHVyaSA/IHVyaS50b1N0cmluZygpIDogbnVsbDtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGlmICghb3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5SXRlbXMgPSB0aGlzLl9nZXREcmFnQW5kRHJvcERhdGEoZGF0YSBhcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxUcmVlRWxlbWVudCwgVHJlZUVsZW1lbnRbXT4pO1xuXHRcdGlmIChoaXN0b3J5SXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuc2V0RGF0YShDb2RlRGF0YVRyYW5zZmVycy5TQ01fSElTVE9SWV9JVEVNLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5SXRlbXMpKTtcblx0fVxuXG5cdGdldERyYWdMYWJlbChlbGVtZW50czogVHJlZUVsZW1lbnRbXSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZWxlbWVudHNbMF07XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0VHJlZUVsZW1lbnRMYWJlbChlbGVtZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gU3RyaW5nKGVsZW1lbnRzLmxlbmd0aCk7XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHsgfVxuXG5cdHByaXZhdGUgX2dldERyYWdBbmREcm9wRGF0YShkYXRhOiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxUcmVlRWxlbWVudCwgVHJlZUVsZW1lbnRbXT4pOiBTQ01IaXN0b3J5SXRlbVRyYW5zZmVyRGF0YVtdIHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbXM6IFNDTUhpc3RvcnlJdGVtVHJhbnNmZXJEYXRhW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgWy4uLmRhdGEuY29udGV4dCA/PyBbXSwgLi4uZGF0YS5lbGVtZW50c10pIHtcblx0XHRcdGlmICghaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnROYW1lID0gYCQoJHtDb2RpY29uLnJlcG8uaWR9KVxcdTAwQTAke3Byb3ZpZGVyLm5hbWV9XFx1MDBBMCQoJHtDb2RpY29uLmdpdENvbW1pdC5pZH0pXFx1MDBBMCR7aGlzdG9yeUl0ZW0uZGlzcGxheUlkID8/IGhpc3RvcnlJdGVtLmlkfWA7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbVBhcmVudElkID0gaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmxlbmd0aCA+IDAgPyBoaXN0b3J5SXRlbS5wYXJlbnRJZHNbMF0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdGhpc3RvcnlJdGVtcy5wdXNoKHtcblx0XHRcdFx0bmFtZTogYXR0YWNobWVudE5hbWUsXG5cdFx0XHRcdHJlc291cmNlOiBTY21IaXN0b3J5SXRlbVJlc29sdmVyLmdldE11bHRpRGlmZlNvdXJjZVVyaShwcm92aWRlciwgaGlzdG9yeUl0ZW0uaWQsIGhpc3RvcnlJdGVtUGFyZW50SWQsIGhpc3RvcnlJdGVtLmRpc3BsYXlJZCksXG5cdFx0XHRcdGhpc3RvcnlJdGVtOiBoaXN0b3J5SXRlbVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhpc3RvcnlJdGVtcztcblx0fVxuXG5cdHByaXZhdGUgX2dldFRyZWVFbGVtZW50TGFiZWwoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblx0XHRcdHJldHVybiBoaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gaGlzdG9yeUl0ZW0uaWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRyZWVFbGVtZW50VXJpKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUGFyZW50SWQgPSBoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMCA/IGhpc3RvcnlJdGVtLnBhcmVudElkc1swXSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0cmV0dXJuIFNjbUhpc3RvcnlJdGVtUmVzb2x2ZXIuZ2V0TXVsdGlEaWZmU291cmNlVXJpKHByb3ZpZGVyLCBoaXN0b3J5SXRlbS5pZCwgaGlzdG9yeUl0ZW1QYXJlbnRJZCwgaGlzdG9yeUl0ZW0uZGlzcGxheUlkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG50eXBlIEhpc3RvcnlJdGVtUmVmc0ZpbHRlciA9ICdhbGwnIHwgJ2F1dG8nIHwgc3RyaW5nW107XG5cbnR5cGUgUmVwb3NpdG9yeVN0YXRlID0ge1xuXHR2aWV3TW9kZWxzOiBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50W107XG5cdGhpc3RvcnlJdGVtc0ZpbHRlcjogSVNDTUhpc3RvcnlJdGVtUmVmW107XG5cdG1lcmdlQmFzZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsb2FkTW9yZTogYm9vbGVhbiB8IHN0cmluZztcbn07XG5cbmNsYXNzIFNDTUhpc3RvcnlWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgdmlld01vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8Vmlld01vZGU+O1xuXG5cdC8qKlxuXHQgKiBUaGUgYWN0aXZlIHwgc2VsZWN0ZWQgcmVwb3NpdG9yeSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGZpcnN0IHJlcG9zaXRvcnkgd2hlbiB0aGUgb2JzZXJ2YWJsZVxuXHQgKiB2YWx1ZXMgYXJlIHVwZGF0ZWQgaW4gdGhlIHNhbWUgdHJhbnNhY3Rpb24gKG9yIGR1cmluZyB0aGUgaW5pdGlhbCByZWFkIG9mIHRoZSBvYnNlcnZhYmxlIHZhbHVlKS5cblx0ICovXG5cdHJlYWRvbmx5IHJlcG9zaXRvcnk6IElPYnNlcnZhYmxlPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0ZWRSZXBvc2l0b3J5ID0gb2JzZXJ2YWJsZVZhbHVlPCdhdXRvJyB8IElTQ01SZXBvc2l0b3J5Pih0aGlzLCAnYXV0bycpO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGlzdG9yeUl0ZW1zRmlsdGVyID0gb2JzZXJ2YWJsZVNpZ25hbCh0aGlzKTtcblx0cmVhZG9ubHkgaXNWaWV3TW9kZWxFbXB0eSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeVN0YXRlID0gbmV3IE1hcDxJU0NNUmVwb3NpdG9yeSwgUmVwb3NpdG9yeVN0YXRlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBvc2l0b3J5RmlsdGVyU3RhdGUgPSBuZXcgTWFwPHN0cmluZywgSGlzdG9yeUl0ZW1SZWZzRmlsdGVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjbUhpc3RvcnlJdGVtQ291bnRDdHg6IElDb250ZXh0S2V5PG51bWJlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjbUhpc3RvcnlWaWV3TW9kZUN0eDogSUNvbnRleHRLZXk8Vmlld01vZGU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZXBvc2l0b3J5RmlsdGVyU3RhdGUgPSB0aGlzLl9sb2FkSGlzdG9yeUl0ZW1zRmlsdGVyU3RhdGUoKTtcblx0XHR0aGlzLnZpZXdNb2RlID0gb2JzZXJ2YWJsZVZhbHVlPFZpZXdNb2RlPih0aGlzLCB0aGlzLl9nZXRWaWV3TW9kZSgpKTtcblxuXHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uub25XaWxsU3RvcCh0aGlzLl9zYXZlSGlzdG9yeUl0ZW1zRmlsdGVyU3RhdGUsIHRoaXMsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUodGhpcy5fc2F2ZUhpc3RvcnlJdGVtc0ZpbHRlclN0YXRlLCB0aGlzLCB0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9zY21IaXN0b3J5SXRlbUNvdW50Q3R4ID0gQ29udGV4dEtleXMuU0NNSGlzdG9yeUl0ZW1Db3VudC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3NjbUhpc3RvcnlWaWV3TW9kZUN0eCA9IENvbnRleHRLZXlzLlNDTUhpc3RvcnlWaWV3TW9kZS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3NjbUhpc3RvcnlWaWV3TW9kZUN0eC5zZXQodGhpcy52aWV3TW9kZS5nZXQoKSk7XG5cblx0XHRjb25zdCBmaXJzdFJlcG9zaXRvcnkgPSB0aGlzLl9zY21TZXJ2aWNlLnJlcG9zaXRvcnlDb3VudCA+IDBcblx0XHRcdD8gY29uc3RPYnNlcnZhYmxlKEl0ZXJhYmxlLmZpcnN0KHRoaXMuX3NjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSlcblx0XHRcdDogb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0XHRFdmVudC5vbmNlKHRoaXMuX3NjbVNlcnZpY2Uub25EaWRBZGRSZXBvc2l0b3J5KSxcblx0XHRcdFx0cmVwb3NpdG9yeSA9PiByZXBvc2l0b3J5KTtcblxuXHRcdGNvbnN0IGdyYXBoUmVwb3NpdG9yeSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkUmVwb3NpdG9yeSA9IHRoaXMuX3NlbGVjdGVkUmVwb3NpdG9yeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc2VsZWN0ZWRSZXBvc2l0b3J5ICE9PSAnYXV0bycpIHtcblx0XHRcdFx0cmV0dXJuIHNlbGVjdGVkUmVwb3NpdG9yeTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX3NjbVZpZXdTZXJ2aWNlLmFjdGl2ZVJlcG9zaXRvcnkucmVhZChyZWFkZXIpPy5yZXBvc2l0b3J5O1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZXBvc2l0b3J5ID0gbGF0ZXN0Q2hhbmdlZFZhbHVlKHRoaXMsIFtmaXJzdFJlcG9zaXRvcnksIGdyYXBoUmVwb3NpdG9yeV0pO1xuXG5cdFx0Y29uc3QgY2xvc2VkUmVwb3NpdG9yeSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuX3NjbVNlcnZpY2Uub25EaWRSZW1vdmVSZXBvc2l0b3J5LFxuXHRcdFx0cmVwb3NpdG9yeSA9PiByZXBvc2l0b3J5KTtcblxuXHRcdC8vIENsb3NlZCByZXBvc2l0b3J5IGNsZWFudXBcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gY2xvc2VkUmVwb3NpdG9yeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5yZXBvc2l0b3J5LnJlYWQodW5kZWZpbmVkKSA9PT0gcmVwb3NpdG9yeSkge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZFJlcG9zaXRvcnkuc2V0KEl0ZXJhYmxlLmZpcnN0KHRoaXMuX3NjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSA/PyAnYXV0bycsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5kZWxldGUocmVwb3NpdG9yeSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Y2xlYXJSZXBvc2l0b3J5U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXBvc2l0b3J5U3RhdGUuZGVsZXRlKHJlcG9zaXRvcnkpO1xuXHR9XG5cblx0Z2V0SGlzdG9yeUl0ZW1zRmlsdGVyKCk6ICdhbGwnIHwgJ2F1dG8nIHwgSVNDTUhpc3RvcnlJdGVtUmVmW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLnJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsdGVyU3RhdGUgPSB0aGlzLl9yZXBvc2l0b3J5RmlsdGVyU3RhdGUuZ2V0KGdldFByb3ZpZGVyS2V5KHJlcG9zaXRvcnkucHJvdmlkZXIpKSA/PyAnYXV0byc7XG5cdFx0aWYgKGZpbHRlclN0YXRlID09PSAnYWxsJyB8fCBmaWx0ZXJTdGF0ZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gZmlsdGVyU3RhdGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb3NpdG9yeVN0YXRlID0gdGhpcy5fcmVwb3NpdG9yeVN0YXRlLmdldChyZXBvc2l0b3J5KTtcblx0XHRyZXR1cm4gcmVwb3NpdG9yeVN0YXRlPy5oaXN0b3J5SXRlbXNGaWx0ZXI7XG5cdH1cblxuXHRnZXRDdXJyZW50SGlzdG9yeUl0ZW1UcmVlRWxlbWVudCgpOiBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5nZXQocmVwb3NpdG9yeSk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSByZXBvc2l0b3J5Py5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXG5cdFx0cmV0dXJuIHN0YXRlLnZpZXdNb2RlbHNcblx0XHRcdC5maW5kKHZpZXdNb2RlbCA9PiB2aWV3TW9kZWwuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0uaWQgPT09IGhpc3RvcnlJdGVtUmVmPy5yZXZpc2lvbik7XG5cdH1cblxuXHRsb2FkTW9yZShjdXJzb3I/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fcmVwb3NpdG9yeVN0YXRlLmdldChyZXBvc2l0b3J5KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVwb3NpdG9yeVN0YXRlLnNldChyZXBvc2l0b3J5LCB7IC4uLnN0YXRlLCBsb2FkTW9yZTogY3Vyc29yID8/IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyBnZXRIaXN0b3J5SXRlbXMoKTogUHJvbWlzZTxTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50W10+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnk/LnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZWYuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5IHx8ICFoaXN0b3J5UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3NjbUhpc3RvcnlJdGVtQ291bnRDdHguc2V0KDApO1xuXHRcdFx0dGhpcy5pc1ZpZXdNb2RlbEVtcHR5LnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGxldCBzdGF0ZSA9IHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5nZXQocmVwb3NpdG9yeSk7XG5cblx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLmxvYWRNb3JlICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1zID0gc3RhdGU/LnZpZXdNb2RlbHNcblx0XHRcdFx0LmZpbHRlcih2bSA9PlxuXHRcdFx0XHRcdHZtLmhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgIT09ICdpbmNvbWluZy1jaGFuZ2VzJyAmJlxuXHRcdFx0XHRcdHZtLmhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgIT09ICdvdXRnb2luZy1jaGFuZ2VzJylcblx0XHRcdFx0Lm1hcCh2bSA9PiB2bS5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbSkgPz8gW107XG5cblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmcyA9IHN0YXRlPy5oaXN0b3J5SXRlbXNGaWx0ZXIgPz9cblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZUhpc3RvcnlJdGVtRmlsdGVyKHJlcG9zaXRvcnksIGhpc3RvcnlQcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IGxpbWl0ID0gY2xhbXAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignc2NtLmdyYXBoLnBhZ2VTaXplJyksIDEsIDEwMDApO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWZJZHMgPSBoaXN0b3J5SXRlbVJlZnMubWFwKHJlZiA9PiByZWYucmV2aXNpb24gPz8gcmVmLmlkKTtcblxuXHRcdFx0ZG8ge1xuXHRcdFx0XHQvLyBGZXRjaCB0aGUgbmV4dCBwYWdlIG9mIGhpc3RvcnkgaXRlbXNcblx0XHRcdFx0aGlzdG9yeUl0ZW1zLnB1c2goLi4uKGF3YWl0IGhpc3RvcnlQcm92aWRlci5wcm92aWRlSGlzdG9yeUl0ZW1zKHtcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlZnM6IGhpc3RvcnlJdGVtUmVmSWRzLCBsaW1pdCwgc2tpcDogaGlzdG9yeUl0ZW1zLmxlbmd0aFxuXHRcdFx0XHR9KSA/PyBbXSkpO1xuXHRcdFx0fSB3aGlsZSAodHlwZW9mIHN0YXRlPy5sb2FkTW9yZSA9PT0gJ3N0cmluZycgJiYgIWhpc3RvcnlJdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5pZCA9PT0gc3RhdGU/LmxvYWRNb3JlKSk7XG5cblx0XHRcdC8vIENvbXB1dGUgdGhlIG1lcmdlIGJhc2Vcblx0XHRcdGNvbnN0IG1lcmdlQmFzZSA9IGhpc3RvcnlJdGVtUmVmICYmIGhpc3RvcnlJdGVtUmVtb3RlUmVmICYmIHN0YXRlPy5tZXJnZUJhc2UgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGF3YWl0IGhpc3RvcnlQcm92aWRlci5yZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3IoW1xuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVmLm5hbWUsXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZW1vdGVSZWYubmFtZV0pXG5cdFx0XHRcdDogc3RhdGU/Lm1lcmdlQmFzZTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRoZSBjb2xvciBtYXBcblx0XHRcdGNvbnN0IGNvbG9yTWFwID0gdGhpcy5fZ2V0R3JhcGhDb2xvck1hcChoaXN0b3J5SXRlbVJlZnMpO1xuXG5cdFx0XHQvLyBPbmx5IHNob3cgaW5jb21pbmcgY2hhbmdlcyBub2RlIGlmIHRoZSByZW1vdGUgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZSBpcyBwYXJ0IG9mIHRoZSBncmFwaFxuXHRcdFx0Y29uc3QgYWRkSW5jb21pbmdDaGFuZ2VzTm9kZSA9IHRoaXMuX3NjbVZpZXdTZXJ2aWNlLmdyYXBoU2hvd0luY29taW5nQ2hhbmdlc0NvbmZpZy5nZXQoKVxuXHRcdFx0XHQmJiBoaXN0b3J5SXRlbVJlZnMuc29tZShyZWYgPT4gcmVmLmlkID09PSBoaXN0b3J5SXRlbVJlbW90ZVJlZj8uaWQpO1xuXG5cdFx0XHQvLyBPbmx5IHNob3cgb3V0Z29pbmcgY2hhbmdlcyBub2RlIGlmIHRoZSBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlIGlzIHBhcnQgb2YgdGhlIGdyYXBoXG5cdFx0XHRjb25zdCBhZGRPdXRnb2luZ0NoYW5nZXNOb2RlID0gdGhpcy5fc2NtVmlld1NlcnZpY2UuZ3JhcGhTaG93T3V0Z29pbmdDaGFuZ2VzQ29uZmlnLmdldCgpXG5cdFx0XHRcdCYmIGhpc3RvcnlJdGVtUmVmcy5zb21lKHJlZiA9PiByZWYuaWQgPT09IGhpc3RvcnlJdGVtUmVmPy5pZCk7XG5cblx0XHRcdGNvbnN0IHZpZXdNb2RlbHMgPSB0b0lTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbEFycmF5KFxuXHRcdFx0XHRoaXN0b3J5SXRlbXMsXG5cdFx0XHRcdGNvbG9yTWFwLFxuXHRcdFx0XHRoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZWYuZ2V0KCksXG5cdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKSxcblx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKSxcblx0XHRcdFx0YWRkSW5jb21pbmdDaGFuZ2VzTm9kZSxcblx0XHRcdFx0YWRkT3V0Z29pbmdDaGFuZ2VzTm9kZSxcblx0XHRcdFx0bWVyZ2VCYXNlKVxuXHRcdFx0XHQubWFwKGhpc3RvcnlJdGVtVmlld01vZGVsID0+ICh7XG5cdFx0XHRcdFx0cmVwb3NpdG9yeSxcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVZpZXdNb2RlbCxcblx0XHRcdFx0XHR0eXBlOiAnaGlzdG9yeUl0ZW1WaWV3TW9kZWwnXG5cdFx0XHRcdH0pIHNhdGlzZmllcyBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KTtcblxuXHRcdFx0c3RhdGUgPSB7IGhpc3RvcnlJdGVtc0ZpbHRlcjogaGlzdG9yeUl0ZW1SZWZzLCB2aWV3TW9kZWxzLCBtZXJnZUJhc2UsIGxvYWRNb3JlOiBmYWxzZSB9O1xuXHRcdFx0dGhpcy5fcmVwb3NpdG9yeVN0YXRlLnNldChyZXBvc2l0b3J5LCBzdGF0ZSk7XG5cblx0XHRcdHRoaXMuX3NjbUhpc3RvcnlJdGVtQ291bnRDdHguc2V0KHZpZXdNb2RlbHMubGVuZ3RoKTtcblx0XHRcdHRoaXMuaXNWaWV3TW9kZWxFbXB0eS5zZXQodmlld01vZGVscy5sZW5ndGggPT09IDAsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlLnZpZXdNb2RlbHM7XG5cdH1cblxuXHRzZXRSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5IHwgJ2F1dG8nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRSZXBvc2l0b3J5LnNldChyZXBvc2l0b3J5LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0SGlzdG9yeUl0ZW1zRmlsdGVyKGZpbHRlcjogSGlzdG9yeUl0ZW1SZWZzRmlsdGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZmlsdGVyICE9PSAnYXV0bycpIHtcblx0XHRcdHRoaXMuX3JlcG9zaXRvcnlGaWx0ZXJTdGF0ZS5zZXQoZ2V0UHJvdmlkZXJLZXkocmVwb3NpdG9yeS5wcm92aWRlciksIGZpbHRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlcG9zaXRvcnlGaWx0ZXJTdGF0ZS5kZWxldGUoZ2V0UHJvdmlkZXJLZXkocmVwb3NpdG9yeS5wcm92aWRlcikpO1xuXHRcdH1cblx0XHR0aGlzLl9zYXZlSGlzdG9yeUl0ZW1zRmlsdGVyU3RhdGUoKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VIaXN0b3J5SXRlbXNGaWx0ZXIudHJpZ2dlcih1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0Vmlld01vZGUodmlld01vZGU6IFZpZXdNb2RlKTogdm9pZCB7XG5cdFx0aWYgKHZpZXdNb2RlID09PSB0aGlzLnZpZXdNb2RlLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZS5zZXQodmlld01vZGUsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc2NtSGlzdG9yeVZpZXdNb2RlQ3R4LnNldCh2aWV3TW9kZSk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3NjbS5ncmFwaFZpZXcudmlld01vZGUnLCB2aWV3TW9kZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdNb2RlKCk6IFZpZXdNb2RlIHtcblx0XHRsZXQgbW9kZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd0cmVlJyB8ICdsaXN0Jz4oJ3NjbS5kZWZhdWx0Vmlld01vZGUnKSA9PT0gJ2xpc3QnID8gVmlld01vZGUuTGlzdCA6IFZpZXdNb2RlLlRyZWU7XG5cdFx0Y29uc3Qgc3RvcmFnZU1vZGUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoJ3NjbS5ncmFwaFZpZXcudmlld01vZGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSBhcyBWaWV3TW9kZTtcblx0XHRpZiAodHlwZW9mIHN0b3JhZ2VNb2RlID09PSAnc3RyaW5nJykge1xuXHRcdFx0bW9kZSA9IHN0b3JhZ2VNb2RlO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0R3JhcGhDb2xvck1hcChoaXN0b3J5SXRlbVJlZnM6IElTQ01IaXN0b3J5SXRlbVJlZltdKTogTWFwPHN0cmluZywgQ29sb3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSByZXBvc2l0b3J5Py5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbUJhc2VSZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKTtcblxuXHRcdGNvbnN0IGNvbG9yTWFwID0gbmV3IE1hcDxzdHJpbmcsIENvbG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZD4oKTtcblxuXHRcdGlmIChoaXN0b3J5SXRlbVJlZikge1xuXHRcdFx0Y29sb3JNYXAuc2V0KGhpc3RvcnlJdGVtUmVmLmlkLCBoaXN0b3J5SXRlbVJlZi5jb2xvcik7XG5cblx0XHRcdGlmIChoaXN0b3J5SXRlbVJlbW90ZVJlZikge1xuXHRcdFx0XHRjb2xvck1hcC5zZXQoaGlzdG9yeUl0ZW1SZW1vdGVSZWYuaWQsIGhpc3RvcnlJdGVtUmVtb3RlUmVmLmNvbG9yKTtcblx0XHRcdH1cblx0XHRcdGlmIChoaXN0b3J5SXRlbUJhc2VSZWYpIHtcblx0XHRcdFx0Y29sb3JNYXAuc2V0KGhpc3RvcnlJdGVtQmFzZVJlZi5pZCwgaGlzdG9yeUl0ZW1CYXNlUmVmLmNvbG9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgdGhlIHJlbWFpbmluZyBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlcyB0byB0aGUgY29sb3IgbWFwXG5cdFx0Ly8gaWYgbm90IGFscmVhZHkgcHJlc2VudC4gVGhlc2UgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZXMgd2lsbFxuXHRcdC8vIGJlIGNvbG9yZWQgdXNpbmcgdGhlIGNvbG9yIG9mIHRoZSBoaXN0b3J5IGl0ZW0gdG8gd2hpY2ggdGhleVxuXHRcdC8vIHBvaW50IHRvLlxuXHRcdGZvciAoY29uc3QgcmVmIG9mIGhpc3RvcnlJdGVtUmVmcykge1xuXHRcdFx0aWYgKCFjb2xvck1hcC5oYXMocmVmLmlkKSkge1xuXHRcdFx0XHRjb2xvck1hcC5zZXQocmVmLmlkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb2xvck1hcDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVIaXN0b3J5SXRlbUZpbHRlcihyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSwgaGlzdG9yeVByb3ZpZGVyOiBJU0NNSGlzdG9yeVByb3ZpZGVyKTogUHJvbWlzZTxJU0NNSGlzdG9yeUl0ZW1SZWZbXT4ge1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmczogSVNDTUhpc3RvcnlJdGVtUmVmW10gPSBbXTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbXNGaWx0ZXIgPSB0aGlzLl9yZXBvc2l0b3J5RmlsdGVyU3RhdGUuZ2V0KGdldFByb3ZpZGVyS2V5KHJlcG9zaXRvcnkucHJvdmlkZXIpKSA/PyAnYXV0byc7XG5cblx0XHRzd2l0Y2ggKGhpc3RvcnlJdGVtc0ZpbHRlcikge1xuXHRcdFx0Y2FzZSAnYWxsJzpcblx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZzLnB1c2goLi4uKGF3YWl0IGhpc3RvcnlQcm92aWRlci5wcm92aWRlSGlzdG9yeUl0ZW1SZWZzKCkgPz8gW10pKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdhdXRvJzpcblx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZzLnB1c2goLi4uW1xuXHRcdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlZi5nZXQoKSxcblx0XHRcdFx0XHRoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCksXG5cdFx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKSxcblx0XHRcdFx0XS5maWx0ZXIocmVmID0+ICEhcmVmKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQvLyBHZXQgdGhlIGxhdGVzdCByZXZpc2lvbnMgZm9yIHRoZSBoaXN0b3J5IGl0ZW1zIHJlZmVyZW5jZXMgaW4gdGhlIGZpbGVyXG5cdFx0XHRcdGNvbnN0IHJlZnMgPSAoYXdhaXQgaGlzdG9yeVByb3ZpZGVyLnByb3ZpZGVIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1zRmlsdGVyKSA/PyBbXSlcblx0XHRcdFx0XHQuZmlsdGVyKHJlZiA9PiBoaXN0b3J5SXRlbXNGaWx0ZXIuc29tZShmaWx0ZXIgPT4gZmlsdGVyID09PSByZWYuaWQpKTtcblxuXHRcdFx0XHRpZiAocmVmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBSZXNldCB0aGUgZmlsdGVyXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZzLnB1c2goLi4uW1xuXHRcdFx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVmLmdldCgpLFxuXHRcdFx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpLFxuXHRcdFx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKSxcblx0XHRcdFx0XHRdLmZpbHRlcihyZWYgPT4gISFyZWYpKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvc2l0b3J5RmlsdGVyU3RhdGUuZGVsZXRlKGdldFByb3ZpZGVyS2V5KHJlcG9zaXRvcnkucHJvdmlkZXIpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgZmlsdGVyXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZzLnB1c2goLi4ucmVmcyk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3NpdG9yeUZpbHRlclN0YXRlLnNldChnZXRQcm92aWRlcktleShyZXBvc2l0b3J5LnByb3ZpZGVyKSwgcmVmcy5tYXAocmVmID0+IHJlZi5pZCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fc2F2ZUhpc3RvcnlJdGVtc0ZpbHRlclN0YXRlKCk7XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhpc3RvcnlJdGVtUmVmcztcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRIaXN0b3J5SXRlbXNGaWx0ZXJTdGF0ZSgpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZmlsdGVyRGF0YSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldCgnc2NtLmdyYXBoVmlldy5yZWZlcmVuY2VzRmlsdGVyJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAoZmlsdGVyRGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcDxzdHJpbmcsIEhpc3RvcnlJdGVtUmVmc0ZpbHRlcj4oSlNPTi5wYXJzZShmaWx0ZXJEYXRhKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7IH1cblxuXHRcdHJldHVybiBuZXcgTWFwPHN0cmluZywgSGlzdG9yeUl0ZW1SZWZzRmlsdGVyPigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZUhpc3RvcnlJdGVtc0ZpbHRlclN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZpbHRlciA9IEFycmF5LmZyb20odGhpcy5fcmVwb3NpdG9yeUZpbHRlclN0YXRlLmVudHJpZXMoKSk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3NjbS5ncmFwaFZpZXcucmVmZXJlbmNlc0ZpbHRlcicsIEpTT04uc3RyaW5naWZ5KGZpbHRlciksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG50eXBlIFJlcG9zaXRvcnlRdWlja1BpY2tJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IHJlcG9zaXRvcnk6ICdhdXRvJyB8IElTQ01SZXBvc2l0b3J5IH07XG5cbmNsYXNzIFJlcG9zaXRvcnlQaWNrZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvUXVpY2tQaWNrSXRlbTogUmVwb3NpdG9yeVF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvJywgXCJBdXRvXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWN0aXZlUmVwb3NpdG9yeScsIFwiU2hvdyB0aGUgc291cmNlIGNvbnRyb2wgZ3JhcGggZm9yIHRoZSBhY3RpdmUgcmVwb3NpdG9yeVwiKSxcblx0XHRyZXBvc2l0b3J5OiAnYXV0bydcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgcGlja1JlcG9zaXRvcnkoKTogUHJvbWlzZTxSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBpY2tzOiAoUmVwb3NpdG9yeVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW1xuXHRcdFx0dGhpcy5fYXV0b1F1aWNrUGlja0l0ZW0sXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH1dO1xuXG5cdFx0cGlja3MucHVzaCguLi50aGlzLl9zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXMubWFwKHIgPT4gKHtcblx0XHRcdGxhYmVsOiByLnByb3ZpZGVyLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogci5wcm92aWRlci5yb290VXJpPy5mc1BhdGgsXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihyLnByb3ZpZGVyLmljb25QYXRoKVxuXHRcdFx0XHQ/IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShyLnByb3ZpZGVyLmljb25QYXRoKVxuXHRcdFx0XHQ6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnJlcG8pLFxuXHRcdFx0cmVwb3NpdG9yeTogclxuXHRcdH0pKSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzY21HcmFwaFJlcG9zaXRvcnknLCBcIlNlbGVjdCB0aGUgcmVwb3NpdG9yeSB0byB2aWV3LCB0eXBlIHRvIGZpbHRlciBhbGwgcmVwb3NpdG9yaWVzXCIpXG5cdFx0fSk7XG5cdH1cbn1cblxudHlwZSBIaXN0b3J5SXRlbVJlZlF1aWNrUGlja0l0ZW0gPSBJUXVpY2tQaWNrSXRlbSAmIHsgaGlzdG9yeUl0ZW1SZWY6ICdhbGwnIHwgJ2F1dG8nIHwgSVNDTUhpc3RvcnlJdGVtUmVmIH07XG5cbmNsYXNzIEhpc3RvcnlJdGVtUmVmUGlja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbFF1aWNrUGlja0l0ZW06IEhpc3RvcnlJdGVtUmVmUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRpZDogJ2FsbCcsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdhbGwnLCBcIkFsbFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FsbEhpc3RvcnlJdGVtUmVmcycsIFwiQWxsIGhpc3RvcnkgaXRlbSByZWZlcmVuY2VzXCIpLFxuXHRcdGhpc3RvcnlJdGVtUmVmOiAnYWxsJ1xuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9RdWlja1BpY2tJdGVtOiBIaXN0b3J5SXRlbVJlZlF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0aWQ6ICdhdXRvJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG8nLCBcIkF1dG9cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjdXJyZW50SGlzdG9yeUl0ZW1SZWYnLCBcIkN1cnJlbnQgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZShzKVwiKSxcblx0XHRoaXN0b3J5SXRlbVJlZjogJ2F1dG8nXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeVByb3ZpZGVyOiBJU0NNSGlzdG9yeVByb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlJdGVtc0ZpbHRlcjogJ2FsbCcgfCAnYXV0bycgfCBJU0NNSGlzdG9yeUl0ZW1SZWZbXSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBwaWNrSGlzdG9yeUl0ZW1SZWYoKTogUHJvbWlzZTxIaXN0b3J5SXRlbVJlZnNGaWx0ZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBxdWlja1BpY2sgPSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHF1aWNrUGljayk7XG5cblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2NtR3JhcGhIaXN0b3J5SXRlbVJlZicsIFwiU2VsZWN0IG9uZS9tb3JlIGhpc3RvcnkgaXRlbSByZWZlcmVuY2VzIHRvIHZpZXcsIHR5cGUgdG8gZmlsdGVyXCIpO1xuXHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRxdWlja1BpY2suaGlkZUNoZWNrQWxsID0gdHJ1ZTtcblx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fY3JlYXRlUXVpY2tQaWNrSXRlbXMoKTtcblxuXHRcdC8vIFNldCBpbml0aWFsIHNlbGVjdGlvblxuXHRcdGxldCBzZWxlY3RlZEl0ZW1zOiBIaXN0b3J5SXRlbVJlZlF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIgPT09ICdhbGwnKSB7XG5cdFx0XHRzZWxlY3RlZEl0ZW1zLnB1c2godGhpcy5fYWxsUXVpY2tQaWNrSXRlbSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIgPT09ICdhdXRvJykge1xuXHRcdFx0c2VsZWN0ZWRJdGVtcy5wdXNoKHRoaXMuX2F1dG9RdWlja1BpY2tJdGVtKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdHdoaWxlIChpbmRleCA8IGl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAoaXRlbXNbaW5kZXhdLnR5cGUgPT09ICdzZXBhcmF0b3InKSB7XG5cdFx0XHRcdFx0aW5kZXgrKztcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIuc29tZShyZWYgPT4gcmVmLmlkID09PSBpdGVtc1tpbmRleF0uaWQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zLnNwbGljZShpbmRleCwgMSkgYXMgSGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtW107XG5cdFx0XHRcdFx0c2VsZWN0ZWRJdGVtcy5wdXNoKC4uLml0ZW0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5zZXJ0IHRoZSBzZWxlY3RlZCBpdGVtcyBhZnRlciBgQWxsYCBhbmQgYEF1dG9gXG5cdFx0XHRpdGVtcy5zcGxpY2UoMiwgMCwgeyB0eXBlOiAnc2VwYXJhdG9yJyB9LCAuLi5zZWxlY3RlZEl0ZW1zKTtcblx0XHR9XG5cblx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IHNlbGVjdGVkSXRlbXM7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSBmYWxzZTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxIaXN0b3J5SXRlbVJlZnNGaWx0ZXIgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZENoYW5nZVNlbGVjdGlvbihpdGVtcyA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYWRkZWQgfSA9IGRlbHRhKHNlbGVjdGVkSXRlbXMsIGl0ZW1zLCAoYSwgYikgPT4gY29tcGFyZShhLmlkID8/ICcnLCBiLmlkID8/ICcnKSk7XG5cdFx0XHRcdGlmIChhZGRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0aWYgKGFkZGVkWzBdLmhpc3RvcnlJdGVtUmVmID09PSAnYWxsJyB8fCBhZGRlZFswXS5oaXN0b3J5SXRlbVJlZiA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IFthZGRlZFswXV07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFJlbW92ZSAnYWxsJyBhbmQgJ2F1dG8nIGl0ZW1zIGlmIHByZXNlbnRcblx0XHRcdFx0XHRcdHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zID0gWy4uLnF1aWNrUGljay5zZWxlY3RlZEl0ZW1zXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIoaSA9PiBpLmhpc3RvcnlJdGVtUmVmICE9PSAnYWxsJyAmJiBpLmhpc3RvcnlJdGVtUmVmICE9PSAnYXV0bycpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZWxlY3RlZEl0ZW1zID0gWy4uLnF1aWNrUGljay5zZWxlY3RlZEl0ZW1zXTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3RlZEl0ZW1zWzBdLmhpc3RvcnlJdGVtUmVmID09PSAnYWxsJykge1xuXHRcdFx0XHRcdHJlc29sdmUoJ2FsbCcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkSXRlbXMubGVuZ3RoID09PSAxICYmIHNlbGVjdGVkSXRlbXNbMF0uaGlzdG9yeUl0ZW1SZWYgPT09ICdhdXRvJykge1xuXHRcdFx0XHRcdHJlc29sdmUoJ2F1dG8nKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHNlbGVjdGVkSXRlbXMubWFwKGl0ZW0gPT4gKGl0ZW0uaGlzdG9yeUl0ZW1SZWYgYXMgSVNDTUhpc3RvcnlJdGVtUmVmKS5pZCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlUXVpY2tQaWNrSXRlbXMoKTogUHJvbWlzZTwoSGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXT4ge1xuXHRcdGNvbnN0IHBpY2tzOiAoSGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtcblx0XHRcdHRoaXMuX2FsbFF1aWNrUGlja0l0ZW0sIHRoaXMuX2F1dG9RdWlja1BpY2tJdGVtXG5cdFx0XTtcblxuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmcyA9IGF3YWl0IHRoaXMuX2hpc3RvcnlQcm92aWRlci5wcm92aWRlSGlzdG9yeUl0ZW1SZWZzKCkgPz8gW107XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWZzQnlDYXRlZ29yeSA9IGdyb3VwQnkoaGlzdG9yeUl0ZW1SZWZzLCAoYSwgYikgPT4gY29tcGFyZShhLmNhdGVnb3J5ID8/ICcnLCBiLmNhdGVnb3J5ID8/ICcnKSk7XG5cblx0XHRmb3IgKGNvbnN0IHJlZnMgb2YgaGlzdG9yeUl0ZW1SZWZzQnlDYXRlZ29yeSkge1xuXHRcdFx0aWYgKHJlZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiByZWZzWzBdLmNhdGVnb3J5IH0pO1xuXG5cdFx0XHRwaWNrcy5wdXNoKC4uLnJlZnMubWFwKHJlZiA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHJlZi5pZCxcblx0XHRcdFx0XHRsYWJlbDogcmVmLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHJlZi5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihyZWYuaWNvbikgP1xuXHRcdFx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHJlZi5pY29uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlZjogcmVmXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBpY2tzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTQ01IaXN0b3J5Vmlld1BhbmUgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSBfdHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF90cmVlITogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxTQ01IaXN0b3J5Vmlld01vZGVsLCBUcmVlRWxlbWVudCwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgX3RyZWVWaWV3TW9kZWwhOiBTQ01IaXN0b3J5Vmlld01vZGVsO1xuXHRwcml2YXRlIF90cmVlRGF0YVNvdXJjZSE6IFNDTUhpc3RvcnlUcmVlRGF0YVNvdXJjZTtcblx0cHJpdmF0ZSBfdHJlZUlkZW50aXR5UHJvdmlkZXIhOiBTQ01IaXN0b3J5VHJlZUlkZW50aXR5UHJvdmlkZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeUlzTG9hZGluZ01vcmUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBvc2l0b3J5T3V0ZGF0ZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJpbGl0eURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVPcGVyYXRpb25TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVMb2FkTW9yZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmcmVzaFRocm90dGxlciA9IG5ldyBUaHJvdHRsZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlQ2hpbGRyZW5UaHJvdHRsZXIgPSBuZXcgVGhyb3R0bGVyKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2NtUHJvdmlkZXJDdHg6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc1JlbW90ZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc0Jhc2U6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZJbkZpbHRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVEaXNwb3NhYmxlcyA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHR0aXRsZU1lbnVJZDogTWVudUlkLlNDTUhpc3RvcnlUaXRsZSxcblx0XHRcdHNob3dBY3Rpb25zOiBWaWV3UGFuZVNob3dBY3Rpb25zLldoZW5FeHBhbmRlZFxuXHRcdH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fc2NtUHJvdmlkZXJDdHggPSBDb250ZXh0S2V5cy5TQ01Qcm92aWRlci5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzUmVtb3RlID0gQ29udGV4dEtleXMuU0NNQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzUmVtb3RlLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZIYXNCYXNlID0gQ29udGV4dEtleXMuU0NNQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzQmFzZS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXIgPSBDb250ZXh0S2V5cy5TQ01DdXJyZW50SGlzdG9yeUl0ZW1SZWZJbkZpbHRlci5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9hY3Rpb25SdW5uZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUhpc3RvcnlWaWV3UGFuZUFjdGlvblJ1bm5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWN0aW9uUnVubmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZnJlc2hUaHJvdHRsZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3VwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJIZWFkZXJUaXRsZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyLCB0aGlzLnRpdGxlKTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBoKCdkaXYuc2NtLWdyYXBoLXZpZXctYmFkZ2UtY29udGFpbmVyJywgW1xuXHRcdFx0aCgnZGl2LnNjbS1ncmFwaC12aWV3LWJhZGdlLm1vbmFjby1jb3VudC1iYWRnZS5sb25nQGJhZGdlJylcblx0XHRdKTtcblxuXHRcdGVsZW1lbnQuYmFkZ2UudGV4dENvbnRlbnQgPSAnT3V0ZGF0ZWQnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50LnJvb3QpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0ZGF0ZWQgPSB0aGlzLl9yZXBvc2l0b3J5T3V0ZGF0ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0ZWxlbWVudC5yb290LnN0eWxlLmRpc3BsYXkgPSBvdXRkYXRlZCA/ICcnIDogJ25vbmUnO1xuXG5cdFx0XHRpZiAob3V0ZGF0ZWQpIHtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihlbGVtZW50LnJvb3QsIHtcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHRcdFx0c2hvd1BvaW50ZXI6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnc2NtR3JhcGhWaWV3T3V0ZGF0ZWQnLCBcIlBsZWFzZSByZWZyZXNoIHRoZSBncmFwaCB1c2luZyB0aGUgcmVmcmVzaCBhY3Rpb24gKHswfSkuXCIsICckKHJlZnJlc2gpJyksIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSksXG5cdFx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1dcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20tdmlldy5zY20taGlzdG9yeS12aWV3LnNob3ctZmlsZS1pY29ucycpKTtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ZpbGUtaWNvbi10aGVtYWJsZS10cmVlJyk7XG5cblx0XHR0aGlzLl9jcmVhdGVUcmVlKHRoaXMuX3RyZWVDb250YWluZXIpO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KGFzeW5jIHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2liaWxpdHlEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSB2aWV3IG1vZGVsXG5cdFx0XHR0aGlzLl90cmVlVmlld01vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTQ01IaXN0b3J5Vmlld01vZGVsKTtcblx0XHRcdHRoaXMuX3Zpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZVZpZXdNb2RlbCk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIGZpcnN0IHJlcG9zaXRvcnkgdG8gYmUgaW5pdGlhbGl6ZWRcblx0XHRcdGNvbnN0IGZpcnN0UmVwb3NpdG9yeUluaXRpYWxpemVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fdHJlZVZpZXdNb2RlbC5yZXBvc2l0b3J5LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRyZXR1cm4gaGlzdG9yeUl0ZW1SZWYgIT09IHVuZGVmaW5lZCA/IHRydWUgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShmaXJzdFJlcG9zaXRvcnlJbml0aWFsaXplZCk7XG5cblx0XHRcdC8vIEluaXRpYWwgcmVuZGVyaW5nXG5cdFx0XHRhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IHRoaXMuaWQgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl90cmVlLnNldElucHV0KHRoaXMuX3RyZWVWaWV3TW9kZWwpO1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fdmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHRoaXMuX3RyZWVWaWV3TW9kZWwuaXNWaWV3TW9kZWxFbXB0eS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFNldHRpbmdzIGNoYW5nZVxuXHRcdFx0dGhpcy5fdmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChydW5PbkNoYW5nZSh0aGlzLl9zY21WaWV3U2VydmljZS5ncmFwaFNob3dJbmNvbWluZ0NoYW5nZXNDb25maWcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl92aXNpYmlsaXR5RGlzcG9zYWJsZXMuYWRkKHJ1bk9uQ2hhbmdlKHRoaXMuX3NjbVZpZXdTZXJ2aWNlLmdyYXBoU2hvd091dGdvaW5nQ2hhbmdlc0NvbmZpZywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2goKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gUmVwb3NpdG9yeSBjaGFuZ2Vcblx0XHRcdGxldCBpc0ZpcnN0UnVuID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3Zpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fdHJlZVZpZXdNb2RlbC5yZXBvc2l0b3J5LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFyZXBvc2l0b3J5IHx8ICFoaXN0b3J5UHJvdmlkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBIaXN0b3J5SXRlbUlkIGNoYW5nZWQgKGNoZWNrb3V0KVxuXHRcdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZklkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZWYucmVhZChyZWFkZXIpPy5pZDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocnVuT25DaGFuZ2UoaGlzdG9yeUl0ZW1SZWZJZCwgYXN5bmMgaGlzdG9yeUl0ZW1SZWZJZFZhbHVlID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2goKTtcblxuXHRcdFx0XHRcdC8vIFVwZGF0ZSBjb250ZXh0IGtleSAobmVlZHMgdG8gYmUgZG9uZSBhZnRlciB0aGUgcmVmcmVzaCBjYWxsKVxuXHRcdFx0XHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkluRmlsdGVyLnNldCh0aGlzLl9pc0N1cnJlbnRIaXN0b3J5SXRlbUluRmlsdGVyKGhpc3RvcnlJdGVtUmVmSWRWYWx1ZSkpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gSGlzdG9yeUl0ZW1SZWZzIGNoYW5nZWRcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChydW5PbkNoYW5nZShoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZWZDaGFuZ2VzLCBjaGFuZ2VzID0+IHtcblx0XHRcdFx0XHRpZiAoY2hhbmdlcy5zaWxlbnQpIHtcblx0XHRcdFx0XHRcdC8vIFRoZSBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlIGNoYW5nZXMgb2NjdXJyZWQgaW4gdGhlIGJhY2tncm91bmQgKGV4OiBBdXRvIEZldGNoKVxuXHRcdFx0XHRcdFx0Ly8gSWYgdHJlZSBpcyBzY3JvbGxlZCB0byB0aGUgdG9wLCB3ZSBjYW4gc2FmZWx5IHJlZnJlc2ggdGhlIHRyZWUsIG90aGVyd2lzZSB3ZVxuXHRcdFx0XHRcdFx0Ly8gd2lsbCBzaG93IGEgdmlzdWFsIGN1ZSB0aGF0IHRoZSB2aWV3IGlzIG91dGRhdGVkLlxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3RyZWUuc2Nyb2xsVG9wID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFNob3cgdGhlIFwiT3V0ZGF0ZWRcIiBiYWRnZSBvbiB0aGUgdmlld1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVwb3NpdG9yeU91dGRhdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gSGlzdG9yeUl0ZW1SZWZzIGZpbHRlciBjaGFuZ2VkXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocnVuT25DaGFuZ2UodGhpcy5fdHJlZVZpZXdNb2RlbC5vbkRpZENoYW5nZUhpc3RvcnlJdGVtc0ZpbHRlciwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaCgpO1xuXG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGNvbnRleHQga2V5IChuZWVkcyB0byBiZSBkb25lIGFmdGVyIHRoZSByZWZyZXNoIGNhbGwpXG5cdFx0XHRcdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXIuc2V0KHRoaXMuX2lzQ3VycmVudEhpc3RvcnlJdGVtSW5GaWx0ZXIoaGlzdG9yeUl0ZW1SZWZJZC5yZWFkKHVuZGVmaW5lZCkpKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEhpc3RvcnlJdGVtUmVtb3RlUmVmIGNoYW5nZWRcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzUmVtb3RlLnNldCghIWhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlbW90ZVJlZi5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gSGlzdG9yeUl0ZW1CYXNlUmVmIGNoYW5nZWRcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzQmFzZS5zZXQoISFoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1CYXNlUmVmLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBWaWV3TW9kZSBjaGFuZ2VkXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocnVuT25DaGFuZ2UodGhpcy5fdHJlZVZpZXdNb2RlbC52aWV3TW9kZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBVcGRhdGUgY29udGV4dFxuXHRcdFx0XHR0aGlzLl9zY21Qcm92aWRlckN0eC5zZXQocmVwb3NpdG9yeS5wcm92aWRlci5wcm92aWRlcklkKTtcblx0XHRcdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXIuc2V0KHRoaXMuX2lzQ3VycmVudEhpc3RvcnlJdGVtSW5GaWx0ZXIoaGlzdG9yeUl0ZW1SZWZJZC5yZWFkKHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0XHQvLyBXZSBza2lwIHJlZnJlc2hpbmcgdGhlIGdyYXBoIG9uIHRoZSBmaXJzdCBleGVjdXRpb24gb2YgdGhlIGF1dG9ydW5cblx0XHRcdFx0Ly8gc2luY2UgdGhlIGdyYXBoIGZvciB0aGUgZmlyc3QgcmVwb3NpdG9yeSBpcyByZW5kZXJlZCB3aGVuIHRoZSB0cmVlXG5cdFx0XHRcdC8vIGlucHV0IGlzIHNldC5cblx0XHRcdFx0aWYgKCFpc0ZpcnN0UnVuKSB7XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aXNGaXJzdFJ1biA9IGZhbHNlO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBGaWxlSWNvblRoZW1lICYgdmlld01vZGUgY2hhbmdlXG5cdFx0XHRjb25zdCBmaWxlSWNvblRoZW1lT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdFx0dGhpcy50aGVtZVNlcnZpY2Uub25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkpO1xuXG5cdFx0XHR0aGlzLl92aXNpYmlsaXR5RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgZmlsZUljb25UaGVtZSA9IGZpbGVJY29uVGhlbWVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZSA9IHRoaXMuX3RyZWVWaWV3TW9kZWwudmlld01vZGUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUluZGVudFN0eWxlcyhmaWxlSWNvblRoZW1lLCB2aWV3TW9kZSk7XG5cdFx0XHR9KSk7XG5cdFx0fSwgdGhpcywgdGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuX3RyZWUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uUnVubmVyKCk6IElBY3Rpb25SdW5uZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBY3Rpb25zQ29udGV4dCgpOiBJU0NNUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90cmVlVmlld01vZGVsPy5yZXBvc2l0b3J5LmdldCgpPy5wcm92aWRlcjtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9ucz86IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChhY3Rpb24uaWQgPT09IFBJQ0tfUkVQT1NJVE9SWV9BQ1RJT05fSUQpIHtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl90cmVlVmlld01vZGVsPy5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnkpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTQ01SZXBvc2l0b3J5QWN0aW9uVmlld0l0ZW0ocmVwb3NpdG9yeSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gUElDS19ISVNUT1JZX0lURU1fUkVGU19BQ1RJT05fSUQpIHtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl90cmVlVmlld01vZGVsPy5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1zRmlsdGVyID0gdGhpcy5fdHJlZVZpZXdNb2RlbD8uZ2V0SGlzdG9yeUl0ZW1zRmlsdGVyKCk7XG5cdFx0XHRpZiAocmVwb3NpdG9yeSAmJiBoaXN0b3J5SXRlbXNGaWx0ZXIpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTQ01IaXN0b3J5SXRlbVJlZnNBY3Rpb25WaWV3SXRlbShyZXBvc2l0b3J5LCBoaXN0b3J5SXRlbXNGaWx0ZXIsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdHRoaXMuX3RyZWUuZm9jdXNGaXJzdChmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0dGhpcy5fdHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkU2hvd1dlbGNvbWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWVWaWV3TW9kZWw/LmlzVmlld01vZGVsRW1wdHkuZ2V0KCkgPT09IHRydWU7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWZyZXNoVGhyb3R0bGVyLnF1ZXVlKHRva2VuID0+IHRoaXMuX3JlZnJlc2godG9rZW4pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2godG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJlZVZpZXdNb2RlbC5jbGVhclJlcG9zaXRvcnlTdGF0ZSgpO1xuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZUNoaWxkcmVuKCk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHR0aGlzLl9yZXBvc2l0b3J5T3V0ZGF0ZWQuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gMDtcblx0fVxuXG5cdGFzeW5jIHBpY2tSZXBvc2l0b3J5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBpY2tlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcG9zaXRvcnlQaWNrZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBpY2tlci5waWNrUmVwb3NpdG9yeSgpO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0dGhpcy5fdHJlZVZpZXdNb2RlbC5zZXRSZXBvc2l0b3J5KHJlc3VsdC5yZXBvc2l0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwaWNrSGlzdG9yeUl0ZW1SZWYoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3RyZWVWaWV3TW9kZWwucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSByZXBvc2l0b3J5Py5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1zRmlsdGVyID0gdGhpcy5fdHJlZVZpZXdNb2RlbC5nZXRIaXN0b3J5SXRlbXNGaWx0ZXIoKTtcblxuXHRcdGlmICghaGlzdG9yeVByb3ZpZGVyIHx8ICFoaXN0b3J5SXRlbXNGaWx0ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShIaXN0b3J5SXRlbVJlZlBpY2tlciwgaGlzdG9yeVByb3ZpZGVyLCBoaXN0b3J5SXRlbXNGaWx0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBpY2tlci5waWNrSGlzdG9yeUl0ZW1SZWYoKTtcblxuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHRoaXMuX3RyZWVWaWV3TW9kZWwuc2V0SGlzdG9yeUl0ZW1zRmlsdGVyKHJlc3VsdCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmV2ZWFsQ3VycmVudEhpc3RvcnlJdGVtKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl90cmVlVmlld01vZGVsLnJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlZi5nZXQoKTtcblx0XHRpZiAoIXJlcG9zaXRvcnkgfHwgIWhpc3RvcnlJdGVtUmVmPy5pZCB8fCAhaGlzdG9yeUl0ZW1SZWY/LnJldmlzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRIaXN0b3J5SXRlbUluRmlsdGVyKGhpc3RvcnlJdGVtUmVmLmlkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldmVhbFRyZWVOb2RlID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1UcmVlRWxlbWVudCA9IHRoaXMuX3RyZWVWaWV3TW9kZWwuZ2V0Q3VycmVudEhpc3RvcnlJdGVtVHJlZUVsZW1lbnQoKTtcblxuXHRcdFx0aWYgKGhpc3RvcnlJdGVtVHJlZUVsZW1lbnQgJiYgdGhpcy5fdHJlZS5oYXNOb2RlKGhpc3RvcnlJdGVtVHJlZUVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGhpc3RvcnlJdGVtVHJlZUVsZW1lbnQsIDAuNSk7XG5cblx0XHRcdFx0dGhpcy5fdHJlZS5zZXRTZWxlY3Rpb24oW2hpc3RvcnlJdGVtVHJlZUVsZW1lbnRdKTtcblx0XHRcdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhbaGlzdG9yeUl0ZW1UcmVlRWxlbWVudF0pO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHRpZiAocmV2ZWFsVHJlZU5vZGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZldGNoIGN1cnJlbnQgaGlzdG9yeSBpdGVtXG5cdFx0YXdhaXQgdGhpcy5fbG9hZE1vcmUoaGlzdG9yeUl0ZW1SZWYucmV2aXNpb24pO1xuXG5cdFx0Ly8gUmV2ZWFsIG5vZGVcblx0XHRyZXZlYWxUcmVlTm9kZSgpO1xuXHR9XG5cblx0c2V0Vmlld01vZGUodmlld01vZGU6IFZpZXdNb2RlKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZVZpZXdNb2RlbC5zZXRWaWV3TW9kZSh2aWV3TW9kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUcmVlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlSWRlbnRpdHlQcm92aWRlciA9IG5ldyBTQ01IaXN0b3J5VHJlZUlkZW50aXR5UHJvdmlkZXIoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlTGFiZWxzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSB9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNvdXJjZUxhYmVscyk7XG5cblx0XHR0aGlzLl90cmVlRGF0YVNvdXJjZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU0NNSGlzdG9yeVRyZWVEYXRhU291cmNlLCAoKSA9PiB0aGlzLl90cmVlVmlld01vZGVsLnZpZXdNb2RlLmdldCgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlRGF0YVNvdXJjZSk7XG5cblx0XHRjb25zdCBjb21wcmVzc2lvbkVuYWJsZWQgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoJ3NjbS5jb21wYWN0Rm9sZGVycycsIHRydWUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLFxuXHRcdFx0J1NDTSBIaXN0b3J5IFRyZWUnLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IExpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0bmV3IFNDTUhpc3RvcnlUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEhpc3RvcnlJdGVtUmVuZGVyZXIsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodGhpcy5pZCkpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEhpc3RvcnlJdGVtQ2hhbmdlUmVuZGVyZXIsICgpID0+IHRoaXMuX3RyZWVWaWV3TW9kZWwudmlld01vZGUuZ2V0KCksIHJlc291cmNlTGFiZWxzKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShIaXN0b3J5SXRlbUxvYWRNb3JlUmVuZGVyZXIsIHRoaXMuX3JlcG9zaXRvcnlJc0xvYWRpbmdNb3JlLCAoKSA9PiB0aGlzLl9sb2FkTW9yZSgpKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLl90cmVlRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgU0NNSGlzdG9yeVRyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogdGhpcy5fdHJlZUlkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRcdGNvbGxhcHNlQnlEZWZhdWx0OiAoZTogdW5rbm93bikgPT4gIWlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VOb2RlKGUpLFxuXHRcdFx0XHRjb21wcmVzc2lvbkVuYWJsZWQ6IGNvbXByZXNzaW9uRW5hYmxlZC5nZXQoKSxcblx0XHRcdFx0ZG5kOiBuZXcgU0NNSGlzdG9yeVRyZWVEcmFnQW5kRHJvcCgpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBuZXcgU0NNSGlzdG9yeVRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyKCksXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHR0d2lzdGllQWRkaXRpb25hbENzc0NsYXNzOiAoZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoZSkgfHwgaXNTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQoZSlcblx0XHRcdFx0XHRcdD8gJ2ZvcmNlLW5vLXR3aXN0aWUnXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkgYXMgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxTQ01IaXN0b3J5Vmlld01vZGVsLCBUcmVlRWxlbWVudCwgRnV6enlTY29yZT47XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZSk7XG5cblx0XHR0aGlzLl90cmVlLm9uRGlkT3Blbih0aGlzLl9vbkRpZE9wZW4sIHRoaXMsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl90cmVlLm9uQ29udGV4dE1lbnUodGhpcy5fb25Db250ZXh0TWVudSwgdGhpcywgdGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDdXJyZW50SGlzdG9yeUl0ZW1JbkZpbHRlcihoaXN0b3J5SXRlbVJlZklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWhpc3RvcnlJdGVtUmVmSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5SXRlbUZpbHRlciA9IHRoaXMuX3RyZWVWaWV3TW9kZWwuZ2V0SGlzdG9yeUl0ZW1zRmlsdGVyKCk7XG5cdFx0aWYgKGhpc3RvcnlJdGVtRmlsdGVyID09PSAnYWxsJyB8fCBoaXN0b3J5SXRlbUZpbHRlciA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShoaXN0b3J5SXRlbUZpbHRlcikgJiYgISFoaXN0b3J5SXRlbUZpbHRlci5maW5kKHJlZiA9PiByZWYuaWQgPT09IGhpc3RvcnlJdGVtUmVmSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25EaWRPcGVuKGU6IElPcGVuRXZlbnQ8VHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudChlLmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbUNoYW5nZSA9IGUuZWxlbWVudC5oaXN0b3J5SXRlbUNoYW5nZTtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZS5lbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1EaXNwbGF5SWQgPSBoaXN0b3J5SXRlbS5pZCA9PT0gU0NNSW5jb21pbmdIaXN0b3J5SXRlbUlkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2luY29taW5nQ2hhbmdlcycsIFwiSW5jb21pbmcgQ2hhbmdlc1wiKVxuXHRcdFx0XHQ6IGhpc3RvcnlJdGVtLmlkID09PSBTQ01PdXRnb2luZ0hpc3RvcnlJdGVtSWRcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdvdXRnb2luZ0NoYW5nZXMnLCBcIk91dGdvaW5nIENoYW5nZXNcIilcblx0XHRcdFx0XHQ6IGhpc3RvcnlJdGVtLmRpc3BsYXlJZCA/PyBoaXN0b3J5SXRlbS5pZDtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1QYXJlbnRJZCA9IGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGggPiAwID8gaGlzdG9yeUl0ZW0ucGFyZW50SWRzWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1QYXJlbnREaXNwbGF5SWQgPSBoaXN0b3J5SXRlbVBhcmVudElkICYmIGhpc3RvcnlJdGVtLmRpc3BsYXlJZFxuXHRcdFx0XHQ/IGhpc3RvcnlJdGVtUGFyZW50SWQuc3Vic3RyaW5nKDAsIGhpc3RvcnlJdGVtLmRpc3BsYXlJZC5sZW5ndGgpXG5cdFx0XHRcdDogaGlzdG9yeUl0ZW1QYXJlbnRJZDtcblxuXHRcdFx0aWYgKGhpc3RvcnlJdGVtQ2hhbmdlLm9yaWdpbmFsVXJpICYmIGhpc3RvcnlJdGVtQ2hhbmdlLm1vZGlmaWVkVXJpKSB7XG5cdFx0XHRcdC8vIERpZmYgRWRpdG9yXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpVGl0bGUgPSBgJHtiYXNlbmFtZShoaXN0b3J5SXRlbUNoYW5nZS5vcmlnaW5hbFVyaS5mc1BhdGgpfSAoJHtoaXN0b3J5SXRlbVBhcmVudERpc3BsYXlJZH0pYDtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRVcmlUaXRsZSA9IGAke2Jhc2VuYW1lKGhpc3RvcnlJdGVtQ2hhbmdlLm1vZGlmaWVkVXJpLmZzUGF0aCl9ICgke2hpc3RvcnlJdGVtRGlzcGxheUlkfSlgO1xuXG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gYCR7b3JpZ2luYWxVcmlUaXRsZX0gXFx1MjE5NCAke21vZGlmaWVkVXJpVGl0bGV9YDtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRsYWJlbDogdGl0bGUsXG5cdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGhpc3RvcnlJdGVtQ2hhbmdlLm9yaWdpbmFsVXJpIH0sXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGhpc3RvcnlJdGVtQ2hhbmdlLm1vZGlmaWVkVXJpIH0sXG5cdFx0XHRcdFx0b3B0aW9uczogZS5lZGl0b3JPcHRpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdGxhYmVsOiBgJHtiYXNlbmFtZShoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaS5mc1BhdGgpfSAoJHtoaXN0b3J5SXRlbURpc3BsYXlJZH0pYCxcblx0XHRcdFx0XHRyZXNvdXJjZTogaGlzdG9yeUl0ZW1DaGFuZ2UubW9kaWZpZWRVcmksXG5cdFx0XHRcdFx0b3B0aW9uczogZS5lZGl0b3JPcHRpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChoaXN0b3J5SXRlbUNoYW5nZS5vcmlnaW5hbFVyaSkge1xuXHRcdFx0XHQvLyBFZGl0b3IgKERlbGV0ZWQpXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0bGFiZWw6IGAke2Jhc2VuYW1lKGhpc3RvcnlJdGVtQ2hhbmdlLm9yaWdpbmFsVXJpLmZzUGF0aCl9ICgke2hpc3RvcnlJdGVtUGFyZW50RGlzcGxheUlkfSlgLFxuXHRcdFx0XHRcdHJlc291cmNlOiBoaXN0b3J5SXRlbUNoYW5nZS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiBlLmVkaXRvck9wdGlvbnNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtTG9hZE1vcmVUcmVlRWxlbWVudChlLmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBwYWdlT25TY3JvbGwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uZ3JhcGgucGFnZU9uU2Nyb2xsJykgPT09IHRydWU7XG5cdFx0XHRpZiAoIXBhZ2VPblNjcm9sbCkge1xuXHRcdFx0XHR0aGlzLl9sb2FkTW9yZSgpO1xuXHRcdFx0XHR0aGlzLl90cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VHJlZUVsZW1lbnQgfCBudWxsPik6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cblx0XHRpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBIaXN0b3J5SXRlbVxuXHRcdFx0aWYgKGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ2luY29taW5nLWNoYW5nZXMnIHx8IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ291dGdvaW5nLWNoYW5nZXMnKSB7XG5cdFx0XHRcdC8vIEluY29taW5nL091dGdvaW5nIGNoYW5nZXMgbm9kZSBkb2VzIG5vdCBzdXBwb3J0IGFueSBjb250ZXh0IG1lbnUgYWN0aW9uc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2NvbnRleHRNZW51RGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IGVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZWYuZ2V0KCk7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmTWVudUl0ZW1zID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuU0NNSGlzdG9yeUl0ZW1SZWZDb250ZXh0KS5maWx0ZXIoaXRlbSA9PiBpc0lNZW51SXRlbShpdGVtKSk7XG5cblx0XHRcdC8vIElmIHRoZXJlIGFyZSBhbnkgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZXMgd2UgaGF2ZSB0byBhZGQgYSBzdWJtZW51IGl0ZW0gZm9yIGVhY2ggb3JpZ25hbCBhY3Rpb24sXG5cdFx0XHQvLyBhbmQgYSBtZW51IGl0ZW0gZm9yIGVhY2ggaGlzdG9yeSBpdGVtIHJlZiB0aGF0IG1hdGNoZXMgdGhlIGB3aGVuYCBjbGF1c2Ugb2YgdGhlIG9yaWdpbmFsIGFjdGlvbi5cblx0XHRcdGlmIChoaXN0b3J5SXRlbVJlZk1lbnVJdGVtcy5sZW5ndGggPiAwICYmIGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmQWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU0NNSGlzdG9yeUl0ZW1SZWZbXT4oKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHJlZiBvZiBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtLnJlZmVyZW5jZXMpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRcdFx0XHRbJ3NjbUhpc3RvcnlJdGVtUmVmJywgcmVmLmlkXVxuXHRcdFx0XHRcdF0pO1xuXG5cdFx0XHRcdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhcblx0XHRcdFx0XHRcdE1lbnVJZC5TQ01IaXN0b3J5SXRlbVJlZkNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIG1lbnVBY3Rpb25zLmZsYXRNYXAoYSA9PiBhWzFdKSkge1xuXHRcdFx0XHRcdFx0aWYgKCFoaXN0b3J5SXRlbVJlZkFjdGlvbnMuaGFzKGFjdGlvbi5pZCkpIHtcblx0XHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZBY3Rpb25zLnNldChhY3Rpb24uaWQsIFtdKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZBY3Rpb25zLmdldChhY3Rpb24uaWQpIS5wdXNoKHJlZik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVnaXN0ZXIgc3VibWVudSwgbWVudSBpdGVtc1xuXHRcdFx0XHRmb3IgKGNvbnN0IGhpc3RvcnlJdGVtUmVmTWVudUl0ZW0gb2YgaGlzdG9yeUl0ZW1SZWZNZW51SXRlbXMpIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25JZCA9IGhpc3RvcnlJdGVtUmVmTWVudUl0ZW0uY29tbWFuZC5pZDtcblxuXHRcdFx0XHRcdGlmICghaGlzdG9yeUl0ZW1SZWZBY3Rpb25zLmhhcyhhY3Rpb25JZCkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJlZ2lzdGVyIHRoZSBzdWJtZW51IGZvciB0aGUgb3JpZ2luYWwgYWN0aW9uXG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVEaXNwb3NhYmxlcy52YWx1ZS5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNvbnRleHQsIHtcblx0XHRcdFx0XHRcdHRpdGxlOiBoaXN0b3J5SXRlbVJlZk1lbnVJdGVtLmNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0XHRzdWJtZW51OiBNZW51SWQuZm9yKGFjdGlvbklkKSxcblx0XHRcdFx0XHRcdGdyb3VwOiBoaXN0b3J5SXRlbVJlZk1lbnVJdGVtPy5ncm91cCxcblx0XHRcdFx0XHRcdG9yZGVyOiBoaXN0b3J5SXRlbVJlZk1lbnVJdGVtPy5vcmRlclxuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdC8vIFJlZ2lzdGVyIHRoZSBhY3Rpb24gZm9yIHRoZSBoaXN0b3J5IGl0ZW0gcmVmXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBoaXN0b3J5SXRlbVJlZiBvZiBoaXN0b3J5SXRlbVJlZkFjdGlvbnMuZ2V0KGFjdGlvbklkKSA/PyBbXSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVEaXNwb3NhYmxlcy52YWx1ZS5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBgJHthY3Rpb25JZH0uJHtoaXN0b3J5SXRlbVJlZi5pZH1gLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGhpc3RvcnlJdGVtUmVmLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuZm9yKGFjdGlvbklkKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Z3JvdXA6IGhpc3RvcnlJdGVtUmVmLmNhdGVnb3J5XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGFjdGlvbklkLCAuLi5hcmdzLCBoaXN0b3J5SXRlbVJlZi5pZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0XHRbJ3NjbUhpc3RvcnlJdGVtSGFzQ3VycmVudEhpc3RvcnlJdGVtUmVmJywgaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcz8uZmluZChyZWYgPT4gcmVmLmlkID09PSBoaXN0b3J5SXRlbVJlZj8uaWQpICE9PSB1bmRlZmluZWRdXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhcblx0XHRcdFx0TWVudUlkLlNDTUhpc3RvcnlJdGVtQ29udGV4dCxcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2UsIHtcblx0XHRcdFx0YXJnOiBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXIsXG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9KS5maWx0ZXIoZ3JvdXAgPT4gZ3JvdXBbMF0gIT09ICdpbmxpbmUnKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudUFjdGlvbnMpLFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdC8vIEhpc3RvcnlJdGVtQ2hhbmdlXG5cdFx0XHRjb25zdCBtZW51QWN0aW9ucyA9IHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKFxuXHRcdFx0XHRNZW51SWQuU0NNSGlzdG9yeUl0ZW1DaGFuZ2VDb250ZXh0LFxuXHRcdFx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCB7XG5cdFx0XHRcdGFyZzogZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbSxcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH0pLmZpbHRlcihncm91cCA9PiBncm91cFswXSAhPT0gJ2lubGluZScpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51QWN0aW9ucyksXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlbGVtZW50Lmhpc3RvcnlJdGVtQ2hhbmdlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9sb2FkTW9yZShjdXJzb3I/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZUxvYWRNb3JlU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9yZXBvc2l0b3J5SXNMb2FkaW5nTW9yZS5nZXQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlcG9zaXRvcnlJc0xvYWRpbmdNb3JlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fdHJlZVZpZXdNb2RlbC5sb2FkTW9yZShjdXJzb3IpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0dGhpcy5fcmVwb3NpdG9yeUlzTG9hZGluZ01vcmUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2hpbGRyZW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyLnF1ZXVlKFxuXHRcdFx0KCkgPT4gdGhpcy5fdHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZShcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogdGhpcy5pZCwgZGVsYXk6IDEwMCB9LFxuXHRcdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl90cmVlLnVwZGF0ZUNoaWxkcmVuKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBkaWZmSWRlbnRpdHlQcm92aWRlcjogdGhpcy5fdHJlZUlkZW50aXR5UHJvdmlkZXJcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSW5kZW50U3R5bGVzKHRoZW1lOiBJRmlsZUljb25UaGVtZSwgdmlld01vZGU6IFZpZXdNb2RlKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdsaXN0LXZpZXctbW9kZScsIHZpZXdNb2RlID09PSBWaWV3TW9kZS5MaXN0KTtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3RyZWUtdmlldy1tb2RlJywgdmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWUpO1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWxpZ24taWNvbnMtYW5kLXR3aXN0aWVzJywgKHZpZXdNb2RlID09PSBWaWV3TW9kZS5MaXN0ICYmIHRoZW1lLmhhc0ZpbGVJY29ucykgfHwgKHRoZW1lLmhhc0ZpbGVJY29ucyAmJiAhdGhlbWUuaGFzRm9sZGVySWNvbnMpKTtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUtYXJyb3dzJywgdmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWUgJiYgdGhlbWUuaGlkZXNFeHBsb3JlckFycm93cyA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRleHRNZW51RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Zpc2liaWxpdHlEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsUUFBUSxHQUFHLGFBQWE7QUFDcEMsU0FBUyxrQkFBZ0U7QUFDekUsU0FBUyxpQkFBaUI7QUFJMUIsU0FBUyxxQkFBeUM7QUFDbEQsU0FBUyxvQkFBb0IsWUFBWSxpQkFBOEIseUJBQXlCO0FBQ2hHLFNBQVMsU0FBUyxTQUFzQixpQkFBaUIsY0FBYyxpQkFBaUIsb0JBQW9CLHFCQUFxQixhQUFhLHdCQUE2QztBQUMzTCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBcUIsMENBQTBDO0FBQy9ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZ0Msa0JBQWtCO0FBQzNELFNBQXlCLHFCQUFxQjtBQUM5QyxTQUEyQixZQUFZLFVBQVUsMkJBQTJCO0FBQzVFLFNBQVMsd0JBQXdCLDZCQUE2QjtBQUM5RCxTQUFTLDJCQUEyQixpQ0FBaUMsZ0JBQWdCLGtDQUFrQyxpQ0FBaUMsd0NBQXdDLHFCQUFxQixpQ0FBaUM7QUFDdFAsU0FBUywyQkFBMkIsZ0JBQWdCLDRCQUE0Qiw0Q0FBNEMscUNBQXFDLHNDQUFzQyx1QkFBdUI7QUFDOU4sU0FBK1AsMEJBQTBCLGdDQUFnQztBQUN6VCxT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QUFnQixDQUFDLE1BQU0sY0FBZTtBQUNwSyxTQUFLLGVBQWUsVUFBVSxPQUFPLGVBQWUsYUFBYSxTQUFTLFFBQVEsTUFBTSx3QkFBd0IsSUFBSTtBQUFBLEVBQ3JIO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLHdCQUF3QixRQUFRO0FBQ3JDLFNBQUssdUJBQXVCLFFBQVE7QUFDcEMsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBNW1CYSxxQkFBTjtBQUFBLEVBNEJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBekNVOyIsCiAgIm5hbWVzIjogWyJrZXkiLCAiaGlzdG9yeUl0ZW1SZWZzIiwgIml0ZW1zIiwgInJlYWRlciIsICJjb250ZXh0S2V5U2VydmljZSIsICJtZW51QWN0aW9ucyIsICJoaXN0b3J5SXRlbVJlZiJdCn0K
