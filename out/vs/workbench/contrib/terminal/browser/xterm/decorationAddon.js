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
import { Separator } from "../../../../../base/common/actions.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, dispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { CommandInvalidationReason, TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { terminalDecorationMark } from "../terminalIcons.js";
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalDecorationHoverContent, updateLayout } from "./decorationStyles.js";
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR } from "../../common/terminalColorRegistry.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { IChatContextPickService } from "../../../chat/browser/attachments/chatContextPickService.js";
import { IChatWidgetService } from "../../../chat/browser/chat.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { TerminalContext } from "../../../chat/browser/actions/chatContext.js";
import { getTerminalUri, parseTerminalUri } from "../terminalUri.js";
import { ChatAgentLocation } from "../../../chat/common/constants.js";
import { isString } from "../../../../../base/common/types.js";
let DecorationAddon = class extends Disposable {
  constructor(_resource, _capabilities, _clipboardService, _contextMenuService, _configurationService, _themeService, _openerService, _quickInputService, lifecycleService, _commandService, _accessibilitySignalService, _notificationService, _hoverService, _contextPickService, _chatWidgetService, _instantiationService) {
    super();
    this._resource = _resource;
    this._capabilities = _capabilities;
    this._clipboardService = _clipboardService;
    this._contextMenuService = _contextMenuService;
    this._configurationService = _configurationService;
    this._themeService = _themeService;
    this._openerService = _openerService;
    this._quickInputService = _quickInputService;
    this._commandService = _commandService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._notificationService = _notificationService;
    this._hoverService = _hoverService;
    this._contextPickService = _contextPickService;
    this._chatWidgetService = _chatWidgetService;
    this._instantiationService = _instantiationService;
    this._capabilityDisposables = this._register(new DisposableMap());
    this._decorations = /* @__PURE__ */ new Map();
    this._registeredMenuItems = /* @__PURE__ */ new Map();
    this._onDidRequestRunCommand = this._register(new Emitter());
    this.onDidRequestRunCommand = this._onDidRequestRunCommand.event;
    this._onDidRequestCopyAsHtml = this._register(new Emitter());
    this.onDidRequestCopyAsHtml = this._onDidRequestCopyAsHtml.event;
    this._register(toDisposable(() => this._dispose()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight)) {
        this.refreshLayouts();
      } else if (e.affectsConfiguration("workbench.colorCustomizations")) {
        this._refreshStyles(true);
      } else if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled)) {
        this._removeCapabilityDisposables(TerminalCapability.CommandDetection);
        this._updateDecorationVisibility();
      }
    }));
    this._register(this._themeService.onDidColorThemeChange(() => this._refreshStyles(true)));
    this._updateDecorationVisibility();
    this._register(this._capabilities.onDidAddCapability((c) => this._createCapabilityDisposables(c.id)));
    this._register(this._capabilities.onDidRemoveCapability((c) => this._removeCapabilityDisposables(c.id)));
    this._register(lifecycleService.onWillShutdown(() => this._disposeAllDecorations()));
  }
  _createCapabilityDisposables(c) {
    const capability = this._capabilities.get(c);
    if (!capability || this._capabilityDisposables.has(c)) {
      return;
    }
    const store = new DisposableStore();
    switch (capability.type) {
      case TerminalCapability.BufferMarkDetection:
        store.add(capability.onMarkAdded((mark) => this.registerMarkDecoration(mark)));
        break;
      case TerminalCapability.CommandDetection: {
        const disposables = this._getCommandDetectionListeners(capability);
        for (const d of disposables) {
          store.add(d);
        }
        break;
      }
    }
    this._capabilityDisposables.set(c, store);
  }
  _removeCapabilityDisposables(c) {
    this._capabilityDisposables.deleteAndDispose(c);
  }
  registerMarkDecoration(mark) {
    if (!this._terminal || !this._showGutterDecorations && !this._showOverviewRulerDecorations) {
      return void 0;
    }
    if (mark.hidden) {
      return void 0;
    }
    return this.registerCommandDecoration(void 0, void 0, mark);
  }
  _updateDecorationVisibility() {
    const showDecorations = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
    this._showGutterDecorations = showDecorations === "both" || showDecorations === "gutter";
    this._showOverviewRulerDecorations = showDecorations === "both" || showDecorations === "overviewRuler";
    this._disposeAllDecorations();
    if (this._showGutterDecorations || this._showOverviewRulerDecorations) {
      this._attachToCommandCapability();
      this._updateGutterDecorationVisibility();
    }
    const currentCommand = this._capabilities.get(TerminalCapability.CommandDetection)?.executingCommandObject;
    if (currentCommand) {
      this.registerCommandDecoration(currentCommand, true);
    }
  }
  _disposeAllDecorations() {
    this._placeholderDecoration?.dispose();
    for (const value of this._decorations.values()) {
      value.decoration.dispose();
      dispose(value.disposables);
    }
  }
  _updateGutterDecorationVisibility() {
    const commandDecorationElements = this._terminal?.element?.querySelectorAll(DecorationSelector.CommandDecoration);
    if (commandDecorationElements) {
      for (const commandDecorationElement of commandDecorationElements) {
        this._updateCommandDecorationVisibility(commandDecorationElement);
      }
    }
  }
  _updateCommandDecorationVisibility(commandDecorationElement) {
    if (this._showGutterDecorations) {
      commandDecorationElement.classList.remove(DecorationSelector.Hide);
    } else {
      commandDecorationElement.classList.add(DecorationSelector.Hide);
    }
  }
  refreshLayouts() {
    updateLayout(this._configurationService, this._placeholderDecoration?.element);
    for (const decoration of this._decorations) {
      updateLayout(this._configurationService, decoration[1].decoration.element);
    }
  }
  _refreshStyles(refreshOverviewRulerColors) {
    if (refreshOverviewRulerColors) {
      for (const decoration of this._decorations.values()) {
        const color = this._getDecorationCssColor(decoration.command)?.toString() ?? "";
        if (decoration.decoration.options?.overviewRulerOptions) {
          decoration.decoration.options.overviewRulerOptions.color = color;
        } else if (decoration.decoration.options) {
          decoration.decoration.options.overviewRulerOptions = { color };
        }
      }
    }
    this._updateClasses(this._placeholderDecoration?.element);
    for (const decoration of this._decorations.values()) {
      this._updateClasses(decoration.decoration.element, decoration.command, decoration.markProperties);
    }
  }
  _dispose() {
    for (const disposable of this._capabilityDisposables.values()) {
      dispose(disposable);
    }
    this.clearDecorations();
  }
  _clearPlaceholder() {
    this._placeholderDecoration?.dispose();
    this._placeholderDecoration = void 0;
  }
  clearDecorations() {
    this._placeholderDecoration?.marker.dispose();
    this._clearPlaceholder();
    this._disposeAllDecorations();
    this._decorations.clear();
  }
  _attachToCommandCapability() {
    if (this._capabilities.has(TerminalCapability.CommandDetection)) {
      const capability = this._capabilities.get(TerminalCapability.CommandDetection);
      const disposables = this._getCommandDetectionListeners(capability);
      const store = new DisposableStore();
      for (const d of disposables) {
        store.add(d);
      }
      this._capabilityDisposables.set(TerminalCapability.CommandDetection, store);
    }
  }
  _getCommandDetectionListeners(capability) {
    this._removeCapabilityDisposables(TerminalCapability.CommandDetection);
    const commandDetectionListeners = [];
    if (capability.executingCommandObject?.marker) {
      this.registerCommandDecoration(capability.executingCommandObject, true);
    }
    commandDetectionListeners.push(capability.onCommandStarted((command) => this.registerCommandDecoration(command, true)));
    for (const command of capability.commands) {
      this.registerCommandDecoration(command);
    }
    commandDetectionListeners.push(capability.onCommandFinished((command) => {
      const buffer = this._terminal?.buffer?.active;
      const marker = command.promptStartMarker;
      const shouldRegisterDecoration = command.exitCode === void 0 || // Only register decoration if the cursor is at or below the promptStart marker.
      buffer && marker && buffer.baseY + buffer.cursorY >= marker.line;
      if (shouldRegisterDecoration) {
        this.registerCommandDecoration(command);
      }
      if (command.exitCode) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandFailed);
      } else {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandSucceeded);
      }
    }));
    commandDetectionListeners.push(capability.onCommandInvalidated((commands) => {
      for (const command of commands) {
        const id = command.marker?.id;
        if (id) {
          const match = this._decorations.get(id);
          if (match) {
            match.decoration.dispose();
            dispose(match.disposables);
          }
        }
      }
    }));
    commandDetectionListeners.push(capability.onCurrentCommandInvalidated((request) => {
      if (request.reason === CommandInvalidationReason.NoProblemsReported) {
        const lastDecoration = Array.from(this._decorations.entries())[this._decorations.size - 1];
        lastDecoration?.[1].decoration.dispose();
      } else if (request.reason === CommandInvalidationReason.Windows) {
        this._clearPlaceholder();
      }
    }));
    return commandDetectionListeners;
  }
  activate(terminal) {
    this._terminal = terminal;
    this._attachToCommandCapability();
  }
  registerCommandDecoration(command, beforeCommandExecution, markProperties) {
    if (!this._terminal || beforeCommandExecution && !command || !this._showGutterDecorations && !this._showOverviewRulerDecorations) {
      return void 0;
    }
    const marker = command?.marker || markProperties?.marker;
    if (!marker) {
      throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
    }
    this._clearPlaceholder();
    const color = this._getDecorationCssColor(command)?.toString() ?? "";
    const decoration = this._terminal.registerDecoration({
      marker,
      overviewRulerOptions: this._showOverviewRulerDecorations ? beforeCommandExecution ? { color, position: "left" } : { color, position: command?.exitCode ? "right" : "left" } : void 0
    });
    if (!decoration) {
      return void 0;
    }
    if (beforeCommandExecution) {
      this._placeholderDecoration = decoration;
    }
    decoration.onRender((element) => {
      if (element.classList.contains(DecorationSelector.OverviewRuler)) {
        return;
      }
      if (!this._decorations.get(decoration.marker.id)) {
        decoration.onDispose(() => {
          const disposableDecoration = this._decorations.get(decoration.marker.id);
          if (disposableDecoration) {
            dispose(disposableDecoration.disposables);
            this._decorations.delete(decoration.marker.id);
          }
        });
        this._decorations.set(
          decoration.marker.id,
          {
            decoration,
            disposables: this._createDisposables(element, command, markProperties),
            command,
            markProperties: command?.markProperties || markProperties
          }
        );
      }
      if (!element.classList.contains(DecorationSelector.Codicon) || command?.marker?.line === 0) {
        updateLayout(this._configurationService, element);
        this._updateClasses(element, command, command?.markProperties || markProperties);
      }
    });
    return decoration;
  }
  registerMenuItems(command, items) {
    const existingItems = this._registeredMenuItems.get(command);
    if (existingItems) {
      existingItems.push(...items);
    } else {
      this._registeredMenuItems.set(command, [...items]);
    }
    return toDisposable(() => {
      const commandItems = this._registeredMenuItems.get(command);
      if (commandItems) {
        for (const item of items.values()) {
          const index = commandItems.indexOf(item);
          if (index !== -1) {
            commandItems.splice(index, 1);
          }
        }
      }
    });
  }
  _createDisposables(element, command, markProperties) {
    if (command?.exitCode === void 0 && !command?.markProperties) {
      return [];
    } else if (command?.markProperties || markProperties) {
      return [this._createHover(element, command || markProperties, markProperties?.hoverMessage)];
    }
    return [...this._createContextMenu(element, command), this._createHover(element, command)];
  }
  _createHover(element, command, hoverMessage) {
    return this._hoverService.setupDelayedHover(element, () => ({
      content: new MarkdownString(getTerminalDecorationHoverContent(command, hoverMessage, true))
    }));
  }
  _updateClasses(element, command, markProperties) {
    if (!element) {
      return;
    }
    for (const classes of element.classList) {
      element.classList.remove(classes);
    }
    element.classList.add(DecorationSelector.CommandDecoration, DecorationSelector.Codicon, DecorationSelector.XtermDecoration);
    if (markProperties) {
      element.classList.add(DecorationSelector.DefaultColor, ...ThemeIcon.asClassNameArray(terminalDecorationMark));
      if (!markProperties.hoverMessage) {
        element.classList.add(DecorationSelector.Default);
      }
    } else {
      const state = getTerminalCommandDecorationState(command);
      this._updateCommandDecorationVisibility(element);
      for (const className of state.classNames) {
        element.classList.add(className);
      }
      element.classList.add(...ThemeIcon.asClassNameArray(state.icon));
    }
    element.removeAttribute("title");
    element.removeAttribute("aria-label");
  }
  _createContextMenu(element, command) {
    return [
      dom.addDisposableListener(element, dom.EventType.MOUSE_DOWN, async (e) => {
        e.stopImmediatePropagation();
      }),
      dom.addDisposableListener(element, dom.EventType.CLICK, async (e) => {
        e.stopImmediatePropagation();
        const actions = await this._getCommandActions(command);
        this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => actions });
      }),
      dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async (e) => {
        e.stopImmediatePropagation();
        const chatActions = await this._getCommandActions(command);
        const actions = this._getContextMenuActions();
        this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => [...actions, ...chatActions] });
      })
    ];
  }
  _getContextMenuActions() {
    const label = localize("workbench.action.terminal.toggleVisibility", "Toggle Visibility");
    return [
      {
        class: void 0,
        tooltip: label,
        id: "terminal.toggleVisibility",
        label,
        enabled: true,
        run: async () => {
          this._showToggleVisibilityQuickPick();
        }
      }
    ];
  }
  async _getCommandActions(command) {
    const actions = [];
    const registeredMenuItems = this._registeredMenuItems.get(command);
    if (registeredMenuItems?.length) {
      actions.push(...registeredMenuItems, new Separator());
    }
    const attachToChatAction = this._createAttachToChatAction(command);
    if (attachToChatAction) {
      actions.push(attachToChatAction, new Separator());
    }
    if (command.command !== "") {
      const labelRun = localize("terminal.rerunCommand", "Rerun Command");
      actions.push({
        class: void 0,
        tooltip: labelRun,
        id: "terminal.rerunCommand",
        label: labelRun,
        enabled: true,
        run: async () => {
          if (command.command === "") {
            return;
          }
          if (!command.isTrusted) {
            const shouldRun = await new Promise((r) => {
              this._notificationService.prompt(Severity.Info, localize("rerun", "Do you want to run the command: {0}", command.command), [{
                label: localize("yes", "Yes"),
                run: () => r(true)
              }, {
                label: localize("no", "No"),
                run: () => r(false)
              }]);
            });
            if (!shouldRun) {
              return;
            }
          }
          this._onDidRequestRunCommand.fire({ command });
        }
      });
      actions.push(new Separator());
      const labelCopy = localize("terminal.copyCommand", "Copy Command");
      actions.push({
        class: void 0,
        tooltip: labelCopy,
        id: "terminal.copyCommand",
        label: labelCopy,
        enabled: true,
        run: () => this._clipboardService.writeText(command.command)
      });
    }
    if (command.hasOutput()) {
      const labelCopyCommandAndOutput = localize("terminal.copyCommandAndOutput", "Copy Command and Output");
      actions.push({
        class: void 0,
        tooltip: labelCopyCommandAndOutput,
        id: "terminal.copyCommandAndOutput",
        label: labelCopyCommandAndOutput,
        enabled: true,
        run: () => {
          const output = command.getOutput();
          if (isString(output)) {
            this._clipboardService.writeText(`${command.command !== "" ? command.command + "\n" : ""}${output}`);
          }
        }
      });
      const labelText = localize("terminal.copyOutput", "Copy Output");
      actions.push({
        class: void 0,
        tooltip: labelText,
        id: "terminal.copyOutput",
        label: labelText,
        enabled: true,
        run: () => {
          const text = command.getOutput();
          if (isString(text)) {
            this._clipboardService.writeText(text);
          }
        }
      });
      const labelHtml = localize("terminal.copyOutputAsHtml", "Copy Output as HTML");
      actions.push({
        class: void 0,
        tooltip: labelHtml,
        id: "terminal.copyOutputAsHtml",
        label: labelHtml,
        enabled: true,
        run: () => this._onDidRequestCopyAsHtml.fire({ command })
      });
    }
    if (actions.length > 0) {
      actions.push(new Separator());
    }
    const labelRunRecent = localize("workbench.action.terminal.runRecentCommand", "Run Recent Command");
    actions.push({
      class: void 0,
      tooltip: labelRunRecent,
      id: "workbench.action.terminal.runRecentCommand",
      label: labelRunRecent,
      enabled: true,
      run: () => this._commandService.executeCommand("workbench.action.terminal.runRecentCommand")
    });
    const labelGoToRecent = localize("workbench.action.terminal.goToRecentDirectory", "Go To Recent Directory");
    actions.push({
      class: void 0,
      tooltip: labelRunRecent,
      id: "workbench.action.terminal.goToRecentDirectory",
      label: labelGoToRecent,
      enabled: true,
      run: () => this._commandService.executeCommand("workbench.action.terminal.goToRecentDirectory")
    });
    actions.push(new Separator());
    const labelAbout = localize("terminal.learnShellIntegration", "Learn About Shell Integration");
    actions.push({
      class: void 0,
      tooltip: labelAbout,
      id: "terminal.learnShellIntegration",
      label: labelAbout,
      enabled: true,
      run: () => this._openerService.open("https://code.visualstudio.com/docs/terminal/shell-integration")
    });
    return actions;
  }
  _createAttachToChatAction(command) {
    const chatIsEnabled = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).some((w) => w.attachmentCapabilities.supportsTerminalAttachments);
    if (!chatIsEnabled) {
      return void 0;
    }
    const labelAttachToChat = localize("terminal.attachToChat", "Attach To Chat");
    return {
      class: void 0,
      tooltip: labelAttachToChat,
      id: "terminal.attachToChat",
      label: labelAttachToChat,
      enabled: true,
      run: async () => {
        let widget = this._chatWidgetService.lastFocusedWidget ?? this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)?.find((w) => w.attachmentCapabilities.supportsTerminalAttachments);
        if (!widget) {
          widget = await this._chatWidgetService.revealWidget();
        }
        if (!widget) {
          return;
        }
        let terminalContext;
        if (this._resource) {
          const parsedUri = parseTerminalUri(this._resource);
          terminalContext = this._instantiationService.createInstance(TerminalContext, getTerminalUri(parsedUri.workspaceId, parsedUri.instanceId, void 0, command.id));
        }
        if (terminalContext && widget.attachmentCapabilities.supportsTerminalAttachments) {
          try {
            const attachment = await terminalContext.asAttachment(widget);
            if (attachment) {
              widget.attachmentModel.addContext(attachment);
              widget.focusInput();
              return;
            }
          } catch (err) {
          }
          this._store.add(this._contextPickService.registerChatContextItem(terminalContext));
        }
      }
    };
  }
  _showToggleVisibilityQuickPick() {
    const quickPick = this._register(this._quickInputService.createQuickPick());
    quickPick.hideInput = true;
    quickPick.hideCheckAll = true;
    quickPick.canSelectMany = true;
    quickPick.title = localize("toggleVisibility", "Toggle visibility");
    const configValue = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
    const gutterIcon = {
      label: localize("gutter", "Gutter command decorations"),
      picked: configValue !== "never" && configValue !== "overviewRuler"
    };
    const overviewRulerIcon = {
      label: localize("overviewRuler", "Overview ruler command decorations"),
      picked: configValue !== "never" && configValue !== "gutter"
    };
    quickPick.items = [gutterIcon, overviewRulerIcon];
    const selectedItems = [];
    if (configValue !== "never") {
      if (configValue !== "gutter") {
        selectedItems.push(gutterIcon);
      }
      if (configValue !== "overviewRuler") {
        selectedItems.push(overviewRulerIcon);
      }
    }
    quickPick.selectedItems = selectedItems;
    this._register(quickPick.onDidChangeSelection(async (e) => {
      let newValue = "never";
      if (e.includes(gutterIcon)) {
        if (e.includes(overviewRulerIcon)) {
          newValue = "both";
        } else {
          newValue = "gutter";
        }
      } else if (e.includes(overviewRulerIcon)) {
        newValue = "overviewRuler";
      }
      await this._configurationService.updateValue(TerminalSettingId.ShellIntegrationDecorationsEnabled, newValue);
    }));
    quickPick.ok = false;
    quickPick.show();
  }
  _getDecorationCssColor(command) {
    let colorId;
    if (command?.exitCode === void 0) {
      colorId = TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR;
    } else {
      colorId = command.exitCode ? TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR : TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR;
    }
    return this._themeService.getColorTheme().getColor(colorId)?.toString();
  }
};
DecorationAddon = __decorateClass([
  __decorateParam(2, IClipboardService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IQuickInputService),
  __decorateParam(8, ILifecycleService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IAccessibilitySignalService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IChatContextPickService),
  __decorateParam(14, IChatWidgetService),
  __decorateParam(15, IInstantiationService)
], DecorationAddon);
export {
  DecorationAddon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx4dGVybVxcZGVjb3JhdGlvbkFkZG9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBJRGVjb3JhdGlvbiwgSVRlcm1pbmFsQWRkb24sIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQ29tbWFuZEludmFsaWRhdGlvblJlYXNvbiwgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCBJTWFya1Byb3BlcnRpZXMsIElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSwgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTZXR0aW5nSWQsIHR5cGUgSURlY29yYXRpb25BZGRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbERlY29yYXRpb25NYXJrIH0gZnJvbSAnLi4vdGVybWluYWxJY29ucy5qcyc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uU2VsZWN0b3IsIGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0ZSwgZ2V0VGVybWluYWxEZWNvcmF0aW9uSG92ZXJDb250ZW50LCB1cGRhdGVMYXlvdXQgfSBmcm9tICcuL2RlY29yYXRpb25TdHlsZXMuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfQ09NTUFORF9ERUNPUkFUSU9OX0RFRkFVTFRfQkFDS0dST1VORF9DT0xPUiwgVEVSTUlOQUxfQ09NTUFORF9ERUNPUkFUSU9OX0VSUk9SX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX0NPTU1BTkRfREVDT1JBVElPTl9TVUNDRVNTX0JBQ0tHUk9VTkRfQ09MT1IgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgZ2V0VGVybWluYWxVcmksIHBhcnNlVGVybWluYWxVcmkgfSBmcm9tICcuLi90ZXJtaW5hbFVyaS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmludGVyZmFjZSBJRGlzcG9zYWJsZURlY29yYXRpb24geyBkZWNvcmF0aW9uOiBJRGVjb3JhdGlvbjsgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107IGNvbW1hbmQ/OiBJVGVybWluYWxDb21tYW5kOyBtYXJrUHJvcGVydGllcz86IElNYXJrUHJvcGVydGllcyB9XG5cbmV4cG9ydCBjbGFzcyBEZWNvcmF0aW9uQWRkb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsQWRkb24sIElEZWNvcmF0aW9uQWRkb24ge1xuXHRwcm90ZWN0ZWQgX3Rlcm1pbmFsOiBUZXJtaW5hbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2FwYWJpbGl0eURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlTWFwPFRlcm1pbmFsQ2FwYWJpbGl0eT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcCgpKTtcblx0cHJpdmF0ZSBfZGVjb3JhdGlvbnM6IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlRGVjb3JhdGlvbj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgX3BsYWNlaG9sZGVyRGVjb3JhdGlvbjogSURlY29yYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nob3dHdXR0ZXJEZWNvcmF0aW9ucz86IGJvb2xlYW47XG5cdHByaXZhdGUgX3Nob3dPdmVydmlld1J1bGVyRGVjb3JhdGlvbnM/OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RlcmVkTWVudUl0ZW1zOiBNYXA8SVRlcm1pbmFsQ29tbWFuZCwgSUFjdGlvbltdPiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RSdW5Db21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kOyBub05ld0xpbmU/OiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RSdW5Db21tYW5kID0gdGhpcy5fb25EaWRSZXF1ZXN0UnVuQ29tbWFuZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0Q29weUFzSHRtbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0Q29weUFzSHRtbCA9IHRoaXMuX29uRGlkUmVxdWVzdENvcHlBc0h0bWwuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYXBhYmlsaXRpZXM6IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdENvbnRleHRQaWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0UGlja1NlcnZpY2U6IElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuRm9udFNpemUpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuTGluZUhlaWdodCkpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoTGF5b3V0cygpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guY29sb3JDdXN0b21pemF0aW9ucycpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTdHlsZXModHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkRlY29yYXRpb25zRW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQ2FwYWJpbGl0eURpc3Bvc2FibGVzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvblZpc2liaWxpdHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLl9yZWZyZXNoU3R5bGVzKHRydWUpKSk7XG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvblZpc2liaWxpdHkoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jYXBhYmlsaXRpZXMub25EaWRBZGRDYXBhYmlsaXR5KGMgPT4gdGhpcy5fY3JlYXRlQ2FwYWJpbGl0eURpc3Bvc2FibGVzKGMuaWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2FwYWJpbGl0aWVzLm9uRGlkUmVtb3ZlQ2FwYWJpbGl0eShjID0+IHRoaXMuX3JlbW92ZUNhcGFiaWxpdHlEaXNwb3NhYmxlcyhjLmlkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4gdGhpcy5fZGlzcG9zZUFsbERlY29yYXRpb25zKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNhcGFiaWxpdHlEaXNwb3NhYmxlcyhjOiBUZXJtaW5hbENhcGFiaWxpdHkpOiB2b2lkIHtcblx0XHRjb25zdCBjYXBhYmlsaXR5ID0gdGhpcy5fY2FwYWJpbGl0aWVzLmdldChjKTtcblx0XHRpZiAoIWNhcGFiaWxpdHkgfHwgdGhpcy5fY2FwYWJpbGl0eURpc3Bvc2FibGVzLmhhcyhjKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzd2l0Y2ggKGNhcGFiaWxpdHkudHlwZSkge1xuXHRcdFx0Y2FzZSBUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbjpcblx0XHRcdFx0c3RvcmUuYWRkKGNhcGFiaWxpdHkub25NYXJrQWRkZWQobWFyayA9PiB0aGlzLnJlZ2lzdGVyTWFya0RlY29yYXRpb24obWFyaykpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uOiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fZ2V0Q29tbWFuZERldGVjdGlvbkxpc3RlbmVycyhjYXBhYmlsaXR5KTtcblx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jYXBhYmlsaXR5RGlzcG9zYWJsZXMuc2V0KGMsIHN0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUNhcGFiaWxpdHlEaXNwb3NhYmxlcyhjOiBUZXJtaW5hbENhcGFiaWxpdHkpOiB2b2lkIHtcblx0XHR0aGlzLl9jYXBhYmlsaXR5RGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShjKTtcblx0fVxuXG5cdHJlZ2lzdGVyTWFya0RlY29yYXRpb24obWFyazogSU1hcmtQcm9wZXJ0aWVzKTogSURlY29yYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwgfHwgKCF0aGlzLl9zaG93R3V0dGVyRGVjb3JhdGlvbnMgJiYgIXRoaXMuX3Nob3dPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAobWFyay5oaWRkZW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlZ2lzdGVyQ29tbWFuZERlY29yYXRpb24odW5kZWZpbmVkLCB1bmRlZmluZWQsIG1hcmspO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGVjb3JhdGlvblZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvd0RlY29yYXRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkRlY29yYXRpb25zRW5hYmxlZCk7XG5cdFx0dGhpcy5fc2hvd0d1dHRlckRlY29yYXRpb25zID0gKHNob3dEZWNvcmF0aW9ucyA9PT0gJ2JvdGgnIHx8IHNob3dEZWNvcmF0aW9ucyA9PT0gJ2d1dHRlcicpO1xuXHRcdHRoaXMuX3Nob3dPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMgPSAoc2hvd0RlY29yYXRpb25zID09PSAnYm90aCcgfHwgc2hvd0RlY29yYXRpb25zID09PSAnb3ZlcnZpZXdSdWxlcicpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VBbGxEZWNvcmF0aW9ucygpO1xuXHRcdGlmICh0aGlzLl9zaG93R3V0dGVyRGVjb3JhdGlvbnMgfHwgdGhpcy5fc2hvd092ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucykge1xuXHRcdFx0dGhpcy5fYXR0YWNoVG9Db21tYW5kQ2FwYWJpbGl0eSgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlR3V0dGVyRGVjb3JhdGlvblZpc2liaWxpdHkoKTtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudENvbW1hbmQgPSB0aGlzLl9jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uZXhlY3V0aW5nQ29tbWFuZE9iamVjdDtcblx0XHRpZiAoY3VycmVudENvbW1hbmQpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJDb21tYW5kRGVjb3JhdGlvbihjdXJyZW50Q29tbWFuZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUFsbERlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdGhpcy5fZGVjb3JhdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdHZhbHVlLmRlY29yYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0ZGlzcG9zZSh2YWx1ZS5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlR3V0dGVyRGVjb3JhdGlvblZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgY29tbWFuZERlY29yYXRpb25FbGVtZW50cyA9IHRoaXMuX3Rlcm1pbmFsPy5lbGVtZW50Py5xdWVyeVNlbGVjdG9yQWxsKERlY29yYXRpb25TZWxlY3Rvci5Db21tYW5kRGVjb3JhdGlvbik7XG5cdFx0aWYgKGNvbW1hbmREZWNvcmF0aW9uRWxlbWVudHMpIHtcblx0XHRcdGZvciAoY29uc3QgY29tbWFuZERlY29yYXRpb25FbGVtZW50IG9mIGNvbW1hbmREZWNvcmF0aW9uRWxlbWVudHMpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ29tbWFuZERlY29yYXRpb25WaXNpYmlsaXR5KGNvbW1hbmREZWNvcmF0aW9uRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29tbWFuZERlY29yYXRpb25WaXNpYmlsaXR5KGNvbW1hbmREZWNvcmF0aW9uRWxlbWVudDogRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zaG93R3V0dGVyRGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbW1hbmREZWNvcmF0aW9uRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKERlY29yYXRpb25TZWxlY3Rvci5IaWRlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29tbWFuZERlY29yYXRpb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoRGVjb3JhdGlvblNlbGVjdG9yLkhpZGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWZyZXNoTGF5b3V0cygpOiB2b2lkIHtcblx0XHR1cGRhdGVMYXlvdXQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbj8uZWxlbWVudCk7XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIHRoaXMuX2RlY29yYXRpb25zKSB7XG5cdFx0XHR1cGRhdGVMYXlvdXQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIGRlY29yYXRpb25bMV0uZGVjb3JhdGlvbi5lbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU3R5bGVzKHJlZnJlc2hPdmVydmlld1J1bGVyQ29sb3JzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChyZWZyZXNoT3ZlcnZpZXdSdWxlckNvbG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIHRoaXMuX2RlY29yYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy5fZ2V0RGVjb3JhdGlvbkNzc0NvbG9yKGRlY29yYXRpb24uY29tbWFuZCk/LnRvU3RyaW5nKCkgPz8gJyc7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uLmRlY29yYXRpb24ub3B0aW9ucz8ub3ZlcnZpZXdSdWxlck9wdGlvbnMpIHtcblx0XHRcdFx0XHRkZWNvcmF0aW9uLmRlY29yYXRpb24ub3B0aW9ucy5vdmVydmlld1J1bGVyT3B0aW9ucy5jb2xvciA9IGNvbG9yO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGRlY29yYXRpb24uZGVjb3JhdGlvbi5vcHRpb25zKSB7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvbi5kZWNvcmF0aW9uLm9wdGlvbnMub3ZlcnZpZXdSdWxlck9wdGlvbnMgPSB7IGNvbG9yIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlQ2xhc3Nlcyh0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb24/LmVsZW1lbnQpO1xuXHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiB0aGlzLl9kZWNvcmF0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2xhc3NlcyhkZWNvcmF0aW9uLmRlY29yYXRpb24uZWxlbWVudCwgZGVjb3JhdGlvbi5jb21tYW5kLCBkZWNvcmF0aW9uLm1hcmtQcm9wZXJ0aWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZGlzcG9zYWJsZSBvZiB0aGlzLl9jYXBhYmlsaXR5RGlzcG9zYWJsZXMudmFsdWVzKCkpIHtcblx0XHRcdGRpc3Bvc2UoZGlzcG9zYWJsZSk7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXJEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJQbGFjZWhvbGRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb24/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb24gPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb24/Lm1hcmtlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2xlYXJQbGFjZWhvbGRlcigpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VBbGxEZWNvcmF0aW9ucygpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2hUb0NvbW1hbmRDYXBhYmlsaXR5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgY2FwYWJpbGl0eSA9IHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pITtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fZ2V0Q29tbWFuZERldGVjdGlvbkxpc3RlbmVycyhjYXBhYmlsaXR5KTtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Zm9yIChjb25zdCBkIG9mIGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NhcGFiaWxpdHlEaXNwb3NhYmxlcy5zZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24sIHN0b3JlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXJzKGNhcGFiaWxpdHk6IElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSk6IElEaXNwb3NhYmxlW10ge1xuXHRcdHRoaXMuX3JlbW92ZUNhcGFiaWxpdHlEaXNwb3NhYmxlcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXJzID0gW107XG5cdFx0Ly8gQ29tbWFuZCBzdGFydGVkXG5cdFx0aWYgKGNhcGFiaWxpdHkuZXhlY3V0aW5nQ29tbWFuZE9iamVjdD8ubWFya2VyKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyQ29tbWFuZERlY29yYXRpb24oY2FwYWJpbGl0eS5leGVjdXRpbmdDb21tYW5kT2JqZWN0LCB0cnVlKTtcblx0XHR9XG5cdFx0Y29tbWFuZERldGVjdGlvbkxpc3RlbmVycy5wdXNoKGNhcGFiaWxpdHkub25Db21tYW5kU3RhcnRlZChjb21tYW5kID0+IHRoaXMucmVnaXN0ZXJDb21tYW5kRGVjb3JhdGlvbihjb21tYW5kLCB0cnVlKSkpO1xuXHRcdC8vIENvbW1hbmQgZmluaXNoZWRcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY2FwYWJpbGl0eS5jb21tYW5kcykge1xuXHRcdFx0dGhpcy5yZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKGNvbW1hbmQpO1xuXHRcdH1cblx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXJzLnB1c2goY2FwYWJpbGl0eS5vbkNvbW1hbmRGaW5pc2hlZChjb21tYW5kID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3Rlcm1pbmFsPy5idWZmZXI/LmFjdGl2ZTtcblx0XHRcdGNvbnN0IG1hcmtlciA9IGNvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXI7XG5cblx0XHRcdC8vIEVkZ2UgY2FzZTogSGFuZGxlIGNhc2Ugd2hlcmUgdHNjIHdhdGNoIGNvbW1hbmRzIGNsZWFycyBidWZmZXIsIGJ1dCBkZWNvcmF0aW9uIG9mIHRoYXQgdHNjIGNvbW1hbmQgcmUtYXBwZWFyc1xuXHRcdFx0Y29uc3Qgc2hvdWxkUmVnaXN0ZXJEZWNvcmF0aW9uID0gKFxuXHRcdFx0XHRjb21tYW5kLmV4aXRDb2RlID09PSB1bmRlZmluZWQgfHxcblx0XHRcdFx0Ly8gT25seSByZWdpc3RlciBkZWNvcmF0aW9uIGlmIHRoZSBjdXJzb3IgaXMgYXQgb3IgYmVsb3cgdGhlIHByb21wdFN0YXJ0IG1hcmtlci5cblx0XHRcdFx0KGJ1ZmZlciAmJiBtYXJrZXIgJiYgYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclkgPj0gbWFya2VyLmxpbmUpXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAoc2hvdWxkUmVnaXN0ZXJEZWNvcmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJDb21tYW5kRGVjb3JhdGlvbihjb21tYW5kKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1hbmQuZXhpdENvZGUpIHtcblx0XHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLnRlcm1pbmFsQ29tbWFuZEZhaWxlZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwudGVybWluYWxDb21tYW5kU3VjY2VlZGVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gQ29tbWFuZCBpbnZhbGlkYXRlZFxuXHRcdGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lcnMucHVzaChjYXBhYmlsaXR5Lm9uQ29tbWFuZEludmFsaWRhdGVkKGNvbW1hbmRzID0+IHtcblx0XHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kcykge1xuXHRcdFx0XHRjb25zdCBpZCA9IGNvbW1hbmQubWFya2VyPy5pZDtcblx0XHRcdFx0aWYgKGlkKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXQoaWQpO1xuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0bWF0Y2guZGVjb3JhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRkaXNwb3NlKG1hdGNoLmRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gQ3VycmVudCBjb21tYW5kIGludmFsaWRhdGVkXG5cdFx0Y29tbWFuZERldGVjdGlvbkxpc3RlbmVycy5wdXNoKGNhcGFiaWxpdHkub25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkKChyZXF1ZXN0KSA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdC5yZWFzb24gPT09IENvbW1hbmRJbnZhbGlkYXRpb25SZWFzb24uTm9Qcm9ibGVtc1JlcG9ydGVkKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3REZWNvcmF0aW9uID0gQXJyYXkuZnJvbSh0aGlzLl9kZWNvcmF0aW9ucy5lbnRyaWVzKCkpW3RoaXMuX2RlY29yYXRpb25zLnNpemUgLSAxXTtcblx0XHRcdFx0bGFzdERlY29yYXRpb24/LlsxXS5kZWNvcmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5yZWFzb24gPT09IENvbW1hbmRJbnZhbGlkYXRpb25SZWFzb24uV2luZG93cykge1xuXHRcdFx0XHR0aGlzLl9jbGVhclBsYWNlaG9sZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiBjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXJzO1xuXHR9XG5cblx0YWN0aXZhdGUodGVybWluYWw6IFRlcm1pbmFsKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWwgPSB0ZXJtaW5hbDtcblx0XHR0aGlzLl9hdHRhY2hUb0NvbW1hbmRDYXBhYmlsaXR5KCk7XG5cdH1cblxuXHRyZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKGNvbW1hbmQ/OiBJVGVybWluYWxDb21tYW5kLCBiZWZvcmVDb21tYW5kRXhlY3V0aW9uPzogYm9vbGVhbiwgbWFya1Byb3BlcnRpZXM/OiBJTWFya1Byb3BlcnRpZXMpOiBJRGVjb3JhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCB8fCAoYmVmb3JlQ29tbWFuZEV4ZWN1dGlvbiAmJiAhY29tbWFuZCkgfHwgKCF0aGlzLl9zaG93R3V0dGVyRGVjb3JhdGlvbnMgJiYgIXRoaXMuX3Nob3dPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZXIgPSBjb21tYW5kPy5tYXJrZXIgfHwgbWFya1Byb3BlcnRpZXM/Lm1hcmtlcjtcblx0XHRpZiAoIW1hcmtlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgYWRkIGEgZGVjb3JhdGlvbiBmb3IgYSBjb21tYW5kICR7SlNPTi5zdHJpbmdpZnkoY29tbWFuZCl9IHdpdGggbm8gbWFya2VyYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFyUGxhY2Vob2xkZXIoKTtcblx0XHRjb25zdCBjb2xvciA9IHRoaXMuX2dldERlY29yYXRpb25Dc3NDb2xvcihjb21tYW5kKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJEZWNvcmF0aW9uKHtcblx0XHRcdG1hcmtlcixcblx0XHRcdG92ZXJ2aWV3UnVsZXJPcHRpb25zOiB0aGlzLl9zaG93T3ZlcnZpZXdSdWxlckRlY29yYXRpb25zID8gKGJlZm9yZUNvbW1hbmRFeGVjdXRpb25cblx0XHRcdFx0PyB7IGNvbG9yLCBwb3NpdGlvbjogJ2xlZnQnIH1cblx0XHRcdFx0OiB7IGNvbG9yLCBwb3NpdGlvbjogY29tbWFuZD8uZXhpdENvZGUgPyAncmlnaHQnIDogJ2xlZnQnIH0pIDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdFx0aWYgKCFkZWNvcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoYmVmb3JlQ29tbWFuZEV4ZWN1dGlvbikge1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9uID0gZGVjb3JhdGlvbjtcblx0XHR9XG5cdFx0ZGVjb3JhdGlvbi5vblJlbmRlcihlbGVtZW50ID0+IHtcblx0XHRcdGlmIChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucyhEZWNvcmF0aW9uU2VsZWN0b3IuT3ZlcnZpZXdSdWxlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9ucy5nZXQoZGVjb3JhdGlvbi5tYXJrZXIuaWQpKSB7XG5cdFx0XHRcdGRlY29yYXRpb24ub25EaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlRGVjb3JhdGlvbiA9IHRoaXMuX2RlY29yYXRpb25zLmdldChkZWNvcmF0aW9uLm1hcmtlci5pZCk7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2FibGVEZWNvcmF0aW9uKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NlKGRpc3Bvc2FibGVEZWNvcmF0aW9uLmRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zLmRlbGV0ZShkZWNvcmF0aW9uLm1hcmtlci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KGRlY29yYXRpb24ubWFya2VyLmlkLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGRlY29yYXRpb24sXG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlczogdGhpcy5fY3JlYXRlRGlzcG9zYWJsZXMoZWxlbWVudCwgY29tbWFuZCwgbWFya1Byb3BlcnRpZXMpLFxuXHRcdFx0XHRcdFx0Y29tbWFuZCxcblx0XHRcdFx0XHRcdG1hcmtQcm9wZXJ0aWVzOiBjb21tYW5kPy5tYXJrUHJvcGVydGllcyB8fCBtYXJrUHJvcGVydGllc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucyhEZWNvcmF0aW9uU2VsZWN0b3IuQ29kaWNvbikgfHwgY29tbWFuZD8ubWFya2VyPy5saW5lID09PSAwKSB7XG5cdFx0XHRcdC8vIGZpcnN0IHJlbmRlciBvciBidWZmZXIgd2FzIGNsZWFyZWRcblx0XHRcdFx0dXBkYXRlTGF5b3V0KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ2xhc3NlcyhlbGVtZW50LCBjb21tYW5kLCBjb21tYW5kPy5tYXJrUHJvcGVydGllcyB8fCBtYXJrUHJvcGVydGllcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRlY29yYXRpb247XG5cdH1cblxuXHRyZWdpc3Rlck1lbnVJdGVtcyhjb21tYW5kOiBJVGVybWluYWxDb21tYW5kLCBpdGVtczogSUFjdGlvbltdKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGV4aXN0aW5nSXRlbXMgPSB0aGlzLl9yZWdpc3RlcmVkTWVudUl0ZW1zLmdldChjb21tYW5kKTtcblx0XHRpZiAoZXhpc3RpbmdJdGVtcykge1xuXHRcdFx0ZXhpc3RpbmdJdGVtcy5wdXNoKC4uLml0ZW1zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJlZE1lbnVJdGVtcy5zZXQoY29tbWFuZCwgWy4uLml0ZW1zXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZEl0ZW1zID0gdGhpcy5fcmVnaXN0ZXJlZE1lbnVJdGVtcy5nZXQoY29tbWFuZCk7XG5cdFx0XHRpZiAoY29tbWFuZEl0ZW1zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gY29tbWFuZEl0ZW1zLmluZGV4T2YoaXRlbSk7XG5cdFx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZEl0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVEaXNwb3NhYmxlcyhlbGVtZW50OiBIVE1MRWxlbWVudCwgY29tbWFuZD86IElUZXJtaW5hbENvbW1hbmQsIG1hcmtQcm9wZXJ0aWVzPzogSU1hcmtQcm9wZXJ0aWVzKTogSURpc3Bvc2FibGVbXSB7XG5cdFx0aWYgKGNvbW1hbmQ/LmV4aXRDb2RlID09PSB1bmRlZmluZWQgJiYgIWNvbW1hbmQ/Lm1hcmtQcm9wZXJ0aWVzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSBlbHNlIGlmIChjb21tYW5kPy5tYXJrUHJvcGVydGllcyB8fCBtYXJrUHJvcGVydGllcykge1xuXHRcdFx0cmV0dXJuIFt0aGlzLl9jcmVhdGVIb3ZlcihlbGVtZW50LCBjb21tYW5kIHx8IG1hcmtQcm9wZXJ0aWVzLCBtYXJrUHJvcGVydGllcz8uaG92ZXJNZXNzYWdlKV07XG5cdFx0fVxuXHRcdHJldHVybiBbLi4udGhpcy5fY3JlYXRlQ29udGV4dE1lbnUoZWxlbWVudCwgY29tbWFuZCksIHRoaXMuX2NyZWF0ZUhvdmVyKGVsZW1lbnQsIGNvbW1hbmQpXTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUhvdmVyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkLCBob3Zlck1lc3NhZ2U/OiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGVsZW1lbnQsICgpID0+ICh7XG5cdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoZ2V0VGVybWluYWxEZWNvcmF0aW9uSG92ZXJDb250ZW50KGNvbW1hbmQsIGhvdmVyTWVzc2FnZSwgdHJ1ZSkpXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2xhc3NlcyhlbGVtZW50PzogSFRNTEVsZW1lbnQsIGNvbW1hbmQ/OiBJVGVybWluYWxDb21tYW5kLCBtYXJrUHJvcGVydGllcz86IElNYXJrUHJvcGVydGllcyk6IHZvaWQge1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNsYXNzZXMgb2YgZWxlbWVudC5jbGFzc0xpc3QpIHtcblx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZShjbGFzc2VzKTtcblx0XHR9XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKERlY29yYXRpb25TZWxlY3Rvci5Db21tYW5kRGVjb3JhdGlvbiwgRGVjb3JhdGlvblNlbGVjdG9yLkNvZGljb24sIERlY29yYXRpb25TZWxlY3Rvci5YdGVybURlY29yYXRpb24pO1xuXG5cdFx0aWYgKG1hcmtQcm9wZXJ0aWVzKSB7XG5cdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoRGVjb3JhdGlvblNlbGVjdG9yLkRlZmF1bHRDb2xvciwgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGVybWluYWxEZWNvcmF0aW9uTWFyaykpO1xuXHRcdFx0aWYgKCFtYXJrUHJvcGVydGllcy5ob3Zlck1lc3NhZ2UpIHtcblx0XHRcdFx0Ly9kaXNhYmxlIHRoZSBtb3VzZSBwb2ludGVyXG5cdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZChEZWNvcmF0aW9uU2VsZWN0b3IuRGVmYXVsdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGNvbW1hbmQgZGVjb3JhdGlvblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBnZXRUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdGUoY29tbWFuZCk7XG5cdFx0XHR0aGlzLl91cGRhdGVDb21tYW5kRGVjb3JhdGlvblZpc2liaWxpdHkoZWxlbWVudCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNsYXNzTmFtZSBvZiBzdGF0ZS5jbGFzc05hbWVzKSB7XG5cdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHN0YXRlLmljb24pKTtcblx0XHR9XG5cdFx0ZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3RpdGxlJyk7XG5cdFx0ZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNvbnRleHRNZW51KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKTogSURpc3Bvc2FibGVbXSB7XG5cdFx0Ly8gV2hlbiB0aGUgeHRlcm0gRGVjb3JhdGlvbiBnZXRzIGRpc3Bvc2VkIG9mLCBpdHMgZWxlbWVudCBnZXRzIHJlbW92ZWQgZnJvbSB0aGUgZG9tXG5cdFx0Ly8gYWxvbmcgd2l0aCBpdHMgbGlzdGVuZXJzXG5cdFx0cmV0dXJuIFtcblx0XHRcdGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCBhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0fSksXG5cdFx0XHRkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCB0aGlzLl9nZXRDb21tYW5kQWN0aW9ucyhjb21tYW5kKTtcblx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7IGdldEFuY2hvcjogKCkgPT4gZWxlbWVudCwgZ2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyB9KTtcblx0XHRcdH0pLFxuXHRcdFx0ZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgY2hhdEFjdGlvbnMgPSBhd2FpdCB0aGlzLl9nZXRDb21tYW5kQWN0aW9ucyhjb21tYW5kKTtcblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuX2dldENvbnRleHRNZW51QWN0aW9ucygpO1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHsgZ2V0QW5jaG9yOiAoKSA9PiBlbGVtZW50LCBnZXRBY3Rpb25zOiAoKSA9PiBbLi4uYWN0aW9ucywgLi4uY2hhdEFjdGlvbnNdIH0pO1xuXHRcdFx0fSksXG5cdFx0XTtcblx0fVxuXHRwcml2YXRlIF9nZXRDb250ZXh0TWVudUFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnRvZ2dsZVZpc2liaWxpdHknLCBcIlRvZ2dsZSBWaXNpYmlsaXR5XCIpO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsIHRvb2x0aXA6IGxhYmVsLCBpZDogJ3Rlcm1pbmFsLnRvZ2dsZVZpc2liaWxpdHknLCBsYWJlbCwgZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd1RvZ2dsZVZpc2liaWxpdHlRdWlja1BpY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRDb21tYW5kQWN0aW9ucyhjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKTogUHJvbWlzZTxJQWN0aW9uW10+IHtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRNZW51SXRlbXMgPSB0aGlzLl9yZWdpc3RlcmVkTWVudUl0ZW1zLmdldChjb21tYW5kKTtcblx0XHRpZiAocmVnaXN0ZXJlZE1lbnVJdGVtcz8ubGVuZ3RoKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4ucmVnaXN0ZXJlZE1lbnVJdGVtcywgbmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRhY2hUb0NoYXRBY3Rpb24gPSB0aGlzLl9jcmVhdGVBdHRhY2hUb0NoYXRBY3Rpb24oY29tbWFuZCk7XG5cdFx0aWYgKGF0dGFjaFRvQ2hhdEFjdGlvbikge1xuXHRcdFx0YWN0aW9ucy5wdXNoKGF0dGFjaFRvQ2hhdEFjdGlvbiwgbmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cblx0XHRpZiAoY29tbWFuZC5jb21tYW5kICE9PSAnJykge1xuXHRcdFx0Y29uc3QgbGFiZWxSdW4gPSBsb2NhbGl6ZShcInRlcm1pbmFsLnJlcnVuQ29tbWFuZFwiLCAnUmVydW4gQ29tbWFuZCcpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogbGFiZWxSdW4sIGlkOiAndGVybWluYWwucmVydW5Db21tYW5kJywgbGFiZWw6IGxhYmVsUnVuLCBlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAoY29tbWFuZC5jb21tYW5kID09PSAnJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWNvbW1hbmQuaXNUcnVzdGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzaG91bGRSdW4gPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPihyID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbG9jYWxpemUoJ3JlcnVuJywgJ0RvIHlvdSB3YW50IHRvIHJ1biB0aGUgY29tbWFuZDogezB9JywgY29tbWFuZC5jb21tYW5kKSwgW3tcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3llcycsICdZZXMnKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHIodHJ1ZSlcblx0XHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm8nLCAnTm8nKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHIoZmFsc2UpXG5cdFx0XHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0aWYgKCFzaG91bGRSdW4pIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RSdW5Db21tYW5kLmZpcmUoeyBjb21tYW5kIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdC8vIFRoZSBzZWNvbmQgc2VjdGlvbiBpcyB0aGUgY2xpcGJvYXJkIHNlY3Rpb25cblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0Y29uc3QgbGFiZWxDb3B5ID0gbG9jYWxpemUoXCJ0ZXJtaW5hbC5jb3B5Q29tbWFuZFwiLCAnQ29weSBDb21tYW5kJyk7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLCB0b29sdGlwOiBsYWJlbENvcHksIGlkOiAndGVybWluYWwuY29weUNvbW1hbmQnLCBsYWJlbDogbGFiZWxDb3B5LCBlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGNvbW1hbmQuY29tbWFuZClcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZC5oYXNPdXRwdXQoKSkge1xuXHRcdFx0Y29uc3QgbGFiZWxDb3B5Q29tbWFuZEFuZE91dHB1dCA9IGxvY2FsaXplKFwidGVybWluYWwuY29weUNvbW1hbmRBbmRPdXRwdXRcIiwgJ0NvcHkgQ29tbWFuZCBhbmQgT3V0cHV0Jyk7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLCB0b29sdGlwOiBsYWJlbENvcHlDb21tYW5kQW5kT3V0cHV0LCBpZDogJ3Rlcm1pbmFsLmNvcHlDb21tYW5kQW5kT3V0cHV0JywgbGFiZWw6IGxhYmVsQ29weUNvbW1hbmRBbmRPdXRwdXQsIGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dCA9IGNvbW1hbmQuZ2V0T3V0cHV0KCk7XG5cdFx0XHRcdFx0aWYgKGlzU3RyaW5nKG91dHB1dCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGAke2NvbW1hbmQuY29tbWFuZCAhPT0gJycgPyBjb21tYW5kLmNvbW1hbmQgKyAnXFxuJyA6ICcnfSR7b3V0cHV0fWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBsYWJlbFRleHQgPSBsb2NhbGl6ZShcInRlcm1pbmFsLmNvcHlPdXRwdXRcIiwgJ0NvcHkgT3V0cHV0Jyk7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLCB0b29sdGlwOiBsYWJlbFRleHQsIGlkOiAndGVybWluYWwuY29weU91dHB1dCcsIGxhYmVsOiBsYWJlbFRleHQsIGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBjb21tYW5kLmdldE91dHB1dCgpO1xuXHRcdFx0XHRcdGlmIChpc1N0cmluZyh0ZXh0KSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGV4dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGxhYmVsSHRtbCA9IGxvY2FsaXplKFwidGVybWluYWwuY29weU91dHB1dEFzSHRtbFwiLCAnQ29weSBPdXRwdXQgYXMgSFRNTCcpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogbGFiZWxIdG1sLCBpZDogJ3Rlcm1pbmFsLmNvcHlPdXRwdXRBc0h0bWwnLCBsYWJlbDogbGFiZWxIdG1sLCBlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuX29uRGlkUmVxdWVzdENvcHlBc0h0bWwuZmlyZSh7IGNvbW1hbmQgfSlcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWxSdW5SZWNlbnQgPSBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5ydW5SZWNlbnRDb21tYW5kJywgXCJSdW4gUmVjZW50IENvbW1hbmRcIik7XG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsIHRvb2x0aXA6IGxhYmVsUnVuUmVjZW50LCBpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuUmVjZW50Q29tbWFuZCcsIGxhYmVsOiBsYWJlbFJ1blJlY2VudCwgZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuUmVjZW50Q29tbWFuZCcpXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGFiZWxHb1RvUmVjZW50ID0gbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZ29Ub1JlY2VudERpcmVjdG9yeScsIFwiR28gVG8gUmVjZW50IERpcmVjdG9yeVwiKTtcblx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogbGFiZWxSdW5SZWNlbnQsIGlkOiAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5nb1RvUmVjZW50RGlyZWN0b3J5JywgbGFiZWw6IGxhYmVsR29Ub1JlY2VudCwgZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZ29Ub1JlY2VudERpcmVjdG9yeScpXG5cdFx0fSk7XG5cblx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblxuXHRcdGNvbnN0IGxhYmVsQWJvdXQgPSBsb2NhbGl6ZShcInRlcm1pbmFsLmxlYXJuU2hlbGxJbnRlZ3JhdGlvblwiLCAnTGVhcm4gQWJvdXQgU2hlbGwgSW50ZWdyYXRpb24nKTtcblx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogbGFiZWxBYm91dCwgaWQ6ICd0ZXJtaW5hbC5sZWFyblNoZWxsSW50ZWdyYXRpb24nLCBsYWJlbDogbGFiZWxBYm91dCwgZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL3Rlcm1pbmFsL3NoZWxsLWludGVncmF0aW9uJylcblx0XHR9KTtcblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUF0dGFjaFRvQ2hhdEFjdGlvbihjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKTogSUFjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2hhdElzRW5hYmxlZCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldHNCeUxvY2F0aW9ucyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KS5zb21lKHcgPT4gdy5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzVGVybWluYWxBdHRhY2htZW50cyk7XG5cdFx0aWYgKCFjaGF0SXNFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbEF0dGFjaFRvQ2hhdCA9IGxvY2FsaXplKFwidGVybWluYWwuYXR0YWNoVG9DaGF0XCIsICdBdHRhY2ggVG8gQ2hhdCcpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLCB0b29sdGlwOiBsYWJlbEF0dGFjaFRvQ2hhdCwgaWQ6ICd0ZXJtaW5hbC5hdHRhY2hUb0NoYXQnLCBsYWJlbDogbGFiZWxBdHRhY2hUb0NoYXQsIGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0ID8/IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldHNCeUxvY2F0aW9ucyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KT8uZmluZCh3ID0+IHcuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c1Rlcm1pbmFsQXR0YWNobWVudHMpO1xuXG5cdFx0XHRcdC8vIElmIG5vIHdpZGdldCBmb3VuZCAoZS5nLiwgYWZ0ZXIgd2luZG93IHJlbG9hZCB3aGVuIGNoYXQgaGFzbid0IGJlZW4gZm9jdXNlZCksIG9wZW4gY2hhdCB2aWV3XG5cdFx0XHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRcdFx0d2lkZ2V0ID0gYXdhaXQgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCB0ZXJtaW5hbENvbnRleHQ6IFRlcm1pbmFsQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMuX3Jlc291cmNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkVXJpID0gcGFyc2VUZXJtaW5hbFVyaSh0aGlzLl9yZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGVybWluYWxDb250ZXh0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDb250ZXh0LCBnZXRUZXJtaW5hbFVyaShwYXJzZWRVcmkud29ya3NwYWNlSWQsIHBhcnNlZFVyaS5pbnN0YW5jZUlkISwgdW5kZWZpbmVkLCBjb21tYW5kLmlkKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGVybWluYWxDb250ZXh0ICYmIHdpZGdldC5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzVGVybWluYWxBdHRhY2htZW50cykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhdHRhY2htZW50ID0gYXdhaXQgdGVybWluYWxDb250ZXh0LmFzQXR0YWNobWVudCh3aWRnZXQpO1xuXHRcdFx0XHRcdFx0aWYgKGF0dGFjaG1lbnQpIHtcblx0XHRcdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGF0dGFjaG1lbnQpO1xuXHRcdFx0XHRcdFx0XHR3aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9jb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0odGVybWluYWxDb250ZXh0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1RvZ2dsZVZpc2liaWxpdHlRdWlja1BpY2soKSB7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdHF1aWNrUGljay5oaWRlSW5wdXQgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5oaWRlQ2hlY2tBbGwgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgndG9nZ2xlVmlzaWJpbGl0eScsICdUb2dnbGUgdmlzaWJpbGl0eScpO1xuXHRcdGNvbnN0IGNvbmZpZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkRlY29yYXRpb25zRW5hYmxlZCk7XG5cdFx0Y29uc3QgZ3V0dGVySWNvbjogSVF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2d1dHRlcicsICdHdXR0ZXIgY29tbWFuZCBkZWNvcmF0aW9ucycpLFxuXHRcdFx0cGlja2VkOiBjb25maWdWYWx1ZSAhPT0gJ25ldmVyJyAmJiBjb25maWdWYWx1ZSAhPT0gJ292ZXJ2aWV3UnVsZXInXG5cdFx0fTtcblx0XHRjb25zdCBvdmVydmlld1J1bGVySWNvbjogSVF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ292ZXJ2aWV3UnVsZXInLCAnT3ZlcnZpZXcgcnVsZXIgY29tbWFuZCBkZWNvcmF0aW9ucycpLFxuXHRcdFx0cGlja2VkOiBjb25maWdWYWx1ZSAhPT0gJ25ldmVyJyAmJiBjb25maWdWYWx1ZSAhPT0gJ2d1dHRlcidcblx0XHR9O1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IFtndXR0ZXJJY29uLCBvdmVydmlld1J1bGVySWNvbl07XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGlmIChjb25maWdWYWx1ZSAhPT0gJ25ldmVyJykge1xuXHRcdFx0aWYgKGNvbmZpZ1ZhbHVlICE9PSAnZ3V0dGVyJykge1xuXHRcdFx0XHRzZWxlY3RlZEl0ZW1zLnB1c2goZ3V0dGVySWNvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29uZmlnVmFsdWUgIT09ICdvdmVydmlld1J1bGVyJykge1xuXHRcdFx0XHRzZWxlY3RlZEl0ZW1zLnB1c2gob3ZlcnZpZXdSdWxlckljb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IHNlbGVjdGVkSXRlbXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocXVpY2tQaWNrLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0bGV0IG5ld1ZhbHVlOiAnYm90aCcgfCAnZ3V0dGVyJyB8ICdvdmVydmlld1J1bGVyJyB8ICduZXZlcicgPSAnbmV2ZXInO1xuXHRcdFx0aWYgKGUuaW5jbHVkZXMoZ3V0dGVySWNvbikpIHtcblx0XHRcdFx0aWYgKGUuaW5jbHVkZXMob3ZlcnZpZXdSdWxlckljb24pKSB7XG5cdFx0XHRcdFx0bmV3VmFsdWUgPSAnYm90aCc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3VmFsdWUgPSAnZ3V0dGVyJztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLmluY2x1ZGVzKG92ZXJ2aWV3UnVsZXJJY29uKSkge1xuXHRcdFx0XHRuZXdWYWx1ZSA9ICdvdmVydmlld1J1bGVyJztcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25EZWNvcmF0aW9uc0VuYWJsZWQsIG5ld1ZhbHVlKTtcblx0XHR9KSk7XG5cdFx0cXVpY2tQaWNrLm9rID0gZmFsc2U7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlY29yYXRpb25Dc3NDb2xvcihjb21tYW5kPzogSVRlcm1pbmFsQ29tbWFuZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGNvbG9ySWQ6IHN0cmluZztcblx0XHRpZiAoY29tbWFuZD8uZXhpdENvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29sb3JJZCA9IFRFUk1JTkFMX0NPTU1BTkRfREVDT1JBVElPTl9ERUZBVUxUX0JBQ0tHUk9VTkRfQ09MT1I7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbG9ySWQgPSBjb21tYW5kLmV4aXRDb2RlID8gVEVSTUlOQUxfQ09NTUFORF9ERUNPUkFUSU9OX0VSUk9SX0JBQ0tHUk9VTkRfQ09MT1IgOiBURVJNSU5BTF9DT01NQU5EX0RFQ09SQVRJT05fU1VDQ0VTU19CQUNLR1JPVU5EX0NPTE9SO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihjb2xvcklkKT8udG9TdHJpbmcoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxZQUFZLFNBQVM7QUFDckIsU0FBa0IsaUJBQWlCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksZUFBZSxpQkFBOEIsU0FBUyxvQkFBb0I7QUFDL0YsU0FBUyxpQkFBaUI7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
