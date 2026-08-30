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
import "./media/titlebarpart.css";
import { localize, localize2 } from "../../../../nls.js";
import { MultiWindowParts, Part } from "../../part.js";
import { getWCOTitlebarAreaRect, getZoomFactor, isWCOEnabled } from "../../../../base/browser/browser.js";
import { getTitleBarStyle, getMenuBarVisibility, hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getWindowControlsStyle, WindowControlsStyle, MenuSettings, hasNativeMenu } from "../../../../platform/window/common/window.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from "../../../common/theme.js";
import { isMacintosh, isWindows, isLinux, isWeb, isNative, platformLocale } from "../../../../base/common/platform.js";
import { Color } from "../../../../base/common/color.js";
import { EventType, EventHelper, Dimension, append, $, addDisposableListener, prepend, reset, getWindow, getWindowId, isAncestor, getActiveDocument, isHTMLElement } from "../../../../base/browser/dom.js";
import { CustomMenubarControl } from "./menubarControl.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { Parts, IWorkbenchLayoutService, ActivityBarPosition, LayoutSettings, EditorActionsLocation, EditorTabsMode } from "../../../services/layout/browser/layoutService.js";
import { createActionViewItem, fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { WindowTitle } from "./windowTitle.js";
import { CommandCenterControl } from "./commandCenterControl.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from "../../../common/activity.js";
import { AccountsActivityActionViewItem, isAccountsActionVisible, SimpleAccountActivityActionViewItem, SimpleGlobalActivityActionViewItem } from "../globalCompositeBar.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ActionRunner, Separator } from "../../../../base/common/actions.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ActionsOrientation, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { EDITOR_CORE_NAVIGATION_COMMANDS } from "../editor/editorCommands.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { EditorPane } from "../editor/editorPane.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { EditorCommandsContextActionRunner } from "../editor/editorTabsControl.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ACCOUNTS_ACTIVITY_TILE_ACTION, GLOBAL_ACTIVITY_TITLE_ACTION, TitleBarLeadingActionsGroup } from "./titlebarActions.js";
import { createInstantHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { safeIntl } from "../../../../base/common/date.js";
import { IsCompactTitleBarContext, TitleBarVisibleContext } from "../../../common/contextkeys.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from "../../actions/menuMotion.js";
let BrowserTitleService = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService) {
    super("workbench.titleService", themeService, storageService);
    this.instantiationService = instantiationService;
    this.properties = void 0;
    this.variables = /* @__PURE__ */ new Map();
    this.mainPart = this._register(this.createMainTitlebarPart());
    this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
    this._register(this.registerPart(this.mainPart));
    this.registerActions();
    this.registerAPICommands();
  }
  createMainTitlebarPart() {
    return this.instantiationService.createInstance(MainBrowserTitlebarPart);
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class FocusTitleBar extends Action2 {
      constructor() {
        super({
          id: `workbench.action.focusTitleBar`,
          title: localize2("focusTitleBar", "Focus Title Bar"),
          category: Categories.View,
          f1: true,
          precondition: TitleBarVisibleContext
        });
      }
      run() {
        that.getPartByDocument(getActiveDocument())?.focus();
      }
    }));
  }
  registerAPICommands() {
    this._register(CommandsRegistry.registerCommand({
      id: "registerWindowTitleVariable",
      handler: (accessor, name, contextKey) => {
        this.registerVariables([{ name, contextKey }]);
      },
      metadata: {
        description: "Registers a new title variable",
        args: [
          { name: "name", schema: { type: "string" }, description: "The name of the variable to register" },
          { name: "contextKey", schema: { type: "string" }, description: "The context key to use for the value of the variable" }
        ]
      }
    }));
  }
  //#region Auxiliary Titlebar Parts
  createAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
    const titlebarPartContainer = $(".part.titlebar", { role: "none" });
    titlebarPartContainer.style.position = "relative";
    container.insertBefore(titlebarPartContainer, container.firstChild);
    const disposables = new DisposableStore();
    const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
    disposables.add(this.registerPart(titlebarPart));
    disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
    titlebarPart.create(titlebarPartContainer);
    if (this.properties) {
      titlebarPart.updateProperties(this.properties);
    }
    if (this.variables.size) {
      titlebarPart.registerVariables(Array.from(this.variables.values()));
    }
    Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());
    return titlebarPart;
  }
  doCreateAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
    return instantiationService.createInstance(AuxiliaryBrowserTitlebarPart, container, editorGroupsContainer, this.mainPart);
  }
  updateProperties(properties) {
    this.properties = properties;
    for (const part of this.parts) {
      part.updateProperties(properties);
    }
  }
  registerVariables(variables) {
    const newVariables = [];
    for (const variable of variables) {
      if (!this.variables.has(variable.name)) {
        this.variables.set(variable.name, variable);
        newVariables.push(variable);
      }
    }
    for (const part of this.parts) {
      part.registerVariables(newVariables);
    }
  }
  get windowTitle() {
    return this.mainPart.windowTitle;
  }
  //#endregion
};
BrowserTitleService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService)
], BrowserTitleService);
let BrowserTitlebarPart = class extends Part {
  constructor(id, targetWindow, editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService, actionViewItemService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.editorGroupsContainer = editorGroupsContainer;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.hostService = hostService;
    this.menuService = menuService;
    this.keybindingService = keybindingService;
    this.actionViewItemService = actionViewItemService;
    //#region IView
    this.minimumWidth = 0;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    //#endregion
    //#region Events
    this._onMenubarVisibilityChange = this._register(new Emitter());
    this.onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.customMenubar = this._register(new MutableDisposable());
    this.customMenubarDisposables = this._register(new DisposableStore());
    this.actionToolBarDisposable = this._register(new DisposableStore());
    this.editorActionsChangeDisposable = this._register(new DisposableStore());
    this.centerAdjacentToolBarDisposable = this._register(new DisposableStore());
    this.updateToolBarDisposable = this._register(new DisposableStore());
    this.globalToolbarMenuDisposables = this._register(new DisposableStore());
    this.editorToolbarMenuDisposables = this._register(new DisposableStore());
    this.layoutToolbarMenuDisposables = this._register(new DisposableStore());
    this.activityToolbarDisposables = this._register(new DisposableStore());
    this.titleDisposables = this._register(new DisposableStore());
    this.isInactive = false;
    this.isCompact = false;
    const scopedEditorService = editorService.createScoped(editorGroupsContainer, this._store);
    this.instantiationService = this._register(instantiationService.createChild(new ServiceCollection(
      [IEditorService, scopedEditorService]
    )));
    this.isAuxiliary = targetWindow.vscodeWindowId !== mainWindow.vscodeWindowId;
    this.isCompactContextKey = IsCompactTitleBarContext.bindTo(this.contextKeyService);
    this.titleBarStyle = getTitleBarStyle(this.configurationService);
    this.windowTitle = this._register(this.instantiationService.createInstance(WindowTitle, targetWindow));
    this.hoverDelegate = this._register(createInstantHoverDelegate());
    this.registerListeners(getWindowId(targetWindow));
  }
  get minimumHeight() {
    const wcoEnabled = isWeb && isWCOEnabled();
    let value = this.isCommandCenterVisible || wcoEnabled ? DEFAULT_CUSTOM_TITLEBAR_HEIGHT : 30;
    if (wcoEnabled) {
      value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
    }
    return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
  }
  get maximumHeight() {
    return this.minimumHeight;
  }
  registerListeners(targetWindowId) {
    this._register(this.hostService.onDidChangeFocus((focused) => focused ? this.onFocus() : this.onBlur()));
    this._register(this.hostService.onDidChangeActiveWindow((windowId) => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationChanged(e)));
    this._register(this.editorGroupsContainer.onDidChangeEditorPartOptions((e) => this.onEditorPartConfigurationChange(e)));
  }
  onBlur() {
    this.isInactive = true;
    this.updateStyles();
  }
  onFocus() {
    this.isInactive = false;
    this.updateStyles();
  }
  onEditorPartConfigurationChange({ oldPartOptions, newPartOptions }) {
    if (oldPartOptions.editorActionsLocation !== newPartOptions.editorActionsLocation || oldPartOptions.showTabs !== newPartOptions.showTabs) {
      if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
        this.createActionToolBar();
        this.createActionToolBarMenus({ editorActions: true });
        this._onDidChange.fire(void 0);
      }
    }
  }
  onConfigurationChanged(event) {
    if (event.affectsConfiguration(LayoutSettings.MODERN_UI)) {
      this.updateStyles();
    }
    if (!this.isAuxiliary && !hasNativeMenu(this.configurationService, this.titleBarStyle) && (!isMacintosh || isWeb)) {
      if (event.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
        if (this.currentMenubarVisibility === "compact") {
          this.uninstallMenubar();
        } else {
          this.installMenubar();
        }
      }
    }
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
      const affectsLayoutControl = event.affectsConfiguration(LayoutSettings.LAYOUT_ACTIONS);
      const affectsActivityControl = event.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);
      if (affectsLayoutControl || affectsActivityControl) {
        this.createActionToolBarMenus({ layoutActions: affectsLayoutControl, activityActions: affectsActivityControl });
        this._onDidChange.fire(void 0);
      }
    }
    if (event.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
      this.recreateTitle();
    }
  }
  recreateTitle() {
    this.createTitle();
    this._onDidChange.fire(void 0);
  }
  updateOptions(options) {
    const oldIsCompact = this.isCompact;
    this.isCompact = options.compact;
    this.isCompactContextKey.set(this.isCompact);
    if (oldIsCompact !== this.isCompact) {
      this.recreateTitle();
      this.createActionToolBarMenus(true);
    }
  }
  installMenubar() {
    if (this.menubar) {
      return;
    }
    const customMenubar = this.instantiationService.createInstance(CustomMenubarControl);
    this.customMenubar.value = customMenubar;
    this.menubar = append(this.leftContent, $("div.menubar"));
    this.menubar.setAttribute("role", "menubar");
    this.customMenubarDisposables.add(customMenubar.onVisibilityChange((e) => this.onMenubarVisibilityChanged(e)));
    customMenubar.create(this.menubar);
  }
  uninstallMenubar() {
    this.customMenubarDisposables.clear();
    this.customMenubar.clear();
    this.menubar?.remove();
    this.menubar = void 0;
    this.onMenubarVisibilityChanged(false);
  }
  onMenubarVisibilityChanged(visible) {
    if (isWeb || isWindows || isLinux) {
      if (this.lastLayoutDimensions) {
        this.layout(this.lastLayoutDimensions.width, this.lastLayoutDimensions.height);
      }
      this._onMenubarVisibilityChange.fire(visible);
    }
  }
  updateProperties(properties) {
    this.windowTitle.updateProperties(properties);
  }
  registerVariables(variables) {
    this.windowTitle.registerVariables(variables);
  }
  createContentArea(parent) {
    this.element = parent;
    this.rootContainer = append(parent, $(".titlebar-container"));
    this.leftContent = append(this.rootContainer, $(".titlebar-left"));
    this.centerContent = append(this.rootContainer, $(".titlebar-center"));
    this.rightContent = append(this.rootContainer, $(".titlebar-right"));
    if ((isWindows || isLinux) && !hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
      this.appIcon = prepend(this.leftContent, $("a.window-appicon"));
    }
    this.dragRegion = prepend(this.rootContainer, $("div.titlebar-drag-region"));
    if (!this.isAuxiliary && !hasNativeMenu(this.configurationService, this.titleBarStyle) && (!isMacintosh || isWeb) && this.currentMenubarVisibility !== "compact") {
      this.installMenubar();
    }
    this.title = append(this.centerContent, $("div.window-title"));
    this.createTitle();
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      const centerAdjacentToolBarElement = append(this.rightContent, $("div.center-adjacent-toolbar-container"));
      this.centerAdjacentToolBarElement = centerAdjacentToolBarElement;
      const centerAdjacentToolBar = this.centerAdjacentToolBarDisposable.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerAdjacentToolBarElement, MenuId.TitleBarAdjacentCenter, {
        contextMenu: MenuId.TitleBarContext,
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        toolbarOptions: {
          primaryGroup: () => true
        },
        actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
        hoverDelegate: this.hoverDelegate
      }));
      this.centerAdjacentToolBarDisposable.add(centerAdjacentToolBar.onDidChangeMenuItems(() => this.updateTitleBarToolBarOverflow()));
    }
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      const updateToolBarElement = append(this.rightContent, $("div.update-toolbar-container"));
      this.updateToolBarElement = updateToolBarElement;
      const updateToolBar = this.updateToolBarDisposable.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, updateToolBarElement, MenuId.TitleBarUpdate, {
        contextMenu: MenuId.TitleBarContext,
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        toolbarOptions: {
          primaryGroup: () => true
        },
        actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
        hoverDelegate: this.hoverDelegate
      }));
      this.updateToolBarDisposable.add(updateToolBar.onDidChangeMenuItems(() => this.updateTitleBarToolBarOverflow()));
    }
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      this.actionToolBarElement = append(this.rightContent, $("div.action-toolbar-container"));
      this.createActionToolBar();
      this.createActionToolBarMenus();
    }
    if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
      let primaryWindowControlsLocation = isMacintosh ? "left" : "right";
      if (isMacintosh && isNative) {
        const localeInfo = safeIntl.Locale(platformLocale).value;
        const textInfo = localeInfo.textInfo;
        if (textInfo && typeof textInfo === "object" && "direction" in textInfo && textInfo.direction === "rtl") {
          primaryWindowControlsLocation = "right";
        }
      }
      if (isMacintosh && isNative && primaryWindowControlsLocation === "left") {
      } else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
      } else {
        this.windowControlsContainer = append(primaryWindowControlsLocation === "left" ? this.leftContent : this.rightContent, $("div.window-controls-container"));
        if (isWeb) {
          append(primaryWindowControlsLocation === "left" ? this.rightContent : this.leftContent, $("div.window-controls-container"));
        }
        if (isWCOEnabled()) {
          this.windowControlsContainer.classList.add("wco-enabled");
        }
      }
    }
    {
      this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, (e) => {
        EventHelper.stop(e);
        let targetMenu;
        if (isMacintosh && isHTMLElement(e.target) && isAncestor(e.target, this.title)) {
          targetMenu = MenuId.TitleBarTitleContext;
        } else {
          targetMenu = MenuId.TitleBarContext;
        }
        this.onContextMenu(e, targetMenu);
      }));
      if (isMacintosh) {
        this._register(addDisposableListener(
          this.title,
          EventType.MOUSE_DOWN,
          (e) => {
            if (e.metaKey) {
              EventHelper.stop(
                e,
                true
                /* stop bubbling to prevent command center from opening */
              );
              this.onContextMenu(e, MenuId.TitleBarTitleContext);
            }
          },
          true
          /* capture phase to prevent command center from opening */
        ));
      }
    }
    this.updateStyles();
    return this.element;
  }
  createTitle() {
    this.titleDisposables.clear();
    const isShowingTitleInNativeTitlebar = hasNativeTitlebar(this.configurationService, this.titleBarStyle);
    if (!this.isCommandCenterVisible) {
      if (!isShowingTitleInNativeTitlebar) {
        this.title.textContent = this.windowTitle.value;
        this.titleDisposables.add(this.windowTitle.onDidChange(() => {
          this.title.textContent = this.windowTitle.value;
          if (this.lastLayoutDimensions) {
            this.updateLayout(this.lastLayoutDimensions);
          }
        }));
      } else {
        reset(this.title);
      }
    } else {
      const commandCenter = this.instantiationService.createInstance(CommandCenterControl, this.windowTitle, this.hoverDelegate);
      reset(this.title, commandCenter.element);
      this.titleDisposables.add(commandCenter);
    }
  }
  actionViewItemProvider(action, options) {
    for (const menuId of [MenuId.TitleBar, MenuId.LayoutControlMenu]) {
      const customViewItem = this.actionViewItemService.lookUp(menuId, action.id);
      if (customViewItem) {
        const result = customViewItem(action, options, this.instantiationService, getWindowId(this.element ? getWindow(this.element) : mainWindow));
        if (result) {
          return result;
        }
      }
    }
    if (!this.isAuxiliary) {
      if (action.id === GLOBAL_ACTIVITY_ID) {
        return this.instantiationService.createInstance(SimpleGlobalActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
      }
      if (action.id === ACCOUNTS_ACTIVITY_ID) {
        return this.instantiationService.createInstance(SimpleAccountActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
      }
    }
    const activeEditorPane = this.editorGroupsContainer.activeGroup?.activeEditorPane;
    if (activeEditorPane && activeEditorPane instanceof EditorPane) {
      const result = activeEditorPane.getActionViewItem(action, options);
      if (result) {
        return result;
      }
    }
    return createActionViewItem(this.instantiationService, action, { ...options, menuAsChild: false });
  }
  getKeybinding(action) {
    const editorPaneAwareContextKeyService = this.editorGroupsContainer.activeGroup?.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;
    return this.keybindingService.lookupKeybinding(action.id, editorPaneAwareContextKeyService);
  }
  createActionToolBar() {
    this.actionToolBarDisposable.clear();
    this.actionToolBar = this.actionToolBarDisposable.add(this.instantiationService.createInstance(WorkbenchToolBar, this.actionToolBarElement, {
      contextMenu: MenuId.TitleBarContext,
      orientation: ActionsOrientation.HORIZONTAL,
      ariaLabel: localize("ariaLabelTitleActions", "Title actions"),
      getKeyBinding: (action) => this.getKeybinding(action),
      overflowBehavior: { maxItems: 12, exempted: [ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID, ...EDITOR_CORE_NAVIGATION_COMMANDS] },
      anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
      dropdownMenuClassName: WORKBENCH_MENU_MOTION_CLASS,
      dropdownMenuCloseAnimation: workbenchMenuCloseAnimation,
      telemetrySource: "titlePart",
      highlightToggledItems: this.isAuxiliary,
      // Only show toggled state for auxiliary title bars
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      hoverDelegate: this.hoverDelegate
    }));
    if (this.editorActionsEnabled) {
      this.actionToolBarDisposable.add(this.editorGroupsContainer.onDidChangeActiveGroup(() => this.createActionToolBarMenus({ editorActions: true })));
    }
  }
  createActionToolBarMenus(update = true) {
    if (update === true) {
      update = { editorActions: true, layoutActions: true, globalActions: true, activityActions: true };
    }
    const updateToolBarActions = () => {
      const actions = { primary: [], secondary: [] };
      if (this.globalToolbarMenu) {
        const leading = { primary: [], secondary: [] };
        fillInActionBarActions(
          this.globalToolbarMenu.getActions(),
          leading,
          (actionGroup) => actionGroup === TitleBarLeadingActionsGroup
        );
        actions.primary.push(...leading.primary);
        actions.primary.push(new Separator());
      }
      if (this.editorActionsEnabled) {
        this.editorActionsChangeDisposable.clear();
        const activeGroup = this.editorGroupsContainer.activeGroup;
        if (activeGroup) {
          const editorActions = activeGroup.createEditorActions(this.editorActionsChangeDisposable, this.isAuxiliary && this.isCompact ? MenuId.CompactWindowEditorTitle : MenuId.EditorTitle);
          actions.primary.push(...editorActions.actions.primary);
          actions.secondary.push(...editorActions.actions.secondary);
          actions.primary.push(new Separator());
          this.editorActionsChangeDisposable.add(editorActions.onDidChange(() => updateToolBarActions()));
        }
      }
      if (this.layoutToolbarMenu) {
        fillInActionBarActions(
          this.layoutToolbarMenu.getActions(),
          actions,
          (group) => group === "navigation"
        );
      }
      if (this.globalToolbarMenu) {
        const trailingGroups = this.globalToolbarMenu.getActions().filter(([group]) => group !== TitleBarLeadingActionsGroup);
        fillInActionBarActions(
          trailingGroups,
          actions
        );
      }
      if (this.activityActionsEnabled) {
        if (isAccountsActionVisible(this.storageService)) {
          actions.primary.push(ACCOUNTS_ACTIVITY_TILE_ACTION);
        }
        actions.primary.push(GLOBAL_ACTIVITY_TITLE_ACTION);
      }
      this.actionToolBar.setActions(prepareActions(actions.primary), prepareActions(actions.secondary));
    };
    if (update.editorActions) {
      this.editorToolbarMenuDisposables.clear();
      if (this.editorActionsEnabled && this.editorGroupsContainer.activeGroup?.activeEditor) {
        const context = { groupId: this.editorGroupsContainer.activeGroup.id };
        this.actionToolBar.actionRunner = this.editorToolbarMenuDisposables.add(new EditorCommandsContextActionRunner(context));
        this.actionToolBar.context = context;
      } else {
        this.actionToolBar.actionRunner = this.editorToolbarMenuDisposables.add(new ActionRunner());
        this.actionToolBar.context = void 0;
      }
    }
    if (update.layoutActions) {
      this.layoutToolbarMenuDisposables.clear();
      if (this.layoutControlEnabled) {
        this.layoutToolbarMenu = this.menuService.createMenu(MenuId.LayoutControlMenu, this.contextKeyService);
        this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu);
        this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu.onDidChange(() => updateToolBarActions()));
      } else {
        this.layoutToolbarMenu = void 0;
      }
    }
    if (update.globalActions) {
      this.globalToolbarMenuDisposables.clear();
      if (this.globalActionsEnabled) {
        this.globalToolbarMenu = this.menuService.createMenu(MenuId.TitleBar, this.contextKeyService);
        this.globalToolbarMenuDisposables.add(this.globalToolbarMenu);
        this.globalToolbarMenuDisposables.add(this.globalToolbarMenu.onDidChange(() => updateToolBarActions()));
      } else {
        this.globalToolbarMenu = void 0;
      }
    }
    if (update.activityActions) {
      this.activityToolbarDisposables.clear();
      if (this.activityActionsEnabled) {
        this.activityToolbarDisposables.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => updateToolBarActions()));
      }
    }
    updateToolBarActions();
  }
  updateStyles() {
    super.updateStyles();
    if (this.element) {
      if (this.isInactive) {
        this.element.classList.add("inactive");
      } else {
        this.element.classList.remove("inactive");
      }
      const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
        return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
      }) || "";
      this.element.style.backgroundColor = titleBackground;
      this.layoutService.getContainer(getWindow(this.element)).style.setProperty("--modern-ui-shell-background", titleBackground);
      if (this.appIconBadge) {
        this.appIconBadge.style.backgroundColor = titleBackground;
      }
      if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
        this.element.classList.add("light");
      } else {
        this.element.classList.remove("light");
      }
      const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
      this.element.style.color = titleForeground || "";
      const titleBorder = !this.isAuxiliary && this.configurationService.getValue(LayoutSettings.MODERN_UI) === true ? void 0 : this.getColor(TITLE_BAR_BORDER);
      this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : "";
    }
  }
  onContextMenu(e, menuId) {
    const event = new StandardMouseEvent(getWindow(this.element), e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      menuId,
      contextKeyService: this.contextKeyService,
      domForShadowRoot: isMacintosh && isNative ? event.target : void 0
    });
  }
  get currentMenubarVisibility() {
    if (this.isAuxiliary) {
      return "hidden";
    }
    return getMenuBarVisibility(this.configurationService);
  }
  get layoutControlEnabled() {
    return this.configurationService.getValue(LayoutSettings.LAYOUT_ACTIONS) !== false;
  }
  get isCommandCenterVisible() {
    return !this.isCompact && this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) !== false;
  }
  get editorActionsEnabled() {
    return this.editorGroupsContainer.partOptions.editorActionsLocation === EditorActionsLocation.TITLEBAR || this.editorGroupsContainer.partOptions.editorActionsLocation === EditorActionsLocation.DEFAULT && this.editorGroupsContainer.partOptions.showTabs === EditorTabsMode.NONE;
  }
  get activityActionsEnabled() {
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    return !this.isCompact && !this.isAuxiliary && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM);
  }
  get globalActionsEnabled() {
    return !this.isCompact;
  }
  get hasZoomableElements() {
    const hasMenubar = !(this.currentMenubarVisibility === "hidden" || this.currentMenubarVisibility === "compact" || !isWeb && isMacintosh);
    const hasCommandCenter = this.isCommandCenterVisible;
    const hasToolBarActions = this.globalActionsEnabled || this.layoutControlEnabled || this.editorActionsEnabled || this.activityActionsEnabled;
    return hasMenubar || hasCommandCenter || hasToolBarActions;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
  }
  layout(width, height) {
    this.updateLayout(new Dimension(width, height));
    super.layoutContents(width, height);
    this.updateTitleBarToolBarOverflow();
  }
  /**
   * Hides optional title bar toolbars when showing them would push the trailing window controls off-screen (#303222).
   */
  updateTitleBarToolBarOverflow() {
    const centerAdjacentToolBarElement = this.centerAdjacentToolBarElement?.classList.contains("has-no-actions") ? void 0 : this.centerAdjacentToolBarElement;
    const updateToolBarElement = this.updateToolBarElement?.classList.contains("has-no-actions") ? void 0 : this.updateToolBarElement;
    this.centerAdjacentToolBarElement?.classList.remove("overflowing");
    this.updateToolBarElement?.classList.remove("overflowing");
    if (this.rootContainer.scrollWidth <= this.rootContainer.clientWidth) {
      return;
    }
    centerAdjacentToolBarElement?.classList.add("overflowing");
    if (this.rootContainer.scrollWidth > this.rootContainer.clientWidth) {
      updateToolBarElement?.classList.add("overflowing");
    }
  }
  updateLayout(dimension) {
    this.lastLayoutDimensions = dimension;
    if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      return;
    }
    const zoomFactor = getZoomFactor(getWindow(this.element));
    this.element.style.setProperty("--zoom-factor", zoomFactor.toString());
    this.rootContainer.classList.toggle("counter-zoom", this.preventZoom);
    if (this.customMenubar.value) {
      const menubarDimension = new Dimension(0, dimension.height);
      this.customMenubar.value.layout(menubarDimension);
    }
    const hasCenter = this.isCommandCenterVisible || this.title.textContent !== "";
    this.rootContainer.classList.toggle("has-center", hasCenter);
  }
  focus() {
    if (this.customMenubar.value) {
      this.customMenubar.value.toggleFocus();
    } else {
      this.element.querySelector('[tabindex]:not([tabindex="-1"])')?.focus();
    }
  }
  toJSON() {
    return {
      type: Parts.TITLEBAR_PART
    };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
};
BrowserTitlebarPart = __decorateClass([
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IBrowserWorkbenchEnvironmentService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IWorkbenchLayoutService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IEditorService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, IActionViewItemService)
], BrowserTitlebarPart);
let MainBrowserTitlebarPart = class extends BrowserTitlebarPart {
  constructor(contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService, actionViewItemService) {
    super(Parts.TITLEBAR_PART, mainWindow, editorGroupService.mainPart, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService, actionViewItemService);
  }
};
MainBrowserTitlebarPart = __decorateClass([
  __decorateParam(0, IContextMenuService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IBrowserWorkbenchEnvironmentService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IEditorGroupsService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IKeybindingService),
  __decorateParam(13, IActionViewItemService)
], MainBrowserTitlebarPart);
let AuxiliaryBrowserTitlebarPart = class extends BrowserTitlebarPart {
  constructor(container, editorGroupsContainer, mainTitlebar, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService, actionViewItemService) {
    const id = AuxiliaryBrowserTitlebarPart.COUNTER++;
    super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService, actionViewItemService);
    this.container = container;
    this.mainTitlebar = mainTitlebar;
  }
  get height() {
    return this.minimumHeight;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
  }
};
AuxiliaryBrowserTitlebarPart.COUNTER = 1;
AuxiliaryBrowserTitlebarPart = __decorateClass([
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IBrowserWorkbenchEnvironmentService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IWorkbenchLayoutService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IEditorGroupsService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IMenuService),
  __decorateParam(15, IKeybindingService),
  __decorateParam(16, IActionViewItemService)
], AuxiliaryBrowserTitlebarPart);
export {
  AuxiliaryBrowserTitlebarPart,
  BrowserTitleService,
  BrowserTitlebarPart,
  MainBrowserTitlebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx0aXRsZWJhclxcdGl0bGViYXJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3RpdGxlYmFycGFydC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNdWx0aVdpbmRvd1BhcnRzLCBQYXJ0IH0gZnJvbSAnLi4vLi4vcGFydC5qcyc7XG5pbXBvcnQgeyBJVGl0bGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGl0bGUvYnJvd3Nlci90aXRsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0V0NPVGl0bGViYXJBcmVhUmVjdCwgZ2V0Wm9vbUZhY3RvciwgaXNXQ09FbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTWVudUJhclZpc2liaWxpdHksIGdldFRpdGxlQmFyU3R5bGUsIGdldE1lbnVCYXJWaXNpYmlsaXR5LCBoYXNDdXN0b21UaXRsZWJhciwgaGFzTmF0aXZlVGl0bGViYXIsIERFRkFVTFRfQ1VTVE9NX1RJVExFQkFSX0hFSUdIVCwgZ2V0V2luZG93Q29udHJvbHNTdHlsZSwgV2luZG93Q29udHJvbHNTdHlsZSwgVGl0bGViYXJTdHlsZSwgTWVudVNldHRpbmdzLCBoYXNOYXRpdmVNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRJVExFX0JBUl9BQ1RJVkVfQkFDS0dST1VORCwgVElUTEVfQkFSX0FDVElWRV9GT1JFR1JPVU5ELCBUSVRMRV9CQVJfSU5BQ1RJVkVfRk9SRUdST1VORCwgVElUTEVfQkFSX0lOQUNUSVZFX0JBQ0tHUk9VTkQsIFRJVExFX0JBUl9CT1JERVIsIFdPUktCRU5DSF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MsIGlzTGludXgsIGlzV2ViLCBpc05hdGl2ZSwgcGxhdGZvcm1Mb2NhbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSwgRXZlbnRIZWxwZXIsIERpbWVuc2lvbiwgYXBwZW5kLCAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIHByZXBlbmQsIHJlc2V0LCBnZXRXaW5kb3csIGdldFdpbmRvd0lkLCBpc0FuY2VzdG9yLCBnZXRBY3RpdmVEb2N1bWVudCwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ3VzdG9tTWVudWJhckNvbnRyb2wgfSBmcm9tICcuL21lbnViYXJDb250cm9sLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUGFydHMsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBBY3Rpdml0eUJhclBvc2l0aW9uLCBMYXlvdXRTZXR0aW5ncywgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLCBFZGl0b3JUYWJzTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGZpbGxJbkFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IFdpbmRvd1RpdGxlIH0gZnJvbSAnLi93aW5kb3dUaXRsZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kQ2VudGVyQ29udHJvbCB9IGZyb20gJy4vY29tbWFuZENlbnRlckNvbnRyb2wuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyLCBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQUNUSVZJVFlfSUQsIEdMT0JBTF9BQ1RJVklUWV9JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0sIGlzQWNjb3VudHNBY3Rpb25WaXNpYmxlLCBTaW1wbGVBY2NvdW50QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSwgU2ltcGxlR2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uL2dsb2JhbENvbXBvc2l0ZUJhci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNDb250YWluZXIsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24sIElBY3Rpb25WaWV3SXRlbSwgcHJlcGFyZUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBFRElUT1JfQ09SRV9OQVZJR0FUSU9OX0NPTU1BTkRTIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb21tYW5kc0NvbnRleHRBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi9lZGl0b3IvZWRpdG9yVGFic0NvbnRyb2wuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbW1hbmRzQ29udGV4dCwgSUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQsIElUb29sYmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQUNUSVZJVFlfVElMRV9BQ1RJT04sIEdMT0JBTF9BQ1RJVklUWV9USVRMRV9BQ1RJT04sIFRpdGxlQmFyTGVhZGluZ0FjdGlvbnNHcm91cCB9IGZyb20gJy4vdGl0bGViYXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IElWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSXNDb21wYWN0VGl0bGVCYXJDb250ZXh0LCBUaXRsZUJhclZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLCB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb24gfSBmcm9tICcuLi8uLi9hY3Rpb25zL21lbnVNb3Rpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUaXRsZVZhcmlhYmxlIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb250ZXh0S2V5OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRpdGxlUHJvcGVydGllcyB7XG5cdGlzUHVyZT86IGJvb2xlYW47XG5cdGlzQWRtaW4/OiBib29sZWFuO1xuXHRwcmVmaXg/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRpdGxlYmFyUGFydCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgd2hlbiB0aGUgbWVudWJhciB2aXNpYmlsaXR5IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlOiBFdmVudDxib29sZWFuPjtcblxuXHQvKipcblx0ICogVXBkYXRlIHNvbWUgZW52aXJvbm1lbnRhbCB0aXRsZSBwcm9wZXJ0aWVzLlxuXHQgKi9cblx0dXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZDtcblxuXHQvKipcblx0ICogQWRkcyB2YXJpYWJsZXMgdG8gYmUgc3VwcG9ydGVkIGluIHRoZSB3aW5kb3cgdGl0bGUuXG5cdCAqL1xuXHRyZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXM6IElUaXRsZVZhcmlhYmxlW10pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlclRpdGxlU2VydmljZSBleHRlbmRzIE11bHRpV2luZG93UGFydHM8QnJvd3NlclRpdGxlYmFyUGFydD4gaW1wbGVtZW50cyBJVGl0bGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBtYWluUGFydDogQnJvd3NlclRpdGxlYmFyUGFydDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC50aXRsZVNlcnZpY2UnLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMubWFpblBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU1haW5UaXRsZWJhclBhcnQoKSk7XG5cdFx0dGhpcy5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5tYWluUGFydC5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJQYXJ0KHRoaXMubWFpblBhcnQpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3RlckFQSUNvbW1hbmRzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTWFpblRpdGxlYmFyUGFydCgpOiBCcm93c2VyVGl0bGViYXJQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluQnJvd3NlclRpdGxlYmFyUGFydCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblxuXHRcdC8vIEZvY3VzIGFjdGlvblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1RpdGxlQmFyIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmZvY3VzVGl0bGVCYXJgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzVGl0bGVCYXInLCAnRm9jdXMgVGl0bGUgQmFyJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IFRpdGxlQmFyVmlzaWJsZUNvbnRleHRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5nZXRQYXJ0QnlEb2N1bWVudChnZXRBY3RpdmVEb2N1bWVudCgpKT8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQVBJQ29tbWFuZHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6ICdyZWdpc3RlcldpbmRvd1RpdGxlVmFyaWFibGUnLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBuYW1lOiBzdHJpbmcsIGNvbnRleHRLZXk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyVmFyaWFibGVzKFt7IG5hbWUsIGNvbnRleHRLZXkgfV0pO1xuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmVnaXN0ZXJzIGEgbmV3IHRpdGxlIHZhcmlhYmxlJyxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ25hbWUnLCBzY2hlbWE6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246ICdUaGUgbmFtZSBvZiB0aGUgdmFyaWFibGUgdG8gcmVnaXN0ZXInIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnY29udGV4dEtleScsIHNjaGVtYTogeyB0eXBlOiAnc3RyaW5nJyB9LCBkZXNjcmlwdGlvbjogJ1RoZSBjb250ZXh0IGtleSB0byB1c2UgZm9yIHRoZSB2YWx1ZSBvZiB0aGUgdmFyaWFibGUnIH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBBdXhpbGlhcnkgVGl0bGViYXIgUGFydHNcblxuXHRjcmVhdGVBdXhpbGlhcnlUaXRsZWJhclBhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB7XG5cdFx0Y29uc3QgdGl0bGViYXJQYXJ0Q29udGFpbmVyID0gJCgnLnBhcnQudGl0bGViYXInLCB7IHJvbGU6ICdub25lJyB9KTtcblx0XHR0aXRsZWJhclBhcnRDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdGNvbnRhaW5lci5pbnNlcnRCZWZvcmUodGl0bGViYXJQYXJ0Q29udGFpbmVyLCBjb250YWluZXIuZmlyc3RDaGlsZCk7IC8vIGVuc3VyZSB3ZSBhcmUgZmlyc3QgZWxlbWVudFxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCB0aXRsZWJhclBhcnQgPSB0aGlzLmRvQ3JlYXRlQXV4aWxpYXJ5VGl0bGViYXJQYXJ0KHRpdGxlYmFyUGFydENvbnRhaW5lciwgZWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJQYXJ0KHRpdGxlYmFyUGFydCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aXRsZWJhclBhcnQub25EaWRDaGFuZ2UsICgpID0+IHRpdGxlYmFyUGFydENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aXRsZWJhclBhcnQuaGVpZ2h0fXB4YCkpO1xuXHRcdHRpdGxlYmFyUGFydC5jcmVhdGUodGl0bGViYXJQYXJ0Q29udGFpbmVyKTtcblxuXHRcdGlmICh0aGlzLnByb3BlcnRpZXMpIHtcblx0XHRcdHRpdGxlYmFyUGFydC51cGRhdGVQcm9wZXJ0aWVzKHRoaXMucHJvcGVydGllcyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmFyaWFibGVzLnNpemUpIHtcblx0XHRcdHRpdGxlYmFyUGFydC5yZWdpc3RlclZhcmlhYmxlcyhBcnJheS5mcm9tKHRoaXMudmFyaWFibGVzLnZhbHVlcygpKSk7XG5cdFx0fVxuXG5cdFx0RXZlbnQub25jZSh0aXRsZWJhclBhcnQub25XaWxsRGlzcG9zZSkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdHJldHVybiB0aXRsZWJhclBhcnQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9DcmVhdGVBdXhpbGlhcnlUaXRsZWJhclBhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogQnJvd3NlclRpdGxlYmFyUGFydCAmIElBdXhpbGlhcnlUaXRsZWJhclBhcnQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXhpbGlhcnlCcm93c2VyVGl0bGViYXJQYXJ0LCBjb250YWluZXIsIGVkaXRvckdyb3Vwc0NvbnRhaW5lciwgdGhpcy5tYWluUGFydCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBTZXJ2aWNlIEltcGxlbWVudGF0aW9uXG5cblx0cmVhZG9ubHkgb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZTogRXZlbnQ8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHVwZGF0ZVByb3BlcnRpZXMocHJvcGVydGllczogSVRpdGxlUHJvcGVydGllcyk6IHZvaWQge1xuXHRcdHRoaXMucHJvcGVydGllcyA9IHByb3BlcnRpZXM7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0cGFydC51cGRhdGVQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmFyaWFibGVzID0gbmV3IE1hcDxzdHJpbmcsIElUaXRsZVZhcmlhYmxlPigpO1xuXG5cdHJlZ2lzdGVyVmFyaWFibGVzKHZhcmlhYmxlczogSVRpdGxlVmFyaWFibGVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1ZhcmlhYmxlczogSVRpdGxlVmFyaWFibGVbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGlmICghdGhpcy52YXJpYWJsZXMuaGFzKHZhcmlhYmxlLm5hbWUpKSB7XG5cdFx0XHRcdHRoaXMudmFyaWFibGVzLnNldCh2YXJpYWJsZS5uYW1lLCB2YXJpYWJsZSk7XG5cdFx0XHRcdG5ld1ZhcmlhYmxlcy5wdXNoKHZhcmlhYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0cGFydC5yZWdpc3RlclZhcmlhYmxlcyhuZXdWYXJpYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdGdldCB3aW5kb3dUaXRsZSgpOiBXaW5kb3dUaXRsZSB7XG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQud2luZG93VGl0bGU7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJUaXRsZWJhclBhcnQgZXh0ZW5kcyBQYXJ0IGltcGxlbWVudHMgSVRpdGxlYmFyUGFydCB7XG5cblx0Ly8jcmVnaW9uIElWaWV3XG5cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXIgPSAwO1xuXHRyZWFkb25seSBtYXhpbXVtV2lkdGg6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHdjb0VuYWJsZWQgPSBpc1dlYiAmJiBpc1dDT0VuYWJsZWQoKTtcblx0XHRsZXQgdmFsdWUgPSB0aGlzLmlzQ29tbWFuZENlbnRlclZpc2libGUgfHwgd2NvRW5hYmxlZCA/IERFRkFVTFRfQ1VTVE9NX1RJVExFQkFSX0hFSUdIVCA6IDMwO1xuXHRcdGlmICh3Y29FbmFibGVkKSB7XG5cdFx0XHR2YWx1ZSA9IE1hdGgubWF4KHZhbHVlLCBnZXRXQ09UaXRsZWJhckFyZWFSZWN0KGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKT8uaGVpZ2h0ID8/IDApO1xuXHRcdH1cblxuXHRcdHJldHVybiB2YWx1ZSAvICh0aGlzLnByZXZlbnRab29tID8gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgOiAxKTtcblx0fVxuXG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1pbmltdW1IZWlnaHQ7IH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSBfb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByb3RlY3RlZCByb290Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCB3aW5kb3dDb250cm9sc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGRyYWdSZWdpb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRpdGxlITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBsZWZ0Q29udGVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNlbnRlckNvbnRlbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByaWdodENvbnRlbnQhOiBIVE1MRWxlbWVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgY3VzdG9tTWVudWJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDdXN0b21NZW51YmFyQ29udHJvbD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tTWVudWJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJvdGVjdGVkIGFwcEljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFwcEljb25CYWRnZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBtZW51YmFyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGFzdExheW91dERpbWVuc2lvbnM6IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGFjdGlvblRvb2xCYXIhOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblRvb2xCYXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JBY3Rpb25zQ2hhbmdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgYWN0aW9uVG9vbEJhckVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjZW50ZXJBZGphY2VudFRvb2xCYXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBjZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVUb29sQmFyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgdXBkYXRlVG9vbEJhckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZ2xvYmFsVG9vbGJhck1lbnU6IElNZW51IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxheW91dFRvb2xiYXJNZW51OiBJTWVudSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGdsb2JhbFRvb2xiYXJNZW51RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclRvb2xiYXJNZW51RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxheW91dFRvb2xiYXJNZW51RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5VG9vbGJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgdGl0bGVCYXJTdHlsZTogVGl0bGViYXJTdHlsZTtcblxuXHRwcml2YXRlIGlzSW5hY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlzQXV4aWxpYXJ5OiBib29sZWFuO1xuXHRwcml2YXRlIGlzQ29tcGFjdCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaXNDb21wYWN0Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cmVhZG9ubHkgd2luZG93VGl0bGU6IFdpbmRvd1RpdGxlO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0dGFyZ2V0V2luZG93OiBDb2RlV2luZG93LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCB7IGhhc1RpdGxlOiBmYWxzZSB9LCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNjb3BlZEVkaXRvclNlcnZpY2UgPSBlZGl0b3JTZXJ2aWNlLmNyZWF0ZVNjb3BlZChlZGl0b3JHcm91cHNDb250YWluZXIsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lFZGl0b3JTZXJ2aWNlLCBzY29wZWRFZGl0b3JTZXJ2aWNlXVxuXHRcdCkpKTtcblxuXHRcdHRoaXMuaXNBdXhpbGlhcnkgPSB0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQgIT09IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQ7XG5cblx0XHR0aGlzLmlzQ29tcGFjdENvbnRleHRLZXkgPSBJc0NvbXBhY3RUaXRsZUJhckNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy50aXRsZUJhclN0eWxlID0gZ2V0VGl0bGVCYXJTdHlsZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMud2luZG93VGl0bGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdpbmRvd1RpdGxlLCB0YXJnZXRXaW5kb3cpKTtcblxuXHRcdHRoaXMuaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycyhnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnModGFyZ2V0V2luZG93SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1c2VkID0+IGZvY3VzZWQgPyB0aGlzLm9uRm9jdXMoKSA6IHRoaXMub25CbHVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlV2luZG93KHdpbmRvd0lkID0+IHdpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCA/IHRoaXMub25Gb2N1cygpIDogdGhpcy5vbkJsdXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIub25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyhlID0+IHRoaXMub25FZGl0b3JQYXJ0Q29uZmlndXJhdGlvbkNoYW5nZShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0luYWN0aXZlID0gdHJ1ZTtcblxuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0luYWN0aXZlID0gZmFsc2U7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvclBhcnRDb25maWd1cmF0aW9uQ2hhbmdlKHsgb2xkUGFydE9wdGlvbnMsIG5ld1BhcnRPcHRpb25zIH06IElFZGl0b3JQYXJ0T3B0aW9uc0NoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKFxuXHRcdFx0b2xkUGFydE9wdGlvbnMuZWRpdG9yQWN0aW9uc0xvY2F0aW9uICE9PSBuZXdQYXJ0T3B0aW9ucy5lZGl0b3JBY3Rpb25zTG9jYXRpb24gfHxcblx0XHRcdG9sZFBhcnRPcHRpb25zLnNob3dUYWJzICE9PSBuZXdQYXJ0T3B0aW9ucy5zaG93VGFic1xuXHRcdCkge1xuXHRcdFx0aWYgKGhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGl0bGVCYXJTdHlsZSkgJiYgdGhpcy5hY3Rpb25Ub29sQmFyKSB7XG5cdFx0XHRcdHRoaXMuY3JlYXRlQWN0aW9uVG9vbEJhcigpO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXJNZW51cyh7IGVkaXRvckFjdGlvbnM6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25Db25maWd1cmF0aW9uQ2hhbmdlZChldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdH1cblxuXHRcdC8vIEN1c3RvbSBtZW51IGJhciAoZGlzYWJsZWQgaWYgYXV4aWxpYXJ5KVxuXHRcdGlmICghdGhpcy5pc0F1eGlsaWFyeSAmJiAhaGFzTmF0aXZlTWVudSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpICYmICghaXNNYWNpbnRvc2ggfHwgaXNXZWIpKSB7XG5cdFx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5KSkge1xuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50TWVudWJhclZpc2liaWxpdHkgPT09ICdjb21wYWN0Jykge1xuXHRcdFx0XHRcdHRoaXMudW5pbnN0YWxsTWVudWJhcigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFsbE1lbnViYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFjdGlvbnNcblx0XHRpZiAoaGFzQ3VzdG9tVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSAmJiB0aGlzLmFjdGlvblRvb2xCYXIpIHtcblx0XHRcdGNvbnN0IGFmZmVjdHNMYXlvdXRDb250cm9sID0gZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuTEFZT1VUX0FDVElPTlMpO1xuXHRcdFx0Y29uc3QgYWZmZWN0c0FjdGl2aXR5Q29udHJvbCA9IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTik7XG5cblx0XHRcdGlmIChhZmZlY3RzTGF5b3V0Q29udHJvbCB8fCBhZmZlY3RzQWN0aXZpdHlDb250cm9sKSB7XG5cdFx0XHRcdHRoaXMuY3JlYXRlQWN0aW9uVG9vbEJhck1lbnVzKHsgbGF5b3V0QWN0aW9uczogYWZmZWN0c0xheW91dENvbnRyb2wsIGFjdGl2aXR5QWN0aW9uczogYWZmZWN0c0FjdGl2aXR5Q29udHJvbCB9KTtcblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29tbWFuZCBDZW50ZXJcblx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpKSB7XG5cdFx0XHR0aGlzLnJlY3JlYXRlVGl0bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlY3JlYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jcmVhdGVUaXRsZSgpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiB7IGNvbXBhY3Q6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZElzQ29tcGFjdCA9IHRoaXMuaXNDb21wYWN0O1xuXHRcdHRoaXMuaXNDb21wYWN0ID0gb3B0aW9ucy5jb21wYWN0O1xuXG5cdFx0dGhpcy5pc0NvbXBhY3RDb250ZXh0S2V5LnNldCh0aGlzLmlzQ29tcGFjdCk7XG5cblx0XHRpZiAob2xkSXNDb21wYWN0ICE9PSB0aGlzLmlzQ29tcGFjdCkge1xuXHRcdFx0dGhpcy5yZWNyZWF0ZVRpdGxlKCk7XG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXJNZW51cyh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgaW5zdGFsbE1lbnViYXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVudWJhcikge1xuXHRcdFx0cmV0dXJuOyAvLyBJZiB0aGUgbWVudWJhciBpcyBhbHJlYWR5IGluc3RhbGxlZCwgc2tpcFxuXHRcdH1cblxuXHRcdGNvbnN0IGN1c3RvbU1lbnViYXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbU1lbnViYXJDb250cm9sKTtcblx0XHR0aGlzLmN1c3RvbU1lbnViYXIudmFsdWUgPSBjdXN0b21NZW51YmFyO1xuXG5cdFx0dGhpcy5tZW51YmFyID0gYXBwZW5kKHRoaXMubGVmdENvbnRlbnQsICQoJ2Rpdi5tZW51YmFyJykpO1xuXHRcdHRoaXMubWVudWJhci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWVudWJhcicpO1xuXG5cdFx0dGhpcy5jdXN0b21NZW51YmFyRGlzcG9zYWJsZXMuYWRkKGN1c3RvbU1lbnViYXIub25WaXNpYmlsaXR5Q2hhbmdlKGUgPT4gdGhpcy5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlZChlKSkpO1xuXG5cdFx0Y3VzdG9tTWVudWJhci5jcmVhdGUodGhpcy5tZW51YmFyKTtcblx0fVxuXG5cdHByaXZhdGUgdW5pbnN0YWxsTWVudWJhcigpOiB2b2lkIHtcblx0XHR0aGlzLmN1c3RvbU1lbnViYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuY3VzdG9tTWVudWJhci5jbGVhcigpO1xuXG5cdFx0dGhpcy5tZW51YmFyPy5yZW1vdmUoKTtcblx0XHR0aGlzLm1lbnViYXIgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLm9uTWVudWJhclZpc2liaWxpdHlDaGFuZ2VkKGZhbHNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlZCh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzV2ViIHx8IGlzV2luZG93cyB8fCBpc0xpbnV4KSB7XG5cdFx0XHRpZiAodGhpcy5sYXN0TGF5b3V0RGltZW5zaW9ucykge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RMYXlvdXREaW1lbnNpb25zLndpZHRoLCB0aGlzLmxhc3RMYXlvdXREaW1lbnNpb25zLmhlaWdodCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uTWVudWJhclZpc2liaWxpdHlDaGFuZ2UuZmlyZSh2aXNpYmxlKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVQcm9wZXJ0aWVzKHByb3BlcnRpZXM6IElUaXRsZVByb3BlcnRpZXMpOiB2b2lkIHtcblx0XHR0aGlzLndpbmRvd1RpdGxlLnVwZGF0ZVByb3BlcnRpZXMocHJvcGVydGllcyk7XG5cdH1cblxuXHRyZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXM6IElUaXRsZVZhcmlhYmxlW10pOiB2b2lkIHtcblx0XHR0aGlzLndpbmRvd1RpdGxlLnJlZ2lzdGVyVmFyaWFibGVzKHZhcmlhYmxlcyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQ29udGVudEFyZWEocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLmVsZW1lbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5yb290Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnRpdGxlYmFyLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMubGVmdENvbnRlbnQgPSBhcHBlbmQodGhpcy5yb290Q29udGFpbmVyLCAkKCcudGl0bGViYXItbGVmdCcpKTtcblx0XHR0aGlzLmNlbnRlckNvbnRlbnQgPSBhcHBlbmQodGhpcy5yb290Q29udGFpbmVyLCAkKCcudGl0bGViYXItY2VudGVyJykpO1xuXHRcdHRoaXMucmlnaHRDb250ZW50ID0gYXBwZW5kKHRoaXMucm9vdENvbnRhaW5lciwgJCgnLnRpdGxlYmFyLXJpZ2h0JykpO1xuXG5cdFx0Ly8gQXBwIEljb24gKFdpbmRvd3MsIExpbnV4KVxuXHRcdGlmICgoaXNXaW5kb3dzIHx8IGlzTGludXgpICYmICFoYXNOYXRpdmVUaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpKSB7XG5cdFx0XHR0aGlzLmFwcEljb24gPSBwcmVwZW5kKHRoaXMubGVmdENvbnRlbnQsICQoJ2Eud2luZG93LWFwcGljb24nKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhZ2dhYmxlIHJlZ2lvbiB0aGF0IHdlIGNhbiBtYW5pcHVsYXRlIGZvciAjNTI1MjJcblx0XHR0aGlzLmRyYWdSZWdpb24gPSBwcmVwZW5kKHRoaXMucm9vdENvbnRhaW5lciwgJCgnZGl2LnRpdGxlYmFyLWRyYWctcmVnaW9uJykpO1xuXG5cdFx0Ly8gTWVudWJhcjogaW5zdGFsbCBhIGN1c3RvbSBtZW51IGJhciBkZXBlbmRpbmcgb24gY29uZmlndXJhdGlvblxuXHRcdGlmIChcblx0XHRcdCF0aGlzLmlzQXV4aWxpYXJ5ICYmXG5cdFx0XHQhaGFzTmF0aXZlTWVudSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpICYmXG5cdFx0XHQoIWlzTWFjaW50b3NoIHx8IGlzV2ViKSAmJlxuXHRcdFx0dGhpcy5jdXJyZW50TWVudWJhclZpc2liaWxpdHkgIT09ICdjb21wYWN0J1xuXHRcdCkge1xuXHRcdFx0dGhpcy5pbnN0YWxsTWVudWJhcigpO1xuXHRcdH1cblxuXHRcdC8vIFRpdGxlXG5cdFx0dGhpcy50aXRsZSA9IGFwcGVuZCh0aGlzLmNlbnRlckNvbnRlbnQsICQoJ2Rpdi53aW5kb3ctdGl0bGUnKSk7XG5cdFx0dGhpcy5jcmVhdGVUaXRsZSgpO1xuXG5cdFx0Ly8gQ2VudGVyLUFkamFjZW50IFRvb2xiYXJcblx0XHRpZiAoaGFzQ3VzdG9tVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSkge1xuXHRcdFx0Y29uc3QgY2VudGVyQWRqYWNlbnRUb29sQmFyRWxlbWVudCA9IGFwcGVuZCh0aGlzLnJpZ2h0Q29udGVudCwgJCgnZGl2LmNlbnRlci1hZGphY2VudC10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMuY2VudGVyQWRqYWNlbnRUb29sQmFyRWxlbWVudCA9IGNlbnRlckFkamFjZW50VG9vbEJhckVsZW1lbnQ7XG5cdFx0XHRjb25zdCBjZW50ZXJBZGphY2VudFRvb2xCYXIgPSB0aGlzLmNlbnRlckFkamFjZW50VG9vbEJhckRpc3Bvc2FibGUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGNlbnRlckFkamFjZW50VG9vbEJhckVsZW1lbnQsIE1lbnVJZC5UaXRsZUJhckFkamFjZW50Q2VudGVyLCB7XG5cdFx0XHRcdGNvbnRleHRNZW51OiBNZW51SWQuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLmhvdmVyRGVsZWdhdGVcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gUmUtZXZhbHVhdGUgZml0IHdoZW4gaXRlbXMgY2hhbmdlLCBzZWUgIzMwMzIyMi5cblx0XHRcdHRoaXMuY2VudGVyQWRqYWNlbnRUb29sQmFyRGlzcG9zYWJsZS5hZGQoY2VudGVyQWRqYWNlbnRUb29sQmFyLm9uRGlkQ2hhbmdlTWVudUl0ZW1zKCgpID0+IHRoaXMudXBkYXRlVGl0bGVCYXJUb29sQmFyT3ZlcmZsb3coKSkpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBUb29sYmFyIChiZWZvcmUgdGhlIHJpZ2h0LWFsaWduZWQgdG9vbGJhciBhY3Rpb25zKVxuXHRcdGlmIChoYXNDdXN0b21UaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVUb29sQmFyRWxlbWVudCA9IGFwcGVuZCh0aGlzLnJpZ2h0Q29udGVudCwgJCgnZGl2LnVwZGF0ZS10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbEJhckVsZW1lbnQgPSB1cGRhdGVUb29sQmFyRWxlbWVudDtcblx0XHRcdGNvbnN0IHVwZGF0ZVRvb2xCYXIgPSB0aGlzLnVwZGF0ZVRvb2xCYXJEaXNwb3NhYmxlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB1cGRhdGVUb29sQmFyRWxlbWVudCwgTWVudUlkLlRpdGxlQmFyVXBkYXRlLCB7XG5cdFx0XHRcdGNvbnRleHRNZW51OiBNZW51SWQuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLmhvdmVyRGVsZWdhdGVcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy51cGRhdGVUb29sQmFyRGlzcG9zYWJsZS5hZGQodXBkYXRlVG9vbEJhci5vbkRpZENoYW5nZU1lbnVJdGVtcygoKSA9PiB0aGlzLnVwZGF0ZVRpdGxlQmFyVG9vbEJhck92ZXJmbG93KCkpKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgVG9vbGJhciBBY3Rpb25zXG5cdFx0aWYgKGhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGl0bGVCYXJTdHlsZSkpIHtcblx0XHRcdHRoaXMuYWN0aW9uVG9vbEJhckVsZW1lbnQgPSBhcHBlbmQodGhpcy5yaWdodENvbnRlbnQsICQoJ2Rpdi5hY3Rpb24tdG9vbGJhci1jb250YWluZXInKSk7XG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXIoKTtcblx0XHRcdHRoaXMuY3JlYXRlQWN0aW9uVG9vbEJhck1lbnVzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2luZG93IENvbnRyb2xzIENvbnRhaW5lclxuXHRcdGlmICghaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSkge1xuXHRcdFx0bGV0IHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID0gaXNNYWNpbnRvc2ggPyAnbGVmdCcgOiAncmlnaHQnO1xuXHRcdFx0aWYgKGlzTWFjaW50b3NoICYmIGlzTmF0aXZlKSB7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGxvY2FsZSBpcyBSVEwsIG1hY09TIHdpbGwgbW92ZSB0cmFmZmljIGxpZ2h0cyBpbiBSVEwgbG9jYWxlc1xuXHRcdFx0XHQvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9JbnRsL0xvY2FsZS90ZXh0SW5mb1xuXG5cdFx0XHRcdGNvbnN0IGxvY2FsZUluZm8gPSBzYWZlSW50bC5Mb2NhbGUocGxhdGZvcm1Mb2NhbGUpLnZhbHVlO1xuXHRcdFx0XHRjb25zdCB0ZXh0SW5mbyA9IChsb2NhbGVJbmZvIGFzIHsgdGV4dEluZm8/OiB1bmtub3duIH0pLnRleHRJbmZvO1xuXHRcdFx0XHRpZiAodGV4dEluZm8gJiYgdHlwZW9mIHRleHRJbmZvID09PSAnb2JqZWN0JyAmJiAnZGlyZWN0aW9uJyBpbiB0ZXh0SW5mbyAmJiB0ZXh0SW5mby5kaXJlY3Rpb24gPT09ICdydGwnKSB7XG5cdFx0XHRcdFx0cHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPSAncmlnaHQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiBpc05hdGl2ZSAmJiBwcmltYXJ5V2luZG93Q29udHJvbHNMb2NhdGlvbiA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdC8vIG1hY09TIG5hdGl2ZTogY29udHJvbHMgYXJlIG9uIHRoZSBsZWZ0IGFuZCB0aGUgY29udGFpbmVyIGlzIG5vdCBuZWVkZWQgdG8gbWFrZSByb29tXG5cdFx0XHRcdC8vIGZvciBzb21ldGhpbmcsIGV4Y2VwdCBmb3Igd2ViIHdoZXJlIGEgY3VzdG9tIG1lbnUgYmVpbmcgc3VwcG9ydGVkKS4gbm90IHB1dHRpbmcgdGhlXG5cdFx0XHRcdC8vIGNvbnRhaW5lciBoZWxwcyB3aXRoIGFsbG93aW5nIHRvIG1vdmUgdGhlIHdpbmRvdyB3aGVuIGNsaWNraW5nIHZlcnkgY2xvc2UgdG8gdGhlXG5cdFx0XHRcdC8vIHdpbmRvdyBjb250cm9sIGJ1dHRvbnMuXG5cdFx0XHR9IGVsc2UgaWYgKGdldFdpbmRvd0NvbnRyb2xzU3R5bGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgPT09IFdpbmRvd0NvbnRyb2xzU3R5bGUuSElEREVOKSB7XG5cdFx0XHRcdC8vIExpbnV4L1dpbmRvd3M6IGNvbnRyb2xzIGFyZSBleHBsaWNpdGx5IGRpc2FibGVkXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLndpbmRvd0NvbnRyb2xzQ29udGFpbmVyID0gYXBwZW5kKHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID09PSAnbGVmdCcgPyB0aGlzLmxlZnRDb250ZW50IDogdGhpcy5yaWdodENvbnRlbnQsICQoJ2Rpdi53aW5kb3ctY29udHJvbHMtY29udGFpbmVyJykpO1xuXHRcdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0XHQvLyBXZWI6IGl0cyBwb3NzaWJsZSB0byBoYXZlIGNvbnRyb2wgb3ZlcmxheXMgb24gYm90aCBzaWRlcywgZm9yIGV4YW1wbGUgb24gbWFjT1Ncblx0XHRcdFx0XHQvLyB3aXRoIHdpbmRvdyBjb250cm9scyBvbiB0aGUgbGVmdCBhbmQgUFdBIGNvbnRyb2xzIG9uIHRoZSByaWdodC5cblx0XHRcdFx0XHRhcHBlbmQocHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPT09ICdsZWZ0JyA/IHRoaXMucmlnaHRDb250ZW50IDogdGhpcy5sZWZ0Q29udGVudCwgJCgnZGl2LndpbmRvdy1jb250cm9scy1jb250YWluZXInKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNXQ09FbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLndpbmRvd0NvbnRyb2xzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3djby1lbmFibGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb250ZXh0IG1lbnUgb3ZlciB0aXRsZSBiYXI6IGRlcGVuZGluZyBvbiB0aGUgT1MgYW5kIHRoZSBsb2NhdGlvbiBvZiB0aGUgY2xpY2sgdGhpcyB3aWxsIGVpdGhlciBiZVxuXHRcdC8vIHRoZSBvdmVyYWxsIGNvbnRleHQgbWVudSBmb3IgdGhlIGVudGlyZSB0aXRsZSBiYXIgb3IgYSBzcGVjaWZpYyB0aXRsZSBjb250ZXh0IG1lbnUuXG5cdFx0Ly8gV2luZG93cyAvIExpbnV4OiB3ZSBvbmx5IHN1cHBvcnQgdGhlIG92ZXJhbGwgY29udGV4dCBtZW51IG9uIHRoZSB0aXRsZSBiYXJcblx0XHQvLyBtYWNPUzogd2Ugc3VwcG9ydCBib3RoIHRoZSBvdmVyYWxsIGNvbnRleHQgbWVudSBhbmQgdGhlIHRpdGxlIGNvbnRleHQgbWVudS5cblx0XHQvLyAgICAgICAgaW4gYWRkaXRpb24sIHdlIGFsbG93IENtZCtjbGljayB0byBicmluZyB1cCB0aGUgdGl0bGUgY29udGV4dCBtZW51LlxuXHRcdHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJvb3RDb250YWluZXIsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHRcdGxldCB0YXJnZXRNZW51OiBNZW51SWQ7XG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCAmJiBpc0hUTUxFbGVtZW50KGUudGFyZ2V0KSAmJiBpc0FuY2VzdG9yKGUudGFyZ2V0LCB0aGlzLnRpdGxlKSkge1xuXHRcdFx0XHRcdHRhcmdldE1lbnUgPSBNZW51SWQuVGl0bGVCYXJUaXRsZUNvbnRleHQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGFyZ2V0TWVudSA9IE1lbnVJZC5UaXRsZUJhckNvbnRleHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLm9uQ29udGV4dE1lbnUoZSwgdGFyZ2V0TWVudSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50aXRsZSwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm1ldGFLZXkpIHtcblx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSAvKiBzdG9wIGJ1YmJsaW5nIHRvIHByZXZlbnQgY29tbWFuZCBjZW50ZXIgZnJvbSBvcGVuaW5nICovKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5vbkNvbnRleHRNZW51KGUsIE1lbnVJZC5UaXRsZUJhclRpdGxlQ29udGV4dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0cnVlIC8qIGNhcHR1cmUgcGhhc2UgdG8gcHJldmVudCBjb21tYW5kIGNlbnRlciBmcm9tIG9wZW5pbmcgKi8pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0dGhpcy50aXRsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBpc1Nob3dpbmdUaXRsZUluTmF0aXZlVGl0bGViYXIgPSBoYXNOYXRpdmVUaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpO1xuXG5cdFx0Ly8gVGV4dCBUaXRsZVxuXHRcdGlmICghdGhpcy5pc0NvbW1hbmRDZW50ZXJWaXNpYmxlKSB7XG5cdFx0XHRpZiAoIWlzU2hvd2luZ1RpdGxlSW5OYXRpdmVUaXRsZWJhcikge1xuXHRcdFx0XHR0aGlzLnRpdGxlLnRleHRDb250ZW50ID0gdGhpcy53aW5kb3dUaXRsZS52YWx1ZTtcblx0XHRcdFx0dGhpcy50aXRsZURpc3Bvc2FibGVzLmFkZCh0aGlzLndpbmRvd1RpdGxlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnRpdGxlLnRleHRDb250ZW50ID0gdGhpcy53aW5kb3dUaXRsZS52YWx1ZTtcblx0XHRcdFx0XHRpZiAodGhpcy5sYXN0TGF5b3V0RGltZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVMYXlvdXQodGhpcy5sYXN0TGF5b3V0RGltZW5zaW9ucyk7IC8vIGxheW91dCBtZW51YmFyIGFuZCBvdGhlciByZW5kZXJpbmdzIGluIHRoZSB0aXRsZWJhclxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzZXQodGhpcy50aXRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWVudSBUaXRsZVxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgY29tbWFuZENlbnRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZENlbnRlckNvbnRyb2wsIHRoaXMud2luZG93VGl0bGUsIHRoaXMuaG92ZXJEZWxlZ2F0ZSk7XG5cdFx0XHRyZXNldCh0aGlzLnRpdGxlLCBjb21tYW5kQ2VudGVyLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy50aXRsZURpc3Bvc2FibGVzLmFkZChjb21tYW5kQ2VudGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyAtLS0gQ3VzdG9tIHZpZXcgaXRlbXMgcmVnaXN0ZXJlZCB2aWEgSUFjdGlvblZpZXdJdGVtU2VydmljZVxuXHRcdGZvciAoY29uc3QgbWVudUlkIG9mIFtNZW51SWQuVGl0bGVCYXIsIE1lbnVJZC5MYXlvdXRDb250cm9sTWVudV0pIHtcblx0XHRcdGNvbnN0IGN1c3RvbVZpZXdJdGVtID0gdGhpcy5hY3Rpb25WaWV3SXRlbVNlcnZpY2UubG9va1VwKG1lbnVJZCwgYWN0aW9uLmlkKTtcblx0XHRcdGlmIChjdXN0b21WaWV3SXRlbSkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBjdXN0b21WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGdldFdpbmRvd0lkKHRoaXMuZWxlbWVudCA/IGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpIDogbWFpbldpbmRvdykpO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIC0tLSBBY3Rpdml0eSBBY3Rpb25zXG5cdFx0aWYgKCF0aGlzLmlzQXV4aWxpYXJ5KSB7XG5cdFx0XHRpZiAoYWN0aW9uLmlkID09PSBHTE9CQUxfQUNUSVZJVFlfSUQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlR2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSwgeyBwb3NpdGlvbjogKCkgPT4gSG92ZXJQb3NpdGlvbi5CRUxPVyB9LCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb24uaWQgPT09IEFDQ09VTlRTX0FDVElWSVRZX0lEKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbXBsZUFjY291bnRBY3Rpdml0eUFjdGlvblZpZXdJdGVtLCB7IHBvc2l0aW9uOiAoKSA9PiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIC0tLSBFZGl0b3IgQWN0aW9uc1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cD8uYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSAmJiBhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgRWRpdG9yUGFuZSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlRWRpdG9yUGFuZS5nZXRBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMpO1xuXG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZXh0ZW5zaW9uc1xuXHRcdHJldHVybiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgbWVudUFzQ2hpbGQ6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXliaW5kaW5nKGFjdGlvbjogSUFjdGlvbik6IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZWRpdG9yUGFuZUF3YXJlQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cD8uYWN0aXZlRWRpdG9yUGFuZT8uc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPz8gdGhpcy5jb250ZXh0S2V5U2VydmljZTtcblxuXHRcdHJldHVybiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkLCBlZGl0b3JQYW5lQXdhcmVDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFjdGlvblRvb2xCYXIoKTogdm9pZCB7XG5cblx0XHQvLyBDcmVhdGVzIHRoZSBhY3Rpb24gdG9vbCBiYXIuIERlcGVuZHMgb24gdGhlIGNvbmZpZ3VyYXRpb24gb2YgdGhlIHRpdGxlIGJhciBtZW51c1xuXHRcdC8vIFJlcXVpcmVzIHRvIGJlIHJlY3JlYXRlZCB3aGVuZXZlciBlZGl0b3IgYWN0aW9ucyBlbmFibGVtZW50IGNoYW5nZXNcblxuXHRcdHRoaXMuYWN0aW9uVG9vbEJhckRpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdHRoaXMuYWN0aW9uVG9vbEJhciA9IHRoaXMuYWN0aW9uVG9vbEJhckRpc3Bvc2FibGUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgdGhpcy5hY3Rpb25Ub29sQmFyRWxlbWVudCwge1xuXHRcdFx0Y29udGV4dE1lbnU6IE1lbnVJZC5UaXRsZUJhckNvbnRleHQsXG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdhcmlhTGFiZWxUaXRsZUFjdGlvbnMnLCBcIlRpdGxlIGFjdGlvbnNcIiksXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5nZXRLZXliaW5kaW5nKGFjdGlvbiksXG5cdFx0XHRvdmVyZmxvd0JlaGF2aW9yOiB7IG1heEl0ZW1zOiAxMiwgZXhlbXB0ZWQ6IFtBQ0NPVU5UU19BQ1RJVklUWV9JRCwgR0xPQkFMX0FDVElWSVRZX0lELCAuLi5FRElUT1JfQ09SRV9OQVZJR0FUSU9OX0NPTU1BTkRTXSB9LFxuXHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVCxcblx0XHRcdGRyb3Bkb3duTWVudUNsYXNzTmFtZTogV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLFxuXHRcdFx0ZHJvcGRvd25NZW51Q2xvc2VBbmltYXRpb246IHdvcmtiZW5jaE1lbnVDbG9zZUFuaW1hdGlvbixcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ3RpdGxlUGFydCcsXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRoaXMuaXNBdXhpbGlhcnksIC8vIE9ubHkgc2hvdyB0b2dnbGVkIHN0YXRlIGZvciBhdXhpbGlhcnkgdGl0bGUgYmFyc1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLmhvdmVyRGVsZWdhdGVcblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZCkge1xuXHRcdFx0dGhpcy5hY3Rpb25Ub29sQmFyRGlzcG9zYWJsZS5hZGQodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIub25EaWRDaGFuZ2VBY3RpdmVHcm91cCgoKSA9PiB0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXJNZW51cyh7IGVkaXRvckFjdGlvbnM6IHRydWUgfSkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFjdGlvblRvb2xCYXJNZW51cyh1cGRhdGU6IHRydWUgfCB7IGVkaXRvckFjdGlvbnM/OiBib29sZWFuOyBsYXlvdXRBY3Rpb25zPzogYm9vbGVhbjsgZ2xvYmFsQWN0aW9ucz86IGJvb2xlYW47IGFjdGl2aXR5QWN0aW9ucz86IGJvb2xlYW4gfSA9IHRydWUpOiB2b2lkIHtcblx0XHRpZiAodXBkYXRlID09PSB0cnVlKSB7XG5cdFx0XHR1cGRhdGUgPSB7IGVkaXRvckFjdGlvbnM6IHRydWUsIGxheW91dEFjdGlvbnM6IHRydWUsIGdsb2JhbEFjdGlvbnM6IHRydWUsIGFjdGl2aXR5QWN0aW9uczogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZVRvb2xCYXJBY3Rpb25zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uczogSVRvb2xiYXJBY3Rpb25zID0geyBwcmltYXJ5OiBbXSwgc2Vjb25kYXJ5OiBbXSB9O1xuXG5cdFx0XHQvLyAtLS0gTGVhZGluZyBHbG9iYWwgQWN0aW9ucyAocmVuZGVyZWQgYmVmb3JlIGxheW91dCBjb250cm9sczsgb3B0LWluIHZpYSBUaXRsZUJhckxlYWRpbmdBY3Rpb25zR3JvdXApLlxuXHRcdFx0Ly8gVXNlIGEgc2NyYXRjaCBidWNrZXQgc28gbm9uLWxlYWRpbmcgYWN0aW9ucyBkb24ndCBsZWFrIGludG8gdGhlIHNoYXJlZCBgc2Vjb25kYXJ5YCAob3ZlcmZsb3cpIGxpc3QgaGVyZTtcblx0XHRcdC8vIHRoZXkgYXJlIGFkZGVkIGJ5IHRoZSB0cmFpbGluZyBnbG9iYWwtYWN0aW9ucyBwYXNzIGJlbG93LlxuXHRcdFx0aWYgKHRoaXMuZ2xvYmFsVG9vbGJhck1lbnUpIHtcblx0XHRcdFx0Y29uc3QgbGVhZGluZzogSVRvb2xiYXJBY3Rpb25zID0geyBwcmltYXJ5OiBbXSwgc2Vjb25kYXJ5OiBbXSB9O1xuXHRcdFx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKFxuXHRcdFx0XHRcdHRoaXMuZ2xvYmFsVG9vbGJhck1lbnUuZ2V0QWN0aW9ucygpLFxuXHRcdFx0XHRcdGxlYWRpbmcsXG5cdFx0XHRcdFx0YWN0aW9uR3JvdXAgPT4gYWN0aW9uR3JvdXAgPT09IFRpdGxlQmFyTGVhZGluZ0FjdGlvbnNHcm91cFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhY3Rpb25zLnByaW1hcnkucHVzaCguLi5sZWFkaW5nLnByaW1hcnkpO1xuXHRcdFx0XHRhY3Rpb25zLnByaW1hcnkucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAtLS0gRWRpdG9yIEFjdGlvbnNcblx0XHRcdGlmICh0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc0NoYW5nZURpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdFx0XHRjb25zdCBhY3RpdmVHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwO1xuXHRcdFx0XHRpZiAoYWN0aXZlR3JvdXApIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JBY3Rpb25zID0gYWN0aXZlR3JvdXAuY3JlYXRlRWRpdG9yQWN0aW9ucyh0aGlzLmVkaXRvckFjdGlvbnNDaGFuZ2VEaXNwb3NhYmxlLCB0aGlzLmlzQXV4aWxpYXJ5ICYmIHRoaXMuaXNDb21wYWN0ID8gTWVudUlkLkNvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZSA6IE1lbnVJZC5FZGl0b3JUaXRsZSk7XG5cblx0XHRcdFx0XHRhY3Rpb25zLnByaW1hcnkucHVzaCguLi5lZGl0b3JBY3Rpb25zLmFjdGlvbnMucHJpbWFyeSk7XG5cdFx0XHRcdFx0YWN0aW9ucy5zZWNvbmRhcnkucHVzaCguLi5lZGl0b3JBY3Rpb25zLmFjdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHRcdFx0XHRhY3Rpb25zLnByaW1hcnkucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JBY3Rpb25zQ2hhbmdlRGlzcG9zYWJsZS5hZGQoZWRpdG9yQWN0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB1cGRhdGVUb29sQmFyQWN0aW9ucygpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIExheW91dCBBY3Rpb25zXG5cdFx0XHRpZiAodGhpcy5sYXlvdXRUb29sYmFyTWVudSkge1xuXHRcdFx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKFxuXHRcdFx0XHRcdHRoaXMubGF5b3V0VG9vbGJhck1lbnUuZ2V0QWN0aW9ucygpLFxuXHRcdFx0XHRcdGFjdGlvbnMsXG5cdFx0XHRcdFx0KGdyb3VwKSA9PiBncm91cCA9PT0gJ25hdmlnYXRpb24nXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIC0tLSBHbG9iYWwgQWN0aW9ucyAoYWZ0ZXIgbGF5b3V0IHNvIGUuZy4gbm90aWZpY2F0aW9uIGJlbGwgYXBwZWFycyB0byB0aGUgcmlnaHQgb2YgbGF5b3V0IGNvbnRyb2xzKS5cblx0XHRcdC8vIEZpbHRlciBvdXQgdGhlIGxlYWRpbmcgZ3JvdXAgdXAgZnJvbnQgc28gaXQgaXNuJ3QgZHVwbGljYXRlZCBpbnRvIHRoZSBvdmVyZmxvdyBgc2Vjb25kYXJ5YCBidWNrZXQuXG5cdFx0XHRpZiAodGhpcy5nbG9iYWxUb29sYmFyTWVudSkge1xuXHRcdFx0XHRjb25zdCB0cmFpbGluZ0dyb3VwcyA9IHRoaXMuZ2xvYmFsVG9vbGJhck1lbnUuZ2V0QWN0aW9ucygpLmZpbHRlcigoW2dyb3VwXSkgPT4gZ3JvdXAgIT09IFRpdGxlQmFyTGVhZGluZ0FjdGlvbnNHcm91cCk7XG5cdFx0XHRcdGZpbGxJbkFjdGlvbkJhckFjdGlvbnMoXG5cdFx0XHRcdFx0dHJhaWxpbmdHcm91cHMsXG5cdFx0XHRcdFx0YWN0aW9uc1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAtLS0gQWN0aXZpdHkgQWN0aW9ucyAoYWx3YXlzIGF0IHRoZSBlbmQpXG5cdFx0XHRpZiAodGhpcy5hY3Rpdml0eUFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRcdGlmIChpc0FjY291bnRzQWN0aW9uVmlzaWJsZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKSkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHJpbWFyeS5wdXNoKEFDQ09VTlRTX0FDVElWSVRZX1RJTEVfQUNUSU9OKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFjdGlvbnMucHJpbWFyeS5wdXNoKEdMT0JBTF9BQ1RJVklUWV9USVRMRV9BQ1RJT04pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFjdGlvblRvb2xCYXIuc2V0QWN0aW9ucyhwcmVwYXJlQWN0aW9ucyhhY3Rpb25zLnByaW1hcnkpLCBwcmVwYXJlQWN0aW9ucyhhY3Rpb25zLnNlY29uZGFyeSkpO1xuXHRcdH07XG5cblx0XHQvLyBDcmVhdGUvVXBkYXRlIHRoZSBtZW51cyB3aGljaCBzaG91bGQgYmUgaW4gdGhlIHRpdGxlIHRvb2wgYmFyXG5cblx0XHRpZiAodXBkYXRlLmVkaXRvckFjdGlvbnMpIHtcblx0XHRcdHRoaXMuZWRpdG9yVG9vbGJhck1lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHQvLyBUaGUgZWRpdG9yIHRvb2xiYXIgbWVudSBpcyBoYW5kbGVkIGJ5IHRoZSBlZGl0b3IgZ3JvdXAgc28gd2UgZG8gbm90IG5lZWQgdG8gbWFuYWdlIGl0IGhlcmUuXG5cdFx0XHQvLyBIb3dldmVyLCBkZXBlbmRpbmcgb24gdGhlIGFjdGl2ZSBlZGl0b3IsIHdlIG5lZWQgdG8gdXBkYXRlIHRoZSBjb250ZXh0IGFuZCBhY3Rpb24gcnVubmVyIG9mIHRoZSB0b29sYmFyIG1lbnUuXG5cdFx0XHRpZiAodGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZCAmJiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cD8uYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQ6IElFZGl0b3JDb21tYW5kc0NvbnRleHQgPSB7IGdyb3VwSWQ6IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwLmlkIH07XG5cblx0XHRcdFx0dGhpcy5hY3Rpb25Ub29sQmFyLmFjdGlvblJ1bm5lciA9IHRoaXMuZWRpdG9yVG9vbGJhck1lbnVEaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvckNvbW1hbmRzQ29udGV4dEFjdGlvblJ1bm5lcihjb250ZXh0KSk7XG5cdFx0XHRcdHRoaXMuYWN0aW9uVG9vbEJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uVG9vbEJhci5hY3Rpb25SdW5uZXIgPSB0aGlzLmVkaXRvclRvb2xiYXJNZW51RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cdFx0XHRcdHRoaXMuYWN0aW9uVG9vbEJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh1cGRhdGUubGF5b3V0QWN0aW9ucykge1xuXHRcdFx0dGhpcy5sYXlvdXRUb29sYmFyTWVudURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdGlmICh0aGlzLmxheW91dENvbnRyb2xFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0VG9vbGJhck1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkxheW91dENvbnRyb2xNZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdFx0XHR0aGlzLmxheW91dFRvb2xiYXJNZW51RGlzcG9zYWJsZXMuYWRkKHRoaXMubGF5b3V0VG9vbGJhck1lbnUpO1xuXHRcdFx0XHR0aGlzLmxheW91dFRvb2xiYXJNZW51RGlzcG9zYWJsZXMuYWRkKHRoaXMubGF5b3V0VG9vbGJhck1lbnUub25EaWRDaGFuZ2UoKCkgPT4gdXBkYXRlVG9vbEJhckFjdGlvbnMoKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRUb29sYmFyTWVudSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodXBkYXRlLmdsb2JhbEFjdGlvbnMpIHtcblx0XHRcdHRoaXMuZ2xvYmFsVG9vbGJhck1lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRpZiAodGhpcy5nbG9iYWxBY3Rpb25zRW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLmdsb2JhbFRvb2xiYXJNZW51ID0gdGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UaXRsZUJhciwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdFx0dGhpcy5nbG9iYWxUb29sYmFyTWVudURpc3Bvc2FibGVzLmFkZCh0aGlzLmdsb2JhbFRvb2xiYXJNZW51KTtcblx0XHRcdFx0dGhpcy5nbG9iYWxUb29sYmFyTWVudURpc3Bvc2FibGVzLmFkZCh0aGlzLmdsb2JhbFRvb2xiYXJNZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZVRvb2xCYXJBY3Rpb25zKCkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZ2xvYmFsVG9vbGJhck1lbnUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVwZGF0ZS5hY3Rpdml0eUFjdGlvbnMpIHtcblx0XHRcdHRoaXMuYWN0aXZpdHlUb29sYmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2aXR5QWN0aW9uc0VuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5hY3Rpdml0eVRvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0uQUNDT1VOVFNfVklTSUJJTElUWV9QUkVGRVJFTkNFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHVwZGF0ZVRvb2xCYXJBY3Rpb25zKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR1cGRhdGVUb29sQmFyQWN0aW9ucygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0Ly8gUGFydCBjb250YWluZXJcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRpZiAodGhpcy5pc0luYWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbmFjdGl2ZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2luYWN0aXZlJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRpdGxlQmFja2dyb3VuZCA9IHRoaXMuZ2V0Q29sb3IodGhpcy5pc0luYWN0aXZlID8gVElUTEVfQkFSX0lOQUNUSVZFX0JBQ0tHUk9VTkQgOiBUSVRMRV9CQVJfQUNUSVZFX0JBQ0tHUk9VTkQsIChjb2xvciwgdGhlbWUpID0+IHtcblx0XHRcdFx0Ly8gTENEIFJlbmRlcmluZyBTdXBwb3J0OiB0aGUgdGl0bGUgYmFyIHBhcnQgaXMgYSBkZWZpbmluZyBpdHMgb3duIEdQVSBsYXllci5cblx0XHRcdFx0Ly8gVG8gYmVuZWZpdCBmcm9tIExDRCBmb250IHJlbmRlcmluZywgd2UgbXVzdCBlbnN1cmUgdGhhdCB3ZSBhbHdheXMgc2V0IGFuXG5cdFx0XHRcdC8vIG9wYXF1ZSBiYWNrZ3JvdW5kIGNvbG9yLiBBcyBzdWNoLCB3ZSBjb21wdXRlIGFuIG9wYXF1ZSBjb2xvciBnaXZlbiB3ZSBrbm93XG5cdFx0XHRcdC8vIHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGlzIHRoZSB3b3JrYmVuY2ggYmFja2dyb3VuZC5cblx0XHRcdFx0cmV0dXJuIGNvbG9yLmlzT3BhcXVlKCkgPyBjb2xvciA6IGNvbG9yLm1ha2VPcGFxdWUoV09SS0JFTkNIX0JBQ0tHUk9VTkQodGhlbWUpKTtcblx0XHRcdH0pIHx8ICcnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRpdGxlQmFja2dyb3VuZDtcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpLnN0eWxlLnNldFByb3BlcnR5KCctLW1vZGVybi11aS1zaGVsbC1iYWNrZ3JvdW5kJywgdGl0bGVCYWNrZ3JvdW5kKTtcblxuXHRcdFx0aWYgKHRoaXMuYXBwSWNvbkJhZGdlKSB7XG5cdFx0XHRcdHRoaXMuYXBwSWNvbkJhZGdlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRpdGxlQmFja2dyb3VuZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRpdGxlQmFja2dyb3VuZCAmJiBDb2xvci5mcm9tSGV4KHRpdGxlQmFja2dyb3VuZCkuaXNMaWdodGVyKCkpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpZ2h0Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbGlnaHQnKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGl0bGVGb3JlZ3JvdW5kID0gdGhpcy5nZXRDb2xvcih0aGlzLmlzSW5hY3RpdmUgPyBUSVRMRV9CQVJfSU5BQ1RJVkVfRk9SRUdST1VORCA6IFRJVExFX0JBUl9BQ1RJVkVfRk9SRUdST1VORCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY29sb3IgPSB0aXRsZUZvcmVncm91bmQgfHwgJyc7XG5cblx0XHRcdGNvbnN0IHRpdGxlQm9yZGVyID0gIXRoaXMuaXNBdXhpbGlhcnkgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpID09PSB0cnVlID8gdW5kZWZpbmVkIDogdGhpcy5nZXRDb2xvcihUSVRMRV9CQVJfQk9SREVSKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b20gPSB0aXRsZUJvcmRlciA/IGAxcHggc29saWQgJHt0aXRsZUJvcmRlcn1gIDogJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uQ29udGV4dE1lbnUoZTogTW91c2VFdmVudCwgbWVudUlkOiBNZW51SWQpOiB2b2lkIHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuZWxlbWVudCksIGUpO1xuXG5cdFx0Ly8gU2hvdyBpdFxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0bWVudUlkLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRkb21Gb3JTaGFkb3dSb290OiBpc01hY2ludG9zaCAmJiBpc05hdGl2ZSA/IGV2ZW50LnRhcmdldCA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCBjdXJyZW50TWVudWJhclZpc2liaWxpdHkoKTogTWVudUJhclZpc2liaWxpdHkge1xuXHRcdGlmICh0aGlzLmlzQXV4aWxpYXJ5KSB7XG5cdFx0XHRyZXR1cm4gJ2hpZGRlbic7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdldE1lbnVCYXJWaXNpYmlsaXR5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbGF5b3V0Q29udHJvbEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuTEFZT1VUX0FDVElPTlMpICE9PSBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgaXNDb21tYW5kQ2VudGVyVmlzaWJsZSgpIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNDb21wYWN0ICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpICE9PSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGVkaXRvckFjdGlvbnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIucGFydE9wdGlvbnMuZWRpdG9yQWN0aW9uc0xvY2F0aW9uID09PSBFZGl0b3JBY3Rpb25zTG9jYXRpb24uVElUTEVCQVIgfHxcblx0XHRcdChcblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIucGFydE9wdGlvbnMuZWRpdG9yQWN0aW9uc0xvY2F0aW9uID09PSBFZGl0b3JBY3Rpb25zTG9jYXRpb24uREVGQVVMVCAmJlxuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5wYXJ0T3B0aW9ucy5zaG93VGFicyA9PT0gRWRpdG9yVGFic01vZGUuTk9ORVxuXHRcdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBhY3Rpdml0eUFjdGlvbnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyUG9zaXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFjdGl2aXR5QmFyUG9zaXRpb24+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTik7XG5cdFx0cmV0dXJuICF0aGlzLmlzQ29tcGFjdCAmJiAhdGhpcy5pc0F1eGlsaWFyeSAmJiAoYWN0aXZpdHlCYXJQb3NpdGlvbiA9PT0gQWN0aXZpdHlCYXJQb3NpdGlvbi5UT1AgfHwgYWN0aXZpdHlCYXJQb3NpdGlvbiA9PT0gQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT00pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZ2xvYmFsQWN0aW9uc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmlzQ29tcGFjdDtcblx0fVxuXG5cdGdldCBoYXNab29tYWJsZUVsZW1lbnRzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGhhc01lbnViYXIgPSAhKHRoaXMuY3VycmVudE1lbnViYXJWaXNpYmlsaXR5ID09PSAnaGlkZGVuJyB8fCB0aGlzLmN1cnJlbnRNZW51YmFyVmlzaWJpbGl0eSA9PT0gJ2NvbXBhY3QnIHx8ICghaXNXZWIgJiYgaXNNYWNpbnRvc2gpKTtcblx0XHRjb25zdCBoYXNDb21tYW5kQ2VudGVyID0gdGhpcy5pc0NvbW1hbmRDZW50ZXJWaXNpYmxlO1xuXHRcdGNvbnN0IGhhc1Rvb2xCYXJBY3Rpb25zID0gdGhpcy5nbG9iYWxBY3Rpb25zRW5hYmxlZCB8fCB0aGlzLmxheW91dENvbnRyb2xFbmFibGVkIHx8IHRoaXMuZWRpdG9yQWN0aW9uc0VuYWJsZWQgfHwgdGhpcy5hY3Rpdml0eUFjdGlvbnNFbmFibGVkO1xuXHRcdHJldHVybiBoYXNNZW51YmFyIHx8IGhhc0NvbW1hbmRDZW50ZXIgfHwgaGFzVG9vbEJhckFjdGlvbnM7XG5cdH1cblxuXHRnZXQgcHJldmVudFpvb20oKTogYm9vbGVhbiB7XG5cdFx0Ly8gUHJldmVudCB6b29taW5nIGJlaGF2aW9yIGlmIGFueSBvZiB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblx0XHQvLyAxLiBTaHJpbmtpbmcgYmVsb3cgdGhlIHdpbmRvdyBjb250cm9sIHNpemUgKHpvb20gPCAxKVxuXHRcdC8vIDIuIE5vIGN1c3RvbSBpdGVtcyBhcmUgcHJlc2VudCBpbiB0aGUgdGl0bGUgYmFyXG5cblx0XHRyZXR1cm4gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgPCAxIHx8ICF0aGlzLmhhc1pvb21hYmxlRWxlbWVudHM7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZUxheW91dChuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpKTtcblxuXHRcdHN1cGVyLmxheW91dENvbnRlbnRzKHdpZHRoLCBoZWlnaHQpO1xuXG5cdFx0Ly8gUnVuIGFmdGVyIGBsYXlvdXRDb250ZW50c2Agc28gdGhlIHRpdGxlIGJhciByZWZsZWN0cyBpdHMgbmV3IHdpZHRoIHdoZW4gbWVhc3VyaW5nIG92ZXJmbG93LlxuXHRcdHRoaXMudXBkYXRlVGl0bGVCYXJUb29sQmFyT3ZlcmZsb3coKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlcyBvcHRpb25hbCB0aXRsZSBiYXIgdG9vbGJhcnMgd2hlbiBzaG93aW5nIHRoZW0gd291bGQgcHVzaCB0aGUgdHJhaWxpbmcgd2luZG93IGNvbnRyb2xzIG9mZi1zY3JlZW4gKCMzMDMyMjIpLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVUaXRsZUJhclRvb2xCYXJPdmVyZmxvdygpOiB2b2lkIHtcblx0XHRjb25zdCBjZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50ID0gdGhpcy5jZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1uby1hY3Rpb25zJykgPyB1bmRlZmluZWQgOiB0aGlzLmNlbnRlckFkamFjZW50VG9vbEJhckVsZW1lbnQ7XG5cdFx0Y29uc3QgdXBkYXRlVG9vbEJhckVsZW1lbnQgPSB0aGlzLnVwZGF0ZVRvb2xCYXJFbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1uby1hY3Rpb25zJykgPyB1bmRlZmluZWQgOiB0aGlzLnVwZGF0ZVRvb2xCYXJFbGVtZW50O1xuXG5cdFx0dGhpcy5jZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKCdvdmVyZmxvd2luZycpO1xuXHRcdHRoaXMudXBkYXRlVG9vbEJhckVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ292ZXJmbG93aW5nJyk7XG5cblx0XHRpZiAodGhpcy5yb290Q29udGFpbmVyLnNjcm9sbFdpZHRoIDw9IHRoaXMucm9vdENvbnRhaW5lci5jbGllbnRXaWR0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNlbnRlckFkamFjZW50VG9vbEJhckVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ292ZXJmbG93aW5nJyk7XG5cdFx0aWYgKHRoaXMucm9vdENvbnRhaW5lci5zY3JvbGxXaWR0aCA+IHRoaXMucm9vdENvbnRhaW5lci5jbGllbnRXaWR0aCkge1xuXHRcdFx0dXBkYXRlVG9vbEJhckVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ292ZXJmbG93aW5nJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmxhc3RMYXlvdXREaW1lbnNpb25zID0gZGltZW5zaW9uO1xuXG5cdFx0aWYgKCFoYXNDdXN0b21UaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgem9vbUZhY3RvciA9IGdldFpvb21GYWN0b3IoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpO1xuXG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXpvb20tZmFjdG9yJywgem9vbUZhY3Rvci50b1N0cmluZygpKTtcblx0XHR0aGlzLnJvb3RDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY291bnRlci16b29tJywgdGhpcy5wcmV2ZW50Wm9vbSk7XG5cblx0XHRpZiAodGhpcy5jdXN0b21NZW51YmFyLnZhbHVlKSB7XG5cdFx0XHRjb25zdCBtZW51YmFyRGltZW5zaW9uID0gbmV3IERpbWVuc2lvbigwLCBkaW1lbnNpb24uaGVpZ2h0KTtcblx0XHRcdHRoaXMuY3VzdG9tTWVudWJhci52YWx1ZS5sYXlvdXQobWVudWJhckRpbWVuc2lvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQ2VudGVyID0gdGhpcy5pc0NvbW1hbmRDZW50ZXJWaXNpYmxlIHx8IHRoaXMudGl0bGUudGV4dENvbnRlbnQgIT09ICcnO1xuXHRcdHRoaXMucm9vdENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtY2VudGVyJywgaGFzQ2VudGVyKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1c3RvbU1lbnViYXIudmFsdWUpIHtcblx0XHRcdHRoaXMuY3VzdG9tTWVudWJhci52YWx1ZS50b2dnbGVGb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdCh0aGlzLmVsZW1lbnQucXVlcnlTZWxlY3RvcignW3RhYmluZGV4XTpub3QoW3RhYmluZGV4PVwiLTFcIl0pJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsKT8uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogUGFydHMuVElUTEVCQVJfUEFSVFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYWluQnJvd3NlclRpdGxlYmFyUGFydCBleHRlbmRzIEJyb3dzZXJUaXRsZWJhclBhcnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihQYXJ0cy5USVRMRUJBUl9QQVJULCBtYWluV2luZG93LCBlZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBob3N0U2VydmljZSwgZWRpdG9yU2VydmljZSwgbWVudVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBhY3Rpb25WaWV3SXRlbVNlcnZpY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCBleHRlbmRzIElUaXRsZWJhclBhcnQsIElWaWV3IHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiB7IGNvbXBhY3Q6IGJvb2xlYW4gfSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBBdXhpbGlhcnlCcm93c2VyVGl0bGViYXJQYXJ0IGV4dGVuZHMgQnJvd3NlclRpdGxlYmFyUGFydCBpbXBsZW1lbnRzIElBdXhpbGlhcnlUaXRsZWJhclBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIENPVU5URVIgPSAxO1xuXG5cdGdldCBoZWlnaHQoKSB7IHJldHVybiB0aGlzLm1pbmltdW1IZWlnaHQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGVkaXRvckdyb3Vwc0NvbnRhaW5lcjogSUVkaXRvckdyb3Vwc0NvbnRhaW5lcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1haW5UaXRsZWJhcjogQnJvd3NlclRpdGxlYmFyUGFydCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgaWQgPSBBdXhpbGlhcnlCcm93c2VyVGl0bGViYXJQYXJ0LkNPVU5URVIrKztcblx0XHRzdXBlcihgd29ya2JlbmNoLnBhcnRzLmF1eGlsaWFyeVRpdGxlLiR7aWR9YCwgZ2V0V2luZG93KGNvbnRhaW5lciksIGVkaXRvckdyb3Vwc0NvbnRhaW5lciwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBtZW51U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGFjdGlvblZpZXdJdGVtU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgcHJldmVudFpvb20oKTogYm9vbGVhbiB7XG5cblx0XHQvLyBQcmV2ZW50IHpvb21pbmcgYmVoYXZpb3IgaWYgYW55IG9mIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXHRcdC8vIDEuIFNocmlua2luZyBiZWxvdyB0aGUgd2luZG93IGNvbnRyb2wgc2l6ZSAoem9vbSA8IDEpXG5cdFx0Ly8gMi4gTm8gY3VzdG9tIGl0ZW1zIGFyZSBwcmVzZW50IGluIHRoZSBtYWluIHRpdGxlIGJhclxuXHRcdC8vIFRoZSBhdXhpbGlhcnkgdGl0bGUgYmFyIG5ldmVyIGNvbnRhaW5zIGFueSB6b29tYWJsZSBpdGVtcyBpdHNlbGYsXG5cdFx0Ly8gYnV0IHdlIHdhbnQgdG8gbWF0Y2ggdGhlIGJlaGF2aW9yIG9mIHRoZSBtYWluIHRpdGxlIGJhci5cblxuXHRcdHJldHVybiBnZXRab29tRmFjdG9yKGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKSA8IDEgfHwgIXRoaXMubWFpblRpdGxlYmFyLmhhc1pvb21hYmxlRWxlbWVudHM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0IsWUFBWTtBQUV2QyxTQUFTLHdCQUF3QixlQUFlLG9CQUFvQjtBQUNwRSxTQUE0QixrQkFBa0Isc0JBQXNCLG1CQUFtQixtQkFBbUIsZ0NBQWdDLHdCQUF3QixxQkFBb0MsY0FBYyxxQkFBcUI7QUFDek8sU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBd0Q7QUFDakUsU0FBUyxpQkFBOEIseUJBQXlCO0FBQ2hFLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCLDZCQUE2QiwrQkFBK0IsK0JBQStCLGtCQUFrQiw0QkFBNEI7QUFDL0ssU0FBUyxhQUFhLFdBQVcsU0FBUyxPQUFPLFVBQVUsc0JBQXNCO0FBQ2pGLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVcsYUFBYSxXQUFXLFFBQVEsR0FBRyx1QkFBdUIsU0FBUyxPQUFPLFdBQVcsYUFBYSxZQUFZLG1CQUFtQixxQkFBcUI7QUFDMUssU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsT0FBTyx5QkFBeUIscUJBQXFCLGdCQUFnQix1QkFBdUIsc0JBQXNCO0FBQzNILFNBQVMsc0JBQXNCLDhCQUE4QjtBQUM3RCxTQUFTLFNBQWdCLGNBQWMsUUFBUSx1QkFBdUI7QUFDdEUsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQWtCO0FBQzNCLFNB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
