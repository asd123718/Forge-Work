import { asArray } from "../../../../base/common/arrays.js";
import * as Async from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { isUNC } from "../../../../base/common/extpath.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { LinkedMap, Touch } from "../../../../base/common/map.js";
import * as Objects from "../../../../base/common/objects.js";
import * as path from "../../../../base/common/path.js";
import * as Platform from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import Severity from "../../../../base/common/severity.js";
import * as Types from "../../../../base/common/types.js";
import * as nls from "../../../../nls.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { Markers } from "../../markers/common/markers.js";
import { ProblemMatcherRegistry } from "../common/problemMatcher.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Schemas } from "../../../../base/common/network.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { TaskTerminalStatus } from "./taskTerminalStatus.js";
import { ProblemCollectorEventKind, ProblemHandlingStrategy, StartStopProblemCollector, WatchingProblemCollector } from "../common/problemCollectors.js";
import { GroupKind } from "../common/taskConfiguration.js";
import { TaskError, TaskErrors, TaskExecuteKind, Triggers, VerifiedTask } from "../common/taskSystem.js";
import { CommandString, ContributedTask, CustomTask, DependsOrder, InMemoryTask, PanelKind, RerunForActiveTerminalCommandId, RevealKind, RevealProblemKind, RuntimeType, ShellQuoting, TASK_TERMINAL_ACTIVE, TaskEvent, TaskEventKind, TaskScope, TaskSourceKind, rerunTaskIcon } from "../common/tasks.js";
import { VSCodeOscProperty, VSCodeOscPt, VSCodeSequence } from "../../terminal/browser/terminalEscapeSequences.js";
import { TerminalProcessExtHostProxy } from "../../terminal/browser/terminalProcessExtHostProxy.js";
import { TERMINAL_VIEW_ID } from "../../terminal/common/terminal.js";
import { TaskProblemMonitor } from "./taskProblemMonitor.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { serializeVSCodeOscMessage } from "../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
const TaskTerminalType = "Task";
const _VariableResolver = class _VariableResolver {
  constructor(workspaceFolder, taskSystemInfo, values, _service) {
    this.workspaceFolder = workspaceFolder;
    this.taskSystemInfo = taskSystemInfo;
    this.values = values;
    this._service = _service;
  }
  async resolve(value) {
    const replacers = [];
    value.replace(_VariableResolver._regex, (match, ...args) => {
      replacers.push(this._replacer(match, args));
      return match;
    });
    const resolvedReplacers = await Promise.all(replacers);
    return value.replace(_VariableResolver._regex, () => resolvedReplacers.shift());
  }
  async _replacer(match, args) {
    const result = this.values.get(match.substring(2, match.length - 1));
    if (result !== void 0 && result !== null) {
      return result;
    }
    if (this._service) {
      return this._service.resolveAsync(this.workspaceFolder, match);
    }
    return match;
  }
};
_VariableResolver._regex = /\$\{(.*?)\}/g;
let VariableResolver = _VariableResolver;
const _TerminalTaskSystem = class _TerminalTaskSystem extends Disposable {
  constructor(_terminalService, _terminalGroupService, _outputService, _paneCompositeService, _viewsService, _markerService, _modelService, _configurationResolverService, _contextService, _environmentService, _outputChannelId, _fileService, _terminalProfileResolverService, _pathService, _viewDescriptorService, _logService, _notificationService, contextKeyService, instantiationService, taskSystemInfoResolver, _taskLookup) {
    super();
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._outputService = _outputService;
    this._paneCompositeService = _paneCompositeService;
    this._viewsService = _viewsService;
    this._markerService = _markerService;
    this._modelService = _modelService;
    this._configurationResolverService = _configurationResolverService;
    this._contextService = _contextService;
    this._environmentService = _environmentService;
    this._outputChannelId = _outputChannelId;
    this._fileService = _fileService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._pathService = _pathService;
    this._viewDescriptorService = _viewDescriptorService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._taskLookup = _taskLookup;
    this._isRerun = false;
    this._terminalCreationQueue = Promise.resolve();
    this._hasReconnected = false;
    this._terminalTabActions = [{ id: RerunForActiveTerminalCommandId, label: nls.localize("rerunTask", "Rerun Task"), icon: rerunTaskIcon }];
    this._taskStartTimes = /* @__PURE__ */ new Map();
    this._capturedTaskVariables = /* @__PURE__ */ new Map();
    this._activeTasks = /* @__PURE__ */ Object.create(null);
    this._busyTasks = /* @__PURE__ */ Object.create(null);
    this._taskErrors = /* @__PURE__ */ Object.create(null);
    this._taskDependencies = /* @__PURE__ */ Object.create(null);
    this._terminals = /* @__PURE__ */ Object.create(null);
    this._idleTaskTerminals = new LinkedMap();
    this._sameTaskTerminals = /* @__PURE__ */ Object.create(null);
    this._onDidStateChange = this._register(new Emitter());
    this._taskSystemInfoResolver = taskSystemInfoResolver;
    this._register(this._terminalStatusManager = instantiationService.createInstance(TaskTerminalStatus));
    this._register(this._taskProblemMonitor = instantiationService.createInstance(TaskProblemMonitor));
    this._taskTerminalActive = TASK_TERMINAL_ACTIVE.bindTo(contextKeyService);
    this._register(this._terminalService.onDidChangeActiveInstance((e) => this._taskTerminalActive.set(e?.shellLaunchConfig.type === "Task")));
  }
  taskShellIntegrationStartSequence(cwd) {
    return VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.HasRichCommandDetection}=True`) + VSCodeSequence(VSCodeOscPt.PromptStart) + VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.Task}=True`) + (cwd ? VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.Cwd}=${typeof cwd === "string" ? cwd : cwd.fsPath}`) : "") + VSCodeSequence(VSCodeOscPt.CommandStart);
  }
  getTaskShellIntegrationOutputSequence(commandLineInfo) {
    return (commandLineInfo ? VSCodeSequence(VSCodeOscPt.CommandLine, `${serializeVSCodeOscMessage(commandLineInfo.commandLine)};${commandLineInfo.nonce}`) : "") + VSCodeSequence(VSCodeOscPt.CommandExecuted);
  }
  get onDidStateChange() {
    return this._onDidStateChange.event;
  }
  _log(value) {
    this._appendOutput(value + "\n");
  }
  _showOutput() {
    this._outputService.showChannel(this._outputChannelId, true);
  }
  reconnect(task, resolver) {
    this._reconnectToTerminals();
    return this.run(task, resolver, Triggers.reconnect);
  }
  run(task, resolver, trigger = Triggers.command) {
    task = task.clone();
    const instances = InMemoryTask.is(task) || this._isTaskEmpty(task) ? [] : this._getInstances(task);
    const validInstance = instances.length < ((task.runOptions && task.runOptions.instanceLimit) ?? 1);
    const instance = instances[0]?.count?.count ?? 0;
    this._currentTask = new VerifiedTask(task, resolver, trigger);
    if (instance > 0) {
      task.instance = instance;
    }
    if (!validInstance) {
      const terminalData = instances[instances.length - 1];
      this._lastTask = this._currentTask;
      return { kind: TaskExecuteKind.Active, task: terminalData.task, active: { same: true, background: task.configurationProperties.isBackground }, promise: terminalData.promise };
    }
    try {
      const executeResult = { kind: TaskExecuteKind.Started, task, started: {}, promise: this._executeTask(task, resolver, trigger, /* @__PURE__ */ new Set(), /* @__PURE__ */ new Map(), void 0) };
      executeResult.promise.then((summary) => {
        this._lastTask = this._currentTask;
      });
      return executeResult;
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      } else if (error instanceof Error) {
        this._log(error.message);
        throw new TaskError(Severity.Error, error.message, TaskErrors.UnknownError);
      } else {
        this._log(error.toString());
        throw new TaskError(Severity.Error, nls.localize("TerminalTaskSystem.unknownError", "A unknown error has occurred while executing a task. See task output log for details."), TaskErrors.UnknownError);
      }
    }
  }
  getTerminalsForTasks(tasks) {
    const results = [];
    for (const t of asArray(tasks)) {
      for (const key of Object.keys(this._terminals)) {
        const value = this._terminals[key];
        if (value.lastTask === t.getMapKey()) {
          results.push(value.terminal.resource);
        }
      }
    }
    return results.length > 0 ? results : void 0;
  }
  getTaskProblems(instanceId) {
    return this._taskProblemMonitor.getTaskProblems(instanceId);
  }
  rerun() {
    if (this._lastTask && this._lastTask.verify()) {
      if (this._lastTask.task.runOptions.reevaluateOnRerun !== void 0 && !this._lastTask.task.runOptions.reevaluateOnRerun) {
        this._isRerun = true;
      }
      const result = this.run(this._lastTask.task, this._lastTask.resolver);
      result.promise.then((summary) => {
        this._isRerun = false;
      });
      return result;
    } else {
      return void 0;
    }
  }
  get lastTask() {
    return this._lastTask;
  }
  set lastTask(task) {
    this._lastTask = task;
  }
  _showTaskLoadErrors(task) {
    if (task.taskLoadMessages && task.taskLoadMessages.length > 0) {
      task.taskLoadMessages.forEach((loadMessage) => {
        this._log(loadMessage + "\n");
      });
      const openOutput = "Show Output";
      this._notificationService.prompt(
        Severity.Warning,
        nls.localize(
          "TerminalTaskSystem.taskLoadReporting",
          'There are issues with task "{0}". See the output for more details.',
          task._label
        ),
        [{
          label: openOutput,
          run: () => this._showOutput()
        }]
      );
    }
  }
  isTaskVisible(task) {
    const terminalData = this._activeTasks[task.getMapKey()];
    if (!terminalData?.terminal) {
      return false;
    }
    const activeTerminalInstance = this._terminalService.activeInstance;
    const isPanelShowingTerminal = !!this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    return isPanelShowingTerminal && activeTerminalInstance?.instanceId === terminalData.terminal.instanceId;
  }
  revealTask(task) {
    const terminalData = this._activeTasks[task.getMapKey()];
    if (!terminalData?.terminal) {
      return false;
    }
    const isTerminalInPanel = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID) === ViewContainerLocation.Panel;
    if (isTerminalInPanel && this.isTaskVisible(task)) {
      if (this._previousPanelId) {
        if (this._previousTerminalInstance) {
          this._terminalService.setActiveInstance(this._previousTerminalInstance);
        }
        this._paneCompositeService.openPaneComposite(this._previousPanelId, ViewContainerLocation.Panel);
      } else {
        this._paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
      }
      this._previousPanelId = void 0;
      this._previousTerminalInstance = void 0;
    } else {
      if (isTerminalInPanel) {
        this._previousPanelId = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.getId();
        if (this._previousPanelId === TERMINAL_VIEW_ID) {
          this._previousTerminalInstance = this._terminalService.activeInstance ?? void 0;
        }
      }
      this._terminalService.setActiveInstance(terminalData.terminal);
      if (CustomTask.is(task) || ContributedTask.is(task)) {
        this._terminalGroupService.showPanel(task.command.presentation.focus);
      }
    }
    return true;
  }
  isActive() {
    return Promise.resolve(this.isActiveSync());
  }
  isActiveSync() {
    return Object.values(this._activeTasks).some((value) => !!value.terminal);
  }
  canAutoTerminate() {
    return Object.values(this._activeTasks).every((value) => !value.task.configurationProperties.promptOnClose);
  }
  getActiveTasks() {
    return Object.values(this._activeTasks).flatMap((value) => value.terminal ? value.task : []);
  }
  getLastInstance(task) {
    const recentKey = task.getKey();
    return Object.values(this._activeTasks).reverse().find(
      (value) => recentKey && recentKey === value.task.getKey()
    )?.task;
  }
  getFirstInstance(task) {
    const recentKey = task.getKey();
    for (const task2 of this.getActiveTasks()) {
      if (recentKey && recentKey === task2.getKey()) {
        return task2;
      }
    }
    return void 0;
  }
  getBusyTasks() {
    return Object.keys(this._busyTasks).map((key) => this._busyTasks[key]);
  }
  customExecutionComplete(task, result) {
    const activeTerminal = this._activeTasks[task.getMapKey()];
    if (!activeTerminal?.terminal) {
      return Promise.reject(new Error("Expected to have a terminal for a custom execution task"));
    }
    return new Promise((resolve) => {
      resolve();
    });
  }
  _getInstances(task) {
    const recentKey = task.getKey();
    return Object.values(this._activeTasks).filter(
      (value) => recentKey && recentKey === value.task.getKey()
    );
  }
  _removeFromActiveTasks(task) {
    const key = typeof task === "string" ? task : task.getMapKey();
    const taskToRemove = this._activeTasks[key];
    if (!taskToRemove) {
      return;
    }
    delete this._activeTasks[key];
  }
  _fireTaskEvent(event) {
    if (event.kind !== TaskEventKind.Changed && event.kind !== TaskEventKind.ProblemMatcherEnded && event.kind !== TaskEventKind.ProblemMatcherStarted) {
      const activeTask = this._activeTasks[event.__task.getMapKey()];
      if (activeTask) {
        activeTask.state = event.kind;
      }
    }
    this._onDidStateChange.fire(event);
  }
  terminate(task) {
    const activeTerminal = this._activeTasks[task.getMapKey()];
    if (!activeTerminal) {
      return Promise.resolve({ success: false, task: void 0 });
    }
    const terminal = activeTerminal.terminal;
    if (!terminal) {
      return Promise.resolve({ success: false, task: void 0 });
    }
    return new Promise((resolve, reject) => {
      const onExit = terminal.onExit(() => {
        const terminatedTask = activeTerminal.task;
        try {
          onExit.dispose();
          this._fireTaskEvent(TaskEvent.terminated(terminatedTask, terminal.instanceId, terminal.exitReason));
        } catch (error) {
        }
        resolve({ success: true, task: terminatedTask });
      });
      terminal.dispose();
    });
  }
  terminateAll() {
    const promises = [];
    for (const [key, terminalData] of Object.entries(this._activeTasks)) {
      const terminal = terminalData?.terminal;
      if (terminal) {
        promises.push(new Promise((resolve, reject) => {
          const onExit = terminal.onExit(() => {
            const task = terminalData.task;
            try {
              onExit.dispose();
              this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
            } catch (error) {
            }
            if (this._activeTasks[key] === terminalData) {
              delete this._activeTasks[key];
            }
            resolve({ success: true, task: terminalData.task });
          });
        }));
        terminal.dispose();
      }
    }
    return Promise.all(promises);
  }
  _showDependencyCycleMessage(task) {
    this._log(nls.localize(
      "dependencyCycle",
      'There is a dependency cycle. See task "{0}".',
      task._label
    ));
    this._showOutput();
  }
  _executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved) {
    this._showTaskLoadErrors(task);
    const mapKey = task.getMapKey();
    const promise = Promise.resolve().then(async () => {
      alreadyResolved = alreadyResolved ?? /* @__PURE__ */ new Map();
      const promises = [];
      if (task.configurationProperties.dependsOn) {
        const nextLiveDependencies = new Set(liveDependencies).add(task.getCommonTaskId());
        for (const dependency of task.configurationProperties.dependsOn) {
          const dependencyTask = await resolver.resolve(dependency.uri, dependency.task);
          if (dependencyTask) {
            this._adoptConfigurationForDependencyTask(dependencyTask, task);
            const taskMapKey = task.getMapKey();
            const dependencyMapKey = dependencyTask.getMapKey();
            if (!this._taskDependencies[taskMapKey]) {
              this._taskDependencies[taskMapKey] = [];
            }
            if (!this._taskDependencies[taskMapKey].includes(dependencyMapKey)) {
              this._taskDependencies[taskMapKey].push(dependencyMapKey);
            }
            let taskResult;
            const commonKey = dependencyTask.getCommonTaskId();
            if (nextLiveDependencies.has(commonKey)) {
              this._showDependencyCycleMessage(dependencyTask);
              taskResult = Promise.resolve({});
            } else {
              taskResult = encounteredTasks.get(commonKey);
              if (!taskResult) {
                const activeTask2 = this._activeTasks[dependencyTask.getMapKey()] ?? this._getInstances(dependencyTask).pop();
                taskResult = activeTask2 && this._getDependencyPromise(activeTask2);
              }
            }
            if (!taskResult) {
              this._fireTaskEvent(TaskEvent.general(TaskEventKind.DependsOnStarted, task));
              taskResult = this._executeDependencyTask(dependencyTask, resolver, trigger, nextLiveDependencies, encounteredTasks, alreadyResolved);
            }
            encounteredTasks.set(commonKey, taskResult);
            promises.push(taskResult);
            if (task.configurationProperties.dependsOrder === DependsOrder.sequence) {
              const promiseResult = await taskResult;
              if (promiseResult.exitCode !== 0) {
                break;
              }
            }
          } else {
            this._log(nls.localize(
              "dependencyFailed",
              "Couldn't resolve dependent task '{0}' in workspace folder '{1}'",
              Types.isString(dependency.task) ? dependency.task : JSON.stringify(dependency.task, void 0, 0),
              dependency.uri.toString()
            ));
            this._showOutput();
          }
        }
      }
      return Promise.all(promises).then((summaries) => {
        for (const summary of summaries) {
          if (summary.exitCode !== 0) {
            return { exitCode: summary.exitCode };
          }
        }
        if ((ContributedTask.is(task) || CustomTask.is(task)) && task.command) {
          if (this._isRerun) {
            return this._reexecuteCommand(task, trigger, alreadyResolved);
          } else {
            return this._executeCommand(task, trigger, alreadyResolved);
          }
        }
        return { exitCode: 0 };
      });
    }).finally(() => {
      if (this._activeTasks[mapKey] === activeTask) {
        delete this._activeTasks[mapKey];
      }
    });
    const lastInstance = this._getInstances(task).pop();
    const count = lastInstance?.count ?? { count: 0 };
    count.count++;
    const activeTask = { task, promise, count };
    this._activeTasks[mapKey] = activeTask;
    return promise;
  }
  _createInactiveDependencyPromise(task) {
    return new Promise((resolve) => {
      const taskInactiveDisposable = this.onDidStateChange((taskEvent) => {
        if (taskEvent.kind === TaskEventKind.Inactive && taskEvent.__task === task) {
          taskInactiveDisposable.dispose();
          resolve({ exitCode: 0 });
        }
      });
    });
  }
  _taskHasErrors(task) {
    const taskMapKey = task.getMapKey();
    if (this._taskErrors[taskMapKey]) {
      return true;
    }
    const dependencies = this._taskDependencies[taskMapKey];
    if (dependencies) {
      for (const dependencyMapKey of dependencies) {
        if (this._taskErrors[dependencyMapKey]) {
          return true;
        }
      }
    }
    return false;
  }
  _cleanupTaskTracking(task) {
    const taskMapKey = task.getMapKey();
    delete this._taskErrors[taskMapKey];
    delete this._taskDependencies[taskMapKey];
  }
  _adoptConfigurationForDependencyTask(dependencyTask, task) {
    if (dependencyTask.configurationProperties.icon) {
      dependencyTask.configurationProperties.icon.id ||= task.configurationProperties.icon?.id;
      dependencyTask.configurationProperties.icon.color ||= task.configurationProperties.icon?.color;
    } else {
      dependencyTask.configurationProperties.icon = task.configurationProperties.icon;
    }
  }
  async _getDependencyPromise(task) {
    if (!task.task.configurationProperties.isBackground) {
      return task.promise;
    }
    if (!task.task.configurationProperties.problemMatchers || task.task.configurationProperties.problemMatchers.length === 0) {
      return task.promise;
    }
    if (task.state === TaskEventKind.Inactive) {
      return { exitCode: 0 };
    }
    return this._createInactiveDependencyPromise(task.task);
  }
  async _executeDependencyTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved) {
    if (!task.configurationProperties.isBackground) {
      return this._executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved);
    }
    const inactivePromise = this._createInactiveDependencyPromise(task);
    return Promise.race([inactivePromise, this._executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved)]);
  }
  async _resolveAndFindExecutable(systemInfo, workspaceFolder, task, cwd, envPath) {
    const command = await this._configurationResolverService.resolveAsync(workspaceFolder, CommandString.value(task.command.name));
    cwd = cwd ? await this._configurationResolverService.resolveAsync(workspaceFolder, cwd) : void 0;
    const delimiter = (await this._pathService.path).delimiter;
    const paths = envPath ? await Promise.all(envPath.split(delimiter).map((p) => this._configurationResolverService.resolveAsync(workspaceFolder, p))) : void 0;
    const foundExecutable = await systemInfo?.findExecutable(command, cwd, paths);
    if (foundExecutable) {
      return foundExecutable;
    }
    if (path.isAbsolute(command)) {
      return command;
    }
    return path.join(cwd ?? "", command);
  }
  _findUnresolvedVariables(variables, alreadyResolved) {
    if (alreadyResolved.size === 0) {
      return variables;
    }
    const unresolved = /* @__PURE__ */ new Set();
    for (const variable of variables) {
      if (!alreadyResolved.has(variable.substring(2, variable.length - 1))) {
        unresolved.add(variable);
      }
    }
    return unresolved;
  }
  _mergeMaps(mergeInto, mergeFrom) {
    for (const entry of mergeFrom) {
      if (!mergeInto.has(entry[0])) {
        mergeInto.set(entry[0], entry[1]);
      }
    }
  }
  async _acquireInput(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved) {
    const resolved = await this._resolveVariablesFromSet(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved);
    this._fireTaskEvent(TaskEvent.general(TaskEventKind.AcquiredInput, task));
    return resolved;
  }
  _resolveVariablesFromSet(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved) {
    const isProcess = task.command && task.command.runtime === RuntimeType.Process;
    const options = task.command && task.command.options ? task.command.options : void 0;
    const cwd = options ? options.cwd : void 0;
    let envPath = void 0;
    if (options && options.env) {
      for (const key of Object.keys(options.env)) {
        if (key.toLowerCase() === "path") {
          if (Types.isString(options.env[key])) {
            envPath = options.env[key];
          }
          break;
        }
      }
    }
    const unresolved = this._findUnresolvedVariables(variables, alreadyResolved);
    let resolvedVariables;
    if (taskSystemInfo && workspaceFolder) {
      const resolveSet = {
        variables: unresolved
      };
      if (taskSystemInfo.platform === Platform.Platform.Windows && isProcess) {
        resolveSet.process = { name: CommandString.value(task.command.name) };
        if (cwd) {
          resolveSet.process.cwd = cwd;
        }
        if (envPath) {
          resolveSet.process.path = envPath;
        }
      }
      resolvedVariables = taskSystemInfo.resolveVariables(workspaceFolder, resolveSet, TaskSourceKind.toConfigurationTarget(task._source.kind)).then(async (resolved) => {
        if (!resolved) {
          return void 0;
        }
        this._mergeMaps(alreadyResolved, resolved.variables);
        resolved.variables = new Map(alreadyResolved);
        if (isProcess) {
          let process = CommandString.value(task.command.name);
          if (taskSystemInfo.platform === Platform.Platform.Windows) {
            process = await this._resolveAndFindExecutable(taskSystemInfo, workspaceFolder, task, cwd, envPath);
          }
          resolved.variables.set(_TerminalTaskSystem.ProcessVarName, process);
        }
        return resolved;
      });
      return resolvedVariables;
    } else {
      const variablesArray = new Array();
      unresolved.forEach((variable) => variablesArray.push(variable));
      return new Promise((resolve, reject) => {
        this._configurationResolverService.resolveWithInteraction(workspaceFolder, variablesArray, "tasks", void 0, TaskSourceKind.toConfigurationTarget(task._source.kind)).then(async (resolvedVariablesMap) => {
          if (resolvedVariablesMap) {
            this._mergeMaps(alreadyResolved, resolvedVariablesMap);
            resolvedVariablesMap = new Map(alreadyResolved);
            if (isProcess) {
              let processVarValue;
              if (Platform.isWindows) {
                processVarValue = await this._resolveAndFindExecutable(taskSystemInfo, workspaceFolder, task, cwd, envPath);
              } else {
                processVarValue = await this._configurationResolverService.resolveAsync(workspaceFolder, CommandString.value(task.command.name));
              }
              resolvedVariablesMap.set(_TerminalTaskSystem.ProcessVarName, processVarValue);
            }
            const resolvedVariablesResult = {
              variables: resolvedVariablesMap
            };
            resolve(resolvedVariablesResult);
          } else {
            resolve(void 0);
          }
        }, (reason) => {
          reject(reason);
        });
      });
    }
  }
  _executeCommand(task, trigger, alreadyResolved) {
    const taskWorkspaceFolder = task.getWorkspaceFolder();
    let workspaceFolder;
    if (taskWorkspaceFolder) {
      workspaceFolder = this._currentTask.workspaceFolder = taskWorkspaceFolder;
    } else {
      const folders = this._contextService.getWorkspace().folders;
      workspaceFolder = folders.length > 0 ? folders[0] : void 0;
    }
    const systemInfo = this._currentTask.systemInfo = this._taskSystemInfoResolver(workspaceFolder);
    const variables = /* @__PURE__ */ new Set();
    this._collectTaskVariables(variables, task);
    const resolvedVariables = this._acquireInput(systemInfo, workspaceFolder, task, variables, alreadyResolved);
    return resolvedVariables.then((resolvedVariables2) => {
      if (resolvedVariables2 && !this._isTaskEmpty(task)) {
        this._currentTask.resolvedVariables = resolvedVariables2;
        return this._executeInTerminal(task, trigger, new VariableResolver(workspaceFolder, systemInfo, resolvedVariables2.variables, this._configurationResolverService), workspaceFolder);
      } else {
        this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
        return Promise.resolve({ exitCode: 0 });
      }
    }, (reason) => {
      return Promise.reject(reason);
    });
  }
  _isTaskEmpty(task) {
    const isCustomExecution = task.command.runtime === RuntimeType.CustomExecution;
    return !(task.command !== void 0 && task.command.runtime && (isCustomExecution || task.command.name !== void 0));
  }
  _reexecuteCommand(task, trigger, alreadyResolved) {
    const lastTask = this._lastTask;
    if (!lastTask) {
      return Promise.reject(new Error("No task previously run"));
    }
    const workspaceFolder = this._currentTask.workspaceFolder = lastTask.workspaceFolder;
    this._currentTask.systemInfo = lastTask.systemInfo;
    const variables = /* @__PURE__ */ new Set();
    this._collectTaskVariables(variables, task);
    let hasAllVariables = true;
    variables.forEach((value) => {
      if (Object.hasOwn(lastTask.getVerifiedTask().resolvedVariables, value.substring(2, value.length - 1))) {
        hasAllVariables = false;
      }
    });
    if (!hasAllVariables) {
      return this._acquireInput(lastTask.getVerifiedTask().systemInfo, lastTask.getVerifiedTask().workspaceFolder, task, variables, alreadyResolved).then((resolvedVariables) => {
        if (!resolvedVariables) {
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
          return { exitCode: 0 };
        }
        this._currentTask.resolvedVariables = resolvedVariables;
        return this._executeInTerminal(task, trigger, new VariableResolver(lastTask.getVerifiedTask().workspaceFolder, lastTask.getVerifiedTask().systemInfo, resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
      }, (reason) => {
        return Promise.reject(reason);
      });
    } else {
      this._currentTask.resolvedVariables = lastTask.getVerifiedTask().resolvedVariables;
      return this._executeInTerminal(task, trigger, new VariableResolver(lastTask.getVerifiedTask().workspaceFolder, lastTask.getVerifiedTask().systemInfo, lastTask.getVerifiedTask().resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
    }
  }
  async _executeInTerminal(task, trigger, resolver, workspaceFolder) {
    let terminal = void 0;
    let error = void 0;
    let promise = void 0;
    if (task.configurationProperties.isBackground) {
      const problemMatchers = await this._resolveMatchers(resolver, task.configurationProperties.problemMatchers);
      const watchingProblemMatcher = new WatchingProblemCollector(problemMatchers, this._markerService, this._modelService, this._fileService, this._logService);
      if (problemMatchers.length > 0 && !watchingProblemMatcher.isWatching()) {
        this._appendOutput(nls.localize("TerminalTaskSystem.nonWatchingMatcher", "Task {0} is a background task but uses a problem matcher without a background pattern", task._label));
        this._showOutput();
      }
      const toDispose = new DisposableStore();
      let eventCounter = 0;
      const mapKey = task.getMapKey();
      toDispose.add(watchingProblemMatcher.onDidStateChange((event) => {
        if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
          eventCounter++;
          this._busyTasks[mapKey] = task;
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.Active, task, terminal?.instanceId));
        } else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
          eventCounter--;
          if (this._busyTasks[mapKey]) {
            delete this._busyTasks[mapKey];
          }
          if (event.capturedVariables) {
            this._registerCapturedVariables(event.capturedVariables);
          }
          this._fireTaskEvent(TaskEvent.inactive(task, terminal?.instanceId, this._takeTaskDuration(terminal?.instanceId)));
          if (eventCounter === 0) {
            if (watchingProblemMatcher.numberOfMatches > 0 && watchingProblemMatcher.maxMarkerSeverity && watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
              this._taskErrors[task.getMapKey()] = true;
              this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
              const reveal = task.command.presentation.reveal;
              const revealProblems = task.command.presentation.revealProblems;
              if (revealProblems === RevealProblemKind.OnProblem) {
                this._viewsService.openView(Markers.MARKERS_VIEW_ID, true);
              } else if (reveal === RevealKind.Silent) {
                this._terminalService.setActiveInstance(terminal);
                this._terminalGroupService.showPanel(false);
              }
            } else {
              this._fireTaskEvent(TaskEvent.problemMatcherEnded(task, this._taskHasErrors(task), terminal?.instanceId));
            }
          }
        }
      }));
      watchingProblemMatcher.aboutToStart();
      let delayer = void 0;
      [terminal, error] = await this._createTerminal(task, resolver, workspaceFolder);
      if (error) {
        return Promise.reject(new Error(error.message));
      }
      if (!terminal) {
        return Promise.reject(new Error(`Failed to create terminal for task ${task._label}`));
      }
      this._terminalStatusManager.addTerminal(task, terminal, watchingProblemMatcher);
      this._taskProblemMonitor.addTerminal(terminal, watchingProblemMatcher);
      let processStartedSignaled = false;
      terminal.processReady.then(() => {
        if (!processStartedSignaled) {
          this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
          processStartedSignaled = true;
        }
      }, (_error) => {
        this._logService.error("Task terminal process never got ready");
      });
      this._taskStartTimes.set(terminal.instanceId, Date.now());
      this._fireTaskEvent(TaskEvent.start(task, terminal.instanceId, resolver.values));
      let onData;
      if (problemMatchers.length) {
        onData = terminal.onLineData((line) => {
          watchingProblemMatcher.processLine(line);
          if (!delayer) {
            delayer = new Async.Delayer(3e3);
          }
          delayer.trigger(() => {
            watchingProblemMatcher.forceDelivery();
            delayer = void 0;
          });
        });
      }
      promise = new Promise((resolve, reject) => {
        const boundTerminal = terminal;
        const onExit = terminal.onExit((terminalLaunchResult) => {
          const exitCode = typeof terminalLaunchResult === "number" ? terminalLaunchResult : terminalLaunchResult?.code;
          onData?.dispose();
          onExit.dispose();
          const key = task.getMapKey();
          if (this._busyTasks[mapKey]) {
            delete this._busyTasks[mapKey];
          }
          const cur = this._activeTasks[key];
          if (cur && cur.terminal === boundTerminal) {
            this._removeFromActiveTasks(task);
          }
          this._fireTaskEvent(TaskEvent.changed());
          if (terminalLaunchResult !== void 0) {
            switch (task.command.presentation.panel) {
              case PanelKind.Dedicated:
                this._sameTaskTerminals[key] = terminal.instanceId.toString();
                break;
              case PanelKind.Shared:
                this._idleTaskTerminals.set(key, terminal.instanceId.toString(), Touch.AsOld);
                break;
            }
          }
          const reveal = task.command.presentation.reveal;
          if (reveal === RevealKind.Silent && (exitCode !== 0 || watchingProblemMatcher.numberOfMatches > 0 && watchingProblemMatcher.maxMarkerSeverity && watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error)) {
            try {
              this._terminalService.setActiveInstance(terminal);
              this._terminalGroupService.showPanel(false);
            } catch (e) {
            }
          }
          watchingProblemMatcher.done();
          watchingProblemMatcher.dispose();
          if (!processStartedSignaled) {
            this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
            processStartedSignaled = true;
          }
          const durationMs = this._takeTaskDuration(terminal.instanceId);
          this._fireTaskEvent(TaskEvent.processEnded(task, terminal.instanceId, exitCode, durationMs));
          for (let i = 0; i < eventCounter; i++) {
            this._fireTaskEvent(TaskEvent.inactive(task, terminal.instanceId));
          }
          eventCounter = 0;
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
          toDispose.dispose();
          resolve({ exitCode: exitCode ?? void 0 });
        });
      });
      if (trigger === Triggers.reconnect && !!terminal.xterm) {
        const bufferLines = [];
        const bufferReverseIterator = terminal.xterm.getBufferReverseIterator();
        const startRegex = new RegExp(watchingProblemMatcher.beginPatterns.map((pattern) => pattern.source).join("|"));
        for (const nextLine of bufferReverseIterator) {
          bufferLines.push(nextLine);
          if (startRegex.test(nextLine)) {
            break;
          }
        }
        let delayer2 = void 0;
        for (let i = bufferLines.length - 1; i >= 0; i--) {
          watchingProblemMatcher.processLine(bufferLines[i]);
          if (!delayer2) {
            delayer2 = new Async.Delayer(3e3);
          }
          delayer2.trigger(() => {
            watchingProblemMatcher.forceDelivery();
            delayer2 = void 0;
          });
        }
      }
    } else {
      [terminal, error] = await this._createTerminal(task, resolver, workspaceFolder);
      if (error) {
        return Promise.reject(new Error(error.message));
      }
      if (!terminal) {
        return Promise.reject(new Error(`Failed to create terminal for task ${task._label}`));
      }
      this._taskStartTimes.set(terminal.instanceId, Date.now());
      this._fireTaskEvent(TaskEvent.start(task, terminal.instanceId, resolver.values));
      const mapKey = task.getMapKey();
      this._busyTasks[mapKey] = task;
      this._fireTaskEvent(TaskEvent.general(TaskEventKind.Active, task, terminal.instanceId));
      const problemMatchers = await this._resolveMatchers(resolver, task.configurationProperties.problemMatchers);
      const startStopProblemMatcher = new StartStopProblemCollector(problemMatchers, this._markerService, this._modelService, ProblemHandlingStrategy.Clean, this._fileService, this._logService);
      this._terminalStatusManager.addTerminal(task, terminal, startStopProblemMatcher);
      this._taskProblemMonitor.addTerminal(terminal, startStopProblemMatcher);
      const problemMatcherListener = startStopProblemMatcher.onDidStateChange((event) => {
        if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherStarted, task, terminal?.instanceId));
        } else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
          if (startStopProblemMatcher.numberOfMatches && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
            this._taskErrors[task.getMapKey()] = true;
            this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
          } else {
            this._fireTaskEvent(TaskEvent.problemMatcherEnded(task, this._taskHasErrors(task), terminal?.instanceId));
          }
        }
      });
      let processStartedSignaled = false;
      terminal.processReady.then(() => {
        if (!processStartedSignaled) {
          this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
          processStartedSignaled = true;
        }
      }, (_error) => {
      });
      const onData = terminal.onLineData((line) => {
        startStopProblemMatcher.processLine(line);
      });
      promise = new Promise((resolve, reject) => {
        const boundTerminal = terminal;
        const onExit = terminal.onExit((terminalLaunchResult) => {
          const exitCode = typeof terminalLaunchResult === "number" ? terminalLaunchResult : terminalLaunchResult?.code;
          onExit.dispose();
          const key = task.getMapKey();
          const cur = this._activeTasks[key];
          if (cur && cur.terminal === boundTerminal) {
            this._removeFromActiveTasks(task);
          }
          this._fireTaskEvent(TaskEvent.changed());
          if (terminalLaunchResult !== void 0) {
            switch (task.command.presentation.panel) {
              case PanelKind.Dedicated:
                this._sameTaskTerminals[key] = terminal.instanceId.toString();
                break;
              case PanelKind.Shared:
                this._idleTaskTerminals.set(key, terminal.instanceId.toString(), Touch.AsOld);
                break;
            }
          }
          const reveal = task.command.presentation.reveal;
          const revealProblems = task.command.presentation.revealProblems;
          const revealProblemPanel = terminal && revealProblems === RevealProblemKind.OnProblem && startStopProblemMatcher.numberOfMatches > 0;
          if (revealProblemPanel) {
            this._viewsService.openView(Markers.MARKERS_VIEW_ID);
          } else if (terminal && reveal === RevealKind.Silent && (exitCode !== 0 || startStopProblemMatcher.numberOfMatches > 0 && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error)) {
            try {
              this._terminalService.setActiveInstance(terminal);
              this._terminalGroupService.showPanel(false);
            } catch (e) {
            }
          }
          setTimeout(() => {
            onData.dispose();
            startStopProblemMatcher.done();
            startStopProblemMatcher.dispose();
            problemMatcherListener.dispose();
          }, 100);
          if (!processStartedSignaled && terminal) {
            this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
            processStartedSignaled = true;
          }
          const durationMs = this._takeTaskDuration(terminal?.instanceId);
          this._fireTaskEvent(TaskEvent.processEnded(task, terminal?.instanceId, exitCode ?? void 0, durationMs));
          if (this._busyTasks[mapKey]) {
            delete this._busyTasks[mapKey];
          }
          this._fireTaskEvent(TaskEvent.inactive(task, terminal?.instanceId, durationMs));
          if (startStopProblemMatcher.numberOfMatches && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
            this._taskErrors[task.getMapKey()] = true;
            this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
          } else {
            this._fireTaskEvent(TaskEvent.problemMatcherEnded(task, this._taskHasErrors(task), terminal?.instanceId));
          }
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task, terminal?.instanceId));
          this._cleanupTaskTracking(task);
          resolve({ exitCode: exitCode ?? void 0 });
        });
      });
    }
    const showProblemPanel = task.command.presentation && task.command.presentation.revealProblems === RevealProblemKind.Always;
    if (showProblemPanel) {
      this._viewsService.openView(Markers.MARKERS_VIEW_ID);
    } else if (task.command.presentation && (task.command.presentation.focus || task.command.presentation.reveal === RevealKind.Always)) {
      this._terminalService.setActiveInstance(terminal);
      await this._terminalService.revealTerminal(terminal);
      if (task.command.presentation.focus && terminal) {
        await this._terminalService.focusInstance(terminal);
      }
    }
    if (this._activeTasks[task.getMapKey()]) {
      this._activeTasks[task.getMapKey()].terminal = terminal;
    } else {
      this._logService.warn("No active tasks found for the terminal.");
    }
    this._fireTaskEvent(TaskEvent.changed());
    return promise;
  }
  _takeTaskDuration(terminalId) {
    if (terminalId === void 0) {
      return void 0;
    }
    const startTime = this._taskStartTimes.get(terminalId);
    if (startTime === void 0) {
      return void 0;
    }
    this._taskStartTimes.delete(terminalId);
    return Date.now() - startTime;
  }
  _registerCapturedVariables(capturedVariables) {
    for (const [name, value] of capturedVariables) {
      this._capturedTaskVariables.set(name, value);
      if (!this._configurationResolverService.resolvableVariables.has(`taskVar:${name}`)) {
        this._configurationResolverService.contributeVariable(`taskVar:${name}`, async () => this._capturedTaskVariables.get(name));
      }
    }
  }
  _createTerminalName(task) {
    const needsFolderQualification = this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
    return needsFolderQualification ? task.getQualifiedLabel() : task.configurationProperties.name || "";
  }
  async _createShellLaunchConfig(task, workspaceFolder, variableResolver, platform, options, command, args, waitOnExit, presentationOptions) {
    let shellLaunchConfig;
    const isShellCommand = task.command.runtime === RuntimeType.Shell;
    const needsFolderQualification = this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
    const terminalName = this._createTerminalName(task);
    const type = TaskTerminalType;
    const originalCommand = task.command.name;
    let cwd;
    if (options.cwd) {
      cwd = options.cwd;
      if (!path.isAbsolute(cwd)) {
        if (workspaceFolder && workspaceFolder.uri.scheme === Schemas.file) {
          cwd = path.join(workspaceFolder.uri.fsPath, cwd);
        }
      }
      cwd = isUNC(cwd) ? cwd : resources.toLocalResource(URI.from({ scheme: Schemas.file, path: cwd }), this._environmentService.remoteAuthority, this._pathService.defaultUriScheme);
    }
    if (isShellCommand) {
      let os;
      switch (platform) {
        case Platform.Platform.Windows:
          os = Platform.OperatingSystem.Windows;
          break;
        case Platform.Platform.Mac:
          os = Platform.OperatingSystem.Macintosh;
          break;
        case Platform.Platform.Linux:
        default:
          os = Platform.OperatingSystem.Linux;
          break;
      }
      const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({
        allowAutomationShell: true,
        os,
        remoteAuthority: this._environmentService.remoteAuthority
      });
      let icon;
      if (task.configurationProperties.icon?.id) {
        icon = ThemeIcon.fromId(task.configurationProperties.icon.id);
      } else {
        const taskGroupKind = task.configurationProperties.group ? GroupKind.to(task.configurationProperties.group) : void 0;
        const kindId = typeof taskGroupKind === "string" ? taskGroupKind : taskGroupKind?.kind;
        icon = kindId === "test" ? ThemeIcon.fromId(Codicon.beaker.id) : defaultProfile.icon;
      }
      shellLaunchConfig = {
        name: terminalName,
        type,
        executable: defaultProfile.path,
        args: defaultProfile.args,
        env: { ...defaultProfile.env },
        icon,
        color: task.configurationProperties.icon?.color || void 0,
        waitOnExit
      };
      let shellSpecified = false;
      const shellOptions = task.command.options && task.command.options.shell;
      if (shellOptions) {
        if (shellOptions.executable) {
          if (shellOptions.executable !== shellLaunchConfig.executable) {
            shellLaunchConfig.args = void 0;
          }
          shellLaunchConfig.executable = await this._resolveVariable(variableResolver, shellOptions.executable);
          shellSpecified = true;
        }
        if (shellOptions.args) {
          shellLaunchConfig.args = await this._resolveVariables(variableResolver, shellOptions.args.slice());
        }
      }
      if (shellLaunchConfig.args === void 0) {
        shellLaunchConfig.args = [];
      }
      const shellArgs = Array.isArray(shellLaunchConfig.args) ? shellLaunchConfig.args.slice(0) : [shellLaunchConfig.args];
      const toAdd = [];
      const basename = path.posix.basename((await this._pathService.fileURI(shellLaunchConfig.executable)).path).toLowerCase();
      const commandLine = this._buildShellCommandLine(platform, basename, shellOptions, command, originalCommand, args);
      let windowsShellArgs = false;
      if (platform === Platform.Platform.Windows) {
        windowsShellArgs = true;
        const userHome = await this._pathService.userHome();
        if (basename === "cmd.exe" && (options.cwd && isUNC(options.cwd) || !options.cwd && isUNC(userHome.fsPath))) {
          return void 0;
        }
        if (basename === "powershell.exe" || basename === "pwsh.exe") {
          if (!shellSpecified) {
            toAdd.push("-Command");
          }
        } else if (basename === "bash.exe" || basename === "zsh.exe") {
          windowsShellArgs = false;
          if (!shellSpecified) {
            toAdd.push("-c");
          }
        } else if (basename === "wsl.exe") {
          if (!shellSpecified) {
            toAdd.push("-e");
          }
        } else if (basename === "nu.exe") {
          if (!shellSpecified) {
            toAdd.push("-c");
          }
        } else {
          if (!shellSpecified) {
            toAdd.push("/d", "/c");
          }
        }
      } else {
        if (!shellSpecified) {
          if (platform === Platform.Platform.Mac) {
          }
          toAdd.push("-c");
        }
      }
      const combinedShellArgs = this._addAllArgument(toAdd, shellArgs);
      combinedShellArgs.push(commandLine);
      shellLaunchConfig.shellIntegrationNonce = generateUuid();
      const commandLineInfo = {
        commandLine,
        nonce: shellLaunchConfig.shellIntegrationNonce
      };
      shellLaunchConfig.args = windowsShellArgs ? combinedShellArgs.join(" ") : combinedShellArgs;
      if (task.command.presentation && task.command.presentation.echo) {
        if (needsFolderQualification && workspaceFolder) {
          const folder = cwd && typeof cwd === "object" && Object.hasOwn(cwd, "path") ? path.basename(cwd.path) : workspaceFolder.name;
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executingInFolder",
            comment: ["The workspace folder the task is running in", "The task command line or label"]
          }, "Executing task in folder {0}: {1}", folder, commandLine), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(commandLineInfo);
        } else {
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executing.shellIntegration",
            comment: ["The task command line or label"]
          }, "Executing task: {0}", commandLine), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(commandLineInfo);
        }
      } else {
        shellLaunchConfig.initialText = {
          text: this.taskShellIntegrationStartSequence(cwd) + this.getTaskShellIntegrationOutputSequence(commandLineInfo),
          trailingNewLine: false
        };
      }
    } else {
      const commandExecutable = task.command.runtime !== RuntimeType.CustomExecution ? CommandString.value(command) : void 0;
      const executable = !isShellCommand ? await this._resolveVariable(variableResolver, await this._resolveVariable(variableResolver, "${" + _TerminalTaskSystem.ProcessVarName + "}")) : commandExecutable;
      shellLaunchConfig = {
        name: terminalName,
        type,
        icon: task.configurationProperties.icon?.id ? ThemeIcon.fromId(task.configurationProperties.icon.id) : void 0,
        color: task.configurationProperties.icon?.color || void 0,
        executable,
        args: args.map((a) => Types.isString(a) ? a : a.value),
        waitOnExit
      };
      if (task.command.presentation && task.command.presentation.echo) {
        const getArgsToEcho = (args2) => {
          if (!args2 || args2.length === 0) {
            return "";
          }
          if (Types.isString(args2)) {
            return args2;
          }
          return args2.join(" ");
        };
        if (needsFolderQualification && workspaceFolder) {
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executingInFolder",
            comment: ["The workspace folder the task is running in", "The task command line or label"]
          }, "Executing task in folder {0}: {1}", workspaceFolder.name, `${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(void 0);
        } else {
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executing.shell-integration",
            comment: ["The task command line or label"]
          }, "Executing task: {0}", `${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(void 0);
        }
      } else {
        shellLaunchConfig.initialText = {
          text: this.taskShellIntegrationStartSequence(cwd) + this.getTaskShellIntegrationOutputSequence(void 0),
          trailingNewLine: false
        };
      }
    }
    if (cwd) {
      shellLaunchConfig.cwd = cwd;
    }
    if (options.env) {
      if (shellLaunchConfig.env) {
        shellLaunchConfig.env = { ...shellLaunchConfig.env, ...options.env };
      } else {
        shellLaunchConfig.env = options.env;
      }
    }
    shellLaunchConfig.isFeatureTerminal = true;
    shellLaunchConfig.useShellEnvironment = true;
    shellLaunchConfig.tabActions = this._terminalTabActions;
    return shellLaunchConfig;
  }
  _addAllArgument(shellCommandArgs, configuredShellArgs) {
    const combinedShellArgs = Objects.deepClone(configuredShellArgs);
    shellCommandArgs.forEach((element) => {
      const shouldAddShellCommandArg = configuredShellArgs.every((arg, index) => {
        if (arg.toLowerCase() === element && configuredShellArgs.length > index + 1) {
          return !configuredShellArgs.slice(index + 1).every((testArg) => testArg.startsWith("-"));
        } else {
          return arg.toLowerCase() !== element;
        }
      });
      if (shouldAddShellCommandArg) {
        combinedShellArgs.push(element);
      }
    });
    return combinedShellArgs;
  }
  async _reconnectToTerminal(task) {
    const reconnectedInstances = this._terminalService.instances.filter((e) => e.reconnectionProperties?.ownerId === TaskTerminalType);
    return reconnectedInstances.find((e) => getReconnectionData(e)?.lastTask === task.getCommonTaskId());
  }
  async _doCreateTerminal(task, group, launchConfigs) {
    const reconnectedTerminal = await this._reconnectToTerminal(task);
    const registerOnDisposed = (terminal) => {
      const listener = terminal.onDisposed(() => {
        this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
        listener.dispose();
      });
    };
    if (reconnectedTerminal) {
      if ((CustomTask.is(task) || ContributedTask.is(task)) && task.command.presentation) {
        reconnectedTerminal.waitOnExit = getWaitOnExitValue(task.command.presentation, task.configurationProperties);
      }
      registerOnDisposed(reconnectedTerminal);
      this._logService.trace("reconnected to task and terminal", task._id);
      return reconnectedTerminal;
    }
    if (group) {
      for (const terminal of Object.values(this._terminals)) {
        if (terminal.group === group) {
          this._logService.trace(`Found terminal to split for group ${group}`);
          const originalInstance = terminal.terminal;
          const result = await this._terminalService.createTerminal({ location: { parentTerminal: originalInstance }, config: launchConfigs });
          registerOnDisposed(result);
          if (result) {
            return result;
          }
        }
      }
      this._logService.trace(`No terminal found to split for group ${group}`);
    }
    const createdTerminal = await this._terminalService.createTerminal({ config: launchConfigs });
    registerOnDisposed(createdTerminal);
    return createdTerminal;
  }
  _reconnectToTerminals() {
    if (this._hasReconnected) {
      this._logService.trace(`Already reconnected to terminals, so returning`);
      return;
    }
    const reconnectedInstances = this._terminalService.instances.filter((e) => e.reconnectionProperties?.ownerId === TaskTerminalType);
    this._logService.trace(`Attempting reconnection of ${reconnectedInstances.length} terminals`);
    if (!reconnectedInstances.length) {
      this._logService.trace(`No terminals to reconnect to so returning`);
    } else {
      for (const terminal of reconnectedInstances) {
        const data = getReconnectionData(terminal);
        if (data) {
          const terminalData = { lastTask: data.lastTask, group: data.group, terminal, shellIntegrationNonce: data.shellIntegrationNonce };
          this._terminals[terminal.instanceId] = terminalData;
          const listener = terminal.onDisposed(() => {
            this._deleteTaskAndTerminal(terminal, terminalData);
            listener.dispose();
          });
          this._logService.trace("Reconnecting to task terminal", terminalData.lastTask, terminal.instanceId);
        }
      }
    }
    this._hasReconnected = true;
  }
  _deleteTaskAndTerminal(terminal, terminalData) {
    delete this._terminals[terminal.instanceId];
    delete this._sameTaskTerminals[terminalData.lastTask];
    this._idleTaskTerminals.delete(terminalData.lastTask);
    const mapKey = terminalData.lastTask;
    const cur = this._activeTasks[mapKey];
    if (cur && cur.terminal === terminal) {
      this._removeFromActiveTasks(mapKey);
    }
    if (this._busyTasks[mapKey]) {
      delete this._busyTasks[mapKey];
    }
  }
  async _createTerminal(task, resolver, workspaceFolder) {
    const platform = resolver.taskSystemInfo ? resolver.taskSystemInfo.platform : Platform.platform;
    const options = await this._resolveOptions(resolver, task.command.options);
    const presentationOptions = task.command.presentation;
    if (!presentationOptions) {
      throw new Error("Task presentation options should not be undefined here.");
    }
    const waitOnExit = getWaitOnExitValue(presentationOptions, task.configurationProperties);
    let command;
    let args;
    let launchConfigs;
    if (task.command.runtime === RuntimeType.CustomExecution) {
      this._currentTask.shellLaunchConfig = launchConfigs = {
        customPtyImplementation: (id, cols, rows) => new TerminalProcessExtHostProxy(id, cols, rows, this._terminalService),
        waitOnExit,
        name: this._createTerminalName(task),
        initialText: task.command.presentation && task.command.presentation.echo ? formatMessageForTerminal(nls.localize({
          key: "task.executing",
          comment: ["The task command line or label"]
        }, "Executing task: {0}", task._label), { excludeLeadingNewLine: true }) : void 0,
        isFeatureTerminal: true,
        icon: task.configurationProperties.icon?.id ? ThemeIcon.fromId(task.configurationProperties.icon.id) : void 0,
        color: task.configurationProperties.icon?.color || void 0
      };
    } else {
      const resolvedResult = await this._resolveCommandAndArgs(resolver, task.command);
      command = resolvedResult.command;
      args = resolvedResult.args;
      this._currentTask.shellLaunchConfig = launchConfigs = await this._createShellLaunchConfig(task, workspaceFolder, resolver, platform, options, command, args, waitOnExit, presentationOptions);
      if (launchConfigs === void 0) {
        return [void 0, new TaskError(Severity.Error, nls.localize("TerminalTaskSystem", "Can't execute a shell command on an UNC drive using cmd.exe."), TaskErrors.UnknownError)];
      }
    }
    const prefersSameTerminal = presentationOptions.panel === PanelKind.Dedicated;
    const allowsSharedTerminal = presentationOptions.panel === PanelKind.Shared;
    const group = presentationOptions.group;
    const taskKey = task.getMapKey();
    let terminalToReuse;
    if (prefersSameTerminal) {
      const terminalId = this._sameTaskTerminals[taskKey];
      if (terminalId) {
        terminalToReuse = this._terminals[terminalId];
        delete this._sameTaskTerminals[taskKey];
      }
    } else if (allowsSharedTerminal) {
      let terminalId = this._idleTaskTerminals.remove(taskKey);
      if (!terminalId) {
        for (const taskId of this._idleTaskTerminals.keys()) {
          const idleTerminalId = this._idleTaskTerminals.get(taskId);
          if (idleTerminalId && this._terminals[idleTerminalId] && this._terminals[idleTerminalId].group === group) {
            terminalId = this._idleTaskTerminals.remove(taskId);
            break;
          }
        }
      }
      if (terminalId) {
        terminalToReuse = this._terminals[terminalId];
      }
    }
    if (terminalToReuse) {
      if (!launchConfigs) {
        throw new Error("Task shell launch configuration should not be undefined here.");
      }
      terminalToReuse.terminal.scrollToBottom();
      if (task.configurationProperties.isBackground) {
        launchConfigs.reconnectionProperties = { ownerId: TaskTerminalType, data: { lastTask: task.getCommonTaskId(), group, label: task._label, id: task._id } };
      }
      if (terminalToReuse.shellIntegrationNonce) {
        if (Types.isString(launchConfigs.initialText) && launchConfigs.shellIntegrationNonce) {
          launchConfigs.initialText = launchConfigs.initialText.replace(launchConfigs.shellIntegrationNonce, terminalToReuse.shellIntegrationNonce);
        }
      }
      await terminalToReuse.terminal.reuseTerminal(launchConfigs);
      if (task.command.presentation && task.command.presentation.clear) {
        terminalToReuse.terminal.clearBuffer();
      }
      this._terminals[terminalToReuse.terminal.instanceId.toString()].lastTask = taskKey;
      return [terminalToReuse.terminal, void 0];
    }
    this._terminalCreationQueue = this._terminalCreationQueue.then(() => this._doCreateTerminal(task, group, launchConfigs));
    const terminal = await this._terminalCreationQueue;
    if (task.configurationProperties.isBackground) {
      terminal.shellLaunchConfig.reconnectionProperties = { ownerId: TaskTerminalType, data: { lastTask: task.getCommonTaskId(), group, label: task._label, id: task._id } };
    }
    const terminalKey = terminal.instanceId.toString();
    const terminalData = { terminal, lastTask: taskKey, group, shellIntegrationNonce: terminal.shellLaunchConfig.shellIntegrationNonce };
    const onDisposedListener = terminal.onDisposed(() => {
      this._deleteTaskAndTerminal(terminal, terminalData);
      onDisposedListener.dispose();
    });
    this._terminals[terminalKey] = terminalData;
    terminal.shellLaunchConfig.tabActions = this._terminalTabActions;
    return [terminal, void 0];
  }
  _buildShellCommandLine(platform, shellExecutable, shellOptions, command, originalCommand, args) {
    const basename = path.parse(shellExecutable).name.toLowerCase();
    const shellQuoteOptions = this._getQuotingOptions(basename, shellOptions, platform);
    function needsQuotes(value2) {
      if (value2.length >= 2) {
        const first = value2[0] === shellQuoteOptions.strong ? shellQuoteOptions.strong : value2[0] === shellQuoteOptions.weak ? shellQuoteOptions.weak : void 0;
        if (first === value2[value2.length - 1]) {
          return false;
        }
      }
      let quote2;
      for (let i = 0; i < value2.length; i++) {
        const ch = value2[i];
        if (ch === quote2) {
          quote2 = void 0;
        } else if (quote2 !== void 0) {
          continue;
        } else if (ch === shellQuoteOptions.escape) {
          i++;
        } else if (ch === shellQuoteOptions.strong || ch === shellQuoteOptions.weak) {
          quote2 = ch;
        } else if (ch === " ") {
          return true;
        }
      }
      return false;
    }
    function quote(value2, kind) {
      if (kind === ShellQuoting.Strong && shellQuoteOptions.strong) {
        return [shellQuoteOptions.strong + value2 + shellQuoteOptions.strong, true];
      } else if (kind === ShellQuoting.Weak && shellQuoteOptions.weak) {
        return [shellQuoteOptions.weak + value2 + shellQuoteOptions.weak, true];
      } else if (kind === ShellQuoting.Escape && shellQuoteOptions.escape) {
        if (Types.isString(shellQuoteOptions.escape)) {
          return [value2.replace(/ /g, shellQuoteOptions.escape + " "), true];
        } else {
          const buffer = [];
          for (const ch of shellQuoteOptions.escape.charsToEscape) {
            buffer.push(`\\${ch}`);
          }
          const regexp = new RegExp("[" + buffer.join(",") + "]", "g");
          const escapeChar = shellQuoteOptions.escape.escapeChar;
          return [value2.replace(regexp, (match) => escapeChar + match), true];
        }
      }
      return [value2, false];
    }
    function quoteIfNecessary(value2) {
      if (Types.isString(value2)) {
        if (needsQuotes(value2)) {
          return quote(value2, ShellQuoting.Strong);
        } else {
          return [value2, false];
        }
      } else {
        return quote(value2.value, value2.quoting);
      }
    }
    if ((!args || args.length === 0) && Types.isString(command) && (command === originalCommand || needsQuotes(originalCommand))) {
      return command;
    }
    const result = [];
    let commandQuoted = false;
    let argQuoted = false;
    let value;
    let quoted;
    [value, quoted] = quoteIfNecessary(command);
    result.push(value);
    commandQuoted = quoted;
    for (const arg of args) {
      [value, quoted] = quoteIfNecessary(arg);
      result.push(value);
      argQuoted = argQuoted || quoted;
    }
    let commandLine = result.join(" ");
    if (platform === Platform.Platform.Windows) {
      if (basename === "cmd" && commandQuoted && argQuoted) {
        commandLine = '"' + commandLine + '"';
      } else if ((basename === "powershell" || basename === "pwsh") && commandQuoted) {
        commandLine = "& " + commandLine;
      }
    }
    return commandLine;
  }
  _getQuotingOptions(shellBasename, shellOptions, platform) {
    if (shellOptions && shellOptions.quoting) {
      return shellOptions.quoting;
    }
    return _TerminalTaskSystem._shellQuotes[shellBasename] || _TerminalTaskSystem._osShellQuotes[Platform.PlatformToString(platform)];
  }
  _collectTaskVariables(variables, task) {
    if (task.command && task.command.name) {
      this._collectCommandVariables(variables, task.command, task);
    }
    this._collectMatcherVariables(variables, task.configurationProperties.problemMatchers);
    if (task.command.runtime === RuntimeType.CustomExecution && (CustomTask.is(task) || ContributedTask.is(task))) {
      let definition;
      if (CustomTask.is(task)) {
        definition = task._source.config.element;
      } else {
        definition = Objects.deepClone(task.defines);
        delete definition._key;
        delete definition.type;
      }
      this._collectDefinitionVariables(variables, definition);
    }
  }
  _collectDefinitionVariables(variables, definition) {
    if (Types.isString(definition)) {
      this._collectVariables(variables, definition);
    } else if (Array.isArray(definition)) {
      definition.forEach((element) => this._collectDefinitionVariables(variables, element));
    } else if (Types.isObject(definition)) {
      for (const key of Object.keys(definition)) {
        this._collectDefinitionVariables(variables, definition[key]);
      }
    }
  }
  _collectCommandVariables(variables, command, task) {
    if (command.runtime === RuntimeType.CustomExecution) {
      return;
    }
    if (command.name === void 0) {
      throw new Error("Command name should never be undefined here.");
    }
    this._collectVariables(variables, command.name);
    command.args?.forEach((arg) => this._collectVariables(variables, arg));
    const scope = task._source.scope;
    if (scope !== TaskScope.Global) {
      variables.add("${workspaceFolder}");
    }
    if (command.options) {
      const options = command.options;
      if (options.cwd) {
        this._collectVariables(variables, options.cwd);
      }
      const optionsEnv = options.env;
      if (optionsEnv) {
        Object.keys(optionsEnv).forEach((key) => {
          const value = optionsEnv[key];
          if (Types.isString(value)) {
            this._collectVariables(variables, value);
          }
        });
      }
      if (options.shell) {
        if (options.shell.executable) {
          this._collectVariables(variables, options.shell.executable);
        }
        options.shell.args?.forEach((arg) => this._collectVariables(variables, arg));
      }
    }
  }
  _collectMatcherVariables(variables, values) {
    if (values === void 0 || values === null || values.length === 0) {
      return;
    }
    values.forEach((value) => {
      let matcher;
      if (Types.isString(value)) {
        if (value[0] === "$") {
          matcher = ProblemMatcherRegistry.get(value.substring(1));
        } else {
          matcher = ProblemMatcherRegistry.get(value);
        }
      } else {
        matcher = value;
      }
      if (matcher && matcher.filePrefix) {
        if (Types.isString(matcher.filePrefix)) {
          this._collectVariables(variables, matcher.filePrefix);
        } else {
          for (const fp of [...asArray(matcher.filePrefix.include || []), ...asArray(matcher.filePrefix.exclude || [])]) {
            this._collectVariables(variables, fp);
          }
        }
      }
    });
  }
  _collectVariables(variables, value) {
    const string = Types.isString(value) ? value : value.value;
    const r = /\$\{(.*?)\}/g;
    let matches;
    do {
      matches = r.exec(string);
      if (matches) {
        variables.add(matches[0]);
      }
    } while (matches);
  }
  async _resolveCommandAndArgs(resolver, commandConfig) {
    let args = commandConfig.args ? commandConfig.args.slice() : [];
    args = await this._resolveVariables(resolver, args);
    const command = await this._resolveVariable(resolver, commandConfig.name);
    return { command, args };
  }
  async _resolveVariables(resolver, value) {
    return Promise.all(value.map((s) => this._resolveVariable(resolver, s)));
  }
  async _resolveMatchers(resolver, values) {
    if (values === void 0 || values === null || values.length === 0) {
      return [];
    }
    const result = [];
    for (const value of values) {
      let matcher;
      if (Types.isString(value)) {
        if (value[0] === "$") {
          matcher = ProblemMatcherRegistry.get(value.substring(1));
        } else {
          matcher = ProblemMatcherRegistry.get(value);
        }
      } else {
        matcher = value;
      }
      if (!matcher) {
        this._appendOutput(nls.localize("unknownProblemMatcher", "Problem matcher {0} can't be resolved. The matcher will be ignored"));
        continue;
      }
      const taskSystemInfo = resolver.taskSystemInfo;
      const hasFilePrefix = matcher.filePrefix !== void 0;
      const hasUriProvider = taskSystemInfo !== void 0 && taskSystemInfo.uriProvider !== void 0;
      if (!hasFilePrefix && !hasUriProvider) {
        result.push(matcher);
      } else {
        const copy = Objects.deepClone(matcher);
        if (hasUriProvider && taskSystemInfo !== void 0) {
          copy.uriProvider = taskSystemInfo.uriProvider;
        }
        if (hasFilePrefix) {
          const filePrefix = copy.filePrefix;
          if (Types.isString(filePrefix)) {
            copy.filePrefix = await this._resolveVariable(resolver, filePrefix);
          } else if (filePrefix !== void 0) {
            if (filePrefix.include) {
              filePrefix.include = Array.isArray(filePrefix.include) ? await Promise.all(filePrefix.include.map((x) => this._resolveVariable(resolver, x))) : await this._resolveVariable(resolver, filePrefix.include);
            }
            if (filePrefix.exclude) {
              filePrefix.exclude = Array.isArray(filePrefix.exclude) ? await Promise.all(filePrefix.exclude.map((x) => this._resolveVariable(resolver, x))) : await this._resolveVariable(resolver, filePrefix.exclude);
            }
          }
        }
        result.push(copy);
      }
    }
    return result;
  }
  async _resolveVariable(resolver, value) {
    if (Types.isString(value)) {
      return resolver.resolve(value);
    } else if (value !== void 0) {
      return {
        value: await resolver.resolve(value.value),
        quoting: value.quoting
      };
    } else {
      throw new Error("Should never try to resolve undefined.");
    }
  }
  async _resolveOptions(resolver, options) {
    if (options === void 0 || options === null) {
      let cwd;
      try {
        cwd = await this._resolveVariable(resolver, "${workspaceFolder}");
      } catch (e) {
      }
      return { cwd };
    }
    const result = Types.isString(options.cwd) ? { cwd: await this._resolveVariable(resolver, options.cwd) } : { cwd: await this._resolveVariable(resolver, "${workspaceFolder}") };
    if (options.env) {
      result.env = /* @__PURE__ */ Object.create(null);
      for (const key of Object.keys(options.env)) {
        const value = options.env[key];
        if (Types.isString(value)) {
          result.env[key] = await this._resolveVariable(resolver, value);
        } else {
          result.env[key] = String(value);
        }
      }
    }
    return result;
  }
  getSanitizedCommand(cmd) {
    let result = cmd.toLowerCase();
    const index = result.lastIndexOf(path.sep);
    if (index !== -1) {
      result = result.substring(index + 1);
    }
    if (_TerminalTaskSystem.WellKnownCommands[result]) {
      return result;
    }
    return "other";
  }
  async getTaskForTerminal(instanceId) {
    for (const key of Object.keys(this._activeTasks)) {
      const activeTask = this._activeTasks[key];
      if (activeTask.terminal?.instanceId === instanceId) {
        return activeTask.task;
      }
    }
    const terminalData = this._terminals[instanceId.toString()];
    if (terminalData?.lastTask) {
      return await this._taskLookup(terminalData.lastTask);
    }
    return void 0;
  }
  _appendOutput(output) {
    const outputChannel = this._outputService.getChannel(this._outputChannelId);
    outputChannel?.append(output);
  }
};
_TerminalTaskSystem.TelemetryEventName = "taskService";
_TerminalTaskSystem.ProcessVarName = "__process__";
_TerminalTaskSystem._shellQuotes = {
  "cmd": {
    strong: '"'
  },
  "powershell": {
    escape: {
      escapeChar: "`",
      charsToEscape: ` "'()`
    },
    strong: "'",
    weak: '"'
  },
  "bash": {
    escape: {
      escapeChar: "\\",
      charsToEscape: ` "'`
    },
    strong: "'",
    weak: '"'
  },
  "zsh": {
    escape: {
      escapeChar: "\\",
      charsToEscape: ` "'`
    },
    strong: "'",
    weak: '"'
  }
};
_TerminalTaskSystem._osShellQuotes = {
  "Linux": _TerminalTaskSystem._shellQuotes["bash"],
  "Mac": _TerminalTaskSystem._shellQuotes["bash"],
  "Windows": _TerminalTaskSystem._shellQuotes["powershell"]
};
_TerminalTaskSystem.WellKnownCommands = {
  "ant": true,
  "cmake": true,
  "eslint": true,
  "gradle": true,
  "grunt": true,
  "gulp": true,
  "jake": true,
  "jenkins": true,
  "jshint": true,
  "make": true,
  "maven": true,
  "msbuild": true,
  "msc": true,
  "nmake": true,
  "npm": true,
  "rake": true,
  "tsc": true,
  "xbuild": true
};
let TerminalTaskSystem = _TerminalTaskSystem;
function getWaitOnExitValue(presentationOptions, configurationProperties) {
  if (presentationOptions.close === void 0 || presentationOptions.close === false) {
    if (presentationOptions.reveal !== RevealKind.Never || !configurationProperties.isBackground || presentationOptions.close === false) {
      if (presentationOptions.panel === PanelKind.New) {
        return taskShellIntegrationWaitOnExitSequence(nls.localize("closeTerminal", "Press any key to close the terminal."));
      } else if (presentationOptions.showReuseMessage) {
        return taskShellIntegrationWaitOnExitSequence(nls.localize("reuseTerminal", "Terminal will be reused by tasks, press any key to close it."));
      } else {
        return true;
      }
    }
  }
  return !presentationOptions.close;
}
function taskShellIntegrationWaitOnExitSequence(message) {
  return (exitCode) => {
    return `${VSCodeSequence(VSCodeOscPt.CommandFinished, exitCode.toString())}${message}`;
  };
}
function getReconnectionData(terminal) {
  return terminal.shellLaunchConfig.attachPersistentProcess?.reconnectionProperties?.data;
}
export {
  TerminalTaskSystem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxicm93c2VyXFx0ZXJtaW5hbFRhc2tTeXN0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCAqIGFzIEFzeW5jIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1VOQyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRNYXAsIFRvdWNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCAqIGFzIE9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgUGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgTWFya2VycyB9IGZyb20gJy4uLy4uL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgUHJvYmxlbU1hdGNoZXIsIFByb2JsZW1NYXRjaGVyUmVnaXN0cnkgLyosIFByb2JsZW1QYXR0ZXJuLCBnZXRSZXNvdXJjZSAqLyB9IGZyb20gJy4uL2NvbW1vbi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTaGVsbExhdW5jaENvbmZpZywgV2FpdE9uRXhpdFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRhc2tUZXJtaW5hbFN0YXR1cyB9IGZyb20gJy4vdGFza1Rlcm1pbmFsU3RhdHVzLmpzJztcbmltcG9ydCB7IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQsIFByb2JsZW1IYW5kbGluZ1N0cmF0ZWd5LCBTdGFydFN0b3BQcm9ibGVtQ29sbGVjdG9yLCBXYXRjaGluZ1Byb2JsZW1Db2xsZWN0b3IgfSBmcm9tICcuLi9jb21tb24vcHJvYmxlbUNvbGxlY3RvcnMuanMnO1xuaW1wb3J0IHsgR3JvdXBLaW5kIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElSZXNvbHZlU2V0LCBJUmVzb2x2ZWRWYXJpYWJsZXMsIElUYXNrRXhlY3V0ZVJlc3VsdCwgSVRhc2tSZXNvbHZlciwgSVRhc2tTdW1tYXJ5LCBJVGFza1N5c3RlbSwgSVRhc2tTeXN0ZW1JbmZvLCBJVGFza1N5c3RlbUluZm9SZXNvbHZlciwgSVRhc2tUZXJtaW5hdGVSZXNwb25zZSwgVGFza0Vycm9yLCBUYXNrRXJyb3JzLCBUYXNrRXhlY3V0ZUtpbmQsIFRyaWdnZXJzLCBWZXJpZmllZFRhc2sgfSBmcm9tICcuLi9jb21tb24vdGFza1N5c3RlbS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kT3B0aW9ucywgQ29tbWFuZFN0cmluZywgQ29udHJpYnV0ZWRUYXNrLCBDdXN0b21UYXNrLCBEZXBlbmRzT3JkZXIsIElDb21tYW5kQ29uZmlndXJhdGlvbiwgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBJRXh0ZW5zaW9uVGFza1NvdXJjZSwgSVByZXNlbnRhdGlvbk9wdGlvbnMsIElTaGVsbENvbmZpZ3VyYXRpb24sIElTaGVsbFF1b3RpbmdPcHRpb25zLCBJVGFza0V2ZW50LCBJbk1lbW9yeVRhc2ssIFBhbmVsS2luZCwgUmVydW5Gb3JBY3RpdmVUZXJtaW5hbENvbW1hbmRJZCwgUmV2ZWFsS2luZCwgUmV2ZWFsUHJvYmxlbUtpbmQsIFJ1bnRpbWVUeXBlLCBTaGVsbFF1b3RpbmcsIFRBU0tfVEVSTUlOQUxfQUNUSVZFLCBUYXNrLCBUYXNrRXZlbnQsIFRhc2tFdmVudEtpbmQsIFRhc2tTY29wZSwgVGFza1NvdXJjZUtpbmQsIHJlcnVuVGFza0ljb24gfSBmcm9tICcuLi9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVlNDb2RlT3NjUHJvcGVydHksIFZTQ29kZU9zY1B0LCBWU0NvZGVTZXF1ZW5jZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxFc2NhcGVTZXF1ZW5jZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5IH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHkuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRhc2tQcm9ibGVtTW9uaXRvciB9IGZyb20gJy4vdGFza1Byb2JsZW1Nb25pdG9yLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi94dGVybS9zaGVsbEludGVncmF0aW9uQWRkb24uanMnO1xuXG5pbnRlcmZhY2UgSVRlcm1pbmFsRGF0YSB7XG5cdHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZTtcblx0bGFzdFRhc2s6IHN0cmluZztcblx0Z3JvdXA/OiBzdHJpbmc7XG5cdHNoZWxsSW50ZWdyYXRpb25Ob25jZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElJbnN0YW5jZUNvdW50IHtcblx0Y291bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElBY3RpdmVUZXJtaW5hbERhdGEge1xuXHR0ZXJtaW5hbD86IElUZXJtaW5hbEluc3RhbmNlO1xuXHR0YXNrOiBUYXNrO1xuXHRwcm9taXNlOiBQcm9taXNlPElUYXNrU3VtbWFyeT47XG5cdHN0YXRlPzogVGFza0V2ZW50S2luZDtcblx0Y291bnQ6IElJbnN0YW5jZUNvdW50O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWNvbm5lY3Rpb25UYXNrRGF0YSB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGlkOiBzdHJpbmc7XG5cdGxhc3RUYXNrOiBzdHJpbmc7XG5cdGdyb3VwPzogc3RyaW5nO1xuXHRzaGVsbEludGVncmF0aW9uTm9uY2U/OiBzdHJpbmc7XG59XG5cbmNvbnN0IFRhc2tUZXJtaW5hbFR5cGUgPSAnVGFzayc7XG5cbmNsYXNzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXHRwcml2YXRlIHN0YXRpYyBfcmVnZXggPSAvXFwkXFx7KC4qPylcXH0vZztcblx0Y29uc3RydWN0b3IocHVibGljIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgcHVibGljIHRhc2tTeXN0ZW1JbmZvOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQsIHB1YmxpYyByZWFkb25seSB2YWx1ZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4sIHByaXZhdGUgX3NlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHwgdW5kZWZpbmVkKSB7XG5cdH1cblx0YXN5bmMgcmVzb2x2ZSh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCByZXBsYWNlcnM6IFByb21pc2U8c3RyaW5nPltdID0gW107XG5cdFx0dmFsdWUucmVwbGFjZShWYXJpYWJsZVJlc29sdmVyLl9yZWdleCwgKG1hdGNoLCAuLi5hcmdzKSA9PiB7XG5cdFx0XHRyZXBsYWNlcnMucHVzaCh0aGlzLl9yZXBsYWNlcihtYXRjaCwgYXJncykpO1xuXHRcdFx0cmV0dXJuIG1hdGNoO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc29sdmVkUmVwbGFjZXJzID0gYXdhaXQgUHJvbWlzZS5hbGwocmVwbGFjZXJzKTtcblx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZShWYXJpYWJsZVJlc29sdmVyLl9yZWdleCwgKCkgPT4gcmVzb2x2ZWRSZXBsYWNlcnMuc2hpZnQoKSEpO1xuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXBsYWNlcihtYXRjaDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Ly8gU3RyaXAgb3V0IHRoZSAke30gYmVjYXVzZSB0aGUgbWFwIGNvbnRhaW5zIHRoZW0gdmFyaWFibGVzIHdpdGhvdXQgdGhvc2UgY2hhcmFjdGVycy5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnZhbHVlcy5nZXQobWF0Y2guc3Vic3RyaW5nKDIsIG1hdGNoLmxlbmd0aCAtIDEpKTtcblx0XHRpZiAoKHJlc3VsdCAhPT0gdW5kZWZpbmVkKSAmJiAocmVzdWx0ICE9PSBudWxsKSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3NlcnZpY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXJ2aWNlLnJlc29sdmVBc3luYyh0aGlzLndvcmtzcGFjZUZvbGRlciwgbWF0Y2gpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2g7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxUYXNrU3lzdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUYXNrU3lzdGVtIHtcblxuXHRwdWJsaWMgc3RhdGljIFRlbGVtZXRyeUV2ZW50TmFtZTogc3RyaW5nID0gJ3Rhc2tTZXJ2aWNlJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQcm9jZXNzVmFyTmFtZSA9ICdfX3Byb2Nlc3NfXyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NoZWxsUXVvdGVzOiBJU3RyaW5nRGljdGlvbmFyeTxJU2hlbGxRdW90aW5nT3B0aW9ucz4gPSB7XG5cdFx0J2NtZCc6IHtcblx0XHRcdHN0cm9uZzogJ1wiJ1xuXHRcdH0sXG5cdFx0J3Bvd2Vyc2hlbGwnOiB7XG5cdFx0XHRlc2NhcGU6IHtcblx0XHRcdFx0ZXNjYXBlQ2hhcjogJ2AnLFxuXHRcdFx0XHRjaGFyc1RvRXNjYXBlOiAnIFwiXFwnKCknXG5cdFx0XHR9LFxuXHRcdFx0c3Ryb25nOiAnXFwnJyxcblx0XHRcdHdlYWs6ICdcIidcblx0XHR9LFxuXHRcdCdiYXNoJzoge1xuXHRcdFx0ZXNjYXBlOiB7XG5cdFx0XHRcdGVzY2FwZUNoYXI6ICdcXFxcJyxcblx0XHRcdFx0Y2hhcnNUb0VzY2FwZTogJyBcIlxcJydcblx0XHRcdH0sXG5cdFx0XHRzdHJvbmc6ICdcXCcnLFxuXHRcdFx0d2VhazogJ1wiJ1xuXHRcdH0sXG5cdFx0J3pzaCc6IHtcblx0XHRcdGVzY2FwZToge1xuXHRcdFx0XHRlc2NhcGVDaGFyOiAnXFxcXCcsXG5cdFx0XHRcdGNoYXJzVG9Fc2NhcGU6ICcgXCJcXCcnXG5cdFx0XHR9LFxuXHRcdFx0c3Ryb25nOiAnXFwnJyxcblx0XHRcdHdlYWs6ICdcIidcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSBzdGF0aWMgX29zU2hlbGxRdW90ZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElTaGVsbFF1b3RpbmdPcHRpb25zPiA9IHtcblx0XHQnTGludXgnOiBUZXJtaW5hbFRhc2tTeXN0ZW0uX3NoZWxsUXVvdGVzWydiYXNoJ10sXG5cdFx0J01hYyc6IFRlcm1pbmFsVGFza1N5c3RlbS5fc2hlbGxRdW90ZXNbJ2Jhc2gnXSxcblx0XHQnV2luZG93cyc6IFRlcm1pbmFsVGFza1N5c3RlbS5fc2hlbGxRdW90ZXNbJ3Bvd2Vyc2hlbGwnXVxuXHR9O1xuXG5cdHByaXZhdGUgX2FjdGl2ZVRhc2tzOiBJU3RyaW5nRGljdGlvbmFyeTxJQWN0aXZlVGVybWluYWxEYXRhPjtcblx0cHJpdmF0ZSBfYnVzeVRhc2tzOiBJU3RyaW5nRGljdGlvbmFyeTxUYXNrPjtcblx0cHJpdmF0ZSBfdGFza0Vycm9yczogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj47IC8vIFRyYWNrcyB3aGljaCB0YXNrcyBoYWQgZXJyb3JzIGZyb20gcHJvYmxlbSBtYXRjaGVyc1xuXHRwcml2YXRlIF90YXNrRGVwZW5kZW5jaWVzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmdbXT47IC8vIFRyYWNrcyB3aGljaCB0YXNrcyBkZXBlbmQgb24gd2hpY2ggb3RoZXIgdGFza3Ncblx0cHJpdmF0ZSBfdGVybWluYWxzOiBJU3RyaW5nRGljdGlvbmFyeTxJVGVybWluYWxEYXRhPjtcblx0cHJpdmF0ZSBfaWRsZVRhc2tUZXJtaW5hbHM6IExpbmtlZE1hcDxzdHJpbmcsIHN0cmluZz47XG5cdHByaXZhdGUgX3NhbWVUYXNrVGVybWluYWxzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xuXHRwcml2YXRlIF90YXNrU3lzdGVtSW5mb1Jlc29sdmVyOiBJVGFza1N5c3RlbUluZm9SZXNvbHZlcjtcblx0cHJpdmF0ZSBfbGFzdFRhc2s6IFZlcmlmaWVkVGFzayB8IHVuZGVmaW5lZDtcblx0Ly8gU2hvdWxkIGFsd2F5cyBiZSBzZXQgaW4gcnVuXG5cdHByaXZhdGUgX2N1cnJlbnRUYXNrITogVmVyaWZpZWRUYXNrO1xuXHRwcml2YXRlIF9pc1JlcnVuOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3ByZXZpb3VzUGFuZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcmV2aW91c1Rlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90ZXJtaW5hbFN0YXR1c01hbmFnZXI6IFRhc2tUZXJtaW5hbFN0YXR1cztcblx0cHJpdmF0ZSBfdGFza1Byb2JsZW1Nb25pdG9yOiBUYXNrUHJvYmxlbU1vbml0b3I7XG5cdHByaXZhdGUgX3Rlcm1pbmFsQ3JlYXRpb25RdWV1ZTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHByaXZhdGUgX2hhc1JlY29ubmVjdGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhdGVDaGFuZ2U6IEVtaXR0ZXI8SVRhc2tFdmVudD47XG5cdHByaXZhdGUgX3Rlcm1pbmFsVGFiQWN0aW9ucyA9IFt7IGlkOiBSZXJ1bkZvckFjdGl2ZVRlcm1pbmFsQ29tbWFuZElkLCBsYWJlbDogbmxzLmxvY2FsaXplKCdyZXJ1blRhc2snLCAnUmVydW4gVGFzaycpLCBpY29uOiByZXJ1blRhc2tJY29uIH1dO1xuXHRwcml2YXRlIF90YXNrVGVybWluYWxBY3RpdmU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXNrU3RhcnRUaW1lcyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhcHR1cmVkVGFza1ZhcmlhYmxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0dGFza1NoZWxsSW50ZWdyYXRpb25TdGFydFNlcXVlbmNlKGN3ZDogc3RyaW5nIHwgVVJJIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0VlNDb2RlU2VxdWVuY2UoVlNDb2RlT3NjUHQuUHJvcGVydHksIGAke1ZTQ29kZU9zY1Byb3BlcnR5Lkhhc1JpY2hDb21tYW5kRGV0ZWN0aW9ufT1UcnVlYCkgK1xuXHRcdFx0VlNDb2RlU2VxdWVuY2UoVlNDb2RlT3NjUHQuUHJvbXB0U3RhcnQpICtcblx0XHRcdFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LlByb3BlcnR5LCBgJHtWU0NvZGVPc2NQcm9wZXJ0eS5UYXNrfT1UcnVlYCkgK1xuXHRcdFx0KGN3ZFxuXHRcdFx0XHQ/IFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LlByb3BlcnR5LCBgJHtWU0NvZGVPc2NQcm9wZXJ0eS5Dd2R9PSR7dHlwZW9mIGN3ZCA9PT0gJ3N0cmluZycgPyBjd2QgOiBjd2QuZnNQYXRofWApXG5cdFx0XHRcdDogJydcblx0XHRcdCkgK1xuXHRcdFx0VlNDb2RlU2VxdWVuY2UoVlNDb2RlT3NjUHQuQ29tbWFuZFN0YXJ0KVxuXHRcdCk7XG5cdH1cblx0Z2V0VGFza1NoZWxsSW50ZWdyYXRpb25PdXRwdXRTZXF1ZW5jZShjb21tYW5kTGluZUluZm86IHsgY29tbWFuZExpbmU6IHN0cmluZzsgbm9uY2U6IHN0cmluZyB9IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0KGNvbW1hbmRMaW5lSW5mb1xuXHRcdFx0XHQ/IFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LkNvbW1hbmRMaW5lLCBgJHtzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGNvbW1hbmRMaW5lSW5mby5jb21tYW5kTGluZSl9OyR7Y29tbWFuZExpbmVJbmZvLm5vbmNlfWApXG5cdFx0XHRcdDogJydcblx0XHRcdCkgK1xuXHRcdFx0VlNDb2RlU2VxdWVuY2UoVlNDb2RlT3NjUHQuQ29tbWFuZEV4ZWN1dGVkKVxuXHRcdCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRwcml2YXRlIF9vdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRwcml2YXRlIF9wYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRwcml2YXRlIF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2NvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX291dHB1dENoYW5uZWxJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHR0YXNrU3lzdGVtSW5mb1Jlc29sdmVyOiBJVGFza1N5c3RlbUluZm9SZXNvbHZlcixcblx0XHRwcml2YXRlIF90YXNrTG9va3VwOiAodGFza0tleTogc3RyaW5nKSA9PiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fYWN0aXZlVGFza3MgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX2J1c3lUYXNrcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fdGFza0Vycm9ycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fdGFza0RlcGVuZGVuY2llcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fdGVybWluYWxzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9pZGxlVGFza1Rlcm1pbmFscyA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0dGhpcy5fc2FtZVRhc2tUZXJtaW5hbHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcigpKTtcblx0XHR0aGlzLl90YXNrU3lzdGVtSW5mb1Jlc29sdmVyID0gdGFza1N5c3RlbUluZm9SZXNvbHZlcjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFN0YXR1c01hbmFnZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrVGVybWluYWxTdGF0dXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90YXNrUHJvYmxlbU1vbml0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrUHJvYmxlbU1vbml0b3IpKTtcblx0XHR0aGlzLl90YXNrVGVybWluYWxBY3RpdmUgPSBUQVNLX1RFUk1JTkFMX0FDVElWRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKChlKSA9PiB0aGlzLl90YXNrVGVybWluYWxBY3RpdmUuc2V0KGU/LnNoZWxsTGF1bmNoQ29uZmlnLnR5cGUgPT09ICdUYXNrJykpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRTdGF0ZUNoYW5nZSgpOiBFdmVudDxJVGFza0V2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9sb2codmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FwcGVuZE91dHB1dCh2YWx1ZSArICdcXG4nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2hvd091dHB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKHRoaXMuX291dHB1dENoYW5uZWxJZCwgdHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVjb25uZWN0KHRhc2s6IFRhc2ssIHJlc29sdmVyOiBJVGFza1Jlc29sdmVyKTogSVRhc2tFeGVjdXRlUmVzdWx0IHtcblx0XHR0aGlzLl9yZWNvbm5lY3RUb1Rlcm1pbmFscygpO1xuXHRcdHJldHVybiB0aGlzLnJ1bih0YXNrLCByZXNvbHZlciwgVHJpZ2dlcnMucmVjb25uZWN0KTtcblx0fVxuXG5cdHB1YmxpYyBydW4odGFzazogVGFzaywgcmVzb2x2ZXI6IElUYXNrUmVzb2x2ZXIsIHRyaWdnZXI6IHN0cmluZyA9IFRyaWdnZXJzLmNvbW1hbmQpOiBJVGFza0V4ZWN1dGVSZXN1bHQge1xuXHRcdHRhc2sgPSB0YXNrLmNsb25lKCk7IC8vIEEgc21hbGwgYW1vdW50IG9mIHRhc2sgc3RhdGUgaXMgc3RvcmVkIGluIHRoZSB0YXNrIChpbnN0YW5jZSkgYW5kIHRhc2tzIHBhc3NlZCBpbiB0byBydW4gbWF5IGhhdmUgdGhhdCBzZXQgYWxyZWFkeS5cblx0XHRjb25zdCBpbnN0YW5jZXMgPSBJbk1lbW9yeVRhc2suaXModGFzaykgfHwgdGhpcy5faXNUYXNrRW1wdHkodGFzaykgPyBbXSA6IHRoaXMuX2dldEluc3RhbmNlcyh0YXNrKTtcblx0XHRjb25zdCB2YWxpZEluc3RhbmNlID0gaW5zdGFuY2VzLmxlbmd0aCA8ICgodGFzay5ydW5PcHRpb25zICYmIHRhc2sucnVuT3B0aW9ucy5pbnN0YW5jZUxpbWl0KSA/PyAxKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGluc3RhbmNlc1swXT8uY291bnQ/LmNvdW50ID8/IDA7XG5cdFx0dGhpcy5fY3VycmVudFRhc2sgPSBuZXcgVmVyaWZpZWRUYXNrKHRhc2ssIHJlc29sdmVyLCB0cmlnZ2VyKTtcblx0XHRpZiAoaW5zdGFuY2UgPiAwKSB7XG5cdFx0XHR0YXNrLmluc3RhbmNlID0gaW5zdGFuY2U7XG5cdFx0fVxuXHRcdGlmICghdmFsaWRJbnN0YW5jZSkge1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gaW5zdGFuY2VzW2luc3RhbmNlcy5sZW5ndGggLSAxXTtcblx0XHRcdHRoaXMuX2xhc3RUYXNrID0gdGhpcy5fY3VycmVudFRhc2s7XG5cdFx0XHRyZXR1cm4geyBraW5kOiBUYXNrRXhlY3V0ZUtpbmQuQWN0aXZlLCB0YXNrOiB0ZXJtaW5hbERhdGEudGFzaywgYWN0aXZlOiB7IHNhbWU6IHRydWUsIGJhY2tncm91bmQ6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kISB9LCBwcm9taXNlOiB0ZXJtaW5hbERhdGEucHJvbWlzZSB9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGVjdXRlUmVzdWx0ID0geyBraW5kOiBUYXNrRXhlY3V0ZUtpbmQuU3RhcnRlZCwgdGFzaywgc3RhcnRlZDoge30sIHByb21pc2U6IHRoaXMuX2V4ZWN1dGVUYXNrKHRhc2ssIHJlc29sdmVyLCB0cmlnZ2VyLCBuZXcgU2V0KCksIG5ldyBNYXAoKSwgdW5kZWZpbmVkKSB9O1xuXHRcdFx0ZXhlY3V0ZVJlc3VsdC5wcm9taXNlLnRoZW4oc3VtbWFyeSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xhc3RUYXNrID0gdGhpcy5fY3VycmVudFRhc2s7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBleGVjdXRlUmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBUYXNrRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nKGVycm9yLm1lc3NhZ2UpO1xuXHRcdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5LkVycm9yLCBlcnJvci5tZXNzYWdlLCBUYXNrRXJyb3JzLlVua25vd25FcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2coZXJyb3IudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHRocm93IG5ldyBUYXNrRXJyb3IoU2V2ZXJpdHkuRXJyb3IsIG5scy5sb2NhbGl6ZSgnVGVybWluYWxUYXNrU3lzdGVtLnVua25vd25FcnJvcicsICdBIHVua25vd24gZXJyb3IgaGFzIG9jY3VycmVkIHdoaWxlIGV4ZWN1dGluZyBhIHRhc2suIFNlZSB0YXNrIG91dHB1dCBsb2cgZm9yIGRldGFpbHMuJyksIFRhc2tFcnJvcnMuVW5rbm93bkVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRUZXJtaW5hbHNGb3JUYXNrcyh0YXNrczogVHlwZXMuU2luZ2xlT3JNYW55PFRhc2s+KTogVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdHM6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB0IG9mIGFzQXJyYXkodGFza3MpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh0aGlzLl90ZXJtaW5hbHMpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fdGVybWluYWxzW2tleV07XG5cdFx0XHRcdGlmICh2YWx1ZS5sYXN0VGFzayA9PT0gdC5nZXRNYXBLZXkoKSkge1xuXHRcdFx0XHRcdHJlc3VsdHMucHVzaCh2YWx1ZS50ZXJtaW5hbC5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdHMubGVuZ3RoID4gMCA/IHJlc3VsdHMgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGFza1Byb2JsZW1zKGluc3RhbmNlSWQ6IG51bWJlcik6IE1hcDxzdHJpbmcsIHsgcmVzb3VyY2VzOiBVUklbXTsgbWFya2VyczogSU1hcmtlckRhdGFbXSB9PiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2tQcm9ibGVtTW9uaXRvci5nZXRUYXNrUHJvYmxlbXMoaW5zdGFuY2VJZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVydW4oKTogSVRhc2tFeGVjdXRlUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fbGFzdFRhc2sgJiYgdGhpcy5fbGFzdFRhc2sudmVyaWZ5KCkpIHtcblx0XHRcdGlmICgodGhpcy5fbGFzdFRhc2sudGFzay5ydW5PcHRpb25zLnJlZXZhbHVhdGVPblJlcnVuICE9PSB1bmRlZmluZWQpICYmICF0aGlzLl9sYXN0VGFzay50YXNrLnJ1bk9wdGlvbnMucmVldmFsdWF0ZU9uUmVydW4pIHtcblx0XHRcdFx0dGhpcy5faXNSZXJ1biA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnJ1bih0aGlzLl9sYXN0VGFzay50YXNrLCB0aGlzLl9sYXN0VGFzay5yZXNvbHZlcik7XG5cdFx0XHRyZXN1bHQucHJvbWlzZS50aGVuKHN1bW1hcnkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pc1JlcnVuID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGxhc3RUYXNrKCk6IFZlcmlmaWVkVGFzayB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RUYXNrO1xuXHR9XG5cblx0c2V0IGxhc3RUYXNrKHRhc2s6IFZlcmlmaWVkVGFzayB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2xhc3RUYXNrID0gdGFzaztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dUYXNrTG9hZEVycm9ycyh0YXNrOiBUYXNrKSB7XG5cdFx0aWYgKHRhc2sudGFza0xvYWRNZXNzYWdlcyAmJiB0YXNrLnRhc2tMb2FkTWVzc2FnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGFzay50YXNrTG9hZE1lc3NhZ2VzLmZvckVhY2gobG9hZE1lc3NhZ2UgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2cobG9hZE1lc3NhZ2UgKyAnXFxuJyk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG9wZW5PdXRwdXQgPSAnU2hvdyBPdXRwdXQnO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdUZXJtaW5hbFRhc2tTeXN0ZW0udGFza0xvYWRSZXBvcnRpbmcnLCBcIlRoZXJlIGFyZSBpc3N1ZXMgd2l0aCB0YXNrIFxcXCJ7MH1cXFwiLiBTZWUgdGhlIG91dHB1dCBmb3IgbW9yZSBkZXRhaWxzLlwiLFxuXHRcdFx0XHRcdHRhc2suX2xhYmVsKSwgW3tcblx0XHRcdFx0XHRcdGxhYmVsOiBvcGVuT3V0cHV0LFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9zaG93T3V0cHV0KClcblx0XHRcdFx0XHR9XSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGlzVGFza1Zpc2libGUodGFzazogVGFzayk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHRoaXMuX2FjdGl2ZVRhc2tzW3Rhc2suZ2V0TWFwS2V5KCldO1xuXHRcdGlmICghdGVybWluYWxEYXRhPy50ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVUZXJtaW5hbEluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGNvbnN0IGlzUGFuZWxTaG93aW5nVGVybWluYWwgPSAhIXRoaXMuX3ZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkKFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdHJldHVybiBpc1BhbmVsU2hvd2luZ1Rlcm1pbmFsICYmIChhY3RpdmVUZXJtaW5hbEluc3RhbmNlPy5pbnN0YW5jZUlkID09PSB0ZXJtaW5hbERhdGEudGVybWluYWwuaW5zdGFuY2VJZCk7XG5cdH1cblxuXG5cdHB1YmxpYyByZXZlYWxUYXNrKHRhc2s6IFRhc2spOiBib29sZWFuIHtcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSB0aGlzLl9hY3RpdmVUYXNrc1t0YXNrLmdldE1hcEtleSgpXTtcblx0XHRpZiAoIXRlcm1pbmFsRGF0YT8udGVybWluYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaXNUZXJtaW5hbEluUGFuZWw6IGJvb2xlYW4gPSB0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZChURVJNSU5BTF9WSUVXX0lEKSA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsO1xuXHRcdGlmIChpc1Rlcm1pbmFsSW5QYW5lbCAmJiB0aGlzLmlzVGFza1Zpc2libGUodGFzaykpIHtcblx0XHRcdGlmICh0aGlzLl9wcmV2aW91c1BhbmVsSWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3ByZXZpb3VzVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0aGlzLl9wcmV2aW91c1Rlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKHRoaXMuX3ByZXZpb3VzUGFuZWxJZCwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3BhbmVDb21wb3NpdGVTZXJ2aWNlLmhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcmV2aW91c1BhbmVsSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1Rlcm1pbmFsSW5zdGFuY2UgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpc1Rlcm1pbmFsSW5QYW5lbCkge1xuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1BhbmVsSWQgPSB0aGlzLl9wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk/LmdldElkKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9wcmV2aW91c1BhbmVsSWQgPT09IFRFUk1JTkFMX1ZJRVdfSUQpIHtcblx0XHRcdFx0XHR0aGlzLl9wcmV2aW91c1Rlcm1pbmFsSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2UgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWxEYXRhLnRlcm1pbmFsKTtcblx0XHRcdGlmIChDdXN0b21UYXNrLmlzKHRhc2spIHx8IENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiEuZm9jdXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBpc0FjdGl2ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuaXNBY3RpdmVTeW5jKCkpO1xuXHR9XG5cblx0cHVibGljIGlzQWN0aXZlU3luYygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gT2JqZWN0LnZhbHVlcyh0aGlzLl9hY3RpdmVUYXNrcykuc29tZSh2YWx1ZSA9PiAhIXZhbHVlLnRlcm1pbmFsKTtcblx0fVxuXG5cdHB1YmxpYyBjYW5BdXRvVGVybWluYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBPYmplY3QudmFsdWVzKHRoaXMuX2FjdGl2ZVRhc2tzKS5ldmVyeSh2YWx1ZSA9PiAhdmFsdWUudGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9tcHRPbkNsb3NlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVUYXNrcygpOiBUYXNrW10ge1xuXHRcdHJldHVybiBPYmplY3QudmFsdWVzKHRoaXMuX2FjdGl2ZVRhc2tzKS5mbGF0TWFwKHZhbHVlID0+IHZhbHVlLnRlcm1pbmFsID8gdmFsdWUudGFzayA6IFtdKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMYXN0SW5zdGFuY2UodGFzazogVGFzayk6IFRhc2sgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlY2VudEtleSA9IHRhc2suZ2V0S2V5KCk7XG5cdFx0cmV0dXJuIE9iamVjdC52YWx1ZXModGhpcy5fYWN0aXZlVGFza3MpLnJldmVyc2UoKS5maW5kKFxuXHRcdFx0KHZhbHVlKSA9PiByZWNlbnRLZXkgJiYgcmVjZW50S2V5ID09PSB2YWx1ZS50YXNrLmdldEtleSgpKT8udGFzaztcblx0fVxuXG5cdHB1YmxpYyBnZXRGaXJzdEluc3RhbmNlKHRhc2s6IFRhc2spOiBUYXNrIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWNlbnRLZXkgPSB0YXNrLmdldEtleSgpO1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0aGlzLmdldEFjdGl2ZVRhc2tzKCkpIHtcblx0XHRcdGlmIChyZWNlbnRLZXkgJiYgcmVjZW50S2V5ID09PSB0YXNrLmdldEtleSgpKSB7XG5cdFx0XHRcdHJldHVybiB0YXNrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldEJ1c3lUYXNrcygpOiBUYXNrW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9idXN5VGFza3MpLm1hcChrZXkgPT4gdGhpcy5fYnVzeVRhc2tzW2tleV0pO1xuXHR9XG5cblx0cHVibGljIGN1c3RvbUV4ZWN1dGlvbkNvbXBsZXRlKHRhc2s6IFRhc2ssIHJlc3VsdDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlVGVybWluYWwgPSB0aGlzLl9hY3RpdmVUYXNrc1t0YXNrLmdldE1hcEtleSgpXTtcblx0XHRpZiAoIWFjdGl2ZVRlcm1pbmFsPy50ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignRXhwZWN0ZWQgdG8gaGF2ZSBhIHRlcm1pbmFsIGZvciBhIGN1c3RvbSBleGVjdXRpb24gdGFzaycpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdC8vIGFjdGl2ZVRlcm1pbmFsLnRlcm1pbmFsLnJlbmRlcmVyRXhpdChyZXN1bHQpO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5zdGFuY2VzKHRhc2s6IFRhc2spOiBJQWN0aXZlVGVybWluYWxEYXRhW10ge1xuXHRcdGNvbnN0IHJlY2VudEtleSA9IHRhc2suZ2V0S2V5KCk7XG5cdFx0cmV0dXJuIE9iamVjdC52YWx1ZXModGhpcy5fYWN0aXZlVGFza3MpLmZpbHRlcihcblx0XHRcdCh2YWx1ZSkgPT4gcmVjZW50S2V5ICYmIHJlY2VudEtleSA9PT0gdmFsdWUudGFzay5nZXRLZXkoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVGcm9tQWN0aXZlVGFza3ModGFzazogVGFzayB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHR5cGVvZiB0YXNrID09PSAnc3RyaW5nJyA/IHRhc2sgOiB0YXNrLmdldE1hcEtleSgpO1xuXHRcdGNvbnN0IHRhc2tUb1JlbW92ZSA9IHRoaXMuX2FjdGl2ZVRhc2tzW2tleV07XG5cdFx0aWYgKCF0YXNrVG9SZW1vdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZGVsZXRlIHRoaXMuX2FjdGl2ZVRhc2tzW2tleV07XG5cdH1cblxuXHRwcml2YXRlIF9maXJlVGFza0V2ZW50KGV2ZW50OiBJVGFza0V2ZW50KSB7XG5cdFx0aWYgKGV2ZW50LmtpbmQgIT09IFRhc2tFdmVudEtpbmQuQ2hhbmdlZCAmJiBldmVudC5raW5kICE9PSBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRW5kZWQgJiYgZXZlbnQua2luZCAhPT0gVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlclN0YXJ0ZWQpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVRhc2sgPSB0aGlzLl9hY3RpdmVUYXNrc1tldmVudC5fX3Rhc2suZ2V0TWFwS2V5KCldO1xuXHRcdFx0aWYgKGFjdGl2ZVRhc2spIHtcblx0XHRcdFx0YWN0aXZlVGFzay5zdGF0ZSA9IGV2ZW50LmtpbmQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHRwdWJsaWMgdGVybWluYXRlKHRhc2s6IFRhc2spOiBQcm9taXNlPElUYXNrVGVybWluYXRlUmVzcG9uc2U+IHtcblx0XHRjb25zdCBhY3RpdmVUZXJtaW5hbCA9IHRoaXMuX2FjdGl2ZVRhc2tzW3Rhc2suZ2V0TWFwS2V5KCldO1xuXHRcdGlmICghYWN0aXZlVGVybWluYWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8SVRhc2tUZXJtaW5hdGVSZXNwb25zZT4oeyBzdWNjZXNzOiBmYWxzZSwgdGFzazogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0XHRjb25zdCB0ZXJtaW5hbCA9IGFjdGl2ZVRlcm1pbmFsLnRlcm1pbmFsO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8SVRhc2tUZXJtaW5hdGVSZXNwb25zZT4oeyBzdWNjZXNzOiBmYWxzZSwgdGFzazogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVRhc2tUZXJtaW5hdGVSZXNwb25zZT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3Qgb25FeGl0ID0gdGVybWluYWwub25FeGl0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGVybWluYXRlZFRhc2sgPSBhY3RpdmVUZXJtaW5hbC50YXNrO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG9uRXhpdC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQudGVybWluYXRlZCh0ZXJtaW5hdGVkVGFzaywgdGVybWluYWwuaW5zdGFuY2VJZCwgdGVybWluYWwuZXhpdFJlYXNvbikpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIERvIG5vdGhpbmcuXG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZSh7IHN1Y2Nlc3M6IHRydWUsIHRhc2s6IHRlcm1pbmF0ZWRUYXNrIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXJtaW5hbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgdGVybWluYXRlQWxsKCk6IFByb21pc2U8SVRhc2tUZXJtaW5hdGVSZXNwb25zZVtdPiB7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SVRhc2tUZXJtaW5hdGVSZXNwb25zZT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdGVybWluYWxEYXRhXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLl9hY3RpdmVUYXNrcykpIHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsID0gdGVybWluYWxEYXRhPy50ZXJtaW5hbDtcblx0XHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0XHRwcm9taXNlcy5wdXNoKG5ldyBQcm9taXNlPElUYXNrVGVybWluYXRlUmVzcG9uc2U+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRjb25zdCBvbkV4aXQgPSB0ZXJtaW5hbC5vbkV4aXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFzayA9IHRlcm1pbmFsRGF0YS50YXNrO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0b25FeGl0LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQudGVybWluYXRlZCh0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkLCB0ZXJtaW5hbC5leGl0UmVhc29uKSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHQvLyBEbyBub3RoaW5nLlxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVRhc2tzW2tleV0gPT09IHRlcm1pbmFsRGF0YSkge1xuXHRcdFx0XHRcdFx0XHRkZWxldGUgdGhpcy5fYWN0aXZlVGFza3Nba2V5XTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCB0YXNrOiB0ZXJtaW5hbERhdGEudGFzayB9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0ZXJtaW5hbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLmFsbDxJVGFza1Rlcm1pbmF0ZVJlc3BvbnNlPihwcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93RGVwZW5kZW5jeUN5Y2xlTWVzc2FnZSh0YXNrOiBUYXNrKSB7XG5cdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgnZGVwZW5kZW5jeUN5Y2xlJyxcblx0XHRcdCdUaGVyZSBpcyBhIGRlcGVuZGVuY3kgY3ljbGUuIFNlZSB0YXNrIFwiezB9XCIuJyxcblx0XHRcdHRhc2suX2xhYmVsXG5cdFx0KSk7XG5cdFx0dGhpcy5fc2hvd091dHB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhlY3V0ZVRhc2sodGFzazogVGFzaywgcmVzb2x2ZXI6IElUYXNrUmVzb2x2ZXIsIHRyaWdnZXI6IHN0cmluZywgbGl2ZURlcGVuZGVuY2llczogU2V0PHN0cmluZz4sIGVuY291bnRlcmVkVGFza3M6IE1hcDxzdHJpbmcsIFByb21pc2U8SVRhc2tTdW1tYXJ5Pj4sIGFscmVhZHlSZXNvbHZlZD86IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPElUYXNrU3VtbWFyeT4ge1xuXHRcdHRoaXMuX3Nob3dUYXNrTG9hZEVycm9ycyh0YXNrKTtcblxuXHRcdGNvbnN0IG1hcEtleSA9IHRhc2suZ2V0TWFwS2V5KCk7XG5cblx0XHQvLyBJdCdzIGltcG9ydGFudCB0aGF0IHdlIGFkZCB0aGlzIHRhc2sncyBlbnRyeSB0byBfYWN0aXZlVGFza3MgYmVmb3JlXG5cdFx0Ly8gYW55IG9mIHRoZSBjb2RlIGluIHRoZSB0aGVuIHJ1bnMgKHNlZSAjMTgwNTQxIGFuZCAjMTgwNTc4KS4gV3JhcHBpbmdcblx0XHQvLyBpdCBpbiBQcm9taXNlLnJlc29sdmUoKS50aGVuKCkgZW5zdXJlcyB0aGF0LlxuXHRcdGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKS50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdGFscmVhZHlSZXNvbHZlZCA9IGFscmVhZHlSZXNvbHZlZCA/PyBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SVRhc2tTdW1tYXJ5PltdID0gW107XG5cdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXBlbmRzT24pIHtcblx0XHRcdFx0Y29uc3QgbmV4dExpdmVEZXBlbmRlbmNpZXMgPSBuZXcgU2V0KGxpdmVEZXBlbmRlbmNpZXMpLmFkZCh0YXNrLmdldENvbW1vblRhc2tJZCgpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBkZXBlbmRlbmN5IG9mIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGVwZW5kc09uKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVwZW5kZW5jeVRhc2sgPSBhd2FpdCByZXNvbHZlci5yZXNvbHZlKGRlcGVuZGVuY3kudXJpLCBkZXBlbmRlbmN5LnRhc2spO1xuXHRcdFx0XHRcdGlmIChkZXBlbmRlbmN5VGFzaykge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWRvcHRDb25maWd1cmF0aW9uRm9yRGVwZW5kZW5jeVRhc2soZGVwZW5kZW5jeVRhc2ssIHRhc2spO1xuXG5cdFx0XHRcdFx0XHQvLyBUcmFjayB0aGUgZGVwZW5kZW5jeSByZWxhdGlvbnNoaXBcblx0XHRcdFx0XHRcdGNvbnN0IHRhc2tNYXBLZXkgPSB0YXNrLmdldE1hcEtleSgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVwZW5kZW5jeU1hcEtleSA9IGRlcGVuZGVuY3lUYXNrLmdldE1hcEtleSgpO1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLl90YXNrRGVwZW5kZW5jaWVzW3Rhc2tNYXBLZXldKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tEZXBlbmRlbmNpZXNbdGFza01hcEtleV0gPSBbXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghdGhpcy5fdGFza0RlcGVuZGVuY2llc1t0YXNrTWFwS2V5XS5pbmNsdWRlcyhkZXBlbmRlbmN5TWFwS2V5KSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90YXNrRGVwZW5kZW5jaWVzW3Rhc2tNYXBLZXldLnB1c2goZGVwZW5kZW5jeU1hcEtleSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRsZXQgdGFza1Jlc3VsdDtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1vbktleSA9IGRlcGVuZGVuY3lUYXNrLmdldENvbW1vblRhc2tJZCgpO1xuXHRcdFx0XHRcdFx0aWYgKG5leHRMaXZlRGVwZW5kZW5jaWVzLmhhcyhjb21tb25LZXkpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Nob3dEZXBlbmRlbmN5Q3ljbGVNZXNzYWdlKGRlcGVuZGVuY3lUYXNrKTtcblx0XHRcdFx0XHRcdFx0dGFza1Jlc3VsdCA9IFByb21pc2UucmVzb2x2ZTxJVGFza1N1bW1hcnk+KHt9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRhc2tSZXN1bHQgPSBlbmNvdW50ZXJlZFRhc2tzLmdldChjb21tb25LZXkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRhc2tSZXN1bHQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVUYXNrID0gdGhpcy5fYWN0aXZlVGFza3NbZGVwZW5kZW5jeVRhc2suZ2V0TWFwS2V5KCldID8/IHRoaXMuX2dldEluc3RhbmNlcyhkZXBlbmRlbmN5VGFzaykucG9wKCk7XG5cdFx0XHRcdFx0XHRcdFx0dGFza1Jlc3VsdCA9IGFjdGl2ZVRhc2sgJiYgdGhpcy5fZ2V0RGVwZW5kZW5jeVByb21pc2UoYWN0aXZlVGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghdGFza1Jlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuRGVwZW5kc09uU3RhcnRlZCwgdGFzaykpO1xuXHRcdFx0XHRcdFx0XHR0YXNrUmVzdWx0ID0gdGhpcy5fZXhlY3V0ZURlcGVuZGVuY3lUYXNrKGRlcGVuZGVuY3lUYXNrLCByZXNvbHZlciwgdHJpZ2dlciwgbmV4dExpdmVEZXBlbmRlbmNpZXMsIGVuY291bnRlcmVkVGFza3MsIGFscmVhZHlSZXNvbHZlZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbmNvdW50ZXJlZFRhc2tzLnNldChjb21tb25LZXksIHRhc2tSZXN1bHQpO1xuXHRcdFx0XHRcdFx0cHJvbWlzZXMucHVzaCh0YXNrUmVzdWx0KTtcblx0XHRcdFx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRlcGVuZHNPcmRlciA9PT0gRGVwZW5kc09yZGVyLnNlcXVlbmNlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb21pc2VSZXN1bHQgPSBhd2FpdCB0YXNrUmVzdWx0O1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvbWlzZVJlc3VsdC5leGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ2RlcGVuZGVuY3lGYWlsZWQnLFxuXHRcdFx0XHRcdFx0XHQnQ291bGRuXFwndCByZXNvbHZlIGRlcGVuZGVudCB0YXNrIFxcJ3swfVxcJyBpbiB3b3Jrc3BhY2UgZm9sZGVyIFxcJ3sxfVxcJycsXG5cdFx0XHRcdFx0XHRcdFR5cGVzLmlzU3RyaW5nKGRlcGVuZGVuY3kudGFzaykgPyBkZXBlbmRlbmN5LnRhc2sgOiBKU09OLnN0cmluZ2lmeShkZXBlbmRlbmN5LnRhc2ssIHVuZGVmaW5lZCwgMCksXG5cdFx0XHRcdFx0XHRcdGRlcGVuZGVuY3kudXJpLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd091dHB1dCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKHN1bW1hcmllcyk6IEFzeW5jLk1heWJlUHJvbWlzZTxJVGFza1N1bW1hcnk+ID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBzdW1tYXJ5IG9mIHN1bW1hcmllcykge1xuXHRcdFx0XHRcdGlmIChzdW1tYXJ5LmV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBleGl0Q29kZTogc3VtbWFyeS5leGl0Q29kZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSB8fCBDdXN0b21UYXNrLmlzKHRhc2spKSAmJiAodGFzay5jb21tYW5kKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9pc1JlcnVuKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVleGVjdXRlQ29tbWFuZCh0YXNrLCB0cmlnZ2VyLCBhbHJlYWR5UmVzb2x2ZWQhKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVDb21tYW5kKHRhc2ssIHRyaWdnZXIsIGFscmVhZHlSZXNvbHZlZCEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBleGl0Q29kZTogMCB9O1xuXHRcdFx0fSk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHQvLyBTa2lwIGlmIGEgbGF0ZXIgcnVuIHJlcGxhY2VkIG91ciBlbnRyeTsgd2lwaW5nIGl0IHdvdWxkIG9ycGhhbiB0aGUgbGl2ZSB0YXNrLlxuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVRhc2tzW21hcEtleV0gPT09IGFjdGl2ZVRhc2spIHtcblx0XHRcdFx0ZGVsZXRlIHRoaXMuX2FjdGl2ZVRhc2tzW21hcEtleV07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgbGFzdEluc3RhbmNlID0gdGhpcy5fZ2V0SW5zdGFuY2VzKHRhc2spLnBvcCgpO1xuXHRcdGNvbnN0IGNvdW50ID0gbGFzdEluc3RhbmNlPy5jb3VudCA/PyB7IGNvdW50OiAwIH07XG5cdFx0Y291bnQuY291bnQrKztcblx0XHRjb25zdCBhY3RpdmVUYXNrOiBJQWN0aXZlVGVybWluYWxEYXRhID0geyB0YXNrLCBwcm9taXNlLCBjb3VudCB9O1xuXHRcdHRoaXMuX2FjdGl2ZVRhc2tzW21hcEtleV0gPSBhY3RpdmVUYXNrO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSW5hY3RpdmVEZXBlbmRlbmN5UHJvbWlzZSh0YXNrOiBUYXNrKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVRhc2tTdW1tYXJ5PihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHRhc2tJbmFjdGl2ZURpc3Bvc2FibGUgPSB0aGlzLm9uRGlkU3RhdGVDaGFuZ2UodGFza0V2ZW50ID0+IHtcblx0XHRcdFx0aWYgKCh0YXNrRXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5JbmFjdGl2ZSkgJiYgKHRhc2tFdmVudC5fX3Rhc2sgPT09IHRhc2spKSB7XG5cdFx0XHRcdFx0dGFza0luYWN0aXZlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IGV4aXRDb2RlOiAwIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Rhc2tIYXNFcnJvcnModGFzazogVGFzayk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRhc2tNYXBLZXkgPSB0YXNrLmdldE1hcEtleSgpO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyB0YXNrIGl0c2VsZiBoYWQgZXJyb3JzXG5cdFx0aWYgKHRoaXMuX3Rhc2tFcnJvcnNbdGFza01hcEtleV0pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGFueSB0cmFja2VkIGRlcGVuZGVuY2llcyBoYWQgZXJyb3JzXG5cdFx0Y29uc3QgZGVwZW5kZW5jaWVzID0gdGhpcy5fdGFza0RlcGVuZGVuY2llc1t0YXNrTWFwS2V5XTtcblx0XHRpZiAoZGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRlcGVuZGVuY3lNYXBLZXkgb2YgZGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl90YXNrRXJyb3JzW2RlcGVuZGVuY3lNYXBLZXldKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhbnVwVGFza1RyYWNraW5nKHRhc2s6IFRhc2spOiB2b2lkIHtcblx0XHRjb25zdCB0YXNrTWFwS2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblx0XHRkZWxldGUgdGhpcy5fdGFza0Vycm9yc1t0YXNrTWFwS2V5XTtcblx0XHRkZWxldGUgdGhpcy5fdGFza0RlcGVuZGVuY2llc1t0YXNrTWFwS2V5XTtcblx0fVxuXG5cdHByaXZhdGUgX2Fkb3B0Q29uZmlndXJhdGlvbkZvckRlcGVuZGVuY3lUYXNrKGRlcGVuZGVuY3lUYXNrOiBUYXNrLCB0YXNrOiBUYXNrKTogdm9pZCB7XG5cdFx0aWYgKGRlcGVuZGVuY3lUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24pIHtcblx0XHRcdGRlcGVuZGVuY3lUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24uaWQgfHw9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbj8uaWQ7XG5cdFx0XHRkZXBlbmRlbmN5VGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uLmNvbG9yIHx8PSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmNvbG9yO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZXBlbmRlbmN5VGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldERlcGVuZGVuY3lQcm9taXNlKHRhc2s6IElBY3RpdmVUZXJtaW5hbERhdGEpOiBQcm9taXNlPElUYXNrU3VtbWFyeT4ge1xuXHRcdGlmICghdGFzay50YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCkge1xuXHRcdFx0cmV0dXJuIHRhc2sucHJvbWlzZTtcblx0XHR9XG5cdFx0aWYgKCF0YXNrLnRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzIHx8IHRhc2sudGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGFzay5wcm9taXNlO1xuXHRcdH1cblx0XHRpZiAodGFzay5zdGF0ZSA9PT0gVGFza0V2ZW50S2luZC5JbmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IDAgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUluYWN0aXZlRGVwZW5kZW5jeVByb21pc2UodGFzay50YXNrKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVEZXBlbmRlbmN5VGFzayh0YXNrOiBUYXNrLCByZXNvbHZlcjogSVRhc2tSZXNvbHZlciwgdHJpZ2dlcjogc3RyaW5nLCBsaXZlRGVwZW5kZW5jaWVzOiBTZXQ8c3RyaW5nPiwgZW5jb3VudGVyZWRUYXNrczogTWFwPHN0cmluZywgUHJvbWlzZTxJVGFza1N1bW1hcnk+PiwgYWxyZWFkeVJlc29sdmVkPzogTWFwPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0Ly8gSWYgdGhlIHRhc2sgaXMgYSBiYWNrZ3JvdW5kIHRhc2sgd2l0aCBhIHdhdGNoaW5nIHByb2JsZW0gbWF0Y2hlciwgd2UgZG9uJ3Qgd2FpdCBmb3IgdGhlIHdob2xlIHRhc2sgdG8gZmluaXNoLFxuXHRcdC8vIGp1c3QgZm9yIHRoZSBwcm9ibGVtIG1hdGNoZXIgdG8gZ28gaW5hY3RpdmUuXG5cdFx0aWYgKCF0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVUYXNrKHRhc2ssIHJlc29sdmVyLCB0cmlnZ2VyLCBsaXZlRGVwZW5kZW5jaWVzLCBlbmNvdW50ZXJlZFRhc2tzLCBhbHJlYWR5UmVzb2x2ZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluYWN0aXZlUHJvbWlzZSA9IHRoaXMuX2NyZWF0ZUluYWN0aXZlRGVwZW5kZW5jeVByb21pc2UodGFzayk7XG5cdFx0cmV0dXJuIFByb21pc2UucmFjZShbaW5hY3RpdmVQcm9taXNlLCB0aGlzLl9leGVjdXRlVGFzayh0YXNrLCByZXNvbHZlciwgdHJpZ2dlciwgbGl2ZURlcGVuZGVuY2llcywgZW5jb3VudGVyZWRUYXNrcywgYWxyZWFkeVJlc29sdmVkKV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUFuZEZpbmRFeGVjdXRhYmxlKHN5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCB0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCBjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCwgZW52UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb21tYW5kID0gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlRm9sZGVyLCBDb21tYW5kU3RyaW5nLnZhbHVlKHRhc2suY29tbWFuZC5uYW1lISkpO1xuXHRcdGN3ZCA9IGN3ZCA/IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZUZvbGRlciwgY3dkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkZWxpbWl0ZXIgPSAoYXdhaXQgdGhpcy5fcGF0aFNlcnZpY2UucGF0aCkuZGVsaW1pdGVyO1xuXHRcdGNvbnN0IHBhdGhzID0gZW52UGF0aCA/IGF3YWl0IFByb21pc2UuYWxsKGVudlBhdGguc3BsaXQoZGVsaW1pdGVyKS5tYXAocCA9PiB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2VGb2xkZXIsIHApKSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZm91bmRFeGVjdXRhYmxlID0gYXdhaXQgc3lzdGVtSW5mbz8uZmluZEV4ZWN1dGFibGUoY29tbWFuZCwgY3dkLCBwYXRocyk7XG5cdFx0aWYgKGZvdW5kRXhlY3V0YWJsZSkge1xuXHRcdFx0cmV0dXJuIGZvdW5kRXhlY3V0YWJsZTtcblx0XHR9XG5cdFx0aWYgKHBhdGguaXNBYnNvbHV0ZShjb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdFx0fVxuXHRcdHJldHVybiBwYXRoLmpvaW4oY3dkID8/ICcnLCBjb21tYW5kKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRVbnJlc29sdmVkVmFyaWFibGVzKHZhcmlhYmxlczogU2V0PHN0cmluZz4sIGFscmVhZHlSZXNvbHZlZDogTWFwPHN0cmluZywgc3RyaW5nPik6IFNldDxzdHJpbmc+IHtcblx0XHRpZiAoYWxyZWFkeVJlc29sdmVkLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiB2YXJpYWJsZXM7XG5cdFx0fVxuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIHZhcmlhYmxlcykge1xuXHRcdFx0aWYgKCFhbHJlYWR5UmVzb2x2ZWQuaGFzKHZhcmlhYmxlLnN1YnN0cmluZygyLCB2YXJpYWJsZS5sZW5ndGggLSAxKSkpIHtcblx0XHRcdFx0dW5yZXNvbHZlZC5hZGQodmFyaWFibGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5yZXNvbHZlZDtcblx0fVxuXG5cdHByaXZhdGUgX21lcmdlTWFwcyhtZXJnZUludG86IE1hcDxzdHJpbmcsIHN0cmluZz4sIG1lcmdlRnJvbTogTWFwPHN0cmluZywgc3RyaW5nPikge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgbWVyZ2VGcm9tKSB7XG5cdFx0XHRpZiAoIW1lcmdlSW50by5oYXMoZW50cnlbMF0pKSB7XG5cdFx0XHRcdG1lcmdlSW50by5zZXQoZW50cnlbMF0sIGVudHJ5WzFdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY3F1aXJlSW5wdXQodGFza1N5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCB0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCB2YXJpYWJsZXM6IFNldDxzdHJpbmc+LCBhbHJlYWR5UmVzb2x2ZWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPElSZXNvbHZlZFZhcmlhYmxlcyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlc0Zyb21TZXQodGFza1N5c3RlbUluZm8sIHdvcmtzcGFjZUZvbGRlciwgdGFzaywgdmFyaWFibGVzLCBhbHJlYWR5UmVzb2x2ZWQpO1xuXHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5BY3F1aXJlZElucHV0LCB0YXNrKSk7XG5cdFx0cmV0dXJuIHJlc29sdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVZhcmlhYmxlc0Zyb21TZXQodGFza1N5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCB0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCB2YXJpYWJsZXM6IFNldDxzdHJpbmc+LCBhbHJlYWR5UmVzb2x2ZWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPElSZXNvbHZlZFZhcmlhYmxlcyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGlzUHJvY2VzcyA9IHRhc2suY29tbWFuZCAmJiB0YXNrLmNvbW1hbmQucnVudGltZSA9PT0gUnVudGltZVR5cGUuUHJvY2Vzcztcblx0XHRjb25zdCBvcHRpb25zID0gdGFzay5jb21tYW5kICYmIHRhc2suY29tbWFuZC5vcHRpb25zID8gdGFzay5jb21tYW5kLm9wdGlvbnMgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3dkID0gb3B0aW9ucyA/IG9wdGlvbnMuY3dkIDogdW5kZWZpbmVkO1xuXHRcdGxldCBlbnZQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5lbnYpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG9wdGlvbnMuZW52KSkge1xuXHRcdFx0XHRpZiAoa2V5LnRvTG93ZXJDYXNlKCkgPT09ICdwYXRoJykge1xuXHRcdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhvcHRpb25zLmVudltrZXldKSkge1xuXHRcdFx0XHRcdFx0ZW52UGF0aCA9IG9wdGlvbnMuZW52W2tleV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSB0aGlzLl9maW5kVW5yZXNvbHZlZFZhcmlhYmxlcyh2YXJpYWJsZXMsIGFscmVhZHlSZXNvbHZlZCk7XG5cdFx0bGV0IHJlc29sdmVkVmFyaWFibGVzOiBQcm9taXNlPElSZXNvbHZlZFZhcmlhYmxlcyB8IHVuZGVmaW5lZD47XG5cdFx0aWYgKHRhc2tTeXN0ZW1JbmZvICYmIHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZVNldDogSVJlc29sdmVTZXQgPSB7XG5cdFx0XHRcdHZhcmlhYmxlczogdW5yZXNvbHZlZFxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHRhc2tTeXN0ZW1JbmZvLnBsYXRmb3JtID09PSBQbGF0Zm9ybS5QbGF0Zm9ybS5XaW5kb3dzICYmIGlzUHJvY2Vzcykge1xuXHRcdFx0XHRyZXNvbHZlU2V0LnByb2Nlc3MgPSB7IG5hbWU6IENvbW1hbmRTdHJpbmcudmFsdWUodGFzay5jb21tYW5kLm5hbWUhKSB9O1xuXHRcdFx0XHRpZiAoY3dkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZVNldC5wcm9jZXNzLmN3ZCA9IGN3ZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZW52UGF0aCkge1xuXHRcdFx0XHRcdHJlc29sdmVTZXQucHJvY2Vzcy5wYXRoID0gZW52UGF0aDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZWRWYXJpYWJsZXMgPSB0YXNrU3lzdGVtSW5mby5yZXNvbHZlVmFyaWFibGVzKHdvcmtzcGFjZUZvbGRlciwgcmVzb2x2ZVNldCwgVGFza1NvdXJjZUtpbmQudG9Db25maWd1cmF0aW9uVGFyZ2V0KHRhc2suX3NvdXJjZS5raW5kKSkudGhlbihhc3luYyAocmVzb2x2ZWQpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9tZXJnZU1hcHMoYWxyZWFkeVJlc29sdmVkLCByZXNvbHZlZC52YXJpYWJsZXMpO1xuXHRcdFx0XHRyZXNvbHZlZC52YXJpYWJsZXMgPSBuZXcgTWFwKGFscmVhZHlSZXNvbHZlZCk7XG5cdFx0XHRcdGlmIChpc1Byb2Nlc3MpIHtcblx0XHRcdFx0XHRsZXQgcHJvY2VzcyA9IENvbW1hbmRTdHJpbmcudmFsdWUodGFzay5jb21tYW5kLm5hbWUhKTtcblx0XHRcdFx0XHRpZiAodGFza1N5c3RlbUluZm8ucGxhdGZvcm0gPT09IFBsYXRmb3JtLlBsYXRmb3JtLldpbmRvd3MpIHtcblx0XHRcdFx0XHRcdHByb2Nlc3MgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQW5kRmluZEV4ZWN1dGFibGUodGFza1N5c3RlbUluZm8sIHdvcmtzcGFjZUZvbGRlciwgdGFzaywgY3dkLCBlbnZQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzb2x2ZWQudmFyaWFibGVzLnNldChUZXJtaW5hbFRhc2tTeXN0ZW0uUHJvY2Vzc1Zhck5hbWUsIHByb2Nlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVkVmFyaWFibGVzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZXNBcnJheSA9IG5ldyBBcnJheTxzdHJpbmc+KCk7XG5cdFx0XHR1bnJlc29sdmVkLmZvckVhY2godmFyaWFibGUgPT4gdmFyaWFibGVzQXJyYXkucHVzaCh2YXJpYWJsZSkpO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVJlc29sdmVkVmFyaWFibGVzIHwgdW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZVdpdGhJbnRlcmFjdGlvbih3b3Jrc3BhY2VGb2xkZXIsIHZhcmlhYmxlc0FycmF5LCAndGFza3MnLCB1bmRlZmluZWQsIFRhc2tTb3VyY2VLaW5kLnRvQ29uZmlndXJhdGlvblRhcmdldCh0YXNrLl9zb3VyY2Uua2luZCkpLnRoZW4oYXN5bmMgKHJlc29sdmVkVmFyaWFibGVzTWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVkVmFyaWFibGVzTWFwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9tZXJnZU1hcHMoYWxyZWFkeVJlc29sdmVkLCByZXNvbHZlZFZhcmlhYmxlc01hcCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlZFZhcmlhYmxlc01hcCA9IG5ldyBNYXAoYWxyZWFkeVJlc29sdmVkKTtcblx0XHRcdFx0XHRcdGlmIChpc1Byb2Nlc3MpIHtcblx0XHRcdFx0XHRcdFx0bGV0IHByb2Nlc3NWYXJWYWx1ZTogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHRpZiAoUGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRcdFx0XHRcdFx0cHJvY2Vzc1ZhclZhbHVlID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUFuZEZpbmRFeGVjdXRhYmxlKHRhc2tTeXN0ZW1JbmZvLCB3b3Jrc3BhY2VGb2xkZXIsIHRhc2ssIGN3ZCwgZW52UGF0aCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cHJvY2Vzc1ZhclZhbHVlID0gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlRm9sZGVyLCBDb21tYW5kU3RyaW5nLnZhbHVlKHRhc2suY29tbWFuZC5uYW1lISkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJlc29sdmVkVmFyaWFibGVzTWFwLnNldChUZXJtaW5hbFRhc2tTeXN0ZW0uUHJvY2Vzc1Zhck5hbWUsIHByb2Nlc3NWYXJWYWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFZhcmlhYmxlc1Jlc3VsdDogSVJlc29sdmVkVmFyaWFibGVzID0ge1xuXHRcdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHJlc29sdmVkVmFyaWFibGVzTWFwLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHJlc29sdmUocmVzb2x2ZWRWYXJpYWJsZXNSZXN1bHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCByZWFzb24gPT4ge1xuXHRcdFx0XHRcdHJlamVjdChyZWFzb24pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2V4ZWN1dGVDb21tYW5kKHRhc2s6IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2ssIHRyaWdnZXI6IHN0cmluZywgYWxyZWFkeVJlc29sdmVkOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRjb25zdCB0YXNrV29ya3NwYWNlRm9sZGVyID0gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRsZXQgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0YXNrV29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLl9jdXJyZW50VGFzay53b3Jrc3BhY2VGb2xkZXIgPSB0YXNrV29ya3NwYWNlRm9sZGVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdHdvcmtzcGFjZUZvbGRlciA9IGZvbGRlcnMubGVuZ3RoID4gMCA/IGZvbGRlcnNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCA9IHRoaXMuX2N1cnJlbnRUYXNrLnN5c3RlbUluZm8gPSB0aGlzLl90YXNrU3lzdGVtSW5mb1Jlc29sdmVyKHdvcmtzcGFjZUZvbGRlcik7XG5cblx0XHRjb25zdCB2YXJpYWJsZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLl9jb2xsZWN0VGFza1ZhcmlhYmxlcyh2YXJpYWJsZXMsIHRhc2spO1xuXHRcdGNvbnN0IHJlc29sdmVkVmFyaWFibGVzID0gdGhpcy5fYWNxdWlyZUlucHV0KHN5c3RlbUluZm8sIHdvcmtzcGFjZUZvbGRlciwgdGFzaywgdmFyaWFibGVzLCBhbHJlYWR5UmVzb2x2ZWQpO1xuXG5cdFx0cmV0dXJuIHJlc29sdmVkVmFyaWFibGVzLnRoZW4oKHJlc29sdmVkVmFyaWFibGVzKSA9PiB7XG5cdFx0XHRpZiAocmVzb2x2ZWRWYXJpYWJsZXMgJiYgIXRoaXMuX2lzVGFza0VtcHR5KHRhc2spKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRUYXNrLnJlc29sdmVkVmFyaWFibGVzID0gcmVzb2x2ZWRWYXJpYWJsZXM7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlSW5UZXJtaW5hbCh0YXNrLCB0cmlnZ2VyLCBuZXcgVmFyaWFibGVSZXNvbHZlcih3b3Jrc3BhY2VGb2xkZXIsIHN5c3RlbUluZm8sIHJlc29sdmVkVmFyaWFibGVzLnZhcmlhYmxlcywgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSksIHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBBbGxvd3MgdGhlIHRhc2tFeGVjdXRpb25zIGFycmF5IHRvIGJlIHVwZGF0ZWQgaW4gdGhlIGV4dGVuc2lvbiBob3N0XG5cdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5FbmQsIHRhc2spKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGV4aXRDb2RlOiAwIH0pO1xuXHRcdFx0fVxuXHRcdH0sIHJlYXNvbiA9PiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QocmVhc29uKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVGFza0VtcHR5KHRhc2s6IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2spOiBib29sZWFuIHtcblx0XHRjb25zdCBpc0N1c3RvbUV4ZWN1dGlvbiA9ICh0YXNrLmNvbW1hbmQucnVudGltZSA9PT0gUnVudGltZVR5cGUuQ3VzdG9tRXhlY3V0aW9uKTtcblx0XHRyZXR1cm4gISgodGFzay5jb21tYW5kICE9PSB1bmRlZmluZWQpICYmIHRhc2suY29tbWFuZC5ydW50aW1lICYmIChpc0N1c3RvbUV4ZWN1dGlvbiB8fCAodGFzay5jb21tYW5kLm5hbWUgIT09IHVuZGVmaW5lZCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZXhlY3V0ZUNvbW1hbmQodGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzaywgdHJpZ2dlcjogc3RyaW5nLCBhbHJlYWR5UmVzb2x2ZWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPElUYXNrU3VtbWFyeT4ge1xuXHRcdGNvbnN0IGxhc3RUYXNrID0gdGhpcy5fbGFzdFRhc2s7XG5cdFx0aWYgKCFsYXN0VGFzaykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignTm8gdGFzayBwcmV2aW91c2x5IHJ1bicpKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5fY3VycmVudFRhc2sud29ya3NwYWNlRm9sZGVyID0gbGFzdFRhc2sud29ya3NwYWNlRm9sZGVyO1xuXHRcdC8vIENhcnJ5IHN5c3RlbUluZm8gZm9yd2FyZCwgZWxzZSBhIGxhdGVyIHJlcnVuIHJlc29sdmVzIHRoZSBzaGVsbCBvbiB0aGUgbG9jYWwgaG9zdCAoIzE3NTExOCkuXG5cdFx0dGhpcy5fY3VycmVudFRhc2suc3lzdGVtSW5mbyA9IGxhc3RUYXNrLnN5c3RlbUluZm87XG5cdFx0Y29uc3QgdmFyaWFibGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5fY29sbGVjdFRhc2tWYXJpYWJsZXModmFyaWFibGVzLCB0YXNrKTtcblxuXHRcdC8vIENoZWNrIHRoYXQgdGhlIHRhc2sgaGFzbid0IGNoYW5nZWQgdG8gaW5jbHVkZSBuZXcgdmFyaWFibGVzXG5cdFx0bGV0IGhhc0FsbFZhcmlhYmxlcyA9IHRydWU7XG5cdFx0dmFyaWFibGVzLmZvckVhY2godmFsdWUgPT4ge1xuXHRcdFx0aWYgKE9iamVjdC5oYXNPd24obGFzdFRhc2suZ2V0VmVyaWZpZWRUYXNrKCkucmVzb2x2ZWRWYXJpYWJsZXMsIHZhbHVlLnN1YnN0cmluZygyLCB2YWx1ZS5sZW5ndGggLSAxKSkpIHtcblx0XHRcdFx0aGFzQWxsVmFyaWFibGVzID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIWhhc0FsbFZhcmlhYmxlcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjcXVpcmVJbnB1dChsYXN0VGFzay5nZXRWZXJpZmllZFRhc2soKS5zeXN0ZW1JbmZvLCBsYXN0VGFzay5nZXRWZXJpZmllZFRhc2soKS53b3Jrc3BhY2VGb2xkZXIsIHRhc2ssIHZhcmlhYmxlcywgYWxyZWFkeVJlc29sdmVkKS50aGVuKChyZXNvbHZlZFZhcmlhYmxlcykgPT4ge1xuXHRcdFx0XHRpZiAoIXJlc29sdmVkVmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0Ly8gQWxsb3dzIHRoZSB0YXNrRXhlY3V0aW9ucyBhcnJheSB0byBiZSB1cGRhdGVkIGluIHRoZSBleHRlbnNpb24gaG9zdFxuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5FbmQsIHRhc2spKTtcblx0XHRcdFx0XHRyZXR1cm4geyBleGl0Q29kZTogMCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRUYXNrLnJlc29sdmVkVmFyaWFibGVzID0gcmVzb2x2ZWRWYXJpYWJsZXM7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlSW5UZXJtaW5hbCh0YXNrLCB0cmlnZ2VyLCBuZXcgVmFyaWFibGVSZXNvbHZlcihsYXN0VGFzay5nZXRWZXJpZmllZFRhc2soKS53b3Jrc3BhY2VGb2xkZXIsIGxhc3RUYXNrLmdldFZlcmlmaWVkVGFzaygpLnN5c3RlbUluZm8sIHJlc29sdmVkVmFyaWFibGVzLnZhcmlhYmxlcywgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSksIHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHR9LCByZWFzb24gPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QocmVhc29uKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50VGFzay5yZXNvbHZlZFZhcmlhYmxlcyA9IGxhc3RUYXNrLmdldFZlcmlmaWVkVGFzaygpLnJlc29sdmVkVmFyaWFibGVzO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVJblRlcm1pbmFsKHRhc2ssIHRyaWdnZXIsIG5ldyBWYXJpYWJsZVJlc29sdmVyKGxhc3RUYXNrLmdldFZlcmlmaWVkVGFzaygpLndvcmtzcGFjZUZvbGRlciwgbGFzdFRhc2suZ2V0VmVyaWZpZWRUYXNrKCkuc3lzdGVtSW5mbywgbGFzdFRhc2suZ2V0VmVyaWZpZWRUYXNrKCkucmVzb2x2ZWRWYXJpYWJsZXMudmFyaWFibGVzLCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKSwgd29ya3NwYWNlRm9sZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlSW5UZXJtaW5hbCh0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCB0cmlnZ2VyOiBzdHJpbmcsIHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPElUYXNrU3VtbWFyeT4ge1xuXHRcdGxldCB0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGVycm9yOiBUYXNrRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHByb21pc2U6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdGNvbnN0IHByb2JsZW1NYXRjaGVycyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNYXRjaGVycyhyZXNvbHZlciwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMpO1xuXHRcdFx0Y29uc3Qgd2F0Y2hpbmdQcm9ibGVtTWF0Y2hlciA9IG5ldyBXYXRjaGluZ1Byb2JsZW1Db2xsZWN0b3IocHJvYmxlbU1hdGNoZXJzLCB0aGlzLl9tYXJrZXJTZXJ2aWNlLCB0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRcdGlmICgocHJvYmxlbU1hdGNoZXJzLmxlbmd0aCA+IDApICYmICF3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmlzV2F0Y2hpbmcoKSkge1xuXHRcdFx0XHR0aGlzLl9hcHBlbmRPdXRwdXQobmxzLmxvY2FsaXplKCdUZXJtaW5hbFRhc2tTeXN0ZW0ubm9uV2F0Y2hpbmdNYXRjaGVyJywgJ1Rhc2sgezB9IGlzIGEgYmFja2dyb3VuZCB0YXNrIGJ1dCB1c2VzIGEgcHJvYmxlbSBtYXRjaGVyIHdpdGhvdXQgYSBiYWNrZ3JvdW5kIHBhdHRlcm4nLCB0YXNrLl9sYWJlbCkpO1xuXHRcdFx0XHR0aGlzLl9zaG93T3V0cHV0KCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgZXZlbnRDb3VudGVyOiBudW1iZXIgPSAwO1xuXHRcdFx0Y29uc3QgbWFwS2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblx0XHRcdHRvRGlzcG9zZS5hZGQod2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5vbkRpZFN0YXRlQ2hhbmdlKChldmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQua2luZCA9PT0gUHJvYmxlbUNvbGxlY3RvckV2ZW50S2luZC5CYWNrZ3JvdW5kUHJvY2Vzc2luZ0JlZ2lucykge1xuXHRcdFx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdFx0XHRcdHRoaXMuX2J1c3lUYXNrc1ttYXBLZXldID0gdGFzaztcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuQWN0aXZlLCB0YXNrLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtpbmQgPT09IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQuQmFja2dyb3VuZFByb2Nlc3NpbmdFbmRzKSB7XG5cdFx0XHRcdFx0ZXZlbnRDb3VudGVyLS07XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2J1c3lUYXNrc1ttYXBLZXldKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgdGhpcy5fYnVzeVRhc2tzW21hcEtleV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChldmVudC5jYXB0dXJlZFZhcmlhYmxlcykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJDYXB0dXJlZFZhcmlhYmxlcyhldmVudC5jYXB0dXJlZFZhcmlhYmxlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmluYWN0aXZlKHRhc2ssIHRlcm1pbmFsPy5pbnN0YW5jZUlkLCB0aGlzLl90YWtlVGFza0R1cmF0aW9uKHRlcm1pbmFsPy5pbnN0YW5jZUlkKSkpO1xuXHRcdFx0XHRcdGlmIChldmVudENvdW50ZXIgPT09IDApIHtcblx0XHRcdFx0XHRcdGlmICgod2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5udW1iZXJPZk1hdGNoZXMgPiAwKSAmJiB3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ICYmXG5cdFx0XHRcdFx0XHRcdCh3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ID49IE1hcmtlclNldmVyaXR5LkVycm9yKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90YXNrRXJyb3JzW3Rhc2suZ2V0TWFwS2V5KCldID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMsIHRhc2ssIHRlcm1pbmFsPy5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJldmVhbCA9IHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24hLnJldmVhbDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmV2ZWFsUHJvYmxlbXMgPSB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uIS5yZXZlYWxQcm9ibGVtcztcblx0XHRcdFx0XHRcdFx0aWYgKHJldmVhbFByb2JsZW1zID09PSBSZXZlYWxQcm9ibGVtS2luZC5PblByb2JsZW0pIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHJldmVhbCA9PT0gUmV2ZWFsS2luZC5TaWxlbnQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwhKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwoZmFsc2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9ibGVtTWF0Y2hlckVuZGVkKHRhc2ssIHRoaXMuX3Rhc2tIYXNFcnJvcnModGFzayksIHRlcm1pbmFsPy5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmFib3V0VG9TdGFydCgpO1xuXHRcdFx0bGV0IGRlbGF5ZXI6IEFzeW5jLkRlbGF5ZXI8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRbdGVybWluYWwsIGVycm9yXSA9IGF3YWl0IHRoaXMuX2NyZWF0ZVRlcm1pbmFsKHRhc2ssIHJlc29sdmVyLCB3b3Jrc3BhY2VGb2xkZXIpO1xuXG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigoPFRhc2tFcnJvcj5lcnJvcikubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIHRlcm1pbmFsIGZvciB0YXNrICR7dGFzay5fbGFiZWx9YCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGVybWluYWxTdGF0dXNNYW5hZ2VyLmFkZFRlcm1pbmFsKHRhc2ssIHRlcm1pbmFsLCB3YXRjaGluZ1Byb2JsZW1NYXRjaGVyKTtcblx0XHRcdHRoaXMuX3Rhc2tQcm9ibGVtTW9uaXRvci5hZGRUZXJtaW5hbCh0ZXJtaW5hbCwgd2F0Y2hpbmdQcm9ibGVtTWF0Y2hlcik7XG5cdFx0XHRsZXQgcHJvY2Vzc1N0YXJ0ZWRTaWduYWxlZCA9IGZhbHNlO1xuXHRcdFx0dGVybWluYWwucHJvY2Vzc1JlYWR5LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXByb2Nlc3NTdGFydGVkU2lnbmFsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9jZXNzU3RhcnRlZCh0YXNrLCB0ZXJtaW5hbCEuaW5zdGFuY2VJZCwgdGVybWluYWwhLnByb2Nlc3NJZCEpKTtcblx0XHRcdFx0XHRwcm9jZXNzU3RhcnRlZFNpZ25hbGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgKF9lcnJvcikgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdUYXNrIHRlcm1pbmFsIHByb2Nlc3MgbmV2ZXIgZ290IHJlYWR5Jyk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3Rhc2tTdGFydFRpbWVzLnNldCh0ZXJtaW5hbC5pbnN0YW5jZUlkLCBEYXRlLm5vdygpKTtcblx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnN0YXJ0KHRhc2ssIHRlcm1pbmFsLmluc3RhbmNlSWQsIHJlc29sdmVyLnZhbHVlcykpO1xuXHRcdFx0bGV0IG9uRGF0YTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocHJvYmxlbU1hdGNoZXJzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyB0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJTdGFydGVkLCB0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdC8vIHByZXZlbnQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE3NDUxMSBmcm9tIGhhcHBlbmluZ1xuXHRcdFx0XHRvbkRhdGEgPSB0ZXJtaW5hbC5vbkxpbmVEYXRhKChsaW5lKSA9PiB7XG5cdFx0XHRcdFx0d2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5wcm9jZXNzTGluZShsaW5lKTtcblx0XHRcdFx0XHRpZiAoIWRlbGF5ZXIpIHtcblx0XHRcdFx0XHRcdGRlbGF5ZXIgPSBuZXcgQXN5bmMuRGVsYXllcigzMDAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0XHRcdHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIuZm9yY2VEZWxpdmVyeSgpO1xuXHRcdFx0XHRcdFx0ZGVsYXllciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHByb21pc2UgPSBuZXcgUHJvbWlzZTxJVGFza1N1bW1hcnk+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0Y29uc3QgYm91bmRUZXJtaW5hbCA9IHRlcm1pbmFsITtcblx0XHRcdFx0Y29uc3Qgb25FeGl0ID0gdGVybWluYWwhLm9uRXhpdCgodGVybWluYWxMYXVuY2hSZXN1bHQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IHR5cGVvZiB0ZXJtaW5hbExhdW5jaFJlc3VsdCA9PT0gJ251bWJlcicgPyB0ZXJtaW5hbExhdW5jaFJlc3VsdCA6IHRlcm1pbmFsTGF1bmNoUmVzdWx0Py5jb2RlO1xuXHRcdFx0XHRcdG9uRGF0YT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG9uRXhpdC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fYnVzeVRhc2tzW21hcEtleV0pIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9idXN5VGFza3NbbWFwS2V5XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gU2tpcCBpZiBhIGxhdGVyIHJ1biByZXBsYWNlZCB0aGUgZW50cnkgd2l0aCBhIGRpZmZlcmVudCB0ZXJtaW5hbC5cblx0XHRcdFx0XHRjb25zdCBjdXIgPSB0aGlzLl9hY3RpdmVUYXNrc1trZXldO1xuXHRcdFx0XHRcdGlmIChjdXIgJiYgY3VyLnRlcm1pbmFsID09PSBib3VuZFRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZW1vdmVGcm9tQWN0aXZlVGFza3ModGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmNoYW5nZWQoKSk7XG5cdFx0XHRcdFx0aWYgKHRlcm1pbmFsTGF1bmNoUmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkga2VlcCBhIHJlZmVyZW5jZSB0byB0aGUgdGVybWluYWwgaWYgaXQgaXMgbm90IGJlaW5nIGRpc3Bvc2VkLlxuXHRcdFx0XHRcdFx0c3dpdGNoICh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uIS5wYW5lbCkge1xuXHRcdFx0XHRcdFx0XHRjYXNlIFBhbmVsS2luZC5EZWRpY2F0ZWQ6XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2FtZVRhc2tUZXJtaW5hbHNba2V5XSA9IHRlcm1pbmFsIS5pbnN0YW5jZUlkLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgUGFuZWxLaW5kLlNoYXJlZDpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9pZGxlVGFza1Rlcm1pbmFscy5zZXQoa2V5LCB0ZXJtaW5hbCEuaW5zdGFuY2VJZC50b1N0cmluZygpLCBUb3VjaC5Bc09sZCk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJldmVhbCA9IHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24hLnJldmVhbDtcblx0XHRcdFx0XHRpZiAoKHJldmVhbCA9PT0gUmV2ZWFsS2luZC5TaWxlbnQpICYmICgoZXhpdENvZGUgIT09IDApIHx8ICh3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLm51bWJlck9mTWF0Y2hlcyA+IDApICYmIHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIubWF4TWFya2VyU2V2ZXJpdHkgJiZcblx0XHRcdFx0XHRcdCh3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ID49IE1hcmtlclNldmVyaXR5LkVycm9yKSkpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbCEpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwoZmFsc2UpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBJZiB0aGUgdGVybWluYWwgaGFzIGFscmVhZHkgYmVlbiBkaXNwb3NlZCwgdGhlbiBzZXR0aW5nIHRoZSBhY3RpdmUgaW5zdGFuY2Ugd2lsbCBmYWlsLiAjOTk4Mjhcblx0XHRcdFx0XHRcdFx0Ly8gVGhlcmUgaXMgbm90aGluZyBlbHNlIHRvIGRvIGhlcmUuXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIuZG9uZSgpO1xuXHRcdFx0XHRcdHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGlmICghcHJvY2Vzc1N0YXJ0ZWRTaWduYWxlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQucHJvY2Vzc1N0YXJ0ZWQodGFzaywgdGVybWluYWwhLmluc3RhbmNlSWQsIHRlcm1pbmFsIS5wcm9jZXNzSWQhKSk7XG5cdFx0XHRcdFx0XHRwcm9jZXNzU3RhcnRlZFNpZ25hbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZHVyYXRpb25NcyA9IHRoaXMuX3Rha2VUYXNrRHVyYXRpb24odGVybWluYWwhLmluc3RhbmNlSWQpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnByb2Nlc3NFbmRlZCh0YXNrLCB0ZXJtaW5hbCEuaW5zdGFuY2VJZCwgZXhpdENvZGUsIGR1cmF0aW9uTXMpKTtcblxuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXZlbnRDb3VudGVyOyBpKyspIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmluYWN0aXZlKHRhc2ssIHRlcm1pbmFsIS5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGV2ZW50Q291bnRlciA9IDA7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLkVuZCwgdGFzaykpO1xuXHRcdFx0XHRcdHRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IGV4aXRDb2RlOiBleGl0Q29kZSA/PyB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAodHJpZ2dlciA9PT0gVHJpZ2dlcnMucmVjb25uZWN0ICYmICEhdGVybWluYWwueHRlcm0pIHtcblx0XHRcdFx0Y29uc3QgYnVmZmVyTGluZXMgPSBbXTtcblx0XHRcdFx0Y29uc3QgYnVmZmVyUmV2ZXJzZUl0ZXJhdG9yID0gdGVybWluYWwueHRlcm0uZ2V0QnVmZmVyUmV2ZXJzZUl0ZXJhdG9yKCk7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0UmVnZXggPSBuZXcgUmVnRXhwKHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIuYmVnaW5QYXR0ZXJucy5tYXAocGF0dGVybiA9PiBwYXR0ZXJuLnNvdXJjZSkuam9pbignfCcpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBuZXh0TGluZSBvZiBidWZmZXJSZXZlcnNlSXRlcmF0b3IpIHtcblx0XHRcdFx0XHRidWZmZXJMaW5lcy5wdXNoKG5leHRMaW5lKTtcblx0XHRcdFx0XHRpZiAoc3RhcnRSZWdleC50ZXN0KG5leHRMaW5lKSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBkZWxheWVyOiBBc3luYy5EZWxheWVyPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gYnVmZmVyTGluZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHR3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLnByb2Nlc3NMaW5lKGJ1ZmZlckxpbmVzW2ldKTtcblx0XHRcdFx0XHRpZiAoIWRlbGF5ZXIpIHtcblx0XHRcdFx0XHRcdGRlbGF5ZXIgPSBuZXcgQXN5bmMuRGVsYXllcigzMDAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0XHRcdHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIuZm9yY2VEZWxpdmVyeSgpO1xuXHRcdFx0XHRcdFx0ZGVsYXllciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRbdGVybWluYWwsIGVycm9yXSA9IGF3YWl0IHRoaXMuX2NyZWF0ZVRlcm1pbmFsKHRhc2ssIHJlc29sdmVyLCB3b3Jrc3BhY2VGb2xkZXIpO1xuXG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigoPFRhc2tFcnJvcj5lcnJvcikubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0ZXJtaW5hbCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIHRlcm1pbmFsIGZvciB0YXNrICR7dGFzay5fbGFiZWx9YCkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl90YXNrU3RhcnRUaW1lcy5zZXQodGVybWluYWwuaW5zdGFuY2VJZCwgRGF0ZS5ub3coKSk7XG5cdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5zdGFydCh0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkLCByZXNvbHZlci52YWx1ZXMpKTtcblx0XHRcdGNvbnN0IG1hcEtleSA9IHRhc2suZ2V0TWFwS2V5KCk7XG5cdFx0XHR0aGlzLl9idXN5VGFza3NbbWFwS2V5XSA9IHRhc2s7XG5cdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuQWN0aXZlLCB0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkKSk7XG5cblx0XHRcdGNvbnN0IHByb2JsZW1NYXRjaGVycyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNYXRjaGVycyhyZXNvbHZlciwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMpO1xuXHRcdFx0Y29uc3Qgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIgPSBuZXcgU3RhcnRTdG9wUHJvYmxlbUNvbGxlY3Rvcihwcm9ibGVtTWF0Y2hlcnMsIHRoaXMuX21hcmtlclNlcnZpY2UsIHRoaXMuX21vZGVsU2VydmljZSwgUHJvYmxlbUhhbmRsaW5nU3RyYXRlZ3kuQ2xlYW4sIHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU3RhdHVzTWFuYWdlci5hZGRUZXJtaW5hbCh0YXNrLCB0ZXJtaW5hbCwgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIpO1xuXHRcdFx0dGhpcy5fdGFza1Byb2JsZW1Nb25pdG9yLmFkZFRlcm1pbmFsKHRlcm1pbmFsLCBzdGFydFN0b3BQcm9ibGVtTWF0Y2hlcik7XG5cdFx0XHRjb25zdCBwcm9ibGVtTWF0Y2hlckxpc3RlbmVyID0gc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIub25EaWRTdGF0ZUNoYW5nZSgoZXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQuQmFja2dyb3VuZFByb2Nlc3NpbmdCZWdpbnMpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJTdGFydGVkLCB0YXNrLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtpbmQgPT09IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQuQmFja2dyb3VuZFByb2Nlc3NpbmdFbmRzKSB7XG5cdFx0XHRcdFx0aWYgKHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLm51bWJlck9mTWF0Y2hlcyAmJiBzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSAmJiBzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSA+PSBNYXJrZXJTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGFza0Vycm9yc1t0YXNrLmdldE1hcEtleSgpXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJGb3VuZEVycm9ycywgdGFzaywgdGVybWluYWw/Lmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQucHJvYmxlbU1hdGNoZXJFbmRlZCh0YXNrLCB0aGlzLl90YXNrSGFzRXJyb3JzKHRhc2spLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgcHJvY2Vzc1N0YXJ0ZWRTaWduYWxlZCA9IGZhbHNlO1xuXHRcdFx0dGVybWluYWwucHJvY2Vzc1JlYWR5LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXByb2Nlc3NTdGFydGVkU2lnbmFsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9jZXNzU3RhcnRlZCh0YXNrLCB0ZXJtaW5hbCEuaW5zdGFuY2VJZCwgdGVybWluYWwhLnByb2Nlc3NJZCEpKTtcblx0XHRcdFx0XHRwcm9jZXNzU3RhcnRlZFNpZ25hbGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgKF9lcnJvcikgPT4ge1xuXHRcdFx0XHQvLyBUaGUgcHJvY2VzcyBuZXZlciBnb3QgcmVhZHkuIE5lZWQgdG8gdGhpbmsgaG93IHRvIGhhbmRsZSB0aGlzLlxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG9uRGF0YSA9IHRlcm1pbmFsLm9uTGluZURhdGEoKGxpbmUpID0+IHtcblx0XHRcdFx0c3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIucHJvY2Vzc0xpbmUobGluZSk7XG5cdFx0XHR9KTtcblx0XHRcdHByb21pc2UgPSBuZXcgUHJvbWlzZTxJVGFza1N1bW1hcnk+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0Y29uc3QgYm91bmRUZXJtaW5hbCA9IHRlcm1pbmFsITtcblx0XHRcdFx0Y29uc3Qgb25FeGl0ID0gdGVybWluYWwhLm9uRXhpdCgodGVybWluYWxMYXVuY2hSZXN1bHQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IHR5cGVvZiB0ZXJtaW5hbExhdW5jaFJlc3VsdCA9PT0gJ251bWJlcicgPyB0ZXJtaW5hbExhdW5jaFJlc3VsdCA6IHRlcm1pbmFsTGF1bmNoUmVzdWx0Py5jb2RlO1xuXHRcdFx0XHRcdG9uRXhpdC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblx0XHRcdFx0XHQvLyBTa2lwIGlmIGEgbGF0ZXIgcnVuIHJlcGxhY2VkIHRoZSBlbnRyeSB3aXRoIGEgZGlmZmVyZW50IHRlcm1pbmFsLlxuXHRcdFx0XHRcdGNvbnN0IGN1ciA9IHRoaXMuX2FjdGl2ZVRhc2tzW2tleV07XG5cdFx0XHRcdFx0aWYgKGN1ciAmJiBjdXIudGVybWluYWwgPT09IGJvdW5kVGVybWluYWwpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlbW92ZUZyb21BY3RpdmVUYXNrcyh0YXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuY2hhbmdlZCgpKTtcblx0XHRcdFx0XHRpZiAodGVybWluYWxMYXVuY2hSZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Ly8gT25seSBrZWVwIGEgcmVmZXJlbmNlIHRvIHRoZSB0ZXJtaW5hbCBpZiBpdCBpcyBub3QgYmVpbmcgZGlzcG9zZWQuXG5cdFx0XHRcdFx0XHRzd2l0Y2ggKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24hLnBhbmVsKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgUGFuZWxLaW5kLkRlZGljYXRlZDpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zYW1lVGFza1Rlcm1pbmFsc1trZXldID0gdGVybWluYWwhLmluc3RhbmNlSWQudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0Y2FzZSBQYW5lbEtpbmQuU2hhcmVkOlxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2lkbGVUYXNrVGVybWluYWxzLnNldChrZXksIHRlcm1pbmFsIS5pbnN0YW5jZUlkLnRvU3RyaW5nKCksIFRvdWNoLkFzT2xkKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZWFsID0gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiEucmV2ZWFsO1xuXHRcdFx0XHRcdGNvbnN0IHJldmVhbFByb2JsZW1zID0gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiEucmV2ZWFsUHJvYmxlbXM7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZWFsUHJvYmxlbVBhbmVsID0gdGVybWluYWwgJiYgKHJldmVhbFByb2JsZW1zID09PSBSZXZlYWxQcm9ibGVtS2luZC5PblByb2JsZW0pICYmIChzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5udW1iZXJPZk1hdGNoZXMgPiAwKTtcblx0XHRcdFx0XHRpZiAocmV2ZWFsUHJvYmxlbVBhbmVsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGVybWluYWwgJiYgKHJldmVhbCA9PT0gUmV2ZWFsS2luZC5TaWxlbnQpICYmICgoZXhpdENvZGUgIT09IDApIHx8IChzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5udW1iZXJPZk1hdGNoZXMgPiAwKSAmJiBzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSAmJlxuXHRcdFx0XHRcdFx0KHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ID49IE1hcmtlclNldmVyaXR5LkVycm9yKSkpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbChmYWxzZSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIElmIHRoZSB0ZXJtaW5hbCBoYXMgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkLCB0aGVuIHNldHRpbmcgdGhlIGFjdGl2ZSBpbnN0YW5jZSB3aWxsIGZhaWwuICM5OTgyOFxuXHRcdFx0XHRcdFx0XHQvLyBUaGVyZSBpcyBub3RoaW5nIGVsc2UgdG8gZG8gaGVyZS5cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gSGFjayB0byB3b3JrIGFyb3VuZCAjOTI4NjggdW50aWwgdGVybWluYWwgaXMgZml4ZWQuXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRvbkRhdGEuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0c3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIuZG9uZSgpO1xuXHRcdFx0XHRcdFx0c3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXJMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fSwgMTAwKTtcblx0XHRcdFx0XHRpZiAoIXByb2Nlc3NTdGFydGVkU2lnbmFsZWQgJiYgdGVybWluYWwpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnByb2Nlc3NTdGFydGVkKHRhc2ssIHRlcm1pbmFsLmluc3RhbmNlSWQsIHRlcm1pbmFsLnByb2Nlc3NJZCEpKTtcblx0XHRcdFx0XHRcdHByb2Nlc3NTdGFydGVkU2lnbmFsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGR1cmF0aW9uTXMgPSB0aGlzLl90YWtlVGFza0R1cmF0aW9uKHRlcm1pbmFsPy5pbnN0YW5jZUlkKTtcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9jZXNzRW5kZWQodGFzaywgdGVybWluYWw/Lmluc3RhbmNlSWQsIGV4aXRDb2RlID8/IHVuZGVmaW5lZCwgZHVyYXRpb25NcykpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9idXN5VGFza3NbbWFwS2V5XSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX2J1c3lUYXNrc1ttYXBLZXldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5pbmFjdGl2ZSh0YXNrLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCwgZHVyYXRpb25NcykpO1xuXHRcdFx0XHRcdGlmIChzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5udW1iZXJPZk1hdGNoZXMgJiYgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubWF4TWFya2VyU2V2ZXJpdHkgJiYgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubWF4TWFya2VyU2V2ZXJpdHkgPj0gTWFya2VyU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tFcnJvcnNbdGFzay5nZXRNYXBLZXkoKV0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMsIHRhc2ssIHRlcm1pbmFsPy5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnByb2JsZW1NYXRjaGVyRW5kZWQodGFzaywgdGhpcy5fdGFza0hhc0Vycm9ycyh0YXNrKSwgdGVybWluYWw/Lmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLkVuZCwgdGFzaywgdGVybWluYWw/Lmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHR0aGlzLl9jbGVhbnVwVGFza1RyYWNraW5nKHRhc2spO1xuXHRcdFx0XHRcdHJlc29sdmUoeyBleGl0Q29kZTogZXhpdENvZGUgPz8gdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3dQcm9ibGVtUGFuZWwgPSB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uICYmICh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLnJldmVhbFByb2JsZW1zID09PSBSZXZlYWxQcm9ibGVtS2luZC5BbHdheXMpO1xuXHRcdGlmIChzaG93UHJvYmxlbVBhbmVsKSB7XG5cdFx0XHR0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQpO1xuXHRcdH0gZWxzZSBpZiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiAmJiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5mb2N1cyB8fCB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLnJldmVhbCA9PT0gUmV2ZWFsS2luZC5BbHdheXMpKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwpO1xuXHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLnJldmVhbFRlcm1pbmFsKHRlcm1pbmFsKTtcblx0XHRcdGlmICh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLmZvY3VzICYmIHRlcm1pbmFsKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb2N1c0luc3RhbmNlKHRlcm1pbmFsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZVRhc2tzW3Rhc2suZ2V0TWFwS2V5KCldKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVUYXNrc1t0YXNrLmdldE1hcEtleSgpXS50ZXJtaW5hbCA9IHRlcm1pbmFsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ05vIGFjdGl2ZSB0YXNrcyBmb3VuZCBmb3IgdGhlIHRlcm1pbmFsLicpO1xuXHRcdH1cblx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5jaGFuZ2VkKCkpO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGFrZVRhc2tEdXJhdGlvbih0ZXJtaW5hbElkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0ZXJtaW5hbElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IHRoaXMuX3Rhc2tTdGFydFRpbWVzLmdldCh0ZXJtaW5hbElkKTtcblx0XHRpZiAoc3RhcnRUaW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3Rhc2tTdGFydFRpbWVzLmRlbGV0ZSh0ZXJtaW5hbElkKTtcblx0XHRyZXR1cm4gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ2FwdHVyZWRWYXJpYWJsZXMoY2FwdHVyZWRWYXJpYWJsZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBjYXB0dXJlZFZhcmlhYmxlcykge1xuXHRcdFx0dGhpcy5fY2FwdHVyZWRUYXNrVmFyaWFibGVzLnNldChuYW1lLCB2YWx1ZSk7XG5cdFx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2YWJsZVZhcmlhYmxlcy5oYXMoYHRhc2tWYXI6JHtuYW1lfWApKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UuY29udHJpYnV0ZVZhcmlhYmxlKGB0YXNrVmFyOiR7bmFtZX1gLCBhc3luYyAoKSA9PiB0aGlzLl9jYXB0dXJlZFRhc2tWYXJpYWJsZXMuZ2V0KG5hbWUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUZXJtaW5hbE5hbWUodGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzayk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbmVlZHNGb2xkZXJRdWFsaWZpY2F0aW9uID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdHJldHVybiBuZWVkc0ZvbGRlclF1YWxpZmljYXRpb24gPyB0YXNrLmdldFF1YWxpZmllZExhYmVsKCkgOiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIHx8ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVNoZWxsTGF1bmNoQ29uZmlnKHRhc2s6IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2ssIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgdmFyaWFibGVSZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgcGxhdGZvcm06IFBsYXRmb3JtLlBsYXRmb3JtLCBvcHRpb25zOiBDb21tYW5kT3B0aW9ucywgY29tbWFuZDogQ29tbWFuZFN0cmluZywgYXJnczogQ29tbWFuZFN0cmluZ1tdLCB3YWl0T25FeGl0OiBXYWl0T25FeGl0VmFsdWUsIHByZXNlbnRhdGlvbk9wdGlvbnM6IElQcmVzZW50YXRpb25PcHRpb25zKTogUHJvbWlzZTxJU2hlbGxMYXVuY2hDb25maWcgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZztcblx0XHRjb25zdCBpc1NoZWxsQ29tbWFuZCA9IHRhc2suY29tbWFuZC5ydW50aW1lID09PSBSdW50aW1lVHlwZS5TaGVsbDtcblx0XHRjb25zdCBuZWVkc0ZvbGRlclF1YWxpZmljYXRpb24gPSB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U7XG5cdFx0Y29uc3QgdGVybWluYWxOYW1lID0gdGhpcy5fY3JlYXRlVGVybWluYWxOYW1lKHRhc2spO1xuXHRcdGNvbnN0IHR5cGUgPSBUYXNrVGVybWluYWxUeXBlO1xuXHRcdGNvbnN0IG9yaWdpbmFsQ29tbWFuZCA9IHRhc2suY29tbWFuZC5uYW1lO1xuXHRcdGxldCBjd2Q6IHN0cmluZyB8IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucy5jd2QpIHtcblx0XHRcdGN3ZCA9IG9wdGlvbnMuY3dkO1xuXHRcdFx0aWYgKCFwYXRoLmlzQWJzb2x1dGUoY3dkKSkge1xuXHRcdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyICYmICh3b3Jrc3BhY2VGb2xkZXIudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSkge1xuXHRcdFx0XHRcdGN3ZCA9IHBhdGguam9pbih3b3Jrc3BhY2VGb2xkZXIudXJpLmZzUGF0aCwgY3dkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gVGhpcyBtdXN0IGJlIG5vcm1hbGl6ZWQgdG8gdGhlIE9TXG5cdFx0XHRjd2QgPSBpc1VOQyhjd2QpID8gY3dkIDogcmVzb3VyY2VzLnRvTG9jYWxSZXNvdXJjZShVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBjd2QgfSksIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksIHRoaXMuX3BhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpO1xuXHRcdH1cblx0XHRpZiAoaXNTaGVsbENvbW1hbmQpIHtcblx0XHRcdGxldCBvczogUGxhdGZvcm0uT3BlcmF0aW5nU3lzdGVtO1xuXHRcdFx0c3dpdGNoIChwbGF0Zm9ybSkge1xuXHRcdFx0XHRjYXNlIFBsYXRmb3JtLlBsYXRmb3JtLldpbmRvd3M6IG9zID0gUGxhdGZvcm0uT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIFBsYXRmb3JtLlBsYXRmb3JtLk1hYzogb3MgPSBQbGF0Zm9ybS5PcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOyBicmVhaztcblx0XHRcdFx0Y2FzZSBQbGF0Zm9ybS5QbGF0Zm9ybS5MaW51eDpcblx0XHRcdFx0ZGVmYXVsdDogb3MgPSBQbGF0Zm9ybS5PcGVyYXRpbmdTeXN0ZW0uTGludXg7IGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGUgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGUoe1xuXHRcdFx0XHRhbGxvd0F1dG9tYXRpb25TaGVsbDogdHJ1ZSxcblx0XHRcdFx0b3MsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eVxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgaWNvbjogVVJJIHwgVGhlbWVJY29uIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmlkKSB7XG5cdFx0XHRcdGljb24gPSBUaGVtZUljb24uZnJvbUlkKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbi5pZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0YXNrR3JvdXBLaW5kID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA/IEdyb3VwS2luZC50byh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qga2luZElkID0gdHlwZW9mIHRhc2tHcm91cEtpbmQgPT09ICdzdHJpbmcnID8gdGFza0dyb3VwS2luZCA6IHRhc2tHcm91cEtpbmQ/LmtpbmQ7XG5cdFx0XHRcdGljb24gPSBraW5kSWQgPT09ICd0ZXN0JyA/IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5iZWFrZXIuaWQpIDogZGVmYXVsdFByb2ZpbGUuaWNvbjtcblx0XHRcdH1cblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnID0ge1xuXHRcdFx0XHRuYW1lOiB0ZXJtaW5hbE5hbWUsXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGV4ZWN1dGFibGU6IGRlZmF1bHRQcm9maWxlLnBhdGgsXG5cdFx0XHRcdGFyZ3M6IGRlZmF1bHRQcm9maWxlLmFyZ3MsXG5cdFx0XHRcdGVudjogeyAuLi5kZWZhdWx0UHJvZmlsZS5lbnYgfSxcblx0XHRcdFx0aWNvbixcblx0XHRcdFx0Y29sb3I6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbj8uY29sb3IgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHR3YWl0T25FeGl0XG5cdFx0XHR9O1xuXHRcdFx0bGV0IHNoZWxsU3BlY2lmaWVkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0XHRjb25zdCBzaGVsbE9wdGlvbnM6IElTaGVsbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQgPSB0YXNrLmNvbW1hbmQub3B0aW9ucyAmJiB0YXNrLmNvbW1hbmQub3B0aW9ucy5zaGVsbDtcblx0XHRcdGlmIChzaGVsbE9wdGlvbnMpIHtcblx0XHRcdFx0aWYgKHNoZWxsT3B0aW9ucy5leGVjdXRhYmxlKSB7XG5cdFx0XHRcdFx0Ly8gQ2xlYXIgb3V0IHRoZSBhcmdzIHNvIHRoYXQgd2UgZG9uJ3QgZW5kIHVwIHdpdGggbWlzbWF0Y2hlZCBhcmdzLlxuXHRcdFx0XHRcdGlmIChzaGVsbE9wdGlvbnMuZXhlY3V0YWJsZSAhPT0gc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkge1xuXHRcdFx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuYXJncyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZSh2YXJpYWJsZVJlc29sdmVyLCBzaGVsbE9wdGlvbnMuZXhlY3V0YWJsZSk7XG5cdFx0XHRcdFx0c2hlbGxTcGVjaWZpZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzaGVsbE9wdGlvbnMuYXJncykge1xuXHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGVzKHZhcmlhYmxlUmVzb2x2ZXIsIHNoZWxsT3B0aW9ucy5hcmdzLnNsaWNlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuYXJncyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNoZWxsQXJncyA9IEFycmF5LmlzQXJyYXkoc2hlbGxMYXVuY2hDb25maWcuYXJncykgPyA8c3RyaW5nW10+c2hlbGxMYXVuY2hDb25maWcuYXJncy5zbGljZSgwKSA6IFtzaGVsbExhdW5jaENvbmZpZy5hcmdzXTtcblx0XHRcdGNvbnN0IHRvQWRkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLnBvc2l4LmJhc2VuYW1lKChhd2FpdCB0aGlzLl9wYXRoU2VydmljZS5maWxlVVJJKHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUhKSkucGF0aCkudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gdGhpcy5fYnVpbGRTaGVsbENvbW1hbmRMaW5lKHBsYXRmb3JtLCBiYXNlbmFtZSwgc2hlbGxPcHRpb25zLCBjb21tYW5kLCBvcmlnaW5hbENvbW1hbmQsIGFyZ3MpO1xuXHRcdFx0bGV0IHdpbmRvd3NTaGVsbEFyZ3M6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdGlmIChwbGF0Zm9ybSA9PT0gUGxhdGZvcm0uUGxhdGZvcm0uV2luZG93cykge1xuXHRcdFx0XHR3aW5kb3dzU2hlbGxBcmdzID0gdHJ1ZTtcblx0XHRcdFx0Ly8gSWYgd2UgZG9uJ3QgaGF2ZSBhIGN3ZCwgdGhlbiB0aGUgdGVybWluYWwgdXNlcyB0aGUgaG9tZSBkaXIuXG5cdFx0XHRcdGNvbnN0IHVzZXJIb21lID0gYXdhaXQgdGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRcdFx0aWYgKGJhc2VuYW1lID09PSAnY21kLmV4ZScgJiYgKChvcHRpb25zLmN3ZCAmJiBpc1VOQyhvcHRpb25zLmN3ZCkpIHx8ICghb3B0aW9ucy5jd2QgJiYgaXNVTkModXNlckhvbWUuZnNQYXRoKSkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGJhc2VuYW1lID09PSAncG93ZXJzaGVsbC5leGUnKSB8fCAoYmFzZW5hbWUgPT09ICdwd3NoLmV4ZScpKSB7XG5cdFx0XHRcdFx0aWYgKCFzaGVsbFNwZWNpZmllZCkge1xuXHRcdFx0XHRcdFx0dG9BZGQucHVzaCgnLUNvbW1hbmQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoKGJhc2VuYW1lID09PSAnYmFzaC5leGUnKSB8fCAoYmFzZW5hbWUgPT09ICd6c2guZXhlJykpIHtcblx0XHRcdFx0XHR3aW5kb3dzU2hlbGxBcmdzID0gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKCFzaGVsbFNwZWNpZmllZCkge1xuXHRcdFx0XHRcdFx0dG9BZGQucHVzaCgnLWMnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoYmFzZW5hbWUgPT09ICd3c2wuZXhlJykge1xuXHRcdFx0XHRcdGlmICghc2hlbGxTcGVjaWZpZWQpIHtcblx0XHRcdFx0XHRcdHRvQWRkLnB1c2goJy1lJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGJhc2VuYW1lID09PSAnbnUuZXhlJykge1xuXHRcdFx0XHRcdGlmICghc2hlbGxTcGVjaWZpZWQpIHtcblx0XHRcdFx0XHRcdHRvQWRkLnB1c2goJy1jJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICghc2hlbGxTcGVjaWZpZWQpIHtcblx0XHRcdFx0XHRcdHRvQWRkLnB1c2goJy9kJywgJy9jJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIXNoZWxsU3BlY2lmaWVkKSB7XG5cdFx0XHRcdFx0Ly8gVW5kZXIgTWFjIHJlbW92ZSAtbCB0byBub3Qgc3RhcnQgaXQgYXMgYSBsb2dpbiBzaGVsbC5cblx0XHRcdFx0XHRpZiAocGxhdGZvcm0gPT09IFBsYXRmb3JtLlBsYXRmb3JtLk1hYykge1xuXHRcdFx0XHRcdFx0Ly8gQmFja2dyb3VuZCBvbiAtbCBvbiBvc3ggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNzU2M1xuXHRcdFx0XHRcdFx0Ly8gVE9ETzogSGFuZGxlIGJ5IHB1bGxpbmcgdGhlIGRlZmF1bHQgdGVybWluYWwgcHJvZmlsZT9cblx0XHRcdFx0XHRcdC8vIGNvbnN0IG9zeFNoZWxsQXJncyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxBcmdzTWFjT3MpO1xuXHRcdFx0XHRcdFx0Ly8gaWYgKChvc3hTaGVsbEFyZ3MudXNlciA9PT0gdW5kZWZpbmVkKSAmJiAob3N4U2hlbGxBcmdzLnVzZXJMb2NhbCA9PT0gdW5kZWZpbmVkKSAmJiAob3N4U2hlbGxBcmdzLnVzZXJMb2NhbFZhbHVlID09PSB1bmRlZmluZWQpXG5cdFx0XHRcdFx0XHQvLyBcdCYmIChvc3hTaGVsbEFyZ3MudXNlclJlbW90ZSA9PT0gdW5kZWZpbmVkKSAmJiAob3N4U2hlbGxBcmdzLnVzZXJSZW1vdGVWYWx1ZSA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0Ly8gXHQmJiAob3N4U2hlbGxBcmdzLnVzZXJWYWx1ZSA9PT0gdW5kZWZpbmVkKSAmJiAob3N4U2hlbGxBcmdzLndvcmtzcGFjZSA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0Ly8gXHQmJiAob3N4U2hlbGxBcmdzLndvcmtzcGFjZUZvbGRlciA9PT0gdW5kZWZpbmVkKSAmJiAob3N4U2hlbGxBcmdzLndvcmtzcGFjZUZvbGRlclZhbHVlID09PSB1bmRlZmluZWQpXG5cdFx0XHRcdFx0XHQvLyBcdCYmIChvc3hTaGVsbEFyZ3Mud29ya3NwYWNlVmFsdWUgPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHRcdC8vIFx0Y29uc3QgaW5kZXggPSBzaGVsbEFyZ3MuaW5kZXhPZignLWwnKTtcblx0XHRcdFx0XHRcdC8vIFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0Ly8gXHRcdHNoZWxsQXJncy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRcdFx0Ly8gXHR9XG5cdFx0XHRcdFx0XHQvLyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRvQWRkLnB1c2goJy1jJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbWJpbmVkU2hlbGxBcmdzID0gdGhpcy5fYWRkQWxsQXJndW1lbnQodG9BZGQsIHNoZWxsQXJncyk7XG5cdFx0XHRjb21iaW5lZFNoZWxsQXJncy5wdXNoKGNvbW1hbmRMaW5lKTtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25Ob25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmVJbmZvID0ge1xuXHRcdFx0XHRjb21tYW5kTGluZSxcblx0XHRcdFx0bm9uY2U6IHNoZWxsTGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25Ob25jZVxuXHRcdFx0fTtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSB3aW5kb3dzU2hlbGxBcmdzID8gY29tYmluZWRTaGVsbEFyZ3Muam9pbignICcpIDogY29tYmluZWRTaGVsbEFyZ3M7XG5cdFx0XHRpZiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiAmJiB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLmVjaG8pIHtcblx0XHRcdFx0aWYgKG5lZWRzRm9sZGVyUXVhbGlmaWNhdGlvbiAmJiB3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXIgPSBjd2QgJiYgdHlwZW9mIGN3ZCA9PT0gJ29iamVjdCcgJiYgT2JqZWN0Lmhhc093bihjd2QsICdwYXRoJykgPyBwYXRoLmJhc2VuYW1lKGN3ZC5wYXRoKSA6IHdvcmtzcGFjZUZvbGRlci5uYW1lO1xuXHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0ID0gdGhpcy50YXNrU2hlbGxJbnRlZ3JhdGlvblN0YXJ0U2VxdWVuY2UoY3dkKSArIGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0a2V5OiAndGFzay5leGVjdXRpbmdJbkZvbGRlcicsXG5cdFx0XHRcdFx0XHRjb21tZW50OiBbJ1RoZSB3b3Jrc3BhY2UgZm9sZGVyIHRoZSB0YXNrIGlzIHJ1bm5pbmcgaW4nLCAnVGhlIHRhc2sgY29tbWFuZCBsaW5lIG9yIGxhYmVsJ11cblxuXHRcdFx0XHRcdH0sICdFeGVjdXRpbmcgdGFzayBpbiBmb2xkZXIgezB9OiB7MX0nLCBmb2xkZXIsIGNvbW1hbmRMaW5lKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUgfSkgKyB0aGlzLmdldFRhc2tTaGVsbEludGVncmF0aW9uT3V0cHV0U2VxdWVuY2UoY29tbWFuZExpbmVJbmZvKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHRoaXMudGFza1NoZWxsSW50ZWdyYXRpb25TdGFydFNlcXVlbmNlKGN3ZCkgKyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdGtleTogJ3Rhc2suZXhlY3V0aW5nLnNoZWxsSW50ZWdyYXRpb24nLFxuXHRcdFx0XHRcdFx0Y29tbWVudDogWydUaGUgdGFzayBjb21tYW5kIGxpbmUgb3IgbGFiZWwnXVxuXHRcdFx0XHRcdH0sICdFeGVjdXRpbmcgdGFzazogezB9JywgY29tbWFuZExpbmUpLCB7IGV4Y2x1ZGVMZWFkaW5nTmV3TGluZTogdHJ1ZSB9KSArIHRoaXMuZ2V0VGFza1NoZWxsSW50ZWdyYXRpb25PdXRwdXRTZXF1ZW5jZShjb21tYW5kTGluZUluZm8pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHtcblx0XHRcdFx0XHR0ZXh0OiB0aGlzLnRhc2tTaGVsbEludGVncmF0aW9uU3RhcnRTZXF1ZW5jZShjd2QpICsgdGhpcy5nZXRUYXNrU2hlbGxJbnRlZ3JhdGlvbk91dHB1dFNlcXVlbmNlKGNvbW1hbmRMaW5lSW5mbyksXG5cdFx0XHRcdFx0dHJhaWxpbmdOZXdMaW5lOiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb21tYW5kRXhlY3V0YWJsZSA9ICh0YXNrLmNvbW1hbmQucnVudGltZSAhPT0gUnVudGltZVR5cGUuQ3VzdG9tRXhlY3V0aW9uKSA/IENvbW1hbmRTdHJpbmcudmFsdWUoY29tbWFuZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBleGVjdXRhYmxlID0gIWlzU2hlbGxDb21tYW5kXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHZhcmlhYmxlUmVzb2x2ZXIsIGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZSh2YXJpYWJsZVJlc29sdmVyLCAnJHsnICsgVGVybWluYWxUYXNrU3lzdGVtLlByb2Nlc3NWYXJOYW1lICsgJ30nKSlcblx0XHRcdFx0OiBjb21tYW5kRXhlY3V0YWJsZTtcblxuXHRcdFx0Ly8gV2hlbiB3ZSBoYXZlIGEgcHJvY2VzcyB0YXNrIHRoZXJlIGlzIG5vIG5lZWQgdG8gcXVvdGUgYXJndW1lbnRzLiBTbyB3ZSBnbyBhaGVhZCBhbmQgdGFrZSB0aGUgc3RyaW5nIHZhbHVlLlxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWcgPSB7XG5cdFx0XHRcdG5hbWU6IHRlcm1pbmFsTmFtZSxcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0aWNvbjogdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uPy5pZCA/IFRoZW1lSWNvbi5mcm9tSWQodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uLmlkKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29sb3I6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbj8uY29sb3IgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRleGVjdXRhYmxlOiBleGVjdXRhYmxlLFxuXHRcdFx0XHRhcmdzOiBhcmdzLm1hcChhID0+IFR5cGVzLmlzU3RyaW5nKGEpID8gYSA6IGEudmFsdWUpLFxuXHRcdFx0XHR3YWl0T25FeGl0XG5cdFx0XHR9O1xuXHRcdFx0aWYgKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24gJiYgdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5lY2hvKSB7XG5cdFx0XHRcdGNvbnN0IGdldEFyZ3NUb0VjaG8gPSAoYXJnczogVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz4gfCB1bmRlZmluZWQpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRcdGlmICghYXJncyB8fCBhcmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoYXJncykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhcmdzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYXJncy5qb2luKCcgJyk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChuZWVkc0ZvbGRlclF1YWxpZmljYXRpb24gJiYgd29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgPSB0aGlzLnRhc2tTaGVsbEludGVncmF0aW9uU3RhcnRTZXF1ZW5jZShjd2QpICsgZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRrZXk6ICd0YXNrLmV4ZWN1dGluZ0luRm9sZGVyJyxcblx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsnVGhlIHdvcmtzcGFjZSBmb2xkZXIgdGhlIHRhc2sgaXMgcnVubmluZyBpbicsICdUaGUgdGFzayBjb21tYW5kIGxpbmUgb3IgbGFiZWwnXVxuXHRcdFx0XHRcdH0sICdFeGVjdXRpbmcgdGFzayBpbiBmb2xkZXIgezB9OiB7MX0nLCB3b3Jrc3BhY2VGb2xkZXIubmFtZSwgYCR7c2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZX0gJHtnZXRBcmdzVG9FY2hvKHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpfWApLCB7IGV4Y2x1ZGVMZWFkaW5nTmV3TGluZTogdHJ1ZSB9KSArIHRoaXMuZ2V0VGFza1NoZWxsSW50ZWdyYXRpb25PdXRwdXRTZXF1ZW5jZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0ID0gdGhpcy50YXNrU2hlbGxJbnRlZ3JhdGlvblN0YXJ0U2VxdWVuY2UoY3dkKSArIGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0a2V5OiAndGFzay5leGVjdXRpbmcuc2hlbGwtaW50ZWdyYXRpb24nLFxuXHRcdFx0XHRcdFx0Y29tbWVudDogWydUaGUgdGFzayBjb21tYW5kIGxpbmUgb3IgbGFiZWwnXVxuXHRcdFx0XHRcdH0sICdFeGVjdXRpbmcgdGFzazogezB9JywgYCR7c2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZX0gJHtnZXRBcmdzVG9FY2hvKHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpfWApLCB7IGV4Y2x1ZGVMZWFkaW5nTmV3TGluZTogdHJ1ZSB9KSArIHRoaXMuZ2V0VGFza1NoZWxsSW50ZWdyYXRpb25PdXRwdXRTZXF1ZW5jZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHtcblx0XHRcdFx0XHR0ZXh0OiB0aGlzLnRhc2tTaGVsbEludGVncmF0aW9uU3RhcnRTZXF1ZW5jZShjd2QpICsgdGhpcy5nZXRUYXNrU2hlbGxJbnRlZ3JhdGlvbk91dHB1dFNlcXVlbmNlKHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0dHJhaWxpbmdOZXdMaW5lOiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjd2QpIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9IGN3ZDtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuZW52KSB7XG5cdFx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuZW52KSB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmVudiA9IHsgLi4uc2hlbGxMYXVuY2hDb25maWcuZW52LCAuLi5vcHRpb25zLmVudiB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuZW52ID0gb3B0aW9ucy5lbnY7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsID0gdHJ1ZTtcblx0XHRzaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50ID0gdHJ1ZTtcblx0XHRzaGVsbExhdW5jaENvbmZpZy50YWJBY3Rpb25zID0gdGhpcy5fdGVybWluYWxUYWJBY3Rpb25zO1xuXHRcdHJldHVybiBzaGVsbExhdW5jaENvbmZpZztcblx0fVxuXG5cdHByaXZhdGUgX2FkZEFsbEFyZ3VtZW50KHNoZWxsQ29tbWFuZEFyZ3M6IHN0cmluZ1tdLCBjb25maWd1cmVkU2hlbGxBcmdzOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBjb21iaW5lZFNoZWxsQXJnczogc3RyaW5nW10gPSBPYmplY3RzLmRlZXBDbG9uZShjb25maWd1cmVkU2hlbGxBcmdzKTtcblx0XHRzaGVsbENvbW1hbmRBcmdzLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRjb25zdCBzaG91bGRBZGRTaGVsbENvbW1hbmRBcmcgPSBjb25maWd1cmVkU2hlbGxBcmdzLmV2ZXJ5KChhcmcsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGlmICgoYXJnLnRvTG93ZXJDYXNlKCkgPT09IGVsZW1lbnQpICYmIChjb25maWd1cmVkU2hlbGxBcmdzLmxlbmd0aCA+IGluZGV4ICsgMSkpIHtcblx0XHRcdFx0XHQvLyBXZSBjYW4gc3RpbGwgYWRkIHRoZSBhcmd1bWVudCwgYnV0IG9ubHkgaWYgbm90IGFsbCBvZiB0aGUgZm9sbG93aW5nIGFyZ3VtZW50cyBiZWdpbiB3aXRoIFwiLVwiLlxuXHRcdFx0XHRcdHJldHVybiAhY29uZmlndXJlZFNoZWxsQXJncy5zbGljZShpbmRleCArIDEpLmV2ZXJ5KHRlc3RBcmcgPT4gdGVzdEFyZy5zdGFydHNXaXRoKCctJykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBhcmcudG9Mb3dlckNhc2UoKSAhPT0gZWxlbWVudDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoc2hvdWxkQWRkU2hlbGxDb21tYW5kQXJnKSB7XG5cdFx0XHRcdGNvbWJpbmVkU2hlbGxBcmdzLnB1c2goZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNvbWJpbmVkU2hlbGxBcmdzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25uZWN0VG9UZXJtaW5hbCh0YXNrOiBUYXNrKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlY29ubmVjdGVkSW5zdGFuY2VzID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5maWx0ZXIoZSA9PiBlLnJlY29ubmVjdGlvblByb3BlcnRpZXM/Lm93bmVySWQgPT09IFRhc2tUZXJtaW5hbFR5cGUpO1xuXHRcdHJldHVybiByZWNvbm5lY3RlZEluc3RhbmNlcy5maW5kKGUgPT4gZ2V0UmVjb25uZWN0aW9uRGF0YShlKT8ubGFzdFRhc2sgPT09IHRhc2suZ2V0Q29tbW9uVGFza0lkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9DcmVhdGVUZXJtaW5hbCh0YXNrOiBUYXNrLCBncm91cDogc3RyaW5nIHwgdW5kZWZpbmVkLCBsYXVuY2hDb25maWdzOiBJU2hlbGxMYXVuY2hDb25maWcpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Y29uc3QgcmVjb25uZWN0ZWRUZXJtaW5hbCA9IGF3YWl0IHRoaXMuX3JlY29ubmVjdFRvVGVybWluYWwodGFzayk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJPbkRpc3Bvc2VkID0gKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSkgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0ZXJtaW5hbC5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQudGVybWluYXRlZCh0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkLCB0ZXJtaW5hbC5leGl0UmVhc29uKSk7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0aWYgKHJlY29ubmVjdGVkVGVybWluYWwpIHtcblx0XHRcdGlmICgoQ3VzdG9tVGFzay5pcyh0YXNrKSB8fCBDb250cmlidXRlZFRhc2suaXModGFzaykpICYmIHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24pIHtcblx0XHRcdFx0cmVjb25uZWN0ZWRUZXJtaW5hbC53YWl0T25FeGl0ID0gZ2V0V2FpdE9uRXhpdFZhbHVlKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24sIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMpO1xuXHRcdFx0fVxuXHRcdFx0cmVnaXN0ZXJPbkRpc3Bvc2VkKHJlY29ubmVjdGVkVGVybWluYWwpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgncmVjb25uZWN0ZWQgdG8gdGFzayBhbmQgdGVybWluYWwnLCB0YXNrLl9pZCk7XG5cdFx0XHRyZXR1cm4gcmVjb25uZWN0ZWRUZXJtaW5hbDtcblx0XHR9XG5cdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHQvLyBUcnkgdG8gZmluZCBhbiBleGlzdGluZyB0ZXJtaW5hbCB0byBzcGxpdC5cblx0XHRcdC8vIEV2ZW4gaWYgYW4gZXhpc3RpbmcgdGVybWluYWwgaXMgZm91bmQsIHRoZSBzcGxpdCBjYW4gZmFpbCBpZiB0aGUgdGVybWluYWwgd2lkdGggaXMgdG9vIHNtYWxsLlxuXHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiBPYmplY3QudmFsdWVzKHRoaXMuX3Rlcm1pbmFscykpIHtcblx0XHRcdFx0aWYgKHRlcm1pbmFsLmdyb3VwID09PSBncm91cCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEZvdW5kIHRlcm1pbmFsIHRvIHNwbGl0IGZvciBncm91cCAke2dyb3VwfWApO1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsSW5zdGFuY2UgPSB0ZXJtaW5hbC50ZXJtaW5hbDtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogb3JpZ2luYWxJbnN0YW5jZSB9LCBjb25maWc6IGxhdW5jaENvbmZpZ3MgfSk7XG5cdFx0XHRcdFx0cmVnaXN0ZXJPbkRpc3Bvc2VkKHJlc3VsdCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vIHRlcm1pbmFsIGZvdW5kIHRvIHNwbGl0IGZvciBncm91cCAke2dyb3VwfWApO1xuXHRcdH1cblx0XHQvLyBFaXRoZXIgbm8gZ3JvdXAgaXMgdXNlZCwgbm8gdGVybWluYWwgd2l0aCB0aGUgZ3JvdXAgZXhpc3RzIG9yIHNwbGl0dGluZyBhbiBleGlzdGluZyB0ZXJtaW5hbCBmYWlsZWQuXG5cdFx0Y29uc3QgY3JlYXRlZFRlcm1pbmFsID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiBsYXVuY2hDb25maWdzIH0pO1xuXHRcdHJlZ2lzdGVyT25EaXNwb3NlZChjcmVhdGVkVGVybWluYWwpO1xuXHRcdHJldHVybiBjcmVhdGVkVGVybWluYWw7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbm5lY3RUb1Rlcm1pbmFscygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzUmVjb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEFscmVhZHkgcmVjb25uZWN0ZWQgdG8gdGVybWluYWxzLCBzbyByZXR1cm5pbmdgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVjb25uZWN0ZWRJbnN0YW5jZXMgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzLmZpbHRlcihlID0+IGUucmVjb25uZWN0aW9uUHJvcGVydGllcz8ub3duZXJJZCA9PT0gVGFza1Rlcm1pbmFsVHlwZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgQXR0ZW1wdGluZyByZWNvbm5lY3Rpb24gb2YgJHtyZWNvbm5lY3RlZEluc3RhbmNlcy5sZW5ndGh9IHRlcm1pbmFsc2ApO1xuXHRcdGlmICghcmVjb25uZWN0ZWRJbnN0YW5jZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBObyB0ZXJtaW5hbHMgdG8gcmVjb25uZWN0IHRvIHNvIHJldHVybmluZ2ApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHJlY29ubmVjdGVkSW5zdGFuY2VzKSB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBnZXRSZWNvbm5lY3Rpb25EYXRhKHRlcm1pbmFsKSBhcyBJUmVjb25uZWN0aW9uVGFza0RhdGEgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0geyBsYXN0VGFzazogZGF0YS5sYXN0VGFzaywgZ3JvdXA6IGRhdGEuZ3JvdXAsIHRlcm1pbmFsLCBzaGVsbEludGVncmF0aW9uTm9uY2U6IGRhdGEuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlIH07XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxzW3Rlcm1pbmFsLmluc3RhbmNlSWRdID0gdGVybWluYWxEYXRhO1xuXHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGVybWluYWwub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWxldGVUYXNrQW5kVGVybWluYWwodGVybWluYWwsIHRlcm1pbmFsRGF0YSk7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnUmVjb25uZWN0aW5nIHRvIHRhc2sgdGVybWluYWwnLCB0ZXJtaW5hbERhdGEubGFzdFRhc2ssIHRlcm1pbmFsLmluc3RhbmNlSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2hhc1JlY29ubmVjdGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2RlbGV0ZVRhc2tBbmRUZXJtaW5hbCh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UsIHRlcm1pbmFsRGF0YTogSVRlcm1pbmFsRGF0YSk6IHZvaWQge1xuXHRcdGRlbGV0ZSB0aGlzLl90ZXJtaW5hbHNbdGVybWluYWwuaW5zdGFuY2VJZF07XG5cdFx0ZGVsZXRlIHRoaXMuX3NhbWVUYXNrVGVybWluYWxzW3Rlcm1pbmFsRGF0YS5sYXN0VGFza107XG5cdFx0dGhpcy5faWRsZVRhc2tUZXJtaW5hbHMuZGVsZXRlKHRlcm1pbmFsRGF0YS5sYXN0VGFzayk7XG5cdFx0Ly8gRGVsZXRlIHRoZSB0YXNrIG5vdyBhcyBhIHdvcmsgYXJvdW5kIGZvciBjYXNlcyB3aGVuIHRoZSBvbkV4aXQgaXNuJ3QgZmlyZWQuXG5cdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSB0ZXJtaW5hbCB3YXNuJ3Qgc2h1dGRvd24gd2l0aCBhbiBcImltbWVkaWF0ZVwiIGZsYWcgYW5kIGlzIGV4cGVjdGVkLlxuXHRcdC8vIEZvciBjb3JyZWN0IHRlcm1pbmFsIHJlLXVzZSwgdGhlIHRhc2sgbmVlZHMgdG8gYmUgZGVsZXRlZCBpbW1lZGlhdGVseS5cblx0XHQvLyBOb3RlIHRoYXQgdGhpcyBzaG91bGRuJ3QgYmUgYSBwcm9ibGVtIGFueW1vcmUgc2luY2UgdXNlciBpbml0aWF0ZWQgdGVybWluYWwga2lsbHMgYXJlIG5vdyBpbW1lZGlhdGUuXG5cdFx0Y29uc3QgbWFwS2V5ID0gdGVybWluYWxEYXRhLmxhc3RUYXNrO1xuXHRcdC8vIFNraXAgaWYgYSBsYXRlciBydW4gcmVwbGFjZWQgdGhlIGVudHJ5IHdpdGggYSBkaWZmZXJlbnQgdGVybWluYWwuXG5cdFx0Y29uc3QgY3VyID0gdGhpcy5fYWN0aXZlVGFza3NbbWFwS2V5XTtcblx0XHRpZiAoY3VyICYmIGN1ci50ZXJtaW5hbCA9PT0gdGVybWluYWwpIHtcblx0XHRcdHRoaXMuX3JlbW92ZUZyb21BY3RpdmVUYXNrcyhtYXBLZXkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYnVzeVRhc2tzW21hcEtleV0pIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9idXN5VGFza3NbbWFwS2V5XTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVUZXJtaW5hbCh0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCByZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxbSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQsIFRhc2tFcnJvciB8IHVuZGVmaW5lZF0+IHtcblx0XHRjb25zdCBwbGF0Zm9ybSA9IHJlc29sdmVyLnRhc2tTeXN0ZW1JbmZvID8gcmVzb2x2ZXIudGFza1N5c3RlbUluZm8ucGxhdGZvcm0gOiBQbGF0Zm9ybS5wbGF0Zm9ybTtcblx0XHRjb25zdCBvcHRpb25zID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU9wdGlvbnMocmVzb2x2ZXIsIHRhc2suY29tbWFuZC5vcHRpb25zKTtcblx0XHRjb25zdCBwcmVzZW50YXRpb25PcHRpb25zID0gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbjtcblxuXHRcdGlmICghcHJlc2VudGF0aW9uT3B0aW9ucykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUYXNrIHByZXNlbnRhdGlvbiBvcHRpb25zIHNob3VsZCBub3QgYmUgdW5kZWZpbmVkIGhlcmUuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHdhaXRPbkV4aXQgPSBnZXRXYWl0T25FeGl0VmFsdWUocHJlc2VudGF0aW9uT3B0aW9ucywgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cblx0XHRsZXQgY29tbWFuZDogQ29tbWFuZFN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYXJnczogQ29tbWFuZFN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYXVuY2hDb25maWdzOiBJU2hlbGxMYXVuY2hDb25maWcgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGFzay5jb21tYW5kLnJ1bnRpbWUgPT09IFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbikge1xuXHRcdFx0dGhpcy5fY3VycmVudFRhc2suc2hlbGxMYXVuY2hDb25maWcgPSBsYXVuY2hDb25maWdzID0ge1xuXHRcdFx0XHRjdXN0b21QdHlJbXBsZW1lbnRhdGlvbjogKGlkLCBjb2xzLCByb3dzKSA9PiBuZXcgVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5KGlkLCBjb2xzLCByb3dzLCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UpLFxuXHRcdFx0XHR3YWl0T25FeGl0LFxuXHRcdFx0XHRuYW1lOiB0aGlzLl9jcmVhdGVUZXJtaW5hbE5hbWUodGFzayksXG5cdFx0XHRcdGluaXRpYWxUZXh0OiB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uICYmIHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24uZWNobyA/IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ3Rhc2suZXhlY3V0aW5nJyxcblx0XHRcdFx0XHRjb21tZW50OiBbJ1RoZSB0YXNrIGNvbW1hbmQgbGluZSBvciBsYWJlbCddXG5cdFx0XHRcdH0sICdFeGVjdXRpbmcgdGFzazogezB9JywgdGFzay5fbGFiZWwpLCB7IGV4Y2x1ZGVMZWFkaW5nTmV3TGluZTogdHJ1ZSB9KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNGZWF0dXJlVGVybWluYWw6IHRydWUsXG5cdFx0XHRcdGljb246IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbj8uaWQgPyBUaGVtZUljb24uZnJvbUlkKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbi5pZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbG9yOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmNvbG9yIHx8IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkUmVzdWx0OiB7IGNvbW1hbmQ6IENvbW1hbmRTdHJpbmc7IGFyZ3M6IENvbW1hbmRTdHJpbmdbXSB9ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNvbW1hbmRBbmRBcmdzKHJlc29sdmVyLCB0YXNrLmNvbW1hbmQpO1xuXHRcdFx0Y29tbWFuZCA9IHJlc29sdmVkUmVzdWx0LmNvbW1hbmQ7XG5cdFx0XHRhcmdzID0gcmVzb2x2ZWRSZXN1bHQuYXJncztcblxuXHRcdFx0dGhpcy5fY3VycmVudFRhc2suc2hlbGxMYXVuY2hDb25maWcgPSBsYXVuY2hDb25maWdzID0gYXdhaXQgdGhpcy5fY3JlYXRlU2hlbGxMYXVuY2hDb25maWcodGFzaywgd29ya3NwYWNlRm9sZGVyLCByZXNvbHZlciwgcGxhdGZvcm0sIG9wdGlvbnMsIGNvbW1hbmQsIGFyZ3MsIHdhaXRPbkV4aXQsIHByZXNlbnRhdGlvbk9wdGlvbnMpO1xuXHRcdFx0aWYgKGxhdW5jaENvbmZpZ3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gW3VuZGVmaW5lZCwgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5FcnJvciwgbmxzLmxvY2FsaXplKCdUZXJtaW5hbFRhc2tTeXN0ZW0nLCAnQ2FuXFwndCBleGVjdXRlIGEgc2hlbGwgY29tbWFuZCBvbiBhbiBVTkMgZHJpdmUgdXNpbmcgY21kLmV4ZS4nKSwgVGFza0Vycm9ycy5Vbmtub3duRXJyb3IpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcHJlZmVyc1NhbWVUZXJtaW5hbCA9IHByZXNlbnRhdGlvbk9wdGlvbnMucGFuZWwgPT09IFBhbmVsS2luZC5EZWRpY2F0ZWQ7XG5cdFx0Y29uc3QgYWxsb3dzU2hhcmVkVGVybWluYWwgPSBwcmVzZW50YXRpb25PcHRpb25zLnBhbmVsID09PSBQYW5lbEtpbmQuU2hhcmVkO1xuXHRcdGNvbnN0IGdyb3VwID0gcHJlc2VudGF0aW9uT3B0aW9ucy5ncm91cDtcblxuXHRcdGNvbnN0IHRhc2tLZXkgPSB0YXNrLmdldE1hcEtleSgpO1xuXHRcdGxldCB0ZXJtaW5hbFRvUmV1c2U6IElUZXJtaW5hbERhdGEgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByZWZlcnNTYW1lVGVybWluYWwpIHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsSWQgPSB0aGlzLl9zYW1lVGFza1Rlcm1pbmFsc1t0YXNrS2V5XTtcblx0XHRcdGlmICh0ZXJtaW5hbElkKSB7XG5cdFx0XHRcdHRlcm1pbmFsVG9SZXVzZSA9IHRoaXMuX3Rlcm1pbmFsc1t0ZXJtaW5hbElkXTtcblx0XHRcdFx0ZGVsZXRlIHRoaXMuX3NhbWVUYXNrVGVybWluYWxzW3Rhc2tLZXldO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYWxsb3dzU2hhcmVkVGVybWluYWwpIHtcblx0XHRcdC8vIEFsd2F5cyBhbGxvdyB0byByZXVzZSB0aGUgdGVybWluYWwgcHJldmlvdXNseSB1c2VkIGJ5IHRoZSBzYW1lIHRhc2suXG5cdFx0XHRsZXQgdGVybWluYWxJZCA9IHRoaXMuX2lkbGVUYXNrVGVybWluYWxzLnJlbW92ZSh0YXNrS2V5KTtcblx0XHRcdGlmICghdGVybWluYWxJZCkge1xuXHRcdFx0XHQvLyBUaGVyZSBpcyBubyBpZGxlIHRlcm1pbmFsIHdoaWNoIHdhcyB1c2VkIGJ5IHRoZSBzYW1lIHRhc2suXG5cdFx0XHRcdC8vIFNlYXJjaCBmb3IgYW55IGlkbGUgdGVybWluYWwgdXNlZCBwcmV2aW91c2x5IGJ5IGEgdGFzayBvZiB0aGUgc2FtZSBncm91cFxuXHRcdFx0XHQvLyAob3IsIGlmIHRoZSB0YXNrIGhhcyBubyBncm91cCwgYSB0ZXJtaW5hbCB1c2VkIGJ5IGEgdGFzayB3aXRob3V0IGdyb3VwKS5cblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrSWQgb2YgdGhpcy5faWRsZVRhc2tUZXJtaW5hbHMua2V5cygpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWRsZVRlcm1pbmFsSWQgPSB0aGlzLl9pZGxlVGFza1Rlcm1pbmFscy5nZXQodGFza0lkKSE7XG5cdFx0XHRcdFx0aWYgKGlkbGVUZXJtaW5hbElkICYmIHRoaXMuX3Rlcm1pbmFsc1tpZGxlVGVybWluYWxJZF0gJiYgdGhpcy5fdGVybWluYWxzW2lkbGVUZXJtaW5hbElkXS5ncm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0XHRcdHRlcm1pbmFsSWQgPSB0aGlzLl9pZGxlVGFza1Rlcm1pbmFscy5yZW1vdmUodGFza0lkKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRlcm1pbmFsSWQpIHtcblx0XHRcdFx0dGVybWluYWxUb1JldXNlID0gdGhpcy5fdGVybWluYWxzW3Rlcm1pbmFsSWRdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGVybWluYWxUb1JldXNlKSB7XG5cdFx0XHRpZiAoIWxhdW5jaENvbmZpZ3MpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUYXNrIHNoZWxsIGxhdW5jaCBjb25maWd1cmF0aW9uIHNob3VsZCBub3QgYmUgdW5kZWZpbmVkIGhlcmUuJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRlcm1pbmFsVG9SZXVzZS50ZXJtaW5hbC5zY3JvbGxUb0JvdHRvbSgpO1xuXHRcdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdGxhdW5jaENvbmZpZ3MucmVjb25uZWN0aW9uUHJvcGVydGllcyA9IHsgb3duZXJJZDogVGFza1Rlcm1pbmFsVHlwZSwgZGF0YTogeyBsYXN0VGFzazogdGFzay5nZXRDb21tb25UYXNrSWQoKSwgZ3JvdXAsIGxhYmVsOiB0YXNrLl9sYWJlbCwgaWQ6IHRhc2suX2lkIH0gfTtcblx0XHRcdH1cblx0XHRcdC8vIEhBQ0s6IFJld3JpdGUgdGhlIG5vbmNlIGluIGluaXRpYWxUZXh0IG9ubHkgZm9yIHJldXNlZCB0ZXJtaW5hbHMsIHRoaXMgZW5zdXJlcyB0aGVcblx0XHRcdC8vIGNvbW1hbmQgbGluZSBzZXF1ZW5jZSByZXBvcnRzIHRoZSBjb3JyZWN0IG5vbmNlIGFuZCBiZWNvbWVzIHRydXN0ZWQgYXMgYSByZXN1bHQuXG5cdFx0XHRpZiAodGVybWluYWxUb1JldXNlLnNoZWxsSW50ZWdyYXRpb25Ob25jZSkge1xuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcobGF1bmNoQ29uZmlncy5pbml0aWFsVGV4dCkgJiYgbGF1bmNoQ29uZmlncy5zaGVsbEludGVncmF0aW9uTm9uY2UpIHtcblx0XHRcdFx0XHRsYXVuY2hDb25maWdzLmluaXRpYWxUZXh0ID0gbGF1bmNoQ29uZmlncy5pbml0aWFsVGV4dC5yZXBsYWNlKGxhdW5jaENvbmZpZ3Muc2hlbGxJbnRlZ3JhdGlvbk5vbmNlLCB0ZXJtaW5hbFRvUmV1c2Uuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGVybWluYWxUb1JldXNlLnRlcm1pbmFsLnJldXNlVGVybWluYWwobGF1bmNoQ29uZmlncyk7XG5cblx0XHRcdGlmICh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uICYmIHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24uY2xlYXIpIHtcblx0XHRcdFx0dGVybWluYWxUb1JldXNlLnRlcm1pbmFsLmNsZWFyQnVmZmVyKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90ZXJtaW5hbHNbdGVybWluYWxUb1JldXNlLnRlcm1pbmFsLmluc3RhbmNlSWQudG9TdHJpbmcoKV0ubGFzdFRhc2sgPSB0YXNrS2V5O1xuXHRcdFx0cmV0dXJuIFt0ZXJtaW5hbFRvUmV1c2UudGVybWluYWwsIHVuZGVmaW5lZF07XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVybWluYWxDcmVhdGlvblF1ZXVlID0gdGhpcy5fdGVybWluYWxDcmVhdGlvblF1ZXVlLnRoZW4oKCkgPT4gdGhpcy5fZG9DcmVhdGVUZXJtaW5hbCh0YXNrLCBncm91cCwgbGF1bmNoQ29uZmlncykpO1xuXHRcdGNvbnN0IHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSA9IChhd2FpdCB0aGlzLl90ZXJtaW5hbENyZWF0aW9uUXVldWUpITtcblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdHRlcm1pbmFsLnNoZWxsTGF1bmNoQ29uZmlnLnJlY29ubmVjdGlvblByb3BlcnRpZXMgPSB7IG93bmVySWQ6IFRhc2tUZXJtaW5hbFR5cGUsIGRhdGE6IHsgbGFzdFRhc2s6IHRhc2suZ2V0Q29tbW9uVGFza0lkKCksIGdyb3VwLCBsYWJlbDogdGFzay5fbGFiZWwsIGlkOiB0YXNrLl9pZCB9IH07XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsS2V5ID0gdGVybWluYWwuaW5zdGFuY2VJZC50b1N0cmluZygpO1xuXHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHsgdGVybWluYWw6IHRlcm1pbmFsLCBsYXN0VGFzazogdGFza0tleSwgZ3JvdXAsIHNoZWxsSW50ZWdyYXRpb25Ob25jZTogdGVybWluYWwuc2hlbGxMYXVuY2hDb25maWcuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlIH07XG5cdFx0Y29uc3Qgb25EaXNwb3NlZExpc3RlbmVyID0gdGVybWluYWwub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWxldGVUYXNrQW5kVGVybWluYWwodGVybWluYWwsIHRlcm1pbmFsRGF0YSk7XG5cdFx0XHRvbkRpc3Bvc2VkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3Rlcm1pbmFsc1t0ZXJtaW5hbEtleV0gPSB0ZXJtaW5hbERhdGE7XG5cdFx0dGVybWluYWwuc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucyA9IHRoaXMuX3Rlcm1pbmFsVGFiQWN0aW9ucztcblx0XHRyZXR1cm4gW3Rlcm1pbmFsLCB1bmRlZmluZWRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRTaGVsbENvbW1hbmRMaW5lKHBsYXRmb3JtOiBQbGF0Zm9ybS5QbGF0Zm9ybSwgc2hlbGxFeGVjdXRhYmxlOiBzdHJpbmcsIHNoZWxsT3B0aW9uczogSVNoZWxsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgY29tbWFuZDogQ29tbWFuZFN0cmluZywgb3JpZ2luYWxDb21tYW5kOiBDb21tYW5kU3RyaW5nIHwgdW5kZWZpbmVkLCBhcmdzOiBDb21tYW5kU3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGJhc2VuYW1lID0gcGF0aC5wYXJzZShzaGVsbEV4ZWN1dGFibGUpLm5hbWUudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCBzaGVsbFF1b3RlT3B0aW9ucyA9IHRoaXMuX2dldFF1b3RpbmdPcHRpb25zKGJhc2VuYW1lLCBzaGVsbE9wdGlvbnMsIHBsYXRmb3JtKTtcblxuXHRcdGZ1bmN0aW9uIG5lZWRzUXVvdGVzKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdGlmICh2YWx1ZS5sZW5ndGggPj0gMikge1xuXHRcdFx0XHRjb25zdCBmaXJzdCA9IHZhbHVlWzBdID09PSBzaGVsbFF1b3RlT3B0aW9ucy5zdHJvbmcgPyBzaGVsbFF1b3RlT3B0aW9ucy5zdHJvbmcgOiB2YWx1ZVswXSA9PT0gc2hlbGxRdW90ZU9wdGlvbnMud2VhayA/IHNoZWxsUXVvdGVPcHRpb25zLndlYWsgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChmaXJzdCA9PT0gdmFsdWVbdmFsdWUubGVuZ3RoIC0gMV0pIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxldCBxdW90ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHQvLyBXZSBmb3VuZCB0aGUgZW5kIHF1b3RlLlxuXHRcdFx0XHRjb25zdCBjaCA9IHZhbHVlW2ldO1xuXHRcdFx0XHRpZiAoY2ggPT09IHF1b3RlKSB7XG5cdFx0XHRcdFx0cXVvdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAocXVvdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIHNraXAgdGhlIGNoYXJhY3Rlci4gV2UgYXJlIHF1b3RlZC5cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChjaCA9PT0gc2hlbGxRdW90ZU9wdGlvbnMuZXNjYXBlKSB7XG5cdFx0XHRcdFx0Ly8gU2tpcCB0aGUgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0XHRpKys7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IHNoZWxsUXVvdGVPcHRpb25zLnN0cm9uZyB8fCBjaCA9PT0gc2hlbGxRdW90ZU9wdGlvbnMud2Vhaykge1xuXHRcdFx0XHRcdHF1b3RlID0gY2g7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2ggPT09ICcgJykge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcXVvdGUodmFsdWU6IHN0cmluZywga2luZDogU2hlbGxRdW90aW5nKTogW3N0cmluZywgYm9vbGVhbl0ge1xuXHRcdFx0aWYgKGtpbmQgPT09IFNoZWxsUXVvdGluZy5TdHJvbmcgJiYgc2hlbGxRdW90ZU9wdGlvbnMuc3Ryb25nKSB7XG5cdFx0XHRcdHJldHVybiBbc2hlbGxRdW90ZU9wdGlvbnMuc3Ryb25nICsgdmFsdWUgKyBzaGVsbFF1b3RlT3B0aW9ucy5zdHJvbmcsIHRydWVdO1xuXHRcdFx0fSBlbHNlIGlmIChraW5kID09PSBTaGVsbFF1b3RpbmcuV2VhayAmJiBzaGVsbFF1b3RlT3B0aW9ucy53ZWFrKSB7XG5cdFx0XHRcdHJldHVybiBbc2hlbGxRdW90ZU9wdGlvbnMud2VhayArIHZhbHVlICsgc2hlbGxRdW90ZU9wdGlvbnMud2VhaywgdHJ1ZV07XG5cdFx0XHR9IGVsc2UgaWYgKGtpbmQgPT09IFNoZWxsUXVvdGluZy5Fc2NhcGUgJiYgc2hlbGxRdW90ZU9wdGlvbnMuZXNjYXBlKSB7XG5cdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhzaGVsbFF1b3RlT3B0aW9ucy5lc2NhcGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFt2YWx1ZS5yZXBsYWNlKC8gL2csIHNoZWxsUXVvdGVPcHRpb25zLmVzY2FwZSArICcgJyksIHRydWVdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGJ1ZmZlcjogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoIG9mIHNoZWxsUXVvdGVPcHRpb25zLmVzY2FwZS5jaGFyc1RvRXNjYXBlKSB7XG5cdFx0XHRcdFx0XHRidWZmZXIucHVzaChgXFxcXCR7Y2h9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlZ2V4cDogUmVnRXhwID0gbmV3IFJlZ0V4cCgnWycgKyBidWZmZXIuam9pbignLCcpICsgJ10nLCAnZycpO1xuXHRcdFx0XHRcdGNvbnN0IGVzY2FwZUNoYXIgPSBzaGVsbFF1b3RlT3B0aW9ucy5lc2NhcGUuZXNjYXBlQ2hhcjtcblx0XHRcdFx0XHRyZXR1cm4gW3ZhbHVlLnJlcGxhY2UocmVnZXhwLCAobWF0Y2gpID0+IGVzY2FwZUNoYXIgKyBtYXRjaCksIHRydWVdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW3ZhbHVlLCBmYWxzZV07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcXVvdGVJZk5lY2Vzc2FyeSh2YWx1ZTogQ29tbWFuZFN0cmluZyk6IFtzdHJpbmcsIGJvb2xlYW5dIHtcblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdFx0aWYgKG5lZWRzUXVvdGVzKHZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiBxdW90ZSh2YWx1ZSwgU2hlbGxRdW90aW5nLlN0cm9uZyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIFt2YWx1ZSwgZmFsc2VdO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcXVvdGUodmFsdWUudmFsdWUsIHZhbHVlLnF1b3RpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHdlIGhhdmUgbm8gYXJncyBhbmQgdGhlIGNvbW1hbmQgaXMgYSBzdHJpbmcgdGhlbiB1c2UgdGhlIGNvbW1hbmQgdG8gc3RheSBiYWNrd2FyZHMgY29tcGF0aWJsZSB3aXRoIHRoZSBvbGQgY29tbWFuZCBsaW5lXG5cdFx0Ly8gbW9kZWwuIFRvIGFsbG93IHZhcmlhYmxlIHJlc29sdmluZyB3aXRoIHNwYWNlcyB3ZSBkbyBjb250aW51ZSBpZiB0aGUgcmVzb2x2ZWQgdmFsdWUgaXMgZGlmZmVyZW50IHRoYW4gdGhlIG9yaWdpbmFsIG9uZVxuXHRcdC8vIGFuZCB0aGUgcmVzb2x2ZWQgb25lIG5lZWRzIHF1b3RpbmcuXG5cdFx0aWYgKCghYXJncyB8fCBhcmdzLmxlbmd0aCA9PT0gMCkgJiYgVHlwZXMuaXNTdHJpbmcoY29tbWFuZCkgJiYgKGNvbW1hbmQgPT09IG9yaWdpbmFsQ29tbWFuZCBhcyBzdHJpbmcgfHwgbmVlZHNRdW90ZXMob3JpZ2luYWxDb21tYW5kIGFzIHN0cmluZykpKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGNvbW1hbmRRdW90ZWQgPSBmYWxzZTtcblx0XHRsZXQgYXJnUXVvdGVkID0gZmFsc2U7XG5cdFx0bGV0IHZhbHVlOiBzdHJpbmc7XG5cdFx0bGV0IHF1b3RlZDogYm9vbGVhbjtcblx0XHRbdmFsdWUsIHF1b3RlZF0gPSBxdW90ZUlmTmVjZXNzYXJ5KGNvbW1hbmQpO1xuXHRcdHJlc3VsdC5wdXNoKHZhbHVlKTtcblx0XHRjb21tYW5kUXVvdGVkID0gcXVvdGVkO1xuXHRcdGZvciAoY29uc3QgYXJnIG9mIGFyZ3MpIHtcblx0XHRcdFt2YWx1ZSwgcXVvdGVkXSA9IHF1b3RlSWZOZWNlc3NhcnkoYXJnKTtcblx0XHRcdHJlc3VsdC5wdXNoKHZhbHVlKTtcblx0XHRcdGFyZ1F1b3RlZCA9IGFyZ1F1b3RlZCB8fCBxdW90ZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbW1hbmRMaW5lID0gcmVzdWx0LmpvaW4oJyAnKTtcblx0XHQvLyBUaGVyZSBhcmUgc3BlY2lhbCBydWxlcyBxdW90ZWQgY29tbWFuZCBsaW5lIGluIGNtZC5leGVcblx0XHRpZiAocGxhdGZvcm0gPT09IFBsYXRmb3JtLlBsYXRmb3JtLldpbmRvd3MpIHtcblx0XHRcdGlmIChiYXNlbmFtZSA9PT0gJ2NtZCcgJiYgY29tbWFuZFF1b3RlZCAmJiBhcmdRdW90ZWQpIHtcblx0XHRcdFx0Y29tbWFuZExpbmUgPSAnXCInICsgY29tbWFuZExpbmUgKyAnXCInO1xuXHRcdFx0fSBlbHNlIGlmICgoYmFzZW5hbWUgPT09ICdwb3dlcnNoZWxsJyB8fCBiYXNlbmFtZSA9PT0gJ3B3c2gnKSAmJiBjb21tYW5kUXVvdGVkKSB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lID0gJyYgJyArIGNvbW1hbmRMaW5lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb21tYW5kTGluZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFF1b3RpbmdPcHRpb25zKHNoZWxsQmFzZW5hbWU6IHN0cmluZywgc2hlbGxPcHRpb25zOiBJU2hlbGxDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkLCBwbGF0Zm9ybTogUGxhdGZvcm0uUGxhdGZvcm0pOiBJU2hlbGxRdW90aW5nT3B0aW9ucyB7XG5cdFx0aWYgKHNoZWxsT3B0aW9ucyAmJiBzaGVsbE9wdGlvbnMucXVvdGluZykge1xuXHRcdFx0cmV0dXJuIHNoZWxsT3B0aW9ucy5xdW90aW5nO1xuXHRcdH1cblx0XHRyZXR1cm4gVGVybWluYWxUYXNrU3lzdGVtLl9zaGVsbFF1b3Rlc1tzaGVsbEJhc2VuYW1lXSB8fCBUZXJtaW5hbFRhc2tTeXN0ZW0uX29zU2hlbGxRdW90ZXNbUGxhdGZvcm0uUGxhdGZvcm1Ub1N0cmluZyhwbGF0Zm9ybSldO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGVjdFRhc2tWYXJpYWJsZXModmFyaWFibGVzOiBTZXQ8c3RyaW5nPiwgdGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzayk6IHZvaWQge1xuXHRcdGlmICh0YXNrLmNvbW1hbmQgJiYgdGFzay5jb21tYW5kLm5hbWUpIHtcblx0XHRcdHRoaXMuX2NvbGxlY3RDb21tYW5kVmFyaWFibGVzKHZhcmlhYmxlcywgdGFzay5jb21tYW5kLCB0YXNrKTtcblx0XHR9XG5cdFx0dGhpcy5fY29sbGVjdE1hdGNoZXJWYXJpYWJsZXModmFyaWFibGVzLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyk7XG5cblx0XHRpZiAodGFzay5jb21tYW5kLnJ1bnRpbWUgPT09IFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbiAmJiAoQ3VzdG9tVGFzay5pcyh0YXNrKSB8fCBDb250cmlidXRlZFRhc2suaXModGFzaykpKSB7XG5cdFx0XHRsZXQgZGVmaW5pdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRkZWZpbml0aW9uID0gdGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVmaW5pdGlvbiA9IE9iamVjdHMuZGVlcENsb25lKHRhc2suZGVmaW5lcykgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdGRlbGV0ZSBkZWZpbml0aW9uLl9rZXk7XG5cdFx0XHRcdGRlbGV0ZSBkZWZpbml0aW9uLnR5cGU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb2xsZWN0RGVmaW5pdGlvblZhcmlhYmxlcyh2YXJpYWJsZXMsIGRlZmluaXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbGxlY3REZWZpbml0aW9uVmFyaWFibGVzKHZhcmlhYmxlczogU2V0PHN0cmluZz4sIGRlZmluaXRpb246IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZGVmaW5pdGlvbikpIHtcblx0XHRcdHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCBkZWZpbml0aW9uKTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGVmaW5pdGlvbikpIHtcblx0XHRcdGRlZmluaXRpb24uZm9yRWFjaCgoZWxlbWVudDogdW5rbm93bikgPT4gdGhpcy5fY29sbGVjdERlZmluaXRpb25WYXJpYWJsZXModmFyaWFibGVzLCBlbGVtZW50KSk7XG5cdFx0fSBlbHNlIGlmIChUeXBlcy5pc09iamVjdChkZWZpbml0aW9uKSkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZGVmaW5pdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fY29sbGVjdERlZmluaXRpb25WYXJpYWJsZXModmFyaWFibGVzLCAoZGVmaW5pdGlvbiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGVjdENvbW1hbmRWYXJpYWJsZXModmFyaWFibGVzOiBTZXQ8c3RyaW5nPiwgY29tbWFuZDogSUNvbW1hbmRDb25maWd1cmF0aW9uLCB0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrKTogdm9pZCB7XG5cdFx0Ly8gVGhlIGN1c3RvbSBleGVjdXRpb24gc2hvdWxkIGhhdmUgZXZlcnl0aGluZyBpdCBuZWVkcyBhbHJlYWR5IGFzIGl0IHByb3ZpZGVkXG5cdFx0Ly8gdGhlIGNhbGxiYWNrLlxuXHRcdGlmIChjb21tYW5kLnJ1bnRpbWUgPT09IFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjb21tYW5kLm5hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb21tYW5kIG5hbWUgc2hvdWxkIG5ldmVyIGJlIHVuZGVmaW5lZCBoZXJlLicpO1xuXHRcdH1cblx0XHR0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgY29tbWFuZC5uYW1lKTtcblx0XHRjb21tYW5kLmFyZ3M/LmZvckVhY2goYXJnID0+IHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCBhcmcpKTtcblx0XHQvLyBUcnkgdG8gZ2V0IGEgc2NvcGUuXG5cdFx0Y29uc3Qgc2NvcGUgPSAoPElFeHRlbnNpb25UYXNrU291cmNlPnRhc2suX3NvdXJjZSkuc2NvcGU7XG5cdFx0aWYgKHNjb3BlICE9PSBUYXNrU2NvcGUuR2xvYmFsKSB7XG5cdFx0XHR2YXJpYWJsZXMuYWRkKCcke3dvcmtzcGFjZUZvbGRlcn0nKTtcblx0XHR9XG5cdFx0aWYgKGNvbW1hbmQub3B0aW9ucykge1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbW1hbmQub3B0aW9ucztcblx0XHRcdGlmIChvcHRpb25zLmN3ZCkge1xuXHRcdFx0XHR0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgb3B0aW9ucy5jd2QpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3B0aW9uc0VudiA9IG9wdGlvbnMuZW52O1xuXHRcdFx0aWYgKG9wdGlvbnNFbnYpIHtcblx0XHRcdFx0T2JqZWN0LmtleXMob3B0aW9uc0VudikuZm9yRWFjaCgoa2V5KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBvcHRpb25zRW52W2tleV07XG5cdFx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29sbGVjdFZhcmlhYmxlcyh2YXJpYWJsZXMsIHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnMuc2hlbGwpIHtcblx0XHRcdFx0aWYgKG9wdGlvbnMuc2hlbGwuZXhlY3V0YWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCBvcHRpb25zLnNoZWxsLmV4ZWN1dGFibGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wdGlvbnMuc2hlbGwuYXJncz8uZm9yRWFjaChhcmcgPT4gdGhpcy5fY29sbGVjdFZhcmlhYmxlcyh2YXJpYWJsZXMsIGFyZykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbGxlY3RNYXRjaGVyVmFyaWFibGVzKHZhcmlhYmxlczogU2V0PHN0cmluZz4sIHZhbHVlczogQXJyYXk8c3RyaW5nIHwgUHJvYmxlbU1hdGNoZXI+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHZhbHVlcyA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlcyA9PT0gbnVsbCB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZhbHVlcy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuXHRcdFx0bGV0IG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyO1xuXHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0XHRpZiAodmFsdWVbMF0gPT09ICckJykge1xuXHRcdFx0XHRcdG1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmdldCh2YWx1ZS5zdWJzdHJpbmcoMSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmdldCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hdGNoZXIgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXRjaGVyICYmIG1hdGNoZXIuZmlsZVByZWZpeCkge1xuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcobWF0Y2hlci5maWxlUHJlZml4KSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCBtYXRjaGVyLmZpbGVQcmVmaXgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZnAgb2YgWy4uLmFzQXJyYXkobWF0Y2hlci5maWxlUHJlZml4LmluY2x1ZGUgfHwgW10pLCAuLi5hc0FycmF5KG1hdGNoZXIuZmlsZVByZWZpeC5leGNsdWRlIHx8IFtdKV0pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCBmcCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlczogU2V0PHN0cmluZz4sIHZhbHVlOiBzdHJpbmcgfCBDb21tYW5kU3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RyaW5nOiBzdHJpbmcgPSBUeXBlcy5pc1N0cmluZyh2YWx1ZSkgPyB2YWx1ZSA6IHZhbHVlLnZhbHVlO1xuXHRcdGNvbnN0IHIgPSAvXFwkXFx7KC4qPylcXH0vZztcblx0XHRsZXQgbWF0Y2hlczogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHRkbyB7XG5cdFx0XHRtYXRjaGVzID0gci5leGVjKHN0cmluZyk7XG5cdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHR2YXJpYWJsZXMuYWRkKG1hdGNoZXNbMF0pO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKG1hdGNoZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUNvbW1hbmRBbmRBcmdzKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCBjb21tYW5kQ29uZmlnOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24pOiBQcm9taXNlPHsgY29tbWFuZDogQ29tbWFuZFN0cmluZzsgYXJnczogQ29tbWFuZFN0cmluZ1tdIH0+IHtcblx0XHQvLyBGaXJzdCB3ZSBuZWVkIHRvIHVzZSB0aGUgY29tbWFuZCBhcmdzOlxuXHRcdGxldCBhcmdzOiBDb21tYW5kU3RyaW5nW10gPSBjb21tYW5kQ29uZmlnLmFyZ3MgPyBjb21tYW5kQ29uZmlnLmFyZ3Muc2xpY2UoKSA6IFtdO1xuXHRcdGFyZ3MgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyLCBhcmdzKTtcblx0XHRjb25zdCBjb21tYW5kOiBDb21tYW5kU3RyaW5nID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCBjb21tYW5kQ29uZmlnLm5hbWUpO1xuXHRcdHJldHVybiB7IGNvbW1hbmQsIGFyZ3MgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVWYXJpYWJsZXMocmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIsIHZhbHVlOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+O1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCB2YWx1ZTogQ29tbWFuZFN0cmluZ1tdKTogUHJvbWlzZTxDb21tYW5kU3RyaW5nW10+O1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCB2YWx1ZTogQ29tbWFuZFN0cmluZ1tdKTogUHJvbWlzZTxDb21tYW5kU3RyaW5nW10+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwodmFsdWUubWFwKHMgPT4gdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCBzKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZU1hdGNoZXJzKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCB2YWx1ZXM6IEFycmF5PHN0cmluZyB8IFByb2JsZW1NYXRjaGVyPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8UHJvYmxlbU1hdGNoZXJbXT4ge1xuXHRcdGlmICh2YWx1ZXMgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZXMgPT09IG51bGwgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IFByb2JsZW1NYXRjaGVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0bGV0IG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyO1xuXHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0XHRpZiAodmFsdWVbMF0gPT09ICckJykge1xuXHRcdFx0XHRcdG1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmdldCh2YWx1ZS5zdWJzdHJpbmcoMSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmdldCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hdGNoZXIgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghbWF0Y2hlcikge1xuXHRcdFx0XHR0aGlzLl9hcHBlbmRPdXRwdXQobmxzLmxvY2FsaXplKCd1bmtub3duUHJvYmxlbU1hdGNoZXInLCAnUHJvYmxlbSBtYXRjaGVyIHswfSBjYW5cXCd0IGJlIHJlc29sdmVkLiBUaGUgbWF0Y2hlciB3aWxsIGJlIGlnbm9yZWQnKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGFza1N5c3RlbUluZm86IElUYXNrU3lzdGVtSW5mbyB8IHVuZGVmaW5lZCA9IHJlc29sdmVyLnRhc2tTeXN0ZW1JbmZvO1xuXHRcdFx0Y29uc3QgaGFzRmlsZVByZWZpeCA9IG1hdGNoZXIuZmlsZVByZWZpeCAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaGFzVXJpUHJvdmlkZXIgPSB0YXNrU3lzdGVtSW5mbyAhPT0gdW5kZWZpbmVkICYmIHRhc2tTeXN0ZW1JbmZvLnVyaVByb3ZpZGVyICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWhhc0ZpbGVQcmVmaXggJiYgIWhhc1VyaVByb3ZpZGVyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1hdGNoZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY29weSA9IE9iamVjdHMuZGVlcENsb25lKG1hdGNoZXIpO1xuXHRcdFx0XHRpZiAoaGFzVXJpUHJvdmlkZXIgJiYgKHRhc2tTeXN0ZW1JbmZvICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0Y29weS51cmlQcm92aWRlciA9IHRhc2tTeXN0ZW1JbmZvLnVyaVByb3ZpZGVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNGaWxlUHJlZml4KSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZVByZWZpeCA9IGNvcHkuZmlsZVByZWZpeDtcblx0XHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZmlsZVByZWZpeCkpIHtcblx0XHRcdFx0XHRcdGNvcHkuZmlsZVByZWZpeCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgZmlsZVByZWZpeCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChmaWxlUHJlZml4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGlmIChmaWxlUHJlZml4LmluY2x1ZGUpIHtcblx0XHRcdFx0XHRcdFx0ZmlsZVByZWZpeC5pbmNsdWRlID0gQXJyYXkuaXNBcnJheShmaWxlUHJlZml4LmluY2x1ZGUpXG5cdFx0XHRcdFx0XHRcdFx0PyBhd2FpdCBQcm9taXNlLmFsbChmaWxlUHJlZml4LmluY2x1ZGUubWFwKHggPT4gdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCB4KSkpXG5cdFx0XHRcdFx0XHRcdFx0OiBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsIGZpbGVQcmVmaXguaW5jbHVkZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZmlsZVByZWZpeC5leGNsdWRlKSB7XG5cdFx0XHRcdFx0XHRcdGZpbGVQcmVmaXguZXhjbHVkZSA9IEFycmF5LmlzQXJyYXkoZmlsZVByZWZpeC5leGNsdWRlKVxuXHRcdFx0XHRcdFx0XHRcdD8gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZVByZWZpeC5leGNsdWRlLm1hcCh4ID0+IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgeCkpKVxuXHRcdFx0XHRcdFx0XHRcdDogYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCBmaWxlUHJlZml4LmV4Y2x1ZGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQucHVzaChjb3B5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nPjtcblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCB2YWx1ZTogQ29tbWFuZFN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8Q29tbWFuZFN0cmluZz47XG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFsdWU6IENvbW1hbmRTdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPENvbW1hbmRTdHJpbmc+IHtcblx0XHQvLyBUT0RPQERpcmsgVGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIgc2hvdWxkIHJldHVybiBhIFdvcmtzcGFjZUZvbGRlciB0aGF0IGlzIGRlZmluZWQgaW4gd29ya3NwYWNlLnRzXG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHJlc29sdmVyLnJlc29sdmUodmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dmFsdWU6IGF3YWl0IHJlc29sdmVyLnJlc29sdmUodmFsdWUudmFsdWUpLFxuXHRcdFx0XHRxdW90aW5nOiB2YWx1ZS5xdW90aW5nXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7IC8vIFRoaXMgc2hvdWxkIG5ldmVyIGhhcHBlblxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgdHJ5IHRvIHJlc29sdmUgdW5kZWZpbmVkLicpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVPcHRpb25zKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCBvcHRpb25zOiBDb21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8Q29tbWFuZE9wdGlvbnM+IHtcblx0XHRpZiAob3B0aW9ucyA9PT0gdW5kZWZpbmVkIHx8IG9wdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdGxldCBjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGN3ZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgJyR7d29ya3NwYWNlRm9sZGVyfScpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBObyB3b3Jrc3BhY2Vcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGN3ZCB9O1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IENvbW1hbmRPcHRpb25zID0gVHlwZXMuaXNTdHJpbmcob3B0aW9ucy5jd2QpXG5cdFx0XHQ/IHsgY3dkOiBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsIG9wdGlvbnMuY3dkKSB9XG5cdFx0XHQ6IHsgY3dkOiBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsICcke3dvcmtzcGFjZUZvbGRlcn0nKSB9O1xuXHRcdGlmIChvcHRpb25zLmVudikge1xuXHRcdFx0cmVzdWx0LmVudiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvcHRpb25zLmVudikpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBvcHRpb25zLmVudltrZXldO1xuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmVudiFba2V5XSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgdmFsdWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5lbnYhW2tleV0gPSBTdHJpbmcodmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRzdGF0aWMgV2VsbEtub3duQ29tbWFuZHM6IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+ID0ge1xuXHRcdCdhbnQnOiB0cnVlLFxuXHRcdCdjbWFrZSc6IHRydWUsXG5cdFx0J2VzbGludCc6IHRydWUsXG5cdFx0J2dyYWRsZSc6IHRydWUsXG5cdFx0J2dydW50JzogdHJ1ZSxcblx0XHQnZ3VscCc6IHRydWUsXG5cdFx0J2pha2UnOiB0cnVlLFxuXHRcdCdqZW5raW5zJzogdHJ1ZSxcblx0XHQnanNoaW50JzogdHJ1ZSxcblx0XHQnbWFrZSc6IHRydWUsXG5cdFx0J21hdmVuJzogdHJ1ZSxcblx0XHQnbXNidWlsZCc6IHRydWUsXG5cdFx0J21zYyc6IHRydWUsXG5cdFx0J25tYWtlJzogdHJ1ZSxcblx0XHQnbnBtJzogdHJ1ZSxcblx0XHQncmFrZSc6IHRydWUsXG5cdFx0J3RzYyc6IHRydWUsXG5cdFx0J3hidWlsZCc6IHRydWVcblx0fTtcblxuXHRwdWJsaWMgZ2V0U2FuaXRpemVkQ29tbWFuZChjbWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IGNtZC50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGluZGV4ID0gcmVzdWx0Lmxhc3RJbmRleE9mKHBhdGguc2VwKTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQuc3Vic3RyaW5nKGluZGV4ICsgMSk7XG5cdFx0fVxuXHRcdGlmIChUZXJtaW5hbFRhc2tTeXN0ZW0uV2VsbEtub3duQ29tbWFuZHNbcmVzdWx0XSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuICdvdGhlcic7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0VGFza0ZvclRlcm1pbmFsKGluc3RhbmNlSWQ6IG51bWJlcik6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIEZpcnN0IGNoZWNrIGlmIHRoZXJlJ3MgYW4gYWN0aXZlIHRhc2sgZm9yIHRoaXMgdGVybWluYWxcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh0aGlzLl9hY3RpdmVUYXNrcykpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVRhc2sgPSB0aGlzLl9hY3RpdmVUYXNrc1trZXldO1xuXHRcdFx0aWYgKGFjdGl2ZVRhc2sudGVybWluYWw/Lmluc3RhbmNlSWQgPT09IGluc3RhbmNlSWQpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2ZVRhc2sudGFzaztcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gSWYgbm8gYWN0aXZlIHRhc2ssIGNoZWNrIHRoZSB0ZXJtaW5hbHMgbWFwIGZvciB0aGUgbGFzdCB0YXNrIHRoYXQgcmFuIGluIHRoaXMgdGVybWluYWxcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSB0aGlzLl90ZXJtaW5hbHNbaW5zdGFuY2VJZC50b1N0cmluZygpXTtcblx0XHRpZiAodGVybWluYWxEYXRhPy5sYXN0VGFzaykge1xuXHRcdFx0Ly8gTG9vayB1cCB0aGUgdGFzayB1c2luZyB0aGUgY2FsbGJhY2sgcHJvdmlkZWQgYnkgdGhlIHRhc2sgc2VydmljZVxuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Rhc2tMb29rdXAodGVybWluYWxEYXRhLmxhc3RUYXNrKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZE91dHB1dChvdXRwdXQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG91dHB1dENoYW5uZWwgPSB0aGlzLl9vdXRwdXRTZXJ2aWNlLmdldENoYW5uZWwodGhpcy5fb3V0cHV0Q2hhbm5lbElkKTtcblx0XHRvdXRwdXRDaGFubmVsPy5hcHBlbmQob3V0cHV0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRXYWl0T25FeGl0VmFsdWUocHJlc2VudGF0aW9uT3B0aW9uczogSVByZXNlbnRhdGlvbk9wdGlvbnMsIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMpIHtcblx0aWYgKChwcmVzZW50YXRpb25PcHRpb25zLmNsb3NlID09PSB1bmRlZmluZWQpIHx8IChwcmVzZW50YXRpb25PcHRpb25zLmNsb3NlID09PSBmYWxzZSkpIHtcblx0XHRpZiAoKHByZXNlbnRhdGlvbk9wdGlvbnMucmV2ZWFsICE9PSBSZXZlYWxLaW5kLk5ldmVyKSB8fCAhY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kIHx8IChwcmVzZW50YXRpb25PcHRpb25zLmNsb3NlID09PSBmYWxzZSkpIHtcblx0XHRcdGlmIChwcmVzZW50YXRpb25PcHRpb25zLnBhbmVsID09PSBQYW5lbEtpbmQuTmV3KSB7XG5cdFx0XHRcdHJldHVybiB0YXNrU2hlbGxJbnRlZ3JhdGlvbldhaXRPbkV4aXRTZXF1ZW5jZShubHMubG9jYWxpemUoJ2Nsb3NlVGVybWluYWwnLCAnUHJlc3MgYW55IGtleSB0byBjbG9zZSB0aGUgdGVybWluYWwuJykpO1xuXHRcdFx0fSBlbHNlIGlmIChwcmVzZW50YXRpb25PcHRpb25zLnNob3dSZXVzZU1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHRhc2tTaGVsbEludGVncmF0aW9uV2FpdE9uRXhpdFNlcXVlbmNlKG5scy5sb2NhbGl6ZSgncmV1c2VUZXJtaW5hbCcsICdUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdC4nKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuICFwcmVzZW50YXRpb25PcHRpb25zLmNsb3NlO1xufVxuXG5mdW5jdGlvbiB0YXNrU2hlbGxJbnRlZ3JhdGlvbldhaXRPbkV4aXRTZXF1ZW5jZShtZXNzYWdlOiBzdHJpbmcpOiAoZXhpdENvZGU6IG51bWJlcikgPT4gc3RyaW5nIHtcblx0cmV0dXJuIChleGl0Q29kZSkgPT4ge1xuXHRcdHJldHVybiBgJHtWU0NvZGVTZXF1ZW5jZShWU0NvZGVPc2NQdC5Db21tYW5kRmluaXNoZWQsIGV4aXRDb2RlLnRvU3RyaW5nKCkpfSR7bWVzc2FnZX1gO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRSZWNvbm5lY3Rpb25EYXRhKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSk6IElSZWNvbm5lY3Rpb25UYXNrRGF0YSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0ZXJtaW5hbC5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8ucmVjb25uZWN0aW9uUHJvcGVydGllcz8uZGF0YSBhcyBJUmVjb25uZWN0aW9uVGFza0RhdGEgfCB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsWUFBWSxXQUFXO0FBRXZCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxXQUFXLGFBQWE7QUFDakMsWUFBWSxhQUFhO0FBQ3pCLFlBQVksVUFBVTtBQUN0QixZQUFZLGNBQWM7QUFDMUIsWUFBWSxlQUFlO0FBQzNCLE9BQU8sY0FBYztBQUNyQixZQUFZLFdBQVc7QUFDdkIsWUFBWSxTQUFTO0FBSXJCLFNBQXNDLHNCQUFzQjtBQUM1RCxTQUFxRCxzQkFBc0I7QUFDM0UsU0FBUyxlQUFlO0FBQ3hCLFNBQXlCLDhCQUFpRTtBQUUxRixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUtwQixTQUFTLGdDQUFnQztBQUN6QyxTQUFpQyw2QkFB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
