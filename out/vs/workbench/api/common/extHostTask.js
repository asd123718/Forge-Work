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
import { URI } from "../../../base/common/uri.js";
import { asPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { MainContext } from "./extHost.protocol.js";
import * as types from "./extHostTypes.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { Schemas } from "../../../base/common/network.js";
import * as Platform from "../../../base/common/platform.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IExtHostApiDeprecationService } from "./extHostApiDeprecationService.js";
import { USER_TASKS_GROUP_KEY } from "../../contrib/tasks/common/tasks.js";
import { ErrorNoTelemetry, NotSupportedError } from "../../../base/common/errors.js";
import { asArray } from "../../../base/common/arrays.js";
var TaskDefinitionDTO;
((TaskDefinitionDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskDefinitionDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskDefinitionDTO2.to = to;
})(TaskDefinitionDTO || (TaskDefinitionDTO = {}));
var TaskPresentationOptionsDTO;
((TaskPresentationOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskPresentationOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskPresentationOptionsDTO2.to = to;
})(TaskPresentationOptionsDTO || (TaskPresentationOptionsDTO = {}));
var ProcessExecutionOptionsDTO;
((ProcessExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ProcessExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ProcessExecutionOptionsDTO2.to = to;
})(ProcessExecutionOptionsDTO || (ProcessExecutionOptionsDTO = {}));
var ProcessExecutionDTO;
((ProcessExecutionDTO2) => {
  function is(value) {
    if (value) {
      const candidate = value;
      return candidate && !!candidate.process;
    } else {
      return false;
    }
  }
  ProcessExecutionDTO2.is = is;
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {
      process: value.process,
      args: value.args
    };
    if (value.options) {
      result.options = ProcessExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ProcessExecutionDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return new types.ProcessExecution(value.process, value.args, value.options);
  }
  ProcessExecutionDTO2.to = to;
})(ProcessExecutionDTO || (ProcessExecutionDTO = {}));
var ShellExecutionOptionsDTO;
((ShellExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ShellExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ShellExecutionOptionsDTO2.to = to;
})(ShellExecutionOptionsDTO || (ShellExecutionOptionsDTO = {}));
var ShellExecutionDTO;
((ShellExecutionDTO2) => {
  function is(value) {
    if (value) {
      const candidate = value;
      return candidate && (!!candidate.commandLine || !!candidate.command);
    } else {
      return false;
    }
  }
  ShellExecutionDTO2.is = is;
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {};
    if (value.commandLine !== void 0) {
      result.commandLine = value.commandLine;
    } else {
      result.command = value.command;
      result.args = value.args;
    }
    if (value.options) {
      result.options = ShellExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ShellExecutionDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null || value.command === void 0 && value.commandLine === void 0) {
      return void 0;
    }
    if (value.commandLine) {
      return new types.ShellExecution(value.commandLine, value.options);
    } else {
      return new types.ShellExecution(value.command, value.args ? value.args : [], value.options);
    }
  }
  ShellExecutionDTO2.to = to;
})(ShellExecutionDTO || (ShellExecutionDTO = {}));
var CustomExecutionDTO;
((CustomExecutionDTO2) => {
  function is(value) {
    if (value) {
      const candidate = value;
      return candidate && candidate.customExecution === "customExecution";
    } else {
      return false;
    }
  }
  CustomExecutionDTO2.is = is;
  function from(value) {
    return {
      customExecution: "customExecution"
    };
  }
  CustomExecutionDTO2.from = from;
  function to(taskId, providedCustomExeutions) {
    return providedCustomExeutions.get(taskId);
  }
  CustomExecutionDTO2.to = to;
})(CustomExecutionDTO || (CustomExecutionDTO = {}));
var TaskHandleDTO;
((TaskHandleDTO2) => {
  function from(value, workspaceService) {
    let folder;
    if (value.scope !== void 0 && typeof value.scope !== "number") {
      folder = value.scope.uri;
    } else if (value.scope !== void 0 && typeof value.scope === "number") {
      if (value.scope === types.TaskScope.Workspace && workspaceService && workspaceService.workspaceFile) {
        folder = workspaceService.workspaceFile;
      } else {
        folder = USER_TASKS_GROUP_KEY;
      }
    }
    return {
      id: value._id,
      workspaceFolder: folder
    };
  }
  TaskHandleDTO2.from = from;
})(TaskHandleDTO || (TaskHandleDTO = {}));
var TaskGroupDTO;
((TaskGroupDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return { _id: value.id, isDefault: value.isDefault };
  }
  TaskGroupDTO2.from = from;
})(TaskGroupDTO || (TaskGroupDTO = {}));
var TaskDTO;
((TaskDTO2) => {
  function fromMany(tasks2, extension) {
    if (tasks2 === void 0 || tasks2 === null) {
      return [];
    }
    const result = [];
    for (const task of tasks2) {
      const converted = from(task, extension);
      if (converted) {
        result.push(converted);
      }
    }
    return result;
  }
  TaskDTO2.fromMany = fromMany;
  function from(value, extension) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    let execution;
    if (value.execution instanceof types.ProcessExecution) {
      execution = ProcessExecutionDTO.from(value.execution);
    } else if (value.execution instanceof types.ShellExecution) {
      execution = ShellExecutionDTO.from(value.execution);
    } else if (value.execution && value.execution instanceof types.CustomExecution) {
      execution = CustomExecutionDTO.from(value.execution);
    }
    const definition = TaskDefinitionDTO.from(value.definition);
    let scope;
    if (value.scope) {
      if (typeof value.scope === "number") {
        scope = value.scope;
      } else {
        scope = value.scope.uri;
      }
    } else {
      scope = types.TaskScope.Workspace;
    }
    if (!definition || !scope) {
      return void 0;
    }
    const result = {
      _id: value._id,
      definition,
      name: value.name,
      source: {
        extensionId: extension.identifier.value,
        label: value.source,
        scope
      },
      execution,
      isBackground: value.isBackground,
      group: TaskGroupDTO.from(value.group),
      presentationOptions: TaskPresentationOptionsDTO.from(value.presentationOptions),
      problemMatchers: asArray(value.problemMatchers),
      hasDefinedMatchers: value.hasDefinedMatchers,
      runOptions: value.runOptions ? value.runOptions : { reevaluateOnRerun: true },
      detail: value.detail
    };
    return result;
  }
  TaskDTO2.from = from;
  async function to(value, workspace, providedCustomExeutions) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    let execution;
    if (ProcessExecutionDTO.is(value.execution)) {
      execution = ProcessExecutionDTO.to(value.execution);
    } else if (ShellExecutionDTO.is(value.execution)) {
      execution = ShellExecutionDTO.to(value.execution);
    } else if (CustomExecutionDTO.is(value.execution)) {
      execution = CustomExecutionDTO.to(value._id, providedCustomExeutions);
    }
    const definition = TaskDefinitionDTO.to(value.definition);
    let scope;
    if (value.source) {
      if (value.source.scope !== void 0) {
        if (typeof value.source.scope === "number") {
          scope = value.source.scope;
        } else {
          scope = await workspace.resolveWorkspaceFolder(URI.revive(value.source.scope));
        }
      } else {
        scope = types.TaskScope.Workspace;
      }
    }
    if (!definition || !scope) {
      return void 0;
    }
    const result = new types.Task(definition, scope, value.name, value.source.label, execution, value.problemMatchers);
    if (value.isBackground !== void 0) {
      result.isBackground = value.isBackground;
    }
    if (value.group !== void 0) {
      result.group = types.TaskGroup.from(value.group._id);
      if (result.group && value.group.isDefault) {
        result.group = new types.TaskGroup(result.group.id, result.group.label);
        if (value.group.isDefault === true) {
          result.group.isDefault = value.group.isDefault;
        }
      }
    }
    if (value.presentationOptions) {
      result.presentationOptions = TaskPresentationOptionsDTO.to(value.presentationOptions);
    }
    if (value.runOptions) {
      result.runOptions = value.runOptions;
    }
    if (value._id) {
      result._id = value._id;
    }
    if (value.detail) {
      result.detail = value.detail;
    }
    return result;
  }
  TaskDTO2.to = to;
})(TaskDTO || (TaskDTO = {}));
var TaskFilterDTO;
((TaskFilterDTO2) => {
  function from(value) {
    return value;
  }
  TaskFilterDTO2.from = from;
  function to(value) {
    if (!value) {
      return void 0;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), value);
  }
  TaskFilterDTO2.to = to;
})(TaskFilterDTO || (TaskFilterDTO = {}));
class TaskExecutionImpl {
  constructor(tasks2, _id, _task) {
    this._id = _id;
    this._task = _task;
    this.#tasks = tasks2;
  }
  #tasks;
  get task() {
    return this._task;
  }
  terminate() {
    this.#tasks.terminateTask(this);
  }
  fireDidStartProcess(value) {
  }
  fireDidEndProcess(value) {
  }
  get terminal() {
    return this._terminal;
  }
  set terminal(term) {
    this._terminal = term;
  }
}
let ExtHostTaskBase = class {
  constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService) {
    this._onDidExecuteTask = new Emitter();
    this._onDidTerminateTask = new Emitter();
    this._onDidTaskProcessStarted = new Emitter();
    this._onDidTaskProcessEnded = new Emitter();
    this._onDidStartTaskProblemMatchers = new Emitter();
    this._onDidEndTaskProblemMatchers = new Emitter();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadTask);
    this._workspaceProvider = workspaceService;
    this._editorService = editorService;
    this._configurationService = configurationService;
    this._terminalService = extHostTerminalService;
    this._handleCounter = 0;
    this._handlers = /* @__PURE__ */ new Map();
    this._taskExecutions = /* @__PURE__ */ new Map();
    this._taskExecutionPromises = /* @__PURE__ */ new Map();
    this._providedCustomExecutions2 = /* @__PURE__ */ new Map();
    this._notProvidedCustomExecutions = /* @__PURE__ */ new Set();
    this._activeCustomExecutions2 = /* @__PURE__ */ new Map();
    this._logService = logService;
    this._deprecationService = deprecationService;
    this._proxy.$registerSupportedExecutions(true);
  }
  registerTaskProvider(extension, type, provider) {
    if (!provider) {
      return new types.Disposable(() => {
      });
    }
    const handle = this.nextHandle();
    this._handlers.set(handle, { type, provider, extension });
    this._proxy.$registerTaskProvider(handle, type);
    return new types.Disposable(() => {
      this._handlers.delete(handle);
      this._proxy.$unregisterTaskProvider(handle);
    });
  }
  registerTaskSystem(scheme, info) {
    this._proxy.$registerTaskSystem(scheme, info);
  }
  fetchTasks(filter) {
    return this._proxy.$fetchTasks(TaskFilterDTO.from(filter)).then(async (values) => {
      const result = [];
      for (const value of values) {
        const task = await TaskDTO.to(value, this._workspaceProvider, this._providedCustomExecutions2);
        if (task) {
          result.push(task);
        }
      }
      return result;
    });
  }
  get taskExecutions() {
    const result = [];
    this._taskExecutions.forEach((value) => result.push(value));
    return result;
  }
  terminateTask(execution) {
    if (!(execution instanceof TaskExecutionImpl)) {
      throw new Error("No valid task execution provided");
    }
    return this._proxy.$terminateTask(execution._id);
  }
  get onDidStartTask() {
    return this._onDidExecuteTask.event;
  }
  async $onDidStartTask(execution, terminalId, resolvedDefinition) {
    const customExecution = this._providedCustomExecutions2.get(execution.id);
    if (customExecution) {
      this._activeCustomExecutions2.set(execution.id, customExecution);
      this._terminalService.attachPtyToTerminal(terminalId, await customExecution.callback(resolvedDefinition));
    }
    this._lastStartedTask = execution.id;
    const taskExecution = await this.getTaskExecution(execution);
    const terminal = this._terminalService.getTerminalById(terminalId)?.value;
    if (taskExecution) {
      taskExecution.terminal = terminal;
    }
    this._onDidExecuteTask.fire({
      execution: taskExecution
    });
  }
  get onDidEndTask() {
    return this._onDidTerminateTask.event;
  }
  async $OnDidEndTask(execution) {
    if (!this._taskExecutionPromises.has(execution.id)) {
      return;
    }
    const _execution = await this.getTaskExecution(execution);
    this._taskExecutionPromises.delete(execution.id);
    this._taskExecutions.delete(execution.id);
    this.customExecutionComplete(execution);
    this._onDidTerminateTask.fire({
      execution: _execution
    });
  }
  get onDidStartTaskProcess() {
    return this._onDidTaskProcessStarted.event;
  }
  async $onDidStartTaskProcess(value) {
    const execution = await this.getTaskExecution(value.id);
    this._onDidTaskProcessStarted.fire({
      execution,
      processId: value.processId
    });
  }
  get onDidEndTaskProcess() {
    return this._onDidTaskProcessEnded.event;
  }
  async $onDidEndTaskProcess(value) {
    const execution = await this.getTaskExecution(value.id);
    this._onDidTaskProcessEnded.fire({
      execution,
      exitCode: value.exitCode
    });
  }
  get onDidStartTaskProblemMatchers() {
    return this._onDidStartTaskProblemMatchers.event;
  }
  async $onDidStartTaskProblemMatchers(value) {
    let execution;
    try {
      execution = await this.getTaskExecution(value.execution.id);
    } catch (error) {
      return;
    }
    this._onDidStartTaskProblemMatchers.fire({ execution });
  }
  get onDidEndTaskProblemMatchers() {
    return this._onDidEndTaskProblemMatchers.event;
  }
  async $onDidEndTaskProblemMatchers(value) {
    let execution;
    try {
      execution = await this.getTaskExecution(value.execution.id);
    } catch (error) {
      return;
    }
    this._onDidEndTaskProblemMatchers.fire({ execution, hasErrors: value.hasErrors });
  }
  $provideTasks(handle, validTypes) {
    const handler = this._handlers.get(handle);
    if (!handler) {
      return Promise.reject(new Error("no handler found"));
    }
    const taskIdPromises = [];
    const fetchPromise = asPromise(() => handler.provider.provideTasks(CancellationToken.None)).then((value) => {
      return this.provideTasksInternal(validTypes, taskIdPromises, handler, value);
    });
    return new Promise((resolve) => {
      fetchPromise.then((result) => {
        Promise.all(taskIdPromises).then(() => {
          resolve(result);
        });
      });
    });
  }
  async $resolveTask(handle, taskDTO) {
    const handler = this._handlers.get(handle);
    if (!handler) {
      return Promise.reject(new Error("no handler found"));
    }
    if (taskDTO.definition.type !== handler.type) {
      throw new Error(`Unexpected: Task of type [${taskDTO.definition.type}] cannot be resolved by provider of type [${handler.type}].`);
    }
    const task = await TaskDTO.to(taskDTO, this._workspaceProvider, this._providedCustomExecutions2);
    if (!task) {
      throw new Error("Unexpected: Task cannot be resolved.");
    }
    const resolvedTask = await handler.provider.resolveTask(task, CancellationToken.None);
    if (!resolvedTask) {
      return;
    }
    this.checkDeprecation(resolvedTask, handler);
    const resolvedTaskDTO = TaskDTO.from(resolvedTask, handler.extension);
    if (!resolvedTaskDTO) {
      throw new Error("Unexpected: Task cannot be resolved.");
    }
    if (resolvedTask.definition !== task.definition) {
      throw new Error("Unexpected: The resolved task definition must be the same object as the original task definition. The task definition cannot be changed.");
    }
    if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
      await this.addCustomExecution(resolvedTaskDTO, resolvedTask, true);
    }
    return await this.resolveTaskInternal(resolvedTaskDTO);
  }
  nextHandle() {
    return this._handleCounter++;
  }
  async addCustomExecution(taskDTO, task, isProvided) {
    const taskId = await this._proxy.$createTaskId(taskDTO);
    if (!isProvided && !this._providedCustomExecutions2.has(taskId)) {
      this._notProvidedCustomExecutions.add(taskId);
      this._activeCustomExecutions2.set(taskId, task.execution);
    }
    this._providedCustomExecutions2.set(taskId, task.execution);
  }
  async getTaskExecution(execution, task) {
    if (typeof execution === "string") {
      const taskExecution = this._taskExecutionPromises.get(execution);
      if (!taskExecution) {
        throw new ErrorNoTelemetry("Unexpected: The specified task is missing an execution");
      }
      return taskExecution;
    }
    const result = this._taskExecutionPromises.get(execution.id);
    if (result) {
      return result;
    }
    let executionPromise;
    if (!task) {
      executionPromise = TaskDTO.to(execution.task, this._workspaceProvider, this._providedCustomExecutions2).then((t) => {
        if (!t) {
          throw new ErrorNoTelemetry("Unexpected: Task does not exist.");
        }
        return new TaskExecutionImpl(this, execution.id, t);
      });
    } else {
      executionPromise = Promise.resolve(new TaskExecutionImpl(this, execution.id, task));
    }
    this._taskExecutionPromises.set(execution.id, executionPromise);
    return executionPromise.then((taskExecution) => {
      this._taskExecutions.set(execution.id, taskExecution);
      return taskExecution;
    });
  }
  checkDeprecation(task, handler) {
    const tTask = task;
    if (tTask._deprecated) {
      this._deprecationService.report("Task.constructor", handler.extension, "Use the Task constructor that takes a `scope` instead.");
    }
  }
  customExecutionComplete(execution) {
    const extensionCallback2 = this._activeCustomExecutions2.get(execution.id);
    if (extensionCallback2) {
      this._activeCustomExecutions2.delete(execution.id);
    }
    if (this._notProvidedCustomExecutions.has(execution.id) && this._lastStartedTask !== execution.id) {
      this._providedCustomExecutions2.delete(execution.id);
      this._notProvidedCustomExecutions.delete(execution.id);
    }
    const iterator = this._notProvidedCustomExecutions.values();
    let iteratorResult = iterator.next();
    while (!iteratorResult.done) {
      if (!this._activeCustomExecutions2.has(iteratorResult.value) && this._lastStartedTask !== iteratorResult.value) {
        this._providedCustomExecutions2.delete(iteratorResult.value);
        this._notProvidedCustomExecutions.delete(iteratorResult.value);
      }
      iteratorResult = iterator.next();
    }
  }
};
ExtHostTaskBase = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostWorkspace),
  __decorateParam(3, IExtHostDocumentsAndEditors),
  __decorateParam(4, IExtHostConfiguration),
  __decorateParam(5, IExtHostTerminalService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IExtHostApiDeprecationService)
], ExtHostTaskBase);
let WorkerExtHostTask = class extends ExtHostTaskBase {
  constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService) {
    super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService);
    this.registerTaskSystem(Schemas.vscodeRemote, {
      scheme: Schemas.vscodeRemote,
      authority: "",
      platform: Platform.PlatformToString(Platform.Platform.Web)
    });
  }
  async executeTask(extension, task) {
    if (!task.execution) {
      throw new Error("Tasks to execute must include an execution");
    }
    const dto = TaskDTO.from(task, extension);
    if (dto === void 0) {
      throw new Error("Task is not valid");
    }
    if (CustomExecutionDTO.is(dto.execution)) {
      await this.addCustomExecution(dto, task, false);
    } else {
      throw new NotSupportedError();
    }
    const execution = await this.getTaskExecution(await this._proxy.$getTaskExecution(dto), task);
    this._proxy.$executeTask(dto).catch((error) => {
      throw new Error(error);
    });
    return execution;
  }
  provideTasksInternal(validTypes, taskIdPromises, handler, value) {
    const taskDTOs = [];
    if (value) {
      for (const task of value) {
        this.checkDeprecation(task, handler);
        if (!task.definition || !validTypes[task.definition.type]) {
          const source = task.source ? task.source : "No task source";
          this._logService.warn(`The task [${source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
        }
        const taskDTO = TaskDTO.from(task, handler.extension);
        if (taskDTO && CustomExecutionDTO.is(taskDTO.execution)) {
          taskDTOs.push(taskDTO);
          taskIdPromises.push(this.addCustomExecution(taskDTO, task, true));
        } else {
          this._logService.warn("Only custom execution tasks supported.");
        }
      }
    }
    return {
      tasks: taskDTOs,
      extension: handler.extension
    };
  }
  async resolveTaskInternal(resolvedTaskDTO) {
    if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
      return resolvedTaskDTO;
    } else {
      this._logService.warn("Only custom execution tasks supported.");
    }
    return void 0;
  }
  async $resolveVariables(uriComponents, toResolve) {
    const result = {
      process: void 0,
      variables: /* @__PURE__ */ Object.create(null)
    };
    return result;
  }
  async $jsonTasksSupported() {
    return false;
  }
  async $findExecutable(command, cwd, paths) {
    return void 0;
  }
};
WorkerExtHostTask = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostWorkspace),
  __decorateParam(3, IExtHostDocumentsAndEditors),
  __decorateParam(4, IExtHostConfiguration),
  __decorateParam(5, IExtHostTerminalService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IExtHostApiDeprecationService)
], WorkerExtHostTask);
const IExtHostTask = createDecorator("IExtHostTask");
export {
  CustomExecutionDTO,
  ExtHostTaskBase,
  IExtHostTask,
  TaskDTO,
  TaskHandleDTO,
  WorkerExtHostTask
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VGFzay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhc1Byb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcblxuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRUYXNrU2hhcGUsIEV4dEhvc3RUYXNrU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciwgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCAqIGFzIHRhc2tzIGZyb20gJy4vc2hhcmVkL3Rhc2tzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBQbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVTRVJfVEFTS1NfR1JPVVBfS0VZIH0gZnJvbSAnLi4vLi4vY29udHJpYi90YXNrcy9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSwgTm90U3VwcG9ydGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZER0bywgSVRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRHRvIH0gZnJvbSAnLi9zaGFyZWQvdGFza3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0VGFzayBleHRlbmRzIEV4dEhvc3RUYXNrU2hhcGUge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHR0YXNrRXhlY3V0aW9uczogdnNjb2RlLlRhc2tFeGVjdXRpb25bXTtcblx0cmVhZG9ubHkgb25EaWRTdGFydFRhc2s6IEV2ZW50PHZzY29kZS5UYXNrU3RhcnRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkRW5kVGFzazogRXZlbnQ8dnNjb2RlLlRhc2tFbmRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRUYXNrUHJvY2VzczogRXZlbnQ8dnNjb2RlLlRhc2tQcm9jZXNzU3RhcnRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkRW5kVGFza1Byb2Nlc3M6IEV2ZW50PHZzY29kZS5UYXNrUHJvY2Vzc0VuZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnM6IEV2ZW50PHZzY29kZS5UYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnM6IEV2ZW50PHZzY29kZS5UYXNrUHJvYmxlbU1hdGNoZXJFbmRlZEV2ZW50PjtcblxuXHRyZWdpc3RlclRhc2tQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRhc2tQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRyZWdpc3RlclRhc2tTeXN0ZW0oc2NoZW1lOiBzdHJpbmcsIGluZm86IHRhc2tzLklUYXNrU3lzdGVtSW5mb0RUTyk6IHZvaWQ7XG5cdGZldGNoVGFza3MoZmlsdGVyPzogdnNjb2RlLlRhc2tGaWx0ZXIpOiBQcm9taXNlPHZzY29kZS5UYXNrW10+O1xuXHRleGVjdXRlVGFzayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdGFzazogdnNjb2RlLlRhc2spOiBQcm9taXNlPHZzY29kZS5UYXNrRXhlY3V0aW9uPjtcblx0dGVybWluYXRlVGFzayhleGVjdXRpb246IHZzY29kZS5UYXNrRXhlY3V0aW9uKTogUHJvbWlzZTx2b2lkPjtcbn1cblxubmFtZXNwYWNlIFRhc2tEZWZpbml0aW9uRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5UYXNrRGVmaW5pdGlvbik6IHRhc2tzLklUYXNrRGVmaW5pdGlvbkRUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IHRhc2tzLklUYXNrRGVmaW5pdGlvbkRUTyk6IHZzY29kZS5UYXNrRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLlRhc2tQcmVzZW50YXRpb25PcHRpb25zKTogdGFza3MuSVRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogdGFza3MuSVRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPKTogdnNjb2RlLlRhc2tQcmVzZW50YXRpb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnMpOiB0YXNrcy5JUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8pOiB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn1cblxubmFtZXNwYWNlIFByb2Nlc3NFeGVjdXRpb25EVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gaXModmFsdWU6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTyB8IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPIHwgdGFza3MuSUN1c3RvbUV4ZWN1dGlvbkRUTyB8IHVuZGVmaW5lZCk6IHZhbHVlIGlzIHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPIHtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPO1xuXHRcdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiAhIWNhbmRpZGF0ZS5wcm9jZXNzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbik6IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiB0YXNrcy5JUHJvY2Vzc0V4ZWN1dGlvbkRUTyA9IHtcblx0XHRcdHByb2Nlc3M6IHZhbHVlLnByb2Nlc3MsXG5cdFx0XHRhcmdzOiB2YWx1ZS5hcmdzXG5cdFx0fTtcblx0XHRpZiAodmFsdWUub3B0aW9ucykge1xuXHRcdFx0cmVzdWx0Lm9wdGlvbnMgPSBQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTy5mcm9tKHZhbHVlLm9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE8pOiB0eXBlcy5Qcm9jZXNzRXhlY3V0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Qcm9jZXNzRXhlY3V0aW9uKHZhbHVlLnByb2Nlc3MsIHZhbHVlLmFyZ3MsIHZhbHVlLm9wdGlvbnMpO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyk6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPKTogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5uYW1lc3BhY2UgU2hlbGxFeGVjdXRpb25EVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gaXModmFsdWU6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTyB8IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPIHwgdGFza3MuSUN1c3RvbUV4ZWN1dGlvbkRUTyB8IHVuZGVmaW5lZCk6IHZhbHVlIGlzIHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTyB7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyB0YXNrcy5JU2hlbGxFeGVjdXRpb25EVE87XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlICYmICghIWNhbmRpZGF0ZS5jb21tYW5kTGluZSB8fCAhIWNhbmRpZGF0ZS5jb21tYW5kKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLlNoZWxsRXhlY3V0aW9uKTogdGFza3MuSVNoZWxsRXhlY3V0aW9uRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiB0YXNrcy5JU2hlbGxFeGVjdXRpb25EVE8gPSB7XG5cdFx0fTtcblx0XHRpZiAodmFsdWUuY29tbWFuZExpbmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LmNvbW1hbmRMaW5lID0gdmFsdWUuY29tbWFuZExpbmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5jb21tYW5kID0gdmFsdWUuY29tbWFuZDtcblx0XHRcdHJlc3VsdC5hcmdzID0gdmFsdWUuYXJncztcblx0XHR9XG5cdFx0aWYgKHZhbHVlLm9wdGlvbnMpIHtcblx0XHRcdHJlc3VsdC5vcHRpb25zID0gU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPLmZyb20odmFsdWUub3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JU2hlbGxFeGVjdXRpb25EVE8pOiB0eXBlcy5TaGVsbEV4ZWN1dGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgfHwgKHZhbHVlLmNvbW1hbmQgPT09IHVuZGVmaW5lZCAmJiB2YWx1ZS5jb21tYW5kTGluZSA9PT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmNvbW1hbmRMaW5lKSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLlNoZWxsRXhlY3V0aW9uKHZhbHVlLmNvbW1hbmRMaW5lLCB2YWx1ZS5vcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5TaGVsbEV4ZWN1dGlvbih2YWx1ZS5jb21tYW5kISwgdmFsdWUuYXJncyA/IHZhbHVlLmFyZ3MgOiBbXSwgdmFsdWUub3B0aW9ucyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ3VzdG9tRXhlY3V0aW9uRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB0YXNrcy5JU2hlbGxFeGVjdXRpb25EVE8gfCB0YXNrcy5JUHJvY2Vzc0V4ZWN1dGlvbkRUTyB8IHRhc2tzLklDdXN0b21FeGVjdXRpb25EVE8gfCB1bmRlZmluZWQpOiB2YWx1ZSBpcyB0YXNrcy5JQ3VzdG9tRXhlY3V0aW9uRFRPIHtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIHRhc2tzLklDdXN0b21FeGVjdXRpb25EVE87XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlICYmIGNhbmRpZGF0ZS5jdXN0b21FeGVjdXRpb24gPT09ICdjdXN0b21FeGVjdXRpb24nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5DdXN0b21FeGVjdXRpb24pOiB0YXNrcy5JQ3VzdG9tRXhlY3V0aW9uRFRPIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VzdG9tRXhlY3V0aW9uOiAnY3VzdG9tRXhlY3V0aW9uJ1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odGFza0lkOiBzdHJpbmcsIHByb3ZpZGVkQ3VzdG9tRXhldXRpb25zOiBNYXA8c3RyaW5nLCB0eXBlcy5DdXN0b21FeGVjdXRpb24+KTogdHlwZXMuQ3VzdG9tRXhlY3V0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gcHJvdmlkZWRDdXN0b21FeGV1dGlvbnMuZ2V0KHRhc2tJZCk7XG5cdH1cbn1cblxuXG5leHBvcnQgbmFtZXNwYWNlIFRhc2tIYW5kbGVEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdHlwZXMuVGFzaywgd29ya3NwYWNlU2VydmljZT86IElFeHRIb3N0V29ya3NwYWNlKTogdGFza3MuSVRhc2tIYW5kbGVEVE8ge1xuXHRcdGxldCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBzdHJpbmc7XG5cdFx0aWYgKHZhbHVlLnNjb3BlICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHZhbHVlLnNjb3BlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0Zm9sZGVyID0gdmFsdWUuc2NvcGUudXJpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUuc2NvcGUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgdmFsdWUuc2NvcGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpZiAoKHZhbHVlLnNjb3BlID09PSB0eXBlcy5UYXNrU2NvcGUuV29ya3NwYWNlKSAmJiB3b3Jrc3BhY2VTZXJ2aWNlICYmIHdvcmtzcGFjZVNlcnZpY2Uud29ya3NwYWNlRmlsZSkge1xuXHRcdFx0XHRmb2xkZXIgPSB3b3Jrc3BhY2VTZXJ2aWNlLndvcmtzcGFjZUZpbGU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb2xkZXIgPSBVU0VSX1RBU0tTX0dST1VQX0tFWTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB2YWx1ZS5faWQhLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiBmb2xkZXIhXG5cdFx0fTtcblx0fVxufVxubmFtZXNwYWNlIFRhc2tHcm91cERUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuVGFza0dyb3VwKTogdGFza3MuSVRhc2tHcm91cERUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IF9pZDogdmFsdWUuaWQsIGlzRGVmYXVsdDogdmFsdWUuaXNEZWZhdWx0IH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21NYW55KHRhc2tzOiB2c2NvZGUuVGFza1tdLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IHRhc2tzLklUYXNrRFRPW10ge1xuXHRcdGlmICh0YXNrcyA9PT0gdW5kZWZpbmVkIHx8IHRhc2tzID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogdGFza3MuSVRhc2tEVE9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0Y29uc3QgY29udmVydGVkID0gZnJvbSh0YXNrLCBleHRlbnNpb24pO1xuXHRcdFx0aWYgKGNvbnZlcnRlZCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChjb252ZXJ0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5UYXNrLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IHRhc2tzLklUYXNrRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGV4ZWN1dGlvbjogdGFza3MuSVNoZWxsRXhlY3V0aW9uRFRPIHwgdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE8gfCB0YXNrcy5JQ3VzdG9tRXhlY3V0aW9uRFRPIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh2YWx1ZS5leGVjdXRpb24gaW5zdGFuY2VvZiB0eXBlcy5Qcm9jZXNzRXhlY3V0aW9uKSB7XG5cdFx0XHRleGVjdXRpb24gPSBQcm9jZXNzRXhlY3V0aW9uRFRPLmZyb20odmFsdWUuZXhlY3V0aW9uKTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlLmV4ZWN1dGlvbiBpbnN0YW5jZW9mIHR5cGVzLlNoZWxsRXhlY3V0aW9uKSB7XG5cdFx0XHRleGVjdXRpb24gPSBTaGVsbEV4ZWN1dGlvbkRUTy5mcm9tKHZhbHVlLmV4ZWN1dGlvbik7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZS5leGVjdXRpb24gJiYgdmFsdWUuZXhlY3V0aW9uIGluc3RhbmNlb2YgdHlwZXMuQ3VzdG9tRXhlY3V0aW9uKSB7XG5cdFx0XHRleGVjdXRpb24gPSBDdXN0b21FeGVjdXRpb25EVE8uZnJvbSg8dHlwZXMuQ3VzdG9tRXhlY3V0aW9uPnZhbHVlLmV4ZWN1dGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmaW5pdGlvbjogdGFza3MuSVRhc2tEZWZpbml0aW9uRFRPIHwgdW5kZWZpbmVkID0gVGFza0RlZmluaXRpb25EVE8uZnJvbSh2YWx1ZS5kZWZpbml0aW9uKTtcblx0XHRsZXQgc2NvcGU6IG51bWJlciB8IFVyaUNvbXBvbmVudHM7XG5cdFx0aWYgKHZhbHVlLnNjb3BlKSB7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlLnNjb3BlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRzY29wZSA9IHZhbHVlLnNjb3BlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcGUgPSB2YWx1ZS5zY29wZS51cmk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRvIGNvbnRpbnVlIHRvIHN1cHBvcnQgdGhlIGRlcHJlY2F0ZWQgdGFzayBjb25zdHJ1Y3RvciB0aGF0IGRvZXNuJ3QgdGFrZSBhIHNjb3BlLCB3ZSBtdXN0IGFkZCBhIHNjb3BlIGhlcmU6XG5cdFx0XHRzY29wZSA9IHR5cGVzLlRhc2tTY29wZS5Xb3Jrc3BhY2U7XG5cdFx0fVxuXHRcdGlmICghZGVmaW5pdGlvbiB8fCAhc2NvcGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogdGFza3MuSVRhc2tEVE8gPSB7XG5cdFx0XHRfaWQ6ICh2YWx1ZSBhcyB0eXBlcy5UYXNrKS5faWQhLFxuXHRcdFx0ZGVmaW5pdGlvbixcblx0XHRcdG5hbWU6IHZhbHVlLm5hbWUsXG5cdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0XHRsYWJlbDogdmFsdWUuc291cmNlLFxuXHRcdFx0XHRzY29wZTogc2NvcGVcblx0XHRcdH0sXG5cdFx0XHRleGVjdXRpb246IGV4ZWN1dGlvbiEsXG5cdFx0XHRpc0JhY2tncm91bmQ6IHZhbHVlLmlzQmFja2dyb3VuZCxcblx0XHRcdGdyb3VwOiBUYXNrR3JvdXBEVE8uZnJvbSh2YWx1ZS5ncm91cCBhcyB2c2NvZGUuVGFza0dyb3VwKSxcblx0XHRcdHByZXNlbnRhdGlvbk9wdGlvbnM6IFRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPLmZyb20odmFsdWUucHJlc2VudGF0aW9uT3B0aW9ucyksXG5cdFx0XHRwcm9ibGVtTWF0Y2hlcnM6IGFzQXJyYXkodmFsdWUucHJvYmxlbU1hdGNoZXJzKSxcblx0XHRcdGhhc0RlZmluZWRNYXRjaGVyczogKHZhbHVlIGFzIHR5cGVzLlRhc2spLmhhc0RlZmluZWRNYXRjaGVycyxcblx0XHRcdHJ1bk9wdGlvbnM6IHZhbHVlLnJ1bk9wdGlvbnMgPyB2YWx1ZS5ydW5PcHRpb25zIDogeyByZWV2YWx1YXRlT25SZXJ1bjogdHJ1ZSB9LFxuXHRcdFx0ZGV0YWlsOiB2YWx1ZS5kZXRhaWxcblx0XHR9O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JVGFza0RUTyB8IHVuZGVmaW5lZCwgd29ya3NwYWNlOiBJRXh0SG9zdFdvcmtzcGFjZVByb3ZpZGVyLCBwcm92aWRlZEN1c3RvbUV4ZXV0aW9uczogTWFwPHN0cmluZywgdHlwZXMuQ3VzdG9tRXhlY3V0aW9uPik6IFByb21pc2U8dHlwZXMuVGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZXhlY3V0aW9uOiB0eXBlcy5TaGVsbEV4ZWN1dGlvbiB8IHR5cGVzLlByb2Nlc3NFeGVjdXRpb24gfCB0eXBlcy5DdXN0b21FeGVjdXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKFByb2Nlc3NFeGVjdXRpb25EVE8uaXModmFsdWUuZXhlY3V0aW9uKSkge1xuXHRcdFx0ZXhlY3V0aW9uID0gUHJvY2Vzc0V4ZWN1dGlvbkRUTy50byh2YWx1ZS5leGVjdXRpb24pO1xuXHRcdH0gZWxzZSBpZiAoU2hlbGxFeGVjdXRpb25EVE8uaXModmFsdWUuZXhlY3V0aW9uKSkge1xuXHRcdFx0ZXhlY3V0aW9uID0gU2hlbGxFeGVjdXRpb25EVE8udG8odmFsdWUuZXhlY3V0aW9uKTtcblx0XHR9IGVsc2UgaWYgKEN1c3RvbUV4ZWN1dGlvbkRUTy5pcyh2YWx1ZS5leGVjdXRpb24pKSB7XG5cdFx0XHRleGVjdXRpb24gPSBDdXN0b21FeGVjdXRpb25EVE8udG8odmFsdWUuX2lkLCBwcm92aWRlZEN1c3RvbUV4ZXV0aW9ucyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlZmluaXRpb246IHZzY29kZS5UYXNrRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9IFRhc2tEZWZpbml0aW9uRFRPLnRvKHZhbHVlLmRlZmluaXRpb24pO1xuXHRcdGxldCBzY29wZTogdnNjb2RlLlRhc2tTY29wZS5HbG9iYWwgfCB2c2NvZGUuVGFza1Njb3BlLldvcmtzcGFjZSB8IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHZhbHVlLnNvdXJjZSkge1xuXHRcdFx0aWYgKHZhbHVlLnNvdXJjZS5zY29wZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUuc291cmNlLnNjb3BlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHNjb3BlID0gdmFsdWUuc291cmNlLnNjb3BlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNjb3BlID0gYXdhaXQgd29ya3NwYWNlLnJlc29sdmVXb3Jrc3BhY2VGb2xkZXIoVVJJLnJldml2ZSh2YWx1ZS5zb3VyY2Uuc2NvcGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcGUgPSB0eXBlcy5UYXNrU2NvcGUuV29ya3NwYWNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWRlZmluaXRpb24gfHwgIXNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuVGFzayhkZWZpbml0aW9uLCBzY29wZSwgdmFsdWUubmFtZSEsIHZhbHVlLnNvdXJjZS5sYWJlbCwgZXhlY3V0aW9uLCB2YWx1ZS5wcm9ibGVtTWF0Y2hlcnMpO1xuXHRcdGlmICh2YWx1ZS5pc0JhY2tncm91bmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LmlzQmFja2dyb3VuZCA9IHZhbHVlLmlzQmFja2dyb3VuZDtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmdyb3VwICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5ncm91cCA9IHR5cGVzLlRhc2tHcm91cC5mcm9tKHZhbHVlLmdyb3VwLl9pZCk7XG5cdFx0XHRpZiAocmVzdWx0Lmdyb3VwICYmIHZhbHVlLmdyb3VwLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRyZXN1bHQuZ3JvdXAgPSBuZXcgdHlwZXMuVGFza0dyb3VwKHJlc3VsdC5ncm91cC5pZCwgcmVzdWx0Lmdyb3VwLmxhYmVsKTtcblx0XHRcdFx0aWYgKHZhbHVlLmdyb3VwLmlzRGVmYXVsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5ncm91cC5pc0RlZmF1bHQgPSB2YWx1ZS5ncm91cC5pc0RlZmF1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZhbHVlLnByZXNlbnRhdGlvbk9wdGlvbnMpIHtcblx0XHRcdHJlc3VsdC5wcmVzZW50YXRpb25PcHRpb25zID0gVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8udG8odmFsdWUucHJlc2VudGF0aW9uT3B0aW9ucykhO1xuXHRcdH1cblx0XHRpZiAodmFsdWUucnVuT3B0aW9ucykge1xuXHRcdFx0cmVzdWx0LnJ1bk9wdGlvbnMgPSB2YWx1ZS5ydW5PcHRpb25zO1xuXHRcdH1cblx0XHRpZiAodmFsdWUuX2lkKSB7XG5cdFx0XHRyZXN1bHQuX2lkID0gdmFsdWUuX2lkO1xuXHRcdH1cblx0XHRpZiAodmFsdWUuZGV0YWlsKSB7XG5cdFx0XHRyZXN1bHQuZGV0YWlsID0gdmFsdWUuZGV0YWlsO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrRmlsdGVyRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5UYXNrRmlsdGVyIHwgdW5kZWZpbmVkKTogdGFza3MuSVRhc2tGaWx0ZXJEVE8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogdGFza3MuSVRhc2tGaWx0ZXJEVE8pOiB2c2NvZGUuVGFza0ZpbHRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgdmFsdWUpO1xuXHR9XG59XG5cbmNsYXNzIFRhc2tFeGVjdXRpb25JbXBsIGltcGxlbWVudHMgdnNjb2RlLlRhc2tFeGVjdXRpb24ge1xuXG5cdHJlYWRvbmx5ICN0YXNrczogRXh0SG9zdFRhc2tCYXNlO1xuXHRwcml2YXRlIF90ZXJtaW5hbDogdnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHRhc2tzOiBFeHRIb3N0VGFza0Jhc2UsIHJlYWRvbmx5IF9pZDogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IF90YXNrOiB2c2NvZGUuVGFzaykge1xuXHRcdHRoaXMuI3Rhc2tzID0gdGFza3M7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRhc2soKTogdnNjb2RlLlRhc2sge1xuXHRcdHJldHVybiB0aGlzLl90YXNrO1xuXHR9XG5cblx0cHVibGljIHRlcm1pbmF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLiN0YXNrcy50ZXJtaW5hdGVUYXNrKHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGZpcmVEaWRTdGFydFByb2Nlc3ModmFsdWU6IHRhc2tzLklUYXNrUHJvY2Vzc1N0YXJ0ZWREVE8pOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyBmaXJlRGlkRW5kUHJvY2Vzcyh2YWx1ZTogdGFza3MuSVRhc2tQcm9jZXNzRW5kZWREVE8pOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGVybWluYWwoKTogdnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWw7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHRlcm1pbmFsKHRlcm06IHZzY29kZS5UZXJtaW5hbCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3Rlcm1pbmFsID0gdGVybTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhbmRsZXJEYXRhIHtcblx0dHlwZTogc3RyaW5nO1xuXHRwcm92aWRlcjogdnNjb2RlLlRhc2tQcm92aWRlcjtcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBFeHRIb3N0VGFza0Jhc2UgaW1wbGVtZW50cyBFeHRIb3N0VGFza1NoYXBlLCBJRXh0SG9zdFRhc2sge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZFRhc2tTaGFwZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF93b3Jrc3BhY2VQcm92aWRlcjogSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlcjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM7XG5cdHByb3RlY3RlZCByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElFeHRIb3N0Q29uZmlndXJhdGlvbjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2RlcHJlY2F0aW9uU2VydmljZTogSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2U7XG5cdHByb3RlY3RlZCBfaGFuZGxlQ291bnRlcjogbnVtYmVyO1xuXHRwcm90ZWN0ZWQgX2hhbmRsZXJzOiBNYXA8bnVtYmVyLCBIYW5kbGVyRGF0YT47XG5cdHByb3RlY3RlZCBfdGFza0V4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIFRhc2tFeGVjdXRpb25JbXBsPjtcblx0cHJvdGVjdGVkIF90YXNrRXhlY3V0aW9uUHJvbWlzZXM6IE1hcDxzdHJpbmcsIFByb21pc2U8VGFza0V4ZWN1dGlvbkltcGw+Pjtcblx0cHJvdGVjdGVkIF9wcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMyOiBNYXA8c3RyaW5nLCB0eXBlcy5DdXN0b21FeGVjdXRpb24+O1xuXHRwcml2YXRlIF9ub3RQcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnM6IFNldDxzdHJpbmc+OyAvLyBVc2VkIGZvciBjdXN0b20gZXhlY3V0aW9ucyB0YXNrcyB0aGF0IGFyZSBjcmVhdGVkIGFuZCBydW4gdGhyb3VnaCBleGVjdXRlVGFzay5cblx0cHJvdGVjdGVkIF9hY3RpdmVDdXN0b21FeGVjdXRpb25zMjogTWFwPHN0cmluZywgdHlwZXMuQ3VzdG9tRXhlY3V0aW9uPjtcblx0cHJpdmF0ZSBfbGFzdFN0YXJ0ZWRUYXNrOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRFeGVjdXRlVGFzazogRW1pdHRlcjx2c2NvZGUuVGFza1N0YXJ0RXZlbnQ+ID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhc2tTdGFydEV2ZW50PigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVGVybWluYXRlVGFzazogRW1pdHRlcjx2c2NvZGUuVGFza0VuZEV2ZW50PiA9IG5ldyBFbWl0dGVyPHZzY29kZS5UYXNrRW5kRXZlbnQ+KCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFRhc2tQcm9jZXNzU3RhcnRlZDogRW1pdHRlcjx2c2NvZGUuVGFza1Byb2Nlc3NTdGFydEV2ZW50PiA9IG5ldyBFbWl0dGVyPHZzY29kZS5UYXNrUHJvY2Vzc1N0YXJ0RXZlbnQ+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRUYXNrUHJvY2Vzc0VuZGVkOiBFbWl0dGVyPHZzY29kZS5UYXNrUHJvY2Vzc0VuZEV2ZW50PiA9IG5ldyBFbWl0dGVyPHZzY29kZS5UYXNrUHJvY2Vzc0VuZEV2ZW50PigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkU3RhcnRUYXNrUHJvYmxlbU1hdGNoZXJzOiBFbWl0dGVyPHZzY29kZS5UYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRXZlbnQ+ID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWRFdmVudD4oKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnM6IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRXZlbnQ+ID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRXZlbnQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIGluaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSxcblx0XHRASUV4dEhvc3RXb3Jrc3BhY2Ugd29ya3NwYWNlU2VydmljZTogSUV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0QElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyBlZGl0b3JTZXJ2aWNlOiBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0QElFeHRIb3N0Q29uZmlndXJhdGlvbiBjb25maWd1cmF0aW9uU2VydmljZTogSUV4dEhvc3RDb25maWd1cmF0aW9uLFxuXHRcdEBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSBleHRIb3N0VGVybWluYWxTZXJ2aWNlOiBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlIGRlcHJlY2F0aW9uU2VydmljZTogSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUYXNrKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VQcm92aWRlciA9IHdvcmtzcGFjZVNlcnZpY2U7XG5cdFx0dGhpcy5fZWRpdG9yU2VydmljZSA9IGVkaXRvclNlcnZpY2U7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UgPSBleHRIb3N0VGVybWluYWxTZXJ2aWNlO1xuXHRcdHRoaXMuX2hhbmRsZUNvdW50ZXIgPSAwO1xuXHRcdHRoaXMuX2hhbmRsZXJzID0gbmV3IE1hcDxudW1iZXIsIEhhbmRsZXJEYXRhPigpO1xuXHRcdHRoaXMuX3Rhc2tFeGVjdXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFRhc2tFeGVjdXRpb25JbXBsPigpO1xuXHRcdHRoaXMuX3Rhc2tFeGVjdXRpb25Qcm9taXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPFRhc2tFeGVjdXRpb25JbXBsPj4oKTtcblx0XHR0aGlzLl9wcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMyID0gbmV3IE1hcDxzdHJpbmcsIHR5cGVzLkN1c3RvbUV4ZWN1dGlvbj4oKTtcblx0XHR0aGlzLl9ub3RQcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLl9hY3RpdmVDdXN0b21FeGVjdXRpb25zMiA9IG5ldyBNYXA8c3RyaW5nLCB0eXBlcy5DdXN0b21FeGVjdXRpb24+KCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy5fZGVwcmVjYXRpb25TZXJ2aWNlID0gZGVwcmVjYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclN1cHBvcnRlZEV4ZWN1dGlvbnModHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUYXNrUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHR5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UYXNrUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubmV4dEhhbmRsZSgpO1xuXHRcdHRoaXMuX2hhbmRsZXJzLnNldChoYW5kbGUsIHsgdHlwZSwgcHJvdmlkZXIsIGV4dGVuc2lvbiB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJUYXNrUHJvdmlkZXIoaGFuZGxlLCB0eXBlKTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlclRhc2tQcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVGFza1N5c3RlbShzY2hlbWU6IHN0cmluZywgaW5mbzogdGFza3MuSVRhc2tTeXN0ZW1JbmZvRFRPKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyVGFza1N5c3RlbShzY2hlbWUsIGluZm8pO1xuXHR9XG5cblx0cHVibGljIGZldGNoVGFza3MoZmlsdGVyPzogdnNjb2RlLlRhc2tGaWx0ZXIpOiBQcm9taXNlPHZzY29kZS5UYXNrW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGZldGNoVGFza3MoVGFza0ZpbHRlckRUTy5mcm9tKGZpbHRlcikpLnRoZW4oYXN5bmMgKHZhbHVlcykgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuVGFza1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRjb25zdCB0YXNrID0gYXdhaXQgVGFza0RUTy50byh2YWx1ZSwgdGhpcy5fd29ya3NwYWNlUHJvdmlkZXIsIHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIpO1xuXHRcdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0IGV4ZWN1dGVUYXNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0YXNrOiB2c2NvZGUuVGFzayk6IFByb21pc2U8dnNjb2RlLlRhc2tFeGVjdXRpb24+O1xuXG5cdHB1YmxpYyBnZXQgdGFza0V4ZWN1dGlvbnMoKTogdnNjb2RlLlRhc2tFeGVjdXRpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuVGFza0V4ZWN1dGlvbltdID0gW107XG5cdFx0dGhpcy5fdGFza0V4ZWN1dGlvbnMuZm9yRWFjaCh2YWx1ZSA9PiByZXN1bHQucHVzaCh2YWx1ZSkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgdGVybWluYXRlVGFzayhleGVjdXRpb246IHZzY29kZS5UYXNrRXhlY3V0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCEoZXhlY3V0aW9uIGluc3RhbmNlb2YgVGFza0V4ZWN1dGlvbkltcGwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHZhbGlkIHRhc2sgZXhlY3V0aW9uIHByb3ZpZGVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kdGVybWluYXRlVGFzaygoZXhlY3V0aW9uIGFzIFRhc2tFeGVjdXRpb25JbXBsKS5faWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZFN0YXJ0VGFzaygpOiBFdmVudDx2c2NvZGUuVGFza1N0YXJ0RXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRFeGVjdXRlVGFzay5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkb25EaWRTdGFydFRhc2soZXhlY3V0aW9uOiB0YXNrcy5JVGFza0V4ZWN1dGlvbkRUTywgdGVybWluYWxJZDogbnVtYmVyLCByZXNvbHZlZERlZmluaXRpb246IHRhc2tzLklUYXNrRGVmaW5pdGlvbkRUTyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1c3RvbUV4ZWN1dGlvbjogdHlwZXMuQ3VzdG9tRXhlY3V0aW9uIHwgdW5kZWZpbmVkID0gdGhpcy5fcHJvdmlkZWRDdXN0b21FeGVjdXRpb25zMi5nZXQoZXhlY3V0aW9uLmlkKTtcblx0XHRpZiAoY3VzdG9tRXhlY3V0aW9uKSB7XG5cdFx0XHQvLyBDbG9uZSB0aGUgY3VzdG9tIGV4ZWN1dGlvbiB0byBrZWVwIHRoZSBvcmlnaW5hbCB1bnRvdWNoZWQuIFRoaXMgaXMgaW1wb3J0YW50IGZvciBtdWx0aXBsZSBydW5zIG9mIHRoZSBzYW1lIHRhc2suXG5cdFx0XHR0aGlzLl9hY3RpdmVDdXN0b21FeGVjdXRpb25zMi5zZXQoZXhlY3V0aW9uLmlkLCBjdXN0b21FeGVjdXRpb24pO1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLmF0dGFjaFB0eVRvVGVybWluYWwodGVybWluYWxJZCwgYXdhaXQgY3VzdG9tRXhlY3V0aW9uLmNhbGxiYWNrKHJlc29sdmVkRGVmaW5pdGlvbikpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0U3RhcnRlZFRhc2sgPSBleGVjdXRpb24uaWQ7XG5cblx0XHRjb25zdCB0YXNrRXhlY3V0aW9uID0gYXdhaXQgdGhpcy5nZXRUYXNrRXhlY3V0aW9uKGV4ZWN1dGlvbik7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0VGVybWluYWxCeUlkKHRlcm1pbmFsSWQpPy52YWx1ZTtcblx0XHRpZiAodGFza0V4ZWN1dGlvbikge1xuXHRcdFx0dGFza0V4ZWN1dGlvbi50ZXJtaW5hbCA9IHRlcm1pbmFsO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkRXhlY3V0ZVRhc2suZmlyZSh7XG5cdFx0XHRleGVjdXRpb246IHRhc2tFeGVjdXRpb25cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRFbmRUYXNrKCk6IEV2ZW50PHZzY29kZS5UYXNrRW5kRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRUZXJtaW5hdGVUYXNrLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRPbkRpZEVuZFRhc2soZXhlY3V0aW9uOiB0YXNrcy5JVGFza0V4ZWN1dGlvbkRUTyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fdGFza0V4ZWN1dGlvblByb21pc2VzLmhhcyhleGVjdXRpb24uaWQpKSB7XG5cdFx0XHQvLyBFdmVudCBhbHJlYWR5IGZpcmVkIGJ5IHRoZSBtYWluIHRocmVhZFxuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2NvbW1pdC9hYWY3MzkyMGFlYWUxNzEwOTZkMjA1ZWZiMmM1ODgwNGEzMmI2ODQ2XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IF9leGVjdXRpb24gPSBhd2FpdCB0aGlzLmdldFRhc2tFeGVjdXRpb24oZXhlY3V0aW9uKTtcblx0XHR0aGlzLl90YXNrRXhlY3V0aW9uUHJvbWlzZXMuZGVsZXRlKGV4ZWN1dGlvbi5pZCk7XG5cdFx0dGhpcy5fdGFza0V4ZWN1dGlvbnMuZGVsZXRlKGV4ZWN1dGlvbi5pZCk7XG5cdFx0dGhpcy5jdXN0b21FeGVjdXRpb25Db21wbGV0ZShleGVjdXRpb24pO1xuXHRcdHRoaXMuX29uRGlkVGVybWluYXRlVGFzay5maXJlKHtcblx0XHRcdGV4ZWN1dGlvbjogX2V4ZWN1dGlvblxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZFN0YXJ0VGFza1Byb2Nlc3MoKTogRXZlbnQ8dnNjb2RlLlRhc2tQcm9jZXNzU3RhcnRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFRhc2tQcm9jZXNzU3RhcnRlZC5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkb25EaWRTdGFydFRhc2tQcm9jZXNzKHZhbHVlOiB0YXNrcy5JVGFza1Byb2Nlc3NTdGFydGVkRFRPKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gYXdhaXQgdGhpcy5nZXRUYXNrRXhlY3V0aW9uKHZhbHVlLmlkKTtcblx0XHR0aGlzLl9vbkRpZFRhc2tQcm9jZXNzU3RhcnRlZC5maXJlKHtcblx0XHRcdGV4ZWN1dGlvbjogZXhlY3V0aW9uLFxuXHRcdFx0cHJvY2Vzc0lkOiB2YWx1ZS5wcm9jZXNzSWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRFbmRUYXNrUHJvY2VzcygpOiBFdmVudDx2c2NvZGUuVGFza1Byb2Nlc3NFbmRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFRhc2tQcm9jZXNzRW5kZWQuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJG9uRGlkRW5kVGFza1Byb2Nlc3ModmFsdWU6IHRhc2tzLklUYXNrUHJvY2Vzc0VuZGVkRFRPKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gYXdhaXQgdGhpcy5nZXRUYXNrRXhlY3V0aW9uKHZhbHVlLmlkKTtcblx0XHR0aGlzLl9vbkRpZFRhc2tQcm9jZXNzRW5kZWQuZmlyZSh7XG5cdFx0XHRleGVjdXRpb246IGV4ZWN1dGlvbixcblx0XHRcdGV4aXRDb2RlOiB2YWx1ZS5leGl0Q29kZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZFN0YXJ0VGFza1Byb2JsZW1NYXRjaGVycygpOiBFdmVudDx2c2NvZGUuVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkU3RhcnRUYXNrUHJvYmxlbU1hdGNoZXJzLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRvbkRpZFN0YXJ0VGFza1Byb2JsZW1NYXRjaGVycyh2YWx1ZTogSVRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWREdG8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXhlY3V0aW9uO1xuXHRcdHRyeSB7XG5cdFx0XHRleGVjdXRpb24gPSBhd2FpdCB0aGlzLmdldFRhc2tFeGVjdXRpb24odmFsdWUuZXhlY3V0aW9uLmlkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gVGhlIHRhc2sgZXhlY3V0aW9uIGlzIG5vdCBhdmFpbGFibGUgYW55bW9yZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkU3RhcnRUYXNrUHJvYmxlbU1hdGNoZXJzLmZpcmUoeyBleGVjdXRpb24gfSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVycygpOiBFdmVudDx2c2NvZGUuVGFza1Byb2JsZW1NYXRjaGVyRW5kZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnMuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJG9uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVycyh2YWx1ZTogSVRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGV4ZWN1dGlvbjtcblx0XHR0cnkge1xuXHRcdFx0ZXhlY3V0aW9uID0gYXdhaXQgdGhpcy5nZXRUYXNrRXhlY3V0aW9uKHZhbHVlLmV4ZWN1dGlvbi5pZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIFRoZSB0YXNrIGV4ZWN1dGlvbiBpcyBub3QgYXZhaWxhYmxlIGFueW1vcmVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnMuZmlyZSh7IGV4ZWN1dGlvbiwgaGFzRXJyb3JzOiB2YWx1ZS5oYXNFcnJvcnMgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcHJvdmlkZVRhc2tzSW50ZXJuYWwodmFsaWRUeXBlczogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0sIHRhc2tJZFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10sIGhhbmRsZXI6IEhhbmRsZXJEYXRhLCB2YWx1ZTogdnNjb2RlLlRhc2tbXSB8IG51bGwgfCB1bmRlZmluZWQpOiB7IHRhc2tzOiB0YXNrcy5JVGFza0RUT1tdOyBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9O1xuXG5cdHB1YmxpYyAkcHJvdmlkZVRhc2tzKGhhbmRsZTogbnVtYmVyLCB2YWxpZFR5cGVzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSk6IFByb21pc2U8dGFza3MuSVRhc2tTZXREVE8+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gdGhpcy5faGFuZGxlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdubyBoYW5kbGVyIGZvdW5kJykpO1xuXHRcdH1cblxuXHRcdC8vIFNldCB1cCBhIGxpc3Qgb2YgdGFzayBJRCBwcm9taXNlcyB0aGF0IHdlIGNhbiB3YWl0IG9uXG5cdFx0Ly8gYmVmb3JlIHJldHVybmluZyB0aGUgcHJvdmlkZWQgdGFza3MuIFRoZSBlbnN1cmVzIHRoYXRcblx0XHQvLyBvdXIgdGFzayBJRHMgYXJlIGNhbGN1bGF0ZWQgZm9yIGFueSBjdXN0b20gZXhlY3V0aW9uIHRhc2tzLlxuXHRcdC8vIEtub3dpbmcgdGhpcyBJRCBhaGVhZCBvZiB0aW1lIGlzIG5lZWRlZCBiZWNhdXNlIHdoZW4gYSB0YXNrXG5cdFx0Ly8gc3RhcnQgZXZlbnQgaXMgZmlyZWQgdGhpcyBpcyB3aGVuIHRoZSBjdXN0b20gZXhlY3V0aW9uIGlzIGNhbGxlZC5cblx0XHQvLyBUaGUgdGFzayBzdGFydCBldmVudCBpcyBhbHNvIHRoZSBmaXJzdCB0aW1lIHdlIHNlZSB0aGUgSUQgZnJvbSB0aGUgbWFpblxuXHRcdC8vIHRocmVhZCwgd2hpY2ggaXMgdG9vIGxhdGUgZm9yIHVzIGJlY2F1c2Ugd2UgbmVlZCB0byBzYXZlIGFuIG1hcFxuXHRcdC8vIGZyb20gYW4gSUQgdG8gdGhlIGN1c3RvbSBleGVjdXRpb24gZnVuY3Rpb24uIChLaW5kIG9mIGEgY2FydCBiZWZvcmUgdGhlIGhvcnNlIHByb2JsZW0pLlxuXHRcdGNvbnN0IHRhc2tJZFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRjb25zdCBmZXRjaFByb21pc2UgPSBhc1Byb21pc2UoKCkgPT4gaGFuZGxlci5wcm92aWRlci5wcm92aWRlVGFza3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZVRhc2tzSW50ZXJuYWwodmFsaWRUeXBlcywgdGFza0lkUHJvbWlzZXMsIGhhbmRsZXIsIHZhbHVlKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuXHRcdFx0ZmV0Y2hQcm9taXNlLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRQcm9taXNlLmFsbCh0YXNrSWRQcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlc29sdmVUYXNrSW50ZXJuYWwocmVzb2x2ZWRUYXNrRFRPOiB0YXNrcy5JVGFza0RUTyk6IFByb21pc2U8dGFza3MuSVRhc2tEVE8gfCB1bmRlZmluZWQ+O1xuXG5cdHB1YmxpYyBhc3luYyAkcmVzb2x2ZVRhc2soaGFuZGxlOiBudW1iZXIsIHRhc2tEVE86IHRhc2tzLklUYXNrRFRPKTogUHJvbWlzZTx0YXNrcy5JVGFza0RUTyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vIGhhbmRsZXIgZm91bmQnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhc2tEVE8uZGVmaW5pdGlvbi50eXBlICE9PSBoYW5kbGVyLnR5cGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZDogVGFzayBvZiB0eXBlIFske3Rhc2tEVE8uZGVmaW5pdGlvbi50eXBlfV0gY2Fubm90IGJlIHJlc29sdmVkIGJ5IHByb3ZpZGVyIG9mIHR5cGUgWyR7aGFuZGxlci50eXBlfV0uYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFzayA9IGF3YWl0IFRhc2tEVE8udG8odGFza0RUTywgdGhpcy5fd29ya3NwYWNlUHJvdmlkZXIsIHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIpO1xuXHRcdGlmICghdGFzaykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkOiBUYXNrIGNhbm5vdCBiZSByZXNvbHZlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZFRhc2sgPSBhd2FpdCBoYW5kbGVyLnByb3ZpZGVyLnJlc29sdmVUYXNrKHRhc2ssIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghcmVzb2x2ZWRUYXNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGVja0RlcHJlY2F0aW9uKHJlc29sdmVkVGFzaywgaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXNvbHZlZFRhc2tEVE86IHRhc2tzLklUYXNrRFRPIHwgdW5kZWZpbmVkID0gVGFza0RUTy5mcm9tKHJlc29sdmVkVGFzaywgaGFuZGxlci5leHRlbnNpb24pO1xuXHRcdGlmICghcmVzb2x2ZWRUYXNrRFRPKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQ6IFRhc2sgY2Fubm90IGJlIHJlc29sdmVkLicpO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvbHZlZFRhc2suZGVmaW5pdGlvbiAhPT0gdGFzay5kZWZpbml0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQ6IFRoZSByZXNvbHZlZCB0YXNrIGRlZmluaXRpb24gbXVzdCBiZSB0aGUgc2FtZSBvYmplY3QgYXMgdGhlIG9yaWdpbmFsIHRhc2sgZGVmaW5pdGlvbi4gVGhlIHRhc2sgZGVmaW5pdGlvbiBjYW5ub3QgYmUgY2hhbmdlZC4nKTtcblx0XHR9XG5cblx0XHRpZiAoQ3VzdG9tRXhlY3V0aW9uRFRPLmlzKHJlc29sdmVkVGFza0RUTy5leGVjdXRpb24pKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZEN1c3RvbUV4ZWN1dGlvbihyZXNvbHZlZFRhc2tEVE8sIHJlc29sdmVkVGFzaywgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMucmVzb2x2ZVRhc2tJbnRlcm5hbChyZXNvbHZlZFRhc2tEVE8pO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0ICRyZXNvbHZlVmFyaWFibGVzKHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHRvUmVzb2x2ZTogeyBwcm9jZXNzPzogeyBuYW1lOiBzdHJpbmc7IGN3ZD86IHN0cmluZzsgcGF0aD86IHN0cmluZyB9OyB2YXJpYWJsZXM6IHN0cmluZ1tdIH0pOiBQcm9taXNlPHsgcHJvY2Vzcz86IHN0cmluZzsgdmFyaWFibGVzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9IH0+O1xuXG5cdHByaXZhdGUgbmV4dEhhbmRsZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9oYW5kbGVDb3VudGVyKys7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgYWRkQ3VzdG9tRXhlY3V0aW9uKHRhc2tEVE86IHRhc2tzLklUYXNrRFRPLCB0YXNrOiB2c2NvZGUuVGFzaywgaXNQcm92aWRlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhc2tJZCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRjcmVhdGVUYXNrSWQodGFza0RUTyk7XG5cdFx0aWYgKCFpc1Byb3ZpZGVkICYmICF0aGlzLl9wcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMyLmhhcyh0YXNrSWQpKSB7XG5cdFx0XHR0aGlzLl9ub3RQcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMuYWRkKHRhc2tJZCk7XG5cdFx0XHQvLyBBbHNvIGFkZCB0byBhY3RpdmUgZXhlY3V0aW9ucyB3aGVuIG5vdCBjb21pbmcgZnJvbSBhIHByb3ZpZGVyIHRvIHByZXZlbnQgdGltaW5nIGlzc3VlLlxuXHRcdFx0dGhpcy5fYWN0aXZlQ3VzdG9tRXhlY3V0aW9uczIuc2V0KHRhc2tJZCwgPHR5cGVzLkN1c3RvbUV4ZWN1dGlvbj50YXNrLmV4ZWN1dGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIuc2V0KHRhc2tJZCwgPHR5cGVzLkN1c3RvbUV4ZWN1dGlvbj50YXNrLmV4ZWN1dGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0VGFza0V4ZWN1dGlvbihleGVjdXRpb246IHRhc2tzLklUYXNrRXhlY3V0aW9uRFRPIHwgc3RyaW5nLCB0YXNrPzogdnNjb2RlLlRhc2spOiBQcm9taXNlPFRhc2tFeGVjdXRpb25JbXBsPiB7XG5cdFx0aWYgKHR5cGVvZiBleGVjdXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCB0YXNrRXhlY3V0aW9uID0gdGhpcy5fdGFza0V4ZWN1dGlvblByb21pc2VzLmdldChleGVjdXRpb24pO1xuXHRcdFx0aWYgKCF0YXNrRXhlY3V0aW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCdVbmV4cGVjdGVkOiBUaGUgc3BlY2lmaWVkIHRhc2sgaXMgbWlzc2luZyBhbiBleGVjdXRpb24nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YXNrRXhlY3V0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogUHJvbWlzZTxUYXNrRXhlY3V0aW9uSW1wbD4gfCB1bmRlZmluZWQgPSB0aGlzLl90YXNrRXhlY3V0aW9uUHJvbWlzZXMuZ2V0KGV4ZWN1dGlvbi5pZCk7XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRsZXQgZXhlY3V0aW9uUHJvbWlzZTogUHJvbWlzZTxUYXNrRXhlY3V0aW9uSW1wbD47XG5cdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHRleGVjdXRpb25Qcm9taXNlID0gVGFza0RUTy50byhleGVjdXRpb24udGFzaywgdGhpcy5fd29ya3NwYWNlUHJvdmlkZXIsIHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIpLnRoZW4odCA9PiB7XG5cdFx0XHRcdGlmICghdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCdVbmV4cGVjdGVkOiBUYXNrIGRvZXMgbm90IGV4aXN0LicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgVGFza0V4ZWN1dGlvbkltcGwodGhpcywgZXhlY3V0aW9uLmlkLCB0KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleGVjdXRpb25Qcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKG5ldyBUYXNrRXhlY3V0aW9uSW1wbCh0aGlzLCBleGVjdXRpb24uaWQsIHRhc2spKTtcblx0XHR9XG5cdFx0dGhpcy5fdGFza0V4ZWN1dGlvblByb21pc2VzLnNldChleGVjdXRpb24uaWQsIGV4ZWN1dGlvblByb21pc2UpO1xuXHRcdHJldHVybiBleGVjdXRpb25Qcm9taXNlLnRoZW4odGFza0V4ZWN1dGlvbiA9PiB7XG5cdFx0XHR0aGlzLl90YXNrRXhlY3V0aW9ucy5zZXQoZXhlY3V0aW9uLmlkLCB0YXNrRXhlY3V0aW9uKTtcblx0XHRcdHJldHVybiB0YXNrRXhlY3V0aW9uO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNoZWNrRGVwcmVjYXRpb24odGFzazogdnNjb2RlLlRhc2ssIGhhbmRsZXI6IEhhbmRsZXJEYXRhKSB7XG5cdFx0Y29uc3QgdFRhc2sgPSAodGFzayBhcyB0eXBlcy5UYXNrKTtcblx0XHRpZiAodFRhc2suX2RlcHJlY2F0ZWQpIHtcblx0XHRcdHRoaXMuX2RlcHJlY2F0aW9uU2VydmljZS5yZXBvcnQoJ1Rhc2suY29uc3RydWN0b3InLCBoYW5kbGVyLmV4dGVuc2lvbiwgJ1VzZSB0aGUgVGFzayBjb25zdHJ1Y3RvciB0aGF0IHRha2VzIGEgYHNjb3BlYCBpbnN0ZWFkLicpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3VzdG9tRXhlY3V0aW9uQ29tcGxldGUoZXhlY3V0aW9uOiB0YXNrcy5JVGFza0V4ZWN1dGlvbkRUTyk6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkNhbGxiYWNrMjogdnNjb2RlLkN1c3RvbUV4ZWN1dGlvbiB8IHVuZGVmaW5lZCA9IHRoaXMuX2FjdGl2ZUN1c3RvbUV4ZWN1dGlvbnMyLmdldChleGVjdXRpb24uaWQpO1xuXHRcdGlmIChleHRlbnNpb25DYWxsYmFjazIpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUN1c3RvbUV4ZWN1dGlvbnMyLmRlbGV0ZShleGVjdXRpb24uaWQpO1xuXHRcdH1cblxuXHRcdC8vIFRlY2huaWNhbGx5IHdlIGRvbid0IHJlYWxseSBuZWVkIHRvIGRvIHRoaXMsIGhvd2V2ZXIsIGlmIGFuIGV4dGVuc2lvblxuXHRcdC8vIGlzIGV4ZWN1dGluZyBhIHRhc2sgdGhyb3VnaCBcImV4ZWN1dGVUYXNrXCIgb3ZlciBhbmQgb3ZlciBhZ2FpblxuXHRcdC8vIHdpdGggZGlmZmVyZW50IHByb3BlcnRpZXMgaW4gdGhlIHRhc2sgZGVmaW5pdGlvbiwgdGhlbiB0aGUgbWFwIG9mIGV4ZWN1dGlvbnNcblx0XHQvLyBjb3VsZCBncm93IGluZGVmaW5pdGVseSwgc29tZXRoaW5nIHdlIGRvbid0IHdhbnQuXG5cdFx0aWYgKHRoaXMuX25vdFByb3ZpZGVkQ3VzdG9tRXhlY3V0aW9ucy5oYXMoZXhlY3V0aW9uLmlkKSAmJiAodGhpcy5fbGFzdFN0YXJ0ZWRUYXNrICE9PSBleGVjdXRpb24uaWQpKSB7XG5cdFx0XHR0aGlzLl9wcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMyLmRlbGV0ZShleGVjdXRpb24uaWQpO1xuXHRcdFx0dGhpcy5fbm90UHJvdmlkZWRDdXN0b21FeGVjdXRpb25zLmRlbGV0ZShleGVjdXRpb24uaWQpO1xuXHRcdH1cblx0XHRjb25zdCBpdGVyYXRvciA9IHRoaXMuX25vdFByb3ZpZGVkQ3VzdG9tRXhlY3V0aW9ucy52YWx1ZXMoKTtcblx0XHRsZXQgaXRlcmF0b3JSZXN1bHQgPSBpdGVyYXRvci5uZXh0KCk7XG5cdFx0d2hpbGUgKCFpdGVyYXRvclJlc3VsdC5kb25lKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2FjdGl2ZUN1c3RvbUV4ZWN1dGlvbnMyLmhhcyhpdGVyYXRvclJlc3VsdC52YWx1ZSkgJiYgKHRoaXMuX2xhc3RTdGFydGVkVGFzayAhPT0gaXRlcmF0b3JSZXN1bHQudmFsdWUpKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIuZGVsZXRlKGl0ZXJhdG9yUmVzdWx0LnZhbHVlKTtcblx0XHRcdFx0dGhpcy5fbm90UHJvdmlkZWRDdXN0b21FeGVjdXRpb25zLmRlbGV0ZShpdGVyYXRvclJlc3VsdC52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpdGVyYXRvclJlc3VsdCA9IGl0ZXJhdG9yLm5leHQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgJGpzb25UYXNrc1N1cHBvcnRlZCgpOiBQcm9taXNlPGJvb2xlYW4+O1xuXG5cdHB1YmxpYyBhYnN0cmFjdCAkZmluZEV4ZWN1dGFibGUoY29tbWFuZDogc3RyaW5nLCBjd2Q/OiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhdGhzPzogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrZXJFeHRIb3N0VGFzayBleHRlbmRzIEV4dEhvc3RUYXNrQmFzZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UsXG5cdFx0QElFeHRIb3N0V29ya3NwYWNlIHdvcmtzcGFjZVNlcnZpY2U6IElFeHRIb3N0V29ya3NwYWNlLFxuXHRcdEBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgZWRpdG9yU2VydmljZTogSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLFxuXHRcdEBJRXh0SG9zdENvbmZpZ3VyYXRpb24gY29uZmlndXJhdGlvblNlcnZpY2U6IElFeHRIb3N0Q29uZmlndXJhdGlvbixcblx0XHRASUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgZXh0SG9zdFRlcm1pbmFsU2VydmljZTogSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZSBkZXByZWNhdGlvblNlcnZpY2U6IElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGV4dEhvc3RScGMsIGluaXREYXRhLCB3b3Jrc3BhY2VTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXh0SG9zdFRlcm1pbmFsU2VydmljZSwgbG9nU2VydmljZSwgZGVwcmVjYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyVGFza1N5c3RlbShTY2hlbWFzLnZzY29kZVJlbW90ZSwge1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSxcblx0XHRcdGF1dGhvcml0eTogJycsXG5cdFx0XHRwbGF0Zm9ybTogUGxhdGZvcm0uUGxhdGZvcm1Ub1N0cmluZyhQbGF0Zm9ybS5QbGF0Zm9ybS5XZWIpXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZXhlY3V0ZVRhc2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRhc2s6IHZzY29kZS5UYXNrKTogUHJvbWlzZTx2c2NvZGUuVGFza0V4ZWN1dGlvbj4ge1xuXHRcdGlmICghdGFzay5leGVjdXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGFza3MgdG8gZXhlY3V0ZSBtdXN0IGluY2x1ZGUgYW4gZXhlY3V0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHRvID0gVGFza0RUTy5mcm9tKHRhc2ssIGV4dGVuc2lvbik7XG5cdFx0aWYgKGR0byA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rhc2sgaXMgbm90IHZhbGlkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhpcyB0YXNrIGlzIGEgY3VzdG9tIGV4ZWN1dGlvbiwgdGhlbiB3ZSBuZWVkIHRvIHNhdmUgaXQgYXdheVxuXHRcdC8vIGluIHRoZSBwcm92aWRlZCBjdXN0b20gZXhlY3V0aW9uIG1hcCB0aGF0IGlzIGNsZWFuZWQgdXAgYWZ0ZXIgdGhlXG5cdFx0Ly8gdGFzayBpcyBleGVjdXRlZC5cblx0XHRpZiAoQ3VzdG9tRXhlY3V0aW9uRFRPLmlzKGR0by5leGVjdXRpb24pKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZEN1c3RvbUV4ZWN1dGlvbihkdG8sIHRhc2ssIGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IE5vdFN1cHBvcnRlZEVycm9yKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWx3YXlzIGdldCB0aGUgdGFzayBleGVjdXRpb24gZmlyc3QgdG8gcHJldmVudCB0aW1pbmcgaXNzdWVzIHdoZW4gcmV0cmlldmluZyBpdCBsYXRlclxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IGF3YWl0IHRoaXMuZ2V0VGFza0V4ZWN1dGlvbihhd2FpdCB0aGlzLl9wcm94eS4kZ2V0VGFza0V4ZWN1dGlvbihkdG8pLCB0YXNrKTtcblx0XHR0aGlzLl9wcm94eS4kZXhlY3V0ZVRhc2soZHRvKS5jYXRjaChlcnJvciA9PiB7IHRocm93IG5ldyBFcnJvcihlcnJvcik7IH0pO1xuXHRcdHJldHVybiBleGVjdXRpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgcHJvdmlkZVRhc2tzSW50ZXJuYWwodmFsaWRUeXBlczogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0sIHRhc2tJZFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10sIGhhbmRsZXI6IEhhbmRsZXJEYXRhLCB2YWx1ZTogdnNjb2RlLlRhc2tbXSB8IG51bGwgfCB1bmRlZmluZWQpOiB7IHRhc2tzOiB0YXNrcy5JVGFza0RUT1tdOyBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IHtcblx0XHRjb25zdCB0YXNrRFRPczogdGFza3MuSVRhc2tEVE9bXSA9IFtdO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuY2hlY2tEZXByZWNhdGlvbih0YXNrLCBoYW5kbGVyKTtcblx0XHRcdFx0aWYgKCF0YXNrLmRlZmluaXRpb24gfHwgIXZhbGlkVHlwZXNbdGFzay5kZWZpbml0aW9uLnR5cGVdKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlID0gdGFzay5zb3VyY2UgPyB0YXNrLnNvdXJjZSA6ICdObyB0YXNrIHNvdXJjZSc7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBUaGUgdGFzayBbJHtzb3VyY2V9LCAke3Rhc2submFtZX1dIHVzZXMgYW4gdW5kZWZpbmVkIHRhc2sgdHlwZS4gVGhlIHRhc2sgd2lsbCBiZSBpZ25vcmVkIGluIHRoZSBmdXR1cmUuYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YXNrRFRPOiB0YXNrcy5JVGFza0RUTyB8IHVuZGVmaW5lZCA9IFRhc2tEVE8uZnJvbSh0YXNrLCBoYW5kbGVyLmV4dGVuc2lvbik7XG5cdFx0XHRcdGlmICh0YXNrRFRPICYmIEN1c3RvbUV4ZWN1dGlvbkRUTy5pcyh0YXNrRFRPLmV4ZWN1dGlvbikpIHtcblx0XHRcdFx0XHR0YXNrRFRPcy5wdXNoKHRhc2tEVE8pO1xuXHRcdFx0XHRcdC8vIFRoZSBJRCBpcyBjYWxjdWxhdGVkIG9uIHRoZSBtYWluIHRocmVhZCB0YXNrIHNpZGUsIHNvLCBsZXQncyBjYWxsIGludG8gaXQgaGVyZS5cblx0XHRcdFx0XHQvLyBXZSBuZWVkIHRoZSB0YXNrIGlkJ3MgcHJlLWNvbXB1dGVkIGZvciBjdXN0b20gdGFzayBleGVjdXRpb25zIGJlY2F1c2Ugd2hlbiBPbkRpZFN0YXJ0VGFza1xuXHRcdFx0XHRcdC8vIGlzIGludm9rZWQsIHdlIGhhdmUgdG8gYmUgYWJsZSB0byBtYXAgaXQgYmFjayB0byBvdXIgZGF0YS5cblx0XHRcdFx0XHR0YXNrSWRQcm9taXNlcy5wdXNoKHRoaXMuYWRkQ3VzdG9tRXhlY3V0aW9uKHRhc2tEVE8sIHRhc2ssIHRydWUpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ09ubHkgY3VzdG9tIGV4ZWN1dGlvbiB0YXNrcyBzdXBwb3J0ZWQuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhc2tzOiB0YXNrRFRPcyxcblx0XHRcdGV4dGVuc2lvbjogaGFuZGxlci5leHRlbnNpb25cblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHJlc29sdmVUYXNrSW50ZXJuYWwocmVzb2x2ZWRUYXNrRFRPOiB0YXNrcy5JVGFza0RUTyk6IFByb21pc2U8dGFza3MuSVRhc2tEVE8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoQ3VzdG9tRXhlY3V0aW9uRFRPLmlzKHJlc29sdmVkVGFza0RUTy5leGVjdXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZWRUYXNrRFRPO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ09ubHkgY3VzdG9tIGV4ZWN1dGlvbiB0YXNrcyBzdXBwb3J0ZWQuJyk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHJlc29sdmVWYXJpYWJsZXModXJpQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdG9SZXNvbHZlOiB7IHByb2Nlc3M/OiB7IG5hbWU6IHN0cmluZzsgY3dkPzogc3RyaW5nOyBwYXRoPzogc3RyaW5nIH07IHZhcmlhYmxlczogc3RyaW5nW10gfSk6IFByb21pc2U8eyBwcm9jZXNzPzogc3RyaW5nOyB2YXJpYWJsZXM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gfT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdHByb2Nlc3M6IDx1bmtub3duPnVuZGVmaW5lZCBhcyBzdHJpbmcsXG5cdFx0XHR2YXJpYWJsZXM6IE9iamVjdC5jcmVhdGUobnVsbClcblx0XHR9O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGpzb25UYXNrc1N1cHBvcnRlZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGZpbmRFeGVjdXRhYmxlKGNvbW1hbmQ6IHN0cmluZywgY3dkPzogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXRocz86IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdFRhc2sgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RUYXNrPignSUV4dEhvc3RUYXNrJyk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBZ0IsZUFBZTtBQUUvQixTQUFTLG1CQUEwRDtBQUNuRSxZQUFZLFdBQVc7QUFDdkIsU0FBb0MseUJBQXlCO0FBRzdELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixZQUFZLGNBQWM7QUFDMUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0IseUJBQXlCO0FBQ3BELFNBQVMsZUFBZTtBQXNCeEIs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Q3BCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBZ0Isb0JBQW9CLGlCQUFzRTtBQUN6RyxRQUFJLG1CQUFtQixHQUFHLGdCQUFnQixTQUFTLEdBQUc7QUFDckQsYUFBTztBQUFBLElBQ1IsT0FBTztBQUNOLFdBQUssWUFBWSxLQUFLLHdDQUF3QztBQUFBLElBQy9EO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWEsa0JBQWtCLGVBQThCLFdBQWtLO0FBQzlOLFVBQU0sU0FBUztBQUFBLE1BQ2QsU0FBa0I7QUFBQSxNQUNsQixXQUFXLHVCQUFPLE9BQU8sSUFBSTtBQUFBLElBQzlCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWEsc0JBQXdDO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFhLGdCQUFnQixTQUFpQixLQUEwQixPQUEyRDtBQUNsSSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBaEdhLG9CQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVO0FBa0dOLE1BQU0sZUFBZSxnQkFBOEIsY0FBYzsiLAogICJuYW1lcyI6IFsiVGFza0RlZmluaXRpb25EVE8iLCAiVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8iLCAiUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8iLCAiUHJvY2Vzc0V4ZWN1dGlvbkRUTyIsICJTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8iLCAiU2hlbGxFeGVjdXRpb25EVE8iLCAiQ3VzdG9tRXhlY3V0aW9uRFRPIiwgIlRhc2tIYW5kbGVEVE8iLCAiVGFza0dyb3VwRFRPIiwgIlRhc2tEVE8iLCAidGFza3MiLCAiVGFza0ZpbHRlckRUTyJdCn0K
