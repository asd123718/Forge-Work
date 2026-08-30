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
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { Event } from "../../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { localize2 } from "../../../../../nls.js";
import { AccessibleViewProviderId, IAccessibleViewService, NavigationType } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { isFullTerminalCommand } from "../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js";
import { TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityHelpAction, AccessibleViewAction } from "../../../accessibility/browser/accessibleViewActions.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { registerTerminalAction } from "../../../terminal/browser/terminalActions.js";
import { registerTerminalContribution } from "../../../terminal/browser/terminalExtensions.js";
import { TerminalContextKeys } from "../../../terminal/common/terminalContextKey.js";
import { TerminalAccessibilityCommandId } from "../common/terminal.accessibility.js";
import { TerminalAccessibilitySettingId } from "../common/terminalAccessibilityConfiguration.js";
import { BufferContentTracker } from "./bufferContentTracker.js";
import { TerminalAccessibilityHelpProvider } from "./terminalAccessibilityHelp.js";
import { TerminalAccessibleBufferProvider } from "./terminalAccessibleBufferProvider.js";
import { TextAreaSyncAddon } from "./textAreaSyncAddon.js";
let TextAreaSyncContribution = class extends DisposableStore {
  constructor(_ctx, _instantiationService) {
    super();
    this._ctx = _ctx;
    this._instantiationService = _instantiationService;
  }
  static get(instance) {
    return instance.getContribution(TextAreaSyncContribution.ID);
  }
  layout(xterm) {
    if (this._addon) {
      return;
    }
    this._addon = this.add(this._instantiationService.createInstance(TextAreaSyncAddon, this._ctx.instance.capabilities));
    xterm.raw.loadAddon(this._addon);
    this._addon.activate(xterm.raw);
  }
};
TextAreaSyncContribution.ID = "terminal.textAreaSync";
TextAreaSyncContribution = __decorateClass([
  __decorateParam(1, IInstantiationService)
], TextAreaSyncContribution);
registerTerminalContribution(TextAreaSyncContribution.ID, TextAreaSyncContribution);
let TerminalAccessibleViewContribution = class extends Disposable {
  constructor(_ctx, _accessibilitySignalService, _accessibleViewService, _configurationService, _contextKeyService, _instantiationService, _terminalService) {
    super();
    this._ctx = _ctx;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._accessibleViewService = _accessibleViewService;
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._terminalService = _terminalService;
    this._onDidRunCommand = this._register(new MutableDisposable());
    this._register(AccessibleViewAction.addImplementation(90, "terminal", () => {
      if (this._terminalService.activeInstance !== this._ctx.instance) {
        return false;
      }
      this.show();
      return true;
    }, TerminalContextKeys.focus));
    this._register(this._ctx.instance.onDidExecuteText(() => {
      const focusAfterRun = _configurationService.getValue(TerminalSettingId.FocusAfterRun);
      if (focusAfterRun === "terminal") {
        this._ctx.instance.focus(true);
      } else if (focusAfterRun === "accessible-buffer") {
        this.show();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
        this._updateCommandExecutedListener();
      }
    }));
    this._register(this._ctx.instance.capabilities.onDidAddCapability((e) => {
      if (e.capability.type === TerminalCapability.CommandDetection) {
        this._updateCommandExecutedListener();
      }
    }));
  }
  static get(instance) {
    return instance.getContribution(TerminalAccessibleViewContribution.ID);
  }
  xtermReady(xterm) {
    const addon = this._instantiationService.createInstance(TextAreaSyncAddon, this._ctx.instance.capabilities);
    xterm.raw.loadAddon(addon);
    addon.activate(xterm.raw);
    this._xterm = xterm;
    this._register(this._xterm.raw.onWriteParsed(async () => {
      if (this._terminalService.activeInstance !== this._ctx.instance) {
        return;
      }
      if (this._isTerminalAccessibleViewOpen() && this._xterm.raw.buffer.active.baseY === 0) {
        this._bufferProvider?.refresh();
      }
    }));
    const onRequestUpdateEditor = Event.latch(this._xterm.raw.onScroll);
    this._register(onRequestUpdateEditor(() => {
      if (this._terminalService.activeInstance !== this._ctx.instance) {
        return;
      }
      if (this._isTerminalAccessibleViewOpen()) {
        this._bufferProvider?.refresh();
      }
    }));
  }
  _updateCommandExecutedListener() {
    if (!this._ctx.instance.capabilities.has(TerminalCapability.CommandDetection)) {
      return;
    }
    if (!this._configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
      this._onDidRunCommand.clear();
      return;
    } else if (this._onDidRunCommand.value) {
      return;
    }
    const capability = this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection);
    this._onDidRunCommand.value = capability.onCommandExecuted(() => {
      if (this._ctx.instance.hasFocus) {
        this.show();
      }
    });
  }
  _isTerminalAccessibleViewOpen() {
    return accessibleViewCurrentProviderId.getValue(this._contextKeyService) === AccessibleViewProviderId.Terminal;
  }
  show() {
    if (!this._xterm) {
      return;
    }
    if (!this._bufferTracker) {
      this._bufferTracker = this._register(this._instantiationService.createInstance(BufferContentTracker, this._xterm));
    }
    if (!this._bufferProvider) {
      this._bufferProvider = this._register(this._instantiationService.createInstance(TerminalAccessibleBufferProvider, this._ctx.instance, this._bufferTracker, () => {
        return this._register(this._instantiationService.createInstance(TerminalAccessibilityHelpProvider, this._ctx.instance, this._xterm)).provideContent();
      }));
    }
    this._accessibleViewService.show(this._bufferProvider);
  }
  navigateToCommand(type) {
    const currentLine = this._accessibleViewService.getPosition(AccessibleViewProviderId.Terminal)?.lineNumber;
    const commands = this._getCommandsWithEditorLine();
    if (!commands?.length || !currentLine) {
      return;
    }
    const filteredCommands = type === NavigationType.Previous ? commands.filter((c) => c.lineNumber < currentLine).sort((a, b) => b.lineNumber - a.lineNumber) : commands.filter((c) => c.lineNumber > currentLine).sort((a, b) => a.lineNumber - b.lineNumber);
    if (!filteredCommands.length) {
      return;
    }
    const command = filteredCommands[0];
    const commandLine = command.command.command;
    if (!isWindows && commandLine) {
      this._accessibleViewService.setPosition(new Position(command.lineNumber, 1), true);
      status(commandLine);
    } else {
      this._accessibleViewService.setPosition(new Position(command.lineNumber, 1), true, true);
    }
    if (command.exitCode) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandFailed);
    } else {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandSucceeded);
    }
  }
  _getCommandsWithEditorLine() {
    const capability = this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection);
    const commands = capability?.commands;
    const currentCommand = capability?.currentCommand;
    if (!commands?.length) {
      return;
    }
    const result = [];
    for (const command of commands) {
      const lineNumber = this._getEditorLineForCommand(command);
      if (!lineNumber) {
        continue;
      }
      result.push({ command, lineNumber, exitCode: command.exitCode });
    }
    if (currentCommand) {
      const lineNumber = this._getEditorLineForCommand(currentCommand);
      if (!!lineNumber) {
        result.push({ command: currentCommand, lineNumber });
      }
    }
    return result;
  }
  _getEditorLineForCommand(command) {
    if (!this._bufferTracker) {
      return;
    }
    let line;
    if (isFullTerminalCommand(command)) {
      line = command.marker?.line;
    } else {
      line = command.commandStartMarker?.line;
    }
    if (line === void 0 || line < 0) {
      return;
    }
    line = this._bufferTracker.bufferToEditorLineMapping.get(line);
    if (line === void 0) {
      return;
    }
    return line + 1;
  }
};
TerminalAccessibleViewContribution.ID = "terminal.accessibleBufferProvider";
TerminalAccessibleViewContribution = __decorateClass([
  __decorateParam(1, IAccessibilitySignalService),
  __decorateParam(2, IAccessibleViewService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITerminalService)
], TerminalAccessibleViewContribution);
registerTerminalContribution(TerminalAccessibleViewContribution.ID, TerminalAccessibleViewContribution);
class TerminalAccessibilityHelpContribution extends Disposable {
  constructor() {
    super();
    this._register(AccessibilityHelpAction.addImplementation(105, "terminal", async (accessor) => {
      const instantiationService = accessor.get(IInstantiationService);
      const terminalService = accessor.get(ITerminalService);
      const accessibleViewService = accessor.get(IAccessibleViewService);
      const instance = await terminalService.getActiveOrCreateInstance();
      await terminalService.revealActiveTerminal();
      const terminal = instance?.xterm;
      if (!terminal) {
        return;
      }
      accessibleViewService.show(instantiationService.createInstance(TerminalAccessibilityHelpProvider, instance, terminal));
    }, ContextKeyExpr.or(TerminalContextKeys.focus, ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal)))));
  }
}
registerTerminalContribution(TerminalAccessibilityHelpContribution.ID, TerminalAccessibilityHelpContribution);
class FocusAccessibleBufferAction extends Action2 {
  constructor() {
    super({
      id: TerminalAccessibilityCommandId.FocusAccessibleBuffer,
      title: localize2("workbench.action.terminal.focusAccessibleBuffer", "Focus Accessible Terminal View"),
      precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
      keybinding: [
        {
          primary: KeyMod.Alt | KeyCode.F2,
          secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
          linux: {
            primary: KeyMod.Alt | KeyCode.F2 | KeyMod.Shift,
            secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
          },
          weight: KeybindingWeight.WorkbenchContrib,
          when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.focus)
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const terminalService = accessor.get(ITerminalService);
    const terminal = await terminalService.getActiveOrCreateInstance();
    if (!terminal?.xterm) {
      return;
    }
    TerminalAccessibleViewContribution.get(terminal)?.show();
  }
}
registerAction2(FocusAccessibleBufferAction);
registerTerminalAction({
  id: TerminalAccessibilityCommandId.AccessibleBufferGoToNextCommand,
  title: localize2("workbench.action.terminal.accessibleBufferGoToNextCommand", "Accessible Buffer Go to Next Command"),
  precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated, ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
  keybinding: [
    {
      primary: KeyMod.Alt | KeyCode.DownArrow,
      when: ContextKeyExpr.and(ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
      weight: KeybindingWeight.WorkbenchContrib + 2
    }
  ],
  run: async (c) => {
    const instance = c.service.activeInstance;
    if (!instance) {
      return;
    }
    TerminalAccessibleViewContribution.get(instance)?.navigateToCommand(NavigationType.Next);
  }
});
registerTerminalAction({
  id: TerminalAccessibilityCommandId.AccessibleBufferGoToPreviousCommand,
  title: localize2("workbench.action.terminal.accessibleBufferGoToPreviousCommand", "Accessible Buffer Go to Previous Command"),
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
  keybinding: [
    {
      primary: KeyMod.Alt | KeyCode.UpArrow,
      when: ContextKeyExpr.and(ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
      weight: KeybindingWeight.WorkbenchContrib + 2
    }
  ],
  run: async (c) => {
    const instance = c.service.activeInstance;
    if (!instance) {
      return;
    }
    TerminalAccessibleViewContribution.get(instance)?.navigateToCommand(NavigationType.Previous);
  }
});
registerTerminalAction({
  id: TerminalAccessibilityCommandId.ScrollToBottomAccessibleView,
  title: localize2("workbench.action.terminal.scrollToBottomAccessibleView", "Scroll to Accessible View Bottom"),
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
  keybinding: {
    primary: KeyMod.CtrlCmd | KeyCode.End,
    linux: { primary: KeyMod.Shift | KeyCode.End },
    when: accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal),
    weight: KeybindingWeight.WorkbenchContrib
  },
  run: (c, accessor) => {
    const accessibleViewService = accessor.get(IAccessibleViewService);
    const lastPosition = accessibleViewService.getLastPosition();
    if (!lastPosition) {
      return;
    }
    accessibleViewService.setPosition(lastPosition, true);
  }
});
registerTerminalAction({
  id: TerminalAccessibilityCommandId.ScrollToTopAccessibleView,
  title: localize2("workbench.action.terminal.scrollToTopAccessibleView", "Scroll to Accessible View Top"),
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
  keybinding: {
    primary: KeyMod.CtrlCmd | KeyCode.Home,
    linux: { primary: KeyMod.Shift | KeyCode.Home },
    when: accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal),
    weight: KeybindingWeight.WorkbenchContrib
  },
  run: (c, accessor) => accessor.get(IAccessibleViewService)?.setPosition(new Position(1, 1), true)
});
export {
  TerminalAccessibilityHelpContribution,
  TerminalAccessibleViewContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcYWNjZXNzaWJpbGl0eVxcYnJvd3NlclxcdGVybWluYWwuYWNjZXNzaWJpbGl0eS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQsIElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIE5hdmlnYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21tYW5kLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJQ3VycmVudFBhcnRpYWxDb21tYW5kLCBpc0Z1bGxUZXJtaW5hbENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vdGVybWluYWxDb21tYW5kLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQsIGFjY2Vzc2libGVWaWV3SXNTaG93biB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5SGVscEFjdGlvbiwgQWNjZXNzaWJsZVZpZXdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdBY3Rpb25zLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbnRyaWJ1dGlvbiwgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UsIElYdGVybVRlcm1pbmFsIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUZXJtaW5hbENvbnRyaWJ1dGlvbiwgdHlwZSBJVGVybWluYWxDb250cmlidXRpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbENvbnRleHRLZXkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmFjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxBY2Nlc3NpYmlsaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQnVmZmVyQ29udGVudFRyYWNrZXIgfSBmcm9tICcuL2J1ZmZlckNvbnRlbnRUcmFja2VyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQWNjZXNzaWJpbGl0eUhlbHBQcm92aWRlciB9IGZyb20gJy4vdGVybWluYWxBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFdpdGhFZGl0b3JMaW5lLCBUZXJtaW5hbEFjY2Vzc2libGVCdWZmZXJQcm92aWRlciB9IGZyb20gJy4vdGVybWluYWxBY2Nlc3NpYmxlQnVmZmVyUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVGV4dEFyZWFTeW5jQWRkb24gfSBmcm9tICcuL3RleHRBcmVhU3luY0FkZG9uLmpzJztcblxuLy8gI3JlZ2lvbiBUZXJtaW5hbCBDb250cmlidXRpb25zXG5cbmNsYXNzIFRleHRBcmVhU3luY0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGVTdG9yZSBpbXBsZW1lbnRzIElUZXJtaW5hbENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXJtaW5hbC50ZXh0QXJlYVN5bmMnO1xuXHRzdGF0aWMgZ2V0KGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFRleHRBcmVhU3luY0NvbnRyaWJ1dGlvbiB8IG51bGwge1xuXHRcdHJldHVybiBpbnN0YW5jZS5nZXRDb250cmlidXRpb248VGV4dEFyZWFTeW5jQ29udHJpYnV0aW9uPihUZXh0QXJlYVN5bmNDb250cmlidXRpb24uSUQpO1xuXHR9XG5cdHByaXZhdGUgX2FkZG9uOiBUZXh0QXJlYVN5bmNBZGRvbiB8IHVuZGVmaW5lZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY3R4OiBJVGVybWluYWxDb250cmlidXRpb25Db250ZXh0LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXHRsYXlvdXQoeHRlcm06IElYdGVybVRlcm1pbmFsICYgeyByYXc6IFRlcm1pbmFsIH0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWRkb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWRkb24gPSB0aGlzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0QXJlYVN5bmNBZGRvbiwgdGhpcy5fY3R4Lmluc3RhbmNlLmNhcGFiaWxpdGllcykpO1xuXHRcdHh0ZXJtLnJhdy5sb2FkQWRkb24odGhpcy5fYWRkb24pO1xuXHRcdHRoaXMuX2FkZG9uLmFjdGl2YXRlKHh0ZXJtLnJhdyk7XG5cdH1cbn1cbnJlZ2lzdGVyVGVybWluYWxDb250cmlidXRpb24oVGV4dEFyZWFTeW5jQ29udHJpYnV0aW9uLklELCBUZXh0QXJlYVN5bmNDb250cmlidXRpb24pO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxBY2Nlc3NpYmxlVmlld0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVybWluYWwuYWNjZXNzaWJsZUJ1ZmZlclByb3ZpZGVyJztcblx0c3RhdGljIGdldChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGluc3RhbmNlLmdldENvbnRyaWJ1dGlvbjxUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uPihUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uLklEKTtcblx0fVxuXHRwcml2YXRlIF9idWZmZXJUcmFja2VyOiBCdWZmZXJDb250ZW50VHJhY2tlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYnVmZmVyUHJvdmlkZXI6IFRlcm1pbmFsQWNjZXNzaWJsZUJ1ZmZlclByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF94dGVybTogUGljazxJWHRlcm1UZXJtaW5hbCwgJ3NoZWxsSW50ZWdyYXRpb24nIHwgJ2dldEZvbnQnPiAmIHsgcmF3OiBUZXJtaW5hbCB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJ1bkNvbW1hbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY3R4OiBJVGVybWluYWxDb250cmlidXRpb25Db250ZXh0LFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUFjY2Vzc2libGVWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEFjY2Vzc2libGVWaWV3QWN0aW9uLmFkZEltcGxlbWVudGF0aW9uKDkwLCAndGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlICE9PSB0aGlzLl9jdHguaW5zdGFuY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zaG93KCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9LCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY3R4Lmluc3RhbmNlLm9uRGlkRXhlY3V0ZVRleHQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9jdXNBZnRlclJ1biA9IF9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5Gb2N1c0FmdGVyUnVuKTtcblx0XHRcdGlmIChmb2N1c0FmdGVyUnVuID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRcdHRoaXMuX2N0eC5pbnN0YW5jZS5mb2N1cyh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZm9jdXNBZnRlclJ1biA9PT0gJ2FjY2Vzc2libGUtYnVmZmVyJykge1xuXHRcdFx0XHR0aGlzLnNob3coKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxBY2Nlc3NpYmlsaXR5U2V0dGluZ0lkLkFjY2Vzc2libGVWaWV3Rm9jdXNPbkNvbW1hbmRFeGVjdXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbW1hbmRFeGVjdXRlZExpc3RlbmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2N0eC5pbnN0YW5jZS5jYXBhYmlsaXRpZXMub25EaWRBZGRDYXBhYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUuY2FwYWJpbGl0eS50eXBlID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVDb21tYW5kRXhlY3V0ZWRMaXN0ZW5lcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHh0ZXJtUmVhZHkoeHRlcm06IElYdGVybVRlcm1pbmFsICYgeyByYXc6IFRlcm1pbmFsIH0pOiB2b2lkIHtcblx0XHRjb25zdCBhZGRvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRBcmVhU3luY0FkZG9uLCB0aGlzLl9jdHguaW5zdGFuY2UuY2FwYWJpbGl0aWVzKTtcblx0XHR4dGVybS5yYXcubG9hZEFkZG9uKGFkZG9uKTtcblx0XHRhZGRvbi5hY3RpdmF0ZSh4dGVybS5yYXcpO1xuXHRcdHRoaXMuX3h0ZXJtID0geHRlcm07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5feHRlcm0ucmF3Lm9uV3JpdGVQYXJzZWQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZSAhPT0gdGhpcy5fY3R4Lmluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9pc1Rlcm1pbmFsQWNjZXNzaWJsZVZpZXdPcGVuKCkgJiYgdGhpcy5feHRlcm0hLnJhdy5idWZmZXIuYWN0aXZlLmJhc2VZID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlclByb3ZpZGVyPy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb25SZXF1ZXN0VXBkYXRlRWRpdG9yID0gRXZlbnQubGF0Y2godGhpcy5feHRlcm0ucmF3Lm9uU2Nyb2xsKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvblJlcXVlc3RVcGRhdGVFZGl0b3IoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZSAhPT0gdGhpcy5fY3R4Lmluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9pc1Rlcm1pbmFsQWNjZXNzaWJsZVZpZXdPcGVuKCkpIHtcblx0XHRcdFx0dGhpcy5fYnVmZmVyUHJvdmlkZXI/LnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb21tYW5kRXhlY3V0ZWRMaXN0ZW5lcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2N0eC5pbnN0YW5jZS5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQWNjZXNzaWJpbGl0eVNldHRpbmdJZC5BY2Nlc3NpYmxlVmlld0ZvY3VzT25Db21tYW5kRXhlY3V0aW9uKSkge1xuXHRcdFx0dGhpcy5fb25EaWRSdW5Db21tYW5kLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9vbkRpZFJ1bkNvbW1hbmQudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYXBhYmlsaXR5ID0gdGhpcy5fY3R4Lmluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pITtcblx0XHR0aGlzLl9vbkRpZFJ1bkNvbW1hbmQudmFsdWUgPSBjYXBhYmlsaXR5Lm9uQ29tbWFuZEV4ZWN1dGVkKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jdHguaW5zdGFuY2UuaGFzRm9jdXMpIHtcblx0XHRcdFx0dGhpcy5zaG93KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1Rlcm1pbmFsQWNjZXNzaWJsZVZpZXdPcGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmdldFZhbHVlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSA9PT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3h0ZXJtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fYnVmZmVyVHJhY2tlcikge1xuXHRcdFx0dGhpcy5fYnVmZmVyVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ1ZmZlckNvbnRlbnRUcmFja2VyLCB0aGlzLl94dGVybSkpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2J1ZmZlclByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9idWZmZXJQcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsQWNjZXNzaWJsZUJ1ZmZlclByb3ZpZGVyLCB0aGlzLl9jdHguaW5zdGFuY2UsIHRoaXMuX2J1ZmZlclRyYWNrZXIsICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsQWNjZXNzaWJpbGl0eUhlbHBQcm92aWRlciwgdGhpcy5fY3R4Lmluc3RhbmNlLCB0aGlzLl94dGVybSEpKS5wcm92aWRlQ29udGVudCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1NlcnZpY2Uuc2hvdyh0aGlzLl9idWZmZXJQcm92aWRlcik7XG5cdH1cblx0bmF2aWdhdGVUb0NvbW1hbmQodHlwZTogTmF2aWdhdGlvblR5cGUpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50TGluZSA9IHRoaXMuX2FjY2Vzc2libGVWaWV3U2VydmljZS5nZXRQb3NpdGlvbihBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpPy5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gdGhpcy5fZ2V0Q29tbWFuZHNXaXRoRWRpdG9yTGluZSgpO1xuXHRcdGlmICghY29tbWFuZHM/Lmxlbmd0aCB8fCAhY3VycmVudExpbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRzID0gdHlwZSA9PT0gTmF2aWdhdGlvblR5cGUuUHJldmlvdXMgPyBjb21tYW5kcy5maWx0ZXIoYyA9PiBjLmxpbmVOdW1iZXIgPCBjdXJyZW50TGluZSkuc29ydCgoYSwgYikgPT4gYi5saW5lTnVtYmVyIC0gYS5saW5lTnVtYmVyKSA6IGNvbW1hbmRzLmZpbHRlcihjID0+IGMubGluZU51bWJlciA+IGN1cnJlbnRMaW5lKS5zb3J0KChhLCBiKSA9PiBhLmxpbmVOdW1iZXIgLSBiLmxpbmVOdW1iZXIpO1xuXHRcdGlmICghZmlsdGVyZWRDb21tYW5kcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZCA9IGZpbHRlcmVkQ29tbWFuZHNbMF07XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSBjb21tYW5kLmNvbW1hbmQuY29tbWFuZDtcblx0XHRpZiAoIWlzV2luZG93cyAmJiBjb21tYW5kTGluZSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbihjb21tYW5kLmxpbmVOdW1iZXIsIDEpLCB0cnVlKTtcblx0XHRcdHN0YXR1cyhjb21tYW5kTGluZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3U2VydmljZS5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oY29tbWFuZC5saW5lTnVtYmVyLCAxKSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbW1hbmQuZXhpdENvZGUpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC50ZXJtaW5hbENvbW1hbmRGYWlsZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwudGVybWluYWxDb21tYW5kU3VjY2VlZGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb21tYW5kc1dpdGhFZGl0b3JMaW5lKCk6IElDb21tYW5kV2l0aEVkaXRvckxpbmVbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FwYWJpbGl0eSA9IHRoaXMuX2N0eC5pbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRjb25zdCBjb21tYW5kcyA9IGNhcGFiaWxpdHk/LmNvbW1hbmRzO1xuXHRcdGNvbnN0IGN1cnJlbnRDb21tYW5kID0gY2FwYWJpbGl0eT8uY3VycmVudENvbW1hbmQ7XG5cdFx0aWYgKCFjb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSUNvbW1hbmRXaXRoRWRpdG9yTGluZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fZ2V0RWRpdG9yTGluZUZvckNvbW1hbmQoY29tbWFuZCk7XG5cdFx0XHRpZiAoIWxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCh7IGNvbW1hbmQsIGxpbmVOdW1iZXIsIGV4aXRDb2RlOiBjb21tYW5kLmV4aXRDb2RlIH0pO1xuXHRcdH1cblx0XHRpZiAoY3VycmVudENvbW1hbmQpIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSB0aGlzLl9nZXRFZGl0b3JMaW5lRm9yQ29tbWFuZChjdXJyZW50Q29tbWFuZCk7XG5cdFx0XHRpZiAoISFsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgY29tbWFuZDogY3VycmVudENvbW1hbmQsIGxpbmVOdW1iZXIgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JMaW5lRm9yQ29tbWFuZChjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIHwgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9idWZmZXJUcmFja2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBsaW5lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzRnVsbFRlcm1pbmFsQ29tbWFuZChjb21tYW5kKSkge1xuXHRcdFx0bGluZSA9IGNvbW1hbmQubWFya2VyPy5saW5lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lID0gY29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXI/LmxpbmU7XG5cdFx0fVxuXHRcdGlmIChsaW5lID09PSB1bmRlZmluZWQgfHwgbGluZSA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGluZSA9IHRoaXMuX2J1ZmZlclRyYWNrZXIuYnVmZmVyVG9FZGl0b3JMaW5lTWFwcGluZy5nZXQobGluZSk7XG5cdFx0aWYgKGxpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gbGluZSArIDE7XG5cdH1cblxufVxucmVnaXN0ZXJUZXJtaW5hbENvbnRyaWJ1dGlvbihUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uLklELCBUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uKTtcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsQWNjZXNzaWJpbGl0eUhlbHBDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0c3RhdGljIElEOiAndGVybWluYWxBY2Nlc3NpYmlsaXR5SGVscENvbnRyaWJ1dGlvbic7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihBY2Nlc3NpYmlsaXR5SGVscEFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbigxMDUsICd0ZXJtaW5hbCcsIGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2VydmljZSk7XG5cdFx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2libGVWaWV3U2VydmljZSk7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRlcm1pbmFsU2VydmljZS5nZXRBY3RpdmVPckNyZWF0ZUluc3RhbmNlKCk7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbFNlcnZpY2UucmV2ZWFsQWN0aXZlVGVybWluYWwoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsID0gaW5zdGFuY2U/Lnh0ZXJtO1xuXHRcdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhY2Nlc3NpYmxlVmlld1NlcnZpY2Uuc2hvdyhpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbEFjY2Vzc2liaWxpdHlIZWxwUHJvdmlkZXIsIGluc3RhbmNlLCB0ZXJtaW5hbCkpO1xuXHRcdH0sIENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIENvbnRleHRLZXlFeHByLmFuZChhY2Nlc3NpYmxlVmlld0lzU2hvd24sIENvbnRleHRLZXlFeHByLmVxdWFscyhhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmtleSwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsKSkpKSk7XG5cdH1cbn1cbnJlZ2lzdGVyVGVybWluYWxDb250cmlidXRpb24oVGVybWluYWxBY2Nlc3NpYmlsaXR5SGVscENvbnRyaWJ1dGlvbi5JRCwgVGVybWluYWxBY2Nlc3NpYmlsaXR5SGVscENvbnRyaWJ1dGlvbik7XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBBY3Rpb25zXG5cbmNsYXNzIEZvY3VzQWNjZXNzaWJsZUJ1ZmZlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVybWluYWxBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLkZvY3VzQWNjZXNzaWJsZUJ1ZmZlcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBY2Nlc3NpYmxlQnVmZmVyJywgXCJGb2N1cyBBY2Nlc3NpYmxlIFRlcm1pbmFsIFZpZXdcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkYyLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XSxcblx0XHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRjIgfCBLZXlNb2QuU2hpZnQsXG5cdFx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvd11cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2VydmljZSk7XG5cdFx0Y29uc3QgdGVybWluYWwgPSBhd2FpdCB0ZXJtaW5hbFNlcnZpY2UuZ2V0QWN0aXZlT3JDcmVhdGVJbnN0YW5jZSgpO1xuXHRcdGlmICghdGVybWluYWw/Lnh0ZXJtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdFRlcm1pbmFsQWNjZXNzaWJsZVZpZXdDb250cmlidXRpb24uZ2V0KHRlcm1pbmFsKT8uc2hvdygpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNBY2Nlc3NpYmxlQnVmZmVyQWN0aW9uKTtcblxucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuQWNjZXNzaWJsZUJ1ZmZlckdvVG9OZXh0Q29tbWFuZCxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5hY2Nlc3NpYmxlQnVmZmVyR29Ub05leHRDb21tYW5kJywgXCJBY2Nlc3NpYmxlIEJ1ZmZlciBHbyB0byBOZXh0IENvbW1hbmRcIiksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQsIENvbnRleHRLZXlFeHByLmFuZChhY2Nlc3NpYmxlVmlld0lzU2hvd24sIENvbnRleHRLZXlFeHByLmVxdWFscyhhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmtleSwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsKSkpLFxuXHRrZXliaW5kaW5nOiBbXG5cdFx0e1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmFuZChhY2Nlc3NpYmxlVmlld0lzU2hvd24sIENvbnRleHRLZXlFeHByLmVxdWFscyhhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmtleSwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsKSkpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAyXG5cdFx0fVxuXHRdLFxuXHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBjLnNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uLmdldChpbnN0YW5jZSk/Lm5hdmlnYXRlVG9Db21tYW5kKE5hdmlnYXRpb25UeXBlLk5leHQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuQWNjZXNzaWJsZUJ1ZmZlckdvVG9QcmV2aW91c0NvbW1hbmQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuYWNjZXNzaWJsZUJ1ZmZlckdvVG9QcmV2aW91c0NvbW1hbmQnLCBcIkFjY2Vzc2libGUgQnVmZmVyIEdvIHRvIFByZXZpb3VzIENvbW1hbmRcIiksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSwgQ29udGV4dEtleUV4cHIuYW5kKGFjY2Vzc2libGVWaWV3SXNTaG93biwgQ29udGV4dEtleUV4cHIuZXF1YWxzKGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQua2V5LCBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpKSksXG5cdGtleWJpbmRpbmc6IFtcblx0XHR7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmFuZChhY2Nlc3NpYmxlVmlld0lzU2hvd24sIENvbnRleHRLZXlFeHByLmVxdWFscyhhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmtleSwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsKSkpLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAyXG5cdFx0fVxuXHRdLFxuXHRydW46IGFzeW5jIChjKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBjLnNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRUZXJtaW5hbEFjY2Vzc2libGVWaWV3Q29udHJpYnV0aW9uLmdldChpbnN0YW5jZSk/Lm5hdmlnYXRlVG9Db21tYW5kKE5hdmlnYXRpb25UeXBlLlByZXZpb3VzKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRpZDogVGVybWluYWxBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLlNjcm9sbFRvQm90dG9tQWNjZXNzaWJsZVZpZXcsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVG9Cb3R0b21BY2Nlc3NpYmxlVmlldycsICdTY3JvbGwgdG8gQWNjZXNzaWJsZSBWaWV3IEJvdHRvbScpLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIENvbnRleHRLZXlFeHByLmFuZChhY2Nlc3NpYmxlVmlld0lzU2hvd24sIENvbnRleHRLZXlFeHByLmVxdWFscyhhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmtleSwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlRlcm1pbmFsKSkpLFxuXHRrZXliaW5kaW5nOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVuZCxcblx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVuZCB9LFxuXHRcdHdoZW46IGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQuaXNFcXVhbFRvKEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5UZXJtaW5hbCksXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0fSxcblx0cnVuOiAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2libGVWaWV3U2VydmljZSk7XG5cdFx0Y29uc3QgbGFzdFBvc2l0aW9uID0gYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLmdldExhc3RQb3NpdGlvbigpO1xuXHRcdGlmICghbGFzdFBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFjY2Vzc2libGVWaWV3U2VydmljZS5zZXRQb3NpdGlvbihsYXN0UG9zaXRpb24sIHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuU2Nyb2xsVG9Ub3BBY2Nlc3NpYmxlVmlldyxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxUb1RvcEFjY2Vzc2libGVWaWV3JywgJ1Njcm9sbCB0byBBY2Nlc3NpYmxlIFZpZXcgVG9wJyksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSwgQ29udGV4dEtleUV4cHIuYW5kKGFjY2Vzc2libGVWaWV3SXNTaG93biwgQ29udGV4dEtleUV4cHIuZXF1YWxzKGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQua2V5LCBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpKSksXG5cdGtleWJpbmRpbmc6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuSG9tZSxcblx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkhvbWUgfSxcblx0XHR3aGVuOiBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLmlzRXF1YWxUbyhBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuVGVybWluYWwpLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdH0sXG5cdHJ1bjogKGMsIGFjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2libGVWaWV3U2VydmljZSk/LnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSwgdHJ1ZSlcbn0pO1xuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywwQkFBMEIsd0JBQXdCLHNCQUFzQjtBQUNqRixTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyxTQUFTLHVCQUF1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QUFlLFFBQVE7QUFBQSxFQUM1RjtBQUNELENBQUM7QUFFRCx1QkFBdUI7QUFBQSxFQUN0QixJQUFJLCtCQUErQjtBQUFBLEVBQ25DLE9BQU8sVUFBVSwwREFBMEQsa0NBQWtDO0FBQUEsRUFDN0csY0FBYyxlQUFlLElBQUksZUFBZSxHQUFHLG9CQUFvQixrQkFBa0Isb0JBQW9CLHNCQUFzQixHQUFHLGVBQWUsSUFBSSx1QkFBdUIsZUFBZSxPQUFPLGdDQUFnQyxLQUFLLHlCQUF5QixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQzlRLFlBQVk7QUFBQSxJQUNYLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxJQUNsQyxPQUFPLEVBQUUsU0FBUyxPQUFPLFFBQVEsUUFBUSxJQUFJO0FBQUEsSUFDN0MsTUFBTSxnQ0FBZ0MsVUFBVSx5QkFBeUIsUUFBUTtBQUFBLElBQ2pGLFFBQVEsaUJBQWlCO0FBQUEsRUFDMUI7QUFBQSxFQUNBLEtBQUssQ0FBQyxHQUFHLGFBQWE7QUFDckIsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLGVBQWUsc0JBQXNCLGdCQUFnQjtBQUMzRCxRQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLElBQ0Q7QUFDQSwwQkFBc0IsWUFBWSxjQUFjLElBQUk7QUFBQSxFQUNyRDtBQUNELENBQUM7QUFFRCx1QkFBdUI7QUFBQSxFQUN0QixJQUFJLCtCQUErQjtBQUFBLEVBQ25DLE9BQU8sVUFBVSx1REFBdUQsK0JBQStCO0FBQUEsRUFDdkcsY0FBYyxlQUFlLElBQUksZUFBZSxHQUFHLG9CQUFvQixrQkFBa0Isb0JBQW9CLHNCQUFzQixHQUFHLGVBQWUsSUFBSSx1QkFBdUIsZUFBZSxPQUFPLGdDQUFnQyxLQUFLLHlCQUF5QixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQzlRLFlBQVk7QUFBQSxJQUNYLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxJQUNsQyxPQUFPLEVBQUUsU0FBUyxPQUFPLFFBQVEsUUFBUSxLQUFLO0FBQUEsSUFDOUMsTUFBTSxnQ0FBZ0MsVUFBVSx5QkFBeUIsUUFBUTtBQUFBLElBQ2pGLFFBQVEsaUJBQWlCO0FBQUEsRUFDMUI7QUFBQSxFQUNBLEtBQUssQ0FBQyxHQUFHLGFBQWEsU0FBUyxJQUFJLHNCQUFzQixHQUFHLFlBQVksSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUk7QUFDakcsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
