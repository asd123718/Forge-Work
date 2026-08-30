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
import * as dom from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../common/constants.js";
import { SessionType } from "../../../common/chatSessionsService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { URI } from "../../../../../../base/common/uri.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../common/chatPermissionWarnings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from "../../../../../../platform/sandbox/common/settings.js";
const DEFAULT_PERMISSION_LEVELS = [
  ChatPermissionLevel.Default,
  ChatPermissionLevel.AutoApprove,
  ChatPermissionLevel.Autopilot
];
function getPermissionLevelMeta(level) {
  switch (level) {
    case ChatPermissionLevel.Assisted:
      return {
        id: "chat.permissions.assisted",
        label: localize("permissions.assisted", "Assisted permissions"),
        shortLabel: localize("permissions.assisted.label", "Assisted permissions"),
        detail: localize("permissions.assisted.subtext", "Evaluates risk before running tools"),
        icon: ThemeIcon.fromId(Codicon.sparkle.id),
        description: localize("permissions.assisted.description", "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval."),
        elevated: true
      };
    case ChatPermissionLevel.AutoApprove:
      return {
        id: "chat.permissions.autoApprove",
        label: localize("permissions.autoApprove", "Allow all"),
        shortLabel: localize("permissions.autoApprove.label", "Allow all"),
        detail: localize("permissions.autoApprove.subtext", "Runs tool calls without asking"),
        icon: ThemeIcon.fromId(Codicon.warning.id),
        description: localize("permissions.autoApprove.description", "Auto-approve all tool calls and retry on errors"),
        elevated: true
      };
    case ChatPermissionLevel.Autopilot:
      return {
        id: "chat.permissions.autopilot",
        label: localize("permissions.autopilot", "Autopilot (Preview)"),
        shortLabel: localize("permissions.autopilot.label", "Autopilot (Preview)"),
        detail: localize("permissions.autopilot.subtext", "Works autonomously within permissions"),
        icon: ThemeIcon.fromId(Codicon.rocket.id),
        description: localize("permissions.autopilot.description", "Auto-approve all tool calls and continue until the task is done. Autopilot may increase costs."),
        elevated: true
      };
    case ChatPermissionLevel.Default:
    default:
      return {
        id: "chat.permissions.default",
        label: localize("permissions.default", "Default permissions"),
        shortLabel: localize("permissions.default.label", "Default permissions"),
        detail: localize("permissions.default.subtext", "Asks when approval settings don't apply"),
        icon: ThemeIcon.fromId(Codicon.shield.id),
        description: localize("permissions.default.description", "Use configured approval settings"),
        elevated: false
      };
  }
}
function sanitizeIdSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function getSandboxEnabledSettingId() {
  return isWindows ? AgentSandboxSettingId.AgentSandboxWindowsEnabled : AgentSandboxSettingId.AgentSandboxEnabled;
}
let PermissionPickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService, configurationService, dialogService, openerService, storageService, hoverService) {
    const isAutoApprovePolicyRestricted = () => configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const actionProvider = {
      getActions: () => {
        const ext = delegate.getExtensionPermissions?.();
        if (ext && ext.items.length > 0) {
          const sessionTypeSeg = sanitizeIdSegment(ext.sessionType);
          const groupSeg = sanitizeIdSegment(ext.groupId);
          return ext.items.map((item) => ({
            ...action,
            id: `chat.permissions.ext.${sessionTypeSeg}.${groupSeg}.${sanitizeIdSegment(item.id)}`,
            label: item.name,
            detail: item.description,
            icon: item.icon,
            checked: ext.selectedId === item.id,
            enabled: !item.locked,
            tooltip: item.locked ? localize("permissions.ext.locked", "This option is locked") : "",
            hover: item.description ? { content: item.description } : void 0,
            run: async () => {
              delegate.setExtensionPermission?.(ext.groupId, item);
              if (this.element) {
                this.renderLabel(this.element);
              }
            }
          }));
        }
        const currentLevel = delegate.currentPermissionLevel.get();
        const policyRestricted = isAutoApprovePolicyRestricted();
        const sandboxToggleEnabled = this.isSandboxToggleAvailable();
        const setSandboxEnabled = async (enableSandbox) => {
          const target = enableSandbox ? AgentSandboxEnabledValue.On : AgentSandboxEnabledValue.Off;
          if (this.isSandboxingEnabled() !== enableSandbox) {
            await configurationService.updateValue(getSandboxEnabledSettingId(), target);
          }
        };
        const levels = delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
        const actions = levels.map((level) => {
          const meta = getPermissionLevelMeta(level);
          const disabledByPolicy = meta.elevated && policyRestricted;
          const hover = disabledByPolicy ? localize("permissions.policyDescription", "Disabled by enterprise policy") : delegate.getPermissionLevelHover?.(level, meta) ?? meta.description;
          const inlineToggle = sandboxToggleEnabled && level === ChatPermissionLevel.Default ? {
            label: localize("permissions.default.sandbox.toggle", "Sandboxing for terminal"),
            title: localize("permissions.default.sandbox.toggle.title", "Run terminal commands inside a sandbox that restricts file system and network access"),
            checked: this.isSandboxingEnabled(),
            onChange: (checked) => {
              void setSandboxEnabled(checked);
            }
          } : void 0;
          return {
            ...action,
            id: meta.id,
            label: meta.label,
            detail: meta.detail,
            icon: meta.icon,
            checked: currentLevel === level,
            enabled: !disabledByPolicy,
            inlineToggle,
            tooltip: disabledByPolicy ? localize("permissions.policyDisabled", "Disabled by enterprise policy") : "",
            hover: {
              content: hover
            },
            run: async () => {
              if (meta.elevated && !await maybeConfirmElevatedPermissionLevel(level, this.dialogService, storageService, {
                defaultSettingKey: delegate.defaultSettingKey,
                levelLabel: meta.label
              })) {
                return;
              }
              delegate.setPermissionLevel(level);
              if (this.element) {
                this.renderLabel(this.element);
              }
            }
          };
        });
        return actions;
      }
    };
    super(action, {
      actionProvider,
      actionBarActions: [{
        id: "chat.permissions.learnMore",
        label: localize("permissions.learnMore", "Learn more about permissions"),
        tooltip: localize("permissions.learnMore", "Learn more about permissions"),
        class: void 0,
        enabled: true,
        run: async () => {
          const ext = delegate.getExtensionPermissions?.();
          const url = ext?.sessionType === SessionType.AgentHostClaude ? "https://code.claude.com/docs/en/permission-modes#available-modes" : "https://aka.ms/vscode/docs/permissions";
          await openerService.open(URI.parse(url));
        }
      }],
      reporter: { id: "ChatPermissionPicker", name: "ChatPermissionPicker", includeOptions: true },
      listOptions: { minWidth: 255, detailItemHeight: 44, ...pickerOptions.listOptions }
    }, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.hoverService = hoverService;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._currentTooltip = "";
    this._hover = this._register(new MutableDisposable());
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if ((e.affectsConfiguration(getSandboxEnabledSettingId()) || e.affectsConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled)) && this.element) {
        this.renderLabel(this.element);
      }
    }));
  }
  isSandboxingEnabled() {
    const value = this.configurationService.getValue(getSandboxEnabledSettingId());
    return isAgentSandboxEnabledValue(value);
  }
  isSandboxToggleSettingEnabled() {
    return this.configurationService.getValue(ChatConfiguration.PermissionsSandboxToggleEnabled) === true;
  }
  /**
   * Whether the sandbox toggle should surface for the current harness: the
   * experimental setting must be on and the delegate must opt in (only the
   * local harness does).
   */
  isSandboxToggleAvailable() {
    return this.isSandboxToggleSettingEnabled() && this.delegate.isSandboxToggleApplicable?.() === true;
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const ext = this.delegate.getExtensionPermissions?.();
    let icon;
    let label;
    let tooltip;
    const level = this.delegate.currentPermissionLevel.get();
    if (ext && ext.items.length > 0) {
      const selected = ext.items.find((i) => i.id === ext.selectedId) ?? ext.items.find((i) => i.default) ?? ext.items[0];
      icon = selected.icon ?? Codicon.lock;
      label = selected.name;
      tooltip = selected.description ?? selected.name;
    } else {
      const meta = getPermissionLevelMeta(level);
      icon = meta.icon;
      label = meta.shortLabel;
      tooltip = this.delegate.getPermissionLevelHover?.(level, meta) ?? meta.description;
      if (level === ChatPermissionLevel.Default && this.isSandboxToggleAvailable() && this.isSandboxingEnabled()) {
        label = localize("permissions.defaultSandboxed.label", "Default permissions (sandboxed)");
      }
    }
    const labelElements = [];
    labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
    labelElements.push(dom.$("span.chat-input-picker-label", void 0, label));
    dom.reset(element, ...labelElements);
    element.classList.toggle("warning", !ext && (level === ChatPermissionLevel.Autopilot || level === ChatPermissionLevel.Assisted));
    element.classList.toggle("info", !ext && level === ChatPermissionLevel.AutoApprove);
    this._currentTooltip = tooltip;
    element.setAttribute("aria-label", !ext && this.delegate.getPermissionLevelHover ? localize("permissions.ariaLabelWithDescription", "Permission picker, {0}, {1}", label, tooltip) : localize("permissions.ariaLabel", "Permission picker, {0}", label));
    if (this._hoverElement !== element) {
      this._hoverElement = element;
      this._hover.value = this.hoverService.setupDelayedHover(element, () => ({ content: this._currentTooltip }));
    }
    return null;
  }
  refresh() {
    if (this.element) {
      this.renderLabel(this.element);
    }
  }
  dispose() {
    if (this._store.isDisposed) {
      return;
    }
    this._onDidDispose.fire();
    super.dispose();
  }
};
PermissionPickerActionItem = __decorateClass([
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IHoverService)
], PermissionPickerActionItem);
export {
  PermissionPickerActionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXHBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0sIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtLCBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB9IGZyb20gJy4vY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IG1heWJlQ29uZmlybUVsZXZhdGVkUGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRQZXJtaXNzaW9uV2FybmluZ3MuanMnO1xuaW1wb3J0IHsgQWdlbnRTYW5kYm94RW5hYmxlZFNldHRpbmdWYWx1ZSwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLCBBZ2VudFNhbmRib3hTZXR0aW5nSWQsIGlzQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vc2V0dGluZ3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25QZXJtaXNzaW9uU3RhdGUge1xuXHQvKiogU3RhYmxlIGlkZW50aWZpZXIgZm9yIHRoZSBjb250cmlidXRpbmcgY2hhdCBzZXNzaW9uIHR5cGUsIHVzZWQgdG8gbmFtZXNwYWNlIGFjdGlvbiBpZHMuICovXG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGdyb3VwSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbVtdO1xuXHRyZWFkb25seSBzZWxlY3RlZElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSB7XG5cdHJlYWRvbmx5IGN1cnJlbnRQZXJtaXNzaW9uTGV2ZWw6IElPYnNlcnZhYmxlPENoYXRQZXJtaXNzaW9uTGV2ZWw+O1xuXHRyZWFkb25seSBzZXRQZXJtaXNzaW9uTGV2ZWw6IChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIFRoZSBvcmRlcmVkIHNldCBvZiBwZXJtaXNzaW9uIGxldmVscyB0aGUgcGlja2VyIHNob3VsZCBvZmZlci4gV2hlblxuXHQgKiBvbWl0dGVkLCB0aGUgYnVpbHQtaW4gRGVmYXVsdC9CeXBhc3MvQXV0b3BpbG90IHNldCBpcyB1c2VkLiBBZ2VudC1ob3N0XG5cdCAqIHNlc3Npb25zIG92ZXJyaWRlIHRoaXMgdG8gRGVmYXVsdC9CeXBhc3MgKEF1dG9waWxvdCBsaXZlcyBvbiB0aGVcblx0ICogb3J0aG9nb25hbCBtb2RlIGF4aXMgdGhlcmUpLlxuXHQgKi9cblx0cmVhZG9ubHkgYXZhaWxhYmxlTGV2ZWxzPzogcmVhZG9ubHkgQ2hhdFBlcm1pc3Npb25MZXZlbFtdO1xuXHQvKipcblx0ICogVGhlIHNldHRpbmcgaWQgdGhlIGVsZXZhdGVkLWxldmVsIHdhcm5pbmcgZGlhbG9nIGxpbmtzIHRvIGFzIFwibWFrZSB0aGlzXG5cdCAqIHRoZSBkZWZhdWx0XCIuIERlZmF1bHRzIHRvIGBjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHRgOyBhZ2VudC1ob3N0IHNlc3Npb25zXG5cdCAqIHBhc3MgYGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb25gLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVmYXVsdFNldHRpbmdLZXk/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGVuIGRlZmluZWQgYW5kIHJldHVybnMgYSBub24tZW1wdHkgc3RhdGUsIHRoZSBwaWNrZXIgc2hvd3MgdGhlIGV4dGVuc2lvbi1jb250cmlidXRlZFxuXHQgKiBpdGVtcyBpbiBwbGFjZSBvZiB0aGUgYnVpbHQtaW4ge0BsaW5rIENoYXRQZXJtaXNzaW9uTGV2ZWx9IGl0ZW1zLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2V0RXh0ZW5zaW9uUGVybWlzc2lvbnM/OiAoKSA9PiBJRXh0ZW5zaW9uUGVybWlzc2lvblN0YXRlIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzZXRFeHRlbnNpb25QZXJtaXNzaW9uPzogKGdyb3VwSWQ6IHN0cmluZywgaXRlbTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKSA9PiB2b2lkO1xuXHRyZWFkb25seSBnZXRQZXJtaXNzaW9uTGV2ZWxIb3Zlcj86IChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCwgbWV0YTogSVBlcm1pc3Npb25MZXZlbE1ldGEpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGV4cGVyaW1lbnRhbCBcIlNhbmRib3hpbmcgZm9yIHRlcm1pbmFsXCIgdG9nZ2xlIG1heSBiZSBzaG93biBvblxuXHQgKiB0aGUgRGVmYXVsdCBwZXJtaXNzaW9ucyBvcHRpb24uIFRoZSB0b2dnbGUgaXMgc3BlY2lmaWMgdG8gdGhlIGxvY2FsIGhhcm5lc3Ncblx0ICogKHdoaWNoIHJ1bnMgdGhlIGJ1aWx0LWluIHRlcm1pbmFsIHRvb2wpOyBhZ2VudC1ob3N0IGhhcm5lc3NlcyBzdWNoIGFzXG5cdCAqIENvcGlsb3QgQ0xJIGFuZCBDbGF1ZGUgQ29kZSBkbyBub3QgaW1wbGVtZW50IHRoaXMgYW5kIG5ldmVyIHNob3cgaXQuXG5cdCAqIEV2YWx1YXRlZCBlYWNoIHRpbWUgdGhlIHBpY2tlciBvcGVucyBzbyBhIGhhcm5lc3Mgc3dpdGNoIGlzIHJlZmxlY3RlZC5cblx0ICovXG5cdHJlYWRvbmx5IGlzU2FuZGJveFRvZ2dsZUFwcGxpY2FibGU/OiAoKSA9PiBib29sZWFuO1xufVxuXG4vKiogRGVmYXVsdCBsZXZlbCBzZXQgb2ZmZXJlZCB3aGVuIGEgZGVsZWdhdGUgZG9lcyBub3Qgc3BlY2lmeSB7QGxpbmsgSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHN9LiAqL1xuY29uc3QgREVGQVVMVF9QRVJNSVNTSU9OX0xFVkVMUzogcmVhZG9ubHkgQ2hhdFBlcm1pc3Npb25MZXZlbFtdID0gW1xuXHRDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsXG5cdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90LFxuXTtcblxuaW50ZXJmYWNlIElQZXJtaXNzaW9uTGV2ZWxNZXRhIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc2hvcnRMYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHQvKiogRWxldmF0ZWQgbGV2ZWxzIGFyZSBkaXNhYmxlZCB3aGVuIGVudGVycHJpc2UgcG9saWN5IHR1cm5zIG9mZiBhdXRvLWFwcHJvdmFsIGFuZCBuZWVkIGEgd2FybmluZyBkaWFsb2cuICovXG5cdHJlYWRvbmx5IGVsZXZhdGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogSVBlcm1pc3Npb25MZXZlbE1ldGEge1xuXHRzd2l0Y2ggKGxldmVsKSB7XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6ICdjaGF0LnBlcm1pc3Npb25zLmFzc2lzdGVkJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hc3Npc3RlZCcsIFwiQXNzaXN0ZWQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdHNob3J0TGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hc3Npc3RlZC5sYWJlbCcsIFwiQXNzaXN0ZWQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmFzc2lzdGVkLnN1YnRleHQnLCBcIkV2YWx1YXRlcyByaXNrIGJlZm9yZSBydW5uaW5nIHRvb2xzXCIpLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc3BhcmtsZS5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXNzaXN0ZWQuZGVzY3JpcHRpb24nLCBcIkFuIExMTSBqdWRnZSBldmFsdWF0ZXMgZWFjaCB0b29sIGNhbGwuIFRvb2xzIGl0IGRvZXNuJ3QgYXBwcm92ZSByZXF1aXJlIHlvdXIgYXBwcm92YWwuXCIpLFxuXHRcdFx0XHRlbGV2YXRlZDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6ICdjaGF0LnBlcm1pc3Npb25zLmF1dG9BcHByb3ZlJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hdXRvQXBwcm92ZScsIFwiQWxsb3cgYWxsXCIpLFxuXHRcdFx0XHRzaG9ydExhYmVsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b0FwcHJvdmUubGFiZWwnLCBcIkFsbG93IGFsbFwiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b0FwcHJvdmUuc3VidGV4dCcsIFwiUnVucyB0b29sIGNhbGxzIHdpdGhvdXQgYXNraW5nXCIpLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ud2FybmluZy5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24nLCBcIkF1dG8tYXBwcm92ZSBhbGwgdG9vbCBjYWxscyBhbmQgcmV0cnkgb24gZXJyb3JzXCIpLFxuXHRcdFx0XHRlbGV2YXRlZDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiAnY2hhdC5wZXJtaXNzaW9ucy5hdXRvcGlsb3QnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdCcsIFwiQXV0b3BpbG90IChQcmV2aWV3KVwiKSxcblx0XHRcdFx0c2hvcnRMYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdC5sYWJlbCcsIFwiQXV0b3BpbG90IChQcmV2aWV3KVwiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b3BpbG90LnN1YnRleHQnLCBcIldvcmtzIGF1dG9ub21vdXNseSB3aXRoaW4gcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5yb2NrZXQuaWQpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdC5kZXNjcmlwdGlvbicsIFwiQXV0by1hcHByb3ZlIGFsbCB0b29sIGNhbGxzIGFuZCBjb250aW51ZSB1bnRpbCB0aGUgdGFzayBpcyBkb25lLiBBdXRvcGlsb3QgbWF5IGluY3JlYXNlIGNvc3RzLlwiKSxcblx0XHRcdFx0ZWxldmF0ZWQ6IHRydWUsXG5cdFx0XHR9O1xuXHRcdGNhc2UgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0OlxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogJ2NoYXQucGVybWlzc2lvbnMuZGVmYXVsdCcsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuZGVmYXVsdCcsIFwiRGVmYXVsdCBwZXJtaXNzaW9uc1wiKSxcblx0XHRcdFx0c2hvcnRMYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmRlZmF1bHQubGFiZWwnLCBcIkRlZmF1bHQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmRlZmF1bHQuc3VidGV4dCcsIFwiQXNrcyB3aGVuIGFwcHJvdmFsIHNldHRpbmdzIGRvbid0IGFwcGx5XCIpLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc2hpZWxkLmlkKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5kZWZhdWx0LmRlc2NyaXB0aW9uJywgXCJVc2UgY29uZmlndXJlZCBhcHByb3ZhbCBzZXR0aW5nc1wiKSxcblx0XHRcdFx0ZWxldmF0ZWQ6IGZhbHNlLFxuXHRcdFx0fTtcblx0fVxufVxuXG4vKiogU2FuaXRpemUgYSBmcmVlLWZvcm0gaWQgc2VnbWVudCBzbyBpdCBpcyBzYWZlIHRvIGVtYmVkIGluIGEgc3RhYmxlIGFjdGlvbiBpZGVudGlmaWVyLiAqL1xuZnVuY3Rpb24gc2FuaXRpemVJZFNlZ21lbnQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXmEtekEtWjAtOV8tXS9nLCAnXycpO1xufVxuXG5mdW5jdGlvbiBnZXRTYW5kYm94RW5hYmxlZFNldHRpbmdJZCgpOiBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCB8IEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRW5hYmxlZCB7XG5cdHJldHVybiBpc1dpbmRvd3MgPyBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQgOiBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZDtcbn1cblxuZXhwb3J0IGNsYXNzIFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtIGV4dGVuZHMgQ2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2N1cnJlbnRUb29sdGlwOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfaG92ZXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSxcblx0XHRwaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQgPSAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cdFx0Y29uc3QgYWN0aW9uUHJvdmlkZXI6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHQvLyBJZiB0aGUgYWN0aXZlIHNlc3Npb24gY29udHJpYnV0ZXMgaXRzIG93biBwZXJtaXNzaW9uIGl0ZW1zLCBzdXJmYWNlIHRob3NlIGluc3RlYWRcblx0XHRcdFx0Ly8gb2YgdGhlIGJ1aWx0LWluIERlZmF1bHQvQXV0b0FwcHJvdmUvQXV0b3BpbG90IGxldmVscy5cblx0XHRcdFx0Y29uc3QgZXh0ID0gZGVsZWdhdGUuZ2V0RXh0ZW5zaW9uUGVybWlzc2lvbnM/LigpO1xuXHRcdFx0XHRpZiAoZXh0ICYmIGV4dC5pdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGVTZWcgPSBzYW5pdGl6ZUlkU2VnbWVudChleHQuc2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRcdGNvbnN0IGdyb3VwU2VnID0gc2FuaXRpemVJZFNlZ21lbnQoZXh0Lmdyb3VwSWQpO1xuXHRcdFx0XHRcdHJldHVybiBleHQuaXRlbXMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0XHRcdC4uLmFjdGlvbixcblx0XHRcdFx0XHRcdGlkOiBgY2hhdC5wZXJtaXNzaW9ucy5leHQuJHtzZXNzaW9uVHlwZVNlZ30uJHtncm91cFNlZ30uJHtzYW5pdGl6ZUlkU2VnbWVudChpdGVtLmlkKX1gLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubmFtZSxcblx0XHRcdFx0XHRcdGRldGFpbDogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGljb246IGl0ZW0uaWNvbixcblx0XHRcdFx0XHRcdGNoZWNrZWQ6IGV4dC5zZWxlY3RlZElkID09PSBpdGVtLmlkLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogIWl0ZW0ubG9ja2VkLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogaXRlbS5sb2NrZWQgPyBsb2NhbGl6ZSgncGVybWlzc2lvbnMuZXh0LmxvY2tlZCcsIFwiVGhpcyBvcHRpb24gaXMgbG9ja2VkXCIpIDogJycsXG5cdFx0XHRcdFx0XHRob3ZlcjogaXRlbS5kZXNjcmlwdGlvbiA/IHsgY29udGVudDogaXRlbS5kZXNjcmlwdGlvbiB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGRlbGVnYXRlLnNldEV4dGVuc2lvblBlcm1pc3Npb24/LihleHQuZ3JvdXBJZCwgaXRlbSk7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3VycmVudExldmVsID0gZGVsZWdhdGUuY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKTtcblx0XHRcdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKCk7XG5cdFx0XHRcdGNvbnN0IHNhbmRib3hUb2dnbGVFbmFibGVkID0gdGhpcy5pc1NhbmRib3hUb2dnbGVBdmFpbGFibGUoKTtcblx0XHRcdFx0Y29uc3Qgc2V0U2FuZGJveEVuYWJsZWQgPSBhc3luYyAoZW5hYmxlU2FuZGJveDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldDogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlID0gZW5hYmxlU2FuZGJveCA/IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiA6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmY7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNTYW5kYm94aW5nRW5hYmxlZCgpICE9PSBlbmFibGVTYW5kYm94KSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShnZXRTYW5kYm94RW5hYmxlZFNldHRpbmdJZCgpLCB0YXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgbGV2ZWxzID0gZGVsZWdhdGUuYXZhaWxhYmxlTGV2ZWxzID8/IERFRkFVTFRfUEVSTUlTU0lPTl9MRVZFTFM7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbltdID0gbGV2ZWxzLm1hcChsZXZlbCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbWV0YSA9IGdldFBlcm1pc3Npb25MZXZlbE1ldGEobGV2ZWwpO1xuXHRcdFx0XHRcdGNvbnN0IGRpc2FibGVkQnlQb2xpY3kgPSBtZXRhLmVsZXZhdGVkICYmIHBvbGljeVJlc3RyaWN0ZWQ7XG5cdFx0XHRcdFx0Y29uc3QgaG92ZXIgPSBkaXNhYmxlZEJ5UG9saWN5XG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5wb2xpY3lEZXNjcmlwdGlvbicsIFwiRGlzYWJsZWQgYnkgZW50ZXJwcmlzZSBwb2xpY3lcIilcblx0XHRcdFx0XHRcdDogZGVsZWdhdGUuZ2V0UGVybWlzc2lvbkxldmVsSG92ZXI/LihsZXZlbCwgbWV0YSkgPz8gbWV0YS5kZXNjcmlwdGlvbjtcblxuXHRcdFx0XHRcdC8vIFRoZSBEZWZhdWx0IGxldmVsIGNhcnJpZXMgYW4gaW5saW5lIHRvZ2dsZSB0aGF0IGNvbnRyb2xzIHdoZXRoZXJcblx0XHRcdFx0XHQvLyB0ZXJtaW5hbCBjb21tYW5kcyBydW4gaW5zaWRlIGEgc2FuZGJveC4gVGhlIHRvZ2dsZSBpcyBnYXRlZCBiZWhpbmRcblx0XHRcdFx0XHQvLyBhbiBleHBlcmltZW50YWwgc2V0dGluZy5cblx0XHRcdFx0XHRjb25zdCBpbmxpbmVUb2dnbGUgPSBzYW5kYm94VG9nZ2xlRW5hYmxlZCAmJiBsZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0XG5cdFx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5kZWZhdWx0LnNhbmRib3gudG9nZ2xlJywgXCJTYW5kYm94aW5nIGZvciB0ZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5kZWZhdWx0LnNhbmRib3gudG9nZ2xlLnRpdGxlJywgXCJSdW4gdGVybWluYWwgY29tbWFuZHMgaW5zaWRlIGEgc2FuZGJveCB0aGF0IHJlc3RyaWN0cyBmaWxlIHN5c3RlbSBhbmQgbmV0d29yayBhY2Nlc3NcIiksXG5cdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHRoaXMuaXNTYW5kYm94aW5nRW5hYmxlZCgpLFxuXHRcdFx0XHRcdFx0XHRvbkNoYW5nZTogKGNoZWNrZWQ6IGJvb2xlYW4pID0+IHsgdm9pZCBzZXRTYW5kYm94RW5hYmxlZChjaGVja2VkKTsgfSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmFjdGlvbixcblx0XHRcdFx0XHRcdGlkOiBtZXRhLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG1ldGEubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IG1ldGEuZGV0YWlsLFxuXHRcdFx0XHRcdFx0aWNvbjogbWV0YS5pY29uLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogY3VycmVudExldmVsID09PSBsZXZlbCxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6ICFkaXNhYmxlZEJ5UG9saWN5LFxuXHRcdFx0XHRcdFx0aW5saW5lVG9nZ2xlLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogZGlzYWJsZWRCeVBvbGljeSA/IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5wb2xpY3lEaXNhYmxlZCcsIFwiRGlzYWJsZWQgYnkgZW50ZXJwcmlzZSBwb2xpY3lcIikgOiAnJyxcblx0XHRcdFx0XHRcdGhvdmVyOiB7XG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IGhvdmVyLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBFbGV2YXRlZCBsZXZlbHMgc2hvdyBhIG9uZS10aW1lIGNvbmZpcm1hdGlvbiB3YXJuaW5nLlxuXHRcdFx0XHRcdFx0XHRpZiAobWV0YS5lbGV2YXRlZCAmJiAhYXdhaXQgbWF5YmVDb25maXJtRWxldmF0ZWRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwsIHRoaXMuZGlhbG9nU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0U2V0dGluZ0tleTogZGVsZWdhdGUuZGVmYXVsdFNldHRpbmdLZXksXG5cdFx0XHRcdFx0XHRcdFx0bGV2ZWxMYWJlbDogbWV0YS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0fSkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0ZGVsZWdhdGUuc2V0UGVybWlzc2lvbkxldmVsKGxldmVsKTtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb247XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3VwZXIoYWN0aW9uLCB7XG5cdFx0XHRhY3Rpb25Qcm92aWRlcixcblx0XHRcdGFjdGlvbkJhckFjdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnY2hhdC5wZXJtaXNzaW9ucy5sZWFybk1vcmUnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmxlYXJuTW9yZScsIFwiTGVhcm4gbW9yZSBhYm91dCBwZXJtaXNzaW9uc1wiKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmxlYXJuTW9yZScsIFwiTGVhcm4gbW9yZSBhYm91dCBwZXJtaXNzaW9uc1wiKSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ID0gZGVsZWdhdGUuZ2V0RXh0ZW5zaW9uUGVybWlzc2lvbnM/LigpO1xuXHRcdFx0XHRcdGNvbnN0IHVybCA9IGV4dD8uc2Vzc2lvblR5cGUgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENsYXVkZVxuXHRcdFx0XHRcdFx0PyAnaHR0cHM6Ly9jb2RlLmNsYXVkZS5jb20vZG9jcy9lbi9wZXJtaXNzaW9uLW1vZGVzI2F2YWlsYWJsZS1tb2Rlcydcblx0XHRcdFx0XHRcdDogJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS9kb2NzL3Blcm1pc3Npb25zJztcblx0XHRcdFx0XHRhd2FpdCBvcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHVybCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHJlcG9ydGVyOiB7IGlkOiAnQ2hhdFBlcm1pc3Npb25QaWNrZXInLCBuYW1lOiAnQ2hhdFBlcm1pc3Npb25QaWNrZXInLCBpbmNsdWRlT3B0aW9uczogdHJ1ZSB9LFxuXHRcdFx0bGlzdE9wdGlvbnM6IHsgbWluV2lkdGg6IDI1NSwgZGV0YWlsSXRlbUhlaWdodDogNDQsIC4uLnBpY2tlck9wdGlvbnMubGlzdE9wdGlvbnMgfSxcblx0XHR9LCBwaWNrZXJPcHRpb25zLCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGdldFNhbmRib3hFbmFibGVkU2V0dGluZ0lkKCkpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uUGVybWlzc2lvbnNTYW5kYm94VG9nZ2xlRW5hYmxlZCkpICYmIHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NhbmRib3hpbmdFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxBZ2VudFNhbmRib3hFbmFibGVkU2V0dGluZ1ZhbHVlPihnZXRTYW5kYm94RW5hYmxlZFNldHRpbmdJZCgpKTtcblx0XHRyZXR1cm4gaXNBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NhbmRib3hUb2dnbGVTZXR0aW5nRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5QZXJtaXNzaW9uc1NhbmRib3hUb2dnbGVFbmFibGVkKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzYW5kYm94IHRvZ2dsZSBzaG91bGQgc3VyZmFjZSBmb3IgdGhlIGN1cnJlbnQgaGFybmVzczogdGhlXG5cdCAqIGV4cGVyaW1lbnRhbCBzZXR0aW5nIG11c3QgYmUgb24gYW5kIHRoZSBkZWxlZ2F0ZSBtdXN0IG9wdCBpbiAob25seSB0aGVcblx0ICogbG9jYWwgaGFybmVzcyBkb2VzKS5cblx0ICovXG5cdHByaXZhdGUgaXNTYW5kYm94VG9nZ2xlQXZhaWxhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzU2FuZGJveFRvZ2dsZVNldHRpbmdFbmFibGVkKCkgJiYgdGhpcy5kZWxlZ2F0ZS5pc1NhbmRib3hUb2dnbGVBcHBsaWNhYmxlPy4oKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJMYWJlbChlbGVtZW50OiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHwgbnVsbCB7XG5cdFx0dGhpcy5zZXRBcmlhTGFiZWxBdHRyaWJ1dGVzKGVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgZXh0ID0gdGhpcy5kZWxlZ2F0ZS5nZXRFeHRlbnNpb25QZXJtaXNzaW9ucz8uKCk7XG5cdFx0bGV0IGljb246IFRoZW1lSWNvbjtcblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRsZXQgdG9vbHRpcDogc3RyaW5nO1xuXHRcdGNvbnN0IGxldmVsID0gdGhpcy5kZWxlZ2F0ZS5jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpO1xuXHRcdGlmIChleHQgJiYgZXh0Lml0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gZXh0Lml0ZW1zLmZpbmQoaSA9PiBpLmlkID09PSBleHQuc2VsZWN0ZWRJZClcblx0XHRcdFx0Pz8gZXh0Lml0ZW1zLmZpbmQoaSA9PiBpLmRlZmF1bHQpXG5cdFx0XHRcdD8/IGV4dC5pdGVtc1swXTtcblx0XHRcdGljb24gPSBzZWxlY3RlZC5pY29uID8/IENvZGljb24ubG9jaztcblx0XHRcdGxhYmVsID0gc2VsZWN0ZWQubmFtZTtcblx0XHRcdHRvb2x0aXAgPSBzZWxlY3RlZC5kZXNjcmlwdGlvbiA/PyBzZWxlY3RlZC5uYW1lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtZXRhID0gZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbCk7XG5cdFx0XHRpY29uID0gbWV0YS5pY29uO1xuXHRcdFx0bGFiZWwgPSBtZXRhLnNob3J0TGFiZWw7XG5cdFx0XHR0b29sdGlwID0gdGhpcy5kZWxlZ2F0ZS5nZXRQZXJtaXNzaW9uTGV2ZWxIb3Zlcj8uKGxldmVsLCBtZXRhKSA/PyBtZXRhLmRlc2NyaXB0aW9uO1xuXHRcdFx0aWYgKGxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQgJiYgdGhpcy5pc1NhbmRib3hUb2dnbGVBdmFpbGFibGUoKSAmJiB0aGlzLmlzU2FuZGJveGluZ0VuYWJsZWQoKSkge1xuXHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5kZWZhdWx0U2FuZGJveGVkLmxhYmVsJywgXCJEZWZhdWx0IHBlcm1pc3Npb25zIChzYW5kYm94ZWQpXCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudHMgPSBbXTtcblx0XHRsYWJlbEVsZW1lbnRzLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtpY29uLmlkfSlgKSk7XG5cdFx0bGFiZWxFbGVtZW50cy5wdXNoKGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXG5cdFx0ZG9tLnJlc2V0KGVsZW1lbnQsIC4uLmxhYmVsRWxlbWVudHMpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnd2FybmluZycsICFleHQgJiYgKGxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB8fCBsZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCkpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaW5mbycsICFleHQgJiYgbGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpO1xuXG5cdFx0dGhpcy5fY3VycmVudFRvb2x0aXAgPSB0b29sdGlwO1xuXHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgIWV4dCAmJiB0aGlzLmRlbGVnYXRlLmdldFBlcm1pc3Npb25MZXZlbEhvdmVyXG5cdFx0XHQ/IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hcmlhTGFiZWxXaXRoRGVzY3JpcHRpb24nLCBcIlBlcm1pc3Npb24gcGlja2VyLCB7MH0sIHsxfVwiLCBsYWJlbCwgdG9vbHRpcClcblx0XHRcdDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmFyaWFMYWJlbCcsIFwiUGVybWlzc2lvbiBwaWNrZXIsIHswfVwiLCBsYWJlbCkpO1xuXHRcdC8vIGByZW5kZXJMYWJlbGAgY2FuIHJ1biBhZ2FpbnN0IGEgZnJlc2ggZWxlbWVudCBvbiBzdWJzZXF1ZW50XG5cdFx0Ly8gYHJlbmRlcigpYCBjYWxscyAoZS5nLiB3aGVuIHRoZSBpdGVtIG1vdmVzIGludG8vb3V0IG9mIG92ZXJmbG93KS5cblx0XHQvLyBSZS13aXJlIHRoZSBob3ZlciBvbiB0aGUgbmV3IGVsZW1lbnQgYW5kIGRpc3Bvc2UgdGhlIHByZXZpb3VzXG5cdFx0Ly8gcmVnaXN0cmF0aW9uIHNvIGl0IGRvZXNuJ3QgbGVhayB0aGUgb2xkIGVsZW1lbnQuXG5cdFx0aWYgKHRoaXMuX2hvdmVyRWxlbWVudCAhPT0gZWxlbWVudCkge1xuXHRcdFx0dGhpcy5faG92ZXJFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdHRoaXMuX2hvdmVyLnZhbHVlID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudCwgKCkgPT4gKHsgY29udGVudDogdGhpcy5fY3VycmVudFRvb2x0aXAgfSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyByZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFD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
