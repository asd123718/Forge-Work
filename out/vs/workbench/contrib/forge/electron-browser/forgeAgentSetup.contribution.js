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
import "./media/forgeOrchestration.css";
import { $, addDisposableListener, append, EventHelper, isAncestor } from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { AnchorAlignment, AnchorPosition } from "../../../../base/common/layout.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CODEX_MODELS_ROOT_CONFIG_KEY } from "../../../../platform/agentHost/common/codexModelsConfig.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import {
  FORGE_ORCHESTRATION_ASSIGNMENT_KEY,
  FORGE_ORCHESTRATION_REQUEST_KEY,
  orchestrationAgentInfo,
  readAssignment
} from "../../../../platform/agentHost/common/orchestration/orchestrationTypes.js";
import { getReasoningEffortLabel } from "../../../../platform/agentHost/common/reasoningEffort.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { IChatWidgetService, isIChatViewViewContext } from "../../chat/browser/chat.js";
import { IChatSubmitRequestHandlerService } from "../../chat/browser/chatSubmitRequestHandlerService.js";
import { CHAT_CATEGORY } from "../../chat/browser/actions/chatActions.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ILanguageModelsService } from "../../chat/common/languageModels.js";
import { FORGE_WORK_MODE_SETTING_ID, readForgeWorkMode } from "../common/forgeWorkMode.js";
import {
  dispatchForgeRootConfig,
  FORGE_ORCHESTRATION_ASSIGNMENT_SETTING_ID,
  forgeOrchestrationAddressesFromWidget,
  forgeRootConfigValues,
  isForgeAgentHostChatSession,
  readPersistedOrchestrationAssignment
} from "../common/forgeOrchestrationRun.js";
import { trySendDialecticOrchestration } from "../common/forgeOrchestrationSend.js";
import {
  FORGE_AGENT_SETUP_OPEN_ACTION_ID,
  FORGE_AGENT_SETUP_SETTING_ID,
  FORGE_CONTEXT_SIZE_OPTIONS,
  FORGE_LOGOS_AGENT_SETTING_ID,
  FORGE_LOGOS_PICK_AGENT_ACTION_ID,
  FORGE_ORCHESTRATION_AGENTS,
  FORGE_THINKING_LEVELS,
  assignmentWithDialecticProfiles,
  decodeSetupModel,
  findLanguageModelIdentifier,
  getAgentProfile,
  listForgeSetupModels,
  logosAssignment,
  readForgeAgentSetup,
  readLogosAgent,
  selectedSetupModelValue,
  withAgentProfile,
  withCurrentModelOption
} from "../common/forgeAgentSetup.js";
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "forge",
  title: localize("forge.configuration", "Forge"),
  type: "object",
  properties: {
    [FORGE_LOGOS_AGENT_SETTING_ID]: {
      type: "string",
      enum: FORGE_ORCHESTRATION_AGENTS.map((agent) => agent.providerId),
      enumItemLabels: FORGE_ORCHESTRATION_AGENTS.map((agent) => agent.label),
      default: "codex",
      description: localize("forge.logosAgent", "Logos \u6A21\u5F0F\u4E0B\u4F7F\u7528\u7684 Agent\u3002"),
      scope: ConfigurationScope.APPLICATION
    },
    [FORGE_AGENT_SETUP_SETTING_ID]: {
      type: "object",
      additionalProperties: true,
      default: {},
      description: localize("forge.agentSetup", "\u6BCF\u4E2A Agent \u5728 Logos / Dialectic \u4E0B\u4F7F\u7528\u7684\u6A21\u578B\u3001\u601D\u8003\u6DF1\u5EA6\u548C\u4E0A\u4E0B\u6587\u957F\u5EA6\u3002"),
      scope: ConfigurationScope.APPLICATION
    },
    [FORGE_ORCHESTRATION_ASSIGNMENT_SETTING_ID]: {
      type: "object",
      additionalProperties: true,
      description: localize("forge.orchestrationAssignment", "Dialectic \u6A21\u5F0F\u4E0B\u4E0A\u6B21\u6307\u5B9A\u7684 Leader \u548C Worker\u3002"),
      scope: ConfigurationScope.APPLICATION
    }
  }
});
let agentSetupOverlay;
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FORGE_LOGOS_PICK_AGENT_ACTION_ID,
      title: localize2("forge.logos.pickAgent", "\u9009\u62E9 Agent"),
      f1: false,
      category: CHAT_CATEGORY,
      menu: {
        id: MenuId.ChatExecute,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ContextKeyExpr.equals(`config.${FORGE_WORK_MODE_SETTING_ID}`, "logos")
        )
      }
    });
  }
  run() {
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FORGE_AGENT_SETUP_OPEN_ACTION_ID,
      title: localize2("forge.agentSetup.open", "\u914D\u7F6E Agent \u6A21\u578B"),
      f1: true,
      category: CHAT_CATEGORY
    });
  }
  run(_accessor, arg) {
    agentSetupOverlay?.open(arg);
  }
});
let ForgeAgentSetupContribution = class extends Disposable {
  constructor(actionViewItemService, _instantiationService, _chatWidgetService, submitRequestHandlerService, _configurationService, _languageModelsService, _agentHostService, _workspaceContextService, _notificationService) {
    super();
    this._instantiationService = _instantiationService;
    this._chatWidgetService = _chatWidgetService;
    this._configurationService = _configurationService;
    this._languageModelsService = _languageModelsService;
    this._agentHostService = _agentHostService;
    this._workspaceContextService = _workspaceContextService;
    this._notificationService = _notificationService;
    this._boundWidgets = /* @__PURE__ */ new WeakSet();
    agentSetupOverlay = this._instantiationService.createInstance(ForgeAgentSetupOverlay);
    this._register({ dispose: () => {
      if (agentSetupOverlay) {
        agentSetupOverlay.dispose();
        agentSetupOverlay = void 0;
      }
    } });
    this._register(actionViewItemService.register(
      MenuId.ChatExecute,
      FORGE_LOGOS_PICK_AGENT_ACTION_ID,
      (action, _options, inst) => inst.createInstance(ForgeLogosAgentPickerActionViewItem, action)
    ));
    this._register(submitRequestHandlerService.register({
      id: "forge.orchestration.submit",
      tryHandle: async (request) => this._tryHandleSubmit(request.sessionResource.scheme, request.input, this._chatWidgetService.getWidgetBySessionResource(request.sessionResource))
    }));
    for (const widget of this._chatWidgetService.getAllWidgets()) {
      this._bindWidget(widget);
    }
    this._register(this._chatWidgetService.onDidAddWidget((widget) => this._bindWidget(widget)));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FORGE_AGENT_SETUP_SETTING_ID)) {
        this._syncDialecticAssignment();
      }
      if (e.affectsConfiguration(FORGE_AGENT_SETUP_SETTING_ID) || e.affectsConfiguration(FORGE_LOGOS_AGENT_SETTING_ID) || e.affectsConfiguration(FORGE_WORK_MODE_SETTING_ID)) {
        this._applyLogosSession(this._chatWidgetService);
      }
    }));
    this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._applyLogosSession(this._chatWidgetService)));
    this._applyLogosSession(this._chatWidgetService);
  }
  _bindWidget(widget) {
    if (this._boundWidgets.has(widget)) {
      return;
    }
    this._boundWidgets.add(widget);
    const original = widget.acceptInput.bind(widget);
    const wrapped = async (query, options) => {
      if (this._handleForgeSend(widget, typeof query === "string" ? query : void 0)) {
        return void 0;
      }
      return original(query, options);
    };
    widget.acceptInput = wrapped;
    this._register({ dispose: () => {
      widget.acceptInput = original;
    } });
  }
  _handleForgeSend(widget, query) {
    const sessionScheme = widget.viewModel?.sessionResource.scheme;
    if (!isForgeAgentHostChatSession(sessionScheme)) {
      return false;
    }
    const intercept = this._interceptedWorkMode();
    if (!intercept) {
      return false;
    }
    const goal = (query ?? widget.getInput()).trim();
    if (intercept === "logos") {
      void this._runLogosAgent(widget, goal);
      return true;
    }
    trySendDialecticOrchestration({
      widget,
      goal,
      workspacePath: this._workspaceContextService.getWorkspace().folders[0]?.uri.fsPath ?? "",
      agentHostService: this._agentHostService,
      configurationService: this._configurationService,
      setup: readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID)),
      instantiationService: this._instantiationService,
      notificationService: this._notificationService
    });
    return true;
  }
  _tryHandleSubmit(sessionScheme, goal, widget) {
    if (!widget || !isForgeAgentHostChatSession(sessionScheme)) {
      return false;
    }
    return this._handleForgeSend(widget, goal);
  }
  _interceptedWorkMode() {
    const mode = readForgeWorkMode(this._configurationService.getValue(FORGE_WORK_MODE_SETTING_ID));
    if (mode === "dialectic") {
      return "dialectic";
    }
    if (mode === "logos" && readLogosAgent(this._configurationService.getValue(FORGE_LOGOS_AGENT_SETTING_ID)) !== "codex") {
      return "logos";
    }
    return void 0;
  }
  async _runLogosAgent(widget, goal) {
    if (!goal) {
      this._notificationService.info(localize("forge.logos.needGoal", "\u5148\u8F93\u5165\u9700\u6C42\uFF0C\u518D\u53D1\u9001\u3002"));
      return;
    }
    const workspace = this._workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
    if (!workspace) {
      this._notificationService.error(localize("forge.orchestration.noFolder", "\u5148\u6253\u5F00\u4E00\u4E2A\u5DE5\u4F5C\u533A\u6587\u4EF6\u5939\u3002"));
      return;
    }
    const setup = readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID));
    const assignment = logosAssignment(readLogosAgent(this._configurationService.getValue(FORGE_LOGOS_AGENT_SETTING_ID)), setup);
    const addresses = forgeOrchestrationAddressesFromWidget(widget);
    const request = {
      requestId: generateUuid(),
      goal,
      workspace,
      mode: "logos",
      assignment,
      ...addresses
    };
    widget.setInput("");
    dispatchForgeRootConfig(this._agentHostService, { [FORGE_ORCHESTRATION_REQUEST_KEY]: request });
  }
  _syncDialecticAssignment() {
    const current = readAssignment(forgeRootConfigValues(this._agentHostService)[FORGE_ORCHESTRATION_ASSIGNMENT_KEY]) ?? readPersistedOrchestrationAssignment(this._configurationService);
    if (!current) {
      return;
    }
    const setup = readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID));
    dispatchForgeRootConfig(this._agentHostService, {
      [FORGE_ORCHESTRATION_ASSIGNMENT_KEY]: assignmentWithDialecticProfiles(current, setup)
    });
  }
  _applyLogosSession(chatWidgetService) {
    if (readForgeWorkMode(this._configurationService.getValue(FORGE_WORK_MODE_SETTING_ID)) !== "logos") {
      return;
    }
    if (readLogosAgent(this._configurationService.getValue(FORGE_LOGOS_AGENT_SETTING_ID)) !== "codex") {
      return;
    }
    const setup = readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID));
    const profile = getAgentProfile(setup, "logos", "codex");
    const identifier = findLanguageModelIdentifier(this._languageModelsService.getLanguageModelIds(), profile.modelProviderId, profile.model);
    if (!identifier) {
      return;
    }
    for (const widget of chatWidgetService.getAllWidgets()) {
      if (!isIChatViewViewContext(widget.viewContext)) {
        continue;
      }
      void widget.input.requestModelByIdentifier(identifier);
      const values = {};
      if (profile.thinkingLevel) {
        values.thinkingLevel = profile.thinkingLevel;
      }
      if (profile.contextSize && profile.contextSize !== "default") {
        const tokens = Number(profile.contextSize);
        values.contextSize = Number.isFinite(tokens) ? tokens : profile.contextSize;
      }
      if (Object.keys(values).length) {
        void widget.input.setModelConfiguration(identifier, values);
      }
    }
  }
};
ForgeAgentSetupContribution.ID = "workbench.contrib.forgeAgentSetup";
ForgeAgentSetupContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, IChatSubmitRequestHandlerService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILanguageModelsService),
  __decorateParam(6, IAgentHostService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, INotificationService)
], ForgeAgentSetupContribution);
let ForgeAgentSetupOverlay = class extends Disposable {
  constructor(_contextViewService, _configurationService, _agentHostService, _chatWidgetService) {
    super();
    this._contextViewService = _contextViewService;
    this._configurationService = _configurationService;
    this._agentHostService = _agentHostService;
    this._chatWidgetService = _chatWidgetService;
  }
  open(arg) {
    this.close();
    const anchor = arg?.anchor ?? this._chatWidgetService.lastFocusedWidget?.inputPart.element ?? this._chatWidgetService.lastFocusedWidget?.domNode;
    if (!anchor) {
      return;
    }
    this._openView = this._contextViewService.showContextView({
      getAnchor: () => anchor,
      anchorAlignment: AnchorAlignment.LEFT,
      anchorPosition: AnchorPosition.ABOVE,
      render: (container) => this._render(container, arg?.tab ?? "logos"),
      onDOMEvent: (e) => this._onEvent(e),
      onHide: () => {
        this._openView = void 0;
      }
    });
  }
  close() {
    this._openView?.close();
    this._openView = void 0;
  }
  _onEvent(e) {
    if (e.type === "keydown" && e.key === "Escape") {
      this.close();
      return;
    }
    if (e.type !== "click") {
      return;
    }
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest("select, option, optgroup")) {
      return;
    }
    if (isAncestor(target, this._contextViewService.getContextViewElement())) {
      return;
    }
    this.close();
  }
  _render(container, focusColumn) {
    const store = new DisposableStore();
    const root = append(container, $("div.forge-agent-setup"));
    const titleId = `forge-agent-setup-title-${generateUuid()}`;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    root.setAttribute("aria-labelledby", titleId);
    const header = append(root, $("div.forge-agent-setup-head"));
    const title = append(header, $("div.forge-agent-setup-title", void 0, localize("forge.agentSetup.title", "Agent \u914D\u7F6E")));
    title.id = titleId;
    const close = append(header, $("button.forge-agent-setup-close", { type: "button" }));
    close.setAttribute("aria-label", localize("forge.agentSetup.close", "\u5173\u95ED"));
    close.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
    store.add(addDisposableListener(close, "click", () => this.close()));
    append(root, $("div.forge-agent-setup-hint", void 0, localize("forge.agentSetup.hint", "\u6A21\u578B\u4E0E\u4F9B\u5E94\u5546\u6765\u81EA\u8BBE\u7F6E\u4E2D\u7684 Models\u3002\u8FD9\u91CC\u53EA\u7ED9\u6BCF\u4E2A Agent \u9009\u8981\u7528\u54EA\u4E00\u4E2A\uFF0C\u4EE5\u53CA\u601D\u8003\u6DF1\u5EA6\u548C\u4E0A\u4E0B\u6587\u957F\u5EA6\u3002")));
    const grid = append(root, $("div.forge-agent-setup-grid"));
    this._column(store, grid, "logos", localize("forge.agentSetup.logos", "Logos"), focusColumn === "logos");
    this._column(store, grid, "dialectic", localize("forge.agentSetup.dialectic", "Dialectic"), focusColumn === "dialectic");
    queueMicrotask(() => close.focus());
    return store;
  }
  _column(store, parent, column, title, focused) {
    const pane = append(parent, $("div.forge-agent-setup-col"));
    pane.classList.toggle("focused", focused);
    append(pane, $("div.forge-agent-setup-col-title", void 0, title));
    const setup = this._setup();
    const models = listForgeSetupModels(forgeRootConfigValues(this._agentHostService)[CODEX_MODELS_ROOT_CONFIG_KEY]);
    if (models.length === 0) {
      append(pane, $("div.forge-agent-setup-empty", void 0, localize("forge.agentSetup.noModels", "\u8FD8\u6CA1\u6709\u542F\u7528\u7684\u6A21\u578B\u3002\u8BF7\u5148\u5728 Models \u8BBE\u7F6E\u91CC\u542F\u7528\u4F9B\u5E94\u5546\u548C\u6A21\u578B\u3002")));
    }
    for (const agent of FORGE_ORCHESTRATION_AGENTS) {
      this._agentCard(store, pane, column, agent.providerId, agent.label, setup, models);
    }
  }
  _agentCard(store, parent, column, providerId, label, setup, models) {
    const profile = getAgentProfile(setup, column, providerId);
    const options = withCurrentModelOption(models, profile);
    const card = append(parent, $("div.forge-agent-setup-card"));
    append(card, $("div.forge-agent-setup-agent", void 0, label));
    this._select(store, card, localize("forge.agentSetup.model", "\u6A21\u578B"), selectedSetupModelValue(profile, options), options.map((option) => ({ value: option.value, label: `${option.providerName} / ${option.model}` })), (value) => {
      const decoded = decodeSetupModel(value);
      void this._patch(column, providerId, decoded ? { modelProviderId: decoded.providerId, model: decoded.model } : { model: value });
    });
    this._select(store, card, localize("forge.agentSetup.thinking", "\u601D\u8003\u6DF1\u5EA6"), profile.thinkingLevel ?? "medium", FORGE_THINKING_LEVELS.map((level) => ({ value: level, label: getReasoningEffortLabel(level) })), (value) => {
      void this._patch(column, providerId, { thinkingLevel: value });
    });
    this._select(store, card, localize("forge.agentSetup.context", "\u4E0A\u4E0B\u6587\u957F\u5EA6"), profile.contextSize ?? "default", FORGE_CONTEXT_SIZE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.value === "default" ? localize("forge.agentSetup.contextDefault", "\u9ED8\u8BA4") : option.label
    })), (value) => {
      void this._patch(column, providerId, { contextSize: value });
    });
  }
  _select(store, parent, label, value, options, onChange) {
    const row = append(parent, $("label.forge-agent-setup-field"));
    append(row, $("span.forge-agent-setup-field-label", void 0, label));
    const select = append(row, $("select.forge-agent-setup-select"));
    for (const option of options) {
      const node = append(select, $("option"));
      node.value = option.value;
      node.textContent = option.label;
    }
    if (value && !options.some((option) => option.value === value)) {
      const extra = append(select, $("option"));
      extra.value = value;
      extra.textContent = value;
    }
    select.value = value;
    store.add(addDisposableListener(select, "change", () => onChange(select.value)));
  }
  async _patch(column, providerId, patch) {
    const next = withAgentProfile(this._setup(), column, providerId, patch);
    await this._configurationService.updateValue(FORGE_AGENT_SETUP_SETTING_ID, next, ConfigurationTarget.USER);
  }
  _setup() {
    return readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID));
  }
};
ForgeAgentSetupOverlay = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IAgentHostService),
  __decorateParam(3, IChatWidgetService)
], ForgeAgentSetupOverlay);
let ForgeLogosAgentPickerActionViewItem = class extends BaseActionViewItem {
  constructor(action, _configurationService, _contextViewService) {
    super(void 0, action);
    this._configurationService = _configurationService;
    this._contextViewService = _contextViewService;
    this._lastToggle = 0;
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FORGE_LOGOS_AGENT_SETTING_ID) || e.affectsConfiguration(FORGE_AGENT_SETUP_SETTING_ID)) {
        this._renderLabel();
      }
    }));
    this._register({ dispose: () => this._close() });
  }
  render(container) {
    super.render(container);
    container.classList.add("forge-logos-agent-item", "chat-input-picker-item");
    const root = append(container, $("div.action-label.forge-logos-agent"));
    root.setAttribute("role", "button");
    root.setAttribute("aria-haspopup", "listbox");
    this._label = append(root, $("span.forge-logos-agent-label"));
    const chevron = append(root, $("span"));
    chevron.className = ThemeIcon.asClassName(Codicon.chevronUp);
    this._renderLabel();
  }
  onClick(event) {
    EventHelper.stop(event, true);
    this._toggle();
  }
  _toggle() {
    const now = Date.now();
    if (now - this._lastToggle < 250) {
      return;
    }
    this._lastToggle = now;
    if (this._openView) {
      this._close();
      return;
    }
    this._show();
  }
  _close() {
    this._openView?.close();
    this._openView = void 0;
    this._renderLabel();
  }
  _show() {
    const anchor = this.element;
    if (!anchor) {
      return;
    }
    this._openView = this._contextViewService.showContextView({
      getAnchor: () => anchor,
      anchorAlignment: AnchorAlignment.RIGHT,
      anchorPosition: AnchorPosition.ABOVE,
      render: (container) => this._renderPicker(container),
      onDOMEvent: (e) => this._onPickerEvent(e),
      onHide: () => {
        this._openView = void 0;
        this._renderLabel();
      }
    });
    this._renderLabel();
  }
  _onPickerEvent(e) {
    if (e.type === "keydown" && e.key === "Escape") {
      this._close();
      return;
    }
    if (e.type !== "click" && e.type !== "mousedown") {
      return;
    }
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (this.element && isAncestor(target, this.element)) {
      return;
    }
    if (isAncestor(target, this._contextViewService.getContextViewElement())) {
      return;
    }
    this._close();
  }
  _renderLabel() {
    if (!this._label) {
      return;
    }
    const agentId = readLogosAgent(this._configurationService.getValue(FORGE_LOGOS_AGENT_SETTING_ID));
    const agent = orchestrationAgentInfo(agentId);
    const profile = getAgentProfile(readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID)), "logos", agentId);
    this._label.textContent = agent?.label ?? agentId;
    const trigger = this.element?.querySelector(".forge-logos-agent");
    trigger?.setAttribute("aria-expanded", this._openView ? "true" : "false");
    trigger?.setAttribute("aria-label", localize("forge.logos.agentAria", "Agent\uFF0C{0}\uFF0C{1}", agent?.label ?? agentId, profile.model ?? ""));
  }
  _renderPicker(container) {
    const store = new DisposableStore();
    const picker = append(container, $("div.forge-agent-picker"));
    picker.setAttribute("role", "listbox");
    const head = append(picker, $("div.forge-agent-picker-head"));
    append(head, $("div.forge-orch-picker-title", void 0, localize("forge.logos.pickAgentTitle", "\u9009\u62E9 Agent")));
    const gear = append(head, $("button.forge-agent-picker-setup", { type: "button" }));
    gear.setAttribute("aria-label", localize("forge.agentSetup.open", "\u914D\u7F6E Agent \u6A21\u578B"));
    gear.classList.add(...ThemeIcon.asClassNameArray(Codicon.gear));
    store.add(addDisposableListener(gear, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._close();
      agentSetupOverlay?.open({ tab: "logos", anchor: this.element });
    }));
    const list = append(picker, $("div.forge-orch-choices"));
    const selected = readLogosAgent(this._configurationService.getValue(FORGE_LOGOS_AGENT_SETTING_ID));
    const setup = readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID));
    for (const agent of FORGE_ORCHESTRATION_AGENTS) {
      const profile = getAgentProfile(setup, "logos", agent.providerId);
      const button = append(list, $("button.forge-orch-choice", { type: "button" }));
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", selected === agent.providerId ? "true" : "false");
      button.classList.toggle("selected", selected === agent.providerId);
      append(button, $("span.forge-orch-choice-mark"));
      append(button, $("span.forge-orch-choice-label", void 0, agent.label));
      append(button, $("span.forge-orch-choice-model", void 0, profile.model ?? agent.defaultModel));
      store.add(addDisposableListener(button, "click", () => {
        void this._configurationService.updateValue(FORGE_LOGOS_AGENT_SETTING_ID, agent.providerId, ConfigurationTarget.USER);
        this._close();
      }));
    }
    return store;
  }
};
ForgeLogosAgentPickerActionViewItem = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextViewService)
], ForgeLogosAgentPickerActionViewItem);
registerWorkbenchContribution2(ForgeAgentSetupContribution.ID, ForgeAgentSetupContribution, WorkbenchPhase.AfterRestored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcmdlXFxlbGVjdHJvbi1icm93c2VyXFxmb3JnZUFnZW50U2V0dXAuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbmltcG9ydCAnLi9tZWRpYS9mb3JnZU9yY2hlc3RyYXRpb24uY3NzJztcclxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIEV2ZW50SGVscGVyLCBpc0FuY2VzdG9yLCB0eXBlIEV2ZW50TGlrZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xyXG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XHJcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcclxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcclxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcclxuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XHJcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XHJcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xyXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcclxuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xyXG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xyXG5pbXBvcnQgeyBDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jb2RleE1vZGVsc0NvbmZpZy5qcyc7XHJcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xyXG5pbXBvcnQge1xyXG5cdEZPUkdFX09SQ0hFU1RSQVRJT05fQVNTSUdOTUVOVF9LRVksXHJcblx0Rk9SR0VfT1JDSEVTVFJBVElPTl9SRVFVRVNUX0tFWSxcclxuXHRvcmNoZXN0cmF0aW9uQWdlbnRJbmZvLFxyXG5cdHJlYWRBc3NpZ25tZW50LFxyXG5cdHR5cGUgSU9yY2hlc3RyYXRpb25SZXF1ZXN0LFxyXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vb3JjaGVzdHJhdGlvbi9vcmNoZXN0cmF0aW9uVHlwZXMuanMnO1xyXG5pbXBvcnQgeyBnZXRSZWFzb25pbmdFZmZvcnRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcclxuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcclxuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XHJcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XHJcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UsIHR5cGUgSU9wZW5Db250ZXh0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xyXG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcclxuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XHJcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcclxuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xyXG5pbXBvcnQgeyByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xyXG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBpc0lDaGF0Vmlld1ZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xyXG5pbXBvcnQgeyBJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLmpzJztcclxuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcclxuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xyXG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xyXG5pbXBvcnQgeyBGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCwgcmVhZEZvcmdlV29ya01vZGUgfSBmcm9tICcuLi9jb21tb24vZm9yZ2VXb3JrTW9kZS5qcyc7XHJcbmltcG9ydCB7XHJcblx0ZGlzcGF0Y2hGb3JnZVJvb3RDb25maWcsXHJcblx0Rk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UX1NFVFRJTkdfSUQsXHJcblx0Zm9yZ2VPcmNoZXN0cmF0aW9uQWRkcmVzc2VzRnJvbVdpZGdldCxcclxuXHRmb3JnZVJvb3RDb25maWdWYWx1ZXMsXHJcblx0aXNGb3JnZUFnZW50SG9zdENoYXRTZXNzaW9uLFxyXG5cdHJlYWRQZXJzaXN0ZWRPcmNoZXN0cmF0aW9uQXNzaWdubWVudCxcclxufSBmcm9tICcuLi9jb21tb24vZm9yZ2VPcmNoZXN0cmF0aW9uUnVuLmpzJztcclxuaW1wb3J0IHsgdHJ5U2VuZERpYWxlY3RpY09yY2hlc3RyYXRpb24gfSBmcm9tICcuLi9jb21tb24vZm9yZ2VPcmNoZXN0cmF0aW9uU2VuZC5qcyc7XHJcbmltcG9ydCB7XHJcblx0Rk9SR0VfQUdFTlRfU0VUVVBfT1BFTl9BQ1RJT05fSUQsXHJcblx0Rk9SR0VfQUdFTlRfU0VUVVBfU0VUVElOR19JRCxcclxuXHRGT1JHRV9DT05URVhUX1NJWkVfT1BUSU9OUyxcclxuXHRGT1JHRV9MT0dPU19BR0VOVF9TRVRUSU5HX0lELFxyXG5cdEZPUkdFX0xPR09TX1BJQ0tfQUdFTlRfQUNUSU9OX0lELFxyXG5cdEZPUkdFX09SQ0hFU1RSQVRJT05fQUdFTlRTLFxyXG5cdEZPUkdFX1RISU5LSU5HX0xFVkVMUyxcclxuXHRhc3NpZ25tZW50V2l0aERpYWxlY3RpY1Byb2ZpbGVzLFxyXG5cdGRlY29kZVNldHVwTW9kZWwsXHJcblx0ZmluZExhbmd1YWdlTW9kZWxJZGVudGlmaWVyLFxyXG5cdGdldEFnZW50UHJvZmlsZSxcclxuXHRsaXN0Rm9yZ2VTZXR1cE1vZGVscyxcclxuXHRsb2dvc0Fzc2lnbm1lbnQsXHJcblx0cmVhZEZvcmdlQWdlbnRTZXR1cCxcclxuXHRyZWFkTG9nb3NBZ2VudCxcclxuXHRzZWxlY3RlZFNldHVwTW9kZWxWYWx1ZSxcclxuXHR3aXRoQWdlbnRQcm9maWxlLFxyXG5cdHdpdGhDdXJyZW50TW9kZWxPcHRpb24sXHJcblx0dHlwZSBGb3JnZUFnZW50Q29sdW1uLFxyXG5cdHR5cGUgSUZvcmdlQWdlbnRQcm9maWxlLFxyXG5cdHR5cGUgSUZvcmdlU2V0dXBNb2RlbE9wdGlvbixcclxufSBmcm9tICcuLi9jb21tb24vZm9yZ2VBZ2VudFNldHVwLmpzJztcclxuXHJcblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XHJcblx0aWQ6ICdmb3JnZScsXHJcblx0dGl0bGU6IGxvY2FsaXplKCdmb3JnZS5jb25maWd1cmF0aW9uJywgXCJGb3JnZVwiKSxcclxuXHR0eXBlOiAnb2JqZWN0JyxcclxuXHRwcm9wZXJ0aWVzOiB7XHJcblx0XHRbRk9SR0VfTE9HT1NfQUdFTlRfU0VUVElOR19JRF06IHtcclxuXHRcdFx0dHlwZTogJ3N0cmluZycsXHJcblx0XHRcdGVudW06IEZPUkdFX09SQ0hFU1RSQVRJT05fQUdFTlRTLm1hcChhZ2VudCA9PiBhZ2VudC5wcm92aWRlcklkKSxcclxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IEZPUkdFX09SQ0hFU1RSQVRJT05fQUdFTlRTLm1hcChhZ2VudCA9PiBhZ2VudC5sYWJlbCksXHJcblx0XHRcdGRlZmF1bHQ6ICdjb2RleCcsXHJcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZm9yZ2UubG9nb3NBZ2VudCcsIFwiTG9nb3MgXHU2QTIxXHU1RjBGXHU0RTBCXHU0RjdGXHU3NTI4XHU3Njg0IEFnZW50XHUzMDAyXCIpLFxyXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxyXG5cdFx0fSxcclxuXHRcdFtGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lEXToge1xyXG5cdFx0XHR0eXBlOiAnb2JqZWN0JyxcclxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXHJcblx0XHRcdGRlZmF1bHQ6IHt9LFxyXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZvcmdlLmFnZW50U2V0dXAnLCBcIlx1NkJDRlx1NEUyQSBBZ2VudCBcdTU3MjggTG9nb3MgLyBEaWFsZWN0aWMgXHU0RTBCXHU0RjdGXHU3NTI4XHU3Njg0XHU2QTIxXHU1NzhCXHUzMDAxXHU2MDFEXHU4MDAzXHU2REYxXHU1RUE2XHU1NDhDXHU0RTBBXHU0RTBCXHU2NTg3XHU5NTdGXHU1RUE2XHUzMDAyXCIpLFxyXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxyXG5cdFx0fSxcclxuXHRcdFtGT1JHRV9PUkNIRVNUUkFUSU9OX0FTU0lHTk1FTlRfU0VUVElOR19JRF06IHtcclxuXHRcdFx0dHlwZTogJ29iamVjdCcsXHJcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxyXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb25Bc3NpZ25tZW50JywgXCJEaWFsZWN0aWMgXHU2QTIxXHU1RjBGXHU0RTBCXHU0RTBBXHU2QjIxXHU2MzA3XHU1QjlBXHU3Njg0IExlYWRlciBcdTU0OEMgV29ya2VyXHUzMDAyXCIpLFxyXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxyXG5cdFx0fSxcclxuXHR9LFxyXG59KTtcclxuXHJcbmxldCBhZ2VudFNldHVwT3ZlcmxheTogRm9yZ2VBZ2VudFNldHVwT3ZlcmxheSB8IHVuZGVmaW5lZDtcclxuXHJcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoe1xyXG5cdFx0XHRpZDogRk9SR0VfTE9HT1NfUElDS19BR0VOVF9BQ1RJT05fSUQsXHJcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvcmdlLmxvZ29zLnBpY2tBZ2VudCcsIFwiXHU5MDA5XHU2MkU5IEFnZW50XCIpLFxyXG5cdFx0XHRmMTogZmFsc2UsXHJcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxyXG5cdFx0XHRtZW51OiB7XHJcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcclxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxyXG5cdFx0XHRcdG9yZGVyOiAyLFxyXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcclxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxyXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRH1gLCAnbG9nb3MnKSxcclxuXHRcdFx0XHQpLFxyXG5cdFx0XHR9LFxyXG5cdFx0fSk7XHJcblx0fVxyXG5cdHJ1bigpOiB2b2lkIHsgfVxyXG59KTtcclxuXHJcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoe1xyXG5cdFx0XHRpZDogRk9SR0VfQUdFTlRfU0VUVVBfT1BFTl9BQ1RJT05fSUQsXHJcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvcmdlLmFnZW50U2V0dXAub3BlbicsIFwiXHU5MTREXHU3RjZFIEFnZW50IFx1NkEyMVx1NTc4QlwiKSxcclxuXHRcdFx0ZjE6IHRydWUsXHJcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxyXG5cdFx0fSk7XHJcblx0fVxyXG5cdHJ1bihfYWNjZXNzb3I6IHVua25vd24sIGFyZz86IHsgdGFiPzogRm9yZ2VBZ2VudENvbHVtbjsgYW5jaG9yPzogSFRNTEVsZW1lbnQgfSk6IHZvaWQge1xyXG5cdFx0YWdlbnRTZXR1cE92ZXJsYXk/Lm9wZW4oYXJnKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuY2xhc3MgRm9yZ2VBZ2VudFNldHVwQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XHJcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmZvcmdlQWdlbnRTZXR1cCc7XHJcblxyXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JvdW5kV2lkZ2V0cyA9IG5ldyBXZWFrU2V0PElDaGF0V2lkZ2V0PigpO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcclxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcclxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcclxuXHRcdEBJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSBzdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2U6IElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLFxyXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxyXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxyXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxyXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxyXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxyXG5cdCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdGFnZW50U2V0dXBPdmVybGF5ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9yZ2VBZ2VudFNldHVwT3ZlcmxheSk7XHJcblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHsgaWYgKGFnZW50U2V0dXBPdmVybGF5KSB7IGFnZW50U2V0dXBPdmVybGF5LmRpc3Bvc2UoKTsgYWdlbnRTZXR1cE92ZXJsYXkgPSB1bmRlZmluZWQ7IH0gfSB9KTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihcclxuXHRcdFx0TWVudUlkLkNoYXRFeGVjdXRlLFxyXG5cdFx0XHRGT1JHRV9MT0dPU19QSUNLX0FHRU5UX0FDVElPTl9JRCxcclxuXHRcdFx0KGFjdGlvbiwgX29wdGlvbnMsIGluc3QpID0+IGluc3QuY3JlYXRlSW5zdGFuY2UoRm9yZ2VMb2dvc0FnZW50UGlja2VyQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiksXHJcblx0XHQpKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS5yZWdpc3Rlcih7XHJcblx0XHRcdGlkOiAnZm9yZ2Uub3JjaGVzdHJhdGlvbi5zdWJtaXQnLFxyXG5cdFx0XHR0cnlIYW5kbGU6IGFzeW5jIHJlcXVlc3QgPT4gdGhpcy5fdHJ5SGFuZGxlU3VibWl0KHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLnNjaGVtZSwgcmVxdWVzdC5pbnB1dCwgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpKSxcclxuXHRcdH0pKTtcclxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKSkge1xyXG5cdFx0XHR0aGlzLl9iaW5kV2lkZ2V0KHdpZGdldCk7XHJcblx0XHR9XHJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldCh3aWRnZXQgPT4gdGhpcy5fYmluZFdpZGdldCh3aWRnZXQpKSk7XHJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XHJcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEZPUkdFX0FHRU5UX1NFVFVQX1NFVFRJTkdfSUQpKSB7XHJcblx0XHRcdFx0dGhpcy5fc3luY0RpYWxlY3RpY0Fzc2lnbm1lbnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lEKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKEZPUkdFX0xPR09TX0FHRU5UX1NFVFRJTkdfSUQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRk9SR0VfV09SS19NT0RFX1NFVFRJTkdfSUQpKSB7XHJcblx0XHRcdFx0dGhpcy5fYXBwbHlMb2dvc1Nlc3Npb24odGhpcy5fY2hhdFdpZGdldFNlcnZpY2UpO1xyXG5cdFx0XHR9XHJcblx0XHR9KSk7XHJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB0aGlzLl9hcHBseUxvZ29zU2Vzc2lvbih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSkpKTtcclxuXHRcdHRoaXMuX2FwcGx5TG9nb3NTZXNzaW9uKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2JpbmRXaWRnZXQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IHZvaWQge1xyXG5cdFx0aWYgKHRoaXMuX2JvdW5kV2lkZ2V0cy5oYXMod2lkZ2V0KSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9ib3VuZFdpZGdldHMuYWRkKHdpZGdldCk7XHJcblx0XHRjb25zdCBvcmlnaW5hbCA9IHdpZGdldC5hY2NlcHRJbnB1dC5iaW5kKHdpZGdldCk7XHJcblx0XHRjb25zdCB3cmFwcGVkOiBJQ2hhdFdpZGdldFsnYWNjZXB0SW5wdXQnXSA9IGFzeW5jIChxdWVyeSwgb3B0aW9ucykgPT4ge1xyXG5cdFx0XHRpZiAodGhpcy5faGFuZGxlRm9yZ2VTZW5kKHdpZGdldCwgdHlwZW9mIHF1ZXJ5ID09PSAnc3RyaW5nJyA/IHF1ZXJ5IDogdW5kZWZpbmVkKSkge1xyXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIG9yaWdpbmFsKHF1ZXJ5LCBvcHRpb25zKTtcclxuXHRcdH07XHJcblx0XHQod2lkZ2V0IGFzIHVua25vd24gYXMgeyBhY2NlcHRJbnB1dDogSUNoYXRXaWRnZXRbJ2FjY2VwdElucHV0J10gfSkuYWNjZXB0SW5wdXQgPSB3cmFwcGVkO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiB7ICh3aWRnZXQgYXMgdW5rbm93biBhcyB7IGFjY2VwdElucHV0OiBJQ2hhdFdpZGdldFsnYWNjZXB0SW5wdXQnXSB9KS5hY2NlcHRJbnB1dCA9IG9yaWdpbmFsOyB9IH0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfaGFuZGxlRm9yZ2VTZW5kKHdpZGdldDogSUNoYXRXaWRnZXQsIHF1ZXJ5Pzogc3RyaW5nKTogYm9vbGVhbiB7XHJcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlLnNjaGVtZTtcclxuXHRcdGlmICghaXNGb3JnZUFnZW50SG9zdENoYXRTZXNzaW9uKHNlc3Npb25TY2hlbWUpKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IGludGVyY2VwdCA9IHRoaXMuX2ludGVyY2VwdGVkV29ya01vZGUoKTtcclxuXHRcdGlmICghaW50ZXJjZXB0KSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IGdvYWwgPSAocXVlcnkgPz8gd2lkZ2V0LmdldElucHV0KCkpLnRyaW0oKTtcclxuXHRcdGlmIChpbnRlcmNlcHQgPT09ICdsb2dvcycpIHtcclxuXHRcdFx0dm9pZCB0aGlzLl9ydW5Mb2dvc0FnZW50KHdpZGdldCwgZ29hbCk7XHJcblx0XHRcdHJldHVybiB0cnVlO1xyXG5cdFx0fVxyXG5cdFx0dHJ5U2VuZERpYWxlY3RpY09yY2hlc3RyYXRpb24oe1xyXG5cdFx0XHR3aWRnZXQsXHJcblx0XHRcdGdvYWwsXHJcblx0XHRcdHdvcmtzcGFjZVBhdGg6IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0/LnVyaS5mc1BhdGggPz8gJycsXHJcblx0XHRcdGFnZW50SG9zdFNlcnZpY2U6IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsXHJcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdFx0c2V0dXA6IHJlYWRGb3JnZUFnZW50U2V0dXAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfQUdFTlRfU0VUVVBfU0VUVElOR19JRCkpLFxyXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXHJcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UsXHJcblx0XHR9KTtcclxuXHRcdHJldHVybiB0cnVlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfdHJ5SGFuZGxlU3VibWl0KHNlc3Npb25TY2hlbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZ29hbDogc3RyaW5nLCB3aWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XHJcblx0XHRpZiAoIXdpZGdldCB8fCAhaXNGb3JnZUFnZW50SG9zdENoYXRTZXNzaW9uKHNlc3Npb25TY2hlbWUpKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzLl9oYW5kbGVGb3JnZVNlbmQod2lkZ2V0LCBnb2FsKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2ludGVyY2VwdGVkV29ya01vZGUoKTogJ2xvZ29zJyB8ICdkaWFsZWN0aWMnIHwgdW5kZWZpbmVkIHtcclxuXHRcdGNvbnN0IG1vZGUgPSByZWFkRm9yZ2VXb3JrTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCkpO1xyXG5cdFx0aWYgKG1vZGUgPT09ICdkaWFsZWN0aWMnKSB7XHJcblx0XHRcdHJldHVybiAnZGlhbGVjdGljJztcclxuXHRcdH1cclxuXHRcdGlmIChtb2RlID09PSAnbG9nb3MnICYmIHJlYWRMb2dvc0FnZW50KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEZPUkdFX0xPR09TX0FHRU5UX1NFVFRJTkdfSUQpKSAhPT0gJ2NvZGV4Jykge1xyXG5cdFx0XHRyZXR1cm4gJ2xvZ29zJztcclxuXHRcdH1cclxuXHRcdHJldHVybiB1bmRlZmluZWQ7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFzeW5jIF9ydW5Mb2dvc0FnZW50KHdpZGdldDogSUNoYXRXaWRnZXQsIGdvYWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0aWYgKCFnb2FsKSB7XHJcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnZm9yZ2UubG9nb3MubmVlZEdvYWwnLCBcIlx1NTE0OFx1OEY5M1x1NTE2NVx1OTcwMFx1NkM0Mlx1RkYwQ1x1NTE4RFx1NTNEMVx1OTAwMVx1MzAwMlwiKSk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0/LnVyaS5mc1BhdGg7XHJcblx0XHRpZiAoIXdvcmtzcGFjZSkge1xyXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLm5vRm9sZGVyJywgXCJcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdTVERTVcdTRGNUNcdTUzM0FcdTY1ODdcdTRFRjZcdTU5MzlcdTMwMDJcIikpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRjb25zdCBzZXR1cCA9IHJlYWRGb3JnZUFnZW50U2V0dXAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfQUdFTlRfU0VUVVBfU0VUVElOR19JRCkpO1xyXG5cdFx0Y29uc3QgYXNzaWdubWVudCA9IGxvZ29zQXNzaWdubWVudChyZWFkTG9nb3NBZ2VudCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9MT0dPU19BR0VOVF9TRVRUSU5HX0lEKSksIHNldHVwKTtcclxuXHRcdGNvbnN0IGFkZHJlc3NlcyA9IGZvcmdlT3JjaGVzdHJhdGlvbkFkZHJlc3Nlc0Zyb21XaWRnZXQod2lkZ2V0KTtcclxuXHRcdGNvbnN0IHJlcXVlc3Q6IElPcmNoZXN0cmF0aW9uUmVxdWVzdCA9IHtcclxuXHRcdFx0cmVxdWVzdElkOiBnZW5lcmF0ZVV1aWQoKSxcclxuXHRcdFx0Z29hbCxcclxuXHRcdFx0d29ya3NwYWNlLFxyXG5cdFx0XHRtb2RlOiAnbG9nb3MnLFxyXG5cdFx0XHRhc3NpZ25tZW50LFxyXG5cdFx0XHQuLi5hZGRyZXNzZXMsXHJcblx0XHR9O1xyXG5cdFx0d2lkZ2V0LnNldElucHV0KCcnKTtcclxuXHRcdGRpc3BhdGNoRm9yZ2VSb290Q29uZmlnKHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsIHsgW0ZPUkdFX09SQ0hFU1RSQVRJT05fUkVRVUVTVF9LRVldOiByZXF1ZXN0IH0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc3luY0RpYWxlY3RpY0Fzc2lnbm1lbnQoKTogdm9pZCB7XHJcblx0XHRjb25zdCBjdXJyZW50ID0gcmVhZEFzc2lnbm1lbnQoZm9yZ2VSb290Q29uZmlnVmFsdWVzKHRoaXMuX2FnZW50SG9zdFNlcnZpY2UpW0ZPUkdFX09SQ0hFU1RSQVRJT05fQVNTSUdOTUVOVF9LRVldKVxyXG5cdFx0XHQ/PyByZWFkUGVyc2lzdGVkT3JjaGVzdHJhdGlvbkFzc2lnbm1lbnQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xyXG5cdFx0aWYgKCFjdXJyZW50KSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHNldHVwID0gcmVhZEZvcmdlQWdlbnRTZXR1cCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lEKSk7XHJcblx0XHRkaXNwYXRjaEZvcmdlUm9vdENvbmZpZyh0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLCB7XHJcblx0XHRcdFtGT1JHRV9PUkNIRVNUUkFUSU9OX0FTU0lHTk1FTlRfS0VZXTogYXNzaWdubWVudFdpdGhEaWFsZWN0aWNQcm9maWxlcyhjdXJyZW50LCBzZXR1cCksXHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2FwcGx5TG9nb3NTZXNzaW9uKGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UpOiB2b2lkIHtcclxuXHRcdGlmIChyZWFkRm9yZ2VXb3JrTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCkpICE9PSAnbG9nb3MnKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmIChyZWFkTG9nb3NBZ2VudCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9MT0dPU19BR0VOVF9TRVRUSU5HX0lEKSkgIT09ICdjb2RleCcpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3Qgc2V0dXAgPSByZWFkRm9yZ2VBZ2VudFNldHVwKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEZPUkdFX0FHRU5UX1NFVFVQX1NFVFRJTkdfSUQpKTtcclxuXHRcdGNvbnN0IHByb2ZpbGUgPSBnZXRBZ2VudFByb2ZpbGUoc2V0dXAsICdsb2dvcycsICdjb2RleCcpO1xyXG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IGZpbmRMYW5ndWFnZU1vZGVsSWRlbnRpZmllcih0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpLCBwcm9maWxlLm1vZGVsUHJvdmlkZXJJZCwgcHJvZmlsZS5tb2RlbCk7XHJcblx0XHRpZiAoIWlkZW50aWZpZXIpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgY2hhdFdpZGdldFNlcnZpY2UuZ2V0QWxsV2lkZ2V0cygpKSB7XHJcblx0XHRcdGlmICghaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpKSB7XHJcblx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdH1cclxuXHRcdFx0dm9pZCB3aWRnZXQuaW5wdXQucmVxdWVzdE1vZGVsQnlJZGVudGlmaWVyKGlkZW50aWZpZXIpO1xyXG5cdFx0XHRjb25zdCB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XHJcblx0XHRcdGlmIChwcm9maWxlLnRoaW5raW5nTGV2ZWwpIHtcclxuXHRcdFx0XHR2YWx1ZXMudGhpbmtpbmdMZXZlbCA9IHByb2ZpbGUudGhpbmtpbmdMZXZlbDtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAocHJvZmlsZS5jb250ZXh0U2l6ZSAmJiBwcm9maWxlLmNvbnRleHRTaXplICE9PSAnZGVmYXVsdCcpIHtcclxuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBOdW1iZXIocHJvZmlsZS5jb250ZXh0U2l6ZSk7XHJcblx0XHRcdFx0dmFsdWVzLmNvbnRleHRTaXplID0gTnVtYmVyLmlzRmluaXRlKHRva2VucykgPyB0b2tlbnMgOiBwcm9maWxlLmNvbnRleHRTaXplO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChPYmplY3Qua2V5cyh2YWx1ZXMpLmxlbmd0aCkge1xyXG5cdFx0XHRcdHZvaWQgd2lkZ2V0LmlucHV0LnNldE1vZGVsQ29uZmlndXJhdGlvbihpZGVudGlmaWVyLCB2YWx1ZXMpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBGb3JnZUFnZW50U2V0dXBPdmVybGF5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XHJcblx0cHJpdmF0ZSBfb3BlblZpZXc6IElPcGVuQ29udGV4dFZpZXcgfCB1bmRlZmluZWQ7XHJcblxyXG5cdGNvbnN0cnVjdG9yKFxyXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxyXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxyXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxyXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxyXG5cdCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHR9XHJcblxyXG5cdG9wZW4oYXJnPzogeyB0YWI/OiBGb3JnZUFnZW50Q29sdW1uOyBhbmNob3I/OiBIVE1MRWxlbWVudCB9KTogdm9pZCB7XHJcblx0XHR0aGlzLmNsb3NlKCk7XHJcblx0XHRjb25zdCBhbmNob3IgPSBhcmc/LmFuY2hvciA/PyB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8uaW5wdXRQYXJ0LmVsZW1lbnQgPz8gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/LmRvbU5vZGU7XHJcblx0XHRpZiAoIWFuY2hvcikge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9vcGVuVmlldyA9IHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5zaG93Q29udGV4dFZpZXcoe1xyXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcclxuXHRcdFx0YW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQuTEVGVCxcclxuXHRcdFx0YW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkFCT1ZFLFxyXG5cdFx0XHRyZW5kZXI6IGNvbnRhaW5lciA9PiB0aGlzLl9yZW5kZXIoY29udGFpbmVyLCBhcmc/LnRhYiA/PyAnbG9nb3MnKSxcclxuXHRcdFx0b25ET01FdmVudDogZSA9PiB0aGlzLl9vbkV2ZW50KGUpLFxyXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcclxuXHRcdFx0XHR0aGlzLl9vcGVuVmlldyA9IHVuZGVmaW5lZDtcclxuXHRcdFx0fSxcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0Y2xvc2UoKTogdm9pZCB7XHJcblx0XHR0aGlzLl9vcGVuVmlldz8uY2xvc2UoKTtcclxuXHRcdHRoaXMuX29wZW5WaWV3ID0gdW5kZWZpbmVkO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb25FdmVudChlOiBFdmVudCk6IHZvaWQge1xyXG5cdFx0aWYgKGUudHlwZSA9PT0gJ2tleWRvd24nICYmIChlIGFzIEtleWJvYXJkRXZlbnQpLmtleSA9PT0gJ0VzY2FwZScpIHtcclxuXHRcdFx0dGhpcy5jbG9zZSgpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAoZS50eXBlICE9PSAnY2xpY2snKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xyXG5cdFx0aWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGlmICh0YXJnZXQuY2xvc2VzdCgnc2VsZWN0LCBvcHRpb24sIG9wdGdyb3VwJykpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGlzQW5jZXN0b3IodGFyZ2V0LCB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuZ2V0Q29udGV4dFZpZXdFbGVtZW50KCkpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuY2xvc2UoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3JlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBmb2N1c0NvbHVtbjogRm9yZ2VBZ2VudENvbHVtbik6IERpc3Bvc2FibGVTdG9yZSB7XHJcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcclxuXHRcdGNvbnN0IHJvb3QgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAnKSk7XHJcblx0XHRjb25zdCB0aXRsZUlkID0gYGZvcmdlLWFnZW50LXNldHVwLXRpdGxlLSR7Z2VuZXJhdGVVdWlkKCl9YDtcclxuXHRcdHJvb3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ2RpYWxvZycpO1xyXG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbW9kYWwnLCAnZmFsc2UnKTtcclxuXHRcdHJvb3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsbGVkYnknLCB0aXRsZUlkKTtcclxuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChyb290LCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAtaGVhZCcpKTtcclxuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKGhlYWRlciwgJCgnZGl2LmZvcmdlLWFnZW50LXNldHVwLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnZm9yZ2UuYWdlbnRTZXR1cC50aXRsZScsIFwiQWdlbnQgXHU5MTREXHU3RjZFXCIpKSk7XHJcblx0XHR0aXRsZS5pZCA9IHRpdGxlSWQ7XHJcblx0XHRjb25zdCBjbG9zZSA9IGFwcGVuZChoZWFkZXIsICQoJ2J1dHRvbi5mb3JnZS1hZ2VudC1zZXR1cC1jbG9zZScsIHsgdHlwZTogJ2J1dHRvbicgfSkpO1xyXG5cdFx0Y2xvc2Uuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2ZvcmdlLmFnZW50U2V0dXAuY2xvc2UnLCBcIlx1NTE3M1x1OTVFRFwiKSk7XHJcblx0XHRjbG9zZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2xvc2UpKTtcclxuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2xvc2UsICdjbGljaycsICgpID0+IHRoaXMuY2xvc2UoKSkpO1xyXG5cdFx0YXBwZW5kKHJvb3QsICQoJ2Rpdi5mb3JnZS1hZ2VudC1zZXR1cC1oaW50JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnZm9yZ2UuYWdlbnRTZXR1cC5oaW50JywgXCJcdTZBMjFcdTU3OEJcdTRFMEVcdTRGOUJcdTVFOTRcdTU1NDZcdTY3NjVcdTgxRUFcdThCQkVcdTdGNkVcdTRFMkRcdTc2ODQgTW9kZWxzXHUzMDAyXHU4RkQ5XHU5MUNDXHU1M0VBXHU3RUQ5XHU2QkNGXHU0RTJBIEFnZW50IFx1OTAwOVx1ODk4MVx1NzUyOFx1NTRFQVx1NEUwMFx1NEUyQVx1RkYwQ1x1NEVFNVx1NTNDQVx1NjAxRFx1ODAwM1x1NkRGMVx1NUVBNlx1NTQ4Q1x1NEUwQVx1NEUwQlx1NjU4N1x1OTU3Rlx1NUVBNlx1MzAwMlwiKSkpO1xyXG5cdFx0Y29uc3QgZ3JpZCA9IGFwcGVuZChyb290LCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAtZ3JpZCcpKTtcclxuXHRcdHRoaXMuX2NvbHVtbihzdG9yZSwgZ3JpZCwgJ2xvZ29zJywgbG9jYWxpemUoJ2ZvcmdlLmFnZW50U2V0dXAubG9nb3MnLCBcIkxvZ29zXCIpLCBmb2N1c0NvbHVtbiA9PT0gJ2xvZ29zJyk7XHJcblx0XHR0aGlzLl9jb2x1bW4oc3RvcmUsIGdyaWQsICdkaWFsZWN0aWMnLCBsb2NhbGl6ZSgnZm9yZ2UuYWdlbnRTZXR1cC5kaWFsZWN0aWMnLCBcIkRpYWxlY3RpY1wiKSwgZm9jdXNDb2x1bW4gPT09ICdkaWFsZWN0aWMnKTtcclxuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IGNsb3NlLmZvY3VzKCkpO1xyXG5cdFx0cmV0dXJuIHN0b3JlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfY29sdW1uKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIHBhcmVudDogSFRNTEVsZW1lbnQsIGNvbHVtbjogRm9yZ2VBZ2VudENvbHVtbiwgdGl0bGU6IHN0cmluZywgZm9jdXNlZDogYm9vbGVhbik6IHZvaWQge1xyXG5cdFx0Y29uc3QgcGFuZSA9IGFwcGVuZChwYXJlbnQsICQoJ2Rpdi5mb3JnZS1hZ2VudC1zZXR1cC1jb2wnKSk7XHJcblx0XHRwYW5lLmNsYXNzTGlzdC50b2dnbGUoJ2ZvY3VzZWQnLCBmb2N1c2VkKTtcclxuXHRcdGFwcGVuZChwYW5lLCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAtY29sLXRpdGxlJywgdW5kZWZpbmVkLCB0aXRsZSkpO1xyXG5cdFx0Y29uc3Qgc2V0dXAgPSB0aGlzLl9zZXR1cCgpO1xyXG5cdFx0Y29uc3QgbW9kZWxzID0gbGlzdEZvcmdlU2V0dXBNb2RlbHMoZm9yZ2VSb290Q29uZmlnVmFsdWVzKHRoaXMuX2FnZW50SG9zdFNlcnZpY2UpW0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldKTtcclxuXHRcdGlmIChtb2RlbHMubGVuZ3RoID09PSAwKSB7XHJcblx0XHRcdGFwcGVuZChwYW5lLCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAtZW1wdHknLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb3JnZS5hZ2VudFNldHVwLm5vTW9kZWxzJywgXCJcdThGRDhcdTZDQTFcdTY3MDlcdTU0MkZcdTc1MjhcdTc2ODRcdTZBMjFcdTU3OEJcdTMwMDJcdThCRjdcdTUxNDhcdTU3MjggTW9kZWxzIFx1OEJCRVx1N0Y2RVx1OTFDQ1x1NTQyRlx1NzUyOFx1NEY5Qlx1NUU5NFx1NTU0Nlx1NTQ4Q1x1NkEyMVx1NTc4Qlx1MzAwMlwiKSkpO1xyXG5cdFx0fVxyXG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBGT1JHRV9PUkNIRVNUUkFUSU9OX0FHRU5UUykge1xyXG5cdFx0XHR0aGlzLl9hZ2VudENhcmQoc3RvcmUsIHBhbmUsIGNvbHVtbiwgYWdlbnQucHJvdmlkZXJJZCwgYWdlbnQubGFiZWwsIHNldHVwLCBtb2RlbHMpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYWdlbnRDYXJkKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIHBhcmVudDogSFRNTEVsZW1lbnQsIGNvbHVtbjogRm9yZ2VBZ2VudENvbHVtbiwgcHJvdmlkZXJJZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBzZXR1cDogUmV0dXJuVHlwZTx0eXBlb2YgcmVhZEZvcmdlQWdlbnRTZXR1cD4sIG1vZGVsczogcmVhZG9ubHkgSUZvcmdlU2V0dXBNb2RlbE9wdGlvbltdKTogdm9pZCB7XHJcblx0XHRjb25zdCBwcm9maWxlID0gZ2V0QWdlbnRQcm9maWxlKHNldHVwLCBjb2x1bW4sIHByb3ZpZGVySWQpO1xyXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHdpdGhDdXJyZW50TW9kZWxPcHRpb24obW9kZWxzLCBwcm9maWxlKTtcclxuXHRcdGNvbnN0IGNhcmQgPSBhcHBlbmQocGFyZW50LCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAtY2FyZCcpKTtcclxuXHRcdGFwcGVuZChjYXJkLCAkKCdkaXYuZm9yZ2UtYWdlbnQtc2V0dXAtYWdlbnQnLCB1bmRlZmluZWQsIGxhYmVsKSk7XHJcblx0XHR0aGlzLl9zZWxlY3Qoc3RvcmUsIGNhcmQsIGxvY2FsaXplKCdmb3JnZS5hZ2VudFNldHVwLm1vZGVsJywgXCJcdTZBMjFcdTU3OEJcIiksIHNlbGVjdGVkU2V0dXBNb2RlbFZhbHVlKHByb2ZpbGUsIG9wdGlvbnMpLCBvcHRpb25zLm1hcChvcHRpb24gPT4gKHsgdmFsdWU6IG9wdGlvbi52YWx1ZSwgbGFiZWw6IGAke29wdGlvbi5wcm92aWRlck5hbWV9IC8gJHtvcHRpb24ubW9kZWx9YCB9KSksIHZhbHVlID0+IHtcclxuXHRcdFx0Y29uc3QgZGVjb2RlZCA9IGRlY29kZVNldHVwTW9kZWwodmFsdWUpO1xyXG5cdFx0XHR2b2lkIHRoaXMuX3BhdGNoKGNvbHVtbiwgcHJvdmlkZXJJZCwgZGVjb2RlZFxyXG5cdFx0XHRcdD8geyBtb2RlbFByb3ZpZGVySWQ6IGRlY29kZWQucHJvdmlkZXJJZCwgbW9kZWw6IGRlY29kZWQubW9kZWwgfVxyXG5cdFx0XHRcdDogeyBtb2RlbDogdmFsdWUgfSk7XHJcblx0XHR9KTtcclxuXHRcdHRoaXMuX3NlbGVjdChzdG9yZSwgY2FyZCwgbG9jYWxpemUoJ2ZvcmdlLmFnZW50U2V0dXAudGhpbmtpbmcnLCBcIlx1NjAxRFx1ODAwM1x1NkRGMVx1NUVBNlwiKSwgcHJvZmlsZS50aGlua2luZ0xldmVsID8/ICdtZWRpdW0nLCBGT1JHRV9USElOS0lOR19MRVZFTFMubWFwKGxldmVsID0+ICh7IHZhbHVlOiBsZXZlbCwgbGFiZWw6IGdldFJlYXNvbmluZ0VmZm9ydExhYmVsKGxldmVsKSB9KSksIHZhbHVlID0+IHtcclxuXHRcdFx0dm9pZCB0aGlzLl9wYXRjaChjb2x1bW4sIHByb3ZpZGVySWQsIHsgdGhpbmtpbmdMZXZlbDogdmFsdWUgfSk7XHJcblx0XHR9KTtcclxuXHRcdHRoaXMuX3NlbGVjdChzdG9yZSwgY2FyZCwgbG9jYWxpemUoJ2ZvcmdlLmFnZW50U2V0dXAuY29udGV4dCcsIFwiXHU0RTBBXHU0RTBCXHU2NTg3XHU5NTdGXHU1RUE2XCIpLCBwcm9maWxlLmNvbnRleHRTaXplID8/ICdkZWZhdWx0JywgRk9SR0VfQ09OVEVYVF9TSVpFX09QVElPTlMubWFwKG9wdGlvbiA9PiAoe1xyXG5cdFx0XHR2YWx1ZTogb3B0aW9uLnZhbHVlLFxyXG5cdFx0XHRsYWJlbDogb3B0aW9uLnZhbHVlID09PSAnZGVmYXVsdCcgPyBsb2NhbGl6ZSgnZm9yZ2UuYWdlbnRTZXR1cC5jb250ZXh0RGVmYXVsdCcsIFwiXHU5RUQ4XHU4QkE0XCIpIDogb3B0aW9uLmxhYmVsLFxyXG5cdFx0fSkpLCB2YWx1ZSA9PiB7XHJcblx0XHRcdHZvaWQgdGhpcy5fcGF0Y2goY29sdW1uLCBwcm92aWRlcklkLCB7IGNvbnRleHRTaXplOiB2YWx1ZSB9KTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc2VsZWN0KHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM6IHJlYWRvbmx5IHsgdmFsdWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9W10sIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xyXG5cdFx0Y29uc3Qgcm93ID0gYXBwZW5kKHBhcmVudCwgJCgnbGFiZWwuZm9yZ2UtYWdlbnQtc2V0dXAtZmllbGQnKSk7XHJcblx0XHRhcHBlbmQocm93LCAkKCdzcGFuLmZvcmdlLWFnZW50LXNldHVwLWZpZWxkLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xyXG5cdFx0Y29uc3Qgc2VsZWN0ID0gYXBwZW5kKHJvdywgJCgnc2VsZWN0LmZvcmdlLWFnZW50LXNldHVwLXNlbGVjdCcpKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcclxuXHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcclxuXHRcdFx0Y29uc3Qgbm9kZSA9IGFwcGVuZChzZWxlY3QsICQoJ29wdGlvbicpKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuXHRcdFx0bm9kZS52YWx1ZSA9IG9wdGlvbi52YWx1ZTtcclxuXHRcdFx0bm9kZS50ZXh0Q29udGVudCA9IG9wdGlvbi5sYWJlbDtcclxuXHRcdH1cclxuXHRcdGlmICh2YWx1ZSAmJiAhb3B0aW9ucy5zb21lKG9wdGlvbiA9PiBvcHRpb24udmFsdWUgPT09IHZhbHVlKSkge1xyXG5cdFx0XHRjb25zdCBleHRyYSA9IGFwcGVuZChzZWxlY3QsICQoJ29wdGlvbicpKSBhcyBIVE1MT3B0aW9uRWxlbWVudDtcclxuXHRcdFx0ZXh0cmEudmFsdWUgPSB2YWx1ZTtcclxuXHRcdFx0ZXh0cmEudGV4dENvbnRlbnQgPSB2YWx1ZTtcclxuXHRcdH1cclxuXHRcdHNlbGVjdC52YWx1ZSA9IHZhbHVlO1xyXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWxlY3QsICdjaGFuZ2UnLCAoKSA9PiBvbkNoYW5nZShzZWxlY3QudmFsdWUpKSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFzeW5jIF9wYXRjaChjb2x1bW46IEZvcmdlQWdlbnRDb2x1bW4sIHByb3ZpZGVySWQ6IHN0cmluZywgcGF0Y2g6IFBhcnRpYWw8SUZvcmdlQWdlbnRQcm9maWxlPik6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0Y29uc3QgbmV4dCA9IHdpdGhBZ2VudFByb2ZpbGUodGhpcy5fc2V0dXAoKSwgY29sdW1uLCBwcm92aWRlcklkLCBwYXRjaCk7XHJcblx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lELCBuZXh0LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfc2V0dXAoKSB7XHJcblx0XHRyZXR1cm4gcmVhZEZvcmdlQWdlbnRTZXR1cCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lEKSk7XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBGb3JnZUxvZ29zQWdlbnRQaWNrZXJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XHJcblx0cHJpdmF0ZSBfbGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xyXG5cdHByaXZhdGUgX29wZW5WaWV3OiBJT3BlbkNvbnRleHRWaWV3IHwgdW5kZWZpbmVkO1xyXG5cdHByaXZhdGUgX2xhc3RUb2dnbGUgPSAwO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdGFjdGlvbjogSUFjdGlvbixcclxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcclxuXHQpIHtcclxuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcclxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRk9SR0VfTE9HT1NfQUdFTlRfU0VUVElOR19JRCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lEKSkge1xyXG5cdFx0XHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XHJcblx0XHRcdH1cclxuXHRcdH0pKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gdGhpcy5fY2xvc2UoKSB9KTtcclxuXHR9XHJcblxyXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcclxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdmb3JnZS1sb2dvcy1hZ2VudC1pdGVtJywgJ2NoYXQtaW5wdXQtcGlja2VyLWl0ZW0nKTtcclxuXHRcdGNvbnN0IHJvb3QgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuYWN0aW9uLWxhYmVsLmZvcmdlLWxvZ29zLWFnZW50JykpO1xyXG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XHJcblx0XHRyb290LnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICdsaXN0Ym94Jyk7XHJcblx0XHR0aGlzLl9sYWJlbCA9IGFwcGVuZChyb290LCAkKCdzcGFuLmZvcmdlLWxvZ29zLWFnZW50LWxhYmVsJykpO1xyXG5cdFx0Y29uc3QgY2hldnJvbiA9IGFwcGVuZChyb290LCAkKCdzcGFuJykpO1xyXG5cdFx0Y2hldnJvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jaGV2cm9uVXApO1xyXG5cdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcclxuXHR9XHJcblxyXG5cdG92ZXJyaWRlIG9uQ2xpY2soZXZlbnQ6IEV2ZW50TGlrZSk6IHZvaWQge1xyXG5cdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XHJcblx0XHR0aGlzLl90b2dnbGUoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3RvZ2dsZSgpOiB2b2lkIHtcclxuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcblx0XHRpZiAobm93IC0gdGhpcy5fbGFzdFRvZ2dsZSA8IDI1MCkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLl9sYXN0VG9nZ2xlID0gbm93O1xyXG5cdFx0aWYgKHRoaXMuX29wZW5WaWV3KSB7XHJcblx0XHRcdHRoaXMuX2Nsb3NlKCk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuX3Nob3coKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2Nsb3NlKCk6IHZvaWQge1xyXG5cdFx0dGhpcy5fb3BlblZpZXc/LmNsb3NlKCk7XHJcblx0XHR0aGlzLl9vcGVuVmlldyA9IHVuZGVmaW5lZDtcclxuXHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9zaG93KCk6IHZvaWQge1xyXG5cdFx0Y29uc3QgYW5jaG9yID0gdGhpcy5lbGVtZW50O1xyXG5cdFx0aWYgKCFhbmNob3IpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fb3BlblZpZXcgPSB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KHtcclxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXHJcblx0XHRcdGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50LlJJR0hULFxyXG5cdFx0XHRhbmNob3JQb3NpdGlvbjogQW5jaG9yUG9zaXRpb24uQUJPVkUsXHJcblx0XHRcdHJlbmRlcjogY29udGFpbmVyID0+IHRoaXMuX3JlbmRlclBpY2tlcihjb250YWluZXIpLFxyXG5cdFx0XHRvbkRPTUV2ZW50OiBlID0+IHRoaXMuX29uUGlja2VyRXZlbnQoZSksXHJcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xyXG5cdFx0XHRcdHRoaXMuX29wZW5WaWV3ID0gdW5kZWZpbmVkO1xyXG5cdFx0XHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XHJcblx0XHRcdH0sXHJcblx0XHR9KTtcclxuXHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9vblBpY2tlckV2ZW50KGU6IEV2ZW50KTogdm9pZCB7XHJcblx0XHRpZiAoZS50eXBlID09PSAna2V5ZG93bicgJiYgKGUgYXMgS2V5Ym9hcmRFdmVudCkua2V5ID09PSAnRXNjYXBlJykge1xyXG5cdFx0XHR0aGlzLl9jbG9zZSgpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAoZS50eXBlICE9PSAnY2xpY2snICYmIGUudHlwZSAhPT0gJ21vdXNlZG93bicpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XHJcblx0XHRpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHRoaXMuZWxlbWVudCAmJiBpc0FuY2VzdG9yKHRhcmdldCwgdGhpcy5lbGVtZW50KSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAoaXNBbmNlc3Rvcih0YXJnZXQsIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5nZXRDb250ZXh0Vmlld0VsZW1lbnQoKSkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fY2xvc2UoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3JlbmRlckxhYmVsKCk6IHZvaWQge1xyXG5cdFx0aWYgKCF0aGlzLl9sYWJlbCkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRjb25zdCBhZ2VudElkID0gcmVhZExvZ29zQWdlbnQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfTE9HT1NfQUdFTlRfU0VUVElOR19JRCkpO1xyXG5cdFx0Y29uc3QgYWdlbnQgPSBvcmNoZXN0cmF0aW9uQWdlbnRJbmZvKGFnZW50SWQpO1xyXG5cdFx0Y29uc3QgcHJvZmlsZSA9IGdldEFnZW50UHJvZmlsZShyZWFkRm9yZ2VBZ2VudFNldHVwKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEZPUkdFX0FHRU5UX1NFVFVQX1NFVFRJTkdfSUQpKSwgJ2xvZ29zJywgYWdlbnRJZCk7XHJcblx0XHR0aGlzLl9sYWJlbC50ZXh0Q29udGVudCA9IGFnZW50Py5sYWJlbCA/PyBhZ2VudElkO1xyXG5cdFx0Y29uc3QgdHJpZ2dlciA9IHRoaXMuZWxlbWVudD8ucXVlcnlTZWxlY3RvcignLmZvcmdlLWxvZ29zLWFnZW50Jyk7XHJcblx0XHR0cmlnZ2VyPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCB0aGlzLl9vcGVuVmlldyA/ICd0cnVlJyA6ICdmYWxzZScpO1xyXG5cdFx0dHJpZ2dlcj8uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2ZvcmdlLmxvZ29zLmFnZW50QXJpYScsIFwiQWdlbnRcdUZGMEN7MH1cdUZGMEN7MX1cIiwgYWdlbnQ/LmxhYmVsID8/IGFnZW50SWQsIHByb2ZpbGUubW9kZWwgPz8gJycpKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3JlbmRlclBpY2tlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogRGlzcG9zYWJsZVN0b3JlIHtcclxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xyXG5cdFx0Y29uc3QgcGlja2VyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LmZvcmdlLWFnZW50LXBpY2tlcicpKTtcclxuXHRcdHBpY2tlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdGJveCcpO1xyXG5cdFx0Y29uc3QgaGVhZCA9IGFwcGVuZChwaWNrZXIsICQoJ2Rpdi5mb3JnZS1hZ2VudC1waWNrZXItaGVhZCcpKTtcclxuXHRcdGFwcGVuZChoZWFkLCAkKCdkaXYuZm9yZ2Utb3JjaC1waWNrZXItdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb3JnZS5sb2dvcy5waWNrQWdlbnRUaXRsZScsIFwiXHU5MDA5XHU2MkU5IEFnZW50XCIpKSk7XHJcblx0XHRjb25zdCBnZWFyID0gYXBwZW5kKGhlYWQsICQoJ2J1dHRvbi5mb3JnZS1hZ2VudC1waWNrZXItc2V0dXAnLCB7IHR5cGU6ICdidXR0b24nIH0pKTtcclxuXHRcdGdlYXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2ZvcmdlLmFnZW50U2V0dXAub3BlbicsIFwiXHU5MTREXHU3RjZFIEFnZW50IFx1NkEyMVx1NTc4QlwiKSk7XHJcblx0XHRnZWFyLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5nZWFyKSk7XHJcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdlYXIsICdjbGljaycsIGUgPT4ge1xyXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XHJcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblx0XHRcdHRoaXMuX2Nsb3NlKCk7XHJcblx0XHRcdGFnZW50U2V0dXBPdmVybGF5Py5vcGVuKHsgdGFiOiAnbG9nb3MnLCBhbmNob3I6IHRoaXMuZWxlbWVudCB9KTtcclxuXHRcdH0pKTtcclxuXHRcdGNvbnN0IGxpc3QgPSBhcHBlbmQocGlja2VyLCAkKCdkaXYuZm9yZ2Utb3JjaC1jaG9pY2VzJykpO1xyXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSByZWFkTG9nb3NBZ2VudCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9MT0dPU19BR0VOVF9TRVRUSU5HX0lEKSk7XHJcblx0XHRjb25zdCBzZXR1cCA9IHJlYWRGb3JnZUFnZW50U2V0dXAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfQUdFTlRfU0VUVVBfU0VUVElOR19JRCkpO1xyXG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBGT1JHRV9PUkNIRVNUUkFUSU9OX0FHRU5UUykge1xyXG5cdFx0XHRjb25zdCBwcm9maWxlID0gZ2V0QWdlbnRQcm9maWxlKHNldHVwLCAnbG9nb3MnLCBhZ2VudC5wcm92aWRlcklkKTtcclxuXHRcdFx0Y29uc3QgYnV0dG9uID0gYXBwZW5kKGxpc3QsICQoJ2J1dHRvbi5mb3JnZS1vcmNoLWNob2ljZScsIHsgdHlwZTogJ2J1dHRvbicgfSkpO1xyXG5cdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ29wdGlvbicpO1xyXG5cdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgc2VsZWN0ZWQgPT09IGFnZW50LnByb3ZpZGVySWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcclxuXHRcdFx0YnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgc2VsZWN0ZWQgPT09IGFnZW50LnByb3ZpZGVySWQpO1xyXG5cdFx0XHRhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmZvcmdlLW9yY2gtY2hvaWNlLW1hcmsnKSk7XHJcblx0XHRcdGFwcGVuZChidXR0b24sICQoJ3NwYW4uZm9yZ2Utb3JjaC1jaG9pY2UtbGFiZWwnLCB1bmRlZmluZWQsIGFnZW50LmxhYmVsKSk7XHJcblx0XHRcdGFwcGVuZChidXR0b24sICQoJ3NwYW4uZm9yZ2Utb3JjaC1jaG9pY2UtbW9kZWwnLCB1bmRlZmluZWQsIHByb2ZpbGUubW9kZWwgPz8gYWdlbnQuZGVmYXVsdE1vZGVsKSk7XHJcblx0XHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XHJcblx0XHRcdFx0dm9pZCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShGT1JHRV9MT0dPU19BR0VOVF9TRVRUSU5HX0lELCBhZ2VudC5wcm92aWRlcklkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xyXG5cdFx0XHRcdHRoaXMuX2Nsb3NlKCk7XHJcblx0XHRcdH0pKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBzdG9yZTtcclxuXHR9XHJcbn1cclxuXHJcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihGb3JnZUFnZW50U2V0dXBDb250cmlidXRpb24uSUQsIEZvcmdlQWdlbnRTZXR1cENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQ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
