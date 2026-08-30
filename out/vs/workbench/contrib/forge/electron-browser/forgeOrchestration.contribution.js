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
import { $, addDisposableListener, append, clearNode, getWindow } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import {
  FORGE_ORCHESTRATION_AGENTS,
  FORGE_ORCHESTRATION_ASSIGNMENT_KEY,
  FORGE_ORCHESTRATION_COMMAND_KEY,
  isActiveOrchestrationStatus,
  readOrchestrationState
} from "../../../../platform/agentHost/common/orchestration/orchestrationTypes.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { IChatWidgetService, isIChatViewViewContext } from "../../chat/browser/chat.js";
import { CancelChatActionId } from "../../chat/browser/actions/chatExecuteActions.js";
import { CHAT_CATEGORY } from "../../chat/browser/actions/chatActions.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { FORGE_WORK_MODE_SETTING_ID, readForgeWorkMode } from "../common/forgeWorkMode.js";
import { FORGE_AGENT_SETUP_OPEN_ACTION_ID, FORGE_AGENT_SETUP_SETTING_ID, getAgentProfile, providerRefFromProfile, readForgeAgentSetup } from "../common/forgeAgentSetup.js";
import {
  cancelForgeOrchestration,
  clearDialecticOrchestrationPending,
  completeStaleChatRequest,
  dispatchForgeRootConfig,
  forgeRootConfigValues,
  orchestrationRunMatchesWidget,
  persistOrchestrationAssignment,
  resolveDialecticAssignment,
  restoreOrchestrationAssignment
} from "../common/forgeOrchestrationRun.js";
import { trySendDialecticOrchestration } from "../common/forgeOrchestrationSend.js";
const FORGE_ORCHESTRATE_ACTION_ID = "forge.orchestration.run";
const FORGE_ORCHESTRATION_ASSIGN_ACTION_ID = "forge.orchestration.assign";
const FORGE_ORCHESTRATION_COMMAND_ACTION_ID = "forge.orchestration.command";
const orchestrationBars = /* @__PURE__ */ new WeakMap();
function startDialecticOrchestrationFromAccessor(accessor, widget, goal) {
  const configurationService = accessor.get(IConfigurationService);
  return trySendDialecticOrchestration({
    widget,
    goal,
    workspacePath: accessor.get(IWorkspaceContextService).getWorkspace().folders[0]?.uri.fsPath ?? "",
    agentHostService: accessor.get(IAgentHostService),
    configurationService,
    setup: readForgeAgentSetup(configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID)),
    instantiationService: accessor.get(IInstantiationService),
    notificationService: accessor.get(INotificationService)
  }).ok;
}
async function runOrchestration(accessor, context) {
  const widget = context?.widget ?? accessor.get(IChatWidgetService).lastFocusedWidget;
  if (!widget) {
    accessor.get(INotificationService).error(localize("forge.orchestration.noChat", "\u5148\u6253\u5F00 Codex \u804A\u5929\uFF0C\u518D\u5F00\u59CB\u7F16\u6392\u3002"));
    return;
  }
  startDialecticOrchestrationFromAccessor(accessor, widget, context?.inputValue ?? widget.getInput());
  orchestrationBars.get(widget)?.closePicker();
}
function toggleAssignmentPicker(accessor, context) {
  const widget = context?.widget ?? accessor.get(IChatWidgetService).lastFocusedWidget;
  if (!widget) {
    accessor.get(INotificationService).error(localize("forge.orchestration.noChat", "\u5148\u6253\u5F00 Codex \u804A\u5929\uFF0C\u518D\u5F00\u59CB\u7F16\u6392\u3002"));
    return;
  }
  orchestrationBars.get(widget)?.togglePicker();
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FORGE_ORCHESTRATE_ACTION_ID,
      title: localize2("forge.orchestration.run", "\u7F16\u6392"),
      f1: true,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ContextKeyExpr.equals(`config.${FORGE_WORK_MODE_SETTING_ID}`, "dialectic")
      )
    });
  }
  run(accessor, ...args) {
    return runOrchestration(accessor, args[0]);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FORGE_ORCHESTRATION_ASSIGN_ACTION_ID,
      title: localize2("forge.orchestration.assign", "\u6307\u5B9A Leader / Worker"),
      f1: true,
      category: CHAT_CATEGORY,
      icon: Codicon.organization,
      menu: {
        id: MenuId.ChatExecute,
        group: "navigation",
        order: 6,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ContextKeyExpr.equals(`config.${FORGE_WORK_MODE_SETTING_ID}`, "dialectic")
        )
      }
    });
  }
  run(accessor, ...args) {
    toggleAssignmentPicker(accessor, args[0]);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FORGE_ORCHESTRATION_COMMAND_ACTION_ID,
      title: localize2("forge.orchestration.command", "\u7F16\u6392\u4EFB\u52A1\u547D\u4EE4"),
      f1: false,
      category: CHAT_CATEGORY
    });
  }
  run(accessor, command) {
    if (!command?.type) {
      return;
    }
    dispatchForgeRootConfig(accessor.get(IAgentHostService), {
      [FORGE_ORCHESTRATION_COMMAND_KEY]: { ...command, commandId: generateUuid() }
    });
  }
});
let ForgeOrchestrationContribution = class extends Disposable {
  constructor(_chatWidgetService, instantiationService, _agentHostService, configurationService, commandService) {
    super();
    this._chatWidgetService = _chatWidgetService;
    this._agentHostService = _agentHostService;
    const restore = () => restoreOrchestrationAssignment(this._agentHostService, configurationService);
    restore();
    this._register(this._agentHostService.rootState.onDidChange(() => {
      restore();
      const run = readOrchestrationState(forgeRootConfigValues(this._agentHostService));
      if (run) {
        clearDialecticOrchestrationPending();
      }
    }));
    this._register(commandService.onWillExecuteCommand((event) => {
      if (event.commandId !== CancelChatActionId) {
        return;
      }
      const run = readOrchestrationState(forgeRootConfigValues(this._agentHostService));
      cancelForgeOrchestration(this._agentHostService, run?.runId);
      const widget = this._chatWidgetService.lastFocusedWidget;
      if (widget) {
        completeStaleChatRequest(widget);
      }
    }));
    for (const widget of this._chatWidgetService.getAllWidgets()) {
      if (isIChatViewViewContext(widget.viewContext)) {
        this._register(instantiationService.createInstance(ForgeOrchestrationBar, widget));
      }
    }
    this._register(this._chatWidgetService.onDidAddWidget((widget) => {
      if (isIChatViewViewContext(widget.viewContext)) {
        this._register(instantiationService.createInstance(ForgeOrchestrationBar, widget));
      }
    }));
  }
};
ForgeOrchestrationContribution.ID = "workbench.contrib.forgeOrchestration";
ForgeOrchestrationContribution = __decorateClass([
  __decorateParam(0, IChatWidgetService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IAgentHostService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ICommandService)
], ForgeOrchestrationContribution);
let ForgeOrchestrationBar = class extends Disposable {
  constructor(_widget, _agentHostService, _commandService, _configurationService) {
    super();
    this._widget = _widget;
    this._agentHostService = _agentHostService;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._sessionStore = this._register(new MutableDisposable());
    this._statusStore = this._register(new MutableDisposable());
    this._pickerStore = this._register(new DisposableStore());
    this._pickerOpen = false;
    orchestrationBars.set(_widget, this);
    this._register({ dispose: () => orchestrationBars.delete(_widget) });
    this._host = $(".forge-orch-host");
    this._status = append(this._host, $(".forge-orch"));
    this._status.setAttribute("role", "status");
    this._status.setAttribute("aria-live", "polite");
    this._picker = append(this._host, $(".forge-orch-picker"));
    this._assign = append(this._host, $("button.forge-orch-assign", { type: "button" }));
    this._picker.setAttribute("role", "dialog");
    this._picker.setAttribute("aria-label", localize("forge.orchestration.pickerLabel", "\u6307\u5B9A Leader \u548C Worker"));
    this._attach();
    this._register(this._widget.onDidChangeViewModel(() => this._attach()));
    this._register(this._agentHostService.rootState.onDidChange(() => this._render()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FORGE_WORK_MODE_SETTING_ID) || e.affectsConfiguration(FORGE_AGENT_SETUP_SETTING_ID)) {
        if (readForgeWorkMode(this._configurationService.getValue(FORGE_WORK_MODE_SETTING_ID)) !== "dialectic") {
          this._pickerOpen = false;
        }
        this._render();
      }
    }));
    this._register(addDisposableListener(this._assign, "click", () => this.togglePicker()));
    const win = getWindow(this._host);
    this._register(addDisposableListener(win, "mousedown", (e) => this._onPointerDown(e)));
    this._register(addDisposableListener(win, "keydown", (e) => {
      if (e.key === "Escape" && this._pickerOpen) {
        this.closePicker();
        this._assign.focus();
      }
    }));
    this._render();
  }
  togglePicker() {
    this._pickerOpen = !this._pickerOpen;
    this._render();
    if (this._pickerOpen) {
      queueMicrotask(() => this._picker.querySelector("button")?.focus());
    }
  }
  closePicker() {
    if (!this._pickerOpen) {
      return;
    }
    this._pickerOpen = false;
    this._render();
  }
  _onPointerDown(event) {
    if (!this._pickerOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (this._host.contains(target) || isAssignToolbarButton(target)) {
      return;
    }
    this.closePicker();
  }
  _attach() {
    const store = new DisposableStore();
    this._sessionStore.value = store;
    const container = this._widget.input.persistentContentContainerElement;
    if (!container.contains(this._host)) {
      container.prepend(this._host);
      store.add({ dispose: () => this._host.remove() });
    }
  }
  _assignment() {
    return resolveDialecticAssignment(
      this._agentHostService,
      readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID)),
      this._configurationService
    );
  }
  _render() {
    const assignment = this._assignment();
    const run = readOrchestrationState(forgeRootConfigValues(this._agentHostService));
    const dialectic = readForgeWorkMode(this._configurationService.getValue(FORGE_WORK_MODE_SETTING_ID)) === "dialectic";
    const matchesWidget = !run || orchestrationRunMatchesWidget(this._widget, run);
    this._assign.style.display = dialectic ? "" : "none";
    if (!dialectic) {
      this._pickerOpen = false;
    }
    const visibleRun = matchesWidget && run && (dialectic || isActiveOrchestrationStatus(run.status)) ? run : void 0;
    this._renderAssign(assignment);
    this._renderPicker(assignment);
    this._renderStatus(visibleRun);
    this._host.style.display = dialectic || visibleRun ? "" : "none";
  }
  _renderAssign(assignment) {
    clearNode(this._assign);
    this._assign.classList.toggle("open", this._pickerOpen);
    this._assign.setAttribute("aria-expanded", this._pickerOpen ? "true" : "false");
    this._assign.setAttribute("aria-haspopup", "dialog");
    append(this._assign, $("span.forge-orch-assign-k", void 0, localize("forge.orchestration.leaderShort", "Leader")));
    append(this._assign, $("span.forge-orch-assign-v", void 0, agentLabel(assignment.leader)));
    append(this._assign, $("span.forge-orch-assign-k", void 0, localize("forge.orchestration.workerShort", "Worker")));
    append(this._assign, $("span.forge-orch-assign-v", void 0, assignment.workers.map((worker) => worker.label).join(" \xB7 ") || localize("forge.orchestration.noWorker", "\u672A\u9009\u62E9")));
    const chevron = append(this._assign, $("span"));
    chevron.className = ThemeIcon.asClassName(this._pickerOpen ? Codicon.chevronDown : Codicon.chevronUp);
  }
  _renderPicker(assignment) {
    this._pickerStore.clear();
    clearNode(this._picker);
    this._picker.style.display = this._pickerOpen ? "" : "none";
    if (!this._pickerOpen) {
      return;
    }
    const setup = readForgeAgentSetup(this._configurationService.getValue(FORGE_AGENT_SETUP_SETTING_ID));
    const head = append(this._picker, $("div.forge-agent-picker-head"));
    append(head, $("div.forge-orch-picker-title", void 0, localize("forge.orchestration.pick", "\u6307\u5B9A Leader \u548C Worker")));
    const gear = append(head, $("button.forge-agent-picker-setup", { type: "button" }));
    gear.setAttribute("aria-label", localize("forge.agentSetup.open", "\u914D\u7F6E Agent \u6A21\u578B"));
    gear.classList.add(...ThemeIcon.asClassNameArray(Codicon.gear));
    this._pickerStore.add(addDisposableListener(gear, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closePicker();
      void this._commandService.executeCommand(FORGE_AGENT_SETUP_OPEN_ACTION_ID, { tab: "dialectic" });
    }));
    append(this._picker, $("div.forge-orch-picker-title", void 0, localize("forge.orchestration.pickLeader", "\u9009\u62E9 Leader")));
    const leaders = append(this._picker, $("div.forge-orch-choices", { role: "radiogroup" }));
    for (const agent of FORGE_ORCHESTRATION_AGENTS) {
      const model = getAgentProfile(setup, "dialectic", agent.providerId).model ?? agent.defaultModel;
      this._choice(leaders, agent.label, model, assignment.leader.providerId === agent.providerId, "radio", () => {
        this._saveAssignment({
          leader: providerRefFromProfile(agent.providerId, "leader", setup),
          workers: assignment.workers
        });
      });
    }
    append(this._picker, $("div.forge-orch-picker-title", void 0, localize("forge.orchestration.pickWorkers", "\u9009\u62E9 Worker\uFF08\u53EF\u591A\u9009\uFF09")));
    const workers = append(this._picker, $("div.forge-orch-choices"));
    for (const agent of FORGE_ORCHESTRATION_AGENTS) {
      const selected = assignment.workers.some((worker) => worker.providerId === agent.providerId);
      const model = getAgentProfile(setup, "dialectic", agent.providerId).model ?? agent.defaultModel;
      this._choice(workers, agent.label, model, selected, "checkbox", () => {
        const nextWorkers = selected ? assignment.workers.filter((worker) => worker.providerId !== agent.providerId) : [...assignment.workers, providerRefFromProfile(agent.providerId, "worker", setup)];
        if (nextWorkers.length === 0) {
          return;
        }
        this._saveAssignment({
          leader: assignment.leader,
          workers: FORGE_ORCHESTRATION_AGENTS.filter((entry) => nextWorkers.some((worker) => worker.providerId === entry.providerId)).map((entry) => providerRefFromProfile(entry.providerId, "worker", setup))
        });
      });
    }
  }
  _choice(parent, label, model, selected, kind, run) {
    const button = append(parent, $("button.forge-orch-choice", { type: "button" }));
    button.setAttribute("role", kind === "radio" ? "radio" : "checkbox");
    button.setAttribute("aria-checked", selected ? "true" : "false");
    button.classList.toggle("selected", selected);
    append(button, $("span.forge-orch-choice-mark"));
    append(button, $("span.forge-orch-choice-label", void 0, label));
    append(button, $("span.forge-orch-choice-model", void 0, model));
    this._pickerStore.add(addDisposableListener(button, "click", run));
  }
  _saveAssignment(assignment) {
    dispatchForgeRootConfig(this._agentHostService, { [FORGE_ORCHESTRATION_ASSIGNMENT_KEY]: assignment });
    void persistOrchestrationAssignment(this._configurationService, assignment);
  }
  _renderStatus(run) {
    const store = new DisposableStore();
    this._statusStore.value = store;
    clearNode(this._status);
    if (!run || run.status === "idle") {
      this._status.style.display = "none";
      return;
    }
    this._status.style.display = "";
    const row = append(this._status, $(".forge-orch-row"));
    append(row, $("span.forge-orch-status", void 0, statusLabel(run.status))).classList.add(run.status);
    append(row, $("span.forge-orch-title", void 0, run.planSummary || run.goal));
    const actions = append(row, $(".forge-orch-actions"));
    if (isActiveOrchestrationStatus(run.status)) {
      if (run.status === "paused") {
        this._button(actions, localize("forge.orchestration.resume", "\u7EE7\u7EED"), () => this._command({ type: "resume", runId: run.runId }), store);
      } else {
        this._button(actions, localize("forge.orchestration.pause", "\u6682\u505C"), () => this._command({ type: "pause", runId: run.runId }), store);
      }
      this._button(actions, localize("forge.orchestration.cancel", "\u53D6\u6D88"), () => this._command({ type: "cancel", runId: run.runId }), store);
    }
    this._button(actions, localize("forge.orchestration.scm", "\u66F4\u6539"), () => this._commandService.executeCommand("workbench.view.scm"), store);
    if (run.tasks.length > 0) {
      const tasks = append(this._status, $(".forge-orch-tasks"));
      for (const task of run.tasks) {
        const taskElement = append(tasks, $(".forge-orch-task"));
        const taskRow = append(taskElement, $(".forge-orch-row"));
        append(taskRow, $("span.forge-orch-status", void 0, statusLabel(task.status))).classList.add(task.status);
        append(taskRow, $("span.forge-orch-title", void 0, task.title));
        if (task.status === "failed") {
          const taskActions = append(taskRow, $(".forge-orch-actions"));
          this._button(taskActions, localize("forge.orchestration.retryTask", "\u91CD\u8BD5"), () => this._command({ type: "retry", runId: run.runId, taskId: task.id }), store);
          this._button(taskActions, localize("forge.orchestration.escalateTask", "Leader \u63A5\u7BA1"), () => this._command({ type: "escalate", runId: run.runId, taskId: task.id }), store);
        }
        const worker = task.workerModel ? `${task.workerLabel} \xB7 ${task.workerModel}` : task.workerLabel;
        append(taskElement, $("div.forge-orch-worker", void 0, localize("forge.orchestration.taskWorker", "{0} \xB7 \u7B2C {1} \u6B21\u5C1D\u8BD5", worker, task.attempt + 1)));
        const files = task.result?.changedFiles.length ? task.result.changedFiles : task.files;
        if (files.length > 0) {
          const visibleFiles = files.slice(0, 3).join(" \xB7 ");
          const suffix = files.length > 3 ? localize("forge.orchestration.moreFiles", " \xB7 \u53E6 {0} \u4E2A", files.length - 3) : "";
          const fileElement = append(taskElement, $("div.forge-orch-files", void 0, `${visibleFiles}${suffix}`));
          fileElement.title = files.join("\n");
        }
        const error = task.error ?? task.result?.error;
        if (error) {
          append(taskElement, $("div.forge-orch-error", void 0, error));
        }
      }
    }
    if (run.review) {
      append(this._status, $(".forge-orch-review", void 0, run.review));
    }
  }
  _button(parent, label, run, store) {
    const button = append(parent, $("button.forge-orch-btn", { type: "button" }, label));
    store.add(addDisposableListener(button, "click", run));
  }
  _command(command) {
    void this._commandService.executeCommand(FORGE_ORCHESTRATION_COMMAND_ACTION_ID, command);
  }
};
ForgeOrchestrationBar = __decorateClass([
  __decorateParam(1, IAgentHostService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IConfigurationService)
], ForgeOrchestrationBar);
function isAssignToolbarButton(target) {
  const item = target.closest(".action-item");
  const labelled = target.closest("[aria-label], [title]");
  const text = [
    labelled?.getAttribute("aria-label"),
    labelled?.getAttribute("title"),
    item?.querySelector("[aria-label]")?.getAttribute("aria-label"),
    item?.querySelector("[title]")?.getAttribute("title")
  ].filter(Boolean).join(" ");
  return text.includes("\u6307\u5B9A Leader") || text.includes("Leader / Worker");
}
function agentLabel(agent) {
  return agent.model ? `${agent.label} \xB7 ${agent.model}` : agent.label;
}
function statusLabel(status) {
  switch (status) {
    case "planning":
      return localize("forge.orchestration.status.planning", "\u89C4\u5212\u4E2D");
    case "running":
      return localize("forge.orchestration.status.running", "\u6267\u884C\u4E2D");
    case "reviewing":
      return localize("forge.orchestration.status.reviewing", "\u5BA1\u6838\u4E2D");
    case "queued":
      return localize("forge.orchestration.status.queued", "\u6392\u961F");
    case "completed":
      return localize("forge.orchestration.status.completed", "\u5B8C\u6210");
    case "failed":
      return localize("forge.orchestration.status.failed", "\u5931\u8D25");
    case "retry":
      return localize("forge.orchestration.status.retry", "\u91CD\u8BD5");
    case "escalated":
      return localize("forge.orchestration.status.escalated", "\u5DF2\u5347\u7EA7");
    case "cancelled":
      return localize("forge.orchestration.status.cancelled", "\u5DF2\u53D6\u6D88");
    case "paused":
      return localize("forge.orchestration.status.paused", "\u5DF2\u6682\u505C");
    default:
      return status;
  }
}
registerWorkbenchContribution2(ForgeOrchestrationContribution.ID, ForgeOrchestrationContribution, WorkbenchPhase.AfterRestored);
export {
  FORGE_ORCHESTRATE_ACTION_ID,
  FORGE_ORCHESTRATION_ASSIGN_ACTION_ID,
  FORGE_ORCHESTRATION_COMMAND_ACTION_ID
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcmdlXFxlbGVjdHJvbi1icm93c2VyXFxmb3JnZU9yY2hlc3RyYXRpb24uY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbmltcG9ydCAnLi9tZWRpYS9mb3JnZU9yY2hlc3RyYXRpb24uY3NzJztcclxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XHJcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XHJcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xyXG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xyXG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcclxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XHJcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XHJcbmltcG9ydCB7XHJcblx0Rk9SR0VfT1JDSEVTVFJBVElPTl9BR0VOVFMsXHJcblx0Rk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UX0tFWSxcclxuXHRGT1JHRV9PUkNIRVNUUkFUSU9OX0NPTU1BTkRfS0VZLFxyXG5cdGlzQWN0aXZlT3JjaGVzdHJhdGlvblN0YXR1cyxcclxuXHRyZWFkT3JjaGVzdHJhdGlvblN0YXRlLFxyXG5cdHR5cGUgSU9yY2hlc3RyYXRpb25Bc3NpZ25tZW50LFxyXG5cdHR5cGUgSU9yY2hlc3RyYXRpb25Db21tYW5kLFxyXG5cdHR5cGUgSU9yY2hlc3RyYXRpb25SdW5TdGF0ZSxcclxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL29yY2hlc3RyYXRpb24vb3JjaGVzdHJhdGlvblR5cGVzLmpzJztcclxuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XHJcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XHJcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XHJcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xyXG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcclxuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XHJcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcclxuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcclxuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSwgaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcclxuaW1wb3J0IHsgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCwgQ2FuY2VsQ2hhdEFjdGlvbklkIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLmpzJztcclxuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcclxuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xyXG5pbXBvcnQgeyBGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCwgcmVhZEZvcmdlV29ya01vZGUgfSBmcm9tICcuLi9jb21tb24vZm9yZ2VXb3JrTW9kZS5qcyc7XHJcbmltcG9ydCB7IEZPUkdFX0FHRU5UX1NFVFVQX09QRU5fQUNUSU9OX0lELCBGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lELCBnZXRBZ2VudFByb2ZpbGUsIHByb3ZpZGVyUmVmRnJvbVByb2ZpbGUsIHJlYWRGb3JnZUFnZW50U2V0dXAgfSBmcm9tICcuLi9jb21tb24vZm9yZ2VBZ2VudFNldHVwLmpzJztcclxuaW1wb3J0IHtcclxuXHRjYW5jZWxGb3JnZU9yY2hlc3RyYXRpb24sXHJcblx0Y2xlYXJEaWFsZWN0aWNPcmNoZXN0cmF0aW9uUGVuZGluZyxcclxuXHRjb21wbGV0ZVN0YWxlQ2hhdFJlcXVlc3QsXHJcblx0ZGlzcGF0Y2hGb3JnZVJvb3RDb25maWcsXHJcblx0Zm9yZ2VSb290Q29uZmlnVmFsdWVzLFxyXG5cdG9yY2hlc3RyYXRpb25SdW5NYXRjaGVzV2lkZ2V0LFxyXG5cdHBlcnNpc3RPcmNoZXN0cmF0aW9uQXNzaWdubWVudCxcclxuXHRyZXNvbHZlRGlhbGVjdGljQXNzaWdubWVudCxcclxuXHRyZXN0b3JlT3JjaGVzdHJhdGlvbkFzc2lnbm1lbnQsXHJcbn0gZnJvbSAnLi4vY29tbW9uL2ZvcmdlT3JjaGVzdHJhdGlvblJ1bi5qcyc7XHJcbmltcG9ydCB7IHRyeVNlbmREaWFsZWN0aWNPcmNoZXN0cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2ZvcmdlT3JjaGVzdHJhdGlvblNlbmQuanMnO1xyXG5cclxuZXhwb3J0IGNvbnN0IEZPUkdFX09SQ0hFU1RSQVRFX0FDVElPTl9JRCA9ICdmb3JnZS5vcmNoZXN0cmF0aW9uLnJ1bic7XHJcbmV4cG9ydCBjb25zdCBGT1JHRV9PUkNIRVNUUkFUSU9OX0FTU0lHTl9BQ1RJT05fSUQgPSAnZm9yZ2Uub3JjaGVzdHJhdGlvbi5hc3NpZ24nO1xyXG5leHBvcnQgY29uc3QgRk9SR0VfT1JDSEVTVFJBVElPTl9DT01NQU5EX0FDVElPTl9JRCA9ICdmb3JnZS5vcmNoZXN0cmF0aW9uLmNvbW1hbmQnO1xyXG5cclxuY29uc3Qgb3JjaGVzdHJhdGlvbkJhcnMgPSBuZXcgV2Vha01hcDxJQ2hhdFdpZGdldCwgRm9yZ2VPcmNoZXN0cmF0aW9uQmFyPigpO1xyXG5cclxuZnVuY3Rpb24gc3RhcnREaWFsZWN0aWNPcmNoZXN0cmF0aW9uRnJvbUFjY2Vzc29yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IElDaGF0V2lkZ2V0LCBnb2FsOiBzdHJpbmcpOiBib29sZWFuIHtcclxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xyXG5cdHJldHVybiB0cnlTZW5kRGlhbGVjdGljT3JjaGVzdHJhdGlvbih7XHJcblx0XHR3aWRnZXQsXHJcblx0XHRnb2FsLFxyXG5cdFx0d29ya3NwYWNlUGF0aDogYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSkuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpLmZzUGF0aCA/PyAnJyxcclxuXHRcdGFnZW50SG9zdFNlcnZpY2U6IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0U2VydmljZSksXHJcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdHNldHVwOiByZWFkRm9yZ2VBZ2VudFNldHVwKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEZPUkdFX0FHRU5UX1NFVFVQX1NFVFRJTkdfSUQpKSxcclxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKSxcclxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSksXHJcblx0fSkub2s7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJ1bk9yY2hlc3RyYXRpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XHJcblx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0ID8/IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpLmxhc3RGb2N1c2VkV2lkZ2V0O1xyXG5cdGlmICghd2lkZ2V0KSB7XHJcblx0XHRhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpLmVycm9yKGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLm5vQ2hhdCcsIFwiXHU1MTQ4XHU2MjUzXHU1RjAwIENvZGV4IFx1ODA0QVx1NTkyOVx1RkYwQ1x1NTE4RFx1NUYwMFx1NTlDQlx1N0YxNlx1NjM5Mlx1MzAwMlwiKSk7XHJcblx0XHRyZXR1cm47XHJcblx0fVxyXG5cdHN0YXJ0RGlhbGVjdGljT3JjaGVzdHJhdGlvbkZyb21BY2Nlc3NvcihhY2Nlc3Nvciwgd2lkZ2V0LCBjb250ZXh0Py5pbnB1dFZhbHVlID8/IHdpZGdldC5nZXRJbnB1dCgpKTtcclxuXHRvcmNoZXN0cmF0aW9uQmFycy5nZXQod2lkZ2V0KT8uY2xvc2VQaWNrZXIoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdG9nZ2xlQXNzaWdubWVudFBpY2tlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQpOiB2b2lkIHtcclxuXHRjb25zdCB3aWRnZXQgPSBjb250ZXh0Py53aWRnZXQgPz8gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSkubGFzdEZvY3VzZWRXaWRnZXQ7XHJcblx0aWYgKCF3aWRnZXQpIHtcclxuXHRcdGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSkuZXJyb3IobG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24ubm9DaGF0JywgXCJcdTUxNDhcdTYyNTNcdTVGMDAgQ29kZXggXHU4MDRBXHU1OTI5XHVGRjBDXHU1MThEXHU1RjAwXHU1OUNCXHU3RjE2XHU2MzkyXHUzMDAyXCIpKTtcclxuXHRcdHJldHVybjtcclxuXHR9XHJcblx0b3JjaGVzdHJhdGlvbkJhcnMuZ2V0KHdpZGdldCk/LnRvZ2dsZVBpY2tlcigpO1xyXG59XHJcblxyXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHN1cGVyKHtcclxuXHRcdFx0aWQ6IEZPUkdFX09SQ0hFU1RSQVRFX0FDVElPTl9JRCxcclxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9yZ2Uub3JjaGVzdHJhdGlvbi5ydW4nLCBcIlx1N0YxNlx1NjM5MlwiKSxcclxuXHRcdFx0ZjE6IHRydWUsXHJcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxyXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcclxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcclxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0ZPUkdFX1dPUktfTU9ERV9TRVRUSU5HX0lEfWAsICdkaWFsZWN0aWMnKSxcclxuXHRcdFx0KSxcclxuXHRcdH0pO1xyXG5cdH1cclxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xyXG5cdFx0cmV0dXJuIHJ1bk9yY2hlc3RyYXRpb24oYWNjZXNzb3IsIGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCk7XHJcblx0fVxyXG59KTtcclxuXHJcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoe1xyXG5cdFx0XHRpZDogRk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05fQUNUSU9OX0lELFxyXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb3JnZS5vcmNoZXN0cmF0aW9uLmFzc2lnbicsIFwiXHU2MzA3XHU1QjlBIExlYWRlciAvIFdvcmtlclwiKSxcclxuXHRcdFx0ZjE6IHRydWUsXHJcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxyXG5cdFx0XHRpY29uOiBDb2RpY29uLm9yZ2FuaXphdGlvbixcclxuXHRcdFx0bWVudToge1xyXG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXHJcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcclxuXHRcdFx0XHRvcmRlcjogNixcclxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXHJcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcclxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Rk9SR0VfV09SS19NT0RFX1NFVFRJTkdfSUR9YCwgJ2RpYWxlY3RpYycpLFxyXG5cdFx0XHRcdCksXHJcblx0XHRcdH0sXHJcblx0XHR9KTtcclxuXHR9XHJcblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcclxuXHRcdHRvZ2dsZUFzc2lnbm1lbnRQaWNrZXIoYWNjZXNzb3IsIGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCk7XHJcblx0fVxyXG59KTtcclxuXHJcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoe1xyXG5cdFx0XHRpZDogRk9SR0VfT1JDSEVTVFJBVElPTl9DT01NQU5EX0FDVElPTl9JRCxcclxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9yZ2Uub3JjaGVzdHJhdGlvbi5jb21tYW5kJywgXCJcdTdGMTZcdTYzOTJcdTRFRkJcdTUyQTFcdTU0N0RcdTRFRTRcIiksXHJcblx0XHRcdGYxOiBmYWxzZSxcclxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXHJcblx0XHR9KTtcclxuXHR9XHJcblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb21tYW5kPzogSU9yY2hlc3RyYXRpb25Db21tYW5kKTogdm9pZCB7XHJcblx0XHRpZiAoIWNvbW1hbmQ/LnR5cGUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdFx0ZGlzcGF0Y2hGb3JnZVJvb3RDb25maWcoYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RTZXJ2aWNlKSwge1xyXG5cdFx0XHRbRk9SR0VfT1JDSEVTVFJBVElPTl9DT01NQU5EX0tFWV06IHsgLi4uY29tbWFuZCwgY29tbWFuZElkOiBnZW5lcmF0ZVV1aWQoKSB9LFxyXG5cdFx0fSk7XHJcblx0fVxyXG59KTtcclxuXHJcbmNsYXNzIEZvcmdlT3JjaGVzdHJhdGlvbkNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xyXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5mb3JnZU9yY2hlc3RyYXRpb24nO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihcclxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcclxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcclxuXHRcdEBJQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RTZXJ2aWNlOiBJQWdlbnRIb3N0U2VydmljZSxcclxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcclxuXHQpIHtcclxuXHRcdHN1cGVyKCk7XHJcblx0XHRjb25zdCByZXN0b3JlID0gKCkgPT4gcmVzdG9yZU9yY2hlc3RyYXRpb25Bc3NpZ25tZW50KHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcclxuXHRcdHJlc3RvcmUoKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLm9uRGlkQ2hhbmdlKCgpID0+IHtcclxuXHRcdFx0cmVzdG9yZSgpO1xyXG5cdFx0XHRjb25zdCBydW4gPSByZWFkT3JjaGVzdHJhdGlvblN0YXRlKGZvcmdlUm9vdENvbmZpZ1ZhbHVlcyh0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlKSk7XG5cdFx0XHRpZiAocnVuKSB7XHJcblx0XHRcdFx0Y2xlYXJEaWFsZWN0aWNPcmNoZXN0cmF0aW9uUGVuZGluZygpO1xyXG5cdFx0XHR9XHJcblx0XHR9KSk7XHJcblx0XHR0aGlzLl9yZWdpc3Rlcihjb21tYW5kU2VydmljZS5vbldpbGxFeGVjdXRlQ29tbWFuZChldmVudCA9PiB7XHJcblx0XHRcdGlmIChldmVudC5jb21tYW5kSWQgIT09IENhbmNlbENoYXRBY3Rpb25JZCkge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cdFx0XHRjb25zdCBydW4gPSByZWFkT3JjaGVzdHJhdGlvblN0YXRlKGZvcmdlUm9vdENvbmZpZ1ZhbHVlcyh0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlKSk7XG5cdFx0XHRjYW5jZWxGb3JnZU9yY2hlc3RyYXRpb24odGhpcy5fYWdlbnRIb3N0U2VydmljZSwgcnVuPy5ydW5JZCk7XHJcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xyXG5cdFx0XHRpZiAod2lkZ2V0KSB7XHJcblx0XHRcdFx0Y29tcGxldGVTdGFsZUNoYXRSZXF1ZXN0KHdpZGdldCk7XHJcblx0XHRcdH1cclxuXHRcdH0pKTtcclxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKSkge1xyXG5cdFx0XHRpZiAoaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpKSB7XHJcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9yZ2VPcmNoZXN0cmF0aW9uQmFyLCB3aWRnZXQpKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFdpZGdldFNlcnZpY2Uub25EaWRBZGRXaWRnZXQod2lkZ2V0ID0+IHtcclxuXHRcdFx0aWYgKGlzSUNoYXRWaWV3Vmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSkge1xyXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvcmdlT3JjaGVzdHJhdGlvbkJhciwgd2lkZ2V0KSk7XHJcblx0XHRcdH1cclxuXHRcdH0pKTtcclxuXHR9XHJcbn1cclxuXHJcbmNsYXNzIEZvcmdlT3JjaGVzdHJhdGlvbkJhciBleHRlbmRzIERpc3Bvc2FibGUge1xyXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvc3Q6IEhUTUxFbGVtZW50O1xyXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpY2tlcjogSFRNTEVsZW1lbnQ7XHJcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzOiBIVE1MRWxlbWVudDtcclxuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3NpZ246IEhUTUxFbGVtZW50O1xyXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xyXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XHJcblx0cHJpdmF0ZSByZWFkb25seSBfcGlja2VyU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xyXG5cdHByaXZhdGUgX3BpY2tlck9wZW4gPSBmYWxzZTtcclxuXHJcblx0Y29uc3RydWN0b3IoXHJcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IElDaGF0V2lkZ2V0LFxyXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxyXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxyXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxyXG5cdCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdG9yY2hlc3RyYXRpb25CYXJzLnNldChfd2lkZ2V0LCB0aGlzKTtcclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gb3JjaGVzdHJhdGlvbkJhcnMuZGVsZXRlKF93aWRnZXQpIH0pO1xyXG5cdFx0dGhpcy5faG9zdCA9ICQoJy5mb3JnZS1vcmNoLWhvc3QnKTtcclxuXHRcdHRoaXMuX3N0YXR1cyA9IGFwcGVuZCh0aGlzLl9ob3N0LCAkKCcuZm9yZ2Utb3JjaCcpKTtcblx0XHR0aGlzLl9zdGF0dXMuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N0YXR1cycpO1xuXHRcdHRoaXMuX3N0YXR1cy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHR0aGlzLl9waWNrZXIgPSBhcHBlbmQodGhpcy5faG9zdCwgJCgnLmZvcmdlLW9yY2gtcGlja2VyJykpO1xyXG5cdFx0dGhpcy5fYXNzaWduID0gYXBwZW5kKHRoaXMuX2hvc3QsICQoJ2J1dHRvbi5mb3JnZS1vcmNoLWFzc2lnbicsIHsgdHlwZTogJ2J1dHRvbicgfSkpO1xyXG5cdFx0dGhpcy5fcGlja2VyLnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcclxuXHRcdHRoaXMuX3BpY2tlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5waWNrZXJMYWJlbCcsIFwiXHU2MzA3XHU1QjlBIExlYWRlciBcdTU0OEMgV29ya2VyXCIpKTtcclxuXHRcdHRoaXMuX2F0dGFjaCgpO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKCgpID0+IHRoaXMuX2F0dGFjaCgpKSk7XHJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJvb3RTdGF0ZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9yZW5kZXIoKSkpO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xyXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihGT1JHRV9BR0VOVF9TRVRVUF9TRVRUSU5HX0lEKSkge1xyXG5cdFx0XHRcdGlmIChyZWFkRm9yZ2VXb3JrTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCkpICE9PSAnZGlhbGVjdGljJykge1xyXG5cdFx0XHRcdFx0dGhpcy5fcGlja2VyT3BlbiA9IGZhbHNlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHR0aGlzLl9yZW5kZXIoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSkpO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2Fzc2lnbiwgJ2NsaWNrJywgKCkgPT4gdGhpcy50b2dnbGVQaWNrZXIoKSkpO1xyXG5cdFx0Y29uc3Qgd2luID0gZ2V0V2luZG93KHRoaXMuX2hvc3QpO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ21vdXNlZG93bicsIGUgPT4gdGhpcy5fb25Qb2ludGVyRG93bihlKSkpO1xyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VzY2FwZScgJiYgdGhpcy5fcGlja2VyT3Blbikge1xuXHRcdFx0XHR0aGlzLmNsb3NlUGlja2VyKCk7XG5cdFx0XHRcdHRoaXMuX2Fzc2lnbi5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcclxuXHRcdHRoaXMuX3JlbmRlcigpO1xyXG5cdH1cclxuXHJcblx0dG9nZ2xlUGlja2VyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BpY2tlck9wZW4gPSAhdGhpcy5fcGlja2VyT3Blbjtcblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHRpZiAodGhpcy5fcGlja2VyT3Blbikge1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5fcGlja2VyLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24nKT8uZm9jdXMoKSk7XG5cdFx0fVxuXHR9XHJcblxyXG5cdGNsb3NlUGlja2VyKCk6IHZvaWQge1xyXG5cdFx0aWYgKCF0aGlzLl9waWNrZXJPcGVuKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuX3BpY2tlck9wZW4gPSBmYWxzZTtcclxuXHRcdHRoaXMuX3JlbmRlcigpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb25Qb2ludGVyRG93bihldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG5cdFx0aWYgKCF0aGlzLl9waWNrZXJPcGVuKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldDtcclxuXHRcdGlmICghKHRhcmdldCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRpZiAodGhpcy5faG9zdC5jb250YWlucyh0YXJnZXQpIHx8IGlzQXNzaWduVG9vbGJhckJ1dHRvbih0YXJnZXQpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdHRoaXMuY2xvc2VQaWNrZXIoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2F0dGFjaCgpOiB2b2lkIHtcclxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xyXG5cdFx0dGhpcy5fc2Vzc2lvblN0b3JlLnZhbHVlID0gc3RvcmU7XHJcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLl93aWRnZXQuaW5wdXQucGVyc2lzdGVudENvbnRlbnRDb250YWluZXJFbGVtZW50O1xyXG5cdFx0aWYgKCFjb250YWluZXIuY29udGFpbnModGhpcy5faG9zdCkpIHtcclxuXHRcdFx0Y29udGFpbmVyLnByZXBlbmQodGhpcy5faG9zdCk7XHJcblx0XHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHRoaXMuX2hvc3QucmVtb3ZlKCkgfSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9hc3NpZ25tZW50KCk6IElPcmNoZXN0cmF0aW9uQXNzaWdubWVudCB7XHJcblx0XHRyZXR1cm4gcmVzb2x2ZURpYWxlY3RpY0Fzc2lnbm1lbnQoXHJcblx0XHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsXHJcblx0XHRcdHJlYWRGb3JnZUFnZW50U2V0dXAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfQUdFTlRfU0VUVVBfU0VUVElOR19JRCkpLFxyXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSxcclxuXHRcdCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9yZW5kZXIoKTogdm9pZCB7XHJcblx0XHRjb25zdCBhc3NpZ25tZW50ID0gdGhpcy5fYXNzaWdubWVudCgpO1xyXG5cdFx0Y29uc3QgcnVuID0gcmVhZE9yY2hlc3RyYXRpb25TdGF0ZShmb3JnZVJvb3RDb25maWdWYWx1ZXModGhpcy5fYWdlbnRIb3N0U2VydmljZSkpO1xyXG5cdFx0Y29uc3QgZGlhbGVjdGljID0gcmVhZEZvcmdlV29ya01vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfV09SS19NT0RFX1NFVFRJTkdfSUQpKSA9PT0gJ2RpYWxlY3RpYyc7XHJcblx0XHRjb25zdCBtYXRjaGVzV2lkZ2V0ID0gIXJ1biB8fCBvcmNoZXN0cmF0aW9uUnVuTWF0Y2hlc1dpZGdldCh0aGlzLl93aWRnZXQsIHJ1bik7XHJcblx0XHR0aGlzLl9hc3NpZ24uc3R5bGUuZGlzcGxheSA9IGRpYWxlY3RpYyA/ICcnIDogJ25vbmUnO1xyXG5cdFx0aWYgKCFkaWFsZWN0aWMpIHtcclxuXHRcdFx0dGhpcy5fcGlja2VyT3BlbiA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0Y29uc3QgdmlzaWJsZVJ1biA9IG1hdGNoZXNXaWRnZXQgJiYgcnVuICYmIChkaWFsZWN0aWMgfHwgaXNBY3RpdmVPcmNoZXN0cmF0aW9uU3RhdHVzKHJ1bi5zdGF0dXMpKSA/IHJ1biA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZW5kZXJBc3NpZ24oYXNzaWdubWVudCk7XG5cdFx0dGhpcy5fcmVuZGVyUGlja2VyKGFzc2lnbm1lbnQpO1xuXHRcdHRoaXMuX3JlbmRlclN0YXR1cyh2aXNpYmxlUnVuKTtcblx0XHR0aGlzLl9ob3N0LnN0eWxlLmRpc3BsYXkgPSBkaWFsZWN0aWMgfHwgdmlzaWJsZVJ1biA/ICcnIDogJ25vbmUnO1xuXHR9XHJcblxyXG5cdHByaXZhdGUgX3JlbmRlckFzc2lnbihhc3NpZ25tZW50OiBJT3JjaGVzdHJhdGlvbkFzc2lnbm1lbnQpOiB2b2lkIHtcclxuXHRcdGNsZWFyTm9kZSh0aGlzLl9hc3NpZ24pO1xyXG5cdFx0dGhpcy5fYXNzaWduLmNsYXNzTGlzdC50b2dnbGUoJ29wZW4nLCB0aGlzLl9waWNrZXJPcGVuKTtcclxuXHRcdHRoaXMuX2Fzc2lnbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCB0aGlzLl9waWNrZXJPcGVuID8gJ3RydWUnIDogJ2ZhbHNlJyk7XHJcblx0XHR0aGlzLl9hc3NpZ24uc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2RpYWxvZycpO1xyXG5cdFx0YXBwZW5kKHRoaXMuX2Fzc2lnbiwgJCgnc3Bhbi5mb3JnZS1vcmNoLWFzc2lnbi1rJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5sZWFkZXJTaG9ydCcsIFwiTGVhZGVyXCIpKSk7XHJcblx0XHRhcHBlbmQodGhpcy5fYXNzaWduLCAkKCdzcGFuLmZvcmdlLW9yY2gtYXNzaWduLXYnLCB1bmRlZmluZWQsIGFnZW50TGFiZWwoYXNzaWdubWVudC5sZWFkZXIpKSk7XHJcblx0XHRhcHBlbmQodGhpcy5fYXNzaWduLCAkKCdzcGFuLmZvcmdlLW9yY2gtYXNzaWduLWsnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLndvcmtlclNob3J0JywgXCJXb3JrZXJcIikpKTtcclxuXHRcdGFwcGVuZCh0aGlzLl9hc3NpZ24sICQoJ3NwYW4uZm9yZ2Utb3JjaC1hc3NpZ24tdicsIHVuZGVmaW5lZCwgYXNzaWdubWVudC53b3JrZXJzLm1hcCh3b3JrZXIgPT4gd29ya2VyLmxhYmVsKS5qb2luKCcgXHUwMEI3ICcpIHx8IGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLm5vV29ya2VyJywgXCJcdTY3MkFcdTkwMDlcdTYyRTlcIikpKTtcclxuXHRcdGNvbnN0IGNoZXZyb24gPSBhcHBlbmQodGhpcy5fYXNzaWduLCAkKCdzcGFuJykpO1xyXG5cdFx0Y2hldnJvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUodGhpcy5fcGlja2VyT3BlbiA/IENvZGljb24uY2hldnJvbkRvd24gOiBDb2RpY29uLmNoZXZyb25VcCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9yZW5kZXJQaWNrZXIoYXNzaWdubWVudDogSU9yY2hlc3RyYXRpb25Bc3NpZ25tZW50KTogdm9pZCB7XHJcblx0XHR0aGlzLl9waWNrZXJTdG9yZS5jbGVhcigpO1xyXG5cdFx0Y2xlYXJOb2RlKHRoaXMuX3BpY2tlcik7XHJcblx0XHR0aGlzLl9waWNrZXIuc3R5bGUuZGlzcGxheSA9IHRoaXMuX3BpY2tlck9wZW4gPyAnJyA6ICdub25lJztcclxuXHRcdGlmICghdGhpcy5fcGlja2VyT3Blbikge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHRjb25zdCBzZXR1cCA9IHJlYWRGb3JnZUFnZW50U2V0dXAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoRk9SR0VfQUdFTlRfU0VUVVBfU0VUVElOR19JRCkpO1xyXG5cdFx0Y29uc3QgaGVhZCA9IGFwcGVuZCh0aGlzLl9waWNrZXIsICQoJ2Rpdi5mb3JnZS1hZ2VudC1waWNrZXItaGVhZCcpKTtcclxuXHRcdGFwcGVuZChoZWFkLCAkKCdkaXYuZm9yZ2Utb3JjaC1waWNrZXItdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnBpY2snLCBcIlx1NjMwN1x1NUI5QSBMZWFkZXIgXHU1NDhDIFdvcmtlclwiKSkpO1xyXG5cdFx0Y29uc3QgZ2VhciA9IGFwcGVuZChoZWFkLCAkKCdidXR0b24uZm9yZ2UtYWdlbnQtcGlja2VyLXNldHVwJywgeyB0eXBlOiAnYnV0dG9uJyB9KSk7XHJcblx0XHRnZWFyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdmb3JnZS5hZ2VudFNldHVwLm9wZW4nLCBcIlx1OTE0RFx1N0Y2RSBBZ2VudCBcdTZBMjFcdTU3OEJcIikpO1xyXG5cdFx0Z2Vhci5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZ2VhcikpO1xyXG5cdFx0dGhpcy5fcGlja2VyU3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnZWFyLCAnY2xpY2snLCBlID0+IHtcclxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG5cdFx0XHR0aGlzLmNsb3NlUGlja2VyKCk7XHJcblx0XHRcdHZvaWQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRk9SR0VfQUdFTlRfU0VUVVBfT1BFTl9BQ1RJT05fSUQsIHsgdGFiOiAnZGlhbGVjdGljJyB9KTtcclxuXHRcdH0pKTtcclxuXHRcdGFwcGVuZCh0aGlzLl9waWNrZXIsICQoJ2Rpdi5mb3JnZS1vcmNoLXBpY2tlci10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24ucGlja0xlYWRlcicsIFwiXHU5MDA5XHU2MkU5IExlYWRlclwiKSkpO1xyXG5cdFx0Y29uc3QgbGVhZGVycyA9IGFwcGVuZCh0aGlzLl9waWNrZXIsICQoJ2Rpdi5mb3JnZS1vcmNoLWNob2ljZXMnLCB7IHJvbGU6ICdyYWRpb2dyb3VwJyB9KSk7XHJcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIEZPUkdFX09SQ0hFU1RSQVRJT05fQUdFTlRTKSB7XHJcblx0XHRcdGNvbnN0IG1vZGVsID0gZ2V0QWdlbnRQcm9maWxlKHNldHVwLCAnZGlhbGVjdGljJywgYWdlbnQucHJvdmlkZXJJZCkubW9kZWwgPz8gYWdlbnQuZGVmYXVsdE1vZGVsO1xyXG5cdFx0XHR0aGlzLl9jaG9pY2UobGVhZGVycywgYWdlbnQubGFiZWwsIG1vZGVsLCBhc3NpZ25tZW50LmxlYWRlci5wcm92aWRlcklkID09PSBhZ2VudC5wcm92aWRlcklkLCAncmFkaW8nLCAoKSA9PiB7XHJcblx0XHRcdFx0dGhpcy5fc2F2ZUFzc2lnbm1lbnQoe1xyXG5cdFx0XHRcdFx0bGVhZGVyOiBwcm92aWRlclJlZkZyb21Qcm9maWxlKGFnZW50LnByb3ZpZGVySWQsICdsZWFkZXInLCBzZXR1cCksXHJcblx0XHRcdFx0XHR3b3JrZXJzOiBhc3NpZ25tZW50LndvcmtlcnMsXHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdFx0YXBwZW5kKHRoaXMuX3BpY2tlciwgJCgnZGl2LmZvcmdlLW9yY2gtcGlja2VyLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5waWNrV29ya2VycycsIFwiXHU5MDA5XHU2MkU5IFdvcmtlclx1RkYwOFx1NTNFRlx1NTkxQVx1OTAwOVx1RkYwOVwiKSkpO1xyXG5cdFx0Y29uc3Qgd29ya2VycyA9IGFwcGVuZCh0aGlzLl9waWNrZXIsICQoJ2Rpdi5mb3JnZS1vcmNoLWNob2ljZXMnKSk7XHJcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIEZPUkdFX09SQ0hFU1RSQVRJT05fQUdFTlRTKSB7XHJcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gYXNzaWdubWVudC53b3JrZXJzLnNvbWUod29ya2VyID0+IHdvcmtlci5wcm92aWRlcklkID09PSBhZ2VudC5wcm92aWRlcklkKTtcclxuXHRcdFx0Y29uc3QgbW9kZWwgPSBnZXRBZ2VudFByb2ZpbGUoc2V0dXAsICdkaWFsZWN0aWMnLCBhZ2VudC5wcm92aWRlcklkKS5tb2RlbCA/PyBhZ2VudC5kZWZhdWx0TW9kZWw7XHJcblx0XHRcdHRoaXMuX2Nob2ljZSh3b3JrZXJzLCBhZ2VudC5sYWJlbCwgbW9kZWwsIHNlbGVjdGVkLCAnY2hlY2tib3gnLCAoKSA9PiB7XHJcblx0XHRcdFx0Y29uc3QgbmV4dFdvcmtlcnMgPSBzZWxlY3RlZFxyXG5cdFx0XHRcdFx0PyBhc3NpZ25tZW50LndvcmtlcnMuZmlsdGVyKHdvcmtlciA9PiB3b3JrZXIucHJvdmlkZXJJZCAhPT0gYWdlbnQucHJvdmlkZXJJZClcclxuXHRcdFx0XHRcdDogWy4uLmFzc2lnbm1lbnQud29ya2VycywgcHJvdmlkZXJSZWZGcm9tUHJvZmlsZShhZ2VudC5wcm92aWRlcklkLCAnd29ya2VyJywgc2V0dXApXTtcclxuXHRcdFx0XHRpZiAobmV4dFdvcmtlcnMubGVuZ3RoID09PSAwKSB7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHRoaXMuX3NhdmVBc3NpZ25tZW50KHtcclxuXHRcdFx0XHRcdGxlYWRlcjogYXNzaWdubWVudC5sZWFkZXIsXHJcblx0XHRcdFx0XHR3b3JrZXJzOiBGT1JHRV9PUkNIRVNUUkFUSU9OX0FHRU5UU1xyXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IG5leHRXb3JrZXJzLnNvbWUod29ya2VyID0+IHdvcmtlci5wcm92aWRlcklkID09PSBlbnRyeS5wcm92aWRlcklkKSlcclxuXHRcdFx0XHRcdFx0Lm1hcChlbnRyeSA9PiBwcm92aWRlclJlZkZyb21Qcm9maWxlKGVudHJ5LnByb3ZpZGVySWQsICd3b3JrZXInLCBzZXR1cCkpLFxyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2Nob2ljZShwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBtb2RlbDogc3RyaW5nLCBzZWxlY3RlZDogYm9vbGVhbiwga2luZDogJ3JhZGlvJyB8ICdjaGVja2JveCcsIHJ1bjogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG5cdFx0Y29uc3QgYnV0dG9uID0gYXBwZW5kKHBhcmVudCwgJCgnYnV0dG9uLmZvcmdlLW9yY2gtY2hvaWNlJywgeyB0eXBlOiAnYnV0dG9uJyB9KSk7XHJcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywga2luZCA9PT0gJ3JhZGlvJyA/ICdyYWRpbycgOiAnY2hlY2tib3gnKTtcclxuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIHNlbGVjdGVkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XHJcblx0XHRidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBzZWxlY3RlZCk7XHJcblx0XHRhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmZvcmdlLW9yY2gtY2hvaWNlLW1hcmsnKSk7XHJcblx0XHRhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmZvcmdlLW9yY2gtY2hvaWNlLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xyXG5cdFx0YXBwZW5kKGJ1dHRvbiwgJCgnc3Bhbi5mb3JnZS1vcmNoLWNob2ljZS1tb2RlbCcsIHVuZGVmaW5lZCwgbW9kZWwpKTtcclxuXHRcdHRoaXMuX3BpY2tlclN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCBydW4pKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3NhdmVBc3NpZ25tZW50KGFzc2lnbm1lbnQ6IElPcmNoZXN0cmF0aW9uQXNzaWdubWVudCk6IHZvaWQge1xyXG5cdFx0ZGlzcGF0Y2hGb3JnZVJvb3RDb25maWcodGhpcy5fYWdlbnRIb3N0U2VydmljZSwgeyBbRk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UX0tFWV06IGFzc2lnbm1lbnQgfSk7XHJcblx0XHR2b2lkIHBlcnNpc3RPcmNoZXN0cmF0aW9uQXNzaWdubWVudCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgYXNzaWdubWVudCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9yZW5kZXJTdGF0dXMocnVuOiBJT3JjaGVzdHJhdGlvblJ1blN0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XHJcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcclxuXHRcdHRoaXMuX3N0YXR1c1N0b3JlLnZhbHVlID0gc3RvcmU7XHJcblx0XHRjbGVhck5vZGUodGhpcy5fc3RhdHVzKTtcclxuXHRcdGlmICghcnVuIHx8IHJ1bi5zdGF0dXMgPT09ICdpZGxlJykge1xuXHRcdFx0dGhpcy5fc3RhdHVzLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxyXG5cdFx0dGhpcy5fc3RhdHVzLnN0eWxlLmRpc3BsYXkgPSAnJztcclxuXHRcdGNvbnN0IHJvdyA9IGFwcGVuZCh0aGlzLl9zdGF0dXMsICQoJy5mb3JnZS1vcmNoLXJvdycpKTtcclxuXHRcdGFwcGVuZChyb3csICQoJ3NwYW4uZm9yZ2Utb3JjaC1zdGF0dXMnLCB1bmRlZmluZWQsIHN0YXR1c0xhYmVsKHJ1bi5zdGF0dXMpKSkuY2xhc3NMaXN0LmFkZChydW4uc3RhdHVzKTtcclxuXHRcdGFwcGVuZChyb3csICQoJ3NwYW4uZm9yZ2Utb3JjaC10aXRsZScsIHVuZGVmaW5lZCwgcnVuLnBsYW5TdW1tYXJ5IHx8IHJ1bi5nb2FsKSk7XHJcblx0XHRjb25zdCBhY3Rpb25zID0gYXBwZW5kKHJvdywgJCgnLmZvcmdlLW9yY2gtYWN0aW9ucycpKTtcclxuXHRcdGlmIChpc0FjdGl2ZU9yY2hlc3RyYXRpb25TdGF0dXMocnVuLnN0YXR1cykpIHtcblx0XHRcdGlmIChydW4uc3RhdHVzID09PSAncGF1c2VkJykge1xuXHRcdFx0XHR0aGlzLl9idXR0b24oYWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24ucmVzdW1lJywgXCJcdTdFRTdcdTdFRURcIiksICgpID0+IHRoaXMuX2NvbW1hbmQoeyB0eXBlOiAncmVzdW1lJywgcnVuSWQ6IHJ1bi5ydW5JZCB9KSwgc3RvcmUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYnV0dG9uKGFjdGlvbnMsIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnBhdXNlJywgXCJcdTY2ODJcdTUwNUNcIiksICgpID0+IHRoaXMuX2NvbW1hbmQoeyB0eXBlOiAncGF1c2UnLCBydW5JZDogcnVuLnJ1bklkIH0pLCBzdG9yZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9idXR0b24oYWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24uY2FuY2VsJywgXCJcdTUzRDZcdTZEODhcIiksICgpID0+IHRoaXMuX2NvbW1hbmQoeyB0eXBlOiAnY2FuY2VsJywgcnVuSWQ6IHJ1bi5ydW5JZCB9KSwgc3RvcmUpO1xuXHRcdH1cblx0XHR0aGlzLl9idXR0b24oYWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24uc2NtJywgXCJcdTY2RjRcdTY1MzlcIiksICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2gudmlldy5zY20nKSwgc3RvcmUpO1xuXG5cdFx0aWYgKHJ1bi50YXNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCB0YXNrcyA9IGFwcGVuZCh0aGlzLl9zdGF0dXMsICQoJy5mb3JnZS1vcmNoLXRhc2tzJykpO1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHJ1bi50YXNrcykge1xuXHRcdFx0XHRjb25zdCB0YXNrRWxlbWVudCA9IGFwcGVuZCh0YXNrcywgJCgnLmZvcmdlLW9yY2gtdGFzaycpKTtcblx0XHRcdFx0Y29uc3QgdGFza1JvdyA9IGFwcGVuZCh0YXNrRWxlbWVudCwgJCgnLmZvcmdlLW9yY2gtcm93JykpO1xuXHRcdFx0XHRhcHBlbmQodGFza1JvdywgJCgnc3Bhbi5mb3JnZS1vcmNoLXN0YXR1cycsIHVuZGVmaW5lZCwgc3RhdHVzTGFiZWwodGFzay5zdGF0dXMpKSkuY2xhc3NMaXN0LmFkZCh0YXNrLnN0YXR1cyk7XG5cdFx0XHRcdGFwcGVuZCh0YXNrUm93LCAkKCdzcGFuLmZvcmdlLW9yY2gtdGl0bGUnLCB1bmRlZmluZWQsIHRhc2sudGl0bGUpKTtcblx0XHRcdFx0aWYgKHRhc2suc3RhdHVzID09PSAnZmFpbGVkJykge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tBY3Rpb25zID0gYXBwZW5kKHRhc2tSb3csICQoJy5mb3JnZS1vcmNoLWFjdGlvbnMnKSk7XG5cdFx0XHRcdFx0dGhpcy5fYnV0dG9uKHRhc2tBY3Rpb25zLCBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5yZXRyeVRhc2snLCBcIlx1OTFDRFx1OEJENVwiKSwgKCkgPT4gdGhpcy5fY29tbWFuZCh7IHR5cGU6ICdyZXRyeScsIHJ1bklkOiBydW4ucnVuSWQsIHRhc2tJZDogdGFzay5pZCB9KSwgc3RvcmUpO1xuXHRcdFx0XHRcdHRoaXMuX2J1dHRvbih0YXNrQWN0aW9ucywgbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24uZXNjYWxhdGVUYXNrJywgXCJMZWFkZXIgXHU2M0E1XHU3QkExXCIpLCAoKSA9PiB0aGlzLl9jb21tYW5kKHsgdHlwZTogJ2VzY2FsYXRlJywgcnVuSWQ6IHJ1bi5ydW5JZCwgdGFza0lkOiB0YXNrLmlkIH0pLCBzdG9yZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3b3JrZXIgPSB0YXNrLndvcmtlck1vZGVsID8gYCR7dGFzay53b3JrZXJMYWJlbH0gXHUwMEI3ICR7dGFzay53b3JrZXJNb2RlbH1gIDogdGFzay53b3JrZXJMYWJlbDtcblx0XHRcdFx0YXBwZW5kKHRhc2tFbGVtZW50LCAkKCdkaXYuZm9yZ2Utb3JjaC13b3JrZXInLCB1bmRlZmluZWQsIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnRhc2tXb3JrZXInLCBcInswfSBcdTAwQjcgXHU3QjJDIHsxfSBcdTZCMjFcdTVDMURcdThCRDVcIiwgd29ya2VyLCB0YXNrLmF0dGVtcHQgKyAxKSkpO1xuXHRcdFx0XHRjb25zdCBmaWxlcyA9IHRhc2sucmVzdWx0Py5jaGFuZ2VkRmlsZXMubGVuZ3RoID8gdGFzay5yZXN1bHQuY2hhbmdlZEZpbGVzIDogdGFzay5maWxlcztcblx0XHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCB2aXNpYmxlRmlsZXMgPSBmaWxlcy5zbGljZSgwLCAzKS5qb2luKCcgXHUwMEI3ICcpO1xuXHRcdFx0XHRcdGNvbnN0IHN1ZmZpeCA9IGZpbGVzLmxlbmd0aCA+IDMgPyBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5tb3JlRmlsZXMnLCBcIiBcdTAwQjcgXHU1M0U2IHswfSBcdTRFMkFcIiwgZmlsZXMubGVuZ3RoIC0gMykgOiAnJztcblx0XHRcdFx0XHRjb25zdCBmaWxlRWxlbWVudCA9IGFwcGVuZCh0YXNrRWxlbWVudCwgJCgnZGl2LmZvcmdlLW9yY2gtZmlsZXMnLCB1bmRlZmluZWQsIGAke3Zpc2libGVGaWxlc30ke3N1ZmZpeH1gKSk7XG5cdFx0XHRcdFx0ZmlsZUVsZW1lbnQudGl0bGUgPSBmaWxlcy5qb2luKCdcXG4nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlcnJvciA9IHRhc2suZXJyb3IgPz8gdGFzay5yZXN1bHQ/LmVycm9yO1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRhcHBlbmQodGFza0VsZW1lbnQsICQoJ2Rpdi5mb3JnZS1vcmNoLWVycm9yJywgdW5kZWZpbmVkLCBlcnJvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJ1bi5yZXZpZXcpIHtcblx0XHRcdGFwcGVuZCh0aGlzLl9zdGF0dXMsICQoJy5mb3JnZS1vcmNoLXJldmlldycsIHVuZGVmaW5lZCwgcnVuLnJldmlldykpO1xuXHRcdH1cblx0fVxuXHJcblx0cHJpdmF0ZSBfYnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHJ1bjogKCkgPT4gdm9pZCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xyXG5cdFx0Y29uc3QgYnV0dG9uID0gYXBwZW5kKHBhcmVudCwgJCgnYnV0dG9uLmZvcmdlLW9yY2gtYnRuJywgeyB0eXBlOiAnYnV0dG9uJyB9LCBsYWJlbCkpO1xyXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsIHJ1bikpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfY29tbWFuZChjb21tYW5kOiBJT3JjaGVzdHJhdGlvbkNvbW1hbmQpOiB2b2lkIHtcclxuXHRcdHZvaWQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRk9SR0VfT1JDSEVTVFJBVElPTl9DT01NQU5EX0FDVElPTl9JRCwgY29tbWFuZCk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc0Fzc2lnblRvb2xiYXJCdXR0b24odGFyZ2V0OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xyXG5cdGNvbnN0IGl0ZW0gPSB0YXJnZXQuY2xvc2VzdCgnLmFjdGlvbi1pdGVtJyk7XHJcblx0Y29uc3QgbGFiZWxsZWQgPSB0YXJnZXQuY2xvc2VzdCgnW2FyaWEtbGFiZWxdLCBbdGl0bGVdJyk7XHJcblx0Y29uc3QgdGV4dCA9IFtcclxuXHRcdGxhYmVsbGVkPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcclxuXHRcdGxhYmVsbGVkPy5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyksXHJcblx0XHRpdGVtPy5xdWVyeVNlbGVjdG9yKCdbYXJpYS1sYWJlbF0nKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXHJcblx0XHRpdGVtPy5xdWVyeVNlbGVjdG9yKCdbdGl0bGVdJyk/LmdldEF0dHJpYnV0ZSgndGl0bGUnKSxcclxuXHRdLmZpbHRlcihCb29sZWFuKS5qb2luKCcgJyk7XHJcblx0cmV0dXJuIHRleHQuaW5jbHVkZXMoJ1x1NjMwN1x1NUI5QSBMZWFkZXInKSB8fCB0ZXh0LmluY2x1ZGVzKCdMZWFkZXIgLyBXb3JrZXInKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWdlbnRMYWJlbChhZ2VudDogeyBsYWJlbDogc3RyaW5nOyBtb2RlbD86IHN0cmluZyB9KTogc3RyaW5nIHtcclxuXHRyZXR1cm4gYWdlbnQubW9kZWwgPyBgJHthZ2VudC5sYWJlbH0gXHUwMEI3ICR7YWdlbnQubW9kZWx9YCA6IGFnZW50LmxhYmVsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdGF0dXNMYWJlbChzdGF0dXM6IHN0cmluZyk6IHN0cmluZyB7XHJcblx0c3dpdGNoIChzdGF0dXMpIHtcclxuXHRcdGNhc2UgJ3BsYW5uaW5nJzogcmV0dXJuIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnN0YXR1cy5wbGFubmluZycsIFwiXHU4OUM0XHU1MjEyXHU0RTJEXCIpO1xyXG5cdFx0Y2FzZSAncnVubmluZyc6IHJldHVybiBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5zdGF0dXMucnVubmluZycsIFwiXHU2MjY3XHU4ODRDXHU0RTJEXCIpO1xyXG5cdFx0Y2FzZSAncmV2aWV3aW5nJzogcmV0dXJuIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnN0YXR1cy5yZXZpZXdpbmcnLCBcIlx1NUJBMVx1NjgzOFx1NEUyRFwiKTtcclxuXHRcdGNhc2UgJ3F1ZXVlZCc6IHJldHVybiBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5zdGF0dXMucXVldWVkJywgXCJcdTYzOTJcdTk2MUZcIik7XHJcblx0XHRjYXNlICdjb21wbGV0ZWQnOiByZXR1cm4gbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24uc3RhdHVzLmNvbXBsZXRlZCcsIFwiXHU1QjhDXHU2MjEwXCIpO1xyXG5cdFx0Y2FzZSAnZmFpbGVkJzogcmV0dXJuIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnN0YXR1cy5mYWlsZWQnLCBcIlx1NTkzMVx1OEQyNVwiKTtcclxuXHRcdGNhc2UgJ3JldHJ5JzogcmV0dXJuIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnN0YXR1cy5yZXRyeScsIFwiXHU5MUNEXHU4QkQ1XCIpO1xyXG5cdFx0Y2FzZSAnZXNjYWxhdGVkJzogcmV0dXJuIGxvY2FsaXplKCdmb3JnZS5vcmNoZXN0cmF0aW9uLnN0YXR1cy5lc2NhbGF0ZWQnLCBcIlx1NURGMlx1NTM0N1x1N0VBN1wiKTtcclxuXHRcdGNhc2UgJ2NhbmNlbGxlZCc6IHJldHVybiBsb2NhbGl6ZSgnZm9yZ2Uub3JjaGVzdHJhdGlvbi5zdGF0dXMuY2FuY2VsbGVkJywgXCJcdTVERjJcdTUzRDZcdTZEODhcIik7XHJcblx0XHRjYXNlICdwYXVzZWQnOiByZXR1cm4gbG9jYWxpemUoJ2ZvcmdlLm9yY2hlc3RyYXRpb24uc3RhdHVzLnBhdXNlZCcsIFwiXHU1REYyXHU2NjgyXHU1MDVDXCIpO1xyXG5cdFx0ZGVmYXVsdDogcmV0dXJuIHN0YXR1cztcclxuXHR9XHJcbn1cclxuXHJcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihGb3JnZU9yY2hlc3RyYXRpb25Db250cmlidXRpb24uSUQsIEZvcmdlT3JjaGVzdHJhdGlvbkNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFXLGlCQUFpQjtBQUN2RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BSU07QUFDUCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQyxzQkFBc0I7QUFDL0QsU0FBc0Isb0JBQW9CLDhCQUE4QjtBQUN4RSxTQUFvQywwQkFBMEI7QUFDOUQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEIseUJBQXlCO0FBQzlELFNBQVMsa0NBQWtDLDhCQUE4QixpQkFBaUIsd0JBQXdCLDJCQUEyQjtBQUM3STtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFD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
