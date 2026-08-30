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
import { renderFormattedText } from "../../../../../base/browser/formattedTextRenderer.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { KeybindingLabel } from "../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { OS } from "../../../../../base/common/platform.js";
import { hasKey } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { AccessibilityVerbositySettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { IChatAgentService } from "../../../chat/common/participants/chatAgents.js";
import { ChatAgentLocation } from "../../../chat/common/constants.js";
import { ITerminalConfigurationService } from "../../../terminal/browser/terminal.js";
import { registerTerminalContribution } from "../../../terminal/browser/terminalExtensions.js";
import { TerminalInstance } from "../../../terminal/browser/terminalInstance.js";
import { TerminalInitialHintSettingId } from "../common/terminalInitialHintConfiguration.js";
import "./media/terminalInitialHint.css";
import { TerminalSuggestCommandId } from "../../suggest/common/terminal.suggest.js";
import { TerminalSuggestSettingId } from "../../suggest/common/terminalSuggestConfiguration.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
const $ = dom.$;
class InitialHintAddon extends Disposable {
  constructor(_capabilities, _onDidChangeAgents) {
    super();
    this._capabilities = _capabilities;
    this._onDidChangeAgents = _onDidChangeAgents;
    this._onDidRequestCreateHint = this._register(new Emitter());
    this._disposables = this._register(new MutableDisposable());
  }
  get onDidRequestCreateHint() {
    return this._onDidRequestCreateHint.event;
  }
  activate(terminal) {
    const store = this._register(new DisposableStore());
    this._disposables.value = store;
    const capability = this._capabilities.get(TerminalCapability.CommandDetection);
    if (capability) {
      store.add(Event.once(capability.promptInputModel.onDidStartInput)(() => this._onDidRequestCreateHint.fire()));
    } else {
      this._register(this._capabilities.onDidAddCapability((e) => {
        if (e.id === TerminalCapability.CommandDetection) {
          const capability2 = e.capability;
          store.add(Event.once(capability2.promptInputModel.onDidStartInput)(() => this._onDidRequestCreateHint.fire()));
          if (!capability2.promptInputModel.value) {
            this._onDidRequestCreateHint.fire();
          }
        }
      }));
    }
    const agentListener = this._onDidChangeAgents((e) => {
      if (e?.locations.includes(ChatAgentLocation.Terminal)) {
        this._onDidRequestCreateHint.fire();
        agentListener.dispose();
      }
    });
    this._disposables.value?.add(agentListener);
  }
}
let TerminalInitialHintContribution = class extends Disposable {
  constructor(_ctx, _chatAgentService, _configurationService, _instantiationService, _terminalConfigurationService) {
    super();
    this._ctx = _ctx;
    this._chatAgentService = _chatAgentService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._decoration = this._register(new MutableDisposable());
    this._cursorMoveListener = this._register(new MutableDisposable());
  }
  static get(instance) {
    return instance.getContribution(TerminalInitialHintContribution.ID);
  }
  xtermOpen(xterm) {
    if (hasKey(this._ctx.instance, { shellLaunchConfig: true }) && (this._ctx.instance.shellLaunchConfig.isExtensionOwnedTerminal || this._ctx.instance.shellLaunchConfig.isFeatureTerminal || this._ctx.instance.shellLaunchConfig.hideFromUser)) {
      return;
    }
    if (!this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
      return;
    }
    if (this._terminalConfigurationService.config.sendKeybindingsToShell) {
      return;
    }
    this._xterm = xterm;
    this._addon = this._register(this._instantiationService.createInstance(InitialHintAddon, this._ctx.instance.capabilities, this._chatAgentService.onDidChangeAgents));
    this._xterm.raw.loadAddon(this._addon);
    this._register(this._addon.onDidRequestCreateHint(() => this._createHint()));
  }
  _disposeHint() {
    this._hintWidget?.remove();
    this._hintWidget = void 0;
    this._decoration.clear();
  }
  _createHint() {
    const instance = this._ctx.instance instanceof TerminalInstance ? this._ctx.instance : void 0;
    const commandDetectionCapability = instance?.capabilities.get(TerminalCapability.CommandDetection);
    if (!instance || !this._xterm || this._hintWidget || !commandDetectionCapability || commandDetectionCapability.promptInputModel.value || !!instance.shellLaunchConfig.attachPersistentProcess || commandDetectionCapability.commands.length > 0) {
      return;
    }
    if (!this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
      return;
    }
    if (!this._decoration.value) {
      const marker = this._xterm.raw.registerMarker();
      if (!marker) {
        return;
      }
      if (this._xterm.raw.buffer.active.cursorX === 0) {
        return;
      }
      this._register(marker);
      this._decoration.value = this._xterm.raw.registerDecoration({
        marker,
        x: this._xterm.raw.buffer.active.cursorX + 1
      });
    }
    this._register(this._xterm.raw.onKey(() => this.dispose()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled) && !this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
        this.dispose();
      }
    }));
    const inputModel = commandDetectionCapability.promptInputModel;
    if (inputModel) {
      this._register(inputModel.onDidChangeInput(() => {
        if (inputModel.value) {
          this.dispose();
        }
      }));
    }
    this._cursorMoveListener.value = this._xterm.raw.onCursorMove(() => {
      if (!inputModel?.value) {
        this._disposeHint();
        this._createHint();
      }
    });
    if (!this._decoration.value) {
      return;
    }
    this._register(this._decoration.value.onRender((e) => {
      if (!this._hintWidget && this._xterm?.isFocused) {
        const widget = this._register(this._instantiationService.createInstance(TerminalInitialHintWidget, instance));
        this._addon?.dispose();
        this._hintWidget = widget.getDomNode();
        if (!this._hintWidget) {
          return;
        }
        e.appendChild(this._hintWidget);
        e.classList.add("terminal-initial-hint");
        const font = this._xterm.getFont();
        if (font) {
          e.style.fontFamily = font.fontFamily;
          e.style.fontSize = font.fontSize + "px";
        }
      }
      if (this._hintWidget && this._xterm) {
        const decoration = this._hintWidget.parentElement;
        if (decoration) {
          decoration.style.width = (this._xterm.raw.cols - this._xterm.raw.buffer.active.cursorX) / this._xterm.raw.cols * 100 + "%";
        }
      }
    }));
  }
};
TerminalInitialHintContribution.ID = "terminal.initialHint";
TerminalInitialHintContribution = __decorateClass([
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITerminalConfigurationService)
], TerminalInitialHintContribution);
registerTerminalContribution(TerminalInitialHintContribution.ID, TerminalInitialHintContribution, false);
let TerminalInitialHintWidget = class extends Disposable {
  constructor(_instance, _chatEntitlementService, _commandService, _configurationService, _contextMenuService, _keybindingService, _telemetryService) {
    super();
    this._instance = _instance;
    this._chatEntitlementService = _chatEntitlementService;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._telemetryService = _telemetryService;
    this._toDispose = this._register(new DisposableStore());
    this._isVisible = false;
    this._ariaLabel = "";
    this._toDispose.add(_instance.onDidFocus(() => {
      if (this._instance.hasFocus && this._isVisible && this._ariaLabel && this._configurationService.getValue(AccessibilityVerbositySettingId.TerminalInlineChat)) {
        status(this._ariaLabel);
      }
    }));
    this._toDispose.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled) && !this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
        this.dispose();
      }
    }));
  }
  /**
   * Creates wrapped hint elements with click listeners for responsive hint layouts.
   * Returns a before link and an after prose span containing a link.
   */
  _createWrappedHintElements(text, keybindingLabel, clickHandler) {
    const [beforeText, afterText] = text.split(keybindingLabel);
    const before = $("a", void 0, beforeText);
    this._toDispose.add(dom.addDisposableListener(before, dom.EventType.CLICK, clickHandler));
    const after = $("span.terminal-initial-hint-prose", void 0);
    const afterLink = $("a", void 0, afterText);
    this._toDispose.add(dom.addDisposableListener(afterLink, dom.EventType.CLICK, clickHandler));
    after.appendChild(afterLink);
    return { before, after };
  }
  _getHintContent() {
    const ariaLabelParts = [];
    const handleDontShowClick = () => {
      this._configurationService.updateValue(TerminalInitialHintSettingId.Enabled, false);
    };
    const dontShowHintHandler = {
      disposables: this._toDispose,
      callback: (index, _event) => {
        switch (index) {
          case "0":
            handleDontShowClick();
            break;
        }
      }
    };
    const hintElement = $("div.terminal-initial-hint");
    hintElement.style.display = "block";
    const aiFeaturesHidden = this._chatEntitlementService.sentiment.hidden;
    if (!aiFeaturesHidden) {
      const handleCopilotCliClick = () => {
        this._telemetryService.publicLog2("workbenchActionExecuted", {
          id: "terminalCopilotCli.hintAction",
          from: "hint"
        });
        this._instance.sendText("copilot", false);
      };
      const copilotCliHint = localize({
        key: "copilotCliHint",
        comment: [
          "Preserve double-square brackets and their order"
        ]
      }, "Type [[copilot]] to use Copilot CLI.");
      const copilotCliHintHandler = {
        callback: () => handleCopilotCliClick(),
        disposables: this._toDispose
      };
      hintElement.appendChild(renderFormattedText(copilotCliHint, { actionHandler: copilotCliHintHandler }));
      ariaLabelParts.push(localize("copilotCliHintAriaLabel", "Type copilot to use Copilot CLI."));
    }
    const suggestEnabled = aiFeaturesHidden && this._configurationService.getValue(TerminalSuggestSettingId.Enabled);
    const suggestKeybinding = suggestEnabled ? this._keybindingService.lookupKeybinding(TerminalSuggestCommandId.TriggerSuggest) : void 0;
    const suggestKeybindingLabel = suggestKeybinding?.getLabel();
    if (suggestKeybinding && suggestKeybindingLabel) {
      const suggestActionPart = localize("showSuggestHint", "Show suggestions {0}. ", suggestKeybindingLabel);
      const handleSuggestClick = () => {
        this._commandService.executeCommand(TerminalSuggestCommandId.TriggerSuggest);
      };
      const { before: suggestBefore, after: suggestAfter } = this._createWrappedHintElements(suggestActionPart, suggestKeybindingLabel, handleSuggestClick);
      hintElement.appendChild(suggestBefore);
      const suggestLabel = this._toDispose.add(new KeybindingLabel(hintElement, OS));
      suggestLabel.set(suggestKeybinding);
      suggestLabel.element.style.width = "min-content";
      suggestLabel.element.style.display = "inline";
      suggestLabel.element.style.cursor = "pointer";
      this._toDispose.add(dom.addDisposableListener(suggestLabel.element, dom.EventType.CLICK, handleSuggestClick));
      hintElement.appendChild(suggestAfter);
      hintElement.appendChild($("span.terminal-initial-hint-separator"));
      ariaLabelParts.push(suggestActionPart);
    }
    if (ariaLabelParts.length === 0) {
      return void 0;
    }
    const typeToDismiss = localize({
      key: "hintTextDismiss",
      comment: [
        "Preserve double-square brackets and their order"
      ]
    }, "[[don't show]] this again.");
    const typeToDismissRendered = renderFormattedText(typeToDismiss, { actionHandler: dontShowHintHandler });
    typeToDismissRendered.classList.add("detail", "terminal-initial-hint-prose");
    const proseBefore = $("span.terminal-initial-hint-prose", void 0, localize("hintTextDismissProse", " Start typing to dismiss or "));
    hintElement.appendChild(proseBefore);
    hintElement.appendChild(typeToDismissRendered);
    const typeToDismissCompact = localize({
      key: "hintTextDismissCompact",
      comment: [
        "Preserve double-square brackets and their order"
      ]
    }, "[[Don't show this again]]");
    const typeToDismissCompactRendered = renderFormattedText(typeToDismissCompact, { actionHandler: dontShowHintHandler });
    typeToDismissCompactRendered.classList.add("detail", "terminal-initial-hint-compact");
    hintElement.appendChild(typeToDismissCompactRendered);
    ariaLabelParts.push(localize("hintTextDismissAriaLabel", "Start typing to dismiss or don't show this again."));
    return { ariaLabel: ariaLabelParts.join(" "), hintElement };
  }
  getDomNode() {
    if (!this._domNode) {
      const result = this._getHintContent();
      if (!result) {
        return void 0;
      }
      const { hintElement, ariaLabel } = result;
      this._domNode = $(".terminal-initial-hint");
      this._domNode.style.paddingLeft = "4px";
      this._domNode.append(hintElement);
      this._ariaLabel = ariaLabel.concat(localize("disableHint", " Toggle {0} in settings to disable this hint.", AccessibilityVerbositySettingId.TerminalInlineChat));
      this._toDispose.add(dom.addDisposableListener(this._domNode, "click", () => {
        this._domNode?.remove();
        this._domNode = void 0;
      }));
      this._toDispose.add(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, (e) => {
        this._contextMenuService.showContextMenu({
          getAnchor: () => {
            return new StandardMouseEvent(dom.getActiveWindow(), e);
          },
          getActions: () => {
            return [
              {
                id: "workench.action.disableTerminalInitialHint",
                label: localize("disableInitialHint", "Disable Initial Hint"),
                tooltip: localize("disableInitialHint", "Disable Initial Hint"),
                enabled: true,
                class: void 0,
                run: () => this._configurationService.updateValue(TerminalInitialHintSettingId.Enabled, false)
              }
            ];
          }
        });
      }));
    }
    return this._domNode;
  }
  dispose() {
    this._domNode?.remove();
    super.dispose();
  }
};
TerminalInitialHintWidget = __decorateClass([
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ITelemetryService)
], TerminalInitialHintWidget);
export {
  InitialHintAddon,
  TerminalInitialHintContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcaW5saW5lSGludFxcYnJvd3NlclxcdGVybWluYWwuaW5pdGlhbEhpbnQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB0eXBlIHsgSURlY29yYXRpb24sIElUZXJtaW5hbEFkZG9uLCBUZXJtaW5hbCBhcyBSYXdYdGVybVRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElDb250ZW50QWN0aW9uSGFuZGxlciwgcmVuZGVyRm9ybWF0dGVkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsQ29udHJpYnV0aW9uLCBJVGVybWluYWxJbnN0YW5jZSwgSVh0ZXJtVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGVybWluYWxDb250cmlidXRpb24sIHR5cGUgSURldGFjaGVkQ29tcGF0aWJsZVRlcm1pbmFsQ29udHJpYnV0aW9uQ29udGV4dCwgdHlwZSBJVGVybWluYWxDb250cmlidXRpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxJbnN0YW5jZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEluaXRpYWxIaW50U2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsSW5pdGlhbEhpbnRDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCAnLi9tZWRpYS90ZXJtaW5hbEluaXRpYWxIaW50LmNzcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN1Z2dlc3RDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9zdWdnZXN0L2NvbW1vbi90ZXJtaW5hbC5zdWdnZXN0LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL3N1Z2dlc3QvY29tbW9uL3Rlcm1pbmFsU3VnZ2VzdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgY2xhc3MgSW5pdGlhbEhpbnRBZGRvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxBZGRvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdENyZWF0ZUhpbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkUmVxdWVzdENyZWF0ZUhpbnQoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRSZXF1ZXN0Q3JlYXRlSGludC5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudDxJQ2hhdEFnZW50IHwgdW5kZWZpbmVkPikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0YWN0aXZhdGUodGVybWluYWw6IFJhd1h0ZXJtVGVybWluYWwpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHRjb25zdCBjYXBhYmlsaXR5ID0gdGhpcy5fY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0aWYgKGNhcGFiaWxpdHkpIHtcblx0XHRcdHN0b3JlLmFkZChFdmVudC5vbmNlKGNhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC5vbkRpZFN0YXJ0SW5wdXQpKCgpID0+IHRoaXMuX29uRGlkUmVxdWVzdENyZWF0ZUhpbnQuZmlyZSgpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NhcGFiaWxpdGllcy5vbkRpZEFkZENhcGFiaWxpdHkoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmlkID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGNhcGFiaWxpdHkgPSBlLmNhcGFiaWxpdHk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKEV2ZW50Lm9uY2UoY2FwYWJpbGl0eS5wcm9tcHRJbnB1dE1vZGVsLm9uRGlkU3RhcnRJbnB1dCkoKCkgPT4gdGhpcy5fb25EaWRSZXF1ZXN0Q3JlYXRlSGludC5maXJlKCkpKTtcblx0XHRcdFx0XHRpZiAoIWNhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC52YWx1ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0Q3JlYXRlSGludC5maXJlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFnZW50TGlzdGVuZXIgPSB0aGlzLl9vbkRpZENoYW5nZUFnZW50cygoZSkgPT4ge1xuXHRcdFx0aWYgKGU/LmxvY2F0aW9ucy5pbmNsdWRlcyhDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0Q3JlYXRlSGludC5maXJlKCk7XG5cdFx0XHRcdGFnZW50TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlPy5hZGQoYWdlbnRMaXN0ZW5lcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsSW5pdGlhbEhpbnRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Rlcm1pbmFsLmluaXRpYWxIaW50JztcblxuXHRwcml2YXRlIF9hZGRvbjogSW5pdGlhbEhpbnRBZGRvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9oaW50V2lkZ2V0OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRzdGF0aWMgZ2V0KGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UpOiBUZXJtaW5hbEluaXRpYWxIaW50Q29udHJpYnV0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGluc3RhbmNlLmdldENvbnRyaWJ1dGlvbjxUZXJtaW5hbEluaXRpYWxIaW50Q29udHJpYnV0aW9uPihUZXJtaW5hbEluaXRpYWxIaW50Q29udHJpYnV0aW9uLklEKTtcblx0fVxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEZWNvcmF0aW9uPigpKTtcblx0cHJpdmF0ZSBfeHRlcm06IElYdGVybVRlcm1pbmFsICYgeyByYXc6IFJhd1h0ZXJtVGVybWluYWwgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3Vyc29yTW92ZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2N0eDogSVRlcm1pbmFsQ29udHJpYnV0aW9uQ29udGV4dCB8IElEZXRhY2hlZENvbXBhdGlibGVUZXJtaW5hbENvbnRyaWJ1dGlvbkNvbnRleHQsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0eHRlcm1PcGVuKHh0ZXJtOiBJWHRlcm1UZXJtaW5hbCAmIHsgcmF3OiBSYXdYdGVybVRlcm1pbmFsIH0pOiB2b2lkIHtcblx0XHQvLyBEb24ndCBzaG93IGlmIHRoZSB0ZXJtaW5hbCB3YXMgbGF1bmNoZWQgYnkgYW4gZXh0ZW5zaW9uIG9yIGEgZmVhdHVyZSBsaWtlIGRlYnVnXG5cdFx0aWYgKGhhc0tleSh0aGlzLl9jdHguaW5zdGFuY2UsIHsgc2hlbGxMYXVuY2hDb25maWc6IHRydWUgfSkgJiYgKHRoaXMuX2N0eC5pbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5pc0V4dGVuc2lvbk93bmVkVGVybWluYWwgfHwgdGhpcy5fY3R4Lmluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsIHx8IHRoaXMuX2N0eC5pbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERvbid0IHNob3cgaWYgZGlzYWJsZWRcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsSW5pdGlhbEhpbnRTZXR0aW5nSWQuRW5hYmxlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRG9uJ3Qgc2hvdyBpZiBrZXliaW5kaW5ncyBhcmUgc2VudCB0byBzaGVsbCwgdGhlIGhpbnQncyBrZXliaW5kaW5ncyB3b24ndCB3b3JrXG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnNlbmRLZXliaW5kaW5nc1RvU2hlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5feHRlcm0gPSB4dGVybTtcblx0XHR0aGlzLl9hZGRvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluaXRpYWxIaW50QWRkb24sIHRoaXMuX2N0eC5pbnN0YW5jZS5jYXBhYmlsaXRpZXMsIHRoaXMuX2NoYXRBZ2VudFNlcnZpY2Uub25EaWRDaGFuZ2VBZ2VudHMpKTtcblx0XHR0aGlzLl94dGVybS5yYXcubG9hZEFkZG9uKHRoaXMuX2FkZG9uKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZGRvbi5vbkRpZFJlcXVlc3RDcmVhdGVIaW50KCgpID0+IHRoaXMuX2NyZWF0ZUhpbnQoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUhpbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5faGludFdpZGdldD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5faGludFdpZGdldCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kZWNvcmF0aW9uLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVIaW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fY3R4Lmluc3RhbmNlIGluc3RhbmNlb2YgVGVybWluYWxJbnN0YW5jZSA/IHRoaXMuX2N0eC5pbnN0YW5jZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSA9IGluc3RhbmNlPy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpZiAoIWluc3RhbmNlIHx8ICF0aGlzLl94dGVybSB8fCB0aGlzLl9oaW50V2lkZ2V0IHx8ICFjb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB8fCBjb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5wcm9tcHRJbnB1dE1vZGVsLnZhbHVlIHx8ICEhaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MgfHwgY29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkuY29tbWFuZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxJbml0aWFsSGludFNldHRpbmdJZC5FbmFibGVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZGVjb3JhdGlvbi52YWx1ZSkge1xuXHRcdFx0Y29uc3QgbWFya2VyID0gdGhpcy5feHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKCk7XG5cdFx0XHRpZiAoIW1hcmtlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl94dGVybS5yYXcuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1hcmtlcik7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uLnZhbHVlID0gdGhpcy5feHRlcm0ucmF3LnJlZ2lzdGVyRGVjb3JhdGlvbih7XG5cdFx0XHRcdG1hcmtlcixcblx0XHRcdFx0eDogdGhpcy5feHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUuY3Vyc29yWCArIDEsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl94dGVybS5yYXcub25LZXkoKCkgPT4gdGhpcy5kaXNwb3NlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsSW5pdGlhbEhpbnRTZXR0aW5nSWQuRW5hYmxlZCkgJiYgIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsSW5pdGlhbEhpbnRTZXR0aW5nSWQuRW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5wdXRNb2RlbCA9IGNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWw7XG5cdFx0aWYgKGlucHV0TW9kZWwpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGlucHV0TW9kZWwub25EaWRDaGFuZ2VJbnB1dCgoKSA9PiB7XG5cdFx0XHRcdGlmIChpbnB1dE1vZGVsLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBMaXN0ZW4gdG8gY3Vyc29yIG1vdmUgYW5kIHJlY3JlYXRlIHRoZSBoaW50IChvbmx5IGlmIG5vIGlucHV0IGhhcyBiZWVuIHJlY2VpdmVkKVxuXHRcdC8vIEZpeGVzICMyODYwODAgYW4gaXNzdWUgd2hlcmUgdGhlIGhpbnQgd291bGQgbm90IHJlcG9zaXRpb24gY29ycmVjdGx5IHdoZW4gdGhlIHRlcm1pbmFsJ3MgcHJvbXB0IGNoYW5nZWRcblx0XHR0aGlzLl9jdXJzb3JNb3ZlTGlzdGVuZXIudmFsdWUgPSB0aGlzLl94dGVybS5yYXcub25DdXJzb3JNb3ZlKCgpID0+IHtcblx0XHRcdGlmICghaW5wdXRNb2RlbD8udmFsdWUpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZUhpbnQoKTtcblx0XHRcdFx0dGhpcy5fY3JlYXRlSGludCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9uLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlY29yYXRpb24udmFsdWUub25SZW5kZXIoKGUpID0+IHtcblx0XHRcdGlmICghdGhpcy5faGludFdpZGdldCAmJiB0aGlzLl94dGVybT8uaXNGb2N1c2VkKSB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSW5pdGlhbEhpbnRXaWRnZXQsIGluc3RhbmNlKSk7XG5cdFx0XHRcdHRoaXMuX2FkZG9uPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2hpbnRXaWRnZXQgPSB3aWRnZXQuZ2V0RG9tTm9kZSgpO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2hpbnRXaWRnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZS5hcHBlbmRDaGlsZCh0aGlzLl9oaW50V2lkZ2V0KTtcblx0XHRcdFx0ZS5jbGFzc0xpc3QuYWRkKCd0ZXJtaW5hbC1pbml0aWFsLWhpbnQnKTtcblx0XHRcdFx0Y29uc3QgZm9udCA9IHRoaXMuX3h0ZXJtLmdldEZvbnQoKTtcblx0XHRcdFx0aWYgKGZvbnQpIHtcblx0XHRcdFx0XHRlLnN0eWxlLmZvbnRGYW1pbHkgPSBmb250LmZvbnRGYW1pbHk7XG5cdFx0XHRcdFx0ZS5zdHlsZS5mb250U2l6ZSA9IGZvbnQuZm9udFNpemUgKyAncHgnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faGludFdpZGdldCAmJiB0aGlzLl94dGVybSkge1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5faGludFdpZGdldC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbikge1xuXHRcdFx0XHRcdGRlY29yYXRpb24uc3R5bGUud2lkdGggPSAodGhpcy5feHRlcm0ucmF3LmNvbHMgLSB0aGlzLl94dGVybS5yYXcuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYKSAvIHRoaXMuX3h0ZXJtIS5yYXcuY29scyAqIDEwMCArICclJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxucmVnaXN0ZXJUZXJtaW5hbENvbnRyaWJ1dGlvbihUZXJtaW5hbEluaXRpYWxIaW50Q29udHJpYnV0aW9uLklELCBUZXJtaW5hbEluaXRpYWxIaW50Q29udHJpYnV0aW9uLCBmYWxzZSk7XG5cbmNsYXNzIFRlcm1pbmFsSW5pdGlhbEhpbnRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9kb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9EaXNwb3NlOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9pc1Zpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYXJpYUxhYmVsOiBzdHJpbmcgPSAnJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChfaW5zdGFuY2Uub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faW5zdGFuY2UuaGFzRm9jdXMgJiYgdGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2FyaWFMYWJlbCAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsSW5saW5lQ2hhdCkpIHtcblx0XHRcdFx0c3RhdHVzKHRoaXMuX2FyaWFMYWJlbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxJbml0aWFsSGludFNldHRpbmdJZC5FbmFibGVkKSAmJiAhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxJbml0aWFsSGludFNldHRpbmdJZC5FbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyB3cmFwcGVkIGhpbnQgZWxlbWVudHMgd2l0aCBjbGljayBsaXN0ZW5lcnMgZm9yIHJlc3BvbnNpdmUgaGludCBsYXlvdXRzLlxuXHQgKiBSZXR1cm5zIGEgYmVmb3JlIGxpbmsgYW5kIGFuIGFmdGVyIHByb3NlIHNwYW4gY29udGFpbmluZyBhIGxpbmsuXG5cdCAqL1xuXHRwcml2YXRlIF9jcmVhdGVXcmFwcGVkSGludEVsZW1lbnRzKHRleHQ6IHN0cmluZywga2V5YmluZGluZ0xhYmVsOiBzdHJpbmcsIGNsaWNrSGFuZGxlcjogKCkgPT4gdm9pZCk6IHsgYmVmb3JlOiBIVE1MQW5jaG9yRWxlbWVudDsgYWZ0ZXI6IEhUTUxTcGFuRWxlbWVudCB9IHtcblx0XHRjb25zdCBbYmVmb3JlVGV4dCwgYWZ0ZXJUZXh0XSA9IHRleHQuc3BsaXQoa2V5YmluZGluZ0xhYmVsKTtcblx0XHRjb25zdCBiZWZvcmUgPSAkKCdhJywgdW5kZWZpbmVkLCBiZWZvcmVUZXh0KSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmVmb3JlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBjbGlja0hhbmRsZXIpKTtcblx0XHRjb25zdCBhZnRlciA9ICQoJ3NwYW4udGVybWluYWwtaW5pdGlhbC1oaW50LXByb3NlJywgdW5kZWZpbmVkKSBhcyBIVE1MU3BhbkVsZW1lbnQ7XG5cdFx0Y29uc3QgYWZ0ZXJMaW5rID0gJCgnYScsIHVuZGVmaW5lZCwgYWZ0ZXJUZXh0KTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYWZ0ZXJMaW5rLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBjbGlja0hhbmRsZXIpKTtcblx0XHRhZnRlci5hcHBlbmRDaGlsZChhZnRlckxpbmspO1xuXHRcdHJldHVybiB7IGJlZm9yZSwgYWZ0ZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEhpbnRDb250ZW50KCkge1xuXHRcdGNvbnN0IGFyaWFMYWJlbFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3QgaGFuZGxlRG9udFNob3dDbGljayA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlcm1pbmFsSW5pdGlhbEhpbnRTZXR0aW5nSWQuRW5hYmxlZCwgZmFsc2UpO1xuXHRcdH07XG5cblx0XHRjb25zdCBkb250U2hvd0hpbnRIYW5kbGVyOiBJQ29udGVudEFjdGlvbkhhbmRsZXIgPSB7XG5cdFx0XHRkaXNwb3NhYmxlczogdGhpcy5fdG9EaXNwb3NlLFxuXHRcdFx0Y2FsbGJhY2s6IChpbmRleCwgX2V2ZW50KSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoaW5kZXgpIHtcblx0XHRcdFx0XHRjYXNlICcwJzpcblx0XHRcdFx0XHRcdGhhbmRsZURvbnRTaG93Q2xpY2soKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGhpbnRFbGVtZW50ID0gJCgnZGl2LnRlcm1pbmFsLWluaXRpYWwtaGludCcpO1xuXHRcdGhpbnRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXG5cdFx0Y29uc3QgYWlGZWF0dXJlc0hpZGRlbiA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmhpZGRlbjtcblxuXHRcdC8vIENvcGlsb3QgQ0xJIGhpbnQgKG9ubHkgc2hvd24gd2hlbiBBSSBmZWF0dXJlcyBhcmUgZW5hYmxlZClcblx0XHRpZiAoIWFpRmVhdHVyZXNIaWRkZW4pIHtcblx0XHRcdGNvbnN0IGhhbmRsZUNvcGlsb3RDbGlDbGljayA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHtcblx0XHRcdFx0XHRpZDogJ3Rlcm1pbmFsQ29waWxvdENsaS5oaW50QWN0aW9uJyxcblx0XHRcdFx0XHRmcm9tOiAnaGludCdcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2luc3RhbmNlLnNlbmRUZXh0KCdjb3BpbG90JywgZmFsc2UpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNvcGlsb3RDbGlIaW50ID0gbG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICdjb3BpbG90Q2xpSGludCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnUHJlc2VydmUgZG91YmxlLXNxdWFyZSBicmFja2V0cyBhbmQgdGhlaXIgb3JkZXInLFxuXHRcdFx0XHRdXG5cdFx0XHR9LCBcIlR5cGUgW1tjb3BpbG90XV0gdG8gdXNlIENvcGlsb3QgQ0xJLlwiKTtcblx0XHRcdGNvbnN0IGNvcGlsb3RDbGlIaW50SGFuZGxlcjogSUNvbnRlbnRBY3Rpb25IYW5kbGVyID0ge1xuXHRcdFx0XHRjYWxsYmFjazogKCkgPT4gaGFuZGxlQ29waWxvdENsaUNsaWNrKCksXG5cdFx0XHRcdGRpc3Bvc2FibGVzOiB0aGlzLl90b0Rpc3Bvc2Vcblx0XHRcdH07XG5cdFx0XHRoaW50RWxlbWVudC5hcHBlbmRDaGlsZChyZW5kZXJGb3JtYXR0ZWRUZXh0KGNvcGlsb3RDbGlIaW50LCB7IGFjdGlvbkhhbmRsZXI6IGNvcGlsb3RDbGlIaW50SGFuZGxlciB9KSk7XG5cdFx0XHRhcmlhTGFiZWxQYXJ0cy5wdXNoKGxvY2FsaXplKCdjb3BpbG90Q2xpSGludEFyaWFMYWJlbCcsIFwiVHlwZSBjb3BpbG90IHRvIHVzZSBDb3BpbG90IENMSS5cIikpO1xuXHRcdH1cblxuXHRcdC8vIFN1Z2dlc3QgaGludCAtIG9ubHkgc2hvd24gd2hlbiBBSSBmZWF0dXJlcyBhcmUgaGlkZGVuIChvdGhlcndpc2UgdGhlIENvcGlsb3QgQ0xJIGhpbnQgdGFrZXMgcHJlY2VkZW5jZSlcblx0XHRjb25zdCBzdWdnZXN0RW5hYmxlZCA9IGFpRmVhdHVyZXNIaWRkZW4gJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLkVuYWJsZWQpO1xuXHRcdGNvbnN0IHN1Z2dlc3RLZXliaW5kaW5nID0gc3VnZ2VzdEVuYWJsZWQgPyB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5UcmlnZ2VyU3VnZ2VzdCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3VnZ2VzdEtleWJpbmRpbmdMYWJlbCA9IHN1Z2dlc3RLZXliaW5kaW5nPy5nZXRMYWJlbCgpO1xuXHRcdGlmIChzdWdnZXN0S2V5YmluZGluZyAmJiBzdWdnZXN0S2V5YmluZGluZ0xhYmVsKSB7XG5cdFx0XHRjb25zdCBzdWdnZXN0QWN0aW9uUGFydCA9IGxvY2FsaXplKCdzaG93U3VnZ2VzdEhpbnQnLCAnU2hvdyBzdWdnZXN0aW9ucyB7MH0uICcsIHN1Z2dlc3RLZXliaW5kaW5nTGFiZWwpO1xuXG5cdFx0XHRjb25zdCBoYW5kbGVTdWdnZXN0Q2xpY2sgPSAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5UcmlnZ2VyU3VnZ2VzdCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IGJlZm9yZTogc3VnZ2VzdEJlZm9yZSwgYWZ0ZXI6IHN1Z2dlc3RBZnRlciB9ID0gdGhpcy5fY3JlYXRlV3JhcHBlZEhpbnRFbGVtZW50cyhzdWdnZXN0QWN0aW9uUGFydCwgc3VnZ2VzdEtleWJpbmRpbmdMYWJlbCwgaGFuZGxlU3VnZ2VzdENsaWNrKTtcblxuXHRcdFx0aGludEVsZW1lbnQuYXBwZW5kQ2hpbGQoc3VnZ2VzdEJlZm9yZSk7XG5cblx0XHRcdGNvbnN0IHN1Z2dlc3RMYWJlbCA9IHRoaXMuX3RvRGlzcG9zZS5hZGQobmV3IEtleWJpbmRpbmdMYWJlbChoaW50RWxlbWVudCwgT1MpKTtcblx0XHRcdHN1Z2dlc3RMYWJlbC5zZXQoc3VnZ2VzdEtleWJpbmRpbmcpO1xuXHRcdFx0c3VnZ2VzdExhYmVsLmVsZW1lbnQuc3R5bGUud2lkdGggPSAnbWluLWNvbnRlbnQnO1xuXHRcdFx0c3VnZ2VzdExhYmVsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdFx0c3VnZ2VzdExhYmVsLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHN1Z2dlc3RMYWJlbC5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBoYW5kbGVTdWdnZXN0Q2xpY2spKTtcblxuXHRcdFx0aGludEVsZW1lbnQuYXBwZW5kQ2hpbGQoc3VnZ2VzdEFmdGVyKTtcblx0XHRcdC8vIExheW91dC1vbmx5IHNlcGFyYXRvcjsgdmlzaWJpbGl0eSBhbmQgc3BhY2luZyBhcmUgY29udHJvbGxlZCB2aWEgQ1NTIChpbmNsdWRpbmcgcmVzcG9uc2l2ZSBicmVha3BvaW50cykuXG5cdFx0XHRoaW50RWxlbWVudC5hcHBlbmRDaGlsZCgkKCdzcGFuLnRlcm1pbmFsLWluaXRpYWwtaGludC1zZXBhcmF0b3InKSk7XG5cblx0XHRcdGFyaWFMYWJlbFBhcnRzLnB1c2goc3VnZ2VzdEFjdGlvblBhcnQpO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHNob3cgdGhlIGhpbnQgaWYgdGhlcmUncyBub3RoaW5nIHRvIGhpbnQgYWJvdXRcblx0XHRpZiAoYXJpYUxhYmVsUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIERpc21pc3MgaGludCAtIG5vcm1hbCBtb2RlIHZlcnNpb25cblx0XHRjb25zdCB0eXBlVG9EaXNtaXNzID0gbG9jYWxpemUoe1xuXHRcdFx0a2V5OiAnaGludFRleHREaXNtaXNzJyxcblx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0J1ByZXNlcnZlIGRvdWJsZS1zcXVhcmUgYnJhY2tldHMgYW5kIHRoZWlyIG9yZGVyJyxcblx0XHRcdF1cblx0XHR9LCAnW1tkb25cXCd0IHNob3ddXSB0aGlzIGFnYWluLicpO1xuXHRcdGNvbnN0IHR5cGVUb0Rpc21pc3NSZW5kZXJlZCA9IHJlbmRlckZvcm1hdHRlZFRleHQodHlwZVRvRGlzbWlzcywgeyBhY3Rpb25IYW5kbGVyOiBkb250U2hvd0hpbnRIYW5kbGVyIH0pO1xuXHRcdHR5cGVUb0Rpc21pc3NSZW5kZXJlZC5jbGFzc0xpc3QuYWRkKCdkZXRhaWwnLCAndGVybWluYWwtaW5pdGlhbC1oaW50LXByb3NlJyk7XG5cblx0XHRjb25zdCBwcm9zZUJlZm9yZSA9ICQoJ3NwYW4udGVybWluYWwtaW5pdGlhbC1oaW50LXByb3NlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnaGludFRleHREaXNtaXNzUHJvc2UnLCBcIiBTdGFydCB0eXBpbmcgdG8gZGlzbWlzcyBvciBcIikpO1xuXHRcdGhpbnRFbGVtZW50LmFwcGVuZENoaWxkKHByb3NlQmVmb3JlKTtcblx0XHRoaW50RWxlbWVudC5hcHBlbmRDaGlsZCh0eXBlVG9EaXNtaXNzUmVuZGVyZWQpO1xuXG5cdFx0Ly8gRGlzbWlzcyBoaW50IC0gY29tcGFjdCBtb2RlIHZlcnNpb25cblx0XHRjb25zdCB0eXBlVG9EaXNtaXNzQ29tcGFjdCA9IGxvY2FsaXplKHtcblx0XHRcdGtleTogJ2hpbnRUZXh0RGlzbWlzc0NvbXBhY3QnLFxuXHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHQnUHJlc2VydmUgZG91YmxlLXNxdWFyZSBicmFja2V0cyBhbmQgdGhlaXIgb3JkZXInLFxuXHRcdFx0XVxuXHRcdH0sICdbW0RvblxcJ3Qgc2hvdyB0aGlzIGFnYWluXV0nKTtcblx0XHRjb25zdCB0eXBlVG9EaXNtaXNzQ29tcGFjdFJlbmRlcmVkID0gcmVuZGVyRm9ybWF0dGVkVGV4dCh0eXBlVG9EaXNtaXNzQ29tcGFjdCwgeyBhY3Rpb25IYW5kbGVyOiBkb250U2hvd0hpbnRIYW5kbGVyIH0pO1xuXHRcdHR5cGVUb0Rpc21pc3NDb21wYWN0UmVuZGVyZWQuY2xhc3NMaXN0LmFkZCgnZGV0YWlsJywgJ3Rlcm1pbmFsLWluaXRpYWwtaGludC1jb21wYWN0Jyk7XG5cdFx0aGludEVsZW1lbnQuYXBwZW5kQ2hpbGQodHlwZVRvRGlzbWlzc0NvbXBhY3RSZW5kZXJlZCk7XG5cdFx0YXJpYUxhYmVsUGFydHMucHVzaChsb2NhbGl6ZSgnaGludFRleHREaXNtaXNzQXJpYUxhYmVsJywgJ1N0YXJ0IHR5cGluZyB0byBkaXNtaXNzIG9yIGRvblxcJ3Qgc2hvdyB0aGlzIGFnYWluLicpKTtcblxuXHRcdHJldHVybiB7IGFyaWFMYWJlbDogYXJpYUxhYmVsUGFydHMuam9pbignICcpLCBoaW50RWxlbWVudCB9O1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9nZXRIaW50Q29udGVudCgpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgaGludEVsZW1lbnQsIGFyaWFMYWJlbCB9ID0gcmVzdWx0O1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlID0gJCgnLnRlcm1pbmFsLWluaXRpYWwtaGludCcpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZSEuc3R5bGUucGFkZGluZ0xlZnQgPSAnNHB4JztcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmQoaGludEVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fYXJpYUxhYmVsID0gYXJpYUxhYmVsLmNvbmNhdChsb2NhbGl6ZSgnZGlzYWJsZUhpbnQnLCAnIFRvZ2dsZSB7MH0gaW4gc2V0dGluZ3MgdG8gZGlzYWJsZSB0aGlzIGhpbnQuJywgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5UZXJtaW5hbElubGluZUNoYXQpKTtcblxuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgKGUpID0+IHtcblx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB7IHJldHVybiBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRBY3RpdmVXaW5kb3coKSwgZSk7IH0sXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0XHRcdGlkOiAnd29ya2VuY2guYWN0aW9uLmRpc2FibGVUZXJtaW5hbEluaXRpYWxIaW50Jyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaXNhYmxlSW5pdGlhbEhpbnQnLCBcIkRpc2FibGUgSW5pdGlhbCBIaW50XCIpLFxuXHRcdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGlzYWJsZUluaXRpYWxIaW50JywgXCJEaXNhYmxlIEluaXRpYWwgSGludFwiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUZXJtaW5hbEluaXRpYWxIaW50U2V0dGluZ0lkLkVuYWJsZWQsIGZhbHNlKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFnQywyQkFBMkI7QUFDM0QsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsVUFBVTtBQUNuQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFD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
