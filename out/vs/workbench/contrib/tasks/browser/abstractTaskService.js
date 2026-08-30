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
import { Action } from "../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import * as glob from "../../../../base/common/glob.js";
import * as json from "../../../../base/common/json.js";
import { Disposable, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache, Touch } from "../../../../base/common/map.js";
import * as Objects from "../../../../base/common/objects.js";
import { ValidationState, ValidationStatus } from "../../../../base/common/parsers.js";
import * as Platform from "../../../../base/common/platform.js";
import { TerminateResponseCode } from "../../../../base/common/processes.js";
import * as resources from "../../../../base/common/resources.js";
import Severity from "../../../../base/common/severity.js";
import * as Types from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import * as UUID from "../../../../base/common/uuid.js";
import * as nls from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ProblemMatcherRegistry } from "../common/problemMatcher.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IWorkspaceContextService, WorkbenchState, WorkspaceFolder } from "../../../../platform/workspace/common/workspace.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Markers } from "../../markers/common/markers.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ITerminalGroupService, ITerminalService } from "../../terminal/browser/terminal.js";
import { ITerminalProfileResolverService } from "../../terminal/common/terminal.js";
import { ConfiguringTask, ContributedTask, CustomTask, ExecutionEngine, InMemoryTask, InstancePolicy, JsonSchemaVersion, KeyedTaskIdentifier, RerunAllRunningTasksCommandId, RuntimeType, TASK_RUNNING_STATE, TaskDefinition, TaskEventKind, TaskGroup, TaskRunSource, TaskSettingId, TaskSorter, TaskSourceKind, TasksSchemaProperties, USER_TASKS_GROUP_KEY } from "../common/tasks.js";
import { ChatAgentLocation, ChatModeKind } from "../../chat/common/constants.js";
import { CustomExecutionSupportedContext, ProcessExecutionSupportedContext, ServerlessWebContext, ShellExecutionSupportedContext, TaskCommandsRegistered, TaskExecutionSupportedContext, TasksAvailableContext } from "../common/taskService.js";
import { TaskError, TaskErrors, TaskExecuteKind, Triggers, VerifiedTask } from "../common/taskSystem.js";
import { getTemplates as getTaskTemplates } from "../common/taskTemplates.js";
import * as TaskConfig from "../common/taskConfiguration.js";
import { TerminalTaskSystem } from "./terminalTaskSystem.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { TaskDefinitionRegistry } from "../common/taskDefinitionRegistry.js";
import { getActiveElement } from "../../../../base/browser/dom.js";
import { raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toFormattedString } from "../../../../base/common/jsonFormatter.js";
import { Schemas } from "../../../../base/common/network.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { TerminalExitReason } from "../../../../platform/terminal/common/terminal.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { VirtualWorkspaceContext } from "../../../common/contextkeys.js";
import { EditorResourceAccessor, SaveReason } from "../../../common/editor.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ILifecycleService, ShutdownReason, StartupKind } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { CHAT_OPEN_ACTION_ID } from "../../chat/browser/actions/chatActions.js";
import { IChatAgentService } from "../../chat/common/participants/chatAgents.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { configureTaskIcon, isWorkspaceFolder, QUICKOPEN_DETAIL_CONFIG, QUICKOPEN_SKIP_CONFIG, TaskQuickPick } from "./taskQuickPick.js";
import { IHostService } from "../../../services/host/browser/host.js";
import * as dom from "../../../../base/browser/dom.js";
import { FocusMode } from "../../../../platform/native/common/native.js";
const QUICKOPEN_HISTORY_LIMIT_CONFIG = "task.quickOpen.history";
const PROBLEM_MATCHER_NEVER_CONFIG = "task.problemMatchers.neverPrompt";
const USE_SLOW_PICKER = "task.quickOpen.showAll";
const TaskTerminalType = "Task";
var ConfigureTaskAction;
((ConfigureTaskAction2) => {
  ConfigureTaskAction2.ID = "workbench.action.tasks.configureTaskRunner";
  ConfigureTaskAction2.TEXT = nls.localize2("ConfigureTaskRunnerAction.label", "Configure Task");
})(ConfigureTaskAction || (ConfigureTaskAction = {}));
class ProblemReporter {
  constructor(_outputChannel) {
    this._outputChannel = _outputChannel;
    this._onDidError = new Emitter();
    this.onDidError = this._onDidError.event;
    this._validationStatus = new ValidationStatus();
  }
  info(message) {
    this._validationStatus.state = ValidationState.Info;
    this._outputChannel.append(message + "\n");
  }
  warn(message) {
    this._validationStatus.state = ValidationState.Warning;
    this._outputChannel.append(message + "\n");
  }
  error(message) {
    this._validationStatus.state = ValidationState.Error;
    this._outputChannel.append(message + "\n");
    this._onDidError.fire(message);
  }
  fatal(message) {
    this._validationStatus.state = ValidationState.Fatal;
    this._outputChannel.append(message + "\n");
    this._onDidError.fire(message);
  }
  get status() {
    return this._validationStatus;
  }
}
class TaskMap {
  constructor() {
    this._store = /* @__PURE__ */ new Map();
  }
  forEach(callback) {
    this._store.forEach(callback);
  }
  static getKey(workspaceFolder) {
    let key;
    if (Types.isString(workspaceFolder)) {
      key = workspaceFolder;
    } else {
      const uri = isWorkspaceFolder(workspaceFolder) ? workspaceFolder.uri : workspaceFolder.configuration;
      key = uri ? uri.toString() : "";
    }
    return key;
  }
  get(workspaceFolder) {
    const key = TaskMap.getKey(workspaceFolder);
    let result = this._store.get(key);
    if (!result) {
      result = [];
      this._store.set(key, result);
    }
    return result;
  }
  add(workspaceFolder, ...task) {
    const key = TaskMap.getKey(workspaceFolder);
    let values = this._store.get(key);
    if (!values) {
      values = [];
      this._store.set(key, values);
    }
    values.push(...task);
  }
  all() {
    const result = [];
    this._store.forEach((values) => result.push(...values));
    return result;
  }
}
let AbstractTaskService = class extends Disposable {
  constructor(_configurationService, _markerService, _outputService, _paneCompositeService, _viewsService, _commandService, _editorService, _fileService, _contextService, _telemetryService, _textFileService, _modelService, _extensionService, _quickInputService, _configurationResolverService, _terminalService, _terminalGroupService, _storageService, _progressService, _openerService, _dialogService, _notificationService, _contextKeyService, _environmentService, _terminalProfileResolverService, _pathService, _textModelResolverService, _preferencesService, _viewDescriptorService, _workspaceTrustRequestService, _workspaceTrustManagementService, _logService, _themeService, _lifecycleService, remoteAgentService, _instantiationService, _chatService, _chatAgentService, _hostService) {
    super();
    this._configurationService = _configurationService;
    this._markerService = _markerService;
    this._outputService = _outputService;
    this._paneCompositeService = _paneCompositeService;
    this._viewsService = _viewsService;
    this._commandService = _commandService;
    this._editorService = _editorService;
    this._fileService = _fileService;
    this._contextService = _contextService;
    this._telemetryService = _telemetryService;
    this._textFileService = _textFileService;
    this._modelService = _modelService;
    this._extensionService = _extensionService;
    this._quickInputService = _quickInputService;
    this._configurationResolverService = _configurationResolverService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._storageService = _storageService;
    this._progressService = _progressService;
    this._openerService = _openerService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._contextKeyService = _contextKeyService;
    this._environmentService = _environmentService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._pathService = _pathService;
    this._textModelResolverService = _textModelResolverService;
    this._preferencesService = _preferencesService;
    this._viewDescriptorService = _viewDescriptorService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._logService = _logService;
    this._themeService = _themeService;
    this._lifecycleService = _lifecycleService;
    this._instantiationService = _instantiationService;
    this._chatService = _chatService;
    this._chatAgentService = _chatAgentService;
    this._hostService = _hostService;
    this._tasksReconnected = false;
    this._taskSystemListeners = [];
    this._onDidRegisterSupportedExecutions = this._register(new Emitter());
    this._onDidRegisterAllSupportedExecutions = this._register(new Emitter());
    this._onDidChangeTaskSystemInfo = this._register(new Emitter());
    this._willRestart = false;
    this.onDidChangeTaskSystemInfo = this._onDidChangeTaskSystemInfo.event;
    this._onDidReconnectToTasks = this._register(new Emitter());
    this.onDidReconnectToTasks = this._onDidReconnectToTasks.event;
    this._onDidChangeTaskConfig = this._register(new Emitter());
    this.onDidChangeTaskConfig = this._onDidChangeTaskConfig.event;
    this._onDidChangeTaskProviders = this._register(new Emitter());
    this.onDidChangeTaskProviders = this._onDidChangeTaskProviders.event;
    this._taskRunStartTimes = /* @__PURE__ */ new Map();
    this._taskRunSources = /* @__PURE__ */ new Map();
    this._activatedTaskProviders = /* @__PURE__ */ new Set();
    this.toast = this._register(new MutableDisposable());
    this._whenTaskSystemReady = Event.toPromise(this.onDidChangeTaskSystemInfo);
    this._workspaceTasksPromise = void 0;
    this._taskSystem = void 0;
    this._taskSystemListeners = void 0;
    this._outputChannel = this._outputService.getChannel(AbstractTaskService.OutputChannelId);
    this._providers = /* @__PURE__ */ new Map();
    this._providerTypes = /* @__PURE__ */ new Map();
    this._taskSystemInfos = /* @__PURE__ */ new Map();
    this._register(this._contextService.onDidChangeWorkspaceFolders(() => {
      const taskServiceInitialized = !!this._taskSystem || !!this._workspaceTasksPromise;
      const folderSetup = this._computeWorkspaceFolderSetup();
      if (this.executionEngine !== folderSetup[2]) {
        this._disposeTaskSystemListeners();
        this._taskSystem = void 0;
      }
      this._updateSetup(folderSetup);
      if (!taskServiceInitialized) {
        return;
      }
      return this._updateWorkspaceTasks(TaskRunSource.FolderOpen);
    }));
    this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("tasks") || !this._taskSystem && !this._workspaceTasksPromise) {
        return;
      }
      if (!this._taskSystem || this._taskSystem instanceof TerminalTaskSystem) {
        this._outputChannel.clear();
      }
      if (e.affectsConfiguration(TaskSettingId.Reconnection)) {
        if (!this._configurationService.getValue(TaskSettingId.Reconnection)) {
          this._persistentTasks?.clear();
          this._storageService.remove(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
        }
      }
      this._setTaskLRUCacheLimit();
      const mapStringToFolderTasks = await this._updateWorkspaceTasks(TaskRunSource.ConfigurationChange);
      this._onDidChangeTaskConfig.fire();
      for (const [folderUri, folderResult] of mapStringToFolderTasks) {
        if (!folderResult.set?.tasks?.length) {
          continue;
        }
        for (const task of folderResult.set.tasks) {
          const realUniqueId = task._id;
          const lastTask = this._taskSystem?.lastTask?.task._id;
          if (lastTask && lastTask === realUniqueId && folderUri !== "setting") {
            const verifiedLastTask = new VerifiedTask(task, this._taskSystem.lastTask.resolver, Triggers.command);
            this._taskSystem.lastTask = verifiedLastTask;
          }
        }
      }
    }));
    this._taskRunningState = TASK_RUNNING_STATE.bindTo(_contextKeyService);
    this._tasksAvailableState = TasksAvailableContext.bindTo(_contextKeyService);
    this._onDidStateChange = this._register(new Emitter());
    this._registerCommands().then(() => TaskCommandsRegistered.bindTo(this._contextKeyService).set(true));
    ServerlessWebContext.bindTo(this._contextKeyService).set(Platform.isWeb && !remoteAgentService.getConnection()?.remoteAuthority);
    this._configurationResolverService.contributeVariable("defaultBuildTask", async () => {
      let tasks = await this._getTasksForGroup(TaskGroup.Build, true);
      if (tasks.length > 0) {
        const defaults2 = this._getDefaultTasks(tasks);
        if (defaults2.length === 1) {
          return defaults2[0]._label;
        }
      }
      tasks = await this._getTasksForGroup(TaskGroup.Build);
      const defaults = this._getDefaultTasks(tasks);
      if (defaults.length === 1) {
        return defaults[0]._label;
      } else if (defaults.length) {
        tasks = defaults;
      }
      let entry;
      if (tasks && tasks.length > 0) {
        entry = await this._showQuickPick(tasks, nls.localize("TaskService.pickBuildTaskForLabel", "Select the build task (there is no default build task defined)"));
      }
      const task = entry ? entry.task : void 0;
      if (!task) {
        return void 0;
      }
      return task._label;
    });
    this._register(this._lifecycleService.onBeforeShutdown((e) => {
      this._willRestart = e.reason !== ShutdownReason.RELOAD;
    }));
    this._register(this.onDidStateChange(async (e) => {
      this._log(nls.localize("taskEvent", "Task Event kind: {0}", e.kind), true);
      switch (e.kind) {
        case TaskEventKind.Start:
          this._taskRunStartTimes.set(e.taskId, Date.now());
          break;
        case TaskEventKind.ProcessEnded: {
          const processEndedEvent = e;
          const startTime = this._taskRunStartTimes.get(e.taskId);
          if (!startTime) {
            break;
          }
          const durationMs = processEndedEvent.durationMs ?? Date.now() - startTime;
          if (durationMs !== void 0) {
            this._handleLongRunningTaskCompletion(processEndedEvent, durationMs);
          }
          this._taskRunStartTimes.delete(e.taskId);
          this._taskRunSources.delete(e.taskId);
          break;
        }
        case TaskEventKind.Inactive: {
          const processEndedEvent = e;
          const startTime = this._taskRunStartTimes.get(e.taskId);
          if (!startTime) {
            break;
          }
          const durationMs = processEndedEvent.durationMs ?? Date.now() - startTime;
          if (durationMs !== void 0) {
            this._handleLongRunningTaskCompletion(processEndedEvent, durationMs);
          }
          this._taskRunStartTimes.delete(e.taskId);
          this._taskRunSources.delete(e.taskId);
          break;
        }
        case TaskEventKind.Terminated:
          this._taskRunStartTimes.delete(e.taskId);
          this._taskRunSources.delete(e.taskId);
          break;
      }
      if (e.kind === TaskEventKind.Changed) {
      } else if ((this._willRestart || e.kind === TaskEventKind.Terminated && e.exitReason === TerminalExitReason.User) && e.taskId) {
        const key = e.__task.getKey();
        if (key) {
          this.removePersistentTask(key);
        }
      } else if (e.kind === TaskEventKind.Start && e.__task && e.__task.getWorkspaceFolder()) {
        this._setPersistentTask(e.__task);
      }
    }));
    this._waitForAllSupportedExecutions = new Promise((resolve) => {
      Event.once(this._onDidRegisterAllSupportedExecutions.event)(() => resolve());
    });
    this._terminalService.whenConnected.then(() => {
      const reconnectedInstances = this._terminalService.instances.filter((e) => e.reconnectionProperties?.ownerId === TaskTerminalType);
      if (reconnectedInstances.length) {
        this._attemptTaskReconnection();
      } else {
        this._tasksReconnected = true;
        this._onDidReconnectToTasks.fire();
      }
    });
    this._upgrade();
  }
  get isReconnected() {
    return this._tasksReconnected;
  }
  registerSupportedExecutions(custom, shell, process) {
    if (custom !== void 0) {
      const customContext = CustomExecutionSupportedContext.bindTo(this._contextKeyService);
      customContext.set(custom);
    }
    const isVirtual = !!VirtualWorkspaceContext.getValue(this._contextKeyService);
    if (shell !== void 0) {
      const shellContext = ShellExecutionSupportedContext.bindTo(this._contextKeyService);
      shellContext.set(shell && !isVirtual);
    }
    if (process !== void 0) {
      const processContext = ProcessExecutionSupportedContext.bindTo(this._contextKeyService);
      processContext.set(process && !isVirtual);
    }
    this._workspaceTasksPromise = void 0;
    this._onDidRegisterSupportedExecutions.fire();
    if (ServerlessWebContext.getValue(this._contextKeyService) || custom && shell && process) {
      this._onDidRegisterAllSupportedExecutions.fire();
    }
  }
  _attemptTaskReconnection() {
    if (this._lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
      this._log(nls.localize("TaskService.skippingReconnection", "Startup kind not window reload, setting connected and removing persistent tasks"), true);
      this._tasksReconnected = true;
      this._storageService.remove(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
    }
    if (!this._configurationService.getValue(TaskSettingId.Reconnection) || this._tasksReconnected) {
      this._log(nls.localize("TaskService.notConnecting", "Setting tasks connected configured value {0}, tasks were already reconnected {1}", this._configurationService.getValue(TaskSettingId.Reconnection), this._tasksReconnected), true);
      this._tasksReconnected = true;
      return;
    }
    this._log(nls.localize("TaskService.reconnecting", "Reconnecting to running tasks..."), true);
    this.getWorkspaceTasks(TaskRunSource.Reconnect).then(async () => {
      this._tasksReconnected = await this._reconnectTasks();
      this._log(nls.localize("TaskService.reconnected", "Reconnected to running tasks."), true);
      this._onDidReconnectToTasks.fire();
    });
  }
  async _handleLongRunningTaskCompletion(event, durationMs) {
    const notificationThreshold = this._configurationService.getValue(TaskSettingId.NotifyWindowOnTaskCompletion);
    if (notificationThreshold === -1 || notificationThreshold > 0 && durationMs < notificationThreshold) {
      return;
    }
    const taskRunSource = this._taskRunSources.get(event.taskId);
    if (taskRunSource === TaskRunSource.ChatAgent) {
      return;
    }
    const terminalForTask = this._terminalService.instances.find((i) => i.instanceId === event.terminalId);
    if (!terminalForTask) {
      return;
    }
    const taskLabel = terminalForTask.title;
    const targetWindow = dom.getWindow(terminalForTask.domElement);
    if (targetWindow.document.hasFocus()) {
      return;
    }
    const durationText = this._formatTaskDuration(durationMs);
    const message = taskLabel ? nls.localize("task.longRunningTaskCompletedWithLabel", 'Task "{0}" finished in {1}.', taskLabel, durationText) : nls.localize("task.longRunningTaskCompleted", "Task finished in {0}.", durationText);
    this._hostService.focus(targetWindow, { mode: FocusMode.Notify });
    const cts = new CancellationTokenSource();
    this.toast.value = toDisposable(() => cts.dispose(true));
    const { clicked } = await this._hostService.showToast({ title: message }, cts.token);
    this.toast.clear();
    if (clicked) {
      this._hostService.focus(targetWindow, { mode: FocusMode.Force });
    }
  }
  _formatTaskDuration(durationMs) {
    const totalSeconds = Math.max(1, Math.round(durationMs / 1e3));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return seconds > 0 ? nls.localize("task.longRunningTaskDurationMinutesSeconds", "{0}m {1}s", minutes, seconds) : nls.localize("task.longRunningTaskDurationMinutes", "{0}m", minutes);
    }
    return nls.localize("task.longRunningTaskDurationSeconds", "{0}s", seconds);
  }
  async _reconnectTasks() {
    const tasks = await this.getSavedTasks("persistent");
    if (!tasks.length) {
      this._log(nls.localize("TaskService.noTasks", "No persistent tasks to reconnect."), true);
      return true;
    }
    const taskLabels = tasks.map((task) => task._label).join(", ");
    this._log(nls.localize("TaskService.reconnectingTasks", "Reconnecting to {0} tasks...", taskLabels), true);
    for (const task of tasks) {
      if (ConfiguringTask.is(task)) {
        const resolved = await this.tryResolveTask(task);
        if (resolved) {
          this.run(resolved, void 0, TaskRunSource.Reconnect);
        }
      } else {
        this.run(task, void 0, TaskRunSource.Reconnect);
      }
    }
    return true;
  }
  get onDidStateChange() {
    return this._onDidStateChange.event;
  }
  get supportsMultipleTaskExecutions() {
    return this.inTerminal();
  }
  async _registerCommands() {
    CommandsRegistry.registerCommand({
      id: "workbench.action.tasks.runTask",
      handler: async (accessor, arg) => {
        if (await this._trust()) {
          await this._runTaskCommand(arg);
        }
      },
      metadata: {
        description: "Run Task",
        args: [{
          name: "args",
          isOptional: true,
          description: nls.localize("runTask.arg", "Filters the tasks shown in the quickpick"),
          schema: {
            anyOf: [
              {
                type: "string",
                description: nls.localize("runTask.label", "The task's label or a term to filter by")
              },
              {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description: nls.localize("runTask.type", "The contributed task type")
                  },
                  task: {
                    type: "string",
                    description: nls.localize("runTask.task", "The task's label or a term to filter by")
                  }
                }
              }
            ]
          }
        }]
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.reRunTask", async (accessor) => {
      if (await this._trust()) {
        this._reRunTaskCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.restartTask", async (accessor, arg) => {
      if (await this._trust()) {
        this._runRestartTaskCommand(arg);
      }
    });
    CommandsRegistry.registerCommand(RerunAllRunningTasksCommandId, async (accessor) => {
      if (await this._trust()) {
        this._runRerunAllRunningTasksCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.terminate", async (accessor, arg) => {
      if (await this._trust()) {
        this._runTerminateCommand(arg);
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.showLog", () => {
      this._showOutput(void 0, true);
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.build", async () => {
      if (await this._trust()) {
        this._runBuildCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.test", async () => {
      if (await this._trust()) {
        this._runTestCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.configureTaskRunner", async () => {
      if (await this._trust()) {
        this._runConfigureTasks();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.configureDefaultBuildTask", async () => {
      if (await this._trust()) {
        this._runConfigureDefaultBuildTask();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.configureDefaultTestTask", async () => {
      if (await this._trust()) {
        this._runConfigureDefaultTestTask();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.showTasks", async () => {
      if (await this._trust()) {
        return this.runShowTasks();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.toggleProblems", () => this._commandService.executeCommand(Markers.TOGGLE_MARKERS_VIEW_ACTION_ID));
    CommandsRegistry.registerCommand("workbench.action.tasks.openUserTasks", async () => {
      const resource = this._getResourceForKind(TaskSourceKind.User);
      if (resource) {
        this._openTaskFile(resource, TaskSourceKind.User);
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.openWorkspaceFileTasks", async () => {
      const resource = this._getResourceForKind(TaskSourceKind.WorkspaceFile);
      if (resource) {
        this._openTaskFile(resource, TaskSourceKind.WorkspaceFile);
      }
    });
  }
  get workspaceFolders() {
    if (!this._workspaceFolders) {
      this._updateSetup();
    }
    return this._workspaceFolders;
  }
  get ignoredWorkspaceFolders() {
    if (!this._ignoredWorkspaceFolders) {
      this._updateSetup();
    }
    return this._ignoredWorkspaceFolders;
  }
  get executionEngine() {
    if (this._executionEngine === void 0) {
      this._updateSetup();
    }
    return this._executionEngine;
  }
  get schemaVersion() {
    if (this._schemaVersion === void 0) {
      this._updateSetup();
    }
    return this._schemaVersion;
  }
  get showIgnoreMessage() {
    if (this._showIgnoreMessage === void 0) {
      this._showIgnoreMessage = !this._storageService.getBoolean(AbstractTaskService.IgnoreTask010DonotShowAgain_key, StorageScope.WORKSPACE, false);
    }
    return this._showIgnoreMessage;
  }
  _getActivationEvents(type) {
    const result = [];
    result.push("onCommand:workbench.action.tasks.runTask");
    if (type) {
      result.push(`onTaskType:${type}`);
    } else {
      for (const definition of TaskDefinitionRegistry.all()) {
        result.push(`onTaskType:${definition.taskType}`);
      }
    }
    return result;
  }
  async _activateTaskProviders(type) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const hasLoggedActivation = this._activatedTaskProviders.has(type ?? "all");
    if (!hasLoggedActivation) {
      this._log("Activating task providers " + (type ?? "all"));
    }
    const result = await raceTimeout(
      Promise.all(this._getActivationEvents(type).map((activationEvent) => this._extensionService.activateByEvent(activationEvent))),
      5e3,
      () => this._logService.warn("Timed out activating extensions for task providers")
    );
    if (result) {
      this._activatedTaskProviders.add(type ?? "all");
    }
  }
  _updateSetup(setup) {
    if (!setup) {
      setup = this._computeWorkspaceFolderSetup();
    }
    this._workspaceFolders = setup[0];
    if (this._ignoredWorkspaceFolders) {
      if (this._ignoredWorkspaceFolders.length !== setup[1].length) {
        this._showIgnoreMessage = void 0;
      } else {
        const set = /* @__PURE__ */ new Set();
        this._ignoredWorkspaceFolders.forEach((folder) => set.add(folder.uri.toString()));
        for (const folder of setup[1]) {
          if (!set.has(folder.uri.toString())) {
            this._showIgnoreMessage = void 0;
            break;
          }
        }
      }
    }
    this._ignoredWorkspaceFolders = setup[1];
    this._executionEngine = setup[2];
    this._schemaVersion = setup[3];
    this._workspace = setup[4];
  }
  _showOutput(runSource = TaskRunSource.User, userRequested, errorMessage) {
    if (!VirtualWorkspaceContext.getValue(this._contextKeyService) && (runSource === TaskRunSource.User || runSource === TaskRunSource.ConfigurationChange)) {
      if (userRequested) {
        this._outputService.showChannel(this._outputChannel.id, true);
      } else {
        const chatEnabled = this._chatService.isEnabled(ChatAgentLocation.Chat);
        const actions = [];
        if (chatEnabled && errorMessage) {
          const beforeJSONregex = /^(.*?)\s*\{[\s\S]*$/;
          const matches = errorMessage.match(beforeJSONregex);
          if (matches && matches.length > 1) {
            const message = matches[1];
            const customMessage = message === errorMessage ? `\`${message}\`` : `\`${message}\`
\`\`\`json${errorMessage}\`\`\``;
            const defaultAgent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
            if (defaultAgent) {
              actions.push({
                label: nls.localize("troubleshootWithChat", "Fix with AI"),
                run: async () => {
                  this._commandService.executeCommand(CHAT_OPEN_ACTION_ID, {
                    mode: ChatModeKind.Agent,
                    query: `Fix this task configuration error: ${customMessage}`
                  });
                }
              });
            }
          }
        }
        actions.push({
          label: nls.localize("showOutput", "Show Output"),
          run: () => {
            this._outputService.showChannel(this._outputChannel.id, true);
          }
        });
        if (chatEnabled && actions.length > 1) {
          this._notificationService.prompt(Severity.Warning, nls.localize("taskServiceOutputPromptChat", "There are task errors. Use chat to fix them or view the output for details."), actions);
        } else {
          this._notificationService.prompt(Severity.Warning, nls.localize("taskServiceOutputPrompt", "There are task errors. See the output for details."), actions);
        }
      }
    }
  }
  _disposeTaskSystemListeners() {
    if (this._taskSystemListeners) {
      dispose(this._taskSystemListeners);
      this._taskSystemListeners = void 0;
    }
  }
  registerTaskProvider(provider, type) {
    if (!provider) {
      return {
        dispose: () => {
        }
      };
    }
    const handle = AbstractTaskService._nextHandle++;
    this._providers.set(handle, provider);
    this._providerTypes.set(handle, type);
    this._onDidChangeTaskProviders.fire();
    return {
      dispose: () => {
        this._providers.delete(handle);
        this._providerTypes.delete(handle);
        this._onDidChangeTaskProviders.fire();
      }
    };
  }
  get hasTaskSystemInfo() {
    const infosCount = Array.from(this._taskSystemInfos.values()).flat().length;
    if (this._environmentService.remoteAuthority) {
      return infosCount > 1;
    }
    return infosCount > 0;
  }
  registerTaskSystem(key, info) {
    if (info.platform === Platform.Platform.Web) {
      key = this.workspaceFolders.length ? this.workspaceFolders[0].uri.scheme : key;
    }
    if (!this._taskSystemInfos.has(key)) {
      this._taskSystemInfos.set(key, [info]);
    } else {
      const infos = this._taskSystemInfos.get(key);
      if (info.platform === Platform.Platform.Web) {
        infos.push(info);
      } else {
        infos.unshift(info);
      }
    }
    if (this.hasTaskSystemInfo) {
      this._onDidChangeTaskSystemInfo.fire();
    }
  }
  _getTaskSystemInfo(key) {
    const infos = this._taskSystemInfos.get(key);
    return infos && infos.length ? infos[0] : void 0;
  }
  extensionCallbackTaskComplete(task, result) {
    if (!this._taskSystem) {
      return Promise.resolve();
    }
    return this._taskSystem.customExecutionComplete(task, result);
  }
  /**
   * Get a subset of workspace tasks that match a certain predicate.
   */
  async _findWorkspaceTasks(predicate) {
    const result = [];
    const tasks = await this.getWorkspaceTasks();
    for (const [, workspaceTasks] of tasks) {
      if (workspaceTasks.configurations) {
        for (const taskName of Object.keys(workspaceTasks.configurations.byIdentifier)) {
          const task = workspaceTasks.configurations.byIdentifier[taskName];
          if (predicate(task, workspaceTasks.workspaceFolder)) {
            result.push(task);
          }
        }
      }
      if (workspaceTasks.set) {
        for (const task of workspaceTasks.set.tasks) {
          if (predicate(task, workspaceTasks.workspaceFolder)) {
            result.push(task);
          }
        }
      }
    }
    return result;
  }
  async _findWorkspaceTasksInGroup(group, isDefault) {
    return this._findWorkspaceTasks((task) => {
      const taskGroup = task.configurationProperties.group;
      if (taskGroup && typeof taskGroup !== "string") {
        return taskGroup._id === group._id && (!isDefault || !!taskGroup.isDefault);
      }
      return false;
    });
  }
  async getTask(folder, identifier, compareId = false, type = void 0) {
    if (!await this._trust()) {
      return;
    }
    const name = Types.isString(folder) ? folder : isWorkspaceFolder(folder) ? folder.name : folder.configuration ? resources.basename(folder.configuration) : void 0;
    if (this.ignoredWorkspaceFolders.some((ignored) => ignored.name === name)) {
      return Promise.reject(new Error(nls.localize("TaskServer.folderIgnored", "The folder {0} is ignored since it uses task version 0.1.0", name)));
    }
    const key = !Types.isString(identifier) ? TaskDefinition.createTaskIdentifier(identifier, console) : identifier;
    if (key === void 0) {
      return Promise.resolve(void 0);
    }
    const requestedFolder = TaskMap.getKey(folder);
    const matchedTasks = await this._findWorkspaceTasks((task, workspaceFolder) => {
      const taskFolder = TaskMap.getKey(workspaceFolder);
      if (taskFolder !== requestedFolder && taskFolder !== USER_TASKS_GROUP_KEY) {
        return false;
      }
      return task.matches(key, compareId);
    });
    matchedTasks.sort((task) => task._source.kind === TaskSourceKind.Extension ? 1 : -1);
    if (matchedTasks.length > 0) {
      const task = matchedTasks[0];
      if (ConfiguringTask.is(task)) {
        return this.tryResolveTask(task);
      } else {
        return task;
      }
    }
    const map = await this._getGroupedTasks({ type });
    let values = map.get(folder);
    values = values.concat(map.get(USER_TASKS_GROUP_KEY));
    if (!values) {
      return void 0;
    }
    values = values.filter((task) => task.matches(key, compareId)).sort((task) => task._source.kind === TaskSourceKind.Extension ? 1 : -1);
    return values.length > 0 ? values[0] : void 0;
  }
  async tryResolveTask(configuringTask) {
    if (!await this._trust()) {
      return;
    }
    await this._activateTaskProviders(configuringTask.type);
    let matchingProvider;
    let matchingProviderUnavailable = false;
    for (const [handle, provider] of this._providers) {
      const providerType = this._providerTypes.get(handle);
      if (configuringTask.type === providerType) {
        if (providerType && !this._isTaskProviderEnabled(providerType)) {
          matchingProviderUnavailable = true;
          continue;
        }
        matchingProvider = provider;
        break;
      }
    }
    if (!matchingProvider) {
      if (matchingProviderUnavailable) {
        this._log(nls.localize(
          "TaskService.providerUnavailable",
          "Warning: {0} tasks are unavailable in the current environment.",
          configuringTask.configures.type
        ));
      }
      return;
    }
    try {
      const resolvedTask = await matchingProvider.resolveTask(configuringTask);
      if (resolvedTask && resolvedTask._id === configuringTask._id) {
        return TaskConfig.createCustomTask(resolvedTask, configuringTask);
      }
    } catch (error) {
    }
    const tasks = await this.tasks({ type: configuringTask.type });
    for (const task of tasks) {
      if (task._id === configuringTask._id) {
        return TaskConfig.createCustomTask(task, configuringTask);
      }
    }
    return;
  }
  async tasks(filter) {
    if (!await this._trust()) {
      return [];
    }
    if (!this._versionAndEngineCompatible(filter)) {
      return Promise.resolve([]);
    }
    return this._getGroupedTasks(filter).then((map) => this.applyFilterToTaskMap(filter, map));
  }
  async getKnownTasks(filter) {
    if (!this._versionAndEngineCompatible(filter)) {
      return Promise.resolve([]);
    }
    return this._getGroupedTasks(filter, true, true).then((map) => this.applyFilterToTaskMap(filter, map));
  }
  taskTypes() {
    const types = [];
    if (this._isProvideTasksEnabled()) {
      for (const definition of TaskDefinitionRegistry.all()) {
        if (this._isTaskProviderEnabled(definition.taskType)) {
          types.push(definition.taskType);
        }
      }
    }
    return types;
  }
  createSorter() {
    return new TaskSorter(this._contextService.getWorkspace() ? this._contextService.getWorkspace().folders : []);
  }
  _isActive() {
    if (!this._taskSystem) {
      return Promise.resolve(false);
    }
    return this._taskSystem.isActive();
  }
  async getActiveTasks() {
    if (!this._taskSystem) {
      return [];
    }
    return this._taskSystem.getActiveTasks();
  }
  async getBusyTasks() {
    if (!this._taskSystem) {
      return [];
    }
    return this._taskSystem.getBusyTasks();
  }
  getRecentlyUsedTasksV1() {
    if (this._recentlyUsedTasksV1) {
      return this._recentlyUsedTasksV1;
    }
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    this._recentlyUsedTasksV1 = new LRUCache(quickOpenHistoryLimit);
    const storageValue = this._storageService.get(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
    if (storageValue) {
      try {
        const values = JSON.parse(storageValue);
        if (Array.isArray(values)) {
          for (const value of values) {
            this._recentlyUsedTasksV1.set(value, value);
          }
        }
      } catch (error) {
      }
    }
    return this._recentlyUsedTasksV1;
  }
  applyFilterToTaskMap(filter, map) {
    if (!filter || !filter.type) {
      return map.all();
    }
    const result = [];
    map.forEach((tasks) => {
      for (const task of tasks) {
        if (ContributedTask.is(task) && (task.defines.type === filter.type || task._source.label === filter.type)) {
          result.push(task);
        } else if (CustomTask.is(task)) {
          if (task.type === filter.type) {
            result.push(task);
          } else {
            const customizes = task.customizes();
            if (customizes && customizes.type === filter.type) {
              result.push(task);
            }
          }
        }
      }
    });
    return result;
  }
  _getTasksFromStorage(type) {
    return type === "persistent" ? this._getPersistentTasks() : this._getRecentTasks();
  }
  _getRecentTasks() {
    if (this._recentlyUsedTasks) {
      return this._recentlyUsedTasks;
    }
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    this._recentlyUsedTasks = new LRUCache(quickOpenHistoryLimit);
    const storageValue = this._storageService.get(AbstractTaskService.RecentlyUsedTasks_KeyV2, StorageScope.WORKSPACE);
    if (storageValue) {
      try {
        const values = JSON.parse(storageValue);
        if (Array.isArray(values)) {
          for (const value of values) {
            this._recentlyUsedTasks.set(value[0], value[1]);
          }
        }
      } catch (error) {
      }
    }
    return this._recentlyUsedTasks;
  }
  _getPersistentTasks() {
    if (this._persistentTasks) {
      this._log(nls.localize("taskService.gettingCachedTasks", "Returning cached tasks {0}", this._persistentTasks.size), true);
      return this._persistentTasks;
    }
    this._persistentTasks = new LRUCache(10);
    const storageValue = this._storageService.get(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
    if (storageValue) {
      try {
        const values = JSON.parse(storageValue);
        if (Array.isArray(values)) {
          for (const value of values) {
            this._persistentTasks.set(value[0], value[1]);
          }
        }
      } catch (error) {
      }
    }
    return this._persistentTasks;
  }
  _getFolderFromTaskKey(key) {
    const keyValue = JSON.parse(key);
    return {
      folder: keyValue.folder,
      isWorkspaceFile: keyValue.id?.endsWith(TaskSourceKind.WorkspaceFile)
    };
  }
  async getSavedTasks(type) {
    const folderMap = /* @__PURE__ */ Object.create(null);
    this.workspaceFolders.forEach((folder) => {
      folderMap[folder.uri.toString()] = folder;
    });
    const folderToTasksMap = /* @__PURE__ */ new Map();
    const workspaceToTaskMap = /* @__PURE__ */ new Map();
    const storedTasks = this._getTasksFromStorage(type);
    const tasks = [];
    this._log(nls.localize("taskService.getSavedTasks", "Fetching tasks from task storage."), true);
    function addTaskToMap(map, folder, task) {
      if (folder && !map.has(folder)) {
        map.set(folder, []);
      }
      if (folder && (folderMap[folder] || folder === USER_TASKS_GROUP_KEY) && task) {
        map.get(folder).push(task);
      }
    }
    for (const entry of storedTasks.entries()) {
      try {
        const key = entry[0];
        const task = JSON.parse(entry[1]);
        const folderInfo = this._getFolderFromTaskKey(key);
        this._log(nls.localize("taskService.getSavedTasks.reading", "Reading tasks from task storage, {0}, {1}, {2}", key, task, folderInfo.folder), true);
        addTaskToMap(folderInfo.isWorkspaceFile ? workspaceToTaskMap : folderToTasksMap, folderInfo.folder, task);
      } catch (error) {
        this._log(nls.localize("taskService.getSavedTasks.error", "Fetching a task from task storage failed: {0}.", error), true);
      }
    }
    const readTasksMap = /* @__PURE__ */ new Map();
    async function readTasks(that, map, isWorkspaceFile) {
      for (const key of map.keys()) {
        const custom = [];
        const customized = /* @__PURE__ */ Object.create(null);
        const taskConfigSource = folderMap[key] ? isWorkspaceFile ? TaskConfig.TaskConfigSource.WorkspaceFile : TaskConfig.TaskConfigSource.TasksJson : TaskConfig.TaskConfigSource.User;
        await that._computeTasksForSingleConfig(folderMap[key] ?? await that._getAFolder(), {
          version: "2.0.0",
          tasks: map.get(key)
        }, TaskRunSource.System, custom, customized, taskConfigSource, true);
        custom.forEach((task) => {
          const taskKey = task.getKey();
          if (taskKey) {
            readTasksMap.set(taskKey, task);
          }
        });
        for (const configuration of Object.keys(customized)) {
          const taskKey = customized[configuration].getKey();
          if (taskKey) {
            readTasksMap.set(taskKey, customized[configuration]);
          }
        }
      }
    }
    await readTasks(this, folderToTasksMap, false);
    await readTasks(this, workspaceToTaskMap, true);
    for (const key of storedTasks.keys()) {
      if (readTasksMap.has(key)) {
        tasks.push(readTasksMap.get(key));
        this._log(nls.localize("taskService.getSavedTasks.resolved", "Resolved task {0}", key), true);
      } else {
        this._log(nls.localize("taskService.getSavedTasks.unresolved", "Unable to resolve task {0} ", key), true);
      }
    }
    return tasks;
  }
  removeRecentlyUsedTask(taskRecentlyUsedKey) {
    if (this._getTasksFromStorage("historical").delete(taskRecentlyUsedKey)) {
      this._saveRecentlyUsedTasks();
    }
  }
  removePersistentTask(key) {
    this._log(nls.localize("taskService.removePersistentTask", "Removing persistent task {0}", key), true);
    if (this._getTasksFromStorage("persistent").delete(key)) {
      this._savePersistentTasks();
    }
  }
  _setTaskLRUCacheLimit() {
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    if (this._recentlyUsedTasks) {
      this._recentlyUsedTasks.limit = quickOpenHistoryLimit;
    }
  }
  async _setRecentlyUsedTask(task) {
    let key = task.getKey();
    if (!InMemoryTask.is(task) && key) {
      const customizations = this._createCustomizableTask(task);
      if (ContributedTask.is(task) && customizations) {
        const custom = [];
        const customized = /* @__PURE__ */ Object.create(null);
        await this._computeTasksForSingleConfig(task._source.workspaceFolder ?? this.workspaceFolders[0], {
          version: "2.0.0",
          tasks: [customizations]
        }, TaskRunSource.System, custom, customized, TaskConfig.TaskConfigSource.TasksJson, true);
        for (const configuration of Object.keys(customized)) {
          key = customized[configuration].getKey();
        }
      }
      this._getTasksFromStorage("historical").set(key, JSON.stringify(customizations));
      this._saveRecentlyUsedTasks();
    }
  }
  _saveRecentlyUsedTasks() {
    if (!this._recentlyUsedTasks) {
      return;
    }
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    if (quickOpenHistoryLimit === 0) {
      return;
    }
    let keys = [...this._recentlyUsedTasks.keys()];
    if (keys.length > quickOpenHistoryLimit) {
      keys = keys.slice(0, quickOpenHistoryLimit);
    }
    const keyValues = [];
    for (const key of keys) {
      keyValues.push([key, this._recentlyUsedTasks.get(key, Touch.None)]);
    }
    this._storageService.store(AbstractTaskService.RecentlyUsedTasks_KeyV2, JSON.stringify(keyValues), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async _setPersistentTask(task) {
    if (!this._configurationService.getValue(TaskSettingId.Reconnection)) {
      return;
    }
    let key = task.getKey();
    if (!InMemoryTask.is(task) && key) {
      const customizations = this._createCustomizableTask(task);
      if (ContributedTask.is(task) && customizations) {
        const custom = [];
        const customized = /* @__PURE__ */ Object.create(null);
        await this._computeTasksForSingleConfig(task._source.workspaceFolder ?? this.workspaceFolders[0], {
          version: "2.0.0",
          tasks: [customizations]
        }, TaskRunSource.System, custom, customized, TaskConfig.TaskConfigSource.TasksJson, true);
        for (const configuration of Object.keys(customized)) {
          key = customized[configuration].getKey();
        }
      }
      if (!task.configurationProperties.isBackground) {
        return;
      }
      this._log(nls.localize("taskService.setPersistentTask", "Setting persistent task {0}", key), true);
      this._getTasksFromStorage("persistent").set(key, JSON.stringify(customizations));
      this._savePersistentTasks();
    }
  }
  _savePersistentTasks() {
    this._persistentTasks = this._getTasksFromStorage("persistent");
    const keys = [...this._persistentTasks.keys()];
    const keyValues = [];
    for (const key of keys) {
      keyValues.push([key, this._persistentTasks.get(key, Touch.None)]);
    }
    this._log(nls.localize("savePersistentTask", "Saving persistent tasks: {0}", keys.join(", ")), true);
    this._storageService.store(AbstractTaskService.PersistentTasks_Key, JSON.stringify(keyValues), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  _openDocumentation() {
    this._openerService.open(URI.parse("https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher"));
  }
  async _findSingleWorkspaceTaskOfGroup(group) {
    const tasksOfGroup = await this._findWorkspaceTasksInGroup(group, true);
    if (tasksOfGroup.length === 1 && typeof tasksOfGroup[0].configurationProperties.group !== "string" && tasksOfGroup[0].configurationProperties.group?.isDefault) {
      let resolvedTask;
      if (ConfiguringTask.is(tasksOfGroup[0])) {
        resolvedTask = await this.tryResolveTask(tasksOfGroup[0]);
      } else {
        resolvedTask = tasksOfGroup[0];
      }
      if (resolvedTask) {
        return this.run(resolvedTask, void 0, TaskRunSource.User);
      }
    }
    return void 0;
  }
  async _build() {
    const tryBuildShortcut = await this._findSingleWorkspaceTaskOfGroup(TaskGroup.Build);
    if (tryBuildShortcut) {
      return tryBuildShortcut;
    }
    return this._getGroupedTasksAndExecute();
  }
  async _runTest() {
    const tryTestShortcut = await this._findSingleWorkspaceTaskOfGroup(TaskGroup.Test);
    if (tryTestShortcut) {
      return tryTestShortcut;
    }
    return this._getGroupedTasksAndExecute(true);
  }
  async _getGroupedTasksAndExecute(test) {
    const tasks = await this._getGroupedTasks();
    const runnable = this._createRunnableTask(tasks, test ? TaskGroup.Test : TaskGroup.Build);
    if (!runnable || !runnable.task) {
      if (test) {
        if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noTestTask1", "No test task defined. Mark a task with 'isTestCommand' in the tasks.json file."), TaskErrors.NoTestTask);
        } else {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noTestTask2", "No test task defined. Mark a task with as a 'test' group in the tasks.json file."), TaskErrors.NoTestTask);
        }
      } else {
        if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noBuildTask1", "No build task defined. Mark a task with 'isBuildCommand' in the tasks.json file."), TaskErrors.NoBuildTask);
        } else {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noBuildTask2", "No build task defined. Mark a task with as a 'build' group in the tasks.json file."), TaskErrors.NoBuildTask);
        }
      }
    }
    let executeTaskResult;
    try {
      executeTaskResult = await this._executeTask(runnable.task, runnable.resolver, TaskRunSource.User);
    } catch (error) {
      this._handleError(error);
      return Promise.reject(error);
    }
    return executeTaskResult;
  }
  async run(task, options, runSource = TaskRunSource.System) {
    if (!await this._trust()) {
      return;
    }
    if (!task) {
      throw new TaskError(Severity.Info, nls.localize("TaskServer.noTask", "Task to execute is undefined"), TaskErrors.TaskNotFound);
    }
    const resolver = this._createResolver();
    let executeTaskResult;
    try {
      if (options && options.attachProblemMatcher && this._shouldAttachProblemMatcher(task) && !InMemoryTask.is(task)) {
        const taskToExecute = await this._attachProblemMatcher(task);
        if (taskToExecute) {
          executeTaskResult = await this._executeTask(taskToExecute, resolver, runSource);
        }
      } else {
        executeTaskResult = await this._executeTask(task, resolver, runSource);
      }
      return executeTaskResult;
    } catch (error) {
      this._handleError(error);
      return Promise.reject(error);
    }
  }
  _isProvideTasksEnabled() {
    const settingValue = this._configurationService.getValue(TaskSettingId.AutoDetect);
    return settingValue === "on";
  }
  _isProblemMatcherPromptEnabled(type) {
    const settingValue = this._configurationService.getValue(PROBLEM_MATCHER_NEVER_CONFIG);
    if (Types.isBoolean(settingValue)) {
      return !settingValue;
    }
    if (type === void 0) {
      return true;
    }
    const settingValueMap = settingValue;
    return !settingValueMap[type];
  }
  _getTypeForTask(task) {
    let type;
    if (CustomTask.is(task)) {
      const configProperties = task._source.config.element;
      type = configProperties.type ?? "";
    } else {
      type = task.getDefinition().type;
    }
    return type;
  }
  _shouldAttachProblemMatcher(task) {
    const enabled = this._isProblemMatcherPromptEnabled(this._getTypeForTask(task));
    if (enabled === false) {
      return false;
    }
    if (!this._canCustomize(task)) {
      return false;
    }
    if (task.configurationProperties.group !== void 0 && task.configurationProperties.group !== TaskGroup.Build) {
      return false;
    }
    if (task.configurationProperties.problemMatchers !== void 0 && task.configurationProperties.problemMatchers.length > 0) {
      return false;
    }
    if (ContributedTask.is(task)) {
      return !task.hasDefinedMatchers && !!task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length === 0;
    }
    if (CustomTask.is(task)) {
      const configProperties = task._source.config.element;
      return configProperties.problemMatcher === void 0 && !task.hasDefinedMatchers;
    }
    return false;
  }
  async _updateNeverProblemMatcherSetting(type) {
    const current = this._configurationService.getValue(PROBLEM_MATCHER_NEVER_CONFIG);
    if (current === true) {
      return;
    }
    let newValue;
    if (current !== false) {
      newValue = current;
    } else {
      newValue = /* @__PURE__ */ Object.create(null);
    }
    newValue[type] = true;
    return this._configurationService.updateValue(PROBLEM_MATCHER_NEVER_CONFIG, newValue);
  }
  async _attachProblemMatcher(task) {
    let entries = [];
    for (const key of ProblemMatcherRegistry.keys()) {
      const matcher = ProblemMatcherRegistry.get(key);
      if (matcher.deprecated) {
        continue;
      }
      if (matcher.name === matcher.label) {
        entries.push({ label: matcher.name, matcher });
      } else {
        entries.push({
          label: matcher.label,
          description: `$${matcher.name}`,
          matcher
        });
      }
    }
    if (entries.length === 0) {
      return;
    }
    entries = entries.sort((a, b) => {
      if (a.label && b.label) {
        return a.label.localeCompare(b.label);
      } else {
        return 0;
      }
    });
    entries.unshift({ type: "separator", label: nls.localize("TaskService.associate", "associate") });
    let taskType;
    if (CustomTask.is(task)) {
      const configProperties = task._source.config.element;
      taskType = configProperties.type ?? "";
    } else {
      taskType = task.getDefinition().type;
    }
    entries.unshift(
      { label: nls.localize("TaskService.attachProblemMatcher.continueWithout", "Continue without scanning the task output"), matcher: void 0 },
      { label: nls.localize("TaskService.attachProblemMatcher.never", "Never scan the task output for this task"), matcher: void 0, never: true },
      { label: nls.localize("TaskService.attachProblemMatcher.neverType", "Never scan the task output for {0} tasks", taskType), matcher: void 0, setting: taskType },
      { label: nls.localize("TaskService.attachProblemMatcher.learnMoreAbout", "Learn more about scanning the task output"), matcher: void 0, learnMore: true }
    );
    const problemMatcher = await this._quickInputService.pick(entries, { placeHolder: nls.localize("selectProblemMatcher", "Select for which kind of errors and warnings to scan the task output") });
    if (!problemMatcher) {
      return task;
    }
    if (problemMatcher.learnMore) {
      this._openDocumentation();
      return void 0;
    }
    if (problemMatcher.never) {
      this.customize(task, { problemMatcher: [] }, true);
      return task;
    }
    if (problemMatcher.matcher) {
      const newTask = task.clone();
      const matcherReference = `$${problemMatcher.matcher.name}`;
      const properties = { problemMatcher: [matcherReference] };
      newTask.configurationProperties.problemMatchers = [matcherReference];
      const matcher = ProblemMatcherRegistry.get(problemMatcher.matcher.name);
      if (matcher && matcher.watching !== void 0) {
        properties.isBackground = true;
        newTask.configurationProperties.isBackground = true;
      }
      this.customize(task, properties, true);
      return newTask;
    }
    if (problemMatcher.setting) {
      await this._updateNeverProblemMatcherSetting(problemMatcher.setting);
    }
    return task;
  }
  async _getTasksForGroup(group, waitToActivate) {
    const groups = await this._getGroupedTasks(void 0, waitToActivate);
    const result = [];
    groups.forEach((tasks) => {
      for (const task of tasks) {
        const configTaskGroup = TaskGroup.from(task.configurationProperties.group);
        if (configTaskGroup?._id === group._id) {
          result.push(task);
        }
      }
    });
    return result;
  }
  needsFolderQualification() {
    return this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
  }
  _canCustomize(task) {
    if (this.schemaVersion !== JsonSchemaVersion.V2_0_0) {
      return false;
    }
    if (CustomTask.is(task)) {
      return true;
    }
    if (ContributedTask.is(task)) {
      return !!task.getWorkspaceFolder();
    }
    return false;
  }
  async _formatTaskForJson(resource, task) {
    let reference;
    let stringValue = "";
    try {
      reference = await this._textModelResolverService.createModelReference(resource);
      const model = reference.object.textEditorModel;
      const { tabSize, insertSpaces } = model.getOptions();
      const eol = model.getEOL();
      let stringified = toFormattedString(task, { eol, tabSize, insertSpaces });
      const regex = new RegExp(eol + (insertSpaces ? " ".repeat(tabSize) : "\\t"), "g");
      stringified = stringified.replace(regex, eol + (insertSpaces ? " ".repeat(tabSize * 3) : "			"));
      const twoTabs = insertSpaces ? " ".repeat(tabSize * 2) : "		";
      stringValue = twoTabs + stringified.slice(0, stringified.length - 1) + twoTabs + stringified.slice(stringified.length - 1);
    } finally {
      reference?.dispose();
    }
    return stringValue;
  }
  async _openEditorAtTask(resource, task, configIndex = -1) {
    if (resource === void 0) {
      return Promise.resolve(false);
    }
    const fileContent = await this._fileService.readFile(resource);
    const content = fileContent.value;
    if (!content || !task) {
      return false;
    }
    const contentValue = content.toString();
    let stringValue;
    if (configIndex !== -1) {
      const json2 = this._configurationService.getValue("tasks", { resource });
      if (json2.tasks && json2.tasks.length > configIndex) {
        stringValue = await this._formatTaskForJson(resource, json2.tasks[configIndex]);
      }
    }
    if (!stringValue) {
      if (typeof task === "string") {
        stringValue = task;
      } else {
        stringValue = await this._formatTaskForJson(resource, task);
      }
    }
    const index = contentValue.indexOf(stringValue);
    let startLineNumber = 1;
    for (let i = 0; i < index; i++) {
      if (contentValue.charAt(i) === "\n") {
        startLineNumber++;
      }
    }
    let endLineNumber = startLineNumber;
    for (let i = 0; i < stringValue.length; i++) {
      if (stringValue.charAt(i) === "\n") {
        endLineNumber++;
      }
    }
    const selection = startLineNumber > 1 ? { startLineNumber, startColumn: startLineNumber === endLineNumber ? 4 : 3, endLineNumber, endColumn: startLineNumber === endLineNumber ? void 0 : 4 } : void 0;
    await this._editorService.openEditor({
      resource,
      options: {
        pinned: false,
        forceReload: true,
        // because content might have changed
        selection,
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
    return !!selection;
  }
  _createCustomizableTask(task) {
    let toCustomize;
    const taskConfig = CustomTask.is(task) || ConfiguringTask.is(task) ? task._source.config : void 0;
    if (taskConfig && taskConfig.element) {
      toCustomize = { ...taskConfig.element };
    } else if (ContributedTask.is(task)) {
      toCustomize = {};
      const identifier = Object.assign(/* @__PURE__ */ Object.create(null), task.defines);
      delete identifier["_key"];
      Object.keys(identifier).forEach((key) => toCustomize[key] = identifier[key]);
      if (task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length > 0 && Types.isStringArray(task.configurationProperties.problemMatchers)) {
        toCustomize.problemMatcher = task.configurationProperties.problemMatchers;
      }
      if (task.configurationProperties.group) {
        toCustomize.group = TaskConfig.GroupKind.to(task.configurationProperties.group);
      }
    }
    if (!toCustomize) {
      return void 0;
    }
    if (toCustomize.problemMatcher === void 0 && task.configurationProperties.problemMatchers === void 0 || task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length === 0) {
      toCustomize.problemMatcher = [];
    }
    if (task._source.label !== "Workspace") {
      toCustomize.label = task.configurationProperties.identifier;
    } else {
      toCustomize.label = task._label;
    }
    toCustomize.detail = task.configurationProperties.detail;
    return toCustomize;
  }
  async customize(task, properties, openConfig) {
    if (!await this._trust()) {
      return;
    }
    const workspaceFolder = task.getWorkspaceFolder();
    if (!workspaceFolder) {
      return Promise.resolve(void 0);
    }
    const configuration = this._getConfiguration(workspaceFolder, task._source.kind);
    if (configuration.hasParseErrors) {
      this._notificationService.warn(nls.localize("customizeParseErrors", "The current task configuration has errors. Please fix the errors first before customizing a task."));
      return Promise.resolve(void 0);
    }
    const fileConfig = configuration.config;
    const toCustomize = this._createCustomizableTask(task);
    if (!toCustomize) {
      return Promise.resolve(void 0);
    }
    const index = CustomTask.is(task) ? task._source.config.index : void 0;
    if (properties) {
      for (const property of Object.getOwnPropertyNames(properties)) {
        const value = properties[property];
        if (value !== void 0 && value !== null) {
          toCustomize[property] = value;
        }
      }
    }
    if (!fileConfig) {
      const value = {
        version: "2.0.0",
        tasks: [toCustomize]
      };
      let content = [
        "{",
        nls.localize("tasksJsonComment", "	// See https://go.microsoft.com/fwlink/?LinkId=733558 \n	// for the documentation about the tasks.json format")
      ].join("\n") + JSON.stringify(value, null, "	").substr(1);
      const editorConfig = this._configurationService.getValue();
      if (editorConfig.editor.insertSpaces) {
        content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + " ".repeat(s2.length * editorConfig.editor.tabSize));
      }
      await this._textFileService.create([{ resource: workspaceFolder.toResource(".vscode/tasks.json"), value: content }]);
    } else {
      if (index === -1 && properties) {
        if (properties.problemMatcher !== void 0) {
          fileConfig.problemMatcher = properties.problemMatcher;
          await this._writeConfiguration(workspaceFolder, "tasks.problemMatchers", fileConfig.problemMatcher, task._source.kind);
        } else if (properties.group !== void 0) {
          fileConfig.group = properties.group;
          await this._writeConfiguration(workspaceFolder, "tasks.group", fileConfig.group, task._source.kind);
        }
      } else {
        if (!Array.isArray(fileConfig.tasks)) {
          fileConfig.tasks = [];
        }
        if (index === void 0) {
          fileConfig.tasks.push(toCustomize);
        } else {
          fileConfig.tasks[index] = toCustomize;
        }
        await this._writeConfiguration(workspaceFolder, "tasks.tasks", fileConfig.tasks, task._source.kind);
      }
    }
    if (openConfig) {
      this._openEditorAtTask(this._getResourceForTask(task), toCustomize);
    }
  }
  _writeConfiguration(workspaceFolder, key, value, source) {
    let target = void 0;
    switch (source) {
      case TaskSourceKind.User:
        target = ConfigurationTarget.USER;
        break;
      case TaskSourceKind.WorkspaceFile:
        target = ConfigurationTarget.WORKSPACE;
        break;
      default:
        if (this._contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
          target = ConfigurationTarget.WORKSPACE;
        } else if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
          target = ConfigurationTarget.WORKSPACE_FOLDER;
        }
    }
    if (target) {
      return this._configurationService.updateValue(key, value, { resource: workspaceFolder.uri }, target);
    } else {
      return void 0;
    }
  }
  _getResourceForKind(kind) {
    this._updateSetup();
    switch (kind) {
      case TaskSourceKind.User: {
        return resources.joinPath(resources.dirname(this._preferencesService.userSettingsResource), "tasks.json");
      }
      case TaskSourceKind.WorkspaceFile: {
        if (this._workspace && this._workspace.configuration) {
          return this._workspace.configuration;
        }
      }
      default: {
        return void 0;
      }
    }
  }
  _getResourceForTask(task) {
    if (CustomTask.is(task)) {
      let uri = this._getResourceForKind(task._source.kind);
      if (!uri) {
        const taskFolder = task.getWorkspaceFolder();
        if (taskFolder) {
          uri = taskFolder.toResource(task._source.config.file);
        } else {
          uri = this.workspaceFolders[0].uri;
        }
      }
      return uri;
    } else {
      return task.getWorkspaceFolder().toResource(".vscode/tasks.json");
    }
  }
  async openConfig(task) {
    let resource;
    if (task) {
      resource = this._getResourceForTask(task);
    } else {
      resource = this._workspaceFolders && this._workspaceFolders.length > 0 ? this._workspaceFolders[0].toResource(".vscode/tasks.json") : void 0;
    }
    return this._openEditorAtTask(resource, task ? task._label : void 0, task ? task._source.config.index : -1);
  }
  _createRunnableTask(tasks, group) {
    const resolverData = /* @__PURE__ */ new Map();
    const workspaceTasks = [];
    const extensionTasks = [];
    tasks.forEach((tasks2, folder) => {
      let data = resolverData.get(folder);
      if (!data) {
        data = {
          id: /* @__PURE__ */ new Map(),
          label: /* @__PURE__ */ new Map(),
          identifier: /* @__PURE__ */ new Map()
        };
        resolverData.set(folder, data);
      }
      for (const task of tasks2) {
        data.id.set(task._id, task);
        data.label.set(task._label, task);
        if (task.configurationProperties.identifier) {
          data.identifier.set(task.configurationProperties.identifier, task);
        }
        if (group && task.configurationProperties.group === group) {
          if (task._source.kind === TaskSourceKind.Workspace) {
            workspaceTasks.push(task);
          } else {
            extensionTasks.push(task);
          }
        }
      }
    });
    const resolver = {
      resolve: async (uri, alias) => {
        const data = resolverData.get(typeof uri === "string" ? uri : uri.toString());
        if (!data) {
          return void 0;
        }
        return data.id.get(alias) || data.label.get(alias) || data.identifier.get(alias);
      }
    };
    if (workspaceTasks.length > 0) {
      if (workspaceTasks.length > 1) {
        this._log(nls.localize("moreThanOneBuildTask", "There are many build tasks defined in the tasks.json. Executing the first one."));
      }
      return { task: workspaceTasks[0], resolver };
    }
    if (extensionTasks.length === 0) {
      return void 0;
    }
    if (extensionTasks.length === 1) {
      return { task: extensionTasks[0], resolver };
    } else {
      const id = UUID.generateUuid();
      const task = new InMemoryTask(
        id,
        { kind: TaskSourceKind.InMemory, label: "inMemory" },
        id,
        "inMemory",
        { reevaluateOnRerun: true },
        {
          identifier: id,
          dependsOn: extensionTasks.map((extensionTask) => {
            return { uri: extensionTask.getWorkspaceFolder().uri, task: extensionTask._id };
          }),
          name: id
        }
      );
      return { task, resolver };
    }
  }
  _createResolver(grouped) {
    let resolverData;
    async function quickResolve(that, uri, identifier) {
      const foundTasks = await that._findWorkspaceTasks((task2) => {
        const taskUri = ConfiguringTask.is(task2) || CustomTask.is(task2) ? task2._source.config.workspaceFolder?.uri : void 0;
        const originalUri = typeof uri === "string" ? uri : uri.toString();
        if (taskUri?.toString() !== originalUri) {
          return false;
        }
        if (Types.isString(identifier)) {
          return task2._label === identifier || task2.configurationProperties.identifier === identifier;
        } else {
          const keyedIdentifier = task2.getDefinition(true);
          const searchIdentifier = TaskDefinition.createTaskIdentifier(identifier, console);
          return searchIdentifier && keyedIdentifier ? searchIdentifier._key === keyedIdentifier._key : false;
        }
      });
      if (foundTasks.length === 0) {
        return void 0;
      }
      const task = foundTasks[0];
      if (ConfiguringTask.is(task)) {
        return that.tryResolveTask(task);
      }
      return task;
    }
    async function getResolverData(that) {
      if (resolverData === void 0) {
        resolverData = /* @__PURE__ */ new Map();
        (grouped || await that._getGroupedTasks()).forEach((tasks, folder) => {
          let data = resolverData.get(folder);
          if (!data) {
            data = { label: /* @__PURE__ */ new Map(), identifier: /* @__PURE__ */ new Map(), taskIdentifier: /* @__PURE__ */ new Map() };
            resolverData.set(folder, data);
          }
          for (const task of tasks) {
            data.label.set(task._label, task);
            if (task.configurationProperties.identifier) {
              data.identifier.set(task.configurationProperties.identifier, task);
            }
            const keyedIdentifier = task.getDefinition(true);
            if (keyedIdentifier !== void 0) {
              data.taskIdentifier.set(keyedIdentifier._key, task);
            }
          }
        });
      }
      return resolverData;
    }
    async function fullResolve(that, uri, identifier) {
      const allResolverData = await getResolverData(that);
      const data = allResolverData.get(typeof uri === "string" ? uri : uri.toString());
      if (!data) {
        return void 0;
      }
      if (Types.isString(identifier)) {
        return data.label.get(identifier) || data.identifier.get(identifier);
      } else {
        const key = TaskDefinition.createTaskIdentifier(identifier, console);
        return key !== void 0 ? data.taskIdentifier.get(key._key) : void 0;
      }
    }
    return {
      resolve: async (uri, identifier) => {
        if (!identifier) {
          return void 0;
        }
        if (resolverData === void 0 && grouped === void 0) {
          return await quickResolve(this, uri, identifier) ?? fullResolve(this, uri, identifier);
        } else {
          return fullResolve(this, uri, identifier);
        }
      }
    };
  }
  async _saveBeforeRun() {
    let SaveBeforeRunConfigOptions;
    ((SaveBeforeRunConfigOptions2) => {
      SaveBeforeRunConfigOptions2["Always"] = "always";
      SaveBeforeRunConfigOptions2["Never"] = "never";
      SaveBeforeRunConfigOptions2["Prompt"] = "prompt";
    })(SaveBeforeRunConfigOptions || (SaveBeforeRunConfigOptions = {}));
    const saveBeforeRunTaskConfig = this._configurationService.getValue(TaskSettingId.SaveBeforeRun);
    if (saveBeforeRunTaskConfig === "never" /* Never */) {
      return false;
    } else if (saveBeforeRunTaskConfig === "prompt" /* Prompt */ && this._editorService.editors.some((e) => e.isDirty())) {
      const { confirmed } = await this._dialogService.confirm({
        message: nls.localize("TaskSystem.saveBeforeRun.prompt.title", "Save all editors?"),
        detail: nls.localize("detail", "Do you want to save all editors before running the task?"),
        primaryButton: nls.localize({ key: "saveBeforeRun.save", comment: ["&& denotes a mnemonic"] }, "&&Save"),
        cancelButton: nls.localize({ key: "saveBeforeRun.dontSave", comment: ["&& denotes a mnemonic"] }, "Do&&n't Save")
      });
      if (!confirmed) {
        return false;
      }
    }
    await this._editorService.saveAll({ reason: SaveReason.EXPLICIT });
    return true;
  }
  async _executeTask(task, resolver, runSource) {
    let taskToRun = task;
    if (await this._saveBeforeRun()) {
      await this._configurationService.reloadConfiguration();
      await this._updateWorkspaceTasks();
      const taskFolder = task.getWorkspaceFolder();
      const taskIdentifier = task.configurationProperties.identifier;
      const taskType = CustomTask.is(task) ? task.customizes()?.type : ContributedTask.is(task) ? task.type : void 0;
      taskToRun = (taskFolder && taskIdentifier && runSource === TaskRunSource.User ? await this.getTask(taskFolder, taskIdentifier, false, taskType) : task) ?? task;
    }
    await ProblemMatcherRegistry.onReady();
    const executeResult = runSource === TaskRunSource.Reconnect ? this._getTaskSystem().reconnect(taskToRun, resolver) : this._getTaskSystem().run(taskToRun, resolver);
    if (executeResult) {
      return this._handleExecuteResult(executeResult, runSource);
    }
    return { exitCode: 0 };
  }
  async _handleExecuteResult(executeResult, runSource) {
    if (runSource && executeResult.task._id) {
      this._taskRunSources.set(executeResult.task._id, runSource);
    }
    if (runSource === TaskRunSource.User) {
      await this._setRecentlyUsedTask(executeResult.task);
    }
    if (executeResult.kind === TaskExecuteKind.Active) {
      const active = executeResult.active;
      if (active && active.same && runSource === TaskRunSource.FolderOpen || runSource === TaskRunSource.Reconnect) {
        this._logService.debug("Ignoring task that is already active", executeResult.task);
        return executeResult.promise;
      }
      if (active && active.same) {
        this._handleInstancePolicy(executeResult.task, executeResult.task.runOptions.instancePolicy);
      } else {
        throw new TaskError(Severity.Warning, nls.localize("TaskSystem.active", "There is already a task running. Terminate it first before executing another task."), TaskErrors.RunningTask);
      }
    }
    this._setRecentlyUsedTask(executeResult.task);
    return executeResult.promise;
  }
  _handleInstancePolicy(task, policy) {
    if (!this._taskSystem?.isTaskVisible(task)) {
      this._taskSystem?.revealTask(task);
    }
    switch (policy) {
      case InstancePolicy.terminateNewest:
        this._restart(this._getTaskSystem().getLastInstance(task) ?? task);
        break;
      case InstancePolicy.terminateOldest:
        this._restart(this._getTaskSystem().getFirstInstance(task) ?? task);
        break;
      case InstancePolicy.silent:
        break;
      case InstancePolicy.warn:
        this._notificationService.warn(nls.localize("TaskSystem.InstancePolicy.warn", "The instance limit for this task has been reached."));
        break;
      case InstancePolicy.prompt:
      default: {
        if (this._environmentService.isSessionsWindow) {
          this._logService.warn(`[tasks] InstancePolicy.prompt hit in sessions window for task '${task._label}'
${new Error().stack}`);
        }
        this._showQuickPick(
          this._taskSystem.getActiveTasks().filter((t) => task._id === t._id),
          nls.localize("TaskService.instanceToTerminate", "Select an instance to terminate"),
          {
            label: nls.localize("TaskService.noInstanceRunning", "No instance is currently running"),
            task: void 0
          },
          false,
          true,
          void 0
        ).then((entry) => {
          const task2 = entry ? entry.task : void 0;
          if (task2 === void 0 || task2 === null) {
            return;
          }
          this._restart(task2);
        });
      }
    }
  }
  async _restart(task) {
    if (!this._taskSystem) {
      return;
    }
    const isTaskRunning = await this.getActiveTasks().then((tasks) => tasks.some((t) => t.getMapKey() === task.getMapKey()));
    if (isTaskRunning) {
      const response = await this._taskSystem.terminate(task);
      if (!response.success) {
        this._notificationService.warn(nls.localize("TaskSystem.restartFailed", "Failed to terminate and restart task {0}", Types.isString(task) ? task : task.configurationProperties.name));
        return;
      }
    }
    try {
      const updatedTask = await this._findUpdatedTask(task);
      if (updatedTask) {
        await this.run(updatedTask);
      } else {
        const success = await this.run(task);
        if (!success || typeof success.exitCode === "number" && success.exitCode !== 0) {
          this._notificationService.warn(nls.localize("TaskSystem.taskNoLongerExists", "Task {0} no longer exists or has been modified. Cannot restart.", task.configurationProperties.name));
        }
      }
    } catch {
    }
  }
  async _findUpdatedTask(originalTask) {
    const mapStringToFolderTasks = await this._updateWorkspaceTasks(TaskRunSource.System);
    for (const [_, folderResult] of mapStringToFolderTasks) {
      if (!folderResult.set?.tasks?.length && !folderResult.configurations?.byIdentifier) {
        continue;
      }
      if (folderResult.set?.tasks) {
        for (const task of folderResult.set.tasks) {
          if (task._id === originalTask._id) {
            return task;
          }
        }
      }
      if (folderResult.configurations?.byIdentifier) {
        for (const [_2, configuringTask] of Object.entries(folderResult.configurations.byIdentifier)) {
          if (configuringTask._id === originalTask._id) {
            return this.tryResolveTask(configuringTask);
          }
        }
      }
    }
    if (ContributedTask.is(originalTask)) {
      const allTasks = await this.tasks({ type: originalTask.type });
      for (const task of allTasks) {
        if (task._id === originalTask._id) {
          return task;
        }
      }
    }
    return void 0;
  }
  async terminate(task) {
    if (!await this._trust()) {
      return { success: true, task: void 0 };
    }
    if (!this._taskSystem) {
      return { success: true, task: void 0 };
    }
    return this._taskSystem.terminate(task);
  }
  _terminateAll() {
    if (!this._taskSystem) {
      return Promise.resolve([]);
    }
    return this._taskSystem.terminateAll();
  }
  _createTerminalTaskSystem() {
    return new TerminalTaskSystem(
      this._terminalService,
      this._terminalGroupService,
      this._outputService,
      this._paneCompositeService,
      this._viewsService,
      this._markerService,
      this._modelService,
      this._configurationResolverService,
      this._contextService,
      this._environmentService,
      AbstractTaskService.OutputChannelId,
      this._fileService,
      this._terminalProfileResolverService,
      this._pathService,
      this._viewDescriptorService,
      this._logService,
      this._notificationService,
      this._contextKeyService,
      this._instantiationService,
      (workspaceFolder) => {
        if (workspaceFolder) {
          return this._getTaskSystemInfo(workspaceFolder.uri.scheme);
        } else if (this._taskSystemInfos.size > 0) {
          const infos = Array.from(this._taskSystemInfos.entries());
          const notFile = infos.filter((info) => info[0] !== Schemas.file);
          if (notFile.length > 0) {
            return notFile[0][1][0];
          }
          return infos[0][1][0];
        } else {
          return void 0;
        }
      },
      async (taskKey) => {
        const taskMap = await this._getGroupedTasks();
        const allTasks = taskMap.all();
        for (const task of allTasks) {
          if (task.getMapKey() === taskKey) {
            return task;
          }
        }
        return void 0;
      }
    );
  }
  _isTaskProviderEnabled(type) {
    const definition = TaskDefinitionRegistry.get(type);
    return !definition || !definition.when || this._contextKeyService.contextMatchesRules(definition.when);
  }
  async _getGroupedTasks(filter, waitToActivate, knownOnlyOrTrusted) {
    await this._waitForAllSupportedExecutions;
    const type = filter?.type;
    const needsRecentTasksMigration = this._needsRecentTasksMigration();
    if (!waitToActivate) {
      await this._activateTaskProviders(filter?.type);
    }
    const validTypes = /* @__PURE__ */ Object.create(null);
    TaskDefinitionRegistry.all().forEach((definition) => validTypes[definition.taskType] = true);
    validTypes["shell"] = true;
    validTypes["process"] = true;
    const contributedTaskSets = await new Promise((resolve) => {
      const result2 = [];
      let counter = 0;
      const done = (value) => {
        if (value) {
          result2.push(value);
        }
        if (--counter === 0) {
          resolve(result2);
        }
      };
      const error = (error2) => {
        try {
          if (!isCancellationError(error2)) {
            if (error2 && Types.isString(error2.message)) {
              this._log(`Error: ${error2.message}
`);
              this._showOutput(void 0, void 0, error2.message);
            } else {
              this._log("Unknown error received while collecting tasks from providers.");
              this._showOutput();
            }
          }
        } finally {
          if (--counter === 0) {
            resolve(result2);
          }
        }
      };
      if (this._isProvideTasksEnabled() && this.schemaVersion === JsonSchemaVersion.V2_0_0 && this._providers.size > 0) {
        let foundAnyProviders = false;
        for (const [handle, provider] of this._providers) {
          const providerType = this._providerTypes.get(handle);
          if (type === void 0 || type === providerType) {
            if (providerType && !this._isTaskProviderEnabled(providerType)) {
              continue;
            }
            foundAnyProviders = true;
            counter++;
            raceTimeout(provider.provideTasks(validTypes).then((taskSet) => {
              for (const task of taskSet.tasks) {
                if (task.type !== this._providerTypes.get(handle)) {
                  this._log(nls.localize("unexpectedTaskType", 'The task provider for "{0}" tasks unexpectedly provided a task of type "{1}".\n', this._providerTypes.get(handle), task.type));
                  if (task.type !== "shell" && task.type !== "process") {
                    this._showOutput();
                  }
                  break;
                }
              }
              return done(taskSet);
            }, error), 5e3, () => {
              done(void 0);
            });
          }
        }
        if (!foundAnyProviders) {
          resolve(result2);
        }
      } else {
        resolve(result2);
      }
    });
    const result = new TaskMap();
    const contributedTasks = new TaskMap();
    for (const set of contributedTaskSets) {
      for (const task of set.tasks) {
        const workspaceFolder = task.getWorkspaceFolder();
        if (workspaceFolder) {
          contributedTasks.add(workspaceFolder, task);
        }
      }
    }
    try {
      let tasks = [];
      if (!knownOnlyOrTrusted || this._workspaceTrustManagementService.isWorkspaceTrusted()) {
        tasks = Array.from(await this.getWorkspaceTasks());
      }
      await Promise.all(this._getCustomTaskPromises(tasks, filter, result, contributedTasks, waitToActivate));
      if (needsRecentTasksMigration) {
        await this._migrateRecentTasks(result.all());
      }
      return result;
    } catch {
      const result2 = new TaskMap();
      for (const set of contributedTaskSets) {
        for (const task of set.tasks) {
          const folder = task.getWorkspaceFolder();
          if (folder) {
            result2.add(folder, task);
          }
        }
      }
      return result2;
    }
  }
  _getCustomTaskPromises(customTasksKeyValuePairs, filter, result, contributedTasks, waitToActivate) {
    return customTasksKeyValuePairs.map(async ([key, folderTasks]) => {
      const contributed = contributedTasks.get(key);
      if (!folderTasks.set) {
        if (contributed) {
          result.add(key, ...contributed);
        }
        return;
      }
      if (this._contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
        result.add(key, ...folderTasks.set.tasks);
      } else {
        const configurations = folderTasks.configurations;
        const legacyTaskConfigurations = folderTasks.set ? this._getLegacyTaskConfigurations(folderTasks.set) : void 0;
        const customTasksToDelete = [];
        if (configurations || legacyTaskConfigurations) {
          const unUsedConfigurations = /* @__PURE__ */ new Set();
          if (configurations) {
            Object.keys(configurations.byIdentifier).forEach((key2) => unUsedConfigurations.add(key2));
          }
          for (const task of contributed) {
            if (!ContributedTask.is(task)) {
              continue;
            }
            if (configurations) {
              const configuringTask = configurations.byIdentifier[task.defines._key];
              if (configuringTask) {
                unUsedConfigurations.delete(task.defines._key);
                result.add(key, TaskConfig.createCustomTask(task, configuringTask));
              } else {
                result.add(key, task);
              }
            } else if (legacyTaskConfigurations) {
              const configuringTask = legacyTaskConfigurations[task.defines._key];
              if (configuringTask) {
                result.add(key, TaskConfig.createCustomTask(task, configuringTask));
                customTasksToDelete.push(configuringTask);
              } else {
                result.add(key, task);
              }
            } else {
              result.add(key, task);
            }
          }
          if (customTasksToDelete.length > 0) {
            const toDelete = customTasksToDelete.reduce((map, task) => {
              map[task._id] = true;
              return map;
            }, /* @__PURE__ */ Object.create(null));
            for (const task of folderTasks.set.tasks) {
              if (toDelete[task._id]) {
                continue;
              }
              result.add(key, task);
            }
          } else {
            result.add(key, ...folderTasks.set.tasks);
          }
          const unUsedConfigurationsAsArray = Array.from(unUsedConfigurations);
          const unUsedConfigurationPromises = unUsedConfigurationsAsArray.map(async (value) => {
            const configuringTask = configurations.byIdentifier[value];
            if (filter?.type && filter.type !== configuringTask.configures.type) {
              return;
            }
            let requiredTaskProviderUnavailable = false;
            for (const [handle, provider] of this._providers) {
              const providerType = this._providerTypes.get(handle);
              if (configuringTask.type === providerType) {
                if (providerType && !this._isTaskProviderEnabled(providerType)) {
                  requiredTaskProviderUnavailable = true;
                  continue;
                }
                try {
                  const resolvedTask = await provider.resolveTask(configuringTask);
                  if (resolvedTask && resolvedTask._id === configuringTask._id) {
                    result.add(key, TaskConfig.createCustomTask(resolvedTask, configuringTask));
                    return;
                  }
                } catch (error) {
                }
              }
            }
            if (requiredTaskProviderUnavailable) {
              this._log(nls.localize(
                "TaskService.providerUnavailable",
                "Warning: {0} tasks are unavailable in the current environment.",
                configuringTask.configures.type
              ));
            } else if (!waitToActivate) {
              this._log(nls.localize(
                "TaskService.noConfiguration",
                "Error: The {0} task detection didn't contribute a task for the following configuration:\n{1}\nThe task will be ignored.",
                configuringTask.configures.type,
                JSON.stringify(configuringTask._source.config.element, void 0, 4)
              ));
            }
          });
          await Promise.all(unUsedConfigurationPromises);
        } else {
          result.add(key, ...folderTasks.set.tasks);
          result.add(key, ...contributed);
        }
      }
    });
  }
  _getLegacyTaskConfigurations(workspaceTasks) {
    let result;
    function getResult() {
      if (result) {
        return result;
      }
      result = /* @__PURE__ */ Object.create(null);
      return result;
    }
    for (const task of workspaceTasks.tasks) {
      if (CustomTask.is(task)) {
        const commandName = task.command && task.command.name;
        if (commandName === "gulp" || commandName === "grunt" || commandName === "jake") {
          const identifier = KeyedTaskIdentifier.create({
            type: commandName,
            task: task.configurationProperties.name
          });
          getResult()[identifier._key] = task;
        }
      }
    }
    return result;
  }
  async getWorkspaceTasks(runSource = TaskRunSource.User) {
    if (!await this._trust()) {
      return /* @__PURE__ */ new Map();
    }
    await raceTimeout(this._waitForAllSupportedExecutions, 2e3, () => {
      this._logService.warn("Timed out waiting for all supported executions");
    });
    await this._whenTaskSystemReady;
    if (this._workspaceTasksPromise) {
      return this._workspaceTasksPromise;
    }
    return this._updateWorkspaceTasks(runSource);
  }
  getTaskProblems(instanceId) {
    return this._taskSystem?.getTaskProblems(instanceId);
  }
  _updateWorkspaceTasks(runSource = TaskRunSource.User) {
    this._workspaceTasksPromise = this._computeWorkspaceTasks(runSource);
    return this._workspaceTasksPromise;
  }
  async _getAFolder() {
    let folder = this.workspaceFolders.length > 0 ? this.workspaceFolders[0] : void 0;
    if (!folder) {
      const userhome = await this._pathService.userHome();
      folder = new WorkspaceFolder({ uri: userhome, name: resources.basename(userhome), index: 0 });
    }
    return folder;
  }
  getTerminalsForTasks(task) {
    return this._taskSystem?.getTerminalsForTasks(task);
  }
  async _computeWorkspaceTasks(runSource = TaskRunSource.User) {
    const promises = [];
    for (const folder2 of this.workspaceFolders) {
      promises.push(this._computeWorkspaceFolderTasks(folder2, runSource));
    }
    const values = await Promise.all(promises);
    const result = /* @__PURE__ */ new Map();
    for (const value of values) {
      if (value) {
        result.set(value.workspaceFolder.uri.toString(), value);
      }
    }
    const folder = await this._getAFolder();
    if (this._contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
      const workspaceFileTasks = await this._computeWorkspaceFileTasks(folder, runSource);
      if (workspaceFileTasks && this._workspace && this._workspace.configuration) {
        result.set(this._workspace.configuration.toString(), workspaceFileTasks);
      }
    }
    const userTasks = await this._computeUserTasks(folder, runSource);
    if (userTasks) {
      result.set(USER_TASKS_GROUP_KEY, userTasks);
    }
    const hasAnyTasks = Array.from(result.values()).some(
      (folderResult) => folderResult.set?.tasks && folderResult.set.tasks.length > 0 || folderResult.configurations?.byIdentifier && Object.keys(folderResult.configurations.byIdentifier).length > 0
    );
    this._tasksAvailableState.set(hasAnyTasks);
    return result;
  }
  get _jsonTasksSupported() {
    return ShellExecutionSupportedContext.getValue(this._contextKeyService) === true && ProcessExecutionSupportedContext.getValue(this._contextKeyService) === true;
  }
  async _computeWorkspaceFolderTasks(workspaceFolder, runSource = TaskRunSource.User) {
    const workspaceFolderConfiguration = this._executionEngine === ExecutionEngine.Process ? await this._computeLegacyConfiguration(workspaceFolder) : await this._computeConfiguration(workspaceFolder);
    if (!workspaceFolderConfiguration || !workspaceFolderConfiguration.config || workspaceFolderConfiguration.hasErrors) {
      return Promise.resolve({ workspaceFolder, set: void 0, configurations: void 0, hasErrors: workspaceFolderConfiguration ? workspaceFolderConfiguration.hasErrors : false });
    }
    await ProblemMatcherRegistry.onReady();
    const taskSystemInfo = this._getTaskSystemInfo(workspaceFolder.uri.scheme);
    const problemReporter = new ProblemReporter(this._outputChannel);
    const problemReporterListener = problemReporter.onDidError((error) => this._showOutput(runSource, void 0, error));
    const parseResult = TaskConfig.parse(workspaceFolder, void 0, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, workspaceFolderConfiguration.config, problemReporter, TaskConfig.TaskConfigSource.TasksJson, this._contextKeyService);
    problemReporterListener.dispose();
    let hasErrors = false;
    if (!parseResult.validationStatus.isOK() && parseResult.validationStatus.state !== ValidationState.Info) {
      hasErrors = true;
    }
    if (problemReporter.status.isFatal()) {
      problemReporter.fatal(nls.localize("TaskSystem.configurationErrors", "Error: the provided task configuration has validation errors and can't not be used. Please correct the errors first."));
      return { workspaceFolder, set: void 0, configurations: void 0, hasErrors };
    }
    let customizedTasks;
    if (parseResult.configured && parseResult.configured.length > 0) {
      customizedTasks = {
        byIdentifier: /* @__PURE__ */ Object.create(null)
      };
      for (const task of parseResult.configured) {
        customizedTasks.byIdentifier[task.configures._key] = task;
      }
    }
    if (!this._jsonTasksSupported && parseResult.custom.length > 0) {
      this._logService.warn("Custom workspace tasks are not supported.");
    }
    return { workspaceFolder, set: { tasks: this._jsonTasksSupported ? parseResult.custom : [] }, configurations: customizedTasks, hasErrors };
  }
  _testParseExternalConfig(config, location) {
    if (!config) {
      return { config: void 0, hasParseErrors: false };
    }
    const parseErrors = config.$parseErrors;
    if (parseErrors) {
      let isAffected = false;
      for (const parseError of parseErrors) {
        if (/tasks\.json$/.test(parseError)) {
          isAffected = true;
          break;
        }
      }
      if (isAffected) {
        this._log(nls.localize({ key: "TaskSystem.invalidTaskJsonOther", comment: ["Message notifies of an error in one of several places there is tasks related json, not necessarily in a file named tasks.json"] }, "Error: The content of the tasks json in {0} has syntax errors. Please correct them before executing a task.", location));
        this._showOutput(void 0, void 0, nls.localize({ key: "TaskSystem.invalidTaskJsonOther", comment: ["Message notifies of an error in one of several places there is tasks related json, not necessarily in a file named tasks.json"] }, "Error: The content of the tasks json in {0} has syntax errors. Please correct them before executing a task.", location));
        return { config, hasParseErrors: true };
      }
    }
    return { config, hasParseErrors: false };
  }
  _log(value, verbose) {
    if (!verbose || this._configurationService.getValue(TaskSettingId.VerboseLogging)) {
      this._outputChannel.append(value + "\n");
    }
  }
  async _computeWorkspaceFileTasks(workspaceFolder, runSource = TaskRunSource.User) {
    if (this._executionEngine === ExecutionEngine.Process) {
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    const workspaceFileConfig = this._getConfiguration(workspaceFolder, TaskSourceKind.WorkspaceFile);
    const configuration = this._testParseExternalConfig(workspaceFileConfig.config, nls.localize("TasksSystem.locationWorkspaceConfig", "workspace file"));
    const customizedTasks = {
      byIdentifier: /* @__PURE__ */ Object.create(null)
    };
    const custom = [];
    await this._computeTasksForSingleConfig(workspaceFolder, configuration.config, runSource, custom, customizedTasks.byIdentifier, TaskConfig.TaskConfigSource.WorkspaceFile);
    const engine = configuration.config ? TaskConfig.ExecutionEngine.from(configuration.config) : ExecutionEngine.Terminal;
    if (engine === ExecutionEngine.Process) {
      this._notificationService.warn(nls.localize("TaskSystem.versionWorkspaceFile", "Only tasks version 2.0.0 permitted in workspace configuration files."));
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    return { workspaceFolder, set: { tasks: custom }, configurations: customizedTasks, hasErrors: configuration.hasParseErrors };
  }
  async _computeUserTasks(workspaceFolder, runSource = TaskRunSource.User) {
    if (this._executionEngine === ExecutionEngine.Process) {
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    const userTasksConfig = this._getConfiguration(workspaceFolder, TaskSourceKind.User);
    const configuration = this._testParseExternalConfig(userTasksConfig.config, nls.localize("TasksSystem.locationUserConfig", "user settings"));
    const customizedTasks = {
      byIdentifier: /* @__PURE__ */ Object.create(null)
    };
    const custom = [];
    await this._computeTasksForSingleConfig(workspaceFolder, configuration.config, runSource, custom, customizedTasks.byIdentifier, TaskConfig.TaskConfigSource.User);
    const engine = configuration.config ? TaskConfig.ExecutionEngine.from(configuration.config) : ExecutionEngine.Terminal;
    if (engine === ExecutionEngine.Process) {
      this._notificationService.warn(nls.localize("TaskSystem.versionSettings", "Only tasks version 2.0.0 permitted in user settings."));
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    return { workspaceFolder, set: { tasks: custom }, configurations: customizedTasks, hasErrors: configuration.hasParseErrors };
  }
  _emptyWorkspaceTaskResults(workspaceFolder) {
    return { workspaceFolder, set: void 0, configurations: void 0, hasErrors: false };
  }
  async _computeTasksForSingleConfig(workspaceFolder, config, runSource, custom, customized, source, isRecentTask = false) {
    if (!config) {
      return false;
    } else if (!workspaceFolder) {
      this._logService.trace("TaskService.computeTasksForSingleConfig: no workspace folder for worskspace", this._workspace?.id);
      return false;
    }
    const taskSystemInfo = this._getTaskSystemInfo(workspaceFolder.uri.scheme);
    const problemReporter = new ProblemReporter(this._outputChannel);
    const parseResult = TaskConfig.parse(workspaceFolder, this._workspace, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, config, problemReporter, source, this._contextKeyService, isRecentTask);
    let hasErrors = false;
    if (!parseResult.validationStatus.isOK() && parseResult.validationStatus.state !== ValidationState.Info) {
      this._showOutput(runSource);
      hasErrors = true;
    }
    if (problemReporter.status.isFatal()) {
      problemReporter.fatal(nls.localize("TaskSystem.configurationErrors", "Error: the provided task configuration has validation errors and can't not be used. Please correct the errors first."));
      return hasErrors;
    }
    if (parseResult.configured && parseResult.configured.length > 0) {
      for (const task of parseResult.configured) {
        customized[task.configures._key] = task;
      }
    }
    if (!this._jsonTasksSupported && parseResult.custom.length > 0) {
      this._logService.warn("Custom workspace tasks are not supported.");
    } else {
      for (const task of parseResult.custom) {
        custom.push(task);
      }
    }
    return hasErrors;
  }
  _computeConfiguration(workspaceFolder) {
    const { config, hasParseErrors } = this._getConfiguration(workspaceFolder);
    return Promise.resolve({ workspaceFolder, config, hasErrors: hasParseErrors });
  }
  _computeWorkspaceFolderSetup() {
    const workspaceFolders = [];
    const ignoredWorkspaceFolders = [];
    let executionEngine = ExecutionEngine.Terminal;
    let schemaVersion = JsonSchemaVersion.V2_0_0;
    let workspace;
    if (this._contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceFolder = this._contextService.getWorkspace().folders[0];
      workspaceFolders.push(workspaceFolder);
      executionEngine = this._computeExecutionEngine(workspaceFolder);
      schemaVersion = this._computeJsonSchemaVersion(workspaceFolder);
    } else if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      workspace = this._contextService.getWorkspace();
      for (const workspaceFolder of this._contextService.getWorkspace().folders) {
        if (schemaVersion === this._computeJsonSchemaVersion(workspaceFolder)) {
          workspaceFolders.push(workspaceFolder);
        } else {
          ignoredWorkspaceFolders.push(workspaceFolder);
          this._log(nls.localize(
            "taskService.ignoringFolder",
            "Ignoring task configurations for workspace folder {0}. Multi folder workspace task support requires that all folders use task version 2.0.0",
            workspaceFolder.uri.fsPath
          ));
        }
      }
    }
    return [workspaceFolders, ignoredWorkspaceFolders, executionEngine, schemaVersion, workspace];
  }
  _computeExecutionEngine(workspaceFolder) {
    const { config } = this._getConfiguration(workspaceFolder);
    if (!config) {
      return ExecutionEngine._default;
    }
    return TaskConfig.ExecutionEngine.from(config);
  }
  _computeJsonSchemaVersion(workspaceFolder) {
    const { config } = this._getConfiguration(workspaceFolder);
    if (!config) {
      return JsonSchemaVersion.V2_0_0;
    }
    return TaskConfig.JsonSchemaVersion.from(config);
  }
  _getConfiguration(workspaceFolder, source) {
    let result;
    if (source !== TaskSourceKind.User && this._contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      result = void 0;
    } else {
      const wholeConfig = this._configurationService.inspect("tasks", { resource: workspaceFolder.uri });
      switch (source) {
        case TaskSourceKind.User: {
          if (wholeConfig.userValue !== wholeConfig.workspaceFolderValue) {
            result = Objects.deepClone(wholeConfig.userValue);
          }
          break;
        }
        case TaskSourceKind.Workspace:
          result = Objects.deepClone(wholeConfig.workspaceFolderValue);
          break;
        case TaskSourceKind.WorkspaceFile: {
          if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && wholeConfig.workspaceFolderValue !== wholeConfig.workspaceValue) {
            result = Objects.deepClone(wholeConfig.workspaceValue);
          }
          break;
        }
        default:
          result = Objects.deepClone(wholeConfig.workspaceFolderValue);
      }
    }
    if (!result) {
      return { config: void 0, hasParseErrors: false };
    }
    const parseErrors = result.$parseErrors;
    if (parseErrors) {
      let isAffected = false;
      for (const parseError of parseErrors) {
        if (/tasks\.json$/.test(parseError)) {
          isAffected = true;
          break;
        }
      }
      if (isAffected) {
        this._log(nls.localize("TaskSystem.invalidTaskJson", "Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task."));
        this._showOutput(void 0, void 0, nls.localize("TaskSystem.invalidTaskJson", "Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task."));
        return { config: void 0, hasParseErrors: true };
      }
    }
    return { config: result, hasParseErrors: false };
  }
  inTerminal() {
    if (this._taskSystem) {
      return this._taskSystem instanceof TerminalTaskSystem;
    }
    return this._executionEngine === ExecutionEngine.Terminal;
  }
  configureAction() {
    const thisCapture = this;
    return new class extends Action {
      constructor() {
        super(ConfigureTaskAction.ID, ConfigureTaskAction.TEXT.value, void 0, true, () => {
          thisCapture._runConfigureTasks();
          return Promise.resolve(void 0);
        });
      }
    }();
  }
  _handleError(err) {
    let showOutput = true;
    if (err instanceof TaskError) {
      const buildError = err;
      const needsConfig = buildError.code === TaskErrors.NotConfigured || buildError.code === TaskErrors.NoBuildTask || buildError.code === TaskErrors.NoTestTask;
      const needsTerminate = buildError.code === TaskErrors.RunningTask;
      if (needsConfig || needsTerminate) {
        this._notificationService.prompt(buildError.severity, buildError.message, [{
          label: needsConfig ? ConfigureTaskAction.TEXT.value : nls.localize("TerminateAction.label", "Terminate Task"),
          run: () => {
            if (needsConfig) {
              this._runConfigureTasks();
            } else {
              this._runTerminateCommand();
            }
          }
        }]);
      } else {
        this._notificationService.notify({ severity: buildError.severity, message: buildError.message });
      }
    } else if (err instanceof Error) {
      const error = err;
      this._notificationService.error(error.message);
      showOutput = false;
    } else if (Types.isString(err)) {
      this._notificationService.error(err);
    } else {
      this._notificationService.error(nls.localize("TaskSystem.unknownError", "An error has occurred while running a task. See task log for details."));
    }
    if (showOutput) {
      this._showOutput(void 0, void 0, Types.isString(err) ? err : void 0);
    }
  }
  _showDetail() {
    return this._configurationService.getValue(QUICKOPEN_DETAIL_CONFIG);
  }
  async _createTaskQuickPickEntries(tasks, group = false, sort = false, selectedEntry, includeRecents = true) {
    let encounteredTasks = {};
    if (tasks === void 0 || tasks === null || tasks.length === 0) {
      return [];
    }
    const TaskQuickPickEntry = (task) => {
      const newEntry = { label: task._label, description: this.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
      if (encounteredTasks[task._id]) {
        if (encounteredTasks[task._id].length === 1) {
          encounteredTasks[task._id][0].label += " (1)";
        }
        newEntry.label = newEntry.label + " (" + (encounteredTasks[task._id].length + 1).toString() + ")";
      } else {
        encounteredTasks[task._id] = [];
      }
      encounteredTasks[task._id].push(newEntry);
      return newEntry;
    };
    function fillEntries(entries2, tasks2, groupLabel) {
      if (tasks2.length) {
        entries2.push({ type: "separator", label: groupLabel });
      }
      for (const task of tasks2) {
        const entry = TaskQuickPickEntry(task);
        entry.buttons = [{ iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize("configureTask", "Configure Task") }];
        if (selectedEntry && task === selectedEntry.task) {
          entries2.unshift(selectedEntry);
        } else {
          entries2.push(entry);
        }
      }
    }
    let entries;
    if (group) {
      entries = [];
      if (tasks.length === 1) {
        entries.push(TaskQuickPickEntry(tasks[0]));
      } else {
        const recentlyUsedTasks = await this.getSavedTasks("historical");
        const recent = [];
        const recentSet = /* @__PURE__ */ new Set();
        let configured = [];
        let detected = [];
        const taskMap = /* @__PURE__ */ Object.create(null);
        tasks.forEach((task) => {
          const key = task.getCommonTaskId();
          if (key) {
            taskMap[key] = task;
          }
        });
        recentlyUsedTasks.reverse().forEach((recentTask) => {
          const key = recentTask.getCommonTaskId();
          if (key) {
            recentSet.add(key);
            const task = taskMap[key];
            if (task) {
              recent.push(task);
            }
          }
        });
        for (const task of tasks) {
          const key = task.getCommonTaskId();
          if (!key || !recentSet.has(key)) {
            if (task._source.kind === TaskSourceKind.Workspace || task._source.kind === TaskSourceKind.User) {
              configured.push(task);
            } else {
              detected.push(task);
            }
          }
        }
        const sorter = this.createSorter();
        if (includeRecents) {
          fillEntries(entries, recent, nls.localize("recentlyUsed", "recently used tasks"));
        }
        configured = configured.sort((a, b) => sorter.compare(a, b));
        fillEntries(entries, configured, nls.localize("configured", "configured tasks"));
        detected = detected.sort((a, b) => sorter.compare(a, b));
        fillEntries(entries, detected, nls.localize("detected", "detected tasks"));
      }
    } else {
      if (sort) {
        const sorter = this.createSorter();
        tasks = tasks.sort((a, b) => sorter.compare(a, b));
      }
      entries = tasks.map((task) => TaskQuickPickEntry(task));
    }
    encounteredTasks = {};
    return entries;
  }
  async _showTwoLevelQuickPick(placeHolder, defaultEntry, type, name) {
    const taskQuickPick = this._instantiationService.createInstance(TaskQuickPick);
    try {
      return await taskQuickPick.show(placeHolder, defaultEntry, type, name);
    } finally {
      taskQuickPick.dispose();
    }
  }
  async _showQuickPick(tasks, placeHolder, defaultEntry, group = false, sort = false, selectedEntry, additionalEntries, name) {
    const resolvedTasks = await tasks;
    const entries = await raceTimeout(this._createTaskQuickPickEntries(resolvedTasks, group, sort, selectedEntry), 200, () => void 0);
    if (!entries) {
      return void 0;
    }
    if (entries.length === 1 && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
      return entries[0];
    } else if (entries.length === 0 && defaultEntry) {
      entries.push(defaultEntry);
    } else if (entries.length > 1 && additionalEntries && additionalEntries.length > 0) {
      entries.push({ type: "separator", label: "" });
      entries.push(additionalEntries[0]);
    }
    return this._quickInputService.pick(
      entries,
      {
        value: name,
        placeHolder,
        matchOnDescription: true,
        onDidTriggerItemButton: (context) => {
          const task = context.item.task;
          this._quickInputService.cancel();
          if (ContributedTask.is(task)) {
            this.customize(task, void 0, true);
          } else if (CustomTask.is(task)) {
            this.openConfig(task);
          }
        }
      }
    );
  }
  _needsRecentTasksMigration() {
    return this.getRecentlyUsedTasksV1().size > 0 && this._getTasksFromStorage("historical").size === 0;
  }
  async _migrateRecentTasks(tasks) {
    if (!this._needsRecentTasksMigration()) {
      return;
    }
    const recentlyUsedTasks = this.getRecentlyUsedTasksV1();
    const taskMap = /* @__PURE__ */ Object.create(null);
    tasks.forEach((task) => {
      const key = task.getKey();
      if (key) {
        taskMap[key] = task;
      }
    });
    const reversed = [...recentlyUsedTasks.keys()].reverse();
    for (const key in reversed) {
      const task = taskMap[key];
      if (task) {
        await this._setRecentlyUsedTask(task);
      }
    }
    this._storageService.remove(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
  }
  _showIgnoredFoldersMessage() {
    if (this.ignoredWorkspaceFolders.length === 0 || !this.showIgnoreMessage) {
      return Promise.resolve(void 0);
    }
    this._notificationService.prompt(
      Severity.Info,
      nls.localize("TaskService.ignoredFolder", "The following workspace folders are ignored since they use task version 0.1.0: {0}", this.ignoredWorkspaceFolders.map((f) => f.name).join(", ")),
      [{
        label: nls.localize("TaskService.notAgain", "Don't Show Again"),
        isSecondary: true,
        run: () => {
          this._storageService.store(AbstractTaskService.IgnoreTask010DonotShowAgain_key, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
          this._showIgnoreMessage = false;
        }
      }]
    );
    return Promise.resolve(void 0);
  }
  async _trust() {
    const context = this._contextKeyService.getContext(getActiveElement());
    if (ServerlessWebContext.getValue(this._contextKeyService) && !TaskExecutionSupportedContext?.evaluate(context)) {
      return false;
    }
    await this._workspaceTrustManagementService.workspaceTrustInitialized;
    if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      return await this._workspaceTrustRequestService.requestWorkspaceTrust(
        {
          message: nls.localize("TaskService.requestTrust", "Listing and running tasks requires that some of the files in this workspace be executed as code.")
        }
      ) === true;
    }
    return true;
  }
  async _runTaskCommand(filter) {
    if (!this._tasksReconnected) {
      return;
    }
    if (!filter) {
      return this._doRunTaskCommand();
    }
    const type = typeof filter === "string" ? void 0 : filter.type;
    const taskName = typeof filter === "string" ? filter : filter.task;
    const grouped = await this._getGroupedTasks({ type });
    const identifier = this._getTaskIdentifier(filter);
    const tasks = grouped.all();
    const resolver = this._createResolver(grouped);
    const folderURIs = this._contextService.getWorkspace().folders.map((folder) => folder.uri);
    if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      folderURIs.push(this._contextService.getWorkspace().configuration);
    }
    folderURIs.push(USER_TASKS_GROUP_KEY);
    if (identifier) {
      for (const uri of folderURIs) {
        const task = await resolver.resolve(uri, identifier);
        if (task) {
          this.run(task);
          return;
        }
      }
    }
    const exactMatchTask = !taskName ? void 0 : tasks.find((t) => t.configurationProperties.identifier === taskName);
    if (!exactMatchTask) {
      return this._doRunTaskCommand(tasks, type, taskName);
    }
    for (const uri of folderURIs) {
      const task = await resolver.resolve(uri, taskName);
      if (task) {
        await this.run(task, { attachProblemMatcher: true }, TaskRunSource.User);
        return;
      }
    }
  }
  _tasksAndGroupedTasks(filter) {
    if (!this._versionAndEngineCompatible(filter)) {
      return { tasks: Promise.resolve([]), grouped: Promise.resolve(new TaskMap()) };
    }
    const grouped = this._getGroupedTasks(filter);
    const tasks = grouped.then((map) => {
      if (!filter || !filter.type) {
        return map.all();
      }
      const result = [];
      map.forEach((tasks2) => {
        for (const task of tasks2) {
          if (ContributedTask.is(task) && task.defines.type === filter.type) {
            result.push(task);
          } else if (CustomTask.is(task)) {
            if (task.type === filter.type) {
              result.push(task);
            } else {
              const customizes = task.customizes();
              if (customizes && customizes.type === filter.type) {
                result.push(task);
              }
            }
          }
        }
      });
      return result;
    });
    return { tasks, grouped };
  }
  _doRunTaskCommand(tasks, type, name) {
    const pickThen = (task) => {
      if (task === void 0) {
        return;
      }
      if (task === null) {
        this._runConfigureTasks();
      } else {
        this.run(task, { attachProblemMatcher: true }, TaskRunSource.User).then(void 0, (reason) => {
        });
      }
    };
    const placeholder = nls.localize("TaskService.pickRunTask", "Select the task to run");
    this._showIgnoredFoldersMessage().then(() => {
      if (this._configurationService.getValue(USE_SLOW_PICKER)) {
        let taskResult = void 0;
        if (!tasks) {
          taskResult = this._tasksAndGroupedTasks();
        }
        this._showQuickPick(
          tasks ? tasks : taskResult.tasks,
          placeholder,
          {
            label: "$(plus) " + nls.localize("TaskService.noEntryToRun", "Configure a Task"),
            task: null
          },
          true,
          void 0,
          void 0,
          void 0,
          name
        ).then((entry) => {
          return pickThen(entry ? entry.task : void 0);
        });
      } else {
        this._showTwoLevelQuickPick(
          placeholder,
          {
            label: "$(plus) " + nls.localize("TaskService.noEntryToRun", "Configure a Task"),
            task: null
          },
          type,
          name
        ).then(pickThen);
      }
    });
  }
  async rerun(terminalInstanceId) {
    const task = await this._taskSystem?.getTaskForTerminal(terminalInstanceId);
    if (task) {
      this._restart(task);
    } else {
      this._reRunTaskCommand(true);
    }
  }
  _reRunTaskCommand(onlyRerun) {
    ProblemMatcherRegistry.onReady().then(() => {
      return this._editorService.saveAll({ reason: SaveReason.EXPLICIT }).then(() => {
        const executeResult = this._getTaskSystem().rerun();
        if (executeResult) {
          return this._handleExecuteResult(executeResult);
        } else {
          if (!onlyRerun && !this._taskRunningState.get()) {
            this._doRunTaskCommand();
          }
          return Promise.resolve(void 0);
        }
      });
    });
  }
  /**
   *
   * @param tasks - The tasks which need to be filtered
   * @param tasksInList - This tells splitPerGroupType to filter out globbed tasks (into defaults)
   * @returns
   */
  _getDefaultTasks(tasks, taskGlobsInList = false) {
    const defaults = [];
    for (const task of tasks.filter((t) => !!t.configurationProperties.group)) {
      if (taskGlobsInList && typeof task.configurationProperties.group.isDefault === "string") {
        defaults.push(task);
      } else if (!taskGlobsInList && task.configurationProperties.group.isDefault === true) {
        defaults.push(task);
      }
    }
    return defaults;
  }
  _runTaskGroupCommand(taskGroup, strings, configure, legacyCommand) {
    if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
      legacyCommand();
      return;
    }
    const options = {
      location: ProgressLocation.Window,
      title: strings.fetching
    };
    const promise = (async () => {
      async function runSingleTask(task, problemMatcherOptions, that) {
        that.run(task, problemMatcherOptions, TaskRunSource.User).then(void 0, (reason) => {
        });
      }
      const chooseAndRunTask = (tasks) => {
        this._showIgnoredFoldersMessage().then(() => {
          this._showQuickPick(
            tasks,
            strings.select,
            {
              label: strings.notFoundConfigure,
              task: null
            },
            true
          ).then((entry) => {
            const task = entry ? entry.task : void 0;
            if (task === void 0) {
              return;
            }
            if (task === null) {
              configure.apply(this);
              return;
            }
            runSingleTask(task, { attachProblemMatcher: true }, this);
          });
        });
      };
      let groupTasks = [];
      const { globGroupTasks, globTasksDetected } = await this._getGlobTasks(taskGroup._id);
      groupTasks = [...globGroupTasks];
      if (!globTasksDetected && groupTasks.length === 0) {
        groupTasks = await this._findWorkspaceTasksInGroup(taskGroup, true);
      }
      const handleMultipleTasks = (areGlobTasks) => {
        return this._getTasksForGroup(taskGroup).then((tasks) => {
          if (tasks.length > 0) {
            const defaults = this._getDefaultTasks(tasks, areGlobTasks);
            if (defaults.length === 1) {
              runSingleTask(defaults[0], void 0, this);
              return;
            } else if (defaults.length > 0) {
              tasks = defaults;
            }
          }
          chooseAndRunTask(tasks);
        });
      };
      const resolveTaskAndRun = (taskGroupTask) => {
        if (ConfiguringTask.is(taskGroupTask)) {
          this.tryResolveTask(taskGroupTask).then((resolvedTask) => {
            runSingleTask(resolvedTask, void 0, this);
          });
        } else {
          runSingleTask(taskGroupTask, void 0, this);
        }
      };
      if (groupTasks.length === 1) {
        return resolveTaskAndRun(groupTasks[0]);
      }
      if (globTasksDetected && groupTasks.length > 1) {
        return handleMultipleTasks(true);
      }
      if (!groupTasks.length) {
        groupTasks = await this._findWorkspaceTasksInGroup(taskGroup, true);
      }
      if (groupTasks.length === 1) {
        return resolveTaskAndRun(groupTasks[0]);
      }
      return handleMultipleTasks(false);
    })();
    this._progressService.withProgress(options, () => promise);
  }
  async _getGlobTasks(taskGroupId) {
    let globTasksDetected = false;
    const absoluteURI = EditorResourceAccessor.getOriginalUri(this._editorService.activeEditor);
    if (absoluteURI) {
      const workspaceFolder = this._contextService.getWorkspaceFolder(absoluteURI);
      if (workspaceFolder) {
        const configuredTasks = this._getConfiguration(workspaceFolder)?.config?.tasks;
        if (configuredTasks) {
          globTasksDetected = configuredTasks.filter((task) => task.group && typeof task.group !== "string" && typeof task.group.isDefault === "string").length > 0;
          if (globTasksDetected) {
            const relativePath = workspaceFolder?.uri ? resources.relativePath(workspaceFolder.uri, absoluteURI) ?? absoluteURI.path : absoluteURI.path;
            const globGroupTasks = await this._findWorkspaceTasks((task) => {
              const currentTaskGroup = task.configurationProperties.group;
              if (currentTaskGroup && typeof currentTaskGroup !== "string" && typeof currentTaskGroup.isDefault === "string") {
                return currentTaskGroup._id === taskGroupId && glob.match(currentTaskGroup.isDefault, relativePath, { ignoreCase: true });
              }
              globTasksDetected = false;
              return false;
            });
            return { globGroupTasks, globTasksDetected };
          }
        }
      }
    }
    return { globGroupTasks: [], globTasksDetected };
  }
  _runBuildCommand() {
    if (!this._tasksReconnected) {
      return;
    }
    return this._runTaskGroupCommand(TaskGroup.Build, {
      fetching: nls.localize("TaskService.fetchingBuildTasks", "Fetching build tasks..."),
      select: nls.localize("TaskService.pickBuildTask", "Select the build task to run"),
      notFoundConfigure: nls.localize("TaskService.noBuildTask", "No build task to run found. Configure Build Task...")
    }, this._runConfigureDefaultBuildTask, this._build);
  }
  _runTestCommand() {
    return this._runTaskGroupCommand(TaskGroup.Test, {
      fetching: nls.localize("TaskService.fetchingTestTasks", "Fetching test tasks..."),
      select: nls.localize("TaskService.pickTestTask", "Select the test task to run"),
      notFoundConfigure: nls.localize("TaskService.noTestTaskTerminal", "No test task to run found. Configure Tasks...")
    }, this._runConfigureDefaultTestTask, this._runTest);
  }
  _runTerminateCommand(arg) {
    if (arg === "terminateAll") {
      this._terminateAll();
      return;
    }
    const runQuickPick = (promise) => {
      this._showQuickPick(
        promise || this.getActiveTasks(),
        nls.localize("TaskService.taskToTerminate", "Select a task to terminate"),
        {
          label: nls.localize("TaskService.noTaskRunning", "No task is currently running"),
          task: void 0
        },
        false,
        true,
        void 0,
        [{
          label: nls.localize("TaskService.terminateAllRunningTasks", "All Running Tasks"),
          id: "terminateAll",
          task: void 0
        }]
      ).then((entry) => {
        if (entry && entry.id === "terminateAll") {
          this._terminateAll();
        }
        const task = entry ? entry.task : void 0;
        if (task === void 0 || task === null) {
          return;
        }
        this.terminate(task);
      });
    };
    if (this.inTerminal()) {
      const identifier = this._getTaskIdentifier(arg);
      let promise;
      if (identifier !== void 0) {
        promise = this.getActiveTasks();
        promise.then((tasks) => {
          for (const task of tasks) {
            if (task.matches(identifier)) {
              this.terminate(task);
              return;
            }
          }
          runQuickPick(promise);
        });
      } else {
        runQuickPick();
      }
    } else {
      this._isActive().then((active) => {
        if (active) {
          this._terminateAll().then((responses) => {
            const response = responses[0];
            if (response.success) {
              return;
            }
            if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
              this._notificationService.error(nls.localize("TerminateAction.noProcess", "The launched process doesn't exist anymore. If the task spawned background tasks exiting VS Code might result in orphaned processes."));
            } else {
              this._notificationService.error(nls.localize("TerminateAction.failed", "Failed to terminate running task"));
            }
          });
        }
      });
    }
  }
  async _runRestartTaskCommand(arg) {
    const activeTasks = await this.getActiveTasks();
    if (activeTasks.length === 1) {
      this._restart(activeTasks[0]);
      return;
    }
    if (this.inTerminal()) {
      const identifier = this._getTaskIdentifier(arg);
      if (identifier !== void 0) {
        for (const task of activeTasks) {
          if (task.matches(identifier)) {
            this._restart(task);
            return;
          }
        }
      }
      const entry = await this._showQuickPick(
        activeTasks,
        nls.localize("TaskService.taskToRestart", "Select the task to restart"),
        {
          label: nls.localize("TaskService.noTaskToRestart", "No task to restart"),
          task: null
        },
        false,
        true
      );
      if (entry && entry.task) {
        this._restart(entry.task);
      }
    } else {
      if (activeTasks.length > 0) {
        this._restart(activeTasks[0]);
      }
    }
  }
  async _runRerunAllRunningTasksCommand() {
    const activeTasks = await this.getActiveTasks();
    if (activeTasks.length === 0) {
      this._notificationService.info(nls.localize("TaskService.noRunningTasks", "No running tasks to restart"));
      return;
    }
    const restartPromises = activeTasks.map((task) => this._restart(task));
    await Promise.allSettled(restartPromises);
  }
  _getTaskIdentifier(filter) {
    let result = void 0;
    if (Types.isString(filter)) {
      result = filter;
    } else if (filter && Types.isString(filter.type)) {
      result = TaskDefinition.createTaskIdentifier(filter, console);
    }
    return result;
  }
  _configHasTasks(taskConfig) {
    return !!taskConfig && !!taskConfig.tasks && taskConfig.tasks.length > 0;
  }
  _openTaskFile(resource, taskSource) {
    let configFileCreated = false;
    this._fileService.stat(resource).then((stat) => stat, () => void 0).then(async (stat) => {
      const fileExists = !!stat;
      const configValue = this._configurationService.inspect("tasks", { resource });
      let tasksExistInFile;
      let target;
      switch (taskSource) {
        case TaskSourceKind.User:
          tasksExistInFile = this._configHasTasks(configValue.userValue);
          target = ConfigurationTarget.USER;
          break;
        case TaskSourceKind.WorkspaceFile:
          tasksExistInFile = this._configHasTasks(configValue.workspaceValue);
          target = ConfigurationTarget.WORKSPACE;
          break;
        default:
          tasksExistInFile = this._configHasTasks(configValue.workspaceFolderValue);
          target = ConfigurationTarget.WORKSPACE_FOLDER;
      }
      let content;
      if (!tasksExistInFile) {
        const pickTemplateResult = await this._quickInputService.pick(getTaskTemplates(), { placeHolder: nls.localize("TaskService.template", "Select a Task Template") });
        if (!pickTemplateResult) {
          return Promise.resolve(void 0);
        }
        content = pickTemplateResult.content;
        const editorConfig = this._configurationService.getValue();
        if (editorConfig.editor.insertSpaces) {
          content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + " ".repeat(s2.length * editorConfig.editor.tabSize));
        }
        configFileCreated = true;
      }
      if (!fileExists && content) {
        return this._textFileService.create([{ resource, value: content }]).then((result) => {
          return result[0].resource;
        });
      } else if (fileExists && (tasksExistInFile || content)) {
        const statResource = stat?.resource;
        if (content && statResource) {
          this._configurationService.updateValue("tasks", json.parse(content), { resource: statResource }, target);
        }
        return statResource;
      }
      return void 0;
    }).then((resource2) => {
      if (!resource2) {
        return;
      }
      this._editorService.openEditor({
        resource: resource2,
        options: {
          pinned: configFileCreated
          // pin only if config file is created #8727
        }
      });
    });
  }
  _isTaskEntry(value) {
    const candidate = value;
    return candidate && !!candidate.task;
  }
  _isSettingEntry(value) {
    const candidate = value;
    return candidate && !!candidate.settingType;
  }
  _configureTask(task) {
    if (ContributedTask.is(task)) {
      this.customize(task, void 0, true);
    } else if (CustomTask.is(task)) {
      this.openConfig(task);
    } else if (ConfiguringTask.is(task)) {
    }
  }
  _handleSelection(selection) {
    if (!selection) {
      return;
    }
    if (this._isTaskEntry(selection)) {
      this._configureTask(selection.task);
    } else if (this._isSettingEntry(selection)) {
      const taskQuickPick = this._instantiationService.createInstance(TaskQuickPick);
      taskQuickPick.handleSettingOption(selection.settingType);
    } else if (selection.folder && this._contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
      this._openTaskFile(selection.folder.toResource(".vscode/tasks.json"), TaskSourceKind.Workspace);
    } else {
      const resource = this._getResourceForKind(TaskSourceKind.User);
      if (resource) {
        this._openTaskFile(resource, TaskSourceKind.User);
      }
    }
  }
  getTaskDescription(task) {
    let description;
    if (task._source.kind === TaskSourceKind.User) {
      description = nls.localize("taskQuickPick.userSettings", "User");
    } else if (task._source.kind === TaskSourceKind.WorkspaceFile) {
      description = task.getWorkspaceFileName();
    } else if (this.needsFolderQualification()) {
      const workspaceFolder = task.getWorkspaceFolder();
      if (workspaceFolder) {
        description = workspaceFolder.name;
      }
    }
    return description;
  }
  async _runConfigureTasks() {
    if (!await this._trust()) {
      return;
    }
    let taskPromise;
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      taskPromise = this._getGroupedTasks();
    } else {
      taskPromise = Promise.resolve(new TaskMap());
    }
    const stats = this._contextService.getWorkspace().folders.map((folder) => {
      return this._fileService.stat(folder.toResource(".vscode/tasks.json")).then((stat) => stat, () => void 0);
    });
    const createLabel = nls.localize("TaskService.createJsonFile", "Create tasks.json file from template");
    const openLabel = nls.localize("TaskService.openJsonFile", "Open tasks.json file");
    const tokenSource = new CancellationTokenSource();
    const cancellationToken = tokenSource.token;
    const entries = Promise.all(stats).then((stats2) => {
      return taskPromise.then((taskMap) => {
        const entries2 = [];
        let configuredCount = 0;
        let tasks = taskMap.all();
        if (tasks.length > 0) {
          tasks = tasks.sort((a, b) => a._label.localeCompare(b._label));
          for (const task of tasks) {
            const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task), task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
            TaskQuickPick.applyColorStyles(task, entry, this._themeService);
            entries2.push(entry);
            if (!ContributedTask.is(task)) {
              configuredCount++;
            }
          }
        }
        const needsCreateOrOpen = configuredCount === 0;
        if (needsCreateOrOpen || taskMap.get(USER_TASKS_GROUP_KEY).length === configuredCount) {
          const label = stats2[0] !== void 0 ? openLabel : createLabel;
          if (entries2.length) {
            entries2.push({ type: "separator" });
          }
          entries2.push({ label, folder: this._contextService.getWorkspace().folders[0] });
        }
        if (entries2.length === 1 && !needsCreateOrOpen) {
          tokenSource.cancel();
        }
        return entries2;
      });
    });
    const timeout = await Promise.race([new Promise((resolve) => {
      entries.then(() => resolve(false));
    }), new Promise((resolve) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        resolve(true);
      }, 200);
    })]);
    if (!timeout && (await entries).length === 1 && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
      const entry = (await entries)[0];
      if (entry.task) {
        this._handleSelection(entry);
        return;
      }
    }
    const entriesWithSettings = entries.then((resolvedEntries) => {
      resolvedEntries.push(...TaskQuickPick.allSettingEntries(this._configurationService));
      return resolvedEntries;
    });
    this._quickInputService.pick(
      entriesWithSettings,
      { placeHolder: nls.localize("TaskService.pickTask", "Select a task to configure") },
      cancellationToken
    ).then(async (selection) => {
      if (cancellationToken.isCancellationRequested) {
        const task = (await entries)[0];
        if (task.task) {
          selection = task;
        }
      }
      this._handleSelection(selection);
    });
  }
  _runConfigureDefaultBuildTask() {
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      this.tasks().then(((tasks) => {
        if (tasks.length === 0) {
          this._runConfigureTasks();
          return;
        }
        const entries = [];
        let selectedTask;
        let selectedEntry;
        this._showIgnoredFoldersMessage().then(async () => {
          const { globGroupTasks } = await this._getGlobTasks(TaskGroup.Build._id);
          let defaultTasks = globGroupTasks;
          if (!defaultTasks?.length) {
            defaultTasks = this._getDefaultTasks(tasks, false);
          }
          let defaultBuildTask;
          if (defaultTasks.length === 1) {
            const group = defaultTasks[0].configurationProperties.group;
            if (group) {
              if (typeof group === "string" && group === TaskGroup.Build._id) {
                defaultBuildTask = defaultTasks[0];
              } else {
                defaultBuildTask = defaultTasks[0];
              }
            }
          }
          for (const task of tasks) {
            if (task === defaultBuildTask) {
              const label = nls.localize("TaskService.defaultBuildTaskExists", "{0} is already marked as the default build task", TaskQuickPick.getTaskLabelWithIcon(task, task.getQualifiedLabel()));
              selectedTask = task;
              selectedEntry = { label, task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
              TaskQuickPick.applyColorStyles(task, selectedEntry, this._themeService);
            } else {
              const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task), task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
              TaskQuickPick.applyColorStyles(task, entry, this._themeService);
              entries.push(entry);
            }
          }
          if (selectedEntry) {
            entries.unshift(selectedEntry);
          }
          const tokenSource = new CancellationTokenSource();
          const cancellationToken = tokenSource.token;
          this._quickInputService.pick(
            entries,
            { placeHolder: nls.localize("TaskService.pickTask", "Select a task to configure") },
            cancellationToken
          ).then(async (entry) => {
            if (cancellationToken.isCancellationRequested) {
              const task2 = (await entries)[0];
              if (task2.task) {
                entry = task2;
              }
            }
            const task = entry && Object.hasOwn(entry, "task") ? entry.task : void 0;
            if (task === void 0 || task === null) {
              return;
            }
            if (task === selectedTask && CustomTask.is(task)) {
              this.openConfig(task);
            }
            if (!InMemoryTask.is(task)) {
              this.customize(task, { group: { kind: "build", isDefault: true } }, true).then(() => {
                if (selectedTask && task !== selectedTask && !InMemoryTask.is(selectedTask)) {
                  this.customize(selectedTask, { group: "build" }, false);
                }
              });
            }
          });
          this._quickInputService.pick(entries, {
            placeHolder: nls.localize("TaskService.pickDefaultBuildTask", "Select the task to be used as the default build task")
          }).then((entry) => {
            const task = entry && Object.hasOwn(entry, "task") ? entry.task : void 0;
            if (task === void 0 || task === null) {
              return;
            }
            if (task === selectedTask && CustomTask.is(task)) {
              this.openConfig(task);
            }
            if (!InMemoryTask.is(task)) {
              this.customize(task, { group: { kind: "build", isDefault: true } }, true).then(() => {
                if (selectedTask && task !== selectedTask && !InMemoryTask.is(selectedTask)) {
                  this.customize(selectedTask, { group: "build" }, false);
                }
              });
            }
          });
        });
      }));
    } else {
      this._runConfigureTasks();
    }
  }
  _runConfigureDefaultTestTask() {
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      this.tasks().then(((tasks) => {
        if (tasks.length === 0) {
          this._runConfigureTasks();
          return;
        }
        let selectedTask;
        let selectedEntry;
        for (const task of tasks) {
          const taskGroup = TaskGroup.from(task.configurationProperties.group);
          if (taskGroup && taskGroup.isDefault && taskGroup._id === TaskGroup.Test._id) {
            selectedTask = task;
            break;
          }
        }
        if (selectedTask) {
          selectedEntry = {
            label: nls.localize("TaskService.defaultTestTaskExists", "{0} is already marked as the default test task.", selectedTask.getQualifiedLabel()),
            task: selectedTask,
            detail: this._showDetail() ? selectedTask.configurationProperties.detail : void 0
          };
        }
        this._showIgnoredFoldersMessage().then(() => {
          this._showQuickPick(
            tasks,
            nls.localize("TaskService.pickDefaultTestTask", "Select the task to be used as the default test task"),
            void 0,
            true,
            false,
            selectedEntry
          ).then((entry) => {
            const task = entry && Object.hasOwn(entry, "task") ? entry.task : void 0;
            if (!task) {
              return;
            }
            if (task === selectedTask && CustomTask.is(task)) {
              this.openConfig(task);
            }
            if (!InMemoryTask.is(task)) {
              this.customize(task, { group: { kind: "test", isDefault: true } }, true).then(() => {
                if (selectedTask && task !== selectedTask && !InMemoryTask.is(selectedTask)) {
                  this.customize(selectedTask, { group: "test" }, false);
                }
              });
            }
          });
        });
      }));
    } else {
      this._runConfigureTasks();
    }
  }
  async runShowTasks() {
    const activeTasksPromise = this.getActiveTasks();
    const activeTasks = await activeTasksPromise;
    let group;
    if (activeTasks.length === 1) {
      this._taskSystem.revealTask(activeTasks[0]);
    } else if (activeTasks.length && activeTasks.every((task) => {
      if (InMemoryTask.is(task)) {
        return false;
      }
      if (!group) {
        group = task.command.presentation?.group;
      }
      return task.command.presentation?.group && task.command.presentation.group === group;
    })) {
      this._taskSystem.revealTask(activeTasks[0]);
    } else {
      this._showQuickPick(
        activeTasksPromise,
        nls.localize("TaskService.pickShowTask", "Select the task to show its output"),
        {
          label: nls.localize("TaskService.noTaskIsRunning", "No task is running"),
          task: null
        },
        false,
        true
      ).then((entry) => {
        const task = entry ? entry.task : void 0;
        if (task === void 0 || task === null) {
          return;
        }
        this._taskSystem.revealTask(task);
      });
    }
  }
  async _createTasksDotOld(folder) {
    const tasksFile = folder.toResource(".vscode/tasks.json");
    if (await this._fileService.exists(tasksFile)) {
      const oldFile = tasksFile.with({ path: `${tasksFile.path}.old` });
      await this._fileService.copy(tasksFile, oldFile, true);
      return [oldFile, tasksFile];
    }
    return void 0;
  }
  _upgradeTask(task, suppressTaskName, globalConfig) {
    if (!CustomTask.is(task)) {
      return;
    }
    const configElement = {
      label: task._label
    };
    const oldTaskTypes = /* @__PURE__ */ new Set(["gulp", "jake", "grunt"]);
    if (Types.isString(task.command.name) && oldTaskTypes.has(task.command.name)) {
      configElement.type = task.command.name;
      configElement.task = task.command.args[0];
    } else {
      if (task.command.runtime === RuntimeType.Shell) {
        configElement.type = RuntimeType.toString(RuntimeType.Shell);
      }
      if (task.command.name && !suppressTaskName && !globalConfig.windows?.command && !globalConfig.osx?.command && !globalConfig.linux?.command) {
        configElement.command = task.command.name;
      } else if (suppressTaskName) {
        configElement.command = task._source.config.element.command;
      }
      if (task.command.args && (!Array.isArray(task.command.args) || task.command.args.length > 0)) {
        if (!globalConfig.windows?.args && !globalConfig.osx?.args && !globalConfig.linux?.args) {
          configElement.args = task.command.args;
        } else {
          configElement.args = task._source.config.element.args;
        }
      }
    }
    if (task.configurationProperties.presentation) {
      configElement.presentation = task.configurationProperties.presentation;
    }
    if (task.configurationProperties.isBackground) {
      configElement.isBackground = task.configurationProperties.isBackground;
    }
    if (task.configurationProperties.problemMatchers) {
      configElement.problemMatcher = task._source.config.element.problemMatcher;
    }
    if (task.configurationProperties.group) {
      configElement.group = task.configurationProperties.group;
    }
    task._source.config.element = configElement;
    const tempTask = new CustomTask(task._id, task._source, task._label, task.type, task.command, task.hasDefinedMatchers, task.runOptions, task.configurationProperties);
    const configTask = this._createCustomizableTask(tempTask);
    if (configTask) {
      return configTask;
    }
    return;
  }
  async _upgrade() {
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      return;
    }
    if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      this._register(Event.once(this._workspaceTrustManagementService.onDidChangeTrust)((isTrusted) => {
        if (isTrusted) {
          this._upgrade();
        }
      }));
      return;
    }
    const tasks = await this._getGroupedTasks();
    const fileDiffs = [];
    for (const folder of this.workspaceFolders) {
      const diff = await this._createTasksDotOld(folder);
      if (diff) {
        fileDiffs.push(diff);
      }
      if (!diff) {
        continue;
      }
      const configTasks = [];
      const suppressTaskName = !!this._configurationService.getValue(TasksSchemaProperties.SuppressTaskName, { resource: folder.uri });
      const globalConfig = {
        windows: this._configurationService.getValue(TasksSchemaProperties.Windows, { resource: folder.uri }),
        osx: this._configurationService.getValue(TasksSchemaProperties.Osx, { resource: folder.uri }),
        linux: this._configurationService.getValue(TasksSchemaProperties.Linux, { resource: folder.uri })
      };
      tasks.get(folder).forEach((task) => {
        const configTask = this._upgradeTask(task, suppressTaskName, globalConfig);
        if (configTask) {
          configTasks.push(configTask);
        }
      });
      this._taskSystem = void 0;
      this._workspaceTasksPromise = void 0;
      await this._writeConfiguration(folder, "tasks.tasks", configTasks);
      await this._writeConfiguration(folder, "tasks.version", "2.0.0");
      if (this._configurationService.getValue(TasksSchemaProperties.ShowOutput, { resource: folder.uri })) {
        await this._configurationService.updateValue(TasksSchemaProperties.ShowOutput, void 0, { resource: folder.uri });
      }
      if (this._configurationService.getValue(TasksSchemaProperties.IsShellCommand, { resource: folder.uri })) {
        await this._configurationService.updateValue(TasksSchemaProperties.IsShellCommand, void 0, { resource: folder.uri });
      }
      if (this._configurationService.getValue(TasksSchemaProperties.SuppressTaskName, { resource: folder.uri })) {
        await this._configurationService.updateValue(TasksSchemaProperties.SuppressTaskName, void 0, { resource: folder.uri });
      }
    }
    this._updateSetup();
    this._notificationService.prompt(
      Severity.Warning,
      fileDiffs.length === 1 ? nls.localize("taskService.upgradeVersion", "The deprecated tasks version 0.1.0 has been removed. Your tasks have been upgraded to version 2.0.0. Open the diff to review the upgrade.") : nls.localize("taskService.upgradeVersionPlural", "The deprecated tasks version 0.1.0 has been removed. Your tasks have been upgraded to version 2.0.0. Open the diffs to review the upgrade."),
      [{
        label: fileDiffs.length === 1 ? nls.localize("taskService.openDiff", "Open diff") : nls.localize("taskService.openDiffs", "Open diffs"),
        run: async () => {
          for (const upgrade of fileDiffs) {
            await this._editorService.openEditor({
              original: { resource: upgrade[0] },
              modified: { resource: upgrade[1] }
            });
          }
        }
      }]
    );
  }
};
// private static autoDetectTelemetryName: string = 'taskServer.autoDetect';
AbstractTaskService.RecentlyUsedTasks_Key = "workbench.tasks.recentlyUsedTasks";
AbstractTaskService.RecentlyUsedTasks_KeyV2 = "workbench.tasks.recentlyUsedTasks2";
AbstractTaskService.PersistentTasks_Key = "workbench.tasks.persistentTasks";
AbstractTaskService.IgnoreTask010DonotShowAgain_key = "workbench.tasks.ignoreTask010Shown";
AbstractTaskService.OutputChannelId = "tasks";
AbstractTaskService.OutputChannelLabel = nls.localize("tasks", "Tasks");
AbstractTaskService._nextHandle = 0;
AbstractTaskService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IOutputService),
  __decorateParam(3, IPaneCompositePartService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ITextFileService),
  __decorateParam(11, IModelService),
  __decorateParam(12, IExtensionService),
  __decorateParam(13, IQuickInputService),
  __decorateParam(14, IConfigurationResolverService),
  __decorateParam(15, ITerminalService),
  __decorateParam(16, ITerminalGroupService),
  __decorateParam(17, IStorageService),
  __decorateParam(18, IProgressService),
  __decorateParam(19, IOpenerService),
  __decorateParam(20, IDialogService),
  __decorateParam(21, INotificationService),
  __decorateParam(22, IContextKeyService),
  __decorateParam(23, IWorkbenchEnvironmentService),
  __decorateParam(24, ITerminalProfileResolverService),
  __decorateParam(25, IPathService),
  __decorateParam(26, ITextModelService),
  __decorateParam(27, IPreferencesService),
  __decorateParam(28, IViewDescriptorService),
  __decorateParam(29, IWorkspaceTrustRequestService),
  __decorateParam(30, IWorkspaceTrustManagementService),
  __decorateParam(31, ILogService),
  __decorateParam(32, IThemeService),
  __decorateParam(33, ILifecycleService),
  __decorateParam(34, IRemoteAgentService),
  __decorateParam(35, IInstantiationService),
  __decorateParam(36, IChatService),
  __decorateParam(37, IChatAgentService),
  __decorateParam(38, IHostService)
], AbstractTaskService);
export {
  AbstractTaskService,
  ConfigureTaskAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxicm93c2VyXFxhYnN0cmFjdFRhc2tTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCAqIGFzIGpzb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSwgVG91Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0ICogYXMgT2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFZhbGlkYXRpb25TdGF0ZSwgVmFsaWRhdGlvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhcnNlcnMuanMnO1xuaW1wb3J0ICogYXMgUGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGVybWluYXRlUmVzcG9uc2VDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzc2VzLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIFR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBVVUlEIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NPcHRpb25zLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTmFtZWRQcm9ibGVtTWF0Y2hlciwgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5cbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuXG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5cbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUsIFdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2VycyB9IGZyb20gJy4uLy4uL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuXG5pbXBvcnQgeyBJT3V0cHV0Q2hhbm5lbCwgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5cbmltcG9ydCB7IElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5cbmltcG9ydCB7IENvbW1hbmRTdHJpbmcsIENvbmZpZ3VyaW5nVGFzaywgQ29udHJpYnV0ZWRUYXNrLCBDdXN0b21UYXNrLCBFeGVjdXRpb25FbmdpbmUsIEluTWVtb3J5VGFzaywgSW5zdGFuY2VQb2xpY3ksIElUYXNrQ29uZmlnLCBJVGFza0V2ZW50LCBJVGFza0lkZW50aWZpZXIsIElUYXNrSW5hY3RpdmVFdmVudCwgSVRhc2tQcm9jZXNzRW5kZWRFdmVudCwgSVRhc2tTZXQsIEpzb25TY2hlbWFWZXJzaW9uLCBLZXllZFRhc2tJZGVudGlmaWVyLCBSZXJ1bkFsbFJ1bm5pbmdUYXNrc0NvbW1hbmRJZCwgUnVudGltZVR5cGUsIFRhc2ssIFRBU0tfUlVOTklOR19TVEFURSwgVGFza0RlZmluaXRpb24sIFRhc2tFdmVudEtpbmQsIFRhc2tHcm91cCwgVGFza1J1blNvdXJjZSwgVGFza1NldHRpbmdJZCwgVGFza1NvcnRlciwgVGFza1NvdXJjZUtpbmQsIFRhc2tzU2NoZW1hUHJvcGVydGllcywgVVNFUl9UQVNLU19HUk9VUF9LRVkgfSBmcm9tICcuLi9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDdXN0b21FeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LCBJQ3VzdG9taXphdGlvblByb3BlcnRpZXMsIElQcm9ibGVtTWF0Y2hlclJ1bk9wdGlvbnMsIElUYXNrRmlsdGVyLCBJVGFza1Byb3ZpZGVyLCBJVGFza1NlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0LCBQcm9jZXNzRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCwgU2VydmVybGVzc1dlYkNvbnRleHQsIFNoZWxsRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCwgVGFza0NvbW1hbmRzUmVnaXN0ZXJlZCwgVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsIFRhc2tzQXZhaWxhYmxlQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGFza0V4ZWN1dGVSZXN1bHQsIElUYXNrUmVzb2x2ZXIsIElUYXNrU3VtbWFyeSwgSVRhc2tTeXN0ZW0sIElUYXNrU3lzdGVtSW5mbywgSVRhc2tUZXJtaW5hdGVSZXNwb25zZSwgVGFza0Vycm9yLCBUYXNrRXJyb3JzLCBUYXNrRXhlY3V0ZUtpbmQsIFRyaWdnZXJzLCBWZXJpZmllZFRhc2sgfSBmcm9tICcuLi9jb21tb24vdGFza1N5c3RlbS5qcyc7XG5pbXBvcnQgeyBnZXRUZW1wbGF0ZXMgYXMgZ2V0VGFza1RlbXBsYXRlcyB9IGZyb20gJy4uL2NvbW1vbi90YXNrVGVtcGxhdGVzLmpzJztcblxuaW1wb3J0ICogYXMgVGFza0NvbmZpZyBmcm9tICcuLi9jb21tb24vdGFza0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxUYXNrU3lzdGVtIH0gZnJvbSAnLi90ZXJtaW5hbFRhc2tTeXN0ZW0uanMnO1xuXG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuXG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tEZWZpbml0aW9uUmVnaXN0cnkuanMnO1xuXG5pbXBvcnQgeyBnZXRBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHRvRm9ybWF0dGVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRXhpdFJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IFZpcnR1YWxXb3Jrc3BhY2VDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFNodXRkb3duUmVhc29uLCBTdGFydHVwS2luZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX09QRU5fQUNUSU9OX0lEIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb25maWd1cmVUYXNrSWNvbiwgaXNXb3Jrc3BhY2VGb2xkZXIsIElUYXNrUXVpY2tQaWNrRW50cnksIFFVSUNLT1BFTl9ERVRBSUxfQ09ORklHLCBRVUlDS09QRU5fU0tJUF9DT05GSUcsIFRhc2tRdWlja1BpY2sgfSBmcm9tICcuL3Rhc2tRdWlja1BpY2suanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRm9jdXNNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuXG5jb25zdCBRVUlDS09QRU5fSElTVE9SWV9MSU1JVF9DT05GSUcgPSAndGFzay5xdWlja09wZW4uaGlzdG9yeSc7XG5jb25zdCBQUk9CTEVNX01BVENIRVJfTkVWRVJfQ09ORklHID0gJ3Rhc2sucHJvYmxlbU1hdGNoZXJzLm5ldmVyUHJvbXB0JztcbmNvbnN0IFVTRV9TTE9XX1BJQ0tFUiA9ICd0YXNrLnF1aWNrT3Blbi5zaG93QWxsJztcblxuY29uc3QgVGFza1Rlcm1pbmFsVHlwZSA9ICdUYXNrJztcblxuZXhwb3J0IG5hbWVzcGFjZSBDb25maWd1cmVUYXNrQWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuY29uZmlndXJlVGFza1J1bm5lcic7XG5cdGV4cG9ydCBjb25zdCBURVhUID0gbmxzLmxvY2FsaXplMignQ29uZmlndXJlVGFza1J1bm5lckFjdGlvbi5sYWJlbCcsIFwiQ29uZmlndXJlIFRhc2tcIik7XG59XG5cbmV4cG9ydCB0eXBlIFRhc2tRdWlja1BpY2tFbnRyeVR5cGUgPSAoSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSkgfCAoSVF1aWNrUGlja0l0ZW0gJiB7IGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB9KSB8IChJUXVpY2tQaWNrSXRlbSAmIHsgc2V0dGluZ1R5cGU6IHN0cmluZyB9KTtcblxuY2xhc3MgUHJvYmxlbVJlcG9ydGVyIGltcGxlbWVudHMgVGFza0NvbmZpZy5JUHJvYmxlbVJlcG9ydGVyIHtcblxuXHRwcml2YXRlIF92YWxpZGF0aW9uU3RhdHVzOiBWYWxpZGF0aW9uU3RhdHVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVycm9yOiBFbWl0dGVyPHN0cmluZz4gPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEVycm9yOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRFcnJvci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9vdXRwdXRDaGFubmVsOiBJT3V0cHV0Q2hhbm5lbCkge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMgPSBuZXcgVmFsaWRhdGlvblN0YXR1cygpO1xuXHR9XG5cblx0cHVibGljIGluZm8obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5JbmZvO1xuXHRcdHRoaXMuX291dHB1dENoYW5uZWwuYXBwZW5kKG1lc3NhZ2UgKyAnXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgd2FybihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLldhcm5pbmc7XG5cdFx0dGhpcy5fb3V0cHV0Q2hhbm5lbC5hcHBlbmQobWVzc2FnZSArICdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBlcnJvcihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLkVycm9yO1xuXHRcdHRoaXMuX291dHB1dENoYW5uZWwuYXBwZW5kKG1lc3NhZ2UgKyAnXFxuJyk7XG5cdFx0dGhpcy5fb25EaWRFcnJvci5maXJlKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGZhdGFsKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGUgPSBWYWxpZGF0aW9uU3RhdGUuRmF0YWw7XG5cdFx0dGhpcy5fb3V0cHV0Q2hhbm5lbC5hcHBlbmQobWVzc2FnZSArICdcXG4nKTtcblx0XHR0aGlzLl9vbkRpZEVycm9yLmZpcmUobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN0YXR1cygpOiBWYWxpZGF0aW9uU3RhdHVzIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGlvblN0YXR1cztcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uUmVzdWx0IHtcblx0d29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyO1xuXHRjb25maWc6IFRhc2tDb25maWcuSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQ7XG5cdGhhc0Vycm9yczogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElDb21tYW5kVXBncmFkZSB7XG5cdGNvbW1hbmQ/OiBzdHJpbmc7XG5cdGFyZ3M/OiBzdHJpbmdbXTtcbn1cblxuY2xhc3MgVGFza01hcCB7XG5cdHByaXZhdGUgX3N0b3JlOiBNYXA8c3RyaW5nLCBUYXNrW10+ID0gbmV3IE1hcCgpO1xuXG5cdHB1YmxpYyBmb3JFYWNoKGNhbGxiYWNrOiAodmFsdWU6IFRhc2tbXSwgZm9sZGVyOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZS5mb3JFYWNoKGNhbGxiYWNrKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0S2V5KHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIgfCBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcod29ya3NwYWNlRm9sZGVyKSkge1xuXHRcdFx0a2V5ID0gd29ya3NwYWNlRm9sZGVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB1cmk6IFVSSSB8IG51bGwgfCB1bmRlZmluZWQgPSBpc1dvcmtzcGFjZUZvbGRlcih3b3Jrc3BhY2VGb2xkZXIpID8gd29ya3NwYWNlRm9sZGVyLnVyaSA6IHdvcmtzcGFjZUZvbGRlci5jb25maWd1cmF0aW9uO1xuXHRcdFx0a2V5ID0gdXJpID8gdXJpLnRvU3RyaW5nKCkgOiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIGtleTtcblx0fVxuXG5cdHB1YmxpYyBnZXQod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUZvbGRlciB8IHN0cmluZyk6IFRhc2tbXSB7XG5cdFx0Y29uc3Qga2V5ID0gVGFza01hcC5nZXRLZXkod29ya3NwYWNlRm9sZGVyKTtcblx0XHRsZXQgcmVzdWx0OiBUYXNrW10gfCB1bmRlZmluZWQgPSB0aGlzLl9zdG9yZS5nZXQoa2V5KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVzdWx0ID0gW107XG5cdFx0XHR0aGlzLl9zdG9yZS5zZXQoa2V5LCByZXN1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFkZCh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIHwgc3RyaW5nLCAuLi50YXNrOiBUYXNrW10pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBUYXNrTWFwLmdldEtleSh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGxldCB2YWx1ZXMgPSB0aGlzLl9zdG9yZS5nZXQoa2V5KTtcblx0XHRpZiAoIXZhbHVlcykge1xuXHRcdFx0dmFsdWVzID0gW107XG5cdFx0XHR0aGlzLl9zdG9yZS5zZXQoa2V5LCB2YWx1ZXMpO1xuXHRcdH1cblx0XHR2YWx1ZXMucHVzaCguLi50YXNrKTtcblx0fVxuXG5cdHB1YmxpYyBhbGwoKTogVGFza1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IFRhc2tbXSA9IFtdO1xuXHRcdHRoaXMuX3N0b3JlLmZvckVhY2goKHZhbHVlcykgPT4gcmVzdWx0LnB1c2goLi4udmFsdWVzKSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RUYXNrU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGFza1NlcnZpY2Uge1xuXG5cdC8vIHByaXZhdGUgc3RhdGljIGF1dG9EZXRlY3RUZWxlbWV0cnlOYW1lOiBzdHJpbmcgPSAndGFza1NlcnZlci5hdXRvRGV0ZWN0Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUmVjZW50bHlVc2VkVGFza3NfS2V5ID0gJ3dvcmtiZW5jaC50YXNrcy5yZWNlbnRseVVzZWRUYXNrcyc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJlY2VudGx5VXNlZFRhc2tzX0tleVYyID0gJ3dvcmtiZW5jaC50YXNrcy5yZWNlbnRseVVzZWRUYXNrczInO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQZXJzaXN0ZW50VGFza3NfS2V5ID0gJ3dvcmtiZW5jaC50YXNrcy5wZXJzaXN0ZW50VGFza3MnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJZ25vcmVUYXNrMDEwRG9ub3RTaG93QWdhaW5fa2V5ID0gJ3dvcmtiZW5jaC50YXNrcy5pZ25vcmVUYXNrMDEwU2hvd24nO1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHB1YmxpYyBzdGF0aWMgT3V0cHV0Q2hhbm5lbElkOiBzdHJpbmcgPSAndGFza3MnO1xuXHRwdWJsaWMgc3RhdGljIE91dHB1dENoYW5uZWxMYWJlbDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCd0YXNrcycsIFwiVGFza3NcIik7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX25leHRIYW5kbGU6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfdGFza3NSZWNvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zY2hlbWFWZXJzaW9uOiBKc29uU2NoZW1hVmVyc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZXhlY3V0aW9uRW5naW5lOiBFeGVjdXRpb25FbmdpbmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dvcmtzcGFjZUZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd29ya3NwYWNlOiBJV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pZ25vcmVkV29ya3NwYWNlRm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaG93SWdub3JlTWVzc2FnZT86IGJvb2xlYW47XG5cdHByaXZhdGUgX3Byb3ZpZGVyczogTWFwPG51bWJlciwgSVRhc2tQcm92aWRlcj47XG5cdHByaXZhdGUgX3Byb3ZpZGVyVHlwZXM6IE1hcDxudW1iZXIsIHN0cmluZz47XG5cdHByb3RlY3RlZCBfdGFza1N5c3RlbUluZm9zOiBNYXA8c3RyaW5nLCBJVGFza1N5c3RlbUluZm9bXT47XG5cblx0cHJvdGVjdGVkIF93b3Jrc3BhY2VUYXNrc1Byb21pc2U/OiBQcm9taXNlPE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0Pj47XG5cdHByb3RlY3RlZCByZWFkb25seSBfd2hlblRhc2tTeXN0ZW1SZWFkeTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcm90ZWN0ZWQgX3Rhc2tTeXN0ZW0/OiBJVGFza1N5c3RlbTtcblx0cHJvdGVjdGVkIF90YXNrU3lzdGVtTGlzdGVuZXJzPzogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRwcml2YXRlIF9yZWNlbnRseVVzZWRUYXNrc1YxOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlY2VudGx5VXNlZFRhc2tzOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcGVyc2lzdGVudFRhc2tzOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIF90YXNrUnVubmluZ1N0YXRlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJvdGVjdGVkIF90YXNrc0F2YWlsYWJsZVN0YXRlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcm90ZWN0ZWQgX291dHB1dENoYW5uZWw6IElPdXRwdXRDaGFubmVsO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkU3RhdGVDaGFuZ2U6IEVtaXR0ZXI8SVRhc2tFdmVudD47XG5cdHByaXZhdGUgX3dhaXRGb3JBbGxTdXBwb3J0ZWRFeGVjdXRpb25zOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIF9vbkRpZFJlZ2lzdGVyU3VwcG9ydGVkRXhlY3V0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF9vbkRpZFJlZ2lzdGVyQWxsU3VwcG9ydGVkRXhlY3V0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZVRhc2tTeXN0ZW1JbmZvID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgX3dpbGxSZXN0YXJ0OiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBvbkRpZENoYW5nZVRhc2tTeXN0ZW1JbmZvID0gdGhpcy5fb25EaWRDaGFuZ2VUYXNrU3lzdGVtSW5mby5ldmVudDtcblx0cHJpdmF0ZSBfb25EaWRSZWNvbm5lY3RUb1Rhc2tzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBvbkRpZFJlY29ubmVjdFRvVGFza3MgPSB0aGlzLl9vbkRpZFJlY29ubmVjdFRvVGFza3MuZXZlbnQ7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVGFza0NvbmZpZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VUYXNrQ29uZmlnID0gdGhpcy5fb25EaWRDaGFuZ2VUYXNrQ29uZmlnLmV2ZW50O1xuXHRwdWJsaWMgZ2V0IGlzUmVjb25uZWN0ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl90YXNrc1JlY29ubmVjdGVkOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVGFza1Byb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VUYXNrUHJvdmlkZXJzID0gdGhpcy5fb25EaWRDaGFuZ2VUYXNrUHJvdmlkZXJzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXNrUnVuU3RhcnRUaW1lcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tSdW5Tb3VyY2VzID0gbmV3IE1hcDxzdHJpbmcsIFRhc2tSdW5Tb3VyY2U+KCk7XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGVkVGFza1Byb3ZpZGVyczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0b2FzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJT3V0cHV0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX291dHB1dFNlcnZpY2U6IElPdXRwdXRTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhbmVDb21wb3NpdGVTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fd2hlblRhc2tTeXN0ZW1SZWFkeSA9IEV2ZW50LnRvUHJvbWlzZSh0aGlzLm9uRGlkQ2hhbmdlVGFza1N5c3RlbUluZm8pO1xuXHRcdHRoaXMuX3dvcmtzcGFjZVRhc2tzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90YXNrU3lzdGVtID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Rhc2tTeXN0ZW1MaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb3V0cHV0Q2hhbm5lbCA9IHRoaXMuX291dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbChBYnN0cmFjdFRhc2tTZXJ2aWNlLk91dHB1dENoYW5uZWxJZCkhO1xuXHRcdHRoaXMuX3Byb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBJVGFza1Byb3ZpZGVyPigpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyVHlwZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXHRcdHRoaXMuX3Rhc2tTeXN0ZW1JbmZvcyA9IG5ldyBNYXA8c3RyaW5nLCBJVGFza1N5c3RlbUluZm9bXT4oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFza1NlcnZpY2VJbml0aWFsaXplZCA9ICEhdGhpcy5fdGFza1N5c3RlbSB8fCAhIXRoaXMuX3dvcmtzcGFjZVRhc2tzUHJvbWlzZTtcblx0XHRcdGNvbnN0IGZvbGRlclNldHVwID0gdGhpcy5fY29tcHV0ZVdvcmtzcGFjZUZvbGRlclNldHVwKCk7XG5cdFx0XHRpZiAodGhpcy5leGVjdXRpb25FbmdpbmUgIT09IGZvbGRlclNldHVwWzJdKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VUYXNrU3lzdGVtTGlzdGVuZXJzKCk7XG5cdFx0XHRcdHRoaXMuX3Rhc2tTeXN0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVTZXR1cChmb2xkZXJTZXR1cCk7XG5cdFx0XHRpZiAoIXRhc2tTZXJ2aWNlSW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZVdvcmtzcGFjZVRhc2tzKFRhc2tSdW5Tb3VyY2UuRm9sZGVyT3Blbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihhc3luYyAoZSkgPT4ge1xuXHRcdFx0aWYgKCFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd0YXNrcycpIHx8ICghdGhpcy5fdGFza1N5c3RlbSAmJiAhdGhpcy5fd29ya3NwYWNlVGFza3NQcm9taXNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fdGFza1N5c3RlbSB8fCB0aGlzLl90YXNrU3lzdGVtIGluc3RhbmNlb2YgVGVybWluYWxUYXNrU3lzdGVtKSB7XG5cdFx0XHRcdHRoaXMuX291dHB1dENoYW5uZWwuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGFza1NldHRpbmdJZC5SZWNvbm5lY3Rpb24pKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5SZWNvbm5lY3Rpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVyc2lzdGVudFRhc2tzPy5jbGVhcigpO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBYnN0cmFjdFRhc2tTZXJ2aWNlLlBlcnNpc3RlbnRUYXNrc19LZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3NldFRhc2tMUlVDYWNoZUxpbWl0KCk7XG5cdFx0XHRjb25zdCBtYXBTdHJpbmdUb0ZvbGRlclRhc2tzOiBNYXA8c3RyaW5nLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4gPSBhd2FpdCB0aGlzLl91cGRhdGVXb3Jrc3BhY2VUYXNrcyhUYXNrUnVuU291cmNlLkNvbmZpZ3VyYXRpb25DaGFuZ2UpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYXNrQ29uZmlnLmZpcmUoKTtcblxuXHRcdFx0Ly8gTG9vcCB0aHJvdWdoIGFsbCB3b3Jrc3BhY2VGb2xkZXJUYXNrIHJlc3VsdFxuXHRcdFx0Zm9yIChjb25zdCBbZm9sZGVyVXJpLCBmb2xkZXJSZXN1bHRdIG9mIG1hcFN0cmluZ1RvRm9sZGVyVGFza3MpIHtcblx0XHRcdFx0aWYgKCFmb2xkZXJSZXN1bHQuc2V0Py50YXNrcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgZm9sZGVyUmVzdWx0LnNldC50YXNrcykge1xuXHRcdFx0XHRcdGNvbnN0IHJlYWxVbmlxdWVJZCA9IHRhc2suX2lkO1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RUYXNrID0gdGhpcy5fdGFza1N5c3RlbT8ubGFzdFRhc2s/LnRhc2suX2lkO1xuXG5cdFx0XHRcdFx0aWYgKGxhc3RUYXNrICYmIGxhc3RUYXNrID09PSByZWFsVW5pcXVlSWQgJiYgZm9sZGVyVXJpICE9PSAnc2V0dGluZycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZlcmlmaWVkTGFzdFRhc2sgPSBuZXcgVmVyaWZpZWRUYXNrKHRhc2ssIHRoaXMuX3Rhc2tTeXN0ZW0hLmxhc3RUYXNrIS5yZXNvbHZlciwgVHJpZ2dlcnMuY29tbWFuZCk7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU3lzdGVtIS5sYXN0VGFzayA9IHZlcmlmaWVkTGFzdFRhc2s7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cdFx0dGhpcy5fdGFza1J1bm5pbmdTdGF0ZSA9IFRBU0tfUlVOTklOR19TVEFURS5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl90YXNrc0F2YWlsYWJsZVN0YXRlID0gVGFza3NBdmFpbGFibGVDb250ZXh0LmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcigpKTtcblx0XHR0aGlzLl9yZWdpc3RlckNvbW1hbmRzKCkudGhlbigoKSA9PiBUYXNrQ29tbWFuZHNSZWdpc3RlcmVkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpKTtcblx0XHRTZXJ2ZXJsZXNzV2ViQ29udGV4dC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpLnNldChQbGF0Zm9ybS5pc1dlYiAmJiAhcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKT8ucmVtb3RlQXV0aG9yaXR5KTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLmNvbnRyaWJ1dGVWYXJpYWJsZSgnZGVmYXVsdEJ1aWxkVGFzaycsIGFzeW5jICgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0Ly8gZGVsYXkgcHJvdmlkZXIgYWN0aXZhdGlvbiwgd2UgbWlnaHQgZmluZCBhIHNpbmdsZSBkZWZhdWx0IGJ1aWxkIHRhc2sgaW4gdGhlIHRhc2tzLmpzb24gZmlsZVxuXHRcdFx0bGV0IHRhc2tzID0gYXdhaXQgdGhpcy5fZ2V0VGFza3NGb3JHcm91cChUYXNrR3JvdXAuQnVpbGQsIHRydWUpO1xuXHRcdFx0aWYgKHRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLl9nZXREZWZhdWx0VGFza3ModGFza3MpO1xuXHRcdFx0XHRpZiAoZGVmYXVsdHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGRlZmF1bHRzWzBdLl9sYWJlbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gYWN0aXZhdGUgYWxsIHByb3ZpZGVycywgd2UgaGF2ZW4ndCBmb3VuZCB0aGUgZGVmYXVsdCBidWlsZCB0YXNrIGluIHRoZSB0YXNrcy5qc29uIGZpbGVcblx0XHRcdHRhc2tzID0gYXdhaXQgdGhpcy5fZ2V0VGFza3NGb3JHcm91cChUYXNrR3JvdXAuQnVpbGQpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLl9nZXREZWZhdWx0VGFza3ModGFza3MpO1xuXHRcdFx0aWYgKGRlZmF1bHRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gZGVmYXVsdHNbMF0uX2xhYmVsO1xuXHRcdFx0fSBlbHNlIGlmIChkZWZhdWx0cy5sZW5ndGgpIHtcblx0XHRcdFx0dGFza3MgPSBkZWZhdWx0cztcblx0XHRcdH1cblxuXHRcdFx0bGV0IGVudHJ5OiBJVGFza1F1aWNrUGlja0VudHJ5IHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXNrcyAmJiB0YXNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGVudHJ5ID0gYXdhaXQgdGhpcy5fc2hvd1F1aWNrUGljayh0YXNrcywgbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5waWNrQnVpbGRUYXNrRm9yTGFiZWwnLCAnU2VsZWN0IHRoZSBidWlsZCB0YXNrICh0aGVyZSBpcyBubyBkZWZhdWx0IGJ1aWxkIHRhc2sgZGVmaW5lZCknKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgPyBlbnRyeS50YXNrIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFzay5fbGFiZWw7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKGUgPT4ge1xuXHRcdFx0dGhpcy5fd2lsbFJlc3RhcnQgPSBlLnJlYXNvbiAhPT0gU2h1dGRvd25SZWFzb24uUkVMT0FEO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkU3RhdGVDaGFuZ2UoYXN5bmMgZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCd0YXNrRXZlbnQnLCAnVGFzayBFdmVudCBraW5kOiB7MH0nLCBlLmtpbmQpLCB0cnVlKTtcblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdGNhc2UgVGFza0V2ZW50S2luZC5TdGFydDpcblx0XHRcdFx0XHR0aGlzLl90YXNrUnVuU3RhcnRUaW1lcy5zZXQoZS50YXNrSWQsIERhdGUubm93KCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRhc2tFdmVudEtpbmQuUHJvY2Vzc0VuZGVkOiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvY2Vzc0VuZGVkRXZlbnQgPSBlIGFzIElUYXNrUHJvY2Vzc0VuZGVkRXZlbnQ7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gdGhpcy5fdGFza1J1blN0YXJ0VGltZXMuZ2V0KGUudGFza0lkKTtcblx0XHRcdFx0XHRpZiAoIXN0YXJ0VGltZSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGR1cmF0aW9uTXMgPSBwcm9jZXNzRW5kZWRFdmVudC5kdXJhdGlvbk1zID8/IChEYXRlLm5vdygpIC0gc3RhcnRUaW1lKTtcblx0XHRcdFx0XHRpZiAoZHVyYXRpb25NcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9oYW5kbGVMb25nUnVubmluZ1Rhc2tDb21wbGV0aW9uKHByb2Nlc3NFbmRlZEV2ZW50LCBkdXJhdGlvbk1zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fdGFza1J1blN0YXJ0VGltZXMuZGVsZXRlKGUudGFza0lkKTtcblx0XHRcdFx0XHR0aGlzLl90YXNrUnVuU291cmNlcy5kZWxldGUoZS50YXNrSWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgVGFza0V2ZW50S2luZC5JbmFjdGl2ZToge1xuXHRcdFx0XHRcdGNvbnN0IHByb2Nlc3NFbmRlZEV2ZW50ID0gZSBhcyBJVGFza0luYWN0aXZlRXZlbnQ7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gdGhpcy5fdGFza1J1blN0YXJ0VGltZXMuZ2V0KGUudGFza0lkKTtcblx0XHRcdFx0XHRpZiAoIXN0YXJ0VGltZSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGR1cmF0aW9uTXMgPSBwcm9jZXNzRW5kZWRFdmVudC5kdXJhdGlvbk1zID8/IChEYXRlLm5vdygpIC0gc3RhcnRUaW1lKTtcblx0XHRcdFx0XHRpZiAoZHVyYXRpb25NcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9oYW5kbGVMb25nUnVubmluZ1Rhc2tDb21wbGV0aW9uKHByb2Nlc3NFbmRlZEV2ZW50LCBkdXJhdGlvbk1zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fdGFza1J1blN0YXJ0VGltZXMuZGVsZXRlKGUudGFza0lkKTtcblx0XHRcdFx0XHR0aGlzLl90YXNrUnVuU291cmNlcy5kZWxldGUoZS50YXNrSWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgVGFza0V2ZW50S2luZC5UZXJtaW5hdGVkOlxuXHRcdFx0XHRcdHRoaXMuX3Rhc2tSdW5TdGFydFRpbWVzLmRlbGV0ZShlLnRhc2tJZCk7XG5cdFx0XHRcdFx0dGhpcy5fdGFza1J1blNvdXJjZXMuZGVsZXRlKGUudGFza0lkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChlLmtpbmQgPT09IFRhc2tFdmVudEtpbmQuQ2hhbmdlZCkge1xuXHRcdFx0XHQvLyBuby1vcFxuXHRcdFx0fSBlbHNlIGlmICgodGhpcy5fd2lsbFJlc3RhcnQgfHwgKGUua2luZCA9PT0gVGFza0V2ZW50S2luZC5UZXJtaW5hdGVkICYmIGUuZXhpdFJlYXNvbiA9PT0gVGVybWluYWxFeGl0UmVhc29uLlVzZXIpKSAmJiBlLnRhc2tJZCkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBlLl9fdGFzay5nZXRLZXkoKTtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlUGVyc2lzdGVudFRhc2soa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IFRhc2tFdmVudEtpbmQuU3RhcnQgJiYgZS5fX3Rhc2sgJiYgZS5fX3Rhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCkpIHtcblx0XHRcdFx0dGhpcy5fc2V0UGVyc2lzdGVudFRhc2soZS5fX3Rhc2spO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl93YWl0Rm9yQWxsU3VwcG9ydGVkRXhlY3V0aW9ucyA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0RXZlbnQub25jZSh0aGlzLl9vbkRpZFJlZ2lzdGVyQWxsU3VwcG9ydGVkRXhlY3V0aW9ucy5ldmVudCkoKCkgPT4gcmVzb2x2ZSgpKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS53aGVuQ29ubmVjdGVkLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVjb25uZWN0ZWRJbnN0YW5jZXMgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzLmZpbHRlcihlID0+IGUucmVjb25uZWN0aW9uUHJvcGVydGllcz8ub3duZXJJZCA9PT0gVGFza1Rlcm1pbmFsVHlwZSk7XG5cdFx0XHRpZiAocmVjb25uZWN0ZWRJbnN0YW5jZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGVtcHRUYXNrUmVjb25uZWN0aW9uKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90YXNrc1JlY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25EaWRSZWNvbm5lY3RUb1Rhc2tzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3VwZ3JhZGUoKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclN1cHBvcnRlZEV4ZWN1dGlvbnMoY3VzdG9tPzogYm9vbGVhbiwgc2hlbGw/OiBib29sZWFuLCBwcm9jZXNzPzogYm9vbGVhbikge1xuXHRcdGlmIChjdXN0b20gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY3VzdG9tQ29udGV4dCA9IEN1c3RvbUV4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGN1c3RvbUNvbnRleHQuc2V0KGN1c3RvbSk7XG5cdFx0fVxuXHRcdGNvbnN0IGlzVmlydHVhbCA9ICEhVmlydHVhbFdvcmtzcGFjZUNvbnRleHQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChzaGVsbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzaGVsbENvbnRleHQgPSBTaGVsbEV4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHNoZWxsQ29udGV4dC5zZXQoc2hlbGwgJiYgIWlzVmlydHVhbCk7XG5cdFx0fVxuXHRcdGlmIChwcm9jZXNzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHByb2Nlc3NDb250ZXh0ID0gUHJvY2Vzc0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHByb2Nlc3NDb250ZXh0LnNldChwcm9jZXNzICYmICFpc1ZpcnR1YWwpO1xuXHRcdH1cblx0XHQvLyB1cGRhdGUgdGFza3Mgc28gYW4gaW5jb21wbGV0ZSBsaXN0IGlzbid0IHJldHVybmVkIHdoZW4gZ2V0V29ya3NwYWNlVGFza3MgaXMgY2FsbGVkXG5cdFx0dGhpcy5fd29ya3NwYWNlVGFza3NQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJTdXBwb3J0ZWRFeGVjdXRpb25zLmZpcmUoKTtcblx0XHRpZiAoU2VydmVybGVzc1dlYkNvbnRleHQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpIHx8IChjdXN0b20gJiYgc2hlbGwgJiYgcHJvY2VzcykpIHtcblx0XHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJBbGxTdXBwb3J0ZWRFeGVjdXRpb25zLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hdHRlbXB0VGFza1JlY29ubmVjdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbGlmZWN5Y2xlU2VydmljZS5zdGFydHVwS2luZCAhPT0gU3RhcnR1cEtpbmQuUmVsb2FkZWRXaW5kb3cpIHtcblx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnNraXBwaW5nUmVjb25uZWN0aW9uJywgJ1N0YXJ0dXAga2luZCBub3Qgd2luZG93IHJlbG9hZCwgc2V0dGluZyBjb25uZWN0ZWQgYW5kIHJlbW92aW5nIHBlcnNpc3RlbnQgdGFza3MnKSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl90YXNrc1JlY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBYnN0cmFjdFRhc2tTZXJ2aWNlLlBlcnNpc3RlbnRUYXNrc19LZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tTZXR0aW5nSWQuUmVjb25uZWN0aW9uKSB8fCB0aGlzLl90YXNrc1JlY29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub3RDb25uZWN0aW5nJywgJ1NldHRpbmcgdGFza3MgY29ubmVjdGVkIGNvbmZpZ3VyZWQgdmFsdWUgezB9LCB0YXNrcyB3ZXJlIGFscmVhZHkgcmVjb25uZWN0ZWQgezF9JywgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5SZWNvbm5lY3Rpb24pLCB0aGlzLl90YXNrc1JlY29ubmVjdGVkKSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl90YXNrc1JlY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucmVjb25uZWN0aW5nJywgJ1JlY29ubmVjdGluZyB0byBydW5uaW5nIHRhc2tzLi4uJyksIHRydWUpO1xuXHRcdHRoaXMuZ2V0V29ya3NwYWNlVGFza3MoVGFza1J1blNvdXJjZS5SZWNvbm5lY3QpLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdGFza3NSZWNvbm5lY3RlZCA9IGF3YWl0IHRoaXMuX3JlY29ubmVjdFRhc2tzKCk7XG5cdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5yZWNvbm5lY3RlZCcsICdSZWNvbm5lY3RlZCB0byBydW5uaW5nIHRhc2tzLicpLCB0cnVlKTtcblx0XHRcdHRoaXMuX29uRGlkUmVjb25uZWN0VG9UYXNrcy5maXJlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVMb25nUnVubmluZ1Rhc2tDb21wbGV0aW9uKGV2ZW50OiBJVGFza1Byb2Nlc3NFbmRlZEV2ZW50IHwgSVRhc2tJbmFjdGl2ZUV2ZW50LCBkdXJhdGlvbk1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25UaHJlc2hvbGQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFRhc2tTZXR0aW5nSWQuTm90aWZ5V2luZG93T25UYXNrQ29tcGxldGlvbik7XG5cdFx0Ly8gSWYgdGhyZXNob2xkIGlzIC0xLCBub3RpZmljYXRpb25zIGFyZSBkaXNhYmxlZFxuXHRcdC8vIElmIHRocmVzaG9sZCBpcyAwLCBhbHdheXMgc2hvdyBub3RpZmljYXRpb25zIChubyBtaW5pbXVtIGR1cmF0aW9uKVxuXHRcdC8vIE90aGVyd2lzZSwgb25seSBzaG93IGlmIGR1cmF0aW9uIG1lZXRzIG9yIGV4Y2VlZHMgdGhlIHRocmVzaG9sZFxuXHRcdGlmIChub3RpZmljYXRpb25UaHJlc2hvbGQgPT09IC0xIHx8IChub3RpZmljYXRpb25UaHJlc2hvbGQgPiAwICYmIGR1cmF0aW9uTXMgPCBub3RpZmljYXRpb25UaHJlc2hvbGQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFza1J1blNvdXJjZSA9IHRoaXMuX3Rhc2tSdW5Tb3VyY2VzLmdldChldmVudC50YXNrSWQpO1xuXHRcdGlmICh0YXNrUnVuU291cmNlID09PSBUYXNrUnVuU291cmNlLkNoYXRBZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRlcm1pbmFsRm9yVGFzayA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMuZmluZChpID0+IGkuaW5zdGFuY2VJZCA9PT0gZXZlbnQudGVybWluYWxJZCk7XG5cdFx0aWYgKCF0ZXJtaW5hbEZvclRhc2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFza0xhYmVsID0gdGVybWluYWxGb3JUYXNrLnRpdGxlO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGVybWluYWxGb3JUYXNrLmRvbUVsZW1lbnQpO1xuXHRcdGlmICh0YXJnZXRXaW5kb3cuZG9jdW1lbnQuaGFzRm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGR1cmF0aW9uVGV4dCA9IHRoaXMuX2Zvcm1hdFRhc2tEdXJhdGlvbihkdXJhdGlvbk1zKTtcblx0XHRjb25zdCBtZXNzYWdlID0gdGFza0xhYmVsXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgndGFzay5sb25nUnVubmluZ1Rhc2tDb21wbGV0ZWRXaXRoTGFiZWwnLCAnVGFzayBcInswfVwiIGZpbmlzaGVkIGluIHsxfS4nLCB0YXNrTGFiZWwsIGR1cmF0aW9uVGV4dClcblx0XHRcdDogbmxzLmxvY2FsaXplKCd0YXNrLmxvbmdSdW5uaW5nVGFza0NvbXBsZXRlZCcsICdUYXNrIGZpbmlzaGVkIGluIHswfS4nLCBkdXJhdGlvblRleHQpO1xuXHRcdHRoaXMuX2hvc3RTZXJ2aWNlLmZvY3VzKHRhcmdldFdpbmRvdywgeyBtb2RlOiBGb2N1c01vZGUuTm90aWZ5IH0pO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMudG9hc3QudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpO1xuXHRcdGNvbnN0IHsgY2xpY2tlZCB9ID0gYXdhaXQgdGhpcy5faG9zdFNlcnZpY2Uuc2hvd1RvYXN0KHsgdGl0bGU6IG1lc3NhZ2UgfSwgY3RzLnRva2VuKTtcblx0XHR0aGlzLnRvYXN0LmNsZWFyKCk7XG5cdFx0aWYgKGNsaWNrZWQpIHtcblx0XHRcdHRoaXMuX2hvc3RTZXJ2aWNlLmZvY3VzKHRhcmdldFdpbmRvdywgeyBtb2RlOiBGb2N1c01vZGUuRm9yY2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0VGFza0R1cmF0aW9uKGR1cmF0aW9uTXM6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgdG90YWxTZWNvbmRzID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChkdXJhdGlvbk1zIC8gMTAwMCkpO1xuXHRcdGNvbnN0IG1pbnV0ZXMgPSBNYXRoLmZsb29yKHRvdGFsU2Vjb25kcyAvIDYwKTtcblx0XHRjb25zdCBzZWNvbmRzID0gdG90YWxTZWNvbmRzICUgNjA7XG5cdFx0aWYgKG1pbnV0ZXMgPiAwKSB7XG5cdFx0XHRyZXR1cm4gc2Vjb25kcyA+IDBcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3Rhc2subG9uZ1J1bm5pbmdUYXNrRHVyYXRpb25NaW51dGVzU2Vjb25kcycsICd7MH1tIHsxfXMnLCBtaW51dGVzLCBzZWNvbmRzKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgndGFzay5sb25nUnVubmluZ1Rhc2tEdXJhdGlvbk1pbnV0ZXMnLCAnezB9bScsIG1pbnV0ZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd0YXNrLmxvbmdSdW5uaW5nVGFza0R1cmF0aW9uU2Vjb25kcycsICd7MH1zJywgc2Vjb25kcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbm5lY3RUYXNrcygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMuZ2V0U2F2ZWRUYXNrcygncGVyc2lzdGVudCcpO1xuXHRcdGlmICghdGFza3MubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub1Rhc2tzJywgJ05vIHBlcnNpc3RlbnQgdGFza3MgdG8gcmVjb25uZWN0LicpLCB0cnVlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCB0YXNrTGFiZWxzID0gdGFza3MubWFwKHRhc2sgPT4gdGFzay5fbGFiZWwpLmpvaW4oJywgJyk7XG5cdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucmVjb25uZWN0aW5nVGFza3MnLCAnUmVjb25uZWN0aW5nIHRvIHswfSB0YXNrcy4uLicsIHRhc2tMYWJlbHMpLCB0cnVlKTtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdGlmIChDb25maWd1cmluZ1Rhc2suaXModGFzaykpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLnRyeVJlc29sdmVUYXNrKHRhc2spO1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHR0aGlzLnJ1bihyZXNvbHZlZCwgdW5kZWZpbmVkLCBUYXNrUnVuU291cmNlLlJlY29ubmVjdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucnVuKHRhc2ssIHVuZGVmaW5lZCwgVGFza1J1blNvdXJjZS5SZWNvbm5lY3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRTdGF0ZUNoYW5nZSgpOiBFdmVudDxJVGFza0V2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN1cHBvcnRzTXVsdGlwbGVUYXNrRXhlY3V0aW9ucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pblRlcm1pbmFsKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWdpc3RlckNvbW1hbmRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5ydW5UYXNrJyxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJnPzogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyKSA9PiB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcnVuVGFza0NvbW1hbmQoYXJnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0XHRpc09wdGlvbmFsOiB0cnVlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3J1blRhc2suYXJnJywgXCJGaWx0ZXJzIHRoZSB0YXNrcyBzaG93biBpbiB0aGUgcXVpY2twaWNrXCIpLFxuXHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3J1blRhc2subGFiZWwnLCBcIlRoZSB0YXNrJ3MgbGFiZWwgb3IgYSB0ZXJtIHRvIGZpbHRlciBieVwiKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVuVGFzay50eXBlJywgXCJUaGUgY29udHJpYnV0ZWQgdGFzayB0eXBlXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0dGFzazoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVuVGFzay50YXNrJywgXCJUaGUgdGFzaydzIGxhYmVsIG9yIGEgdGVybSB0byBmaWx0ZXIgYnlcIilcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZVJ1blRhc2snLCBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuX3JlUnVuVGFza0NvbW1hbmQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlc3RhcnRUYXNrJywgYXN5bmMgKGFjY2Vzc29yLCBhcmc/OiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuX3J1blJlc3RhcnRUYXNrQ29tbWFuZChhcmcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoUmVydW5BbGxSdW5uaW5nVGFza3NDb21tYW5kSWQsIGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcnVuUmVydW5BbGxSdW5uaW5nVGFza3NDb21tYW5kKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy50ZXJtaW5hdGUnLCBhc3luYyAoYWNjZXNzb3IsIGFyZz86IHN0cmluZyB8IElUYXNrSWRlbnRpZmllcikgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcnVuVGVybWluYXRlQ29tbWFuZChhcmcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dMb2cnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zaG93T3V0cHV0KHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5idWlsZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuX3J1bkJ1aWxkQ29tbWFuZCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MudGVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuX3J1blRlc3RDb21tYW5kKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVUYXNrUnVubmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcnVuQ29uZmlndXJlVGFza3MoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZURlZmF1bHRCdWlsZFRhc2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fdHJ1c3QoKSkge1xuXHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVEZWZhdWx0QnVpbGRUYXNrKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVEZWZhdWx0VGVzdFRhc2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fdHJ1c3QoKSkge1xuXHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVEZWZhdWx0VGVzdFRhc2soKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dUYXNrcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJ1blNob3dUYXNrcygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MudG9nZ2xlUHJvYmxlbXMnLCAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNYXJrZXJzLlRPR0dMRV9NQVJLRVJTX1ZJRVdfQUNUSU9OX0lEKSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5vcGVuVXNlclRhc2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLl9nZXRSZXNvdXJjZUZvcktpbmQoVGFza1NvdXJjZUtpbmQuVXNlcik7XG5cdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5fb3BlblRhc2tGaWxlKHJlc291cmNlLCBUYXNrU291cmNlS2luZC5Vc2VyKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm9wZW5Xb3Jrc3BhY2VGaWxlVGFza3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX2dldFJlc291cmNlRm9yS2luZChUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlKTtcblx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9vcGVuVGFza0ZpbGUocmVzb3VyY2UsIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgd29ya3NwYWNlRm9sZGVycygpOiBJV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlRm9sZGVycykge1xuXHRcdFx0dGhpcy5fdXBkYXRlU2V0dXAoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUZvbGRlcnMhO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaWdub3JlZFdvcmtzcGFjZUZvbGRlcnMoKTogSVdvcmtzcGFjZUZvbGRlcltdIHtcblx0XHRpZiAoIXRoaXMuX2lnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVTZXR1cCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faWdub3JlZFdvcmtzcGFjZUZvbGRlcnMhO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCBleGVjdXRpb25FbmdpbmUoKTogRXhlY3V0aW9uRW5naW5lIHtcblx0XHRpZiAodGhpcy5fZXhlY3V0aW9uRW5naW5lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNldHVwKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9leGVjdXRpb25FbmdpbmUhO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2NoZW1hVmVyc2lvbigpOiBKc29uU2NoZW1hVmVyc2lvbiB7XG5cdFx0aWYgKHRoaXMuX3NjaGVtYVZlcnNpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlU2V0dXAoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NjaGVtYVZlcnNpb24hO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2hvd0lnbm9yZU1lc3NhZ2UoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3Nob3dJZ25vcmVNZXNzYWdlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Nob3dJZ25vcmVNZXNzYWdlID0gIXRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQWJzdHJhY3RUYXNrU2VydmljZS5JZ25vcmVUYXNrMDEwRG9ub3RTaG93QWdhaW5fa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zaG93SWdub3JlTWVzc2FnZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2YXRpb25FdmVudHModHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRyZXN1bHQucHVzaCgnb25Db21tYW5kOndvcmtiZW5jaC5hY3Rpb24udGFza3MucnVuVGFzaycpO1xuXHRcdGlmICh0eXBlKSB7XG5cdFx0XHQvLyBzZW5kIGEgc3BlY2lmaWMgYWN0aXZhdGlvbiBldmVudCBmb3IgdGhpcyB0YXNrIHR5cGVcblx0XHRcdHJlc3VsdC5wdXNoKGBvblRhc2tUeXBlOiR7dHlwZX1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gc2VuZCBhY3RpdmF0aW9uIGV2ZW50cyBmb3IgYWxsIHRhc2sgdHlwZXNcblx0XHRcdGZvciAoY29uc3QgZGVmaW5pdGlvbiBvZiBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmFsbCgpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGBvblRhc2tUeXBlOiR7ZGVmaW5pdGlvbi50YXNrVHlwZX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FjdGl2YXRlVGFza1Byb3ZpZGVycyh0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBXZSBuZWVkIHRvIGZpcnN0IHdhaXQgZm9yIGV4dGVuc2lvbnMgdG8gYmUgcmVnaXN0ZXJlZCBiZWNhdXNlIHdlIG1pZ2h0IHJlYWRcblx0XHQvLyB0aGUgYFRhc2tEZWZpbml0aW9uUmVnaXN0cnlgIGluIGNhc2UgYHR5cGVgIGlzIGB1bmRlZmluZWRgXG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCBoYXNMb2dnZWRBY3RpdmF0aW9uID0gdGhpcy5fYWN0aXZhdGVkVGFza1Byb3ZpZGVycy5oYXModHlwZSA/PyAnYWxsJyk7XG5cdFx0aWYgKCFoYXNMb2dnZWRBY3RpdmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9sb2coJ0FjdGl2YXRpbmcgdGFzayBwcm92aWRlcnMgJyArICh0eXBlID8/ICdhbGwnKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KFxuXHRcdFx0UHJvbWlzZS5hbGwodGhpcy5fZ2V0QWN0aXZhdGlvbkV2ZW50cyh0eXBlKS5tYXAoYWN0aXZhdGlvbkV2ZW50ID0+IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCkpKSxcblx0XHRcdDUwMDAsXG5cdFx0XHQoKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1RpbWVkIG91dCBhY3RpdmF0aW5nIGV4dGVuc2lvbnMgZm9yIHRhc2sgcHJvdmlkZXJzJylcblx0XHQpO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHRoaXMuX2FjdGl2YXRlZFRhc2tQcm92aWRlcnMuYWRkKHR5cGUgPz8gJ2FsbCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNldHVwKHNldHVwPzogW0lXb3Jrc3BhY2VGb2xkZXJbXSwgSVdvcmtzcGFjZUZvbGRlcltdLCBFeGVjdXRpb25FbmdpbmUsIEpzb25TY2hlbWFWZXJzaW9uLCBJV29ya3NwYWNlIHwgdW5kZWZpbmVkXSk6IHZvaWQge1xuXHRcdGlmICghc2V0dXApIHtcblx0XHRcdHNldHVwID0gdGhpcy5fY29tcHV0ZVdvcmtzcGFjZUZvbGRlclNldHVwKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3dvcmtzcGFjZUZvbGRlcnMgPSBzZXR1cFswXTtcblx0XHRpZiAodGhpcy5faWdub3JlZFdvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdGlmICh0aGlzLl9pZ25vcmVkV29ya3NwYWNlRm9sZGVycy5sZW5ndGggIT09IHNldHVwWzFdLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9zaG93SWdub3JlTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNldDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdFx0XHRcdHRoaXMuX2lnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHNldC5hZGQoZm9sZGVyLnVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHNldHVwWzFdKSB7XG5cdFx0XHRcdFx0aWYgKCFzZXQuaGFzKGZvbGRlci51cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dJZ25vcmVNZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2lnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzID0gc2V0dXBbMV07XG5cdFx0dGhpcy5fZXhlY3V0aW9uRW5naW5lID0gc2V0dXBbMl07XG5cdFx0dGhpcy5fc2NoZW1hVmVyc2lvbiA9IHNldHVwWzNdO1xuXHRcdHRoaXMuX3dvcmtzcGFjZSA9IHNldHVwWzRdO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zaG93T3V0cHV0KHJ1blNvdXJjZTogVGFza1J1blNvdXJjZSA9IFRhc2tSdW5Tb3VyY2UuVXNlciwgdXNlclJlcXVlc3RlZD86IGJvb2xlYW4sIGVycm9yTWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghVmlydHVhbFdvcmtzcGFjZUNvbnRleHQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpICYmICgocnVuU291cmNlID09PSBUYXNrUnVuU291cmNlLlVzZXIpIHx8IChydW5Tb3VyY2UgPT09IFRhc2tSdW5Tb3VyY2UuQ29uZmlndXJhdGlvbkNoYW5nZSkpKSB7XG5cdFx0XHRpZiAodXNlclJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKHRoaXMuX291dHB1dENoYW5uZWwuaWQsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY2hhdEVuYWJsZWQgPSB0aGlzLl9jaGF0U2VydmljZS5pc0VuYWJsZWQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbXTtcblx0XHRcdFx0aWYgKGNoYXRFbmFibGVkICYmIGVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRcdGNvbnN0IGJlZm9yZUpTT05yZWdleCA9IC9eKC4qPylcXHMqXFx7W1xcc1xcU10qJC87XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hlcyA9IGVycm9yTWVzc2FnZS5tYXRjaChiZWZvcmVKU09OcmVnZXgpO1xuXHRcdFx0XHRcdGlmIChtYXRjaGVzICYmIG1hdGNoZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG1hdGNoZXNbMV07XG5cdFx0XHRcdFx0XHRjb25zdCBjdXN0b21NZXNzYWdlID0gbWVzc2FnZSA9PT0gZXJyb3JNZXNzYWdlXG5cdFx0XHRcdFx0XHRcdD8gYFxcYCR7bWVzc2FnZX1cXGBgXG5cdFx0XHRcdFx0XHRcdDogYFxcYCR7bWVzc2FnZX1cXGBcXG5cXGBcXGBcXGBqc29uJHtlcnJvck1lc3NhZ2V9XFxgXFxgXFxgYDtcblxuXG5cdFx0XHRcdFx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSB0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdFx0XHRcdGlmIChkZWZhdWx0QWdlbnQpIHtcblx0XHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd0cm91Ymxlc2hvb3RXaXRoQ2hhdCcsIFwiRml4IHdpdGggQUlcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFUX09QRU5fQUNUSU9OX0lELCB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1vZGU6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cXVlcnk6IGBGaXggdGhpcyB0YXNrIGNvbmZpZ3VyYXRpb24gZXJyb3I6ICR7Y3VzdG9tTWVzc2FnZX1gXG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3Nob3dPdXRwdXQnLCBcIlNob3cgT3V0cHV0XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbCh0aGlzLl9vdXRwdXRDaGFubmVsLmlkLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoY2hhdEVuYWJsZWQgJiYgYWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbmxzLmxvY2FsaXplKCd0YXNrU2VydmljZU91dHB1dFByb21wdENoYXQnLCAnVGhlcmUgYXJlIHRhc2sgZXJyb3JzLiBVc2UgY2hhdCB0byBmaXggdGhlbSBvciB2aWV3IHRoZSBvdXRwdXQgZm9yIGRldGFpbHMuJyksIGFjdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5Lldhcm5pbmcsIG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2VPdXRwdXRQcm9tcHQnLCAnVGhlcmUgYXJlIHRhc2sgZXJyb3JzLiBTZWUgdGhlIG91dHB1dCBmb3IgZGV0YWlscy4nKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2Rpc3Bvc2VUYXNrU3lzdGVtTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90YXNrU3lzdGVtTGlzdGVuZXJzKSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3Rhc2tTeXN0ZW1MaXN0ZW5lcnMpO1xuXHRcdFx0dGhpcy5fdGFza1N5c3RlbUxpc3RlbmVycyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUYXNrUHJvdmlkZXIocHJvdmlkZXI6IElUYXNrUHJvdmlkZXIsIHR5cGU6IHN0cmluZyk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IGhhbmRsZSA9IEFic3RyYWN0VGFza1NlcnZpY2UuX25leHRIYW5kbGUrKztcblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KGhhbmRsZSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyVHlwZXMuc2V0KGhhbmRsZSwgdHlwZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUYXNrUHJvdmlkZXJzLmZpcmUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyVHlwZXMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFza1Byb3ZpZGVycy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGdldCBoYXNUYXNrU3lzdGVtSW5mbygpOiBib29sZWFuIHtcblx0XHRjb25zdCBpbmZvc0NvdW50ID0gQXJyYXkuZnJvbSh0aGlzLl90YXNrU3lzdGVtSW5mb3MudmFsdWVzKCkpLmZsYXQoKS5sZW5ndGg7XG5cdFx0Ly8gSWYgdGhlcmUncyBhIHJlbW90ZUF1dGhvcml0eSwgdGhlbiB3ZSBlbmQgdXAgd2l0aCAyIHRhc2tTeXN0ZW1JbmZvcyxcblx0XHQvLyBvbmUgZm9yIGVhY2ggZXh0ZW5zaW9uIGhvc3QuXG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBpbmZvc0NvdW50ID4gMTtcblx0XHR9XG5cdFx0cmV0dXJuIGluZm9zQ291bnQgPiAwO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVGFza1N5c3RlbShrZXk6IHN0cmluZywgaW5mbzogSVRhc2tTeXN0ZW1JbmZvKTogdm9pZCB7XG5cdFx0Ly8gSWRlYWxseSB0aGUgV2ViIGNhbGxlciBvZiByZWdpc3RlclJlZ2lzdGVyVGFza1N5c3RlbSB3b3VsZCB1c2UgdGhlIGNvcnJlY3Qga2V5LlxuXHRcdC8vIEhvd2V2ZXIsIHRoZSBjYWxsZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSB3b3Jrc3BhY2UgZm9sZGVycyBhdCB0aGUgdGltZSBvZiB0aGUgY2FsbCwgZXZlbiB0aG91Z2ggd2Uga25vdyBhYm91dCB0aGVtIGhlcmUuXG5cdFx0aWYgKGluZm8ucGxhdGZvcm0gPT09IFBsYXRmb3JtLlBsYXRmb3JtLldlYikge1xuXHRcdFx0a2V5ID0gdGhpcy53b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCA/IHRoaXMud29ya3NwYWNlRm9sZGVyc1swXS51cmkuc2NoZW1lIDoga2V5O1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW1JbmZvcy5oYXMoa2V5KSkge1xuXHRcdFx0dGhpcy5fdGFza1N5c3RlbUluZm9zLnNldChrZXksIFtpbmZvXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluZm9zID0gdGhpcy5fdGFza1N5c3RlbUluZm9zLmdldChrZXkpITtcblx0XHRcdGlmIChpbmZvLnBsYXRmb3JtID09PSBQbGF0Zm9ybS5QbGF0Zm9ybS5XZWIpIHtcblx0XHRcdFx0Ly8gV2ViIGluZm9zIHNob3VsZCBiZSBwdXNoZWQgbGFzdC5cblx0XHRcdFx0aW5mb3MucHVzaChpbmZvKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluZm9zLnVuc2hpZnQoaW5mbyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaGFzVGFza1N5c3RlbUluZm8pIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFza1N5c3RlbUluZm8uZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFRhc2tTeXN0ZW1JbmZvKGtleTogc3RyaW5nKTogSVRhc2tTeXN0ZW1JbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmZvcyA9IHRoaXMuX3Rhc2tTeXN0ZW1JbmZvcy5nZXQoa2V5KTtcblx0XHRyZXR1cm4gKGluZm9zICYmIGluZm9zLmxlbmd0aCkgPyBpbmZvc1swXSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBleHRlbnNpb25DYWxsYmFja1Rhc2tDb21wbGV0ZSh0YXNrOiBUYXNrLCByZXN1bHQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fdGFza1N5c3RlbSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFza1N5c3RlbS5jdXN0b21FeGVjdXRpb25Db21wbGV0ZSh0YXNrLCByZXN1bHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBhIHN1YnNldCBvZiB3b3Jrc3BhY2UgdGFza3MgdGhhdCBtYXRjaCBhIGNlcnRhaW4gcHJlZGljYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmluZFdvcmtzcGFjZVRhc2tzKHByZWRpY2F0ZTogKHRhc2s6IENvbmZpZ3VyaW5nVGFzayB8IFRhc2ssIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcikgPT4gYm9vbGVhbik6IFByb21pc2U8KENvbmZpZ3VyaW5nVGFzayB8IFRhc2spW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IChDb25maWd1cmluZ1Rhc2sgfCBUYXNrKVtdID0gW107XG5cblx0XHRjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMuZ2V0V29ya3NwYWNlVGFza3MoKTtcblx0XHRmb3IgKGNvbnN0IFssIHdvcmtzcGFjZVRhc2tzXSBvZiB0YXNrcykge1xuXHRcdFx0aWYgKHdvcmtzcGFjZVRhc2tzLmNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFza05hbWUgb2YgT2JqZWN0LmtleXMod29ya3NwYWNlVGFza3MuY29uZmlndXJhdGlvbnMuYnlJZGVudGlmaWVyKSkge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2sgPSB3b3Jrc3BhY2VUYXNrcy5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXJbdGFza05hbWVdO1xuXHRcdFx0XHRcdGlmIChwcmVkaWNhdGUodGFzaywgd29ya3NwYWNlVGFza3Mud29ya3NwYWNlRm9sZGVyKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAod29ya3NwYWNlVGFza3Muc2V0KSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB3b3Jrc3BhY2VUYXNrcy5zZXQudGFza3MpIHtcblx0XHRcdFx0XHRpZiAocHJlZGljYXRlKHRhc2ssIHdvcmtzcGFjZVRhc2tzLndvcmtzcGFjZUZvbGRlcikpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZFdvcmtzcGFjZVRhc2tzSW5Hcm91cChncm91cDogVGFza0dyb3VwLCBpc0RlZmF1bHQ6IGJvb2xlYW4pOiBQcm9taXNlPChDb25maWd1cmluZ1Rhc2sgfCBUYXNrKVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRXb3Jrc3BhY2VUYXNrcygodGFzaykgPT4ge1xuXHRcdFx0Y29uc3QgdGFza0dyb3VwID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cDtcblx0XHRcdGlmICh0YXNrR3JvdXAgJiYgdHlwZW9mIHRhc2tHcm91cCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuICh0YXNrR3JvdXAuX2lkID09PSBncm91cC5faWQgJiYgKCFpc0RlZmF1bHQgfHwgISF0YXNrR3JvdXAuaXNEZWZhdWx0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0VGFzayhmb2xkZXI6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIHwgc3RyaW5nLCBpZGVudGlmaWVyOiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIsIGNvbXBhcmVJZDogYm9vbGVhbiA9IGZhbHNlLCB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl90cnVzdCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuYW1lID0gVHlwZXMuaXNTdHJpbmcoZm9sZGVyKSA/IGZvbGRlciA6IGlzV29ya3NwYWNlRm9sZGVyKGZvbGRlcikgPyBmb2xkZXIubmFtZSA6IGZvbGRlci5jb25maWd1cmF0aW9uID8gcmVzb3VyY2VzLmJhc2VuYW1lKGZvbGRlci5jb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5pZ25vcmVkV29ya3NwYWNlRm9sZGVycy5zb21lKGlnbm9yZWQgPT4gaWdub3JlZC5uYW1lID09PSBuYW1lKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ1Rhc2tTZXJ2ZXIuZm9sZGVySWdub3JlZCcsICdUaGUgZm9sZGVyIHswfSBpcyBpZ25vcmVkIHNpbmNlIGl0IHVzZXMgdGFzayB2ZXJzaW9uIDAuMS4wJywgbmFtZSkpKTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5OiBzdHJpbmcgfCBLZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkID0gIVR5cGVzLmlzU3RyaW5nKGlkZW50aWZpZXIpXG5cdFx0XHQ/IFRhc2tEZWZpbml0aW9uLmNyZWF0ZVRhc2tJZGVudGlmaWVyKGlkZW50aWZpZXIsIGNvbnNvbGUpXG5cdFx0XHQ6IGlkZW50aWZpZXI7XG5cblx0XHRpZiAoa2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gZmluZCB0aGUgdGFzayBpbiB0aGUgd29ya3NwYWNlXG5cdFx0Y29uc3QgcmVxdWVzdGVkRm9sZGVyID0gVGFza01hcC5nZXRLZXkoZm9sZGVyKTtcblx0XHRjb25zdCBtYXRjaGVkVGFza3MgPSBhd2FpdCB0aGlzLl9maW5kV29ya3NwYWNlVGFza3MoKHRhc2ssIHdvcmtzcGFjZUZvbGRlcikgPT4ge1xuXHRcdFx0Y29uc3QgdGFza0ZvbGRlciA9IFRhc2tNYXAuZ2V0S2V5KHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHRpZiAodGFza0ZvbGRlciAhPT0gcmVxdWVzdGVkRm9sZGVyICYmIHRhc2tGb2xkZXIgIT09IFVTRVJfVEFTS1NfR1JPVVBfS0VZKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YXNrLm1hdGNoZXMoa2V5LCBjb21wYXJlSWQpO1xuXHRcdH0pO1xuXHRcdG1hdGNoZWRUYXNrcy5zb3J0KHRhc2sgPT4gdGFzay5fc291cmNlLmtpbmQgPT09IFRhc2tTb3VyY2VLaW5kLkV4dGVuc2lvbiA/IDEgOiAtMSk7XG5cdFx0aWYgKG1hdGNoZWRUYXNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBOaWNlLCB3ZSBmb3VuZCBhIGNvbmZpZ3VyZWQgdGFzayFcblx0XHRcdGNvbnN0IHRhc2sgPSBtYXRjaGVkVGFza3NbMF07XG5cdFx0XHRpZiAoQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnRyeVJlc29sdmVUYXNrKHRhc2spO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2UgZGlkbid0IGZpbmQgdGhlIHRhc2ssIHNvIHdlIG5lZWQgdG8gYXNrIGFsbCByZXNvbHZlcnMgYWJvdXQgaXRcblx0XHRjb25zdCBtYXAgPSBhd2FpdCB0aGlzLl9nZXRHcm91cGVkVGFza3MoeyB0eXBlIH0pO1xuXHRcdGxldCB2YWx1ZXMgPSBtYXAuZ2V0KGZvbGRlcik7XG5cdFx0dmFsdWVzID0gdmFsdWVzLmNvbmNhdChtYXAuZ2V0KFVTRVJfVEFTS1NfR1JPVVBfS0VZKSk7XG5cblx0XHRpZiAoIXZhbHVlcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dmFsdWVzID0gdmFsdWVzLmZpbHRlcih0YXNrID0+IHRhc2subWF0Y2hlcyhrZXksIGNvbXBhcmVJZCkpLnNvcnQodGFzayA9PiB0YXNrLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuRXh0ZW5zaW9uID8gMSA6IC0xKTtcblx0XHRyZXR1cm4gdmFsdWVzLmxlbmd0aCA+IDAgPyB2YWx1ZXNbMF0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdHJ5UmVzb2x2ZVRhc2soY29uZmlndXJpbmdUYXNrOiBDb25maWd1cmluZ1Rhc2spOiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl90cnVzdCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9hY3RpdmF0ZVRhc2tQcm92aWRlcnMoY29uZmlndXJpbmdUYXNrLnR5cGUpO1xuXHRcdGxldCBtYXRjaGluZ1Byb3ZpZGVyOiBJVGFza1Byb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBtYXRjaGluZ1Byb3ZpZGVyVW5hdmFpbGFibGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIHByb3ZpZGVyXSBvZiB0aGlzLl9wcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyVHlwZSA9IHRoaXMuX3Byb3ZpZGVyVHlwZXMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRpZiAoY29uZmlndXJpbmdUYXNrLnR5cGUgPT09IHByb3ZpZGVyVHlwZSkge1xuXHRcdFx0XHRpZiAocHJvdmlkZXJUeXBlICYmICF0aGlzLl9pc1Rhc2tQcm92aWRlckVuYWJsZWQocHJvdmlkZXJUeXBlKSkge1xuXHRcdFx0XHRcdG1hdGNoaW5nUHJvdmlkZXJVbmF2YWlsYWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWF0Y2hpbmdQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIW1hdGNoaW5nUHJvdmlkZXIpIHtcblx0XHRcdGlmIChtYXRjaGluZ1Byb3ZpZGVyVW5hdmFpbGFibGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHQnVGFza1NlcnZpY2UucHJvdmlkZXJVbmF2YWlsYWJsZScsXG5cdFx0XHRcdFx0J1dhcm5pbmc6IHswfSB0YXNrcyBhcmUgdW5hdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgZW52aXJvbm1lbnQuJyxcblx0XHRcdFx0XHRjb25maWd1cmluZ1Rhc2suY29uZmlndXJlcy50eXBlXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRyeSB0byByZXNvbHZlIHRoZSB0YXNrIGZpcnN0XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkVGFzayA9IGF3YWl0IG1hdGNoaW5nUHJvdmlkZXIucmVzb2x2ZVRhc2soY29uZmlndXJpbmdUYXNrKTtcblx0XHRcdGlmIChyZXNvbHZlZFRhc2sgJiYgKHJlc29sdmVkVGFzay5faWQgPT09IGNvbmZpZ3VyaW5nVGFzay5faWQpKSB7XG5cdFx0XHRcdHJldHVybiBUYXNrQ29uZmlnLmNyZWF0ZUN1c3RvbVRhc2socmVzb2x2ZWRUYXNrLCBjb25maWd1cmluZ1Rhc2spO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBJZ25vcmUgZXJyb3JzLiBUaGUgdGFzayBjb3VsZCBub3QgYmUgcHJvdmlkZWQgYnkgYW55IG9mIHRoZSBwcm92aWRlcnMuXG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHRhc2sgY291bGRuJ3QgYmUgcmVzb2x2ZWQuIEluc3RlYWQsIHVzZSB0aGUgbGVzcyBlZmZpY2llbnQgcHJvdmlkZVRhc2suXG5cdFx0Y29uc3QgdGFza3MgPSBhd2FpdCB0aGlzLnRhc2tzKHsgdHlwZTogY29uZmlndXJpbmdUYXNrLnR5cGUgfSk7XG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRpZiAodGFzay5faWQgPT09IGNvbmZpZ3VyaW5nVGFzay5faWQpIHtcblx0XHRcdFx0cmV0dXJuIFRhc2tDb25maWcuY3JlYXRlQ3VzdG9tVGFzayg8Q29udHJpYnV0ZWRUYXNrPnRhc2ssIGNvbmZpZ3VyaW5nVGFzayk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF92ZXJzaW9uQW5kRW5naW5lQ29tcGF0aWJsZShmaWx0ZXI/OiBJVGFza0ZpbHRlcik6IGJvb2xlYW47XG5cblx0cHVibGljIGFzeW5jIHRhc2tzKGZpbHRlcj86IElUYXNrRmlsdGVyKTogUHJvbWlzZTxUYXNrW10+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl90cnVzdCgpKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3ZlcnNpb25BbmRFbmdpbmVDb21wYXRpYmxlKGZpbHRlcikpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8VGFza1tdPihbXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRHcm91cGVkVGFza3MoZmlsdGVyKS50aGVuKChtYXApID0+IHRoaXMuYXBwbHlGaWx0ZXJUb1Rhc2tNYXAoZmlsdGVyLCBtYXApKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRLbm93blRhc2tzKGZpbHRlcj86IElUYXNrRmlsdGVyKTogUHJvbWlzZTxUYXNrW10+IHtcblx0XHRpZiAoIXRoaXMuX3ZlcnNpb25BbmRFbmdpbmVDb21wYXRpYmxlKGZpbHRlcikpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8VGFza1tdPihbXSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dldEdyb3VwZWRUYXNrcyhmaWx0ZXIsIHRydWUsIHRydWUpLnRoZW4oKG1hcCkgPT4gdGhpcy5hcHBseUZpbHRlclRvVGFza01hcChmaWx0ZXIsIG1hcCkpO1xuXHR9XG5cblx0cHVibGljIHRhc2tUeXBlcygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgdHlwZXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHRoaXMuX2lzUHJvdmlkZVRhc2tzRW5hYmxlZCgpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRlZmluaXRpb24gb2YgVGFza0RlZmluaXRpb25SZWdpc3RyeS5hbGwoKSkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNUYXNrUHJvdmlkZXJFbmFibGVkKGRlZmluaXRpb24udGFza1R5cGUpKSB7XG5cdFx0XHRcdFx0dHlwZXMucHVzaChkZWZpbml0aW9uLnRhc2tUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZXM7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU29ydGVyKCk6IFRhc2tTb3J0ZXIge1xuXHRcdHJldHVybiBuZXcgVGFza1NvcnRlcih0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSA/IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMgOiBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0FjdGl2ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFza1N5c3RlbS5pc0FjdGl2ZSgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEFjdGl2ZVRhc2tzKCk6IFByb21pc2U8VGFza1tdPiB7XG5cdFx0aWYgKCF0aGlzLl90YXNrU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtLmdldEFjdGl2ZVRhc2tzKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0QnVzeVRhc2tzKCk6IFByb21pc2U8VGFza1tdPiB7XG5cdFx0aWYgKCF0aGlzLl90YXNrU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtLmdldEJ1c3lUYXNrcygpO1xuXHR9XG5cblx0cHVibGljIGdldFJlY2VudGx5VXNlZFRhc2tzVjEoKTogTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRpZiAodGhpcy5fcmVjZW50bHlVc2VkVGFza3NWMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzVjE7XG5cdFx0fVxuXHRcdGNvbnN0IHF1aWNrT3Blbkhpc3RvcnlMaW1pdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oUVVJQ0tPUEVOX0hJU1RPUllfTElNSVRfQ09ORklHKTtcblx0XHR0aGlzLl9yZWNlbnRseVVzZWRUYXNrc1YxID0gbmV3IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPihxdWlja09wZW5IaXN0b3J5TGltaXQpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVZhbHVlID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KEFic3RyYWN0VGFza1NlcnZpY2UuUmVjZW50bHlVc2VkVGFza3NfS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoc3RvcmFnZVZhbHVlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZXM6IHN0cmluZ1tdID0gSlNPTi5wYXJzZShzdG9yYWdlVmFsdWUpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzVjEuc2V0KHZhbHVlLCB2YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBJZ25vcmUuIFdlIHVzZSB0aGUgZW1wdHkgcmVzdWx0XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZWNlbnRseVVzZWRUYXNrc1YxO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUZpbHRlclRvVGFza01hcChmaWx0ZXI6IElUYXNrRmlsdGVyIHwgdW5kZWZpbmVkLCBtYXA6IFRhc2tNYXApOiBUYXNrW10ge1xuXHRcdGlmICghZmlsdGVyIHx8ICFmaWx0ZXIudHlwZSkge1xuXHRcdFx0cmV0dXJuIG1hcC5hbGwoKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBUYXNrW10gPSBbXTtcblx0XHRtYXAuZm9yRWFjaCgodGFza3MpID0+IHtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spICYmICgodGFzay5kZWZpbmVzLnR5cGUgPT09IGZpbHRlci50eXBlKSB8fCAodGFzay5fc291cmNlLmxhYmVsID09PSBmaWx0ZXIudHlwZSkpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdGlmICh0YXNrLnR5cGUgPT09IGZpbHRlci50eXBlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VzdG9taXplcyA9IHRhc2suY3VzdG9taXplcygpO1xuXHRcdFx0XHRcdFx0aWYgKGN1c3RvbWl6ZXMgJiYgY3VzdG9taXplcy50eXBlID09PSBmaWx0ZXIudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGFza3NGcm9tU3RvcmFnZSh0eXBlOiAncGVyc2lzdGVudCcgfCAnaGlzdG9yaWNhbCcpOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdHJldHVybiB0eXBlID09PSAncGVyc2lzdGVudCcgPyB0aGlzLl9nZXRQZXJzaXN0ZW50VGFza3MoKSA6IHRoaXMuX2dldFJlY2VudFRhc2tzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZWNlbnRUYXNrcygpOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9yZWNlbnRseVVzZWRUYXNrcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzO1xuXHRcdH1cblx0XHRjb25zdCBxdWlja09wZW5IaXN0b3J5TGltaXQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFFVSUNLT1BFTl9ISVNUT1JZX0xJTUlUX0NPTkZJRyk7XG5cdFx0dGhpcy5fcmVjZW50bHlVc2VkVGFza3MgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+KHF1aWNrT3Blbkhpc3RvcnlMaW1pdCk7XG5cblx0XHRjb25zdCBzdG9yYWdlVmFsdWUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQWJzdHJhY3RUYXNrU2VydmljZS5SZWNlbnRseVVzZWRUYXNrc19LZXlWMiwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKHN0b3JhZ2VWYWx1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdmFsdWVzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBKU09OLnBhcnNlKHN0b3JhZ2VWYWx1ZSk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVjZW50bHlVc2VkVGFza3Muc2V0KHZhbHVlWzBdLCB2YWx1ZVsxXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBJZ25vcmUuIFdlIHVzZSB0aGUgZW1wdHkgcmVzdWx0XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZWNlbnRseVVzZWRUYXNrcztcblx0fVxuXG5cdHByaXZhdGUgX2dldFBlcnNpc3RlbnRUYXNrcygpOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9wZXJzaXN0ZW50VGFza3MpIHtcblx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLmdldHRpbmdDYWNoZWRUYXNrcycsICdSZXR1cm5pbmcgY2FjaGVkIHRhc2tzIHswfScsIHRoaXMuX3BlcnNpc3RlbnRUYXNrcy5zaXplKSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGVyc2lzdGVudFRhc2tzO1xuXHRcdH1cblx0XHQvL1RPRE86IHNob3VsZCB0aGlzICMgYmUgY29uZmlndXJhYmxlP1xuXHRcdHRoaXMuX3BlcnNpc3RlbnRUYXNrcyA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4oMTApO1xuXHRcdGNvbnN0IHN0b3JhZ2VWYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChBYnN0cmFjdFRhc2tTZXJ2aWNlLlBlcnNpc3RlbnRUYXNrc19LZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChzdG9yYWdlVmFsdWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlczogW3N0cmluZywgc3RyaW5nXVtdID0gSlNPTi5wYXJzZShzdG9yYWdlVmFsdWUpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3BlcnNpc3RlbnRUYXNrcy5zZXQodmFsdWVbMF0sIHZhbHVlWzFdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIElnbm9yZS4gV2UgdXNlIHRoZSBlbXB0eSByZXN1bHRcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BlcnNpc3RlbnRUYXNrcztcblx0fVxuXG5cdHByaXZhdGUgX2dldEZvbGRlckZyb21UYXNrS2V5KGtleTogc3RyaW5nKTogeyBmb2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDsgaXNXb3Jrc3BhY2VGaWxlOiBib29sZWFuIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IGtleVZhbHVlOiB7IGZvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkOyBpZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gPSBKU09OLnBhcnNlKGtleSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZvbGRlcjoga2V5VmFsdWUuZm9sZGVyLCBpc1dvcmtzcGFjZUZpbGU6IGtleVZhbHVlLmlkPy5lbmRzV2l0aChUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0U2F2ZWRUYXNrcyh0eXBlOiAncGVyc2lzdGVudCcgfCAnaGlzdG9yaWNhbCcpOiBQcm9taXNlPChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdPiB7XG5cdFx0Y29uc3QgZm9sZGVyTWFwOiBJU3RyaW5nRGljdGlvbmFyeTxJV29ya3NwYWNlRm9sZGVyPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy53b3Jrc3BhY2VGb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcblx0XHRcdGZvbGRlck1hcFtmb2xkZXIudXJpLnRvU3RyaW5nKCldID0gZm9sZGVyO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGZvbGRlclRvVGFza3NNYXA6IE1hcDxzdHJpbmcsIChUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrKVtdPiA9IG5ldyBNYXAoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VUb1Rhc2tNYXA6IE1hcDxzdHJpbmcsIChUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrKVtdPiA9IG5ldyBNYXAoKTtcblx0XHRjb25zdCBzdG9yZWRUYXNrcyA9IHRoaXMuX2dldFRhc2tzRnJvbVN0b3JhZ2UodHlwZSk7XG5cdFx0Y29uc3QgdGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdID0gW107XG5cdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UuZ2V0U2F2ZWRUYXNrcycsICdGZXRjaGluZyB0YXNrcyBmcm9tIHRhc2sgc3RvcmFnZS4nKSwgdHJ1ZSk7XG5cdFx0ZnVuY3Rpb24gYWRkVGFza1RvTWFwKG1hcDogTWFwPHN0cmluZywgKFRhc2tDb25maWcuSUN1c3RvbVRhc2sgfCBUYXNrQ29uZmlnLklDb25maWd1cmluZ1Rhc2spW10+LCBmb2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCwgdGFzazogVGFza0NvbmZpZy5JQ3VzdG9tVGFzayB8IFRhc2tDb25maWcuSUNvbmZpZ3VyaW5nVGFzaykge1xuXHRcdFx0aWYgKGZvbGRlciAmJiAhbWFwLmhhcyhmb2xkZXIpKSB7XG5cdFx0XHRcdG1hcC5zZXQoZm9sZGVyLCBbXSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZm9sZGVyICYmIChmb2xkZXJNYXBbZm9sZGVyXSB8fCAoZm9sZGVyID09PSBVU0VSX1RBU0tTX0dST1VQX0tFWSkpICYmIHRhc2spIHtcblx0XHRcdFx0bWFwLmdldChmb2xkZXIpIS5wdXNoKHRhc2spO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHN0b3JlZFRhc2tzLmVudHJpZXMoKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gZW50cnlbMF07XG5cdFx0XHRcdGNvbnN0IHRhc2sgPSBKU09OLnBhcnNlKGVudHJ5WzFdKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVySW5mbyA9IHRoaXMuX2dldEZvbGRlckZyb21UYXNrS2V5KGtleSk7XG5cdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLmdldFNhdmVkVGFza3MucmVhZGluZycsICdSZWFkaW5nIHRhc2tzIGZyb20gdGFzayBzdG9yYWdlLCB7MH0sIHsxfSwgezJ9Jywga2V5LCB0YXNrLCBmb2xkZXJJbmZvLmZvbGRlciksIHRydWUpO1xuXHRcdFx0XHRhZGRUYXNrVG9NYXAoZm9sZGVySW5mby5pc1dvcmtzcGFjZUZpbGUgPyB3b3Jrc3BhY2VUb1Rhc2tNYXAgOiBmb2xkZXJUb1Rhc2tzTWFwLCBmb2xkZXJJbmZvLmZvbGRlciwgdGFzayk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCd0YXNrU2VydmljZS5nZXRTYXZlZFRhc2tzLmVycm9yJywgJ0ZldGNoaW5nIGEgdGFzayBmcm9tIHRhc2sgc3RvcmFnZSBmYWlsZWQ6IHswfS4nLCBlcnJvciksIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlYWRUYXNrc01hcDogTWFwPHN0cmluZywgKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spPiA9IG5ldyBNYXAoKTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHJlYWRUYXNrcyh0aGF0OiBBYnN0cmFjdFRhc2tTZXJ2aWNlLCBtYXA6IE1hcDxzdHJpbmcsIChUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrKVtdPiwgaXNXb3Jrc3BhY2VGaWxlOiBib29sZWFuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBtYXAua2V5cygpKSB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbTogQ3VzdG9tVGFza1tdID0gW107XG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PENvbmZpZ3VyaW5nVGFzaz4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHRjb25zdCB0YXNrQ29uZmlnU291cmNlID0gKGZvbGRlck1hcFtrZXldXG5cdFx0XHRcdFx0PyAoaXNXb3Jrc3BhY2VGaWxlXG5cdFx0XHRcdFx0XHQ/IFRhc2tDb25maWcuVGFza0NvbmZpZ1NvdXJjZS5Xb3Jrc3BhY2VGaWxlIDogVGFza0NvbmZpZy5UYXNrQ29uZmlnU291cmNlLlRhc2tzSnNvbilcblx0XHRcdFx0XHQ6IFRhc2tDb25maWcuVGFza0NvbmZpZ1NvdXJjZS5Vc2VyKTtcblx0XHRcdFx0YXdhaXQgdGhhdC5fY29tcHV0ZVRhc2tzRm9yU2luZ2xlQ29uZmlnKGZvbGRlck1hcFtrZXldID8/IGF3YWl0IHRoYXQuX2dldEFGb2xkZXIoKSwge1xuXHRcdFx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHRcdFx0dGFza3M6IG1hcC5nZXQoa2V5KVxuXHRcdFx0XHR9LCBUYXNrUnVuU291cmNlLlN5c3RlbSwgY3VzdG9tLCBjdXN0b21pemVkLCB0YXNrQ29uZmlnU291cmNlLCB0cnVlKTtcblx0XHRcdFx0Y3VzdG9tLmZvckVhY2godGFzayA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGFza0tleSA9IHRhc2suZ2V0S2V5KCk7XG5cdFx0XHRcdFx0aWYgKHRhc2tLZXkpIHtcblx0XHRcdFx0XHRcdHJlYWRUYXNrc01hcC5zZXQodGFza0tleSwgdGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIE9iamVjdC5rZXlzKGN1c3RvbWl6ZWQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFza0tleSA9IGN1c3RvbWl6ZWRbY29uZmlndXJhdGlvbl0uZ2V0S2V5KCk7XG5cdFx0XHRcdFx0aWYgKHRhc2tLZXkpIHtcblx0XHRcdFx0XHRcdHJlYWRUYXNrc01hcC5zZXQodGFza0tleSwgY3VzdG9taXplZFtjb25maWd1cmF0aW9uXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHJlYWRUYXNrcyh0aGlzLCBmb2xkZXJUb1Rhc2tzTWFwLCBmYWxzZSk7XG5cdFx0YXdhaXQgcmVhZFRhc2tzKHRoaXMsIHdvcmtzcGFjZVRvVGFza01hcCwgdHJ1ZSk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Ygc3RvcmVkVGFza3Mua2V5cygpKSB7XG5cdFx0XHRpZiAocmVhZFRhc2tzTWFwLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHRhc2tzLnB1c2gocmVhZFRhc2tzTWFwLmdldChrZXkpISk7XG5cdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLmdldFNhdmVkVGFza3MucmVzb2x2ZWQnLCAnUmVzb2x2ZWQgdGFzayB7MH0nLCBrZXkpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLmdldFNhdmVkVGFza3MudW5yZXNvbHZlZCcsICdVbmFibGUgdG8gcmVzb2x2ZSB0YXNrIHswfSAnLCBrZXkpLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRhc2tzO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVJlY2VudGx5VXNlZFRhc2sodGFza1JlY2VudGx5VXNlZEtleTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2dldFRhc2tzRnJvbVN0b3JhZ2UoJ2hpc3RvcmljYWwnKS5kZWxldGUodGFza1JlY2VudGx5VXNlZEtleSkpIHtcblx0XHRcdHRoaXMuX3NhdmVSZWNlbnRseVVzZWRUYXNrcygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW1vdmVQZXJzaXN0ZW50VGFzayhrZXk6IHN0cmluZykge1xuXHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLnJlbW92ZVBlcnNpc3RlbnRUYXNrJywgJ1JlbW92aW5nIHBlcnNpc3RlbnQgdGFzayB7MH0nLCBrZXkpLCB0cnVlKTtcblx0XHRpZiAodGhpcy5fZ2V0VGFza3NGcm9tU3RvcmFnZSgncGVyc2lzdGVudCcpLmRlbGV0ZShrZXkpKSB7XG5cdFx0XHR0aGlzLl9zYXZlUGVyc2lzdGVudFRhc2tzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VGFza0xSVUNhY2hlTGltaXQoKSB7XG5cdFx0Y29uc3QgcXVpY2tPcGVuSGlzdG9yeUxpbWl0ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihRVUlDS09QRU5fSElTVE9SWV9MSU1JVF9DT05GSUcpO1xuXHRcdGlmICh0aGlzLl9yZWNlbnRseVVzZWRUYXNrcykge1xuXHRcdFx0dGhpcy5fcmVjZW50bHlVc2VkVGFza3MubGltaXQgPSBxdWlja09wZW5IaXN0b3J5TGltaXQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2V0UmVjZW50bHlVc2VkVGFzayh0YXNrOiBUYXNrKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGtleSA9IHRhc2suZ2V0S2V5KCk7XG5cdFx0aWYgKCFJbk1lbW9yeVRhc2suaXModGFzaykgJiYga2V5KSB7XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IHRoaXMuX2NyZWF0ZUN1c3RvbWl6YWJsZVRhc2sodGFzayk7XG5cdFx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spICYmIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbTogQ3VzdG9tVGFza1tdID0gW107XG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PENvbmZpZ3VyaW5nVGFzaz4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWcodGFzay5fc291cmNlLndvcmtzcGFjZUZvbGRlciA/PyB0aGlzLndvcmtzcGFjZUZvbGRlcnNbMF0sIHtcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0XHRcdHRhc2tzOiBbY3VzdG9taXphdGlvbnNdXG5cdFx0XHRcdH0sIFRhc2tSdW5Tb3VyY2UuU3lzdGVtLCBjdXN0b20sIGN1c3RvbWl6ZWQsIFRhc2tDb25maWcuVGFza0NvbmZpZ1NvdXJjZS5UYXNrc0pzb24sIHRydWUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb24gb2YgT2JqZWN0LmtleXMoY3VzdG9taXplZCkpIHtcblx0XHRcdFx0XHRrZXkgPSBjdXN0b21pemVkW2NvbmZpZ3VyYXRpb25dLmdldEtleSgpITtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZ2V0VGFza3NGcm9tU3RvcmFnZSgnaGlzdG9yaWNhbCcpLnNldChrZXksIEpTT04uc3RyaW5naWZ5KGN1c3RvbWl6YXRpb25zKSk7XG5cdFx0XHR0aGlzLl9zYXZlUmVjZW50bHlVc2VkVGFza3MoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUmVjZW50bHlVc2VkVGFza3MoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9yZWNlbnRseVVzZWRUYXNrcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBxdWlja09wZW5IaXN0b3J5TGltaXQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFFVSUNLT1BFTl9ISVNUT1JZX0xJTUlUX0NPTkZJRyk7XG5cdFx0Ly8gc2V0dGluZyBoaXN0b3J5IGxpbWl0IHRvIDAgbWVhbnMgbm8gTFJVIHNvcnRpbmdcblx0XHRpZiAocXVpY2tPcGVuSGlzdG9yeUxpbWl0ID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBrZXlzID0gWy4uLnRoaXMuX3JlY2VudGx5VXNlZFRhc2tzLmtleXMoKV07XG5cdFx0aWYgKGtleXMubGVuZ3RoID4gcXVpY2tPcGVuSGlzdG9yeUxpbWl0KSB7XG5cdFx0XHRrZXlzID0ga2V5cy5zbGljZSgwLCBxdWlja09wZW5IaXN0b3J5TGltaXQpO1xuXHRcdH1cblx0XHRjb25zdCBrZXlWYWx1ZXM6IFtzdHJpbmcsIHN0cmluZ11bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGtleVZhbHVlcy5wdXNoKFtrZXksIHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzLmdldChrZXksIFRvdWNoLk5vbmUpIV0pO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShBYnN0cmFjdFRhc2tTZXJ2aWNlLlJlY2VudGx5VXNlZFRhc2tzX0tleVYyLCBKU09OLnN0cmluZ2lmeShrZXlWYWx1ZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2V0UGVyc2lzdGVudFRhc2sodGFzazogVGFzayk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5SZWNvbm5lY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBrZXkgPSB0YXNrLmdldEtleSgpO1xuXHRcdGlmICghSW5NZW1vcnlUYXNrLmlzKHRhc2spICYmIGtleSkge1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSB0aGlzLl9jcmVhdGVDdXN0b21pemFibGVUYXNrKHRhc2spO1xuXHRcdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSAmJiBjdXN0b21pemF0aW9ucykge1xuXHRcdFx0XHRjb25zdCBjdXN0b206IEN1c3RvbVRhc2tbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBjdXN0b21pemVkOiBJU3RyaW5nRGljdGlvbmFyeTxDb25maWd1cmluZ1Rhc2s+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29tcHV0ZVRhc2tzRm9yU2luZ2xlQ29uZmlnKHRhc2suX3NvdXJjZS53b3Jrc3BhY2VGb2xkZXIgPz8gdGhpcy53b3Jrc3BhY2VGb2xkZXJzWzBdLCB7XG5cdFx0XHRcdFx0dmVyc2lvbjogJzIuMC4wJyxcblx0XHRcdFx0XHR0YXNrczogW2N1c3RvbWl6YXRpb25zXVxuXHRcdFx0XHR9LCBUYXNrUnVuU291cmNlLlN5c3RlbSwgY3VzdG9tLCBjdXN0b21pemVkLCBUYXNrQ29uZmlnLlRhc2tDb25maWdTb3VyY2UuVGFza3NKc29uLCB0cnVlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIE9iamVjdC5rZXlzKGN1c3RvbWl6ZWQpKSB7XG5cdFx0XHRcdFx0a2V5ID0gY3VzdG9taXplZFtjb25maWd1cmF0aW9uXS5nZXRLZXkoKSE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2Uuc2V0UGVyc2lzdGVudFRhc2snLCAnU2V0dGluZyBwZXJzaXN0ZW50IHRhc2sgezB9Jywga2V5KSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9nZXRUYXNrc0Zyb21TdG9yYWdlKCdwZXJzaXN0ZW50Jykuc2V0KGtleSwgSlNPTi5zdHJpbmdpZnkoY3VzdG9taXphdGlvbnMpKTtcblx0XHRcdHRoaXMuX3NhdmVQZXJzaXN0ZW50VGFza3MoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUGVyc2lzdGVudFRhc2tzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RlbnRUYXNrcyA9IHRoaXMuX2dldFRhc2tzRnJvbVN0b3JhZ2UoJ3BlcnNpc3RlbnQnKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLnRoaXMuX3BlcnNpc3RlbnRUYXNrcy5rZXlzKCldO1xuXHRcdGNvbnN0IGtleVZhbHVlczogW3N0cmluZywgc3RyaW5nXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0a2V5VmFsdWVzLnB1c2goW2tleSwgdGhpcy5fcGVyc2lzdGVudFRhc2tzLmdldChrZXksIFRvdWNoLk5vbmUpIV0pO1xuXHRcdH1cblx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdzYXZlUGVyc2lzdGVudFRhc2snLCAnU2F2aW5nIHBlcnNpc3RlbnQgdGFza3M6IHswfScsIGtleXMuam9pbignLCAnKSksIHRydWUpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFic3RyYWN0VGFza1NlcnZpY2UuUGVyc2lzdGVudFRhc2tzX0tleSwgSlNPTi5zdHJpbmdpZnkoa2V5VmFsdWVzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5Eb2N1bWVudGF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL3Rhc2tzI19kZWZpbmluZy1hLXByb2JsZW0tbWF0Y2hlcicpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRTaW5nbGVXb3Jrc3BhY2VUYXNrT2ZHcm91cChncm91cDogVGFza0dyb3VwKTogUHJvbWlzZTxJVGFza1N1bW1hcnkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0YXNrc09mR3JvdXAgPSBhd2FpdCB0aGlzLl9maW5kV29ya3NwYWNlVGFza3NJbkdyb3VwKGdyb3VwLCB0cnVlKTtcblx0XHRpZiAoKHRhc2tzT2ZHcm91cC5sZW5ndGggPT09IDEpICYmICh0eXBlb2YgdGFza3NPZkdyb3VwWzBdLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwICE9PSAnc3RyaW5nJykgJiYgdGFza3NPZkdyb3VwWzBdLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwPy5pc0RlZmF1bHQpIHtcblx0XHRcdGxldCByZXNvbHZlZFRhc2s6IFRhc2sgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoQ29uZmlndXJpbmdUYXNrLmlzKHRhc2tzT2ZHcm91cFswXSkpIHtcblx0XHRcdFx0cmVzb2x2ZWRUYXNrID0gYXdhaXQgdGhpcy50cnlSZXNvbHZlVGFzayh0YXNrc09mR3JvdXBbMF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZWRUYXNrID0gdGFza3NPZkdyb3VwWzBdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc29sdmVkVGFzaykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5ydW4ocmVzb2x2ZWRUYXNrLCB1bmRlZmluZWQsIFRhc2tSdW5Tb3VyY2UuVXNlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9idWlsZCgpOiBQcm9taXNlPElUYXNrU3VtbWFyeT4ge1xuXHRcdGNvbnN0IHRyeUJ1aWxkU2hvcnRjdXQgPSBhd2FpdCB0aGlzLl9maW5kU2luZ2xlV29ya3NwYWNlVGFza09mR3JvdXAoVGFza0dyb3VwLkJ1aWxkKTtcblx0XHRpZiAodHJ5QnVpbGRTaG9ydGN1dCkge1xuXHRcdFx0cmV0dXJuIHRyeUJ1aWxkU2hvcnRjdXQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRHcm91cGVkVGFza3NBbmRFeGVjdXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5UZXN0KCk6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0Y29uc3QgdHJ5VGVzdFNob3J0Y3V0ID0gYXdhaXQgdGhpcy5fZmluZFNpbmdsZVdvcmtzcGFjZVRhc2tPZkdyb3VwKFRhc2tHcm91cC5UZXN0KTtcblx0XHRpZiAodHJ5VGVzdFNob3J0Y3V0KSB7XG5cdFx0XHRyZXR1cm4gdHJ5VGVzdFNob3J0Y3V0O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9nZXRHcm91cGVkVGFza3NBbmRFeGVjdXRlKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0R3JvdXBlZFRhc2tzQW5kRXhlY3V0ZSh0ZXN0PzogYm9vbGVhbik6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0Y29uc3QgdGFza3MgPSBhd2FpdCB0aGlzLl9nZXRHcm91cGVkVGFza3MoKTtcblx0XHRjb25zdCBydW5uYWJsZSA9IHRoaXMuX2NyZWF0ZVJ1bm5hYmxlVGFzayh0YXNrcywgdGVzdCA/IFRhc2tHcm91cC5UZXN0IDogVGFza0dyb3VwLkJ1aWxkKTtcblx0XHRpZiAoIXJ1bm5hYmxlIHx8ICFydW5uYWJsZS50YXNrKSB7XG5cdFx0XHRpZiAodGVzdCkge1xuXHRcdFx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMF8xXzApIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5LkluZm8sIG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9UZXN0VGFzazEnLCAnTm8gdGVzdCB0YXNrIGRlZmluZWQuIE1hcmsgYSB0YXNrIHdpdGggXFwnaXNUZXN0Q29tbWFuZFxcJyBpbiB0aGUgdGFza3MuanNvbiBmaWxlLicpLCBUYXNrRXJyb3JzLk5vVGVzdFRhc2spO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBUYXNrRXJyb3IoU2V2ZXJpdHkuSW5mbywgbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub1Rlc3RUYXNrMicsICdObyB0ZXN0IHRhc2sgZGVmaW5lZC4gTWFyayBhIHRhc2sgd2l0aCBhcyBhIFxcJ3Rlc3RcXCcgZ3JvdXAgaW4gdGhlIHRhc2tzLmpzb24gZmlsZS4nKSwgVGFza0Vycm9ycy5Ob1Rlc3RUYXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuc2NoZW1hVmVyc2lvbiA9PT0gSnNvblNjaGVtYVZlcnNpb24uVjBfMV8wKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5JbmZvLCBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vQnVpbGRUYXNrMScsICdObyBidWlsZCB0YXNrIGRlZmluZWQuIE1hcmsgYSB0YXNrIHdpdGggXFwnaXNCdWlsZENvbW1hbmRcXCcgaW4gdGhlIHRhc2tzLmpzb24gZmlsZS4nKSwgVGFza0Vycm9ycy5Ob0J1aWxkVGFzayk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5JbmZvLCBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vQnVpbGRUYXNrMicsICdObyBidWlsZCB0YXNrIGRlZmluZWQuIE1hcmsgYSB0YXNrIHdpdGggYXMgYSBcXCdidWlsZFxcJyBncm91cCBpbiB0aGUgdGFza3MuanNvbiBmaWxlLicpLCBUYXNrRXJyb3JzLk5vQnVpbGRUYXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgZXhlY3V0ZVRhc2tSZXN1bHQ6IElUYXNrU3VtbWFyeTtcblx0XHR0cnkge1xuXHRcdFx0ZXhlY3V0ZVRhc2tSZXN1bHQgPSBhd2FpdCB0aGlzLl9leGVjdXRlVGFzayhydW5uYWJsZS50YXNrLCBydW5uYWJsZS5yZXNvbHZlciwgVGFza1J1blNvdXJjZS5Vc2VyKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5faGFuZGxlRXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4ZWN1dGVUYXNrUmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bih0YXNrOiBUYXNrIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVByb2JsZW1NYXRjaGVyUnVuT3B0aW9ucywgcnVuU291cmNlOiBUYXNrUnVuU291cmNlID0gVGFza1J1blNvdXJjZS5TeXN0ZW0pOiBQcm9taXNlPElUYXNrU3VtbWFyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGFzaykge1xuXHRcdFx0dGhyb3cgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5JbmZvLCBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2ZXIubm9UYXNrJywgJ1Rhc2sgdG8gZXhlY3V0ZSBpcyB1bmRlZmluZWQnKSwgVGFza0Vycm9ycy5UYXNrTm90Rm91bmQpO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlciA9IHRoaXMuX2NyZWF0ZVJlc29sdmVyKCk7XG5cdFx0bGV0IGV4ZWN1dGVUYXNrUmVzdWx0OiBJVGFza1N1bW1hcnkgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChvcHRpb25zICYmIG9wdGlvbnMuYXR0YWNoUHJvYmxlbU1hdGNoZXIgJiYgdGhpcy5fc2hvdWxkQXR0YWNoUHJvYmxlbU1hdGNoZXIodGFzaykgJiYgIUluTWVtb3J5VGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRjb25zdCB0YXNrVG9FeGVjdXRlID0gYXdhaXQgdGhpcy5fYXR0YWNoUHJvYmxlbU1hdGNoZXIodGFzayk7XG5cdFx0XHRcdGlmICh0YXNrVG9FeGVjdXRlKSB7XG5cdFx0XHRcdFx0ZXhlY3V0ZVRhc2tSZXN1bHQgPSBhd2FpdCB0aGlzLl9leGVjdXRlVGFzayh0YXNrVG9FeGVjdXRlLCByZXNvbHZlciwgcnVuU291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXhlY3V0ZVRhc2tSZXN1bHQgPSBhd2FpdCB0aGlzLl9leGVjdXRlVGFzayh0YXNrLCByZXNvbHZlciwgcnVuU291cmNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleGVjdXRlVGFza1Jlc3VsdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5faGFuZGxlRXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1Byb3ZpZGVUYXNrc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2V0dGluZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5BdXRvRGV0ZWN0KTtcblx0XHRyZXR1cm4gc2V0dGluZ1ZhbHVlID09PSAnb24nO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNQcm9ibGVtTWF0Y2hlclByb21wdEVuYWJsZWQodHlwZT86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBST0JMRU1fTUFUQ0hFUl9ORVZFUl9DT05GSUcpO1xuXHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4oc2V0dGluZ1ZhbHVlKSkge1xuXHRcdFx0cmV0dXJuICFzZXR0aW5nVmFsdWU7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBzZXR0aW5nVmFsdWVNYXA6IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+ID0gc2V0dGluZ1ZhbHVlIGFzIElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+O1xuXHRcdHJldHVybiAhc2V0dGluZ1ZhbHVlTWFwW3R5cGVdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHlwZUZvclRhc2sodGFzazogVGFzayk6IHN0cmluZyB7XG5cdFx0bGV0IHR5cGU6IHN0cmluZztcblx0XHRpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0Y29uc3QgY29uZmlnUHJvcGVydGllcyA9IHRhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCBhcyBUYXNrQ29uZmlnLklDdXN0b21UYXNrO1xuXHRcdFx0dHlwZSA9IGNvbmZpZ1Byb3BlcnRpZXMudHlwZSA/PyAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHlwZSA9IHRhc2suZ2V0RGVmaW5pdGlvbigpIS50eXBlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEF0dGFjaFByb2JsZW1NYXRjaGVyKHRhc2s6IFRhc2spOiBib29sZWFuIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5faXNQcm9ibGVtTWF0Y2hlclByb21wdEVuYWJsZWQodGhpcy5fZ2V0VHlwZUZvclRhc2sodGFzaykpO1xuXHRcdGlmIChlbmFibGVkID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2NhbkN1c3RvbWl6ZSh0YXNrKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCAhPT0gdW5kZWZpbmVkICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgIT09IFRhc2tHcm91cC5CdWlsZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMgIT09IHVuZGVmaW5lZCAmJiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChDb250cmlidXRlZFRhc2suaXModGFzaykpIHtcblx0XHRcdHJldHVybiAhdGFzay5oYXNEZWZpbmVkTWF0Y2hlcnMgJiYgISF0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyAmJiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMubGVuZ3RoID09PSAwKTtcblx0XHR9XG5cdFx0aWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ1Byb3BlcnRpZXMgPSB0YXNrLl9zb3VyY2UuY29uZmlnLmVsZW1lbnQgYXMgVGFza0NvbmZpZy5JQ29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cdFx0XHRyZXR1cm4gY29uZmlnUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlciA9PT0gdW5kZWZpbmVkICYmICF0YXNrLmhhc0RlZmluZWRNYXRjaGVycztcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlTmV2ZXJQcm9ibGVtTWF0Y2hlclNldHRpbmcodHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBST0JMRU1fTUFUQ0hFUl9ORVZFUl9DT05GSUcpO1xuXHRcdGlmIChjdXJyZW50ID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBuZXdWYWx1ZTogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj47XG5cdFx0aWYgKGN1cnJlbnQgIT09IGZhbHNlKSB7XG5cdFx0XHRuZXdWYWx1ZSA9IGN1cnJlbnQgYXMgSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj47XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1ZhbHVlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR9XG5cdFx0bmV3VmFsdWVbdHlwZV0gPSB0cnVlO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShQUk9CTEVNX01BVENIRVJfTkVWRVJfQ09ORklHLCBuZXdWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hdHRhY2hQcm9ibGVtTWF0Y2hlcih0YXNrOiBDb250cmlidXRlZFRhc2sgfCBDdXN0b21UYXNrKTogUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkPiB7XG5cdFx0aW50ZXJmYWNlIElQcm9ibGVtTWF0Y2hlclBpY2tFbnRyeSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdG1hdGNoZXI6IElOYW1lZFByb2JsZW1NYXRjaGVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bmV2ZXI/OiBib29sZWFuO1xuXHRcdFx0bGVhcm5Nb3JlPzogYm9vbGVhbjtcblx0XHRcdHNldHRpbmc/OiBzdHJpbmc7XG5cdFx0fVxuXHRcdGxldCBlbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxJUHJvYmxlbU1hdGNoZXJQaWNrRW50cnk+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmtleXMoKSkge1xuXHRcdFx0Y29uc3QgbWF0Y2hlciA9IFByb2JsZW1NYXRjaGVyUmVnaXN0cnkuZ2V0KGtleSk7XG5cdFx0XHRpZiAobWF0Y2hlci5kZXByZWNhdGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1hdGNoZXIubmFtZSA9PT0gbWF0Y2hlci5sYWJlbCkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBsYWJlbDogbWF0Y2hlci5uYW1lLCBtYXRjaGVyOiBtYXRjaGVyIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbWF0Y2hlci5sYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYCQke21hdGNoZXIubmFtZX1gLFxuXHRcdFx0XHRcdG1hdGNoZXI6IG1hdGNoZXJcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbnRyaWVzID0gZW50cmllcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5sYWJlbCAmJiBiLmxhYmVsKSB7XG5cdFx0XHRcdHJldHVybiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRlbnRyaWVzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuYXNzb2NpYXRlJywgJ2Fzc29jaWF0ZScpIH0pO1xuXHRcdGxldCB0YXNrVHlwZTogc3RyaW5nO1xuXHRcdGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRjb25zdCBjb25maWdQcm9wZXJ0aWVzID0gdGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50IGFzIFRhc2tDb25maWcuSUN1c3RvbVRhc2s7XG5cdFx0XHR0YXNrVHlwZSA9IGNvbmZpZ1Byb3BlcnRpZXMudHlwZSA/PyAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFza1R5cGUgPSB0YXNrLmdldERlZmluaXRpb24oKS50eXBlO1xuXHRcdH1cblx0XHRlbnRyaWVzLnVuc2hpZnQoXG5cdFx0XHR7IGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmF0dGFjaFByb2JsZW1NYXRjaGVyLmNvbnRpbnVlV2l0aG91dCcsICdDb250aW51ZSB3aXRob3V0IHNjYW5uaW5nIHRoZSB0YXNrIG91dHB1dCcpLCBtYXRjaGVyOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuYXR0YWNoUHJvYmxlbU1hdGNoZXIubmV2ZXInLCAnTmV2ZXIgc2NhbiB0aGUgdGFzayBvdXRwdXQgZm9yIHRoaXMgdGFzaycpLCBtYXRjaGVyOiB1bmRlZmluZWQsIG5ldmVyOiB0cnVlIH0sXG5cdFx0XHR7IGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmF0dGFjaFByb2JsZW1NYXRjaGVyLm5ldmVyVHlwZScsICdOZXZlciBzY2FuIHRoZSB0YXNrIG91dHB1dCBmb3IgezB9IHRhc2tzJywgdGFza1R5cGUpLCBtYXRjaGVyOiB1bmRlZmluZWQsIHNldHRpbmc6IHRhc2tUeXBlIH0sXG5cdFx0XHR7IGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmF0dGFjaFByb2JsZW1NYXRjaGVyLmxlYXJuTW9yZUFib3V0JywgJ0xlYXJuIG1vcmUgYWJvdXQgc2Nhbm5pbmcgdGhlIHRhc2sgb3V0cHV0JyksIG1hdGNoZXI6IHVuZGVmaW5lZCwgbGVhcm5Nb3JlOiB0cnVlIH1cblx0XHQpO1xuXHRcdGNvbnN0IHByb2JsZW1NYXRjaGVyID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhlbnRyaWVzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3NlbGVjdFByb2JsZW1NYXRjaGVyJywgJ1NlbGVjdCBmb3Igd2hpY2gga2luZCBvZiBlcnJvcnMgYW5kIHdhcm5pbmdzIHRvIHNjYW4gdGhlIHRhc2sgb3V0cHV0JykgfSk7XG5cdFx0aWYgKCFwcm9ibGVtTWF0Y2hlcikge1xuXHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0fVxuXHRcdGlmIChwcm9ibGVtTWF0Y2hlci5sZWFybk1vcmUpIHtcblx0XHRcdHRoaXMuX29wZW5Eb2N1bWVudGF0aW9uKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAocHJvYmxlbU1hdGNoZXIubmV2ZXIpIHtcblx0XHRcdHRoaXMuY3VzdG9taXplKHRhc2ssIHsgcHJvYmxlbU1hdGNoZXI6IFtdIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0fVxuXHRcdGlmIChwcm9ibGVtTWF0Y2hlci5tYXRjaGVyKSB7XG5cdFx0XHRjb25zdCBuZXdUYXNrID0gdGFzay5jbG9uZSgpO1xuXHRcdFx0Y29uc3QgbWF0Y2hlclJlZmVyZW5jZSA9IGAkJHtwcm9ibGVtTWF0Y2hlci5tYXRjaGVyLm5hbWV9YDtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXM6IElDdXN0b21pemF0aW9uUHJvcGVydGllcyA9IHsgcHJvYmxlbU1hdGNoZXI6IFttYXRjaGVyUmVmZXJlbmNlXSB9O1xuXHRcdFx0bmV3VGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMgPSBbbWF0Y2hlclJlZmVyZW5jZV07XG5cdFx0XHRjb25zdCBtYXRjaGVyID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQocHJvYmxlbU1hdGNoZXIubWF0Y2hlci5uYW1lKTtcblx0XHRcdGlmIChtYXRjaGVyICYmIG1hdGNoZXIud2F0Y2hpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdG5ld1Rhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY3VzdG9taXplKHRhc2ssIHByb3BlcnRpZXMsIHRydWUpO1xuXHRcdFx0cmV0dXJuIG5ld1Rhc2s7XG5cdFx0fVxuXHRcdGlmIChwcm9ibGVtTWF0Y2hlci5zZXR0aW5nKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVOZXZlclByb2JsZW1NYXRjaGVyU2V0dGluZyhwcm9ibGVtTWF0Y2hlci5zZXR0aW5nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRhc2s7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUYXNrc0Zvckdyb3VwKGdyb3VwOiBUYXNrR3JvdXAsIHdhaXRUb0FjdGl2YXRlPzogYm9vbGVhbik6IFByb21pc2U8VGFza1tdPiB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYXdhaXQgdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKHVuZGVmaW5lZCwgd2FpdFRvQWN0aXZhdGUpO1xuXHRcdGNvbnN0IHJlc3VsdDogVGFza1tdID0gW107XG5cdFx0Z3JvdXBzLmZvckVhY2godGFza3MgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1Rhc2tHcm91cCA9IFRhc2tHcm91cC5mcm9tKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApO1xuXHRcdFx0XHRpZiAoY29uZmlnVGFza0dyb3VwPy5faWQgPT09IGdyb3VwLl9pZCkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBuZWVkc0ZvbGRlclF1YWxpZmljYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbkN1c3RvbWl6ZSh0YXNrOiBUYXNrKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuc2NoZW1hVmVyc2lvbiAhPT0gSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0cmV0dXJuICEhdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZm9ybWF0VGFza0Zvckpzb24ocmVzb3VyY2U6IFVSSSwgdGFzazogVGFza0NvbmZpZy5JQ3VzdG9tVGFzayB8IFRhc2tDb25maWcuSUNvbmZpZ3VyaW5nVGFzayk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0bGV0IHJlZmVyZW5jZTogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzdHJpbmdWYWx1ZTogc3RyaW5nID0gJyc7XG5cdFx0dHJ5IHtcblx0XHRcdHJlZmVyZW5jZSA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0Y29uc3QgeyB0YWJTaXplLCBpbnNlcnRTcGFjZXMgfSA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRcdGNvbnN0IGVvbCA9IG1vZGVsLmdldEVPTCgpO1xuXHRcdFx0bGV0IHN0cmluZ2lmaWVkID0gdG9Gb3JtYXR0ZWRTdHJpbmcodGFzaywgeyBlb2wsIHRhYlNpemUsIGluc2VydFNwYWNlcyB9KTtcblx0XHRcdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChlb2wgKyAoaW5zZXJ0U3BhY2VzID8gJyAnLnJlcGVhdCh0YWJTaXplKSA6ICdcXFxcdCcpLCAnZycpO1xuXHRcdFx0c3RyaW5naWZpZWQgPSBzdHJpbmdpZmllZC5yZXBsYWNlKHJlZ2V4LCBlb2wgKyAoaW5zZXJ0U3BhY2VzID8gJyAnLnJlcGVhdCh0YWJTaXplICogMykgOiAnXFx0XFx0XFx0JykpO1xuXHRcdFx0Y29uc3QgdHdvVGFicyA9IGluc2VydFNwYWNlcyA/ICcgJy5yZXBlYXQodGFiU2l6ZSAqIDIpIDogJ1xcdFxcdCc7XG5cdFx0XHRzdHJpbmdWYWx1ZSA9IHR3b1RhYnMgKyBzdHJpbmdpZmllZC5zbGljZSgwLCBzdHJpbmdpZmllZC5sZW5ndGggLSAxKSArIHR3b1RhYnMgKyBzdHJpbmdpZmllZC5zbGljZShzdHJpbmdpZmllZC5sZW5ndGggLSAxKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmZXJlbmNlPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHJpbmdWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5FZGl0b3JBdFRhc2socmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdGFzazogVGFza0NvbmZpZy5JQ3VzdG9tVGFzayB8IFRhc2tDb25maWcuSUNvbmZpZ3VyaW5nVGFzayB8IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlnSW5kZXg6IG51bWJlciA9IC0xKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHJlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdH1cblx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRjb25zdCBjb250ZW50ID0gZmlsZUNvbnRlbnQudmFsdWU7XG5cdFx0aWYgKCFjb250ZW50IHx8ICF0YXNrKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnRWYWx1ZSA9IGNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRsZXQgc3RyaW5nVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29uZmlnSW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBqc29uOiBUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VGFza0NvbmZpZy5JRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbj4oJ3Rhc2tzJywgeyByZXNvdXJjZSB9KTtcblx0XHRcdGlmIChqc29uLnRhc2tzICYmIChqc29uLnRhc2tzLmxlbmd0aCA+IGNvbmZpZ0luZGV4KSkge1xuXHRcdFx0XHRzdHJpbmdWYWx1ZSA9IGF3YWl0IHRoaXMuX2Zvcm1hdFRhc2tGb3JKc29uKHJlc291cmNlLCBqc29uLnRhc2tzW2NvbmZpZ0luZGV4XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghc3RyaW5nVmFsdWUpIHtcblx0XHRcdGlmICh0eXBlb2YgdGFzayA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0c3RyaW5nVmFsdWUgPSB0YXNrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RyaW5nVmFsdWUgPSBhd2FpdCB0aGlzLl9mb3JtYXRUYXNrRm9ySnNvbihyZXNvdXJjZSwgdGFzayk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSBjb250ZW50VmFsdWUuaW5kZXhPZihzdHJpbmdWYWx1ZSk7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IDE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbmRleDsgaSsrKSB7XG5cdFx0XHRpZiAoY29udGVudFZhbHVlLmNoYXJBdChpKSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBlbmRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3RyaW5nVmFsdWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChzdHJpbmdWYWx1ZS5jaGFyQXQoaSkgPT09ICdcXG4nKSB7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gc3RhcnRMaW5lTnVtYmVyID4gMSA/IHsgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogc3RhcnRMaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyID8gNCA6IDMsIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogc3RhcnRMaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyID8gdW5kZWZpbmVkIDogNCB9IDogdW5kZWZpbmVkO1xuXG5cdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRwaW5uZWQ6IGZhbHNlLFxuXHRcdFx0XHRmb3JjZVJlbG9hZDogdHJ1ZSwgLy8gYmVjYXVzZSBjb250ZW50IG1pZ2h0IGhhdmUgY2hhbmdlZFxuXHRcdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuICEhc2VsZWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQ3VzdG9taXphYmxlVGFzayh0YXNrOiBDb250cmlidXRlZFRhc2sgfCBDdXN0b21UYXNrIHwgQ29uZmlndXJpbmdUYXNrKTogVGFza0NvbmZpZy5JQ3VzdG9tVGFzayB8IFRhc2tDb25maWcuSUNvbmZpZ3VyaW5nVGFzayB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHRvQ3VzdG9taXplOiBUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRhc2tDb25maWcgPSBDdXN0b21UYXNrLmlzKHRhc2spIHx8IENvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSA/IHRhc2suX3NvdXJjZS5jb25maWcgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhc2tDb25maWcgJiYgdGFza0NvbmZpZy5lbGVtZW50KSB7XG5cdFx0XHR0b0N1c3RvbWl6ZSA9IHsgLi4uKHRhc2tDb25maWcuZWxlbWVudCkgfTtcblx0XHR9IGVsc2UgaWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0dG9DdXN0b21pemUgPSB7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllcjogVGFza0NvbmZpZy5JVGFza0lkZW50aWZpZXIgPSBPYmplY3QuYXNzaWduKE9iamVjdC5jcmVhdGUobnVsbCksIHRhc2suZGVmaW5lcyk7XG5cdFx0XHRkZWxldGUgaWRlbnRpZmllclsnX2tleSddO1xuXHRcdFx0T2JqZWN0LmtleXMoaWRlbnRpZmllcikuZm9yRWFjaChrZXkgPT4gKHRvQ3VzdG9taXplIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIVtrZXldID0gaWRlbnRpZmllcltrZXldKTtcblx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyAmJiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycy5sZW5ndGggPiAwICYmIFR5cGVzLmlzU3RyaW5nQXJyYXkodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMpKSB7XG5cdFx0XHRcdHRvQ3VzdG9taXplLnByb2JsZW1NYXRjaGVyID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnM7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCkge1xuXHRcdFx0XHR0b0N1c3RvbWl6ZS5ncm91cCA9IFRhc2tDb25maWcuR3JvdXBLaW5kLnRvKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXRvQ3VzdG9taXplKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodG9DdXN0b21pemUucHJvYmxlbU1hdGNoZXIgPT09IHVuZGVmaW5lZCAmJiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyA9PT0gdW5kZWZpbmVkIHx8ICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyAmJiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHR0b0N1c3RvbWl6ZS5wcm9ibGVtTWF0Y2hlciA9IFtdO1xuXHRcdH1cblx0XHRpZiAodGFzay5fc291cmNlLmxhYmVsICE9PSAnV29ya3NwYWNlJykge1xuXHRcdFx0dG9DdXN0b21pemUubGFiZWwgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvQ3VzdG9taXplLmxhYmVsID0gdGFzay5fbGFiZWw7XG5cdFx0fVxuXHRcdHRvQ3VzdG9taXplLmRldGFpbCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGV0YWlsO1xuXHRcdHJldHVybiB0b0N1c3RvbWl6ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjdXN0b21pemUodGFzazogQ29udHJpYnV0ZWRUYXNrIHwgQ3VzdG9tVGFzayB8IENvbmZpZ3VyaW5nVGFzaywgcHJvcGVydGllcz86IElDdXN0b21pemF0aW9uUHJvcGVydGllcywgb3BlbkNvbmZpZz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl90cnVzdCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuX2dldENvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyLCB0YXNrLl9zb3VyY2Uua2luZCk7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uaGFzUGFyc2VFcnJvcnMpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ2N1c3RvbWl6ZVBhcnNlRXJyb3JzJywgJ1RoZSBjdXJyZW50IHRhc2sgY29uZmlndXJhdGlvbiBoYXMgZXJyb3JzLiBQbGVhc2UgZml4IHRoZSBlcnJvcnMgZmlyc3QgYmVmb3JlIGN1c3RvbWl6aW5nIGEgdGFzay4nKSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlPHZvaWQ+KHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZUNvbmZpZyA9IGNvbmZpZ3VyYXRpb24uY29uZmlnO1xuXHRcdGNvbnN0IHRvQ3VzdG9taXplID0gdGhpcy5fY3JlYXRlQ3VzdG9taXphYmxlVGFzayh0YXNrKTtcblx0XHRpZiAoIXRvQ3VzdG9taXplKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQgPSBDdXN0b21UYXNrLmlzKHRhc2spID8gdGFzay5fc291cmNlLmNvbmZpZy5pbmRleCA6IHVuZGVmaW5lZDtcblx0XHRpZiAocHJvcGVydGllcykge1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhwcm9wZXJ0aWVzKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IChwcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwcm9wZXJ0eV07XG5cdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0KHRvQ3VzdG9taXplIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Byb3BlcnR5XSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFmaWxlQ29uZmlnKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHtcblx0XHRcdFx0dmVyc2lvbjogJzIuMC4wJyxcblx0XHRcdFx0dGFza3M6IFt0b0N1c3RvbWl6ZV1cblx0XHRcdH07XG5cdFx0XHRsZXQgY29udGVudCA9IFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Rhc2tzSnNvbkNvbW1lbnQnLCAnXFx0Ly8gU2VlIGh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD03MzM1NTggXFxuXFx0Ly8gZm9yIHRoZSBkb2N1bWVudGF0aW9uIGFib3V0IHRoZSB0YXNrcy5qc29uIGZvcm1hdCcpLFxuXHRcdFx0XS5qb2luKCdcXG4nKSArIEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCAnXFx0Jykuc3Vic3RyKDEpO1xuXHRcdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBlZGl0b3I6IHsgaW5zZXJ0U3BhY2VzOiBib29sZWFuOyB0YWJTaXplOiBudW1iZXIgfSB9PigpO1xuXHRcdFx0aWYgKGVkaXRvckNvbmZpZy5lZGl0b3IuaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRcdGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLyhcXG4pKFxcdCspL2csIChfLCBzMSwgczIpID0+IHMxICsgJyAnLnJlcGVhdChzMi5sZW5ndGggKiBlZGl0b3JDb25maWcuZWRpdG9yLnRhYlNpemUpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX3RleHRGaWxlU2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2U6IHdvcmtzcGFjZUZvbGRlci50b1Jlc291cmNlKCcudnNjb2RlL3Rhc2tzLmpzb24nKSwgdmFsdWU6IGNvbnRlbnQgfV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBXZSBoYXZlIGEgZ2xvYmFsIHRhc2sgY29uZmlndXJhdGlvblxuXHRcdFx0aWYgKChpbmRleCA9PT0gLTEpICYmIHByb3BlcnRpZXMpIHtcblx0XHRcdFx0aWYgKHByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGZpbGVDb25maWcucHJvYmxlbU1hdGNoZXIgPSBwcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVyO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIsICd0YXNrcy5wcm9ibGVtTWF0Y2hlcnMnLCBmaWxlQ29uZmlnLnByb2JsZW1NYXRjaGVyLCB0YXNrLl9zb3VyY2Uua2luZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJvcGVydGllcy5ncm91cCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZmlsZUNvbmZpZy5ncm91cCA9IHByb3BlcnRpZXMuZ3JvdXA7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fd3JpdGVDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlciwgJ3Rhc2tzLmdyb3VwJywgZmlsZUNvbmZpZy5ncm91cCwgdGFzay5fc291cmNlLmtpbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZmlsZUNvbmZpZy50YXNrcykpIHtcblx0XHRcdFx0XHRmaWxlQ29uZmlnLnRhc2tzID0gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRmaWxlQ29uZmlnLnRhc2tzLnB1c2godG9DdXN0b21pemUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZpbGVDb25maWcudGFza3NbaW5kZXhdID0gdG9DdXN0b21pemU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5fd3JpdGVDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlciwgJ3Rhc2tzLnRhc2tzJywgZmlsZUNvbmZpZy50YXNrcywgdGFzay5fc291cmNlLmtpbmQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcGVuQ29uZmlnKSB7XG5cdFx0XHR0aGlzLl9vcGVuRWRpdG9yQXRUYXNrKHRoaXMuX2dldFJlc291cmNlRm9yVGFzayh0YXNrKSwgdG9DdXN0b21pemUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgc291cmNlPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHNvdXJjZSkge1xuXHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Vc2VyOiB0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7IGJyZWFrO1xuXHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlOiB0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiBpZiAodGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRcdHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdFx0dGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSwgeyByZXNvdXJjZTogd29ya3NwYWNlRm9sZGVyLnVyaSB9LCB0YXJnZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFJlc291cmNlRm9yS2luZChraW5kOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX3VwZGF0ZVNldHVwKCk7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIFRhc2tTb3VyY2VLaW5kLlVzZXI6IHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlcy5qb2luUGF0aChyZXNvdXJjZXMuZGlybmFtZSh0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2UudXNlclNldHRpbmdzUmVzb3VyY2UpLCAndGFza3MuanNvbicpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlOiB7XG5cdFx0XHRcdGlmICh0aGlzLl93b3Jrc3BhY2UgJiYgdGhpcy5fd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlLmNvbmZpZ3VyYXRpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXNvdXJjZUZvclRhc2sodGFzazogQ3VzdG9tVGFzayB8IENvbmZpZ3VyaW5nVGFzayB8IENvbnRyaWJ1dGVkVGFzayk6IFVSSSB7XG5cdFx0aWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdGxldCB1cmkgPSB0aGlzLl9nZXRSZXNvdXJjZUZvcktpbmQodGFzay5fc291cmNlLmtpbmQpO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0Y29uc3QgdGFza0ZvbGRlciA9IHRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCk7XG5cdFx0XHRcdGlmICh0YXNrRm9sZGVyKSB7XG5cdFx0XHRcdFx0dXJpID0gdGFza0ZvbGRlci50b1Jlc291cmNlKHRhc2suX3NvdXJjZS5jb25maWcuZmlsZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dXJpID0gdGhpcy53b3Jrc3BhY2VGb2xkZXJzWzBdLnVyaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCkhLnRvUmVzb3VyY2UoJy52c2NvZGUvdGFza3MuanNvbicpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBvcGVuQ29uZmlnKHRhc2s6IEN1c3RvbVRhc2sgfCBDb25maWd1cmluZ1Rhc2sgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGFzaykge1xuXHRcdFx0cmVzb3VyY2UgPSB0aGlzLl9nZXRSZXNvdXJjZUZvclRhc2sodGFzayk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlID0gKHRoaXMuX3dvcmtzcGFjZUZvbGRlcnMgJiYgKHRoaXMuX3dvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID4gMCkpID8gdGhpcy5fd29ya3NwYWNlRm9sZGVyc1swXS50b1Jlc291cmNlKCcudnNjb2RlL3Rhc2tzLmpzb24nKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX29wZW5FZGl0b3JBdFRhc2socmVzb3VyY2UsIHRhc2sgPyB0YXNrLl9sYWJlbCA6IHVuZGVmaW5lZCwgdGFzayA/IHRhc2suX3NvdXJjZS5jb25maWcuaW5kZXggOiAtMSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSdW5uYWJsZVRhc2sodGFza3M6IFRhc2tNYXAsIGdyb3VwOiBUYXNrR3JvdXApOiB7IHRhc2s6IFRhc2s7IHJlc29sdmVyOiBJVGFza1Jlc29sdmVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGludGVyZmFjZSBJUmVzb2x2ZXJEYXRhIHtcblx0XHRcdGlkOiBNYXA8c3RyaW5nLCBUYXNrPjtcblx0XHRcdGxhYmVsOiBNYXA8c3RyaW5nLCBUYXNrPjtcblx0XHRcdGlkZW50aWZpZXI6IE1hcDxzdHJpbmcsIFRhc2s+O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVyRGF0YTogTWFwPHN0cmluZywgSVJlc29sdmVyRGF0YT4gPSBuZXcgTWFwKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVGFza3M6IFRhc2tbXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvblRhc2tzOiBUYXNrW10gPSBbXTtcblx0XHR0YXNrcy5mb3JFYWNoKCh0YXNrcywgZm9sZGVyKSA9PiB7XG5cdFx0XHRsZXQgZGF0YSA9IHJlc29sdmVyRGF0YS5nZXQoZm9sZGVyKTtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRkYXRhID0ge1xuXHRcdFx0XHRcdGlkOiBuZXcgTWFwPHN0cmluZywgVGFzaz4oKSxcblx0XHRcdFx0XHRsYWJlbDogbmV3IE1hcDxzdHJpbmcsIFRhc2s+KCksXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogbmV3IE1hcDxzdHJpbmcsIFRhc2s+KClcblx0XHRcdFx0fTtcblx0XHRcdFx0cmVzb2x2ZXJEYXRhLnNldChmb2xkZXIsIGRhdGEpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdGRhdGEuaWQuc2V0KHRhc2suX2lkLCB0YXNrKTtcblx0XHRcdFx0ZGF0YS5sYWJlbC5zZXQodGFzay5fbGFiZWwsIHRhc2spO1xuXHRcdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdFx0ZGF0YS5pZGVudGlmaWVyLnNldCh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXIsIHRhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChncm91cCAmJiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID09PSBncm91cCkge1xuXHRcdFx0XHRcdGlmICh0YXNrLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VUYXNrcy5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25UYXNrcy5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc29sdmVyOiBJVGFza1Jlc29sdmVyID0ge1xuXHRcdFx0cmVzb2x2ZTogYXN5bmMgKHVyaTogVVJJIHwgc3RyaW5nLCBhbGlhczogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSByZXNvbHZlckRhdGEuZ2V0KHR5cGVvZiB1cmkgPT09ICdzdHJpbmcnID8gdXJpIDogdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkYXRhLmlkLmdldChhbGlhcykgfHwgZGF0YS5sYWJlbC5nZXQoYWxpYXMpIHx8IGRhdGEuaWRlbnRpZmllci5nZXQoYWxpYXMpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0aWYgKHdvcmtzcGFjZVRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICh3b3Jrc3BhY2VUYXNrcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ21vcmVUaGFuT25lQnVpbGRUYXNrJywgJ1RoZXJlIGFyZSBtYW55IGJ1aWxkIHRhc2tzIGRlZmluZWQgaW4gdGhlIHRhc2tzLmpzb24uIEV4ZWN1dGluZyB0aGUgZmlyc3Qgb25lLicpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHRhc2s6IHdvcmtzcGFjZVRhc2tzWzBdLCByZXNvbHZlciB9O1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uVGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFdlIGNhbiBvbmx5IGhhdmUgZXh0ZW5zaW9uIHRhc2tzIGlmIHdlIGFyZSBpbiB2ZXJzaW9uIDIuMC4wLiBUaGVuIHdlIGNhbiBldmVuIHJ1blxuXHRcdC8vIG11bHRpcGxlIGJ1aWxkIHRhc2tzLlxuXHRcdGlmIChleHRlbnNpb25UYXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiB7IHRhc2s6IGV4dGVuc2lvblRhc2tzWzBdLCByZXNvbHZlciB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpZDogc3RyaW5nID0gVVVJRC5nZW5lcmF0ZVV1aWQoKTtcblx0XHRcdGNvbnN0IHRhc2s6IEluTWVtb3J5VGFzayA9IG5ldyBJbk1lbW9yeVRhc2soXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR7IGtpbmQ6IFRhc2tTb3VyY2VLaW5kLkluTWVtb3J5LCBsYWJlbDogJ2luTWVtb3J5JyB9LFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0J2luTWVtb3J5Jyxcblx0XHRcdFx0eyByZWV2YWx1YXRlT25SZXJ1bjogdHJ1ZSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWRlbnRpZmllcjogaWQsXG5cdFx0XHRcdFx0ZGVwZW5kc09uOiBleHRlbnNpb25UYXNrcy5tYXAoKGV4dGVuc2lvblRhc2spID0+IHsgcmV0dXJuIHsgdXJpOiBleHRlbnNpb25UYXNrLmdldFdvcmtzcGFjZUZvbGRlcigpIS51cmksIHRhc2s6IGV4dGVuc2lvblRhc2suX2lkIH07IH0pLFxuXHRcdFx0XHRcdG5hbWU6IGlkXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4geyB0YXNrLCByZXNvbHZlciB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJlc29sdmVyKGdyb3VwZWQ/OiBUYXNrTWFwKTogSVRhc2tSZXNvbHZlciB7XG5cdFx0aW50ZXJmYWNlIFJlc29sdmVyRGF0YSB7XG5cdFx0XHRsYWJlbDogTWFwPHN0cmluZywgVGFzaz47XG5cdFx0XHRpZGVudGlmaWVyOiBNYXA8c3RyaW5nLCBUYXNrPjtcblx0XHRcdHRhc2tJZGVudGlmaWVyOiBNYXA8c3RyaW5nLCBUYXNrPjtcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZXJEYXRhOiBNYXA8c3RyaW5nLCBSZXNvbHZlckRhdGE+IHwgdW5kZWZpbmVkO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gcXVpY2tSZXNvbHZlKHRoYXQ6IEFic3RyYWN0VGFza1NlcnZpY2UsIHVyaTogVVJJIHwgc3RyaW5nLCBpZGVudGlmaWVyOiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpIHtcblx0XHRcdGNvbnN0IGZvdW5kVGFza3MgPSBhd2FpdCB0aGF0Ll9maW5kV29ya3NwYWNlVGFza3MoKHRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2spOiBib29sZWFuID0+IHtcblx0XHRcdFx0Y29uc3QgdGFza1VyaSA9ICgoQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spIHx8IEN1c3RvbVRhc2suaXModGFzaykpID8gdGFzay5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2VGb2xkZXI/LnVyaSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gKHR5cGVvZiB1cmkgPT09ICdzdHJpbmcnID8gdXJpIDogdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAodGFza1VyaT8udG9TdHJpbmcoKSAhPT0gb3JpZ2luYWxVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuICgodGFzay5fbGFiZWwgPT09IGlkZW50aWZpZXIpIHx8ICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXIgPT09IGlkZW50aWZpZXIpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBrZXllZElkZW50aWZpZXIgPSB0YXNrLmdldERlZmluaXRpb24odHJ1ZSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VhcmNoSWRlbnRpZmllciA9IFRhc2tEZWZpbml0aW9uLmNyZWF0ZVRhc2tJZGVudGlmaWVyKGlkZW50aWZpZXIsIGNvbnNvbGUpO1xuXHRcdFx0XHRcdHJldHVybiAoc2VhcmNoSWRlbnRpZmllciAmJiBrZXllZElkZW50aWZpZXIpID8gKHNlYXJjaElkZW50aWZpZXIuX2tleSA9PT0ga2V5ZWRJZGVudGlmaWVyLl9rZXkpIDogZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKGZvdW5kVGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXNrID0gZm91bmRUYXNrc1swXTtcblx0XHRcdGlmIChDb25maWd1cmluZ1Rhc2suaXModGFzaykpIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQudHJ5UmVzb2x2ZVRhc2sodGFzayk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFzaztcblx0XHR9XG5cblx0XHRhc3luYyBmdW5jdGlvbiBnZXRSZXNvbHZlckRhdGEodGhhdDogQWJzdHJhY3RUYXNrU2VydmljZSkge1xuXHRcdFx0aWYgKHJlc29sdmVyRGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlc29sdmVyRGF0YSA9IG5ldyBNYXAoKTtcblx0XHRcdFx0KGdyb3VwZWQgfHwgYXdhaXQgdGhhdC5fZ2V0R3JvdXBlZFRhc2tzKCkpLmZvckVhY2goKHRhc2tzLCBmb2xkZXIpID0+IHtcblx0XHRcdFx0XHRsZXQgZGF0YSA9IHJlc29sdmVyRGF0YSEuZ2V0KGZvbGRlcik7XG5cdFx0XHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdFx0XHRkYXRhID0geyBsYWJlbDogbmV3IE1hcDxzdHJpbmcsIFRhc2s+KCksIGlkZW50aWZpZXI6IG5ldyBNYXA8c3RyaW5nLCBUYXNrPigpLCB0YXNrSWRlbnRpZmllcjogbmV3IE1hcDxzdHJpbmcsIFRhc2s+KCkgfTtcblx0XHRcdFx0XHRcdHJlc29sdmVyRGF0YSEuc2V0KGZvbGRlciwgZGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdFx0ZGF0YS5sYWJlbC5zZXQodGFzay5fbGFiZWwsIHRhc2spO1xuXHRcdFx0XHRcdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllcikge1xuXHRcdFx0XHRcdFx0XHRkYXRhLmlkZW50aWZpZXIuc2V0KHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciwgdGFzayk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBrZXllZElkZW50aWZpZXIgPSB0YXNrLmdldERlZmluaXRpb24odHJ1ZSk7XG5cdFx0XHRcdFx0XHRpZiAoa2V5ZWRJZGVudGlmaWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0ZGF0YS50YXNrSWRlbnRpZmllci5zZXQoa2V5ZWRJZGVudGlmaWVyLl9rZXksIHRhc2spO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZXJEYXRhO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGZ1bGxSZXNvbHZlKHRoYXQ6IEFic3RyYWN0VGFza1NlcnZpY2UsIHVyaTogVVJJIHwgc3RyaW5nLCBpZGVudGlmaWVyOiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpIHtcblx0XHRcdGNvbnN0IGFsbFJlc29sdmVyRGF0YSA9IGF3YWl0IGdldFJlc29sdmVyRGF0YSh0aGF0KTtcblx0XHRcdGNvbnN0IGRhdGEgPSBhbGxSZXNvbHZlckRhdGEuZ2V0KHR5cGVvZiB1cmkgPT09ICdzdHJpbmcnID8gdXJpIDogdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoaWRlbnRpZmllcikpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEubGFiZWwuZ2V0KGlkZW50aWZpZXIpIHx8IGRhdGEuaWRlbnRpZmllci5nZXQoaWRlbnRpZmllcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBUYXNrRGVmaW5pdGlvbi5jcmVhdGVUYXNrSWRlbnRpZmllcihpZGVudGlmaWVyLCBjb25zb2xlKTtcblx0XHRcdFx0cmV0dXJuIGtleSAhPT0gdW5kZWZpbmVkID8gZGF0YS50YXNrSWRlbnRpZmllci5nZXQoa2V5Ll9rZXkpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvbHZlOiBhc3luYyAodXJpOiBVUkkgfCBzdHJpbmcsIGlkZW50aWZpZXI6IHN0cmluZyB8IElUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlkZW50aWZpZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICgocmVzb2x2ZXJEYXRhID09PSB1bmRlZmluZWQpICYmIChncm91cGVkID09PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIChhd2FpdCBxdWlja1Jlc29sdmUodGhpcywgdXJpLCBpZGVudGlmaWVyKSkgPz8gZnVsbFJlc29sdmUodGhpcywgdXJpLCBpZGVudGlmaWVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gZnVsbFJlc29sdmUodGhpcywgdXJpLCBpZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zYXZlQmVmb3JlUnVuKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGVudW0gU2F2ZUJlZm9yZVJ1bkNvbmZpZ09wdGlvbnMge1xuXHRcdFx0QWx3YXlzID0gJ2Fsd2F5cycsXG5cdFx0XHROZXZlciA9ICduZXZlcicsXG5cdFx0XHRQcm9tcHQgPSAncHJvbXB0J1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhdmVCZWZvcmVSdW5UYXNrQ29uZmlnOiBTYXZlQmVmb3JlUnVuQ29uZmlnT3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tTZXR0aW5nSWQuU2F2ZUJlZm9yZVJ1bik7XG5cblx0XHRpZiAoc2F2ZUJlZm9yZVJ1blRhc2tDb25maWcgPT09IFNhdmVCZWZvcmVSdW5Db25maWdPcHRpb25zLk5ldmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChzYXZlQmVmb3JlUnVuVGFza0NvbmZpZyA9PT0gU2F2ZUJlZm9yZVJ1bkNvbmZpZ09wdGlvbnMuUHJvbXB0ICYmIHRoaXMuX2VkaXRvclNlcnZpY2UuZWRpdG9ycy5zb21lKGUgPT4gZS5pc0RpcnR5KCkpKSB7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLnNhdmVCZWZvcmVSdW4ucHJvbXB0LnRpdGxlJywgXCJTYXZlIGFsbCBlZGl0b3JzP1wiKSxcblx0XHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2RldGFpbCcsIFwiRG8geW91IHdhbnQgdG8gc2F2ZSBhbGwgZWRpdG9ycyBiZWZvcmUgcnVubmluZyB0aGUgdGFzaz9cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3NhdmVCZWZvcmVSdW4uc2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmU2F2ZScpLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3NhdmVCZWZvcmVSdW4uZG9udFNhdmUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRG8mJm4ndCBTYXZlXCIpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5zYXZlQWxsKHsgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZVRhc2sodGFzazogVGFzaywgcmVzb2x2ZXI6IElUYXNrUmVzb2x2ZXIsIHJ1blNvdXJjZTogVGFza1J1blNvdXJjZSk6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0bGV0IHRhc2tUb1J1bjogVGFzayA9IHRhc2s7XG5cdFx0aWYgKGF3YWl0IHRoaXMuX3NhdmVCZWZvcmVSdW4oKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UucmVsb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlV29ya3NwYWNlVGFza3MoKTtcblx0XHRcdGNvbnN0IHRhc2tGb2xkZXIgPSB0YXNrLmdldFdvcmtzcGFjZUZvbGRlcigpO1xuXHRcdFx0Y29uc3QgdGFza0lkZW50aWZpZXIgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXI7XG5cdFx0XHRjb25zdCB0YXNrVHlwZSA9IEN1c3RvbVRhc2suaXModGFzaykgPyB0YXNrLmN1c3RvbWl6ZXMoKT8udHlwZSA6IChDb250cmlidXRlZFRhc2suaXModGFzaykgPyB0YXNrLnR5cGUgOiB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gU2luY2Ugd2Ugc2F2ZSBiZWZvcmUgcnVubmluZyB0YXNrcywgdGhlIHRhc2sgbWF5IGhhdmUgY2hhbmdlZCBhcyBwYXJ0IG9mIHRoZSBzYXZlLlxuXHRcdFx0Ly8gSG93ZXZlciwgaWYgdGhlIFRhc2tSdW5Tb3VyY2UgaXMgbm90IFVzZXIsIHRoZW4gd2Ugc2hvdWxkbid0IHRyeSB0byBmZXRjaCB0aGUgdGFzayBhZ2FpblxuXHRcdFx0Ly8gc2luY2UgdGhpcyBjYW4gY2F1c2UgYSBuZXcnZCB0YXNrIHRvIGdldCBvdmVyd3JpdHRlbiB3aXRoIGEgcHJvdmlkZWQgdGFzay5cblx0XHRcdHRhc2tUb1J1biA9ICgodGFza0ZvbGRlciAmJiB0YXNrSWRlbnRpZmllciAmJiAocnVuU291cmNlID09PSBUYXNrUnVuU291cmNlLlVzZXIpKVxuXHRcdFx0XHQ/IGF3YWl0IHRoaXMuZ2V0VGFzayh0YXNrRm9sZGVyLCB0YXNrSWRlbnRpZmllciwgZmFsc2UsIHRhc2tUeXBlKSA6IHRhc2spID8/IHRhc2s7XG5cdFx0fVxuXHRcdGF3YWl0IFByb2JsZW1NYXRjaGVyUmVnaXN0cnkub25SZWFkeSgpO1xuXHRcdGNvbnN0IGV4ZWN1dGVSZXN1bHQgPSBydW5Tb3VyY2UgPT09IFRhc2tSdW5Tb3VyY2UuUmVjb25uZWN0ID8gdGhpcy5fZ2V0VGFza1N5c3RlbSgpLnJlY29ubmVjdCh0YXNrVG9SdW4sIHJlc29sdmVyKSA6IHRoaXMuX2dldFRhc2tTeXN0ZW0oKS5ydW4odGFza1RvUnVuLCByZXNvbHZlcik7XG5cdFx0aWYgKGV4ZWN1dGVSZXN1bHQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVFeGVjdXRlUmVzdWx0KGV4ZWN1dGVSZXN1bHQsIHJ1blNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGV4aXRDb2RlOiAwIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFeGVjdXRlUmVzdWx0KGV4ZWN1dGVSZXN1bHQ6IElUYXNrRXhlY3V0ZVJlc3VsdCwgcnVuU291cmNlPzogVGFza1J1blNvdXJjZSk6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0aWYgKHJ1blNvdXJjZSAmJiBleGVjdXRlUmVzdWx0LnRhc2suX2lkKSB7XG5cdFx0XHR0aGlzLl90YXNrUnVuU291cmNlcy5zZXQoZXhlY3V0ZVJlc3VsdC50YXNrLl9pZCwgcnVuU291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAocnVuU291cmNlID09PSBUYXNrUnVuU291cmNlLlVzZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3NldFJlY2VudGx5VXNlZFRhc2soZXhlY3V0ZVJlc3VsdC50YXNrKTtcblx0XHR9XG5cdFx0aWYgKGV4ZWN1dGVSZXN1bHQua2luZCA9PT0gVGFza0V4ZWN1dGVLaW5kLkFjdGl2ZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gZXhlY3V0ZVJlc3VsdC5hY3RpdmU7XG5cdFx0XHRpZiAoYWN0aXZlICYmIGFjdGl2ZS5zYW1lICYmIHJ1blNvdXJjZSA9PT0gVGFza1J1blNvdXJjZS5Gb2xkZXJPcGVuIHx8IHJ1blNvdXJjZSA9PT0gVGFza1J1blNvdXJjZS5SZWNvbm5lY3QpIHtcblx0XHRcdFx0Ly8gaWdub3JlLCB0aGUgdGFzayBpcyBhbHJlYWR5IGFjdGl2ZSwgbGlrZWx5IGZyb20gYmVpbmcgcmVjb25uZWN0ZWQgb3IgZnJvbSBmb2xkZXIgb3Blbi5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnSWdub3JpbmcgdGFzayB0aGF0IGlzIGFscmVhZHkgYWN0aXZlJywgZXhlY3V0ZVJlc3VsdC50YXNrKTtcblx0XHRcdFx0cmV0dXJuIGV4ZWN1dGVSZXN1bHQucHJvbWlzZTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3RpdmUgJiYgYWN0aXZlLnNhbWUpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlSW5zdGFuY2VQb2xpY3koZXhlY3V0ZVJlc3VsdC50YXNrLCBleGVjdXRlUmVzdWx0LnRhc2sucnVuT3B0aW9ucyEuaW5zdGFuY2VQb2xpY3kpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5XYXJuaW5nLCBubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0uYWN0aXZlJywgJ1RoZXJlIGlzIGFscmVhZHkgYSB0YXNrIHJ1bm5pbmcuIFRlcm1pbmF0ZSBpdCBmaXJzdCBiZWZvcmUgZXhlY3V0aW5nIGFub3RoZXIgdGFzay4nKSwgVGFza0Vycm9ycy5SdW5uaW5nVGFzayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NldFJlY2VudGx5VXNlZFRhc2soZXhlY3V0ZVJlc3VsdC50YXNrKTtcblx0XHRyZXR1cm4gZXhlY3V0ZVJlc3VsdC5wcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSW5zdGFuY2VQb2xpY3kodGFzazogVGFzaywgcG9saWN5PzogSW5zdGFuY2VQb2xpY3kpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0/LmlzVGFza1Zpc2libGUodGFzaykpIHtcblx0XHRcdHRoaXMuX3Rhc2tTeXN0ZW0/LnJldmVhbFRhc2sodGFzayk7XG5cdFx0fVxuXHRcdHN3aXRjaCAocG9saWN5KSB7XG5cdFx0XHRjYXNlIEluc3RhbmNlUG9saWN5LnRlcm1pbmF0ZU5ld2VzdDpcblx0XHRcdFx0dGhpcy5fcmVzdGFydCh0aGlzLl9nZXRUYXNrU3lzdGVtKCkuZ2V0TGFzdEluc3RhbmNlKHRhc2spID8/IHRhc2spO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSW5zdGFuY2VQb2xpY3kudGVybWluYXRlT2xkZXN0OlxuXHRcdFx0XHR0aGlzLl9yZXN0YXJ0KHRoaXMuX2dldFRhc2tTeXN0ZW0oKS5nZXRGaXJzdEluc3RhbmNlKHRhc2spID8/IHRhc2spO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSW5zdGFuY2VQb2xpY3kuc2lsZW50OlxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSW5zdGFuY2VQb2xpY3kud2Fybjpcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS5JbnN0YW5jZVBvbGljeS53YXJuJywgJ1RoZSBpbnN0YW5jZSBsaW1pdCBmb3IgdGhpcyB0YXNrIGhhcyBiZWVuIHJlYWNoZWQuJykpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSW5zdGFuY2VQb2xpY3kucHJvbXB0OlxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFt0YXNrc10gSW5zdGFuY2VQb2xpY3kucHJvbXB0IGhpdCBpbiBzZXNzaW9ucyB3aW5kb3cgZm9yIHRhc2sgJyR7dGFzay5fbGFiZWx9J1xcbiR7bmV3IEVycm9yKCkuc3RhY2t9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2hvd1F1aWNrUGljayh0aGlzLl90YXNrU3lzdGVtIS5nZXRBY3RpdmVUYXNrcygpLmZpbHRlcih0ID0+IHRhc2suX2lkID09PSB0Ll9pZCksXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5pbnN0YW5jZVRvVGVybWluYXRlJywgJ1NlbGVjdCBhbiBpbnN0YW5jZSB0byB0ZXJtaW5hdGUnKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub0luc3RhbmNlUnVubmluZycsICdObyBpbnN0YW5jZSBpcyBjdXJyZW50bHkgcnVubmluZycpLFxuXHRcdFx0XHRcdFx0dGFzazogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmYWxzZSwgdHJ1ZSxcblx0XHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdFx0KS50aGVuKGVudHJ5ID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCA9IGVudHJ5ID8gZW50cnkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAodGFzayA9PT0gdW5kZWZpbmVkIHx8IHRhc2sgPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcmVzdGFydCh0YXNrKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzdGFydCh0YXNrOiBUYXNrKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl90YXNrU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHRhc2sgaXMgY3VycmVudGx5IHJ1bm5pbmdcblx0XHRjb25zdCBpc1Rhc2tSdW5uaW5nID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVUYXNrcygpLnRoZW4odGFza3MgPT4gdGFza3Muc29tZSh0ID0+IHQuZ2V0TWFwS2V5KCkgPT09IHRhc2suZ2V0TWFwS2V5KCkpKTtcblxuXHRcdGlmIChpc1Rhc2tSdW5uaW5nKSB7XG5cdFx0XHQvLyBUYXNrIGlzIHJ1bm5pbmcsIHRlcm1pbmF0ZSBpdCBmaXJzdFxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl90YXNrU3lzdGVtLnRlcm1pbmF0ZSh0YXNrKTtcblx0XHRcdGlmICghcmVzcG9uc2Uuc3VjY2Vzcykge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLnJlc3RhcnRGYWlsZWQnLCAnRmFpbGVkIHRvIHRlcm1pbmF0ZSBhbmQgcmVzdGFydCB0YXNrIHswfScsIFR5cGVzLmlzU3RyaW5nKHRhc2spID8gdGFzayA6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGFzayBpcyBub3QgcnVubmluZyBvciB3YXMgc3VjY2Vzc2Z1bGx5IHRlcm1pbmF0ZWQsIG5vdyBydW4gaXRcblx0XHR0cnkge1xuXHRcdFx0Ly8gQmVmb3JlIHJlc3RhcnRpbmcsIGNoZWNrIGlmIHRoZSB0YXNrIHN0aWxsIGV4aXN0cyBhbmQgZ2V0IHVwZGF0ZWQgdmVyc2lvblxuXHRcdFx0Y29uc3QgdXBkYXRlZFRhc2sgPSBhd2FpdCB0aGlzLl9maW5kVXBkYXRlZFRhc2sodGFzayk7XG5cdFx0XHRpZiAodXBkYXRlZFRhc2spIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5ydW4odXBkYXRlZFRhc2spO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMucnVuKHRhc2spO1xuXHRcdFx0XHRpZiAoIXN1Y2Nlc3MgfHwgKHR5cGVvZiBzdWNjZXNzLmV4aXRDb2RlID09PSAnbnVtYmVyJyAmJiBzdWNjZXNzLmV4aXRDb2RlICE9PSAwKSkge1xuXHRcdFx0XHRcdC8vIFRhc2sgbm8gbG9uZ2VyIGV4aXN0cywgc2hvdyB3YXJuaW5nXG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS50YXNrTm9Mb25nZXJFeGlzdHMnLCAnVGFzayB7MH0gbm8gbG9uZ2VyIGV4aXN0cyBvciBoYXMgYmVlbiBtb2RpZmllZC4gQ2Fubm90IHJlc3RhcnQuJywgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGVhdCB0aGUgZXJyb3IsIHdlIGRvbid0IGNhcmUgYWJvdXQgaXQgaGVyZVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRVcGRhdGVkVGFzayhvcmlnaW5hbFRhc2s6IFRhc2spOiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtYXBTdHJpbmdUb0ZvbGRlclRhc2tzID0gYXdhaXQgdGhpcy5fdXBkYXRlV29ya3NwYWNlVGFza3MoVGFza1J1blNvdXJjZS5TeXN0ZW0pO1xuXG5cdFx0Ly8gTG9vayBmb3IgdGhlIHRhc2sgaW4gY3VycmVudCB3b3Jrc3BhY2UgY29uZmlndXJhdGlvblxuXHRcdGZvciAoY29uc3QgW18sIGZvbGRlclJlc3VsdF0gb2YgbWFwU3RyaW5nVG9Gb2xkZXJUYXNrcykge1xuXHRcdFx0aWYgKCFmb2xkZXJSZXN1bHQuc2V0Py50YXNrcz8ubGVuZ3RoICYmICFmb2xkZXJSZXN1bHQuY29uZmlndXJhdGlvbnM/LmJ5SWRlbnRpZmllcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFRoZXJlIGFyZSB0d28gd2F5cyB3aGVyZSBUYXNrIGxpdmVzOlxuXHRcdFx0Ly8gMS4gZm9sZGVyUmVzdWx0LnNldC50YXNrc1xuXHRcdFx0aWYgKGZvbGRlclJlc3VsdC5zZXQ/LnRhc2tzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBmb2xkZXJSZXN1bHQuc2V0LnRhc2tzKSB7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyB0aGUgc2FtZSB0YXNrIGJ5IElEXG5cdFx0XHRcdFx0aWYgKHRhc2suX2lkID09PSBvcmlnaW5hbFRhc2suX2lkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGFzaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIDIuIGZvbGRlclJlc3VsdC5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXJcblx0XHRcdGlmIChmb2xkZXJSZXN1bHQuY29uZmlndXJhdGlvbnM/LmJ5SWRlbnRpZmllcikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtfLCBjb25maWd1cmluZ1Rhc2tdIG9mIE9iamVjdC5lbnRyaWVzKGZvbGRlclJlc3VsdC5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyB0aGUgc2FtZSB0YXNrIGJ5IElEXG5cdFx0XHRcdFx0aWYgKGNvbmZpZ3VyaW5nVGFzay5faWQgPT09IG9yaWdpbmFsVGFzay5faWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnRyeVJlc29sdmVUYXNrKGNvbmZpZ3VyaW5nVGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGFzayB3YXNuJ3QgZm91bmQgaW4gd29ya3NwYWNlIGNvbmZpZ3VyYXRpb24sIGNoZWNrIGNvbnRyaWJ1dGVkIHRhc2tzIGZyb20gcHJvdmlkZXJzXG5cdFx0Ly8gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIHRhc2tzIGZyb20gZXh0ZW5zaW9ucyBsaWtlIG5wbSwgd2hpY2ggYXJlIENvbnRyaWJ1dGVkVGFza3Ncblx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKG9yaWdpbmFsVGFzaykpIHtcblx0XHRcdC8vIFRoZSB0eXBlIGZpbHRlciBlbnN1cmVzIG9ubHkgdGhlIG1hdGNoaW5nIHByb3ZpZGVyIGlzIGNhbGxlZCAoZS5nLiwgb25seSBucG0gcHJvdmlkZXIgZm9yIG5wbSB0YXNrcylcblx0XHRcdC8vIFRoaXMgaXMgdGhlIHNhbWUgcGF0dGVybiB1c2VkIGluIHRyeVJlc29sdmVUYXNrIGFzIGEgZmFsbGJhY2tcblx0XHRcdGNvbnN0IGFsbFRhc2tzID0gYXdhaXQgdGhpcy50YXNrcyh7IHR5cGU6IG9yaWdpbmFsVGFzay50eXBlIH0pO1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIGFsbFRhc2tzKSB7XG5cdFx0XHRcdGlmICh0YXNrLl9pZCA9PT0gb3JpZ2luYWxUYXNrLl9pZCkge1xuXHRcdFx0XHRcdHJldHVybiB0YXNrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0ZXJtaW5hdGUodGFzazogVGFzayk6IFByb21pc2U8SVRhc2tUZXJtaW5hdGVSZXNwb25zZT4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlLCB0YXNrOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHRhc2s6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFza1N5c3RlbS50ZXJtaW5hdGUodGFzayk7XG5cdH1cblxuXHRwcml2YXRlIF90ZXJtaW5hdGVBbGwoKTogUHJvbWlzZTxJVGFza1Rlcm1pbmF0ZVJlc3BvbnNlW10+IHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8SVRhc2tUZXJtaW5hdGVSZXNwb25zZVtdPihbXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtLnRlcm1pbmF0ZUFsbCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVUZXJtaW5hbFRhc2tTeXN0ZW0oKTogSVRhc2tTeXN0ZW0ge1xuXHRcdHJldHVybiBuZXcgVGVybWluYWxUYXNrU3lzdGVtKFxuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZSwgdGhpcy5fb3V0cHV0U2VydmljZSwgdGhpcy5fcGFuZUNvbXBvc2l0ZVNlcnZpY2UsIHRoaXMuX3ZpZXdzU2VydmljZSwgdGhpcy5fbWFya2VyU2VydmljZSxcblx0XHRcdHRoaXMuX21vZGVsU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRcdHRoaXMuX2NvbnRleHRTZXJ2aWNlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHRBYnN0cmFjdFRhc2tTZXJ2aWNlLk91dHB1dENoYW5uZWxJZCwgdGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSxcblx0XHRcdHRoaXMuX3BhdGhTZXJ2aWNlLCB0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHQod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0VGFza1N5c3RlbUluZm8od29ya3NwYWNlRm9sZGVyLnVyaS5zY2hlbWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3Rhc2tTeXN0ZW1JbmZvcy5zaXplID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGluZm9zID0gQXJyYXkuZnJvbSh0aGlzLl90YXNrU3lzdGVtSW5mb3MuZW50cmllcygpKTtcblx0XHRcdFx0XHRjb25zdCBub3RGaWxlID0gaW5mb3MuZmlsdGVyKGluZm8gPT4gaW5mb1swXSAhPT0gU2NoZW1hcy5maWxlKTtcblx0XHRcdFx0XHRpZiAobm90RmlsZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbm90RmlsZVswXVsxXVswXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGluZm9zWzBdWzFdWzBdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhc3luYyAodGFza0tleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdC8vIExvb2sgdXAgdGFzayBieSBpdHMgbWFwIGtleSBhY3Jvc3MgYWxsIHdvcmtzcGFjZSB0YXNrc1xuXHRcdFx0XHRjb25zdCB0YXNrTWFwID0gYXdhaXQgdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKCk7XG5cdFx0XHRcdGNvbnN0IGFsbFRhc2tzID0gdGFza01hcC5hbGwoKTtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIGFsbFRhc2tzKSB7XG5cdFx0XHRcdFx0aWYgKHRhc2suZ2V0TWFwS2V5KCkgPT09IHRhc2tLZXkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0YXNrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldFRhc2tTeXN0ZW0oKTogSVRhc2tTeXN0ZW07XG5cblx0cHJpdmF0ZSBfaXNUYXNrUHJvdmlkZXJFbmFibGVkKHR5cGU6IHN0cmluZykge1xuXHRcdGNvbnN0IGRlZmluaXRpb24gPSBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmdldCh0eXBlKTtcblx0XHRyZXR1cm4gIWRlZmluaXRpb24gfHwgIWRlZmluaXRpb24ud2hlbiB8fCB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGRlZmluaXRpb24ud2hlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRHcm91cGVkVGFza3MoZmlsdGVyPzogSVRhc2tGaWx0ZXIsIHdhaXRUb0FjdGl2YXRlPzogYm9vbGVhbiwga25vd25Pbmx5T3JUcnVzdGVkPzogYm9vbGVhbik6IFByb21pc2U8VGFza01hcD4ge1xuXHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JBbGxTdXBwb3J0ZWRFeGVjdXRpb25zO1xuXHRcdGNvbnN0IHR5cGUgPSBmaWx0ZXI/LnR5cGU7XG5cdFx0Y29uc3QgbmVlZHNSZWNlbnRUYXNrc01pZ3JhdGlvbiA9IHRoaXMuX25lZWRzUmVjZW50VGFza3NNaWdyYXRpb24oKTtcblx0XHRpZiAoIXdhaXRUb0FjdGl2YXRlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hY3RpdmF0ZVRhc2tQcm92aWRlcnMoZmlsdGVyPy50eXBlKTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsaWRUeXBlczogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFRhc2tEZWZpbml0aW9uUmVnaXN0cnkuYWxsKCkuZm9yRWFjaChkZWZpbml0aW9uID0+IHZhbGlkVHlwZXNbZGVmaW5pdGlvbi50YXNrVHlwZV0gPSB0cnVlKTtcblx0XHR2YWxpZFR5cGVzWydzaGVsbCddID0gdHJ1ZTtcblx0XHR2YWxpZFR5cGVzWydwcm9jZXNzJ10gPSB0cnVlO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkVGFza1NldHMgPSBhd2FpdCBuZXcgUHJvbWlzZTxJVGFza1NldFtdPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRhc2tTZXRbXSA9IFtdO1xuXHRcdFx0bGV0IGNvdW50ZXI6IG51bWJlciA9IDA7XG5cdFx0XHRjb25zdCBkb25lID0gKHZhbHVlOiBJVGFza1NldCB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKC0tY291bnRlciA9PT0gMCkge1xuXHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGVycm9yID0gKGVycm9yOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdFx0aWYgKGVycm9yICYmIFR5cGVzLmlzU3RyaW5nKChlcnJvciBhcyB7IG1lc3NhZ2U/OiBzdHJpbmcgfSkubWVzc2FnZSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKGBFcnJvcjogJHsoZXJyb3IgYXMgeyBtZXNzYWdlOiBzdHJpbmcgfSkubWVzc2FnZX1cXG5gKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc2hvd091dHB1dCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgKGVycm9yIGFzIHsgbWVzc2FnZTogc3RyaW5nIH0pLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKCdVbmtub3duIGVycm9yIHJlY2VpdmVkIHdoaWxlIGNvbGxlY3RpbmcgdGFza3MgZnJvbSBwcm92aWRlcnMuJyk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Nob3dPdXRwdXQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKC0tY291bnRlciA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGlmICh0aGlzLl9pc1Byb3ZpZGVUYXNrc0VuYWJsZWQoKSAmJiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApICYmICh0aGlzLl9wcm92aWRlcnMuc2l6ZSA+IDApKSB7XG5cdFx0XHRcdGxldCBmb3VuZEFueVByb3ZpZGVycyA9IGZhbHNlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIHByb3ZpZGVyXSBvZiB0aGlzLl9wcm92aWRlcnMpIHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlclR5cGUgPSB0aGlzLl9wcm92aWRlclR5cGVzLmdldChoYW5kbGUpO1xuXHRcdFx0XHRcdGlmICgodHlwZSA9PT0gdW5kZWZpbmVkKSB8fCAodHlwZSA9PT0gcHJvdmlkZXJUeXBlKSkge1xuXHRcdFx0XHRcdFx0aWYgKHByb3ZpZGVyVHlwZSAmJiAhdGhpcy5faXNUYXNrUHJvdmlkZXJFbmFibGVkKHByb3ZpZGVyVHlwZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRmb3VuZEFueVByb3ZpZGVycyA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdFx0XHRyYWNlVGltZW91dChwcm92aWRlci5wcm92aWRlVGFza3ModmFsaWRUeXBlcykudGhlbigodGFza1NldDogSVRhc2tTZXQpID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgdGFza3MgcHJvdmlkZWQgYXJlIG9mIHRoZSBjb3JyZWN0IHR5cGVcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tTZXQudGFza3MpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGFzay50eXBlICE9PSB0aGlzLl9wcm92aWRlclR5cGVzLmdldChoYW5kbGUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCd1bmV4cGVjdGVkVGFza1R5cGUnLCBcIlRoZSB0YXNrIHByb3ZpZGVyIGZvciBcXFwiezB9XFxcIiB0YXNrcyB1bmV4cGVjdGVkbHkgcHJvdmlkZWQgYSB0YXNrIG9mIHR5cGUgXFxcInsxfVxcXCIuXFxuXCIsIHRoaXMuX3Byb3ZpZGVyVHlwZXMuZ2V0KGhhbmRsZSksIHRhc2sudHlwZSkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKCh0YXNrLnR5cGUgIT09ICdzaGVsbCcpICYmICh0YXNrLnR5cGUgIT09ICdwcm9jZXNzJykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2hvd091dHB1dCgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBkb25lKHRhc2tTZXQpO1xuXHRcdFx0XHRcdFx0fSwgZXJyb3IpLCA1MDAwLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIG9uVGltZW91dFxuXHRcdFx0XHRcdFx0XHRkb25lKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFmb3VuZEFueVByb3ZpZGVycykge1xuXHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBUYXNrTWFwID0gbmV3IFRhc2tNYXAoKTtcblx0XHRjb25zdCBjb250cmlidXRlZFRhc2tzOiBUYXNrTWFwID0gbmV3IFRhc2tNYXAoKTtcblxuXHRcdGZvciAoY29uc3Qgc2V0IG9mIGNvbnRyaWJ1dGVkVGFza1NldHMpIHtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBzZXQudGFza3MpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdGNvbnRyaWJ1dGVkVGFza3MuYWRkKHdvcmtzcGFjZUZvbGRlciwgdGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0bGV0IHRhc2tzOiBbc3RyaW5nLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdF1bXSA9IFtdO1xuXHRcdFx0Ly8gcHJldmVudCB3b3Jrc3BhY2UgdHJ1c3QgZGlhbG9nIGZyb20gYmVpbmcgc2hvd24gaW4gdW5leHBlY3RlZCBjYXNlcyAjMjI0ODgxXG5cdFx0XHRpZiAoIWtub3duT25seU9yVHJ1c3RlZCB8fCB0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRcdHRhc2tzID0gQXJyYXkuZnJvbShhd2FpdCB0aGlzLmdldFdvcmtzcGFjZVRhc2tzKCkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5fZ2V0Q3VzdG9tVGFza1Byb21pc2VzKHRhc2tzLCBmaWx0ZXIsIHJlc3VsdCwgY29udHJpYnV0ZWRUYXNrcywgd2FpdFRvQWN0aXZhdGUpKTtcblx0XHRcdGlmIChuZWVkc1JlY2VudFRhc2tzTWlncmF0aW9uKSB7XG5cdFx0XHRcdC8vIEF0IHRoaXMgcG9pbnQgd2UgaGF2ZSBhbGwgdGhlIHRhc2tzIGFuZCBjYW4gbWlncmF0ZSB0aGUgcmVjZW50bHkgdXNlZCB0YXNrcy5cblx0XHRcdFx0YXdhaXQgdGhpcy5fbWlncmF0ZVJlY2VudFRhc2tzKHJlc3VsdC5hbGwoKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWYgd2UgY2FuJ3QgcmVhZCB0aGUgdGFza3MuanNvbiBmaWxlIHByb3ZpZGUgYXQgbGVhc3QgdGhlIGNvbnRyaWJ1dGVkIHRhc2tzXG5cdFx0XHRjb25zdCByZXN1bHQ6IFRhc2tNYXAgPSBuZXcgVGFza01hcCgpO1xuXHRcdFx0Zm9yIChjb25zdCBzZXQgb2YgY29udHJpYnV0ZWRUYXNrU2V0cykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2Ygc2V0LnRhc2tzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRcdFx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGZvbGRlciwgdGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIF9nZXRDdXN0b21UYXNrUHJvbWlzZXMoY3VzdG9tVGFza3NLZXlWYWx1ZVBhaXJzOiBbc3RyaW5nLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdF1bXSwgZmlsdGVyOiBJVGFza0ZpbHRlciB8IHVuZGVmaW5lZCwgcmVzdWx0OiBUYXNrTWFwLCBjb250cmlidXRlZFRhc2tzOiBUYXNrTWFwLCB3YWl0VG9BY3RpdmF0ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjdXN0b21UYXNrc0tleVZhbHVlUGFpcnMubWFwKGFzeW5jIChba2V5LCBmb2xkZXJUYXNrc10pID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVkID0gY29udHJpYnV0ZWRUYXNrcy5nZXQoa2V5KTtcblx0XHRcdGlmICghZm9sZGVyVGFza3Muc2V0KSB7XG5cdFx0XHRcdGlmIChjb250cmlidXRlZCkge1xuXHRcdFx0XHRcdHJlc3VsdC5hZGQoa2V5LCAuLi5jb250cmlidXRlZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdFx0cmVzdWx0LmFkZChrZXksIC4uLmZvbGRlclRhc2tzLnNldC50YXNrcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9ucyA9IGZvbGRlclRhc2tzLmNvbmZpZ3VyYXRpb25zO1xuXHRcdFx0XHRjb25zdCBsZWdhY3lUYXNrQ29uZmlndXJhdGlvbnMgPSBmb2xkZXJUYXNrcy5zZXQgPyB0aGlzLl9nZXRMZWdhY3lUYXNrQ29uZmlndXJhdGlvbnMoZm9sZGVyVGFza3Muc2V0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgY3VzdG9tVGFza3NUb0RlbGV0ZTogVGFza1tdID0gW107XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9ucyB8fCBsZWdhY3lUYXNrQ29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCB1blVzZWRDb25maWd1cmF0aW9uczogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdFx0XHRpZiAoY29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0XHRcdE9iamVjdC5rZXlzKGNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllcikuZm9yRWFjaChrZXkgPT4gdW5Vc2VkQ29uZmlndXJhdGlvbnMuYWRkKGtleSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgY29udHJpYnV0ZWQpIHtcblx0XHRcdFx0XHRcdGlmICghQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyaW5nVGFzayA9IGNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllclt0YXNrLmRlZmluZXMuX2tleV07XG5cdFx0XHRcdFx0XHRcdGlmIChjb25maWd1cmluZ1Rhc2spIHtcblx0XHRcdFx0XHRcdFx0XHR1blVzZWRDb25maWd1cmF0aW9ucy5kZWxldGUodGFzay5kZWZpbmVzLl9rZXkpO1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5hZGQoa2V5LCBUYXNrQ29uZmlnLmNyZWF0ZUN1c3RvbVRhc2sodGFzaywgY29uZmlndXJpbmdUYXNrKSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIHRhc2spO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGxlZ2FjeVRhc2tDb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb25maWd1cmluZ1Rhc2sgPSBsZWdhY3lUYXNrQ29uZmlndXJhdGlvbnNbdGFzay5kZWZpbmVzLl9rZXldO1xuXHRcdFx0XHRcdFx0XHRpZiAoY29uZmlndXJpbmdUYXNrKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIFRhc2tDb25maWcuY3JlYXRlQ3VzdG9tVGFzayh0YXNrLCBjb25maWd1cmluZ1Rhc2spKTtcblx0XHRcdFx0XHRcdFx0XHRjdXN0b21UYXNrc1RvRGVsZXRlLnB1c2goY29uZmlndXJpbmdUYXNrKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgdGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5hZGQoa2V5LCB0YXNrKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGN1c3RvbVRhc2tzVG9EZWxldGUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9EZWxldGUgPSBjdXN0b21UYXNrc1RvRGVsZXRlLnJlZHVjZTxJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPj4oKG1hcCwgdGFzaykgPT4ge1xuXHRcdFx0XHRcdFx0XHRtYXBbdGFzay5faWRdID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG1hcDtcblx0XHRcdFx0XHRcdH0sIE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIGZvbGRlclRhc2tzLnNldC50YXNrcykge1xuXHRcdFx0XHRcdFx0XHRpZiAodG9EZWxldGVbdGFzay5faWRdKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIHRhc2spO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgLi4uZm9sZGVyVGFza3Muc2V0LnRhc2tzKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB1blVzZWRDb25maWd1cmF0aW9uc0FzQXJyYXkgPSBBcnJheS5mcm9tKHVuVXNlZENvbmZpZ3VyYXRpb25zKTtcblxuXHRcdFx0XHRcdGNvbnN0IHVuVXNlZENvbmZpZ3VyYXRpb25Qcm9taXNlcyA9IHVuVXNlZENvbmZpZ3VyYXRpb25zQXNBcnJheS5tYXAoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb25maWd1cmluZ1Rhc2sgPSBjb25maWd1cmF0aW9ucyEuYnlJZGVudGlmaWVyW3ZhbHVlXTtcblx0XHRcdFx0XHRcdGlmIChmaWx0ZXI/LnR5cGUgJiYgKGZpbHRlci50eXBlICE9PSBjb25maWd1cmluZ1Rhc2suY29uZmlndXJlcy50eXBlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGxldCByZXF1aXJlZFRhc2tQcm92aWRlclVuYXZhaWxhYmxlOiBib29sZWFuID0gZmFsc2U7XG5cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW2hhbmRsZSwgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVycykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcm92aWRlclR5cGUgPSB0aGlzLl9wcm92aWRlclR5cGVzLmdldChoYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY29uZmlndXJpbmdUYXNrLnR5cGUgPT09IHByb3ZpZGVyVHlwZSkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwcm92aWRlclR5cGUgJiYgIXRoaXMuX2lzVGFza1Byb3ZpZGVyRW5hYmxlZChwcm92aWRlclR5cGUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZFRhc2tQcm92aWRlclVuYXZhaWxhYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFRhc2sgPSBhd2FpdCBwcm92aWRlci5yZXNvbHZlVGFzayhjb25maWd1cmluZ1Rhc2spO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHJlc29sdmVkVGFzayAmJiAocmVzb2x2ZWRUYXNrLl9pZCA9PT0gY29uZmlndXJpbmdUYXNrLl9pZCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIFRhc2tDb25maWcuY3JlYXRlQ3VzdG9tVGFzayhyZXNvbHZlZFRhc2ssIGNvbmZpZ3VyaW5nVGFzaykpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMuIFRoZSB0YXNrIGNvdWxkIG5vdCBiZSBwcm92aWRlZCBieSBhbnkgb2YgdGhlIHByb3ZpZGVycy5cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChyZXF1aXJlZFRhc2tQcm92aWRlclVuYXZhaWxhYmxlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J1Rhc2tTZXJ2aWNlLnByb3ZpZGVyVW5hdmFpbGFibGUnLFxuXHRcdFx0XHRcdFx0XHRcdCdXYXJuaW5nOiB7MH0gdGFza3MgYXJlIHVuYXZhaWxhYmxlIGluIHRoZSBjdXJyZW50IGVudmlyb25tZW50LicsXG5cdFx0XHRcdFx0XHRcdFx0Y29uZmlndXJpbmdUYXNrLmNvbmZpZ3VyZXMudHlwZVxuXHRcdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoIXdhaXRUb0FjdGl2YXRlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J1Rhc2tTZXJ2aWNlLm5vQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdFx0J0Vycm9yOiBUaGUgezB9IHRhc2sgZGV0ZWN0aW9uIGRpZG5cXCd0IGNvbnRyaWJ1dGUgYSB0YXNrIGZvciB0aGUgZm9sbG93aW5nIGNvbmZpZ3VyYXRpb246XFxuezF9XFxuVGhlIHRhc2sgd2lsbCBiZSBpZ25vcmVkLicsXG5cdFx0XHRcdFx0XHRcdFx0Y29uZmlndXJpbmdUYXNrLmNvbmZpZ3VyZXMudHlwZSxcblx0XHRcdFx0XHRcdFx0XHRKU09OLnN0cmluZ2lmeShjb25maWd1cmluZ1Rhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCwgdW5kZWZpbmVkLCA0KVxuXHRcdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHVuVXNlZENvbmZpZ3VyYXRpb25Qcm9taXNlcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIC4uLmZvbGRlclRhc2tzLnNldC50YXNrcyk7XG5cdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIC4uLmNvbnRyaWJ1dGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGVnYWN5VGFza0NvbmZpZ3VyYXRpb25zKHdvcmtzcGFjZVRhc2tzOiBJVGFza1NldCk6IElTdHJpbmdEaWN0aW9uYXJ5PEN1c3RvbVRhc2s+IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxDdXN0b21UYXNrPiB8IHVuZGVmaW5lZDtcblx0XHRmdW5jdGlvbiBnZXRSZXN1bHQoKTogSVN0cmluZ0RpY3Rpb25hcnk8Q3VzdG9tVGFzaz4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdHJldHVybiByZXN1bHQhO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRhc2sgb2Ygd29ya3NwYWNlVGFza3MudGFza3MpIHtcblx0XHRcdGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmROYW1lID0gdGFzay5jb21tYW5kICYmIHRhc2suY29tbWFuZC5uYW1lO1xuXHRcdFx0XHQvLyBUaGlzIGlzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSB3aXRoIHRoZSAwLjEuMCB0YXNrIGFubm90YXRpb24gY29kZVxuXHRcdFx0XHQvLyBpZiB3ZSBoYWQgYSBndWxwLCBqYWtlIG9yIGdydW50IGNvbW1hbmQgYSB0YXNrIHNwZWNpZmljYXRpb24gd2FzIGEgYW5ub3RhdGlvblxuXHRcdFx0XHRpZiAoY29tbWFuZE5hbWUgPT09ICdndWxwJyB8fCBjb21tYW5kTmFtZSA9PT0gJ2dydW50JyB8fCBjb21tYW5kTmFtZSA9PT0gJ2pha2UnKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IEtleWVkVGFza0lkZW50aWZpZXIuY3JlYXRlKHtcblx0XHRcdFx0XHRcdHR5cGU6IGNvbW1hbmROYW1lLFxuXHRcdFx0XHRcdFx0dGFzazogdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Z2V0UmVzdWx0KClbaWRlbnRpZmllci5fa2V5XSA9IHRhc2s7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRXb3Jrc3BhY2VUYXNrcyhydW5Tb3VyY2U6IFRhc2tSdW5Tb3VyY2UgPSBUYXNrUnVuU291cmNlLlVzZXIpOiBQcm9taXNlPE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0Pj4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcCgpO1xuXHRcdH1cblx0XHRhd2FpdCByYWNlVGltZW91dCh0aGlzLl93YWl0Rm9yQWxsU3VwcG9ydGVkRXhlY3V0aW9ucywgMjAwMCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdUaW1lZCBvdXQgd2FpdGluZyBmb3IgYWxsIHN1cHBvcnRlZCBleGVjdXRpb25zJyk7XG5cdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy5fd2hlblRhc2tTeXN0ZW1SZWFkeTtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlVGFza3NQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlVGFza3NQcm9taXNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXBkYXRlV29ya3NwYWNlVGFza3MocnVuU291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUYXNrUHJvYmxlbXMoaW5zdGFuY2VJZDogbnVtYmVyKTogTWFwPHN0cmluZywgeyByZXNvdXJjZXM6IFVSSVtdOyBtYXJrZXJzOiBJTWFya2VyRGF0YVtdIH0+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGFza1N5c3RlbT8uZ2V0VGFza1Byb2JsZW1zKGluc3RhbmNlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlV29ya3NwYWNlVGFza3MocnVuU291cmNlOiBUYXNrUnVuU291cmNlID0gVGFza1J1blNvdXJjZS5Vc2VyKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4+IHtcblx0XHR0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2UgPSB0aGlzLl9jb21wdXRlV29ya3NwYWNlVGFza3MocnVuU291cmNlKTtcblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlVGFza3NQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0QUZvbGRlcigpOiBQcm9taXNlPElXb3Jrc3BhY2VGb2xkZXI+IHtcblx0XHRsZXQgZm9sZGVyID0gdGhpcy53b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCA+IDAgPyB0aGlzLndvcmtzcGFjZUZvbGRlcnNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFmb2xkZXIpIHtcblx0XHRcdGNvbnN0IHVzZXJob21lID0gYXdhaXQgdGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRcdGZvbGRlciA9IG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmk6IHVzZXJob21lLCBuYW1lOiByZXNvdXJjZXMuYmFzZW5hbWUodXNlcmhvbWUpLCBpbmRleDogMCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvbGRlcjtcblx0fVxuXG5cdGdldFRlcm1pbmFsc0ZvclRhc2tzKHRhc2s6IFR5cGVzLlNpbmdsZU9yTWFueTxUYXNrPik6IFVSSVtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGFza1N5c3RlbT8uZ2V0VGVybWluYWxzRm9yVGFza3ModGFzayk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2NvbXB1dGVXb3Jrc3BhY2VUYXNrcyhydW5Tb3VyY2U6IFRhc2tSdW5Tb3VyY2UgPSBUYXNrUnVuU291cmNlLlVzZXIpOiBQcm9taXNlPE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0Pj4ge1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0IHwgdW5kZWZpbmVkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2VGb2xkZXJUYXNrcyhmb2xkZXIsIHJ1blNvdXJjZSkpO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZXMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0PigpO1xuXHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0cmVzdWx0LnNldCh2YWx1ZS53b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCksIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCB0aGlzLl9nZXRBRm9sZGVyKCk7XG5cdFx0aWYgKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGaWxlVGFza3MgPSBhd2FpdCB0aGlzLl9jb21wdXRlV29ya3NwYWNlRmlsZVRhc2tzKGZvbGRlciwgcnVuU291cmNlKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VGaWxlVGFza3MgJiYgdGhpcy5fd29ya3NwYWNlICYmIHRoaXMuX3dvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQodGhpcy5fd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24udG9TdHJpbmcoKSwgd29ya3NwYWNlRmlsZVRhc2tzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB1c2VyVGFza3MgPSBhd2FpdCB0aGlzLl9jb21wdXRlVXNlclRhc2tzKGZvbGRlciwgcnVuU291cmNlKTtcblx0XHRpZiAodXNlclRhc2tzKSB7XG5cdFx0XHRyZXN1bHQuc2V0KFVTRVJfVEFTS1NfR1JPVVBfS0VZLCB1c2VyVGFza3MpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0YXNrcyBhdmFpbGFibGUgY29udGV4dCBrZXlcblx0XHRjb25zdCBoYXNBbnlUYXNrcyA9IEFycmF5LmZyb20ocmVzdWx0LnZhbHVlcygpKS5zb21lKGZvbGRlclJlc3VsdCA9PlxuXHRcdFx0KGZvbGRlclJlc3VsdC5zZXQ/LnRhc2tzICYmIGZvbGRlclJlc3VsdC5zZXQudGFza3MubGVuZ3RoID4gMCkgfHxcblx0XHRcdChmb2xkZXJSZXN1bHQuY29uZmlndXJhdGlvbnM/LmJ5SWRlbnRpZmllciAmJiBPYmplY3Qua2V5cyhmb2xkZXJSZXN1bHQuY29uZmlndXJhdGlvbnMuYnlJZGVudGlmaWVyKS5sZW5ndGggPiAwKVxuXHRcdCk7XG5cdFx0dGhpcy5fdGFza3NBdmFpbGFibGVTdGF0ZS5zZXQoaGFzQW55VGFza3MpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9qc29uVGFza3NTdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFNoZWxsRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dC5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkgPT09IHRydWUgJiYgUHJvY2Vzc0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVdvcmtzcGFjZUZvbGRlclRhc2tzKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgcnVuU291cmNlOiBUYXNrUnVuU291cmNlID0gVGFza1J1blNvdXJjZS5Vc2VyKTogUHJvbWlzZTxJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24gPSAodGhpcy5fZXhlY3V0aW9uRW5naW5lID09PSBFeGVjdXRpb25FbmdpbmUuUHJvY2VzcyA/IGF3YWl0IHRoaXMuX2NvbXB1dGVMZWdhY3lDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcikgOiBhd2FpdCB0aGlzLl9jb21wdXRlQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIpKTtcblx0XHRpZiAoIXdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24gfHwgIXdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24uY29uZmlnIHx8IHdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24uaGFzRXJyb3JzKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgd29ya3NwYWNlRm9sZGVyLCBzZXQ6IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbnM6IHVuZGVmaW5lZCwgaGFzRXJyb3JzOiB3b3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uID8gd29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbi5oYXNFcnJvcnMgOiBmYWxzZSB9KTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5vblJlYWR5KCk7XG5cdFx0Y29uc3QgdGFza1N5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCA9IHRoaXMuX2dldFRhc2tTeXN0ZW1JbmZvKHdvcmtzcGFjZUZvbGRlci51cmkuc2NoZW1lKTtcblx0XHRjb25zdCBwcm9ibGVtUmVwb3J0ZXIgPSBuZXcgUHJvYmxlbVJlcG9ydGVyKHRoaXMuX291dHB1dENoYW5uZWwpO1xuXHRcdGNvbnN0IHByb2JsZW1SZXBvcnRlckxpc3RlbmVyID0gcHJvYmxlbVJlcG9ydGVyLm9uRGlkRXJyb3IoZXJyb3IgPT4gdGhpcy5fc2hvd091dHB1dChydW5Tb3VyY2UsIHVuZGVmaW5lZCwgZXJyb3IpKTtcblx0XHRjb25zdCBwYXJzZVJlc3VsdCA9IFRhc2tDb25maWcucGFyc2Uod29ya3NwYWNlRm9sZGVyLCB1bmRlZmluZWQsIHRhc2tTeXN0ZW1JbmZvID8gdGFza1N5c3RlbUluZm8ucGxhdGZvcm0gOiBQbGF0Zm9ybS5wbGF0Zm9ybSwgd29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbi5jb25maWcsIHByb2JsZW1SZXBvcnRlciwgVGFza0NvbmZpZy5UYXNrQ29uZmlnU291cmNlLlRhc2tzSnNvbiwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHByb2JsZW1SZXBvcnRlckxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRsZXQgaGFzRXJyb3JzID0gZmFsc2U7XG5cdFx0aWYgKCFwYXJzZVJlc3VsdC52YWxpZGF0aW9uU3RhdHVzLmlzT0soKSAmJiAocGFyc2VSZXN1bHQudmFsaWRhdGlvblN0YXR1cy5zdGF0ZSAhPT0gVmFsaWRhdGlvblN0YXRlLkluZm8pKSB7XG5cdFx0XHRoYXNFcnJvcnMgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAocHJvYmxlbVJlcG9ydGVyLnN0YXR1cy5pc0ZhdGFsKCkpIHtcblx0XHRcdHByb2JsZW1SZXBvcnRlci5mYXRhbChubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0uY29uZmlndXJhdGlvbkVycm9ycycsICdFcnJvcjogdGhlIHByb3ZpZGVkIHRhc2sgY29uZmlndXJhdGlvbiBoYXMgdmFsaWRhdGlvbiBlcnJvcnMgYW5kIGNhblxcJ3Qgbm90IGJlIHVzZWQuIFBsZWFzZSBjb3JyZWN0IHRoZSBlcnJvcnMgZmlyc3QuJykpO1xuXHRcdFx0cmV0dXJuIHsgd29ya3NwYWNlRm9sZGVyLCBzZXQ6IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbnM6IHVuZGVmaW5lZCwgaGFzRXJyb3JzIH07XG5cdFx0fVxuXHRcdGxldCBjdXN0b21pemVkVGFza3M6IHsgYnlJZGVudGlmaWVyOiBJU3RyaW5nRGljdGlvbmFyeTxDb25maWd1cmluZ1Rhc2s+IH0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHBhcnNlUmVzdWx0LmNvbmZpZ3VyZWQgJiYgcGFyc2VSZXN1bHQuY29uZmlndXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRjdXN0b21pemVkVGFza3MgPSB7XG5cdFx0XHRcdGJ5SWRlbnRpZmllcjogT2JqZWN0LmNyZWF0ZShudWxsKVxuXHRcdFx0fTtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBwYXJzZVJlc3VsdC5jb25maWd1cmVkKSB7XG5cdFx0XHRcdGN1c3RvbWl6ZWRUYXNrcy5ieUlkZW50aWZpZXJbdGFzay5jb25maWd1cmVzLl9rZXldID0gdGFzaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9qc29uVGFza3NTdXBwb3J0ZWQgJiYgKHBhcnNlUmVzdWx0LmN1c3RvbS5sZW5ndGggPiAwKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdDdXN0b20gd29ya3NwYWNlIHRhc2tzIGFyZSBub3Qgc3VwcG9ydGVkLicpO1xuXHRcdH1cblx0XHRyZXR1cm4geyB3b3Jrc3BhY2VGb2xkZXIsIHNldDogeyB0YXNrczogdGhpcy5fanNvblRhc2tzU3VwcG9ydGVkID8gcGFyc2VSZXN1bHQuY3VzdG9tIDogW10gfSwgY29uZmlndXJhdGlvbnM6IGN1c3RvbWl6ZWRUYXNrcywgaGFzRXJyb3JzIH07XG5cdH1cblxuXHRwcml2YXRlIF90ZXN0UGFyc2VFeHRlcm5hbENvbmZpZyhjb25maWc6IFRhc2tDb25maWcuSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQsIGxvY2F0aW9uOiBzdHJpbmcpOiB7IGNvbmZpZzogVGFza0NvbmZpZy5JRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZDsgaGFzUGFyc2VFcnJvcnM6IGJvb2xlYW4gfSB7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybiB7IGNvbmZpZzogdW5kZWZpbmVkLCBoYXNQYXJzZUVycm9yczogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VFcnJvcnM6IHN0cmluZ1tdID0gKGNvbmZpZyBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS4kcGFyc2VFcnJvcnMgYXMgc3RyaW5nW107XG5cdFx0aWYgKHBhcnNlRXJyb3JzKSB7XG5cdFx0XHRsZXQgaXNBZmZlY3RlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBwYXJzZUVycm9yIG9mIHBhcnNlRXJyb3JzKSB7XG5cdFx0XHRcdGlmICgvdGFza3NcXC5qc29uJC8udGVzdChwYXJzZUVycm9yKSkge1xuXHRcdFx0XHRcdGlzQWZmZWN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBZmZlY3RlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKHsga2V5OiAnVGFza1N5c3RlbS5pbnZhbGlkVGFza0pzb25PdGhlcicsIGNvbW1lbnQ6IFsnTWVzc2FnZSBub3RpZmllcyBvZiBhbiBlcnJvciBpbiBvbmUgb2Ygc2V2ZXJhbCBwbGFjZXMgdGhlcmUgaXMgdGFza3MgcmVsYXRlZCBqc29uLCBub3QgbmVjZXNzYXJpbHkgaW4gYSBmaWxlIG5hbWVkIHRhc2tzLmpzb24nXSB9LCAnRXJyb3I6IFRoZSBjb250ZW50IG9mIHRoZSB0YXNrcyBqc29uIGluIHswfSBoYXMgc3ludGF4IGVycm9ycy4gUGxlYXNlIGNvcnJlY3QgdGhlbSBiZWZvcmUgZXhlY3V0aW5nIGEgdGFzay4nLCBsb2NhdGlvbikpO1xuXHRcdFx0XHR0aGlzLl9zaG93T3V0cHV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBubHMubG9jYWxpemUoeyBrZXk6ICdUYXNrU3lzdGVtLmludmFsaWRUYXNrSnNvbk90aGVyJywgY29tbWVudDogWydNZXNzYWdlIG5vdGlmaWVzIG9mIGFuIGVycm9yIGluIG9uZSBvZiBzZXZlcmFsIHBsYWNlcyB0aGVyZSBpcyB0YXNrcyByZWxhdGVkIGpzb24sIG5vdCBuZWNlc3NhcmlseSBpbiBhIGZpbGUgbmFtZWQgdGFza3MuanNvbiddIH0sICdFcnJvcjogVGhlIGNvbnRlbnQgb2YgdGhlIHRhc2tzIGpzb24gaW4gezB9IGhhcyBzeW50YXggZXJyb3JzLiBQbGVhc2UgY29ycmVjdCB0aGVtIGJlZm9yZSBleGVjdXRpbmcgYSB0YXNrLicsIGxvY2F0aW9uKSk7XG5cdFx0XHRcdHJldHVybiB7IGNvbmZpZywgaGFzUGFyc2VFcnJvcnM6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgY29uZmlnLCBoYXNQYXJzZUVycm9yczogZmFsc2UgfTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZyh2YWx1ZTogc3RyaW5nLCB2ZXJib3NlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdmVyYm9zZSB8fCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLlZlcmJvc2VMb2dnaW5nKSkge1xuXHRcdFx0dGhpcy5fb3V0cHV0Q2hhbm5lbC5hcHBlbmQodmFsdWUgKyAnXFxuJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVdvcmtzcGFjZUZpbGVUYXNrcyh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIHJ1blNvdXJjZTogVGFza1J1blNvdXJjZSA9IFRhc2tSdW5Tb3VyY2UuVXNlcik6IFByb21pc2U8SVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQ+IHtcblx0XHRpZiAodGhpcy5fZXhlY3V0aW9uRW5naW5lID09PSBFeGVjdXRpb25FbmdpbmUuUHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VtcHR5V29ya3NwYWNlVGFza1Jlc3VsdHMod29ya3NwYWNlRm9sZGVyKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya3NwYWNlRmlsZUNvbmZpZyA9IHRoaXMuX2dldENvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyLCBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5fdGVzdFBhcnNlRXh0ZXJuYWxDb25maWcod29ya3NwYWNlRmlsZUNvbmZpZy5jb25maWcsIG5scy5sb2NhbGl6ZSgnVGFza3NTeXN0ZW0ubG9jYXRpb25Xb3Jrc3BhY2VDb25maWcnLCAnd29ya3NwYWNlIGZpbGUnKSk7XG5cdFx0Y29uc3QgY3VzdG9taXplZFRhc2tzOiB7IGJ5SWRlbnRpZmllcjogSVN0cmluZ0RpY3Rpb25hcnk8Q29uZmlndXJpbmdUYXNrPiB9ID0ge1xuXHRcdFx0YnlJZGVudGlmaWVyOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGN1c3RvbTogQ3VzdG9tVGFza1tdID0gW107XG5cdFx0YXdhaXQgdGhpcy5fY29tcHV0ZVRhc2tzRm9yU2luZ2xlQ29uZmlnKHdvcmtzcGFjZUZvbGRlciwgY29uZmlndXJhdGlvbi5jb25maWcsIHJ1blNvdXJjZSwgY3VzdG9tLCBjdXN0b21pemVkVGFza3MuYnlJZGVudGlmaWVyLCBUYXNrQ29uZmlnLlRhc2tDb25maWdTb3VyY2UuV29ya3NwYWNlRmlsZSk7XG5cdFx0Y29uc3QgZW5naW5lID0gY29uZmlndXJhdGlvbi5jb25maWcgPyBUYXNrQ29uZmlnLkV4ZWN1dGlvbkVuZ2luZS5mcm9tKGNvbmZpZ3VyYXRpb24uY29uZmlnKSA6IEV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbDtcblx0XHRpZiAoZW5naW5lID09PSBFeGVjdXRpb25FbmdpbmUuUHJvY2Vzcykge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS52ZXJzaW9uV29ya3NwYWNlRmlsZScsICdPbmx5IHRhc2tzIHZlcnNpb24gMi4wLjAgcGVybWl0dGVkIGluIHdvcmtzcGFjZSBjb25maWd1cmF0aW9uIGZpbGVzLicpKTtcblx0XHRcdHJldHVybiB0aGlzLl9lbXB0eVdvcmtzcGFjZVRhc2tSZXN1bHRzKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0fVxuXHRcdHJldHVybiB7IHdvcmtzcGFjZUZvbGRlciwgc2V0OiB7IHRhc2tzOiBjdXN0b20gfSwgY29uZmlndXJhdGlvbnM6IGN1c3RvbWl6ZWRUYXNrcywgaGFzRXJyb3JzOiBjb25maWd1cmF0aW9uLmhhc1BhcnNlRXJyb3JzIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlVXNlclRhc2tzKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgcnVuU291cmNlOiBUYXNrUnVuU291cmNlID0gVGFza1J1blNvdXJjZS5Vc2VyKTogUHJvbWlzZTxJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4ge1xuXHRcdGlmICh0aGlzLl9leGVjdXRpb25FbmdpbmUgPT09IEV4ZWN1dGlvbkVuZ2luZS5Qcm9jZXNzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW1wdHlXb3Jrc3BhY2VUYXNrUmVzdWx0cyh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdH1cblx0XHRjb25zdCB1c2VyVGFza3NDb25maWcgPSB0aGlzLl9nZXRDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlciwgVGFza1NvdXJjZUtpbmQuVXNlcik7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuX3Rlc3RQYXJzZUV4dGVybmFsQ29uZmlnKHVzZXJUYXNrc0NvbmZpZy5jb25maWcsIG5scy5sb2NhbGl6ZSgnVGFza3NTeXN0ZW0ubG9jYXRpb25Vc2VyQ29uZmlnJywgJ3VzZXIgc2V0dGluZ3MnKSk7XG5cdFx0Y29uc3QgY3VzdG9taXplZFRhc2tzOiB7IGJ5SWRlbnRpZmllcjogSVN0cmluZ0RpY3Rpb25hcnk8Q29uZmlndXJpbmdUYXNrPiB9ID0ge1xuXHRcdFx0YnlJZGVudGlmaWVyOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGN1c3RvbTogQ3VzdG9tVGFza1tdID0gW107XG5cdFx0YXdhaXQgdGhpcy5fY29tcHV0ZVRhc2tzRm9yU2luZ2xlQ29uZmlnKHdvcmtzcGFjZUZvbGRlciwgY29uZmlndXJhdGlvbi5jb25maWcsIHJ1blNvdXJjZSwgY3VzdG9tLCBjdXN0b21pemVkVGFza3MuYnlJZGVudGlmaWVyLCBUYXNrQ29uZmlnLlRhc2tDb25maWdTb3VyY2UuVXNlcik7XG5cdFx0Y29uc3QgZW5naW5lID0gY29uZmlndXJhdGlvbi5jb25maWcgPyBUYXNrQ29uZmlnLkV4ZWN1dGlvbkVuZ2luZS5mcm9tKGNvbmZpZ3VyYXRpb24uY29uZmlnKSA6IEV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbDtcblx0XHRpZiAoZW5naW5lID09PSBFeGVjdXRpb25FbmdpbmUuUHJvY2Vzcykge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS52ZXJzaW9uU2V0dGluZ3MnLCAnT25seSB0YXNrcyB2ZXJzaW9uIDIuMC4wIHBlcm1pdHRlZCBpbiB1c2VyIHNldHRpbmdzLicpKTtcblx0XHRcdHJldHVybiB0aGlzLl9lbXB0eVdvcmtzcGFjZVRhc2tSZXN1bHRzKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0fVxuXHRcdHJldHVybiB7IHdvcmtzcGFjZUZvbGRlciwgc2V0OiB7IHRhc2tzOiBjdXN0b20gfSwgY29uZmlndXJhdGlvbnM6IGN1c3RvbWl6ZWRUYXNrcywgaGFzRXJyb3JzOiBjb25maWd1cmF0aW9uLmhhc1BhcnNlRXJyb3JzIH07XG5cdH1cblxuXHRwcml2YXRlIF9lbXB0eVdvcmtzcGFjZVRhc2tSZXN1bHRzKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0IHtcblx0XHRyZXR1cm4geyB3b3Jrc3BhY2VGb2xkZXIsIHNldDogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uczogdW5kZWZpbmVkLCBoYXNFcnJvcnM6IGZhbHNlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWcod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBjb25maWc6IFRhc2tDb25maWcuSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQsIHJ1blNvdXJjZTogVGFza1J1blNvdXJjZSwgY3VzdG9tOiBDdXN0b21UYXNrW10sIGN1c3RvbWl6ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PENvbmZpZ3VyaW5nVGFzaz4sIHNvdXJjZTogVGFza0NvbmZpZy5UYXNrQ29uZmlnU291cmNlLCBpc1JlY2VudFRhc2s6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICghd29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdUYXNrU2VydmljZS5jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWc6IG5vIHdvcmtzcGFjZSBmb2xkZXIgZm9yIHdvcnNrc3BhY2UnLCB0aGlzLl93b3Jrc3BhY2U/LmlkKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGFza1N5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCA9IHRoaXMuX2dldFRhc2tTeXN0ZW1JbmZvKHdvcmtzcGFjZUZvbGRlci51cmkuc2NoZW1lKTtcblx0XHRjb25zdCBwcm9ibGVtUmVwb3J0ZXIgPSBuZXcgUHJvYmxlbVJlcG9ydGVyKHRoaXMuX291dHB1dENoYW5uZWwpO1xuXHRcdGNvbnN0IHBhcnNlUmVzdWx0ID0gVGFza0NvbmZpZy5wYXJzZSh3b3Jrc3BhY2VGb2xkZXIsIHRoaXMuX3dvcmtzcGFjZSwgdGFza1N5c3RlbUluZm8gPyB0YXNrU3lzdGVtSW5mby5wbGF0Zm9ybSA6IFBsYXRmb3JtLnBsYXRmb3JtLCBjb25maWcsIHByb2JsZW1SZXBvcnRlciwgc291cmNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgaXNSZWNlbnRUYXNrKTtcblx0XHRsZXQgaGFzRXJyb3JzID0gZmFsc2U7XG5cdFx0aWYgKCFwYXJzZVJlc3VsdC52YWxpZGF0aW9uU3RhdHVzLmlzT0soKSAmJiAocGFyc2VSZXN1bHQudmFsaWRhdGlvblN0YXR1cy5zdGF0ZSAhPT0gVmFsaWRhdGlvblN0YXRlLkluZm8pKSB7XG5cdFx0XHR0aGlzLl9zaG93T3V0cHV0KHJ1blNvdXJjZSk7XG5cdFx0XHRoYXNFcnJvcnMgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAocHJvYmxlbVJlcG9ydGVyLnN0YXR1cy5pc0ZhdGFsKCkpIHtcblx0XHRcdHByb2JsZW1SZXBvcnRlci5mYXRhbChubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0uY29uZmlndXJhdGlvbkVycm9ycycsICdFcnJvcjogdGhlIHByb3ZpZGVkIHRhc2sgY29uZmlndXJhdGlvbiBoYXMgdmFsaWRhdGlvbiBlcnJvcnMgYW5kIGNhblxcJ3Qgbm90IGJlIHVzZWQuIFBsZWFzZSBjb3JyZWN0IHRoZSBlcnJvcnMgZmlyc3QuJykpO1xuXHRcdFx0cmV0dXJuIGhhc0Vycm9ycztcblx0XHR9XG5cdFx0aWYgKHBhcnNlUmVzdWx0LmNvbmZpZ3VyZWQgJiYgcGFyc2VSZXN1bHQuY29uZmlndXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgcGFyc2VSZXN1bHQuY29uZmlndXJlZCkge1xuXHRcdFx0XHRjdXN0b21pemVkW3Rhc2suY29uZmlndXJlcy5fa2V5XSA9IHRhc2s7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fanNvblRhc2tzU3VwcG9ydGVkICYmIChwYXJzZVJlc3VsdC5jdXN0b20ubGVuZ3RoID4gMCkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQ3VzdG9tIHdvcmtzcGFjZSB0YXNrcyBhcmUgbm90IHN1cHBvcnRlZC4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHBhcnNlUmVzdWx0LmN1c3RvbSkge1xuXHRcdFx0XHRjdXN0b20ucHVzaCh0YXNrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhhc0Vycm9ycztcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IFByb21pc2U8SVdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb25SZXN1bHQ+IHtcblx0XHRjb25zdCB7IGNvbmZpZywgaGFzUGFyc2VFcnJvcnMgfSA9IHRoaXMuX2dldENvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlPElXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uUmVzdWx0Pih7IHdvcmtzcGFjZUZvbGRlciwgY29uZmlnLCBoYXNFcnJvcnM6IGhhc1BhcnNlRXJyb3JzIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9jb21wdXRlTGVnYWN5Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpOiBQcm9taXNlPElXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uUmVzdWx0PjtcblxuXHRwcml2YXRlIF9jb21wdXRlV29ya3NwYWNlRm9sZGVyU2V0dXAoKTogW0lXb3Jrc3BhY2VGb2xkZXJbXSwgSVdvcmtzcGFjZUZvbGRlcltdLCBFeGVjdXRpb25FbmdpbmUsIEpzb25TY2hlbWFWZXJzaW9uLCBJV29ya3NwYWNlIHwgdW5kZWZpbmVkXSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdID0gW107XG5cdFx0Y29uc3QgaWdub3JlZFdvcmtzcGFjZUZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSA9IFtdO1xuXHRcdGxldCBleGVjdXRpb25FbmdpbmUgPSBFeGVjdXRpb25FbmdpbmUuVGVybWluYWw7XG5cdFx0bGV0IHNjaGVtYVZlcnNpb24gPSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzA7XG5cdFx0bGV0IHdvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgPSB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXHRcdFx0d29ya3NwYWNlRm9sZGVycy5wdXNoKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHRleGVjdXRpb25FbmdpbmUgPSB0aGlzLl9jb21wdXRlRXhlY3V0aW9uRW5naW5lKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHRzY2hlbWFWZXJzaW9uID0gdGhpcy5fY29tcHV0ZUpzb25TY2hlbWFWZXJzaW9uKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdHdvcmtzcGFjZSA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VGb2xkZXIgb2YgdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycykge1xuXHRcdFx0XHRpZiAoc2NoZW1hVmVyc2lvbiA9PT0gdGhpcy5fY29tcHV0ZUpzb25TY2hlbWFWZXJzaW9uKHdvcmtzcGFjZUZvbGRlcikpIHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJzLnB1c2god29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZ25vcmVkV29ya3NwYWNlRm9sZGVycy5wdXNoKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdCd0YXNrU2VydmljZS5pZ25vcmluZ0ZvbGRlcicsXG5cdFx0XHRcdFx0XHQnSWdub3JpbmcgdGFzayBjb25maWd1cmF0aW9ucyBmb3Igd29ya3NwYWNlIGZvbGRlciB7MH0uIE11bHRpIGZvbGRlciB3b3Jrc3BhY2UgdGFzayBzdXBwb3J0IHJlcXVpcmVzIHRoYXQgYWxsIGZvbGRlcnMgdXNlIHRhc2sgdmVyc2lvbiAyLjAuMCcsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXIudXJpLmZzUGF0aCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbd29ya3NwYWNlRm9sZGVycywgaWdub3JlZFdvcmtzcGFjZUZvbGRlcnMsIGV4ZWN1dGlvbkVuZ2luZSwgc2NoZW1hVmVyc2lvbiwgd29ya3NwYWNlXTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVFeGVjdXRpb25FbmdpbmUod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogRXhlY3V0aW9uRW5naW5lIHtcblx0XHRjb25zdCB7IGNvbmZpZyB9ID0gdGhpcy5fZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRyZXR1cm4gRXhlY3V0aW9uRW5naW5lLl9kZWZhdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gVGFza0NvbmZpZy5FeGVjdXRpb25FbmdpbmUuZnJvbShjb25maWcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUpzb25TY2hlbWFWZXJzaW9uKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IEpzb25TY2hlbWFWZXJzaW9uIHtcblx0XHRjb25zdCB7IGNvbmZpZyB9ID0gdGhpcy5fZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRyZXR1cm4gSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wO1xuXHRcdH1cblx0XHRyZXR1cm4gVGFza0NvbmZpZy5Kc29uU2NoZW1hVmVyc2lvbi5mcm9tKGNvbmZpZyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldENvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBzb3VyY2U/OiBzdHJpbmcpOiB7IGNvbmZpZzogVGFza0NvbmZpZy5JRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZDsgaGFzUGFyc2VFcnJvcnM6IGJvb2xlYW4gfSB7XG5cdFx0bGV0IHJlc3VsdDtcblx0XHRpZiAoKHNvdXJjZSAhPT0gVGFza1NvdXJjZUtpbmQuVXNlcikgJiYgKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSkge1xuXHRcdFx0cmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB3aG9sZUNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8VGFza0NvbmZpZy5JRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbj4oJ3Rhc2tzJywgeyByZXNvdXJjZTogd29ya3NwYWNlRm9sZGVyLnVyaSB9KTtcblx0XHRcdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuVXNlcjoge1xuXHRcdFx0XHRcdGlmICh3aG9sZUNvbmZpZy51c2VyVmFsdWUgIT09IHdob2xlQ29uZmlnLndvcmtzcGFjZUZvbGRlclZhbHVlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBPYmplY3RzLmRlZXBDbG9uZSh3aG9sZUNvbmZpZy51c2VyVmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZTogcmVzdWx0ID0gT2JqZWN0cy5kZWVwQ2xvbmUod2hvbGVDb25maWcud29ya3NwYWNlRm9sZGVyVmFsdWUpOyBicmVhaztcblx0XHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlOiB7XG5cdFx0XHRcdFx0aWYgKCh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpXG5cdFx0XHRcdFx0XHQmJiAod2hvbGVDb25maWcud29ya3NwYWNlRm9sZGVyVmFsdWUgIT09IHdob2xlQ29uZmlnLndvcmtzcGFjZVZhbHVlKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gT2JqZWN0cy5kZWVwQ2xvbmUod2hvbGVDb25maWcud29ya3NwYWNlVmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZhdWx0OiByZXN1bHQgPSBPYmplY3RzLmRlZXBDbG9uZSh3aG9sZUNvbmZpZy53b3Jrc3BhY2VGb2xkZXJWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4geyBjb25maWc6IHVuZGVmaW5lZCwgaGFzUGFyc2VFcnJvcnM6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlRXJyb3JzOiBzdHJpbmdbXSA9IChyZXN1bHQgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuJHBhcnNlRXJyb3JzIGFzIHN0cmluZ1tdO1xuXHRcdGlmIChwYXJzZUVycm9ycykge1xuXHRcdFx0bGV0IGlzQWZmZWN0ZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgcGFyc2VFcnJvciBvZiBwYXJzZUVycm9ycykge1xuXHRcdFx0XHRpZiAoL3Rhc2tzXFwuanNvbiQvLnRlc3QocGFyc2VFcnJvcikpIHtcblx0XHRcdFx0XHRpc0FmZmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWZmZWN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS5pbnZhbGlkVGFza0pzb24nLCAnRXJyb3I6IFRoZSBjb250ZW50IG9mIHRoZSB0YXNrcy5qc29uIGZpbGUgaGFzIHN5bnRheCBlcnJvcnMuIFBsZWFzZSBjb3JyZWN0IHRoZW0gYmVmb3JlIGV4ZWN1dGluZyBhIHRhc2suJykpO1xuXHRcdFx0XHR0aGlzLl9zaG93T3V0cHV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0uaW52YWxpZFRhc2tKc29uJywgJ0Vycm9yOiBUaGUgY29udGVudCBvZiB0aGUgdGFza3MuanNvbiBmaWxlIGhhcyBzeW50YXggZXJyb3JzLiBQbGVhc2UgY29ycmVjdCB0aGVtIGJlZm9yZSBleGVjdXRpbmcgYSB0YXNrLicpKTtcblx0XHRcdFx0cmV0dXJuIHsgY29uZmlnOiB1bmRlZmluZWQsIGhhc1BhcnNlRXJyb3JzOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGNvbmZpZzogcmVzdWx0LCBoYXNQYXJzZUVycm9yczogZmFsc2UgfTtcblx0fVxuXG5cdHB1YmxpYyBpblRlcm1pbmFsKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl90YXNrU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdGFza1N5c3RlbSBpbnN0YW5jZW9mIFRlcm1pbmFsVGFza1N5c3RlbTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGlvbkVuZ2luZSA9PT0gRXhlY3V0aW9uRW5naW5lLlRlcm1pbmFsO1xuXHR9XG5cblx0cHVibGljIGNvbmZpZ3VyZUFjdGlvbigpOiBBY3Rpb24ge1xuXHRcdGNvbnN0IHRoaXNDYXB0dXJlOiBBYnN0cmFjdFRhc2tTZXJ2aWNlID0gdGhpcztcblx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihDb25maWd1cmVUYXNrQWN0aW9uLklELCBDb25maWd1cmVUYXNrQWN0aW9uLlRFWFQudmFsdWUsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4geyB0aGlzQ2FwdHVyZS5fcnVuQ29uZmlndXJlVGFza3MoKTsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRXJyb3IoZXJyOiB1bmtub3duKTogdm9pZCB7XG5cdFx0bGV0IHNob3dPdXRwdXQgPSB0cnVlO1xuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBUYXNrRXJyb3IpIHtcblx0XHRcdGNvbnN0IGJ1aWxkRXJyb3IgPSBlcnI7XG5cdFx0XHRjb25zdCBuZWVkc0NvbmZpZyA9IGJ1aWxkRXJyb3IuY29kZSA9PT0gVGFza0Vycm9ycy5Ob3RDb25maWd1cmVkIHx8IGJ1aWxkRXJyb3IuY29kZSA9PT0gVGFza0Vycm9ycy5Ob0J1aWxkVGFzayB8fCBidWlsZEVycm9yLmNvZGUgPT09IFRhc2tFcnJvcnMuTm9UZXN0VGFzaztcblx0XHRcdGNvbnN0IG5lZWRzVGVybWluYXRlID0gYnVpbGRFcnJvci5jb2RlID09PSBUYXNrRXJyb3JzLlJ1bm5pbmdUYXNrO1xuXHRcdFx0aWYgKG5lZWRzQ29uZmlnIHx8IG5lZWRzVGVybWluYXRlKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KGJ1aWxkRXJyb3Iuc2V2ZXJpdHksIGJ1aWxkRXJyb3IubWVzc2FnZSwgW3tcblx0XHRcdFx0XHRsYWJlbDogbmVlZHNDb25maWcgPyBDb25maWd1cmVUYXNrQWN0aW9uLlRFWFQudmFsdWUgOiBubHMubG9jYWxpemUoJ1Rlcm1pbmF0ZUFjdGlvbi5sYWJlbCcsIFwiVGVybWluYXRlIFRhc2tcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAobmVlZHNDb25maWcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcnVuQ29uZmlndXJlVGFza3MoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3J1blRlcm1pbmF0ZUNvbW1hbmQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHsgc2V2ZXJpdHk6IGJ1aWxkRXJyb3Iuc2V2ZXJpdHksIG1lc3NhZ2U6IGJ1aWxkRXJyb3IubWVzc2FnZSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IGVycjtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IubWVzc2FnZSk7XG5cdFx0XHRzaG93T3V0cHV0ID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChUeXBlcy5pc1N0cmluZyhlcnIpKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKDxzdHJpbmc+ZXJyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0udW5rbm93bkVycm9yJywgJ0FuIGVycm9yIGhhcyBvY2N1cnJlZCB3aGlsZSBydW5uaW5nIGEgdGFzay4gU2VlIHRhc2sgbG9nIGZvciBkZXRhaWxzLicpKTtcblx0XHR9XG5cdFx0aWYgKHNob3dPdXRwdXQpIHtcblx0XHRcdHRoaXMuX3Nob3dPdXRwdXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIFR5cGVzLmlzU3RyaW5nKGVycikgPyBlcnIgYXMgc3RyaW5nIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93RGV0YWlsKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihRVUlDS09QRU5fREVUQUlMX0NPTkZJRyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVUYXNrUXVpY2tQaWNrRW50cmllcyh0YXNrczogVGFza1tdLCBncm91cDogYm9vbGVhbiA9IGZhbHNlLCBzb3J0OiBib29sZWFuID0gZmFsc2UsIHNlbGVjdGVkRW50cnk/OiBJVGFza1F1aWNrUGlja0VudHJ5LCBpbmNsdWRlUmVjZW50czogYm9vbGVhbiA9IHRydWUpOiBQcm9taXNlPElUYXNrUXVpY2tQaWNrRW50cnlbXT4ge1xuXHRcdGxldCBlbmNvdW50ZXJlZFRhc2tzOiB7IFtrZXk6IHN0cmluZ106IElUYXNrUXVpY2tQaWNrRW50cnlbXSB9ID0ge307XG5cdFx0aWYgKHRhc2tzID09PSB1bmRlZmluZWQgfHwgdGFza3MgPT09IG51bGwgfHwgdGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IFRhc2tRdWlja1BpY2tFbnRyeSA9ICh0YXNrOiBUYXNrKTogSVRhc2tRdWlja1BpY2tFbnRyeSA9PiB7XG5cdFx0XHRjb25zdCBuZXdFbnRyeSA9IHsgbGFiZWw6IHRhc2suX2xhYmVsLCBkZXNjcmlwdGlvbjogdGhpcy5nZXRUYXNrRGVzY3JpcHRpb24odGFzayksIHRhc2ssIGRldGFpbDogdGhpcy5fc2hvd0RldGFpbCgpID8gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWwgOiB1bmRlZmluZWQgfTtcblx0XHRcdGlmIChlbmNvdW50ZXJlZFRhc2tzW3Rhc2suX2lkXSkge1xuXHRcdFx0XHRpZiAoZW5jb3VudGVyZWRUYXNrc1t0YXNrLl9pZF0ubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0ZW5jb3VudGVyZWRUYXNrc1t0YXNrLl9pZF1bMF0ubGFiZWwgKz0gJyAoMSknO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5ld0VudHJ5LmxhYmVsID0gbmV3RW50cnkubGFiZWwgKyAnICgnICsgKGVuY291bnRlcmVkVGFza3NbdGFzay5faWRdLmxlbmd0aCArIDEpLnRvU3RyaW5nKCkgKyAnKSc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmNvdW50ZXJlZFRhc2tzW3Rhc2suX2lkXSA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0ZW5jb3VudGVyZWRUYXNrc1t0YXNrLl9pZF0ucHVzaChuZXdFbnRyeSk7XG5cdFx0XHRyZXR1cm4gbmV3RW50cnk7XG5cblx0XHR9O1xuXHRcdGZ1bmN0aW9uIGZpbGxFbnRyaWVzKGVudHJpZXM6IFF1aWNrUGlja0lucHV0PElUYXNrUXVpY2tQaWNrRW50cnk+W10sIHRhc2tzOiBUYXNrW10sIGdyb3VwTGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0aWYgKHRhc2tzLmxlbmd0aCkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGdyb3VwTGFiZWwgfSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0Y29uc3QgZW50cnk6IElUYXNrUXVpY2tQaWNrRW50cnkgPSBUYXNrUXVpY2tQaWNrRW50cnkodGFzayk7XG5cdFx0XHRcdGVudHJ5LmJ1dHRvbnMgPSBbeyBpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShjb25maWd1cmVUYXNrSWNvbiksIHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnY29uZmlndXJlVGFzaycsIFwiQ29uZmlndXJlIFRhc2tcIikgfV07XG5cdFx0XHRcdGlmIChzZWxlY3RlZEVudHJ5ICYmICh0YXNrID09PSBzZWxlY3RlZEVudHJ5LnRhc2spKSB7XG5cdFx0XHRcdFx0ZW50cmllcy51bnNoaWZ0KHNlbGVjdGVkRW50cnkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IGVudHJpZXM6IElUYXNrUXVpY2tQaWNrRW50cnlbXTtcblx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdGVudHJpZXMgPSBbXTtcblx0XHRcdGlmICh0YXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKFRhc2tRdWlja1BpY2tFbnRyeSh0YXNrc1swXSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVjZW50bHlVc2VkVGFza3MgPSBhd2FpdCB0aGlzLmdldFNhdmVkVGFza3MoJ2hpc3RvcmljYWwnKTtcblx0XHRcdFx0Y29uc3QgcmVjZW50OiBUYXNrW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgcmVjZW50U2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0XHRcdFx0bGV0IGNvbmZpZ3VyZWQ6IFRhc2tbXSA9IFtdO1xuXHRcdFx0XHRsZXQgZGV0ZWN0ZWQ6IFRhc2tbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCB0YXNrTWFwOiBJU3RyaW5nRGljdGlvbmFyeTxUYXNrPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRcdHRhc2tzLmZvckVhY2godGFzayA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gdGFzay5nZXRDb21tb25UYXNrSWQoKTtcblx0XHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0XHR0YXNrTWFwW2tleV0gPSB0YXNrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlY2VudGx5VXNlZFRhc2tzLnJldmVyc2UoKS5mb3JFYWNoKHJlY2VudFRhc2sgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IHJlY2VudFRhc2suZ2V0Q29tbW9uVGFza0lkKCk7XG5cdFx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdFx0cmVjZW50U2V0LmFkZChrZXkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFzayA9IHRhc2tNYXBba2V5XTtcblx0XHRcdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0XHRcdHJlY2VudC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IHRhc2suZ2V0Q29tbW9uVGFza0lkKCk7XG5cdFx0XHRcdFx0aWYgKCFrZXkgfHwgIXJlY2VudFNldC5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0aWYgKCh0YXNrLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlKSB8fCAodGFzay5fc291cmNlLmtpbmQgPT09IFRhc2tTb3VyY2VLaW5kLlVzZXIpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbmZpZ3VyZWQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGRldGVjdGVkLnB1c2godGFzayk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNvcnRlciA9IHRoaXMuY3JlYXRlU29ydGVyKCk7XG5cdFx0XHRcdGlmIChpbmNsdWRlUmVjZW50cykge1xuXHRcdFx0XHRcdGZpbGxFbnRyaWVzKGVudHJpZXMsIHJlY2VudCwgbmxzLmxvY2FsaXplKCdyZWNlbnRseVVzZWQnLCAncmVjZW50bHkgdXNlZCB0YXNrcycpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25maWd1cmVkID0gY29uZmlndXJlZC5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0XHRcdGZpbGxFbnRyaWVzKGVudHJpZXMsIGNvbmZpZ3VyZWQsIG5scy5sb2NhbGl6ZSgnY29uZmlndXJlZCcsICdjb25maWd1cmVkIHRhc2tzJykpO1xuXHRcdFx0XHRkZXRlY3RlZCA9IGRldGVjdGVkLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIpKTtcblx0XHRcdFx0ZmlsbEVudHJpZXMoZW50cmllcywgZGV0ZWN0ZWQsIG5scy5sb2NhbGl6ZSgnZGV0ZWN0ZWQnLCAnZGV0ZWN0ZWQgdGFza3MnKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChzb3J0KSB7XG5cdFx0XHRcdGNvbnN0IHNvcnRlciA9IHRoaXMuY3JlYXRlU29ydGVyKCk7XG5cdFx0XHRcdHRhc2tzID0gdGFza3Muc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdFx0fVxuXHRcdFx0ZW50cmllcyA9IHRhc2tzLm1hcDxJVGFza1F1aWNrUGlja0VudHJ5Pih0YXNrID0+IFRhc2tRdWlja1BpY2tFbnRyeSh0YXNrKSk7XG5cdFx0fVxuXHRcdGVuY291bnRlcmVkVGFza3MgPSB7fTtcblx0XHRyZXR1cm4gZW50cmllcztcblx0fVxuXHRwcml2YXRlIGFzeW5jIF9zaG93VHdvTGV2ZWxRdWlja1BpY2socGxhY2VIb2xkZXI6IHN0cmluZywgZGVmYXVsdEVudHJ5PzogSVRhc2tRdWlja1BpY2tFbnRyeSwgdHlwZT86IHN0cmluZywgbmFtZT86IHN0cmluZykge1xuXHRcdGNvbnN0IHRhc2tRdWlja1BpY2sgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrUXVpY2tQaWNrKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRhc2tRdWlja1BpY2suc2hvdyhwbGFjZUhvbGRlciwgZGVmYXVsdEVudHJ5LCB0eXBlLCBuYW1lKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGFza1F1aWNrUGljay5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1F1aWNrUGljayh0YXNrczogUHJvbWlzZTxUYXNrW10+IHwgVGFza1tdLCBwbGFjZUhvbGRlcjogc3RyaW5nLCBkZWZhdWx0RW50cnk/OiBJVGFza1F1aWNrUGlja0VudHJ5LCBncm91cDogYm9vbGVhbiA9IGZhbHNlLCBzb3J0OiBib29sZWFuID0gZmFsc2UsIHNlbGVjdGVkRW50cnk/OiBJVGFza1F1aWNrUGlja0VudHJ5LCBhZGRpdGlvbmFsRW50cmllcz86IElUYXNrUXVpY2tQaWNrRW50cnlbXSwgbmFtZT86IHN0cmluZyk6IFByb21pc2U8SVRhc2tRdWlja1BpY2tFbnRyeSB8IHVuZGVmaW5lZCB8IG51bGw+IHtcblx0XHRjb25zdCByZXNvbHZlZFRhc2tzID0gYXdhaXQgdGFza3M7XG5cdFx0Y29uc3QgZW50cmllczogKElUYXNrUXVpY2tQaWNrRW50cnkgfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdIHwgdW5kZWZpbmVkID0gYXdhaXQgcmFjZVRpbWVvdXQodGhpcy5fY3JlYXRlVGFza1F1aWNrUGlja0VudHJpZXMocmVzb2x2ZWRUYXNrcywgZ3JvdXAsIHNvcnQsIHNlbGVjdGVkRW50cnkpLCAyMDAsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFlbnRyaWVzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZW50cmllcy5sZW5ndGggPT09IDEgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUVVJQ0tPUEVOX1NLSVBfQ09ORklHKSkge1xuXHRcdFx0cmV0dXJuICg8SVRhc2tRdWlja1BpY2tFbnRyeT5lbnRyaWVzWzBdKTtcblx0XHR9IGVsc2UgaWYgKChlbnRyaWVzLmxlbmd0aCA9PT0gMCkgJiYgZGVmYXVsdEVudHJ5KSB7XG5cdFx0XHRlbnRyaWVzLnB1c2goZGVmYXVsdEVudHJ5KTtcblx0XHR9IGVsc2UgaWYgKGVudHJpZXMubGVuZ3RoID4gMSAmJiBhZGRpdGlvbmFsRW50cmllcyAmJiBhZGRpdGlvbmFsRW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6ICcnIH0pO1xuXHRcdFx0ZW50cmllcy5wdXNoKGFkZGl0aW9uYWxFbnRyaWVzWzBdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljazxJVGFza1F1aWNrUGlja0VudHJ5Pihcblx0XHRcdGVudHJpZXMsXG5cdFx0XHR7XG5cdFx0XHRcdHZhbHVlOiBuYW1lLFxuXHRcdFx0XHRwbGFjZUhvbGRlcixcblx0XHRcdFx0bWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlLFxuXHRcdFx0XHRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uOiBjb250ZXh0ID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXNrID0gY29udGV4dC5pdGVtLnRhc2s7XG5cdFx0XHRcdFx0dGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY2FuY2VsKCk7XG5cdFx0XHRcdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jdXN0b21pemUodGFzaywgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdHRoaXMub3BlbkNvbmZpZyh0YXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX25lZWRzUmVjZW50VGFza3NNaWdyYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLmdldFJlY2VudGx5VXNlZFRhc2tzVjEoKS5zaXplID4gMCkgJiYgKHRoaXMuX2dldFRhc2tzRnJvbVN0b3JhZ2UoJ2hpc3RvcmljYWwnKS5zaXplID09PSAwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX21pZ3JhdGVSZWNlbnRUYXNrcyh0YXNrczogVGFza1tdKSB7XG5cdFx0aWYgKCF0aGlzLl9uZWVkc1JlY2VudFRhc2tzTWlncmF0aW9uKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVjZW50bHlVc2VkVGFza3MgPSB0aGlzLmdldFJlY2VudGx5VXNlZFRhc2tzVjEoKTtcblx0XHRjb25zdCB0YXNrTWFwOiBJU3RyaW5nRGljdGlvbmFyeTxUYXNrPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGFza3MuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IHRhc2suZ2V0S2V5KCk7XG5cdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdHRhc2tNYXBba2V5XSA9IHRhc2s7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgcmV2ZXJzZWQgPSBbLi4ucmVjZW50bHlVc2VkVGFza3Mua2V5cygpXS5yZXZlcnNlKCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gcmV2ZXJzZWQpIHtcblx0XHRcdGNvbnN0IHRhc2sgPSB0YXNrTWFwW2tleV07XG5cdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZXRSZWNlbnRseVVzZWRUYXNrKHRhc2spO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoQWJzdHJhY3RUYXNrU2VydmljZS5SZWNlbnRseVVzZWRUYXNrc19LZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0lnbm9yZWRGb2xkZXJzTWVzc2FnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pZ25vcmVkV29ya3NwYWNlRm9sZGVycy5sZW5ndGggPT09IDAgfHwgIXRoaXMuc2hvd0lnbm9yZU1lc3NhZ2UpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmlnbm9yZWRGb2xkZXInLCAnVGhlIGZvbGxvd2luZyB3b3Jrc3BhY2UgZm9sZGVycyBhcmUgaWdub3JlZCBzaW5jZSB0aGV5IHVzZSB0YXNrIHZlcnNpb24gMC4xLjA6IHswfScsIHRoaXMuaWdub3JlZFdvcmtzcGFjZUZvbGRlcnMubWFwKGYgPT4gZi5uYW1lKS5qb2luKCcsICcpKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vdEFnYWluJywgXCJEb24ndCBTaG93IEFnYWluXCIpLFxuXHRcdFx0XHRpc1NlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWJzdHJhY3RUYXNrU2VydmljZS5JZ25vcmVUYXNrMDEwRG9ub3RTaG93QWdhaW5fa2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dJZ25vcmVNZXNzYWdlID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0KTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RydXN0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0KGdldEFjdGl2ZUVsZW1lbnQoKSk7XG5cdFx0aWYgKFNlcnZlcmxlc3NXZWJDb250ZXh0LmdldFZhbHVlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSAmJiAhVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQ/LmV2YWx1YXRlKGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZDtcblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3QoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnJlcXVlc3RUcnVzdCcsIFwiTGlzdGluZyBhbmQgcnVubmluZyB0YXNrcyByZXF1aXJlcyB0aGF0IHNvbWUgb2YgdGhlIGZpbGVzIGluIHRoaXMgd29ya3NwYWNlIGJlIGV4ZWN1dGVkIGFzIGNvZGUuXCIpXG5cdFx0XHRcdH0pKSA9PT0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5UYXNrQ29tbWFuZChmaWx0ZXI/OiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFmaWx0ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kb1J1blRhc2tDb21tYW5kKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHR5cGUgPSB0eXBlb2YgZmlsdGVyID09PSAnc3RyaW5nJyA/IHVuZGVmaW5lZCA6IGZpbHRlci50eXBlO1xuXHRcdGNvbnN0IHRhc2tOYW1lID0gdHlwZW9mIGZpbHRlciA9PT0gJ3N0cmluZycgPyBmaWx0ZXIgOiBmaWx0ZXIudGFzayBhcyBzdHJpbmc7XG5cdFx0Y29uc3QgZ3JvdXBlZCA9IGF3YWl0IHRoaXMuX2dldEdyb3VwZWRUYXNrcyh7IHR5cGUgfSk7XG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IHRoaXMuX2dldFRhc2tJZGVudGlmaWVyKGZpbHRlcik7XG5cdFx0Y29uc3QgdGFza3MgPSBncm91cGVkLmFsbCgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gdGhpcy5fY3JlYXRlUmVzb2x2ZXIoZ3JvdXBlZCk7XG5cdFx0Y29uc3QgZm9sZGVyVVJJczogKFVSSSB8IHN0cmluZylbXSA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKTtcblx0XHRpZiAodGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRmb2xkZXJVUklzLnB1c2godGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbiEpO1xuXHRcdH1cblx0XHRmb2xkZXJVUklzLnB1c2goVVNFUl9UQVNLU19HUk9VUF9LRVkpO1xuXHRcdGlmIChpZGVudGlmaWVyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiBmb2xkZXJVUklzKSB7XG5cdFx0XHRcdGNvbnN0IHRhc2sgPSBhd2FpdCByZXNvbHZlci5yZXNvbHZlKHVyaSwgaWRlbnRpZmllcik7XG5cdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0dGhpcy5ydW4odGFzayk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGV4YWN0TWF0Y2hUYXNrID0gIXRhc2tOYW1lID8gdW5kZWZpbmVkIDogdGFza3MuZmluZCh0ID0+IHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciA9PT0gdGFza05hbWUpO1xuXHRcdGlmICghZXhhY3RNYXRjaFRhc2spIHtcblx0XHRcdHJldHVybiB0aGlzLl9kb1J1blRhc2tDb21tYW5kKHRhc2tzLCB0eXBlLCB0YXNrTmFtZSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdXJpIG9mIGZvbGRlclVSSXMpIHtcblx0XHRcdGNvbnN0IHRhc2sgPSBhd2FpdCByZXNvbHZlci5yZXNvbHZlKHVyaSwgdGFza05hbWUpO1xuXHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5ydW4odGFzaywgeyBhdHRhY2hQcm9ibGVtTWF0Y2hlcjogdHJ1ZSB9LCBUYXNrUnVuU291cmNlLlVzZXIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdGFza3NBbmRHcm91cGVkVGFza3MoZmlsdGVyPzogSVRhc2tGaWx0ZXIpOiB7IHRhc2tzOiBQcm9taXNlPFRhc2tbXT47IGdyb3VwZWQ6IFByb21pc2U8VGFza01hcD4gfSB7XG5cdFx0aWYgKCF0aGlzLl92ZXJzaW9uQW5kRW5naW5lQ29tcGF0aWJsZShmaWx0ZXIpKSB7XG5cdFx0XHRyZXR1cm4geyB0YXNrczogUHJvbWlzZS5yZXNvbHZlPFRhc2tbXT4oW10pLCBncm91cGVkOiBQcm9taXNlLnJlc29sdmUobmV3IFRhc2tNYXAoKSkgfTtcblx0XHR9XG5cdFx0Y29uc3QgZ3JvdXBlZCA9IHRoaXMuX2dldEdyb3VwZWRUYXNrcyhmaWx0ZXIpO1xuXHRcdGNvbnN0IHRhc2tzID0gZ3JvdXBlZC50aGVuKChtYXApID0+IHtcblx0XHRcdGlmICghZmlsdGVyIHx8ICFmaWx0ZXIudHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gbWFwLmFsbCgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0OiBUYXNrW10gPSBbXTtcblx0XHRcdG1hcC5mb3JFYWNoKCh0YXNrcykgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spICYmIHRhc2suZGVmaW5lcy50eXBlID09PSBmaWx0ZXIudHlwZSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHRpZiAodGFzay50eXBlID09PSBmaWx0ZXIudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGN1c3RvbWl6ZXMgPSB0YXNrLmN1c3RvbWl6ZXMoKTtcblx0XHRcdFx0XHRcdFx0aWYgKGN1c3RvbWl6ZXMgJiYgY3VzdG9taXplcy50eXBlID09PSBmaWx0ZXIudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHsgdGFza3MsIGdyb3VwZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgX2RvUnVuVGFza0NvbW1hbmQodGFza3M/OiBUYXNrW10sIHR5cGU/OiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwaWNrVGhlbiA9ICh0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCkgPT4ge1xuXHRcdFx0aWYgKHRhc2sgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFzayA9PT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5ydW4odGFzaywgeyBhdHRhY2hQcm9ibGVtTWF0Y2hlcjogdHJ1ZSB9LCBUYXNrUnVuU291cmNlLlVzZXIpLnRoZW4odW5kZWZpbmVkLCByZWFzb24gPT4ge1xuXHRcdFx0XHRcdC8vIGVhdCB0aGUgZXJyb3IsIGl0IGhhcyBhbHJlYWR5IGJlZW4gc3VyZmFjZWQgdG8gdGhlIHVzZXIgYW5kIHdlIGRvbid0IGNhcmUgYWJvdXQgaXQgaGVyZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnBpY2tSdW5UYXNrJywgJ1NlbGVjdCB0aGUgdGFzayB0byBydW4nKTtcblxuXHRcdHRoaXMuX3Nob3dJZ25vcmVkRm9sZGVyc01lc3NhZ2UoKS50aGVuKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShVU0VfU0xPV19QSUNLRVIpKSB7XG5cdFx0XHRcdGxldCB0YXNrUmVzdWx0OiB7IHRhc2tzOiBQcm9taXNlPFRhc2tbXT47IGdyb3VwZWQ6IFByb21pc2U8VGFza01hcD4gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCF0YXNrcykge1xuXHRcdFx0XHRcdHRhc2tSZXN1bHQgPSB0aGlzLl90YXNrc0FuZEdyb3VwZWRUYXNrcygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Nob3dRdWlja1BpY2sodGFza3MgPyB0YXNrcyA6IHRhc2tSZXN1bHQhLnRhc2tzLCBwbGFjZWhvbGRlcixcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJyQocGx1cykgJyArIG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9FbnRyeVRvUnVuJywgJ0NvbmZpZ3VyZSBhIFRhc2snKSxcblx0XHRcdFx0XHRcdHRhc2s6IG51bGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG5hbWUpLlxuXHRcdFx0XHRcdHRoZW4oKGVudHJ5KSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGlja1RoZW4oZW50cnkgPyBlbnRyeS50YXNrIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dUd29MZXZlbFF1aWNrUGljayhwbGFjZWhvbGRlcixcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJyQocGx1cykgJyArIG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9FbnRyeVRvUnVuJywgJ0NvbmZpZ3VyZSBhIFRhc2snKSxcblx0XHRcdFx0XHRcdHRhc2s6IG51bGxcblx0XHRcdFx0XHR9LCB0eXBlLCBuYW1lKS5cblx0XHRcdFx0XHR0aGVuKHBpY2tUaGVuKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cblx0YXN5bmMgcmVydW4odGVybWluYWxJbnN0YW5jZUlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXNrID0gYXdhaXQgdGhpcy5fdGFza1N5c3RlbT8uZ2V0VGFza0ZvclRlcm1pbmFsKHRlcm1pbmFsSW5zdGFuY2VJZCk7XG5cdFx0aWYgKHRhc2spIHtcblx0XHRcdHRoaXMuX3Jlc3RhcnQodGFzayk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlUnVuVGFza0NvbW1hbmQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVSdW5UYXNrQ29tbWFuZChvbmx5UmVydW4/OiBib29sZWFuKTogdm9pZCB7XG5cblx0XHRQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5Lm9uUmVhZHkoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0b3JTZXJ2aWNlLnNhdmVBbGwoeyByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSkudGhlbigoKSA9PiB7IC8vIG1ha2Ugc3VyZSBhbGwgZGlydHkgZWRpdG9ycyBhcmUgc2F2ZWRcblx0XHRcdFx0Y29uc3QgZXhlY3V0ZVJlc3VsdCA9IHRoaXMuX2dldFRhc2tTeXN0ZW0oKS5yZXJ1bigpO1xuXHRcdFx0XHRpZiAoZXhlY3V0ZVJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVFeGVjdXRlUmVzdWx0KGV4ZWN1dGVSZXN1bHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICghb25seVJlcnVuICYmICF0aGlzLl90YXNrUnVubmluZ1N0YXRlLmdldCgpKSB7XG5cdFx0XHRcdFx0XHQvLyBObyB0YXNrIHJ1bm5pbmcsIHByb21wdCB0byBhc2sgd2hpY2ggdG8gcnVuXG5cdFx0XHRcdFx0XHR0aGlzLl9kb1J1blRhc2tDb21tYW5kKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogQHBhcmFtIHRhc2tzIC0gVGhlIHRhc2tzIHdoaWNoIG5lZWQgdG8gYmUgZmlsdGVyZWRcblx0ICogQHBhcmFtIHRhc2tzSW5MaXN0IC0gVGhpcyB0ZWxscyBzcGxpdFBlckdyb3VwVHlwZSB0byBmaWx0ZXIgb3V0IGdsb2JiZWQgdGFza3MgKGludG8gZGVmYXVsdHMpXG5cdCAqIEByZXR1cm5zXG5cdCAqL1xuXHRwcml2YXRlIF9nZXREZWZhdWx0VGFza3ModGFza3M6IFRhc2tbXSwgdGFza0dsb2JzSW5MaXN0OiBib29sZWFuID0gZmFsc2UpOiBUYXNrW10ge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBUYXNrW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MuZmlsdGVyKHQgPT4gISF0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKSkge1xuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCAoYXNzdW1pbmcgdGFza0dsb2JzSW5MaXN0IGlzIHRydWUpIHRoZXJlIGFyZSB0YXNrcyB3aXRoIG1hdGNoaW5nIGdsb2JzLCBzbyBvbmx5IHB1dCB0aG9zZSBpbiBkZWZhdWx0c1xuXHRcdFx0aWYgKHRhc2tHbG9ic0luTGlzdCAmJiB0eXBlb2YgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgYXMgVGFza0dyb3VwKS5pc0RlZmF1bHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGRlZmF1bHRzLnB1c2godGFzayk7XG5cdFx0XHR9IGVsc2UgaWYgKCF0YXNrR2xvYnNJbkxpc3QgJiYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgYXMgVGFza0dyb3VwKS5pc0RlZmF1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0ZGVmYXVsdHMucHVzaCh0YXNrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuVGFza0dyb3VwQ29tbWFuZCh0YXNrR3JvdXA6IFRhc2tHcm91cCwgc3RyaW5nczoge1xuXHRcdGZldGNoaW5nOiBzdHJpbmc7XG5cdFx0c2VsZWN0OiBzdHJpbmc7XG5cdFx0bm90Rm91bmRDb25maWd1cmU6IHN0cmluZztcblx0fSwgY29uZmlndXJlOiAoKSA9PiB2b2lkLCBsZWdhY3lDb21tYW5kOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2NoZW1hVmVyc2lvbiA9PT0gSnNvblNjaGVtYVZlcnNpb24uVjBfMV8wKSB7XG5cdFx0XHRsZWdhY3lDb21tYW5kKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnM6IElQcm9ncmVzc09wdGlvbnMgPSB7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHR0aXRsZTogc3RyaW5ncy5mZXRjaGluZ1xuXHRcdH07XG5cdFx0Y29uc3QgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHJ1blNpbmdsZVRhc2sodGFzazogVGFzayB8IHVuZGVmaW5lZCwgcHJvYmxlbU1hdGNoZXJPcHRpb25zOiBJUHJvYmxlbU1hdGNoZXJSdW5PcHRpb25zIHwgdW5kZWZpbmVkLCB0aGF0OiBBYnN0cmFjdFRhc2tTZXJ2aWNlKSB7XG5cdFx0XHRcdHRoYXQucnVuKHRhc2ssIHByb2JsZW1NYXRjaGVyT3B0aW9ucywgVGFza1J1blNvdXJjZS5Vc2VyKS50aGVuKHVuZGVmaW5lZCwgcmVhc29uID0+IHtcblx0XHRcdFx0XHQvLyBlYXQgdGhlIGVycm9yLCBpdCBoYXMgYWxyZWFkeSBiZWVuIHN1cmZhY2VkIHRvIHRoZSB1c2VyIGFuZCB3ZSBkb24ndCBjYXJlIGFib3V0IGl0IGhlcmVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaG9vc2VBbmRSdW5UYXNrID0gKHRhc2tzOiBUYXNrW10pID0+IHtcblx0XHRcdFx0dGhpcy5fc2hvd0lnbm9yZWRGb2xkZXJzTWVzc2FnZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dRdWlja1BpY2sodGFza3MsXG5cdFx0XHRcdFx0XHRzdHJpbmdzLnNlbGVjdCxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHN0cmluZ3Mubm90Rm91bmRDb25maWd1cmUsXG5cdFx0XHRcdFx0XHRcdHRhc2s6IG51bGxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0cnVlKS50aGVuKChlbnRyeSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCA9IGVudHJ5ID8gZW50cnkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKHRhc2sgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAodGFzayA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbmZpZ3VyZS5hcHBseSh0aGlzKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cnVuU2luZ2xlVGFzayh0YXNrLCB7IGF0dGFjaFByb2JsZW1NYXRjaGVyOiB0cnVlIH0sIHRoaXMpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblx0XHRcdGxldCBncm91cFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSA9IFtdO1xuXHRcdFx0Y29uc3QgeyBnbG9iR3JvdXBUYXNrcywgZ2xvYlRhc2tzRGV0ZWN0ZWQgfSA9IGF3YWl0IHRoaXMuX2dldEdsb2JUYXNrcyh0YXNrR3JvdXAuX2lkKTtcblx0XHRcdGdyb3VwVGFza3MgPSBbLi4uZ2xvYkdyb3VwVGFza3NdO1xuXHRcdFx0aWYgKCFnbG9iVGFza3NEZXRlY3RlZCAmJiBncm91cFRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRncm91cFRhc2tzID0gYXdhaXQgdGhpcy5fZmluZFdvcmtzcGFjZVRhc2tzSW5Hcm91cCh0YXNrR3JvdXAsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBoYW5kbGVNdWx0aXBsZVRhc2tzID0gKGFyZUdsb2JUYXNrczogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0VGFza3NGb3JHcm91cCh0YXNrR3JvdXApLnRoZW4oKHRhc2tzKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdC8vIElmIHdlJ3JlIGRlYWxpbmcgd2l0aCB0YXNrcyB0aGF0IHdlcmUgY2hvc2VuIGJlY2F1c2Ugb2YgYSBnbG9iIG1hdGNoLFxuXHRcdFx0XHRcdFx0Ly8gdGhlbiBwdXQgZ2xvYnMgaW4gdGhlIGRlZmF1bHRzIGFuZCBldmVyeXRoaW5nIGVsc2UgaW4gbm9uZVxuXHRcdFx0XHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLl9nZXREZWZhdWx0VGFza3ModGFza3MsIGFyZUdsb2JUYXNrcyk7XG5cdFx0XHRcdFx0XHRpZiAoZGVmYXVsdHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdHJ1blNpbmdsZVRhc2soZGVmYXVsdHNbMF0sIHVuZGVmaW5lZCwgdGhpcyk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZGVmYXVsdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHR0YXNrcyA9IGRlZmF1bHRzO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEF0IHRoaXMgdGhpcyBwb2ludCB0aGVyZSBhcmUgbXVsdGlwbGUgdGFza3MuXG5cdFx0XHRcdFx0Y2hvb3NlQW5kUnVuVGFzayh0YXNrcyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzb2x2ZVRhc2tBbmRSdW4gPSAodGFza0dyb3VwVGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzaykgPT4ge1xuXHRcdFx0XHRpZiAoQ29uZmlndXJpbmdUYXNrLmlzKHRhc2tHcm91cFRhc2spKSB7XG5cdFx0XHRcdFx0dGhpcy50cnlSZXNvbHZlVGFzayh0YXNrR3JvdXBUYXNrKS50aGVuKHJlc29sdmVkVGFzayA9PiB7XG5cdFx0XHRcdFx0XHRydW5TaW5nbGVUYXNrKHJlc29sdmVkVGFzaywgdW5kZWZpbmVkLCB0aGlzKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRydW5TaW5nbGVUYXNrKHRhc2tHcm91cFRhc2ssIHVuZGVmaW5lZCwgdGhpcyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIEEgc2luZ2xlIGRlZmF1bHQgZ2xvYiB0YXNrIHdhcyByZXR1cm5lZCwganVzdCBydW4gaXQgZGlyZWN0bHlcblx0XHRcdGlmIChncm91cFRhc2tzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZVRhc2tBbmRSdW4oZ3JvdXBUYXNrc1swXSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZXJlJ3MgbXVsdGlwbGUgZ2xvYnMgdGhhdCBtYXRjaCB3ZSB3YW50IHRvIHNob3cgdGhlIHF1aWNrIHBpY2tlciBmb3IgdGhvc2UgdGFza3Ncblx0XHRcdC8vIFdlIHdpbGwgbmVlZCB0byBjYWxsIHNwbGl0UGVyR3JvdXBUeXBlIHB1dHRpbmcgZ2xvYnMgaW4gZGVmYXVsdHMgYW5kIHRoZSByZW1haW5pbmcgdGFza3MgaW4gbm9uZS5cblx0XHRcdC8vIFdlIGRvbid0IG5lZWQgdG8gY2Fycnkgb24gYWZ0ZXIgaGVyZVxuXHRcdFx0aWYgKGdsb2JUYXNrc0RldGVjdGVkICYmIGdyb3VwVGFza3MubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRyZXR1cm4gaGFuZGxlTXVsdGlwbGVUYXNrcyh0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm8gZ2xvYnMgYXJlIGZvdW5kIG9yIG1hdGNoZWQgZmFsbGJhY2sgdG8gY2hlY2tpbmcgZm9yIGRlZmF1bHQgdGFza3Mgb2YgdGhlIHRhc2sgZ3JvdXBcblx0XHRcdGlmICghZ3JvdXBUYXNrcy5sZW5ndGgpIHtcblx0XHRcdFx0Z3JvdXBUYXNrcyA9IGF3YWl0IHRoaXMuX2ZpbmRXb3Jrc3BhY2VUYXNrc0luR3JvdXAodGFza0dyb3VwLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGdyb3VwVGFza3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdC8vIEEgc2luZ2xlIGRlZmF1bHQgdGFzayB3YXMgcmV0dXJuZWQsIGp1c3QgcnVuIGl0IGRpcmVjdGx5XG5cdFx0XHRcdHJldHVybiByZXNvbHZlVGFza0FuZFJ1bihncm91cFRhc2tzWzBdKTtcblx0XHRcdH1cblx0XHRcdC8vIE11bHRpcGxlIGRlZmF1bHQgdGFza3MgcmV0dXJuZWQsIHNob3cgdGhlIHF1aWNrUGlja2VyXG5cdFx0XHRyZXR1cm4gaGFuZGxlTXVsdGlwbGVUYXNrcyhmYWxzZSk7XG5cdFx0fSkoKTtcblx0XHR0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKG9wdGlvbnMsICgpID0+IHByb21pc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0R2xvYlRhc2tzKHRhc2tHcm91cElkOiBzdHJpbmcpOiBQcm9taXNlPHsgZ2xvYkdyb3VwVGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdOyBnbG9iVGFza3NEZXRlY3RlZDogYm9vbGVhbiB9PiB7XG5cdFx0bGV0IGdsb2JUYXNrc0RldGVjdGVkID0gZmFsc2U7XG5cdFx0Ly8gRmlyc3QgY2hlY2sgZm9yIGdsb2JzIGJlZm9yZSBjaGVja2luZyBmb3IgdGhlIGRlZmF1bHQgdGFza3Mgb2YgdGhlIHRhc2sgZ3JvdXBcblx0XHRjb25zdCBhYnNvbHV0ZVVSSSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IpO1xuXHRcdGlmIChhYnNvbHV0ZVVSSSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGFic29sdXRlVVJJKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJlZFRhc2tzID0gdGhpcy5fZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIpPy5jb25maWc/LnRhc2tzO1xuXHRcdFx0XHRpZiAoY29uZmlndXJlZFRhc2tzKSB7XG5cdFx0XHRcdFx0Z2xvYlRhc2tzRGV0ZWN0ZWQgPSBjb25maWd1cmVkVGFza3MuZmlsdGVyKHRhc2sgPT4gdGFzay5ncm91cCAmJiB0eXBlb2YgdGFzay5ncm91cCAhPT0gJ3N0cmluZycgJiYgdHlwZW9mIHRhc2suZ3JvdXAuaXNEZWZhdWx0ID09PSAnc3RyaW5nJykubGVuZ3RoID4gMDtcblx0XHRcdFx0XHQvLyBUaGlzIHdpbGwgYWN0aXZhdGUgZXh0ZW5zaW9ucywgc28gb25seSBkbyBzbyBpZiBuZWNlc3NhcnkgIzE4NTk2MFxuXHRcdFx0XHRcdGlmIChnbG9iVGFza3NEZXRlY3RlZCkge1xuXHRcdFx0XHRcdFx0Ly8gRmFsbGJhY2sgdG8gYWJzb2x1dGUgcGF0aCBvZiB0aGUgZmlsZSBpZiBpdCBpcyBub3QgaW4gYSB3b3Jrc3BhY2Ugb3IgcmVsYXRpdmUgcGF0aCBjYW5ub3QgYmUgZm91bmRcblx0XHRcdFx0XHRcdGNvbnN0IHJlbGF0aXZlUGF0aCA9IHdvcmtzcGFjZUZvbGRlcj8udXJpID8gKHJlc291cmNlcy5yZWxhdGl2ZVBhdGgod29ya3NwYWNlRm9sZGVyLnVyaSwgYWJzb2x1dGVVUkkpID8/IGFic29sdXRlVVJJLnBhdGgpIDogYWJzb2x1dGVVUkkucGF0aDtcblxuXHRcdFx0XHRcdFx0Y29uc3QgZ2xvYkdyb3VwVGFza3MgPSBhd2FpdCB0aGlzLl9maW5kV29ya3NwYWNlVGFza3MoKHRhc2spID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFRhc2tHcm91cCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXA7XG5cdFx0XHRcdFx0XHRcdGlmIChjdXJyZW50VGFza0dyb3VwICYmIHR5cGVvZiBjdXJyZW50VGFza0dyb3VwICE9PSAnc3RyaW5nJyAmJiB0eXBlb2YgY3VycmVudFRhc2tHcm91cC5pc0RlZmF1bHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIChjdXJyZW50VGFza0dyb3VwLl9pZCA9PT0gdGFza0dyb3VwSWQgJiYgZ2xvYi5tYXRjaChjdXJyZW50VGFza0dyb3VwLmlzRGVmYXVsdCwgcmVsYXRpdmVQYXRoLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Z2xvYlRhc2tzRGV0ZWN0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBnbG9iR3JvdXBUYXNrcywgZ2xvYlRhc2tzRGV0ZWN0ZWQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgZ2xvYkdyb3VwVGFza3M6IFtdLCBnbG9iVGFza3NEZXRlY3RlZCB9O1xuXG5cdH1cblxuXHRwcml2YXRlIF9ydW5CdWlsZENvbW1hbmQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90YXNrc1JlY29ubmVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9ydW5UYXNrR3JvdXBDb21tYW5kKFRhc2tHcm91cC5CdWlsZCwge1xuXHRcdFx0ZmV0Y2hpbmc6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuZmV0Y2hpbmdCdWlsZFRhc2tzJywgJ0ZldGNoaW5nIGJ1aWxkIHRhc2tzLi4uJyksXG5cdFx0XHRzZWxlY3Q6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja0J1aWxkVGFzaycsICdTZWxlY3QgdGhlIGJ1aWxkIHRhc2sgdG8gcnVuJyksXG5cdFx0XHRub3RGb3VuZENvbmZpZ3VyZTogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub0J1aWxkVGFzaycsICdObyBidWlsZCB0YXNrIHRvIHJ1biBmb3VuZC4gQ29uZmlndXJlIEJ1aWxkIFRhc2suLi4nKVxuXHRcdH0sIHRoaXMuX3J1bkNvbmZpZ3VyZURlZmF1bHRCdWlsZFRhc2ssIHRoaXMuX2J1aWxkKTtcblx0fVxuXG5cdHByaXZhdGUgX3J1blRlc3RDb21tYW5kKCk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLl9ydW5UYXNrR3JvdXBDb21tYW5kKFRhc2tHcm91cC5UZXN0LCB7XG5cdFx0XHRmZXRjaGluZzogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5mZXRjaGluZ1Rlc3RUYXNrcycsICdGZXRjaGluZyB0ZXN0IHRhc2tzLi4uJyksXG5cdFx0XHRzZWxlY3Q6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1Rlc3RUYXNrJywgJ1NlbGVjdCB0aGUgdGVzdCB0YXNrIHRvIHJ1bicpLFxuXHRcdFx0bm90Rm91bmRDb25maWd1cmU6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9UZXN0VGFza1Rlcm1pbmFsJywgJ05vIHRlc3QgdGFzayB0byBydW4gZm91bmQuIENvbmZpZ3VyZSBUYXNrcy4uLicpXG5cdFx0fSwgdGhpcy5fcnVuQ29uZmlndXJlRGVmYXVsdFRlc3RUYXNrLCB0aGlzLl9ydW5UZXN0KTtcblx0fVxuXG5cdHByaXZhdGUgX3J1blRlcm1pbmF0ZUNvbW1hbmQoYXJnPzogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0aWYgKGFyZyA9PT0gJ3Rlcm1pbmF0ZUFsbCcpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmF0ZUFsbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBydW5RdWlja1BpY2sgPSAocHJvbWlzZT86IFByb21pc2U8VGFza1tdPikgPT4ge1xuXHRcdFx0dGhpcy5fc2hvd1F1aWNrUGljayhwcm9taXNlIHx8IHRoaXMuZ2V0QWN0aXZlVGFza3MoKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS50YXNrVG9UZXJtaW5hdGUnLCAnU2VsZWN0IGEgdGFzayB0byB0ZXJtaW5hdGUnKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vVGFza1J1bm5pbmcnLCAnTm8gdGFzayBpcyBjdXJyZW50bHkgcnVubmluZycpLFxuXHRcdFx0XHRcdHRhc2s6IHVuZGVmaW5lZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmYWxzZSwgdHJ1ZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnRlcm1pbmF0ZUFsbFJ1bm5pbmdUYXNrcycsICdBbGwgUnVubmluZyBUYXNrcycpLFxuXHRcdFx0XHRcdGlkOiAndGVybWluYXRlQWxsJyxcblx0XHRcdFx0XHR0YXNrOiB1bmRlZmluZWRcblx0XHRcdFx0fV1cblx0XHRcdCkudGhlbihlbnRyeSA9PiB7XG5cdFx0XHRcdGlmIChlbnRyeSAmJiBlbnRyeS5pZCA9PT0gJ3Rlcm1pbmF0ZUFsbCcpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hdGVBbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCA9IGVudHJ5ID8gZW50cnkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRhc2sgPT09IHVuZGVmaW5lZCB8fCB0YXNrID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudGVybWluYXRlKHRhc2spO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRpZiAodGhpcy5pblRlcm1pbmFsKCkpIHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0aGlzLl9nZXRUYXNrSWRlbnRpZmllcihhcmcpO1xuXHRcdFx0bGV0IHByb21pc2U6IFByb21pc2U8VGFza1tdPjtcblx0XHRcdGlmIChpZGVudGlmaWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cHJvbWlzZSA9IHRoaXMuZ2V0QWN0aXZlVGFza3MoKTtcblx0XHRcdFx0cHJvbWlzZS50aGVuKCh0YXNrcykgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdFx0aWYgKHRhc2subWF0Y2hlcyhpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnRlcm1pbmF0ZSh0YXNrKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRydW5RdWlja1BpY2socHJvbWlzZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cnVuUXVpY2tQaWNrKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lzQWN0aXZlKCkudGhlbigoYWN0aXZlKSA9PiB7XG5cdFx0XHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hdGVBbGwoKS50aGVuKChyZXNwb25zZXMpID0+IHtcblx0XHRcdFx0XHRcdC8vIHRoZSBvdXRwdXQgcnVubmVyIGhhcyBvbmx5IG9uZSB0YXNrXG5cdFx0XHRcdFx0XHRjb25zdCByZXNwb25zZSA9IHJlc3BvbnNlc1swXTtcblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZS5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZS5jb2RlICYmIHJlc3BvbnNlLmNvZGUgPT09IFRlcm1pbmF0ZVJlc3BvbnNlQ29kZS5Qcm9jZXNzTm90Rm91bmQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ1Rlcm1pbmF0ZUFjdGlvbi5ub1Byb2Nlc3MnLCAnVGhlIGxhdW5jaGVkIHByb2Nlc3MgZG9lc25cXCd0IGV4aXN0IGFueW1vcmUuIElmIHRoZSB0YXNrIHNwYXduZWQgYmFja2dyb3VuZCB0YXNrcyBleGl0aW5nIFZTIENvZGUgbWlnaHQgcmVzdWx0IGluIG9ycGhhbmVkIHByb2Nlc3Nlcy4nKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnVGVybWluYXRlQWN0aW9uLmZhaWxlZCcsICdGYWlsZWQgdG8gdGVybWluYXRlIHJ1bm5pbmcgdGFzaycpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuUmVzdGFydFRhc2tDb21tYW5kKGFyZz86IHN0cmluZyB8IElUYXNrSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgYWN0aXZlVGFza3MgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZVRhc2tzKCk7XG5cblx0XHRpZiAoYWN0aXZlVGFza3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLl9yZXN0YXJ0KGFjdGl2ZVRhc2tzWzBdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pblRlcm1pbmFsKCkpIHtcblx0XHRcdC8vIHRyeSBkaXNwYXRjaGluZyB1c2luZyB0YXNrIGlkZW50aWZpZXJcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0aGlzLl9nZXRUYXNrSWRlbnRpZmllcihhcmcpO1xuXHRcdFx0aWYgKGlkZW50aWZpZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgYWN0aXZlVGFza3MpIHtcblx0XHRcdFx0XHRpZiAodGFzay5tYXRjaGVzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXN0YXJ0KHRhc2spO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gc2hvdyBxdWljayBwaWNrIHdpdGggYWN0aXZlIHRhc2tzXG5cdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHRoaXMuX3Nob3dRdWlja1BpY2soXG5cdFx0XHRcdGFjdGl2ZVRhc2tzLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnRhc2tUb1Jlc3RhcnQnLCAnU2VsZWN0IHRoZSB0YXNrIHRvIHJlc3RhcnQnKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vVGFza1RvUmVzdGFydCcsICdObyB0YXNrIHRvIHJlc3RhcnQnKSxcblx0XHRcdFx0XHR0YXNrOiBudWxsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGVudHJ5ICYmIGVudHJ5LnRhc2spIHtcblx0XHRcdFx0dGhpcy5fcmVzdGFydChlbnRyeS50YXNrKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGFjdGl2ZVRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fcmVzdGFydChhY3RpdmVUYXNrc1swXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuUmVydW5BbGxSdW5uaW5nVGFza3NDb21tYW5kKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZVRhc2tzID0gYXdhaXQgdGhpcy5nZXRBY3RpdmVUYXNrcygpO1xuXG5cdFx0aWYgKGFjdGl2ZVRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9SdW5uaW5nVGFza3MnLCAnTm8gcnVubmluZyB0YXNrcyB0byByZXN0YXJ0JykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RhcnQgYWxsIGFjdGl2ZSB0YXNrc1xuXHRcdGNvbnN0IHJlc3RhcnRQcm9taXNlcyA9IGFjdGl2ZVRhc2tzLm1hcCh0YXNrID0+IHRoaXMuX3Jlc3RhcnQodGFzaykpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChyZXN0YXJ0UHJvbWlzZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGFza0lkZW50aWZpZXIoZmlsdGVyPzogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyKTogc3RyaW5nIHwgS2V5ZWRUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc3VsdDogc3RyaW5nIHwgS2V5ZWRUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZmlsdGVyKSkge1xuXHRcdFx0cmVzdWx0ID0gZmlsdGVyO1xuXHRcdH0gZWxzZSBpZiAoZmlsdGVyICYmIFR5cGVzLmlzU3RyaW5nKGZpbHRlci50eXBlKSkge1xuXHRcdFx0cmVzdWx0ID0gVGFza0RlZmluaXRpb24uY3JlYXRlVGFza0lkZW50aWZpZXIoZmlsdGVyLCBjb25zb2xlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpZ0hhc1Rhc2tzKHRhc2tDb25maWc/OiBUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGFza0NvbmZpZyAmJiAhIXRhc2tDb25maWcudGFza3MgJiYgdGFza0NvbmZpZy50YXNrcy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3BlblRhc2tGaWxlKHJlc291cmNlOiBVUkksIHRhc2tTb3VyY2U6IHN0cmluZykge1xuXHRcdGxldCBjb25maWdGaWxlQ3JlYXRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpLnRoZW4oKHN0YXQpID0+IHN0YXQsICgpID0+IHVuZGVmaW5lZCkudGhlbihhc3luYyAoc3RhdCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZUV4aXN0czogYm9vbGVhbiA9ICEhc3RhdDtcblx0XHRcdGNvbnN0IGNvbmZpZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uPigndGFza3MnLCB7IHJlc291cmNlIH0pO1xuXHRcdFx0bGV0IHRhc2tzRXhpc3RJbkZpbGU6IGJvb2xlYW47XG5cdFx0XHRsZXQgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0O1xuXHRcdFx0c3dpdGNoICh0YXNrU291cmNlKSB7XG5cdFx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuVXNlcjogdGFza3NFeGlzdEluRmlsZSA9IHRoaXMuX2NvbmZpZ0hhc1Rhc2tzKGNvbmZpZ1ZhbHVlLnVzZXJWYWx1ZSk7IHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlRmlsZTogdGFza3NFeGlzdEluRmlsZSA9IHRoaXMuX2NvbmZpZ0hhc1Rhc2tzKGNvbmZpZ1ZhbHVlLndvcmtzcGFjZVZhbHVlKTsgdGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U7IGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OiB0YXNrc0V4aXN0SW5GaWxlID0gdGhpcy5fY29uZmlnSGFzVGFza3MoY29uZmlnVmFsdWUud29ya3NwYWNlRm9sZGVyVmFsdWUpOyB0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY29udGVudDtcblx0XHRcdGlmICghdGFza3NFeGlzdEluRmlsZSkge1xuXHRcdFx0XHRjb25zdCBwaWNrVGVtcGxhdGVSZXN1bHQgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKGdldFRhc2tUZW1wbGF0ZXMoKSwgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS50ZW1wbGF0ZScsICdTZWxlY3QgYSBUYXNrIFRlbXBsYXRlJykgfSk7XG5cdFx0XHRcdGlmICghcGlja1RlbXBsYXRlUmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRlbnQgPSBwaWNrVGVtcGxhdGVSZXN1bHQuY29udGVudDtcblx0XHRcdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoKSBhcyB7IGVkaXRvcjogeyBpbnNlcnRTcGFjZXM6IGJvb2xlYW47IHRhYlNpemU6IG51bWJlciB9IH07XG5cdFx0XHRcdGlmIChlZGl0b3JDb25maWcuZWRpdG9yLmluc2VydFNwYWNlcykge1xuXHRcdFx0XHRcdGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLyhcXG4pKFxcdCspL2csIChfLCBzMSwgczIpID0+IHMxICsgJyAnLnJlcGVhdChzMi5sZW5ndGggKiBlZGl0b3JDb25maWcuZWRpdG9yLnRhYlNpemUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25maWdGaWxlQ3JlYXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZmlsZUV4aXN0cyAmJiBjb250ZW50KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl90ZXh0RmlsZVNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlLCB2YWx1ZTogY29udGVudCB9XSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHRbMF0ucmVzb3VyY2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChmaWxlRXhpc3RzICYmICh0YXNrc0V4aXN0SW5GaWxlIHx8IGNvbnRlbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRSZXNvdXJjZSA9IHN0YXQ/LnJlc291cmNlO1xuXHRcdFx0XHRpZiAoY29udGVudCAmJiBzdGF0UmVzb3VyY2UpIHtcblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgndGFza3MnLCBqc29uLnBhcnNlKGNvbnRlbnQpLCB7IHJlc291cmNlOiBzdGF0UmVzb3VyY2UgfSwgdGFyZ2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3RhdFJlc291cmNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KS50aGVuKChyZXNvdXJjZSkgPT4ge1xuXHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHBpbm5lZDogY29uZmlnRmlsZUNyZWF0ZWQgLy8gcGluIG9ubHkgaWYgY29uZmlnIGZpbGUgaXMgY3JlYXRlZCAjODcyN1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVGFza0VudHJ5KHZhbHVlOiBJUXVpY2tQaWNrSXRlbSk6IHZhbHVlIGlzIElRdWlja1BpY2tJdGVtICYgeyB0YXNrOiBUYXNrIH0ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZTogSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSA9IHZhbHVlIGFzIElRdWlja1BpY2tJdGVtICYgeyB0YXNrOiBUYXNrIH07XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiAhIWNhbmRpZGF0ZS50YXNrO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNTZXR0aW5nRW50cnkodmFsdWU6IElRdWlja1BpY2tJdGVtKTogdmFsdWUgaXMgSVF1aWNrUGlja0l0ZW0gJiB7IHNldHRpbmdUeXBlOiBzdHJpbmcgfSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlOiBJUXVpY2tQaWNrSXRlbSAmIHsgc2V0dGluZ1R5cGU6IHN0cmluZyB9ID0gdmFsdWUgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHNldHRpbmdUeXBlOiBzdHJpbmcgfTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlICYmICEhY2FuZGlkYXRlLnNldHRpbmdUeXBlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlndXJlVGFzayh0YXNrOiBUYXNrKSB7XG5cdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0dGhpcy5jdXN0b21pemUodGFzaywgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHR9IGVsc2UgaWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdHRoaXMub3BlbkNvbmZpZyh0YXNrKTtcblx0XHR9IGVsc2UgaWYgKENvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0Ly8gRG8gbm90aGluZy5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTZWxlY3Rpb24oc2VsZWN0aW9uOiBUYXNrUXVpY2tQaWNrRW50cnlUeXBlIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzVGFza0VudHJ5KHNlbGVjdGlvbikpIHtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyZVRhc2soc2VsZWN0aW9uLnRhc2spO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNTZXR0aW5nRW50cnkoc2VsZWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgdGFza1F1aWNrUGljayA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tRdWlja1BpY2spO1xuXHRcdFx0dGFza1F1aWNrUGljay5oYW5kbGVTZXR0aW5nT3B0aW9uKHNlbGVjdGlvbi5zZXR0aW5nVHlwZSk7XG5cdFx0fSBlbHNlIGlmIChzZWxlY3Rpb24uZm9sZGVyICYmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkpIHtcblx0XHRcdHRoaXMuX29wZW5UYXNrRmlsZShzZWxlY3Rpb24uZm9sZGVyLnRvUmVzb3VyY2UoJy52c2NvZGUvdGFza3MuanNvbicpLCBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX2dldFJlc291cmNlRm9yS2luZChUYXNrU291cmNlS2luZC5Vc2VyKTtcblx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9vcGVuVGFza0ZpbGUocmVzb3VyY2UsIFRhc2tTb3VyY2VLaW5kLlVzZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRUYXNrRGVzY3JpcHRpb24odGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhc2suX3NvdXJjZS5raW5kID09PSBUYXNrU291cmNlS2luZC5Vc2VyKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgndGFza1F1aWNrUGljay51c2VyU2V0dGluZ3MnLCAnVXNlcicpO1xuXHRcdH0gZWxzZSBpZiAodGFzay5fc291cmNlLmtpbmQgPT09IFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGUpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gdGFzay5nZXRXb3Jrc3BhY2VGaWxlTmFtZSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5uZWVkc0ZvbGRlclF1YWxpZmljYXRpb24oKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb24gPSB3b3Jrc3BhY2VGb2xkZXIubmFtZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRlc2NyaXB0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuQ29uZmlndXJlVGFza3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fdHJ1c3QoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdGFza1Byb21pc2U6IFByb21pc2U8VGFza01hcD47XG5cdFx0aWYgKHRoaXMuc2NoZW1hVmVyc2lvbiA9PT0gSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHR0YXNrUHJvbWlzZSA9IHRoaXMuX2dldEdyb3VwZWRUYXNrcygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXNrUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShuZXcgVGFza01hcCgpKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0cyA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwPFByb21pc2U8SUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSB8IHVuZGVmaW5lZD4+KChmb2xkZXIpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9maWxlU2VydmljZS5zdGF0KGZvbGRlci50b1Jlc291cmNlKCcudnNjb2RlL3Rhc2tzLmpzb24nKSkudGhlbihzdGF0ID0+IHN0YXQsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjcmVhdGVMYWJlbCA9IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuY3JlYXRlSnNvbkZpbGUnLCAnQ3JlYXRlIHRhc2tzLmpzb24gZmlsZSBmcm9tIHRlbXBsYXRlJyk7XG5cdFx0Y29uc3Qgb3BlbkxhYmVsID0gbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5vcGVuSnNvbkZpbGUnLCAnT3BlbiB0YXNrcy5qc29uIGZpbGUnKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IHRva2VuU291cmNlLnRva2VuO1xuXHRcdGNvbnN0IGVudHJpZXMgPSBQcm9taXNlLmFsbChzdGF0cykudGhlbigoc3RhdHMpID0+IHtcblx0XHRcdHJldHVybiB0YXNrUHJvbWlzZS50aGVuKCh0YXNrTWFwKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6IFF1aWNrUGlja0lucHV0PFRhc2tRdWlja1BpY2tFbnRyeVR5cGU+W10gPSBbXTtcblx0XHRcdFx0bGV0IGNvbmZpZ3VyZWRDb3VudCA9IDA7XG5cdFx0XHRcdGxldCB0YXNrcyA9IHRhc2tNYXAuYWxsKCk7XG5cdFx0XHRcdGlmICh0YXNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGFza3MgPSB0YXNrcy5zb3J0KChhLCBiKSA9PiBhLl9sYWJlbC5sb2NhbGVDb21wYXJlKGIuX2xhYmVsKSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHsgbGFiZWw6IFRhc2tRdWlja1BpY2suZ2V0VGFza0xhYmVsV2l0aEljb24odGFzayksIHRhc2ssIGRlc2NyaXB0aW9uOiB0aGlzLmdldFRhc2tEZXNjcmlwdGlvbih0YXNrKSwgZGV0YWlsOiB0aGlzLl9zaG93RGV0YWlsKCkgPyB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbCA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdFx0VGFza1F1aWNrUGljay5hcHBseUNvbG9yU3R5bGVzKHRhc2ssIGVudHJ5LCB0aGlzLl90aGVtZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHRcdFx0XHRcdGlmICghQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHRcdGNvbmZpZ3VyZWRDb3VudCsrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuZWVkc0NyZWF0ZU9yT3BlbiA9IChjb25maWd1cmVkQ291bnQgPT09IDApO1xuXHRcdFx0XHQvLyBJZiB0aGUgb25seSBjb25maWd1cmVkIHRhc2tzIGFyZSB1c2VyIHRhc2tzLCB0aGVuIHdlIHNob3VsZCBhbHNvIHNob3cgdGhlIG9wdGlvbiB0byBjcmVhdGUgZnJvbSBhIHRlbXBsYXRlLlxuXHRcdFx0XHRpZiAobmVlZHNDcmVhdGVPck9wZW4gfHwgKHRhc2tNYXAuZ2V0KFVTRVJfVEFTS1NfR1JPVVBfS0VZKS5sZW5ndGggPT09IGNvbmZpZ3VyZWRDb3VudCkpIHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IHN0YXRzWzBdICE9PSB1bmRlZmluZWQgPyBvcGVuTGFiZWwgOiBjcmVhdGVMYWJlbDtcblx0XHRcdFx0XHRpZiAoZW50cmllcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBsYWJlbCwgZm9sZGVyOiB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICgoZW50cmllcy5sZW5ndGggPT09IDEpICYmICFuZWVkc0NyZWF0ZU9yT3Blbikge1xuXHRcdFx0XHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlbnRyaWVzO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0aW1lb3V0OiBib29sZWFuID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZW50cmllcy50aGVuKCgpID0+IHJlc29sdmUoZmFsc2UpKTtcblx0XHR9KSwgbmV3IFByb21pc2U8Ym9vbGVhbj4oKHJlc29sdmUpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdHJlc29sdmUodHJ1ZSk7XG5cdFx0XHR9LCAyMDApO1xuXHRcdH0pXSk7XG5cblx0XHRpZiAoIXRpbWVvdXQgJiYgKChhd2FpdCBlbnRyaWVzKS5sZW5ndGggPT09IDEpICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFFVSUNLT1BFTl9TS0lQX0NPTkZJRykpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gKGF3YWl0IGVudHJpZXMpWzBdIGFzIFRhc2tRdWlja1BpY2tFbnRyeVR5cGU7XG5cdFx0XHRpZiAoKGVudHJ5IGFzIElRdWlja1BpY2tJdGVtICYgeyB0YXNrOiBUYXNrIH0pLnRhc2spIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlU2VsZWN0aW9uKGVudHJ5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXNXaXRoU2V0dGluZ3MgPSBlbnRyaWVzLnRoZW4ocmVzb2x2ZWRFbnRyaWVzID0+IHtcblx0XHRcdHJlc29sdmVkRW50cmllcy5wdXNoKC4uLlRhc2tRdWlja1BpY2suYWxsU2V0dGluZ0VudHJpZXModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRcdHJldHVybiByZXNvbHZlZEVudHJpZXM7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXNXaXRoU2V0dGluZ3MsXG5cdFx0XHR7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnBpY2tUYXNrJywgJ1NlbGVjdCBhIHRhc2sgdG8gY29uZmlndXJlJykgfSwgY2FuY2VsbGF0aW9uVG9rZW4pLlxuXHRcdFx0dGhlbihhc3luYyAoc2VsZWN0aW9uKSA9PiB7XG5cdFx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdC8vIGNhbmNlbGVkIHdoZW4gdGhlcmUncyBvbmx5IG9uZSB0YXNrXG5cdFx0XHRcdFx0Y29uc3QgdGFzayA9IChhd2FpdCBlbnRyaWVzKVswXTtcblx0XHRcdFx0XHRpZiAoKHRhc2sgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSkudGFzaykge1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uID0gPFRhc2tRdWlja1BpY2tFbnRyeVR5cGU+dGFzaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faGFuZGxlU2VsZWN0aW9uKHNlbGVjdGlvbik7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3J1bkNvbmZpZ3VyZURlZmF1bHRCdWlsZFRhc2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2NoZW1hVmVyc2lvbiA9PT0gSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHR0aGlzLnRhc2tzKCkudGhlbigodGFza3MgPT4ge1xuXHRcdFx0XHRpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fcnVuQ29uZmlndXJlVGFza3MoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cmllczogUXVpY2tQaWNrSW5wdXQ8VGFza1F1aWNrUGlja0VudHJ5VHlwZT5bXSA9IFtdO1xuXHRcdFx0XHRsZXQgc2VsZWN0ZWRUYXNrOiBUYXNrIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgc2VsZWN0ZWRFbnRyeTogVGFza1F1aWNrUGlja0VudHJ5VHlwZSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fc2hvd0lnbm9yZWRGb2xkZXJzTWVzc2FnZSgpLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHsgZ2xvYkdyb3VwVGFza3MgfSA9IGF3YWl0IHRoaXMuX2dldEdsb2JUYXNrcyhUYXNrR3JvdXAuQnVpbGQuX2lkKTtcblx0XHRcdFx0XHRsZXQgZGVmYXVsdFRhc2tzID0gZ2xvYkdyb3VwVGFza3M7XG5cdFx0XHRcdFx0aWYgKCFkZWZhdWx0VGFza3M/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdFRhc2tzID0gdGhpcy5fZ2V0RGVmYXVsdFRhc2tzKHRhc2tzLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldCBkZWZhdWx0QnVpbGRUYXNrO1xuXHRcdFx0XHRcdGlmIChkZWZhdWx0VGFza3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBncm91cDogc3RyaW5nIHwgVGFza0dyb3VwIHwgdW5kZWZpbmVkID0gZGVmYXVsdFRhc2tzWzBdLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwO1xuXHRcdFx0XHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZ3JvdXAgPT09ICdzdHJpbmcnICYmIGdyb3VwID09PSBUYXNrR3JvdXAuQnVpbGQuX2lkKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdEJ1aWxkVGFzayA9IGRlZmF1bHRUYXNrc1swXTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0QnVpbGRUYXNrID0gZGVmYXVsdFRhc2tzWzBdO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdFx0aWYgKHRhc2sgPT09IGRlZmF1bHRCdWlsZFRhc2spIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmRlZmF1bHRCdWlsZFRhc2tFeGlzdHMnLCAnezB9IGlzIGFscmVhZHkgbWFya2VkIGFzIHRoZSBkZWZhdWx0IGJ1aWxkIHRhc2snLCBUYXNrUXVpY2tQaWNrLmdldFRhc2tMYWJlbFdpdGhJY29uKHRhc2ssIHRhc2suZ2V0UXVhbGlmaWVkTGFiZWwoKSkpO1xuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZFRhc2sgPSB0YXNrO1xuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZEVudHJ5ID0geyBsYWJlbCwgdGFzaywgZGVzY3JpcHRpb246IHRoaXMuZ2V0VGFza0Rlc2NyaXB0aW9uKHRhc2spLCBkZXRhaWw6IHRoaXMuX3Nob3dEZXRhaWwoKSA/IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGV0YWlsIDogdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0XHRcdFRhc2tRdWlja1BpY2suYXBwbHlDb2xvclN0eWxlcyh0YXNrLCBzZWxlY3RlZEVudHJ5LCB0aGlzLl90aGVtZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZW50cnkgPSB7IGxhYmVsOiBUYXNrUXVpY2tQaWNrLmdldFRhc2tMYWJlbFdpdGhJY29uKHRhc2spLCB0YXNrLCBkZXNjcmlwdGlvbjogdGhpcy5nZXRUYXNrRGVzY3JpcHRpb24odGFzayksIGRldGFpbDogdGhpcy5fc2hvd0RldGFpbCgpID8gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWwgOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHRcdFx0VGFza1F1aWNrUGljay5hcHBseUNvbG9yU3R5bGVzKHRhc2ssIGVudHJ5LCB0aGlzLl90aGVtZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRFbnRyeSkge1xuXHRcdFx0XHRcdFx0ZW50cmllcy51bnNoaWZ0KHNlbGVjdGVkRW50cnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IHRva2VuU291cmNlLnRva2VuO1xuXHRcdFx0XHRcdHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllcyxcblx0XHRcdFx0XHRcdHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1Rhc2snLCAnU2VsZWN0IGEgdGFzayB0byBjb25maWd1cmUnKSB9LCBjYW5jZWxsYXRpb25Ub2tlbikuXG5cdFx0XHRcdFx0XHR0aGVuKGFzeW5jIChlbnRyeSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBjYW5jZWxlZCB3aGVuIHRoZXJlJ3Mgb25seSBvbmUgdGFza1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHRhc2sgPSAoYXdhaXQgZW50cmllcylbMF07XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCh0YXNrIGFzIElRdWlja1BpY2tJdGVtICYgeyB0YXNrOiBUYXNrIH0pLnRhc2spIHtcblx0XHRcdFx0XHRcdFx0XHRcdGVudHJ5ID0gPFRhc2tRdWlja1BpY2tFbnRyeVR5cGU+dGFzaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFzazogVGFzayB8IHVuZGVmaW5lZCB8IG51bGwgPSBlbnRyeSAmJiBPYmplY3QuaGFzT3duKGVudHJ5LCAndGFzaycpID8gKGVudHJ5IGFzIElRdWlja1BpY2tJdGVtICYgeyB0YXNrOiBUYXNrIH0pLnRhc2sgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmICgodGFzayA9PT0gdW5kZWZpbmVkKSB8fCAodGFzayA9PT0gbnVsbCkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKHRhc2sgPT09IHNlbGVjdGVkVGFzayAmJiBDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5vcGVuQ29uZmlnKHRhc2spO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICghSW5NZW1vcnlUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5jdXN0b21pemUodGFzaywgeyBncm91cDogeyBraW5kOiAnYnVpbGQnLCBpc0RlZmF1bHQ6IHRydWUgfSB9LCB0cnVlKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzZWxlY3RlZFRhc2sgJiYgKHRhc2sgIT09IHNlbGVjdGVkVGFzaykgJiYgIUluTWVtb3J5VGFzay5pcyhzZWxlY3RlZFRhc2spKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuY3VzdG9taXplKHNlbGVjdGVkVGFzaywgeyBncm91cDogJ2J1aWxkJyB9LCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllcywge1xuXHRcdFx0XHRcdFx0cGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja0RlZmF1bHRCdWlsZFRhc2snLCAnU2VsZWN0IHRoZSB0YXNrIHRvIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgYnVpbGQgdGFzaycpXG5cdFx0XHRcdFx0fSkuXG5cdFx0XHRcdFx0XHR0aGVuKChlbnRyeSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCA9IGVudHJ5ICYmIE9iamVjdC5oYXNPd24oZW50cnksICd0YXNrJykgPyAoZW50cnkgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKCh0YXNrID09PSB1bmRlZmluZWQpIHx8ICh0YXNrID09PSBudWxsKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAodGFzayA9PT0gc2VsZWN0ZWRUYXNrICYmIEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9wZW5Db25maWcodGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCFJbk1lbW9yeVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6ZSh0YXNrLCB7IGdyb3VwOiB7IGtpbmQ6ICdidWlsZCcsIGlzRGVmYXVsdDogdHJ1ZSB9IH0sIHRydWUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHNlbGVjdGVkVGFzayAmJiAodGFzayAhPT0gc2VsZWN0ZWRUYXNrKSAmJiAhSW5NZW1vcnlUYXNrLmlzKHNlbGVjdGVkVGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5jdXN0b21pemUoc2VsZWN0ZWRUYXNrLCB7IGdyb3VwOiAnYnVpbGQnIH0sIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3J1bkNvbmZpZ3VyZURlZmF1bHRUZXN0VGFzaygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApIHtcblx0XHRcdHRoaXMudGFza3MoKS50aGVuKCh0YXNrcyA9PiB7XG5cdFx0XHRcdGlmICh0YXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgc2VsZWN0ZWRUYXNrOiBUYXNrIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgc2VsZWN0ZWRFbnRyeTogSVRhc2tRdWlja1BpY2tFbnRyeTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0XHRjb25zdCB0YXNrR3JvdXA6IFRhc2tHcm91cCB8IHVuZGVmaW5lZCA9IFRhc2tHcm91cC5mcm9tKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApO1xuXHRcdFx0XHRcdGlmICh0YXNrR3JvdXAgJiYgdGFza0dyb3VwLmlzRGVmYXVsdCAmJiB0YXNrR3JvdXAuX2lkID09PSBUYXNrR3JvdXAuVGVzdC5faWQpIHtcblx0XHRcdFx0XHRcdHNlbGVjdGVkVGFzayA9IHRhc2s7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlbGVjdGVkVGFzaykge1xuXHRcdFx0XHRcdHNlbGVjdGVkRW50cnkgPSB7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5kZWZhdWx0VGVzdFRhc2tFeGlzdHMnLCAnezB9IGlzIGFscmVhZHkgbWFya2VkIGFzIHRoZSBkZWZhdWx0IHRlc3QgdGFzay4nLCBzZWxlY3RlZFRhc2suZ2V0UXVhbGlmaWVkTGFiZWwoKSksXG5cdFx0XHRcdFx0XHR0YXNrOiBzZWxlY3RlZFRhc2ssXG5cdFx0XHRcdFx0XHRkZXRhaWw6IHRoaXMuX3Nob3dEZXRhaWwoKSA/IHNlbGVjdGVkVGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWwgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fc2hvd0lnbm9yZWRGb2xkZXJzTWVzc2FnZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dRdWlja1BpY2sodGFza3MsXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnBpY2tEZWZhdWx0VGVzdFRhc2snLCAnU2VsZWN0IHRoZSB0YXNrIHRvIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgdGVzdCB0YXNrJyksIHVuZGVmaW5lZCwgdHJ1ZSwgZmFsc2UsIHNlbGVjdGVkRW50cnkpLnRoZW4oKGVudHJ5KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgJiYgT2JqZWN0Lmhhc093bihlbnRyeSwgJ3Rhc2snKSA/IGVudHJ5LnRhc2sgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmICghdGFzaykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAodGFzayA9PT0gc2VsZWN0ZWRUYXNrICYmIEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9wZW5Db25maWcodGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCFJbk1lbW9yeVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6ZSh0YXNrLCB7IGdyb3VwOiB7IGtpbmQ6ICd0ZXN0JywgaXNEZWZhdWx0OiB0cnVlIH0gfSwgdHJ1ZSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRUYXNrICYmICh0YXNrICE9PSBzZWxlY3RlZFRhc2spICYmICFJbk1lbW9yeVRhc2suaXMoc2VsZWN0ZWRUYXNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6ZShzZWxlY3RlZFRhc2ssIHsgZ3JvdXA6ICd0ZXN0JyB9LCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcnVuQ29uZmlndXJlVGFza3MoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuU2hvd1Rhc2tzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZVRhc2tzUHJvbWlzZTogUHJvbWlzZTxUYXNrW10+ID0gdGhpcy5nZXRBY3RpdmVUYXNrcygpO1xuXHRcdGNvbnN0IGFjdGl2ZVRhc2tzOiBUYXNrW10gPSBhd2FpdCBhY3RpdmVUYXNrc1Byb21pc2U7XG5cdFx0bGV0IGdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjdGl2ZVRhc2tzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy5fdGFza1N5c3RlbSEucmV2ZWFsVGFzayhhY3RpdmVUYXNrc1swXSk7XG5cdFx0fSBlbHNlIGlmIChhY3RpdmVUYXNrcy5sZW5ndGggJiYgYWN0aXZlVGFza3MuZXZlcnkoKHRhc2spID0+IHtcblx0XHRcdGlmIChJbk1lbW9yeVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwID0gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbj8uZ3JvdXA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbj8uZ3JvdXAgJiYgKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24uZ3JvdXAgPT09IGdyb3VwKTtcblx0XHR9KSkge1xuXHRcdFx0dGhpcy5fdGFza1N5c3RlbSEucmV2ZWFsVGFzayhhY3RpdmVUYXNrc1swXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3dRdWlja1BpY2soYWN0aXZlVGFza3NQcm9taXNlLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnBpY2tTaG93VGFzaycsICdTZWxlY3QgdGhlIHRhc2sgdG8gc2hvdyBpdHMgb3V0cHV0JyksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub1Rhc2tJc1J1bm5pbmcnLCAnTm8gdGFzayBpcyBydW5uaW5nJyksXG5cdFx0XHRcdFx0dGFzazogbnVsbFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmYWxzZSwgdHJ1ZVxuXHRcdFx0KS50aGVuKChlbnRyeSkgPT4ge1xuXHRcdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCA9IGVudHJ5ID8gZW50cnkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRhc2sgPT09IHVuZGVmaW5lZCB8fCB0YXNrID09PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Rhc2tTeXN0ZW0hLnJldmVhbFRhc2sodGFzayk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVUYXNrc0RvdE9sZChmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpOiBQcm9taXNlPFtVUkksIFVSSV0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0YXNrc0ZpbGUgPSBmb2xkZXIudG9SZXNvdXJjZSgnLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0aWYgKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh0YXNrc0ZpbGUpKSB7XG5cdFx0XHRjb25zdCBvbGRGaWxlID0gdGFza3NGaWxlLndpdGgoeyBwYXRoOiBgJHt0YXNrc0ZpbGUucGF0aH0ub2xkYCB9KTtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNvcHkodGFza3NGaWxlLCBvbGRGaWxlLCB0cnVlKTtcblx0XHRcdHJldHVybiBbb2xkRmlsZSwgdGFza3NGaWxlXTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZ3JhZGVUYXNrKHRhc2s6IFRhc2ssIHN1cHByZXNzVGFza05hbWU6IGJvb2xlYW4sIGdsb2JhbENvbmZpZzogeyB3aW5kb3dzPzogSUNvbW1hbmRVcGdyYWRlOyBvc3g/OiBJQ29tbWFuZFVwZ3JhZGU7IGxpbnV4PzogSUNvbW1hbmRVcGdyYWRlIH0pOiBUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIUN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnRWxlbWVudDogSVRhc2tDb25maWcgPSB7XG5cdFx0XHRsYWJlbDogdGFzay5fbGFiZWxcblx0XHR9O1xuXHRcdGNvbnN0IG9sZFRhc2tUeXBlcyA9IG5ldyBTZXQoWydndWxwJywgJ2pha2UnLCAnZ3J1bnQnXSk7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHRhc2suY29tbWFuZC5uYW1lKSAmJiBvbGRUYXNrVHlwZXMuaGFzKHRhc2suY29tbWFuZC5uYW1lKSkge1xuXHRcdFx0Y29uZmlnRWxlbWVudC50eXBlID0gdGFzay5jb21tYW5kLm5hbWU7XG5cdFx0XHRjb25maWdFbGVtZW50LnRhc2sgPSB0YXNrLmNvbW1hbmQuYXJncyFbMF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0YXNrLmNvbW1hbmQucnVudGltZSA9PT0gUnVudGltZVR5cGUuU2hlbGwpIHtcblx0XHRcdFx0Y29uZmlnRWxlbWVudC50eXBlID0gUnVudGltZVR5cGUudG9TdHJpbmcoUnVudGltZVR5cGUuU2hlbGwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRhc2suY29tbWFuZC5uYW1lICYmICFzdXBwcmVzc1Rhc2tOYW1lICYmICFnbG9iYWxDb25maWcud2luZG93cz8uY29tbWFuZCAmJiAhZ2xvYmFsQ29uZmlnLm9zeD8uY29tbWFuZCAmJiAhZ2xvYmFsQ29uZmlnLmxpbnV4Py5jb21tYW5kKSB7XG5cdFx0XHRcdGNvbmZpZ0VsZW1lbnQuY29tbWFuZCA9IHRhc2suY29tbWFuZC5uYW1lO1xuXHRcdFx0fSBlbHNlIGlmIChzdXBwcmVzc1Rhc2tOYW1lKSB7XG5cdFx0XHRcdGNvbmZpZ0VsZW1lbnQuY29tbWFuZCA9ICh0YXNrLl9zb3VyY2UuY29uZmlnLmVsZW1lbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmNvbW1hbmQgYXMgc3RyaW5nIHwgQ29tbWFuZFN0cmluZztcblx0XHRcdH1cblx0XHRcdGlmICh0YXNrLmNvbW1hbmQuYXJncyAmJiAoIUFycmF5LmlzQXJyYXkodGFzay5jb21tYW5kLmFyZ3MpIHx8ICh0YXNrLmNvbW1hbmQuYXJncy5sZW5ndGggPiAwKSkpIHtcblx0XHRcdFx0aWYgKCFnbG9iYWxDb25maWcud2luZG93cz8uYXJncyAmJiAhZ2xvYmFsQ29uZmlnLm9zeD8uYXJncyAmJiAhZ2xvYmFsQ29uZmlnLmxpbnV4Py5hcmdzKSB7XG5cdFx0XHRcdFx0Y29uZmlnRWxlbWVudC5hcmdzID0gdGFzay5jb21tYW5kLmFyZ3M7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uZmlnRWxlbWVudC5hcmdzID0gKHRhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuYXJncyBhcyBzdHJpbmdbXSB8IENvbW1hbmRTdHJpbmdbXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByZXNlbnRhdGlvbikge1xuXHRcdFx0Y29uZmlnRWxlbWVudC5wcmVzZW50YXRpb24gPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByZXNlbnRhdGlvbjtcblx0XHR9XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25maWdFbGVtZW50LmlzQmFja2dyb3VuZCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMpIHtcblx0XHRcdGNvbmZpZ0VsZW1lbnQucHJvYmxlbU1hdGNoZXIgPSAodGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5wcm9ibGVtTWF0Y2hlciBhcyBzdHJpbmdbXTtcblx0XHR9XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApIHtcblx0XHRcdGNvbmZpZ0VsZW1lbnQuZ3JvdXAgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwO1xuXHRcdH1cblxuXHRcdHRhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCA9IGNvbmZpZ0VsZW1lbnQ7XG5cdFx0Y29uc3QgdGVtcFRhc2sgPSBuZXcgQ3VzdG9tVGFzayh0YXNrLl9pZCwgdGFzay5fc291cmNlLCB0YXNrLl9sYWJlbCwgdGFzay50eXBlLCB0YXNrLmNvbW1hbmQsIHRhc2suaGFzRGVmaW5lZE1hdGNoZXJzLCB0YXNrLnJ1bk9wdGlvbnMsIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMpO1xuXHRcdGNvbnN0IGNvbmZpZ1Rhc2sgPSB0aGlzLl9jcmVhdGVDdXN0b21pemFibGVUYXNrKHRlbXBUYXNrKTtcblx0XHRpZiAoY29uZmlnVGFzaykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ1Rhc2s7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZ3JhZGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2NoZW1hVmVyc2lvbiA9PT0gSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCkoaXNUcnVzdGVkID0+IHtcblx0XHRcdFx0aWYgKGlzVHJ1c3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZ3JhZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhc2tzID0gYXdhaXQgdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKCk7XG5cdFx0Y29uc3QgZmlsZURpZmZzOiBbVVJJLCBVUkldW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IGRpZmYgPSBhd2FpdCB0aGlzLl9jcmVhdGVUYXNrc0RvdE9sZChmb2xkZXIpO1xuXHRcdFx0aWYgKGRpZmYpIHtcblx0XHRcdFx0ZmlsZURpZmZzLnB1c2goZGlmZik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWRpZmYpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbmZpZ1Rhc2tzOiAoVGFza0NvbmZpZy5JQ3VzdG9tVGFzayB8IFRhc2tDb25maWcuSUNvbmZpZ3VyaW5nVGFzaylbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3VwcHJlc3NUYXNrTmFtZSA9ICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLlN1cHByZXNzVGFza05hbWUsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSk7XG5cdFx0XHRjb25zdCBnbG9iYWxDb25maWcgPSB7XG5cdFx0XHRcdHdpbmRvd3M6IDxJQ29tbWFuZFVwZ3JhZGU+dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLldpbmRvd3MsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSksXG5cdFx0XHRcdG9zeDogPElDb21tYW5kVXBncmFkZT50aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrc1NjaGVtYVByb3BlcnRpZXMuT3N4LCB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pLFxuXHRcdFx0XHRsaW51eDogPElDb21tYW5kVXBncmFkZT50aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrc1NjaGVtYVByb3BlcnRpZXMuTGludXgsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSlcblx0XHRcdH07XG5cdFx0XHR0YXNrcy5nZXQoZm9sZGVyKS5mb3JFYWNoKHRhc2sgPT4ge1xuXHRcdFx0XHRjb25zdCBjb25maWdUYXNrID0gdGhpcy5fdXBncmFkZVRhc2sodGFzaywgc3VwcHJlc3NUYXNrTmFtZSwgZ2xvYmFsQ29uZmlnKTtcblx0XHRcdFx0aWYgKGNvbmZpZ1Rhc2spIHtcblx0XHRcdFx0XHRjb25maWdUYXNrcy5wdXNoKGNvbmZpZ1Rhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3Rhc2tTeXN0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRhd2FpdCB0aGlzLl93cml0ZUNvbmZpZ3VyYXRpb24oZm9sZGVyLCAndGFza3MudGFza3MnLCBjb25maWdUYXNrcyk7XG5cdFx0XHRhd2FpdCB0aGlzLl93cml0ZUNvbmZpZ3VyYXRpb24oZm9sZGVyLCAndGFza3MudmVyc2lvbicsICcyLjAuMCcpO1xuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5TaG93T3V0cHV0LCB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5TaG93T3V0cHV0LCB1bmRlZmluZWQsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLklzU2hlbGxDb21tYW5kLCB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5Jc1NoZWxsQ29tbWFuZCwgdW5kZWZpbmVkLCB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5TdXBwcmVzc1Rhc2tOYW1lLCB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5TdXBwcmVzc1Rhc2tOYW1lLCB1bmRlZmluZWQsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZVNldHVwKCk7XG5cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0ZmlsZURpZmZzLmxlbmd0aCA9PT0gMSA/XG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UudXBncmFkZVZlcnNpb24nLCBcIlRoZSBkZXByZWNhdGVkIHRhc2tzIHZlcnNpb24gMC4xLjAgaGFzIGJlZW4gcmVtb3ZlZC4gWW91ciB0YXNrcyBoYXZlIGJlZW4gdXBncmFkZWQgdG8gdmVyc2lvbiAyLjAuMC4gT3BlbiB0aGUgZGlmZiB0byByZXZpZXcgdGhlIHVwZ3JhZGUuXCIpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCd0YXNrU2VydmljZS51cGdyYWRlVmVyc2lvblBsdXJhbCcsIFwiVGhlIGRlcHJlY2F0ZWQgdGFza3MgdmVyc2lvbiAwLjEuMCBoYXMgYmVlbiByZW1vdmVkLiBZb3VyIHRhc2tzIGhhdmUgYmVlbiB1cGdyYWRlZCB0byB2ZXJzaW9uIDIuMC4wLiBPcGVuIHRoZSBkaWZmcyB0byByZXZpZXcgdGhlIHVwZ3JhZGUuXCIpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IGZpbGVEaWZmcy5sZW5ndGggPT09IDEgPyBubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLm9wZW5EaWZmJywgXCJPcGVuIGRpZmZcIikgOiBubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLm9wZW5EaWZmcycsIFwiT3BlbiBkaWZmc1wiKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB1cGdyYWRlIG9mIGZpbGVEaWZmcykge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHVwZ3JhZGVbMF0gfSxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHVwZ3JhZGVbMV0gfVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjO0FBRXZCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFlBQVksVUFBVTtBQUN0QixZQUFZLFVBQVU7QUFDdEIsU0FBUyxZQUFZLFNBQWtDLG1CQUFt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QUFBQSxNQUFPLFNBQVM7QUFBQSxNQUN6QyxVQUFVLFdBQVcsSUFDcEIsSUFBSSxTQUFTLDhCQUE4QiwySUFBMkksSUFDcEwsSUFBSSxTQUFTLG9DQUFvQyw0SUFBNEk7QUFBQSxNQUNoTSxDQUFDO0FBQUEsUUFDQSxPQUFPLFVBQVUsV0FBVyxJQUFJLElBQUksU0FBUyx3QkFBd0IsV0FBVyxJQUFJLElBQUksU0FBUyx5QkFBeUIsWUFBWTtBQUFBLFFBQ3RJLEtBQUssWUFBWTtBQUNoQixxQkFBVyxXQUFXLFdBQVc7QUFDaEMsa0JBQU0sS0FBSyxlQUFlLFdBQVc7QUFBQSxjQUNwQyxVQUFVLEVBQUUsVUFBVSxRQUFRLENBQUMsRUFBRTtBQUFBLGNBQ2pDLFVBQVUsRUFBRSxVQUFVLFFBQVEsQ0FBQyxFQUFFO0FBQUEsWUFDbEMsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDRDtBQUFBO0FBOXhIc0Isb0JBR0csd0JBQXdCO0FBSDNCLG9CQUlHLDBCQUEwQjtBQUo3QixvQkFLRyxzQkFBc0I7QUFMekIsb0JBTUcsa0NBQWtDO0FBTnJDLG9CQVNQLGtCQUEwQjtBQVRuQixvQkFVUCxxQkFBNkIsSUFBSSxTQUFTLFNBQVMsT0FBTztBQVZuRCxvQkFZTixjQUFzQjtBQVpoQixzQkFBZjtBQUFBLEVBNkRKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5HbUI7IiwKICAibmFtZXMiOiBbIkNvbmZpZ3VyZVRhc2tBY3Rpb24iLCAiZGVmYXVsdHMiLCAianNvbiIsICJ0YXNrcyIsICJ0YXNrIiwgIlNhdmVCZWZvcmVSdW5Db25maWdPcHRpb25zIiwgIl8iLCAicmVzdWx0IiwgImVycm9yIiwgImtleSIsICJmb2xkZXIiLCAiZW50cmllcyIsICJyZXNvdXJjZSIsICJzdGF0cyJdCn0K
