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
import { $, addDisposableGenericMouseDownListener, addDisposableListener, append, EventType } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action } from "../../../../base/common/actions.js";
import { equals } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derivedOpts } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ActionWidgetDropdownActionViewItem } from "../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js";
import { MenuId, registerAction2, Action2, MenuRegistry, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { logSessionsInteraction } from "../../../common/sessionsTelemetry.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { SessionsCategories } from "../../../common/categories.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionWorkspaceIsVirtualContext, SessionsWelcomeVisibleContext } from "../../../common/contextkeys.js";
import { IChatWidgetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { Menus } from "../../../browser/menus.js";
import { ISessionsTasksService } from "./sessionsTasksService.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { RunScriptCustomTaskWidget } from "./runScriptCustomTaskWidget.js";
const RunScriptDropdownMenuId = MenuId.for("AgentSessionsRunScriptDropdown");
const RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS = "run-script-action-modal-visible";
const RUN_SCRIPT_ACTION_PRIMARY_ID = "workbench.action.agentSessions.runScriptPrimary";
const CONFIGURE_DEFAULT_RUN_ACTION_ID = "workbench.action.agentSessions.configureDefaultRunAction";
const GENERATE_RUN_ACTION_ID = "workbench.action.agentSessions.generateRunAction";
const closeQuickWidgetButton = {
  iconClass: ThemeIcon.asClassName(Codicon.close),
  tooltip: localize("closeQuickWidget", "Close"),
  alwaysVisible: true
};
function getTaskDisplayLabel(task) {
  if (task.label && task.label.length > 0) {
    return task.label;
  }
  if (task.script && task.script.length > 0) {
    return task.script;
  }
  if (task.command && task.command.length > 0) {
    return task.command;
  }
  if (task.task && task.task.toString().length > 0) {
    return task.task.toString();
  }
  return "";
}
function getTaskCommandPreview(task) {
  if (task.command && task.command.length > 0) {
    return task.command;
  }
  if (task.script && task.script.length > 0) {
    return localize("npmTaskCommandPreview", "npm run {0}", task.script);
  }
  if (task.task && task.task.toString().length > 0) {
    return task.task.toString();
  }
  return getTaskDisplayLabel(task);
}
function formatBrowserUrlDescription(url, maxLength) {
  if (!url) {
    return void 0;
  }
  const stripped = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (stripped.length <= maxLength) {
    return stripped;
  }
  return `${stripped.substring(0, maxLength - 3)}...`;
}
function getPrimaryTask(tasks, pinnedTaskLabel) {
  if (tasks.length === 0) {
    return void 0;
  }
  if (pinnedTaskLabel) {
    const pinnedTask = tasks.find((task) => task.task.label === pinnedTaskLabel);
    if (pinnedTask) {
      return pinnedTask;
    }
  }
  return tasks[0];
}
let RunScriptContribution = class extends Disposable {
  constructor(_sessionManagementService, _sessionsService, _keybindingService, _quickInputService, _sessionsConfigService, _actionViewItemService, _layoutService, _telemetryService, _chatWidgetService, _commandService) {
    super();
    this._sessionManagementService = _sessionManagementService;
    this._sessionsService = _sessionsService;
    this._quickInputService = _quickInputService;
    this._sessionsConfigService = _sessionsConfigService;
    this._actionViewItemService = _actionViewItemService;
    this._layoutService = _layoutService;
    this._telemetryService = _telemetryService;
    this._chatWidgetService = _chatWidgetService;
    this._commandService = _commandService;
    this._activeRunState = derivedOpts({
      owner: this,
      equalsFn: (a, b) => {
        if (a === b) {
          return true;
        }
        if (!a || !b) {
          return false;
        }
        return a.session === b.session && a.pinnedTaskLabel === b.pinnedTaskLabel && a.browserUrl === b.browserUrl && a.pinnedBrowser === b.pinnedBrowser && equals(a.tasks, b.tasks, (t1, t2) => t1.task.label === t2.task.label && t1.task.command === t2.task.command && t1.target === t2.target && t1.task.runOptions?.runOn === t2.task.runOptions?.runOn);
      }
    }, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      if (!activeSession) {
        return void 0;
      }
      const tasks = this._sessionsConfigService.getSessionTasks(activeSession).read(reader);
      const folder = activeSession.workspace.read(reader)?.folders[0];
      const pinnedTaskLabel = this._sessionsConfigService.getPinnedTaskLabel(folder?.root).read(reader);
      const browserUrl = this._sessionsConfigService.getBrowserUrl(folder?.root).read(reader);
      const pinnedBrowser = this._sessionsConfigService.getPinnedBrowser(folder?.root).read(reader);
      return { session: activeSession, tasks, pinnedTaskLabel, browserUrl, pinnedBrowser };
    }).recomputeInitiallyAndOnChange(this._store);
    this._registerActionViewItemProvider();
    this._registerActions();
  }
  _registerActionViewItemProvider() {
    const that = this;
    this._register(this._actionViewItemService.register(
      Menus.TitleBarCenterRight,
      RunScriptDropdownMenuId,
      (action, options, instantiationService) => {
        if (!(action instanceof SubmenuItemAction)) {
          return void 0;
        }
        return instantiationService.createInstance(
          RunScriptActionViewItem,
          action,
          options,
          that._activeRunState,
          (session) => that._showConfigureQuickPick(session),
          (session, existingTask, mode) => that._showCustomCommandInput(session, existingTask, mode),
          (session) => that._generateNewTask(session),
          (session) => that._configureBrowserUrl(session)
        );
      }
    ));
  }
  _registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: RUN_SCRIPT_ACTION_PRIMARY_ID,
          title: { value: localize("runPrimaryTask", "Run Primary Task"), original: "Run Primary Task" },
          icon: Codicon.play,
          category: SessionsCategories.Sessions,
          f1: true
        });
      }
      async run() {
        const activeState = that._activeRunState.get();
        if (!activeState) {
          return;
        }
        logSessionsInteraction(that._telemetryService, "runPrimaryTask");
        const { tasks, session, pinnedBrowser, browserUrl } = activeState;
        if (pinnedBrowser) {
          await that._commandService.executeCommand("simpleBrowser.show", browserUrl);
          return;
        }
        if (tasks.length === 0) {
          const task = await that._showConfigureQuickPick(session);
          if (task) {
            await that._sessionsConfigService.runTask(task, session);
          }
          return;
        }
        const primaryTask = getPrimaryTask(tasks, activeState.pinnedTaskLabel);
        if (!primaryTask) {
          return;
        }
        await that._sessionsConfigService.runTask(primaryTask.task, session);
      }
    }));
    this._register(autorun((reader) => {
      const activeState = this._activeRunState.read(reader);
      if (!activeState) {
        return;
      }
      const { session, tasks } = activeState;
      const folder = session.workspace.read(reader)?.folders[0];
      const configureScriptPrecondition = folder?.workingDirectory ? ContextKeyExpr.true() : ContextKeyExpr.false();
      reader.store.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: CONFIGURE_DEFAULT_RUN_ACTION_ID,
            title: localize2("configureDefaultRunAction", "Add Task..."),
            category: SessionsCategories.Sessions,
            icon: Codicon.add,
            precondition: configureScriptPrecondition,
            menu: [{
              id: RunScriptDropdownMenuId,
              group: tasks.length === 0 ? "navigation" : "1_configure",
              order: 0
            }]
          });
        }
        async run() {
          logSessionsInteraction(that._telemetryService, "addTask", "menu");
          const task = await that._showConfigureQuickPick(session);
          if (task) {
            await that._sessionsConfigService.runTask(task, session);
          }
        }
      }));
      reader.store.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: GENERATE_RUN_ACTION_ID,
            title: localize2("generateRunAction", "Generate New Task..."),
            category: SessionsCategories.Sessions,
            precondition: SessionWorkspaceIsVirtualContext.toNegated(),
            menu: [{
              id: RunScriptDropdownMenuId,
              group: tasks.length === 0 ? "navigation" : "1_configure",
              order: 1
            }]
          });
        }
        async run() {
          logSessionsInteraction(that._telemetryService, "generateNewTask", "menu");
          await that._generateNewTask(session);
        }
      }));
    }));
  }
  async _generateNewTask(session) {
    const query = "/generate-run-commands";
    const widget = this._chatWidgetService.getWidgetBySessionResource(session.mainChat.get().resource);
    if (widget) {
      await widget.acceptInput(query);
    } else {
      await this._sessionManagementService.sendNewChatRequest(session, { query });
    }
  }
  async _configureBrowserUrl(session) {
    const folder = session.workspace.get()?.folders[0];
    if (!folder?.root) {
      return;
    }
    const currentUrl = this._sessionsConfigService.getBrowserUrl(folder.root).get();
    const url = await this._quickInputService.input({
      title: localize("configureBrowserUrlTitle", "Configure Browser URL"),
      prompt: localize("configureBrowserUrlPrompt", "Enter the URL to open in the integrated browser. Leave empty to clear."),
      placeHolder: "https://example.com",
      value: currentUrl ?? "",
      ignoreFocusLost: true
    });
    if (url === void 0) {
      return;
    }
    this._sessionsConfigService.setBrowserUrl(folder.root, url);
  }
  async _showConfigureQuickPick(session) {
    const nonSessionTasks = await this._sessionsConfigService.getNonSessionTasks(session);
    if (nonSessionTasks.length === 0) {
      return this._showCustomCommandInput(session);
    }
    const items = [];
    items.push({ type: "separator", label: localize("custom", "Custom") });
    items.push({
      label: localize("createNewTask", "Create new task..."),
      description: localize("enterCustomCommandDesc", "Create a new shell task")
    });
    if (nonSessionTasks.length > 0) {
      items.push({ type: "separator", label: localize("existingTasks", "Existing Tasks") });
      for (const { task, target } of nonSessionTasks) {
        items.push({
          label: getTaskDisplayLabel(task),
          description: task.command,
          task,
          source: target
        });
      }
    }
    const picked = await this._quickInputService.pick(items, {
      placeHolder: localize("pickRunAction", "Select or create a task")
    });
    if (!picked) {
      return void 0;
    }
    const pickedItem = picked;
    if (pickedItem.task) {
      return this._showCustomCommandInput(session, { task: pickedItem.task, target: pickedItem.source ?? "workspace" }, "add", true);
    } else {
      return this._showCustomCommandInput(session, void 0, "add", true);
    }
  }
  async _showCustomCommandInput(session, existingTask, mode = "add", allowBackNavigation = false) {
    const taskConfiguration = await this._showCustomCommandWidget(session, existingTask, mode, allowBackNavigation);
    if (!taskConfiguration) {
      return void 0;
    }
    if (taskConfiguration === "back") {
      return this._showConfigureQuickPick(session);
    }
    if (existingTask) {
      if (mode === "configure") {
        const newLabel = taskConfiguration.label?.trim() || existingTask.task.label || taskConfiguration.command;
        let updatedTask = {
          ...existingTask.task,
          label: newLabel,
          inAgents: true
        };
        if (taskConfiguration.command && existingTask.task.command !== void 0) {
          updatedTask = {
            ...updatedTask,
            command: taskConfiguration.command
          };
        }
        if (taskConfiguration.runOn) {
          updatedTask = {
            ...updatedTask,
            runOptions: {
              ...existingTask.task.runOptions ?? {},
              runOn: taskConfiguration.runOn
            }
          };
        }
        await this._sessionsConfigService.updateTask(existingTask.task.label, updatedTask, session, existingTask.target, taskConfiguration.target);
        return updatedTask;
      }
      await this._sessionsConfigService.addTaskToSessions(existingTask.task, session, existingTask.target, { runOn: taskConfiguration.runOn ?? "default" });
      return {
        ...existingTask.task,
        inAgents: true,
        ...taskConfiguration.runOn ? { runOptions: { runOn: taskConfiguration.runOn } } : {}
      };
    }
    return this._sessionsConfigService.createAndAddTask(
      taskConfiguration.label,
      taskConfiguration.command,
      session,
      taskConfiguration.target,
      taskConfiguration.runOn ? { runOn: taskConfiguration.runOn } : void 0
    );
  }
  _showCustomCommandWidget(session, existingTask, mode = "add", allowBackNavigation = false) {
    const folder = session.workspace.get()?.folders[0];
    const workspaceTargetDisabledReason = !(folder?.workingDirectory ?? folder?.root) ? localize("workspaceStorageUnavailableTooltip", "Workspace storage is unavailable for this session") : void 0;
    const isConfigureMode = mode === "configure";
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let settled = false;
      const quickWidget = disposables.add(this._quickInputService.createQuickWidget());
      quickWidget.title = isConfigureMode ? localize("configureActionWidgetTitle", "Configure Task") : existingTask ? localize("addExistingActionWidgetTitle", "Add Existing Task") : localize("addActionWidgetTitle", "Add Task");
      quickWidget.description = isConfigureMode ? localize("configureActionWidgetDescription", "Update how this task is named, saved, and run.") : existingTask ? localize("addExistingActionWidgetDescription", "Enable an existing task for sessions and configure when it should run.") : localize("addActionWidgetDescription", "Create a shell task and configure how it should be saved and run.");
      quickWidget.ignoreFocusOut = true;
      quickWidget.buttons = allowBackNavigation ? [this._quickInputService.backButton, closeQuickWidgetButton] : [closeQuickWidgetButton];
      const widget = disposables.add(new RunScriptCustomTaskWidget({
        label: existingTask?.task.label,
        labelDisabledReason: existingTask && !isConfigureMode ? localize("existingTaskLabelLocked", "This name comes from an existing task and cannot be changed here.") : void 0,
        command: existingTask ? getTaskCommandPreview(existingTask.task) : void 0,
        commandDisabledReason: existingTask && !isConfigureMode ? localize("existingTaskCommandLocked", "This command comes from an existing task and cannot be changed here.") : void 0,
        target: existingTask?.target,
        targetDisabledReason: existingTask && !isConfigureMode ? localize("existingTaskTargetLocked", "This existing task cannot be moved between workspace and user storage.") : workspaceTargetDisabledReason,
        runOn: existingTask?.task.runOptions?.runOn === "worktreeCreated" ? "worktreeCreated" : void 0,
        mode: isConfigureMode ? "configure" : existingTask ? "add-existing" : "add"
      }));
      quickWidget.widget = widget.domNode;
      this._layoutService.mainContainer.classList.add(RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS);
      const backdrop = append(this._layoutService.mainContainer, $(".run-script-action-modal-backdrop"));
      disposables.add(addDisposableGenericMouseDownListener(backdrop, (e) => {
        e.preventDefault();
        e.stopPropagation();
        complete(void 0);
      }));
      disposables.add({ dispose: () => backdrop.remove() });
      disposables.add({ dispose: () => this._layoutService.mainContainer.classList.remove(RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS) });
      const complete = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
        quickWidget.hide();
      };
      disposables.add(widget.onDidSubmit((result) => complete(result)));
      disposables.add(widget.onDidCancel(() => complete(void 0)));
      disposables.add(quickWidget.onDidTriggerButton((button) => {
        if (allowBackNavigation && button === this._quickInputService.backButton) {
          settled = true;
          resolve("back");
          quickWidget.hide();
          return;
        }
        if (button === closeQuickWidgetButton) {
          complete(void 0);
        }
      }));
      disposables.add(quickWidget.onDidHide(() => {
        if (!settled) {
          settled = true;
          resolve(void 0);
        }
        disposables.dispose();
      }));
      quickWidget.show();
      widget.focus();
    });
  }
};
RunScriptContribution.ID = "workbench.contrib.agentSessions.runScript";
RunScriptContribution = __decorateClass([
  __decorateParam(0, ISessionsManagementService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, ISessionsTasksService),
  __decorateParam(5, IActionViewItemService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IChatWidgetService),
  __decorateParam(9, ICommandService)
], RunScriptContribution);
let RunScriptActionViewItem = class extends BaseActionViewItem {
  constructor(action, _options, _activeRunState, _showConfigureQuickPick, _showCustomCommandInput, _generateNewTask, _configureBrowserUrl, _commandService, _sessionsConfigService, _keybindingService, _actionWidgetService, contextKeyService, _telemetryService) {
    super(void 0, action);
    this._activeRunState = _activeRunState;
    this._showConfigureQuickPick = _showConfigureQuickPick;
    this._showCustomCommandInput = _showCustomCommandInput;
    this._generateNewTask = _generateNewTask;
    this._configureBrowserUrl = _configureBrowserUrl;
    this._commandService = _commandService;
    this._sessionsConfigService = _sessionsConfigService;
    this._keybindingService = _keybindingService;
    this._actionWidgetService = _actionWidgetService;
    this._telemetryService = _telemetryService;
    const state = this._activeRunState.get();
    const isPrimaryEnabled = !!state && (state.tasks.length > 0 || state.pinnedBrowser);
    this._primaryActionAction = this._register(new Action(
      "agentSessions.runScriptPrimary",
      this._getPrimaryActionTooltip(state),
      ThemeIcon.asClassName(Codicon.play),
      isPrimaryEnabled,
      () => this._commandService.executeCommand(RUN_SCRIPT_ACTION_PRIMARY_ID)
    ));
    this._primaryAction = this._register(new ActionViewItem(void 0, this._primaryActionAction, { icon: true, label: false }));
    this._register(autorun((reader) => {
      const runState = this._activeRunState.read(reader);
      this._primaryActionAction.enabled = !!runState && (runState.tasks.length > 0 || runState.pinnedBrowser);
      this._primaryActionAction.label = this._getPrimaryActionTooltip(runState);
    }));
    const dropdownAction = this._register(new Action("agentSessions.runScriptDropdown", localize("runDropdown", "More Tasks...")));
    this._dropdown = this._register(new ChevronActionWidgetDropdown(
      dropdownAction,
      {
        actionProvider: { getActions: () => this._getDropdownActions() },
        showItemKeybindings: true,
        listOptions: { className: "compact-icons" }
      },
      this._actionWidgetService,
      this._keybindingService,
      contextKeyService,
      this._telemetryService
    ));
  }
  render(container) {
    super.render(container);
    container.classList.add("monaco-dropdown-with-default");
    const primaryContainer = $(".action-container");
    this._primaryAction.render(append(container, primaryContainer));
    this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow)) {
        this._primaryAction.blur();
        this._dropdown.focus();
        event.stopPropagation();
      }
    }));
    const dropdownContainer = $(".dropdown-action-container");
    this._dropdown.render(append(container, dropdownContainer));
    this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.LeftArrow)) {
        this._dropdown.setFocusable(false);
        this._primaryAction.focus();
        event.stopPropagation();
      }
    }));
  }
  focus(fromRight) {
    if (fromRight) {
      this._dropdown.focus();
    } else {
      this._primaryAction.focus();
    }
  }
  blur() {
    this._primaryAction.blur();
    this._dropdown.blur();
  }
  setFocusable(focusable) {
    this._primaryAction.setFocusable(focusable);
    if (!focusable) {
      this._dropdown.setFocusable(false);
    }
  }
  _getPrimaryActionTooltip(state) {
    const keybindingLabel = this._keybindingService.lookupKeybinding(RUN_SCRIPT_ACTION_PRIMARY_ID)?.getLabel();
    const withKeybinding = (label) => keybindingLabel ? localize("runActionTooltipKeybinding", "{0} ({1})", label, keybindingLabel) : label;
    if (state?.pinnedBrowser) {
      return withKeybinding(localize("openBrowserAction", "Open Browser"));
    }
    if (!state || state.tasks.length === 0) {
      return localize("runPrimaryTaskTooltip", "Run Primary Task");
    }
    const primaryTask = getPrimaryTask(state.tasks, state.pinnedTaskLabel)?.task;
    if (!primaryTask) {
      return localize("runPrimaryTaskTooltip", "Run Primary Task");
    }
    return withKeybinding(getTaskDisplayLabel(primaryTask));
  }
  _getDropdownActions() {
    const state = this._activeRunState.get();
    if (!state) {
      return [];
    }
    const { tasks, session, pinnedTaskLabel } = state;
    const folder = session.workspace.get()?.folders[0];
    const actions = [];
    const defaultCategory = { label: "", order: 0, showHeader: false };
    const worktreeCategory = { label: localize("worktreeCreationCategory", "Run on Worktree Creation"), order: 1, showHeader: true };
    const tasksCategory = { label: localize("tasksActionsCategory", "Tasks"), order: 2, showHeader: true };
    for (let i = 0; i < tasks.length; i++) {
      const entry = tasks[i];
      const task = entry.task;
      const isWorktreeTask = task.runOptions?.runOn === "worktreeCreated";
      const isPinned = task.label === pinnedTaskLabel;
      const toolbarActions = [
        {
          id: `runScript.pin.${i}`,
          label: isPinned ? localize("unpinTask", "Unpin") : localize("pinTask", "Pin"),
          tooltip: isPinned ? localize("unpinTaskTooltip", "Unpin") : localize("pinTaskTooltip", "Pin"),
          class: ThemeIcon.asClassName(isPinned ? Codicon.pinned : Codicon.pin),
          enabled: !!folder?.root,
          run: async () => {
            this._actionWidgetService.hide();
            this._sessionsConfigService.setPinnedTaskLabel(folder?.root, isPinned ? void 0 : task.label);
          }
        },
        {
          id: `runScript.configure.${i}`,
          label: localize("configureTask", "Configure"),
          tooltip: localize("configureTask", "Configure"),
          class: ThemeIcon.asClassName(Codicon.gear),
          enabled: true,
          run: async () => {
            this._actionWidgetService.hide();
            await this._showCustomCommandInput(session, { task, target: entry.target }, "configure");
          }
        },
        {
          id: `runScript.remove.${i}`,
          label: localize("removeTask", "Remove"),
          tooltip: localize("removeTask", "Remove"),
          class: ThemeIcon.asClassName(Codicon.close),
          enabled: true,
          run: async () => {
            this._actionWidgetService.hide();
            await this._sessionsConfigService.removeTask(task.label, session, entry.target);
          }
        }
      ];
      actions.push({
        id: `runScript.task.${i}`,
        label: getTaskDisplayLabel(task),
        tooltip: "",
        hover: {
          content: localize("runActionTooltip", "Run '{0}' in terminal", getTaskDisplayLabel(task))
        },
        icon: Codicon.runCompact,
        enabled: true,
        class: void 0,
        category: isWorktreeTask ? worktreeCategory : defaultCategory,
        toolbarActions,
        run: async () => {
          await this._sessionsConfigService.runTask(task, session);
        }
      });
    }
    const canConfigure = !!(folder?.workingDirectory ?? folder?.root);
    actions.push({
      id: "runScript.addAction",
      label: localize("configureDefaultRunAction", "Add Task..."),
      tooltip: "",
      hover: {
        content: canConfigure ? localize("addActionTooltip", "Add a new task") : localize("addActionTooltipDisabled", "Cannot add tasks to this session because workspace storage is unavailable")
      },
      icon: Codicon.addCompact,
      enabled: canConfigure,
      class: void 0,
      category: tasksCategory,
      run: async () => {
        logSessionsInteraction(this._telemetryService, "addTask", "actionWidget");
        const task = await this._showConfigureQuickPick(session);
        if (task) {
          await this._sessionsConfigService.runTask(task, session);
        }
      }
    });
    actions.push({
      id: "runScript.generateAction",
      label: localize("generateRunAction", "Generate New Task..."),
      tooltip: "",
      hover: {
        content: localize("generateRunActionTooltip", "Generate a new workspace task")
      },
      icon: Codicon.sparkleCompact,
      enabled: true,
      class: void 0,
      category: tasksCategory,
      run: async () => {
        logSessionsInteraction(this._telemetryService, "generateNewTask", "actionWidget");
        await this._generateNewTask(session);
      }
    });
    const browserCategory = { label: localize("browserActionsCategory", "Browser"), order: 3, showHeader: true };
    const browserUrl = state.browserUrl;
    const browserUrlDescription = formatBrowserUrlDescription(browserUrl, 20);
    const canConfigureBrowser = !!folder?.root;
    const isBrowserPinned = state.pinnedBrowser;
    actions.push({
      id: "runScript.openBrowser",
      label: localize("openBrowserAction", "Open Browser"),
      tooltip: "",
      description: browserUrlDescription,
      hover: {
        content: browserUrl ? localize("openBrowserActionTooltip", "Open '{0}' in the integrated browser", browserUrl) : localize("openBrowserActionTooltipUnconfigured", "Open the integrated browser")
      },
      icon: Codicon.windowCompact,
      enabled: true,
      class: void 0,
      category: browserCategory,
      toolbarActions: [
        {
          id: "runScript.pinBrowser",
          label: isBrowserPinned ? localize("unpinBrowser", "Unpin") : localize("pinBrowser", "Pin"),
          tooltip: isBrowserPinned ? localize("unpinBrowserTooltip", "Unpin") : localize("pinBrowserTooltip", "Pin"),
          class: ThemeIcon.asClassName(isBrowserPinned ? Codicon.pinned : Codicon.pin),
          enabled: !!folder?.root,
          run: async () => {
            this._actionWidgetService.hide();
            this._sessionsConfigService.setPinnedBrowser(folder?.root, !isBrowserPinned);
          }
        },
        {
          id: "runScript.configureBrowser",
          label: localize("configureBrowserUrl", "Configure URL"),
          tooltip: localize("configureBrowserUrl", "Configure URL"),
          class: ThemeIcon.asClassName(Codicon.gear),
          enabled: canConfigureBrowser,
          run: async () => {
            this._actionWidgetService.hide();
            await this._configureBrowserUrl(session);
          }
        }
      ],
      run: async () => {
        await this._commandService.executeCommand("simpleBrowser.show", browserUrl);
      }
    });
    return actions;
  }
};
RunScriptActionViewItem = __decorateClass([
  __decorateParam(7, ICommandService),
  __decorateParam(8, ISessionsTasksService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IActionWidgetService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, ITelemetryService)
], RunScriptActionViewItem);
class ChevronActionWidgetDropdown extends ActionWidgetDropdownActionViewItem {
  renderLabel(element) {
    element.classList.add("codicon", "codicon-chevron-down");
    return null;
  }
}
MenuRegistry.appendMenuItem(Menus.TitleBarCenterRight, {
  submenu: RunScriptDropdownMenuId,
  isSplitButton: true,
  title: localize2("run", "Run"),
  icon: Codicon.play,
  group: "navigation",
  order: 6,
  when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionWorkspaceIsVirtualContext.toNegated())
});
class RunScriptNotAvailableAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.agentSessions.runScript.notAvailable",
      title: localize2("run", "Run"),
      tooltip: localize("runScriptNotAvailableTooltip", "Run Task is not available for this session type"),
      icon: Codicon.play,
      precondition: ContextKeyExpr.false(),
      menu: [{
        id: Menus.TitleBarCenterRight,
        group: "navigation",
        order: 6,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionWorkspaceIsVirtualContext)
      }]
    });
  }
  run() {
  }
}
registerAction2(RunScriptNotAvailableAction);
KeybindingsRegistry.registerKeybindingRule({
  id: RUN_SCRIPT_ACTION_PRIMARY_ID,
  primary: KeyCode.F5,
  weight: KeybindingWeight.WorkbenchContrib + 100,
  when: IsAuxiliaryWindowContext.toNegated()
});
export {
  RunScriptContribution,
  RunScriptDropdownMenuId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxccnVuU2NyaXB0QWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5LCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2dTZXNzaW9uc0ludGVyYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uV29ya3NwYWNlSXNWaXJ0dWFsQ29udGV4dCwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSU5vblNlc3Npb25UYXNrRW50cnksIElTZXNzaW9uc1Rhc2tzU2VydmljZSwgSVNlc3Npb25UYXNrV2l0aFRhcmdldCwgSVRhc2tFbnRyeSwgVGFza1N0b3JhZ2VUYXJnZXQgfSBmcm9tICcuL3Nlc3Npb25zVGFza3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVJ1blNjcmlwdEN1c3RvbVRhc2tXaWRnZXRSZXN1bHQsIFJ1blNjcmlwdEN1c3RvbVRhc2tXaWRnZXQgfSBmcm9tICcuL3J1blNjcmlwdEN1c3RvbVRhc2tXaWRnZXQuanMnO1xuXG5cbi8vIE1lbnUgSURzIC0gZXhwb3J0ZWQgZm9yIHVzZSBpbiBhdXhpbGlhcnkgYmFyIHBhcnRcbmV4cG9ydCBjb25zdCBSdW5TY3JpcHREcm9wZG93bk1lbnVJZCA9IE1lbnVJZC5mb3IoJ0FnZW50U2Vzc2lvbnNSdW5TY3JpcHREcm9wZG93bicpO1xuY29uc3QgUlVOX1NDUklQVF9BQ1RJT05fTU9EQUxfVklTSUJMRV9DTEFTUyA9ICdydW4tc2NyaXB0LWFjdGlvbi1tb2RhbC12aXNpYmxlJztcblxuLy8gQWN0aW9uIElEc1xuY29uc3QgUlVOX1NDUklQVF9BQ1RJT05fUFJJTUFSWV9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMucnVuU2NyaXB0UHJpbWFyeSc7XG5jb25zdCBDT05GSUdVUkVfREVGQVVMVF9SVU5fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5jb25maWd1cmVEZWZhdWx0UnVuQWN0aW9uJztcbmNvbnN0IEdFTkVSQVRFX1JVTl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLmdlbmVyYXRlUnVuQWN0aW9uJztcbmNvbnN0IGNsb3NlUXVpY2tXaWRnZXRCdXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0dG9vbHRpcDogbG9jYWxpemUoJ2Nsb3NlUXVpY2tXaWRnZXQnLCBcIkNsb3NlXCIpLFxuXHRhbHdheXNWaXNpYmxlOiB0cnVlLFxufTtcblxuZnVuY3Rpb24gZ2V0VGFza0Rpc3BsYXlMYWJlbCh0YXNrOiBJVGFza0VudHJ5KTogc3RyaW5nIHtcblx0aWYgKHRhc2subGFiZWwgJiYgdGFzay5sYWJlbC5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHRhc2subGFiZWw7XG5cdH1cblx0aWYgKHRhc2suc2NyaXB0ICYmIHRhc2suc2NyaXB0Lmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gdGFzay5zY3JpcHQ7XG5cdH1cblx0aWYgKHRhc2suY29tbWFuZCAmJiB0YXNrLmNvbW1hbmQubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0YXNrLmNvbW1hbmQ7XG5cdH1cblx0aWYgKHRhc2sudGFzayAmJiB0YXNrLnRhc2sudG9TdHJpbmcoKS5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHRhc2sudGFzay50b1N0cmluZygpO1xuXHR9XG5cdHJldHVybiAnJztcbn1cblxuZnVuY3Rpb24gZ2V0VGFza0NvbW1hbmRQcmV2aWV3KHRhc2s6IElUYXNrRW50cnkpOiBzdHJpbmcge1xuXHRpZiAodGFzay5jb21tYW5kICYmIHRhc2suY29tbWFuZC5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHRhc2suY29tbWFuZDtcblx0fVxuXHRpZiAodGFzay5zY3JpcHQgJiYgdGFzay5zY3JpcHQubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbnBtVGFza0NvbW1hbmRQcmV2aWV3JywgXCJucG0gcnVuIHswfVwiLCB0YXNrLnNjcmlwdCk7XG5cdH1cblx0aWYgKHRhc2sudGFzayAmJiB0YXNrLnRhc2sudG9TdHJpbmcoKS5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHRhc2sudGFzay50b1N0cmluZygpO1xuXHR9XG5cdHJldHVybiBnZXRUYXNrRGlzcGxheUxhYmVsKHRhc2spO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRCcm93c2VyVXJsRGVzY3JpcHRpb24odXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1heExlbmd0aDogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF1cmwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHN0cmlwcGVkID0gdXJsLnJlcGxhY2UoL15odHRwcz86XFwvXFwvL2ksICcnKS5yZXBsYWNlKC9ed3d3XFwuL2ksICcnKTtcblx0aWYgKHN0cmlwcGVkLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcblx0XHRyZXR1cm4gc3RyaXBwZWQ7XG5cdH1cblx0cmV0dXJuIGAke3N0cmlwcGVkLnN1YnN0cmluZygwLCBtYXhMZW5ndGggLSAzKX0uLi5gO1xufVxuXG5mdW5jdGlvbiBnZXRQcmltYXJ5VGFzayh0YXNrczogcmVhZG9ubHkgSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdLCBwaW5uZWRUYXNrTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElTZXNzaW9uVGFza1dpdGhUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChwaW5uZWRUYXNrTGFiZWwpIHtcblx0XHRjb25zdCBwaW5uZWRUYXNrID0gdGFza3MuZmluZCh0YXNrID0+IHRhc2sudGFzay5sYWJlbCA9PT0gcGlubmVkVGFza0xhYmVsKTtcblx0XHRpZiAocGlubmVkVGFzaykge1xuXHRcdFx0cmV0dXJuIHBpbm5lZFRhc2s7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRhc2tzWzBdO1xufVxuXG5pbnRlcmZhY2UgSVJ1blNjcmlwdEFjdGlvbkNvbnRleHQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJU2Vzc2lvbjtcblx0cmVhZG9ubHkgdGFza3M6IHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXTtcblx0cmVhZG9ubHkgcGlubmVkVGFza0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGJyb3dzZXJVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGlubmVkQnJvd3NlcjogYm9vbGVhbjtcbn1cblxudHlwZSBUYXNrQ29uZmlndXJhdGlvbk1vZGUgPSAnYWRkJyB8ICdjb25maWd1cmUnO1xuXG4vKipcbiAqIFdvcmtiZW5jaCBjb250cmlidXRpb24gdGhhdCBhZGRzIGEgc3BsaXQgZHJvcGRvd24gYWN0aW9uIHRvIHRoZSBhdXhpbGlhcnkgYmFyIHRpdGxlXG4gKiBmb3IgcnVubmluZyBhIHRhc2sgdmlhIHRhc2tzLmpzb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBSdW5TY3JpcHRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmFnZW50U2Vzc2lvbnMucnVuU2NyaXB0JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVSdW5TdGF0ZTogSU9ic2VydmFibGU8SVJ1blNjcmlwdEFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVNlc3Npb25zVGFza3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zQ29uZmlnU2VydmljZTogSVNlc3Npb25zVGFza3NTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9hY3RpdmVSdW5TdGF0ZSA9IGRlcml2ZWRPcHRzPElSdW5TY3JpcHRBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkPih7XG5cdFx0XHRvd25lcjogdGhpcyxcblx0XHRcdGVxdWFsc0ZuOiAoYSwgYikgPT4ge1xuXHRcdFx0XHRpZiAoYSA9PT0gYikgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0XHRpZiAoIWEgfHwgIWIpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRcdHJldHVybiBhLnNlc3Npb24gPT09IGIuc2Vzc2lvblxuXHRcdFx0XHRcdCYmIGEucGlubmVkVGFza0xhYmVsID09PSBiLnBpbm5lZFRhc2tMYWJlbFxuXHRcdFx0XHRcdCYmIGEuYnJvd3NlclVybCA9PT0gYi5icm93c2VyVXJsXG5cdFx0XHRcdFx0JiYgYS5waW5uZWRCcm93c2VyID09PSBiLnBpbm5lZEJyb3dzZXJcblx0XHRcdFx0XHQmJiBlcXVhbHMoYS50YXNrcywgYi50YXNrcywgKHQxLCB0MikgPT5cblx0XHRcdFx0XHRcdHQxLnRhc2subGFiZWwgPT09IHQyLnRhc2subGFiZWxcblx0XHRcdFx0XHRcdCYmIHQxLnRhc2suY29tbWFuZCA9PT0gdDIudGFzay5jb21tYW5kXG5cdFx0XHRcdFx0XHQmJiB0MS50YXJnZXQgPT09IHQyLnRhcmdldFxuXHRcdFx0XHRcdFx0JiYgdDEudGFzay5ydW5PcHRpb25zPy5ydW5PbiA9PT0gdDIudGFzay5ydW5PcHRpb25zPy5ydW5Pbik7XG5cdFx0XHR9XG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFza3MgPSB0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2UuZ2V0U2Vzc2lvblRhc2tzKGFjdGl2ZVNlc3Npb24pLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGZvbGRlciA9IGFjdGl2ZVNlc3Npb24ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXTtcblx0XHRcdGNvbnN0IHBpbm5lZFRhc2tMYWJlbCA9IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5nZXRQaW5uZWRUYXNrTGFiZWwoZm9sZGVyPy5yb290KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBicm93c2VyVXJsID0gdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLmdldEJyb3dzZXJVcmwoZm9sZGVyPy5yb290KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBwaW5uZWRCcm93c2VyID0gdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLmdldFBpbm5lZEJyb3dzZXIoZm9sZGVyPy5yb290KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiBhY3RpdmVTZXNzaW9uLCB0YXNrcywgcGlubmVkVGFza0xhYmVsLCBicm93c2VyVXJsLCBwaW5uZWRCcm93c2VyIH07XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckFjdGlvblZpZXdJdGVtUHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudXMuVGl0bGVCYXJDZW50ZXJSaWdodCxcblx0XHRcdFJ1blNjcmlwdERyb3Bkb3duTWVudUlkLFxuXHRcdFx0KGFjdGlvbiwgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0UnVuU2NyaXB0QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdFx0dGhhdC5fYWN0aXZlUnVuU3RhdGUsXG5cdFx0XHRcdFx0KHNlc3Npb246IElTZXNzaW9uKSA9PiB0aGF0Ll9zaG93Q29uZmlndXJlUXVpY2tQaWNrKHNlc3Npb24pLFxuXHRcdFx0XHRcdChzZXNzaW9uOiBJU2Vzc2lvbiwgZXhpc3RpbmdUYXNrOiBJTm9uU2Vzc2lvblRhc2tFbnRyeSwgbW9kZT86IFRhc2tDb25maWd1cmF0aW9uTW9kZSkgPT4gdGhhdC5fc2hvd0N1c3RvbUNvbW1hbmRJbnB1dChzZXNzaW9uLCBleGlzdGluZ1Rhc2ssIG1vZGUpLFxuXHRcdFx0XHRcdChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gdGhhdC5fZ2VuZXJhdGVOZXdUYXNrKHNlc3Npb24pLFxuXHRcdFx0XHRcdChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gdGhhdC5fY29uZmlndXJlQnJvd3NlclVybChzZXNzaW9uKSxcblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJVTl9TQ1JJUFRfQUNUSU9OX1BSSU1BUllfSUQsXG5cdFx0XHRcdFx0dGl0bGU6IHsgdmFsdWU6IGxvY2FsaXplKCdydW5QcmltYXJ5VGFzaycsICdSdW4gUHJpbWFyeSBUYXNrJyksIG9yaWdpbmFsOiAnUnVuIFByaW1hcnkgVGFzaycgfSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnBsYXksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlU3RhdGUgPSB0aGF0Ll9hY3RpdmVSdW5TdGF0ZS5nZXQoKTtcblx0XHRcdFx0aWYgKCFhY3RpdmVTdGF0ZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxvZ1Nlc3Npb25zSW50ZXJhY3Rpb24odGhhdC5fdGVsZW1ldHJ5U2VydmljZSwgJ3J1blByaW1hcnlUYXNrJyk7XG5cblx0XHRcdFx0Y29uc3QgeyB0YXNrcywgc2Vzc2lvbiwgcGlubmVkQnJvd3NlciwgYnJvd3NlclVybCB9ID0gYWN0aXZlU3RhdGU7XG5cdFx0XHRcdGlmIChwaW5uZWRCcm93c2VyKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhhdC5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3NpbXBsZUJyb3dzZXIuc2hvdycsIGJyb3dzZXJVcmwpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0YXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb25zdCB0YXNrID0gYXdhaXQgdGhhdC5fc2hvd0NvbmZpZ3VyZVF1aWNrUGljayhzZXNzaW9uKTtcblx0XHRcdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnJ1blRhc2sodGFzaywgc2Vzc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHByaW1hcnlUYXNrID0gZ2V0UHJpbWFyeVRhc2sodGFza3MsIGFjdGl2ZVN0YXRlLnBpbm5lZFRhc2tMYWJlbCk7XG5cdFx0XHRcdGlmICghcHJpbWFyeVRhc2spIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhhdC5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnJ1blRhc2socHJpbWFyeVRhc2sudGFzaywgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU3RhdGUgPSB0aGlzLl9hY3RpdmVSdW5TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWFjdGl2ZVN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCB0YXNrcyB9ID0gYWN0aXZlU3RhdGU7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBzZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcik/LmZvbGRlcnNbMF07XG5cdFx0XHRjb25zdCBjb25maWd1cmVTY3JpcHRQcmVjb25kaXRpb24gPSBmb2xkZXI/LndvcmtpbmdEaXJlY3RvcnkgPyBDb250ZXh0S2V5RXhwci50cnVlKCkgOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogQ09ORklHVVJFX0RFRkFVTFRfUlVOX0FDVElPTl9JRCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbmZpZ3VyZURlZmF1bHRSdW5BY3Rpb24nLCBcIkFkZCBUYXNrLi4uXCIpLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uYWRkLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBjb25maWd1cmVTY3JpcHRQcmVjb25kaXRpb24sXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogUnVuU2NyaXB0RHJvcGRvd25NZW51SWQsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiB0YXNrcy5sZW5ndGggPT09IDAgPyAnbmF2aWdhdGlvbicgOiAnMV9jb25maWd1cmUnLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoYXQuX3RlbGVtZXRyeVNlcnZpY2UsICdhZGRUYXNrJywgJ21lbnUnKTtcblx0XHRcdFx0XHRjb25zdCB0YXNrID0gYXdhaXQgdGhhdC5fc2hvd0NvbmZpZ3VyZVF1aWNrUGljayhzZXNzaW9uKTtcblx0XHRcdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnJ1blRhc2sodGFzaywgc2Vzc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBHRU5FUkFURV9SVU5fQUNUSU9OX0lELFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ2VuZXJhdGVSdW5BY3Rpb24nLCBcIkdlbmVyYXRlIE5ldyBUYXNrLi4uXCIpLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvbldvcmtzcGFjZUlzVmlydHVhbENvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogUnVuU2NyaXB0RHJvcGRvd25NZW51SWQsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiB0YXNrcy5sZW5ndGggPT09IDAgPyAnbmF2aWdhdGlvbicgOiAnMV9jb25maWd1cmUnLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoYXQuX3RlbGVtZXRyeVNlcnZpY2UsICdnZW5lcmF0ZU5ld1Rhc2snLCAnbWVudScpO1xuXHRcdFx0XHRcdGF3YWl0IHRoYXQuX2dlbmVyYXRlTmV3VGFzayhzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dlbmVyYXRlTmV3VGFzayhzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gJy9nZW5lcmF0ZS1ydW4tY29tbWFuZHMnO1xuXHRcdC8vIFByZWZlciBzZW5kaW5nIHRvIHRoZSBhbHJlYWR5LW9wZW4gY2hhdCB3aWRnZXQgZm9yIHRoZSBzZXNzaW9uO1xuXHRcdC8vIGZhbGwgYmFjayB0byBzZW5kUmVxdWVzdCBmb3IgdW50aXRsZWQgc2Vzc2lvbnMgb3Igd2hlbiBubyB3aWRnZXQgaXMgbG9hZGVkLlxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UpO1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdGF3YWl0IHdpZGdldC5hY2NlcHRJbnB1dChxdWVyeSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25NYW5hZ2VtZW50U2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbiwgeyBxdWVyeSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maWd1cmVCcm93c2VyVXJsKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF07XG5cdFx0aWYgKCFmb2xkZXI/LnJvb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudFVybCA9IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5nZXRCcm93c2VyVXJsKGZvbGRlci5yb290KS5nZXQoKTtcblx0XHRjb25zdCB1cmwgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbmZpZ3VyZUJyb3dzZXJVcmxUaXRsZScsIFwiQ29uZmlndXJlIEJyb3dzZXIgVVJMXCIpLFxuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgnY29uZmlndXJlQnJvd3NlclVybFByb21wdCcsIFwiRW50ZXIgdGhlIFVSTCB0byBvcGVuIGluIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXIuIExlYXZlIGVtcHR5IHRvIGNsZWFyLlwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHR2YWx1ZTogY3VycmVudFVybCA/PyAnJyxcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHR9KTtcblx0XHRpZiAodXJsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnNldEJyb3dzZXJVcmwoZm9sZGVyLnJvb3QsIHVybCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93Q29uZmlndXJlUXVpY2tQaWNrKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxJVGFza0VudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgbm9uU2Vzc2lvblRhc2tzID0gYXdhaXQgdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLmdldE5vblNlc3Npb25UYXNrcyhzZXNzaW9uKTtcblx0XHRpZiAobm9uU2Vzc2lvblRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gTm8gZXhpc3RpbmcgdGFza3MsIGdvIHN0cmFpZ2h0IHRvIGN1c3RvbSBjb21tYW5kIGlucHV0XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd0N1c3RvbUNvbW1hbmRJbnB1dChzZXNzaW9uKTtcblx0XHR9XG5cblx0XHRpbnRlcmZhY2UgSVRhc2tQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdHJlYWRvbmx5IHRhc2s/OiBJVGFza0VudHJ5O1xuXHRcdFx0cmVhZG9ubHkgc291cmNlPzogVGFza1N0b3JhZ2VUYXJnZXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IChJVGFza1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXG5cdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2N1c3RvbScsIFwiQ3VzdG9tXCIpIH0pO1xuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjcmVhdGVOZXdUYXNrJywgXCJDcmVhdGUgbmV3IHRhc2suLi5cIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2VudGVyQ3VzdG9tQ29tbWFuZERlc2MnLCBcIkNyZWF0ZSBhIG5ldyBzaGVsbCB0YXNrXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKG5vblNlc3Npb25UYXNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnZXhpc3RpbmdUYXNrcycsIFwiRXhpc3RpbmcgVGFza3NcIikgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgdGFzaywgdGFyZ2V0IH0gb2Ygbm9uU2Vzc2lvblRhc2tzKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBnZXRUYXNrRGlzcGxheUxhYmVsKHRhc2spLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0YXNrLmNvbW1hbmQsXG5cdFx0XHRcdFx0dGFzayxcblx0XHRcdFx0XHRzb3VyY2U6IHRhcmdldCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrUnVuQWN0aW9uJywgXCJTZWxlY3Qgb3IgY3JlYXRlIGEgdGFza1wiKSxcblx0XHR9KTtcblxuXHRcdGlmICghcGlja2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2tlZEl0ZW0gPSBwaWNrZWQgYXMgSVRhc2tQaWNrSXRlbTtcblx0XHRpZiAocGlja2VkSXRlbS50YXNrKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd0N1c3RvbUNvbW1hbmRJbnB1dChzZXNzaW9uLCB7IHRhc2s6IHBpY2tlZEl0ZW0udGFzaywgdGFyZ2V0OiBwaWNrZWRJdGVtLnNvdXJjZSA/PyAnd29ya3NwYWNlJyB9LCAnYWRkJywgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEN1c3RvbSBjb21tYW5kIHBhdGhcblx0XHRcdHJldHVybiB0aGlzLl9zaG93Q3VzdG9tQ29tbWFuZElucHV0KHNlc3Npb24sIHVuZGVmaW5lZCwgJ2FkZCcsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dDdXN0b21Db21tYW5kSW5wdXQoc2Vzc2lvbjogSVNlc3Npb24sIGV4aXN0aW5nVGFzaz86IElOb25TZXNzaW9uVGFza0VudHJ5LCBtb2RlOiBUYXNrQ29uZmlndXJhdGlvbk1vZGUgPSAnYWRkJywgYWxsb3dCYWNrTmF2aWdhdGlvbiA9IGZhbHNlKTogUHJvbWlzZTxJVGFza0VudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdGFza0NvbmZpZ3VyYXRpb24gPSBhd2FpdCB0aGlzLl9zaG93Q3VzdG9tQ29tbWFuZFdpZGdldChzZXNzaW9uLCBleGlzdGluZ1Rhc2ssIG1vZGUsIGFsbG93QmFja05hdmlnYXRpb24pO1xuXHRcdGlmICghdGFza0NvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0YXNrQ29uZmlndXJhdGlvbiA9PT0gJ2JhY2snKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd0NvbmZpZ3VyZVF1aWNrUGljayhzZXNzaW9uKTtcblx0XHR9XG5cblx0XHRpZiAoZXhpc3RpbmdUYXNrKSB7XG5cdFx0XHRpZiAobW9kZSA9PT0gJ2NvbmZpZ3VyZScpIHtcblx0XHRcdFx0Y29uc3QgbmV3TGFiZWwgPSB0YXNrQ29uZmlndXJhdGlvbi5sYWJlbD8udHJpbSgpIHx8IGV4aXN0aW5nVGFzay50YXNrLmxhYmVsIHx8IHRhc2tDb25maWd1cmF0aW9uLmNvbW1hbmQ7XG5cblx0XHRcdFx0bGV0IHVwZGF0ZWRUYXNrOiBJVGFza0VudHJ5ID0ge1xuXHRcdFx0XHRcdC4uLmV4aXN0aW5nVGFzay50YXNrLFxuXHRcdFx0XHRcdGxhYmVsOiBuZXdMYWJlbCxcblx0XHRcdFx0XHRpbkFnZW50czogdHJ1ZSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRpZiAodGFza0NvbmZpZ3VyYXRpb24uY29tbWFuZCAmJiBleGlzdGluZ1Rhc2sudGFzay5jb21tYW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR1cGRhdGVkVGFzayA9IHtcblx0XHRcdFx0XHRcdC4uLnVwZGF0ZWRUYXNrLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogdGFza0NvbmZpZ3VyYXRpb24uY29tbWFuZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRhc2tDb25maWd1cmF0aW9uLnJ1bk9uKSB7XG5cdFx0XHRcdFx0dXBkYXRlZFRhc2sgPSB7XG5cdFx0XHRcdFx0XHQuLi51cGRhdGVkVGFzayxcblx0XHRcdFx0XHRcdHJ1bk9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0Li4uKGV4aXN0aW5nVGFzay50YXNrLnJ1bk9wdGlvbnMgPz8ge30pLFxuXHRcdFx0XHRcdFx0XHRydW5PbjogdGFza0NvbmZpZ3VyYXRpb24ucnVuT24sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2UudXBkYXRlVGFzayhleGlzdGluZ1Rhc2sudGFzay5sYWJlbCwgdXBkYXRlZFRhc2ssIHNlc3Npb24sIGV4aXN0aW5nVGFzay50YXJnZXQsIHRhc2tDb25maWd1cmF0aW9uLnRhcmdldCk7XG5cdFx0XHRcdHJldHVybiB1cGRhdGVkVGFzaztcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLmFkZFRhc2tUb1Nlc3Npb25zKGV4aXN0aW5nVGFzay50YXNrLCBzZXNzaW9uLCBleGlzdGluZ1Rhc2sudGFyZ2V0LCB7IHJ1bk9uOiB0YXNrQ29uZmlndXJhdGlvbi5ydW5PbiA/PyAnZGVmYXVsdCcgfSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5leGlzdGluZ1Rhc2sudGFzayxcblx0XHRcdFx0aW5BZ2VudHM6IHRydWUsXG5cdFx0XHRcdC4uLih0YXNrQ29uZmlndXJhdGlvbi5ydW5PbiA/IHsgcnVuT3B0aW9uczogeyBydW5PbjogdGFza0NvbmZpZ3VyYXRpb24ucnVuT24gfSB9IDoge30pLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLmNyZWF0ZUFuZEFkZFRhc2soXG5cdFx0XHR0YXNrQ29uZmlndXJhdGlvbi5sYWJlbCxcblx0XHRcdHRhc2tDb25maWd1cmF0aW9uLmNvbW1hbmQsXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0dGFza0NvbmZpZ3VyYXRpb24udGFyZ2V0LFxuXHRcdFx0dGFza0NvbmZpZ3VyYXRpb24ucnVuT24gPyB7IHJ1bk9uOiB0YXNrQ29uZmlndXJhdGlvbi5ydW5PbiB9IDogdW5kZWZpbmVkXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dDdXN0b21Db21tYW5kV2lkZ2V0KHNlc3Npb246IElTZXNzaW9uLCBleGlzdGluZ1Rhc2s/OiBJTm9uU2Vzc2lvblRhc2tFbnRyeSwgbW9kZTogVGFza0NvbmZpZ3VyYXRpb25Nb2RlID0gJ2FkZCcsIGFsbG93QmFja05hdmlnYXRpb24gPSBmYWxzZSk6IFByb21pc2U8SVJ1blNjcmlwdEN1c3RvbVRhc2tXaWRnZXRSZXN1bHQgfCAnYmFjaycgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBmb2xkZXIgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VUYXJnZXREaXNhYmxlZFJlYXNvbiA9ICEoZm9sZGVyPy53b3JraW5nRGlyZWN0b3J5ID8/IGZvbGRlcj8ucm9vdClcblx0XHRcdD8gbG9jYWxpemUoJ3dvcmtzcGFjZVN0b3JhZ2VVbmF2YWlsYWJsZVRvb2x0aXAnLCBcIldvcmtzcGFjZSBzdG9yYWdlIGlzIHVuYXZhaWxhYmxlIGZvciB0aGlzIHNlc3Npb25cIilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGlzQ29uZmlndXJlTW9kZSA9IG1vZGUgPT09ICdjb25maWd1cmUnO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElSdW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0UmVzdWx0IHwgJ2JhY2snIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgcXVpY2tXaWRnZXQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tXaWRnZXQoKSk7XG5cdFx0XHRxdWlja1dpZGdldC50aXRsZSA9IGlzQ29uZmlndXJlTW9kZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjb25maWd1cmVBY3Rpb25XaWRnZXRUaXRsZScsIFwiQ29uZmlndXJlIFRhc2tcIilcblx0XHRcdFx0OiBleGlzdGluZ1Rhc2tcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZGRFeGlzdGluZ0FjdGlvbldpZGdldFRpdGxlJywgXCJBZGQgRXhpc3RpbmcgVGFza1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FkZEFjdGlvbldpZGdldFRpdGxlJywgXCJBZGQgVGFza1wiKTtcblx0XHRcdHF1aWNrV2lkZ2V0LmRlc2NyaXB0aW9uID0gaXNDb25maWd1cmVNb2RlXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NvbmZpZ3VyZUFjdGlvbldpZGdldERlc2NyaXB0aW9uJywgXCJVcGRhdGUgaG93IHRoaXMgdGFzayBpcyBuYW1lZCwgc2F2ZWQsIGFuZCBydW4uXCIpXG5cdFx0XHRcdDogZXhpc3RpbmdUYXNrXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWRkRXhpc3RpbmdBY3Rpb25XaWRnZXREZXNjcmlwdGlvbicsIFwiRW5hYmxlIGFuIGV4aXN0aW5nIHRhc2sgZm9yIHNlc3Npb25zIGFuZCBjb25maWd1cmUgd2hlbiBpdCBzaG91bGQgcnVuLlwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FkZEFjdGlvbldpZGdldERlc2NyaXB0aW9uJywgXCJDcmVhdGUgYSBzaGVsbCB0YXNrIGFuZCBjb25maWd1cmUgaG93IGl0IHNob3VsZCBiZSBzYXZlZCBhbmQgcnVuLlwiKTtcblx0XHRcdHF1aWNrV2lkZ2V0Lmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdHF1aWNrV2lkZ2V0LmJ1dHRvbnMgPSBhbGxvd0JhY2tOYXZpZ2F0aW9uXG5cdFx0XHRcdD8gW3RoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b24sIGNsb3NlUXVpY2tXaWRnZXRCdXR0b25dXG5cdFx0XHRcdDogW2Nsb3NlUXVpY2tXaWRnZXRCdXR0b25dO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0KHtcblx0XHRcdFx0bGFiZWw6IGV4aXN0aW5nVGFzaz8udGFzay5sYWJlbCxcblx0XHRcdFx0bGFiZWxEaXNhYmxlZFJlYXNvbjogZXhpc3RpbmdUYXNrICYmICFpc0NvbmZpZ3VyZU1vZGUgPyBsb2NhbGl6ZSgnZXhpc3RpbmdUYXNrTGFiZWxMb2NrZWQnLCBcIlRoaXMgbmFtZSBjb21lcyBmcm9tIGFuIGV4aXN0aW5nIHRhc2sgYW5kIGNhbm5vdCBiZSBjaGFuZ2VkIGhlcmUuXCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21tYW5kOiBleGlzdGluZ1Rhc2sgPyBnZXRUYXNrQ29tbWFuZFByZXZpZXcoZXhpc3RpbmdUYXNrLnRhc2spIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21tYW5kRGlzYWJsZWRSZWFzb246IGV4aXN0aW5nVGFzayAmJiAhaXNDb25maWd1cmVNb2RlID8gbG9jYWxpemUoJ2V4aXN0aW5nVGFza0NvbW1hbmRMb2NrZWQnLCBcIlRoaXMgY29tbWFuZCBjb21lcyBmcm9tIGFuIGV4aXN0aW5nIHRhc2sgYW5kIGNhbm5vdCBiZSBjaGFuZ2VkIGhlcmUuXCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0YXJnZXQ6IGV4aXN0aW5nVGFzaz8udGFyZ2V0LFxuXHRcdFx0XHR0YXJnZXREaXNhYmxlZFJlYXNvbjogZXhpc3RpbmdUYXNrICYmICFpc0NvbmZpZ3VyZU1vZGUgPyBsb2NhbGl6ZSgnZXhpc3RpbmdUYXNrVGFyZ2V0TG9ja2VkJywgXCJUaGlzIGV4aXN0aW5nIHRhc2sgY2Fubm90IGJlIG1vdmVkIGJldHdlZW4gd29ya3NwYWNlIGFuZCB1c2VyIHN0b3JhZ2UuXCIpIDogd29ya3NwYWNlVGFyZ2V0RGlzYWJsZWRSZWFzb24sXG5cdFx0XHRcdHJ1bk9uOiBleGlzdGluZ1Rhc2s/LnRhc2sucnVuT3B0aW9ucz8ucnVuT24gPT09ICd3b3JrdHJlZUNyZWF0ZWQnID8gJ3dvcmt0cmVlQ3JlYXRlZCcgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGU6IGlzQ29uZmlndXJlTW9kZSA/ICdjb25maWd1cmUnIDogZXhpc3RpbmdUYXNrID8gJ2FkZC1leGlzdGluZycgOiAnYWRkJyxcblx0XHRcdH0pKTtcblx0XHRcdHF1aWNrV2lkZ2V0LndpZGdldCA9IHdpZGdldC5kb21Ob2RlO1xuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoUlVOX1NDUklQVF9BQ1RJT05fTU9EQUxfVklTSUJMRV9DTEFTUyk7XG5cdFx0XHRjb25zdCBiYWNrZHJvcCA9IGFwcGVuZCh0aGlzLl9sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIsICQoJy5ydW4tc2NyaXB0LWFjdGlvbi1tb2RhbC1iYWNrZHJvcCcpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGJhY2tkcm9wLCBlID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gYmFja2Ryb3AucmVtb3ZlKCkgfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiB0aGlzLl9sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShSVU5fU0NSSVBUX0FDVElPTl9NT0RBTF9WSVNJQkxFX0NMQVNTKSB9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGUgPSAocmVzdWx0OiBJUnVuU2NyaXB0Q3VzdG9tVGFza1dpZGdldFJlc3VsdCB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHRxdWlja1dpZGdldC5oaWRlKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQod2lkZ2V0Lm9uRGlkU3VibWl0KHJlc3VsdCA9PiBjb21wbGV0ZShyZXN1bHQpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQod2lkZ2V0Lm9uRGlkQ2FuY2VsKCgpID0+IGNvbXBsZXRlKHVuZGVmaW5lZCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1dpZGdldC5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdFx0aWYgKGFsbG93QmFja05hdmlnYXRpb24gJiYgYnV0dG9uID09PSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uKSB7XG5cdFx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmVzb2x2ZSgnYmFjaycpO1xuXHRcdFx0XHRcdHF1aWNrV2lkZ2V0LmhpZGUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGJ1dHRvbiA9PT0gY2xvc2VRdWlja1dpZGdldEJ1dHRvbikge1xuXHRcdFx0XHRcdGNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1dpZGdldC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXNldHRsZWQpIHtcblx0XHRcdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRxdWlja1dpZGdldC5zaG93KCk7XG5cdFx0XHR3aWRnZXQuZm9jdXMoKTtcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFNwbGl0LWJ1dHRvbiBhY3Rpb24gdmlldyBpdGVtIGZvciB0aGUgcnVuIHNjcmlwdCBwaWNrZXIgaW4gdGhlIHNlc3Npb25zIHRpdGxlYmFyLlxuICogVGhlIHByaW1hcnkgYnV0dG9uIHJ1bnMgdGhlIHBpbm5lZCB0YXNrLCBvciB0aGUgZmlyc3QgdGFzayBpZiBub25lIGlzIHBpbm5lZC5cbiAqIFRoZSBkcm9wZG93biBhcnJvdyBvcGVucyBhIGN1c3RvbSBhY3Rpb24gd2lkZ2V0IHdpdGggY2F0ZWdvcmllcyBhbmQgcGVyLWl0ZW1cbiAqIHRvb2xiYXIgYWN0aW9ucyAocGluLCBjb25maWd1cmUsIHJlbW92ZSkuXG4gKi9cbmNsYXNzIFJ1blNjcmlwdEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmltYXJ5QWN0aW9uQWN0aW9uOiBBY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByaW1hcnlBY3Rpb246IEFjdGlvblZpZXdJdGVtO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcm9wZG93bjogQ2hldnJvbkFjdGlvbldpZGdldERyb3Bkb3duO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRfb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVSdW5TdGF0ZTogSU9ic2VydmFibGU8SVJ1blNjcmlwdEFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dDb25maWd1cmVRdWlja1BpY2s6IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gUHJvbWlzZTxJVGFza0VudHJ5IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaG93Q3VzdG9tQ29tbWFuZElucHV0OiAoc2Vzc2lvbjogSVNlc3Npb24sIGV4aXN0aW5nVGFzazogSU5vblNlc3Npb25UYXNrRW50cnksIG1vZGU/OiBUYXNrQ29uZmlndXJhdGlvbk1vZGUpID0+IFByb21pc2U8SVRhc2tFbnRyeSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2VuZXJhdGVOZXdUYXNrOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IFByb21pc2U8dm9pZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJlQnJvd3NlclVybDogKHNlc3Npb246IElTZXNzaW9uKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVNlc3Npb25zVGFza3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zQ29uZmlnU2VydmljZTogSVNlc3Npb25zVGFza3NTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9hY3RpdmVSdW5TdGF0ZS5nZXQoKTtcblx0XHRjb25zdCBpc1ByaW1hcnlFbmFibGVkID0gISFzdGF0ZSAmJiAoc3RhdGUudGFza3MubGVuZ3RoID4gMCB8fCBzdGF0ZS5waW5uZWRCcm93c2VyKTtcblxuXHRcdC8vIFByaW1hcnkgYWN0aW9uIGJ1dHRvbiAtIHJ1bnMgdGhlIHBpbm5lZCB0YXNrIChvciBmaXJzdCB0YXNrIHdoZW4gbm9uZSBpcyBwaW5uZWQpXG5cdFx0dGhpcy5fcHJpbWFyeUFjdGlvbkFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHQnYWdlbnRTZXNzaW9ucy5ydW5TY3JpcHRQcmltYXJ5Jyxcblx0XHRcdHRoaXMuX2dldFByaW1hcnlBY3Rpb25Ub29sdGlwKHN0YXRlKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBsYXkpLFxuXHRcdFx0aXNQcmltYXJ5RW5hYmxlZCxcblx0XHRcdCgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJVTl9TQ1JJUFRfQUNUSU9OX1BSSU1BUllfSUQpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcHJpbWFyeUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25WaWV3SXRlbSh1bmRlZmluZWQsIHRoaXMuX3ByaW1hcnlBY3Rpb25BY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBlbmFibGVkIHN0YXRlIHdoZW4gdGFza3MgY2hhbmdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcnVuU3RhdGUgPSB0aGlzLl9hY3RpdmVSdW5TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9wcmltYXJ5QWN0aW9uQWN0aW9uLmVuYWJsZWQgPSAhIXJ1blN0YXRlICYmIChydW5TdGF0ZS50YXNrcy5sZW5ndGggPiAwIHx8IHJ1blN0YXRlLnBpbm5lZEJyb3dzZXIpO1xuXHRcdFx0dGhpcy5fcHJpbWFyeUFjdGlvbkFjdGlvbi5sYWJlbCA9IHRoaXMuX2dldFByaW1hcnlBY3Rpb25Ub29sdGlwKHJ1blN0YXRlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBEcm9wZG93biB3aXRoIGNhdGVnb3JpemVkIHRhc2sgYWN0aW9ucyBhbmQgcGVyLWl0ZW0gdG9vbGJhcnNcblx0XHRjb25zdCBkcm9wZG93bkFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ2FnZW50U2Vzc2lvbnMucnVuU2NyaXB0RHJvcGRvd24nLCBsb2NhbGl6ZSgncnVuRHJvcGRvd24nLCBcIk1vcmUgVGFza3MuLi5cIikpKTtcblx0XHR0aGlzLl9kcm9wZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGV2cm9uQWN0aW9uV2lkZ2V0RHJvcGRvd24oXG5cdFx0XHRkcm9wZG93bkFjdGlvbixcblx0XHRcdHtcblx0XHRcdFx0YWN0aW9uUHJvdmlkZXI6IHsgZ2V0QWN0aW9uczogKCkgPT4gdGhpcy5fZ2V0RHJvcGRvd25BY3Rpb25zKCkgfSxcblx0XHRcdFx0c2hvd0l0ZW1LZXliaW5kaW5nczogdHJ1ZSxcblx0XHRcdFx0bGlzdE9wdGlvbnM6IHsgY2xhc3NOYW1lOiAnY29tcGFjdC1pY29ucycgfSxcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28tZHJvcGRvd24td2l0aC1kZWZhdWx0Jyk7XG5cblx0XHQvLyBQcmltYXJ5IGFjdGlvbiBidXR0b25cblx0XHRjb25zdCBwcmltYXJ5Q29udGFpbmVyID0gJCgnLmFjdGlvbi1jb250YWluZXInKTtcblx0XHR0aGlzLl9wcmltYXJ5QWN0aW9uLnJlbmRlcihhcHBlbmQoY29udGFpbmVyLCBwcmltYXJ5Q29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHByaW1hcnlDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSkge1xuXHRcdFx0XHR0aGlzLl9wcmltYXJ5QWN0aW9uLmJsdXIoKTtcblx0XHRcdFx0dGhpcy5fZHJvcGRvd24uZm9jdXMoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRHJvcGRvd24gYXJyb3cgYnV0dG9uXG5cdFx0Y29uc3QgZHJvcGRvd25Db250YWluZXIgPSAkKCcuZHJvcGRvd24tYWN0aW9uLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX2Ryb3Bkb3duLnJlbmRlcihhcHBlbmQoY29udGFpbmVyLCBkcm9wZG93bkNvbnRhaW5lcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcm9wZG93bkNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0dGhpcy5fZHJvcGRvd24uc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fcHJpbWFyeUFjdGlvbi5mb2N1cygpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cyhmcm9tUmlnaHQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGZyb21SaWdodCkge1xuXHRcdFx0dGhpcy5fZHJvcGRvd24uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcHJpbWFyeUFjdGlvbi5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJpbWFyeUFjdGlvbi5ibHVyKCk7XG5cdFx0dGhpcy5fZHJvcGRvd24uYmx1cigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXNhYmxlKGZvY3VzYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3ByaW1hcnlBY3Rpb24uc2V0Rm9jdXNhYmxlKGZvY3VzYWJsZSk7XG5cdFx0aWYgKCFmb2N1c2FibGUpIHtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UHJpbWFyeUFjdGlvblRvb2x0aXAoc3RhdGU6IElSdW5TY3JpcHRBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFJVTl9TQ1JJUFRfQUNUSU9OX1BSSU1BUllfSUQpPy5nZXRMYWJlbCgpO1xuXHRcdGNvbnN0IHdpdGhLZXliaW5kaW5nID0gKGxhYmVsOiBzdHJpbmcpID0+IGtleWJpbmRpbmdMYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgncnVuQWN0aW9uVG9vbHRpcEtleWJpbmRpbmcnLCBcInswfSAoezF9KVwiLCBsYWJlbCwga2V5YmluZGluZ0xhYmVsKVxuXHRcdFx0OiBsYWJlbDtcblxuXHRcdGlmIChzdGF0ZT8ucGlubmVkQnJvd3Nlcikge1xuXHRcdFx0cmV0dXJuIHdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCdvcGVuQnJvd3NlckFjdGlvbicsIFwiT3BlbiBCcm93c2VyXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLnRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdydW5QcmltYXJ5VGFza1Rvb2x0aXAnLCBcIlJ1biBQcmltYXJ5IFRhc2tcIik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpbWFyeVRhc2sgPSBnZXRQcmltYXJ5VGFzayhzdGF0ZS50YXNrcywgc3RhdGUucGlubmVkVGFza0xhYmVsKT8udGFzaztcblx0XHRpZiAoIXByaW1hcnlUYXNrKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3J1blByaW1hcnlUYXNrVG9vbHRpcCcsIFwiUnVuIFByaW1hcnkgVGFza1wiKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gd2l0aEtleWJpbmRpbmcoZ2V0VGFza0Rpc3BsYXlMYWJlbChwcmltYXJ5VGFzaykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RHJvcGRvd25BY3Rpb25zKCk6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbltdIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2FjdGl2ZVJ1blN0YXRlLmdldCgpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHRhc2tzLCBzZXNzaW9uLCBwaW5uZWRUYXNrTGFiZWwgfSA9IHN0YXRlO1xuXHRcdGNvbnN0IGZvbGRlciA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbltdID0gW107XG5cblx0XHQvLyBDYXRlZ29yeSBmb3Igbm9ybWFsIHRhc2tzIChubyBoZWFkZXIgc2hvd24pXG5cdFx0Y29uc3QgZGVmYXVsdENhdGVnb3J5ID0geyBsYWJlbDogJycsIG9yZGVyOiAwLCBzaG93SGVhZGVyOiBmYWxzZSB9O1xuXHRcdC8vIENhdGVnb3J5IGZvciB3b3JrdHJlZS1jcmVhdGlvbiB0YXNrc1xuXHRcdGNvbnN0IHdvcmt0cmVlQ2F0ZWdvcnkgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnd29ya3RyZWVDcmVhdGlvbkNhdGVnb3J5JywgXCJSdW4gb24gV29ya3RyZWUgQ3JlYXRpb25cIiksIG9yZGVyOiAxLCBzaG93SGVhZGVyOiB0cnVlIH07XG5cdFx0Ly8gQ2F0ZWdvcnkgZm9yIHRhc2sgY3JlYXRpb24gYW5kIG1hbmFnZW1lbnRcblx0XHRjb25zdCB0YXNrc0NhdGVnb3J5ID0geyBsYWJlbDogbG9jYWxpemUoJ3Rhc2tzQWN0aW9uc0NhdGVnb3J5JywgXCJUYXNrc1wiKSwgb3JkZXI6IDIsIHNob3dIZWFkZXI6IHRydWUgfTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGFza3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGFza3NbaV07XG5cdFx0XHRjb25zdCB0YXNrID0gZW50cnkudGFzaztcblx0XHRcdGNvbnN0IGlzV29ya3RyZWVUYXNrID0gdGFzay5ydW5PcHRpb25zPy5ydW5PbiA9PT0gJ3dvcmt0cmVlQ3JlYXRlZCc7XG5cdFx0XHRjb25zdCBpc1Bpbm5lZCA9IHRhc2subGFiZWwgPT09IHBpbm5lZFRhc2tMYWJlbDtcblxuXHRcdFx0Y29uc3QgdG9vbGJhckFjdGlvbnM6IElBY3Rpb25bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBgcnVuU2NyaXB0LnBpbi4ke2l9YCxcblx0XHRcdFx0XHRsYWJlbDogaXNQaW5uZWQgPyBsb2NhbGl6ZSgndW5waW5UYXNrJywgXCJVbnBpblwiKSA6IGxvY2FsaXplKCdwaW5UYXNrJywgXCJQaW5cIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogaXNQaW5uZWQgPyBsb2NhbGl6ZSgndW5waW5UYXNrVG9vbHRpcCcsIFwiVW5waW5cIikgOiBsb2NhbGl6ZSgncGluVGFza1Rvb2x0aXAnLCBcIlBpblwiKSxcblx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGlzUGlubmVkID8gQ29kaWNvbi5waW5uZWQgOiBDb2RpY29uLnBpbiksXG5cdFx0XHRcdFx0ZW5hYmxlZDogISFmb2xkZXI/LnJvb3QsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5zZXRQaW5uZWRUYXNrTGFiZWwoZm9sZGVyPy5yb290LCBpc1Bpbm5lZCA/IHVuZGVmaW5lZCA6IHRhc2subGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBgcnVuU2NyaXB0LmNvbmZpZ3VyZS4ke2l9YCxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbmZpZ3VyZVRhc2snLCBcIkNvbmZpZ3VyZVwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY29uZmlndXJlVGFzaycsIFwiQ29uZmlndXJlXCIpLFxuXHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nZWFyKSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zaG93Q3VzdG9tQ29tbWFuZElucHV0KHNlc3Npb24sIHsgdGFzaywgdGFyZ2V0OiBlbnRyeS50YXJnZXQgfSwgJ2NvbmZpZ3VyZScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBgcnVuU2NyaXB0LnJlbW92ZS4ke2l9YCxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlbW92ZVRhc2snLCBcIlJlbW92ZVwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVtb3ZlVGFzaycsIFwiUmVtb3ZlXCIpLFxuXHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnJlbW92ZVRhc2sodGFzay5sYWJlbCwgc2Vzc2lvbiwgZW50cnkudGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGlkOiBgcnVuU2NyaXB0LnRhc2suJHtpfWAsXG5cdFx0XHRcdGxhYmVsOiBnZXRUYXNrRGlzcGxheUxhYmVsKHRhc2spLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0aG92ZXI6IHtcblx0XHRcdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgncnVuQWN0aW9uVG9vbHRpcCcsIFwiUnVuICd7MH0nIGluIHRlcm1pbmFsXCIsIGdldFRhc2tEaXNwbGF5TGFiZWwodGFzaykpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnJ1bkNvbXBhY3QsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNhdGVnb3J5OiBpc1dvcmt0cmVlVGFzayA/IHdvcmt0cmVlQ2F0ZWdvcnkgOiBkZWZhdWx0Q2F0ZWdvcnksXG5cdFx0XHRcdHRvb2xiYXJBY3Rpb25zLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2UucnVuVGFzayh0YXNrLCBzZXNzaW9uKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFwiQWRkIFRhc2suLi5cIiBhY3Rpb25cblx0XHRjb25zdCBjYW5Db25maWd1cmUgPSAhIShmb2xkZXI/LndvcmtpbmdEaXJlY3RvcnkgPz8gZm9sZGVyPy5yb290KTtcblx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0aWQ6ICdydW5TY3JpcHQuYWRkQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlRGVmYXVsdFJ1bkFjdGlvbicsIFwiQWRkIFRhc2suLi5cIiksXG5cdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdGhvdmVyOiB7XG5cdFx0XHRcdGNvbnRlbnQ6IGNhbkNvbmZpZ3VyZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FkZEFjdGlvblRvb2x0aXAnLCBcIkFkZCBhIG5ldyB0YXNrXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWRkQWN0aW9uVG9vbHRpcERpc2FibGVkJywgXCJDYW5ub3QgYWRkIHRhc2tzIHRvIHRoaXMgc2Vzc2lvbiBiZWNhdXNlIHdvcmtzcGFjZSBzdG9yYWdlIGlzIHVuYXZhaWxhYmxlXCIpLFxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24uYWRkQ29tcGFjdCxcblx0XHRcdGVuYWJsZWQ6IGNhbkNvbmZpZ3VyZSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRjYXRlZ29yeTogdGFza3NDYXRlZ29yeSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsICdhZGRUYXNrJywgJ2FjdGlvbldpZGdldCcpO1xuXHRcdFx0XHRjb25zdCB0YXNrID0gYXdhaXQgdGhpcy5fc2hvd0NvbmZpZ3VyZVF1aWNrUGljayhzZXNzaW9uKTtcblx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2UucnVuVGFzayh0YXNrLCBzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIFwiR2VuZXJhdGUgTmV3IFRhc2suLi5cIiBhY3Rpb25cblx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0aWQ6ICdydW5TY3JpcHQuZ2VuZXJhdGVBY3Rpb24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdnZW5lcmF0ZVJ1bkFjdGlvbicsIFwiR2VuZXJhdGUgTmV3IFRhc2suLi5cIiksXG5cdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdGhvdmVyOiB7XG5cdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdnZW5lcmF0ZVJ1bkFjdGlvblRvb2x0aXAnLCBcIkdlbmVyYXRlIGEgbmV3IHdvcmtzcGFjZSB0YXNrXCIpLFxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24uc3BhcmtsZUNvbXBhY3QsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGNhdGVnb3J5OiB0YXNrc0NhdGVnb3J5LFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvZ1Nlc3Npb25zSW50ZXJhY3Rpb24odGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgJ2dlbmVyYXRlTmV3VGFzaycsICdhY3Rpb25XaWRnZXQnKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZ2VuZXJhdGVOZXdUYXNrKHNlc3Npb24pO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIEJyb3dzZXIgY2F0ZWdvcnkgLSBPcGVuIEJyb3dzZXIgYWN0aW9uXG5cdFx0Y29uc3QgYnJvd3NlckNhdGVnb3J5ID0geyBsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXJBY3Rpb25zQ2F0ZWdvcnknLCBcIkJyb3dzZXJcIiksIG9yZGVyOiAzLCBzaG93SGVhZGVyOiB0cnVlIH07XG5cdFx0Y29uc3QgYnJvd3NlclVybCA9IHN0YXRlLmJyb3dzZXJVcmw7XG5cdFx0Y29uc3QgYnJvd3NlclVybERlc2NyaXB0aW9uID0gZm9ybWF0QnJvd3NlclVybERlc2NyaXB0aW9uKGJyb3dzZXJVcmwsIDIwKTtcblx0XHRjb25zdCBjYW5Db25maWd1cmVCcm93c2VyID0gISFmb2xkZXI/LnJvb3Q7XG5cdFx0Y29uc3QgaXNCcm93c2VyUGlubmVkID0gc3RhdGUucGlubmVkQnJvd3Nlcjtcblx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0aWQ6ICdydW5TY3JpcHQub3BlbkJyb3dzZXInLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuQnJvd3NlckFjdGlvbicsIFwiT3BlbiBCcm93c2VyXCIpLFxuXHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRkZXNjcmlwdGlvbjogYnJvd3NlclVybERlc2NyaXB0aW9uLFxuXHRcdFx0aG92ZXI6IHtcblx0XHRcdFx0Y29udGVudDogYnJvd3NlclVybFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ29wZW5Ccm93c2VyQWN0aW9uVG9vbHRpcCcsIFwiT3BlbiAnezB9JyBpbiB0aGUgaW50ZWdyYXRlZCBicm93c2VyXCIsIGJyb3dzZXJVcmwpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnb3BlbkJyb3dzZXJBY3Rpb25Ub29sdGlwVW5jb25maWd1cmVkJywgXCJPcGVuIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXJcIiksXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi53aW5kb3dDb21wYWN0LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRjYXRlZ29yeTogYnJvd3NlckNhdGVnb3J5LFxuXHRcdFx0dG9vbGJhckFjdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncnVuU2NyaXB0LnBpbkJyb3dzZXInLFxuXHRcdFx0XHRcdGxhYmVsOiBpc0Jyb3dzZXJQaW5uZWQgPyBsb2NhbGl6ZSgndW5waW5Ccm93c2VyJywgXCJVbnBpblwiKSA6IGxvY2FsaXplKCdwaW5Ccm93c2VyJywgXCJQaW5cIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogaXNCcm93c2VyUGlubmVkID8gbG9jYWxpemUoJ3VucGluQnJvd3NlclRvb2x0aXAnLCBcIlVucGluXCIpIDogbG9jYWxpemUoJ3BpbkJyb3dzZXJUb29sdGlwJywgXCJQaW5cIiksXG5cdFx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpc0Jyb3dzZXJQaW5uZWQgPyBDb2RpY29uLnBpbm5lZCA6IENvZGljb24ucGluKSxcblx0XHRcdFx0XHRlbmFibGVkOiAhIWZvbGRlcj8ucm9vdCxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnNldFBpbm5lZEJyb3dzZXIoZm9sZGVyPy5yb290LCAhaXNCcm93c2VyUGlubmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3J1blNjcmlwdC5jb25maWd1cmVCcm93c2VyJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbmZpZ3VyZUJyb3dzZXJVcmwnLCBcIkNvbmZpZ3VyZSBVUkxcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NvbmZpZ3VyZUJyb3dzZXJVcmwnLCBcIkNvbmZpZ3VyZSBVUkxcIiksXG5cdFx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdlYXIpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGNhbkNvbmZpZ3VyZUJyb3dzZXIsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyZUJyb3dzZXJVcmwoc2Vzc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdzaW1wbGVCcm93c2VyLnNob3cnLCBicm93c2VyVXJsKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxufVxuXG4vKipcbiAqIHtAbGluayBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtfSB0aGF0IHJlbmRlcnMgYSBjaGV2cm9uLWRvd24gaWNvblxuICogZm9yIHRoZSBzcGxpdCBidXR0b24gZHJvcGRvd24gaW4gdGhlIHRpdGxlYmFyLlxuICovXG5jbGFzcyBDaGV2cm9uQWN0aW9uV2lkZ2V0RHJvcGRvd24gZXh0ZW5kcyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUgfCBudWxsIHtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvZGljb24nLCAnY29kaWNvbi1jaGV2cm9uLWRvd24nKTtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG4vLyBSZWdpc3RlciB0aGUgUnVuIHNwbGl0IGJ1dHRvbiBzdWJtZW51IG9uIHRoZSB3b3JrYmVuY2ggdGl0bGUgYmFyIChiYWNrZ3JvdW5kIHNlc3Npb25zIG9ubHkpLlxuLy8gUGxhY2VkIGluIHRoZSBjZW50ZXItcmlnaHQgdG9vbGJhciwgaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBcIk9wZW4gaW4gVlMgQ29kZVwiIGFjdGlvbiAob3JkZXIgNykuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuVGl0bGVCYXJDZW50ZXJSaWdodCwge1xuXHRzdWJtZW51OiBSdW5TY3JpcHREcm9wZG93bk1lbnVJZCxcblx0aXNTcGxpdEJ1dHRvbjogdHJ1ZSxcblx0dGl0bGU6IGxvY2FsaXplMigncnVuJywgXCJSdW5cIiksXG5cdGljb246IENvZGljb24ucGxheSxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDYsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uV29ya3NwYWNlSXNWaXJ0dWFsQ29udGV4dC50b05lZ2F0ZWQoKSlcbn0pO1xuXG4vLyBEaXNhYmxlZCBwbGFjZWhvbGRlciBzaG93biBpbiB0aGUgdGl0bGViYXIgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBydW5uaW5nIHNjcmlwdHNcbmNsYXNzIFJ1blNjcmlwdE5vdEF2YWlsYWJsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5ydW5TY3JpcHQubm90QXZhaWxhYmxlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1bicsIFwiUnVuXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3J1blNjcmlwdE5vdEF2YWlsYWJsZVRvb2x0aXAnLCBcIlJ1biBUYXNrIGlzIG5vdCBhdmFpbGFibGUgZm9yIHRoaXMgc2Vzc2lvbiB0eXBlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5wbGF5LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLlRpdGxlQmFyQ2VudGVyUmlnaHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA2LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbldvcmtzcGFjZUlzVmlydHVhbENvbnRleHQpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKCk6IHZvaWQgeyB9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihSdW5TY3JpcHROb3RBdmFpbGFibGVBY3Rpb24pO1xuXG4vLyBSZWdpc3RlciBGNSBrZXliaW5kaW5nIGF0IG1vZHVsZSBsZXZlbCB0byBlbnN1cmUgaXQncyBpbiB0aGUgcmVnaXN0cnlcbi8vIGJlZm9yZSB0aGUga2V5YmluZGluZyByZXNvbHZlciBpcyBjYWNoZWQuIFRoZSBjb21tYW5kIGhhbmRsZXIgaXNcbi8vIHJlZ2lzdGVyZWQgbGF0ZXIgYnkgUnVuU2NyaXB0Q29udHJpYnV0aW9uLlxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFJVTl9TQ1JJUFRfQUNUSU9OX1BSSU1BUllfSUQsXG5cdHByaW1hcnk6IEtleUNvZGUuRjUsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAwLFxuXHR3aGVuOiBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKClcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsdUNBQXVDLHVCQUF1QixRQUFRLGlCQUFpQjtBQUNuRyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQiwwQkFBa0Q7QUFDM0UsU0FBUyxjQUF1QjtBQUNoQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsU0FBUyxtQkFBZ0M7QUFDbEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLFFBQVEsaUJBQWlCLFNBQVMsY0FBYyx5QkFBeUI7QUFDbEYsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUE0QiwwQkFBK0Q7QUFDM0YsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQ0FBa0MscUNBQXFDO0FBRWhGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsYUFBYTtBQUN0QixTQUErQiw2QkFBb0Y7QUFDbkgsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBMkMsaUNBQWlDO0FBSXJFLE1BQU0sMEJBQTBCLE9BQU8sSUFBSSxnQ0FBZ0M7QUFDbEYsTUFBTSx3Q0FBd0M7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
