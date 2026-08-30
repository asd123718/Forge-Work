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
import "./media/multieditortabscontrol.css";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { shorten } from "../../../../base/common/labels.js";
import { EditorResourceAccessor, Verbosity, SideBySideEditor, DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, preventEditorClose, EditorCloseMethod, EditorsOrder } from "../../../common/editor.js";
import { computeEditorAriaLabel } from "../../editor.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { ResourceLabels, DEFAULT_LABELS_CONTAINER } from "../../labels.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { EditorCommandsContextActionRunner, EditorTabsControl } from "./editorTabsControl.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { dispose, DisposableStore, combinedDisposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { getOrSet } from "../../../../base/common/map.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { TAB_INACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND, TAB_BORDER, EDITOR_DRAG_AND_DROP_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_ACTIVE_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_UNFOCUSED_HOVER_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND, WORKBENCH_BACKGROUND, TAB_ACTIVE_BORDER_TOP, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, TAB_ACTIVE_MODIFIED_BORDER, TAB_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_BACKGROUND, TAB_HOVER_FOREGROUND, TAB_UNFOCUSED_HOVER_FOREGROUND, EDITOR_GROUP_HEADER_TABS_BORDER, TAB_LAST_PINNED_BORDER, TAB_SELECTED_BORDER_TOP } from "../../../common/theme.js";
import { activeContrastBorder, contrastBorder, editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { ResourcesDropHandler, DraggedEditorIdentifier, DraggedEditorGroupIdentifier, extractTreeDropData, isWindowDraggedOver } from "../../dnd.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { addDisposableListener, EventType, EventHelper, Dimension, scheduleAtNextAnimationFrame, findParentWithClass, clearNode, DragAndDropObserver, isMouseEvent, getWindow, ModifierKeyEmitter, $ } from "../../../../base/browser/dom.js";
import { localize } from "../../../../nls.js";
import { prepareMoveCopyEditors } from "./editor.js";
import { CloseEditorTabAction, CloseOtherEditorTabsInGroupAction, UnpinEditorAction } from "./editorActions.js";
import { assertReturnsAllDefined, assertReturnsDefined } from "../../../../base/common/types.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { basenameOrAuthority } from "../../../../base/common/resources.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { win32, posix } from "../../../../base/common/path.js";
import { coalesce, insert } from "../../../../base/common/arrays.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { isSafari } from "../../../../base/browser/browser.js";
import { equals } from "../../../../base/common/objects.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { UNLOCK_GROUP_COMMAND_ID } from "./editorCommands.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ITreeViewsDnDService } from "../../../../editor/common/services/treeViewsDndService.js";
import { DraggedTreeItemsIdentifier } from "../../../../editor/common/services/treeViewsDnd.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from "../../../common/editor/filteredEditorGroupModel.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
let MultiEditorTabsControl = class extends EditorTabsControl {
  constructor(parent, editorPartsView, groupsView, groupView, tabsModel, menuIds, breadcrumbsInHeader, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorService, pathService, treeViewsDragAndDropService, editorResolverService, hostService, menuService) {
    super(parent, editorPartsView, groupsView, groupView, tabsModel, menuIds, breadcrumbsInHeader, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorResolverService, hostService, menuService);
    this.editorService = editorService;
    this.pathService = pathService;
    this.treeViewsDragAndDropService = treeViewsDragAndDropService;
    this.closeEditorAction = this._register(this.instantiationService.createInstance(CloseEditorTabAction, CloseEditorTabAction.ID, CloseEditorTabAction.LABEL));
    this.unpinEditorAction = this._register(this.instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL));
    this.closeOtherEditorTabsInGroupAction = this._register(this.instantiationService.createInstance(CloseOtherEditorTabsInGroupAction, CloseOtherEditorTabsInGroupAction.ID, CloseOtherEditorTabsInGroupAction.LABEL));
    this.tabResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this.tabLabels = [];
    this.tabActionBars = [];
    this.tabDisposables = [];
    this.dimensions = {
      container: Dimension.None,
      available: Dimension.None
    };
    this.layoutScheduler = this._register(new MutableDisposable());
    this.path = isWindows ? win32 : posix;
    this.lastMouseWheelEventTime = 0;
    this.isMouseOverTabs = false;
    this.updateEditorLabelScheduler = this._register(new RunOnceScheduler(() => this.doUpdateEditorLabels(), 0));
    (async () => this.path = await this.pathService.path)();
    this._register(this.tabResourceLabels.onDidChangeDecorations(() => this.doHandleDecorationsChange()));
    this.wantsCloseOthersAction = modifierKeyEmitter.keyStatus.altKey;
    this._register(modifierKeyEmitter.event(() => this.updateTabActionsForAltState()));
  }
  updateTabActionsForAltState() {
    const wantsCloseOthersAction = modifierKeyEmitter.keyStatus.altKey;
    if (wantsCloseOthersAction === this.wantsCloseOthersAction) {
      return;
    }
    this.wantsCloseOthersAction = wantsCloseOthersAction;
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTabAction(editor, tabIndex, tabContainer, tabActionBar);
    });
  }
  create(parent) {
    super.create(parent);
    this.titleContainer = parent;
    this.tabsAndActionsContainer = $(".tabs-and-actions-container");
    this.titleContainer.appendChild(this.tabsAndActionsContainer);
    this.stickyTabsBackground = $(".sticky-tabs-background", { "aria-hidden": true });
    this.tabsContainer = $(".tabs-container", {
      role: "tablist",
      "aria-multiselectable": "true",
      draggable: true
    });
    this._register(Gesture.addTarget(this.tabsContainer));
    this.tabSizingFixedDisposables = this._register(new DisposableStore());
    this.updateTabSizing(false);
    this.tabsScrollbar = this.createTabsScrollbar(this.tabsContainer);
    this.tabsAndActionsContainer.appendChild(this.tabsScrollbar.getDomNode());
    this.tabsScrollbar.getDomNode().appendChild(this.stickyTabsBackground);
    this.registerTabsContainerListeners(this.tabsContainer, this.tabsScrollbar);
    if (this.menuIds?.tabsBarAddTab) {
      this.addTabContainer = this.createAddTabControl(this.tabsContainer, this.menuIds.tabsBarAddTab);
    }
    this.createEditorActionsToolBar(this.tabsAndActionsContainer, ["editor-actions"], !!this.menuIds?.tabsBarAddTab);
    this.updateTabsControlVisibility();
    return this.tabsAndActionsContainer;
  }
  get tabCount() {
    const tabsContainer = assertReturnsDefined(this.tabsContainer);
    return this.addTabContainer ? tabsContainer.children.length - 1 : tabsContainer.children.length;
  }
  appendTab(tab, tabsContainer) {
    if (this.addTabContainer) {
      tabsContainer.insertBefore(tab, this.addTabContainer);
    } else {
      tabsContainer.appendChild(tab);
    }
  }
  removeLastTab(tabsContainer) {
    if (this.addTabContainer) {
      this.addTabContainer.previousElementSibling?.remove();
    } else {
      tabsContainer.lastChild?.remove();
    }
  }
  createTabsScrollbar(scrollable) {
    const tabsScrollbar = this._register(new ScrollableElement(scrollable, {
      horizontal: this.getTabsScrollbarVisibility(),
      horizontalScrollbarSize: this.getTabsScrollbarSizing(),
      vertical: ScrollbarVisibility.Hidden,
      scrollYToX: true,
      useShadows: false
    }));
    this._register(tabsScrollbar.onScroll((e) => {
      if (e.scrollLeftChanged) {
        scrollable.scrollLeft = e.scrollLeft;
      }
    }));
    return tabsScrollbar;
  }
  updateTabsScrollbarSizing() {
    this.tabsScrollbar?.updateOptions({
      horizontalScrollbarSize: this.getTabsScrollbarSizing()
    });
  }
  updateTabsScrollbarVisibility() {
    this.tabsScrollbar?.updateOptions({
      horizontal: this.getTabsScrollbarVisibility()
    });
  }
  updateTabSizing(fromEvent) {
    const [tabsContainer, tabSizingFixedDisposables] = assertReturnsAllDefined(this.tabsContainer, this.tabSizingFixedDisposables);
    tabSizingFixedDisposables.clear();
    const options = this.groupsView.partOptions;
    if (options.tabSizing === "fixed") {
      tabsContainer.style.setProperty("--tab-sizing-fixed-min-width", `${options.tabSizingFixedMinWidth}px`);
      tabsContainer.style.setProperty("--tab-sizing-fixed-max-width", `${options.tabSizingFixedMaxWidth}px`);
      tabSizingFixedDisposables.add(addDisposableListener(tabsContainer, EventType.MOUSE_ENTER, () => {
        this.isMouseOverTabs = true;
      }));
      tabSizingFixedDisposables.add(addDisposableListener(tabsContainer, EventType.MOUSE_LEAVE, () => {
        this.isMouseOverTabs = false;
        this.updateTabsFixedWidth(false);
      }));
    } else if (fromEvent) {
      tabsContainer.style.removeProperty("--tab-sizing-fixed-min-width");
      tabsContainer.style.removeProperty("--tab-sizing-fixed-max-width");
      this.updateTabsFixedWidth(false);
    }
  }
  updateTabsFixedWidth(fixed) {
    this.forEachTab((editor, tabIndex, tabContainer) => {
      if (fixed) {
        const { width } = tabContainer.getBoundingClientRect();
        tabContainer.style.setProperty("--tab-sizing-current-width", `${width}px`);
      } else {
        tabContainer.style.removeProperty("--tab-sizing-current-width");
      }
    });
  }
  getTabsScrollbarSizing() {
    if (this.groupsView.partOptions.titleScrollbarSizing !== "large") {
      return MultiEditorTabsControl.SCROLLBAR_SIZES.default;
    }
    return MultiEditorTabsControl.SCROLLBAR_SIZES.large;
  }
  getTabsScrollbarVisibility() {
    switch (this.groupsView.partOptions.titleScrollbarVisibility) {
      case "visible":
        return ScrollbarVisibility.Visible;
      case "hidden":
        return ScrollbarVisibility.Hidden;
      default:
        return ScrollbarVisibility.Auto;
    }
  }
  registerTabsContainerListeners(tabsContainer, tabsScrollbar) {
    this._register(addDisposableListener(tabsContainer, EventType.SCROLL, () => {
      if (tabsContainer.classList.contains("scroll")) {
        tabsScrollbar.setScrollPosition({
          scrollLeft: tabsContainer.scrollLeft
          // during DND the container gets scrolled so we need to update the custom scrollbar
        });
      }
    }));
    for (const eventType of [TouchEventType.Tap, EventType.DBLCLICK]) {
      this._register(addDisposableListener(tabsContainer, eventType, (e) => {
        if (eventType === EventType.DBLCLICK) {
          if (e.target !== tabsContainer) {
            return;
          }
        } else {
          if (e.tapCount !== 2) {
            return;
          }
          if (e.initialTarget !== tabsContainer) {
            return;
          }
        }
        EventHelper.stop(e);
        this.editorService.openEditor({
          resource: void 0,
          options: {
            pinned: true,
            index: this.groupView.count,
            // always at the end
            override: DEFAULT_EDITOR_ASSOCIATION.id
          }
        }, this.groupView.id);
      }));
    }
    this._register(addDisposableListener(tabsContainer, EventType.MOUSE_DOWN, (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    }));
    if (isLinux) {
      this._register(addDisposableListener(tabsContainer, EventType.MOUSE_UP, (e) => {
        if (e.button === 1) {
          e.preventDefault();
        }
      }));
    }
    let lastDragEvent = void 0;
    let isNewWindowOperation = false;
    this._register(new DragAndDropObserver(tabsContainer, {
      onDragStart: (e) => {
        isNewWindowOperation = this.onGroupDragStart(e, tabsContainer);
      },
      onDrag: (e) => {
        lastDragEvent = e;
      },
      onDragEnter: (e) => {
        tabsContainer.classList.add("scroll");
        if (e.target !== tabsContainer) {
          return;
        }
        if (!this.isSupportedDropTransfer(e)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "none";
          }
          return;
        }
        if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
          }
        }
        this.updateDropFeedback(tabsContainer, true, e);
      },
      onDragLeave: (e) => {
        this.updateDropFeedback(tabsContainer, false, e);
        tabsContainer.classList.remove("scroll");
      },
      onDragEnd: (e) => {
        this.updateDropFeedback(tabsContainer, false, e);
        tabsContainer.classList.remove("scroll");
        this.onGroupDragEnd(e, lastDragEvent, tabsContainer, isNewWindowOperation);
      },
      onDrop: (e) => {
        this.updateDropFeedback(tabsContainer, false, e);
        tabsContainer.classList.remove("scroll");
        if (e.target === tabsContainer) {
          const isGroupTransfer = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
          this.onDrop(e, isGroupTransfer ? this.groupView.count : this.tabsModel.count, tabsContainer);
        }
      }
    }));
    this._register(addDisposableListener(tabsContainer, EventType.MOUSE_WHEEL, (e) => {
      const activeEditor = this.groupView.activeEditor;
      if (!activeEditor || this.groupView.count < 2) {
        return;
      }
      if (this.groupsView.partOptions.scrollToSwitchTabs === true) {
        if (e.shiftKey) {
          return;
        }
      } else {
        if (!e.shiftKey) {
          return;
        }
      }
      const now = Date.now();
      if (now - this.lastMouseWheelEventTime < MultiEditorTabsControl.MOUSE_WHEEL_EVENT_THRESHOLD - 2 * (Math.abs(e.deltaX) + Math.abs(e.deltaY))) {
        return;
      }
      this.lastMouseWheelEventTime = now;
      let tabSwitchDirection;
      if (e.deltaX + e.deltaY < -MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD) {
        tabSwitchDirection = -1;
      } else if (e.deltaX + e.deltaY > MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD) {
        tabSwitchDirection = 1;
      } else {
        return;
      }
      const nextEditor = this.groupView.getEditorByIndex(this.groupView.getIndexOfEditor(activeEditor) + tabSwitchDirection);
      if (!nextEditor) {
        return;
      }
      this.groupView.openEditor(nextEditor);
      EventHelper.stop(e, true);
    }));
    const showContextMenu = (e) => {
      EventHelper.stop(e);
      let anchor = tabsContainer;
      if (isMouseEvent(e)) {
        anchor = new StandardMouseEvent(getWindow(this.parent), e);
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        menuId: this.menuIds?.tabsBarContext ?? MenuId.EditorTabsBarContext,
        contextKeyService: this.contextKeyService,
        menuActionOptions: { shouldForwardArgs: true },
        getActionsContext: () => ({ groupId: this.groupView.id }),
        getKeyBinding: (action) => this.getKeybinding(action),
        onHide: () => this.groupView.focus()
      });
    };
    this._register(addDisposableListener(tabsContainer, TouchEventType.Contextmenu, (e) => showContextMenu(e)));
    this._register(addDisposableListener(tabsContainer, EventType.CONTEXT_MENU, (e) => showContextMenu(e)));
  }
  doHandleDecorationsChange() {
    this.layout(this.dimensions);
  }
  updateEditorActionsToolbar() {
    super.updateEditorActionsToolbar();
    this.layout(this.dimensions);
  }
  openEditor(editor, options) {
    const changed = this.handleOpenedEditors();
    if (options?.focusTabControl) {
      this.withTab(editor, (editor2, tabIndex, tabContainer) => tabContainer.focus());
    }
    return changed;
  }
  openEditors(editors) {
    return this.handleOpenedEditors();
  }
  handleOpenedEditors() {
    this.updateTabsControlVisibility();
    const [tabsContainer, tabsScrollbar] = assertReturnsAllDefined(this.tabsContainer, this.tabsScrollbar);
    for (let i = this.tabCount; i < this.tabsModel.count; i++) {
      this.appendTab(this.createTab(i, tabsContainer, tabsScrollbar), tabsContainer);
    }
    const activeEditorChanged = this.didActiveEditorChange();
    const oldTabLabels = this.tabLabels;
    this.computeTabLabels();
    let didChange = false;
    if (activeEditorChanged || // active editor changed
    oldTabLabels.length !== this.tabLabels.length || // number of tabs changed
    oldTabLabels.some((label, index) => !this.equalsEditorInputLabel(label, this.tabLabels.at(index)))) {
      this.redraw({ forceRevealActiveTab: true });
      didChange = true;
    } else {
      this.layout(this.dimensions, { forceRevealActiveTab: true });
    }
    return didChange;
  }
  didActiveEditorChange() {
    if (!this.activeTabLabel?.editor && this.tabsModel.activeEditor || // active editor changed from null => editor
    this.activeTabLabel?.editor && !this.tabsModel.activeEditor || // active editor changed from editor => null
    (!this.activeTabLabel?.editor || !this.tabsModel.isActive(this.activeTabLabel.editor))) {
      return true;
    }
    return false;
  }
  equalsEditorInputLabel(labelA, labelB) {
    if (labelA === labelB) {
      return true;
    }
    if (!labelA || !labelB) {
      return false;
    }
    return labelA.name === labelB.name && labelA.description === labelB.description && labelA.forceDescription === labelB.forceDescription && labelA.title === labelB.title && labelA.ariaLabel === labelB.ariaLabel;
  }
  beforeCloseEditor(editor) {
    if (this.isMouseOverTabs && this.groupsView.partOptions.tabSizing === "fixed") {
      const closingLastTab = this.tabsModel.isLast(editor);
      this.updateTabsFixedWidth(!closingLastTab);
    }
  }
  closeEditor(editor) {
    this.handleClosedEditors();
  }
  closeEditors(editors) {
    this.handleClosedEditors();
  }
  handleClosedEditors() {
    if (this.tabsModel.count) {
      const tabsContainer = assertReturnsDefined(this.tabsContainer);
      while (this.tabCount > this.tabsModel.count) {
        this.removeLastTab(tabsContainer);
        dispose(this.tabDisposables.pop());
      }
      this.computeTabLabels();
      this.redraw({ forceRevealActiveTab: true });
    } else {
      if (this.tabsContainer) {
        clearNode(this.tabsContainer);
        if (this.addTabContainer) {
          this.tabsContainer.appendChild(this.addTabContainer);
        }
      }
      this.tabDisposables = dispose(this.tabDisposables);
      this.tabResourceLabels.clear();
      this.tabLabels = [];
      this.activeTabLabel = void 0;
      this.tabActionBars = [];
      this.clearEditorActionsToolbar();
      this.updateTabsControlVisibility();
    }
  }
  moveEditor(editor, fromTabIndex, targetTabIndex) {
    const editorLabel = this.tabLabels[fromTabIndex];
    this.tabLabels.splice(fromTabIndex, 1);
    this.tabLabels.splice(targetTabIndex, 0, editorLabel);
    this.forEachTab(
      (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
        this.redrawTab(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar);
      },
      Math.min(fromTabIndex, targetTabIndex),
      // from: smallest of fromTabIndex/targetTabIndex
      Math.max(fromTabIndex, targetTabIndex)
      //   to: largest of fromTabIndex/targetTabIndex
    );
    this.layout(this.dimensions, { forceRevealActiveTab: true });
  }
  pinEditor(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel) => this.redrawTabLabel(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel));
  }
  stickEditor(editor) {
    this.doHandleStickyEditorChange(editor);
  }
  unstickEditor(editor) {
    this.doHandleStickyEditorChange(editor);
  }
  doHandleStickyEditorChange(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTab(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar));
    this.forEachTab((editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel) => {
      this.redrawTabBorders(tabIndex, tabContainer);
    });
    this.layout(this.dimensions, { forceRevealActiveTab: true });
  }
  setActive(isGroupActive) {
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTabSelectedActiveAndDirty(isGroupActive, editor, tabContainer, tabActionBar);
    });
    this.updateEditorActionsToolbar();
    this.layout(this.dimensions, { forceRevealActiveTab: true });
  }
  updateEditorSelections() {
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar);
    });
  }
  updateEditorLabel(editor) {
    this.updateEditorLabelScheduler.schedule();
  }
  doUpdateEditorLabels() {
    this.computeTabLabels();
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) => {
      this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel);
    });
    this.layout(this.dimensions);
  }
  updateEditorDirty(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor2, tabContainer, tabActionBar));
  }
  updateEditorCapabilities(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTab(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar));
  }
  updateOptions(oldOptions, newOptions) {
    super.updateOptions(oldOptions, newOptions);
    if (oldOptions.labelFormat !== newOptions.labelFormat) {
      this.computeTabLabels();
    }
    if (oldOptions.titleScrollbarSizing !== newOptions.titleScrollbarSizing) {
      this.updateTabsScrollbarSizing();
    }
    if (oldOptions.titleScrollbarVisibility !== newOptions.titleScrollbarVisibility) {
      this.updateTabsScrollbarVisibility();
    }
    if (oldOptions.alwaysShowEditorActions !== newOptions.alwaysShowEditorActions) {
      this.updateEditorActionsToolbar();
    }
    if (oldOptions.tabSizingFixedMinWidth !== newOptions.tabSizingFixedMinWidth || oldOptions.tabSizingFixedMaxWidth !== newOptions.tabSizingFixedMaxWidth || oldOptions.tabSizing !== newOptions.tabSizing) {
      this.updateTabSizing(true);
    }
    if (oldOptions.labelFormat !== newOptions.labelFormat || oldOptions.tabActionLocation !== newOptions.tabActionLocation || oldOptions.tabActionCloseVisibility !== newOptions.tabActionCloseVisibility || oldOptions.tabActionUnpinVisibility !== newOptions.tabActionUnpinVisibility || oldOptions.tabSizing !== newOptions.tabSizing || oldOptions.pinnedTabSizing !== newOptions.pinnedTabSizing || oldOptions.showIcons !== newOptions.showIcons || oldOptions.hasIcons !== newOptions.hasIcons || oldOptions.highlightModifiedTabs !== newOptions.highlightModifiedTabs || oldOptions.wrapTabs !== newOptions.wrapTabs || oldOptions.showTabIndex !== newOptions.showTabIndex || !equals(oldOptions.decorations, newOptions.decorations)) {
      this.redraw();
    }
  }
  updateStyles() {
    this.redraw();
  }
  forEachTab(fn, fromTabIndex, toTabIndex) {
    this.tabsModel.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor, tabIndex) => {
      if (typeof fromTabIndex === "number" && fromTabIndex > tabIndex) {
        return;
      }
      if (typeof toTabIndex === "number" && toTabIndex < tabIndex) {
        return;
      }
      this.doWithTab(tabIndex, editor, fn);
    });
  }
  withTab(editor, fn) {
    this.doWithTab(this.tabsModel.indexOf(editor), editor, fn);
  }
  doWithTab(tabIndex, editor, fn) {
    const tabsContainer = assertReturnsDefined(this.tabsContainer);
    const tabContainer = tabsContainer.children[tabIndex];
    const tabResourceLabel = this.tabResourceLabels.get(tabIndex);
    const tabLabel = this.tabLabels[tabIndex];
    const tabActionBar = this.tabActionBars[tabIndex];
    if (tabContainer && tabResourceLabel && tabLabel) {
      fn(editor, tabIndex, tabContainer, tabResourceLabel, tabLabel, tabActionBar);
    }
  }
  createTab(tabIndex, tabsContainer, tabsScrollbar) {
    const tabContainer = $(".tab", {
      draggable: true,
      role: "tab"
    });
    const gestureDisposable = Gesture.addTarget(tabContainer);
    const tabFillContainer = $(".tab-fill", { "aria-hidden": true });
    tabContainer.appendChild(tabFillContainer);
    const tabBorderTopContainer = $(".tab-border-top-container");
    tabContainer.appendChild(tabBorderTopContainer);
    const editorLabel = this.tabResourceLabels.create(tabContainer, { hoverTargetOverride: tabContainer });
    const tabActionsContainer = $(".tab-actions");
    tabContainer.appendChild(tabActionsContainer);
    const that = this;
    const tabActionRunner = new EditorCommandsContextActionRunner({
      groupId: this.groupView.id,
      get editorIndex() {
        return that.toEditorIndex(tabIndex);
      }
    });
    const tabActionBar = new ActionBar(tabActionsContainer, { ariaLabel: localize("ariaLabelTabActions", "Tab actions"), actionRunner: tabActionRunner });
    const tabActionListener = tabActionBar.onWillRun((e) => {
      if (e.action.id === this.closeEditorAction.id || e.action.id === this.closeOtherEditorTabsInGroupAction.id) {
        this.blockRevealActiveTabOnce();
      }
    });
    const tabActionBarDisposable = combinedDisposable(tabActionRunner, tabActionBar, tabActionListener, toDisposable(insert(this.tabActionBars, tabActionBar)));
    const tabShadowHider = $(".tab-fade-hider");
    tabContainer.appendChild(tabShadowHider);
    const tabBorderBottomContainer = $(".tab-border-bottom-container");
    tabContainer.appendChild(tabBorderBottomContainer);
    const eventsDisposable = this.registerTabListeners(tabContainer, tabIndex, tabsContainer, tabsScrollbar);
    this.tabDisposables.push(combinedDisposable(gestureDisposable, eventsDisposable, tabActionBarDisposable, editorLabel));
    return tabContainer;
  }
  toEditorIndex(tabIndex) {
    const editor = assertReturnsDefined(this.tabsModel.getEditorByIndex(tabIndex));
    return this.groupView.getIndexOfEditor(editor);
  }
  registerTabListeners(tab, tabIndex, tabsContainer, tabsScrollbar) {
    const disposables = new DisposableStore();
    const handleClickOrTouch = async (e, preserveFocus) => {
      tab.blur();
      if (isMouseEvent(e) && (e.button !== 0 || isMacintosh && e.ctrlKey)) {
        if (e.button === 1) {
          e.preventDefault();
        }
        return;
      }
      if (this.originatesFromTabActionBar(e)) {
        return;
      }
      const editor = this.tabsModel.getEditorByIndex(tabIndex);
      if (editor) {
        if (e.shiftKey) {
          let anchor;
          if (this.lastSingleSelectSelectedEditor && this.tabsModel.isSelected(this.lastSingleSelectSelectedEditor)) {
            anchor = this.lastSingleSelectSelectedEditor;
          } else {
            const activeEditor = assertReturnsDefined(this.groupView.activeEditor);
            this.lastSingleSelectSelectedEditor = activeEditor;
            anchor = activeEditor;
          }
          await this.selectEditorsBetween(editor, anchor);
        } else if (e.ctrlKey && !isMacintosh || e.metaKey && isMacintosh) {
          if (this.tabsModel.isSelected(editor)) {
            await this.unselectEditor(editor);
          } else {
            await this.selectEditor(editor);
            this.lastSingleSelectSelectedEditor = editor;
          }
        } else {
          const inactiveSelection = this.tabsModel.isSelected(editor) ? this.groupView.selectedEditors.filter((e2) => !e2.matches(editor)) : [];
          await this.groupView.openEditor(editor, { preserveFocus, activation: EditorActivation.ACTIVATE }, { inactiveSelection, focusTabControl: true });
        }
      }
    };
    const showContextMenu = (e) => {
      EventHelper.stop(e);
      const editor = this.tabsModel.getEditorByIndex(tabIndex);
      if (editor) {
        this.onTabContextMenu(editor, e, tab);
      }
    };
    disposables.add(addDisposableListener(tab, EventType.MOUSE_DOWN, (e) => handleClickOrTouch(e, false)));
    disposables.add(addDisposableListener(tab, TouchEventType.Tap, (e) => handleClickOrTouch(e, true)));
    disposables.add(addDisposableListener(tab, TouchEventType.Change, (e) => {
      tabsScrollbar.setScrollPosition({ scrollLeft: tabsScrollbar.getScrollPosition().scrollLeft - e.translationX });
    }));
    disposables.add(addDisposableListener(tab, EventType.MOUSE_UP, async (e) => {
      EventHelper.stop(e);
      tab.blur();
      if (isMouseEvent(e) && (e.button !== 0 || isMacintosh && e.ctrlKey)) {
        return;
      }
      if (this.originatesFromTabActionBar(e)) {
        return;
      }
      const isCtrlCmd = e.ctrlKey && !isMacintosh || e.metaKey && isMacintosh;
      if (!isCtrlCmd && !e.shiftKey && this.groupView.selectedEditors.length > 1) {
        await this.unselectAllEditors();
      }
    }));
    disposables.add(addDisposableListener(tab, EventType.AUXCLICK, (e) => {
      if (e.button === 1) {
        EventHelper.stop(
          e,
          true
          /* for https://github.com/microsoft/vscode/issues/56715 */
        );
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor) {
          if (editor.hasCapability(EditorInputCapabilities.CannotClose) || preventEditorClose(this.tabsModel, editor, EditorCloseMethod.MOUSE, this.groupsView.partOptions)) {
            return;
          }
          this.blockRevealActiveTabOnce();
          this.closeEditorAction.run({ groupId: this.groupView.id, editorIndex: this.groupView.getIndexOfEditor(editor) });
        }
      }
    }));
    disposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.shiftKey && event.keyCode === KeyCode.F10) {
        showContextMenu(e);
      }
    }));
    disposables.add(addDisposableListener(tab, TouchEventType.Contextmenu, (e) => {
      showContextMenu(e);
    }));
    disposables.add(addDisposableListener(tab, EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      let handled = false;
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        handled = true;
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor) {
          this.groupView.openEditor(editor);
        }
      } else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some((kb) => event.equals(kb))) {
        let editorIndex = this.toEditorIndex(tabIndex);
        if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
          editorIndex = editorIndex - 1;
        } else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
          editorIndex = editorIndex + 1;
        } else if (event.equals(KeyCode.Home)) {
          editorIndex = 0;
        } else {
          editorIndex = this.groupView.count - 1;
        }
        const target = this.groupView.getEditorByIndex(editorIndex);
        if (target) {
          handled = true;
          this.groupView.openEditor(target, { preserveFocus: true }, { focusTabControl: true });
        }
      }
      if (handled) {
        EventHelper.stop(e, true);
      }
      tabsScrollbar.setScrollPosition({
        scrollLeft: tabsContainer.scrollLeft
      });
    }));
    for (const eventType of [TouchEventType.Tap, EventType.DBLCLICK]) {
      disposables.add(addDisposableListener(tab, eventType, (e) => {
        if (eventType === EventType.DBLCLICK) {
          EventHelper.stop(e);
        } else if (e.tapCount !== 2) {
          return;
        }
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor && this.tabsModel.isPinned(editor)) {
          switch (this.groupsView.partOptions.doubleClickTabToToggleEditorGroupSizes) {
            case "maximize":
              this.groupsView.toggleMaximizeGroup(this.groupView);
              break;
            case "expand":
              this.groupsView.toggleExpandGroup(this.groupView);
              break;
            case "off":
              break;
          }
        } else {
          this.groupView.pinEditor(editor);
        }
      }));
    }
    disposables.add(addDisposableListener(
      tab,
      EventType.CONTEXT_MENU,
      (e) => {
        EventHelper.stop(e, true);
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor) {
          this.onTabContextMenu(editor, e, tab);
        }
      },
      true
      /* use capture to fix https://github.com/microsoft/vscode/issues/19145 */
    ));
    let lastDragEvent = void 0;
    let isNewWindowOperation = false;
    disposables.add(new DragAndDropObserver(tab, {
      onDragStart: (e) => {
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (!editor) {
          return;
        }
        isNewWindowOperation = this.isNewWindowOperation(e);
        const selectedEditors = this.groupView.selectedEditors;
        this.editorTransfer.setData(selectedEditors.map((e2) => new DraggedEditorIdentifier({ editor: e2, groupId: this.groupView.id })), DraggedEditorIdentifier.prototype);
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "copyMove";
          if (selectedEditors.length > 1) {
            const label = `${editor.getName()} + ${selectedEditors.length - 1}`;
            applyDragImage(e, tab, label);
          } else {
            const options = this.groupsView.partOptions;
            const isTabSticky = this.tabsModel.isSticky(tabIndex);
            const isShrinkSizing = options.tabSizing === "shrink" || isTabSticky && options.pinnedTabSizing === "shrink";
            if (isShrinkSizing) {
              applyDragImage(e, tab, editor.getName());
            } else {
              e.dataTransfer.setDragImage(tab, 0, 0);
            }
          }
        }
        this.doFillResourceDataTransfers(selectedEditors, e, isNewWindowOperation);
        scheduleAtNextAnimationFrame(getWindow(this.parent), () => this.updateDropFeedback(tab, false, e, tabIndex));
      },
      onDrag: (e) => {
        lastDragEvent = e;
      },
      onDragEnter: (e) => {
        if (!this.isSupportedDropTransfer(e)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "none";
          }
          return;
        }
        if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
          }
        }
        this.updateDropFeedback(tab, true, e, tabIndex);
      },
      onDragOver: (e, dragDuration) => {
        if (dragDuration >= MultiEditorTabsControl.DRAG_OVER_OPEN_TAB_THRESHOLD) {
          const draggedOverTab = this.tabsModel.getEditorByIndex(tabIndex);
          if (draggedOverTab && this.tabsModel.activeEditor !== draggedOverTab) {
            this.groupView.openEditor(draggedOverTab, { preserveFocus: true });
          }
        }
        this.updateDropFeedback(tab, true, e, tabIndex);
      },
      onDragEnd: async (e) => {
        this.updateDropFeedback(tab, false, e, tabIndex);
        const draggedEditors = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
        this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
        if (!isNewWindowOperation || isWindowDraggedOver() || !draggedEditors || draggedEditors.length === 0) {
          return;
        }
        const auxiliaryEditorPart = await this.maybeCreateAuxiliaryEditorPartAt(e, tab);
        if (!auxiliaryEditorPart) {
          return;
        }
        const targetGroup = auxiliaryEditorPart.activeGroup;
        const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map((editor) => editor.identifier.editor));
        if (this.isMoveOperation(lastDragEvent ?? e, targetGroup.id, draggedEditors[0].identifier.editor)) {
          this.groupView.moveEditors(editorsWithOptions, targetGroup);
        } else {
          this.groupView.copyEditors(editorsWithOptions, targetGroup);
        }
        targetGroup.focus();
      },
      onDrop: (e) => {
        this.updateDropFeedback(tab, false, e, tabIndex);
        let targetIndex = tabIndex;
        if (this.getTabDragOverLocation(e, tab) === "right") {
          targetIndex++;
        }
        this.onDrop(e, targetIndex, tabsContainer);
      }
    }));
    return disposables;
  }
  isSupportedDropTransfer(e) {
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const group = data[0];
        if (group.identifier === this.groupView.id) {
          return false;
        }
      }
      return true;
    }
    if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      return true;
    }
    if (e.dataTransfer && e.dataTransfer.types.length > 0) {
      return true;
    }
    return false;
  }
  updateDropFeedback(element, isDND, e, tabIndex) {
    const isTab = typeof tabIndex === "number";
    let dropTarget;
    if (isDND) {
      if (isTab) {
        dropTarget = this.computeDropTarget(e, tabIndex, element);
      } else {
        dropTarget = { leftElement: element.lastElementChild, rightElement: void 0 };
      }
    } else {
      dropTarget = void 0;
    }
    this.updateDropTarget(dropTarget);
  }
  updateDropTarget(newTarget) {
    const oldTargets = this.dropTarget;
    if (oldTargets === newTarget || oldTargets && newTarget && oldTargets.leftElement === newTarget.leftElement && oldTargets.rightElement === newTarget.rightElement) {
      return;
    }
    const dropClassLeft = "drop-target-left";
    const dropClassRight = "drop-target-right";
    if (oldTargets) {
      oldTargets.leftElement?.classList.remove(dropClassLeft);
      oldTargets.rightElement?.classList.remove(dropClassRight);
    }
    if (newTarget) {
      newTarget.leftElement?.classList.add(dropClassLeft);
      newTarget.rightElement?.classList.add(dropClassRight);
    }
    this.dropTarget = newTarget;
  }
  getTabDragOverLocation(e, tab) {
    const rect = tab.getBoundingClientRect();
    const offsetXRelativeToParent = e.clientX - rect.left;
    return offsetXRelativeToParent <= rect.width / 2 ? "left" : "right";
  }
  computeDropTarget(e, tabIndex, targetTab) {
    const isLeftSideOfTab = this.getTabDragOverLocation(e, targetTab) === "left";
    const isLastTab = tabIndex === this.tabsModel.count - 1;
    const isFirstTab = tabIndex === 0;
    if (isLeftSideOfTab && isFirstTab) {
      return { leftElement: void 0, rightElement: targetTab };
    }
    if (!isLeftSideOfTab && isLastTab) {
      return { leftElement: targetTab, rightElement: void 0 };
    }
    const tabBefore = isLeftSideOfTab ? targetTab.previousElementSibling : targetTab;
    const tabAfter = isLeftSideOfTab ? targetTab : targetTab.nextElementSibling;
    return { leftElement: tabBefore, rightElement: tabAfter };
  }
  async selectEditor(editor) {
    if (this.groupView.isActive(editor)) {
      return;
    }
    await this.groupView.setSelection(editor, this.groupView.selectedEditors);
  }
  async selectEditorsBetween(target, anchor) {
    const editorIndex = this.groupView.getIndexOfEditor(target);
    if (editorIndex === -1) {
      throw new BugIndicatingError();
    }
    const anchorEditorIndex = this.groupView.getIndexOfEditor(anchor);
    if (anchorEditorIndex === -1) {
      throw new BugIndicatingError();
    }
    let selection = this.groupView.selectedEditors;
    let currentEditorIndex = anchorEditorIndex;
    while (currentEditorIndex >= 0 && currentEditorIndex <= this.groupView.count - 1) {
      currentEditorIndex = anchorEditorIndex < editorIndex ? currentEditorIndex - 1 : currentEditorIndex + 1;
      const currentEditor = this.groupView.getEditorByIndex(currentEditorIndex);
      if (!currentEditor) {
        break;
      }
      if (!this.groupView.isSelected(currentEditor)) {
        break;
      }
      selection = selection.filter((editor) => !editor.matches(currentEditor));
    }
    const fromEditorIndex = anchorEditorIndex < editorIndex ? anchorEditorIndex : editorIndex;
    const toEditorIndex = anchorEditorIndex < editorIndex ? editorIndex : anchorEditorIndex;
    const editorsToSelect = this.groupView.getEditors(EditorsOrder.SEQUENTIAL).slice(fromEditorIndex, toEditorIndex + 1);
    for (const editor of editorsToSelect) {
      if (!this.groupView.isSelected(editor)) {
        selection.push(editor);
      }
    }
    const inactiveSelectedEditors = selection.filter((editor) => !editor.matches(target));
    await this.groupView.setSelection(target, inactiveSelectedEditors);
  }
  async unselectEditor(editor) {
    const isUnselectingActiveEditor = this.groupView.isActive(editor);
    if (isUnselectingActiveEditor && this.groupView.selectedEditors.length === 1) {
      return;
    }
    let newActiveEditor = assertReturnsDefined(this.groupView.activeEditor);
    if (isUnselectingActiveEditor) {
      const recentEditors = this.groupView.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
      for (let i = 1; i < recentEditors.length; i++) {
        const recentEditor = recentEditors[i];
        if (this.groupView.isSelected(recentEditor)) {
          newActiveEditor = recentEditor;
          break;
        }
      }
    }
    const inactiveSelectedEditors = this.groupView.selectedEditors.filter((e) => !e.matches(editor) && !e.matches(newActiveEditor));
    await this.groupView.setSelection(newActiveEditor, inactiveSelectedEditors);
  }
  async unselectAllEditors() {
    if (this.groupView.selectedEditors.length > 1) {
      const activeEditor = assertReturnsDefined(this.groupView.activeEditor);
      await this.groupView.setSelection(activeEditor, []);
    }
  }
  computeTabLabels() {
    const { labelFormat } = this.groupsView.partOptions;
    const { verbosity, shortenDuplicates } = this.getLabelConfigFlags(labelFormat);
    const labels = [];
    let activeEditorTabIndex = -1;
    this.tabsModel.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor, tabIndex) => {
      labels.push({
        editor,
        name: editor.getName(),
        description: editor.getDescription(verbosity),
        forceDescription: editor.hasCapability(EditorInputCapabilities.ForceDescription),
        title: editor.getTitle(Verbosity.LONG),
        ariaLabel: computeEditorAriaLabel(editor, tabIndex, this.groupView, this.editorPartsView.count)
      });
      if (editor === this.tabsModel.activeEditor) {
        activeEditorTabIndex = tabIndex;
      }
    });
    if (shortenDuplicates) {
      this.shortenTabLabels(labels);
    }
    this.tabLabels = labels;
    this.activeTabLabel = labels[activeEditorTabIndex];
  }
  shortenTabLabels(labels) {
    const mapNameToDuplicates = /* @__PURE__ */ new Map();
    for (const label of labels) {
      if (typeof label.description === "string") {
        getOrSet(mapNameToDuplicates, label.name, []).push(label);
      } else {
        label.description = "";
      }
    }
    for (const [, duplicateLabels] of mapNameToDuplicates) {
      if (duplicateLabels.length === 1 && !duplicateLabels[0].forceDescription) {
        duplicateLabels[0].description = "";
        continue;
      }
      const mapDescriptionToDuplicates = /* @__PURE__ */ new Map();
      for (const duplicateLabel of duplicateLabels) {
        getOrSet(mapDescriptionToDuplicates, duplicateLabel.description, []).push(duplicateLabel);
      }
      let useLongDescriptions = false;
      for (const [, duplicateLabels2] of mapDescriptionToDuplicates) {
        if (!useLongDescriptions && duplicateLabels2.length > 1) {
          const [first, ...rest] = duplicateLabels2.map(({ editor }) => editor.getDescription(Verbosity.LONG));
          useLongDescriptions = rest.some((description) => description !== first);
        }
      }
      if (useLongDescriptions) {
        mapDescriptionToDuplicates.clear();
        for (const duplicateLabel of duplicateLabels) {
          duplicateLabel.description = duplicateLabel.editor.getDescription(Verbosity.LONG);
          getOrSet(mapDescriptionToDuplicates, duplicateLabel.description, []).push(duplicateLabel);
        }
      }
      const descriptions = [];
      for (const [description] of mapDescriptionToDuplicates) {
        descriptions.push(description);
      }
      if (descriptions.length === 1) {
        for (const label of mapDescriptionToDuplicates.get(descriptions[0]) || []) {
          if (!label.forceDescription) {
            label.description = "";
          }
        }
        continue;
      }
      const shortenedDescriptions = shorten(descriptions, this.path.sep);
      descriptions.forEach((description, tabIndex) => {
        for (const label of mapDescriptionToDuplicates.get(description) || []) {
          label.description = shortenedDescriptions[tabIndex];
        }
      });
    }
  }
  getLabelConfigFlags(value) {
    switch (value) {
      case "short":
        return { verbosity: Verbosity.SHORT, shortenDuplicates: false };
      case "medium":
        return { verbosity: Verbosity.MEDIUM, shortenDuplicates: false };
      case "long":
        return { verbosity: Verbosity.LONG, shortenDuplicates: false };
      default:
        return { verbosity: Verbosity.MEDIUM, shortenDuplicates: true };
    }
  }
  redraw(options) {
    if (this.tabsAndActionsContainer) {
      let tabsContainerBorderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER);
      if (!tabsContainerBorderColor && isHighContrast(this.theme.type)) {
        tabsContainerBorderColor = this.getColor(TAB_BORDER) || this.getColor(contrastBorder);
      }
      if (tabsContainerBorderColor) {
        this.tabsAndActionsContainer.classList.add("tabs-border-bottom");
        this.tabsAndActionsContainer.style.setProperty("--tabs-border-bottom-color", tabsContainerBorderColor.toString());
      } else {
        this.tabsAndActionsContainer.classList.remove("tabs-border-bottom");
        this.tabsAndActionsContainer.style.removeProperty("--tabs-border-bottom-color");
      }
    }
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar);
    });
    this.updateEditorActionsToolbar();
    this.layout(this.dimensions, options);
  }
  // Split out from redrawTab() so updateTabActionsForAltState() can refresh just the action items, not a full tab bar redraw.
  redrawTabAction(editor, tabIndex, tabContainer, tabActionBar) {
    const isTabSticky = this.tabsModel.isSticky(tabIndex);
    const isCloseable = !editor.hasCapability(EditorInputCapabilities.CannotClose);
    const options = this.groupsView.partOptions;
    const hasUnpinAction = isTabSticky && options.tabActionUnpinVisibility;
    const hasCloseAction = isCloseable && !hasUnpinAction && options.tabActionCloseVisibility;
    const hasAction = hasUnpinAction || hasCloseAction;
    const wantsCloseOthersAction = hasCloseAction && this.wantsCloseOthersAction;
    let tabAction;
    if (hasAction) {
      tabAction = hasUnpinAction ? this.unpinEditorAction : wantsCloseOthersAction ? this.closeOtherEditorTabsInGroupAction : this.closeEditorAction;
    } else {
      tabAction = isTabSticky ? this.unpinEditorAction : this.closeEditorAction;
    }
    if (!tabActionBar.hasAction(tabAction)) {
      if (!tabActionBar.isEmpty()) {
        tabActionBar.clear();
      }
      const keybinding = tabAction === this.closeOtherEditorTabsInGroupAction ? isMacintosh ? localize("altClickMac", "\u2325+Click") : localize("altClick", "Alt+Click") : this.getKeybindingLabel(tabAction);
      tabActionBar.push(tabAction, { icon: true, label: false, keybinding });
    }
    tabContainer.classList.toggle(`pinned-action-off`, isTabSticky && !hasUnpinAction);
    tabContainer.classList.toggle(`close-action-off`, !hasUnpinAction && !hasCloseAction);
    tabContainer.classList.toggle("cannot-close", !isCloseable);
    for (const option of ["left", "right"]) {
      tabContainer.classList.toggle(`tab-actions-${option}`, hasAction && options.tabActionLocation === option);
    }
  }
  redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) {
    const isTabSticky = this.tabsModel.isSticky(tabIndex);
    const options = this.groupsView.partOptions;
    this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel);
    this.redrawTabAction(editor, tabIndex, tabContainer, tabActionBar);
    const tabSizing = isTabSticky && options.pinnedTabSizing === "shrink" ? "shrink" : options.tabSizing;
    for (const option of ["fit", "shrink", "fixed"]) {
      tabContainer.classList.toggle(`sizing-${option}`, tabSizing === option);
    }
    tabContainer.classList.toggle("has-icon", options.showIcons && options.hasIcons);
    tabContainer.classList.toggle("sticky", isTabSticky);
    for (const option of ["normal", "compact", "shrink"]) {
      tabContainer.classList.toggle(`sticky-${option}`, isTabSticky && options.pinnedTabSizing === option);
    }
    if (!options.wrapTabs && isTabSticky && options.pinnedTabSizing !== "normal") {
      tabContainer.style.left = `${tabIndex * this.getStickyTabWidth(options.pinnedTabSizing)}px`;
    } else {
      tabContainer.style.left = "auto";
    }
    this.redrawTabBorders(tabIndex, tabContainer);
    this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar);
  }
  redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) {
    const options = this.groupsView.partOptions;
    let name;
    let namePrefix;
    let forceLabel = false;
    let fileDecorationBadges = Boolean(options.decorations?.badges);
    const fileDecorationColors = Boolean(options.decorations?.colors);
    let description;
    if (options.pinnedTabSizing === "compact" && this.tabsModel.isSticky(tabIndex)) {
      const isShowingIcons = options.showIcons && options.hasIcons;
      name = isShowingIcons ? "" : tabLabel.name?.charAt(0).toUpperCase();
      description = "";
      forceLabel = true;
      fileDecorationBadges = false;
    } else {
      name = tabLabel.name;
      namePrefix = options.showTabIndex ? `${this.toEditorIndex(tabIndex) + 1}: ` : void 0;
      description = tabLabel.description || "";
    }
    if (tabLabel.ariaLabel) {
      tabContainer.setAttribute("aria-label", tabLabel.ariaLabel);
      tabContainer.setAttribute("aria-description", "");
    }
    tabLabelWidget.setResource(
      { name, description, resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }) },
      {
        title: this.getHoverTitle(editor),
        extraClasses: coalesce(["tab-label", fileDecorationBadges ? "tab-label-has-badge" : void 0].concat(editor.getLabelExtraClasses())),
        italic: !this.tabsModel.isPinned(editor),
        forceLabel,
        fileDecorations: {
          colors: fileDecorationColors,
          badges: fileDecorationBadges
        },
        icon: editor.getIcon(),
        hideIcon: options.showIcons === false,
        namePrefix
      }
    );
    const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource) {
      tabContainer.setAttribute("data-resource-name", basenameOrAuthority(resource));
    } else {
      tabContainer.removeAttribute("data-resource-name");
    }
  }
  redrawTabSelectedActiveAndDirty(isGroupActive, editor, tabContainer, tabActionBar) {
    const isTabActive = this.tabsModel.isActive(editor);
    const hasModifiedBorderTop = this.doRedrawTabDirty(isGroupActive, isTabActive, editor, tabContainer);
    this.doRedrawTabActive(isGroupActive, !hasModifiedBorderTop, editor, tabContainer, tabActionBar);
  }
  doRedrawTabActive(isGroupActive, allowBorderTop, editor, tabContainer, tabActionBar) {
    const isActive = this.tabsModel.isActive(editor);
    const isSelected = this.tabsModel.isSelected(editor);
    tabContainer.classList.toggle("active", isActive);
    tabContainer.classList.toggle("selected", isSelected);
    tabContainer.classList.toggle("multi-selected", isSelected && this.groupView.selectedEditors.length > 1);
    tabContainer.setAttribute("aria-selected", isSelected ? "true" : "false");
    tabContainer.tabIndex = isActive ? 0 : -1;
    tabActionBar.setFocusable(isActive);
    if (isActive) {
      const activeTabBorderColorBottom = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER : TAB_UNFOCUSED_ACTIVE_BORDER);
      tabContainer.classList.toggle("tab-border-bottom", !!activeTabBorderColorBottom);
      tabContainer.style.setProperty("--tab-border-bottom-color", activeTabBorderColorBottom ?? "");
    }
    let tabBorderColorTop = null;
    if (allowBorderTop) {
      if (isActive) {
        tabBorderColorTop = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER_TOP : TAB_UNFOCUSED_ACTIVE_BORDER_TOP);
      }
      if (tabBorderColorTop === null && isSelected) {
        tabBorderColorTop = this.getColor(TAB_SELECTED_BORDER_TOP);
      }
    }
    tabContainer.classList.toggle("tab-border-top", !!tabBorderColorTop);
    tabContainer.style.setProperty("--tab-border-top-color", tabBorderColorTop ?? "");
  }
  doRedrawTabDirty(isGroupActive, isTabActive, editor, tabContainer) {
    let hasModifiedBorderColor = false;
    if (editor.isDirty() && !editor.isSaving()) {
      tabContainer.classList.add("dirty");
      if (this.groupsView.partOptions.highlightModifiedTabs) {
        let modifiedBorderColor;
        if (isGroupActive && isTabActive) {
          modifiedBorderColor = this.getColor(TAB_ACTIVE_MODIFIED_BORDER);
        } else if (isGroupActive && !isTabActive) {
          modifiedBorderColor = this.getColor(TAB_INACTIVE_MODIFIED_BORDER);
        } else if (!isGroupActive && isTabActive) {
          modifiedBorderColor = this.getColor(TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER);
        } else {
          modifiedBorderColor = this.getColor(TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER);
        }
        if (modifiedBorderColor) {
          hasModifiedBorderColor = true;
          tabContainer.classList.add("dirty-border-top");
          tabContainer.style.setProperty("--tab-dirty-border-top-color", modifiedBorderColor);
        }
      } else {
        tabContainer.classList.remove("dirty-border-top");
        tabContainer.style.removeProperty("--tab-dirty-border-top-color");
      }
    } else {
      tabContainer.classList.remove("dirty", "dirty-border-top");
      tabContainer.style.removeProperty("--tab-dirty-border-top-color");
    }
    return hasModifiedBorderColor;
  }
  redrawTabBorders(tabIndex, tabContainer) {
    const isTabSticky = this.tabsModel.isSticky(tabIndex);
    const isTabLastSticky = isTabSticky && this.tabsModel.stickyCount === tabIndex + 1;
    const showLastStickyTabBorderColor = this.tabsModel.stickyCount !== this.tabsModel.count;
    const borderRightColor = (isTabLastSticky && showLastStickyTabBorderColor ? this.getColor(TAB_LAST_PINNED_BORDER) : void 0) || this.getColor(TAB_BORDER) || this.getColor(contrastBorder);
    tabContainer.style.borderRight = borderRightColor ? `1px solid ${borderRightColor}` : "";
    tabContainer.style.outlineColor = this.getColor(activeContrastBorder) || "";
  }
  prepareEditorActions(editorActions) {
    const isGroupActive = this.groupsView.activeGroup === this.groupView;
    if (isGroupActive) {
      return editorActions;
    } else {
      return {
        primary: this.groupsView.partOptions.alwaysShowEditorActions ? editorActions.primary : editorActions.primary.filter((action) => action.id === UNLOCK_GROUP_COMMAND_ID),
        secondary: editorActions.secondary
      };
    }
  }
  prepareEditorLayoutActions(editorActions) {
    return editorActions;
  }
  getHeight() {
    if (this.dimensions.used) {
      return this.dimensions.used.height;
    } else {
      return this.computeHeight();
    }
  }
  computeHeight() {
    let height;
    if (!this.visible) {
      height = 0;
    } else if (this.groupsView.partOptions.wrapTabs && this.tabsAndActionsContainer?.classList.contains("wrapping")) {
      height = this.tabsAndActionsContainer.offsetHeight;
    } else {
      height = this.tabHeight;
    }
    return height;
  }
  layout(dimensions, options) {
    Object.assign(this.dimensions, dimensions);
    if (this.visible) {
      if (!this.layoutScheduler.value) {
        const disposable = scheduleAtNextAnimationFrame(getWindow(this.parent), () => {
          this.doLayout(
            this.dimensions,
            this.layoutScheduler.value?.options
            /* ensure to pick up latest options */
          );
          this.layoutScheduler.clear();
        });
        this.layoutScheduler.value = { options, dispose: () => disposable.dispose() };
      }
      if (options?.forceRevealActiveTab) {
        this.layoutScheduler.value.options = {
          ...this.layoutScheduler.value.options,
          forceRevealActiveTab: true
        };
      }
    }
    if (!this.dimensions.used) {
      this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight());
    }
    return this.dimensions.used;
  }
  doLayout(dimensions, options) {
    if (dimensions.container !== Dimension.None && dimensions.available !== Dimension.None) {
      this.doLayoutTabs(dimensions, options);
    }
    const oldDimension = this.dimensions.used;
    const newDimension = this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight());
    if (oldDimension && oldDimension.height !== newDimension.height) {
      this.groupView.relayout();
    }
  }
  doLayoutTabs(dimensions, options) {
    const tabsWrapMultiLine = this.doLayoutTabsWrapping(dimensions);
    if (!tabsWrapMultiLine) {
      this.doLayoutTabsNonWrapping(options);
    } else {
      assertReturnsDefined(this.stickyTabsBackground).style.width = "0px";
    }
  }
  doLayoutTabsWrapping(dimensions) {
    const [tabsAndActionsContainer, tabsContainer, editorToolbarContainer, tabsScrollbar] = assertReturnsAllDefined(this.tabsAndActionsContainer, this.tabsContainer, this.editorActionsToolbarContainer, this.tabsScrollbar);
    const layoutActionsContainer = this.editorLayoutActionsToolbarContainer;
    const editorToolbarWidth = () => editorToolbarContainer.offsetWidth + (layoutActionsContainer?.offsetWidth ?? 0);
    const didTabsWrapMultiLine = tabsAndActionsContainer.classList.contains("wrapping");
    let tabsWrapMultiLine = didTabsWrapMultiLine;
    function updateTabsWrapping(enabled) {
      tabsWrapMultiLine = enabled;
      tabsAndActionsContainer.classList.toggle("wrapping", tabsWrapMultiLine);
      tabsContainer.style.setProperty("--last-tab-margin-right", tabsWrapMultiLine ? `${editorToolbarWidth()}px` : "0");
      tabsAndActionsContainer.style.setProperty("--last-tab-layout-actions-width", `${layoutActionsContainer?.offsetWidth ?? 0}px`);
      for (const tab of tabsContainer.children) {
        tab.classList.remove("last-in-row");
      }
    }
    if (this.groupsView.partOptions.wrapTabs) {
      const visibleTabsWidth = tabsContainer.offsetWidth;
      const allTabsWidth = tabsContainer.scrollWidth;
      const lastTabFitsWrapped = () => {
        const lastTab = this.getLastTab();
        if (!lastTab) {
          return true;
        }
        const lastTabOverlapWithToolbarWidth = lastTab.offsetWidth + editorToolbarWidth() - dimensions.available.width;
        if (lastTabOverlapWithToolbarWidth > 1) {
          return false;
        }
        return true;
      };
      if (tabsWrapMultiLine || allTabsWidth > visibleTabsWidth && lastTabFitsWrapped()) {
        updateTabsWrapping(true);
      }
      if (tabsWrapMultiLine) {
        if (tabsContainer.offsetHeight > dimensions.available.height || // if height exceeds available height
        allTabsWidth === visibleTabsWidth && tabsContainer.offsetHeight === this.tabHeight || // if wrapping is not needed anymore
        !lastTabFitsWrapped()) {
          updateTabsWrapping(false);
        }
      }
    } else if (didTabsWrapMultiLine) {
      updateTabsWrapping(false);
    }
    if (tabsWrapMultiLine && !didTabsWrapMultiLine) {
      const visibleTabsWidth = tabsContainer.offsetWidth;
      tabsScrollbar.setScrollDimensions({
        width: visibleTabsWidth,
        scrollWidth: visibleTabsWidth
      });
    }
    if (tabsWrapMultiLine) {
      const tabs = /* @__PURE__ */ new Map();
      let currentTabsPosY = void 0;
      let lastTab = void 0;
      for (const child of tabsContainer.children) {
        if (child === this.addTabContainer) {
          continue;
        }
        const tab = child;
        const tabPosY = tab.offsetTop;
        if (tabPosY !== currentTabsPosY) {
          currentTabsPosY = tabPosY;
          if (lastTab) {
            tabs.set(lastTab, true);
          }
        }
        lastTab = tab;
        tabs.set(tab, false);
      }
      if (lastTab) {
        tabs.set(lastTab, true);
      }
      for (const [tab, lastInRow] of tabs) {
        tab.classList.toggle("last-in-row", lastInRow);
      }
    }
    return tabsWrapMultiLine;
  }
  doLayoutTabsNonWrapping(options) {
    const [tabsContainer, tabsScrollbar] = assertReturnsAllDefined(this.tabsContainer, this.tabsScrollbar);
    const visibleTabsWidth = tabsContainer.offsetWidth;
    const allTabsWidth = tabsContainer.scrollWidth;
    let stickyTabsWidth = 0;
    if (this.tabsModel.stickyCount > 0) {
      const stickyTabWidth = this.getStickyTabWidth(this.groupsView.partOptions.pinnedTabSizing);
      stickyTabsWidth = this.tabsModel.stickyCount * stickyTabWidth;
      for (let tabIndex = 0; tabIndex < this.tabsModel.stickyCount; tabIndex++) {
        const tab = this.getTabAtIndex(tabIndex);
        if (tab) {
          tab.style.left = `${tabIndex * stickyTabWidth}px`;
        }
      }
    }
    const activeTabAndIndex = this.tabsModel.activeEditor ? this.getTabAndIndex(this.tabsModel.activeEditor) : void 0;
    const [activeTab, activeTabIndex] = activeTabAndIndex ?? [void 0, void 0];
    let activeTabPositionStatic = this.groupsView.partOptions.pinnedTabSizing !== "normal" && typeof activeTabIndex === "number" && this.tabsModel.isSticky(activeTabIndex);
    let availableTabsContainerWidth = visibleTabsWidth - stickyTabsWidth;
    if (this.tabsModel.stickyCount > 0 && availableTabsContainerWidth < MultiEditorTabsControl.TAB_WIDTH.fit) {
      tabsContainer.classList.add("disable-sticky-tabs");
      availableTabsContainerWidth = visibleTabsWidth;
      stickyTabsWidth = 0;
      activeTabPositionStatic = false;
    } else {
      tabsContainer.classList.remove("disable-sticky-tabs");
    }
    assertReturnsDefined(this.stickyTabsBackground).style.width = `${stickyTabsWidth}px`;
    let activeTabPosX;
    let activeTabWidth;
    if (!this.blockRevealActiveTab && activeTab) {
      activeTabPosX = activeTab.offsetLeft;
      activeTabWidth = activeTab.offsetWidth;
    }
    const { width: oldVisibleTabsWidth, scrollWidth: oldAllTabsWidth } = tabsScrollbar.getScrollDimensions();
    tabsScrollbar.setScrollDimensions({
      width: visibleTabsWidth,
      scrollWidth: allTabsWidth
    });
    const dimensionsChanged = oldVisibleTabsWidth !== visibleTabsWidth || oldAllTabsWidth !== allTabsWidth;
    if (this.blockRevealActiveTab || // explicitly disabled
    typeof activeTabPosX !== "number" || // invalid dimension
    typeof activeTabWidth !== "number" || // invalid dimension
    activeTabPositionStatic || // static tab (sticky)
    !dimensionsChanged && !options?.forceRevealActiveTab) {
      this.blockRevealActiveTab = false;
      return;
    }
    const tabsContainerScrollPosX = tabsScrollbar.getScrollPosition().scrollLeft;
    const activeTabFits = activeTabWidth <= availableTabsContainerWidth;
    const adjustedActiveTabPosX = activeTabPosX - stickyTabsWidth;
    if (activeTabFits && tabsContainerScrollPosX + availableTabsContainerWidth < adjustedActiveTabPosX + activeTabWidth) {
      tabsScrollbar.setScrollPosition({
        scrollLeft: tabsContainerScrollPosX + (adjustedActiveTabPosX + activeTabWidth - (tabsContainerScrollPosX + availableTabsContainerWidth))
      });
    } else if (tabsContainerScrollPosX > adjustedActiveTabPosX || !activeTabFits) {
      tabsScrollbar.setScrollPosition({
        scrollLeft: adjustedActiveTabPosX
      });
    }
  }
  getStickyTabWidth(pinnedTabSizing) {
    const hasModernUITabs = Boolean(this.parent.closest(".modern-ui-tabs"));
    switch (pinnedTabSizing) {
      case "compact":
        return hasModernUITabs ? MultiEditorTabsControl.MODERN_UI_COMPACT_PINNED_TAB_WIDTH : MultiEditorTabsControl.TAB_WIDTH.compact;
      case "shrink":
        return MultiEditorTabsControl.TAB_WIDTH.shrink;
      default:
        return 0;
    }
  }
  updateTabsControlVisibility() {
    const tabsAndActionsContainer = assertReturnsDefined(this.tabsAndActionsContainer);
    tabsAndActionsContainer.classList.toggle("empty", !this.visible);
    if (!this.visible && this.dimensions) {
      this.dimensions.used = void 0;
    }
  }
  get visible() {
    return this.tabsModel.count > 0;
  }
  getTabAndIndex(editor) {
    const tabIndex = this.tabsModel.indexOf(editor);
    const tab = this.getTabAtIndex(tabIndex);
    if (tab) {
      return [tab, tabIndex];
    }
    return void 0;
  }
  getTabAtIndex(tabIndex) {
    if (tabIndex >= 0) {
      const tabsContainer = assertReturnsDefined(this.tabsContainer);
      return tabsContainer.children[tabIndex];
    }
    return void 0;
  }
  getLastTab() {
    return this.getTabAtIndex(this.tabsModel.count - 1);
  }
  blockRevealActiveTabOnce() {
    this.blockRevealActiveTab = true;
  }
  originatesFromTabActionBar(e) {
    let element;
    if (isMouseEvent(e)) {
      element = e.target || e.srcElement;
    } else {
      element = e.initialTarget;
    }
    return !!findParentWithClass(element, "action-item", "tab");
  }
  async onDrop(e, targetTabIndex, tabsContainer) {
    EventHelper.stop(e, true);
    this.updateDropFeedback(tabsContainer, false, e, targetTabIndex);
    tabsContainer.classList.remove("scroll");
    let targetEditorIndex = this.tabsModel instanceof UnstickyEditorGroupModel ? targetTabIndex + this.groupView.stickyCount : targetTabIndex;
    const options = {
      sticky: this.tabsModel instanceof StickyEditorGroupModel && this.tabsModel.stickyCount === targetEditorIndex,
      index: targetEditorIndex
    };
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const sourceGroup = this.editorPartsView.getGroup(data[0].identifier);
        if (sourceGroup) {
          const mergeGroupOptions = { index: targetEditorIndex };
          if (!this.isMoveOperation(e, sourceGroup.id)) {
            mergeGroupOptions.mode = MergeGroupMode.COPY_EDITORS;
          }
          this.groupsView.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
        }
        this.groupView.focus();
        this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
      }
    } else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const sourceGroup = this.editorPartsView.getGroup(data[0].identifier.groupId);
        if (sourceGroup) {
          for (const de of data) {
            const editor = de.identifier.editor;
            if (sourceGroup.id !== de.identifier.groupId) {
              continue;
            }
            const sourceEditorIndex = sourceGroup.getIndexOfEditor(editor);
            if (sourceGroup === this.groupView && sourceEditorIndex < targetEditorIndex) {
              targetEditorIndex--;
            }
            if (this.isMoveOperation(e, de.identifier.groupId, editor)) {
              sourceGroup.moveEditor(editor, this.groupView, { ...options, index: targetEditorIndex });
              if (this.tabsModel instanceof UnstickyEditorGroupModel && this.groupView.isSticky(editor)) {
                this.groupView.unstickEditor(editor);
              }
            } else {
              sourceGroup.copyEditor(editor, this.groupView, { ...options, index: targetEditorIndex });
            }
            targetEditorIndex++;
          }
        }
      }
      this.groupView.focus();
      this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
    } else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
      const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const editors = [];
        for (const id of data) {
          const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
          if (dataTransferItem) {
            const treeDropData = await extractTreeDropData(dataTransferItem);
            editors.push(...treeDropData.map((editor) => ({ ...editor, options: { ...editor.options, pinned: true, index: targetEditorIndex } })));
          }
        }
        this.editorService.openEditors(editors, this.groupView, { validateTrust: true });
      }
      this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
    } else {
      const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
      dropHandler.handleDrop(e, getWindow(this.parent), () => this.groupView, () => this.groupView.focus(), options);
    }
  }
  dispose() {
    super.dispose();
    this.tabDisposables = dispose(this.tabDisposables);
  }
};
MultiEditorTabsControl.SCROLLBAR_SIZES = {
  default: 3,
  large: 10
};
MultiEditorTabsControl.TAB_WIDTH = {
  compact: 38,
  shrink: 80,
  fit: 120
};
MultiEditorTabsControl.MODERN_UI_COMPACT_PINNED_TAB_WIDTH = 28;
MultiEditorTabsControl.DRAG_OVER_OPEN_TAB_THRESHOLD = 1500;
MultiEditorTabsControl.MOUSE_WHEEL_EVENT_THRESHOLD = 150;
MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD = 1.5;
MultiEditorTabsControl = __decorateClass([
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IQuickInputService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IEditorService),
  __decorateParam(15, IPathService),
  __decorateParam(16, ITreeViewsDnDService),
  __decorateParam(17, IEditorResolverService),
  __decorateParam(18, IHostService),
  __decorateParam(19, IMenuService)
], MultiEditorTabsControl);
registerThemingParticipant((theme, collector) => {
  const borderColor = theme.getColor(TAB_BORDER);
  if (borderColor) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title > .tabs-and-actions-container.wrapping .tabs-container > .tab {
				border-bottom: 1px solid ${borderColor};
			}
		`);
  }
  const activeContrastBorderColor = theme.getColor(activeContrastBorder);
  if (activeContrastBorderColor) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active,
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active:hover  {
				outline: 1px solid;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.selected:not(.active):not(:hover)  {
				outline: 1px dotted;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active:focus {
				outline-style: dashed;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover  {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active:hover > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.dirty > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.sticky > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover > .tab-actions .action-label {
				opacity: 1 !important;
			}
		`);
  }
  const contrastBorderColor = theme.getColor(contrastBorder);
  if (contrastBorderColor) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .editor-actions {
				outline: 1px solid ${contrastBorderColor}
			}
		`);
  }
  const tabHoverBackground = theme.getColor(TAB_HOVER_BACKGROUND);
  if (tabHoverBackground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:not(.selected):hover {
				background-color: ${tabHoverBackground} !important;
			}
		`);
  }
  const tabUnfocusedHoverBackground = theme.getColor(TAB_UNFOCUSED_HOVER_BACKGROUND);
  if (tabUnfocusedHoverBackground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:not(.selected):hover  {
				background-color: ${tabUnfocusedHoverBackground} !important;
			}
		`);
  }
  const tabHoverForeground = theme.getColor(TAB_HOVER_FOREGROUND);
  if (tabHoverForeground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:not(.selected):hover  {
				color: ${tabHoverForeground} !important;
			}
		`);
  }
  const tabUnfocusedHoverForeground = theme.getColor(TAB_UNFOCUSED_HOVER_FOREGROUND);
  if (tabUnfocusedHoverForeground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:not(.selected):hover  {
				color: ${tabUnfocusedHoverForeground} !important;
			}
		`);
  }
  const tabHoverBorder = theme.getColor(TAB_HOVER_BORDER);
  if (tabHoverBorder) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:hover > .tab-border-bottom-container {
				display: block;
				position: absolute;
				left: 0;
				pointer-events: none;
				width: 100%;
				z-index: 10;
				bottom: 0;
				height: 1px;
				background-color: ${tabHoverBorder};
			}
		`);
  }
  const tabUnfocusedHoverBorder = theme.getColor(TAB_UNFOCUSED_HOVER_BORDER);
  if (tabUnfocusedHoverBorder) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover > .tab-border-bottom-container  {
				display: block;
				position: absolute;
				left: 0;
				pointer-events: none;
				width: 100%;
				z-index: 10;
				bottom: 0;
				height: 1px;
				background-color: ${tabUnfocusedHoverBorder};
			}
		`);
  }
  if (!isHighContrast(theme.type) && !isSafari && !activeContrastBorderColor) {
    const workbenchBackground = WORKBENCH_BACKGROUND(theme);
    const editorBackgroundColor = theme.getColor(editorBackground);
    const editorGroupHeaderTabsBackground = theme.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
    const editorDragAndDropBackground = theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND);
    let adjustedTabBackground;
    if (editorGroupHeaderTabsBackground && editorBackgroundColor) {
      adjustedTabBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorBackgroundColor, workbenchBackground);
    }
    let adjustedTabDragBackground;
    if (editorGroupHeaderTabsBackground && editorBackgroundColor && editorDragAndDropBackground && editorBackgroundColor) {
      adjustedTabDragBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorDragAndDropBackground, editorBackgroundColor, workbenchBackground);
    }
    const makeTabHoverBackgroundRule = (color, colorDrag, hasFocus = false) => `
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-shrink:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after,
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-fixed:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after {
				background: linear-gradient(to left, ${color}, transparent) !important;
			}

			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-shrink:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after,
			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-fixed:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after {
				background: linear-gradient(to left, ${colorDrag}, transparent) !important;
			}
		`;
    if (tabHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabHoverBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabHoverBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag, true));
    }
    if (tabUnfocusedHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabUnfocusedHoverBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabUnfocusedHoverBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag));
    }
    if (editorDragAndDropBackground && adjustedTabDragBackground) {
      const adjustedColorDrag = editorDragAndDropBackground.flatten(adjustedTabDragBackground);
      collector.addRule(`
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container > .tab.sizing-shrink.dragged-over:not(.active):not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container > .tab.sizing-shrink.dragged-over:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container > .tab.sizing-fixed.dragged-over:not(.active):not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container > .tab.sizing-fixed.dragged-over:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${adjustedColorDrag}, transparent) !important;
				}
		`);
    }
    const makeTabBackgroundRule = (color, colorDrag, focused, active) => `
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-shrink${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-fixed${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${color}, transparent);
				}

				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-shrink${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-fixed${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${colorDrag}, transparent);
				}
		`;
    const tabActiveBackground = theme.getColor(TAB_ACTIVE_BACKGROUND);
    if (tabActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabActiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabActiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, true, true));
    }
    const tabUnfocusedActiveBackground = theme.getColor(TAB_UNFOCUSED_ACTIVE_BACKGROUND);
    if (tabUnfocusedActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabUnfocusedActiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabUnfocusedActiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, false, true));
    }
    const tabInactiveBackground = theme.getColor(TAB_INACTIVE_BACKGROUND);
    if (tabInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabInactiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabInactiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, true, false));
    }
    const tabUnfocusedInactiveBackground = theme.getColor(TAB_UNFOCUSED_INACTIVE_BACKGROUND);
    if (tabUnfocusedInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabUnfocusedInactiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabUnfocusedInactiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, false, false));
    }
  }
});
export {
  MultiEditorTabsControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXG11bHRpRWRpdG9yVGFic0NvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbXVsdGllZGl0b3J0YWJzY29udHJvbC5jc3MnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHNob3J0ZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgVmVyYm9zaXR5LCBJRWRpdG9yUGFydE9wdGlvbnMsIFNpZGVCeVNpZGVFZGl0b3IsIERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSVVudHlwZWRFZGl0b3JJbnB1dCwgcHJldmVudEVkaXRvckNsb3NlLCBFZGl0b3JDbG9zZU1ldGhvZCwgRWRpdG9yc09yZGVyLCBJVG9vbGJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBjb21wdXRlRWRpdG9yQXJpYUxhYmVsIH0gZnJvbSAnLi4vLi4vZWRpdG9yLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSwgR2VzdHVyZUV2ZW50LCBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscywgSVJlc291cmNlTGFiZWwsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiB9IGZyb20gJy4uLy4uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29tbWFuZHNDb250ZXh0QWN0aW9uUnVubmVyLCBFZGl0b3JUYWJzQ29udHJvbCB9IGZyb20gJy4vZWRpdG9yVGFic0NvbnRyb2wuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZVN0b3JlLCBjb21iaW5lZERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IGdldE9yU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUQUJfSU5BQ1RJVkVfQkFDS0dST1VORCwgVEFCX0FDVElWRV9CQUNLR1JPVU5ELCBUQUJfQk9SREVSLCBFRElUT1JfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5ELCBUQUJfVU5GT0NVU0VEX0FDVElWRV9CQUNLR1JPVU5ELCBUQUJfVU5GT0NVU0VEX0FDVElWRV9CT1JERVIsIFRBQl9BQ1RJVkVfQk9SREVSLCBUQUJfSE9WRVJfQkFDS0dST1VORCwgVEFCX0hPVkVSX0JPUkRFUiwgVEFCX1VORk9DVVNFRF9IT1ZFUl9CQUNLR1JPVU5ELCBUQUJfVU5GT0NVU0VEX0hPVkVSX0JPUkRFUiwgRURJVE9SX0dST1VQX0hFQURFUl9UQUJTX0JBQ0tHUk9VTkQsIFdPUktCRU5DSF9CQUNLR1JPVU5ELCBUQUJfQUNUSVZFX0JPUkRFUl9UT1AsIFRBQl9VTkZPQ1VTRURfQUNUSVZFX0JPUkRFUl9UT1AsIFRBQl9BQ1RJVkVfTU9ESUZJRURfQk9SREVSLCBUQUJfSU5BQ1RJVkVfTU9ESUZJRURfQk9SREVSLCBUQUJfVU5GT0NVU0VEX0FDVElWRV9NT0RJRklFRF9CT1JERVIsIFRBQl9VTkZPQ1VTRURfSU5BQ1RJVkVfTU9ESUZJRURfQk9SREVSLCBUQUJfVU5GT0NVU0VEX0lOQUNUSVZFX0JBQ0tHUk9VTkQsIFRBQl9IT1ZFUl9GT1JFR1JPVU5ELCBUQUJfVU5GT0NVU0VEX0hPVkVSX0ZPUkVHUk9VTkQsIEVESVRPUl9HUk9VUF9IRUFERVJfVEFCU19CT1JERVIsIFRBQl9MQVNUX1BJTk5FRF9CT1JERVIsIFRBQl9TRUxFQ1RFRF9CT1JERVJfVE9QIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCBjb250cmFzdEJvcmRlciwgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlc291cmNlc0Ryb3BIYW5kbGVyLCBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllciwgRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllciwgZXh0cmFjdFRyZWVEcm9wRGF0YSwgaXNXaW5kb3dEcmFnZ2VkT3ZlciB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTWVyZ2VHcm91cE1vZGUsIElNZXJnZUdyb3VwT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgRXZlbnRIZWxwZXIsIERpbWVuc2lvbiwgc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSwgZmluZFBhcmVudFdpdGhDbGFzcywgY2xlYXJOb2RlLCBEcmFnQW5kRHJvcE9ic2VydmVyLCBpc01vdXNlRXZlbnQsIGdldFdpbmRvdywgTW9kaWZpZXJLZXlFbWl0dGVyLCAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBNZW51SWRzLCBJRWRpdG9yR3JvdXBzVmlldywgRWRpdG9yU2VydmljZUltcGwsIElFZGl0b3JHcm91cFZpZXcsIElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zLCBJRWRpdG9yUGFydHNWaWV3LCBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2xvc2VFZGl0b3JUYWJBY3Rpb24sIENsb3NlT3RoZXJFZGl0b3JUYWJzSW5Hcm91cEFjdGlvbiwgVW5waW5FZGl0b3JBY3Rpb24gfSBmcm9tICcuL2VkaXRvckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQsIGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWVPckF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGgsIHdpbjMyLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgY29hbGVzY2UsIGluc2VydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBpc1NhZmFyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aXZhdGlvbiwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCB9IGZyb20gJy4vZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSVRyZWVWaWV3c0RuRFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclRpdGxlQ29udHJvbERpbWVuc2lvbnMgfSBmcm9tICcuL2VkaXRvclRpdGxlQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBTdGlja3lFZGl0b3JHcm91cE1vZGVsLCBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2ZpbHRlcmVkRWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmVhZG9ubHlFZGl0b3JHcm91cE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kbmQvZG5kLmpzJztcblxuY29uc3QgbW9kaWZpZXJLZXlFbWl0dGVyID0gTW9kaWZpZXJLZXlFbWl0dGVyLmdldEluc3RhbmNlKCk7XG5cbmludGVyZmFjZSBJRWRpdG9ySW5wdXRMYWJlbCB7XG5cdHJlYWRvbmx5IGVkaXRvcjogRWRpdG9ySW5wdXQ7XG5cblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZvcmNlRGVzY3JpcHRpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcblx0cmVhZG9ubHkgYXJpYUxhYmVsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSU11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXRPcHRpb25zIHtcblxuXHQvKipcblx0ICogV2hldGhlciB0byBmb3JjZSByZXZlYWxpbmcgdGhlIGFjdGl2ZSB0YWIsIGV2ZW4gd2hlblxuXHQgKiB0aGUgZGltZW5zaW9ucyBoYXZlIG5vdCBjaGFuZ2VkLiBUaGlzIGNhbiBiZSB0aGUgY2FzZVxuXHQgKiB3aGVuIGEgdGFiIHdhcyBtYWRlIGFjdGl2ZSBhbmQgbmVlZHMgdG8gYmUgcmV2ZWFsZWQuXG5cdCAqL1xuXHRyZWFkb25seSBmb3JjZVJldmVhbEFjdGl2ZVRhYj86IHRydWU7XG59XG5cbmludGVyZmFjZSBJU2NoZWR1bGVkTXVsdGlFZGl0b3JUYWJzQ29udHJvbExheW91dCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQXNzb2NpYXRlZCBvcHRpb25zIHdpdGggdGhlIGxheW91dCBjYWxsLlxuXHQgKi9cblx0b3B0aW9ucz86IElNdWx0aUVkaXRvclRhYnNDb250cm9sTGF5b3V0T3B0aW9ucztcbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpRWRpdG9yVGFic0NvbnRyb2wgZXh0ZW5kcyBFZGl0b3JUYWJzQ29udHJvbCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0NST0xMQkFSX1NJWkVTID0ge1xuXHRcdGRlZmF1bHQ6IDMgYXMgY29uc3QsXG5cdFx0bGFyZ2U6IDEwIGFzIGNvbnN0XG5cdH07XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEFCX1dJRFRIID0ge1xuXHRcdGNvbXBhY3Q6IDM4IGFzIGNvbnN0LFxuXHRcdHNocmluazogODAgYXMgY29uc3QsXG5cdFx0Zml0OiAxMjAgYXMgY29uc3Rcblx0fTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTU9ERVJOX1VJX0NPTVBBQ1RfUElOTkVEX1RBQl9XSURUSCA9IDI4IGFzIGNvbnN0O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERSQUdfT1ZFUl9PUEVOX1RBQl9USFJFU0hPTEQgPSAxNTAwO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1PVVNFX1dIRUVMX0VWRU5UX1RIUkVTSE9MRCA9IDE1MDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTU9VU0VfV0hFRUxfRElTVEFOQ0VfVEhSRVNIT0xEID0gMS41O1xuXG5cdHByaXZhdGUgdGl0bGVDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRhYnNBbmRBY3Rpb25zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGlja3lUYWJzQmFja2dyb3VuZDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGFic0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGFic1Njcm9sbGJhcjogU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWRkVGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0YWJTaXppbmdGaXhlZERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbG9zZUVkaXRvckFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xvc2VFZGl0b3JUYWJBY3Rpb24sIENsb3NlRWRpdG9yVGFiQWN0aW9uLklELCBDbG9zZUVkaXRvclRhYkFjdGlvbi5MQUJFTCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVucGluRWRpdG9yQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnBpbkVkaXRvckFjdGlvbiwgVW5waW5FZGl0b3JBY3Rpb24uSUQsIFVucGluRWRpdG9yQWN0aW9uLkxBQkVMKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2xvc2VPdGhlckVkaXRvclRhYnNJbkdyb3VwQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbG9zZU90aGVyRWRpdG9yVGFic0luR3JvdXBBY3Rpb24sIENsb3NlT3RoZXJFZGl0b3JUYWJzSW5Hcm91cEFjdGlvbi5JRCwgQ2xvc2VPdGhlckVkaXRvclRhYnNJbkdyb3VwQWN0aW9uLkxBQkVMKSk7XG5cblx0Ly8gQWx0LWhvbGQgYWx0ZXJuYXRpdmUgdG8gYSB0YWIncyBjbG9zZSBhY3Rpb24gKEpldEJyYWlucy1zdHlsZSk7IHNlZSB1cGRhdGVUYWJBY3Rpb25zRm9yQWx0U3RhdGUoKS5cblx0cHJpdmF0ZSB3YW50c0Nsb3NlT3RoZXJzQWN0aW9uOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGFiUmVzb3VyY2VMYWJlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpKTtcblx0cHJpdmF0ZSB0YWJMYWJlbHM6IElFZGl0b3JJbnB1dExhYmVsW10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVUYWJMYWJlbDogSUVkaXRvcklucHV0TGFiZWwgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB0YWJBY3Rpb25CYXJzOiBBY3Rpb25CYXJbXSA9IFtdO1xuXHRwcml2YXRlIHRhYkRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0cHJpdmF0ZSBkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucyAmIHsgdXNlZD86IERpbWVuc2lvbiB9ID0ge1xuXHRcdGNvbnRhaW5lcjogRGltZW5zaW9uLk5vbmUsXG5cdFx0YXZhaWxhYmxlOiBEaW1lbnNpb24uTm9uZVxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTY2hlZHVsZWRNdWx0aUVkaXRvclRhYnNDb250cm9sTGF5b3V0PigpKTtcblx0cHJpdmF0ZSBibG9ja1JldmVhbEFjdGl2ZVRhYjogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHBhdGg6IElQYXRoID0gaXNXaW5kb3dzID8gd2luMzIgOiBwb3NpeDtcblxuXHRwcml2YXRlIGxhc3RNb3VzZVdoZWVsRXZlbnRUaW1lID0gMDtcblx0cHJpdmF0ZSBpc01vdXNlT3ZlclRhYnMgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRncm91cHNWaWV3OiBJRWRpdG9yR3JvdXBzVmlldyxcblx0XHRncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXcsXG5cdFx0dGFic01vZGVsOiBJUmVhZG9ubHlFZGl0b3JHcm91cE1vZGVsLFxuXHRcdG1lbnVJZHM6IElFZGl0b3JHcm91cE1lbnVJZHMgfCB1bmRlZmluZWQsXG5cdFx0YnJlYWRjcnVtYnNJbkhlYWRlcjogYm9vbGVhbixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogRWRpdG9yU2VydmljZUltcGwsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElUcmVlVmlld3NEbkRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlOiBJVHJlZVZpZXdzRG5EU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocGFyZW50LCBlZGl0b3JQYXJ0c1ZpZXcsIGdyb3Vwc1ZpZXcsIGdyb3VwVmlldywgdGFic01vZGVsLCBtZW51SWRzLCBicmVhZGNydW1ic0luSGVhZGVyLCBjb250ZXh0TWVudVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGVkaXRvclJlc29sdmVyU2VydmljZSwgaG9zdFNlcnZpY2UsIG1lbnVTZXJ2aWNlKTtcblxuXHRcdC8vIFJlc29sdmUgdGhlIGNvcnJlY3QgcGF0aCBsaWJyYXJ5IGZvciB0aGUgT1Mgd2UgYXJlIG9uXG5cdFx0Ly8gSWYgd2UgYXJlIGNvbm5lY3RlZCB0byByZW1vdGUsIHRoaXMgYWNjb3VudHMgZm9yIHRoZVxuXHRcdC8vIHJlbW90ZSBPUy5cblx0XHQoYXN5bmMgKCkgPT4gdGhpcy5wYXRoID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS5wYXRoKSgpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gZGVjb3JhdGlvbnMgY2hhbmdpbmcgZm9yIG91ciByZXNvdXJjZSBsYWJlbHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRhYlJlc291cmNlTGFiZWxzLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKCkgPT4gdGhpcy5kb0hhbmRsZURlY29yYXRpb25zQ2hhbmdlKCkpKTtcblxuXHRcdC8vIFJlYWN0IHRvIEFsdCBiZWluZyBoZWxkL3JlbGVhc2VkIHRvIHN3YXAgaW4gdGhlIFwiQ2xvc2UgT3RoZXJzXCIgdGFiIGFjdGlvbi4gSW5pdGlhbGl6ZVxuXHRcdC8vIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUgdG9vLCBpbiBjYXNlIHRoaXMgY29udHJvbCBpcyBjcmVhdGVkIG1pZC1ob2xkLlxuXHRcdHRoaXMud2FudHNDbG9zZU90aGVyc0FjdGlvbiA9IG1vZGlmaWVyS2V5RW1pdHRlci5rZXlTdGF0dXMuYWx0S2V5O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGlmaWVyS2V5RW1pdHRlci5ldmVudCgoKSA9PiB0aGlzLnVwZGF0ZVRhYkFjdGlvbnNGb3JBbHRTdGF0ZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRhYkFjdGlvbnNGb3JBbHRTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCB3YW50c0Nsb3NlT3RoZXJzQWN0aW9uID0gbW9kaWZpZXJLZXlFbWl0dGVyLmtleVN0YXR1cy5hbHRLZXk7XG5cdFx0aWYgKHdhbnRzQ2xvc2VPdGhlcnNBY3Rpb24gPT09IHRoaXMud2FudHNDbG9zZU90aGVyc0FjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMud2FudHNDbG9zZU90aGVyc0FjdGlvbiA9IHdhbnRzQ2xvc2VPdGhlcnNBY3Rpb247XG5cblx0XHQvLyBPbmx5IHRoZSBhY3Rpb24gaXRlbXMgbmVlZCB0byBjaGFuZ2UgaGVyZSwgbm90IGxhYmVscy9kZWNvcmF0aW9ucy90b29sYmFyL2xheW91dC5cblx0XHR0aGlzLmZvckVhY2hUYWIoKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiQWN0aW9uKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiQWN0aW9uQmFyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRzdXBlci5jcmVhdGUocGFyZW50KTtcblxuXHRcdHRoaXMudGl0bGVDb250YWluZXIgPSBwYXJlbnQ7XG5cblx0XHQvLyBUYWJzIGFuZCBBY3Rpb25zIENvbnRhaW5lciAoYXJlIG9uIGEgc2luZ2xlIHJvdyB3aXRoIGZsZXggc2lkZS1ieS1zaWRlKVxuXHRcdHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIgPSAkKCcudGFicy1hbmQtYWN0aW9ucy1jb250YWluZXInKTtcblx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIpO1xuXG5cdFx0dGhpcy5zdGlja3lUYWJzQmFja2dyb3VuZCA9ICQoJy5zdGlja3ktdGFicy1iYWNrZ3JvdW5kJywgeyAnYXJpYS1oaWRkZW4nOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVGFicyBDb250YWluZXJcblx0XHR0aGlzLnRhYnNDb250YWluZXIgPSAkKCcudGFicy1jb250YWluZXInLCB7XG5cdFx0XHRyb2xlOiAndGFibGlzdCcsXG5cdFx0XHQnYXJpYS1tdWx0aXNlbGVjdGFibGUnOiAndHJ1ZScsXG5cdFx0XHRkcmFnZ2FibGU6IHRydWVcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLnRhYnNDb250YWluZXIpKTtcblxuXHRcdHRoaXMudGFiU2l6aW5nRml4ZWREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy51cGRhdGVUYWJTaXppbmcoZmFsc2UpO1xuXG5cdFx0Ly8gVGFicyBTY3JvbGxiYXJcblx0XHR0aGlzLnRhYnNTY3JvbGxiYXIgPSB0aGlzLmNyZWF0ZVRhYnNTY3JvbGxiYXIodGhpcy50YWJzQ29udGFpbmVyKTtcblx0XHR0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGFic1Njcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMudGFic1Njcm9sbGJhci5nZXREb21Ob2RlKCkuYXBwZW5kQ2hpbGQodGhpcy5zdGlja3lUYWJzQmFja2dyb3VuZCk7XG5cblx0XHQvLyBUYWJzIENvbnRhaW5lciBsaXN0ZW5lcnNcblx0XHR0aGlzLnJlZ2lzdGVyVGFic0NvbnRhaW5lckxpc3RlbmVycyh0aGlzLnRhYnNDb250YWluZXIsIHRoaXMudGFic1Njcm9sbGJhcik7XG5cblx0XHQvLyBDcmVhdGUgYWRkIHRhYiBjb250cm9sIChvbmx5IHdoZW4gYSBtZW51IGlkIGlzIGNvbmZpZ3VyZWQsIGUuZy4gaW5cblx0XHQvLyB0aGUgc2luZ2xlLXBhbmUgQWdlbnRzIHdpbmRvdyBsYXlvdXQpLiBXaGVuIHVuc2V0LCBubyBhZGQtdGFiIGNvbnRyb2xcblx0XHQvLyBpcyBjcmVhdGVkIGFuZCB0aGUgbGFzdCB0YWIgcmVtYWlucyB0aGUgbGFzdCBjaGlsZCBvZiB0aGUgdGFic1xuXHRcdC8vIGNvbnRhaW5lciwgd2hpY2ggdGFiIGxheW91dCBsb2dpYyByZWxpZXMgb24gKHNlZSAjMzI0OTAyKS5cblx0XHRpZiAodGhpcy5tZW51SWRzPy50YWJzQmFyQWRkVGFiKSB7XG5cdFx0XHR0aGlzLmFkZFRhYkNvbnRhaW5lciA9IHRoaXMuY3JlYXRlQWRkVGFiQ29udHJvbCh0aGlzLnRhYnNDb250YWluZXIsIHRoaXMubWVudUlkcy50YWJzQmFyQWRkVGFiKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgRWRpdG9yIFRvb2xiYXJcblx0XHR0aGlzLmNyZWF0ZUVkaXRvckFjdGlvbnNUb29sQmFyKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIsIFsnZWRpdG9yLWFjdGlvbnMnXSwgISF0aGlzLm1lbnVJZHM/LnRhYnNCYXJBZGRUYWIpO1xuXG5cdFx0Ly8gU2V0IHRhYnMgY29udHJvbCB2aXNpYmlsaXR5XG5cdFx0dGhpcy51cGRhdGVUYWJzQ29udHJvbFZpc2liaWxpdHkoKTtcblxuXHRcdHJldHVybiB0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdGFiQ291bnQoKTogbnVtYmVyIHtcblx0XHRjb25zdCB0YWJzQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy50YWJzQ29udGFpbmVyKTtcblx0XHRyZXR1cm4gdGhpcy5hZGRUYWJDb250YWluZXIgPyB0YWJzQ29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCAtIDEgOiB0YWJzQ29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aDtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kVGFiKHRhYjogSFRNTEVsZW1lbnQsIHRhYnNDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWRkVGFiQ29udGFpbmVyKSB7XG5cdFx0XHR0YWJzQ29udGFpbmVyLmluc2VydEJlZm9yZSh0YWIsIHRoaXMuYWRkVGFiQ29udGFpbmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0YWIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlTGFzdFRhYih0YWJzQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFkZFRhYkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5hZGRUYWJDb250YWluZXIucHJldmlvdXNFbGVtZW50U2libGluZz8ucmVtb3ZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhYnNDb250YWluZXIubGFzdENoaWxkPy5yZW1vdmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhYnNTY3JvbGxiYXIoc2Nyb2xsYWJsZTogSFRNTEVsZW1lbnQpOiBTY3JvbGxhYmxlRWxlbWVudCB7XG5cdFx0Y29uc3QgdGFic1Njcm9sbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTY3JvbGxhYmxlRWxlbWVudChzY3JvbGxhYmxlLCB7XG5cdFx0XHRob3Jpem9udGFsOiB0aGlzLmdldFRhYnNTY3JvbGxiYXJWaXNpYmlsaXR5KCksXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogdGhpcy5nZXRUYWJzU2Nyb2xsYmFyU2l6aW5nKCksXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRzY3JvbGxZVG9YOiB0cnVlLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2Vcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0YWJzU2Nyb2xsYmFyLm9uU2Nyb2xsKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsTGVmdENoYW5nZWQpIHtcblx0XHRcdFx0c2Nyb2xsYWJsZS5zY3JvbGxMZWZ0ID0gZS5zY3JvbGxMZWZ0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB0YWJzU2Nyb2xsYmFyO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUYWJzU2Nyb2xsYmFyU2l6aW5nKCk6IHZvaWQge1xuXHRcdHRoaXMudGFic1Njcm9sbGJhcj8udXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogdGhpcy5nZXRUYWJzU2Nyb2xsYmFyU2l6aW5nKClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFic1Njcm9sbGJhclZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0dGhpcy50YWJzU2Nyb2xsYmFyPy51cGRhdGVPcHRpb25zKHtcblx0XHRcdGhvcml6b250YWw6IHRoaXMuZ2V0VGFic1Njcm9sbGJhclZpc2liaWxpdHkoKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUYWJTaXppbmcoZnJvbUV2ZW50OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgW3RhYnNDb250YWluZXIsIHRhYlNpemluZ0ZpeGVkRGlzcG9zYWJsZXNdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy50YWJzQ29udGFpbmVyLCB0aGlzLnRhYlNpemluZ0ZpeGVkRGlzcG9zYWJsZXMpO1xuXG5cdFx0dGFiU2l6aW5nRml4ZWREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucztcblx0XHRpZiAob3B0aW9ucy50YWJTaXppbmcgPT09ICdmaXhlZCcpIHtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1taW4td2lkdGgnLCBgJHtvcHRpb25zLnRhYlNpemluZ0ZpeGVkTWluV2lkdGh9cHhgKTtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1tYXgtd2lkdGgnLCBgJHtvcHRpb25zLnRhYlNpemluZ0ZpeGVkTWF4V2lkdGh9cHhgKTtcblxuXHRcdFx0Ly8gRm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MDI5MCB3ZSB3YW50IHRvXG5cdFx0XHQvLyBwcmVzZXJ2ZSB0aGUgY3VycmVudCB0YWIgd2lkdGhzIGFzIGxvbmcgYXMgdGhlIG1vdXNlIGlzIG92ZXIgdGhlXG5cdFx0XHQvLyB0YWJzIHNvIHRoYXQgeW91IGNhbiBxdWlja2x5IGNsb3NlIHRoZW0gdmlhIG1vdXNlIGNsaWNrLiBGb3IgdGhhdFxuXHRcdFx0Ly8gd2UgdHJhY2sgbW91c2UgbW92ZW1lbnRzIG92ZXIgdGhlIHRhYnMgY29udGFpbmVyLlxuXG5cdFx0XHR0YWJTaXppbmdGaXhlZERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaXNNb3VzZU92ZXJUYWJzID0gdHJ1ZTtcblx0XHRcdH0pKTtcblx0XHRcdHRhYlNpemluZ0ZpeGVkRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdFx0dGhpcy5pc01vdXNlT3ZlclRhYnMgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy51cGRhdGVUYWJzRml4ZWRXaWR0aChmYWxzZSk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1taW4td2lkdGgnKTtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1tYXgtd2lkdGgnKTtcblx0XHRcdHRoaXMudXBkYXRlVGFic0ZpeGVkV2lkdGgoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFic0ZpeGVkV2lkdGgoZml4ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmZvckVhY2hUYWIoKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lcikgPT4ge1xuXHRcdFx0aWYgKGZpeGVkKSB7XG5cdFx0XHRcdGNvbnN0IHsgd2lkdGggfSA9IHRhYkNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0dGFiQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRhYi1zaXppbmctY3VycmVudC13aWR0aCcsIGAke3dpZHRofXB4YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YWJDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLXNpemluZy1jdXJyZW50LXdpZHRoJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhYnNTY3JvbGxiYXJTaXppbmcoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRpdGxlU2Nyb2xsYmFyU2l6aW5nICE9PSAnbGFyZ2UnKSB7XG5cdFx0XHRyZXR1cm4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5TQ1JPTExCQVJfU0laRVMuZGVmYXVsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5TQ1JPTExCQVJfU0laRVMubGFyZ2U7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhYnNTY3JvbGxiYXJWaXNpYmlsaXR5KCk6IFNjcm9sbGJhclZpc2liaWxpdHkge1xuXHRcdHN3aXRjaCAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eSkge1xuXHRcdFx0Y2FzZSAndmlzaWJsZSc6IHJldHVybiBTY3JvbGxiYXJWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0XHRjYXNlICdoaWRkZW4nOiByZXR1cm4gU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUYWJzQ29udGFpbmVyTGlzdGVuZXJzKHRhYnNDb250YWluZXI6IEhUTUxFbGVtZW50LCB0YWJzU2Nyb2xsYmFyOiBTY3JvbGxhYmxlRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCBzY3JvbGxpbmcgaW5zaWRlIHRoZSBjb250YWluZXIgdG8gb3VyIGN1c3RvbSBzY3JvbGxiYXJcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgRXZlbnRUeXBlLlNDUk9MTCwgKCkgPT4ge1xuXHRcdFx0aWYgKHRhYnNDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdzY3JvbGwnKSkge1xuXHRcdFx0XHR0YWJzU2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHtcblx0XHRcdFx0XHRzY3JvbGxMZWZ0OiB0YWJzQ29udGFpbmVyLnNjcm9sbExlZnQgLy8gZHVyaW5nIERORCB0aGUgY29udGFpbmVyIGdldHMgc2Nyb2xsZWQgc28gd2UgbmVlZCB0byB1cGRhdGUgdGhlIGN1c3RvbSBzY3JvbGxiYXJcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTmV3IGZpbGUgd2hlbiBkb3VibGUtY2xpY2tpbmcgb24gdGFicyBjb250YWluZXIgKGJ1dCBub3QgdGFicylcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbVG91Y2hFdmVudFR5cGUuVGFwLCBFdmVudFR5cGUuREJMQ0xJQ0tdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgZXZlbnRUeXBlLCAoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnRUeXBlID09PSBFdmVudFR5cGUuREJMQ0xJQ0spIHtcblx0XHRcdFx0XHRpZiAoZS50YXJnZXQgIT09IHRhYnNDb250YWluZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gaWdub3JlIGlmIHRhcmdldCBpcyBub3QgdGFicyBjb250YWluZXJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCg8R2VzdHVyZUV2ZW50PmUpLnRhcENvdW50ICE9PSAyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBzaW5nbGUgdGFwc1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICgoPEdlc3R1cmVFdmVudD5lKS5pbml0aWFsVGFyZ2V0ICE9PSB0YWJzQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBpZiB0YXJnZXQgaXMgbm90IHRhYnMgY29udGFpbmVyXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRpbmRleDogdGhpcy5ncm91cFZpZXcuY291bnQsIC8vIGFsd2F5cyBhdCB0aGUgZW5kXG5cdFx0XHRcdFx0XHRvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHRoaXMuZ3JvdXBWaWV3LmlkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBQcmV2ZW50IGF1dG8tc2Nyb2xsaW5nIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTY2OTApXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYnNDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUHJldmVudCBhdXRvLXBhc3RpbmcgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDE2OTYpXG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfVVAsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gPT09IDEpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBEcmFnICYgRHJvcCBzdXBwb3J0XG5cdFx0bGV0IGxhc3REcmFnRXZlbnQ6IERyYWdFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaXNOZXdXaW5kb3dPcGVyYXRpb24gPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcih0YWJzQ29udGFpbmVyLCB7XG5cdFx0XHRvbkRyYWdTdGFydDogZSA9PiB7XG5cdFx0XHRcdGlzTmV3V2luZG93T3BlcmF0aW9uID0gdGhpcy5vbkdyb3VwRHJhZ1N0YXJ0KGUsIHRhYnNDb250YWluZXIpO1xuXHRcdFx0fSxcblxuXHRcdFx0b25EcmFnOiBlID0+IHtcblx0XHRcdFx0bGFzdERyYWdFdmVudCA9IGU7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdFbnRlcjogZSA9PiB7XG5cblx0XHRcdFx0Ly8gQWx3YXlzIGVuYWJsZSBzdXBwb3J0IHRvIHNjcm9sbCB3aGlsZSBkcmFnZ2luZ1xuXHRcdFx0XHR0YWJzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Njcm9sbCcpO1xuXG5cdFx0XHRcdC8vIFJldHVybiBpZiB0aGUgdGFyZ2V0IGlzIG5vdCBvbiB0aGUgdGFicyBjb250YWluZXJcblx0XHRcdFx0aWYgKGUudGFyZ2V0ICE9PSB0YWJzQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmV0dXJuIGlmIHRyYW5zZmVyIGlzIHVuc3VwcG9ydGVkXG5cdFx0XHRcdGlmICghdGhpcy5pc1N1cHBvcnRlZERyb3BUcmFuc2ZlcihlKSkge1xuXHRcdFx0XHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdub25lJztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGRyb3BFZmZlY3QgdG8gXCJjb3B5XCIgaWYgdGhlcmUgaXMgbm8gbG9jYWwgZGF0YSB0byBiZSBkcmFnZ2VkIGJlY2F1c2Vcblx0XHRcdFx0Ly8gaW4gdGhhdCBjYXNlIHdlIGNhbiBvbmx5IGNvcHkgdGhlIGRhdGEgaW50byBhbmQgbm90IG1vdmUgaXQgZnJvbSBpdHMgc291cmNlXG5cdFx0XHRcdGlmICghdGhpcy5lZGl0b3JUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdFx0XHRpZiAoZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRcdGUuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnY29weSc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2sodGFic0NvbnRhaW5lciwgdHJ1ZSwgZSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdMZWF2ZTogZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlKTtcblx0XHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uRHJhZ0VuZDogZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlKTtcblx0XHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblxuXHRcdFx0XHR0aGlzLm9uR3JvdXBEcmFnRW5kKGUsIGxhc3REcmFnRXZlbnQsIHRhYnNDb250YWluZXIsIGlzTmV3V2luZG93T3BlcmF0aW9uKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uRHJvcDogZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlKTtcblx0XHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblxuXHRcdFx0XHRpZiAoZS50YXJnZXQgPT09IHRhYnNDb250YWluZXIpIHtcblx0XHRcdFx0XHRjb25zdCBpc0dyb3VwVHJhbnNmZXIgPSB0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdFx0dGhpcy5vbkRyb3AoZSwgaXNHcm91cFRyYW5zZmVyID8gdGhpcy5ncm91cFZpZXcuY291bnQgOiB0aGlzLnRhYnNNb2RlbC5jb3VudCwgdGFic0NvbnRhaW5lcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNb3VzZS13aGVlbCBzdXBwb3J0IHRvIHN3aXRjaCB0byB0YWJzIG9wdGlvbmFsbHlcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX1dIRUVMLCAoZTogV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yO1xuXHRcdFx0aWYgKCFhY3RpdmVFZGl0b3IgfHwgdGhpcy5ncm91cFZpZXcuY291bnQgPCAyKSB7XG5cdFx0XHRcdHJldHVybjsgIC8vIG5lZWQgYXQgbGVhc3QgMiBvcGVuIGVkaXRvcnNcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hpZnQta2V5IGVuYWJsZXMgb3IgZGlzYWJsZXMgdGhpcyBiZWhhdmlvdXIgZGVwZW5kaW5nIG9uIHRoZSBzZXR0aW5nXG5cdFx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnNjcm9sbFRvU3dpdGNoVGFicyA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRpZiAoZS5zaGlmdEtleSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gJ29uJzogb25seSBlbmFibGUgdGhpcyB3aGVuIFNoaWZ0LWtleSBpcyBub3QgcHJlc3NlZFxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIWUuc2hpZnRLZXkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vICdvZmYnOiBvbmx5IGVuYWJsZSB0aGlzIHdoZW4gU2hpZnQta2V5IGlzIHByZXNzZWRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZ25vcmUgZXZlbnQgaWYgdGhlIGxhc3Qgb25lIGhhcHBlbmVkIHRvbyByZWNlbnRseSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk2NDA5KVxuXHRcdFx0Ly8gVGhlIHJlc3RyaWN0aW9uIGlzIHJlbGF4ZWQgYWNjb3JkaW5nIHRvIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiBgZGVsdGFYYCBhbmQgYGRlbHRhWWBcblx0XHRcdC8vIHRvIHN1cHBvcnQgZGlzY3JldGUgKG1vdXNlIHdoZWVsKSBhbmQgY29udGlndW91cyBzY3JvbGxpbmcgKHRvdWNocGFkKSBlcXVhbGx5IHdlbGxcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRpZiAobm93IC0gdGhpcy5sYXN0TW91c2VXaGVlbEV2ZW50VGltZSA8IE11bHRpRWRpdG9yVGFic0NvbnRyb2wuTU9VU0VfV0hFRUxfRVZFTlRfVEhSRVNIT0xEIC0gMiAqIChNYXRoLmFicyhlLmRlbHRhWCkgKyBNYXRoLmFicyhlLmRlbHRhWSkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sYXN0TW91c2VXaGVlbEV2ZW50VGltZSA9IG5vdztcblxuXHRcdFx0Ly8gRmlndXJlIG91dCBzY3JvbGxpbmcgZGlyZWN0aW9uIGJ1dCBpZ25vcmUgaXQgaWYgdG9vIHN1YnRsZVxuXHRcdFx0bGV0IHRhYlN3aXRjaERpcmVjdGlvbjogbnVtYmVyO1xuXHRcdFx0aWYgKGUuZGVsdGFYICsgZS5kZWx0YVkgPCAtIE11bHRpRWRpdG9yVGFic0NvbnRyb2wuTU9VU0VfV0hFRUxfRElTVEFOQ0VfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdHRhYlN3aXRjaERpcmVjdGlvbiA9IC0xO1xuXHRcdFx0fSBlbHNlIGlmIChlLmRlbHRhWCArIGUuZGVsdGFZID4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5NT1VTRV9XSEVFTF9ESVNUQU5DRV9USFJFU0hPTEQpIHtcblx0XHRcdFx0dGFiU3dpdGNoRGlyZWN0aW9uID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dEVkaXRvciA9IHRoaXMuZ3JvdXBWaWV3LmdldEVkaXRvckJ5SW5kZXgodGhpcy5ncm91cFZpZXcuZ2V0SW5kZXhPZkVkaXRvcihhY3RpdmVFZGl0b3IpICsgdGFiU3dpdGNoRGlyZWN0aW9uKTtcblx0XHRcdGlmICghbmV4dEVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW4gaXRcblx0XHRcdHRoaXMuZ3JvdXBWaWV3Lm9wZW5FZGl0b3IobmV4dEVkaXRvcik7XG5cblx0XHRcdC8vIERpc2FibGUgbm9ybWFsIHNjcm9sbGluZywgb3BlbmluZyB0aGUgZWRpdG9yIHdpbGwgYWxyZWFkeSByZXZlYWwgaXQgcHJvcGVybHlcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51XG5cdFx0Y29uc3Qgc2hvd0NvbnRleHRNZW51ID0gKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHQvLyBGaW5kIHRhcmdldCBhbmNob3Jcblx0XHRcdGxldCBhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50ID0gdGFic0NvbnRhaW5lcjtcblx0XHRcdGlmIChpc01vdXNlRXZlbnQoZSkpIHtcblx0XHRcdFx0YW5jaG9yID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGhpcy5wYXJlbnQpLCBlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdyBpdFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRcdG1lbnVJZDogdGhpcy5tZW51SWRzPy50YWJzQmFyQ29udGV4dCA/PyBNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gKHsgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfSksXG5cdFx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLmdldEtleWJpbmRpbmcoYWN0aW9uKSxcblx0XHRcdFx0b25IaWRlOiAoKSA9PiB0aGlzLmdyb3VwVmlldy5mb2N1cygpXG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYnNDb250YWluZXIsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51LCBlID0+IHNob3dDb250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHNob3dDb250ZXh0TWVudShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0hhbmRsZURlY29yYXRpb25zQ2hhbmdlKCk6IHZvaWQge1xuXG5cdFx0Ly8gQSBjaGFuZ2UgdG8gZGVjb3JhdGlvbnMgcG90ZW50aWFsbHkgaGFzIGFuIGltcGFjdCBvbiB0aGUgc2l6ZSBvZiB0YWJzXG5cdFx0Ly8gc28gd2UgbmVlZCB0byB0cmlnZ2VyIGEgbGF5b3V0IGluIHRoYXQgY2FzZSB0byBhZGp1c3QgdGhpbmdzXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFZGl0b3JBY3Rpb25zVG9vbGJhcigpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVFZGl0b3JBY3Rpb25zVG9vbGJhcigpO1xuXG5cdFx0Ly8gQ2hhbmdpbmcgdGhlIGFjdGlvbnMgaW4gdGhlIHRvb2xiYXIgY2FuIGhhdmUgYW4gaW1wYWN0IG9uIHRoZSBzaXplIG9mIHRoZVxuXHRcdC8vIHRhYiBjb250YWluZXIsIHNvIHdlIG5lZWQgdG8gbGF5b3V0IHRoZSB0YWJzIHRvIG1ha2Ugc3VyZSB0aGUgYWN0aXZlIGlzIHZpc2libGVcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMpO1xuXHR9XG5cblx0b3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VkID0gdGhpcy5oYW5kbGVPcGVuZWRFZGl0b3JzKCk7XG5cblx0XHQvLyBSZXNwZWN0IG9wdGlvbiB0byBmb2N1cyB0YWIgY29udHJvbCBpZiBwcm92aWRlZFxuXHRcdGlmIChvcHRpb25zPy5mb2N1c1RhYkNvbnRyb2wpIHtcblx0XHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIpID0+IHRhYkNvbnRhaW5lci5mb2N1cygpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdG9wZW5FZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5oYW5kbGVPcGVuZWRFZGl0b3JzKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU9wZW5lZEVkaXRvcnMoKTogYm9vbGVhbiB7XG5cblx0XHQvLyBTZXQgdGFicyBjb250cm9sIHZpc2liaWxpdHlcblx0XHR0aGlzLnVwZGF0ZVRhYnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRhYnMgYXMgbmVlZGVkXG5cdFx0Y29uc3QgW3RhYnNDb250YWluZXIsIHRhYnNTY3JvbGxiYXJdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy50YWJzQ29udGFpbmVyLCB0aGlzLnRhYnNTY3JvbGxiYXIpO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnRhYkNvdW50OyBpIDwgdGhpcy50YWJzTW9kZWwuY291bnQ7IGkrKykge1xuXHRcdFx0dGhpcy5hcHBlbmRUYWIodGhpcy5jcmVhdGVUYWIoaSwgdGFic0NvbnRhaW5lciwgdGFic1Njcm9sbGJhciksIHRhYnNDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0byByZWNvbXB1dGUgdGFiIGxhYmVscyBhbmQgZGV0ZWN0XG5cdFx0Ly8gaWYgYSBsYWJlbCBjaGFuZ2Ugb2NjdXJyZWQgdGhhdCByZXF1aXJlcyBhXG5cdFx0Ly8gcmVkcmF3IG9mIHRhYnMuXG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VkID0gdGhpcy5kaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTtcblx0XHRjb25zdCBvbGRUYWJMYWJlbHMgPSB0aGlzLnRhYkxhYmVscztcblx0XHR0aGlzLmNvbXB1dGVUYWJMYWJlbHMoKTtcblxuXHRcdC8vIFJlZHJhdyBhbmQgdXBkYXRlIGluIHRoZXNlIGNhc2VzXG5cdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdGlmIChcblx0XHRcdGFjdGl2ZUVkaXRvckNoYW5nZWQgfHxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gYWN0aXZlIGVkaXRvciBjaGFuZ2VkXG5cdFx0XHRvbGRUYWJMYWJlbHMubGVuZ3RoICE9PSB0aGlzLnRhYkxhYmVscy5sZW5ndGggfHxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIG51bWJlciBvZiB0YWJzIGNoYW5nZWRcblx0XHRcdG9sZFRhYkxhYmVscy5zb21lKChsYWJlbCwgaW5kZXgpID0+ICF0aGlzLmVxdWFsc0VkaXRvcklucHV0TGFiZWwobGFiZWwsIHRoaXMudGFiTGFiZWxzLmF0KGluZGV4KSkpIFx0Ly8gZWRpdG9yIGxhYmVscyBjaGFuZ2VkXG5cdFx0KSB7XG5cdFx0XHR0aGlzLnJlZHJhdyh7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugb25seSBsYXlvdXQgZm9yIHJldmVhbGluZ1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zLCB7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaWRDaGFuZ2U7XG5cdH1cblxuXHRwcml2YXRlIGRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpOiBib29sZWFuIHtcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5hY3RpdmVUYWJMYWJlbD8uZWRpdG9yICYmIHRoaXMudGFic01vZGVsLmFjdGl2ZUVkaXRvciB8fCBcdFx0XHRcdFx0XHRcdC8vIGFjdGl2ZSBlZGl0b3IgY2hhbmdlZCBmcm9tIG51bGwgPT4gZWRpdG9yXG5cdFx0XHR0aGlzLmFjdGl2ZVRhYkxhYmVsPy5lZGl0b3IgJiYgIXRoaXMudGFic01vZGVsLmFjdGl2ZUVkaXRvciB8fCBcdFx0XHRcdFx0XHRcdC8vIGFjdGl2ZSBlZGl0b3IgY2hhbmdlZCBmcm9tIGVkaXRvciA9PiBudWxsXG5cdFx0XHQoIXRoaXMuYWN0aXZlVGFiTGFiZWw/LmVkaXRvciB8fCAhdGhpcy50YWJzTW9kZWwuaXNBY3RpdmUodGhpcy5hY3RpdmVUYWJMYWJlbC5lZGl0b3IpKVx0Ly8gYWN0aXZlIGVkaXRvciBjaGFuZ2VkIGZyb20gZWRpdG9yQSA9PiBlZGl0b3JCXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGVxdWFsc0VkaXRvcklucHV0TGFiZWwobGFiZWxBOiBJRWRpdG9ySW5wdXRMYWJlbCB8IHVuZGVmaW5lZCwgbGFiZWxCOiBJRWRpdG9ySW5wdXRMYWJlbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChsYWJlbEEgPT09IGxhYmVsQikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFsYWJlbEEgfHwgIWxhYmVsQikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYWJlbEEubmFtZSA9PT0gbGFiZWxCLm5hbWUgJiZcblx0XHRcdGxhYmVsQS5kZXNjcmlwdGlvbiA9PT0gbGFiZWxCLmRlc2NyaXB0aW9uICYmXG5cdFx0XHRsYWJlbEEuZm9yY2VEZXNjcmlwdGlvbiA9PT0gbGFiZWxCLmZvcmNlRGVzY3JpcHRpb24gJiZcblx0XHRcdGxhYmVsQS50aXRsZSA9PT0gbGFiZWxCLnRpdGxlICYmXG5cdFx0XHRsYWJlbEEuYXJpYUxhYmVsID09PSBsYWJlbEIuYXJpYUxhYmVsO1xuXHR9XG5cblx0YmVmb3JlQ2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXG5cdFx0Ly8gRml4IHRhYnMgd2lkdGggaWYgdGhlIG1vdXNlIGlzIG92ZXIgdGFicyBhbmQgYmVmb3JlIGNsb3Npbmdcblx0XHQvLyBhIHRhYiAoZXhjZXB0IHRoZSBsYXN0IHRhYikgd2hlbiB0YWIgc2l6aW5nIGlzICdmaXhlZCcuXG5cdFx0Ly8gVGhpcyBoZWxwcyBrZWVwaW5nIHRoZSBjbG9zZSBidXR0b24gc3RhYmxlIHVuZGVyXG5cdFx0Ly8gdGhlIG1vdXNlIGFuZCBhbGxvd3MgZm9yIHJhcGlkIGNsb3Npbmcgb2YgdGFicy5cblxuXHRcdGlmICh0aGlzLmlzTW91c2VPdmVyVGFicyAmJiB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMudGFiU2l6aW5nID09PSAnZml4ZWQnKSB7XG5cdFx0XHRjb25zdCBjbG9zaW5nTGFzdFRhYiA9IHRoaXMudGFic01vZGVsLmlzTGFzdChlZGl0b3IpO1xuXHRcdFx0dGhpcy51cGRhdGVUYWJzRml4ZWRXaWR0aCghY2xvc2luZ0xhc3RUYWIpO1xuXHRcdH1cblx0fVxuXG5cdGNsb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUNsb3NlZEVkaXRvcnMoKTtcblx0fVxuXG5cdGNsb3NlRWRpdG9ycyhlZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVDbG9zZWRFZGl0b3JzKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNsb3NlZEVkaXRvcnMoKTogdm9pZCB7XG5cblx0XHQvLyBUaGVyZSBhcmUgdGFicyB0byBzaG93XG5cdFx0aWYgKHRoaXMudGFic01vZGVsLmNvdW50KSB7XG5cblx0XHRcdC8vIFJlbW92ZSB0YWJzIHRoYXQgZ290IGNsb3NlZFxuXHRcdFx0Y29uc3QgdGFic0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic0NvbnRhaW5lcik7XG5cdFx0XHR3aGlsZSAodGhpcy50YWJDb3VudCA+IHRoaXMudGFic01vZGVsLmNvdW50KSB7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIG9uZSB0YWIgZnJvbSBjb250YWluZXIgKG11c3QgYmUgdGhlIGxhc3QgdG8ga2VlcCBpbmRleGVzIGluIG9yZGVyISlcblx0XHRcdFx0dGhpcy5yZW1vdmVMYXN0VGFiKHRhYnNDb250YWluZXIpO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSBhc3NvY2lhdGVkIHRhYiBsYWJlbCBhbmQgd2lkZ2V0XG5cdFx0XHRcdGRpc3Bvc2UodGhpcy50YWJEaXNwb3NhYmxlcy5wb3AoKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEEgcmVtb3ZhbCBvZiBhIGxhYmVsIHJlcXVpcmVzIHRvIHJlY29tcHV0ZSBhbGwgbGFiZWxzXG5cdFx0XHR0aGlzLmNvbXB1dGVUYWJMYWJlbHMoKTtcblxuXHRcdFx0Ly8gUmVkcmF3IGFsbCB0YWJzXG5cdFx0XHR0aGlzLnJlZHJhdyh7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIE5vIHRhYnMgdG8gc2hvd1xuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudGFic0NvbnRhaW5lcikge1xuXHRcdFx0XHRjbGVhck5vZGUodGhpcy50YWJzQ29udGFpbmVyKTtcblx0XHRcdFx0aWYgKHRoaXMuYWRkVGFiQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy50YWJzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuYWRkVGFiQ29udGFpbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRhYkRpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLnRhYkRpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMudGFiUmVzb3VyY2VMYWJlbHMuY2xlYXIoKTtcblx0XHRcdHRoaXMudGFiTGFiZWxzID0gW107XG5cdFx0XHR0aGlzLmFjdGl2ZVRhYkxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50YWJBY3Rpb25CYXJzID0gW107XG5cblx0XHRcdHRoaXMuY2xlYXJFZGl0b3JBY3Rpb25zVG9vbGJhcigpO1xuXHRcdFx0dGhpcy51cGRhdGVUYWJzQ29udHJvbFZpc2liaWxpdHkoKTtcblx0XHR9XG5cdH1cblxuXHRtb3ZlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGZyb21UYWJJbmRleDogbnVtYmVyLCB0YXJnZXRUYWJJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIHRoZSBlZGl0b3IgbGFiZWxcblx0XHRjb25zdCBlZGl0b3JMYWJlbCA9IHRoaXMudGFiTGFiZWxzW2Zyb21UYWJJbmRleF07XG5cdFx0dGhpcy50YWJMYWJlbHMuc3BsaWNlKGZyb21UYWJJbmRleCwgMSk7XG5cdFx0dGhpcy50YWJMYWJlbHMuc3BsaWNlKHRhcmdldFRhYkluZGV4LCAwLCBlZGl0b3JMYWJlbCk7XG5cblx0XHQvLyBSZWRyYXcgdGFicyBpbiB0aGUgcmFuZ2Ugb2YgdGhlIG1vdmVcblx0XHR0aGlzLmZvckVhY2hUYWIoKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0sXG5cdFx0XHRNYXRoLm1pbihmcm9tVGFiSW5kZXgsIHRhcmdldFRhYkluZGV4KSwgLy8gZnJvbTogc21hbGxlc3Qgb2YgZnJvbVRhYkluZGV4L3RhcmdldFRhYkluZGV4XG5cdFx0XHRNYXRoLm1heChmcm9tVGFiSW5kZXgsIHRhcmdldFRhYkluZGV4KVx0Ly8gICB0bzogbGFyZ2VzdCBvZiBmcm9tVGFiSW5kZXgvdGFyZ2V0VGFiSW5kZXhcblx0XHQpO1xuXG5cdFx0Ly8gTW92aW5nIGFuIGVkaXRvciByZXF1aXJlcyBhIGxheW91dCB0byBrZWVwIHRoZSBhY3RpdmUgZWRpdG9yIHZpc2libGVcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMsIHsgZm9yY2VSZXZlYWxBY3RpdmVUYWI6IHRydWUgfSk7XG5cdH1cblxuXHRwaW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCkgPT4gdGhpcy5yZWRyYXdUYWJMYWJlbChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCkpO1xuXHR9XG5cblx0c3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMuZG9IYW5kbGVTdGlja3lFZGl0b3JDaGFuZ2UoZWRpdG9yKTtcblx0fVxuXG5cdHVuc3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMuZG9IYW5kbGVTdGlja3lFZGl0b3JDaGFuZ2UoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgZG9IYW5kbGVTdGlja3lFZGl0b3JDaGFuZ2UoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIHRhYlxuXHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSA9PiB0aGlzLnJlZHJhd1RhYihlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSk7XG5cblx0XHQvLyBTdGlja3kgY2hhbmdlIGhhcyBhbiBpbXBhY3Qgb24gZWFjaCB0YWIncyBib3JkZXIgYmVjYXVzZVxuXHRcdC8vIGl0IHBvdGVudGlhbGx5IG1vdmVzIHRoZSBib3JkZXIgdG8gdGhlIGxhc3QgcGlubmVkIHRhYlxuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiQm9yZGVycyh0YWJJbmRleCwgdGFiQ29udGFpbmVyKTtcblx0XHR9KTtcblxuXHRcdC8vIEEgY2hhbmdlIHRvIHRoZSBzdGlja3kgc3RhdGUgcmVxdWlyZXMgYSBsYXlvdXQgdG8ga2VlcCB0aGUgYWN0aXZlIGVkaXRvciB2aXNpYmxlXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zLCB7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHR9XG5cblx0c2V0QWN0aXZlKGlzR3JvdXBBY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIEFjdGl2aXR5IGhhcyBhbiBpbXBhY3Qgb24gZWFjaCB0YWIncyBhY3RpdmUgaW5kaWNhdGlvblxuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwsIHRhYkFjdGlvbkJhcikgPT4ge1xuXHRcdFx0dGhpcy5yZWRyYXdUYWJTZWxlY3RlZEFjdGl2ZUFuZERpcnR5KGlzR3JvdXBBY3RpdmUsIGVkaXRvciwgdGFiQ29udGFpbmVyLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWN0aXZpdHkgaGFzIGFuIGltcGFjdCBvbiB0aGUgdG9vbGJhciwgc28gd2UgbmVlZCB0byB1cGRhdGUgYW5kIGxheW91dFxuXHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTtcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMsIHsgZm9yY2VSZXZlYWxBY3RpdmVUYWI6IHRydWUgfSk7XG5cdH1cblxuXHR1cGRhdGVFZGl0b3JTZWxlY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwsIHRhYkFjdGlvbkJhcikgPT4ge1xuXHRcdFx0dGhpcy5yZWRyYXdUYWJTZWxlY3RlZEFjdGl2ZUFuZERpcnR5KHRoaXMuZ3JvdXBzVmlldy5hY3RpdmVHcm91cCA9PT0gdGhpcy5ncm91cFZpZXcsIGVkaXRvciwgdGFiQ29udGFpbmVyLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JMYWJlbFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZG9VcGRhdGVFZGl0b3JMYWJlbHMoKSwgMCkpO1xuXG5cdHVwZGF0ZUVkaXRvckxhYmVsKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSBhbGwgbGFiZWxzIHRvIGFjY291bnQgZm9yIGNoYW5nZXMgdG8gdGFiIGxhYmVsc1xuXHRcdC8vIFNpbmNlIHRoaXMgbWV0aG9kIG1heSBiZSBjYWxsZWQgYSBsb3Qgb2YgdGltZXMgZnJvbVxuXHRcdC8vIGluZGl2aWR1YWwgZWRpdG9ycywgd2UgY29sbGVjdCBhbGwgdGhvc2UgcmVxdWVzdHMgYW5kXG5cdFx0Ly8gdGhlbiBydW4gdGhlIHVwZGF0ZSBvbmNlIGJlY2F1c2Ugd2UgaGF2ZSB0byB1cGRhdGVcblx0XHQvLyBhbGwgb3BlbmVkIHRhYnMgaW4gdGhlIGdyb3VwIGF0IG9uY2UuXG5cdFx0dGhpcy51cGRhdGVFZGl0b3JMYWJlbFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZUVkaXRvckxhYmVscygpOiB2b2lkIHtcblxuXHRcdC8vIEEgY2hhbmdlIHRvIGEgbGFiZWwgcmVxdWlyZXMgdG8gcmVjb21wdXRlIGFsbCBsYWJlbHNcblx0XHR0aGlzLmNvbXB1dGVUYWJMYWJlbHMoKTtcblxuXHRcdC8vIEFzIHN1Y2ggd2UgbmVlZCB0byByZWRyYXcgZWFjaCBsYWJlbFxuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiTGFiZWwoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQSBjaGFuZ2UgdG8gYSBsYWJlbCByZXF1aXJlcyBhIGxheW91dCB0byBrZWVwIHRoZSBhY3RpdmUgZWRpdG9yIHZpc2libGVcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMpO1xuXHR9XG5cblx0dXBkYXRlRWRpdG9yRGlydHkoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSA9PiB0aGlzLnJlZHJhd1RhYlNlbGVjdGVkQWN0aXZlQW5kRGlydHkodGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldywgZWRpdG9yLCB0YWJDb250YWluZXIsIHRhYkFjdGlvbkJhcikpO1xuXHR9XG5cblx0dXBkYXRlRWRpdG9yQ2FwYWJpbGl0aWVzKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHR0aGlzLndpdGhUYWIoZWRpdG9yLCAoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwsIHRhYkFjdGlvbkJhcikgPT4gdGhpcy5yZWRyYXdUYWIoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwsIHRhYkFjdGlvbkJhcikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvbGRPcHRpb25zOiBJRWRpdG9yUGFydE9wdGlvbnMsIG5ld09wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucyk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZU9wdGlvbnMob2xkT3B0aW9ucywgbmV3T3B0aW9ucyk7XG5cblx0XHQvLyBBIGNoYW5nZSB0byBhIGxhYmVsIGZvcm1hdCBvcHRpb25zIHJlcXVpcmVzIHRvIHJlY29tcHV0ZSBhbGwgbGFiZWxzXG5cdFx0aWYgKG9sZE9wdGlvbnMubGFiZWxGb3JtYXQgIT09IG5ld09wdGlvbnMubGFiZWxGb3JtYXQpIHtcblx0XHRcdHRoaXMuY29tcHV0ZVRhYkxhYmVscygpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0YWJzIHNjcm9sbGJhciBzaXppbmdcblx0XHRpZiAob2xkT3B0aW9ucy50aXRsZVNjcm9sbGJhclNpemluZyAhPT0gbmV3T3B0aW9ucy50aXRsZVNjcm9sbGJhclNpemluZykge1xuXHRcdFx0dGhpcy51cGRhdGVUYWJzU2Nyb2xsYmFyU2l6aW5nKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRhYnMgc2Nyb2xsYmFyIHZpc2liaWxpdHlcblx0XHRpZiAob2xkT3B0aW9ucy50aXRsZVNjcm9sbGJhclZpc2liaWxpdHkgIT09IG5ld09wdGlvbnMudGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRhYnNTY3JvbGxiYXJWaXNpYmlsaXR5KCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGVkaXRvciBhY3Rpb25zXG5cdFx0aWYgKG9sZE9wdGlvbnMuYWx3YXlzU2hvd0VkaXRvckFjdGlvbnMgIT09IG5ld09wdGlvbnMuYWx3YXlzU2hvd0VkaXRvckFjdGlvbnMpIHtcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGFicyBzaXppbmdcblx0XHRpZiAoXG5cdFx0XHRvbGRPcHRpb25zLnRhYlNpemluZ0ZpeGVkTWluV2lkdGggIT09IG5ld09wdGlvbnMudGFiU2l6aW5nRml4ZWRNaW5XaWR0aCB8fFxuXHRcdFx0b2xkT3B0aW9ucy50YWJTaXppbmdGaXhlZE1heFdpZHRoICE9PSBuZXdPcHRpb25zLnRhYlNpemluZ0ZpeGVkTWF4V2lkdGggfHxcblx0XHRcdG9sZE9wdGlvbnMudGFiU2l6aW5nICE9PSBuZXdPcHRpb25zLnRhYlNpemluZ1xuXHRcdCkge1xuXHRcdFx0dGhpcy51cGRhdGVUYWJTaXppbmcodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVkcmF3IHRhYnMgd2hlbiBvdGhlciBvcHRpb25zIGNoYW5nZVxuXHRcdGlmIChcblx0XHRcdG9sZE9wdGlvbnMubGFiZWxGb3JtYXQgIT09IG5ld09wdGlvbnMubGFiZWxGb3JtYXQgfHxcblx0XHRcdG9sZE9wdGlvbnMudGFiQWN0aW9uTG9jYXRpb24gIT09IG5ld09wdGlvbnMudGFiQWN0aW9uTG9jYXRpb24gfHxcblx0XHRcdG9sZE9wdGlvbnMudGFiQWN0aW9uQ2xvc2VWaXNpYmlsaXR5ICE9PSBuZXdPcHRpb25zLnRhYkFjdGlvbkNsb3NlVmlzaWJpbGl0eSB8fFxuXHRcdFx0b2xkT3B0aW9ucy50YWJBY3Rpb25VbnBpblZpc2liaWxpdHkgIT09IG5ld09wdGlvbnMudGFiQWN0aW9uVW5waW5WaXNpYmlsaXR5IHx8XG5cdFx0XHRvbGRPcHRpb25zLnRhYlNpemluZyAhPT0gbmV3T3B0aW9ucy50YWJTaXppbmcgfHxcblx0XHRcdG9sZE9wdGlvbnMucGlubmVkVGFiU2l6aW5nICE9PSBuZXdPcHRpb25zLnBpbm5lZFRhYlNpemluZyB8fFxuXHRcdFx0b2xkT3B0aW9ucy5zaG93SWNvbnMgIT09IG5ld09wdGlvbnMuc2hvd0ljb25zIHx8XG5cdFx0XHRvbGRPcHRpb25zLmhhc0ljb25zICE9PSBuZXdPcHRpb25zLmhhc0ljb25zIHx8XG5cdFx0XHRvbGRPcHRpb25zLmhpZ2hsaWdodE1vZGlmaWVkVGFicyAhPT0gbmV3T3B0aW9ucy5oaWdobGlnaHRNb2RpZmllZFRhYnMgfHxcblx0XHRcdG9sZE9wdGlvbnMud3JhcFRhYnMgIT09IG5ld09wdGlvbnMud3JhcFRhYnMgfHxcblx0XHRcdG9sZE9wdGlvbnMuc2hvd1RhYkluZGV4ICE9PSBuZXdPcHRpb25zLnNob3dUYWJJbmRleCB8fFxuXHRcdFx0IWVxdWFscyhvbGRPcHRpb25zLmRlY29yYXRpb25zLCBuZXdPcHRpb25zLmRlY29yYXRpb25zKVxuXHRcdCkge1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9yRWFjaFRhYihmbjogKGVkaXRvcjogRWRpdG9ySW5wdXQsIHRhYkluZGV4OiBudW1iZXIsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYkxhYmVsV2lkZ2V0OiBJUmVzb3VyY2VMYWJlbCwgdGFiTGFiZWw6IElFZGl0b3JJbnB1dExhYmVsLCB0YWJBY3Rpb25CYXI6IEFjdGlvbkJhcikgPT4gdm9pZCwgZnJvbVRhYkluZGV4PzogbnVtYmVyLCB0b1RhYkluZGV4PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZm9yRWFjaCgoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBmcm9tVGFiSW5kZXggPT09ICdudW1iZXInICYmIGZyb21UYWJJbmRleCA+IHRhYkluZGV4KSB7XG5cdFx0XHRcdHJldHVybjsgLy8gZG8gbm90aGluZyBpZiB3ZSBhcmUgbm90IHlldCBhdCBgZnJvbUluZGV4YFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHRvVGFiSW5kZXggPT09ICdudW1iZXInICYmIHRvVGFiSW5kZXggPCB0YWJJbmRleCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdGhpbmcgaWYgd2UgYXJlIGJleW9uZCBgdG9JbmRleGBcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kb1dpdGhUYWIodGFiSW5kZXgsIGVkaXRvciwgZm4pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoVGFiKGVkaXRvcjogRWRpdG9ySW5wdXQsIGZuOiAoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlciwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFiTGFiZWxXaWRnZXQ6IElSZXNvdXJjZUxhYmVsLCB0YWJMYWJlbDogSUVkaXRvcklucHV0TGFiZWwsIHRhYkFjdGlvbkJhcjogQWN0aW9uQmFyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5kb1dpdGhUYWIodGhpcy50YWJzTW9kZWwuaW5kZXhPZihlZGl0b3IpLCBlZGl0b3IsIGZuKTtcblx0fVxuXG5cdHByaXZhdGUgZG9XaXRoVGFiKHRhYkluZGV4OiBudW1iZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQsIGZuOiAoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlciwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFiTGFiZWxXaWRnZXQ6IElSZXNvdXJjZUxhYmVsLCB0YWJMYWJlbDogSUVkaXRvcklucHV0TGFiZWwsIHRhYkFjdGlvbkJhcjogQWN0aW9uQmFyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFic0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic0NvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFiQ29udGFpbmVyID0gdGFic0NvbnRhaW5lci5jaGlsZHJlblt0YWJJbmRleF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29uc3QgdGFiUmVzb3VyY2VMYWJlbCA9IHRoaXMudGFiUmVzb3VyY2VMYWJlbHMuZ2V0KHRhYkluZGV4KTtcblx0XHRjb25zdCB0YWJMYWJlbCA9IHRoaXMudGFiTGFiZWxzW3RhYkluZGV4XTtcblx0XHRjb25zdCB0YWJBY3Rpb25CYXIgPSB0aGlzLnRhYkFjdGlvbkJhcnNbdGFiSW5kZXhdO1xuXHRcdGlmICh0YWJDb250YWluZXIgJiYgdGFiUmVzb3VyY2VMYWJlbCAmJiB0YWJMYWJlbCkge1xuXHRcdFx0Zm4oZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJSZXNvdXJjZUxhYmVsLCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhYih0YWJJbmRleDogbnVtYmVyLCB0YWJzQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFic1Njcm9sbGJhcjogU2Nyb2xsYWJsZUVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cblx0XHQvLyBUYWIgQ29udGFpbmVyXG5cdFx0Y29uc3QgdGFiQ29udGFpbmVyID0gJCgnLnRhYicsIHtcblx0XHRcdGRyYWdnYWJsZTogdHJ1ZSxcblx0XHRcdHJvbGU6ICd0YWInXG5cdFx0fSk7XG5cblx0XHQvLyBHZXN0dXJlIFN1cHBvcnRcblx0XHRjb25zdCBnZXN0dXJlRGlzcG9zYWJsZSA9IEdlc3R1cmUuYWRkVGFyZ2V0KHRhYkNvbnRhaW5lcik7XG5cblx0XHQvLyBUYWIgRmlsbCAoTW9kZXJuIFVJIHBpbGwgYmFja2dyb3VuZCkuIEEgcmVhbCBlbGVtZW50IGlzIHVzZWQgYmVjYXVzZSB0aGVcblx0XHQvLyB0YWIncyA6OmJlZm9yZS86OmFmdGVyIHBzZXVkby1lbGVtZW50cyBhcmUgcmVzZXJ2ZWQgZm9yIGRyb3AtdGFyZ2V0IGluZGljYXRvcnMuXG5cdFx0Y29uc3QgdGFiRmlsbENvbnRhaW5lciA9ICQoJy50YWItZmlsbCcsIHsgJ2FyaWEtaGlkZGVuJzogdHJ1ZSB9KTtcblx0XHR0YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiRmlsbENvbnRhaW5lcik7XG5cblx0XHQvLyBUYWIgQm9yZGVyIFRvcFxuXHRcdGNvbnN0IHRhYkJvcmRlclRvcENvbnRhaW5lciA9ICQoJy50YWItYm9yZGVyLXRvcC1jb250YWluZXInKTtcblx0XHR0YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiQm9yZGVyVG9wQ29udGFpbmVyKTtcblxuXHRcdC8vIFRhYiBFZGl0b3IgTGFiZWxcblx0XHRjb25zdCBlZGl0b3JMYWJlbCA9IHRoaXMudGFiUmVzb3VyY2VMYWJlbHMuY3JlYXRlKHRhYkNvbnRhaW5lciwgeyBob3ZlclRhcmdldE92ZXJyaWRlOiB0YWJDb250YWluZXIgfSk7XG5cblx0XHQvLyBUYWIgQWN0aW9uc1xuXHRcdGNvbnN0IHRhYkFjdGlvbnNDb250YWluZXIgPSAkKCcudGFiLWFjdGlvbnMnKTtcblx0XHR0YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiQWN0aW9uc0NvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCB0YWJBY3Rpb25SdW5uZXIgPSBuZXcgRWRpdG9yQ29tbWFuZHNDb250ZXh0QWN0aW9uUnVubmVyKHtcblx0XHRcdGdyb3VwSWQ6IHRoaXMuZ3JvdXBWaWV3LmlkLFxuXHRcdFx0Z2V0IGVkaXRvckluZGV4KCkgeyByZXR1cm4gdGhhdC50b0VkaXRvckluZGV4KHRhYkluZGV4KTsgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiQWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcih0YWJBY3Rpb25zQ29udGFpbmVyLCB7IGFyaWFMYWJlbDogbG9jYWxpemUoJ2FyaWFMYWJlbFRhYkFjdGlvbnMnLCBcIlRhYiBhY3Rpb25zXCIpLCBhY3Rpb25SdW5uZXI6IHRhYkFjdGlvblJ1bm5lciB9KTtcblx0XHRjb25zdCB0YWJBY3Rpb25MaXN0ZW5lciA9IHRhYkFjdGlvbkJhci5vbldpbGxSdW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5hY3Rpb24uaWQgPT09IHRoaXMuY2xvc2VFZGl0b3JBY3Rpb24uaWQgfHwgZS5hY3Rpb24uaWQgPT09IHRoaXMuY2xvc2VPdGhlckVkaXRvclRhYnNJbkdyb3VwQWN0aW9uLmlkKSB7XG5cdFx0XHRcdHRoaXMuYmxvY2tSZXZlYWxBY3RpdmVUYWJPbmNlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWJBY3Rpb25CYXJEaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKHRhYkFjdGlvblJ1bm5lciwgdGFiQWN0aW9uQmFyLCB0YWJBY3Rpb25MaXN0ZW5lciwgdG9EaXNwb3NhYmxlKGluc2VydCh0aGlzLnRhYkFjdGlvbkJhcnMsIHRhYkFjdGlvbkJhcikpKTtcblxuXHRcdC8vIFRhYiBGYWRlIEhpZGVyXG5cdFx0Ly8gSGlkZXMgdGhlIHRhYiBmYWRlIHRvIHRoZSByaWdodCB3aGVuIHRhYiBhY3Rpb24gbGVmdCBhbmQgc2l6aW5nIHNocmluay9maXhlZCwgOjphZnRlciwgOjpiZWZvcmUgYXJlIGFscmVhZHkgdXNlZFxuXHRcdGNvbnN0IHRhYlNoYWRvd0hpZGVyID0gJCgnLnRhYi1mYWRlLWhpZGVyJyk7XG5cdFx0dGFiQ29udGFpbmVyLmFwcGVuZENoaWxkKHRhYlNoYWRvd0hpZGVyKTtcblxuXHRcdC8vIFRhYiBCb3JkZXIgQm90dG9tXG5cdFx0Y29uc3QgdGFiQm9yZGVyQm90dG9tQ29udGFpbmVyID0gJCgnLnRhYi1ib3JkZXItYm90dG9tLWNvbnRhaW5lcicpO1xuXHRcdHRhYkNvbnRhaW5lci5hcHBlbmRDaGlsZCh0YWJCb3JkZXJCb3R0b21Db250YWluZXIpO1xuXG5cdFx0Ly8gRXZlbnRpbmdcblx0XHRjb25zdCBldmVudHNEaXNwb3NhYmxlID0gdGhpcy5yZWdpc3RlclRhYkxpc3RlbmVycyh0YWJDb250YWluZXIsIHRhYkluZGV4LCB0YWJzQ29udGFpbmVyLCB0YWJzU2Nyb2xsYmFyKTtcblxuXHRcdHRoaXMudGFiRGlzcG9zYWJsZXMucHVzaChjb21iaW5lZERpc3Bvc2FibGUoZ2VzdHVyZURpc3Bvc2FibGUsIGV2ZW50c0Rpc3Bvc2FibGUsIHRhYkFjdGlvbkJhckRpc3Bvc2FibGUsIGVkaXRvckxhYmVsKSk7XG5cblx0XHRyZXR1cm4gdGFiQ29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0VkaXRvckluZGV4KHRhYkluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXG5cdFx0Ly8gR2l2ZW4gYSBgdGFiSW5kZXhgIHRoYXQgaXMgcmVsYXRpdmUgdG8gdGhlIHRhYnMgbW9kZWxcblx0XHQvLyByZXR1cm5zIHRoZSBgZWRpdG9ySW5kZXhgIHJlbGF0aXZlIHRvIHRoZSBlbnRpcmUgZ3JvdXBcblxuXHRcdGNvbnN0IGVkaXRvciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpKTtcblxuXHRcdHJldHVybiB0aGlzLmdyb3VwVmlldy5nZXRJbmRleE9mRWRpdG9yKGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGxhc3RTaW5nbGVTZWxlY3RTZWxlY3RlZEVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVnaXN0ZXJUYWJMaXN0ZW5lcnModGFiOiBIVE1MRWxlbWVudCwgdGFiSW5kZXg6IG51bWJlciwgdGFic0NvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYnNTY3JvbGxiYXI6IFNjcm9sbGFibGVFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgaGFuZGxlQ2xpY2tPclRvdWNoID0gYXN5bmMgKGU6IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHRhYi5ibHVyKCk7IC8vIHByZXZlbnQgZmxpY2tlciBvZiBmb2N1cyBvdXRsaW5lIG9uIHRhYiB1bnRpbCBlZGl0b3IgZ290IGZvY3VzXG5cblx0XHRcdGlmIChpc01vdXNlRXZlbnQoZSkgJiYgKGUuYnV0dG9uICE9PSAwIC8qIG1pZGRsZS9yaWdodCBtb3VzZSBidXR0b24gKi8gfHwgKGlzTWFjaW50b3NoICYmIGUuY3RybEtleSAvKiBtYWNPUyBjb250ZXh0IG1lbnUgKi8pKSkge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gPT09IDEpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IC8vIHJlcXVpcmVkIHRvIHByZXZlbnQgYXV0by1zY3JvbGxpbmcgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNjY5MClcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3JpZ2luYXRlc0Zyb21UYWJBY3Rpb25CYXIoZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBub3Qgd2hlbiBjbGlja2luZyBvbiBhY3Rpb25zXG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW4gdGFicyBlZGl0b3Jcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRpZiAoZS5zaGlmdEtleSkge1xuXHRcdFx0XHRcdGxldCBhbmNob3I6IEVkaXRvcklucHV0O1xuXHRcdFx0XHRcdGlmICh0aGlzLmxhc3RTaW5nbGVTZWxlY3RTZWxlY3RlZEVkaXRvciAmJiB0aGlzLnRhYnNNb2RlbC5pc1NlbGVjdGVkKHRoaXMubGFzdFNpbmdsZVNlbGVjdFNlbGVjdGVkRWRpdG9yKSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIGxhc3Qgc2VsZWN0ZWQgZWRpdG9yIGlzIHRoZSBhbmNob3Jcblx0XHRcdFx0XHRcdGFuY2hvciA9IHRoaXMubGFzdFNpbmdsZVNlbGVjdFNlbGVjdGVkRWRpdG9yO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgYWN0aXZlIGVkaXRvciBpcyB0aGUgYW5jaG9yXG5cdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmdyb3VwVmlldy5hY3RpdmVFZGl0b3IpO1xuXHRcdFx0XHRcdFx0dGhpcy5sYXN0U2luZ2xlU2VsZWN0U2VsZWN0ZWRFZGl0b3IgPSBhY3RpdmVFZGl0b3I7XG5cdFx0XHRcdFx0XHRhbmNob3IgPSBhY3RpdmVFZGl0b3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2VsZWN0RWRpdG9yc0JldHdlZW4oZWRpdG9yLCBhbmNob3IpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKChlLmN0cmxLZXkgJiYgIWlzTWFjaW50b3NoKSB8fCAoZS5tZXRhS2V5ICYmIGlzTWFjaW50b3NoKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnRhYnNNb2RlbC5pc1NlbGVjdGVkKGVkaXRvcikpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudW5zZWxlY3RFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zZWxlY3RFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0XHRcdHRoaXMubGFzdFNpbmdsZVNlbGVjdFNlbGVjdGVkRWRpdG9yID0gZWRpdG9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBFdmVuIGlmIGZvY3VzIGlzIHByZXNlcnZlZCBtYWtlIHN1cmUgdG8gYWN0aXZhdGUgdGhlIGdyb3VwLlxuXHRcdFx0XHRcdC8vIElmIGEgbmV3IGFjdGl2ZSBlZGl0b3IgaXMgc2VsZWN0ZWQsIGtlZXAgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIG9uIGtleVxuXHRcdFx0XHRcdC8vIGRvd24gc3VjaCB0aGF0IGRyYWcgYW5kIGRyb3AgY2FuIG9wZXJhdGUgb3ZlciB0aGUgc2VsZWN0aW9uLiBUaGUgc2VsZWN0aW9uXG5cdFx0XHRcdFx0Ly8gaXMgcmVtb3ZlZCBvbiBrZXkgdXAgaW4gdGhpcyBjYXNlLlxuXHRcdFx0XHRcdGNvbnN0IGluYWN0aXZlU2VsZWN0aW9uID0gdGhpcy50YWJzTW9kZWwuaXNTZWxlY3RlZChlZGl0b3IpID8gdGhpcy5ncm91cFZpZXcuc2VsZWN0ZWRFZGl0b3JzLmZpbHRlcihlID0+ICFlLm1hdGNoZXMoZWRpdG9yKSkgOiBbXTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmdyb3VwVmlldy5vcGVuRWRpdG9yKGVkaXRvciwgeyBwcmVzZXJ2ZUZvY3VzLCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLkFDVElWQVRFIH0sIHsgaW5hY3RpdmVTZWxlY3Rpb24sIGZvY3VzVGFiQ29udHJvbDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBzaG93Q29udGV4dE1lbnUgPSAoZTogRXZlbnQpID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHR0aGlzLm9uVGFiQ29udGV4dE1lbnUoZWRpdG9yLCBlLCB0YWIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBPcGVuIG9uIENsaWNrIC8gVG91Y2hcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4gaGFuZGxlQ2xpY2tPclRvdWNoKGUsIGZhbHNlKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBUb3VjaEV2ZW50VHlwZS5UYXAsIChlOiBHZXN0dXJlRXZlbnQpID0+IGhhbmRsZUNsaWNrT3JUb3VjaChlLCB0cnVlKSkpOyAvLyBQcmVzZXJ2ZSBmb2N1cyBvbiB0b3VjaCAjMTI1NDcwXG5cblx0XHQvLyBUb3VjaCBTY3JvbGwgU3VwcG9ydFxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBUb3VjaEV2ZW50VHlwZS5DaGFuZ2UsIChlOiBHZXN0dXJlRXZlbnQpID0+IHtcblx0XHRcdHRhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxMZWZ0OiB0YWJzU2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsTGVmdCAtIGUudHJhbnNsYXRpb25YIH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBzZWxlY3Rpb24gJiBwcmV2ZW50IGZsaWNrZXIgb2YgZm9jdXMgb3V0bGluZSBvbiB0YWIgdW50aWwgZWRpdG9yIGdvdCBmb2N1c1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuTU9VU0VfVVAsIGFzeW5jIGUgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0dGFiLmJsdXIoKTtcblxuXHRcdFx0aWYgKGlzTW91c2VFdmVudChlKSAmJiAoZS5idXR0b24gIT09IDAgLyogbWlkZGxlL3JpZ2h0IG1vdXNlIGJ1dHRvbiAqLyB8fCAoaXNNYWNpbnRvc2ggJiYgZS5jdHJsS2V5IC8qIG1hY09TIGNvbnRleHQgbWVudSAqLykpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3JpZ2luYXRlc0Zyb21UYWJBY3Rpb25CYXIoZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBub3Qgd2hlbiBjbGlja2luZyBvbiBhY3Rpb25zXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlzQ3RybENtZCA9IChlLmN0cmxLZXkgJiYgIWlzTWFjaW50b3NoKSB8fCAoZS5tZXRhS2V5ICYmIGlzTWFjaW50b3NoKTtcblx0XHRcdGlmICghaXNDdHJsQ21kICYmICFlLnNoaWZ0S2V5ICYmIHRoaXMuZ3JvdXBWaWV3LnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudW5zZWxlY3RBbGxFZGl0b3JzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xvc2Ugb24gbW91c2UgbWlkZGxlIGNsaWNrXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5BVVhDTElDSywgZSA9PiB7XG5cdFx0XHRpZiAoZS5idXR0b24gPT09IDEgLyogTWlkZGxlIEJ1dHRvbiovKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSAvKiBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzU2NzE1ICovKTtcblxuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLnRhYnNNb2RlbC5nZXRFZGl0b3JCeUluZGV4KHRhYkluZGV4KTtcblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdGlmIChlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5ub3RDbG9zZSkgfHwgcHJldmVudEVkaXRvckNsb3NlKHRoaXMudGFic01vZGVsLCBlZGl0b3IsIEVkaXRvckNsb3NlTWV0aG9kLk1PVVNFLCB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5ibG9ja1JldmVhbEFjdGl2ZVRhYk9uY2UoKTtcblx0XHRcdFx0XHR0aGlzLmNsb3NlRWRpdG9yQWN0aW9uLnJ1bih7IGdyb3VwSWQ6IHRoaXMuZ3JvdXBWaWV3LmlkLCBlZGl0b3JJbmRleDogdGhpcy5ncm91cFZpZXcuZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3IpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51IG9uIFNoaWZ0K0YxMFxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LnNoaWZ0S2V5ICYmIGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRjEwKSB7XG5cdFx0XHRcdHNob3dDb250ZXh0TWVudShlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDb250ZXh0IG1lbnUgb24gdG91Y2ggY29udGV4dCBtZW51IGdlc3R1cmVcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgVG91Y2hFdmVudFR5cGUuQ29udGV4dG1lbnUsIChlOiBHZXN0dXJlRXZlbnQpID0+IHtcblx0XHRcdHNob3dDb250ZXh0TWVudShlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBLZXlib2FyZCBhY2Nlc3NpYmlsaXR5XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5LRVlfVVAsIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0bGV0IGhhbmRsZWQgPSBmYWxzZTtcblxuXHRcdFx0Ly8gUnVuIGFjdGlvbiBvbiBFbnRlci9TcGFjZVxuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0aGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0dGhpcy5ncm91cFZpZXcub3BlbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5hdmlnYXRlIGluIGVkaXRvcnNcblx0XHRcdGVsc2UgaWYgKFtLZXlDb2RlLkxlZnRBcnJvdywgS2V5Q29kZS5SaWdodEFycm93LCBLZXlDb2RlLlVwQXJyb3csIEtleUNvZGUuRG93bkFycm93LCBLZXlDb2RlLkhvbWUsIEtleUNvZGUuRW5kXS5zb21lKGtiID0+IGV2ZW50LmVxdWFscyhrYikpKSB7XG5cdFx0XHRcdGxldCBlZGl0b3JJbmRleCA9IHRoaXMudG9FZGl0b3JJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHRcdFx0ZWRpdG9ySW5kZXggPSBlZGl0b3JJbmRleCAtIDE7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSkge1xuXHRcdFx0XHRcdGVkaXRvckluZGV4ID0gZWRpdG9ySW5kZXggKyAxO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkhvbWUpKSB7XG5cdFx0XHRcdFx0ZWRpdG9ySW5kZXggPSAwO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVkaXRvckluZGV4ID0gdGhpcy5ncm91cFZpZXcuY291bnQgLSAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5ncm91cFZpZXcuZ2V0RWRpdG9yQnlJbmRleChlZGl0b3JJbmRleCk7XG5cdFx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0XHRoYW5kbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLmdyb3VwVmlldy5vcGVuRWRpdG9yKHRhcmdldCwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0sIHsgZm9jdXNUYWJDb250cm9sOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1vdmluZyBpbiB0aGUgdGFicyBjb250YWluZXIgY2FuIGhhdmUgYW4gaW1wYWN0IG9uIHNjcm9sbGluZyBwb3NpdGlvbiwgc28gd2UgbmVlZCB0byB1cGRhdGUgdGhlIGN1c3RvbSBzY3JvbGxiYXJcblx0XHRcdHRhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0XHRzY3JvbGxMZWZ0OiB0YWJzQ29udGFpbmVyLnNjcm9sbExlZnRcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIERvdWJsZSBjbGljazogZWl0aGVyIHBpbiBvciB0b2dnbGUgbWF4aW1pemVkXG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW1RvdWNoRXZlbnRUeXBlLlRhcCwgRXZlbnRUeXBlLkRCTENMSUNLXSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIGV2ZW50VHlwZSwgKGU6IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50VHlwZSA9PT0gRXZlbnRUeXBlLkRCTENMSUNLKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdFx0fSBlbHNlIGlmICgoPEdlc3R1cmVFdmVudD5lKS50YXBDb3VudCAhPT0gMikge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gaWdub3JlIHNpbmdsZSB0YXBzXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLnRhYnNNb2RlbC5nZXRFZGl0b3JCeUluZGV4KHRhYkluZGV4KTtcblx0XHRcdFx0aWYgKGVkaXRvciAmJiB0aGlzLnRhYnNNb2RlbC5pc1Bpbm5lZChlZGl0b3IpKSB7XG5cdFx0XHRcdFx0c3dpdGNoICh0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuZG91YmxlQ2xpY2tUYWJUb1RvZ2dsZUVkaXRvckdyb3VwU2l6ZXMpIHtcblx0XHRcdFx0XHRcdGNhc2UgJ21heGltaXplJzpcblx0XHRcdFx0XHRcdFx0dGhpcy5ncm91cHNWaWV3LnRvZ2dsZU1heGltaXplR3JvdXAodGhpcy5ncm91cFZpZXcpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ2V4cGFuZCc6XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ3JvdXBzVmlldy50b2dnbGVFeHBhbmRHcm91cCh0aGlzLmdyb3VwVmlldyk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnb2ZmJzpcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ncm91cFZpZXcucGluRWRpdG9yKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBDb250ZXh0IG1lbnVcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLnRhYnNNb2RlbC5nZXRFZGl0b3JCeUluZGV4KHRhYkluZGV4KTtcblx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5vblRhYkNvbnRleHRNZW51KGVkaXRvciwgZSwgdGFiKTtcblx0XHRcdH1cblx0XHR9LCB0cnVlIC8qIHVzZSBjYXB0dXJlIHRvIGZpeCBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkxNDUgKi8pKTtcblxuXHRcdC8vIERyYWcgJiBEcm9wIHN1cHBvcnRcblx0XHRsZXQgbGFzdERyYWdFdmVudDogRHJhZ0V2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBpc05ld1dpbmRvd09wZXJhdGlvbiA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcih0YWIsIHtcblx0XHRcdG9uRHJhZ1N0YXJ0OiBlID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9yQnlJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aXNOZXdXaW5kb3dPcGVyYXRpb24gPSB0aGlzLmlzTmV3V2luZG93T3BlcmF0aW9uKGUpO1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZEVkaXRvcnMgPSB0aGlzLmdyb3VwVmlldy5zZWxlY3RlZEVkaXRvcnM7XG5cdFx0XHRcdHRoaXMuZWRpdG9yVHJhbnNmZXIuc2V0RGF0YShzZWxlY3RlZEVkaXRvcnMubWFwKGUgPT4gbmV3IERyYWdnZWRFZGl0b3JJZGVudGlmaWVyKHsgZWRpdG9yOiBlLCBncm91cElkOiB0aGlzLmdyb3VwVmlldy5pZCB9KSksIERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cblx0XHRcdFx0aWYgKGUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdjb3B5TW92ZSc7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGAke2VkaXRvci5nZXROYW1lKCl9ICsgJHtzZWxlY3RlZEVkaXRvcnMubGVuZ3RoIC0gMX1gO1xuXHRcdFx0XHRcdFx0YXBwbHlEcmFnSW1hZ2UoZSwgdGFiLCBsYWJlbCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnM7XG5cdFx0XHRcdFx0XHRjb25zdCBpc1RhYlN0aWNreSA9IHRoaXMudGFic01vZGVsLmlzU3RpY2t5KHRhYkluZGV4KTtcblx0XHRcdFx0XHRcdGNvbnN0IGlzU2hyaW5rU2l6aW5nID0gb3B0aW9ucy50YWJTaXppbmcgPT09ICdzaHJpbmsnIHx8IChpc1RhYlN0aWNreSAmJiBvcHRpb25zLnBpbm5lZFRhYlNpemluZyA9PT0gJ3NocmluaycpO1xuXHRcdFx0XHRcdFx0aWYgKGlzU2hyaW5rU2l6aW5nKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFdoZW4gdGFiIHNpemluZyBpcyAnc2hyaW5rJywgdGhlIHRhYiBsYWJlbCBtYXkgYmUgdHJ1bmNhdGVkLiBVc2luZyB0aGUgdGFiIERPTSBlbGVtZW50XG5cdFx0XHRcdFx0XHRcdC8vIGFzIGEgZHJhZyBpbWFnZSBjYW4gY2F1c2UgcGFydHMgb2YgdGhlIHRhYiBoZWFkZXIgVUkgdG8gdmlzdWFsbHkgZHJhZyBhbG9uZy5cblx0XHRcdFx0XHRcdFx0Ly8gSW5zdGVhZCwgdXNlIGEgY2xlYW4gdGV4dC1vbmx5IGRyYWcgaW1hZ2Ugd2l0aCB0aGUgZWRpdG9yIG5hbWUuXG5cdFx0XHRcdFx0XHRcdGFwcGx5RHJhZ0ltYWdlKGUsIHRhYiwgZWRpdG9yLmdldE5hbWUoKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRlLmRhdGFUcmFuc2Zlci5zZXREcmFnSW1hZ2UodGFiLCAwLCAwKTsgLy8gdG9wIGxlZnQgY29ybmVyIG9mIGRyYWdnZWQgdGFiIHNldCB0byBjdXJzb3IgcG9zaXRpb24gdG8gbWFrZSByb29tIGZvciBkcm9wLWJvcmRlciBmZWVkYmFja1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFwcGx5IHNvbWUgZGF0YXRyYW5zZmVyIHR5cGVzIHRvIGFsbG93IGZvciBkcmFnZ2luZyB0aGUgZWxlbWVudCBvdXRzaWRlIG9mIHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0XHR0aGlzLmRvRmlsbFJlc291cmNlRGF0YVRyYW5zZmVycyhzZWxlY3RlZEVkaXRvcnMsIGUsIGlzTmV3V2luZG93T3BlcmF0aW9uKTtcblxuXHRcdFx0XHRzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLnBhcmVudCksICgpID0+IHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYiwgZmFsc2UsIGUsIHRhYkluZGV4KSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWc6IGUgPT4ge1xuXHRcdFx0XHRsYXN0RHJhZ0V2ZW50ID0gZTtcblx0XHRcdH0sXG5cblx0XHRcdG9uRHJhZ0VudGVyOiBlID0+IHtcblxuXHRcdFx0XHQvLyBSZXR1cm4gaWYgdHJhbnNmZXIgaXMgdW5zdXBwb3J0ZWRcblx0XHRcdFx0aWYgKCF0aGlzLmlzU3VwcG9ydGVkRHJvcFRyYW5zZmVyKGUpKSB7XG5cdFx0XHRcdFx0aWYgKGUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0XHRlLmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ25vbmUnO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwZGF0ZSB0aGUgZHJvcEVmZmVjdCB0byBcImNvcHlcIiBpZiB0aGVyZSBpcyBubyBsb2NhbCBkYXRhIHRvIGJlIGRyYWdnZWQgYmVjYXVzZVxuXHRcdFx0XHQvLyBpbiB0aGF0IGNhc2Ugd2UgY2FuIG9ubHkgY29weSB0aGUgZGF0YSBpbnRvIGFuZCBub3QgbW92ZSBpdCBmcm9tIGl0cyBzb3VyY2Vcblx0XHRcdFx0aWYgKCF0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0XHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdjb3B5Jztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayh0YWIsIHRydWUsIGUsIHRhYkluZGV4KTtcblx0XHRcdH0sXG5cblx0XHRcdG9uRHJhZ092ZXI6IChlLCBkcmFnRHVyYXRpb24pID0+IHtcblx0XHRcdFx0aWYgKGRyYWdEdXJhdGlvbiA+PSBNdWx0aUVkaXRvclRhYnNDb250cm9sLkRSQUdfT1ZFUl9PUEVOX1RBQl9USFJFU0hPTEQpIHtcblx0XHRcdFx0XHRjb25zdCBkcmFnZ2VkT3ZlclRhYiA9IHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChkcmFnZ2VkT3ZlclRhYiAmJiB0aGlzLnRhYnNNb2RlbC5hY3RpdmVFZGl0b3IgIT09IGRyYWdnZWRPdmVyVGFiKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmdyb3VwVmlldy5vcGVuRWRpdG9yKGRyYWdnZWRPdmVyVGFiLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2sodGFiLCB0cnVlLCBlLCB0YWJJbmRleCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdFbmQ6IGFzeW5jIGUgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayh0YWIsIGZhbHNlLCBlLCB0YWJJbmRleCk7XG5cdFx0XHRcdGNvbnN0IGRyYWdnZWRFZGl0b3JzID0gdGhpcy5lZGl0b3JUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yVHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdCFpc05ld1dpbmRvd09wZXJhdGlvbiB8fFxuXHRcdFx0XHRcdGlzV2luZG93RHJhZ2dlZE92ZXIoKSB8fFxuXHRcdFx0XHRcdCFkcmFnZ2VkRWRpdG9ycyB8fFxuXHRcdFx0XHRcdGRyYWdnZWRFZGl0b3JzLmxlbmd0aCA9PT0gMFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGRyYWcgdG8gb3BlbiBpbiBuZXcgd2luZG93IGlzIGRpc2FibGVkXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhdXhpbGlhcnlFZGl0b3JQYXJ0ID0gYXdhaXQgdGhpcy5tYXliZUNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnRBdChlLCB0YWIpO1xuXHRcdFx0XHRpZiAoIWF1eGlsaWFyeUVkaXRvclBhcnQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IGF1eGlsaWFyeUVkaXRvclBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnNXaXRoT3B0aW9ucyA9IHByZXBhcmVNb3ZlQ29weUVkaXRvcnModGhpcy5ncm91cFZpZXcsIGRyYWdnZWRFZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLmlkZW50aWZpZXIuZWRpdG9yKSk7XG5cdFx0XHRcdGlmICh0aGlzLmlzTW92ZU9wZXJhdGlvbihsYXN0RHJhZ0V2ZW50ID8/IGUsIHRhcmdldEdyb3VwLmlkLCBkcmFnZ2VkRWRpdG9yc1swXS5pZGVudGlmaWVyLmVkaXRvcikpIHtcblx0XHRcdFx0XHR0aGlzLmdyb3VwVmlldy5tb3ZlRWRpdG9ycyhlZGl0b3JzV2l0aE9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmdyb3VwVmlldy5jb3B5RWRpdG9ycyhlZGl0b3JzV2l0aE9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRhcmdldEdyb3VwLmZvY3VzKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyb3A6IGUgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayh0YWIsIGZhbHNlLCBlLCB0YWJJbmRleCk7XG5cblx0XHRcdFx0Ly8gY29tcHV0ZSB0aGUgdGFyZ2V0IGluZGV4XG5cdFx0XHRcdGxldCB0YXJnZXRJbmRleCA9IHRhYkluZGV4O1xuXHRcdFx0XHRpZiAodGhpcy5nZXRUYWJEcmFnT3ZlckxvY2F0aW9uKGUsIHRhYikgPT09ICdyaWdodCcpIHtcblx0XHRcdFx0XHR0YXJnZXRJbmRleCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5vbkRyb3AoZSwgdGFyZ2V0SW5kZXgsIHRhYnNDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgaXNTdXBwb3J0ZWREcm9wVHJhbnNmZXIoZTogRHJhZ0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZ3JvdXBUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGRhdGEpICYmIGRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGRhdGFbMF07XG5cdFx0XHRcdGlmIChncm91cC5pZGVudGlmaWVyID09PSB0aGlzLmdyb3VwVmlldy5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gZ3JvdXBzIGNhbm5vdCBiZSBkcm9wcGVkIG9uIGdyb3VwIGl0IG9yaWdpbmF0ZXMgZnJvbVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIChsb2NhbCkgZWRpdG9ycyBjYW4gYWx3YXlzIGJlIGRyb3BwZWRcblx0XHR9XG5cblx0XHRpZiAoZS5kYXRhVHJhbnNmZXIgJiYgZS5kYXRhVHJhbnNmZXIudHlwZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIG9wdGltaXN0aWNhbGx5IGFsbG93IGV4dGVybmFsIGRhdGEgKC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU3ODkpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEcm9wRmVlZGJhY2soZWxlbWVudDogSFRNTEVsZW1lbnQsIGlzRE5EOiBib29sZWFuLCBlOiBEcmFnRXZlbnQsIHRhYkluZGV4PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNUYWIgPSAodHlwZW9mIHRhYkluZGV4ID09PSAnbnVtYmVyJyk7XG5cblx0XHRsZXQgZHJvcFRhcmdldDtcblx0XHRpZiAoaXNETkQpIHtcblx0XHRcdGlmIChpc1RhYikge1xuXHRcdFx0XHRkcm9wVGFyZ2V0ID0gdGhpcy5jb21wdXRlRHJvcFRhcmdldChlLCB0YWJJbmRleCwgZWxlbWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkcm9wVGFyZ2V0ID0geyBsZWZ0RWxlbWVudDogZWxlbWVudC5sYXN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50LCByaWdodEVsZW1lbnQ6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRkcm9wVGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRHJvcFRhcmdldChkcm9wVGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgZHJvcFRhcmdldDogeyBsZWZ0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7IHJpZ2h0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB1cGRhdGVEcm9wVGFyZ2V0KG5ld1RhcmdldDogeyBsZWZ0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7IHJpZ2h0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFRhcmdldHMgPSB0aGlzLmRyb3BUYXJnZXQ7XG5cdFx0aWYgKG9sZFRhcmdldHMgPT09IG5ld1RhcmdldCB8fCBvbGRUYXJnZXRzICYmIG5ld1RhcmdldCAmJiBvbGRUYXJnZXRzLmxlZnRFbGVtZW50ID09PSBuZXdUYXJnZXQubGVmdEVsZW1lbnQgJiYgb2xkVGFyZ2V0cy5yaWdodEVsZW1lbnQgPT09IG5ld1RhcmdldC5yaWdodEVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkcm9wQ2xhc3NMZWZ0ID0gJ2Ryb3AtdGFyZ2V0LWxlZnQnO1xuXHRcdGNvbnN0IGRyb3BDbGFzc1JpZ2h0ID0gJ2Ryb3AtdGFyZ2V0LXJpZ2h0JztcblxuXHRcdGlmIChvbGRUYXJnZXRzKSB7XG5cdFx0XHRvbGRUYXJnZXRzLmxlZnRFbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKGRyb3BDbGFzc0xlZnQpO1xuXHRcdFx0b2xkVGFyZ2V0cy5yaWdodEVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoZHJvcENsYXNzUmlnaHQpO1xuXHRcdH1cblxuXHRcdGlmIChuZXdUYXJnZXQpIHtcblx0XHRcdG5ld1RhcmdldC5sZWZ0RWxlbWVudD8uY2xhc3NMaXN0LmFkZChkcm9wQ2xhc3NMZWZ0KTtcblx0XHRcdG5ld1RhcmdldC5yaWdodEVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoZHJvcENsYXNzUmlnaHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuZHJvcFRhcmdldCA9IG5ld1RhcmdldDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGFiRHJhZ092ZXJMb2NhdGlvbihlOiBEcmFnRXZlbnQsIHRhYjogSFRNTEVsZW1lbnQpOiAnbGVmdCcgfCAncmlnaHQnIHtcblx0XHRjb25zdCByZWN0ID0gdGFiLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG9mZnNldFhSZWxhdGl2ZVRvUGFyZW50ID0gZS5jbGllbnRYIC0gcmVjdC5sZWZ0O1xuXG5cdFx0cmV0dXJuIG9mZnNldFhSZWxhdGl2ZVRvUGFyZW50IDw9IHJlY3Qud2lkdGggLyAyID8gJ2xlZnQnIDogJ3JpZ2h0Jztcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZURyb3BUYXJnZXQoZTogRHJhZ0V2ZW50LCB0YWJJbmRleDogbnVtYmVyLCB0YXJnZXRUYWI6IEhUTUxFbGVtZW50KTogeyBsZWZ0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7IHJpZ2h0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXNMZWZ0U2lkZU9mVGFiID0gdGhpcy5nZXRUYWJEcmFnT3ZlckxvY2F0aW9uKGUsIHRhcmdldFRhYikgPT09ICdsZWZ0Jztcblx0XHRjb25zdCBpc0xhc3RUYWIgPSB0YWJJbmRleCA9PT0gdGhpcy50YWJzTW9kZWwuY291bnQgLSAxO1xuXHRcdGNvbnN0IGlzRmlyc3RUYWIgPSB0YWJJbmRleCA9PT0gMDtcblxuXHRcdC8vIEJlZm9yZSBmaXJzdCB0YWJcblx0XHRpZiAoaXNMZWZ0U2lkZU9mVGFiICYmIGlzRmlyc3RUYWIpIHtcblx0XHRcdHJldHVybiB7IGxlZnRFbGVtZW50OiB1bmRlZmluZWQsIHJpZ2h0RWxlbWVudDogdGFyZ2V0VGFiIH07XG5cdFx0fVxuXG5cdFx0Ly8gQWZ0ZXIgbGFzdCB0YWJcblx0XHRpZiAoIWlzTGVmdFNpZGVPZlRhYiAmJiBpc0xhc3RUYWIpIHtcblx0XHRcdHJldHVybiB7IGxlZnRFbGVtZW50OiB0YXJnZXRUYWIsIHJpZ2h0RWxlbWVudDogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gQmV0d2VlbiB0d28gdGFic1xuXHRcdGNvbnN0IHRhYkJlZm9yZSA9IGlzTGVmdFNpZGVPZlRhYiA/IHRhcmdldFRhYi5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIDogdGFyZ2V0VGFiO1xuXHRcdGNvbnN0IHRhYkFmdGVyID0gaXNMZWZ0U2lkZU9mVGFiID8gdGFyZ2V0VGFiIDogdGFyZ2V0VGFiLm5leHRFbGVtZW50U2libGluZztcblxuXHRcdHJldHVybiB7IGxlZnRFbGVtZW50OiB0YWJCZWZvcmUgYXMgSFRNTEVsZW1lbnQsIHJpZ2h0RWxlbWVudDogdGFiQWZ0ZXIgYXMgSFRNTEVsZW1lbnQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VsZWN0RWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5ncm91cFZpZXcuaXNBY3RpdmUoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZ3JvdXBWaWV3LnNldFNlbGVjdGlvbihlZGl0b3IsIHRoaXMuZ3JvdXBWaWV3LnNlbGVjdGVkRWRpdG9ycyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbGVjdEVkaXRvcnNCZXR3ZWVuKHRhcmdldDogRWRpdG9ySW5wdXQsIGFuY2hvcjogRWRpdG9ySW5wdXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JJbmRleCA9IHRoaXMuZ3JvdXBWaWV3LmdldEluZGV4T2ZFZGl0b3IodGFyZ2V0KTtcblx0XHRpZiAoZWRpdG9ySW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYW5jaG9yRWRpdG9ySW5kZXggPSB0aGlzLmdyb3VwVmlldy5nZXRJbmRleE9mRWRpdG9yKGFuY2hvcik7XG5cdFx0aWYgKGFuY2hvckVkaXRvckluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblxuXHRcdGxldCBzZWxlY3Rpb24gPSB0aGlzLmdyb3VwVmlldy5zZWxlY3RlZEVkaXRvcnM7XG5cblx0XHQvLyBVbnNlbGVjdCBlZGl0b3JzIG9uIG90aGVyIHNpZGUgb2YgYW5jaG9yIGluIHJlbGF0aW9uIHRvIHRoZSB0YXJnZXRcblx0XHRsZXQgY3VycmVudEVkaXRvckluZGV4ID0gYW5jaG9yRWRpdG9ySW5kZXg7XG5cdFx0d2hpbGUgKGN1cnJlbnRFZGl0b3JJbmRleCA+PSAwICYmIGN1cnJlbnRFZGl0b3JJbmRleCA8PSB0aGlzLmdyb3VwVmlldy5jb3VudCAtIDEpIHtcblx0XHRcdGN1cnJlbnRFZGl0b3JJbmRleCA9IGFuY2hvckVkaXRvckluZGV4IDwgZWRpdG9ySW5kZXggPyBjdXJyZW50RWRpdG9ySW5kZXggLSAxIDogY3VycmVudEVkaXRvckluZGV4ICsgMTtcblxuXHRcdFx0Y29uc3QgY3VycmVudEVkaXRvciA9IHRoaXMuZ3JvdXBWaWV3LmdldEVkaXRvckJ5SW5kZXgoY3VycmVudEVkaXRvckluZGV4KTtcblx0XHRcdGlmICghY3VycmVudEVkaXRvcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmdyb3VwVmlldy5pc1NlbGVjdGVkKGN1cnJlbnRFZGl0b3IpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRzZWxlY3Rpb24gPSBzZWxlY3Rpb24uZmlsdGVyKGVkaXRvciA9PiAhZWRpdG9yLm1hdGNoZXMoY3VycmVudEVkaXRvcikpO1xuXHRcdH1cblxuXHRcdC8vIFNlbGVjdCBlZGl0b3JzIGJldHdlZW4gYW5jaG9yIGFuZCB0YXJnZXRcblx0XHRjb25zdCBmcm9tRWRpdG9ySW5kZXggPSBhbmNob3JFZGl0b3JJbmRleCA8IGVkaXRvckluZGV4ID8gYW5jaG9yRWRpdG9ySW5kZXggOiBlZGl0b3JJbmRleDtcblx0XHRjb25zdCB0b0VkaXRvckluZGV4ID0gYW5jaG9yRWRpdG9ySW5kZXggPCBlZGl0b3JJbmRleCA/IGVkaXRvckluZGV4IDogYW5jaG9yRWRpdG9ySW5kZXg7XG5cblx0XHRjb25zdCBlZGl0b3JzVG9TZWxlY3QgPSB0aGlzLmdyb3VwVmlldy5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5zbGljZShmcm9tRWRpdG9ySW5kZXgsIHRvRWRpdG9ySW5kZXggKyAxKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzVG9TZWxlY3QpIHtcblx0XHRcdGlmICghdGhpcy5ncm91cFZpZXcuaXNTZWxlY3RlZChlZGl0b3IpKSB7XG5cdFx0XHRcdHNlbGVjdGlvbi5wdXNoKGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMgPSBzZWxlY3Rpb24uZmlsdGVyKGVkaXRvciA9PiAhZWRpdG9yLm1hdGNoZXModGFyZ2V0KSk7XG5cdFx0YXdhaXQgdGhpcy5ncm91cFZpZXcuc2V0U2VsZWN0aW9uKHRhcmdldCwgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1bnNlbGVjdEVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXNVbnNlbGVjdGluZ0FjdGl2ZUVkaXRvciA9IHRoaXMuZ3JvdXBWaWV3LmlzQWN0aXZlKGVkaXRvcik7XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBvbmx5IG9uZSBlZGl0b3Igc2VsZWN0ZWQsIGRvIG5vdCB1bnNlbGVjdCBpdFxuXHRcdGlmIChpc1Vuc2VsZWN0aW5nQWN0aXZlRWRpdG9yICYmIHRoaXMuZ3JvdXBWaWV3LnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbmV3QWN0aXZlRWRpdG9yID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yKTtcblxuXHRcdC8vIElmIGFjdGl2ZSBlZGl0b3IgaXMgYmluZyB1bnNlbGVjdGVkIHRoZW4gZmluZCB0aGUgbW9zdCByZWNlbnRseSBvcGVuZWQgc2VsZWN0ZWQgZWRpdG9yXG5cdFx0Ly8gdGhhdCBpcyBub3QgdGhlIGVkaXRvciBiZWluZyB1bnNlbGVjdGVkXG5cdFx0aWYgKGlzVW5zZWxlY3RpbmdBY3RpdmVFZGl0b3IpIHtcblx0XHRcdGNvbnN0IHJlY2VudEVkaXRvcnMgPSB0aGlzLmdyb3VwVmlldy5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHJlY2VudEVkaXRvcnMubGVuZ3RoOyBpKyspIHsgLy8gRmlyc3Qgb25lIGlzIHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0XHRcdGNvbnN0IHJlY2VudEVkaXRvciA9IHJlY2VudEVkaXRvcnNbaV07XG5cdFx0XHRcdGlmICh0aGlzLmdyb3VwVmlldy5pc1NlbGVjdGVkKHJlY2VudEVkaXRvcikpIHtcblx0XHRcdFx0XHRuZXdBY3RpdmVFZGl0b3IgPSByZWNlbnRFZGl0b3I7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyA9IHRoaXMuZ3JvdXBWaWV3LnNlbGVjdGVkRWRpdG9ycy5maWx0ZXIoZSA9PiAhZS5tYXRjaGVzKGVkaXRvcikgJiYgIWUubWF0Y2hlcyhuZXdBY3RpdmVFZGl0b3IpKTtcblx0XHRhd2FpdCB0aGlzLmdyb3VwVmlldy5zZXRTZWxlY3Rpb24obmV3QWN0aXZlRWRpdG9yLCBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVuc2VsZWN0QWxsRWRpdG9ycygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5ncm91cFZpZXcuc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvcik7XG5cdFx0XHRhd2FpdCB0aGlzLmdyb3VwVmlldy5zZXRTZWxlY3Rpb24oYWN0aXZlRWRpdG9yLCBbXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlVGFiTGFiZWxzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgbGFiZWxGb3JtYXQgfSA9IHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucztcblx0XHRjb25zdCB7IHZlcmJvc2l0eSwgc2hvcnRlbkR1cGxpY2F0ZXMgfSA9IHRoaXMuZ2V0TGFiZWxDb25maWdGbGFncyhsYWJlbEZvcm1hdCk7XG5cblx0XHQvLyBCdWlsZCBsYWJlbHMgYW5kIGRlc2NyaXB0aW9ucyBmb3IgZWFjaCBlZGl0b3Jcblx0XHRjb25zdCBsYWJlbHM6IElFZGl0b3JJbnB1dExhYmVsW10gPSBbXTtcblx0XHRsZXQgYWN0aXZlRWRpdG9yVGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLnRhYnNNb2RlbC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5mb3JFYWNoKChlZGl0b3I6IEVkaXRvcklucHV0LCB0YWJJbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRsYWJlbHMucHVzaCh7XG5cdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0bmFtZTogZWRpdG9yLmdldE5hbWUoKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGVkaXRvci5nZXREZXNjcmlwdGlvbih2ZXJib3NpdHkpLFxuXHRcdFx0XHRmb3JjZURlc2NyaXB0aW9uOiBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5Gb3JjZURlc2NyaXB0aW9uKSxcblx0XHRcdFx0dGl0bGU6IGVkaXRvci5nZXRUaXRsZShWZXJib3NpdHkuTE9ORyksXG5cdFx0XHRcdGFyaWFMYWJlbDogY29tcHV0ZUVkaXRvckFyaWFMYWJlbChlZGl0b3IsIHRhYkluZGV4LCB0aGlzLmdyb3VwVmlldywgdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuY291bnQpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGVkaXRvciA9PT0gdGhpcy50YWJzTW9kZWwuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvclRhYkluZGV4ID0gdGFiSW5kZXg7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBTaG9ydGVuIGxhYmVscyBhcyBuZWVkZWRcblx0XHRpZiAoc2hvcnRlbkR1cGxpY2F0ZXMpIHtcblx0XHRcdHRoaXMuc2hvcnRlblRhYkxhYmVscyhsYWJlbHMpO1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGZvciBmYXN0IGxvb2t1cFxuXHRcdHRoaXMudGFiTGFiZWxzID0gbGFiZWxzO1xuXHRcdHRoaXMuYWN0aXZlVGFiTGFiZWwgPSBsYWJlbHNbYWN0aXZlRWRpdG9yVGFiSW5kZXhdO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG9ydGVuVGFiTGFiZWxzKGxhYmVsczogSUVkaXRvcklucHV0TGFiZWxbXSk6IHZvaWQge1xuXG5cdFx0Ly8gR2F0aGVyIGR1cGxpY2F0ZSB0aXRsZXMsIHdoaWxlIGZpbHRlcmluZyBvdXQgaW52YWxpZCBkZXNjcmlwdGlvbnNcblx0XHRjb25zdCBtYXBOYW1lVG9EdXBsaWNhdGVzID0gbmV3IE1hcDxzdHJpbmcsIElFZGl0b3JJbnB1dExhYmVsW10+KCk7XG5cdFx0Zm9yIChjb25zdCBsYWJlbCBvZiBsYWJlbHMpIHtcblx0XHRcdGlmICh0eXBlb2YgbGFiZWwuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGdldE9yU2V0KG1hcE5hbWVUb0R1cGxpY2F0ZXMsIGxhYmVsLm5hbWUsIFtdKS5wdXNoKGxhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsLmRlc2NyaXB0aW9uID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWRlbnRpZnkgZHVwbGljYXRlIG5hbWVzIGFuZCBzaG9ydGVuIGRlc2NyaXB0aW9uc1xuXHRcdGZvciAoY29uc3QgWywgZHVwbGljYXRlTGFiZWxzXSBvZiBtYXBOYW1lVG9EdXBsaWNhdGVzKSB7XG5cblx0XHRcdC8vIFJlbW92ZSBkZXNjcmlwdGlvbiBpZiB0aGUgdGl0bGUgaXNuJ3QgZHVwbGljYXRlZFxuXHRcdFx0Ly8gYW5kIHdlIGhhdmUgbm8gaW5kaWNhdGlvbiB0byBlbmZvcmNlIGRlc2NyaXB0aW9uXG5cdFx0XHRpZiAoZHVwbGljYXRlTGFiZWxzLmxlbmd0aCA9PT0gMSAmJiAhZHVwbGljYXRlTGFiZWxzWzBdLmZvcmNlRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0ZHVwbGljYXRlTGFiZWxzWzBdLmRlc2NyaXB0aW9uID0gJyc7XG5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBkZXNjcmlwdGlvbnNcblx0XHRcdGNvbnN0IG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzID0gbmV3IE1hcDxzdHJpbmcsIElFZGl0b3JJbnB1dExhYmVsW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGR1cGxpY2F0ZUxhYmVsIG9mIGR1cGxpY2F0ZUxhYmVscykge1xuXHRcdFx0XHRnZXRPclNldChtYXBEZXNjcmlwdGlvblRvRHVwbGljYXRlcywgZHVwbGljYXRlTGFiZWwuZGVzY3JpcHRpb24sIFtdKS5wdXNoKGR1cGxpY2F0ZUxhYmVsKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yIGVkaXRvcnMgd2l0aCBkdXBsaWNhdGUgZGVzY3JpcHRpb25zLCBjaGVjayB3aGV0aGVyIGFueSBsb25nIGRlc2NyaXB0aW9ucyBkaWZmZXJcblx0XHRcdGxldCB1c2VMb25nRGVzY3JpcHRpb25zID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IFssIGR1cGxpY2F0ZUxhYmVsc10gb2YgbWFwRGVzY3JpcHRpb25Ub0R1cGxpY2F0ZXMpIHtcblx0XHRcdFx0aWYgKCF1c2VMb25nRGVzY3JpcHRpb25zICYmIGR1cGxpY2F0ZUxhYmVscy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgW2ZpcnN0LCAuLi5yZXN0XSA9IGR1cGxpY2F0ZUxhYmVscy5tYXAoKHsgZWRpdG9yIH0pID0+IGVkaXRvci5nZXREZXNjcmlwdGlvbihWZXJib3NpdHkuTE9ORykpO1xuXHRcdFx0XHRcdHVzZUxvbmdEZXNjcmlwdGlvbnMgPSByZXN0LnNvbWUoZGVzY3JpcHRpb24gPT4gZGVzY3JpcHRpb24gIT09IGZpcnN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBzbywgcmVwbGFjZSBhbGwgZGVzY3JpcHRpb25zIHdpdGggbG9uZyBkZXNjcmlwdGlvbnNcblx0XHRcdGlmICh1c2VMb25nRGVzY3JpcHRpb25zKSB7XG5cdFx0XHRcdG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzLmNsZWFyKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZHVwbGljYXRlTGFiZWwgb2YgZHVwbGljYXRlTGFiZWxzKSB7XG5cdFx0XHRcdFx0ZHVwbGljYXRlTGFiZWwuZGVzY3JpcHRpb24gPSBkdXBsaWNhdGVMYWJlbC5lZGl0b3IuZ2V0RGVzY3JpcHRpb24oVmVyYm9zaXR5LkxPTkcpO1xuXHRcdFx0XHRcdGdldE9yU2V0KG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzLCBkdXBsaWNhdGVMYWJlbC5kZXNjcmlwdGlvbiwgW10pLnB1c2goZHVwbGljYXRlTGFiZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9idGFpbiBmaW5hbCBzZXQgb2YgZGVzY3JpcHRpb25zXG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFtkZXNjcmlwdGlvbl0gb2YgbWFwRGVzY3JpcHRpb25Ub0R1cGxpY2F0ZXMpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25zLnB1c2goZGVzY3JpcHRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgZGVzY3JpcHRpb24gaWYgYWxsIGRlc2NyaXB0aW9ucyBhcmUgaWRlbnRpY2FsIHVubGVzcyBmb3JjZWRcblx0XHRcdGlmIChkZXNjcmlwdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbGFiZWwgb2YgbWFwRGVzY3JpcHRpb25Ub0R1cGxpY2F0ZXMuZ2V0KGRlc2NyaXB0aW9uc1swXSkgfHwgW10pIHtcblx0XHRcdFx0XHRpZiAoIWxhYmVsLmZvcmNlRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdGxhYmVsLmRlc2NyaXB0aW9uID0gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNob3J0ZW4gZGVzY3JpcHRpb25zXG5cdFx0XHRjb25zdCBzaG9ydGVuZWREZXNjcmlwdGlvbnMgPSBzaG9ydGVuKGRlc2NyaXB0aW9ucywgdGhpcy5wYXRoLnNlcCk7XG5cdFx0XHRkZXNjcmlwdGlvbnMuZm9yRWFjaCgoZGVzY3JpcHRpb24sIHRhYkluZGV4KSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgbGFiZWwgb2YgbWFwRGVzY3JpcHRpb25Ub0R1cGxpY2F0ZXMuZ2V0KGRlc2NyaXB0aW9uKSB8fCBbXSkge1xuXHRcdFx0XHRcdGxhYmVsLmRlc2NyaXB0aW9uID0gc2hvcnRlbmVkRGVzY3JpcHRpb25zW3RhYkluZGV4XTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYWJlbENvbmZpZ0ZsYWdzKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlICdzaG9ydCc6XG5cdFx0XHRcdHJldHVybiB7IHZlcmJvc2l0eTogVmVyYm9zaXR5LlNIT1JULCBzaG9ydGVuRHVwbGljYXRlczogZmFsc2UgfTtcblx0XHRcdGNhc2UgJ21lZGl1bSc6XG5cdFx0XHRcdHJldHVybiB7IHZlcmJvc2l0eTogVmVyYm9zaXR5Lk1FRElVTSwgc2hvcnRlbkR1cGxpY2F0ZXM6IGZhbHNlIH07XG5cdFx0XHRjYXNlICdsb25nJzpcblx0XHRcdFx0cmV0dXJuIHsgdmVyYm9zaXR5OiBWZXJib3NpdHkuTE9ORywgc2hvcnRlbkR1cGxpY2F0ZXM6IGZhbHNlIH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4geyB2ZXJib3NpdHk6IFZlcmJvc2l0eS5NRURJVU0sIHNob3J0ZW5EdXBsaWNhdGVzOiB0cnVlIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWRyYXcob3B0aW9ucz86IElNdWx0aUVkaXRvclRhYnNDb250cm9sTGF5b3V0T3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gQm9yZGVyIGJlbG93IHRhYnMgaWYgYW55IHdpdGggZXhwbGljaXQgaGlnaCBjb250cmFzdCBzdXBwb3J0XG5cdFx0aWYgKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIpIHtcblx0XHRcdGxldCB0YWJzQ29udGFpbmVyQm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKEVESVRPUl9HUk9VUF9IRUFERVJfVEFCU19CT1JERVIpO1xuXHRcdFx0aWYgKCF0YWJzQ29udGFpbmVyQm9yZGVyQ29sb3IgJiYgaXNIaWdoQ29udHJhc3QodGhpcy50aGVtZS50eXBlKSkge1xuXHRcdFx0XHR0YWJzQ29udGFpbmVyQm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKFRBQl9CT1JERVIpIHx8IHRoaXMuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGFic0NvbnRhaW5lckJvcmRlckNvbG9yKSB7XG5cdFx0XHRcdHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGFicy1ib3JkZXItYm90dG9tJyk7XG5cdFx0XHRcdHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdGFicy1ib3JkZXItYm90dG9tLWNvbG9yJywgdGFic0NvbnRhaW5lckJvcmRlckNvbG9yLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50YWJzQW5kQWN0aW9uc0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCd0YWJzLWJvcmRlci1ib3R0b20nKTtcblx0XHRcdFx0dGhpcy50YWJzQW5kQWN0aW9uc0NvbnRhaW5lci5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS10YWJzLWJvcmRlci1ib3R0b20tY29sb3InKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGb3IgZWFjaCB0YWJcblx0XHR0aGlzLmZvckVhY2hUYWIoKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIEVkaXRvciBBY3Rpb25zIFRvb2xiYXJcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbnNUb29sYmFyKCk7XG5cblx0XHQvLyBFbnN1cmUgdGhlIGFjdGl2ZSB0YWIgaXMgYWx3YXlzIHJldmVhbGVkXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zLCBvcHRpb25zKTtcblx0fVxuXG5cdC8vIFNwbGl0IG91dCBmcm9tIHJlZHJhd1RhYigpIHNvIHVwZGF0ZVRhYkFjdGlvbnNGb3JBbHRTdGF0ZSgpIGNhbiByZWZyZXNoIGp1c3QgdGhlIGFjdGlvbiBpdGVtcywgbm90IGEgZnVsbCB0YWIgYmFyIHJlZHJhdy5cblx0cHJpdmF0ZSByZWRyYXdUYWJBY3Rpb24oZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlciwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFiQWN0aW9uQmFyOiBBY3Rpb25CYXIpOiB2b2lkIHtcblx0XHRjb25zdCBpc1RhYlN0aWNreSA9IHRoaXMudGFic01vZGVsLmlzU3RpY2t5KHRhYkluZGV4KTtcblx0XHRjb25zdCBpc0Nsb3NlYWJsZSA9ICFlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5ub3RDbG9zZSk7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucztcblxuXHRcdGNvbnN0IGhhc1VucGluQWN0aW9uID0gaXNUYWJTdGlja3kgJiYgb3B0aW9ucy50YWJBY3Rpb25VbnBpblZpc2liaWxpdHk7XG5cdFx0Y29uc3QgaGFzQ2xvc2VBY3Rpb24gPSBpc0Nsb3NlYWJsZSAmJiAhaGFzVW5waW5BY3Rpb24gJiYgb3B0aW9ucy50YWJBY3Rpb25DbG9zZVZpc2liaWxpdHk7XG5cdFx0Y29uc3QgaGFzQWN0aW9uID0gaGFzVW5waW5BY3Rpb24gfHwgaGFzQ2xvc2VBY3Rpb247XG5cblx0XHQvLyBBbHQgc3dhcHMgYSB2aXNpYmxlIENsb3NlIGFjdGlvbiB0byBDbG9zZSBPdGhlcnM7IFVucGluIGlzIHVuYWZmZWN0ZWQuXG5cdFx0Y29uc3Qgd2FudHNDbG9zZU90aGVyc0FjdGlvbiA9IGhhc0Nsb3NlQWN0aW9uICYmIHRoaXMud2FudHNDbG9zZU90aGVyc0FjdGlvbjtcblxuXHRcdGxldCB0YWJBY3Rpb247XG5cdFx0aWYgKGhhc0FjdGlvbikge1xuXHRcdFx0dGFiQWN0aW9uID0gaGFzVW5waW5BY3Rpb24gPyB0aGlzLnVucGluRWRpdG9yQWN0aW9uIDogd2FudHNDbG9zZU90aGVyc0FjdGlvbiA/IHRoaXMuY2xvc2VPdGhlckVkaXRvclRhYnNJbkdyb3VwQWN0aW9uIDogdGhpcy5jbG9zZUVkaXRvckFjdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRXZlbiBpZiB0aGUgYWN0aW9uIGlzIG5vdCB2aXNpYmxlLCBhZGQgaXQgYXMgaXQgY29udGFpbnMgdGhlIGRpcnR5IGluZGljYXRvclxuXHRcdFx0dGFiQWN0aW9uID0gaXNUYWJTdGlja3kgPyB0aGlzLnVucGluRWRpdG9yQWN0aW9uIDogdGhpcy5jbG9zZUVkaXRvckFjdGlvbjtcblx0XHR9XG5cblx0XHRpZiAoIXRhYkFjdGlvbkJhci5oYXNBY3Rpb24odGFiQWN0aW9uKSkge1xuXHRcdFx0aWYgKCF0YWJBY3Rpb25CYXIuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHRhYkFjdGlvbkJhci5jbGVhcigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbG9zZSBPdGhlcnMgaGFzIG5vIHJlYWwga2V5YmluZGluZyB0byBsb29rIHVwOyBoaW50IGF0IHRoZSBnZXN0dXJlIHRoYXQgdHJpZ2dlcnMgaXQgaW5zdGVhZC5cblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0YWJBY3Rpb24gPT09IHRoaXMuY2xvc2VPdGhlckVkaXRvclRhYnNJbkdyb3VwQWN0aW9uID8gKGlzTWFjaW50b3NoID8gbG9jYWxpemUoJ2FsdENsaWNrTWFjJywgXCJcdTIzMjUrQ2xpY2tcIikgOiBsb2NhbGl6ZSgnYWx0Q2xpY2snLCBcIkFsdCtDbGlja1wiKSkgOiB0aGlzLmdldEtleWJpbmRpbmdMYWJlbCh0YWJBY3Rpb24pO1xuXHRcdFx0dGFiQWN0aW9uQmFyLnB1c2godGFiQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZyB9KTtcblx0XHR9XG5cblx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShgcGlubmVkLWFjdGlvbi1vZmZgLCBpc1RhYlN0aWNreSAmJiAhaGFzVW5waW5BY3Rpb24pO1xuXHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKGBjbG9zZS1hY3Rpb24tb2ZmYCwgIWhhc1VucGluQWN0aW9uICYmICFoYXNDbG9zZUFjdGlvbik7XG5cdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Nhbm5vdC1jbG9zZScsICFpc0Nsb3NlYWJsZSk7XG5cblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBbJ2xlZnQnLCAncmlnaHQnXSkge1xuXHRcdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoYHRhYi1hY3Rpb25zLSR7b3B0aW9ufWAsIGhhc0FjdGlvbiAmJiBvcHRpb25zLnRhYkFjdGlvbkxvY2F0aW9uID09PSBvcHRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVkcmF3VGFiKGVkaXRvcjogRWRpdG9ySW5wdXQsIHRhYkluZGV4OiBudW1iZXIsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYkxhYmVsV2lkZ2V0OiBJUmVzb3VyY2VMYWJlbCwgdGFiTGFiZWw6IElFZGl0b3JJbnB1dExhYmVsLCB0YWJBY3Rpb25CYXI6IEFjdGlvbkJhcik6IHZvaWQge1xuXHRcdGNvbnN0IGlzVGFiU3RpY2t5ID0gdGhpcy50YWJzTW9kZWwuaXNTdGlja3kodGFiSW5kZXgpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnM7XG5cblx0XHQvLyBMYWJlbFxuXHRcdHRoaXMucmVkcmF3VGFiTGFiZWwoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpO1xuXG5cdFx0Ly8gQWN0aW9uXG5cdFx0dGhpcy5yZWRyYXdUYWJBY3Rpb24oZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJBY3Rpb25CYXIpO1xuXG5cdFx0Y29uc3QgdGFiU2l6aW5nID0gaXNUYWJTdGlja3kgJiYgb3B0aW9ucy5waW5uZWRUYWJTaXppbmcgPT09ICdzaHJpbmsnID8gJ3NocmluaycgLyogdHJlYXQgc3RpY2t5IHNocmluayB0YWJzIGFzIHRhYlNpemluZzogJ3NocmluaycgKi8gOiBvcHRpb25zLnRhYlNpemluZztcblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBbJ2ZpdCcsICdzaHJpbmsnLCAnZml4ZWQnXSkge1xuXHRcdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoYHNpemluZy0ke29wdGlvbn1gLCB0YWJTaXppbmcgPT09IG9wdGlvbik7XG5cdFx0fVxuXG5cdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1pY29uJywgb3B0aW9ucy5zaG93SWNvbnMgJiYgb3B0aW9ucy5oYXNJY29ucyk7XG5cblx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc3RpY2t5JywgaXNUYWJTdGlja3kpO1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIFsnbm9ybWFsJywgJ2NvbXBhY3QnLCAnc2hyaW5rJ10pIHtcblx0XHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKGBzdGlja3ktJHtvcHRpb259YCwgaXNUYWJTdGlja3kgJiYgb3B0aW9ucy5waW5uZWRUYWJTaXppbmcgPT09IG9wdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgbm90IHdyYXBwaW5nIHRhYnMsIHN0aWNreSBjb21wYWN0L3NocmluayB0YWJzIG5lZWQgYSBwb3NpdGlvbiB0byByZW1haW4gYXQgdGhlaXIgbG9jYXRpb25cblx0XHQvLyB3aGVuIHNjcm9sbGluZyB0byBzdGF5IGluIHZpZXcgKHJlcXVpcmVtZW50IGZvciBwb3NpdGlvbjogc3RpY2t5KVxuXHRcdGlmICghb3B0aW9ucy53cmFwVGFicyAmJiBpc1RhYlN0aWNreSAmJiBvcHRpb25zLnBpbm5lZFRhYlNpemluZyAhPT0gJ25vcm1hbCcpIHtcblx0XHRcdHRhYkNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYCR7dGFiSW5kZXggKiB0aGlzLmdldFN0aWNreVRhYldpZHRoKG9wdGlvbnMucGlubmVkVGFiU2l6aW5nKX1weGA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhYkNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gJ2F1dG8nO1xuXHRcdH1cblxuXHRcdC8vIEJvcmRlcnMgLyBvdXRsaW5lXG5cdFx0dGhpcy5yZWRyYXdUYWJCb3JkZXJzKHRhYkluZGV4LCB0YWJDb250YWluZXIpO1xuXG5cdFx0Ly8gU2VsZWN0aW9uIC8gYWN0aXZlIC8gZGlydHkgc3RhdGVcblx0XHR0aGlzLnJlZHJhd1RhYlNlbGVjdGVkQWN0aXZlQW5kRGlydHkodGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldywgZWRpdG9yLCB0YWJDb250YWluZXIsIHRhYkFjdGlvbkJhcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZHJhd1RhYkxhYmVsKGVkaXRvcjogRWRpdG9ySW5wdXQsIHRhYkluZGV4OiBudW1iZXIsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYkxhYmVsV2lkZ2V0OiBJUmVzb3VyY2VMYWJlbCwgdGFiTGFiZWw6IElFZGl0b3JJbnB1dExhYmVsKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucztcblxuXHRcdC8vIFVubGVzcyB0YWJzIGFyZSBzdGlja3kgY29tcGFjdCwgc2hvdyB0aGUgZnVsbCBsYWJlbCBhbmQgZGVzY3JpcHRpb25cblx0XHQvLyBTdGlja3kgY29tcGFjdCB0YWJzIHdpbGwgb25seSBzaG93IGFuIGljb24gaWYgaWNvbnMgYXJlIGVuYWJsZWRcblx0XHQvLyBvciB0aGVpciBmaXJzdCBjaGFyYWN0ZXIgb2YgdGhlIG5hbWUgb3RoZXJ3aXNlXG5cdFx0bGV0IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbmFtZVByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBmb3JjZUxhYmVsID0gZmFsc2U7XG5cdFx0bGV0IGZpbGVEZWNvcmF0aW9uQmFkZ2VzID0gQm9vbGVhbihvcHRpb25zLmRlY29yYXRpb25zPy5iYWRnZXMpO1xuXHRcdGNvbnN0IGZpbGVEZWNvcmF0aW9uQ29sb3JzID0gQm9vbGVhbihvcHRpb25zLmRlY29yYXRpb25zPy5jb2xvcnMpO1xuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdGlmIChvcHRpb25zLnBpbm5lZFRhYlNpemluZyA9PT0gJ2NvbXBhY3QnICYmIHRoaXMudGFic01vZGVsLmlzU3RpY2t5KHRhYkluZGV4KSkge1xuXHRcdFx0Y29uc3QgaXNTaG93aW5nSWNvbnMgPSBvcHRpb25zLnNob3dJY29ucyAmJiBvcHRpb25zLmhhc0ljb25zO1xuXHRcdFx0bmFtZSA9IGlzU2hvd2luZ0ljb25zID8gJycgOiB0YWJMYWJlbC5uYW1lPy5jaGFyQXQoMCkudG9VcHBlckNhc2UoKTtcblx0XHRcdGRlc2NyaXB0aW9uID0gJyc7XG5cdFx0XHRmb3JjZUxhYmVsID0gdHJ1ZTtcblx0XHRcdGZpbGVEZWNvcmF0aW9uQmFkZ2VzID0gZmFsc2U7IC8vIG5vdCBlbm91Z2ggc3BhY2Ugd2hlbiBzdGlja3kgdGFicyBhcmUgY29tcGFjdFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRuYW1lID0gdGFiTGFiZWwubmFtZTtcblx0XHRcdG5hbWVQcmVmaXggPSBvcHRpb25zLnNob3dUYWJJbmRleCA/IGAke3RoaXMudG9FZGl0b3JJbmRleCh0YWJJbmRleCkgKyAxfTogYCA6IHVuZGVmaW5lZDtcblx0XHRcdGRlc2NyaXB0aW9uID0gdGFiTGFiZWwuZGVzY3JpcHRpb24gfHwgJyc7XG5cdFx0fVxuXG5cdFx0aWYgKHRhYkxhYmVsLmFyaWFMYWJlbCkge1xuXHRcdFx0dGFiQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRhYkxhYmVsLmFyaWFMYWJlbCk7XG5cdFx0XHQvLyBTZXQgYXJpYS1kZXNjcmlwdGlvbiB0byBlbXB0eSBzdHJpbmcgc28gdGhhdCBzY3JlZW4gcmVhZGVycyB3b3VsZCBub3QgcmVhZCB0aGUgdGl0bGUgYXMgd2VsbFxuXHRcdFx0Ly8gTW9yZSBkZXRhaWxzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85NTM3OFxuXHRcdFx0dGFiQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmlwdGlvbicsICcnKTtcblx0XHR9XG5cblx0XHQvLyBMYWJlbFxuXHRcdHRhYkxhYmVsV2lkZ2V0LnNldFJlc291cmNlKFxuXHRcdFx0eyBuYW1lLCBkZXNjcmlwdGlvbiwgcmVzb3VyY2U6IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSkgfSxcblx0XHRcdHtcblx0XHRcdFx0dGl0bGU6IHRoaXMuZ2V0SG92ZXJUaXRsZShlZGl0b3IpLFxuXHRcdFx0XHRleHRyYUNsYXNzZXM6IGNvYWxlc2NlKFsndGFiLWxhYmVsJywgZmlsZURlY29yYXRpb25CYWRnZXMgPyAndGFiLWxhYmVsLWhhcy1iYWRnZScgOiB1bmRlZmluZWRdLmNvbmNhdChlZGl0b3IuZ2V0TGFiZWxFeHRyYUNsYXNzZXMoKSkpLFxuXHRcdFx0XHRpdGFsaWM6ICF0aGlzLnRhYnNNb2RlbC5pc1Bpbm5lZChlZGl0b3IpLFxuXHRcdFx0XHRmb3JjZUxhYmVsLFxuXHRcdFx0XHRmaWxlRGVjb3JhdGlvbnM6IHtcblx0XHRcdFx0XHRjb2xvcnM6IGZpbGVEZWNvcmF0aW9uQ29sb3JzLFxuXHRcdFx0XHRcdGJhZGdlczogZmlsZURlY29yYXRpb25CYWRnZXNcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjogZWRpdG9yLmdldEljb24oKSxcblx0XHRcdFx0aGlkZUljb246IG9wdGlvbnMuc2hvd0ljb25zID09PSBmYWxzZSxcblx0XHRcdFx0bmFtZVByZWZpeCxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gVGVzdHMgaGVscGVyXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0dGFiQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnZGF0YS1yZXNvdXJjZS1uYW1lJywgYmFzZW5hbWVPckF1dGhvcml0eShyZXNvdXJjZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YWJDb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdkYXRhLXJlc291cmNlLW5hbWUnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZHJhd1RhYlNlbGVjdGVkQWN0aXZlQW5kRGlydHkoaXNHcm91cEFjdGl2ZTogYm9vbGVhbiwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFiQWN0aW9uQmFyOiBBY3Rpb25CYXIpOiB2b2lkIHtcblx0XHRjb25zdCBpc1RhYkFjdGl2ZSA9IHRoaXMudGFic01vZGVsLmlzQWN0aXZlKGVkaXRvcik7XG5cdFx0Y29uc3QgaGFzTW9kaWZpZWRCb3JkZXJUb3AgPSB0aGlzLmRvUmVkcmF3VGFiRGlydHkoaXNHcm91cEFjdGl2ZSwgaXNUYWJBY3RpdmUsIGVkaXRvciwgdGFiQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuZG9SZWRyYXdUYWJBY3RpdmUoaXNHcm91cEFjdGl2ZSwgIWhhc01vZGlmaWVkQm9yZGVyVG9wLCBlZGl0b3IsIHRhYkNvbnRhaW5lciwgdGFiQWN0aW9uQmFyKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZWRyYXdUYWJBY3RpdmUoaXNHcm91cEFjdGl2ZTogYm9vbGVhbiwgYWxsb3dCb3JkZXJUb3A6IGJvb2xlYW4sIGVkaXRvcjogRWRpdG9ySW5wdXQsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYkFjdGlvbkJhcjogQWN0aW9uQmFyKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNBY3RpdmUgPSB0aGlzLnRhYnNNb2RlbC5pc0FjdGl2ZShlZGl0b3IpO1xuXHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSB0aGlzLnRhYnNNb2RlbC5pc1NlbGVjdGVkKGVkaXRvcik7XG5cblx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3RlZCcsIGlzU2VsZWN0ZWQpO1xuXHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdtdWx0aS1zZWxlY3RlZCcsIGlzU2VsZWN0ZWQgJiYgdGhpcy5ncm91cFZpZXcuc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCA+IDEpO1xuXHRcdHRhYkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCBpc1NlbGVjdGVkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0dGFiQ29udGFpbmVyLnRhYkluZGV4ID0gaXNBY3RpdmUgPyAwIDogLTE7IC8vIE9ubHkgYWN0aXZlIHRhYiBjYW4gYmUgZm9jdXNlZCBpbnRvXG5cdFx0dGFiQWN0aW9uQmFyLnNldEZvY3VzYWJsZShpc0FjdGl2ZSk7XG5cblx0XHQvLyBTZXQgYm9yZGVyIEJPVFRPTSBpZiB0aGVtZSBkZWZpbmVkIGNvbG9yXG5cdFx0aWYgKGlzQWN0aXZlKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVUYWJCb3JkZXJDb2xvckJvdHRvbSA9IHRoaXMuZ2V0Q29sb3IoaXNHcm91cEFjdGl2ZSA/IFRBQl9BQ1RJVkVfQk9SREVSIDogVEFCX1VORk9DVVNFRF9BQ1RJVkVfQk9SREVSKTtcblx0XHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0YWItYm9yZGVyLWJvdHRvbScsICEhYWN0aXZlVGFiQm9yZGVyQ29sb3JCb3R0b20pO1xuXHRcdFx0dGFiQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRhYi1ib3JkZXItYm90dG9tLWNvbG9yJywgYWN0aXZlVGFiQm9yZGVyQ29sb3JCb3R0b20gPz8gJycpO1xuXHRcdH1cblxuXHRcdC8vIFNldCBib3JkZXIgVE9QIGlmIHRoZW1lIGRlZmluZWQgY29sb3Jcblx0XHRsZXQgdGFiQm9yZGVyQ29sb3JUb3A6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChhbGxvd0JvcmRlclRvcCkge1xuXHRcdFx0aWYgKGlzQWN0aXZlKSB7XG5cdFx0XHRcdHRhYkJvcmRlckNvbG9yVG9wID0gdGhpcy5nZXRDb2xvcihpc0dyb3VwQWN0aXZlID8gVEFCX0FDVElWRV9CT1JERVJfVE9QIDogVEFCX1VORk9DVVNFRF9BQ1RJVkVfQk9SREVSX1RPUCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0YWJCb3JkZXJDb2xvclRvcCA9PT0gbnVsbCAmJiBpc1NlbGVjdGVkKSB7XG5cdFx0XHRcdHRhYkJvcmRlckNvbG9yVG9wID0gdGhpcy5nZXRDb2xvcihUQUJfU0VMRUNURURfQk9SREVSX1RPUCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3RhYi1ib3JkZXItdG9wJywgISF0YWJCb3JkZXJDb2xvclRvcCk7XG5cdFx0dGFiQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRhYi1ib3JkZXItdG9wLWNvbG9yJywgdGFiQm9yZGVyQ29sb3JUb3AgPz8gJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlZHJhd1RhYkRpcnR5KGlzR3JvdXBBY3RpdmU6IGJvb2xlYW4sIGlzVGFiQWN0aXZlOiBib29sZWFuLCBlZGl0b3I6IEVkaXRvcklucHV0LCB0YWJDb250YWluZXI6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0bGV0IGhhc01vZGlmaWVkQm9yZGVyQ29sb3IgPSBmYWxzZTtcblxuXHRcdC8vIFRhYjogZGlydHkgKHVubGVzcyBzYXZpbmcpXG5cdFx0aWYgKGVkaXRvci5pc0RpcnR5KCkgJiYgIWVkaXRvci5pc1NhdmluZygpKSB7XG5cdFx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlydHknKTtcblxuXHRcdFx0Ly8gSGlnaGxpZ2h0IG1vZGlmaWVkIHRhYnMgd2l0aCBhIGJvcmRlciBpZiBjb25maWd1cmVkXG5cdFx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmhpZ2hsaWdodE1vZGlmaWVkVGFicykge1xuXHRcdFx0XHRsZXQgbW9kaWZpZWRCb3JkZXJDb2xvcjogc3RyaW5nIHwgbnVsbDtcblx0XHRcdFx0aWYgKGlzR3JvdXBBY3RpdmUgJiYgaXNUYWJBY3RpdmUpIHtcblx0XHRcdFx0XHRtb2RpZmllZEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihUQUJfQUNUSVZFX01PRElGSUVEX0JPUkRFUik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNHcm91cEFjdGl2ZSAmJiAhaXNUYWJBY3RpdmUpIHtcblx0XHRcdFx0XHRtb2RpZmllZEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihUQUJfSU5BQ1RJVkVfTU9ESUZJRURfQk9SREVSKTtcblx0XHRcdFx0fSBlbHNlIGlmICghaXNHcm91cEFjdGl2ZSAmJiBpc1RhYkFjdGl2ZSkge1xuXHRcdFx0XHRcdG1vZGlmaWVkQm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfQUNUSVZFX01PRElGSUVEX0JPUkRFUik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bW9kaWZpZWRCb3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoVEFCX1VORk9DVVNFRF9JTkFDVElWRV9NT0RJRklFRF9CT1JERVIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1vZGlmaWVkQm9yZGVyQ29sb3IpIHtcblx0XHRcdFx0XHRoYXNNb2RpZmllZEJvcmRlckNvbG9yID0gdHJ1ZTtcblxuXHRcdFx0XHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkaXJ0eS1ib3JkZXItdG9wJyk7XG5cdFx0XHRcdFx0dGFiQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRhYi1kaXJ0eS1ib3JkZXItdG9wLWNvbG9yJywgbW9kaWZpZWRCb3JkZXJDb2xvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdkaXJ0eS1ib3JkZXItdG9wJyk7XG5cdFx0XHRcdHRhYkNvbnRhaW5lci5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS10YWItZGlydHktYm9yZGVyLXRvcC1jb2xvcicpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRhYjogbm90IGRpcnR5XG5cdFx0ZWxzZSB7XG5cdFx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZGlydHknLCAnZGlydHktYm9yZGVyLXRvcCcpO1xuXHRcdFx0dGFiQ29udGFpbmVyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCctLXRhYi1kaXJ0eS1ib3JkZXItdG9wLWNvbG9yJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhc01vZGlmaWVkQm9yZGVyQ29sb3I7XG5cdH1cblxuXHRwcml2YXRlIHJlZHJhd1RhYkJvcmRlcnModGFiSW5kZXg6IG51bWJlciwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzVGFiU3RpY2t5ID0gdGhpcy50YWJzTW9kZWwuaXNTdGlja3kodGFiSW5kZXgpO1xuXHRcdGNvbnN0IGlzVGFiTGFzdFN0aWNreSA9IGlzVGFiU3RpY2t5ICYmIHRoaXMudGFic01vZGVsLnN0aWNreUNvdW50ID09PSB0YWJJbmRleCArIDE7XG5cdFx0Y29uc3Qgc2hvd0xhc3RTdGlja3lUYWJCb3JkZXJDb2xvciA9IHRoaXMudGFic01vZGVsLnN0aWNreUNvdW50ICE9PSB0aGlzLnRhYnNNb2RlbC5jb3VudDtcblxuXHRcdC8vIEJvcmRlcnMgLyBPdXRsaW5lXG5cdFx0Y29uc3QgYm9yZGVyUmlnaHRDb2xvciA9ICgoaXNUYWJMYXN0U3RpY2t5ICYmIHNob3dMYXN0U3RpY2t5VGFiQm9yZGVyQ29sb3IgPyB0aGlzLmdldENvbG9yKFRBQl9MQVNUX1BJTk5FRF9CT1JERVIpIDogdW5kZWZpbmVkKSB8fCB0aGlzLmdldENvbG9yKFRBQl9CT1JERVIpIHx8IHRoaXMuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpKTtcblx0XHR0YWJDb250YWluZXIuc3R5bGUuYm9yZGVyUmlnaHQgPSBib3JkZXJSaWdodENvbG9yID8gYDFweCBzb2xpZCAke2JvcmRlclJpZ2h0Q29sb3J9YCA6ICcnO1xuXHRcdHRhYkNvbnRhaW5lci5zdHlsZS5vdXRsaW5lQ29sb3IgPSB0aGlzLmdldENvbG9yKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyKSB8fCAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBwcmVwYXJlRWRpdG9yQWN0aW9ucyhlZGl0b3JBY3Rpb25zOiBJVG9vbGJhckFjdGlvbnMpOiBJVG9vbGJhckFjdGlvbnMge1xuXHRcdGNvbnN0IGlzR3JvdXBBY3RpdmUgPSB0aGlzLmdyb3Vwc1ZpZXcuYWN0aXZlR3JvdXAgPT09IHRoaXMuZ3JvdXBWaWV3O1xuXG5cdFx0Ly8gQWN0aXZlOiBhbGxvdyBhbGwgYWN0aW9uc1xuXHRcdGlmIChpc0dyb3VwQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yQWN0aW9ucztcblx0XHR9XG5cblx0XHQvLyBJbmFjdGl2ZTogb25seSBzaG93IFwiVW5sb2NrXCIgYW5kIHNlY29uZGFyeSBhY3Rpb25zXG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwcmltYXJ5OiB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMuYWx3YXlzU2hvd0VkaXRvckFjdGlvbnMgPyBlZGl0b3JBY3Rpb25zLnByaW1hcnkgOiBlZGl0b3JBY3Rpb25zLnByaW1hcnkuZmlsdGVyKGFjdGlvbiA9PiBhY3Rpb24uaWQgPT09IFVOTE9DS19HUk9VUF9DT01NQU5EX0lEKSxcblx0XHRcdFx0c2Vjb25kYXJ5OiBlZGl0b3JBY3Rpb25zLnNlY29uZGFyeVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcHJlcGFyZUVkaXRvckxheW91dEFjdGlvbnMoZWRpdG9yQWN0aW9uczogSVRvb2xiYXJBY3Rpb25zKTogSVRvb2xiYXJBY3Rpb25zIHtcblx0XHRyZXR1cm4gZWRpdG9yQWN0aW9ucztcblx0fVxuXG5cdGdldEhlaWdodCgpOiBudW1iZXIge1xuXG5cdFx0Ly8gUmV0dXJuIHF1aWNrbHkgaWYgb3VyIHVzZWQgZGltZW5zaW9ucyBhcmUga25vd25cblx0XHRpZiAodGhpcy5kaW1lbnNpb25zLnVzZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmRpbWVuc2lvbnMudXNlZC5oZWlnaHQ7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGNvbXB1dGUgdmlhIGJyb3dzZXIgQVBJc1xuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29tcHV0ZUhlaWdodCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUhlaWdodCgpOiBudW1iZXIge1xuXHRcdGxldCBoZWlnaHQ6IG51bWJlcjtcblxuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRoZWlnaHQgPSAwO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLndyYXBUYWJzICYmIHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXI/LmNsYXNzTGlzdC5jb250YWlucygnd3JhcHBpbmcnKSkge1xuXHRcdFx0Ly8gV3JhcDogd2UgbmVlZCB0byBhc2sgYG9mZnNldEhlaWdodGAgdG8gZ2V0XG5cdFx0XHQvLyB0aGUgcmVhbCBoZWlnaHQgb2YgdGhlIHRpdGxlIGFyZWEgd2l0aCB3cmFwcGluZy5cblx0XHRcdGhlaWdodCA9IHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoZWlnaHQgPSB0aGlzLnRhYkhlaWdodDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaGVpZ2h0O1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbnM6IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zLCBvcHRpb25zPzogSU11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXRPcHRpb25zKTogRGltZW5zaW9uIHtcblxuXHRcdC8vIFJlbWVtYmVyIGRpbWVuc2lvbnMgdGhhdCB3ZSBnZXRcblx0XHRPYmplY3QuYXNzaWduKHRoaXMuZGltZW5zaW9ucywgZGltZW5zaW9ucyk7XG5cblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRpZiAoIXRoaXMubGF5b3V0U2NoZWR1bGVyLnZhbHVlKSB7XG5cblx0XHRcdFx0Ly8gVGhlIGxheW91dCBvZiB0YWJzIGNhbiBiZSBhbiBleHBlbnNpdmUgb3BlcmF0aW9uIGJlY2F1c2Ugd2UgYWNjZXNzIERPTSBwcm9wZXJ0aWVzXG5cdFx0XHRcdC8vIHRoYXQgY2FuIHJlc3VsdCBpbiB0aGUgYnJvd3NlciBkb2luZyBhIGZ1bGwgcGFnZSBsYXlvdXQgdG8gdmFsaWRhdGUgdGhlbS4gVG8gYnVmZmVyXG5cdFx0XHRcdC8vIHRoaXMgYSBsaXR0bGUgYml0IHdlIHRyeSBhdCBsZWFzdCB0byBzY2hlZHVsZSB0aGlzIHdvcmsgb24gdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lXG5cdFx0XHRcdC8vIHdoZW4gd2UgaGF2ZSByZXN0b3JlZCBvciB3aGVuIGlkbGUgb3RoZXJ3aXNlLlxuXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLnBhcmVudCksICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmRvTGF5b3V0KHRoaXMuZGltZW5zaW9ucywgdGhpcy5sYXlvdXRTY2hlZHVsZXIudmFsdWU/Lm9wdGlvbnMgLyogZW5zdXJlIHRvIHBpY2sgdXAgbGF0ZXN0IG9wdGlvbnMgKi8pO1xuXG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuY2xlYXIoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMubGF5b3V0U2NoZWR1bGVyLnZhbHVlID0geyBvcHRpb25zLCBkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdG8ga2VlcCBvcHRpb25zIHVwZGF0ZWRcblx0XHRcdGlmIChvcHRpb25zPy5mb3JjZVJldmVhbEFjdGl2ZVRhYikge1xuXHRcdFx0XHR0aGlzLmxheW91dFNjaGVkdWxlci52YWx1ZS5vcHRpb25zID0ge1xuXHRcdFx0XHRcdC4uLnRoaXMubGF5b3V0U2NoZWR1bGVyLnZhbHVlLm9wdGlvbnMsXG5cdFx0XHRcdFx0Zm9yY2VSZXZlYWxBY3RpdmVUYWI6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaXJzdCB0aW1lIGxheW91dDogY29tcHV0ZSB0aGUgZGltZW5zaW9ucyBhbmQgc3RvcmUgaXRcblx0XHRpZiAoIXRoaXMuZGltZW5zaW9ucy51c2VkKSB7XG5cdFx0XHR0aGlzLmRpbWVuc2lvbnMudXNlZCA9IG5ldyBEaW1lbnNpb24oZGltZW5zaW9ucy5jb250YWluZXIud2lkdGgsIHRoaXMuY29tcHV0ZUhlaWdodCgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kaW1lbnNpb25zLnVzZWQ7XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0KGRpbWVuc2lvbnM6IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zLCBvcHRpb25zPzogSU11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXRPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBMYXlvdXQgdGFic1xuXHRcdGlmIChkaW1lbnNpb25zLmNvbnRhaW5lciAhPT0gRGltZW5zaW9uLk5vbmUgJiYgZGltZW5zaW9ucy5hdmFpbGFibGUgIT09IERpbWVuc2lvbi5Ob25lKSB7XG5cdFx0XHR0aGlzLmRvTGF5b3V0VGFicyhkaW1lbnNpb25zLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciB0aGUgZGltZW5zaW9ucyB1c2VkIGluIHRoZSBjb250cm9sIHNvIHRoYXQgd2UgY2FuXG5cdFx0Ly8gcmV0dXJuIGl0IGZhc3QgZnJvbSB0aGUgYGxheW91dGAgY2FsbCB3aXRob3V0IGhhdmluZyB0b1xuXHRcdC8vIGNvbXB1dGUgaXQgb3ZlciBhbmQgb3ZlciBhZ2FpblxuXHRcdGNvbnN0IG9sZERpbWVuc2lvbiA9IHRoaXMuZGltZW5zaW9ucy51c2VkO1xuXHRcdGNvbnN0IG5ld0RpbWVuc2lvbiA9IHRoaXMuZGltZW5zaW9ucy51c2VkID0gbmV3IERpbWVuc2lvbihkaW1lbnNpb25zLmNvbnRhaW5lci53aWR0aCwgdGhpcy5jb21wdXRlSGVpZ2h0KCkpO1xuXG5cdFx0Ly8gSW4gY2FzZSB0aGUgaGVpZ2h0IG9mIHRoZSB0aXRsZSBjb250cm9sIGNoYW5nZWQgZnJvbSBiZWZvcmVcblx0XHQvLyAoZS5nLiB3aGVuIHdyYXBwaW5nIHRvZ2dsZXMgb24vb2ZmIG9yIHRoZSB0YWIgaGVpZ2h0IHNldHRpbmcgY2hhbmdlcyksXG5cdFx0Ly8gd2UgbmVlZCB0byBzaWduYWwgdGhpcyB0byB0aGUgb3V0c2lkZSB2aWEgYSBgcmVsYXlvdXRgIGNhbGwgc28gdGhhdFxuXHRcdC8vIGUuZy4gdGhlIGVkaXRvciBjb250cm9sIGNhbiBiZSBhZGp1c3RlZCBhY2NvcmRpbmdseS5cblx0XHRpZiAob2xkRGltZW5zaW9uICYmIG9sZERpbWVuc2lvbi5oZWlnaHQgIT09IG5ld0RpbWVuc2lvbi5oZWlnaHQpIHtcblx0XHRcdHRoaXMuZ3JvdXBWaWV3LnJlbGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0xheW91dFRhYnMoZGltZW5zaW9uczogSUVkaXRvclRpdGxlQ29udHJvbERpbWVuc2lvbnMsIG9wdGlvbnM/OiBJTXVsdGlFZGl0b3JUYWJzQ29udHJvbExheW91dE9wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIEFsd2F5cyBmaXJzdCBsYXlvdXQgdGFicyB3aXRoIHdyYXBwaW5nIHN1cHBvcnQgZXZlbiBpZiB3cmFwcGluZ1xuXHRcdC8vIGlzIGRpc2FibGVkLiBUaGUgcmVzdWx0IGluZGljYXRlcyBpZiB0YWJzIHdyYXAgYW5kIGlmIG5vdCwgd2Vcblx0XHQvLyBuZWVkIHRvIHByb2NlZWQgd2l0aCB0aGUgbGF5b3V0IHdpdGhvdXQgd3JhcHBpbmcgYmVjYXVzZSBldmVuXG5cdFx0Ly8gaWYgd3JhcHBpbmcgaXMgZW5hYmxlZCBpbiBzZXR0aW5ncywgdGhlcmUgYXJlIGNhc2VzIHdoZXJlXG5cdFx0Ly8gd3JhcHBpbmcgaXMgZGlzYWJsZWQgKGUuZy4gZHVlIHRvIHNwYWNlIGNvbnN0cmFpbnRzKVxuXHRcdGNvbnN0IHRhYnNXcmFwTXVsdGlMaW5lID0gdGhpcy5kb0xheW91dFRhYnNXcmFwcGluZyhkaW1lbnNpb25zKTtcblx0XHRpZiAoIXRhYnNXcmFwTXVsdGlMaW5lKSB7XG5cdFx0XHR0aGlzLmRvTGF5b3V0VGFic05vbldyYXBwaW5nKG9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnN0aWNreVRhYnNCYWNrZ3JvdW5kKS5zdHlsZS53aWR0aCA9ICcwcHgnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9MYXlvdXRUYWJzV3JhcHBpbmcoZGltZW5zaW9uczogSUVkaXRvclRpdGxlQ29udHJvbERpbWVuc2lvbnMpOiBib29sZWFuIHtcblx0XHRjb25zdCBbdGFic0FuZEFjdGlvbnNDb250YWluZXIsIHRhYnNDb250YWluZXIsIGVkaXRvclRvb2xiYXJDb250YWluZXIsIHRhYnNTY3JvbGxiYXJdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy50YWJzQW5kQWN0aW9uc0NvbnRhaW5lciwgdGhpcy50YWJzQ29udGFpbmVyLCB0aGlzLmVkaXRvckFjdGlvbnNUb29sYmFyQ29udGFpbmVyLCB0aGlzLnRhYnNTY3JvbGxiYXIpO1xuXG5cdFx0Y29uc3QgbGF5b3V0QWN0aW9uc0NvbnRhaW5lciA9IHRoaXMuZWRpdG9yTGF5b3V0QWN0aW9uc1Rvb2xiYXJDb250YWluZXI7XG5cdFx0Y29uc3QgZWRpdG9yVG9vbGJhcldpZHRoID0gKCkgPT4gZWRpdG9yVG9vbGJhckNvbnRhaW5lci5vZmZzZXRXaWR0aCArIChsYXlvdXRBY3Rpb25zQ29udGFpbmVyPy5vZmZzZXRXaWR0aCA/PyAwKTtcblxuXHRcdC8vIEhhbmRsZSB3cmFwcGluZyB0YWJzIGFjY29yZGluZyB0byBzZXR0aW5nOlxuXHRcdC8vIC0gZW5hYmxlZDogb25seSBhZGQgY2xhc3MgaWYgdGFicyB3cmFwIGFuZCBkb24ndCBleGNlZWQgYXZhaWxhYmxlIGRpbWVuc2lvbnNcblx0XHQvLyAtIGRpc2FibGVkOiByZW1vdmUgY2xhc3MgYW5kIG1hcmdpbi1yaWdodCB2YXJpYWJsZVxuXG5cdFx0Y29uc3QgZGlkVGFic1dyYXBNdWx0aUxpbmUgPSB0YWJzQW5kQWN0aW9uc0NvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3dyYXBwaW5nJyk7XG5cdFx0bGV0IHRhYnNXcmFwTXVsdGlMaW5lID0gZGlkVGFic1dyYXBNdWx0aUxpbmU7XG5cblx0XHRmdW5jdGlvbiB1cGRhdGVUYWJzV3JhcHBpbmcoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0dGFic1dyYXBNdWx0aUxpbmUgPSBlbmFibGVkO1xuXG5cdFx0XHQvLyBUb2dnbGUgdGhlIGB3cmFwcGVkYCBjbGFzcyB0byBlbmFibGUgd3JhcHBpbmdcblx0XHRcdHRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3dyYXBwaW5nJywgdGFic1dyYXBNdWx0aUxpbmUpO1xuXG5cdFx0XHQvLyBVcGRhdGUgYGxhc3QtdGFiLW1hcmdpbi1yaWdodGAgQ1NTIHZhcmlhYmxlIHRvIGFjY291bnQgZm9yIHRoZSBhYnNvbHV0ZVxuXHRcdFx0Ly8gcG9zaXRpb25lZCBlZGl0b3IgYWN0aW9ucyBjb250YWluZXIgd2hlbiB0YWJzIHdyYXAuIFRoZSBtYXJnaW4gbmVlZHMgdG9cblx0XHRcdC8vIGJlIHRoZSB3aWR0aCBvZiB0aGUgZWRpdG9yIGFjdGlvbnMgY29udGFpbmVyIHRvIGF2b2lkIHNjcmVlbiBjaGVlc2UuXG5cdFx0XHR0YWJzQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLWxhc3QtdGFiLW1hcmdpbi1yaWdodCcsIHRhYnNXcmFwTXVsdGlMaW5lID8gYCR7ZWRpdG9yVG9vbGJhcldpZHRoKCl9cHhgIDogJzAnKTtcblx0XHRcdHRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLWxhc3QtdGFiLWxheW91dC1hY3Rpb25zLXdpZHRoJywgYCR7bGF5b3V0QWN0aW9uc0NvbnRhaW5lcj8ub2Zmc2V0V2lkdGggPz8gMH1weGApO1xuXG5cdFx0XHQvLyBSZW1vdmUgb2xkIGNzcyBjbGFzc2VzIHRoYXQgYXJlIG5vdCBuZWVkZWQgYW55bW9yZVxuXHRcdFx0Zm9yIChjb25zdCB0YWIgb2YgdGFic0NvbnRhaW5lci5jaGlsZHJlbikge1xuXHRcdFx0XHR0YWIuY2xhc3NMaXN0LnJlbW92ZSgnbGFzdC1pbi1yb3cnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXR0aW5nIGVuYWJsZWQ6IHNlbGVjdGl2ZWx5IGVuYWJsZSB3cmFwcGluZyBpZiBwb3NzaWJsZVxuXHRcdGlmICh0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMud3JhcFRhYnMpIHtcblx0XHRcdGNvbnN0IHZpc2libGVUYWJzV2lkdGggPSB0YWJzQ29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdFx0Y29uc3QgYWxsVGFic1dpZHRoID0gdGFic0NvbnRhaW5lci5zY3JvbGxXaWR0aDtcblx0XHRcdGNvbnN0IGxhc3RUYWJGaXRzV3JhcHBlZCA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbGFzdFRhYiA9IHRoaXMuZ2V0TGFzdFRhYigpO1xuXHRcdFx0XHRpZiAoIWxhc3RUYWIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gbm8gdGFiIGFsd2F5cyBmaXRzXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsYXN0VGFiT3ZlcmxhcFdpdGhUb29sYmFyV2lkdGggPSBsYXN0VGFiLm9mZnNldFdpZHRoICsgZWRpdG9yVG9vbGJhcldpZHRoKCkgLSBkaW1lbnNpb25zLmF2YWlsYWJsZS53aWR0aDtcblx0XHRcdFx0aWYgKGxhc3RUYWJPdmVybGFwV2l0aFRvb2xiYXJXaWR0aCA+IDEpIHtcblx0XHRcdFx0XHQvLyBBbGxvdyBmb3Igc2xpZ2h0IHJvdW5kaW5nIGVycm9ycyByZWxhdGVkIHRvIHpvb21pbmcgaGVyZVxuXHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTYzODVcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH07XG5cblx0XHRcdC8vIElmIHRhYnMgd3JhcCBvciBzaG91bGQgc3RhcnQgdG8gd3JhcCAod2hlbiB3aWR0aCBleGNlZWRzIHZpc2libGUgd2lkdGgpXG5cdFx0XHQvLyB3ZSBtdXN0IHRyaWdnZXIgYHVwZGF0ZVdyYXBwaW5nYCB0byBzZXQgdGhlIGBsYXN0LXRhYi1tYXJnaW4tcmlnaHRgXG5cdFx0XHQvLyBhY2NvcmRpbmdseSBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGFjdGlvbnMuIFRoZSBtYXJnaW4gaXMgaW1wb3J0YW50IHRvXG5cdFx0XHQvLyBwcm9wZXJseSBwb3NpdGlvbiB0aGUgbGFzdCB0YWIgYXBhcnQgZnJvbSB0aGUgYWN0aW9uc1xuXHRcdFx0Ly9cblx0XHRcdC8vIFdlIGFscmVhZHkgY2hlY2sgaGVyZSBpZiB0aGUgbGFzdCB0YWIgd291bGQgZml0IHdoZW4gd3JhcHBlZCBnaXZlbiB0aGVcblx0XHRcdC8vIGVkaXRvciB0b29sYmFyIHdpbGwgYWxzbyBzaG93IHJpZ2h0IG5leHQgdG8gaXQuIFRoaXMgZW5zdXJlcyB3ZSBhcmUgbm90XG5cdFx0XHQvLyBlbmFibGluZyB3cmFwcGluZyBvbmx5IHRvIGRpc2FibGUgaXQgYWdhaW4gaW4gdGhlIGNvZGUgYmVsb3cgKHRoaXMgZml4ZXNcblx0XHRcdC8vIGZsaWNrZXJpbmcgaXNzdWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExNTA1MClcblx0XHRcdGlmICh0YWJzV3JhcE11bHRpTGluZSB8fCAoYWxsVGFic1dpZHRoID4gdmlzaWJsZVRhYnNXaWR0aCAmJiBsYXN0VGFiRml0c1dyYXBwZWQoKSkpIHtcblx0XHRcdFx0dXBkYXRlVGFic1dyYXBwaW5nKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUYWJzIHdyYXAgbXVsdGlsaW5lOiByZW1vdmUgd3JhcHBpbmcgdW5kZXIgY2VydGFpbiBzaXplIGNvbnN0cmFpbnQgY29uZGl0aW9uc1xuXHRcdFx0aWYgKHRhYnNXcmFwTXVsdGlMaW5lKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHQodGFic0NvbnRhaW5lci5vZmZzZXRIZWlnaHQgPiBkaW1lbnNpb25zLmF2YWlsYWJsZS5oZWlnaHQpIHx8XHRcdFx0XHRcdFx0XHQvLyBpZiBoZWlnaHQgZXhjZWVkcyBhdmFpbGFibGUgaGVpZ2h0XG5cdFx0XHRcdFx0KGFsbFRhYnNXaWR0aCA9PT0gdmlzaWJsZVRhYnNXaWR0aCAmJiB0YWJzQ29udGFpbmVyLm9mZnNldEhlaWdodCA9PT0gdGhpcy50YWJIZWlnaHQpIHx8XHQvLyBpZiB3cmFwcGluZyBpcyBub3QgbmVlZGVkIGFueW1vcmVcblx0XHRcdFx0XHQoIWxhc3RUYWJGaXRzV3JhcHBlZCgpKVx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBpZiBsYXN0IHRhYiBkb2VzIG5vdCBmaXQgYW55bW9yZVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHR1cGRhdGVUYWJzV3JhcHBpbmcoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dGluZyBkaXNhYmxlZDogcmVtb3ZlIENTUyB0cmFjZXMgb25seSBpZiB0YWJzIGRpZCB3cmFwXG5cdFx0ZWxzZSBpZiAoZGlkVGFic1dyYXBNdWx0aUxpbmUpIHtcblx0XHRcdHVwZGF0ZVRhYnNXcmFwcGluZyhmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgdHJhbnNpdGlvbmVkIGZyb20gbm9uLXdyYXBwaW5nIHRvIHdyYXBwaW5nLCB3ZSBuZWVkXG5cdFx0Ly8gdG8gdXBkYXRlIHRoZSBzY3JvbGxiYXIgdG8gaGF2ZSBhbiBlcXVhbCBgd2lkdGhgIGFuZFxuXHRcdC8vIGBzY3JvbGxXaWR0aGAuIE90aGVyd2lzZSBhIHNjcm9sbGJhciB3b3VsZCBhcHBlYXIgd2hpY2ggaXNcblx0XHQvLyBuZXZlciBkZXNpcmVkIHdoZW4gd3JhcHBpbmcuXG5cdFx0aWYgKHRhYnNXcmFwTXVsdGlMaW5lICYmICFkaWRUYWJzV3JhcE11bHRpTGluZSkge1xuXHRcdFx0Y29uc3QgdmlzaWJsZVRhYnNXaWR0aCA9IHRhYnNDb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0XHR0YWJzU2Nyb2xsYmFyLnNldFNjcm9sbERpbWVuc2lvbnMoe1xuXHRcdFx0XHR3aWR0aDogdmlzaWJsZVRhYnNXaWR0aCxcblx0XHRcdFx0c2Nyb2xsV2lkdGg6IHZpc2libGVUYWJzV2lkdGhcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgYGxhc3QtaW4tcm93YCBjbGFzcyBvbiB0YWJzIHdoZW4gd3JhcHBpbmdcblx0XHQvLyBpcyBlbmFibGVkIChpdCBkb2Vzbid0IGRvIGFueSBoYXJtIG90aGVyd2lzZSkuIFRoaXNcblx0XHQvLyBjbGFzcyBjb250cm9scyBhZGRpdGlvbmFsIHByb3BlcnRpZXMgb2YgdGFiIHdoZW4gaXQgaXNcblx0XHQvLyB0aGUgbGFzdCB0YWIgaW4gYSByb3dcblx0XHRpZiAodGFic1dyYXBNdWx0aUxpbmUpIHtcblxuXHRcdFx0Ly8gVXNpbmcgYSBtYXAgaGVyZSB0byBjaGFuZ2UgY2xhc3NlcyBhZnRlciB0aGUgZm9yIGxvb3AgaXNcblx0XHRcdC8vIGNydWNpYWwgZm9yIHBlcmZvcm1hbmNlIGJlY2F1c2UgY2hhbmdpbmcgdGhlIGNsYXNzIG9uIGFcblx0XHRcdC8vIHRhYiBjYW4gcmVzdWx0IGluIGxheW91dHMgb2YgdGhlIHJlbmRlcmluZyBlbmdpbmUuXG5cdFx0XHRjb25zdCB0YWJzID0gbmV3IE1hcDxIVE1MRWxlbWVudCwgYm9vbGVhbiAvKiBsYXN0IGluIHJvdyAqLz4oKTtcblxuXHRcdFx0bGV0IGN1cnJlbnRUYWJzUG9zWTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGxhc3RUYWI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0YWJzQ29udGFpbmVyLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmIChjaGlsZCA9PT0gdGhpcy5hZGRUYWJDb250YWluZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0YWIgPSBjaGlsZCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0Y29uc3QgdGFiUG9zWSA9IHRhYi5vZmZzZXRUb3A7XG5cblx0XHRcdFx0Ly8gTWFya3MgYSBuZXcgb3IgdGhlIGZpcnN0IHJvdyBvZiB0YWJzXG5cdFx0XHRcdGlmICh0YWJQb3NZICE9PSBjdXJyZW50VGFic1Bvc1kpIHtcblx0XHRcdFx0XHRjdXJyZW50VGFic1Bvc1kgPSB0YWJQb3NZO1xuXHRcdFx0XHRcdGlmIChsYXN0VGFiKSB7XG5cdFx0XHRcdFx0XHR0YWJzLnNldChsYXN0VGFiLCB0cnVlKTsgLy8gcHJldmlvdXMgdGFiIG11c3QgYmUgbGFzdCBpbiByb3cgdGhlblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFsd2F5cyByZW1lbWJlciBsYXN0IHRhYiBhbmQgZW5zdXJlIHRoZVxuXHRcdFx0XHQvLyBsYXN0LWluLXJvdyBjbGFzcyBpcyBub3QgcHJlc2VudCB1bnRpbFxuXHRcdFx0XHQvLyB3ZSBrbm93IHRoZSB0YWIgaXMgbGFzdFxuXHRcdFx0XHRsYXN0VGFiID0gdGFiO1xuXHRcdFx0XHR0YWJzLnNldCh0YWIsIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTGFzdCB0YWIgb3ZlcmFsbHkgaXMgYWx3YXlzIGxhc3QtaW4tcm93XG5cdFx0XHRpZiAobGFzdFRhYikge1xuXHRcdFx0XHR0YWJzLnNldChsYXN0VGFiLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBbdGFiLCBsYXN0SW5Sb3ddIG9mIHRhYnMpIHtcblx0XHRcdFx0dGFiLmNsYXNzTGlzdC50b2dnbGUoJ2xhc3QtaW4tcm93JywgbGFzdEluUm93KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGFic1dyYXBNdWx0aUxpbmU7XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0VGFic05vbldyYXBwaW5nKG9wdGlvbnM/OiBJTXVsdGlFZGl0b3JUYWJzQ29udHJvbExheW91dE9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBbdGFic0NvbnRhaW5lciwgdGFic1Njcm9sbGJhcl0gPSBhc3NlcnRSZXR1cm5zQWxsRGVmaW5lZCh0aGlzLnRhYnNDb250YWluZXIsIHRoaXMudGFic1Njcm9sbGJhcik7XG5cblx0XHQvL1xuXHRcdC8vIFN5bm9wc2lzXG5cdFx0Ly8gLSBhbGxUYWJzV2lkdGg6ICAgXHRcdFx0c3VtIG9mIGFsbCB0YWIgd2lkdGhzXG5cdFx0Ly8gLSBzdGlja3lUYWJzV2lkdGg6XHRcdFx0c3VtIG9mIGFsbCBzdGlja3kgdGFiIHNsb3Qgd2lkdGhzICh1bmxlc3MgYHBpbm5lZFRhYlNpemluZzogbm9ybWFsYClcblx0XHQvLyAtIHZpc2libGVDb250YWluZXJXaWR0aDogXHRzaXplIG9mIHRhYiBjb250YWluZXJcblx0XHQvLyAtIGF2YWlsYWJsZUNvbnRhaW5lcldpZHRoOiBcdHNpemUgb2YgdGFiIGNvbnRhaW5lciBtaW51cyBzaXplIG9mIHN0aWNreSB0YWJzXG5cdFx0Ly9cblx0XHQvLyBbLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIEFsbCB0YWJzIHdpZHRoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLV1cblx0XHQvLyBbLS0tLS0tLS0tLS0tLS0tLS0tLSBWaXNpYmxlIGNvbnRhaW5lciB3aWR0aCAtLS0tLS0tLS0tLS0tLS0tLS0tXVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgIFstLS0tLS0gQXZhaWxhYmxlIGNvbnRhaW5lciB3aWR0aCAtLS0tLS1dXG5cdFx0Ly8gWyBTdGlja3kgQSBdWyBTdGlja3kgQiBdWyBUYWIgQyBdWyBUYWIgRCBdWyBUYWIgRSBdWyBUYWIgRiBdWyBUYWIgRyBdWyBUYWIgSCBdWyBUYWIgSSBdXG5cdFx0Ly8gICAgICAgICAgICAgICAgIEFjdGl2ZSBUYWIgV2lkdGggWy0tLS0tLS1dXG5cdFx0Ly8gWy0tLS0tLS0gQWN0aXZlIFRhYiBQb3MgWCAtLS0tLS0tXVxuXHRcdC8vIFstLSBTdGlja3kgVGFicyBXaWR0aCAtLV1cblx0XHQvL1xuXG5cdFx0Y29uc3QgdmlzaWJsZVRhYnNXaWR0aCA9IHRhYnNDb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0Y29uc3QgYWxsVGFic1dpZHRoID0gdGFic0NvbnRhaW5lci5zY3JvbGxXaWR0aDtcblxuXHRcdC8vIENvbXB1dGUgc2xvdCB3aWR0aCBvZiBzdGlja3kgdGFicyBkZXBlbmRpbmcgb24gcGlubmVkIHRhYiBzaXppbmdcblx0XHQvLyAtIGNvbXBhY3Q6IHN0aWNreS10YWJzICogY29tcGFjdCBzbG90IHdpZHRoXG5cdFx0Ly8gLSAgc2hyaW5rOiBzdGlja3ktdGFicyAqIHNocmluayBzbG90IHdpZHRoXG5cdFx0Ly8gLSAgbm9ybWFsOiAwIChzdGlja3kgdGFicyBpbmhlcml0IGxvb2sgYW5kIGZlZWwgZnJvbSBub24tc3RpY2t5IHRhYnMpXG5cdFx0bGV0IHN0aWNreVRhYnNXaWR0aCA9IDA7XG5cdFx0aWYgKHRoaXMudGFic01vZGVsLnN0aWNreUNvdW50ID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RpY2t5VGFiV2lkdGggPSB0aGlzLmdldFN0aWNreVRhYldpZHRoKHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5waW5uZWRUYWJTaXppbmcpO1xuXHRcdFx0c3RpY2t5VGFic1dpZHRoID0gdGhpcy50YWJzTW9kZWwuc3RpY2t5Q291bnQgKiBzdGlja3lUYWJXaWR0aDtcblxuXHRcdFx0Zm9yIChsZXQgdGFiSW5kZXggPSAwOyB0YWJJbmRleCA8IHRoaXMudGFic01vZGVsLnN0aWNreUNvdW50OyB0YWJJbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHRhYiA9IHRoaXMuZ2V0VGFiQXRJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRcdGlmICh0YWIpIHtcblx0XHRcdFx0XHR0YWIuc3R5bGUubGVmdCA9IGAke3RhYkluZGV4ICogc3RpY2t5VGFiV2lkdGh9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlVGFiQW5kSW5kZXggPSB0aGlzLnRhYnNNb2RlbC5hY3RpdmVFZGl0b3IgPyB0aGlzLmdldFRhYkFuZEluZGV4KHRoaXMudGFic01vZGVsLmFjdGl2ZUVkaXRvcikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgW2FjdGl2ZVRhYiwgYWN0aXZlVGFiSW5kZXhdID0gYWN0aXZlVGFiQW5kSW5kZXggPz8gW3VuZGVmaW5lZCwgdW5kZWZpbmVkXTtcblxuXHRcdC8vIEZpZ3VyZSBvdXQgaWYgYWN0aXZlIHRhYiBpcyBwb3NpdGlvbmVkIHN0YXRpYyB3aGljaCBoYXMgYW5cblx0XHQvLyBpbXBhY3Qgb24gd2hldGhlciB0byByZXZlYWwgdGhlIHRhYiBvciBub3QgbGF0ZXJcblx0XHRsZXQgYWN0aXZlVGFiUG9zaXRpb25TdGF0aWMgPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMucGlubmVkVGFiU2l6aW5nICE9PSAnbm9ybWFsJyAmJiB0eXBlb2YgYWN0aXZlVGFiSW5kZXggPT09ICdudW1iZXInICYmIHRoaXMudGFic01vZGVsLmlzU3RpY2t5KGFjdGl2ZVRhYkluZGV4KTtcblxuXHRcdC8vIFNwZWNpYWwgY2FzZTogd2UgaGF2ZSBzdGlja3kgdGFicyBidXQgdGhlIGF2YWlsYWJsZSBzcGFjZSBmb3Igc2hvd2luZyB0YWJzXG5cdFx0Ly8gaXMgbGl0dGxlIGVub3VnaCB0aGF0IHdlIG5lZWQgdG8gZGlzYWJsZSBzdGlja3kgdGFicyBzdGlja3kgcG9zaXRpb25pbmdcblx0XHQvLyBzbyB0aGF0IHRhYnMgY2FuIGJlIHNjcm9sbGVkIGF0IG5hdHVyYWxseS5cblx0XHRsZXQgYXZhaWxhYmxlVGFic0NvbnRhaW5lcldpZHRoID0gdmlzaWJsZVRhYnNXaWR0aCAtIHN0aWNreVRhYnNXaWR0aDtcblx0XHRpZiAodGhpcy50YWJzTW9kZWwuc3RpY2t5Q291bnQgPiAwICYmIGF2YWlsYWJsZVRhYnNDb250YWluZXJXaWR0aCA8IE11bHRpRWRpdG9yVGFic0NvbnRyb2wuVEFCX1dJRFRILmZpdCkge1xuXHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlLXN0aWNreS10YWJzJyk7XG5cblx0XHRcdGF2YWlsYWJsZVRhYnNDb250YWluZXJXaWR0aCA9IHZpc2libGVUYWJzV2lkdGg7XG5cdFx0XHRzdGlja3lUYWJzV2lkdGggPSAwO1xuXHRcdFx0YWN0aXZlVGFiUG9zaXRpb25TdGF0aWMgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlLXN0aWNreS10YWJzJyk7XG5cdFx0fVxuXHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc3RpY2t5VGFic0JhY2tncm91bmQpLnN0eWxlLndpZHRoID0gYCR7c3RpY2t5VGFic1dpZHRofXB4YDtcblxuXHRcdGxldCBhY3RpdmVUYWJQb3NYOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFjdGl2ZVRhYldpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIXRoaXMuYmxvY2tSZXZlYWxBY3RpdmVUYWIgJiYgYWN0aXZlVGFiKSB7XG5cdFx0XHRhY3RpdmVUYWJQb3NYID0gYWN0aXZlVGFiLm9mZnNldExlZnQ7XG5cdFx0XHRhY3RpdmVUYWJXaWR0aCA9IGFjdGl2ZVRhYi5vZmZzZXRXaWR0aDtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgc2Nyb2xsYmFyXG5cdFx0Y29uc3QgeyB3aWR0aDogb2xkVmlzaWJsZVRhYnNXaWR0aCwgc2Nyb2xsV2lkdGg6IG9sZEFsbFRhYnNXaWR0aCB9ID0gdGFic1Njcm9sbGJhci5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0dGFic1Njcm9sbGJhci5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdHdpZHRoOiB2aXNpYmxlVGFic1dpZHRoLFxuXHRcdFx0c2Nyb2xsV2lkdGg6IGFsbFRhYnNXaWR0aFxuXHRcdH0pO1xuXHRcdGNvbnN0IGRpbWVuc2lvbnNDaGFuZ2VkID0gb2xkVmlzaWJsZVRhYnNXaWR0aCAhPT0gdmlzaWJsZVRhYnNXaWR0aCB8fCBvbGRBbGxUYWJzV2lkdGggIT09IGFsbFRhYnNXaWR0aDtcblxuXHRcdC8vIFJldmVhbGluZyB0aGUgYWN0aXZlIHRhYiBpcyBza2lwcGVkIHVuZGVyIHNvbWUgY29uZGl0aW9uczpcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmJsb2NrUmV2ZWFsQWN0aXZlVGFiIHx8XHRcdFx0XHRcdFx0XHQvLyBleHBsaWNpdGx5IGRpc2FibGVkXG5cdFx0XHR0eXBlb2YgYWN0aXZlVGFiUG9zWCAhPT0gJ251bWJlcicgfHxcdFx0XHRcdFx0Ly8gaW52YWxpZCBkaW1lbnNpb25cblx0XHRcdHR5cGVvZiBhY3RpdmVUYWJXaWR0aCAhPT0gJ251bWJlcicgfHxcdFx0XHRcdFx0Ly8gaW52YWxpZCBkaW1lbnNpb25cblx0XHRcdGFjdGl2ZVRhYlBvc2l0aW9uU3RhdGljIHx8XHRcdFx0XHRcdFx0XHRcdC8vIHN0YXRpYyB0YWIgKHN0aWNreSlcblx0XHRcdCghZGltZW5zaW9uc0NoYW5nZWQgJiYgIW9wdGlvbnM/LmZvcmNlUmV2ZWFsQWN0aXZlVGFiKSBcdC8vIGRpbWVuc2lvbnMgZGlkIG5vdCBjaGFuZ2UgYW5kIHdlIGhhdmUgbG93IGxheW91dCBwcmlvcml0eSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzMzYzMSlcblx0XHQpIHtcblx0XHRcdHRoaXMuYmxvY2tSZXZlYWxBY3RpdmVUYWIgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXZlYWwgdGhlIGFjdGl2ZSBvbmVcblx0XHRjb25zdCB0YWJzQ29udGFpbmVyU2Nyb2xsUG9zWCA9IHRhYnNTY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxMZWZ0O1xuXHRcdGNvbnN0IGFjdGl2ZVRhYkZpdHMgPSBhY3RpdmVUYWJXaWR0aCA8PSBhdmFpbGFibGVUYWJzQ29udGFpbmVyV2lkdGg7XG5cdFx0Y29uc3QgYWRqdXN0ZWRBY3RpdmVUYWJQb3NYID0gYWN0aXZlVGFiUG9zWCAtIHN0aWNreVRhYnNXaWR0aDtcblxuXHRcdC8vXG5cdFx0Ly8gU3lub3BzaXNcblx0XHQvLyAtIGFkanVzdGVkQWN0aXZlVGFiUG9zWDogdGhlIGFkanVzdGVkIHRhYlBvc1ggdGFrZXMgdGhlIHdpZHRoIG9mIHN0aWNreSB0YWJzIGludG8gYWNjb3VudFxuXHRcdC8vICAgY29uY2VwdHVhbGx5IHRoZSBzY3JvbGxpbmcgb25seSBiZWdpbnMgYWZ0ZXIgc3RpY2t5IHRhYnMgc28gaW4gb3JkZXIgdG8gcmV2ZWFsIGEgdGFiIGZ1bGx5XG5cdFx0Ly8gICB0aGUgYWN0dWFsIHBvc2l0aW9uIG5lZWRzIHRvIGJlIGFkanVzdGVkIGZvciBzdGlja3kgdGFicy5cblx0XHQvL1xuXHRcdC8vIFRhYiBpcyBvdmVyZmxvd2luZyB0byB0aGUgcmlnaHQ6IFNjcm9sbCBtaW5pbWFsbHkgdW50aWwgdGhlIGVsZW1lbnQgaXMgZnVsbHkgdmlzaWJsZSB0byB0aGUgcmlnaHRcblx0XHQvLyBOb3RlOiBvbmx5IHRyeSB0byBkbyB0aGlzIGlmIHdlIGFjdHVhbGx5IGhhdmUgZW5vdWdoIHdpZHRoIHRvIGdpdmUgdG8gc2hvdyB0aGUgdGFiIGZ1bGx5IVxuXHRcdC8vXG5cdFx0Ly8gRXhhbXBsZTogVGFiIEcgc2hvdWxkIGJlIG1hZGUgYWN0aXZlIGFuZCBuZWVkcyB0byBiZSBmdWxseSByZXZlYWxlZCBhcyBzdWNoLlxuXHRcdC8vXG5cdFx0Ly8gWy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIEFsbCB0YWJzIHdpZHRoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXVxuXHRcdC8vIFstLS0tLS0tLS0tLS0tLS0tLS0tLSBWaXNpYmxlIGNvbnRhaW5lciB3aWR0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLV1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgIFstLS0tLSBBdmFpbGFibGUgY29udGFpbmVyIHdpZHRoIC0tLS0tLS1dXG5cdFx0Ly8gICAgIFsgU3RpY2t5IEEgXVsgU3RpY2t5IEIgXVsgVGFiIEMgXVsgVGFiIEQgXVsgVGFiIEUgXVsgVGFiIEYgXVsgVGFiIEcgXVsgVGFiIEggXVsgVGFiIEkgXVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgQWN0aXZlIFRhYiBXaWR0aCBbLS0tLS0tLV1cblx0XHQvLyAgICAgWy0tLS0tLS0gQWN0aXZlIFRhYiBQb3MgWCAtLS0tLS0tXVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbLS0tLS0tLS0gQWRqdXN0ZWQgVGFiIFBvcyBYIC0tLS0tLS1dXG5cdFx0Ly8gICAgIFstLSBTdGlja3kgVGFicyBXaWR0aCAtLV1cblx0XHQvL1xuXHRcdC8vXG5cdFx0aWYgKGFjdGl2ZVRhYkZpdHMgJiYgdGFic0NvbnRhaW5lclNjcm9sbFBvc1ggKyBhdmFpbGFibGVUYWJzQ29udGFpbmVyV2lkdGggPCBhZGp1c3RlZEFjdGl2ZVRhYlBvc1ggKyBhY3RpdmVUYWJXaWR0aCkge1xuXHRcdFx0dGFic1Njcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRcdHNjcm9sbExlZnQ6IHRhYnNDb250YWluZXJTY3JvbGxQb3NYICsgKChhZGp1c3RlZEFjdGl2ZVRhYlBvc1ggKyBhY3RpdmVUYWJXaWR0aCkgLyogcmlnaHQgY29ybmVyIG9mIHRhYiAqLyAtICh0YWJzQ29udGFpbmVyU2Nyb2xsUG9zWCArIGF2YWlsYWJsZVRhYnNDb250YWluZXJXaWR0aCkgLyogcmlnaHQgY29ybmVyIG9mIHZpZXcgcG9ydCAqLylcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vXG5cdFx0Ly8gVGFiIGlzIG92ZXJsZmxvd2luZyB0byB0aGUgbGVmdCBvciBkb2VzIG5vdCBmaXQ6IFNjcm9sbCBpdCBpbnRvIHZpZXcgdG8gdGhlIGxlZnRcblx0XHQvL1xuXHRcdC8vIEV4YW1wbGU6IFRhYiBDIHNob3VsZCBiZSBtYWRlIGFjdGl2ZSBhbmQgbmVlZHMgdG8gYmUgZnVsbHkgcmV2ZWFsZWQgYXMgc3VjaC5cblx0XHQvL1xuXHRcdC8vIFstLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBBbGwgdGFicyB3aWR0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXVxuXHRcdC8vICAgICBbLS0tLS0tLS0tLS0tLS0tLS0tIFZpc2libGUgY29udGFpbmVyIHdpZHRoIC0tLS0tLS0tLS0tLS0tLS0tLV1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgIFstLS0tLSBBdmFpbGFibGUgY29udGFpbmVyIHdpZHRoIC0tLS0tLS1dXG5cdFx0Ly8gWyBTdGlja3kgQSBdWyBTdGlja3kgQiBdWyBUYWIgQyBdWyBUYWIgRCBdWyBUYWIgRSBdWyBUYWIgRiBdWyBUYWIgRyBdWyBUYWIgSCBdWyBUYWIgSSBdXG5cdFx0Ly8gICAgICAgICAgICAgICAgIEFjdGl2ZSBUYWIgV2lkdGggWy0tLS0tLS1dXG5cdFx0Ly8gWy0tLS0tLS0gQWN0aXZlIFRhYiBQb3MgWCAtLS0tLS0tXVxuXHRcdC8vICAgICAgQWRqdXN0ZWQgVGFiIFBvcyBYIFtdXG5cdFx0Ly8gWy0tIFN0aWNreSBUYWJzIFdpZHRoIC0tXVxuXHRcdC8vXG5cdFx0Ly9cblx0XHRlbHNlIGlmICh0YWJzQ29udGFpbmVyU2Nyb2xsUG9zWCA+IGFkanVzdGVkQWN0aXZlVGFiUG9zWCB8fCAhYWN0aXZlVGFiRml0cykge1xuXHRcdFx0dGFic1Njcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRcdHNjcm9sbExlZnQ6IGFkanVzdGVkQWN0aXZlVGFiUG9zWFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdGlja3lUYWJXaWR0aChwaW5uZWRUYWJTaXppbmc6IElFZGl0b3JQYXJ0T3B0aW9uc1sncGlubmVkVGFiU2l6aW5nJ10pOiBudW1iZXIge1xuXHRcdGNvbnN0IGhhc01vZGVyblVJVGFicyA9IEJvb2xlYW4odGhpcy5wYXJlbnQuY2xvc2VzdCgnLm1vZGVybi11aS10YWJzJykpO1xuXG5cdFx0c3dpdGNoIChwaW5uZWRUYWJTaXppbmcpIHtcblx0XHRcdGNhc2UgJ2NvbXBhY3QnOlxuXHRcdFx0XHRyZXR1cm4gaGFzTW9kZXJuVUlUYWJzID8gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5NT0RFUk5fVUlfQ09NUEFDVF9QSU5ORURfVEFCX1dJRFRIIDogTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5UQUJfV0lEVEguY29tcGFjdDtcblx0XHRcdGNhc2UgJ3Nocmluayc6XG5cdFx0XHRcdHJldHVybiBNdWx0aUVkaXRvclRhYnNDb250cm9sLlRBQl9XSURUSC5zaHJpbms7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRhYnNDb250cm9sVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCB0YWJzQW5kQWN0aW9uc0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIpO1xuXHRcdHRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgIXRoaXMudmlzaWJsZSk7XG5cblx0XHQvLyBSZXNldCBkaW1lbnNpb25zIGlmIGhpZGRlblxuXHRcdGlmICghdGhpcy52aXNpYmxlICYmIHRoaXMuZGltZW5zaW9ucykge1xuXHRcdFx0dGhpcy5kaW1lbnNpb25zLnVzZWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50YWJzTW9kZWwuY291bnQgPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUYWJBbmRJbmRleChlZGl0b3I6IEVkaXRvcklucHV0KTogW0hUTUxFbGVtZW50LCBudW1iZXIgLyogaW5kZXggKi9dIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YWJJbmRleCA9IHRoaXMudGFic01vZGVsLmluZGV4T2YoZWRpdG9yKTtcblx0XHRjb25zdCB0YWIgPSB0aGlzLmdldFRhYkF0SW5kZXgodGFiSW5kZXgpO1xuXHRcdGlmICh0YWIpIHtcblx0XHRcdHJldHVybiBbdGFiLCB0YWJJbmRleF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGFiQXRJbmRleCh0YWJJbmRleDogbnVtYmVyKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0YWJJbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCB0YWJzQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy50YWJzQ29udGFpbmVyKTtcblxuXHRcdFx0cmV0dXJuIHRhYnNDb250YWluZXIuY2hpbGRyZW5bdGFiSW5kZXhdIGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldExhc3RUYWIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFRhYkF0SW5kZXgodGhpcy50YWJzTW9kZWwuY291bnQgLSAxKTtcblx0fVxuXG5cdHByaXZhdGUgYmxvY2tSZXZlYWxBY3RpdmVUYWJPbmNlKCk6IHZvaWQge1xuXG5cdFx0Ly8gV2hlbiBjbG9zaW5nIHRhYnMgdGhyb3VnaCB0aGUgdGFiIGNsb3NlIGJ1dHRvbiBvciBnZXN0dXJlLCB0aGUgdXNlclxuXHRcdC8vIG1pZ2h0IHdhbnQgdG8gcmFwaWRseSBjbG9zZSB0YWJzIGluIHNlcXVlbmNlIGFuZCBhcyBzdWNoIHJldmVhbGluZ1xuXHRcdC8vIHRoZSBhY3RpdmUgdGFiIGFmdGVyIGVhY2ggY2xvc2Ugd291bGQgYmUgYW5ub3lpbmcuIEFzIHN1Y2ggd2UgYmxvY2tcblx0XHQvLyB0aGUgYXV0b21hdGVkIHJldmVhbGluZyBvZiB0aGUgYWN0aXZlIHRhYiBvbmNlIGFmdGVyIHRoZSBjbG9zZSBpc1xuXHRcdC8vIHRyaWdnZXJlZC5cblx0XHR0aGlzLmJsb2NrUmV2ZWFsQWN0aXZlVGFiID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgb3JpZ2luYXRlc0Zyb21UYWJBY3Rpb25CYXIoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGxldCBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0XHRpZiAoaXNNb3VzZUV2ZW50KGUpKSB7XG5cdFx0XHRlbGVtZW50ID0gKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudCkgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsZW1lbnQgPSAoZSBhcyBHZXN0dXJlRXZlbnQpLmluaXRpYWxUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhZmluZFBhcmVudFdpdGhDbGFzcyhlbGVtZW50LCAnYWN0aW9uLWl0ZW0nLCAndGFiJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRHJvcChlOiBEcmFnRXZlbnQsIHRhcmdldFRhYkluZGV4OiBudW1iZXIsIHRhYnNDb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlLCB0YXJnZXRUYWJJbmRleCk7XG5cdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblxuXHRcdGxldCB0YXJnZXRFZGl0b3JJbmRleCA9IHRoaXMudGFic01vZGVsIGluc3RhbmNlb2YgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsID8gdGFyZ2V0VGFiSW5kZXggKyB0aGlzLmdyb3VwVmlldy5zdGlja3lDb3VudCA6IHRhcmdldFRhYkluZGV4O1xuXHRcdGNvbnN0IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0c3RpY2t5OiB0aGlzLnRhYnNNb2RlbCBpbnN0YW5jZW9mIFN0aWNreUVkaXRvckdyb3VwTW9kZWwgJiYgdGhpcy50YWJzTW9kZWwuc3RpY2t5Q291bnQgPT09IHRhcmdldEVkaXRvckluZGV4LFxuXHRcdFx0aW5kZXg6IHRhcmdldEVkaXRvckluZGV4XG5cdFx0fTtcblxuXHRcdC8vIENoZWNrIGZvciBncm91cCB0cmFuc2ZlclxuXHRcdGlmICh0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdyb3VwVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5nZXRHcm91cChkYXRhWzBdLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRpZiAoc291cmNlR3JvdXApIHtcblx0XHRcdFx0XHRjb25zdCBtZXJnZUdyb3VwT3B0aW9uczogSU1lcmdlR3JvdXBPcHRpb25zID0geyBpbmRleDogdGFyZ2V0RWRpdG9ySW5kZXggfTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNNb3ZlT3BlcmF0aW9uKGUsIHNvdXJjZUdyb3VwLmlkKSkge1xuXHRcdFx0XHRcdFx0bWVyZ2VHcm91cE9wdGlvbnMubW9kZSA9IE1lcmdlR3JvdXBNb2RlLkNPUFlfRURJVE9SUztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcubWVyZ2VHcm91cChzb3VyY2VHcm91cCwgdGhpcy5ncm91cFZpZXcsIG1lcmdlR3JvdXBPcHRpb25zKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZ3JvdXBWaWV3LmZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuZ3JvdXBUcmFuc2Zlci5jbGVhckRhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBlZGl0b3IgdHJhbnNmZXJcblx0XHRlbHNlIGlmICh0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZWRpdG9yVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUdyb3VwID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ2V0R3JvdXAoZGF0YVswXS5pZGVudGlmaWVyLmdyb3VwSWQpO1xuXHRcdFx0XHRpZiAoc291cmNlR3JvdXApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRlIG9mIGRhdGEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGRlLmlkZW50aWZpZXIuZWRpdG9yO1xuXG5cdFx0XHRcdFx0XHQvLyBPbmx5IGFsbG93IG1vdmluZy9jb3B5aW5nIGZyb20gYSBzaW5nbGUgZ3JvdXAgc291cmNlXG5cdFx0XHRcdFx0XHRpZiAoc291cmNlR3JvdXAuaWQgIT09IGRlLmlkZW50aWZpZXIuZ3JvdXBJZCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gS2VlcCB0aGUgc2FtZSBvcmRlciB3aGVuIG1vdmluZyAvIGNvcHlpbmcgZWRpdG9ycyB3aXRoaW4gdGhlIHNhbWUgZ3JvdXBcblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZUVkaXRvckluZGV4ID0gc291cmNlR3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHRcdFx0aWYgKHNvdXJjZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldyAmJiBzb3VyY2VFZGl0b3JJbmRleCA8IHRhcmdldEVkaXRvckluZGV4KSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldEVkaXRvckluZGV4LS07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLmlzTW92ZU9wZXJhdGlvbihlLCBkZS5pZGVudGlmaWVyLmdyb3VwSWQsIGVkaXRvcikpIHtcblx0XHRcdFx0XHRcdFx0c291cmNlR3JvdXAubW92ZUVkaXRvcihlZGl0b3IsIHRoaXMuZ3JvdXBWaWV3LCB7IC4uLm9wdGlvbnMsIGluZGV4OiB0YXJnZXRFZGl0b3JJbmRleCB9KTtcblxuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy50YWJzTW9kZWwgaW5zdGFuY2VvZiBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwgJiYgdGhpcy5ncm91cFZpZXcuaXNTdGlja3koZWRpdG9yKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZ3JvdXBWaWV3LnVuc3RpY2tFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c291cmNlR3JvdXAuY29weUVkaXRvcihlZGl0b3IsIHRoaXMuZ3JvdXBWaWV3LCB7IC4uLm9wdGlvbnMsIGluZGV4OiB0YXJnZXRFZGl0b3JJbmRleCB9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGFyZ2V0RWRpdG9ySW5kZXgrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5ncm91cFZpZXcuZm9jdXMoKTtcblx0XHRcdHRoaXMuZWRpdG9yVHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIHRyZWUgaXRlbXNcblx0XHRlbHNlIGlmICh0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMudHJlZUl0ZW1zVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnM6IElVbnR5cGVkRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGRhdGEpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhVHJhbnNmZXJJdGVtID0gYXdhaXQgdGhpcy50cmVlVmlld3NEcmFnQW5kRHJvcFNlcnZpY2UucmVtb3ZlRHJhZ09wZXJhdGlvblRyYW5zZmVyKGlkLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdGlmIChkYXRhVHJhbnNmZXJJdGVtKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0cmVlRHJvcERhdGEgPSBhd2FpdCBleHRyYWN0VHJlZURyb3BEYXRhKGRhdGFUcmFuc2Zlckl0ZW0pO1xuXHRcdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLnRyZWVEcm9wRGF0YS5tYXAoZWRpdG9yID0+ICh7IC4uLmVkaXRvciwgb3B0aW9uczogeyAuLi5lZGl0b3Iub3B0aW9ucywgcGlubmVkOiB0cnVlLCBpbmRleDogdGFyZ2V0RWRpdG9ySW5kZXggfSB9KSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhlZGl0b3JzLCB0aGlzLmdyb3VwVmlldywgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBVUkkgdHJhbnNmZXJcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGRyb3BIYW5kbGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZXNEcm9wSGFuZGxlciwgeyBhbGxvd1dvcmtzcGFjZU9wZW46IGZhbHNlIH0pO1xuXHRcdFx0ZHJvcEhhbmRsZXIuaGFuZGxlRHJvcChlLCBnZXRXaW5kb3codGhpcy5wYXJlbnQpLCAoKSA9PiB0aGlzLmdyb3VwVmlldywgKCkgPT4gdGhpcy5ncm91cFZpZXcuZm9jdXMoKSwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLnRhYkRpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLnRhYkRpc3Bvc2FibGVzKTtcblx0fVxufVxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXG5cdC8vIEFkZCBib3R0b20gYm9yZGVyIHRvIHRhYnMgd2hlbiB3cmFwcGluZ1xuXHRjb25zdCBib3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKFRBQl9CT1JERVIpO1xuXHRpZiAoYm9yZGVyQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSA+IC50YWJzLWFuZC1hY3Rpb25zLWNvbnRhaW5lci53cmFwcGluZyAudGFicy1jb250YWluZXIgPiAudGFiIHtcblx0XHRcdFx0Ym9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICR7Ym9yZGVyQ29sb3J9O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gU3R5bGluZyB3aXRoIE91dGxpbmUgY29sb3IgKGUuZy4gaGlnaCBjb250cmFzdCB0aGVtZSlcblx0Y29uc3QgYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyKTtcblx0aWYgKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmU6aG92ZXIgIHtcblx0XHRcdFx0b3V0bGluZTogMXB4IHNvbGlkO1xuXHRcdFx0XHRvdXRsaW5lLW9mZnNldDogLTVweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zZWxlY3RlZDpub3QoLmFjdGl2ZSk6bm90KDpob3ZlcikgIHtcblx0XHRcdFx0b3V0bGluZTogMXB4IGRvdHRlZDtcblx0XHRcdFx0b3V0bGluZS1vZmZzZXQ6IC01cHg7XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50IC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyLmFjdGl2ZSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLmFjdGl2ZTpmb2N1cyB7XG5cdFx0XHRcdG91dGxpbmUtc3R5bGU6IGRhc2hlZDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmUge1xuXHRcdFx0XHRvdXRsaW5lOiAxcHggZGFzaGVkO1xuXHRcdFx0XHRvdXRsaW5lLW9mZnNldDogLTVweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpob3ZlciAge1xuXHRcdFx0XHRvdXRsaW5lOiAxcHggZGFzaGVkO1xuXHRcdFx0XHRvdXRsaW5lLW9mZnNldDogLTVweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmUgPiAudGFiLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50IC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuYWN0aXZlOmhvdmVyID4gLnRhYi1hY3Rpb25zIC5hY3Rpb24tbGFiZWwsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLmRpcnR5ID4gLnRhYi1hY3Rpb25zIC5hY3Rpb24tbGFiZWwsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnN0aWNreSA+IC50YWItYWN0aW9ucyAuYWN0aW9uLWxhYmVsLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpob3ZlciA+IC50YWItYWN0aW9ucyAuYWN0aW9uLWxhYmVsIHtcblx0XHRcdFx0b3BhY2l0eTogMSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gSGlnaCBDb250cmFzdCBCb3JkZXIgQ29sb3IgZm9yIEVkaXRvciBBY3Rpb25zXG5cdGNvbnN0IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihjb250cmFzdEJvcmRlcik7XG5cdGlmIChjb250cmFzdEJvcmRlckNvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLmVkaXRvci1hY3Rpb25zIHtcblx0XHRcdFx0b3V0bGluZTogMXB4IHNvbGlkICR7Y29udHJhc3RCb3JkZXJDb2xvcn1cblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdC8vIEhvdmVyIEJhY2tncm91bmRcblx0Y29uc3QgdGFiSG92ZXJCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEFCX0hPVkVSX0JBQ0tHUk9VTkQpO1xuXHRpZiAodGFiSG92ZXJCYWNrZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWI6bm90KC5zZWxlY3RlZCk6aG92ZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke3RhYkhvdmVyQmFja2dyb3VuZH0gIWltcG9ydGFudDtcblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdGNvbnN0IHRhYlVuZm9jdXNlZEhvdmVyQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfSE9WRVJfQkFDS0dST1VORCk7XG5cdGlmICh0YWJVbmZvY3VzZWRIb3ZlckJhY2tncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiOm5vdCguc2VsZWN0ZWQpOmhvdmVyICB7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7dGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kfSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gSG92ZXIgRm9yZWdyb3VuZFxuXHRjb25zdCB0YWJIb3ZlckZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihUQUJfSE9WRVJfRk9SRUdST1VORCk7XG5cdGlmICh0YWJIb3ZlckZvcmVncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpub3QoLnNlbGVjdGVkKTpob3ZlciAge1xuXHRcdFx0XHRjb2xvcjogJHt0YWJIb3ZlckZvcmVncm91bmR9ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHRjb25zdCB0YWJVbmZvY3VzZWRIb3ZlckZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihUQUJfVU5GT0NVU0VEX0hPVkVSX0ZPUkVHUk9VTkQpO1xuXHRpZiAodGFiVW5mb2N1c2VkSG92ZXJGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpub3QoLnNlbGVjdGVkKTpob3ZlciAge1xuXHRcdFx0XHRjb2xvcjogJHt0YWJVbmZvY3VzZWRIb3ZlckZvcmVncm91bmR9ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHQvLyBIb3ZlciBCb3JkZXJcblx0Ly9cblx0Ly8gVW5mb3J0dW5hdGVseSB3ZSBuZWVkIHRvIGNvcHkgYSBsb3Qgb2YgQ1NTIG92ZXIgZnJvbSB0aGVcblx0Ly8gbXVsdGlFZGl0b3JUYWJzQ29udHJvbC5jc3MgYmVjYXVzZSB3ZSB3YW50IHRvIHJldXNlIHRoZSBzYW1lXG5cdC8vIHN0eWxlcyB3ZSBhbHJlYWR5IGhhdmUgZm9yIHRoZSBub3JtYWwgYm90dG9tLWJvcmRlci5cblx0Y29uc3QgdGFiSG92ZXJCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihUQUJfSE9WRVJfQk9SREVSKTtcblx0aWYgKHRhYkhvdmVyQm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWI6aG92ZXIgPiAudGFiLWJvcmRlci1ib3R0b20tY29udGFpbmVyIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0bGVmdDogMDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7XG5cdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHR6LWluZGV4OiAxMDtcblx0XHRcdFx0Ym90dG9tOiAwO1xuXHRcdFx0XHRoZWlnaHQ6IDFweDtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHt0YWJIb3ZlckJvcmRlcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHRjb25zdCB0YWJVbmZvY3VzZWRIb3ZlckJvcmRlciA9IHRoZW1lLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfSE9WRVJfQk9SREVSKTtcblx0aWYgKHRhYlVuZm9jdXNlZEhvdmVyQm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpob3ZlciA+IC50YWItYm9yZGVyLWJvdHRvbS1jb250YWluZXIgIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0bGVmdDogMDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7XG5cdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHR6LWluZGV4OiAxMDtcblx0XHRcdFx0Ym90dG9tOiAwO1xuXHRcdFx0XHRoZWlnaHQ6IDFweDtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHt0YWJVbmZvY3VzZWRIb3ZlckJvcmRlcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHQvLyBGYWRlIG91dCBzdHlsZXMgdmlhIGxpbmVhciBncmFkaWVudCAod2hlbiB0YWJzIGFyZSBzZXQgdG8gc2hyaW5rIG9yIGZpeGVkKVxuXHQvLyBCdXQgbm90IHdoZW46XG5cdC8vIC0gaW4gaGlnaCBjb250cmFzdCB0aGVtZVxuXHQvLyAtIGlmIHdlIGhhdmUgYSBjb250cmFzdCBib3JkZXIgKHdoaWNoIGRyYXdzIGFuIG91dGxpbmUgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA5MTE3KVxuXHQvLyAtIG9uIFNhZmFyaSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwODk5Nilcblx0aWYgKCFpc0hpZ2hDb250cmFzdCh0aGVtZS50eXBlKSAmJiAhaXNTYWZhcmkgJiYgIWFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IpIHtcblx0XHRjb25zdCB3b3JrYmVuY2hCYWNrZ3JvdW5kID0gV09SS0JFTkNIX0JBQ0tHUk9VTkQodGhlbWUpO1xuXHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwSGVhZGVyVGFic0JhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQkFDS0dST1VORCk7XG5cdFx0Y29uc3QgZWRpdG9yRHJhZ0FuZERyb3BCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCk7XG5cblx0XHRsZXQgYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kOiBDb2xvciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZWRpdG9yR3JvdXBIZWFkZXJUYWJzQmFja2dyb3VuZCAmJiBlZGl0b3JCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRcdGFkanVzdGVkVGFiQmFja2dyb3VuZCA9IGVkaXRvckdyb3VwSGVhZGVyVGFic0JhY2tncm91bmQuZmxhdHRlbihlZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIGVkaXRvckJhY2tncm91bmRDb2xvciwgd29ya2JlbmNoQmFja2dyb3VuZCk7XG5cdFx0fVxuXG5cdFx0bGV0IGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQ6IENvbG9yIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChlZGl0b3JHcm91cEhlYWRlclRhYnNCYWNrZ3JvdW5kICYmIGVkaXRvckJhY2tncm91bmRDb2xvciAmJiBlZGl0b3JEcmFnQW5kRHJvcEJhY2tncm91bmQgJiYgZWRpdG9yQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0XHRhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kID0gZWRpdG9yR3JvdXBIZWFkZXJUYWJzQmFja2dyb3VuZC5mbGF0dGVuKGVkaXRvckJhY2tncm91bmRDb2xvciwgZWRpdG9yRHJhZ0FuZERyb3BCYWNrZ3JvdW5kLCBlZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIHdvcmtiZW5jaEJhY2tncm91bmQpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgZm9jdXNlZCBhbmQgdW5mb2N1c2VkIGhvdmVyIGJhY2tncm91bmRcblx0XHRjb25zdCBtYWtlVGFiSG92ZXJCYWNrZ3JvdW5kUnVsZSA9IChjb2xvcjogQ29sb3IsIGNvbG9yRHJhZzogQ29sb3IsIGhhc0ZvY3VzID0gZmFsc2UpID0+IGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50Om5vdCguZHJhZ2dlZC1vdmVyKSAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciR7aGFzRm9jdXMgPyAnLmFjdGl2ZScgOiAnJ30gPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctc2hyaW5rOm5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCk6aG92ZXIgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudDpub3QoLmRyYWdnZWQtb3ZlcikgLmVkaXRvci1ncm91cC1jb250YWluZXIke2hhc0ZvY3VzID8gJy5hY3RpdmUnIDogJyd9ID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLWZpeGVkOm5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCk6aG92ZXIgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQodG8gbGVmdCwgJHtjb2xvcn0sIHRyYW5zcGFyZW50KSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudC5kcmFnZ2VkLW92ZXIgLmVkaXRvci1ncm91cC1jb250YWluZXIke2hhc0ZvY3VzID8gJy5hY3RpdmUnIDogJyd9ID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLXNocmluazpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpOmhvdmVyID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQuZHJhZ2dlZC1vdmVyIC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyJHtoYXNGb2N1cyA/ICcuYWN0aXZlJyA6ICcnfSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnNpemluZy1maXhlZDpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpOmhvdmVyID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyIHtcblx0XHRcdFx0YmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KHRvIGxlZnQsICR7Y29sb3JEcmFnfSwgdHJhbnNwYXJlbnQpICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0YDtcblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgKGZvY3VzZWQpIGhvdmVyIGJhY2tncm91bmRcblx0XHRpZiAodGFiSG92ZXJCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShtYWtlVGFiSG92ZXJCYWNrZ3JvdW5kUnVsZShhZGp1c3RlZENvbG9yLCBhZGp1c3RlZENvbG9yRHJhZywgdHJ1ZSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgdW5mb2N1c2VkIGhvdmVyIGJhY2tncm91bmRcblx0XHRpZiAodGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShtYWtlVGFiSG92ZXJCYWNrZ3JvdW5kUnVsZShhZGp1c3RlZENvbG9yLCBhZGp1c3RlZENvbG9yRHJhZykpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgZHJhZyBhbmQgZHJvcCBiYWNrZ3JvdW5kXG5cdFx0aWYgKGVkaXRvckRyYWdBbmREcm9wQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yRHJhZyA9IGVkaXRvckRyYWdBbmREcm9wQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpO1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudC5kcmFnZ2VkLW92ZXIgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLXNocmluay5kcmFnZ2VkLW92ZXI6bm90KC5hY3RpdmUpOm5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCkgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIsXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50LmRyYWdnZWQtb3ZlciAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lcjpub3QoLmFjdGl2ZSkgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctc2hyaW5rLmRyYWdnZWQtb3Zlcjpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyLFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudC5kcmFnZ2VkLW92ZXIgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLWZpeGVkLmRyYWdnZWQtb3Zlcjpub3QoLmFjdGl2ZSk6bm90KC5kcmFnZ2VkKTpub3QoLnN0aWNreS1jb21wYWN0KSA+IC50YWItbGFiZWwgPiAubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyOjphZnRlcixcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQuZHJhZ2dlZC1vdmVyIC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyOm5vdCguYWN0aXZlKSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnNpemluZy1maXhlZC5kcmFnZ2VkLW92ZXI6bm90KC5kcmFnZ2VkKTpub3QoLnN0aWNreS1jb21wYWN0KSA+IC50YWItbGFiZWwgPiAubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyOjphZnRlciB7XG5cdFx0XHRcdFx0YmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KHRvIGxlZnQsICR7YWRqdXN0ZWRDb2xvckRyYWd9LCB0cmFuc3BhcmVudCkgIWltcG9ydGFudDtcblx0XHRcdFx0fVxuXHRcdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1ha2VUYWJCYWNrZ3JvdW5kUnVsZSA9IChjb2xvcjogQ29sb3IsIGNvbG9yRHJhZzogQ29sb3IsIGZvY3VzZWQ6IGJvb2xlYW4sIGFjdGl2ZTogYm9vbGVhbikgPT4gYFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudDpub3QoLmRyYWdnZWQtb3ZlcikgLmVkaXRvci1ncm91cC1jb250YWluZXIke2ZvY3VzZWQgPyAnLmFjdGl2ZScgOiAnOm5vdCguYWN0aXZlKSd9ID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLXNocmluayR7YWN0aXZlID8gJy5hY3RpdmUnIDogJyd9Om5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCkgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIsXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50Om5vdCguZHJhZ2dlZC1vdmVyKSAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciR7Zm9jdXNlZCA/ICcuYWN0aXZlJyA6ICc6bm90KC5hY3RpdmUpJ30gPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctZml4ZWQke2FjdGl2ZSA/ICcuYWN0aXZlJyA6ICcnfTpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyIHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQodG8gbGVmdCwgJHtjb2xvcn0sIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50LmRyYWdnZWQtb3ZlciAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciR7Zm9jdXNlZCA/ICcuYWN0aXZlJyA6ICc6bm90KC5hY3RpdmUpJ30gPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctc2hyaW5rJHthY3RpdmUgPyAnLmFjdGl2ZScgOiAnJ306bm90KC5kcmFnZ2VkKTpub3QoLnN0aWNreS1jb21wYWN0KSA+IC50YWItbGFiZWwgPiAubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyOjphZnRlcixcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQuZHJhZ2dlZC1vdmVyIC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyJHtmb2N1c2VkID8gJy5hY3RpdmUnIDogJzpub3QoLmFjdGl2ZSknfSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnNpemluZy1maXhlZCR7YWN0aXZlID8gJy5hY3RpdmUnIDogJyd9Om5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCkgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIge1xuXHRcdFx0XHRcdGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCh0byBsZWZ0LCAke2NvbG9yRHJhZ30sIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0fVxuXHRcdGA7XG5cblx0XHQvLyBBZGp1c3QgZ3JhZGllbnQgZm9yIGZvY3VzZWQgYWN0aXZlIHRhYiBiYWNrZ3JvdW5kXG5cdFx0Y29uc3QgdGFiQWN0aXZlQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRBQl9BQ1RJVkVfQkFDS0dST1VORCk7XG5cdFx0aWYgKHRhYkFjdGl2ZUJhY2tncm91bmQgJiYgYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpIHtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3IgPSB0YWJBY3RpdmVCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiQWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpO1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUobWFrZVRhYkJhY2tncm91bmRSdWxlKGFkanVzdGVkQ29sb3IsIGFkanVzdGVkQ29sb3JEcmFnLCB0cnVlLCB0cnVlKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRqdXN0IGdyYWRpZW50IGZvciB1bmZvY3VzZWQgYWN0aXZlIHRhYiBiYWNrZ3JvdW5kXG5cdFx0Y29uc3QgdGFiVW5mb2N1c2VkQWN0aXZlQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfQUNUSVZFX0JBQ0tHUk9VTkQpO1xuXHRcdGlmICh0YWJVbmZvY3VzZWRBY3RpdmVCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiVW5mb2N1c2VkQWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiQmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yRHJhZyA9IHRhYlVuZm9jdXNlZEFjdGl2ZUJhY2tncm91bmQuZmxhdHRlbihhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKG1ha2VUYWJCYWNrZ3JvdW5kUnVsZShhZGp1c3RlZENvbG9yLCBhZGp1c3RlZENvbG9yRHJhZywgZmFsc2UsIHRydWUpKTtcblx0XHR9XG5cblx0XHQvLyBBZGp1c3QgZ3JhZGllbnQgZm9yIGZvY3VzZWQgaW5hY3RpdmUgdGFiIGJhY2tncm91bmRcblx0XHRjb25zdCB0YWJJbmFjdGl2ZUJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihUQUJfSU5BQ1RJVkVfQkFDS0dST1VORCk7XG5cdFx0aWYgKHRhYkluYWN0aXZlQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkJhY2tncm91bmQgJiYgYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCkge1xuXHRcdFx0Y29uc3QgYWRqdXN0ZWRDb2xvciA9IHRhYkluYWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiQmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yRHJhZyA9IHRhYkluYWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpO1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUobWFrZVRhYkJhY2tncm91bmRSdWxlKGFkanVzdGVkQ29sb3IsIGFkanVzdGVkQ29sb3JEcmFnLCB0cnVlLCBmYWxzZSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgdW5mb2N1c2VkIGluYWN0aXZlIHRhYiBiYWNrZ3JvdW5kXG5cdFx0Y29uc3QgdGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEFCX1VORk9DVVNFRF9JTkFDVElWRV9CQUNLR1JPVU5EKTtcblx0XHRpZiAodGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShtYWtlVGFiQmFja2dyb3VuZFJ1bGUoYWRqdXN0ZWRDb2xvciwgYWRqdXN0ZWRDb2xvckRyYWcsIGZhbHNlLCBmYWxzZSkpO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCLFdBQStCLGtCQUFrQiw0QkFBNEIseUJBQThDLG9CQUFvQixtQkFBbUIsb0JBQXFDO0FBRXhPLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxnQkFBOEIsZUFBZTtBQUNuRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0MsZ0NBQWdDO0FBQ3pFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMsbUNBQW1DLHlCQUF5QjtBQUNyRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFzQixTQUFTLGlCQUFpQixvQkFBb0IsbUJBQW1CLG9CQUFvQjtBQUMzRyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWUsa0NBQWtDO0FBQzFELFNBQVMseUJBQXlCLHVCQUF1QixZQUFZLGlDQUFpQyxpQ0FBaUMsNkJBQTZCLG1CQUFtQixzQkFBc0Isa0JBQWtCLGdDQUFnQyw0QkFBNEIscUNBQXFDLHNCQUFzQix1QkFBdUIsaUNBQWlDLDRCQUE0Qiw4QkFBOEIsc0NBQXNDLHdDQUF3QyxtQ0FBbUMsc0JBQXNCLGdDQUFnQyxpQ0FBaUMsd0JBQXdCLCtCQUErQjtBQUN2c0IsU0FBUyxzQkFBc0IsZ0JBQWdCLHdCQUF3QjtBQUN2RSxTQUFTLHNCQUFzQix5QkFBeUIsOEJBQThCLHFCQUFxQiwyQkFBMkI7QUFFdEksU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBMEM7QUFDbkQsU0FBUyx1QkFBdUIsV0FBVyxhQUFhLFdBQVcsOEJBQThCLHFCQUFxQixXQUFXLHFCQUFxQixjQUFjLFdBQVcsb0JBQW9CLFNBQVM7QUFDNU0sU0FBUyxnQkFBZ0I7QUFDekIsU0FBb0ksOEJBQThCO0FBQ2xLLFNBQVMsc0JBQXNCLG1DQUFtQyx5QkFBeUI7QUFDM0YsU0FBUyx5QkFBeUIsNEJBQTRCO0FBQzlELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQWdCLE9BQU8sYUFBYTtBQUNwQyxTQUFTLFVBQVUsY0FBYztBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0M7QUFDakQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyx3QkFBd0IsZ0NBQWdDO0FBRWpFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0scUJBQXFCLG1CQUFtQixZQUFZO0FBOEJuRCxJQUFNLHlCQUFOLGNBQXFDLGtCQUFrQjtBQUFBLEVBc0Q3RCxZQUNDLFFBQ0EsaUJBQ0EsWUFDQSxXQUNBLFdBQ0EsU0FDQSxxQkFDcUIsb0JBQ0Usc0JBQ0gsbUJBQ0EsbUJBQ0UscUJBQ0YsbUJBQ0wsY0FDa0IsZUFDRixhQUNRLDZCQUNmLHVCQUNWLGFBQ0EsYUFDYjtBQUNELFVBQU0sUUFBUSxpQkFBaUIsWUFBWSxXQUFXLFdBQVcsU0FBUyxxQkFBcUIsb0JBQW9CLHNCQUFzQixtQkFBbUIsbUJBQW1CLHFCQUFxQixtQkFBbUIsY0FBYyx1QkFBdUIsYUFBYSxXQUFXO0FBUG5QO0FBQ0Y7QUFDUTtBQTVDeEMsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixxQkFBcUIsSUFBSSxxQkFBcUIsS0FBSyxDQUFDO0FBQ3ZLLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSxtQkFBbUIsa0JBQWtCLElBQUksa0JBQWtCLEtBQUssQ0FBQztBQUM5SixTQUFpQixvQ0FBb0MsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsbUNBQW1DLGtDQUFrQyxJQUFJLGtDQUFrQyxLQUFLLENBQUM7QUFLOU4sU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLGdCQUFnQix3QkFBd0IsQ0FBQztBQUN0SSxTQUFRLFlBQWlDLENBQUM7QUFHMUMsU0FBUSxnQkFBNkIsQ0FBQztBQUN0QyxTQUFRLGlCQUFnQyxDQUFDO0FBRXpDLFNBQVEsYUFBbUU7QUFBQSxNQUMxRSxXQUFXLFVBQVU7QUFBQSxNQUNyQixXQUFXLFVBQVU7QUFBQSxJQUN0QjtBQUVBLFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxrQkFBMEQsQ0FBQztBQUdqSCxTQUFRLE9BQWMsWUFBWSxRQUFRO0FBRTFDLFNBQVEsMEJBQTBCO0FBQ2xDLFNBQVEsa0JBQWtCO0FBc25CMUIsU0FBUSw2QkFBNkIsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU0sS0FBSyxxQkFBcUIsR0FBRyxDQUFDLENBQUM7QUF6bEI3RyxLQUFDLFlBQVksS0FBSyxPQUFPLE1BQU0sS0FBSyxZQUFZLE1BQU07QUFHdEQsU0FBSyxVQUFVLEtBQUssa0JBQWtCLHVCQUF1QixNQUFNLEtBQUssMEJBQTBCLENBQUMsQ0FBQztBQUlwRyxTQUFLLHlCQUF5QixtQkFBbUIsVUFBVTtBQUMzRCxTQUFLLFVBQVUsbUJBQW1CLE1BQU0sTUFBTSxLQUFLLDRCQUE0QixDQUFDLENBQUM7QUFBQSxFQUNsRjtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFVBQU0seUJBQXlCLG1CQUFtQixVQUFVO0FBQzVELFFBQUksMkJBQTJCLEtBQUssd0JBQXdCO0FBQzNEO0FBQUEsSUFDRDtBQUVBLFNBQUsseUJBQXlCO0FBRzlCLFNBQUssV0FBVyxDQUFDLFFBQVEsVUFBVSxjQUFjLGdCQUFnQixVQUFVLGlCQUFpQjtBQUMzRixXQUFLLGdCQUFnQixRQUFRLFVBQVUsY0FBYyxZQUFZO0FBQUEsSUFDbEUsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVtQixPQUFPLFFBQWtDO0FBQzNELFVBQU0sT0FBTyxNQUFNO0FBRW5CLFNBQUssaUJBQWlCO0FBR3RCLFNBQUssMEJBQTBCLEVBQUUsNkJBQTZCO0FBQzlELFNBQUssZUFBZSxZQUFZLEtBQUssdUJBQXVCO0FBRTVELFNBQUssdUJBQXVCLEVBQUUsMkJBQTJCLEVBQUUsZUFBZSxLQUFLLENBQUM7QUFHaEYsU0FBSyxnQkFBZ0IsRUFBRSxtQkFBbUI7QUFBQSxNQUN6QyxNQUFNO0FBQUEsTUFDTix3QkFBd0I7QUFBQSxNQUN4QixXQUFXO0FBQUEsSUFDWixDQUFDO0FBQ0QsU0FBSyxVQUFVLFFBQVEsVUFBVSxLQUFLLGFBQWEsQ0FBQztBQUVwRCxTQUFLLDRCQUE0QixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUNyRSxTQUFLLGdCQUFnQixLQUFLO0FBRzFCLFNBQUssZ0JBQWdCLEtBQUssb0JBQW9CLEtBQUssYUFBYTtBQUNoRSxTQUFLLHdCQUF3QixZQUFZLEtBQUssY0FBYyxXQUFXLENBQUM7QUFDeEUsU0FBSyxjQUFjLFdBQVcsRUFBRSxZQUFZLEtBQUssb0JBQW9CO0FBR3JFLFNBQUssK0JBQStCLEtBQUssZUFBZSxLQUFLLGFBQWE7QUFNMUUsUUFBSSxLQUFLLFNBQVMsZUFBZTtBQUNoQyxXQUFLLGtCQUFrQixLQUFLLG9CQUFvQixLQUFLLGVBQWUsS0FBSyxRQUFRLGFBQWE7QUFBQSxJQUMvRjtBQUdBLFNBQUssMkJBQTJCLEtBQUsseUJBQXlCLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLEtBQUssU0FBUyxhQUFhO0FBRy9HLFNBQUssNEJBQTRCO0FBRWpDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVksV0FBbUI7QUFDOUIsVUFBTSxnQkFBZ0IscUJBQXFCLEtBQUssYUFBYTtBQUM3RCxXQUFPLEtBQUssa0JBQWtCLGNBQWMsU0FBUyxTQUFTLElBQUksY0FBYyxTQUFTO0FBQUEsRUFDMUY7QUFBQSxFQUVRLFVBQVUsS0FBa0IsZUFBa0M7QUFDckUsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixvQkFBYyxhQUFhLEtBQUssS0FBSyxlQUFlO0FBQUEsSUFDckQsT0FBTztBQUNOLG9CQUFjLFlBQVksR0FBRztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRVEsY0FBYyxlQUFrQztBQUN2RCxRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFdBQUssZ0JBQWdCLHdCQUF3QixPQUFPO0FBQUEsSUFDckQsT0FBTztBQUNOLG9CQUFjLFdBQVcsT0FBTztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9CLFlBQTRDO0FBQ3ZFLFVBQU0sZ0JBQWdCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixZQUFZO0FBQUEsTUFDdEUsWUFBWSxLQUFLLDJCQUEyQjtBQUFBLE1BQzVDLHlCQUF5QixLQUFLLHVCQUF1QjtBQUFBLE1BQ3JELFVBQVUsb0JBQW9CO0FBQUEsTUFDOUIsWUFBWTtBQUFBLE1BQ1osWUFBWTtBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLGNBQWMsU0FBUyxPQUFLO0FBQzFDLFVBQUksRUFBRSxtQkFBbUI7QUFDeEIsbUJBQVcsYUFBYSxFQUFFO0FBQUEsTUFDM0I7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw0QkFBa0M7QUFDekMsU0FBSyxlQUFlLGNBQWM7QUFBQSxNQUNqQyx5QkFBeUIsS0FBSyx1QkFBdUI7QUFBQSxJQUN0RCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsZ0NBQXNDO0FBQzdDLFNBQUssZUFBZSxjQUFjO0FBQUEsTUFDakMsWUFBWSxLQUFLLDJCQUEyQjtBQUFBLElBQzdDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxnQkFBZ0IsV0FBMEI7QUFDakQsVUFBTSxDQUFDLGVBQWUseUJBQXlCLElBQUksd0JBQXdCLEtBQUssZUFBZSxLQUFLLHlCQUF5QjtBQUU3SCw4QkFBMEIsTUFBTTtBQUVoQyxVQUFNLFVBQVUsS0FBSyxXQUFXO0FBQ2hDLFFBQUksUUFBUSxjQUFjLFNBQVM7QUFDbEMsb0JBQWMsTUFBTSxZQUFZLGdDQUFnQyxHQUFHLFFBQVEsc0JBQXNCLElBQUk7QUFDckcsb0JBQWMsTUFBTSxZQUFZLGdDQUFnQyxHQUFHLFFBQVEsc0JBQXNCLElBQUk7QUFPckcsZ0NBQTBCLElBQUksc0JBQXNCLGVBQWUsVUFBVSxhQUFhLE1BQU07QUFDL0YsYUFBSyxrQkFBa0I7QUFBQSxNQUN4QixDQUFDLENBQUM7QUFDRixnQ0FBMEIsSUFBSSxzQkFBc0IsZUFBZSxVQUFVLGFBQWEsTUFBTTtBQUMvRixhQUFLLGtCQUFrQjtBQUN2QixhQUFLLHFCQUFxQixLQUFLO0FBQUEsTUFDaEMsQ0FBQyxDQUFDO0FBQUEsSUFDSCxXQUFXLFdBQVc7QUFDckIsb0JBQWMsTUFBTSxlQUFlLDhCQUE4QjtBQUNqRSxvQkFBYyxNQUFNLGVBQWUsOEJBQThCO0FBQ2pFLFdBQUsscUJBQXFCLEtBQUs7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixPQUFzQjtBQUNsRCxTQUFLLFdBQVcsQ0FBQyxRQUFRLFVBQVUsaUJBQWlCO0FBQ25ELFVBQUksT0FBTztBQUNWLGNBQU0sRUFBRSxNQUFNLElBQUksYUFBYSxzQkFBc0I7QUFDckQscUJBQWEsTUFBTSxZQUFZLDhCQUE4QixHQUFHLEtBQUssSUFBSTtBQUFBLE1BQzFFLE9BQU87QUFDTixxQkFBYSxNQUFNLGVBQWUsNEJBQTRCO0FBQUEsTUFDL0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx5QkFBaUM7QUFDeEMsUUFBSSxLQUFLLFdBQVcsWUFBWSx5QkFBeUIsU0FBUztBQUNqRSxhQUFPLHVCQUF1QixnQkFBZ0I7QUFBQSxJQUMvQztBQUVBLFdBQU8sdUJBQXVCLGdCQUFnQjtBQUFBLEVBQy9DO0FBQUEsRUFFUSw2QkFBa0Q7QUFDekQsWUFBUSxLQUFLLFdBQVcsWUFBWSwwQkFBMEI7QUFBQSxNQUM3RCxLQUFLO0FBQVcsZUFBTyxvQkFBb0I7QUFBQSxNQUMzQyxLQUFLO0FBQVUsZUFBTyxvQkFBb0I7QUFBQSxNQUMxQztBQUFTLGVBQU8sb0JBQW9CO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQUEsRUFFUSwrQkFBK0IsZUFBNEIsZUFBd0M7QUFHMUcsU0FBSyxVQUFVLHNCQUFzQixlQUFlLFVBQVUsUUFBUSxNQUFNO0FBQzNFLFVBQUksY0FBYyxVQUFVLFNBQVMsUUFBUSxHQUFHO0FBQy9DLHNCQUFjLGtCQUFrQjtBQUFBLFVBQy9CLFlBQVksY0FBYztBQUFBO0FBQUEsUUFDM0IsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLGVBQVcsYUFBYSxDQUFDLGVBQWUsS0FBSyxVQUFVLFFBQVEsR0FBRztBQUNqRSxXQUFLLFVBQVUsc0JBQXNCLGVBQWUsV0FBVyxDQUFDLE1BQWlDO0FBQ2hHLFlBQUksY0FBYyxVQUFVLFVBQVU7QUFDckMsY0FBSSxFQUFFLFdBQVcsZUFBZTtBQUMvQjtBQUFBLFVBQ0Q7QUFBQSxRQUNELE9BQU87QUFDTixjQUFtQixFQUFHLGFBQWEsR0FBRztBQUNyQztBQUFBLFVBQ0Q7QUFFQSxjQUFtQixFQUFHLGtCQUFrQixlQUFlO0FBQ3REO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxvQkFBWSxLQUFLLENBQUM7QUFFbEIsYUFBSyxjQUFjLFdBQVc7QUFBQSxVQUM3QixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsWUFDUixRQUFRO0FBQUEsWUFDUixPQUFPLEtBQUssVUFBVTtBQUFBO0FBQUEsWUFDdEIsVUFBVSwyQkFBMkI7QUFBQSxVQUN0QztBQUFBLFFBQ0QsR0FBRyxLQUFLLFVBQVUsRUFBRTtBQUFBLE1BQ3JCLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFHQSxTQUFLLFVBQVUsc0JBQXNCLGVBQWUsVUFBVSxZQUFZLE9BQUs7QUFDOUUsVUFBSSxFQUFFLFdBQVcsR0FBRztBQUNuQixVQUFFLGVBQWU7QUFBQSxNQUNsQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsUUFBSSxTQUFTO0FBQ1osV0FBSyxVQUFVLHNCQUFzQixlQUFlLFVBQVUsVUFBVSxPQUFLO0FBQzVFLFlBQUksRUFBRSxXQUFXLEdBQUc7QUFDbkIsWUFBRSxlQUFlO0FBQUEsUUFDbEI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFHQSxRQUFJLGdCQUF1QztBQUMzQyxRQUFJLHVCQUF1QjtBQUMzQixTQUFLLFVBQVUsSUFBSSxvQkFBb0IsZUFBZTtBQUFBLE1BQ3JELGFBQWEsT0FBSztBQUNqQiwrQkFBdUIsS0FBSyxpQkFBaUIsR0FBRyxhQUFhO0FBQUEsTUFDOUQ7QUFBQSxNQUVBLFFBQVEsT0FBSztBQUNaLHdCQUFnQjtBQUFBLE1BQ2pCO0FBQUEsTUFFQSxhQUFhLE9BQUs7QUFHakIsc0JBQWMsVUFBVSxJQUFJLFFBQVE7QUFHcEMsWUFBSSxFQUFFLFdBQVcsZUFBZTtBQUMvQjtBQUFBLFFBQ0Q7QUFHQSxZQUFJLENBQUMsS0FBSyx3QkFBd0IsQ0FBQyxHQUFHO0FBQ3JDLGNBQUksRUFBRSxjQUFjO0FBQ25CLGNBQUUsYUFBYSxhQUFhO0FBQUEsVUFDN0I7QUFFQTtBQUFBLFFBQ0Q7QUFJQSxZQUFJLENBQUMsS0FBSyxlQUFlLFFBQVEsd0JBQXdCLFNBQVMsR0FBRztBQUNwRSxjQUFJLEVBQUUsY0FBYztBQUNuQixjQUFFLGFBQWEsYUFBYTtBQUFBLFVBQzdCO0FBQUEsUUFDRDtBQUVBLGFBQUssbUJBQW1CLGVBQWUsTUFBTSxDQUFDO0FBQUEsTUFDL0M7QUFBQSxNQUVBLGFBQWEsT0FBSztBQUNqQixhQUFLLG1CQUFtQixlQUFlLE9BQU8sQ0FBQztBQUMvQyxzQkFBYyxVQUFVLE9BQU8sUUFBUTtBQUFBLE1BQ3hDO0FBQUEsTUFFQSxXQUFXLE9BQUs7QUFDZixhQUFLLG1CQUFtQixlQUFlLE9BQU8sQ0FBQztBQUMvQyxzQkFBYyxVQUFVLE9BQU8sUUFBUTtBQUV2QyxhQUFLLGVBQWUsR0FBRyxlQUFlLGVBQWUsb0JBQW9CO0FBQUEsTUFDMUU7QUFBQSxNQUVBLFFBQVEsT0FBSztBQUNaLGFBQUssbUJBQW1CLGVBQWUsT0FBTyxDQUFDO0FBQy9DLHNCQUFjLFVBQVUsT0FBTyxRQUFRO0FBRXZDLFlBQUksRUFBRSxXQUFXLGVBQWU7QUFDL0IsZ0JBQU0sa0JBQWtCLEtBQUssY0FBYyxRQUFRLDZCQUE2QixTQUFTO0FBQ3pGLGVBQUssT0FBTyxHQUFHLGtCQUFrQixLQUFLLFVBQVUsUUFBUSxLQUFLLFVBQVUsT0FBTyxhQUFhO0FBQUEsUUFDNUY7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsc0JBQXNCLGVBQWUsVUFBVSxhQUFhLENBQUMsTUFBa0I7QUFDN0YsWUFBTSxlQUFlLEtBQUssVUFBVTtBQUNwQyxVQUFJLENBQUMsZ0JBQWdCLEtBQUssVUFBVSxRQUFRLEdBQUc7QUFDOUM7QUFBQSxNQUNEO0FBR0EsVUFBSSxLQUFLLFdBQVcsWUFBWSx1QkFBdUIsTUFBTTtBQUM1RCxZQUFJLEVBQUUsVUFBVTtBQUNmO0FBQUEsUUFDRDtBQUFBLE1BQ0QsT0FBTztBQUNOLFlBQUksQ0FBQyxFQUFFLFVBQVU7QUFDaEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUtBLFlBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsVUFBSSxNQUFNLEtBQUssMEJBQTBCLHVCQUF1Qiw4QkFBOEIsS0FBSyxLQUFLLElBQUksRUFBRSxNQUFNLElBQUksS0FBSyxJQUFJLEVBQUUsTUFBTSxJQUFJO0FBQzVJO0FBQUEsTUFDRDtBQUVBLFdBQUssMEJBQTBCO0FBRy9CLFVBQUk7QUFDSixVQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBRSx1QkFBdUIsZ0NBQWdDO0FBQ2xGLDZCQUFxQjtBQUFBLE1BQ3RCLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyx1QkFBdUIsZ0NBQWdDO0FBQ3ZGLDZCQUFxQjtBQUFBLE1BQ3RCLE9BQU87QUFDTjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsS0FBSyxVQUFVLGlCQUFpQixLQUFLLFVBQVUsaUJBQWlCLFlBQVksSUFBSSxrQkFBa0I7QUFDckgsVUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxNQUNEO0FBR0EsV0FBSyxVQUFVLFdBQVcsVUFBVTtBQUdwQyxrQkFBWSxLQUFLLEdBQUcsSUFBSTtBQUFBLElBQ3pCLENBQUMsQ0FBQztBQUdGLFVBQU0sa0JBQWtCLENBQUMsTUFBYTtBQUNyQyxrQkFBWSxLQUFLLENBQUM7QUFHbEIsVUFBSSxTQUEyQztBQUMvQyxVQUFJLGFBQWEsQ0FBQyxHQUFHO0FBQ3BCLGlCQUFTLElBQUksbUJBQW1CLFVBQVUsS0FBSyxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQzFEO0FBR0EsV0FBSyxtQkFBbUIsZ0JBQWdCO0FBQUEsUUFDdkMsV0FBVyxNQUFNO0FBQUEsUUFDakIsUUFBUSxLQUFLLFNBQVMsa0JBQWtCLE9BQU87QUFBQSxRQUMvQyxtQkFBbUIsS0FBSztBQUFBLFFBQ3hCLG1CQUFtQixFQUFFLG1CQUFtQixLQUFLO0FBQUEsUUFDN0MsbUJBQW1CLE9BQU8sRUFBRSxTQUFTLEtBQUssVUFBVSxHQUFHO0FBQUEsUUFDdkQsZUFBZSxZQUFVLEtBQUssY0FBYyxNQUFNO0FBQUEsUUFDbEQsUUFBUSxNQUFNLEtBQUssVUFBVSxNQUFNO0FBQUEsTUFDcEMsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLFVBQVUsc0JBQXNCLGVBQWUsZUFBZSxhQUFhLE9BQUssZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0FBQ3hHLFNBQUssVUFBVSxzQkFBc0IsZUFBZSxVQUFVLGNBQWMsT0FBSyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNyRztBQUFBLEVBRVEsNEJBQWtDO0FBSXpDLFNBQUssT0FBTyxLQUFLLFVBQVU7QUFBQSxFQUM1QjtBQUFBLEVBRW1CLDZCQUFtQztBQUNyRCxVQUFNLDJCQUEyQjtBQUlqQyxTQUFLLE9BQU8sS0FBSyxVQUFVO0FBQUEsRUFDNUI7QUFBQSxFQUVBLFdBQVcsUUFBcUIsU0FBK0M7QUFDOUUsVUFBTSxVQUFVLEtBQUssb0JBQW9CO0FBR3pDLFFBQUksU0FBUyxpQkFBaUI7QUFDN0IsV0FBSyxRQUFRLFFBQVEsQ0FBQ0EsU0FBUSxVQUFVLGlCQUFpQixhQUFhLE1BQU0sQ0FBQztBQUFBLElBQzlFO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFlBQVksU0FBaUM7QUFDNUMsV0FBTyxLQUFLLG9CQUFvQjtBQUFBLEVBQ2pDO0FBQUEsRUFFUSxzQkFBK0I7QUFHdEMsU0FBSyw0QkFBNEI7QUFHakMsVUFBTSxDQUFDLGVBQWUsYUFBYSxJQUFJLHdCQUF3QixLQUFLLGVBQWUsS0FBSyxhQUFhO0FBQ3JHLGFBQVMsSUFBSSxLQUFLLFVBQVUsSUFBSSxLQUFLLFVBQVUsT0FBTyxLQUFLO0FBQzFELFdBQUssVUFBVSxLQUFLLFVBQVUsR0FBRyxlQUFlLGFBQWEsR0FBRyxhQUFhO0FBQUEsSUFDOUU7QUFNQSxVQUFNLHNCQUFzQixLQUFLLHNCQUFzQjtBQUN2RCxVQUFNLGVBQWUsS0FBSztBQUMxQixTQUFLLGlCQUFpQjtBQUd0QixRQUFJLFlBQVk7QUFDaEIsUUFDQztBQUFBLElBQ0EsYUFBYSxXQUFXLEtBQUssVUFBVTtBQUFBLElBQ3ZDLGFBQWEsS0FBSyxDQUFDLE9BQU8sVUFBVSxDQUFDLEtBQUssdUJBQXVCLE9BQU8sS0FBSyxVQUFVLEdBQUcsS0FBSyxDQUFDLENBQUMsR0FDaEc7QUFDRCxXQUFLLE9BQU8sRUFBRSxzQkFBc0IsS0FBSyxDQUFDO0FBQzFDLGtCQUFZO0FBQUEsSUFDYixPQUdLO0FBQ0osV0FBSyxPQUFPLEtBQUssWUFBWSxFQUFFLHNCQUFzQixLQUFLLENBQUM7QUFBQSxJQUM1RDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx3QkFBaUM7QUFDeEMsUUFDQyxDQUFDLEtBQUssZ0JBQWdCLFVBQVUsS0FBSyxVQUFVO0FBQUEsSUFDL0MsS0FBSyxnQkFBZ0IsVUFBVSxDQUFDLEtBQUssVUFBVTtBQUFBLEtBQzlDLENBQUMsS0FBSyxnQkFBZ0IsVUFBVSxDQUFDLEtBQUssVUFBVSxTQUFTLEtBQUssZUFBZSxNQUFNLElBQ25GO0FBQ0QsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsdUJBQXVCLFFBQXVDLFFBQWdEO0FBQ3JILFFBQUksV0FBVyxRQUFRO0FBQ3RCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxPQUFPLFNBQVMsT0FBTyxRQUM3QixPQUFPLGdCQUFnQixPQUFPLGVBQzlCLE9BQU8scUJBQXFCLE9BQU8sb0JBQ25DLE9BQU8sVUFBVSxPQUFPLFNBQ3hCLE9BQU8sY0FBYyxPQUFPO0FBQUEsRUFDOUI7QUFBQSxFQUVBLGtCQUFrQixRQUEyQjtBQU81QyxRQUFJLEtBQUssbUJBQW1CLEtBQUssV0FBVyxZQUFZLGNBQWMsU0FBUztBQUM5RSxZQUFNLGlCQUFpQixLQUFLLFVBQVUsT0FBTyxNQUFNO0FBQ25ELFdBQUsscUJBQXFCLENBQUMsY0FBYztBQUFBLElBQzFDO0FBQUEsRUFDRDtBQUFBLEVBRUEsWUFBWSxRQUEyQjtBQUN0QyxTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFQSxhQUFhLFNBQThCO0FBQzFDLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQSxFQUVRLHNCQUE0QjtBQUduQyxRQUFJLEtBQUssVUFBVSxPQUFPO0FBR3pCLFlBQU0sZ0JBQWdCLHFCQUFxQixLQUFLLGFBQWE7QUFDN0QsYUFBTyxLQUFLLFdBQVcsS0FBSyxVQUFVLE9BQU87QUFHNUMsYUFBSyxjQUFjLGFBQWE7QUFHaEMsZ0JBQVEsS0FBSyxlQUFlLElBQUksQ0FBQztBQUFBLE1BQ2xDO0FBR0EsV0FBSyxpQkFBaUI7QUFHdEIsV0FBSyxPQUFPLEVBQUUsc0JBQXNCLEtBQUssQ0FBQztBQUFBLElBQzNDLE9BR0s7QUFDSixVQUFJLEtBQUssZUFBZTtBQUN2QixrQkFBVSxLQUFLLGFBQWE7QUFDNUIsWUFBSSxLQUFLLGlCQUFpQjtBQUN6QixlQUFLLGNBQWMsWUFBWSxLQUFLLGVBQWU7QUFBQSxRQUNwRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGlCQUFpQixRQUFRLEtBQUssY0FBYztBQUNqRCxXQUFLLGtCQUFrQixNQUFNO0FBQzdCLFdBQUssWUFBWSxDQUFDO0FBQ2xCLFdBQUssaUJBQWlCO0FBQ3RCLFdBQUssZ0JBQWdCLENBQUM7QUFFdEIsV0FBSywwQkFBMEI7QUFDL0IsV0FBSyw0QkFBNEI7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFdBQVcsUUFBcUIsY0FBc0IsZ0JBQThCO0FBR25GLFVBQU0sY0FBYyxLQUFLLFVBQVUsWUFBWTtBQUMvQyxTQUFLLFVBQVUsT0FBTyxjQUFjLENBQUM7QUFDckMsU0FBSyxVQUFVLE9BQU8sZ0JBQWdCLEdBQUcsV0FBVztBQUdwRCxTQUFLO0FBQUEsTUFBVyxDQUFDQSxTQUFRLFVBQVUsY0FBYyxnQkFBZ0IsVUFBVSxpQkFBaUI7QUFDM0YsYUFBSyxVQUFVQSxTQUFRLFVBQVUsY0FBYyxnQkFBZ0IsVUFBVSxZQUFZO0FBQUEsTUFDdEY7QUFBQSxNQUNDLEtBQUssSUFBSSxjQUFjLGNBQWM7QUFBQTtBQUFBLE1BQ3JDLEtBQUssSUFBSSxjQUFjLGNBQWM7QUFBQTtBQUFBLElBQ3RDO0FBR0EsU0FBSyxPQUFPLEtBQUssWUFBWSxFQUFFLHNCQUFzQixLQUFLLENBQUM7QUFBQSxFQUM1RDtBQUFBLEVBRUEsVUFBVSxRQUEyQjtBQUNwQyxTQUFLLFFBQVEsUUFBUSxDQUFDQSxTQUFRLFVBQVUsY0FBYyxnQkFBZ0IsYUFBYSxLQUFLLGVBQWVBLFNBQVEsVUFBVSxjQUFjLGdCQUFnQixRQUFRLENBQUM7QUFBQSxFQUNqSztBQUFBLEVBRUEsWUFBWSxRQUEyQjtBQUN0QyxTQUFLLDJCQUEyQixNQUFNO0FBQUEsRUFDdkM7QUFBQSxFQUVBLGNBQWMsUUFBMkI7QUFDeEMsU0FBSywyQkFBMkIsTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFUSwyQkFBMkIsUUFBMkI7QUFHN0QsU0FBSyxRQUFRLFFBQVEsQ0FBQ0EsU0FBUSxVQUFVLGNBQWMsZ0JBQWdCLFVBQVUsaUJBQWlCLEtBQUssVUFBVUEsU0FBUSxVQUFVLGNBQWMsZ0JBQWdCLFVBQVUsWUFBWSxDQUFDO0FBSXZMLFNBQUssV0FBVyxDQUFDQSxTQUFRLFVBQVUsY0FBYyxnQkFBZ0IsYUFBYTtBQUM3RSxXQUFLLGlCQUFpQixVQUFVLFlBQVk7QUFBQSxJQUM3QyxDQUFDO0FBR0QsU0FBSyxPQUFPLEtBQUssWUFBWSxFQUFFLHNCQUFzQixLQUFLLENBQUM7QUFBQSxFQUM1RDtBQUFBLEVBRUEsVUFBVSxlQUE4QjtBQUd2QyxTQUFLLFdBQVcsQ0FBQyxRQUFRLFVBQVUsY0FBYyxnQkFBZ0IsVUFBVSxpQkFBaUI7QUFDM0YsV0FBSyxnQ0FBZ0MsZUFBZSxRQUFRLGNBQWMsWUFBWTtBQUFBLElBQ3ZGLENBQUM7QUFHRCxTQUFLLDJCQUEyQjtBQUNoQyxTQUFLLE9BQU8sS0FBSyxZQUFZLEVBQUUsc0JBQXNCLEtBQUssQ0FBQztBQUFBLEVBQzVEO0FBQUEsRUFFQSx5QkFBK0I7QUFDOUIsU0FBSyxXQUFXLENBQUMsUUFBUSxVQUFVLGNBQWMsZ0JBQWdCLFVBQVUsaUJBQWlCO0FBQzNGLFdBQUssZ0NBQWdDLEtBQUssV0FBVyxnQkFBZ0IsS0FBSyxXQUFXLFFBQVEsY0FBYyxZQUFZO0FBQUEsSUFDeEgsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUlBLGtCQUFrQixRQUEyQjtBQU81QyxTQUFLLDJCQUEyQixTQUFTO0FBQUEsRUFDMUM7QUFBQSxFQUVRLHVCQUE2QjtBQUdwQyxTQUFLLGlCQUFpQjtBQUd0QixTQUFLLFdBQVcsQ0FBQyxRQUFRLFVBQVUsY0FBYyxnQkFBZ0IsYUFBYTtBQUM3RSxXQUFLLGVBQWUsUUFBUSxVQUFVLGNBQWMsZ0JBQWdCLFFBQVE7QUFBQSxJQUM3RSxDQUFDO0FBR0QsU0FBSyxPQUFPLEtBQUssVUFBVTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxrQkFBa0IsUUFBMkI7QUFDNUMsU0FBSyxRQUFRLFFBQVEsQ0FBQ0EsU0FBUSxVQUFVLGNBQWMsZ0JBQWdCLFVBQVUsaUJBQWlCLEtBQUssZ0NBQWdDLEtBQUssV0FBVyxnQkFBZ0IsS0FBSyxXQUFXQSxTQUFRLGNBQWMsWUFBWSxDQUFDO0FBQUEsRUFDMU47QUFBQSxFQUVBLHlCQUF5QixRQUEyQjtBQUNuRCxTQUFLLFFBQVEsUUFBUSxDQUFDQSxTQUFRLFVBQVUsY0FBYyxnQkFBZ0IsVUFBVSxpQkFBaUIsS0FBSyxVQUFVQSxTQUFRLFVBQVUsY0FBYyxnQkFBZ0IsVUFBVSxZQUFZLENBQUM7QUFBQSxFQUN4TDtBQUFBLEVBRVMsY0FBYyxZQUFnQyxZQUFzQztBQUM1RixVQUFNLGNBQWMsWUFBWSxVQUFVO0FBRzFDLFFBQUksV0FBVyxnQkFBZ0IsV0FBVyxhQUFhO0FBQ3RELFdBQUssaUJBQWlCO0FBQUEsSUFDdkI7QUFHQSxRQUFJLFdBQVcseUJBQXlCLFdBQVcsc0JBQXNCO0FBQ3hFLFdBQUssMEJBQTBCO0FBQUEsSUFDaEM7QUFHQSxRQUFJLFdBQVcsNkJBQTZCLFdBQVcsMEJBQTBCO0FBQ2hGLFdBQUssOEJBQThCO0FBQUEsSUFDcEM7QUFHQSxRQUFJLFdBQVcsNEJBQTRCLFdBQVcseUJBQXlCO0FBQzlFLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFHQSxRQUNDLFdBQVcsMkJBQTJCLFdBQVcsMEJBQ2pELFdBQVcsMkJBQTJCLFdBQVcsMEJBQ2pELFdBQVcsY0FBYyxXQUFXLFdBQ25DO0FBQ0QsV0FBSyxnQkFBZ0IsSUFBSTtBQUFBLElBQzFCO0FBR0EsUUFDQyxXQUFXLGdCQUFnQixXQUFXLGVBQ3RDLFdBQVcsc0JBQXNCLFdBQVcscUJBQzVDLFdBQVcsNkJBQTZCLFdBQVcsNEJBQ25ELFdBQVcsNkJBQTZCLFdBQVcsNEJBQ25ELFdBQVcsY0FBYyxXQUFXLGFBQ3BDLFdBQVcsb0JBQW9CLFdBQVcsbUJBQzFDLFdBQVcsY0FBYyxXQUFXLGFBQ3BDLFdBQVcsYUFBYSxXQUFXLFlBQ25DLFdBQVcsMEJBQTBCLFdBQVcseUJBQ2hELFdBQVcsYUFBYSxXQUFXLFlBQ25DLFdBQVcsaUJBQWlCLFdBQVcsZ0JBQ3ZDLENBQUMsT0FBTyxXQUFXLGFBQWEsV0FBVyxXQUFXLEdBQ3JEO0FBQ0QsV0FBSyxPQUFPO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVTLGVBQXFCO0FBQzdCLFNBQUssT0FBTztBQUFBLEVBQ2I7QUFBQSxFQUVRLFdBQVcsSUFBc0ssY0FBdUIsWUFBMkI7QUFDMU8sU0FBSyxVQUFVLFdBQVcsYUFBYSxVQUFVLEVBQUUsUUFBUSxDQUFDLFFBQXFCLGFBQXFCO0FBQ3JHLFVBQUksT0FBTyxpQkFBaUIsWUFBWSxlQUFlLFVBQVU7QUFDaEU7QUFBQSxNQUNEO0FBRUEsVUFBSSxPQUFPLGVBQWUsWUFBWSxhQUFhLFVBQVU7QUFDNUQ7QUFBQSxNQUNEO0FBRUEsV0FBSyxVQUFVLFVBQVUsUUFBUSxFQUFFO0FBQUEsSUFDcEMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLFFBQVEsUUFBcUIsSUFBNEs7QUFDaE4sU0FBSyxVQUFVLEtBQUssVUFBVSxRQUFRLE1BQU0sR0FBRyxRQUFRLEVBQUU7QUFBQSxFQUMxRDtBQUFBLEVBRVEsVUFBVSxVQUFrQixRQUFxQixJQUE0SztBQUNwTyxVQUFNLGdCQUFnQixxQkFBcUIsS0FBSyxhQUFhO0FBQzdELFVBQU0sZUFBZSxjQUFjLFNBQVMsUUFBUTtBQUNwRCxVQUFNLG1CQUFtQixLQUFLLGtCQUFrQixJQUFJLFFBQVE7QUFDNUQsVUFBTSxXQUFXLEtBQUssVUFBVSxRQUFRO0FBQ3hDLFVBQU0sZUFBZSxLQUFLLGNBQWMsUUFBUTtBQUNoRCxRQUFJLGdCQUFnQixvQkFBb0IsVUFBVTtBQUNqRCxTQUFHLFFBQVEsVUFBVSxjQUFjLGtCQUFrQixVQUFVLFlBQVk7QUFBQSxJQUM1RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFVBQVUsVUFBa0IsZUFBNEIsZUFBK0M7QUFHOUcsVUFBTSxlQUFlLEVBQUUsUUFBUTtBQUFBLE1BQzlCLFdBQVc7QUFBQSxNQUNYLE1BQU07QUFBQSxJQUNQLENBQUM7QUFHRCxVQUFNLG9CQUFvQixRQUFRLFVBQVUsWUFBWTtBQUl4RCxVQUFNLG1CQUFtQixFQUFFLGFBQWEsRUFBRSxlQUFlLEtBQUssQ0FBQztBQUMvRCxpQkFBYSxZQUFZLGdCQUFnQjtBQUd6QyxVQUFNLHdCQUF3QixFQUFFLDJCQUEyQjtBQUMzRCxpQkFBYSxZQUFZLHFCQUFxQjtBQUc5QyxVQUFNLGNBQWMsS0FBSyxrQkFBa0IsT0FBTyxjQUFjLEVBQUUscUJBQXFCLGFBQWEsQ0FBQztBQUdyRyxVQUFNLHNCQUFzQixFQUFFLGNBQWM7QUFDNUMsaUJBQWEsWUFBWSxtQkFBbUI7QUFFNUMsVUFBTSxPQUFPO0FBQ2IsVUFBTSxrQkFBa0IsSUFBSSxrQ0FBa0M7QUFBQSxNQUM3RCxTQUFTLEtBQUssVUFBVTtBQUFBLE1BQ3hCLElBQUksY0FBYztBQUFFLGVBQU8sS0FBSyxjQUFjLFFBQVE7QUFBQSxNQUFHO0FBQUEsSUFDMUQsQ0FBQztBQUVELFVBQU0sZUFBZSxJQUFJLFVBQVUscUJBQXFCLEVBQUUsV0FBVyxTQUFTLHVCQUF1QixhQUFhLEdBQUcsY0FBYyxnQkFBZ0IsQ0FBQztBQUNwSixVQUFNLG9CQUFvQixhQUFhLFVBQVUsT0FBSztBQUNyRCxVQUFJLEVBQUUsT0FBTyxPQUFPLEtBQUssa0JBQWtCLE1BQU0sRUFBRSxPQUFPLE9BQU8sS0FBSyxrQ0FBa0MsSUFBSTtBQUMzRyxhQUFLLHlCQUF5QjtBQUFBLE1BQy9CO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx5QkFBeUIsbUJBQW1CLGlCQUFpQixjQUFjLG1CQUFtQixhQUFhLE9BQU8sS0FBSyxlQUFlLFlBQVksQ0FBQyxDQUFDO0FBSTFKLFVBQU0saUJBQWlCLEVBQUUsaUJBQWlCO0FBQzFDLGlCQUFhLFlBQVksY0FBYztBQUd2QyxVQUFNLDJCQUEyQixFQUFFLDhCQUE4QjtBQUNqRSxpQkFBYSxZQUFZLHdCQUF3QjtBQUdqRCxVQUFNLG1CQUFtQixLQUFLLHFCQUFxQixjQUFjLFVBQVUsZUFBZSxhQUFhO0FBRXZHLFNBQUssZUFBZSxLQUFLLG1CQUFtQixtQkFBbUIsa0JBQWtCLHdCQUF3QixXQUFXLENBQUM7QUFFckgsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGNBQWMsVUFBMEI7QUFLL0MsVUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVUsaUJBQWlCLFFBQVEsQ0FBQztBQUU3RSxXQUFPLEtBQUssVUFBVSxpQkFBaUIsTUFBTTtBQUFBLEVBQzlDO0FBQUEsRUFHUSxxQkFBcUIsS0FBa0IsVUFBa0IsZUFBNEIsZUFBK0M7QUFDM0ksVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFVBQU0scUJBQXFCLE9BQU8sR0FBOEIsa0JBQTBDO0FBQ3pHLFVBQUksS0FBSztBQUVULFVBQUksYUFBYSxDQUFDLE1BQU0sRUFBRSxXQUFXLEtBQXNDLGVBQWUsRUFBRSxVQUFvQztBQUMvSCxZQUFJLEVBQUUsV0FBVyxHQUFHO0FBQ25CLFlBQUUsZUFBZTtBQUFBLFFBQ2xCO0FBRUE7QUFBQSxNQUNEO0FBRUEsVUFBSSxLQUFLLDJCQUEyQixDQUFDLEdBQUc7QUFDdkM7QUFBQSxNQUNEO0FBR0EsWUFBTSxTQUFTLEtBQUssVUFBVSxpQkFBaUIsUUFBUTtBQUN2RCxVQUFJLFFBQVE7QUFDWCxZQUFJLEVBQUUsVUFBVTtBQUNmLGNBQUk7QUFDSixjQUFJLEtBQUssa0NBQWtDLEtBQUssVUFBVSxXQUFXLEtBQUssOEJBQThCLEdBQUc7QUFFMUcscUJBQVMsS0FBSztBQUFBLFVBQ2YsT0FBTztBQUVOLGtCQUFNLGVBQWUscUJBQXFCLEtBQUssVUFBVSxZQUFZO0FBQ3JFLGlCQUFLLGlDQUFpQztBQUN0QyxxQkFBUztBQUFBLFVBQ1Y7QUFDQSxnQkFBTSxLQUFLLHFCQUFxQixRQUFRLE1BQU07QUFBQSxRQUMvQyxXQUFZLEVBQUUsV0FBVyxDQUFDLGVBQWlCLEVBQUUsV0FBVyxhQUFjO0FBQ3JFLGNBQUksS0FBSyxVQUFVLFdBQVcsTUFBTSxHQUFHO0FBQ3RDLGtCQUFNLEtBQUssZUFBZSxNQUFNO0FBQUEsVUFDakMsT0FBTztBQUNOLGtCQUFNLEtBQUssYUFBYSxNQUFNO0FBQzlCLGlCQUFLLGlDQUFpQztBQUFBLFVBQ3ZDO0FBQUEsUUFDRCxPQUFPO0FBS04sZ0JBQU0sb0JBQW9CLEtBQUssVUFBVSxXQUFXLE1BQU0sSUFBSSxLQUFLLFVBQVUsZ0JBQWdCLE9BQU8sQ0FBQUMsT0FBSyxDQUFDQSxHQUFFLFFBQVEsTUFBTSxDQUFDLElBQUksQ0FBQztBQUNoSSxnQkFBTSxLQUFLLFVBQVUsV0FBVyxRQUFRLEVBQUUsZUFBZSxZQUFZLGlCQUFpQixTQUFTLEdBQUcsRUFBRSxtQkFBbUIsaUJBQWlCLEtBQUssQ0FBQztBQUFBLFFBQy9JO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUFrQixDQUFDLE1BQWE7QUFDckMsa0JBQVksS0FBSyxDQUFDO0FBRWxCLFlBQU0sU0FBUyxLQUFLLFVBQVUsaUJBQWlCLFFBQVE7QUFDdkQsVUFBSSxRQUFRO0FBQ1gsYUFBSyxpQkFBaUIsUUFBUSxHQUFHLEdBQUc7QUFBQSxNQUNyQztBQUFBLElBQ0Q7QUFHQSxnQkFBWSxJQUFJLHNCQUFzQixLQUFLLFVBQVUsWUFBWSxPQUFLLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQ25HLGdCQUFZLElBQUksc0JBQXNCLEtBQUssZUFBZSxLQUFLLENBQUMsTUFBb0IsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFHaEgsZ0JBQVksSUFBSSxzQkFBc0IsS0FBSyxlQUFlLFFBQVEsQ0FBQyxNQUFvQjtBQUN0RixvQkFBYyxrQkFBa0IsRUFBRSxZQUFZLGNBQWMsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLGFBQWEsQ0FBQztBQUFBLElBQzlHLENBQUMsQ0FBQztBQUdGLGdCQUFZLElBQUksc0JBQXNCLEtBQUssVUFBVSxVQUFVLE9BQU0sTUFBSztBQUN6RSxrQkFBWSxLQUFLLENBQUM7QUFFbEIsVUFBSSxLQUFLO0FBRVQsVUFBSSxhQUFhLENBQUMsTUFBTSxFQUFFLFdBQVcsS0FBc0MsZUFBZSxFQUFFLFVBQW9DO0FBQy9IO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSywyQkFBMkIsQ0FBQyxHQUFHO0FBQ3ZDO0FBQUEsTUFDRDtBQUVBLFlBQU0sWUFBYSxFQUFFLFdBQVcsQ0FBQyxlQUFpQixFQUFFLFdBQVc7QUFDL0QsVUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLFlBQVksS0FBSyxVQUFVLGdCQUFnQixTQUFTLEdBQUc7QUFDM0UsY0FBTSxLQUFLLG1CQUFtQjtBQUFBLE1BQy9CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixnQkFBWSxJQUFJLHNCQUFzQixLQUFLLFVBQVUsVUFBVSxPQUFLO0FBQ25FLFVBQUksRUFBRSxXQUFXLEdBQXNCO0FBQ3RDLG9CQUFZO0FBQUEsVUFBSztBQUFBLFVBQUc7QUFBQTtBQUFBLFFBQStEO0FBRW5GLGNBQU0sU0FBUyxLQUFLLFVBQVUsaUJBQWlCLFFBQVE7QUFDdkQsWUFBSSxRQUFRO0FBQ1gsY0FBSSxPQUFPLGNBQWMsd0JBQXdCLFdBQVcsS0FBSyxtQkFBbUIsS0FBSyxXQUFXLFFBQVEsa0JBQWtCLE9BQU8sS0FBSyxXQUFXLFdBQVcsR0FBRztBQUNsSztBQUFBLFVBQ0Q7QUFFQSxlQUFLLHlCQUF5QjtBQUM5QixlQUFLLGtCQUFrQixJQUFJLEVBQUUsU0FBUyxLQUFLLFVBQVUsSUFBSSxhQUFhLEtBQUssVUFBVSxpQkFBaUIsTUFBTSxFQUFFLENBQUM7QUFBQSxRQUNoSDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLGdCQUFZLElBQUksc0JBQXNCLEtBQUssVUFBVSxVQUFVLE9BQUs7QUFDbkUsWUFBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFDekMsVUFBSSxNQUFNLFlBQVksTUFBTSxZQUFZLFFBQVEsS0FBSztBQUNwRCx3QkFBZ0IsQ0FBQztBQUFBLE1BQ2xCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixnQkFBWSxJQUFJLHNCQUFzQixLQUFLLGVBQWUsYUFBYSxDQUFDLE1BQW9CO0FBQzNGLHNCQUFnQixDQUFDO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBR0YsZ0JBQVksSUFBSSxzQkFBc0IsS0FBSyxVQUFVLFFBQVEsT0FBSztBQUNqRSxZQUFNLFFBQVEsSUFBSSxzQkFBc0IsQ0FBQztBQUN6QyxVQUFJLFVBQVU7QUFHZCxVQUFJLE1BQU0sT0FBTyxRQUFRLEtBQUssS0FBSyxNQUFNLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDL0Qsa0JBQVU7QUFDVixjQUFNLFNBQVMsS0FBSyxVQUFVLGlCQUFpQixRQUFRO0FBQ3ZELFlBQUksUUFBUTtBQUNYLGVBQUssVUFBVSxXQUFXLE1BQU07QUFBQSxRQUNqQztBQUFBLE1BQ0QsV0FHUyxDQUFDLFFBQVEsV0FBVyxRQUFRLFlBQVksUUFBUSxTQUFTLFFBQVEsV0FBVyxRQUFRLE1BQU0sUUFBUSxHQUFHLEVBQUUsS0FBSyxRQUFNLE1BQU0sT0FBTyxFQUFFLENBQUMsR0FBRztBQUM3SSxZQUFJLGNBQWMsS0FBSyxjQUFjLFFBQVE7QUFDN0MsWUFBSSxNQUFNLE9BQU8sUUFBUSxTQUFTLEtBQUssTUFBTSxPQUFPLFFBQVEsT0FBTyxHQUFHO0FBQ3JFLHdCQUFjLGNBQWM7QUFBQSxRQUM3QixXQUFXLE1BQU0sT0FBTyxRQUFRLFVBQVUsS0FBSyxNQUFNLE9BQU8sUUFBUSxTQUFTLEdBQUc7QUFDL0Usd0JBQWMsY0FBYztBQUFBLFFBQzdCLFdBQVcsTUFBTSxPQUFPLFFBQVEsSUFBSSxHQUFHO0FBQ3RDLHdCQUFjO0FBQUEsUUFDZixPQUFPO0FBQ04sd0JBQWMsS0FBSyxVQUFVLFFBQVE7QUFBQSxRQUN0QztBQUVBLGNBQU0sU0FBUyxLQUFLLFVBQVUsaUJBQWlCLFdBQVc7QUFDMUQsWUFBSSxRQUFRO0FBQ1gsb0JBQVU7QUFDVixlQUFLLFVBQVUsV0FBVyxRQUFRLEVBQUUsZUFBZSxLQUFLLEdBQUcsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsUUFDckY7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTO0FBQ1osb0JBQVksS0FBSyxHQUFHLElBQUk7QUFBQSxNQUN6QjtBQUdBLG9CQUFjLGtCQUFrQjtBQUFBLFFBQy9CLFlBQVksY0FBYztBQUFBLE1BQzNCLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUdGLGVBQVcsYUFBYSxDQUFDLGVBQWUsS0FBSyxVQUFVLFFBQVEsR0FBRztBQUNqRSxrQkFBWSxJQUFJLHNCQUFzQixLQUFLLFdBQVcsQ0FBQyxNQUFpQztBQUN2RixZQUFJLGNBQWMsVUFBVSxVQUFVO0FBQ3JDLHNCQUFZLEtBQUssQ0FBQztBQUFBLFFBQ25CLFdBQTBCLEVBQUcsYUFBYSxHQUFHO0FBQzVDO0FBQUEsUUFDRDtBQUVBLGNBQU0sU0FBUyxLQUFLLFVBQVUsaUJBQWlCLFFBQVE7QUFDdkQsWUFBSSxVQUFVLEtBQUssVUFBVSxTQUFTLE1BQU0sR0FBRztBQUM5QyxrQkFBUSxLQUFLLFdBQVcsWUFBWSx3Q0FBd0M7QUFBQSxZQUMzRSxLQUFLO0FBQ0osbUJBQUssV0FBVyxvQkFBb0IsS0FBSyxTQUFTO0FBQ2xEO0FBQUEsWUFDRCxLQUFLO0FBQ0osbUJBQUssV0FBVyxrQkFBa0IsS0FBSyxTQUFTO0FBQ2hEO0FBQUEsWUFDRCxLQUFLO0FBQ0o7QUFBQSxVQUNGO0FBQUEsUUFFRCxPQUFPO0FBQ04sZUFBSyxVQUFVLFVBQVUsTUFBTTtBQUFBLFFBQ2hDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBR0EsZ0JBQVksSUFBSTtBQUFBLE1BQXNCO0FBQUEsTUFBSyxVQUFVO0FBQUEsTUFBYyxPQUFLO0FBQ3ZFLG9CQUFZLEtBQUssR0FBRyxJQUFJO0FBRXhCLGNBQU0sU0FBUyxLQUFLLFVBQVUsaUJBQWlCLFFBQVE7QUFDdkQsWUFBSSxRQUFRO0FBQ1gsZUFBSyxpQkFBaUIsUUFBUSxHQUFHLEdBQUc7QUFBQSxRQUNyQztBQUFBLE1BQ0Q7QUFBQSxNQUFHO0FBQUE7QUFBQSxJQUE4RSxDQUFDO0FBR2xGLFFBQUksZ0JBQXVDO0FBQzNDLFFBQUksdUJBQXVCO0FBQzNCLGdCQUFZLElBQUksSUFBSSxvQkFBb0IsS0FBSztBQUFBLE1BQzVDLGFBQWEsT0FBSztBQUNqQixjQUFNLFNBQVMsS0FBSyxVQUFVLGlCQUFpQixRQUFRO0FBQ3ZELFlBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxRQUNEO0FBRUEsK0JBQXVCLEtBQUsscUJBQXFCLENBQUM7QUFDbEQsY0FBTSxrQkFBa0IsS0FBSyxVQUFVO0FBQ3ZDLGFBQUssZUFBZSxRQUFRLGdCQUFnQixJQUFJLENBQUFBLE9BQUssSUFBSSx3QkFBd0IsRUFBRSxRQUFRQSxJQUFHLFNBQVMsS0FBSyxVQUFVLEdBQUcsQ0FBQyxDQUFDLEdBQUcsd0JBQXdCLFNBQVM7QUFFL0osWUFBSSxFQUFFLGNBQWM7QUFDbkIsWUFBRSxhQUFhLGdCQUFnQjtBQUMvQixjQUFJLGdCQUFnQixTQUFTLEdBQUc7QUFDL0Isa0JBQU0sUUFBUSxHQUFHLE9BQU8sUUFBUSxDQUFDLE1BQU0sZ0JBQWdCLFNBQVMsQ0FBQztBQUNqRSwyQkFBZSxHQUFHLEtBQUssS0FBSztBQUFBLFVBQzdCLE9BQU87QUFDTixrQkFBTSxVQUFVLEtBQUssV0FBVztBQUNoQyxrQkFBTSxjQUFjLEtBQUssVUFBVSxTQUFTLFFBQVE7QUFDcEQsa0JBQU0saUJBQWlCLFFBQVEsY0FBYyxZQUFhLGVBQWUsUUFBUSxvQkFBb0I7QUFDckcsZ0JBQUksZ0JBQWdCO0FBSW5CLDZCQUFlLEdBQUcsS0FBSyxPQUFPLFFBQVEsQ0FBQztBQUFBLFlBQ3hDLE9BQU87QUFDTixnQkFBRSxhQUFhLGFBQWEsS0FBSyxHQUFHLENBQUM7QUFBQSxZQUN0QztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBR0EsYUFBSyw0QkFBNEIsaUJBQWlCLEdBQUcsb0JBQW9CO0FBRXpFLHFDQUE2QixVQUFVLEtBQUssTUFBTSxHQUFHLE1BQU0sS0FBSyxtQkFBbUIsS0FBSyxPQUFPLEdBQUcsUUFBUSxDQUFDO0FBQUEsTUFDNUc7QUFBQSxNQUVBLFFBQVEsT0FBSztBQUNaLHdCQUFnQjtBQUFBLE1BQ2pCO0FBQUEsTUFFQSxhQUFhLE9BQUs7QUFHakIsWUFBSSxDQUFDLEtBQUssd0JBQXdCLENBQUMsR0FBRztBQUNyQyxjQUFJLEVBQUUsY0FBYztBQUNuQixjQUFFLGFBQWEsYUFBYTtBQUFBLFVBQzdCO0FBRUE7QUFBQSxRQUNEO0FBSUEsWUFBSSxDQUFDLEtBQUssZUFBZSxRQUFRLHdCQUF3QixTQUFTLEdBQUc7QUFDcEUsY0FBSSxFQUFFLGNBQWM7QUFDbkIsY0FBRSxhQUFhLGFBQWE7QUFBQSxVQUM3QjtBQUFBLFFBQ0Q7QUFFQSxhQUFLLG1CQUFtQixLQUFLLE1BQU0sR0FBRyxRQUFRO0FBQUEsTUFDL0M7QUFBQSxNQUVBLFlBQVksQ0FBQyxHQUFHLGlCQUFpQjtBQUNoQyxZQUFJLGdCQUFnQix1QkFBdUIsOEJBQThCO0FBQ3hFLGdCQUFNLGlCQUFpQixLQUFLLFVBQVUsaUJBQWlCLFFBQVE7QUFDL0QsY0FBSSxrQkFBa0IsS0FBSyxVQUFVLGlCQUFpQixnQkFBZ0I7QUFDckUsaUJBQUssVUFBVSxXQUFXLGdCQUFnQixFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsVUFDbEU7QUFBQSxRQUNEO0FBRUEsYUFBSyxtQkFBbUIsS0FBSyxNQUFNLEdBQUcsUUFBUTtBQUFBLE1BQy9DO0FBQUEsTUFFQSxXQUFXLE9BQU0sTUFBSztBQUNyQixhQUFLLG1CQUFtQixLQUFLLE9BQU8sR0FBRyxRQUFRO0FBQy9DLGNBQU0saUJBQWlCLEtBQUssZUFBZSxRQUFRLHdCQUF3QixTQUFTO0FBQ3BGLGFBQUssZUFBZSxVQUFVLHdCQUF3QixTQUFTO0FBRS9ELFlBQ0MsQ0FBQyx3QkFDRCxvQkFBb0IsS0FDcEIsQ0FBQyxrQkFDRCxlQUFlLFdBQVcsR0FDekI7QUFDRDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLHNCQUFzQixNQUFNLEtBQUssaUNBQWlDLEdBQUcsR0FBRztBQUM5RSxZQUFJLENBQUMscUJBQXFCO0FBQ3pCO0FBQUEsUUFDRDtBQUVBLGNBQU0sY0FBYyxvQkFBb0I7QUFDeEMsY0FBTSxxQkFBcUIsdUJBQXVCLEtBQUssV0FBVyxlQUFlLElBQUksWUFBVSxPQUFPLFdBQVcsTUFBTSxDQUFDO0FBQ3hILFlBQUksS0FBSyxnQkFBZ0IsaUJBQWlCLEdBQUcsWUFBWSxJQUFJLGVBQWUsQ0FBQyxFQUFFLFdBQVcsTUFBTSxHQUFHO0FBQ2xHLGVBQUssVUFBVSxZQUFZLG9CQUFvQixXQUFXO0FBQUEsUUFDM0QsT0FBTztBQUNOLGVBQUssVUFBVSxZQUFZLG9CQUFvQixXQUFXO0FBQUEsUUFDM0Q7QUFFQSxvQkFBWSxNQUFNO0FBQUEsTUFDbkI7QUFBQSxNQUVBLFFBQVEsT0FBSztBQUNaLGFBQUssbUJBQW1CLEtBQUssT0FBTyxHQUFHLFFBQVE7QUFHL0MsWUFBSSxjQUFjO0FBQ2xCLFlBQUksS0FBSyx1QkFBdUIsR0FBRyxHQUFHLE1BQU0sU0FBUztBQUNwRDtBQUFBLFFBQ0Q7QUFFQSxhQUFLLE9BQU8sR0FBRyxhQUFhLGFBQWE7QUFBQSxNQUMxQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUF3QixHQUF1QjtBQUN0RCxRQUFJLEtBQUssY0FBYyxRQUFRLDZCQUE2QixTQUFTLEdBQUc7QUFDdkUsWUFBTSxPQUFPLEtBQUssY0FBYyxRQUFRLDZCQUE2QixTQUFTO0FBQzlFLFVBQUksTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsR0FBRztBQUMzQyxjQUFNLFFBQVEsS0FBSyxDQUFDO0FBQ3BCLFlBQUksTUFBTSxlQUFlLEtBQUssVUFBVSxJQUFJO0FBQzNDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxlQUFlLFFBQVEsd0JBQXdCLFNBQVMsR0FBRztBQUNuRSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLE1BQU0sU0FBUyxHQUFHO0FBQ3RELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG1CQUFtQixTQUFzQixPQUFnQixHQUFjLFVBQXlCO0FBQ3ZHLFVBQU0sUUFBUyxPQUFPLGFBQWE7QUFFbkMsUUFBSTtBQUNKLFFBQUksT0FBTztBQUNWLFVBQUksT0FBTztBQUNWLHFCQUFhLEtBQUssa0JBQWtCLEdBQUcsVUFBVSxPQUFPO0FBQUEsTUFDekQsT0FBTztBQUNOLHFCQUFhLEVBQUUsYUFBYSxRQUFRLGtCQUFpQyxjQUFjLE9BQVU7QUFBQSxNQUM5RjtBQUFBLElBQ0QsT0FBTztBQUNOLG1CQUFhO0FBQUEsSUFDZDtBQUVBLFNBQUssaUJBQWlCLFVBQVU7QUFBQSxFQUNqQztBQUFBLEVBR1EsaUJBQWlCLFdBQThHO0FBQ3RJLFVBQU0sYUFBYSxLQUFLO0FBQ3hCLFFBQUksZUFBZSxhQUFhLGNBQWMsYUFBYSxXQUFXLGdCQUFnQixVQUFVLGVBQWUsV0FBVyxpQkFBaUIsVUFBVSxjQUFjO0FBQ2xLO0FBQUEsSUFDRDtBQUVBLFVBQU0sZ0JBQWdCO0FBQ3RCLFVBQU0saUJBQWlCO0FBRXZCLFFBQUksWUFBWTtBQUNmLGlCQUFXLGFBQWEsVUFBVSxPQUFPLGFBQWE7QUFDdEQsaUJBQVcsY0FBYyxVQUFVLE9BQU8sY0FBYztBQUFBLElBQ3pEO0FBRUEsUUFBSSxXQUFXO0FBQ2QsZ0JBQVUsYUFBYSxVQUFVLElBQUksYUFBYTtBQUNsRCxnQkFBVSxjQUFjLFVBQVUsSUFBSSxjQUFjO0FBQUEsSUFDckQ7QUFFQSxTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRVEsdUJBQXVCLEdBQWMsS0FBb0M7QUFDaEYsVUFBTSxPQUFPLElBQUksc0JBQXNCO0FBQ3ZDLFVBQU0sMEJBQTBCLEVBQUUsVUFBVSxLQUFLO0FBRWpELFdBQU8sMkJBQTJCLEtBQUssUUFBUSxJQUFJLFNBQVM7QUFBQSxFQUM3RDtBQUFBLEVBRVEsa0JBQWtCLEdBQWMsVUFBa0IsV0FBcUg7QUFDOUssVUFBTSxrQkFBa0IsS0FBSyx1QkFBdUIsR0FBRyxTQUFTLE1BQU07QUFDdEUsVUFBTSxZQUFZLGFBQWEsS0FBSyxVQUFVLFFBQVE7QUFDdEQsVUFBTSxhQUFhLGFBQWE7QUFHaEMsUUFBSSxtQkFBbUIsWUFBWTtBQUNsQyxhQUFPLEVBQUUsYUFBYSxRQUFXLGNBQWMsVUFBVTtBQUFBLElBQzFEO0FBR0EsUUFBSSxDQUFDLG1CQUFtQixXQUFXO0FBQ2xDLGFBQU8sRUFBRSxhQUFhLFdBQVcsY0FBYyxPQUFVO0FBQUEsSUFDMUQ7QUFHQSxVQUFNLFlBQVksa0JBQWtCLFVBQVUseUJBQXlCO0FBQ3ZFLFVBQU0sV0FBVyxrQkFBa0IsWUFBWSxVQUFVO0FBRXpELFdBQU8sRUFBRSxhQUFhLFdBQTBCLGNBQWMsU0FBd0I7QUFBQSxFQUN2RjtBQUFBLEVBRUEsTUFBYyxhQUFhLFFBQW9DO0FBQzlELFFBQUksS0FBSyxVQUFVLFNBQVMsTUFBTSxHQUFHO0FBQ3BDO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxVQUFVLGFBQWEsUUFBUSxLQUFLLFVBQVUsZUFBZTtBQUFBLEVBQ3pFO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixRQUFxQixRQUFvQztBQUMzRixVQUFNLGNBQWMsS0FBSyxVQUFVLGlCQUFpQixNQUFNO0FBQzFELFFBQUksZ0JBQWdCLElBQUk7QUFDdkIsWUFBTSxJQUFJLG1CQUFtQjtBQUFBLElBQzlCO0FBRUEsVUFBTSxvQkFBb0IsS0FBSyxVQUFVLGlCQUFpQixNQUFNO0FBQ2hFLFFBQUksc0JBQXNCLElBQUk7QUFDN0IsWUFBTSxJQUFJLG1CQUFtQjtBQUFBLElBQzlCO0FBRUEsUUFBSSxZQUFZLEtBQUssVUFBVTtBQUcvQixRQUFJLHFCQUFxQjtBQUN6QixXQUFPLHNCQUFzQixLQUFLLHNCQUFzQixLQUFLLFVBQVUsUUFBUSxHQUFHO0FBQ2pGLDJCQUFxQixvQkFBb0IsY0FBYyxxQkFBcUIsSUFBSSxxQkFBcUI7QUFFckcsWUFBTSxnQkFBZ0IsS0FBSyxVQUFVLGlCQUFpQixrQkFBa0I7QUFDeEUsVUFBSSxDQUFDLGVBQWU7QUFDbkI7QUFBQSxNQUNEO0FBRUEsVUFBSSxDQUFDLEtBQUssVUFBVSxXQUFXLGFBQWEsR0FBRztBQUM5QztBQUFBLE1BQ0Q7QUFFQSxrQkFBWSxVQUFVLE9BQU8sWUFBVSxDQUFDLE9BQU8sUUFBUSxhQUFhLENBQUM7QUFBQSxJQUN0RTtBQUdBLFVBQU0sa0JBQWtCLG9CQUFvQixjQUFjLG9CQUFvQjtBQUM5RSxVQUFNLGdCQUFnQixvQkFBb0IsY0FBYyxjQUFjO0FBRXRFLFVBQU0sa0JBQWtCLEtBQUssVUFBVSxXQUFXLGFBQWEsVUFBVSxFQUFFLE1BQU0saUJBQWlCLGdCQUFnQixDQUFDO0FBQ25ILGVBQVcsVUFBVSxpQkFBaUI7QUFDckMsVUFBSSxDQUFDLEtBQUssVUFBVSxXQUFXLE1BQU0sR0FBRztBQUN2QyxrQkFBVSxLQUFLLE1BQU07QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLDBCQUEwQixVQUFVLE9BQU8sWUFBVSxDQUFDLE9BQU8sUUFBUSxNQUFNLENBQUM7QUFDbEYsVUFBTSxLQUFLLFVBQVUsYUFBYSxRQUFRLHVCQUF1QjtBQUFBLEVBQ2xFO0FBQUEsRUFFQSxNQUFjLGVBQWUsUUFBb0M7QUFDaEUsVUFBTSw0QkFBNEIsS0FBSyxVQUFVLFNBQVMsTUFBTTtBQUdoRSxRQUFJLDZCQUE2QixLQUFLLFVBQVUsZ0JBQWdCLFdBQVcsR0FBRztBQUM3RTtBQUFBLElBQ0Q7QUFFQSxRQUFJLGtCQUFrQixxQkFBcUIsS0FBSyxVQUFVLFlBQVk7QUFJdEUsUUFBSSwyQkFBMkI7QUFDOUIsWUFBTSxnQkFBZ0IsS0FBSyxVQUFVLFdBQVcsYUFBYSxvQkFBb0I7QUFDakYsZUFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUM5QyxjQUFNLGVBQWUsY0FBYyxDQUFDO0FBQ3BDLFlBQUksS0FBSyxVQUFVLFdBQVcsWUFBWSxHQUFHO0FBQzVDLDRCQUFrQjtBQUNsQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sMEJBQTBCLEtBQUssVUFBVSxnQkFBZ0IsT0FBTyxPQUFLLENBQUMsRUFBRSxRQUFRLE1BQU0sS0FBSyxDQUFDLEVBQUUsUUFBUSxlQUFlLENBQUM7QUFDNUgsVUFBTSxLQUFLLFVBQVUsYUFBYSxpQkFBaUIsdUJBQXVCO0FBQUEsRUFDM0U7QUFBQSxFQUVBLE1BQWMscUJBQW9DO0FBQ2pELFFBQUksS0FBSyxVQUFVLGdCQUFnQixTQUFTLEdBQUc7QUFDOUMsWUFBTSxlQUFlLHFCQUFxQixLQUFLLFVBQVUsWUFBWTtBQUNyRSxZQUFNLEtBQUssVUFBVSxhQUFhLGNBQWMsQ0FBQyxDQUFDO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQkFBeUI7QUFDaEMsVUFBTSxFQUFFLFlBQVksSUFBSSxLQUFLLFdBQVc7QUFDeEMsVUFBTSxFQUFFLFdBQVcsa0JBQWtCLElBQUksS0FBSyxvQkFBb0IsV0FBVztBQUc3RSxVQUFNLFNBQThCLENBQUM7QUFDckMsUUFBSSx1QkFBdUI7QUFDM0IsU0FBSyxVQUFVLFdBQVcsYUFBYSxVQUFVLEVBQUUsUUFBUSxDQUFDLFFBQXFCLGFBQXFCO0FBQ3JHLGFBQU8sS0FBSztBQUFBLFFBQ1g7QUFBQSxRQUNBLE1BQU0sT0FBTyxRQUFRO0FBQUEsUUFDckIsYUFBYSxPQUFPLGVBQWUsU0FBUztBQUFBLFFBQzVDLGtCQUFrQixPQUFPLGNBQWMsd0JBQXdCLGdCQUFnQjtBQUFBLFFBQy9FLE9BQU8sT0FBTyxTQUFTLFVBQVUsSUFBSTtBQUFBLFFBQ3JDLFdBQVcsdUJBQXVCLFFBQVEsVUFBVSxLQUFLLFdBQVcsS0FBSyxnQkFBZ0IsS0FBSztBQUFBLE1BQy9GLENBQUM7QUFFRCxVQUFJLFdBQVcsS0FBSyxVQUFVLGNBQWM7QUFDM0MsK0JBQXVCO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFHRCxRQUFJLG1CQUFtQjtBQUN0QixXQUFLLGlCQUFpQixNQUFNO0FBQUEsSUFDN0I7QUFHQSxTQUFLLFlBQVk7QUFDakIsU0FBSyxpQkFBaUIsT0FBTyxvQkFBb0I7QUFBQSxFQUNsRDtBQUFBLEVBRVEsaUJBQWlCLFFBQW1DO0FBRzNELFVBQU0sc0JBQXNCLG9CQUFJLElBQWlDO0FBQ2pFLGVBQVcsU0FBUyxRQUFRO0FBQzNCLFVBQUksT0FBTyxNQUFNLGdCQUFnQixVQUFVO0FBQzFDLGlCQUFTLHFCQUFxQixNQUFNLE1BQU0sQ0FBQyxDQUFDLEVBQUUsS0FBSyxLQUFLO0FBQUEsTUFDekQsT0FBTztBQUNOLGNBQU0sY0FBYztBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUdBLGVBQVcsQ0FBQyxFQUFFLGVBQWUsS0FBSyxxQkFBcUI7QUFJdEQsVUFBSSxnQkFBZ0IsV0FBVyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxrQkFBa0I7QUFDekUsd0JBQWdCLENBQUMsRUFBRSxjQUFjO0FBRWpDO0FBQUEsTUFDRDtBQUdBLFlBQU0sNkJBQTZCLG9CQUFJLElBQWlDO0FBQ3hFLGlCQUFXLGtCQUFrQixpQkFBaUI7QUFDN0MsaUJBQVMsNEJBQTRCLGVBQWUsYUFBYSxDQUFDLENBQUMsRUFBRSxLQUFLLGNBQWM7QUFBQSxNQUN6RjtBQUdBLFVBQUksc0JBQXNCO0FBQzFCLGlCQUFXLENBQUMsRUFBRUMsZ0JBQWUsS0FBSyw0QkFBNEI7QUFDN0QsWUFBSSxDQUFDLHVCQUF1QkEsaUJBQWdCLFNBQVMsR0FBRztBQUN2RCxnQkFBTSxDQUFDLE9BQU8sR0FBRyxJQUFJLElBQUlBLGlCQUFnQixJQUFJLENBQUMsRUFBRSxPQUFPLE1BQU0sT0FBTyxlQUFlLFVBQVUsSUFBSSxDQUFDO0FBQ2xHLGdDQUFzQixLQUFLLEtBQUssaUJBQWUsZ0JBQWdCLEtBQUs7QUFBQSxRQUNyRTtBQUFBLE1BQ0Q7QUFHQSxVQUFJLHFCQUFxQjtBQUN4QixtQ0FBMkIsTUFBTTtBQUNqQyxtQkFBVyxrQkFBa0IsaUJBQWlCO0FBQzdDLHlCQUFlLGNBQWMsZUFBZSxPQUFPLGVBQWUsVUFBVSxJQUFJO0FBQ2hGLG1CQUFTLDRCQUE0QixlQUFlLGFBQWEsQ0FBQyxDQUFDLEVBQUUsS0FBSyxjQUFjO0FBQUEsUUFDekY7QUFBQSxNQUNEO0FBR0EsWUFBTSxlQUF5QixDQUFDO0FBQ2hDLGlCQUFXLENBQUMsV0FBVyxLQUFLLDRCQUE0QjtBQUN2RCxxQkFBYSxLQUFLLFdBQVc7QUFBQSxNQUM5QjtBQUdBLFVBQUksYUFBYSxXQUFXLEdBQUc7QUFDOUIsbUJBQVcsU0FBUywyQkFBMkIsSUFBSSxhQUFhLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRztBQUMxRSxjQUFJLENBQUMsTUFBTSxrQkFBa0I7QUFDNUIsa0JBQU0sY0FBYztBQUFBLFVBQ3JCO0FBQUEsUUFDRDtBQUVBO0FBQUEsTUFDRDtBQUdBLFlBQU0sd0JBQXdCLFFBQVEsY0FBYyxLQUFLLEtBQUssR0FBRztBQUNqRSxtQkFBYSxRQUFRLENBQUMsYUFBYSxhQUFhO0FBQy9DLG1CQUFXLFNBQVMsMkJBQTJCLElBQUksV0FBVyxLQUFLLENBQUMsR0FBRztBQUN0RSxnQkFBTSxjQUFjLHNCQUFzQixRQUFRO0FBQUEsUUFDbkQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9CLE9BQTJCO0FBQ3RELFlBQVEsT0FBTztBQUFBLE1BQ2QsS0FBSztBQUNKLGVBQU8sRUFBRSxXQUFXLFVBQVUsT0FBTyxtQkFBbUIsTUFBTTtBQUFBLE1BQy9ELEtBQUs7QUFDSixlQUFPLEVBQUUsV0FBVyxVQUFVLFFBQVEsbUJBQW1CLE1BQU07QUFBQSxNQUNoRSxLQUFLO0FBQ0osZUFBTyxFQUFFLFdBQVcsVUFBVSxNQUFNLG1CQUFtQixNQUFNO0FBQUEsTUFDOUQ7QUFDQyxlQUFPLEVBQUUsV0FBVyxVQUFVLFFBQVEsbUJBQW1CLEtBQUs7QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLE9BQU8sU0FBc0Q7QUFHcEUsUUFBSSxLQUFLLHlCQUF5QjtBQUNqQyxVQUFJLDJCQUEyQixLQUFLLFNBQVMsK0JBQStCO0FBQzVFLFVBQUksQ0FBQyw0QkFBNEIsZUFBZSxLQUFLLE1BQU0sSUFBSSxHQUFHO0FBQ2pFLG1DQUEyQixLQUFLLFNBQVMsVUFBVSxLQUFLLEtBQUssU0FBUyxjQUFjO0FBQUEsTUFDckY7QUFFQSxVQUFJLDBCQUEwQjtBQUM3QixhQUFLLHdCQUF3QixVQUFVLElBQUksb0JBQW9CO0FBQy9ELGFBQUssd0JBQXdCLE1BQU0sWUFBWSw4QkFBOEIseUJBQXlCLFNBQVMsQ0FBQztBQUFBLE1BQ2pILE9BQU87QUFDTixhQUFLLHdCQUF3QixVQUFVLE9BQU8sb0JBQW9CO0FBQ2xFLGFBQUssd0JBQXdCLE1BQU0sZUFBZSw0QkFBNEI7QUFBQSxNQUMvRTtBQUFBLElBQ0Q7QUFHQSxTQUFLLFdBQVcsQ0FBQyxRQUFRLFVBQVUsY0FBYyxnQkFBZ0IsVUFBVSxpQkFBaUI7QUFDM0YsV0FBSyxVQUFVLFFBQVEsVUFBVSxjQUFjLGdCQUFnQixVQUFVLFlBQVk7QUFBQSxJQUN0RixDQUFDO0FBR0QsU0FBSywyQkFBMkI7QUFHaEMsU0FBSyxPQUFPLEtBQUssWUFBWSxPQUFPO0FBQUEsRUFDckM7QUFBQTtBQUFBLEVBR1EsZ0JBQWdCLFFBQXFCLFVBQWtCLGNBQTJCLGNBQStCO0FBQ3hILFVBQU0sY0FBYyxLQUFLLFVBQVUsU0FBUyxRQUFRO0FBQ3BELFVBQU0sY0FBYyxDQUFDLE9BQU8sY0FBYyx3QkFBd0IsV0FBVztBQUM3RSxVQUFNLFVBQVUsS0FBSyxXQUFXO0FBRWhDLFVBQU0saUJBQWlCLGVBQWUsUUFBUTtBQUM5QyxVQUFNLGlCQUFpQixlQUFlLENBQUMsa0JBQWtCLFFBQVE7QUFDakUsVUFBTSxZQUFZLGtCQUFrQjtBQUdwQyxVQUFNLHlCQUF5QixrQkFBa0IsS0FBSztBQUV0RCxRQUFJO0FBQ0osUUFBSSxXQUFXO0FBQ2Qsa0JBQVksaUJBQWlCLEtBQUssb0JBQW9CLHlCQUF5QixLQUFLLG9DQUFvQyxLQUFLO0FBQUEsSUFDOUgsT0FBTztBQUVOLGtCQUFZLGNBQWMsS0FBSyxvQkFBb0IsS0FBSztBQUFBLElBQ3pEO0FBRUEsUUFBSSxDQUFDLGFBQWEsVUFBVSxTQUFTLEdBQUc7QUFDdkMsVUFBSSxDQUFDLGFBQWEsUUFBUSxHQUFHO0FBQzVCLHFCQUFhLE1BQU07QUFBQSxNQUNwQjtBQUdBLFlBQU0sYUFBYSxjQUFjLEtBQUssb0NBQXFDLGNBQWMsU0FBUyxlQUFlLGNBQVMsSUFBSSxTQUFTLFlBQVksV0FBVyxJQUFLLEtBQUssbUJBQW1CLFNBQVM7QUFDcE0sbUJBQWEsS0FBSyxXQUFXLEVBQUUsTUFBTSxNQUFNLE9BQU8sT0FBTyxXQUFXLENBQUM7QUFBQSxJQUN0RTtBQUVBLGlCQUFhLFVBQVUsT0FBTyxxQkFBcUIsZUFBZSxDQUFDLGNBQWM7QUFDakYsaUJBQWEsVUFBVSxPQUFPLG9CQUFvQixDQUFDLGtCQUFrQixDQUFDLGNBQWM7QUFDcEYsaUJBQWEsVUFBVSxPQUFPLGdCQUFnQixDQUFDLFdBQVc7QUFFMUQsZUFBVyxVQUFVLENBQUMsUUFBUSxPQUFPLEdBQUc7QUFDdkMsbUJBQWEsVUFBVSxPQUFPLGVBQWUsTUFBTSxJQUFJLGFBQWEsUUFBUSxzQkFBc0IsTUFBTTtBQUFBLElBQ3pHO0FBQUEsRUFDRDtBQUFBLEVBRVEsVUFBVSxRQUFxQixVQUFrQixjQUEyQixnQkFBZ0MsVUFBNkIsY0FBK0I7QUFDL0ssVUFBTSxjQUFjLEtBQUssVUFBVSxTQUFTLFFBQVE7QUFDcEQsVUFBTSxVQUFVLEtBQUssV0FBVztBQUdoQyxTQUFLLGVBQWUsUUFBUSxVQUFVLGNBQWMsZ0JBQWdCLFFBQVE7QUFHNUUsU0FBSyxnQkFBZ0IsUUFBUSxVQUFVLGNBQWMsWUFBWTtBQUVqRSxVQUFNLFlBQVksZUFBZSxRQUFRLG9CQUFvQixXQUFXLFdBQWlFLFFBQVE7QUFDakosZUFBVyxVQUFVLENBQUMsT0FBTyxVQUFVLE9BQU8sR0FBRztBQUNoRCxtQkFBYSxVQUFVLE9BQU8sVUFBVSxNQUFNLElBQUksY0FBYyxNQUFNO0FBQUEsSUFDdkU7QUFFQSxpQkFBYSxVQUFVLE9BQU8sWUFBWSxRQUFRLGFBQWEsUUFBUSxRQUFRO0FBRS9FLGlCQUFhLFVBQVUsT0FBTyxVQUFVLFdBQVc7QUFDbkQsZUFBVyxVQUFVLENBQUMsVUFBVSxXQUFXLFFBQVEsR0FBRztBQUNyRCxtQkFBYSxVQUFVLE9BQU8sVUFBVSxNQUFNLElBQUksZUFBZSxRQUFRLG9CQUFvQixNQUFNO0FBQUEsSUFDcEc7QUFJQSxRQUFJLENBQUMsUUFBUSxZQUFZLGVBQWUsUUFBUSxvQkFBb0IsVUFBVTtBQUM3RSxtQkFBYSxNQUFNLE9BQU8sR0FBRyxXQUFXLEtBQUssa0JBQWtCLFFBQVEsZUFBZSxDQUFDO0FBQUEsSUFDeEYsT0FBTztBQUNOLG1CQUFhLE1BQU0sT0FBTztBQUFBLElBQzNCO0FBR0EsU0FBSyxpQkFBaUIsVUFBVSxZQUFZO0FBRzVDLFNBQUssZ0NBQWdDLEtBQUssV0FBVyxnQkFBZ0IsS0FBSyxXQUFXLFFBQVEsY0FBYyxZQUFZO0FBQUEsRUFDeEg7QUFBQSxFQUVRLGVBQWUsUUFBcUIsVUFBa0IsY0FBMkIsZ0JBQWdDLFVBQW1DO0FBQzNKLFVBQU0sVUFBVSxLQUFLLFdBQVc7QUFLaEMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLGFBQWE7QUFDakIsUUFBSSx1QkFBdUIsUUFBUSxRQUFRLGFBQWEsTUFBTTtBQUM5RCxVQUFNLHVCQUF1QixRQUFRLFFBQVEsYUFBYSxNQUFNO0FBQ2hFLFFBQUk7QUFDSixRQUFJLFFBQVEsb0JBQW9CLGFBQWEsS0FBSyxVQUFVLFNBQVMsUUFBUSxHQUFHO0FBQy9FLFlBQU0saUJBQWlCLFFBQVEsYUFBYSxRQUFRO0FBQ3BELGFBQU8saUJBQWlCLEtBQUssU0FBUyxNQUFNLE9BQU8sQ0FBQyxFQUFFLFlBQVk7QUFDbEUsb0JBQWM7QUFDZCxtQkFBYTtBQUNiLDZCQUF1QjtBQUFBLElBQ3hCLE9BQU87QUFDTixhQUFPLFNBQVM7QUFDaEIsbUJBQWEsUUFBUSxlQUFlLEdBQUcsS0FBSyxjQUFjLFFBQVEsSUFBSSxDQUFDLE9BQU87QUFDOUUsb0JBQWMsU0FBUyxlQUFlO0FBQUEsSUFDdkM7QUFFQSxRQUFJLFNBQVMsV0FBVztBQUN2QixtQkFBYSxhQUFhLGNBQWMsU0FBUyxTQUFTO0FBRzFELG1CQUFhLGFBQWEsb0JBQW9CLEVBQUU7QUFBQSxJQUNqRDtBQUdBLG1CQUFlO0FBQUEsTUFDZCxFQUFFLE1BQU0sYUFBYSxVQUFVLHVCQUF1QixlQUFlLFFBQVEsRUFBRSxtQkFBbUIsaUJBQWlCLEtBQUssQ0FBQyxFQUFFO0FBQUEsTUFDM0g7QUFBQSxRQUNDLE9BQU8sS0FBSyxjQUFjLE1BQU07QUFBQSxRQUNoQyxjQUFjLFNBQVMsQ0FBQyxhQUFhLHVCQUF1Qix3QkFBd0IsTUFBUyxFQUFFLE9BQU8sT0FBTyxxQkFBcUIsQ0FBQyxDQUFDO0FBQUEsUUFDcEksUUFBUSxDQUFDLEtBQUssVUFBVSxTQUFTLE1BQU07QUFBQSxRQUN2QztBQUFBLFFBQ0EsaUJBQWlCO0FBQUEsVUFDaEIsUUFBUTtBQUFBLFVBQ1IsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxRQUNBLE1BQU0sT0FBTyxRQUFRO0FBQUEsUUFDckIsVUFBVSxRQUFRLGNBQWM7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsVUFBTSxXQUFXLHVCQUF1QixlQUFlLFFBQVEsRUFBRSxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQztBQUM5RyxRQUFJLFVBQVU7QUFDYixtQkFBYSxhQUFhLHNCQUFzQixvQkFBb0IsUUFBUSxDQUFDO0FBQUEsSUFDOUUsT0FBTztBQUNOLG1CQUFhLGdCQUFnQixvQkFBb0I7QUFBQSxJQUNsRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdDQUFnQyxlQUF3QixRQUFxQixjQUEyQixjQUErQjtBQUM5SSxVQUFNLGNBQWMsS0FBSyxVQUFVLFNBQVMsTUFBTTtBQUNsRCxVQUFNLHVCQUF1QixLQUFLLGlCQUFpQixlQUFlLGFBQWEsUUFBUSxZQUFZO0FBRW5HLFNBQUssa0JBQWtCLGVBQWUsQ0FBQyxzQkFBc0IsUUFBUSxjQUFjLFlBQVk7QUFBQSxFQUNoRztBQUFBLEVBRVEsa0JBQWtCLGVBQXdCLGdCQUF5QixRQUFxQixjQUEyQixjQUErQjtBQUN6SixVQUFNLFdBQVcsS0FBSyxVQUFVLFNBQVMsTUFBTTtBQUMvQyxVQUFNLGFBQWEsS0FBSyxVQUFVLFdBQVcsTUFBTTtBQUVuRCxpQkFBYSxVQUFVLE9BQU8sVUFBVSxRQUFRO0FBQ2hELGlCQUFhLFVBQVUsT0FBTyxZQUFZLFVBQVU7QUFDcEQsaUJBQWEsVUFBVSxPQUFPLGtCQUFrQixjQUFjLEtBQUssVUFBVSxnQkFBZ0IsU0FBUyxDQUFDO0FBQ3ZHLGlCQUFhLGFBQWEsaUJBQWlCLGFBQWEsU0FBUyxPQUFPO0FBQ3hFLGlCQUFhLFdBQVcsV0FBVyxJQUFJO0FBQ3ZDLGlCQUFhLGFBQWEsUUFBUTtBQUdsQyxRQUFJLFVBQVU7QUFDYixZQUFNLDZCQUE2QixLQUFLLFNBQVMsZ0JBQWdCLG9CQUFvQiwyQkFBMkI7QUFDaEgsbUJBQWEsVUFBVSxPQUFPLHFCQUFxQixDQUFDLENBQUMsMEJBQTBCO0FBQy9FLG1CQUFhLE1BQU0sWUFBWSw2QkFBNkIsOEJBQThCLEVBQUU7QUFBQSxJQUM3RjtBQUdBLFFBQUksb0JBQW1DO0FBQ3ZDLFFBQUksZ0JBQWdCO0FBQ25CLFVBQUksVUFBVTtBQUNiLDRCQUFvQixLQUFLLFNBQVMsZ0JBQWdCLHdCQUF3QiwrQkFBK0I7QUFBQSxNQUMxRztBQUVBLFVBQUksc0JBQXNCLFFBQVEsWUFBWTtBQUM3Qyw0QkFBb0IsS0FBSyxTQUFTLHVCQUF1QjtBQUFBLE1BQzFEO0FBQUEsSUFDRDtBQUVBLGlCQUFhLFVBQVUsT0FBTyxrQkFBa0IsQ0FBQyxDQUFDLGlCQUFpQjtBQUNuRSxpQkFBYSxNQUFNLFlBQVksMEJBQTBCLHFCQUFxQixFQUFFO0FBQUEsRUFDakY7QUFBQSxFQUVRLGlCQUFpQixlQUF3QixhQUFzQixRQUFxQixjQUFvQztBQUMvSCxRQUFJLHlCQUF5QjtBQUc3QixRQUFJLE9BQU8sUUFBUSxLQUFLLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDM0MsbUJBQWEsVUFBVSxJQUFJLE9BQU87QUFHbEMsVUFBSSxLQUFLLFdBQVcsWUFBWSx1QkFBdUI7QUFDdEQsWUFBSTtBQUNKLFlBQUksaUJBQWlCLGFBQWE7QUFDakMsZ0NBQXNCLEtBQUssU0FBUywwQkFBMEI7QUFBQSxRQUMvRCxXQUFXLGlCQUFpQixDQUFDLGFBQWE7QUFDekMsZ0NBQXNCLEtBQUssU0FBUyw0QkFBNEI7QUFBQSxRQUNqRSxXQUFXLENBQUMsaUJBQWlCLGFBQWE7QUFDekMsZ0NBQXNCLEtBQUssU0FBUyxvQ0FBb0M7QUFBQSxRQUN6RSxPQUFPO0FBQ04sZ0NBQXNCLEtBQUssU0FBUyxzQ0FBc0M7QUFBQSxRQUMzRTtBQUVBLFlBQUkscUJBQXFCO0FBQ3hCLG1DQUF5QjtBQUV6Qix1QkFBYSxVQUFVLElBQUksa0JBQWtCO0FBQzdDLHVCQUFhLE1BQU0sWUFBWSxnQ0FBZ0MsbUJBQW1CO0FBQUEsUUFDbkY7QUFBQSxNQUNELE9BQU87QUFDTixxQkFBYSxVQUFVLE9BQU8sa0JBQWtCO0FBQ2hELHFCQUFhLE1BQU0sZUFBZSw4QkFBOEI7QUFBQSxNQUNqRTtBQUFBLElBQ0QsT0FHSztBQUNKLG1CQUFhLFVBQVUsT0FBTyxTQUFTLGtCQUFrQjtBQUN6RCxtQkFBYSxNQUFNLGVBQWUsOEJBQThCO0FBQUEsSUFDakU7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUJBQWlCLFVBQWtCLGNBQWlDO0FBQzNFLFVBQU0sY0FBYyxLQUFLLFVBQVUsU0FBUyxRQUFRO0FBQ3BELFVBQU0sa0JBQWtCLGVBQWUsS0FBSyxVQUFVLGdCQUFnQixXQUFXO0FBQ2pGLFVBQU0sK0JBQStCLEtBQUssVUFBVSxnQkFBZ0IsS0FBSyxVQUFVO0FBR25GLFVBQU0sb0JBQXFCLG1CQUFtQiwrQkFBK0IsS0FBSyxTQUFTLHNCQUFzQixJQUFJLFdBQWMsS0FBSyxTQUFTLFVBQVUsS0FBSyxLQUFLLFNBQVMsY0FBYztBQUM1TCxpQkFBYSxNQUFNLGNBQWMsbUJBQW1CLGFBQWEsZ0JBQWdCLEtBQUs7QUFDdEYsaUJBQWEsTUFBTSxlQUFlLEtBQUssU0FBUyxvQkFBb0IsS0FBSztBQUFBLEVBQzFFO0FBQUEsRUFFbUIscUJBQXFCLGVBQWlEO0FBQ3hGLFVBQU0sZ0JBQWdCLEtBQUssV0FBVyxnQkFBZ0IsS0FBSztBQUczRCxRQUFJLGVBQWU7QUFDbEIsYUFBTztBQUFBLElBQ1IsT0FHSztBQUNKLGFBQU87QUFBQSxRQUNOLFNBQVMsS0FBSyxXQUFXLFlBQVksMEJBQTBCLGNBQWMsVUFBVSxjQUFjLFFBQVEsT0FBTyxZQUFVLE9BQU8sT0FBTyx1QkFBdUI7QUFBQSxRQUNuSyxXQUFXLGNBQWM7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFbUIsMkJBQTJCLGVBQWlEO0FBQzlGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxZQUFvQjtBQUduQixRQUFJLEtBQUssV0FBVyxNQUFNO0FBQ3pCLGFBQU8sS0FBSyxXQUFXLEtBQUs7QUFBQSxJQUM3QixPQUdLO0FBQ0osYUFBTyxLQUFLLGNBQWM7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUF3QjtBQUMvQixRQUFJO0FBRUosUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixlQUFTO0FBQUEsSUFDVixXQUFXLEtBQUssV0FBVyxZQUFZLFlBQVksS0FBSyx5QkFBeUIsVUFBVSxTQUFTLFVBQVUsR0FBRztBQUdoSCxlQUFTLEtBQUssd0JBQXdCO0FBQUEsSUFDdkMsT0FBTztBQUNOLGVBQVMsS0FBSztBQUFBLElBQ2Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBTyxZQUEyQyxTQUEyRDtBQUc1RyxXQUFPLE9BQU8sS0FBSyxZQUFZLFVBQVU7QUFFekMsUUFBSSxLQUFLLFNBQVM7QUFDakIsVUFBSSxDQUFDLEtBQUssZ0JBQWdCLE9BQU87QUFPaEMsY0FBTSxhQUFhLDZCQUE2QixVQUFVLEtBQUssTUFBTSxHQUFHLE1BQU07QUFDN0UsZUFBSztBQUFBLFlBQVMsS0FBSztBQUFBLFlBQVksS0FBSyxnQkFBZ0IsT0FBTztBQUFBO0FBQUEsVUFBOEM7QUFFekcsZUFBSyxnQkFBZ0IsTUFBTTtBQUFBLFFBQzVCLENBQUM7QUFDRCxhQUFLLGdCQUFnQixRQUFRLEVBQUUsU0FBUyxTQUFTLE1BQU0sV0FBVyxRQUFRLEVBQUU7QUFBQSxNQUM3RTtBQUdBLFVBQUksU0FBUyxzQkFBc0I7QUFDbEMsYUFBSyxnQkFBZ0IsTUFBTSxVQUFVO0FBQUEsVUFDcEMsR0FBRyxLQUFLLGdCQUFnQixNQUFNO0FBQUEsVUFDOUIsc0JBQXNCO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFFBQUksQ0FBQyxLQUFLLFdBQVcsTUFBTTtBQUMxQixXQUFLLFdBQVcsT0FBTyxJQUFJLFVBQVUsV0FBVyxVQUFVLE9BQU8sS0FBSyxjQUFjLENBQUM7QUFBQSxJQUN0RjtBQUVBLFdBQU8sS0FBSyxXQUFXO0FBQUEsRUFDeEI7QUFBQSxFQUVRLFNBQVMsWUFBMkMsU0FBc0Q7QUFHakgsUUFBSSxXQUFXLGNBQWMsVUFBVSxRQUFRLFdBQVcsY0FBYyxVQUFVLE1BQU07QUFDdkYsV0FBSyxhQUFhLFlBQVksT0FBTztBQUFBLElBQ3RDO0FBS0EsVUFBTSxlQUFlLEtBQUssV0FBVztBQUNyQyxVQUFNLGVBQWUsS0FBSyxXQUFXLE9BQU8sSUFBSSxVQUFVLFdBQVcsVUFBVSxPQUFPLEtBQUssY0FBYyxDQUFDO0FBTTFHLFFBQUksZ0JBQWdCLGFBQWEsV0FBVyxhQUFhLFFBQVE7QUFDaEUsV0FBSyxVQUFVLFNBQVM7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsWUFBMkMsU0FBc0Q7QUFPckgsVUFBTSxvQkFBb0IsS0FBSyxxQkFBcUIsVUFBVTtBQUM5RCxRQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLFdBQUssd0JBQXdCLE9BQU87QUFBQSxJQUNyQyxPQUFPO0FBQ04sMkJBQXFCLEtBQUssb0JBQW9CLEVBQUUsTUFBTSxRQUFRO0FBQUEsSUFDL0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxxQkFBcUIsWUFBb0Q7QUFDaEYsVUFBTSxDQUFDLHlCQUF5QixlQUFlLHdCQUF3QixhQUFhLElBQUksd0JBQXdCLEtBQUsseUJBQXlCLEtBQUssZUFBZSxLQUFLLCtCQUErQixLQUFLLGFBQWE7QUFFeE4sVUFBTSx5QkFBeUIsS0FBSztBQUNwQyxVQUFNLHFCQUFxQixNQUFNLHVCQUF1QixlQUFlLHdCQUF3QixlQUFlO0FBTTlHLFVBQU0sdUJBQXVCLHdCQUF3QixVQUFVLFNBQVMsVUFBVTtBQUNsRixRQUFJLG9CQUFvQjtBQUV4QixhQUFTLG1CQUFtQixTQUF3QjtBQUNuRCwwQkFBb0I7QUFHcEIsOEJBQXdCLFVBQVUsT0FBTyxZQUFZLGlCQUFpQjtBQUt0RSxvQkFBYyxNQUFNLFlBQVksMkJBQTJCLG9CQUFvQixHQUFHLG1CQUFtQixDQUFDLE9BQU8sR0FBRztBQUNoSCw4QkFBd0IsTUFBTSxZQUFZLG1DQUFtQyxHQUFHLHdCQUF3QixlQUFlLENBQUMsSUFBSTtBQUc1SCxpQkFBVyxPQUFPLGNBQWMsVUFBVTtBQUN6QyxZQUFJLFVBQVUsT0FBTyxhQUFhO0FBQUEsTUFDbkM7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLFdBQVcsWUFBWSxVQUFVO0FBQ3pDLFlBQU0sbUJBQW1CLGNBQWM7QUFDdkMsWUFBTSxlQUFlLGNBQWM7QUFDbkMsWUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxjQUFNLFVBQVUsS0FBSyxXQUFXO0FBQ2hDLFlBQUksQ0FBQyxTQUFTO0FBQ2IsaUJBQU87QUFBQSxRQUNSO0FBRUEsY0FBTSxpQ0FBaUMsUUFBUSxjQUFjLG1CQUFtQixJQUFJLFdBQVcsVUFBVTtBQUN6RyxZQUFJLGlDQUFpQyxHQUFHO0FBR3ZDLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGVBQU87QUFBQSxNQUNSO0FBV0EsVUFBSSxxQkFBc0IsZUFBZSxvQkFBb0IsbUJBQW1CLEdBQUk7QUFDbkYsMkJBQW1CLElBQUk7QUFBQSxNQUN4QjtBQUdBLFVBQUksbUJBQW1CO0FBQ3RCLFlBQ0UsY0FBYyxlQUFlLFdBQVcsVUFBVTtBQUFBLFFBQ2xELGlCQUFpQixvQkFBb0IsY0FBYyxpQkFBaUIsS0FBSztBQUFBLFFBQ3pFLENBQUMsbUJBQW1CLEdBQ3BCO0FBQ0QsNkJBQW1CLEtBQUs7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFdBR1Msc0JBQXNCO0FBQzlCLHlCQUFtQixLQUFLO0FBQUEsSUFDekI7QUFNQSxRQUFJLHFCQUFxQixDQUFDLHNCQUFzQjtBQUMvQyxZQUFNLG1CQUFtQixjQUFjO0FBQ3ZDLG9CQUFjLG9CQUFvQjtBQUFBLFFBQ2pDLE9BQU87QUFBQSxRQUNQLGFBQWE7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNGO0FBTUEsUUFBSSxtQkFBbUI7QUFLdEIsWUFBTSxPQUFPLG9CQUFJLElBQTRDO0FBRTdELFVBQUksa0JBQXNDO0FBQzFDLFVBQUksVUFBbUM7QUFDdkMsaUJBQVcsU0FBUyxjQUFjLFVBQVU7QUFDM0MsWUFBSSxVQUFVLEtBQUssaUJBQWlCO0FBQ25DO0FBQUEsUUFDRDtBQUNBLGNBQU0sTUFBTTtBQUNaLGNBQU0sVUFBVSxJQUFJO0FBR3BCLFlBQUksWUFBWSxpQkFBaUI7QUFDaEMsNEJBQWtCO0FBQ2xCLGNBQUksU0FBUztBQUNaLGlCQUFLLElBQUksU0FBUyxJQUFJO0FBQUEsVUFDdkI7QUFBQSxRQUNEO0FBS0Esa0JBQVU7QUFDVixhQUFLLElBQUksS0FBSyxLQUFLO0FBQUEsTUFDcEI7QUFHQSxVQUFJLFNBQVM7QUFDWixhQUFLLElBQUksU0FBUyxJQUFJO0FBQUEsTUFDdkI7QUFFQSxpQkFBVyxDQUFDLEtBQUssU0FBUyxLQUFLLE1BQU07QUFDcEMsWUFBSSxVQUFVLE9BQU8sZUFBZSxTQUFTO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUF3QixTQUFzRDtBQUNyRixVQUFNLENBQUMsZUFBZSxhQUFhLElBQUksd0JBQXdCLEtBQUssZUFBZSxLQUFLLGFBQWE7QUFrQnJHLFVBQU0sbUJBQW1CLGNBQWM7QUFDdkMsVUFBTSxlQUFlLGNBQWM7QUFNbkMsUUFBSSxrQkFBa0I7QUFDdEIsUUFBSSxLQUFLLFVBQVUsY0FBYyxHQUFHO0FBQ25DLFlBQU0saUJBQWlCLEtBQUssa0JBQWtCLEtBQUssV0FBVyxZQUFZLGVBQWU7QUFDekYsd0JBQWtCLEtBQUssVUFBVSxjQUFjO0FBRS9DLGVBQVMsV0FBVyxHQUFHLFdBQVcsS0FBSyxVQUFVLGFBQWEsWUFBWTtBQUN6RSxjQUFNLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFDdkMsWUFBSSxLQUFLO0FBQ1IsY0FBSSxNQUFNLE9BQU8sR0FBRyxXQUFXLGNBQWM7QUFBQSxRQUM5QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxvQkFBb0IsS0FBSyxVQUFVLGVBQWUsS0FBSyxlQUFlLEtBQUssVUFBVSxZQUFZLElBQUk7QUFDM0csVUFBTSxDQUFDLFdBQVcsY0FBYyxJQUFJLHFCQUFxQixDQUFDLFFBQVcsTUFBUztBQUk5RSxRQUFJLDBCQUEwQixLQUFLLFdBQVcsWUFBWSxvQkFBb0IsWUFBWSxPQUFPLG1CQUFtQixZQUFZLEtBQUssVUFBVSxTQUFTLGNBQWM7QUFLdEssUUFBSSw4QkFBOEIsbUJBQW1CO0FBQ3JELFFBQUksS0FBSyxVQUFVLGNBQWMsS0FBSyw4QkFBOEIsdUJBQXVCLFVBQVUsS0FBSztBQUN6RyxvQkFBYyxVQUFVLElBQUkscUJBQXFCO0FBRWpELG9DQUE4QjtBQUM5Qix3QkFBa0I7QUFDbEIsZ0NBQTBCO0FBQUEsSUFDM0IsT0FBTztBQUNOLG9CQUFjLFVBQVUsT0FBTyxxQkFBcUI7QUFBQSxJQUNyRDtBQUNBLHlCQUFxQixLQUFLLG9CQUFvQixFQUFFLE1BQU0sUUFBUSxHQUFHLGVBQWU7QUFFaEYsUUFBSTtBQUNKLFFBQUk7QUFFSixRQUFJLENBQUMsS0FBSyx3QkFBd0IsV0FBVztBQUM1QyxzQkFBZ0IsVUFBVTtBQUMxQix1QkFBaUIsVUFBVTtBQUFBLElBQzVCO0FBR0EsVUFBTSxFQUFFLE9BQU8scUJBQXFCLGFBQWEsZ0JBQWdCLElBQUksY0FBYyxvQkFBb0I7QUFDdkcsa0JBQWMsb0JBQW9CO0FBQUEsTUFDakMsT0FBTztBQUFBLE1BQ1AsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUNELFVBQU0sb0JBQW9CLHdCQUF3QixvQkFBb0Isb0JBQW9CO0FBRzFGLFFBQ0MsS0FBSztBQUFBLElBQ0wsT0FBTyxrQkFBa0I7QUFBQSxJQUN6QixPQUFPLG1CQUFtQjtBQUFBLElBQzFCO0FBQUEsSUFDQyxDQUFDLHFCQUFxQixDQUFDLFNBQVMsc0JBQ2hDO0FBQ0QsV0FBSyx1QkFBdUI7QUFDNUI7QUFBQSxJQUNEO0FBR0EsVUFBTSwwQkFBMEIsY0FBYyxrQkFBa0IsRUFBRTtBQUNsRSxVQUFNLGdCQUFnQixrQkFBa0I7QUFDeEMsVUFBTSx3QkFBd0IsZ0JBQWdCO0FBdUI5QyxRQUFJLGlCQUFpQiwwQkFBMEIsOEJBQThCLHdCQUF3QixnQkFBZ0I7QUFDcEgsb0JBQWMsa0JBQWtCO0FBQUEsUUFDL0IsWUFBWSwyQkFBNEIsd0JBQXdCLGtCQUE2QywwQkFBMEI7QUFBQSxNQUN4SSxDQUFDO0FBQUEsSUFDRixXQWlCUywwQkFBMEIseUJBQXlCLENBQUMsZUFBZTtBQUMzRSxvQkFBYyxrQkFBa0I7QUFBQSxRQUMvQixZQUFZO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixpQkFBZ0U7QUFDekYsVUFBTSxrQkFBa0IsUUFBUSxLQUFLLE9BQU8sUUFBUSxpQkFBaUIsQ0FBQztBQUV0RSxZQUFRLGlCQUFpQjtBQUFBLE1BQ3hCLEtBQUs7QUFDSixlQUFPLGtCQUFrQix1QkFBdUIscUNBQXFDLHVCQUF1QixVQUFVO0FBQUEsTUFDdkgsS0FBSztBQUNKLGVBQU8sdUJBQXVCLFVBQVU7QUFBQSxNQUN6QztBQUNDLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFVBQU0sMEJBQTBCLHFCQUFxQixLQUFLLHVCQUF1QjtBQUNqRiw0QkFBd0IsVUFBVSxPQUFPLFNBQVMsQ0FBQyxLQUFLLE9BQU87QUFHL0QsUUFBSSxDQUFDLEtBQUssV0FBVyxLQUFLLFlBQVk7QUFDckMsV0FBSyxXQUFXLE9BQU87QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQVksVUFBbUI7QUFDOUIsV0FBTyxLQUFLLFVBQVUsUUFBUTtBQUFBLEVBQy9CO0FBQUEsRUFFUSxlQUFlLFFBQW9FO0FBQzFGLFVBQU0sV0FBVyxLQUFLLFVBQVUsUUFBUSxNQUFNO0FBQzlDLFVBQU0sTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUN2QyxRQUFJLEtBQUs7QUFDUixhQUFPLENBQUMsS0FBSyxRQUFRO0FBQUEsSUFDdEI7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsY0FBYyxVQUEyQztBQUNoRSxRQUFJLFlBQVksR0FBRztBQUNsQixZQUFNLGdCQUFnQixxQkFBcUIsS0FBSyxhQUFhO0FBRTdELGFBQU8sY0FBYyxTQUFTLFFBQVE7QUFBQSxJQUN2QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxhQUFzQztBQUM3QyxXQUFPLEtBQUssY0FBYyxLQUFLLFVBQVUsUUFBUSxDQUFDO0FBQUEsRUFDbkQ7QUFBQSxFQUVRLDJCQUFpQztBQU94QyxTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFUSwyQkFBMkIsR0FBdUM7QUFDekUsUUFBSTtBQUNKLFFBQUksYUFBYSxDQUFDLEdBQUc7QUFDcEIsZ0JBQVcsRUFBRSxVQUFVLEVBQUU7QUFBQSxJQUMxQixPQUFPO0FBQ04sZ0JBQVcsRUFBbUI7QUFBQSxJQUMvQjtBQUVBLFdBQU8sQ0FBQyxDQUFDLG9CQUFvQixTQUFTLGVBQWUsS0FBSztBQUFBLEVBQzNEO0FBQUEsRUFFQSxNQUFjLE9BQU8sR0FBYyxnQkFBd0IsZUFBMkM7QUFDckcsZ0JBQVksS0FBSyxHQUFHLElBQUk7QUFFeEIsU0FBSyxtQkFBbUIsZUFBZSxPQUFPLEdBQUcsY0FBYztBQUMvRCxrQkFBYyxVQUFVLE9BQU8sUUFBUTtBQUV2QyxRQUFJLG9CQUFvQixLQUFLLHFCQUFxQiwyQkFBMkIsaUJBQWlCLEtBQUssVUFBVSxjQUFjO0FBQzNILFVBQU0sVUFBMEI7QUFBQSxNQUMvQixRQUFRLEtBQUsscUJBQXFCLDBCQUEwQixLQUFLLFVBQVUsZ0JBQWdCO0FBQUEsTUFDM0YsT0FBTztBQUFBLElBQ1I7QUFHQSxRQUFJLEtBQUssY0FBYyxRQUFRLDZCQUE2QixTQUFTLEdBQUc7QUFDdkUsWUFBTSxPQUFPLEtBQUssY0FBYyxRQUFRLDZCQUE2QixTQUFTO0FBQzlFLFVBQUksTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsR0FBRztBQUMzQyxjQUFNLGNBQWMsS0FBSyxnQkFBZ0IsU0FBUyxLQUFLLENBQUMsRUFBRSxVQUFVO0FBQ3BFLFlBQUksYUFBYTtBQUNoQixnQkFBTSxvQkFBd0MsRUFBRSxPQUFPLGtCQUFrQjtBQUN6RSxjQUFJLENBQUMsS0FBSyxnQkFBZ0IsR0FBRyxZQUFZLEVBQUUsR0FBRztBQUM3Qyw4QkFBa0IsT0FBTyxlQUFlO0FBQUEsVUFDekM7QUFFQSxlQUFLLFdBQVcsV0FBVyxhQUFhLEtBQUssV0FBVyxpQkFBaUI7QUFBQSxRQUMxRTtBQUVBLGFBQUssVUFBVSxNQUFNO0FBQ3JCLGFBQUssY0FBYyxVQUFVLDZCQUE2QixTQUFTO0FBQUEsTUFDcEU7QUFBQSxJQUNELFdBR1MsS0FBSyxlQUFlLFFBQVEsd0JBQXdCLFNBQVMsR0FBRztBQUN4RSxZQUFNLE9BQU8sS0FBSyxlQUFlLFFBQVEsd0JBQXdCLFNBQVM7QUFDMUUsVUFBSSxNQUFNLFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxHQUFHO0FBQzNDLGNBQU0sY0FBYyxLQUFLLGdCQUFnQixTQUFTLEtBQUssQ0FBQyxFQUFFLFdBQVcsT0FBTztBQUM1RSxZQUFJLGFBQWE7QUFDaEIscUJBQVcsTUFBTSxNQUFNO0FBQ3RCLGtCQUFNLFNBQVMsR0FBRyxXQUFXO0FBRzdCLGdCQUFJLFlBQVksT0FBTyxHQUFHLFdBQVcsU0FBUztBQUM3QztBQUFBLFlBQ0Q7QUFHQSxrQkFBTSxvQkFBb0IsWUFBWSxpQkFBaUIsTUFBTTtBQUM3RCxnQkFBSSxnQkFBZ0IsS0FBSyxhQUFhLG9CQUFvQixtQkFBbUI7QUFDNUU7QUFBQSxZQUNEO0FBRUEsZ0JBQUksS0FBSyxnQkFBZ0IsR0FBRyxHQUFHLFdBQVcsU0FBUyxNQUFNLEdBQUc7QUFDM0QsMEJBQVksV0FBVyxRQUFRLEtBQUssV0FBVyxFQUFFLEdBQUcsU0FBUyxPQUFPLGtCQUFrQixDQUFDO0FBRXZGLGtCQUFJLEtBQUsscUJBQXFCLDRCQUE0QixLQUFLLFVBQVUsU0FBUyxNQUFNLEdBQUc7QUFDMUYscUJBQUssVUFBVSxjQUFjLE1BQU07QUFBQSxjQUNwQztBQUFBLFlBQ0QsT0FBTztBQUNOLDBCQUFZLFdBQVcsUUFBUSxLQUFLLFdBQVcsRUFBRSxHQUFHLFNBQVMsT0FBTyxrQkFBa0IsQ0FBQztBQUFBLFlBQ3hGO0FBRUE7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFVBQVUsTUFBTTtBQUNyQixXQUFLLGVBQWUsVUFBVSx3QkFBd0IsU0FBUztBQUFBLElBQ2hFLFdBR1MsS0FBSyxrQkFBa0IsUUFBUSwyQkFBMkIsU0FBUyxHQUFHO0FBQzlFLFlBQU0sT0FBTyxLQUFLLGtCQUFrQixRQUFRLDJCQUEyQixTQUFTO0FBQ2hGLFVBQUksTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsR0FBRztBQUMzQyxjQUFNLFVBQWlDLENBQUM7QUFDeEMsbUJBQVcsTUFBTSxNQUFNO0FBQ3RCLGdCQUFNLG1CQUFtQixNQUFNLEtBQUssNEJBQTRCLDRCQUE0QixHQUFHLFVBQVU7QUFDekcsY0FBSSxrQkFBa0I7QUFDckIsa0JBQU0sZUFBZSxNQUFNLG9CQUFvQixnQkFBZ0I7QUFDL0Qsb0JBQVEsS0FBSyxHQUFHLGFBQWEsSUFBSSxhQUFXLEVBQUUsR0FBRyxRQUFRLFNBQVMsRUFBRSxHQUFHLE9BQU8sU0FBUyxRQUFRLE1BQU0sT0FBTyxrQkFBa0IsRUFBRSxFQUFFLENBQUM7QUFBQSxVQUNwSTtBQUFBLFFBQ0Q7QUFFQSxhQUFLLGNBQWMsWUFBWSxTQUFTLEtBQUssV0FBVyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsTUFDaEY7QUFFQSxXQUFLLGtCQUFrQixVQUFVLDJCQUEyQixTQUFTO0FBQUEsSUFDdEUsT0FHSztBQUNKLFlBQU0sY0FBYyxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixFQUFFLG9CQUFvQixNQUFNLENBQUM7QUFDaEgsa0JBQVksV0FBVyxHQUFHLFVBQVUsS0FBSyxNQUFNLEdBQUcsTUFBTSxLQUFLLFdBQVcsTUFBTSxLQUFLLFVBQVUsTUFBTSxHQUFHLE9BQU87QUFBQSxJQUM5RztBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUVkLFNBQUssaUJBQWlCLFFBQVEsS0FBSyxjQUFjO0FBQUEsRUFDbEQ7QUFDRDtBQTd4RWEsdUJBRVksa0JBQWtCO0FBQUEsRUFDekMsU0FBUztBQUFBLEVBQ1QsT0FBTztBQUNSO0FBTFksdUJBT1ksWUFBWTtBQUFBLEVBQ25DLFNBQVM7QUFBQSxFQUNULFFBQVE7QUFBQSxFQUNSLEtBQUs7QUFDTjtBQVhZLHVCQVlZLHFDQUFxQztBQVpqRCx1QkFjWSwrQkFBK0I7QUFkM0MsdUJBZ0JZLDhCQUE4QjtBQWhCMUMsdUJBaUJZLGlDQUFpQztBQWpCN0MseUJBQU47QUFBQSxFQThESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBMUVVO0FBK3hFYiwyQkFBMkIsQ0FBQyxPQUFPLGNBQWM7QUFHaEQsUUFBTSxjQUFjLE1BQU0sU0FBUyxVQUFVO0FBQzdDLE1BQUksYUFBYTtBQUNoQixjQUFVLFFBQVE7QUFBQTtBQUFBLCtCQUVXLFdBQVc7QUFBQTtBQUFBLEdBRXZDO0FBQUEsRUFDRjtBQUdBLFFBQU0sNEJBQTRCLE1BQU0sU0FBUyxvQkFBb0I7QUFDckUsTUFBSSwyQkFBMkI7QUFDOUIsY0FBVSxRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEdBaUNqQjtBQUFBLEVBQ0Y7QUFHQSxRQUFNLHNCQUFzQixNQUFNLFNBQVMsY0FBYztBQUN6RCxNQUFJLHFCQUFxQjtBQUN4QixjQUFVLFFBQVE7QUFBQTtBQUFBLHlCQUVLLG1CQUFtQjtBQUFBO0FBQUEsR0FFekM7QUFBQSxFQUNGO0FBR0EsUUFBTSxxQkFBcUIsTUFBTSxTQUFTLG9CQUFvQjtBQUM5RCxNQUFJLG9CQUFvQjtBQUN2QixjQUFVLFFBQVE7QUFBQTtBQUFBLHdCQUVJLGtCQUFrQjtBQUFBO0FBQUEsR0FFdkM7QUFBQSxFQUNGO0FBRUEsUUFBTSw4QkFBOEIsTUFBTSxTQUFTLDhCQUE4QjtBQUNqRixNQUFJLDZCQUE2QjtBQUNoQyxjQUFVLFFBQVE7QUFBQTtBQUFBLHdCQUVJLDJCQUEyQjtBQUFBO0FBQUEsR0FFaEQ7QUFBQSxFQUNGO0FBR0EsUUFBTSxxQkFBcUIsTUFBTSxTQUFTLG9CQUFvQjtBQUM5RCxNQUFJLG9CQUFvQjtBQUN2QixjQUFVLFFBQVE7QUFBQTtBQUFBLGFBRVAsa0JBQWtCO0FBQUE7QUFBQSxHQUU1QjtBQUFBLEVBQ0Y7QUFFQSxRQUFNLDhCQUE4QixNQUFNLFNBQVMsOEJBQThCO0FBQ2pGLE1BQUksNkJBQTZCO0FBQ2hDLGNBQVUsUUFBUTtBQUFBO0FBQUEsYUFFUCwyQkFBMkI7QUFBQTtBQUFBLEdBRXJDO0FBQUEsRUFDRjtBQU9BLFFBQU0saUJBQWlCLE1BQU0sU0FBUyxnQkFBZ0I7QUFDdEQsTUFBSSxnQkFBZ0I7QUFDbkIsY0FBVSxRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsd0JBVUksY0FBYztBQUFBO0FBQUEsR0FFbkM7QUFBQSxFQUNGO0FBRUEsUUFBTSwwQkFBMEIsTUFBTSxTQUFTLDBCQUEwQjtBQUN6RSxNQUFJLHlCQUF5QjtBQUM1QixjQUFVLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSx3QkFVSSx1QkFBdUI7QUFBQTtBQUFBLEdBRTVDO0FBQUEsRUFDRjtBQU9BLE1BQUksQ0FBQyxlQUFlLE1BQU0sSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLDJCQUEyQjtBQUMzRSxVQUFNLHNCQUFzQixxQkFBcUIsS0FBSztBQUN0RCxVQUFNLHdCQUF3QixNQUFNLFNBQVMsZ0JBQWdCO0FBQzdELFVBQU0sa0NBQWtDLE1BQU0sU0FBUyxtQ0FBbUM7QUFDMUYsVUFBTSw4QkFBOEIsTUFBTSxTQUFTLCtCQUErQjtBQUVsRixRQUFJO0FBQ0osUUFBSSxtQ0FBbUMsdUJBQXVCO0FBQzdELDhCQUF3QixnQ0FBZ0MsUUFBUSx1QkFBdUIsdUJBQXVCLG1CQUFtQjtBQUFBLElBQ2xJO0FBRUEsUUFBSTtBQUNKLFFBQUksbUNBQW1DLHlCQUF5QiwrQkFBK0IsdUJBQXVCO0FBQ3JILGtDQUE0QixnQ0FBZ0MsUUFBUSx1QkFBdUIsNkJBQTZCLHVCQUF1QixtQkFBbUI7QUFBQSxJQUNuSztBQUdBLFVBQU0sNkJBQTZCLENBQUMsT0FBYyxXQUFrQixXQUFXLFVBQVU7QUFBQSx5RkFDRixXQUFXLFlBQVksRUFBRTtBQUFBLHlGQUN6QixXQUFXLFlBQVksRUFBRTtBQUFBLDJDQUN2RSxLQUFLO0FBQUE7QUFBQTtBQUFBLG1GQUdtQyxXQUFXLFlBQVksRUFBRTtBQUFBLG1GQUN6QixXQUFXLFlBQVksRUFBRTtBQUFBLDJDQUNqRSxTQUFTO0FBQUE7QUFBQTtBQUtsRCxRQUFJLHNCQUFzQix5QkFBeUIsMkJBQTJCO0FBQzdFLFlBQU0sZ0JBQWdCLG1CQUFtQixRQUFRLHFCQUFxQjtBQUN0RSxZQUFNLG9CQUFvQixtQkFBbUIsUUFBUSx5QkFBeUI7QUFDOUUsZ0JBQVUsUUFBUSwyQkFBMkIsZUFBZSxtQkFBbUIsSUFBSSxDQUFDO0FBQUEsSUFDckY7QUFHQSxRQUFJLCtCQUErQix5QkFBeUIsMkJBQTJCO0FBQ3RGLFlBQU0sZ0JBQWdCLDRCQUE0QixRQUFRLHFCQUFxQjtBQUMvRSxZQUFNLG9CQUFvQiw0QkFBNEIsUUFBUSx5QkFBeUI7QUFDdkYsZ0JBQVUsUUFBUSwyQkFBMkIsZUFBZSxpQkFBaUIsQ0FBQztBQUFBLElBQy9FO0FBR0EsUUFBSSwrQkFBK0IsMkJBQTJCO0FBQzdELFlBQU0sb0JBQW9CLDRCQUE0QixRQUFRLHlCQUF5QjtBQUN2RixnQkFBVSxRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSw0Q0FLdUIsaUJBQWlCO0FBQUE7QUFBQSxHQUUxRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLHdCQUF3QixDQUFDLE9BQWMsV0FBa0IsU0FBa0IsV0FBb0I7QUFBQSwwRkFDYixVQUFVLFlBQVksZUFBZSxpREFBaUQsU0FBUyxZQUFZLEVBQUU7QUFBQSwwRkFDN0csVUFBVSxZQUFZLGVBQWUsZ0RBQWdELFNBQVMsWUFBWSxFQUFFO0FBQUEsNENBQzFKLEtBQUs7QUFBQTtBQUFBO0FBQUEsb0ZBR21DLFVBQVUsWUFBWSxlQUFlLGlEQUFpRCxTQUFTLFlBQVksRUFBRTtBQUFBLG9GQUM3RyxVQUFVLFlBQVksZUFBZSxnREFBZ0QsU0FBUyxZQUFZLEVBQUU7QUFBQSw0Q0FDcEosU0FBUztBQUFBO0FBQUE7QUFLbkQsVUFBTSxzQkFBc0IsTUFBTSxTQUFTLHFCQUFxQjtBQUNoRSxRQUFJLHVCQUF1Qix5QkFBeUIsMkJBQTJCO0FBQzlFLFlBQU0sZ0JBQWdCLG9CQUFvQixRQUFRLHFCQUFxQjtBQUN2RSxZQUFNLG9CQUFvQixvQkFBb0IsUUFBUSx5QkFBeUI7QUFDL0UsZ0JBQVUsUUFBUSxzQkFBc0IsZUFBZSxtQkFBbUIsTUFBTSxJQUFJLENBQUM7QUFBQSxJQUN0RjtBQUdBLFVBQU0sK0JBQStCLE1BQU0sU0FBUywrQkFBK0I7QUFDbkYsUUFBSSxnQ0FBZ0MseUJBQXlCLDJCQUEyQjtBQUN2RixZQUFNLGdCQUFnQiw2QkFBNkIsUUFBUSxxQkFBcUI7QUFDaEYsWUFBTSxvQkFBb0IsNkJBQTZCLFFBQVEseUJBQXlCO0FBQ3hGLGdCQUFVLFFBQVEsc0JBQXNCLGVBQWUsbUJBQW1CLE9BQU8sSUFBSSxDQUFDO0FBQUEsSUFDdkY7QUFHQSxVQUFNLHdCQUF3QixNQUFNLFNBQVMsdUJBQXVCO0FBQ3BFLFFBQUkseUJBQXlCLHlCQUF5QiwyQkFBMkI7QUFDaEYsWUFBTSxnQkFBZ0Isc0JBQXNCLFFBQVEscUJBQXFCO0FBQ3pFLFlBQU0sb0JBQW9CLHNCQUFzQixRQUFRLHlCQUF5QjtBQUNqRixnQkFBVSxRQUFRLHNCQUFzQixlQUFlLG1CQUFtQixNQUFNLEtBQUssQ0FBQztBQUFBLElBQ3ZGO0FBR0EsVUFBTSxpQ0FBaUMsTUFBTSxTQUFTLGlDQUFpQztBQUN2RixRQUFJLGtDQUFrQyx5QkFBeUIsMkJBQTJCO0FBQ3pGLFlBQU0sZ0JBQWdCLCtCQUErQixRQUFRLHFCQUFxQjtBQUNsRixZQUFNLG9CQUFvQiwrQkFBK0IsUUFBUSx5QkFBeUI7QUFDMUYsZ0JBQVUsUUFBUSxzQkFBc0IsZUFBZSxtQkFBbUIsT0FBTyxLQUFLLENBQUM7QUFBQSxJQUN4RjtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJlZGl0b3IiLCAiZSIsICJkdXBsaWNhdGVMYWJlbHMiXQp9Cg==
