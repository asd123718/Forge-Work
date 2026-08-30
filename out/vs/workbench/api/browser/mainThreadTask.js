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
import * as nls from "../../../nls.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as Types from "../../../base/common/types.js";
import * as Platform from "../../../base/common/platform.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import {
  ContributedTask,
  ConfiguringTask,
  CommandOptions,
  RuntimeType,
  CustomTask,
  TaskScope,
  TaskSourceKind,
  TaskDefinition,
  PresentationOptions,
  RunOptions
} from "../../contrib/tasks/common/tasks.js";
import { ITaskService } from "../../contrib/tasks/common/taskService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import {
  TaskEventKind
} from "../common/shared/tasks.js";
import { IConfigurationResolverService } from "../../services/configurationResolver/common/configurationResolver.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
import { ConfigurationResolverExpression } from "../../services/configurationResolver/common/configurationResolverExpression.js";
var TaskExecutionDTO;
((TaskExecutionDTO2) => {
  function from(value) {
    return {
      id: value.id,
      task: TaskDTO.from(value.task)
    };
  }
  TaskExecutionDTO2.from = from;
})(TaskExecutionDTO || (TaskExecutionDTO = {}));
var TaskProblemMatcherStartedDto;
((TaskProblemMatcherStartedDto2) => {
  function from(value) {
    return {
      execution: {
        id: value.execution.id,
        task: TaskDTO.from(value.execution.task)
      }
    };
  }
  TaskProblemMatcherStartedDto2.from = from;
})(TaskProblemMatcherStartedDto || (TaskProblemMatcherStartedDto = {}));
var TaskProblemMatcherEndedDto;
((TaskProblemMatcherEndedDto2) => {
  function from(value) {
    return {
      execution: {
        id: value.execution.id,
        task: TaskDTO.from(value.execution.task)
      },
      hasErrors: value.hasErrors
    };
  }
  TaskProblemMatcherEndedDto2.from = from;
})(TaskProblemMatcherEndedDto || (TaskProblemMatcherEndedDto = {}));
var TaskProcessStartedDTO;
((TaskProcessStartedDTO2) => {
  function from(value, processId) {
    return {
      id: value.id,
      processId
    };
  }
  TaskProcessStartedDTO2.from = from;
})(TaskProcessStartedDTO || (TaskProcessStartedDTO = {}));
var TaskProcessEndedDTO;
((TaskProcessEndedDTO2) => {
  function from(value, exitCode) {
    return {
      id: value.id,
      exitCode
    };
  }
  TaskProcessEndedDTO2.from = from;
})(TaskProcessEndedDTO || (TaskProcessEndedDTO = {}));
var TaskDefinitionDTO;
((TaskDefinitionDTO2) => {
  function from(value) {
    const result = Object.assign(/* @__PURE__ */ Object.create(null), value);
    delete result._key;
    return result;
  }
  TaskDefinitionDTO2.from = from;
  function to(value, executeOnly) {
    let result = TaskDefinition.createTaskIdentifier(value, console);
    if (result === void 0 && executeOnly) {
      result = {
        _key: generateUuid(),
        type: "$executeOnly"
      };
    }
    return result;
  }
  TaskDefinitionDTO2.to = to;
})(TaskDefinitionDTO || (TaskDefinitionDTO = {}));
var TaskPresentationOptionsDTO;
((TaskPresentationOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), value);
  }
  TaskPresentationOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return PresentationOptions.defaults;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), PresentationOptions.defaults, value);
  }
  TaskPresentationOptionsDTO2.to = to;
})(TaskPresentationOptionsDTO || (TaskPresentationOptionsDTO = {}));
var RunOptionsDTO;
((RunOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), value);
  }
  RunOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return RunOptions.defaults;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), RunOptions.defaults, value);
  }
  RunOptionsDTO2.to = to;
})(RunOptionsDTO || (RunOptionsDTO = {}));
var ProcessExecutionOptionsDTO;
((ProcessExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return {
      cwd: value.cwd,
      env: value.env
    };
  }
  ProcessExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return CommandOptions.defaults;
    }
    return {
      cwd: value.cwd || CommandOptions.defaults.cwd,
      env: value.env
    };
  }
  ProcessExecutionOptionsDTO2.to = to;
})(ProcessExecutionOptionsDTO || (ProcessExecutionOptionsDTO = {}));
var ProcessExecutionDTO;
((ProcessExecutionDTO2) => {
  function is(value) {
    const candidate = value;
    return candidate && !!candidate.process;
  }
  ProcessExecutionDTO2.is = is;
  function from(value) {
    const process = Types.isString(value.name) ? value.name : value.name.value;
    const args = value.args ? value.args.map((value2) => Types.isString(value2) ? value2 : value2.value) : [];
    const result = {
      process,
      args
    };
    if (value.options) {
      result.options = ProcessExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ProcessExecutionDTO2.from = from;
  function to(value) {
    const result = {
      runtime: RuntimeType.Process,
      name: value.process,
      args: value.args,
      presentation: void 0
    };
    result.options = ProcessExecutionOptionsDTO.to(value.options);
    return result;
  }
  ProcessExecutionDTO2.to = to;
})(ProcessExecutionDTO || (ProcessExecutionDTO = {}));
var ShellExecutionOptionsDTO;
((ShellExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {
      cwd: value.cwd || CommandOptions.defaults.cwd,
      env: value.env
    };
    if (value.shell) {
      result.executable = value.shell.executable;
      result.shellArgs = value.shell.args;
      result.shellQuoting = value.shell.quoting;
    }
    return result;
  }
  ShellExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {
      cwd: value.cwd,
      env: value.env
    };
    if (value.executable) {
      result.shell = {
        executable: value.executable
      };
      if (value.shellArgs) {
        result.shell.args = value.shellArgs;
      }
      if (value.shellQuoting) {
        result.shell.quoting = value.shellQuoting;
      }
    }
    return result;
  }
  ShellExecutionOptionsDTO2.to = to;
})(ShellExecutionOptionsDTO || (ShellExecutionOptionsDTO = {}));
var ShellExecutionDTO;
((ShellExecutionDTO2) => {
  function is(value) {
    const candidate = value;
    return candidate && (!!candidate.commandLine || !!candidate.command);
  }
  ShellExecutionDTO2.is = is;
  function from(value) {
    const result = {};
    if (value.name && Types.isString(value.name) && (value.args === void 0 || value.args === null || value.args.length === 0)) {
      result.commandLine = value.name;
    } else {
      result.command = value.name;
      result.args = value.args;
    }
    if (value.options) {
      result.options = ShellExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ShellExecutionDTO2.from = from;
  function to(value) {
    const result = {
      runtime: RuntimeType.Shell,
      name: value.commandLine ? value.commandLine : value.command,
      args: value.args,
      presentation: void 0
    };
    if (value.options) {
      result.options = ShellExecutionOptionsDTO.to(value.options);
    }
    return result;
  }
  ShellExecutionDTO2.to = to;
})(ShellExecutionDTO || (ShellExecutionDTO = {}));
var CustomExecutionDTO;
((CustomExecutionDTO2) => {
  function is(value) {
    const candidate = value;
    return candidate && candidate.customExecution === "customExecution";
  }
  CustomExecutionDTO2.is = is;
  function from(value) {
    return {
      customExecution: "customExecution"
    };
  }
  CustomExecutionDTO2.from = from;
  function to(value) {
    return {
      runtime: RuntimeType.CustomExecution,
      presentation: void 0
    };
  }
  CustomExecutionDTO2.to = to;
})(CustomExecutionDTO || (CustomExecutionDTO = {}));
var TaskSourceDTO;
((TaskSourceDTO2) => {
  function from(value) {
    const result = {
      label: value.label
    };
    if (value.kind === TaskSourceKind.Extension) {
      result.extensionId = value.extension;
      if (value.workspaceFolder) {
        result.scope = value.workspaceFolder.uri;
      } else {
        result.scope = value.scope;
      }
    } else if (value.kind === TaskSourceKind.Workspace) {
      result.extensionId = "$core";
      result.scope = value.config.workspaceFolder ? value.config.workspaceFolder.uri : TaskScope.Global;
    }
    return result;
  }
  TaskSourceDTO2.from = from;
  function to(value, workspace) {
    let scope;
    let workspaceFolder;
    if (value.scope === void 0 || typeof value.scope === "number" && value.scope !== TaskScope.Global) {
      if (workspace.getWorkspace().folders.length === 0) {
        scope = TaskScope.Global;
        workspaceFolder = void 0;
      } else {
        scope = TaskScope.Folder;
        workspaceFolder = workspace.getWorkspace().folders[0];
      }
    } else if (typeof value.scope === "number") {
      scope = value.scope;
    } else {
      scope = TaskScope.Folder;
      workspaceFolder = workspace.getWorkspaceFolder(URI.revive(value.scope)) ?? void 0;
    }
    const result = {
      kind: TaskSourceKind.Extension,
      label: value.label,
      extension: value.extensionId,
      scope,
      workspaceFolder
    };
    return result;
  }
  TaskSourceDTO2.to = to;
})(TaskSourceDTO || (TaskSourceDTO = {}));
var TaskHandleDTO;
((TaskHandleDTO2) => {
  function is(value) {
    const candidate = value;
    return !!candidate && Types.isString(candidate.id) && !!candidate.workspaceFolder;
  }
  TaskHandleDTO2.is = is;
})(TaskHandleDTO || (TaskHandleDTO = {}));
var TaskDTO;
((TaskDTO2) => {
  function from(task) {
    if (task === void 0 || task === null || !CustomTask.is(task) && !ContributedTask.is(task) && !ConfiguringTask.is(task)) {
      return void 0;
    }
    const result = {
      _id: task._id,
      name: task.configurationProperties.name,
      definition: TaskDefinitionDTO.from(task.getDefinition(true)),
      source: TaskSourceDTO.from(task._source),
      execution: void 0,
      presentationOptions: !ConfiguringTask.is(task) && task.command ? TaskPresentationOptionsDTO.from(task.command.presentation) : void 0,
      isBackground: task.configurationProperties.isBackground,
      problemMatchers: [],
      hasDefinedMatchers: ContributedTask.is(task) ? task.hasDefinedMatchers : false,
      runOptions: RunOptionsDTO.from(task.runOptions)
    };
    result.group = TaskGroupDTO.from(task.configurationProperties.group);
    if (task.configurationProperties.detail) {
      result.detail = task.configurationProperties.detail;
    }
    if (!ConfiguringTask.is(task) && task.command) {
      switch (task.command.runtime) {
        case RuntimeType.Process:
          result.execution = ProcessExecutionDTO.from(task.command);
          break;
        case RuntimeType.Shell:
          result.execution = ShellExecutionDTO.from(task.command);
          break;
        case RuntimeType.CustomExecution:
          result.execution = CustomExecutionDTO.from(task.command);
          break;
      }
    }
    if (task.configurationProperties.problemMatchers) {
      for (const matcher of task.configurationProperties.problemMatchers) {
        if (Types.isString(matcher)) {
          result.problemMatchers.push(matcher);
        }
      }
    }
    return result;
  }
  TaskDTO2.from = from;
  function to(task, workspace, executeOnly, icon, hide) {
    if (!task || typeof task.name !== "string") {
      return void 0;
    }
    let command;
    if (task.execution) {
      if (ShellExecutionDTO.is(task.execution)) {
        command = ShellExecutionDTO.to(task.execution);
      } else if (ProcessExecutionDTO.is(task.execution)) {
        command = ProcessExecutionDTO.to(task.execution);
      } else if (CustomExecutionDTO.is(task.execution)) {
        command = CustomExecutionDTO.to(task.execution);
      }
    }
    if (!command) {
      return void 0;
    }
    command.presentation = TaskPresentationOptionsDTO.to(task.presentationOptions);
    const source = TaskSourceDTO.to(task.source, workspace);
    const label = nls.localize("task.label", "{0}: {1}", source.label, task.name);
    const definition = TaskDefinitionDTO.to(task.definition, executeOnly);
    const id = CustomExecutionDTO.is(task.execution) && task._id ? task._id : `${task.source.extensionId}.${definition._key}`;
    const result = new ContributedTask(
      id,
      // uuidMap.getUUID(identifier)
      source,
      label,
      definition.type,
      definition,
      command,
      task.hasDefinedMatchers,
      RunOptionsDTO.to(task.runOptions),
      {
        name: task.name,
        identifier: label,
        group: task.group,
        isBackground: !!task.isBackground,
        problemMatchers: task.problemMatchers.slice(),
        detail: task.detail,
        icon,
        hide
      }
    );
    return result;
  }
  TaskDTO2.to = to;
})(TaskDTO || (TaskDTO = {}));
var TaskGroupDTO;
((TaskGroupDTO2) => {
  function from(value) {
    if (value === void 0) {
      return void 0;
    }
    return {
      _id: typeof value === "string" ? value : value._id,
      isDefault: typeof value === "string" ? false : typeof value.isDefault === "string" ? false : value.isDefault
    };
  }
  TaskGroupDTO2.from = from;
})(TaskGroupDTO || (TaskGroupDTO = {}));
var TaskFilterDTO;
((TaskFilterDTO2) => {
  function from(value) {
    return value;
  }
  TaskFilterDTO2.from = from;
  function to(value) {
    return value;
  }
  TaskFilterDTO2.to = to;
})(TaskFilterDTO || (TaskFilterDTO = {}));
let MainThreadTask = class extends Disposable {
  constructor(extHostContext, _taskService, _workspaceContextServer, _configurationResolverService) {
    super();
    this._taskService = _taskService;
    this._workspaceContextServer = _workspaceContextServer;
    this._configurationResolverService = _configurationResolverService;
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
    this._providers = /* @__PURE__ */ new Map();
    this._register(this._taskService.onDidStateChange(async (event) => {
      if (event.kind === TaskEventKind.Changed) {
        return;
      }
      const task = event.__task;
      if (event.kind === TaskEventKind.Start) {
        const execution = TaskExecutionDTO.from(task.getTaskExecution());
        let resolvedDefinition = execution.task.definition;
        if (execution.task?.execution && CustomExecutionDTO.is(execution.task.execution) && event.resolvedVariables) {
          const expr = ConfigurationResolverExpression.parse(execution.task.definition);
          for (const replacement of expr.unresolved()) {
            const value = event.resolvedVariables.get(replacement.inner);
            if (value !== void 0) {
              expr.resolve(replacement, value);
            }
          }
          resolvedDefinition = await this._configurationResolverService.resolveAsync(task.getWorkspaceFolder(), expr);
        }
        this._proxy.$onDidStartTask(execution, event.terminalId, resolvedDefinition);
      } else if (event.kind === TaskEventKind.ProcessStarted) {
        this._proxy.$onDidStartTaskProcess(TaskProcessStartedDTO.from(task.getTaskExecution(), event.processId));
      } else if (event.kind === TaskEventKind.ProcessEnded) {
        this._proxy.$onDidEndTaskProcess(TaskProcessEndedDTO.from(task.getTaskExecution(), event.exitCode));
      } else if (event.kind === TaskEventKind.End) {
        this._proxy.$OnDidEndTask(TaskExecutionDTO.from(task.getTaskExecution()));
      } else if (event.kind === TaskEventKind.ProblemMatcherStarted) {
        this._proxy.$onDidStartTaskProblemMatchers(TaskProblemMatcherStartedDto.from({ execution: task.getTaskExecution() }));
      } else if (event.kind === TaskEventKind.ProblemMatcherEnded) {
        this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: false }));
      } else if (event.kind === TaskEventKind.ProblemMatcherFoundErrors) {
        this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: true }));
      }
    }));
  }
  dispose() {
    for (const value of this._providers.values()) {
      value.disposable.dispose();
    }
    this._providers.clear();
    super.dispose();
  }
  $createTaskId(taskDTO) {
    return new Promise((resolve, reject) => {
      const task = TaskDTO.to(taskDTO, this._workspaceContextServer, true);
      if (task) {
        resolve(task._id);
      } else {
        reject(new Error("Task could not be created from DTO"));
      }
    });
  }
  $registerTaskProvider(handle, type) {
    const provider = {
      provideTasks: (validTypes) => {
        return Promise.resolve(this._proxy.$provideTasks(handle, validTypes)).then((value) => {
          const tasks = [];
          for (const dto of value.tasks) {
            const task = TaskDTO.to(dto, this._workspaceContextServer, true);
            if (task) {
              tasks.push(task);
            } else {
              console.error(`Task System: can not convert task: ${JSON.stringify(dto.definition, void 0, 0)}. Task will be dropped`);
            }
          }
          const processedExtension = {
            ...value.extension,
            extensionLocation: URI.revive(value.extension.extensionLocation)
          };
          return {
            tasks,
            extension: processedExtension
          };
        });
      },
      resolveTask: (task) => {
        const dto = TaskDTO.from(task);
        if (dto) {
          dto.name = dto.name === void 0 ? "" : dto.name;
          return Promise.resolve(this._proxy.$resolveTask(handle, dto)).then((resolvedTask) => {
            if (resolvedTask) {
              return TaskDTO.to(resolvedTask, this._workspaceContextServer, true, task.configurationProperties.icon, task.configurationProperties.hide);
            }
            return void 0;
          });
        }
        return Promise.resolve(void 0);
      }
    };
    const disposable = this._taskService.registerTaskProvider(provider, type);
    this._providers.set(handle, { disposable, provider });
    return Promise.resolve(void 0);
  }
  $unregisterTaskProvider(handle) {
    const provider = this._providers.get(handle);
    if (provider) {
      provider.disposable.dispose();
      this._providers.delete(handle);
    }
    return Promise.resolve(void 0);
  }
  $fetchTasks(filter) {
    return this._taskService.tasks(TaskFilterDTO.to(filter)).then((tasks) => {
      const result = [];
      for (const task of tasks) {
        const item = TaskDTO.from(task);
        if (item) {
          result.push(item);
        }
      }
      return result;
    });
  }
  getWorkspace(value) {
    let workspace;
    if (typeof value === "string") {
      workspace = value;
    } else {
      const workspaceObject = this._workspaceContextServer.getWorkspace();
      const uri = URI.revive(value);
      if (workspaceObject.configuration?.toString() === uri.toString()) {
        workspace = workspaceObject;
      } else {
        workspace = this._workspaceContextServer.getWorkspaceFolder(uri);
      }
    }
    return workspace;
  }
  async $getTaskExecution(value) {
    if (TaskHandleDTO.is(value)) {
      const workspace = this.getWorkspace(value.workspaceFolder);
      if (workspace) {
        const task = await this._taskService.getTask(workspace, value.id, true);
        if (task) {
          return {
            id: task._id,
            task: TaskDTO.from(task)
          };
        }
        throw new Error("Task not found");
      } else {
        throw new Error("No workspace folder");
      }
    } else {
      const task = TaskDTO.to(value, this._workspaceContextServer, true);
      return {
        id: task._id,
        task: TaskDTO.from(task)
      };
    }
  }
  // Passing in a TaskHandleDTO will cause the task to get re-resolved, which is important for tasks are coming from the core,
  // such as those gotten from a fetchTasks, since they can have missing configuration properties.
  $executeTask(value) {
    return new Promise((resolve, reject) => {
      if (TaskHandleDTO.is(value)) {
        const workspace = this.getWorkspace(value.workspaceFolder);
        if (workspace) {
          this._taskService.getTask(workspace, value.id, true).then((task) => {
            if (!task) {
              reject(new Error("Task not found"));
            } else {
              const result = {
                id: value.id,
                task: TaskDTO.from(task)
              };
              this._taskService.run(task).then((summary) => {
                if (summary?.exitCode === void 0 || summary.exitCode !== 0) {
                  this._proxy.$OnDidEndTask(result);
                }
              }, (reason) => {
              });
              resolve(result);
            }
          }, (_error) => {
            reject(new Error("Task not found"));
          });
        } else {
          reject(new Error("No workspace folder"));
        }
      } else {
        const task = TaskDTO.to(value, this._workspaceContextServer, true);
        this._taskService.run(task).then(void 0, (reason) => {
        });
        const result = {
          id: task._id,
          task: TaskDTO.from(task)
        };
        resolve(result);
      }
    });
  }
  $customExecutionComplete(id, result) {
    return new Promise((resolve, reject) => {
      this._taskService.getActiveTasks().then((tasks) => {
        for (const task of tasks) {
          if (id === task._id) {
            this._taskService.extensionCallbackTaskComplete(task, result).then((value) => {
              resolve(void 0);
            }, (error) => {
              reject(error);
            });
            return;
          }
        }
        reject(new Error("Task to mark as complete not found"));
      });
    });
  }
  $terminateTask(id) {
    return new Promise((resolve, reject) => {
      this._taskService.getActiveTasks().then((tasks) => {
        for (const task of tasks) {
          if (id === task._id) {
            this._taskService.terminate(task).then((value) => {
              resolve(void 0);
            }, (error) => {
              reject(void 0);
            });
            return;
          }
        }
        reject(new ErrorNoTelemetry("Task to terminate not found"));
      });
    });
  }
  $registerTaskSystem(key, info) {
    let platform;
    switch (info.platform) {
      case "Web":
        platform = Platform.Platform.Web;
        break;
      case "win32":
        platform = Platform.Platform.Windows;
        break;
      case "darwin":
        platform = Platform.Platform.Mac;
        break;
      case "linux":
        platform = Platform.Platform.Linux;
        break;
      default:
        platform = Platform.platform;
    }
    this._taskService.registerTaskSystem(key, {
      platform,
      uriProvider: (path) => {
        return URI.from({ scheme: info.scheme, authority: info.authority, path });
      },
      context: this._extHostContext,
      resolveVariables: (workspaceFolder, toResolve, target) => {
        const vars = [];
        toResolve.variables.forEach((item) => vars.push(item));
        return Promise.resolve(this._proxy.$resolveVariables(workspaceFolder.uri, { process: toResolve.process, variables: vars })).then((values) => {
          const partiallyResolvedVars = Array.from(Object.values(values.variables));
          return new Promise((resolve, reject) => {
            this._configurationResolverService.resolveWithInteraction(workspaceFolder, partiallyResolvedVars, "tasks", void 0, target).then((resolvedVars) => {
              if (!resolvedVars) {
                resolve(void 0);
              }
              const result = {
                process: void 0,
                variables: /* @__PURE__ */ new Map()
              };
              for (let i = 0; i < partiallyResolvedVars.length; i++) {
                const variableName = vars[i].substring(2, vars[i].length - 1);
                if (resolvedVars && values.variables[vars[i]] === vars[i]) {
                  const resolved = resolvedVars.get(variableName);
                  if (typeof resolved === "string") {
                    result.variables.set(variableName, resolved);
                  }
                } else {
                  result.variables.set(variableName, partiallyResolvedVars[i]);
                }
              }
              if (Types.isString(values.process)) {
                result.process = values.process;
              }
              resolve(result);
            }, (reason) => {
              reject(reason);
            });
          });
        });
      },
      findExecutable: (command, cwd, paths) => {
        return this._proxy.$findExecutable(command, cwd, paths);
      }
    });
  }
  async $registerSupportedExecutions(custom, shell, process) {
    return this._taskService.registerSupportedExecutions(custom, shell, process);
  }
};
MainThreadTask = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTask),
  __decorateParam(1, ITaskService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IConfigurationResolverService)
], MainThreadTask);
export {
  MainThreadTask,
  TaskProblemMatcherEndedDto,
  TaskProblemMatcherStartedDto
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFRhc2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgUGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcblxuaW1wb3J0IHtcblx0Q29udHJpYnV0ZWRUYXNrLCBDb25maWd1cmluZ1Rhc2ssIEtleWVkVGFza0lkZW50aWZpZXIsIElUYXNrRXhlY3V0aW9uLCBUYXNrLCBJVGFza0V2ZW50LFxuXHRJUHJlc2VudGF0aW9uT3B0aW9ucywgQ29tbWFuZE9wdGlvbnMsIElDb21tYW5kQ29uZmlndXJhdGlvbiwgUnVudGltZVR5cGUsIEN1c3RvbVRhc2ssIFRhc2tTY29wZSwgVGFza1NvdXJjZSxcblx0VGFza1NvdXJjZUtpbmQsIElFeHRlbnNpb25UYXNrU291cmNlLCBJUnVuT3B0aW9ucywgSVRhc2tTZXQsIFRhc2tHcm91cCwgVGFza0RlZmluaXRpb24sIFByZXNlbnRhdGlvbk9wdGlvbnMsIFJ1bk9wdGlvbnNcbn0gZnJvbSAnLi4vLi4vY29udHJpYi90YXNrcy9jb21tb24vdGFza3MuanMnO1xuXG5cbmltcG9ydCB7IElSZXNvbHZlU2V0LCBJUmVzb2x2ZWRWYXJpYWJsZXMgfSBmcm9tICcuLi8uLi9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrU3lzdGVtLmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSwgSVRhc2tGaWx0ZXIsIElUYXNrUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5cbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBNYWluVGhyZWFkVGFza1NoYXBlLCBFeHRIb3N0VGFza1NoYXBlLCBNYWluQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7XG5cdElUYXNrRGVmaW5pdGlvbkRUTywgSVRhc2tFeGVjdXRpb25EVE8sIElQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTywgSVRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPLFxuXHRJUHJvY2Vzc0V4ZWN1dGlvbkRUTywgSVNoZWxsRXhlY3V0aW9uRFRPLCBJU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPLCBJQ3VzdG9tRXhlY3V0aW9uRFRPLCBJVGFza0RUTywgSVRhc2tTb3VyY2VEVE8sIElUYXNrSGFuZGxlRFRPLCBJVGFza0ZpbHRlckRUTywgSVRhc2tQcm9jZXNzU3RhcnRlZERUTywgSVRhc2tQcm9jZXNzRW5kZWREVE8sIElUYXNrU3lzdGVtSW5mb0RUTyxcblx0SVJ1bk9wdGlvbnNEVE8sIElUYXNrR3JvdXBEVE8sXG5cdElUYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkLFxuXHRJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWQsXG5cdFRhc2tFdmVudEtpbmRcbn0gZnJvbSAnLi4vY29tbW9uL3NoYXJlZC90YXNrcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEVycm9yTm9UZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLmpzJztcblxubmFtZXNwYWNlIFRhc2tFeGVjdXRpb25EVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSVRhc2tFeGVjdXRpb24pOiBJVGFza0V4ZWN1dGlvbkRUTyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB2YWx1ZS5pZCxcblx0XHRcdHRhc2s6IFRhc2tEVE8uZnJvbSh2YWx1ZS50YXNrKVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZER0byB7XG5cdGV4ZWN1dGlvbjogSVRhc2tFeGVjdXRpb25EVE87XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZER0byB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZCk6IElUYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXhlY3V0aW9uOiB7XG5cdFx0XHRcdGlkOiB2YWx1ZS5leGVjdXRpb24uaWQsXG5cdFx0XHRcdHRhc2s6IFRhc2tEVE8uZnJvbSh2YWx1ZS5leGVjdXRpb24udGFzaylcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZER0byB7XG5cdGV4ZWN1dGlvbjogSVRhc2tFeGVjdXRpb25EVE87XG5cdGhhc0Vycm9yczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZER0byB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWQpOiBJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWREdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRleGVjdXRpb246IHtcblx0XHRcdFx0aWQ6IHZhbHVlLmV4ZWN1dGlvbi5pZCxcblx0XHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHZhbHVlLmV4ZWN1dGlvbi50YXNrKVxuXHRcdFx0fSxcblx0XHRcdGhhc0Vycm9yczogdmFsdWUuaGFzRXJyb3JzXG5cdFx0fTtcblx0fVxufVxuXG5cblxubmFtZXNwYWNlIFRhc2tQcm9jZXNzU3RhcnRlZERUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJVGFza0V4ZWN1dGlvbiwgcHJvY2Vzc0lkOiBudW1iZXIpOiBJVGFza1Byb2Nlc3NTdGFydGVkRFRPIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHZhbHVlLmlkLFxuXHRcdFx0cHJvY2Vzc0lkXG5cdFx0fTtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza1Byb2Nlc3NFbmRlZERUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJVGFza0V4ZWN1dGlvbiwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IElUYXNrUHJvY2Vzc0VuZGVkRFRPIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHZhbHVlLmlkLFxuXHRcdFx0ZXhpdENvZGVcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrRGVmaW5pdGlvbkRUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBLZXllZFRhc2tJZGVudGlmaWVyKTogSVRhc2tEZWZpbml0aW9uRFRPIHtcblx0XHRjb25zdCByZXN1bHQgPSBPYmplY3QuYXNzaWduKE9iamVjdC5jcmVhdGUobnVsbCksIHZhbHVlKTtcblx0XHRkZWxldGUgcmVzdWx0Ll9rZXk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElUYXNrRGVmaW5pdGlvbkRUTywgZXhlY3V0ZU9ubHk6IGJvb2xlYW4pOiBLZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmVzdWx0ID0gVGFza0RlZmluaXRpb24uY3JlYXRlVGFza0lkZW50aWZpZXIodmFsdWUsIGNvbnNvbGUpO1xuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCAmJiBleGVjdXRlT25seSkge1xuXHRcdFx0cmVzdWx0ID0ge1xuXHRcdFx0XHRfa2V5OiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0dHlwZTogJyRleGVjdXRlT25seSdcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElQcmVzZW50YXRpb25PcHRpb25zIHwgdW5kZWZpbmVkKTogSVRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgdmFsdWUpO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSVRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPIHwgdW5kZWZpbmVkKTogSVByZXNlbnRhdGlvbk9wdGlvbnMge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gUHJlc2VudGF0aW9uT3B0aW9ucy5kZWZhdWx0cztcblx0XHR9XG5cdFx0cmV0dXJuIE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgUHJlc2VudGF0aW9uT3B0aW9ucy5kZWZhdWx0cywgdmFsdWUpO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBSdW5PcHRpb25zRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElSdW5PcHRpb25zKTogSVJ1bk9wdGlvbnNEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCB2YWx1ZSk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJUnVuT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCk6IElSdW5PcHRpb25zIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFJ1bk9wdGlvbnMuZGVmYXVsdHM7XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3QuYXNzaWduKE9iamVjdC5jcmVhdGUobnVsbCksIFJ1bk9wdGlvbnMuZGVmYXVsdHMsIHZhbHVlKTtcblx0fVxufVxuXG5uYW1lc3BhY2UgUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogQ29tbWFuZE9wdGlvbnMpOiBJUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3dkOiB2YWx1ZS5jd2QsXG5cdFx0XHRlbnY6IHZhbHVlLmVudlxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQpOiBDb21tYW5kT3B0aW9ucyB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBDb21tYW5kT3B0aW9ucy5kZWZhdWx0cztcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGN3ZDogdmFsdWUuY3dkIHx8IENvbW1hbmRPcHRpb25zLmRlZmF1bHRzLmN3ZCxcblx0XHRcdGVudjogdmFsdWUuZW52XG5cdFx0fTtcblx0fVxufVxuXG5uYW1lc3BhY2UgUHJvY2Vzc0V4ZWN1dGlvbkRUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogSVNoZWxsRXhlY3V0aW9uRFRPIHwgSVByb2Nlc3NFeGVjdXRpb25EVE8gfCBJQ3VzdG9tRXhlY3V0aW9uRFRPKTogdmFsdWUgaXMgSVByb2Nlc3NFeGVjdXRpb25EVE8ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIElQcm9jZXNzRXhlY3V0aW9uRFRPO1xuXHRcdHJldHVybiBjYW5kaWRhdGUgJiYgISFjYW5kaWRhdGUucHJvY2Vzcztcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSUNvbW1hbmRDb25maWd1cmF0aW9uKTogSVByb2Nlc3NFeGVjdXRpb25EVE8ge1xuXHRcdGNvbnN0IHByb2Nlc3M6IHN0cmluZyA9IFR5cGVzLmlzU3RyaW5nKHZhbHVlLm5hbWUpID8gdmFsdWUubmFtZSA6IHZhbHVlLm5hbWUhLnZhbHVlO1xuXHRcdGNvbnN0IGFyZ3M6IHN0cmluZ1tdID0gdmFsdWUuYXJncyA/IHZhbHVlLmFyZ3MubWFwKHZhbHVlID0+IFR5cGVzLmlzU3RyaW5nKHZhbHVlKSA/IHZhbHVlIDogdmFsdWUudmFsdWUpIDogW107XG5cdFx0Y29uc3QgcmVzdWx0OiBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyA9IHtcblx0XHRcdHByb2Nlc3M6IHByb2Nlc3MsXG5cdFx0XHRhcmdzOiBhcmdzXG5cdFx0fTtcblx0XHRpZiAodmFsdWUub3B0aW9ucykge1xuXHRcdFx0cmVzdWx0Lm9wdGlvbnMgPSBQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTy5mcm9tKHZhbHVlLm9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSVByb2Nlc3NFeGVjdXRpb25EVE8pOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUNvbW1hbmRDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0cnVudGltZTogUnVudGltZVR5cGUuUHJvY2Vzcyxcblx0XHRcdG5hbWU6IHZhbHVlLnByb2Nlc3MsXG5cdFx0XHRhcmdzOiB2YWx1ZS5hcmdzLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWRcblx0XHR9O1xuXHRcdHJlc3VsdC5vcHRpb25zID0gUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnNEVE8udG8odmFsdWUub3B0aW9ucyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5uYW1lc3BhY2UgU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IENvbW1hbmRPcHRpb25zKTogSVNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSVNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTyA9IHtcblx0XHRcdGN3ZDogdmFsdWUuY3dkIHx8IENvbW1hbmRPcHRpb25zLmRlZmF1bHRzLmN3ZCxcblx0XHRcdGVudjogdmFsdWUuZW52XG5cdFx0fTtcblx0XHRpZiAodmFsdWUuc2hlbGwpIHtcblx0XHRcdHJlc3VsdC5leGVjdXRhYmxlID0gdmFsdWUuc2hlbGwuZXhlY3V0YWJsZTtcblx0XHRcdHJlc3VsdC5zaGVsbEFyZ3MgPSB2YWx1ZS5zaGVsbC5hcmdzO1xuXHRcdFx0cmVzdWx0LnNoZWxsUXVvdGluZyA9IHZhbHVlLnNoZWxsLnF1b3Rpbmc7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPKTogQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IENvbW1hbmRPcHRpb25zID0ge1xuXHRcdFx0Y3dkOiB2YWx1ZS5jd2QsXG5cdFx0XHRlbnY6IHZhbHVlLmVudlxuXHRcdH07XG5cdFx0aWYgKHZhbHVlLmV4ZWN1dGFibGUpIHtcblx0XHRcdHJlc3VsdC5zaGVsbCA9IHtcblx0XHRcdFx0ZXhlY3V0YWJsZTogdmFsdWUuZXhlY3V0YWJsZVxuXHRcdFx0fTtcblx0XHRcdGlmICh2YWx1ZS5zaGVsbEFyZ3MpIHtcblx0XHRcdFx0cmVzdWx0LnNoZWxsLmFyZ3MgPSB2YWx1ZS5zaGVsbEFyZ3M7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUuc2hlbGxRdW90aW5nKSB7XG5cdFx0XHRcdHJlc3VsdC5zaGVsbC5xdW90aW5nID0gdmFsdWUuc2hlbGxRdW90aW5nO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBTaGVsbEV4ZWN1dGlvbkRUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogSVNoZWxsRXhlY3V0aW9uRFRPIHwgSVByb2Nlc3NFeGVjdXRpb25EVE8gfCBJQ3VzdG9tRXhlY3V0aW9uRFRPKTogdmFsdWUgaXMgSVNoZWxsRXhlY3V0aW9uRFRPIHtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyBJU2hlbGxFeGVjdXRpb25EVE87XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiAoISFjYW5kaWRhdGUuY29tbWFuZExpbmUgfHwgISFjYW5kaWRhdGUuY29tbWFuZCk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElDb21tYW5kQ29uZmlndXJhdGlvbik6IElTaGVsbEV4ZWN1dGlvbkRUTyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJU2hlbGxFeGVjdXRpb25EVE8gPSB7fTtcblx0XHRpZiAodmFsdWUubmFtZSAmJiBUeXBlcy5pc1N0cmluZyh2YWx1ZS5uYW1lKSAmJiAodmFsdWUuYXJncyA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlLmFyZ3MgPT09IG51bGwgfHwgdmFsdWUuYXJncy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRyZXN1bHQuY29tbWFuZExpbmUgPSB2YWx1ZS5uYW1lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQuY29tbWFuZCA9IHZhbHVlLm5hbWU7XG5cdFx0XHRyZXN1bHQuYXJncyA9IHZhbHVlLmFyZ3M7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5vcHRpb25zKSB7XG5cdFx0XHRyZXN1bHQub3B0aW9ucyA9IFNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTy5mcm9tKHZhbHVlLm9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSVNoZWxsRXhlY3V0aW9uRFRPKTogSUNvbW1hbmRDb25maWd1cmF0aW9uIHtcblx0XHRjb25zdCByZXN1bHQ6IElDb21tYW5kQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHJ1bnRpbWU6IFJ1bnRpbWVUeXBlLlNoZWxsLFxuXHRcdFx0bmFtZTogdmFsdWUuY29tbWFuZExpbmUgPyB2YWx1ZS5jb21tYW5kTGluZSA6IHZhbHVlLmNvbW1hbmQsXG5cdFx0XHRhcmdzOiB2YWx1ZS5hcmdzLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWRcblx0XHR9O1xuXHRcdGlmICh2YWx1ZS5vcHRpb25zKSB7XG5cdFx0XHRyZXN1bHQub3B0aW9ucyA9IFNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTy50byh2YWx1ZS5vcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5uYW1lc3BhY2UgQ3VzdG9tRXhlY3V0aW9uRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiBJU2hlbGxFeGVjdXRpb25EVE8gfCBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyB8IElDdXN0b21FeGVjdXRpb25EVE8pOiB2YWx1ZSBpcyBJQ3VzdG9tRXhlY3V0aW9uRFRPIHtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyBJQ3VzdG9tRXhlY3V0aW9uRFRPO1xuXHRcdHJldHVybiBjYW5kaWRhdGUgJiYgY2FuZGlkYXRlLmN1c3RvbUV4ZWN1dGlvbiA9PT0gJ2N1c3RvbUV4ZWN1dGlvbic7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSUNvbW1hbmRDb25maWd1cmF0aW9uKTogSUN1c3RvbUV4ZWN1dGlvbkRUTyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGN1c3RvbUV4ZWN1dGlvbjogJ2N1c3RvbUV4ZWN1dGlvbidcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJQ3VzdG9tRXhlY3V0aW9uRFRPKTogSUNvbW1hbmRDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cnVudGltZTogUnVudGltZVR5cGUuQ3VzdG9tRXhlY3V0aW9uLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrU291cmNlRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IFRhc2tTb3VyY2UpOiBJVGFza1NvdXJjZURUTyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGFza1NvdXJjZURUTyA9IHtcblx0XHRcdGxhYmVsOiB2YWx1ZS5sYWJlbFxuXHRcdH07XG5cdFx0aWYgKHZhbHVlLmtpbmQgPT09IFRhc2tTb3VyY2VLaW5kLkV4dGVuc2lvbikge1xuXHRcdFx0cmVzdWx0LmV4dGVuc2lvbklkID0gdmFsdWUuZXh0ZW5zaW9uO1xuXHRcdFx0aWYgKHZhbHVlLndvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRyZXN1bHQuc2NvcGUgPSB2YWx1ZS53b3Jrc3BhY2VGb2xkZXIudXJpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnNjb3BlID0gdmFsdWUuc2NvcGU7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh2YWx1ZS5raW5kID09PSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UpIHtcblx0XHRcdHJlc3VsdC5leHRlbnNpb25JZCA9ICckY29yZSc7XG5cdFx0XHRyZXN1bHQuc2NvcGUgPSB2YWx1ZS5jb25maWcud29ya3NwYWNlRm9sZGVyID8gdmFsdWUuY29uZmlnLndvcmtzcGFjZUZvbGRlci51cmkgOiBUYXNrU2NvcGUuR2xvYmFsO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSVRhc2tTb3VyY2VEVE8sIHdvcmtzcGFjZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTogSUV4dGVuc2lvblRhc2tTb3VyY2Uge1xuXHRcdGxldCBzY29wZTogVGFza1Njb3BlO1xuXHRcdGxldCB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCh2YWx1ZS5zY29wZSA9PT0gdW5kZWZpbmVkKSB8fCAoKHR5cGVvZiB2YWx1ZS5zY29wZSA9PT0gJ251bWJlcicpICYmICh2YWx1ZS5zY29wZSAhPT0gVGFza1Njb3BlLkdsb2JhbCkpKSB7XG5cdFx0XHRpZiAod29ya3NwYWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHNjb3BlID0gVGFza1Njb3BlLkdsb2JhbDtcblx0XHRcdFx0d29ya3NwYWNlRm9sZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcGUgPSBUYXNrU2NvcGUuRm9sZGVyO1xuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXIgPSB3b3Jrc3BhY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZS5zY29wZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHNjb3BlID0gdmFsdWUuc2NvcGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNjb3BlID0gVGFza1Njb3BlLkZvbGRlcjtcblx0XHRcdHdvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZS5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLnJldml2ZSh2YWx1ZS5zY29wZSkpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uVGFza1NvdXJjZSA9IHtcblx0XHRcdGtpbmQ6IFRhc2tTb3VyY2VLaW5kLkV4dGVuc2lvbixcblx0XHRcdGxhYmVsOiB2YWx1ZS5sYWJlbCxcblx0XHRcdGV4dGVuc2lvbjogdmFsdWUuZXh0ZW5zaW9uSWQsXG5cdFx0XHRzY29wZSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlclxuXHRcdH07XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza0hhbmRsZURUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElUYXNrSGFuZGxlRFRPIHtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyBJVGFza0hhbmRsZURUTyB8IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gISFjYW5kaWRhdGUgJiYgVHlwZXMuaXNTdHJpbmcoY2FuZGlkYXRlLmlkKSAmJiAhIWNhbmRpZGF0ZS53b3Jrc3BhY2VGb2xkZXI7XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0YXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrKTogSVRhc2tEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0YXNrID09PSB1bmRlZmluZWQgfHwgdGFzayA9PT0gbnVsbCB8fCAoIUN1c3RvbVRhc2suaXModGFzaykgJiYgIUNvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSAmJiAhQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGFza0RUTyA9IHtcblx0XHRcdF9pZDogdGFzay5faWQsXG5cdFx0XHRuYW1lOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUsXG5cdFx0XHRkZWZpbml0aW9uOiBUYXNrRGVmaW5pdGlvbkRUTy5mcm9tKHRhc2suZ2V0RGVmaW5pdGlvbih0cnVlKSksXG5cdFx0XHRzb3VyY2U6IFRhc2tTb3VyY2VEVE8uZnJvbSh0YXNrLl9zb3VyY2UpLFxuXHRcdFx0ZXhlY3V0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRwcmVzZW50YXRpb25PcHRpb25zOiAhQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spICYmIHRhc2suY29tbWFuZCA/IFRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPLmZyb20odGFzay5jb21tYW5kLnByZXNlbnRhdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0JhY2tncm91bmQ6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kLFxuXHRcdFx0cHJvYmxlbU1hdGNoZXJzOiBbXSxcblx0XHRcdGhhc0RlZmluZWRNYXRjaGVyczogQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spID8gdGFzay5oYXNEZWZpbmVkTWF0Y2hlcnMgOiBmYWxzZSxcblx0XHRcdHJ1bk9wdGlvbnM6IFJ1bk9wdGlvbnNEVE8uZnJvbSh0YXNrLnJ1bk9wdGlvbnMpLFxuXHRcdH07XG5cdFx0cmVzdWx0Lmdyb3VwID0gVGFza0dyb3VwRFRPLmZyb20odGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCk7XG5cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWwpIHtcblx0XHRcdHJlc3VsdC5kZXRhaWwgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbDtcblx0XHR9XG5cdFx0aWYgKCFDb25maWd1cmluZ1Rhc2suaXModGFzaykgJiYgdGFzay5jb21tYW5kKSB7XG5cdFx0XHRzd2l0Y2ggKHRhc2suY29tbWFuZC5ydW50aW1lKSB7XG5cdFx0XHRcdGNhc2UgUnVudGltZVR5cGUuUHJvY2VzczogcmVzdWx0LmV4ZWN1dGlvbiA9IFByb2Nlc3NFeGVjdXRpb25EVE8uZnJvbSh0YXNrLmNvbW1hbmQpOyBicmVhaztcblx0XHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5TaGVsbDogcmVzdWx0LmV4ZWN1dGlvbiA9IFNoZWxsRXhlY3V0aW9uRFRPLmZyb20odGFzay5jb21tYW5kKTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgUnVudGltZVR5cGUuQ3VzdG9tRXhlY3V0aW9uOiByZXN1bHQuZXhlY3V0aW9uID0gQ3VzdG9tRXhlY3V0aW9uRFRPLmZyb20odGFzay5jb21tYW5kKTsgYnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycykge1xuXHRcdFx0Zm9yIChjb25zdCBtYXRjaGVyIG9mIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzKSB7XG5cdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhtYXRjaGVyKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wcm9ibGVtTWF0Y2hlcnMucHVzaChtYXRjaGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHRhc2s6IElUYXNrRFRPIHwgdW5kZWZpbmVkLCB3b3Jrc3BhY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgZXhlY3V0ZU9ubHk6IGJvb2xlYW4sIGljb24/OiB7IGlkPzogc3RyaW5nOyBjb2xvcj86IHN0cmluZyB9LCBoaWRlPzogYm9vbGVhbik6IENvbnRyaWJ1dGVkVGFzayB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0YXNrIHx8ICh0eXBlb2YgdGFzay5uYW1lICE9PSAnc3RyaW5nJykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbW1hbmQ6IElDb21tYW5kQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGFzay5leGVjdXRpb24pIHtcblx0XHRcdGlmIChTaGVsbEV4ZWN1dGlvbkRUTy5pcyh0YXNrLmV4ZWN1dGlvbikpIHtcblx0XHRcdFx0Y29tbWFuZCA9IFNoZWxsRXhlY3V0aW9uRFRPLnRvKHRhc2suZXhlY3V0aW9uKTtcblx0XHRcdH0gZWxzZSBpZiAoUHJvY2Vzc0V4ZWN1dGlvbkRUTy5pcyh0YXNrLmV4ZWN1dGlvbikpIHtcblx0XHRcdFx0Y29tbWFuZCA9IFByb2Nlc3NFeGVjdXRpb25EVE8udG8odGFzay5leGVjdXRpb24pO1xuXHRcdFx0fSBlbHNlIGlmIChDdXN0b21FeGVjdXRpb25EVE8uaXModGFzay5leGVjdXRpb24pKSB7XG5cdFx0XHRcdGNvbW1hbmQgPSBDdXN0b21FeGVjdXRpb25EVE8udG8odGFzay5leGVjdXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29tbWFuZC5wcmVzZW50YXRpb24gPSBUYXNrUHJlc2VudGF0aW9uT3B0aW9uc0RUTy50byh0YXNrLnByZXNlbnRhdGlvbk9wdGlvbnMpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IFRhc2tTb3VyY2VEVE8udG8odGFzay5zb3VyY2UsIHdvcmtzcGFjZSk7XG5cblx0XHRjb25zdCBsYWJlbCA9IG5scy5sb2NhbGl6ZSgndGFzay5sYWJlbCcsICd7MH06IHsxfScsIHNvdXJjZS5sYWJlbCwgdGFzay5uYW1lKTtcblx0XHRjb25zdCBkZWZpbml0aW9uID0gVGFza0RlZmluaXRpb25EVE8udG8odGFzay5kZWZpbml0aW9uLCBleGVjdXRlT25seSkhO1xuXHRcdGNvbnN0IGlkID0gKEN1c3RvbUV4ZWN1dGlvbkRUTy5pcyh0YXNrLmV4ZWN1dGlvbiEpICYmIHRhc2suX2lkKSA/IHRhc2suX2lkIDogYCR7dGFzay5zb3VyY2UuZXh0ZW5zaW9uSWR9LiR7ZGVmaW5pdGlvbi5fa2V5fWA7XG5cdFx0Y29uc3QgcmVzdWx0OiBDb250cmlidXRlZFRhc2sgPSBuZXcgQ29udHJpYnV0ZWRUYXNrKFxuXHRcdFx0aWQsIC8vIHV1aWRNYXAuZ2V0VVVJRChpZGVudGlmaWVyKVxuXHRcdFx0c291cmNlLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRkZWZpbml0aW9uLnR5cGUsXG5cdFx0XHRkZWZpbml0aW9uLFxuXHRcdFx0Y29tbWFuZCxcblx0XHRcdHRhc2suaGFzRGVmaW5lZE1hdGNoZXJzLFxuXHRcdFx0UnVuT3B0aW9uc0RUTy50byh0YXNrLnJ1bk9wdGlvbnMpLFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiB0YXNrLm5hbWUsXG5cdFx0XHRcdGlkZW50aWZpZXI6IGxhYmVsLFxuXHRcdFx0XHRncm91cDogdGFzay5ncm91cCxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiAhIXRhc2suaXNCYWNrZ3JvdW5kLFxuXHRcdFx0XHRwcm9ibGVtTWF0Y2hlcnM6IHRhc2sucHJvYmxlbU1hdGNoZXJzLnNsaWNlKCksXG5cdFx0XHRcdGRldGFpbDogdGFzay5kZXRhaWwsXG5cdFx0XHRcdGljb24sXG5cdFx0XHRcdGhpZGVcblx0XHRcdH1cblx0XHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tHcm91cERUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBzdHJpbmcgfCBUYXNrR3JvdXAgfCB1bmRlZmluZWQpOiBJVGFza0dyb3VwRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9pZDogKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpID8gdmFsdWUgOiB2YWx1ZS5faWQsXG5cdFx0XHRpc0RlZmF1bHQ6ICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSA/IGZhbHNlIDogKCh0eXBlb2YgdmFsdWUuaXNEZWZhdWx0ID09PSAnc3RyaW5nJykgPyBmYWxzZSA6IHZhbHVlLmlzRGVmYXVsdClcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrRmlsdGVyRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElUYXNrRmlsdGVyKTogSVRhc2tGaWx0ZXJEVE8ge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElUYXNrRmlsdGVyRFRPIHwgdW5kZWZpbmVkKTogSVRhc2tGaWx0ZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZFRhc2spXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFRhc2sgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZFRhc2tTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RUYXNrU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyczogTWFwPG51bWJlciwgeyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTsgcHJvdmlkZXI6IElUYXNrUHJvdmlkZXIgfT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmVyOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0VGFzayk7XG5cdFx0dGhpcy5fcHJvdmlkZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rhc2tTZXJ2aWNlLm9uRGlkU3RhdGVDaGFuZ2UoYXN5bmMgKGV2ZW50OiBJVGFza0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5DaGFuZ2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFzayA9IGV2ZW50Ll9fdGFzaztcblx0XHRcdGlmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLlN0YXJ0KSB7XG5cdFx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IFRhc2tFeGVjdXRpb25EVE8uZnJvbSh0YXNrLmdldFRhc2tFeGVjdXRpb24oKSk7XG5cdFx0XHRcdGxldCByZXNvbHZlZERlZmluaXRpb246IElUYXNrRGVmaW5pdGlvbkRUTyA9IGV4ZWN1dGlvbi50YXNrIS5kZWZpbml0aW9uO1xuXHRcdFx0XHRpZiAoZXhlY3V0aW9uLnRhc2s/LmV4ZWN1dGlvbiAmJiBDdXN0b21FeGVjdXRpb25EVE8uaXMoZXhlY3V0aW9uLnRhc2suZXhlY3V0aW9uKSAmJiBldmVudC5yZXNvbHZlZFZhcmlhYmxlcykge1xuXHRcdFx0XHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKGV4ZWN1dGlvbi50YXNrLmRlZmluaXRpb24pO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgZXhwci51bnJlc29sdmVkKCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gZXZlbnQucmVzb2x2ZWRWYXJpYWJsZXMuZ2V0KHJlcGxhY2VtZW50LmlubmVyKTtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGV4cHIucmVzb2x2ZShyZXBsYWNlbWVudCwgdmFsdWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlc29sdmVkRGVmaW5pdGlvbiA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZUFzeW5jKHRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCksIGV4cHIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFN0YXJ0VGFzayhleGVjdXRpb24sIGV2ZW50LnRlcm1pbmFsSWQsIHJlc29sdmVkRGVmaW5pdGlvbik7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuUHJvY2Vzc1N0YXJ0ZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkU3RhcnRUYXNrUHJvY2VzcyhUYXNrUHJvY2Vzc1N0YXJ0ZWREVE8uZnJvbSh0YXNrLmdldFRhc2tFeGVjdXRpb24oKSwgZXZlbnQucHJvY2Vzc0lkKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuUHJvY2Vzc0VuZGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZEVuZFRhc2tQcm9jZXNzKFRhc2tQcm9jZXNzRW5kZWREVE8uZnJvbSh0YXNrLmdldFRhc2tFeGVjdXRpb24oKSwgZXZlbnQuZXhpdENvZGUpKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5FbmQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJE9uRGlkRW5kVGFzayhUYXNrRXhlY3V0aW9uRFRPLmZyb20odGFzay5nZXRUYXNrRXhlY3V0aW9uKCkpKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlclN0YXJ0ZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkU3RhcnRUYXNrUHJvYmxlbU1hdGNoZXJzKFRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWREdG8uZnJvbSh7IGV4ZWN1dGlvbjogdGFzay5nZXRUYXNrRXhlY3V0aW9uKCkgfSkpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRW5kZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVycyhUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZER0by5mcm9tKHsgZXhlY3V0aW9uOiB0YXNrLmdldFRhc2tFeGVjdXRpb24oKSwgaGFzRXJyb3JzOiBmYWxzZSB9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJGb3VuZEVycm9ycykge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRFbmRUYXNrUHJvYmxlbU1hdGNoZXJzKFRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRHRvLmZyb20oeyBleGVjdXRpb246IHRhc2suZ2V0VGFza0V4ZWN1dGlvbigpLCBoYXNFcnJvcnM6IHRydWUgfSkpO1xuXHRcdFx0fVxuXG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB0aGlzLl9wcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdHZhbHVlLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aWRlcnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQkY3JlYXRlVGFza0lkKHRhc2tEVE86IElUYXNrRFRPKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFzayA9IFRhc2tEVE8udG8odGFza0RUTywgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZlciwgdHJ1ZSk7XG5cdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRyZXNvbHZlKHRhc2suX2lkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1Rhc2sgY291bGQgbm90IGJlIGNyZWF0ZWQgZnJvbSBEVE8nKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyVGFza1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCB0eXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcjogSVRhc2tQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVUYXNrczogKHZhbGlkVHlwZXM6IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+KSA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcHJveHkuJHByb3ZpZGVUYXNrcyhoYW5kbGUsIHZhbGlkVHlwZXMpKS50aGVuKCh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tzOiBUYXNrW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGR0byBvZiB2YWx1ZS50YXNrcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFzayA9IFRhc2tEVE8udG8oZHRvLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmVyLCB0cnVlKTtcblx0XHRcdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0XHRcdHRhc2tzLnB1c2godGFzayk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBUYXNrIFN5c3RlbTogY2FuIG5vdCBjb252ZXJ0IHRhc2s6ICR7SlNPTi5zdHJpbmdpZnkoZHRvLmRlZmluaXRpb24sIHVuZGVmaW5lZCwgMCl9LiBUYXNrIHdpbGwgYmUgZHJvcHBlZGApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwcm9jZXNzZWRFeHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiA9IHtcblx0XHRcdFx0XHRcdC4uLnZhbHVlLmV4dGVuc2lvbixcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkxvY2F0aW9uOiBVUkkucmV2aXZlKHZhbHVlLmV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbilcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0YXNrcyxcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogcHJvY2Vzc2VkRXh0ZW5zaW9uXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSVRhc2tTZXQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVUYXNrOiAodGFzazogQ29uZmlndXJpbmdUYXNrKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGR0byA9IFRhc2tEVE8uZnJvbSh0YXNrKTtcblxuXHRcdFx0XHRpZiAoZHRvKSB7XG5cdFx0XHRcdFx0ZHRvLm5hbWUgPSAoKGR0by5uYW1lID09PSB1bmRlZmluZWQpID8gJycgOiBkdG8ubmFtZSk7IC8vIFVzaW5nIGFuIGVtcHR5IG5hbWUgY2F1c2VzIHRoZSBuYW1lIHRvIGRlZmF1bHQgdG8gdGhlIG9uZSBnaXZlbiBieSB0aGUgcHJvdmlkZXIuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9wcm94eS4kcmVzb2x2ZVRhc2soaGFuZGxlLCBkdG8pKS50aGVuKHJlc29sdmVkVGFzayA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocmVzb2x2ZWRUYXNrKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBUYXNrRFRPLnRvKHJlc29sdmVkVGFzaywgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZlciwgdHJ1ZSwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmhpZGUpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8Q29udHJpYnV0ZWRUYXNrIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3Rhc2tTZXJ2aWNlLnJlZ2lzdGVyVGFza1Byb3ZpZGVyKHByb3ZpZGVyLCB0eXBlKTtcblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KGhhbmRsZSwgeyBkaXNwb3NhYmxlLCBwcm92aWRlciB9KTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgJHVucmVnaXN0ZXJUYXNrUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdHByb3ZpZGVyLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgJGZldGNoVGFza3MoZmlsdGVyPzogSVRhc2tGaWx0ZXJEVE8pOiBQcm9taXNlPElUYXNrRFRPW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGFza1NlcnZpY2UudGFza3MoVGFza0ZpbHRlckRUTy50byhmaWx0ZXIpKS50aGVuKCh0YXNrcykgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJVGFza0RUT1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IFRhc2tEVE8uZnJvbSh0YXNrKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya3NwYWNlKHZhbHVlOiBVcmlDb21wb25lbnRzIHwgc3RyaW5nKTogc3RyaW5nIHwgSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIgfCBudWxsIHtcblx0XHRsZXQgd29ya3NwYWNlO1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR3b3Jrc3BhY2UgPSB2YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlT2JqZWN0ID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZlci5nZXRXb3Jrc3BhY2UoKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUodmFsdWUpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZU9iamVjdC5jb25maWd1cmF0aW9uPy50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR3b3Jrc3BhY2UgPSB3b3Jrc3BhY2VPYmplY3Q7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3b3Jrc3BhY2UgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmVyLmdldFdvcmtzcGFjZUZvbGRlcih1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gd29ya3NwYWNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRnZXRUYXNrRXhlY3V0aW9uKHZhbHVlOiBJVGFza0hhbmRsZURUTyB8IElUYXNrRFRPKTogUHJvbWlzZTxJVGFza0V4ZWN1dGlvbkRUTz4ge1xuXHRcdGlmIChUYXNrSGFuZGxlRFRPLmlzKHZhbHVlKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5nZXRXb3Jrc3BhY2UodmFsdWUud29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0Y29uc3QgdGFzayA9IGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFRhc2sod29ya3NwYWNlLCB2YWx1ZS5pZCwgdHJ1ZSk7XG5cdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGlkOiB0YXNrLl9pZCxcblx0XHRcdFx0XHRcdHRhc2s6IFRhc2tEVE8uZnJvbSh0YXNrKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUYXNrIG5vdCBmb3VuZCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyB3b3Jrc3BhY2UgZm9sZGVyJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRhc2sgPSBUYXNrRFRPLnRvKHZhbHVlLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmVyLCB0cnVlKSE7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogdGFzay5faWQsXG5cdFx0XHRcdHRhc2s6IFRhc2tEVE8uZnJvbSh0YXNrKVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHQvLyBQYXNzaW5nIGluIGEgVGFza0hhbmRsZURUTyB3aWxsIGNhdXNlIHRoZSB0YXNrIHRvIGdldCByZS1yZXNvbHZlZCwgd2hpY2ggaXMgaW1wb3J0YW50IGZvciB0YXNrcyBhcmUgY29taW5nIGZyb20gdGhlIGNvcmUsXG5cdC8vIHN1Y2ggYXMgdGhvc2UgZ290dGVuIGZyb20gYSBmZXRjaFRhc2tzLCBzaW5jZSB0aGV5IGNhbiBoYXZlIG1pc3NpbmcgY29uZmlndXJhdGlvbiBwcm9wZXJ0aWVzLlxuXHRwdWJsaWMgJGV4ZWN1dGVUYXNrKHZhbHVlOiBJVGFza0hhbmRsZURUTyB8IElUYXNrRFRPKTogUHJvbWlzZTxJVGFza0V4ZWN1dGlvbkRUTz4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJVGFza0V4ZWN1dGlvbkRUTz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0aWYgKFRhc2tIYW5kbGVEVE8uaXModmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuZ2V0V29ya3NwYWNlKHZhbHVlLndvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5nZXRUYXNrKHdvcmtzcGFjZSwgdmFsdWUuaWQsIHRydWUpLnRoZW4oKHRhc2s6IFRhc2sgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0XHRcdGlmICghdGFzaykge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCdUYXNrIG5vdCBmb3VuZCcpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogSVRhc2tFeGVjdXRpb25EVE8gPSB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IHZhbHVlLmlkLFxuXHRcdFx0XHRcdFx0XHRcdHRhc2s6IFRhc2tEVE8uZnJvbSh0YXNrKVxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5ydW4odGFzaykudGhlbihzdW1tYXJ5ID0+IHtcblx0XHRcdFx0XHRcdFx0XHQvLyBFbnN1cmUgdGhhdCB0aGUgdGFzayBleGVjdXRpb24gZ2V0cyBjbGVhbmVkIHVwIGlmIHRoZSBleGl0IGNvZGUgaXMgdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIHdoZW4gdGhlIHRhc2sgaGFzIGRlcGVuZGVudCB0YXNrcyBhbmQgb25lIG9mIHRoZW0gZmFpbGVkXG5cdFx0XHRcdFx0XHRcdFx0aWYgKChzdW1tYXJ5Py5leGl0Q29kZSA9PT0gdW5kZWZpbmVkKSB8fCAoc3VtbWFyeS5leGl0Q29kZSAhPT0gMCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRPbkRpZEVuZFRhc2socmVzdWx0KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sIHJlYXNvbiA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZWF0IHRoZSBlcnJvciwgaXQgaGFzIGFscmVhZHkgYmVlbiBzdXJmYWNlZCB0byB0aGUgdXNlciBhbmQgd2UgZG9uJ3QgY2FyZSBhYm91dCBpdCBoZXJlXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgKF9lcnJvcikgPT4ge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignVGFzayBub3QgZm91bmQnKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignTm8gd29ya3NwYWNlIGZvbGRlcicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGFzayA9IFRhc2tEVE8udG8odmFsdWUsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2ZXIsIHRydWUpITtcblx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2UucnVuKHRhc2spLnRoZW4odW5kZWZpbmVkLCByZWFzb24gPT4ge1xuXHRcdFx0XHRcdC8vIGVhdCB0aGUgZXJyb3IsIGl0IGhhcyBhbHJlYWR5IGJlZW4gc3VyZmFjZWQgdG8gdGhlIHVzZXIgYW5kIHdlIGRvbid0IGNhcmUgYWJvdXQgaXQgaGVyZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJVGFza0V4ZWN1dGlvbkRUTyA9IHtcblx0XHRcdFx0XHRpZDogdGFzay5faWQsXG5cdFx0XHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHRhc2spXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cblx0cHVibGljICRjdXN0b21FeGVjdXRpb25Db21wbGV0ZShpZDogc3RyaW5nLCByZXN1bHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fdGFza1NlcnZpY2UuZ2V0QWN0aXZlVGFza3MoKS50aGVuKCh0YXNrcykgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0XHRpZiAoaWQgPT09IHRhc2suX2lkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5leHRlbnNpb25DYWxsYmFja1Rhc2tDb21wbGV0ZSh0YXNrLCByZXN1bHQpLnRoZW4oKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0sIChlcnJvcikgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1Rhc2sgdG8gbWFyayBhcyBjb21wbGV0ZSBub3QgZm91bmQnKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyAkdGVybWluYXRlVGFzayhpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLmdldEFjdGl2ZVRhc2tzKCkudGhlbigodGFza3MpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0aWYgKGlkID09PSB0YXNrLl9pZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2UudGVybWluYXRlKHRhc2spLnRoZW4oKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0sIChlcnJvcikgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZWplY3QobmV3IEVycm9yTm9UZWxlbWV0cnkoJ1Rhc2sgdG8gdGVybWluYXRlIG5vdCBmb3VuZCcpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRyZWdpc3RlclRhc2tTeXN0ZW0oa2V5OiBzdHJpbmcsIGluZm86IElUYXNrU3lzdGVtSW5mb0RUTyk6IHZvaWQge1xuXHRcdGxldCBwbGF0Zm9ybTogUGxhdGZvcm0uUGxhdGZvcm07XG5cdFx0c3dpdGNoIChpbmZvLnBsYXRmb3JtKSB7XG5cdFx0XHRjYXNlICdXZWInOlxuXHRcdFx0XHRwbGF0Zm9ybSA9IFBsYXRmb3JtLlBsYXRmb3JtLldlYjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICd3aW4zMic6XG5cdFx0XHRcdHBsYXRmb3JtID0gUGxhdGZvcm0uUGxhdGZvcm0uV2luZG93cztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdkYXJ3aW4nOlxuXHRcdFx0XHRwbGF0Zm9ybSA9IFBsYXRmb3JtLlBsYXRmb3JtLk1hYztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdsaW51eCc6XG5cdFx0XHRcdHBsYXRmb3JtID0gUGxhdGZvcm0uUGxhdGZvcm0uTGludXg7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cGxhdGZvcm0gPSBQbGF0Zm9ybS5wbGF0Zm9ybTtcblx0XHR9XG5cdFx0dGhpcy5fdGFza1NlcnZpY2UucmVnaXN0ZXJUYXNrU3lzdGVtKGtleSwge1xuXHRcdFx0cGxhdGZvcm06IHBsYXRmb3JtLFxuXHRcdFx0dXJpUHJvdmlkZXI6IChwYXRoOiBzdHJpbmcpOiBVUkkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IGluZm8uc2NoZW1lLCBhdXRob3JpdHk6IGluZm8uYXV0aG9yaXR5LCBwYXRoIH0pO1xuXHRcdFx0fSxcblx0XHRcdGNvbnRleHQ6IHRoaXMuX2V4dEhvc3RDb250ZXh0LFxuXHRcdFx0cmVzb2x2ZVZhcmlhYmxlczogKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgdG9SZXNvbHZlOiBJUmVzb2x2ZVNldCwgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTxJUmVzb2x2ZWRWYXJpYWJsZXMgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgdmFyczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0dG9SZXNvbHZlLnZhcmlhYmxlcy5mb3JFYWNoKGl0ZW0gPT4gdmFycy5wdXNoKGl0ZW0pKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9wcm94eS4kcmVzb2x2ZVZhcmlhYmxlcyh3b3Jrc3BhY2VGb2xkZXIudXJpLCB7IHByb2Nlc3M6IHRvUmVzb2x2ZS5wcm9jZXNzLCB2YXJpYWJsZXM6IHZhcnMgfSkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0XHRjb25zdCBwYXJ0aWFsbHlSZXNvbHZlZFZhcnMgPSBBcnJheS5mcm9tKE9iamVjdC52YWx1ZXModmFsdWVzLnZhcmlhYmxlcykpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxJUmVzb2x2ZWRWYXJpYWJsZXMgfCB1bmRlZmluZWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZVdpdGhJbnRlcmFjdGlvbih3b3Jrc3BhY2VGb2xkZXIsIHBhcnRpYWxseVJlc29sdmVkVmFycywgJ3Rhc2tzJywgdW5kZWZpbmVkLCB0YXJnZXQpLnRoZW4ocmVzb2x2ZWRWYXJzID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKCFyZXNvbHZlZFZhcnMpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQ6IElSZXNvbHZlZFZhcmlhYmxlcyA9IHtcblx0XHRcdFx0XHRcdFx0XHRwcm9jZXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0dmFyaWFibGVzOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGFydGlhbGx5UmVzb2x2ZWRWYXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdmFyaWFibGVOYW1lID0gdmFyc1tpXS5zdWJzdHJpbmcoMiwgdmFyc1tpXS5sZW5ndGggLSAxKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocmVzb2x2ZWRWYXJzICYmIHZhbHVlcy52YXJpYWJsZXNbdmFyc1tpXV0gPT09IHZhcnNbaV0pIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZWRWYXJzLmdldCh2YXJpYWJsZU5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnZhcmlhYmxlcy5zZXQodmFyaWFibGVOYW1lLCByZXNvbHZlZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlc3VsdC52YXJpYWJsZXMuc2V0KHZhcmlhYmxlTmFtZSwgcGFydGlhbGx5UmVzb2x2ZWRWYXJzW2ldKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlcy5wcm9jZXNzKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5wcm9jZXNzID0gdmFsdWVzLnByb2Nlc3M7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHRcdFx0fSwgcmVhc29uID0+IHtcblx0XHRcdFx0XHRcdFx0cmVqZWN0KHJlYXNvbik7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZEV4ZWN1dGFibGU6IChjb21tYW5kOiBzdHJpbmcsIGN3ZD86IHN0cmluZywgcGF0aHM/OiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kZmluZEV4ZWN1dGFibGUoY29tbWFuZCwgY3dkLCBwYXRocyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJTdXBwb3J0ZWRFeGVjdXRpb25zKGN1c3RvbT86IGJvb2xlYW4sIHNoZWxsPzogYm9vbGVhbiwgcHJvY2Vzcz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGFza1NlcnZpY2UucmVnaXN0ZXJTdXBwb3J0ZWRFeGVjdXRpb25zKGN1c3RvbSwgc2hlbGwsIHByb2Nlc3MpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksY0FBYztBQUUxQixTQUFTLGtCQUErQjtBQUV4QyxTQUFxQixnQ0FBa0Q7QUFFdkU7QUFBQSxFQUNDO0FBQUEsRUFBaUI7QUFBQSxFQUNLO0FBQUEsRUFBdUM7QUFBQSxFQUFhO0FBQUEsRUFBWTtBQUFBLEVBQ3RGO0FBQUEsRUFBd0U7QUFB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QUFPO0FBQUEsRUFDNUU7QUFFRDtBQTNVYSxpQkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVksY0FBYztBQUFBLEVBUzdDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVOyIsCiAgIm5hbWVzIjogWyJUYXNrRXhlY3V0aW9uRFRPIiwgIlRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWREdG8iLCAiVGFza1Byb2JsZW1NYXRjaGVyRW5kZWREdG8iLCAiVGFza1Byb2Nlc3NTdGFydGVkRFRPIiwgIlRhc2tQcm9jZXNzRW5kZWREVE8iLCAiVGFza0RlZmluaXRpb25EVE8iLCAiVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8iLCAiUnVuT3B0aW9uc0RUTyIsICJQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyIsICJQcm9jZXNzRXhlY3V0aW9uRFRPIiwgInZhbHVlIiwgIlNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTyIsICJTaGVsbEV4ZWN1dGlvbkRUTyIsICJDdXN0b21FeGVjdXRpb25EVE8iLCAiVGFza1NvdXJjZURUTyIsICJUYXNrSGFuZGxlRFRPIiwgIlRhc2tEVE8iLCAiVGFza0dyb3VwRFRPIiwgIlRhc2tGaWx0ZXJEVE8iXQp9Cg==
