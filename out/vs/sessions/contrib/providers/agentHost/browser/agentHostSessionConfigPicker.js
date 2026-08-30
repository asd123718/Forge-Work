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
import "./media/agentHostSessionConfigPicker.css";
import * as dom from "../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Checkbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable } from "../../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { defaultCheckboxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { ChatConfiguration, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js";
import { ChatContextKeyExprs, ChatContextKeys } from "../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { markOnboardingTarget } from "../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { Menus } from "../../../../browser/menus.js";
import { SessionProviderIdContext, IsPhoneLayoutContext, IsQuickChatSessionContext } from "../../../../common/contextkeys.js";
import { IWorkbenchLayoutService } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { reportNewChatPickerClosed } from "../../../chat/browser/newChatPickerTelemetry.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionContext } from "../../../../services/sessions/browser/sessionContext.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from "../../../../common/agentHostSessionsProvider.js";
import { MobilePermissionPicker } from "../../copilotChatSessions/browser/mobilePermissionPicker.js";
import { isPhoneLayout } from "../../../../browser/parts/mobile/mobileLayout.js";
import { showMobilePickerSheet } from "../../../../browser/parts/mobile/mobilePickerSheet.js";
import { AgentHostModePicker } from "./agentHostModePicker.js";
import { MobileAgentHostModePicker } from "./mobile/mobileAgentHostModePicker.js";
import { AgentHostPermissionPickerActionItem } from "./agentHostPermissionPickerActionItem.js";
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownCodexApprovalsSchema, isWellKnownModeSchema } from "./agentHostPermissionPickerDelegate.js";
import { SessionConfigKey } from "../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { AgentHostClaudePermissionModePicker } from "./agentHostClaudePermissionModePicker.js";
import { ClaudeSessionConfigKey } from "../../../../../platform/agentHost/common/claudeSessionConfigKeys.js";
import { AgentHostCodexApprovalsPicker } from "./agentHostCodexApprovalsPicker.js";
import { isAutoApproveValuePolicyRestricted } from "../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js";
import { CodexSessionConfigKey } from "../../../../../platform/agentHost/common/codexSessionConfigKeys.js";
const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(SessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE);
const IsActiveSessionLocalAgentHost = ContextKeyExpr.equals(SessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID);
function showActiveSessionModePicker(accessor) {
  const activeElement = dom.getActiveElement();
  const anchor = dom.isHTMLElement(activeElement) ? activeElement : dom.getActiveDocument().body;
  const picker = accessor.get(IInstantiationService).createInstance(
    isPhoneLayout(accessor.get(IWorkbenchLayoutService)) ? MobileAgentHostModePicker : AgentHostModePicker,
    accessor.get(ISessionsService).activeSession
  );
  if (!picker.showPicker(anchor, () => picker.dispose())) {
    picker.dispose();
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "sessions.agentHost.sessionConfigPicker",
      title: localize2("agentHostSessionConfigPicker", "Session Configuration"),
      f1: false,
      menu: [{
        id: Menus.NewSessionRepositoryConfig,
        group: "navigation",
        order: 3,
        when: ContextKeyExpr.and(
          ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
          IsQuickChatSessionContext.negate()
        )
      }]
    });
  }
  async run() {
  }
});
function getConfigIcon(property, value) {
  if (property === SessionConfigKey.Isolation) {
    if (value === "folder") {
      return Codicon.folder;
    }
    if (value === "worktree") {
      return Codicon.worktree;
    }
  }
  if (property === SessionConfigKey.Branch) {
    return Codicon.gitBranch;
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
  return void 0;
}
function toActionItems(property, items, currentValue, policyRestricted) {
  return items.map((item) => {
    const disabled = property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(item.value, policyRestricted === true);
    return {
      kind: ActionListItemKind.Action,
      label: item.label,
      detail: disabled ? localize("agentHostSessionConfig.policyDisabled", "Disabled by your organization. Contact your administrator.") : item.description,
      group: { title: "", icon: getConfigIcon(property, item.value) },
      disabled,
      item: { ...item, checked: isSelectedValue(currentValue, item.value) }
    };
  });
}
function isSelectedValue(currentValue, itemValue) {
  if (typeof currentValue === "boolean") {
    return currentValue === (itemValue === "true");
  }
  return itemValue === currentValue;
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
function applyAutoApproveFiltering(items, property, configurationService) {
  if (property !== SessionConfigKey.AutoApprove) {
    return { items, policyRestricted: false };
  }
  const policyRestricted = configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
  return { items, policyRestricted };
}
async function confirmAutoApproveLevel(value, label, dialogService, storageService) {
  if (!isChatPermissionLevel(value)) {
    return true;
  }
  return maybeConfirmElevatedPermissionLevel(value, dialogService, storageService, { defaultSettingKey: ChatConfiguration.DefaultConfiguration, levelLabel: label });
}
function applyAutoApproveTriggerStyles(trigger, property, value) {
  if (property === SessionConfigKey.AutoApprove) {
    trigger.classList.toggle("warning", value === "autopilot" || value === "assisted");
    trigger.classList.toggle("info", value === "autoApprove");
  }
}
class IsolationCheckboxControl extends Disposable {
  constructor(sessionId, label, _hoverService, onToggle) {
    super();
    this.sessionId = sessionId;
    this._hoverService = _hoverService;
    this.slot = dom.$(".sessions-chat-picker-slot.sessions-chat-isolation-checkbox");
    this._hover = this._register(new MutableDisposable());
    this._enabled = true;
    this._row = dom.append(this.slot, dom.$(".action-label"));
    this.checkbox = this._register(new Checkbox(label, false, { ...defaultCheckboxStyles, size: 14 }));
    dom.append(this._row, this.checkbox.domNode);
    const labelSpan = dom.append(this._row, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = label;
    this._register(markOnboardingTarget(this.slot, "sessions.newSession.isolation"));
    this._register(this.checkbox.onChange(() => onToggle(this.checkbox.checked)));
    this._register(Gesture.addTarget(this._row));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(this._row, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        if (!this._enabled) {
          return;
        }
        this.checkbox.checked = !this.checkbox.checked;
        onToggle(this.checkbox.checked);
      }));
    }
  }
  update(checked, readOnly, resolving, tooltip) {
    this._enabled = !readOnly && !resolving;
    this.checkbox.checked = checked;
    if (readOnly) {
      this.checkbox.disable();
    } else {
      this.checkbox.enable();
      this.checkbox.domNode.setAttribute("aria-disabled", resolving ? "true" : "false");
    }
    this.slot.classList.toggle("disabled", readOnly);
    this.slot.classList.toggle("resolving", !readOnly && resolving);
    if (this._tooltip !== tooltip) {
      this._tooltip = tooltip;
      this._hover.value = tooltip ? this._hoverService.setupDelayedHover(this._row, { content: tooltip }) : void 0;
    }
  }
  dispose() {
    this.slot.remove();
    super.dispose();
  }
}
let AgentHostSessionConfigPicker = class extends Disposable {
  constructor(_session, _actionWidgetService, _configurationService, _contextKeyService, _dialogService, _hoverService, _sessionsProvidersService, _telemetryService, _layoutService, _storageService) {
    super();
    this._session = _session;
    this._actionWidgetService = _actionWidgetService;
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._dialogService = _dialogService;
    this._hoverService = _hoverService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._telemetryService = _telemetryService;
    this._layoutService = _layoutService;
    this._storageService = _storageService;
    this._renderDisposables = this._register(new DisposableStore());
    this._providerListeners = this._register(new DisposableMap());
    this._isolationCheckbox = this._register(new MutableDisposable());
    this._filterDelayer = this._register(new Delayer(200));
    /**
     * Session/property-scoped value→label cache for `enumDynamic`
     * properties (e.g. branch), populated whenever `_getItems` fetches
     * completions. `enumDynamic` completions are transient protocol
     * data — only `value` is persisted via `setSessionConfigValue`/
     * `resolveSessionConfig` — so this is the only place a completion's
     * `label` for a previously-picked value can be recovered once the
     * dropdown/sheet closes. Static `enum` properties don't need this:
     * their label is always derivable from `schema.enum`/`enumLabels`.
     *
     * Keyed by session so entries don't leak across sessions: this picker
     * is only ever created for the new-session composer (`Menus.NewSession-
     * RepositoryConfig`), and that composer's `_session` tracks the
     * globally active session — so the *same* picker instance can observe
     * a sequence of different (not-yet-created) draft sessions as the user
     * switches between them. `_renderConfigPickers` evicts entries for any
     * session other than the current one on every render, so the map never
     * grows beyond the properties of the currently active session.
     */
    this._dynamicValueLabels = /* @__PURE__ */ new Map();
    this._register(autorun((reader) => {
      this._session.read(reader);
      this._renderConfigPickers();
    }));
    this._register(this._sessionsProvidersService.onDidChangeProviders((e) => {
      for (const provider of e.removed) {
        this._providerListeners.deleteAndDispose(provider.id);
      }
      this._watchProviders(e.added);
      this._renderConfigPickers();
    }));
    this._watchProviders(this._sessionsProvidersService.getProviders());
    this._register(this._contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([IsPhoneLayoutContext.key]))) {
        this._renderConfigPickers();
      }
    }));
  }
  _watchProviders(providers) {
    for (const provider of providers) {
      if (!isAgentHostProvider(provider) || this._providerListeners.has(provider.id)) {
        continue;
      }
      this._providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._renderConfigPickers()));
    }
  }
  render(container) {
    this._isolationCheckbox.clear();
    this._container = dom.append(container, dom.$(".sessions-chat-agent-host-config"));
    this._renderConfigPickers();
  }
  _renderConfigPickers() {
    if (!this._container) {
      return;
    }
    this._renderDisposables.clear();
    const isolationSlot = this._isolationCheckbox.value?.slot;
    for (const child of Array.from(this._container.children)) {
      if (child !== isolationSlot) {
        child.remove();
      }
    }
    const session = this._session.get();
    this._evictDynamicValueLabelsForOtherSessions(session?.sessionId);
    const provider = session ? this._getProvider(session.providerId) : void 0;
    const resolvedConfig = session && provider?.getSessionConfig(session.sessionId);
    if (!session || !provider || !resolvedConfig) {
      this._isolationCheckbox.clear();
      return;
    }
    const isNewSession = provider.getCreateSessionConfig(session.sessionId) !== void 0;
    const isLoading = provider.isSessionConfigResolving(session.sessionId).get();
    const properties = this._orderProperties(Object.entries(resolvedConfig.schema.properties));
    let renderedIsolationCheckbox = false;
    for (const [property, schema] of properties) {
      if (!this._isPickable(schema)) {
        continue;
      }
      if (property === SessionConfigKey.WorktreeBranchTrack) {
        continue;
      }
      if (property === SessionConfigKey.Isolation && !schema.enum?.includes("worktree")) {
        continue;
      }
      if (!this._shouldRenderProperty(property, schema, isNewSession)) {
        continue;
      }
      if (property === SessionConfigKey.AutoApprove && isWellKnownAutoApproveSchema(schema)) {
        continue;
      }
      if (property === SessionConfigKey.Mode && isWellKnownModeSchema(schema)) {
        continue;
      }
      if (property === ClaudeSessionConfigKey.PermissionMode && isWellKnownClaudePermissionModeSchema(schema)) {
        continue;
      }
      if (property === CodexSessionConfigKey.PermissionsPreset && isWellKnownCodexApprovalsSchema(schema)) {
        continue;
      }
      const value = resolvedConfig.values[property] ?? schema.default;
      const isReadOnly = this._isReadOnlyChip(property, schema, isNewSession);
      if (property === SessionConfigKey.Isolation && this._shouldRenderIsolationAsCheckbox(schema)) {
        this._renderIsolationCheckbox(session.sessionId, schema, value, isReadOnly, !isReadOnly && isLoading);
        renderedIsolationCheckbox = true;
        continue;
      }
      const slot = dom.append(this._container, dom.$(".sessions-chat-picker-slot"));
      if (property === SessionConfigKey.Isolation) {
        this._renderDisposables.add(markOnboardingTarget(slot, "sessions.newSession.isolation"));
      }
      const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
      const tooltip = property === SessionConfigKey.Branch && isReadOnly ? void 0 : schema.description ?? schema.title;
      if (tooltip) {
        this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, { content: tooltip }));
      }
      if (!isReadOnly && isLoading) {
        slot.classList.add("resolving");
        trigger.setAttribute("aria-disabled", "true");
      }
      this._renderTrigger(trigger, session.sessionId, property, schema, value, isReadOnly);
    }
    if (!renderedIsolationCheckbox) {
      this._isolationCheckbox.clear();
    }
  }
  _isPickable(schema) {
    if (schema.type === "boolean") {
      return true;
    }
    if (schema.type !== "string") {
      return false;
    }
    return !!schema.enumDynamic || Array.isArray(schema.enum) && schema.enum.length > 0;
  }
  /**
   * Order the schema properties for rendering. The base implementation
   * enforces a stable visual sequence for well-known properties:
   * Isolation (worktree/folder) first, then Branch. Any other properties
   * keep their original schema order after these two. Subclasses can
   * override to impose a different deterministic visual sequence
   * (e.g. the mobile chip row groups Approvals | Branch | Worktree).
   */
  _orderProperties(properties) {
    const order = /* @__PURE__ */ new Map([
      [SessionConfigKey.Isolation, 0],
      [SessionConfigKey.Branch, 1]
    ]);
    return properties.map(([key, schema], index) => ({ key, schema, index })).sort((a, b) => {
      const aRank = order.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const bRank = order.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.index - b.index;
    }).map(({ key, schema }) => [key, schema]);
  }
  /**
   * Decide whether a property's chip should be rendered for the current
   * session. The base implementation hides non-mutable properties in
   * running sessions (they would render as dead pills). Subclasses can
   * override to keep specific properties visible as readonly chips —
   * see {@link _isReadOnlyChip}.
   */
  _shouldRenderProperty(property, schema, isNewSession) {
    return isNewSession || !!schema.sessionMutable;
  }
  /**
   * Decide whether a property's trigger should render as readonly
   * (no chevron, no popup). The base implementation defers to the
   * schema's `readOnly` flag. Subclasses that opt in to rendering
   * non-mutable chips via {@link _shouldRenderProperty} should
   * override this to also mark them readonly at runtime.
   */
  _isReadOnlyChip(property, schema, isNewSession) {
    return !!schema.readOnly;
  }
  _renderTrigger(trigger, sessionId, property, schema, value, isReadOnly) {
    dom.clearNode(trigger);
    const icon = getConfigIcon(property, value);
    if (icon) {
      dom.append(trigger, renderIcon(icon));
    }
    const labelSpan = dom.append(trigger, dom.$("span.sessions-chat-dropdown-label"));
    const label = this._getLabel(sessionId, property, schema, value);
    labelSpan.textContent = label;
    trigger.setAttribute("aria-label", isReadOnly ? localize("agentHostSessionConfig.triggerAriaReadOnly", "{0}: {1}, Read-Only", schema.title, label) : localize("agentHostSessionConfig.triggerAria", "{0}: {1}", schema.title, label));
    applyAutoApproveTriggerStyles(trigger, property, value);
  }
  /**
   * Whether the isolation property should render as a checkbox
   * (Worktree on/off) rather than a dropdown. Only on non-phone
   * layouts and only when the schema offers both folder and worktree.
   */
  _shouldRenderIsolationAsCheckbox(schema) {
    return !isPhoneLayout(this._layoutService) && Array.isArray(schema.enum) && schema.enum.includes("worktree") && schema.enum.includes("folder");
  }
  _renderIsolationCheckbox(sessionId, schema, value, isReadOnly, isLoading) {
    const label = localize("agentHostSessionConfig.isolation.worktree", "New Worktree");
    const worktreeIndex = schema.enum?.indexOf("worktree") ?? -1;
    const tooltip = (worktreeIndex >= 0 ? schema.enumDescriptions?.[worktreeIndex] : void 0) ?? schema.description ?? schema.title;
    let control = this._isolationCheckbox.value;
    if (!control || control.sessionId !== sessionId) {
      control = new IsolationCheckboxControl(sessionId, label, this._hoverService, (checked) => this._applyIsolationValue(sessionId, checked));
      this._isolationCheckbox.value = control;
      this._container?.prepend(control.slot);
    }
    control.update(value === "worktree", isReadOnly, isLoading, tooltip);
  }
  _applyIsolationValue(sessionId, checked) {
    const session = this._session.get();
    if (!session || session.sessionId !== sessionId) {
      return;
    }
    const provider = this._getProvider(session.providerId);
    const resolvedConfig = provider?.getSessionConfig(sessionId);
    const schema = resolvedConfig?.schema.properties[SessionConfigKey.Isolation];
    if (!provider || !schema) {
      return;
    }
    const before = resolvedConfig.values[SessionConfigKey.Isolation] ?? schema.default;
    const nextValue = checked ? "worktree" : "folder";
    reportNewChatPickerClosed(this._telemetryService, {
      id: "NewChatAgentHostSessionConfigPicker",
      name: `NewChatAgentHostSessionConfigPicker.${SessionConfigKey.Isolation}`,
      optionIdBefore: typeof before === "string" ? before : void 0,
      optionIdAfter: nextValue,
      optionLabelBefore: typeof before === "string" ? this._getLabel(sessionId, SessionConfigKey.Isolation, schema, before) : void 0,
      optionLabelAfter: this._getLabel(sessionId, SessionConfigKey.Isolation, schema, nextValue),
      isPII: false
    });
    provider.setSessionConfigValue(sessionId, SessionConfigKey.Isolation, nextValue).catch(() => {
    });
  }
  async _showPicker(provider, sessionId, property, schema, trigger) {
    if (schema.readOnly || this._actionWidgetService.isVisible) {
      return;
    }
    if (provider.isSessionConfigResolving(sessionId).get()) {
      return;
    }
    const rawItems = await this._getItems(provider, sessionId, property, schema);
    const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, property, this._configurationService);
    if (items.length === 0) {
      return;
    }
    const isAutoApproveProperty = property === SessionConfigKey.AutoApprove;
    const currentValue = provider.getSessionConfig(sessionId)?.values[property] ?? schema.default;
    const currentItem = items.find((i) => isSelectedValue(currentValue, i.value));
    const actionItems = toActionItems(property, items, currentValue, policyRestricted);
    const delegate = {
      onSelect: async (item) => {
        this._actionWidgetService.hide();
        reportNewChatPickerClosed(this._telemetryService, {
          id: "NewChatAgentHostSessionConfigPicker",
          name: `NewChatAgentHostSessionConfigPicker.${property}`,
          optionIdBefore: typeof currentValue === "string" ? currentValue : void 0,
          optionIdAfter: item.value,
          optionLabelBefore: currentItem?.label,
          optionLabelAfter: item.label,
          isPII: !!schema.enumDynamic
        });
        if (isAutoApproveProperty && item.value !== "default") {
          const confirmed = await confirmAutoApproveLevel(item.value, item.label, this._dialogService, this._storageService);
          if (!confirmed) {
            return;
          }
        }
        const nextValue = schema.type === "boolean" ? item.value === "true" : item.value;
        provider.setSessionConfigValue(sessionId, property, nextValue).catch(() => {
        });
      },
      onFilter: schema.enumDynamic ? (query) => this._filterDelayer.trigger(async () => {
        const filteredRawItems = await this._getItems(provider, sessionId, property, schema, query);
        const { items: filteredItems, policyRestricted: filteredPolicyRestricted } = applyAutoApproveFiltering(filteredRawItems, property, this._configurationService);
        return toActionItems(property, filteredItems, provider.getSessionConfig(sessionId)?.values[property] ?? schema.default, filteredPolicyRestricted);
      }) : void 0,
      onHide: () => trigger.focus()
    };
    this._actionWidgetService.show(
      `agentHostSessionConfig.${property}`,
      false,
      actionItems,
      delegate,
      trigger,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("agentHostSessionConfig.ariaLabel", "{0} Picker", schema.title)
      },
      actionItems.length > 10 ? { showFilter: true, filterPlaceholder: localize("agentHostSessionConfig.filter", "Filter options..."), minWidth: 255 } : { minWidth: 255 }
    );
  }
  async _getItems(provider, sessionId, property, schema, query) {
    if (schema.type === "boolean") {
      return [
        { value: "true", label: localize("agentHostSessionConfig.boolean.true", "On") },
        { value: "false", label: localize("agentHostSessionConfig.boolean.false", "Off") }
      ];
    }
    const dynamicItems = schema.enumDynamic ? await provider.getSessionConfigCompletions(sessionId, property, query) : void 0;
    if (dynamicItems?.length) {
      const items = dynamicItems.map((item) => this._fromCompletionItem(item));
      this._cacheDynamicValueLabels(sessionId, property, items);
      return items;
    }
    return (schema.enum ?? []).map((value, index) => ({
      value: String(value),
      label: schema.enumLabels?.[index] ?? String(value),
      description: schema.enumDescriptions?.[index]
    }));
  }
  _fromCompletionItem(item) {
    return {
      value: item.value,
      label: item.label,
      description: item.description
    };
  }
  _dynamicValueLabelsKey(sessionId, property) {
    return `${sessionId}\0${property}`;
  }
  _cacheDynamicValueLabels(sessionId, property, items) {
    const key = this._dynamicValueLabelsKey(sessionId, property);
    let labels = this._dynamicValueLabels.get(key);
    if (!labels) {
      labels = /* @__PURE__ */ new Map();
      this._dynamicValueLabels.set(key, labels);
    }
    for (const item of items) {
      labels.set(item.value, item.label);
    }
  }
  /**
   * Drops cached labels for any session other than `sessionId`. Called on
   * every render so the cache tracks whichever session the picker is
   * currently bound to, instead of accumulating entries for every draft
   * session this (potentially long-lived) picker instance has ever shown.
   */
  _evictDynamicValueLabelsForOtherSessions(sessionId) {
    if (!sessionId) {
      return;
    }
    const prefix = `${sessionId}\0`;
    for (const key of this._dynamicValueLabels.keys()) {
      if (!key.startsWith(prefix)) {
        this._dynamicValueLabels.delete(key);
      }
    }
  }
  _getLabel(sessionId, property, schema, value) {
    if (schema.type === "boolean") {
      return value === true ? localize("agentHostSessionConfig.boolean.onLabel", "On") : localize("agentHostSessionConfig.boolean.offLabel", "Off");
    }
    if (typeof value === "string") {
      if (schema.enumDynamic) {
        const key = this._dynamicValueLabelsKey(sessionId, property);
        const dynamicLabel = this._dynamicValueLabels.get(key)?.get(value);
        if (dynamicLabel) {
          return dynamicLabel;
        }
      }
      const index = schema.enum?.indexOf(value) ?? -1;
      return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
    }
    return schema.title;
  }
  _getProvider(providerId) {
    const provider = this._sessionsProvidersService.getProvider(providerId);
    return provider && isAgentHostProvider(provider) ? provider : void 0;
  }
};
AgentHostSessionConfigPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ISessionsProvidersService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IStorageService)
], AgentHostSessionConfigPicker);
class MobileAgentHostSessionConfigPicker extends AgentHostSessionConfigPicker {
  /**
   * On phone the chip lane has a fixed visual sequence — Default
   * Approvals (rendered by a separate left-side picker), then Branch,
   * then Worktree. Sort the known repo-config properties to that
   * order; unknown properties fall through to schema-declared order
   * after the known ones.
   *
   * On desktop viewports this subclass is also instantiated (see the
   * factory in `AgentHostSessionConfigPickersContribution` — it always
   * picks the mobile-aware subclass so `_showPicker` can route to the
   * bottom sheet on phones), so we must defer to the base ordering
   * (Isolation first, Branch second) when not on a phone layout.
   */
  _orderProperties(properties) {
    if (!isPhoneLayout(this._layoutService)) {
      return super._orderProperties(properties);
    }
    const order = /* @__PURE__ */ new Map([
      [SessionConfigKey.Branch, 0],
      [SessionConfigKey.Isolation, 1]
    ]);
    return properties.slice().sort(([aKey], [bKey]) => {
      const a = order.get(aKey) ?? Number.MAX_SAFE_INTEGER;
      const b = order.get(bKey) ?? Number.MAX_SAFE_INTEGER;
      return a - b;
    });
  }
  /**
   * Keep Branch and Isolation visible in running sessions even when
   * the schema marks them non-mutable. Their value is informational
   * — the user wants to see what the running session is using —
   * and the chip renders as readonly via {@link _isReadOnlyChip}.
   * All other properties defer to the base behavior (hide if
   * non-mutable in a running session).
   */
  _shouldRenderProperty(property, schema, isNewSession) {
    const isUnifiedRepoProperty = property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch;
    return isUnifiedRepoProperty || super._shouldRenderProperty(property, schema, isNewSession);
  }
  /**
   * Mark non-mutable properties as readonly chips in running sessions
   * so taps don't try to open a picker (which would no-op at the
   * provider boundary). The schema's own `readOnly` flag still wins.
   */
  _isReadOnlyChip(property, schema, isNewSession) {
    return super._isReadOnlyChip(property, schema, isNewSession) || !isNewSession && !schema.sessionMutable;
  }
  async _showPicker(provider, sessionId, property, schema, trigger) {
    if (!isPhoneLayout(this._layoutService)) {
      return super._showPicker(provider, sessionId, property, schema, trigger);
    }
    if (provider.isSessionConfigResolving(sessionId).get()) {
      return;
    }
    if (property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch) {
      await this._showUnifiedRepoSheet(provider, sessionId, trigger);
      return;
    }
    return super._showPicker(provider, sessionId, property, schema, trigger);
  }
  async _showUnifiedRepoSheet(provider, sessionId, trigger) {
    const config = provider.getSessionConfig(sessionId);
    if (!config) {
      return;
    }
    const isolationSchema = config.schema.properties[SessionConfigKey.Isolation];
    const branchSchema = config.schema.properties[SessionConfigKey.Branch];
    const [isolationItems, branchItems] = await Promise.all([
      isolationSchema && !isolationSchema.readOnly ? this._getItems(provider, sessionId, SessionConfigKey.Isolation, isolationSchema) : Promise.resolve([]),
      branchSchema && !branchSchema.readOnly ? this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema) : Promise.resolve([])
    ]);
    const isolationValue = config.values[SessionConfigKey.Isolation];
    const branchValue = config.values[SessionConfigKey.Branch];
    const sheetItems = [];
    const idToConfig = /* @__PURE__ */ new Map();
    const registerId = (property, value, label, isPII) => {
      const id = `repo-row-${idToConfig.size}`;
      idToConfig.set(id, { property, value, label, isPII });
      return id;
    };
    isolationItems.forEach((item, index) => {
      sheetItems.push({
        id: registerId(SessionConfigKey.Isolation, item.value, item.label, !!isolationSchema?.enumDynamic),
        label: item.label,
        description: item.description,
        icon: getConfigIcon(SessionConfigKey.Isolation, item.value),
        checked: item.value === isolationValue,
        sectionTitle: index === 0 ? isolationSchema?.title ?? localize("mobileAgentHostSessionConfig.repoSheet.isolationSection", "Isolation") : void 0
      });
    });
    const branchSectionTitle = branchSchema?.title ?? localize("mobileAgentHostSessionConfig.repoSheet.branchSection", "Base Branch");
    if (!branchSchema?.enumDynamic) {
      branchItems.forEach((item, index) => {
        sheetItems.push({
          id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema?.enumDynamic),
          label: item.label,
          description: item.description,
          icon: getConfigIcon(SessionConfigKey.Branch, item.value),
          checked: item.value === branchValue,
          sectionTitle: index === 0 ? branchSectionTitle : void 0
        });
      });
    }
    if (sheetItems.length === 0 && !branchSchema?.enumDynamic) {
      return;
    }
    let search;
    if (branchSchema?.enumDynamic && !branchSchema.readOnly) {
      search = {
        placeholder: localize("mobileAgentHostSessionConfig.repoSheet.branchSearchPlaceholder", "Search branches"),
        ariaLabel: localize("mobileAgentHostSessionConfig.repoSheet.branchSearchAria", "Search base branches"),
        resultsSectionTitle: branchSectionTitle,
        emptyMessage: localize("mobileAgentHostSessionConfig.repoSheet.branchSearchEmpty", "No matching branches."),
        loadItems: async (query, token) => {
          const items = query ? await this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema, query) : branchItems;
          if (token.isCancellationRequested) {
            return [];
          }
          return items.map((item) => ({
            id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema.enumDynamic),
            label: item.label,
            description: item.description,
            icon: getConfigIcon(SessionConfigKey.Branch, item.value),
            checked: item.value === branchValue
          }));
        }
      };
    }
    trigger.setAttribute("aria-expanded", "true");
    await showMobilePickerSheet(
      this._layoutService.mainContainer,
      localize("mobileAgentHostSessionConfig.repoSheet.title", "Worktree"),
      sheetItems,
      {
        search,
        // Keep the sheet open on row taps so the user can adjust
        // both isolation mode and branch without reopening. Each
        // tap writes through immediately; Done just dismisses.
        stayOpenOnSelect: true,
        onDidSelect: (id) => {
          const selection = idToConfig.get(id);
          if (selection) {
            const beforeValue = provider.getSessionConfig(sessionId)?.values[selection.property];
            reportNewChatPickerClosed(this._telemetryService, {
              id: "NewChatAgentHostSessionConfigPicker",
              name: `NewChatAgentHostSessionConfigPicker.${selection.property}`,
              optionIdBefore: typeof beforeValue === "string" ? beforeValue : void 0,
              optionIdAfter: selection.value,
              optionLabelBefore: void 0,
              optionLabelAfter: selection.label,
              isPII: selection.isPII
            });
            provider.setSessionConfigValue(sessionId, selection.property, selection.value).catch(() => {
            });
          }
        }
      }
    );
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }
}
class PickerActionViewItem extends BaseActionViewItem {
  constructor(_picker, disposable) {
    super(void 0, { id: "", label: "", enabled: true, class: void 0, tooltip: "", run: () => {
    } });
    this._picker = _picker;
    if (disposable) {
      this._register(disposable);
    }
  }
  render(container) {
    this._picker.render(container);
  }
  dispose() {
    this._picker.dispose();
    super.dispose();
  }
}
let AgentHostSessionConfigPickerContribution = class extends Disposable {
  constructor(actionViewItemService, _layoutService) {
    super();
    this._layoutService = _layoutService;
    this._register(actionViewItemService.register(
      Menus.NewSessionRepositoryConfig,
      "sessions.agentHost.sessionConfigPicker",
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(MobileAgentHostSessionConfigPicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(
          isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
          session
        ));
      }
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(
          isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
          session
        ));
      }
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_APPROVE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => this._createNewSessionPermissionPicker(scopedInstantiationService)
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_PERMISSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostClaudePermissionModePicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_CODEX_APPROVALS_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostCodexApprovalsPicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_CONFIG_PICKER_ID,
      this._createRunningSessionPermissionPickerFactory()
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostClaudePermissionModePicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostCodexApprovalsPicker, session));
      }
    ));
  }
  /**
   * On the new-chat page (left of the toolbar), use the sessions
   * {@link PermissionPicker} so the styling matches the surrounding sessions
   * pickers (font size, padding, icon size).
   */
  _createNewSessionPermissionPicker(instantiationService) {
    const { session } = instantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
    const delegate = instantiationService.createInstance(AgentHostPermissionPickerDelegate, session);
    const picker = instantiationService.createInstance(MobilePermissionPicker, delegate);
    return new PickerActionViewItem(picker, delegate);
  }
  /**
   * Inside a running chat widget (`ChatInputSecondary`), use the workbench
   * {@link PermissionPickerActionItem} so it matches the rest of the
   * chat-input secondary toolbar (which is what the extension-host CLI
   * already uses).
   */
  _createRunningSessionPermissionPickerFactory() {
    return (action, _options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      const { session } = instantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
      const pickerOptions = {
        compact: constObservable(true),
        listOptions: { minWidth: 255 }
      };
      return instantiationService.createInstance(
        AgentHostPermissionPickerActionItem,
        action,
        pickerOptions,
        session
      );
    };
  }
};
AgentHostSessionConfigPickerContribution.ID = "sessions.contrib.agentHostSessionConfigPicker";
AgentHostSessionConfigPickerContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IWorkbenchLayoutService)
], AgentHostSessionConfigPickerContribution);
const NEW_SESSION_APPROVE_PICKER_ID = "sessions.agentHost.newSessionApprovePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_APPROVE_PICKER_ID,
      title: localize2("agentHostNewSessionApprovePicker", "Session Approvals"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost)
      }]
    });
  }
  async run() {
  }
});
const NEW_SESSION_PERMISSION_MODE_PICKER_ID = "sessions.agentHost.newSessionPermissionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_PERMISSION_MODE_PICKER_ID,
      title: localize2("agentHostNewSessionPermissionModePicker", "Approvals"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost)
      }]
    });
  }
  async run() {
  }
});
const NEW_SESSION_CODEX_APPROVALS_PICKER_ID = "sessions.agentHost.newSessionCodexApprovalsPicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_CODEX_APPROVALS_PICKER_ID,
      title: localize2("agentHostNewSessionCodexApprovalsPicker", "Approvals"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 3,
        when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost)
      }]
    });
  }
  async run() {
  }
});
const NEW_SESSION_MODE_PICKER_ID = "sessions.agentHost.newSessionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_MODE_PICKER_ID,
      title: localize2("agentHostNewSessionModePicker", "Agent Mode"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 0,
        // On phone the {@link MobileChatInputConfigPicker} replaces
        // this picker with a unified mode + model bottom sheet, so
        // gate this desktop-only Action out of phone layouts.
        when: ContextKeyExpr.and(
          ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
          IsPhoneLayoutContext.negate()
        )
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_CONFIG_PICKER_ID = "sessions.agentHost.runningSessionConfigPicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_CONFIG_PICKER_ID,
      title: localize2("agentHostRunningSessionConfigPicker", "Session Approvals"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 10,
        when: ChatContextKeyExprs.isAgentHostSession
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_PERMISSION_MODE_PICKER_ID = "sessions.agentHost.runningSessionPermissionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
      title: localize2("agentHostRunningSessionPermissionModePicker", "Approvals"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 11,
        when: ChatContextKeyExprs.isAgentHostSession
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID = "sessions.agentHost.runningSessionCodexApprovalsPicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID,
      title: localize2("agentHostRunningSessionCodexApprovalsPicker", "Approvals"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 12,
        when: ChatContextKeyExprs.isAgentHostSession
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_MODE_PICKER_ID = "sessions.agentHost.runningSessionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_MODE_PICKER_ID,
      title: localize2("agentHostRunningSessionModePicker", "Agent Mode"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 9,
        // Hide the agent mode picker while a delegation (continue in) target is pending.
        when: ContextKeyExpr.and(ChatContextKeyExprs.isAgentHostSession, ChatContextKeys.hasPendingDelegationTarget.negate())
      }]
    });
  }
  async run(accessor) {
    showActiveSessionModePicker(accessor);
  }
});
registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
export {
  AgentHostSessionConfigPicker,
  PickerActionViewItem,
  getConfigIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlci5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLCB0eXBlIElBY3Rpb25WaWV3SXRlbUZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBTZXNzaW9uQ29uZmlnVmFsdWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgaXNDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IG1heWJlQ29uZmlybUVsZXZhdGVkUGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFBlcm1pc3Npb25XYXJuaW5ncy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleUV4cHJzLCBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBtYXJrT25ib2FyZGluZ1RhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL29uYm9hcmRpbmcvYnJvd3Nlci9zcG90bGlnaHQvb25ib2FyZGluZ1RhcmdldC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IHR5cGUgSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IFNlc3Npb25Qcm92aWRlcklkQ29udGV4dCwgSXNQaG9uZUxheW91dENvbnRleHQsIElzUXVpY2tDaGF0U2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL25ld0NoYXRQaWNrZXJUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25Db250ZXh0LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgdHlwZSBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgaXNBZ2VudEhvc3RQcm92aWRlciwgTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCwgUkVNT1RFX0FHRU5UX0hPU1RfUFJPVklERVJfUkUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBQZXJtaXNzaW9uUGlja2VyIH0gZnJvbSAnLi4vLi4vY29waWxvdENoYXRTZXNzaW9ucy9icm93c2VyL3Blcm1pc3Npb25QaWNrZXIuanMnO1xuaW1wb3J0IHsgTW9iaWxlUGVybWlzc2lvblBpY2tlciB9IGZyb20gJy4uLy4uL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9tb2JpbGVQZXJtaXNzaW9uUGlja2VyLmpzJztcbmltcG9ydCB7IGlzUGhvbmVMYXlvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVMYXlvdXQuanMnO1xuaW1wb3J0IHsgc2hvd01vYmlsZVBpY2tlclNoZWV0LCBJTW9iaWxlUGlja2VyU2hlZXRJdGVtLCBJTW9iaWxlUGlja2VyU2hlZXRTZWFyY2hTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVQaWNrZXJTaGVldC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNb2RlUGlja2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RNb2RlUGlja2VyLmpzJztcbmltcG9ydCB7IE1vYmlsZUFnZW50SG9zdE1vZGVQaWNrZXIgfSBmcm9tICcuL21vYmlsZS9tb2JpbGVBZ2VudEhvc3RNb2RlUGlja2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtIH0gZnJvbSAnLi9hZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEsIGlzV2VsbEtub3duQ2xhdWRlUGVybWlzc2lvbk1vZGVTY2hlbWEsIGlzV2VsbEtub3duQ29kZXhBcHByb3ZhbHNTY2hlbWEsIGlzV2VsbEtub3duTW9kZVNjaGVtYSB9IGZyb20gJy4vYWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsYXVkZVBlcm1pc3Npb25Nb2RlUGlja2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RDbGF1ZGVQZXJtaXNzaW9uTW9kZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jbGF1ZGVTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFwcHJvdmFsc1BpY2tlciB9IGZyb20gJy4vYWdlbnRIb3N0Q29kZXhBcHByb3ZhbHNQaWNrZXIuanMnO1xuaW1wb3J0IHsgaXNBdXRvQXBwcm92ZVZhbHVlUG9saWN5UmVzdHJpY3RlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FnZW50SG9zdENvbmZpZ1BvbGljeS5qcyc7XG5pbXBvcnQgeyBDb2RleFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NvZGV4U2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuXG5jb25zdCBJc0FjdGl2ZVNlc3Npb25SZW1vdGVBZ2VudEhvc3QgPSBDb250ZXh0S2V5RXhwci5yZWdleChTZXNzaW9uUHJvdmlkZXJJZENvbnRleHQua2V5LCBSRU1PVEVfQUdFTlRfSE9TVF9QUk9WSURFUl9SRSk7XG5jb25zdCBJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCA9IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uUHJvdmlkZXJJZENvbnRleHQua2V5LCBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEKTtcblxuZnVuY3Rpb24gc2hvd0FjdGl2ZVNlc3Npb25Nb2RlUGlja2VyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRjb25zdCBhbmNob3IgPSBkb20uaXNIVE1MRWxlbWVudChhY3RpdmVFbGVtZW50KSA/IGFjdGl2ZUVsZW1lbnQgOiBkb20uZ2V0QWN0aXZlRG9jdW1lbnQoKS5ib2R5O1xuXHRjb25zdCBwaWNrZXIgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5jcmVhdGVJbnN0YW5jZShcblx0XHRpc1Bob25lTGF5b3V0KGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSkpID8gTW9iaWxlQWdlbnRIb3N0TW9kZVBpY2tlciA6IEFnZW50SG9zdE1vZGVQaWNrZXIsXG5cdFx0YWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLmFjdGl2ZVNlc3Npb24sXG5cdCk7XG5cdGlmICghcGlja2VyLnNob3dQaWNrZXIoYW5jaG9yLCAoKSA9PiBwaWNrZXIuZGlzcG9zZSgpKSkge1xuXHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuYWdlbnRIb3N0LnNlc3Npb25Db25maWdQaWNrZXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlcicsIFwiU2Vzc2lvbiBDb25maWd1cmF0aW9uXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLk5ld1Nlc3Npb25SZXBvc2l0b3J5Q29uZmlnLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKElzQWN0aXZlU2Vzc2lvbkxvY2FsQWdlbnRIb3N0LCBJc0FjdGl2ZVNlc3Npb25SZW1vdGVBZ2VudEhvc3QpLFxuXHRcdFx0XHRcdElzUXVpY2tDaGF0U2Vzc2lvbkNvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ1BpY2tlckl0ZW0ge1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgY2hlY2tlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25maWdJY29uKHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkKTogVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbikge1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2ZvbGRlcicpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLmZvbGRlcjtcblx0XHR9XG5cdFx0aWYgKHZhbHVlID09PSAnd29ya3RyZWUnKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi53b3JrdHJlZTtcblx0XHR9XG5cdH1cblx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCkge1xuXHRcdHJldHVybiBDb2RpY29uLmdpdEJyYW5jaDtcblx0fVxuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRpZiAodmFsdWUgPT09ICdhdXRvcGlsb3QnKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5yb2NrZXQ7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSA9PT0gJ2F1dG9BcHByb3ZlJykge1xuXHRcdFx0cmV0dXJuIENvZGljb24ud2FybmluZztcblx0XHR9XG5cdFx0aWYgKHZhbHVlID09PSAnYXNzaXN0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5zcGFya2xlO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29kaWNvbi5zaGllbGQ7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdG9BY3Rpb25JdGVtcyhwcm9wZXJ0eTogc3RyaW5nLCBpdGVtczogcmVhZG9ubHkgSUNvbmZpZ1BpY2tlckl0ZW1bXSwgY3VycmVudFZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkLCBwb2xpY3lSZXN0cmljdGVkPzogYm9vbGVhbik6IElBY3Rpb25MaXN0SXRlbTxJQ29uZmlnUGlja2VySXRlbT5bXSB7XG5cdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSAmJiBpc0F1dG9BcHByb3ZlVmFsdWVQb2xpY3lSZXN0cmljdGVkKGl0ZW0udmFsdWUsIHBvbGljeVJlc3RyaWN0ZWQgPT09IHRydWUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRkZXRhaWw6IGRpc2FibGVkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcucG9saWN5RGlzYWJsZWQnLCBcIkRpc2FibGVkIGJ5IHlvdXIgb3JnYW5pemF0aW9uLiBDb250YWN0IHlvdXIgYWRtaW5pc3RyYXRvci5cIilcblx0XHRcdFx0OiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBnZXRDb25maWdJY29uKHByb3BlcnR5LCBpdGVtLnZhbHVlKSB9LFxuXHRcdFx0ZGlzYWJsZWQsXG5cdFx0XHRpdGVtOiB7IC4uLml0ZW0sIGNoZWNrZWQ6IGlzU2VsZWN0ZWRWYWx1ZShjdXJyZW50VmFsdWUsIGl0ZW0udmFsdWUpIH0sXG5cdFx0fTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzU2VsZWN0ZWRWYWx1ZShjdXJyZW50VmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIGl0ZW1WYWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgY3VycmVudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRyZXR1cm4gY3VycmVudFZhbHVlID09PSAoaXRlbVZhbHVlID09PSAndHJ1ZScpO1xuXHR9XG5cdHJldHVybiBpdGVtVmFsdWUgPT09IGN1cnJlbnRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGlja2VyVHJpZ2dlcihzbG90OiBIVE1MRWxlbWVudCwgZGlzYWJsZWQ6IGJvb2xlYW4sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG9uT3BlbjogKCkgPT4gdm9pZCk6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgdHJpZ2dlciA9IGRvbS5hcHBlbmQoc2xvdCwgZGlzYWJsZWQgPyBkb20uJCgnc3Bhbi5hY3Rpb24tbGFiZWwnKSA6IGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0aWYgKGRpc2FibGVkKSB7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtcmVhZG9ubHknLCAndHJ1ZScpO1xuXHR9IGVsc2Uge1xuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRyaWdnZXIudGFiSW5kZXggPSAwO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2xpc3Rib3gnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQodHJpZ2dlcikpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0b25PcGVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdG9uT3BlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXHRzbG90LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgZGlzYWJsZWQpO1xuXG5cdHJldHVybiB0cmlnZ2VyO1xufVxuXG4vLyBUcmFjayB3aGV0aGVyIGF1dG8tYXBwcm92ZSB3YXJuaW5ncyBoYXZlIGJlZW4gc2hvd24gdGhpcyBWUyBDb2RlIHNlc3Npb25cbi8qKlxuICogTWFya3MgYnlwYXNzL2F1dG9waWxvdCBhcyBkaXNhYmxlZCBpZiBlbnRlcnByaXNlIHBvbGljeSByZXN0cmljdHNcbiAqIGF1dG8tYXBwcm92YWwuIFJldHVybnMgdGhlIGl0ZW1zIGFuZCBwb2xpY3kgc3RhdGUuXG4gKi9cbmZ1bmN0aW9uIGFwcGx5QXV0b0FwcHJvdmVGaWx0ZXJpbmcoXG5cdGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdLFxuXHRwcm9wZXJ0eTogc3RyaW5nLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuKTogeyByZWFkb25seSBpdGVtczogcmVhZG9ubHkgSUNvbmZpZ1BpY2tlckl0ZW1bXTsgcmVhZG9ubHkgcG9saWN5UmVzdHJpY3RlZDogYm9vbGVhbiB9IHtcblx0aWYgKHByb3BlcnR5ICE9PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0cmV0dXJuIHsgaXRlbXMsIHBvbGljeVJlc3RyaWN0ZWQ6IGZhbHNlIH07XG5cdH1cblx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblx0cmV0dXJuIHsgaXRlbXMsIHBvbGljeVJlc3RyaWN0ZWQgfTtcbn1cblxuLyoqXG4gKiBTaG93cyBhIGNvbmZpcm1hdGlvbiBkaWFsb2cgZm9yIGVsZXZhdGVkIGF1dG8tYXBwcm92ZSBsZXZlbHMgKEJ5cGFzc1xuICogb3IgbGVnYWN5IEF1dG9waWxvdCkuIERlbGVnYXRlcyB0byB0aGUgc2hhcmVkXG4gKiB7QGxpbmsgbWF5YmVDb25maXJtRWxldmF0ZWRQZXJtaXNzaW9uTGV2ZWx9IHNvIHRoZSBjb3B5LCBpY29ucywgYW5kXG4gKiBcIkRvbid0IHNob3cgYWdhaW5cIiBwZXJzaXN0ZW5jZSBzdGF5IGNvbnNpc3RlbnQgYWNyb3NzIGV2ZXJ5IHBlcm1pc3Npb25cbiAqIHBpY2tlci4gUmV0dXJucyBgdHJ1ZWAgd2hlbiBjb25maXJtZWQgKG9yIG5vdCBlbGV2YXRlZCksIGBmYWxzZWAgd2hlbiB0aGVcbiAqIHVzZXIgY2FuY2Vscy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY29uZmlybUF1dG9BcHByb3ZlTGV2ZWwodmFsdWU6IHN0cmluZywgbGFiZWw6IHN0cmluZywgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0aWYgKCFpc0NoYXRQZXJtaXNzaW9uTGV2ZWwodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIG1heWJlQ29uZmlybUVsZXZhdGVkUGVybWlzc2lvbkxldmVsKHZhbHVlLCBkaWFsb2dTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgeyBkZWZhdWx0U2V0dGluZ0tleTogQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdENvbmZpZ3VyYXRpb24sIGxldmVsTGFiZWw6IGxhYmVsIH0pO1xufVxuXG4vKipcbiAqIEFwcGxpZXMgd2FybmluZy9pbmZvIENTUyBjbGFzc2VzIHRvIGEgdHJpZ2dlciBlbGVtZW50IGZvciBhdXRvLWFwcHJvdmUgbGV2ZWxzLlxuICovXG5mdW5jdGlvbiBhcHBseUF1dG9BcHByb3ZlVHJpZ2dlclN0eWxlcyh0cmlnZ2VyOiBIVE1MRWxlbWVudCwgcHJvcGVydHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0dHJpZ2dlci5jbGFzc0xpc3QudG9nZ2xlKCd3YXJuaW5nJywgdmFsdWUgPT09ICdhdXRvcGlsb3QnIHx8IHZhbHVlID09PSAnYXNzaXN0ZWQnKTtcblx0XHR0cmlnZ2VyLmNsYXNzTGlzdC50b2dnbGUoJ2luZm8nLCB2YWx1ZSA9PT0gJ2F1dG9BcHByb3ZlJyk7XG5cdH1cbn1cblxuY2xhc3MgSXNvbGF0aW9uQ2hlY2tib3hDb250cm9sIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHNsb3QgPSBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3Quc2Vzc2lvbnMtY2hhdC1pc29sYXRpb24tY2hlY2tib3gnKTtcblx0cmVhZG9ubHkgY2hlY2tib3g6IENoZWNrYm94O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JvdzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBfZW5hYmxlZCA9IHRydWU7XG5cdHByaXZhdGUgX3Rvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRvblRvZ2dsZTogKGNoZWNrZWQ6IGJvb2xlYW4pID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yb3cgPSBkb20uYXBwZW5kKHRoaXMuc2xvdCwgZG9tLiQoJy5hY3Rpb24tbGFiZWwnKSk7XG5cdFx0dGhpcy5jaGVja2JveCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGVja2JveChsYWJlbCwgZmFsc2UsIHsgLi4uZGVmYXVsdENoZWNrYm94U3R5bGVzLCBzaXplOiAxNCB9KSk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLl9yb3csIHRoaXMuY2hlY2tib3guZG9tTm9kZSk7XG5cdFx0Y29uc3QgbGFiZWxTcGFuID0gZG9tLmFwcGVuZCh0aGlzLl9yb3csIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0gbGFiZWw7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihtYXJrT25ib2FyZGluZ1RhcmdldCh0aGlzLnNsb3QsICdzZXNzaW9ucy5uZXdTZXNzaW9uLmlzb2xhdGlvbicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IG9uVG9nZ2xlKHRoaXMuY2hlY2tib3guY2hlY2tlZCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLl9yb3cpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9yb3csIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jaGVja2JveC5jaGVja2VkID0gIXRoaXMuY2hlY2tib3guY2hlY2tlZDtcblx0XHRcdFx0b25Ub2dnbGUodGhpcy5jaGVja2JveC5jaGVja2VkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGUoY2hlY2tlZDogYm9vbGVhbiwgcmVhZE9ubHk6IGJvb2xlYW4sIHJlc29sdmluZzogYm9vbGVhbiwgdG9vbHRpcDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5hYmxlZCA9ICFyZWFkT25seSAmJiAhcmVzb2x2aW5nO1xuXHRcdHRoaXMuY2hlY2tib3guY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0aWYgKHJlYWRPbmx5KSB7XG5cdFx0XHR0aGlzLmNoZWNrYm94LmRpc2FibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jaGVja2JveC5lbmFibGUoKTtcblx0XHRcdHRoaXMuY2hlY2tib3guZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCByZXNvbHZpbmcgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHR9XG5cdFx0dGhpcy5zbG90LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgcmVhZE9ubHkpO1xuXHRcdHRoaXMuc2xvdC5jbGFzc0xpc3QudG9nZ2xlKCdyZXNvbHZpbmcnLCAhcmVhZE9ubHkgJiYgcmVzb2x2aW5nKTtcblxuXHRcdGlmICh0aGlzLl90b29sdGlwICE9PSB0b29sdGlwKSB7XG5cdFx0XHR0aGlzLl90b29sdGlwID0gdG9vbHRpcDtcblx0XHRcdHRoaXMuX2hvdmVyLnZhbHVlID0gdG9vbHRpcCA/IHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLl9yb3csIHsgY29udGVudDogdG9vbHRpcCB9KSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2xvdC5yZW1vdmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc29sYXRpb25DaGVja2JveCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJc29sYXRpb25DaGVja2JveENvbnRyb2w+KCkpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2ZpbHRlckRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjxyZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08SUNvbmZpZ1BpY2tlckl0ZW0+W10+KDIwMCkpO1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTZXNzaW9uL3Byb3BlcnR5LXNjb3BlZCB2YWx1ZVx1MjE5MmxhYmVsIGNhY2hlIGZvciBgZW51bUR5bmFtaWNgXG5cdCAqIHByb3BlcnRpZXMgKGUuZy4gYnJhbmNoKSwgcG9wdWxhdGVkIHdoZW5ldmVyIGBfZ2V0SXRlbXNgIGZldGNoZXNcblx0ICogY29tcGxldGlvbnMuIGBlbnVtRHluYW1pY2AgY29tcGxldGlvbnMgYXJlIHRyYW5zaWVudCBwcm90b2NvbFxuXHQgKiBkYXRhIFx1MjAxNCBvbmx5IGB2YWx1ZWAgaXMgcGVyc2lzdGVkIHZpYSBgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlYC9cblx0ICogYHJlc29sdmVTZXNzaW9uQ29uZmlnYCBcdTIwMTQgc28gdGhpcyBpcyB0aGUgb25seSBwbGFjZSBhIGNvbXBsZXRpb24nc1xuXHQgKiBgbGFiZWxgIGZvciBhIHByZXZpb3VzbHktcGlja2VkIHZhbHVlIGNhbiBiZSByZWNvdmVyZWQgb25jZSB0aGVcblx0ICogZHJvcGRvd24vc2hlZXQgY2xvc2VzLiBTdGF0aWMgYGVudW1gIHByb3BlcnRpZXMgZG9uJ3QgbmVlZCB0aGlzOlxuXHQgKiB0aGVpciBsYWJlbCBpcyBhbHdheXMgZGVyaXZhYmxlIGZyb20gYHNjaGVtYS5lbnVtYC9gZW51bUxhYmVsc2AuXG5cdCAqXG5cdCAqIEtleWVkIGJ5IHNlc3Npb24gc28gZW50cmllcyBkb24ndCBsZWFrIGFjcm9zcyBzZXNzaW9uczogdGhpcyBwaWNrZXJcblx0ICogaXMgb25seSBldmVyIGNyZWF0ZWQgZm9yIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlciAoYE1lbnVzLk5ld1Nlc3Npb24tXG5cdCAqIFJlcG9zaXRvcnlDb25maWdgKSwgYW5kIHRoYXQgY29tcG9zZXIncyBgX3Nlc3Npb25gIHRyYWNrcyB0aGVcblx0ICogZ2xvYmFsbHkgYWN0aXZlIHNlc3Npb24gXHUyMDE0IHNvIHRoZSAqc2FtZSogcGlja2VyIGluc3RhbmNlIGNhbiBvYnNlcnZlXG5cdCAqIGEgc2VxdWVuY2Ugb2YgZGlmZmVyZW50IChub3QteWV0LWNyZWF0ZWQpIGRyYWZ0IHNlc3Npb25zIGFzIHRoZSB1c2VyXG5cdCAqIHN3aXRjaGVzIGJldHdlZW4gdGhlbS4gYF9yZW5kZXJDb25maWdQaWNrZXJzYCBldmljdHMgZW50cmllcyBmb3IgYW55XG5cdCAqIHNlc3Npb24gb3RoZXIgdGhhbiB0aGUgY3VycmVudCBvbmUgb24gZXZlcnkgcmVuZGVyLCBzbyB0aGUgbWFwIG5ldmVyXG5cdCAqIGdyb3dzIGJleW9uZCB0aGUgcHJvcGVydGllcyBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZHluYW1pY1ZhbHVlTGFiZWxzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIHN0cmluZz4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4sXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3JlbmRlckNvbmZpZ1BpY2tlcnMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckxpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKHByb3ZpZGVyLmlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dhdGNoUHJvdmlkZXJzKGUuYWRkZWQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyQ29uZmlnUGlja2VycygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl93YXRjaFByb3ZpZGVycyh0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gdGhlIGxheW91dCBjcm9zc2VzIHRoZSBwaG9uZSBicmVha3BvaW50IHNvIHRoZVxuXHRcdC8vIGlzb2xhdGlvbiBjb250cm9sIHN3YXBzIGJldHdlZW4gdGhlIGRlc2t0b3AgY2hlY2tib3ggYW5kIHRoZVxuXHRcdC8vIHBob25lIGNoaXAgKHdoaWNoIHJvdXRlcyB0byB0aGUgdW5pZmllZCByZXBvc2l0b3J5IHNoZWV0KS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KFtJc1Bob25lTGF5b3V0Q29udGV4dC5rZXldKSkpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ29uZmlnUGlja2VycygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3dhdGNoUHJvdmlkZXJzKHByb3ZpZGVyczogcmVhZG9ubHkgSVNlc3Npb25zUHJvdmlkZXJbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAoIWlzQWdlbnRIb3N0UHJvdmlkZXIocHJvdmlkZXIpIHx8IHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLmhhcyhwcm92aWRlci5pZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm92aWRlckxpc3RlbmVycy5zZXQocHJvdmlkZXIuaWQsIHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZygoKSA9PiB0aGlzLl9yZW5kZXJDb25maWdQaWNrZXJzKCkpKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LmNsZWFyKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1hZ2VudC1ob3N0LWNvbmZpZycpKTtcblx0XHR0aGlzLl9yZW5kZXJDb25maWdQaWNrZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDb25maWdQaWNrZXJzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBpc29sYXRpb25TbG90ID0gdGhpcy5faXNvbGF0aW9uQ2hlY2tib3gudmFsdWU/LnNsb3Q7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKHRoaXMuX2NvbnRhaW5lci5jaGlsZHJlbikpIHtcblx0XHRcdGlmIChjaGlsZCAhPT0gaXNvbGF0aW9uU2xvdCkge1xuXHRcdFx0XHRjaGlsZC5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHR0aGlzLl9ldmljdER5bmFtaWNWYWx1ZUxhYmVsc0Zvck90aGVyU2Vzc2lvbnMoc2Vzc2lvbj8uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHNlc3Npb24gPyB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc29sdmVkQ29uZmlnID0gc2Vzc2lvbiAmJiBwcm92aWRlcj8uZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uIHx8ICFwcm92aWRlciB8fCAhcmVzb2x2ZWRDb25maWcpIHtcblx0XHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW4gdGhlIHJ1bm5pbmctc2Vzc2lvbiBmbG93IG9ubHkgYHNlc3Npb25NdXRhYmxlYCBwcm9wZXJ0aWVzIGNhblxuXHRcdC8vIGFjdHVhbGx5IGJlIGNoYW5nZWQgKG5vbi1tdXRhYmxlIG9uZXMgd291bGQgbm8tb3AgaW5cblx0XHQvLyBgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlYCkuIEluIHRoZSBuZXctc2Vzc2lvbiBmbG93IGFueSBwcm9wZXJ0eSBpc1xuXHRcdC8vIGNoYW5nZWFibGUgYmVjYXVzZSBjaGFuZ2VzIHRyaWdnZXIgYSBmdWxsIGNvbmZpZyByZS1yZXNvbHZlIFx1MjAxNCBzb1xuXHRcdC8vIG5vbi1tdXRhYmxlIHByb3BlcnRpZXMgbGlrZSBgaXNvbGF0aW9uYCBtdXN0IHJlbWFpbiB2aXNpYmxlIGFuZFxuXHRcdC8vIGludGVyYWN0aXZlIHRoZXJlLlxuXHRcdGNvbnN0IGlzTmV3U2Vzc2lvbiA9IHByb3ZpZGVyLmdldENyZWF0ZVNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpICE9PSB1bmRlZmluZWQ7XG5cdFx0Ly8gRGlzYWJsZSBpbnRlcmFjdGlvbnMgd2hpbGUgYSByZXNvbHZlIGlzIGluIGZsaWdodC4gU2NoZW1hIGlzXG5cdFx0Ly8gcHJlc2VydmVkIHNvIGNoaXBzIHN0YXkgdmlzaWJsZS4gTm90IGBzZXNzaW9uLmxvYWRpbmdgIFx1MjAxNFxuXHRcdC8vIHRoYXQgYWxzbyBjb3ZlcnMgdGhlIHJlcXVpcmVkLXZhbHVlcy1taXNzaW5nIHN0YXRlIHdoZXJlXG5cdFx0Ly8gY2hpcHMgbXVzdCByZW1haW4gaW50ZXJhY3RpdmUuXG5cdFx0Y29uc3QgaXNMb2FkaW5nID0gcHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb24uc2Vzc2lvbklkKS5nZXQoKTtcblxuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSB0aGlzLl9vcmRlclByb3BlcnRpZXMoT2JqZWN0LmVudHJpZXMocmVzb2x2ZWRDb25maWcuc2NoZW1hLnByb3BlcnRpZXMpKTtcblx0XHRsZXQgcmVuZGVyZWRJc29sYXRpb25DaGVja2JveCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBbcHJvcGVydHksIHNjaGVtYV0gb2YgcHJvcGVydGllcykge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1BpY2thYmxlKHNjaGVtYSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBBIGhpZGRlbiBjYXJyaWVyIHByb3BlcnR5IChzZWUgYHdvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eWAgaW5cblx0XHRcdC8vIGB3b3JrdHJlZUlzb2xhdGlvbi50c2ApIGNvbnN1bWVkIG9ubHkgYnkgdGhlIGhvc3QgZm9yIHdvcmt0cmVlXG5cdFx0XHQvLyBpc29sYXRpb24sIG5ldmVyIGVkaXRlZCBieSB0aGUgdXNlci4gSXRzIGJvb2xlYW4gdHlwZSBvdGhlcndpc2Vcblx0XHRcdC8vIHBhc3NlcyBgX2lzUGlja2FibGVgIHVubGlrZSBpdHMgc3RyaW5nL2FycmF5IGNhcnJpZXIgc2libGluZ3Ncblx0XHRcdC8vIChgd29ya3RyZWVCcmFuY2hQcmVmaXhgL2B3b3JrdHJlZUluY2x1ZGVGaWxlc2ApLCB3aGljaCBhcmVcblx0XHRcdC8vIGZpbHRlcmVkIG91dCBiZWNhdXNlIHRoZXkgbGFjayBhbiBgZW51bWAuXG5cdFx0XHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFjaykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24gJiYgIXNjaGVtYS5lbnVtPy5pbmNsdWRlcygnd29ya3RyZWUnKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fc2hvdWxkUmVuZGVyUHJvcGVydHkocHJvcGVydHksIHNjaGVtYSwgaXNOZXdTZXNzaW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gdGhlIGF1dG9BcHByb3ZlIHByb3BlcnR5IHVzZXMgdGhlIHdlbGwta25vd24gc2NoZW1hLCB0aGVcblx0XHRcdC8vIHdvcmtiZW5jaCBgUGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW1gIChyZWdpc3RlcmVkIHNlcGFyYXRlbHkgZm9yXG5cdFx0XHQvLyBgTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2xgKSBoYW5kbGVzIGl0IFx1MjAxNCBza2lwIGl0IGhlcmUgdG8gYXZvaWRcblx0XHRcdC8vIGRvdWJsZS1yZW5kZXJpbmcuIE5vbi1jb25mb3JtaW5nIHNjaGVtYXMgc3RpbGwgZmFsbCB0aHJvdWdoIHRvXG5cdFx0XHQvLyB0aGUgZ2VuZXJpYyBwZXItcHJvcGVydHkgcGlja2VyIGJlbG93LlxuXHRcdFx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmIGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gdGhlIG1vZGUgcHJvcGVydHkgdXNlcyB0aGUgd2VsbC1rbm93biBzY2hlbWEsIHRoZSBkZWRpY2F0ZWRcblx0XHRcdC8vIHtAbGluayBBZ2VudEhvc3RNb2RlUGlja2VyfSAocmVnaXN0ZXJlZCBzZXBhcmF0ZWx5IGZvclxuXHRcdFx0Ly8gYE1lbnVzLk5ld1Nlc3Npb25Db250cm9sYCkgaGFuZGxlcyBpdC4gTm9uLWNvbmZvcm1pbmcgc2NoZW1hc1xuXHRcdFx0Ly8gc3RpbGwgZmFsbCB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIHBlci1wcm9wZXJ0eSBwaWNrZXIgYmVsb3cuXG5cdFx0XHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuTW9kZSAmJiBpc1dlbGxLbm93bk1vZGVTY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIENsYXVkZSdzIHBlcm1pc3Npb25Nb2RlIGhhcyBhIGRlZGljYXRlZCBDbGF1ZGUtbmF0aXZlIHBpY2tlciBzb1xuXHRcdFx0Ly8gaXQgZG9lc24ndCByZW5kZXIgYXMgYSBnZW5lcmljIGVudW0gY2hpcC5cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZSAmJiBpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBDb2RleCdzIHBlcm1pc3Npb25zIHByZXNldCBoYXMgYSBkZWRpY2F0ZWQgQ29kZXgtbmF0aXZlIHBpY2tlclxuXHRcdFx0Ly8gKGEgc2luZ2xlIFwiQXBwcm92YWxzXCIgY2hpcCkgc28gaXQgZG9lc24ndCByZW5kZXIgYXMgYSBnZW5lcmljXG5cdFx0XHQvLyBlbnVtIGNoaXAuXG5cdFx0XHRpZiAocHJvcGVydHkgPT09IENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldCAmJiBpc1dlbGxLbm93bkNvZGV4QXBwcm92YWxzU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJlc29sdmVkQ29uZmlnLnZhbHVlc1twcm9wZXJ0eV0gPz8gc2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRjb25zdCBpc1JlYWRPbmx5ID0gdGhpcy5faXNSZWFkT25seUNoaXAocHJvcGVydHksIHNjaGVtYSwgaXNOZXdTZXNzaW9uKTtcblx0XHRcdC8vIElzb2xhdGlvbiByZW5kZXJzIGFzIGEgV29ya3RyZWUgY2hlY2tib3ggb24gZGVza3RvcDsgdGhlIHBob25lIGxheW91dCBrZWVwcyB0aGUgY2hpcCBmb3IgdGhlIHVuaWZpZWQgcmVwbyBzaGVldC5cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24gJiYgdGhpcy5fc2hvdWxkUmVuZGVySXNvbGF0aW9uQXNDaGVja2JveChzY2hlbWEpKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlcklzb2xhdGlvbkNoZWNrYm94KHNlc3Npb24uc2Vzc2lvbklkLCBzY2hlbWEsIHZhbHVlLCBpc1JlYWRPbmx5LCAhaXNSZWFkT25seSAmJiBpc0xvYWRpbmcpO1xuXHRcdFx0XHRyZW5kZXJlZElzb2xhdGlvbkNoZWNrYm94ID0gdHJ1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzbG90ID0gZG9tLmFwcGVuZCh0aGlzLl9jb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdCcpKTtcblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG1hcmtPbmJvYXJkaW5nVGFyZ2V0KHNsb3QsICdzZXNzaW9ucy5uZXdTZXNzaW9uLmlzb2xhdGlvbicpKTtcblx0XHRcdH1cblx0XHRcdC8vIGByZW5kZXJQaWNrZXJUcmlnZ2VyYCdzIGBkaXNhYmxlZGAgZmxhZyBtZWFucyBcInJlYWQtb25seVwiXG5cdFx0XHQvLyAocmVuZGVycyBhIGA8c3Bhbj5gIHdpdGggYGFyaWEtcmVhZG9ubHlgKS4gVGhlIHJlc29sdmluZ1xuXHRcdFx0Ly8gc3RhdGUgaXMgdHJhbnNpZW50IGFuZCB1c2VzIGBhcmlhLWRpc2FibGVkYCB3aGlsZSBwcmVzZXJ2aW5nXG5cdFx0XHQvLyB0aGUgdHJpZ2dlcidzIGFwcGVhcmFuY2UuIFRoZSBjbGljayBoYW5kbGVyIGJhaWxzIHdoZW4gcmVzb2x2aW5nXG5cdFx0XHQvLyBpbiBgX3Nob3dQaWNrZXJgLlxuXHRcdFx0Y29uc3QgdHJpZ2dlciA9IHJlbmRlclBpY2tlclRyaWdnZXIoc2xvdCwgaXNSZWFkT25seSwgdGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMsICgpID0+IHRoaXMuX3Nob3dQaWNrZXIocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBwcm9wZXJ0eSwgc2NoZW1hLCB0cmlnZ2VyKSk7XG5cdFx0XHQvLyBUaGUgcmVhZC1vbmx5IEJyYW5jaCBjaGlwIHNraXBzIHRoZSBob3ZlcjogaXQganVzdCBtaXJyb3JzIHRoZVxuXHRcdFx0Ly8gY3VycmVudC9kZWZhdWx0IGJyYW5jaCBuYW1lIChhbHJlYWR5IHZpc2libGUgYXMgdGhlIGxhYmVsKSxcblx0XHRcdC8vIGFuZCB0aGUgc2NoZW1hIGRlc2NyaXB0aW9uIHJlYWRzIGF3a3dhcmRseSBhcyBhIGhvdmVyIGZvciBhXG5cdFx0XHQvLyBmaXhlZCB2YWx1ZS4gVGhlIGVkaXRhYmxlIEJyYW5jaCBjaGlwICh3b3JrdHJlZSBpc29sYXRpb24pXG5cdFx0XHQvLyBrZWVwcyBpdHMgZGVzY3JpcHRpb24sIHdoaWNoIGlzIHVzZWZ1bCBjb250ZXh0IHRoZXJlLlxuXHRcdFx0Y29uc3QgdG9vbHRpcCA9IChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2ggJiYgaXNSZWFkT25seSkgPyB1bmRlZmluZWQgOiAoc2NoZW1hLmRlc2NyaXB0aW9uID8/IHNjaGVtYS50aXRsZSk7XG5cdFx0XHRpZiAodG9vbHRpcCkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRyaWdnZXIsIHsgY29udGVudDogdG9vbHRpcCB9KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzUmVhZE9ubHkgJiYgaXNMb2FkaW5nKSB7XG5cdFx0XHRcdHNsb3QuY2xhc3NMaXN0LmFkZCgncmVzb2x2aW5nJyk7XG5cdFx0XHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgJ3RydWUnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbmRlclRyaWdnZXIodHJpZ2dlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEsIHZhbHVlLCBpc1JlYWRPbmx5KTtcblx0XHR9XG5cblx0XHRpZiAoIXJlbmRlcmVkSXNvbGF0aW9uQ2hlY2tib3gpIHtcblx0XHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNQaWNrYWJsZShzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSk6IGJvb2xlYW4ge1xuXHRcdGlmIChzY2hlbWEudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS50eXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gISFzY2hlbWEuZW51bUR5bmFtaWMgfHwgKEFycmF5LmlzQXJyYXkoc2NoZW1hLmVudW0pICYmIHNjaGVtYS5lbnVtLmxlbmd0aCA+IDApO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9yZGVyIHRoZSBzY2hlbWEgcHJvcGVydGllcyBmb3IgcmVuZGVyaW5nLiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvblxuXHQgKiBlbmZvcmNlcyBhIHN0YWJsZSB2aXN1YWwgc2VxdWVuY2UgZm9yIHdlbGwta25vd24gcHJvcGVydGllczpcblx0ICogSXNvbGF0aW9uICh3b3JrdHJlZS9mb2xkZXIpIGZpcnN0LCB0aGVuIEJyYW5jaC4gQW55IG90aGVyIHByb3BlcnRpZXNcblx0ICoga2VlcCB0aGVpciBvcmlnaW5hbCBzY2hlbWEgb3JkZXIgYWZ0ZXIgdGhlc2UgdHdvLiBTdWJjbGFzc2VzIGNhblxuXHQgKiBvdmVycmlkZSB0byBpbXBvc2UgYSBkaWZmZXJlbnQgZGV0ZXJtaW5pc3RpYyB2aXN1YWwgc2VxdWVuY2Vcblx0ICogKGUuZy4gdGhlIG1vYmlsZSBjaGlwIHJvdyBncm91cHMgQXBwcm92YWxzIHwgQnJhbmNoIHwgV29ya3RyZWUpLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9vcmRlclByb3BlcnRpZXMocHJvcGVydGllczogUmVhZG9ubHlBcnJheTxbc3RyaW5nLCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWFdPik6IFJlYWRvbmx5QXJyYXk8W3N0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hXT4ge1xuXHRcdGNvbnN0IG9yZGVyID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oW1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCAwXSxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgMV0sXG5cdFx0XSk7XG5cdFx0cmV0dXJuIHByb3BlcnRpZXNcblx0XHRcdC5tYXAoKFtrZXksIHNjaGVtYV0sIGluZGV4KSA9PiAoeyBrZXksIHNjaGVtYSwgaW5kZXggfSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRjb25zdCBhUmFuayA9IG9yZGVyLmdldChhLmtleSkgPz8gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cdFx0XHRcdGNvbnN0IGJSYW5rID0gb3JkZXIuZ2V0KGIua2V5KSA/PyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHRcdFx0cmV0dXJuIGFSYW5rIC0gYlJhbmsgfHwgYS5pbmRleCAtIGIuaW5kZXg7XG5cdFx0XHR9KVxuXHRcdFx0Lm1hcCgoeyBrZXksIHNjaGVtYSB9KSA9PiBba2V5LCBzY2hlbWFdIGFzIFtzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYV0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlY2lkZSB3aGV0aGVyIGEgcHJvcGVydHkncyBjaGlwIHNob3VsZCBiZSByZW5kZXJlZCBmb3IgdGhlIGN1cnJlbnRcblx0ICogc2Vzc2lvbi4gVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gaGlkZXMgbm9uLW11dGFibGUgcHJvcGVydGllcyBpblxuXHQgKiBydW5uaW5nIHNlc3Npb25zICh0aGV5IHdvdWxkIHJlbmRlciBhcyBkZWFkIHBpbGxzKS4gU3ViY2xhc3NlcyBjYW5cblx0ICogb3ZlcnJpZGUgdG8ga2VlcCBzcGVjaWZpYyBwcm9wZXJ0aWVzIHZpc2libGUgYXMgcmVhZG9ubHkgY2hpcHMgXHUyMDE0XG5cdCAqIHNlZSB7QGxpbmsgX2lzUmVhZE9ubHlDaGlwfS5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvdWxkUmVuZGVyUHJvcGVydHkocHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIGlzTmV3U2Vzc2lvbjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc05ld1Nlc3Npb24gfHwgISFzY2hlbWEuc2Vzc2lvbk11dGFibGU7XG5cdH1cblxuXHQvKipcblx0ICogRGVjaWRlIHdoZXRoZXIgYSBwcm9wZXJ0eSdzIHRyaWdnZXIgc2hvdWxkIHJlbmRlciBhcyByZWFkb25seVxuXHQgKiAobm8gY2hldnJvbiwgbm8gcG9wdXApLiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBkZWZlcnMgdG8gdGhlXG5cdCAqIHNjaGVtYSdzIGByZWFkT25seWAgZmxhZy4gU3ViY2xhc3NlcyB0aGF0IG9wdCBpbiB0byByZW5kZXJpbmdcblx0ICogbm9uLW11dGFibGUgY2hpcHMgdmlhIHtAbGluayBfc2hvdWxkUmVuZGVyUHJvcGVydHl9IHNob3VsZFxuXHQgKiBvdmVycmlkZSB0aGlzIHRvIGFsc28gbWFyayB0aGVtIHJlYWRvbmx5IGF0IHJ1bnRpbWUuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2lzUmVhZE9ubHlDaGlwKHByb3BlcnR5OiBzdHJpbmcsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBpc05ld1Nlc3Npb246IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFzY2hlbWEucmVhZE9ubHk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlbmRlclRyaWdnZXIodHJpZ2dlcjogSFRNTEVsZW1lbnQsIHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIGlzUmVhZE9ubHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRyaWdnZXIpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGdldENvbmZpZ0ljb24ocHJvcGVydHksIHZhbHVlKTtcblx0XHRpZiAoaWNvbikge1xuXHRcdFx0ZG9tLmFwcGVuZCh0cmlnZ2VyLCByZW5kZXJJY29uKGljb24pKTtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWxTcGFuID0gZG9tLmFwcGVuZCh0cmlnZ2VyLCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fZ2V0TGFiZWwoc2Vzc2lvbklkLCBwcm9wZXJ0eSwgc2NoZW1hLCB2YWx1ZSk7XG5cdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBpc1JlYWRPbmx5XG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnRyaWdnZXJBcmlhUmVhZE9ubHknLCBcInswfTogezF9LCBSZWFkLU9ubHlcIiwgc2NoZW1hLnRpdGxlLCBsYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcudHJpZ2dlckFyaWEnLCBcInswfTogezF9XCIsIHNjaGVtYS50aXRsZSwgbGFiZWwpKTtcblx0XHRhcHBseUF1dG9BcHByb3ZlVHJpZ2dlclN0eWxlcyh0cmlnZ2VyLCBwcm9wZXJ0eSwgdmFsdWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGlzb2xhdGlvbiBwcm9wZXJ0eSBzaG91bGQgcmVuZGVyIGFzIGEgY2hlY2tib3hcblx0ICogKFdvcmt0cmVlIG9uL29mZikgcmF0aGVyIHRoYW4gYSBkcm9wZG93bi4gT25seSBvbiBub24tcGhvbmVcblx0ICogbGF5b3V0cyBhbmQgb25seSB3aGVuIHRoZSBzY2hlbWEgb2ZmZXJzIGJvdGggZm9sZGVyIGFuZCB3b3JrdHJlZS5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvdWxkUmVuZGVySXNvbGF0aW9uQXNDaGVja2JveChzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhaXNQaG9uZUxheW91dCh0aGlzLl9sYXlvdXRTZXJ2aWNlKVxuXHRcdFx0JiYgQXJyYXkuaXNBcnJheShzY2hlbWEuZW51bSlcblx0XHRcdCYmIHNjaGVtYS5lbnVtLmluY2x1ZGVzKCd3b3JrdHJlZScpXG5cdFx0XHQmJiBzY2hlbWEuZW51bS5pbmNsdWRlcygnZm9sZGVyJyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJJc29sYXRpb25DaGVja2JveChzZXNzaW9uSWQ6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkLCBpc1JlYWRPbmx5OiBib29sZWFuLCBpc0xvYWRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKCdhZ2VudEhvc3RTZXNzaW9uQ29uZmlnLmlzb2xhdGlvbi53b3JrdHJlZScsIFwiTmV3IFdvcmt0cmVlXCIpO1xuXHRcdGNvbnN0IHdvcmt0cmVlSW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZignd29ya3RyZWUnKSA/PyAtMTtcblx0XHRjb25zdCB0b29sdGlwID0gKHdvcmt0cmVlSW5kZXggPj0gMCA/IHNjaGVtYS5lbnVtRGVzY3JpcHRpb25zPy5bd29ya3RyZWVJbmRleF0gOiB1bmRlZmluZWQpID8/IHNjaGVtYS5kZXNjcmlwdGlvbiA/PyBzY2hlbWEudGl0bGU7XG5cblx0XHRsZXQgY29udHJvbCA9IHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LnZhbHVlO1xuXHRcdGlmICghY29udHJvbCB8fCBjb250cm9sLnNlc3Npb25JZCAhPT0gc2Vzc2lvbklkKSB7XG5cdFx0XHRjb250cm9sID0gbmV3IElzb2xhdGlvbkNoZWNrYm94Q29udHJvbChzZXNzaW9uSWQsIGxhYmVsLCB0aGlzLl9ob3ZlclNlcnZpY2UsIGNoZWNrZWQgPT4gdGhpcy5fYXBwbHlJc29sYXRpb25WYWx1ZShzZXNzaW9uSWQsIGNoZWNrZWQpKTtcblx0XHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LnZhbHVlID0gY29udHJvbDtcblx0XHRcdHRoaXMuX2NvbnRhaW5lcj8ucHJlcGVuZChjb250cm9sLnNsb3QpO1xuXHRcdH1cblx0XHRjb250cm9sLnVwZGF0ZSh2YWx1ZSA9PT0gJ3dvcmt0cmVlJywgaXNSZWFkT25seSwgaXNMb2FkaW5nLCB0b29sdGlwKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5SXNvbGF0aW9uVmFsdWUoc2Vzc2lvbklkOiBzdHJpbmcsIGNoZWNrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24gfHwgc2Vzc2lvbi5zZXNzaW9uSWQgIT09IHNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJJZCk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRDb25maWcgPSBwcm92aWRlcj8uZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNjaGVtYSA9IHJlc29sdmVkQ29uZmlnPy5zY2hlbWEucHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl07XG5cdFx0aWYgKCFwcm92aWRlciB8fCAhc2NoZW1hKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmVmb3JlID0gcmVzb2x2ZWRDb25maWcudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSA/PyBzY2hlbWEuZGVmYXVsdDtcblx0XHRjb25zdCBuZXh0VmFsdWUgPSBjaGVja2VkID8gJ3dvcmt0cmVlJyA6ICdmb2xkZXInO1xuXHRcdHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0aWQ6ICdOZXdDaGF0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlcicsXG5cdFx0XHRuYW1lOiBgTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIuJHtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbn1gLFxuXHRcdFx0b3B0aW9uSWRCZWZvcmU6IHR5cGVvZiBiZWZvcmUgPT09ICdzdHJpbmcnID8gYmVmb3JlIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9uSWRBZnRlcjogbmV4dFZhbHVlLFxuXHRcdFx0b3B0aW9uTGFiZWxCZWZvcmU6IHR5cGVvZiBiZWZvcmUgPT09ICdzdHJpbmcnID8gdGhpcy5fZ2V0TGFiZWwoc2Vzc2lvbklkLCBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbiwgc2NoZW1hLCBiZWZvcmUpIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9uTGFiZWxBZnRlcjogdGhpcy5fZ2V0TGFiZWwoc2Vzc2lvbklkLCBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbiwgc2NoZW1hLCBuZXh0VmFsdWUpLFxuXHRcdFx0aXNQSUk6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCBuZXh0VmFsdWUpLmNhdGNoKCgpID0+IHsgLyogYmVzdC1lZmZvcnQgKi8gfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3Nob3dQaWNrZXIocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHRyaWdnZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNjaGVtYS5yZWFkT25seSB8fCB0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBNb2JpbGUgYm90dG9tLXNoZWV0IG92ZXJyaWRlIGRpc3BhdGNoZXMgdGhyb3VnaCB0aGlzIGVudHJ5XG5cdFx0Ly8gcG9pbnQsIHNvIGd1YXJkIGhlcmUgZm9yIGJvdGggaW52b2NhdGlvbiBwYXRocy5cblx0XHRpZiAocHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb25JZCkuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYXdJdGVtcyA9IGF3YWl0IHRoaXMuX2dldEl0ZW1zKHByb3ZpZGVyLCBzZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEpO1xuXHRcdGNvbnN0IHsgaXRlbXMsIHBvbGljeVJlc3RyaWN0ZWQgfSA9IGFwcGx5QXV0b0FwcHJvdmVGaWx0ZXJpbmcocmF3SXRlbXMsIHByb3BlcnR5LCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVQcm9wZXJ0eSA9IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlO1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbklkKT8udmFsdWVzW3Byb3BlcnR5XSA/PyBzY2hlbWEuZGVmYXVsdDtcblx0XHRjb25zdCBjdXJyZW50SXRlbSA9IGl0ZW1zLmZpbmQoaSA9PiBpc1NlbGVjdGVkVmFsdWUoY3VycmVudFZhbHVlLCBpLnZhbHVlKSk7XG5cdFx0Y29uc3QgYWN0aW9uSXRlbXMgPSB0b0FjdGlvbkl0ZW1zKHByb3BlcnR5LCBpdGVtcywgY3VycmVudFZhbHVlLCBwb2xpY3lSZXN0cmljdGVkKTtcblxuXHRcdGNvbnN0IGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPElDb25maWdQaWNrZXJJdGVtPiA9IHtcblx0XHRcdG9uU2VsZWN0OiBhc3luYyBpdGVtID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cblx0XHRcdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0aWQ6ICdOZXdDaGF0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlcicsXG5cdFx0XHRcdFx0bmFtZTogYE5ld0NoYXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyLiR7cHJvcGVydHl9YCxcblx0XHRcdFx0XHRvcHRpb25JZEJlZm9yZTogdHlwZW9mIGN1cnJlbnRWYWx1ZSA9PT0gJ3N0cmluZycgPyBjdXJyZW50VmFsdWUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b3B0aW9uSWRBZnRlcjogaXRlbS52YWx1ZSxcblx0XHRcdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogY3VycmVudEl0ZW0/LmxhYmVsLFxuXHRcdFx0XHRcdG9wdGlvbkxhYmVsQWZ0ZXI6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0aXNQSUk6ICEhc2NoZW1hLmVudW1EeW5hbWljLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoaXNBdXRvQXBwcm92ZVByb3BlcnR5ICYmIGl0ZW0udmFsdWUgIT09ICdkZWZhdWx0Jykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGNvbmZpcm1BdXRvQXBwcm92ZUxldmVsKGl0ZW0udmFsdWUsIGl0ZW0ubGFiZWwsIHRoaXMuX2RpYWxvZ1NlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5leHRWYWx1ZSA9IHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicgPyBpdGVtLnZhbHVlID09PSAndHJ1ZScgOiBpdGVtLnZhbHVlO1xuXHRcdFx0XHRwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbklkLCBwcm9wZXJ0eSwgbmV4dFZhbHVlKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRmlsdGVyOiBzY2hlbWEuZW51bUR5bmFtaWNcblx0XHRcdFx0PyBxdWVyeSA9PiB0aGlzLl9maWx0ZXJEZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkUmF3SXRlbXMgPSBhd2FpdCB0aGlzLl9nZXRJdGVtcyhwcm92aWRlciwgc2Vzc2lvbklkLCBwcm9wZXJ0eSwgc2NoZW1hLCBxdWVyeSk7XG5cdFx0XHRcdFx0Y29uc3QgeyBpdGVtczogZmlsdGVyZWRJdGVtcywgcG9saWN5UmVzdHJpY3RlZDogZmlsdGVyZWRQb2xpY3lSZXN0cmljdGVkIH0gPSBhcHBseUF1dG9BcHByb3ZlRmlsdGVyaW5nKGZpbHRlcmVkUmF3SXRlbXMsIHByb3BlcnR5LCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRvQWN0aW9uSXRlbXMocHJvcGVydHksIGZpbHRlcmVkSXRlbXMsIHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbklkKT8udmFsdWVzW3Byb3BlcnR5XSA/PyBzY2hlbWEuZGVmYXVsdCwgZmlsdGVyZWRQb2xpY3lSZXN0cmljdGVkKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRvbkhpZGU6ICgpID0+IHRyaWdnZXIuZm9jdXMoKSxcblx0XHR9O1xuXG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93PElDb25maWdQaWNrZXJJdGVtPihcblx0XHRcdGBhZ2VudEhvc3RTZXNzaW9uQ29uZmlnLiR7cHJvcGVydHl9YCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0YWN0aW9uSXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiBpdGVtID0+IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYXJpYUxhYmVsJywgXCJ7MH0gUGlja2VyXCIsIHNjaGVtYS50aXRsZSksXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uSXRlbXMubGVuZ3RoID4gMTBcblx0XHRcdFx0PyB7IHNob3dGaWx0ZXI6IHRydWUsIGZpbHRlclBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5maWx0ZXInLCBcIkZpbHRlciBvcHRpb25zLi4uXCIpLCBtaW5XaWR0aDogMjU1IH1cblx0XHRcdFx0OiB7IG1pbldpZHRoOiAyNTUgfSxcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRJdGVtcyhwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgcXVlcnk/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10+IHtcblx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0eyB2YWx1ZTogJ3RydWUnLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYm9vbGVhbi50cnVlJywgXCJPblwiKSB9LFxuXHRcdFx0XHR7IHZhbHVlOiAnZmFsc2UnLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYm9vbGVhbi5mYWxzZScsIFwiT2ZmXCIpIH0sXG5cdFx0XHRdO1xuXHRcdH1cblx0XHRjb25zdCBkeW5hbWljSXRlbXMgPSBzY2hlbWEuZW51bUR5bmFtaWNcblx0XHRcdD8gYXdhaXQgcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHNlc3Npb25JZCwgcHJvcGVydHksIHF1ZXJ5KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGR5bmFtaWNJdGVtcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGR5bmFtaWNJdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9mcm9tQ29tcGxldGlvbkl0ZW0oaXRlbSkpO1xuXHRcdFx0dGhpcy5fY2FjaGVEeW5hbWljVmFsdWVMYWJlbHMoc2Vzc2lvbklkLCBwcm9wZXJ0eSwgaXRlbXMpO1xuXHRcdFx0cmV0dXJuIGl0ZW1zO1xuXHRcdH1cblxuXHRcdC8vIFN0YXRpYyBlbnVtOiBzY2hlbWEuZW51bS9lbnVtTGFiZWxzIGFscmVhZHkgY2FycnkgYSByZWxpYWJsZVxuXHRcdC8vIGxhYmVsIG1hcHBpbmcsIHNvIHRoZXJlJ3Mgbm8gbmVlZCB0byBjYWNoZSB0aGVzZSBzZXBhcmF0ZWx5LlxuXHRcdHJldHVybiAoc2NoZW1hLmVudW0gPz8gW10pLm1hcCgodmFsdWUsIGluZGV4KSA9PiAoe1xuXHRcdFx0dmFsdWU6IFN0cmluZyh2YWx1ZSksXG5cdFx0XHRsYWJlbDogc2NoZW1hLmVudW1MYWJlbHM/LltpbmRleF0gPz8gU3RyaW5nKHZhbHVlKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBzY2hlbWEuZW51bURlc2NyaXB0aW9ucz8uW2luZGV4XSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9mcm9tQ29tcGxldGlvbkl0ZW0oaXRlbTogU2Vzc2lvbkNvbmZpZ1ZhbHVlSXRlbSk6IElDb25maWdQaWNrZXJJdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmFsdWU6IGl0ZW0udmFsdWUsXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9keW5hbWljVmFsdWVMYWJlbHNLZXkoc2Vzc2lvbklkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtzZXNzaW9uSWR9XFwwJHtwcm9wZXJ0eX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVEeW5hbWljVmFsdWVMYWJlbHMoc2Vzc2lvbklkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZHluYW1pY1ZhbHVlTGFiZWxzS2V5KHNlc3Npb25JZCwgcHJvcGVydHkpO1xuXHRcdGxldCBsYWJlbHMgPSB0aGlzLl9keW5hbWljVmFsdWVMYWJlbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFsYWJlbHMpIHtcblx0XHRcdGxhYmVscyA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX2R5bmFtaWNWYWx1ZUxhYmVscy5zZXQoa2V5LCBsYWJlbHMpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0bGFiZWxzLnNldChpdGVtLnZhbHVlLCBpdGVtLmxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRHJvcHMgY2FjaGVkIGxhYmVscyBmb3IgYW55IHNlc3Npb24gb3RoZXIgdGhhbiBgc2Vzc2lvbklkYC4gQ2FsbGVkIG9uXG5cdCAqIGV2ZXJ5IHJlbmRlciBzbyB0aGUgY2FjaGUgdHJhY2tzIHdoaWNoZXZlciBzZXNzaW9uIHRoZSBwaWNrZXIgaXNcblx0ICogY3VycmVudGx5IGJvdW5kIHRvLCBpbnN0ZWFkIG9mIGFjY3VtdWxhdGluZyBlbnRyaWVzIGZvciBldmVyeSBkcmFmdFxuXHQgKiBzZXNzaW9uIHRoaXMgKHBvdGVudGlhbGx5IGxvbmctbGl2ZWQpIHBpY2tlciBpbnN0YW5jZSBoYXMgZXZlciBzaG93bi5cblx0ICovXG5cdHByaXZhdGUgX2V2aWN0RHluYW1pY1ZhbHVlTGFiZWxzRm9yT3RoZXJTZXNzaW9ucyhzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZml4ID0gYCR7c2Vzc2lvbklkfVxcMGA7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fZHluYW1pY1ZhbHVlTGFiZWxzLmtleXMoKSkge1xuXHRcdFx0aWYgKCFrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRcdHRoaXMuX2R5bmFtaWNWYWx1ZUxhYmVscy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYWJlbChzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSB0cnVlXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYm9vbGVhbi5vbkxhYmVsJywgXCJPblwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RTZXNzaW9uQ29uZmlnLmJvb2xlYW4ub2ZmTGFiZWwnLCBcIk9mZlwiKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGlmIChzY2hlbWEuZW51bUR5bmFtaWMpIHtcblx0XHRcdFx0Ly8gTG9vayB1cCB0aGUgZHluYW1pYyB2YWx1ZSBsYWJlbC4gSWYgd2UgYXJlIHVuYWJsZVxuXHRcdFx0XHQvLyB0byBsb29rdXAgdGhlIGR5bmFtaWMgdmFsdWUgbGFiZWwsIHdlIGZhbGwgYmFjayB0b1xuXHRcdFx0XHQvLyB0aGUgdmFsdWUgaXRzZWxmLlxuXHRcdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9keW5hbWljVmFsdWVMYWJlbHNLZXkoc2Vzc2lvbklkLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdGNvbnN0IGR5bmFtaWNMYWJlbCA9IHRoaXMuX2R5bmFtaWNWYWx1ZUxhYmVscy5nZXQoa2V5KT8uZ2V0KHZhbHVlKTtcblx0XHRcdFx0aWYgKGR5bmFtaWNMYWJlbCkge1xuXHRcdFx0XHRcdHJldHVybiBkeW5hbWljTGFiZWw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZih2YWx1ZSkgPz8gLTE7XG5cdFx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IHNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IHZhbHVlIDogdmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiBzY2hlbWEudGl0bGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFByb3ZpZGVyKHByb3ZpZGVySWQ6IHN0cmluZyk6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRyZXR1cm4gcHJvdmlkZXIgJiYgaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgPyBwcm92aWRlciA6IHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFBob25lIHZhcmlhbnQgb2Yge0BsaW5rIEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXJ9IHRoYXQgcm91dGVzIHRoZVxuICogSXNvbGF0aW9uIGFuZCBCcmFuY2ggcGlja2VycyB0aHJvdWdoIGEgdW5pZmllZCBib3R0b20gc2hlZXQgcmF0aGVyXG4gKiB0aGFuIHRoZSBkZXNrdG9wIGFjdGlvbi13aWRnZXQgcG9wdXAuXG4gKlxuICogT24gZGVza3RvcCB2aWV3cG9ydHMgdGhlIGluaGVyaXRlZCBgX3Nob3dQaWNrZXJgIGZhbGxzIHRocm91Z2ggdG8gdGhlXG4gKiBiYXNlIGltcGxlbWVudGF0aW9uLCBzbyB0aGlzIGNsYXNzIGlzIHNhZmUgdG8ga2VlcCB0aHJvdWdoXG4gKiB2aWV3cG9ydC1jbGFzcyB0cmFuc2l0aW9ucy5cbiAqXG4gKiBEZWZpbmVkIGluIHRoZSBzYW1lIGZpbGUgYXMgdGhlIGJhc2UgY2xhc3MgdG8gYXZvaWQgYSBjaXJjdWxhciBFU01cbiAqIGRlcGVuZGVuY3kgKHRoZSBgZXh0ZW5kc2AgY2xhdXNlIHJ1bnMgYXQgY2xhc3MtZGVmaW5pdGlvbiB0aW1lLCB3aGljaFxuICogaXMgZHVyaW5nIG1vZHVsZSBldmFsdWF0aW9uIFx1MjAxNCBhIHNlcGFyYXRlIGZpbGUgdGhhdCBpbXBvcnRlZCB0aGUgYmFzZVxuICogd291bGQgaGl0IFwiQ2Fubm90IGFjY2VzcyBiZWZvcmUgaW5pdGlhbGl6YXRpb25cIikuXG4gKi9cbmNsYXNzIE1vYmlsZUFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIgZXh0ZW5kcyBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyIHtcblxuXHQvKipcblx0ICogT24gcGhvbmUgdGhlIGNoaXAgbGFuZSBoYXMgYSBmaXhlZCB2aXN1YWwgc2VxdWVuY2UgXHUyMDE0IERlZmF1bHRcblx0ICogQXBwcm92YWxzIChyZW5kZXJlZCBieSBhIHNlcGFyYXRlIGxlZnQtc2lkZSBwaWNrZXIpLCB0aGVuIEJyYW5jaCxcblx0ICogdGhlbiBXb3JrdHJlZS4gU29ydCB0aGUga25vd24gcmVwby1jb25maWcgcHJvcGVydGllcyB0byB0aGF0XG5cdCAqIG9yZGVyOyB1bmtub3duIHByb3BlcnRpZXMgZmFsbCB0aHJvdWdoIHRvIHNjaGVtYS1kZWNsYXJlZCBvcmRlclxuXHQgKiBhZnRlciB0aGUga25vd24gb25lcy5cblx0ICpcblx0ICogT24gZGVza3RvcCB2aWV3cG9ydHMgdGhpcyBzdWJjbGFzcyBpcyBhbHNvIGluc3RhbnRpYXRlZCAoc2VlIHRoZVxuXHQgKiBmYWN0b3J5IGluIGBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2Vyc0NvbnRyaWJ1dGlvbmAgXHUyMDE0IGl0IGFsd2F5c1xuXHQgKiBwaWNrcyB0aGUgbW9iaWxlLWF3YXJlIHN1YmNsYXNzIHNvIGBfc2hvd1BpY2tlcmAgY2FuIHJvdXRlIHRvIHRoZVxuXHQgKiBib3R0b20gc2hlZXQgb24gcGhvbmVzKSwgc28gd2UgbXVzdCBkZWZlciB0byB0aGUgYmFzZSBvcmRlcmluZ1xuXHQgKiAoSXNvbGF0aW9uIGZpcnN0LCBCcmFuY2ggc2Vjb25kKSB3aGVuIG5vdCBvbiBhIHBob25lIGxheW91dC5cblx0ICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb3JkZXJQcm9wZXJ0aWVzKHByb3BlcnRpZXM6IFJlYWRvbmx5QXJyYXk8W3N0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hXT4pOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYV0+IHtcblx0XHRpZiAoIWlzUGhvbmVMYXlvdXQodGhpcy5fbGF5b3V0U2VydmljZSkpIHtcblx0XHRcdHJldHVybiBzdXBlci5fb3JkZXJQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuXHRcdH1cblx0XHRjb25zdCBvcmRlciA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KFtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgMF0sXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIDFdLFxuXHRcdF0pO1xuXHRcdHJldHVybiBwcm9wZXJ0aWVzLnNsaWNlKCkuc29ydCgoW2FLZXldLCBbYktleV0pID0+IHtcblx0XHRcdGNvbnN0IGEgPSBvcmRlci5nZXQoYUtleSkgPz8gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cdFx0XHRjb25zdCBiID0gb3JkZXIuZ2V0KGJLZXkpID8/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRcdFx0cmV0dXJuIGEgLSBiO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXAgQnJhbmNoIGFuZCBJc29sYXRpb24gdmlzaWJsZSBpbiBydW5uaW5nIHNlc3Npb25zIGV2ZW4gd2hlblxuXHQgKiB0aGUgc2NoZW1hIG1hcmtzIHRoZW0gbm9uLW11dGFibGUuIFRoZWlyIHZhbHVlIGlzIGluZm9ybWF0aW9uYWxcblx0ICogXHUyMDE0IHRoZSB1c2VyIHdhbnRzIHRvIHNlZSB3aGF0IHRoZSBydW5uaW5nIHNlc3Npb24gaXMgdXNpbmcgXHUyMDE0XG5cdCAqIGFuZCB0aGUgY2hpcCByZW5kZXJzIGFzIHJlYWRvbmx5IHZpYSB7QGxpbmsgX2lzUmVhZE9ubHlDaGlwfS5cblx0ICogQWxsIG90aGVyIHByb3BlcnRpZXMgZGVmZXIgdG8gdGhlIGJhc2UgYmVoYXZpb3IgKGhpZGUgaWZcblx0ICogbm9uLW11dGFibGUgaW4gYSBydW5uaW5nIHNlc3Npb24pLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRSZW5kZXJQcm9wZXJ0eShwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgaXNOZXdTZXNzaW9uOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaXNVbmlmaWVkUmVwb1Byb3BlcnR5ID0gcHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uIHx8IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaDtcblx0XHRyZXR1cm4gaXNVbmlmaWVkUmVwb1Byb3BlcnR5IHx8IHN1cGVyLl9zaG91bGRSZW5kZXJQcm9wZXJ0eShwcm9wZXJ0eSwgc2NoZW1hLCBpc05ld1Nlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmsgbm9uLW11dGFibGUgcHJvcGVydGllcyBhcyByZWFkb25seSBjaGlwcyBpbiBydW5uaW5nIHNlc3Npb25zXG5cdCAqIHNvIHRhcHMgZG9uJ3QgdHJ5IHRvIG9wZW4gYSBwaWNrZXIgKHdoaWNoIHdvdWxkIG5vLW9wIGF0IHRoZVxuXHQgKiBwcm92aWRlciBib3VuZGFyeSkuIFRoZSBzY2hlbWEncyBvd24gYHJlYWRPbmx5YCBmbGFnIHN0aWxsIHdpbnMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2lzUmVhZE9ubHlDaGlwKHByb3BlcnR5OiBzdHJpbmcsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBpc05ld1Nlc3Npb246IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc3VwZXIuX2lzUmVhZE9ubHlDaGlwKHByb3BlcnR5LCBzY2hlbWEsIGlzTmV3U2Vzc2lvbikgfHwgKCFpc05ld1Nlc3Npb24gJiYgIXNjaGVtYS5zZXNzaW9uTXV0YWJsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX3Nob3dQaWNrZXIocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHRyaWdnZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1Bob25lTGF5b3V0KHRoaXMuX2xheW91dFNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuX3Nob3dQaWNrZXIocHJvdmlkZXIsIHNlc3Npb25JZCwgcHJvcGVydHksIHNjaGVtYSwgdHJpZ2dlcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWlycm9yIHRoZSBiYXNlIGBfc2hvd1BpY2tlcmAgZ3VhcmQgKHRoZSByZXBvLXNoZWV0IHBhdGggYmVsb3cgYnlwYXNzZXNcblx0XHQvLyBpdCk6IGJhaWwgd2hpbGUgcmVzb2x2aW5nIHNvIGluamVjdGVkIGRpc2FibGVkIGNoaXBzIGRvbid0IG9wZW4gYSBzaGVldC5cblx0XHRpZiAocHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb25JZCkuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uIHx8IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2hvd1VuaWZpZWRSZXBvU2hlZXQocHJvdmlkZXIsIHNlc3Npb25JZCwgdHJpZ2dlcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLl9zaG93UGlja2VyKHByb3ZpZGVyLCBzZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEsIHRyaWdnZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1VuaWZpZWRSZXBvU2hlZXQocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgdHJpZ2dlcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWcgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc29sYXRpb25TY2hlbWEgPSBjb25maWcuc2NoZW1hLnByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dO1xuXHRcdGNvbnN0IGJyYW5jaFNjaGVtYSA9IGNvbmZpZy5zY2hlbWEucHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF07XG5cblx0XHRjb25zdCBbaXNvbGF0aW9uSXRlbXMsIGJyYW5jaEl0ZW1zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGlzb2xhdGlvblNjaGVtYSAmJiAhaXNvbGF0aW9uU2NoZW1hLnJlYWRPbmx5XG5cdFx0XHRcdD8gdGhpcy5fZ2V0SXRlbXMocHJvdmlkZXIsIHNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIGlzb2xhdGlvblNjaGVtYSlcblx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUoW10gYXMgcmVhZG9ubHkgSUNvbmZpZ1BpY2tlckl0ZW1bXSksXG5cdFx0XHRicmFuY2hTY2hlbWEgJiYgIWJyYW5jaFNjaGVtYS5yZWFkT25seVxuXHRcdFx0XHQ/IHRoaXMuX2dldEl0ZW1zKHByb3ZpZGVyLCBzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCBicmFuY2hTY2hlbWEpXG5cdFx0XHRcdDogUHJvbWlzZS5yZXNvbHZlKFtdIGFzIHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgaXNvbGF0aW9uVmFsdWUgPSBjb25maWcudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTtcblx0XHRjb25zdCBicmFuY2hWYWx1ZSA9IGNvbmZpZy52YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdO1xuXHRcdGNvbnN0IHNoZWV0SXRlbXM6IElNb2JpbGVQaWNrZXJTaGVldEl0ZW1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgaWRUb0NvbmZpZyA9IG5ldyBNYXA8c3RyaW5nLCB7IHByb3BlcnR5OiBzdHJpbmc7IHZhbHVlOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGlzUElJOiBib29sZWFuIH0+KCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJJZCA9IChwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBpc1BJSTogYm9vbGVhbik6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBpZCA9IGByZXBvLXJvdy0ke2lkVG9Db25maWcuc2l6ZX1gO1xuXHRcdFx0aWRUb0NvbmZpZy5zZXQoaWQsIHsgcHJvcGVydHksIHZhbHVlLCBsYWJlbCwgaXNQSUkgfSk7XG5cdFx0XHRyZXR1cm4gaWQ7XG5cdFx0fTtcblxuXHRcdGlzb2xhdGlvbkl0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG5cdFx0XHRzaGVldEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogcmVnaXN0ZXJJZChTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbiwgaXRlbS52YWx1ZSwgaXRlbS5sYWJlbCwgISFpc29sYXRpb25TY2hlbWE/LmVudW1EeW5hbWljKSxcblx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRpY29uOiBnZXRDb25maWdJY29uKFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCBpdGVtLnZhbHVlKSxcblx0XHRcdFx0Y2hlY2tlZDogaXRlbS52YWx1ZSA9PT0gaXNvbGF0aW9uVmFsdWUsXG5cdFx0XHRcdHNlY3Rpb25UaXRsZTogaW5kZXggPT09IDAgPyAoaXNvbGF0aW9uU2NoZW1hPy50aXRsZSA/PyBsb2NhbGl6ZSgnbW9iaWxlQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5yZXBvU2hlZXQuaXNvbGF0aW9uU2VjdGlvbicsIFwiSXNvbGF0aW9uXCIpKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnJhbmNoU2VjdGlvblRpdGxlID0gYnJhbmNoU2NoZW1hPy50aXRsZSA/PyBsb2NhbGl6ZSgnbW9iaWxlQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5yZXBvU2hlZXQuYnJhbmNoU2VjdGlvbicsIFwiQmFzZSBCcmFuY2hcIik7XG5cdFx0aWYgKCFicmFuY2hTY2hlbWE/LmVudW1EeW5hbWljKSB7XG5cdFx0XHRicmFuY2hJdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRzaGVldEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGlkOiByZWdpc3RlcklkKFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCBpdGVtLnZhbHVlLCBpdGVtLmxhYmVsLCAhIWJyYW5jaFNjaGVtYT8uZW51bUR5bmFtaWMpLFxuXHRcdFx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGljb246IGdldENvbmZpZ0ljb24oU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIGl0ZW0udmFsdWUpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGl0ZW0udmFsdWUgPT09IGJyYW5jaFZhbHVlLFxuXHRcdFx0XHRcdHNlY3Rpb25UaXRsZTogaW5kZXggPT09IDAgPyBicmFuY2hTZWN0aW9uVGl0bGUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNoZWV0SXRlbXMubGVuZ3RoID09PSAwICYmICFicmFuY2hTY2hlbWE/LmVudW1EeW5hbWljKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHNlYXJjaDogSU1vYmlsZVBpY2tlclNoZWV0U2VhcmNoU291cmNlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChicmFuY2hTY2hlbWE/LmVudW1EeW5hbWljICYmICFicmFuY2hTY2hlbWEucmVhZE9ubHkpIHtcblx0XHRcdHNlYXJjaCA9IHtcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnJlcG9TaGVldC5icmFuY2hTZWFyY2hQbGFjZWhvbGRlcicsIFwiU2VhcmNoIGJyYW5jaGVzXCIpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdtb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnJlcG9TaGVldC5icmFuY2hTZWFyY2hBcmlhJywgXCJTZWFyY2ggYmFzZSBicmFuY2hlc1wiKSxcblx0XHRcdFx0cmVzdWx0c1NlY3Rpb25UaXRsZTogYnJhbmNoU2VjdGlvblRpdGxlLFxuXHRcdFx0XHRlbXB0eU1lc3NhZ2U6IGxvY2FsaXplKCdtb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnJlcG9TaGVldC5icmFuY2hTZWFyY2hFbXB0eScsIFwiTm8gbWF0Y2hpbmcgYnJhbmNoZXMuXCIpLFxuXHRcdFx0XHRsb2FkSXRlbXM6IGFzeW5jIChxdWVyeSwgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IHF1ZXJ5XG5cdFx0XHRcdFx0XHQ/IGF3YWl0IHRoaXMuX2dldEl0ZW1zKHByb3ZpZGVyLCBzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCBicmFuY2hTY2hlbWEsIHF1ZXJ5KVxuXHRcdFx0XHRcdFx0OiBicmFuY2hJdGVtcztcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdFx0XHRpZDogcmVnaXN0ZXJJZChTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgaXRlbS52YWx1ZSwgaXRlbS5sYWJlbCwgISFicmFuY2hTY2hlbWEuZW51bUR5bmFtaWMpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGljb246IGdldENvbmZpZ0ljb24oU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIGl0ZW0udmFsdWUpLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogaXRlbS52YWx1ZSA9PT0gYnJhbmNoVmFsdWUsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0YXdhaXQgc2hvd01vYmlsZVBpY2tlclNoZWV0KFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLFxuXHRcdFx0bG9jYWxpemUoJ21vYmlsZUFnZW50SG9zdFNlc3Npb25Db25maWcucmVwb1NoZWV0LnRpdGxlJywgXCJXb3JrdHJlZVwiKSxcblx0XHRcdHNoZWV0SXRlbXMsXG5cdFx0XHR7XG5cdFx0XHRcdHNlYXJjaCxcblx0XHRcdFx0Ly8gS2VlcCB0aGUgc2hlZXQgb3BlbiBvbiByb3cgdGFwcyBzbyB0aGUgdXNlciBjYW4gYWRqdXN0XG5cdFx0XHRcdC8vIGJvdGggaXNvbGF0aW9uIG1vZGUgYW5kIGJyYW5jaCB3aXRob3V0IHJlb3BlbmluZy4gRWFjaFxuXHRcdFx0XHQvLyB0YXAgd3JpdGVzIHRocm91Z2ggaW1tZWRpYXRlbHk7IERvbmUganVzdCBkaXNtaXNzZXMuXG5cdFx0XHRcdHN0YXlPcGVuT25TZWxlY3Q6IHRydWUsXG5cdFx0XHRcdG9uRGlkU2VsZWN0OiAoaWQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBpZFRvQ29uZmlnLmdldChpZCk7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmVmb3JlVmFsdWUgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCk/LnZhbHVlc1tzZWxlY3Rpb24ucHJvcGVydHldO1xuXHRcdFx0XHRcdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRcdGlkOiAnTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXInLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBgTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIuJHtzZWxlY3Rpb24ucHJvcGVydHl9YCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uSWRCZWZvcmU6IHR5cGVvZiBiZWZvcmVWYWx1ZSA9PT0gJ3N0cmluZycgPyBiZWZvcmVWYWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uSWRBZnRlcjogc2VsZWN0aW9uLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25MYWJlbEFmdGVyOiBzZWxlY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGlzUElJOiBzZWxlY3Rpb24uaXNQSUksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQsIHNlbGVjdGlvbi5wcm9wZXJ0eSwgc2VsZWN0aW9uLnZhbHVlKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdHRyaWdnZXIuZm9jdXMoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbmZpZ1BpY2tlcldpZGdldCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgUGlja2VyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9waWNrZXI6IElDb25maWdQaWNrZXJXaWRnZXQsIGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgeyBpZDogJycsIGxhYmVsOiAnJywgZW5hYmxlZDogdHJ1ZSwgY2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogJycsIHJ1bjogKCkgPT4geyB9IH0pO1xuXHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3BpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGlja2VyLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLmNvbnRyaWIuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBUaGUgbW9kZS1waWNrZXIgZmFjdG9yaWVzIGJlbG93IHBpY2sgdGhlIG1vYmlsZSBzdWJjbGFzcyBhdFxuXHRcdC8vIHZpZXctaXRlbSBjb25zdHJ1Y3Rpb24gdGltZSB3aGVuIHRoZSB2aWV3cG9ydCBpcyBwaG9uZSwgYW5kXG5cdFx0Ly8gdGhlIGRlc2t0b3AgY2xhc3Mgb3RoZXJ3aXNlLiBUaGUgc2Vzc2lvbi1jb25maWcgcGlja2VyXG5cdFx0Ly8gYWx3YXlzIHVzZXMgdGhlIG1vYmlsZS1hd2FyZSBzdWJjbGFzcyBiZWNhdXNlIGl0c1xuXHRcdC8vIGBfc2hvd1BpY2tlcmAgb3ZlcnJpZGUgZmFsbHMgYmFjayB0byBgc3VwZXIuX3Nob3dQaWNrZXIoKWBcblx0XHQvLyBvbiBkZXNrdG9wLiBUaGUgc3RhdGljIGltcG9ydCBvZiBgTW9iaWxlQWdlbnRIb3N0TW9kZVBpY2tlcmBcblx0XHQvLyAvIGBNb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyYCBjcmVhdGVzIGEgY2lyY3VsYXJcblx0XHQvLyBkZXBlbmRlbmN5IChtb2JpbGUgXHUyMTkyIGJhc2UgXHUyMTkyIG1vYmlsZSksIGJ1dCBFU00gaGFuZGxlcyBpdFxuXHRcdC8vIGJlY2F1c2UgdGhlIGNsYXNzZXMgYXJlIG9ubHkgYWNjZXNzZWQgaW5zaWRlIHRoZXNlIGZhY3Rvcnlcblx0XHQvLyBjYWxsYmFja3MsIHdoaWNoIHJ1biBhdCBgQWZ0ZXJSZXN0b3JlZGAgXHUyMDE0IHdlbGwgYWZ0ZXIgYm90aFxuXHRcdC8vIG1vZHVsZXMgaGF2ZSBmaW5pc2hlZCBldmFsdWF0aW5nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVzLk5ld1Nlc3Npb25SZXBvc2l0b3J5Q29uZmlnLFxuXHRcdFx0J3Nlc3Npb25zLmFnZW50SG9zdC5zZXNzaW9uQ29uZmlnUGlja2VyJyxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUGlja2VyQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlciwgc2Vzc2lvbikpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoXG5cdFx0XHRNZW51cy5OZXdTZXNzaW9uQ29udHJvbCxcblx0XHRcdE5FV19TRVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0KF9hY3Rpb24sIF9vcHRpb25zLCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQaWNrZXJBY3Rpb25WaWV3SXRlbShzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRpc1Bob25lTGF5b3V0KHRoaXMuX2xheW91dFNlcnZpY2UpID8gTW9iaWxlQWdlbnRIb3N0TW9kZVBpY2tlciA6IEFnZW50SG9zdE1vZGVQaWNrZXIsXG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0KSk7XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRSVU5OSU5HX1NFU1NJT05fTU9ERV9QSUNLRVJfSUQsXG5cdFx0XHQoX2FjdGlvbiwgX29wdGlvbnMsIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElTZXNzaW9uQ29udGV4dCkpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBpY2tlckFjdGlvblZpZXdJdGVtKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdGlzUGhvbmVMYXlvdXQodGhpcy5fbGF5b3V0U2VydmljZSkgPyBNb2JpbGVBZ2VudEhvc3RNb2RlUGlja2VyIDogQWdlbnRIb3N0TW9kZVBpY2tlcixcblx0XHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHQpKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRORVdfU0VTU0lPTl9BUFBST1ZFX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHRoaXMuX2NyZWF0ZU5ld1Nlc3Npb25QZXJtaXNzaW9uUGlja2VyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoXG5cdFx0XHRNZW51cy5OZXdTZXNzaW9uQ29udHJvbCxcblx0XHRcdE5FV19TRVNTSU9OX1BFUk1JU1NJT05fTU9ERV9QSUNLRVJfSUQsXG5cdFx0XHQoX2FjdGlvbiwgX29wdGlvbnMsIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElTZXNzaW9uQ29udGV4dCkpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBpY2tlckFjdGlvblZpZXdJdGVtKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENsYXVkZVBlcm1pc3Npb25Nb2RlUGlja2VyLCBzZXNzaW9uKSk7XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVzLk5ld1Nlc3Npb25Db250cm9sLFxuXHRcdFx0TkVXX1NFU1NJT05fQ09ERVhfQVBQUk9WQUxTX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUGlja2VyQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q29kZXhBcHByb3ZhbHNQaWNrZXIsIHNlc3Npb24pKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFJVTk5JTkdfU0VTU0lPTl9DT05GSUdfUElDS0VSX0lELFxuXHRcdFx0dGhpcy5fY3JlYXRlUnVubmluZ1Nlc3Npb25QZXJtaXNzaW9uUGlja2VyRmFjdG9yeSgpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRSVU5OSU5HX1NFU1NJT05fUEVSTUlTU0lPTl9NT0RFX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUGlja2VyQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2xhdWRlUGVybWlzc2lvbk1vZGVQaWNrZXIsIHNlc3Npb24pKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFJVTk5JTkdfU0VTU0lPTl9DT0RFWF9BUFBST1ZBTFNfUElDS0VSX0lELFxuXHRcdFx0KF9hY3Rpb24sIF9vcHRpb25zLCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQaWNrZXJBY3Rpb25WaWV3SXRlbShzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RDb2RleEFwcHJvdmFsc1BpY2tlciwgc2Vzc2lvbikpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbiB0aGUgbmV3LWNoYXQgcGFnZSAobGVmdCBvZiB0aGUgdG9vbGJhciksIHVzZSB0aGUgc2Vzc2lvbnNcblx0ICoge0BsaW5rIFBlcm1pc3Npb25QaWNrZXJ9IHNvIHRoZSBzdHlsaW5nIG1hdGNoZXMgdGhlIHN1cnJvdW5kaW5nIHNlc3Npb25zXG5cdCAqIHBpY2tlcnMgKGZvbnQgc2l6ZSwgcGFkZGluZywgaWNvbiBzaXplKS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZU5ld1Nlc3Npb25QZXJtaXNzaW9uUGlja2VyKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQaWNrZXJBY3Rpb25WaWV3SXRlbSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIHNlc3Npb24pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZVBlcm1pc3Npb25QaWNrZXIsIGRlbGVnYXRlKTtcblx0XHRyZXR1cm4gbmV3IFBpY2tlckFjdGlvblZpZXdJdGVtKHBpY2tlciwgZGVsZWdhdGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc2lkZSBhIHJ1bm5pbmcgY2hhdCB3aWRnZXQgKGBDaGF0SW5wdXRTZWNvbmRhcnlgKSwgdXNlIHRoZSB3b3JrYmVuY2hcblx0ICoge0BsaW5rIFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtfSBzbyBpdCBtYXRjaGVzIHRoZSByZXN0IG9mIHRoZVxuXHQgKiBjaGF0LWlucHV0IHNlY29uZGFyeSB0b29sYmFyICh3aGljaCBpcyB3aGF0IHRoZSBleHRlbnNpb24taG9zdCBDTElcblx0ICogYWxyZWFkeSB1c2VzKS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVJ1bm5pbmdTZXNzaW9uUGVybWlzc2lvblBpY2tlckZhY3RvcnkoKTogSUFjdGlvblZpZXdJdGVtRmFjdG9yeSB7XG5cdFx0cmV0dXJuIChhY3Rpb24sIF9vcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdGNvbnN0IHBpY2tlck9wdGlvbnM6IElDaGF0SW5wdXRQaWNrZXJPcHRpb25zID0ge1xuXHRcdFx0XHRjb21wYWN0OiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0XHRcdGxpc3RPcHRpb25zOiB7IG1pbldpZHRoOiAyNTUgfSxcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtLFxuXHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdHBpY2tlck9wdGlvbnMsXG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHQpO1xuXHRcdH07XG5cdH1cbn1cblxuLy8gLS0tLSBOZXcgc2Vzc2lvbiBhdXRvLWFwcHJvdmUgcGlja2VyIChsZWZ0IHNpZGUsIE5ld1Nlc3Npb25Db250cm9sKSAtLS0tXG5cbmNvbnN0IE5FV19TRVNTSU9OX0FQUFJPVkVfUElDS0VSX0lEID0gJ3Nlc3Npb25zLmFnZW50SG9zdC5uZXdTZXNzaW9uQXBwcm92ZVBpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTkVXX1NFU1NJT05fQVBQUk9WRV9QSUNLRVJfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudEhvc3ROZXdTZXNzaW9uQXBwcm92ZVBpY2tlcicsIFwiU2Vzc2lvbiBBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCwgSXNBY3RpdmVTZXNzaW9uUmVtb3RlQWdlbnRIb3N0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuY29uc3QgTkVXX1NFU1NJT05fUEVSTUlTU0lPTl9NT0RFX1BJQ0tFUl9JRCA9ICdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvblBlcm1pc3Npb25Nb2RlUGlja2VyJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfU0VTU0lPTl9QRVJNSVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0TmV3U2Vzc2lvblBlcm1pc3Npb25Nb2RlUGlja2VyJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCwgSXNBY3RpdmVTZXNzaW9uUmVtb3RlQWdlbnRIb3N0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuLy8gLS0tLSBOZXcgc2Vzc2lvbiBDb2RleCBhcHByb3ZhbHMgcGlja2VyIChOZXdTZXNzaW9uQ29udHJvbCkgLS0tLVxuLy8gQ29kZXgtc3BlY2lmaWMgXCJBcHByb3ZhbHNcIiBjaGlwLiBTaGFyZXMgdGhlIE5ld1Nlc3Npb25Db250cm9sIG5hdmlnYXRpb25cbi8vIGdyb3VwIHdpdGggdGhlIENsYXVkZSBwZXJtaXNzaW9uLW1vZGUgcGlja2VyIChvcmRlciAyKTsgdGhlIHR3byBhcmVcbi8vIG11dHVhbGx5IGV4Y2x1c2l2ZSBiZWNhdXNlIGVhY2ggaGlkZXMgaXRzZWxmIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uJ3Ncbi8vIHNjaGVtYSBkb2Vzbid0IGV4cG9zZSBpdHMgYmFja2luZyBwcm9wZXJ0eS5cblxuY29uc3QgTkVXX1NFU1NJT05fQ09ERVhfQVBQUk9WQUxTX1BJQ0tFUl9JRCA9ICdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvbkNvZGV4QXBwcm92YWxzUGlja2VyJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfU0VTU0lPTl9DT0RFWF9BUFBST1ZBTFNfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0TmV3U2Vzc2lvbkNvZGV4QXBwcm92YWxzUGlja2VyJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCwgSXNBY3RpdmVTZXNzaW9uUmVtb3RlQWdlbnRIb3N0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuLy8gLS0tLSBOZXcgc2Vzc2lvbiBtb2RlIHBpY2tlciAoTmV3U2Vzc2lvbkNvbnRyb2wpIC0tLS1cblxuY29uc3QgTkVXX1NFU1NJT05fTU9ERV9QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0Lm5ld1Nlc3Npb25Nb2RlUGlja2VyJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfU0VTU0lPTl9NT0RFX1BJQ0tFUl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50SG9zdE5ld1Nlc3Npb25Nb2RlUGlja2VyJywgXCJBZ2VudCBNb2RlXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLk5ld1Nlc3Npb25Db250cm9sLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Ly8gT24gcGhvbmUgdGhlIHtAbGluayBNb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXJ9IHJlcGxhY2VzXG5cdFx0XHRcdC8vIHRoaXMgcGlja2VyIHdpdGggYSB1bmlmaWVkIG1vZGUgKyBtb2RlbCBib3R0b20gc2hlZXQsIHNvXG5cdFx0XHRcdC8vIGdhdGUgdGhpcyBkZXNrdG9wLW9ubHkgQWN0aW9uIG91dCBvZiBwaG9uZSBsYXlvdXRzLlxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoSXNBY3RpdmVTZXNzaW9uTG9jYWxBZ2VudEhvc3QsIElzQWN0aXZlU2Vzc2lvblJlbW90ZUFnZW50SG9zdCksXG5cdFx0XHRcdFx0SXNQaG9uZUxheW91dENvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cblxuLy8gLS0tLSBSdW5uaW5nIHNlc3Npb24gY29uZmlnIHBpY2tlciAoQ2hhdElucHV0U2Vjb25kYXJ5KSAtLS0tXG5cbmNvbnN0IFJVTk5JTkdfU0VTU0lPTl9DT05GSUdfUElDS0VSX0lEID0gJ3Nlc3Npb25zLmFnZW50SG9zdC5ydW5uaW5nU2Vzc2lvbkNvbmZpZ1BpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUlVOTklOR19TRVNTSU9OX0NPTkZJR19QSUNLRVJfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudEhvc3RSdW5uaW5nU2Vzc2lvbkNvbmZpZ1BpY2tlcicsIFwiU2Vzc2lvbiBBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleUV4cHJzLmlzQWdlbnRIb3N0U2Vzc2lvbixcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuY29uc3QgUlVOTklOR19TRVNTSU9OX1BFUk1JU1NJT05fTU9ERV9QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uUGVybWlzc2lvbk1vZGVQaWNrZXInO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJVTk5JTkdfU0VTU0lPTl9QRVJNSVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0UnVubmluZ1Nlc3Npb25QZXJtaXNzaW9uTW9kZVBpY2tlcicsIFwiQXBwcm92YWxzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlFeHBycy5pc0FnZW50SG9zdFNlc3Npb24sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cbi8vIC0tLS0gUnVubmluZyBzZXNzaW9uIENvZGV4IGFwcHJvdmFscyBwaWNrZXIgKENoYXRJbnB1dFNlY29uZGFyeSkgLS0tLVxuLy8gQ29kZXgtc3BlY2lmaWMgXCJBcHByb3ZhbHNcIiBjaGlwIGZvciBhIHJ1bm5pbmcgc2Vzc2lvbi4gTXV0dWFsbHkgZXhjbHVzaXZlXG4vLyB3aXRoIHRoZSBDbGF1ZGUgcGVybWlzc2lvbi1tb2RlIHBpY2tlciAob3JkZXIgMTEpIFx1MjAxNCBlYWNoIGhpZGVzIHdoZW4gaXRzXG4vLyBiYWNraW5nIHByb3BlcnR5IGlzIGFic2VudCBmcm9tIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHNjaGVtYS5cblxuY29uc3QgUlVOTklOR19TRVNTSU9OX0NPREVYX0FQUFJPVkFMU19QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uQ29kZXhBcHByb3ZhbHNQaWNrZXInO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJVTk5JTkdfU0VTU0lPTl9DT0RFWF9BUFBST1ZBTFNfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0UnVubmluZ1Nlc3Npb25Db2RleEFwcHJvdmFsc1BpY2tlcicsIFwiQXBwcm92YWxzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlFeHBycy5pc0FnZW50SG9zdFNlc3Npb24sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cblxuLy8gLS0tLSBSdW5uaW5nIHNlc3Npb24gbW9kZSBwaWNrZXIgKENoYXRJbnB1dFNlY29uZGFyeSwgYmVmb3JlIGFwcHJvdmFscykgLS0tLVxuXG5jb25zdCBSVU5OSU5HX1NFU1NJT05fTU9ERV9QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uTW9kZVBpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUlVOTklOR19TRVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0UnVubmluZ1Nlc3Npb25Nb2RlUGlja2VyJywgXCJBZ2VudCBNb2RlXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0XHQvLyBIaWRlIHRoZSBhZ2VudCBtb2RlIHBpY2tlciB3aGlsZSBhIGRlbGVnYXRpb24gKGNvbnRpbnVlIGluKSB0YXJnZXQgaXMgcGVuZGluZy5cblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5RXhwcnMuaXNBZ2VudEhvc3RTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXQubmVnYXRlKCkpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzaG93QWN0aXZlU2Vzc2lvbk1vZGVQaWNrZXIoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbi5JRCwgQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFD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
