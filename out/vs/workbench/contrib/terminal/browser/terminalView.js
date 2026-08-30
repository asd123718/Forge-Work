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
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import * as cssJs from "../../../../base/browser/cssValue.js";
import { Action } from "../../../../base/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { switchTerminalShowTabsTitle } from "./terminalActions.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from "./terminal.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from "../common/terminal.js";
import { TerminalSettingId, TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { ActionViewItem, SelectActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { asCssVariable, selectBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { SeparatorSelectOption } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { TerminalTabbedView } from "./terminalTabbedView.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { getColorForSeverity } from "./terminalStatusList.js";
import { getFlatContextMenuActions, MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { DisposableMap, DisposableStore, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { getColorClass, getUriClasses } from "./terminalIcon.js";
import { getTerminalActionBarArgs } from "./terminalMenus.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getInstanceHoverInfo } from "./terminalTooltip.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Event } from "../../../../base/common/event.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { InstanceContext, TerminalContextActionRunner } from "./terminalContextMenu.js";
import { MicrotaskDelay } from "../../../../base/common/symbols.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { hasKey } from "../../../../base/common/types.js";
let TerminalViewPane = class extends ViewPane {
  constructor(options, keybindingService, _contextKeyService, viewDescriptorService, _configurationService, contextMenuService, _instantiationService, _terminalService, _terminalConfigurationService, _terminalGroupService, themeService, hoverService, _notificationService, _keybindingService, openerService, _menuService, _terminalProfileService, _terminalProfileResolverService) {
    super(options, keybindingService, contextMenuService, _configurationService, _contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
    this._contextKeyService = _contextKeyService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._terminalService = _terminalService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalGroupService = _terminalGroupService;
    this._notificationService = _notificationService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._terminalProfileService = _terminalProfileService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._isInitialized = false;
    /**
     * Tracks an active promise of terminal creation requested by this component. This helps prevent
     * double creation for example when toggling a terminal's visibility and focusing it.
     */
    this._isTerminalBeingCreated = false;
    this._newDropdown = this._register(new MutableDisposable());
    this._disposableStore = this._register(new DisposableStore());
    this._actionDisposables = this._register(new DisposableMap());
    this._register(this._terminalService.onDidRegisterProcessSupport(() => {
      this._onDidChangeViewWelcomeState.fire();
    }));
    this._register(this._terminalService.onDidChangeInstances(() => {
      if (this._hasWelcomeScreen() && this._terminalGroupService.instances.length <= 1) {
        this._onDidChangeViewWelcomeState.fire();
      }
      if (!this._parentDomElement) {
        return;
      }
      if (!this._terminalTabbedView) {
        this._createTabsView();
      }
      this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
    }));
    this._dropdownMenu = this._register(this._menuService.createMenu(MenuId.TerminalNewDropdownContext, this._contextKeyService));
    this._singleTabMenu = this._register(this._menuService.createMenu(MenuId.TerminalTabContext, this._contextKeyService));
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles((profiles) => this._updateTabActionBar(profiles)));
    this._viewShowing = TerminalContextKeys.viewShowing.bindTo(this._contextKeyService);
    this._register(this.onDidChangeBodyVisibility((e) => {
      if (e) {
        this._terminalTabbedView?.rerenderTabs();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (this._parentDomElement && (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled) || e.affectsConfiguration(TerminalSettingId.ShellIntegrationEnabled))) {
        this._updateForShellIntegration(this._parentDomElement);
      }
    }));
    const shellIntegrationDisposable = this._register(new MutableDisposable());
    shellIntegrationDisposable.value = this._terminalService.onAnyInstanceAddedCapabilityType((c) => {
      if (c === TerminalCapability.CommandDetection && this._gutterDecorationsEnabled()) {
        this._parentDomElement?.classList.add("shell-integration");
        shellIntegrationDisposable.clear();
      }
    });
  }
  get terminalTabbedView() {
    return this._terminalTabbedView;
  }
  _updateForShellIntegration(container) {
    container.classList.toggle("shell-integration", this._gutterDecorationsEnabled());
  }
  _gutterDecorationsEnabled() {
    const decorationsEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
    return (decorationsEnabled === "both" || decorationsEnabled === "gutter") && this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled);
  }
  _initializeTerminal(checkRestoredTerminals) {
    if (this.isBodyVisible() && this._terminalService.isProcessSupportRegistered && this._terminalService.connectionState === TerminalConnectionState.Connected) {
      const wasInitialized = this._isInitialized;
      this._isInitialized = true;
      let hideOnStartup = "never";
      if (!wasInitialized) {
        hideOnStartup = this._configurationService.getValue(TerminalSettingId.HideOnStartup);
        if (hideOnStartup === "always") {
          this._terminalGroupService.hidePanel();
        }
      }
      let shouldCreate = this._terminalGroupService.groups.length === 0;
      if (checkRestoredTerminals) {
        shouldCreate &&= this._terminalService.restoredGroupCount === 0;
      }
      if (!shouldCreate) {
        return;
      }
      if (!wasInitialized) {
        switch (hideOnStartup) {
          case "never":
            this._isTerminalBeingCreated = true;
            this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
            break;
          case "whenEmpty":
            if (this._terminalService.restoredGroupCount === 0) {
              this._terminalGroupService.hidePanel();
            }
            break;
        }
        return;
      }
      if (!this._isTerminalBeingCreated) {
        this._isTerminalBeingCreated = true;
        this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  renderBody(container) {
    super.renderBody(container);
    if (!this._parentDomElement) {
      this._updateForShellIntegration(container);
    }
    this._parentDomElement = container;
    this._parentDomElement.classList.add("integrated-terminal");
    domStylesheetsJs.createStyleSheet(this._parentDomElement);
    this._instantiationService.createInstance(TerminalThemeIconStyle, this._parentDomElement);
    if (!this.shouldShowWelcome()) {
      this._createTabsView();
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration("editor.fontFamily")) {
        if (!this._terminalConfigurationService.configFontIsMonospace()) {
          const choices = [{
            label: nls.localize("terminal.useMonospace", "Use 'monospace'"),
            run: () => this.configurationService.updateValue(TerminalSettingId.FontFamily, "monospace")
          }];
          this._notificationService.prompt(Severity.Warning, nls.localize("terminal.monospaceOnly", "The terminal only supports monospace fonts. Be sure to restart VS Code if this is a newly installed font."), choices);
        }
      }
    }));
    this._register(this.onDidChangeBodyVisibility(async (visible) => {
      this._viewShowing.set(visible);
      if (visible) {
        if (this._hasWelcomeScreen()) {
          this._onDidChangeViewWelcomeState.fire();
        }
        this._initializeTerminal(false);
        this._terminalGroupService.showPanel(false);
      } else {
        for (const instance of this._terminalGroupService.instances) {
          instance.resetFocusContextKey();
        }
      }
      this._terminalGroupService.updateVisibility();
    }));
    this._register(this._terminalService.onDidChangeConnectionState(() => this._initializeTerminal(true)));
    this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
  }
  _createTabsView() {
    if (!this._parentDomElement) {
      return;
    }
    this._terminalTabbedView = this._register(this.instantiationService.createInstance(TerminalTabbedView, this._parentDomElement));
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this._terminalTabbedView?.layout(width, height);
  }
  createActionViewItem(action, options) {
    switch (action.id) {
      case TerminalCommandId.Split: {
        const that = this;
        const store = new DisposableStore();
        const panelOnlySplitAction = store.add(new class extends Action {
          constructor() {
            super(action.id, action.label, action.class, action.enabled);
            this.checked = action.checked;
            this.tooltip = action.tooltip;
          }
          async run() {
            const instance = that._terminalGroupService.activeInstance;
            if (instance) {
              const newInstance = await that._terminalService.createTerminal({ location: { parentTerminal: instance } });
              return newInstance?.focusWhenReady();
            }
            return;
          }
        }());
        const item = store.add(new ActionViewItem(action, panelOnlySplitAction, { ...options, icon: true, label: false, keybinding: this._getKeybindingLabel(action) }));
        this._actionDisposables.set(action.id, store);
        return item;
      }
      case TerminalCommandId.SwitchTerminal: {
        const item = this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
        this._actionDisposables.set(action.id, item);
        return item;
      }
      case TerminalCommandId.Focus: {
        if (action instanceof MenuItemAction) {
          const actions = getFlatContextMenuActions(this._singleTabMenu.getActions({ shouldForwardArgs: true }));
          const item = this._instantiationService.createInstance(SingleTerminalTabActionViewItem, action, actions);
          this._actionDisposables.set(action.id, item);
          return item;
        }
        break;
      }
      case TerminalCommandId.New: {
        if (action instanceof MenuItemAction) {
          this._disposableStore.clear();
          const actions = getTerminalActionBarArgs(TerminalLocation.Panel, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
          this._newDropdown.value = this._instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, {
            hoverDelegate: options.hoverDelegate,
            getKeyBinding: (action2) => this._keybindingService.lookupKeybinding(action2.id, this._contextKeyService)
          });
          this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
          return this._newDropdown.value;
        }
      }
    }
    return super.createActionViewItem(action, options);
  }
  _getDefaultProfileName() {
    let defaultProfileName;
    try {
      defaultProfileName = this._terminalProfileService.getDefaultProfileName();
    } catch (e) {
      defaultProfileName = this._terminalProfileResolverService.defaultProfileName;
    }
    return defaultProfileName;
  }
  _getKeybindingLabel(action) {
    return this._keybindingService.lookupKeybinding(action.id)?.getLabel() ?? void 0;
  }
  _updateTabActionBar(profiles) {
    this._disposableStore.clear();
    const actions = getTerminalActionBarArgs(TerminalLocation.Panel, profiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
    this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
  }
  focus() {
    super.focus();
    if (this._terminalService.connectionState === TerminalConnectionState.Connected) {
      if (this._terminalGroupService.instances.length === 0 && !this._isTerminalBeingCreated) {
        this._isTerminalBeingCreated = true;
        this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
      }
      this._terminalGroupService.showPanel(true);
      return;
    }
    const previousActiveElement = this.element.ownerDocument.activeElement;
    if (previousActiveElement) {
      const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
        if (previousActiveElement && dom.isActiveElement(previousActiveElement)) {
          this._terminalGroupService.showPanel(true);
        }
        this._store.delete(listener);
      }));
    }
  }
  _hasWelcomeScreen() {
    return !this._terminalService.isProcessSupportRegistered;
  }
  shouldShowWelcome() {
    return this._hasWelcomeScreen() && this._terminalService.instances.length === 0;
  }
};
TerminalViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITerminalService),
  __decorateParam(8, ITerminalConfigurationService),
  __decorateParam(9, ITerminalGroupService),
  __decorateParam(10, IThemeService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, IKeybindingService),
  __decorateParam(14, IOpenerService),
  __decorateParam(15, IMenuService),
  __decorateParam(16, ITerminalProfileService),
  __decorateParam(17, ITerminalProfileResolverService)
], TerminalViewPane);
let SwitchTerminalActionViewItem = class extends SelectActionViewItem {
  constructor(action, _terminalService, _terminalGroupService, contextViewService, terminalProfileService, configurationService) {
    super(null, action, getTerminalSelectOpenItems(_terminalService, _terminalGroupService), _terminalGroupService.activeGroupIndex, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("terminals", "Open Terminals."), optionsAsChildren: true, useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._register(_terminalService.onDidChangeInstances(() => this._updateItems(), this));
    this._register(_terminalService.onDidChangeActiveGroup(() => this._updateItems(), this));
    this._register(_terminalService.onDidChangeActiveInstance(() => this._updateItems(), this));
    this._register(_terminalService.onAnyInstanceTitleChange(() => this._updateItems(), this));
    this._register(_terminalGroupService.onDidChangeGroups(() => this._updateItems(), this));
    this._register(_terminalService.onDidChangeConnectionState(() => this._updateItems(), this));
    this._register(terminalProfileService.onDidChangeAvailableProfiles(() => this._updateItems(), this));
    this._register(_terminalService.onAnyInstancePrimaryStatusChange(() => this._updateItems(), this));
  }
  render(container) {
    super.render(container);
    container.classList.add("switch-terminal");
    container.style.borderColor = asCssVariable(selectBorder);
  }
  _updateItems() {
    const options = getTerminalSelectOpenItems(this._terminalService, this._terminalGroupService);
    this.setOptions(options, this._terminalGroupService.activeGroupIndex);
  }
};
SwitchTerminalActionViewItem = __decorateClass([
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalGroupService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, ITerminalProfileService),
  __decorateParam(5, IConfigurationService)
], SwitchTerminalActionViewItem);
function getTerminalSelectOpenItems(terminalService, terminalGroupService) {
  let items;
  if (terminalService.connectionState === TerminalConnectionState.Connected) {
    items = terminalGroupService.getGroupLabels().map((label) => {
      return { text: label };
    });
  } else {
    items = [{ text: nls.localize("terminalConnectingLabel", "Starting...") }];
  }
  items.push(SeparatorSelectOption);
  items.push({ text: switchTerminalShowTabsTitle });
  return items;
}
let SingleTerminalTabActionViewItem = class extends MenuEntryActionViewItem {
  constructor(action, _actions, keybindingService, notificationService, contextKeyService, themeService, _terminalService, _terminaConfigurationService, _terminalGroupService, contextMenuService, _commandService, _instantiationService, _accessibilityService) {
    super(action, {
      draggable: true,
      hoverDelegate: _instantiationService.createInstance(SingleTabHoverDelegate)
    }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibilityService);
    this._actions = _actions;
    this._terminalService = _terminalService;
    this._terminaConfigurationService = _terminaConfigurationService;
    this._terminalGroupService = _terminalGroupService;
    this._commandService = _commandService;
    this._instantiationService = _instantiationService;
    this._elementDisposables = [];
    this._register(Event.debounce(Event.any(
      this._terminalService.onAnyInstancePrimaryStatusChange,
      this._terminalGroupService.onDidChangeActiveInstance,
      Event.map(this._terminalService.onAnyInstanceIconChange, (e) => e.instance),
      this._terminalService.onAnyInstanceTitleChange,
      this._terminalService.onDidChangeInstanceCapability
    ), (last, e) => {
      if (!last) {
        last = /* @__PURE__ */ new Set();
      }
      if (e) {
        last.add(e);
      }
      return last;
    }, MicrotaskDelay)((merged) => {
      for (const e of merged) {
        this.updateLabel(e);
      }
    }));
    this._register(toDisposable(() => dispose(this._elementDisposables)));
  }
  async onClick(event) {
    this._terminalGroupService.lastAccessedMenu = "inline-tab";
    if (event.altKey && this._menuItemAction.alt) {
      this._commandService.executeCommand(this._menuItemAction.alt.id, { location: TerminalLocation.Panel });
    } else {
      this._openContextMenu();
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  updateLabel(e) {
    if (e && e !== this._terminalGroupService.activeInstance) {
      return;
    }
    if (this._elementDisposables.length === 0 && this.element && this.label) {
      this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, (e2) => {
        if (e2.button === 2) {
          this._openContextMenu();
          e2.stopPropagation();
          e2.preventDefault();
        }
      }));
      this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e2) => {
        if (e2.button === 1) {
          const instance = this._terminalGroupService.activeInstance;
          if (instance) {
            this._terminalService.safeDisposeTerminal(instance);
          }
          e2.preventDefault();
        }
      }));
      this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.DRAG_START, (e2) => {
        const instance = this._terminalGroupService.activeInstance;
        if (e2.dataTransfer && instance) {
          e2.dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([instance.resource.toString()]));
        }
      }));
    }
    if (this.label) {
      const label = this.label;
      const instance = this._terminalGroupService.activeInstance;
      if (!instance) {
        dom.reset(label, "");
        return;
      }
      label.classList.add("single-terminal-tab");
      let colorStyle = "";
      const primaryStatus = instance.statusList.primary;
      if (primaryStatus) {
        const colorKey = getColorForSeverity(primaryStatus.severity);
        this._themeService.getColorTheme();
        const foundColor = this._themeService.getColorTheme().getColor(colorKey);
        if (foundColor) {
          colorStyle = foundColor.toString();
        }
      }
      label.style.color = colorStyle;
      dom.reset(label, ...renderLabelWithIcons(this._instantiationService.invokeFunction(getSingleTabLabel, instance, this._terminaConfigurationService.config.tabs.separator, ThemeIcon.isThemeIcon(this._commandAction.item.icon) ? this._commandAction.item.icon : void 0)));
      if (this._altCommand) {
        label.classList.remove(this._altCommand);
        this._altCommand = void 0;
      }
      if (this._color) {
        label.classList.remove(this._color);
        this._color = void 0;
      }
      if (this._class) {
        label.classList.remove(this._class);
        label.classList.remove("terminal-uri-icon");
        this._class = void 0;
      }
      const colorClass = getColorClass(instance);
      if (colorClass) {
        this._color = colorClass;
        label.classList.add(colorClass);
      }
      const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
      if (uriClasses) {
        this._class = uriClasses?.[0];
        label.classList.add(...uriClasses);
      }
      if (this._commandAction.item.icon) {
        this._altCommand = `alt-command`;
        label.classList.add(this._altCommand);
      }
      this.updateTooltip();
    }
  }
  _openContextMenu() {
    const actionRunner = new TerminalContextActionRunner();
    this._contextMenuService.showContextMenu({
      actionRunner,
      getAnchor: () => this.element,
      getActions: () => this._actions,
      // The context is always the active instance in the terminal view
      getActionsContext: () => {
        const instance = this._terminalGroupService.activeInstance;
        return instance ? [new InstanceContext(instance)] : [];
      },
      onHide: () => actionRunner.dispose()
    });
  }
};
SingleTerminalTabActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, ITerminalService),
  __decorateParam(7, ITerminalConfigurationService),
  __decorateParam(8, ITerminalGroupService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IAccessibilityService)
], SingleTerminalTabActionViewItem);
function getSingleTabLabel(accessor, instance, separator, icon) {
  if (!instance || !instance.title) {
    return "";
  }
  const iconId = ThemeIcon.isThemeIcon(instance.icon) ? instance.icon.id : accessor.get(ITerminalProfileResolverService).getDefaultIcon().id;
  const label = `$(${icon?.id || iconId}) ${getSingleTabTitle(instance, separator)}`;
  const primaryStatus = instance.statusList.primary;
  if (!primaryStatus?.icon) {
    return label;
  }
  return `${label} $(${primaryStatus.icon.id})`;
}
function getSingleTabTitle(instance, separator) {
  if (!instance) {
    return "";
  }
  return !instance.description ? instance.title : `${instance.title} ${separator} ${instance.description}`;
}
let TerminalThemeIconStyle = class extends Themable {
  constructor(container, _themeService, _terminalService, _terminalGroupService) {
    super(_themeService);
    this._themeService = _themeService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._registerListeners();
    this._styleElement = domStylesheetsJs.createStyleSheet(container);
    this._register(toDisposable(() => this._styleElement.remove()));
    this.updateStyles();
  }
  _registerListeners() {
    this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
    this._register(this._terminalService.onDidChangeInstances(() => this.updateStyles()));
    this._register(this._terminalGroupService.onDidChangeGroups(() => this.updateStyles()));
  }
  updateStyles() {
    super.updateStyles();
    const colorTheme = this._themeService.getColorTheme();
    let css = "";
    for (const instance of this._terminalService.instances) {
      const icon = instance.icon;
      if (!icon) {
        continue;
      }
      let uri = void 0;
      if (icon instanceof URI) {
        uri = icon;
      } else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
        uri = isDark(colorTheme.type) ? icon.dark : icon.light;
      }
      const iconClasses = getUriClasses(instance, colorTheme.type);
      if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
        css += `.monaco-workbench .${iconClasses[0]} .monaco-highlighted-label .codicon, .monaco-action-bar .terminal-uri-icon.single-terminal-tab.action-label:not(.alt-command) .codicon{background-image: ${cssJs.asCSSUrl(uri)};}`;
      }
    }
    for (const instance of this._terminalService.instances) {
      const colorClass = getColorClass(instance);
      if (!colorClass || !instance.color) {
        continue;
      }
      const color = colorTheme.getColor(instance.color);
      if (color) {
        css += `.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon):not(.codicon-rerun-task){ color: ${color} !important; }`;
      }
    }
    this._styleElement.textContent = css;
  }
};
TerminalThemeIconStyle = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, ITerminalGroupService)
], TerminalThemeIconStyle);
let SingleTabHoverDelegate = class {
  constructor(_configurationService, _hoverService, _storageService, _terminalGroupService) {
    this._configurationService = _configurationService;
    this._hoverService = _hoverService;
    this._storageService = _storageService;
    this._terminalGroupService = _terminalGroupService;
    this._lastHoverHideTime = 0;
    this.placement = "element";
  }
  get delay() {
    return Date.now() - this._lastHoverHideTime < 200 ? 0 : this._configurationService.getValue("workbench.hover.delay");
  }
  showHover(options, focus) {
    const instance = this._terminalGroupService.activeInstance;
    if (!instance) {
      return;
    }
    const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
    return this._hoverService.showInstantHover({
      ...options,
      content: hoverInfo.content,
      actions: hoverInfo.actions
    }, focus);
  }
  onDidHideHover() {
    this._lastHoverHideTime = Date.now();
  }
};
SingleTabHoverDelegate = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, ITerminalGroupService)
], SingleTabHoverDelegate);
export {
  TerminalViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzSnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCAqIGFzIGNzc0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHN3aXRjaFRlcm1pbmFsU2hvd1RhYnNUaXRsZSB9IGZyb20gJy4vdGVybWluYWxBY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMsIElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlLCBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZSwgVGVybWluYWxEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSwgSVZpZXdQYW5lT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsIFRlcm1pbmFsQ29tbWFuZElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU2V0dGluZ0lkLCBJVGVybWluYWxQcm9maWxlLCBUZXJtaW5hbExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucywgU2VsZWN0QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBzZWxlY3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSwgU2VwYXJhdG9yU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUYWJiZWRWaWV3IH0gZnJvbSAnLi90ZXJtaW5hbFRhYmJlZFZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGdldENvbG9yRm9yU2V2ZXJpdHkgfSBmcm9tICcuL3Rlcm1pbmFsU3RhdHVzTGlzdC5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zLCBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvZHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvckNsYXNzLCBnZXRVcmlDbGFzc2VzIH0gZnJvbSAnLi90ZXJtaW5hbEljb24uanMnO1xuaW1wb3J0IHsgZ2V0VGVybWluYWxBY3Rpb25CYXJBcmdzIH0gZnJvbSAnLi90ZXJtaW5hbE1lbnVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IGdldEluc3RhbmNlSG92ZXJJbmZvIH0gZnJvbSAnLi90ZXJtaW5hbFRvb2x0aXAuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlLCBJSG92ZXJEZWxlZ2F0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEluc3RhbmNlQ29udGV4dCwgVGVybWluYWxDb250ZXh0QWN0aW9uUnVubmVyIH0gZnJvbSAnLi90ZXJtaW5hbENvbnRleHRNZW51LmpzJztcbmltcG9ydCB7IE1pY3JvdGFza0RlbGF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGhhc05hdGl2ZUNvbnRleHRNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxWaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblx0cHJpdmF0ZSBfcGFyZW50RG9tRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Rlcm1pbmFsVGFiYmVkVmlldz86IFRlcm1pbmFsVGFiYmVkVmlldztcblx0Z2V0IHRlcm1pbmFsVGFiYmVkVmlldygpOiBUZXJtaW5hbFRhYmJlZFZpZXcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fdGVybWluYWxUYWJiZWRWaWV3OyB9XG5cdHByaXZhdGUgX2lzSW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0LyoqXG5cdCAqIFRyYWNrcyBhbiBhY3RpdmUgcHJvbWlzZSBvZiB0ZXJtaW5hbCBjcmVhdGlvbiByZXF1ZXN0ZWQgYnkgdGhpcyBjb21wb25lbnQuIFRoaXMgaGVscHMgcHJldmVudFxuXHQgKiBkb3VibGUgY3JlYXRpb24gZm9yIGV4YW1wbGUgd2hlbiB0b2dnbGluZyBhIHRlcm1pbmFsJ3MgdmlzaWJpbGl0eSBhbmQgZm9jdXNpbmcgaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1Rlcm1pbmFsQmVpbmdDcmVhdGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25ld0Ryb3Bkb3duOiBNdXRhYmxlRGlzcG9zYWJsZTxEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcm9wZG93bk1lbnU6IElNZW51O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaW5nbGVUYWJNZW51OiBJTWVudTtcblx0cHJpdmF0ZSBfdmlld1Nob3dpbmc6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZU1hcDxUZXJtaW5hbENvbW1hbmRJZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcCgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIF9jb25maWd1cmF0aW9uU2VydmljZSwgX2NvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIF9pbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZFJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZXMoKCkgPT4ge1xuXHRcdFx0Ly8gSWYgdGhlIGZpcnN0IHRlcm1pbmFsIGlzIG9wZW5lZCwgaGlkZSB0aGUgd2VsY29tZSB2aWV3XG5cdFx0XHQvLyBhbmQgaWYgdGhlIGxhc3Qgb25lIGlzIGNsb3NlZCwgc2hvdyBpdCBhZ2FpblxuXHRcdFx0aWYgKHRoaXMuX2hhc1dlbGNvbWVTY3JlZW4oKSAmJiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fcGFyZW50RG9tRWxlbWVudCkgeyByZXR1cm47IH1cblx0XHRcdC8vIElmIHdlIGRvIG5vdCBoYXZlIHRoZSB0YWIgdmlldyB5ZXQsIGNyZWF0ZSBpdCBub3cuXG5cdFx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsVGFiYmVkVmlldykge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVUYWJzVmlldygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXlvdXRCb2R5KHRoaXMuX3BhcmVudERvbUVsZW1lbnQub2Zmc2V0SGVpZ2h0LCB0aGlzLl9wYXJlbnREb21FbGVtZW50Lm9mZnNldFdpZHRoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZHJvcGRvd25NZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuVGVybWluYWxOZXdEcm9wZG93bkNvbnRleHQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fc2luZ2xlVGFiTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLlRlcm1pbmFsVGFiQ29udGV4dCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMocHJvZmlsZXMgPT4gdGhpcy5fdXBkYXRlVGFiQWN0aW9uQmFyKHByb2ZpbGVzKSkpO1xuXHRcdHRoaXMuX3ZpZXdTaG93aW5nID0gVGVybWluYWxDb250ZXh0S2V5cy52aWV3U2hvd2luZy5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsVGFiYmVkVmlldz8ucmVyZW5kZXJUYWJzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmICh0aGlzLl9wYXJlbnREb21FbGVtZW50ICYmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25EZWNvcmF0aW9uc0VuYWJsZWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWQpKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVGb3JTaGVsbEludGVncmF0aW9uKHRoaXMuX3BhcmVudERvbUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBzaGVsbEludGVncmF0aW9uRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRzaGVsbEludGVncmF0aW9uRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlQWRkZWRDYXBhYmlsaXR5VHlwZShjID0+IHtcblx0XHRcdGlmIChjID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiAmJiB0aGlzLl9ndXR0ZXJEZWNvcmF0aW9uc0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9wYXJlbnREb21FbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdzaGVsbC1pbnRlZ3JhdGlvbicpO1xuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRm9yU2hlbGxJbnRlZ3JhdGlvbihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3NoZWxsLWludGVncmF0aW9uJywgdGhpcy5fZ3V0dGVyRGVjb3JhdGlvbnNFbmFibGVkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ3V0dGVyRGVjb3JhdGlvbnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25EZWNvcmF0aW9uc0VuYWJsZWQpO1xuXHRcdHJldHVybiAoZGVjb3JhdGlvbnNFbmFibGVkID09PSAnYm90aCcgfHwgZGVjb3JhdGlvbnNFbmFibGVkID09PSAnZ3V0dGVyJykgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdGlhbGl6ZVRlcm1pbmFsKGNoZWNrUmVzdG9yZWRUZXJtaW5hbHM6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkgJiYgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmlzUHJvY2Vzc1N1cHBvcnRSZWdpc3RlcmVkICYmIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jb25uZWN0aW9uU3RhdGUgPT09IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdFx0Y29uc3Qgd2FzSW5pdGlhbGl6ZWQgPSB0aGlzLl9pc0luaXRpYWxpemVkO1xuXHRcdFx0dGhpcy5faXNJbml0aWFsaXplZCA9IHRydWU7XG5cblx0XHRcdGxldCBoaWRlT25TdGFydHVwOiAnbmV2ZXInIHwgJ3doZW5FbXB0eScgfCAnYWx3YXlzJyA9ICduZXZlcic7XG5cdFx0XHRpZiAoIXdhc0luaXRpYWxpemVkKSB7XG5cdFx0XHRcdGhpZGVPblN0YXJ0dXAgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5IaWRlT25TdGFydHVwKTtcblx0XHRcdFx0aWYgKGhpZGVPblN0YXJ0dXAgPT09ICdhbHdheXMnKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaGlkZVBhbmVsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHNob3VsZENyZWF0ZSA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGggPT09IDA7XG5cdFx0XHQvLyBXaGVuIHRyaWdnZXJlZCBqdXN0IGFmdGVyIHJlY29ubmVjdGlvbiwgYWxzbyBjaGVjayB0aGVyZSBhcmUgbm8gZ3JvdXBzIHRoYXQgY291bGQgYmVcblx0XHRcdC8vIGdldHRpbmcgcmVzdG9yZWQgY3VycmVudGx5XG5cdFx0XHRpZiAoY2hlY2tSZXN0b3JlZFRlcm1pbmFscykge1xuXHRcdFx0XHRzaG91bGRDcmVhdGUgJiY9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZXN0b3JlZEdyb3VwQ291bnQgPT09IDA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNob3VsZENyZWF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXdhc0luaXRpYWxpemVkKSB7XG5cdFx0XHRcdHN3aXRjaCAoaGlkZU9uU3RhcnR1cCkge1xuXHRcdFx0XHRcdGNhc2UgJ25ldmVyJzpcblx0XHRcdFx0XHRcdHRoaXMuX2lzVGVybWluYWxCZWluZ0NyZWF0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24uUGFuZWwgfSkuZmluYWxseSgoKSA9PiB0aGlzLl9pc1Rlcm1pbmFsQmVpbmdDcmVhdGVkID0gZmFsc2UpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnd2hlbkVtcHR5Jzpcblx0XHRcdFx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbFNlcnZpY2UucmVzdG9yZWRHcm91cENvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmhpZGVQYW5lbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2lzVGVybWluYWxCZWluZ0NyZWF0ZWQpIHtcblx0XHRcdFx0dGhpcy5faXNUZXJtaW5hbEJlaW5nQ3JlYXRlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pLmZpbmFsbHkoKCkgPT4gdGhpcy5faXNUZXJtaW5hbEJlaW5nQ3JlYXRlZCA9IGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHRpZiAoIXRoaXMuX3BhcmVudERvbUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUZvclNoZWxsSW50ZWdyYXRpb24oY29udGFpbmVyKTtcblx0XHR9XG5cdFx0dGhpcy5fcGFyZW50RG9tRWxlbWVudCA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLl9wYXJlbnREb21FbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludGVncmF0ZWQtdGVybWluYWwnKTtcblx0XHRkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQodGhpcy5fcGFyZW50RG9tRWxlbWVudCk7XG5cdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxUaGVtZUljb25TdHlsZSwgdGhpcy5fcGFyZW50RG9tRWxlbWVudCk7XG5cblx0XHRpZiAoIXRoaXMuc2hvdWxkU2hvd1dlbGNvbWUoKSkge1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFic1ZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHkpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5mb250RmFtaWx5JykpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ0ZvbnRJc01vbm9zcGFjZSgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hvaWNlczogSVByb21wdENob2ljZVtdID0gW3tcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3Rlcm1pbmFsLnVzZU1vbm9zcGFjZScsIFwiVXNlICdtb25vc3BhY2UnXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHksICdtb25vc3BhY2UnKSxcblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLCBubHMubG9jYWxpemUoJ3Rlcm1pbmFsLm1vbm9zcGFjZU9ubHknLCBcIlRoZSB0ZXJtaW5hbCBvbmx5IHN1cHBvcnRzIG1vbm9zcGFjZSBmb250cy4gQmUgc3VyZSB0byByZXN0YXJ0IFZTIENvZGUgaWYgdGhpcyBpcyBhIG5ld2x5IGluc3RhbGxlZCBmb250LlwiKSwgY2hvaWNlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KGFzeW5jIHZpc2libGUgPT4ge1xuXHRcdFx0dGhpcy5fdmlld1Nob3dpbmcuc2V0KHZpc2libGUpO1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2hhc1dlbGNvbWVTY3JlZW4oKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faW5pdGlhbGl6ZVRlcm1pbmFsKGZhbHNlKTtcblx0XHRcdFx0Ly8gd2UgZG9uJ3Qga25vdyBoZXJlIHdoZXRoZXIgb3Igbm90IGl0IHNob3VsZCBiZSBmb2N1c2VkLCBzb1xuXHRcdFx0XHQvLyBkZWZlciBmb2N1c2luZyB0aGUgcGFuZWwgdG8gdGhlIGZvY3VzKCkgY2FsbFxuXHRcdFx0XHQvLyB0byBwcmV2ZW50IG92ZXJyaWRpbmcgcHJlc2VydmVGb2N1cyBmb3IgZXh0ZW5zaW9uc1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwoZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdFx0XHRpbnN0YW5jZS5yZXNldEZvY3VzQ29udGV4dEtleSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS51cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSgoKSA9PiB0aGlzLl9pbml0aWFsaXplVGVybWluYWwodHJ1ZSkpKTtcblx0XHR0aGlzLmxheW91dEJvZHkodGhpcy5fcGFyZW50RG9tRWxlbWVudC5vZmZzZXRIZWlnaHQsIHRoaXMuX3BhcmVudERvbUVsZW1lbnQub2Zmc2V0V2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGFic1ZpZXcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9wYXJlbnREb21FbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFsVGFiYmVkVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxUYWJiZWRWaWV3LCB0aGlzLl9wYXJlbnREb21FbGVtZW50KSk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl90ZXJtaW5hbFRhYmJlZFZpZXc/LmxheW91dCh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbjogQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChhY3Rpb24uaWQpIHtcblx0XHRcdGNhc2UgVGVybWluYWxDb21tYW5kSWQuU3BsaXQ6IHtcblx0XHRcdFx0Ly8gU3BsaXQgbmVlZHMgdG8gYmUgc3BlY2lhbCBjYXNlZCB0byBmb3JjZSBzcGxpdHRpbmcgd2l0aGluIHRoZSBwYW5lbCwgbm90IHRoZSBlZGl0b3Jcblx0XHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBwYW5lbE9ubHlTcGxpdEFjdGlvbiA9IHN0b3JlLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBBY3Rpb24ge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIoYWN0aW9uLmlkLCBhY3Rpb24ubGFiZWwsIGFjdGlvbi5jbGFzcywgYWN0aW9uLmVuYWJsZWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5jaGVja2VkID0gYWN0aW9uLmNoZWNrZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLnRvb2x0aXAgPSBhY3Rpb24udG9vbHRpcDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGF0Ll90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdFx0XHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuZXdJbnN0YW5jZSA9IGF3YWl0IHRoYXQuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHBhcmVudFRlcm1pbmFsOiBpbnN0YW5jZSB9IH0pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3SW5zdGFuY2U/LmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHN0b3JlLmFkZChuZXcgQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBwYW5lbE9ubHlTcGxpdEFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UsIGtleWJpbmRpbmc6IHRoaXMuX2dldEtleWJpbmRpbmdMYWJlbChhY3Rpb24pIH0pKTtcblx0XHRcdFx0dGhpcy5fYWN0aW9uRGlzcG9zYWJsZXMuc2V0KGFjdGlvbi5pZCwgc3RvcmUpO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVGVybWluYWxDb21tYW5kSWQuU3dpdGNoVGVybWluYWw6IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN3aXRjaFRlcm1pbmFsQWN0aW9uVmlld0l0ZW0sIGFjdGlvbik7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbkRpc3Bvc2FibGVzLnNldChhY3Rpb24uaWQsIGl0ZW0pO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVGVybWluYWxDb21tYW5kSWQuRm9jdXM6IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5fc2luZ2xlVGFiTWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW5nbGVUZXJtaW5hbFRhYkFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIGFjdGlvbnMpO1xuXHRcdFx0XHRcdHRoaXMuX2FjdGlvbkRpc3Bvc2FibGVzLnNldChhY3Rpb24uaWQsIGl0ZW0pO1xuXHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUZXJtaW5hbENvbW1hbmRJZC5OZXc6IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldFRlcm1pbmFsQWN0aW9uQmFyQXJncyhUZXJtaW5hbExvY2F0aW9uLlBhbmVsLCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzLCB0aGlzLl9nZXREZWZhdWx0UHJvZmlsZU5hbWUoKSwgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5jb250cmlidXRlZFByb2ZpbGVzLCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UsIHRoaXMuX2Ryb3Bkb3duTWVudSwgdGhpcy5fZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdFx0XHR0aGlzLl9uZXdEcm9wZG93bi52YWx1ZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBhY3Rpb25zLmRyb3Bkb3duQWN0aW9uLCBhY3Rpb25zLmRyb3Bkb3duTWVudUFjdGlvbnMsIGFjdGlvbnMuY2xhc3NOYW1lLCB7XG5cdFx0XHRcdFx0XHRob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHRcdFx0XHRnZXRLZXlCaW5kaW5nOiAoYWN0aW9uOiBJQWN0aW9uKSA9PiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fbmV3RHJvcGRvd24udmFsdWU/LnVwZGF0ZShhY3Rpb25zLmRyb3Bkb3duQWN0aW9uLCBhY3Rpb25zLmRyb3Bkb3duTWVudUFjdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9uZXdEcm9wZG93bi52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuY3JlYXRlQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlZmF1bHRQcm9maWxlTmFtZSgpOiBzdHJpbmcge1xuXHRcdGxldCBkZWZhdWx0UHJvZmlsZU5hbWU7XG5cdFx0dHJ5IHtcblx0XHRcdGRlZmF1bHRQcm9maWxlTmFtZSA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGVOYW1lKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZGVmYXVsdFByb2ZpbGVOYW1lID0gdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmRlZmF1bHRQcm9maWxlTmFtZTtcblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRQcm9maWxlTmFtZSE7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRLZXliaW5kaW5nTGFiZWwoYWN0aW9uOiBJQWN0aW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpPy5nZXRMYWJlbCgpID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRhYkFjdGlvbkJhcihwcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldFRlcm1pbmFsQWN0aW9uQmFyQXJncyhUZXJtaW5hbExvY2F0aW9uLlBhbmVsLCBwcm9maWxlcywgdGhpcy5fZ2V0RGVmYXVsdFByb2ZpbGVOYW1lKCksIHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgdGhpcy5fdGVybWluYWxTZXJ2aWNlLCB0aGlzLl9kcm9wZG93bk1lbnUsIHRoaXMuX2Rpc3Bvc2FibGVTdG9yZSk7XG5cdFx0dGhpcy5fbmV3RHJvcGRvd24udmFsdWU/LnVwZGF0ZShhY3Rpb25zLmRyb3Bkb3duQWN0aW9uLCBhY3Rpb25zLmRyb3Bkb3duTWVudUFjdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKSB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRpZiAodGhpcy5fdGVybWluYWxTZXJ2aWNlLmNvbm5lY3Rpb25TdGF0ZSA9PT0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCA9PT0gMCAmJiAhdGhpcy5faXNUZXJtaW5hbEJlaW5nQ3JlYXRlZCkge1xuXHRcdFx0XHR0aGlzLl9pc1Rlcm1pbmFsQmVpbmdDcmVhdGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24uUGFuZWwgfSkuZmluYWxseSgoKSA9PiB0aGlzLl9pc1Rlcm1pbmFsQmVpbmdDcmVhdGVkID0gZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB0ZXJtaW5hbCBpcyB3YWl0aW5nIHRvIHJlY29ubmVjdCB0byByZW1vdGUgdGVybWluYWxzLCB0aGVuIHRoZXJlIGlzIG5vIFRlcm1pbmFsSW5zdGFuY2UgeWV0IHRoYXQgY2FuXG5cdFx0Ly8gYmUgZm9jdXNlZC4gU28gd2FpdCBmb3IgY29ubmVjdGlvbiB0byBmaW5pc2gsIHRoZW4gZm9jdXMuXG5cdFx0Y29uc3QgcHJldmlvdXNBY3RpdmVFbGVtZW50ID0gdGhpcy5lbGVtZW50Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRpZiAocHJldmlvdXNBY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlKSgoKSA9PiB7XG5cdFx0XHRcdC8vIE9ubHkgZm9jdXMgdGhlIHRlcm1pbmFsIGlmIHRoZSBhY3RpdmVFbGVtZW50IGhhcyBub3QgY2hhbmdlZCBzaW5jZSBmb2N1cygpIHdhcyBjYWxsZWRcblx0XHRcdFx0aWYgKHByZXZpb3VzQWN0aXZlRWxlbWVudCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KHByZXZpb3VzQWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKGxpc3RlbmVyKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYXNXZWxjb21lU2NyZWVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fdGVybWluYWxTZXJ2aWNlLmlzUHJvY2Vzc1N1cHBvcnRSZWdpc3RlcmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkU2hvd1dlbGNvbWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhc1dlbGNvbWVTY3JlZW4oKSAmJiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCA9PT0gMDtcblx0fVxufVxuXG5jbGFzcyBTd2l0Y2hUZXJtaW5hbEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgU2VsZWN0QWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHRlcm1pbmFsUHJvZmlsZVNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBnZXRUZXJtaW5hbFNlbGVjdE9wZW5JdGVtcyhfdGVybWluYWxTZXJ2aWNlLCBfdGVybWluYWxHcm91cFNlcnZpY2UpLCBfdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXBJbmRleCwgY29udGV4dFZpZXdTZXJ2aWNlLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCB7IGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCd0ZXJtaW5hbHMnLCAnT3BlbiBUZXJtaW5hbHMuJyksIG9wdGlvbnNBc0NoaWxkcmVuOiB0cnVlLCB1c2VDdXN0b21EcmF3bjogIWhhc05hdGl2ZUNvbnRleHRNZW51KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHRoaXMuX3VwZGF0ZUl0ZW1zKCksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy5fdXBkYXRlSXRlbXMoKSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSgoKSA9PiB0aGlzLl91cGRhdGVJdGVtcygpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlVGl0bGVDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlSXRlbXMoKSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUdyb3VwcygoKSA9PiB0aGlzLl91cGRhdGVJdGVtcygpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSgoKSA9PiB0aGlzLl91cGRhdGVJdGVtcygpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVybWluYWxQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzKCgpID0+IHRoaXMuX3VwZGF0ZUl0ZW1zKCksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VQcmltYXJ5U3RhdHVzQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZUl0ZW1zKCksIHRoaXMpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N3aXRjaC10ZXJtaW5hbCcpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5ib3JkZXJDb2xvciA9IGFzQ3NzVmFyaWFibGUoc2VsZWN0Qm9yZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUl0ZW1zKCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBnZXRUZXJtaW5hbFNlbGVjdE9wZW5JdGVtcyh0aGlzLl90ZXJtaW5hbFNlcnZpY2UsIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlKTtcblx0XHR0aGlzLnNldE9wdGlvbnMob3B0aW9ucywgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXBJbmRleCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxTZWxlY3RPcGVuSXRlbXModGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLCB0ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlKTogSVNlbGVjdE9wdGlvbkl0ZW1bXSB7XG5cdGxldCBpdGVtczogSVNlbGVjdE9wdGlvbkl0ZW1bXTtcblx0aWYgKHRlcm1pbmFsU2VydmljZS5jb25uZWN0aW9uU3RhdGUgPT09IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdGl0ZW1zID0gdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBMYWJlbHMoKS5tYXAobGFiZWwgPT4ge1xuXHRcdFx0cmV0dXJuIHsgdGV4dDogbGFiZWwgfTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRpdGVtcyA9IFt7IHRleHQ6IG5scy5sb2NhbGl6ZSgndGVybWluYWxDb25uZWN0aW5nTGFiZWwnLCBcIlN0YXJ0aW5nLi4uXCIpIH1dO1xuXHR9XG5cdGl0ZW1zLnB1c2goU2VwYXJhdG9yU2VsZWN0T3B0aW9uKTtcblx0aXRlbXMucHVzaCh7IHRleHQ6IHN3aXRjaFRlcm1pbmFsU2hvd1RhYnNUaXRsZSB9KTtcblx0cmV0dXJuIGl0ZW1zO1xufVxuXG5jbGFzcyBTaW5nbGVUZXJtaW5hbFRhYkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIF9jb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hbHRDb21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NsYXNzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnREaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uczogSUFjdGlvbltdLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLCB7XG5cdFx0XHRkcmFnZ2FibGU6IHRydWUsXG5cdFx0XHRob3ZlckRlbGVnYXRlOiBfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlVGFiSG92ZXJEZWxlZ2F0ZSlcblx0XHR9LCBrZXliaW5kaW5nU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBfYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbGlzdGVuZXJzIHRvIHVwZGF0ZSB0aGUgdGFiXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsIFNldDxJVGVybWluYWxJbnN0YW5jZT4+KEV2ZW50LmFueShcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlUHJpbWFyeVN0YXR1c0NoYW5nZSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UsXG5cdFx0XHRFdmVudC5tYXAodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VJY29uQ2hhbmdlLCBlID0+IGUuaW5zdGFuY2UpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VUaXRsZUNoYW5nZSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSxcblx0XHQpLCAobGFzdCwgZSkgPT4ge1xuXHRcdFx0aWYgKCFsYXN0KSB7XG5cdFx0XHRcdGxhc3QgPSBuZXcgU2V0KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRsYXN0LmFkZChlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXN0O1xuXHRcdH0sIE1pY3JvdGFza0RlbGF5KShtZXJnZWQgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIG1lcmdlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUxhYmVsKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENsZWFuIHVwIG9uIGRpc3Bvc2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gZGlzcG9zZSh0aGlzLl9lbGVtZW50RGlzcG9zYWJsZXMpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBvbkNsaWNrKGV2ZW50OiBNb3VzZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UubGFzdEFjY2Vzc2VkTWVudSA9ICdpbmxpbmUtdGFiJztcblx0XHRpZiAoZXZlbnQuYWx0S2V5ICYmIHRoaXMuX21lbnVJdGVtQWN0aW9uLmFsdCkge1xuXHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodGhpcy5fbWVudUl0ZW1BY3Rpb24uYWx0LmlkLCB7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0gc2F0aXNmaWVzIElDcmVhdGVUZXJtaW5hbE9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vcGVuQ29udGV4dE1lbnUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbChlPzogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHQvLyBPbmx5IHVwZGF0ZSBpZiBpdCdzIHRoZSBhY3RpdmUgaW5zdGFuY2Vcblx0XHRpZiAoZSAmJiBlICE9PSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lbGVtZW50RGlzcG9zYWJsZXMubGVuZ3RoID09PSAwICYmIHRoaXMuZWxlbWVudCAmJiB0aGlzLmxhYmVsKSB7XG5cdFx0XHQvLyBSaWdodCBjbGljayBvcGVucyBjb250ZXh0IG1lbnVcblx0XHRcdHRoaXMuX2VsZW1lbnREaXNwb3NhYmxlcy5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMikge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5Db250ZXh0TWVudSgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHQvLyBNaWRkbGUgY2xpY2sga2lsbHNcblx0XHRcdHRoaXMuX2VsZW1lbnREaXNwb3NhYmxlcy5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkFVWENMSUNLLCBlID0+IHtcblx0XHRcdFx0aWYgKGUuYnV0dG9uID09PSAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zYWZlRGlzcG9zZVRlcm1pbmFsKGluc3RhbmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHQvLyBEcmFnIGFuZCBkcm9wXG5cdFx0XHR0aGlzLl9lbGVtZW50RGlzcG9zYWJsZXMucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5EUkFHX1NUQVJULCBlID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdFx0aWYgKGUuZGF0YVRyYW5zZmVyICYmIGluc3RhbmNlKSB7XG5cdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuc2V0RGF0YShUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzLCBKU09OLnN0cmluZ2lmeShbaW5zdGFuY2UucmVzb3VyY2UudG9TdHJpbmcoKV0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhYmVsO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdFx0ZG9tLnJlc2V0KGxhYmVsLCAnJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxhYmVsLmNsYXNzTGlzdC5hZGQoJ3NpbmdsZS10ZXJtaW5hbC10YWInKTtcblx0XHRcdGxldCBjb2xvclN0eWxlID0gJyc7XG5cdFx0XHRjb25zdCBwcmltYXJ5U3RhdHVzID0gaW5zdGFuY2Uuc3RhdHVzTGlzdC5wcmltYXJ5O1xuXHRcdFx0aWYgKHByaW1hcnlTdGF0dXMpIHtcblx0XHRcdFx0Y29uc3QgY29sb3JLZXkgPSBnZXRDb2xvckZvclNldmVyaXR5KHByaW1hcnlTdGF0dXMuc2V2ZXJpdHkpO1xuXHRcdFx0XHR0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdFx0XHRjb25zdCBmb3VuZENvbG9yID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihjb2xvcktleSk7XG5cdFx0XHRcdGlmIChmb3VuZENvbG9yKSB7XG5cdFx0XHRcdFx0Y29sb3JTdHlsZSA9IGZvdW5kQ29sb3IudG9TdHJpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bGFiZWwuc3R5bGUuY29sb3IgPSBjb2xvclN0eWxlO1xuXHRcdFx0ZG9tLnJlc2V0KGxhYmVsLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRTaW5nbGVUYWJMYWJlbCwgaW5zdGFuY2UsIHRoaXMuX3Rlcm1pbmFDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudGFicy5zZXBhcmF0b3IsIFRoZW1lSWNvbi5pc1RoZW1lSWNvbih0aGlzLl9jb21tYW5kQWN0aW9uLml0ZW0uaWNvbikgPyB0aGlzLl9jb21tYW5kQWN0aW9uLml0ZW0uaWNvbiA6IHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0aWYgKHRoaXMuX2FsdENvbW1hbmQpIHtcblx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9hbHRDb21tYW5kKTtcblx0XHRcdFx0dGhpcy5fYWx0Q29tbWFuZCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jb2xvcikge1xuXHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QucmVtb3ZlKHRoaXMuX2NvbG9yKTtcblx0XHRcdFx0dGhpcy5fY29sb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY2xhc3MpIHtcblx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9jbGFzcyk7XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ3Rlcm1pbmFsLXVyaS1pY29uJyk7XG5cdFx0XHRcdHRoaXMuX2NsYXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29sb3JDbGFzcyA9IGdldENvbG9yQ2xhc3MoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKGNvbG9yQ2xhc3MpIHtcblx0XHRcdFx0dGhpcy5fY29sb3IgPSBjb2xvckNsYXNzO1xuXHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QuYWRkKGNvbG9yQ2xhc3MpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXJpQ2xhc3NlcyA9IGdldFVyaUNsYXNzZXMoaW5zdGFuY2UsIHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSk7XG5cdFx0XHRpZiAodXJpQ2xhc3Nlcykge1xuXHRcdFx0XHR0aGlzLl9jbGFzcyA9IHVyaUNsYXNzZXM/LlswXTtcblx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LmFkZCguLi51cmlDbGFzc2VzKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jb21tYW5kQWN0aW9uLml0ZW0uaWNvbikge1xuXHRcdFx0XHR0aGlzLl9hbHRDb21tYW5kID0gYGFsdC1jb21tYW5kYDtcblx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LmFkZCh0aGlzLl9hbHRDb21tYW5kKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29wZW5Db250ZXh0TWVudSgpIHtcblx0XHRjb25zdCBhY3Rpb25SdW5uZXIgPSBuZXcgVGVybWluYWxDb250ZXh0QWN0aW9uUnVubmVyKCk7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuZWxlbWVudCEsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLl9hY3Rpb25zLFxuXHRcdFx0Ly8gVGhlIGNvbnRleHQgaXMgYWx3YXlzIHRoZSBhY3RpdmUgaW5zdGFuY2UgaW4gdGhlIHRlcm1pbmFsIHZpZXdcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdHJldHVybiBpbnN0YW5jZSA/IFtuZXcgSW5zdGFuY2VDb250ZXh0KGluc3RhbmNlKV0gOiBbXTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IGFjdGlvblJ1bm5lci5kaXNwb3NlKClcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTaW5nbGVUYWJMYWJlbChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCBzZXBhcmF0b3I6IHN0cmluZywgaWNvbj86IFRoZW1lSWNvbikge1xuXHQvLyBEb24ndCBldmVuIHNob3cgdGhlIGljb24gaWYgdGhlcmUgaXMgbm8gdGl0bGUgYXMgdGhlIGljb24gd291bGQgc2hpZnQgYXJvdW5kIHdoZW4gdGhlIHRpdGxlXG5cdC8vIGlzIGFkZGVkXG5cdGlmICghaW5zdGFuY2UgfHwgIWluc3RhbmNlLnRpdGxlKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IGljb25JZCA9IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpbnN0YW5jZS5pY29uKSA/IGluc3RhbmNlLmljb24uaWQgOiBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSkuZ2V0RGVmYXVsdEljb24oKS5pZDtcblx0Y29uc3QgbGFiZWwgPSBgJCgke2ljb24/LmlkIHx8IGljb25JZH0pICR7Z2V0U2luZ2xlVGFiVGl0bGUoaW5zdGFuY2UsIHNlcGFyYXRvcil9YDtcblxuXHRjb25zdCBwcmltYXJ5U3RhdHVzID0gaW5zdGFuY2Uuc3RhdHVzTGlzdC5wcmltYXJ5O1xuXHRpZiAoIXByaW1hcnlTdGF0dXM/Lmljb24pIHtcblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cblx0cmV0dXJuIGAke2xhYmVsfSAkKCR7cHJpbWFyeVN0YXR1cy5pY29uLmlkfSlgO1xufVxuXG5mdW5jdGlvbiBnZXRTaW5nbGVUYWJUaXRsZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsIHNlcGFyYXRvcjogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gIWluc3RhbmNlLmRlc2NyaXB0aW9uID8gaW5zdGFuY2UudGl0bGUgOiBgJHtpbnN0YW5jZS50aXRsZX0gJHtzZXBhcmF0b3J9ICR7aW5zdGFuY2UuZGVzY3JpcHRpb259YDtcbn1cblxuY2xhc3MgVGVybWluYWxUaGVtZUljb25TdHlsZSBleHRlbmRzIFRoZW1hYmxlIHtcblx0cHJpdmF0ZSBfc3R5bGVFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihfdGhlbWVTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldChjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9zdHlsZUVsZW1lbnQucmVtb3ZlKCkpKTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VJY29uQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlU3R5bGVzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZXMoKCkgPT4gdGhpcy51cGRhdGVTdHlsZXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlR3JvdXBzKCgpID0+IHRoaXMudXBkYXRlU3R5bGVzKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblx0XHRjb25zdCBjb2xvclRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblxuXHRcdC8vIFRPRE86IGFkZCBhIHJ1bGUgY29sbGVjdG9yIHRvIGF2b2lkIGR1cGxpY2F0aW9uXG5cdFx0bGV0IGNzcyA9ICcnO1xuXG5cdFx0Ly8gQWRkIGljb25zXG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBpY29uID0gaW5zdGFuY2UuaWNvbjtcblx0XHRcdGlmICghaWNvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCB1cmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaWNvbiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHR1cmkgPSBpY29uO1xuXHRcdFx0fSBlbHNlIGlmIChpY29uIGluc3RhbmNlb2YgT2JqZWN0ICYmIGhhc0tleShpY29uLCB7IGxpZ2h0OiB0cnVlLCBkYXJrOiB0cnVlIH0pKSB7XG5cdFx0XHRcdHVyaSA9IGlzRGFyayhjb2xvclRoZW1lLnR5cGUpID8gaWNvbi5kYXJrIDogaWNvbi5saWdodDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGljb25DbGFzc2VzID0gZ2V0VXJpQ2xhc3NlcyhpbnN0YW5jZSwgY29sb3JUaGVtZS50eXBlKTtcblx0XHRcdGlmICh1cmkgaW5zdGFuY2VvZiBVUkkgJiYgaWNvbkNsYXNzZXMgJiYgaWNvbkNsYXNzZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjc3MgKz0gKFxuXHRcdFx0XHRcdGAubW9uYWNvLXdvcmtiZW5jaCAuJHtpY29uQ2xhc3Nlc1swXX0gLm1vbmFjby1oaWdobGlnaHRlZC1sYWJlbCAuY29kaWNvbiwgLm1vbmFjby1hY3Rpb24tYmFyIC50ZXJtaW5hbC11cmktaWNvbi5zaW5nbGUtdGVybWluYWwtdGFiLmFjdGlvbi1sYWJlbDpub3QoLmFsdC1jb21tYW5kKSAuY29kaWNvbmAgK1xuXHRcdFx0XHRcdGB7YmFja2dyb3VuZC1pbWFnZTogJHtjc3NKcy5hc0NTU1VybCh1cmkpfTt9YFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBjb2xvcnNcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGNvbG9yQ2xhc3MgPSBnZXRDb2xvckNsYXNzKGluc3RhbmNlKTtcblx0XHRcdGlmICghY29sb3JDbGFzcyB8fCAhaW5zdGFuY2UuY29sb3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb2xvciA9IGNvbG9yVGhlbWUuZ2V0Q29sb3IoaW5zdGFuY2UuY29sb3IpO1xuXHRcdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRcdC8vIGV4Y2x1ZGUgc3RhdHVzIGljb25zIChmaWxlLWljb24pIGFuZCBpbmxpbmUgYWN0aW9uIGljb25zICh0cmFzaGNhbiwgaG9yaXpvbnRhbFNwbGl0LCByZXJ1blRhc2spXG5cdFx0XHRcdGNzcyArPSAoXG5cdFx0XHRcdFx0YC5tb25hY28td29ya2JlbmNoIC4ke2NvbG9yQ2xhc3N9IC5jb2RpY29uOmZpcnN0LWNoaWxkOm5vdCguY29kaWNvbi1zcGxpdC1ob3Jpem9udGFsKTpub3QoLmNvZGljb24tdHJhc2hjYW4pOm5vdCguZmlsZS1pY29uKTpub3QoLmNvZGljb24tcmVydW4tdGFzaylgICtcblx0XHRcdFx0XHRgeyBjb2xvcjogJHtjb2xvcn0gIWltcG9ydGFudDsgfWBcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBjc3M7XG5cdH1cbn1cblxuY2xhc3MgU2luZ2xlVGFiSG92ZXJEZWxlZ2F0ZSBpbXBsZW1lbnRzIElIb3ZlckRlbGVnYXRlIHtcblx0cHJpdmF0ZSBfbGFzdEhvdmVySGlkZVRpbWU6IG51bWJlciA9IDA7XG5cblx0cmVhZG9ubHkgcGxhY2VtZW50ID0gJ2VsZW1lbnQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRnZXQgZGVsYXkoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMuX2xhc3RIb3ZlckhpZGVUaW1lIDwgMjAwXG5cdFx0XHQ/IDAgIC8vIHNob3cgaW5zdGFudGx5IHdoZW4gYSBob3ZlciB3YXMgcmVjZW50bHkgc2hvd25cblx0XHRcdDogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignd29ya2JlbmNoLmhvdmVyLmRlbGF5Jyk7XG5cdH1cblxuXHRzaG93SG92ZXIob3B0aW9uczogSUhvdmVyRGVsZWdhdGVPcHRpb25zLCBmb2N1cz86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaG92ZXJJbmZvID0gZ2V0SW5zdGFuY2VIb3ZlckluZm8oaW5zdGFuY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHRyZXR1cm4gdGhpcy5faG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGhvdmVySW5mby5jb250ZW50LFxuXHRcdFx0YWN0aW9uczogaG92ZXJJbmZvLmFjdGlvbnNcblx0XHR9LCBmb2N1cyk7XG5cdH1cblxuXHRvbkRpZEhpZGVIb3ZlcigpIHtcblx0XHR0aGlzLl9sYXN0SG92ZXJIaWRlVGltZSA9IERhdGUubm93KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixZQUFZLHNCQUFzQjtBQUNsQyxZQUFZLFdBQVc7QUFDdkIsU0FBUyxjQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNCQUFxQyxnQkFBZ0I7QUFDOUQsU0FBaUMsK0JBQStCLHVCQUEwQyxrQkFBa0IseUJBQXlCLDZCQUE2QjtBQUNsTCxTQUFTLGdCQUFrQztBQUMzQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBZ0IsY0FBYyxRQUFRLHNCQUFzQjtBQUM1RCxTQUFTLGlDQUFpQyx5QkFBeUIseUJBQXlCO0FBQzVGLFNBQVMsbUJBQXFDLHdCQUF3QjtBQUN0RSxTQUFTLGdCQUE0Qyw0QkFBNEI7QUFDakYsU0FBUyxlQUFlLG9CQUFvQjtBQUM1QyxTQUE0Qiw2QkFBNkI7QUFFekQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkIsK0JBQStCO0FBQ25FLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsZUFBZSxpQkFBaUIsU0FBc0IsbUJBQW1CLG9CQUFvQjtBQUN0RyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZSxxQkFBcUI7QUFDN0MsU0FB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
