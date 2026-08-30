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
import "./media/agentHostChatInputPicker.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { ActionListItemKind } from "../../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { getCodexApprovalsPickerListOptions } from "../../../../../../platform/agentHost/browser/codexApprovalsPicker.js";
import { AgentHostSdkSandboxEnabledSettingId, AgentHostSdkSandboxWindowsEnabledSettingId, IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AgentHostCustomTerminalToolEnabledSettingId } from "../../../../../../platform/agentHost/common/copilotCliConfig.js";
import { KNOWN_AUTO_APPROVE_VALUES, SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ClaudeSessionConfigKey } from "../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js";
import { CodexSessionConfigKey } from "../../../../../../platform/agentHost/common/codexSessionConfigKeys.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { ROOT_STATE_URI, StateComponents } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from "../../../../../../platform/sandbox/common/settings.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from "../../../common/constants.js";
import { SessionType } from "../../../common/chatSessionsService.js";
import { isAssistedPermissionsEnabled, isAutoApprovePolicyRestricted, isAutoApproveValuePolicyRestricted, isPermissionLevelVisible, normalizeSessionConfigValue } from "../../../common/agentHostConfigPolicy.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../common/chatPermissionWarnings.js";
import { getChatSessionType, isUntitledChatSession } from "../../../common/model/chatUri.js";
import { withChatInputPickerMotion } from "../../widget/input/chatInputPickerActionItem.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "./agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService } from "./agentHostNewSessionFolderService.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentHostUntitledProvisionalSessionService.js";
import { toAgentHostBackendSessionUri } from "./agentHostSessionUri.js";
const FILTER_THRESHOLD = 10;
const LEARN_MORE_VALUE = "__agentHostChatInputPicker.learnMore__";
const PERMISSIONS_LEARN_MORE_URL = "https://aka.ms/vscode/docs/permissions";
const CODEX_APPROVALS_LEARN_MORE_URL = "https://developers.openai.com/codex/concepts/sandboxing#how-you-control-it";
function getConfigIcon(property, value) {
  if (property === SessionConfigKey.Mode) {
    switch (value) {
      case "plan":
        return Codicon.checklist;
      case "autopilot":
        return Codicon.rocket;
      case "interactive":
        return Codicon.comment;
    }
  }
  if (property === SessionConfigKey.AutoApprove) {
    if (value === "autopilot") {
      return Codicon.rocket;
    }
    if (value === "autoApprove") {
      return Codicon.warning;
    }
    if (value === "assisted") {
      return Codicon.sparkle;
    }
    return Codicon.shield;
  }
  if (property === ClaudeSessionConfigKey.PermissionMode && typeof value === "string") {
    switch (value) {
      case "default":
        return Codicon.shield;
      case "acceptEdits":
        return Codicon.edit;
      case "plan":
        return Codicon.lightbulb;
      case "auto":
        return Codicon.sparkle;
      case "bypassPermissions":
        return Codicon.warning;
    }
  }
  if (property === CodexSessionConfigKey.PermissionsPreset && typeof value === "string") {
    switch (value) {
      case "default":
        return Codicon.shield;
      case "auto-review":
        return Codicon.sparkle;
      case "full-access":
        return Codicon.warning;
    }
  }
  return void 0;
}
function toActionItems(property, items, currentValue, policyRestricted = false, sandboxToggle) {
  return items.map((item) => {
    const disabled = property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(item.value, policyRestricted);
    const hover = getConfigPickerItemHover(property, item, disabled);
    return {
      kind: ActionListItemKind.Action,
      label: item.label,
      detail: disabled ? hover : item.description,
      group: { title: "", icon: getConfigIcon(property, item.value) },
      disabled,
      ...hover ? { hover: { content: hover } } : {},
      ...isAgentHostSandboxToggleItem(property, item.value) && sandboxToggle ? { inlineToggle: sandboxToggle } : {},
      item: { ...item, checked: isSelectedValue(currentValue, item.value) }
    };
  });
}
function isAgentHostSandboxToggleItem(property, value) {
  return property === SessionConfigKey.AutoApprove && value === ChatPermissionLevel.Default;
}
function getAgentHostSandboxSettingId(sessionType, customTerminalToolEnabled, windows = isWindows) {
  if (sessionType !== SessionType.AgentHostCopilot) {
    return void 0;
  }
  if (customTerminalToolEnabled) {
    return windows ? AgentSandboxSettingId.AgentSandboxWindowsEnabled : AgentSandboxSettingId.AgentSandboxEnabled;
  }
  return windows ? AgentHostSdkSandboxWindowsEnabledSettingId : AgentHostSdkSandboxEnabledSettingId;
}
function isSelectedValue(currentValue, itemValue) {
  if (typeof currentValue === "boolean") {
    return currentValue === (itemValue === "true");
  }
  return itemValue === currentValue;
}
function getAutoApproveHover(value, fallback) {
  switch (value) {
    case ChatPermissionLevel.Default:
      return localize("agentHostChatInputPicker.defaultApprovalsHover", "Copilot asks before running tools unless your configured settings allow the tool.");
    case ChatPermissionLevel.Assisted:
      return localize("agentHostChatInputPicker.assistedApprovalsHover", "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval.");
    case ChatPermissionLevel.AutoApprove:
      return localize("agentHostChatInputPicker.autoApproveHover", "Copilot runs all tools without asking for approval.");
    case ChatPermissionLevel.Autopilot:
      return localize("agentHostChatInputPicker.autopilotApprovalsHover", "Copilot runs tools without asking for approval and continues until the task is done.");
  }
  return fallback ?? localize("agentHostChatInputPicker.approvalsHover", "Controls whether the agent asks before running tools in this session.");
}
function getEnumValueDescription(schema, value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const index = schema.enum?.indexOf(value) ?? -1;
  return index >= 0 ? schema.enumDescriptions?.[index] : void 0;
}
function getConfigPickerTriggerHover(property, schema, value, isReadOnly) {
  if (property === CodexSessionConfigKey.PermissionsPreset) {
    return getEnumValueDescription(schema, value) ?? schema.description ?? schema.title;
  }
  if (property !== SessionConfigKey.AutoApprove) {
    return schema.description ?? schema.title;
  }
  const hover = getAutoApproveHover(value, getEnumValueDescription(schema, value));
  if (isReadOnly) {
    return localize("agentHostChatInputPicker.approvalsLevelHoverReadOnly", "{0} Read-only.", hover);
  }
  return hover;
}
function getConfigPickerItemHover(property, item, disabled) {
  if (disabled) {
    return localize("agentHostChatInputPicker.policyDisabledHover", "Disabled by your organization. Contact your administrator.");
  }
  if (property === SessionConfigKey.AutoApprove) {
    return getAutoApproveHover(item.value, item.description);
  }
  return void 0;
}
function getPermissionsLearnMoreUrl(property) {
  if (property === CodexSessionConfigKey.PermissionsPreset) {
    return CODEX_APPROVALS_LEARN_MORE_URL;
  }
  if (property === ClaudeSessionConfigKey.PermissionMode || property === SessionConfigKey.AutoApprove) {
    return PERMISSIONS_LEARN_MORE_URL;
  }
  return void 0;
}
function getConfigPickerListOptions(property) {
  switch (property) {
    case SessionConfigKey.Mode:
      return { minWidth: 260 };
    case SessionConfigKey.AutoApprove:
      return { minWidth: 255 };
    case CodexSessionConfigKey.PermissionsPreset:
      return getCodexApprovalsPickerListOptions();
    default:
      return void 0;
  }
}
function renderPickerTrigger(slot, disabled, disposables, onOpen) {
  const trigger = dom.append(slot, disabled ? dom.$("span.action-label") : dom.$("a.action-label"));
  if (disabled) {
    trigger.setAttribute("aria-readonly", "true");
  } else {
    trigger.role = "button";
    trigger.tabIndex = 0;
    trigger.setAttribute("aria-haspopup", "listbox");
    disposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      disposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        onOpen();
      }));
    }
    disposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        onOpen();
      }
    }));
  }
  slot.classList.toggle("disabled", disabled);
  return trigger;
}
function isWellKnownAutoApproveSchema(schema) {
  if (schema.type !== "string" || !Array.isArray(schema.enum) || schema.enum.length === 0) {
    return false;
  }
  if (!schema.enum.includes("default")) {
    return false;
  }
  return schema.enum.every((value) => typeof value === "string" && KNOWN_AUTO_APPROVE_VALUES.has(value));
}
const WELL_KNOWN_PICKER_PROPERTIES = /* @__PURE__ */ new Set([
  SessionConfigKey.Mode,
  SessionConfigKey.AutoApprove,
  SessionConfigKey.Isolation,
  SessionConfigKey.Branch,
  SessionConfigKey.Permissions,
  SessionConfigKey.WorktreeBranchPrefix,
  SessionConfigKey.WorktreeBranchTrack,
  SessionConfigKey.WorktreeIncludeFiles,
  ClaudeSessionConfigKey.PermissionMode,
  CodexSessionConfigKey.PermissionsPreset
]);
function isClaimedByDedicatedPicker(property, schema) {
  if (property === SessionConfigKey.AutoApprove) {
    return isWellKnownAutoApproveSchema(schema);
  }
  return WELL_KNOWN_PICKER_PROPERTIES.has(property);
}
function resolveConfigChipValue(isUntitled, serverValue, overlayValue, schemaDefault) {
  const preferred = isUntitled ? overlayValue ?? serverValue : serverValue ?? overlayValue;
  return preferred ?? schemaDefault;
}
let AgentHostChatInputPicker = class extends Disposable {
  constructor(_widget, _property, _agentHostService, _actionWidgetService, _hoverService, _openerService, _workingDirectoryResolver, _workspaceContextService, _provisional, _configurationService, _newSessionFolderService, _dialogService, _storageService) {
    super();
    this._widget = _widget;
    this._property = _property;
    this._agentHostService = _agentHostService;
    this._actionWidgetService = _actionWidgetService;
    this._hoverService = _hoverService;
    this._openerService = _openerService;
    this._workingDirectoryResolver = _workingDirectoryResolver;
    this._workspaceContextService = _workspaceContextService;
    this._provisional = _provisional;
    this._configurationService = _configurationService;
    this._newSessionFolderService = _newSessionFolderService;
    this._dialogService = _dialogService;
    this._storageService = _storageService;
    this._initialResolveCts = this._registerInitialResolveCts();
    this._renderDisposables = this._register(new DisposableStore());
    this._filterDelayer = this._register(new Delayer(200));
    this._subRef = this._register(new MutableDisposable());
    this._register(this._widget.onDidChangeViewModel(() => {
      this._reattach();
    }));
    this._register(this._provisional.onDidChange((sessionResource) => {
      const current = this._widget.viewModel?.sessionResource;
      if (current && current.toString() === sessionResource.toString()) {
        this._reattach();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      const sandboxSettingId = this._getSandboxSettingId();
      if (e.affectsConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled) || e.affectsConfiguration(AgentHostCustomTerminalToolEnabledSettingId) || sandboxSettingId && e.affectsConfiguration(sandboxSettingId)) {
        this._refreshTrigger();
      }
    }));
    this._reattach();
  }
  _registerInitialResolveCts() {
    const cts = new MutableDisposable();
    this._register(toDisposable(() => {
      this._container = void 0;
      this._trigger = void 0;
      this._cancelInitialResolve();
    }));
    return this._register(cts);
  }
  render(container) {
    this._container = container;
    container.classList.add("agent-host-chat-input-picker-host");
    container.classList.add(`agent-host-chat-input-picker-host-${this._property}`);
    if (this._property === CodexSessionConfigKey.PermissionsPreset) {
      container.classList.add("codex-permissions-chip");
    }
    this._renderChip();
  }
  _reattach() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    const provisionalBackend = sessionResource ? this._provisional.get(sessionResource) : void 0;
    const backendSession = provisionalBackend ?? (sessionResource ? toAgentHostBackendSessionUri(sessionResource) : void 0);
    if (!sessionResource || !backendSession) {
      this._subRef.clear();
      this._initialResolved = void 0;
      this._cancelInitialResolve();
      this._renderChip();
      return;
    }
    if (isUntitledChatSession(sessionResource) && !provisionalBackend) {
      this._subRef.clear();
      if (!this._initialResolved || this._initialResolved.sessionResource.toString() !== sessionResource.toString()) {
        this._initialResolved = void 0;
        void this._refreshInitialResolved(sessionResource, backendSession);
      }
      void this._provisional.getOrCreate(
        sessionResource,
        backendSession.scheme,
        this._readWorkingDirectory()
      );
      this._renderChip();
      return;
    }
    this._initialResolved = void 0;
    this._cancelInitialResolve();
    const ref = this._agentHostService.getSubscription(StateComponents.Session, backendSession, "AgentHostChatInputPicker");
    const sub = ref.object;
    const listener = sub.onDidChange(() => this._renderChip());
    this._subRef.value = {
      sub,
      backendSession,
      dispose: () => {
        listener.dispose();
        ref.dispose();
      }
    };
    this._renderChip();
  }
  _cancelInitialResolve() {
    this._initialResolveCts.value?.cancel();
    this._initialResolveCts.clear();
  }
  async _refreshInitialResolved(sessionResource, backendSession) {
    this._initialResolveCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this._initialResolveCts.value = cts;
    try {
      const result = await this._agentHostService.resolveSessionConfig({
        provider: backendSession.scheme,
        workingDirectory: this._readWorkingDirectory()
      });
      if (cts.token.isCancellationRequested || this._widget.viewModel?.sessionResource?.toString() !== sessionResource.toString()) {
        return;
      }
      this._initialResolved = { sessionResource, result };
      this._renderChip();
    } catch {
    }
  }
  _renderChip() {
    if (!this._container || this._renderDisposables.isDisposed) {
      return;
    }
    this._trigger = void 0;
    this._renderDisposables.clear();
    dom.clearNode(this._container);
    const ctx = this._readContext();
    const sessionResource = this._widget.viewModel?.sessionResource;
    const isStartedSession = !!sessionResource && !isUntitledChatSession(sessionResource);
    if (!ctx || isStartedSession && ctx.schema.sessionMutable === false) {
      this._container.style.display = "none";
      this._container.classList.add("agent-host-chat-input-picker-host-hidden");
      return;
    }
    if (this._property === SessionConfigKey.AutoApprove && !isWellKnownAutoApproveSchema(ctx.schema)) {
      this._container.style.display = "none";
      this._container.classList.add("agent-host-chat-input-picker-host-hidden");
      return;
    }
    this._container.style.display = "";
    this._container.classList.remove("agent-host-chat-input-picker-host-hidden");
    const slot = dom.append(this._container, dom.$(".agent-host-chat-input-picker-slot"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const isReadOnly = !!ctx.schema.readOnly || isStartedSession && ctx.schema.sessionMutable === false;
    const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(trigger));
    this._trigger = trigger;
    const tooltip = getConfigPickerTriggerHover(this._property, ctx.schema, ctx.value, isReadOnly);
    if (tooltip) {
      this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, { content: tooltip }));
    }
    this._renderTrigger(trigger, ctx.schema, ctx.value, isReadOnly);
  }
  _renderTrigger(trigger, schema, value, isReadOnly) {
    dom.clearNode(trigger);
    const icon = getConfigIcon(this._property, value);
    if (icon) {
      dom.append(trigger, renderIcon(icon));
    }
    if (this._property === SessionConfigKey.AutoApprove) {
      trigger.classList.toggle("warning", value === "autopilot" || value === "assisted");
      trigger.classList.toggle("info", value === "autoApprove");
    }
    if (this._property === CodexSessionConfigKey.PermissionsPreset) {
      trigger.classList.toggle("warning", value === "full-access");
    }
    const label = this._labelFor(schema, value);
    const labelSpan = dom.append(trigger, dom.$("span.agent-host-chat-input-picker-label"));
    labelSpan.textContent = label;
    trigger.setAttribute("aria-label", isReadOnly ? localize("agentHostChatInputPicker.triggerAriaReadOnly", "{0}: {1}, Read-Only", schema.title, label) : localize("agentHostChatInputPicker.triggerAria", "{0}: {1}", schema.title, label));
  }
  _refreshTrigger() {
    const trigger = this._trigger;
    const ctx = this._readContext();
    if (!trigger || !ctx) {
      return;
    }
    const sessionResource = this._widget.viewModel?.sessionResource;
    const isStartedSession = !!sessionResource && !isUntitledChatSession(sessionResource);
    const isReadOnly = !!ctx.schema.readOnly || isStartedSession && ctx.schema.sessionMutable === false;
    this._renderTrigger(trigger, ctx.schema, ctx.value, isReadOnly);
  }
  _labelFor(schema, value) {
    if (this._property === SessionConfigKey.AutoApprove && value === ChatPermissionLevel.Default && this._isSandboxToggleSettingEnabled() && this._isSandboxingEnabled()) {
      return localize("agentHostChatInputPicker.manualSandboxedLabel", "Manual permissions (sandboxed)");
    }
    if (this._property === CodexSessionConfigKey.PermissionsPreset && typeof value === "string") {
      const index = schema.enum?.indexOf(value) ?? -1;
      const presetLabel = index >= 0 ? schema.enumLabels?.[index] ?? value : value;
      return localize("agentHostChatInputPicker.codexPermissionsLabel", "Permissions \xB7 {0}", presetLabel);
    }
    if (schema.type === "boolean") {
      return value === true ? localize("agentHostChatInputPicker.boolean.onLabel", "On") : localize("agentHostChatInputPicker.boolean.offLabel", "Off");
    }
    if (typeof value === "string") {
      const index = schema.enum?.indexOf(value) ?? -1;
      return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
    }
    return schema.title;
  }
  _readContext() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    if (!sessionResource) {
      return void 0;
    }
    if (this._subRef.value) {
      const state = this._subRef.value.sub.value;
      if (!state || state instanceof Error) {
        return void 0;
      }
      const overlay = this._provisional.getResolvedConfig(sessionResource);
      const schemaSource = overlay?.schema ?? state.config?.schema;
      const schema = schemaSource?.properties[this._property];
      if (!schema) {
        return void 0;
      }
      const serverValue = state.config?.values?.[this._property];
      const overlayValue = overlay?.values?.[this._property];
      const value = resolveConfigChipValue(isUntitledChatSession(sessionResource), serverValue, overlayValue, schema.default);
      return { backendSession: this._subRef.value.backendSession, schema, value };
    }
    if (this._initialResolved && this._initialResolved.sessionResource.toString() === sessionResource.toString()) {
      const schema = this._initialResolved.result.schema.properties[this._property];
      if (!schema) {
        return void 0;
      }
      const backendSession = toAgentHostBackendSessionUri(sessionResource);
      if (!backendSession) {
        return void 0;
      }
      const value = this._initialResolved.result.values?.[this._property] ?? schema.default;
      return { backendSession, schema, value };
    }
    return void 0;
  }
  async _showPicker(trigger) {
    if (this._actionWidgetService.isVisible) {
      return;
    }
    const ctx = this._readContext();
    if (!ctx || ctx.schema.readOnly) {
      return;
    }
    const items = await this._getItems(ctx.schema);
    if (items.length === 0) {
      return;
    }
    const currentValue = ctx.value;
    const policyRestricted = isAutoApprovePolicyRestricted(this._configurationService);
    const actionItems = toActionItems(this._property, items, currentValue, policyRestricted, this._getSandboxInlineToggle());
    const permissionsLearnMoreUrl = getPermissionsLearnMoreUrl(this._property);
    if (permissionsLearnMoreUrl) {
      const learnMoreLabel = localize("agentHostChatInputPicker.learnMorePermissions", "Learn more about permissions");
      actionItems.push({
        kind: ActionListItemKind.Separator,
        label: ""
      });
      actionItems.push({
        kind: ActionListItemKind.Action,
        label: learnMoreLabel,
        group: { title: "", icon: Codicon.blank },
        item: { value: LEARN_MORE_VALUE, label: learnMoreLabel }
      });
    }
    const delegate = {
      onSelect: (item) => {
        this._actionWidgetService.hide();
        if (item.value === LEARN_MORE_VALUE) {
          if (permissionsLearnMoreUrl) {
            void this._openerService.open(URI.parse(permissionsLearnMoreUrl));
          }
          return;
        }
        void this._confirmAndSetValue(ctx.backendSession, item);
      },
      onFilter: ctx.schema.enumDynamic ? (query) => this._filterDelayer.trigger(async () => {
        const refreshed = this._readContext();
        if (!refreshed) {
          return [];
        }
        return toActionItems(this._property, await this._getItems(refreshed.schema, query), refreshed.value, isAutoApprovePolicyRestricted(this._configurationService), this._getSandboxInlineToggle());
      }) : void 0,
      onHide: () => trigger.focus()
    };
    this._actionWidgetService.show(
      `agentHostChatInputPicker.${this._property}`,
      false,
      actionItems,
      delegate,
      trigger,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("agentHostChatInputPicker.ariaLabel", "{0} Picker", ctx.schema.title)
      },
      withChatInputPickerMotion({
        ...getConfigPickerListOptions(this._property),
        ...actionItems.length > FILTER_THRESHOLD || ctx.schema.enumDynamic ? { showFilter: true, filterPlaceholder: localize("agentHostChatInputPicker.filter", "Filter...") } : {}
      })
    );
  }
  _getSandboxSettingId() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    const sessionType = sessionResource ? getChatSessionType(sessionResource) : void 0;
    const customTerminalToolEnabled = this._configurationService.getValue(AgentHostCustomTerminalToolEnabledSettingId) === true;
    return getAgentHostSandboxSettingId(sessionType, customTerminalToolEnabled);
  }
  _isSandboxToggleSettingEnabled() {
    return this._configurationService.getValue(ChatConfiguration.PermissionsSandboxToggleEnabled) === true;
  }
  _isSandboxingEnabled() {
    const settingId = this._getSandboxSettingId();
    return settingId !== void 0 && isAgentSandboxEnabledValue(this._configurationService.getValue(settingId));
  }
  _getSandboxInlineToggle() {
    const settingId = this._getSandboxSettingId();
    if (this._property !== SessionConfigKey.AutoApprove || !this._isSandboxToggleSettingEnabled() || !settingId) {
      return void 0;
    }
    return {
      label: localize("agentHostChatInputPicker.defaultSandboxToggle", "Sandboxing for terminal"),
      title: localize("agentHostChatInputPicker.defaultSandboxToggleTitle", "Run terminal commands inside a sandbox that restricts file system and network access"),
      checked: this._isSandboxingEnabled(),
      onChange: (checked) => {
        const target = checked ? AgentSandboxEnabledValue.On : AgentSandboxEnabledValue.Off;
        void this._configurationService.updateValue(settingId, target);
      }
    };
  }
  async _getItems(schema, query) {
    if (schema.type === "boolean") {
      return [
        { value: "true", label: localize("agentHostChatInputPicker.boolean.true", "On") },
        { value: "false", label: localize("agentHostChatInputPicker.boolean.false", "Off") }
      ];
    }
    const sessionResource = this._widget.viewModel?.sessionResource;
    const backendSession = this._subRef.value?.backendSession ?? (sessionResource ? toAgentHostBackendSessionUri(sessionResource) : void 0);
    if (schema.enumDynamic && backendSession) {
      try {
        const result = await this._agentHostService.sessionConfigCompletions({
          provider: backendSession.scheme,
          property: this._property,
          query,
          workingDirectory: this._readWorkingDirectory(),
          config: this._readCurrentValues()
        });
        return this._filterAutoApproveItems(result.items.map((item) => this._fromCompletion(item)));
      } catch {
      }
    }
    return this._filterAutoApproveItems((schema.enum ?? []).map((value, index) => ({
      value: String(value),
      label: schema.enumLabels?.[index] ?? String(value),
      description: schema.enumDescriptions?.[index]
    })));
  }
  _filterAutoApproveItems(items) {
    if (this._property !== SessionConfigKey.AutoApprove) {
      return items;
    }
    const assistedPermissionsEnabled = isAssistedPermissionsEnabled(this._configurationService);
    return items.filter((item) => isPermissionLevelVisible(item.value, assistedPermissionsEnabled));
  }
  _fromCompletion(item) {
    return { value: item.value, label: item.label, description: item.description };
  }
  _readWorkingDirectory() {
    const state = this._subRef.value?.sub.value;
    if (state && !(state instanceof Error)) {
      const cwd = state.workingDirectories?.[0];
      return typeof cwd === "string" ? URI.parse(cwd) : cwd;
    }
    const sessionResource = this._widget.viewModel?.sessionResource;
    return (sessionResource && this._newSessionFolderService.getFolder(sessionResource)) ?? (sessionResource && this._workingDirectoryResolver.resolve(sessionResource)) ?? this._newSessionFolderService.getDefaultFolder() ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
  }
  _readCurrentValues() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    const overlay = sessionResource ? this._provisional.getResolvedConfig(sessionResource) : void 0;
    const state = this._subRef.value?.sub.value;
    if (state && !(state instanceof Error)) {
      return { ...state.config?.values ?? {}, ...overlay?.values ?? {} };
    }
    return overlay?.values ?? this._initialResolved?.result.values;
  }
  /**
   * Surfaces the shared elevated-level warning before applying an approval
   * pick. Unknown non-default values fall back to the Bypass warning.
   */
  async _confirmAndSetValue(backendSession, item) {
    const value = item.value;
    if (this._property === SessionConfigKey.AutoApprove && !isPermissionLevelVisible(value, isAssistedPermissionsEnabled(this._configurationService))) {
      return;
    }
    if (this._property === SessionConfigKey.AutoApprove) {
      const levelToConfirm = isChatPermissionLevel(value) ? value : value !== ChatPermissionLevel.Default ? ChatPermissionLevel.AutoApprove : void 0;
      if (levelToConfirm) {
        const confirmed = await maybeConfirmElevatedPermissionLevel(levelToConfirm, this._dialogService, this._storageService, {
          defaultSettingKey: ChatConfiguration.DefaultConfiguration,
          levelLabel: item.label
        });
        if (!confirmed) {
          return;
        }
      }
    }
    await this._setValue(backendSession, value);
  }
  async _setValue(backendSession, value) {
    const sessionResource = this._widget.viewModel?.sessionResource;
    if (!sessionResource) {
      return;
    }
    const ctx = this._readContext();
    const normalizedValue = ctx?.schema.type === "boolean" ? value === "true" : normalizeSessionConfigValue(this._property, value, isAutoApprovePolicyRestricted(this._configurationService));
    const partial = { [this._property]: normalizedValue };
    const nextConfig = { ...this._readCurrentValues() ?? {}, ...partial };
    if (isUntitledChatSession(sessionResource)) {
      const provider = backendSession.scheme;
      const created = await this._provisional.applyConfigChange(
        sessionResource,
        provider,
        this._readWorkingDirectory(),
        partial
      );
      if (!created) {
        return;
      }
      if (!this._subRef.value || this._subRef.value.backendSession.toString() !== created.toString()) {
        this._reattach();
      }
      this._persistCodexPermissionsDefault(normalizedValue);
      return;
    }
    this._agentHostService.dispatch(backendSession.toString(), {
      type: ActionType.SessionConfigChanged,
      config: partial
    });
    void this._provisional.refreshResolvedConfig(
      sessionResource,
      backendSession.scheme,
      this._readWorkingDirectory(),
      nextConfig
    );
    this._persistCodexPermissionsDefault(normalizedValue);
  }
  _persistCodexPermissionsDefault(value) {
    if (this._property !== CodexSessionConfigKey.PermissionsPreset || typeof value !== "string") {
      return;
    }
    this._agentHostService.dispatch(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [CodexSessionConfigKey.PermissionsPreset]: value }
    });
  }
};
AgentHostChatInputPicker = __decorateClass([
  __decorateParam(2, IAgentHostService),
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IAgentHostSessionWorkingDirectoryResolver),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IAgentHostNewSessionFolderService),
  __decorateParam(11, IDialogService),
  __decorateParam(12, IStorageService)
], AgentHostChatInputPicker);
class AgentHostChatInputPickerActionViewItem extends BaseActionViewItem {
  constructor(action, _picker) {
    super(void 0, action);
    this._picker = _picker;
    this._register(this._picker);
  }
  render(container) {
    this._picker.render(container);
  }
}
export {
  AgentHostChatInputPicker,
  AgentHostChatInputPickerActionViewItem,
  WELL_KNOWN_PICKER_PROPERTIES,
  getAgentHostSandboxSettingId,
  getConfigPickerItemHover,
  getConfigPickerListOptions,
  getConfigPickerTriggerHover,
  isAgentHostSandboxToggleItem,
  isClaimedByDedicatedPicker,
  isWellKnownAutoApproveSchema,
  resolveConfigChipValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbkxpc3RPcHRpb25zLCBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RJdGVtSW5saW5lVG9nZ2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBnZXRDb2RleEFwcHJvdmFsc1BpY2tlckxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvY29kZXhBcHByb3ZhbHNQaWNrZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdFNka1NhbmRib3hXaW5kb3dzRW5hYmxlZFNldHRpbmdJZCwgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7IEtOT1dOX0FVVE9fQVBQUk9WRV9WQUxVRVMsIFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IENsYXVkZVNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NsYXVkZVNlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IENvZGV4U2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29kZXhTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgU2Vzc2lvbkNvbmZpZ1ZhbHVlSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJLCBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkU2V0dGluZ1ZhbHVlLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUsIEFnZW50U2FuZGJveFNldHRpbmdJZCwgaXNBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwsIGlzQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0Fzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkLCBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCwgaXNBdXRvQXBwcm92ZVZhbHVlUG9saWN5UmVzdHJpY3RlZCwgaXNQZXJtaXNzaW9uTGV2ZWxWaXNpYmxlLCBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0Q29uZmlnUG9saWN5LmpzJztcbmltcG9ydCB7IG1heWJlQ29uZmlybUVsZXZhdGVkUGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRQZXJtaXNzaW9uV2FybmluZ3MuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBpc1VudGl0bGVkQ2hhdFNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyB3aXRoQ2hhdElucHV0UGlja2VyTW90aW9uIH0gZnJvbSAnLi4vLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEhvc3RCYWNrZW5kU2Vzc2lvblVyaSB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvblVyaS5qcyc7XG5cbmNvbnN0IEZJTFRFUl9USFJFU0hPTEQgPSAxMDtcblxuY29uc3QgTEVBUk5fTU9SRV9WQUxVRSA9ICdfX2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5sZWFybk1vcmVfXyc7XG5jb25zdCBQRVJNSVNTSU9OU19MRUFSTl9NT1JFX1VSTCA9ICdodHRwczovL2FrYS5tcy92c2NvZGUvZG9jcy9wZXJtaXNzaW9ucyc7XG5jb25zdCBDT0RFWF9BUFBST1ZBTFNfTEVBUk5fTU9SRV9VUkwgPSAnaHR0cHM6Ly9kZXZlbG9wZXJzLm9wZW5haS5jb20vY29kZXgvY29uY2VwdHMvc2FuZGJveGluZyNob3cteW91LWNvbnRyb2wtaXQnO1xuXG5pbnRlcmZhY2UgSUNvbmZpZ1BpY2tlckl0ZW0ge1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgY2hlY2tlZD86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGdldENvbmZpZ0ljb24ocHJvcGVydHk6IHN0cmluZywgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQpOiBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuTW9kZSkge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgJ3BsYW4nOiByZXR1cm4gQ29kaWNvbi5jaGVja2xpc3Q7XG5cdFx0XHRjYXNlICdhdXRvcGlsb3QnOiByZXR1cm4gQ29kaWNvbi5yb2NrZXQ7XG5cdFx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6IHJldHVybiBDb2RpY29uLmNvbW1lbnQ7XG5cdFx0fVxuXHR9XG5cdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2F1dG9waWxvdCcpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLnJvY2tldDtcblx0XHR9XG5cdFx0aWYgKHZhbHVlID09PSAnYXV0b0FwcHJvdmUnKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi53YXJuaW5nO1xuXHRcdH1cblx0XHRpZiAodmFsdWUgPT09ICdhc3Npc3RlZCcpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLnNwYXJrbGU7XG5cdFx0fVxuXHRcdHJldHVybiBDb2RpY29uLnNoaWVsZDtcblx0fVxuXHRpZiAocHJvcGVydHkgPT09IENsYXVkZVNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbk1vZGUgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgJ2RlZmF1bHQnOiByZXR1cm4gQ29kaWNvbi5zaGllbGQ7XG5cdFx0XHRjYXNlICdhY2NlcHRFZGl0cyc6IHJldHVybiBDb2RpY29uLmVkaXQ7XG5cdFx0XHRjYXNlICdwbGFuJzogcmV0dXJuIENvZGljb24ubGlnaHRidWxiO1xuXHRcdFx0Y2FzZSAnYXV0byc6IHJldHVybiBDb2RpY29uLnNwYXJrbGU7XG5cdFx0XHRjYXNlICdieXBhc3NQZXJtaXNzaW9ucyc6IHJldHVybiBDb2RpY29uLndhcm5pbmc7XG5cdFx0fVxuXHR9XG5cdGlmIChwcm9wZXJ0eSA9PT0gQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0ICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlICdkZWZhdWx0JzogcmV0dXJuIENvZGljb24uc2hpZWxkO1xuXHRcdFx0Y2FzZSAnYXV0by1yZXZpZXcnOiByZXR1cm4gQ29kaWNvbi5zcGFya2xlO1xuXHRcdFx0Y2FzZSAnZnVsbC1hY2Nlc3MnOiByZXR1cm4gQ29kaWNvbi53YXJuaW5nO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB0b0FjdGlvbkl0ZW1zKHByb3BlcnR5OiBzdHJpbmcsIGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdLCBjdXJyZW50VmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIHBvbGljeVJlc3RyaWN0ZWQgPSBmYWxzZSwgc2FuZGJveFRvZ2dsZT86IElBY3Rpb25MaXN0SXRlbUlubGluZVRvZ2dsZSk6IElBY3Rpb25MaXN0SXRlbTxJQ29uZmlnUGlja2VySXRlbT5bXSB7XG5cdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSAmJiBpc0F1dG9BcHByb3ZlVmFsdWVQb2xpY3lSZXN0cmljdGVkKGl0ZW0udmFsdWUsIHBvbGljeVJlc3RyaWN0ZWQpO1xuXHRcdGNvbnN0IGhvdmVyID0gZ2V0Q29uZmlnUGlja2VySXRlbUhvdmVyKHByb3BlcnR5LCBpdGVtLCBkaXNhYmxlZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGRldGFpbDogZGlzYWJsZWQgPyBob3ZlciA6IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IGdldENvbmZpZ0ljb24ocHJvcGVydHksIGl0ZW0udmFsdWUpIH0sXG5cdFx0XHRkaXNhYmxlZCxcblx0XHRcdC4uLihob3ZlciA/IHsgaG92ZXI6IHsgY29udGVudDogaG92ZXIgfSB9IDoge30pLFxuXHRcdFx0Li4uKGlzQWdlbnRIb3N0U2FuZGJveFRvZ2dsZUl0ZW0ocHJvcGVydHksIGl0ZW0udmFsdWUpICYmIHNhbmRib3hUb2dnbGUgPyB7IGlubGluZVRvZ2dsZTogc2FuZGJveFRvZ2dsZSB9IDoge30pLFxuXHRcdFx0aXRlbTogeyAuLi5pdGVtLCBjaGVja2VkOiBpc1NlbGVjdGVkVmFsdWUoY3VycmVudFZhbHVlLCBpdGVtLnZhbHVlKSB9LFxuXHRcdH07XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudEhvc3RTYW5kYm94VG9nZ2xlSXRlbShwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSAmJiB2YWx1ZSA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xufVxuXG50eXBlIEFnZW50SG9zdFNhbmRib3hTZXR0aW5nSWQgPVxuXHR8IEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXG5cdHwgQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkXG5cdHwgdHlwZW9mIEFnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXG5cdHwgdHlwZW9mIEFnZW50SG9zdFNka1NhbmRib3hXaW5kb3dzRW5hYmxlZFNldHRpbmdJZDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50SG9zdFNhbmRib3hTZXR0aW5nSWQoc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgY3VzdG9tVGVybWluYWxUb29sRW5hYmxlZDogYm9vbGVhbiwgd2luZG93cyA9IGlzV2luZG93cyk6IEFnZW50SG9zdFNhbmRib3hTZXR0aW5nSWQgfCB1bmRlZmluZWQge1xuXHRpZiAoc2Vzc2lvblR5cGUgIT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChjdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkKSB7XG5cdFx0cmV0dXJuIHdpbmRvd3MgPyBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQgOiBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZDtcblx0fVxuXHRyZXR1cm4gd2luZG93cyA/IEFnZW50SG9zdFNka1NhbmRib3hXaW5kb3dzRW5hYmxlZFNldHRpbmdJZCA6IEFnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkO1xufVxuXG5mdW5jdGlvbiBpc1NlbGVjdGVkVmFsdWUoY3VycmVudFZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkLCBpdGVtVmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAodHlwZW9mIGN1cnJlbnRWYWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0cmV0dXJuIGN1cnJlbnRWYWx1ZSA9PT0gKGl0ZW1WYWx1ZSA9PT0gJ3RydWUnKTtcblx0fVxuXHRyZXR1cm4gaXRlbVZhbHVlID09PSBjdXJyZW50VmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldEF1dG9BcHByb3ZlSG92ZXIodmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIGZhbGxiYWNrOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5kZWZhdWx0QXBwcm92YWxzSG92ZXInLCBcIkNvcGlsb3QgYXNrcyBiZWZvcmUgcnVubmluZyB0b29scyB1bmxlc3MgeW91ciBjb25maWd1cmVkIHNldHRpbmdzIGFsbG93IHRoZSB0b29sLlwiKTtcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5hc3Npc3RlZEFwcHJvdmFsc0hvdmVyJywgXCJBbiBMTE0ganVkZ2UgZXZhbHVhdGVzIGVhY2ggdG9vbCBjYWxsLiBUb29scyBpdCBkb2Vzbid0IGFwcHJvdmUgcmVxdWlyZSB5b3VyIGFwcHJvdmFsLlwiKTtcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmU6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5hdXRvQXBwcm92ZUhvdmVyJywgXCJDb3BpbG90IHJ1bnMgYWxsIHRvb2xzIHdpdGhvdXQgYXNraW5nIGZvciBhcHByb3ZhbC5cIik7XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmF1dG9waWxvdEFwcHJvdmFsc0hvdmVyJywgXCJDb3BpbG90IHJ1bnMgdG9vbHMgd2l0aG91dCBhc2tpbmcgZm9yIGFwcHJvdmFsIGFuZCBjb250aW51ZXMgdW50aWwgdGhlIHRhc2sgaXMgZG9uZS5cIik7XG5cdH1cblx0cmV0dXJuIGZhbGxiYWNrID8/IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYXBwcm92YWxzSG92ZXInLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGFnZW50IGFza3MgYmVmb3JlIHJ1bm5pbmcgdG9vbHMgaW4gdGhpcyBzZXNzaW9uLlwiKTtcbn1cblxuZnVuY3Rpb24gZ2V0RW51bVZhbHVlRGVzY3JpcHRpb24oc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGluZGV4ID0gc2NoZW1hLmVudW0/LmluZGV4T2YodmFsdWUpID8/IC0xO1xuXHRyZXR1cm4gaW5kZXggPj0gMCA/IHNjaGVtYS5lbnVtRGVzY3JpcHRpb25zPy5baW5kZXhdIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29uZmlnUGlja2VyVHJpZ2dlckhvdmVyKHByb3BlcnR5OiBzdHJpbmcsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgaXNSZWFkT25seTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGlmIChwcm9wZXJ0eSA9PT0gQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0KSB7XG5cdFx0cmV0dXJuIGdldEVudW1WYWx1ZURlc2NyaXB0aW9uKHNjaGVtYSwgdmFsdWUpID8/IHNjaGVtYS5kZXNjcmlwdGlvbiA/PyBzY2hlbWEudGl0bGU7XG5cdH1cblx0aWYgKHByb3BlcnR5ICE9PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0cmV0dXJuIHNjaGVtYS5kZXNjcmlwdGlvbiA/PyBzY2hlbWEudGl0bGU7XG5cdH1cblxuXHRjb25zdCBob3ZlciA9IGdldEF1dG9BcHByb3ZlSG92ZXIodmFsdWUsIGdldEVudW1WYWx1ZURlc2NyaXB0aW9uKHNjaGVtYSwgdmFsdWUpKTtcblx0aWYgKGlzUmVhZE9ubHkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5hcHByb3ZhbHNMZXZlbEhvdmVyUmVhZE9ubHknLCBcInswfSBSZWFkLW9ubHkuXCIsIGhvdmVyKTtcblx0fVxuXHRyZXR1cm4gaG92ZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25maWdQaWNrZXJJdGVtSG92ZXIocHJvcGVydHk6IHN0cmluZywgaXRlbTogSUNvbmZpZ1BpY2tlckl0ZW0sIGRpc2FibGVkOiBib29sZWFuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGRpc2FibGVkKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIucG9saWN5RGlzYWJsZWRIb3ZlcicsIFwiRGlzYWJsZWQgYnkgeW91ciBvcmdhbml6YXRpb24uIENvbnRhY3QgeW91ciBhZG1pbmlzdHJhdG9yLlwiKTtcblx0fVxuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRyZXR1cm4gZ2V0QXV0b0FwcHJvdmVIb3ZlcihpdGVtLnZhbHVlLCBpdGVtLmRlc2NyaXB0aW9uKTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRQZXJtaXNzaW9uc0xlYXJuTW9yZVVybChwcm9wZXJ0eTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHByb3BlcnR5ID09PSBDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXQpIHtcblx0XHRyZXR1cm4gQ09ERVhfQVBQUk9WQUxTX0xFQVJOX01PUkVfVVJMO1xuXHR9XG5cdGlmIChwcm9wZXJ0eSA9PT0gQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZSB8fCBwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkge1xuXHRcdHJldHVybiBQRVJNSVNTSU9OU19MRUFSTl9NT1JFX1VSTDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29uZmlnUGlja2VyTGlzdE9wdGlvbnMocHJvcGVydHk6IHN0cmluZyk6IElBY3Rpb25MaXN0T3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAocHJvcGVydHkpIHtcblx0XHRjYXNlIFNlc3Npb25Db25maWdLZXkuTW9kZTpcblx0XHRcdHJldHVybiB7IG1pbldpZHRoOiAyNjAgfTtcblx0XHRjYXNlIFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmU6XG5cdFx0XHRyZXR1cm4geyBtaW5XaWR0aDogMjU1IH07XG5cdFx0Y2FzZSBDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXQ6XG5cdFx0XHRyZXR1cm4gZ2V0Q29kZXhBcHByb3ZhbHNQaWNrZXJMaXN0T3B0aW9ucygpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclBpY2tlclRyaWdnZXIoc2xvdDogSFRNTEVsZW1lbnQsIGRpc2FibGVkOiBib29sZWFuLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBvbk9wZW46ICgpID0+IHZvaWQpOiBIVE1MRWxlbWVudCB7XG5cdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRpc2FibGVkID8gZG9tLiQoJ3NwYW4uYWN0aW9uLWxhYmVsJykgOiBkb20uJCgnYS5hY3Rpb24tbGFiZWwnKSk7XG5cdGlmIChkaXNhYmxlZCkge1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLXJlYWRvbmx5JywgJ3RydWUnKTtcblx0fSBlbHNlIHtcblx0XHR0cmlnZ2VyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0cmlnZ2VyLnRhYkluZGV4ID0gMDtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICdsaXN0Ym94Jyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRyaWdnZXIpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdG9uT3BlbigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRvbk9wZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblx0c2xvdC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGRpc2FibGVkKTtcblx0cmV0dXJuIHRyaWdnZXI7XG59XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgd2hlbiBhbiBgYXV0b0FwcHJvdmVgIHNjaGVtYSB1c2VzIHRoZSB3ZWxsLWtub3duIHNoYXBlIHRoZVxuICogZGVkaWNhdGVkIEF1dG8tQXBwcm92ZSBwaWNrZXIgdW5kZXJzdGFuZHM6IGEgc3RyaW5nIGVudW0gdGhhdCBpbmNsdWRlc1xuICogYGRlZmF1bHRgIGFuZCBvbmx5IGNvbnRhaW5zIHZhbHVlcyBmcm9tIHtAbGluayBLTk9XTl9BVVRPX0FQUFJPVkVfVkFMVUVTfS5cbiAqXG4gKiBBZ2VudHMgdGhhdCBhZHZlcnRpc2UgYSBjdXN0b20gYXV0by1hcHByb3ZlIHNoYXBlIChlLmcuIENsYXVkZSkgZmFsbFxuICogdGhyb3VnaCB0byB0aGUgZ2VuZXJpYyBwZXItcHJvcGVydHkgcGlja2VyIGxhbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hKTogYm9vbGVhbiB7XG5cdGlmIChzY2hlbWEudHlwZSAhPT0gJ3N0cmluZycgfHwgIUFycmF5LmlzQXJyYXkoc2NoZW1hLmVudW0pIHx8IHNjaGVtYS5lbnVtLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIXNjaGVtYS5lbnVtLmluY2x1ZGVzKCdkZWZhdWx0JykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHNjaGVtYS5lbnVtLmV2ZXJ5KHZhbHVlID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgS05PV05fQVVUT19BUFBST1ZFX1ZBTFVFUy5oYXModmFsdWUpKTtcbn1cblxuLyoqXG4gKiBUaGUgc2V0IG9mIHdlbGwta25vd24gc2Vzc2lvbi1jb25maWcgcHJvcGVydHkgbmFtZXMgdGhhdCBhcmUgZWl0aGVyIGhhbmRsZWRcbiAqIGJ5IGRlZGljYXRlZCBVSSBvciBpbnRlbnRpb25hbGx5IGhpZGRlbiBmcm9tIHRoZSB3b3JrYmVuY2ggY2hhdC1pbnB1dCBjaGlwXG4gKiBsYW5lLiBUaGUgZ2VuZXJpYy1mYWxsYmFjayBjaGlwIGxhbmUgZmlsdGVycyB0aGVzZSBvdXQgc28gdW5rbm93biBwcm9wZXJ0aWVzXG4gKiBhZHZlcnRpc2VkIGJ5IGFuIGFnZW50IGdldCB0aGVpciBvd24gY2hpcC5cbiAqXG4gKiBgUGVybWlzc2lvbnNgIGhhcyBubyBjaGlwIFx1MjAxNCBpdCBpcyBzdXJmYWNlZCB0aHJvdWdoIG90aGVyIFVJIFx1MjAxNCBidXQgaXNcbiAqIGluY2x1ZGVkIHNvIHRoZSBnZW5lcmljIGxhbmUgZG9lcyBub3QgaW52ZW50IGEgY2hpcCBmb3IgaXQuXG4gKlxuICogYFdvcmt0cmVlQnJhbmNoUHJlZml4YCBsaWtld2lzZSBoYXMgbm8gY2hpcDogaXQgaXMgYSBjYXJyaWVyIHZhbHVlIHNlZWRlZCBieVxuICogdGhlIGNsaWVudCAoZnJvbSBgZ2l0LmJyYW5jaFByZWZpeGApIGFuZCBjb25zdW1lZCBieSB0aGUgYWdlbnQgZm9yIHdvcmt0cmVlXG4gKiBpc29sYXRpb24sIG5ldmVyIGVkaXRlZCBieSB0aGUgdXNlci4gSW5jbHVkaW5nIGl0IGhlcmUga2VlcHMgdGhlIGdlbmVyaWMgbGFuZVxuICogZnJvbSBzdXJmYWNpbmcgaXQgYXMgYSBjaGlwIGluIHRoZSBjaGF0IGlucHV0LlxuICovXG5leHBvcnQgY29uc3QgV0VMTF9LTk9XTl9QSUNLRVJfUFJPUEVSVElFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPihbXG5cdFNlc3Npb25Db25maWdLZXkuTW9kZSxcblx0U2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSxcblx0U2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sXG5cdFNlc3Npb25Db25maWdLZXkuQnJhbmNoLFxuXHRTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zLFxuXHRTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4LFxuXHRTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2ssXG5cdFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXMsXG5cdENsYXVkZVNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbk1vZGUsXG5cdENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldCxcbl0pO1xuXG4vKipcbiAqIFdoZXRoZXIgdGhlIGdpdmVuIGAocHJvcGVydHksIHNjaGVtYSlgIHBhaXIgaXMgaGFuZGxlZCBvdXRzaWRlIHRoZVxuICogZ2VuZXJpYy1mYWxsYmFjayBjaGlwIGxhbmUuIFRoaXMgaW5jbHVkZXMgcHJvcGVydGllcyByZW5kZXJlZCBieSBkZWRpY2F0ZWRcbiAqIGNoaXAgd2lkZ2V0cyBhbmQgcHJvcGVydGllcyBpbnRlbnRpb25hbGx5IGhpZGRlbiBmcm9tIHdvcmtiZW5jaCBjaGF0LlxuICpcbiAqIEZvciBtb3N0IHdlbGwta25vd24ga2V5cyB0aGlzIGlzIHB1cmVseSBhIHByb3BlcnR5LW5hbWUgY2hlY2suIEF1dG9BcHByb3ZlIGlzXG4gKiBzcGVjaWFsOiBvbmx5IHdlbGwta25vd24gc2NoZW1hIHNoYXBlcyBhcmUgY2xhaW1lZCBieSB0aGUgZGVkaWNhdGVkIHBpY2tlcjtcbiAqIG5vbi1jb25mb3JtaW5nIHNjaGVtYXMgKGUuZy4gQ2xhdWRlJ3MgYXBwcm92YWwgbW9kZSkgZmFsbCB0aHJvdWdoIHRvIHRoZVxuICogZ2VuZXJpYyBsYW5lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDbGFpbWVkQnlEZWRpY2F0ZWRQaWNrZXIocHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEpOiBib29sZWFuIHtcblx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0cmV0dXJuIGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKTtcblx0fVxuXHRyZXR1cm4gV0VMTF9LTk9XTl9QSUNLRVJfUFJPUEVSVElFUy5oYXMocHJvcGVydHkpO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHdoaWNoIGNvbmZpZyB2YWx1ZSBhIGNoYXQtaW5wdXQgY2hpcCBzaG91bGQgZGlzcGxheSwgZ2l2ZW4gdGhlXG4gKiBzZXJ2ZXIncyBzZXNzaW9uLXN0YXRlIHZhbHVlIGFuZCB0aGUgd29ya2JlbmNoIG92ZXJsYXkgdmFsdWUuXG4gKlxuICogUHJlY2VkZW5jZSBkZXBlbmRzIG9uIHRoZSBzZXNzaW9uIGxpZmVjeWNsZTpcbiAqICAtIFVudGl0bGVkIChwcmUtc2VuZCk6IHRoZSB3b3JrYmVuY2ggb3ZlcmxheSBpcyBhdXRob3JpdGF0aXZlIFx1MjAxNCBpdCByZWZsZWN0c1xuICogICAgc3luY2hyb25vdXMgY2hpcCBlZGl0cyBiZWZvcmUgdGhlIHByb3Zpc2lvbmFsIGJhY2tlbmQgZWNob2VzIHRoZW0sIHNvIGl0XG4gKiAgICB3aW5zIG92ZXIgc2VydmVyIHN0YXRlLlxuICogIC0gUnVubmluZyAodGl0bGVkKTogdGhlICpzZXJ2ZXIqIGlzIGF1dGhvcml0YXRpdmUuIFRoZSBvdmVybGF5IGlzIG9ubHlcbiAqICAgIHJlZnJlc2hlZCBvbiBtYW51YWwgY2hpcCBlZGl0cywgc28gc2VydmVyLWRyaXZlbiBjaGFuZ2VzIChlLmcuIFBsYW4gXHUyMTkyXG4gKiAgICBBdXRvcGlsb3Qgd2hlbiB0aGUgdXNlciBhcHByb3ZlcyBhIHBsYW4pIG11c3Qgd2luLCBvdGhlcndpc2UgYSBzdGFsZVxuICogICAgb3ZlcmxheSB2YWx1ZSB3b3VsZCBzaGFkb3cgdGhlbS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb25maWdDaGlwVmFsdWUoaXNVbnRpdGxlZDogYm9vbGVhbiwgc2VydmVyVmFsdWU6IHVua25vd24sIG92ZXJsYXlWYWx1ZTogdW5rbm93biwgc2NoZW1hRGVmYXVsdDogdW5rbm93bik6IHVua25vd24ge1xuXHRjb25zdCBwcmVmZXJyZWQgPSBpc1VudGl0bGVkXG5cdFx0PyAob3ZlcmxheVZhbHVlID8/IHNlcnZlclZhbHVlKVxuXHRcdDogKHNlcnZlclZhbHVlID8/IG92ZXJsYXlWYWx1ZSk7XG5cdHJldHVybiBwcmVmZXJyZWQgPz8gc2NoZW1hRGVmYXVsdDtcbn1cblxuLyoqXG4gKiBPbmUgd29ya2JlbmNoIGNoYXQtaW5wdXQgY2hpcCBib3VuZCB0byBhIHNpbmdsZSBhZ2VudC1ob3N0IHNlc3Npb24tY29uZmlnXG4gKiBwcm9wZXJ0eS4gVXNlZCBib3RoIGZvciBkZWRpY2F0ZWQgd2VsbC1rbm93biBwcm9wZXJ0eSBjaGlwc1xuICogKGBTZXNzaW9uQ29uZmlnS2V5Lk1vZGVgLCBgLkF1dG9BcHByb3ZlYCkgYW5kIGZvciBnZW5lcmljIHBlci1wcm9wZXJ0eSBjaGlwc1xuICogYWR2ZXJ0aXNlZCBieSBhbiBhZ2VudCdzIGNvbmZpZyBzY2hlbWEgYnV0IG5vdCBrbm93biB0byBWUyBDb2RlLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdHJpZ2dlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2luaXRpYWxSZXNvbHZlZDogeyByZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgcmVzdWx0OiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsUmVzb2x2ZUN0cyA9IHRoaXMuX3JlZ2lzdGVySW5pdGlhbFJlc29sdmVDdHMoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWx0ZXJEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8cmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElDb25maWdQaWNrZXJJdGVtPltdPigyMDApKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3ViUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlICYgeyByZWFkb25seSBzdWI6IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+OyByZWFkb25seSBiYWNrZW5kU2Vzc2lvbjogVVJJIH0+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogSUNoYXRXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvcGVydHk6IHN0cmluZyxcblx0XHRASUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdEaXJlY3RvcnlSZXNvbHZlcjogSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb3Zpc2lvbmFsOiBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlOiBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWF0dGFjaCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm92aXNpb25hbC5vbkRpZENoYW5nZSgoc2Vzc2lvblJlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoY3VycmVudCAmJiBjdXJyZW50LnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMuX3JlYXR0YWNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IHNhbmRib3hTZXR0aW5nSWQgPSB0aGlzLl9nZXRTYW5kYm94U2V0dGluZ0lkKCk7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5QZXJtaXNzaW9uc1NhbmRib3hUb2dnbGVFbmFibGVkKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQpXG5cdFx0XHRcdHx8IChzYW5kYm94U2V0dGluZ0lkICYmIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oc2FuZGJveFNldHRpbmdJZCkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hUcmlnZ2VyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlYXR0YWNoKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckluaXRpYWxSZXNvbHZlQ3RzKCk6IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl90cmlnZ2VyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY2FuY2VsSW5pdGlhbFJlc29sdmUoKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKGN0cyk7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtaG9zdC1jaGF0LWlucHV0LXBpY2tlci1ob3N0Jyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYGFnZW50LWhvc3QtY2hhdC1pbnB1dC1waWNrZXItaG9zdC0ke3RoaXMuX3Byb3BlcnR5fWApO1xuXHRcdGlmICh0aGlzLl9wcm9wZXJ0eSA9PT0gQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0KSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY29kZXgtcGVybWlzc2lvbnMtY2hpcCcpO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJDaGlwKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWF0dGFjaCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgcHJvdmlzaW9uYWxCYWNrZW5kID0gc2Vzc2lvblJlc291cmNlID8gdGhpcy5fcHJvdmlzaW9uYWwuZ2V0KHNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBwcm92aXNpb25hbEJhY2tlbmRcblx0XHRcdD8/IChzZXNzaW9uUmVzb3VyY2UgPyB0b0FnZW50SG9zdEJhY2tlbmRTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQpO1xuXG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UgfHwgIWJhY2tlbmRTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9zdWJSZWYuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NhbmNlbEluaXRpYWxSZXNvbHZlKCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJDaGlwKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpICYmICFwcm92aXNpb25hbEJhY2tlbmQpIHtcblx0XHRcdHRoaXMuX3N1YlJlZi5jbGVhcigpO1xuXHRcdFx0aWYgKCF0aGlzLl9pbml0aWFsUmVzb2x2ZWQgfHwgdGhpcy5faW5pdGlhbFJlc29sdmVkLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpICE9PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHZvaWQgdGhpcy5fcmVmcmVzaEluaXRpYWxSZXNvbHZlZChzZXNzaW9uUmVzb3VyY2UsIGJhY2tlbmRTZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdC8vIEVhZ2VybHkgY3JlYXRlIGEgcHJvdmlzaW9uYWwgYmFja2VuZCBzZXNzaW9uIHNvIGV2ZW4gdXNlcnNcblx0XHRcdC8vIHdobyBuZXZlciB0b3VjaCBhIGNoaXAgc3RpbGwgZ2V0IHRoZWlyIHBpY2tlciBkZWZhdWx0c1xuXHRcdFx0Ly8gKGUuZy4gYGlzb2xhdGlvbjogJ3dvcmt0cmVlJ2ApIGZsb3dlZCB0aHJvdWdoIHRvIHRoZSBhZ2VudFxuXHRcdFx0Ly8gYXQgbWF0ZXJpYWxpemF0aW9uIHRpbWUuIFdpdGhvdXQgdGhpcywgc2VuZGluZyB0aGUgdmVyeVxuXHRcdFx0Ly8gZmlyc3QgbWVzc2FnZSBnb2VzIHRocm91Z2ggdGhlIGhhbmRsZXIncyBzdGFuZGFyZFxuXHRcdFx0Ly8gYF9jcmVhdGVBbmRTdWJzY3JpYmVgIHBhdGggd2l0aCBubyBgc2Vzc2lvbkNvbmZpZ2AuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSWRlbXBvdGVudCArIHNlcmlhbGlzZWQgaW5zaWRlIHRoZSBzZXJ2aWNlLCBzbyBlYWNoIGNoaXBcblx0XHRcdC8vIGluc3RhbmNlIHJhY2luZyBpbnRvIHRoaXMgYnJhbmNoIHByb2R1Y2VzIGV4YWN0bHkgb25lXG5cdFx0XHQvLyBwcm92aXNpb25hbC4gT25jZSBpdCByZXNvbHZlcywgdGhlIHNlcnZpY2UgZmlyZXNcblx0XHRcdC8vIGBvbkRpZENoYW5nZWAgYW5kIHdlIHJlLWF0dGFjaCBpbnRvIHRoZSBzdWJzY3JpcHRpb24gcGF0aC5cblx0XHRcdHZvaWQgdGhpcy5fcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUoXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0YmFja2VuZFNlc3Npb24uc2NoZW1lLFxuXHRcdFx0XHR0aGlzLl9yZWFkV29ya2luZ0RpcmVjdG9yeSgpLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX3JlbmRlckNoaXAoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pbml0aWFsUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY2FuY2VsSW5pdGlhbFJlc29sdmUoKTtcblx0XHRjb25zdCByZWYgPSB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgYmFja2VuZFNlc3Npb24sICdBZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXInKTtcblx0XHRjb25zdCBzdWIgPSByZWYub2JqZWN0O1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gc3ViLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3JlbmRlckNoaXAoKSk7XG5cdFx0dGhpcy5fc3ViUmVmLnZhbHVlID0ge1xuXHRcdFx0c3ViLFxuXHRcdFx0YmFja2VuZFNlc3Npb24sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IGxpc3RlbmVyLmRpc3Bvc2UoKTsgcmVmLmRpc3Bvc2UoKTsgfSxcblx0XHR9O1xuXHRcdHRoaXMuX3JlbmRlckNoaXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbEluaXRpYWxSZXNvbHZlKCk6IHZvaWQge1xuXHRcdC8vIENhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UoKSBkb2VzIG5vdCBjYW5jZWwgYnkgZGVmYXVsdCwgc28gd2Vcblx0XHQvLyBtdXN0IGV4cGxpY2l0bHkgY2FuY2VsIGJlZm9yZSBjbGVhcmluZy9yZXBsYWNpbmcgdG8gZW5zdXJlIGFueVxuXHRcdC8vIGluLWZsaWdodCByZXNvbHZlU2Vzc2lvbkNvbmZpZyBjYWxsIGNhbm5vdCBzdGlsbCB3cml0ZSBiYWNrIGludG9cblx0XHQvLyBgX2luaXRpYWxSZXNvbHZlZGAgYWZ0ZXIgdGhlIHNlc3Npb24gaGFzIG1vdmVkIG9uLlxuXHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9pbml0aWFsUmVzb2x2ZUN0cy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaEluaXRpYWxSZXNvbHZlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgYmFja2VuZFNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9pbml0aWFsUmVzb2x2ZUN0cy52YWx1ZSA9IGN0cztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRcdHByb3ZpZGVyOiBiYWNrZW5kU2Vzc2lvbi5zY2hlbWUsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMuX3JlYWRXb3JraW5nRGlyZWN0b3J5KCksXG5cdFx0XHR9KTtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpICE9PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbml0aWFsUmVzb2x2ZWQgPSB7IHNlc3Npb25SZXNvdXJjZSwgcmVzdWx0IH07XG5cdFx0XHR0aGlzLl9yZW5kZXJDaGlwKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBCZXN0LWVmZm9ydC5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDaGlwKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyIHx8IHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdHJpZ2dlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX3JlYWRDb250ZXh0KCk7XG5cdFx0Ly8gRm9yIHNlc3Npb25zIHRoYXQgaGF2ZSBhbHJlYWR5IHN0YXJ0ZWQgKGkuZS4gbm8gbG9uZ2VyIHVudGl0bGVkIFx1MjAxNFxuXHRcdC8vIHRoZSBmaXJzdCBtZXNzYWdlIHdhcyBzZW50IGFuZCB0aGUgY2hhdCBzZXNzaW9uIGhhcyBiZWVuXG5cdFx0Ly8gbWF0ZXJpYWxpemVkKSwgaGlkZSB0aGUgcGlja2VyIGVudGlyZWx5IHdoZW4gdGhlIHByb3BlcnR5IGNhbm5vdFxuXHRcdC8vIGJlIGNoYW5nZWQgcG9zdC1jcmVhdGlvbi4gV2hpbGUgdGhlIHNlc3Npb24gaXMgc3RpbGwgdW50aXRsZWQgdGhlXG5cdFx0Ly8gdXNlciBpcyBpbiB0aGUgcHJlLXNlbmQgY29uZmlndXJhdGlvbiBwaGFzZSBhbmQgbXVzdCBiZSBhYmxlIHRvXG5cdFx0Ly8gYWRqdXN0IGNyZWF0aW9uLXRpbWUtb25seSBwcm9wZXJ0aWVzIChlLmcuIGlzb2xhdGlvbiwgYnJhbmNoKS5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgaXNTdGFydGVkU2Vzc2lvbiA9ICEhc2Vzc2lvblJlc291cmNlICYmICFpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWN0eCB8fCAoaXNTdGFydGVkU2Vzc2lvbiAmJiBjdHguc2NoZW1hLnNlc3Npb25NdXRhYmxlID09PSBmYWxzZSkpIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FnZW50LWhvc3QtY2hhdC1pbnB1dC1waWNrZXItaG9zdC1oaWRkZW4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIGRlZGljYXRlZCBBdXRvQXBwcm92ZSBjaGlwIG9ubHkgaGFuZGxlcyB0aGUgd2VsbC1rbm93biBzY2hlbWFcblx0XHQvLyBzaGFwZSAoZGVmYXVsdC9hdXRvQXBwcm92ZS9hdXRvcGlsb3QpLiBXaGVuIGFuIGFnZW50IGFkdmVydGlzZXMgYVxuXHRcdC8vIGN1c3RvbSBBdXRvQXBwcm92ZSBzY2hlbWEgKGUuZy4gQ2xhdWRlJ3MgYXBwcm92YWwgbW9kZXMpLCBsZXQgdGhlXG5cdFx0Ly8gZ2VuZXJpYy1mYWxsYmFjayBjaGlwIGxhbmUgcmVuZGVyIGl0IGluc3RlYWQuXG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmICFpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKGN0eC5zY2hlbWEpKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhZ2VudC1ob3N0LWNoYXQtaW5wdXQtcGlja2VyLWhvc3QtaGlkZGVuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2FnZW50LWhvc3QtY2hhdC1pbnB1dC1waWNrZXItaG9zdC1oaWRkZW4nKTtcblxuXHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5hZ2VudC1ob3N0LWNoYXQtaW5wdXQtcGlja2VyLXNsb3QnKSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IGlzUmVhZE9ubHkgPSAhIWN0eC5zY2hlbWEucmVhZE9ubHkgfHwgKGlzU3RhcnRlZFNlc3Npb24gJiYgY3R4LnNjaGVtYS5zZXNzaW9uTXV0YWJsZSA9PT0gZmFsc2UpO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSByZW5kZXJQaWNrZXJUcmlnZ2VyKHNsb3QsIGlzUmVhZE9ubHksIHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLCAoKSA9PiB0aGlzLl9zaG93UGlja2VyKHRyaWdnZXIpKTtcblx0XHR0aGlzLl90cmlnZ2VyID0gdHJpZ2dlcjtcblx0XHRjb25zdCB0b29sdGlwID0gZ2V0Q29uZmlnUGlja2VyVHJpZ2dlckhvdmVyKHRoaXMuX3Byb3BlcnR5LCBjdHguc2NoZW1hLCBjdHgudmFsdWUsIGlzUmVhZE9ubHkpO1xuXHRcdGlmICh0b29sdGlwKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRyaWdnZXIsIHsgY29udGVudDogdG9vbHRpcCB9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlclRyaWdnZXIodHJpZ2dlciwgY3R4LnNjaGVtYSwgY3R4LnZhbHVlLCBpc1JlYWRPbmx5KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclRyaWdnZXIodHJpZ2dlcjogSFRNTEVsZW1lbnQsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgaXNSZWFkT25seTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodHJpZ2dlcik7XG5cblx0XHRjb25zdCBpY29uID0gZ2V0Q29uZmlnSWNvbih0aGlzLl9wcm9wZXJ0eSwgdmFsdWUpO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24oaWNvbikpO1xuXHRcdH1cblx0XHQvLyBNaXJyb3IgdGhlIHNlc3Npb25zLXNpZGUgcGlja2VyOiBlbGV2YXRlZCBhcHByb3ZhbCBsZXZlbHMgZ2V0IHRoZW1lZCBjb2xvcnMuXG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0XHR0cmlnZ2VyLmNsYXNzTGlzdC50b2dnbGUoJ3dhcm5pbmcnLCB2YWx1ZSA9PT0gJ2F1dG9waWxvdCcgfHwgdmFsdWUgPT09ICdhc3Npc3RlZCcpO1xuXHRcdFx0dHJpZ2dlci5jbGFzc0xpc3QudG9nZ2xlKCdpbmZvJywgdmFsdWUgPT09ICdhdXRvQXBwcm92ZScpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcHJvcGVydHkgPT09IENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldCkge1xuXHRcdFx0dHJpZ2dlci5jbGFzc0xpc3QudG9nZ2xlKCd3YXJuaW5nJywgdmFsdWUgPT09ICdmdWxsLWFjY2VzcycpO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX2xhYmVsRm9yKHNjaGVtYSwgdmFsdWUpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodHJpZ2dlciwgZG9tLiQoJ3NwYW4uYWdlbnQtaG9zdC1jaGF0LWlucHV0LXBpY2tlci1sYWJlbCcpKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGlzUmVhZE9ubHlcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci50cmlnZ2VyQXJpYVJlYWRPbmx5JywgXCJ7MH06IHsxfSwgUmVhZC1Pbmx5XCIsIHNjaGVtYS50aXRsZSwgbGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIudHJpZ2dlckFyaWEnLCBcInswfTogezF9XCIsIHNjaGVtYS50aXRsZSwgbGFiZWwpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hUcmlnZ2VyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRyaWdnZXIgPSB0aGlzLl90cmlnZ2VyO1xuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX3JlYWRDb250ZXh0KCk7XG5cdFx0aWYgKCF0cmlnZ2VyIHx8ICFjdHgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGlzU3RhcnRlZFNlc3Npb24gPSAhIXNlc3Npb25SZXNvdXJjZSAmJiAhaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgaXNSZWFkT25seSA9ICEhY3R4LnNjaGVtYS5yZWFkT25seSB8fCAoaXNTdGFydGVkU2Vzc2lvbiAmJiBjdHguc2NoZW1hLnNlc3Npb25NdXRhYmxlID09PSBmYWxzZSk7XG5cdFx0dGhpcy5fcmVuZGVyVHJpZ2dlcih0cmlnZ2VyLCBjdHguc2NoZW1hLCBjdHgudmFsdWUsIGlzUmVhZE9ubHkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGFiZWxGb3Ioc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fcHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVcblx0XHRcdCYmIHZhbHVlID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHRcblx0XHRcdCYmIHRoaXMuX2lzU2FuZGJveFRvZ2dsZVNldHRpbmdFbmFibGVkKClcblx0XHRcdCYmIHRoaXMuX2lzU2FuZGJveGluZ0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIubWFudWFsU2FuZGJveGVkTGFiZWwnLCBcIk1hbnVhbCBwZXJtaXNzaW9ucyAoc2FuZGJveGVkKVwiKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ID09PSBDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXQgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZih2YWx1ZSkgPz8gLTE7XG5cdFx0XHRjb25zdCBwcmVzZXRMYWJlbCA9IGluZGV4ID49IDAgPyBzY2hlbWEuZW51bUxhYmVscz8uW2luZGV4XSA/PyB2YWx1ZSA6IHZhbHVlO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuY29kZXhQZXJtaXNzaW9uc0xhYmVsJywgXCJQZXJtaXNzaW9ucyBcdTAwQjcgezB9XCIsIHByZXNldExhYmVsKTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB2YWx1ZSA9PT0gdHJ1ZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYm9vbGVhbi5vbkxhYmVsJywgXCJPblwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYm9vbGVhbi5vZmZMYWJlbCcsIFwiT2ZmXCIpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZih2YWx1ZSkgPz8gLTE7XG5cdFx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IHNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IHZhbHVlIDogdmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiBzY2hlbWEudGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ29udGV4dCgpOiB7IGJhY2tlbmRTZXNzaW9uOiBVUkk7IHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hOyB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N1YlJlZi52YWx1ZSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdWJSZWYudmFsdWUuc3ViLnZhbHVlO1xuXHRcdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBQcmVmZXIgdGhlIHdvcmtiZW5jaC1zaWRlIHJlLXJlc29sdmVkIGNvbmZpZyBzbyBkZXBlbmRlbnRcblx0XHRcdC8vIHByb3BlcnRpZXMgKGUuZy4gYnJhbmNoLnJlYWRPbmx5IHdoZW4gaXNvbGF0aW9uIGZsaXBzKSByZWZyZXNoXG5cdFx0XHQvLyB3aXRob3V0IHdhaXRpbmcgZm9yIGEgcHJvdG9jb2wtbGV2ZWwgc2NoZW1hLXVwZGF0ZSBjaGFubmVsLiBVc2Vcblx0XHRcdC8vIG92ZXJsYXkudmFsdWVzIHRvbzogYHZhbGlkYXRlT3JEZWZhdWx0YCBtYXkgY2xhbXAgc3RhbGUgdmFsdWVzXG5cdFx0XHQvLyBvciBpbmplY3QgZGVyaXZlZCBkZWZhdWx0cyB0aGUgY2hpcCBzaG91bGQgZGlzcGxheS5cblx0XHRcdGNvbnN0IG92ZXJsYXkgPSB0aGlzLl9wcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc2NoZW1hU291cmNlID0gb3ZlcmxheT8uc2NoZW1hID8/IHN0YXRlLmNvbmZpZz8uc2NoZW1hO1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gc2NoZW1hU291cmNlPy5wcm9wZXJ0aWVzW3RoaXMuX3Byb3BlcnR5XTtcblx0XHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXJ2ZXJWYWx1ZSA9IHN0YXRlLmNvbmZpZz8udmFsdWVzPy5bdGhpcy5fcHJvcGVydHldO1xuXHRcdFx0Y29uc3Qgb3ZlcmxheVZhbHVlID0gb3ZlcmxheT8udmFsdWVzPy5bdGhpcy5fcHJvcGVydHldO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXNvbHZlQ29uZmlnQ2hpcFZhbHVlKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpLCBzZXJ2ZXJWYWx1ZSwgb3ZlcmxheVZhbHVlLCBzY2hlbWEuZGVmYXVsdCk7XG5cdFx0XHRyZXR1cm4geyBiYWNrZW5kU2Vzc2lvbjogdGhpcy5fc3ViUmVmLnZhbHVlLmJhY2tlbmRTZXNzaW9uLCBzY2hlbWEsIHZhbHVlIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2luaXRpYWxSZXNvbHZlZCAmJiB0aGlzLl9pbml0aWFsUmVzb2x2ZWQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSB0aGlzLl9pbml0aWFsUmVzb2x2ZWQucmVzdWx0LnNjaGVtYS5wcm9wZXJ0aWVzW3RoaXMuX3Byb3BlcnR5XTtcblx0XHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghYmFja2VuZFNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5faW5pdGlhbFJlc29sdmVkLnJlc3VsdC52YWx1ZXM/Llt0aGlzLl9wcm9wZXJ0eV0gPz8gc2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRyZXR1cm4geyBiYWNrZW5kU2Vzc2lvbiwgc2NoZW1hLCB2YWx1ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93UGlja2VyKHRyaWdnZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX3JlYWRDb250ZXh0KCk7XG5cdFx0aWYgKCFjdHggfHwgY3R4LnNjaGVtYS5yZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fZ2V0SXRlbXMoY3R4LnNjaGVtYSk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBjdHgudmFsdWU7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhY3Rpb25JdGVtcyA9IHRvQWN0aW9uSXRlbXModGhpcy5fcHJvcGVydHksIGl0ZW1zLCBjdXJyZW50VmFsdWUsIHBvbGljeVJlc3RyaWN0ZWQsIHRoaXMuX2dldFNhbmRib3hJbmxpbmVUb2dnbGUoKSk7XG5cdFx0Y29uc3QgcGVybWlzc2lvbnNMZWFybk1vcmVVcmwgPSBnZXRQZXJtaXNzaW9uc0xlYXJuTW9yZVVybCh0aGlzLl9wcm9wZXJ0eSk7XG5cdFx0aWYgKHBlcm1pc3Npb25zTGVhcm5Nb3JlVXJsKSB7XG5cdFx0XHRjb25zdCBsZWFybk1vcmVMYWJlbCA9IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIubGVhcm5Nb3JlUGVybWlzc2lvbnMnLCBcIkxlYXJuIG1vcmUgYWJvdXQgcGVybWlzc2lvbnNcIik7XG5cdFx0XHRhY3Rpb25JdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcixcblx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0fSk7XG5cdFx0XHRhY3Rpb25JdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0bGFiZWw6IGxlYXJuTW9yZUxhYmVsLFxuXHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24uYmxhbmsgfSxcblx0XHRcdFx0aXRlbTogeyB2YWx1ZTogTEVBUk5fTU9SRV9WQUxVRSwgbGFiZWw6IGxlYXJuTW9yZUxhYmVsIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQ29uZmlnUGlja2VySXRlbT4gPSB7XG5cdFx0XHRvblNlbGVjdDogaXRlbSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0XHRpZiAoaXRlbS52YWx1ZSA9PT0gTEVBUk5fTU9SRV9WQUxVRSkge1xuXHRcdFx0XHRcdGlmIChwZXJtaXNzaW9uc0xlYXJuTW9yZVVybCkge1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHBlcm1pc3Npb25zTGVhcm5Nb3JlVXJsKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR2b2lkIHRoaXMuX2NvbmZpcm1BbmRTZXRWYWx1ZShjdHguYmFja2VuZFNlc3Npb24sIGl0ZW0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRmlsdGVyOiBjdHguc2NoZW1hLmVudW1EeW5hbWljXG5cdFx0XHRcdD8gcXVlcnkgPT4gdGhpcy5fZmlsdGVyRGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCByZWZyZXNoZWQgPSB0aGlzLl9yZWFkQ29udGV4dCgpO1xuXHRcdFx0XHRcdGlmICghcmVmcmVzaGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0b0FjdGlvbkl0ZW1zKHRoaXMuX3Byb3BlcnR5LCBhd2FpdCB0aGlzLl9nZXRJdGVtcyhyZWZyZXNoZWQuc2NoZW1hLCBxdWVyeSksIHJlZnJlc2hlZC52YWx1ZSwgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpLCB0aGlzLl9nZXRTYW5kYm94SW5saW5lVG9nZ2xlKCkpO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdG9uSGlkZTogKCkgPT4gdHJpZ2dlci5mb2N1cygpLFxuXHRcdH07XG5cblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3c8SUNvbmZpZ1BpY2tlckl0ZW0+KFxuXHRcdFx0YGFnZW50SG9zdENoYXRJbnB1dFBpY2tlci4ke3RoaXMuX3Byb3BlcnR5fWAsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGFjdGlvbkl0ZW1zLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHR0cmlnZ2VyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHR7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogaXRlbSA9PiBpdGVtLmxhYmVsID8/ICcnLFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYXJpYUxhYmVsJywgXCJ7MH0gUGlja2VyXCIsIGN0eC5zY2hlbWEudGl0bGUpLFxuXHRcdFx0fSxcblx0XHRcdHdpdGhDaGF0SW5wdXRQaWNrZXJNb3Rpb24oe1xuXHRcdFx0XHQuLi5nZXRDb25maWdQaWNrZXJMaXN0T3B0aW9ucyh0aGlzLl9wcm9wZXJ0eSksXG5cdFx0XHRcdC4uLihhY3Rpb25JdGVtcy5sZW5ndGggPiBGSUxURVJfVEhSRVNIT0xEIHx8IGN0eC5zY2hlbWEuZW51bUR5bmFtaWNcblx0XHRcdFx0XHQ/IHsgc2hvd0ZpbHRlcjogdHJ1ZSwgZmlsdGVyUGxhY2Vob2xkZXI6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuZmlsdGVyJywgXCJGaWx0ZXIuLi5cIikgfVxuXHRcdFx0XHRcdDoge30pLFxuXHRcdFx0fSksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNhbmRib3hTZXR0aW5nSWQoKTogUmV0dXJuVHlwZTx0eXBlb2YgZ2V0QWdlbnRIb3N0U2FuZGJveFNldHRpbmdJZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHNlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkKSA9PT0gdHJ1ZTtcblx0XHRyZXR1cm4gZ2V0QWdlbnRIb3N0U2FuZGJveFNldHRpbmdJZChzZXNzaW9uVHlwZSwgY3VzdG9tVGVybWluYWxUb29sRW5hYmxlZCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NhbmRib3hUb2dnbGVTZXR0aW5nRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uUGVybWlzc2lvbnNTYW5kYm94VG9nZ2xlRW5hYmxlZCkgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NhbmRib3hpbmdFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNldHRpbmdJZCA9IHRoaXMuX2dldFNhbmRib3hTZXR0aW5nSWQoKTtcblx0XHRyZXR1cm4gc2V0dGluZ0lkICE9PSB1bmRlZmluZWQgJiYgaXNBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8QWdlbnRTYW5kYm94RW5hYmxlZFNldHRpbmdWYWx1ZT4oc2V0dGluZ0lkKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTYW5kYm94SW5saW5lVG9nZ2xlKCk6IElBY3Rpb25MaXN0SXRlbUlubGluZVRvZ2dsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2V0dGluZ0lkID0gdGhpcy5fZ2V0U2FuZGJveFNldHRpbmdJZCgpO1xuXHRcdGlmICh0aGlzLl9wcm9wZXJ0eSAhPT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSB8fCAhdGhpcy5faXNTYW5kYm94VG9nZ2xlU2V0dGluZ0VuYWJsZWQoKSB8fCAhc2V0dGluZ0lkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuZGVmYXVsdFNhbmRib3hUb2dnbGUnLCBcIlNhbmRib3hpbmcgZm9yIHRlcm1pbmFsXCIpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuZGVmYXVsdFNhbmRib3hUb2dnbGVUaXRsZScsIFwiUnVuIHRlcm1pbmFsIGNvbW1hbmRzIGluc2lkZSBhIHNhbmRib3ggdGhhdCByZXN0cmljdHMgZmlsZSBzeXN0ZW0gYW5kIG5ldHdvcmsgYWNjZXNzXCIpLFxuXHRcdFx0Y2hlY2tlZDogdGhpcy5faXNTYW5kYm94aW5nRW5hYmxlZCgpLFxuXHRcdFx0b25DaGFuZ2U6IGNoZWNrZWQgPT4ge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBjaGVja2VkID8gQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIDogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZjtcblx0XHRcdFx0dm9pZCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShzZXR0aW5nSWQsIHRhcmdldCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRJdGVtcyhzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgcXVlcnk/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10+IHtcblx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0eyB2YWx1ZTogJ3RydWUnLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5ib29sZWFuLnRydWUnLCBcIk9uXCIpIH0sXG5cdFx0XHRcdHsgdmFsdWU6ICdmYWxzZScsIGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmJvb2xlYW4uZmFsc2UnLCBcIk9mZlwiKSB9LFxuXHRcdFx0XTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gdGhpcy5fc3ViUmVmLnZhbHVlPy5iYWNrZW5kU2Vzc2lvblxuXHRcdFx0Pz8gKHNlc3Npb25SZXNvdXJjZSA/IHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKHNjaGVtYS5lbnVtRHluYW1pYyAmJiBiYWNrZW5kU2Vzc2lvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5zZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMoe1xuXHRcdFx0XHRcdHByb3ZpZGVyOiBiYWNrZW5kU2Vzc2lvbi5zY2hlbWUsXG5cdFx0XHRcdFx0cHJvcGVydHk6IHRoaXMuX3Byb3BlcnR5LFxuXHRcdFx0XHRcdHF1ZXJ5LFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMuX3JlYWRXb3JraW5nRGlyZWN0b3J5KCksXG5cdFx0XHRcdFx0Y29uZmlnOiB0aGlzLl9yZWFkQ3VycmVudFZhbHVlcygpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2ZpbHRlckF1dG9BcHByb3ZlSXRlbXMocmVzdWx0Lml0ZW1zLm1hcChpdGVtID0+IHRoaXMuX2Zyb21Db21wbGV0aW9uKGl0ZW0pKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gRmFsbCB0aHJvdWdoIHRvIHRoZSBzdGF0aWMgZW51bSBiZWxvdy5cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbHRlckF1dG9BcHByb3ZlSXRlbXMoKHNjaGVtYS5lbnVtID8/IFtdKS5tYXAoKHZhbHVlLCBpbmRleCkgPT4gKHtcblx0XHRcdHZhbHVlOiBTdHJpbmcodmFsdWUpLFxuXHRcdFx0bGFiZWw6IHNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IFN0cmluZyh2YWx1ZSksXG5cdFx0XHRkZXNjcmlwdGlvbjogc2NoZW1hLmVudW1EZXNjcmlwdGlvbnM/LltpbmRleF0sXG5cdFx0fSkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbHRlckF1dG9BcHByb3ZlSXRlbXMoaXRlbXM6IHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10pOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdIHtcblx0XHRpZiAodGhpcy5fcHJvcGVydHkgIT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRcdHJldHVybiBpdGVtcztcblx0XHR9XG5cdFx0Y29uc3QgYXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQgPSBpc0Fzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXNQZXJtaXNzaW9uTGV2ZWxWaXNpYmxlKGl0ZW0udmFsdWUsIGFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkKSk7XG5cdH1cblxuXHRwcml2YXRlIF9mcm9tQ29tcGxldGlvbihpdGVtOiBTZXNzaW9uQ29uZmlnVmFsdWVJdGVtKTogSUNvbmZpZ1BpY2tlckl0ZW0ge1xuXHRcdHJldHVybiB7IHZhbHVlOiBpdGVtLnZhbHVlLCBsYWJlbDogaXRlbS5sYWJlbCwgZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRXb3JraW5nRGlyZWN0b3J5KCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdWJSZWYudmFsdWU/LnN1Yi52YWx1ZTtcblx0XHRpZiAoc3RhdGUgJiYgIShzdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0Y29uc3QgY3dkID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0XHRyZXR1cm4gdHlwZW9mIGN3ZCA9PT0gJ3N0cmluZycgPyBVUkkucGFyc2UoY3dkKSA6IGN3ZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdHJldHVybiAoc2Vzc2lvblJlc291cmNlICYmIHRoaXMuX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmdldEZvbGRlcihzZXNzaW9uUmVzb3VyY2UpKVxuXHRcdFx0Pz8gKHNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl93b3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIucmVzb2x2ZShzZXNzaW9uUmVzb3VyY2UpKVxuXHRcdFx0Pz8gdGhpcy5fbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuZ2V0RGVmYXVsdEZvbGRlcigpXG5cdFx0XHQ/PyB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdPy51cmk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ3VycmVudFZhbHVlcygpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IG92ZXJsYXkgPSBzZXNzaW9uUmVzb3VyY2UgPyB0aGlzLl9wcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyhzZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3ViUmVmLnZhbHVlPy5zdWIudmFsdWU7XG5cdFx0aWYgKHN0YXRlICYmICEoc3RhdGUgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdHJldHVybiB7IC4uLihzdGF0ZS5jb25maWc/LnZhbHVlcyA/PyB7fSksIC4uLihvdmVybGF5Py52YWx1ZXMgPz8ge30pIH07XG5cdFx0fVxuXHRcdHJldHVybiBvdmVybGF5Py52YWx1ZXMgPz8gdGhpcy5faW5pdGlhbFJlc29sdmVkPy5yZXN1bHQudmFsdWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN1cmZhY2VzIHRoZSBzaGFyZWQgZWxldmF0ZWQtbGV2ZWwgd2FybmluZyBiZWZvcmUgYXBwbHlpbmcgYW4gYXBwcm92YWxcblx0ICogcGljay4gVW5rbm93biBub24tZGVmYXVsdCB2YWx1ZXMgZmFsbCBiYWNrIHRvIHRoZSBCeXBhc3Mgd2FybmluZy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpcm1BbmRTZXRWYWx1ZShiYWNrZW5kU2Vzc2lvbjogVVJJLCBpdGVtOiBJQ29uZmlnUGlja2VySXRlbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZhbHVlID0gaXRlbS52YWx1ZTtcblx0XHRpZiAodGhpcy5fcHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUgJiYgIWlzUGVybWlzc2lvbkxldmVsVmlzaWJsZSh2YWx1ZSwgaXNBc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9wcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkge1xuXHRcdFx0Y29uc3QgbGV2ZWxUb0NvbmZpcm0gPSBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwodmFsdWUpXG5cdFx0XHRcdD8gdmFsdWVcblx0XHRcdFx0OiAodmFsdWUgIT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCA/IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUgOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGxldmVsVG9Db25maXJtKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IG1heWJlQ29uZmlybUVsZXZhdGVkUGVybWlzc2lvbkxldmVsKGxldmVsVG9Db25maXJtLCB0aGlzLl9kaWFsb2dTZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSwge1xuXHRcdFx0XHRcdGRlZmF1bHRTZXR0aW5nS2V5OiBDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbixcblx0XHRcdFx0XHRsZXZlbExhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fc2V0VmFsdWUoYmFja2VuZFNlc3Npb24sIHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NldFZhbHVlKGJhY2tlbmRTZXNzaW9uOiBVUkksIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdHggPSB0aGlzLl9yZWFkQ29udGV4dCgpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRWYWx1ZSA9IGN0eD8uc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJ1xuXHRcdFx0PyB2YWx1ZSA9PT0gJ3RydWUnXG5cdFx0XHQ6IG5vcm1hbGl6ZVNlc3Npb25Db25maWdWYWx1ZSh0aGlzLl9wcm9wZXJ0eSwgdmFsdWUsIGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcGFydGlhbCA9IHsgW3RoaXMuX3Byb3BlcnR5XTogbm9ybWFsaXplZFZhbHVlIH07XG5cdFx0Y29uc3QgbmV4dENvbmZpZyA9IHsgLi4uKHRoaXMuX3JlYWRDdXJyZW50VmFsdWVzKCkgPz8ge30pLCAuLi5wYXJ0aWFsIH07XG5cblx0XHRpZiAoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdC8vIFJvdXRlIHRocm91Z2ggdGhlIHByb3Zpc2lvbmFsIHNlcnZpY2Ugc28gdGhlIHdvcmtiZW5jaC1vd25lZFxuXHRcdFx0Ly8gY29uZmlnIGNhY2hlIGlzIHVwZGF0ZWQgc3luY2hyb25vdXNseS4gYHRyeVJlYmluZGAgcmVhZHMgZnJvbVxuXHRcdFx0Ly8gdGhhdCBjYWNoZSwgc28gYSBTZW5kIHJhY2luZyB3aXRoIHRoaXMgZGlzcGF0Y2ggcGlja3MgdXAgdGhlXG5cdFx0XHQvLyBuZXcgdmFsdWUgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgYWdlbnQgdG8gZWNobyBpdCBiYWNrLlxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBiYWNrZW5kU2Vzc2lvbi5zY2hlbWU7XG5cdFx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5fcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UoXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdHRoaXMuX3JlYWRXb3JraW5nRGlyZWN0b3J5KCksXG5cdFx0XHRcdHBhcnRpYWwsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFjcmVhdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fc3ViUmVmLnZhbHVlIHx8IHRoaXMuX3N1YlJlZi52YWx1ZS5iYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpICE9PSBjcmVhdGVkLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fcmVhdHRhY2goKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BlcnNpc3RDb2RleFBlcm1pc3Npb25zRGVmYXVsdChub3JtYWxpemVkVmFsdWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2goYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogcGFydGlhbCxcblx0XHR9KTtcblx0XHR2b2lkIHRoaXMuX3Byb3Zpc2lvbmFsLnJlZnJlc2hSZXNvbHZlZENvbmZpZyhcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGJhY2tlbmRTZXNzaW9uLnNjaGVtZSxcblx0XHRcdHRoaXMuX3JlYWRXb3JraW5nRGlyZWN0b3J5KCksXG5cdFx0XHRuZXh0Q29uZmlnLFxuXHRcdCk7XG5cdFx0dGhpcy5fcGVyc2lzdENvZGV4UGVybWlzc2lvbnNEZWZhdWx0KG5vcm1hbGl6ZWRWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0Q29kZXhQZXJtaXNzaW9uc0RlZmF1bHQodmFsdWU6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHJvcGVydHkgIT09IENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldCB8fCB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2goUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldF06IHZhbHVlIH0sXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoYWN0aW9uOiBJQWN0aW9uLCBwcml2YXRlIHJlYWRvbmx5IF9waWNrZXI6IEFnZW50SG9zdENoYXRJbnB1dFBpY2tlcikge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9waWNrZXIpO1xuXHR9XG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcGlja2VyLnJlbmRlcihjb250YWluZXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUE2QiwwQkFBNkY7QUFDMUgsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxxQ0FBcUMsNENBQTRDLHlCQUF5QjtBQUNuSCxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLDJCQUEyQix3QkFBd0I7QUFDNUQsU0FBUyw4QkFBOEI7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
