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
import "./media/modalEditorPart.css";
import { $, addDisposableListener, append, Dimension, EventHelper, EventType, hide, isHTMLElement, setVisibility, show } from "../../../../base/browser/dom.js";
import { GlobalPointerMoveMonitor } from "../../../../base/browser/globalPointerMoveMonitor.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Orientation, Sash, SashState } from "../../../../base/browser/ui/sash/sash.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPart } from "./editorPart.js";
import { GroupDirection, GroupsOrder, GroupActivationReason } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService, USE_MODAL_EDITOR_SETTING } from "../../../services/editor/common/editorService.js";
import { EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, EditorPartModalSidebarVisibleContext } from "../../../common/contextkeys.js";
import { EditorResourceAccessor, SideBySideEditor, Verbosity } from "../../../common/editor.js";
import { ResourceLabel } from "../../labels.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID } from "./editorCommands.js";
import { isModalEditorOptionsProvider } from "../../../../platform/editor/common/editor.js";
const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_DEFAULT_WIDTH = 1400;
const MODAL_MAX_DEFAULT_HEIGHT = 900;
const MODAL_BORDER_WIDTH = 1;
const MODAL_BORDER_SIZE = MODAL_BORDER_WIDTH * 2;
const MODAL_HEADER_HEIGHT = 33;
const MODAL_SNAP_THRESHOLD = 20;
const MODAL_MAXIMIZED_PADDING = 16;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 260;
const MODAL_SIDEBAR_PADDING = 8;
const MODAL_SIDEBAR_BORDER_RIGHT = 1;
const defaultModalEditorAllowableCommands = /* @__PURE__ */ new Set([
  // Application
  "workbench.action.quit",
  "workbench.action.reloadWindow",
  "workbench.action.toggleFullScreen",
  // Quick access
  "workbench.action.gotoSymbol",
  "workbench.action.gotoLine",
  // Zoom
  "workbench.action.zoomIn",
  "workbench.action.zoomOut",
  "workbench.action.zoomReset",
  // File operations
  "workbench.action.files.save",
  "workbench.action.files.saveAll",
  "workbench.action.files.revert",
  // Close editors
  "workbench.action.closeActiveEditor",
  "workbench.action.closeAllEditors",
  "workbench.action.closeEditorsInGroup",
  "workbench.action.closeUnmodifiedEditors",
  // Settings
  "workbench.action.openSettings",
  "workbench.action.openSettings2",
  "workbench.action.openSettingsJson",
  "workbench.action.openGlobalSettings",
  "workbench.action.openApplicationSettingsJson",
  "workbench.action.openRawDefaultSettings",
  "workbench.action.openWorkspaceSettings",
  "workbench.action.openWorkspaceSettingsFile",
  "workbench.action.openFolderSettings",
  "workbench.action.openFolderSettingsFile",
  "workbench.action.openRemoteSettings",
  "workbench.action.openRemoteSettingsFile",
  "workbench.action.openAccessibilitySettings",
  "workbench.action.configureLanguageBasedSettings",
  // Keybindings
  "workbench.action.openGlobalKeybindings",
  "workbench.action.openDefaultKeybindingsFile",
  "workbench.action.openGlobalKeybindingsFile",
  "workbench.action.openKeyboardLayoutPicker",
  // Modal editor
  CLOSE_MODAL_EDITOR_COMMAND_ID,
  MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
  MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
  TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
  TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID
]);
let ModalEditorPart = class {
  constructor(editorPartsView, instantiationService, editorService, layoutService, keybindingService, hostService, configurationService, contextMenuService, contextKeyService) {
    this.editorPartsView = editorPartsView;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.hostService = hostService;
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
  }
  async create(options) {
    const disposables = new DisposableStore();
    const modalElement = $(".monaco-modal-editor-block");
    this.layoutService.mainContainer.appendChild(modalElement);
    disposables.add(toDisposable(() => modalElement.remove()));
    const modalContextKeyService = disposables.add(this.contextKeyService.createScoped(modalElement));
    disposables.add(addDisposableListener(modalElement, EventType.MOUSE_DOWN, (e) => {
      if (e.target === modalElement) {
        EventHelper.stop(e, true);
        void editorPart.close();
      }
    }));
    let useModalMode = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING);
    disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
        useModalMode = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING);
      }
    }));
    disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (useModalMode !== "all") {
        const resolved = this.keybindingService.softDispatch(event, this.layoutService.mainContainer);
        if (resolved.kind === ResultKind.KbFound && resolved.commandId) {
          if (resolved.commandId.startsWith("workbench.") && !defaultModalEditorAllowableCommands.has(resolved.commandId)) {
            EventHelper.stop(event, true);
          }
        }
      }
    }));
    const resizableElement = new ResizableHTMLElement();
    disposables.add(toDisposable(() => resizableElement.dispose()));
    resizableElement.domNode.classList.add("modal-editor-resizable");
    const effectiveMinWidth = MODAL_MIN_WIDTH + (options?.sidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
    resizableElement.minSize = new Dimension(effectiveMinWidth, MODAL_MIN_HEIGHT);
    modalElement.appendChild(resizableElement.domNode);
    const shadowElement = resizableElement.domNode.appendChild($(".modal-editor-shadow"));
    const titleId = "modal-editor-title";
    const editorPartContainer = $(".part.editor.modal-editor-part", {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId
    });
    shadowElement.appendChild(editorPartContainer);
    const headerElement = editorPartContainer.appendChild($(".modal-editor-header"));
    const sidebarToggleContainer = append(headerElement, $("div.modal-editor-sidebar-toggle"));
    if (!options?.sidebar) {
      hide(sidebarToggleContainer);
    }
    const sidebarToggleIcon = options?.sidebar?.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
    const sidebarToggleAction = disposables.add(new Action(TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID, localize("toggleSidebar", "Toggle Sidebar"), ThemeIcon.asClassName(sidebarToggleIcon), true));
    const sidebarToggleActionBar = disposables.add(new ActionBar(sidebarToggleContainer));
    sidebarToggleActionBar.push(sidebarToggleAction, { icon: true, label: false });
    const titleElement = append(headerElement, $("div.modal-editor-title.show-file-icons"));
    titleElement.id = titleId;
    titleElement.textContent = "";
    const navigationContainer = append(headerElement, $("div.modal-editor-navigation"));
    hide(navigationContainer);
    disposables.add(addDisposableListener(navigationContainer, EventType.DBLCLICK, (e) => EventHelper.stop(e, true)));
    const previousButton = disposables.add(new Button(navigationContainer, { title: localize("previousItem", "Previous") }));
    previousButton.icon = Codicon.chevronLeft;
    previousButton.element.classList.add("modal-editor-nav-button");
    disposables.add(previousButton.onDidClick(() => {
      const navigation = editorPart.navigation;
      if (navigation && navigation.current > 0) {
        navigation.navigate(navigation.current - 1);
      }
    }));
    const navigationLabel = append(navigationContainer, $("span.modal-editor-nav-label"));
    navigationLabel.setAttribute("aria-live", "polite");
    const nextButton = disposables.add(new Button(navigationContainer, { title: localize("nextItem", "Next") }));
    nextButton.icon = Codicon.chevronRight;
    nextButton.element.classList.add("modal-editor-nav-button");
    disposables.add(nextButton.onDidClick(() => {
      const navigation = editorPart.navigation;
      if (navigation && navigation.current < navigation.total - 1) {
        navigation.navigate(navigation.current + 1);
      }
    }));
    const actionBarContainer = append(headerElement, $("div.modal-editor-action-container"));
    const sidebarResult = this.createSidebar(editorPartContainer, headerElement, options?.sidebar, modalContextKeyService, disposables);
    if (sidebarResult) {
      if (sidebarResult.isVisible()) {
        editorPartContainer.classList.add("has-sidebar");
      }
      disposables.add(sidebarResult.onDidResize(() => layoutModal()));
    }
    const modalInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, modalContextKeyService]
    )));
    const editorPart = disposables.add(modalInstantiationService.createInstance(
      ModalEditorPartImpl,
      mainWindow.vscodeWindowId,
      this.editorPartsView,
      modalElement,
      options
    ));
    disposables.add(this.editorPartsView.registerPart(editorPart));
    editorPart.create(editorPartContainer);
    disposables.add(Event.once(editorPart.onWillClose)(() => disposables.dispose()));
    disposables.add(Event.runAndSubscribe(editorPart.onDidChangeNavigation, ((navigation) => {
      if (navigation && navigation.total > 1) {
        show(navigationContainer);
        navigationLabel.textContent = localize("navigationCounter", "{0} of {1}", navigation.current + 1, navigation.total);
        previousButton.enabled = navigation.current > 0;
        nextButton.enabled = navigation.current < navigation.total - 1;
      } else {
        hide(navigationContainer);
      }
    }), editorPart.navigation));
    if (sidebarResult) {
      disposables.add(Event.runAndSubscribe(sidebarResult.onDidResize, () => {
        if (sidebarResult.isVisible()) {
          editorPart.sidebarWidth = sidebarResult.hasCustomWidth() ? sidebarResult.getWidth() : void 0;
        }
      }));
      disposables.add(editorPart.onDidToggleSidebar(() => {
        sidebarResult.setVisible(!editorPart.sidebarHidden);
        sidebarToggleAction.class = ThemeIcon.asClassName(editorPart.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft);
        layoutModal();
      }));
    }
    disposables.add(sidebarToggleActionBar.onDidRun(() => editorPart.toggleSidebar()));
    const modalEditorService = this.editorService.createScoped(editorPart, disposables);
    const scopedInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
      [IEditorService, modalEditorService]
    )));
    const editorActionsToolbarContainer = append(actionBarContainer, $("div.modal-editor-editor-actions"));
    const editorActionsToolbar = disposables.add(scopedInstantiationService.createInstance(WorkbenchToolBar, editorActionsToolbarContainer, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      highlightToggledItems: true
    }));
    const editorActionsSeparator = append(actionBarContainer, $("div.modal-editor-action-separator"));
    const editorActionsDisposables = disposables.add(new DisposableStore());
    const updateEditorActions = () => {
      editorActionsDisposables.clear();
      const editorActions = editorPart.activeGroup.createEditorActions(editorActionsDisposables, MenuId.ModalEditorEditorTitle);
      editorActionsDisposables.add(editorActions.onDidChange(() => updateEditorActions()));
      const { primary, secondary } = editorActions.actions;
      editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
      const hasActions = primary.length > 0 || secondary.length > 0;
      setVisibility(hasActions, editorActionsSeparator);
    };
    disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => updateEditorActions()));
    disposables.add(modalEditorService.onDidEditorsChange(() => editorPart.enforceModalPartOptions()));
    disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      highlightToggledItems: true,
      menuOptions: { shouldForwardArgs: true }
    }));
    const label = disposables.add(scopedInstantiationService.createInstance(ResourceLabel, titleElement, {}));
    const labelChangeDisposable = disposables.add(new MutableDisposable());
    let trackedEditor;
    const updateLabel = () => {
      const activeEditor = editorPart.activeGroup.activeEditor;
      if (activeEditor) {
        const { labelFormat } = editorPart.partOptions;
        label.element.setResource(
          {
            resource: EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.BOTH }),
            name: activeEditor.getName(),
            description: activeEditor.getDescription(labelFormat === "short" ? Verbosity.SHORT : labelFormat === "long" ? Verbosity.LONG : Verbosity.MEDIUM) || ""
          },
          {
            title: activeEditor.getTitle(Verbosity.LONG),
            icon: activeEditor.getIcon(),
            extraClasses: activeEditor.getLabelExtraClasses()
          }
        );
        if (trackedEditor !== activeEditor) {
          trackedEditor = activeEditor;
          labelChangeDisposable.value = activeEditor.onDidChangeLabel(() => updateLabel());
        }
      } else {
        label.element.clear();
        trackedEditor = void 0;
        labelChangeDisposable.clear();
      }
    };
    disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, updateLabel));
    disposables.add(addDisposableListener(headerElement, EventType.DBLCLICK, (e) => {
      EventHelper.stop(e);
      editorPart.handleHeaderDoubleClick();
    }));
    disposables.add(addDisposableListener(headerElement, EventType.CONTEXT_MENU, (e) => {
      const target = e.target;
      if (isHTMLElement(target) && (target.closest(".monaco-button") || target.closest(".action-item"))) {
        return;
      }
      EventHelper.stop(e, true);
      const contextMenuDisposables = new DisposableStore();
      const activeGroup = editorPart.activeGroup;
      const activeEditor = activeGroup.activeEditor;
      const editorScopedContextKeyService = activeGroup.activeEditorPane?.scopedContextKeyService ?? activeGroup.scopedContextKeyService;
      const editorActions = activeGroup.createEditorActions(contextMenuDisposables, MenuId.EditorTitle);
      const { primary, secondary } = editorActions.actions;
      this.contextMenuService.showContextMenu({
        menuId: MenuId.ModalEditorTitleContext,
        contextKeyService: editorScopedContextKeyService,
        getAnchor: () => ({ x: e.clientX, y: e.clientY }),
        getActions: () => Separator.join(primary, secondary),
        getActionsContext: () => ({ groupId: activeGroup.id, editorIndex: activeEditor ? activeGroup.getIndexOfEditor(activeEditor) : void 0 }),
        getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id, editorScopedContextKeyService),
        onHide: () => contextMenuDisposables.dispose()
      });
    }));
    const layout = (sizeChanged) => {
      const { width: modalWidth, height: modalHeight } = resizableElement.size;
      const { top: topPx, left: leftPx } = resizableElement.domNode.style;
      const sidebarWidth = sidebarResult?.getWidth() ?? 0;
      const headerHeight = headerElement.offsetHeight;
      editorPart.layout(
        Math.max(0, modalWidth - MODAL_BORDER_SIZE - sidebarWidth),
        modalHeight - MODAL_BORDER_SIZE - headerHeight,
        parseFloat(topPx) + MODAL_BORDER_WIDTH + headerHeight,
        parseFloat(leftPx) + MODAL_BORDER_WIDTH + sidebarWidth
      );
      if (sizeChanged) {
        sidebarResult?.layout(modalHeight - MODAL_BORDER_SIZE - headerHeight);
      }
    };
    const dragMonitor = disposables.add(new GlobalPointerMoveMonitor());
    const dragDisposables = disposables.add(new DisposableStore());
    let didDrag = false;
    disposables.add(addDisposableListener(headerElement, EventType.POINTER_DOWN, (e) => {
      if (editorPart.maximized) {
        return;
      }
      if (e.button !== 0) {
        return;
      }
      const target = e.target;
      if (!isHTMLElement(target)) {
        return;
      }
      if (target.closest(".monaco-button") || target.closest(".action-item")) {
        return;
      }
      EventHelper.stop(e, true);
      dragDisposables.clear();
      headerElement.classList.add("dragging");
      dragDisposables.add(toDisposable(() => headerElement.classList.remove("dragging")));
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(resizableElement.domNode.style.left) || 0;
      const startTop = parseFloat(resizableElement.domNode.style.top) || 0;
      didDrag = false;
      const onPointerMove = (moveEvent) => {
        didDrag = true;
        EventHelper.stop(moveEvent, true);
        const containerDimension = this.layoutService.mainContainerDimension;
        const titleBarOffset = this.layoutService.mainContainerOffset.top;
        const dialogWidth = resizableElement.size.width;
        const dialogHeight = resizableElement.size.height;
        const minLeft = 0;
        const minTop = titleBarOffset;
        const maxLeft = Math.max(minLeft, containerDimension.width - dialogWidth);
        const maxTop = Math.max(minTop, containerDimension.height - dialogHeight);
        let newLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + (moveEvent.clientX - startX)));
        let newTop = Math.max(minTop, Math.min(maxTop, startTop + (moveEvent.clientY - startY)));
        const centerLeft = (containerDimension.width - dialogWidth) / 2;
        const centerTop = Math.max(titleBarOffset, (containerDimension.height - dialogHeight) / 2);
        if (Math.abs(newLeft - centerLeft) < MODAL_SNAP_THRESHOLD && Math.abs(newTop - centerTop) < MODAL_SNAP_THRESHOLD) {
          newLeft = centerLeft;
          newTop = centerTop;
        }
        resizableElement.domNode.style.left = `${newLeft}px`;
        resizableElement.domNode.style.top = `${newTop}px`;
        layout(false);
      };
      const onStop = () => {
        dragDisposables.clear();
        if (didDrag) {
          const currentLeft = parseFloat(resizableElement.domNode.style.left) || 0;
          const currentTop = parseFloat(resizableElement.domNode.style.top) || 0;
          const containerDimension = this.layoutService.mainContainerDimension;
          const titleBarOffset = this.layoutService.mainContainerOffset.top;
          const centerLeft = (containerDimension.width - resizableElement.size.width) / 2;
          const centerTop = Math.max(titleBarOffset, (containerDimension.height - resizableElement.size.height) / 2);
          if (Math.abs(currentLeft - centerLeft) < 1 && Math.abs(currentTop - centerTop) < 1) {
            editorPart.position = void 0;
          } else {
            editorPart.position = { left: currentLeft, top: currentTop };
          }
        }
      };
      dragMonitor.startMonitoring(headerElement, e.pointerId, e.buttons, onPointerMove, onStop);
    }));
    disposables.add(addDisposableListener(headerElement, EventType.CLICK, (e) => {
      const wasDrag = didDrag;
      didDrag = false;
      if (wasDrag) {
        return;
      }
      EventHelper.stop(e);
      editorPart.activeGroup.focus();
    }));
    let isResizing = false;
    let resizeStartLeft = 0;
    let resizeStartTop = 0;
    let resizeStartSize = Dimension.None;
    disposables.add(resizableElement.onDidWillResize(() => {
      isResizing = true;
      resizeStartLeft = parseFloat(resizableElement.domNode.style.left) || 0;
      resizeStartTop = parseFloat(resizableElement.domNode.style.top) || 0;
      resizeStartSize = new Dimension(resizableElement.size.width, resizableElement.size.height);
    }));
    disposables.add(resizableElement.onDidResize((e) => {
      if (!e.done) {
        const containerDimension = this.layoutService.mainContainerDimension;
        const titleBarOffset = this.layoutService.mainContainerOffset.top;
        const deltaWidth = e.dimension.width - resizeStartSize.width;
        const deltaHeight = e.dimension.height - resizeStartSize.height;
        let newLeft = e.west ? resizeStartLeft - deltaWidth : resizeStartLeft;
        let newTop = e.north ? resizeStartTop - deltaHeight : resizeStartTop;
        let newWidth = e.dimension.width;
        let newHeight = e.dimension.height;
        if (newLeft < 0) {
          newWidth += newLeft;
          newLeft = 0;
        }
        if (newTop < titleBarOffset) {
          newHeight += newTop - titleBarOffset;
          newTop = titleBarOffset;
        }
        if (newLeft + newWidth > containerDimension.width) {
          newWidth = containerDimension.width - newLeft;
        }
        if (newTop + newHeight > containerDimension.height) {
          newHeight = containerDimension.height - newTop;
        }
        if (newWidth !== e.dimension.width || newHeight !== e.dimension.height) {
          resizableElement.layout(newHeight, newWidth);
        }
        if (e.west) {
          resizableElement.domNode.style.left = `${newLeft}px`;
        }
        if (e.north) {
          resizableElement.domNode.style.top = `${newTop}px`;
        }
      }
      layout(true);
      if (e.done) {
        isResizing = false;
        const defaultSize = getDefaultSize();
        const size = resizableElement.size;
        if (size.width === defaultSize.width && size.height === defaultSize.height) {
          editorPart.size = void 0;
          editorPart.position = void 0;
          layoutModal();
        } else {
          editorPart.size = new Dimension(size.width, size.height);
          editorPart.position = {
            left: parseFloat(resizableElement.domNode.style.left) || 0,
            top: parseFloat(resizableElement.domNode.style.top) || 0
          };
        }
      }
    }));
    const getDefaultSize = () => {
      const containerDimension = this.layoutService.mainContainerDimension;
      const titleBarOffset = this.layoutService.mainContainerOffset.top;
      const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
      const targetWidth = containerDimension.width * 0.8;
      const targetHeight = availableHeight * 0.8;
      const width = Math.min(targetWidth, MODAL_MAX_DEFAULT_WIDTH, containerDimension.width);
      const height = Math.min(targetHeight, MODAL_MAX_DEFAULT_HEIGHT, availableHeight);
      return new Dimension(width, height);
    };
    let isFirstLayout = true;
    const layoutModal = () => {
      if (isResizing) {
        return;
      }
      const containerDimension = this.layoutService.mainContainerDimension;
      const titleBarOffset = this.layoutService.mainContainerOffset.top;
      const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
      const defaultSize = getDefaultSize();
      let width;
      let height;
      if (editorPart.maximized) {
        const verticalPadding = Math.max(titleBarOffset, MODAL_MAXIMIZED_PADDING);
        width = Math.max(containerDimension.width - MODAL_MAXIMIZED_PADDING, 0);
        height = Math.max(availableHeight - verticalPadding, 0);
      } else if (editorPart.size) {
        width = Math.min(editorPart.size.width, containerDimension.width);
        height = Math.min(editorPart.size.height, availableHeight);
      } else {
        width = defaultSize.width;
        height = defaultSize.height;
      }
      height = Math.min(height, availableHeight);
      if (isFirstLayout) {
        isFirstLayout = false;
        sidebarResult?.clampWidth(width);
      }
      resizableElement.maxSize = new Dimension(containerDimension.width, availableHeight);
      resizableElement.preferredSize = defaultSize;
      resizableElement.layout(height, width);
      const canResize = !editorPart.maximized;
      resizableElement.enableSashes(canResize, canResize, canResize, canResize);
      if (!editorPart.maximized && editorPart.position) {
        const clampedLeft = Math.max(0, Math.min(editorPart.position.left, containerDimension.width - width));
        const clampedTop = Math.max(titleBarOffset, Math.min(editorPart.position.top, titleBarOffset + availableHeight - height));
        resizableElement.domNode.style.left = `${clampedLeft}px`;
        resizableElement.domNode.style.top = `${clampedTop}px`;
      } else {
        const left = (containerDimension.width - width) / 2;
        const top = Math.max(titleBarOffset, (containerDimension.height - height) / 2);
        resizableElement.domNode.style.left = `${left}px`;
        resizableElement.domNode.style.top = `${top}px`;
      }
      layout(true);
    };
    disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));
    disposables.add(editorPart.onDidChangeMaximized(() => layoutModal()));
    disposables.add(editorPart.onDidRequestLayout(() => layoutModal()));
    disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => {
      const activeEditor = editorPart.activeGroup.activeEditor;
      const editorModalOptions = isModalEditorOptionsProvider(activeEditor) ? activeEditor.getModalEditorOptions() : void 0;
      modalElement.classList.toggle("compact-header", !!editorModalOptions?.compactHeader);
      layoutModal();
    }));
    this.hostService.setWindowDimmed(mainWindow, true);
    disposables.add(toDisposable(() => this.hostService.setWindowDimmed(mainWindow, false)));
    editorPart.activeGroup.focus();
    return {
      part: editorPart,
      instantiationService: scopedInstantiationService,
      disposables
    };
  }
  createSidebar(container, headerElement, content, modalContextKeyService, disposables) {
    if (!content) {
      return void 0;
    }
    let sidebarWidth = content.sidebarWidth && content.sidebarWidth > 0 ? content.sidebarWidth : MODAL_SIDEBAR_DEFAULT_WIDTH;
    let customWidth = content.sidebarWidth !== void 0 && content.sidebarWidth > 0;
    let visible = !content.sidebarHidden;
    const sidebarContainer = append(container, $("div.modal-editor-sidebar.show-file-icons"));
    sidebarContainer.style.width = `${sidebarWidth}px`;
    setVisibility(visible, sidebarContainer);
    const sidebarContextKeyService = disposables.add(modalContextKeyService.createScoped(sidebarContainer));
    const onDidLayoutEmitter = disposables.add(new Emitter());
    const contentDisposable = disposables.add(new MutableDisposable());
    contentDisposable.value = content.render(sidebarContainer, onDidLayoutEmitter.event, sidebarContextKeyService);
    const getHeaderHeight = () => headerElement.offsetHeight || MODAL_HEADER_HEIGHT;
    const sash = disposables.add(new Sash(container, {
      getVerticalSashLeft: () => sidebarWidth,
      getVerticalSashTop: () => getHeaderHeight(),
      getVerticalSashHeight: () => container.clientHeight - getHeaderHeight()
    }, { orientation: Orientation.VERTICAL }));
    if (!visible) {
      sash.state = SashState.Disabled;
    }
    const onDidResizeEmitter = disposables.add(new Emitter());
    let sashStartWidth;
    disposables.add(sash.onDidStart(() => sashStartWidth = sidebarWidth));
    disposables.add(sash.onDidEnd(() => sashStartWidth = void 0));
    disposables.add(sash.onDidChange((e) => {
      if (sashStartWidth === void 0) {
        return;
      }
      const delta = e.currentX - e.startX;
      const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
      sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, sashStartWidth + delta));
      customWidth = true;
      sidebarContainer.style.width = `${sidebarWidth}px`;
      sash.layout();
      onDidResizeEmitter.fire();
    }));
    disposables.add(sash.onDidReset(() => {
      const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
      sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
      customWidth = false;
      sidebarContainer.style.width = `${sidebarWidth}px`;
      sash.layout();
      onDidResizeEmitter.fire();
    }));
    return {
      onDidResize: onDidResizeEmitter.event,
      getWidth: () => visible ? sidebarWidth : 0,
      hasCustomWidth: () => customWidth,
      clampWidth: (modalWidth) => {
        if (sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
          sidebarWidth = Math.min(MODAL_SIDEBAR_DEFAULT_WIDTH, Math.max(MODAL_SIDEBAR_MIN_WIDTH, modalWidth - MODAL_MIN_WIDTH));
          customWidth = false;
          sidebarContainer.style.width = `${sidebarWidth}px`;
          sash.layout();
          onDidResizeEmitter.fire();
        }
      },
      isVisible: () => visible,
      setVisible: (value) => {
        visible = value;
        setVisibility(visible, sidebarContainer);
        container.classList.toggle("has-sidebar", visible);
        sash.state = visible ? SashState.Enabled : SashState.Disabled;
        onDidResizeEmitter.fire();
      },
      layout: (height) => {
        if (visible) {
          onDidLayoutEmitter.fire({
            height: height - MODAL_SIDEBAR_PADDING * 2,
            width: sidebarWidth - MODAL_SIDEBAR_PADDING * 2 - MODAL_SIDEBAR_BORDER_RIGHT
          });
        }
        sash.layout();
      },
      updateContent: (newContent) => {
        contentDisposable.clear();
        sidebarContainer.textContent = "";
        contentDisposable.value = newContent.render(sidebarContainer, onDidLayoutEmitter.event, sidebarContextKeyService);
      }
    };
  }
};
ModalEditorPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IContextKeyService)
], ModalEditorPart);
let ModalEditorPartImpl = class extends EditorPart {
  constructor(windowId, editorPartsView, modalElement, options, instantiationService, themeService, configurationService, storageService, layoutService, hostService, modalContextKeyService) {
    const id = ModalEditorPartImpl.COUNTER++;
    super(editorPartsView, `workbench.parts.modalEditor.${id}`, localize("modalEditorPart", "Modal Editor Area"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, modalContextKeyService);
    this.modalElement = modalElement;
    this.modalContextKeyService = modalContextKeyService;
    this._onWillClose = this._register(new Emitter());
    this.onWillClose = this._onWillClose.event;
    this._onDidChangeMaximized = this._register(new Emitter());
    this.onDidChangeMaximized = this._onDidChangeMaximized.event;
    this._onDidRequestLayout = this._register(new Emitter());
    this.onDidRequestLayout = this._onDidRequestLayout.event;
    this._onDidChangeNavigation = this._register(new Emitter());
    this.onDidChangeNavigation = this._onDidChangeNavigation.event;
    this._sidebarHidden = false;
    this._hasSidebar = false;
    this._onDidToggleSidebar = this._register(new Emitter());
    this.onDidToggleSidebar = this._onDidToggleSidebar.event;
    this.optionsDisposable = this._register(new MutableDisposable());
    this.previousMainWindowActiveElement = null;
    this._maximized = options?.maximized ?? false;
    this._size = options?.size;
    this._position = options?.position;
    this._navigation = options?.navigation;
    this._hasSidebar = !!options?.sidebar;
    this._sidebarHidden = options?.sidebar?.sidebarHidden ?? false;
    this._sidebarWidth = options?.sidebar?.sidebarWidth;
    if (this._maximized) {
      this.savedSize = this._size;
      this.savedPosition = this._position;
    }
    this.enforceModalPartOptions();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
        this.enforceModalPartOptions();
      }
    }));
  }
  get maximized() {
    return this._maximized;
  }
  get size() {
    return this._size;
  }
  set size(value) {
    this._size = value;
  }
  get position() {
    return this._position;
  }
  set position(value) {
    this._position = value;
  }
  get sidebarWidth() {
    return this._sidebarWidth;
  }
  set sidebarWidth(value) {
    this._sidebarWidth = value;
  }
  get sidebarHidden() {
    return this._sidebarHidden;
  }
  set sidebarHidden(value) {
    this._sidebarHidden = value;
  }
  get hasSidebar() {
    return this._hasSidebar;
  }
  set hasSidebar(value) {
    this._hasSidebar = value;
  }
  get navigation() {
    return this._navigation;
  }
  create(parent, options) {
    this.previousMainWindowActiveElement = mainWindow.document.activeElement;
    super.create(parent, options);
  }
  enforceModalPartOptions() {
    const useModalForAll = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING) === "all";
    const editorCount = this.groups.reduce((count, group) => count + group.count, 0);
    const showTabs = useModalForAll && editorCount > 1 ? "multiple" : "none";
    this.optionsDisposable.value = this.enforcePartOptions({
      showTabs,
      enablePreview: true,
      closeEmptyGroups: true,
      tabActionCloseVisibility: showTabs !== "none",
      editorActionsLocation: "hidden",
      tabHeight: "default",
      wrapTabs: false,
      allowDropIntoGroup: false
    });
  }
  updateOptions(options) {
    if (typeof options?.maximized === "boolean" && options.maximized !== this._maximized) {
      this.toggleMaximized();
    }
    this._navigation = options?.navigation;
    this._onDidChangeNavigation.fire(options?.navigation);
  }
  toggleMaximized() {
    this._maximized = !this._maximized;
    if (this._maximized) {
      this.savedSize = this._size;
      this.savedPosition = this._position;
    } else {
      this._size = this.savedSize;
      this._position = this.savedPosition;
      this.savedSize = void 0;
      this.savedPosition = void 0;
    }
    this._onDidChangeMaximized.fire(this._maximized);
  }
  toggleSidebar() {
    this._sidebarHidden = !this._sidebarHidden;
    this._onDidToggleSidebar.fire();
  }
  handleHeaderDoubleClick() {
    if (this._maximized) {
      this.savedSize = void 0;
      this.savedPosition = void 0;
      this.toggleMaximized();
    } else if (this._size) {
      this._size = void 0;
      this._position = void 0;
      this._onDidRequestLayout.fire();
    } else {
      this.toggleMaximized();
    }
  }
  handleContextKeys() {
    const isModalEditorPartContext = EditorPartModalContext.bindTo(this.modalContextKeyService);
    isModalEditorPartContext.set(true);
    const isMaximizedContext = EditorPartModalMaximizedContext.bindTo(this.modalContextKeyService);
    isMaximizedContext.set(this._maximized);
    this._register(this.onDidChangeMaximized((maximized) => isMaximizedContext.set(maximized)));
    const hasNavigationContext = EditorPartModalNavigationContext.bindTo(this.modalContextKeyService);
    hasNavigationContext.set(!!this._navigation && this._navigation.total > 1);
    this._register(this.onDidChangeNavigation((navigation) => hasNavigationContext.set(!!navigation && navigation.total > 1)));
    const sidebarContext = EditorPartModalSidebarContext.bindTo(this.modalContextKeyService);
    sidebarContext.set(this._hasSidebar);
    const sidebarVisibleContext = EditorPartModalSidebarVisibleContext.bindTo(this.modalContextKeyService);
    sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden);
    this._register(this.onDidToggleSidebar(() => sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden)));
    super.handleContextKeys();
  }
  removeGroup(group, preserveFocus) {
    const groupView = this.assertGroupView(group);
    if (this.count === 1 && this.activeGroup === groupView) {
      this.doRemoveLastGroup();
    } else {
      super.removeGroup(group, preserveFocus);
    }
  }
  doRemoveLastGroup() {
    const activeMainGroup = this.editorPartsView.mainPart.activeGroup;
    this.editorPartsView.mainPart.activateGroup(activeMainGroup, void 0, GroupActivationReason.PART_CLOSE);
    const mainEditorPartContainer = this.layoutService.getContainer(mainWindow, Parts.EDITOR_PART);
    if (!isHTMLElement(this.previousMainWindowActiveElement) || // invalid previous element
    !this.previousMainWindowActiveElement.isConnected || // previous element no longer in the DOM
    mainEditorPartContainer?.contains(this.previousMainWindowActiveElement)) {
      activeMainGroup.focus();
    } else {
      this.previousMainWindowActiveElement.focus();
    }
    this._onWillClose.fire();
  }
  saveState() {
    return;
  }
  async close(options) {
    if (options?.mergeAllEditorsToMainPart) {
      const result = this.mergeGroupsToMainPart();
      if (!result) {
        return false;
      }
    } else {
      for (const group of this.groups) {
        const closed = await group.closeAllEditors();
        if (!closed) {
          return false;
        }
      }
    }
    this._onWillClose.fire();
    return true;
  }
  mergeGroupsToMainPart() {
    if (!this.groups.some((group) => group.count > 0)) {
      return true;
    }
    let targetGroup = void 0;
    for (const group of this.editorPartsView.mainPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (!group.isLocked) {
        targetGroup = group;
        break;
      }
    }
    if (!targetGroup) {
      targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === "right" ? GroupDirection.RIGHT : GroupDirection.DOWN);
    }
    const result = this.mergeAllGroups(targetGroup, {
      // Try to reduce the impact of closing the modal
      // as much as possible by not changing existing editors
      // in the main window.
      preserveExistingIndex: true
    });
    targetGroup.focus();
    return result;
  }
  dispose() {
    this._navigation = void 0;
    super.dispose();
  }
};
ModalEditorPartImpl.COUNTER = 1;
ModalEditorPartImpl = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IContextKeyService)
], ModalEditorPartImpl);
export {
  ModalEditorPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXG1vZGFsRWRpdG9yUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9tb2RhbEVkaXRvclBhcnQuY3NzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBEaW1lbnNpb24sIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIGhpZGUsIElEaW1lbnNpb24sIGlzSFRNTEVsZW1lbnQsIHNldFZpc2liaWxpdHksIHNob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEdsb2JhbFBvaW50ZXJNb3ZlTW9uaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9nbG9iYWxQb2ludGVyTW92ZU1vbml0b3IuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBwcmVwYXJlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNhc2gsIFNhc2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzaXphYmxlSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmVzaXphYmxlL3Jlc2l6YWJsZS5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIsIFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcsIElFZGl0b3JQYXJ0c1ZpZXcgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYXJ0IH0gZnJvbSAnLi9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IEdyb3VwRGlyZWN0aW9uLCBHcm91cHNPcmRlciwgSU1vZGFsRWRpdG9yUGFydCwgR3JvdXBBY3RpdmF0aW9uUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBVU0VfTU9EQUxfRURJVE9SX1NFVFRJTkcsIFVzZU1vZGFsRWRpdG9yTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxNYXhpbWl6ZWRDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxOYXZpZ2F0aW9uQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsU2lkZWJhckNvbnRleHQsIEVkaXRvclBhcnRNb2RhbFNpZGViYXJWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJRWRpdG9yQ29tbWFuZHNDb250ZXh0LCBTaWRlQnlTaWRlRWRpdG9yLCBWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVsIH0gZnJvbSAnLi4vLi4vbGFiZWxzLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENMT1NFX01PREFMX0VESVRPUl9DT01NQU5EX0lELCBNT1ZFX01PREFMX0VESVRPUl9UT19NQUlOX0NPTU1BTkRfSUQsIE1PVkVfTU9EQUxfRURJVE9SX1RPX1dJTkRPV19DT01NQU5EX0lELCBOQVZJR0FURV9NT0RBTF9FRElUT1JfTkVYVF9DT01NQU5EX0lELCBOQVZJR0FURV9NT0RBTF9FRElUT1JfUFJFVklPVVNfQ09NTUFORF9JRCwgVE9HR0xFX01PREFMX0VESVRPUl9NQVhJTUlaRURfQ09NTUFORF9JRCwgVE9HR0xFX01PREFMX0VESVRPUl9TSURFQkFSX0NPTU1BTkRfSUQgfSBmcm9tICcuL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElNb2RhbEVkaXRvck5hdmlnYXRpb24sIElNb2RhbEVkaXRvclBhcnRPcHRpb25zLCBJTW9kYWxFZGl0b3JTaWRlYmFyLCBpc01vZGFsRWRpdG9yT3B0aW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuXG5jb25zdCBNT0RBTF9NSU5fV0lEVEggPSA0MDA7XG5jb25zdCBNT0RBTF9NSU5fSEVJR0hUID0gMzAwO1xuY29uc3QgTU9EQUxfTUFYX0RFRkFVTFRfV0lEVEggPSAxNDAwO1xuY29uc3QgTU9EQUxfTUFYX0RFRkFVTFRfSEVJR0hUID0gOTAwO1xuY29uc3QgTU9EQUxfQk9SREVSX1dJRFRIID0gMTsgLy8gMXB4IGJvcmRlciBvbiBlYWNoIHNpZGVcbmNvbnN0IE1PREFMX0JPUkRFUl9TSVpFID0gTU9EQUxfQk9SREVSX1dJRFRIICogMjtcbmNvbnN0IE1PREFMX0hFQURFUl9IRUlHSFQgPSAzMzsgLy8gRmFsbGJhY2sgb25seSBcdTIwMTQgYWN0dWFsIGhlaWdodCBpcyBtZWFzdXJlZCBmcm9tIHRoZSByZW5kZXJlZCBoZWFkZXIgZWxlbWVudCB0byBhY2NvdW50IGZvciB0aGUgY29tcGFjdC1oZWFkZXIgdmFyaWFudC5cbmNvbnN0IE1PREFMX1NOQVBfVEhSRVNIT0xEID0gMjA7XG5jb25zdCBNT0RBTF9NQVhJTUlaRURfUEFERElORyA9IDE2O1xuY29uc3QgTU9EQUxfU0lERUJBUl9NSU5fV0lEVEggPSAxNjA7XG5jb25zdCBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEggPSAyNjA7XG5jb25zdCBNT0RBTF9TSURFQkFSX1BBRERJTkcgPSA4OyAvLyBtYXRjaGVzIENTUyBwYWRkaW5nIG9uIHNpZGViYXIgY29udGFpbmVyXG5jb25zdCBNT0RBTF9TSURFQkFSX0JPUkRFUl9SSUdIVCA9IDE7IC8vIG1hdGNoZXMgQ1NTIGJvcmRlci1yaWdodCBvbiBzaWRlYmFyIGNvbnRhaW5lclxuXG5jb25zdCBkZWZhdWx0TW9kYWxFZGl0b3JBbGxvd2FibGVDb21tYW5kcyA9IG5ldyBTZXQoW1xuXG5cdC8vIEFwcGxpY2F0aW9uXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aXQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5yZWxvYWRXaW5kb3cnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVGdWxsU2NyZWVuJyxcblxuXHQvLyBRdWljayBhY2Nlc3Ncblx0J3dvcmtiZW5jaC5hY3Rpb24uZ290b1N5bWJvbCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmdvdG9MaW5lJyxcblxuXHQvLyBab29tXG5cdCd3b3JrYmVuY2guYWN0aW9uLnpvb21JbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnpvb21PdXQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi56b29tUmVzZXQnLFxuXG5cdC8vIEZpbGUgb3BlcmF0aW9uc1xuXHQnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5zYXZlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuc2F2ZUFsbCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnJldmVydCcsXG5cblx0Ly8gQ2xvc2UgZWRpdG9yc1xuXHQnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUFjdGl2ZUVkaXRvcicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmNsb3NlQWxsRWRpdG9ycycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRWRpdG9yc0luR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5jbG9zZVVubW9kaWZpZWRFZGl0b3JzJyxcblxuXHQvLyBTZXR0aW5nc1xuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MyJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzSnNvbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxTZXR0aW5ncycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5BcHBsaWNhdGlvblNldHRpbmdzSnNvbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5SYXdEZWZhdWx0U2V0dGluZ3MnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlU2V0dGluZ3MnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlU2V0dGluZ3NGaWxlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbkZvbGRlclNldHRpbmdzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlbkZvbGRlclNldHRpbmdzRmlsZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5SZW1vdGVTZXR0aW5ncycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5SZW1vdGVTZXR0aW5nc0ZpbGUnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuQWNjZXNzaWJpbGl0eVNldHRpbmdzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uY29uZmlndXJlTGFuZ3VhZ2VCYXNlZFNldHRpbmdzJyxcblxuXHQvLyBLZXliaW5kaW5nc1xuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3MnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuRGVmYXVsdEtleWJpbmRpbmdzRmlsZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxLZXliaW5kaW5nc0ZpbGUnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuS2V5Ym9hcmRMYXlvdXRQaWNrZXInLFxuXG5cdC8vIE1vZGFsIGVkaXRvclxuXHRDTE9TRV9NT0RBTF9FRElUT1JfQ09NTUFORF9JRCxcblx0TU9WRV9NT0RBTF9FRElUT1JfVE9fTUFJTl9DT01NQU5EX0lELFxuXHRNT1ZFX01PREFMX0VESVRPUl9UT19XSU5ET1dfQ09NTUFORF9JRCxcblx0VE9HR0xFX01PREFMX0VESVRPUl9NQVhJTUlaRURfQ09NTUFORF9JRCxcblx0TkFWSUdBVEVfTU9EQUxfRURJVE9SX1BSRVZJT1VTX0NPTU1BTkRfSUQsXG5cdE5BVklHQVRFX01PREFMX0VESVRPUl9ORVhUX0NPTU1BTkRfSUQsXG5cdFRPR0dMRV9NT0RBTF9FRElUT1JfU0lERUJBUl9DT01NQU5EX0lELFxuXSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNyZWF0ZU1vZGFsRWRpdG9yUGFydFJlc3VsdCB7XG5cdHJlYWRvbmx5IHBhcnQ6IE1vZGFsRWRpdG9yUGFydEltcGw7XG5cdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJTW9kYWxFZGl0b3JTaWRlYmFyQ29udHJvbGxlciB7XG5cblx0cmVhZG9ubHkgb25EaWRSZXNpemU6IEV2ZW50PHZvaWQ+O1xuXG5cdGdldFdpZHRoKCk6IG51bWJlcjtcblx0aGFzQ3VzdG9tV2lkdGgoKTogYm9vbGVhbjtcblx0Y2xhbXBXaWR0aChtb2RhbFdpZHRoOiBudW1iZXIpOiB2b2lkO1xuXG5cdGlzVmlzaWJsZSgpOiBib29sZWFuO1xuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG5cdHVwZGF0ZUNvbnRlbnQoY29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhcik6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RhbEVkaXRvclBhcnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZShvcHRpb25zPzogSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMpOiBQcm9taXNlPElDcmVhdGVNb2RhbEVkaXRvclBhcnRSZXN1bHQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIE1vZGFsIGNvbnRhaW5lclxuXHRcdGNvbnN0IG1vZGFsRWxlbWVudCA9ICQoJy5tb25hY28tbW9kYWwtZWRpdG9yLWJsb2NrJyk7XG5cdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobW9kYWxFbGVtZW50KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1vZGFsRWxlbWVudC5yZW1vdmUoKSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBrZXkgc2VydmljZSBzY29wZWQgdG8gdGhlIGVudGlyZSBtb2RhbCBlbGVtZW50IHNvIHRoYXQgdGhlXG5cdFx0Ly8gbW9kYWwtbGV2ZWwgY29udGV4dCBrZXlzIChlLmcuIGBlZGl0b3JQYXJ0TW9kYWxgKSBhcmUgYWN0aXZlIHdoZW4gZm9jdXNcblx0XHQvLyBpcyBhbnl3aGVyZSBpbnNpZGUgdGhlIG1vZGFsLiBCb3RoIHRoZSBlZGl0b3IgcGFydCBhbmQgdGhlIHNpZGViYXJcblx0XHQvLyBjb250ZW50IGFyZSB3aXJlZCB1cCB0byBkZXNjZW5kIGZyb20gdGhpcyBzZXJ2aWNlIHNvIHRoYXQgY29tbWFuZHMgbGlrZVxuXHRcdC8vIGNsb3NpbmcgdGhlIG1vZGFsIG9uIGBFc2NhcGVgIHdvcmsgcmVnYXJkbGVzcyBvZiB3aGljaCBhcmVhIGhhcyBmb2N1c1xuXHRcdC8vIChlLmcuIHRoZSBzaWRlYmFyIGNoYW5nZXMgdHJlZSkuXG5cdFx0Y29uc3QgbW9kYWxDb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChtb2RhbEVsZW1lbnQpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobW9kYWxFbGVtZW50LCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IG1vZGFsRWxlbWVudCkge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHRcdC8vIENsb3NlIG1vZGFsIHdoZW4gY2xpY2tpbmcgb3V0c2lkZSB0aGUgZGlhbG9nXG5cdFx0XHRcdHZvaWQgZWRpdG9yUGFydC5jbG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCB1c2VNb2RhbE1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFVzZU1vZGFsRWRpdG9yTW9kZT4oVVNFX01PREFMX0VESVRPUl9TRVRUSU5HKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihVU0VfTU9EQUxfRURJVE9SX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHVzZU1vZGFsTW9kZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VXNlTW9kYWxFZGl0b3JNb2RlPihVU0VfTU9EQUxfRURJVE9SX1NFVFRJTkcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobW9kYWxFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXG5cdFx0XHQvLyBQcmV2ZW50IHVuc3VwcG9ydGVkIGNvbW1hbmRzIHVubGVzcyBhbGwgZWRpdG9ycyBvcGVuIGluIG1vZGFsXG5cdFx0XHRpZiAodXNlTW9kYWxNb2RlICE9PSAnYWxsJykge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoKGV2ZW50LCB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lcik7XG5cdFx0XHRcdGlmIChyZXNvbHZlZC5raW5kID09PSBSZXN1bHRLaW5kLktiRm91bmQgJiYgcmVzb2x2ZWQuY29tbWFuZElkKSB7XG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0cmVzb2x2ZWQuY29tbWFuZElkLnN0YXJ0c1dpdGgoJ3dvcmtiZW5jaC4nKSAmJlxuXHRcdFx0XHRcdFx0IWRlZmF1bHRNb2RhbEVkaXRvckFsbG93YWJsZUNvbW1hbmRzLmhhcyhyZXNvbHZlZC5jb21tYW5kSWQpXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXNpemFibGUgd3JhcHBlclxuXHRcdGNvbnN0IHJlc2l6YWJsZUVsZW1lbnQgPSBuZXcgUmVzaXphYmxlSFRNTEVsZW1lbnQoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlc2l6YWJsZUVsZW1lbnQuZGlzcG9zZSgpKSk7XG5cdFx0cmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ21vZGFsLWVkaXRvci1yZXNpemFibGUnKTtcblx0XHRjb25zdCBlZmZlY3RpdmVNaW5XaWR0aCA9IE1PREFMX01JTl9XSURUSCArIChvcHRpb25zPy5zaWRlYmFyID8gTU9EQUxfU0lERUJBUl9NSU5fV0lEVEggOiAwKTtcblx0XHRyZXNpemFibGVFbGVtZW50Lm1pblNpemUgPSBuZXcgRGltZW5zaW9uKGVmZmVjdGl2ZU1pbldpZHRoLCBNT0RBTF9NSU5fSEVJR0hUKTtcblx0XHRtb2RhbEVsZW1lbnQuYXBwZW5kQ2hpbGQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlKTtcblxuXHRcdGNvbnN0IHNoYWRvd0VsZW1lbnQgPSByZXNpemFibGVFbGVtZW50LmRvbU5vZGUuYXBwZW5kQ2hpbGQoJCgnLm1vZGFsLWVkaXRvci1zaGFkb3cnKSk7XG5cblx0XHQvLyBFZGl0b3IgcGFydCBjb250YWluZXJcblx0XHRjb25zdCB0aXRsZUlkID0gJ21vZGFsLWVkaXRvci10aXRsZSc7XG5cdFx0Y29uc3QgZWRpdG9yUGFydENvbnRhaW5lciA9ICQoJy5wYXJ0LmVkaXRvci5tb2RhbC1lZGl0b3ItcGFydCcsIHtcblx0XHRcdHJvbGU6ICdkaWFsb2cnLFxuXHRcdFx0J2FyaWEtbW9kYWwnOiAndHJ1ZScsXG5cdFx0XHQnYXJpYS1sYWJlbGxlZGJ5JzogdGl0bGVJZCxcblx0XHR9KTtcblx0XHRzaGFkb3dFbGVtZW50LmFwcGVuZENoaWxkKGVkaXRvclBhcnRDb250YWluZXIpO1xuXG5cdFx0Ly8gSGVhZGVyXG5cdFx0Y29uc3QgaGVhZGVyRWxlbWVudCA9IGVkaXRvclBhcnRDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLm1vZGFsLWVkaXRvci1oZWFkZXInKSk7XG5cblx0XHQvLyBTaWRlYmFyIHRvZ2dsZSBidXR0b24gKG9ubHkgd2hlbiBzaWRlYmFyIGlzIGNvbmZpZ3VyZWQpXG5cdFx0Y29uc3Qgc2lkZWJhclRvZ2dsZUNvbnRhaW5lciA9IGFwcGVuZChoZWFkZXJFbGVtZW50LCAkKCdkaXYubW9kYWwtZWRpdG9yLXNpZGViYXItdG9nZ2xlJykpO1xuXHRcdGlmICghb3B0aW9ucz8uc2lkZWJhcikge1xuXHRcdFx0aGlkZShzaWRlYmFyVG9nZ2xlQ29udGFpbmVyKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2lkZWJhclRvZ2dsZUljb24gPSBvcHRpb25zPy5zaWRlYmFyPy5zaWRlYmFySGlkZGVuID8gQ29kaWNvbi5sYXlvdXRTaWRlYmFyTGVmdE9mZiA6IENvZGljb24ubGF5b3V0U2lkZWJhckxlZnQ7XG5cdFx0Y29uc3Qgc2lkZWJhclRvZ2dsZUFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFRPR0dMRV9NT0RBTF9FRElUT1JfU0lERUJBUl9DT01NQU5EX0lELCBsb2NhbGl6ZSgndG9nZ2xlU2lkZWJhcicsIFwiVG9nZ2xlIFNpZGViYXJcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzaWRlYmFyVG9nZ2xlSWNvbiksIHRydWUpKTtcblx0XHRjb25zdCBzaWRlYmFyVG9nZ2xlQWN0aW9uQmFyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25CYXIoc2lkZWJhclRvZ2dsZUNvbnRhaW5lcikpO1xuXHRcdHNpZGViYXJUb2dnbGVBY3Rpb25CYXIucHVzaChzaWRlYmFyVG9nZ2xlQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdC8vIFRpdGxlIGVsZW1lbnRcblx0XHRjb25zdCB0aXRsZUVsZW1lbnQgPSBhcHBlbmQoaGVhZGVyRWxlbWVudCwgJCgnZGl2Lm1vZGFsLWVkaXRvci10aXRsZS5zaG93LWZpbGUtaWNvbnMnKSk7XG5cdFx0dGl0bGVFbGVtZW50LmlkID0gdGl0bGVJZDtcblx0XHR0aXRsZUVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblxuXHRcdC8vIE5hdmlnYXRpb24gd2lkZ2V0XG5cdFx0Y29uc3QgbmF2aWdhdGlvbkNvbnRhaW5lciA9IGFwcGVuZChoZWFkZXJFbGVtZW50LCAkKCdkaXYubW9kYWwtZWRpdG9yLW5hdmlnYXRpb24nKSk7XG5cdFx0aGlkZShuYXZpZ2F0aW9uQ29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5hdmlnYXRpb25Db250YWluZXIsIEV2ZW50VHlwZS5EQkxDTElDSywgZSA9PiBFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpKSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0J1dHRvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKG5hdmlnYXRpb25Db250YWluZXIsIHsgdGl0bGU6IGxvY2FsaXplKCdwcmV2aW91c0l0ZW0nLCBcIlByZXZpb3VzXCIpIH0pKTtcblx0XHRwcmV2aW91c0J1dHRvbi5pY29uID0gQ29kaWNvbi5jaGV2cm9uTGVmdDtcblx0XHRwcmV2aW91c0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vZGFsLWVkaXRvci1uYXYtYnV0dG9uJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByZXZpb3VzQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmF2aWdhdGlvbiA9IGVkaXRvclBhcnQubmF2aWdhdGlvbjtcblx0XHRcdGlmIChuYXZpZ2F0aW9uICYmIG5hdmlnYXRpb24uY3VycmVudCA+IDApIHtcblx0XHRcdFx0bmF2aWdhdGlvbi5uYXZpZ2F0ZShuYXZpZ2F0aW9uLmN1cnJlbnQgLSAxKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBuYXZpZ2F0aW9uTGFiZWwgPSBhcHBlbmQobmF2aWdhdGlvbkNvbnRhaW5lciwgJCgnc3Bhbi5tb2RhbC1lZGl0b3ItbmF2LWxhYmVsJykpO1xuXHRcdG5hdmlnYXRpb25MYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblxuXHRcdGNvbnN0IG5leHRCdXR0b24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihuYXZpZ2F0aW9uQ29udGFpbmVyLCB7IHRpdGxlOiBsb2NhbGl6ZSgnbmV4dEl0ZW0nLCBcIk5leHRcIikgfSkpO1xuXHRcdG5leHRCdXR0b24uaWNvbiA9IENvZGljb24uY2hldnJvblJpZ2h0O1xuXHRcdG5leHRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb2RhbC1lZGl0b3ItbmF2LWJ1dHRvbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXh0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmF2aWdhdGlvbiA9IGVkaXRvclBhcnQubmF2aWdhdGlvbjtcblx0XHRcdGlmIChuYXZpZ2F0aW9uICYmIG5hdmlnYXRpb24uY3VycmVudCA8IG5hdmlnYXRpb24udG90YWwgLSAxKSB7XG5cdFx0XHRcdG5hdmlnYXRpb24ubmF2aWdhdGUobmF2aWdhdGlvbi5jdXJyZW50ICsgMSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVG9vbGJhclxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9IGFwcGVuZChoZWFkZXJFbGVtZW50LCAkKCdkaXYubW9kYWwtZWRpdG9yLWFjdGlvbi1jb250YWluZXInKSk7XG5cblx0XHQvLyBTaWRlYmFyXG5cdFx0Y29uc3Qgc2lkZWJhclJlc3VsdCA9IHRoaXMuY3JlYXRlU2lkZWJhcihlZGl0b3JQYXJ0Q29udGFpbmVyLCBoZWFkZXJFbGVtZW50LCBvcHRpb25zPy5zaWRlYmFyLCBtb2RhbENvbnRleHRLZXlTZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aWYgKHNpZGViYXJSZXN1bHQpIHtcblx0XHRcdGlmIChzaWRlYmFyUmVzdWx0LmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdGVkaXRvclBhcnRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGFzLXNpZGViYXInKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlYmFyUmVzdWx0Lm9uRGlkUmVzaXplKCgpID0+IGxheW91dE1vZGFsKCkpKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIGVkaXRvciBwYXJ0IChzY29wZWQgdG8gdGhlIG1vZGFsIGNvbnRleHQga2V5IHNlcnZpY2Ugc28gdGhhdFxuXHRcdC8vIHRoZSBlZGl0b3IgYXJlYSBhbHNvIGRlc2NlbmRzIGZyb20gaXQpXG5cdFx0Y29uc3QgbW9kYWxJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJQ29udGV4dEtleVNlcnZpY2UsIG1vZGFsQ29udGV4dEtleVNlcnZpY2VdXG5cdFx0KSkpO1xuXHRcdGNvbnN0IGVkaXRvclBhcnQgPSBkaXNwb3NhYmxlcy5hZGQobW9kYWxJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1vZGFsRWRpdG9yUGFydEltcGwsXG5cdFx0XHRtYWluV2luZG93LnZzY29kZVdpbmRvd0lkLFxuXHRcdFx0dGhpcy5lZGl0b3JQYXJ0c1ZpZXcsXG5cdFx0XHRtb2RhbEVsZW1lbnQsXG5cdFx0XHRvcHRpb25zLFxuXHRcdCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvclBhcnRzVmlldy5yZWdpc3RlclBhcnQoZWRpdG9yUGFydCkpO1xuXHRcdGVkaXRvclBhcnQuY3JlYXRlKGVkaXRvclBhcnRDb250YWluZXIpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UoZWRpdG9yUGFydC5vbldpbGxDbG9zZSkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShlZGl0b3JQYXJ0Lm9uRGlkQ2hhbmdlTmF2aWdhdGlvbiwgKChuYXZpZ2F0aW9uOiBJTW9kYWxFZGl0b3JOYXZpZ2F0aW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAobmF2aWdhdGlvbiAmJiBuYXZpZ2F0aW9uLnRvdGFsID4gMSkge1xuXHRcdFx0XHRzaG93KG5hdmlnYXRpb25Db250YWluZXIpO1xuXHRcdFx0XHRuYXZpZ2F0aW9uTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbmF2aWdhdGlvbkNvdW50ZXInLCBcInswfSBvZiB7MX1cIiwgbmF2aWdhdGlvbi5jdXJyZW50ICsgMSwgbmF2aWdhdGlvbi50b3RhbCk7XG5cdFx0XHRcdHByZXZpb3VzQnV0dG9uLmVuYWJsZWQgPSBuYXZpZ2F0aW9uLmN1cnJlbnQgPiAwO1xuXHRcdFx0XHRuZXh0QnV0dG9uLmVuYWJsZWQgPSBuYXZpZ2F0aW9uLmN1cnJlbnQgPCBuYXZpZ2F0aW9uLnRvdGFsIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhpZGUobmF2aWdhdGlvbkNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fSksIGVkaXRvclBhcnQubmF2aWdhdGlvbikpO1xuXHRcdGlmIChzaWRlYmFyUmVzdWx0KSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHNpZGViYXJSZXN1bHQub25EaWRSZXNpemUsICgpID0+IHtcblx0XHRcdFx0aWYgKHNpZGViYXJSZXN1bHQuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHRlZGl0b3JQYXJ0LnNpZGViYXJXaWR0aCA9IHNpZGViYXJSZXN1bHQuaGFzQ3VzdG9tV2lkdGgoKSA/IHNpZGViYXJSZXN1bHQuZ2V0V2lkdGgoKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhcnQub25EaWRUb2dnbGVTaWRlYmFyKCgpID0+IHtcblx0XHRcdFx0c2lkZWJhclJlc3VsdC5zZXRWaXNpYmxlKCFlZGl0b3JQYXJ0LnNpZGViYXJIaWRkZW4pO1xuXHRcdFx0XHRzaWRlYmFyVG9nZ2xlQWN0aW9uLmNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVkaXRvclBhcnQuc2lkZWJhckhpZGRlbiA/IENvZGljb24ubGF5b3V0U2lkZWJhckxlZnRPZmYgOiBDb2RpY29uLmxheW91dFNpZGViYXJMZWZ0KTtcblx0XHRcdFx0bGF5b3V0TW9kYWwoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBXaXJlIHVwIHNpZGViYXIgdG9nZ2xlIGJ1dHRvblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlYmFyVG9nZ2xlQWN0aW9uQmFyLm9uRGlkUnVuKCgpID0+IGVkaXRvclBhcnQudG9nZ2xlU2lkZWJhcigpKSk7XG5cblx0XHQvLyBDcmVhdGUgc2NvcGVkIGluc3RhbnRpYXRpb24gc2VydmljZVxuXHRcdGNvbnN0IG1vZGFsRWRpdG9yU2VydmljZSA9IHRoaXMuZWRpdG9yU2VydmljZS5jcmVhdGVTY29wZWQoZWRpdG9yUGFydCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhcnQuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lFZGl0b3JTZXJ2aWNlLCBtb2RhbEVkaXRvclNlcnZpY2VdXG5cdFx0KSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIGVkaXRvciB0b29sYmFyXG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uc1Rvb2xiYXJDb250YWluZXIgPSBhcHBlbmQoYWN0aW9uQmFyQ29udGFpbmVyLCAkKCdkaXYubW9kYWwtZWRpdG9yLWVkaXRvci1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGVkaXRvckFjdGlvbnNUb29sYmFyID0gZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGVkaXRvckFjdGlvbnNUb29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9uc1NlcGFyYXRvciA9IGFwcGVuZChhY3Rpb25CYXJDb250YWluZXIsICQoJ2Rpdi5tb2RhbC1lZGl0b3ItYWN0aW9uLXNlcGFyYXRvcicpKTtcblx0XHRjb25zdCBlZGl0b3JBY3Rpb25zRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB1cGRhdGVFZGl0b3JBY3Rpb25zID0gKCkgPT4ge1xuXHRcdFx0ZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IGVkaXRvckFjdGlvbnMgPSBlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmNyZWF0ZUVkaXRvckFjdGlvbnMoZWRpdG9yQWN0aW9uc0Rpc3Bvc2FibGVzLCBNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSk7XG5cdFx0XHRlZGl0b3JBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKGVkaXRvckFjdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdXBkYXRlRWRpdG9yQWN0aW9ucygpKSk7XG5cblx0XHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBlZGl0b3JBY3Rpb25zLmFjdGlvbnM7XG5cdFx0XHRlZGl0b3JBY3Rpb25zVG9vbGJhci5zZXRBY3Rpb25zKHByZXBhcmVBY3Rpb25zKHByaW1hcnkpLCBwcmVwYXJlQWN0aW9ucyhzZWNvbmRhcnkpKTtcblxuXHRcdFx0Y29uc3QgaGFzQWN0aW9ucyA9IHByaW1hcnkubGVuZ3RoID4gMCB8fCBzZWNvbmRhcnkubGVuZ3RoID4gMDtcblx0XHRcdHNldFZpc2liaWxpdHkoaGFzQWN0aW9ucywgZWRpdG9yQWN0aW9uc1NlcGFyYXRvcik7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG1vZGFsRWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgKCkgPT4gdXBkYXRlRWRpdG9yQWN0aW9ucygpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGFsRWRpdG9yU2VydmljZS5vbkRpZEVkaXRvcnNDaGFuZ2UoKCkgPT4gZWRpdG9yUGFydC5lbmZvcmNlTW9kYWxQYXJ0T3B0aW9ucygpKSk7XG5cblx0XHQvLyBDcmVhdGUgZ2xvYmFsIHRvb2xiYXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgTWVudUlkLk1vZGFsRWRpdG9yVGl0bGUsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH1cblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGUgbGFiZWxcblx0XHRjb25zdCBsYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVsLCB0aXRsZUVsZW1lbnQsIHt9KSk7XG5cdFx0Y29uc3QgbGFiZWxDaGFuZ2VEaXNwb3NhYmxlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRsZXQgdHJhY2tlZEVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdXBkYXRlTGFiZWwgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcjtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgeyBsYWJlbEZvcm1hdCB9ID0gZWRpdG9yUGFydC5wYXJ0T3B0aW9ucztcblxuXHRcdFx0XHRsYWJlbC5lbGVtZW50LnNldFJlc291cmNlKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pLFxuXHRcdFx0XHRcdFx0bmFtZTogYWN0aXZlRWRpdG9yLmdldE5hbWUoKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBhY3RpdmVFZGl0b3IuZ2V0RGVzY3JpcHRpb24obGFiZWxGb3JtYXQgPT09ICdzaG9ydCcgPyBWZXJib3NpdHkuU0hPUlQgOiBsYWJlbEZvcm1hdCA9PT0gJ2xvbmcnID8gVmVyYm9zaXR5LkxPTkcgOiBWZXJib3NpdHkuTUVESVVNKSB8fCAnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGl0bGU6IGFjdGl2ZUVkaXRvci5nZXRUaXRsZShWZXJib3NpdHkuTE9ORyksXG5cdFx0XHRcdFx0XHRpY29uOiBhY3RpdmVFZGl0b3IuZ2V0SWNvbigpLFxuXHRcdFx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBhY3RpdmVFZGl0b3IuZ2V0TGFiZWxFeHRyYUNsYXNzZXMoKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Ly8gT25seSAocmUpc3Vic2NyaWJlIHdoZW4gdGhlIGFjdGl2ZSBlZGl0b3IgY2hhbmdlcywgbm90IG9uIGV2ZXJ5IGxhYmVsIHVwZGF0ZVxuXHRcdFx0XHRpZiAodHJhY2tlZEVkaXRvciAhPT0gYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0dHJhY2tlZEVkaXRvciA9IGFjdGl2ZUVkaXRvcjtcblx0XHRcdFx0XHRsYWJlbENoYW5nZURpc3Bvc2FibGUudmFsdWUgPSBhY3RpdmVFZGl0b3Iub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB1cGRhdGVMYWJlbCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWwuZWxlbWVudC5jbGVhcigpO1xuXHRcdFx0XHR0cmFja2VkRWRpdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRsYWJlbENoYW5nZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUobW9kYWxFZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCB1cGRhdGVMYWJlbCkpO1xuXG5cdFx0Ly8gSGFuZGxlIGRvdWJsZS1jbGljayBvbiBoZWFkZXIgdG8gdG9nZ2xlIG1heGltaXplXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXJFbGVtZW50LCBFdmVudFR5cGUuREJMQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0ZWRpdG9yUGFydC5oYW5kbGVIZWFkZXJEb3VibGVDbGljaygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSByaWdodC1jbGljayBvbiBoZWFkZXIgdG8gb3BlbiBjb250ZXh0IG1lbnUuIFRoZSBjb250ZXh0IG1lbnVcblx0XHQvLyBhbHNvIHN1cmZhY2VzIHRoZSBlZGl0b3IgYWN0aW9ucyBvZiB0aGUgYWN0aXZlIGVkaXRvciBncm91cCwgbWlycm9yaW5nXG5cdFx0Ly8gaG93IHRoZSB3b3JrYmVuY2ggdGl0bGViYXIgZXhwb3NlcyB0aGVtIHdoZW5cblx0XHQvLyBgd29ya2JlbmNoLmVkaXRvci5lZGl0b3JBY3Rpb25zTG9jYXRpb25gIGlzIHNldCB0byBgdGl0bGVCYXJgLiBUaGVcblx0XHQvLyBhY3RpdmUgZWRpdG9yIHBhbmUncyBgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VgIGlzIHVzZWQgc28gdGhlIGFjdGlvbnMnXG5cdFx0Ly8gYHdoZW5gL2BwcmVjb25kaXRpb25gIGFuZCBrZXliaW5kaW5nIGxhYmVscyBhcmUgZXZhbHVhdGVkIGluIHRoZSBjb3JyZWN0XG5cdFx0Ly8gc2NvcGUuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXJFbGVtZW50LCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xuXHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQodGFyZ2V0KSAmJiAodGFyZ2V0LmNsb3Nlc3QoJy5tb25hY28tYnV0dG9uJykgfHwgdGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb24taXRlbScpKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBzaG93IG91ciBjb250ZXh0IG1lbnUgb3ZlciBoZWFkZXIgYnV0dG9ucyAvIGFjdGlvbnNcblx0XHRcdH1cblxuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dE1lbnVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gZWRpdG9yUGFydC5hY3RpdmVHcm91cDtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcjtcblx0XHRcdGNvbnN0IGVkaXRvclNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPz8gYWN0aXZlR3JvdXAuc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdFx0XHRjb25zdCBlZGl0b3JBY3Rpb25zID0gYWN0aXZlR3JvdXAuY3JlYXRlRWRpdG9yQWN0aW9ucyhjb250ZXh0TWVudURpc3Bvc2FibGVzLCBNZW51SWQuRWRpdG9yVGl0bGUpO1xuXHRcdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnkgfSA9IGVkaXRvckFjdGlvbnMuYWN0aW9ucztcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuTW9kYWxFZGl0b3JUaXRsZUNvbnRleHQsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBlZGl0b3JTY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiAoeyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9KSxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gU2VwYXJhdG9yLmpvaW4ocHJpbWFyeSwgc2Vjb25kYXJ5KSxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+ICh7IGdyb3VwSWQ6IGFjdGl2ZUdyb3VwLmlkLCBlZGl0b3JJbmRleDogYWN0aXZlRWRpdG9yID8gYWN0aXZlR3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihhY3RpdmVFZGl0b3IpIDogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElFZGl0b3JDb21tYW5kc0NvbnRleHQpLFxuXHRcdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCwgZWRpdG9yU2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IGNvbnRleHRNZW51RGlzcG9zYWJsZXMuZGlzcG9zZSgpLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gKHNpemVDaGFuZ2VkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCB7IHdpZHRoOiBtb2RhbFdpZHRoLCBoZWlnaHQ6IG1vZGFsSGVpZ2h0IH0gPSByZXNpemFibGVFbGVtZW50LnNpemU7XG5cdFx0XHRjb25zdCB7IHRvcDogdG9wUHgsIGxlZnQ6IGxlZnRQeCB9ID0gcmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlO1xuXHRcdFx0Y29uc3Qgc2lkZWJhcldpZHRoID0gc2lkZWJhclJlc3VsdD8uZ2V0V2lkdGgoKSA/PyAwO1xuXHRcdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gaGVhZGVyRWxlbWVudC5vZmZzZXRIZWlnaHQ7XG5cblx0XHRcdGVkaXRvclBhcnQubGF5b3V0KFxuXHRcdFx0XHRNYXRoLm1heCgwLCBtb2RhbFdpZHRoIC0gTU9EQUxfQk9SREVSX1NJWkUgLSBzaWRlYmFyV2lkdGgpLFxuXHRcdFx0XHRtb2RhbEhlaWdodCAtIE1PREFMX0JPUkRFUl9TSVpFIC0gaGVhZGVySGVpZ2h0LFxuXHRcdFx0XHRwYXJzZUZsb2F0KHRvcFB4KSArIE1PREFMX0JPUkRFUl9XSURUSCArIGhlYWRlckhlaWdodCxcblx0XHRcdFx0cGFyc2VGbG9hdChsZWZ0UHgpICsgTU9EQUxfQk9SREVSX1dJRFRIICsgc2lkZWJhcldpZHRoLFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKHNpemVDaGFuZ2VkKSB7XG5cdFx0XHRcdHNpZGViYXJSZXN1bHQ/LmxheW91dChtb2RhbEhlaWdodCAtIE1PREFMX0JPUkRFUl9TSVpFIC0gaGVhZGVySGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gSGFuZGxlIGRyYWcgb24gaGVhZGVyIHRvIG1vdmUgdGhlIG1vZGFsXG5cdFx0Y29uc3QgZHJhZ01vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdsb2JhbFBvaW50ZXJNb3ZlTW9uaXRvcigpKTtcblx0XHRjb25zdCBkcmFnRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgZGlkRHJhZyA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyRWxlbWVudCwgRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yUGFydC5tYXhpbWl6ZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBubyBkcmFnIHdoZW4gbWF4aW1pemVkXG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmJ1dHRvbiAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG9ubHkgbGVmdCBidXR0b25cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWdub3JlIGlmIHRhcmdldCBpcyBhIGJ1dHRvbiBvciBhY3Rpb25cblx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xuXHRcdFx0aWYgKCFpc0hUTUxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGFyZ2V0LmNsb3Nlc3QoJy5tb25hY28tYnV0dG9uJykgfHwgdGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb24taXRlbScpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJldmVudCB0ZXh0IHNlbGVjdGlvbiBkdXJpbmcgZHJhZ1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGRyYWdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRoZWFkZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG5cdFx0XHRkcmFnRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBoZWFkZXJFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJykpKTtcblxuXHRcdFx0Y29uc3Qgc3RhcnRYID0gZS5jbGllbnRYO1xuXHRcdFx0Y29uc3Qgc3RhcnRZID0gZS5jbGllbnRZO1xuXHRcdFx0Y29uc3Qgc3RhcnRMZWZ0ID0gcGFyc2VGbG9hdChyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUubGVmdCkgfHwgMDtcblx0XHRcdGNvbnN0IHN0YXJ0VG9wID0gcGFyc2VGbG9hdChyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wKSB8fCAwO1xuXHRcdFx0ZGlkRHJhZyA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBvblBvaW50ZXJNb3ZlID0gKG1vdmVFdmVudDogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHRcdGRpZERyYWcgPSB0cnVlO1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKG1vdmVFdmVudCwgdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgY29udGFpbmVyRGltZW5zaW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0XHRcdGNvbnN0IHRpdGxlQmFyT2Zmc2V0ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJPZmZzZXQudG9wO1xuXHRcdFx0XHRjb25zdCBkaWFsb2dXaWR0aCA9IHJlc2l6YWJsZUVsZW1lbnQuc2l6ZS53aWR0aDtcblx0XHRcdFx0Y29uc3QgZGlhbG9nSGVpZ2h0ID0gcmVzaXphYmxlRWxlbWVudC5zaXplLmhlaWdodDtcblxuXHRcdFx0XHQvLyBDbGFtcCB0byB3aW5kb3cgYm91bmRzXG5cdFx0XHRcdGNvbnN0IG1pbkxlZnQgPSAwO1xuXHRcdFx0XHRjb25zdCBtaW5Ub3AgPSB0aXRsZUJhck9mZnNldDtcblx0XHRcdFx0Y29uc3QgbWF4TGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIGRpYWxvZ1dpZHRoKTtcblx0XHRcdFx0Y29uc3QgbWF4VG9wID0gTWF0aC5tYXgobWluVG9wLCBjb250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gZGlhbG9nSGVpZ2h0KTtcblxuXHRcdFx0XHRsZXQgbmV3TGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIE1hdGgubWluKG1heExlZnQsIHN0YXJ0TGVmdCArIChtb3ZlRXZlbnQuY2xpZW50WCAtIHN0YXJ0WCkpKTtcblx0XHRcdFx0bGV0IG5ld1RvcCA9IE1hdGgubWF4KG1pblRvcCwgTWF0aC5taW4obWF4VG9wLCBzdGFydFRvcCArIChtb3ZlRXZlbnQuY2xpZW50WSAtIHN0YXJ0WSkpKTtcblxuXHRcdFx0XHQvLyBTbmFwIHRvIGNlbnRlciBwb3NpdGlvbiB3aGVuIGNsb3NlXG5cdFx0XHRcdGNvbnN0IGNlbnRlckxlZnQgPSAoY29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gZGlhbG9nV2lkdGgpIC8gMjtcblx0XHRcdFx0Y29uc3QgY2VudGVyVG9wID0gTWF0aC5tYXgodGl0bGVCYXJPZmZzZXQsIChjb250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gZGlhbG9nSGVpZ2h0KSAvIDIpO1xuXG5cdFx0XHRcdGlmIChNYXRoLmFicyhuZXdMZWZ0IC0gY2VudGVyTGVmdCkgPCBNT0RBTF9TTkFQX1RIUkVTSE9MRCAmJiBNYXRoLmFicyhuZXdUb3AgLSBjZW50ZXJUb3ApIDwgTU9EQUxfU05BUF9USFJFU0hPTEQpIHtcblx0XHRcdFx0XHRuZXdMZWZ0ID0gY2VudGVyTGVmdDtcblx0XHRcdFx0XHRuZXdUb3AgPSBjZW50ZXJUb3A7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUubGVmdCA9IGAke25ld0xlZnR9cHhgO1xuXHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7bmV3VG9wfXB4YDtcblxuXHRcdFx0XHQvLyBVcGRhdGUgZWRpdG9yIHBhcnQgcG9zaXRpb24gZHVyaW5nIGRyYWdcblx0XHRcdFx0bGF5b3V0KGZhbHNlKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG9uU3RvcCA9ICgpID0+IHtcblx0XHRcdFx0ZHJhZ0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdFx0aWYgKGRpZERyYWcpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50TGVmdCA9IHBhcnNlRmxvYXQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLmxlZnQpIHx8IDA7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudFRvcCA9IHBhcnNlRmxvYXQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCkgfHwgMDtcblxuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHNuYXBwZWQgdG8gY2VudGVyIFx1MjAxNCBpZiBzbywgY2xlYXIgY3VzdG9tIHBvc2l0aW9uXG5cdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyRGltZW5zaW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0XHRcdFx0Y29uc3QgdGl0bGVCYXJPZmZzZXQgPSB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lck9mZnNldC50b3A7XG5cdFx0XHRcdFx0Y29uc3QgY2VudGVyTGVmdCA9IChjb250YWluZXJEaW1lbnNpb24ud2lkdGggLSByZXNpemFibGVFbGVtZW50LnNpemUud2lkdGgpIC8gMjtcblx0XHRcdFx0XHRjb25zdCBjZW50ZXJUb3AgPSBNYXRoLm1heCh0aXRsZUJhck9mZnNldCwgKGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSByZXNpemFibGVFbGVtZW50LnNpemUuaGVpZ2h0KSAvIDIpO1xuXG5cdFx0XHRcdFx0aWYgKE1hdGguYWJzKGN1cnJlbnRMZWZ0IC0gY2VudGVyTGVmdCkgPCAxICYmIE1hdGguYWJzKGN1cnJlbnRUb3AgLSBjZW50ZXJUb3ApIDwgMSkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yUGFydC5wb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZWRpdG9yUGFydC5wb3NpdGlvbiA9IHsgbGVmdDogY3VycmVudExlZnQsIHRvcDogY3VycmVudFRvcCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0ZHJhZ01vbml0b3Iuc3RhcnRNb25pdG9yaW5nKGhlYWRlckVsZW1lbnQsIGUucG9pbnRlcklkLCBlLmJ1dHRvbnMsIG9uUG9pbnRlck1vdmUsIG9uU3RvcCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRm9jdXMgYWN0aXZlIGVkaXRvciB3aGVuIGNsaWNraW5nIGludG8gdGhlIHRpdGxlIGFyZWEgd2l0aCBubyBvdGhlciBjbGljayB0YXJnZXRcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhlYWRlckVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRjb25zdCB3YXNEcmFnID0gZGlkRHJhZztcblx0XHRcdGRpZERyYWcgPSBmYWxzZTtcblx0XHRcdGlmICh3YXNEcmFnKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc2tpcCBmb2N1cyBhZnRlciBkcmFnXG5cdFx0XHR9XG5cblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdGVkaXRvclBhcnQuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgcmVzaXplIGZyb20gc2FzaGVzXG5cdFx0bGV0IGlzUmVzaXppbmcgPSBmYWxzZTtcblx0XHRsZXQgcmVzaXplU3RhcnRMZWZ0ID0gMDtcblx0XHRsZXQgcmVzaXplU3RhcnRUb3AgPSAwO1xuXHRcdGxldCByZXNpemVTdGFydFNpemUgPSBEaW1lbnNpb24uTm9uZTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZXNpemFibGVFbGVtZW50Lm9uRGlkV2lsbFJlc2l6ZSgoKSA9PiB7XG5cdFx0XHRpc1Jlc2l6aW5nID0gdHJ1ZTtcblx0XHRcdHJlc2l6ZVN0YXJ0TGVmdCA9IHBhcnNlRmxvYXQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLmxlZnQpIHx8IDA7XG5cdFx0XHRyZXNpemVTdGFydFRvcCA9IHBhcnNlRmxvYXQocmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCkgfHwgMDtcblx0XHRcdHJlc2l6ZVN0YXJ0U2l6ZSA9IG5ldyBEaW1lbnNpb24ocmVzaXphYmxlRWxlbWVudC5zaXplLndpZHRoLCByZXNpemFibGVFbGVtZW50LnNpemUuaGVpZ2h0KTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVzaXphYmxlRWxlbWVudC5vbkRpZFJlc2l6ZShlID0+IHtcblxuXHRcdFx0Ly8gQ2xhbXAgcG9zaXRpb24gYW5kIHNpemUgdG8gd2luZG93IGJvdW5kcyBkdXJpbmcgYWN0aXZlIHJlc2l6ZVxuXHRcdFx0Ly8gKHNraXAgb24gYGRvbmVgIFx1MjAxNCB2YWx1ZXMgYXJlIGFscmVhZHkgY29ycmVjdCBmcm9tIHByaW9yIGV2ZW50cyxcblx0XHRcdC8vICBhbmQgZGlyZWN0aW9uYWwgZmxhZ3MgYXJlIG5vdCBzZXQgb24gdGhlIGRvbmUgZXZlbnQpXG5cdFx0XHRpZiAoIWUuZG9uZSkge1xuXHRcdFx0XHRjb25zdCBjb250YWluZXJEaW1lbnNpb24gPSB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lckRpbWVuc2lvbjtcblx0XHRcdFx0Y29uc3QgdGl0bGVCYXJPZmZzZXQgPSB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lck9mZnNldC50b3A7XG5cblx0XHRcdFx0Y29uc3QgZGVsdGFXaWR0aCA9IGUuZGltZW5zaW9uLndpZHRoIC0gcmVzaXplU3RhcnRTaXplLndpZHRoO1xuXHRcdFx0XHRjb25zdCBkZWx0YUhlaWdodCA9IGUuZGltZW5zaW9uLmhlaWdodCAtIHJlc2l6ZVN0YXJ0U2l6ZS5oZWlnaHQ7XG5cblx0XHRcdFx0bGV0IG5ld0xlZnQgPSBlLndlc3QgPyByZXNpemVTdGFydExlZnQgLSBkZWx0YVdpZHRoIDogcmVzaXplU3RhcnRMZWZ0O1xuXHRcdFx0XHRsZXQgbmV3VG9wID0gZS5ub3J0aCA/IHJlc2l6ZVN0YXJ0VG9wIC0gZGVsdGFIZWlnaHQgOiByZXNpemVTdGFydFRvcDtcblx0XHRcdFx0bGV0IG5ld1dpZHRoID0gZS5kaW1lbnNpb24ud2lkdGg7XG5cdFx0XHRcdGxldCBuZXdIZWlnaHQgPSBlLmRpbWVuc2lvbi5oZWlnaHQ7XG5cblx0XHRcdFx0aWYgKG5ld0xlZnQgPCAwKSB7XG5cdFx0XHRcdFx0bmV3V2lkdGggKz0gbmV3TGVmdDtcblx0XHRcdFx0XHRuZXdMZWZ0ID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmV3VG9wIDwgdGl0bGVCYXJPZmZzZXQpIHtcblx0XHRcdFx0XHRuZXdIZWlnaHQgKz0gbmV3VG9wIC0gdGl0bGVCYXJPZmZzZXQ7XG5cdFx0XHRcdFx0bmV3VG9wID0gdGl0bGVCYXJPZmZzZXQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5ld0xlZnQgKyBuZXdXaWR0aCA+IGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCkge1xuXHRcdFx0XHRcdG5ld1dpZHRoID0gY29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gbmV3TGVmdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobmV3VG9wICsgbmV3SGVpZ2h0ID4gY29udGFpbmVyRGltZW5zaW9uLmhlaWdodCkge1xuXHRcdFx0XHRcdG5ld0hlaWdodCA9IGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSBuZXdUb3A7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBcHBseSBjb3JyZWN0ZWQgc2l6ZSBpZiBpdCB3YXMgY2xhbXBlZFxuXHRcdFx0XHRpZiAobmV3V2lkdGggIT09IGUuZGltZW5zaW9uLndpZHRoIHx8IG5ld0hlaWdodCAhPT0gZS5kaW1lbnNpb24uaGVpZ2h0KSB7XG5cdFx0XHRcdFx0cmVzaXphYmxlRWxlbWVudC5sYXlvdXQobmV3SGVpZ2h0LCBuZXdXaWR0aCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBZGp1c3QgcG9zaXRpb24gdG8ga2VlcCB0aGUgb3Bwb3NpdGUgZWRnZSBmaXhlZFxuXHRcdFx0XHRpZiAoZS53ZXN0KSB7XG5cdFx0XHRcdFx0cmVzaXphYmxlRWxlbWVudC5kb21Ob2RlLnN0eWxlLmxlZnQgPSBgJHtuZXdMZWZ0fXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5ub3J0aCkge1xuXHRcdFx0XHRcdHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AgPSBgJHtuZXdUb3B9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBlZGl0b3IgcGFydCBsYXlvdXQgZHVyaW5nIHJlc2l6ZVxuXHRcdFx0bGF5b3V0KHRydWUpO1xuXG5cdFx0XHRpZiAoZS5kb25lKSB7XG5cdFx0XHRcdGlzUmVzaXppbmcgPSBmYWxzZTtcblxuXHRcdFx0XHQvLyBDaGVjayBpZiBzaXplIG1hdGNoZXMgdGhlIGRlZmF1bHQgKGZyb20gc2FzaCBkb3VibGUtY2xpY2sgcmVzZXQpXG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRTaXplID0gZ2V0RGVmYXVsdFNpemUoKTtcblx0XHRcdFx0Y29uc3Qgc2l6ZSA9IHJlc2l6YWJsZUVsZW1lbnQuc2l6ZTtcblx0XHRcdFx0aWYgKHNpemUud2lkdGggPT09IGRlZmF1bHRTaXplLndpZHRoICYmIHNpemUuaGVpZ2h0ID09PSBkZWZhdWx0U2l6ZS5oZWlnaHQpIHtcblx0XHRcdFx0XHRlZGl0b3JQYXJ0LnNpemUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZWRpdG9yUGFydC5wb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRsYXlvdXRNb2RhbCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVkaXRvclBhcnQuc2l6ZSA9IG5ldyBEaW1lbnNpb24oc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuXHRcdFx0XHRcdGVkaXRvclBhcnQucG9zaXRpb24gPSB7XG5cdFx0XHRcdFx0XHRsZWZ0OiBwYXJzZUZsb2F0KHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0KSB8fCAwLFxuXHRcdFx0XHRcdFx0dG9wOiBwYXJzZUZsb2F0KHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3ApIHx8IDAsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENvbXB1dGUgZGVmYXVsdCAobm9uLWN1c3RvbSwgbm9uLW1heGltaXplZCkgbW9kYWwgc2l6ZVxuXHRcdGNvbnN0IGdldERlZmF1bHRTaXplID0gKCk6IERpbWVuc2lvbiA9PiB7XG5cdFx0XHRjb25zdCBjb250YWluZXJEaW1lbnNpb24gPSB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lckRpbWVuc2lvbjtcblx0XHRcdGNvbnN0IHRpdGxlQmFyT2Zmc2V0ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJPZmZzZXQudG9wO1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlSGVpZ2h0ID0gTWF0aC5tYXgoY29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAtIHRpdGxlQmFyT2Zmc2V0LCAwKTtcblx0XHRcdGNvbnN0IHRhcmdldFdpZHRoID0gY29udGFpbmVyRGltZW5zaW9uLndpZHRoICogMC44O1xuXHRcdFx0Y29uc3QgdGFyZ2V0SGVpZ2h0ID0gYXZhaWxhYmxlSGVpZ2h0ICogMC44O1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBNYXRoLm1pbih0YXJnZXRXaWR0aCwgTU9EQUxfTUFYX0RFRkFVTFRfV0lEVEgsIGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCk7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbih0YXJnZXRIZWlnaHQsIE1PREFMX01BWF9ERUZBVUxUX0hFSUdIVCwgYXZhaWxhYmxlSGVpZ2h0KTtcblxuXHRcdFx0cmV0dXJuIG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0fTtcblxuXHRcdC8vIExheW91dCB0aGUgbW9kYWwgZWRpdG9yIHBhcnRcblx0XHRsZXQgaXNGaXJzdExheW91dCA9IHRydWU7XG5cdFx0Y29uc3QgbGF5b3V0TW9kYWwgPSAoKSA9PiB7XG5cdFx0XHRpZiAoaXNSZXNpemluZykge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNraXAgbGF5b3V0IGR1cmluZyBpbnRlcmFjdGl2ZSByZXNpemVcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGFpbmVyRGltZW5zaW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0XHRjb25zdCB0aXRsZUJhck9mZnNldCA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyT2Zmc2V0LnRvcDtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IE1hdGgubWF4KGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0aXRsZUJhck9mZnNldCwgMCk7XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRTaXplID0gZ2V0RGVmYXVsdFNpemUoKTtcblxuXHRcdFx0bGV0IHdpZHRoOiBudW1iZXI7XG5cdFx0XHRsZXQgaGVpZ2h0OiBudW1iZXI7XG5cblx0XHRcdGlmIChlZGl0b3JQYXJ0Lm1heGltaXplZCkge1xuXHRcdFx0XHRjb25zdCB2ZXJ0aWNhbFBhZGRpbmcgPSBNYXRoLm1heCh0aXRsZUJhck9mZnNldCAvKiBrZWVwIGF3YXkgZnJvbSB0aXRsZSBiYXIgdG8gcHJldmVudCBjbGlwcGluZyBpc3N1ZXMgd2l0aCBXQ08gKi8sIE1PREFMX01BWElNSVpFRF9QQURESU5HKTtcblx0XHRcdFx0d2lkdGggPSBNYXRoLm1heChjb250YWluZXJEaW1lbnNpb24ud2lkdGggLSBNT0RBTF9NQVhJTUlaRURfUEFERElORywgMCk7XG5cdFx0XHRcdGhlaWdodCA9IE1hdGgubWF4KGF2YWlsYWJsZUhlaWdodCAtIHZlcnRpY2FsUGFkZGluZywgMCk7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXRvclBhcnQuc2l6ZSkge1xuXHRcdFx0XHR3aWR0aCA9IE1hdGgubWluKGVkaXRvclBhcnQuc2l6ZS53aWR0aCwgY29udGFpbmVyRGltZW5zaW9uLndpZHRoKTtcblx0XHRcdFx0aGVpZ2h0ID0gTWF0aC5taW4oZWRpdG9yUGFydC5zaXplLmhlaWdodCwgYXZhaWxhYmxlSGVpZ2h0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZHRoID0gZGVmYXVsdFNpemUud2lkdGg7XG5cdFx0XHRcdGhlaWdodCA9IGRlZmF1bHRTaXplLmhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0aGVpZ2h0ID0gTWF0aC5taW4oaGVpZ2h0LCBhdmFpbGFibGVIZWlnaHQpOyAvLyBFbnN1cmUgdGhlIG1vZGFsIG5ldmVyIGV4Y2VlZHMgYXZhaWxhYmxlIGhlaWdodCAoYmVsb3cgdGhlIHRpdGxlIGJhcilcblxuXHRcdFx0Ly8gT24gZmlyc3QgbGF5b3V0LCBjbGFtcCBzaWRlYmFyIHdpZHRoIGlmIGl0IHdvdWxkIGxlYXZlIHRoZSBlZGl0b3IgdG9vIG5hcnJvd1xuXHRcdFx0aWYgKGlzRmlyc3RMYXlvdXQpIHtcblx0XHRcdFx0aXNGaXJzdExheW91dCA9IGZhbHNlO1xuXHRcdFx0XHRzaWRlYmFyUmVzdWx0Py5jbGFtcFdpZHRoKHdpZHRoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIHJlc2l6YWJsZSBlbGVtZW50IHNpemUgYW5kIGNvbnN0cmFpbnRzXG5cdFx0XHRyZXNpemFibGVFbGVtZW50Lm1heFNpemUgPSBuZXcgRGltZW5zaW9uKGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCwgYXZhaWxhYmxlSGVpZ2h0KTtcblx0XHRcdHJlc2l6YWJsZUVsZW1lbnQucHJlZmVycmVkU2l6ZSA9IGRlZmF1bHRTaXplO1xuXHRcdFx0cmVzaXphYmxlRWxlbWVudC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cblx0XHRcdC8vIEVuYWJsZS9kaXNhYmxlIHNhc2hlcyBiYXNlZCBvbiBtYXhpbWl6ZWQgc3RhdGVcblx0XHRcdGNvbnN0IGNhblJlc2l6ZSA9ICFlZGl0b3JQYXJ0Lm1heGltaXplZDtcblx0XHRcdHJlc2l6YWJsZUVsZW1lbnQuZW5hYmxlU2FzaGVzKGNhblJlc2l6ZSwgY2FuUmVzaXplLCBjYW5SZXNpemUsIGNhblJlc2l6ZSk7XG5cblx0XHRcdC8vIFBvc2l0aW9uOiB1c2UgY3VzdG9tIHBvc2l0aW9uIGlmIGF2YWlsYWJsZSAoY2xhbXBlZCB0byBib3VuZHMpLCBvdGhlcndpc2UgY2VudGVyXG5cdFx0XHRpZiAoIWVkaXRvclBhcnQubWF4aW1pemVkICYmIGVkaXRvclBhcnQucG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc3QgY2xhbXBlZExlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihlZGl0b3JQYXJ0LnBvc2l0aW9uLmxlZnQsIGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIHdpZHRoKSk7XG5cdFx0XHRcdGNvbnN0IGNsYW1wZWRUb3AgPSBNYXRoLm1heCh0aXRsZUJhck9mZnNldCwgTWF0aC5taW4oZWRpdG9yUGFydC5wb3NpdGlvbi50b3AsIHRpdGxlQmFyT2Zmc2V0ICsgYXZhaWxhYmxlSGVpZ2h0IC0gaGVpZ2h0KSk7XG5cdFx0XHRcdHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYCR7Y2xhbXBlZExlZnR9cHhgO1xuXHRcdFx0XHRyZXNpemFibGVFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7Y2xhbXBlZFRvcH1weGA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBsZWZ0ID0gKGNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIHdpZHRoKSAvIDI7XG5cdFx0XHRcdGNvbnN0IHRvcCA9IE1hdGgubWF4KHRpdGxlQmFyT2Zmc2V0LCAoY29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAtIGhlaWdodCkgLyAyKTsgLy8gY2VudGVyIGluIGZ1bGwgd2luZG93LCBidXQgY2xhbXAgdG8gc3RheSBiZWxvdyB0aGUgdGl0bGUgYmFyXG5cdFx0XHRcdHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0XHRcdHJlc2l6YWJsZUVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXlvdXQodHJ1ZSk7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZExheW91dE1haW5Db250YWluZXIsIGxheW91dE1vZGFsKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhcnQub25EaWRDaGFuZ2VNYXhpbWl6ZWQoKCkgPT4gbGF5b3V0TW9kYWwoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0Lm9uRGlkUmVxdWVzdExheW91dCgoKSA9PiBsYXlvdXRNb2RhbCgpKSk7XG5cblx0XHQvLyBSZWZsZWN0IG1vZGFsLW9wdGlvbnMgZnJvbSB0aGUgYWN0aXZlIGVkaXRvciAoZS5nLiBjb21wYWN0IGhlYWRlcilcblx0XHQvLyBhcyBjbGFzc2VzIG9uIHRoZSBtb2RhbCBibG9jaywgYW5kIHJlLWxheW91dCBzbyBkaW1lbnNpb25zIGFjY291bnRcblx0XHQvLyBmb3IgYW55IGhlYWRlciBzaXplIGNoYW5nZS5cblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG1vZGFsRWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yUGFydC5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3I7XG5cdFx0XHRjb25zdCBlZGl0b3JNb2RhbE9wdGlvbnMgPSBpc01vZGFsRWRpdG9yT3B0aW9uc1Byb3ZpZGVyKGFjdGl2ZUVkaXRvcikgPyBhY3RpdmVFZGl0b3IuZ2V0TW9kYWxFZGl0b3JPcHRpb25zKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRtb2RhbEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY29tcGFjdC1oZWFkZXInLCAhIWVkaXRvck1vZGFsT3B0aW9ucz8uY29tcGFjdEhlYWRlcik7XG5cdFx0XHRsYXlvdXRNb2RhbCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERpbSB3aW5kb3cgY29udHJvbHMgdG8gbWF0Y2ggdGhlIG1vZGFsIG92ZXJsYXlcblx0XHR0aGlzLmhvc3RTZXJ2aWNlLnNldFdpbmRvd0RpbW1lZChtYWluV2luZG93LCB0cnVlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuaG9zdFNlcnZpY2Uuc2V0V2luZG93RGltbWVkKG1haW5XaW5kb3csIGZhbHNlKSkpO1xuXG5cdFx0Ly8gRm9jdXNcblx0XHRlZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFydDogZWRpdG9yUGFydCxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2lkZWJhcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBoZWFkZXJFbGVtZW50OiBIVE1MRWxlbWVudCwgY29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhciB8IHVuZGVmaW5lZCwgbW9kYWxDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSU1vZGFsRWRpdG9yU2lkZWJhckNvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghY29udGVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgc2lkZWJhcldpZHRoID0gY29udGVudC5zaWRlYmFyV2lkdGggJiYgY29udGVudC5zaWRlYmFyV2lkdGggPiAwID8gY29udGVudC5zaWRlYmFyV2lkdGggOiBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEg7XG5cdFx0bGV0IGN1c3RvbVdpZHRoID0gY29udGVudC5zaWRlYmFyV2lkdGggIT09IHVuZGVmaW5lZCAmJiBjb250ZW50LnNpZGViYXJXaWR0aCA+IDA7XG5cdFx0bGV0IHZpc2libGUgPSAhY29udGVudC5zaWRlYmFySGlkZGVuO1xuXG5cdFx0Y29uc3Qgc2lkZWJhckNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5tb2RhbC1lZGl0b3Itc2lkZWJhci5zaG93LWZpbGUtaWNvbnMnKSk7XG5cdFx0c2lkZWJhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3NpZGViYXJXaWR0aH1weGA7XG5cdFx0c2V0VmlzaWJpbGl0eSh2aXNpYmxlLCBzaWRlYmFyQ29udGFpbmVyKTtcblxuXHRcdC8vIENvbnRleHQga2V5IHNlcnZpY2Ugc2NvcGVkIHRvIHRoZSBzaWRlYmFyIGNvbnRhaW5lciwgZGVzY2VuZGluZyBmcm9tIHRoZVxuXHRcdC8vIG1vZGFsIGNvbnRleHQga2V5IHNlcnZpY2Ugc28gdGhhdCBjb250ZW50IHJlbmRlcmVkIGhlcmUgKGUuZy4gdGhlIGNoYW5nZXNcblx0XHQvLyB0cmVlKSBpbmhlcml0cyB0aGUgbW9kYWwtbGV2ZWwgY29udGV4dCBrZXlzLlxuXHRcdGNvbnN0IHNpZGViYXJDb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChtb2RhbENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChzaWRlYmFyQ29udGFpbmVyKSk7XG5cblx0XHQvLyBMZXQgdGhlIGNhbGxlciByZW5kZXIgY29udGVudFxuXHRcdGNvbnN0IG9uRGlkTGF5b3V0RW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyOyByZWFkb25seSB3aWR0aDogbnVtYmVyIH0+KCkpO1xuXHRcdGNvbnN0IGNvbnRlbnREaXNwb3NhYmxlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb250ZW50RGlzcG9zYWJsZS52YWx1ZSA9IGNvbnRlbnQucmVuZGVyKHNpZGViYXJDb250YWluZXIsIG9uRGlkTGF5b3V0RW1pdHRlci5ldmVudCwgc2lkZWJhckNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFNhc2ggZm9yIHJlc2l6aW5nIHNpZGViYXIuXG5cdFx0Ly8gUHJlZmVyIHRoZSBtZWFzdXJlZCBoZWFkZXIgaGVpZ2h0IHNvIHRoZSBzYXNoIGFsaWducyB3aXRoIHRoZSByZWFsIGNocm9tZVxuXHRcdC8vICh0aGUgY29tcGFjdC1oZWFkZXIgdmFyaWFudCBpcyA0MHB4LCB0aGUgZGVmYXVsdCBoZWFkZXIgaXMgMzNweCkuIFRoZVxuXHRcdC8vIGNvbnN0YW50IG9ubHkgYXBwbGllcyBiZWZvcmUgdGhlIGhlYWRlciBoYXMgYmVlbiBsYWlkIG91dC5cblx0XHRjb25zdCBnZXRIZWFkZXJIZWlnaHQgPSAoKSA9PiAoaGVhZGVyRWxlbWVudC5vZmZzZXRIZWlnaHQgfHwgTU9EQUxfSEVBREVSX0hFSUdIVCk7XG5cdFx0Y29uc3Qgc2FzaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2FzaChjb250YWluZXIsIHtcblx0XHRcdGdldFZlcnRpY2FsU2FzaExlZnQ6ICgpID0+IHNpZGViYXJXaWR0aCxcblx0XHRcdGdldFZlcnRpY2FsU2FzaFRvcDogKCkgPT4gZ2V0SGVhZGVySGVpZ2h0KCksXG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hIZWlnaHQ6ICgpID0+IChjb250YWluZXIuY2xpZW50SGVpZ2h0IC0gZ2V0SGVhZGVySGVpZ2h0KCkpLFxuXHRcdH0sIHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMIH0pKTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuRGlzYWJsZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25EaWRSZXNpemVFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdFx0bGV0IHNhc2hTdGFydFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNhc2gub25EaWRTdGFydCgoKSA9PiBzYXNoU3RhcnRXaWR0aCA9IHNpZGViYXJXaWR0aCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkRW5kKCgpID0+IHNhc2hTdGFydFdpZHRoID0gdW5kZWZpbmVkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNhc2gub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoc2FzaFN0YXJ0V2lkdGggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlbHRhID0gZS5jdXJyZW50WCAtIGUuc3RhcnRYO1xuXHRcdFx0Y29uc3QgbWF4V2lkdGggPSBNYXRoLm1heChNT0RBTF9TSURFQkFSX01JTl9XSURUSCwgY29udGFpbmVyLmNsaWVudFdpZHRoIC0gTU9EQUxfTUlOX1dJRFRIKTtcblx0XHRcdHNpZGViYXJXaWR0aCA9IE1hdGgubWluKG1heFdpZHRoLCBNYXRoLm1heChNT0RBTF9TSURFQkFSX01JTl9XSURUSCwgc2FzaFN0YXJ0V2lkdGggKyBkZWx0YSkpO1xuXHRcdFx0Y3VzdG9tV2lkdGggPSB0cnVlO1xuXHRcdFx0c2lkZWJhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3NpZGViYXJXaWR0aH1weGA7XG5cdFx0XHRzYXNoLmxheW91dCgpO1xuXHRcdFx0b25EaWRSZXNpemVFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNhc2gub25EaWRSZXNldCgoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXhXaWR0aCA9IE1hdGgubWF4KE1PREFMX1NJREVCQVJfTUlOX1dJRFRILCBjb250YWluZXIuY2xpZW50V2lkdGggLSBNT0RBTF9NSU5fV0lEVEgpO1xuXHRcdFx0c2lkZWJhcldpZHRoID0gTWF0aC5taW4obWF4V2lkdGgsIE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSCk7XG5cdFx0XHRjdXN0b21XaWR0aCA9IGZhbHNlO1xuXHRcdFx0c2lkZWJhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3NpZGViYXJXaWR0aH1weGA7XG5cdFx0XHRzYXNoLmxheW91dCgpO1xuXHRcdFx0b25EaWRSZXNpemVFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRSZXNpemU6IG9uRGlkUmVzaXplRW1pdHRlci5ldmVudCxcblx0XHRcdGdldFdpZHRoOiAoKSA9PiB2aXNpYmxlID8gc2lkZWJhcldpZHRoIDogMCxcblx0XHRcdGhhc0N1c3RvbVdpZHRoOiAoKSA9PiBjdXN0b21XaWR0aCxcblx0XHRcdGNsYW1wV2lkdGg6IChtb2RhbFdpZHRoOiBudW1iZXIpID0+IHtcblx0XHRcdFx0aWYgKHNpZGViYXJXaWR0aCArIE1PREFMX01JTl9XSURUSCA+IG1vZGFsV2lkdGgpIHtcblx0XHRcdFx0XHRzaWRlYmFyV2lkdGggPSBNYXRoLm1pbihNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEgsIE1hdGgubWF4KE1PREFMX1NJREVCQVJfTUlOX1dJRFRILCBtb2RhbFdpZHRoIC0gTU9EQUxfTUlOX1dJRFRIKSk7XG5cdFx0XHRcdFx0Y3VzdG9tV2lkdGggPSBmYWxzZTtcblx0XHRcdFx0XHRzaWRlYmFyQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7c2lkZWJhcldpZHRofXB4YDtcblx0XHRcdFx0XHRzYXNoLmxheW91dCgpO1xuXHRcdFx0XHRcdG9uRGlkUmVzaXplRW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRpc1Zpc2libGU6ICgpID0+IHZpc2libGUsXG5cdFx0XHRzZXRWaXNpYmxlOiAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dmlzaWJsZSA9IHZhbHVlO1xuXHRcdFx0XHRzZXRWaXNpYmlsaXR5KHZpc2libGUsIHNpZGViYXJDb250YWluZXIpO1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXNpZGViYXInLCB2aXNpYmxlKTtcblx0XHRcdFx0c2FzaC5zdGF0ZSA9IHZpc2libGUgPyBTYXNoU3RhdGUuRW5hYmxlZCA6IFNhc2hTdGF0ZS5EaXNhYmxlZDtcblx0XHRcdFx0b25EaWRSZXNpemVFbWl0dGVyLmZpcmUoKTtcblx0XHRcdH0sXG5cdFx0XHRsYXlvdXQ6IChoZWlnaHQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRcdG9uRGlkTGF5b3V0RW1pdHRlci5maXJlKHtcblx0XHRcdFx0XHRcdGhlaWdodDogaGVpZ2h0IC0gTU9EQUxfU0lERUJBUl9QQURESU5HICogMixcblx0XHRcdFx0XHRcdHdpZHRoOiBzaWRlYmFyV2lkdGggLSBNT0RBTF9TSURFQkFSX1BBRERJTkcgKiAyIC0gTU9EQUxfU0lERUJBUl9CT1JERVJfUklHSFRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzYXNoLmxheW91dCgpO1xuXHRcdFx0fSxcblx0XHRcdHVwZGF0ZUNvbnRlbnQ6IChuZXdDb250ZW50OiBJTW9kYWxFZGl0b3JTaWRlYmFyKSA9PiB7XG5cdFx0XHRcdGNvbnRlbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRcdHNpZGViYXJDb250YWluZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGUudmFsdWUgPSBuZXdDb250ZW50LnJlbmRlcihzaWRlYmFyQ29udGFpbmVyLCBvbkRpZExheW91dEVtaXR0ZXIuZXZlbnQsIHNpZGViYXJDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElQb3NpdGlvbiB7XG5cdGxlZnQ6IG51bWJlcjtcblx0dG9wOiBudW1iZXI7XG59XG5cbmNsYXNzIE1vZGFsRWRpdG9yUGFydEltcGwgZXh0ZW5kcyBFZGl0b3JQYXJ0IGltcGxlbWVudHMgSU1vZGFsRWRpdG9yUGFydCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgQ09VTlRFUiA9IDE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsQ2xvc2UgPSB0aGlzLl9vbldpbGxDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1heGltaXplZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1heGltaXplZCA9IHRoaXMuX29uRGlkQ2hhbmdlTWF4aW1pemVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RMYXlvdXQgPSB0aGlzLl9vbkRpZFJlcXVlc3RMYXlvdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VOYXZpZ2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vZGFsRWRpdG9yTmF2aWdhdGlvbiB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTmF2aWdhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlTmF2aWdhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9tYXhpbWl6ZWQ6IGJvb2xlYW47XG5cdGdldCBtYXhpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9tYXhpbWl6ZWQ7IH1cblxuXHRwcml2YXRlIF9zaXplOiBJRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRnZXQgc2l6ZSgpOiBJRGltZW5zaW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NpemU7IH1cblx0c2V0IHNpemUodmFsdWU6IElEaW1lbnNpb24gfCB1bmRlZmluZWQpIHsgdGhpcy5fc2l6ZSA9IHZhbHVlOyB9XG5cblx0cHJpdmF0ZSBfcG9zaXRpb246IElQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IHBvc2l0aW9uKCk6IElQb3NpdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wb3NpdGlvbjsgfVxuXHRzZXQgcG9zaXRpb24odmFsdWU6IElQb3NpdGlvbiB8IHVuZGVmaW5lZCkgeyB0aGlzLl9wb3NpdGlvbiA9IHZhbHVlOyB9XG5cblx0cHJpdmF0ZSBfc2lkZWJhcldpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGdldCBzaWRlYmFyV2lkdGgoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NpZGViYXJXaWR0aDsgfVxuXHRzZXQgc2lkZWJhcldpZHRoKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQpIHsgdGhpcy5fc2lkZWJhcldpZHRoID0gdmFsdWU7IH1cblxuXHRwcml2YXRlIF9zaWRlYmFySGlkZGVuID0gZmFsc2U7XG5cdGdldCBzaWRlYmFySGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc2lkZWJhckhpZGRlbjsgfVxuXHRzZXQgc2lkZWJhckhpZGRlbih2YWx1ZTogYm9vbGVhbikgeyB0aGlzLl9zaWRlYmFySGlkZGVuID0gdmFsdWU7IH1cblxuXHRwcml2YXRlIF9oYXNTaWRlYmFyID0gZmFsc2U7XG5cdGdldCBoYXNTaWRlYmFyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFzU2lkZWJhcjsgfVxuXHRzZXQgaGFzU2lkZWJhcih2YWx1ZTogYm9vbGVhbikgeyB0aGlzLl9oYXNTaWRlYmFyID0gdmFsdWU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRvZ2dsZVNpZGViYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRUb2dnbGVTaWRlYmFyID0gdGhpcy5fb25EaWRUb2dnbGVTaWRlYmFyLmV2ZW50O1xuXG5cdHByaXZhdGUgc2F2ZWRTaXplOiBJRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNhdmVkUG9zaXRpb246IElQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9uYXZpZ2F0aW9uOiBJTW9kYWxFZGl0b3JOYXZpZ2F0aW9uIHwgdW5kZWZpbmVkO1xuXHRnZXQgbmF2aWdhdGlvbigpOiBJTW9kYWxFZGl0b3JOYXZpZ2F0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX25hdmlnYXRpb247IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnNEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcHJldmlvdXNNYWluV2luZG93QWN0aXZlRWxlbWVudDogRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdpbmRvd0lkOiBudW1iZXIsXG5cdFx0ZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RhbEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdG9wdGlvbnM6IElNb2RhbEVkaXRvclBhcnRPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RhbENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGlkID0gTW9kYWxFZGl0b3JQYXJ0SW1wbC5DT1VOVEVSKys7XG5cdFx0c3VwZXIoZWRpdG9yUGFydHNWaWV3LCBgd29ya2JlbmNoLnBhcnRzLm1vZGFsRWRpdG9yLiR7aWR9YCwgbG9jYWxpemUoJ21vZGFsRWRpdG9yUGFydCcsIFwiTW9kYWwgRWRpdG9yIEFyZWFcIiksIHdpbmRvd0lkLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBtb2RhbENvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX21heGltaXplZCA9IG9wdGlvbnM/Lm1heGltaXplZCA/PyBmYWxzZTtcblx0XHR0aGlzLl9zaXplID0gb3B0aW9ucz8uc2l6ZTtcblx0XHR0aGlzLl9wb3NpdGlvbiA9IG9wdGlvbnM/LnBvc2l0aW9uO1xuXHRcdHRoaXMuX25hdmlnYXRpb24gPSBvcHRpb25zPy5uYXZpZ2F0aW9uO1xuXHRcdHRoaXMuX2hhc1NpZGViYXIgPSAhIW9wdGlvbnM/LnNpZGViYXI7XG5cdFx0dGhpcy5fc2lkZWJhckhpZGRlbiA9IG9wdGlvbnM/LnNpZGViYXI/LnNpZGViYXJIaWRkZW4gPz8gZmFsc2U7XG5cdFx0dGhpcy5fc2lkZWJhcldpZHRoID0gb3B0aW9ucz8uc2lkZWJhcj8uc2lkZWJhcldpZHRoO1xuXG5cdFx0Ly8gV2hlbiByZXN0b3JpbmcgYSBtYXhpbWl6ZWQgc3RhdGUgd2l0aCBjdXN0b20gbGF5b3V0LFxuXHRcdC8vIGluaXRpYWxpemUgc2F2ZWQgc3RhdGUgc28gdW4tbWF4aW1pemUgY2FuIHJlc3RvcmUgaXRcblx0XHRpZiAodGhpcy5fbWF4aW1pemVkKSB7XG5cdFx0XHR0aGlzLnNhdmVkU2l6ZSA9IHRoaXMuX3NpemU7XG5cdFx0XHR0aGlzLnNhdmVkUG9zaXRpb24gPSB0aGlzLl9wb3NpdGlvbjtcblx0XHR9XG5cblx0XHR0aGlzLmVuZm9yY2VNb2RhbFBhcnRPcHRpb25zKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFVTRV9NT0RBTF9FRElUT1JfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy5lbmZvcmNlTW9kYWxQYXJ0T3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zPzogb2JqZWN0KTogdm9pZCB7XG5cdFx0dGhpcy5wcmV2aW91c01haW5XaW5kb3dBY3RpdmVFbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXG5cdFx0c3VwZXIuY3JlYXRlKHBhcmVudCwgb3B0aW9ucyk7XG5cdH1cblxuXHRlbmZvcmNlTW9kYWxQYXJ0T3B0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCB1c2VNb2RhbEZvckFsbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VXNlTW9kYWxFZGl0b3JNb2RlPihVU0VfTU9EQUxfRURJVE9SX1NFVFRJTkcpID09PSAnYWxsJztcblx0XHRjb25zdCBlZGl0b3JDb3VudCA9IHRoaXMuZ3JvdXBzLnJlZHVjZSgoY291bnQsIGdyb3VwKSA9PiBjb3VudCArIGdyb3VwLmNvdW50LCAwKTtcblx0XHRjb25zdCBzaG93VGFicyA9IHVzZU1vZGFsRm9yQWxsICYmIGVkaXRvckNvdW50ID4gMSA/ICdtdWx0aXBsZScgOiAnbm9uZSc7XG5cblx0XHR0aGlzLm9wdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5lbmZvcmNlUGFydE9wdGlvbnMoe1xuXHRcdFx0c2hvd1RhYnMsXG5cdFx0XHRlbmFibGVQcmV2aWV3OiB0cnVlLFxuXHRcdFx0Y2xvc2VFbXB0eUdyb3VwczogdHJ1ZSxcblx0XHRcdHRhYkFjdGlvbkNsb3NlVmlzaWJpbGl0eTogc2hvd1RhYnMgIT09ICdub25lJyxcblx0XHRcdGVkaXRvckFjdGlvbnNMb2NhdGlvbjogJ2hpZGRlbicsXG5cdFx0XHR0YWJIZWlnaHQ6ICdkZWZhdWx0Jyxcblx0XHRcdHdyYXBUYWJzOiBmYWxzZSxcblx0XHRcdGFsbG93RHJvcEludG9Hcm91cDogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9ucz86IElNb2RhbEVkaXRvclBhcnRPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zPy5tYXhpbWl6ZWQgPT09ICdib29sZWFuJyAmJiBvcHRpb25zLm1heGltaXplZCAhPT0gdGhpcy5fbWF4aW1pemVkKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX25hdmlnYXRpb24gPSBvcHRpb25zPy5uYXZpZ2F0aW9uO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOYXZpZ2F0aW9uLmZpcmUob3B0aW9ucz8ubmF2aWdhdGlvbik7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWF4aW1pemVkID0gIXRoaXMuX21heGltaXplZDtcblxuXHRcdGlmICh0aGlzLl9tYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMuc2F2ZWRTaXplID0gdGhpcy5fc2l6ZTtcblx0XHRcdHRoaXMuc2F2ZWRQb3NpdGlvbiA9IHRoaXMuX3Bvc2l0aW9uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaXplID0gdGhpcy5zYXZlZFNpemU7XG5cdFx0XHR0aGlzLl9wb3NpdGlvbiA9IHRoaXMuc2F2ZWRQb3NpdGlvbjtcblx0XHRcdHRoaXMuc2F2ZWRTaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zYXZlZFBvc2l0aW9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTWF4aW1pemVkLmZpcmUodGhpcy5fbWF4aW1pemVkKTtcblx0fVxuXG5cdHRvZ2dsZVNpZGViYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2lkZWJhckhpZGRlbiA9ICF0aGlzLl9zaWRlYmFySGlkZGVuO1xuXG5cdFx0dGhpcy5fb25EaWRUb2dnbGVTaWRlYmFyLmZpcmUoKTtcblx0fVxuXG5cdGhhbmRsZUhlYWRlckRvdWJsZUNsaWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tYXhpbWl6ZWQpIHtcblx0XHRcdC8vIENsZWFyIHNhdmVkIHN0YXRlIHNvIHRoYXQgdG9nZ2xlTWF4aW1pemVkIHJlc3RvcmVzIHRvIGRlZmF1bHRcblx0XHRcdHRoaXMuc2F2ZWRTaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zYXZlZFBvc2l0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50b2dnbGVNYXhpbWl6ZWQoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3NpemUpIHtcblx0XHRcdHRoaXMuX3NpemUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdExheW91dC5maXJlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkKCk7IC8vIG1heGltaXplXG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGhhbmRsZUNvbnRleHRLZXlzKCk6IHZvaWQge1xuXG5cdFx0Ly8gQmluZCB0aGUgbW9kYWwtbGV2ZWwgY29udGV4dCBrZXlzIHRvIHRoZSBtb2RhbCBjb250ZXh0IGtleSBzZXJ2aWNlIHdoaWNoXG5cdFx0Ly8gaXMgc2NvcGVkIHRvIHRoZSBlbnRpcmUgbW9kYWwgZWxlbWVudCAobm90IGp1c3QgdGhlIGVkaXRvciBwYXJ0XG5cdFx0Ly8gY29udGFpbmVyKS4gVGhpcyBrZWVwcyB0aGVtIGFjdGl2ZSB3aGVuIGZvY3VzIGlzIGFueXdoZXJlIGluc2lkZSB0aGVcblx0XHQvLyBtb2RhbCwgaW5jbHVkaW5nIHRoZSBzaWRlYmFyIChlLmcuIHRoZSBjaGFuZ2VzIHRyZWUpLiBPdGhlcndpc2UgY29tbWFuZHNcblx0XHQvLyBsaWtlIGNsb3NpbmcgdGhlIG1vZGFsIG9uIGBFc2NhcGVgIHdvdWxkIG5vdCBmaXJlIHdoaWxlIHRoZSBzaWRlYmFyIGhhc1xuXHRcdC8vIGZvY3VzLlxuXHRcdGNvbnN0IGlzTW9kYWxFZGl0b3JQYXJ0Q29udGV4dCA9IEVkaXRvclBhcnRNb2RhbENvbnRleHQuYmluZFRvKHRoaXMubW9kYWxDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aXNNb2RhbEVkaXRvclBhcnRDb250ZXh0LnNldCh0cnVlKTtcblxuXHRcdGNvbnN0IGlzTWF4aW1pemVkQ29udGV4dCA9IEVkaXRvclBhcnRNb2RhbE1heGltaXplZENvbnRleHQuYmluZFRvKHRoaXMubW9kYWxDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aXNNYXhpbWl6ZWRDb250ZXh0LnNldCh0aGlzLl9tYXhpbWl6ZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VNYXhpbWl6ZWQobWF4aW1pemVkID0+IGlzTWF4aW1pemVkQ29udGV4dC5zZXQobWF4aW1pemVkKSkpO1xuXG5cdFx0Y29uc3QgaGFzTmF2aWdhdGlvbkNvbnRleHQgPSBFZGl0b3JQYXJ0TW9kYWxOYXZpZ2F0aW9uQ29udGV4dC5iaW5kVG8odGhpcy5tb2RhbENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRoYXNOYXZpZ2F0aW9uQ29udGV4dC5zZXQoISF0aGlzLl9uYXZpZ2F0aW9uICYmIHRoaXMuX25hdmlnYXRpb24udG90YWwgPiAxKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlTmF2aWdhdGlvbihuYXZpZ2F0aW9uID0+IGhhc05hdmlnYXRpb25Db250ZXh0LnNldCghIW5hdmlnYXRpb24gJiYgbmF2aWdhdGlvbi50b3RhbCA+IDEpKSk7XG5cblx0XHRjb25zdCBzaWRlYmFyQ29udGV4dCA9IEVkaXRvclBhcnRNb2RhbFNpZGViYXJDb250ZXh0LmJpbmRUbyh0aGlzLm1vZGFsQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHNpZGViYXJDb250ZXh0LnNldCh0aGlzLl9oYXNTaWRlYmFyKTtcblxuXHRcdGNvbnN0IHNpZGViYXJWaXNpYmxlQ29udGV4dCA9IEVkaXRvclBhcnRNb2RhbFNpZGViYXJWaXNpYmxlQ29udGV4dC5iaW5kVG8odGhpcy5tb2RhbENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRzaWRlYmFyVmlzaWJsZUNvbnRleHQuc2V0KHRoaXMuX2hhc1NpZGViYXIgJiYgIXRoaXMuX3NpZGViYXJIaWRkZW4pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRUb2dnbGVTaWRlYmFyKCgpID0+IHNpZGViYXJWaXNpYmxlQ29udGV4dC5zZXQodGhpcy5faGFzU2lkZWJhciAmJiAhdGhpcy5fc2lkZWJhckhpZGRlbikpKTtcblxuXHRcdHN1cGVyLmhhbmRsZUNvbnRleHRLZXlzKCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW1vdmVHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIENsb3NlIG1vZGFsIHdoZW4gbGFzdCBncm91cCByZW1vdmVkXG5cdFx0Y29uc3QgZ3JvdXBWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcoZ3JvdXApO1xuXHRcdGlmICh0aGlzLmNvdW50ID09PSAxICYmIHRoaXMuYWN0aXZlR3JvdXAgPT09IGdyb3VwVmlldykge1xuXHRcdFx0dGhpcy5kb1JlbW92ZUxhc3RHcm91cCgpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBkZWxlZ2F0ZSB0byBwYXJlbnQgaW1wbGVtZW50YXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHN1cGVyLnJlbW92ZUdyb3VwKGdyb3VwLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvUmVtb3ZlTGFzdEdyb3VwKCk6IHZvaWQge1xuXG5cdFx0Ly8gQWN0aXZhdGUgbWFpbiBlZGl0b3IgZ3JvdXAgd2hlbiBjbG9zaW5nXG5cdFx0Y29uc3QgYWN0aXZlTWFpbkdyb3VwID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0dGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWN0aXZhdGVHcm91cChhY3RpdmVNYWluR3JvdXAsIHVuZGVmaW5lZCwgR3JvdXBBY3RpdmF0aW9uUmVhc29uLlBBUlRfQ0xPU0UpO1xuXG5cdFx0Ly8gRGVhbCB3aXRoIGZvY3VzOiByZW1vdmluZyB0aGUgbGFzdCBtb2RhbCBncm91cFxuXHRcdC8vIG1lYW5zIHdlIHJldHVybiBiYWNrIHRvIHRoZSBtYWluIGVkaXRvciBwYXJ0LlxuXHRcdC8vIEJ1dCB3ZSBvbmx5IHdhbnQgdG8gZm9jdXMgdGhhdCBpZiBpdCB3YXMgZm9jdXNlZFxuXHRcdC8vIGJlZm9yZSB0byBwcmV2ZW50IHJldmVhbGluZyB0aGUgZWRpdG9yIHBhcnQgaWZcblx0XHQvLyBpdCB3YXMgbWF5YmUgaGlkZGVuIGJlZm9yZS5cblx0XHRjb25zdCBtYWluRWRpdG9yUGFydENvbnRhaW5lciA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIobWFpbldpbmRvdywgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdGlmIChcblx0XHRcdCFpc0hUTUxFbGVtZW50KHRoaXMucHJldmlvdXNNYWluV2luZG93QWN0aXZlRWxlbWVudCkgfHxcdFx0XHRcdFx0Ly8gaW52YWxpZCBwcmV2aW91cyBlbGVtZW50XG5cdFx0XHQhdGhpcy5wcmV2aW91c01haW5XaW5kb3dBY3RpdmVFbGVtZW50LmlzQ29ubmVjdGVkIHx8XHRcdFx0XHRcdC8vIHByZXZpb3VzIGVsZW1lbnQgbm8gbG9uZ2VyIGluIHRoZSBET01cblx0XHRcdG1haW5FZGl0b3JQYXJ0Q29udGFpbmVyPy5jb250YWlucyh0aGlzLnByZXZpb3VzTWFpbldpbmRvd0FjdGl2ZUVsZW1lbnQpXHQvLyBwcmV2aW91cyBlbGVtZW50IGlzIGluc2lkZSBtYWluIGVkaXRvciBwYXJ0XG5cdFx0KSB7XG5cdFx0XHRhY3RpdmVNYWluR3JvdXAuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wcmV2aW91c01haW5XaW5kb3dBY3RpdmVFbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25XaWxsQ2xvc2UuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRyZXR1cm47IC8vIGRpc2FibGVkLCBtb2RhbCBlZGl0b3IgcGFydCBzdGF0ZSBpcyBub3QgcGVyc2lzdGVkXG5cdH1cblxuXHRhc3luYyBjbG9zZShvcHRpb25zPzogeyBtZXJnZUFsbEVkaXRvcnNUb01haW5QYXJ0PzogYm9vbGVhbiB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBNZXJnZSBhbGwgZWRpdG9ycyB0byBtYWluIHBhcnQgKGVkaXRvcnMgc3RheSBvcGVuLCBubyBjb25maXJtYXRpb24gbmVlZGVkKVxuXHRcdGlmIChvcHRpb25zPy5tZXJnZUFsbEVkaXRvcnNUb01haW5QYXJ0KSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1lcmdlR3JvdXBzVG9NYWluUGFydCgpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENsb3NlIGFsbCBlZGl0b3JzIGluIGVhY2ggZ3JvdXAsIGxldmVyYWdpbmcgdGhlIGV4aXN0aW5nXG5cdFx0Ly8gY29uZmlybWF0aW9uIGluZnJhc3RydWN0dXJlIGZvciBkaXJ0eSBlZGl0b3JzXG5cdFx0ZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ3JvdXBzKSB7XG5cdFx0XHRcdGNvbnN0IGNsb3NlZCA9IGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdFx0XHRpZiAoIWNsb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gdXNlciBjYW5jZWxsZWRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uV2lsbENsb3NlLmZpcmUoKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBtZXJnZUdyb3Vwc1RvTWFpblBhcnQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwLmNvdW50ID4gMCkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBza2lwIGlmIHdlIGhhdmUgbm8gZWRpdG9ycyBvcGVuZWRcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBtb3N0IHJlY2VudCBncm91cCB0aGF0IGlzIG5vdCBsb2NrZWRcblx0XHRsZXQgdGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvclBhcnRzVmlldy5tYWluUGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRpZiAoIWdyb3VwLmlzTG9ja2VkKSB7XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZ3JvdXA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdHRhcmdldEdyb3VwID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWRkR3JvdXAodGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWN0aXZlR3JvdXAsIHRoaXMucGFydE9wdGlvbnMub3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCcgPyBHcm91cERpcmVjdGlvbi5SSUdIVCA6IEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubWVyZ2VBbGxHcm91cHModGFyZ2V0R3JvdXAsIHtcblx0XHRcdC8vIFRyeSB0byByZWR1Y2UgdGhlIGltcGFjdCBvZiBjbG9zaW5nIHRoZSBtb2RhbFxuXHRcdFx0Ly8gYXMgbXVjaCBhcyBwb3NzaWJsZSBieSBub3QgY2hhbmdpbmcgZXhpc3RpbmcgZWRpdG9yc1xuXHRcdFx0Ly8gaW4gdGhlIG1haW4gd2luZG93LlxuXHRcdFx0cHJlc2VydmVFeGlzdGluZ0luZGV4OiB0cnVlXG5cdFx0fSk7XG5cdFx0dGFyZ2V0R3JvdXAuZm9jdXMoKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX25hdmlnYXRpb24gPSB1bmRlZmluZWQ7IC8vIGVuc3VyZSB0byBmcmVlIHRoZSByZWZlcmVuY2UgdG8gdGhlIG5hdmlnYXRpb24gY2xvc3VyZVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsV0FBVyxhQUFhLFdBQVcsTUFBa0IsZUFBZSxlQUFlLFlBQVk7QUFDMUksU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXLHNCQUFzQjtBQUMxQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxRQUFRLGlCQUFpQjtBQUNsQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGFBQWEsTUFBTSxpQkFBaUI7QUFDN0MsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FB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
