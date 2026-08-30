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
import "./media/editortabscontrol.css";
import { localize } from "../../../../nls.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { $, getActiveWindow, getWindow, isMouseEvent, setVisibility } from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ActionsOrientation, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionRunner, toAction } from "../../../../base/common/actions.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { DraggedEditorGroupIdentifier, fillEditorsDragData, isWindowDraggedOver } from "../../dnd.js";
import { EditorPane } from "./editorPane.js";
import { EditorResourceAccessor, SideBySideEditor, EditorsOrder, EditorInputCapabilities, Verbosity } from "../../../common/editor.js";
import { ResourceContextKey, ActiveEditorPinnedContext, ActiveEditorStickyContext, ActiveEditorDirtyContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, ActiveEditorFirstInGroupContext, ActiveEditorAvailableEditorIdsContext, applyAvailableEditorIds, ActiveEditorLastInGroupContext, ActiveEditorCannotCloseContext } from "../../../common/contextkeys.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { isFirefox } from "../../../../base/browser/browser.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { WorkbenchToolBar, HiddenItemStrategy } from "../../../../platform/actions/browser/toolbar.js";
import { LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { EDITOR_CORE_NAVIGATION_COMMANDS } from "./editorCommands.js";
import { MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
class EditorCommandsContextActionRunner extends ActionRunner {
  constructor(context) {
    super();
    this.context = context;
  }
  run(action, context) {
    let mergedContext = this.context;
    if (context?.preserveFocus) {
      mergedContext = {
        ...this.context,
        preserveFocus: true
      };
    }
    return super.run(action, mergedContext);
  }
}
let EditorTabsControl = class extends Themable {
  constructor(parent, editorPartsView, groupsView, groupView, tabsModel, menuIds, breadcrumbsInHeader, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorResolverService, hostService, menuService) {
    super(themeService);
    this.parent = parent;
    this.editorPartsView = editorPartsView;
    this.groupsView = groupsView;
    this.groupView = groupView;
    this.tabsModel = tabsModel;
    this.menuIds = menuIds;
    this.breadcrumbsInHeader = breadcrumbsInHeader;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.quickInputService = quickInputService;
    this.editorResolverService = editorResolverService;
    this.hostService = hostService;
    this.menuService = menuService;
    this.editorTransfer = LocalSelectionTransfer.getInstance();
    this.groupTransfer = LocalSelectionTransfer.getInstance();
    this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
    this.editorActionsToolbarDisposables = this._register(new DisposableStore());
    this.editorActionsDisposables = this._register(new DisposableStore());
    /** Whether the editor-actions toolbar currently has any actions (drives the layout-actions separator). */
    this.editorActionsToolbarHasActions = false;
    this.editorActionsToolbarHasTrailingSeparator = false;
    this.addTabControlHasActions = false;
    this.addTabControlHasTrailingSeparator = false;
    this.editorLayoutActionsToolbarDisposables = this._register(new DisposableStore());
    this.editorLayoutActionsDisposables = this._register(new DisposableStore());
    this.renderDropdownAsChildElement = false;
    const container = this.create(parent);
    this.contextMenuContextKeyService = this._register(this.contextKeyService.createScoped(container));
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this.contextMenuContextKeyService]
    )));
    this.resourceContext = this._register(scopedInstantiationService.createInstance(ResourceContextKey));
    this.editorPinnedContext = ActiveEditorPinnedContext.bindTo(this.contextMenuContextKeyService);
    this.editorIsFirstContext = ActiveEditorFirstInGroupContext.bindTo(this.contextMenuContextKeyService);
    this.editorIsLastContext = ActiveEditorLastInGroupContext.bindTo(this.contextMenuContextKeyService);
    this.editorStickyContext = ActiveEditorStickyContext.bindTo(this.contextMenuContextKeyService);
    this.editorDirtyContext = ActiveEditorDirtyContext.bindTo(this.contextMenuContextKeyService);
    this.editorAvailableEditorIds = ActiveEditorAvailableEditorIdsContext.bindTo(this.contextMenuContextKeyService);
    this.editorCannotCloseContext = ActiveEditorCannotCloseContext.bindTo(this.contextMenuContextKeyService);
    this.editorCanSplitInGroupContext = ActiveEditorCanSplitInGroupContext.bindTo(this.contextMenuContextKeyService);
    this.sideBySideEditorContext = SideBySideEditorActiveContext.bindTo(this.contextMenuContextKeyService);
    this.groupLockedContext = ActiveEditorGroupLockedContext.bindTo(this.contextMenuContextKeyService);
  }
  create(parent) {
    this.updateTabHeight();
    this.updateTabActionSpaceReservation();
    return parent;
  }
  get editorActionsEnabled() {
    return this.groupsView.partOptions.editorActionsLocation === "default" && this.groupsView.partOptions.showTabs !== "none";
  }
  createEditorActionsToolBar(parent, classes, trailingSeparator = false) {
    this.editorActionsToolbarContainer = $("div");
    this.editorActionsToolbarContainer.classList.add(...classes);
    parent.appendChild(this.editorActionsToolbarContainer);
    this.editorActionsToolbarHasTrailingSeparator = trailingSeparator;
    this.handleEditorActionToolBarVisibility(this.editorActionsToolbarContainer);
    this.editorLayoutActionsSeparator = $("div.editor-actions-separator");
    parent.appendChild(this.editorLayoutActionsSeparator);
    this.editorLayoutActionsToolbarContainer = $("div.editor-layout-actions");
    parent.appendChild(this.editorLayoutActionsToolbarContainer);
    this.handleEditorLayoutActionsToolBarVisibility(this.editorLayoutActionsToolbarContainer);
  }
  createAddTabControl(parent, menuId, before, trailingSeparator = false) {
    const container = $(".tabs-bar-add-tab");
    parent.insertBefore(container, before ?? null);
    this.addTabControlHasTrailingSeparator = trailingSeparator;
    const menu = this._register(this.menuService.createMenu(menuId, this.contextKeyService));
    const getActions = () => getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
    const addTabAction = toAction({
      id: "editor.tabs.addTab",
      label: localize("addTab", "Add Tab"),
      class: ThemeIcon.asClassName(Codicon.add),
      run: () => {
      }
    });
    const dropdown = this._register(new DropdownMenuActionViewItem(addTabAction, { getActions }, this.contextMenuService, {
      classNames: ThemeIcon.asClassNameArray(Codicon.add),
      keybindingProvider: (action) => this.getKeybinding(action)
    }));
    const toolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      ariaLabel: localize("ariaLabelAddTab", "Add Tab"),
      trailingSeparator,
      actionViewItemProvider: (action) => action === addTabAction ? dropdown : void 0
    }));
    toolbar.setActions([addTabAction]);
    const updateVisibility = () => {
      this.addTabControlHasActions = getActions().length > 0;
      container.classList.toggle("hidden", !this.addTabControlHasActions);
      this.updateEditorLayoutActionsSeparator();
    };
    updateVisibility();
    this._register(menu.onDidChange(updateVisibility));
    return container;
  }
  updateEditorLayoutActionsSeparator() {
    const hasLayoutActions = (this.editorLayoutActionsToolbar?.getItemsLength() ?? 0) > 0;
    if (this.editorLayoutActionsSeparator) {
      setVisibility(hasLayoutActions && !this.editorActionsToolbarHasTrailingSeparator && !this.addTabControlHasTrailingSeparator && (this.editorActionsToolbarHasActions || this.addTabControlHasActions), this.editorLayoutActionsSeparator);
    }
  }
  handleEditorActionToolBarVisibility(container) {
    const editorActionsEnabled = this.editorActionsEnabled;
    const editorActionsVisible = !!this.editorActionsToolbar;
    if (editorActionsEnabled && !editorActionsVisible) {
      this.doCreateEditorActionsToolBar(container);
    } else if (!editorActionsEnabled && editorActionsVisible) {
      this.editorActionsToolbar?.getElement().remove();
      this.editorActionsToolbar = void 0;
      this.editorActionsToolbarDisposables.clear();
      this.editorActionsDisposables.clear();
    }
    container.classList.toggle("hidden", !editorActionsEnabled);
  }
  handleEditorLayoutActionsToolBarVisibility(container) {
    const editorActionsEnabled = this.editorActionsEnabled;
    const editorActionsVisible = !!this.editorLayoutActionsToolbar;
    if (editorActionsEnabled && !editorActionsVisible) {
      this.doCreateEditorLayoutActionsToolBar(container);
    } else if (!editorActionsEnabled && editorActionsVisible) {
      this.editorLayoutActionsToolbar?.getElement().remove();
      this.editorLayoutActionsToolbar = void 0;
      this.editorLayoutActionsToolbarDisposables.clear();
      this.editorLayoutActionsDisposables.clear();
    }
    container.classList.toggle("hidden", !editorActionsEnabled);
    if (this.editorLayoutActionsSeparator && !editorActionsEnabled) {
      setVisibility(false, this.editorLayoutActionsSeparator);
    }
  }
  doCreateEditorActionsToolBar(container) {
    const context = { groupId: this.groupView.id };
    const editorActionsMenuId = this.menuIds?.editorActions ?? MenuId.EditorTitle;
    this.editorActionsToolbar = this.editorActionsToolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      orientation: ActionsOrientation.HORIZONTAL,
      ariaLabel: localize("ariaLabelEditorActions", "Editor actions"),
      getKeyBinding: (action) => this.getKeybinding(action),
      actionRunner: this.editorActionsToolbarDisposables.add(new EditorCommandsContextActionRunner(context)),
      anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
      renderDropdownAsChildElement: this.renderDropdownAsChildElement,
      telemetrySource: "editorPart",
      resetMenu: editorActionsMenuId,
      overflowBehavior: { maxItems: 9, exempted: EDITOR_CORE_NAVIGATION_COMMANDS },
      trailingSeparator: this.editorActionsToolbarHasTrailingSeparator,
      highlightToggledItems: true
    }));
    this.editorActionsToolbar.context = context;
    this.editorActionsToolbarDisposables.add(this.editorActionsToolbar.actionRunner.onDidRun((e) => {
      if (e.error && !isCancellationError(e.error)) {
        this.notificationService.error(e.error);
      }
    }));
  }
  doCreateEditorLayoutActionsToolBar(container) {
    const context = { groupId: this.groupView.id };
    this.editorLayoutActionsToolbar = this.editorLayoutActionsToolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      orientation: ActionsOrientation.HORIZONTAL,
      ariaLabel: localize("ariaLabelEditorActionsLayout", "Editor layout actions"),
      getKeyBinding: (action) => this.getKeybinding(action),
      actionRunner: this.editorLayoutActionsToolbarDisposables.add(new EditorCommandsContextActionRunner(context)),
      anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
      renderDropdownAsChildElement: this.renderDropdownAsChildElement,
      telemetrySource: "editorPartTrailing",
      resetMenu: MenuId.EditorTitleLayout,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      highlightToggledItems: true
    }));
    this.editorLayoutActionsToolbar.context = context;
    this.editorLayoutActionsToolbarDisposables.add(this.editorLayoutActionsToolbar.actionRunner.onDidRun((e) => {
      if (e.error && !isCancellationError(e.error)) {
        this.notificationService.error(e.error);
      }
    }));
  }
  actionViewItemProvider(action, options) {
    const activeEditorPane = this.groupView.activeEditorPane;
    if (activeEditorPane instanceof EditorPane) {
      const result = activeEditorPane.getActionViewItem(action, options);
      if (result) {
        return result;
      }
    }
    return createActionViewItem(this.instantiationService, action, { ...options, menuAsChild: this.renderDropdownAsChildElement });
  }
  updateEditorActionsToolbar() {
    if (!this.editorActionsEnabled) {
      return;
    }
    this.editorActionsDisposables.clear();
    const editorActions = this.groupView.createEditorActions(this.editorActionsDisposables, this.menuIds?.editorActions ?? MenuId.EditorTitle);
    this.editorActionsDisposables.add(editorActions.onDidChange(() => this.updateEditorActionsToolbar()));
    const editorActionsToolbar = assertReturnsDefined(this.editorActionsToolbar);
    const { primary, secondary } = this.prepareEditorActions(editorActions.actions);
    editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
    this.editorActionsToolbarHasActions = primary.length > 0 || secondary.length > 0;
    this.updateEditorLayoutActionsToolbar();
  }
  updateEditorLayoutActionsToolbar() {
    if (!this.editorActionsEnabled || !this.editorLayoutActionsToolbarContainer || !this.editorLayoutActionsToolbar) {
      return;
    }
    this.editorLayoutActionsDisposables.clear();
    const editorActions = this.groupView.createEditorActions(this.editorLayoutActionsDisposables, MenuId.EditorTitleLayout);
    this.editorLayoutActionsDisposables.add(editorActions.onDidChange(() => this.updateEditorLayoutActionsToolbar()));
    const { primary, secondary } = this.prepareEditorLayoutActions(editorActions.actions);
    this.editorLayoutActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
    const hasLayoutActions = primary.length > 0 || secondary.length > 0;
    this.updateEditorLayoutActionsSeparator();
    setVisibility(hasLayoutActions, this.editorLayoutActionsToolbarContainer);
  }
  getEditorPaneAwareContextKeyService() {
    return this.groupView.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;
  }
  clearEditorActionsToolbar() {
    if (!this.editorActionsEnabled) {
      return;
    }
    const editorActionsToolbar = assertReturnsDefined(this.editorActionsToolbar);
    editorActionsToolbar.setActions([], []);
    this.editorActionsToolbarHasActions = false;
    this.editorLayoutActionsToolbar?.setActions([], []);
    if (this.editorLayoutActionsSeparator) {
      setVisibility(false, this.editorLayoutActionsSeparator);
    }
    if (this.editorLayoutActionsToolbarContainer) {
      setVisibility(false, this.editorLayoutActionsToolbarContainer);
    }
  }
  onGroupDragStart(e, element) {
    if (e.target !== element) {
      return false;
    }
    const isNewWindowOperation = this.isNewWindowOperation(e);
    this.groupTransfer.setData([new DraggedEditorGroupIdentifier(this.groupView.id)], DraggedEditorGroupIdentifier.prototype);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copyMove";
    }
    let hasDataTransfer = false;
    if (this.groupsView.partOptions.showTabs === "multiple") {
      hasDataTransfer = this.doFillResourceDataTransfers(this.groupView.getEditors(EditorsOrder.SEQUENTIAL), e, isNewWindowOperation);
    } else {
      if (this.groupView.activeEditor) {
        hasDataTransfer = this.doFillResourceDataTransfers([this.groupView.activeEditor], e, isNewWindowOperation);
      }
    }
    if (!hasDataTransfer && isFirefox) {
      e.dataTransfer?.setData(DataTransfers.TEXT, String(this.groupView.label));
    }
    if (this.groupView.activeEditor) {
      let label = this.groupView.activeEditor.getName();
      if (this.groupsView.partOptions.showTabs === "multiple" && this.groupView.count > 1) {
        label = localize("draggedEditorGroup", "{0} (+{1})", label, this.groupView.count - 1);
      }
      applyDragImage(e, element, label);
    }
    return isNewWindowOperation;
  }
  async onGroupDragEnd(e, previousDragEvent, element, isNewWindowOperation) {
    this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
    if (e.target !== element || !isNewWindowOperation || isWindowDraggedOver()) {
      return;
    }
    const auxiliaryEditorPart = await this.maybeCreateAuxiliaryEditorPartAt(e, element);
    if (!auxiliaryEditorPart) {
      return;
    }
    const targetGroup = auxiliaryEditorPart.activeGroup;
    this.groupsView.mergeGroup(this.groupView, targetGroup.id, {
      mode: this.isMoveOperation(previousDragEvent ?? e, targetGroup.id) ? MergeGroupMode.MOVE_EDITORS : MergeGroupMode.COPY_EDITORS
    });
    targetGroup.focus();
  }
  async maybeCreateAuxiliaryEditorPartAt(e, offsetElement) {
    const { point, display } = await this.hostService.getCursorScreenPoint() ?? { point: { x: e.screenX, y: e.screenY } };
    const window = getActiveWindow();
    if (window.document.visibilityState === "visible" && window.document.hasFocus()) {
      if (point.x >= window.screenX && point.x <= window.screenX + window.outerWidth && point.y >= window.screenY && point.y <= window.screenY + window.outerHeight) {
        return;
      }
    }
    const offsetX = offsetElement.offsetWidth / 2;
    const offsetY = 30 + offsetElement.offsetHeight / 2;
    const bounds = {
      x: point.x - offsetX,
      y: point.y - offsetY
    };
    if (display) {
      if (bounds.x < display.x) {
        bounds.x = display.x;
      }
      if (bounds.y < display.y) {
        bounds.y = display.y;
      }
    }
    return this.editorPartsView.createAuxiliaryEditorPart({ bounds });
  }
  isNewWindowOperation(e) {
    if (this.groupsView.partOptions.dragToOpenWindow) {
      return !e.altKey;
    }
    return e.altKey;
  }
  isMoveOperation(e, sourceGroup, sourceEditor) {
    if (sourceEditor?.hasCapability(EditorInputCapabilities.Singleton)) {
      return true;
    }
    const isCopy = e.ctrlKey && !isMacintosh || e.altKey && isMacintosh;
    return !isCopy || sourceGroup === this.groupView.id;
  }
  doFillResourceDataTransfers(editors, e, disableStandardTransfer) {
    if (editors.length) {
      this.instantiationService.invokeFunction(fillEditorsDragData, editors.map((editor) => ({ editor, groupId: this.groupView.id })), e, { disableStandardTransfer });
      return true;
    }
    return false;
  }
  onTabContextMenu(editor, e, node) {
    this.resourceContext.set(EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }));
    this.editorPinnedContext.set(this.tabsModel.isPinned(editor));
    this.editorIsFirstContext.set(this.tabsModel.isFirst(editor));
    this.editorIsLastContext.set(this.tabsModel.isLast(editor));
    this.editorStickyContext.set(this.tabsModel.isSticky(editor));
    this.editorDirtyContext.set(editor.isDirty() && !editor.isSaving());
    this.editorCannotCloseContext.set(editor.hasCapability(EditorInputCapabilities.CannotClose));
    this.groupLockedContext.set(this.tabsModel.isLocked);
    this.editorCanSplitInGroupContext.set(editor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
    this.sideBySideEditorContext.set(editor.typeId === SideBySideEditorInput.ID);
    applyAvailableEditorIds(this.editorAvailableEditorIds, editor, this.editorResolverService);
    let anchor = node;
    if (isMouseEvent(e)) {
      anchor = new StandardMouseEvent(getWindow(node), e);
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      menuId: MenuId.EditorTitleContext,
      menuActionOptions: { shouldForwardArgs: true, arg: this.resourceContext.get() },
      contextKeyService: this.contextMenuContextKeyService,
      getActionsContext: () => ({ groupId: this.groupView.id, editorIndex: this.groupView.getIndexOfEditor(editor) }),
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id, this.contextMenuContextKeyService),
      onHide: () => this.groupsView.activeGroup.focus()
      // restore focus to active group
    });
  }
  getKeybinding(action) {
    return this.keybindingService.lookupKeybinding(action.id, this.getEditorPaneAwareContextKeyService());
  }
  getKeybindingLabel(action) {
    const keybinding = this.getKeybinding(action);
    return keybinding ? keybinding.getLabel() ?? void 0 : void 0;
  }
  get tabHeight() {
    const isCompact = this.groupsView.partOptions.tabHeight === "compact";
    if (this.parent.classList.contains("tabs") && this.parent.closest(".modern-ui-tabs")) {
      return isCompact ? EditorTabsControl.EDITOR_TAB_HEIGHT.modernUICompact : EditorTabsControl.EDITOR_TAB_HEIGHT.modernUI;
    }
    return isCompact ? EditorTabsControl.EDITOR_TAB_HEIGHT.compact : EditorTabsControl.EDITOR_TAB_HEIGHT.normal;
  }
  getHoverTitle(editor) {
    const title = editor.getTitle(Verbosity.LONG);
    if (!this.tabsModel.isPinned(editor)) {
      return {
        markdown: new MarkdownString("", { supportThemeIcons: true, isTrusted: true }).appendText(title).appendMarkdown(' (_preview_ [$(gear)](command:workbench.action.openSettings?%5B%22workbench.editor.enablePreview%22%5D "Configure Preview Mode"))'),
        markdownNotSupportedFallback: title + " (preview)"
      };
    }
    return title;
  }
  updateTabHeight() {
    this.parent.style.setProperty("--editor-group-tab-height", `${this.tabHeight}px`);
    this.parent.classList.toggle("compact-height", this.groupsView.partOptions.tabHeight === "compact");
  }
  updateTabActionSpaceReservation() {
    this.parent.classList.toggle("tab-actions-reserve-space", this.groupsView.partOptions.tabActionReserveSpace);
  }
  updateOptions(oldOptions, newOptions) {
    if (oldOptions.tabHeight !== newOptions.tabHeight) {
      this.updateTabHeight();
    }
    if (oldOptions.tabActionReserveSpace !== newOptions.tabActionReserveSpace) {
      this.updateTabActionSpaceReservation();
    }
    if (oldOptions.editorActionsLocation !== newOptions.editorActionsLocation || oldOptions.showTabs !== newOptions.showTabs) {
      if (this.editorActionsToolbarContainer) {
        this.handleEditorActionToolBarVisibility(this.editorActionsToolbarContainer);
        this.updateEditorActionsToolbar();
      }
      if (this.editorLayoutActionsToolbarContainer) {
        this.handleEditorLayoutActionsToolBarVisibility(this.editorLayoutActionsToolbarContainer);
        this.updateEditorLayoutActionsToolbar();
      }
    }
  }
};
EditorTabsControl.EDITOR_TAB_HEIGHT = {
  normal: 35,
  compact: 22,
  // Modern UI multi-tab mode adds 4px top + 4px bottom padding to
  // the tabs-and-actions-container (tabs.css), so the total title-bar height is the
  // --editor-group-tab-height CSS value (24px / 20px) plus that 8px padding.
  modernUI: 32,
  // 24px tab  + 4px top + 4px bottom padding
  modernUICompact: 28
  // 20px tab  + 4px top + 4px bottom padding (20px = minimum to fit 16px icon + 2px padding)
};
EditorTabsControl = __decorateClass([
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IQuickInputService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IEditorResolverService),
  __decorateParam(15, IHostService),
  __decorateParam(16, IMenuService)
], EditorTabsControl);
export {
  EditorCommandsContextActionRunner,
  EditorTabsControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclRhYnNDb250cm9sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2VkaXRvcnRhYnNjb250cm9sLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGdldEFjdGl2ZVdpbmRvdywgZ2V0V2luZG93LCBpc01vdXNlRXZlbnQsIHNldFZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbnNPcmllbnRhdGlvbiwgSUFjdGlvblZpZXdJdGVtLCBwcmVwYXJlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIEFjdGlvblJ1bm5lciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLCBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllciwgZmlsbEVkaXRvcnNEcmFnRGF0YSwgaXNXaW5kb3dEcmFnZ2VkT3ZlciB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cE1lbnVJZHMsIElFZGl0b3JHcm91cHNWaWV3LCBJRWRpdG9yR3JvdXBWaWV3LCBJRWRpdG9yUGFydHNWaWV3LCBJSW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucyB9IGZyb20gJy4vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb21tYW5kc0NvbnRleHQsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElFZGl0b3JQYXJ0T3B0aW9ucywgU2lkZUJ5U2lkZUVkaXRvciwgRWRpdG9yc09yZGVyLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSVRvb2xiYXJBY3Rpb25zLCBHcm91cElkZW50aWZpZXIsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSwgQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dCwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LCBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQsIEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQsIFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBBY3RpdmVFZGl0b3JGaXJzdEluR3JvdXBDb250ZXh0LCBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0LCBhcHBseUF2YWlsYWJsZUVkaXRvcklkcywgQWN0aXZlRWRpdG9yTGFzdEluR3JvdXBDb250ZXh0LCBBY3RpdmVFZGl0b3JDYW5ub3RDbG9zZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNGaXJlZm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyLCBIaWRkZW5JdGVtU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBMb2NhbFNlbGVjdGlvblRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zIH0gZnJvbSAnLi9lZGl0b3JUaXRsZUNvbnRyb2wuanMnO1xuaW1wb3J0IHsgSVJlYWRvbmx5RWRpdG9yR3JvdXBNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfQ09SRV9OQVZJR0FUSU9OX0NPTU1BTkRTIH0gZnJvbSAnLi9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5RWRpdG9yUGFydCwgTWVyZ2VHcm91cE1vZGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGFwcGx5RHJhZ0ltYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2RuZC9kbmQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRvckNvbW1hbmRzQ29udGV4dEFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBjb250ZXh0OiBJRWRpdG9yQ29tbWFuZHNDb250ZXh0XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBFdmVuIHRob3VnaCB3ZSBoYXZlIGEgZml4ZWQgY29udGV4dCBmb3IgZWRpdG9yIGNvbW1hbmRzLFxuXHRcdC8vIGFsbG93IHRvIHByZXNlcnZlIHRoZSBjb250ZXh0IHRoYXQgaXMgZ2l2ZW4gdG8gdXMgaW4gY2FzZVxuXHRcdC8vIGl0IGFwcGxpZXMuXG5cblx0XHRsZXQgbWVyZ2VkQ29udGV4dCA9IHRoaXMuY29udGV4dDtcblx0XHRpZiAoY29udGV4dD8ucHJlc2VydmVGb2N1cykge1xuXHRcdFx0bWVyZ2VkQ29udGV4dCA9IHtcblx0XHRcdFx0Li4udGhpcy5jb250ZXh0LFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5ydW4oYWN0aW9uLCBtZXJnZWRDb250ZXh0KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JUYWJzQ29udHJvbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0dXBkYXRlT3B0aW9ucyhvbGRPcHRpb25zOiBJRWRpdG9yUGFydE9wdGlvbnMsIG5ld09wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucyk6IHZvaWQ7XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zKTogYm9vbGVhbjtcblx0b3BlbkVkaXRvcnMoZWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IGJvb2xlYW47XG5cdGJlZm9yZUNsb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXHRjbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0Y2xvc2VFZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiB2b2lkO1xuXHRtb3ZlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGZyb21JbmRleDogbnVtYmVyLCB0YXJnZXRJbmRleDogbnVtYmVyLCBzdGlja3lTdGF0ZUNoYW5nZTogYm9vbGVhbik6IHZvaWQ7XG5cdHBpbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0c3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cdHVuc3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cdHNldEFjdGl2ZShpc0FjdGl2ZTogYm9vbGVhbik6IHZvaWQ7XG5cdHVwZGF0ZUVkaXRvclNlbGVjdGlvbnMoKTogdm9pZDtcblx0dXBkYXRlRWRpdG9yTGFiZWwoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cdHVwZGF0ZUVkaXRvckNhcGFiaWxpdGllcyhlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblx0dXBkYXRlRWRpdG9yRGlydHkoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cdGxheW91dChkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucyk6IERpbWVuc2lvbjtcblx0Z2V0SGVpZ2h0KCk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEVkaXRvclRhYnNDb250cm9sIGV4dGVuZHMgVGhlbWFibGUgaW1wbGVtZW50cyBJRWRpdG9yVGFic0NvbnRyb2wge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBlZGl0b3JUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvcklkZW50aWZpZXI+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBncm91cFRyYW5zZmVyID0gTG9jYWxTZWxlY3Rpb25UcmFuc2Zlci5nZXRJbnN0YW5jZTxEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdHJlZUl0ZW1zVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRPUl9UQUJfSEVJR0hUID0ge1xuXHRcdG5vcm1hbDogMzUgYXMgY29uc3QsXG5cdFx0Y29tcGFjdDogMjIgYXMgY29uc3QsXG5cdFx0Ly8gTW9kZXJuIFVJIG11bHRpLXRhYiBtb2RlIGFkZHMgNHB4IHRvcCArIDRweCBib3R0b20gcGFkZGluZyB0b1xuXHRcdC8vIHRoZSB0YWJzLWFuZC1hY3Rpb25zLWNvbnRhaW5lciAodGFicy5jc3MpLCBzbyB0aGUgdG90YWwgdGl0bGUtYmFyIGhlaWdodCBpcyB0aGVcblx0XHQvLyAtLWVkaXRvci1ncm91cC10YWItaGVpZ2h0IENTUyB2YWx1ZSAoMjRweCAvIDIwcHgpIHBsdXMgdGhhdCA4cHggcGFkZGluZy5cblx0XHRtb2Rlcm5VSTogMzIgYXMgY29uc3QsICAgICAgICAvLyAyNHB4IHRhYiAgKyA0cHggdG9wICsgNHB4IGJvdHRvbSBwYWRkaW5nXG5cdFx0bW9kZXJuVUlDb21wYWN0OiAyOCBhcyBjb25zdCwgLy8gMjBweCB0YWIgICsgNHB4IHRvcCArIDRweCBib3R0b20gcGFkZGluZyAoMjBweCA9IG1pbmltdW0gdG8gZml0IDE2cHggaWNvbiArIDJweCBwYWRkaW5nKVxuXHR9O1xuXG5cdHByb3RlY3RlZCBlZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yQWN0aW9uc1Rvb2xiYXI6IFdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0LyoqIFdoZXRoZXIgdGhlIGVkaXRvci1hY3Rpb25zIHRvb2xiYXIgY3VycmVudGx5IGhhcyBhbnkgYWN0aW9ucyAoZHJpdmVzIHRoZSBsYXlvdXQtYWN0aW9ucyBzZXBhcmF0b3IpLiAqL1xuXHRwcml2YXRlIGVkaXRvckFjdGlvbnNUb29sYmFySGFzQWN0aW9ucyA9IGZhbHNlO1xuXHRwcml2YXRlIGVkaXRvckFjdGlvbnNUb29sYmFySGFzVHJhaWxpbmdTZXBhcmF0b3IgPSBmYWxzZTtcblx0cHJpdmF0ZSBhZGRUYWJDb250cm9sSGFzQWN0aW9ucyA9IGZhbHNlO1xuXHRwcml2YXRlIGFkZFRhYkNvbnRyb2xIYXNUcmFpbGluZ1NlcGFyYXRvciA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCBlZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhcjogV29ya2JlbmNoVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JMYXlvdXRBY3Rpb25zRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIHJlc291cmNlQ29udGV4dDogUmVzb3VyY2VDb250ZXh0S2V5O1xuXG5cdHByaXZhdGUgZWRpdG9yUGlubmVkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZWRpdG9ySXNGaXJzdENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGVkaXRvcklzTGFzdENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGVkaXRvclN0aWNreUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGVkaXRvckRpcnR5Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIGVkaXRvckNhbm5vdENsb3NlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBlZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBzaWRlQnlTaWRlRWRpdG9yQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBncm91cExvY2tlZENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgcGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBncm91cHNWaWV3OiBJRWRpdG9yR3JvdXBzVmlldyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3LFxuXHRcdHByb3RlY3RlZCByZWFkb25seSB0YWJzTW9kZWw6IElSZWFkb25seUVkaXRvckdyb3VwTW9kZWwsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG1lbnVJZHM6IElFZGl0b3JHcm91cE1lbnVJZHMgfCB1bmRlZmluZWQsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGJyZWFkY3J1bWJzSW5IZWFkZXI6IGJvb2xlYW4sXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcm90ZWN0ZWQgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5jcmVhdGUocGFyZW50KTtcblxuXHRcdC8vIENvbnRleHQgS2V5c1xuXHRcdHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2VdLFxuXHRcdCkpKTtcblxuXHRcdHRoaXMucmVzb3VyY2VDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VDb250ZXh0S2V5KSk7XG5cblx0XHR0aGlzLmVkaXRvclBpbm5lZENvbnRleHQgPSBBY3RpdmVFZGl0b3JQaW5uZWRDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9ySXNGaXJzdENvbnRleHQgPSBBY3RpdmVFZGl0b3JGaXJzdEluR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9ySXNMYXN0Q29udGV4dCA9IEFjdGl2ZUVkaXRvckxhc3RJbkdyb3VwQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvclN0aWNreUNvbnRleHQgPSBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9yRGlydHlDb250ZXh0ID0gQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzID0gQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvckNhbm5vdENsb3NlQ29udGV4dCA9IEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0TWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuZWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCA9IEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zaWRlQnlTaWRlRWRpdG9yQ29udGV4dCA9IFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5ncm91cExvY2tlZENvbnRleHQgPSBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy51cGRhdGVUYWJIZWlnaHQoKTtcblx0XHR0aGlzLnVwZGF0ZVRhYkFjdGlvblNwYWNlUmVzZXJ2YXRpb24oKTtcblx0XHRyZXR1cm4gcGFyZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZWRpdG9yQWN0aW9uc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5lZGl0b3JBY3Rpb25zTG9jYXRpb24gPT09ICdkZWZhdWx0JyAmJiB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuc2hvd1RhYnMgIT09ICdub25lJztcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3JBY3Rpb25zVG9vbEJhcihwYXJlbnQ6IEhUTUxFbGVtZW50LCBjbGFzc2VzOiBzdHJpbmdbXSwgdHJhaWxpbmdTZXBhcmF0b3IgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJDb250YWluZXIgPSAkKCdkaXYnKTtcblx0XHR0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4uY2xhc3Nlcyk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJIYXNUcmFpbGluZ1NlcGFyYXRvciA9IHRyYWlsaW5nU2VwYXJhdG9yO1xuXG5cdFx0dGhpcy5oYW5kbGVFZGl0b3JBY3Rpb25Ub29sQmFyVmlzaWJpbGl0eSh0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1NlcGFyYXRvciA9ICQoJ2Rpdi5lZGl0b3ItYWN0aW9ucy1zZXBhcmF0b3InKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yKTtcblxuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXIgPSAkKCdkaXYuZWRpdG9yLWxheW91dC1hY3Rpb25zJyk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0dGhpcy5oYW5kbGVFZGl0b3JMYXlvdXRBY3Rpb25zVG9vbEJhclZpc2liaWxpdHkodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQWRkVGFiQ29udHJvbChwYXJlbnQ6IEhUTUxFbGVtZW50LCBtZW51SWQ6IE1lbnVJZCwgYmVmb3JlPzogSFRNTEVsZW1lbnQsIHRyYWlsaW5nU2VwYXJhdG9yID0gZmFsc2UpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnLnRhYnMtYmFyLWFkZC10YWInKTtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgYmVmb3JlID8/IG51bGwpO1xuXHRcdHRoaXMuYWRkVGFiQ29udHJvbEhhc1RyYWlsaW5nU2VwYXJhdG9yID0gdHJhaWxpbmdTZXBhcmF0b3I7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KG1lbnVJZCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdGNvbnN0IGdldEFjdGlvbnMgPSAoKSA9PiBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgYWRkVGFiQWN0aW9uID0gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdlZGl0b3IudGFicy5hZGRUYWInLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZGRUYWInLCBcIkFkZCBUYWJcIiksXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYWRkKSxcblx0XHRcdHJ1bjogKCkgPT4geyB9XG5cdFx0fSk7XG5cdFx0Y29uc3QgZHJvcGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0oYWRkVGFiQWN0aW9uLCB7IGdldEFjdGlvbnMgfSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdGNsYXNzTmFtZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uYWRkKSxcblx0XHRcdGtleWJpbmRpbmdQcm92aWRlcjogYWN0aW9uID0+IHRoaXMuZ2V0S2V5YmluZGluZyhhY3Rpb24pXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGNvbnRhaW5lciwge1xuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXJpYUxhYmVsQWRkVGFiJywgXCJBZGQgVGFiXCIpLFxuXHRcdFx0dHJhaWxpbmdTZXBhcmF0b3IsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBhY3Rpb24gPT4gYWN0aW9uID09PSBhZGRUYWJBY3Rpb24gPyBkcm9wZG93biA6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblx0XHR0b29sYmFyLnNldEFjdGlvbnMoW2FkZFRhYkFjdGlvbl0pO1xuXG5cdFx0Y29uc3QgdXBkYXRlVmlzaWJpbGl0eSA9ICgpID0+IHtcblx0XHRcdHRoaXMuYWRkVGFiQ29udHJvbEhhc0FjdGlvbnMgPSBnZXRBY3Rpb25zKCkubGVuZ3RoID4gMDtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhdGhpcy5hZGRUYWJDb250cm9sSGFzQWN0aW9ucyk7XG5cdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IoKTtcblx0XHR9O1xuXHRcdHVwZGF0ZVZpc2liaWxpdHkoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZVZpc2liaWxpdHkpKTtcblxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IoKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFzTGF5b3V0QWN0aW9ucyA9ICh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyPy5nZXRJdGVtc0xlbmd0aCgpID8/IDApID4gMDtcblx0XHRpZiAodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yKSB7XG5cdFx0XHRzZXRWaXNpYmlsaXR5KGhhc0xheW91dEFjdGlvbnNcblx0XHRcdFx0JiYgIXRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJIYXNUcmFpbGluZ1NlcGFyYXRvclxuXHRcdFx0XHQmJiAhdGhpcy5hZGRUYWJDb250cm9sSGFzVHJhaWxpbmdTZXBhcmF0b3Jcblx0XHRcdFx0JiYgKHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJIYXNBY3Rpb25zIHx8IHRoaXMuYWRkVGFiQ29udHJvbEhhc0FjdGlvbnMpLCB0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRWRpdG9yQWN0aW9uVG9vbEJhclZpc2liaWxpdHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNFbmFibGVkID0gdGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZDtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zVmlzaWJsZSA9ICEhdGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhcjtcblxuXHRcdC8vIENyZWF0ZSB0b29sYmFyIGlmIGl0IGlzIGVuYWJsZWQgKGFuZCBub3QgeWV0IGNyZWF0ZWQpXG5cdFx0aWYgKGVkaXRvckFjdGlvbnNFbmFibGVkICYmICFlZGl0b3JBY3Rpb25zVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5kb0NyZWF0ZUVkaXRvckFjdGlvbnNUb29sQmFyKGNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdC8vIFJlbW92ZSB0b29sYmFyIGlmIGl0IGlzIG5vdCBlbmFibGVkIChhbmQgaXMgdmlzaWJsZSlcblx0XHRlbHNlIGlmICghZWRpdG9yQWN0aW9uc0VuYWJsZWQgJiYgZWRpdG9yQWN0aW9uc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXI/LmdldEVsZW1lbnQoKS5yZW1vdmUoKTtcblx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFlZGl0b3JBY3Rpb25zRW5hYmxlZCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUVkaXRvckxheW91dEFjdGlvbnNUb29sQmFyVmlzaWJpbGl0eShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uc0VuYWJsZWQgPSB0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkO1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNWaXNpYmxlID0gISF0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyO1xuXG5cdFx0Ly8gQ3JlYXRlIHRvb2xiYXIgaWYgaXQgaXMgZW5hYmxlZCAoYW5kIG5vdCB5ZXQgY3JlYXRlZClcblx0XHRpZiAoZWRpdG9yQWN0aW9uc0VuYWJsZWQgJiYgIWVkaXRvckFjdGlvbnNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmRvQ3JlYXRlRWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xCYXIoY29udGFpbmVyKTtcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIHRvb2xiYXIgaWYgaXQgaXMgbm90IGVuYWJsZWQgKGFuZCBpcyB2aXNpYmxlKVxuXHRcdGVsc2UgaWYgKCFlZGl0b3JBY3Rpb25zRW5hYmxlZCAmJiBlZGl0b3JBY3Rpb25zVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhcj8uZ2V0RWxlbWVudCgpLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWVkaXRvckFjdGlvbnNFbmFibGVkKTtcblxuXHRcdC8vIEtlZXAgdGhlIHNpYmxpbmcgc2VwYXJhdG9yIGluIHN5bmMgd2l0aCB0aGUgdG9vbGJhci4gVGhlIHNlcGFyYXRvciBsaXZlcyBvdXRzaWRlXG5cdFx0Ly8gdGhlIGhpZGRlbiBjb250YWluZXJzIHNvIGl0IG11c3QgYmUgZXhwbGljaXRseSBoaWRkZW4gd2hlbmV2ZXIgdGhlIGxheW91dCB0b29sYmFyXG5cdFx0Ly8gaXMgZGlzYWJsZWQvcmVtb3ZlZDsgb3RoZXJ3aXNlIGl0IHdvdWxkIHJlbWFpbiB2aXNpYmxlIGFzIGFuIG9ycGhhbiBsaW5lLlxuXHRcdGlmICh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IgJiYgIWVkaXRvckFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRzZXRWaXNpYmlsaXR5KGZhbHNlLCB0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVFZGl0b3JBY3Rpb25zVG9vbEJhcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGV4dDogSUVkaXRvckNvbW1hbmRzQ29udGV4dCA9IHsgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfTtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zTWVudUlkID0gdGhpcy5tZW51SWRzPy5lZGl0b3JBY3Rpb25zID8/IE1lbnVJZC5FZGl0b3JUaXRsZTtcblxuXHRcdC8vIFRvb2xiYXIgV2lkZ2V0XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhciA9IHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBjb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXJpYUxhYmVsRWRpdG9yQWN0aW9ucycsIFwiRWRpdG9yIGFjdGlvbnNcIiksXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5nZXRLZXliaW5kaW5nKGFjdGlvbiksXG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvckNvbW1hbmRzQ29udGV4dEFjdGlvblJ1bm5lcihjb250ZXh0KSksXG5cdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdGhpcy5yZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50LFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnZWRpdG9yUGFydCcsXG5cdFx0XHRyZXNldE1lbnU6IGVkaXRvckFjdGlvbnNNZW51SWQsXG5cdFx0XHRvdmVyZmxvd0JlaGF2aW9yOiB7IG1heEl0ZW1zOiA5LCBleGVtcHRlZDogRURJVE9SX0NPUkVfTkFWSUdBVElPTl9DT01NQU5EUyB9LFxuXHRcdFx0dHJhaWxpbmdTZXBhcmF0b3I6IHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJIYXNUcmFpbGluZ1NlcGFyYXRvcixcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRleHRcblx0XHR0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0Ly8gQWN0aW9uIFJ1biBIYW5kbGluZ1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhci5hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cblx0XHRcdC8vIE5vdGlmeSBmb3IgRXJyb3Jcblx0XHRcdGlmIChlLmVycm9yICYmICFpc0NhbmNlbGxhdGlvbkVycm9yKGUuZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlLmVycm9yKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGRvQ3JlYXRlRWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xCYXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRleHQ6IElFZGl0b3JDb21tYW5kc0NvbnRleHQgPSB7IGdyb3VwSWQ6IHRoaXMuZ3JvdXBWaWV3LmlkIH07XG5cblx0XHQvLyBUb29sYmFyIFdpZGdldCAobm8gb3ZlcmZsb3csIG5vIGhpZGRlbi1pdGVtIFwiLi4uXCIgYnV0dG9uIHNvIGxheW91dCBhY3Rpb25zXG5cdFx0Ly8gYXJlIGFsd2F5cyByZW5kZXJlZCBpbmxpbmUgYWZ0ZXIgdGhlIHByaW1hcnkgdG9vbGJhcidzIG93biBvdmVyZmxvdykuXG5cdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhciA9IHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBjb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXJpYUxhYmVsRWRpdG9yQWN0aW9uc0xheW91dCcsIFwiRWRpdG9yIGxheW91dCBhY3Rpb25zXCIpLFxuXHRcdFx0Z2V0S2V5QmluZGluZzogYWN0aW9uID0+IHRoaXMuZ2V0S2V5YmluZGluZyhhY3Rpb24pLFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyRGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0b3JDb21tYW5kc0NvbnRleHRBY3Rpb25SdW5uZXIoY29udGV4dCkpLFxuXHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVCxcblx0XHRcdHJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQ6IHRoaXMucmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudCxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2VkaXRvclBhcnRUcmFpbGluZycsXG5cdFx0XHRyZXNldE1lbnU6IE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRleHRcblx0XHR0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0Ly8gQWN0aW9uIFJ1biBIYW5kbGluZ1xuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhci5hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cblx0XHRcdC8vIE5vdGlmeSBmb3IgRXJyb3Jcblx0XHRcdGlmIChlLmVycm9yICYmICFpc0NhbmNlbGxhdGlvbkVycm9yKGUuZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlLmVycm9yKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHQvLyBDaGVjayBBY3RpdmUgRWRpdG9yXG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBFZGl0b3JQYW5lKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVFZGl0b3JQYW5lLmdldEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBleHRlbnNpb25zXG5cdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBtZW51QXNDaGlsZDogdGhpcy5yZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50IH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUVkaXRvckFjdGlvbnNUb29sYmFyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zID0gdGhpcy5ncm91cFZpZXcuY3JlYXRlRWRpdG9yQWN0aW9ucyh0aGlzLmVkaXRvckFjdGlvbnNEaXNwb3NhYmxlcywgdGhpcy5tZW51SWRzPy5lZGl0b3JBY3Rpb25zID8/IE1lbnVJZC5FZGl0b3JUaXRsZSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKGVkaXRvckFjdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVFZGl0b3JBY3Rpb25zVG9vbGJhcigpKSk7XG5cblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zVG9vbGJhciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZWRpdG9yQWN0aW9uc1Rvb2xiYXIpO1xuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSB0aGlzLnByZXBhcmVFZGl0b3JBY3Rpb25zKGVkaXRvckFjdGlvbnMuYWN0aW9ucyk7XG5cdFx0ZWRpdG9yQWN0aW9uc1Rvb2xiYXIuc2V0QWN0aW9ucyhwcmVwYXJlQWN0aW9ucyhwcmltYXJ5KSwgcHJlcGFyZUFjdGlvbnMoc2Vjb25kYXJ5KSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckhhc0FjdGlvbnMgPSBwcmltYXJ5Lmxlbmd0aCA+IDAgfHwgc2Vjb25kYXJ5Lmxlbmd0aCA+IDA7XG5cblx0XHR0aGlzLnVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyKCk6IHZvaWQge1xuXHRcdGlmIChcblx0XHRcdCF0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkIHx8XG5cdFx0XHQhdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lciB8fFxuXHRcdFx0IXRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvckxheW91dEFjdGlvbnNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9ucyA9IHRoaXMuZ3JvdXBWaWV3LmNyZWF0ZUVkaXRvckFjdGlvbnModGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zRGlzcG9zYWJsZXMsIE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCk7XG5cdFx0dGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKGVkaXRvckFjdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVFZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhcigpKSk7XG5cblx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gdGhpcy5wcmVwYXJlRWRpdG9yTGF5b3V0QWN0aW9ucyhlZGl0b3JBY3Rpb25zLmFjdGlvbnMpO1xuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXIuc2V0QWN0aW9ucyhwcmVwYXJlQWN0aW9ucyhwcmltYXJ5KSwgcHJlcGFyZUFjdGlvbnMoc2Vjb25kYXJ5KSk7XG5cblx0XHRjb25zdCBoYXNMYXlvdXRBY3Rpb25zID0gcHJpbWFyeS5sZW5ndGggPiAwIHx8IHNlY29uZGFyeS5sZW5ndGggPiAwO1xuXG5cdFx0Ly8gT25seSBzaG93IHRoZSBzZXBhcmF0b3IgYW5kIHRoZSB0b29sYmFyIGNvbnRhaW5lciB3aGVuIHRoZSBsYXlvdXQgdG9vbGJhclxuXHRcdC8vIGhhcyBhY3Rpb25zIEFORCB0aGVyZSBhcmUgZWRpdG9yIGFjdGlvbnMgdG8gaXRzIGxlZnQgdG8gc2VwYXJhdGUgZnJvbS5cblx0XHR0aGlzLnVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IoKTtcblxuXHRcdHNldFZpc2liaWxpdHkoaGFzTGF5b3V0QWN0aW9ucywgdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcHJlcGFyZUVkaXRvckFjdGlvbnMoZWRpdG9yQWN0aW9uczogSVRvb2xiYXJBY3Rpb25zKTogSVRvb2xiYXJBY3Rpb25zO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBwcmVwYXJlRWRpdG9yTGF5b3V0QWN0aW9ucyhlZGl0b3JBY3Rpb25zOiBJVG9vbGJhckFjdGlvbnMpOiBJVG9vbGJhckFjdGlvbnM7XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JQYW5lQXdhcmVDb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLmdyb3VwVmlldy5hY3RpdmVFZGl0b3JQYW5lPy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA/PyB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNsZWFyRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uc1Rvb2xiYXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyKTtcblx0XHRlZGl0b3JBY3Rpb25zVG9vbGJhci5zZXRBY3Rpb25zKFtdLCBbXSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckhhc0FjdGlvbnMgPSBmYWxzZTtcblxuXHRcdHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXI/LnNldEFjdGlvbnMoW10sIFtdKTtcblx0XHRpZiAodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zU2VwYXJhdG9yKSB7XG5cdFx0XHRzZXRWaXNpYmlsaXR5KGZhbHNlLCB0aGlzLmVkaXRvckxheW91dEFjdGlvbnNTZXBhcmF0b3IpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcikge1xuXHRcdFx0c2V0VmlzaWJpbGl0eShmYWxzZSwgdGhpcy5lZGl0b3JMYXlvdXRBY3Rpb25zVG9vbGJhckNvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uR3JvdXBEcmFnU3RhcnQoZTogRHJhZ0V2ZW50LCBlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLnRhcmdldCAhPT0gZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBvbmx5IGlmIG9yaWdpbmF0aW5nIGZyb20gdGFicyBjb250YWluZXJcblx0XHR9XG5cblx0XHRjb25zdCBpc05ld1dpbmRvd09wZXJhdGlvbiA9IHRoaXMuaXNOZXdXaW5kb3dPcGVyYXRpb24oZSk7XG5cblx0XHQvLyBTZXQgZWRpdG9yIGdyb3VwIGFzIHRyYW5zZmVyXG5cdFx0dGhpcy5ncm91cFRyYW5zZmVyLnNldERhdGEoW25ldyBEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyKHRoaXMuZ3JvdXBWaWV3LmlkKV0sIERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRpZiAoZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnY29weU1vdmUnO1xuXHRcdH1cblxuXHRcdC8vIERyYWcgYWxsIHRhYnMgb2YgdGhlIGdyb3VwIGlmIHRhYnMgYXJlIGVuYWJsZWRcblx0XHRsZXQgaGFzRGF0YVRyYW5zZmVyID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5zaG93VGFicyA9PT0gJ211bHRpcGxlJykge1xuXHRcdFx0aGFzRGF0YVRyYW5zZmVyID0gdGhpcy5kb0ZpbGxSZXNvdXJjZURhdGFUcmFuc2ZlcnModGhpcy5ncm91cFZpZXcuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCksIGUsIGlzTmV3V2luZG93T3BlcmF0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugb25seSBkcmFnIHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGhhc0RhdGFUcmFuc2ZlciA9IHRoaXMuZG9GaWxsUmVzb3VyY2VEYXRhVHJhbnNmZXJzKFt0aGlzLmdyb3VwVmlldy5hY3RpdmVFZGl0b3JdLCBlLCBpc05ld1dpbmRvd09wZXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZWZveDogcmVxdWlyZXMgdG8gc2V0IGEgdGV4dCBkYXRhIHRyYW5zZmVyIHRvIGdldCBnb2luZ1xuXHRcdGlmICghaGFzRGF0YVRyYW5zZmVyICYmIGlzRmlyZWZveCkge1xuXHRcdFx0ZS5kYXRhVHJhbnNmZXI/LnNldERhdGEoRGF0YVRyYW5zZmVycy5URVhULCBTdHJpbmcodGhpcy5ncm91cFZpZXcubGFiZWwpKTtcblx0XHR9XG5cblx0XHQvLyBEcmFnIEltYWdlXG5cdFx0aWYgKHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0bGV0IGxhYmVsID0gdGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yLmdldE5hbWUoKTtcblx0XHRcdGlmICh0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScgJiYgdGhpcy5ncm91cFZpZXcuY291bnQgPiAxKSB7XG5cdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2RyYWdnZWRFZGl0b3JHcm91cCcsIFwiezB9ICgrezF9KVwiLCBsYWJlbCwgdGhpcy5ncm91cFZpZXcuY291bnQgLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0YXBwbHlEcmFnSW1hZ2UoZSwgZWxlbWVudCwgbGFiZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc05ld1dpbmRvd09wZXJhdGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBvbkdyb3VwRHJhZ0VuZChlOiBEcmFnRXZlbnQsIHByZXZpb3VzRHJhZ0V2ZW50OiBEcmFnRXZlbnQgfCB1bmRlZmluZWQsIGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpc05ld1dpbmRvd09wZXJhdGlvbjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZ3JvdXBUcmFuc2Zlci5jbGVhckRhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXG5cdFx0aWYgKFxuXHRcdFx0ZS50YXJnZXQgIT09IGVsZW1lbnQgfHxcblx0XHRcdCFpc05ld1dpbmRvd09wZXJhdGlvbiB8fFxuXHRcdFx0aXNXaW5kb3dEcmFnZ2VkT3ZlcigpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGRyYWcgdG8gb3BlbiBpbiBuZXcgd2luZG93IGlzIGRpc2FibGVkXG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5RWRpdG9yUGFydCA9IGF3YWl0IHRoaXMubWF5YmVDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0QXQoZSwgZWxlbWVudCk7XG5cdFx0aWYgKCFhdXhpbGlhcnlFZGl0b3JQYXJ0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSBhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdHRoaXMuZ3JvdXBzVmlldy5tZXJnZUdyb3VwKHRoaXMuZ3JvdXBWaWV3LCB0YXJnZXRHcm91cC5pZCwge1xuXHRcdFx0bW9kZTogdGhpcy5pc01vdmVPcGVyYXRpb24ocHJldmlvdXNEcmFnRXZlbnQgPz8gZSwgdGFyZ2V0R3JvdXAuaWQpID8gTWVyZ2VHcm91cE1vZGUuTU9WRV9FRElUT1JTIDogTWVyZ2VHcm91cE1vZGUuQ09QWV9FRElUT1JTXG5cdFx0fSk7XG5cblx0XHR0YXJnZXRHcm91cC5mb2N1cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIG1heWJlQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydEF0KGU6IERyYWdFdmVudCwgb2Zmc2V0RWxlbWVudDogSFRNTEVsZW1lbnQpOiBQcm9taXNlPElBdXhpbGlhcnlFZGl0b3JQYXJ0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgeyBwb2ludCwgZGlzcGxheSB9ID0gYXdhaXQgdGhpcy5ob3N0U2VydmljZS5nZXRDdXJzb3JTY3JlZW5Qb2ludCgpID8/IHsgcG9pbnQ6IHsgeDogZS5zY3JlZW5YLCB5OiBlLnNjcmVlblkgfSB9O1xuXHRcdGNvbnN0IHdpbmRvdyA9IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdGlmICh3aW5kb3cuZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAndmlzaWJsZScgJiYgd2luZG93LmRvY3VtZW50Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdGlmIChwb2ludC54ID49IHdpbmRvdy5zY3JlZW5YICYmIHBvaW50LnggPD0gd2luZG93LnNjcmVlblggKyB3aW5kb3cub3V0ZXJXaWR0aCAmJiBwb2ludC55ID49IHdpbmRvdy5zY3JlZW5ZICYmIHBvaW50LnkgPD0gd2luZG93LnNjcmVlblkgKyB3aW5kb3cub3V0ZXJIZWlnaHQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyByZWZ1c2UgdG8gY3JlYXRlIGFzIGxvbmcgYXMgdGhlIG1vdXNlIHdhcyByZWxlYXNlZCBvdmVyIGFjdGl2ZSBmb2N1c2VkIHdpbmRvdyB0byByZWR1Y2UgY2hhbmNlIG9mIG9wZW5pbmcgYnkgYWNjaWRlbnRcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBvZmZzZXRYID0gb2Zmc2V0RWxlbWVudC5vZmZzZXRXaWR0aCAvIDI7XG5cdFx0Y29uc3Qgb2Zmc2V0WSA9IDMwLyogdGFrZSB0aXRsZSBiYXIgaGVpZ2h0IGludG8gYWNjb3VudCAoYXBwcm94aW1hdGlvbikgKi8gKyBvZmZzZXRFbGVtZW50Lm9mZnNldEhlaWdodCAvIDI7XG5cblx0XHRjb25zdCBib3VuZHMgPSB7XG5cdFx0XHR4OiBwb2ludC54IC0gb2Zmc2V0WCxcblx0XHRcdHk6IHBvaW50LnkgLSBvZmZzZXRZXG5cdFx0fTtcblxuXHRcdGlmIChkaXNwbGF5KSB7XG5cdFx0XHRpZiAoYm91bmRzLnggPCBkaXNwbGF5LngpIHtcblx0XHRcdFx0Ym91bmRzLnggPSBkaXNwbGF5Lng7IC8vIHByZXZlbnQgb3ZlcmZsb3cgdG8gdGhlIGxlZnRcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJvdW5kcy55IDwgZGlzcGxheS55KSB7XG5cdFx0XHRcdGJvdW5kcy55ID0gZGlzcGxheS55OyAvLyBwcmV2ZW50IG92ZXJmbG93IHRvIHRoZSB0b3Bcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuY3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydCh7IGJvdW5kcyB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBpc05ld1dpbmRvd09wZXJhdGlvbihlOiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmRyYWdUb09wZW5XaW5kb3cpIHtcblx0XHRcdHJldHVybiAhZS5hbHRLZXk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGUuYWx0S2V5O1xuXHR9XG5cblx0cHJvdGVjdGVkIGlzTW92ZU9wZXJhdGlvbihlOiBEcmFnRXZlbnQsIHNvdXJjZUdyb3VwOiBHcm91cElkZW50aWZpZXIsIHNvdXJjZUVkaXRvcj86IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHNvdXJjZUVkaXRvcj8uaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b24pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gU2luZ2xldG9uIGVkaXRvcnMgY2Fubm90IGJlIHNwbGl0XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDb3B5ID0gKGUuY3RybEtleSAmJiAhaXNNYWNpbnRvc2gpIHx8IChlLmFsdEtleSAmJiBpc01hY2ludG9zaCk7XG5cblx0XHRyZXR1cm4gKCFpc0NvcHkgfHwgc291cmNlR3JvdXAgPT09IHRoaXMuZ3JvdXBWaWV3LmlkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBkb0ZpbGxSZXNvdXJjZURhdGFUcmFuc2ZlcnMoZWRpdG9yczogcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSwgZTogRHJhZ0V2ZW50LCBkaXNhYmxlU3RhbmRhcmRUcmFuc2ZlcjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmIChlZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaWxsRWRpdG9yc0RyYWdEYXRhLCBlZGl0b3JzLm1hcChlZGl0b3IgPT4gKHsgZWRpdG9yLCBncm91cElkOiB0aGlzLmdyb3VwVmlldy5pZCB9KSksIGUsIHsgZGlzYWJsZVN0YW5kYXJkVHJhbnNmZXIgfSk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvblRhYkNvbnRleHRNZW51KGVkaXRvcjogRWRpdG9ySW5wdXQsIGU6IEV2ZW50LCBub2RlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHRzIGJhc2VkIG9uIGVkaXRvciBwaWNrZWQgYW5kIHJlbWVtYmVyIHByZXZpb3VzIHRvIHJlc3RvcmVcblx0XHR0aGlzLnJlc291cmNlQ29udGV4dC5zZXQoRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSk7XG5cdFx0dGhpcy5lZGl0b3JQaW5uZWRDb250ZXh0LnNldCh0aGlzLnRhYnNNb2RlbC5pc1Bpbm5lZChlZGl0b3IpKTtcblx0XHR0aGlzLmVkaXRvcklzRmlyc3RDb250ZXh0LnNldCh0aGlzLnRhYnNNb2RlbC5pc0ZpcnN0KGVkaXRvcikpO1xuXHRcdHRoaXMuZWRpdG9ySXNMYXN0Q29udGV4dC5zZXQodGhpcy50YWJzTW9kZWwuaXNMYXN0KGVkaXRvcikpO1xuXHRcdHRoaXMuZWRpdG9yU3RpY2t5Q29udGV4dC5zZXQodGhpcy50YWJzTW9kZWwuaXNTdGlja3koZWRpdG9yKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXJ0eUNvbnRleHQuc2V0KGVkaXRvci5pc0RpcnR5KCkgJiYgIWVkaXRvci5pc1NhdmluZygpKTtcblx0XHR0aGlzLmVkaXRvckNhbm5vdENsb3NlQ29udGV4dC5zZXQoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2Fubm90Q2xvc2UpKTtcblx0XHR0aGlzLmdyb3VwTG9ja2VkQ29udGV4dC5zZXQodGhpcy50YWJzTW9kZWwuaXNMb2NrZWQpO1xuXHRcdHRoaXMuZWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dC5zZXQoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuU3BsaXRJbkdyb3VwKSk7XG5cdFx0dGhpcy5zaWRlQnlTaWRlRWRpdG9yQ29udGV4dC5zZXQoZWRpdG9yLnR5cGVJZCA9PT0gU2lkZUJ5U2lkZUVkaXRvcklucHV0LklEKTtcblx0XHRhcHBseUF2YWlsYWJsZUVkaXRvcklkcyh0aGlzLmVkaXRvckF2YWlsYWJsZUVkaXRvcklkcywgZWRpdG9yLCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cblx0XHQvLyBGaW5kIHRhcmdldCBhbmNob3Jcblx0XHRsZXQgYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCA9IG5vZGU7XG5cdFx0aWYgKGlzTW91c2VFdmVudChlKSkge1xuXHRcdFx0YW5jaG9yID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3cobm9kZSksIGUpO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgaXRcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiB0aGlzLnJlc291cmNlQ29udGV4dC5nZXQoKSB9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dE1lbnVDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiAoeyBncm91cElkOiB0aGlzLmdyb3VwVmlldy5pZCwgZWRpdG9ySW5kZXg6IHRoaXMuZ3JvdXBWaWV3LmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKSB9KSxcblx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkLCB0aGlzLmNvbnRleHRNZW51Q29udGV4dEtleVNlcnZpY2UpLFxuXHRcdFx0b25IaWRlOiAoKSA9PiB0aGlzLmdyb3Vwc1ZpZXcuYWN0aXZlR3JvdXAuZm9jdXMoKSAvLyByZXN0b3JlIGZvY3VzIHRvIGFjdGl2ZSBncm91cFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEtleWJpbmRpbmcoYWN0aW9uOiBJQWN0aW9uKTogUmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCwgdGhpcy5nZXRFZGl0b3JQYW5lQXdhcmVDb250ZXh0S2V5U2VydmljZSgpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRLZXliaW5kaW5nTGFiZWwoYWN0aW9uOiBJQWN0aW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5nZXRLZXliaW5kaW5nKGFjdGlvbik7XG5cblx0XHRyZXR1cm4ga2V5YmluZGluZyA/IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IHRhYkhlaWdodCgpIHtcblx0XHRjb25zdCBpc0NvbXBhY3QgPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMudGFiSGVpZ2h0ID09PSAnY29tcGFjdCc7XG5cdFx0Ly8gSW4gbW9kZXJuIG11bHRpLXRhYiBtb2RlIHRoZSB0YWJzLWFuZC1hY3Rpb25zLWNvbnRhaW5lciBnYWlucyBleHRyYVxuXHRcdC8vIHBhZGRpbmcgKHRhYnMuY3NzKSwgc28gdGhlIHRvdGFsIGhlaWdodCBkaWZmZXJzIGZyb20gdGhlIGJhc2UgdmFsdWVzLlxuXHRcdC8vIFRoZSBgLnRhYnNgIGNsYXNzIGlzIHByZXNlbnQgb25seSB3aGVuIHNob3dUYWJzID09PSAnbXVsdGlwbGUnOyBzaW5nbGUtdGFiXG5cdFx0Ly8gYW5kIG5vLXRhYiBtb2RlcyBhcmUgbm90IGFmZmVjdGVkIGJ5IHRob3NlIENTUyBvdmVycmlkZXMuXG5cdFx0aWYgKHRoaXMucGFyZW50LmNsYXNzTGlzdC5jb250YWlucygndGFicycpICYmIHRoaXMucGFyZW50LmNsb3Nlc3QoJy5tb2Rlcm4tdWktdGFicycpKSB7XG5cdFx0XHRyZXR1cm4gaXNDb21wYWN0ID8gRWRpdG9yVGFic0NvbnRyb2wuRURJVE9SX1RBQl9IRUlHSFQubW9kZXJuVUlDb21wYWN0IDogRWRpdG9yVGFic0NvbnRyb2wuRURJVE9SX1RBQl9IRUlHSFQubW9kZXJuVUk7XG5cdFx0fVxuXHRcdHJldHVybiBpc0NvbXBhY3QgPyBFZGl0b3JUYWJzQ29udHJvbC5FRElUT1JfVEFCX0hFSUdIVC5jb21wYWN0IDogRWRpdG9yVGFic0NvbnRyb2wuRURJVE9SX1RBQl9IRUlHSFQubm9ybWFsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEhvdmVyVGl0bGUoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHN0cmluZyB8IElNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcge1xuXHRcdGNvbnN0IHRpdGxlID0gZWRpdG9yLmdldFRpdGxlKFZlcmJvc2l0eS5MT05HKTtcblx0XHRpZiAoIXRoaXMudGFic01vZGVsLmlzUGlubmVkKGVkaXRvcikpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsIGlzVHJ1c3RlZDogdHJ1ZSB9KS5cblx0XHRcdFx0XHRhcHBlbmRUZXh0KHRpdGxlKS5cblx0XHRcdFx0XHRhcHBlbmRNYXJrZG93bignIChfcHJldmlld18gWyQoZ2VhcildKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIyd29ya2JlbmNoLmVkaXRvci5lbmFibGVQcmV2aWV3JTIyJTVEIFwiQ29uZmlndXJlIFByZXZpZXcgTW9kZVwiKSknKSxcblx0XHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogdGl0bGUgKyAnIChwcmV2aWV3KSdcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVUYWJIZWlnaHQoKTogdm9pZCB7XG5cdFx0dGhpcy5wYXJlbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tZWRpdG9yLWdyb3VwLXRhYi1oZWlnaHQnLCBgJHt0aGlzLnRhYkhlaWdodH1weGApO1xuXHRcdC8vIFNpZ25hbCBjb21wYWN0IG1vZGUgdmlhIGEgQ1NTIGNsYXNzIHNvIHRoZSBtb2Rlcm4gdGFiIHJ1bGVzIGluIHRhYnMuY3NzXG5cdFx0Ly8gY2FuIGFwcGx5IGEgcHJvcG9ydGlvbmFsbHkgc21hbGxlciAtLWVkaXRvci1ncm91cC10YWItaGVpZ2h0IHZhbHVlLlxuXHRcdHRoaXMucGFyZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QtaGVpZ2h0JywgdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRhYkhlaWdodCA9PT0gJ2NvbXBhY3QnKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFiQWN0aW9uU3BhY2VSZXNlcnZhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnBhcmVudC5jbGFzc0xpc3QudG9nZ2xlKCd0YWItYWN0aW9ucy1yZXNlcnZlLXNwYWNlJywgdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRhYkFjdGlvblJlc2VydmVTcGFjZSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9sZE9wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucywgbmV3T3B0aW9uczogSUVkaXRvclBhcnRPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgdGFiIGhlaWdodFxuXHRcdGlmIChvbGRPcHRpb25zLnRhYkhlaWdodCAhPT0gbmV3T3B0aW9ucy50YWJIZWlnaHQpIHtcblx0XHRcdHRoaXMudXBkYXRlVGFiSGVpZ2h0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKG9sZE9wdGlvbnMudGFiQWN0aW9uUmVzZXJ2ZVNwYWNlICE9PSBuZXdPcHRpb25zLnRhYkFjdGlvblJlc2VydmVTcGFjZSkge1xuXHRcdFx0dGhpcy51cGRhdGVUYWJBY3Rpb25TcGFjZVJlc2VydmF0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIEVkaXRvciBBY3Rpb25zIFRvb2xiYXJcblx0XHRpZiAoXG5cdFx0XHRvbGRPcHRpb25zLmVkaXRvckFjdGlvbnNMb2NhdGlvbiAhPT0gbmV3T3B0aW9ucy5lZGl0b3JBY3Rpb25zTG9jYXRpb24gfHxcblx0XHRcdG9sZE9wdGlvbnMuc2hvd1RhYnMgIT09IG5ld09wdGlvbnMuc2hvd1RhYnNcblx0XHQpIHtcblx0XHRcdGlmICh0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlRWRpdG9yQWN0aW9uVG9vbEJhclZpc2liaWxpdHkodGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlRWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xCYXJWaXNpYmlsaXR5KHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3Qgb3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbjtcblxuXHRhYnN0cmFjdCBvcGVuRWRpdG9ycyhlZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogYm9vbGVhbjtcblxuXHRhYnN0cmFjdCBiZWZvcmVDbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblxuXHRhYnN0cmFjdCBjbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZDtcblxuXHRhYnN0cmFjdCBjbG9zZUVkaXRvcnMoZWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IHZvaWQ7XG5cblx0YWJzdHJhY3QgbW92ZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBmcm9tSW5kZXg6IG51bWJlciwgdGFyZ2V0SW5kZXg6IG51bWJlcik6IHZvaWQ7XG5cblx0YWJzdHJhY3QgcGluRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHN0aWNrRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHVuc3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cblx0YWJzdHJhY3Qgc2V0QWN0aXZlKGlzQWN0aXZlOiBib29sZWFuKTogdm9pZDtcblxuXHRhYnN0cmFjdCB1cGRhdGVFZGl0b3JTZWxlY3Rpb25zKCk6IHZvaWQ7XG5cblx0YWJzdHJhY3QgdXBkYXRlRWRpdG9yTGFiZWwoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQ7XG5cblx0YWJzdHJhY3QgdXBkYXRlRWRpdG9yQ2FwYWJpbGl0aWVzKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IHVwZGF0ZUVkaXRvckRpcnR5KGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXG5cdGFic3RyYWN0IGxheW91dChkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucyk6IERpbWVuc2lvbjtcblxuXHRhYnN0cmFjdCBnZXRIZWlnaHQo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
